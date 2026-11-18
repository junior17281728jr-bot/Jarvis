// Academia 0.14.38 (pedido del dueño): «Competencia». Seis rondas de 20 preguntas (A/B/C) de cultura aeronáutica y de lo
// que todo piloto privado debe saber, LAS MISMAS para todos y UN SOLO intento por ronda (lo cuida el servidor):
//  - Las preguntas son contenido ORIGINAL escrito para la app (src/academia/competencia/ronda-N.json), no de un libro ni
//    del Test Guide. Nunca viajan a la pantalla con la respuesta: cada pregunta llega sola, y su clave, su explicación y
//    su chiste llegan solo DESPUÉS de responderla.
//  - Un intento por alumno y ronda (academia_compe_intentos, migración 11): «Empezar» dos veces, recargar o abrir en otro
//    teléfono devuelve el MISMO intento, en la pregunta que le toca (nunca vuelve a empezar ni a una pregunta anterior).
//  - El reloj (opcional, 45 s por pregunta por defecto; Administrador lo cambia o lo apaga) lo lleva el servidor:
//    servida_en se anota al mostrarla y recargar no lo reinicia. Pasado el tiempo (más unos segundos de gracia por la
//    red), la respuesta cuenta como mala.
//  - Desde el primer intento la ronda queda CONGELADA (su contenido se guarda en «ajustes»): ni un cambio del repositorio
//    ni una sugerencia de la IA aprobada después cambian una ronda que alguien ya jugó.
//  - La tabla de cada ronda y la general las ve todo el mundo, con los mismos alias que la carrera de Progreso
//    (src/academia/carrera.js): sin «Mostrar nombres» o con «Perfil privado», «Piloto N». Nunca el id ni el usuario. El
//    administrador ve los nombres.
//  - Lo que falló va a «Mi repaso» («Lo que fallaste en la competencia»). Nada de esto toca el Test Guide: ni el % de
//    avance, ni la racha, ni las fallas, ni los certificados del curso leen estas tablas.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { nombrador } from './carrera.js';
import { nuevoCodigo, nombreDe } from './certificados.js';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'competencia');
export const RONDAS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const LETRAS = Object.freeze(['A', 'B', 'C']);
export const DIBUJOS = Object.freeze(['biplano', 'avioneta', 'globo', 'bimotor', 'cohete', 'supersonico', 'helicoptero', 'torre', 'instrumento',
  'gigante', 'hidroavion', 'jumbo', 'planeador', 'pista', 'dirigible', 'nube', 'brujula']);
// El reloj por pregunta: 45 s por defecto; 0 = sin reloj; si no, de 20 a 120 s. La gracia cubre la red lenta.
export const RELOJ = Object.freeze({ defecto: 45, minimo: 20, maximo: 120, graciaS: 8 });
// Lo que la IA puede cambiar de una pregunta (nunca las opciones ni la correcta).
export const CAMPOS_IA = Object.freeze(['pregunta', 'explicacion', 'bien', 'mal']);
export const LARGO = Object.freeze({ pregunta: 220, explicacion: 260, bien: 140, mal: 140, comentario: 200, frase: 240 });
export const EMOJIS = Object.freeze(['👏', '😂', '🔥', '✈️']);
// Las bandas de la frase del certificado (sobre 20; con otro total, por proporción).
export const BANDAS = Object.freeze([['perfecto', 20], ['alto', 17], ['medio', 13], ['bajo', 9], ['muy_bajo', 0]]);
export const VARIANTES_FRASE = 3;

const json = t => { try { return JSON.parse(t ?? 'null'); } catch { return null; } };
const iso = ms => new Date(ms).toISOString();
const claveCongelada = n => `academia.compe.congelada.${n}`;
const claveCambios = n => `academia.compe.cambios.${n}`;
export const claveSugerencia = n => `academia.compe.sugerencia.${n}`;
const claveReloj = 'academia.compe.reloj';
export const claveCertCompe = (n, id) => `academia.certificado.compe${n}.${Number(id)}`;
const claveCodigo = codigo => `academia.certificado_codigo.${codigo}`;
const claveSilencio = id => `academia.compe.silenciado.${Number(id)}`;

// ---------- El contenido ----------
function leerSemilla(n) {
  const r = JSON.parse(readFileSync(join(CARPETA, `ronda-${n}.json`), 'utf8'));
  return Object.freeze({ ronda: n, titulo: r.titulo, lema: r.lema, preguntas: Object.freeze(r.preguntas.map(q => Object.freeze({ ...q, opciones: Object.freeze({ ...q.opciones }) }))) });
}
export const SEMILLA = Object.freeze(Object.fromEntries(RONDAS.map(n => [n, leerSemilla(n)])));

export function numeroRonda(valor) {
  const n = Number(valor);
  if (!RONDAS.includes(n)) throw new ErrorHttp(404, 'no_existe');
  return n;
}
export const huellaDe = ronda => createHash('sha256').update(JSON.stringify(ronda.preguntas)).digest('hex').slice(0, 16);

// Con los cambios aprobados (de la IA) encima de la semilla: solo los campos permitidos y con su tope.
function conCambios(semilla, cambios) {
  if (!cambios || typeof cambios !== 'object') return semilla;
  return { ...semilla, preguntas: semilla.preguntas.map(q => {
    const c = cambios[q.id];
    if (!c || typeof c !== 'object') return q;
    const nuevo = { ...q };
    for (const campo of CAMPOS_IA) if (typeof c[campo] === 'string' && c[campo].trim()) nuevo[campo] = c[campo].trim().slice(0, LARGO[campo]);
    return nuevo;
  }) };
}
// La ronda como se juega: la congelada (si alguien ya la empezó) o la semilla con los cambios aprobados.
export function rondaEfectiva(db, n) {
  const congelada = json(leerAjuste(db, claveCongelada(n)));
  if (congelada && Array.isArray(congelada.preguntas) && congelada.preguntas.length) return congelada;
  return conCambios(SEMILLA[n], json(leerAjuste(db, claveCambios(n))));
}
export const rondaJugada = (db, n) => leerAjuste(db, claveCongelada(n)) != null
  || db.prepare('SELECT 1 FROM academia_compe_intentos WHERE ronda = ? LIMIT 1').get(n) != null;

const preguntaPublica = (q, numero, total) => ({ id: q.id, numero, total, pregunta: q.pregunta, opciones: { ...q.opciones }, dibujo: DIBUJOS.includes(q.dibujo) ? q.dibujo : null });

// ---------- El reloj ----------
export function relojCompe(db) {
  const v = leerAjuste(db, claveReloj);
  if (v == null) return RELOJ.defecto;
  const n = Number(v);
  return n === 0 || (Number.isSafeInteger(n) && n >= RELOJ.minimo && n <= RELOJ.maximo) ? n : RELOJ.defecto;
}
export function guardarRelojCompe(db, segundos) {
  const n = Number(segundos);
  if (!(n === 0 || (Number.isSafeInteger(n) && n >= RELOJ.minimo && n <= RELOJ.maximo))) throw new ErrorHttp(400, 'datos_no_validos');
  guardarAjuste(db, claveReloj, String(n));
  return n;
}

// ---------- Jugar ----------
const intentoDe = (db, usuarioId, n) => db.prepare('SELECT * FROM academia_compe_intentos WHERE usuario_id = ? AND ronda = ? ORDER BY id LIMIT 1').get(usuarioId, n) ?? null;
const respuestasDe = (db, intentoId) => db.prepare('SELECT orden, pregunta, elegida, correcta, a_tiempo AS aTiempo FROM academia_compe_respuestas WHERE intento_id = ? ORDER BY orden').all(intentoId);

function quedanMs(intento, segundos, ahoraMs) {
  if (!segundos || !intento.servida_en) return null;
  return Math.max(0, Date.parse(intento.servida_en) + segundos * 1000 - ahoraMs);
}

// Lo que ve el alumno de una ronda. estado: 'nueva' | 'jugando' | 'terminada'.
// servir: mostrarle la pregunta que le toca (se anota servida_en, si no estaba: desde ahí corre su reloj). Sin servir, de
// la pregunta solo va su número (la portada).
export function estadoRonda(db, usuarioId, n, ahoraMs = Date.now(), { servir = false } = {}) {
  const ronda = rondaEfectiva(db, n);
  const base = { ronda: n, titulo: ronda.titulo, lema: ronda.lema, total: ronda.preguntas.length, reloj: relojCompe(db) };
  const intento = intentoDe(db, usuarioId, n);
  if (!intento) return { ...base, estado: 'nueva' };
  const total = intento.total;
  if (intento.terminado_en) {
    const malas = respuestasDe(db, intento.id).filter(r => !r.correcta).length;
    return { ...base, estado: 'terminada', resultado: { aciertos: intento.aciertos, total, malas, segundos: intento.segundos, terminado: intento.terminado_en } };
  }
  const q = ronda.preguntas[intento.actual];
  if (!intento.servida_en) {
    if (!servir) return { ...base, estado: 'jugando', aciertos: intento.aciertos, actual: { numero: intento.actual + 1, total } };
    db.prepare('UPDATE academia_compe_intentos SET servida_en = ? WHERE id = ? AND servida_en IS NULL').run(iso(ahoraMs), intento.id);
    intento.servida_en = iso(ahoraMs);
  }
  return { ...base, estado: 'jugando', aciertos: intento.aciertos, actual: { ...preguntaPublica(q, intento.actual + 1, total), quedanMs: quedanMs(intento, base.reloj, ahoraMs) } };
}

// «Empezar»: crea el ÚNICO intento (o devuelve el que ya tiene, tal cual: nunca vuelve a empezar).
export function empezarRonda(db, usuarioId, n, ahoraMs = Date.now()) {
  enTransaccion(db, () => {
    if (intentoDe(db, usuarioId, n)) return;
    let ronda = json(leerAjuste(db, claveCongelada(n)));
    if (!ronda) {
      ronda = rondaEfectiva(db, n);
      guardarAjuste(db, claveCongelada(n), JSON.stringify({ ...ronda, huella: huellaDe(ronda), congelada: iso(ahoraMs) }));
    }
    db.prepare('INSERT INTO academia_compe_intentos (usuario_id, ronda, huella, total, actual, aciertos, segundos, servida_en, empezado_en) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)')
      .run(usuarioId, n, huellaDe(ronda), ronda.preguntas.length, iso(ahoraMs), iso(ahoraMs));
  });
  return estadoRonda(db, usuarioId, n, ahoraMs);
}

// Responder LA pregunta que le toca. elegida: 'A' | 'B' | 'C' | null (se le acabó el tiempo).
export function responderRonda(db, usuarioId, n, { pregunta, elegida }, ahoraMs = Date.now()) {
  if (elegida != null && !LETRAS.includes(elegida)) throw new ErrorHttp(400, 'datos_no_validos');
  const segundosReloj = relojCompe(db);
  const r = enTransaccion(db, () => {
    const intento = intentoDe(db, usuarioId, n);
    if (!intento) throw new ErrorHttp(409, 'ronda_sin_empezar');
    if (intento.terminado_en) throw new ErrorHttp(409, 'ronda_terminada');
    const ronda = rondaEfectiva(db, n);
    const q = ronda.preguntas[intento.actual];
    // Solo la que ya se le mostró (servida_en): nadie responde una pregunta que no ha visto (ni adivinando su id).
    if (!q || pregunta !== q.id || !intento.servida_en) throw new ErrorHttp(409, 'pregunta_no_es_la_actual');
    const pasadoMs = Math.max(0, ahoraMs - Date.parse(intento.servida_en));
    const aTiempo = !segundosReloj || pasadoMs <= (segundosReloj + RELOJ.graciaS) * 1000;
    const correcta = aTiempo && elegida === q.correcta;
    const segundos = Math.round(Math.min(pasadoMs, (segundosReloj || 300) * 1000) / 1000);
    db.prepare('INSERT INTO academia_compe_respuestas (intento_id, usuario_id, ronda, orden, pregunta, elegida, correcta, a_tiempo, segundos, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(intento.id, usuarioId, n, intento.actual, q.id, aTiempo ? elegida : null, correcta ? 1 : 0, aTiempo ? 1 : 0, segundos, iso(ahoraMs));
    const actual = intento.actual + 1;
    const aciertos = intento.aciertos + (correcta ? 1 : 0);
    const terminada = actual >= intento.total;
    // La siguiente todavía no se sirve: su reloj empieza cuando la pida (después de leer la explicación).
    db.prepare('UPDATE academia_compe_intentos SET actual = ?, aciertos = ?, segundos = segundos + ?, servida_en = NULL, terminado_en = ? WHERE id = ?')
      .run(actual, aciertos, segundos, terminada ? iso(ahoraMs) : null, intento.id);
    return { correcta, aTiempo, elegida: aTiempo ? elegida : null, buena: q.correcta, explicacion: q.explicacion, humor: correcta ? q.bien : q.mal, aciertos, numero: actual, total: intento.total, terminada };
  });
  return r;
}

// ---------- Las tablas (con los alias de la carrera) ----------
const MEDALLAS = ['oro', 'plata', 'bronce'];
function conPuestos(filas, clave) {
  let puesto = 0;
  let antes = null;
  return filas.map((f, i) => {
    const k = clave(f);
    if (k !== antes) { puesto = i + 1; antes = k; }
    return { ...f, puesto, medalla: puesto <= 3 ? MEDALLAS[puesto - 1] : null };
  });
}
const activos = 'u.eliminado_en IS NULL AND u.activo = 1';
export function tablaRonda(db, n, { yoId = null, admin = false } = {}) {
  const nombre = nombrador(db, { yoId, admin });
  const filas = db.prepare(`SELECT i.usuario_id AS id, i.aciertos, i.total, i.segundos, i.terminado_en AS en FROM academia_compe_intentos i JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.ronda = ? AND i.terminado_en IS NOT NULL AND ${activos} ORDER BY i.aciertos DESC, i.segundos ASC, i.terminado_en ASC, i.id ASC`).all(n);
  return conPuestos(filas, f => `${f.aciertos}/${f.segundos}`).map(f => ({
    puesto: f.puesto, medalla: f.medalla, nombre: nombre(f.id), aciertos: f.aciertos, total: f.total, segundos: f.segundos, esYo: f.id === yoId, ...(admin ? { usuarioId: f.id } : {}),
  }));
}
export function tablaGeneral(db, { yoId = null, admin = false } = {}) {
  const nombre = nombrador(db, { yoId, admin });
  const filas = db.prepare(`SELECT i.usuario_id AS id, SUM(i.aciertos) AS aciertos, SUM(i.total) AS total, COUNT(*) AS rondas, SUM(i.segundos) AS segundos
    FROM academia_compe_intentos i JOIN usuarios u ON u.id = i.usuario_id WHERE i.terminado_en IS NOT NULL AND ${activos}
    GROUP BY i.usuario_id ORDER BY aciertos DESC, segundos ASC, i.usuario_id ASC`).all();
  return conPuestos(filas, f => `${f.aciertos}/${f.segundos}`).map(f => ({
    puesto: f.puesto, medalla: f.medalla, nombre: nombre(f.id), aciertos: f.aciertos, total: f.total, rondas: f.rondas, segundos: f.segundos, esYo: f.id === yoId, ...(admin ? { usuarioId: f.id } : {}),
  }));
}

// La portada: las 6 rondas con lo suyo y la tabla general.
export function resumenCompetencia(db, usuarioId, ahoraMs = Date.now(), { admin = false } = {}) {
  const rondas = RONDAS.map(n => {
    const e = estadoRonda(db, usuarioId, n, ahoraMs);
    const jugadores = db.prepare('SELECT COUNT(*) AS n FROM academia_compe_intentos WHERE ronda = ? AND terminado_en IS NOT NULL').get(n).n;
    const puesto = e.estado === 'terminada' ? tablaRonda(db, n, { yoId: usuarioId }).find(f => f.esYo)?.puesto ?? null : null;
    return { ronda: n, titulo: e.titulo, lema: e.lema, total: e.total, estado: e.estado, resultado: e.resultado ?? null, numero: e.actual?.numero ?? null, jugadores, puesto };
  });
  return { rondas, reloj: relojCompe(db), general: tablaGeneral(db, { yoId: usuarioId, admin }) };
}

// ---------- «Mi repaso»: lo que falló ----------
export function falladas(db, usuarioId) {
  const filas = db.prepare(`SELECT r.ronda, r.pregunta, r.elegida, r.a_tiempo AS aTiempo, r.creada_en AS en FROM academia_compe_respuestas r
    WHERE r.usuario_id = ? AND r.correcta = 0 ORDER BY r.ronda, r.orden`).all(usuarioId);
  const cache = new Map();
  const salida = [];
  for (const f of filas) {
    if (!cache.has(f.ronda)) cache.set(f.ronda, new Map(rondaEfectiva(db, f.ronda).preguntas.map(q => [q.id, q])));
    const q = cache.get(f.ronda).get(f.pregunta);
    if (!q) continue;
    salida.push({ ronda: f.ronda, id: q.id, pregunta: q.pregunta, opciones: { ...q.opciones }, buena: q.correcta, elegida: f.elegida, aTiempo: f.aTiempo === 1, explicacion: q.explicacion, dibujo: q.dibujo ?? null });
  }
  return salida;
}

// ---------- El certificado de cada ronda ----------
export function bandaDe(aciertos, total = 20) {
  const sobre20 = total > 0 ? Math.round((aciertos * 20) / total) : 0;
  return BANDAS.find(([, desde]) => sobre20 >= desde)[0];
}
// La variante de la frase (sin azar: siempre la misma para lo mismo).
export const varianteFrase = (usuarioId, n) => ((Number(usuarioId) * 7 + n * 3) % VARIANTES_FRASE) + 1;
function certGuardado(db, n, usuarioId) {
  const v = json(leerAjuste(db, claveCertCompe(n, usuarioId)));
  return v && typeof v.codigo === 'string' && v.ronda === n ? v : null;
}
// Se emite UNA vez, al terminar la ronda (la primera vez que se mira terminada). Nunca cambia (salvo la frase de la IA,
// que se agrega una vez si llega).
export function certificadoRonda(db, usuarioId, n, { ahoraMs = Date.now(), azar = randomBytes } = {}) {
  const ya = certGuardado(db, n, usuarioId);
  if (ya) return ya;
  const intento = intentoDe(db, usuarioId, n);
  if (!intento?.terminado_en) return null;
  return enTransaccion(db, () => {
    const otra = certGuardado(db, n, usuarioId);
    if (otra) return otra;
    let codigo = nuevoCodigo(`compe${n}`, azar);
    for (let k = 0; leerAjuste(db, claveCodigo(codigo)) != null; k++) {
      if (k > 20) throw new ErrorHttp(500, 'error_interno');
      codigo = nuevoCodigo(`compe${n}`, azar);
    }
    const cert = { codigo, curso: 'compe', ronda: n, usuarioId: Number(usuarioId), aciertos: intento.aciertos, total: intento.total, banda: bandaDe(intento.aciertos, intento.total),
      variante: varianteFrase(usuarioId, n), fecha: intento.terminado_en, emitido: iso(ahoraMs), frase: null, iaPedida: null };
    guardarAjuste(db, claveCodigo(codigo), JSON.stringify({ usuarioId: Number(usuarioId), curso: `compe${n}` }));
    guardarAjuste(db, claveCertCompe(n, usuarioId), JSON.stringify(cert));
    return cert;
  });
}
export function anotarIaPedida(db, n, usuarioId, ahoraMs = Date.now()) {
  const c = certGuardado(db, n, usuarioId);
  if (c) guardarAjuste(db, claveCertCompe(n, usuarioId), JSON.stringify({ ...c, iaPedida: iso(ahoraMs) }));
}
const paraVer = (c, nombre) => ({ codigo: c.codigo, curso: 'compe', ronda: c.ronda, titulo: SEMILLA[c.ronda].titulo, aciertos: c.aciertos, total: c.total, banda: c.banda, variante: c.variante, fecha: c.fecha, frase: c.frase ?? null, nombre });
// Los suyos (con su nombre del perfil, como los otros certificados).
export function misCertificadosCompe(db, usuarioId, opciones = {}) {
  const nombre = nombreDe(db, usuarioId);
  return RONDAS.map(n => certificadoRonda(db, usuarioId, n, opciones)).filter(Boolean).map(c => paraVer(c, nombre));
}
export function certificadoParaVerificar(db, ref) {
  const n = Number(String(ref?.curso ?? '').slice(5));
  if (!/^compe[1-6]$/.test(String(ref?.curso)) || !RONDAS.includes(n)) return null;
  return certGuardado(db, n, ref.usuarioId);
}

// ---------- La galería de certificados de una ronda (todos ven los de todos), con reacciones y comentarios ----------
export function galeria(db, n, { yoId = null, admin = false, ahoraMs = Date.now() } = {}) {
  const nombre = nombrador(db, { yoId, admin });
  const filas = db.prepare(`SELECT i.usuario_id AS id FROM academia_compe_intentos i JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.ronda = ? AND i.terminado_en IS NOT NULL AND ${activos} ORDER BY i.terminado_en DESC, i.id DESC`).all(n);
  const reacciones = db.prepare('SELECT dueno_id AS dueno, usuario_id AS usuario, emoji FROM academia_compe_reacciones WHERE ronda = ? AND quitada_en IS NULL').all(n);
  const comentarios = db.prepare(`SELECT c.id, c.dueno_id AS dueno, c.usuario_id AS usuario, c.texto, c.creado_en AS en FROM academia_compe_comentarios c JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.ronda = ? AND c.borrado_en IS NULL AND ${activos} ORDER BY c.id`).all(n);
  const certificados = filas.map(f => {
    const c = certificadoRonda(db, f.id, n, { ahoraMs });
    if (!c) return null;
    const mias = reacciones.filter(r => r.dueno === f.id);
    const cuenta = Object.fromEntries(EMOJIS.map(e => [e, mias.filter(r => r.emoji === e).length]));
    return {
      ...paraVer(c, nombre(f.id)), esYo: f.id === yoId, ...(admin ? { usuarioId: f.id } : {}),
      // La clave de la tarjeta (no es el id de la cuenta): el código del certificado.
      reacciones: cuenta, mias: mias.filter(r => r.usuario === yoId).map(r => r.emoji),
      comentarios: comentarios.filter(x => x.dueno === f.id).map(x => ({ id: x.id, nombre: nombre(x.usuario), texto: x.texto, en: x.en, esYo: x.usuario === yoId, ...(admin ? { usuarioId: x.usuario, silenciado: silenciado(db, x.usuario) } : {}) })),
    };
  }).filter(Boolean);
  return { ronda: n, titulo: SEMILLA[n].titulo, certificados, silenciado: yoId != null && silenciado(db, yoId) };
}
function duenoDeCodigo(db, n, codigo) {
  const ref = json(leerAjuste(db, claveCodigo(String(codigo ?? '').toUpperCase().slice(0, 20))));
  const c = ref && ref.curso === `compe${n}` ? certGuardado(db, n, ref.usuarioId) : null;
  if (!c || c.codigo !== String(codigo).toUpperCase()) throw new ErrorHttp(404, 'no_existe');
  return Number(ref.usuarioId);
}
export const silenciado = (db, usuarioId) => leerAjuste(db, claveSilencio(usuarioId)) === '1';
export function silenciar(db, usuarioId, si) {
  if (typeof si !== 'boolean' || !Number.isSafeInteger(Number(usuarioId))) throw new ErrorHttp(400, 'datos_no_validos');
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(Number(usuarioId))) throw new ErrorHttp(404, 'no_existe');
  guardarAjuste(db, claveSilencio(usuarioId), si ? '1' : '0');
  return si;
}
// Reaccionar (o quitar la reacción, si ya la tenía).
export function reaccionar(db, usuarioId, n, codigo, emoji, ahoraMs = Date.now()) {
  if (!EMOJIS.includes(emoji)) throw new ErrorHttp(400, 'datos_no_validos');
  const dueno = duenoDeCodigo(db, n, codigo);
  return enTransaccion(db, () => {
    const ya = db.prepare('SELECT id FROM academia_compe_reacciones WHERE ronda = ? AND dueno_id = ? AND usuario_id = ? AND emoji = ? AND quitada_en IS NULL').get(n, dueno, usuarioId, emoji);
    if (ya) db.prepare('UPDATE academia_compe_reacciones SET quitada_en = ? WHERE id = ?').run(iso(ahoraMs), ya.id);
    else db.prepare('INSERT INTO academia_compe_reacciones (ronda, dueno_id, usuario_id, emoji, creada_en) VALUES (?, ?, ?, ?, ?)').run(n, dueno, usuarioId, emoji, iso(ahoraMs));
    return { puesta: !ya };
  });
}
// Sin enlaces (ni «www.», ni algo con forma de dominio): un comentario corto entre compañeros.
const ENLACE = /(?:https?:|ftp:|www\.|\b[a-z0-9-]+\.(?:com|net|org|do|io|app|ly|me|co|info|xyz|gg|tv|link|site|es|us)\b|@[a-z0-9_]{3,})/i;
export function limpiarComentario(texto) {
  const t = String(texto ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || [...t].length > LARGO.comentario) throw new ErrorHttp(400, 'comentario_no_valido');
  if (ENLACE.test(t)) throw new ErrorHttp(400, 'sin_enlaces');
  return t;
}
export function comentar(db, usuarioId, n, codigo, texto, ahoraMs = Date.now()) {
  if (silenciado(db, usuarioId)) throw new ErrorHttp(403, 'silenciado');
  const limpio = limpiarComentario(texto);
  const dueno = duenoDeCodigo(db, n, codigo);
  const r = db.prepare('INSERT INTO academia_compe_comentarios (ronda, dueno_id, usuario_id, texto, creado_en) VALUES (?, ?, ?, ?, ?)').run(n, dueno, usuarioId, limpio, iso(ahoraMs));
  return { id: Number(r.lastInsertRowid) };
}
// Borrar: el administrador (cualquiera) o quien lo escribió (el suyo). Solo se marca; nunca se borra la fila.
export function borrarComentario(db, id, { usuarioId, admin = false }, ahoraMs = Date.now()) {
  const c = db.prepare('SELECT id, usuario_id, borrado_en FROM academia_compe_comentarios WHERE id = ?').get(Number(id));
  if (!c) throw new ErrorHttp(404, 'no_existe');
  if (!admin && c.usuario_id !== usuarioId) throw new ErrorHttp(403, 'solo_admin');
  if (!c.borrado_en) db.prepare('UPDATE academia_compe_comentarios SET borrado_en = ?, borrado_por = ? WHERE id = ?').run(iso(ahoraMs), usuarioId, c.id);
  return { borrado: true };
}

// ---------- Administrador ----------
// El último «Mejorar preguntas con IA» de una ronda: si la IA no respondió (el proveedor falló, sin crédito…), la
// pantalla lo dice con su motivo y la ronda sigue igual.
const clavePedidoMejora = n => `academia.compe.mejora_pedida.${n}`;
export function anotarPedidoMejora(db, n, tarea, ahoraMs = Date.now()) {
  guardarAjuste(db, clavePedidoMejora(n), JSON.stringify({ tarea: Number(tarea), en: iso(ahoraMs) }));
}
function pedidoMejora(db, n, sugerencia) {
  const p = json(leerAjuste(db, clavePedidoMejora(n)));
  if (!p || !Number.isSafeInteger(p.tarea)) return null;
  if (sugerencia?.en && sugerencia.en >= p.en) return null;
  const t = db.prepare('SELECT estado, resultado FROM tareas WHERE id = ?').get(p.tarea);
  if (!t || ['lista', 'en_curso'].includes(t.estado)) return { estado: 'pendiente', en: p.en };
  const motivo = json(t.resultado)?.motivo;
  return { estado: 'no', motivo: typeof motivo === 'string' && /^[a-z_]{1,40}$/.test(motivo) ? motivo : 'no_disponible', en: p.en };
}
export function resumenAdmin(db) {
  return {
    reloj: relojCompe(db),
    rondas: RONDAS.map(n => {
      const r = rondaEfectiva(db, n);
      const sugerencia = json(leerAjuste(db, claveSugerencia(n)));
      return {
        ronda: n, titulo: r.titulo, jugada: rondaJugada(db, n), jugadores: db.prepare('SELECT COUNT(*) AS n FROM academia_compe_intentos WHERE ronda = ?').get(n).n,
        terminados: db.prepare('SELECT COUNT(*) AS n FROM academia_compe_intentos WHERE ronda = ? AND terminado_en IS NOT NULL').get(n).n,
        cambios: Object.keys(json(leerAjuste(db, claveCambios(n))) ?? {}).length,
        pedido: pedidoMejora(db, n, sugerencia),
        sugerencia: sugerencia && Array.isArray(sugerencia.cambios) ? { en: sugerencia.en ?? null, estado: sugerencia.estado ?? 'lista', cambios: sugerencia.cambios.map(c => ({ ...c, antes: Object.fromEntries(CAMPOS_IA.filter(k => c[k] != null).map(k => [k, r.preguntas.find(q => q.id === c.id)?.[k] ?? ''])) })) } : null,
        tabla: tablaRonda(db, n, { admin: true }),
      };
    }),
    general: tablaGeneral(db, { admin: true }),
  };
}
// Aprobar lo que sugirió la IA (todo o algunas preguntas). Nunca en una ronda que alguien ya empezó.
export function aprobarSugerencia(db, n, ids = null, ahoraMs = Date.now()) {
  return enTransaccion(db, () => {
    if (rondaJugada(db, n)) throw new ErrorHttp(409, 'ronda_ya_jugada');
    const s = json(leerAjuste(db, claveSugerencia(n)));
    if (!s || !Array.isArray(s.cambios) || !s.cambios.length) throw new ErrorHttp(409, 'sin_sugerencia');
    const elegidos = s.cambios.filter(c => !Array.isArray(ids) || ids.includes(c.id));
    const cambios = json(leerAjuste(db, claveCambios(n))) ?? {};
    const validos = new Set(SEMILLA[n].preguntas.map(q => q.id));
    let n2 = 0;
    for (const c of elegidos) {
      if (!validos.has(c.id)) continue;
      const limpio = {};
      for (const k of CAMPOS_IA) if (typeof c[k] === 'string' && c[k].trim()) limpio[k] = c[k].trim().slice(0, LARGO[k]);
      if (Object.keys(limpio).length) { cambios[c.id] = { ...(cambios[c.id] ?? {}), ...limpio }; n2++; }
    }
    guardarAjuste(db, claveCambios(n), JSON.stringify(cambios));
    guardarAjuste(db, claveSugerencia(n), JSON.stringify({ ...s, estado: 'aprobada', aprobada: iso(ahoraMs) }));
    return { aplicados: n2 };
  });
}
export function descartarSugerencia(db, n, ahoraMs = Date.now()) {
  const s = json(leerAjuste(db, claveSugerencia(n)));
  if (!s) throw new ErrorHttp(409, 'sin_sugerencia');
  guardarAjuste(db, claveSugerencia(n), JSON.stringify({ ...s, estado: 'descartada', descartada: iso(ahoraMs) }));
  return { descartada: true };
}
