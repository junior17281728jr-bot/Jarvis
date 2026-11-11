// Base de las escenas de Factores Humanos (materia 1): un lienzo SVG de 1280×720, un título, rótulos cortos que entran
// a tiempo y piezas de dibujo comunes (avioneta, nubes, piloto, íconos). Cada escena es una función pura del tiempo:
// el reproductor llama tiempo(t) con t∈[0,1] y la escena se dibuja igual cada vez que recibe el mismo t (sirve para
// grabar el video cuadro a cuadro). No hay reloj propio ni azar sin semilla.
//
// API: montarFH(contenedor, opciones, construir) → { raiz, tiempo(t), pausar(), destruir() }
//   opciones: { duracion_s, antetitulo, titulo, rotulos: [{ texto, desde, hasta?, x, y, tono?, ancla? }], quieto?, textos? }
//   construir(ctx) → dibujar(m)   con m = { t, s, e(a,b), lin(a,b), onda(periodo, fase), entre(a,b) }
// Lógica pura (para las pruebas): tramo, salida, facil, pasoEn, aleatorio, anchoTexto, alfaRotulo, cuantizar.

import { el, svg, idUnico, prefiereMenosMovimiento, limitar, f1, rad } from './comun.js';

export const ANCHO = 1280, ALTO = 720;
export const FUENTE = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Avance lineal de t entre a y b (0 antes, 1 después).
export function tramo(t, a, b) {
  if (!(b > a)) return t >= a ? 1 : 0;
  return limitar((t - a) / (b - a), 0, 1);
}
export const salida = x => 1 - Math.pow(1 - limitar(x, 0, 1), 3);
export const facil = x => { const y = limitar(x, 0, 1); return y * y * (3 - 2 * y); };
// Un pequeño rebote al llegar (para tarjetas que caen).
export const rebote = x => { const y = limitar(x, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(y - 1, 3) + c * Math.pow(y - 1, 2); };

// Qué paso va: el último índice cuya marca ya pasó (-1 si ninguna).
export function pasoEn(marcas, t) {
  let i = -1;
  for (let k = 0; k < marcas.length; k++) if (t >= marcas[k]) i = k;
  return i;
}

// Con movimiento reducido el avance va a saltos: cada transición se resuelve de una vez a mitad de su tramo.
export function cuantizar(t, a, b) { return t >= (a + b) / 2 ? 1 : 0; }

// Números «al azar» repetibles (mulberry32): la misma semilla da siempre la misma serie.
export function aleatorio(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Ancho aproximado de un texto (sin medir en pantalla, para que sea igual en todas partes).
export function anchoTexto(texto, tam, peso = 600) {
  let ancho = 0;
  for (const c of String(texto)) {
    if (c === ' ') ancho += 0.28;
    else if ('il.,:;!|·\'’'.includes(c)) ancho += 0.3;
    else if ('fjrt()«»'.includes(c)) ancho += 0.4;
    else if ('mwMW%'.includes(c)) ancho += 0.86;
    else if (c >= 'A' && c <= 'Z') ancho += 0.68;
    else if (c >= '0' && c <= '9') ancho += 0.58;
    else ancho += 0.55;
  }
  return ancho * tam * (peso >= 700 ? 1.04 : 1);
}

// Opacidad de un rótulo en t: entra en «entrada» (fracción de la escena) y sale antes de «hasta».
export function alfaRotulo(r, t, entrada = 0.02) {
  const desde = r.desde ?? 0, hasta = r.hasta ?? 1.01;
  if (t < desde || t > hasta) return 0;
  const sube = tramo(t, desde, desde + entrada);
  const baja = hasta >= 1 ? 1 : 1 - tramo(t, hasta - entrada, hasta);
  return Math.min(sube, baja);
}

// ---------- Dibujo ----------
export const T = (padre, x, y, texto, { tam = 24, peso = 600, color = 'var(--clfh-tinta)', ancla = 'start', clase = '', espacio = 0 } = {}) =>
  svg('text', { x: f1(x), y: f1(y), 'font-size': tam, 'font-weight': peso, fill: color, 'text-anchor': ancla, 'font-family': FUENTE, 'letter-spacing': espacio || null, class: `clase-fh-texto ${clase}`.trim() }, padre, texto);

export function mover(nodo, x, y, escala = 1, giro = 0) {
  nodo.setAttribute('transform', `translate(${f1(x)} ${f1(y)})${giro ? ` rotate(${f1(giro)})` : ''}${escala !== 1 ? ` scale(${(Math.round(escala * 1000) / 1000)})` : ''}`);
}
export const opacidad = (nodo, a) => nodo.setAttribute('opacity', (Math.round(limitar(a, 0, 1) * 1000) / 1000).toString());

// Avioneta de ala alta vista de lado, mirando a la derecha, centrada en (0,0) y de unos 160 de largo.
export function avioneta(padre, { cuerpo = 'var(--clfh-avion)', detalle = 'var(--clfh-avion-detalle)', acento = 'var(--clfh-naranja)' } = {}) {
  const g = svg('g', { class: 'clase-fh-avioneta' }, padre);
  svg('path', { d: 'M-78 -6 L-60 -34 L-50 -34 L-44 -8 Z', fill: cuerpo }, g); // deriva
  svg('path', { d: 'M-80 -4 C-40 -14 10 -18 52 -14 C66 -12 76 -6 80 0 C76 8 62 12 40 12 C0 12 -40 8 -80 2 Z', fill: cuerpo }, g); // fuselaje
  svg('path', { d: 'M-10 -16 C0 -26 30 -27 44 -16 Z', fill: detalle, opacity: 0.85 }, g); // ventanas
  svg('rect', { x: -26, y: -24, width: 74, height: 7, rx: 3.5, fill: cuerpo }, g); // ala alta
  svg('path', { d: 'M4 -18 L-6 8', stroke: detalle, 'stroke-width': 3, 'stroke-linecap': 'round' }, g); // montante
  svg('path', { d: 'M-80 -2 L-58 -2', stroke: acento, 'stroke-width': 4, 'stroke-linecap': 'round' }, g); // franja
  svg('path', { d: 'M-40 4 L40 2', stroke: acento, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.9 }, g);
  svg('path', { d: 'M20 12 L16 24 M-30 9 L-32 18', stroke: detalle, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
  svg('circle', { cx: 16, cy: 25, r: 5, fill: detalle }, g);
  svg('circle', { cx: -32, cy: 19, r: 3.5, fill: detalle }, g);
  svg('rect', { x: 80, y: -16, width: 3, height: 32, rx: 1.5, fill: detalle, opacity: 0.55 }, g); // hélice
  return g;
}

// Nube suave hecha de círculos.
export function nube(padre, x, y, escala = 1, color = 'var(--clfh-nube)', alfa = 1) {
  const g = svg('g', { opacity: alfa }, padre);
  for (const [dx, dy, r] of [[-46, 6, 26], [-14, -10, 36], [26, -2, 30], [56, 10, 20]]) svg('circle', { cx: f1(x + dx * escala), cy: f1(y + dy * escala), r: f1(r * escala), fill: color }, g);
  svg('rect', { x: f1(x - 70 * escala), y: f1(y + 4 * escala), width: f1(146 * escala), height: f1(26 * escala), rx: f1(13 * escala), fill: color }, g);
  return g;
}

// Piloto de busto con auriculares (mirando a la derecha), centrado en la cabeza.
export function piloto(padre, { piel = 'var(--clfh-piel)', ropa = 'var(--clfh-azul)', auricular = 'var(--clfh-cabina-3)' } = {}) {
  const g = svg('g', { class: 'clase-fh-piloto' }, padre);
  svg('path', { d: 'M-62 120 C-60 64 -34 44 0 44 C34 44 60 64 62 120 Z', fill: ropa }, g);
  svg('path', { d: 'M-14 44 L0 70 L14 44 Z', fill: 'var(--clfh-tarjeta)', opacity: 0.9 }, g);
  svg('rect', { x: -10, y: 22, width: 20, height: 26, rx: 8, fill: piel }, g);
  svg('ellipse', { cx: 0, cy: 0, rx: 30, ry: 34, fill: piel }, g);
  svg('path', { d: 'M-30 -6 C-30 -36 30 -40 32 -8 C20 -22 -14 -24 -30 -6 Z', fill: 'var(--clfh-pelo)' }, g);
  svg('path', { d: 'M-36 4 C-38 -46 38 -46 36 4', fill: 'none', stroke: auricular, 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
  svg('rect', { x: -42, y: -6, width: 14, height: 24, rx: 6, fill: auricular }, g);
  svg('rect', { x: 28, y: -6, width: 14, height: 24, rx: 6, fill: auricular }, g);
  svg('path', { d: 'M36 14 C36 30 26 34 14 32', fill: 'none', stroke: auricular, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, g);
  svg('circle', { cx: 12, cy: 32, r: 4.5, fill: auricular }, g);
  const ojos = svg('g', {}, g);
  svg('circle', { cx: 4, cy: 2, r: 3, fill: 'var(--clfh-cabina-1)' }, ojos);
  svg('circle', { cx: 20, cy: 2, r: 3, fill: 'var(--clfh-cabina-1)' }, ojos);
  const boca = svg('path', { d: 'M6 18 Q13 24 20 18', fill: 'none', stroke: 'var(--clfh-cabina-1)', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g);
  return { g, ojos, boca };
}

// Íconos sencillos de 64×64 centrados en (0,0), en un círculo de color.
const ICONOS = {
  mareo: 'M-14 -4 a14 14 0 1 1 28 0 a9 9 0 1 1 -18 0 a4 4 0 1 1 8 0',
  dolor: 'M-16 -14 L-4 -2 L-12 2 L4 18 M8 -16 L2 -6 L12 -4 L6 8',
  vision: 'M-20 0 C-10 -14 10 -14 20 0 C10 14 -10 14 -20 0 Z M0 -6 a6 6 0 1 0 0.1 0',
  sueno: 'M-14 -12 H0 L-14 4 H0 M4 0 H16 L4 14 H16',
  reloj: 'M0 -18 a18 18 0 1 0 0.1 0 M0 -10 V0 L8 6',
  corazon: 'M0 16 C-24 0 -18 -18 -6 -16 C-2 -15 0 -12 0 -10 C0 -12 2 -15 6 -16 C18 -18 24 0 0 16 Z',
  musculo: 'M-18 10 C-18 -6 -8 -16 4 -14 C8 -13 8 -8 4 -6 C12 -8 20 -2 18 8 C14 16 -10 16 -18 10 Z',
  mano: 'M-8 16 V-4 M-8 -4 V-14 M-2 -4 V-16 M4 -4 V-14 M10 -2 V-8 M-14 2 C-14 10 -8 16 2 16 C10 16 14 10 14 2 V-6',
  cerebro: 'M-4 -16 C-18 -18 -22 -4 -16 2 C-22 8 -14 18 -4 14 Z M4 -16 C18 -18 22 -4 16 2 C22 8 14 18 4 14 Z',
  calor: 'M-10 14 C-18 2 -2 -2 -10 -14 M0 14 C-8 2 8 -2 0 -14 M10 14 C2 2 18 -2 10 -14',
  ventila: 'M0 0 C-4 -16 8 -20 10 -10 C12 -2 4 0 0 0 C16 -4 20 8 10 10 C2 12 0 4 0 0 C4 16 -8 20 -10 10 C-12 2 -4 0 0 0 C-16 4 -20 -8 -10 -10 C-2 -12 0 -4 0 0',
  mascara: 'M-14 -6 C-14 -16 14 -16 14 -6 L10 10 C4 16 -4 16 -10 10 Z M0 14 V22',
  bien: 'M-12 0 L-3 9 L13 -9',
  mal: 'M-10 -10 L10 10 M10 -10 L-10 10',
  copa: 'M-12 -16 H12 C12 0 6 4 0 4 C-6 4 -12 0 -12 -16 Z M0 4 V16 M-8 16 H8',
  pastilla: 'M-14 6 L6 -14 C10 -18 18 -10 14 -6 L-6 14 C-10 18 -18 10 -14 6 Z M-4 -4 L4 4',
  estres: 'M-16 10 L-8 -6 L0 6 L8 -12 L16 4',
  termometro: 'M-4 6 V-14 a4 4 0 0 1 8 0 V6 a8 8 0 1 1 -8 0 Z',
  plato: 'M0 -14 a14 14 0 1 0 0.1 0 M-20 -14 V14 M20 -14 V14',
  cara: 'M0 -16 a16 16 0 1 0 0.1 0 M-6 -4 v1 M6 -4 v1 M-7 6 Q0 12 7 6',
  bolsa: 'M-12 -10 H12 L14 16 H-14 Z M-12 -10 L-8 -16 H8 L12 -10',
  habla: 'M-18 -12 H18 V8 H-2 L-10 16 V8 H-18 Z',
  pulmon: 'M-4 -16 V0 M-4 -6 C-16 -10 -20 4 -18 12 C-16 18 -6 16 -4 8 Z M4 -16 V0 M4 -6 C16 -10 20 4 18 12 C16 18 6 16 4 8 Z',
};
export const NOMBRES_ICONOS = Object.keys(ICONOS);

export function icono(padre, nombre, { r = 32, fondo = 'var(--clfh-tarjeta)', trazo = 'var(--clfh-tinta)', borde = 'var(--clfh-borde)' } = {}) {
  const g = svg('g', { class: 'clase-fh-icono' }, padre);
  svg('circle', { r, fill: fondo, stroke: borde, 'stroke-width': 2 }, g);
  const k = r / 32;
  svg('path', { d: ICONOS[nombre] || ICONOS.cara, transform: k !== 1 ? `scale(${Math.round(k * 1000) / 1000})` : null, fill: 'none', stroke: trazo, 'stroke-width': 3.4 / Math.max(0.6, k) * k, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
  return g;
}

// Fondo de cielo (claro u oscuro según el tema) con un gradiente vertical.
export function fondoCielo(ctx, { arriba = 'var(--clfh-cielo-1)', abajo = 'var(--clfh-cielo-2)', padre = ctx.capa } = {}) {
  const id = idUnico('fhcielo');
  const g = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
  svg('stop', { offset: 0, 'stop-color': arriba }, g);
  svg('stop', { offset: 1, 'stop-color': abajo }, g);
  return svg('rect', { width: ANCHO, height: ALTO, fill: `url(#${id})` }, padre);
}

export function degradado(ctx, colores, { x2 = 0, y2 = 1, radial = false } = {}) {
  const id = idUnico('fhdeg');
  const g = radial ? svg('radialGradient', { id, cx: 0.5, cy: 0.5, r: 0.5 }, ctx.defs) : svg('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, ctx.defs);
  colores.forEach(([o, c, a = 1]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, g));
  return `url(#${id})`;
}

// Un rótulo en forma de píldora con un punto de color: { texto, x, y, tono, ancla: 'inicio'|'medio'|'fin', tam }.
const TONOS = { naranja: 'var(--clfh-naranja)', azul: 'var(--clfh-azul)', bien: 'var(--clfh-bien)', mal: 'var(--clfh-mal)', ambar: 'var(--clfh-ambar)', neutro: 'var(--clfh-tinta-suave)' };
export function pildora(padre, { texto, x = 0, y = 0, tono = 'naranja', ancla = 'inicio', tam = 26 }) {
  const g = svg('g', { class: 'clase-fh-rotulo' }, padre);
  const alto = tam * 1.9, ancho = anchoTexto(texto, tam, 650) + tam * 2.3;
  const x0 = ancla === 'medio' ? -ancho / 2 : ancla === 'fin' ? -ancho : 0;
  const caja = svg('g', {}, g);
  svg('rect', { x: f1(x0), y: f1(-alto / 2), width: f1(ancho), height: f1(alto), rx: f1(alto / 2), fill: 'var(--clfh-tarjeta)', stroke: TONOS[tono] || TONOS.naranja, 'stroke-width': 2.5, class: 'clase-fh-sombra' }, caja);
  svg('circle', { cx: f1(x0 + tam * 0.95), cy: 0, r: f1(tam * 0.26), fill: TONOS[tono] || TONOS.naranja }, caja);
  T(caja, x0 + tam * 1.55, tam * 0.36, texto, { tam, peso: 650 });
  mover(g, x, y);
  return { g, caja, ancho, alto, x, y };
}

// ---------- Montaje ----------
export function montarFH(contenedor, opciones = {}, construir) {
  const quieto = opciones.quieto ?? prefiereMenosMovimiento();
  const duracion = Number(opciones.duracion_s) > 0 ? Number(opciones.duracion_s) : 30;
  const raiz = el('div', { class: `clase-visual clase-fh ${opciones.clase || ''}`.trim() }, contenedor);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo clase-fh-lienzo', role: 'img', 'aria-label': [opciones.titulo, ...(opciones.rotulos || []).map(r => r.texto)].filter(Boolean).join('. ') }, raiz);
  const defs = svg('defs', {}, lienzo);
  const capa = svg('g', { class: 'clase-fh-dibujo' }, lienzo);
  const capaTexto = svg('g', { class: 'clase-fh-capa-texto' }, lienzo);
  const ctx = { lienzo, defs, capa, capaTexto, duracion, quieto, opciones, seg: x => x / duracion };
  const dibujar = construir(ctx) || (() => {});

  // Título arriba a la izquierda (cada escena puede pedir otro lugar o ninguno).
  let cabecera = null;
  if (opciones.titulo && opciones.cabecera !== false) {
    if (opciones.velo !== false) {
      const id = idUnico('fhvelo');
      const g = svg('radialGradient', { id, cx: 0.22, cy: 0.28, r: 0.62 }, defs);
      svg('stop', { offset: 0, 'stop-color': 'var(--clfh-velo)' }, g);
      svg('stop', { offset: 0.6, 'stop-color': 'var(--clfh-velo)', 'stop-opacity': 0.55 }, g);
      svg('stop', { offset: 1, 'stop-color': 'var(--clfh-velo)', 'stop-opacity': 0 }, g);
      svg('rect', { x: -200, y: -200, width: 1300, height: 520, fill: `url(#${id})`, class: 'clase-fh-velo' }, capaTexto);
    }
    cabecera = svg('g', { class: 'clase-fh-cabecera' }, capaTexto);
    const cx = opciones.cabeceraX ?? 64, cy = opciones.cabeceraY ?? 74;
    if (opciones.antetitulo) T(cabecera, 0, 0, String(opciones.antetitulo).toUpperCase(), { tam: 17, peso: 750, color: 'var(--clfh-naranja-texto)', espacio: 2.2 });
    const tit = T(cabecera, 0, 44, opciones.titulo, { tam: 40, peso: 800, color: opciones.tintaTitulo || 'var(--clfh-tinta)', clase: 'clase-fh-titulo' });
    svg('rect', { x: 0, y: 60, width: 64, height: 5, rx: 2.5, fill: 'var(--clfh-naranja)' }, cabecera);
    cabecera.dataset.x = cx; cabecera.dataset.y = cy;
    void tit;
  }
  const rotulos = (opciones.rotulos || []).filter(r => r && r.texto).map(r => ({ ...r, ...pildora(capaTexto, r) }));

  const medida = { t: 0 };
  const m = {
    t: 0, s: 0,
    lin: (a, b) => (quieto ? cuantizar(medida.t, a, b) : tramo(medida.t, a, b)),
    e: (a, b) => (quieto ? cuantizar(medida.t, a, b) : salida(tramo(medida.t, a, b))),
    entre: (a, b) => medida.t >= a && medida.t < b,
    onda: (periodo, fase = 0) => (quieto ? 0 : Math.sin(2 * Math.PI * (medida.t * duracion / periodo + fase))),
  };

  function pintar(t) {
    medida.t = t; m.t = t; m.s = t * duracion;
    dibujar(m);
    const entrada = Math.min(0.08, 0.6 / duracion);
    if (cabecera) {
      const a = quieto ? 1 : salida(tramo(t, 0, entrada * 1.4));
      mover(cabecera, Number(cabecera.dataset.x), Number(cabecera.dataset.y) + (1 - a) * 14);
      opacidad(cabecera, a);
    }
    for (const r of rotulos) {
      const a = quieto ? (alfaRotulo(r, t, 0) > 0 ? 1 : 0) : alfaRotulo(r, t, entrada);
      opacidad(r.g, a);
      mover(r.g, r.x, r.y + (1 - salida(a)) * 16);
      r.g.setAttribute('visibility', a > 0 ? 'visible' : 'hidden');
    }
  }
  pintar(0);
  return {
    raiz,
    tiempo(t) { pintar(limitar(Number(t) || 0, 0, 1)); },
    pausar() {},
    destruir() { raiz.remove(); },
  };
}

// Junta los textos de la escena: los de la tabla del módulo con los que lleguen en opciones.textos.
export const textosDe = (base, opciones) => ({ ...base, ...(opciones?.textos || {}) });

// Un instrumento redondo sencillo: 'velocidad' (aguja 0..160 nudos), 'actitud' (alabeo y cabeceo) o 'altitud' (pies).
// Devuelve { g, poner(valor) }; para 'actitud' valor = { alabeo, cabeceo } en grados.
export function instrumento(ctx, padre, tipo, { r = 80 } = {}) {
  const g = svg('g', { class: `clase-fh-instrumento clase-fh-instrumento-${tipo}` }, padre);
  svg('circle', { r: r + 10, fill: 'var(--clfh-cabina-3)' }, g);
  svg('circle', { r: r + 4, fill: '#0a0f18' }, g);
  if (tipo === 'actitud') {
    const id = idUnico('fhact');
    const recorte = svg('clipPath', { id }, ctx.defs);
    svg('circle', { r }, recorte);
    const dentro = svg('g', { 'clip-path': `url(#${id})` }, g);
    const mundo = svg('g', {}, dentro);
    svg('rect', { x: -r * 3, y: -r * 3, width: r * 6, height: r * 3, fill: '#3d8fe0' }, mundo);
    svg('rect', { x: -r * 3, y: 0, width: r * 6, height: r * 3, fill: '#9a6334' }, mundo);
    svg('line', { x1: -r * 3, x2: r * 3, y1: 0, y2: 0, stroke: '#fff', 'stroke-width': 2.5 }, mundo);
    for (const k of [-2, -1, 1, 2]) svg('line', { x1: -r * (0.12 + 0.06 * Math.abs(k)), x2: r * (0.12 + 0.06 * Math.abs(k)), y1: k * r * 0.2, y2: k * r * 0.2, stroke: '#fff', 'stroke-width': 2 }, mundo);
    svg('path', { d: `M${-r * 0.55} 0 H${-r * 0.18} L0 ${r * 0.12} L${r * 0.18} 0 H${r * 0.55}`, fill: 'none', stroke: '#fb923c', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    svg('circle', { r: 4, fill: '#fb923c' }, g);
    svg('path', { d: `M0 ${-r + 2} l-7 14 h14 Z`, fill: '#fb923c' }, g);
    return { g, poner(v) { const a = v?.alabeo || 0, c = v?.cabeceo || 0; mundo.setAttribute('transform', `rotate(${f1(-a)}) translate(0 ${f1(c * r * 0.04)})`); } };
  }
  svg('circle', { r, fill: '#0e1420' }, g);
  const marcas = tipo === 'velocidad' ? 16 : 10;
  for (let k = 0; k < (tipo === 'velocidad' ? 17 : 50); k++) {
    const largo = tipo === 'velocidad' ? (k % 2 ? 8 : 15) : (k % 5 ? 6 : 14);
    const ang = tipo === 'velocidad' ? -225 + k * (270 / 16) : -90 + k * 7.2;
    const x = Math.cos(rad(ang)), y = Math.sin(rad(ang));
    svg('line', { x1: f1(x * (r - 4)), y1: f1(y * (r - 4)), x2: f1(x * (r - 4 - largo)), y2: f1(y * (r - 4 - largo)), stroke: '#e8eef8', 'stroke-width': k % (tipo === 'velocidad' ? 2 : 5) ? 1.6 : 3 }, g);
  }
  if (tipo === 'velocidad') {
    const arco = (a0, a1, color, rr) => {
      const p0 = [Math.cos(rad(a0)) * rr, Math.sin(rad(a0)) * rr], p1 = [Math.cos(rad(a1)) * rr, Math.sin(rad(a1)) * rr];
      svg('path', { d: `M${f1(p0[0])} ${f1(p0[1])} A${rr} ${rr} 0 0 1 ${f1(p1[0])} ${f1(p1[1])}`, fill: 'none', stroke: color, 'stroke-width': 6 }, g);
    };
    const angV = v => -225 + (limitar(v, 0, 160) / 160) * 270;
    arco(angV(40), angV(85), '#e8eef8', r - 8);
    arco(angV(50), angV(125), '#22c55e', r - 2);
    arco(angV(125), angV(150), '#facc15', r - 2);
    for (let k = 0; k <= 160; k += 40) { const a = rad(angV(k)); T(g, Math.cos(a) * (r - 36), Math.sin(a) * (r - 36) + 7, String(k), { tam: 17, peso: 700, color: '#e8eef8', ancla: 'middle' }); }
    T(g, 0, r * 0.45, 'KT', { tam: 15, peso: 700, color: '#9fb0c8', ancla: 'middle' });
    const aguja = svg('path', { d: `M-5 8 L0 ${-(r - 12)} L5 8 Z`, fill: '#ffffff' }, g);
    svg('circle', { r: 7, fill: '#fb923c' }, g);
    return { g, poner(v) { aguja.setAttribute('transform', `rotate(${f1(angV(v) + 90)})`); } };
  }
  for (let k = 0; k < marcas; k++) { const a = rad(-90 + k * 36); T(g, Math.cos(a) * (r - 30), Math.sin(a) * (r - 30) + 7, String(k), { tam: 18, peso: 700, color: '#e8eef8', ancla: 'middle' }); }
  T(g, 0, r * 0.42, 'ALT', { tam: 14, peso: 700, color: '#9fb0c8', ancla: 'middle' });
  const corta = svg('path', { d: `M-6 6 L0 ${-(r * 0.5)} L6 6 Z`, fill: '#ffffff' }, g);
  const larga = svg('path', { d: `M-3.5 6 L0 ${-(r - 12)} L3.5 6 Z`, fill: '#ffffff' }, g);
  svg('circle', { r: 7, fill: '#fb923c' }, g);
  return {
    g,
    poner(pies) {
      larga.setAttribute('transform', `rotate(${f1(((pies % 1000) / 1000) * 360)})`);
      corta.setAttribute('transform', `rotate(${f1(((pies % 10000) / 10000) * 360)})`);
    },
  };
}
