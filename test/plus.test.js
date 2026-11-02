import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, getSetting } from '../src/core/db.js';
import { saveBars, syntheticBars } from '../src/stocks/market.js';
import { suggestStocks, lotteryExplain } from '../src/ai/plus.js';
import { exploreStep } from '../src/motor/map.js';

const cfg = { openaiKey: 'sk-test', openaiModel: 'gpt-4o-mini', aiMonthlyCapUsd: 10, aiDailyCapUsd: 1 };
const fakeAI = content => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 100 }, model: 'gpt-4o-mini', data: [{ id: 'gpt-4o-mini' }] }) });

test('plus IA: propone empresas, filtra lo inválido, y JARVIS las prueba con precios reales', async () => {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO settings (scope, key, value) VALUES ('global','ai.enabled','{\"openai\":true}') ON CONFLICT DO UPDATE SET value = excluded.value").run();
  saveBars(db, 'SPY', { source: 't', bars: syntheticBars(800, { seed: 1 }) });
  const r = await suggestStocks(db, cfg, { fetchImpl: fakeAI(JSON.stringify({ ideas: [{ symbol: 'zzzz', why: 'Prueba <b>x</b>' }, { symbol: 'bad ticker!', why: 'no' }, { symbol: 'AAPL', why: 'ya la conoce' }] })) });
  assert.deepEqual(r.ideas.map(x => x.symbol), ['ZZZZ']);
  assert.doesNotMatch(r.ideas[0].why, /</);
  const ex = await exploreStep(db, cfg, { n: 1, date: '2026-11-02', fetchBars: async sym => saveBars(db, sym, { source: 't', bars: syntheticBars(800, { seed: 9, drift: 0.0008 }) }) });
  assert.equal(ex.studied[0].symbol, 'ZZZZ', 'lo sugerido por la IA se estudia primero');
  assert.equal(getSetting(db, 'global', 'explore.ai', [])[0].status, 'estudiada');
});

test('plus IA: sin IA conectada no gasta nada y lo dice claro', async () => {
  const db = openDb(':memory:');
  assert.equal((await suggestStocks(db, {}, {})).skipped, 'sin IA conectada');
  assert.match((await lotteryExplain(db, {}, { facts: {} })).error, /IA conectada/);
});
