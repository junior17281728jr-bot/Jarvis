// 0.14.122 (pedido del dueño: «no puedo saber muy bien si estoy muy pegado del suelo o no, y la sombra del avión ponle
// también»): lo que da la altura a ojo.
//  - La sombra del avión, también en vuelo: la silueta de verdad (el ala, el fuselaje, la cola) proyectada en el suelo en la
//    dirección del sol; cerca del suelo nítida y oscura, más arriba más grande, más clara y borrosa, y desde ~1,300 ft AGL,
//    nada. De noche (o con el cielo cubierto) casi nada.
//  - El detalle del suelo que da la escala: árboles de 25 a 45 ft (con su sombra), cercos vivos de unos 8 ft, galpones y
//    casas, el alambrado del aeropuerto, un camino con autos y los carteles de la calle de rodaje.
//  - Las marcas de la pista que ayudan a juzgar la altura y la distancia: el punto de mira a unos 1,000 ft del umbral y las
//    marcas de la zona de toma de contacto (de a 500 ft) (AIM 2-3-3). El PAPI ya estaba (juego-noche.js).
// Todo se arma una vez (la lista fija: con WebGL se sube una sola vez), salvo la sombra (unos pocos polígonos por cuadro).
// Sin documento ni ventana.
import { baseAvion, poligono, linea, bola, aleatorio, caja } from './motor3d.js';
import { construirAvion } from './avion-modelo.js';
import { PISTA, PISTA_B, VUELO, enAgua } from './vuelo-modelo.js';

const lim = (x, a, b) => Math.min(b, Math.max(a, x));
export const SOMBRA = Object.freeze({ hastaFt: 1300, alfa: 0.4, crece: 1 / 2500 });

// La luz que hace sombra: 1 de día, menos al atardecer, casi nada de noche o con el cielo cubierto.
export const luzDeSombra = (hora, gris = 0, dentro = false) => (dentro ? 0 : (hora === 'noche' ? 0.08 : hora === 'atardecer' ? 0.65 : 1) * (1 - 0.85 * lim(gris, 0, 1)));

// La sombra del avión: a = el avión (x, z, ft, rumbo, cabeceo, alabeo); suelo(x, z) → altura del suelo (unidades); sol
// (vector hacia el sol); escala y altoRuedas del avión del mundo. → polígonos (capa «calco», como las marcas del suelo).
export function sombraAvion(a, { suelo = () => 0, sol = [-0.4, 0.8, -0.45], luz = 1, escala = 0.0032, altoRuedas = 0.0027 } = {}) {
  const pos = [a.x, a.ft / VUELO.ftPorUnidad + altoRuedas, a.z], s0 = suelo(a.x, a.z), y0 = enAgua(a.x, a.z) ? 0 : s0;
  const agl = Math.max(0, (pos[1] - altoRuedas - y0) * VUELO.ftPorUnidad);
  const k = 1 - agl / SOMBRA.hastaFt;
  if (k <= 0 || luz <= 0.02) return [];
  // El sol: si está bajo (o es de noche), la sombra va casi derecha hacia abajo (no se estira al infinito).
  const n = Math.hypot(...sol) || 1, sx = sol[0] / n, sy = Math.max(0.35, sol[1] / n), sz = sol[2] / n;
  const m = construirAvion(), { F, U, R } = baseAvion(a.rumbo, a.cabeceo ?? 0, a.alabeo ?? 0);
  const crece = 1 + agl * SOMBRA.crece, alfa = SOMBRA.alfa * k ** 1.4 * luz, y = y0 + 0.0011;
  const out = [];
  for (const pieza of m.sombra) {
    const w = pieza.map(q => [pos[0] + (F[0] * q[0] + U[0] * q[1] + R[0] * q[2]) * escala, pos[1] + (F[1] * q[0] + U[1] * q[1] + R[1] * q[2]) * escala, pos[2] + (F[2] * q[0] + U[2] * q[1] + R[2] * q[2]) * escala]);
    const pr = w.map(p => { const h = p[1] - y0; return [p[0] - (sx / sy) * h, p[2] - (sz / sy) * h]; });
    const cx = pr.reduce((s, p) => s + p[0], 0) / pr.length, cz = pr.reduce((s, p) => s + p[1], 0) / pr.length;
    // Dos capas: la de adentro (más oscura) y un halo más grande y claro (el borde borroso, más ancho cuanto más alto).
    for (const [f, al] of [[crece, alfa], [crece * (1.08 + agl / 4000), alfa * 0.45]]) {
      out.push(poligono(pr.map(([x, z]) => [cx + (x - cx) * f, y, cz + (z - cz) * f]), [0, 0, 0], { a: al, luz: 0, n: [0, 1, 0], doble: true, capa: 'calco' }));
    }
  }
  return out;
}

// La altura sobre el suelo (ft; sobre el agua, desde el agua).
export function alturaSobreSuelo(a, suelo = () => 0) {
  const y0 = enAgua(a.x, a.z) ? 0 : suelo(a.x, a.z);
  return Math.max(0, a.ft - y0 * VUELO.ftPorUnidad);
}

// Un rectángulo en el suelo de una pista (a lo largo «a», de costado «c», en ft desde el centro de la pista).
function rectPista(p, a0, a1, c0, c1, y, color) {
  const h = (p.rumbo * Math.PI) / 180, f = [Math.sin(h), Math.cos(h)], r = [Math.cos(h), -Math.sin(h)], u = VUELO.ftPorUnidad;
  const q = (a, c) => [p.x + (f[0] * a + r[0] * c) / u, y, p.z + (f[1] * a + r[1] * c) / u];
  return poligono([q(a0, c0), q(a1, c0), q(a1, c1), q(a0, c1)], color, { luz: 0, n: [0, 1, 0], doble: true, capa: 'calco' });
}
// Las marcas de la pista (AIM 2-3-3): el punto de mira (dos franjas anchas a ~1,000 ft del umbral) y las de la zona de toma
// de contacto (3 barras a 500 ft; las que quedan a menos de 900 ft del medio de la pista no van). En las dos cabeceras.
export const MARCAS_PISTA = Object.freeze({ miraFt: 1000, miraLargoFt: 150, tdzFt: 500, tdzLargoFt: 75, sinTdzCercaDelMedioFt: 900, fuente: 'AIM 2-3-3' });
export function marcasPista(p) {
  const out = [], L = p.largoFt / 2, W = p.anchoFt / 2, blanco = [242, 244, 246], y = 0.00048;
  for (const s of [-1, 1]) {
    const desde = d => s * (L - d); // a «d» ft del umbral de esa cabecera
    const tramo = (d, largo) => [Math.min(desde(d), desde(d + largo)), Math.max(desde(d), desde(d + largo))];
    // El punto de mira: dos franjas a cada lado del eje.
    const [m0, m1] = tramo(MARCAS_PISTA.miraFt, MARCAS_PISTA.miraLargoFt);
    for (const c of [-1, 1]) out.push(rectPista(p, m0, m1, c * W * 0.22, c * W * 0.52, y, blanco));
    // La zona de toma de contacto: tres barras a cada lado, a 500 ft (si no queda cerca del medio).
    if (L - (MARCAS_PISTA.tdzFt + MARCAS_PISTA.tdzLargoFt) >= MARCAS_PISTA.sinTdzCercaDelMedioFt) {
      const [t0, t1] = tramo(MARCAS_PISTA.tdzFt, MARCAS_PISTA.tdzLargoFt);
      for (const c of [-1, 1]) for (let b = 0; b < 3; b++) out.push(rectPista(p, t0, t1, c * W * (0.22 + b * 0.11), c * W * (0.28 + b * 0.11), y, blanco));
    }
  }
  return out;
}

// El detalle del suelo cerca de los aeropuertos (fijo; con tope: unos 230 árboles, 9 galpones y casas, 6 cercos vivos, el
// alambrado, un camino con 6 autos y 4 carteles). sol: hacia el sol (para la sombra de los árboles); noche: sin sombras.
export const DETALLE = Object.freeze({ arboles: 230, arbolFt: [25, 45], cercoFt: 8, casas: 9, autos: 6 });
export function detalleSuelo({ sol = [-0.4, 0.8, -0.45], noche = false, paleta = null } = {}) {
  const out = [], azar = aleatorio(77), u = VUELO.ftPorUnidad;
  const n = Math.hypot(...sol) || 1, sx = sol[0] / n, sy = Math.max(0.35, sol[1] / n), sz = sol[2] / n;
  const verde = paleta?.noche ? [26, 38, 28] : [58, 92, 52], tronco = paleta?.noche ? [30, 24, 20] : [92, 70, 50];
  // ¿Lejos de las pistas, sus calles y la final? (allí no va nada alto)
  const libre = (x, z) => {
    for (const p of [PISTA, PISTA_B]) {
      const h = (p.rumbo * Math.PI) / 180, dx = x - p.x, dz = z - p.z;
      const a = (dx * Math.sin(h) + dz * Math.cos(h)) * u, c = Math.abs(dx * Math.cos(h) - dz * Math.sin(h)) * u;
      if (Math.abs(a) < p.largoFt / 2 + 600 && c < 700) return false; // la pista, la calle de rodaje y la plataforma
      if (Math.abs(a) < p.largoFt / 2 + 6000 && c < 350) return false; // la final y la salida
    }
    return !enAgua(x, z);
  };
  const arbol = (x, z) => {
    const alto = (DETALLE.arbolFt[0] + azar() * (DETALLE.arbolFt[1] - DETALLE.arbolFt[0])) / u, r = alto * 0.32;
    out.push(linea([[x, 0, z], [x, alto - r, z]], tronco, { w: 2 }));
    out.push(bola([x, alto - r * 0.9, z], r, verde.map(v => Math.round(v * (0.85 + azar() * 0.3))), { sombra: 0.8 }));
    if (!noche) {
      const cx = x - (sx / sy) * (alto - r), cz = z - (sz / sy) * (alto - r), rr = r * 1.05;
      out.push(poligono(Array.from({ length: 8 }, (_, i) => { const g = (i / 8) * Math.PI * 2; return [cx + Math.cos(g) * rr * 1.25, 0.0012, cz + Math.sin(g) * rr]; }), [0, 0, 0], { a: 0.26, luz: 0, n: [0, 1, 0], doble: true, capa: 'calco' }));
    }
  };
  // Grupos de árboles (montes y filas en los bordes de los campos) alrededor de los dos aeropuertos.
  let puestos = 0;
  for (const [ox, oz, radio] of [[PISTA.x, PISTA.z, 5], [PISTA_B.x, PISTA_B.z, 4]]) {
    for (let g = 0; g < 14 && puestos < DETALLE.arboles; g++) {
      const gx = ox + (azar() - 0.5) * radio * 2, gz = oz + (azar() - 0.5) * radio * 2, cuantos = 5 + Math.floor(azar() * 8), fila = azar() < 0.5;
      for (let k = 0; k < cuantos && puestos < DETALLE.arboles; k++) {
        const x = fila ? gx + k * 0.035 : gx + (azar() - 0.5) * 0.18, z = fila ? gz + (azar() - 0.5) * 0.01 : gz + (azar() - 0.5) * 0.18;
        if (libre(x, z)) { arbol(x, z); puestos++; }
      }
    }
  }
  // Cercos vivos (unos 8 ft) a lo largo de los bordes de los campos.
  for (let k = 0; k < 6; k++) {
    const x0 = PISTA.x + (k % 2 ? 1 : -1) * (0.9 + azar() * 1.5), z0 = PISTA.z - 3 + azar() * 6, largo = 0.4 + azar() * 0.4, dir = azar() < 0.5;
    for (let d = 0; d <= largo; d += 0.012) { const x = dir ? x0 + d : x0, z = dir ? z0 : z0 + d; if (libre(x, z)) out.push(bola([x, DETALLE.cercoFt / u / 2, z], DETALLE.cercoFt / u / 2, verde.map(v => Math.round(v * 0.9)))); }
  }
  // Galpones y casas (paredes claras, techo oscuro): 40 a 60 ft de largo, 15 a 25 ft de alto.
  for (let k = 0; k < DETALLE.casas; k++) {
    const x = PISTA.x + (azar() - 0.5) * 7, z = PISTA.z + (azar() - 0.5) * 9;
    if (!libre(x, z)) continue;
    const l = (40 + azar() * 20) / u / 2, a = (25 + azar() * 10) / u / 2, h = (15 + azar() * 10) / u;
    const pared = azar() < 0.5 ? [222, 214, 196] : [170, 60, 48];
    out.push(...caja(x - l, 0, z - a, x + l, h, z + a, paleta?.noche ? pared.map(v => v * 0.3) : pared));
    out.push(...caja(x - l * 1.05, h, z - a * 1.05, x + l * 1.05, h + 0.004, z + a * 1.05, paleta?.noche ? [24, 24, 28] : [70, 72, 80]));
  }
  // El alambrado del aeropuerto (6 ft) alrededor de la pista 36.
  const ax = PISTA.x, az = PISTA.z, al = PISTA.largoFt / u / 2 + 0.35, aw = 0.42, hf = 6 / u, gris = [150, 152, 158];
  for (const [p, q] of [[[ax - aw, az - al], [ax + aw, az - al]], [[ax + aw, az - al], [ax + aw, az + al]], [[ax + aw, az + al], [ax - aw, az + al]], [[ax - aw, az + al], [ax - aw, az - al]]]) {
    out.push(linea([[p[0], hf, p[1]], [q[0], hf, q[1]]], gris, { w: 1, a: 0.7 }));
  }
  // Un camino (de norte a sur, al oeste) con autos.
  const cx = PISTA.x - 1.25;
  out.push(poligono([[cx - 0.012, 0.0006, -9], [cx + 0.012, 0.0006, -9], [cx + 0.012, 0.0006, 9], [cx - 0.012, 0.0006, 9]], [74, 76, 80], { luz: 0, n: [0, 1, 0], doble: true, capa: 'calco' }));
  for (let k = 0; k < DETALLE.autos; k++) {
    const z = -7 + k * 2.6 + azar(), x = cx + (k % 2 ? 0.005 : -0.005), c = [[200, 40, 40], [240, 240, 240], [40, 70, 160], [30, 30, 34]][k % 4];
    out.push(...caja(x - 0.003, 0.0006, z - 0.0075, x + 0.003, 0.0055, z + 0.0075, c));
  }
  // Los carteles de la calle de rodaje (amarillo y negro, 3 ft).
  for (const z of [-1.8, -0.6, 0.6, 1.8]) out.push(...caja(PISTA.x + 0.11, 0, PISTA.z + z - 0.004, PISTA.x + 0.113, 0.003, PISTA.z + z + 0.004, [240, 200, 40]));
  return out;
}
