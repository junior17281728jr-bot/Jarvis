// 0.13.0: los dibujos con DATOS que llena la fábrica de materias (src/academia/diagramas.js dice su forma): partes,
// tabla, pasos, escala, capas, línea de tiempo y el ejemplo resuelto de un cálculo. Sin animación, sin estilos incrustados
// (solo clases de clase.css) y sin convertir texto en HTML: cada texto va con textContent.
// API (como los demás dibujos): montar(contenedor, parametros) → { raiz, tiempo(), modo(), poner(), pausar(), destruir() }.
import { el, svg } from './comun.js';

const ANCHO = 640;
const texto = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
const lista = v => (Array.isArray(v) ? v : []);
function marco(contenedor, tipo, p) {
  const raiz = el('figure', { class: `clase-visual clase-diagrama clase-diagrama-${tipo}`, role: 'group', 'aria-label': texto(p?.titulo) || null }, contenedor);
  if (p?.titulo) el('figcaption', { class: 'clase-diagrama-titulo' }, raiz, p.titulo);
  return raiz;
}
const api = raiz => ({ raiz, tiempo() {}, modo() {}, poner() {}, pausar() {}, destruir() { raiz.remove(); } });

export function montarPartes(c, p = {}) {
  const raiz = marco(c, 'partes', p);
  const ul = el('ul', { class: 'clase-diagrama-partes' }, raiz);
  lista(p.elementos).forEach((e, i) => {
    const li = el('li', { class: 'clase-diagrama-parte' }, ul);
    el('span', { class: 'clase-diagrama-numero', 'aria-hidden': 'true' }, li, i + 1);
    el('strong', {}, li, texto(e.nombre));
    if (e.detalle) el('span', { class: 'clase-diagrama-detalle' }, li, e.detalle);
  });
  return api(raiz);
}
export function montarTabla(c, p = {}) {
  const raiz = marco(c, 'tabla', p);
  const tabla = el('table', { class: 'clase-diagrama-tabla' }, raiz);
  const fila = el('tr', {}, el('thead', {}, tabla));
  for (const col of lista(p.columnas)) el('th', { scope: 'col' }, fila, texto(col));
  const cuerpo = el('tbody', {}, tabla);
  for (const f of lista(p.filas)) {
    const tr = el('tr', {}, cuerpo);
    lista(f).forEach((x, i) => el(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : {}, tr, texto(x)));
  }
  return api(raiz);
}
function pasos(c, tipo, p, clase) {
  const raiz = marco(c, tipo, p);
  const ol = el('ol', { class: clase }, raiz);
  for (const e of lista(p.elementos)) {
    const li = el('li', {}, ol);
    el('strong', {}, li, texto(e.nombre));
    if (e.detalle) el('span', { class: 'clase-diagrama-detalle' }, li, e.detalle);
  }
  return raiz;
}
export const montarPasos = (c, p = {}) => api(pasos(c, 'pasos', p, 'clase-diagrama-pasos'));
export const montarLinea = (c, p = {}) => api(pasos(c, 'linea', p, 'clase-diagrama-linea'));
export function montarCalculo(c, p = {}) {
  const raiz = marco(c, 'calculo', p);
  if (p.problema) el('p', { class: 'clase-diagrama-problema' }, raiz, p.problema);
  if (p.formula) el('p', { class: 'clase-diagrama-formula' }, raiz, p.formula);
  const ol = el('ol', { class: 'clase-diagrama-pasos clase-diagrama-cuenta' }, raiz);
  for (const e of lista(p.elementos)) {
    const li = el('li', {}, ol);
    el('span', {}, li, texto(e.nombre));
    if (e.detalle) el('strong', { class: 'clase-diagrama-numeros' }, li, e.detalle);
  }
  if (p.resultado) el('p', { class: 'clase-diagrama-resultado' }, raiz, p.resultado);
  return api(raiz);
}
// Una escala con sus marcas (de menor a mayor).
export function montarEscala(c, p = {}) {
  const raiz = marco(c, 'escala', p);
  const marcas = lista(p.elementos).filter(e => Number.isFinite(e?.valor));
  const min = Math.min(...marcas.map(e => e.valor)), max = Math.max(...marcas.map(e => e.valor));
  const x = v => 40 + (max > min ? ((v - min) / (max - min)) * (ANCHO - 80) : (ANCHO - 80) / 2);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} 160`, class: 'clase-diagrama-lienzo', role: 'img', 'aria-label': marcas.map(e => `${e.nombre}: ${e.valor}${p.unidad ? ` ${p.unidad}` : ''}`).join(', ') }, raiz);
  svg('rect', { x: 40, y: 70, width: ANCHO - 80, height: 16, rx: 8, class: 'clase-diagrama-barra' }, lienzo);
  marcas.forEach((e, i) => {
    const g = svg('g', { class: 'clase-diagrama-marca' }, lienzo);
    svg('line', { x1: x(e.valor), x2: x(e.valor), y1: 60, y2: 96 }, g);
    svg('text', { x: x(e.valor), y: i % 2 ? 128 : 48, 'text-anchor': 'middle' }, g, `${e.valor}${p.unidad ? ` ${p.unidad}` : ''}`);
    svg('text', { x: x(e.valor), y: i % 2 ? 148 : 28, 'text-anchor': 'middle', class: 'clase-diagrama-rotulo' }, g, texto(e.nombre));
  });
  return api(raiz);
}
// Capas de abajo hacia arriba (espacio aéreo, nubes), con su altura proporcional.
export function montarCapas(c, p = {}) {
  const raiz = marco(c, 'capas', p);
  const capas = lista(p.elementos).filter(e => Number.isFinite(e?.valor) && Number.isFinite(e?.hasta));
  const alto = 300;
  const tope = Math.max(...capas.map(e => e.hasta), 1), piso = Math.min(...capas.map(e => e.valor), 0);
  const y = v => 10 + alto - ((v - piso) / (tope - piso || 1)) * alto;
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${alto + 20}`, class: 'clase-diagrama-lienzo', role: 'img', 'aria-label': capas.map(e => `${e.nombre}: ${e.valor}–${e.hasta}${p.unidad ? ` ${p.unidad}` : ''}`).join(', ') }, raiz);
  capas.forEach((e, i) => {
    const g = svg('g', { class: `clase-diagrama-capa clase-diagrama-capa-${i % 4}` }, lienzo);
    svg('rect', { x: 120, y: y(e.hasta), width: ANCHO - 140, height: Math.max(4, y(e.valor) - y(e.hasta)), rx: 6 }, g);
    svg('text', { x: 130 + (ANCHO - 140) / 2, y: (y(e.valor) + y(e.hasta)) / 2 + 6, 'text-anchor': 'middle' }, g, texto(e.nombre));
    svg('text', { x: 110, y: y(e.hasta) + 14, 'text-anchor': 'end', class: 'clase-diagrama-rotulo' }, g, `${e.hasta}${p.unidad ? ` ${p.unidad}` : ''}`);
  });
  return api(raiz);
}

export const VISUALES_DIAGRAMA = {
  'diagrama-partes': (c, p) => montarPartes(c, p),
  'diagrama-tabla': (c, p) => montarTabla(c, p),
  'diagrama-pasos': (c, p) => montarPasos(c, p),
  'diagrama-escala': (c, p) => montarEscala(c, p),
  'diagrama-capas': (c, p) => montarCapas(c, p),
  'diagrama-linea': (c, p) => montarLinea(c, p),
  calculo: (c, p) => montarCalculo(c, p),
};
