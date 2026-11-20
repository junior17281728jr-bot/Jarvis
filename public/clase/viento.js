// 0.14.62: el triángulo de viento (wind triangle), a escala, como lo dibuja el PHAK (cap. 16): desde el punto de salida E
// la flecha del viento (hacia donde sopla, el largo es su velocidad), desde su punta la línea de la velocidad del avión
// (TAS) hasta cortar la línea del curso en P; E→P es la velocidad sobre el suelo (GS). El rumbo (TH) es el de la línea TAS.
// parametros: { titulo?, curso, tas, viento: { direccion, velocidad } } (rumbos verdaderos, nudos).
// Lógica pura: trianguloViento(). La misma cuenta que la computadora de vuelo (E6B).
import { el, svg, f1 } from './comun.js';
import { traductor, marco, api, normal, tresCifras, dif180, vector, flechaFija, flechaNorte, num } from './aviacion-base.js';

export const TEXTOS_VIENTO = {
  etiqueta: 'Triángulo de viento: curso {curso}°, viento de {dir}° a {vel} kt, TAS {tas} kt. Rumbo {rumbo}°, corrección {wca}° a la {lado}, velocidad sobre el suelo {gs} kt.',
  tc: 'TC {v}°', th: 'TH {v}°', w: 'W {d}°/{v}', gs: 'GS {v}',
  curso: 'Curso verdadero (TC)', rumbo: 'Rumbo verdadero (TH)', correccion: 'Corrección de viento (WCA)', suelo: 'Velocidad sobre el suelo (GS)',
  vientoNombre: 'Viento', tasNombre: 'Velocidad verdadera (TAS)',
  izquierda: 'izquierda', derecha: 'derecha', sinCorreccion: '0° (viento de frente o de cola)',
  grados: '{v}°', nudos: '{v} kt', corr: '{v}° a la {lado} (rumbo = curso {signo} {v}°)', vientoValor: 'de {d}° a {v} kt',
  norte: 'N', nota: 'Dibujado a escala: cada lado mide lo que vale en nudos.',
};

// → { wca (con signo: + a la derecha), rumbo (1..360), gs, viento de frente (+) o de cola (−), cruzado (+ desde la derecha),
//     y los tres puntos E, W, P (vectores de brújula en nudos, para dibujar) }.
export function trianguloViento({ curso, tas, viento }) {
  const tc = normal(Number(curso)), v = Number(tas), wd = normal(Number(viento?.direccion)), ws = Number(viento?.velocidad);
  const a = ((wd - tc) * Math.PI) / 180;
  const s = (ws * Math.sin(a)) / v;
  if (!(Math.abs(s) < 1) || !(v > 0)) return null;
  const wcaRad = Math.asin(s);
  const wca = (wcaRad * 180) / Math.PI;
  const gs = v * Math.cos(wcaRad) - ws * Math.cos(a);
  if (!(gs > 0)) return null;
  const W = vector(wd + 180, ws);
  const P = vector(tc, gs);
  return { tc, tas: v, wd, ws, wca, rumbo: normal(tc + wca), gs, frente: ws * Math.cos(a), cruzado: ws * Math.sin(a), E: [0, 0], W, P };
}

const ANCHO = 360, ALTO_MAX = 340, ALTO_MIN = 190, MARGEN = 58;

export function montarTrianguloViento(c, p = {}, o = {}) {
  const T = traductor(o, 'viento', TEXTOS_VIENTO);
  const r = trianguloViento({ curso: num(p.curso) ?? 90, tas: num(p.tas) ?? 100, viento: p.viento ?? { direccion: 0, velocidad: 0 } });
  const raiz = marco(c, 'viento', p.titulo, null);
  if (!r) return api(raiz);
  const wcaR = Math.round(r.wca), lado = wcaR < 0 ? T('izquierda') : T('derecha');
  const valores = { curso: tresCifras(r.tc), dir: tresCifras(r.wd), vel: Math.round(r.ws), tas: Math.round(r.tas), rumbo: tresCifras(r.rumbo), wca: Math.abs(wcaR), lado, gs: Math.round(r.gs) };
  if (!p.titulo) raiz.setAttribute('aria-label', T('etiqueta', valores));
  // La escala: los tres puntos y un poco más de la línea del curso (pasa de P) caben en el lienzo.
  const extra = vector(r.tc, r.gs * 1.12);
  const xs = [0, r.W[0], r.P[0], extra[0]], ys = [0, r.W[1], r.P[1], extra[1]];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min((ANCHO - 2 * MARGEN) / (maxX - minX || 1), (ALTO_MAX - 2 * MARGEN) / (maxY - minY || 1));
  // El alto se ajusta a la forma del triángulo (uno muy plano no deja un hueco grande).
  const ALTO = Math.round(Math.max(ALTO_MIN, (maxY - minY) * k + 2 * MARGEN));
  const ox = ANCHO / 2 - ((minX + maxX) / 2) * k, oy = ALTO / 2 - ((minY + maxY) / 2) * k;
  const pt = ([x, y]) => [ox + x * k, oy + y * k];
  const E = pt(r.E), W = pt(r.W), P = pt(r.P), X = pt(extra);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-dib-lienzo clase-dib-lienzo-viento', role: 'img', 'aria-label': T('etiqueta', valores) }, raiz);
  // El norte verdadero desde E (la referencia de todos los ángulos).
  svg('line', { x1: f1(E[0]), y1: f1(E[1]), x2: f1(E[0]), y2: f1(Math.max(14, E[1] - 70)), class: 'clase-dib-viento-norte' }, lienzo);
  flechaNorte(lienzo, ANCHO - 24, 26, 0, T('norte'));
  // La línea del curso (más allá de P), el viento y la TAS.
  svg('line', { x1: f1(E[0]), y1: f1(E[1]), x2: f1(X[0]), y2: f1(X[1]), class: 'clase-dib-viento-curso-linea' }, lienzo);
  flechaFija(lienzo, E[0], E[1], P[0], P[1], 'clase-dib-viento-gs', 13);
  if (r.ws > 0) flechaFija(lienzo, E[0], E[1], W[0], W[1], 'clase-dib-viento-w', 12);
  flechaFija(lienzo, W[0], W[1], P[0], P[1], 'clase-dib-viento-tas', 13);
  // El ángulo de corrección en P (entre la línea del curso y la del rumbo).
  if (Math.abs(r.wca) >= 1) {
    const rad = 34, a1 = r.tc + 180, a2 = r.rumbo + 180;
    const [x1, y1] = vector(a1, rad), [x2, y2] = vector(a2, rad);
    const barrido = dif180(a2 - a1) > 0 ? 1 : 0;
    svg('path', { d: `M${f1(P[0] + x1)} ${f1(P[1] + y1)}A${rad} ${rad} 0 0 ${barrido} ${f1(P[0] + x2)} ${f1(P[1] + y2)}`, class: 'clase-dib-viento-arco' }, lienzo);
  }
  // Los rótulos cortos, del lado de afuera del triángulo.
  const cx = (E[0] + W[0] + P[0]) / 3, cy = (E[1] + W[1] + P[1]) / 3;
  // E y P: la letra va hacia afuera (lejos del centro del triángulo y de la línea del curso).
  for (const [x, y, n, gx, gy] of [[...E, 'E', ...vector(r.tc + 180, 1)], [...P, 'P', ...vector(r.tc, 1)]]) {
    svg('circle', { cx: f1(x), cy: f1(y), r: 4.5, class: 'clase-dib-viento-punto' }, lienzo);
    let dx = gx + (x - cx) / (Math.hypot(x - cx, y - cy) || 1), dy = gy + (y - cy) / (Math.hypot(x - cx, y - cy) || 1);
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    svg('text', { x: f1(x + dx * 16), y: f1(y + dy * 16 + 5), 'text-anchor': 'middle', class: 'clase-dib-texto clase-dib-negrita' }, lienzo, n);
  }
  const rotulo = (a, b, texto, clase) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const ancla = nx > 0.35 ? 'start' : nx < -0.35 ? 'end' : 'middle';
    const largo = texto.length * 8.6; // ancho aproximado a 15 px en negrita
    const minX = ancla === 'end' ? largo + 4 : ancla === 'middle' ? largo / 2 + 4 : 4;
    const maxX = ancla === 'start' ? ANCHO - largo - 4 : ancla === 'middle' ? ANCHO - largo / 2 - 4 : ANCHO - 4;
    const x = Math.min(maxX, Math.max(minX, mx + nx * 20)), y = Math.min(ALTO - 6, Math.max(16, my + ny * 20 + 5));
    svg('text', { x: f1(x), y: f1(y), 'text-anchor': ancla, class: `clase-dib-texto ${clase}` }, lienzo, texto);
  };
  rotulo(E, P, `${T('tc', { v: tresCifras(r.tc) })} · ${T('gs', { v: Math.round(r.gs) })}`, 'clase-dib-viento-t-gs');
  if (r.ws > 0) rotulo(E, W, T('w', { d: tresCifras(r.wd), v: Math.round(r.ws) }), 'clase-dib-viento-t-w');
  rotulo(W, P, `${T('th', { v: tresCifras(r.rumbo) })} · TAS ${Math.round(r.tas)}`, 'clase-dib-viento-t-tas');
  // Los resultados, en texto (se leen bien en cualquier pantalla).
  const dl = el('dl', { class: 'clase-dib-datos' }, raiz);
  const fila = (n, v, clase) => { const d = el('div', { class: `clase-dib-dato ${clase || ''}`.trim() }, dl); el('dt', {}, d, n); el('dd', {}, d, v); };
  fila(T('curso'), T('grados', { v: tresCifras(r.tc) }), 'clase-dib-dato-gs');
  fila(T('vientoNombre'), T('vientoValor', { d: tresCifras(r.wd), v: Math.round(r.ws) }), 'clase-dib-dato-w');
  fila(T('tasNombre'), T('nudos', { v: Math.round(r.tas) }), 'clase-dib-dato-tas');
  fila(T('correccion'), wcaR === 0 ? T('sinCorreccion') : T('corr', { v: Math.abs(wcaR), lado, signo: wcaR < 0 ? '−' : '+' }));
  fila(T('rumbo'), T('grados', { v: tresCifras(r.rumbo) }), 'clase-dib-dato-tas');
  fila(T('suelo'), T('nudos', { v: Math.round(r.gs) }), 'clase-dib-dato-gs');
  el('p', { class: 'clase-dib-nota' }, raiz, T('nota'));
  return api(raiz);
}
