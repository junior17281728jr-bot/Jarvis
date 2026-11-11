// Escena «Tus ojos en el cielo»: corte del ojo con la luz que llega a la retina, ampliación de la retina (conos en
// el centro, bastones alrededor), interruptor día/noche, mirar un poco al lado de noche y barrer por sectores.
// opciones.pasos = [conos, bastones, noche, mirarAlLado, sectores].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, mover, opacidad, T, degradado, icono, ANCHO, ALTO, tramo, aleatorio } from './fh-base.js';

export const TEXTOS_OJO = {
  conos: 'Conos · color y detalle, de día', bastones: 'Bastones · ven de noche y a los lados', noche: 'De noche trabajan los bastones',
  lado: 'De noche, mira un poco al lado', sectores: 'Barre el cielo por sectores', centro: 'centro', periferia: 'periferia',
  dia: 'Día', nocheCorto: 'Noche',
};
export const PASOS_OJO = [0.03, 0.24, 0.47, 0.68, 0.81];

// Tipo de célula en la posición u∈[0,1] de la tira de retina (0,5 es el centro): solo conos en el centro y cada vez
// más bastones hacia los lados.
export function celulaRetina(u, azar = 0.5) {
  const lejos = Math.abs(u - 0.5) * 2; // 0 en el centro, 1 en el borde
  if (lejos < 0.2) return 'cono';
  return azar < 0.12 + (1 - lejos) * 0.25 ? 'cono' : 'baston';
}

// Dónde mira el ojo en el barrido por sectores: salta al centro de cada sector y se queda quieto un rato.
export function miradaSectores(f, sectores = 6) {
  const pos = Math.min(sectores - 1e-6, Math.max(0, f) * sectores);
  const k = Math.floor(pos), dentro = pos - k;
  const salto = Math.min(1, dentro / 0.25); // 25 % del tiempo moviéndose, 75 % quieto
  const desde = Math.max(0, k - 1), suave = salto * salto * (3 - 2 * salto);
  return { sector: k, x: (k === 0 ? 0 : desde + suave) + 0.5 };
}

export function montarFhOjo(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_OJO, opciones);
  const [p0, p1, p2, p3, p4] = opciones.pasos || PASOS_OJO;
  const rotulos = opciones.rotulos || [
    { texto: X.conos, desde: p0 + 0.07, hasta: p3 - 0.01, x: 925, y: 590, tono: 'ambar', ancla: 'medio' },
    { texto: X.bastones, desde: p1 + 0.02, hasta: p3 - 0.01, x: 925, y: 262, tono: 'azul', ancla: 'medio' },
    { texto: X.noche, desde: p2 + 0.03, hasta: p3, x: 64, y: 190, tono: 'azul' },
    { texto: X.lado, desde: p3 + 0.04, hasta: p4, x: 925, y: 600, tono: 'naranja', ancla: 'medio' },
    { texto: X.sectores, desde: p4 + 0.02, x: 925, y: 600, tono: 'bien', ancla: 'medio' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    const dia = svg('rect', { width: ANCHO, height: ALTO, fill: degradado(ctx, [[0, 'var(--clfh-cielo-1)'], [1, 'var(--clfh-cielo-2)']]) }, c);
    const noche = svg('rect', { width: ANCHO, height: ALTO, fill: degradado(ctx, [[0, '#02060f'], [1, '#0c1a38']]) }, c);
    void dia;

    // ----- Corte del ojo -----
    const CX = 330, CY = 430, R = 180;
    const ojo = svg('g', {}, c);
    const rayos = svg('g', {}, ojo);
    const listaRayos = [-56, 0, 56].map(dy => svg('path', { d: `M30 ${CY + dy} L${CX - R + 68} ${CY + dy * 0.5} L${CX + R - 18} ${CY}`, fill: 'none', stroke: '#fbbf24', 'stroke-width': 4, 'stroke-dasharray': '14 12', 'stroke-linecap': 'round', opacity: 0.9 }, rayos));
    svg('path', { d: `M${CX + R - 20} ${CY + 46} C${CX + R + 30} ${CY + 70} ${CX + R + 50} ${CY + 110} ${CX + R + 80} ${CY + 150}`, stroke: '#f2a48a', 'stroke-width': 26, fill: 'none', 'stroke-linecap': 'round' }, ojo);
    svg('circle', { cx: CX, cy: CY, r: R, fill: '#fbf6ee', stroke: '#d9c8b4', 'stroke-width': 4 }, ojo);
    svg('circle', { cx: CX, cy: CY, r: R - 12, fill: '#eaf2fb' }, ojo);
    const ang = a => [CX + Math.cos(a) * (R - 14), CY + Math.sin(a) * (R - 14)];
    const [ax, ay] = ang(-1.15), [bx, by] = ang(1.15);
    svg('path', { d: `M${f1(ax)} ${f1(ay)} A${R - 14} ${R - 14} 0 0 1 ${f1(bx)} ${f1(by)}`, fill: 'none', stroke: '#e0607a', 'stroke-width': 12, 'stroke-linecap': 'round' }, ojo);
    const fovea = svg('circle', { cx: CX + R - 16, cy: CY, r: 12, fill: '#fbbf24', stroke: '#ffffff', 'stroke-width': 3 }, ojo);
    svg('path', { d: `M${CX - R + 26} ${CY - 80} Q${CX - R - 46} ${CY} ${CX - R + 26} ${CY + 80}`, fill: '#cfe6ff', opacity: 0.8, stroke: '#9cc6f0', 'stroke-width': 3 }, ojo);
    const irisA = svg('line', { x1: CX - R + 44, x2: CX - R + 44, stroke: '#2f6fb8', 'stroke-width': 14, 'stroke-linecap': 'round' }, ojo);
    const irisB = svg('line', { x1: CX - R + 44, x2: CX - R + 44, stroke: '#2f6fb8', 'stroke-width': 14, 'stroke-linecap': 'round' }, ojo);
    svg('ellipse', { cx: CX - R + 72, cy: CY, rx: 20, ry: 50, fill: '#ffffff', stroke: '#b7cde6', 'stroke-width': 3, opacity: 0.95 }, ojo);
    // Lupa desde la retina a la ampliación.
    const lupa = svg('g', {}, c);
    svg('path', { d: `M${CX + R - 4} ${CY - 18} L640 240 M${CX + R - 4} ${CY + 18} L640 620`, stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 2, 'stroke-dasharray': '6 8', opacity: 0.6 }, lupa);

    // ----- Ampliación de la retina -----
    const panel = svg('g', {}, c);
    svg('rect', { x: 640, y: 220, width: 570, height: 420, rx: 28, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, panel);
    const tira = svg('g', {}, panel);
    svg('rect', { x: 668, y: 470, width: 514, height: 26, rx: 13, fill: '#e0607a', opacity: 0.85 }, tira);
    const az = aleatorio(7);
    const conos = [], bastones = [];
    for (let k = 0; k < 34; k++) {
      const u = k / 33, x = 682 + u * 486;
      const tipo = celulaRetina(u, az());
      if (tipo === 'cono') {
        const g = svg('g', {}, tira);
        svg('path', { d: `M${f1(x - 7)} 470 L${f1(x)} 400 L${f1(x + 7)} 470 Z`, fill: '#f59e0b', stroke: '#b45309', 'stroke-width': 1.5 }, g);
        conos.push(g);
      } else {
        const g = svg('g', {}, tira);
        const brillo = svg('rect', { x: f1(x - 9), y: 352, width: 18, height: 126, rx: 9, fill: '#60a5fa', opacity: 0 }, g);
        svg('rect', { x: f1(x - 4), y: 360, width: 8, height: 110, rx: 4, fill: '#3b82f6', stroke: '#1e40af', 'stroke-width': 1.2 }, g);
        bastones.push({ g, brillo });
      }
    }
    T(panel, 925, 530, X.centro, { tam: 18, peso: 700, ancla: 'middle', color: 'var(--clfh-tinta-suave)', espacio: 2 });
    T(panel, 720, 530, X.periferia, { tam: 18, peso: 700, ancla: 'middle', color: 'var(--clfh-tinta-suave)', espacio: 2 });
    T(panel, 1130, 530, X.periferia, { tam: 18, peso: 700, ancla: 'middle', color: 'var(--clfh-tinta-suave)', espacio: 2 });

    // ----- Cielo de noche (mirar al lado y barrer) -----
    const cielo = svg('g', {}, c);
    svg('rect', { x: 640, y: 220, width: 570, height: 420, rx: 28, fill: '#030814', stroke: '#22345a', 'stroke-width': 2 }, cielo);
    const azs = aleatorio(11);
    for (let k = 0; k < 70; k++) svg('circle', { cx: f1(660 + azs() * 530), cy: f1(240 + azs() * 300), r: f1(0.8 + azs() * 1.6), fill: '#ffffff', opacity: f1(0.3 + azs() * 0.6) }, cielo);
    svg('path', { d: 'M640 560 L760 520 L860 548 L980 510 L1100 540 L1210 520 L1210 612 Q1210 640 1182 640 L668 640 Q640 640 640 612 Z', fill: '#0b1426' }, cielo);
    const sectores = svg('g', {}, cielo);
    const listaSect = Array.from({ length: 6 }, (_, k) => svg('rect', { x: f1(652 + k * 91), y: 232, width: 88, height: 330, rx: 10, fill: '#60a5fa', opacity: 0 }, sectores));
    const lejano = svg('g', {}, cielo);
    svg('circle', { r: 4, fill: '#ffffff' }, lejano);
    const rojo = svg('circle', { cx: -10, cy: 1, r: 3, fill: '#ef4444' }, lejano);
    const verde = svg('circle', { cx: 10, cy: 1, r: 3, fill: '#22c55e' }, lejano);
    mover(lejano, 930, 360);
    const mira = svg('g', {}, cielo);
    svg('circle', { r: 38, fill: 'none', stroke: '#fb923c', 'stroke-width': 4 }, mira);
    svg('path', { d: 'M-54 0 H-42 M42 0 H54 M0 -54 V-42 M0 42 V54', stroke: '#fb923c', 'stroke-width': 4, 'stroke-linecap': 'round' }, mira);
    const visto = icono(cielo, 'bien', { r: 18, fondo: 'var(--clfh-bien)', trazo: '#ffffff', borde: '#ffffff' });

    // ----- Interruptor día / noche -----
    const inter = svg('g', {}, c);
    svg('rect', { x: -70, y: -26, width: 140, height: 52, rx: 26, fill: 'var(--clfh-tarjeta)', stroke: 'var(--clfh-borde)', 'stroke-width': 2, class: 'clase-fh-sombra' }, inter);
    const perilla = svg('circle', { r: 20 }, inter);
    T(inter, -98, 8, X.dia, { tam: 20, peso: 700, ancla: 'end' });
    T(inter, 98, 8, X.nocheCorto, { tam: 20, peso: 700 });
    mover(inter, 1060, 120);

    return m => {
      const t = m.t;
      const n = m.e(p2, p2 + 0.04); // noche
      opacidad(noche, n);
      opacidad(ojo, m.e(0, p0 + 0.03) * (1 - 0.35 * n));
      listaRayos.forEach(r => { r.setAttribute('stroke-dashoffset', f1(-m.s * 40)); });
      opacidad(rayos, (1 - n * 0.6) * m.e(p0, p0 + 0.04));
      const pupila = 22 + n * 22;
      irisA.setAttribute('y1', CY - 82); irisA.setAttribute('y2', f1(CY - pupila));
      irisB.setAttribute('y1', f1(CY + pupila)); irisB.setAttribute('y2', CY + 82);
      fovea.setAttribute('r', f1(10 + 4 * Math.max(0, m.onda(1.6))));
      const ampl = m.e(p0 + 0.03, p0 + 0.08), sale = m.e(p3 - 0.02, p3 + 0.02);
      opacidad(lupa, ampl * (1 - sale));
      mover(panel, (1 - ampl) * 40, 0); opacidad(panel, ampl * (1 - sale));
      const resCono = m.e(p0 + 0.05, p0 + 0.1);
      const resBaston = m.e(p1, p1 + 0.04);
      conos.forEach((g, k) => { opacidad(g, (0.55 + 0.45 * resCono) * (1 - 0.72 * n) * tramo(t, p0 + 0.04 + k * 0.003, p0 + 0.07 + k * 0.003)); });
      bastones.forEach((b, k) => {
        opacidad(b.g, (0.28 + 0.72 * Math.max(resBaston, n)) * tramo(t, p0 + 0.04 + k * 0.002, p0 + 0.07 + k * 0.002));
        opacidad(b.brillo, n * (0.45 + 0.25 * Math.sin(m.s * 2 + k)));
      });
      perilla.setAttribute('cx', f1(-44 + 88 * n));
      perilla.setAttribute('fill', n > 0.5 ? '#3b82f6' : '#f59e0b');
      opacidad(inter, m.e(p2 - 0.04, p2) * (1 - m.e(p3, p3 + 0.03)));

      // Cielo: primero la mira encima del avión (no se ve), luego un poco al lado (aparece), luego el barrido.
      const vc = m.e(p3 - 0.01, p3 + 0.03);
      opacidad(cielo, vc); mover(cielo, (1 - vc) * 40, 0);
      const alLado = m.e(p3 + 0.07, p3 + 0.1);
      let mx = 930 - alLado * 90, my = 360 + alLado * 50;
      const barrer = m.lin(p4 + 0.01, 0.99);
      const ms = miradaSectores(barrer, 6);
      if (t >= p4) { const f = m.e(p4, p4 + 0.02); mx = mx + (652 + ms.x * 91 - mx) * f; my = my + (400 - my) * f; }
      mover(mira, mx, my);
      const visible = t < p4 ? 0.12 + 0.88 * alLado : 1;
      opacidad(lejano, visible * (0.75 + 0.25 * Math.sin(m.s * 6)));
      opacidad(rojo, Math.sin(m.s * 4) > 0 ? 1 : 0.3); opacidad(verde, Math.sin(m.s * 4) > 0 ? 0.3 : 1);
      mover(visto, 958, 330, alLado); opacidad(visto, alLado * (1 - m.e(p4, p4 + 0.02)));
      listaSect.forEach((r, k) => opacidad(r, t >= p4 + 0.01 ? (k === ms.sector ? 0.22 : k < ms.sector ? 0.07 : 0) : 0));
    };
  });
}
