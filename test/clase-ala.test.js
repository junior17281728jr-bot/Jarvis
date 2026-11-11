// Clases visuales: la lógica del ala (ángulo crítico, pérdida, flujo) sin navegador.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoAla, coeficientes, lineasDeCorriente, ANGULO_CRITICO } from '../public/clase/ala.js';

test('la sustentación crece con el ángulo hasta el crítico y cae después', () => {
  let anterior = -Infinity;
  for (let a = -2; a <= ANGULO_CRITICO; a += 1) {
    const { cl } = coeficientes(a);
    assert.ok(cl > anterior, `a ${a}° la sustentación debe crecer`);
    anterior = cl;
  }
  const max = coeficientes(ANGULO_CRITICO).cl;
  assert.ok(coeficientes(ANGULO_CRITICO + 2).cl < max);
  assert.ok(coeficientes(ANGULO_CRITICO + 6).cl < coeficientes(ANGULO_CRITICO + 2).cl);
  assert.ok(coeficientes(ANGULO_CRITICO + 4).cd > coeficientes(ANGULO_CRITICO).cd, 'en pérdida la resistencia sube');
});

test('la pérdida empieza justo pasado el ángulo crítico (que es un parámetro)', () => {
  assert.equal(estadoAla(ANGULO_CRITICO).perdida, false);
  assert.equal(estadoAla(ANGULO_CRITICO + 0.1).perdida, true);
  assert.equal(estadoAla(12, { angulo_critico: 12 }).perdida, false);
  assert.equal(estadoAla(12.5, { angulo_critico: 12 }).perdida, true);
  assert.equal(estadoAla(18, { angulo_critico: 20 }).estado, 'cerca');
  assert.equal(estadoAla(5).estado, 'normal');
  assert.equal(estadoAla(20).estado, 'perdida');
  assert.equal(estadoAla(20).separacion > estadoAla(17).separacion, true, 'más ángulo, más ala con el aire separado');
  assert.equal(estadoAla(10).separacion, 0);
});

test('las líneas de corriente rodean el perfil: unas por arriba, otras por abajo, y viento horizontal lejos', () => {
  const { lineas, perfil, ba, bs } = lineasDeCorriente(8);
  assert.ok(lineas.some(l => l.arriba) && lineas.some(l => !l.arriba));
  assert.ok(ba[1] > bs[1], 'con ángulo positivo el borde de ataque queda más alto (morro arriba)');
  assert.ok(perfil.length > 50);
  for (const l of lineas) {
    const [x0, y0] = l.puntos[0], [x1, y1] = l.puntos[1];
    assert.ok(x1 > x0, 'el aire va de izquierda a derecha');
    assert.ok(Math.abs(y1 - y0) < Math.abs(x1 - x0) * 0.2, 'lejos del ala el viento es casi horizontal');
  }
});
