// Herramienta de desarrollo: crea una base de datos de DEMOSTRACIÓN con precios sintéticos (marcados "demo")
// para revisar las pantallas sin internet. Nunca se usa en producción.
import { openDb, activity } from './core/db.js';
import { createUser } from './core/auth.js';
import { saveBars, saveQuote, syntheticBars } from './stocks/market.js';
import { recordObservation } from './lottery/results.js';
import { SEED } from './lottery/seed-data.js';
import { ensureAgents, settleCoins } from './motor/league.js';
import { seedAgenda, pickNext, runExperiment } from './motor/research.js';
import { buildRanking } from './motor/recommend.js';
import { autoPlays } from './motor/lottery-agent.js';
import { settlePending } from './lottery/simulator.js';
import { startMotor } from './motor/cycle.js';
import { unlinkSync, existsSync } from 'node:fs';

const path = process.argv[2] || 'data/demo.db';
for (const f of [path, path + '-wal', path + '-shm']) if (existsSync(f)) unlinkSync(f);
const db = openDb(path);
createUser(db, { username: 'junior', password: 'demo-jarvis-2026', role: 'admin', displayName: 'Junior' });
createUser(db, { username: 'amigo', password: 'demo-jarvis-2026', displayName: 'Mi amigo' });
{ const { saveProfile } = await import('./motor/profile.js'); saveProfile(db, 1, { style: 'equilibrado', horizon: 'medio' }); saveProfile(db, 2, { style: 'conservador', horizon: 'largo', interests: { loterias: false } }); }
ensureAgents(db); seedAgenda(db);
const syms = ['SPY', 'MSFT', 'AAPL', 'NVDA', 'AMZN', 'TSLA', 'KO', 'JPM'];
const allBars = syms.map((s, i) => syntheticBars(900, { seed: i + 3, start: [580, 420, 210, 120, 180, 260, 62, 210][i], drift: [0.0004, 0.0007, 0.0005, 0.0012, 0.0006, 0.0002, 0.0002, 0.0005][i], vol: [0.01, 0.014, 0.015, 0.028, 0.018, 0.033, 0.009, 0.014][i], from: '2023-03-01' }));
db.prepare("INSERT INTO settings (scope, key, value) VALUES ('global','stocks.universe',?)").run(JSON.stringify(syms));
// Historial de demostración: el ranking "viaja en el tiempo" semana a semana, viendo SOLO los precios hasta ese día,
// y dos IA simuladas opinan. Después llegan los precios siguientes y todo se califica con las mismas reglas.
{
  const { buildRanking: br } = await import('./motor/recommend.js');
  const { sealOpinion, resolveMarketPredictions } = await import('./motor/track.js');
  const { updateMap } = await import('./motor/map.js');
  const N = allBars[0].length;
  for (let cut = N - 150; cut <= N - 25; cut += 5) {
    syms.forEach((s, i) => saveBars(db, s, { source: 'demo', bars: allBars[i].slice(0, cut) }));
    const date = allBars[0][cut - 1].ts;
    const cards = br(db, { symbols: syms, date });
    updateMap(db, cards, { date });
    for (const c of cards.slice(0, 2)) {
      sealOpinion(db, { agent: 'gpt', provider: 'openai', symbol: c.symbol, date, stance: c.score > -0.1 ? 'comprar' : 'esperar', prob: Math.min(0.8, 0.55 + c.score * 0.3), argument: 'Opinión simulada para la demostración.' });
      sealOpinion(db, { agent: 'claude', provider: 'anthropic', symbol: c.symbol, date, stance: c.score > 0.25 ? 'comprar' : 'no_comprar', prob: Math.max(0.2, 0.45 + c.score * 0.2), argument: 'Opinión simulada para la demostración.' });
    }
    resolveMarketPredictions(db);
  }
  db.prepare('DELETE FROM recommendations').run(); // la vista "hoy" solo debe mostrar el ranking actual
}
syms.forEach((s, i) => {
  const bars = allBars[i];
  saveBars(db, s, { source: 'demo', bars });
  const last = bars.at(-1);
  saveQuote(db, { symbol: s, price: last.close, prevClose: bars.at(-2).close, asOf: new Date().toISOString(), kind: 'demo', source: 'demo' });
});
{ const { resolveMarketPredictions } = await import('./motor/track.js'); resolveMarketPredictions(db); }
for (const o of SEED) recordObservation(db, o);
const now = new Date('2026-10-27T13:00:00Z');
autoPlays(db, { now });
recordObservation(db, { game: 'real', date: '2026-10-27', source: 'premios.do', nums: ['26', '24', '13'] });
settlePending(db);
{ const { resolveLotteryPicks } = await import('./motor/track.js'); resolveLotteryPicks(db); }
for (const it of pickNext(db, 4)) { const r = runExperiment(db, it, { symbols: syms }); activity(db, { agent: it.agent, type: 'resultado', text: `${r.title} → ${r.status}. ${r.reason}` }); }
{
  const { updateMap, exploreStep } = await import('./motor/map.js');
  const { universe } = await import('./stocks/collector.js');
  updateMap(db, buildRanking(db, { symbols: syms }), { date: '2026-10-30' });
  // El explorador estudia empresas fuera del mapa (precios de demostración) y mete las que convienen
  const extra = { V: [0.0007, 0.012], WMT: [0.0009, 0.011], COST: [0.0008, 0.012], LLY: [0.0013, 0.02], AVGO: [0.0014, 0.026], XOM: [-0.0001, 0.016], GOOGL: [0.0005, 0.018], META: [0.0003, 0.026], MA: [0.0006, 0.012], HD: [-0.0002, 0.014], NFLX: [0.0002, 0.028], PEP: [-0.0003, 0.009] };
  Object.entries(extra).forEach(([s, [d, v]], i) => saveBars(db, s, { source: 'demo', bars: syntheticBars(900, { seed: 40 + i, start: 100 + i * 37, drift: d, vol: v, from: '2023-03-01' }) }));
  for (const day of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) await exploreStep(db, {}, { n: 3, fetchBars: async () => {}, date: day });
  updateMap(db, buildRanking(db, { symbols: universe(db) }), { date: '2026-10-30' });
}
db.prepare("INSERT INTO news (url, title, source, published_at, fetched_at, symbols, polemic, summary) VALUES (?,?,?,?,?,?,?,?)").run('https://example.com/tsla', 'Tesla faces safety probe over driver assistance system', 'Google News (RSS)', new Date().toISOString(), new Date().toISOString(), '["TSLA"]', 2, 'Tesla enfrenta una investigación de seguridad por su sistema de asistencia.');
const e = { id: 1, ts: '2026-10-20T15:00:00Z', observed_at: '2026-10-20T14:58:00Z', qty: 0.2, exec_price: 100 }, x = { id: 2, ts: '2026-10-27T15:00:00Z', observed_at: '2026-10-27T14:59:00Z', qty: 0.2, exec_price: 104 };
settleCoins(db, { agent: 'largo', strategyId: 1, closed: { pnlPct: 0.04 }, entry: e, exit: x, decision: { sealed_at: '2026-10-19T21:00:00Z', payload: '{"dataUntil":"2026-10-19"}' }, benchReturn: 0.01 });
settleCoins(db, { agent: 'corto', strategyId: 2, closed: { pnlPct: -0.015 }, entry: e, exit: { ...x, id: 3 }, decision: { sealed_at: '2026-10-19T21:00:00Z', payload: '{"dataUntil":"2026-10-19"}' }, benchReturn: 0.01 });
settleCoins(db, { agent: 'corto', strategyId: 3, closed: { pnlPct: 0.06 }, entry: e, exit: { ...x, id: 4, observed_at: '2026-10-27T13:30:00Z' }, decision: { sealed_at: '2026-10-19T21:00:00Z', payload: '{"dataUntil":"2026-10-19"}' }, benchReturn: 0.01 });
[['polemicas', 'Leyendo 14 noticias de Tesla…'], ['polemicas', '1 polémica marcada: investigación de seguridad (TSLA)'], ['loteria', 'Leidsa: sin anomalías en 14 sorteos (pocos datos todavía)'], ['largo', 'Probando: Cruce de medias 20/100 en 7 acciones…'], [null, 'Copia de seguridad verificada (412 KB). Registro sellado: intacto.']]
  .forEach(([agent, text], i) => activity(db, { agent, type: 'info', text, important: i === 1 }));
// Debate de ejemplo con respuestas simuladas (solo para la vista previa)
const { runDebate } = await import('./ai/debate.js');
const { latestRanking } = await import('./motor/recommend.js');
db.prepare("INSERT OR REPLACE INTO settings (scope, key, value) VALUES ('global','ai.enabled','{\"openai\":true,\"anthropic\":true,\"ollama\":false}')").run();
const said = { openai: ['{"stance":"comprar","argument":"Sube más que el mercado en 6 meses y el riesgo es moderado.","evidence":[{"text":"En 6 meses le ganó al mercado","kind":"dato","source":"Historial de precios"}]}', '{"stance":"comprar","argument":"La tendencia sigue fuerte; entrar en partes reduce el riesgo del precio alto.","evidence":[{"text":"Tendencia positiva sostenida","kind":"dato","source":"Historial de precios"},{"text":"Puede seguir subiendo","kind":"opinion","source":null}]}'],
  anthropic: ['{"stance":"esperar","argument":"Ya subió mucho: el precio podría corregir antes de seguir.","evidence":[{"text":"Subida fuerte reciente","kind":"dato","source":"Historial de precios"}]}', '{"stance":"esperar","argument":"De acuerdo con la tendencia, pero sin historial suficiente de JARVIS prefiero cautela.","evidence":[{"text":"Pocos casos calificados","kind":"dato","source":"Registro de JARVIS"}]}'] };
const n = { openai: 0, anthropic: 0 };
const fake = async url => { const k = url.includes('openai') ? 'openai' : 'anthropic'; const t = said[k][Math.min(n[k]++, 1)];
  return { ok: true, json: async () => k === 'openai' ? { choices: [{ message: { content: t } }], usage: { prompt_tokens: 600, completion_tokens: 90 } } : { content: [{ text: t }], usage: { input_tokens: 600, output_tokens: 90 } } }; };
const top = latestRanking(db)[0];
const d = await runDebate(db, { openaiKey: 'demo', anthropicKey: 'demo', aiMonthlyCapUsd: 10, aiDailyCapUsd: 1, openaiModel: 'gpt-mini', anthropicModel: 'claude-haiku' }, { symbol: top.symbol, card: top, context: { price: top.price }, fetchImpl: fake });
db.prepare('UPDATE recommendations SET debate_id = ? WHERE id = ?').run(d.id, top.id);
activity(db, { agent: 'largo', type: 'debate', important: true, text: `Debate sobre ${top.symbol}: ${d.verdict.title} (${d.verdict.light})` });
db.prepare("UPDATE settings SET value = '{\"openai\":true,\"anthropic\":false,\"ollama\":true}' WHERE scope='global' AND key='ai.enabled'").run();
// Cuenta de ejemplo con dos compras (para ver el dinero moverse en la vista previa)
const { ensureAccount, placeOrder } = await import('./stocks/account.js');
const acc = ensureAccount(db, { owner: 'user:1', userId: 1, startCash: 100 });
for (const [sym, back] of [['JPM', 60], ['MSFT', 45]]) {
  const bars = db.prepare("SELECT ts, close FROM stock_bars WHERE symbol = ? ORDER BY ts").all(sym);
  const b = bars.at(-back);
  const res = placeOrder(db, { accountId: acc.id, symbol: sym, side: 'buy', usd: 10, quote: { symbol: sym, price: b.close, as_of: b.ts + 'T15:00:00Z', source: 'demo' }, quoteUsable: { usable: true }, reason: 'ejemplo', now: new Date(b.ts + 'T15:00:00Z') }); if (!res.ok) console.log('demo:', res.reason);
}
// Cartera de la IA (decide sola) con algunas operaciones de ejemplo
{ const { aiAccount } = await import('./motor/autopilot.js'); const ia = aiAccount(db);
  for (const [sym, back, side] of [['NVDA', 80, 'buy'], ['MSFT', 70, 'buy'], ['KO', 50, 'buy'], ['KO', 20, 'sell']]) {
    const bars = db.prepare("SELECT ts, close FROM stock_bars WHERE symbol = ? ORDER BY ts").all(sym), b = bars.at(-back);
    const held = side === 'sell' ? db.prepare("SELECT SUM(CASE WHEN side='buy' THEN qty ELSE -qty END) q FROM trades WHERE account_id = ? AND symbol = ?").get(ia.id, sym).q : null;
    const res = placeOrder(db, { accountId: ia.id, symbol: sym, side, usd: side === 'buy' ? 10 : undefined, qty: held ?? undefined, quote: { symbol: sym, price: b.close, as_of: b.ts + 'T15:00:00Z', source: 'demo' }, quoteUsable: { usable: true }, reason: side === 'buy' ? 'IA compra: está en "Te recomiendo" (conveniencia 74/100).' : 'IA vende: ya no la recomiendo.', limits: { minTradeUsd: 1, maxTradeUsd: 10, maxPerSymbolPct: 20, minCashPct: 10, maxLossPct: 30 }, now: new Date(b.ts + 'T15:00:00Z') });
    if (!res.ok) console.log('demo IA:', res.reason);
  } }
startMotor(db, 72);
db.close();
console.log('Demo lista en', path, '— usuario: junior / demo-jarvis-2026');
