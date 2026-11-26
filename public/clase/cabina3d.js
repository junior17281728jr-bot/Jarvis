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
export const OJO_Z = -0.9; // el ojo del piloto (asiento izquierdo)
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
  return { tablero: m([70, 72, 78]), visera: m([30, 31, 34]), marco: m([40, 42, 47]), techo: m([172, 166, 154]), parasol: m([128, 120, 106]), puerta: m([84, 79, 72]),
    alfombra: m([46, 44, 42]), asiento: m([70, 64, 58]), ala: m([222, 225, 230]), montante: m([200, 204, 210]), yugo: m([36, 37, 41]), cromo: m([150, 155, 162]), radio: m([16, 17, 19]) };
}

// Las primitivas de la cabina. a: el avión (x, z, ft, rumbo, cabeceo, alabeo); pos: su centro en el mundo; yugo
// { alabeo, cabeceo }; potencia, mezcla (0..1); hora.
export function primitivasCabina3d({ pos, rumbo = 0, cabeceo = 0, alabeo = 0, yugo = { alabeo: 0, cabeceo: 0 }, potencia = 0, mezcla = 1, hora = 'dia' }) {
  const B = baseCabina(pos, rumbo, cabeceo, alabeo), W = B.W, C = paleta(hora), out = [];
  const q = (pts, c, extra = {}) => out.push(poligono(pts.map(p => W(...p)), c, { luz: 1, brillo: 0.12, doble: true, grupo: 'cabina', ...extra }));
  // Una caja (en pies, ejes de la cabina).
  const caja = (x0, x1, y0, y1, z0, z1, c, extra) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const f of [[4, 5, 6, 7], [3, 2, 1, 0], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]) q(f.map(i => v[i]), c, extra);
  };
  const T = CABINA3D.tablero, A = T.ancho;
  // El tablero, en franjas (más oscuro abajo: la sombra de la visera arriba y la luz que entra por el parabrisas).
  const franjas = 4;
  for (let i = 0; i < franjas; i++) {
    const y0 = T.yArriba + ((T.yAbajo - T.yArriba) * i) / franjas, y1 = T.yArriba + ((T.yAbajo - T.yArriba) * (i + 1)) / franjas;
    const x0 = T.xArriba + ((T.xAbajo - T.xArriba) * i) / franjas, x1 = T.xArriba + ((T.xAbajo - T.xArriba) * (i + 1)) / franjas;
    const sombra = i === 0 ? 0.72 : 1 - i * 0.04;
    q([[x0, y0, -A], [x0, y0, A], [x1, y1, A], [x1, y1, -A]], C.tablero.map(v => Math.round(v * sombra)), { brillo: 0.05 });
  }
  // La tira de abajo (interruptores) y el pedestal del centro (con la rueda de compensación).
  q([[T.xAbajo, T.yAbajo, -A], [T.xAbajo, T.yAbajo, A], [T.xAbajo - 0.25, T.yAbajo - 0.35, A], [T.xAbajo - 0.25, T.yAbajo - 0.35, -A]], C.visera, { brillo: 0.04 });
  caja(1.4, T.xAbajo, -2.6, T.yAbajo, -0.22, 0.22, C.visera);
  // La visera: curva (más alta en el medio), acolchada, sobresale hacia el piloto.
  const nV = 8;
  for (let i = 0; i < nV; i++) {
    const za = -A + (2 * A * i) / nV, zb = -A + (2 * A * (i + 1)) / nV, alto = z => 0.08 * (1 - (z / A) ** 2);
    q([[T.xArriba + 0.02, T.yArriba + alto(za), za], [T.xArriba + 0.02, T.yArriba + alto(zb), zb], [T.xArriba - 0.32, T.yArriba + 0.06 + alto(zb), zb], [T.xArriba - 0.32, T.yArriba + 0.06 + alto(za), za]], C.visera, { brillo: 0.03 });
    q([[T.xArriba - 0.32, T.yArriba + 0.06 + alto(za), za], [T.xArriba - 0.32, T.yArriba + 0.06 + alto(zb), zb], [T.xArriba - 0.3, T.yArriba - 0.07, zb], [T.xArriba - 0.3, T.yArriba - 0.07, za]], C.visera.map(v => v * 0.8), { brillo: 0.03 });
    // (la parte de arriba de la visera, hasta el parabrisas)
    q([[T.xArriba + 0.02, T.yArriba + alto(za), za], [T.xArriba + 0.02, T.yArriba + alto(zb), zb], [T.xArriba + 0.75, T.yArriba + 0.3, zb], [T.xArriba + 0.75, T.yArriba + 0.3, za]], C.visera.map(v => v * 1.1), { brillo: 0.03 });
  }
  // Los parantes del parabrisas (gruesos, se inclinan hacia atrás y adentro) y el marco de arriba.
  for (const s of [-1, 1]) {
    const z0 = s * 1.8, z1 = s * 1.62;
    q([[3.35, -0.2, z0], [3.35, -0.2, z0 - s * 0.28], [1.45, 1.08, z1 - s * 0.24], [1.45, 1.08, z1]], C.marco, { brillo: 0.08 });
    q([[3.35, -0.2, z0], [3.2, -0.2, z0 + s * 0.05], [1.35, 1.08, z1 + s * 0.05], [1.45, 1.08, z1]], C.marco.map(v => v * 0.8));
  }
  q([[1.55, 1.02, -1.7], [1.55, 1.02, 1.7], [1.35, 1.16, 1.7], [1.35, 1.16, -1.7]], C.marco);
  // El techo tapizado (de adelante hacia atrás) con las costuras (franjas apenas distintas) y los parasoles levantados.
  // (más claro adelante, junto al parabrisas, y más oscuro hacia atrás)
  for (let i = 0; i < 4; i++) { const k0 = 1 - i * 0.16, k1 = 1 - (i + 1) * 0.16, c0 = C.techo.map(v => Math.round(v * k0)), c1 = C.techo.map(v => Math.round(v * k1)); q([[1.4 - i * 0.9, 1.16, -1.85], [1.4 - i * 0.9, 1.16, 1.85], [0.5 - i * 0.9, 1.2, 1.85], [0.5 - i * 0.9, 1.2, -1.85]], c0, { brillo: 0.02, luz: 0.5, cs: [c0, c0, c1, c1] }); }
  for (const s of [-1, 1]) caja(1.0, 1.32, 1.04, 1.13, s * 0.15, s * 1.25, C.parasol);
  // La brújula, colgada arriba en el centro.
  caja(1.42, 1.6, 0.86, 1.02, -0.13, 0.13, C.radio);
  // Las puertas: la parte de abajo tapizada, el marco de la ventana y el parante de atrás.
  for (const s of [-1, 1]) {
    const z = s * 1.9;
    // (la puerta, más oscura abajo: la sombra del tablero y del piso)
    q([[2.5, -0.62, z], [-1.4, -0.62, z], [-1.4, -2.4, z], [2.5, -2.4, z]], C.puerta, { brillo: 0.03, cs: [C.puerta, C.puerta, C.puerta.map(v => v * 0.45), C.puerta.map(v => v * 0.45)] });
    caja(-1.4, 2.4, -0.68, -0.55, z - s * 0.12, z, C.marco); // el borde de la ventana (con el apoyabrazos)
    caja(-0.6, 1.2, -1.0, -0.88, z - s * 0.28, z, C.puerta.map(v => v * 0.85)); // el apoyabrazos
    caja(-0.75, -0.45, -0.62, 1.18, z - s * 0.1, z, C.marco); // el parante de atrás
    caja(-1.4, 2.0, 1.1, 1.2, z - s * 0.1, z, C.marco); // el marco de arriba
  }
  // El ala, vista desde abajo por las ventanas (desde el techo hacia afuera) y el montante que baja al fuselaje.
  for (const s of [-1, 1]) {
    // (el ala por abajo la ilumina el suelo: casi sin sombra del sol)
    q([[2.2, 1.22, s * 1.95], [2.2, 1.35, s * 18], [-2.6, 1.35, s * 18], [-2.6, 1.22, s * 1.95]], C.ala.map(v => Math.round(v * 0.86)), { brillo: 0.2, luz: 0.35 });
    q([[2.25, 1.24, s * 1.95], [2.25, 1.37, s * 18], [2.6, 1.32, s * 18], [2.6, 1.2, s * 1.95]], C.ala.map(v => v * 0.85), { brillo: 0.25 }); // el borde de ataque
    q([[0.9, -1.9, s * 2.05], [1.05, -1.9, s * 2.05], [1.25, 1.24, s * 8.5], [1.1, 1.24, s * 8.5]], C.montante, { brillo: 0.3, luz: 0.6 });
  }
  // El piso y los asientos (el del copiloto se ve al girar la cabeza; el respaldo del piloto, atrás).
  q([[2.4, -2.5, -1.9], [2.4, -2.5, 1.9], [-1.5, -2.5, 1.9], [-1.5, -2.5, -1.9]], C.alfombra, { brillo: 0 });
  for (const zc of [-0.9, 0.9]) { caja(-0.6, 0.7, -2.3, -1.95, zc - 0.48, zc + 0.48, C.asiento); caja(-0.75, -0.55, -1.95, -0.05, zc - 0.48, zc + 0.48, C.asiento); }
  // Las perillas: potencia (negra: entra con más potencia) y mezcla (roja), en el centro de la tira de abajo.
  const sale = p => 0.06 + (1 - Math.max(0, Math.min(1, p))) * 0.38;
  for (const [z, val, col] of [[0.08, potencia, [22, 22, 24]], [0.34, mezcla, [170, 34, 28]]]) {
    const xs = T.xAbajo - 0.05, xp = xs - sale(val), y = T.yAbajo + 0.12;
    caja(xp, xs, y - 0.012, y + 0.012, z - 0.012, z + 0.012, C.cromo, { brillo: 0.6 });
    caja(xp - 0.05, xp, y - 0.035, y + 0.035, z - 0.035, z + 0.035, hora === 'noche' ? col.map(v => v * 0.3) : col, { brillo: 0.35 });
  }
  // Las radios (la pila del centro): cajas negras con sus pantallas (verde y ámbar, con luz propia).
  caja(T.xArriba - 0.04, T.xArriba + 0.02, -1.22, -0.56, -0.05, 0.72, C.radio);
  for (const [y, c] of [[-0.66, [40, 150, 80]], [-0.82, [40, 150, 80]], [-0.98, [40, 150, 80]], [-1.12, [190, 120, 40]]]) q([[T.xArriba - 0.05, y, 0.08], [T.xArriba - 0.05, y, 0.4], [T.xArriba - 0.05, y - 0.035, 0.4], [T.xArriba - 0.05, y - 0.035, 0.08]], c, { luz: 0, brillo: 0 });
  // De noche: la luz roja debajo de la visera (sobre el tablero).
  if (hora === 'noche') q([[T.xArriba - 0.06, T.yArriba - 0.08, -A], [T.xArriba - 0.06, T.yArriba - 0.08, A], [T.xArriba - 0.06, T.yArriba - 0.25, A], [T.xArriba - 0.06, T.yArriba - 0.25, -A]], [255, 60, 40], { luz: 0, a: 0.18 });
  // Los yugos: la columna (cromada) sale del tablero y el volante («cuernos») gira con el alabeo y se acerca al tirar.
  for (const zc of [OJO_Z, -OJO_Z]) {
    const tirar = Math.max(-1, Math.min(1, yugo.cabeceo ?? 0)), giro = (Math.max(-1, Math.min(1, yugo.alabeo ?? 0)) * 40 * Math.PI) / 180;
    const xr = 1.9 - tirar * 0.3, yr = -1.14;
    caja(xr, T.xAbajo + 0.02, yr - 0.022, yr + 0.022, zc - 0.022, zc + 0.022, C.cromo, { brillo: 0.7 });
    const rot = (dz, dy) => [zc + dz * Math.cos(giro) - dy * Math.sin(giro), yr + dz * Math.sin(giro) + dy * Math.cos(giro)];
    const pieza = (a, b, w, c) => { // una barra del volante entre a y b (en z, y del volante)
      const [za, ya] = rot(...a), [zb, yb] = rot(...b), n = [-(yb - ya), zb - za], l = Math.hypot(...n) || 1, k = w / l;
      q([[xr, ya + n[1] * k, za + n[0] * k], [xr, yb + n[1] * k, zb + n[0] * k], [xr, yb - n[1] * k, zb - n[0] * k], [xr, ya - n[1] * k, za - n[0] * k]], c, { brillo: 0.35 });
    };
    pieza([-0.12, 0.02], [0.12, 0.02], 0.05, C.yugo);
    pieza([-0.12, 0.02], [-0.32, -0.04], 0.04, C.yugo); pieza([0.12, 0.02], [0.32, -0.04], 0.04, C.yugo);
    pieza([-0.32, -0.04], [-0.36, 0.2], 0.045, C.yugo); pieza([0.32, -0.04], [0.36, 0.2], 0.045, C.yugo);
    pieza([-0.04, 0.05], [0.04, 0.05], 0.06, C.cromo.map(v => v * 0.8));
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
