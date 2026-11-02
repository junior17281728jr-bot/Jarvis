import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { verifyLedger } from '../src/core/ledger.js';
import { saveBars, syntheticBars, saveQuote } from '../src/stocks/market.js';
import { ensureAgents, settleCoins, wallet, leagueTable, agentBrief, audit } from '../src/motor/league.js';
import { seedAgenda, pickNext, runExperiment } from '../src/motor/research.js';
import { buildRanking, resolveRanking, latestRanking } from '../src/motor/recommend.js';
import { autoPlays, pickOfTheDay } from '../src/motor/lottery-agent.js';
import { runCycle, startMotor, motorState } from '../src/motor/cycle.js';
import { complete } from '../src/ai/providers.js';
import { runDebate, todoSteps } from '../src/ai/debate.js';
import { recordObservation } from '../src/lottery/results.js';
import { SEED } from '../src/lottery/seed-data.js';
import { parseRss, polemicLevel } from '../src/ai/research.js';

const cfg = { openaiKey: '', anthropicKey: '', ollamaUrl: 'http://x', aiMonthlyCapUsd: 10, aiDailyCapUsd: 0.5, backupDir: '/tmp/jv-test-b', dailySummaryHourRd: 8, startCashUsd: 100 };
const syms = ['SPY', 'AAA', 'BBB', 'CCC'];
function market(db) { syms.forEach((s, i) => saveBars(db, s, { source: 'prueba', bars: syntheticBars(700, { seed: i + 1, drift: i === 1 ? 0.0012 : 0.0003 }) })); }

test('auditor: detecta precio viejo y decisión sellada después; las monedas se revocan con explicación', () => {
  const db = openDb(':memory:'); ensureAgents(db);
  const entry = { id: 1, ts: '2026-10-28T15:00:00Z', observed_at: '2026-10-28T14:55:00Z', qty: 0.1, exec_price: 100 };
  const exit = { id: 2, ts: '2026-10-29T15:00:00Z', observed_at: '2026-10-29T14:00:00Z', qty: 0.1, exec_price: 110 };
  const decision = { sealed_at: '2026-10-28T16:00:00Z', payload: JSON.stringify({ dataUntil: '2026-10-27' }) };
  const a = audit(db, { entry, exit, decision, limits: { maxTradeUsd: 100 } });
  assert.deepEqual(a.issues.map(i => i.rule).sort(), ['precio_viejo', 'sin_decision_previa']);
  const r = settleCoins(db, { agent: 'corto', strategyId: 1, closed: { pnlPct: 0.1 }, entry, exit, decision, benchReturn: 0.01, limits: { maxTradeUsd: 100 } });
  assert.equal(r.cheat, true);
  assert.equal(wallet(db, 'corto'), 0);
  const ok = settleCoins(db, { agent: 'largo', strategyId: 2, closed: { pnlPct: 0.03 }, entry, exit: { ...exit, id: 3, observed_at: '2026-10-29T14:58:00Z' }, decision: { ...decision, sealed_at: '2026-10-28T14:00:00Z' }, benchReturn: 0.01 });
  assert.equal(ok.coins, 4); // 3% + 1 por ganarle al mercado
  assert.equal(leagueTable(db)[0].id, 'largo');
  assert.match(agentBrief(db, 'largo'), /4 monedas/);
});

test('investigación: agenda, experimento pre-registrado, examen con datos bajo llave y estado con motivo', () => {
  const db = openDb(':memory:'); ensureAgents(db); market(db); seedAgenda(db);
  const items = pickNext(db, 3);
  assert.equal(items.length, 3);
  const r = runExperiment(db, items[0], { symbols: syms });
  assert.ok(['no_validada', 'en_prueba', 'en_desarrollo'].includes(r.status));
  assert.ok(r.reason.length > 10);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM experiments').get().n, 1);
  assert.equal(verifyLedger(db).ok, true);
});

test('ranking sellado como predicción y calificado después', () => {
  const db = openDb(':memory:'); market(db);
  const cards = buildRanking(db, { symbols: syms, date: '2026-01-01' });
  assert.equal(cards.length, 3);
  assert.ok(cards[0].reasons.length >= 3);
  // Simula que la recomendación se hizo 30 días antes del final de los datos
  const p = db.prepare("SELECT * FROM predictions WHERE module = 'ranking' LIMIT 1").get();
  const pl = JSON.parse(p.payload);
  const bars = db.prepare("SELECT ts, close FROM stock_bars WHERE symbol = ? ORDER BY ts").all(pl.symbol);
  const spy = db.prepare("SELECT ts, close FROM stock_bars WHERE symbol = 'SPY' ORDER BY ts").all();
  const at = bars.length - 30;
  db.prepare('UPDATE predictions SET payload = ? WHERE id = ?').run(JSON.stringify({ ...pl, startDate: bars[at].ts, startClose: bars[at].close, startBench: spy[at].close }), p.id);
  assert.ok(resolveRanking(db) >= 1);
  assert.equal(latestRanking(db).length, 3);
});

test('IA: sin claves no inventa nada; el debate cae a datos e historial', async () => {
  const db = openDb(':memory:');
  const failFetch = async () => { throw new Error('sin red'); };
  const r = await complete(db, cfg, { task: 't', system: 's', prompt: 'p', fetchImpl: failFetch });
  assert.equal(r.ok, false);
  const card = { light: 'verde', confidence: 0.7, score: 0.3, reasons: [{ text: 'x', factor: 'tendencia' }] };
  const d = await runDebate(db, cfg, { symbol: 'AAA', card, context: { price: 1 }, fetchImpl: failFetch });
  assert.equal(d.verdict.light, 'verde');
  assert.match(d.verdict.notes.join(' '), /No hubo debate|no coinciden|mismo modelo/);
  assert.equal(todoSteps('amarillo')[0].step, 'Invierte US$5 ahora');
});

test('debate con IA simulada: si no coinciden baja a amarillo; el gasto queda registrado', async () => {
  const db = openDb(':memory:');
  const c2 = { ...cfg, openaiKey: 'k', anthropicKey: 'k2' };
  db.prepare("INSERT INTO settings (scope, key, value) VALUES ('global','ai.enabled','{\"openai\":true,\"anthropic\":true,\"ollama\":false}')").run();
  const fake = async (url) => ({ ok: true, json: async () => url.includes('openai')
    ? { choices: [{ message: { content: '{"stance":"comprar","argument":"Ganancias al alza","evidence":[{"text":"x","kind":"dato","source":"SEC"}]}' } }], usage: { prompt_tokens: 500, completion_tokens: 80 } }
    : { content: [{ text: '{"stance":"esperar","argument":"Precio alto","evidence":[]}' }], usage: { input_tokens: 500, output_tokens: 80 } } });
  const card = { light: 'verde', confidence: 0.7, score: 0.3, reasons: [{ text: 'x', factor: 'tendencia' }] };
  const d = await runDebate(db, c2, { symbol: 'AAA', card, context: { price: 1 }, fetchImpl: fake });
  assert.equal(d.rounds.length, 2);
  assert.equal(d.verdict.light, 'amarillo');
  assert.ok(d.costUsd > 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_usage').get().n, 4);
});

test('tope de gasto: si se llega al límite, no llama a la IA de pago', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO ai_usage (ts, provider, model, task, in_tokens, out_tokens, cost_usd, ok) VALUES (?, 'openai', 'm', 't', 0, 0, 10, 1)").run(new Date().toISOString());
  let called = false;
  const r = await complete(db, { ...cfg, openaiKey: 'k' }, { task: 't', system: 's', prompt: 'p', only: 'openai', fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.match(r.reason, /tope mensual/);
});

test('loterías: jugadas automáticas selladas y número del sorteo con advertencia', () => {
  const db = openDb(':memory:');
  for (const o of SEED) recordObservation(db, o);
  const now = new Date('2026-10-28T13:00:00Z');
  const n = autoPlays(db, { now });
  assert.ok(n >= 6);
  assert.equal(autoPlays(db, { now }), 0); // no duplica
  const pick = pickOfTheDay(db, 'real', { now });
  assert.equal(pick.numbers.length, 3, 'juega 3 números por sorteo');
  assert.equal(new Set(pick.numbers).size, 3, 'sin repetir');
  assert.match(pick.warning, /3 de cada 100/);
});

test('ciclo completo sin red: no se cae, registra errores y respeta el motor apagado', async () => {
  const db = openDb(':memory:'); market(db);
  const failFetch = async () => { throw new Error('sin red'); };
  const r1 = await runCycle(db, cfg, { now: new Date('2026-10-28T15:00:00Z'), fetchImpl: failFetch });
  assert.ok(r1.loterias_resultados);
  assert.equal(r1.investigacion, undefined); // motor apagado
  startMotor(db, 2);
  assert.equal(motorState(db).running, true);
  const r2 = await runCycle(db, cfg, { now: new Date(Date.now()), fetchImpl: failFetch, force: ['investigacion', 'ranking'] });
  assert.equal(r2.investigacion.ok, true);
  assert.equal(r2.ranking.ok, true);
  const later = await runCycle(db, cfg, { now: new Date(Date.now() + 3 * 3600e3), fetchImpl: failFetch });
  assert.equal(motorState(db).running, false); // se cumplió el tiempo
  assert.ok(later);
});

test('noticias: lectura de RSS y detección de polémicas', () => {
  const xml = '<rss><item><title><![CDATA[Company faces SEC probe over accounting]]></title><link>https://x.com/a</link><pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate></item></rss>';
  const it = parseRss(xml);
  assert.equal(it[0].link, 'https://x.com/a');
  assert.equal(polemicLevel(it[0].title).level, 3);
  assert.equal(polemicLevel('Apple launches new iPhone').level, 0);
});
