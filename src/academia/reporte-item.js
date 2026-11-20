// Academia 0.14.85 (pedido del dueño: «todo debe tener un punto de soporte, todo el sistema; abajo, si tiene un error
// algo, le da y automático se manda qué sección tiene el error, y el alumno podrá decir cuál es y por qué; así el admin,
// si revisa, podrá ver e idea si es verdad o si es cosa del alumno»): QUÉ se reporta con «⚑ Reportar un error».
//
// El reporte sigue siendo un mensaje de ayuda 'error' (src/cuentas/soporte.js, sin migración); aquí se decide de qué
// cosa es (el «punto»), igual que «¿Lo entendiste?» (src/academia/entendi.js): la app manda SOLO dónde está (materia,
// tema y tarjeta; la pregunta; la clave de lo guardado por la IA…) y el servidor saca del paquete el texto tal cual lo vio
// el alumno, su huella y sus fuentes. Nunca se acepta el texto ni la respuesta del alumno desde la app:
//  - de una pregunta, la letra que eligió sale de SUS respuestas guardadas (academia_respuestas); sin responderla, el
//    reporte no lleva ninguna letra, y con un examen con reloj abierto que la tiene, no se puede reportar (409);
//  - de lo demás (escena 3D, situación, figura, video, clip, Biblioteca, voz, la app) solo ids cortos y un título.
// La clave del punto (tipo.id.huella) agrupa los reportes de varios alumnos sobre lo mismo; si el texto cambia, la huella
// es otra y lo de antes queda tal cual (nada se borra).
import { createHash } from 'node:crypto';
import { ErrorHttp } from '../nucleo/http.js';
import { resolverItem, temaCualquiera, idPregunta, MUESTRA_VOTOS } from './entendi.js';
import { leerGuardado } from './instructor-ia.js';
import { huellaTarjeta } from './tarjeta-id.js';
import { paginaDe } from './paquetes.js';
import { leerVivo, veredictoDe } from './oral-vivo.js';

import { QUE_REPORTE, QUE_CONTENIDO, PORQUE, sinDatosPersonales } from './reporte-que.js';
export { QUE_REPORTE, QUE_CONTENIDO, TEXTO_QUE, PORQUE, sinDatosPersonales } from './reporte-que.js';
// De qué puede ser (los del paquete se resuelven aquí; los demás llevan solo su id).
export const TIPOS_PAQUETE = Object.freeze(['tarjeta', 'otra', 'oral', 'ia', 'pregunta']);
export const TIPOS_SUELTOS = Object.freeze(['escena', 'situacion', 'figura', 'video', 'clip', 'biblioteca', 'voz', 'app']);
export const TIPOS_REPORTE = Object.freeze([...TIPOS_PAQUETE, ...TIPOS_SUELTOS]);
// Lo que lleva el reporte de una pregunta según cuándo se reporta.
export const MUESTRA_CONFUSO = MUESTRA_VOTOS;

const ID = /^[a-z0-9_-]{1,60}$/;
const ID_SUELTO = /^[A-Za-z0-9_./:#-]{1,120}$/;
const VISUAL = /^[a-z0-9_-]{1,40}$/;
const sha = t => createHash('sha256').update(String(t)).digest('hex');
const huella = v => sha(JSON.stringify(v)).slice(0, 16);
const linea = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const largo = (v, n) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);

// ¿Sirve lo que eligió y escribió? → null o la clave del error. El porqué: 10–1000 letras si es de contenido; si no,
// opcional (pero si escribe algo, hasta 1000).
export function problemaReporte({ que, porque }) {
  if (!QUE_REPORTE.includes(que)) return 'reporte_que';
  const p = String(porque ?? '').trim();
  if (p.length > PORQUE.maximo) return 'reporte_porque';
  if (QUE_CONTENIDO.includes(que) && p.length < PORQUE.minimo) return 'reporte_porque';
  return null;
}

// La huella de una pregunta tal cual se ve (enunciado, opciones, correcta y explicaciones).
export const huellaPreguntaVista = q => huella([q?.original?.enunciado ?? '', (q?.original?.opciones ?? []).map(o => [o.letra, o.texto]), q?.original?.correcta ?? '', q?.original?.explicacion ?? null, q?.sencilla ?? null]);
// De lo guardado por la IA: solo los textos (nunca el costo, el proveedor ni el modelo).
function textosIa(g) {
  if (!g || typeof g !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(g)) {
    if (['costoMicro', 'proveedor', 'modelo', 'en', 'usuarioId'].includes(k)) continue;
    if (typeof v === 'string' && v.trim()) out[k] = largo(v, 1500);
    else if (Array.isArray(v) && v.every(x => typeof x === 'string')) out[k] = v.slice(0, 8).map(x => largo(x, 300));
  }
  return Object.keys(out).length ? out : null;
}
const fuentesDe = lista => (Array.isArray(lista) ? lista : []).slice(0, 6).map(f => ({
  libro: linea(f?.libro, 80) || null, capitulo: linea(f?.capitulo, 120) || null, seccion: linea(f?.seccion, 120) || null, pagina: linea(f?.pagina, 20) || null,
})).filter(f => f.libro || f.pagina || f.seccion);
const datosPaquete = p => (p ? { id: p.id ?? null, ids: Array.isArray(p.ids) ? p.ids.slice(0, 10) : [], edicion: p.edicion ?? null } : null);

// La última respuesta del alumno a esa pregunta (la letra, si acertó y en qué intento) y si tiene un examen con reloj
// abierto que la lleva. Solo lee.
// intento: el que dice la app (si es SUYO y tiene esa pregunta, vale ese; si no, su última respuesta). Una respuesta en
// Modo reto se dio con OTRAS opciones: no lleva letra (reto: true). Las del oral están en academia_extra_respuestas.
export function respuestaDe(db, usuarioId, qid, ahora = Date.now(), { intento = null } = {}) {
  const sql = `SELECT r.elegida, r.correcta, r.intento_id AS intento, i.tipo, i.modo FROM academia_respuestas r JOIN academia_intentos i ON i.id = r.intento_id
    WHERE r.usuario_id = ? AND r.pregunta = ?`;
  const n = Number(intento);
  let f = Number.isSafeInteger(n) && n > 0 ? db.prepare(`${sql} AND r.intento_id = ? ORDER BY r.creada_en DESC, r.id DESC LIMIT 1`).get(usuarioId, qid, n) ?? null : null;
  if (!f) f = db.prepare(`${sql} ORDER BY r.creada_en DESC, r.id DESC LIMIT 1`).get(usuarioId, qid) ?? null;
  if (!f) f = db.prepare('SELECT elegida, correcta, NULL AS intento, nivel AS tipo, NULL AS modo FROM academia_extra_respuestas WHERE usuario_id = ? AND pregunta = ? ORDER BY creada_en DESC, id DESC LIMIT 1').get(usuarioId, qid) ?? null;
  // Un examen con reloj sin entregar (y con tiempo) que tiene esa pregunta: durante el examen no hay reportes de preguntas.
  let enExamen = false;
  for (const x of db.prepare("SELECT id, orden, empezado_en FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NULL").all(usuarioId)) {
    let orden = [];
    try { orden = JSON.parse(x.orden ?? '[]'); } catch { orden = []; }
    if (!Array.isArray(orden) || !orden.includes(qid)) continue;
    let e = null;
    try { e = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`academia.examen.${x.id}`)?.valor ?? 'null'); } catch { e = null; }
    if (!e || !Number.isFinite(Number(e.limiteMs))) continue; // un examen sin reloj (de antes) no cuenta
    if (ahora < Date.parse(x.empezado_en) + Number(e.limiteMs)) { enExamen = true; break; }
  }
  const reto = f?.modo === 'reto';
  return { respuesta: f ? { elegida: reto ? null : String(f.elegida ?? '').slice(0, 2) || null, acierto: f.correcta === 1, intento: f.intento, reto } : null, enExamen };
}

// item (lo que manda la app) → { tipo, clave, ref, vista, fuentes, paquete }. ref: dónde está (sin nada del alumno, salvo
// la letra que eligió en una pregunta, que va en vista). 400 / 404 / 409 si no sirve.
export function resolverReporte(db, p, usuario, item, { pantalla = null, ahora = Date.now() } = {}) {
  const d = item && typeof item === 'object' ? item : {};
  const tipo = String(d.tipo ?? 'app');
  if (!TIPOS_REPORTE.includes(tipo)) throw new ErrorHttp(400, 'datos_no_validos');
  const paquete = datosPaquete(p);
  if (tipo === 'pregunta') {
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const qid = String(d.pregunta ?? '');
    const q = p.preguntas?.get(qid) ?? p.oral?.preguntas?.get?.(qid) ?? null;
    if (!q?.original) throw new ErrorHttp(404, 'no_existe');
    const { respuesta, enExamen } = respuestaDe(db, usuario.id, qid, ahora, { intento: d.intento });
    if (enExamen) throw new ErrorHttp(409, 'reporte_en_examen');
    const lugar = p.deTema?.get(qid) ?? p.oral?.deTema?.get?.(qid) ?? {};
    const o = q.original;
    const h = huellaPreguntaVista(q);
    const pg = (() => { try { return paginaDe(p, qid); } catch { return null; } })();
    return {
      tipo, clave: `pregunta.${idPregunta(qid)}.${h}`,
      ref: { pregunta: qid, numero: o.numero ?? null, materia: lugar.materia ?? null, tema: lugar.tema ?? null, h },
      vista: {
        numero: o.numero ?? null, seccion: linea(o.seccion, 160) || null, enunciado: largo(o.enunciado, 1500),
        opciones: (o.opciones ?? []).slice(0, 6).map(x => ({ letra: linea(x.letra, 2), texto: largo(x.texto, 600) })),
        correcta: linea(o.correcta, 2), elegida: respuesta?.elegida ?? null, respondida: Boolean(respuesta), ...(respuesta?.reto ? { reto: true } : {}),
        explicacion: o.explicacion ? largo(o.explicacion, 2000) : null, sencilla: q.sencilla ? largo(q.sencilla, 1500) : null,
      },
      fuentes: [...(o.pagina ? [{ libro: 'Test Guide', capitulo: null, seccion: linea(o.seccion, 120) || null, pagina: linea(o.pagina, 20) }] : []),
        ...(pg ? [{ libro: linea(pg.libroTitulo, 80) || null, capitulo: null, seccion: null, pagina: linea(pg.pagina, 20) || null }] : [])],
      paquete,
    };
  }
  // 0.14.93: la CALIFICACIÓN de una respuesta de la «Práctica en vivo» del oral (vivo: { sesion, i }): de qué pregunta es
  // y lo que le dijo el calificador salen de SU práctica guardada (nunca de la app). Otro punto que el de la respuesta del
  // libro (la clave termina en «.nota»), con la clave de lo aprendido de esa pregunta (src/academia/oral-aprende.js).
  const nota = tipo === 'oral' && d.vivo != null ? notaVivo(db, usuario, d.vivo) : null;
  if (TIPOS_PAQUETE.includes(tipo)) {
    const r = resolverItem(db, p, nota ? { tipo, materia: nota.it.m, tema: nota.it.t, n: nota.it.i + 1 } : { tipo, materia: d.materia, tema: d.tema, n: d.n, clave: d.clave });
    const clave = `${r.tipo}.${r.id}.${r.h}${nota ? '.nota' : ''}`;
    if (tipo === 'tarjeta') {
      const t = temaCualquiera(p, r.donde.materia, r.donde.tema);
      const s = t.secciones[Number(d.n) - 1];
      const visual = VISUAL.test(String(d.visual ?? '')) ? d.visual : (s.visual?.tipo && VISUAL.test(String(s.visual.tipo)) ? s.visual.tipo : null);
      return {
        tipo, clave, ref: { materia: r.donde.materia, tema: r.donde.tema, n: Number(d.n), titulo: linea(s.titulo, 200), id: r.id, h: r.h, visual },
        vista: { temaTitulo: linea(t.titulo, 200), titulo: linea(s.titulo, 200), texto: largo(s.texto, 3000), puntos: (Array.isArray(s.puntos) ? s.puntos : []).slice(0, 12).map(x => largo(x, 400)), recuerda: s.recuerda ? largo(s.recuerda, 600) : null, ejemplo: s.ejemplo ? largo(s.ejemplo, 800) : null, visual },
        fuentes: fuentesDe(s.fuentes), paquete,
      };
    }
    if (tipo === 'oral') {
      const t = p.oral.materias.find(m => m.id === r.donde.materia).temas.find(x => x.id === r.donde.tema);
      const n = nota ? nota.it.i + 1 : Number(d.n);
      const x = t.libro_qa[n - 1];
      if (nota && sha(x.pregunta_en ?? '').slice(0, 16) !== nota.it.h) throw new ErrorHttp(404, 'no_existe'); // la pregunta cambió
      return {
        tipo, clave, ref: { materia: r.donde.materia, tema: r.donde.tema, n, id: r.id, h: r.h, ...(nota ? { nota: true, aprendido: `${nota.it.m}/${nota.it.t}#${nota.it.h}` } : {}) },
        vista: { temaTitulo: linea(t.titulo, 200), pregunta: largo(x.pregunta_en, 600), preguntaEs: x.pregunta_es ? largo(x.pregunta_es, 600) : null, respuesta: largo(x.respuesta_en, 2000), respuestaEs: x.respuesta_es ? largo(x.respuesta_es, 2000) : null, explicacion: x.explicacion_es ? largo(x.explicacion_es, 2000) : null, ...(nota ? { calificacion: nota.vista } : {}) },
        fuentes: x.pagina ? [{ libro: linea(t.libro ?? 'Libro', 80), capitulo: null, seccion: null, pagina: linea(x.pagina, 20) }] : [], paquete,
      };
    }
    // 'ia' (lo compartido que escribió la IA) y 'otra' («Otra forma de verlo»: también es de la IA).
    const g = textosIa(leerGuardado(db, r.donde.clave));
    return {
      tipo: r.donde.otra ? 'otra' : 'ia', clave, ref: { clave: r.donde.clave, sub: r.donde.sub ?? null, materia: r.donde.materia ?? null, tema: r.donde.tema ?? null, titulo: r.donde.titulo ?? null, id: r.id, h: r.h },
      vista: { titulo: r.donde.titulo ?? null, textos: g ?? {} }, fuentes: [], paquete,
    };
  }
  // Lo demás: solo su id (corto), dónde está y un título. La app no manda nada más.
  const ruta = linea(String(pantalla ?? '').split(/[?&]/)[0], 120) || null;
  const id = tipo === 'app' ? (ruta ?? 'app') : String(d.id ?? '');
  if (!ID_SUELTO.test(id)) throw new ErrorHttp(400, 'datos_no_validos');
  const materia = ID.test(String(d.materia ?? '')) ? d.materia : null;
  const tema = ID.test(String(d.tema ?? '')) ? d.tema : null;
  const n = Number.isSafeInteger(Number(d.n)) && Number(d.n) > 0 && Number(d.n) < 1000 ? Number(d.n) : null;
  const visual = VISUAL.test(String(d.visual ?? '')) ? d.visual : null;
  const titulo = linea(d.titulo, 160) || null;
  return {
    tipo, clave: `${tipo}.${sha(`${tipo}|${id}|${materia ?? ''}|${tema ?? ''}|${n ?? ''}`).slice(0, 24)}`,
    ref: { id, materia, tema, n, visual, titulo }, vista: { titulo, visual }, fuentes: [], paquete,
  };
}

// 0.14.93: la calificación de UNA respuesta de su práctica en vivo (la abierta o la última cerrada). 404 si no es suya o
// ya no está; 409 si todavía no está calificada. → { it, vista: lo que dijo y lo que le dijo el calificador }.
const parteVista = g => (g ? { texto: largo(g.texto, 1200) || null, veredicto: g.veredicto ?? null, linea: linea(g.linea, 200) || null, bienDicho: largo(g.bienDicho, 400) || null, falto: largo(g.falto, 400) || null, ia: g.ia === true, sistema: g.sistema === true, ...(g.aprendido === true ? { aprendido: true } : {}) } : null);
function notaVivo(db, usuario, vivo) {
  const sesion = String(vivo?.sesion ?? '');
  const i = Number(vivo?.i);
  const a = usuario ? leerVivo(db, usuario.id).abierta : null;
  if (!a || !/^[A-Za-z0-9_-]{1,40}$/.test(sesion) || a.id !== sesion || !Number.isSafeInteger(i) || !a.items?.[i]) throw new ErrorHttp(404, 'no_existe');
  const r = a.resp?.[i];
  if (!r?.primera?.veredicto) throw new ErrorHttp(409, 'todavia_no');
  return {
    it: a.items[i],
    vista: { veredicto: veredictoDe(r), primera: parteVista(r.primera), repregunta: r.primera.repregunta ? largo(r.primera.repregunta, 300) : null, seguimiento: parteVista(r.seguimiento?.veredicto ? r.seguimiento : null) },
  };
}

// ---------- Leer los reportes con punto (solo lee; para «Dónde más cuesta», «Para Claude» y los grupos) ----------
const json = t => { try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch { return null; } };
export function reportesConItem(db) {
  return db.prepare("SELECT valor FROM ajustes WHERE clave LIKE 'soporte.ticket.%'").all().map(f => json(f.valor))
    .filter(t => t && t.categoria === 'error' && t.reporte?.item?.clave && Number.isSafeInteger(t.usuarioId));
}
const adminsDe = db => new Set(db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").all().map(f => f.id));

// ¿El punto sigue siendo el texto de ahora? (la tarjeta por su título y su huella; la pregunta por su huella).
export function itemVigente(p, item) {
  const r = item?.ref ?? {};
  if (item?.tipo === 'tarjeta') {
    const t = temaCualquiera(p, r.materia, r.tema);
    const i = (t?.secciones ?? []).findIndex(s => s.titulo === r.titulo);
    return i >= 0 && huellaTarjeta(t.secciones[i]) === r.h ? { indice: i } : null;
  }
  if (item?.tipo === 'pregunta') {
    const q = p?.preguntas?.get(r.pregunta);
    return q && huellaPreguntaVista(q) === r.h ? { indice: null } : null;
  }
  return null;
}

// Por punto: los alumnos DISTINTOS (sin el administrador) que lo reportaron, y los que el administrador marcó «Sí, es
// un error» (error) o «No, es cosa del alumno» (confuso). → Map(clave → { item, alumnos:Set, error:Set, confuso:Set, reportes })
// Solo lo que aprende el sistema: puntos del PAQUETE (tarjeta, pregunta, oral, IA) y reportes de CONTENIDO (no «No carga»
// ni «Otro»); un «No carga» confirmado es un arreglo de la app, no del contenido.
export const TIPOS_APRENDE = Object.freeze(['tarjeta', 'pregunta', 'oral', 'ia', 'otra']);
export function puntosReportados(db) {
  const admins = adminsDe(db);
  const out = new Map();
  for (const t of reportesConItem(db)) {
    if (admins.has(t.usuarioId)) continue;
    if (!TIPOS_APRENDE.includes(t.reporte.item.tipo) || !QUE_CONTENIDO.includes(t.reporte.que)) continue;
    const k = t.reporte.item.clave;
    const g = out.get(k) ?? { item: t.reporte.item, alumnos: new Set(), error: new Set(), confuso: new Set(), dudoso: new Set(), reportes: [] };
    g.alumnos.add(t.usuarioId);
    const v = t.reporte.veredicto?.valor;
    if (v === 'si') g.error.add(t.usuarioId);
    else if (v === 'no') g.confuso.add(t.usuarioId);
    else if (v === 'dudoso') g.dudoso.add(t.usuarioId);
    g.reportes.push(t);
    out.set(k, g);
  }
  return out;
}

// Para «Dónde más cuesta»: solo lo del texto de ahora. → Map('materia/tema/índice' y 'materia/tema' → { error, confuso })
// con alumnos distintos. Un punto «cosa del alumno» solo cuenta como «confuso» (y con la muestra mínima, en el puntaje).
export function senalesReportes(db, p, dePregunta = new Map()) {
  const out = new Map();
  const sumar = (k, g) => {
    const x = out.get(k) ?? { error: new Set(), confuso: new Set() };
    for (const u of g.error) x.error.add(u);
    for (const u of g.confuso) x.confuso.add(u);
    out.set(k, x);
  };
  for (const g of puntosReportados(db).values()) {
    if (!g.error.size && !g.confuso.size) continue;
    const v = itemVigente(p, g.item);
    if (!v) continue;
    const r = g.item.ref;
    if (g.item.tipo === 'tarjeta') { sumar(`${r.materia}/${r.tema}/${v.indice}`, g); sumar(`${r.materia}/${r.tema}`, g); }
    else if (g.item.tipo === 'pregunta') {
      const d = dePregunta.get(r.pregunta);
      if (d) { sumar(`${d.materia}/${d.tema}`, g); if (d.indice >= 0) sumar(`${d.materia}/${d.tema}/${d.indice}`, g); }
      else if (r.materia && r.tema) sumar(`${r.materia}/${r.tema}`, g);
    }
  }
  return new Map([...out].map(([k, x]) => [k, { error: x.error.size, confuso: x.confuso.size }]));
}

// La referencia corta de un punto (la misma de «Para Claude»: tarjeta = materia/tema#n; pregunta = su id).
export function refCorta(item) {
  const r = item?.ref ?? {};
  if (item?.tipo === 'tarjeta' || item?.tipo === 'oral') return `${r.materia}/${r.tema}#${item.tipo === 'oral' ? 'libro' : ''}${r.n}`;
  if (item?.tipo === 'pregunta') return `pregunta=${r.pregunta}`;
  if (item?.tipo === 'ia' || item?.tipo === 'otra') return `ia=${r.clave}`;
  return `${item?.tipo ?? 'app'}=${r.id ?? '-'}`;
}

// Para «Para Claude»: los errores CONFIRMADOS por el administrador (lo primero de todo) y lo que muchos reportaron pero
// era «cosa del alumno» (la explicación confunde). Sin nombres ni ids de alumnos: solo cuántos y lo que escribieron.
export function paraClaudeReportes(db, p, { tope = 30 } = {}) {
  const confirmados = [];
  const confusos = [];
  for (const g of puntosReportados(db).values()) {
    const vigente = ['tarjeta', 'pregunta'].includes(g.item.tipo) ? Boolean(p && itemVigente(p, g.item)) : TIPOS_APRENDE.includes(g.item.tipo);
    if (!vigente) continue;
    const base = {
      tipo: g.item.tipo, ref: refCorta(g.item), id: g.item.ref?.id ?? (g.item.tipo === 'pregunta' ? g.item.ref.pregunta : null), huella: g.item.ref?.h ?? null,
      titulo: g.item.vista?.titulo ?? g.item.vista?.enunciado ?? null, paquete: g.item.paquete?.id ?? null, alumnos: g.alumnos.size,
    };
    if (g.error.size) {
      const razones = g.reportes.filter(t => t.reporte.veredicto?.valor === 'si').map(t => ({ que: t.reporte.que ?? 'otro', texto: linea(sinDatosPersonales(t.reporte.porque ?? t.mensajes?.[0]?.texto ?? ''), 300) }))
        .filter(x => x.texto).slice(0, 5);
      confirmados.push({ ...base, confirmaron: g.error.size, razones });
    } else if (g.confuso.size >= MUESTRA_CONFUSO) confusos.push({ ...base, confuso: g.confuso.size });
  }
  confirmados.sort((a, b) => b.confirmaron - a.confirmaron || b.alumnos - a.alumnos || a.ref.localeCompare(b.ref));
  confusos.sort((a, b) => b.confuso - a.confuso || a.ref.localeCompare(b.ref));
  return { confirmados: confirmados.slice(0, tope), confusos: confusos.slice(0, tope) };
}
