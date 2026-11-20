// 0.14.78: escena 3D «frentes»: un corte de oeste a este con un frente frío y un frente cálido (PHAK cap. 12): las masas
// de aire, las nubes que ve el piloto (cumulonimbos en el frío; capas, del cirro al nimbostrato, en el cálido), la lluvia,
// el cambio de viento (hemisferio norte) y la presión. Unidades: x y z, 1 = 5 NM; y, 1 = 1,000 ft (la altura va muy
// exagerada: las pendientes de verdad son mucho más suaves).
import { poligono, linea, ruido, bola, aleatorio, mezclarColor } from './motor3d.js';
import { campo, cumulo, flechaPlana, panel2d, fuente } from './e3d-base.js';

// Lo que dice el PHAK de cada frente (lo que la escena muestra y la prueba revisa).
export const FRENTES = Object.freeze({
  frio: Object.freeze({ nubes: 'cumulonimbus', presion: 'baja hasta el paso y después sube', vientoDespues: 'ONO', velocidadMph: [25, 30] }),
  calido: Object.freeze({ nubes: 'estratiformes', presion: 'baja hasta el paso y después se nivela', vientoAntes: 'SSE', vientoDespues: 'SSO', velocidadMph: [10, 25] }),
  hemisferio: 'norte',
});
// Dónde está cada cosa en el corte (x en unidades de 5 NM; el oeste a la izquierda).
export const CORTE = Object.freeze({ frioSuelo: 0, frioTope: [-9, 22], calidoSuelo: 30, calidoTope: [75, 15], oeste: -45, este: 75, fondo: 16 });
// La presión a lo largo del corte (un esquema sin números): baja hacia el frente frío, mínima al pasar, después sube.
export const PRESION = Object.freeze([[-45, 1015], [0, 1004], [6, 1006], [30, 1007], [75, 1016]]);
export function presionEn(x) {
  const P = PRESION;
  if (x <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (x <= P[i][0]) { const [a, pa] = P[i - 1], [b, pb] = P[i]; return pa + ((pb - pa) * (x - a)) / (b - a); }
  return P[P.length - 1][1];
}
export function zonaEn(x) {
  if (x > CORTE.calidoSuelo + 4) return 'adelante';
  if (x > CORTE.calidoSuelo - 4) return 'calido';
  if (x > CORTE.frioSuelo + 5) return 'sector';
  if (x > CORTE.frioSuelo - 5) return 'frio';
  return 'detras';
}

export const TEXTOS = {
  titulo: 'Los frentes en 3D',
  recuerda: 'Frente cálido: capas, lluvia continua y mala visibilidad. Frente frío: Cb, chubascos y turbulencia. Al pasar: cambia el viento y la presión.',
  'vista.titulo': 'Dos masas de aire',
  'vista.texto': 'Un frente separa dos masas de aire. El aire **frío** es más denso y va abajo; el **cálido** sube encima.',
  'vista.mas': 'Vas a cruzar los dos, de este a oeste. La altura está muy exagerada: en la realidad las pendientes son mucho más suaves.',
  'calido.titulo': 'Frente cálido',
  'calido.texto': 'Te acercas a un **frente cálido**: primero cirros altos, después **capas** cada vez más bajas, **lluvia continua** y mala visibilidad.',
  'calido.mas': 'En el frente cálido (warm front) el aire cálido sube despacio sobre el frío: cirros, cirrostratos, altostratos y nimbostratos. El mal tiempo dura y abarca mucho. En verano puede esconder tormentas.',
  'calidoPaso.titulo': 'Al pasar el cálido',
  'calidoPaso.texto': 'Antes del frente la **presión baja** sin parar; al pasarlo se nivela, el viento gira del **SE al SO** y sube la temperatura.',
  'calidoPaso.mas': 'Hemisferio norte: antes del frente cálido el viento viene del sur-sureste; después, del sur-suroeste. Todo frente trae un cambio de viento.',
  'frio.titulo': 'Frente frío',
  'frio.texto': 'El **frente frío** levanta el aire de golpe: **cumulonimbos** (Cb), chubascos fuertes, turbulencia, rayos y a veces granizo.',
  'frio.mas': 'El frente frío (cold front) avanza más rápido que el cálido y su mal tiempo viene en una franja angosta. A veces una línea de tormentas (squall line) va delante.',
  'frio1p.titulo': 'Desde la cabina',
  'frio1p.texto': 'Una pared de tormentas. **No la cruces ni vueles por debajo**: da la vuelta o espera en tierra a que pase.',
  'frio1p.mas': 'Una tormenta sube mucho más alto de lo que llega una avioneta, y por debajo hay ráfagas, cizalladura (wind shear) y granizo.',
  'frioPaso.titulo': 'Después del frío',
  'frioPaso.texto': 'La presión **baja hasta el paso** del frente frío y después **sube**. El viento gira al **oeste-noroeste**, refresca y se despeja.',
  'frioPaso.mas': 'Al pasar, la temperatura y el punto de rocío bajan rápido. Después suele haber buena visibilidad y cúmulos sueltos.',
  'l.frio': 'Aire frío', 'l.calido': 'Aire cálido', 'l.fresco': 'Aire frío', 'l.frenteFrio': 'Frente frío', 'l.frenteCalido': 'Frente cálido',
  'l.cb': 'Cumulonimbos (Cb)', 'l.ns': 'Nimbostratos', 'l.as': 'Altostratos', 'l.cs': 'Cirrostratos', 'l.ci': 'Cirros', 'l.lluvia': 'Lluvia',
  'l.vientoSE': 'Viento del SE', 'l.vientoSO': 'Viento del SO', 'l.vientoONO': 'Viento del ONO',
  'l.presion': 'Presión', 'l.oeste': 'Oeste', 'l.este': 'Este',
  'z.adelante': 'Delante del frente cálido · viento SE · presión bajando', 'z.calido': 'Frente cálido · lluvia continua, techo bajo',
  'z.sector': 'Sector cálido · viento SO · presión casi pareja', 'z.frio': 'Frente frío · Cb, chubascos y turbulencia',
  'z.detras': 'Detrás del frente frío · viento ONO · presión subiendo',
};

const AZUL = [70, 130, 235], ROJO = [235, 95, 60], CELESTE = [110, 170, 240];
const { fondo: F } = CORTE;
// Un prisma: un polígono del corte (x, y) estirado de −F a F en z.
function prisma(pts, c, a) {
  const out = [poligono(pts.map(([x, y]) => [x, y, F]), c, { a, doble: true, luz: 0 }), poligono(pts.map(([x, y]) => [x, y, -F]), c, { a: a * 0.6, doble: true, luz: 0 })];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if (ay === 0 && by === 0) continue;
    out.push(poligono([[ax, ay, -F], [bx, by, -F], [bx, by, F], [ax, ay, F]], c, { a: a * 0.5, doble: true, luz: 0.3 }));
  }
  return out;
}
const yCalido = x => ((x - CORTE.calidoSuelo) * CORTE.calidoTope[1]) / (CORTE.calidoTope[0] - CORTE.calidoSuelo);

// Un cumulonimbo: la base ancha y oscura, la torre de coliflor y el yunque que se abre hacia el este (el viento de arriba).
function cumulonimbo(x, z, semilla) {
  const azar = aleatorio(semilla), out = [];
  const bola1 = (p, r, gris, luz) => out.push(bola(p, r, mezclarColor([255, 255, 255], [70, 78, 96], gris), { a: 0.98, tex: 'nube', sombra: luz }));
  for (let i = 0; i < 9; i++) bola1([x + (azar() - 0.5) * 7, 3.6 + azar() * 0.8, z + (azar() - 0.5) * 6], 2.1 + azar() * 0.6, 0.55, 0.8);
  for (let y = 5; y <= 23; y += 1.6) {
    const f = 1 - (y - 5) / 30;
    for (let k = 0; k < 5; k++) bola1([x + (azar() - 0.5) * 6 * f, y + azar() * 0.8, z + (azar() - 0.5) * 5 * f], (1.9 + azar() * 0.7) * (0.75 + 0.25 * f), 0.25 * (1 - (y - 5) / 18), 0.85 + 0.15 * (y / 23));
  }
  for (let k = 0; k < 16; k++) { const d = azar() * 15 - 2; bola1([x + d, 24 + azar() * 1.6 - Math.max(0, d - 8) * 0.12, z + (azar() - 0.5) * (5 + d * 0.5)], 1.8 + azar() * 0.8, 0.05, 1); }
  return out;
}

// Las rutas: de este a oeste, con la vuelta antes de la línea de tormentas.
const IDA = [[74, 5.5, -3], [56, 4.2, -3], [45, 2.6, -3], [36, 1.4, -3], [26, 1.6, -3], [14, 2.8, -3], [9, 3, -1.5], [9, 3, 2.5], [16, 3, 4], [40, 3.4, 4], [62, 5.2, 4], [76, 5.5, 1]];
const VUELTA = [[26, 3, -3], [15, 3, -3], [9.5, 3, -1.8], [9.5, 3, 2.2], [15, 3, 3.5], [26, 3, 3.5], [30, 3, 0]];
const DETRAS = [[-8, 5, -3], [-28, 5, -3], [-38, 5, 0], [-28, 5, 3.5], [-8, 5, 3.5], [-4, 5, 0]];
export const PASOS = [
  { id: 'vista', camara: { mira: [14, 9, 0], giro: 0, alto: 8, dist: 92, fov: 44 }, vuelo: { ruta: IDA, cerrada: true, seg: 80, kt: 140, maxAlabeo: 30 }, tQuieto: 14 },
  { id: 'calido', camara: { mira: [46, 6, 0], giro: 352, alto: 7, dist: 44, fov: 46 }, vuelo: { ruta: IDA, cerrada: true, seg: 80, kt: 140, maxAlabeo: 30 }, tQuieto: 9 },
  { id: 'calidoPaso', panel: true, camara: { mira: [28, 3, -4], giro: 8, alto: 14, dist: 34, fov: 46 }, vuelo: { ruta: IDA, cerrada: true, seg: 80, kt: 140, maxAlabeo: 30 }, tQuieto: 17 },
  { id: 'frio', camara: { mira: [6, 12, 0], giro: 345, alto: 5, dist: 56, fov: 46 }, vuelo: { ruta: VUELTA, cerrada: true, seg: 40, kt: 140, maxAlabeo: 30 }, tQuieto: 6 },
  { id: 'frio1p', vista: '1p', inclinar: 6, camara: { mira: [6, 12, 0], giro: 345, alto: 5, dist: 56, fov: 46 }, vuelo: { ruta: VUELTA, cerrada: true, seg: 40, kt: 140, maxAlabeo: 30 }, tQuieto: 4 },
  { id: 'frioPaso', panel: true, camara: { mira: [-14, 6, -4], giro: 12, alto: 12, dist: 50, fov: 46 }, vuelo: { ruta: DETRAS, cerrada: true, seg: 40, kt: 140, maxAlabeo: 30 }, tQuieto: 5 },
];

export function construir(paleta) {
  const prims = campo({ x0: -50, z0: -24, x1: 80, z1: 24, n: 20, altura: (x, z) => 0.12 * ruido(x * 0.1, z * 0.1, 8), paleta, semilla: 31, falda: 400 });
  // Los símbolos de los frentes en el suelo (triángulos azules y semicírculos rojos, hacia donde avanzan: el este).
  for (let z = -F + 2; z < F; z += 4) {
    prims.push(poligono([[0, 0.06, z - 1], [0, 0.06, z + 1], [1.6, 0.06, z]], AZUL, { luz: 0, doble: true, capa: 'calco' }));
    prims.push(poligono(Array.from({ length: 9 }, (_, i) => { const g = (i / 8) * Math.PI; return [CORTE.calidoSuelo + Math.sin(g) * 1.1, 0.06, z + Math.cos(g) * 1.1]; }), ROJO, { luz: 0, doble: true, capa: 'calco' }));
  }
  prims.push(linea([[0, 0.06, -F], [0, 0.06, F]], AZUL, { w: 3, capa: 'calco' }));
  prims.push(linea([[CORTE.calidoSuelo, 0.06, -F], [CORTE.calidoSuelo, 0.06, F]], ROJO, { w: 3, capa: 'calco' }));
  // Las nubes del frente frío: tres cumulonimbos con su yunque hacia el este, y la lluvia fuerte.
  let semilla = 100;
  for (const [x, z] of [[1.5, -9], [3, 0.5], [1, 9.5]]) {
    prims.push(...cumulonimbo(x, z, semilla++));
    for (let k = 0; k < 7; k++) { const rx = x - 2.4 + k * 0.8, rz = z - 2 + ((k * 37) % 5); prims.push(linea([[rx, 2.4, rz], [rx - 0.5, 0, rz]], [120, 140, 175], { a: 0.55, w: 1.6 })); }
  }
  // Las del frente cálido: en capas que suben con la superficie frontal.
  const capa = (x0, x1, alturaDe, ancho, gris, paso = 4) => { for (let x = x0; x <= x1; x += paso) for (const z of [-9, 0, 9]) prims.push(...cumulo({ x, z: z + ((x * 7) % 3), base: alturaDe(x), ancho, alto: 0.8, semilla: semilla++, plana: true, gris }).prims); };
  capa(31, 44, () => 1.7, 7.5, 0.32); // nimbostratos (base baja, lluvia)
  capa(44, 56, x => yCalido(x) + 1.5, 7, 0.12); // altostratos
  capa(56, 66, x => yCalido(x) + 2.5, 7, 0.02, 5); // cirrostratos
  for (let x = 66; x <= 76; x += 3) for (const z of [-10, -3, 4, 11]) prims.push(linea([[x - 2, 17 + (x % 2), z], [x, 17.6, z + 0.5], [x + 2, 17.2 + (z % 2) * 0.3, z + 1.5]], [255, 255, 255], { a: 0.75, w: 2 }));
  for (let x = 31; x <= 43; x += 1.5) for (const z of [-8, 1, 10]) prims.push(linea([[x, 1.7, z], [x - 0.3, 0, z]], [130, 150, 185], { a: 0.4, w: 1.2 }));
  // Detrás del frente frío, cúmulos sueltos de buen tiempo.
  for (const [x, z] of [[-16, -6], [-24, 5], [-33, -2], [-40, 8]]) prims.push(...cumulo({ x, z, base: 4.5, ancho: 3.6, alto: 2.4, semilla: semilla++ }).prims);
  return { prims };
}

function masas(tenue) {
  const out = [], k = tenue ? 0.35 : 1;
  // Las masas de aire y las dos superficies frontales.
  const [fx, fy] = CORTE.frioTope, [cx, cy] = CORTE.calidoTope, techo = 26;
  out.push(...prisma([[CORTE.oeste, 0], [0, 0], [fx, fy], [fx - 1, techo * 0.85], [CORTE.oeste, techo * 0.85]], AZUL, 0.1 * k));
  out.push(...prisma([[CORTE.calidoSuelo, 0], [CORTE.este, 0], [cx, cy]], CELESTE, 0.1 * k));
  out.push(...prisma([[0, 0], [CORTE.calidoSuelo, 0], [cx, cy], [cx, techo * 0.85], [fx - 1, techo * 0.85], [fx, fy]], ROJO, 0.06 * k));
  out.push(poligono([[0, 0, -F], [0, 0, F], [fx, fy, F], [fx, fy, -F]], AZUL, { a: 0.28 * k, doble: true, luz: 0.4, borde: tenue ? null : [...AZUL, 0.9] }));
  out.push(poligono([[CORTE.calidoSuelo, 0, -F], [CORTE.calidoSuelo, 0, F], [cx, cy, F], [cx, cy, -F]], ROJO, { a: 0.22 * k, doble: true, luz: 0.4, borde: tenue ? null : [...ROJO, 0.9] }));
  return out;
}

export function armarPaso(paso, paleta, T) {
  const prims = masas(paso.vista === '1p'), etiquetas = [];
  const id = paso.id;
  const todo = id === 'vista';
  const enCalido = id === 'calido' || id === 'calidoPaso', enFrio = id === 'frio' || id === 'frio1p' || id === 'frioPaso';
  if (todo || enFrio) etiquetas.push({ p: [-26, 12, 0], texto: T('l.frio'), color: AZUL, prioridad: 6 });
  if (todo || id === 'calidoPaso' || id === 'frio') etiquetas.push({ p: [16, 12, 0], texto: T('l.calido'), color: ROJO, prioridad: 6 });
  if (todo || enCalido) etiquetas.push({ p: [62, 2.5, 0], texto: T('l.fresco'), color: CELESTE, prioridad: 6 });
  etiquetas.push({ p: [0, 0.2, -F + 1], texto: T('l.frenteFrio'), color: AZUL, prioridad: enFrio ? 10 : 7, resaltada: enFrio });
  etiquetas.push({ p: [CORTE.calidoSuelo, 0.2, -F + 1], texto: T('l.frenteCalido'), color: ROJO, prioridad: enCalido ? 10 : 7, resaltada: enCalido });
  if (todo || enFrio) etiquetas.push({ p: [2, 18, 0], texto: T('l.cb'), prioridad: 8, cabina: true });
  if (todo || enCalido) {
    etiquetas.push({ p: [70, 18, 0], texto: T('l.ci'), prioridad: 5 }); etiquetas.push({ p: [61, yCalido(61) + 3.5, 0], texto: T('l.cs'), prioridad: 5 });
    etiquetas.push({ p: [50, yCalido(50) + 2.6, 0], texto: T('l.as'), prioridad: 5 }); etiquetas.push({ p: [38, 3.2, 0], texto: T('l.ns'), prioridad: 5 });
    if (!todo) etiquetas.push({ p: [36, 0.6, 6], texto: T('l.lluvia'), prioridad: 4, negrita: false });
  }
  // El viento en cada zona (hemisferio norte): flechas en el suelo, del lado de la cámara.
  const z0 = -11, viento = (x, ang, clave, k = 1) => {
    const a = (ang * Math.PI) / 180, d = [Math.sin(a) * 6 * k, Math.cos(a) * 6 * k];
    prims.push(...flechaPlana([x - d[0] / 2, 0.08, z0 - d[1] / 2], [x + d[0] / 2, 0.08, z0 + d[1] / 2], 1.1, [255, 255, 255], { capa: 'calco', a: 0.95 }));
    etiquetas.push({ p: [x, 0.1, z0 - 4], texto: T(clave), prioridad: 7, negrita: false });
  };
  if (id === 'calidoPaso' || todo) { viento(52, 315, 'l.vientoSE'); viento(16, 22, 'l.vientoSO'); }
  if (id === 'frioPaso' || todo) { viento(-20, 112, 'l.vientoONO'); if (!todo) viento(16, 22, 'l.vientoSO'); }
  return { prims, etiquetas };
}

export function cuadro({ paso, avion, T, paleta }) {
  const x = avion.pos[0];
  const zona = zonaEn(x);
  const dibujar = paso.panel ? (ctx, ancho, alto, e) => panelPresion(ctx, ancho, alto, e, x, T, paleta) : null;
  return { prims: [], estado: T(`z.${zona}`), clase: zona === 'frio' ? 'mal' : '', dibujar, ft: avion.pos[1] * 1000 };
}

// El barógrafo: la presión a lo largo del corte, con un punto donde va el avión (el oeste a la izquierda, como el corte).
function panelPresion(ctx, ancho, alto, e, xAvion, T) {
  const w = Math.min(ancho * 0.42, 230 * e), h = 78 * e, x = 10 * e, y = alto - h - 10 * e;
  panel2d(ctx, x, y, w, h, e);
  ctx.fillStyle = '#ffffff'; ctx.font = fuente(11.5 * e); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(T('l.presion'), x + 9 * e, y + 7 * e);
  const gx = x + 10 * e, gw = w - 20 * e, gy = y + 26 * e, gh = h - 40 * e;
  const P = PRESION, pmin = 1002, pmax = 1017;
  const X = v => gx + ((v - CORTE.oeste) / (CORTE.este - CORTE.oeste)) * gw, Y = p => gy + gh - ((p - pmin) / (pmax - pmin)) * gh;
  // Las líneas de los frentes.
  for (const [fx, c] of [[0, 'rgba(70,130,235,0.9)'], [CORTE.calidoSuelo, 'rgba(235,95,60,0.9)']]) { ctx.strokeStyle = c; ctx.lineWidth = 1.5 * e; ctx.beginPath(); ctx.moveTo(X(fx), gy - 2 * e); ctx.lineTo(X(fx), gy + gh + 2 * e); ctx.stroke(); }
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.2 * e; ctx.beginPath();
  for (let v = CORTE.oeste; v <= CORTE.este; v += 2) { const px = X(v), py = Y(presionEn(v)); if (v === CORTE.oeste) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(xAvion), Y(presionEn(xAvion)), 4 * e, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = fuente(9.5 * e, 500); ctx.textBaseline = 'bottom';
  ctx.fillText(T('l.oeste'), gx, y + h - 2 * e); ctx.textAlign = 'right'; ctx.fillText(T('l.este'), gx + gw, y + h - 2 * e);
  return { x, y, w, h };
}

export const ESCENA = { id: 'frentes', unidades: { ftH: 30380, ftV: 1000 }, TEXTOS, PASOS, construir, armarPaso, cuadro, texturaEscala: 0.25, escalaAvion: 0.0045, sombra: () => 0, niebla1: { inicio: 14, fin: 120 }, niebla3: [1.1, 3.6], ojo1: 0.0004, cerca1: 0.0002, fov1: 68 };
