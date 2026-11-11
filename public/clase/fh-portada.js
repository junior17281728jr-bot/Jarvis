// Portada y cierre de la clase: cielo de amanecer, pista con luces de aproximación y una avioneta que cruza.
// API: montarFhPortada(contenedor, { academia, antetitulo, titulo, subtitulo, variante: 'portada'|'cierre', duracion_s })

import { svg, f1 } from './comun.js';
import { montarFH, avioneta, nube, mover, opacidad, T, degradado, ANCHO, ALTO, salida, tramo } from './fh-base.js';

// Brillo de la pantalla: sube desde negro al empezar la portada y baja a negro al final del cierre.
export function brilloPortada(t, variante = 'portada', duracion = 4) {
  const borde = Math.min(0.25, 0.5 / duracion);
  if (variante === 'cierre') return 1 - tramo(t, 1 - borde * 1.6, 1);
  return tramo(t, 0, borde);
}

export function montarFhPortada(contenedor, opciones = {}) {
  const cierre = opciones.variante === 'cierre';
  return montarFH(contenedor, { ...opciones, cabecera: false, rotulos: [] }, ctx => {
    const c = ctx.capa;
    svg('rect', { width: ANCHO, height: ALTO, fill: degradado(ctx, [[0, '#040a1a'], [0.55, '#14305e'], [0.82, cierre ? '#c2603a' : '#7b5a8c'], [1, cierre ? '#f2a35a' : '#f0a35e']]) }, c);
    svg('circle', { cx: 640, cy: 560, r: 330, fill: degradado(ctx, [[0, '#ffd59a', 0.8], [0.5, '#ff9f5a', 0.25], [1, '#ff9f5a', 0]], { radial: true }) }, c);
    const estrellas = svg('g', {}, c);
    for (let k = 0; k < 60; k++) svg('circle', { cx: (k * 211) % 1280, cy: (k * 97) % 300, r: k % 5 ? 1.2 : 2, fill: '#ffffff', opacity: 0.25 + (k % 4) * 0.15 }, estrellas);
    const nubes = svg('g', {}, c);
    const ns = [[150, 330, 0.9], [520, 300, 0.7], [930, 340, 1], [1240, 310, 0.8]].map(([x, y, e]) => ({ g: nube(nubes, 0, 0, e, '#2a3f68', 0.6), x, y }));
    // Suelo y pista en perspectiva hacia el horizonte (y = 560).
    svg('rect', { x: 0, y: 560, width: ANCHO, height: 160, fill: '#0b1426' }, c);
    svg('path', { d: 'M600 560 L680 560 L900 720 L380 720 Z', fill: '#1d2638' }, c);
    svg('path', { d: 'M640 566 L640 720', stroke: '#e8eef8', 'stroke-width': 4, 'stroke-dasharray': '18 22', opacity: 0.8 }, c);
    const luces = svg('g', {}, c);
    const listaLuces = [];
    for (let k = 0; k < 12; k++) {
      const f = k / 11, y = 562 + f * f * 158, abre = 40 + f * 280;
      for (const lado of [-1, 1]) listaLuces.push({ n: svg('circle', { cx: f1(640 + lado * abre), cy: f1(y), r: f1(1.6 + f * 4), fill: k % 3 ? '#ffd27a' : '#ffffff' }, luces), k });
    }
    const avion = svg('g', {}, c);
    avioneta(avion, { cuerpo: '#eef3fb', detalle: '#24344f' });
    const textos = svg('g', {}, ctx.capaTexto);
    const lineas = [];
    if (opciones.academia) lineas.push(T(textos, 640, 150, String(opciones.academia).toUpperCase(), { tam: 20, peso: 700, color: '#c9d6ec', ancla: 'middle', espacio: 5 }));
    if (opciones.antetitulo) lineas.push(T(textos, 640, 210, opciones.antetitulo, { tam: 30, peso: 750, color: '#fdba74', ancla: 'middle', espacio: 1 }));
    lineas.push(T(textos, 640, 292, opciones.titulo || '', { tam: cierre ? 64 : 84, peso: 850, color: '#ffffff', ancla: 'middle', espacio: -1 }));
    if (opciones.subtitulo) lineas.push(T(textos, 640, 352, opciones.subtitulo, { tam: 36, peso: 600, color: '#e3eaf6', ancla: 'middle' }));
    const raya = svg('rect', { x: 600, y: 380, width: 80, height: 6, rx: 3, fill: '#fb923c' }, textos);
    const negro = svg('rect', { width: ANCHO, height: ALTO, fill: '#02050c' }, ctx.capaTexto);

    return m => {
      const t = m.t;
      ns.forEach((n, i) => mover(n.g, ((n.x - m.s * (10 + i * 4)) % 1500 + 1500) % 1500 - 100, n.y - 60));
      listaLuces.forEach(l => opacidad(l.n, 0.45 + 0.55 * Math.max(0, Math.sin(m.s * 5 - l.k * 0.7))));
      // La avioneta cruza de izquierda a derecha, alta, mientras aparecen los textos.
      const x = -160 + salida(t) * 1500 * (cierre ? 0.75 : 1), y = cierre ? 470 - t * 60 : 470 - t * 50;
      mover(avion, x, y + m.onda(3) * 3, 1.1, -4);
      lineas.forEach((n, i) => { const a = m.e(0.06 + i * 0.09, 0.22 + i * 0.09); opacidad(n, a); n.setAttribute('transform', `translate(0 ${f1((1 - a) * 18)})`); });
      const ar = m.e(0.3, 0.55);
      raya.setAttribute('width', f1(80 * ar)); raya.setAttribute('x', f1(640 - 40 * ar));
      opacidad(estrellas, 1 - t * 0.5);
      opacidad(negro, 1 - brilloPortada(t, cierre ? 'cierre' : 'portada', ctx.duracion));
    };
  });
}
