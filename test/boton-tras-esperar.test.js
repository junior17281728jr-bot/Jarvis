// Después de un «await», evento.currentTarget ya es null: un botón que se apaga mientras espera
// tiene que guardarse antes (el plan de vuelo se quedaba con «Continuar» apagado, 0.8.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ningún botón vuelve a encenderse con evento.currentTarget después de esperar', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal(/evento\.currentTarget\.disabled\s*=\s*false/.test(app), false);
  // Los manejadores async no leen evento.currentTarget después de su primer await.
  for (const m of app.matchAll(/async evento => \{([\s\S]*?)\n\s*\}/g)) {
    const cuerpo = m[1];
    const i = cuerpo.indexOf('await ');
    if (i >= 0) assert.equal(cuerpo.slice(i).includes('evento.currentTarget'), false, cuerpo.slice(0, 160));
  }
});
