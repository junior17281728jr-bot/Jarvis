// Clases visuales: la secuencia del motor de cuatro tiempos.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoMotor, TIEMPOS, siguienteTiempo, posicionPiston } from '../public/clase/motor.js';

test('un ciclo son dos vueltas: admisión, compresión, explosión y escape, en ese orden', () => {
  assert.deepEqual(TIEMPOS, ['admision', 'compresion', 'explosion', 'escape']);
  assert.equal(estadoMotor(90).tiempo, 'admision');
  assert.equal(estadoMotor(270).tiempo, 'compresion');
  assert.equal(estadoMotor(450).tiempo, 'explosion');
  assert.equal(estadoMotor(630).tiempo, 'escape');
  assert.equal(estadoMotor(720 + 90).tiempo, 'admision', 'después de 720° vuelve a empezar');
  assert.equal(estadoMotor(-90).tiempo, 'escape');
});

test('las válvulas: admisión abierta solo en admisión, escape solo en escape; en compresión y explosión, las dos cerradas', () => {
  for (let th = 0; th < 720; th += 5) {
    const e = estadoMotor(th);
    if (e.tiempo === 'compresion' || e.tiempo === 'explosion') {
      assert.equal(e.valvulaAdmision, 0, `${th}°`); assert.equal(e.valvulaEscape, 0, `${th}°`);
    }
    if (e.tiempo !== 'admision') assert.equal(e.valvulaAdmision, 0, `${th}°`);
    if (e.tiempo !== 'escape') assert.equal(e.valvulaEscape, 0, `${th}°`);
  }
  assert.ok(estadoMotor(90).valvulaAdmision > 0.9);
  assert.ok(estadoMotor(630).valvulaEscape > 0.9);
});

test('la chispa salta al final de la compresión, con el pistón arriba, y solo una vez por ciclo', () => {
  const conChispa = [];
  for (let th = 0; th < 720; th += 1) if (estadoMotor(th).chispa) conChispa.push(th);
  assert.ok(conChispa.length > 0);
  assert.ok(conChispa.every(th => th > 340 && th < 380));
  assert.ok(estadoMotor(360).bajada < 0.01, 'en 360° el pistón está arriba');
});

test('el pistón: arriba en 0° y 360°, abajo en 180° y 540°; baja en admisión y explosión', () => {
  assert.ok(Math.abs(estadoMotor(0).bajada) < 1e-9);
  assert.ok(Math.abs(estadoMotor(180).bajada - 1) < 1e-9);
  assert.ok(Math.abs(estadoMotor(540).bajada - 1) < 1e-9);
  assert.ok(posicionPiston(0) > posicionPiston(90) && posicionPiston(90) > posicionPiston(180));
  assert.equal(estadoMotor(100).pistonBaja, true);
  assert.equal(estadoMotor(280).pistonBaja, false);
  assert.equal(estadoMotor(400).pistonBaja, true);
  assert.equal(estadoMotor(600).pistonBaja, false);
});

test('«Siguiente tiempo» lleva al comienzo del tiempo que sigue', () => {
  assert.equal(siguienteTiempo(10), 180);
  assert.equal(siguienteTiempo(200), 360);
  assert.equal(siguienteTiempo(700), 720);
  assert.equal(estadoMotor(siguienteTiempo(200) + 1).tiempo, 'explosion');
});
