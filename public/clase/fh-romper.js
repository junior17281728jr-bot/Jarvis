// Escena «Romper la cadena»: una cadena de eslabones lleva a un tanque vacío; una tijera corta un eslabón, la cadena
// se rompe y la escena pasa a un aterrizaje tranquilo al atardecer; al final, un piloto seguro y las tres metas.
// opciones.pasos = [cadena, corte, aterrizaje, piloto, cierre].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, avioneta, piloto, icono, mover, opacidad, T, degradado, pildora, ANCHO, ALTO } from './fh-base.js';

export const TEXTOS_ROMPER = {
  cadena: 'Una cadena de errores', rompe: 'Rompe un solo eslabón', final: 'Y cambias el final',
  metas: ['Entiende tu cuerpo', 'Reconoce tus actitudes', 'Decide a tiempo'], empezar: 'Vamos a empezar',
};
export const PASOS_ROMPER = [0.02, 0.17, 0.26, 0.4, 0.86];
const N = 6, CORTE = 3;

// Dónde queda cada eslabón: los de la izquierda del corte bajan un poco, los de la derecha caen y se van.
export function eslabon(k, f, corte = CORTE) {
  const x = 170 + k * 128;
  if (f <= 0) return { x, y: 400, giro: k % 2 ? 0 : 0, alfa: 1 };
  if (k < corte) return { x: x - f * 20, y: 400 + f * 16, giro: -f * 6, alfa: 1 };
  if (k === corte) return { x, y: 400 + f * 160, giro: f * 70, alfa: 1 - f };
  return { x: x + f * 60, y: 400 + f * f * 260, giro: f * 25, alfa: 1 - f };
}

export function montarFhRomper(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_ROMPER, opciones);
  const [p0, p1, p2, p3, p4] = opciones.pasos || PASOS_ROMPER;
  const rotulos = opciones.rotulos || [
    { texto: X.cadena, desde: p0 + 0.04, hasta: p1, x: 64, y: 190, tono: 'mal' },
    { texto: X.rompe, desde: p1, hasta: p2 + 0.02, x: 64, y: 190, tono: 'naranja' },
    { texto: X.final, desde: p2 + 0.03, hasta: p3, x: 64, y: 190, tono: 'bien' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    // ----- Cadena -----
    const cadena = svg('g', {}, c);
    const eslabones = Array.from({ length: N }, (_, k) => {
      const g = svg('g', {}, cadena);
      if (k % 2 === 0) {
        svg('rect', { x: -78, y: -40, width: 156, height: 80, rx: 40, fill: 'none', stroke: '#64748b', 'stroke-width': 22 }, g);
        svg('rect', { x: -78, y: -40, width: 156, height: 80, rx: 40, fill: 'none', stroke: '#cbd5e1', 'stroke-width': 8 }, g);
      } else {
        svg('rect', { x: -78, y: -12, width: 156, height: 24, rx: 12, fill: '#64748b' }, g);
        svg('rect', { x: -70, y: -4, width: 140, height: 8, rx: 4, fill: '#cbd5e1' }, g);
      }
      return g;
    });
    // Tanque vacío al final de la cadena.
    const tanque = svg('g', {}, c);
    svg('circle', { r: 86, fill: 'var(--clfh-cabina-1)', stroke: 'var(--clfh-mal)', 'stroke-width': 6 }, tanque);
    svg('path', { d: 'M-58 20 A62 62 0 0 1 58 20', fill: 'none', stroke: '#e5e7eb', 'stroke-width': 4 }, tanque);
    T(tanque, -56, 46, 'E', { tam: 26, peso: 900, color: '#f87171', ancla: 'middle' });
    T(tanque, 56, 46, 'F', { tam: 26, peso: 900, color: '#e5e7eb', ancla: 'middle' });
    const aguja = svg('path', { d: 'M-3 0 L0 -62 L3 0 Z', fill: '#f87171', transform: 'rotate(-62)' }, tanque);
    svg('circle', { r: 8, fill: '#fb923c' }, tanque);
    const bien = icono(tanque, 'bien', { r: 86, fondo: 'var(--clfh-bien)', trazo: '#ffffff', borde: 'transparent' });
    mover(tanque, 1080, 400);
    // Tijera.
    const tijera = svg('g', {}, c);
    const hoja = sentido => { const g = svg('g', {}, tijera); svg('path', { d: 'M0 0 L-8 -120 L8 -120 Z', fill: '#e5e7eb', stroke: '#94a3b8', 'stroke-width': 2 }, g); svg('circle', { cx: sentido * 0, cy: 46, r: 26, fill: 'none', stroke: '#f97316', 'stroke-width': 12 }, g); return g; };
    const h1 = hoja(1), h2 = hoja(-1);
    svg('circle', { r: 7, fill: '#334155' }, tijera);
    const chispa = svg('circle', { r: 30, fill: 'none', stroke: '#fde68a', 'stroke-width': 6 }, c);

    // ----- Aterrizaje al atardecer -----
    const tarde = svg('g', {}, c);
    svg('rect', { width: ANCHO, height: ALTO, fill: degradado(ctx, [[0, '#28407a'], [0.55, '#f08a4b'], [0.78, '#ffd08a'], [1, '#ffd08a']]) }, tarde);
    svg('circle', { cx: 900, cy: 470, r: 70, fill: '#fff1c4', opacity: 0.95 }, tarde);
    svg('rect', { y: 500, width: ANCHO, height: 220, fill: '#2f3d2c' }, tarde);
    svg('path', { d: 'M600 500 L680 500 L980 720 L300 720 Z', fill: '#3b4150' }, tarde);
    svg('path', { d: 'M640 506 L640 720', stroke: '#f8fafc', 'stroke-width': 5, 'stroke-dasharray': '22 20' }, tarde);
    for (let k = 0; k < 8; k++) { const f = k / 7, y = 502 + f * f * 218, a = 44 + f * 300; for (const l of [-1, 1]) svg('circle', { cx: f1(640 + l * a), cy: f1(y), r: f1(2 + f * 4), fill: '#fde68a' }, tarde); }
    const avT = svg('g', {}, tarde);
    avioneta(avT, { cuerpo: '#1f2937', detalle: '#111827', acento: '#fb923c' });

    // ----- Piloto y metas -----
    const persona = svg('g', {}, c);
    svg('circle', { cx: 0, cy: 20, r: 170, fill: 'var(--clfh-tarjeta)', opacity: 0.95, class: 'clase-fh-sombra' }, persona);
    const pil = piloto(persona);
    const metas = X.metas.map((texto, i) => pildora(c, { texto, x: 580, y: 250 + i * 84, tono: 'bien', tam: 30 }));
    const fin = svg('g', {}, c);
    svg('rect', { x: -230, y: -44, width: 460, height: 88, rx: 44, fill: 'var(--clfh-naranja)', class: 'clase-fh-sombra' }, fin);
    T(fin, 0, 14, X.empezar, { tam: 38, peso: 900, ancla: 'middle', color: '#1c1003' });

    return m => {
      const t = m.t;
      const corte = m.e(p1 + 0.03, p1 + 0.1);
      eslabones.forEach((g, k) => {
        const ap = m.e(p0 + k * 0.016, p0 + 0.03 + k * 0.016);
        const e = eslabon(k, corte);
        mover(g, e.x, e.y + (1 - ap) * 30, k === CORTE && corte > 0 ? 1 + corte * 0.1 : 1, e.giro);
        opacidad(g, ap * e.alfa);
      });
      const vt = m.e(p0 + 0.1, p0 + 0.13);
      opacidad(tanque, vt);
      aguja.setAttribute('transform', `rotate(${f1(-62 + m.onda(0.8) * 3)})`);
      opacidad(bien, m.e(p1 + 0.08, p1 + 0.11));
      // Tijera: baja, corta y se va.
      const baja = m.e(p1 - 0.02, p1 + 0.03), cierra = m.e(p1 + 0.03, p1 + 0.05), va = m.e(p1 + 0.07, p1 + 0.1);
      const xc = 170 + CORTE * 128;
      mover(tijera, xc, 400 - (1 - baja) * 220 - va * 260, 1, 180);
      opacidad(tijera, baja * (1 - va));
      h1.setAttribute('transform', `rotate(${f1(22 - 22 * cierra)})`); h2.setAttribute('transform', `rotate(${f1(-22 + 22 * cierra)})`);
      const ch = m.lin(p1 + 0.04, p1 + 0.08);
      chispa.setAttribute('cx', xc); chispa.setAttribute('cy', 400); chispa.setAttribute('r', f1(20 + ch * 120));
      opacidad(chispa, ch > 0 && ch < 1 ? 1 - ch : 0);
      // Atardecer y aterrizaje.
      const vtar = m.e(p2 - 0.02, p2 + 0.03);
      opacidad(tarde, vtar); opacidad(cadena, 1 - vtar);
      const at = m.lin(p2, p3 + 0.04);
      const xa = 300 + at * 340, ya = 330 + Math.min(1, at * 1.15) * 170;
      mover(avT, xa, Math.min(492, ya), 0.7 + at * 0.6, -6 + Math.min(1, at * 1.2) * 9);
      // Piloto y metas.
      const vp = m.e(p3, p3 + 0.04);
      opacidad(avT, 1 - vp * 0.75);
      mover(persona, 300, 380 + (1 - vp) * 30, 1.35); opacidad(persona, vp);
      pil.boca.setAttribute('d', 'M2 18 Q13 30 24 18');
      metas.forEach((mt, i) => { const a = m.e(p3 + 0.04 + i * 0.07, p3 + 0.08 + i * 0.07); mover(mt.g, mt.x + (1 - a) * 40, mt.y); opacidad(mt.g, a); });
      const vf = m.e(p4, p4 + 0.03);
      mover(fin, 860, 640 + (1 - vf) * 20, 0.9 + 0.1 * vf); opacidad(fin, vf);
      void t;
    };
  });
}
