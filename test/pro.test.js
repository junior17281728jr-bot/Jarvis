import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting, getSetting } from '../src/core/db.js';
import { saveQuote, saveBars, syntheticBars } from '../src/stocks/market.js';
import { autopilotStep, aiView, marketRegime } from '../src/motor/autopilot.js';
import { learnWeights, factorStats } from '../src/motor/factor-learning.js';
import { scoreSymbol, WEIGHTS } from '../src/stocks/advice.js';
import { queuePistas } from '../src/motor/contexts.js';
import { describe as describeRule } from '../src/stocks/strategies.js';
import { runExperiment } from '../src/motor/research.js';
import { jarvisAccounts } from '../src/motor/jarvis-accounts.js';

const OPEN = new Date('2026-11-03T16:00:00Z');
function setup({ drift = 0.0008 } = {}) {
  const db = openDb(':memory:');
  setSetting(db, 'global', 'budget', { usd: 100, emergency: true });
  const ins = db.prepare("INSERT INTO map_entries (symbol, zone, conv, light, prob, since, checked_at, reds, card, note) VALUES (?, ?, ?, ?, 0.6, '2026-11-01', '2026-11-01', 0, '{}', '')");
  ins.run('MSFT', 'recomendada', 80, 'verde'); ins.run('KO', 'recomendada', 70, 'verde');
  saveBars(db, 'SPY', { source: 'test', bars: syntheticBars(320, { drift, vol: 0.004, from: '2025-08-01' }).filter(b => b.ts < '2026-11-03') });
  const quote = (symbol, price) => saveQuote(db, { symbol, price, asOf: new Date(OPEN.getTime() - 60e3).toISOString(), kind: 'en_vivo', source: 'test' });
  return { db, quote };
}

test('mercado bajista: JARVIS no compra nada nuevo; mercado subiendo: sí compra', () => {
  const bear = setup({ drift: -0.003 });
  assert.equal(marketRegime(bear.db), 'bajista');
  bear.quote('MSFT', 400); bear.quote('KO', 60);
  const r = autopilotStep(bear.db, { now: OPEN });
  assert.equal(r.bought.length, 0); assert.equal(r.regime, 'bajista');
  const bull = setup({ drift: 0.003 });
  assert.equal(marketRegime(bull.db), 'alcista');
  bull.quote('MSFT', 400); bull.quote('KO', 60);
  assert.equal(autopilotStep(bull.db, { now: OPEN }).bought.length, 2);
});

test('montos según el riesgo y venta para asegurar la ganancia (10% desde el punto más alto)', () => {
  const { db, quote } = setup({ drift: 0.003 });
  // MSFT tranquila, KO muy movida
  saveBars(db, 'MSFT', { source: 'test', bars: syntheticBars(200, { vol: 0.006, from: '2026-01-02', start: 400 }).filter(b => b.ts < '2026-11-03') });
  saveBars(db, 'KO', { source: 'test', bars: syntheticBars(200, { vol: 0.05, from: '2026-01-02', start: 60, seed: 3 }).filter(b => b.ts < '2026-11-03') });
  quote('MSFT', 400); quote('KO', 60);
  autopilotStep(db, { now: OPEN });
  const v = aiView(db), m = v.positions.find(p => p.symbol === 'MSFT'), k = v.positions.find(p => p.symbol === 'KO');
  assert.ok(m.value > k.value, `la tranquila recibe más (${m.value} vs ${k.value})`);
  assert.ok(m.value <= 15.01 && k.value >= 4.99, 'entre 5% y 15%');
  // Subió a 500 y bajó a 445: gana 11% pero cayó 11% desde el punto más alto → vende y asegura
  saveBars(db, 'MSFT', { source: 'test', bars: [{ ts: '2026-11-03', open: 480, high: 505, low: 470, close: 500, volume: 1 }] });
  quote('MSFT', 445); quote('KO', 60);
  const r = autopilotStep(db, { now: OPEN });
  assert.ok(r.sold.includes('MSFT'));
  assert.match(db.prepare("SELECT reason FROM trades WHERE symbol = 'MSFT' AND side = 'sell'").get().reason, /asegurar la ganancia/);
});

test('aprende qué señales aciertan: la que acierta pesa más, la que falla pesa menos (con freno)', () => {
  const db = openDb(':memory:');
  const insP = db.prepare("INSERT INTO predictions (module, agent, subject, payload, prob, sealed_at, ledger_hash, resolved_at, outcome, correct) VALUES ('ranking', 'jarvis', ?, '{}', 0.5, '2026-01-01', ?, '2026-02-01', ?, 1)");
  const insR = db.prepare("INSERT INTO recommendations (symbol, created_at, light, confidence, payload, ledger_hash) VALUES ('X', '2026-01-01', 'verde', 0.5, ?, ?)");
  for (let i = 0; i < 400; i++) {
    const beat = i % 2 === 0;
    insR.run(JSON.stringify({ contributions: [{ factor: 'tendencia', value: beat ? 0.6 : -0.6 }, { factor: 'riesgo', value: beat ? -0.5 : 0.5 }, { factor: 'empresa', value: 0.02 }] }), `h${i}`);
    insP.run(`ranking:X:${i}`, `h${i}`, JSON.stringify({ excess: beat ? 0.02 : -0.02 }));
  }
  assert.equal(factorStats(db).tendencia.n, 400);
  assert.equal(factorStats(db).empresa, undefined, 'una señal neutra no cuenta como voto');
  const w = learnWeights(db);
  assert.ok(w.weights.tendencia > WEIGHTS.tendencia && w.weights.riesgo < WEIGHTS.riesgo);
  assert.ok(w.weights.tendencia <= WEIGHTS.tendencia * 2 && w.weights.riesgo >= WEIGHTS.riesgo * 0.5, 'nunca más del doble ni menos de la mitad');
  // Con pocos casos casi no cambia
  const db2 = openDb(':memory:');
  for (let i = 0; i < 6; i++) { db2.prepare("INSERT INTO recommendations (symbol, created_at, light, confidence, payload, ledger_hash) VALUES ('X', '2026-01-01', 'verde', 0.5, ?, ?)").run(JSON.stringify({ contributions: [{ factor: 'tendencia', value: 0.6 }] }), `g${i}`); db2.prepare("INSERT INTO predictions (module, agent, subject, payload, prob, sealed_at, ledger_hash, resolved_at, outcome, correct) VALUES ('ranking', 'jarvis', ?, '{}', 0.5, '2026-01-01', ?, '2026-02-01', ?, 1)").run(`r:${i}`, `g${i}`, JSON.stringify({ excess: 0.01 })); }
  assert.ok(learnWeights(db2).detail.tendencia.mult < 1.1, 'con 6 casos el cambio es pequeño');
  // El puntaje usa los pesos aprendidos
  const bars = syntheticBars(300, { drift: 0.002 }), bench = syntheticBars(300, { drift: 0 , seed: 9 });
  const a = scoreSymbol({ symbol: 'X', bars, bench }), b = scoreSymbol({ symbol: 'X', bars, bench, weights: w.weights });
  assert.notEqual(a.score, b.score);
});

test('pistas por situación del mercado: entran a la cola y se examinan solo en esos días', () => {
  const db = openDb(':memory:');
  saveBars(db, 'SPY', { source: 'test', bars: syntheticBars(900, { drift: 0.0003, from: '2022-01-03' }) });
  saveBars(db, 'AAA', { source: 'test', bars: syntheticBars(900, { drift: 0.0004, from: '2022-01-03', seed: 5 }) });
  setSetting(db, 'global', 'lessons.contexts', { at: '2026-11-01', findings: [{ tipo: 'regimen', caso: 'bajista', familia: 'rebote_rsi', params: { period: 14, low: 30, high: 60 }, regla: 'x' }, { tipo: 'accion', caso: 'AAA', familia: 'impulso', params: { lookback: 20 } }] });
  assert.equal(queuePistas(db), 1, 'solo las de situación del mercado (las de una sola acción son más fáciles de que sean suerte)');
  assert.equal(queuePistas(db), 0, 'no se repiten');
  const item = db.prepare("SELECT * FROM agenda WHERE source = 'pista'").get();
  assert.match(item.title, /solo cuando el mercado va bajando/);
  assert.match(describeRule('rebote_rsi', { period: 14, low: 30, high: 60, regimen: 'calma' }), /mercado en calma/);
  const r = runExperiment(db, { ...item, agent: 'corto' }, { symbols: ['SPY', 'AAA'], bench: 'SPY' });
  assert.ok(['no_validada', 'en_prueba', 'en_desarrollo'].includes(r.status));
  assert.ok(r.result.train.n > 0 && r.result.train.n < 900 * 0.7, 'mide solo los días de esa situación');
});

test('las cuentas de JARVIS cuadran: total = efectivo + acciones; lotería: le queda = empezó − jugó + ganó', () => {
  const { db, quote } = setup({ drift: 0.003 });
  quote('MSFT', 400); quote('KO', 60);
  autopilotStep(db, { now: OPEN });
  const a = jarvisAccounts(db, { now: OPEN }), B = a.bolsa, L = a.loteria;
  assert.ok(Math.abs(B.total - (B.cash + B.valueNow)) < 0.02);
  assert.ok(Math.abs(B.gain - (B.total - B.start)) < 0.02);
  assert.equal(B.invested, B.positions.reduce((s, p) => s + p.invested, 0));
  assert.equal(L.leftRd, L.startRd - L.playedRd + L.wonRd);
  assert.ok(getSetting(db, 'global', 'ia.lastStep', null));
});
