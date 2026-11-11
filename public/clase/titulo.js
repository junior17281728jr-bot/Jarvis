// Tarjeta de título de una clase (la primera escena de la «película»): cielo, nubes que pasan y una avioneta.
//
// API: montarTitulo(contenedor, { titulo, antetitulo, modo, textos }) → { tiempo(t), modo(), pausar(b), destruir() }

import { el, svg, idUnico, prefiereMenosMovimiento, crearBucle, f1 } from './comun.js';
import { dibujarAvion } from './escenario.js';

const ANCHO = 640, ALTO = 360;

export function montarTitulo(contenedor, opciones = {}) {
  const quieto = prefiereMenosMovimiento();
  let reloj = 0, avance = 0;
  const raiz = el('div', { class: 'clase-visual clase-titulo' }, contenedor);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo', role: 'img', 'aria-label': opciones.titulo || '' }, raiz);
  const defs = svg('defs', {}, lienzo);
  const idCielo = idUnico('cieloT'), idSol = idUnico('sol');
  const g = svg('linearGradient', { id: idCielo, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svg('stop', { offset: 0, class: 'clase-cielo-arriba' }, g);
  svg('stop', { offset: 1, class: 'clase-titulo-horizonte' }, g);
  const s = svg('radialGradient', { id: idSol, cx: 0.5, cy: 0.5, r: 0.5 }, defs);
  svg('stop', { offset: 0, class: 'clase-sol-1' }, s);
  svg('stop', { offset: 1, class: 'clase-sol-2' }, s);
  svg('rect', { width: ANCHO, height: ALTO, fill: `url(#${idCielo})` }, lienzo);
  svg('circle', { cx: 500, cy: 250, r: 170, fill: `url(#${idSol})` }, lienzo);
  const capas = [0.25, 0.5, 1].map((velocidad, i) => {
    const grupo = svg('g', { class: `clase-titulo-nubes clase-titulo-nubes-${i}` }, lienzo);
    for (let k = 0; k < 4; k++) {
      const x = k * 230 + i * 90 + (k % 2) * 40, y = 70 + i * 62 + (k % 2) * 26, r = 9 + i * 7;
      for (const [dx, dy, rr] of [[0, 0, 1], [r * 1.1, -r * 0.5, 1.3], [r * 2.3, 0, 1]]) svg('circle', { cx: f1(x + dx), cy: f1(y + dy), r: f1(r * rr) }, grupo);
      svg('rect', { x: f1(x - r), y: f1(y), width: f1(r * 4.3), height: f1(r * 0.9), rx: f1(r * 0.45) }, grupo);
    }
    return { grupo, velocidad };
  });
  svg('path', { d: `M0 ${ALTO - 40}Q160 ${ALTO - 70} 320 ${ALTO - 48}T640 ${ALTO - 52}L640 ${ALTO}L0 ${ALTO}Z`, class: 'clase-titulo-tierra' }, lienzo);
  const avion = svg('g', { class: 'clase-avion-lado' }, lienzo);
  dibujarAvion(avion);
  const texto = el('div', { class: 'clase-titulo-texto' }, raiz);
  if (opciones.antetitulo) el('p', { class: 'clase-titulo-ante' }, texto, opciones.antetitulo);
  el('h3', { class: 'clase-titulo-grande' }, texto, opciones.titulo || '');

  function dibujar() {
    for (const c of capas) c.grupo.setAttribute('transform', `translate(${f1(-((reloj * 30 * c.velocidad) % 230))} 0)`);
    const x = 120 + avance * 260, y = 120 + Math.sin(reloj * 1.3) * 6 - avance * 30;
    avion.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(-4 + Math.sin(reloj * 0.9) * 2)}) scale(1.5)`);
  }
  const bucle = crearBucle(raiz, dt => { reloj += dt; dibujar(); });
  dibujar();
  if (!quieto) bucle.iniciar();
  return {
    raiz,
    tiempo(t) { avance = Math.max(0, Math.min(1, t)); if (quieto || !bucle.activo) dibujar(); },
    modo() {}, poner() {},
    pausar(si) { if (si || quieto) bucle.detener(); else bucle.iniciar(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}
