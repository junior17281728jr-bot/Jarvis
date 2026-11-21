// 0.14.101: la revisión final en la PC y el teléfono (claro y oscuro, de lado y de pie). Lo que se arregló, para que
// no vuelva: colores del tema que no existen, la hoja del reporte en oscuro, el número de «Mensajes» en la PC, el
// «0 %» de la palanca de potencia y el teléfono de lado (el juego y la práctica).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const publico = new URL('../public/', import.meta.url);
const leer = archivo => readFileSync(new URL(archivo, publico), 'utf8');
const cssDe = carpeta => readdirSync(new URL(carpeta, publico)).filter(f => f.endsWith('.css')).map(f => leer(`${carpeta}${f}`)).join('\n');
const jsDe = carpeta => readdirSync(new URL(carpeta, publico)).filter(f => f.endsWith('.js')).map(f => leer(`${carpeta}${f}`)).join('\n');
const bloque = (css, selector) => {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `falta ${selector}`);
  return css.slice(i, css.indexOf('}', i));
};

test('todo color del tema que se usa (var(--x)) existe: si no, sale el de reserva (antes, botones blancos en el oscuro)', () => {
  const css = `${cssDe('')}\n${cssDe('clase/')}`;
  const js = `${jsDe('')}\n${jsDe('clase/')}\n${leer('index.html')}`;
  const definidas = new Set([...`${css}\n${js}`.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
  for (const m of js.matchAll(/['"`](--[a-zA-Z0-9-]+)['"`]/g)) definidas.add(m[1]);
  // Las únicas sin definir, con una reserva que sirve en los dos temas (transparente o «inherit») o un color fijo a propósito.
  const conReservaBuena = new Set(['--fondo-suave', '--texto-suave', '--amarillo']);
  const faltan = [...new Set([...`${css}\n${js}`.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map(m => m[1]))].filter(v => !definidas.has(v) && !conReservaBuena.has(v));
  assert.deepEqual(faltan, []);
  assert.match(bloque(leer('academia.css'), '.opinion-voto'), /background: var\(--tarjeta\)/);
});

test('la hoja del reporte (blanca, de papel) usa los colores del tema claro también en el oscuro', () => {
  const css = leer('alumnos.css');
  const i = css.indexOf('.reporte-hoja {\n');
  assert.ok(i >= 0);
  const b = css.slice(i, css.indexOf('}', i));
  for (const v of ['--suave: #475569', '--texto: #0f172a', '--tarjeta: #ffffff', '--borde: #d9dfea', '--linea: #e1e6ef']) assert.ok(b.includes(v), v);
  assert.match(css, /:root\[data-tema="oscuro"\] :is\(\.ficha-nota\.tono-info, td\.tono-info\) \{ color: #9bd1ff; \}/);
});

test('el número de «Mensajes» en la PC no empuja el nombre (no lo parte en «Mensaje/s»)', () => {
  const css = leer('estilos.css');
  const ancho = css.slice(css.indexOf('@media (min-width: 760px) {\n  .grupos-admin'));
  const pendiente = ancho.slice(ancho.indexOf('.grupo-pendiente'), ancho.indexOf('}', ancho.indexOf('.grupo-pendiente')));
  assert.doesNotMatch(pendiente, /position:\s*static/);
});

test('la palanca de potencia deja media manija arriba y abajo: en 0 % no tapa el «0 %»', () => {
  const css = leer('juego.css');
  const caja = Number(bloque(css, '.juego-potencia').match(/height: (\d+)px/)[1]);
  const pista = Number(bloque(css, '.juego-potencia-pista').match(/height: (\d+)px/)[1]);
  const manija = Number(bloque(css, '.juego-potencia-manija').match(/[^-]height: (\d+)px/)[1]);
  assert.ok(caja - pista >= manija, `${caja} - ${pista} < ${manija}`);
});

test('el teléfono de lado: el juego pone los mandos a la derecha y la práctica achica sus barras', () => {
  const juego = leer('juego.css');
  const lado = juego.slice(juego.indexOf('@media (orientation: landscape) and (max-height: 500px)'));
  assert.ok(lado.length > 60, 'falta el juego de lado');
  assert.match(lado, /\.juego-vuelo \{ flex-direction: row; \}/);
  const academia = leer('academia.css');
  assert.match(academia, /@media \(orientation: landscape\) and \(max-height: 500px\) \{\n {2}\.estudio-arriba/);
});
