// 0.14.62: los símbolos de la carta seccional (sectional chart) como una leyenda, con los colores de la carta de la FAA
// (iguales en claro y oscuro, sobre «papel»): AZUL = aeropuerto con torre, Clase B y D, VOR, áreas prohibidas y
// restringidas y la MEF; MAGENTA = sin torre, Clase C y E, NDB y MOA. Las líneas: B continua azul, C continua magenta,
// D discontinua azul, E de superficie discontinua magenta; E desde 700 ft AGL = sombra magenta; desde 1,200 ft = sombra azul.
// parametros: { titulo?, simbolos? (lista; si no, todos), resaltar? (lista) }
import { el, svg, f1, idUnico } from './comun.js';
import { traductor, marco, api, lista, vector } from './aviacion-base.js';

export const SIMBOLOS = ['aeropuerto_torre', 'aeropuerto_sin_torre', 'aeropuerto_largo', 'aeropuerto_blando', 'aeropuerto_privado',
  'clase_b', 'clase_c', 'clase_d', 'clase_e_superficie', 'clase_e_700', 'clase_e_1200', 'moa', 'restringida', 'prohibida',
  'vor', 'vor_dme', 'vortac', 'ndb', 'obstaculo', 'obstaculo_alto', 'mef'];
// El color de cada símbolo en la carta (para las pruebas y para quien lo lea).
export const COLOR_SIMBOLO = {
  aeropuerto_torre: 'azul', aeropuerto_sin_torre: 'magenta', aeropuerto_largo: 'azul', aeropuerto_blando: 'magenta', aeropuerto_privado: 'magenta',
  clase_b: 'azul', clase_c: 'magenta', clase_d: 'azul', clase_e_superficie: 'magenta', clase_e_700: 'magenta', clase_e_1200: 'azul',
  moa: 'magenta', restringida: 'azul', prohibida: 'azul', vor: 'azul', vor_dme: 'azul', vortac: 'azul', ndb: 'magenta',
  obstaculo: 'negro', obstaculo_alto: 'negro', mef: 'azul',
};

export const TEXTOS_CARTA = {
  etiqueta: 'Símbolos de la carta seccional',
  aeropuerto_torre: 'Aeropuerto con torre', aeropuerto_sin_torre: 'Aeropuerto sin torre', aeropuerto_largo: 'Pista dura de más de 8,069 ft',
  aeropuerto_blando: 'Pista que no es dura (tierra, grama)', aeropuerto_privado: 'Aeropuerto privado', clase_b: 'Clase B', clase_c: 'Clase C', clase_d: 'Clase D',
  clase_e_superficie: 'Clase E desde la superficie', clase_e_700: 'Clase E desde 700 ft AGL', clase_e_1200: 'Clase E desde 1,200 ft AGL',
  moa: 'MOA (operaciones militares)', restringida: 'Área restringida', prohibida: 'Área prohibida', vor: 'VOR', vor_dme: 'VOR-DME', vortac: 'VORTAC', ndb: 'NDB',
  obstaculo: 'Obstáculo (menos de 1,000 ft AGL)', obstaculo_alto: 'Obstáculo de 1,000 ft AGL o más', mef: 'MEF (elevación máxima del cuadro)',
  d_aeropuerto_torre: 'Azul: tiene torre. El círculo con la pista dentro: pista dura de 1,500 a 8,069 ft.',
  d_aeropuerto_sin_torre: 'Magenta: no tiene torre. Pista dura de 1,500 a 8,069 ft.',
  d_aeropuerto_largo: 'Se dibuja la forma de las pistas (azul con torre, magenta sin torre).',
  d_aeropuerto_blando: 'El círculo vacío: la pista no es pavimentada.',
  d_aeropuerto_privado: 'La «R» en el círculo: uso privado o restringido. Solo para emergencias si no tienes permiso.',
  d_clase_b: 'Línea azul continua y gruesa. Arriba el techo y abajo el piso, en cientos de pies MSL (100 / 40).',
  d_clase_c: 'Línea magenta continua y gruesa. 40 / SFC: de la superficie a 4,000 ft MSL.',
  d_clase_d: 'Línea azul discontinua. El número en el cuadro es el techo en cientos de pies MSL ([25] = 2,500 ft).',
  d_clase_e_superficie: 'Línea magenta discontinua: la Clase E empieza en el suelo.',
  d_clase_e_700: 'Sombra magenta: del lado de la sombra, la Clase E empieza a 700 ft AGL.',
  d_clase_e_1200: 'Sombra azul: del lado de la sombra, la Clase E empieza a 1,200 ft AGL (y del otro lado, más arriba o más abajo según la carta).',
  d_moa: 'Borde magenta con rayas hacia adentro. Puedes entrar en VFR, pero con cuidado.',
  d_restringida: 'Borde azul con rayas hacia adentro («R-» y su número). No entres sin permiso cuando está activa.',
  d_prohibida: 'Borde azul con rayas hacia adentro («P-» y su número). Nunca se entra.',
  d_vor: 'Hexágono azul con un punto al centro.', d_vor_dme: 'El hexágono dentro de un cuadro: VOR con DME.',
  d_vortac: 'El hexágono con tres «orejas» llenas: VOR y TACAN juntos.', d_ndb: 'Magenta, con un punto al centro y anillos de puntitos.',
  d_obstaculo: 'Arriba la altura MSL (en negrita), abajo entre paréntesis la altura sobre el suelo (AGL).',
  d_obstaculo_alto: 'Un símbolo más grande para los de 1,000 ft AGL o más.',
  d_mef: 'En azul, en miles y cientos de pies MSL: 12⁵ = 12,500 ft. Es lo más alto del cuadro más un margen.',
};

function hexagono(g, cx, cy, r, clase) {
  const d = Array.from({ length: 6 }, (_, i) => vector(30 + i * 60, r)).map(([x, y]) => `${f1(cx + x)} ${f1(cy + y)}`).join('L');
  svg('path', { d: `M${d}Z`, class: clase }, g);
  svg('circle', { cx, cy, r: 2.4, class: clase.replace('trazo', 'relleno') }, g);
}
// Un borde rayado (MOA, restringida, prohibida): una curva y rayitas hacia adentro (abajo).
function rayado(g, color, texto) {
  svg('path', { d: 'M10 26Q60 6 110 26', class: `clase-dib-carta-trazo-${color} clase-dib-carta-fino` }, g);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = (1 - t) ** 2 * 10 + 2 * (1 - t) * t * 60 + t * t * 110, y = (1 - t) ** 2 * 26 + 2 * (1 - t) * t * 6 + t * t * 26;
    svg('line', { x1: f1(x), y1: f1(y), x2: f1(x + 2), y2: f1(y + 8), class: `clase-dib-carta-trazo-${color} clase-dib-carta-fino` }, g);
  }
  svg('text', { x: 60, y: 54, 'text-anchor': 'middle', class: `clase-dib-carta-texto clase-dib-carta-color-${color}` }, g, texto);
}
function sombra(g, color) {
  const id = idUnico('vineta');
  const grad = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('defs', {}, g));
  svg('stop', { offset: '0', class: `clase-dib-carta-parada-${color}` }, grad);
  svg('stop', { offset: '1', class: `clase-dib-carta-parada-${color} clase-dib-carta-parada-fin` }, grad);
  svg('rect', { x: 10, y: 24, width: 100, height: 22, fill: `url(#${id})` }, g);
  svg('text', { x: 60, y: 66, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-negro clase-dib-carta-texto-chico' }, g, color === 'magenta' ? '700 AGL' : '1200 AGL');
}
const DIBUJO = {
  aeropuerto_torre: g => { svg('circle', { cx: 60, cy: 36, r: 17, class: 'clase-dib-carta-trazo-azul' }, g); svg('rect', { x: 45, y: 33, width: 30, height: 6, transform: 'rotate(-35 60 36)', class: 'clase-dib-carta-relleno-azul' }, g); },
  aeropuerto_sin_torre: g => { svg('circle', { cx: 60, cy: 36, r: 17, class: 'clase-dib-carta-trazo-magenta' }, g); svg('rect', { x: 45, y: 33, width: 30, height: 6, transform: 'rotate(-35 60 36)', class: 'clase-dib-carta-relleno-magenta' }, g); },
  aeropuerto_largo: g => { svg('path', { d: 'M28 50L84 14L89 21L33 57ZM50 16L56 12L92 56L86 60Z', class: 'clase-dib-carta-trazo-azul clase-dib-carta-fino' }, g); },
  aeropuerto_blando: g => { svg('circle', { cx: 60, cy: 36, r: 11, class: 'clase-dib-carta-trazo-magenta' }, g); },
  aeropuerto_privado: g => { svg('circle', { cx: 60, cy: 36, r: 14, class: 'clase-dib-carta-trazo-magenta' }, g); svg('text', { x: 60, y: 43, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-magenta' }, g, 'R'); },
  clase_b: g => { svg('path', { d: 'M8 54Q60 4 112 54', class: 'clase-dib-carta-trazo-azul clase-dib-carta-grueso' }, g); svg('text', { x: 60, y: 46, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-azul clase-dib-carta-texto-chico' }, g, '100'); svg('line', { x1: 48, y1: 51, x2: 72, y2: 51, class: 'clase-dib-carta-trazo-azul clase-dib-carta-fino' }, g); svg('text', { x: 60, y: 66, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-azul clase-dib-carta-texto-chico' }, g, '40'); },
  clase_c: g => { svg('path', { d: 'M8 54Q60 4 112 54', class: 'clase-dib-carta-trazo-magenta clase-dib-carta-grueso' }, g); svg('text', { x: 60, y: 46, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-magenta clase-dib-carta-texto-chico' }, g, '40'); svg('line', { x1: 46, y1: 51, x2: 74, y2: 51, class: 'clase-dib-carta-trazo-magenta clase-dib-carta-fino' }, g); svg('text', { x: 60, y: 66, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-magenta clase-dib-carta-texto-chico' }, g, 'SFC'); },
  clase_d: g => { svg('path', { d: 'M8 54Q60 4 112 54', class: 'clase-dib-carta-trazo-azul clase-dib-carta-discontinua' }, g); svg('rect', { x: 45, y: 38, width: 30, height: 20, class: 'clase-dib-carta-trazo-azul clase-dib-carta-fino clase-dib-carta-discontinua-fina' }, g); svg('text', { x: 60, y: 53, 'text-anchor': 'middle', class: 'clase-dib-carta-texto clase-dib-carta-color-azul clase-dib-carta-texto-chico' }, g, '25'); },
  clase_e_superficie: g => { svg('path', { d: 'M8 54Q60 4 112 54', class: 'clase-dib-carta-trazo-magenta clase-dib-carta-discontinua' }, g); },
  clase_e_700: g => { sombra(g, 'magenta'); },
  clase_e_1200: g => { sombra(g, 'azul'); },
  moa: g => rayado(g, 'magenta', 'MOA'),
  restringida: g => rayado(g, 'azul', 'R-2501'),
  prohibida: g => rayado(g, 'azul', 'P-56'),
  vor: g => hexagono(g, 60, 36, 13, 'clase-dib-carta-trazo-azul clase-dib-carta-fino'),
  vor_dme: g => { svg('rect', { x: 44, y: 22, width: 32, height: 28, class: 'clase-dib-carta-trazo-azul clase-dib-carta-fino' }, g); hexagono(g, 60, 36, 11, 'clase-dib-carta-trazo-azul clase-dib-carta-fino'); },
  vortac: g => {
    hexagono(g, 60, 36, 12, 'clase-dib-carta-trazo-azul clase-dib-carta-fino');
    for (const a of [0, 120, 240]) svg('rect', { x: 54, y: 16, width: 12, height: 7, transform: `rotate(${a} 60 36)`, class: 'clase-dib-carta-relleno-azul' }, g);
  },
  ndb: g => {
    svg('circle', { cx: 60, cy: 36, r: 3, class: 'clase-dib-carta-relleno-magenta' }, g);
    for (const [r, n] of [[8, 8], [13, 12], [18, 16], [23, 20]]) for (let i = 0; i < n; i++) { const [x, y] = vector((360 / n) * i, r); svg('circle', { cx: f1(60 + x), cy: f1(36 + y), r: 1.3, class: 'clase-dib-carta-relleno-magenta' }, g); }
  },
  obstaculo: g => { svg('path', { d: 'M38 46L45 22L52 46', class: 'clase-dib-carta-trazo-negro clase-dib-carta-fino' }, g); svg('circle', { cx: 45, cy: 46, r: 2, class: 'clase-dib-carta-relleno-negro' }, g); svg('text', { x: 58, y: 34, class: 'clase-dib-carta-texto clase-dib-carta-color-negro clase-dib-carta-texto-chico' }, g, '1473'); svg('text', { x: 58, y: 50, class: 'clase-dib-carta-texto-fino clase-dib-carta-color-negro' }, g, '(323)'); },
  obstaculo_alto: g => { svg('path', { d: 'M32 56L44 12L56 56', class: 'clase-dib-carta-trazo-negro' }, g); svg('path', { d: 'M38 34L50 34', class: 'clase-dib-carta-trazo-negro clase-dib-carta-fino' }, g); svg('circle', { cx: 44, cy: 56, r: 2.4, class: 'clase-dib-carta-relleno-negro' }, g); svg('text', { x: 60, y: 34, class: 'clase-dib-carta-texto clase-dib-carta-color-negro clase-dib-carta-texto-chico' }, g, '2049'); svg('text', { x: 60, y: 50, class: 'clase-dib-carta-texto-fino clase-dib-carta-color-negro' }, g, '(1149)'); },
  mef: g => { svg('text', { x: 56, y: 54, 'text-anchor': 'middle', class: 'clase-dib-carta-mef' }, g, '12'); svg('text', { x: 78, y: 34, class: 'clase-dib-carta-mef-chico' }, g, '5'); },
};

export function montarCartaSimbolos(c, p = {}, o = {}) {
  const T = traductor(o, 'carta', TEXTOS_CARTA);
  const pedidos = lista(p.simbolos).filter(s => SIMBOLOS.includes(s));
  const realce = new Set(lista(p.resaltar).filter(s => SIMBOLOS.includes(s)));
  const ver = [...new Set([...(pedidos.length ? pedidos : SIMBOLOS), ...realce])];
  const raiz = marco(c, 'carta', p.titulo, T('etiqueta'));
  const ul = el('ul', { class: 'clase-dib-carta-lista' }, raiz);
  for (const s of ver) {
    const li = el('li', { class: `clase-dib-carta-item${realce.has(s) ? ' clase-dib-carta-resaltado' : ''}` }, ul);
    const lienzo = svg('svg', { viewBox: '0 0 120 76', class: 'clase-dib-carta-lienzo', role: 'img', 'aria-label': `${T(s)}: ${T(`d_${s}`)}` }, li);
    svg('rect', { x: 0, y: 0, width: 120, height: 76, rx: 8, class: 'clase-dib-carta-papel' }, lienzo);
    DIBUJO[s](svg('g', {}, lienzo));
    el('strong', {}, li, T(s));
    el('span', { class: 'clase-dib-detalle' }, li, T(`d_${s}`));
  }
  return api(raiz);
}
