import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { verifyLedger } from '../src/core/ledger.js';
import { saveBars, saveQuote, syntheticBars } from '../src/stocks/market.js';
import { buildRanking } from '../src/motor/recommend.js';
import { stockAnalysis, lotteryAnalysis, explainAnalysis, fetchProfile } from '../src/motor/analysis.js';
import { sealOpinion, resolveMarketPredictions, compareAgents, historyList, performance, probBeat, addReal, closeReal, settleRealLottery, sealLotteryPick, resolveLotteryPicks } from '../src/motor/track.js';
import { recordObservation } from '../src/lottery/results.js';
import { SEED } from '../src/lottery/seed-data.js';

const syms = ['SPY', 'AAA', 'BBB', 'CCC'];
function market(db) { syms.forEach((s, i) => saveBars(db, s, { source: 'prueba', bars: syntheticBars(700, { seed: i + 1, drift: i === 1 ? 0.0012 : 0.0003 }) })); }

test('análisis profundo de una acción: conclusión completa, fuentes con tipo, escenarios y comparación', () => {
  const db = openDb(':memory:'); market(db);
  buildRanking(db, { symbols: syms });
  const a = stockAnalysis(db, 'AAA');
  for (const k of ['headline', 'why', 'evidence', 'chance', 'risks', 'failIf', 'ias', 'best', 'amount']) assert.ok(a.conclusion[k], k);
  assert.ok(a.sources.every(s => ['dato', 'estimacion', 'opinion', 'noticia'].includes(s.kind)));
  assert.ok(a.sources.some(s => s.kind === 'estimacion'));
  assert.equal(a.scenarios.length, 3);
  assert.ok(a.scenarios.every(s => s.bad <= s.probable && s.probable <= s.good));
  assert.ok(a.compare.some(c => c.current && c.symbol === 'AAA'));
  assert.ok(a.probBeat >= 0.35 && a.probBeat <= 0.65);
  assert.ok(a.failIf.length >= 3);
  assert.ok(a.timing.horizons.length >= 4 && a.conclusion.when.length >= 3);
  assert.ok(a.sources.some(s => /T\+1/.test(s.label)));
});

test('análisis en tiempo real: solo se sella uno nuevo cuando cambian los datos, y dice qué cambió', () => {
  const db = openDb(':memory:'); market(db);
  stockAnalysis(db, 'AAA'); stockAnalysis(db, 'AAA');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analyses').get().n, 1);
  saveQuote(db, { symbol: 'AAA', price: 9999, prevClose: 1, asOf: new Date().toISOString(), kind: 'prueba', source: 'prueba' });
  const b = stockAnalysis(db, 'AAA');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analyses').get().n, 2);
  assert.ok(b.changes.some(c => /Precio subió/.test(c)));
  assert.equal(verifyLedger(db).ok, true);
});

test('análisis de lotería: probabilidad exacta y monto sugerido cero', () => {
  const db = openDb(':memory:');
  for (const o of SEED) recordObservation(db, o);
  const a = lotteryAnalysis(db, 'real', { now: new Date('2026-10-28T13:00:00Z') });
  assert.match(a.conclusion.chance, /2\.97%/);
  assert.match(a.conclusion.amount, /RD\$0/);
  assert.equal(a.probs[0].per100, 72);
});

test('cada IA queda registrada y se compara: aciertos, calibración y dinero; también se ven los fallos', () => {
  const db = openDb(':memory:'); market(db);
  buildRanking(db, { symbols: syms });
  sealOpinion(db, { agent: 'gpt', provider: 'openai', symbol: 'AAA', stance: 'comprar', prob: 0.7, argument: 'sube' });
  sealOpinion(db, { agent: 'claude', provider: 'anthropic', symbol: 'AAA', stance: 'no_comprar', prob: 0.3, argument: 'cara' });
  // Mueve el inicio 30 días atrás para poder calificar
  const bars = db.prepare("SELECT ts, close FROM stock_bars WHERE symbol = 'AAA' ORDER BY ts").all(), spy = db.prepare("SELECT close FROM stock_bars WHERE symbol = 'SPY' ORDER BY ts").all();
  for (const p of db.prepare("SELECT id, payload FROM predictions WHERE payload LIKE '%\"symbol\":\"AAA\"%'").all()) {
    const pl = JSON.parse(p.payload); const at = bars.length - 30;
    db.prepare('UPDATE predictions SET payload = ? WHERE id = ?').run(JSON.stringify({ ...pl, startDate: bars[at].ts, startClose: bars[at].close, startBench: spy[at].close }), p.id);
  }
  assert.ok(resolveMarketPredictions(db) >= 3);
  const cmp = compareAgents(db);
  const gpt = cmp.agents.find(a => a.agent === 'gpt'), claude = cmp.agents.find(a => a.agent === 'claude');
  assert.equal(gpt.resolved, 1); assert.equal(claude.resolved, 1);
  assert.notEqual(gpt.hits, claude.hits); // opinaron lo contrario: uno acierta y el otro falla
  assert.ok(gpt.brier != null);
  const h = historyList(db);
  assert.ok(h.some(r => r.status === 'fallo') || h.some(r => r.status === 'acerto'));
  const rankAAA = h.find(r => r.module === 'ranking' && r.subject === 'AAA');
  assert.equal(rankAAA.others.length, 2); // "qué dijeron las otras IA"
  assert.ok(performance(db).bolsa.resolved >= 1);
});

test('la probabilidad se ajusta con casos reales cuando hay 10 o más parecidos', () => {
  const db = openDb(':memory:');
  assert.equal(probBeat(db, 0.2).method, 'modelo');
  const ins = db.prepare('INSERT INTO predictions (module, subject, payload, prob, sealed_at, ledger_hash, resolved_at, outcome, correct) VALUES (?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 12; i++) ins.run('ranking', 'r' + i, JSON.stringify({ score: 0.2, light: 'verde' }), 0.55, 'x', 'h' + i, '2026-10-01', JSON.stringify({ excess: i < 3 ? 0.01 : -0.01, ret: 0 }), i < 3 ? 1 : 0);
  const p = probBeat(db, 0.2);
  assert.equal(p.method, 'calibrado');
  assert.ok(p.p < 0.45); // la realidad (3 de 12) baja la estimación
});

test('apuestas reales registradas por ti, separadas de las virtuales', () => {
  const db = openDb(':memory:');
  const r = addReal(db, 1, { module: 'bolsa', symbol: 'MSFT', amountUsd: 10, price: 500 });
  assert.equal(closeReal(db, 1, r.id, { sellPrice: 550 }).pnl, 1);
  assert.throws(() => closeReal(db, 2, r.id, { sellPrice: 1 }), /No se encontró/);
  addReal(db, 1, { module: 'loteria', game: 'leidsa', numbers: ['64'], stakeRd: 10, date: '2026-10-27' });
  recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'a', nums: ['64', '06', '71'] });
  assert.equal(settleRealLottery(db), 1);
  const s = performance(db).real;
  assert.equal(s.bolsa.net, 1); assert.equal(s.loterias.net, 590);
});

test('número del sorteo sellado como recomendación y calificado', () => {
  const db = openDb(':memory:');
  sealLotteryPick(db, { game: 'leidsa', date: '2026-10-27', numbers: ['64'], method: 'azar', why: 'x' });
  recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'a', nums: ['01', '06', '71'] });
  assert.equal(resolveLotteryPicks(db), 0); // con una sola página no se califica: puede estar mal leída
  recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'b', nums: ['01', '06', '71'] });
  assert.equal(resolveLotteryPicks(db), 1);
  assert.equal(historyList(db, { module: 'loteria' })[0].status, 'fallo');
});

test('perfil con imagen desde Wikipedia y explicación de IA guardada', async () => {
  const db = openDb(':memory:'); market(db);
  const p = await fetchProfile(db, 'AAA', async () => ({ ok: true, json: async () => ({ title: 'AAA Corp', extract: 'Empresa de prueba.', thumbnail: { source: 'https://upload.wikimedia.org/x.png' }, content_urls: { desktop: { page: 'https://es.wikipedia.org/wiki/AAA' } } }) }));
  assert.equal(p.image, 'https://upload.wikimedia.org/x.png');
  const a = stockAnalysis(db, 'AAA');
  assert.equal(a.profile.name, 'AAA Corp');
  const cfg = { openaiKey: 'k', openaiModel: 'gpt-4o-mini', aiMonthlyCapUsd: 10, aiDailyCapUsd: 1 };
  const fake = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Explicación sencilla [1].' } }], usage: { prompt_tokens: 900, completion_tokens: 120 } }) });
  const e = await explainAnalysis(db, cfg, a.id, { fetchImpl: fake });
  assert.match(e.text, /sencilla/);
  assert.equal((await explainAnalysis(db, cfg, a.id, { fetchImpl: fake })).cached, true);
});

test('el semáforo no contradice el historial real, y las rachas se cuentan en orden de fecha', async () => {
  const { calibrateLight, summarize } = await import('../src/motor/track.js');
  const card = { light: 'verde', score: 0.4, reasons: [{ factor: 'x', text: 'y' }] };
  assert.equal(calibrateLight(card, { method: 'modelo', p: 0.3, n: 3 }).light, 'verde');
  const low = calibrateLight(card, { method: 'calibrado', p: 0.3, n: 20 });
  assert.equal(low.light, 'rojo'); assert.match(low.reasons[0].text, /20 casos/);
  assert.equal(calibrateLight(card, { method: 'calibrado', p: 0.52, n: 20 }).light, 'amarillo');
  assert.equal(calibrateLight({ ...card, light: 'rojo', score: 0 }, { method: 'calibrado', p: 0.6, n: 20 }, { polemics: 1 }).light, 'rojo');
  // Filas en desorden (como las devuelve un índice): la racha debe salir por fecha
  const row = (id, d, c) => ({ id, correct: c, prob: 0.6, resolved_at: '2026-10-30', payload: JSON.stringify({ amountUsd: 10 }), outcome: JSON.stringify({ endDate: d, ret: c ? 0.01 : -0.01 }) });
  const rows = [row(1, '2026-01-01', 1), row(3, '2026-01-03', 1), row(2, '2026-01-02', 0), row(4, '2026-01-04', 0)];
  const s = summarize(rows, 'ranking');
  assert.equal(s.streak.bestHits, 1); assert.equal(s.streak.bestMisses, 1);
  assert.deepEqual(s.months.map(m => m.month), ['2026-01']);
});
