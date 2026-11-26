// 0.14.115: el mundo de las escenas 3D más real: los números de la pista (AIM 2-3-3), las luces blancas de los bordes al
// atardecer (AIM 2-1-4, solo si se piden: el juego pone las suyas), el agua que refleja el cielo y el terreno con el color
// de cada esquina (con WebGL se funde, sin cuadros). Y el mini-mapa de una consecuencia: las etiquetas lo esquivan.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { numeroPista, bloquesNumero, aeropuerto, campo, PALETAS } from '../public/clase/e3d-base.js';
import { terreno } from '../public/clase/motor3d.js';

test('los números de la pista: el rumbo redondeado a la decena sin el último cero; 36 y no 0', () => {
  assert.equal(numeroPista(0), '36'); assert.equal(numeroPista(360), '36'); assert.equal(numeroPista(180), '18');
  assert.equal(numeroPista(87), '09'); assert.equal(numeroPista(274), '27'); assert.equal(numeroPista(-90), '27'); assert.equal(numeroPista(4), '36');
  // Los bloques: dos dígitos de 3×5 con una columna de aire; nada fuera de la grilla.
  const { bloques, columnas } = bloquesNumero('36');
  assert.equal(columnas, 7);
  assert.ok(bloques.length > 6 && bloques.every(b => b.c0 >= 0 && b.c1 <= 7 && b.c1 > b.c0 && b.f0 >= 0 && b.f1 <= 5 && b.f1 === b.f0 + 1));
  assert.ok(bloques.every(b => !(b.c0 < 4 && b.c1 > 3)), 'el aire entre los dígitos');
  // El 1 es angosto; el 8 llena más que el 1.
  assert.ok(bloquesNumero('8').bloques.reduce((s, b) => s + b.c1 - b.c0, 0) > bloquesNumero('1').bloques.reduce((s, b) => s + b.c1 - b.c0, 0));
});

test('el aeropuerto: el número de cada cabecera derecho para quien llega; luces de borde solo al atardecer y si se piden', () => {
  const pal = PALETAS.claro;
  const conDetalle = aeropuerto({ x: 0, z: 0, rumbo: 0, largo: 5, ancho: 0.2, paleta: pal });
  const sinNumero = aeropuerto({ x: 0, z: 0, rumbo: 0, largo: 5, ancho: 0.2, paleta: pal, detalle: false });
  const marcas = conDetalle.filter(q => q.t === 'p' && q.c === pal.marca);
  // Los números quedan entre las rayas del umbral y el eje, en las dos cabeceras, dentro de la pista.
  const cerca = (z0, z1) => marcas.filter(q => q.p.every(v => v[2] > z0 && v[2] < z1));
  assert.ok(cerca(-2.5 + 5 * 0.05, -2.5 + 5 * 0.09).length >= 8, 'el 36 en la cabecera sur');
  assert.ok(cerca(2.5 - 5 * 0.09, 2.5 - 5 * 0.05).length >= 8, 'el 18 en la cabecera norte');
  assert.ok(marcas.every(q => q.p.every(v => Math.abs(v[0]) <= 0.1 + 1e-9)), 'dentro del ancho');
  assert.ok(marcas.every(q => q.capa === 'calco'));
  assert.equal(sinNumero.filter(q => q.t === 'p' && q.c === pal.marca).length, 0);
  // Luces: blancas (AIM 2-1-4) a los dos lados, solo con la paleta oscura y lucesPista.
  assert.equal(aeropuerto({ x: 0, z: 0, largo: 5, ancho: 0.2, paleta: PALETAS.oscuro }).filter(q => q.t === 's').length, 0, 'el juego pone las suyas');
  assert.equal(aeropuerto({ x: 0, z: 0, largo: 5, ancho: 0.2, paleta: pal, lucesPista: true }).filter(q => q.t === 's').length, 0, 'de día no');
  const luces = aeropuerto({ x: 0, z: 0, largo: 5, ancho: 0.2, paleta: PALETAS.oscuro, lucesPista: true }).filter(q => q.t === 's');
  assert.ok(luces.length >= 14 && luces.every(q => q.tex === 'brillo' && q.c[0] > 240 && q.c[1] > 230 && Math.abs(Math.abs(q.p[0]) - 0.108) < 1e-6));
  // Un aeropuerto con rumbo 90: el 09 al oeste, el 27 al este (los bloques siguen el rumbo).
  const este = aeropuerto({ x: 0, z: 0, rumbo: 90, largo: 5, ancho: 0.2, paleta: pal }).filter(q => q.t === 'p' && q.c === pal.marca);
  assert.ok(este.every(q => q.p.every(v => Math.abs(v[2]) <= 0.1 + 1e-9)));
});

test('el agua refleja el cielo y el terreno lleva el color de cada esquina', () => {
  const pal = PALETAS.claro;
  const prims = campo({ x0: -10, z0: -10, x1: 10, z1: 10, n: 8, altura: () => 0, paleta: pal, agua: x => x < -4, falda: 50 });
  const agua = prims.filter(q => q.c === pal.agua);
  assert.ok(agua.length > 0 && agua.every(q => q.refleja > 0.3 && q.brillo > 0.5 && !q.terreno));
  assert.ok(prims.filter(q => q.c !== pal.agua).every(q => !q.refleja && q.terreno));
  const t = terreno({ x0: 0, z0: 0, x1: 4, z1: 4, n: 2, color: x => [x * 10, 0, 0] });
  assert.equal(t.length, 4);
  for (const q of t) { assert.equal(q.cs.length, 4); q.cs.forEach((c, k) => assert.equal(c[0], q.p[k][0] * 10)); }
});

test('la consecuencia: la etiqueta de arriba no va debajo del mini-mapa y las etiquetas del lienzo lo esquivan', () => {
  const css = readFileSync(new URL('../public/clase/clase.css', import.meta.url), 'utf8');
  assert.match(css, /\.clase-e3d-caja:has\(> \.clase-sit-mapa\) \.clase-e3d-estado \{ max-width: calc\(100% - 60px - min\(27\.5%, 180px\)\); \}/);
  assert.match(css, /\.clase-e3d-sit \{ padding: 0 0 3px;/);
  const js = readFileSync(new URL('../public/clase/escena3d.js', import.meta.url), 'utf8');
  assert.match(js, /\[chip, ayuda, caja\.querySelector\?\.\('\.clase-sit-mapa'\)\]/);
});
