// Meteorología animada (genérica, para reutilizar): cómo nace una nube cuando el aire caliente sube y se enfría,
// y cómo pasa un frente frío levantando el aire cálido.
//
// API: montarMeteo(contenedor, opciones) → { tiempo(t), poner({escena, avance}), modo(m), pausar(b), destruir() }
//   opciones: { escena: 'conveccion' | 'frente', modo, duracion_s: 14, claves: [{t, avance}], textos }
// Lógica pura (para las pruebas): etapaConveccion(avance), estadoFrente(avance), ETAPAS_CONVECCION.

import { el, svg, limitar, mezclar, suave, idUnico, interpolarClaves, prefiereMenosMovimiento, crearBucle, boton,
  f1, conTextos } from './comun.js';

export const ETAPAS_CONVECCION = ['calienta', 'sube', 'condensa', 'nube'];

export const TEXTOS_METEO = {
  etiqueta_conveccion: 'Aire caliente que sube y forma una nube',
  etiqueta_frente: 'Un frente frío que avanza y levanta el aire cálido',
  conveccion: 'Nube por aire que sube', frente: 'Paso de un frente frío',
  calienta: 'El sol calienta el suelo y el aire que toca.',
  sube: 'Ese aire caliente pesa menos y sube; al subir se expande y se enfría.',
  condensa: 'Al llegar a cierta altura se enfría lo bastante: el vapor se vuelve gotitas.',
  nube: 'Aparece la nube (cúmulo), con su base plana a esa altura.',
  f_antes: 'El aire frío avanza como una cuña pegada al suelo.',
  f_sube: 'Mete su punta por debajo del aire cálido y lo obliga a subir.',
  f_nubes: 'El aire cálido que sube forma nubes de desarrollo y lluvia sobre el frente.',
  nivel: 'Nivel de condensación', aireFrio: 'Aire frío', aireCalido: 'Aire cálido', frenteFrio: 'Frente frío',
  n_calienta: 'Calor', n_sube: 'Sube', n_condensa: 'Se enfría', n_nube: 'Nube',
  n_f_antes: 'Avanza', n_f_sube: 'Levanta', n_f_nubes: 'Nubes',
  reproducir: 'Reproducir', pausar: 'Pausar', avance: 'Avance',
};

// Convección: en qué etapa va (avance 0..1), dónde está la burbuja y cuánto creció la nube.
export function etapaConveccion(avance) {
  const a = limitar(avance, 0, 1);
  const etapa = a < 0.2 ? 'calienta' : a < 0.55 ? 'sube' : a < 0.66 ? 'condensa' : 'nube';
  const subida = suave(limitar((a - 0.2) / 0.42, 0, 1)); // 0 en el suelo, 1 en el nivel de condensación
  const nube = suave(limitar((a - 0.58) / 0.38, 0, 1));
  const calor = limitar(a / 0.2, 0, 1);
  return { avance: a, etapa, indice: ETAPAS_CONVECCION.indexOf(etapa), subida, nube, calor, enfriamiento: subida };
}

// Frente frío: dónde está la punta de la cuña (0 a la izquierda, 1 a la derecha) y cuánto creció la nube.
export function estadoFrente(avance) {
  const a = limitar(avance, 0, 1);
  const punta = mezclar(0.12, 0.78, a);
  const nube = suave(limitar((a - 0.15) / 0.55, 0, 1));
  const lluvia = limitar((a - 0.45) / 0.25, 0, 1);
  const etapa = a < 0.25 ? 'f_antes' : a < 0.5 ? 'f_sube' : 'f_nubes';
  return { avance: a, punta, nube, lluvia, etapa };
}

const ANCHO = 640, ALTO = 400, SUELO = 340, NIVEL = 150;

export function montarMeteo(contenedor, opciones = {}) {
  const T = conTextos(TEXTOS_METEO, opciones.textos);
  const quieto = prefiereMenosMovimiento();
  let escena = opciones.escena === 'frente' ? 'frente' : 'conveccion';
  let modo = opciones.modo === 'explicacion' ? 'explicacion' : 'interactivo';
  let avance = quieto ? 0.85 : Number(opciones.avance ?? 0);
  let andando = !quieto;
  let reloj = 0;
  const duracion = Number(opciones.duracion_s ?? 14);

  const raiz = el('div', { class: 'clase-visual clase-meteo' }, contenedor);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo', role: 'img' }, raiz);
  const defs = svg('defs', {}, lienzo);
  const grad = (tipo, attrs, paradas) => {
    const id = idUnico('w');
    const g = svg(tipo, { id, ...attrs }, defs);
    for (const [o, clase] of paradas) svg('stop', { offset: o, class: clase }, g);
    return `url(#${id})`;
  };
  const cielo = grad('linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'clase-cielo-arriba'], [1, 'clase-cielo-abajo']]);
  const burbujaG = grad('radialGradient', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'clase-burbuja-1'], [1, 'clase-burbuja-2']]);
  const burbujaFria = grad('radialGradient', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'clase-burbuja-fria-1'], [1, 'clase-burbuja-fria-2']]);
  const nubeG = grad('linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'clase-nube-1'], [1, 'clase-nube-2']]);
  const frioG = grad('linearGradient', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, 'clase-frio-1'], [1, 'clase-frio-2']]);

  svg('rect', { width: ANCHO, height: ALTO, fill: cielo }, lienzo);
  const capa = svg('g', {}, lienzo);
  const pie = el('div', { class: 'clase-panel' }, raiz);
  const pasos = el('ol', { class: 'clase-tiempos clase-meteo-pasos' }, pie);
  const texto = el('p', { class: 'clase-motor-descripcion', 'aria-live': 'polite' }, pie);
  const controles = el('div', { class: 'clase-botones' }, pie);
  const bEscenas = ['conveccion', 'frente'].map(n => boton(controles, T[n], () => cambiarEscena(n), { class: 'clase-boton clase-segmento' }));
  const bPlay = boton(controles, '', () => { andando = !andando; pintarBotones(); }, { class: 'clase-boton clase-boton-principal' });
  const filaAvance = el('label', { class: 'clase-deslizador' }, pie);
  el('span', { class: 'clase-deslizador-nombre' }, filaAvance, T.avance);
  const rango = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: avance }, filaAvance);
  rango.addEventListener('input', () => { avance = Number(rango.value); andando = false; pintarBotones(); dibujar(); });

  let partes = {};

  function pintarBotones() {
    bPlay.textContent = andando ? T.pausar : T.reproducir;
    bPlay.setAttribute('aria-pressed', String(andando));
    bEscenas.forEach((b, i) => b.setAttribute('aria-pressed', String(['conveccion', 'frente'][i] === escena)));
  }

  function nube(padre, x, y, ancho) {
    const g = svg('g', { class: 'clase-nube' }, padre);
    const bolas = [[-0.38, -0.18, 0.3], [-0.1, -0.42, 0.38], [0.22, -0.3, 0.33], [0.42, -0.08, 0.24], [-0.5, 0, 0.2], [0.05, -0.12, 0.34]];
    for (const [dx, dy, r] of bolas) svg('circle', { cx: f1(dx * ancho), cy: f1(dy * ancho), r: f1(r * ancho), fill: nubeG }, g);
    svg('rect', { x: f1(-0.62 * ancho), y: 0, width: f1(1.2 * ancho), height: f1(0.12 * ancho), rx: 6, fill: nubeG }, g);
    g.setAttribute('transform', `translate(${x} ${y})`);
    return g;
  }

  function armar() {
    while (capa.firstChild) capa.removeChild(capa.firstChild);
    while (pasos.firstChild) pasos.removeChild(pasos.firstChild);
    partes = {};
    const nombresPasos = escena === 'conveccion' ? ETAPAS_CONVECCION : ['f_antes', 'f_sube', 'f_nubes'];
    pasos.style.gridTemplateColumns = `repeat(${nombresPasos.length}, minmax(0, 1fr))`;
    partes.pasos = nombresPasos.map((n, i) => { const li = el('li', { class: 'clase-tiempo' }, pasos); el('span', { class: 'clase-tiempo-num' }, li, String(i + 1)); el('span', { class: 'clase-tiempo-nombre' }, li, T[`n_${n}`]); return { n, li }; });
    lienzo.setAttribute('aria-label', T[`etiqueta_${escena}`]);
    if (escena === 'conveccion') {
      const sol = svg('g', { class: 'clase-sol' }, capa);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        svg('line', { x1: f1(70 + Math.cos(a) * 40), y1: f1(64 + Math.sin(a) * 40), x2: f1(70 + Math.cos(a) * 54), y2: f1(64 + Math.sin(a) * 54) }, sol);
      }
      svg('circle', { cx: 70, cy: 64, r: 30 }, sol);
      partes.sol = sol;
      svg('line', { x1: 0, y1: NIVEL, x2: ANCHO, y2: NIVEL, class: 'clase-nivel' }, capa);
      svg('text', { x: ANCHO - 12, y: NIVEL - 10, 'text-anchor': 'end', class: 'clase-etiqueta-svg clase-etiqueta-chica' }, capa, T.nivel);
      partes.calor = svg('ellipse', { cx: 320, cy: SUELO, rx: 120, ry: 26, class: 'clase-calor' }, capa);
      svg('rect', { x: 0, y: SUELO, width: ANCHO, height: ALTO - SUELO, class: 'clase-suelo' }, capa);
      svg('rect', { x: 230, y: SUELO, width: 180, height: 14, class: 'clase-campo' }, capa);
      for (let x = 30; x < ANCHO; x += 90) if (x < 220 || x > 420) arbol(capa, x, SUELO);
      partes.flechas = [0, 1, 2].map(i => svg('path', { class: 'clase-flecha-aire', d: `M${290 + i * 30} 0` }, capa));
      partes.burbuja = svg('circle', { cx: 320, r: 30, fill: burbujaG, class: 'clase-burbuja' }, capa);
      partes.nube = nube(capa, 320, NIVEL, 150);
      partes.termometro = svg('text', { x: 360, class: 'clase-etiqueta-svg clase-etiqueta-chica' }, capa);
    } else {
      partes.calido = svg('rect', { x: 0, y: 0, width: ANCHO, height: SUELO, class: 'clase-aire-calido' }, capa);
      svg('text', { x: ANCHO - 16, y: 300, 'text-anchor': 'end', class: 'clase-etiqueta-svg' }, capa, T.aireCalido);
      partes.flechas = [0, 1, 2].map(() => svg('path', { class: 'clase-flecha-aire' }, capa));
      partes.lluvia = svg('g', { class: 'clase-lluvia' }, capa);
      for (let i = 0; i < 14; i++) svg('line', { x1: i * 9, y1: 0, x2: i * 9 - 6, y2: 18 }, partes.lluvia);
      partes.nube = torre(capa, nubeG);
      partes.yunque = svg('path', { class: 'clase-yunque', fill: nubeG }, capa);
      partes.cuna = svg('path', { fill: frioG, class: 'clase-cuna' }, capa);
      partes.textoFrio = svg('text', { y: 318, class: 'clase-etiqueta-svg' }, capa, T.aireFrio);
      svg('rect', { x: 0, y: SUELO, width: ANCHO, height: ALTO - SUELO, class: 'clase-suelo' }, capa);
      partes.simbolo = svg('g', { class: 'clase-simbolo-frente' }, capa);
      svg('path', { d: `M-6 ${SUELO + 22}L44 ${SUELO + 22}M32 ${SUELO + 12}L46 ${SUELO + 22}L32 ${SUELO + 32}` }, partes.simbolo);
      svg('text', { x: -12, y: SUELO + 29, 'text-anchor': 'end', class: 'clase-etiqueta-svg clase-etiqueta-chica' }, partes.simbolo, T.frenteFrio);
    }
    pintarBotones();
  }

  function dibujar() {
    rango.value = String(avance);
    if (escena === 'conveccion') {
      const e = etapaConveccion(avance);
      partes.calor.setAttribute('opacity', f1(0.12 + 0.4 * e.calor + Math.sin(reloj * 3) * 0.05));
      const y = mezclar(SUELO - 26, NIVEL + 8, e.subida);
      const r = mezclar(26, 44, e.subida);
      partes.burbuja.setAttribute('cy', f1(y));
      partes.burbuja.setAttribute('r', f1(r));
      partes.burbuja.setAttribute('opacity', f1(e.etapa === 'calienta' ? e.calor * 0.6 : 1 - e.nube));
      partes.burbuja.setAttribute('fill', e.subida > 0.6 ? burbujaFria : burbujaG);
      partes.nube.setAttribute('transform', `translate(320 ${NIVEL}) scale(${f1(0.15 + 0.85 * e.nube)} ${f1(0.08 + 0.92 * e.nube)})`);
      partes.nube.setAttribute('opacity', f1(Math.min(1, e.nube * 3)));
      partes.flechas.forEach((f, i) => {
        const x = 270 + i * 50, fase = (reloj * 0.7 + i * 0.33) % 1;
        const y1 = SUELO - 20 - fase * 120, y2 = y1 - 40;
        f.setAttribute('d', `M${x} ${f1(y1)}Q${x + 8} ${f1(y1 - 20)} ${x} ${f1(y2)}M${x - 7} ${f1(y2 + 9)}L${x} ${f1(y2)}L${x + 7} ${f1(y2 + 9)}`);
        f.setAttribute('opacity', f1(e.etapa === 'calienta' ? 0 : Math.sin(Math.PI * fase) * 0.9));
      });
      const temp = Math.round(mezclar(30, 12, e.subida));
      partes.termometro.textContent = e.etapa === 'calienta' && e.calor < 0.4 ? '' : `${temp} °C`;
      partes.termometro.setAttribute('x', f1(320 + r + 8));
      partes.termometro.setAttribute('y', f1(y + 6));
      marcarPaso(e.etapa);
    } else {
      const e = estadoFrente(avance);
      const px = e.punta * ANCHO;
      // Cuña de aire frío: alta atrás, con la punta pegada al suelo (más empinada cerca del frente).
      partes.cuna.setAttribute('d', `M-10 ${SUELO}L-10 150Q${f1(px - 160)} 160 ${f1(px - 50)} 270Q${f1(px - 14)} 320 ${f1(px + 16)} ${SUELO}Z`);
      partes.textoFrio.setAttribute('x', f1(Math.max(16, px - 230)));
      partes.simbolo.setAttribute('transform', `translate(${f1(px + 16)} 0)`);
      const cx = px + 30, top = 250 - 200 * (0.3 + 0.7 * e.nube) + 40;
      partes.nube.setAttribute('transform', `translate(${f1(cx)} 250) scale(${f1(0.3 + 0.7 * e.nube)})`);
      partes.nube.setAttribute('opacity', f1(Math.min(1, e.nube * 2.5)));
      partes.yunque.setAttribute('d', e.nube > 0.6 ? `M${f1(cx - 60)} ${f1(top - 60)}Q${f1(cx)} ${f1(top - 100)} ${f1(cx + 150 * e.nube)} ${f1(top - 74)}L${f1(cx + 150 * e.nube)} ${f1(top - 62)}Q${f1(cx)} ${f1(top - 56)} ${f1(cx - 30)} ${f1(top - 20)}Z` : '');
      partes.yunque.setAttribute('opacity', f1(limitar((e.nube - 0.6) / 0.3, 0, 1)));
      partes.lluvia.setAttribute('opacity', f1(e.lluvia));
      partes.lluvia.setAttribute('transform', `translate(${f1(cx - 60)} ${f1(250 + ((reloj * 120) % 50))})`);
      partes.flechas.forEach((f, i) => {
        const fase = (reloj * 0.6 + i / 3) % 1;
        const x0 = px + 40 + i * 40 - fase * 30, y0 = SUELO - 20 - fase * 140;
        f.setAttribute('d', `M${f1(x0 + 30)} ${f1(y0 + 30)}Q${f1(x0 + 6)} ${f1(y0 + 12)} ${f1(x0)} ${f1(y0 - 10)}M${f1(x0 - 7)} ${f1(y0 - 1)}L${f1(x0)} ${f1(y0 - 10)}L${f1(x0 + 6)} ${f1(y0 - 1)}`);
        f.setAttribute('opacity', f1(Math.sin(Math.PI * fase) * 0.9 * limitar(e.avance * 4, 0, 1)));
      });
      marcarPaso(e.etapa);
    }
  }

  function marcarPaso(etapa) {
    for (const { n, li } of partes.pasos) li.classList.toggle('clase-tiempo-activo', n === etapa);
    const nuevo = T[etapa];
    if (texto.textContent !== nuevo) texto.textContent = nuevo;
  }

  function cambiarEscena(n) {
    escena = n === 'frente' ? 'frente' : 'conveccion';
    avance = quieto ? 0.85 : 0;
    armar();
    dibujar();
  }

  const bucle = crearBucle(raiz, dt => {
    reloj += dt;
    if (andando && modo !== 'explicacion') {
      avance += dt / duracion;
      if (avance > 1.12) avance = 0; // un respiro al final antes de repetir
    }
    const real = avance;
    avance = Math.min(1, avance);
    dibujar();
    avance = real;
  });

  function aplicarModo() {
    raiz.classList.toggle('clase-modo-explicacion', modo === 'explicacion');
    controles.hidden = modo === 'explicacion';
    filaAvance.hidden = modo === 'explicacion';
  }

  armar();
  aplicarModo();
  dibujar();
  if (!quieto) bucle.iniciar();

  return {
    raiz,
    tiempo(t) {
      const v = opciones.claves ? interpolarClaves(opciones.claves, t) : { avance: t };
      if (typeof v.avance === 'number') avance = limitar(v.avance, 0, 1);
      if (quieto || !bucle.activo) dibujar();
    },
    poner(valores = {}) {
      if (valores.escena && valores.escena !== escena) cambiarEscena(valores.escena);
      if (typeof valores.avance === 'number') { avance = limitar(valores.avance, 0, 1); andando = false; pintarBotones(); }
      dibujar();
    },
    modo(m) { modo = m === 'explicacion' ? 'explicacion' : 'interactivo'; aplicarModo(); },
    pausar(si) { if (si || quieto) bucle.detener(); else bucle.iniciar(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}

// Nube de desarrollo vertical (torre), con la base en (0,0) y unos 200 de alto.
function torre(padre, relleno) {
  const g = svg('g', { class: 'clase-nube' }, padre);
  for (const [x, y, r] of [[-70, -22, 30], [-30, -30, 40], [20, -28, 42], [66, -22, 32], [-44, -70, 38], [6, -84, 46], [50, -66, 34],
    [-22, -122, 40], [24, -130, 38], [0, -168, 38], [-30, -158, 28], [30, -172, 26]]) {
    svg('circle', { cx: x, cy: y, r, fill: relleno }, g);
  }
  svg('path', { d: 'M-96 -8Q0 8 92 -8L92 -2Q0 6 -96 -2Z', class: 'clase-nube-panza' }, g);
  return g;
}

function arbol(padre, x, y) {
  svg('rect', { x: x - 3, y: y - 16, width: 6, height: 16, class: 'clase-tronco' }, padre);
  svg('circle', { cx: x, cy: y - 26, r: 14, class: 'clase-copa' }, padre);
}
