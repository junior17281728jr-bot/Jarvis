// 0.14.102: el tráfico del Vuelo libre: un avión en el circuito de cada aeropuerto (el mismo circuito de la escena 3D de
// las clases, e3d-circuito.js, girado para la pista 09 de B) y los que cruzan; y el aviso «Tráfico a las 2, 2 millas,
// misma altitud» (la posición en horas del reloj). Sin documento ni ventana.
import { crearRuta } from './motor3d.js';
import { TRAMOS } from './e3d-circuito.js';
import { PISTA, PISTA_B, VUELO } from './vuelo-modelo.js';

const FT = VUELO.ftPorUnidad, NM = 6.076;
const rad = g => (g * Math.PI) / 180;
const norm180 = g => ((((g % 360) + 540) % 360) - 180);
const norm360 = g => ((g % 360) + 360) % 360;

// El circuito de una pista: los puntos del de la 36 (x este, z norte; y en miles de ft), girados al rumbo de esa pista.
export function rutaCircuito(pista) {
  const h = rad(pista.rumbo % 360);
  const puntos = TRAMOS.flatMap(([, p]) => p).map(([x, y, z]) => [pista.x + x * Math.cos(h) + z * Math.sin(h), y, pista.z - x * Math.sin(h) + z * Math.cos(h)]);
  return crearRuta(puntos, true);
}
const RUTAS = new Map();
const rutaDe = pista => { if (!RUTAS.has(pista.id)) RUTAS.set(pista.id, rutaCircuito(pista)); return RUTAS.get(pista.id); };

// Un avión en el circuito de una pista (s: dónde va, en unidades a lo largo de la ruta).
export function traficoCircuito(pista, s = 0, { kt = 80, nombre = 'N' } = {}) {
  return enCircuito({ tipo: 'circuito', pista: pista.id, s, kt, nombre, fase: (s * 0.13) % 1 });
}
function enCircuito(tr) {
  const ruta = rutaDe(tr.pista === 'B' ? PISTA_B : PISTA);
  const p = ruta.en(tr.s), q = ruta.en(tr.s + 0.05);
  return { ...tr, x: p[0], z: p[2], ft: Math.max(0, p[1]) * FT, rumbo: norm360((Math.atan2(q[0] - p[0], q[2] - p[2]) * 180) / Math.PI) };
}
// Mueve cualquier tráfico: el del circuito, por su ruta (da vueltas); el que cruza, derecho por su rumbo.
export function moverCualquiera(tr, dt) {
  const d = (tr.kt * 1.68781 * dt) / FT;
  if (tr.tipo === 'circuito') return enCircuito({ ...tr, s: tr.s + d });
  const h = rad(tr.rumbo);
  return { ...tr, x: tr.x + Math.sin(h) * d, z: tr.z + Math.cos(h) * d };
}
// El tráfico de siempre: uno en cada circuito (en distintos tramos).
export function traficoInicial() {
  return [traficoCircuito(PISTA, 13, { kt: 78 }), traficoCircuito(PISTA_B, 9, { kt: 82 })];
}

// ---------- el aviso del tráfico ----------
// La posición en horas del reloj (12 = adelante, 3 = a la derecha, 6 = atrás, 9 = a la izquierda).
export function enHoras(propio, tr) {
  const marc = norm180((Math.atan2(tr.x - propio.x, tr.z - propio.z) * 180) / Math.PI - propio.rumbo);
  const h = Math.round(((marc + 360) % 360) / 30) % 12;
  return h === 0 ? 12 : h;
}
// → null (lejos o sin peligro) o { horas, nm, altura: 'misma'|'arriba'|'abajo', dif (centenas de ft, + arriba) }
export const ALERTA = Object.freeze({ nm: 3, ft: 1000 });
export function alertaTrafico(propio, tr) {
  const nm = Math.hypot(tr.x - propio.x, tr.z - propio.z) / NM;
  const dif = (tr.ft - propio.ft) / 100;
  if (nm > ALERTA.nm || Math.abs(dif * 100) > ALERTA.ft) return null;
  return { horas: enHoras(propio, tr), nm: Math.max(0.5, Math.round(nm * 2) / 2), altura: Math.abs(dif) < 3 ? 'misma' : dif > 0 ? 'arriba' : 'abajo', dif: Math.round(dif) };
}
// La etiqueta de altura para el mapa y la vista: «+5» = 500 ft arriba, «−3» = 300 ft abajo, «=» = a la misma.
export const etiquetaAltura = (propio, tr) => { const d = Math.round((tr.ft - propio.ft) / 100); return d === 0 ? '=' : d > 0 ? `+${d}` : `−${-d}`; };
