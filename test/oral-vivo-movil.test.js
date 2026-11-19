// Academia 0.14.48: la «Práctica en vivo» del oral en el teléfono (public/oral-vivo-vista.js).
//  - El dictado en limpio (crearDictado): el iPhone a veces termina una frase solo con el resultado provisional y el
//    dictado vuelve a empezar: ese pedazo ya no se pierde con la frase siguiente; sin espacios de más.
//  - Si un envío falla (sin red, «Demasiados intentos»), «Enviar», «No sé» y el micrófono vuelven a funcionar; si falla
//    «Terminar», hay «Volver a intentar»; los botones no usan e.currentTarget después de esperar al servidor.
//  - Lo que el navegador manda al parar el micrófono se escribe (si el cuadro sigue abierto); el iPhone dicta como Safari.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearDictado } from '../public/oral-vivo-vista.js';

// Un «onresult» como el del navegador: [[texto, final], ...] desde resultIndex.
const ev = (lista, resultIndex = 0) => ({ resultIndex, results: lista.map(([texto, final]) => Object.assign([{ transcript: texto }], { isFinal: final })) });

test('el dictado: provisional, final, y lo provisional que queda al terminar un tramo no se pierde (iPhone)', () => {
  const d = crearDictado('');
  assert.equal(d.resultado(ev([['el piloto', false]])), 'el piloto', 'sin espacio al principio');
  assert.equal(d.resultado(ev([['el piloto privado', true]])), 'el piloto privado');
  assert.equal(d.fin(), 'el piloto privado');
  // Tramo nuevo (Safari no continuo): solo provisional y se acaba.
  assert.equal(d.resultado(ev([['puede llevar amigos', false]])), 'el piloto privado puede llevar amigos');
  assert.equal(d.fin(), 'el piloto privado puede llevar amigos', 'al terminar, el texto a la vista no cambia');
  // Otro tramo: antes se perdía «puede llevar amigos».
  assert.equal(d.resultado(ev([['pero no cobrar', false]])), 'el piloto privado puede llevar amigos pero no cobrar');
  assert.equal(d.resultado(ev([['pero no cobrar.', true]])), 'el piloto privado puede llevar amigos pero no cobrar.');
  assert.equal(d.fin(), 'el piloto privado puede llevar amigos pero no cobrar.');
});

test('el dictado: sigue lo ya escrito, continuo (Chrome) con resultIndex, espacios y el máximo', () => {
  const d = crearDictado('  Lo escrito ');
  assert.equal(d.texto(), 'Lo escrito');
  const lista = [[' uno', true], [' dos', false]];
  assert.equal(d.resultado(ev(lista)), 'Lo escrito uno dos');
  lista[1] = [' dos tres', true];
  lista.push([' cuatro', false]);
  assert.equal(d.resultado(ev(lista, 1)), 'Lo escrito uno dos tres cuatro', 'los finales ya vistos no se repiten');
  assert.equal(d.resultado(ev(lista, 2)), 'Lo escrito uno dos tres cuatro');
  assert.equal(d.resultado({}), 'Lo escrito uno dos tres', 'un evento vacío borra solo lo provisional');
  assert.equal(crearDictado('x'.repeat(10), 12).resultado(ev([['abcdef', true]])), 'xxxxxxxxxx a');
});

test('la pantalla: tras un envío fallido todo vuelve a funcionar; «Terminar» se puede reintentar; sin e.currentTarget tras esperar', () => {
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.match(vista, /if \(!x\) \{ r\.activar\(\); return; \}/);
  assert.match(vista, /activar: \(\) => habilitar\(true\)/);
  assert.match(vista, /botonGrande\(t\('vivo\.reintentar'\), \(\) => terminar\(auto\)/);
  const usos = vista.split('\n').filter(l => l.includes('e.currentTarget') && !l.trim().startsWith('//'));
  assert.equal(usos.length, 3);
  for (const l of usos) assert.equal(l.trim(), 'const b = e.currentTarget;', 'e.currentTarget se guarda al principio (antes de esperar)');
  assert.ok(!/e\.currentTarget\.disabled = false/.test(vista));
  // Lo que llega al parar se escribe solo si el cuadro sigue abierto y no empezó otro dictado; el iPhone (aunque no diga
  // «Safari»: app de la pantalla de inicio, Chrome) dicta como Safari.
  assert.match(vista, /if \(escucha !== r\) \{ if \(!escucha && !caja\.disabled && caja\.isConnected\) caja\.value = dictado\.resultado\(ev\); return; \}/);
  assert.match(vista, /r\.continuous = !\(esSafari \|\| esIos\);/);
  for (const n of ['es', 'en']) assert.ok(JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'))['vivo.reintentar'], n);
  assert.ok(!/innerHTML|style=|\.style\./.test(vista));
});
