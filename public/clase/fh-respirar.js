// Escena «Respirar demasiado»: pulmones que se inflan muy rápido, la barra de CO₂ que baja a rojo y hormigueo en
// los dedos; luego la respiración se calma con un metrónomo lento, hablar en voz alta o una bolsa, y la barra vuelve
// a verde. opciones.pasos = [rapido, bajaCO2, calma].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, mover, opacidad, T, icono, tramo, salida } from './fh-base.js';

export const TEXTOS_RESPIRAR = {
  rapido: 'Miedo o tensión: respiras muy rápido', baja: 'Se va mucho CO₂: hormigueo y mareo', despacio: 'Respira despacio',
  habla: '¡Habla en voz alta!', bolsa: 'o respira en una bolsa', co2: 'CO₂', hormigueo: 'hormigueo',
};
export const PASOS_RESPIRAR = [0.03, 0.42, 0.63];

// Fase de la respiración (en ciclos) a los s segundos: rápida hasta «cambio» y lenta después, con un paso suave de
// «transicion» segundos. Es la integral de la frecuencia, así el dibujo no salta al cambiar de ritmo.
export function faseRespiracion(s, cambio, rapida = 0.75, lenta = 0.14, transicion = 3) {
  if (s <= cambio) return rapida * s;
  const base = rapida * cambio, d = s - cambio;
  if (d <= transicion) return base + rapida * d + ((lenta - rapida) * d * d) / (2 * transicion);
  return base + ((rapida + lenta) / 2) * transicion + lenta * (d - transicion);
}

// Nivel de CO₂ (0..1; verde por encima de 0,45): normal, baja en la hiperventilación y se recupera al calmarse.
export function nivelCO2(t, inicioBaja, inicioCalma) {
  const baja = salida(tramo(t, inicioBaja - 0.15, inicioBaja + 0.12));
  const sube = salida(tramo(t, inicioCalma + 0.05, 0.98));
  return 0.68 - 0.5 * baja + 0.5 * sube * baja;
}

function pulmon(padre, lado) {
  const g = svg('g', {}, padre);
  const d = 'M-14 -110 C-60 -110 -120 -40 -126 40 C-130 100 -110 140 -60 136 C-30 134 -18 110 -16 70 Z';
  svg('path', { d, fill: '#fb7185', stroke: '#e11d48', 'stroke-width': 4, transform: lado > 0 ? 'scale(-1 1)' : null }, g);
  for (const [a, b] of [[-40, -30], [-70, 10], [-50, 50], [-90, 70]]) svg('path', { d: `M-18 -60 Q${a} ${b - 20} ${a - 14} ${b}`, fill: 'none', stroke: '#be123c', 'stroke-width': 3, opacity: 0.6, transform: lado > 0 ? 'scale(-1 1)' : null }, g);
  return g;
}

export function montarFhRespirar(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_RESPIRAR, opciones);
  const [p0, p1, p2] = opciones.pasos || PASOS_RESPIRAR;
  const rotulos = opciones.rotulos || [
    { texto: X.rapido, desde: p0 + 0.05, hasta: p1, x: 64, y: 190, tono: 'naranja' },
    { texto: X.baja, desde: p1 + 0.02, hasta: p2, x: 64, y: 190, tono: 'mal' },
    { texto: X.despacio, desde: p2 + 0.03, x: 64, y: 190, tono: 'bien' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    // Barra de CO₂.
    const barra = svg('g', {}, c);
    svg('rect', { x: -44, y: -230, width: 88, height: 460, rx: 44, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, barra);
    svg('rect', { x: -22, y: -200, width: 44, height: 400, rx: 22, fill: 'var(--clfh-borde)' }, barra);
    svg('line', { x1: -34, x2: 34, y1: 200 - 0.45 * 400, y2: 200 - 0.45 * 400, stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 3, 'stroke-dasharray': '6 5' }, barra);
    const nivel = svg('rect', { x: -22, width: 44, rx: 22 }, barra);
    T(barra, 0, 264, X.co2, { tam: 28, peso: 850, ancla: 'middle' });
    mover(barra, 170, 420);
    // Pulmones.
    const torax = svg('g', {}, c);
    svg('circle', { r: 230, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, torax);
    svg('path', { d: 'M0 -190 L0 -100 M0 -100 L-30 -70 M0 -100 L30 -70', stroke: '#e11d48', 'stroke-width': 16, 'stroke-linecap': 'round', fill: 'none' }, torax);
    const izq = pulmon(torax, -1), der = pulmon(torax, 1);
    const ritmo = T(torax, 0, 200, '', { tam: 22, peso: 800, ancla: 'middle', color: 'var(--clfh-tinta-suave)' });
    mover(torax, 600, 430);
    // Mano con hormigueo.
    const mano = svg('g', {}, c);
    svg('circle', { r: 120, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, mano);
    svg('path', { d: 'M-40 80 L-44 0 C-46 -20 -30 -22 -28 -4 L-26 -60 C-26 -76 -8 -76 -8 -60 L-8 -74 C-8 -90 10 -90 10 -74 L10 -64 C10 -80 28 -80 28 -64 L28 -40 C28 -54 44 -54 44 -40 L44 30 C44 60 30 80 10 84 Z', fill: 'var(--clfh-piel)', stroke: '#b9805c', 'stroke-width': 4, 'stroke-linejoin': 'round' }, mano);
    const chispas = [[-28, -84], [0, -100], [28, -88], [52, -58], [-56, -24]].map(([x, y]) => svg('path', { d: `M${x} ${y} l6 -10 l4 8 l6 -12`, fill: 'none', stroke: 'var(--clfh-ambar)', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mano));
    T(mano, 0, 112, X.hormigueo, { tam: 18, peso: 750, ancla: 'middle', color: 'var(--clfh-ambar)' });
    // Metrónomo y ayudas.
    const metro = svg('g', {}, c);
    svg('path', { d: 'M-70 110 L-40 -110 L40 -110 L70 110 Z', fill: '#7c4a24', stroke: '#5b3417', 'stroke-width': 4, 'stroke-linejoin': 'round' }, metro);
    svg('rect', { x: -48, y: 60, width: 96, height: 34, rx: 6, fill: '#f4ead8' }, metro);
    const brazo = svg('g', {}, metro);
    svg('line', { x1: 0, y1: 70, x2: 0, y2: -120, stroke: '#e5e7eb', 'stroke-width': 6, 'stroke-linecap': 'round' }, brazo);
    svg('rect', { x: -12, y: -60, width: 24, height: 22, rx: 4, fill: '#fb923c' }, brazo);
    const ayudas = svg('g', {}, c);
    const burbuja = svg('g', {}, ayudas);
    svg('path', { d: 'M-150 -46 H150 Q170 -46 170 -26 V26 Q170 46 150 46 H-60 L-90 76 L-84 46 H-150 Q-170 46 -170 26 V-26 Q-170 -46 -150 -46 Z', fill: 'var(--clfh-tarjeta)', stroke: 'var(--clfh-bien)', 'stroke-width': 4, class: 'clase-fh-sombra' }, burbuja);
    T(burbuja, 0, 11, X.habla, { tam: 28, peso: 850, ancla: 'middle' });
    const ondas = [0, 1, 2].map(k => svg('path', { d: `M${180 + k * 16} -20 Q${196 + k * 16} 0 ${180 + k * 16} 20`, fill: 'none', stroke: 'var(--clfh-bien)', 'stroke-width': 4, 'stroke-linecap': 'round' }, burbuja));
    const bolsa = svg('g', {}, ayudas);
    icono(bolsa, 'bolsa', { r: 40, trazo: 'var(--clfh-ambar)' });
    T(bolsa, 56, 9, X.bolsa, { tam: 24, peso: 700 });

    return m => {
      const t = m.t, s = m.s;
      const fase = ctx.quieto ? (t < p2 ? 0.5 : 0.25) : faseRespiracion(s, p2 * ctx.duracion);
      const aire = 0.5 - 0.5 * Math.cos(2 * Math.PI * fase);
      const amp = t < p2 ? 0.14 : 0.1;
      izq.setAttribute('transform', `translate(-14 0) scale(${(1 + aire * amp).toFixed(3)} ${(1 + aire * amp * 0.8).toFixed(3)})`);
      der.setAttribute('transform', `translate(14 0) scale(${(1 + aire * amp).toFixed(3)} ${(1 + aire * amp * 0.8).toFixed(3)})`);
      const calma = m.e(p2, p2 + 0.08);
      ritmo.textContent = t < p2 ? '≈ 45 / min' : '≈ 8–10 / min';
      ritmo.setAttribute('fill', t < p2 ? 'var(--clfh-mal)' : 'var(--clfh-bien)');
      opacidad(torax, m.e(0, p0 + 0.04));
      const v = nivelCO2(t, p1, p2);
      nivel.setAttribute('y', f1(200 - v * 400)); nivel.setAttribute('height', f1(v * 400));
      nivel.setAttribute('fill', v < 0.45 ? 'var(--clfh-mal)' : 'var(--clfh-bien)');
      opacidad(barra, m.e(p0 + 0.04, p0 + 0.09));
      // Hormigueo durante la baja de CO₂.
      const vm = m.e(p1, p1 + 0.04) * (1 - m.e(p2 - 0.01, p2 + 0.03));
      mover(mano, 1040, 420, 0.9 + 0.1 * vm); opacidad(mano, vm);
      chispas.forEach((ch, k) => opacidad(ch, ctx.quieto ? 1 : Math.max(0, Math.sin(s * 9 + k * 1.7))));
      // Calma: metrónomo al ritmo lento, burbuja y bolsa.
      mover(metro, 1080, 370, 0.95); opacidad(metro, calma);
      brazo.setAttribute('transform', `rotate(${f1(Math.sin(2 * Math.PI * fase) * 24 * calma)} 0 70)`);
      const vb = m.e(p2 + 0.1, p2 + 0.14), vbo = m.e(p2 + 0.22, p2 + 0.26);
      mover(burbuja, 800, 150 + (1 - vb) * 20); opacidad(burbuja, vb);
      ondas.forEach((o, k) => opacidad(o, vb * (0.3 + 0.7 * Math.max(0, Math.sin(s * 5 - k)))));
      mover(bolsa, 860, 640 + (1 - vbo) * 20); opacidad(bolsa, vbo);
    };
  });
}
