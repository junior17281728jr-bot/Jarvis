// 0.14.62: el VOR. El CDI (indicador de desvío) con el curso del OBS, la bandera TO/FROM y la aguja (cada punto ≈ 2°,
// 5 puntos = 10° a fondo), y un mapa pequeño (norte arriba) con la estación, el curso elegido y el avión en su radial.
// La aguja y la bandera dependen SOLO del curso del OBS y del radial donde está el avión, nunca del rumbo (PHAK cap. 16).
// parametros: { titulo?, curso (OBS), radial (desde la estación), rumbo? (del avión, solo para el mapa), mapa? (true) }.
import { el, svg, f1, limitar } from './comun.js';
import { traductor, marco, api, tresCifras, dif180, vector, normal, num } from './aviacion-base.js';

export const TEXTOS_VOR = {
  etiqueta: 'VOR: OBS en {curso}°, el avión en el radial {radial}. Bandera {bandera}; la aguja {aguja}.',
  cdi: 'Indicador del VOR (CDI)', mapa: 'Mapa: la estación, el curso {curso}° y el avión en el radial {radial}',
  obs: 'OBS {v}°', radial: 'R-{v}', off: 'OFF', norte: 'N',
  aguja_centro: 'está centrada: vas sobre el curso',
  aguja_izq: 'está {n} {n|punto|puntos} a la izquierda (unos {g}°): el curso queda a tu izquierda',
  aguja_der: 'está {n} {n|punto|puntos} a la derecha (unos {g}°): el curso queda a tu derecha',
  aguja_fondo_izq: 'está a fondo a la izquierda (10° o más): el curso queda a tu izquierda',
  aguja_fondo_der: 'está a fondo a la derecha (10° o más): el curso queda a tu derecha',
  bandera_to: 'TO: el curso {curso}° te lleva HACIA la estación',
  bandera_from: 'FROM: el curso {curso}° te aleja DE la estación',
  bandera_off: 'OFF: estás de lado (a 90° del curso); la bandera no sabe decir TO ni FROM',
  estas: 'Estás en el radial {radial} (la línea que sale de la estación hacia ti).',
  zonaTo: 'TO', zonaFrom: 'FROM',
  decimal: ',',
  nota: 'Cada punto ≈ 2°. El rumbo del avión no mueve la aguja ni la bandera.',
};

// → { bandera: 'TO'|'FROM'|'OFF', desvio (grados; + = aguja a la derecha), puntos (−5..5) }.
// d = radial − curso: |d| < 90 → FROM y la aguja = −d; |d| > 90 → TO y la aguja = d − 180 (en −180..180).
export const ZONA_OFF = 2; // ±2° alrededor de 90°: la zona de ambigüedad
export function lecturaVor(curso, radial) {
  const d = dif180(normal(Number(radial)) - normal(Number(curso)));
  const ad = Math.abs(d);
  const bandera = Math.abs(ad - 90) <= ZONA_OFF ? 'OFF' : ad < 90 ? 'FROM' : 'TO';
  const desvio = (ad < 90 ? -d : dif180(d - 180)) + 0; // + 0: sin «-0»
  const limitado = limitar(desvio, -10, 10);
  return { bandera, desvio, puntos: limitado / 2, aFondo: Math.abs(desvio) >= 10 };
}

const TAM = 260, C = TAM / 2;

function montarCdi(padre, curso, lec, T) {
  const s = svg('svg', { viewBox: `0 0 ${TAM} ${TAM}`, class: 'clase-dib-lienzo clase-dib-vor-cdi', role: 'img', 'aria-label': T('cdi') }, padre);
  svg('circle', { cx: C, cy: C, r: 126, class: 'clase-dib-vor-bisel' }, s);
  svg('circle', { cx: C, cy: C, r: 114, class: 'clase-dib-vor-cara' }, s);
  // La rosa: gira para que el curso elegido quede arriba, bajo el índice.
  const rosa = svg('g', { transform: `rotate(${f1(-curso)} ${C} ${C})` }, s);
  for (let g = 0; g < 360; g += 5) {
    const largo = g % 30 === 0 ? 12 : g % 10 === 0 ? 8 : 5;
    const [x1, y1] = vector(g, 110), [x2, y2] = vector(g, 110 - largo);
    svg('line', { x1: f1(C + x1), y1: f1(C + y1), x2: f1(C + x2), y2: f1(C + y2), class: 'clase-dib-vor-marca' }, rosa);
  }
  for (let g = 0; g < 360; g += 30) {
    const [x, y] = vector(g, 86);
    const t = g === 0 ? 'N' : g === 90 ? 'E' : g === 180 ? 'S' : g === 270 ? 'W' : String(g / 10);
    svg('text', { x: f1(C + x), y: f1(C + y + 6), 'text-anchor': 'middle', class: 'clase-dib-vor-numero', transform: `rotate(${g} ${f1(C + x)} ${f1(C + y)})` }, rosa, t);
  }
  // El índice del curso (arriba) y el recíproco (abajo).
  svg('path', { d: `M${C} 18L${C - 8} 4L${C + 8} 4Z`, class: 'clase-dib-vor-indice' }, s);
  svg('path', { d: `M${C} ${TAM - 18}L${C - 6} ${TAM - 6}L${C + 6} ${TAM - 6}Z`, class: 'clase-dib-vor-indice-2' }, s);
  // Los puntos: 5 a cada lado, a 13 unidades.
  const paso = 13;
  svg('circle', { cx: C, cy: C, r: 7, class: 'clase-dib-vor-centro' }, s);
  for (let i = 1; i <= 5; i++) for (const lado of [-1, 1]) svg('circle', { cx: C + lado * i * paso, cy: C, r: 3, class: 'clase-dib-vor-punto' }, s);
  // La bandera TO/FROM/OFF (a la derecha, arriba del centro).
  const b = svg('g', { class: `clase-dib-vor-bandera clase-dib-vor-bandera-${lec.bandera.toLowerCase()}` }, s);
  svg('rect', { x: C + 30, y: C - 58, width: 54, height: 30, rx: 4, class: 'clase-dib-vor-ventana' }, b);
  if (lec.bandera === 'TO') svg('path', { d: `M${C + 57} ${C - 55}L${C + 47} ${C - 43}L${C + 67} ${C - 43}Z`, class: 'clase-dib-vor-flecha' }, b);
  if (lec.bandera === 'FROM') svg('path', { d: `M${C + 57} ${C - 31}L${C + 47} ${C - 43}L${C + 67} ${C - 43}Z`, class: 'clase-dib-vor-flecha' }, b);
  svg('text', { x: C + 57, y: lec.bandera === 'TO' ? C - 31 : lec.bandera === 'FROM' ? C - 47 : C - 38, 'text-anchor': 'middle', class: 'clase-dib-vor-bandera-texto' }, b, lec.bandera === 'OFF' ? T('off') : lec.bandera);
  // La aguja.
  const x = C + lec.puntos * paso;
  svg('line', { x1: f1(x), y1: C - 84, x2: f1(x), y2: C + 84, class: 'clase-dib-vor-aguja' }, s);
  svg('text', { x: C, y: C + 62, 'text-anchor': 'middle', class: 'clase-dib-vor-obs' }, s, T('obs', { v: tresCifras(curso) }));
  return s;
}

function montarMapa(padre, curso, radial, rumboAvion, lec, T) {
  const s = svg('svg', { viewBox: `0 0 ${TAM} ${TAM}`, class: 'clase-dib-lienzo clase-dib-vor-mapa', role: 'img', 'aria-label': T('mapa', { curso: tresCifras(curso), radial: tresCifras(radial) }) }, padre);
  svg('rect', { x: 2, y: 2, width: TAM - 4, height: TAM - 4, rx: 14, class: 'clase-dib-vor-papel' }, s);
  // Las zonas TO y FROM: la raya perpendicular al curso por la estación las separa.
  const [px, py] = vector(curso + 90, 118);
  svg('line', { x1: f1(C - px), y1: f1(C - py), x2: f1(C + px), y2: f1(C + py), class: 'clase-dib-vor-limite' }, s);
  for (const [g, k] of [[curso, 'zonaFrom'], [curso + 180, 'zonaTo']]) {
    const [x, y] = vector(g + 35, 92);
    svg('text', { x: f1(C + x), y: f1(C + y + 5), 'text-anchor': 'middle', class: 'clase-dib-vor-zona' }, s, T(k));
  }
  // La rosa de la estación (cada 30°) y el norte.
  svg('circle', { cx: C, cy: C, r: 44, class: 'clase-dib-vor-rosa' }, s);
  for (let g = 0; g < 360; g += 30) {
    const [x1, y1] = vector(g, 44), [x2, y2] = vector(g, g === 0 ? 34 : 39);
    svg('line', { x1: f1(C + x1), y1: f1(C + y1), x2: f1(C + x2), y2: f1(C + y2), class: 'clase-dib-vor-rosa-marca' }, s);
  }
  svg('text', { x: C, y: C - 49, 'text-anchor': 'middle', class: 'clase-dib-vor-rosa-n' }, s, T('norte'));
  // El curso elegido: la línea por la estación, con la punta hacia el curso.
  const [cx1, cy1] = vector(curso, 120);
  svg('line', { x1: f1(C - cx1), y1: f1(C - cy1), x2: f1(C + cx1), y2: f1(C + cy1), class: 'clase-dib-vor-curso' }, s);
  const [ux, uy] = vector(curso, 1);
  const ax = C + ux * 112, ay = C + uy * 112;
  svg('path', { d: `M${f1(ax + ux * 8)} ${f1(ay + uy * 8)}L${f1(ax - uy * 7)} ${f1(ay + ux * 7)}L${f1(ax + uy * 7)} ${f1(ay - ux * 7)}Z`, class: 'clase-dib-vor-curso-punta' }, s);
  // El radial del avión (desde la estación) y el avión.
  const [rx, ry] = vector(radial, 86);
  svg('line', { x1: C, y1: C, x2: f1(C + rx), y2: f1(C + ry), class: 'clase-dib-vor-radial' }, s);
  const [lx, ly] = vector(radial, 66), [nx, ny] = vector(radial + 90, 26);
  svg('text', { x: f1(C + lx + nx), y: f1(C + ly + ny + 5), 'text-anchor': 'middle', class: 'clase-dib-vor-radial-texto' }, s, T('radial', { v: tresCifras(radial) }));
  const avion = svg('g', { class: 'clase-dib-vor-avion', transform: `translate(${f1(C + rx)} ${f1(C + ry)}) rotate(${f1(rumboAvion)})` }, s);
  svg('path', { d: 'M0 -13L2.5 -5L13 1L13 4L2.5 2L1.5 9L5 12L5 14L0 13L-5 14L-5 12L-1.5 9L-2.5 2L-13 4L-13 1L-2.5 -5Z', class: 'clase-dib-vor-avion-forma' }, avion);
  // La estación (el símbolo del VOR: hexágono con su punto).
  const hex = Array.from({ length: 6 }, (_, i) => vector(30 + i * 60, 10)).map(([x, y]) => `${f1(C + x)} ${f1(C + y)}`).join('L');
  svg('path', { d: `M${hex}Z`, class: 'clase-dib-vor-estacion' }, s);
  svg('circle', { cx: C, cy: C, r: 2, class: 'clase-dib-vor-estacion-punto' }, s);
  return s;
}

export function montarVor(c, p = {}, o = {}) {
  const T = traductor(o, 'vor', TEXTOS_VOR);
  const curso = normal(num(p.curso) ?? 360), radial = normal(num(p.radial) ?? 0);
  const rumboAvion = normal(num(p.rumbo) ?? curso);
  const lec = lecturaVor(curso, radial);
  const n = Math.round(Math.abs(lec.puntos) * 2) / 2, g = Math.round(Math.abs(lec.desvio));
  const aguja = lec.aFondo ? T(lec.desvio < 0 ? 'aguja_fondo_izq' : 'aguja_fondo_der')
    : n === 0 ? T('aguja_centro') : T(lec.desvio < 0 ? 'aguja_izq' : 'aguja_der', { n: String(n).replace('.', T('decimal')), g });
  const bandera = T(`bandera_${lec.bandera.toLowerCase()}`, { curso: tresCifras(curso) });
  const etiqueta = T('etiqueta', { curso: tresCifras(curso), radial: tresCifras(radial), bandera: lec.bandera, aguja });
  const raiz = marco(c, 'vor', p.titulo, etiqueta);
  const fila = el('div', { class: 'clase-dib-vor-fila' }, raiz);
  montarCdi(fila, curso, lec, T);
  if (p.mapa !== false) montarMapa(fila, curso, radial, rumboAvion, lec, T);
  const ul = el('ul', { class: 'clase-dib-lista' }, raiz);
  el('li', {}, ul, T('estas', { radial: tresCifras(radial) }));
  el('li', { class: 'clase-dib-negrita' }, ul, bandera);
  el('li', {}, ul, `${T('obs', { v: tresCifras(curso) })}: ${aguja}.`);
  el('p', { class: 'clase-dib-nota' }, raiz, T('nota'));
  return api(raiz);
}
