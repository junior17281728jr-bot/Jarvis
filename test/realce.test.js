// Academia 0.9.1: la tarjeta de la lección más visual (public/clase/realce.js). Lo que se puede probar sin navegador:
// de qué habla cada punto (su ícono), la palabra en español de una ficha de inglés y la abreviatura (solo si viene).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temaDePunto, terminoEspanol, abreviaturaDe } from '../public/clase/realce.js';

test('cada punto lleva el ícono de lo que habla (y el punto de ruta si no se reconoce)', () => {
  assert.equal(temaDePunto('La retina es la película de la cámara y tiene conos (cones) y bastones (rods).'), 'ojo');
  assert.equal(temaDePunto('Evita luces brillantes 30 minutos antes de volar.'), 'alerta');
  assert.equal(temaDePunto('La hipoxia aparece por falta de oxígeno.'), 'aire');
  assert.equal(temaDePunto('Con el ruido del motor, usa protección en los oídos.'), 'oido');
  assert.equal(temaDePunto('Roja fija + roja intermitente: el avión cruza hacia tu izquierda.'), 'avion');
  assert.equal(temaDePunto('Pupila = apertura, cristalino = lente.'), 'ojo');
  assert.equal(temaDePunto('Verde fija + roja intermitente: pasa de izquierda a derecha.'), null);
  assert.equal(temaDePunto(''), null);
});

test('la ficha de inglés: la palabra en español sale del significado y la abreviatura solo si el paquete la trae', () => {
  assert.equal(terminoEspanol('Córnea: por donde entra la luz'), 'Córnea');
  assert.equal(terminoEspanol('Bastones: células de la retina para visión nocturna y periférica.'), 'Bastones');
  assert.equal(terminoEspanol('Una frase larga sin dos puntos.'), null);
  assert.equal(terminoEspanol('Esto es una explicación demasiado larga para ser una palabra: no'), null);
  assert.equal(terminoEspanol(null), null);
  assert.equal(abreviaturaDe({ palabra: 'Very High Frequency (VHF)', significado: 'Muy alta frecuencia' }), 'VHF');
  assert.equal(abreviaturaDe({ palabra: 'Carbon monoxide', significado: 'Monóxido de carbono (CO): gas sin olor' }), 'CO');
  assert.equal(abreviaturaDe({ palabra: 'Retina', significado: 'Retina: la película del ojo' }), null);
});
