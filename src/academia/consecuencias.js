// Academia 0.14.95 (pedido de Junior: «tú escoges la respuesta: si bien o mal, la situación pasará en acción ahí»): las
// CONSECUENCIAS de una pregunta. Después de responder una pregunta de opción múltiple que lo tiene, el alumno ve en 3D qué
// pasaría con la opción que eligió (public/consecuencia-vista.js abre la situación de public/clase/situacion3d.js justo
// en esa consecuencia): la correcta, el avión lo hace bien; una mala, pasa lo que pasaría.
//  - En el paquete: un campo de la pregunta, «consecuencia: { situacion: 'clase-c', opciones: { A: 'llamar', B: 'entrar' } }»
//    (letra del Test Guide → consecuencia de esa situación; ids de src/academia/diagramas.js, SITUACIONES_3D).
//  - En el código: la tabla CONSECUENCIAS_TG (solo ids de preguntas y de consecuencias, nunca el texto de una pregunta),
//    para que funcione antes de cambiar los paquetes. El campo del paquete manda sobre la tabla.
// La regla: la letra correcta va SOLO a la consecuencia correcta de la situación, y una letra mala nunca va a ella (así una
// respuesta buena nunca termina en «Esto pasaría»). Una letra sin consecuencia queda sin mapear: entonces se ofrece solo
// «Ver la correcta». Si la correcta no está mapeada, la pregunta no tiene consecuencia.
// La respuesta nunca viaja antes: esto SOLO se agrega a lo que se ve después de responder (retroalimentacion / retroOral).
import { SITUACIONES_3D } from './diagramas.js';

const LETRA = /^[A-F]$/;

// La tabla del código: id de la pregunta → { situacion, opciones: { letra: consecuencia } }. Cada una se eligió leyendo la
// pregunta y sus opciones: solo cuando la opción ES esa decisión o ese mismo error (ver el informe de 0.14.95).
export const CONSECUENCIAS_TG = Object.freeze(Object.fromEntries(Object.entries({
  // Espacio aéreo C: contacto por radio antes de entrar.
  'tg-4-148': ['clase-c', { A: 'llamar' }],
  'tg-4-98': ['clase-c', { A: 'llamar' }],
  // Espacio aéreo B: hace falta la autorización; solo hablar (o «nada») es entrar sin autorización.
  'orm-06-t05-e-004': ['clase-b', { A: 'contacto', B: 'autorizado' }],
  'orm-06-t06-f-003': ['clase-b', { A: 'contacto', B: 'contacto', C: 'autorizado' }],
  // Espacio aéreo D (torre): comunicación de ida y vuelta siempre; «solo con mal tiempo» = entrar sin hablar.
  'tg-4-97': ['clase-d', { A: 'torre', B: 'sinHablar', C: 'sinHablar' }],
  'tg-4-147': ['clase-d', { C: 'torre' }],
  // VFR en nubes: los instrumentos y el viraje a tiempo; confiar en lo que siente el cuerpo = la espiral.
  // Altitud de densidad: calcular con el manual; no ver que el calor la sube = despegar como siempre.
  'tg-2-80': ['densidad', { A: 'despegar', B: 'despegar', C: 'calcular' }],
  'tg-2-89': ['densidad', { B: 'calcular' }],
  'tg-8-4': ['densidad', { A: 'despegar', B: 'despegar', C: 'calcular' }],
  'tg-8-5': ['densidad', { A: 'despegar', B: 'calcular', C: 'despegar' }],
  'orm-04-t03-c-009': ['densidad', { A: 'despegar', B: 'calcular' }],
  'orm-06-t02-b-009': ['densidad', { A: 'calcular', B: 'despegar' }],
  // La nube que crece: cúmulo en torre y la etapa madura; se rodea, lejos.
  'tg-6-40': ['nubes', { C: 'rodear' }],
  'tg-6-51': ['nubes', { B: 'rodear' }],
  'tg-6-54': ['nubes', { A: 'rodear' }],
  'orm-03-t01-a-021': ['nubes', { B: 'rodear' }],
  // La línea de tormentas (línea de turbonada, delante del frente frío): desviarse y esperar.
  'tg-6-55': ['frente-frio', { A: 'desviar' }],
  'tg-6-56': ['frente-frio', { B: 'desviar' }],
}).map(([id, [situacion, opciones]]) => [id, Object.freeze({ situacion, opciones: Object.freeze(opciones) })])));

// → lista de motivos (vacía si está bien). letras: las de la pregunta (si se saben); correcta: su letra correcta.
export function revisarConsecuencia(c, { letras = null, correcta = null } = {}) {
  if (c == null || typeof c !== 'object' || Array.isArray(c)) return ['no_es_objeto'];
  const mal = [];
  const sit = typeof c.situacion === 'string' && Object.hasOwn(SITUACIONES_3D, c.situacion) ? SITUACIONES_3D[c.situacion] : null;
  if (!sit) return ['situacion_desconocida'];
  if (c.opciones == null || typeof c.opciones !== 'object' || Array.isArray(c.opciones) || !Object.keys(c.opciones).length) return ['opciones'];
  for (const [letra, id] of Object.entries(c.opciones)) {
    if (!LETRA.test(letra) || (letras && !letras.includes(letra))) mal.push(`opciones.${letra}:letra`);
    else if (typeof id !== 'string' || !sit.opciones.includes(id)) mal.push(`opciones.${letra}:consecuencia_desconocida`);
    else if (correcta != null && (letra === correcta) !== (id === sit.correcta)) mal.push(`opciones.${letra}:${letra === correcta ? 'correcta_no_va_a_la_correcta' : 'mala_va_a_la_correcta'}`);
  }
  if (correcta != null && !Object.hasOwn(c.opciones, correcta)) mal.push('sin_la_correcta');
  for (const k of Object.keys(c)) if (!['situacion', 'opciones'].includes(k)) mal.push(k);
  return mal;
}

// La consecuencia de una pregunta (la del paquete o la de la tabla), solo si cumple la regla con SU correcta.
export function consecuenciaDe(id, q) {
  const o = q?.original;
  if (!o) return null;
  const letras = Array.isArray(o.opciones) ? o.opciones.map(x => x?.letra) : [];
  for (const c of [q.consecuencia, CONSECUENCIAS_TG[id]]) {
    if (c && !revisarConsecuencia(c, { letras, correcta: o.correcta }).length) return c;
  }
  return null;
}

// Lo que viaja DESPUÉS de responder: { situacion, correcta: id, opciones: { letra que se vio: id } }.
// vistas (Modo reto): [{ letra, clave }] — las opciones nuevas del reto no son las del Test Guide: solo la correcta.
export function consecuenciaVista(id, q, { vistas = null } = {}) {
  const c = consecuenciaDe(id, q);
  if (!c) return null;
  const correcta = SITUACIONES_3D[c.situacion].correcta;
  let opciones;
  if (vistas) {
    const v = vistas.find(x => x.clave === q.original.correcta);
    opciones = v ? { [v.letra]: correcta } : {};
  } else opciones = { ...c.opciones };
  return { situacion: c.situacion, correcta, opciones };
}
