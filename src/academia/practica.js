// Academia 0.9.0: la «Práctica del instructor» (intento de tipo «instructor»). Siempre con las 3 opciones ORIGINALES del
// Test Guide (enunciado, opciones y respuesta tal cual); lo único que el instructor decide es QUÉ preguntas y en qué
// orden, según el repaso espaciado y la memoria de errores del alumno:
//  0. (0.10.0) las de sus FALLAS registradas (src/academia/fallas.js): la pregunta fallada y las que más se le parecen;
//     con materia y tema («Repasar ahora» de su plan de refuerzo), solo las de ese tema;
//  1. las que le VENCEN hoy en el repaso (las más falladas primero),
//  2. las que falla y todavía no superó (2 aciertos seguidos),
//  3. las que nunca respondió, de sus temas abiertos (en el orden del camino),
//  4. y, para completar las 10, las que respondió hace más tiempo (para que no se olviden).
// Y las MEZCLA: nunca dos seguidas del mismo tema si se puede evitar (practicar intercalado se recuerda mejor).
// No aprueba nada: es práctica (los temas y los exámenes siguen igual).
import { puntosDebiles } from './memoria.js';
import { preguntasDeFallas } from './fallas.js';

export const PRACTICA_INSTRUCTOR = Object.freeze({ total: 10, vencidas: 5, debiles: 3 });

// abiertos: Set de «materia/tema» de los temas abiertos o aprobados del alumno (del camino).
export function preguntasDelInstructor(db, usuarioId, paquete, abiertos, ahoraMs = Date.now(), { materia = null, tema = null } = {}) {
  if (!paquete) return [];
  const delTema = id => { const l = paquete.deTema.get(id); return l ? `${l.materia}/${l.tema}` : null; };
  const soloTema = materia && tema ? `${materia}/${tema}` : null;
  const vale = id => paquete.preguntas.has(id) && abiertos.has(delTema(id)) && (!soloTema || delTema(id) === soloTema);
  const deFallas = preguntasDeFallas(db, usuarioId, paquete, ahoraMs).filter(vale);
  const vencidas = db.prepare('SELECT pregunta FROM academia_repaso WHERE usuario_id = ? AND caja < 6 AND vence_en <= ? ORDER BY fallos DESC, vence_en, pregunta')
    .all(usuarioId, new Date(ahoraMs).toISOString()).map(f => f.pregunta).filter(vale);
  const memoria = puntosDebiles(db, usuarioId, paquete);
  const debiles = memoria.preguntas.filter(x => !x.superada).map(x => x.pregunta).filter(vale);
  const ultimas = new Map(db.prepare('SELECT pregunta, MAX(creada_en) AS f FROM academia_respuestas WHERE usuario_id = ? GROUP BY pregunta').all(usuarioId).map(f => [f.pregunta, f.f]));
  const enOrden = paquete.materias.flatMap(m => m.temas.filter(t => abiertos.has(`${m.id}/${t.id}`)).flatMap(t => t.preguntas)).filter(vale);
  const nuevas = enOrden.filter(id => !ultimas.has(id));
  const viejas = enOrden.filter(id => ultimas.has(id)).sort((a, b) => String(ultimas.get(a)).localeCompare(String(ultimas.get(b))) || a.localeCompare(b));
  const elegidas = [];
  const tomar = (lista, cuantas) => {
    for (const id of lista) {
      if (elegidas.length >= PRACTICA_INSTRUCTOR.total || cuantas <= 0) break;
      if (!elegidas.includes(id)) { elegidas.push(id); cuantas -= 1; }
    }
  };
  tomar(deFallas, PRACTICA_INSTRUCTOR.total);
  // Un refuerzo de un tema: solo sus preguntas de refuerzo (si no hay, las del tema como siempre).
  if (soloTema && elegidas.length) return elegidas;
  tomar(vencidas, PRACTICA_INSTRUCTOR.vencidas);
  tomar(debiles, PRACTICA_INSTRUCTOR.debiles);
  tomar(nuevas, PRACTICA_INSTRUCTOR.total);
  tomar(vencidas, PRACTICA_INSTRUCTOR.total);
  tomar(debiles, PRACTICA_INSTRUCTOR.total);
  tomar(viejas, PRACTICA_INSTRUCTOR.total);
  return intercalar(elegidas, delTema);
}

// Reordena sin perder la prioridad: toma siempre la primera que queda cuyo tema no es el de la anterior.
export function intercalar(lista, temaDe) {
  const quedan = [...lista];
  const salida = [];
  while (quedan.length) {
    const anterior = salida.length ? temaDe(salida[salida.length - 1]) : null;
    const i = quedan.findIndex(id => temaDe(id) !== anterior);
    salida.push(quedan.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return salida;
}
