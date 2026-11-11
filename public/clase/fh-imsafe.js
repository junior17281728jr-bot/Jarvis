// Escena «Revísate antes de volar»: seis tarjetas I-M-S-A-F-E caen y se dan vuelta mostrando su ícono y su palabra;
// luego dos datos del alcohol (horas desde la última copa y límite en sangre) y «si dudas, no vueles».
// opciones.pasos = [tarjetas, alcohol, cierre]; opciones.tarjetas = [{ letra, palabra, icono }].

import { svg, f1 } from './comun.js';
import { montarFH, textosDe, fondoCielo, icono, mover, opacidad, T, rebote, tramo, avioneta } from './fh-base.js';

export const TEXTOS_IMSAFE = {
  tarjetas: [
    { letra: 'I', palabra: 'Enfermedad', icono: 'termometro' }, { letra: 'M', palabra: 'Medicamentos', icono: 'pastilla' },
    { letra: 'S', palabra: 'Estrés', icono: 'estres' }, { letra: 'A', palabra: 'Alcohol', icono: 'copa' },
    { letra: 'F', palabra: 'Fatiga', icono: 'sueno' }, { letra: 'E', palabra: 'Comida y emoción', icono: 'plato' },
  ],
  horas: '8 h', horasTexto: 'desde la última copa', limite: '< 0,04 %', limiteTexto: 'de alcohol en la sangre',
  lista: 'Tu lista antes de la del avión', duda: 'Si dudas, no vueles',
};
export const PASOS_IMSAFE = [0.12, 0.67, 0.86];

// Giro de la tarjeta k: 0 = de frente (letra), 1 = de espaldas (ícono). escala es el ancho aparente (|cos|).
export function giroTarjeta(t, k, inicio, separacion = 0.045, dura = 0.05) {
  const f = tramo(t, inicio + k * separacion, inicio + k * separacion + dura);
  return { f, escala: Math.abs(Math.cos(Math.PI * f)), espalda: f >= 0.5 };
}

export function montarFhImsafe(contenedor, opciones = {}) {
  const X = textosDe(TEXTOS_IMSAFE, opciones);
  const [p0, p1, p2] = opciones.pasos || PASOS_IMSAFE;
  const rotulos = opciones.rotulos || [{ texto: X.lista, desde: p0 + 0.02, hasta: p1, x: 1216, y: 112, tono: 'azul', ancla: 'fin' }];
  return montarFH(contenedor, { ...opciones, rotulos }, ctx => {
    const c = ctx.capa;
    fondoCielo(ctx);
    const fondoAvion = svg('g', { opacity: 0.18 }, c);
    avioneta(fondoAvion);
    mover(fondoAvion, 980, 560, 3.2);
    const W = 172, H = 236;
    const cartas = X.tarjetas.map((d, k) => {
      const g = svg('g', {}, c);
      const giro = svg('g', {}, g);
      const frente = svg('g', {}, giro);
      svg('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 22, fill: 'var(--clfh-naranja)', class: 'clase-fh-sombra' }, frente);
      svg('rect', { x: -W / 2 + 10, y: -H / 2 + 10, width: W - 20, height: H - 20, rx: 16, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, opacity: 0.5 }, frente);
      T(frente, 0, 46, d.letra, { tam: 136, peso: 900, ancla: 'middle', color: '#ffffff' });
      const espalda = svg('g', {}, giro);
      svg('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 22, fill: 'var(--clfh-tarjeta)', stroke: 'var(--clfh-naranja)', 'stroke-width': 3, class: 'clase-fh-sombra' }, espalda);
      T(espalda, 0, -62, d.letra, { tam: 34, peso: 900, ancla: 'middle', color: 'var(--clfh-naranja-texto)' });
      const ic = icono(espalda, d.icono, { r: 40, trazo: 'var(--clfh-azul)' });
      mover(ic, 0, 2);
      const palabras = String(d.palabra).split(' ');
      const lineas = palabras.length > 2 ? [palabras.slice(0, -2).join(' ') + ' ' + palabras[palabras.length - 2], palabras[palabras.length - 1]] : [d.palabra];
      lineas.forEach((l, i) => T(espalda, 0, 76 + i * 24 - (lineas.length - 1) * 10, l, { tam: lineas.length > 1 ? 19 : (d.palabra.length > 10 ? 18 : 22), peso: 800, ancla: 'middle' }));
      const visto = icono(g, 'bien', { r: 18, fondo: 'var(--clfh-bien)', trazo: '#ffffff', borde: 'var(--clfh-tarjeta)' });
      mover(visto, W / 2 - 12, -H / 2 + 12);
      return { g, giro, frente, espalda, visto, x: 640 + (k - 2.5) * 192 };
    });
    // Datos del alcohol.
    const datos = [[X.horas, X.horasTexto, 'reloj'], [X.limite, X.limiteTexto, 'copa']].map(([grande, chico, ic], i) => {
      const g = svg('g', {}, c);
      svg('rect', { x: 0, y: -60, width: 470, height: 120, rx: 26, fill: 'var(--clfh-tarjeta)', class: 'clase-fh-sombra' }, g);
      const ico = icono(g, ic, { r: 38, fondo: 'var(--clfh-cabina-2)', trazo: '#fdba74', borde: 'transparent' });
      mover(ico, 64, 0);
      T(g, 122, 6, grande, { tam: 46, peso: 900 });
      T(g, 122, 38, chico, { tam: 20, peso: 650, color: 'var(--clfh-tinta-suave)' });
      return { g, x: 140 + i * 520 };
    });
    const duda = svg('g', {}, c);
    svg('rect', { x: -300, y: -46, width: 600, height: 92, rx: 46, fill: 'var(--clfh-mal)', class: 'clase-fh-sombra' }, duda);
    T(duda, 0, 15, X.duda, { tam: 42, peso: 900, ancla: 'middle', color: '#ffffff' });

    return m => {
      const t = m.t;
      const arriba = m.e(p1, p1 + 0.05);
      cartas.forEach((ca, k) => {
        const cae = ctx.quieto ? (t >= p0 + k * 0.03 ? 1 : 0) : rebote(tramo(t, p0 + k * 0.03, p0 + k * 0.03 + 0.045));
        const y = -200 + (380 + 200) * cae - arriba * 110;
        const gi = ctx.quieto ? { escala: 1, espalda: t >= p0 + 0.22 + k * 0.045 } : giroTarjeta(t, k, p0 + 0.2);
        mover(ca.g, ca.x, y, 1 - arriba * 0.2);
        opacidad(ca.g, t >= p0 + k * 0.03 ? 1 : 0);
        ca.giro.setAttribute('transform', `scale(${Math.max(0.01, gi.escala).toFixed(3)} 1)`);
        ca.frente.setAttribute('visibility', gi.espalda ? 'hidden' : 'visible');
        ca.espalda.setAttribute('visibility', gi.espalda ? 'visible' : 'hidden');
        const v = m.e(p0 + 0.26 + k * 0.045, p0 + 0.29 + k * 0.045);
        mover(ca.visto, 86 - 12, -118 + 12, v); opacidad(ca.visto, v);
      });
      datos.forEach((d, i) => { const a = m.e(p1 + 0.03 + i * 0.06, p1 + 0.07 + i * 0.06) * (1 - m.e(p2 - 0.01, p2 + 0.03)); mover(d.g, d.x, 560 + (1 - a) * 30); opacidad(d.g, a); });
      const dd = m.e(p2, p2 + 0.04);
      mover(duda, 640, 560 + (1 - dd) * 20, 0.85 + 0.15 * dd + (ctx.quieto ? 0 : Math.max(0, m.onda(1.4)) * 0.02 * dd));
      opacidad(duda, dd);
      void f1;
    };
  });
}
