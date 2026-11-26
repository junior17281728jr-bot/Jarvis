// 0.14.103: el «Tiempo» del Vuelo libre: Despejado, Nubes, Frente frío y Frente cálido. Qué hay en cada punto (dentro de
// la nube, visibilidad, turbulencia, lluvia, rayos, viento, el altímetro que da el control y la temperatura) y las nubes
// dibujadas. Los datos, del PHAK cap. 12 (los frentes) y del AFH cap. 18 (entrar en nubes sin ser piloto de instrumentos),
// en la tabla TIEMPO_FAA (las pruebas la revisan). Sin documento ni ventana; siempre igual (sin azar suelto).
import { bola, linea, aleatorio, mezclarColor } from './motor3d.js';
import { nubeTormenta } from './e3d-efectos.js';

// 0.14.118 (pedido del dueño: «poder controlar el clima»): también Lluvia (chubascos bajo una capa baja) y Niebla (de
// radiación: el aire calmo y húmedo de la mañana, abajo casi no se ve). Ver juego.tiempo.<id>.texto.
// 0.14.119: también Tormenta (nubes bajas y oscuras, lluvia fuerte, rayos, ráfagas, turbulencia fuerte y corrientes que
// suben y bajan; en la vida real, a 20 NM como mínimo: AIM 7-1-26, como en las escenas 3D de las tormentas).
export const TIEMPOS = Object.freeze(['despejado', 'nubes', 'lluvia', 'niebla', 'tormenta', 'frio', 'calido']);
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
  // La niebla de radiación: noches despejadas, poco o nada de viento y la temperatura cerca del punto de rocío (PHAK cap. 12).
  niebla: Object.freeze({ tipo: 'radiacion', vientoMaxKt: 5, fuente: 'PHAK cap. 12' }),
  // La lluvia: chubascos que bajan la visibilidad y el techo, con ráfagas (PHAK cap. 12).
  lluvia: Object.freeze({ fuente: 'PHAK cap. 12' }),
  tormenta: Object.freeze({ evitarNM: 20, fuente: 'AIM 7-1-26 · PHAK cap. 12' }),
});

// Dónde está cada cosa (unidades de 1,000 ft; norte = +z).
export const GEOMETRIA = Object.freeze({
  nubes: Object.freeze({ base: 3000, tope: 4500 }),
  frio: Object.freeze({ lineaZ: 16, ancho: 3 }), // la línea de tormentas (este-oeste) al norte de A
  calido: Object.freeze({ lineaZ: -18, base: 900, tope: 5000, alcanceZ: 60 }), // el frente en superficie al sur; el estrato al norte
  lluvia: Object.freeze({ base: 2500, tope: 6000 }),
  niebla: Object.freeze({ tope: 500 }), // la capa de niebla, pegada al suelo
  tormenta: Object.freeze({ base: 2200, corrienteFpm: 1500 }),
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
  if (tiempo === 'lluvia') {
    const g = GEOMETRIA.lluvia, dentro = ft >= g.base && ft <= g.tope;
    return { ...base, dentro, techo: g.base, visibilidad: dentro ? 0.35 : ft < g.base ? 16 : 50, gris: ft < g.base ? 0.6 : 0.1, lluvia: ft < g.base ? 0.75 : 0, turbulencia: dentro ? 0.35 : 0.15,
      viento: { desde: 200, kt: 10, rafagas: 18 }, temperatura: 14, altimetro: 29.8 };
  }
  if (tiempo === 'tormenta') {
    const g = GEOMETRIA.tormenta, dentro = ft >= g.base;
    return { ...base, dentro, techo: g.base, visibilidad: dentro ? 0.35 : 8, gris: 0.85, lluvia: 1, rayos: true, turbulencia: dentro ? 1.3 : 0.85,
      viento: { desde: 240, kt: 18, rafagas: 34 }, temperatura: 17, altimetro: 29.7 };
  }
  if (tiempo === 'niebla') {
    const g = GEOMETRIA.niebla, k = lim((ft - g.tope * 0.4) / (g.tope * 0.8), 0, 1); // 0 en el suelo … 1 arriba de la capa
    return { ...base, visibilidad: 2.5 + k * 40, gris: 0.6 * (1 - k) + 0.15, viento: { desde: 360, kt: 2, rafagas: 0 }, temperatura: 9, altimetro: 30.1 };
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
  } else if (tiempo === 'lluvia') {
    // Una capa baja y gris (base 2,500 ft) con cortinas de lluvia aquí y allá.
    const g = GEOMETRIA.lluvia, y0 = g.base / 1000;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 8; j++) {
      const x = i * 5 + (azar() - 0.5) * 2, z = j * 5 + (azar() - 0.5) * 2;
      puff([x, y0 + 0.6, z], 3 + azar() * 0.7, 0.65, 0.97);
      if ((i + j) % 3 === 0) out.push(linea([[x, y0, z], [x + 0.25, 0, z - 0.3]], [140, 150, 170], { a: 0.28, w: 2 }));
    }
  } else if (tiempo === 'tormenta') {
    // Una capa baja y oscura y torres de tormenta alrededor, con sus cortinas de lluvia.
    const g = GEOMETRIA.tormenta, y0 = g.base / 1000;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 8; j++) {
      const x = i * 5 + (azar() - 0.5) * 2, z = j * 5 + (azar() - 0.5) * 2;
      puff([x, y0 + 0.5, z], 3.2 + azar() * 0.8, 0.85, 0.98);
      if ((i + j) % 2 === 0) out.push(linea([[x, y0, z], [x + 0.3, 0, z - 0.4]], [120, 130, 150], { a: 0.35, w: 2 }));
    }
    for (const [x, z] of [[-9, 8], [8, 14], [14, -6], [-14, -10]]) out.push(...nubeTormenta({ x, z, base: y0, ancho: 4, altoMax: 24, k: 0.95, semilla: 70 + x, gris: 0.2 }));
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

// 0.14.118: la turbulencia de cada momento (0..1), más real: casi nada con buen tiempo (un poco de térmicas de día, bajo
// las nubes de buen tiempo), más con viento fuerte cerca del suelo (turbulencia mecánica), dentro de las nubes y en las
// tormentas (lo de condiciones()). hora: 'dia' | 'atardecer' | 'noche'; viento: el que sopla.
export function nivelTurbulencia(cond, { ft = 0, enSuelo = false, hora = 'dia', viento = null } = {}) {
  if (enSuelo) return 0;
  let n = cond?.turbulencia ?? 0;
  if (hora === 'dia' && ft > 80 && ft < 4500) n += 0.05 * Math.min(1, ft / 600); // las térmicas
  const kt = viento?.kt ?? cond?.viento?.kt ?? 0, rafagas = viento?.rafagas ?? cond?.viento?.rafagas ?? 0;
  if (ft < 1500) n += Math.max(0, kt - 10) * 0.012 * (1 - ft / 1500) + Math.max(0, rafagas - kt) * 0.01;
  if (cond?.dentro) n += 0.2;
  return lim(n, 0, 1.6);
}

// 0.14.118: la manga de viento junto a la pista: el mástil y la manga (rayas naranja y blanca) que apunta hacia donde va
// el viento y se infla con la fuerza (llena con 15 kt o más; colgando sin viento). Se mueve un poco (flamea).
export const MANGA = Object.freeze({ x: -0.075, z: -1.55, altoFt: 18, largoFt: 12, llenaKt: 15 });
export function mangaDeViento(viento, t = 0) {
  const m = MANGA, kt = Math.max(0, viento?.kt ?? 0), k = lim(kt / m.llenaKt, 0, 1);
  const va = ((viento?.desde ?? 0) + 180 + Math.sin(t * 1.7) * 6 * k) * Math.PI / 180; // hacia donde sopla
  const y0 = m.altoFt / 1000, L = m.largoFt / 1000;
  const out = [linea([[m.x, 0, m.z], [m.x, y0, m.z]], [205, 208, 214], { a: 1, w: 1.5 })];
  for (let i = 1; i <= 5; i++) {
    const f = i / 5, h = f * L;
    const p = [m.x + Math.sin(va) * h * (0.25 + 0.75 * k), y0 - h * (1 - k) * 0.9, m.z + Math.cos(va) * h * (0.25 + 0.75 * k)];
    out.push(bola(p, (0.0011 - f * 0.0004) * (0.6 + 0.4 * k), i % 2 ? [242, 110, 30] : [245, 245, 245], { min: 1.2 }));
  }
  return out;
}

// 0.14.119: las corrientes de la tormenta (ft/min; + sube): cambian con el lugar y el tiempo (hasta ±1,500 ft/min).
export function corrienteVertical(tiempo, t, x, z) {
  if (tiempo !== 'tormenta') return 0;
  return GEOMETRIA.tormenta.corrienteFpm * Math.sin(t * 0.21 + x * 3.1) * Math.cos(t * 0.13 + z * 2.3);
}
// 0.14.119: las ráfagas como un interruptor aparte (con cualquier viento y cualquier tiempo): a cuánto llegan (kt).
export const rafagaDe = (kt, si) => (si ? Math.max(Math.round(kt) + 8, Math.round(kt * 1.6)) : Math.round(kt));
// Cómo se dice el viento: «270° 12 kt» o, con ráfagas, «270° 12G20 kt».
export function vientoTexto(desde, kt, g = kt) {
  const d = String(Math.round(desde) % 360 || 360).padStart(3, '0'), k = Math.round(kt), gg = Math.round(g);
  return gg > k ? `${d}° ${k}G${gg} kt` : `${d}° ${k} kt`;
}
