// Academia 0.13.7: «Repaso final» (pestaña propia del menú): para el día antes del examen, practicar TODO sin volver a leer
// las clases. Dos partes, las dos sin IA y sin costo:
//  A) «Test Guide completo»: todas las preguntas del Test Guide del paquete en uso (de cada materia que tenga contenido; si
//     llega otra materia, entra sola), o de una materia, o solo las que la última vez falló. Las preguntas, las opciones y la
//     correcta van TAL CUAL (las mismas vistas de siempre: vistaPregunta / retroalimentacion). Es un intento de tipo «final»:
//     sus respuestas cuentan como cualquier práctica (Mi repaso, puntos, racha, repaso espaciado), pero nunca aprueba un
//     tema ni un examen. Después de responder, una sola línea corta, sacada TAL CUAL de la explicación sencilla del paquete
//     (lineaBreve). Las que falla vuelven al final de la vuelta (en la pantalla: la primera respuesta es la que cuenta).
//     Mientras tenga abierto un examen con reloj, no se puede empezar ni responder (ahí están las mismas preguntas).
//  B) «Examen oral: todo lo que te pueden preguntar»: tarjetas con cada pregunta del libro del oral (libro_qa) TAL CUAL, en
//     inglés, con su respuesta TAL CUAL y su página; y las «Additional Study Questions» (el libro no trae su respuesta). El
//     alumno dice «La sabía» / «No la sabía»: se guarda solo lo de HOY, por alumno, en «ajustes» (sin cambio de base), para
//     seguir donde quedó.
// Todo con el id de quien entró (la sesión): un intento de otro alumno responde «no existe».
import { ErrorHttp } from '../nucleo/http.js';
import { MATERIAS_ORAL } from './formato.js';
import { leerAjuste, guardarAjuste, librosDe } from './paquetes.js';
import { crearIntento, verIntento, responder, terminar, diaDe, idsTestGuide, falladasTestGuide } from './progreso.js';
import { examenDe, finDe, GRACIA_MS } from './examen.js';
import { hayOral } from './oral.js';

const claveAlumno = id => `academia.repaso_final.${Number(id)}`;
const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);
const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);
const MARCAS_MAXIMO = 5000;

function estadoAlumno(db, usuarioId, hoy) {
  let v = null;
  try { v = JSON.parse(leerAjuste(db, claveAlumno(usuarioId)) ?? 'null'); } catch { v = null; }
  if (!esObjeto(v) || v.dia !== hoy) return { dia: hoy, tg: null, oral: {} };
  return { dia: hoy, tg: esObjeto(v.tg) ? v.tg : null, oral: esObjeto(v.oral) ? v.oral : {} };
}
const guardarAlumno = (db, usuarioId, v) => guardarAjuste(db, claveAlumno(usuarioId), JSON.stringify(v));

// ---------- La línea corta después de responder ----------
// Una sola línea de la explicación sencilla del paquete, TAL CUAL (nunca se escribe nada nuevo): el «Truco para recordar»
// si lo trae; si no, el «Por qué»; si no, su primera línea; si no hay explicación sencilla, la primera línea de la del
// Test Guide.
const CORTE = /(?<=[.!?…])\s+(?=(?:[✔✓]|Por qu[eé](?: no)?\s*:|Piensa as[ií]\s*:|Truco para recordar\s*:|Truco\s*:|Para recordar\s*:|Para aprender\s*:|La respuesta correcta es\b|La correcta es\b))/u;
const lineasDe = texto => String(texto ?? '').split(/\n+/).map(x => x.trim()).filter(Boolean).flatMap(l => l.split(CORTE).map(x => x.trim()).filter(Boolean));
export function lineaBreve(q) {
  const lineas = lineasDe(q?.sencilla);
  return lineas.find(l => /^(truco para recordar|truco|para recordar)\s*:/iu.test(l))
    ?? lineas.find(l => /^por qu[eé]\s*:/iu.test(l))
    ?? lineas[0]
    ?? lineasDe(q?.original?.explicacion)[0]
    ?? null;
}

// ¿Tiene abierto un examen con reloj (que no venció)? Ahí van las mismas preguntas del Test Guide.
export function examenAbierto(db, usuarioId, ahoraMs) {
  for (const f of db.prepare("SELECT * FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NULL").all(usuarioId)) {
    const e = examenDe(db, f);
    if (e && ahoraMs <= finDe(f, e) + GRACIA_MS) return true;
  }
  return false;
}
const sinExamenAbierto = (db, usuarioId, ahoraMs) => { if (examenAbierto(db, usuarioId, ahoraMs)) throw new ErrorHttp(409, 'repaso_final_en_examen'); };

function filaFinal(db, usuarioId, id) {
  const n = Number(id);
  const f = Number.isSafeInteger(n) ? db.prepare("SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ? AND tipo = 'final'").get(n, usuarioId) : null;
  if (!f) throw new ErrorHttp(404, 'no_existe');
  return f;
}
const conBreve = (paquete, r) => (r ? { ...r, breve: lineaBreve(paquete.preguntas.get(r.pregunta ?? '') ?? null) } : r);

// ---------- La pantalla ----------
export function resumenRepasoFinal(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const hoy = diaDe(ahoraMs);
  const yo = estadoAlumno(db, usuarioId, hoy);
  const malas = paquete ? falladasTestGuide(db, usuarioId, paquete) : new Set();
  const materias = (paquete?.materias ?? []).map(m => ({ id: m.id, ids: idsTestGuide(paquete, m.id) })).filter(m => m.ids.length)
    .map(m => ({ id: m.id, total: m.ids.length, falladas: m.ids.filter(id => malas.has(id)).length }));
  // La vuelta de hoy que quedó a medias (para «Seguir donde quedaste»).
  let abierta = null;
  const f = yo.tg?.intento != null ? db.prepare("SELECT * FROM academia_intentos WHERE id = ? AND usuario_id = ? AND tipo = 'final'").get(Number(yo.tg.intento), usuarioId) : null;
  if (f && !f.terminado_en && diaDe(Date.parse(f.empezado_en)) === hoy) abierta = { id: f.id, materia: f.materia, falladas: yo.tg.falladas === true, respondidas: f.respondidas, total: f.total };
  const oral = tarjetasOral(paquete);
  const sabidas = oral.filter(x => yo.oral[x.id] === 1).length;
  const marcadas = oral.filter(x => Object.hasOwn(yo.oral, x.id)).length;
  return {
    tg: { total: materias.reduce((n, m) => n + m.total, 0), falladas: materias.reduce((n, m) => n + m.falladas, 0), materias, abierta, enExamen: examenAbierto(db, usuarioId, ahoraMs) },
    oral: {
      hay: oral.length > 0, total: oral.length, marcadas, sabidas,
      capitulos: MATERIAS_ORAL.map(id => ({ id, numero: MATERIAS_ORAL.indexOf(id) + 1, total: oral.filter(x => x.materia === id).length })).filter(c => c.total),
    },
  };
}

// ---------- A) El Test Guide completo ----------
export function crearRondaFinal(db, usuarioId, paquete, { materia = null, falladas = false } = {}, { azar = Math.random, ahoraMs = Date.now() } = {}) {
  sinExamenAbierto(db, usuarioId, ahoraMs);
  const i = crearIntento(db, usuarioId, paquete, { tipo: 'final', materia, soloFalladas: falladas === true }, { azar, ahoraMs });
  const hoy = diaDe(ahoraMs);
  guardarAlumno(db, usuarioId, { ...estadoAlumno(db, usuarioId, hoy), tg: { intento: i.id, falladas: falladas === true } });
  return vistaRondaFinal(db, usuarioId, paquete, i.id);
}
export function vistaRondaFinal(db, usuarioId, paquete, id) {
  if (!paquete) throw new ErrorHttp(409, 'sin_paquete');
  const f = filaFinal(db, usuarioId, id);
  const v = verIntento(db, usuarioId, paquete, f.id);
  return { ...v, preguntas: v.preguntas.map(q => (q.respuesta ? { ...q, respuesta: { ...q.respuesta, breve: lineaBreve(paquete.preguntas.get(q.id)) } } : q)) };
}
export function responderRondaFinal(db, usuarioId, paquete, id, { pregunta, elegida }, { ahoraMs = Date.now() } = {}) {
  const f = filaFinal(db, usuarioId, id);
  sinExamenAbierto(db, usuarioId, ahoraMs);
  const r = responder(db, usuarioId, paquete, f.id, { pregunta, elegida }, { ahoraMs });
  return { ...r, respuesta: conBreve(paquete, { ...r.respuesta, pregunta }) };
}
export function terminarRondaFinal(db, usuarioId, paquete, id, { ahoraMs = Date.now() } = {}) {
  const f = filaFinal(db, usuarioId, id);
  const r = terminar(db, usuarioId, paquete, f.id, { ahoraMs });
  return { id: r.id, tipo: r.tipo, materia: r.materia, total: r.total, aciertos: r.aciertos, pct: pct(r.aciertos, r.total), aprobado: null, falladas: r.falladas.map(q => q.id) };
}

// ---------- B) El oral: todo lo que te pueden preguntar ----------
// Cada pregunta del libro (y cada «Additional Study Question»), TAL CUAL, con su página. Id: <materia>/<tema>/q<k> (a<k>).
export function tarjetasOral(paquete) {
  if (!hayOral(paquete)) return [];
  const lista = [];
  for (const m of paquete.oral.materias) for (const t of m.temas) {
    const libro = [...librosDe(paquete, t.paquete).values()][0]?.titulo ?? null;
    const comun = { materia: m.id, capitulo: MATERIAS_ORAL.indexOf(m.id) + 1, tema: t.id, temaTitulo: t.titulo, temaTituloEn: t.titulo_en ?? null, libro };
    (t.libro_qa ?? []).forEach((x, k) => lista.push({ id: `${m.id}/${t.id}/q${k}`, ...comun, adicional: false, n: x.n ?? null, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en ?? null, pagina: x.pagina, explicacion_es: x.explicacion_es ?? null }));
    (t.adicionales ?? []).forEach((x, k) => lista.push({ id: `${m.id}/${t.id}/a${k}`, ...comun, adicional: true, n: x.n ?? null, pregunta_en: x.pregunta_en, respuesta_en: null, pagina: x.pagina, explicacion_es: null }));
  }
  return lista;
}
export function oralRepasoFinal(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const tarjetas = tarjetasOral(paquete);
  const yo = estadoAlumno(db, usuarioId, diaDe(ahoraMs));
  const ids = new Set(tarjetas.map(x => x.id));
  const marcas = Object.fromEntries(Object.entries(yo.oral).filter(([id, v]) => ids.has(id) && (v === 0 || v === 1)));
  return { hay: tarjetas.length > 0, tarjetas, marcas };
}
export function marcarOralRepasoFinal(db, usuarioId, paquete, { tarjeta, sabia }, ahoraMs = Date.now()) {
  if (typeof tarjeta !== 'string' || typeof sabia !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  if (!tarjetasOral(paquete).some(x => x.id === tarjeta)) throw new ErrorHttp(404, 'no_existe');
  const yo = estadoAlumno(db, usuarioId, diaDe(ahoraMs));
  const oral = { ...yo.oral };
  delete oral[tarjeta];
  oral[tarjeta] = sabia ? 1 : 0;
  const claves = Object.keys(oral);
  for (const vieja of claves.slice(0, Math.max(0, claves.length - MARCAS_MAXIMO))) delete oral[vieja];
  guardarAlumno(db, usuarioId, { ...yo, oral });
  return { tarjeta, sabia, marcadas: Object.keys(oral).length };
}
// «Empezar de nuevo» (de un capítulo o de todo): borra solo las marcas de hoy de esas tarjetas.
export function reiniciarOralRepasoFinal(db, usuarioId, paquete, { materia = null } = {}, ahoraMs = Date.now()) {
  if (materia != null && !MATERIAS_ORAL.includes(materia)) throw new ErrorHttp(404, 'no_existe');
  const yo = estadoAlumno(db, usuarioId, diaDe(ahoraMs));
  const oral = Object.fromEntries(Object.entries(yo.oral).filter(([id]) => materia != null && !id.startsWith(`${materia}/`)));
  guardarAlumno(db, usuarioId, { ...yo, oral });
  return { marcadas: Object.keys(oral).length };
}
