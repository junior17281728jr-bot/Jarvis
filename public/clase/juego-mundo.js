// 0.14.98: el mundo del Juego (Vuelo libre): el campo, el aeropuerto con la pista 36 (4,000 × 75 ft) y unas nubes de buen
// tiempo. Se arma UNA vez por paleta (con WebGL se sube una sola vez: la misma lista en cada cuadro).
// Unidades: 1 = 1,000 ft (como el circuito 3D). Reusa las piezas de las escenas 3D (e3d-base.js y motor3d.js).
import { aeropuerto, campo, cumulo } from './e3d-base.js';
import { ruido, aleatorio, primitivasAvion, poligono, mezclarColor, baseAvion, bola as bolaMundo, modeloAvion as construirAvionMundo } from './motor3d.js';
import { PISTA, PISTA_B, VUELO, LAGO, enAgua, radioLago } from './vuelo-modelo.js';
import { marcasPista, detalleSuelo } from './juego-suelo.js';

// 0.14.113: el lago (para el amarizaje): plano (altura 0) y con la orilla que sube despacio.
export { LAGO, enAgua };

export const ESCALA_AVION = 0.0032; // el modelo mide unas 8.4 unidades: 27 ft de largo, como un Cessna 172
export const ALTO_RUEDAS = 0.0027; // del centro del avión a las ruedas (en unidades del mundo)

// Un poco de relieve lejos del aeropuerto (plano cerca: se aterriza sin sorpresas). En unidades (1 = 1,000 ft).
export function alturaSuelo(x, z) {
  const d = Math.hypot(x, z);
  if (d < 6 || Math.abs(x) > 36 || Math.abs(z) > 36) return 0;
  // (en el lago y hasta unos 6,000 ft de la orilla, plano: más que un cuadro del terreno, así su malla no tapa el agua;
  // después el relieve sube despacio. (r − 1) × el semieje chico no pasa de la distancia a la orilla.)
  const orilla = Math.min(1, Math.max(0, ((radioLago(x, z) - 1) * LAGO.ax - 6) / 4));
  if (orilla <= 0) return 0;
  return orilla * Math.min(1, (d - 6) / 10) * 0.35 * ruido(x * 0.08, z * 0.08, 5);
}

// El agua del lago: franjas planas (de sur a norte, en trozos chicos: la niebla y el recorte se calculan por trozo; con
// WebGL y con el dibujo de respaldo). Pegadas al suelo («calco»), con el color «agua» de la paleta (de día y de noche).
export function aguaLago(paleta, { franjas = 36, trozos = 4 } = {}) {
  const out = [], y = 0.0003, c = paleta.agua;
  const ancho = z => LAGO.ax * Math.sqrt(Math.max(0, 1 - ((z - LAGO.z) / LAGO.az) ** 2));
  for (let i = 0; i < franjas; i++) {
    const za = LAGO.z - LAGO.az + (2 * LAGO.az * i) / franjas, zb = LAGO.z - LAGO.az + (2 * LAGO.az * (i + 1)) / franjas;
    const wa = ancho(za), wb = ancho(zb);
    for (let k = 0; k < trozos; k++) {
      const f0 = -1 + (2 * k) / trozos, f1 = -1 + (2 * (k + 1)) / trozos;
      const pts = [[LAGO.x + wa * f0, y, za], [LAGO.x + wb * f0, y, zb], [LAGO.x + wb * f1, y, zb], [LAGO.x + wa * f1, y, za]];
      // (en las puntas una franja es un triángulo: no se repite el vértice)
      const p = pts.filter((v, j) => j === 0 || Math.hypot(v[0] - pts[j - 1][0], v[2] - pts[j - 1][2]) > 1e-9);
      // (0.14.117: con el mismo material que el agua de las escenas: refleja el cielo, más de costado; de lejos se ve
      // clara, como un lago de verdad, y se funde con la bruma en lugar de ser un disco azul)
      if (p.length >= 3) out.push(poligono(p, c, { luz: 1, doble: true, capa: 'calco', n: [0, 1, 0], refleja: 1, brillo: 0.8 }));
    }
  }
  return out;
}

// 0.14.117: la orilla del lago: una franja suave de árboles y tierra (algo más oscura que el campo) que lo «asienta» en el suelo; sin
// ella, de lejos el agua se veía como un disco pegado encima. En trozos de 4 lados (convexos), pegados al suelo.
export const ORILLA_ANCHO = 0.2; // unidades (unos 200 ft)
export function orillaLago(paleta, { lados = 72 } = {}) {
  const out = [], y = 0.0002, c = mezclarColor(paleta.bosque, paleta.tierra, 0.35);
  const punto = (g, extra) => [LAGO.x + Math.sin(g) * (LAGO.ax + extra), y, LAGO.z + Math.cos(g) * (LAGO.az + extra)];
  for (let i = 0; i < lados; i++) {
    const g0 = (i / lados) * Math.PI * 2, g1 = ((i + 1) / lados) * Math.PI * 2;
    // (adentro, bajo el agua: entre la franja y el borde del agua, hecho de trozos rectos, no queda rendija)
    out.push(poligono([punto(g0, -0.6), punto(g0, ORILLA_ANCHO), punto(g1, ORILLA_ANCHO), punto(g1, -0.6)], c, { luz: 1, a: 0.5, doble: true, capa: 'calco', n: [0, 1, 0] }));
  }
  return out;
}

// 0.14.117: las nubes con la luz de la hora: de noche apenas se adivinan (gris azulado oscuro) y al atardecer, más
// apagadas; de día, blancas como siempre. (antes eran blancas también de noche)
export function nubesConLuz(prims, paleta) {
  const k = paleta?.noche ? [0.16, 0.18, 0.25] : paleta?.oscuro ? [0.66, 0.62, 0.66] : null;
  if (!k) return prims;
  return prims.map(q => (q.tex === 'nube' ? { ...q, c: q.c.map((v, i) => Math.round(v * k[i])) } : q));
}

export function construirMundo(paleta, { conNubes = true, sol = undefined } = {}) {
  const prims = [];
  // (0.14.117: el terreno debajo del lago, de pasto: sus cuadros miden 4,000 ft y, pintados de agua, se salían de la orilla
  // como un halo celeste alrededor del lago; el agua la pone aguaLago, justo hasta la orilla)
  prims.push(...campo({ x0: -36, z0: -36, x1: 36, z1: 36, n: 18, altura: alturaSuelo, paleta, semilla: 5, falda: 400 }));
  prims.push(...orillaLago(paleta), ...aguaLago(paleta));
  prims.push(...aeropuerto({ x: PISTA.x, z: PISTA.z, y: 0.0004, rumbo: PISTA.rumbo % 360, largo: PISTA.largoFt / VUELO.ftPorUnidad, ancho: PISTA.anchoFt / VUELO.ftPorUnidad, paleta, torre: true, detalle: true }));
  // 0.14.102: el aeropuerto B (pista 09), a unos 10 NM al noreste.
  prims.push(...aeropuerto({ x: PISTA_B.x, z: PISTA_B.z, y: 0.0004, rumbo: PISTA_B.rumbo % 360, largo: PISTA_B.largoFt / VUELO.ftPorUnidad, ancho: PISTA_B.anchoFt / VUELO.ftPorUnidad, paleta, torre: false, detalle: true }));
  // 0.14.122: las marcas que dan la altura (punto de mira y zona de toma de contacto) y el detalle del suelo (árboles, cercos,
  // galpones, alambrado, camino con autos, carteles): la escala, cerca del suelo.
  prims.push(...marcasPista(PISTA), ...marcasPista(PISTA_B), ...detalleSuelo({ sol, noche: Boolean(paleta?.noche), paleta }));
  // Cúmulos de buen tiempo (base a 4,500 ft), lejos de la pista (solo con tiempo despejado: el «Tiempo» trae los suyos).
  const azar = aleatorio(11);
  for (let i = 0; i < (conNubes ? 9 : 0); i++) {
    const g = azar() * Math.PI * 2, r = 7 + azar() * 20;
    prims.push(...nubesConLuz(cumulo({ x: Math.sin(g) * r, z: Math.cos(g) * r, base: 4.5, ancho: 1.6 + azar() * 1.6, alto: 1 + azar() * 1.2, semilla: 20 + i }).prims, paleta));
  }
  return prims;
}

// El avión propio (para la vista de afuera): en el mundo, con la sombra en el suelo.
// 0.14.123: con los daños a la vista: la pala doblada, la punta del ala raspada y, con el tren roto en el suelo, chispas.
export function avionPropio(a, { t = 0, yugo = { alabeo: 0, cabeceo: 0 }, luces = true, reducir = false } = {}) {
  const d = a.danos, extra = [];
  if (d?.puntaAla || (d?.tren >= 2 && a.enSuelo && a.kt > 2)) {
    const m = construirAvionMundo(), base = baseAvion(a.rumbo, a.cabeceo, a.alabeo), pos = posicionAvion(a);
    const L = q => [pos[0] + (base.F[0] * q[0] + base.U[0] * q[1] + base.R[0] * q[2]) * ESCALA_AVION, pos[1] + (base.F[1] * q[0] + base.U[1] * q[1] + base.R[1] * q[2]) * ESCALA_AVION, pos[2] + (base.F[2] * q[0] + base.U[2] * q[1] + base.R[2] * q[2]) * ESCALA_AVION];
    if (d.puntaAla) { const q = d.puntaAla > 0 ? m.luces.derecha : m.luces.izquierda; for (const k of [0, 1, 2]) extra.push(bolaMundo(L([q[0] + 0.3 + k * 0.4, q[1] - 0.05, q[2] * (1 - k * 0.03)]), 0.0005, [35, 32, 30], { min: 1.5 })); }
    if (d.tren >= 2 && a.enSuelo && a.kt > 2 && !reducir) for (let k = 0; k < 4; k++) if ((t * 13 + k * 0.37) % 1 < 0.5) { const q = (d.trenLado || 1) > 0 ? m.luces.derecha : m.luces.izquierda; extra.push(bolaMundo(L([q[0] * 0.3 + k * 0.5, -0.8, q[2] * 0.25]), 0.0007, [255, 190, 90], { tex: 'brillo', min: 2.5, a: 0.9 })); }
  }
  return [...extra, ...primitivasAvion({ palaDoblada: Boolean(d?.helice),
    pos: posicionAvion(a), rumbo: a.rumbo, cabeceo: a.cabeceo, alabeo: a.alabeo, escala: ESCALA_AVION,
    // (0.14.122: la sombra va aparte, proyectada con el sol y según la altura: juego-suelo.js)
    helice: t * (a.rpm / 60) * Math.PI * 2 * 0.2, luces, t, alerones: yugo.alabeo * 15, profundidad: yugo.cabeceo * 12, sombra: null,
  })];
}
export const posicionAvion = a => [a.x, a.ft / VUELO.ftPorUnidad + ALTO_RUEDAS, a.z];

// 0.14.105: la luz de aterrizaje (y la de rodaje, más corta): un brillo en la nariz y, cerca del suelo, el suelo iluminado
// adelante (un abanico claro que no depende del sol: de noche se ve la pista).
export function luzAterrizaje(a, { aterrizaje = false, rodaje = false, suelo = 0 } = {}) {
  if (!aterrizaje && !rodaje) return [];
  const out = [], h = (a.rumbo * Math.PI) / 180, F = [Math.sin(h), Math.cos(h)], R = [Math.cos(h), -Math.sin(h)];
  const pos = posicionAvion(a);
  out.push({ t: 's', p: [pos[0] + F[0] * 0.012, pos[1] - 0.001, pos[2] + F[1] * 0.012], r: 0.0016, c: [255, 246, 220], a: 1, tex: 'brillo', min: 3 });
  const altura = pos[1] - suelo;
  const largo = aterrizaje ? 0.9 : 0.12, k = Math.max(0, 1 - altura / 0.6);
  if (k <= 0) return out;
  const y = suelo + 0.0006, punto = (d, w) => [pos[0] + F[0] * d + R[0] * w, y, pos[2] + F[1] * d + R[1] * w];
  const capas = [[0.02, largo, 0.14 * largo, 0.2], [0.02, largo * 0.65, 0.08 * largo, 0.26]];
  for (const [d0, d1, w, al] of capas) out.push({ t: 'p', p: [punto(d0, -0.004), punto(d1, -w), punto(d1 * 1.05, 0), punto(d1, w), punto(d0, 0.004)], c: [255, 240, 200], a: al * k, luz: 0, n: [0, 1, 0], doble: true });
  return out;
}
