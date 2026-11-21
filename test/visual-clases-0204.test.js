// Academia 0.14.104: la pasada visual del lugar donde se estudia (pedido de Junior: «mejora más el sistema visual y donde
// se toman las clases»). Lee el código de verdad (sin navegador): el dibujo de una tarjeta va en su columna (al lado del
// texto en la pantalla ancha), nada se sale de lado al entrar una tarjeta, lo que se toca mide 44 px y con «reducir
// movimiento» no se anima. Los colores nuevos se miden en test/contraste-diagramas.test.js.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = r => readFileSync(new URL(`../public/${r}`, import.meta.url), 'utf8');
const app = leer('app.js');
const css = leer('interfaz.css');
const bloque = css.slice(css.indexOf('0.14.104: donde se estudia'));

test('0.14.104: el clip, la foto y el dibujo de una tarjeta van juntos en .tarjeta-medio; el texto se queda donde realce.js lo busca', () => {
  const vista = /function vistaTarjeta\([\s\S]*?\n\}/.exec(app)[0];
  assert.match(vista, /const medio = \[clip\?\.nodo, foto, visual, reportarVisual\]\.filter\(Boolean\);/);
  assert.match(vista, /if \(medio\.some\(x => x !== reportarVisual\)\) \{/, 'solo «⚑ Reportar» (sin dibujo) no arma columna');
  assert.match(vista, /el\('div', \{ class: 'tarjeta-medio' \}\)/);
  assert.match(vista, /medio\[0\]\.before\(columna\);\s*columna\.append\(\.\.\.medio\);/);
  // Los puntos y las fichas siguen siendo hijos directos de la tarjeta (realce.js usa :scope >).
  assert.match(leer('clase/realce.js'), /:scope > \.tarjeta-puntos > li/);
  assert.doesNotMatch(vista, /innerHTML|\.style\./);
});

test('0.14.104: en la pantalla ancha, el dibujo al lado del texto y pegado arriba; en el teléfono, apilado', () => {
  assert.ok(bloque.length > 1000, 'el bloque 0.14.104 está al final de interfaz.css');
  const ancho = bloque.slice(bloque.indexOf('@media (min-width: 1100px)'));
  // Solo si la columna tiene de verdad un dibujo, un clip o una foto (si la foto no carga, se quita y no queda una columna vacía).
  const med = '> .tarjeta-medio > :is(.tarjeta-visual, .tarjeta-clip, .tarjeta-foto)';
  assert.ok(ancho.includes(`.tarjeta-leccion:has(${med}) {\n    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);`));
  assert.match(ancho, /grid-template-rows: repeat\(16, auto\) 1fr;/, 'lo que sobra del dibujo va a la fila 1fr: sin huecos en el texto');
  assert.ok(ancho.includes(`.tarjeta-leccion:has(${med}) > .tarjeta-medio { grid-column: 2; grid-row: 1 / -1; margin: 0; }`));
  // Pegado arriba solo en una pantalla alta (en 1280 × 720 escondería los botones de una escena 3D alta).
  assert.ok(ancho.includes(`@media (min-width: 1100px) and (min-height: 820px) {\n  .tarjeta-leccion:has(${med}) > .tarjeta-medio { position: sticky; top: 84px; }`));
  // El texto solo, con un ancho cómodo (unos 68 caracteres).
  assert.match(bloque, /\.tarjeta-leccion > :is\(\.tarjeta-texto, \.tarjeta-puntos, \.recuerda, \.caja-ejemplo, \.nota-tarjeta\) \{ max-width: 68ch; \}/);
});

test('0.14.104: nada se sale de lado (la tarjeta que entra, el festejo) y una tabla ancha se lee entera', () => {
  assert.match(bloque, /\.inmersivo \{ overflow-x: clip; \}/);
  // El cuadro se desliza; la tabla sigue a todo el ancho (como bloque se encogía y su cabeza azul quedaba corta).
  assert.match(bloque, /\.tarjeta-visual \.clase-diagrama \{ grid-template-columns: minmax\(0, 1fr\); min-width: 0; overflow-x: auto;/);
  assert.doesNotMatch(bloque, /\.clase-diagrama-tabla \{[^}]*display: block/);
});

test('0.14.104: lo que se toca en la clase mide 44 px o más, y con «reducir movimiento» no se anima', () => {
  for (const sel of ['.lectura-barra .boton-escuchar, .lectura-barra .interruptor-voz, .q-escuchar .boton-escuchar {', '.entendi-boton {', '.mas-fuentes summary {', '.boton-3d.chico {', '.ficha-ingles, .ficha-realzada {']) {
    const i = bloque.indexOf(sel);
    assert.ok(i >= 0, sel);
    assert.match(bloque.slice(i, bloque.indexOf('}', i)), /min-height: 44px/, sel);
  }
  const quieto = bloque.slice(bloque.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(quieto, /\.tarjeta-leccion, \.tarjeta-girar, \.tarjeta-pregunta, \.hoja-respuesta, \.punto-realzado, \.tarjeta-realzada \.recuerda \{ animation: none !important; \}/);
  assert.match(quieto, /transition: none !important;/);
});

test('0.14.104: el bloque no usa colores de tema que no existan y define los suyos en claro, oscuro y automático', () => {
  const definidas = new Set([...['estilos.css', 'academia.css', 'interfaz.css', 'instructor.css', 'alumnos.css', 'clase/clase.css'].map(leer).join('\n').matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
  const usadas = [...new Set([...bloque.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map(m => m[1]))];
  assert.deepEqual(usadas.filter(v => !definidas.has(v)), []);
  for (const tema of [':root {', ':root[data-tema="oscuro"] {', ':root[data-tema="auto"] {']) assert.ok(bloque.includes(tema), tema);
});

// El color de cada materia: el blanco de «MATERIA 2» y del nombre sobre su tarjeta, ya más oscura (78 % del color con negro,
// la parte más clara del degradado), con 4.5:1 o más; la dorada (mc-8), letra oscura sobre su color aclarado.
test('0.14.104: los nombres de las materias se leen sobre su color (AA) en el Camino', () => {
  const academia = leer('academia.css');
  const colores = Object.fromEntries([...academia.matchAll(/\.mc-(\d+) \{ --mc: (#[0-9a-f]{6}); \}/g)].map(m => [m[1], m[2]]));
  assert.equal(Object.keys(colores).length, 11);
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mezcla = (c, p, otro) => c.map((v, i) => v * p + otro[i] * (1 - p));
  for (const [n, hex] of Object.entries(colores)) {
    const r = n === '8' ? contraste(rgb('#2b1d00'), mezcla(rgb(hex), 0.78, [255, 255, 255])) : contraste([255, 255, 255], mezcla(rgb(hex), 0.78, [0, 0, 0]));
    assert.ok(r >= 4.5, `mc-${n}: ${r.toFixed(2)}`);
  }
  assert.match(bloque, /\.materia-bloque:not\(\.vacia\):not\(\.mc-8\) \.banner-materia \{ background: linear-gradient\(160deg, color-mix\(in srgb, var\(--mc\) 78%, #000000\)/);
  assert.match(bloque, /\.materia-bloque\.mc-8:not\(\.vacia\) \.banner-materia \{ background: color-mix\(in srgb, var\(--mc\) 78%, #ffffff\); \}/);
  assert.match(bloque, /\.materia-bloque:not\(\.vacia\) \.banner-ante \{ opacity: 1; \}/);
});
