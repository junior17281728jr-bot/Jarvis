// Academia 0.12.4: el «Plan de hoy» y la «nota para ti». Puro (sin IA ni red): lo usan la ruta del instructor y la
// vista de prueba de la IA del administrador.
//  - accionesDeHoy: lo que el alumno PUEDE hacer hoy en la app, cada cosa con su id y su botón de verdad (la Práctica
//    del instructor, un concepto de «Mi repaso», el tema que sigue, su Modo reto, el examen de la materia). Sin IA, el
//    plan son las primeras (en este orden); con IA, la IA solo elige y ordena entre ESTAS (src/academia/instructor-ia.js).
//  - notaPersonal: una nota corta encima de la explicación compartida, con SU historia de errores (cuántas veces falló
//    ese concepto, la idea equivocada que repite). Se calcula aquí, nunca va a la IA y no tiene nada personal.
import { camino } from './progreso.js';
import { consejoInstructor, modeloAlumno } from './instructor.js';
import { miRepaso } from './fallas.js';
import { conceptoDePregunta, nombreConcepto } from './conceptos.js';
import { ideaDe } from './reto.js';

const MAX_ACCIONES = 6;

export function accionesDeHoy(db, usuarioId, paquete, ahoraMs = Date.now()) {
  if (!paquete) return [];
  const lista = [];
  const poner = (id, accion, que, vars = {}) => { if (accion && !lista.some(a => a.id === id)) lista.push({ id, accion, clave: que, vars }); };
  const repaso = miRepaso(db, usuarioId, paquete, ahoraMs);
  for (const [i, x] of (repaso.paraRepasar ?? []).slice(0, 2).entries()) {
    poner(`repaso-${i + 1}`, { tipo: 'intento', datos: x.practicar }, 'repaso', { concepto: x.concepto || x.temaTitulo || '' });
  }
  const c = camino(db, usuarioId, paquete, ahoraMs);
  for (const m of c.materias) {
    const t = m.temas.find(x => x.estado === 'abierto');
    if (t) {
      poner('tema', { tipo: 'tema', materia: m.id, tema: t.id }, 'tema', { tema: t.titulo });
      poner('reto', { tipo: 'intento', datos: { tipo: 'reto', materia: m.id, tema: t.id } }, 'reto', { tema: t.titulo });
      break;
    }
    if (m.examen?.disponible && !m.examen.aprobado) { poner('examen', { tipo: 'examen', materia: m.id }, 'examen', {}); break; }
  }
  const m = modeloAlumno(db, usuarioId, paquete, ahoraMs);
  if (m.respuestas) poner('practica', { tipo: 'intento', datos: { tipo: 'instructor' } }, m.repasoHoy > 0 ? 'practica_vence' : 'practica', { n: m.repasoHoy ?? 0 });
  const consejo = consejoInstructor(db, usuarioId, paquete, ahoraMs).consejo;
  if (consejo?.accion && !lista.some(a => JSON.stringify(a.accion) === JSON.stringify(consejo.accion))) poner('consejo', consejo.accion, 'consejo', { consejo: consejo.clave, consejoVars: consejo.vars ?? {} });
  return lista.slice(0, MAX_ACCIONES);
}
// El plan sin IA: las 3 primeras, en orden (lo de «Mi repaso» primero).
export const planBasico = acciones => acciones.slice(0, 3).map(a => ({ accion: a.id }));

// La nota para ti (o null): de la pregunta que pide explicar, con lo que ya está en la base.
export function notaPersonal(db, usuarioId, paquete, preguntaId, elegida) {
  if (!paquete?.preguntas.has(preguntaId)) return null;
  const c = conceptoDePregunta(paquete, preguntaId);
  const q = paquete.preguntas.get(preguntaId);
  const delConcepto = c?.preguntas?.length ? c.preguntas : [preguntaId];
  const marcas = delConcepto.map(() => '?').join(', ');
  const malas = db.prepare(`SELECT pregunta, elegida, dia FROM academia_respuestas WHERE usuario_id = ? AND correcta = 0 AND pregunta IN (${marcas})`).all(usuarioId, ...delConcepto);
  const dias = new Set(malas.map(f => f.dia)).size;
  const mismaOpcion = malas.filter(f => f.pregunta === preguntaId && f.elegida === elegida).length;
  const idea = elegida && elegida !== q.original.correcta ? ideaDe(q, elegida) : null;
  if (malas.length < 2 && mismaOpcion < 2) return null;
  return { fallos: malas.length, dias, mismaOpcion, concepto: c ? nombreConcepto(c) : null, idea: mismaOpcion >= 2 ? idea : null };
}
