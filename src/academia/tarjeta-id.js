// Academia 0.14.77: el id y la huella de una tarjeta de la clase, aparte para que «Dónde más cuesta»
// (src/academia/donde-cuesta.js) y «¿Lo entendiste?» (src/academia/entendi.js) los usen sin importarse uno al otro.
// Son los mismos de la 0.14.59 (donde-cuesta.js los sigue exportando): nada cambia en lo ya guardado.
import { createHash } from 'node:crypto';

const sha = t => createHash('sha256').update(String(t)).digest('hex');
export const idTarjeta = (materia, tema, titulo) => sha(`${materia}|${tema}|${titulo}`).slice(0, 24);
// La huella del texto de una tarjeta (lo que ve el alumno): si cambia, lo medido y lo promovido ya no valen.
export const huellaTarjeta = s => sha(JSON.stringify([s?.titulo ?? '', s?.texto ?? '', Array.isArray(s?.puntos) ? s.puntos : [], s?.recuerda ?? '', s?.ejemplo ?? ''])).slice(0, 16);
