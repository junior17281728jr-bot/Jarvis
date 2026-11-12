// Academia 0.9.1: la explicación después de responder (public/respuesta-vista.js). La sencilla se parte en filas con
// su rótulo e ícono, pero el texto no cambia: las filas juntas dicen exactamente lo mismo.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filasSencilla } from '../public/respuesta-vista.js';

const junto = filas => filas.map(f => [f.rotulo, f.resto].filter(Boolean).join(' ')).join(' ');
const sinEspacios = texto => texto.replace(/\s+/g, ' ').trim();

test('las líneas con rótulo («✔», «Por qué:», «Piensa así:», «Truco para recordar:») son filas con su ícono', () => {
  const texto = '✔ La correcta es la C: evitar luces blancas.\nPor qué: los bastones tardan 30 minutos.\nPiensa así: la luz blanca borra la adaptación.\nTruco para recordar: 30 minutos a oscuras.';
  const filas = filasSencilla(texto);
  assert.deepEqual(filas.map(f => f.tipo), ['correcta', 'porque', 'piensa', 'truco']);
  assert.deepEqual(filas.map(f => f.rotulo), ['✔', 'Por qué:', 'Piensa así:', 'Truco para recordar:']);
  assert.equal(filas[1].resto, 'los bastones tardan 30 minutos.');
  assert.equal(sinEspacios(junto(filas)), sinEspacios(texto));
});

test('un párrafo largo se parte en sus rótulos, sin perder ni cambiar una palabra', () => {
  const texto = 'Pregunta: de noche ves una luz roja fija. ¿Hacia dónde va? La respuesta correcta es A: cruza hacia la izquierda. Para aprender: roja = ala izquierda.';
  const filas = filasSencilla(texto);
  assert.deepEqual(filas.map(f => f.tipo), ['pregunta', 'correcta', 'truco']);
  assert.equal(sinEspacios(junto(filas)), sinEspacios(texto));
  // Un texto sin rótulos queda como una sola fila de texto, tal cual.
  assert.deepEqual(filasSencilla('Solo una frase. Y otra.'), [{ tipo: 'texto', icono: null, rotulo: '', resto: 'Solo una frase. Y otra.' }]);
  assert.deepEqual(filasSencilla(''), []);
  assert.deepEqual(filasSencilla(null), []);
});
