// 0.14.43: «¿Por qué?» solo de una pregunta ya calificada (nunca antes, ni con la repregunta pendiente).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porqueDe } from '../src/academia/oral-vivo.js';

test('«¿Por qué?»: nada antes de calificar ni con la repregunta pendiente; después, lo que dijo bien, lo que faltó', () => {
  assert.equal(porqueDe(null, null, undefined), null);
  assert.equal(porqueDe(null, null, { primera: { texto: 'x' } }), null, 'sin veredicto todavía');
  assert.equal(porqueDe(null, null, { primera: { veredicto: 'casi', repregunta: '¿y cuánto?' } }), null, 'le toca la repregunta');
  const r = porqueDe(null, null, { primera: { veredicto: 'mal', bienDicho: '', falto: 'el tiempo de vuelo' } });
  assert.deepEqual([r.veredicto, r.falto, r.respuesta_es], ['mal', 'el tiempo de vuelo', null]);
  const s = porqueDe(null, null, { primera: { veredicto: 'casi', repregunta: '¿y?' }, seguimiento: { veredicto: 'bien', bienDicho: 'todo' } });
  assert.deepEqual([s.veredicto, s.bienDicho], ['bien', 'todo']);
});
