// 0.14.92: las SITUACIONES 3D (tipo «situacion-3d»): una historia corta con una decisión. Primero el avión vuela (la
// introducción), después se elige qué hacer y se ve qué pasaría, desde afuera y desde la cabina, con el porqué y la regla
// de la FAA. Cada situación: su mundo (construir), su introducción, sus opciones (una sola «correcto»; puede haber
// «aceptable» y «mal») y, en cada opción, su vuelo, su momento clave (la escena se detiene ahí con un rótulo grande) y
// sus efectos (turbulencia, lluvia, rayos, nube por dentro, alarma de pérdida…). Los datos de la norma van en HECHOS.
import { cilindro, anillo, caja, linea, ruido, limitar, suave } from './motor3d.js';
import { COLOR_CLASE, aeropuerto, campo, cumulo, miles } from './e3d-base.js';
import { nubeTormenta, etapaNube, lluvia, granizo, destello, rayo } from './e3d-efectos.js';

// Los datos de la norma (las pruebas los revisan contra esta tabla).
export const HECHOS_SITUACIONES = Object.freeze({
  claseC: Object.freeze({ nucleoNM: 5, anilloNM: 10, techoAGL: 4000, pisoAnilloAGL: 1200, fuente: 'AIM 3-2-4' }),
  claseB: Object.freeze({ nucleoNM: 10, pisoNM: 20, pisoMSL: 3000, techoMSL: 10000, fuente: 'AIM 3-2-3' }),
  claseD: Object.freeze({ radioNM: 4, techoAGL: 2500, fuente: 'AIM 3-2-5' }),
  tormentas: Object.freeze({ evitarNM: 20, turbulenciaHastaNM: 20, sinCaminoEntreNM: Object.freeze([20, 30]), topesSeverosFt: Object.freeze([50000, 60000]), maduraMin: 15, fuentes: Object.freeze(['AIM 7-1-26', 'AIM 7-1-27', 'PHAK cap. 12']) }),
  vfrImc: Object.freeze({ pierdeControlMin: 10, alabeoMaxImc: 10, fuente: 'AFH cap. 18' }),
  densidad: Object.freeze({ isaNivelMarC: 15, bajaCPor1000ft: 2, elevacionFt: 5000, temperaturaC: 35, fuente: 'PHAK cap. 11' }),
});
export const isaEn = ft => HECHOS_SITUACIONES.densidad.isaNivelMarC - (HECHOS_SITUACIONES.densidad.bajaCPor1000ft * ft) / 1000;

// Un punto a «r» millas del centro, en el rumbo «g» visto desde el centro, a la altura y.
const D = (g, r, y, c = [0, 0]) => [c[0] + Math.sin((g * Math.PI) / 180) * r, y, c[1] + Math.cos((g * Math.PI) / 180) * r];
const MAGENTA = COLOR_CLASE.C, AZUL = COLOR_CLASE.B, CELESTE = COLOR_CLASE.D;
const ROJO = [240, 70, 60], VERDE = [70, 200, 110], NARANJA = [255, 150, 40], BLANCO = [255, 255, 255];
const plano = () => 0.02;
const campoPlano = (paleta, R = 34, semilla = 3) => campo({ x0: -R, z0: -R, x1: R, z1: R, n: 14, altura: (x, z) => 0.03 * ruido(x * 0.1, z * 0.1, semilla), paleta, semilla, falda: 400 });
// El momento clave: pasado el tiempo t, el avión llegó a… (para los rótulos «Aquí…»).
const radial = (x, z, c = [0, 0]) => Math.hypot(x - c[0], z - c[1]);

// ---------- Espacio aéreo ----------
function claseC() {
  const H = HECHOS_SITUACIONES.claseC, techo = H.techoAGL / 1000, piso = H.pisoAnilloAGL / 1000;
  const dentro = (x, y, z) => { const r = radial(x, z); return y <= techo && (r <= H.nucleoNM || (r <= H.anilloNM && y >= piso)); };
  // De costado: se ve al avión llegar a la pared y cruzarla.
  const cam = { seguir: 0.75, mira: D(135, 11, 2.6), giroRel: -40, alto: 13, dist: 11, fov: 50 };
  return {
    id: 'clase-c', unidades: { ftH: 6076, ftV: 1000 }, exagerar: 2, escalaAvion: 0.015, texturaEscala: 0.9, sombra: plano, lineaSuelo: true, niebla3: [1.8, 6.5],
    construir(paleta) {
      return { prims: [...campoPlano(paleta), ...aeropuerto({ x: 0, z: 0, y: 0.02, rumbo: 140, largo: 1.4, ancho: 0.06, paleta, torre: false, detalle: false }),
        ...cilindro([0, 0], H.nucleoNM, 0, techo, MAGENTA, { lados: 30, a: 0.38, borde: [...MAGENTA, 1] }),
        ...anillo([0, 0], H.nucleoNM, H.anilloNM, piso, techo, MAGENTA, { lados: 36, a: 0.36, borde: [...MAGENTA, 1] })] };
    },
    rotulos: T => [
      { p: D(135, H.anilloNM, techo * 0.62), texto: T('l.pared'), color: MAGENTA, prioridad: 9, tam: 1.2, resaltada: true },
      { p: D(160, H.anilloNM, techo), texto: T('l.techo'), prioridad: 6, negrita: false },
      { p: D(110, H.anilloNM, piso), texto: T('l.piso'), prioridad: 5, negrita: false },
    ],
    estado: (T, x, y, z) => ({ texto: T(dentro(x, y, z) ? 'e.dentro' : 'e.fuera', { ft: miles(Math.round(y * 10) * 100) }), clase: dentro(x, y, z) ? 'C' : 'G' }),
    intro: { camara: cam, vuelo: { ruta: [D(135, 23, 3.5), D(135, 19, 3.5), D(135, 15, 3.5)], seg: 10, kt: 110 } },
    opciones: [
      { id: 'llamar', nivel: 'correcto', icono: '📻', fuente: 'AIM 3-2-4', camara: cam, clave: 3.2, radio: true,
        vuelo: { ruta: [D(135, 15, 3.5), D(135, 12.5, 3.5), D(135, 9, 3.3), D(135, 5, 2.6), D(135, 2, 1.8)], seg: 16, kt: 105 } },
      { id: 'entrar', nivel: 'mal', icono: '➡️', fuente: 'AIM 3-2-4 · 14 CFR 91.130', camara: cam, clave: 6.6, radio: true, malDentro: true,
        vuelo: { ruta: [D(135, 15, 3.5), D(135, 10, 3.5), D(135, 4.5, 3.5)], seg: 13, kt: 110 } },
      { id: 'encima', nivel: 'aceptable', icono: '⬆️', fuente: '14 CFR 91.215', camara: { ...cam, alto: 9 }, clave: 4.3,
        vuelo: { ruta: [D(135, 15, 3.5), D(135, 12.5, 4.3), D(135, 10, 4.6), D(135, 0, 4.6), D(315, 6, 4.6)], seg: 18, kt: 100 } },
    ],
  };
}
function claseB() {
  const H = HECHOS_SITUACIONES.claseB, techo = H.techoMSL / 1000, piso = H.pisoMSL / 1000;
  const dentro = (x, y, z) => { const r = radial(x, z); return y <= techo && (r <= H.nucleoNM || (r <= H.pisoNM && y >= piso)); };
  const cam = { seguir: 0.75, mira: D(135, 20, 3.8), giroRel: -40, alto: 13, dist: 14, fov: 50 };
  return {
    id: 'clase-b', unidades: { ftH: 6076, ftV: 1000 }, exagerar: 2, escalaAvion: 0.015, texturaEscala: 0.9, sombra: plano, lineaSuelo: true, niebla3: [1.8, 6.5],
    construir(paleta) {
      return { prims: [...campoPlano(paleta, 40, 9), ...aeropuerto({ x: 0, z: 0, y: 0.02, rumbo: 80, largo: 2.2, ancho: 0.09, paleta, torre: false, detalle: false }),
        ...cilindro([0, 0], H.nucleoNM, 0, techo, AZUL, { lados: 32, a: 0.4, borde: [...AZUL, 1] }),
        ...anillo([0, 0], H.nucleoNM, H.pisoNM, piso, techo, AZUL, { lados: 40, a: 0.38, borde: [...AZUL, 1] })] };
    },
    rotulos: T => [
      { p: D(135, H.pisoNM, piso + 2.5), texto: T('l.pared'), color: AZUL, prioridad: 9, tam: 1.2, resaltada: true },
      { p: D(105, H.pisoNM, piso), texto: T('l.piso'), prioridad: 6, negrita: false },
      { p: D(160, H.nucleoNM, techo), texto: T('l.techo'), prioridad: 5, negrita: false },
    ],
    estado: (T, x, y, z) => ({ texto: T(dentro(x, y, z) ? 'e.dentro' : 'e.fuera', { ft: miles(Math.round(y * 10) * 100) }), clase: dentro(x, y, z) ? 'B' : 'E' }),
    intro: { camara: cam, vuelo: { ruta: [D(135, 31, 4.5), D(135, 27, 4.5), D(135, 23, 4.5)], seg: 10, kt: 120 } },
    opciones: [
      { id: 'autorizado', nivel: 'correcto', icono: '✅', fuente: 'AIM 3-2-3 · 14 CFR 91.131', camara: cam, clave: 2, radio: true,
        vuelo: { ruta: [D(135, 23, 4.5), D(135, 21.5, 4.5), D(135, 17, 4.5), D(135, 12, 4.5)], seg: 14, kt: 115 } },
      { id: 'contacto', nivel: 'mal', icono: '📡', fuente: 'AIM 3-2-3 · 14 CFR 91.131', camara: cam, clave: 4.3, radio: true, malDentro: true,
        vuelo: { ruta: [D(135, 23, 4.5), D(135, 21.5, 4.5), D(135, 17, 4.5), D(135, 12, 4.5)], seg: 14, kt: 115 } },
      { id: 'debajo', nivel: 'aceptable', icono: '⬇️', fuente: 'AIM 3-2-3', camara: { ...cam, alto: 8 }, clave: 3.2,
        vuelo: { ruta: [D(135, 23, 4.5), D(135, 21, 2.6), D(135, 16.5, 2.5), D(165, 15, 2.5), D(195, 15, 2.5)], seg: 16, kt: 110 } },
    ],
  };
}
function claseD() {
  const H = HECHOS_SITUACIONES.claseD, techo = H.techoAGL / 1000;
  const dentro = (x, y, z) => radial(x, z) <= H.radioNM && y <= techo;
  const cam = { seguir: 0.75, mira: D(90, 4.5, 1.3), giroRel: -40, alto: 14, dist: 6, fov: 50 };
  return {
    id: 'clase-d', unidades: { ftH: 6076, ftV: 1000 }, exagerar: 2, escalaAvion: 0.015, texturaEscala: 0.9, sombra: plano, lineaSuelo: true, niebla3: [1.8, 6.5],
    construir(paleta) {
      return { prims: [...campoPlano(paleta, 26, 13), ...aeropuerto({ x: 0, z: 0, y: 0.02, rumbo: 90, largo: 1.0, ancho: 0.05, paleta, torre: true }),
        ...cilindro([0, 0], H.radioNM, 0, techo, CELESTE, { lados: 30, a: 0.42, borde: [...CELESTE, 1], guion: [7, 5] })] };
    },
    rotulos: T => [
      { p: D(90, H.radioNM, techo * 0.6), texto: T('l.pared'), color: CELESTE, prioridad: 9, tam: 1.2, resaltada: true },
      { p: D(120, H.radioNM, techo), texto: T('l.techo'), prioridad: 6, negrita: false },
    ],
    estado: (T, x, y, z) => ({ texto: T(dentro(x, y, z) ? 'e.dentro' : 'e.fuera', { ft: miles(Math.round(y * 10) * 100) }), clase: dentro(x, y, z) ? 'D' : 'E' }),
    intro: { camara: cam, vuelo: { ruta: [D(90, 13, 1.8), D(90, 10, 1.8), D(90, 7, 1.8)], seg: 10, kt: 105 } },
    opciones: [
      { id: 'torre', nivel: 'correcto', icono: '📻', fuente: 'AIM 3-2-5', camara: cam, clave: 1.6, radio: true,
        vuelo: { ruta: [D(90, 7, 1.8), D(90, 5.5, 1.8), D(90, 3, 1.3), D(70, 1.6, 0.9)], seg: 13, kt: 100 } },
      { id: 'sinHablar', nivel: 'mal', icono: '➡️', fuente: 'AIM 3-2-5 · 14 CFR 91.129', camara: cam, clave: 6.5, radio: true, malDentro: true,
        vuelo: { ruta: [D(90, 7, 1.8), D(90, 4, 1.8), D(90, 1, 1.6)], seg: 12, kt: 105 } },
      { id: 'llamaron', nivel: 'mal', icono: '❓', fuente: 'AIM 3-2-5', camara: cam, clave: 6.5, radio: true, malDentro: true,
        vuelo: { ruta: [D(90, 7, 1.8), D(90, 4, 1.8), D(90, 1, 1.6)], seg: 12, kt: 105 } },
    ],
  };
}

// ---------- Tormentas ----------
// Las celdas del frente frío (x, z en NM; base y tope en miles de pies).
const CELDAS = [[-10, 24, 101], [-2, 22, 102], [10, 24, 103]];
const BASE_CB = 3, TOPE_CB = 45, ANCHO_CB = 10;
const enCelda = (x, y, z, celdas, k = 0.95, altoMax = TOPE_CB) => celdas.some(([cx, cz]) => radial(x, z, [cx, cz]) < ANCHO_CB * 0.42 && y > BASE_CB && y < BASE_CB + altoMax * (0.12 + 0.88 * suave(Math.min(1, k))));
function distanciaLinea(x, z) { return Math.max(0, Math.min(...CELDAS.map(([cx, cz]) => radial(x, z, [cx, cz]) - ANCHO_CB / 2))); }

function frenteFrio() {
  const cam = { seguir: 0.4, mira: [2, 12, 9], giro: 0, alto: 4, dist: 50, fov: 52 };
  const efectos = (op, t, a) => {
    const [x, y, z] = a.pos, dentro = enCelda(x, y, z, CELDAS);
    // La turbulencia crece cerca de las celdas (hasta 20 NM: lo que dice el AIM), y mucho más dentro o debajo.
    const d = distanciaLinea(x, z);
    let f = dentro ? 1 : d < 4 ? 0.7 : d < 8 ? 0.35 : 0;
    if (op === 'desviar') f = Math.min(f, 0.15);
    // Debajo de la base, cerca de la tormenta: oscuro y con lluvia (poca visibilidad).
    const oscuro = !dentro && y < BASE_CB && d < 5;
    return { f, dentro, d, oscuro };
  };
  return {
    id: 'frente-frio', unidades: { ftH: 6076, ftV: 1000 }, exagerar: 0.5, escalaAvion: 0.012, texturaEscala: 0.6, sombra: plano, niebla1: { inicio: 25, fin: 140 }, niebla3: [1.8, 6],
    construir(paleta) {
      const prims = [...campoPlano(paleta, 40, 17), ...aeropuerto({ x: 6, z: -19, y: 0.02, rumbo: 0, largo: 1.2, ancho: 0.06, paleta, torre: false, detalle: false })];
      for (const [cx, cz, s] of CELDAS) prims.push(...nubeTormenta({ x: cx, z: cz, base: BASE_CB, ancho: ANCHO_CB, altoMax: TOPE_CB, k: 0.95, semilla: s, gris: 0.1 }));
      // El frente de ráfagas (gust front): polvo bajo, adelante de las tormentas.
      for (let x = -16; x <= 18; x += 2.2) prims.push(...cumulo({ x, z: 17 + Math.sin(x * 0.4) * 1.2, base: 0.05, ancho: 2.6, alto: 0.3, semilla: 200 + Math.round(x * 3), plana: true, gris: 0.35 }).prims.map(q => ({ ...q, c: [196, 170, 132], a: 0.6 })));
      return { prims };
    },
    rotulos: T => [
      { p: [-2, BASE_CB + TOPE_CB * 0.75, 22], texto: T('l.cb'), prioridad: 8, tam: 1.15, resaltada: true, color: ROJO },
      { p: [12, BASE_CB + TOPE_CB, 24], texto: T('l.yunque'), prioridad: 6 },
      { p: [-12, 0.4, 17], texto: T('l.rafagas'), prioridad: 7, color: [196, 170, 132] },
    ],
    dinamico(t, a, T, real, op) {
      const prims = [], etiquetas = [];
      for (const [cx, cz, s] of CELDAS) {
        prims.push(...lluvia({ x: cx, z: cz, r: ANCHO_CB * 0.4, arriba: BASE_CB, t: real, n: 40, semilla: s }));
        const fl = destello(real, 2.6, s * 0.37);
        if (fl > 0) prims.push(...rayo({ x: cx + 1, z: cz - 1, arriba: BASE_CB, semilla: s + Math.floor(real / 2.6), a: fl }));
      }
      // La distancia a la tormenta, dibujada en el suelo.
      const [x, , z] = a.pos, d = distanciaLinea(x, z), zf = 22 - ANCHO_CB / 2;
      if (z < zf - 1) {
        prims.push(linea([[x, 0.08, z], [x, 0.08, zf]], [255, 220, 80], { a: 1, w: 3, guion: [10, 6], capa: 'calco' }));
        etiquetas.push({ p: [x, 0.1, (z + zf) / 2], texto: T('l.nm', { v: Math.round(d) }), prioridad: 10, tam: 1.3, color: [255, 220, 80] });
      }
      // Granizo alrededor del avión cuando está entre las celdas o debajo.
      if ((op === 'hueco' || op === 'debajo') && d < 4) prims.push(...granizo({ x, z, r: 1.6, arriba: a.pos[1] + 2, abajo: Math.max(0, a.pos[1] - 3), t: real, n: 26, tam: 0.05 }));
      const flash = Math.max(...CELDAS.map(([, , s]) => destello(real, 2.6, s * 0.37)));
      return { prims, etiquetas, flash: flash * 0.6 };
    },
    estado: (T, x, y, z) => { const d = distanciaLinea(x, z), dentro = enCelda(x, y, z, CELDAS); return { texto: dentro ? T('e.dentro') : T('e.distancia', { d: Math.round(d) }), clase: dentro || d < HECHOS_SITUACIONES.tormentas.evitarNM ? 'mal' : 'ok' }; },
    efectos,
    intro: { camara: cam, vuelo: { ruta: [[3, 6, -14], [3, 6, -9], [3, 6, -4]], seg: 10, kt: 120 } },
    opciones: [
      { id: 'encima', nivel: 'mal', icono: '⬆️', fuente: 'PHAK cap. 12 · AIM 7-1-27', camara: { ...cam, mira: [0, 10, 14], dist: 34 }, clave: 6,
        vuelo: { ruta: [[3, 6, -4], [2.5, 9, 4], [1.5, 12, 11], [0, 13, 17], [-1.5, 13, 21], [-2, 13, 24]], seg: 15, kt: 95 } },
      { id: 'hueco', nivel: 'mal', icono: '↗️', fuente: 'AIM 7-1-26 · AIM 7-1-27', camara: { ...cam, mira: [4, 8, 16], dist: 30 }, clave: 7.5,
        vuelo: { ruta: [[3, 6, -4], [3.5, 6, 8], [4, 6, 16], [4, 6, 22], [4, 6, 28]], seg: 15, kt: 115 } },
      { id: 'desviar', nivel: 'correcto', icono: '🛬', fuente: 'AIM 7-1-27', camara: { ...cam, mira: [5, 4, -8], giro: 15, dist: 30 }, clave: 5,
        vuelo: { ruta: [[3, 6, -4], [5.5, 6, 0], [9, 5.5, -4], [8, 4, -10], [6.3, 1.6, -15], [6, 0.4, -18], [6, 0.05, -19.5]], seg: 18, kt: 110 } },
      { id: 'debajo', nivel: 'mal', icono: '⬇️', fuente: 'AIM 7-1-27', camara: { ...cam, mira: [2, 2, 14], alto: 5, dist: 26 }, clave: 8,
        vuelo: { ruta: [[3, 6, -4], [3, 2.4, 6], [3, 2.1, 13], [3, 0.9, 19], [3, 1.4, 25]], seg: 15, kt: 110 } },
    ],
  };
}

// Una sola nube que crece delante (y unos estratos a la izquierda, para comparar).
const CELDA_N = [0, 16];
const kNube = (op, t) => op === 'intro' ? 0.12 + 0.38 * limitar(t / 12, 0, 1) : op === 'rodear' ? 0.5 + 0.85 * limitar(t / 16, 0, 1) : 0.5 + 0.5 * limitar(t / 11, 0, 1);
function nubes() {
  const cam = { seguir: 0.4, mira: [-4, 7, 8], giro: 352, alto: 8, dist: 38, fov: 48 };
  const ALTO_N = 40;
  return {
    id: 'nubes', unidades: { ftH: 6076, ftV: 1000 }, exagerar: 0.6, escalaAvion: 0.012, texturaEscala: 0.6, sombra: plano, niebla1: { inicio: 20, fin: 120 }, niebla3: [1.8, 6],
    construir(paleta) {
      const prims = [...campoPlano(paleta, 40, 21)];
      // Estratos (stratus): una capa pareja, gris, baja.
      let s = 300;
      for (let x = -28; x <= -10; x += 3.2) for (let z = -6; z <= 30; z += 3.4) prims.push(...cumulo({ x, z, base: 2.0, ancho: 4.6, alto: 0.6, semilla: s++, plana: true, gris: 0.32 }).prims);
      return { prims };
    },
    rotulos: T => [
      { p: [-19, 3.2, 6], texto: T('l.estratos'), prioridad: 8, tam: 1.15, color: [160, 170, 185] },
    ],
    dinamico(t, a, T, real, op) {
      const k = kNube(op, t), prims = [], etiquetas = [];
      prims.push(...nubeTormenta({ x: CELDA_N[0], z: CELDA_N[1], base: 3, ancho: 8, altoMax: ALTO_N, k, semilla: 41 }));
      const tope = 3 + ALTO_N * (0.12 + 0.88 * suave(Math.min(1, k)));
      etiquetas.push({ p: [CELDA_N[0], tope + 1, CELDA_N[1]], texto: T(`l.${etapaNube(k)}`), prioridad: 10, tam: 1.3, resaltada: true, color: k >= 0.75 ? ROJO : NARANJA });
      etiquetas.push({ p: [CELDA_N[0] + 3, 3, CELDA_N[1]], texto: T('l.base'), prioridad: 6, negrita: false });
      if (k >= 0.75) {
        prims.push(...lluvia({ x: CELDA_N[0], z: CELDA_N[1], r: 2.4, arriba: 3, t: real, n: 30, semilla: 9 }));
        if (k <= 1.1) { const fl = destello(real, 2.2, 0.4); if (fl > 0) prims.push(...rayo({ x: 0.8, z: CELDA_N[1] - 0.8, arriba: 3, semilla: 3 + Math.floor(real / 2.2), a: fl })); }
      }
      const [x, , z] = a.pos, d = Math.max(0, radial(x, z, CELDA_N) - 3);
      prims.push(linea([[x, 0.08, z], [CELDA_N[0], 0.08, CELDA_N[1] - 3]], [255, 220, 80], { a: 1, w: 3, guion: [10, 6], capa: 'calco' }));
      etiquetas.push({ p: [(x + CELDA_N[0]) / 2, 0.1, (z + CELDA_N[1] - 3) / 2], texto: T('l.nm', { v: Math.round(d) }), prioridad: 9, tam: 1.25, color: [255, 220, 80] });
      return { prims, etiquetas, flash: k >= 0.75 && k <= 1.1 ? destello(real, 2.2, 0.4) * 0.5 : 0, k };
    },
    estado: (T, x, y, z, t, op) => { const k = kNube(op, t); return { texto: T('e.etapa', { etapa: T(`l.${etapaNube(k)}`) }), clase: k >= 0.75 ? 'mal' : 'ok' }; },
    efectos(op, t, a) {
      const [x, y, z] = a.pos, k = kNube(op, t), alto = ALTO_N * (0.12 + 0.88 * suave(Math.min(1, k)));
      const dentro = radial(x, z, CELDA_N) < 2.6 && y > 3 && y < 3 + alto;
      const debajo = radial(x, z, CELDA_N) < 3.5 && y <= 3;
      return { f: dentro ? 1 : debajo ? 0.8 : 0, dentro, granizo: debajo && k > 0.75 };
    },
    intro: { camara: cam, vuelo: { ruta: [[2, 5.5, -12], [2, 5.5, -7], [2, 5.5, -2]], seg: 12, kt: 115 } },
    opciones: [
      { id: 'seguir', nivel: 'mal', icono: '➡️', fuente: 'PHAK cap. 12 · AIM 7-1-26', camara: { ...cam, mira: [0, 8, 12], dist: 26 }, clave: 5,
        vuelo: { ruta: [[2, 5.5, -2], [1, 5.5, 8], [0.4, 5.5, 14], [0, 5.5, 18]], seg: 12, kt: 115 } },
      { id: 'rodear', nivel: 'correcto', icono: '↩️', fuente: 'AIM 7-1-27 · PHAK cap. 12', camara: { ...cam, mira: [2, 13, 10], giro: 335, alto: 3, dist: 62 }, clave: 9,
        vuelo: { ruta: [[2, 5.5, -2], [5, 5.5, 1], [10, 5.5, -3], [9, 5.5, -12], [4, 5.5, -20]], seg: 16, kt: 115 } },
      { id: 'debajo', nivel: 'mal', icono: '⬇️', fuente: 'AIM 7-1-27', camara: { ...cam, mira: [1, 3, 12], alto: 5, dist: 24 }, clave: 7,
        vuelo: { ruta: [[2, 5.5, -2], [1.5, 2.5, 6], [1, 2.2, 12], [0.5, 1.6, 16], [0, 2, 20]], seg: 12, kt: 110 } },
    ],
  };
}

// ---------- VFR en nubes (VFR into IMC) ----------
// Un valle con nubes que bajan: la base a 2,400 ft al empezar y cada vez más baja hacia el norte. Unidades: 1,000 ft.
export const baseNubesImc = z => 2.4 - Math.max(0, z + 6) * 0.06;
const sueloValle = (x, z) => 1.4 * Math.pow(Math.max(0, (Math.abs(x) - 2.6) / 6), 1.4) + 0.06 * ruido(x * 0.3, z * 0.3, 4) + Math.max(0, z - 14) * 0.03;
const TORRE = [1.2, 14];
function vfrImc() {
  const cam = { seguir: 1, mira: [0, 1.4, -6], giroRel: 20, alto: 9, dist: 3.4, fov: 52 };
  return {
    id: 'vfr-imc', unidades: { ftH: 1000, ftV: 1000 }, exagerar: 1, escalaAvion: 0.006, texturaEscala: 0.35, sombra: sueloValle, niebla1: { inicio: 4, fin: 30 }, niebla3: [1.5, 6],
    construir(paleta) {
      const prims = campo({ x0: -14, z0: -24, x1: 14, z1: 34, n: 24, altura: sueloValle, paleta, semilla: 33, falda: 200 });
      // El techo de nubes, cada vez más bajo.
      let s = 500;
      for (let z = -8; z <= 34; z += 2.4) for (let x = -12; x <= 12; x += 2.6) {
        const b = baseNubesImc(z);
        prims.push(...cumulo({ x: x + ((z * 7) % 1.3), z, base: b, ancho: 3.4, alto: 0.7, semilla: s++, plana: true, gris: 0.28 }).prims);
      }
      // Una antena (obstáculo) con su luz roja.
      prims.push(...caja(TORRE[0] - 0.02, 0, TORRE[1] - 0.02, TORRE[0] + 0.02, sueloValle(...TORRE) + 0.75, TORRE[1] + 0.02, [200, 60, 50]));
      return { prims };
    },
    rotulos: T => [
      { p: [3, baseNubesImc(8), 8], texto: T('l.techo'), prioridad: 8, tam: 1.15, color: [180, 185, 195] },
      { p: [TORRE[0], sueloValle(...TORRE) + 0.8, TORRE[1]], texto: T('l.antena'), prioridad: 7, color: ROJO, cabina: true },
    ],
    dinamico() { return { prims: [], etiquetas: [] }; },
    estado: (T, x, y, z, t, op, a) => {
      const agl = Math.round((y - sueloValle(x, z)) * 10) * 100, dentro = y > baseNubesImc(z) - 0.05;
      const espiral = op === 'seguir' && dentro && Math.abs(a?.alabeo ?? 0) > 30;
      const cerca = !dentro && agl < 800 && op !== 'intro' && op !== 'virar';
      return { texto: espiral ? T('e.espiral') : dentro ? T('e.dentro') : cerca ? T('e.terreno', { agl: miles(Math.max(0, agl)) }) : T('e.fuera', { agl: miles(Math.max(0, agl)) }), clase: dentro || cerca ? 'mal' : 'ok' };
    },
    efectos(op, t, a) {
      const [x, y, z] = a.pos, dentro = y > baseNubesImc(z) - 0.05;
      // En la nube, el que sigue se desorienta: el alabeo crece sin que lo note y la nariz baja (la espiral).
      const espiral = op === 'seguir' && dentro ? limitar((t - 6.5) / 6, 0, 1) : 0;
      return { f: dentro ? 0.25 : 0, dentro, alabeoExtra: 32 * espiral, cabeceoExtra: -9 * espiral };
    },
    intro: { camara: cam, vuelo: { ruta: [[0, 1.4, -16], [0, 1.4, -11], [0, 1.4, -6]], seg: 10, kt: 100 } },
    opciones: [
      { id: 'seguir', nivel: 'mal', icono: '☁️', fuente: 'AFH cap. 18 · PHAK cap. 17', camara: { seguir: 0.5, mira: [1.5, 1.1, 13], giro: 320, alto: 2, dist: 7.5, fov: 52 }, clave: 5.2, maxAlabeo: 55,
        vuelo: { ruta: [[0, 1.4, -6], [0, 1.5, 4], [0.4, 1.6, 11], [2.2, 1.55, 14], [3.2, 1.4, 16.5], [2.4, 1.2, 18.6], [0.6, 1.0, 18.2], [0.1, 0.85, 16.3], [1.0, 0.72, 15.1], [2.4, 0.66, 16.4], [2.6, 0.6, 18.5]], seg: 18, kt: 105 } },
      { id: 'virar', nivel: 'correcto', icono: '↩️', fuente: 'AFH cap. 18 · 14 CFR 91.155', camara: { ...cam, giroRel: 40, alto: 5, dist: 4.5 }, clave: 4,
        vuelo: { ruta: [[0, 1.4, -6], [0, 1.4, 0], [1.5, 1.4, 3.5], [3.5, 1.4, 2.5], [4, 1.4, -2], [3.5, 1.4, -12]], seg: 16, kt: 100 } },
      { id: 'bajar', nivel: 'mal', icono: '⬇️', fuente: '14 CFR 91.155 · AFH cap. 18', camara: cam, clave: 9,
        vuelo: { ruta: [[0, 1.4, -6], [0, 0.95, 2], [0.2, 0.55, 9], [0.6, 0.5, 12.5], [0.9, 1.45, 15.6], [1.0, 1.95, 18]], seg: 14, kt: 100 } },
    ],
  };
}

// ---------- Altitud de densidad (un día de calor en un aeropuerto alto) ----------
const ARBOLES_Z = 3.3;
function densidad() {
  const cam = { seguir: 0.6, mira: [0, 0.2, 0], giro: 70, alto: 10, dist: 4.2, fov: 50 };
  return {
    id: 'densidad', unidades: { ftH: 1000, ftV: 1000 }, exagerar: 1, escalaAvion: 0.008, texturaEscala: 0.35, sombra: () => 0, niebla1: { inicio: 6, fin: 40 }, niebla3: [2, 7],
    construir(paleta) {
      const prims = campo({ x0: -20, z0: -20, x1: 20, z1: 24, n: 16, altura: (x, z) => (Math.abs(x) > 9 ? (Math.abs(x) - 9) * 0.25 : 0) + 0.02 * ruido(x * 0.4, z * 0.4, 8), paleta, semilla: 61, falda: 200 });
      prims.push(...aeropuerto({ x: 0, z: 0, y: 0, rumbo: 0, largo: 5, ancho: 0.15, paleta }));
      // Una hilera de árboles al final de la pista (60 ft).
      for (let x = -2.4; x <= 2.4; x += 0.22) for (const dz of [0, 0.16]) {
        const h = 0.06 + 0.012 * Math.sin(x * 9 + dz * 20);
        prims.push(...caja(x - 0.06, 0, ARBOLES_Z + dz - 0.06, x + 0.06, h, ARBOLES_Z + dz + 0.06, [52, 104, 58]));
      }
      return { prims };
    },
    rotulos: T => [{ p: [1.6, 0.12, ARBOLES_Z], texto: T('l.arboles'), prioridad: 8, tam: 1.15, color: VERDE, cabina: true }],
    dinamico() { return { prims: [], etiquetas: [] }; },
    estado: (T, x, y, z) => ({ texto: T('e.calor', { ft: miles(HECHOS_SITUACIONES.densidad.elevacionFt), c: HECHOS_SITUACIONES.densidad.temperaturaC, isa: isaEn(HECHOS_SITUACIONES.densidad.elevacionFt) }), clase: 'mal' }),
    efectos(op, t, a) {
      const [, y, z] = a.pos, alarma = op === 'despegar' && z > 2.4 && z < 4.2 && y < 0.2;
      return { f: 0, alarma };
    },
    alturaFt: y => HECHOS_SITUACIONES.densidad.elevacionFt + y * 1000,
    intro: { camara: cam, vuelo: { ruta: [[0, 0.02, -2.6], [0, 0.02, -2.5], [0, 0.02, -2.42]], seg: 6, kt: 0 } },
    opciones: [
      { id: 'despegar', nivel: 'mal', icono: '🛫', fuente: 'PHAK cap. 11', camara: { ...cam, mira: [0, 0.2, 2], giro: 75, dist: 5 }, clave: 11.5,
        vuelo: { ruta: [[0, 0.02, -2.42], [0, 0.02, 0], [0, 0.025, 1.9], [0, 0.06, 2.9], [0, 0.1, 3.5], [0, 0.19, 4.6], [0, 0.32, 6]], seg: 16, kt: 65 } },
      { id: 'calcular', nivel: 'correcto', icono: '📖', fuente: 'PHAK cap. 11', camara: { ...cam, mira: [0, 0.3, 1.5], giro: 75, dist: 5 }, clave: 8,
        vuelo: { ruta: [[0, 0.02, -2.42], [0, 0.025, -0.8], [0, 0.2, 0.6], [0, 0.45, 2.3], [0, 0.72, 3.6], [0, 1.1, 6]], seg: 14, kt: 70 } },
    ],
  };
}

export const SITUACIONES = Object.freeze(Object.fromEntries([claseC(), claseB(), claseD(), frenteFrio(), nubes(), vfrImc(), densidad()].map(s => [s.id, s])));

// Los textos (es). Claves: «clase.e3d.sit.<situación>.<clave>».
export const TEXTOS_SITUACIONES = {
  'ctl.correcto': 'Lo correcto', 'ctl.aceptable': 'Se puede, pero no es lo mejor', 'ctl.mal': 'Esto pasaría',
  'ctl.porque': 'Por qué', 'ctl.otra': 'Intentar otra opción', 'ctl.siguiente': 'Siguiente', 'ctl.fuente': 'Fuente: {f}',
  'ctl.final': 'Recuerda', 'ctl.repetirIntro': 'Ver la situación otra vez', 'ctl.radio': 'Radio',
  'clase-c.titulo': 'Situación: la Clase C delante',
  'clase-c.intro': 'Vas a **3,500 ft** hacia el aeropuerto. Delante está la pared magenta de la **Clase C**.',
  'clase-c.pregunta': '¿Qué haces?',
  'clase-c.recuerda': 'Clase C: antes de la pared, **contacto por radio** con tu matrícula.',
  'clase-c.llamar.boton': 'Llamo a Approach y espero', 'clase-c.llamar.resultado': 'Llamas antes de la pared. Approach contesta con tu matrícula: ya hay contacto y entras.',
  'clase-c.llamar.clave': 'Dijeron tu matrícula: hay contacto', 'clase-c.llamar.radio': '«N123AB, Approach, standby.»',
  'clase-c.llamar.porque': 'Si el controlador dice tu matrícula, aunque sea «standby», la comunicación está establecida y puedes entrar.',
  'clase-c.llamar.regla': 'Clase C: **comunicación de ida y vuelta** antes de entrar.',
  'clase-c.entrar.boton': 'Entro sin hablar', 'clase-c.entrar.resultado': 'Cruzas la pared sin hablar con nadie. Approach te ve en el radar.',
  'clase-c.entrar.clave': 'Aquí entraste sin contacto', 'clase-c.entrar.radio': '«N123AB, you entered Class C airspace without establishing communication. Possible pilot deviation. Advise you call this number.»',
  'clase-c.entrar.porque': 'Sin comunicación establecida no puedes entrar: es una infracción y el controlador tiene que mover a otros aviones.',
  'clase-c.entrar.regla': 'Clase C: **contacto antes de la pared**, no después.',
  'clase-c.encima.boton': 'Subo y paso por encima', 'clase-c.encima.resultado': 'Subes por encima del techo de 4,000 ft AGL y pasas sobre la Clase C.',
  'clase-c.encima.clave': '4,600 ft: arriba del techo', 'clase-c.encima.porque': 'Arriba del techo es legal, pero hay que subir a tiempo y llevar transpondedor con altitud. Llamar es más simple.',
  'clase-c.encima.regla': 'Sobre la Clase C se exige **transpondedor Modo C** (14 CFR 91.215).',
  'clase-c.l.pared': 'Pared de la Clase C', 'clase-c.l.techo': 'Techo 4,000 ft AGL', 'clase-c.l.piso': 'Piso 1,200 ft AGL',
  'clase-c.e.fuera': 'Fuera de la Clase C · {ft} ft', 'clase-c.e.dentro': 'Dentro de la Clase C · {ft} ft',
  'clase-b.titulo': 'Situación: la Clase B delante',
  'clase-b.intro': 'Vas a **4,500 ft**. Approach te dijo «radar contact». Delante empieza la **Clase B**.',
  'clase-b.pregunta': '¿Entras?',
  'clase-b.recuerda': 'Clase B: entras solo con «**cleared into the Class Bravo**».',
  'clase-b.autorizado.boton': 'Espero «cleared into Bravo»', 'clase-b.autorizado.resultado': 'Esperas afuera hasta oír la autorización. Recién ahí entras.',
  'clase-b.autorizado.clave': '«Cleared into Class Bravo»: ahora sí', 'clase-b.autorizado.radio': '«N123AB, cleared into the Class Bravo airspace, maintain 4,500.»',
  'clase-b.autorizado.porque': 'En la Clase B hace falta una autorización (clearance) de ATC. Contacto por radio no alcanza.',
  'clase-b.autorizado.regla': 'Clase B: **autorización de ATC** antes de entrar.',
  'clase-b.contacto.boton': 'Entro con «radar contact»', 'clase-b.contacto.resultado': '«Radar contact» no es permiso. Entras a la Clase B sin autorización.',
  'clase-b.contacto.clave': 'Aquí entraste sin autorización', 'clase-b.contacto.radio': '«N123AB, you entered Class B airspace without a clearance. Possible pilot deviation. Advise you call this number.»',
  'clase-b.contacto.porque': '«Radar contact» solo dice que te ven. Para la Clase B hay que oír «cleared into the Class Bravo».',
  'clase-b.contacto.regla': '«Radar contact» **no es una autorización**.',
  'clase-b.debajo.boton': 'Bajo y paso por debajo', 'clase-b.debajo.resultado': 'Bajas a 2,500 ft y pasas por debajo del piso de 3,000 ft, sin entrar.',
  'clase-b.debajo.clave': '2,500 ft: debajo del piso', 'clase-b.debajo.porque': 'Debajo de cada piso no estás en la Clase B. Vale, pero no te acerques al núcleo, que llega al suelo.',
  'clase-b.debajo.regla': 'Los pisos de la Clase B se leen en la **carta seccional**.',
  'clase-b.l.pared': 'Clase B · piso 3,000', 'clase-b.l.piso': 'Piso 3,000 ft MSL', 'clase-b.l.techo': 'Techo 10,000 ft MSL',
  'clase-b.e.fuera': 'Fuera de la Clase B · {ft} ft', 'clase-b.e.dentro': 'Dentro de la Clase B · {ft} ft',
  'clase-d.titulo': 'Situación: llegar a un aeropuerto con torre',
  'clase-d.intro': 'Vas a **1,800 ft** hacia un aeropuerto con torre: la **Clase D** llega a 2,500 ft AGL.',
  'clase-d.pregunta': '¿Qué haces?',
  'clase-d.recuerda': 'Clase D: entras cuando la torre **dice tu matrícula**.',
  'clase-d.torre.boton': 'Llamo a la torre y espero', 'clase-d.torre.resultado': 'La torre contesta con tu matrícula. Entras y sigues sus instrucciones.',
  'clase-d.torre.clave': 'Dijeron tu matrícula: hay contacto', 'clase-d.torre.radio': '«N123AB, Tower, standby.»',
  'clase-d.torre.porque': 'Con tu matrícula en la respuesta, la comunicación está establecida.',
  'clase-d.torre.regla': 'Clase D: **comunicación de ida y vuelta** antes de entrar.',
  'clase-d.sinHablar.boton': 'Entro sin hablar', 'clase-d.sinHablar.resultado': 'Entras sin llamar. La torre no sabe quién eres ni qué vas a hacer.',
  'clase-d.sinHablar.clave': 'Aquí entraste sin contacto', 'clase-d.sinHablar.radio': '«Aircraft entering Class Delta from the east, you have not established communication. Possible pilot deviation.»',
  'clase-d.sinHablar.porque': 'Sin contacto la torre no puede separarte del tránsito del circuito. Es una infracción.',
  'clase-d.sinHablar.regla': 'Clase D: **contacto antes de entrar**.',
  'clase-d.llamaron.boton': 'Oí «Aircraft calling, standby»', 'clase-d.llamaron.resultado': 'Llamaste, pero contestaron sin tu matrícula. Entras igual.',
  'clase-d.llamaron.clave': 'Sin tu matrícula: no hay contacto', 'clase-d.llamaron.radio': '«Aircraft calling Tower, standby.»',
  'clase-d.llamaron.porque': 'Si no dicen tu matrícula, la comunicación no está establecida y no puedes entrar.',
  'clase-d.llamaron.regla': '«Aircraft calling…» **sin tu matrícula** = sin contacto.',
  'clase-d.l.pared': 'Pared de la Clase D', 'clase-d.l.techo': 'Techo 2,500 ft AGL',
  'clase-d.e.fuera': 'Fuera de la Clase D · {ft} ft', 'clase-d.e.dentro': 'Dentro de la Clase D · {ft} ft',
  'frente-frio.titulo': 'Situación: una línea de tormentas',
  'frente-frio.intro': 'Delante, un **frente frío** con una línea de **cumulonimbos** (Cb). Hay un hueco entre dos.',
  'frente-frio.pregunta': '¿Qué haces?',
  'frente-frio.recuerda': 'Tormentas: **20 NM** de distancia o esperar en tierra. Ni encima, ni por el hueco, ni debajo.',
  'frente-frio.encima.boton': 'Subo y paso por encima', 'frente-frio.encima.resultado': 'Subes todo lo que puedes, pero la tormenta sigue más arriba. Entras a la nube.',
  'frente-frio.encima.clave': 'Topes de 50,000 ft: no pasas',
  'frente-frio.encima.porque': 'Una avioneta no puede pasar sobre una tormenta: sus topes llegan a 50,000 o 60,000 ft.',
  'frente-frio.encima.regla': 'Pasar encima de una tormenta es **imposible** en una avioneta.',
  'frente-frio.hueco.boton': 'Paso por el hueco', 'frente-frio.hueco.resultado': 'Entre las celdas la turbulencia es fuerte. Hay granizo y rayos.',
  'frente-frio.hueco.clave': 'Entre celdas: turbulencia y granizo',
  'frente-frio.hueco.porque': 'Entre ecos fuertes separados por 20 a 30 millas o menos no hay camino libre de turbulencia severa.',
  'frente-frio.hueco.regla': 'Huecos de **menos de 20–30 NM**: no hay paso seguro.',
  'frente-frio.desviar.boton': 'Me desvío y aterrizo', 'frente-frio.desviar.resultado': 'Das la vuelta, aterrizas en un aeropuerto cercano y esperas que pase el frente.',
  'frente-frio.desviar.clave': 'Lejos: más de 20 NM', 'frente-frio.desviar.porque': 'Si no puedes rodear las tormentas, el AIM dice: desvía y espera en tierra.',
  'frente-frio.desviar.regla': 'A las tormentas severas, **20 NM** como mínimo.',
  'frente-frio.debajo.boton': 'Paso por debajo', 'frente-frio.debajo.resultado': 'Bajas para pasar por debajo. La corriente descendente te empuja hacia el suelo.',
  'frente-frio.debajo.clave': 'Corriente descendente: te baja',
  'frente-frio.debajo.porque': 'Debajo de una tormenta hay turbulencia y cizalladura (wind shear), aunque se vea el otro lado.',
  'frente-frio.debajo.regla': 'Nunca vueles **debajo de una tormenta**.',
  'frente-frio.l.cb': 'Cumulonimbos (Cb)', 'frente-frio.l.yunque': 'Yunque (anvil)', 'frente-frio.l.rafagas': 'Frente de ráfagas (gust front)', 'frente-frio.l.nm': '{v} NM',
  'frente-frio.e.distancia': 'Tormentas a {d} NM', 'frente-frio.e.dentro': 'Dentro de la tormenta',
  'nubes.titulo': 'Situación: una nube que crece',
  'nubes.intro': 'Delante, un **cúmulo** crece rápido hacia arriba. A la izquierda hay **estratos**: capas parejas.',
  'nubes.pregunta': 'El cúmulo crece rápido delante. ¿Sigues?',
  'nubes.recuerda': 'Cúmulo que crece: aire inestable. En unos **15 min** puede ser una tormenta madura.',
  'nubes.seguir.boton': 'Sigo derecho', 'nubes.seguir.resultado': 'El cúmulo se hace cumulonimbo. Entras: corrientes fuertes, turbulencia y nada de visibilidad.',
  'nubes.seguir.clave': 'En 15 min ya es tormenta madura',
  'nubes.seguir.porque': 'Los cúmulos en torre muestran aire inestable y turbulento: suelen hacerse tormentas.',
  'nubes.seguir.regla': 'Cúmulo → madura en **unos 15 minutos** (PHAK).',
  'nubes.rodear.boton': 'Doy la vuelta, bien lejos', 'nubes.rodear.resultado': 'Te alejas y la ves de lejos: madura con lluvia y rayos, y después se deshace.',
  'nubes.rodear.clave': 'Madura: lluvia, rayos y granizo',
  'nubes.rodear.porque': 'Toda tormenta pasa por 3 etapas: cúmulo, madura y disipación. Lejos estás a salvo.',
  'nubes.rodear.regla': 'A una tormenta severa, **20 NM** o más.',
  'nubes.debajo.boton': 'Paso por debajo', 'nubes.debajo.resultado': 'Pasas bajo la base. La corriente descendente te empuja y empieza a caer granizo.',
  'nubes.debajo.clave': 'Debajo: descendente y granizo',
  'nubes.debajo.porque': 'En la etapa madura la lluvia arrastra el aire hacia abajo con fuerza. Debajo es peligroso.',
  'nubes.debajo.regla': 'Nunca vueles **debajo de una tormenta**.',
  'nubes.l.cumulo': 'Cúmulo (cumulus)', 'nubes.l.torre': 'Cúmulo en torre (towering cumulus)', 'nubes.l.madura': 'Tormenta madura (Cb)', 'nubes.l.disipacion': 'Disipación',
  'nubes.l.estratos': 'Estratos (stratus): aire estable', 'nubes.l.base': 'Base', 'nubes.l.nm': '{v} NM',
  'nubes.e.etapa': '{etapa} · tiempo acelerado',
  'vfr-imc.titulo': 'Situación: las nubes bajan',
  'vfr-imc.intro': 'Vas por un valle a **1,400 ft**. Delante, las nubes están **cada vez más bajas**.',
  'vfr-imc.pregunta': '¿Qué haces?',
  'vfr-imc.recuerda': 'Nubes que bajan: **viraje de 180°** a tiempo. Dentro de la nube, solo los instrumentos.',
  'vfr-imc.seguir.boton': 'Sigo y entro a la nube', 'vfr-imc.seguir.resultado': 'Entras a la nube. Sin horizonte, el oído te engaña: el viraje se cierra y bajas.',
  'vfr-imc.seguir.clave': 'Sin horizonte: el oído engaña',
  'vfr-imc.seguir.porque': 'Sin entrenamiento de instrumentos, un piloto pierde el control en unos 10 minutos. Así empieza la espiral (graveyard spiral).',
  'vfr-imc.seguir.regla': 'Piloto VFR en nubes: **pierde el control en unos 10 min** (AFH).',
  'vfr-imc.virar.boton': 'Viro 180° ahora', 'vfr-imc.virar.resultado': 'Viras antes de entrar a la nube y vuelves al buen tiempo que dejaste atrás.',
  'vfr-imc.virar.clave': '180° antes de la nube',
  'vfr-imc.virar.porque': 'Volver por donde viniste es lo más seguro: allá todavía había horizonte. Si ya estás dentro, alabeo de 10° como máximo.',
  'vfr-imc.virar.regla': 'Dentro de una nube, virajes de **10° como máximo** (AFH).',
  'vfr-imc.bajar.boton': 'Bajo y paso por debajo', 'vfr-imc.bajar.resultado': 'Bajas cerca del suelo. Aparece una antena y no hay espacio para esquivar.',
  'vfr-imc.bajar.clave': 'Antena delante: sin margen',
  'vfr-imc.bajar.porque': 'Bajo nubes que siguen bajando, el espacio entre la nube y el suelo desaparece.',
  'vfr-imc.bajar.regla': 'Sin los **mínimos VFR** (14 CFR 91.155), no sigas.',
  'vfr-imc.l.techo': 'Base de las nubes', 'vfr-imc.l.antena': 'Antena',
  'vfr-imc.e.fuera': 'Debajo de las nubes · {agl} ft AGL', 'vfr-imc.e.terreno': '¡Terreno cerca! · {agl} ft AGL', 'vfr-imc.e.dentro': 'Dentro de la nube: sin horizonte', 'vfr-imc.e.espiral': 'Espiral: el viraje se cierra',
  'densidad.titulo': 'Situación: despegar con calor',
  'densidad.intro': 'Aeropuerto a **5,000 ft**, **35 °C** y la pista termina en árboles. El aire caliente y alto es fino.',
  'densidad.pregunta': '¿Qué haces?',
  'densidad.recuerda': 'Calor, altura y humedad: **altitud de densidad alta**. Calcula con el manual antes de despegar.',
  'densidad.despegar.boton': 'Despego como siempre', 'densidad.despegar.resultado': 'La carrera es larga y el avión sube poco. Pasas los árboles por muy poco.',
  'densidad.despegar.clave': 'Árboles: pasas por muy poco',
  'densidad.despegar.porque': 'Con altitud de densidad alta necesitas más velocidad y el motor da menos empuje.',
  'densidad.despegar.regla': 'Densidad alta: **más carrera, menos subida**.',
  'densidad.calcular.boton': 'Calculo con el manual (POH)', 'densidad.calcular.resultado': 'Calculas la distancia con las tablas, vas más liviano y temprano. Pasas los árboles con margen.',
  'densidad.calcular.clave': 'Con margen sobre los árboles',
  'densidad.calcular.porque': 'Lo estándar a 5,000 ft son 5 °C. A 35 °C el aire es mucho más fino: las tablas te dicen si alcanza la pista.',
  'densidad.calcular.regla': 'Estándar: **15 °C** al nivel del mar, **2 °C menos** cada 1,000 ft.',
  'densidad.l.arboles': 'Árboles (60 ft)',
  'densidad.e.calor': '{ft} ft · {c} °C (estándar: {isa} °C)',
};
