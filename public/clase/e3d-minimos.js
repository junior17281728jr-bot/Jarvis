// 0.14.78: escena 3D «minimos-vfr»: la «burbuja» que las nubes no pueden tocar y la visibilidad como niebla
// (14 CFR 91.155; AIM 3-1-4, TBL 3-1-1). Unidades: 1 = 1,000 ft (en horizontal y en vertical); 1 SM = 5,280 ft.
import { cilindro, linea, ruido } from './motor3d.js';
import { campo, cumulo, miles } from './e3d-base.js';

export const SM = 5.28; // una milla terrestre (statute mile) en unidades de 1,000 ft
// Los mínimos VFR (la tabla de la norma). bajoLaNube: cuánto por DEBAJO de la nube tiene que ir el avión (el espacio
// libre arriba del avión); sobreLaNube: cuánto por ENCIMA (el espacio libre abajo); lateral: a los lados. En pies.
export const MINIMOS_VFR = Object.freeze({
  B: Object.freeze({ visSM: 3, libreDeNubes: true }),
  C: Object.freeze({ visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }),
  D: Object.freeze({ visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }),
  E_bajo: Object.freeze({ visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }), // menos de 10,000 ft MSL
  E_alto: Object.freeze({ visSM: 5, bajoLaNube: 1000, sobreLaNube: 1000, lateral: 5280 }), // 10,000 ft MSL o más (1 SM al lado)
  G_bajo_dia: Object.freeze({ visSM: 1, libreDeNubes: true }), // 1,200 ft AGL o menos, de día
  G_bajo_noche: Object.freeze({ visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }),
  G_medio_dia: Object.freeze({ visSM: 1, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }), // más de 1,200 AGL y menos de 10,000 MSL
  G_medio_noche: Object.freeze({ visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }),
  G_alto: Object.freeze({ visSM: 5, bajoLaNube: 1000, sobreLaNube: 1000, lateral: 5280 }), // más de 1,200 AGL y 10,000 MSL o más
});

export const TEXTOS = {
  titulo: 'Los mínimos VFR en 3D',
  recuerda: 'Bajo 10,000 ft: 3 SM y la burbuja 500/1,000/2,000. Arriba: 5 SM y 1,000/1,000/1 SM. Clase B: 3 SM y libre de nubes.',
  'burbuja.titulo': 'La burbuja',
  'burbuja.texto': 'En C, D y E bajo 10,000 ft, ninguna nube entra en la burbuja: **500 ft** sobre ti, **1,000 ft** debajo, **2,000 ft** al lado.',
  'burbuja.mas': 'En inglés: «500 below, 1,000 above, 2,000 horizontal» (tú vas 500 ft por debajo de la nube, 1,000 ft por encima o 2,000 ft al lado). Es la regla 14 CFR 91.155.',
  'vis.titulo': 'La visibilidad',
  'vis.texto': 'La visibilidad es hasta dónde ves. En C, D y E bajo 10,000 ft MSL necesitas **3 SM** (millas terrestres).',
  'vis.mas': 'Una milla terrestre (statute mile, SM) mide 5,280 ft. Aquí la niebla se cierra a 3 SM: lo que está más lejos no se ve.',
  'alto.titulo': 'Arriba de 10,000 ft',
  'alto.texto': 'A **10,000 ft MSL** o más: **1,000 ft** arriba y abajo, **1 SM** al lado y **5 SM** de visibilidad.',
  'alto.mas': 'Arriba se vuela más rápido y hay aviones grandes: por eso los márgenes crecen. Vale en la Clase E y en la G a más de 1,200 ft AGL.',
  'b.titulo': 'Clase B',
  'b.texto': 'En la **Clase B** alcanza con ir **libre de nubes** (clear of clouds) y **3 SM** de visibilidad.',
  'b.mas': 'Ahí ATC separa a todos los aviones, por eso no hace falta la burbuja. Igual necesitas la autorización para entrar.',
  'g.titulo': 'Clase G, bien bajo',
  'g.texto': 'En la **Clase G**, a **1,200 ft AGL** o menos y **de día**: **1 SM** de visibilidad y **libre de nubes**.',
  'g.mas': 'De noche pide 3 SM y la burbuja 500/1,000/2,000. Más arriba de 1,200 ft AGL (y bajo 10,000 ft MSL), de día: 1 SM con la burbuja.',
  'l.libre': 'Libre de nubes', 'l.arriba': '{v} ft', 'l.abajo': '{v} ft', 'l.lado': '{v} ft', 'l.ladoSM': '1 SM', 'l.sm': '{v} SM',
  'estado.burbuja': 'Clase {clase} · {ft} ft MSL — {vis} SM · {a}/{b}/{c}',
  'estado.libre': 'Clase {clase} · {ft} ft — {vis} SM · libre de nubes',
  'clase.E': 'E', 'clase.B': 'B', 'clase.G': 'G',
};

const sobreSuelo = (x, z) => 0.08 * ruido(x * 0.08, z * 0.08, 4);
// Las nubes de cada paso, puestas justo en el borde de la regla (las pruebas revisan que el avión las cumpla).
function nubes(id) {
  if (id === 'vis') return [
    { x: -6, z: 6, base: 4.2, ancho: 3.6, alto: 2.6, semilla: 61 }, { x: 4, z: -10, base: 4.5, ancho: 4, alto: 3, semilla: 67 },
    { x: 14, z: 2, base: 4.0, ancho: 4.4, alto: 3.2, semilla: 71 }, { x: 26, z: -6, base: 4.4, ancho: 4, alto: 2.8, semilla: 73 },
  ];
  if (id === 'burbuja') return [
    { x: 0, z: 0, base: 5.0, ancho: 3.4, alto: 2.6, semilla: 3 }, // arriba: la base 500 ft sobre el avión
    { x: 7, z: 2.0 + 2.6, base: 3.6, ancho: 3.2, alto: 2.8, semilla: 7 }, // al lado: a 2,000 ft
    { x: 12, z: 0, techo: 3.5, ancho: 4.2, alto: 0.6, semilla: 11, plana: true }, // abajo: su tope 1,000 ft debajo
    { x: -9, z: -6, base: 5.6, ancho: 4, alto: 3, semilla: 13 }, { x: 22, z: 8, base: 5.2, ancho: 4.4, alto: 3.4, semilla: 17 },
    { x: 26, z: -7, base: 5.4, ancho: 3.6, alto: 2.4, semilla: 19 },
  ];
  if (id === 'alto') return [
    { x: 0, z: 0, base: 11.5, ancho: 4.4, alto: 3, semilla: 23 },
    { x: 9, z: SM + 3.2, base: 9.6, ancho: 4.2, alto: 3.2, semilla: 29 },
    { x: 15, z: 0, techo: 9.5, ancho: 5, alto: 0.7, semilla: 31, plana: true },
  ];
  if (id === 'b') return [
    { x: 2, z: 2.0, base: 4.0, ancho: 3.2, alto: 2.6, semilla: 37 }, // pegada al lado, sin tocarla
    { x: 8, z: -1.6, base: 4.9, ancho: 3.0, alto: 2.2, semilla: 41 }, // justo encima
  ];
  if (id === 'g') return [
    { x: -2, z: 0, base: 1.5, ancho: 4.5, alto: 0.5, semilla: 43, plana: true },
    { x: 4, z: 1.6, base: 1.45, ancho: 4, alto: 0.6, semilla: 47, plana: true },
    { x: 10, z: -0.4, base: 1.55, ancho: 4.6, alto: 0.5, semilla: 53, plana: true },
  ];
  return [];
}
export function nubesDe(id) {
  return nubes(id).map(n => {
    const c = cumulo({ ...n, base: n.base ?? n.techo - n.alto, gris: n.plana ? 0.3 : 0.04 });
    // La plana se pone para que su tope quede donde se pidió.
    if (n.techo != null) { const d = n.techo - c.caja.techo; c.prims.forEach(q => { q.p = [q.p[0], q.p[1] + d, q.p[2]]; }); c.caja.base += d; c.caja.techo += d; }
    return c;
  });
}

const recta = (x0, x1, y, z = 0) => [[x0, y, z], [(x0 * 2 + x1) / 3, y, z], [(x0 + x1 * 2) / 3, y, z], [x1, y, z]];
export const PASOS = [
  { id: 'burbuja', regla: 'E_bajo', clase: 'E', camara: { seguir: 1, mira: [0, 4.5, 0], giro: 30, alto: 12, dist: 11, fov: 50 },
    vuelo: { ruta: recta(-12, 18, 4.5), cerrada: false, seg: 26, kt: 110 }, tQuieto: 11 },
  { id: 'vis', regla: 'E_bajo', clase: 'E', vista: '1p', inclinar: -9, camara: { seguir: 1, mira: [0, 2.5, 0], giro: 300, alto: 8, dist: 10, fov: 50 },
    vuelo: { ruta: recta(-30, 10, 2.5, -3), cerrada: false, seg: 30, kt: 110 }, tQuieto: 4 },
  { id: 'alto', regla: 'E_alto', clase: 'E', camara: { seguir: 1, mira: [0, 10.5, 0], giro: 30, alto: 16, dist: 22, fov: 50 },
    vuelo: { ruta: recta(-14, 24, 10.5), cerrada: false, seg: 28, kt: 130 }, tQuieto: 10 },
  { id: 'b', regla: 'B', clase: 'B', camara: { seguir: 1, mira: [0, 3.6, 0], giro: 35, alto: 10, dist: 9, fov: 50 },
    vuelo: { ruta: recta(-10, 16, 3.6, -0.1), cerrada: false, seg: 24, kt: 110 }, tQuieto: 9 },
  { id: 'g', regla: 'G_bajo_dia', clase: 'G', camara: { seguir: 1, mira: [0, 1.1, 0], giro: 60, alto: 2, dist: 3.4, fov: 56 },
    vuelo: { ruta: recta(-8, 14, 0.9, 0.2), cerrada: false, seg: 26, kt: 95 }, tQuieto: 8 },
];

export function construir(paleta) {
  return { prims: campo({ x0: -40, z0: -30, x1: 50, z1: 30, n: 18, altura: sobreSuelo, paleta, semilla: 9, falda: 300, agua: (x, z) => Math.hypot(x - 18, z + 14) < 6 }) };
}
export function armarPaso(paso) {
  const prims = [];
  for (const n of nubesDe(paso.id)) prims.push(...n.prims);
  return { prims, etiquetas: [] };
}

const AZUL = [120, 200, 255];
export function cuadro({ paso, avion, T }) {
  const R = MINIMOS_VFR[paso.regla], [x, y, z] = avion.pos;
  const prims = [], etiquetas = [];
  if (!R.libreDeNubes) {
    const arriba = R.bajoLaNube / 1000, abajo = R.sobreLaNube / 1000, lado = R.lateral / 1000;
    prims.push(...cilindro([x, z], lado, y - abajo, y + arriba, AZUL, { lados: 32, a: 0.13, tapa: true, base: true, borde: [...AZUL, 0.95] }));
    // Las medidas: arriba, abajo y al lado.
    const blanco = [255, 255, 255];
    prims.push(linea([[x, y, z], [x, y + arriba, z]], blanco, { a: 0.9, w: 1.6, guion: [4, 3] }));
    prims.push(linea([[x, y, z], [x, y - abajo, z]], blanco, { a: 0.9, w: 1.6, guion: [4, 3] }));
    prims.push(linea([[x, y, z], [x, y, z + lado]], blanco, { a: 0.9, w: 1.6, guion: [4, 3] }));
    etiquetas.push({ p: [x, y + arriba, z], texto: T('l.arriba', { v: miles(R.bajoLaNube) }), prioridad: 9 });
    etiquetas.push({ p: [x, y - abajo, z], texto: T('l.abajo', { v: miles(R.sobreLaNube) }), prioridad: 9 });
    etiquetas.push({ p: [x, y, z + lado], texto: R.lateral === 5280 ? T('l.ladoSM') : T('l.lado', { v: miles(R.lateral) }), prioridad: 9 });
  }
  // «Libre de nubes»: una línea hasta el borde de la nube más cercana (sin tocarla).
  if (R.libreDeNubes) {
    let mejor = null;
    for (const { caja: c } of nubesDe(paso.id)) {
      const dh = Math.max(0, Math.hypot(x - c.x, z - c.z) - c.radio), dv = Math.max(0, c.base - y, y - c.techo);
      const q = dv > 0 && dh === 0 ? [x, y < c.base ? c.base : c.techo, z] : (() => { const L = Math.hypot(x - c.x, z - c.z) || 1; return [c.x + ((x - c.x) / L) * c.radio, y, c.z + ((z - c.z) / L) * c.radio]; })();
      const d = Math.hypot(q[0] - x, q[1] - y, q[2] - z);
      if (!mejor || d < mejor.d) mejor = { d, q };
    }
    if (mejor) {
      prims.push(linea([[x, y, z], mejor.q], [255, 255, 255], { a: 0.95, w: 2, guion: [4, 3] }));
      etiquetas.push({ p: mejor.q, texto: T('l.libre'), prioridad: 9, color: [80, 210, 120], cabina: true });
    }
  }
  // La visibilidad en primera persona: postes a 1, 2 y 3 SM delante del avión.
  if (paso.id === 'vis') {
    const h = (avion.rumbo * Math.PI) / 180, f = [Math.sin(h), Math.cos(h)];
    for (let k = 1; k <= R.visSM; k++) {
      // Un poste a la derecha de la trayectoria y una raya en el suelo, a k millas.
      const px = x + f[0] * k * SM, pz = z + f[1] * k * SM, dx = f[1] * 1.2, dz = -f[0] * 1.2;
      prims.push(linea([[px - dx, 0.02, pz - dz], [px + dx, 0.02, pz + dz]], [255, 150, 40], { a: 1, w: 3 }));
      prims.push(linea([[px + dx, 0, pz + dz], [px + dx, 0.9, pz + dz]], [255, 150, 40], { a: 1, w: 3 }));
      etiquetas.push({ p: [px + dx, 0.9, pz + dz], texto: T('l.sm', { v: k }), prioridad: 9 - k, cabina: true, color: [255, 150, 40], niebla: true });
    }
  }
  const vis = R.visSM;
  const ft = Math.round((y * 1000) / 50) * 50;
  const estado = R.libreDeNubes
    ? T('estado.libre', { clase: T(`clase.${paso.clase}`), ft: miles(ft), vis })
    : T('estado.burbuja', { clase: T(`clase.${paso.clase}`), ft: miles(ft), vis, a: miles(R.bajoLaNube), b: miles(R.sobreLaNube), c: R.lateral === 5280 ? '1 SM' : miles(R.lateral) });
  // La niebla es la visibilidad: se cierra a la distancia de la regla.
  const fin = vis * SM * 1.05;
  return { prims, etiquetas, estado, clase: paso.clase, niebla: { inicio: fin * 0.25, fin }, ft: y * 1000 };
}

export const ESCENA = { id: 'minimos-vfr', unidades: { ftH: 1000, ftV: 1000 }, TEXTOS, PASOS, construir, armarPaso, cuadro, texturaEscala: 0.35, escalaAvion: 0.009, sombra: sobreSuelo, niebla1: { inicio: 4, fin: 16 }, ojo1: 0.004, cerca1: 0.002 };
