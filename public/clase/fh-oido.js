// Escena «El oído interno»: los tres canales semicirculares; un canal ampliado donde, al empezar un giro, el líquido
// se atrasa y dobla la cúpula; en un giro sostenido el líquido alcanza al canal y ya no se siente nada. Luego la
// espiral (crees que vas recto) y el indicador de actitud: cree en tus instrumentos.
// opciones.pasos = [canales, empiezaGiro, giroSostenido, espiral, instrumentos].

import { svg, f1, rad } from './comun.js';
import { montarFH, textosDe, fondoCielo, mover, opacidad, T, instrumento, degradado, avioneta } from './fh-base.js';

export const TEXTOS_OIDO = {
  canales: 'Tres canales con líquido', atrasa: 'Empieza el giro: el líquido se atrasa', nada: 'Giro sostenido: no sientes nada',
  espiral: 'Espiral: crees que vas recto', instrumentos: 'Cree en tus instrumentos', avion: 'El avión', sientes: 'Lo que sientes', cupula: 'cúpula',
};
export const PASOS_OIDO = [0.03, 0.2, 0.36, 0.55, 0.73];

// Giro a velocidad constante desde «inicio» (s): la cabeza gira enseguida y el líquido la alcanza poco a poco
// (retardo de primer orden con constante tau). desvio ∈ [0,1] es cuánto se dobla la cúpula (lo que «sientes»).
export function giroCanal(s, inicio, omega = 40, tau = 2.4) {
  if (s <= inicio) return { cabeza: 0, liquido: 0, desvio: 0 };
  const d = s - inicio, e = Math.exp(-d / tau);
  return { cabeza: omega * d, liquido: omega * (d - tau * (1 - e)), desvio: e };
}

function vistaTrasera(padre) {
  const g = svg('g', {}, padre);
  svg('rect', { x: -70, y: -5, width: 140, height: 9, rx: 4.5, fill: '#e9eef6' }, g);
  svg('circle', { r: 15, fill: '#e9eef6' }, g);
  svg('path', { d: 'M-4 -12 L0 -34 L4 -12 Z', fill: '#e9eef6' }, g);
  svg('rect', { x: -26, y: -16, width: 52, height: 5, rx: 2.5, fill: '#e9eef6' }, g);
  svg('circle', { r: 5, fill: '#fb923c' }, g);
  return g;
}

export function montarFhOido(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_OIDO, opciones);
  const [p0, p1, p2, p3, p4] = opciones.pasos || PASOS_OIDO;
  const rotulos = opciones.rotulos || [
    { texto: X.canales, desde: p0 + 0.05, hasta: p1, x: 64, y: 190, tono: 'naranja' },
    { texto: X.atrasa, desde: p1 + 0.02, hasta: p2, x: 64, y: 190, tono: 'azul' },
    { texto: X.nada, desde: p2 + 0.02, hasta: p3, x: 64, y: 190, tono: 'mal' },
    { texto: X.espiral, desde: p3 + 0.02, hasta: p4 + 0.02, x: 64, y: 190, tono: 'mal' },
    { texto: X.instrumentos, desde: p4 + 0.04, x: 930, y: 660, tono: 'bien', ancla: 'medio' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);

    // ----- Oído interno (izquierda) -----
    const oido = svg('g', {}, c);
    svg('circle', { cx: 0, cy: 0, r: 210, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, oido);
    const tubo = (d, color) => { svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 26, 'stroke-linecap': 'round' }, oido); svg('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 9, opacity: 0.45, 'stroke-linecap': 'round' }, oido); };
    tubo('M-20 40 C-90 -10 -70 -150 20 -150 C100 -150 110 -40 50 20', '#f97316');
    tubo('M-30 50 C-150 40 -170 -60 -100 -90 C-60 -105 -20 -60 -10 0', '#3b82f6');
    tubo('M0 50 C60 80 170 60 160 -20 C150 -80 70 -70 40 0', '#22c55e');
    svg('ellipse', { cx: 5, cy: 50, rx: 52, ry: 34, fill: '#f4c7b8', stroke: '#e79c88', 'stroke-width': 4 }, oido);
    svg('path', { d: 'M-30 80 C-80 90 -100 140 -60 160 C-20 180 10 140 -20 120 C-40 110 -50 140 -35 145', fill: 'none', stroke: '#e79c88', 'stroke-width': 18, 'stroke-linecap': 'round' }, oido);
    const lupa = svg('circle', { cx: 120, cy: -20, r: 36, fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 4, 'stroke-dasharray': '6 6' }, oido);
    void lupa;

    // ----- Canal ampliado (centro derecha) -----
    const RC = 150;
    const canal = svg('g', {}, c);
    svg('circle', { r: RC + 46, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, canal);
    const anillo = svg('g', {}, canal);
    svg('circle', { r: RC, fill: 'none', stroke: '#fdba74', 'stroke-width': 52 }, anillo);
    svg('circle', { r: RC, fill: 'none', stroke: '#fff7ed', 'stroke-width': 38 }, anillo);
    for (let k = 0; k < 12; k++) { const a = rad(k * 30 + 15); svg('line', { x1: f1(Math.cos(a) * (RC + 20)), y1: f1(Math.sin(a) * (RC + 20)), x2: f1(Math.cos(a) * (RC + 26)), y2: f1(Math.sin(a) * (RC + 26)), stroke: '#c2410c', 'stroke-width': 3 }, anillo); }
    const cupula = svg('path', { fill: '#fb923c', opacity: 0.85 }, anillo);
    svg('rect', { x: RC - 22, y: -6, width: 44, height: 12, rx: 6, fill: '#c2410c' }, anillo);
    const nombreCupula = T(canal, 0, 0, X.cupula, { tam: 19, peso: 750, color: 'var(--clfh-naranja-texto)', ancla: 'middle' });
    const liquido = svg('g', {}, canal);
    const gotas = Array.from({ length: 18 }, (_, k) => svg('circle', { r: 6, fill: '#3b82f6', opacity: 0.85 }, liquido));
    const flechaGiro = svg('path', { d: `M${-RC - 70} -60 A${RC + 70} ${RC + 70} 0 0 1 -60 ${-RC - 70}`, fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 6, 'stroke-linecap': 'round' }, canal);
    const puntaGiro = svg('path', { d: `M-60 ${-RC - 70} l-22 -12 l4 26 Z`, fill: 'var(--clfh-naranja)' }, canal);

    // Tarjetas: lo que hace el avión y lo que sientes.
    const tarjetas = svg('g', {}, c);
    const mini = [X.avion, X.sientes].map((nombre, i) => {
      const g = svg('g', {}, tarjetas);
      svg('rect', { x: -110, y: -64, width: 220, height: 128, rx: 22, fill: '#0e1726' }, g);
      T(g, 0, 50, nombre, { tam: 18, peso: 700, ancla: 'middle', color: '#c9d5e8' });
      svg('line', { x1: -90, x2: 90, y1: 0, y2: 0, stroke: '#3d5674', 'stroke-width': 2, 'stroke-dasharray': '4 6' }, g);
      const av = vistaTrasera(g);
      mover(g, 820 + i * 240, 128);
      return { g, av };
    });

    // ----- Espiral -----
    const espiral = svg('g', {}, c);
    const vueltas = [];
    for (let k = 0; k < 5; k++) vueltas.push(svg('ellipse', { cx: 0, cy: k * 64, rx: 170 - k * 12, ry: 40 - k * 3, fill: 'none', stroke: 'var(--clfh-mal)', 'stroke-width': 3, 'stroke-dasharray': '10 8', opacity: 0.9 - k * 0.1 }, espiral));
    svg('rect', { x: -220, y: 330, width: 440, height: 40, rx: 12, fill: degradado(ctx, [[0, 'var(--clfh-tierra-1)'], [1, 'var(--clfh-tierra-2)']]) }, espiral);
    const avE = svg('g', {}, espiral);
    avioneta(avE);
    const caida = T(espiral, 210, -40, '', { tam: 30, peso: 800, ancla: 'start', color: 'var(--clfh-mal)' });

    // ----- Indicador de actitud -----
    const panel = svg('g', {}, c);
    const halo = svg('circle', { r: 196, fill: 'none', stroke: 'var(--clfh-bien)', 'stroke-width': 10 }, panel);
    const actitud = instrumento(ctx, panel, 'actitud', { r: 170 });

    return m => {
      const t = m.t, s = m.s;
      const g = giroCanal(s, p1 * ctx.duracion, 40, 2.4);
      const fase1 = m.e(0, p0 + 0.04), fueraOido = m.e(p3 - 0.02, p3 + 0.03);
      mover(oido, 300, 430, 0.9 + 0.1 * fase1); opacidad(oido, fase1 * (1 - fueraOido));
      const ver = m.e(p0 + 0.06, p0 + 0.11);
      mover(canal, 880, 450, 0.85 + 0.15 * ver); opacidad(canal, ver * (1 - fueraOido));
      anillo.setAttribute('transform', `rotate(${f1(g.cabeza)})`);
      const doblez = ctx.quieto ? (t >= p1 && t < p2 ? 1 : 0) : g.desvio;
      const tip = -doblez * 30; // la cúpula se dobla hacia atrás del giro
      cupula.setAttribute('d', `M${RC - 20} 0 C${RC - 20} -14 ${RC - 8 + tip * 0.3} -24 ${RC + tip * 0.2} -24 C${RC + 8 + tip * 0.3} -24 ${RC + 20} -14 ${RC + 20} 0 Z`);
      cupula.setAttribute('transform', `rotate(${f1(tip)} ${RC} 0)`);
      const ac = rad(g.cabeza);
      nombreCupula.setAttribute('x', f1(Math.cos(ac) * (RC + 66))); nombreCupula.setAttribute('y', f1(Math.sin(ac) * (RC + 66) + 7));
      gotas.forEach((gota, k) => { const a = rad(k * 20 + g.liquido); gota.setAttribute('cx', f1(Math.cos(a) * RC)); gota.setAttribute('cy', f1(Math.sin(a) * RC)); });
      const enGiro = m.e(p1, p1 + 0.03);
      opacidad(flechaGiro, enGiro); opacidad(puntaGiro, enGiro);
      // Tarjetas: el avión se inclina; lo sentido sigue a la cúpula.
      opacidad(tarjetas, m.e(p1, p1 + 0.04) * (1 - m.e(p4 - 0.02, p4 + 0.02)));
      const alabeo = 28 * enGiro;
      mover(mini[0].av, 0, -6, 1, -alabeo);
      mover(mini[1].av, 0, -6, 1, -alabeo * doblez * (t < p3 ? 1 : 0));
      // Espiral.
      const ve = m.e(p3, p3 + 0.04);
      mover(espiral, 330 + (1 - ve) * -40, 330, 0.95); opacidad(espiral, ve * (1 - 0.45 * m.e(p4, p4 + 0.04)));
      const fe = m.lin(p3, 1);
      const ang = s * 2.2, nivel = Math.min(4, fe * 6);
      const rx = 170 - nivel * 12, ry = 40 - nivel * 3;
      mover(avE, Math.cos(ang) * rx, nivel * 64 + Math.sin(ang) * ry, 0.55, Math.cos(ang) > 0 ? 20 : -20);
      caida.textContent = t >= p3 ? `↓ ${Math.round(1200 + fe * 1800)} ft/min` : '';
      // Actitud: aparece con el halo; luego el piloto nivela.
      const vp = m.e(p4, p4 + 0.04);
      mover(panel, 930, 410, 0.7 + 0.3 * vp); opacidad(panel, vp);
      const nivela = m.e(p4 + 0.12, p4 + 0.22);
      actitud.poner({ alabeo: 32 * (1 - nivela), cabeceo: -6 * (1 - nivela) });
      opacidad(halo, 0.5 + 0.5 * Math.abs(m.onda(1.6)));
    };
  });
}
