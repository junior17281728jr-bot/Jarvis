// Escenas de Factores Humanos: la base común (tramos, pasos, azar con semilla, rótulos) y el registro, sin navegador.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { tramo, salida, pasoEn, cuantizar, aleatorio, anchoTexto, alfaRotulo, NOMBRES_ICONOS } from '../public/clase/fh-base.js';
import { VISUALES_FH, cargarEstilosFH } from '../public/clase/visuales-fh.js';
import { VISUALES } from '../public/clase/visuales.js';
import { leccionFH, lineaDeTiempo, enPantalla, CORTES, PORTADA_S, CIERRE_S } from '../public/clase/demo-fh.js';

test('tramo y salida van de 0 a 1 sin salirse', () => {
  assert.equal(tramo(0.1, 0.2, 0.4), 0);
  assert.ok(Math.abs(tramo(0.3, 0.2, 0.4) - 0.5) < 1e-9);
  assert.equal(tramo(0.9, 0.2, 0.4), 1);
  assert.equal(tramo(0.5, 0.5, 0.5), 1, 'tramo vacío: salta en a');
  for (let x = -0.5; x <= 1.5; x += 0.1) { const y = salida(x); assert.ok(y >= 0 && y <= 1); }
  assert.ok(salida(0.5) > 0.5, 'frena al final');
});

test('pasoEn y cuantizar (movimiento reducido) dan el paso correcto', () => {
  assert.equal(pasoEn([0.1, 0.4, 0.7], 0.05), -1);
  assert.equal(pasoEn([0.1, 0.4, 0.7], 0.4), 1);
  assert.equal(pasoEn([0.1, 0.4, 0.7], 1), 2);
  assert.equal(cuantizar(0.29, 0.2, 0.4), 0);
  assert.equal(cuantizar(0.31, 0.2, 0.4), 1);
});

test('el azar con semilla se repite (cuadros iguales al grabar) y queda en [0,1)', () => {
  const a = aleatorio(42), b = aleatorio(42), c = aleatorio(43);
  const sa = Array.from({ length: 20 }, a), sb = Array.from({ length: 20 }, b), sc = Array.from({ length: 20 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every(x => x >= 0 && x < 1));
});

test('los rótulos entran y salen a tiempo, y el ancho estimado crece con el texto', () => {
  const r = { desde: 0.2, hasta: 0.6 };
  assert.equal(alfaRotulo(r, 0.1), 0);
  assert.equal(alfaRotulo(r, 0.4), 1);
  assert.equal(alfaRotulo(r, 0.7), 0);
  assert.equal(alfaRotulo({ desde: 0.5 }, 1), 1, 'sin «hasta» se queda hasta el final');
  assert.ok(anchoTexto('Bastones · ven de noche', 26) > anchoTexto('Conos', 26));
  assert.ok(anchoTexto('Hola', 40) > anchoTexto('Hola', 20));
  assert.ok(NOMBRES_ICONOS.includes('reloj') && NOMBRES_ICONOS.includes('copa'));
});

test('el registro fh tiene las 13 escenas, no pisa los tipos de visuales.js y no toca el DOM al importar', () => {
  const tipos = Object.keys(VISUALES_FH);
  assert.equal(tipos.length, 13);
  assert.ok(tipos.every(t => t.startsWith('fh-') && typeof VISUALES_FH[t] === 'function'));
  assert.ok(tipos.every(t => !(t in VISUALES)));
  assert.doesNotThrow(() => cargarEstilosFH(), 'sin document no hace nada');
});

test('la lección de muestra sigue los cortes del audio y la película dura portada + audio + cierre', () => {
  const l = leccionFH();
  assert.equal(l.escenas.length, 14);
  const tramos = lineaDeTiempo(l);
  const total = tramos[tramos.length - 1].fin;
  assert.ok(Math.abs(total - (PORTADA_S + CORTES[CORTES.length - 1] + CIERRE_S)) < 0.05);
  CORTES.slice(0, -1).forEach((c, i) => assert.ok(Math.abs(tramos[i + 1].inicio - (PORTADA_S + c)) < 0.05, `escena ${i + 1}`));
  for (const e of l.escenas) assert.ok(VISUALES_FH[e.visual.tipo], e.visual.tipo);
  const p = enPantalla(tramos, PORTADA_S + 0.3);
  assert.equal(p.i, 1); assert.equal(p.anterior, 0, 'fundido con la portada');
  assert.equal(enPantalla(tramos, PORTADA_S + 10).anterior, -1);
  assert.equal(enPantalla(tramos, total + 5).i, 13);
});

test('archivos fh: sin innerHTML ni estilos incrustados ni direcciones externas, CSS con prefijo', () => {
  const carpeta = new URL('../public/clase/', import.meta.url);
  const nombres = readdirSync(carpeta).filter(n => /^(fh-|visuales-fh|demo-fh|clase-fh)/.test(n));
  assert.ok(nombres.length >= 17);
  for (const n of nombres) {
    const texto = readFileSync(new URL(n, carpeta), 'utf8');
    assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|setAttribute\(\s*['"]style['"]/, n);
    assert.doesNotMatch(texto.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ''), /https?:\/\//, n);
  }
  const css = readFileSync(new URL('clase-fh.css', carpeta), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /prefers-color-scheme: dark/);
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) assert.match(m[1], /^(clase-|demo-)/, m[1]);
  const html = readFileSync(new URL('demo-fh.html', carpeta), 'utf8');
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i);
});
