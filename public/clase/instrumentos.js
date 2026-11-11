// Los seis instrumentos básicos («six-pack»): anemómetro, horizonte artificial, altímetro, coordinador de giro,
// indicador de rumbo y variómetro. Agujas que se mueven con los datos de vuelo, una demostración de viraje en
// ascenso y la opción de «falla» que congela un instrumento para enseñar a detectarla.
//
// API: montarInstrumentos(contenedor, opciones) → { tiempo(t), poner(lecturas), demo(b), falla(nombre|null),
//        modo(m), pausar(b), destruir() }
//   lecturas: { velocidad (kt), altitud (ft), cabeceo (°), alabeo (°, + derecha), rumbo (°), vs (pies/min), derrape (-1..1) }
//   opciones: { modo, lecturas, demo: true|false, falla: null|'anemometro'|…, claves: [{t, …lecturas}],
//               arcos: {vso, vs1, vfe, vno, vne} (valores de muestra), textos }
// Lógica pura (para las pruebas): agujaAnemometro, agujasAltimetro, agujaVariometro, tasaDeGiro,
//   inclinacionCoordinador, horizonte, tarjetaRumbo, pasoSimulacion, aplicarFalla, INSTRUMENTOS.

import { el, svg, limitar, mezclar, rad, idUnico, interpolarClaves, prefiereMenosMovimiento, crearBucle,
  deslizador, boton, f1, conTextos } from './comun.js';

export const INSTRUMENTOS = ['anemometro', 'actitud', 'altimetro', 'giro', 'rumbo', 'vsi'];

// Qué lecturas usa cada instrumento (las que se congelan cuando falla).
export const LECTURAS_DE = {
  anemometro: ['velocidad'], actitud: ['cabeceo', 'alabeo'], altimetro: ['altitud'],
  giro: ['alabeo', 'velocidad', 'derrape'], rumbo: ['rumbo'], vsi: ['vs'],
};

export const TEXTOS_INSTRUMENTOS = {
  etiqueta: 'Panel con los seis instrumentos básicos',
  anemometro: 'Anemómetro', actitud: 'Horizonte artificial', altimetro: 'Altímetro',
  giro: 'Coordinador de giro', rumbo: 'Indicador de rumbo', vsi: 'Variómetro',
  nudos: 'NUDOS', pies: 'PIES', subir: 'SUBE', bajar: 'BAJA', cienPies: '×100 PIES/MIN', dosMin: '2 MIN',
  izq: 'I', der: 'D', falla: 'FALLA', ninguna: 'Ninguna',
  demo: 'Viraje en ascenso', parar: 'Detener', nivelar: 'Nivelar', simularFalla: 'Simular la falla de',
  velocidad: 'Velocidad', altitud: 'Altitud', cabeceo: 'Cabeceo', alabeo: 'Alabeo', rumboC: 'Rumbo', vs: 'Ascenso / descenso',
  mandos: 'Mueve los datos de vuelo',
  aviso_falla: 'Un instrumento quedó congelado. Compáralo con los otros: si no concuerda, no le creas.',
  muestra: 'Arcos de colores con valores de muestra.',
};

const norm360 = g => ((g % 360) + 360) % 360;

// Ángulo de la aguja del anemómetro (0° = arriba, sentido horario). Hasta 40 kt la escala va apretada.
export function agujaAnemometro(kt) {
  const v = limitar(kt, 0, 200);
  return v <= 40 ? (v / 40) * 20 : 20 + ((v - 40) / 160) * 320;
}

// Las tres agujas del altímetro: centenas (larga), miles (corta) y decenas de miles (fina).
export function agujasAltimetro(pies) {
  const a = Math.max(0, pies);
  return { cien: ((a % 1000) / 1000) * 360, mil: ((a % 10000) / 10000) * 360, diezmil: ((a % 100000) / 100000) * 360 };
}

// Variómetro: 0 a las nueve en punto; subir gira hacia arriba, bajar hacia abajo. Escala hasta ±2000 pies/min.
export function agujaVariometro(fpm) {
  return -90 + (limitar(fpm, -2000, 2000) / 2000) * 170;
}

// Tasa de giro (grados por segundo) para un alabeo y una velocidad verdadera (nudos): 1091·tan(alabeo)/V.
export function tasaDeGiro(alabeo, nudos) {
  if (nudos <= 0) return 0;
  return (1091 * Math.tan(rad(limitar(alabeo, -80, 80)))) / nudos;
}

// El avioncito del coordinador se inclina con la tasa de giro: la marca está en el giro estándar (3°/s).
export const MARCA_ESTANDAR = 20;
export function inclinacionCoordinador(tasa) {
  return limitar((tasa / 3) * MARCA_ESTANDAR, -40, 40);
}

// Horizonte artificial: cuánto baja el horizonte (cabeceo arriba → horizonte abajo) y cuánto gira (al revés del alabeo).
export const PIXELES_POR_GRADO = 3.2;
export function horizonte(cabeceo, alabeo) {
  return { desplazamiento: limitar(cabeceo, -30, 30) * PIXELES_POR_GRADO, rotacion: -alabeo };
}

export const tarjetaRumbo = rumbo => -norm360(rumbo);

// Un paso de la simulación: las lecturas van hacia lo que pide el mando, el rumbo cambia con la tasa de giro
// y la altitud con la velocidad vertical.
export function pasoSimulacion(estado, mando, dt) {
  const hacia = (a, b, k) => a + (b - a) * Math.min(1, k * dt);
  const nuevo = { ...estado };
  for (const [clave, k] of [['velocidad', 0.5], ['alabeo', 1.2], ['cabeceo', 1.2], ['vs', 0.8]]) {
    if (typeof mando[clave] === 'number') nuevo[clave] = hacia(estado[clave], mando[clave], k);
  }
  nuevo.rumbo = norm360(estado.rumbo + tasaDeGiro(nuevo.alabeo, nuevo.velocidad) * dt);
  nuevo.altitud = Math.max(0, estado.altitud + (nuevo.vs / 60) * dt);
  return nuevo;
}

// Con un instrumento en falla, sus lecturas quedan como estaban (congeladas) y el resto sigue vivo.
export function aplicarFalla(lecturas, congeladas, falla) {
  if (!falla || !congeladas) return { ...lecturas };
  const salida = { ...lecturas };
  for (const clave of LECTURAS_DE[falla] || []) salida[clave] = congeladas[clave];
  return salida;
}

export const LECTURAS_INICIALES = { velocidad: 95, altitud: 3000, cabeceo: 0, alabeo: 0, rumbo: 360, vs: 0, derrape: 0 };

// ---------- Dibujo ----------
const C = 100, RC = 88;

function polar(angulo, r) {
  const a = rad(angulo);
  return [C + Math.sin(a) * r, C - Math.cos(a) * r];
}

function arcoPath(a1, a2, r) {
  const [x1, y1] = polar(a1, r), [x2, y2] = polar(a2, r);
  const grande = Math.abs(a2 - a1) > 180 ? 1 : 0;
  return `M${f1(x1)} ${f1(y1)}A${r} ${r} 0 ${grande} ${a2 > a1 ? 1 : 0} ${f1(x2)} ${f1(y2)}`;
}

function marcas(padre, { desde, hasta, cada, largo, r = RC - 4, clase = 'clase-marca' }) {
  for (let a = desde; a <= hasta + 0.001; a += cada) {
    const [x1, y1] = polar(a, r), [x2, y2] = polar(a, r - largo);
    svg('line', { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), class: clase }, padre);
  }
}

function numero(padre, angulo, r, texto, clase = 'clase-num') {
  const [x, y] = polar(angulo, r);
  svg('text', { x: f1(x), y: f1(y + 7), 'text-anchor': 'middle', class: clase }, padre, texto);
}

function aguja(padre, { largo, ancho = 6, cola = 16, clase = 'clase-aguja' }) {
  const g = svg('g', { class: clase }, padre);
  svg('path', { d: `M${C - ancho / 2} ${C + cola}L${C - ancho / 2} ${C - largo + 12}L${C} ${C - largo}L${C + ancho / 2} ${C - largo + 12}L${C + ancho / 2} ${C + cola}Z` }, g);
  return g;
}

function caja(padre, nombre, T) {
  const tarjeta = el('figure', { class: `clase-instrumento clase-instrumento-${nombre}` }, padre);
  const lienzo = svg('svg', { viewBox: '0 0 200 200', class: 'clase-lienzo', role: 'img', 'aria-label': T[nombre] }, tarjeta);
  const defs = svg('defs', {}, lienzo);
  const idBisel = idUnico('bisel');
  const g = svg('linearGradient', { id: idBisel, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  svg('stop', { offset: 0, class: 'clase-bisel-1' }, g);
  svg('stop', { offset: 1, class: 'clase-bisel-2' }, g);
  for (const [x, y] of [[14, 14], [186, 14], [14, 186], [186, 186]]) {
    svg('circle', { cx: x, cy: y, r: 6, class: 'clase-tornillo' }, lienzo);
    svg('line', { x1: x - 4, y1: y - 1, x2: x + 4, y2: y + 1, class: 'clase-tornillo-ranura' }, lienzo);
  }
  svg('circle', { cx: C, cy: C, r: 97, fill: `url(#${idBisel})` }, lienzo);
  svg('circle', { cx: C, cy: C, r: RC + 1, class: 'clase-esfera' }, lienzo);
  const cara = svg('g', {}, lienzo);
  const pie = el('figcaption', { class: 'clase-instrumento-pie' }, tarjeta);
  el('span', { class: 'clase-instrumento-nombre' }, pie, T[nombre]);
  const valor = el('span', { class: 'clase-instrumento-valor' }, pie);
  return { tarjeta, lienzo, defs, cara, valor };
}

function bandera(lienzo, T) {
  const g = svg('g', { class: 'clase-bandera-falla', opacity: 0 }, lienzo);
  svg('rect', { x: 52, y: 120, width: 96, height: 30, rx: 4 }, g);
  svg('text', { x: 100, y: 142, 'text-anchor': 'middle' }, g, T.falla);
  return g;
}

export function montarInstrumentos(contenedor, opciones = {}) {
  const T = conTextos(TEXTOS_INSTRUMENTOS, opciones.textos);
  const quieto = prefiereMenosMovimiento();
  const arcos = { vso: 45, vs1: 50, vfe: 85, vno: 125, vne: 155, ...(opciones.arcos || {}) };
  let modo = opciones.modo === 'explicacion' ? 'explicacion' : 'interactivo';
  let lecturas = { ...LECTURAS_INICIALES, ...(opciones.lecturas || {}) };
  let mostradas = { ...lecturas };
  let falla = null, congeladas = null;
  let demo = Boolean(opciones.demo), relojDemo = 0;

  const raiz = el('div', { class: 'clase-visual clase-instrumentos' }, contenedor);
  const tablero = el('div', { class: 'clase-tablero', role: 'group', 'aria-label': T.etiqueta }, raiz);
  const v = {};

  // Anemómetro.
  {
    const k = caja(tablero, 'anemometro', T);
    const a = x => agujaAnemometro(x);
    svg('path', { d: arcoPath(a(arcos.vso), a(arcos.vfe), RC - 18), class: 'clase-arco-blanco' }, k.cara);
    svg('path', { d: arcoPath(a(arcos.vs1), a(arcos.vno), RC - 8), class: 'clase-arco-verde' }, k.cara);
    svg('path', { d: arcoPath(a(arcos.vno), a(arcos.vne), RC - 8), class: 'clase-arco-amarillo' }, k.cara);
    const [r1x, r1y] = polar(a(arcos.vne), RC - 1), [r2x, r2y] = polar(a(arcos.vne), RC - 20);
    svg('line', { x1: f1(r1x), y1: f1(r1y), x2: f1(r2x), y2: f1(r2y), class: 'clase-linea-roja' }, k.cara);
    for (let kt = 40; kt <= 200; kt += 10) {
      const [x1, y1] = polar(a(kt), RC - 2), [x2, y2] = polar(a(kt), RC - (kt % 20 ? 9 : 14));
      svg('line', { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), class: 'clase-marca' }, k.cara);
      if (kt % 20 === 0) numero(k.cara, a(kt), RC - 30, String(kt));
    }
    svg('text', { x: C, y: 76, 'text-anchor': 'middle', class: 'clase-rotulo-inst' }, k.cara, T.nudos);
    const ag = aguja(k.cara, { largo: 78 });
    svg('circle', { cx: C, cy: C, r: 8, class: 'clase-centro' }, k.cara);
    v.anemometro = { ...k, ag, bandera: bandera(k.lienzo, T) };
  }
  // Horizonte artificial.
  {
    const k = caja(tablero, 'actitud', T);
    const idRecorte = idUnico('recorte');
    const recorte = svg('clipPath', { id: idRecorte }, k.defs);
    svg('circle', { cx: C, cy: C, r: RC }, recorte);
    const ventana = svg('g', { 'clip-path': `url(#${idRecorte})` }, k.cara);
    const gira = svg('g', {}, ventana);
    const mueve = svg('g', {}, gira);
    svg('rect', { x: -200, y: -300, width: 600, height: 400, class: 'clase-cielo-ai' }, mueve);
    svg('rect', { x: -200, y: C, width: 600, height: 400, class: 'clase-tierra-ai' }, mueve);
    svg('line', { x1: -200, y1: C, x2: 400, y2: C, class: 'clase-horizonte-linea' }, mueve);
    for (let g = -30; g <= 30; g += 5) {
      if (!g) continue;
      const y = C - g * PIXELES_POR_GRADO, ancho = g % 10 ? 14 : 30;
      svg('line', { x1: C - ancho, y1: f1(y), x2: C + ancho, y2: f1(y), class: 'clase-escalera' }, mueve);
      if (!(g % 10)) svg('text', { x: C + ancho + 4, y: f1(y + 4), class: 'clase-escalera-num' }, mueve, String(Math.abs(g)));
    }
    // Escala de alabeo (gira con el horizonte) y su índice fijo arriba.
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const [x1, y1] = polar(b, RC - 2), [x2, y2] = polar(b, RC - (b % 30 ? 9 : 16));
      svg('line', { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), class: 'clase-marca' }, gira);
    }
    svg('path', { d: `M${C} ${C - RC + 18}L${C - 8} ${C - RC + 30}L${C + 8} ${C - RC + 30}Z`, class: 'clase-indice-alabeo' }, gira);
    svg('path', { d: `M${C} ${C - RC + 16}L${C - 8} ${C - RC + 4}L${C + 8} ${C - RC + 4}Z`, class: 'clase-avion-fijo' }, k.cara);
    // Avioncito fijo (naranja).
    svg('path', { d: `M${C - 58} ${C}L${C - 20} ${C}L${C - 12} ${C + 9}M${C + 58} ${C}L${C + 20} ${C}L${C + 12} ${C + 9}`, class: 'clase-avion-fijo-alas' }, k.cara);
    svg('circle', { cx: C, cy: C, r: 4.5, class: 'clase-avion-fijo' }, k.cara);
    v.actitud = { ...k, gira, mueve, bandera: bandera(k.lienzo, T) };
  }
  // Altímetro.
  {
    const k = caja(tablero, 'altimetro', T);
    marcas(k.cara, { desde: 0, hasta: 352.8, cada: 7.2, largo: 7 });
    marcas(k.cara, { desde: 0, hasta: 324, cada: 36, largo: 14, clase: 'clase-marca clase-marca-grande' });
    for (let n = 0; n < 10; n++) numero(k.cara, n * 36, RC - 28, String(n));
    svg('rect', { x: 128, y: 89, width: 38, height: 22, rx: 3, class: 'clase-ventanilla' }, k.cara);
    svg('text', { x: 147, y: 105, 'text-anchor': 'middle', class: 'clase-ventanilla-num' }, k.cara, '29.92');
    svg('text', { x: C, y: 68, 'text-anchor': 'middle', class: 'clase-rotulo-inst' }, k.cara, T.pies);
    const diezmil = svg('g', { class: 'clase-aguja clase-aguja-fina' }, k.cara);
    svg('path', { d: `M${C - 1.5} ${C}L${C - 1.5} ${C - 76}L${C - 7} ${C - 66}L${C + 7} ${C - 66}L${C + 1.5} ${C - 76}L${C + 1.5} ${C}Z` }, diezmil);
    const mil = aguja(k.cara, { largo: 48, ancho: 11, cola: 10 });
    const cien = aguja(k.cara, { largo: 78, ancho: 6, cola: 18 });
    svg('circle', { cx: C, cy: C, r: 8, class: 'clase-centro' }, k.cara);
    v.altimetro = { ...k, diezmil, mil, cien, bandera: bandera(k.lienzo, T) };
  }
  // Coordinador de giro.
  {
    const k = caja(tablero, 'giro', T);
    for (const s of [-1, 1]) {
      for (const ang of [0, MARCA_ESTANDAR]) {
        const a = 90 * s + ang * s;
        const [x1, y1] = polar(a, RC - 4), [x2, y2] = polar(a, RC - 20);
        svg('line', { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), class: 'clase-marca clase-marca-grande' }, k.cara);
      }
      const [tx, ty] = polar(90 * s + MARCA_ESTANDAR * s, RC - 32);
      svg('text', { x: f1(tx), y: f1(ty + 6), 'text-anchor': 'middle', class: 'clase-num' }, k.cara, s < 0 ? T.izq : T.der);
    }
    svg('text', { x: C, y: 58, 'text-anchor': 'middle', class: 'clase-rotulo-inst' }, k.cara, T.dosMin);
    const avion = svg('g', { class: 'clase-avion-giro' }, k.cara);
    svg('rect', { x: C - 62, y: C - 4, width: 124, height: 8, rx: 4 }, avion);
    svg('circle', { cx: C, cy: C, r: 11 }, avion);
    svg('rect', { x: C - 3, y: C - 26, width: 6, height: 18, rx: 3 }, avion);
    svg('rect', { x: C - 22, y: C - 13, width: 44, height: 5, rx: 2.5 }, avion);
    // Inclinómetro (la bola).
    svg('path', { d: `M${C - 46} 136Q${C} 156 ${C + 46} 136`, class: 'clase-tubo' }, k.cara);
    svg('line', { x1: C - 10, y1: 134, x2: C - 10, y2: 156, class: 'clase-hilo' }, k.cara);
    svg('line', { x1: C + 10, y1: 134, x2: C + 10, y2: 156, class: 'clase-hilo' }, k.cara);
    const bola = svg('circle', { cx: C, cy: 145.5, r: 8.5, class: 'clase-bola' }, k.cara);
    v.giro = { ...k, avion, bola, bandera: bandera(k.lienzo, T) };
  }
  // Indicador de rumbo.
  {
    const k = caja(tablero, 'rumbo', T);
    const tarjeta = svg('g', {}, k.cara);
    marcas(tarjeta, { desde: 0, hasta: 355, cada: 5, largo: 7 });
    marcas(tarjeta, { desde: 0, hasta: 350, cada: 10, largo: 12, clase: 'clase-marca clase-marca-grande' });
    const nombres = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let a = 0; a < 360; a += 30) {
      const [x, y] = polar(a, RC - 26);
      const t = svg('text', { x: f1(x), y: f1(y + 7), 'text-anchor': 'middle', class: nombres[a] !== undefined ? 'clase-num clase-num-cardinal' : 'clase-num',
        transform: `rotate(${a} ${f1(x)} ${f1(y)})` }, tarjeta, nombres[a] ?? String(a / 10));
      void t;
    }
    svg('path', { d: `M${C} ${C - 34}L${C + 5} ${C - 12}L${C + 30} ${C + 2}L${C + 30} ${C + 8}L${C + 5} ${C + 2}L${C + 4} ${C + 22}L${C + 13} ${C + 30}L${C - 13} ${C + 30}L${C - 4} ${C + 22}L${C - 5} ${C + 2}L${C - 30} ${C + 8}L${C - 30} ${C + 2}L${C - 5} ${C - 12}Z`, class: 'clase-avion-fijo' }, k.cara);
    svg('path', { d: `M${C} ${C - RC + 14}L${C - 7} ${C - RC + 1}L${C + 7} ${C - RC + 1}Z`, class: 'clase-avion-fijo' }, k.cara);
    v.rumbo = { ...k, tarjeta, bandera: bandera(k.lienzo, T) };
  }
  // Variómetro.
  {
    const k = caja(tablero, 'vsi', T);
    for (let fpm = -2000; fpm <= 2000; fpm += 100) {
      const ang = agujaVariometro(fpm), grande = fpm % 500 === 0;
      const [x1, y1] = polar(ang, RC - 2), [x2, y2] = polar(ang, RC - (grande ? 14 : 7));
      svg('line', { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), class: grande ? 'clase-marca clase-marca-grande' : 'clase-marca' }, k.cara);
      if (grande) numero(k.cara, ang, RC - 28, String(Math.abs(fpm / 100)));
    }
    svg('text', { x: C, y: 70, 'text-anchor': 'middle', class: 'clase-rotulo-inst' }, k.cara, T.subir);
    svg('text', { x: C, y: 146, 'text-anchor': 'middle', class: 'clase-rotulo-inst' }, k.cara, T.bajar);
    svg('text', { x: C + 6, y: 124, 'text-anchor': 'middle', class: 'clase-rotulo-chico' }, k.cara, T.cienPies);
    const ag = aguja(k.cara, { largo: 78 });
    svg('circle', { cx: C, cy: C, r: 8, class: 'clase-centro' }, k.cara);
    v.vsi = { ...k, ag, bandera: bandera(k.lienzo, T) };
  }
  // Brillo de vidrio sobre cada esfera.
  for (const nombre of INSTRUMENTOS) svg('path', { d: `M${C - 70} ${C - 40}A${RC} ${RC} 0 0 1 ${C + 40} ${C - 72}A110 110 0 0 0 ${C - 70} ${C - 40}Z`, class: 'clase-vidrio' }, v[nombre].lienzo);

  // ---------- Panel de control ----------
  const panel = el('div', { class: 'clase-panel' }, raiz);
  const aviso = el('p', { class: 'clase-aviso-falla', role: 'status', 'aria-live': 'polite' }, panel);
  const controles = el('div', { class: 'clase-botones' }, panel);
  const bDemo = boton(controles, T.demo, () => alternarDemo(!demo), { class: 'clase-boton clase-boton-principal' });
  boton(controles, T.nivelar, () => { alternarDemo(false); lecturas = { ...lecturas, cabeceo: 0, alabeo: 0, vs: 0 }; sincronizarDeslizadores(); });
  const filaFalla = el('label', { class: 'clase-selector' }, controles);
  el('span', {}, filaFalla, T.simularFalla);
  const selector = el('select', {}, filaFalla);
  el('option', { value: '' }, selector, T.ninguna);
  for (const n of INSTRUMENTOS) el('option', { value: n }, selector, T[n]);
  selector.addEventListener('change', () => ponerFalla(selector.value || null));
  const mandos = el('details', { class: 'clase-mandos' }, panel);
  el('summary', {}, mandos, T.mandos);
  const rejilla = el('div', { class: 'clase-mandos-rejilla' }, mandos);
  const definiciones = [
    ['velocidad', T.velocidad, 40, 180, 1, ' kt'], ['altitud', T.altitud, 0, 12000, 50, ' ft'],
    ['cabeceo', T.cabeceo, -20, 20, 1, '°'], ['alabeo', T.alabeo, -45, 45, 1, '°'],
    ['rumbo', T.rumboC, 0, 359, 1, '°'], ['vs', T.vs, -2000, 2000, 50, ' ft/min'],
  ];
  const desl = {};
  for (const [clave, etiqueta, min, max, paso, unidad] of definiciones) {
    desl[clave] = deslizador(rejilla, { etiqueta, min, max, paso, valor: lecturas[clave], unidad,
      alCambiar: x => { alternarDemo(false); lecturas = { ...lecturas, [clave]: x }; } });
  }
  el('p', { class: 'clase-nota' }, panel, T.muestra);

  function sincronizarDeslizadores() {
    for (const clave of Object.keys(desl)) desl[clave].poner(Math.round(lecturas[clave]));
  }

  function alternarDemo(si) {
    demo = si;
    if (si) { relojDemo = 0; lecturas = { ...LECTURAS_INICIALES, ...(opciones.lecturas || {}) }; }
    bDemo.textContent = demo ? T.parar : T.demo;
    bDemo.setAttribute('aria-pressed', String(demo));
    if (quieto && si) { // sin animación: se muestra un momento del viraje en ascenso
      lecturas = { ...lecturas, velocidad: 80, cabeceo: 6, alabeo: 15, vs: 500, rumbo: 45, altitud: 3200 };
      demo = false;
      sincronizarDeslizadores();
    }
  }

  function ponerFalla(nombre) {
    falla = INSTRUMENTOS.includes(nombre) ? nombre : null;
    congeladas = falla ? { ...mostradas } : null;
    selector.value = falla || '';
    aviso.textContent = falla ? `${T[falla]}: ${T.aviso_falla}` : '';
    for (const n of INSTRUMENTOS) {
      v[n].tarjeta.classList.toggle('clase-en-falla', n === falla);
      v[n].bandera.setAttribute('opacity', n === falla ? '1' : '0');
    }
  }

  function dibujar(dt = 1) {
    // Las agujas siguen a las lecturas con un poco de inercia (como un instrumento real).
    const objetivo = aplicarFalla(lecturas, congeladas, falla);
    const k = quieto ? 1 : Math.min(1, dt * 7);
    for (const clave of Object.keys(objetivo)) {
      if (clave === 'rumbo') {
        const dif = ((objetivo.rumbo - mostradas.rumbo + 540) % 360) - 180;
        mostradas.rumbo = norm360(mostradas.rumbo + dif * k);
      } else mostradas[clave] = mezclar(mostradas[clave] ?? objetivo[clave], objetivo[clave], k);
    }
    const m = mostradas;
    v.anemometro.ag.setAttribute('transform', `rotate(${f1(agujaAnemometro(m.velocidad))} ${C} ${C})`);
    const h = horizonte(m.cabeceo, m.alabeo);
    v.actitud.gira.setAttribute('transform', `rotate(${f1(h.rotacion)} ${C} ${C})`);
    v.actitud.mueve.setAttribute('transform', `translate(0 ${f1(h.desplazamiento)})`);
    const alt = agujasAltimetro(m.altitud);
    v.altimetro.cien.setAttribute('transform', `rotate(${f1(alt.cien)} ${C} ${C})`);
    v.altimetro.mil.setAttribute('transform', `rotate(${f1(alt.mil)} ${C} ${C})`);
    v.altimetro.diezmil.setAttribute('transform', `rotate(${f1(alt.diezmil)} ${C} ${C})`);
    const tasa = tasaDeGiro(m.alabeo, m.velocidad);
    v.giro.avion.setAttribute('transform', `rotate(${f1(inclinacionCoordinador(tasa))} ${C} ${C})`);
    const bx = limitar(m.derrape || 0, -1, 1) * 34;
    v.giro.bola.setAttribute('cx', f1(C + bx));
    v.giro.bola.setAttribute('cy', f1(145.5 + (bx * bx) / 120));
    v.rumbo.tarjeta.setAttribute('transform', `rotate(${f1(tarjetaRumbo(m.rumbo))} ${C} ${C})`);
    v.vsi.ag.setAttribute('transform', `rotate(${f1(agujaVariometro(m.vs))} ${C} ${C})`);
    // Lecturas en texto (para aprender a leer cada uno).
    const r = Math.round;
    const lado = m.alabeo > 1 ? ` ${T.der}` : m.alabeo < -1 ? ` ${T.izq}` : '';
    const textos = {
      anemometro: `${r(m.velocidad)} kt`,
      actitud: `${m.cabeceo >= 0 ? '+' : ''}${r(m.cabeceo)}° · ${r(Math.abs(m.alabeo))}°${lado}`,
      altimetro: `${(Math.round(m.altitud / 10) * 10).toLocaleString('es')} ft`,
      giro: `${Math.abs(tasa).toFixed(1).replace('.', ',')}°/s${lado}`,
      rumbo: `${String(r(m.rumbo) % 360 || 360).padStart(3, '0')}°`,
      vsi: `${m.vs >= 0 ? '+' : ''}${r(m.vs / 10) * 10} ft/min`,
    };
    for (const n of INSTRUMENTOS) {
      if (v[n].valor.textContent !== textos[n]) {
        v[n].valor.textContent = textos[n];
        v[n].lienzo.setAttribute('aria-label', `${T[n]}: ${textos[n]}${n === falla ? ` (${T.falla})` : ''}`);
      }
    }
  }

  // Guion de la demostración: recto y nivelado, entra en viraje a la derecha subiendo, y nivela al rato.
  function mandoDemo(t) {
    if (t < 2.5) return { velocidad: 95, alabeo: 0, cabeceo: 0, vs: 0 };
    if (t < 26) return { velocidad: 80, alabeo: 15, cabeceo: 6, vs: 500 };
    if (t < 32) return { velocidad: 95, alabeo: 0, cabeceo: 0, vs: 0 };
    return null;
  }

  const bucle = crearBucle(raiz, dt => {
    if (demo) {
      relojDemo += dt;
      const mando = mandoDemo(relojDemo);
      if (!mando) { relojDemo = 0; lecturas = { ...LECTURAS_INICIALES, ...(opciones.lecturas || {}) }; }
      else lecturas = pasoSimulacion(lecturas, mando, dt);
      if (Math.round(relojDemo * 10) % 5 === 0) sincronizarDeslizadores();
    }
    dibujar(dt);
  });

  function aplicarModo() {
    raiz.classList.toggle('clase-modo-explicacion', modo === 'explicacion');
    panel.hidden = modo === 'explicacion' && !falla;
    controles.hidden = modo === 'explicacion';
    mandos.hidden = modo === 'explicacion';
  }

  if (opciones.falla) ponerFalla(opciones.falla);
  alternarDemo(demo);
  aplicarModo();
  dibujar();
  bucle.iniciar();

  return {
    raiz,
    tiempo(t) {
      if (!opciones.claves) return;
      const x = interpolarClaves(opciones.claves, t);
      const { falla: f, ...valores } = x;
      lecturas = { ...lecturas, ...Object.fromEntries(Object.entries(valores).filter(([, n]) => typeof n === 'number')) };
      if (f !== undefined && (f || null) !== falla) ponerFalla(f || null);
      if (quieto || !bucle.activo) dibujar(1);
    },
    poner(valores = {}) {
      alternarDemo(false);
      lecturas = { ...lecturas, ...valores };
      sincronizarDeslizadores();
      if (quieto || !bucle.activo) { mostradas = { ...lecturas }; dibujar(); }
    },
    demo(si) { alternarDemo(Boolean(si)); },
    falla(nombre) { ponerFalla(nombre); aplicarModo(); },
    get lecturas() { return { ...lecturas }; },
    modo(m) { modo = m === 'explicacion' ? 'explicacion' : 'interactivo'; aplicarModo(); },
    pausar(si) { if (si) bucle.detener(); else bucle.iniciar(); },
    destruir() { bucle.destruir(); raiz.remove(); },
  };
}
