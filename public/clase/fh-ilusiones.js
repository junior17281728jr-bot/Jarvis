// Escena «Cuando los ojos te engañan»: tres viñetas que se encienden por turno. Autocinesis (una luz fija que parece
// moverse), horizonte falso (nubes inclinadas) y pista estrecha (te sientes alto y bajas de más).
// opciones.pasos = [autocinesis, horizonteFalso, pistaEstrecha, cierre].

import { svg, f1, idUnico } from './comun.js';
import { montarFH, textosDe, fondoCielo, avioneta, nube, mover, opacidad, T, aleatorio } from './fh-base.js';

export const TEXTOS_ILUSIONES = {
  autocinesis: 'Autocinesis', autoTexto: 'Luz fija que parece moverse', horizonte: 'Horizonte falso', horizonteTexto: 'Nubes inclinadas',
  pista: 'Pista estrecha', pistaTexto: 'Te sientes alto: bajas de más', real: 'real', sentida: 'lo que crees', cierre: 'Tus ojos pueden engañarte',
};
export const PASOS_ILUSIONES = [0.03, 0.48, 0.69, 0.86];

// Deriva aparente de la luz en la autocinesis: un vaivén lento y suave (segundos → desplazamiento en px).
export function derivaLuz(s, amplitud = 34) {
  return { x: Math.sin(s * 0.7) * amplitud + Math.sin(s * 1.9) * amplitud * 0.25, y: Math.cos(s * 0.55) * amplitud * 0.6 + Math.sin(s * 1.3) * amplitud * 0.2 };
}

const ANCHO_V = 360, ALTO_V = 330;

function vineta(padre, ctx, x, titulo, texto) {
  const g = svg('g', {}, padre);
  const marco = svg('rect', { x: -6, y: -6, width: ANCHO_V + 12, height: ALTO_V + 92, rx: 28, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, g);
  const borde = svg('rect', { x: -6, y: -6, width: ANCHO_V + 12, height: ALTO_V + 92, rx: 28, fill: 'none', stroke: 'var(--clfh-naranja)', 'stroke-width': 5 }, g);
  const id = idUnico('fhvin');
  svg('rect', { width: ANCHO_V, height: ALTO_V, rx: 22 }, svg('clipPath', { id }, ctx.defs));
  const dentro = svg('g', { 'clip-path': `url(#${id})` }, g);
  T(g, 22, ALTO_V + 38, titulo, { tam: 26, peso: 800 });
  T(g, 22, ALTO_V + 68, texto, { tam: 19, peso: 600, color: 'var(--clfh-tinta-suave)' });
  return { g, dentro, marco, borde, x };
}

export function montarFhIlusiones(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_ILUSIONES, opciones);
  const [p0, p1, p2, p3] = opciones.pasos || PASOS_ILUSIONES;
  const rotulos = opciones.rotulos || [{ texto: X.cierre, desde: p3 + 0.01, x: 1216, y: 112, tono: 'naranja', ancla: 'fin' }];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    const v = [vineta(c, ctx, 40, X.autocinesis, X.autoTexto), vineta(c, ctx, 460, X.horizonte, X.horizonteTexto), vineta(c, ctx, 880, X.pista, X.pistaTexto)];

    // 1) Autocinesis: cielo negro, estrellas tenues, una luz con su estela.
    const a = v[0].dentro;
    svg('rect', { width: ANCHO_V, height: ALTO_V, rx: 22, fill: '#02050d' }, a);
    const az = aleatorio(3);
    for (let k = 0; k < 26; k++) svg('circle', { cx: f1(20 + az() * 320), cy: f1(20 + az() * 290), r: f1(0.7 + az()), fill: '#fff', opacity: f1(0.15 + az() * 0.3) }, a);
    svg('circle', { cx: 180, cy: 165, r: 44, fill: 'none', stroke: '#9fb0c8', 'stroke-width': 2, 'stroke-dasharray': '5 7' }, a);
    T(a, 180, 232, X.real, { tam: 16, peso: 700, ancla: 'middle', color: '#9fb0c8' });
    const estela = svg('path', { fill: 'none', stroke: '#fde68a', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.55 }, a);
    const luz = svg('g', {}, a);
    svg('circle', { r: 18, fill: '#fde68a', opacity: 0.25 }, luz);
    svg('circle', { r: 7, fill: '#fffbe6' }, luz);

    // 2) Horizonte falso: atardecer, capa de nubes inclinada y el avión que se inclina con ella.
    const h = v[1].dentro;
    svg('rect', { width: ANCHO_V, height: ALTO_V, rx: 22, fill: '#1b2f57' }, h);
    svg('rect', { y: 200, width: ANCHO_V, height: 130, rx: 22, fill: '#0e1a2f' }, h);
    svg('line', { x1: 0, x2: ANCHO_V, y1: 200, y2: 200, stroke: '#9fb0c8', 'stroke-width': 2.5, 'stroke-dasharray': '8 8' }, h);
    T(h, 12, 192, X.real, { tam: 15, peso: 700, color: '#9fb0c8' });
    const capa = svg('g', {}, h);
    svg('path', { d: 'M-40 150 L400 60 L400 110 L-40 210 Z', fill: '#d8e2f0', opacity: 0.9 }, capa);
    for (let k = 0; k < 6; k++) nube(capa, k * 80 - 20, 168 - k * 18, 0.5, '#e8eef8', 1);
    const avH = svg('g', {}, h);
    avioneta(avH, { cuerpo: '#f8fafc', detalle: '#24344f' });

    // 3) Pista estrecha: vista del piloto; la senda real (roja) queda baja.
    const p = v[2].dentro;
    svg('rect', { width: ANCHO_V, height: ALTO_V, rx: 22, fill: '#7fb3e6' }, p);
    svg('rect', { y: 150, width: ANCHO_V, height: 180, fill: '#5f8f52' }, p);
    svg('path', { d: 'M150 150 L210 150 L250 330 L110 330 Z', fill: '#4b5563' }, p);
    svg('path', { d: 'M180 158 L180 326', stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '14 12' }, p);
    svg('path', { d: 'M120 330 L156 150 M240 330 L204 150', stroke: '#fff', 'stroke-width': 2 }, p);
    const senda = svg('g', {}, p);
    svg('path', { d: 'M20 40 Q120 100 180 150', fill: 'none', stroke: '#22c55e', 'stroke-width': 4, 'stroke-dasharray': '10 8' }, senda);
    svg('path', { d: 'M20 110 Q120 150 172 152', fill: 'none', stroke: '#ef4444', 'stroke-width': 5, 'stroke-linecap': 'round' }, senda);
    T(senda, 30, 30, X.sentida, { tam: 15, peso: 750, color: '#14532d' });
    T(senda, 30, 132, X.real, { tam: 15, peso: 750, color: '#7f1d1d' });
    const avP = svg('g', {}, p);
    avioneta(avP, { cuerpo: '#ffffff', detalle: '#24344f' });

    return m => {
      const t = m.t;
      const activo = t < p1 ? 0 : t < p2 ? 1 : t < p3 ? 2 : -1;
      v.forEach((vi, k) => {
        const entra = m.e(p0 + k * 0.03, p0 + 0.05 + k * 0.03);
        const foco = activo === k ? 1 : activo === -1 ? 0.85 : 0;
        const pasado = (k === 0 && t >= p1) || (k === 1 && t >= p2) || (k === 2 && t >= p3);
        mover(vi.g, vi.x, 200 + (1 - entra) * 40, 1 + foco * 0.03 - (activo === -1 ? 0.03 : 0));
        opacidad(vi.g, entra * (activo === k || activo === -1 ? 1 : pasado ? 0.6 : 0.45));
        opacidad(vi.borde, activo === k ? 1 : 0);
      });
      // Autocinesis: la luz «se va» cuanto más tiempo la miras.
      const fuerza = m.lin(p0 + 0.04, p1 - 0.05);
      const pts = [];
      for (let k = 0; k <= 24; k++) { const d = derivaLuz(Math.max(0, m.s - k * 0.12), 40 * fuerza); pts.push(`${k ? 'L' : 'M'}${f1(180 + d.x)} ${f1(165 + d.y)}`); }
      estela.setAttribute('d', pts.join(''));
      const d0 = derivaLuz(m.s, 40 * fuerza);
      mover(luz, 180 + d0.x, 165 + d0.y);
      // Horizonte falso: el avión se inclina para alinearse con las nubes.
      const inclina = m.e(p1 + 0.04, p1 + 0.12);
      mover(avH, 180, 130 + m.onda(3) * 3, 0.95, -12 * inclina);
      mover(capa, 0, m.onda(8) * 3);
      // Pista: el avión baja por la senda roja.
      const f = m.lin(p2 + 0.02, p3);
      mover(avP, 20 + f * 140, 110 + f * 38 + f * f * 4, 0.45 - f * 0.15);
      opacidad(senda, m.e(p2 + 0.02, p2 + 0.06));
    };
  });
}
