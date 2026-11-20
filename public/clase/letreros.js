// 0.14.62: los letreros del aeropuerto (AIM 2-3-7 a 2-3-13) con sus colores de verdad, iguales en modo claro y oscuro:
//  - obligatorio (y «no entrar»): fondo ROJO, letras BLANCAS (con borde negro);
//  - ubicación: fondo NEGRO, letras y marco AMARILLOS;
//  - dirección, destino e información: fondo AMARILLO, letras NEGRAS (dirección y destino con su flecha);
//  - distancia restante: fondo NEGRO, número BLANCO (miles de pies que quedan);
//  - límite de la pista y del área crítica del ILS: AMARILLO con el dibujo NEGRO de la marca de espera.
// Y tres «dibujos del suelo»: la marca de espera de la pista (2 líneas continuas del lado donde esperas y 2 discontinuas),
// la del área crítica del ILS (2 líneas unidas por pares de rayas) y el «hot spot» del diagrama del aeropuerto.
// parametros: { titulo?, letreros: [{ tipo, texto?, flecha?, pegado?, nota? }] }; «pegado» une el letrero al anterior.
import { el, svg, f1 } from './comun.js';
import { traductor, marco, api, lista } from './aviacion-base.js';

export const TIPOS = ['obligatorio', 'no_entrar', 'ubicacion', 'direccion', 'destino', 'informacion', 'distancia', 'limite_pista', 'limite_ils', 'espera_pista', 'espera_ils', 'punto_caliente'];
export const SUELO = ['espera_pista', 'espera_ils', 'punto_caliente'];
// Colores del letrero: [fondo, letras, marco?]. Los mismos en claro y oscuro (son los del aeropuerto).
export const COLORES = {
  obligatorio: ['rojo', 'blanco'], no_entrar: ['rojo', 'blanco'], ubicacion: ['negro', 'amarillo', 'amarillo'],
  direccion: ['amarillo', 'negro'], destino: ['amarillo', 'negro'], informacion: ['amarillo', 'negro'],
  distancia: ['negro', 'blanco'], limite_pista: ['amarillo', 'negro'], limite_ils: ['amarillo', 'negro'],
};
const GIRO = { arriba: 0, arriba_derecha: 45, derecha: 90, abajo_derecha: 135, abajo: 180, abajo_izquierda: 225, izquierda: 270, arriba_izquierda: 315 };

export const TEXTOS_LETREROS = {
  etiqueta: 'Letreros y marcas del aeropuerto',
  obligatorio: 'Instrucción obligatoria: rojo con letras blancas. No pases sin permiso.',
  no_entrar: 'No entrar: rojo con el círculo blanco. Prohibido entrar ahí.',
  ubicacion: 'Ubicación: negro con letras y marco amarillos. Dice dónde estás.',
  direccion: 'Dirección: amarillo con letras negras y flecha. Dice hacia dónde va cada calle de rodaje.',
  destino: 'Destino: amarillo con letras negras y flecha. Lleva a un lugar del aeropuerto.',
  informacion: 'Información: amarillo con letras negras. Frecuencias, ruido y otros datos.',
  distancia: 'Distancia restante: negro con el número blanco. Miles de pies de pista que te quedan.',
  limite_pista: 'Límite de la pista: amarillo con la marca de espera en negro. Al pasarlo, saliste de la pista.',
  limite_ils: 'Límite del área crítica del ILS: amarillo con la marca del ILS en negro.',
  espera_pista: 'Marca de espera de la pista: 4 líneas amarillas. Las continuas quedan de tu lado (ahí esperas); las discontinuas, del lado de la pista.',
  espera_ils: 'Marca de espera del área crítica del ILS: 2 líneas amarillas unidas por pares de rayas.',
  punto_caliente: '«Hot spot» en el diagrama del aeropuerto: un lugar donde ya hubo choques o incursiones. Ahí, más cuidado.',
  pista: 'PISTA', hs: 'HS 1',
  sNombre: '{tipo}: «{texto}»', sFlecha: 'flecha hacia {flecha}',
  arriba: 'adelante', arriba_derecha: 'adelante a la derecha', derecha: 'la derecha', abajo_derecha: 'atrás a la derecha',
  abajo: 'atrás', abajo_izquierda: 'atrás a la izquierda', izquierda: 'la izquierda', arriba_izquierda: 'adelante a la izquierda',
};

const ALTO = 48, FUENTE = 28;
const anchoTexto = t => [...String(t)].reduce((s, ch) => s + (/[-.·•]/.test(ch) ? 0.38 : /[ ]/.test(ch) ? 0.3 : /[MW]/.test(ch) ? 0.86 : /[I1]/.test(ch) ? 0.36 : 0.64), 0) * FUENTE;

function flecha(padre, x, y, direccion, clase) {
  const g = svg('g', { transform: `translate(${f1(x)} ${f1(y)}) rotate(${GIRO[direccion] ?? 0})` }, padre);
  svg('path', { d: 'M0 -15L11 -3L4 -3L4 15L-4 15L-4 -3L-11 -3Z', class: clase }, g);
}
// Un panel del letrero: lo dibuja desde x y devuelve su ancho.
function panel(lienzo, x, l) {
  const [fondo, letras, borde] = COLORES[l.tipo];
  const g = svg('g', { class: `clase-dib-letrero clase-dib-letrero-${l.tipo}` }, lienzo);
  const texto = l.tipo === 'distancia' ? String(l.texto ?? '') : String(l.texto ?? '').toUpperCase();
  let ancho;
  if (l.tipo === 'no_entrar' || l.tipo === 'limite_pista' || l.tipo === 'limite_ils') ancho = l.tipo === 'no_entrar' ? 56 : 76;
  else ancho = Math.max(l.tipo === 'distancia' ? 44 : 40, anchoTexto(texto) + 24 + (l.flecha ? 30 : 0));
  svg('rect', { x: f1(x), y: 0, width: f1(ancho), height: ALTO, class: `clase-dib-color-${fondo}` }, g);
  if (borde) svg('rect', { x: f1(x + 3.5), y: 3.5, width: f1(ancho - 7), height: ALTO - 7, class: `clase-dib-marco-${borde}` }, g);
  if (l.tipo === 'no_entrar') {
    svg('circle', { cx: f1(x + 28), cy: 24, r: 15, class: 'clase-dib-trazo-blanco' }, g);
    svg('rect', { x: f1(x + 18), y: 21, width: 20, height: 6, class: 'clase-dib-color-blanco' }, g);
  } else if (l.tipo === 'limite_pista') {
    for (const [yy, discontinua] of [[13, false], [20, false], [28, true], [35, true]]) {
      svg('line', { x1: f1(x + 10), y1: yy, x2: f1(x + ancho - 10), y2: yy, class: `clase-dib-raya-negra${discontinua ? ' clase-dib-raya-discontinua' : ''}` }, g);
    }
  } else if (l.tipo === 'limite_ils') {
    svg('line', { x1: f1(x + 10), y1: 15, x2: f1(x + ancho - 10), y2: 15, class: 'clase-dib-raya-negra' }, g);
    svg('line', { x1: f1(x + 10), y1: 33, x2: f1(x + ancho - 10), y2: 33, class: 'clase-dib-raya-negra' }, g);
    for (let i = 0; i < 3; i++) for (const d of [0, 5]) svg('line', { x1: f1(x + 18 + i * 19 + d), y1: 15, x2: f1(x + 18 + i * 19 + d), y2: 33, class: 'clase-dib-raya-negra clase-dib-raya-fina' }, g);
  } else {
    const izq = Boolean(l.flecha) && /izquierda/.test(l.flecha);
    const tw = anchoTexto(texto), cw = tw + (l.flecha ? 30 : 0), inicio = x + (ancho - cw) / 2;
    const xt = inicio + (izq ? 30 : 0) + tw / 2;
    svg('text', { x: f1(xt), y: 35, 'text-anchor': 'middle', class: `clase-dib-letrero-texto clase-dib-letras-${letras}` }, g, texto);
    if (l.flecha) flecha(g, izq ? inicio + 12 : inicio + tw + 18, 24, l.flecha, `clase-dib-color-${letras}`);
  }
  return ancho;
}

// Los dibujos del suelo: un pedazo de pavimento visto desde arriba.
function suelo(padre, l, T) {
  const s = svg('svg', { viewBox: '0 0 180 130', class: 'clase-dib-lienzo clase-dib-suelo', role: 'img', 'aria-label': T(l.tipo) }, padre);
  if (l.tipo === 'punto_caliente') {
    svg('rect', { x: 0, y: 0, width: 180, height: 130, rx: 8, class: 'clase-dib-papel' }, s);
    svg('rect', { x: 6, y: 26, width: 168, height: 18, class: 'clase-dib-diagrama-pista' }, s);
    for (const x of [44, 128]) svg('rect', { x: x - 6, y: 44, width: 12, height: 86, class: 'clase-dib-diagrama-rodaje' }, s);
    svg('rect', { x: 6, y: 92, width: 168, height: 12, class: 'clase-dib-diagrama-rodaje' }, s);
    svg('ellipse', { cx: 44, cy: 60, rx: 26, ry: 24, class: 'clase-dib-punto-caliente' }, s);
    svg('text', { x: 78, y: 70, class: 'clase-dib-punto-caliente-texto' }, s, String(l.texto || T('hs')).toUpperCase());
    return s;
  }
  svg('rect', { x: 0, y: 0, width: 180, height: 130, rx: 8, class: 'clase-dib-terreno' }, s);
  svg('rect', { x: 0, y: 6, width: 180, height: 40, class: 'clase-dib-asfalto' }, s);
  svg('rect', { x: 0, y: 42, width: 180, height: 2.5, class: 'clase-dib-pintura' }, s);
  svg('text', { x: 90, y: 30, 'text-anchor': 'middle', class: 'clase-dib-suelo-texto' }, s, T('pista'));
  svg('rect', { x: 62, y: 44, width: 56, height: 86, class: 'clase-dib-asfalto' }, s);
  svg('line', { x1: 90, y1: 44, x2: 90, y2: 130, class: 'clase-dib-raya-amarilla' }, s);
  if (l.tipo === 'espera_pista') {
    for (const [yy, discontinua] of [[62, true], [68, true], [76, false], [82, false]]) svg('line', { x1: 62, y1: yy, x2: 118, y2: yy, class: `clase-dib-raya-amarilla${discontinua ? ' clase-dib-raya-discontinua' : ''}` }, s);
  } else {
    svg('line', { x1: 62, y1: 64, x2: 118, y2: 64, class: 'clase-dib-raya-amarilla' }, s);
    svg('line', { x1: 62, y1: 80, x2: 118, y2: 80, class: 'clase-dib-raya-amarilla' }, s);
    for (const x of [70, 76, 104, 110]) svg('line', { x1: x, y1: 64, x2: x, y2: 80, class: 'clase-dib-raya-amarilla' }, s);
  }
  svg('path', { d: 'M90 112L84 122L96 122Z', class: 'clase-dib-avion-suelo' }, s);
  return s;
}

export function montarLetreros(c, p = {}, o = {}) {
  const T = traductor(o, 'letreros', TEXTOS_LETREROS);
  const todos = lista(p.letreros).filter(l => l && TIPOS.includes(l.tipo)).slice(0, 8);
  // Grupos: un letrero «pegado» va en el mismo conjunto que el anterior (como los de verdad). Los del suelo, solos.
  const grupos = [];
  for (const l of todos) {
    if (l.pegado && grupos.length && !SUELO.includes(l.tipo) && !SUELO.includes(grupos.at(-1)[0].tipo)) grupos.at(-1).push(l);
    else grupos.push([l]);
  }
  const nombre = l => (SUELO.includes(l.tipo) ? T(l.tipo).split(':')[0] : T('sNombre', { tipo: T(l.tipo).split(':')[0], texto: l.texto ?? '' }) + (l.flecha ? `, ${T('sFlecha', { flecha: T(l.flecha) })}` : ''));
  const raiz = marco(c, 'letreros', p.titulo, T('etiqueta'));
  const ul = el('ul', { class: 'clase-dib-letreros-lista' }, raiz);
  for (const grupo of grupos) {
    const li = el('li', { class: 'clase-dib-letrero-item' }, ul);
    const etiqueta = grupo.map(nombre).join(' + ');
    if (SUELO.includes(grupo[0].tipo)) suelo(li, grupo[0], T);
    else {
      const s = svg('svg', { class: 'clase-dib-letrero-svg', role: 'img', 'aria-label': etiqueta }, li);
      let x = 0;
      grupo.forEach((l, i) => {
        const amarillo = COLORES[l.tipo][0] === 'amarillo';
        if (i > 0 && amarillo && COLORES[grupo[i - 1].tipo][0] === 'amarillo') { svg('rect', { x: f1(x), y: 0, width: 4, height: ALTO, class: 'clase-dib-color-negro' }, s); x += 4; }
        x += panel(s, x, l);
      });
      s.setAttribute('viewBox', `0 0 ${f1(x)} ${ALTO}`);
      s.setAttribute('width', f1(x));
      s.setAttribute('height', ALTO);
    }
    const pie = el('div', { class: 'clase-dib-letrero-pie' }, li);
    for (const tipo of [...new Set(grupo.map(l => l.tipo))]) el('p', {}, pie, T(tipo));
    for (const l of grupo) if (l.nota) el('p', { class: 'clase-dib-detalle' }, pie, l.nota);
  }
  return api(raiz);
}
