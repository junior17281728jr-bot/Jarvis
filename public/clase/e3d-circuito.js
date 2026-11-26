// 0.14.78: escena 3D «circuito-3d»: el circuito de tránsito (traffic pattern) a la izquierda de la pista 36, a 1,000 ft
// sobre el aeropuerto (AFH cap. 8), con los tramos del AIM 4-3-2 y 4-3-3: salida, viento cruzado, viento en cola, base y
// final, y la entrada a 45° al viento en cola a la mitad de la pista. Unidades: 1 = 1,000 ft (horizontal y vertical).
import { crearRuta, linea, poligono, caja, ruido } from './motor3d.js';
import { aeropuerto, campo, miles } from './e3d-base.js';

export const CIRCUITO = Object.freeze({
  alturaAGL: 1000, // la altura típica del circuito (AFH cap. 8)
  virajeDentroDe: 300, // virar a viento cruzado a menos de 300 ft de la altura del circuito (AIM 4-3-2)
  salidaMasAllaNM: 0.5, // y al menos 1/2 milla después del final de la pista (AIM 4-3-2)
  finalAntesDeSM: 0.25, // terminar el viraje a final a 1/4 de milla o más (AIM 4-3-3)
  entradaGrados: 45, // la entrada al viento en cola, a 45°, a la mitad de la pista (AIM 4-3-3)
  pista: Object.freeze({ numero: '36', rumbo: 360, largoFt: 5000 }),
  lado: 'izquierda',
});

export const TEXTOS = {
  titulo: 'El circuito de tránsito en 3D',
  recuerda: 'Salida, viento cruzado, viento en cola a 1,000 ft AGL, base y final. Se entra a 45°, a mitad de la pista.',
  'vista.titulo': 'Un rectángulo en el aire',
  'vista.texto': 'El circuito de tránsito (traffic pattern) es un rectángulo alrededor de la pista: virajes a la **izquierda** y a **1,000 ft AGL**.',
  'vista.mas': 'Es la altura típica; la de cada aeropuerto está en el Chart Supplement. Si el circuito es a la derecha, la carta lo dice con «RP» y la pista.',
  'salida.titulo': 'Despegue y salida',
  'salida.texto': 'Despegas y subes derecho (upwind). Viras **pasado el final de la pista** y a **300 ft** de la altura del circuito.',
  'salida.mas': 'El AIM pide seguir derecho al menos 1/2 milla después del final de la pista, salvo que te digan otra cosa.',
  'cruzado.titulo': 'Viento cruzado',
  'cruzado.texto': 'Primer viraje a la izquierda: tramo de **viento cruzado** (crosswind), a 90° de la pista. Sigues subiendo.',
  'cruzado.mas': 'Se llama así porque el viento, que sopla a lo largo de la pista, aquí te llega de costado.',
  'cola.titulo': 'Viento en cola',
  'cola.texto': '**Viento en cola** (downwind): paralelo a la pista, en sentido contrario, a **1,000 ft AGL**. La pista queda a tu izquierda.',
  'cola.mas': 'Mantén la altura hasta quedar al lado (abeam) del umbral. Es el momento de la lista de chequeo antes de aterrizar.',
  'cola1p.titulo': 'Desde la cabina',
  'cola1p.texto': 'Así se ve: la pista **abajo a la izquierda**. Al quedar al lado del **umbral** (abeam), reduces potencia y empiezas a bajar.',
  'cola1p.mas': 'Mira la distancia a la pista: si se acerca o se aleja, el viento te está empujando y corriges el rumbo.',
  'base.titulo': 'Base',
  'base.texto': 'Pasado el umbral, viraje a **base** (base leg): a 90° de la pista y bajando.',
  'base.mas': 'Desde la base miras la pista y eliges el momento del viraje a final, sin pasarte del eje.',
  'final.titulo': 'Final',
  'final.texto': '**Final**: alineado con el eje. Termina el viraje a final a **1/4 de milla** o más de la pista.',
  'final.mas': 'Un viraje a final cerrado y con mucho alabeo es una trampa clásica de pérdida. Si no quedaste alineado: motor y al aire (go-around).',
  'entrada.titulo': 'Cómo se entra',
  'entrada.texto': 'Para entrar, llegas a **45°** del viento en cola, a la **mitad de la pista** y ya a la **altura del circuito**.',
  'entrada.mas': 'Llega nivelado y mirando afuera. Antes, pasa lejos por encima o alrededor para ver la manga y el sentido del circuito.',
  'l.salida': 'Salida (upwind)', 'l.cruzado': 'Viento cruzado', 'l.cola': 'Viento en cola', 'l.base': 'Base', 'l.final': 'Final',
  'l.entrada': 'Entrada a 45°', 'l.altura': '{v} ft AGL', 'l.pista': 'Pista {v}', 'l.abeam': 'Al lado del umbral',
  estado: '{tramo} · {ft} ft AGL · {kt} kt',
};

// La ruta del circuito (cerrada: toque y despegue). Cada tramo, con sus puntos (x este, y altura, z norte).
export const TRAMOS = [
  ['salida', [[0, 0.02, -1.6], [0, 0.03, -0.2], [0, 0.25, 1.8], [0, 0.55, 4.2], [0, 0.72, 5.6]]],
  ['cruzado', [[-0.6, 0.8, 6.5], [-1.8, 0.88, 6.9], [-3.1, 0.95, 6.6], [-4.0, 1.0, 5.7]]],
  ['cola', [[-4.3, 1.0, 4.4], [-4.3, 1.0, 1.5], [-4.3, 1.0, -1.2], [-4.3, 1.0, -2.6], [-4.25, 0.94, -4.4]]],
  ['base', [[-3.9, 0.88, -5.6], [-3.0, 0.8, -6.4], [-1.8, 0.7, -6.7]]],
  ['final', [[-0.7, 0.6, -6.6], [-0.1, 0.5, -5.9], [0, 0.36, -4.8], [0, 0.18, -3.6], [0, 0.05, -2.6], [0, 0.02, -2.1]]],
];
const PUNTOS = TRAMOS.flatMap(([, p]) => p);
export const RUTA = crearRuta(PUNTOS, true);
// Dónde empieza cada tramo en la ruta (fracción 0..1).
export const LIMITES = (() => {
  const out = {};
  let indice = 0;
  for (const [id, p] of TRAMOS) {
    out[id] = indice === 0 ? 0 : RUTA.muestras.find(m => m.i === indice - 1 && m.t === 1).s / RUTA.largo;
    indice += p.length;
  }
  return out;
})();
const ORDEN = TRAMOS.map(([id]) => id);
export const tramoEn = f => { let r = ORDEN[0]; for (const id of ORDEN) if (f >= LIMITES[id] - 1e-9) r = id; return r; };
const fin = id => { const i = ORDEN.indexOf(id); return i + 1 < ORDEN.length ? LIMITES[ORDEN[i + 1]] : 1; };
const ENTRADA = [[-11, 1.0, 6.7], [-8.3, 1.0, 4.0], [-5.4, 1.0, 1.1], [-4.4, 1.0, -0.4], [-4.3, 1.0, -2.6], [-4.2, 0.92, -4.6], [-3.6, 0.85, -5.9], [-2.2, 0.75, -6.6]];

const rango = (desde, hasta) => ({ desde, hasta });
export const PASOS = [
  { id: 'vista', resaltar: null, camara: { mira: [-2.2, 0.6, 0], giro: 35, alto: 30, dist: 15, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 75 }, tQuieto: 30 },
  { id: 'salida', resaltar: 'salida', camara: { seguir: 0.5, mira: [0, 0.4, 2], giro: 120, alto: 22, dist: 9, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 70, ...rango(0, fin('salida')) }, tQuieto: 7 },
  { id: 'cruzado', resaltar: 'cruzado', camara: { seguir: 0.4, mira: [-2, 0.8, 5.5], giro: 160, alto: 24, dist: 10, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 75, ...rango(LIMITES.cruzado - 0.03, fin('cruzado') + 0.02) }, tQuieto: 2 },
  { id: 'cola', resaltar: 'cola', camara: { seguir: 0.4, mira: [-3, 0.6, 0], giro: 70, alto: 28, dist: 12, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 80, ...rango(LIMITES.cola - 0.02, fin('cola')) }, tQuieto: 6 },
  { id: 'cola1p', resaltar: 'cola', vista: '1p', mirar: -48, inclinar: -10, camara: { seguir: 0.4, mira: [-3, 0.6, 0], giro: 70, alto: 16, dist: 12, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 80, ...rango(LIMITES.cola, fin('cola')) }, tQuieto: 7 },
  { id: 'base', resaltar: 'base', camara: { seguir: 0.4, mira: [-2.5, 0.5, -5], giro: 20, alto: 26, dist: 10, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 70, ...rango(LIMITES.base - 0.03, fin('base') + 0.02) }, tQuieto: 2.5 },
  { id: 'final', resaltar: 'final', camara: { seguir: 0.5, mira: [0, 0.3, -4], giro: 330, alto: 14, dist: 8, fov: 48 },
    vuelo: { ruta: PUNTOS, cerrada: true, seg: 70, kt: 65, ...rango(LIMITES.final - 0.02, 1) }, tQuieto: 4 },
  { id: 'entrada', resaltar: 'entrada', camara: { seguir: 0.3, mira: [-5, 0.8, 1], giro: 40, alto: 28, dist: 14, fov: 48 },
    vuelo: { ruta: ENTRADA, cerrada: false, seg: 26, kt: 80 }, tQuieto: 6 },
];

const sobreSuelo = (x, z) => 0.03 * ruido(x * 0.15, z * 0.15, 6) * Math.min(1, Math.hypot(x, z) / 9);
const NARANJA = [255, 140, 30], BLANCO = [255, 255, 255];

export function construir(paleta) {
  const prims = campo({ x0: -22, z0: -22, x1: 22, z1: 22, n: 16, altura: sobreSuelo, paleta, semilla: 21, falda: 200, agua: (x, z) => Math.hypot(x + 14, z - 12) < 4.5 });
  prims.push(...aeropuerto({ x: 0, z: 0, y: 0, rumbo: 0, largo: 5, ancho: 0.2, paleta, lucesPista: true }));
  // La manga, junto al umbral de la 36 (el viento viene del norte: estira hacia el sur).
  const mx = 0.9, mz = -1.6;
  prims.push(linea([[mx, 0, mz], [mx, 0.06, mz]], [210, 210, 210], { w: 1.2 }));
  prims.push(poligono([[mx - 0.012, 0.06, mz], [mx + 0.012, 0.06, mz], [mx, 0.052, mz - 0.07]], NARANJA, { luz: 0.4, doble: true }));
  // Unas casas y galpones alrededor.
  for (const [x, z, w] of [[8, 6, 0.3], [9, 7.2, 0.2], [-9, -8, 0.35], [10, -9, 0.25], [-8, 10, 0.2]]) prims.push(...caja(x - w, 0, z - w, x + w, w * 0.7, z + w * 0.6, paleta.edificio));
  return { prims };
}

export function armarPaso(paso, paleta, T) {
  const prims = [], etiquetas = [];
  const r = paso.resaltar;
  // Cada tramo con su color (el del paso, naranja y grueso) y su nombre.
  const muestras = RUTA.muestras;
  for (const id of ORDEN) {
    const a = LIMITES[id] * RUTA.largo, b = fin(id) * RUTA.largo;
    const pts = muestras.filter(m => m.s >= a && m.s <= b).map(m => m.p);
    if (pts.length < 2) continue;
    const marcado = r === id || (r === 'entrada' && id === 'cola');
    prims.push(linea(pts, marcado ? NARANJA : BLANCO, { a: marcado ? 1 : 0.7, w: marcado ? 4 : 2.2 }));
    if (marcado) {
      // La «cortina»: del suelo al tramo, para ver la altura.
      for (let k = 0; k < pts.length - 1; k += 2) {
        const p = pts[k], q = pts[Math.min(k + 2, pts.length - 1)];
        prims.push(poligono([[p[0], 0, p[2]], [q[0], 0, q[2]], q, p], NARANJA, { a: 0.16, luz: 0, doble: true }));
      }
    }
    const medio = pts[pts.length >> 1];
    if (r === null || marcado) etiquetas.push({ p: [medio[0], medio[1] + 0.05, medio[2]], texto: T(`l.${id}`), prioridad: marcado ? 10 : 5, resaltada: marcado, color: marcado ? NARANJA : null, cabina: marcado });
  }
  // La entrada a 45°.
  prims.push(linea(ENTRADA.slice(0, 4), r === 'entrada' ? NARANJA : BLANCO, { a: r === 'entrada' ? 1 : 0.45, w: r === 'entrada' ? 4 : 1.6, guion: [7, 6] }));
  if (r === null || r === 'entrada') etiquetas.push({ p: ENTRADA[1], texto: T('l.entrada'), prioridad: r === 'entrada' ? 10 : 2, resaltada: r === 'entrada', color: r === 'entrada' ? NARANJA : null });
  // La altura del circuito: una línea vertical en el viento en cola.
  if (r === 'cola' || r === null || r === 'entrada') {
    prims.push(linea([[-4.3, 0, 1.5], [-4.3, 1, 1.5]], BLANCO, { a: 0.95, w: 1.6, guion: [4, 3] }));
    etiquetas.push({ p: [-4.3, 0.5, 1.5], texto: T('l.altura', { v: miles(CIRCUITO.alturaAGL) }), prioridad: 9, negrita: false, cabina: false });
  }
  if (r === 'cola') {
    prims.push(linea([[-4.3, 1, -2.5], [0, 0, -2.5]], [255, 220, 120], { a: 0.8, w: 1.4, guion: [3, 4] }));
    etiquetas.push({ p: [-2.2, 0.5, -2.5], texto: T('l.abeam'), prioridad: 8, negrita: false, cabina: true });
  }
  etiquetas.push({ p: [0.3, 0.02, -2.5], texto: T('l.pista', { v: CIRCUITO.pista.numero }), prioridad: 6, negrita: false, cabina: true });
  return { prims, etiquetas };
}

export function cuadro({ avion, T }) {
  const [x, y, z] = avion.pos;
  // El tramo donde va el avión (por la fracción de la ruta más cercana).
  let mejor = 0, d = Infinity;
  for (const m of RUTA.muestras) { const e = Math.hypot(m.p[0] - x, m.p[1] - y, m.p[2] - z); if (e < d) { d = e; mejor = m.s; } }
  const tramo = d < 0.4 ? tramoEn(mejor / RUTA.largo) : 'entrada';
  const ft = Math.max(0, Math.round((y * 1000) / 10) * 10);
  return { prims: [], estado: T('estado', { tramo: T(`l.${tramo}`), ft: miles(ft), kt: Math.round(avion.kt) }), ft };
}

export const ESCENA = { id: 'circuito-3d', unidades: { ftH: 1000, ftV: 1000 }, TEXTOS, PASOS, construir, armarPaso, cuadro, texturaEscala: 0.35, escalaAvion: 0.006, sombra: sobreSuelo, niebla1: { inicio: 10, fin: 60 }, niebla3: [1.6, 6], ojo1: 0.006, cerca1: 0.002 };
