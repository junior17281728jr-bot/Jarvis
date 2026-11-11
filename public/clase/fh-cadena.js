// Escena «El factor humano»: una línea de tiempo del biplano al avión moderno, un anillo que se llena hasta el
// 75 % (factores humanos) y una fila de fichas de dominó que caen en cadena.
// opciones.pasos = [lineaTiempo, porcentaje, domino]; opciones.porcentaje (75 por defecto).

import { svg, f1, limitar } from './comun.js';
import { montarFH, textosDe, fondoCielo, avioneta, mover, opacidad, T, icono, salida, tramo } from './fh-base.js';

export const TEXTOS_CADENA = {
  epocas: ['1920', '1950', '1980', 'Hoy'], fiables: 'Aviones cada vez más fiables', persona: 'Lo que no cambia: la persona',
  factores: 'factores humanos', cadena: 'Una cadena de pequeñas decisiones', accidentes: 'de los accidentes',
};
export const PASOS_CADENA = [0.02, 0.41, 0.8];

// Ángulo (grados) de la ficha k de n cuando la cadena empieza a caer en «inicio» y cada ficha tarda «paso» en
// empujar a la siguiente. Se apoya sobre la siguiente (tope) y la última cae del todo.
export function anguloDomino(k, n, t, inicio, paso, { separacion = 70, alto = 120 } = {}) {
  const tope = k === n - 1 ? 90 : (Math.asin(Math.min(1, separacion / alto)) * 180) / Math.PI;
  const f = tramo(t, inicio + k * paso, inicio + (k + 1.4) * paso);
  return tope * f * f;
}

// Número que muestra el contador: sube hasta «meta» con una curva que frena al final.
export const contador = (t, a, b, meta) => Math.round(meta * salida(tramo(t, a, b)));

function biplano(padre) {
  const g = svg('g', {}, padre);
  svg('path', { d: 'M-60 -2 C-30 -10 30 -10 50 -4 C58 -2 58 6 50 8 C20 12 -30 10 -60 4 Z', fill: '#c98a4b' }, g);
  svg('rect', { x: -22, y: -34, width: 60, height: 6, rx: 3, fill: '#e2b47c' }, g);
  svg('rect', { x: -26, y: 8, width: 64, height: 6, rx: 3, fill: '#e2b47c' }, g);
  svg('path', { d: 'M-10 -28 L-10 8 M24 -28 L24 8', stroke: '#6b4a2a', 'stroke-width': 2.5 }, g);
  svg('path', { d: 'M-60 -2 L-74 -22 L-62 -22 L-52 -4', fill: '#c98a4b' }, g);
  svg('rect', { x: 56, y: -18, width: 3, height: 36, fill: '#3a2a1a', opacity: 0.6 }, g);
  return g;
}

export function montarFhCadena(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_CADENA, opciones);
  const [p0, p1, p2] = opciones.pasos || PASOS_CADENA;
  const meta = Number(opciones.porcentaje) || 75;
  const rotulos = opciones.rotulos || [
    { texto: X.fiables, desde: p0 + 0.1, hasta: p1, x: 64, y: 210, tono: 'azul' },
    { texto: X.persona, desde: p1 + 0.04, hasta: p2, x: 64, y: 210, tono: 'naranja' },
    { texto: X.cadena, desde: p2 + 0.02, x: 64, y: 210, tono: 'mal' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    // Línea de tiempo.
    const linea = svg('g', {}, c);
    svg('line', { x1: 120, x2: 1160, y1: 560, y2: 560, stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 4, 'stroke-linecap': 'round' }, linea);
    const xs = [160, 480, 800, 1120];
    X.epocas.forEach((ep, i) => {
      svg('circle', { cx: xs[i], cy: 560, r: 9, fill: 'var(--clfh-tarjeta)', stroke: 'var(--clfh-naranja)', 'stroke-width': 4 }, linea);
      T(linea, xs[i], 604, ep, { tam: 24, peso: 750, ancla: 'middle', color: 'var(--clfh-tinta-suave)' });
    });
    const iconosViejos = svg('g', {}, linea);
    const humo = [0, 1, 2].map(k => svg('circle', { r: 10 + k * 4, fill: '#6b7280', opacity: 0.5 }, iconosViejos));
    const iconosNuevos = svg('g', {}, linea);
    const torre = svg('g', {}, iconosNuevos);
    svg('path', { d: 'M-14 0 L-8 -90 L8 -90 L14 0 Z', fill: 'var(--clfh-tinta-suave)' }, torre);
    svg('path', { d: 'M-26 -90 L26 -90 L20 -118 L-20 -118 Z', fill: 'var(--clfh-azul)' }, torre);
    mover(torre, 1200, 548);
    const radar = svg('g', {}, iconosNuevos);
    svg('circle', { r: 46, fill: 'none', stroke: 'var(--clfh-bien)', 'stroke-width': 2, opacity: 0.6 }, radar);
    svg('circle', { r: 26, fill: 'none', stroke: 'var(--clfh-bien)', 'stroke-width': 2, opacity: 0.6 }, radar);
    const barrido = svg('path', { d: 'M0 0 L46 0 A46 46 0 0 0 32 -33 Z', fill: 'var(--clfh-bien)', opacity: 0.45 }, radar);
    mover(radar, 1060, 430);
    const viejo = biplano(c), nuevo = svg('g', {}, c);
    avioneta(nuevo);

    // Anillo del porcentaje.
    const anillo = svg('g', {}, c);
    const R = 128, L = 2 * Math.PI * R;
    svg('circle', { r: R + 34, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, anillo);
    svg('circle', { r: R, fill: 'none', stroke: 'var(--clfh-borde)', 'stroke-width': 30 }, anillo);
    const arco = svg('circle', { r: R, fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 30, 'stroke-linecap': 'round', transform: 'rotate(-90)', 'stroke-dasharray': `0 ${f1(L)}` }, anillo);
    const numero = T(anillo, 0, 30, '0 %', { tam: 76, peso: 850, ancla: 'middle' });
    T(anillo, 0, 66, X.accidentes, { tam: 20, peso: 600, ancla: 'middle', color: 'var(--clfh-tinta-suave)' });
    const persona = svg('g', {}, anillo);
    svg('circle', { cx: 0, cy: -84, r: 11, fill: 'var(--clfh-naranja)' }, persona);
    svg('path', { d: 'M-16 -58 C-16 -72 16 -72 16 -58 Z', fill: 'var(--clfh-naranja)' }, persona);
    const etiqueta = svg('g', {}, anillo);
    svg('rect', { x: -120, y: R + 52, width: 240, height: 48, rx: 24, fill: 'var(--clfh-naranja)' }, etiqueta);
    T(etiqueta, 0, R + 84, X.factores, { tam: 24, peso: 800, ancla: 'middle', color: '#1c1003' });

    // Dominó.
    const N = 8, SEP = 108, ALTO_F = 150;
    const domino = svg('g', {}, c);
    svg('rect', { x: 150, y: 640, width: 980, height: 10, rx: 5, fill: 'var(--clfh-tinta-suave)', opacity: 0.5 }, domino);
    const fichas = Array.from({ length: N }, (_, k) => {
      const g = svg('g', {}, domino);
      const ultimo = k === N - 1;
      svg('rect', { x: -36, y: -ALTO_F, width: 36, height: ALTO_F, rx: 6, fill: ultimo ? 'var(--clfh-mal)' : 'var(--clfh-cabina-2)', stroke: 'var(--clfh-tarjeta)', 'stroke-width': 3 }, g);
      for (const yy of [-ALTO_F * 0.72, -ALTO_F * 0.28]) svg('circle', { cx: -18, cy: yy, r: 5, fill: '#ffffff' }, g);
      svg('line', { x1: -30, x2: -6, y1: -ALTO_F / 2, y2: -ALTO_F / 2, stroke: '#ffffff', 'stroke-width': 2 }, g);
      return { g, x: 200 + k * SEP };
    });
    const choque = icono(domino, 'mal', { r: 30, fondo: 'var(--clfh-mal)', trazo: '#ffffff', borde: 'var(--clfh-tarjeta)' });

    return m => {
      const t = m.t;
      // 1) Línea de tiempo: el avión avanza y cambia de biplano a avión moderno.
      const lt = m.lin(p0, p1 - 0.04), salidaLinea = m.e(p1 - 0.02, p1 + 0.04);
      mover(linea, 0, salidaLinea * 40);
      opacidad(linea, m.e(p0, p0 + 0.04) * (1 - salidaLinea));
      const xa = 160 + lt * 960, ya = 470 + m.onda(2.5) * 6;
      const cambio = limitar((lt - 0.45) / 0.15, 0, 1);
      mover(viejo, xa, ya, 1.2, m.onda(1.3) * 4 * (1 - cambio)); opacidad(viejo, (1 - cambio) * (1 - salidaLinea));
      mover(nuevo, xa, ya, 0.95); opacidad(nuevo, cambio * (1 - salidaLinea));
      humo.forEach((h, k) => { const f = ((m.s * 0.8 + k / 3) % 1); h.setAttribute('cx', f1(xa - 60 - f * 70)); h.setAttribute('cy', f1(ya - 10 - f * 30)); opacidad(h, (1 - f) * 0.6 * (1 - cambio)); });
      opacidad(iconosNuevos, tramo(lt, 0.6, 0.8));
      barrido.setAttribute('transform', `rotate(${f1(m.s * 120)})`);

      // 2) Anillo 75 %.
      const ap = m.e(p1, p1 + 0.05), sale = m.e(p2 - 0.02, p2 + 0.04);
      mover(anillo, 860 + sale * 140, 330 - sale * 70, (0.8 + 0.2 * ap) * (1 - sale * 0.38));
      opacidad(anillo, ap);
      const v = contador(t, p1 + 0.04, p1 + 0.24, meta);
      numero.textContent = `${v} %`;
      arco.setAttribute('stroke-dasharray', `${f1((v / 100) * L)} ${f1(L)}`);
      opacidad(etiqueta, m.e(p1 + 0.22, p1 + 0.26));

      // 3) Dominó: aparecen de pie y caen en cadena.
      opacidad(domino, m.e(p2 - 0.03, p2 + 0.01));
      const paso = (1 - p2 - 0.06) / (N + 1.5);
      fichas.forEach((f, k) => {
        const ang = anguloDomino(k, N, t, p2 + 0.04, paso, { separacion: SEP - 36, alto: ALTO_F });
        f.g.setAttribute('transform', `translate(${f.x + 36} 640) rotate(${f1(ang)}) `);
      });
      const fin = m.e(1 - paso * 0.8, 1);
      mover(choque, 200 + (N - 1) * SEP + 150, 520, 0.4 + 0.6 * fin); opacidad(choque, fin);
    };
  });
}
