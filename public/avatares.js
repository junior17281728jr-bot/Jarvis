// Academia (0.9.0): los avatares de aviación que cada persona elige en Configuración → Mi perfil. Una figura y un color
// de una lista fija (las mismas listas que revisa el servidor: src/cuentas/perfil.js). Se dibujan aquí, en SVG, con
// createElementNS (sin archivos de imagen, sin texto convertido en código). Sin avatar elegido: la avioneta de siempre
// con la inicial y un color que sale del nombre. Este módulo no importa nada.
export const FORMAS_AVATAR = Object.freeze(['avioneta', 'jet', 'helicoptero', 'globo', 'alas', 'brujula']);
export const COLORES_AVATAR = Object.freeze(['azul', 'rojo', 'verde', 'naranja', 'morado', 'amarillo']);

const SVG = 'http://www.w3.org/2000/svg';
// Cada figura en un cuadro de 48 × 48 (el círculo de color va detrás). [etiqueta, atributos, clase]
const FIGURAS = {
  avioneta: [
    ['path', { d: 'M24 8c1.6 0 2.4 1.6 2.4 4v7.5l13 6.2v3.6l-13-3.4v7.4l4 3v2.8L24 37.5l-6.4 1.6v-2.8l4-3v-7.4l-13 3.4v-3.6l13-6.2V12c0-2.4.8-4 2.4-4z' }, 'lleno'],
  ],
  jet: [
    ['path', { d: 'M24 6c1.4 1.6 2.2 4 2.2 7v6.6L40 28v3.6l-13.8-4.8v6.4l4.8 3.6V40L24 38l-7 2v-3.2l4.8-3.6v-6.4L8 31.6V28l13.8-8.4V13c0-3 .8-5.4 2.2-7z' }, 'lleno'],
    ['path', { d: 'M24 10.5v5' }, 'linea'],
  ],
  helicoptero: [
    ['path', { d: 'M10 13h28' }, 'linea'],
    ['path', { d: 'M24 13v4' }, 'linea'],
    ['path', { d: 'M15 25c0-5 4-8.5 9-8.5s9 3.5 9 8.5-4 8-9 8h-2.5L13 35v-3l3-1.4C15.4 29 15 27.2 15 25z' }, 'lleno'],
    ['path', { d: 'M33 25h7l2-3' }, 'linea'],
    ['path', { d: 'M17 38h14' }, 'linea'],
  ],
  globo: [
    ['path', { d: 'M24 7c7 0 12 5 12 11.5 0 6-5 10.5-8.5 13.5h-7C17 29 12 24.5 12 18.5 12 12 17 7 24 7z' }, 'lleno'],
    ['path', { d: 'M24 7c-3 3-4.5 7-4.5 11.5S21 28 22 32M24 7c3 3 4.5 7 4.5 11.5S27 28 26 32' }, 'linea-suave'],
    ['path', { d: 'M20.5 32l1 4h5l1-4' }, 'linea'],
    ['path', { d: 'M21 36.5h6v4h-6z' }, 'lleno'],
  ],
  alas: [
    ['path', { d: 'M24 18c2.8 0 4.8 2.2 4.8 5s-2 5-4.8 5-4.8-2.2-4.8-5 2-5 4.8-5z' }, 'lleno'],
    ['path', { d: 'M18 21c-4-1.6-8-1.6-12 0 2 1.4 4.4 2 6.6 2-2 .4-3.8 1.2-5.2 2.6 3.6.8 7 .4 10.6-1.2M30 21c4-1.6 8-1.6 12 0-2 1.4-4.4 2-6.6 2 2 .4 3.8 1.2 5.2 2.6-3.6.8-7 .4-10.6-1.2' }, 'linea'],
  ],
  brujula: [
    ['circle', { cx: 24, cy: 24, r: 13 }, 'linea'],
    ['path', { d: 'M24 13.5l4 10.5-4 10.5-4-10.5z' }, 'lleno'],
    ['path', { d: 'M24 13.5l4 10.5h-8z' }, 'aguja'],
  ],
};

export function avatarValido(valor) {
  if (typeof valor !== 'string') return false;
  const [forma, color, ...resto] = valor.split('-');
  return !resto.length && FORMAS_AVATAR.includes(forma) && COLORES_AVATAR.includes(color);
}
// El color que sale del nombre (para quien no eligió avatar): siempre el mismo para el mismo nombre.
export const colorDeNombre = nombre => COLORES_AVATAR[[...String(nombre ?? '')].reduce((n, c) => n + c.codePointAt(0), 0) % COLORES_AVATAR.length];

function nodo(etiqueta, atributos = {}) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) if (valor != null) n.setAttribute(clave, String(valor));
  return n;
}

// El avatar como un <svg> (redondo). avatar: 'jet-rojo' o null; nombre: para la inicial y el color de siempre.
// tamano: 'chico' | 'medio' | 'grande'. etiqueta: lo que dice VoiceOver (sin ella, se esconde: es decoración).
export function dibujarAvatar(avatar, { nombre = '', tamano = 'medio', etiqueta = null } = {}) {
  const valido = avatarValido(avatar);
  const [forma, color] = valido ? avatar.split('-') : ['avioneta', colorDeNombre(nombre)];
  const s = nodo('svg', { viewBox: '0 0 48 48', class: `avatar avatar-${tamano} av-${color}${valido ? '' : ' av-inicial'}`, focusable: 'false', ...(etiqueta ? { role: 'img', 'aria-label': etiqueta } : { 'aria-hidden': 'true' }) });
  s.append(nodo('circle', { cx: 24, cy: 24, r: 23, class: 'av-fondo' }));
  if (!valido) {
    const inicial = String(nombre ?? '').trim().charAt(0).toUpperCase() || '?';
    const tx = nodo('text', { x: 24, y: 25, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'av-letra' });
    tx.textContent = inicial;
    s.append(tx);
    return s;
  }
  for (const [etiquetaSvg, atributos, clase] of FIGURAS[forma]) s.append(nodo(etiquetaSvg, { ...atributos, class: `av-${clase}` }));
  return s;
}
