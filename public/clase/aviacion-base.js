// 0.14.62: piezas comunes de los dibujos de aviación (circuito, marcas de pista, letreros, VOR, triángulo de viento y
// símbolos de la carta): el marco, los textos (i18n), los números y los rumbos. Nada toca document al importar.
import { el, svg, f1 } from './comun.js';

// Textos: opciones.t es el t() de la app (public/app.js lo pasa); sin él (pruebas, galería sin catálogo) el texto en
// español del módulo. Las claves son «clase.dib.<dibujo>.<clave>» en public/i18n/es.json y en.json.
export function traductor(opciones, dibujo, base) {
  const t = typeof opciones?.t === 'function' ? opciones.t : null;
  return (clave, variables = {}) => {
    const completa = `clase.dib.${dibujo}.${clave}`;
    let r = null;
    if (t) { try { r = t(completa, variables); } catch { r = null; } }
    if (typeof r === 'string' && r && r !== completa) return r;
    return String(base[clave] ?? clave)
      .replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, n, uno, varios) => (Number(String(variables[n]).replace(',', '.')) === 1 ? uno : varios))
      .replace(/\{(\w+)\}/g, (_, n) => (n in variables ? String(variables[n]) : `{${n}}`));
  };
}

// El marco de cada dibujo: <figure> con su título visible y su nombre para el lector de pantalla.
export function marco(contenedor, tipo, titulo, etiqueta) {
  const raiz = el('figure', { class: `clase-visual clase-dib clase-dib-${tipo}`, role: 'group', 'aria-label': titulo || etiqueta || null }, contenedor);
  if (titulo) el('figcaption', { class: 'clase-dib-titulo' }, raiz, titulo);
  return raiz;
}
export const api = raiz => ({ raiz, tiempo() {}, modo() {}, poner() {}, pausar() {}, destruir() { raiz.remove(); } });

// Rumbos: 0..360 → 1..360 (el norte es 360, como se dice en aviación) y la diferencia en −180..180.
export const normal = g => ((g % 360) + 360) % 360;
export const rumbo = g => { const n = Math.round(normal(g)) % 360; return n === 0 ? 360 : n; };
export const tresCifras = g => String(rumbo(g)).padStart(3, '0');
export const dif180 = g => { const n = normal(g + 180) - 180; return n === -180 ? 180 : n; };
// Un rumbo de brújula → vector en pantalla (y hacia abajo): norte arriba, este a la derecha.
export const vector = (g, largo = 1) => [Math.sin((g * Math.PI) / 180) * largo, -Math.cos((g * Math.PI) / 180) * largo];
export const miles = n => Math.round(n).toLocaleString('en-US');
export const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const lista = v => (Array.isArray(v) ? v : []);
export const r1 = n => Math.round(n * 10) / 10;

// Una pista «27L» → { numero: 27, letra: 'L', rumbo: 270, texto: '27L', opuesta: '9R' }.
export function leerPista(texto, porDefecto = '27') {
  const m = /^(0?[1-9]|[12][0-9]|3[0-6])([LCR]?)$/.exec(String(texto ?? '').trim().toUpperCase()) ?? /^(\d+)([LCR]?)$/.exec(porDefecto);
  const n = Number(m[1]), letra = m[2];
  const o = n > 18 ? n - 18 : n + 18;
  const letraO = letra === 'L' ? 'R' : letra === 'R' ? 'L' : letra;
  return { numero: n, letra, rumbo: n * 10, texto: `${n}${letra}`, opuesta: `${o}${letraO}` };
}

// Una flecha fija (línea + punta) de (x1,y1) a (x2,y2). El color lo pone la clase (clase.css).
export function flechaFija(padre, x1, y1, x2, y2, clase, punta = 11) {
  const g = svg('g', { class: `clase-dib-flecha ${clase}` }, padre);
  const dx = x2 - x1, dy = y2 - y1, largo = Math.hypot(dx, dy) || 1;
  const ux = dx / largo, uy = dy / largo, p = Math.min(punta, largo * 0.6), a = p * 0.6;
  const bx = x2 - ux * p, by = y2 - uy * p;
  svg('line', { x1: f1(x1), y1: f1(y1), x2: f1(bx), y2: f1(by), class: 'clase-dib-flecha-linea' }, g);
  svg('path', { d: `M${f1(x2)} ${f1(y2)}L${f1(bx - uy * a)} ${f1(by + ux * a)}L${f1(bx + uy * a)} ${f1(by - ux * a)}Z`, class: 'clase-dib-flecha-punta' }, g);
  return g;
}
// Una punta suelta (para marcar el sentido en medio de un tramo): en (x,y) apuntando hacia el rumbo de pantalla (dx,dy).
export function punta(padre, x, y, dx, dy, clase, p = 9) {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, a = p * 0.65;
  const bx = x - ux * p, by = y - uy * p;
  return svg('path', { d: `M${f1(x)} ${f1(y)}L${f1(bx - uy * a)} ${f1(by + ux * a)}L${f1(bx + uy * a)} ${f1(by - ux * a)}Z`, class: clase }, padre);
}
// La flecha del norte en pantalla, girada por el rumbo de pantalla del norte.
export function flechaNorte(padre, cx, cy, angulo, textoN) {
  const g = svg('g', { class: 'clase-dib-norte', transform: `translate(${f1(cx)} ${f1(cy)}) rotate(${f1(angulo)})` }, padre);
  svg('circle', { cx: 0, cy: 0, r: 15, class: 'clase-dib-norte-fondo' }, g);
  svg('path', { d: 'M0 -13L6 6L0 2L-6 6Z', class: 'clase-dib-norte-punta' }, g);
  svg('text', { x: 0, y: -18, 'text-anchor': 'middle', class: 'clase-dib-norte-n', transform: `rotate(${f1(-angulo)} 0 -24)` }, g, textoN);
  return g;
}
