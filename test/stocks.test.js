import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { verifyLedger } from '../src/core/ledger.js';
import { syntheticBars, qualityCheck, marketOpen, saveBars, getBars, quoteStatus } from '../src/stocks/market.js';
import { ensureAccount, placeOrder, valuation, PERSONAL_LIMITS } from '../src/stocks/account.js';
import { runStrategy, metrics } from '../src/stocks/backtest.js';
import { FAMILIES } from '../src/stocks/strategies.js';
import { scoreSymbol, project, adviseAmount } from '../src/stocks/advice.js';

const q = (price, at = '2026-10-28T15:00:00Z') => ({ symbol: 'MSFT', price, as_of: at, source: 'prueba', kind: 'en_vivo' });

test('calidad de datos y horario de mercado', () => {
  const bars = syntheticBars(50);
  assert.equal(qualityCheck(bars).ok, true);
  const bad = [...bars.slice(0, 3), { ...bars[3], high: 1, low: 2 }, bars[2]];
  assert.ok(qualityCheck(bad).problems.length >= 2);
  assert.equal(marketOpen(new Date('2026-10-28T15:00:00Z')), true); // 11:00 a.m. NY, miércoles
  assert.equal(marketOpen(new Date('2026-10-31T15:00:00Z')), false); // sábado
  assert.equal(marketOpen(new Date('2026-11-26T15:00:00Z')), false); // Acción de Gracias
  assert.equal(quoteStatus(q(10, '2026-10-28T14:00:00Z'), new Date('2026-10-28T15:00:00Z')).usable, false);
});

test('las decisiones no ven el futuro', () => {
  const db = openDb(':memory:');
  saveBars(db, 'X', { source: 'prueba', bars: syntheticBars(30) });
  const until = getBars(db, 'X')[20].ts;
  assert.equal(getBars(db, 'X', { before: until }).length, 20);
});

test('cuenta de US$100: sin monto fijo, pero con frenos (máx. 40% en una empresa), costes y límites', () => {
  const db = openDb(':memory:');
  const acc = ensureAccount(db, { owner: 'user:1', userId: 1, startCash: 100 });
  const now = new Date('2026-10-28T15:01:00Z');
  const fresh = { usable: true };
  assert.equal(placeOrder(db, { accountId: acc.id, symbol: 'MSFT', side: 'buy', usd: 45, quote: q(500), now, quoteUsable: fresh }).ok, false, 'más del 40% en una sola empresa');
  assert.equal(placeOrder(db, { accountId: acc.id, symbol: 'MSFT', side: 'buy', usd: 0.5, quote: q(500), now, quoteUsable: fresh }).ok, false, 'menos de US$1');
  assert.match(placeOrder(db, { accountId: acc.id, symbol: 'MSFT', side: 'buy', usd: 10, quote: q(500), now, quoteUsable: { usable: false, label: 'desactualizado' } }).reason, /no es actual/);
  const b = placeOrder(db, { accountId: acc.id, symbol: 'MSFT', side: 'buy', usd: 10, quote: q(500), now, quoteUsable: fresh });
  assert.equal(b.ok, true);
  assert.ok(b.execPrice > 500); // paga diferencial y deslizamiento
  const s = placeOrder(db, { accountId: acc.id, symbol: 'MSFT', side: 'sell', qty: b.qty, quote: q(550), now, quoteUsable: fresh });
  assert.equal(s.ok, true);
  const v = valuation(db, acc.id, () => null);
  assert.equal(v.closed.length, 1);
  assert.ok(v.realized > 0.9 && v.realized < 1);
  assert.equal(v.positions.length, 0);
  assert.equal(verifyLedger(db).ok, true);
  assert.equal(PERSONAL_LIMITS.maxPerSymbolPct, 40); assert.ok(PERSONAL_LIMITS.maxTradeUsd > 1e6, 'sin monto fijo');
});

test('prueba histórica: ejecuta al día siguiente e incluye costes', () => {
  const bars = syntheticBars(600, { seed: 4 });
  const bh = runStrategy(bars, 'comprar_y_mantener', {});
  const mbh = metrics(bh);
  assert.ok(Math.abs(mbh.totalReturn - (bars.at(-1).close / (bars[1].open * 1.0008) - 1)) < 0.01);
  for (const [fam, f] of Object.entries(FAMILIES)) for (const p of f.grid) {
    const m = metrics(runStrategy(bars, fam, p), bh.daily);
    assert.ok(Number.isFinite(m.totalReturn), fam);
    assert.ok(m.maxDrawdown <= 0);
  }
});

test('ranking con razones, proyección y consejo de monto', () => {
  const bars = syntheticBars(400, { seed: 2, drift: 0.001 }), bench = syntheticBars(400, { seed: 3 });
  const s = scoreSymbol({ symbol: 'ABC', bars, bench, track: { wins: 10, losses: 4, net: 0.06 }, facts: [
    { metric: 'ingresos', period: 'FY2025', value: 120 }, { metric: 'ingresos', period: 'FY2024', value: 100 }, { metric: 'ganancia_neta', period: 'FY2025', value: 20 }] });
  assert.ok(['verde', 'amarillo', 'rojo'].includes(s.light));
  assert.ok(s.reasons.some(r => /10 aciertos y 4 fallos/.test(r.text)));
  const withPolemic = scoreSymbol({ symbol: 'ABC', bars, bench, polemics: 2 });
  assert.equal(withPolemic.light, 'rojo');
  const p = project(bars, 200);
  assert.ok(p.bad <= p.probable && p.probable <= p.good);
  assert.equal(adviseAmount({ amountUsd: 500, hasEmergencyFund: false }).light, 'rojo');
  assert.match(adviseAmount({ amountUsd: 5, hasEmergencyFund: true, fixedCostUsd: 3 }).notes[0], /Junta al menos US\$150/);
});

test('comprar exactamente el máximo (US$10) no se rechaza por redondeo', () => {
  const db = openDb(':memory:');
  const acc = ensureAccount(db, { owner: 'user:9', startCash: 100 });
  for (const price of [586.49, 823.87, 33.333, 0.777]) {
    const r = placeOrder(db, { accountId: acc.id, symbol: 'X' + price, side: 'buy', usd: 10, quote: { symbol: 'X', price, as_of: '2026-10-28T15:00:00Z', source: 't' }, quoteUsable: { usable: true }, now: new Date('2026-10-28T15:01:00Z') });
    assert.equal(r.ok, true, `precio ${price}: ${r.reason}`);
    assert.ok(r.qty * r.execPrice <= 10);
  }
});
