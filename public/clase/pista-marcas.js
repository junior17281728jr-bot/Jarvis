// 0.14.62: las marcas de una pista (AIM 2-3-3, TBL 2-3-1 y 2-3-2), vista desde arriba con la llegada desde abajo: número
// (designador), eje, umbral, punto de mira, zona de toma de contacto y bordes; el umbral desplazado (flechas y barra), la
// zona previa (chevrones amarillos) y la pista cerrada (X amarilla). Las marcas de pista son BLANCAS; las de lo que no es
// pista (zona previa, cerrada) son AMARILLAS. Las distancias son las de verdad; los números están agrandados para leerse.
// parametros: { titulo?, clase ('visual'|'no_precision'|'precision'), numero ('27'), ancho (100 ft), mostrar?, resaltar? }
import { el, svg, f1 } from './comun.js';
import { traductor, marco, api, leerPista, lista, miles } from './aviacion-base.js';

export const MARCAS = ['designador', 'eje', 'umbral', 'punto_mira', 'zona_contacto', 'bordes', 'umbral_desplazado', 'zona_previa', 'cerrada'];
// TBL 2-3-1: visual = designador y eje (el umbral y el punto de mira solo en algunas); no precisión = 4; precisión = las 6.
export const MARCAS_POR_CLASE = {
  visual: ['designador', 'eje'],
  no_precision: ['designador', 'eje', 'umbral', 'punto_mira'],
  precision: ['designador', 'eje', 'umbral', 'punto_mira', 'zona_contacto', 'bordes'],
};
// TBL 2-3-2: rayas del umbral según el ancho de la pista.
export const RAYAS_UMBRAL = { 60: 4, 75: 6, 100: 8, 150: 12, 200: 16 };
// Zona de toma de contacto: a cada 500 ft, cuántas barras por lado (a 1,000 ft está el punto de mira).
export const ZONA_CONTACTO = [[500, 3], [1500, 2], [2000, 2], [2500, 1], [3000, 1]];

export const TEXTOS_PISTA = {
  etiqueta: 'Marcas de una pista {clase}, pista {numero}: {marcas}.',
  etiquetaSinClase: 'Marcas de la pista {numero}: {marcas}.',
  visual: 'visual', no_precision: 'de no precisión (por instrumentos)', precision: 'de precisión (por instrumentos)',
  clase: 'Pista {clase}. Las marcas de la pista son blancas; las amarillas son de lo que no es pista.',
  colores: 'Las marcas de la pista son blancas; las amarillas son de lo que no es pista.',
  designador: 'Número (designador)', eje: 'Eje (centerline)', umbral: 'Umbral (threshold)', punto_mira: 'Punto de mira (aiming point)',
  zona_contacto: 'Zona de toma de contacto (touchdown zone)', bordes: 'Bordes (side stripes)', umbral_desplazado: 'Umbral desplazado (displaced threshold)',
  zona_previa: 'Zona previa (blast pad / stopway)', cerrada: 'Pista cerrada (closed)',
  d_designador: 'El rumbo magnético de la pista redondeado a la decena, sin el último cero ({numero} ≈ {rumbo}°). La L, C o R va en pistas paralelas.',
  d_eje: 'Rayas blancas con espacios por el centro: te alinean al despegar y al aterrizar.',
  d_umbral: 'Rayas blancas a lo largo donde empieza la parte para aterrizar: {n} rayas en una pista de {ancho} ft.',
  d_punto_mira: 'Dos franjas anchas a cada lado del eje, a unos 1,000 ft del umbral: el punto al que apuntas.',
  d_zona_contacto: 'Barras en pares cada 500 ft (3, 2, 2, 1 y 1): te dicen cuánto llevas de pista.',
  d_bordes: 'Líneas blancas continuas en los dos lados: marcan dónde termina la pista.',
  d_umbral_desplazado: 'Flechas blancas hasta la barra blanca del umbral. Esa parte sirve para despegar y rodar (y para aterrizar si vienes del otro lado), pero no para aterrizar desde aquí.',
  d_zona_previa: 'Chevrones amarillos: no sirve para despegar, aterrizar ni rodar.',
  d_zona_previa_barra: 'Chevrones amarillos: no sirve para despegar, aterrizar ni rodar. La barra amarilla (demarcation bar) la separa de la pista.',
  d_cerrada: 'Una X amarilla en cada extremo: la pista está cerrada.',
};

const K = 0.16; // unidades por pie a lo largo de la pista
const X0 = 70, AN = 120, XC = X0 + AN / 2, LARGO = 3120;

export function montarPistaMarcas(c, p = {}, o = {}) {
  const T = traductor(o, 'pista', TEXTOS_PISTA);
  const pista = leerPista(p.numero, '27');
  const clase = MARCAS_POR_CLASE[p.clase] ? p.clase : 'precision';
  const ancho = RAYAS_UMBRAL[p.ancho] ? p.ancho : 100;
  const pedidas = lista(p.mostrar).filter(m => MARCAS.includes(m));
  const ver = new Set(pedidas.length ? pedidas : MARCAS_POR_CLASE[clase]);
  const realce = new Set(lista(p.resaltar).filter(m => MARCAS.includes(m)));
  for (const m of realce) ver.add(m);
  const marcas = MARCAS.filter(m => ver.has(m));
  const etiqueta = MARCAS_POR_CLASE[p.clase] || !pedidas.length
    ? T('etiqueta', { clase: T(clase), numero: pista.texto, marcas: marcas.map(m => T(m)).join(', ') })
    : T('etiquetaSinClase', { numero: pista.texto, marcas: marcas.map(m => T(m)).join(', ') });
  const raiz = marco(c, 'pista', p.titulo, etiqueta);
  const fila = el('div', { class: 'clase-dib-pista-fila' }, raiz);
  // De abajo hacia arriba: la zona previa, la parte desplazada y la pista desde el umbral.
  const previa = ver.has('zona_previa') ? 56 : 0, desplazada = ver.has('umbral_desplazado') ? 96 : 0;
  const ALTO = 24 + LARGO * K + desplazada + previa + 18;
  const yInicio = ALTO - 18 - previa; // donde empieza el pavimento de la pista
  const yU = yInicio - desplazada; // el umbral
  const y = pies => yU - pies * K;
  const lienzo = svg('svg', { viewBox: `0 0 260 ${f1(ALTO)}`, class: 'clase-dib-lienzo clase-dib-lienzo-pista', role: 'img', 'aria-label': etiqueta }, fila);
  const grupos = {};
  const g = m => (grupos[m] ??= svg('g', { class: `clase-dib-marca${realce.has(m) ? ' clase-dib-marca-resaltada' : ''}` }, lienzo));
  const yFin = y(LARGO);
  // El pavimento (con un corte arriba: la pista sigue).
  svg('path', { d: `M${X0} ${f1(yInicio)}L${X0} ${f1(yFin + 8)}L${X0 + 30} ${f1(yFin)}L${X0 + 60} ${f1(yFin + 8)}L${X0 + 90} ${f1(yFin)}L${X0 + AN} ${f1(yFin + 8)}L${X0 + AN} ${f1(yInicio)}Z`, class: 'clase-dib-asfalto' }, lienzo);
  if (previa) svg('rect', { x: X0, y: f1(yInicio), width: AN, height: previa, class: 'clase-dib-asfalto-previa' }, lienzo);
  const blanco = (padre, x, yy, w, h) => svg('rect', { x: f1(x), y: f1(yy), width: f1(w), height: f1(h), class: 'clase-dib-pintura' }, padre);
  const llamadas = [];
  const llamar = (m, yy) => llamadas.push([m, yy]);
  if (previa) {
    const gp = g('zona_previa');
    for (let i = 0; i < 3; i++) {
      const yy = yInicio + 8 + i * 15;
      svg('path', { d: `M${X0 + 8} ${f1(yy + 14)}L${XC} ${f1(yy)}L${X0 + AN - 8} ${f1(yy + 14)}`, class: 'clase-dib-amarilla-trazo' }, gp);
    }
    if (desplazada) svg('rect', { x: X0, y: f1(yInicio - 1), width: AN, height: 3, class: 'clase-dib-amarilla' }, gp);
    llamar('zona_previa', yInicio + previa / 2);
  }
  if (desplazada) {
    const gd = g('umbral_desplazado');
    for (const yy of [yInicio - 18, yInicio - 52]) {
      blanco(gd, XC - 2.5, yy - 16, 5, 16);
      svg('path', { d: `M${XC} ${f1(yy - 26)}L${XC - 8} ${f1(yy - 14)}L${XC + 8} ${f1(yy - 14)}Z`, class: 'clase-dib-pintura' }, gd);
    }
    for (let i = 0; i < 4; i++) {
      const x = X0 + 15 + i * 30;
      svg('path', { d: `M${x} ${f1(yU + 6)}L${x - 9} ${f1(yU + 16)}L${x - 3} ${f1(yU + 16)}L${x} ${f1(yU + 12)}L${x + 3} ${f1(yU + 16)}L${x + 9} ${f1(yU + 16)}Z`, class: 'clase-dib-pintura' }, gd);
    }
    blanco(gd, X0, yU - 2, AN, 3);
    llamar('umbral_desplazado', yInicio - desplazada / 2);
  }
  if (ver.has('bordes')) {
    const gb = g('bordes');
    blanco(gb, X0 + 2, yFin + 8, 2.5, yInicio - yFin - 8);
    blanco(gb, X0 + AN - 4.5, yFin + 8, 2.5, yInicio - yFin - 8);
    llamar('bordes', y(2200));
  }
  if (ver.has('umbral')) {
    const gu = g('umbral'), n = RAYAS_UMBRAL[ancho], lado = n / 2;
    const util = (AN - 16 - 18) / 2, w = util / (lado * 1.7 - 0.7);
    for (let i = 0; i < lado; i++) for (const s of [-1, 1]) {
      const x = s < 0 ? X0 + 8 + i * w * 1.7 : XC + 9 + i * w * 1.7;
      blanco(gu, x, y(170), w, 150 * K);
    }
    llamar('umbral', y(95));
  }
  // El número y la letra (la letra más cerca del umbral, el número después): agrandados para leerse.
  let finNumero = y(160);
  if (ver.has('designador')) {
    const gn = g('designador');
    let yy = y(200);
    if (pista.letra) { svg('text', { x: XC, y: f1(yy), 'text-anchor': 'middle', class: 'clase-dib-pintura-texto clase-dib-pintura-letra' }, gn, pista.letra); yy -= 22; }
    svg('text', { x: XC, y: f1(yy), 'text-anchor': 'middle', class: 'clase-dib-pintura-texto' }, gn, String(pista.numero));
    finNumero = yy - 28;
    llamar('designador', yy - 10);
  }
  if (ver.has('eje')) {
    const ge = g('eje');
    for (let pie = (yU - finNumero) / K + 40; pie + 120 < LARGO; pie += 200) blanco(ge, XC - 1.5, y(pie + 120), 3, 120 * K);
    llamar('eje', y(1250));
  }
  if (ver.has('punto_mira')) {
    const gm = g('punto_mira');
    for (const s of [-1, 1]) blanco(gm, s < 0 ? XC - 30 : XC + 14, y(1150), 16, 150 * K);
    llamar('punto_mira', y(1075));
  }
  if (ver.has('zona_contacto')) {
    const gz = g('zona_contacto');
    for (const [pie, n] of ZONA_CONTACTO) for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const x = s < 0 ? XC - 14 - (i + 1) * 9 : XC + 14 + i * 9 + 3;
      blanco(gz, x, y(pie + 75), 5, 75 * K);
    }
    llamar('zona_contacto', y(1500 + 37));
  }
  if (ver.has('cerrada')) {
    const gc = g('cerrada');
    const a = y(260), b = y(760);
    svg('path', { d: `M${X0 + 14} ${f1(a)}L${X0 + AN - 14} ${f1(b)}M${X0 + AN - 14} ${f1(a)}L${X0 + 14} ${f1(b)}`, class: 'clase-dib-amarilla-x' }, gc);
    llamar('cerrada', (a + b) / 2);
  }
  // Las distancias desde el umbral, a la izquierda.
  for (const pie of [0, 500, 1000, 1500, 2000, 2500, 3000]) {
    svg('line', { x1: X0 - 8, y1: f1(y(pie)), x2: X0 - 2, y2: f1(y(pie)), class: 'clase-dib-regla' }, lienzo);
    svg('text', { x: X0 - 11, y: f1(y(pie) + 4), 'text-anchor': 'end', class: 'clase-dib-texto clase-dib-texto-chico' }, lienzo, pie ? miles(pie) : '0 ft');
  }
  // Las llamadas numeradas (a la derecha), separadas para que no se encimen.
  const orden = llamadas.map(([m, yy]) => ({ m, y0: yy, y: yy })).sort((a, b) => b.y0 - a.y0);
  for (let i = 1; i < orden.length; i++) if (orden[i - 1].y - orden[i].y < 28) orden[i].y = orden[i - 1].y - 28;
  const numeros = new Map(MARCAS.filter(m => llamadas.some(l => l[0] === m)).map((m, i) => [m, i + 1]));
  for (const x of orden) {
    const gl = svg('g', { class: `clase-dib-llamada${realce.has(x.m) ? ' clase-dib-llamada-resaltada' : ''}` }, lienzo);
    svg('path', { d: `M${X0 + AN - 10} ${f1(x.y0)}L${X0 + AN + 18} ${f1(x.y0)}L${226 - 13} ${f1(x.y)}`, class: 'clase-dib-llamada-linea' }, gl);
    svg('circle', { cx: 226, cy: f1(x.y), r: 12, class: 'clase-dib-llamada-circulo' }, gl);
    svg('text', { x: 226, y: f1(x.y + 5), 'text-anchor': 'middle', class: 'clase-dib-llamada-numero' }, gl, numeros.get(x.m));
  }
  // La leyenda.
  const lado = el('div', { class: 'clase-dib-pista-texto' }, fila);
  // La clase solo si la pidió el autor o si se ven las marcas de esa clase (con «mostrar» propio puede ser otra cosa).
  el('p', { class: 'clase-dib-nota' }, lado, MARCAS_POR_CLASE[p.clase] || !pedidas.length ? T('clase', { clase: T(clase) }) : T('colores'));
  const ol = el('ol', { class: 'clase-dib-leyenda clase-dib-leyenda-marcas' }, lado);
  for (const [m, n] of numeros) {
    const li = el('li', { class: realce.has(m) ? 'clase-dib-leyenda-resaltada' : null, value: n }, ol);
    el('strong', {}, li, T(m));
    const clave = m === 'zona_previa' && desplazada ? 'd_zona_previa_barra' : `d_${m}`;
    el('span', { class: 'clase-dib-detalle' }, li, T(clave, { numero: pista.texto, rumbo: pista.rumbo, n: RAYAS_UMBRAL[ancho], ancho }));
  }
  return api(raiz);
}
