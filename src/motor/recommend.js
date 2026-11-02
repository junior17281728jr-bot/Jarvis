// Ranking diario de empresas: cada recomendación queda sellada como predicción ("le gana al SPY en 20 días
// de bolsa") y luego se califica. Así el historial de JARVIS con cada empresa es real, no inventado.
import { nowIso, activity } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { round } from '../core/util.js';
import { getBars, getQuote } from '../stocks/market.js';
import { factsFor } from '../stocks/collector.js';
import { scoreSymbol, project } from '../stocks/advice.js';
import { openPolemics } from '../ai/research.js';
import { runDebate } from '../ai/debate.js';
import { available } from '../ai/providers.js';
import { timeToProfit } from '../stocks/timing.js';
import { getBudget } from './sizing.js';
import { probBeat, calibrateLight, recommendedAmount, resolveMarketPredictions } from './track.js';
import { learnedWeights } from './factor-learning.js';

const HORIZON = 20;

export function trackRecord(db, symbol) {
  const rows = db.prepare("SELECT correct, outcome FROM predictions WHERE module = 'ranking' AND subject LIKE ? AND correct IS NOT NULL").all(`ranking:${symbol}:%`);
  const wins = rows.filter(r => r.correct === 1).length;
  const net = rows.reduce((s, r) => s + (JSON.parse(r.outcome).excess || 0), 0);
  return { wins, losses: rows.length - wins, net };
}

/** La ficha de una acción con todo lo que hace falta para decidir (la usan el ranking y el explorador). */
export function cardFor(db, sym, benchBars) {
  const bars = getBars(db, sym);
  if (bars.length < 130) return null;
  const pol = openPolemics(db, sym);
  const npol = pol.filter(p => p.polemic >= 2).length;
  const raw = scoreSymbol({ symbol: sym, bars, bench: benchBars, facts: factsFor(db, sym), polemics: npol, track: trackRecord(db, sym), weights: learnedWeights(db) });
  const pb = probBeat(db, raw.score), card = calibrateLight(raw, pb, { polemics: npol });
  const q = getQuote(db, sym);
  card.probBeat = pb.p; card.probMethod = pb.method; card.probRaw = pb.raw ?? pb.p;
  card.price = q ? { value: q.price, asOf: q.as_of, source: q.source, kind: q.kind } : { value: bars.at(-1).close, asOf: bars.at(-1).ts, source: bars.at(-1).source, kind: 'cierre' };
  card.projection = { personal: project(bars, 10), ejemplo: project(bars, 200) };
  // Lo mismo en 3 meses, 6 meses y 1 año (en % de lo invertido), para decir el tiempo exacto de cada cálculo
  card.projection.h = Object.fromEntries([63, 126, 252].map(days => { const p = project(bars, 100, { days, sims: 1000 }); return [days, p && { bad: p.bad, probable: p.probable, good: p.good, lossChance: p.lossChance }]; }));
  const tm = timeToProfit(bars, benchBars);
  card.timing = tm ? { recommended: tm.recommended, immediate: tm.immediate, toTarget: tm.toTarget, pProfit: Object.fromEntries(tm.horizons.map(h => [h.days, h.pProfit])), h: Object.fromEntries(tm.horizons.map(h => [h.days, { p: h.pProfit, median: h.median, bad: h.bad, pBeat: h.pBeat }])) } : null;
  card.polemicList = pol.slice(0, 3);
  card._bars = bars;
  return card;
}

export function buildRanking(db, { symbols, bench = 'SPY', date = new Date().toISOString().slice(0, 10) }) {
  const benchBars = getBars(db, bench), out = [];
  for (const sym of symbols.filter(s => s !== bench)) {
    const card = cardFor(db, sym, benchBars);
    if (!card) continue;
    const bars = card._bars; delete card._bars;
    const pb = { p: card.probBeat, method: card.probMethod, raw: card.probRaw ?? card.probBeat };
    const subject = `ranking:${sym}:${date}`;
    if (!db.prepare('SELECT 1 FROM predictions WHERE subject = ?').get(subject)) {
      const claimBeat = card.light !== 'rojo';
      const amountUsd = recommendedAmount(card.light, { budgetUsd: getBudget(db).usd });
      const proj = card.projection.personal;
      const payload = { symbol: sym, light: card.light, score: card.score, confidence: card.confidence, probBeat: pb.p, probRaw: claimBeat ? pb.raw : 1 - pb.raw, probMethod: pb.method, claimBeat, amountUsd,
        potentialUsd: proj && amountUsd ? { probable: round(proj.probable / 10 * amountUsd, 2), good: round(proj.good / 10 * amountUsd, 2), bad: round(proj.bad / 10 * amountUsd, 2), months: 6 } : null,
        reasons: card.reasons.map(r => r.text), sources: sourcesFor(db, sym, card),
        claim: claimBeat ? `${sym} le ganará al SPY en ${HORIZON} días de bolsa` : `${sym} NO le ganará al SPY en ${HORIZON} días de bolsa`,
        // Rango honesto para los próximos 20 días de bolsa: 8 de cada 10 veces debería terminar entre lo y hi
        range: (() => { const r = project(bars, 100, { days: HORIZON, sims: 800 }); return r ? { lo: round(r.bad / 100, 4), hi: round(r.good / 100, 4), days: HORIZON } : null; })(),
        startClose: bars.at(-1).close, startBench: benchBars.at(-1)?.close, startDate: bars.at(-1).ts, version: card.version };
      card.amountUsd = amountUsd;
      const s = seal(db, { kind: 'recomendacion', ref: subject, payload });
      db.prepare('INSERT INTO predictions (module, agent, subject, payload, prob, sealed_at, ledger_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run('ranking', 'jarvis', subject, JSON.stringify(payload), claimBeat ? pb.p : 1 - pb.p, s.ts, s.hash);
      db.prepare('INSERT INTO recommendations (symbol, created_at, light, confidence, payload, ledger_hash) VALUES (?, ?, ?, ?, ?, ?)').run(sym, s.ts, card.light, card.confidence, JSON.stringify(card), s.hash);
    }
    out.push(card);
  }
  const order = { verde: 0, amarillo: 1, rojo: 2 };
  out.sort((a, b) => order[a.light] - order[b.light] || b.score - a.score);
  activity(db, { agent: 'largo', type: 'ranking', text: `Ranking actualizado: ${out.filter(c => c.light === 'verde').length} verdes, ${out.filter(c => c.light === 'amarillo').length} amarillas, ${out.filter(c => c.light === 'rojo').length} rojas` });
  return out;
}

function sourcesFor(db, sym, card) {
  const src = [{ label: `Precios diarios (${card.price?.source || 'mercado'})`, url: `https://finance.yahoo.com/quote/${sym}/history`, kind: 'dato' }];
  if (db.prepare('SELECT 1 FROM fundamentals WHERE symbol = ? LIMIT 1').get(sym)) src.push({ label: 'Informes anuales 10-K (SEC EDGAR)', url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${sym}&type=10-K`, kind: 'dato' });
  for (const n of db.prepare('SELECT title, url, source FROM news WHERE symbols LIKE ? ORDER BY fetched_at DESC LIMIT 3').all(`%"${sym}"%`)) src.push({ label: `${n.title} (${n.source})`, url: n.url, kind: 'dato' });
  src.push({ label: 'Historial propio de JARVIS (registro sellado)', url: null, kind: 'dato' });
  return src;
}
export const resolveRanking = (db, bench = 'SPY') => resolveMarketPredictions(db, bench);

export function latestRanking(db) {
  const last = db.prepare('SELECT MAX(created_at) m FROM recommendations').get().m;
  if (!last) return [];
  const day = last.slice(0, 10);
  return db.prepare("SELECT * FROM recommendations WHERE substr(created_at,1,10) = ? ORDER BY id").all(day).map(r => ({ ...JSON.parse(r.payload), id: r.id, debateId: r.debate_id }))
    .sort((a, b) => ({ verde: 0, amarillo: 1, rojo: 2 }[a.light] - { verde: 0, amarillo: 1, rojo: 2 }[b.light]) || b.score - a.score);
}

/** Las más importantes pasan por el debate (solo las 3 primeras, para cuidar el presupuesto). */
export async function debateTop(db, cfg, { k = 3, fetchImpl } = {}) {
  const av = available(db, cfg);
  if (!av.openai && !av.anthropic) { activity(db, { type: 'debate', text: 'Debate semanal en espera: conecta la clave de ChatGPT para activarlo.' }); return []; }
  const top = latestRanking(db).filter(c => c.light !== 'rojo').slice(0, k);
  const res = [];
  for (const card of top) {
    const news = db.prepare('SELECT title, source FROM news WHERE symbols LIKE ? ORDER BY fetched_at DESC LIMIT 5').all(`%"${card.symbol}"%`);
    const d = await runDebate(db, cfg, { symbol: card.symbol, card, context: { price: card.price, sources: card.reasons.map(r => r.factor), news: news.map(n => `${n.title} (${n.source})`) }, fetchImpl });
    db.prepare('UPDATE recommendations SET debate_id = ? WHERE id = ?').run(d.id, card.id);
    activity(db, { agent: 'largo', type: 'debate', important: true, text: `Debate sobre ${card.symbol}: ${d.verdict.title} (${d.verdict.light})` });
    res.push(d);
  }
  return res;
}
