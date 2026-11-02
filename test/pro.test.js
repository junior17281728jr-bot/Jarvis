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
  assert.ok(m.value <= 30.01 && k.value >= 4.5, 'nunca más del 30% en una sola empresa');
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

test('lotería: su jugada de 3 números se paga número por número (RD$100 cada uno)', async () => {
  const { openDb: od } = await import('../src/core/db.js');
  const { sealLotteryPick, resolveLotteryPicks } = await import('../src/motor/track.js');
  const { recordObservation } = await import('../src/lottery/results.js');
  const db = od(':memory:');
  sealLotteryPick(db, { game: 'real', date: '2026-11-02', numbers: ['11', '22', '33'], method: 'frecuentes', why: 'x' }, { stake: 100 });
  const pl = JSON.parse(db.prepare("SELECT payload FROM predictions WHERE module = 'loteria'").get().payload);
  assert.equal(pl.amountRd, 300); assert.equal(pl.perNumberRd, 100);
  assert.ok(pl.probHit > 0.08 && pl.probHit < 0.09);
  for (const source of ['premios.do', 'nacionalloteria.com']) recordObservation(db, { game: 'real', date: '2026-11-02', source, nums: ['22', '50', '11'], fetchedAt: '2026-11-02T18:00:00.000Z' });
  assert.equal(resolveLotteryPicks(db), 1);
  const out = JSON.parse(db.prepare("SELECT outcome FROM predictions WHERE module = 'loteria'").get().outcome);
  // 22 en 1ra (x60) y 11 en 3ra (x4), RD$100 cada uno
  assert.deepEqual(out.hits.sort(), ['11', '22']);
  assert.equal(out.prizeRd, 100 * 60 + 100 * 4);
  assert.equal(out.pnlRd, 6400 - 300);
});

test('IA: si ChatGPT responde vacío (modelo que "piensa"), se reintenta con uno estable y se recuerda', async () => {
  const { openDb: od, getSetting: gs } = await import('../src/core/db.js');
  const { complete, isReasoningModel } = await import('../src/ai/providers.js');
  const db = od(':memory:'), cfg = { openaiKey: 'sk-test', openaiModel: '', aiMonthlyCapUsd: 10, aiDailyCapUsd: 1, ollamaUrl: 'http://x', ollamaModel: 'x' };
  const calls = [];
  const fetchImpl = async (url, o) => {
    if (url.includes('/models')) return { ok: true, json: async () => ({ data: [{ id: 'gpt-5-nano' }, { id: 'gpt-4o-mini' }] }) };
    if (url.includes('11434') || url.startsWith('http://x')) throw new Error('no hay modelo local');
    const b = JSON.parse(o.body); calls.push(b);
    if (b.model === 'gpt-5-nano') return { ok: true, json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 600 } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hola, aquí está el análisis.' } }], usage: { prompt_tokens: 10, completion_tokens: 8 } }) };
  };
  assert.ok(isReasoningModel('gpt-5-nano') && !isReasoningModel('gpt-4o-mini'));
  const r = await complete(db, cfg, { task: 'prueba', system: 's', prompt: 'p', maxTokens: 300, fetchImpl });
  assert.equal(r.ok, true); assert.match(r.text, /análisis/);
  assert.equal(calls[0].model, 'gpt-5-nano'); assert.equal(calls[0].reasoning_effort, 'minimal');
  assert.ok(calls[0].max_completion_tokens > 300 * 3, 'a los que piensan se les da más espacio');
  assert.equal(calls[1].model, 'gpt-4o-mini');
  assert.equal(gs(db, 'global', 'ai.openaiModel', null).model, 'gpt-4o-mini', 'recuerda el modelo que sí funciona');
  // La siguiente vez va directo al que funciona
  calls.length = 0; await complete(db, cfg, { task: 'prueba', system: 's', prompt: 'p', fetchImpl });
  assert.equal(calls[0].model, 'gpt-4o-mini');
});

test('IA: si un modelo no acepta el ajuste de pensamiento, se reintenta sin él', async () => {
  const { openDb: od } = await import('../src/core/db.js');
  const { complete } = await import('../src/ai/providers.js');
  const db = od(':memory:'), cfg = { openaiKey: 'sk-test', openaiModel: 'gpt-6-luna', aiMonthlyCapUsd: 10, aiDailyCapUsd: 1, ollamaUrl: 'http://x', ollamaModel: 'x' };
  const bodies = [];
  const fetchImpl = async (url, o) => {
    if (url.startsWith('http://x')) throw new Error('no local');
    const b = JSON.parse(o.body); bodies.push(b);
    if (b.reasoning_effort) return { ok: false, status: 400, text: async () => '{"error":{"message":"Unsupported value: reasoning_effort minimal"}}' };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) };
  };
  const r = await complete(db, cfg, { task: 't', system: 's', prompt: 'p', fetchImpl });
  assert.equal(r.ok, true); assert.equal(bodies.length, 2); assert.equal(bodies[1].reasoning_effort, undefined);
});

test('lotería: un resultado "visto" antes de la hora del sorteo NO se guarda (era el de ayer mal fechado)', async () => {
  const { openDb: od } = await import('../src/core/db.js');
  const { recordObservation } = await import('../src/lottery/results.js');
  const db = od(':memory:');
  // Real es a las 12:55 p. m. de RD (16:55 UTC). A las 9:25 a. m. no puede haber resultado de hoy.
  const r = recordObservation(db, { game: 'real', date: '2026-11-02', source: 'premios.do', nums: ['01', '22', '74'], fetchedAt: '2026-11-02T13:25:00.000Z' });
  assert.equal(r.skipped, 'antes_del_sorteo');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lottery_observations').get().n, 0);
  // Si la página repite los mismos números del día anterior, tampoco
  recordObservation(db, { game: 'real', date: '2026-11-01', source: 'premios.do', nums: ['22', '74', '06'], fetchedAt: '2026-11-01T18:00:00.000Z' });
  assert.equal(recordObservation(db, { game: 'real', date: '2026-11-02', source: 'premios.do', nums: ['22', '74', '06'], fetchedAt: '2026-11-02T18:00:00.000Z' }).skipped, 'igual_al_anterior');
});

test('lotería: el lector de páginas no confunde fechas, horas ni "sorteo #" con números del sorteo', async () => {
  const { parseResults } = await import('../src/lottery/sources.js');
  const rows = parseResults('Loteka 02-11-2026 Sorteo 01 7:55 PM 22 74 06 · 01-11-2026 Sorteo 00 7:55 PM 95 13 40');
  assert.deepEqual(rows, [{ date: '2026-11-02', nums: ['22', '74', '06'] }, { date: '2026-11-01', nums: ['95', '13', '40'] }]);
  const r2 = parseResults('Lunes 2 de noviembre de 2026 · 02/11 · 8:55 p. m. 15 48 63');
  assert.deepEqual(r2[0].nums, ['15', '48', '63']);
});

test('lotería: la reparación quita resultados mal fechados y corrige lo que se pagó mal', async () => {
  const { openDb: od } = await import('../src/core/db.js');
  const { repairLotteryData, reconcile } = await import('../src/lottery/results.js');
  const { sealLotteryPick } = await import('../src/motor/track.js');
  const db = od(':memory:');
  sealLotteryPick(db, { game: 'loteka', date: '2026-11-01', numbers: ['95', '10', '20'], method: 'frecuentes', why: 'x' }, { stake: 100 });
  // Dato malo de antes: guardado a las 9 a. m. (antes del sorteo de las 7:55 p. m.) y "pagado" como si hubiera ganado
  for (const source of ['premios.do', 'nacionalloteria.com']) db.prepare('INSERT INTO lottery_observations (game, date, source, nums, fetched_at) VALUES (?, ?, ?, ?, ?)').run('loteka', '2026-11-01', source, JSON.stringify(['95', '13', '40']), '2026-11-01T13:00:00.000Z');
  reconcile(db, 'loteka', '2026-11-01');
  db.prepare("UPDATE predictions SET correct = 1, resolved_at = 'x', outcome = ? WHERE module = 'loteria'").run(JSON.stringify({ draw: ['95', '13', '40'], prizeRd: 6000 }));
  const out = repairLotteryData(db);
  assert.equal(out.badObservations, 2); assert.equal(out.picksFixed, 1);
  const p = db.prepare("SELECT correct, outcome FROM predictions WHERE module = 'loteria'").get();
  assert.equal(p.correct, null); assert.equal(p.outcome, null); // vuelve a esperar el resultado bueno
  assert.equal(repairLotteryData(db).picksFixed, 0); // correrla otra vez no cambia nada
});

test('lotería: JARVIS apuesta mínimo RD$100 por número, nunca más del 5% de lo que le queda, y no juega sin dinero', async () => {
  const { openDb: od } = await import('../src/core/db.js');
  const { smartStake } = await import('../src/motor/lottery-agent.js');
  const db = od(':memory:');
  const s = smartStake(db, 'frecuentes', 3);
  assert.equal(s.perNumberRd, 100); assert.equal(s.totalRd, 300); assert.ok(!s.skip);
  assert.ok(s.totalRd <= s.leftRd * 0.05 + 1e-9);
  // Se gastó casi todo: no le alcanza para el mínimo → no juega
  db.prepare("INSERT INTO predictions (module, agent, subject, payload, prob, sealed_at, ledger_hash) VALUES ('loteria','loteria','x',?,0.1,'2026-01-01','h')").run(JSON.stringify({ amountRd: s.leftRd - 200 }));
  const s2 = smartStake(db, 'frecuentes', 3);
  assert.ok(s2.skip); assert.match(s2.why, /No juega/);
});

test('lotería: texto real de premios.do (hoy sin resultado todavía) no inventa "01 22 74" para hoy', async () => {
  const { parseResults } = await import('../src/lottery/sources.js');
  const t = 'Loteka Lunes 02 de noviembre, 2026 7:50PM Avísame Loteka Domingo 01 de noviembre, 2026 7:50PM 22 74 06 Loteka Sábado 31 de octubre, 2026 7:50PM 95 11 99';
  assert.deepEqual(parseResults(t), [{ date: '2026-11-01', nums: ['22', '74', '06'] }, { date: '2026-10-31', nums: ['95', '11', '99'] }]);
});

test('bolsa: la IA arriesga más cuando está muy segura, menos si va perdiendo, y no compra si perdió 40%', async () => {
  const { openDb: od } = await import('../src/core/db.js');
  const { riskDecision } = await import('../src/motor/autopilot.js');
  const db = od(':memory:');
  db.prepare("INSERT INTO recommendations (symbol, created_at, light, confidence, payload, ledger_hash) VALUES ('AAA','x','verde',0.8,?,'h')").run(JSON.stringify({ probBeat: 0.7, confidence: 0.8 }));
  db.prepare("INSERT INTO recommendations (symbol, created_at, light, confidence, payload, ledger_hash) VALUES ('BBB','x','verde',0.5,?,'h')").run(JSON.stringify({ probBeat: 0.52, confidence: 0.5 }));
  const sure = riskDecision(db, { symbol: 'AAA', conv: 85, total: 200, start: 100, peak: 200 });
  assert.equal(sure.level, 'muy segura'); assert.equal(sure.usd, 50); // 25% de lo que tiene AHORA (US$200)
  const meh = riskDecision(db, { symbol: 'BBB', conv: 60, total: 100, start: 100, peak: 100 });
  assert.equal(meh.level, 'normal'); assert.equal(meh.usd, 8);
  const careful = riskDecision(db, { symbol: 'AAA', conv: 85, total: 75, start: 100, peak: 100 });
  assert.equal(careful.mode, 'cuidado'); assert.ok(careful.pct <= 0.125 + 1e-9);
  const def = riskDecision(db, { symbol: 'AAA', conv: 85, total: 59, start: 100, peak: 100 });
  assert.equal(def.mode, 'defensa'); assert.equal(def.usd, 0);
  assert.ok(riskDecision(db, { symbol: 'AAA', conv: 90, total: 100, start: 100, peak: 100, vol: 0.05 }).pct <= 0.30);
});
