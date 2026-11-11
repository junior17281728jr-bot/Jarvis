// Escena «El aire se hace delgado»: una columna de aire donde las moléculas se separan al subir (el oxígeno sigue
// siendo ~21 %, pero hay menos presión); un piloto contento mientras partes del cerebro se apagan; síntomas y el
// tiempo de conciencia útil a distintas alturas.
// opciones.pasos = [columna, hipoxia, conciencia]; opciones.conciencia = [[pies, texto, segundos], …].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, avioneta, piloto, icono, mover, opacidad, T, aleatorio, degradado } from './fh-base.js';

export const TEXTOS_HIPOXIA = {
  porcentaje: 'Siempre ~21 % de oxígeno', presion: 'Menos presión: menos O₂ por respiración', juicio: 'Hipoxia: primero falla el juicio',
  conciencia: 'Tiempo de conciencia útil', o2: 'O₂', presionCorta: 'presión', pies: 'ft',
  sintomas: ['euforia', 'visión borrosa', 'dolor de cabeza', 'sueño', 'reacción lenta'],
};
export const PASOS_HIPOXIA = [0.03, 0.4, 0.67];
// Valores de referencia habituales (tablas de entrenamiento fisiológico).
export const CONCIENCIA = [[18000, '20–30 min', 1500], [25000, '3–5 min', 240], [30000, '1–2 min', 90], [35000, '30–60 s', 45]];

// Presión del aire relativa al nivel del mar (atmósfera estándar) a una altitud en pies.
export function presionRelativa(pies) {
  return Math.pow(Math.max(0, 1 - 6.8756e-6 * Math.max(0, pies)), 5.2559);
}

// Largo de la barra de conciencia útil (escala logarítmica, 0..1).
export function barraConciencia(segundos, min = 20, max = 1800) {
  return Math.min(1, Math.max(0.04, Math.log(segundos / min) / Math.log(max / min)));
}

const ALT_MAX = 25000, Y0 = 670, Y1 = 200;
const yDe = pies => Y0 - (pies / ALT_MAX) * (Y0 - Y1);

export function montarFhHipoxia(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_HIPOXIA, opciones);
  const [p0, p1, p2] = opciones.pasos || PASOS_HIPOXIA;
  const tabla = opciones.conciencia || CONCIENCIA;
  const rotulos = opciones.rotulos || [
    { texto: X.porcentaje, desde: p0 + 0.08, hasta: p1, x: 640, y: 220, tono: 'azul' },
    { texto: X.presion, desde: p0 + 0.2, hasta: p1, x: 640, y: 290, tono: 'naranja' },
    { texto: X.juicio, desde: p1 + 0.03, x: 1216, y: 112, tono: 'mal', ancla: 'fin' },
  ];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    // Columna de aire con moléculas: la densidad sigue a la presión.
    const col = svg('g', {}, c);
    svg('rect', { x: 150, y: Y1 - 20, width: 300, height: Y0 - Y1 + 40, rx: 26, fill: degradado(ctx, [[0, '#0b1d3f', 0.85], [1, '#4c8fd8', 0.85]]), class: 'clase-fh-sombra' }, col);
    const az = aleatorio(21);
    const moleculas = [];
    for (let banda = 0; banda < 24; banda++) {
      const pies = (banda + 0.5) * (ALT_MAX / 24), n = Math.round(14 * presionRelativa(pies));
      for (let k = 0; k < n; k++) {
        const esO2 = az() < 0.21;
        moleculas.push({ n: svg('circle', { r: esO2 ? 5.5 : 3.6, fill: esO2 ? '#7dd3fc' : '#e2e8f0', opacity: esO2 ? 1 : 0.5 }, col), x: 168 + az() * 264, y: yDe(pies) + (az() - 0.5) * 18, f: az() * 6 });
      }
    }
    for (const pies of [0, 10000, 18000, 25000]) {
      svg('line', { x1: 136, x2: 150, y1: f1(yDe(pies)), y2: f1(yDe(pies)), stroke: 'var(--clfh-tinta-suave)', 'stroke-width': 3 }, col);
      T(col, 128, yDe(pies) + 7, `${pies ? `${pies / 1000} 000` : '0'} ${X.pies}`, { tam: 18, peso: 700, ancla: 'end', color: 'var(--clfh-tinta-suave)' });
    }
    const av = svg('g', {}, c);
    avioneta(av);
    // Lupa con la muestra de aire a la altura del avión.
    const lupa = svg('g', {}, c);
    svg('circle', { r: 92, fill: '#0b1d3f', stroke: 'var(--clfh-naranja)', 'stroke-width': 5 }, lupa);
    const muestra = Array.from({ length: 40 }, (_, k) => svg('circle', { r: k % 5 === 0 ? 7 : 4.6, fill: k % 5 === 0 ? '#7dd3fc' : '#e2e8f0' }, lupa));
    const azm = aleatorio(5);
    const sitios = muestra.map(() => { const a = azm() * Math.PI * 2, r = Math.sqrt(azm()) * 70; return [Math.cos(a) * r, Math.sin(a) * r]; });
    const textoPresion = T(lupa, 0, 128, '', { tam: 22, peso: 800, ancla: 'middle' });

    // Piloto con el cerebro que se apaga.
    const persona = svg('g', {}, c);
    const pil = piloto(persona);
    const cerebro = svg('g', {}, persona);
    const zonas = [
      'M-30 -40 C-30 -66 -6 -74 6 -68 L4 -40 Z', 'M6 -68 C22 -74 38 -60 36 -42 L4 -40 Z',
      'M-30 -40 L4 -40 L2 -18 C-14 -14 -30 -20 -30 -40 Z', 'M4 -40 L36 -42 C38 -24 24 -16 2 -18 Z',
    ].map(d => svg('path', { d, fill: '#f472b6', stroke: '#ffffff', 'stroke-width': 2 }, cerebro));
    mover(cerebro, 2, 6);
    const iconos = svg('g', {}, c);
    const listaIconos = ['cara', 'vision', 'dolor', 'sueno', 'reloj'].map((nombre, i) => {
      const g = svg('g', {}, iconos);
      icono(g, nombre, { r: 36, trazo: 'var(--clfh-mal)' });
      T(g, 0, 64, X.sintomas[i] || '', { tam: 16, peso: 700, ancla: 'middle', color: 'var(--clfh-tinta)' });
      return g;
    });

    // Tiempo de conciencia útil.
    const tuc = svg('g', {}, c);
    svg('rect', { x: 0, y: 0, width: 560, height: 300, rx: 26, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, tuc);
    T(tuc, 28, 48, X.conciencia, { tam: 26, peso: 800 });
    const barras = tabla.map(([pies, texto, seg], i) => {
      const y = 92 + i * 52;
      T(tuc, 28, y + 22, `${Math.round(pies / 1000)} 000 ${X.pies}`, { tam: 19, peso: 700, color: 'var(--clfh-tinta-suave)' });
            const b = svg('rect', { x: 150, y, width: 0, height: 30, rx: 15, fill: i < 1 ? 'var(--clfh-ambar)' : 'var(--clfh-mal)' }, tuc);
      const largo = barraConciencia(seg) * 300;
      const tx = T(tuc, 150 + Math.max(30, largo) + 12, y + 22, texto, { tam: 19, peso: 800 });
      return { b, tx, largo };
    });
    mover(tuc, 670, 380);

    return m => {
      const t = m.t;
      opacidad(col, m.e(0, p0 + 0.04));
      moleculas.forEach(o => { o.n.setAttribute('cx', f1(o.x + m.onda(2.6, o.f) * 3)); o.n.setAttribute('cy', f1(o.y + m.onda(3.1, o.f + 0.3) * 3)); });
      // Avión sube por la columna.
      const sube = m.lin(p0 + 0.04, p1 - 0.04);
      const pies = 500 + sube * 23500;
      const ya = yDe(pies);
      mover(av, 520, ya + m.onda(3) * 3, 0.8, -8 * (sube > 0 && sube < 1 ? 1 : 0));
      opacidad(av, m.e(p0, p0 + 0.04) * (1 - m.e(p1 - 0.02, p1 + 0.03)));
      // Muestra: menos moléculas cuanto más arriba.
      const p = presionRelativa(pies), visibles = Math.round(40 * p);
      muestra.forEach((n, k) => { n.setAttribute('cx', f1(sitios[k][0] + m.onda(2, k * 0.1) * 2)); n.setAttribute('cy', f1(sitios[k][1] + m.onda(2.4, k * 0.13) * 2)); opacidad(n, k < visibles ? 1 : 0); });
      textoPresion.textContent = `${X.presionCorta} ${Math.round(p * 100)} %`;
      const fueraLupa = m.e(p1 - 0.03, p1 + 0.02);
      mover(lupa, 720 + (1 - fueraLupa) * 0, Math.max(300, Math.min(560, ya + 20)) + fueraLupa * 30);
      opacidad(lupa, m.e(p0 + 0.05, p0 + 0.09) * (1 - fueraLupa));
      // Hipoxia.
      const vp = m.e(p1, p1 + 0.05), chico = m.e(p2, p2 + 0.05);
      mover(persona, 940 + chico * 60, 330 - chico * 110, 1.35 - chico * 0.45); opacidad(persona, vp);
      zonas.forEach((z, k) => { const gris = m.e(p1 + 0.06 + k * 0.04, p1 + 0.1 + k * 0.04); z.setAttribute('fill', gris > 0.5 ? '#6b7280' : '#f472b6'); opacidad(z, 1 - gris * 0.35); });
      const sonrisa = m.lin(p1, p2);
      pil.boca.setAttribute('d', `M4 18 Q13 ${f1(24 + sonrisa * 8)} 22 18`);
      listaIconos.forEach((g, k) => { const a = m.e(p1 + 0.04 + k * 0.035, p1 + 0.08 + k * 0.035) * (1 - chico); mover(g, 640 + k * 138, 590 + (1 - a) * 20); opacidad(g, a); });
      // Conciencia útil.
      opacidad(tuc, chico); mover(tuc, 670, 380 + (1 - chico) * 30);
      barras.forEach((b, k) => { const f = m.e(p2 + 0.04 + k * 0.04, p2 + 0.12 + k * 0.04); b.b.setAttribute('width', f1(Math.max(30, b.largo) * f)); opacidad(b.tx, f); });
      void t;
    };
  });
}
