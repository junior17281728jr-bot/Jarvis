// 0.14.78: escena 3D «espacio-aereo»: el «pastel de bodas al revés». Clases A, B, C, D, E y G con sus medidas típicas
// (PHAK cap. 15; AIM cap. 3) y lo que pide cada una (PHAK fig. 15-9). El avión vuela por ellas y se dice en qué clase
// está y qué necesita. Unidades: x y z en millas náuticas (NM), y en miles de pies (la altura va exagerada ~6 veces).
import { cilindro, anillo, tapaCircular, lamina, linea, poligono, ruido, suave, limitar, cajaVolumen } from './motor3d.js';
import { COLOR_CLASE, aeropuerto, campo, miles } from './e3d-base.js';

// Los datos (no del libro: las medidas de la norma). B, C y D son TÍPICOS: cada aeropuerto tiene los suyos (la carta).
export const ESPACIO_AEREO = Object.freeze({
  A: Object.freeze({ pisoMSL: 18000, techoFL: 600 }),
  B: Object.freeze({ techoMSL: 10000, pisos: Object.freeze([{ radioNM: 10, pisoMSL: 0 }, { radioNM: 20, pisoMSL: 3000 }, { radioNM: 30, pisoMSL: 6000 }]), tipico: true }),
  C: Object.freeze({ nucleoNM: 5, anilloNM: 10, techoAGL: 4000, pisoAnilloAGL: 1200, tipico: true }),
  D: Object.freeze({ radioNM: 4, techoAGL: 2500, tipico: true }),
  E: Object.freeze({ pisoAGL: 1200, pisoCercaAGL: 700, techoMSL: 17999, radioCercaNM: 7 }),
});
// Lo que pide cada clase para volar VFR (A: solo IFR).
export const REQUISITOS = Object.freeze({ A: ['ifr'], B: ['autorizacion', 'radio', 'transpondedor', 'adsb'], C: ['radio', 'transpondedor', 'adsb'], D: ['radio'], E: [], G: [] });

// Dónde está cada aeropuerto (NM).
const LUGAR = { B: [0, 0], C: [48, -14], D: [34, 27] };
// La costa al oeste (el mar a nivel 0) y colinas suaves que suben hacia el noreste.
export const esMar = (x, z) => x + 5 * Math.sin(z * 0.07) < -34;
const crudo = (x, z) => (0.08 + 0.55 * ruido(x * 0.045 + 3, z * 0.045 + 1, 11) + 0.25 * Math.max(0, (x + z) / 120)) * suave(limitar((x + 5 * Math.sin(z * 0.07) + 34) / 8, 0, 1));
const ELEV = Object.fromEntries(Object.entries(LUGAR).map(([k, [x, z]]) => [k, crudo(x, z)]));
// La altura del terreno (miles de pies MSL), plana cerca de cada aeropuerto.
export function alturaTerreno(x, z) {
  let h = crudo(x, z);
  for (const [k, [ax, az]] of Object.entries(LUGAR)) {
    const w = suave(limitar((Math.hypot(x - ax, z - az) - 2.5) / 5, 0, 1));
    h = ELEV[k] + (h - ELEV[k]) * w;
  }
  return h;
}
export const elevacion = k => ELEV[k];

// ¿En qué clase está un punto? (x, z en NM; ft MSL). La más restrictiva manda: A, B, C, D, E y G.
export function claseEn(x, ftMSL, z) {
  const E = ESPACIO_AEREO;
  if (ftMSL >= E.A.pisoMSL && ftMSL <= E.A.techoFL * 100) return 'A';
  if (ftMSL > E.A.techoFL * 100) return 'E';
  const d = k => Math.hypot(x - LUGAR[k][0], z - LUGAR[k][1]);
  if (ftMSL <= E.B.techoMSL && E.B.pisos.some(p => d('B') <= p.radioNM && ftMSL >= p.pisoMSL)) return 'B';
  const sobreC = ftMSL - ELEV.C * 1000;
  if (sobreC <= E.C.techoAGL && (d('C') <= E.C.nucleoNM || (d('C') <= E.C.anilloNM && sobreC >= E.C.pisoAnilloAGL))) return 'C';
  if (d('D') <= E.D.radioNM && ftMSL - ELEV.D * 1000 <= E.D.techoAGL) return 'D';
  const agl = ftMSL - alturaTerreno(x, z) * 1000;
  const piso = d('D') <= E.E.radioCercaNM ? E.E.pisoCercaAGL : E.E.pisoAGL;
  return agl >= piso ? 'E' : 'G';
}

export const TEXTOS = {
  titulo: 'El espacio aéreo en 3D',
  recuerda: 'G y E: nada en VFR · D: radio · C: radio y transpondedor · B: autorización · A: solo IFR.',
  'vista.titulo': 'Un pastel al revés',
  'vista.texto': 'Cerca de los aeropuertos grandes, el espacio aéreo es angosto abajo y ancho arriba: un **pastel de bodas al revés**.',
  'vista.mas': 'Cada clase pide algo distinto: radio, transpondedor o una autorización. Las medidas de esta escena son las típicas; cada aeropuerto tiene las suyas y las ves en la carta seccional (sectional chart).',
  'g.titulo': 'Clase G',
  'g.texto': 'Cerca del suelo y lejos de los aeropuertos está la **Clase G**: espacio no controlado (uncontrolled airspace). En VFR no pide nada.',
  'g.mas': 'Suele llegar hasta 700 o 1,200 ft AGL, donde empieza la Clase E. Igual tienes que cumplir los mínimos VFR y mirar afuera para ver y evitar.',
  'e.titulo': 'Clase E',
  'e.texto': 'Al subir entras en la **Clase E**: controlada desde **1,200 ft AGL** (o **700 ft AGL** cerca de algunos aeropuertos).',
  'e.mas': 'Llega hasta 17,999 ft MSL y vuelve arriba de FL600. En VFR no tienes que hablar con nadie. En la carta, el borde de 700 ft es una sombra magenta y el de 1,200 ft, una sombra azul.',
  'd.titulo': 'Clase D',
  'd.texto': 'Aeropuerto con torre: del suelo a **2,500 ft AGL**, unas **4 NM** a la redonda (típico). Antes de entrar, **contacto por radio**.',
  'd.mas': 'Si la torre te contesta con tu matrícula, ya hay contacto y puedes entrar. En la carta es una línea azul discontinua; el techo va en un recuadro, en cientos de pies MSL.',
  'c.titulo': 'Clase C',
  'c.texto': 'Núcleo de **5 NM** del suelo a **4,000 ft AGL** y repisa de **10 NM** desde **1,200 ft AGL**. Pide **radio** y **transpondedor**.',
  'c.mas': 'Medidas típicas. Debajo de la repisa vuelas sin hablar con nadie. El transpondedor (transponder) es Modo C (con altitud) y además hace falta ADS-B Out. En la carta, líneas magenta.',
  'c1p.titulo': 'Desde la cabina',
  'c1p.texto': 'Esa pared magenta es el borde de la Clase C. **Antes de cruzarla**, llama a Approach y espera oír tu matrícula.',
  'c1p.mas': '«N123AB, standby» ya es contacto (dijeron tu matrícula). «Aircraft calling, standby» no lo es. Si te dicen «remain outside», quédate afuera. En el cielo la pared no se ve: la conoces por la carta y el GPS.',
  'b.titulo': 'Clase B',
  'b.texto': 'Los aeropuertos más grandes: del suelo a **10,000 ft MSL**, en pisos. Para entrar necesitas **autorización**: «cleared into the Class Bravo».',
  'b.mas': 'Además: transpondedor Modo C, ADS-B Out y certificado de piloto privado (o alumno con el endoso del instructor). Debajo de cada piso vuelas sin autorización. Dentro de las 30 NM (el «Mode C veil») ya pide transpondedor.',
  'a.titulo': 'Clase A',
  'a.texto': 'De **18,000 ft MSL** a **FL600** todo es **IFR**: un vuelo VFR no entra. Ahí todos usan **29.92** en el altímetro.',
  'a.mas': 'Hacen falta la habilitación de vuelo por instrumentos (instrument rating), un plan IFR y la autorización de ATC. Arriba de FL600 vuelve a ser Clase E.',
  // En el lienzo.
  'l.A': 'Clase A · 18,000 MSL – FL600', 'l.B': 'Clase B · SFC – 10,000 MSL', 'l.C': 'Clase C · SFC – 4,000 AGL', 'l.D': 'Clase D · SFC – 2,500 AGL',
  'l.E': 'Clase E · desde 1,200 AGL', 'l.E7': 'E desde 700 AGL', 'l.Earriba': 'Clase E · hasta 17,999 MSL', 'l.G': 'Clase G',
  'l.piso': 'piso {v}', 'l.nm': '{v} NM', 'l.agl': '{v} ft AGL', 'l.sfc': 'SFC',
  // Lo que dice la etiqueta sobre el lienzo, en vivo.
  ahora: 'Clase {clase} · {ft} ft MSL', 'necesita.A': 'Solo IFR', 'necesita.B': 'Autorización + transpondedor', 'necesita.C': 'Radio + transpondedor',
  'necesita.D': 'Radio con la torre', 'necesita.E': 'VFR: nada especial', 'necesita.E10': 'Transpondedor + ADS-B (10,000 ft o más)', 'necesita.G': 'VFR: nada especial',
};

const ft = y => y * 1000;
const P = (x, aglKft, z) => [x, alturaTerreno(x, z) + aglKft, z];
const circulo = (cx, cz, r, y, n = 10, fase = 0, dy = 0) => Array.from({ length: n }, (_, i) => { const g = fase + (i / n) * Math.PI * 2; return [cx + Math.sin(g) * r, y + Math.sin(g * 1) * dy, cz + Math.cos(g) * r]; });

// Los pasos: qué muestra la cámara, por dónde vuela el avión y qué clase se resalta.
export const PASOS = [
  { id: 'vista', resaltar: null, camara: { mira: [14, 4.5, 4], giro: 28, alto: 11, dist: 100, fov: 46 },
    vuelo: { ruta: circulo(0, 0, 38, 4.5, 14), cerrada: true, seg: 70, kt: 120 } },
  { id: 'g', resaltar: 'G', camara: { seguir: 0.3, mira: [-15, 1.2, -40], giro: 55, alto: 13, dist: 30, fov: 48 },
    vuelo: { ruta: [P(-24, 0.75, -42), P(-16, 0.7, -32), P(-6, 0.75, -36), P(-10, 0.8, -46), P(-20, 0.7, -48)], cerrada: true, seg: 46, kt: 100 } },
  { id: 'e', resaltar: 'E', camara: { seguir: 0.3, mira: [-15, 1.5, -40], giro: 70, alto: 11, dist: 30, fov: 48 },
    vuelo: { ruta: [P(-26, 0.7, -42), P(-18, 1.0, -33), P(-8, 1.9, -35), P(-9, 2.2, -46), P(-19, 1.4, -49)], cerrada: true, seg: 46, kt: 100 } },
  { id: 'd', resaltar: 'D', camara: { mira: [34, 1.6, 28], giro: 215, alto: 13, dist: 22, fov: 46 },
    vuelo: { ruta: [P(46, 1.6, 34), P(37, 1.5, 29), P(31, 1.5, 25), P(24, 1.6, 22), P(22, 1.7, 33), P(36, 1.7, 40)], cerrada: true, seg: 46, kt: 105 } },
  { id: 'c', resaltar: 'C', camara: { mira: [48, 2.2, -14], giro: 300, alto: 14, dist: 34, fov: 46 },
    vuelo: { ruta: [[66, 2.6, -26], [57, 2.6, -20], [51, 2.4, -15], [44, 2.6, -10], [40, 2.8, -22], [52, 2.8, -34], [66, 2.7, -36]], cerrada: true, seg: 56, kt: 110 } },
  { id: 'c1p', resaltar: 'C', vista: '1p', camara: { mira: [48, 2, -14], giro: 315, alto: 18, dist: 36, fov: 46 },
    vuelo: { ruta: [[64.5, 2.5, -30.5], [60, 2.5, -26], [56.5, 2.5, -22.5]], cerrada: false, seg: 22, kt: 110 } },
  { id: 'b', resaltar: 'B', camara: { mira: [-4, 4.5, 2], giro: 40, alto: 10, dist: 70, fov: 46 },
    vuelo: { ruta: [[-31, 2.5, -12], [-18, 2.5, -7], [-13, 4.6, -2], [-12, 5, 10], [-22, 4, 22], [-34, 3, 8]], cerrada: true, seg: 60, kt: 120 } },
  { id: 'a', resaltar: 'A', camara: { seguir: 0.5, mira: [14, 17.5, 12], giro: 25, alto: 14, dist: 40, fov: 46 },
    vuelo: { ruta: circulo(14, 12, 9, 18, 10, 0, 1.8), cerrada: true, seg: 50, kt: 200 } },
];

const alfaDe = (clase, resaltar) => (resaltar == null ? 1 : clase === resaltar || (clase === 'E' && resaltar === 'G') ? 1.55 : 0.45);
// Qué rótulos se ven en cada paso (además del de la clase resaltada): así no se amontonan.
const ROTULOS = { vista: ['A', 'B', 'C', 'D', 'E', 'Earriba', 'G'], g: ['G', 'E'], e: ['E', 'G'], d: ['D', 'E7'], c: ['C'], c1p: ['C'], b: ['B'], a: ['A', 'Earriba'] };

// Lo que no cambia en toda la escena: el terreno y los aeropuertos.
export function construir(paleta) {
  const prims = [
    ...campo({ x0: -50, z0: -52, x1: 82, z1: 56, n: 19, altura: alturaTerreno, paleta, semilla: 5, agua: esMar, falda: 420 }),
  ];
  for (const [k, [x, z]] of Object.entries(LUGAR)) prims.push(...aeropuerto({ x, z, y: ELEV[k], rumbo: k === 'B' ? 80 : k === 'C' ? 140 : 20, largo: k === 'B' ? 2.2 : 1.4, ancho: k === 'B' ? 0.09 : 0.06, paleta, torre: false, detalle: false }));
  return { prims };
}

// Los volúmenes y las etiquetas de un paso (lo resaltado más fuerte).
export function armarPaso(paso, paleta, T) {
  const r = paso.resaltar, prims = [], etiquetas = [];
  const E = ESPACIO_AEREO, col = COLOR_CLASE;
  const borde = (c, k) => [...c, limitar(0.9 * k, 0.25, 1)];
  // B: núcleo y dos pisos.
  {
    const k = alfaDe('B', r), [x, z] = LUGAR.B, [p0, p1, p2] = E.B.pisos, top = E.B.techoMSL / 1000;
    prims.push(...cilindro([x, z], p0.radioNM, ELEV.B, top, col.B, { lados: 32, a: 0.2 * k, borde: borde(col.B, k) }));
    prims.push(...anillo([x, z], p0.radioNM, p1.radioNM, p1.pisoMSL / 1000, top, col.B, { lados: 32, a: 0.17 * k, borde: borde(col.B, k) }));
    prims.push(...anillo([x, z], p1.radioNM, p2.radioNM, p2.pisoMSL / 1000, top, col.B, { lados: 32, a: 0.15 * k, borde: borde(col.B, k) }));
    etiquetas.push({ p: [x, top + 0.4, z], clave: 'B', texto: T('l.B'), color: col.B, prioridad: r === 'B' ? 10 : 5, resaltada: r === 'B' });
    if (r === 'B') {
      // Los pisos, a la derecha de lo que mira la cámara (cada uno en su escalón).
      const g = (paso.camara.giro * Math.PI) / 180, dx = Math.cos(g), dz = -Math.sin(g);
      const en = (rr, y) => [x + dx * rr, y, z + dz * rr];
      etiquetas.push({ p: en(p0.radioNM * 0.6, ELEV.B + 0.1), texto: T('l.sfc'), prioridad: 7, negrita: false });
      etiquetas.push({ p: en((p0.radioNM + p1.radioNM) / 2, p1.pisoMSL / 1000), texto: T('l.piso', { v: miles(p1.pisoMSL) }), prioridad: 7, negrita: false });
      etiquetas.push({ p: en((p1.radioNM + p2.radioNM) / 2, p2.pisoMSL / 1000), texto: T('l.piso', { v: miles(p2.pisoMSL) }), prioridad: 7, negrita: false });
    }
  }
  // C: núcleo de 5 NM y repisa de 10 NM.
  {
    const k = alfaDe('C', r), [x, z] = LUGAR.C, e = ELEV.C, top = e + E.C.techoAGL / 1000;
    prims.push(...cilindro([x, z], E.C.nucleoNM, e, top, col.C, { lados: 30, a: 0.22 * k, borde: borde(col.C, k) }));
    prims.push(...anillo([x, z], E.C.nucleoNM, E.C.anilloNM, e + E.C.pisoAnilloAGL / 1000, top, col.C, { lados: 30, a: 0.19 * k, borde: borde(col.C, k) }));
    etiquetas.push({ p: [x, top + 0.4, z], clave: 'C', texto: T('l.C'), color: col.C, prioridad: r === 'C' ? 10 : 5, resaltada: r === 'C' });
    if (r === 'C' && paso.vista !== '1p') {
      const y = e + 0.05;
      prims.push(linea([[x, y, z], [x - E.C.anilloNM * 0.7071, y, z + E.C.anilloNM * 0.7071]], [255, 255, 255], { a: 0.9, w: 1.6, guion: [5, 4] }));
      etiquetas.push({ p: [x - E.C.nucleoNM * 0.7071, y, z + E.C.nucleoNM * 0.7071], texto: T('l.nm', { v: E.C.nucleoNM }), prioridad: 8, negrita: false });
      etiquetas.push({ p: [x - E.C.anilloNM * 0.7071, y, z + E.C.anilloNM * 0.7071], texto: T('l.nm', { v: E.C.anilloNM }), prioridad: 8, negrita: false });
      etiquetas.push({ p: [x + E.C.anilloNM * 0.7071, e + E.C.pisoAnilloAGL / 1000, z - E.C.anilloNM * 0.7071], texto: T('l.agl', { v: miles(E.C.pisoAnilloAGL) }), prioridad: 8, negrita: false });
    }
  }
  // D: el cilindro chico (borde discontinuo, como en la carta).
  {
    const k = alfaDe('D', r), [x, z] = LUGAR.D, e = ELEV.D, top = e + E.D.techoAGL / 1000;
    prims.push(...cilindro([x, z], E.D.radioNM, e, top, col.D, { lados: 28, a: 0.24 * k, borde: borde(col.D, k), guion: [6, 5] }));
    etiquetas.push({ p: [x, top + 0.35, z], clave: 'D', texto: T('l.D'), color: col.D, prioridad: r === 'D' ? 10 : 4, resaltada: r === 'D' });
    if (r === 'D') etiquetas.push({ p: [x + E.D.radioNM, e + 0.05, z], texto: T('l.nm', { v: E.D.radioNM }), prioridad: 8, negrita: false });
    // La Clase E desde 700 ft alrededor (la sombra magenta de la carta).
    const kE = alfaDe('E', r);
    prims.push(...tapaCircular([x, z], 0, E.E.radioCercaNM, e + E.E.pisoCercaAGL / 1000, col.E, { lados: 28, a: 0.1 * kE, luz: 0 }));
    prims.push(linea(Array.from({ length: 29 }, (_, i) => { const g = (i / 28) * Math.PI * 2; return [x + Math.sin(g) * E.E.radioCercaNM, e + E.E.pisoCercaAGL / 1000, z + Math.cos(g) * E.E.radioCercaNM]; }), col.E, { a: 0.6 * kE, w: 1.2, guion: [3, 4] }));
    etiquetas.push({ p: [x - E.E.radioCercaNM, e + E.E.pisoCercaAGL / 1000, z], clave: 'E7', texto: T('l.E7'), color: col.E, prioridad: 6, negrita: false });
  }
  // E desde 1,200 AGL (una lámina que sigue al terreno) y la A arriba.
  {
    const kE = alfaDe('E', r), n = 10, x0 = -48, x1 = 80, z0 = -50, z1 = 54;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const X = a => x0 + ((x1 - x0) * a) / n, Z = b => z0 + ((z1 - z0) * b) / n;
      const q = [[X(i), Z(j)], [X(i + 1), Z(j)], [X(i + 1), Z(j + 1)], [X(i), Z(j + 1)]].map(([a, b]) => [a, alturaTerreno(a, b) + E.E.pisoAGL / 1000, b]);
      prims.push(poligono(q, col.E, { a: r === 'G' || r === 'E' ? 0.04 : 0.055 * kE, doble: true, luz: 0 }));
    }
    // Con la G o la E resaltadas: una rebanada del cielo en capas (G abajo, E arriba), donde vuela el avión.
    if (r === 'G' || r === 'E') {
      const [cx, cz, m] = [-15, -40, 8], h0 = alturaTerreno(cx, cz), techoG = h0 + E.E.pisoAGL / 1000;
      prims.push(...cajaVolumen(cx - m, h0, cz - m, cx + m, techoG, cz + m, col.G, { a: r === 'G' ? 0.2 : 0.1, borde: [...col.G, r === 'G' ? 0.95 : 0.5] }));
      prims.push(...cajaVolumen(cx - m, techoG, cz - m, cx + m, h0 + 3.2, cz + m, col.E, { a: r === 'E' ? 0.18 : 0.08, borde: [...col.E, r === 'E' ? 0.95 : 0.5] }));
      etiquetas.push({ p: [cx + m, techoG, cz - m], texto: T('l.agl', { v: miles(E.E.pisoAGL) }), prioridad: 9, negrita: false });
    }
    etiquetas.push({ p: [-15, alturaTerreno(-15, -35) + 2.4, -35], clave: 'E', texto: T('l.E'), color: col.E, prioridad: r === 'E' ? 10 : 3, resaltada: r === 'E' });
    etiquetas.push({ p: [-11, alturaTerreno(-11, -44) + 0.5, -44], clave: 'G', texto: T('l.G'), color: col.G, prioridad: r === 'G' ? 10 : 2, resaltada: r === 'G' });
    etiquetas.push({ p: [-30, 14, 30], clave: 'Earriba', texto: T('l.Earriba'), color: col.E, prioridad: 2, negrita: false });
    const kA = alfaDe('A', r), yA = E.A.pisoMSL / 1000;
    prims.push(...lamina(-48, -50, 80, 54, yA, col.A, { n: 6, a: r === 'A' ? 0.16 : 0.05 }));
    prims.push(linea([[-48, yA, -50], [80, yA, -50], [80, yA, 54], [-48, yA, 54], [-48, yA, -50]], col.A, { a: r === 'A' ? 0.8 : 0.25, w: 1.2 }));
    etiquetas.push({ p: [16, yA + 0.5, 8], clave: 'A', texto: T('l.A'), color: col.A, prioridad: r === 'A' ? 10 : 4, resaltada: r === 'A' });
  }
  const ver = ROTULOS[paso.id] ?? Object.keys(ROTULOS.vista);
  return { prims, etiquetas: etiquetas.filter(e => !e.clave || ver.includes(e.clave)) };
}

// Lo que cambia en cada cuadro: la línea al suelo y lo que dice la etiqueta de arriba.
export function cuadro({ avion, T }) {
  const [x, y, z] = avion.pos;
  const clase = claseEn(x, ft(y), z);
  const suelo = alturaTerreno(x, z);
  const prims = [linea([[x, y, z], [x, suelo, z]], [255, 255, 255], { a: 0.55, w: 1, guion: [3, 3] })];
  // En la E a 10,000 ft MSL o más (y a más de 2,500 ft AGL) piden transpondedor y ADS-B Out (14 CFR 91.215 y 91.225).
  const necesita = clase === 'E' && ft(y) >= 10000 && ft(y - suelo) > 2500 ? 'necesita.E10' : `necesita.${clase}`;
  return { prims, clase, estado: `${T('ahora', { clase, ft: miles(Math.round(ft(y) / 50) * 50) })} — ${T(necesita)}`, ft: ft(y) };
}

export const ESCENA = { id: 'espacio-aereo', unidades: { ftH: 6076, ftV: 1000 }, TEXTOS, PASOS, construir, armarPaso, cuadro, texturaEscala: 0.9, escalaAvion: 0.011, sombra: alturaTerreno, exagerar: 2, niebla1: { inicio: 8, fin: 70 } };
