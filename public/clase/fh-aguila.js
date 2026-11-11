// Escena «El pájaro y el piloto»: un águila planea al amanecer y «siente» la velocidad y la inclinación; se convierte
// en una avioneta y sube el panel con tres instrumentos que aparecen uno a uno.
// API: montarFhAguila(contenedor, opciones) → ver fh-base.js. opciones.pasos = [vuelaAve, cambio, panel, cierre] (0..1).

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, nube, avioneta, instrumento, mover, opacidad, T, degradado, ANCHO, ALTO } from './fh-base.js';

export const TEXTOS_AGUILA = {
  velocidad: 'Siente la velocidad', inclinacion: 'Siente la inclinación', instrumentos: 'El piloto usa instrumentos',
  cierre: 'Tu cuerpo y tu mente en vuelo', velocimetro: 'VELOCIDAD', actitud: 'ACTITUD', altimetro: 'ALTITUD',
};
export const PASOS_AGUILA = [0.04, 0.43, 0.53, 0.8];

// Silueta de águila planeando, vista de lado, mirando a la derecha y centrada en (0,0).
export function dibujarAve(padre, color = 'var(--clfh-silueta)') {
  const g = svg('g', { class: 'clase-fh-ave' }, padre);
  const lejos = svg('path', { d: 'M20 4 C0 20 -30 40 -70 54 L-86 52 L-74 46 L-92 44 L-74 37 C-50 26 -20 12 0 2 Z', fill: color, opacity: 0.6 }, g);
  svg('path', { d: 'M70 -6 C60 -16 40 -14 20 -10 C-10 -6 -40 -4 -64 -2 L-100 -12 L-94 4 L-104 16 L-62 8 C-30 12 10 14 34 10 C50 8 62 4 70 -6 Z', fill: color }, g);
  svg('circle', { cx: 64, cy: -9, r: 12, fill: color }, g);
  svg('path', { d: 'M72 -15 C82 -16 90 -12 90 -4 C86 -8 80 -8 74 -4 Z', fill: 'var(--clfh-naranja)' }, g);
  svg('circle', { cx: 68, cy: -12, r: 2.2, fill: 'var(--clfh-cielo-1)' }, g);
  const cerca = svg('path', { d: 'M32 -10 C12 -42 -22 -84 -62 -116 L-68 -108 L-84 -118 L-86 -104 L-102 -110 L-100 -96 L-118 -98 L-108 -84 C-84 -62 -44 -30 -10 -6 Z', fill: color }, g);
  return { g, cerca, lejos };
}

// Dónde va el ave en t (planea de izquierda a derecha con un vaivén suave).
export function posicionAve(t) {
  const x = 300 + t * 900;
  return { x, y: 300 - Math.sin(t * Math.PI * 2.2) * 26, inclinacion: Math.sin(t * Math.PI * 3) * 12 };
}

export function montarFhAguila(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_AGUILA, opciones);
  const [p0, p1, p2, p3] = opciones.pasos || PASOS_AGUILA;
  const rotulos = opciones.rotulos || [
    { texto: X.velocidad, desde: p0 + 0.08, hasta: p1, x: 760, y: 600, tono: 'azul' },
    { texto: X.inclinacion, desde: p0 + 0.2, hasta: p1, x: 760, y: 668, tono: 'naranja' },
    { texto: X.instrumentos, desde: p2 + 0.05, hasta: p3 + 0.02, x: 64, y: 190, tono: 'naranja' },
    { texto: X.cierre, desde: p3 + 0.02, x: 64, y: 190, tono: 'bien' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx, { arriba: 'var(--clfh-cielo-1)', abajo: 'var(--clfh-cielo-3)' });
    svg('circle', { cx: 1010, cy: 520, r: 260, fill: degradado(ctx, [[0, '#ffd59a', 0.95], [0.4, '#ffb46b', 0.45], [1, '#ff9a4a', 0]], { radial: true }) }, c);
    const nubes = svg('g', {}, c);
    const listaNubes = [[180, 150, 0.8], [620, 110, 0.6], [980, 180, 0.9], [1320, 130, 0.7]].map(([x, y, e]) => ({ g: nube(nubes, 0, 0, e, 'var(--clfh-nube)', 0.75), x, y }));
    const sierra = (pts, color) => { const d = [0, 1280].map(dx => pts.map(([x, y], k) => `${k ? 'L' : (dx ? 'L' : 'M')}${x + dx} ${y}`).join(' ')).join(' '); return svg('path', { d: `${d} L2560 720 L0 720 Z`, fill: color }, c); };
    const montes2 = sierra([[0, 450], [120, 430], [230, 480], [380, 380], [520, 470], [640, 400], [780, 470], [920, 390], [1060, 460], [1180, 410], [1280, 450]], 'var(--clfh-monte-1)');
    const montes1 = sierra([[0, 570], [160, 520], [300, 580], [470, 500], [620, 570], [780, 510], [960, 590], [1120, 520], [1280, 570]], 'var(--clfh-monte-2)');

    // Ave y sus «sentidos»: líneas de velocidad y arco de inclinación.
    const grupoAve = svg('g', {}, c);
    const lineas = svg('g', {}, grupoAve);
    const rayas = [-30, 0, 30].map(dy => svg('line', { x1: -320, x2: -190, y1: dy, y2: dy, stroke: 'var(--clfh-azul)', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': '26 18' }, lineas));
    const arco = svg('g', {}, grupoAve);
    svg('path', { d: 'M-130 90 A160 160 0 0 0 130 90', fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 3.5, 'stroke-dasharray': '6 8' }, arco);
    const marca = svg('circle', { r: 8, fill: 'var(--clfh-naranja)' }, arco);
    const ave = dibujarAve(grupoAve);
    mover(ave.g, 0, 0, 1.35);

    // Avioneta (aparece donde estaba el ave).
    const grupoAvion = svg('g', {}, c);
    const destello = svg('circle', { r: 120, fill: 'none', stroke: 'var(--clfh-tarjeta)', 'stroke-width': 6 }, grupoAvion);
    const avion = svg('g', {}, grupoAvion);
    avioneta(avion);

    // Panel de cabina con tres instrumentos.
    const panel = svg('g', {}, c);
    svg('rect', { x: 250, y: 0, width: 780, height: 280, rx: 36, fill: 'var(--clfh-cabina-2)' }, panel);
    svg('rect', { x: 250, y: 0, width: 780, height: 10, rx: 5, fill: 'var(--clfh-cabina-3)' }, panel);
    const nombres = [X.velocimetro, X.actitud, X.altimetro];
    const inst = ['velocidad', 'actitud', 'altitud'].map((tipo, i) => {
      const g = svg('g', {}, panel);
      const ins = instrumento(ctx, g, tipo, { r: 84 });
      T(g, 0, 128, nombres[i], { tam: 18, peso: 750, color: '#c9d5e8', ancla: 'middle', espacio: 2 });
      return { g, ins, x: 410 + i * 230 };
    });

    return m => {
      const t = m.t;
      listaNubes.forEach((n, i) => mover(n.g, ((n.x - m.s * (8 + i * 3)) % 1500 + 1500) % 1500 - 120, n.y + 90));
      mover(montes2, -((m.s * 6) % 1280), 0); mover(montes1, -((m.s * 12) % 1280), 0);

      const cambio = m.e(p1, p1 + 0.06);
      const pa = posicionAve(Math.min(t, p1 + 0.06) / (p1 + 0.06));
      const xAve = 280 + (pa.x - 300) * 0.55, yAve = pa.y + 70;
      mover(grupoAve, xAve, yAve, 1 - cambio * 0.4, pa.inclinacion * (1 - cambio));
      opacidad(grupoAve, m.e(0, p0 + 0.03) * (1 - cambio));
      opacidad(lineas, m.e(p0 + 0.06, p0 + 0.1));
      rayas.forEach(r => r.setAttribute('stroke-dashoffset', f1(-m.s * 60)));
      opacidad(arco, m.e(p0 + 0.18, p0 + 0.22));
      const ang = Math.PI / 2 - (pa.inclinacion / 60);
      marca.setAttribute('cx', f1(Math.cos(ang) * 160 * (pa.inclinacion > 0 ? 1 : 1)));
      marca.setAttribute('cy', f1(Math.sin(ang) * 160 - 70));
      const aleteo = m.onda(4.2) * 5;
      ave.cerca.setAttribute('transform', `rotate(${f1(aleteo)} 20 -8)`);
      ave.lejos.setAttribute('transform', `rotate(${f1(-aleteo * 0.6)} 10 4)`);

      // Avioneta: aparece y sube un poco cuando llega el panel.
      const ap = m.e(p1, p1 + 0.07), sube = m.e(p2, p2 + 0.06);
      const xAv = xAve + (t - p1) * 260 * (1 - sube) + sube * (640 - xAve);
      mover(grupoAvion, xAv, yAve - sube * 40 + m.onda(5) * 5);
      opacidad(grupoAvion, ap);
      mover(avion, 0, 0, 1.25 + ap * 0.35, -3 + m.onda(6) * 2);
      const flash = m.lin(p1, p1 + 0.05);
      destello.setAttribute('r', f1(40 + flash * 160));
      opacidad(destello, flash > 0 && flash < 1 ? 1 - flash : 0);

      // Panel.
      const pan = m.e(p2, p2 + 0.06);
      mover(panel, 0, ALTO + 20 - pan * 300);
      inst.forEach((it, i) => {
        const a = m.e(p2 + 0.04 + i * 0.05, p2 + 0.08 + i * 0.05);
        mover(it.g, it.x, 140, 0.6 + 0.4 * a);
        opacidad(it.g, a);
        const vivo = m.lin(p2 + 0.04 + i * 0.05, 1);
        if (i === 0) it.ins.poner(20 + Math.min(1, vivo * 3) * 85 + m.onda(3.3) * 2);
        if (i === 1) it.ins.poner({ alabeo: m.onda(9) * 12, cabeceo: 2 + m.onda(7) * 2 });
        if (i === 2) it.ins.poner(1200 + vivo * 2300);
      });
      void ANCHO;
    };
  });
}
