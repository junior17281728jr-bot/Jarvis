// 0.14.78: un motor 3D chico, propio y sin dependencias, para las escenas 3D de las clases (escena3d.js). Dibuja en un
// lienzo 2D: proyección en perspectiva con una cámara, polígonos rellenos ordenados por el algoritmo del pintor (lo de
// lejos primero), sombreado plano con un sol, niebla por distancia, volúmenes semitransparentes (el espacio aéreo),
// líneas, puntos que brillan, nubes de bolas, etiquetas que siempre miran a la cámara (sin pisarse), el cielo con su
// horizonte, el terreno, el avión y la cabina vista desde adentro.
// Mundo: x = este, y = arriba, z = norte. Rumbo de brújula h → adelante (sin h, 0, cos h). Nada toca document ni window:
// el contexto del lienzo llega de afuera (las pruebas usan uno de mentira).

import { dibujarCabina as dibujarCabinaCompleta } from './cabina.js';
import { construirAvion } from './avion-modelo.js';

// ---------- vectores ----------
export const suma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const por = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const largo = a => Math.hypot(a[0], a[1], a[2]);
export const unitario = a => { const l = largo(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mezclar3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
export const rad = g => (g * Math.PI) / 180;
export const grados = r => (r * 180) / Math.PI;
// Suavizados para la cámara (entra y sale despacio).
export const suave3 = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const suave = t => t * t * (3 - 2 * t);
export const mezclarAngulo = (a, b, t) => { const d = ((((b - a) % 360) + 540) % 360) - 180; return a + d * t; };

// ---------- cámara ----------
// La cámara: desde «ojo» mirando a «mira»; fov vertical en grados. Base derecha/sube/adelante (mano izquierda en pantalla).
export function crearCamara({ ojo, mira, arriba = [0, 1, 0], fov = 50, cerca = 0.02 }) {
  const adelante = unitario(resta(mira, ojo));
  let derecha = cruz(arriba, adelante);
  if (largo(derecha) < 1e-6) derecha = cruz([0, 0, 1], adelante);
  derecha = unitario(derecha);
  const sube = cruz(adelante, derecha);
  return { ojo: [...ojo], adelante, derecha, sube, fov, cerca };
}
// Órbita (tercera persona): alrededor de «mira», a «dist», girada «giro» (grados, como un rumbo: 0 = desde el sur
// mirando al norte) y levantada «alto» (grados sobre el horizonte).
export function ojoOrbita({ mira, giro, alto, dist }) {
  const g = rad(giro), a = rad(alto);
  return [mira[0] - Math.sin(g) * Math.cos(a) * dist, mira[1] + Math.sin(a) * dist, mira[2] - Math.cos(g) * Math.cos(a) * dist];
}
export const focal = (cam, alto) => alto / 2 / Math.tan(rad(cam.fov) / 2);
export function aCamara(cam, p) {
  const dx = p[0] - cam.ojo[0], dy = p[1] - cam.ojo[1], dz = p[2] - cam.ojo[2];
  const d = cam.derecha, s = cam.sube, f = cam.adelante;
  return [dx * d[0] + dy * d[1] + dz * d[2], dx * s[0] + dy * s[1] + dz * s[2], dx * f[0] + dy * f[1] + dz * f[2]];
}
// Un punto del mundo → { x, y, z } en pantalla (z = profundidad), o null si queda detrás del plano cercano.
export function proyectar(cam, p, ancho, alto) {
  const c = aCamara(cam, p);
  if (c[2] < cam.cerca) return null;
  const f = focal(cam, alto);
  return { x: ancho / 2 + (f * c[0]) / c[2], y: alto / 2 - (f * c[1]) / c[2], z: c[2] };
}
// Recorta un polígono (en coordenadas de cámara) contra el plano z = cerca (Sutherland-Hodgman). Así lo que cruza la
// cámara (primera persona dentro de un volumen) no se da vuelta ni da NaN.
export function recortarCerca(pts, cerca) {
  const fuera = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const da = a[2] >= cerca, db = b[2] >= cerca;
    if (da) fuera.push(a);
    if (da !== db) {
      const t = (cerca - a[2]) / (b[2] - a[2]);
      fuera.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cerca]);
    }
  }
  return fuera;
}

// ---------- primitivas ----------
// Polígono: { t:'p', p:[[x,y,z]…], c:[r,g,b] (0-255), a (opacidad), luz (1 sombreado, 0 plano), doble (se ve de los dos
// lados), borde?: [r,g,b,a], n (normal) }. Línea: { t:'l', p:[…], c, a, w (px CSS), guion?:[…] }. Punto: { t:'s', p, r
// (radio en el mundo), c, a, tex?: 'nube'|'brillo', min (px) }. «sesgo» corre la profundidad para el orden.
export function normalDe(p) {
  // Newell: sirve para polígonos de cualquier cantidad de lados (y casi planos).
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unitario([x, y, z]);
}
export const poligono = (p, c, extra = {}) => ({ t: 'p', p, c, a: 1, luz: 1, n: normalDe(p), ...extra });
export const linea = (p, c, extra = {}) => ({ t: 'l', p, c, a: 1, w: 1.5, ...extra });
export const bola = (p, r, c, extra = {}) => ({ t: 's', p, r, c, a: 1, ...extra });

// Un cilindro vertical (el núcleo de un espacio aéreo): lados, tapa y bordes nítidos arriba y abajo.
export function cilindro(centro, r, y0, y1, c, { lados = 40, a = 0.22, tapa = true, base = false, borde = null, guion = null, sesgo = 0 } = {}) {
  const [cx, cz] = centro, out = [], arriba = [], abajo = [];
  for (let i = 0; i < lados; i++) {
    const g = (i / lados) * Math.PI * 2;
    arriba.push([cx + Math.sin(g) * r, y1, cz + Math.cos(g) * r]);
    abajo.push([cx + Math.sin(g) * r, y0, cz + Math.cos(g) * r]);
  }
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    out.push(poligono([abajo[i], abajo[j], arriba[j], arriba[i]], c, { a, doble: true, luz: 0.6, sesgo }));
  }
  if (tapa) out.push(...tapaCircular(centro, 0, r, y1, c, { lados, a: a * 0.8, sesgo }));
  if (base) out.push(...tapaCircular(centro, 0, r, y0, c, { lados, a: a * 0.6, sesgo }));
  if (borde) {
    out.push(linea([...arriba, arriba[0]], borde, { a: borde[3] ?? 0.95, w: 1.6, guion }));
    out.push(linea([...abajo, abajo[0]], borde, { a: (borde[3] ?? 0.95) * 0.8, w: 1.3, guion }));
  }
  return out;
}
// Un anillo (la «repisa» de un espacio aéreo): de r0 a r1, entre y0 e y1.
export function anillo(centro, r0, r1, y0, y1, c, { lados = 44, a = 0.2, borde = null, guion = null, sesgo = 0 } = {}) {
  const [cx, cz] = centro, out = [];
  const anillo = (r, y) => Array.from({ length: lados }, (_, i) => { const g = (i / lados) * Math.PI * 2; return [cx + Math.sin(g) * r, y, cz + Math.cos(g) * r]; });
  const fa = anillo(r1, y1), fb = anillo(r1, y0), da = anillo(r0, y1), db = anillo(r0, y0);
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    out.push(poligono([fb[i], fb[j], fa[j], fa[i]], c, { a, doble: true, luz: 0.6, sesgo }));
    out.push(poligono([db[i], db[j], da[j], da[i]], c, { a: a * 0.7, doble: true, luz: 0.6, sesgo }));
    out.push(poligono([da[i], da[j], fa[j], fa[i]], c, { a: a * 0.8, doble: true, luz: 0.8, sesgo }));
    out.push(poligono([db[i], db[j], fb[j], fb[i]], c, { a: a * 0.55, doble: true, luz: 0.5, sesgo }));
  }
  if (borde) {
    for (const [l, k] of [[fa, 1], [fb, 0.8], [da, 0.7]]) out.push(linea([...l, l[0]], borde, { a: (borde[3] ?? 0.95) * k, w: 1.5, guion }));
  }
  return out;
}
// Una tapa (disco o corona) partida en sectores: así el orden del pintor funciona con algo dentro.
export function tapaCircular(centro, r0, r1, y, c, { lados = 40, a = 0.2, sesgo = 0, luz = 0.9 } = {}) {
  const [cx, cz] = centro, out = [];
  const sectores = Math.max(6, Math.round(lados / 4)), paso = lados / sectores;
  for (let s = 0; s < sectores; s++) {
    const pts = [];
    for (let k = 0; k <= paso; k++) { const g = ((s * paso + k) / lados) * Math.PI * 2; pts.push([cx + Math.sin(g) * r1, y, cz + Math.cos(g) * r1]); }
    if (r0 > 0) for (let k = paso; k >= 0; k--) { const g = ((s * paso + k) / lados) * Math.PI * 2; pts.push([cx + Math.sin(g) * r0, y, cz + Math.cos(g) * r0]); }
    else pts.push([cx, y, cz]);
    out.push(poligono(pts, c, { a, doble: true, luz, sesgo }));
  }
  return out;
}
// Una lámina horizontal partida en baldosas (el piso de la Clase A o de la Clase E).
export function lamina(x0, z0, x1, z1, y, c, { n = 6, a = 0.12, sesgo = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const ax = x0 + ((x1 - x0) * i) / n, bx = x0 + ((x1 - x0) * (i + 1)) / n;
    const az = z0 + ((z1 - z0) * j) / n, bz = z0 + ((z1 - z0) * (j + 1)) / n;
    out.push(poligono([[ax, y, az], [bx, y, az], [bx, y, bz], [ax, y, bz]], c, { a, doble: true, luz: 0, sesgo }));
  }
  return out;
}
// Una caja alineada con los ejes (edificios, la torre).
export function caja(x0, y0, z0, x1, y1, z1, c, extra = {}) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  const caras = [[4, 5, 6, 7], [3, 2, 1, 0], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  return caras.map(f => poligono(f.map(i => v[i]), c, extra));
}
// Una caja semitransparente con sus aristas nítidas (una «rebanada» de espacio aéreo).
export function cajaVolumen(x0, y0, z0, x1, y1, z1, c, { a = 0.16, borde = null, sesgo = 0 } = {}) {
  const out = caja(x0, y0, z0, x1, y1, z1, c, { a, doble: true, luz: 0.6, sesgo });
  if (borde) {
    const k = borde[3] ?? 0.9;
    for (const y of [y0, y1]) out.push(linea([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]], borde, { a: k, w: 1.4 }));
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) out.push(linea([[x, y0, z], [x, y1, z]], borde, { a: k * 0.8, w: 1.2 }));
  }
  return out;
}
// Una nube de bolas: un cúmulo (varias bolas encimadas, la base plana) en p con radio r. «semilla» la hace siempre igual.
export function nube(p, r, { semilla = 1, bolas = 9, c = [255, 255, 255], a = 0.92, alto = 1, plana = false } = {}) {
  const azar = aleatorio(semilla), out = [];
  for (let i = 0; i < bolas; i++) {
    const g = azar() * Math.PI * 2, d = azar() * r * (plana ? 1.1 : 0.75);
    const rr = r * (plana ? 0.35 + azar() * 0.25 : 0.38 + azar() * 0.32);
    const y = plana ? azar() * r * 0.12 : (azar() * 0.9 + 0.15) * r * 0.55 * alto;
    out.push(bola([p[0] + Math.sin(g) * d, p[1] + y + rr * (plana ? 0.15 : 0.35), p[2] + Math.cos(g) * d * (plana ? 1 : 0.8)], rr, c, { a, tex: 'nube', sombra: 1 - y / (r * 1.4) }));
  }
  return out;
}
// Números al azar pero siempre los mismos (mulberry32): el terreno y las nubes no cambian de una vez a otra.
export function aleatorio(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Ruido suave (valor en una grilla, interpolado): colinas.
export function ruido(x, z, semilla = 7) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(semilla, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(z), fx = suave(x - i), fz = suave(z - j);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
// El terreno: una grilla de cuadros con su altura y su color; las líneas de la grilla dan la escala.
export function terreno({ x0, z0, x1, z1, n = 24, altura = () => 0, color = () => [120, 160, 100], grilla = null }) {
  const out = [];
  const X = i => x0 + ((x1 - x0) * i) / n, Z = j => z0 + ((z1 - z0) * j) / n;
  const alt = [];
  for (let i = 0; i <= n; i++) { alt.push([]); for (let j = 0; j <= n; j++) alt[i].push(altura(X(i), Z(j))); }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = [[X(i), alt[i][j], Z(j)], [X(i), alt[i][j + 1], Z(j + 1)], [X(i + 1), alt[i + 1][j + 1], Z(j + 1)], [X(i + 1), alt[i + 1][j], Z(j)]];
    const cx = (X(i) + X(i + 1)) / 2, cz = (Z(j) + Z(j + 1)) / 2, cy = (alt[i][j] + alt[i + 1][j + 1]) / 2;
    out.push(poligono(p, color(cx, cz, cy), { luz: 1, borde: grilla }));
  }
  return out;
}

// ---------- el avión ----------
// 0.14.114: el modelo vive en avion-modelo.js (proporciones de un Cessna 172, perfiles, montantes, carenados, ventanas,
// franja, hélice torcida). Aquí se pone en el mundo: x adelante, y arriba, z a la derecha del piloto; unas 8.4 unidades
// de largo y las ruedas 0.86 por debajo del centro.
export function modeloAvion() { return construirAvion(); }
// La base del avión con rumbo, cabeceo y alabeo (grados; alabeo + = ala derecha abajo).
export function baseAvion(rumbo, cabeceo = 0, alabeo = 0) {
  const h = rad(rumbo), t = rad(cabeceo), b = rad(alabeo);
  const F = [Math.sin(h) * Math.cos(t), Math.sin(t), Math.cos(h) * Math.cos(t)];
  const R0 = [Math.cos(h), 0, -Math.sin(h)];
  const U0 = cruz(F, R0);
  const R = suma(por(R0, Math.cos(b)), por(U0, -Math.sin(b)));
  const U = suma(por(U0, Math.cos(b)), por(R0, Math.sin(b)));
  return { F, U, R };
}
export const local = (pos, base, escala, [x, y, z]) => [
  pos[0] + (base.F[0] * x + base.U[0] * y + base.R[0] * z) * escala,
  pos[1] + (base.F[1] * x + base.U[1] * y + base.R[1] * z) * escala,
  pos[2] + (base.F[2] * x + base.U[2] * y + base.R[2] * z) * escala,
];
// Girar un punto (o una normal, con o = [0,0,0]) alrededor del eje o→o+u (unitario), «ang» radianes (Rodrigues).
function girarEje(v, o, u, c, s) {
  const x = v[0] - o[0], y = v[1] - o[1], z = v[2] - o[2], d = (u[0] * x + u[1] * y + u[2] * z) * (1 - c);
  return [o[0] + x * c + (u[1] * z - u[2] * y) * s + u[0] * d, o[1] + y * c + (u[2] * x - u[0] * z) * s + u[1] * d, o[2] + z * c + (u[0] * y - u[1] * x) * s + u[2] * d];
}
const CERO = [0, 0, 0];
// Las primitivas del avión en el mundo: pos, rumbo, cabeceo, alabeo, escala y el ángulo de la hélice (radianes).
// alerones y profundidad: cuánto se mueven (grados; alerones + = el derecho baja); t: el reloj (destello de las luces).
export function primitivasAvion({ pos, rumbo = 0, cabeceo = 0, alabeo = 0, escala = 1, helice = 0, luces = true, sombra = null, alerones = 0, profundidad = 0, t = 0 }) {
  const m = construirAvion(), base = baseAvion(rumbo, cabeceo, alabeo);
  const { F, U, R } = base;
  const L = q => [pos[0] + (F[0] * q[0] + U[0] * q[1] + R[0] * q[2]) * escala, pos[1] + (F[1] * q[0] + U[1] * q[1] + R[1] * q[2]) * escala, pos[2] + (F[2] * q[0] + U[2] * q[1] + R[2] * q[2]) * escala];
  const N = n => [F[0] * n[0] + U[0] * n[1] + R[0] * n[2], F[1] * n[0] + U[1] * n[1] + R[1] * n[2], F[2] * n[0] + U[2] * n[1] + R[2] * n[2]];
  const out = [];
  // Los vértices y las normales se pasan al mundo una vez (las caras vecinas los comparten).
  const caras = (lista, vertices, normales, gV = null, gN = null) => {
    const W = vertices.map(gV ? v => L(gV(v)) : L), NW = normales.map(gN ? n => N(gN(n)) : N);
    for (const f of lista) out.push({ t: 'p', p: f.vi.map(i => W[i]), ns: f.ni.map(i => NW[i]), c: f.c, a: 1, luz: 1, n: N(gN ? gN(f.n) : f.n), doble: Boolean(f.doble), grupo: 'avion', brillo: f.brillo ?? 0.3, refleja: f.refleja ?? 0 });
  };
  caras(m.caras, m.vertices, m.normales);
  // Las superficies que se mueven, giradas en su bisagra: los alerones (uno sube, el otro baja) y el timón de profundidad.
  for (const mv of m.moviles) {
    const ang = rad(mv.tipo === 'aleron' ? alerones * mv.lado : -profundidad);
    if (!ang) { caras(mv.caras, mv.vertices, mv.normales); continue; }
    const [o, b] = mv.eje, u = unitario(resta(b, o)), c = Math.cos(ang), s = Math.sin(ang);
    caras(mv.caras, mv.vertices, mv.normales, v => girarEje(v, o, u, c, s), n => girarEje(n, CERO, u, c, s));
  }
  // La hélice: dos palas que giran (en el eje de la nariz) y un disco borroso.
  const nz = m.nariz;
  for (const g0 of [0, Math.PI]) {
    const c = Math.cos(helice + g0), s = Math.sin(helice + g0);
    const gira = v => [v[0], nz[1] + (v[1] - nz[1]) * c - v[2] * s, (v[1] - nz[1]) * s + v[2] * c];
    for (const f of m.pala) { const p = f.p.map(gira); out.push({ t: 'p', p: p.map(L), c: f.c, a: 1, luz: 0.8, n: N(normalDe(p)), doble: true, grupo: 'avion', brillo: f.brillo }); }
  }
  const rh = m.radioHelice;
  const disco = Array.from({ length: 18 }, (_, i) => { const g = (i / 18) * Math.PI * 2; return L([nz[0] + 0.03, nz[1] + Math.cos(g) * rh, Math.sin(g) * rh]); });
  out.push({ t: 'p', p: disco, c: [200, 206, 218], a: 0.13, luz: 0, n: F, doble: true, grupo: 'avion' });
  // luces: true (todas) o { nav, baliza, estrobo } (0.14.105: las que tiene encendidas el avión).
  const lz = luces === true ? { nav: true, baliza: true, estrobo: true } : luces || {};
  if (lz.nav) {
    out.push(bola(L(m.luces.izquierda), 0.16 * escala, [255, 40, 40], { tex: 'brillo', min: 2.5, a: 0.95, luzAvion: 'izquierda' }));
    out.push(bola(L(m.luces.derecha), 0.16 * escala, [40, 255, 110], { tex: 'brillo', min: 2.5, a: 0.95, luzAvion: 'derecha' }));
    out.push(bola(L(m.luces.cola), 0.13 * escala, [255, 255, 255], { tex: 'brillo', min: 2, a: 0.9, luzAvion: 'cola' }));
  }
  // Las estroboscópicas (un destello blanco en las puntas) y la baliza roja de la deriva.
  if (lz.estrobo && t % 1.3 < 0.08) for (const q of [m.luces.izquierda, m.luces.derecha]) out.push(bola(L(q), 0.5 * escala, [255, 255, 255], { tex: 'brillo', min: 6, a: 1, luzAvion: 'estrobo' }));
  if (lz.baliza && (t + 0.5) % 1 < 0.12) out.push(bola(L(m.luces.baliza), 0.3 * escala, [255, 60, 40], { tex: 'brillo', min: 3, a: 1, luzAvion: 'baliza' }));
  // La sombra en el suelo: la silueta del avión vista desde arriba (con su alabeo y su cabeceo), en piezas que no se
  // pisan. Ayuda a ver a qué altura va y hacia dónde.
  if (sombra != null) {
    for (const pieza of m.sombra) {
      const s = pieza.map(q => { const w = L(q); return [w[0], sombra + 0.001, w[2]]; });
      out.push({ t: 'p', p: s, c: [0, 0, 0], a: 0.26, luz: 0, n: [0, 1, 0], doble: true, capa: 'calco' });
    }
  }
  return out;
}

// ---------- rutas ----------
// Una ruta suave (Catmull-Rom) por unos puntos, medida por su largo: en(s) da el punto y la dirección a la distancia s.
export function crearRuta(puntos, cerrada = false) {
  const P = puntos.map(p => [...p]);
  const n = P.length;
  const seg = cerrada ? n : n - 1;
  const punto = (i, t) => {
    const g = k => (cerrada ? P[((k % n) + n) % n] : P[limitar(k, 0, n - 1)]);
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  };
  // Tabla de largo (para avanzar a velocidad pareja).
  const muestras = [], porSeg = 24;
  let total = 0, antes = punto(0, 0);
  muestras.push({ s: 0, i: 0, t: 0, p: antes });
  for (let i = 0; i < seg; i++) for (let k = 1; k <= porSeg; k++) {
    const p = punto(i, k / porSeg);
    total += Math.hypot(p[0] - antes[0], p[1] - antes[1], p[2] - antes[2]);
    muestras.push({ s: total, i, t: k / porSeg, p });
    antes = p;
  }
  const en = s => {
    s = cerrada ? ((s % total) + total) % total : limitar(s, 0, total);
    let a = 0, b = muestras.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (muestras[m].s <= s) a = m; else b = m; }
    const A = muestras[a], B = muestras[b], f = B.s > A.s ? (s - A.s) / (B.s - A.s) : 0;
    return mezclar3(A.p, B.p, f);
  };
  return { largo: total, cerrada, en, puntos: P, muestras };
}
// El estado del avión a la distancia s de la ruta: posición, rumbo, cabeceo (de la ruta en pantalla) y alabeo por la
// curva: tan(alabeo) = v²·κ / g (viraje coordinado). ftH y ftV: cuántos pies es una unidad, en horizontal y en vertical.
export function estadoEnRuta(ruta, s, { kt = 100, ftH = 6076, ftV = 1000, maxAlabeo = 35 } = {}) {
  const d = Math.max(0.0005, ruta.largo * 0.006);
  const p = ruta.en(s), a = ruta.en(s - d), b = ruta.en(s + d);
  const v = resta(b, a);
  const rumbo = ((grados(Math.atan2(v[0], v[2])) % 360) + 360) % 360;
  const horizontal = Math.hypot(v[0], v[2]);
  const cabeceo = limitar(grados(Math.atan2(v[1], horizontal || 1e-9)), -14, 16);
  const r1 = ruta.en(s - d * 4), r2 = ruta.en(s + d * 4);
  // En las puntas de una ruta abierta uno de los dos tramos mide 0: se usa el otro (si no, el avión queda alabeado).
  const l1 = Math.hypot(p[0] - r1[0], p[2] - r1[2]), l2 = Math.hypot(r2[0] - p[0], r2[2] - p[2]), corto = ruta.largo * 1e-4;
  let h1 = Math.atan2(p[0] - r1[0], p[2] - r1[2]), h2 = Math.atan2(r2[0] - p[0], r2[2] - p[2]);
  if (l1 < corto) h1 = h2; if (l2 < corto) h2 = h1;
  let dh = h2 - h1; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const tramo = (Math.hypot(p[0] - r1[0], p[2] - r1[2]) + Math.hypot(r2[0] - p[0], r2[2] - p[2])) / 2 * ftH;
  const kappa = tramo > 0 ? dh / (2 * tramo) : 0;
  const vfs = kt * 1.68781;
  const alabeo = limitar(grados(Math.atan((vfs * vfs * kappa) / 32.174)), -maxAlabeo, maxAlabeo);
  // Altitud de verdad (pies) y ascenso (pies por minuto) para la cabina.
  const subida = horizontal > 0 ? ((v[1] * ftV) / (horizontal * ftH)) * vfs * 60 : 0;
  return { pos: p, rumbo, cabeceo, alabeo, kt, subida };
}

// ---------- dibujo ----------
const cssColor = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.round(limitar(a, 0, 1) * 1000) / 1000})`;
export const mezclarColor = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Prepara lo que se ve: pasa todo a cámara, recorta, sombrea, pone niebla y ordena de lejos a cerca.
// → lista de { tipo, z, ... } en pantalla, lista para dibujar (la usan las pruebas sin lienzo).
export function preparar(prims, cam, ancho, alto, ambiente = {}) {
  const f = focal(cam, alto), cx = ancho / 2, cy = alto / 2;
  const sol = ambiente.sol ?? unitario([-0.4, 0.8, -0.45]);
  const nieblaColor = ambiente.niebla?.color ?? [200, 215, 235];
  const n0 = ambiente.niebla?.inicio ?? 1e9, n1 = ambiente.niebla?.fin ?? 2e9;
  const amb = ambiente.ambiente ?? 0.55, dif = 1 - amb;
  const niebla = d => limitar((d - n0) / Math.max(1e-6, n1 - n0), 0, 1);
  const escala = ambiente.escalaPx ?? 1;
  const listo = [];
  for (const q of prims) {
    if (q.t === 'p') {
      const cam3 = q.p.map(v => aCamara(cam, v));
      let visibles = cam3;
      if (cam3.some(v => v[2] < cam.cerca)) { visibles = recortarCerca(cam3, cam.cerca); if (visibles.length < 3) continue; }
      // De espaldas: lo opaco y cerrado no se dibuja.
      const haciaCam = resta(cam.ojo, q.p[0]);
      let n = q.n ?? (q.n = normalDe(q.p));
      const deFrente = punto(n, haciaCam) >= 0;
      if (!deFrente && !q.doble) continue;
      if (!deFrente) n = por(n, -1);
      const pts = visibles.map(v => [cx + (f * v[0]) / v[2], cy - (f * v[1]) / v[2]]);
      // Fuera de la pantalla (todo de un mismo lado): no se dibuja.
      let fx0 = true, fx1 = true, fy0 = true, fy1 = true;
      for (const [x, y] of pts) { if (x >= 0) fx0 = false; if (x <= ancho) fx1 = false; if (y >= 0) fy0 = false; if (y <= alto) fy1 = false; }
      if (fx0 || fx1 || fy0 || fy1) continue;
      let z = 0, d = 0;
      for (const v of visibles) z += v[2];
      z /= visibles.length;
      for (const v of cam3) d += Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      d /= cam3.length;
      const luz = q.luz ?? 1;
      const k = luz ? 1 - luz + luz * (amb + dif * Math.max(0, punto(n, sol))) : 1;
      const base = [q.c[0] * k, q.c[1] * k, q.c[2] * k];
      const fn = niebla(d);
      const color = mezclarColor(base, nieblaColor, fn);
      const a = (q.a ?? 1) * (q.a < 1 ? 1 - fn * 0.7 : 1);
      if (a <= 0.004) continue;
      listo.push({ tipo: 'p', z: z + (q.sesgo ?? 0), pts, color, a, borde: q.borde ? mezclarColor(q.borde, nieblaColor, fn) : null, bordeA: q.borde?.[3] ?? 0.4, capa: q.capa ?? 'mundo', costura: q.grupo === 'avion' });
    } else if (q.t === 'l') {
      const cam3 = q.p.map(v => aCamara(cam, v));
      const tramos = [];
      let actual = [];
      for (let i = 0; i < cam3.length; i++) {
        const a = cam3[i], b = cam3[i + 1];
        if (!b) break;
        const da = a[2] >= cam.cerca, db = b[2] >= cam.cerca;
        if (!da && !db) { if (actual.length) tramos.push(actual); actual = []; continue; }
        let A = a, B = b;
        if (!da) { const t = (cam.cerca - a[2]) / (b[2] - a[2]); A = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cam.cerca]; }
        if (!db) { const t = (cam.cerca - a[2]) / (b[2] - a[2]); B = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cam.cerca]; }
        if (!actual.length || !da) { if (actual.length) tramos.push(actual); actual = [A]; }
        actual.push(B);
        if (!db) { tramos.push(actual); actual = []; }
      }
      if (actual.length > 1) tramos.push(actual);
      if (!tramos.length) continue;
      let z = 0, cuenta = 0, d = 0;
      for (const t of tramos) for (const v of t) { z += v[2]; d += Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); cuenta++; }
      z /= cuenta; d /= cuenta;
      const fn = niebla(d);
      listo.push({ tipo: 'l', z: z + (q.sesgo ?? 0), tramos: tramos.map(t => t.map(v => [cx + (f * v[0]) / v[2], cy - (f * v[1]) / v[2]])), color: mezclarColor(q.c, nieblaColor, fn), a: (q.a ?? 1) * (1 - fn * 0.85), w: (q.w ?? 1.5) * escala, guion: q.guion ? q.guion.map(x => x * escala) : null, avance: q.avance ?? 0, capa: q.capa ?? 'mundo' });
    } else if (q.t === 's') {
      const c = aCamara(cam, q.p);
      if (c[2] < cam.cerca * 2) continue;
      const d = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
      const r = Math.max((f * q.r) / c[2], (q.min ?? 0) * escala);
      const x = cx + (f * c[0]) / c[2], y = cy - (f * c[1]) / c[2];
      if (x + r < 0 || x - r > ancho || y + r < 0 || y - r > alto) continue;
      // Una bola enorme (la cámara casi dentro de la nube) taparía todo y cuesta mucho pintarla: no se dibuja.
      if (r > Math.max(ancho, alto) * 1.2) continue;
      const fn = niebla(d);
      const sombra = q.sombra == null ? 1 : 0.78 + 0.22 * limitar(q.sombra, 0, 1);
      const base = q.tex === 'nube' ? por(q.c, sombra) : q.c;
      listo.push({ tipo: 's', z: c[2] + (q.sesgo ?? 0), x, y, r, color: q.tex === 'brillo' ? q.c : mezclarColor(base, nieblaColor, fn), a: (q.a ?? 1) * (q.tex === 'nube' ? 1 - fn : 1 - fn * 0.6), tex: q.tex ?? null, capa: q.capa ?? 'mundo' });
    }
  }
  // Pintor: primero el suelo (de lejos a cerca), después el mundo (de lejos a cerca). Empates: el orden de llegada.
  // «calco» (la pista, las marcas, la sombra) va sobre el suelo en el orden en que llegó.
  const peso = { fondo: 0, suelo: 1, calco: 2, mundo: 3, frente: 4 };
  listo.forEach((x, i) => { x.i = i; });
  listo.sort((a, b) => (peso[a.capa] - peso[b.capa]) || (a.capa === 'calco' ? a.i - b.i : (b.z - a.z) || (a.i - b.i)));
  return listo;
}
export const ordenarPintor = lista => [...lista].sort((a, b) => (b.z - a.z) || ((a.i ?? 0) - (b.i ?? 0)));

// El cielo (degradé hasta el horizonte) y el suelo lejano. El horizonte se calcula con la cámara (se inclina con el
// alabeo en primera persona).
export function horizonte(cam, ancho, alto) {
  let h = [cam.adelante[0], 0, cam.adelante[2]];
  if (Math.hypot(h[0], h[2]) < 1e-4) h = [cam.sube[0], 0, cam.sube[2]];
  h = unitario(h);
  const der = unitario([h[2], 0, -h[0]]);
  const lejos = 1e6;
  const a = aCamara(cam, suma(cam.ojo, suma(por(h, lejos), por(der, -lejos * 0.5))));
  const b = aCamara(cam, suma(cam.ojo, suma(por(h, lejos), por(der, lejos * 0.5))));
  const f = focal(cam, alto);
  const P = v => [ancho / 2 + (f * v[0]) / v[2], alto / 2 - (f * v[1]) / v[2]];
  // Si el horizonte queda detrás (mirando muy arriba o muy abajo), se dice de qué lado está todo.
  if (a[2] <= 0 || b[2] <= 0) return { arriba: cam.adelante[1] > 0 ? 'cielo' : 'suelo' };
  return { a: P(a), b: P(b) };
}

export function dibujarFondo(ctx, cam, ancho, alto, paleta) {
  const hz = horizonte(cam, ancho, alto);
  if (!hz.a) {
    ctx.fillStyle = cssColor(hz.arriba === 'cielo' ? paleta.cieloAlto : paleta.sueloLejos);
    ctx.fillRect(0, 0, ancho, alto);
    return hz;
  }
  const [ax, ay] = hz.a, [bx, by] = hz.b;
  // Normal hacia el cielo (perpendicular al horizonte, del lado contrario al suelo).
  let nx = ay - by, ny = bx - ax;
  const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
  const abajoMundo = aCamara(cam, suma(cam.ojo, [0, -1, 0]));
  if (nx * abajoMundo[0] + ny * -abajoMundo[1] > 0) { nx = -nx; ny = -ny; }
  const mx = (ax + bx) / 2, my = (ay + by) / 2, D = Math.hypot(ancho, alto) * 1.5;
  const g = ctx.createLinearGradient(mx, my, mx + nx * alto * 0.9, my + ny * alto * 0.9);
  g.addColorStop(0, cssColor(paleta.cieloBajo));
  g.addColorStop(0.45, cssColor(mezclarColor(paleta.cieloBajo, paleta.cieloAlto, 0.6)));
  g.addColorStop(1, cssColor(paleta.cieloAlto));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ancho, alto);
  // El suelo lejano: el medio plano del otro lado de la línea.
  const tx = bx - ax, ty = by - ay, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
  ctx.fillStyle = cssColor(paleta.sueloLejos);
  ctx.beginPath();
  ctx.moveTo(mx - ux * D, my - uy * D);
  ctx.lineTo(mx + ux * D, my + uy * D);
  ctx.lineTo(mx + ux * D - nx * D, my + uy * D - ny * D);
  ctx.lineTo(mx - ux * D - nx * D, my - uy * D - ny * D);
  ctx.closePath();
  ctx.fill();
  // Una franja de bruma en el horizonte.
  const b2 = ctx.createLinearGradient(mx, my, mx + nx * alto * 0.12, my + ny * alto * 0.12);
  b2.addColorStop(0, cssColor(paleta.bruma, 0.85));
  b2.addColorStop(1, cssColor(paleta.bruma, 0));
  ctx.fillStyle = b2;
  ctx.beginPath();
  ctx.moveTo(mx - ux * D, my - uy * D);
  ctx.lineTo(mx + ux * D, my + uy * D);
  ctx.lineTo(mx + ux * D + nx * alto * 0.12, my + uy * D + ny * alto * 0.12);
  ctx.lineTo(mx - ux * D + nx * alto * 0.12, my - uy * D + ny * alto * 0.12);
  ctx.closePath();
  ctx.fill();
  return hz;
}

export function dibujarLista(ctx, lista, texturas = {}) {
  for (const x of lista) {
    if (x.tipo === 'p') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssColor(x.color, x.a);
      ctx.beginPath();
      ctx.moveTo(x.pts[0][0], x.pts[0][1]);
      for (let i = 1; i < x.pts.length; i++) ctx.lineTo(x.pts[i][0], x.pts[i][1]);
      ctx.closePath();
      ctx.fill();
      if (x.borde) { ctx.strokeStyle = cssColor(x.borde, x.bordeA); ctx.lineWidth = 1; ctx.stroke(); }
      else if (x.costura && x.a >= 1) { ctx.strokeStyle = cssColor(x.color, 1); ctx.lineWidth = 0.6; ctx.stroke(); } // el avión, sin rendijas entre caras
    } else if (x.tipo === 'l') {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = cssColor(x.color, x.a);
      ctx.lineWidth = x.w;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash?.(x.guion ?? []);
      if (x.guion) ctx.lineDashOffset = -x.avance;
      for (const t of x.tramos) {
        ctx.beginPath();
        ctx.moveTo(t[0][0], t[0][1]);
        for (let i = 1; i < t.length; i++) ctx.lineTo(t[i][0], t[i][1]);
        ctx.stroke();
      }
      ctx.setLineDash?.([]);
    } else if (x.tipo === 's') {
      let tex = x.tex ? texturas[x.tex] : null;
      // Las nubes: la textura del gris más parecido (la base de un cumulonimbo es oscura; con niebla se aclaran).
      if (x.tex === 'nube' && texturas.nubes) {
        const lum = 0.3 * x.color[0] + 0.55 * x.color[1] + 0.15 * x.color[2];
        tex = texturas.nubes[limitar(Math.round((255 - lum) / 30), 0, texturas.nubes.length - 1)];
      }
      if (x.tex === 'brillo') {
        // Una luz: halo de su color y el centro casi blanco.
        for (const [k, a] of [[1, 0.18], [0.6, 0.35], [0.32, 0.9]]) { ctx.fillStyle = cssColor(k < 0.4 ? mezclarColor(x.color, [255, 255, 255], 0.55) : x.color, a * x.a); ctx.beginPath(); ctx.arc(x.x, x.y, Math.max(0.8, x.r * k), 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      if (tex) {
        ctx.globalAlpha = limitar(x.a, 0, 1);
        ctx.drawImage(tex, x.x - x.r * 1.15, x.y - x.r * 1.15, x.r * 2.3, x.r * 2.3);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = cssColor(x.color, x.a);
        ctx.beginPath(); ctx.arc(x.x, x.y, x.r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

// Etiquetas que miran a la cámara: se proyecta el ancla, se ordenan por prioridad y cada una busca un lugar libre
// (si no hay, no se dibuja). Si se corre de su ancla, una línea fina la une. → las que se dibujaron (para las pruebas).
export function dibujarEtiquetas(ctx, etiquetas, cam, ancho, alto, { escala = 1, paleta = {}, evitar = [], niebla = null } = {}) {
  const puestas = [], cajas = [...evitar];
  const tam = 12 * escala, pad = 5 * escala, alto1 = tam + pad * 1.4;
  const orden = etiquetas.map((e, i) => ({ e, i })).sort((a, b) => (b.e.prioridad ?? 0) - (a.e.prioridad ?? 0) || a.i - b.i);
  for (const { e } of orden) {
    const p = proyectar(cam, e.p, ancho, alto);
    if (!p || p.z > (e.lejos ?? Infinity)) continue;
    // Una etiqueta con «niebla» se borra igual que lo que nombra (la visibilidad).
    const borrada = e.niebla && niebla ? limitar((p.z - niebla.inicio) / Math.max(1e-6, niebla.fin - niebla.inicio), 0, 1) : 0;
    if (borrada > 0.97) continue;
    ctx.globalAlpha = 1 - borrada;
    ctx.font = `${e.negrita === false ? 500 : 650} ${tam * (e.tam ?? 1)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    const w = ctx.measureText(e.texto).width + pad * 2 + (e.color ? 9 * escala : 0);
    const h = alto1 * (e.tam ?? 1);
    const pruebas = [[0, -h - 6 * escala], [0, 8 * escala], [0, -2 * h - 10 * escala], [w * 0.6, -h * 0.5], [-w * 0.6, -h * 0.5], [0, 2 * h], [0, -3 * h - 12 * escala]];
    let puesto = null;
    for (const [dx, dy] of pruebas) {
      const x = limitar(p.x - w / 2 + dx, 4 * escala, ancho - w - 4 * escala), y = limitar(p.y + dy, 4 * escala, alto - h - 4 * escala);
      if (cajas.some(c => x < c.x + c.w + 3 && x + w + 3 > c.x && y < c.y + c.h + 3 && y + h + 3 > c.y)) continue;
      if ((e.evitar ?? []).some(c => x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y)) continue;
      puesto = { x, y, w, h };
      break;
    }
    if (!puesto) continue;
    cajas.push(puesto);
    const { x, y, w: W, h: H } = puesto;
    const fondo = paleta.etiquetaFondo ?? [12, 20, 36], texto = paleta.etiquetaTexto ?? [255, 255, 255];
    const cerca = Math.abs(p.x - (x + W / 2)) < W / 2 && p.y >= y - 8 * escala && p.y <= y + H + 8 * escala;
    if (!cerca) {
      ctx.strokeStyle = cssColor(fondo, 0.7); ctx.lineWidth = 1.2 * escala;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(limitar(p.x, x, x + W), p.y < y ? y : y + H); ctx.stroke();
    }
    ctx.fillStyle = cssColor(fondo, e.resaltada ? 0.92 : 0.78);
    redondeado(ctx, x, y, W, H, 6 * escala);
    ctx.fill();
    if (e.resaltada && e.color) { ctx.strokeStyle = cssColor(e.color, 1); ctx.lineWidth = 1.6 * escala; ctx.stroke(); }
    if (e.color) { ctx.fillStyle = cssColor(e.color, 1); ctx.beginPath(); ctx.arc(x + pad + 3 * escala, y + H / 2, 3.6 * escala, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = cssColor(texto, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(e.texto, x + pad + (e.color ? 9 * escala : 0), y + H / 2 + 0.5);
    // El ancla: un punto chico.
    ctx.fillStyle = cssColor(e.color ?? texto, 1);
    if (!cerca) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * escala, 0, Math.PI * 2); ctx.fill(); }
    puestas.push({ texto: e.texto, x, y, w: W, h: H });
    ctx.globalAlpha = 1;
  }
  return puestas;
}
function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// La cabina vista desde adentro. 0.14.98: el dibujo es el de cabina.js (marco, visera, tablero y los seis instrumentos
// de verdad: con marcas, números y agujas vivas, también el variómetro y el coordinador). → el alto (px) que tapa el tablero.
export function dibujarCabina(ctx, ancho, alto, datos, opciones = {}) {
  return dibujarCabinaCompleta(ctx, ancho, alto, datos, opciones);
}

// Las texturas suaves (nube y brillo): un lienzo chico con un degradé radial. Se hacen una vez por lienzo.
export function crearTexturas(crearLienzo) {
  const hacer = (paradas) => {
    const c = crearLienzo(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [k, col] of paradas) g.addColorStop(k, col);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return c;
  };
  const grises = [255, 225, 195, 165, 135, 105];
  return {
    nubes: grises.map(v => hacer([[0, `rgba(${v},${v},${Math.min(255, v + 8)},1)`], [0.55, `rgba(${v},${v},${Math.min(255, v + 8)},0.95)`], [0.8, `rgba(${v},${v},${Math.min(255, v + 8)},0.5)`], [1, `rgba(${v},${v},${v},0)`]])),
  };
}

// Todo junto: fondo, suelo, mundo y etiquetas. → { lista, etiquetas } (lo que se dibujó).
export function render(ctx, escena, cam, ancho, alto, opciones = {}) {
  const paleta = escena.paleta;
  if (escena.fondo !== false) dibujarFondo(ctx, cam, ancho, alto, paleta);
  const lista = preparar(escena.prims, cam, ancho, alto, { sol: escena.sol, niebla: escena.niebla, ambiente: escena.ambiente, escalaPx: opciones.escala ?? 1 });
  dibujarLista(ctx, lista, opciones.texturas ?? {});
  // Lo que se dibuja encima antes de las etiquetas (un gráfico): devuelve su rectángulo, que las etiquetas esquivan.
  const encima = opciones.antes ? opciones.antes(ctx) : null;
  const evitar = [...(opciones.evitar ?? []), ...(encima ? [encima] : [])];
  const etiquetas = dibujarEtiquetas(ctx, escena.etiquetas ?? [], cam, ancho, alto, { escala: opciones.escala ?? 1, paleta, evitar, niebla: escena.niebla });
  return { lista, etiquetas };
}
