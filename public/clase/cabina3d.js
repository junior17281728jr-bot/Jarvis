// 0.14.124 (pedido del dueño: «la cabina dentro… se ve muy falso, como un jueguito, pero por fuera se ve muy bien»): la
// cabina por dentro como geometría 3D de verdad, en la misma escena WebGL y con la misma luz que el avión de afuera: el
// tablero (plástico mate), la visera, los parantes y el marco del parabrisas, el techo tapizado con los parasoles, las
// puertas con sus ventanas, el ala vista desde abajo y el montante, los asientos, los yugos (con su columna) y las perillas
// de potencia y mezcla. Todo se mueve con el avión y con la cabeza (la cámara libre) en perspectiva real. Los relojes vivos se
// dibujan encima, donde cae cada uno del tablero en la pantalla (relojVivo de cabina.js), y del mismo tamaño que tendrían.
// Medidas en pies, desde el centro de la cabina a la altura de los ojos: x adelante, y arriba, z a la derecha. El piloto se
// sienta a la izquierda (OJO_Z). Sin documento ni ventana: devuelve primitivas como las de motor3d.js.
import { baseAvion, poligono, proyectar } from './motor3d.js';
import { VUELO } from './vuelo-modelo.js';
import { relojVivo } from './cabina.js';

const U = 1 / VUELO.ftPorUnidad;
export const OJO_Z = -0.9; // el ojo del piloto (asiento izquierdo, detrás del yugo izquierdo; ~2.5 ft sobre el piso)
export const CABINA3D = Object.freeze({
  // El tablero: su cara (de arriba a abajo, un poco inclinada hacia el piloto) y el ancho de la cabina (~3.6 ft).
  tablero: Object.freeze({ xArriba: 2.62, xAbajo: 2.5, yArriba: -0.46, yAbajo: -1.6, ancho: 1.82 }),
  // Los relojes: dos filas de tres frente al piloto (3¼" de diámetro: r 0.135 ft), el tacómetro y el combustible.
  relojes: Object.freeze([
    ['kt', -1.19, -0.72], ['actitud', -0.9, -0.72], ['alt', -0.61, -0.72],
    ['giro', -1.19, -1.02], ['rumbo', -0.9, -1.02], ['vs', -0.61, -1.02],
    ['rpm', -0.3, -1.02], ['fuel', -1.5, -0.84],
  ]),
  radioReloj: 0.135,
});

// La base de la cabina en el mundo: el centro O (a la altura de los ojos, en el eje del avión) y los ejes F, U, R.
export function baseCabina(pos, rumbo, cabeceo, alabeo) {
  const b = baseAvion(rumbo, cabeceo, alabeo);
  const O = [pos[0] + b.U[0] * 0.0017 + b.F[0] * 0.0016, pos[1] + b.U[1] * 0.0017 + b.F[1] * 0.0016, pos[2] + b.U[2] * 0.0017 + b.F[2] * 0.0016];
  const W = (x, y, z) => [O[0] + (b.F[0] * x + b.U[0] * y + b.R[0] * z) * U, O[1] + (b.F[1] * x + b.U[1] * y + b.R[1] * z) * U, O[2] + (b.F[2] * x + b.U[2] * y + b.R[2] * z) * U];
  return { ...b, O, W, ojo: W(0, 0, OJO_Z) };
}

// Los colores (mate, nada saturado) según la hora: de noche, oscuros (la luz roja va aparte).
function paleta(hora) {
  const k = hora === 'noche' ? 0.28 : hora === 'atardecer' ? 0.75 : 1, m = c => c.map(v => Math.round(v * k));
  return { tablero: m([74, 76, 82]), visera: m([38, 39, 42]), marco: m([58, 60, 66]), techo: m([176, 170, 158]), parasol: m([136, 128, 114]), puerta: m([132, 124, 112]),
    alfombra: m([52, 50, 48]), asiento: m([84, 78, 70]), ala: m([214, 218, 224]), montante: m([200, 204, 210]), yugo: m([34, 35, 38]), cromo: m([170, 176, 184]), radio: m([22, 23, 26]) };
}
// Un poco de «ruido» fijo (la textura mate del tablero): la misma variación siempre en el mismo lugar.
const ruido = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
const oscurecer = (c, k) => c.map(v => Math.round(v * k));

// Un tubo (sección de «lados» lados) a lo largo de un camino de puntos (pies, ejes de la cabina): los cuernos del yugo, los
// parantes, el montante.
function tubo(q, camino, r, c, extra = {}, lados = 6) {
  const aros = camino.map((p, i) => {
    const a = camino[Math.max(0, i - 1)], b = camino[Math.min(camino.length - 1, i + 1)];
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const lt = Math.hypot(...t) || 1; t = t.map(v => v / lt);
    let u = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const n1 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]], l1 = Math.hypot(...n1) || 1;
    const e1 = n1.map(v => v / l1), e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
    return Array.from({ length: lados }, (_, k) => { const g = (k / lados) * Math.PI * 2; return [p[0] + (e1[0] * Math.cos(g) + e2[0] * Math.sin(g)) * r, p[1] + (e1[1] * Math.cos(g) + e2[1] * Math.sin(g)) * r, p[2] + (e1[2] * Math.cos(g) + e2[2] * Math.sin(g)) * r]; });
  });
  for (let i = 0; i < aros.length - 1; i++) for (let k = 0; k < lados; k++) {
    const k2 = (k + 1) % lados, luzLado = 0.75 + 0.25 * Math.cos((k / lados) * Math.PI * 2), luz2 = 0.75 + 0.25 * Math.cos((k2 / lados) * Math.PI * 2);
    // (sombreado suave entre caras: cada vértice con su luz, sin aristas duras)
    const c1 = oscurecer(c, luzLado), c2 = oscurecer(c, luz2);
    q([aros[i][k], aros[i][k2], aros[i + 1][k2], aros[i + 1][k]], c1, { brillo: 0.45, cs: [c1, c2, c2, c1], ...extra });
  }
}
// Una perilla de empujar y tirar (cilindro de 8 lados con su tapa) que mira al piloto (−x).
function perilla(q, x, y, z, r, largo, c) {
  const n = 8, P = (xx, k) => { const g = (k / n) * Math.PI * 2; return [xx, y + Math.sin(g) * r, z + Math.cos(g) * r]; };
  for (let k = 0; k < n; k++) q([P(x, k), P(x, k + 1), P(x + largo, k + 1), P(x + largo, k)], oscurecer(c, 0.7 + 0.3 * Math.sin((k / n) * Math.PI * 2 + 1.2)), { brillo: 0.5 });
  q(Array.from({ length: n }, (_, k) => P(x, k)), c, { brillo: 0.6 });
}
// Una sombra de rincón (oclusión): capas transparentes cada vez más chicas hacia la esquina (un degradé sin texturas).
function rincon(q, esquina, a, b, capas = 3, fuerza = 0.16) {
  for (let k = 0; k < capas; k++) {
    const f = 1 - k / capas, A = esquina.map((v, i) => v + (a[i] - v) * f), Bp = esquina.map((v, i) => v + (b[i] - v) * f);
    q([esquina, A, Bp], [0, 0, 0], { luz: 0, a: fuerza, brillo: 0 });
  }
}

// 0.14.129 (el dueño: «la cabina por dentro se ve un poquito falsa en las esquinas»): las esquinas redondeadas (el tablero se
// curva hacia los costados, la visera se cierra con su tapa y baja hasta el parante), los costados tapizados con su moldura,
// apoyabrazos y bolsillo, el techo curvo con sus costuras, sombras suaves en los rincones y nada que se pise (la sombra de la
// visera va apenas delante del tablero). Lo que no se mueve se arma una sola vez por hora del día (en pies, en los ejes de la
// cabina) y en cada cuadro solo se lleva al mundo; los yugos y las perillas, que se mueven, se arman en cada cuadro.
const T0 = CABINA3D.tablero, PARED = 1.9;
const xTablero = y => T0.xArriba + (T0.xAbajo - T0.xArriba) * ((y - T0.yArriba) / (T0.yAbajo - T0.yArriba));
const cacheFija = new Map();
function piezasFijas(hora) {
  if (cacheFija.has(hora)) return cacheFija.get(hora);
  const C = paleta(hora), out = [], q = (p, c, extra = {}) => out.push({ p, c, extra });
  const T = T0, A = T.ancho;
  // El tablero: una grilla con el color de cada esquina: textura mate (ruido suave) y oclusión horneada (más oscuro arriba,
  // debajo de la visera, y hacia los costados).
  const NZ = 8, NY = 5, pt = (i, j) => { const z = -A + (2 * A * i) / NZ, k = j / NY; return [T.xArriba + (T.xAbajo - T.xArriba) * k, T.yArriba + (T.yAbajo - T.yArriba) * k, z]; };
  const col = (i, j) => { const z = -A + (2 * A * i) / NZ, k = j / NY, ao = (0.55 + 0.45 * Math.min(1, k * 2.2)) * (1 - 0.28 * (Math.abs(z) / A) ** 3); return oscurecer(C.tablero, ao * (0.95 + 0.1 * ruido(i, j))); };
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NY; j++) q([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)], col(i, j), { brillo: 0.04, cs: [col(i, j), col(i + 1, j), col(i + 1, j + 1), col(i, j + 1)] });
  // Las esquinas del tablero: se curvan hacia atrás hasta la pared (un cuarto de círculo de 0.08 ft), más oscuras en el rincón.
  const rf = PARED - A;
  for (const s of [-1, 1]) for (let j = 0; j < NY; j++) {
    const ya = T.yArriba + ((T.yAbajo - T.yArriba) * j) / NY, yb = T.yArriba + ((T.yAbajo - T.yArriba) * (j + 1)) / NY;
    const F = (y, th) => [xTablero(y) - rf + rf * Math.cos(th), y, s * (A + rf * Math.sin(th))];
    for (let k = 0; k < 3; k++) {
      const t0 = (k / 3) * (Math.PI / 2), t1 = ((k + 1) / 3) * (Math.PI / 2), c0 = oscurecer(col(s > 0 ? NZ : 0, j), 0.92 - k * 0.12), c1 = oscurecer(c0, 0.86);
      q([F(ya, t0), F(ya, t1), F(yb, t1), F(yb, t0)], c0, { brillo: 0.03, cs: [c0, c1, c1, c0] });
    }
  }
  // La tira de abajo (inclinada hacia el piloto), de pared a pared.
  const bajo = [[T.xAbajo, T.yAbajo, -PARED], [T.xAbajo, T.yAbajo, PARED], [T.xAbajo - 0.3, T.yAbajo - 0.32, PARED], [T.xAbajo - 0.3, T.yAbajo - 0.32, -PARED]];
  q(bajo, C.visera, { cs: [C.tablero.map(v => v * 0.6), C.tablero.map(v => v * 0.6), C.visera.map(v => v * 0.5), C.visera.map(v => v * 0.5)] });
  // La visera: curva en planta (sale más en el medio) y con el borde redondeado (filas que bajan), mate, de pared a pared;
  // en cada punta, su tapa redondeada que baja hasta el parante.
  const AV = PARED, NV = 14, sal = z => 0.34 * (1 - 0.55 * (z / AV) ** 2), altoV = z => 0.07 * (1 - (z / AV) ** 2);
  const perfil = [[0.02, 0.0], [-0.12, 0.07], [-0.21, 0.075], [-0.28, 0.055], [-0.33, 0.02], [-0.345, -0.03], [-0.32, -0.08], [-0.27, -0.1]];
  const luzP = [1, 1.06, 1.03, 0.95, 0.82, 0.66, 0.5];
  const PV = (z, [dx, dy]) => [T.xArriba + dx * (sal(z) / 0.34), T.yArriba + dy + altoV(z), z];
  for (let i = 0; i < NV; i++) {
    const za = -AV + (2 * AV * i) / NV, zb = -AV + (2 * AV * (i + 1)) / NV;
    for (let k = 0; k < perfil.length - 1; k++) {
      const n0 = 0.96 + 0.08 * ruido(i, k), ca = oscurecer(C.visera, luzP[k] * n0), cb = oscurecer(C.visera, (luzP[k + 1] ?? luzP[k]) * n0);
      q([PV(za, perfil[k]), PV(zb, perfil[k]), PV(zb, perfil[k + 1]), PV(za, perfil[k + 1])], ca, { brillo: 0.03, cs: [ca, ca, cb, cb] });
    }
    q([PV(za, [0.02, 0]), PV(zb, [0.02, 0]), [T.xArriba + 0.4, T.yArriba + 0.14, zb], [T.xArriba + 0.4, T.yArriba + 0.14, za]], oscurecer(C.visera, 0.75), { brillo: 0.02 });
  }
  for (const s of [-1, 1]) {
    const z = s * AV, pts = perfil.map(d => PV(z, d));
    // (la tapa: el perfil cerrado contra la pared, y un faldón que baja al tablero: sin el borde de una caja)
    q([...pts, [T.xArriba + 0.02, T.yArriba - 0.14, z]], oscurecer(C.visera, 0.55), { brillo: 0.02 });
    rincon(q, [xTablero(T.yArriba - 0.1) - 0.01, T.yArriba - 0.1, s * (PARED - 0.005)], [xTablero(T.yArriba - 0.1) - 0.3, T.yArriba - 0.1, s * (PARED - 0.005)], [xTablero(T.yArriba - 0.6) - 0.01, T.yArriba - 0.6, s * (PARED - 0.005)]);
  }
  // La sombra de la visera sobre el tablero (oclusión: dos franjas suaves, apenas delante del tablero: no se pisan).
  for (const [y0, y1, a] of [[-0.08, -0.22, 0.22], [-0.08, -0.36, 0.14]]) {
    const ya = T.yArriba + y0, yb = T.yArriba + y1;
    q([[xTablero(ya) - 0.008, ya, -A], [xTablero(ya) - 0.008, ya, A], [xTablero(yb) - 0.008, yb, A], [xTablero(yb) - 0.008, yb, -A]], [0, 0, 0], { luz: 0, a });
  }
  // Los parantes del parabrisas: finos y redondos, solo a los costados, de la visera al techo; el marco de arriba.
  for (const s of [-1, 1]) tubo(q, [[3.25, -0.12, s * 1.76], [2.4, 0.5, s * 1.72], [1.5, 1.1, s * 1.66]], 0.055, C.marco, {}, 10);
  tubo(q, [[1.5, 1.1, -1.66], [1.52, 1.12, 0], [1.5, 1.1, 1.66]], 0.045, C.marco, {}, 10);
  // El techo tapizado: curvo de lado a lado (más alto en el medio), con sus costuras; más claro adelante.
  const NT = 8, techoY = z => 1.15 + 0.1 * (1 - (z / 1.86) ** 2), xs = [1.5, 0.6, -0.3, -1.2, -2.1];
  for (let r = 0; r < xs.length - 1; r++) for (let i = 0; i < NT; i++) {
    const za = -1.86 + (3.72 * i) / NT, zb = -1.86 + (3.72 * (i + 1)) / NT;
    const tono = (x, z) => oscurecer(C.techo, (1 - (1.5 - x) * 0.09) * (0.82 + 0.18 * (1 - (z / 1.86) ** 2)));
    const P = (x, z) => [x, techoY(z), z];
    q([P(xs[r], za), P(xs[r], zb), P(xs[r + 1], zb), P(xs[r + 1], za)], tono(xs[r], za), { brillo: 0.02, luz: 0.5, cs: [tono(xs[r], za), tono(xs[r], zb), tono(xs[r + 1], zb), tono(xs[r + 1], za)] });
  }
  const costura = oscurecer(C.techo, 0.62);
  for (const x of [0.6, -0.3, -1.2]) for (let i = 0; i < NT; i++) {
    const za = -1.86 + (3.72 * i) / NT, zb = -1.86 + (3.72 * (i + 1)) / NT;
    q([[x + 0.012, techoY(za) - 0.006, za], [x + 0.012, techoY(zb) - 0.006, zb], [x - 0.012, techoY(zb) - 0.006, zb], [x - 0.012, techoY(za) - 0.006, za]], costura, { luz: 0.4, brillo: 0 });
  }
  for (const s of [-1, 1]) q([[1.5, techoY(s * 0.95) - 0.006, s * 0.95 - 0.012], [-2.1, techoY(s * 0.95) - 0.006, s * 0.95 - 0.012], [-2.1, techoY(s * 0.95) - 0.006, s * 0.95 + 0.012], [1.5, techoY(s * 0.95) - 0.006, s * 0.95 + 0.012]], costura, { luz: 0.4, brillo: 0 });
  for (const s of [-1, 1]) q([[1.32, techoY(s * 0.8) - 0.03, s * 0.25], [1.32, techoY(s * 1.3) - 0.03, s * 1.3], [1.0, techoY(s * 1.3) - 0.025, s * 1.3], [1.0, techoY(s * 0.8) - 0.025, s * 0.25]], C.parasol, { luz: 0.6 });
  // La brújula colgada (caja chica) y su soporte.
  q([[1.62, 0.95, -0.1], [1.62, 0.95, 0.1], [1.62, 0.83, 0.1], [1.62, 0.83, -0.1]], C.radio, { brillo: 0.3 });
  tubo(q, [[1.6, 0.95, 0], [1.55, 1.2, 0]], 0.02, C.marco);
  // Los costados (las puertas): tapizado en una grilla (más oscuro abajo y junto al tablero), el alféizar redondeado de la
  // ventana, una moldura, el apoyabrazos, el bolsillo y la costura; el marco de la ventana.
  for (const s of [-1, 1]) {
    const z = s * PARED, xsP = [2.5, 1.6, 0.4, -0.5, -1.4], ysP = [-0.78, -1.2, -1.8, -2.4];
    const tono = (x, y) => oscurecer(C.puerta, (0.55 + 0.45 * ((y + 2.4) / 1.62)) * (1 - 0.35 * Math.max(0, (x - 1.6) / 0.9)));
    for (let a = 0; a < xsP.length - 1; a++) for (let b = 0; b < ysP.length - 1; b++) {
      const P = [[xsP[a], ysP[b], z], [xsP[a + 1], ysP[b], z], [xsP[a + 1], ysP[b + 1], z], [xsP[a], ysP[b + 1], z]];
      q(P, tono(xsP[a], ysP[b]), { brillo: 0.03, luz: 0.35, cs: P.map(v => tono(v[0], v[1])) });
    }
    // (la moldura de arriba, más clara, y el alféizar que se redondea hacia adentro)
    const m0 = oscurecer(C.puerta, 1.08), m1 = oscurecer(C.puerta, 0.8);
    q([[2.5, -0.62, z], [-1.4, -0.62, z], [-1.4, -0.78, z], [2.5, -0.78, z]], m0, { brillo: 0.05, luz: 0.45, cs: [m0, m0, m1, m1] });
    q([[2.5, -0.62, z], [-1.4, -0.62, z], [-1.4, -0.6, z - s * 0.07], [2.5, -0.6, z - s * 0.07]], oscurecer(C.puerta, 1.12), { brillo: 0.08, luz: 0.6 });
    q([[2.5, -0.6, z - s * 0.07], [-1.4, -0.6, z - s * 0.07], [-1.4, -0.66, z - s * 0.11], [2.5, -0.66, z - s * 0.11]], oscurecer(C.puerta, 0.9), { brillo: 0.05, luz: 0.5 });
    q([[2.5, -0.66, z - s * 0.11], [-1.4, -0.66, z - s * 0.11], [-1.4, -0.78, z - s * 0.005], [2.5, -0.78, z - s * 0.005]], oscurecer(C.puerta, 0.7), { brillo: 0.03, luz: 0.4 });
    tubo(q, [[1.25, -1.22, z - s * 0.08], [-0.55, -1.22, z - s * 0.08]], 0.075, oscurecer(C.puerta, 0.82), { luz: 0.5 }, 8);
    q([[1.1, -1.75, z - s * 0.01], [-0.3, -1.75, z - s * 0.01], [-0.3, -2.15, z - s * 0.01], [1.1, -2.15, z - s * 0.01]], oscurecer(C.puerta, 0.5), { luz: 0.3 });
    q([[1.1, -1.75, z - s * 0.01], [-0.3, -1.75, z - s * 0.01], [-0.3, -1.8, z - s * 0.06], [1.1, -1.8, z - s * 0.06]], oscurecer(C.puerta, 0.95), { luz: 0.5 });
    q([[1.6, -0.8, z - s * 0.004], [1.6 - 0.02, -0.8, z - s * 0.004], [1.6 - 0.02, -2.38, z - s * 0.004], [1.6, -2.38, z - s * 0.004]], oscurecer(C.puerta, 0.5), { luz: 0.3 });
    tubo(q, [[-0.6, -0.6, z], [-0.6, 1.15, z]], 0.06, C.marco, {}, 10);
    tubo(q, [[1.5, 1.12, s * 1.68], [1.2, 1.15, z], [-1.4, 1.15, z]], 0.045, C.marco, {}, 8); // (el marco de arriba sale del parante, sin asomar al parabrisas)
    // (los rincones: tablero–pared y pared–piso, en sombra suave)
    rincon(q, [xTablero(-1.2) - 0.08, -1.2, s * (PARED - 0.006)], [xTablero(-1.2) - 0.6, -1.2, s * (PARED - 0.006)], [xTablero(-0.6) - 0.08, -0.6, s * (PARED - 0.006)]);
    rincon(q, [2.4, -2.49, s * (PARED - 0.006)], [1.4, -2.49, s * (PARED - 0.006)], [2.4, -1.9, s * (PARED - 0.006)]);
  }
  // El ala vista desde abajo por las ventanas (su raíz sobre la cabina) y el montante que baja al fuselaje.
  for (const s of [-1, 1]) {
    const c0 = oscurecer(C.ala, 0.88), c1 = oscurecer(C.ala, 0.72);
    q([[2.2, 1.3, s * 1.95], [2.2, 1.4, s * 18], [-2.6, 1.4, s * 18], [-2.6, 1.3, s * 1.95]], c0, { brillo: 0.2, luz: 0.35, cs: [c0, c0, c1, c1] });
    q([[2.25, 1.32, s * 1.95], [2.25, 1.42, s * 18], [2.6, 1.37, s * 18], [2.6, 1.28, s * 1.95]], oscurecer(C.ala, 0.8), { brillo: 0.25, luz: 0.5 });
    tubo(q, [[1.0, -1.9, s * 2.05], [1.18, 1.3, s * 8.5]], 0.07, C.montante, { luz: 0.6 }, 8);
  }
  // El piso y los asientos (el borde del asiento del piloto se ve abajo; el del copiloto, al girar la cabeza).
  q([[2.4, -2.5, -PARED], [2.4, -2.5, PARED], [-1.5, -2.5, PARED], [-1.5, -2.5, -PARED]], C.alfombra, { brillo: 0 });
  for (const zc of [-0.9, 0.9]) {
    const cs = oscurecer(C.asiento, 0.8);
    q([[0.75, -1.98, zc - 0.48], [0.75, -1.98, zc + 0.48], [-0.6, -2.02, zc + 0.48], [-0.6, -2.02, zc - 0.48]], C.asiento, { luz: 0.8 });
    tubo(q, [[0.75, -2.0, zc - 0.48], [0.75, -2.0, zc + 0.48]], 0.07, cs, {}, 8);
    q([[-0.6, -2.0, zc - 0.48], [-0.6, -2.0, zc + 0.48], [-0.75, -0.1, zc + 0.45], [-0.75, -0.1, zc - 0.45]], cs, { luz: 0.8 });
  }
  // Las radios (la pila del centro): negras, con ventanitas chicas apenas iluminadas (apenas delante del tablero).
  const xr = y => xTablero(y) - 0.012;
  q([[xr(-0.58), -0.58, 0.02], [xr(-0.58), -0.58, 0.62], [xr(-1.2), -1.2, 0.62], [xr(-1.2), -1.2, 0.02]], C.radio, { brillo: 0.15 });
  for (const y of [-0.68, -0.84, -1.0, -1.14]) q([[xr(y) - 0.006, y, 0.14], [xr(y) - 0.006, y, 0.3], [xr(y - 0.03) - 0.006, y - 0.03, 0.3], [xr(y - 0.03) - 0.006, y - 0.03, 0.14]], y < -1.1 ? [110, 70, 26] : [22, 80, 48], { luz: 0, brillo: 0 });
  // De noche: la luz roja debajo de la visera.
  // (de noche: la luz roja debajo de la visera, en franjas que se apagan hacia abajo: sin un borde duro)
  if (hora === 'noche') for (const [y0, y1, a] of [[-0.1, -0.24, 0.07], [-0.1, -0.42, 0.05], [-0.1, -0.7, 0.04]]) {
    const ya = T.yArriba + y0, yb = T.yArriba + y1;
    q([[xTablero(ya) - 0.02, ya, -A], [xTablero(ya) - 0.02, ya, A], [xTablero(yb) - 0.02, yb, A], [xTablero(yb) - 0.02, yb, -A]], [255, 60, 40], { luz: 0, a });
  }
  cacheFija.set(hora, out);
  return out;
}
export const piezasFijasCabina = piezasFijas; // (para las pruebas: la misma lista cada vez)

// Las primitivas de la cabina. pos: el centro del avión en el mundo; yugo { alabeo, cabeceo }; potencia, mezcla, calor; hora.
export function primitivasCabina3d({ pos, rumbo = 0, cabeceo = 0, alabeo = 0, yugo = { alabeo: 0, cabeceo: 0 }, potencia = 0, mezcla = 1, calor = false, hora = 'dia' }) {
  const B = baseCabina(pos, rumbo, cabeceo, alabeo), W = B.W, C = paleta(hora), out = [];
  const base = { luz: 1, brillo: 0.08, doble: true, grupo: 'cabina' };
  for (const f of piezasFijas(hora)) out.push(poligono(f.p.map(v => W(v[0], v[1], v[2])), f.c, { ...base, ...f.extra }));
  const q = (pts, c, extra = {}) => out.push(poligono(pts.map(p => W(...p)), c, { ...base, ...extra }));
  const T = CABINA3D.tablero;
  // Las perillas: potencia (negra, entra con más potencia), mezcla (roja) y calor al carburador (gris).
  const sale = p => 0.05 + (1 - Math.max(0, Math.min(1, p))) * 0.35, xs = T.xAbajo - 0.06, yk = T.yAbajo + 0.13;
  for (const [z, val, c, r] of [[-0.18, calor ? 0 : 1, [130, 134, 140], 0.04], [0.06, potencia, [26, 26, 28], 0.055], [0.3, mezcla, [168, 36, 30], 0.05]]) {
    const xp = xs - sale(val);
    tubo(q, [[xs, yk, z], [xp, yk, z]], 0.013, C.cromo);
    perilla(q, xp - 0.07, yk, z, r, 0.07, hora === 'noche' ? oscurecer(c, 0.35) : c);
  }
  // Los yugos: el eje cromado sale del tablero; el volante «cuernos de carnero» (tubos) gira con el alabeo y se acerca al tirar.
  for (const zc of [OJO_Z, -OJO_Z]) {
    const tirar = Math.max(-1, Math.min(1, yugo.cabeceo ?? 0)), giro = (Math.max(-1, Math.min(1, yugo.alabeo ?? 0)) * 40 * Math.PI) / 180;
    const xr = 1.85 - tirar * 0.3, yr = -1.22;
    tubo(q, [[T.xAbajo + 0.02, yr, zc], [xr + 0.04, yr, zc]], 0.032, C.cromo, {}, 8);
    const R = (dz, dy, dx = 0) => [xr + dx, yr + dz * Math.sin(giro) + dy * Math.cos(giro), zc + dz * Math.cos(giro) - dy * Math.sin(giro)];
    for (const sg of [-1, 1]) tubo(q, [R(0, 0.02), R(sg * 0.12, 0.03), R(sg * 0.24, 0.0, -0.02), R(sg * 0.31, -0.06, -0.04), R(sg * 0.34, 0.06, -0.06), R(sg * 0.33, 0.2, -0.06)], 0.033, C.yugo, {}, 8);
    // El centro con su placa (y la marca naranja arriba: se ve cuánto gira).
    q([R(-0.07, 0.07, -0.005), R(0.07, 0.07, -0.005), R(0.07, -0.05, -0.005), R(-0.07, -0.05, -0.005)], [44, 46, 52], { brillo: 0.3 });
    q([R(-0.01, 0.07, -0.01), R(0.01, 0.07, -0.01), R(0.01, 0.04, -0.01), R(-0.01, 0.04, -0.01)], [240, 160, 30], { luz: 0.3 });
  }
  return out;
}

// Los relojes vivos, encima del tablero 3D: cada uno donde cae en la pantalla y de su tamaño (con la perspectiva). →
// { techo: hasta dónde llega el tablero en la pantalla (para las marcas del tráfico) }.
export function relojesCabina3d(ctx, cam, ancho, alto, { pos, rumbo, cabeceo, alabeo, datos, escala = 1, hora = 'dia', textos = {}, extras = {} }) {
  const B = baseCabina(pos, rumbo, cabeceo, alabeo), T = CABINA3D.tablero;
  const enTablero = (z, y) => { const k = (y - T.yArriba) / (T.yAbajo - T.yArriba); return B.W(T.xArriba + (T.xAbajo - T.xArriba) * k - 0.012, y, z); };
  for (const [id, z, y] of CABINA3D.relojes) {
    const r0 = id === 'fuel' ? CABINA3D.radioReloj * 0.6 : CABINA3D.radioReloj;
    const c = proyectar(cam, enTablero(z, y), ancho, alto), b = proyectar(cam, enTablero(z, y + r0), ancho, alto);
    if (!c || !b) continue;
    const r = Math.hypot(b.x - c.x, b.y - c.y);
    if (r < 2 || c.x < -r || c.x > ancho + r || c.y < -r || c.y > alto + r) continue;
    relojVivo(ctx, id, c.x, c.y, r, datos, { escala, hora, textos, extras });
  }
  const arriba = proyectar(cam, B.W(T.xArriba, T.yArriba + 0.08, 0), ancho, alto);
  return { techo: arriba ? Math.max(0, Math.min(alto, arriba.y)) : alto };
}
