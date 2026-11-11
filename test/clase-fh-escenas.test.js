// Escenas de Factores Humanos: la lógica pura de cada escena (sin navegador).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicionAve } from '../public/clase/fh-aguila.js';
import { anguloDomino, contador } from '../public/clase/fh-cadena.js';
import { celulaRetina, miradaSectores } from '../public/clase/fh-ojo.js';
import { derivaLuz } from '../public/clase/fh-ilusiones.js';
import { giroCanal } from '../public/clase/fh-oido.js';
import { presionRelativa, barraConciencia, CONCIENCIA } from '../public/clase/fh-hipoxia.js';
import { recorridoCO } from '../public/clase/fh-monoxido.js';
import { faseRespiracion, nivelCO2 } from '../public/clase/fh-respirar.js';
import { giroTarjeta, TEXTOS_IMSAFE } from '../public/clase/fh-imsafe.js';
import { ruta, xAvion, PUNTOS_X, TEXTOS_DECIDE } from '../public/clase/fh-decide.js';
import { estadoActitud, TEXTOS_ACTITUDES, PASOS_ACTITUDES } from '../public/clase/fh-actitudes.js';
import { eslabon } from '../public/clase/fh-romper.js';
import { brilloPortada } from '../public/clase/fh-portada.js';

test('águila: avanza a la derecha con un vaivén acotado', () => {
  assert.ok(posicionAve(1).x > posicionAve(0).x);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(Math.abs(posicionAve(t).inclinacion) <= 12);
});

test('dominó: caen en orden, se apoyan en la siguiente y la última queda acostada', () => {
  const n = 8, t = 0.9;
  const angs = Array.from({ length: n }, (_, k) => anguloDomino(k, n, t, 0.5, 0.05, { separacion: 72, alto: 150 }));
  for (let k = 1; k < n; k++) assert.ok(angs[k] <= angs[k - 1] + 1e-9 || k === n - 1);
  assert.equal(anguloDomino(0, n, 0.4, 0.5, 0.05), 0, 'antes de empezar están de pie');
  assert.ok(Math.abs(anguloDomino(0, n, 1, 0.5, 0.05, { separacion: 72, alto: 150 }) - 28.68) < 0.1);
  assert.equal(anguloDomino(n - 1, n, 2, 0.5, 0.05), 90);
  assert.equal(contador(0, 0.1, 0.3, 75), 0);
  assert.equal(contador(1, 0.1, 0.3, 75), 75);
});

test('retina: solo conos en el centro, casi todo bastones en el borde; el barrido recorre los 6 sectores', () => {
  for (let k = 0; k < 20; k++) assert.equal(celulaRetina(0.5 + (k - 10) * 0.005, k / 20), 'cono');
  assert.equal(celulaRetina(0, 0.5), 'baston');
  assert.equal(miradaSectores(0).sector, 0);
  assert.equal(miradaSectores(0.99).sector, 5);
  let antes = -1;
  for (let f = 0; f <= 1; f += 0.01) { const x = miradaSectores(f).x; assert.ok(x >= antes - 1e-9); antes = x; }
});

test('autocinesis: la luz deriva pero no se va lejos', () => {
  for (let s = 0; s < 60; s += 0.5) { const d = derivaLuz(s, 40); assert.ok(Math.abs(d.x) <= 50 && Math.abs(d.y) <= 40); }
  const quieta = derivaLuz(3, 0);
  assert.ok(Math.abs(quieta.x) < 1e-12 && Math.abs(quieta.y) < 1e-12);
});

test('oído interno: al empezar el giro la cúpula se dobla y en el giro sostenido vuelve (no se siente)', () => {
  assert.deepEqual(giroCanal(5, 10), { cabeza: 0, liquido: 0, desvio: 0 });
  const recien = giroCanal(10.2, 10), luego = giroCanal(20, 10);
  assert.ok(recien.desvio > 0.9);
  assert.ok(luego.desvio < 0.05);
  assert.ok(luego.liquido < luego.cabeza, 'el líquido va atrasado');
  assert.ok(luego.cabeza - luego.liquido < 40 * 2.4 + 1e-6, 'el atraso se estabiliza');
});

test('hipoxia: la presión baja con la altura (la mitad cerca de 18 000 ft) y la conciencia útil se acorta', () => {
  assert.equal(presionRelativa(0), 1);
  assert.ok(Math.abs(presionRelativa(18000) - 0.5) < 0.02);
  assert.ok(presionRelativa(25000) < presionRelativa(10000));
  const barras = CONCIENCIA.map(([, , s]) => barraConciencia(s));
  for (let k = 1; k < barras.length; k++) assert.ok(barras[k] < barras[k - 1]);
  assert.ok(barras.every(b => b > 0 && b <= 1));
});

test('monóxido: las partículas salen de la fisura y terminan en la cabina', () => {
  const ini = recorridoCO(0, 0.5), fin = recorridoCO(0.99, 0.5);
  assert.ok(ini.x < 330 && fin.x > 340, 'pasa el cortafuegos');
  assert.ok(fin.y < ini.y, 'sube a la cabina');
});

test('respiración: la fase siempre avanza, más lento después de calmarse; el CO₂ baja y vuelve', () => {
  let antes = -1;
  for (let s = 0; s < 40; s += 0.1) { const f = faseRespiracion(s, 20); assert.ok(f > antes || s === 0); antes = f; }
  const rapida = faseRespiracion(10, 20) - faseRespiracion(9, 20), lenta = faseRespiracion(35, 20) - faseRespiracion(34, 20);
  assert.ok(rapida > lenta * 3);
  const normal = nivelCO2(0, 0.42, 0.63), bajo = nivelCO2(0.6, 0.42, 0.63), fin = nivelCO2(1, 0.42, 0.63);
  assert.ok(normal > 0.45 && bajo < 0.45 && fin > 0.45);
});

test('IMSAFE: seis tarjetas que giran en orden y muestran la espalda al pasar la mitad', () => {
  assert.equal(TEXTOS_IMSAFE.tarjetas.map(t => t.letra).join(''), 'IMSAFE');
  assert.equal(giroTarjeta(0.1, 0, 0.3).espalda, false);
  assert.equal(giroTarjeta(0.9, 5, 0.3).espalda, true);
  assert.ok(giroTarjeta(0.3 + 0.025, 0, 0.3).escala < 0.05, 'de canto a mitad del giro');
  assert.ok(giroTarjeta(0.5, 5, 0.3).f < giroTarjeta(0.5, 0, 0.3).f, 'la primera gira antes');
});

test('DECIDE: seis pasos, la ruta sube y la avioneta pasa por cada punto en orden', () => {
  assert.equal(TEXTOS_DECIDE.pasosDecide.map(p => p.letra).join(''), 'DECIDE');
  assert.ok(ruta(1140).y < ruta(190).y);
  let antes = -Infinity;
  for (let t = 0.3; t <= 1; t += 0.01) { const x = xAvion(t, 0.43, 0.085); assert.ok(x >= antes - 1e-9); antes = x; }
  PUNTOS_X.forEach((px, k) => assert.ok(Math.abs(xAvion(0.43 + k * 0.085 + 1e-9, 0.43, 0.085) - px) < 0.01, `punto ${k}`));
});

test('actitudes: cinco con su antídoto; cada tarjeta aparece antes de girar', () => {
  assert.equal(TEXTOS_ACTITUDES.actitudes.length, 5);
  assert.ok(TEXTOS_ACTITUDES.actitudes.every(a => a.nombre && a.piensa.length && a.antidoto.length));
  PASOS_ACTITUDES.aparecen.forEach((a, k) => assert.ok(a < PASOS_ACTITUDES.antidotos[k]));
  assert.equal(estadoActitud(0.3, 0.1, 0.5).antidoto, false);
  assert.equal(estadoActitud(0.6, 0.1, 0.5).antidoto, true);
});

test('cadena: al cortar, el eslabón cortado y los de la derecha se caen; los de la izquierda quedan', () => {
  assert.equal(eslabon(0, 1).alfa, 1);
  assert.equal(eslabon(3, 1).alfa, 0);
  assert.equal(eslabon(5, 1).alfa, 0);
  assert.ok(eslabon(5, 1).y > eslabon(5, 0).y);
});

test('portada: sube desde negro; el cierre termina en negro', () => {
  assert.equal(brilloPortada(0, 'portada', 4), 0);
  assert.equal(brilloPortada(0.5, 'portada', 4), 1);
  assert.equal(brilloPortada(0.5, 'cierre', 6), 1);
  assert.equal(brilloPortada(1, 'cierre', 6), 0);
});
