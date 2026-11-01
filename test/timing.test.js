import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeToProfit, humanDays } from '../src/stocks/timing.js';
import { syntheticBars } from '../src/stocks/market.js';

const line = (n, daily) => Array.from({ length: n }, (_, i) => ({ ts: new Date(Date.UTC(2021, 0, 1) + i * 864e5).toISOString().slice(0, 10), close: 100 * (1 + daily) ** i }));

test('subida constante: gana en todos los plazos y llegar a +5% tarda lo que dice la cuenta', () => {
  const t = timeToProfit(line(900, 0.001));
  assert.ok(t.horizons.every(h => h.pProfit === 1));
  // (1.001)^d - 1 - 0.002 >= 0.05  ->  d = 51 días
  assert.equal(t.toTarget.median, 51); assert.equal(t.toTarget.neverPct, 0);
  assert.equal(t.immediate, true);
});

test('precio plano: la ganancia nunca llega y lo dice', () => {
  const t = timeToProfit(line(900, 0));
  assert.ok(t.horizons.every(h => h.pProfit === 0));
  assert.equal(t.toTarget.median, null); assert.equal(t.toTarget.neverPct, 1);
  assert.equal(t.recommended, null); assert.match(t.summary, /NO es inmediata/);
});

test('acción real simulada: la chance de estar ganando crece con el tiempo', () => {
  const t = timeToProfit(syntheticBars(1300, { seed: 1, drift: 0.0008, vol: 0.015 }));
  const p = Object.fromEntries(t.horizons.map(h => [h.days, h.pProfit]));
  assert.ok(p[252] > p[5], `${p[252]} > ${p[5]}`);
  assert.ok(p[5] > 0.35 && p[5] < 0.75);
  assert.equal(humanDays(63), '3 meses'); assert.equal(humanDays(10), '2 semanas');
});
