// 0.14.62: el circuito de tránsito (traffic pattern), como en el AIM 4-3-3 (FIG 4-3-2) y el AFH cap. 8: la pista con sus
// números, los cinco tramos, la entrada a 45° al tramo de viento en cola a mitad de la pista, la salida a 45° y la altitud
// del circuito. Los virajes son a la IZQUIERDA salvo que se indique otra cosa («RP» en la carta = circuito a la derecha).
// La pista se dibuja acostada, aterrizando hacia la derecha; la flecha del norte, el viento y la manga se giran con su rumbo.
// parametros: { titulo?, pista ('27'), lado ('izquierda'|'derecha'), altitud (1000), referencia ('AGL'|'MSL'),
//   resaltar? (upwind|crosswind|downwind|base|final|entrada|salida), entrada? (true), salida? (false),
//   viento? { direccion, velocidad }, manga? (true) }
import { el, svg, f1 } from './comun.js';
import { traductor, marco, api, leerPista, normal, tresCifras, vector, flechaFija, flechaNorte, punta, miles, num } from './aviacion-base.js';

export const TEXTOS_CIRCUITO = {
  etiqueta: 'Circuito de tránsito a la {lado} para la pista {pista}, a {altitud}.',
  izquierda: 'izquierda', derecha: 'derecha',
  upwind: 'Despegue', crosswind: 'Viento cruzado', downwind: 'Viento en cola', base: 'Base', final: 'Final',
  entrada: 'Entrada a 45°', salida: 'Salida a 45°',
  l_upwind: 'Tramo de despegue (upwind): sigue derecho después de la pista.',
  l_crosswind: 'Tramo de viento cruzado (crosswind): el primer viraje, después del final de la pista y a menos de 300 ft de la altitud del circuito.',
  l_downwind: 'Tramo de viento en cola (downwind): paralelo a la pista, a la altitud del circuito.',
  l_base: 'Tramo base (base leg): después de pasar el umbral, viraje hacia la pista.',
  l_final: 'Final: alineado con la pista; termina el viraje a final a 1/4 de milla o más.',
  l_entrada: 'Entrada a 45° al tramo de viento en cola, a mitad de la pista y a la altitud del circuito.',
  l_salida: 'Salida: derecho o con un viraje de 45° hacia el lado del circuito, ya a la altitud del circuito.',
  altitud: '{v} ft {ref}', viento: 'Viento {dir}° a {vel} kt: {frente} y {cruzado}.', calma: 'Viento en calma.',
  frente: '{v} kt de frente', cola: '{v} kt de cola', sinFrente: 'nada de frente ni de cola',
  cruzadoDer: '{v} kt cruzado desde la derecha', cruzadoIzq: '{v} kt cruzado desde la izquierda', sinCruzado: 'nada cruzado',
  virajes: 'Todos los virajes a la {lado}.', manga: 'La manga apunta hacia donde va el viento (se estira del todo con unos 15 kt).',
  norte: 'N',
};
export const TRAMOS = ['upwind', 'crosswind', 'downwind', 'base', 'final', 'entrada', 'salida'];

// Los rumbos de cada tramo (magnéticos, como la pista). Izquierda: el circuito queda a la izquierda de la pista.
export function geometriaCircuito({ pista = '27', lado = 'izquierda' } = {}) {
  const P = leerPista(pista);
  const H = P.rumbo, s = lado === 'derecha' ? 1 : -1;
  const r = g => { const n = Math.round(normal(g)); return n === 0 ? 360 : n; };
  return {
    pista: P, lado: lado === 'derecha' ? 'derecha' : 'izquierda',
    ladoDelCircuito: r(H + 90 * s),
    rumbos: { upwind: r(H), crosswind: r(H + 90 * s), downwind: r(H + 180), base: r(H - 90 * s), final: r(H), entrada: r(H + 180 + 45 * s), salida: r(H + 45 * s) },
  };
}
// Componentes del viento sobre la pista: frente (+) o cola (−); cruzado + desde la derecha.
export function componentesViento(rumboPista, direccion, velocidad) {
  const a = ((direccion - rumboPista) * Math.PI) / 180;
  return { frente: velocidad * Math.cos(a), cruzado: velocidad * Math.sin(a) };
}

const ANCHO = 400, ALTO = 300;

export function montarCircuito(c, p = {}, o = {}) {
  const T = traductor(o, 'circuito', TEXTOS_CIRCUITO);
  const geo = geometriaCircuito({ pista: p.pista, lado: p.lado });
  const der = geo.lado === 'derecha';
  const H = geo.pista.rumbo;
  const alt = T('altitud', { v: miles(num(p.altitud) ?? 1000), ref: p.referencia === 'MSL' ? 'MSL' : 'AGL' });
  const etiqueta = T('etiqueta', { lado: T(geo.lado), pista: geo.pista.texto, altitud: alt });
  const raiz = marco(c, 'circuito', p.titulo, etiqueta);
  const lienzo = svg('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'clase-dib-lienzo clase-dib-lienzo-circuito', role: 'img', 'aria-label': etiqueta }, raiz);
  // Dibujado para circuito a la izquierda (arriba de la pista); a la derecha queda abajo: reflejo sobre el eje de la pista.
  const Y = y => (der ? ALTO - y : y);
  const giro = der ? 1 : 0;
  svg('rect', { x: 0, y: 0, width: ANCHO, height: ALTO, rx: 14, class: 'clase-dib-terreno' }, lienzo);
  // La pista y sus números (cada uno se lee desde su lado de llegada).
  const PY = 210;
  svg('rect', { x: 140, y: f1(Y(PY) - 13), width: 130, height: 26, rx: 2, class: 'clase-dib-asfalto' }, lienzo);
  svg('line', { x1: 168, y1: f1(Y(PY)), x2: 244, y2: f1(Y(PY)), class: 'clase-dib-eje' }, lienzo);
  svg('text', { x: 152, y: f1(Y(PY)), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'clase-dib-numero-pista', transform: `rotate(90 152 ${f1(Y(PY))})` }, lienzo, geo.pista.texto);
  svg('text', { x: 258, y: f1(Y(PY)), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'clase-dib-numero-pista', transform: `rotate(-90 258 ${f1(Y(PY))})` }, lienzo, geo.pista.opuesta);
  // Los tramos.
  const tramos = {
    upwind: `M270 ${Y(210)}L310 ${Y(210)}`,
    crosswind: `M310 ${Y(210)}A20 20 0 0 ${giro} 330 ${Y(190)}L330 ${Y(110)}`,
    downwind: `M330 ${Y(110)}A20 20 0 0 ${giro} 310 ${Y(90)}L90 ${Y(90)}`,
    base: `M90 ${Y(90)}A20 20 0 0 ${giro} 70 ${Y(110)}L70 ${Y(190)}`,
    final: `M70 ${Y(190)}A20 20 0 0 ${giro} 90 ${Y(210)}L140 ${Y(210)}`,
  };
  const marcado = TRAMOS.includes(p.resaltar) ? p.resaltar : null;
  const sentido = { upwind: [300, 210, 1, 0], crosswind: [330, 150, 0, -1], downwind: [130, 90, -1, 0], base: [70, 150, 0, 1], final: [118, 210, 1, 0] };
  for (const [k, d] of Object.entries(tramos)) {
    const clase = `clase-dib-tramo${marcado === k ? ' clase-dib-resaltado' : ''}`;
    svg('path', { d, class: clase }, lienzo);
    const [x, y, dx, dy] = sentido[k];
    punta(lienzo, x, Y(y), dx, der ? -dy : dy, `clase-dib-tramo-punta${marcado === k ? ' clase-dib-resaltado-punta' : ''}`);
  }
  if (p.entrada !== false) {
    flechaFija(lienzo, 265, Y(30), 207, Y(88), `clase-dib-entrada${marcado === 'entrada' ? ' clase-dib-resaltado' : ''}`, 11);
    svg('text', { x: 272, y: f1(Y(34) + 5), class: 'clase-dib-texto clase-dib-texto-chico' }, lienzo, T('entrada'));
  }
  if (p.salida === true || marcado === 'salida') {
    svg('path', { d: `M330 ${Y(210)}L352 ${Y(210)}L384 ${Y(178)}`, class: `clase-dib-salida${marcado === 'salida' ? ' clase-dib-resaltado' : ''}` }, lienzo);
    punta(lienzo, 388, Y(174), 1, der ? 1 : -1, 'clase-dib-salida-punta');
    // En dos renglones, a la derecha del tramo de viento cruzado.
    const [r1, ...r2] = T('salida').split(' ');
    svg('text', { x: 396, y: (der ? 150 : 132) + 5, 'text-anchor': 'end', class: 'clase-dib-texto clase-dib-texto-chico' }, lienzo, r1);
    if (r2.length) svg('text', { x: 396, y: (der ? 168 : 150) + 5, 'text-anchor': 'end', class: 'clase-dib-texto clase-dib-texto-chico' }, lienzo, r2.join(' '));
  }
  // Rótulos de los tramos y la altitud.
  const rotulos = [['upwind', 300, 236, 'middle'], ['final', 105, 236, 'middle'], ['crosswind', 320, 150, 'end'], ['base', 80, 150, 'start'], ['downwind', 140, 76, 'middle']];
  for (const [k, x, y, ancla] of rotulos) svg('text', { x, y: f1(Y(y) + 5), 'text-anchor': ancla, class: `clase-dib-texto${marcado === k ? ' clase-dib-negrita' : ''}` }, lienzo, T(k));
  svg('text', { x: 200, y: f1(Y(116) + 5), 'text-anchor': 'middle', class: 'clase-dib-texto clase-dib-negrita' }, lienzo, alt);
  // El norte (rumbo de pantalla = rumbo − rumbo de la pista + 90).
  flechaNorte(lienzo, 364, Y(268), 90 - H, T('norte'));
  // El viento: la flecha hacia donde sopla y la manga.
  const v = p.viento && num(p.viento.velocidad) != null && num(p.viento.direccion) != null ? p.viento : null;
  const datos = el('ul', { class: 'clase-dib-lista' }, raiz);
  el('li', { class: 'clase-dib-negrita' }, datos, T('virajes', { lado: T(geo.lado) }));
  if (v) {
    const haciaPantalla = v.direccion + 180 - H + 90;
    if (v.velocidad > 0) {
      const [ux, uy] = vector(haciaPantalla, 22);
      flechaFija(lienzo, 46 - ux, Y(268) - uy, 46 + ux, Y(268) + uy, 'clase-dib-viento-flecha', 12);
    }
    if (p.manga !== false) {
      const mx = 205, my = Y(268);
      svg('circle', { cx: mx, cy: my, r: 3.5, class: 'clase-dib-manga-poste' }, lienzo);
      if (v.velocidad > 0) {
        const largo = 10 + 26 * Math.min(1, v.velocidad / 15);
        const [ux, uy] = vector(haciaPantalla, 1), nx = -uy, ny = ux;
        const tira = (a, b, ancho1, ancho2, clase) => svg('path', { class: clase, d: `M${f1(mx + ux * a + nx * ancho1)} ${f1(my + uy * a + ny * ancho1)}L${f1(mx + ux * b + nx * ancho2)} ${f1(my + uy * b + ny * ancho2)}L${f1(mx + ux * b - nx * ancho2)} ${f1(my + uy * b - ny * ancho2)}L${f1(mx + ux * a - nx * ancho1)} ${f1(my + uy * a - ny * ancho1)}Z` }, lienzo);
        const n = 4, ancho = i => 7 - (3.5 * i) / n;
        for (let i = 0; i < n; i++) tira(3 + (largo * i) / n, 3 + (largo * (i + 1)) / n, ancho(i), ancho(i + 1), i % 2 ? 'clase-dib-manga-blanca' : 'clase-dib-manga-naranja');
      }
    }
    if (v.velocidad > 0) {
      const k = componentesViento(H, v.direccion, v.velocidad);
      const fr = Math.round(k.frente), cr = Math.round(k.cruzado);
      el('li', {}, datos, T('viento', {
        dir: tresCifras(v.direccion), vel: Math.round(v.velocidad),
        frente: fr > 0 ? T('frente', { v: fr }) : fr < 0 ? T('cola', { v: -fr }) : T('sinFrente'),
        cruzado: cr > 0 ? T('cruzadoDer', { v: cr }) : cr < 0 ? T('cruzadoIzq', { v: -cr }) : T('sinCruzado'),
      }));
      if (p.manga !== false) el('li', {}, datos, T('manga'));
    } else el('li', {}, datos, T('calma'));
  }
  const ol = el('ol', { class: 'clase-dib-leyenda' }, raiz);
  for (const k of TRAMOS.filter(k => (k === 'entrada' ? p.entrada !== false : k === 'salida' ? p.salida === true || marcado === 'salida' : true))) {
    el('li', { class: marcado === k ? 'clase-dib-leyenda-resaltada' : null }, ol, T(`l_${k}`));
  }
  return api(raiz);
}
