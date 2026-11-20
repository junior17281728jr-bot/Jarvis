// Academia 0.14.77 (pedido del dueño: «abajo dos emojis si entendió o no la explicación, así el sistema también lo
// guarda; todo lo que aprenda el sistema va para todo»): «¿Lo entendiste? 👍 / 👎» debajo de cada explicación.
//
// Qué se vota (el servidor saca el id y la huella del texto; nunca los acepta del alumno):
//  - 'tarjeta'  una tarjeta de la clase (Test Guide u oral): { materia, tema, n } (n = 1, 2…).
//  - 'otra'     la «Otra forma de verlo» de una tarjeta: { materia, tema, n } → cuenta para la explicación guardada a la
//               que apunta (la misma que su «Explícamelo mejor»), así que se guarda como 'ia'.
//  - 'pregunta' la explicación del paquete después de un error: { pregunta } (la «sencilla», la del Test Guide y las ideas).
//  - 'oral'     una respuesta del libro del oral: { materia, tema, n } (n = la pregunta del libro en la clase).
//  - 'ia'       lo COMPARTIDO que escribió la IA: { clave } (solo «Explícamelo de otra forma», «Mini-clase IA»,
//               «Explícamelo mejor» y «Profundizar»: nunca algo de un alumno).
//
// Dónde se guarda (sin migración, en «ajustes»): academia.entendi.<tipo>.<id>.<huella> = { tipo, …dónde, h, u: { <id del
// alumno>: 1 (👍) | 0 (👎) }, en }. Un voto por alumno y por texto: votar otra vez lo cambia (y lo mismo dos veces no
// cambia nada). Si el texto cambia (la clase se reescribe, la IA escribe otra), la huella es otra: la cuenta empieza de
// cero en una fila nueva y la vieja queda tal cual (nada se borra ni se pisa). El id del alumno solo vive aquí, en el
// servidor, para contar distintos; nunca sale: ni a otro alumno, ni al administrador, ni en «Para Claude».
// El administrador (también «como estudiante») puede tocar los emojis, pero su voto no se guarda.
// Hasta TOPE_VOTANTES alumnos por texto (sobra para medir; la fila no crece sin fin).
import { createHash } from 'node:crypto';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { idTarjeta, huellaTarjeta } from './tarjeta-id.js';
import { leerGuardado } from './instructor-ia.js';

export const TIPOS_ENTENDI = Object.freeze(['tarjeta', 'otra', 'pregunta', 'oral', 'ia']);
export const VOTOS_ENTENDI = Object.freeze(['si', 'no']);
// Con menos de 5 votos de un texto no se dice nada (ni en el puntaje, ni en «Para Claude»).
export const MUESTRA_VOTOS = 5;
export const TOPE_VOTANTES = 1000;
export const PRE_ENTENDI = 'academia.entendi.';
export const CLAVE_IA_VOTO = /^academia\.ia\.(explica|miniclase|tarjeta|profundiza)\.([a-f0-9]{32})$/;
const ID = /^[a-z0-9_-]{1,60}$/;

const sha = t => createHash('sha256').update(String(t)).digest('hex');
const huella = v => sha(JSON.stringify(v)).slice(0, 16);
const iso = ms => new Date(ms).toISOString();
const json = t => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const leer = (db, clave) => json(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null');
const guardar = (db, clave, valor, ahora) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(ahora));

// Un tema del Test Guide o del oral (las dos pistas tienen tarjetas con «¿Lo entendiste?»).
export function temaCualquiera(p, materia, tema) {
  const de = lista => lista?.find(m => m.id === materia)?.temas?.find(t => t.id === tema) ?? null;
  return de(p?.materias) ?? de(p?.oral?.materias);
}
// Las huellas de cada texto (si el texto cambia, cambia la huella).
export const huellaPregunta = q => huella([q?.sencilla ?? null, q?.original?.explicacion ?? null, q?.errores ?? null]);
export const huellaOral = x => huella([x?.pregunta_en ?? '', x?.respuesta_en ?? '', x?.respuesta_es ?? null, x?.explicacion_es ?? null, x?.puntos_clave ?? []]);
// De lo guardado por la IA cuenta el texto y cuándo se escribió (no el costo ni el proveedor).
export function huellaIa(g) {
  if (!g || typeof g !== 'object') return null;
  const { costoMicro, proveedor, modelo, ...texto } = g;
  return huella(texto);
}
export const idPregunta = qid => sha(`pregunta|${qid}`).slice(0, 24);
export const idOral = (materia, tema, preguntaEn) => sha(`oral|${materia}|${tema}|${preguntaEn}`).slice(0, 24);

// Lo que se vota → { tipo, id, h, donde } (donde: lo que dice qué es, sin nada del alumno). 404 si no existe.
export function resolverItem(db, p, d = {}) {
  const tipo = String(d.tipo ?? '');
  if (!TIPOS_ENTENDI.includes(tipo)) throw new ErrorHttp(400, 'datos_no_validos');
  const noExiste = () => new ErrorHttp(404, 'no_existe');
  const deIa = (clave, extra = {}) => {
    const m = CLAVE_IA_VOTO.exec(String(clave ?? ''));
    if (!m) throw noExiste();
    const h = huellaIa(leerGuardado(db, clave));
    if (!h) throw noExiste();
    return { tipo: 'ia', id: `${m[1]}-${m[2]}`, h, donde: { sub: m[1], clave, ...extra } };
  };
  if (tipo === 'ia') return deIa(d.clave);
  if (!p) throw new ErrorHttp(409, 'sin_paquete');
  if (tipo === 'pregunta') {
    const qid = String(d.pregunta ?? '');
    const q = p.preguntas?.get(qid);
    if (!q) throw noExiste();
    const lugar = p.deTema?.get(qid) ?? {};
    return { tipo, id: idPregunta(qid), h: huellaPregunta(q), donde: { pregunta: qid, numero: q.original?.numero ?? null, materia: lugar.materia ?? null, tema: lugar.tema ?? null } };
  }
  const materia = String(d.materia ?? '');
  const temaId = String(d.tema ?? '');
  const n = Number(d.n);
  if (!ID.test(materia) || !ID.test(temaId) || !Number.isSafeInteger(n) || n < 1) throw new ErrorHttp(400, 'datos_no_validos');
  if (tipo === 'oral') {
    const t = p.oral?.materias?.find(m => m.id === materia)?.temas?.find(x => x.id === temaId);
    const x = t?.libro_qa?.[n - 1];
    if (!x) throw noExiste();
    return { tipo, id: idOral(materia, temaId, x.pregunta_en ?? ''), h: huellaOral(x), donde: { materia, tema: temaId, pregunta_en: String(x.pregunta_en ?? '').slice(0, 200), pagina: x.pagina ?? null, paquete: t.paquete ?? null } };
  }
  const t = temaCualquiera(p, materia, temaId);
  const s = t?.secciones?.[n - 1];
  if (!s || typeof s.titulo !== 'string') throw noExiste();
  const id = idTarjeta(materia, temaId, s.titulo);
  if (tipo === 'otra') {
    // La «Otra forma de verlo» que ve ahora (la misma regla que la clase: la huella de la tarjeta tiene que coincidir).
    const v = leer(db, `academia.clase.otra.${id}`);
    if (!v || v.h !== huellaTarjeta(s)) throw noExiste();
    return deIa(v.clave, { materia, tema: temaId, titulo: s.titulo.slice(0, 200), otra: true });
  }
  return { tipo: 'tarjeta', id, h: huellaTarjeta(s), donde: { materia, tema: temaId, titulo: s.titulo.slice(0, 200), paquete: t.paquete ?? null } };
}
export const claveVoto = item => `${PRE_ENTENDI}${item.tipo}.${item.id}.${item.h}`;

// El voto de un alumno. → { voto, guardado } (nunca la cuenta de los demás).
export function votar(db, p, usuario, datos, { ahora = Date.now() } = {}) {
  const voto = String(datos?.voto ?? '');
  if (!VOTOS_ENTENDI.includes(voto)) throw new ErrorHttp(400, 'datos_no_validos');
  const item = resolverItem(db, p, datos);
  if (!usuario || !Number.isSafeInteger(usuario.id)) throw new ErrorHttp(404, 'no_existe');
  if (usuario.rol === 'admin') return { voto, guardado: false };
  const clave = claveVoto(item);
  return enTransaccion(db, () => {
    const v = leer(db, clave) ?? { tipo: item.tipo, ...item.donde, h: item.h, u: {}, desde: iso(ahora) };
    if (!v.u || typeof v.u !== 'object') v.u = {};
    const k = String(usuario.id);
    if (!Object.hasOwn(v.u, k) && Object.keys(v.u).length >= TOPE_VOTANTES) return { voto, guardado: false };
    const valor = voto === 'si' ? 1 : 0;
    if (v.u[k] === valor) return { voto, guardado: true }; // lo mismo otra vez: no cambia nada
    v.u[k] = valor;
    v.en = iso(ahora);
    guardar(db, clave, v, ahora);
    return { voto, guardado: true };
  });
}

// ---------- Contar (solo lee) ----------
const adminsDe = db => new Set(db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").all().map(f => String(f.id)));
// v.u → { si, no, n } sin los administradores.
export function cuentaVotos(v, admins = new Set()) {
  let si = 0;
  let no = 0;
  for (const [k, x] of Object.entries(v?.u ?? {})) {
    if (admins.has(k)) continue;
    if (x === 1) si++;
    else if (x === 0) no++;
  }
  return { si, no, n: si + no };
}
export const pctNo = c => (c?.n ? Math.round((c.no * 100) / c.n) : null);
export const pctSi = c => (c?.n ? Math.round((c.si * 100) / c.n) : null);
// «Casi todos dicen 👎»: con la muestra mínima y más 👎 que 👍 (lo usa la promoción como veto).
export const vetoVotos = c => Boolean(c && c.n >= MUESTRA_VOTOS && c.no > c.si);

// Todas las filas, con su cuenta y si su texto sigue siendo el de ahora. Recorre las claves por rango (la clave
// primaria) y lee la huella actual de cada cosa. → [{ clave, tipo, id, h, donde, si, no, n, vigente, indice? }]
export function todosLosVotos(db, p) {
  const admins = adminsDe(db);
  const out = [];
  const guardadas = new Map();
  for (const f of db.prepare('SELECT clave, valor FROM ajustes WHERE clave > ? AND clave < ?').all(PRE_ENTENDI, `${PRE_ENTENDI}~`)) {
    const partes = f.clave.slice(PRE_ENTENDI.length).split('.');
    if (partes.length !== 3 || !TIPOS_ENTENDI.includes(partes[0])) continue;
    const [tipo, id, h] = partes;
    const v = json(f.valor);
    if (!v) continue;
    const c = cuentaVotos(v, admins);
    const { u, ...donde } = v;
    let vigente = false;
    let indice = null;
    if (tipo === 'tarjeta') {
      const t = temaCualquiera(p, v.materia, v.tema);
      indice = (t?.secciones ?? []).findIndex(s => s.titulo === v.titulo);
      vigente = indice >= 0 && huellaTarjeta(t.secciones[indice]) === h;
    } else if (tipo === 'pregunta') {
      vigente = Boolean(p?.preguntas?.get(v.pregunta)) && huellaPregunta(p.preguntas.get(v.pregunta)) === h;
    } else if (tipo === 'oral') {
      const t = p?.oral?.materias?.find(m => m.id === v.materia)?.temas?.find(x => x.id === v.tema);
      indice = (t?.libro_qa ?? []).findIndex(x => String(x.pregunta_en ?? '').slice(0, 200) === v.pregunta_en);
      vigente = indice >= 0 && huellaOral(t.libro_qa[indice]) === h;
    } else if (tipo === 'ia') {
      if (!guardadas.has(v.clave)) guardadas.set(v.clave, huellaIa(leerGuardado(db, v.clave)));
      vigente = guardadas.get(v.clave) === h;
    }
    out.push({ clave: f.clave, tipo, id, h, donde: { ...donde, h: undefined, desde: undefined, en: undefined }, ...c, vigente, indice: indice != null && indice >= 0 ? indice : null, en: v.en ?? null });
  }
  for (const x of out) { delete x.donde.h; delete x.donde.desde; delete x.donde.en; delete x.donde.tipo; }
  return out;
}
// Solo lo de ahora (el texto que ven hoy).
export const votosVigentes = (db, p) => todosLosVotos(db, p).filter(x => x.vigente);
// La cuenta de UNA explicación guardada por la IA (por su clave), del texto de ahora.
export function votosDeClave(db, clave) {
  const m = CLAVE_IA_VOTO.exec(String(clave ?? ''));
  const h = m ? huellaIa(leerGuardado(db, clave)) : null;
  if (!h) return { si: 0, no: 0, n: 0 };
  return cuentaVotos(leer(db, `${PRE_ENTENDI}ia.${m[1]}-${m[2]}.${h}`), adminsDe(db));
}
