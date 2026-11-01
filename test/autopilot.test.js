import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../src/core/db.js';
import { verifyLedger } from '../src/core/ledger.js';
import { saveQuote } from '../src/stocks/market.js';
import { autopilotStep, aiView, aiAccount } from '../src/motor/autopilot.js';

// Martes 3 de noviembre de 2026, 11:00 a.m. en Nueva York (mercado abierto)
const OPEN = new Date('2026-11-03T16:00:00Z');
const CLOSED = new Date('2026-11-03T23:00:00Z');

function setup() {
  const db = openDb(':memory:');
  setSetting(db, 'global', 'budget', { usd: 100, emergency: true });
  const ins = db.prepare("INSERT INTO map_entries (symbol, zone, conv, light, prob, since, checked_at, reds, card, note) VALUES (?, ?, ?, ?, 0.6, '2026-11-01', '2026-11-01', 0, '{}', '')");
  ins.run('MSFT', 'recomendada', 80, 'verde');
  ins.run('KO', 'recomendada', 70, 'verde');
  ins.run('TSLA', 'no_recomendada', 20, 'rojo');
  const quote = (symbol, price, at = OPEN) => saveQuote(db, { symbol, price, asOf: new Date(at.getTime() - 60e3).toISOString(), kind: 'en_vivo', source: 'test' });
  return { db, quote };
}

test('cartera de la IA: compra sola lo recomendado (10% por idea) y nunca lo que no recomienda', () => {
  const { db, quote } = setup();
  quote('MSFT', 400); quote('KO', 60); quote('TSLA', 250);
  const r = autopilotStep(db, { now: OPEN });
  assert.deepEqual(r.bought.sort(), ['KO', 'MSFT']);
  const v = aiView(db);
  assert.equal(v.positions.length, 2);
  assert.ok(v.positions.every(p => p.value <= 10.01), 'como máximo 10% del dinero por idea');
  assert.ok(v.trades.every(t => /Te recomiendo/.test(t.reason)), 'cada compra explica el porqué');
  assert.equal(verifyLedger(db).ok, true);
  // Una segunda vuelta no vuelve a comprar lo mismo
  assert.equal(autopilotStep(db, { now: OPEN }).bought.length, 0);
});

test('cartera de la IA: vende si baja 8% o si deja de estar recomendada', () => {
  const { db, quote } = setup();
  quote('MSFT', 400); quote('KO', 60);
  autopilotStep(db, { now: OPEN });
  quote('MSFT', 360); // −10%
  db.prepare("UPDATE map_entries SET zone = 'no_recomendada', light = 'rojo' WHERE symbol = 'KO'").run();
  const r = autopilotStep(db, { now: OPEN });
  assert.deepEqual(r.sold.sort(), ['KO', 'MSFT']);
  const v = aiView(db);
  assert.equal(v.positions.length, 0);
  assert.ok(v.trades.some(t => /8%/.test(t.reason)) && v.trades.some(t => /ya no la recomiendo/.test(t.reason)));
});

test('cartera de la IA: con el mercado cerrado no opera, y está separada de la cuenta de la persona', () => {
  const { db, quote } = setup();
  quote('MSFT', 400, CLOSED); quote('KO', 60, CLOSED);
  const r = autopilotStep(db, { now: CLOSED });
  assert.equal(r.bought.length, 0);
  assert.ok(r.skipped.every(s => s.why === 'sin precio actual'));
  assert.match(aiAccount(db).owner, /^jarvis:ia$/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM accounts WHERE owner LIKE 'user:%'").get().n, 0);
});
