// 0.14.103: el «Tiempo» del Vuelo libre: Despejado, Nubes, Frente frío y Frente cálido. Qué hay en cada punto (dentro de
// la nube, visibilidad, turbulencia, lluvia, rayos, viento, el altímetro que da el control y la temperatura) y las nubes
// dibujadas. Los datos, del PHAK cap. 12 (los frentes) y del AFH cap. 18 (entrar en nubes sin ser piloto de instrumentos),
// en la tabla TIEMPO_FAA (las pruebas la revisan). Sin documento ni ventana; siempre igual (sin azar suelto).
import { bola, linea, aleatorio, mezclarColor } from './motor3d.js';
import { nubeTormenta } from './e3d-efectos.js';

export const TIEMPOS = Object.freeze(['despejado', 'nubes', 'frio', 'calido']);
export const TIEMPO_FAA = Object.freeze({
  frio: Object.freeze({
    antes: 'nubes cumuliformes en torre y cumulonimbos; la presión baja', paso: 'lluvia fuerte con rayos, ráfagas y turbulencia; visibilidad mala; la temperatura baja de golpe; la presión toca fondo',
    despues: 'despeja rápido; viento del oeste-noroeste; más frío; la presión sube', lineaDeTormentas: true, velocidadMph: Object.freeze([25, 30]), fuente: 'PHAK cap. 12',
  }),
  calido: Object.freeze({
    antes: 'nubes estratiformes y niebla; lluvia o llovizna con mala visibilidad; viento del sur-sureste; la presión sigue bajando', paso: 'estratos y llovizna; la temperatura sube; la presión se nivela',
    despues: 'estratocúmulos; la visibilidad mejora (algo de bruma); viento del sur-suroeste; la presión sube un poco', velocidadMph: Object.freeze([10, 25]), fuente: 'PHAK cap. 12',
  }),
  // Sin entrenamiento de instrumentos, se pierde el control en unos 10 minutos; lo único importante: las alas niveladas.
  nubes: Object.freeze({ pierdeControlMin: 10, viraje180Min: 1, tasaEstandar: 3, fuente: 'AFH cap. 18' }),
});

// Dónde está cada cosa (unidades de 1,000 ft; norte = +z).
export const GEOMETRIA = Object.freeze({
  nubes: Object.freeze({ base: 3000, tope: 4500 }),
  frio: Object.freeze({ lineaZ: 16, ancho: 3 }), // la línea de tormentas (este-oeste) al norte de A
  calido: Object.freeze({ lineaZ: -18, base: 900, tope: 5000, alcanceZ: 60 }), // el frente en superficie al sur; el estrato al norte
});
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const r2 = x => Math.round(x * 100) / 100;

// Qué hay en un punto: → { dentro, visibilidad (unidades; la niebla), turbulencia 0..1, lluvia 0..1, rayos, viento { desde, kt, rafagas },
// altimetro (inHg), temperatura (°C), zona: 'antes'|'paso'|'despues'|null, techo (ft o null), gris 0..1 (el cielo cubierto) }
export function condiciones(tiempo, x, z, ft) {
  const base = { dentro: false, visibilidad: 70, turbulencia: 0, lluvia: 0, rayos: false, viento: { desde: 360, kt: 0, rafagas: 0 }, altimetro: 29.92, temperatura: 20, zona: null, techo: null, gris: 0 };
  if (tiempo === 'nubes') {
    const g = GEOMETRIA.nubes, dentro = ft >= g.base && ft <= g.tope;
    return { ...base, dentro, techo: g.base, visibilidad: dentro ? 0.35 : ft < g.base ? 40 : 70, gris: ft < g.base ? 0.45 : 0, viento: { desde: 270, kt: 8, rafagas: 0 }, temperatura: 15 };
  }
  if (tiempo === 'frio') {
    const g = GEOMETRIA.frio, d = z - g.lineaZ;
    if (d < -g.ancho) {
      // Antes: aire cálido y húmedo, viento del sur; la presión baja al acercarse.
      const k = lim((d + 30) / 27, 0, 1);
      return { ...base, zona: 'antes', altimetro: r2(29.92 - 0.14 * k), temperatura: 26, viento: { desde: 190, kt: 12, rafagas: 0 }, visibilidad: 50, gris: 0.15 * k, turbulencia: 0.1 * k };
    }
    if (d <= g.ancho) {
      // El paso: la línea de tormentas: lluvia fuerte, rayos, ráfagas, turbulencia y mala visibilidad.
      const centro = 1 - Math.abs(d) / g.ancho;
      return { ...base, zona: 'paso', altimetro: 29.76, temperatura: 18, viento: { desde: 250, kt: 20, rafagas: 32 }, turbulencia: 0.7 + 0.5 * centro, lluvia: 1, rayos: true, visibilidad: 4 + 6 * (1 - centro), gris: 0.7, dentro: ft > 2500 + 4000 * (1 - centro) };
    }
    // Después: despeja, viento del oeste-noroeste con ráfagas, más frío y la presión sube.
    const k = lim((d - g.ancho) / 25, 0, 1);
    return { ...base, zona: 'despues', altimetro: r2(29.82 + 0.26 * k), temperatura: 12, viento: { desde: 300, kt: 18, rafagas: 26 }, turbulencia: 0.35 * (1 - k), visibilidad: 70 };
  }
  if (tiempo === 'calido') {
    const g = GEOMETRIA.calido, d = z - g.lineaZ;
    if (d > 0) {
      // Antes (al norte, en el aire frío): estratos bajos y llovizna en una zona ancha; la presión baja al acercarse.
      const k = lim(1 - d / g.alcanceZ, 0, 1);
      const dentro = ft >= g.base && ft <= g.tope && d < g.alcanceZ;
      return { ...base, zona: d < 3 ? 'paso' : 'antes', altimetro: r2(30.02 - 0.2 * k), temperatura: 8, viento: { desde: 150, kt: 10, rafagas: 0 }, lluvia: 0.45, techo: g.base, dentro, visibilidad: dentro ? 0.35 : 14, gris: 0.6 };
    }
    // Después (al sur, en el aire cálido): estratocúmulos, mejora la visibilidad (bruma), viento del sur-suroeste.
    return { ...base, zona: 'despues', altimetro: 29.84, temperatura: 18, viento: { desde: 210, kt: 12, rafagas: 0 }, visibilidad: 35, gris: 0.2 };
  }
  return base;
}
// El control da el altímetro cuando cambia 0.05 o más (y lo dice en inglés, como en la radio).
export const cambioAltimetro = (anterior, ahora) => anterior == null || Math.abs(ahora - anterior) >= 0.05 - 1e-9;

// Las nubes de cada tiempo (una vez: una lista fija para WebGL).
export function nubesDe(tiempo) {
  const out = [], azar = aleatorio(41);
  const puff = (p, r, gris, a = 0.95) => out.push(bola(p, r, mezclarColor([255, 255, 255], [110, 118, 132], gris), { a, tex: 'nube', sombra: 0.7 }));
  if (tiempo === 'nubes') {
    const g = GEOMETRIA.nubes, y0 = g.base / 1000, y1 = g.tope / 1000;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 8; j++) {
      const x = i * 5.5 + (azar() - 0.5) * 2, z = j * 5.5 + (azar() - 0.5) * 2;
      puff([x, y0 + 0.5, z], 2.6 + azar() * 0.8, 0.35); puff([x + 1.5, y1 - 0.5, z + 1], 2.2 + azar() * 0.6, 0.1);
    }
  } else if (tiempo === 'frio') {
    const g = GEOMETRIA.frio;
    for (let x = -34; x <= 46; x += 7) out.push(...nubeTormenta({ x: x + (azar() - 0.5) * 2, z: g.lineaZ + (azar() - 0.5) * 2, base: 2.2, ancho: 4.2, altoMax: 26, k: 0.95, semilla: 50 + x, gris: 0.15 }));
    // La lluvia, en cortinas grises debajo de las tormentas.
    for (let x = -34; x <= 46; x += 1.6) out.push(linea([[x, 2.2, g.lineaZ], [x + 0.3, 0, g.lineaZ - 0.4]], [150, 165, 190], { a: 0.35, w: 2 }));
  } else if (tiempo === 'calido') {
    const g = GEOMETRIA.calido, y0 = g.base / 1000;
    for (let i = -7; i <= 9; i++) for (let j = 0; j <= 14; j++) {
      const x = i * 5 + (azar() - 0.5) * 2, z = g.lineaZ + 1 + j * 4.2 + (azar() - 0.5) * 2;
      puff([x, y0 + 0.4, z], 3 + azar() * 0.6, 0.55, 0.97);
    }
  }
  return out;
}
