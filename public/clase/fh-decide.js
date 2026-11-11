// Escena «Decidir como piloto»: cuatro piezas (piloto, avión, ambiente, operación) se unen; luego una ruta de vuelo
// con seis puntos D-E-C-I-D-E que se encienden cuando la avioneta pasa por cada uno.
// opciones.pasos = [piezas, ruta]; opciones.pasosDecide = [{ letra, verbo }] (6).

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, avioneta, nube, icono, mover, opacidad, T, tramo } from './fh-base.js';

export const TEXTOS_DECIDE = {
  piezas: ['Piloto', 'Avión', 'Ambiente', 'Operación'], mando: 'Piloto al mando: decides siempre', adm: 'Toma de decisiones (ADM)',
  pasosDecide: [
    { letra: 'D', verbo: 'Detecta el cambio' }, { letra: 'E', verbo: 'Estima si reaccionar' }, { letra: 'C', verbo: 'Escoge el resultado' },
    { letra: 'I', verbo: 'Identifica acciones' }, { letra: 'D', verbo: 'Hazlo' }, { letra: 'E', verbo: 'Evalúa' },
  ],
};
export const PASOS_DECIDE = [0.03, 0.38];

// La ruta: una curva suave que sube de izquierda a derecha. Devuelve el punto y el ángulo (grados) en x.
export function ruta(x) {
  const y = 520 - (x - 80) * 0.2 + 46 * Math.sin((x - 80) / 150);
  const dy = -0.2 + (46 / 150) * Math.cos((x - 80) / 150);
  return { x, y, angulo: (Math.atan(dy) * 180) / Math.PI };
}
export const PUNTOS_X = [190, 380, 570, 760, 950, 1140];

// En qué x va la avioneta: llega a cada punto en su momento y espera un poco en él.
export function xAvion(t, inicio, paso) {
  const pos = (t - inicio) / paso; // 0 en el primer punto
  if (pos <= 0) return 80 + (PUNTOS_X[0] - 80) * Math.max(0, 1 + pos);
  const k = Math.min(PUNTOS_X.length - 1, Math.floor(pos)), f = Math.min(1, (pos - k) / 0.7);
  if (k >= PUNTOS_X.length - 1) return PUNTOS_X[PUNTOS_X.length - 1] + Math.min(1, pos - k) * 80;
  const suave = f * f * (3 - 2 * f);
  return PUNTOS_X[k] + (PUNTOS_X[k + 1] - PUNTOS_X[k]) * suave;
}

function pieza(padre, color) {
  const g = svg('g', {}, padre);
  svg('path', { d: 'M-70 -70 H-14 a14 14 0 1 1 28 0 H70 V-14 a14 14 0 1 1 0 28 V70 H14 a14 14 0 1 0 -28 0 H-70 V14 a14 14 0 1 0 0 -28 Z', fill: color, stroke: '#ffffff', 'stroke-width': 4, class: 'clase-fh-sombra' }, g);
  return g;
}

export function montarFhDecide(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_DECIDE, opciones);
  const [p0, p1] = opciones.pasos || PASOS_DECIDE;
  const paso = (0.94 - (p1 + 0.05)) / 6;
  const rotulos = opciones.rotulos || [
    { texto: X.mando, desde: p0 + 0.06, hasta: p1, x: 1216, y: 112, tono: 'naranja', ancla: 'fin' },
    { texto: X.adm, desde: p0 + 0.2, hasta: p1, x: 640, y: 640, tono: 'azul', ancla: 'medio' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    const nubes = [[200, 260, 0.8], [700, 200, 0.6], [1100, 420, 0.9]].map(([x, y, e]) => ({ g: nube(c, 0, 0, e, 'var(--clfh-nube)', 0.5), x, y }));
    // Piezas.
    const piezas = svg('g', {}, c);
    const colores = ['#f97316', '#3b82f6', '#22c55e', '#a855f7'];
    const iconos = ['cara', 'ventila', 'calor', 'reloj'];
    const lista = colores.map((col, k) => {
      const g = pieza(piezas, col);
      if (k % 2) g.firstChild.setAttribute('transform', 'rotate(90)');
      const ic = icono(g, iconos[k], { r: 24, fondo: 'rgba(255,255,255,0.9)', trazo: '#0b1f3a', borde: 'transparent' });
      mover(ic, 0, -14);
      T(g, 0, 34, X.piezas[k] || '', { tam: 19, peso: 800, ancla: 'middle', color: '#ffffff' });
      const dx = k % 2 ? 70 : -70, dy = k < 2 ? -70 : 70;
      return { g, dx, dy, ox: dx * 9, oy: dy * 6 };
    });
    // Ruta y puntos.
    const camino = svg('g', {}, c);
    let d = '';
    for (let x = 60; x <= 1240; x += 10) { const p = ruta(x); d += `${x === 60 ? 'M' : 'L'}${f1(p.x)} ${f1(p.y)}`; }
    svg('path', { d, fill: 'none', stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 4, 'stroke-dasharray': '4 12', 'stroke-linecap': 'round', opacity: 0.7 }, camino);
    const hecho = svg('path', { d, fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 6, 'stroke-linecap': 'round', pathLength: 1000, 'stroke-dasharray': '0 1000' }, camino);
    const puntos = X.pasosDecide.map((pd, k) => {
      const p = ruta(PUNTOS_X[k]);
      const g = svg('g', {}, camino);
      const aro = svg('circle', { cx: p.x, cy: p.y, r: 16, fill: 'var(--clfh-tarjeta)', stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 4 }, g);
      const arriba = k % 2 === 0;
      const tarjeta = svg('g', {}, g);
      const cy = arriba ? p.y - 120 : p.y + 112;
      svg('line', { x1: p.x, x2: p.x, y1: p.y + (arriba ? -18 : 18), y2: cy + (arriba ? 44 : -44), stroke: 'var(--clfh-naranja)', 'stroke-width': 3 }, tarjeta);
      svg('rect', { x: p.x - 94, y: cy - 46, width: 188, height: 92, rx: 20, fill: 'var(--clfh-tarjeta)', stroke: 'var(--clfh-naranja)', 'stroke-width': 3, class: 'clase-fh-sombra' }, tarjeta);
      T(tarjeta, p.x, cy + 6, pd.letra, { tam: 44, peso: 900, ancla: 'middle', color: 'var(--clfh-naranja-texto)' });
      T(tarjeta, p.x, cy + 34, pd.verbo, { tam: 16, peso: 700, ancla: 'middle' });
      return { aro, tarjeta, cy };
    });
    const av = svg('g', {}, c);
    avioneta(av);

    return m => {
      const t = m.t;
      nubes.forEach((n, i) => mover(n.g, ((n.x - m.s * (6 + i * 3)) % 1500 + 1500) % 1500 - 100, n.y));
      // Piezas: llegan desde las esquinas, se juntan y luego se van a la esquina.
      const chico = m.e(p1, p1 + 0.05);
      mover(piezas, 640 + chico * 545, 360 - chico * 250, 1 - chico * 0.66);
      opacidad(piezas, 1 - chico * 0.2);
      lista.forEach((pz, k) => {
        const f = m.e(p0 + k * 0.03, p0 + 0.08 + k * 0.03);
        const junta = m.e(p0 + 0.18, p0 + 0.24);
        const sep = 1 + (1 - junta) * 0.12;
        mover(pz.g, pz.ox * (1 - f) + pz.dx * sep, pz.oy * (1 - f) + pz.dy * sep);
        opacidad(pz.g, f);
      });
      // Ruta DECIDE.
      const ve = m.e(p1 - 0.01, p1 + 0.04);
      opacidad(camino, ve);
      const xa = ctx.quieto ? PUNTOS_X[Math.max(0, Math.min(5, Math.floor((t - p1 - 0.05) / paso)))] : xAvion(t, p1 + 0.05, paso);
      const pa = ruta(xa);
      mover(av, pa.x, pa.y - 6 + m.onda(2.5) * 2, 0.62, pa.angulo);
      opacidad(av, ve);
      hecho.setAttribute('stroke-dasharray', `${f1(((xa - 60) / 1180) * 1000)} 1000`);
      puntos.forEach((pt, k) => {
        const on = m.e(p1 + 0.05 + k * paso, p1 + 0.05 + k * paso + 0.03);
        pt.aro.setAttribute('fill', on > 0.5 ? 'var(--clfh-naranja)' : 'var(--clfh-tarjeta)');
        pt.aro.setAttribute('stroke', on > 0.5 ? 'var(--clfh-tarjeta)' : 'var(--clfh-tinta-suave)');
        opacidad(pt.tarjeta, on);
        pt.tarjeta.setAttribute('transform', `translate(0 ${f1((1 - on) * (k % 2 ? -14 : 14))})`);
      });
      void tramo;
    };
  });
}
