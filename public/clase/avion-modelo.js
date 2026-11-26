// 0.14.114: el avión de las escenas 3D y del juego, hecho aquí (sin archivos ni dependencias): un entrenador de ala alta
// como un Cessna 172, con sus proporciones de verdad. Largo 27 ft, envergadura 36 ft, alto 8.9 ft, hélice de 6.25 ft,
// trocha (distancia entre ruedas principales) de 8.3 ft. Fuselaje con su capó, parabrisas inclinado, ventanas de las
// puertas y la de atrás, franja de dos colores y panza; ala con perfil (más gruesa adelante), diedro y puntas que se
// afinan; montantes (struts) con perfil; tren fijo con carenados (wheel fairings); estabilizador y deriva con perfil,
// aleta dorsal; cono de la hélice (spinner) y dos palas torcidas con las puntas pintadas.
// Las medidas se escriben en pies, como en un plano: FS (desde la punta del cono hacia atrás), BL (a la derecha del
// piloto) y WL (desde el suelo hacia arriba, con las ruedas apoyadas). El modelo queda en las unidades de siempre:
// x adelante, y arriba, z a la derecha; 1 unidad = 3.2 ft; la nariz en x = 4.2 y las ruedas 0.86 por debajo del
// centro (el juego apoya el avión con ese alto: juego-mundo.js, ALTO_RUEDAS).
// Todas las caras son convexas (WebGL las parte en abanico desde el primer vértice). Nada toca document ni window.

export const PIE = 3.2; // pies por unidad del modelo
export const RUEDAS_Y = -0.86; // dónde tocan el suelo las ruedas (unidades del modelo)
const WL0 = -RUEDAS_Y * PIE; // 2.75 ft: la altura del centro del modelo sobre el suelo
export const P = (fs, bl, wl) => [4.2 - fs / PIE, (wl - WL0) / PIE, bl / PIE];

// ---------- vectores (propios: este módulo no importa motor3d.js) ----------
const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0]; };
export function normalNewell(p) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit([x, y, z]);
}
const centro = p => { let x = 0, y = 0, z = 0; for (const v of p) { x += v[0]; y += v[1]; z += v[2]; } return [x / p.length, y / p.length, z / p.length]; };

// ---------- colores ----------
export const COLORES = Object.freeze({
  blanco: [242, 244, 248], panza: [208, 214, 224], naranja: [234, 108, 34], azul: [30, 54, 100], vidrio: [30, 46, 70],
  capoFrente: [44, 48, 56], montante: [232, 235, 240], pata: [168, 174, 184], llanta: [34, 36, 40], rin: [196, 200, 206],
  pala: [46, 48, 54], puntaPala: [240, 196, 40], cono: [236, 238, 242],
});
const PINTURA = { brillo: 0.5, refleja: 0.16 }, VIDRIO = { brillo: 1.1, refleja: 0.85 }, MATE = { brillo: 0.15, refleja: 0 };

// ---------- piezas ----------
// Una rejilla de anillos (cada anillo con la misma cantidad de puntos): caras de 4 lados entre anillos vecinos, cada una
// mirando hacia afuera, con normales por vértice (el promedio de las caras que lo tocan: se ve redondo).
// color(k, i) → { c, ...material } para la cara entre los anillos k y k+1, puntos i e i+1.
function rejilla(anillos, color, { cerrado = true } = {}) {
  const n = anillos[0].length, caras = [], sumas = anillos.map(a => a.map(() => [0, 0, 0]));
  const centros = anillos.map(centro);
  const lados = cerrado ? n : n - 1;
  for (let k = 0; k < anillos.length - 1; k++) for (let i = 0; i < lados; i++) {
    const j = (i + 1) % n;
    let idx = [[k, i], [k + 1, i], [k + 1, j], [k, j]];
    let p = idx.map(([a, b]) => anillos[a][b]);
    let nn = normalNewell(p);
    const afuera = resta(centro(p), centros[k].map((v, m) => (v + centros[k + 1][m]) / 2));
    if (punto(nn, afuera) < 0) { idx = idx.reverse(); p = p.reverse(); nn = nn.map(v => -v); }
    const area = Math.hypot(...cruz(resta(p[2], p[0]), resta(p[3], p[1])));
    for (const [a, b] of idx) { const s = sumas[a][b]; s[0] += nn[0] * area; s[1] += nn[1] * area; s[2] += nn[2] * area; }
    caras.push({ idx, p, n: nn, ...color(k, i) });
  }
  const normales = sumas.map(fila => fila.map(unit));
  for (const f of caras) { f.ns = f.idx.map(([a, b]) => normales[a][b]); delete f.idx; }
  return caras;
}
// Una tapa plana (convexa) mirando hacia «afuera» (un punto de referencia del otro lado).
function tapa(p, adentro, material) {
  let q = [...p], nn = normalNewell(q);
  if (punto(nn, resta(centro(q), adentro)) < 0) { q = q.reverse(); nn = nn.map(v => -v); }
  return { p: q, n: nn, ...material };
}

// El perfil de un ala (fracciones de la cuerda: f desde el borde de ataque, v el alto sobre la cuerda), cerrado:
// del borde de salida por arriba hasta el de ataque y de vuelta por abajo. Grueso adelante, como un NACA 2412.
const PERFIL_ARRIBA = [[1, 0.003], [0.7, 0.056], [0.4, 0.086], [0.2, 0.086], [0.08, 0.064], [0.02, 0.034], [0, 0.002]];
const PERFIL_ABAJO = [[0.02, -0.021], [0.1, -0.031], [0.35, -0.035], [0.7, -0.021]];
// Simétrico (cola y montantes): el grosor de un NACA 00xx.
const grosor = (f, t) => 5 * t * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1015 * f ** 4);
const interp = (tabla, f) => {
  const t = [...tabla].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < t.length - 1; i++) if (f >= t[i][0] && f <= t[i + 1][0]) { const k = (f - t[i][0]) / (t[i + 1][0] - t[i][0] || 1); return t[i][1] + (t[i + 1][1] - t[i][1]) * k; }
  return f <= t[0][0] ? t[0][1] : t[t.length - 1][1];
};
// Un anillo del ala a la distancia bl: borde de ataque en fs (pies), cuerda c, cuerda a la altura wl. corte: fracción
// donde termina (la bisagra del alerón); sin corte, el perfil entero. esp: cuánto del grosor (las puntas, más finas).
function anilloAla(bl, fs, c, wl, { corte = null, esp = 1 } = {}) {
  const pt = (f, v) => P(fs + f * c, bl, wl + v * c * esp);
  if (corte == null) return [...PERFIL_ARRIBA.map(([f, v]) => pt(f, v)), ...PERFIL_ABAJO.map(([f, v]) => pt(f, v))];
  const arriba = PERFIL_ARRIBA.filter(([f]) => f < corte), abajo = PERFIL_ABAJO.filter(([f]) => f < corte);
  return [pt(corte, interp(PERFIL_ABAJO.concat([[1, -0.003]]), corte)), pt(corte, interp(PERFIL_ARRIBA, corte)), ...arriba.map(([f, v]) => pt(f, v)), ...abajo.map(([f, v]) => pt(f, v))];
}
// Un perfil simétrico en un plano: «a lo largo» (la cuerda) y «de costado» (el grosor). base: el borde de ataque.
function anilloSimetrico(base, cuerda, costado, t, fracciones = [1, 0.6, 0.3, 0.1, 0.02, 0], corte = false) {
  const largo = Math.hypot(cuerda[0], cuerda[1], cuerda[2]);
  const sube = fracciones.map(f => [f, grosor(f, t)]);
  const baja = [...fracciones].reverse().slice(1, corte ? undefined : -1).map(f => [f, -grosor(f, t)]);
  return [...sube, ...baja].map(([f, g]) => [base[0] + cuerda[0] * f + costado[0] * g * largo, base[1] + cuerda[1] * f + costado[1] * g * largo, base[2] + cuerda[2] * f + costado[2] * g * largo]);
}
// Un tubo con perfil (montantes y patas del tren): de a hacia b, con su ancho a lo largo del vuelo (x) y su grosor.
function tubo(a, b, ancho, grueso, c, material, lados = 6) {
  const d = unit(resta(b, a));
  let e1 = resta([1, 0, 0], d.map(v => v * d[0]));
  e1 = unit(e1);
  const e2 = unit(cruz(d, e1));
  const anillo = q => Array.from({ length: lados }, (_, i) => { const g = (i / lados) * Math.PI * 2; return [q[0] + e1[0] * Math.cos(g) * ancho / 2 + e2[0] * Math.sin(g) * grueso / 2, q[1] + e1[1] * Math.cos(g) * ancho / 2 + e2[1] * Math.sin(g) * grueso / 2, q[2] + e1[2] * Math.cos(g) * ancho / 2 + e2[2] * Math.sin(g) * grueso / 2]; });
  return rejilla([anillo(a), anillo(b)], () => ({ c, ...material }));
}

// ---------- el fuselaje ----------
// Secciones: [FS, medio ancho, techo WL, panza WL] (pies). Cada anillo es una superelipse (más cuadrada que un óvalo,
// como la cabina de verdad) con sus puntos a alturas fijas: así la franja y las ventanas siguen la forma del avión.
const SECCIONES = [
  [1.3, 0.95, 4.95, 3.15], [2.0, 1.3, 5.25, 2.85], [3.2, 1.64, 5.58, 2.6], [5.2, 1.8, 5.76, 2.55],
  [6.2, 1.84, 6.32, 2.55], [7.2, 1.86, 6.82, 2.55], [7.7, 1.86, 6.98, 2.55], [10.3, 1.86, 7.02, 2.6], [10.6, 1.84, 7.02, 2.62],
  [12.6, 1.66, 6.96, 2.9], [13.8, 1.5, 6.62, 3.12], [16.2, 1.14, 6.04, 3.62], [19.2, 0.84, 5.62, 4.1], [22.4, 0.58, 5.36, 4.45],
  [24.8, 0.4, 5.22, 4.66], [27.0, 0.13, 5.1, 4.86],
];
// Alturas de los puntos (−1 panza, 1 techo).
const FILAS = [-1, -0.8, -0.45, -0.3, -0.15, 0.22, 0.5, 0.88, 1];
const EXP = 2.6;
function anilloFuselaje([fs, mw, techo, panza]) {
  const yc = (techo + panza) / 2, mh = (techo - panza) / 2;
  const ancho = s => mw * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), EXP)), 1 / EXP);
  const der = FILAS.map(s => P(fs, ancho(s), yc + s * mh));
  const izq = FILAS.slice(1, -1).reverse().map(s => P(fs, -ancho(s), yc + s * mh));
  return [...der, ...izq]; // 9 + 7 = 16 puntos
}
// La fila (banda) de una cara: con los 16 puntos, las bandas 0..7 van por la derecha y 8..15 por la izquierda.
const bandaDe = i => { const n = FILAS.length; return i < n - 1 ? [FILAS[i], FILAS[i + 1]] : [FILAS[n - 1 - (i - (n - 1))], FILAS[n - 2 - (i - (n - 1))]].sort((a, b) => a - b); };
function colorFuselaje(k, i) {
  const fs0 = SECCIONES[k][0], fs1 = SECCIONES[k + 1][0];
  const [s0, s1] = bandaDe(i);
  const entre = (a, b) => fs0 >= a - 1e-6 && fs1 <= b + 1e-6;
  // El parabrisas: sube desde el capó (de 5.2 a 6.2, solo arriba), entero de 6.2 a 7.2 y arriba hasta el techo (los
  // parantes quedan blancos); las ventanas de las puertas (con el parante del medio), y la ventana de arriba, atrás.
  if (entre(5.2, 6.2) && s0 >= 0.88 - 1e-6) return { c: COLORES.vidrio, ...VIDRIO };
  if (entre(6.2, 7.2) && s0 >= 0.5 - 1e-6) return { c: COLORES.vidrio, ...VIDRIO };
  if (entre(7.2, 7.7) && s0 >= 0.88 - 1e-6) return { c: COLORES.vidrio, ...VIDRIO };
  if ((entre(7.7, 10.3) || entre(10.6, 12.6)) && s0 >= 0.22 - 1e-6 && s1 <= 0.88 + 1e-6) return { c: COLORES.vidrio, ...VIDRIO };
  if (entre(12.6, 16.2) && s0 >= 0.88 - 1e-6) return { c: COLORES.vidrio, ...VIDRIO };
  // La franja: naranja con un filete azul abajo (desde el capó hasta la cola).
  if (fs0 >= 2.0 && fs1 <= 24.8 + 1e-6 && s0 >= -0.3 - 1e-6 && s1 <= -0.15 + 1e-6) return { c: COLORES.naranja, ...PINTURA };
  if (fs0 >= 2.0 && fs1 <= 24.8 + 1e-6 && s0 >= -0.45 - 1e-6 && s1 <= -0.3 + 1e-6) return { c: COLORES.azul, ...PINTURA };
  if (s1 <= -0.8 + 1e-6) return { c: COLORES.panza, ...PINTURA };
  return { c: COLORES.blanco, ...PINTURA };
}

// 0.14.130: un punto sobre la piel del fuselaje (para las marcas de los daños: la panza raspada, el aceite, la grieta):
// fs (pies), s (−1 panza … 1 techo), lado (+1 derecha, −1 izquierda), afuera (pies de más, para que no se pise con la piel).
export function puntoFuselaje(fs, s, lado = 1, afuera = 0.03) {
  let k = SECCIONES.findIndex(x => x[0] >= fs); if (k <= 0) k = 1; if (k < 0) k = SECCIONES.length - 1;
  const [f0, w0, t0, p0] = SECCIONES[k - 1], [f1, w1, t1, p1] = SECCIONES[k], u = Math.max(0, Math.min(1, (fs - f0) / (f1 - f0 || 1)));
  const mw = w0 + (w1 - w0) * u, techo = t0 + (t1 - t0) * u, panza = p0 + (p1 - p0) * u, yc = (techo + panza) / 2, mh = (techo - panza) / 2;
  const an = mw * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), EXP)), 1 / EXP);
  // (hacia afuera: en el costado, de lado; arriba o abajo, vertical)
  const ny = Math.sign(s) * Math.abs(s) ** 3, nz = (1 - Math.abs(s) ** 3) * lado, l = Math.hypot(ny, nz) || 1;
  return P(fs, lado * an + (nz / l) * afuera, yc + s * mh + (ny / l) * afuera);
}

// ---------- el modelo entero ----------
// Las medidas del ala (pies): borde de ataque y cuerda según BL; la altura (WL) de la cuerda con el diedro (1.7°).
const ALA = { raizFs: 7.7, raizC: 5.3, quiebre: 8.5, puntaBl: 17.6, puntaFs: 9.0, puntaC: 3.95, wl: 7.15, diedro: 0.0302, bisagra: 11.75, aleron: [9.6, 16.5] };
const bordeAla = bl => { const b = Math.abs(bl); if (b <= ALA.quiebre) return [ALA.raizFs, ALA.raizC]; const k = (b - ALA.quiebre) / (ALA.puntaBl - ALA.quiebre); return [ALA.raizFs + (ALA.puntaFs - ALA.raizFs) * k, ALA.raizC + (ALA.puntaC - ALA.raizC) * k]; };
export const wlAla = bl => ALA.wl + Math.abs(bl) * ALA.diedro;
const COLA = { hRaizFs: 23.0, hPuntaFs: 24.3, hBisagra: 25.3, hTeRaiz: 26.9, hTePunta: 26.6, hBl: 5.65, hWl: 4.95, vRaiz: 4.95, vTope: 8.75 };
const ESTACIONES_ALA = [[0, 8.5], [8.5, 9.6], [9.6, 16.5], [16.5, 17.6]];
const HELICE = { fs: 1.05, wl: 4.05, r: [0.5, 1.1, 2.0, 2.75, 3.1], c: [0.32, 0.46, 0.42, 0.32, 0.18], paso: [50, 34, 22, 17, 14] };

let cache = null;
export function construirAvion() {
  if (cache) return cache;
  const caras = [];
  const mat = (c, m = PINTURA) => () => ({ c, ...m });
  // Fuselaje, la boca del capó (oscura) y la punta de la cola.
  const anillos = SECCIONES.map(anilloFuselaje);
  caras.push(...rejilla(anillos, colorFuselaje));
  caras.push(tapa(anillos[0], P(4, 0, 4), { c: COLORES.capoFrente, ...MATE }));
  caras.push(tapa(anillos[anillos.length - 1], P(25, 0, 5), { c: COLORES.blanco, ...PINTURA }));
  // El cono de la hélice (spinner).
  const cono = [0.002, 0.5, 0.8, 0.96, 1].map((r, k) => Array.from({ length: 8 }, (_, i) => { const g = (i / 8) * Math.PI * 2; return P([0, 0.22, 0.6, 1.02, 1.4][k], Math.sin(g) * r * 0.62, HELICE.wl + Math.cos(g) * r * 0.62); }));
  caras.push(...rejilla(cono, mat(COLORES.cono, { brillo: 0.8, refleja: 0.25 })));
  // El ala: por dentro el perfil entero; donde va el alerón, cortado en la bisagra; la punta más fina.
  for (const lado of [1, -1]) {
    for (const [a, b] of ESTACIONES_ALA) {
      const conAleron = a >= ALA.aleron[0] - 1e-6 && b <= ALA.aleron[1] + 1e-6;
      const anillo = bl => { const [fs, c] = bordeAla(bl); return anilloAla(bl * lado, fs, c, wlAla(bl), conAleron ? { corte: (ALA.bisagra - fs) / c } : {}); };
      caras.push(...rejilla([anillo(a), anillo(b)], mat(COLORES.blanco)));
    }
    const [fsP, cP] = bordeAla(ALA.puntaBl);
    const punta = [anilloAla(ALA.puntaBl * lado, fsP, cP, wlAla(ALA.puntaBl)), anilloAla((ALA.puntaBl + 0.45) * lado, fsP + 0.3, cP - 0.45, wlAla(ALA.puntaBl) + 0.02, { esp: 0.45 })];
    caras.push(...rejilla(punta, mat(COLORES.naranja)));
    caras.push(tapa(punta[1], P(fsP + 1.5, ALA.puntaBl * lado * 0.9, wlAla(ALA.puntaBl)), { c: COLORES.naranja, ...PINTURA }));
  }
  // Montantes: del fuselaje (abajo) al ala (a un tercio de la cuerda).
  for (const lado of [1, -1]) caras.push(...tubo(P(10.0, 1.72 * lado, 3.25), P(8.95, 9.4 * lado, wlAla(9.4) - 0.15), 0.55 / PIE, 0.17 / PIE, COLORES.montante, PINTURA));
  // Estabilizador horizontal (fijo hasta la bisagra) y la deriva con su timón.
  const anilloCola = (bl, desde, hasta) => {
    const k = Math.abs(bl) / COLA.hBl, le = COLA.hRaizFs + (COLA.hPuntaFs - COLA.hRaizFs) * k, te = COLA.hTeRaiz + (COLA.hTePunta - COLA.hTeRaiz) * k, c = te - le;
    const f0 = desde === 'le' ? 0 : (COLA.hBisagra - le) / c, f1 = hasta === 'te' ? 1 : (COLA.hBisagra - le) / c;
    return { le, c, f0, f1 };
  };
  const estab = [-COLA.hBl, 0, COLA.hBl].map(bl => {
    const { le, c, f1 } = anilloCola(bl, 'le', 'bisagra');
    return anilloSimetrico(P(le, bl, COLA.hWl), resta(P(le + c, bl, COLA.hWl), P(le, bl, COLA.hWl)), [0, 1, 0], 0.09, [f1, 0.3, 0.1, 0.02, 0], true);
  });
  caras.push(...rejilla(estab, mat(COLORES.blanco)));
  for (const s of [0, 2]) caras.push(tapa(estab[s], P(24.5, 0, COLA.hWl), { c: COLORES.blanco, ...PINTURA }));
  const vEst = [COLA.vRaiz, 7.35, 7.85, COLA.vTope];
  const vAnillo = wl => { const k = (wl - COLA.vRaiz) / (COLA.vTope - COLA.vRaiz), le = 21.0 + (24.7 - 21.0) * k, te = 27.15 - 0.3 * k; return anilloSimetrico(P(le, 0, wl), resta(P(te, 0, wl), P(le, 0, wl)), [0, 0, 1], 0.075 * (1 - 0.3 * k)); };
  const vAnillos = vEst.map(vAnillo);
  caras.push(...rejilla(vAnillos, k => ({ c: k === 0 ? COLORES.blanco : k === 1 ? COLORES.azul : COLORES.naranja, ...PINTURA })));
  caras.push(tapa(vAnillos[vAnillos.length - 1], P(25, 0, 7), { c: COLORES.naranja, ...PINTURA }));
  // La aleta dorsal (un triángulo de los dos lados, del techo de atrás a la deriva).
  for (const lado of [1, -1]) caras.push(tapa([P(15.6, 0.06 * lado, 6.12), P(22.1, 0.12 * lado, 6.05), P(21.2, 0.16 * lado, 5.3)], P(19, -lado, 5.8), { c: COLORES.blanco, ...PINTURA, doble: true }));
  // El tren fijo: patas de acero (resorte), ruedas y carenados; la rueda de nariz con su pata.
  const rueda = (fs, bl, r, w) => {
    const anillo = (z, k) => Array.from({ length: 10 }, (_, i) => { const g = (i / 10) * Math.PI * 2; return P(fs + Math.sin(g) * r * k, bl + z, r + Math.cos(g) * r * k); });
    const a = anillo(-w / 2, 0.88), d = anillo(w / 2, 0.88);
    return [...rejilla([a, anillo(0, 1), d], mat(COLORES.llanta, MATE)), tapa(a, P(fs, bl + 1, r), { c: COLORES.rin, ...PINTURA }), tapa(d, P(fs, bl - 1, r), { c: COLORES.rin, ...PINTURA })];
  };
  const carenado = (fs, bl, wlC, largo, ancho, alto, piso) => {
    const us = [-1, -0.62, 0.05, 0.7, 1];
    const forma = u => (u < 0 ? Math.sqrt(Math.max(0, 1 - u * u)) : Math.pow(Math.max(0, 1 - Math.pow(u, 1.7)), 0.8));
    const anillos = us.map(u => { const k = Math.max(0.03, forma(u)); return Array.from({ length: 7 }, (_, i) => { const g = (i / 7) * Math.PI * 2; return P(fs + u * largo, bl + Math.sin(g) * ancho * k, Math.max(piso, wlC + Math.cos(g) * alto * k)); }); });
    return rejilla(anillos, mat(COLORES.blanco));
  };
  // (0.14.130: cada pieza del tren con su nombre, para mostrar los daños: la pata doblada, el carenado que se cayó)
  const marcar = (lista, parte) => lista.map(f => Object.assign(f, { parte }));
  for (const lado of [1, -1]) {
    const k = lado > 0 ? 'D' : 'I';
    caras.push(...marcar(tubo(P(10.5, 1.45 * lado, 2.75), P(10.85, 3.75 * lado, 1.05), 0.45 / PIE, 0.12 / PIE, COLORES.pata, PINTURA, 4), `tren${k}`));
    caras.push(...marcar(rueda(10.9, 4.15 * lado, 0.72, 0.5), `tren${k}`));
    caras.push(...marcar(carenado(10.85, 4.15 * lado, 1.0, 1.5, 0.42, 0.86, 0.42), `carenado${k}`));
  }
  caras.push(...tubo(P(3.9, 0, 2.7), P(3.35, 0, 0.75), 0.24 / PIE, 0.24 / PIE, COLORES.pata, PINTURA, 6));
  caras.push(...rueda(3.3, 0, 0.6, 0.42));
  caras.push(...carenado(3.3, 0, 0.86, 1.15, 0.3, 0.66, 0.34));

  // Las piezas que se mueven: alerones (giran en su bisagra), timón de profundidad y las palas.
  const moviles = [];
  for (const lado of [1, -1]) {
    const anillo = bl => { const [fs, c] = bordeAla(bl), f = (ALA.bisagra - fs) / c, wl = wlAla(bl); return [P(ALA.bisagra, bl * lado, wl + interp(PERFIL_ARRIBA, f) * c), P(fs + c, bl * lado, wl + 0.003 * c), P(ALA.bisagra, bl * lado, wl + interp(PERFIL_ABAJO.concat([[1, -0.003]]), f) * c)]; };
    const a = anillo(ALA.aleron[0] + 0.05), b = anillo(ALA.aleron[1] - 0.05);
    const piezas = [...rejilla([a, b], mat(COLORES.blanco)), tapa(a, P(11, 13 * lado, 7.5), { c: COLORES.blanco, ...PINTURA }), tapa(b, P(11, 10 * lado, 7.5), { c: COLORES.blanco, ...PINTURA })];
    const e0 = P(ALA.bisagra, ALA.aleron[0] * lado, wlAla(ALA.aleron[0])), e1 = P(ALA.bisagra, ALA.aleron[1] * lado, wlAla(ALA.aleron[1]));
    // El eje siempre hacia +z: el ángulo + baja el borde de salida.
    moviles.push({ tipo: 'aleron', lado, eje: lado > 0 ? [e0, e1] : [e1, e0], caras: piezas });
  }
  {
    const anillo = bl => { const { le, c } = anilloCola(bl, 'le', 'te'), f = (COLA.hBisagra - le) / c, g = grosor(f, 0.09) * c; return [P(COLA.hBisagra, bl, COLA.hWl + g), P(le + c, bl, COLA.hWl), P(COLA.hBisagra, bl, COLA.hWl - g)]; };
    const an = [-COLA.hBl + 0.1, 0, COLA.hBl - 0.1].map(anillo);
    moviles.push({ tipo: 'profundidad', eje: [P(COLA.hBisagra, -COLA.hBl, COLA.hWl), P(COLA.hBisagra, COLA.hBl, COLA.hWl)], caras: [...rejilla(an, mat(COLORES.blanco)), tapa(an[0], P(26, 0, COLA.hWl), { c: COLORES.blanco, ...PINTURA }), tapa(an[2], P(26, 0, COLA.hWl), { c: COLORES.blanco, ...PINTURA })] });
  }
  // Una pala apuntando hacia arriba (las dos se arman girando esta): torcida (más paso cerca del centro).
  const pala = [];
  for (let k = 0; k < HELICE.r.length - 1; k++) {
    // La cuerda de la pala: entre el giro (de costado, z) y el avance (x), según su ángulo (paso).
    const borde = m => { const c = HELICE.c[m] / 2 / PIE, b = (HELICE.paso[m] * Math.PI) / 180, q = P(HELICE.fs, 0, HELICE.wl + HELICE.r[m]); const d = [Math.sin(b) * c, 0, Math.cos(b) * c]; return [[q[0] + d[0], q[1], q[2] + d[2]], [q[0] - d[0], q[1], q[2] - d[2]]]; };
    const [a0, a1] = borde(k), [b0, b1] = borde(k + 1);
    const p = [a0, b0, b1, a1];
    pala.push({ p, n: normalNewell(p), c: k === HELICE.r.length - 2 ? COLORES.puntaPala : COLORES.pala, brillo: 0.3, refleja: 0, doble: true });
  }
  // La sombra: el avión visto desde arriba en piezas convexas que no se pisan (el ala, la nariz, la cola y el
  // estabilizador). En pies [FS, BL].
  const [fsP, cP] = bordeAla(ALA.puntaBl);
  const sombra = [
    [[ALA.raizFs, -ALA.quiebre], [ALA.raizFs, ALA.quiebre], [fsP, ALA.puntaBl + 0.4], [fsP + cP, ALA.puntaBl + 0.4], [fsP + cP, -ALA.puntaBl - 0.4], [fsP, -ALA.puntaBl - 0.4]],
    [[0.2, 0], [1.3, 0.95], [ALA.raizFs, 1.86], [ALA.raizFs, -1.86], [1.3, -0.95]],
    [[ALA.raizFs + ALA.raizC, 1.75], [COLA.hRaizFs, 0.55], [COLA.hRaizFs, -0.55], [ALA.raizFs + ALA.raizC, -1.75]],
    [[COLA.hRaizFs, -0.55], [COLA.hRaizFs, 0.55], [COLA.hPuntaFs, COLA.hBl], [COLA.hTePunta, COLA.hBl], [27.1, 0], [COLA.hTePunta, -COLA.hBl], [COLA.hPuntaFs, -COLA.hBl]],
  ].map(pieza => pieza.map(([fs, bl]) => P(fs, bl, WL0)));
  const yTip = wlAla(ALA.puntaBl + 0.45);
  // Los vértices y las normales sin repetir (las caras vecinas comparten los mismos): así se pasan al mundo una sola vez
  // por cuadro. Cada cara guarda sus índices (vi, ni).
  const indexar = lista => {
    const vertices = [], normales = [], iv = new Map(), inn = new Map();
    const de = (mapa, arr, v) => { let k = mapa.get(v); if (k == null) { k = arr.length; arr.push(v); mapa.set(v, k); } return k; };
    for (const f of lista) { f.vi = f.p.map(v => de(iv, vertices, v)); f.ni = (f.ns ?? f.p.map(() => f.n)).map(n => de(inn, normales, n)); }
    return { vertices, normales };
  };
  const fijo = indexar(caras);
  // (los vértices de cada pieza con nombre: para doblarla en el mundo sin tocar las demás)
  const partes = {};
  for (const f of caras) if (f.parte) { (partes[f.parte] ??= new Set()); for (const i of f.vi) partes[f.parte].add(i); }
  for (const mv of moviles) Object.assign(mv, indexar(mv.caras));
  cache = Object.freeze({
    caras, moviles, pala, sombra, vertices: fijo.vertices, normales: fijo.normales, partes,
    // (dónde se dobla cada pata: arriba, junto al fuselaje)
    raizTren: { D: P(10.5, 1.45, 2.75), I: P(10.5, -1.45, 2.75) },
    nariz: P(HELICE.fs, 0, HELICE.wl), radioHelice: 3.1 / PIE,
    luces: { izquierda: P(fsP + 0.6, -(ALA.puntaBl + 0.5), yTip), derecha: P(fsP + 0.6, ALA.puntaBl + 0.5, yTip), cola: P(27.25, 0, 5.0), baliza: P(25.3, 0, COLA.vTope + 0.12) },
    yAla: z => (wlAla(Math.abs(z) * PIE) - WL0) / PIE,
  });
  return cache;
}
