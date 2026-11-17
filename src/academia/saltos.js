// Academia 0.12.0: «Ir directo al examen». Un alumno puede tomar el examen de una materia sin haber terminado sus temas
// (con su aviso: «Si saltas las clases y te quemas, el instructor te lo va a recordar»). Aquí se guarda, sin cambio de
// base (en «ajustes»):
//  - academia.saltos.<alumno>: { orden: { <materia>: 'examen_antes' | 'temas_antes' }, eventos: [{ materia, intento,
//    pendientes, total, en }] }. «orden» se fija con el PRIMER examen de cada materia (antes o después de los temas) y
//    no cambia; cada salto es un evento (los últimos 200).
//  - academia.salto.<intento>: la foto del momento del salto (cuántos temas le faltaban de cuántos). Se guarda al crear
//    el examen: así «saltaste 6 temas» no cambia cuando después hace los temas.
// Saltar no abre nada del camino por sí solo: si se quema, los temas siguen en su orden y nada se abre.
// 0.14.19 («test out», pedido del dueño): si APRUEBA ese examen directo (con la nota de aprobar de los exámenes de materia:
// el «umbral» del intento, academia.aprobar_pct, 90 % si no se cambió), la materia queda «Convalidada por examen»: cuenta
// con todos sus temas hechos y se abre la siguiente. Se guarda aparte y solo se agrega (nunca se borra nada):
//  - academia.convalidadas.<alumno>: { <materia>: { intento, pct, umbral, en } }. El primero que aprueba se queda (la
//    nota no cambia después). Solo lo escribe la entrega de un examen directo aprobado (los aprobados antes de la 0.14.19
//    no se convalidan solos: pueden volver a tomarlo).
import { leerAjuste, guardarAjuste } from './paquetes.js';

const MAX_EVENTOS = 200;
const claveAlumno = id => `academia.saltos.${Number(id)}`;
const claveIntento = id => `academia.salto.${Number(id)}`;
const MATERIA = /^[a-z_]{1,40}$/;
const ORDENES = new Set(['examen_antes', 'temas_antes']);

export function saltosDe(db, usuarioId) {
  try {
    const v = JSON.parse(leerAjuste(db, claveAlumno(usuarioId)) ?? 'null');
    const orden = {};
    for (const [m, o] of Object.entries(v?.orden ?? {})) if (MATERIA.test(m) && ORDENES.has(o)) orden[m] = o;
    const eventos = (Array.isArray(v?.eventos) ? v.eventos : []).filter(e => MATERIA.test(e?.materia ?? '') && Number.isSafeInteger(e.intento));
    return { orden, eventos };
  } catch { return { orden: {}, eventos: [] }; }
}
const escribir = (db, usuarioId, v) => guardarAjuste(db, claveAlumno(usuarioId), JSON.stringify({ orden: v.orden, eventos: v.eventos.slice(-MAX_EVENTOS) }));

// El orden de una materia se anota con su primer examen y no cambia después.
export function anotarOrden(db, usuarioId, materia, orden) {
  if (!MATERIA.test(String(materia)) || !ORDENES.has(orden)) return;
  const v = saltosDe(db, usuarioId);
  if (v.orden[materia]) return;
  v.orden[materia] = orden;
  escribir(db, usuarioId, v);
}

export function registrarSalto(db, usuarioId, { materia, intento, pendientes, total, en }) {
  const v = saltosDe(db, usuarioId);
  const evento = { materia, intento, pendientes, total, en };
  v.eventos.push(evento);
  escribir(db, usuarioId, v);
  guardarAjuste(db, claveIntento(intento), JSON.stringify({ usuario: Number(usuarioId), materia, pendientes, total, en }));
}

// La foto del salto de un intento (o null si ese examen no fue «directo»). Solo la del dueño del intento.
export function saltoDeIntento(db, usuarioId, intentoId) {
  try {
    const v = JSON.parse(leerAjuste(db, claveIntento(intentoId)) ?? 'null');
    if (!v || v.usuario !== Number(usuarioId)) return null;
    return { materia: v.materia, pendientes: Number(v.pendientes) || 0, total: Number(v.total) || 0, en: v.en ?? null };
  } catch { return null; }
}

// Para la ficha del administrador y el instructor: cada salto con cómo le fue en ese examen (si ya lo entregó).
export function historialSaltos(db, usuarioId) {
  const { orden, eventos } = saltosDe(db, usuarioId);
  const lista = eventos.map(e => {
    const f = db.prepare('SELECT total, aciertos, aprobado, terminado_en FROM academia_intentos WHERE id = ? AND usuario_id = ?').get(e.intento, usuarioId);
    return {
      ...e,
      terminado: f?.terminado_en != null,
      pct: f?.terminado_en != null && f.total > 0 ? Math.floor((f.aciertos * 100) / f.total) : null,
      aprobado: f?.terminado_en != null ? f.aprobado === 1 : null,
    };
  });
  // 0.14.19: qué materias quedaron «Convalidadas por examen» (y con qué nota); el salto que la convalidó, marcado.
  const convalidadas = convalidadasDe(db, usuarioId);
  for (const e of lista) if (convalidadas[e.materia]?.intento === e.intento) e.convalidada = true;
  return { orden, eventos: lista.reverse(), convalidadas };
}

// ---------- 0.14.19: «Convalidada por examen» ----------
const claveConvalidadas = id => `academia.convalidadas.${Number(id)}`;
export function leerConvalidadas(texto) {
  let v = null;
  try { v = JSON.parse(texto ?? 'null'); } catch { v = null; }
  const salida = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return salida;
  for (const [m, x] of Object.entries(v)) {
    if (!MATERIA.test(m) || !x || typeof x !== 'object') continue;
    salida[m] = { intento: Number(x.intento) || null, pct: Math.max(0, Math.min(100, Number(x.pct) || 0)), umbral: Number(x.umbral) || null, en: typeof x.en === 'string' ? x.en : null };
  }
  return salida;
}
export const convalidadasDe = (db, usuarioId) => leerConvalidadas(leerAjuste(db, claveConvalidadas(usuarioId)));
// Idempotente: si ya estaba convalidada, no cambia nada (→ false).
export function convalidar(db, usuarioId, { materia, intento, pct, umbral, en }) {
  if (!MATERIA.test(String(materia))) return false;
  const v = convalidadasDe(db, usuarioId);
  if (v[materia]) return false;
  v[materia] = { intento: Number(intento), pct: Number(pct) || 0, umbral: Number(umbral) || null, en };
  guardarAjuste(db, claveConvalidadas(usuarioId), JSON.stringify(v));
  return true;
}
