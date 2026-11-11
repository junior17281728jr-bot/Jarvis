// Escena «El enemigo invisible»: corte del morro de la avioneta; una fisura en el escape dentro de la camisa de la
// calefacción deja pasar monóxido de carbono (puntos casi invisibles) a la cabina. Un glóbulo rojo como un autobús:
// el CO ocupa los asientos del oxígeno. Síntomas y qué hacer: calefacción cerrada, ventilación abierta, oxígeno.
// opciones.pasos = [fuga, globulo, sintomas, acciones].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, piloto, icono, mover, opacidad, T, aleatorio, pildora } from './fh-base.js';

export const TEXTOS_MONOXIDO = {
  invisible: 'CO: sin color y sin olor', fuga: 'Fisura en el escape', veces: '≈ 200× más fácil que el O₂',
  sintomas: ['mareo', 'dolor de cabeza', 'músculos débiles'], acciones: ['Calefacción cerrada', 'Ventilación abierta', 'Oxígeno, si lo hay'],
  calefaccion: 'CALEF.', abierta: 'ON', cerrada: 'OFF',
};
export const PASOS_MONOXIDO = [0.03, 0.36, 0.5, 0.7];

// Posición de una partícula de CO en su recorrido (f∈[0,1)): sale de la fisura, sube por el conducto y se reparte en
// la cabina. «desvio» separa las partículas entre sí.
export function recorridoCO(f, desvio = 0) {
  if (f < 0.35) { const k = f / 0.35; return { x: 270 + k * 70, y: 478 - k * 8 + desvio * 6 }; }
  if (f < 0.6) { const k = (f - 0.35) / 0.25; return { x: 340 + desvio * 4, y: 470 - k * 110 }; }
  const k = (f - 0.6) / 0.4;
  return { x: 340 + k * (60 + desvio * 220 + 120), y: 360 - k * (40 + desvio * 120) + Math.sin(k * 6 + desvio * 9) * 10 };
}

export function montarFhMonoxido(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_MONOXIDO, opciones);
  const [p0, p1, p2, p3] = opciones.pasos || PASOS_MONOXIDO;
  const rotulos = opciones.rotulos || [
    { texto: X.invisible, desde: p0 + 0.1, hasta: p1 + 0.02, x: 64, y: 190, tono: 'mal' },
    { texto: X.veces, desde: p1 + 0.1, hasta: p3, x: 930, y: 160, tono: 'mal', ancla: 'medio' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    // ----- Corte del morro y la cabina -----
    const corte = svg('g', {}, c);
    svg('path', { d: 'M60 330 C60 270 120 240 200 236 L620 236 L640 640 L120 640 C80 600 60 470 60 330 Z', fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, corte);
    svg('rect', { x: 44, y: 280, width: 12, height: 150, rx: 6, fill: '#64748b' }, corte); // hélice
    svg('rect', { x: 110, y: 300, width: 180, height: 120, rx: 16, fill: '#94a3b8' }, corte); // motor
    for (let k = 0; k < 5; k++) svg('rect', { x: 124 + k * 32, y: 290, width: 20, height: 140, rx: 6, fill: '#64748b' }, corte);
    svg('rect', { x: 326, y: 250, width: 10, height: 380, fill: '#475569' }, corte); // cortafuegos
    svg('path', { d: 'M200 420 L200 478 L600 478', fill: 'none', stroke: '#475569', 'stroke-width': 16, 'stroke-linejoin': 'round' }, corte); // escape
    svg('rect', { x: 230, y: 458, width: 80, height: 40, rx: 10, fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 4 }, corte); // camisa
    const fisura = svg('path', { d: 'M262 472 l6 6 l-4 4 l8 6', fill: 'none', stroke: 'var(--clfh-mal)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, corte);
    svg('path', { d: 'M290 458 L340 458 L340 360 L372 360', fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 10, opacity: 0.35, 'stroke-linejoin': 'round' }, corte); // conducto
    svg('path', { d: 'M440 600 L440 470 C440 440 470 430 500 430 L520 430 L520 600 Z', fill: '#334155' }, corte); // asiento
    const pil = piloto(corte);
    mover(pil.g, 520, 360, 0.95);
    // Perilla de la calefacción.
    const perilla = svg('g', {}, corte);
    svg('circle', { r: 24, fill: '#1e293b' }, perilla);
    const indice = svg('rect', { x: -3, y: -22, width: 6, height: 18, rx: 3, fill: '#fb923c' }, perilla);
    T(perilla, 0, 46, X.calefaccion, { tam: 14, peso: 800, ancla: 'middle', color: 'var(--clfh-tinta-suave)' });
    const estadoPerilla = T(perilla, 0, -34, X.abierta, { tam: 15, peso: 800, ancla: 'middle', color: 'var(--clfh-mal)' });
    mover(perilla, 384, 300);
    const fugaRot = pildora(corte, { texto: X.fuga, x: 270, y: 560, tono: 'mal', ancla: 'medio', tam: 20 });
    const particulas = svg('g', {}, c);
    const az = aleatorio(9);
    const listaP = Array.from({ length: 46 }, () => ({ n: svg('circle', { r: 5, fill: '#64748b', stroke: '#94a3b8', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }, particulas), f: az(), d: az() }));
    const aire = svg('g', {}, c);
    const flechasAire = [0, 1, 2].map(k => svg('path', { d: 'M0 0 h46 l-10 -9 M46 0 l-10 9', fill: 'none', stroke: '#38bdf8', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `translate(0 ${k * 30})` }, aire));

    // ----- Glóbulo rojo -----
    const globulo = svg('g', {}, c);
    svg('ellipse', { rx: 210, ry: 108, fill: '#dc2626' }, globulo);
    svg('ellipse', { rx: 150, ry: 62, fill: '#b91c1c' }, globulo);
    const asientos = [-105, -35, 35, 105].map(x => { svg('circle', { cx: x, cy: 0, r: 30, fill: '#fecaca', opacity: 0.5 }, globulo); return x; });
    const molecula = (padre, co) => {
      const g = svg('g', {}, padre);
      if (co) { svg('circle', { cx: -11, r: 15, fill: '#334155' }, g); svg('circle', { cx: 13, r: 15, fill: '#ef4444' }, g); T(g, -11, 6, 'C', { tam: 15, peso: 800, ancla: 'middle', color: '#fff' }); T(g, 13, 6, 'O', { tam: 15, peso: 800, ancla: 'middle', color: '#fff' }); }
      else { svg('circle', { cx: -12, r: 15, fill: '#38bdf8' }, g); svg('circle', { cx: 12, r: 15, fill: '#38bdf8' }, g); T(g, 0, 6, 'O₂', { tam: 15, peso: 800, ancla: 'middle', color: '#0c4a6e' }); }
      return g;
    };
    const o2 = asientos.map(() => molecula(globulo, false));
    const co = asientos.map(() => molecula(globulo, true));

    const sintomas = svg('g', {}, c);
    const listaS = ['mareo', 'dolor', 'musculo'].map((nombre, i) => { const g = svg('g', {}, sintomas); icono(g, nombre, { r: 40, trazo: 'var(--clfh-mal)' }); T(g, 0, 70, X.sintomas[i] || '', { tam: 19, peso: 700, ancla: 'middle' }); return g; });
    const acciones = svg('g', {}, c);
    const listaA = ['calor', 'ventila', 'mascara'].map((nombre, i) => {
      const g = svg('g', {}, acciones);
      svg('rect', { x: -40, y: -46, width: 520, height: 92, rx: 46, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, g);
      icono(g, nombre, { r: 34, fondo: i === 0 ? 'var(--clfh-mal)' : 'var(--clfh-bien)', trazo: '#ffffff', borde: 'transparent' });
      T(g, 56, 10, X.acciones[i] || '', { tam: 28, peso: 800 });
      return g;
    });

    return m => {
      const t = m.t;
      opacidad(corte, m.e(0, p0 + 0.04));
      opacidad(fisura, 0.5 + 0.5 * Math.abs(m.onda(1.2)));
      opacidad(fugaRot.g, m.e(p0 + 0.04, p0 + 0.08) * (1 - m.e(p1, p1 + 0.03)));
      // Partículas: fluyen mientras la calefacción está abierta y se van con la ventilación.
      const cerrar = m.e(p3 + 0.02, p3 + 0.06), ventilar = m.e(p3 + 0.1, p3 + 0.2);
      listaP.forEach(p => {
        const f = (p.f + m.s * 0.07) % 1;
        const pos = recorridoCO(f, p.d);
        p.n.setAttribute('cx', f1(pos.x + ventilar * 260)); p.n.setAttribute('cy', f1(pos.y - ventilar * 40));
        opacidad(p.n, m.e(p0 + 0.02, p0 + 0.08) * (0.35 + 0.25 * Math.sin(m.s * 2 + p.d * 7)) * (1 - ventilar) * (f > 0.6 || cerrar < 1 ? 1 : 0));
      });
      indice.setAttribute('transform', `rotate(${f1(-90 * cerrar)})`);
      estadoPerilla.textContent = cerrar > 0.5 ? X.cerrada : X.abierta;
      estadoPerilla.setAttribute('fill', cerrar > 0.5 ? 'var(--clfh-bien)' : 'var(--clfh-mal)');
      flechasAire.forEach((f, k) => f.setAttribute('transform', `translate(${f1(((m.s * 120 + k * 50) % 160))} ${k * 30})`));
      mover(aire, 420, 270); opacidad(aire, m.e(p3 + 0.08, p3 + 0.12));
      // Glóbulo: el CO desplaza al O₂.
      const vg = m.e(p1, p1 + 0.04), fuera = m.e(p3 - 0.02, p3 + 0.03);
      mover(globulo, 930, 330, 0.8 + 0.2 * vg); opacidad(globulo, vg * (1 - fuera));
      asientos.forEach((x, k) => {
        const cambio = m.e(p1 + 0.04 + k * 0.025, p1 + 0.07 + k * 0.025);
        mover(o2[k], x + cambio * (k < 2 ? -40 : 40), -cambio * 150); opacidad(o2[k], 1 - cambio);
        mover(co[k], x + (1 - cambio) * 260, (1 - cambio) * -120); opacidad(co[k], cambio);
      });
      listaS.forEach((g, k) => { const a = m.e(p2 + k * 0.03, p2 + 0.04 + k * 0.03) * (1 - fuera); mover(g, 760 + k * 175, 560 + (1 - a) * 20); opacidad(g, a); });
      listaA.forEach((g, k) => { const a = m.e(p3 + 0.02 + k * 0.07, p3 + 0.06 + k * 0.07); mover(g, 740 + (1 - a) * 40, 280 + k * 130); opacidad(g, a); });
      void t; void acciones;
    };
  });
}
