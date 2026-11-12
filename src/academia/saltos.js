// Academia 0.12.0: «Ir directo al examen». Un alumno puede tomar el examen de una materia sin haber terminado sus temas
// (con su aviso: «Si saltas las clases y te quemas, el instructor te lo va a recordar»). Aquí se guarda, sin cambio de
// base (en «ajustes»):
//  - academia.saltos.<alumno>: { orden: { <materia>: 'examen_antes' | 'temas_antes' }, eventos: [{ materia, intento,
//    pendientes, total, en }] }. «orden» se fija con el PRIMER examen de cada materia (antes o después de los temas) y
//    no cambia; cada salto es un evento (los últimos 200).
//  - academia.salto.<intento>: la foto del momento del salto (cuántos temas le faltaban de cuántos). Se guarda al crear
//    el examen: así «saltaste 6 temas» no cambia cuando después hace los temas.
// Saltar no abre nada del camino: los temas siguen en su orden y el examen aprobado así no los aprueba.
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
  return { orden, eventos: lista.reverse() };
}
