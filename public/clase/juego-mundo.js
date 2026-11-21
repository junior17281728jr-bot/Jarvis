// 0.14.98: el mundo del Juego (Vuelo libre): el campo, el aeropuerto con la pista 36 (4,000 × 75 ft) y unas nubes de buen
// tiempo. Se arma UNA vez por paleta (con WebGL se sube una sola vez: la misma lista en cada cuadro).
// Unidades: 1 = 1,000 ft (como el circuito 3D). Reusa las piezas de las escenas 3D (e3d-base.js y motor3d.js).
import { aeropuerto, campo, cumulo } from './e3d-base.js';
import { ruido, aleatorio, primitivasAvion } from './motor3d.js';
import { PISTA, PISTA_B, VUELO } from './vuelo-modelo.js';

export const ESCALA_AVION = 0.0032; // el modelo mide unas 8.4 unidades: 27 ft de largo, como un Cessna 172
export const ALTO_RUEDAS = 0.0027; // del centro del avión a las ruedas (en unidades del mundo)

// Un poco de relieve lejos del aeropuerto (plano cerca: se aterriza sin sorpresas). En unidades (1 = 1,000 ft).
export function alturaSuelo(x, z) {
  const d = Math.hypot(x, z);
  if (d < 6 || Math.abs(x) > 36 || Math.abs(z) > 36) return 0;
  return Math.min(1, (d - 6) / 10) * 0.35 * ruido(x * 0.08, z * 0.08, 5);
}

export function construirMundo(paleta, { conNubes = true } = {}) {
  const prims = [];
  prims.push(...campo({ x0: -36, z0: -36, x1: 36, z1: 36, n: 18, altura: alturaSuelo, paleta, semilla: 5, falda: 400 }));
  prims.push(...aeropuerto({ x: PISTA.x, z: PISTA.z, y: 0.0004, rumbo: PISTA.rumbo % 360, largo: PISTA.largoFt / VUELO.ftPorUnidad, ancho: PISTA.anchoFt / VUELO.ftPorUnidad, paleta, torre: true, detalle: true }));
  // 0.14.102: el aeropuerto B (pista 09), a unos 10 NM al noreste.
  prims.push(...aeropuerto({ x: PISTA_B.x, z: PISTA_B.z, y: 0.0004, rumbo: PISTA_B.rumbo % 360, largo: PISTA_B.largoFt / VUELO.ftPorUnidad, ancho: PISTA_B.anchoFt / VUELO.ftPorUnidad, paleta, torre: false, detalle: true }));
  // Cúmulos de buen tiempo (base a 4,500 ft), lejos de la pista (solo con tiempo despejado: el «Tiempo» trae los suyos).
  const azar = aleatorio(11);
  for (let i = 0; i < (conNubes ? 9 : 0); i++) {
    const g = azar() * Math.PI * 2, r = 7 + azar() * 20;
    prims.push(...cumulo({ x: Math.sin(g) * r, z: Math.cos(g) * r, base: 4.5, ancho: 1.6 + azar() * 1.6, alto: 1 + azar() * 1.2, semilla: 20 + i }).prims);
  }
  return prims;
}

// El avión propio (para la vista de afuera): en el mundo, con la sombra en el suelo.
export function avionPropio(a, { t = 0, yugo = { alabeo: 0, cabeceo: 0 }, luces = true } = {}) {
  return primitivasAvion({
    pos: posicionAvion(a), rumbo: a.rumbo, cabeceo: a.cabeceo, alabeo: a.alabeo, escala: ESCALA_AVION,
    helice: t * (a.rpm / 60) * Math.PI * 2 * 0.2, luces, t, alerones: yugo.alabeo * 15, profundidad: yugo.cabeceo * 12, sombra: 0.0006,
  });
}
export const posicionAvion = a => [a.x, a.ft / VUELO.ftPorUnidad + ALTO_RUEDAS, a.z];
