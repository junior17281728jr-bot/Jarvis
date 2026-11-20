// 0.14.78: escena 3D «vor-3d»: los radiales como rayos que salen de la estación, el curso del OBS y el avión que va
// HACIA la estación (TO) y se ALEJA (FROM), con el CDI al lado. La aguja y la bandera salen de lecturaVor (vor.js):
// solo del OBS y del radial donde está el avión, nunca del rumbo (PHAK cap. 16). Unidades: NM; y en miles de pies.
import { linea, poligono, cilindro, ruido } from './motor3d.js';
import { campo, panel2d, fuente } from './e3d-base.js';
import { lecturaVor } from './vor.js';

export const VOR = Object.freeze({ radiales: 360, puntoGrados: 2, aFondoGrados: 10, cono: 0.7 }); // cada punto ≈ 2°, a fondo a los 10°
const CURSO = 360;
export const radialEn = (x, z) => { const g = Math.round(((Math.atan2(x, z) * 180) / Math.PI + 360) % 360); return g === 0 ? 360 : g; };

export const TEXTOS = {
  titulo: 'El VOR en 3D',
  recuerda: 'Radial = desde la estación. TO/FROM y la aguja dependen del OBS y de dónde estás, nunca del rumbo.',
  'radiales.titulo': 'Los radiales',
  'radiales.texto': 'El VOR emite **360 radiales**, como los rayos de una rueda. Cada radial es un rumbo magnético **desde** la estación.',
  'radiales.mas': 'El radial 090 sale de la estación hacia el este. Con el OBS (Omni Bearing Selector) eliges un curso y el CDI te dice dónde estás respecto de él.',
  'hacia.titulo': 'Hacia la estación: TO',
  'hacia.texto': 'Con el OBS en **360** y al sur de la estación, la bandera dice **TO**: ese curso te lleva **hacia** la estación.',
  'hacia.mas': 'Estás en el radial 180. Volando 360 con la aguja centrada, llegas a la estación.',
  'desvio.titulo': 'La aguja',
  'desvio.texto': 'Si la aguja se va a la **izquierda**, el curso está a tu izquierda: **vuela hacia la aguja** hasta centrarla.',
  'desvio.mas': 'Cada punto son unos 2°; a fondo, 10° o más. Con la bandera TO y el rumbo parecido al curso, la aguja te dice para dónde corregir.',
  'desde.titulo': 'Alejándote: FROM',
  'desde.texto': 'Al pasar sobre la estación la bandera cambia a **FROM**: el mismo curso ahora te **aleja** de la estación.',
  'desde.mas': 'Justo encima hay un cono sin señal útil (cone of confusion): la bandera titila o marca OFF por un momento.',
  'rumbo.titulo': 'El rumbo no importa',
  'rumbo.texto': 'El CDI no sabe adónde apunta la nariz: en el mismo lugar y con el mismo OBS, **la aguja no cambia**.',
  'rumbo.mas': 'Por eso conviene volar con un rumbo parecido al curso del OBS: así «hacia la aguja» es de verdad hacia el curso.',
  'l.estacion': 'VOR', 'l.radial': 'R-{v}', 'l.curso': 'Curso {v}', 'l.to': 'Zona TO', 'l.from': 'Zona FROM',
  'l.cdi': 'CDI', 'l.obs': 'OBS {v}', 'l.off': 'OFF',
  estado: 'Radial {r} · OBS {c} · {b}',
};

const P = (x, z, y = 3) => [x, y, z];
const circulo = (cx, cz, r, n = 10, y = 3) => Array.from({ length: n }, (_, i) => { const g = (i / n) * Math.PI * 2; return [cx + Math.sin(g) * r, y, cz + Math.cos(g) * r]; });
export const PASOS = [
  { id: 'radiales', camara: { mira: [0, 1, 0], giro: 20, alto: 42, dist: 44, fov: 46 }, vuelo: { ruta: circulo(0, 0, 13, 14), cerrada: true, seg: 50, kt: 110 }, tQuieto: 6 },
  { id: 'hacia', camara: { seguir: 0.4, mira: [0, 2, -8], giro: 15, alto: 24, dist: 24, fov: 46 }, vuelo: { ruta: [P(0, -18), P(0, -12), P(0, -6), P(0, -2.5)], cerrada: false, seg: 24, kt: 110 }, tQuieto: 8 },
  { id: 'desvio', camara: { seguir: 0.4, mira: [1, 2, -10], giro: 15, alto: 26, dist: 22, fov: 46 }, vuelo: { ruta: [P(2.8, -19), P(2.8, -14), P(1.4, -10), P(0.2, -7), P(0, -3)], cerrada: false, seg: 24, kt: 110 }, tQuieto: 4 },
  { id: 'desde', camara: { seguir: 0.4, mira: [0, 2, 2], giro: 70, alto: 24, dist: 24, fov: 46 }, vuelo: { ruta: [P(0, -7), P(0, -2), P(0, 3), P(0, 10)], cerrada: false, seg: 22, kt: 110 }, tQuieto: 15 },
  { id: 'rumbo', camara: { mira: [0, 3, -10], giro: 30, alto: 30, dist: 9, fov: 46 }, tQuieto: 3 },
];

const AZUL = [70, 140, 255], VERDE = [70, 220, 130], MAGENTA = [235, 80, 200], BLANCO = [255, 255, 255];
const sobre = (x, z) => 0.1 * ruido(x * 0.1, z * 0.1, 5);

export function construir(paleta) {
  const prims = campo({ x0: -30, z0: -30, x1: 30, z1: 30, n: 16, altura: sobre, paleta, semilla: 51, falda: 300 });
  // La estación (el hexágono del VOR) y la rosa en el suelo.
  prims.push(...cilindro([0, 0], 0.6, 0, 0.5, [235, 240, 248], { lados: 6, a: 1, tapa: true }).map(q => ({ ...q, a: 1, doble: false, luz: 1 })));
  prims.push(linea(Array.from({ length: 49 }, (_, i) => { const g = (i / 48) * Math.PI * 2; return [Math.sin(g) * 4, 0.06, Math.cos(g) * 4]; }), BLANCO, { a: 0.85, w: 1.6, capa: 'calco' }));
  return { prims };
}

export function armarPaso(paso, paleta, T) {
  const prims = [], etiquetas = [];
  // Los radiales cada 10° (cada 30°, más marcados).
  for (let g = 10; g <= 360; g += 10) {
    const a = (g * Math.PI) / 180, fuerte = g % 30 === 0, L = fuerte ? 22 : 16;
    prims.push(linea([[Math.sin(a) * 4, 0.05, Math.cos(a) * 4], [Math.sin(a) * L, 0.05, Math.cos(a) * L]], BLANCO, { a: fuerte ? 0.75 : 0.35, w: fuerte ? 1.6 : 1, capa: 'calco' }));
    if (fuerte && (paso.id === 'radiales' || g % 90 === 0)) etiquetas.push({ p: [Math.sin(a) * (L + 1), 0.1, Math.cos(a) * (L + 1)], texto: T('l.radial', { v: String(g).padStart(3, '0') }), prioridad: g % 90 === 0 ? 6 : 4, negrita: false });
  }
  // El curso del OBS (360): la línea que cruza la estación, y las zonas TO (al sur) y FROM (al norte).
  if (paso.id !== 'radiales') {
    prims.push(linea([[0, 0.08, -24], [0, 0.08, 24]], MAGENTA, { a: 1, w: 3.5, capa: 'calco' }));
    prims.push(poligono([[-24, 0.04, -24], [24, 0.04, -24], [24, 0.04, 0], [-24, 0.04, 0]], VERDE, { a: 0.12, luz: 0, doble: true, capa: 'calco' }));
    prims.push(poligono([[-24, 0.04, 0], [24, 0.04, 0], [24, 0.04, 24], [-24, 0.04, 24]], AZUL, { a: 0.12, luz: 0, doble: true, capa: 'calco' }));
    etiquetas.push({ p: [0, 0.1, 16], texto: T('l.curso', { v: CURSO }), color: MAGENTA, prioridad: 8 });
    etiquetas.push({ p: [-9, 0.1, -9], texto: T('l.to'), color: VERDE, prioridad: 7 });
    etiquetas.push({ p: [-9, 0.1, 9], texto: T('l.from'), color: AZUL, prioridad: 7 });
  }
  etiquetas.push({ p: [0, 0.6, 0], texto: T('l.estacion'), prioridad: 9, cabina: true });
  return { prims, etiquetas };
}

export function cuadro({ paso, avion, T, mezcla = 0 }) {
  const [x, y, z] = avion.pos;
  const radial = radialEn(x, z);
  const lec = lecturaVor(CURSO, radial);
  const bandera = Math.hypot(x, z) < VOR.cono ? 'OFF' : lec.bandera;
  const prims = [linea([[0, 0.6, 0], [x, y, z]], [255, 220, 120], { a: 0.8, w: 1.4, guion: [4, 4] })];
  const dibujar = (ctx, ancho, alto, e) => cdi(ctx, ancho, alto, e, lec, bandera, T, mezcla > 0.5);
  return { prims, estado: T('estado', { r: String(radial).padStart(3, '0'), c: CURSO, b: bandera }), clase: bandera === 'OFF' ? 'mal' : 'ok', dibujar, ft: y * 1000 };
}

// En «rumbo» el avión gira sobre el mismo punto del radial 180 (la aguja y la bandera no se mueven); en los demás, la ruta.
export function avion(paso, t) {
  if (paso.id !== 'rumbo') return null;
  return { pos: [0, 3, -10], rumbo: (t * 40) % 360, cabeceo: 0, alabeo: 0, kt: 90 };
}

// El CDI: la rosa con el curso arriba, los puntos, la aguja y la bandera.
function cdi(ctx, ancho, alto, e, lec, bandera, T, cabina = false) {
  // En la cabina va arriba del tablero (que ocupa el 26 % de abajo).
  const s = Math.min(132 * e, alto * (cabina ? 0.3 : 0.36)), x = ancho - s - (cabina ? ancho * 0.17 : 10 * e), y = (cabina ? alto - Math.max(alto * 0.26, 58 * e) - 8 * e : alto - 10 * e) - s, cx = x + s / 2, cy = y + s / 2 + 4 * e, r = s * 0.4;
  panel2d(ctx, x, y, s, s, e);
  ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4a5160'; ctx.lineWidth = 1.5 * e; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = fuente(10 * e); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(T('l.obs', { v: CURSO }), cx, y + 5 * e);
  // Los puntos: 5 a cada lado (2° cada uno).
  const paso = (r * 0.8) / 5;
  for (let k = -5; k <= 5; k++) { if (!k) continue; ctx.beginPath(); ctx.arc(cx + k * paso, cy, 1.8 * e, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 * e; ctx.beginPath(); ctx.arc(cx, cy, paso * 0.5, 0, Math.PI * 2); ctx.stroke();
  // La aguja (vertical), corrida según los puntos.
  const ax = cx + Math.max(-5, Math.min(5, lec.puntos)) * paso;
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3 * e; ctx.beginPath(); ctx.moveTo(ax, cy - r * 0.78); ctx.lineTo(ax, cy + r * 0.78); ctx.stroke();
  // La bandera.
  const colores = { TO: '#46d17f', FROM: '#5aa2ff', OFF: '#f04848' };
  const texto = bandera === 'OFF' ? T('l.off') : bandera;
  ctx.font = fuente(10.5 * e, 750); ctx.textBaseline = 'middle';
  const bw = ctx.measureText(texto).width + 10 * e, by = cy + r * 0.45;
  ctx.fillStyle = colores[bandera]; ctx.fillRect(cx + r * 0.2, by - 7 * e, bw, 14 * e);
  ctx.fillStyle = '#05070a'; ctx.textAlign = 'left'; ctx.fillText(texto, cx + r * 0.2 + 5 * e, by + 0.5);
  return { x, y, w: s, h: s };
}

export const ESCENA = { id: 'vor-3d', unidades: { ftH: 6076, ftV: 1000 }, TEXTOS, PASOS, construir, armarPaso, cuadro, avion, texturaEscala: 0.9, escalaAvion: 0.011, sombra: sobre, exagerar: 2, niebla1: { inicio: 10, fin: 60 }, ojo1: 0.002, cerca1: 0.001 };
