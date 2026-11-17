// Academia 0.14.29 (pedido del dueño): el EXAMINADOR animado de la «Práctica en vivo» del oral. Un personaje ORIGINAL
// (no es nadie de verdad): un capitán con gorra, charreteras y corbata, dibujado aquí mismo como SVG (createElementNS,
// nunca texto como código) y animado solo con clases de CSS (public/academia.css, «.examinador»). Sin archivos de afuera.
// Estados (data-estado en el <svg>): 'quieto' (parpadea y respira), 'hablando' (mueve la boca mientras suena la voz),
// 'leyendo' (sin voz: señala la pregunta y asiente), 'escuchando' (ladea la cabeza y asiente), 'bien' (pulgar arriba),
// 'casi' (mano en la barbilla), 'mal' (niega con la cabeza). Con «reducir movimiento», todo quieto.
const NS = 'http://www.w3.org/2000/svg';
function s(etiqueta, props = {}, ...hijos) {
  const n = document.createElementNS(NS, etiqueta);
  for (const [k, v] of Object.entries(props)) n.setAttribute(k, String(v));
  for (const h of hijos.flat()) if (h) n.append(h);
  return n;
}

export const ESTADOS_EXAMINADOR = Object.freeze(['quieto', 'hablando', 'leyendo', 'escuchando', 'bien', 'casi', 'mal']);

export function crearExaminador({ etiqueta = '' } = {}) {
  const PIEL = '#e0ac82';
  const PIEL_SOMBRA = '#c98f66';
  const AZUL = '#1d2a4a';
  const AZUL_CLARO = '#2c3d66';
  const ORO = '#e2b23c';
  const ojo = x => s('g', { class: 'ex-ojo' },
    s('ellipse', { cx: x, cy: 101, rx: 6.5, ry: 4.6, fill: '#fff' }),
    s('circle', { cx: x + 0.6, cy: 101.3, r: 3.1, fill: '#4a3222' }),
    s('circle', { cx: x + 1.4, cy: 100.2, r: 1, fill: '#fff' }));
  const mano = (clase, transformar, dedoArriba = false) => s('g', { class: clase, transform: transformar },
    s('path', { d: 'M-12 18 L-14 44 L14 44 L12 18 Z', fill: AZUL_CLARO }), // la manga
    s('rect', { x: -14, y: 14, width: 28, height: 6, rx: 2, fill: ORO }), // el galón de la manga
    s('rect', { x: -11, y: -6, width: 22, height: 21, rx: 9, fill: PIEL }), // la mano
    dedoArriba ? s('rect', { x: -4, y: -24, width: 9, height: 22, rx: 4.5, fill: PIEL, stroke: PIEL_SOMBRA, 'stroke-width': 1 }) // el pulgar
      : s('rect', { x: 4, y: -18, width: 7, height: 16, rx: 3.5, fill: PIEL, stroke: PIEL_SOMBRA, 'stroke-width': 1 }), // el índice
    s('path', { d: 'M-8 2 h14 M-8 7 h14', stroke: PIEL_SOMBRA, 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round' }));

  const cabeza = s('g', { class: 'ex-cabeza' },
    s('rect', { x: 88, y: 128, width: 24, height: 22, rx: 6, fill: PIEL_SOMBRA }), // el cuello
    s('ellipse', { cx: 63, cy: 106, rx: 7, ry: 10, fill: PIEL_SOMBRA }), // las orejas
    s('ellipse', { cx: 137, cy: 106, rx: 7, ry: 10, fill: PIEL_SOMBRA }),
    s('path', { d: 'M64 96 C64 66 136 66 136 96 L136 112 C136 138 118 150 100 150 C82 150 64 138 64 112 Z', fill: PIEL }), // la cara
    s('path', { d: 'M64 98 C62 84 66 76 72 72 L72 92 Z M136 98 C138 84 134 76 128 72 L128 92 Z', fill: '#4b3424' }), // las patillas
    s('path', { d: 'M86 92 Q93 87 99 91', stroke: '#4b3424', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', class: 'ex-ceja' }),
    s('path', { d: 'M101 91 Q107 87 114 92', stroke: '#4b3424', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', class: 'ex-ceja' }),
    s('g', { class: 'ex-ojos' }, ojo(92), ojo(108)),
    s('path', { d: 'M100 104 Q97 116 100 119 Q103 120 104 118', stroke: PIEL_SOMBRA, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }), // la nariz
    s('path', { d: 'M86 124 Q100 121 114 124 Q100 128 86 124 Z', fill: '#6d4a33' }), // el bigote
    s('path', { d: 'M90 131 Q100 136 110 131', stroke: '#8a4b3c', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round', class: 'ex-boca-cerrada' }),
    s('ellipse', { cx: 100, cy: 132, rx: 7, ry: 4.5, fill: '#6b2a26', class: 'ex-boca-abierta' }),
    // la gorra de capitán: copa, banda, emblema y visera
    s('path', { d: 'M58 70 C58 44 142 44 142 70 L136 78 L64 78 Z', fill: AZUL }),
    s('rect', { x: 62, y: 70, width: 76, height: 9, rx: 3, fill: '#111827' }),
    s('path', { d: 'M64 78 C80 87 120 87 136 78 L134 83 C118 90 82 90 66 83 Z', fill: '#0b1020' }), // la visera
    s('path', { d: 'M70 76 C85 82 115 82 130 76', stroke: ORO, 'stroke-width': 1.6, fill: 'none' }), // el cordón dorado
    s('g', { transform: 'translate(100 61)' },
      s('ellipse', { cx: 0, cy: 0, rx: 11, ry: 7, fill: ORO }),
      s('path', { d: 'M-16 1 Q-8 -6 -3 0 M16 1 Q8 -6 3 0', stroke: ORO, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), // las alas
      s('circle', { cx: 0, cy: 0, r: 3, fill: AZUL })));

  const cuerpo = s('g', { class: 'ex-cuerpo' },
    s('path', { d: 'M30 220 C30 172 56 152 100 150 C144 152 170 172 170 220 Z', fill: AZUL }), // el saco
    s('path', { d: 'M84 150 L100 182 L116 150 Z', fill: '#f8fafc' }), // la camisa
    s('path', { d: 'M96 158 L104 158 L106 196 L100 204 L94 196 Z', fill: '#0f172a' }), // la corbata
    s('path', { d: 'M95 152 L105 152 L104 160 L96 160 Z', fill: '#1f2937' }), // el nudo
    s('path', { d: 'M84 150 L96 176 L78 170 Z M116 150 L104 176 L122 170 Z', fill: AZUL_CLARO }), // las solapas
    // las charreteras: cuatro galones dorados (capitán)
    s('g', { transform: 'translate(48 166) rotate(-14)' }, s('rect', { x: -14, y: -6, width: 30, height: 14, rx: 3, fill: '#0b1020' }), [-3, 0, 3, 6].map(y => s('rect', { x: -11, y: y - 2, width: 24, height: 1.8, fill: ORO }))),
    s('g', { transform: 'translate(152 166) rotate(14)' }, s('rect', { x: -16, y: -6, width: 30, height: 14, rx: 3, fill: '#0b1020' }), [-3, 0, 3, 6].map(y => s('rect', { x: -13, y: y - 2, width: 24, height: 1.8, fill: ORO }))),
    s('path', { d: 'M120 186 l12 0 l-2 4 l-8 0 Z', fill: ORO }), // las alas del pecho
    s('circle', { cx: 100, cy: 210, r: 2.2, fill: ORO }));

  const svg = s('svg', { viewBox: '0 0 200 220', class: 'examinador', 'data-estado': 'quieto', role: 'img', 'aria-label': etiqueta, focusable: 'false' },
    s('circle', { cx: 100, cy: 118, r: 96, class: 'ex-fondo' }),
    s('g', { class: 'ex-respira' }, cuerpo, cabeza,
      mano('ex-mano ex-mano-senala', 'translate(158 176) rotate(-18)'),
      mano('ex-mano ex-mano-pulgar', 'translate(156 170) rotate(-8)', true),
      mano('ex-mano ex-mano-barbilla', 'translate(118 148) rotate(-32)')));
  let reloj = null;
  return {
    nodo: svg,
    // Pone un estado; con ms, vuelve a 'quieto' después (si nadie lo cambió antes).
    poner(estado, ms = 0) {
      if (!ESTADOS_EXAMINADOR.includes(estado)) return;
      clearTimeout(reloj);
      svg.setAttribute('data-estado', estado);
      if (ms > 0) reloj = setTimeout(() => { if (svg.getAttribute('data-estado') === estado) svg.setAttribute('data-estado', 'quieto'); }, ms);
    },
    estado: () => svg.getAttribute('data-estado'),
  };
}
