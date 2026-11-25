// 0.14.100: las «Mini-clases» del Juego: un vuelo ya preparado para experimentar, con 2 a 4 pasos cortos (cada uno con su
// idea clave en negrita y su fuente de la FAA) y los ajustes que se cambian en vivo (día o noche, viento, tráfico). Las que
// ya existen como escenas 3D de las clases (espacio aéreo, mínimos VFR y frentes) se abren tal cual. Sin documento.
// Los textos: «juego.mc.<id>.titulo», «.linea» y «juego.mc.<id>.<paso>» (con **negrita**) en public/i18n.
import { PISTA, LAGO } from './vuelo-modelo.js';
import { LUCES_FAA, direccionDe, derechoDePaso, crearTrafico } from './juego-noche.js';

const NM = 6.076;
const UMBRAL_Z = PISTA.z - PISTA.largoFt / 2000;
// En final, a «nm» millas del umbral, en la senda de 3° (+ «arriba» ft).
export const enFinalA = (nm, arriba = 0) => ({ x: 0, z: UMBRAL_Z - nm * NM, ft: Math.round(nm * 6076 * Math.tan((3 * Math.PI) / 180) + 50 + arriba), rumbo: 360, kt: 68, potencia: 0.2, flaps: 1, enSuelo: false });
// El comienzo del amarizaje: en el eje del lago, unos 2.6 NM al sur de la orilla, rumbo norte, con 0.1 gal.
export const AMARIZAJE_INICIO = Object.freeze({ x: LAGO.x, z: LAGO.z - LAGO.az - 16, ft: 2600, rumbo: 360, kt: 85, potencia: 0.5, flaps: 0, enSuelo: false, combustible: 0.1 });
const CRUCERO = Object.freeze({ x: -2, z: -10, ft: 2500, rumbo: 360, kt: 100, potencia: 0.65, flaps: 0, enSuelo: false });

export const MINICLASES = Object.freeze([
  { id: 'luces-aviones', icono: 'ojo', hora: 'noche', inicio: CRUCERO, congelar: true, fov: 34, fuente: LUCES_FAA.posicion.fuente,
    pasos: [
      { id: 'frente', trafico: 'de_frente', pregunta: 'direccion' },
      { id: 'cruza', trafico: 'cruza_der_izq', pregunta: 'direccion' },
      { id: 'cruza2', trafico: 'cruza_izq_der', pregunta: 'direccion' },
      { id: 'aleja', trafico: 'se_aleja', pregunta: 'direccion' },
    ] },
  { id: 'derecho-paso', icono: 'personas', hora: 'atardecer', inicio: CRUCERO, congelar: true, fov: 40, fuente: LUCES_FAA.derechoDePaso.fuente,
    pasos: [
      { id: 'converge', trafico: 'cruza_der_izq', pregunta: 'accion', opciones: ['ceder', 'mantener_atento'] },
      { id: 'frente', trafico: 'de_frente', pregunta: 'accion', opciones: ['ambos_derecha', 'ambos_izquierda'] },
      { id: 'alcanzas', trafico: 'alcanzas', pregunta: 'accion', opciones: ['pasar_derecha', 'pasar_izquierda'] },
    ] },
  { id: 'luces-aeropuerto', icono: 'torre', hora: 'noche', inicio: enFinalA(1.5), congelar: true, fov: 30, fuente: 'AIM 2-1-4 · 2-1-9 · 2-1-10',
    pasos: [{ id: 'faro' }, { id: 'bordes' }, { id: 'extremos' }, { id: 'rodaje' }] },
  { id: 'papi', icono: 'flecha', hora: 'atardecer', inicio: enFinalA(0.6), fov: 22, congelar: true, fuente: LUCES_FAA.papi.fuente,
    pasos: [{ id: 'senda', arriba: 0 }, { id: 'alto', arriba: 70 }, { id: 'bajo', arriba: -50 }, { id: 'vasi', arriba: 0 }] },
  { id: 'noche-aterrizar', icono: 'avion', hora: 'noche', inicio: enFinalA(3), congelar: false, fuente: 'AFH cap. 11',
    pasos: [{ id: 'propias', lucesAterrizaje: true }, { id: 'luces' }, { id: 'instrumentos' }, { id: 'tocar' }] },
  { id: 'cruzado', icono: 'avion', hora: 'dia', inicio: enFinalA(2.5), congelar: false, viento: { desde: 90, kt: 10 }, fuente: 'AFH cap. 9',
    pasos: [{ id: 'deriva' }, { id: 'corregir' }, { id: 'tocar' }] },
  { id: 'perdida', icono: 'atencion', hora: 'dia', inicio: { ...CRUCERO, ft: 3500, kt: 85, potencia: 0.2 }, congelar: false, asistente: false, fuente: 'AFH cap. 5',
    pasos: [{ id: 'lento' }, { id: 'aviso' }, { id: 'recuperar' }] },
  // 0.14.103: la mezcla, a 7,500 ft (el aire menos denso): rica, empobrecer hasta la mejor potencia, demasiado pobre y corte.
  { id: 'mezcla', icono: 'motor', hora: 'dia', inicio: { ...CRUCERO, ft: 7500, kt: 100, potencia: 0.7 }, congelar: false, motor: true, fuente: 'PHAK cap. 7 · cap. 11',
    pasos: [{ id: 'rica', mezcla: 1 }, { id: 'empobrecer', mezcla: 0.76 }, { id: 'pobre', mezcla: 0.45 }, { id: 'corte', mezcla: 0 }] },
  // 0.14.113: el amarizaje con poco combustible (pedido del dueño): al sur del lago, a 2,600 ft, con 0.1 gal (el motor se
  // para en un minuto); el viento del norte (se amariza de frente al viento). Los pasos 2 y 3 empiezan ya sin combustible,
  // más cerca del agua. El juez es juzgarAmarizaje (vuelo-modelo.js).
  { id: 'amarizaje', icono: 'atencion', hora: 'dia', inicio: AMARIZAJE_INICIO, congelar: false, viento: { desde: 360, kt: 10 }, mapa: 'lago', fuente: 'AFH cap. 3 · cap. 18 · AIM 6-3-2 · 6-3-3',
    pasos: [
      { id: 'planear' },
      { id: 'viento', inicio: { z: LAGO.z - LAGO.az - 6, ft: 2000, kt: 70, combustible: 0 } },
      { id: 'tocar', inicio: { z: LAGO.z - LAGO.az + 8, ft: 1000, kt: 70, combustible: 0 } },
    ] },
  // Las escenas 3D de las clases, tal cual.
  { id: 'espacio-aereo', icono: 'escudo', escena: 'espacio-aereo' },
  { id: 'minimos-vfr', icono: 'nube', escena: 'minimos-vfr' },
  { id: 'frentes', icono: 'nube', escena: 'frentes' },
]);
export const miniclase = id => MINICLASES.find(m => m.id === id) ?? null;

// Las opciones de la pregunta de un paso y cuál es la correcta (la del motor del juego, no un texto aparte).
export const DIRECCIONES = Object.freeze(['hacia_ti', 'der_a_izq', 'izq_a_der', 'se_aleja']);
// (el otro avión, a unos 2,000 ft: de noche se distinguen sus dos luces)
export const DISTANCIA_CLASE = 2;
export function preguntaDePaso(paso, propio) {
  if (!paso?.pregunta || !paso.trafico) return null;
  const tr = crearTrafico(paso.trafico, propio, { distancia: DISTANCIA_CLASE });
  if (paso.pregunta === 'direccion') return { opciones: DIRECCIONES, correcta: direccionDe(tr, propio), trafico: tr };
  return { opciones: paso.opciones, correcta: derechoDePaso(propio, tr).accion, trafico: tr };
}
