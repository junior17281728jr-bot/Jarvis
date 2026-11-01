import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, activity } from '../src/core/db.js';
import { encryptBuffer, decryptBuffer } from '../src/core/offsite.js';
import { pushImportant } from '../src/core/notify.js';
import { whatIf, monthlyGrade, emotionPause, updateFx } from '../src/motor/insights.js';
import { ensureAccount, placeOrder } from '../src/stocks/account.js';
import { marketOpen, setTradingDays } from '../src/stocks/market.js';

test('copia cifrada: se abre con la frase correcta y no con otra', () => {
  const data = Buffer.from('datos de jarvis '.repeat(500));
  const enc = encryptBuffer(data, 'frase-larga-de-prueba');
  assert.ok(enc.length < data.length); // comprimida
  assert.equal(decryptBuffer(enc, 'frase-larga-de-prueba').toString(), data.toString());
  assert.throws(() => decryptBuffer(enc, 'otra-frase'));
});

test('avisos: agrupa lo importante, codifica tildes y no repite', async () => {
  const db = openDb(':memory:');
  activity(db, { text: 'algo normal' });
  activity(db, { type: 'trampa', text: 'Trampa detectada en TSLA', important: true });
  const calls = [];
  const fake = async (url, o) => { calls.push({ url, o }); return { ok: true }; };
  const cfg = { ntfyServer: 'https://ntfy.sh', ntfyTopic: 'jarvis-prueba' };
  assert.equal((await pushImportant(db, cfg, fake)).sent, 1);
  assert.match(calls[0].o.body, /Trampa detectada/);
  assert.equal(calls[0].o.headers.Priority, '4');
  assert.equal((await pushImportant(db, cfg, fake)).sent, 0);
  const { sendPush } = await import('../src/core/notify.js');
  await sendPush(cfg, { title: 'Novedades: ganó', message: 'x' }, fake);
  assert.match(calls.at(-1).o.headers.Title, /^=\?UTF-8\?B\?/);
});

test('¿y si…? y boletín mensual con recomendaciones calificadas', () => {
  const db = openDb(':memory:');
  const month = new Date().toISOString().slice(0, 7);
  const ins = db.prepare('INSERT INTO predictions (module, subject, payload, sealed_at, ledger_hash, resolved_at, outcome, correct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 10; i++) ins.run('ranking', `ranking:X:${i}`, JSON.stringify({ light: 'verde' }), `2026-09-0${i % 9 + 1}`, 'h' + i, `${month}-15`, JSON.stringify({ ret: 0.04, bench: 0.01, excess: 0.03 }), i < 8 ? 1 : 0);
  const w = whatIf(db, { perTradeUsd: 10 });
  assert.equal(w.trades, 10);
  assert.equal(w.jarvisGain, 4);
  assert.equal(w.marketGain, 1);
  const g = monthlyGrade(db, month);
  assert.equal(g.grade, 'B'); // 8/10 aún no prueba nada con 95% de confianza
  assert.equal(monthlyGrade(db, '2020-01').grade, '—');
});

test('pausa por emoción tras una pérdida fuerte reciente', () => {
  const db = openDb(':memory:');
  const acc = ensureAccount(db, { owner: 'user:1', startCash: 100 });
  const now = new Date();
  const q = p => ({ symbol: 'X', price: p, as_of: now.toISOString(), source: 't' });
  const b = placeOrder(db, { accountId: acc.id, symbol: 'X', side: 'buy', usd: 10, quote: q(100), quoteUsable: { usable: true }, now });
  placeOrder(db, { accountId: acc.id, symbol: 'X', side: 'sell', qty: b.qty, quote: q(90), quoteUsable: { usable: true }, now });
  assert.equal(emotionPause(db, acc.id, { now }).pause, true);
  assert.equal(emotionPause(db, acc.id, { now: new Date(now.getTime() + 25 * 3600e3) }).pause, false);
});

test('tipo de cambio: valida el rango y guarda la fuente', async () => {
  const db = openDb(':memory:');
  const ok = await updateFx(db, async () => ({ ok: true, json: async () => ({ rates: { DOP: 63.2 }, time_last_update_utc: 'x' }) }));
  assert.equal(ok.rate, 63.2);
  await assert.rejects(() => updateFx(db, async () => ({ ok: true, json: async () => ({ rates: { DOP: 0.5 } }) })), /fuera de rango/);
});

test('calendario oficial: un día no hábil de la lista cierra el mercado', () => {
  setTradingDays(['2026-10-27', '2026-10-29']);
  assert.equal(marketOpen(new Date('2026-10-28T15:00:00Z')), false);
  assert.equal(marketOpen(new Date('2026-10-29T15:00:00Z')), true);
  setTradingDays(null);
  assert.equal(marketOpen(new Date('2026-10-28T15:00:00Z')), true);
});

test('ideas de los agentes: solo se aceptan familias y rangos permitidos', async () => {
  const { validateIdea, proposeIdeas } = await import('../src/motor/research.js');
  const { ensureAgents } = await import('../src/motor/league.js');
  assert.deepEqual(validateIdea({ family: 'cruce_medias', params: { fast: 15, slow: 80 }, why: 'x' }, ['cruce_medias']).params, { fast: 15, slow: 80 });
  assert.equal(validateIdea({ family: 'cruce_medias', params: { fast: 90, slow: 30 } }, ['cruce_medias']), null);
  assert.equal(validateIdea({ family: 'cruce_medias', params: { fast: 15, slow: 9999 } }, ['cruce_medias']), null);
  assert.equal(validateIdea({ family: 'rebote_rsi', params: { period: 14, low: 30, high: 60 } }, ['cruce_medias']), null);
  const db = openDb(':memory:'); ensureAgents(db);
  const fake = async () => ({ ok: true, json: async () => ({ message: { content: '{"ideas":[{"family":"impulso","params":{"lookback":90},"why":"tendencia de 4 meses"},{"family":"impulso","params":{"lookback":-5}}]}' } }) });
  const r = await proposeIdeas(db, { ollamaUrl: 'http://x', aiMonthlyCapUsd: 10, aiDailyCapUsd: 1 }, { fetchImpl: fake });
  assert.equal(r.find(x => x.agent === 'largo').added, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agenda WHERE source = 'ia:largo'").get().n, 1);
});

test('inicio: oportunidades en % con mínimo para entrar', async () => {
  const { opportunities } = await import('../src/motor/reports.js');
  const db = openDb(':memory:');
  db.prepare('INSERT INTO recommendations (symbol, created_at, light, confidence, payload, ledger_hash) VALUES (?, ?, ?, ?, ?, ?)').run('ABC', new Date().toISOString(), 'verde', 0.7,
    JSON.stringify({ symbol: 'ABC', light: 'verde', confidence: 0.7, score: 0.4, reasons: [{ text: 'sube' }], projection: { ejemplo: { amountUsd: 200, days: 126, bad: -20, probable: 10, good: 40, lossChance: 0.3 } } }), 'h');
  const o = opportunities(db, { tradeMinUsd: 5 });
  assert.deepEqual(o[0].pct, { bad: -10, probable: 5, good: 20 });
  assert.equal(o[0].minimum, 5);
  assert.equal(o[0].months, 6);
});

test('IA: elige el modelo más barato disponible y lo cobra con su precio', async () => {
  const { resolveOpenAIModel, complete } = await import('../src/ai/providers.js');
  const db = openDb(':memory:');
  const fake = async (url) => url.endsWith('/v1/models')
    ? { ok: true, json: async () => ({ data: [{ id: 'gpt-5.6-luna' }, { id: 'gpt-6-luna' }, { id: 'gpt-4o' }] }) }
    : { ok: true, json: async () => ({ choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 1e6, completion_tokens: 0 } }) };
  const cfg = { openaiKey: 'k', openaiModel: '', aiMonthlyCapUsd: 10, aiDailyCapUsd: 5 };
  assert.equal(await resolveOpenAIModel(db, cfg, fake), 'gpt-6-luna');
  const r = await complete(db, cfg, { task: 't', system: 's', prompt: 'p', only: 'openai', maxTokens: 10, fetchImpl: fake });
  assert.equal(r.model, 'gpt-6-luna');
  assert.ok(Math.abs(r.cost - 0.1) < 1e-9); // 1M tokens de entrada a US$0.10
});
