// Escenario de decisión: una situación de vuelo (ilustración + texto), de 2 a 4 opciones, y para cada opción su
// consecuencia (animación + texto), cuál era la correcta y el «concepto a recordar».
//
// API: montarEscenario(contenedor, escenario, opciones) → { elegir(i), reiniciar(), modo(m), tiempo(t), pausar(b), destruir() }
//   escenario: { titulo?, situacion, ilustracion?: { tipo: 'ruta' | 'pista' }, concepto,
//                opciones: [{ texto, correcta: bool, consecuencia, animacion?: 'virar'|'nube'|'subir'|'aterrizar'|'seguir' }] }
//   opciones: { alResolver({indice, correcta}), textos }
// Lógica pura (para las pruebas): evaluarEleccion(escenario, i), validarEscenario(escenario).

import { el, svg, limitar, mezclar, suave, idUnico, prefiereMenosMovimiento, crearBucle, boton, f1, conTextos } from './comun.js';

export const TEXTOS_ESCENARIO = {
  etiqueta: 'Escenario de vuelo', situacion: 'La situación', pregunta: '¿Qué haces?',
  bien: 'Buena decisión', mal: 'Piénsalo otra vez', correcta: 'La mejor decisión era:',
  concepto: 'Concepto a recordar', otraVez: 'Intentar otra vez', elegida: 'Tu elección',
};

export function validarEscenario(e) {
  const errores = [];
  if (!e || typeof e.situacion !== 'string' || !e.situacion.trim()) errores.push('falta la situación');
  const ops = e?.opciones;
  if (!Array.isArray(ops) || ops.length < 2 || ops.length > 4) errores.push('hacen falta de 2 a 4 opciones');
  else {
    if (ops.filter(o => o.correcta).length !== 1) errores.push('debe haber exactamente una opción correcta');
    ops.forEach((o, i) => {
      if (!o.texto) errores.push(`la opción ${i + 1} no tiene texto`);
      if (!o.consecuencia) errores.push(`la opción ${i + 1} no tiene consecuencia`);
    });
  }
  if (!e?.concepto) errores.push('falta el concepto a recordar');
  return errores;
}

export function evaluarEleccion(escenario, indice) {
  const ops = escenario.opciones || [];
  if (!Number.isInteger(indice) || indice < 0 || indice >= ops.length) throw new RangeError('opción fuera de rango');
  const indiceCorrecto = ops.findIndex(o => o.correcta);
  const elegida = ops[indice];
  return {
    indice, indiceCorrecto, correcta: indice === indiceCorrecto,
    consecuencia: elegida.consecuencia, animacion: elegida.animacion || (indice === indiceCorrecto ? 'virar' : 'seguir'),
    textoCorrecto: ops[indiceCorrecto]?.texto ?? null,
  };
}

// La trayectoria del avión (x, y, escalaX para «dar la vuelta», niebla 0..1, inclinación) según la animación y el avance.
export function trayectoria(animacion, p) {
  const base = { x: 150, y: 150, giro: 1, niebla: 0, inclinacion: 0 };
  const s = suave(limitar(p, 0, 1));
  switch (animacion) {
    case 'virar': {
      const giro = Math.cos(Math.PI * limitar((p - 0.15) / 0.4, 0, 1));
      const x = p < 0.15 ? mezclar(150, 210, p / 0.15) : p < 0.55 ? 210 + 20 * Math.sin(Math.PI * (p - 0.15) / 0.4) : mezclar(210, 90, suave((p - 0.55) / 0.45));
      return { ...base, x, y: 150 - 10 * Math.sin(Math.PI * s), giro, inclinacion: 0 };
    }
    case 'nube': return { ...base, x: mezclar(150, 470, s), y: 150 + 30 * s * s, niebla: limitar((p - 0.45) / 0.4, 0, 1), inclinacion: 18 * limitar((p - 0.6) / 0.4, 0, 1) };
    case 'subir': return { ...base, x: mezclar(150, 400, s), y: mezclar(150, 70, s), niebla: limitar((p - 0.5) / 0.4, 0, 1), inclinacion: -14 * Math.sin(Math.PI * s) };
    case 'aterrizar': return { ...base, x: mezclar(150, 120, s), y: mezclar(150, 236, s), giro: Math.cos(Math.PI * limitar(p / 0.35, 0, 1)), inclinacion: 6 * Math.sin(Math.PI * s) };
    default: return { ...base, x: mezclar(150, 520, s), y: 150 };
  }
}

const ANCHO = 640, ALTO = 300;

export function montarEscenario(contenedor, escenario, opciones = {}) {
  const T = conTextos(TEXTOS_ESCENARIO, opciones.textos);
  const quieto = prefiereMenosMovimiento();
  let resultado = null, avance = 0, reloj = 0;

  const raiz = el('div', { class: 'clase-visual clase-escenario' }, contenedor);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-lienzo', role: 'img', 'aria-label': `${T.etiqueta}: ${escenario.situacion}` }, raiz);
  const defs = svg('defs', {}, lienzo);
  const idCielo = idUnico('cieloE');
  const gc = svg('linearGradient', { id: idCielo, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svg('stop', { offset: 0, class: 'clase-cielo-arriba' }, gc);
  svg('stop', { offset: 1, class: 'clase-cielo-abajo' }, gc);
  svg('rect', { width: ANCHO, height: ALTO, fill: `url(#${idCielo})` }, lienzo);
  // Montañas lejanas, terreno y (según el tipo) una pista.
  svg('path', { d: 'M0 230L70 170L130 205L210 140L300 210L380 150L450 200L540 130L640 190L640 300L0 300Z', class: 'clase-montana-lejos' }, lienzo);
  svg('path', { d: 'M0 250Q160 225 320 248T640 240L640 300L0 300Z', class: 'clase-terreno' }, lienzo);
  if (escenario.ilustracion?.tipo === 'pista' || escenario.opciones.some(o => o.animacion === 'aterrizar')) {
    svg('path', { d: 'M40 268L210 262L222 276L30 284Z', class: 'clase-pista' }, lienzo);
    svg('path', { d: 'M60 273L200 268', class: 'clase-pista-linea' }, lienzo);
  }
  // Banco de nubes bajas adelante (tapan las montañas).
  const nubes = svg('g', { class: 'clase-nubes-bajas' }, lienzo);
  for (const [x, y, r, sombra] of [[440, 214, 34, 1], [500, 222, 42, 1], [570, 218, 48, 1], [640, 214, 52, 1],
    [420, 160, 40], [470, 128, 54], [535, 140, 52], [600, 118, 60], [655, 150, 54], [455, 190, 42], [520, 186, 50], [590, 178, 56], [650, 190, 50]]) {
    svg('circle', { cx: x, cy: y, r, class: sombra ? 'clase-nube-sombra' : null }, nubes);
  }
  const avion = svg('g', { class: 'clase-avion-lado' }, lienzo);
  dibujarAvion(avion);
  const niebla = svg('rect', { width: ANCHO, height: ALTO, class: 'clase-niebla', opacity: 0 }, lienzo);

  const cuerpo = el('div', { class: 'clase-panel clase-escenario-cuerpo' }, raiz);
  if (escenario.titulo) el('h3', { class: 'clase-escenario-titulo' }, cuerpo, escenario.titulo);
  el('p', { class: 'clase-escenario-situacion' }, cuerpo, escenario.situacion);
  el('p', { class: 'clase-escenario-pregunta' }, cuerpo, T.pregunta);
  const lista = el('div', { class: 'clase-opciones', role: 'group', 'aria-label': T.pregunta }, cuerpo);
  const botones = escenario.opciones.map((o, i) => {
    const b = boton(lista, '', () => elegir(i), { class: 'clase-opcion' });
    el('span', { class: 'clase-opcion-letra', 'aria-hidden': 'true' }, b, String.fromCharCode(65 + i));
    el('span', { class: 'clase-opcion-texto' }, b, o.texto);
    return b;
  });
  const respuesta = el('div', { class: 'clase-respuesta', role: 'status', 'aria-live': 'polite', hidden: true }, cuerpo);
  const rTitulo = el('strong', { class: 'clase-respuesta-titulo' }, respuesta);
  const rTexto = el('p', {}, respuesta);
  const rCorrecta = el('p', { class: 'clase-respuesta-correcta' }, respuesta);
  const concepto = el('div', { class: 'clase-concepto' }, respuesta);
  el('span', { class: 'clase-concepto-titulo' }, concepto, T.concepto);
  el('p', {}, concepto, escenario.concepto);
  const bOtra = boton(respuesta, T.otraVez, () => reiniciar());

  function pintarAvion() {
    const anim = resultado?.animacion ?? 'quieto';
    const p = resultado ? avance : 0;
    const t = resultado ? trayectoria(anim, p) : { x: 150, y: 150 + Math.sin(reloj * 1.6) * 4, giro: 1, niebla: 0, inclinacion: Math.sin(reloj * 1.1) * 2 };
    avion.setAttribute('transform', `translate(${f1(t.x)} ${f1(t.y)}) rotate(${f1(t.inclinacion)}) scale(${f1(Math.abs(t.giro) < 0.08 ? 0.08 * Math.sign(t.giro || 1) : t.giro)} 1)`);
    niebla.setAttribute('opacity', f1(t.niebla * 0.92));
    nubes.setAttribute('transform', `translate(${f1(-((reloj * 6) % 30))} 0)`);
  }

  function elegir(i) {
    if (resultado) return;
    resultado = evaluarEleccion(escenario, i);
    avance = quieto ? 1 : 0;
    botones.forEach((b, j) => {
      b.disabled = true;
      b.classList.toggle('clase-opcion-correcta', j === resultado.indiceCorrecto);
      b.classList.toggle('clase-opcion-incorrecta', j === i && !resultado.correcta);
      if (j === i) b.setAttribute('aria-label', `${T.elegida}: ${escenario.opciones[j].texto}`);
    });
    respuesta.hidden = false;
    respuesta.className = `clase-respuesta ${resultado.correcta ? 'clase-respuesta-bien' : 'clase-respuesta-mal'}`;
    rTitulo.textContent = resultado.correcta ? T.bien : T.mal;
    rTexto.textContent = resultado.consecuencia;
    rCorrecta.textContent = resultado.correcta ? '' : `${T.correcta} ${resultado.textoCorrecto}`;
    rCorrecta.hidden = resultado.correcta;
    pintarAvion();
    opciones.alResolver?.({ indice: i, correcta: resultado.correcta });
  }

  function reiniciar() {
    resultado = null; avance = 0;
    botones.forEach(b => { b.disabled = false; b.classList.remove('clase-opcion-correcta', 'clase-opcion-incorrecta'); b.removeAttribute('aria-label'); });
    respuesta.hidden = true;
    pintarAvion();
    botones[0]?.focus();
  }
  void bOtra;

  const bucle = crearBucle(raiz, dt => {
    reloj += dt;
    if (resultado && avance < 1) avance = Math.min(1, avance + dt / 4.5);
    pintarAvion();
  });
  pintarAvion();
  if (!quieto) bucle.iniciar();

  return {
    raiz, elegir, reiniciar,
    get resuelto() { return Boolean(resultado); },
    get resultado() { return resultado; },
    tiempo() {}, modo() {},
    pausar(si) { if (si || quieto) bucle.detener(); else bucle.iniciar(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}

// Avioneta de ala alta vista de lado (mira a la derecha), centrada en (0,0).
export function dibujarAvion(g) {
  svg('path', { d: 'M-44 -2Q-40 -9 -20 -9L18 -10Q30 -10 36 -4L42 -1Q44 2 40 4L-20 7Q-38 7 -44 3Z', class: 'clase-avion-fuselaje' }, g);
  svg('path', { d: 'M-44 -2L-52 -20L-44 -20L-34 -6Z', class: 'clase-avion-cola' }, g);
  svg('path', { d: 'M-48 0L-30 -1L-30 2L-46 3Z', class: 'clase-avion-cola' }, g);
  svg('path', { d: 'M-14 -12L26 -12L28 -9L-14 -9Z', class: 'clase-avion-ala' }, g);
  svg('path', { d: 'M8 -9L18 -9L22 -3L10 -3Z', class: 'clase-avion-ventana' }, g);
  svg('path', { d: 'M4 -9L2 4M6 -9L10 4', class: 'clase-avion-montante' }, g);
  svg('ellipse', { cx: 44, cy: 0, rx: 2.5, ry: 13, class: 'clase-avion-helice' }, g);
  svg('circle', { cx: -6, cy: 9, r: 3.2, class: 'clase-avion-rueda' }, g);
  svg('circle', { cx: 30, cy: 7, r: 2.6, class: 'clase-avion-rueda' }, g);
}
