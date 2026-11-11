// Clases visuales: de los datos de vuelo a las agujas de los seis instrumentos.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agujaAnemometro, agujasAltimetro, agujaVariometro, tasaDeGiro, inclinacionCoordinador, MARCA_ESTANDAR,
  horizonte, tarjetaRumbo, pasoSimulacion, aplicarFalla, INSTRUMENTOS, LECTURAS_DE, LECTURAS_INICIALES } from '../public/clase/instrumentos.js';

const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('anemómetro: más velocidad, más giro; tope en la escala', () => {
  assert.equal(agujaAnemometro(0), 0);
  assert.ok(agujaAnemometro(60) < agujaAnemometro(100));
  assert.equal(agujaAnemometro(200), 340);
  assert.equal(agujaAnemometro(500), 340);
});

test('altímetro: 3 450 ft = aguja larga en 4,5, corta pasando el 3', () => {
  const a = agujasAltimetro(3450);
  assert.ok(cerca(a.cien, 162)); // 450/1000 de vuelta
  assert.ok(cerca(a.mil, 124.2)); // 3450/10000 de vuelta
  assert.ok(cerca(agujasAltimetro(1000).cien, 0));
  assert.ok(cerca(agujasAltimetro(1000).mil, 36));
  assert.ok(cerca(agujasAltimetro(-50).cien, 0), 'bajo cero queda en 0');
});

test('variómetro: 0 a las nueve, sube hacia arriba, baja hacia abajo, con tope', () => {
  assert.equal(agujaVariometro(0), -90);
  assert.ok(agujaVariometro(500) > -90 && agujaVariometro(-500) < -90);
  assert.equal(agujaVariometro(5000), agujaVariometro(2000));
});

test('tasa de giro y coordinador: alas niveladas = 0; alabeo de giro estándar ≈ 3°/s llega a la marca', () => {
  assert.equal(tasaDeGiro(0, 100), 0);
  const t = tasaDeGiro(15, 90);
  assert.ok(t > 3 && t < 3.3, `tasa ${t}`);
  assert.ok(tasaDeGiro(-15, 90) < 0);
  assert.ok(tasaDeGiro(20, 80) > tasaDeGiro(20, 120), 'a menos velocidad, el mismo alabeo gira más rápido');
  assert.equal(inclinacionCoordinador(3), MARCA_ESTANDAR);
  assert.equal(inclinacionCoordinador(-3), -MARCA_ESTANDAR);
  assert.equal(inclinacionCoordinador(30), 40);
});

test('horizonte: nariz arriba baja el horizonte; alabeo a la derecha lo gira al revés; rumbo gira la tarjeta', () => {
  assert.ok(horizonte(10, 0).desplazamiento > 0);
  assert.equal(horizonte(0, 20).rotacion, -20);
  assert.equal(tarjetaRumbo(90), -90);
  assert.equal(tarjetaRumbo(450), -90);
});

test('simulación de viraje en ascenso: el rumbo aumenta y la altitud sube', () => {
  let e = { ...LECTURAS_INICIALES, rumbo: 350 };
  for (let i = 0; i < 300; i++) e = pasoSimulacion(e, { velocidad: 80, alabeo: 15, cabeceo: 6, vs: 500 }, 0.1);
  assert.ok(e.altitud > LECTURAS_INICIALES.altitud + 150, `altitud ${e.altitud}`);
  assert.ok(e.rumbo > 0 && e.rumbo < 360);
  assert.ok(Math.abs(e.alabeo - 15) < 0.5);
  assert.ok(e.rumbo > 40 && e.rumbo < 120, `rumbo ${e.rumbo} (pasó por el norte y siguió a la derecha)`);
});

test('falla: el instrumento que falla queda congelado y los demás siguen', () => {
  const congeladas = { ...LECTURAS_INICIALES };
  const vivas = { ...LECTURAS_INICIALES, altitud: 4000, vs: 800, velocidad: 70 };
  const r = aplicarFalla(vivas, congeladas, 'altimetro');
  assert.equal(r.altitud, 3000);
  assert.equal(r.vs, 800);
  assert.equal(r.velocidad, 70);
  assert.deepEqual(aplicarFalla(vivas, congeladas, null), vivas);
  for (const n of INSTRUMENTOS) assert.ok(LECTURAS_DE[n]?.length, n);
});
