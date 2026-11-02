import { baseAmount } from './sizing.js';
// Historial y transparencia: cada recomendación (de JARVIS, de cada IA y de loterías) se sella ANTES del
// resultado con su probabilidad, monto, ganancia posible y fuentes; luego se califica. Nada se borra ni se edita.
import { nowIso, getSetting } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { round, wilson, mean } from '../core/util.js';
import { getBars } from '../stocks/market.js';
import { settleMultiplier, DEFAULT_PAYOUTS } from '../lottery/payouts.js';

export const HORIZON = 20; // días de bolsa
export const MARKET_MODULES = ['ranking', 'ia_opinion'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Probabilidad estimada de que la acción le gane al SPY en 20 días de bolsa.
 * Modelo inicial prudente (35%–65%); cuando hay 10+ casos parecidos ya calificados, se ajusta con lo que pasó de verdad.
 */
export function probBeat(db, score) {
  const base = clamp(0.5 + score * 0.25, 0.35, 0.65);
  const rows = db.prepare("SELECT payload, outcome FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL").all()
    .map(r => ({ s: JSON.parse(r.payload).score, beat: JSON.parse(r.outcome).excess > 0 }))
    .filter(r => Math.abs(r.s - score) <= 0.1);
  if (rows.length < 10) return { p: round(base, 3), method: 'modelo', n: rows.length };
  const hits = rows.filter(r => r.beat).length;
  return { p: round((hits + base * 10) / (rows.length + 10), 3), method: 'calibrado', n: rows.length };
}

/**
 * El semáforo nunca contradice lo que pasó de verdad: si ya hay 10+ casos parecidos calificados
 * y JARVIS falló en la mayoría, la recomendación baja (y si acertó en la mayoría, puede subir de rojo a amarillo, salvo polémicas).
 */
export function calibrateLight(card, pb, { polemics = 0 } = {}) {
  if (pb.method !== 'calibrado') return card;
  const pct = Math.round(pb.p * 100), was = card.light;
  let light = was;
  if (pb.p < 0.5 && was !== 'rojo') light = 'rojo';
  else if (pb.p < 0.55 && was === 'verde') light = 'amarillo';
  else if (pb.p >= 0.55 && was === 'rojo' && polemics === 0 && card.score > -0.3) light = 'amarillo';
  if (light === was) return card;
  const text = light === 'rojo' ? `Bajó a rojo por el historial real: en ${pb.n} casos parecidos solo le ganó al mercado el ${pct}% de las veces.`
    : was === 'verde' ? `Bajó a amarillo por el historial real: en ${pb.n} casos parecidos le ganó al mercado el ${pct}% de las veces (no basta para verde).`
    : `Subió a amarillo por el historial real: en ${pb.n} casos parecidos le ganó al mercado el ${pct}% de las veces.`;
  return { ...card, light, lightBefore: was, reasons: [{ factor: 'calibracion', text }, ...card.reasons] };
}

/** Monto sugerido por semáforo, dentro de tus límites (US$5–10). */
export function recommendedAmount(light, { budgetUsd = 100 } = {}) {
  return baseAmount(light, budgetUsd);
}
export function recommendedAmountOld(light, { min = 5, max = 10 } = {}) {
  return light === 'verde' ? max : light === 'amarillo' ? min : 0;
}

/** Datos de inicio para calificar después (cierre de la acción y del SPY ese día). */
export function marketStart(db, symbol, bench = 'SPY') {
  const b = getBars(db, symbol).at(-1), s = getBars(db, bench).at(-1);
  return b && s ? { startDate: b.ts, startClose: b.close, startBench: s.close } : null;
}

/** Sella la opinión de una IA del debate como predicción propia, para comparar IA contra IA. */
export function sealOpinion(db, { agent, provider, symbol, stance, prob, argument, debateId = null, date = nowIso().slice(0, 10) }) {
  const start = marketStart(db, symbol);
  if (!start) return null;
  const subject = `ia:${agent}:${symbol}:${date}`;
  if (db.prepare('SELECT 1 FROM predictions WHERE subject = ?').get(subject)) return null;
  const pBeat = Number.isFinite(prob) ? clamp(prob, 0.01, 0.99) : stance === 'comprar' ? 0.6 : stance === 'no_comprar' ? 0.4 : 0.5;
  const claimBeat = stance === 'comprar' || (stance !== 'no_comprar' && pBeat > 0.5);
  const payload = { symbol, agent, provider, stance, probBeat: pBeat, claimBeat, amountUsd: stance === 'comprar' ? 10 : 0, argument: String(argument || '').slice(0, 300), debateId, ...start,
    claim: `${symbol} ${claimBeat ? '' : 'NO '}le ganará al SPY en ${HORIZON} días de bolsa` };
  const s = seal(db, { kind: 'opinion_ia', ref: subject, payload });
  db.prepare('INSERT INTO predictions (module, agent, subject, payload, prob, sealed_at, ledger_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('ia_opinion', agent, subject, JSON.stringify(payload), claimBeat ? pBeat : 1 - pBeat, s.ts, s.hash);
  return payload;
}

/** Califica recomendaciones de bolsa (de JARVIS y de cada IA) cuyo plazo ya pasó. */
export function resolveMarketPredictions(db, bench = 'SPY') {
  const pend = db.prepare(`SELECT * FROM predictions WHERE module IN ('ranking','ia_opinion') AND correct IS NULL`).all();
  const bb = getBars(db, bench), cache = new Map();
  let n = 0;
  for (const p of pend) {
    const pl = JSON.parse(p.payload);
    const bars = cache.get(pl.symbol) || cache.set(pl.symbol, getBars(db, pl.symbol)).get(pl.symbol);
    const i = bars.findIndex(b => b.ts === pl.startDate), j = bb.findIndex(b => b.ts === pl.startDate);
    if (i < 0 || j < 0 || bars.length <= i + HORIZON || bb.length <= j + HORIZON) continue;
    const r = bars[i + HORIZON].close / pl.startClose - 1, rb = bb[j + HORIZON].close / pl.startBench - 1;
    const beat = r > rb;
    const claimBeat = pl.claimBeat ?? pl.light !== 'rojo';
    const amount = pl.amountUsd ?? (claimBeat ? 10 : 0);
    const outcome = { ret: r, bench: rb, excess: r - rb, beat, endDate: bars[i + HORIZON].ts, endClose: bars[i + HORIZON].close, pnlUsd: round(amount * r, 2) };
    db.prepare('UPDATE predictions SET resolved_at = ?, outcome = ?, correct = ? WHERE id = ?').run(nowIso(), JSON.stringify(outcome), claimBeat === beat ? 1 : 0, p.id);
    // Pago por votar bien: +1 moneda si acertó, −1 si falló (así adivinar no da monedas). Solo si el voto se selló antes de empezar.
    if (p.module === 'ranking') {
      const fair = p.sealed_at.slice(0, 10) <= pl.startDate || p.sealed_at.slice(0, 10) <= (bars[i + 1]?.ts || pl.startDate);
      const ok = claimBeat === beat;
      if (!fair) db.prepare('INSERT INTO cheat_reports (ts, agent, strategy_id, ref, rule, explanation, coins_removed) VALUES (?, ?, ?, ?, ?, ?, 0)').run(nowIso(), p.agent || 'largo', null, `pred:${p.id}`, 'voto_tardio', `El voto sobre ${pl.symbol} se selló después de que empezó a contar: no recibe monedas.`);
      else db.prepare('INSERT INTO coins (ts, agent, strategy_id, amount, reason, ref) VALUES (?, ?, ?, ?, ?, ?)').run(nowIso(), 'largo', null, ok ? 1 : -1, `${ok ? 'Acertó' : 'Falló'} su voto sobre ${pl.symbol}: dijo "${claimBeat ? 'le gana al mercado' : 'no le gana'}" y ${beat ? 'le ganó' : 'no le ganó'} (${round(r * 100, 1)}% contra ${round(rb * 100, 1)}%).`, `pred:${p.id}`);
    }
    n++;
  }
  return n;
}

// ---------- Loterías ----------
const P_ANY = 1 - 0.99 ** 3; // probabilidad exacta de que un número salga en alguna de las 3 posiciones

export function sealLotteryPick(db, pick, { stake = 10 } = {}) {
  const subject = `loteria:${pick.game}:${pick.date}`;
  if (db.prepare('SELECT 1 FROM predictions WHERE subject = ?').get(subject)) return null;
  const P = getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS);
  const payload = { game: pick.game, date: pick.date, numbers: pick.numbers, kind: 'quiniela', method: pick.method, why: pick.why, amountRd: stake,
    potentialRd: stake * P.q[0], probHit: round(P_ANY, 4), claim: `El ${pick.numbers[0]} sale en el sorteo`, payouts: P };
  const s = seal(db, { kind: 'recomendacion_loteria', ref: subject, payload });
  db.prepare('INSERT INTO predictions (module, agent, subject, payload, prob, sealed_at, ledger_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('loteria', 'loteria', subject, JSON.stringify(payload), P_ANY, s.ts, s.hash);
  return payload;
}

export function resolveLotteryPicks(db) {
  const pend = db.prepare("SELECT * FROM predictions WHERE module = 'loteria' AND correct IS NULL").all();
  let n = 0;
  for (const p of pend) {
    const pl = JSON.parse(p.payload);
    const d = db.prepare("SELECT nums, status FROM lottery_draws WHERE game = ? AND date = ? AND nums IS NOT NULL").get(pl.game, pl.date);
    if (!d) continue;
    const draw = JSON.parse(d.nums);
    const prize = settleMultiplier('quiniela', pl.numbers, draw, pl.payouts || DEFAULT_PAYOUTS) * pl.amountRd;
    db.prepare('UPDATE predictions SET resolved_at = ?, outcome = ?, correct = ? WHERE id = ?')
      .run(nowIso(), JSON.stringify({ draw, drawStatus: d.status, prizeRd: prize, pnlRd: prize - pl.amountRd }), prize > 0 ? 1 : 0, p.id);
    n++;
  }
  return n;
}

// ---------- Estadísticas ----------
function moneyOf(module, pl, out) {
  if (!out) return { staked: 0, pnl: 0 };
  if (module === 'loteria') return { staked: pl.amountRd, pnl: out.pnlRd };
  const amt = pl.amountUsd ?? (pl.claimBeat ?? pl.light !== 'rojo' ? 10 : 0);
  return { staked: amt, pnl: out.pnlUsd ?? amt * out.ret };
}

export function summarize(rows, module) {
  const done = rows.filter(r => r.correct !== null);
  const hits = done.filter(r => r.correct === 1).length;
  let staked = 0, won = 0, lost = 0;
  const byMonth = new Map(), curve = [];
  // Se agrupa por el día en que se conoció el resultado real (fin del plazo o fecha del sorteo)
  const when = r => { const o = JSON.parse(r.outcome || 'null'), pl = JSON.parse(r.payload); return String(o?.endDate || pl.date || r.resolved_at).slice(0, 10); };
  const chrono = done.slice().sort((a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : a.id - b.id));
  for (const r of chrono) {
    const m = moneyOf(module, JSON.parse(r.payload), JSON.parse(r.outcome));
    staked += m.staked; if (m.pnl >= 0) won += m.pnl; else lost += -m.pnl;
    const d = when(r), k = d.slice(0, 7);
    byMonth.set(k, round((byMonth.get(k) || 0) + m.pnl, 2));
    if (curve.length && curve.at(-1)[0] === d) curve.at(-1)[1] = round(won - lost, 2); else curve.push([d, round(won - lost, 2)]);
  }
  const brier = done.length ? mean(done.map(r => (r.prob - r.correct) ** 2)) : null;
  const months = [...byMonth].map(([month, net]) => ({ month, net }));
  const w = wilson(hits, done.length);
  let run = 0, type = null, bestW = 0, bestL = 0;
  for (const r of chrono) { const k = r.correct ? 'w' : 'l'; run = k === type ? run + 1 : 1; type = k; if (k === 'w') bestW = Math.max(bestW, run); else bestL = Math.max(bestL, run); }
  return {
    total: rows.length, resolved: done.length, pending: rows.length - done.length, hits, misses: done.length - hits,
    hitRate: done.length ? round(hits / done.length * 100, 1) : null, range: done.length ? [round(w.lo * 100), round(w.hi * 100)] : null,
    staked: round(staked, 2), won: round(won, 2), lost: round(lost, 2), net: round(won - lost, 2),
    brier: brier == null ? null : round(brier, 3), avgProb: done.length ? round(mean(done.map(r => r.prob)) * 100, 1) : null,
    best: months.length ? months.reduce((a, b) => (b.net > a.net ? b : a)) : null, worst: months.length ? months.reduce((a, b) => (b.net < a.net ? b : a)) : null,
    months, curve, streak: { current: run, type: type === 'w' ? 'acierto' : type === 'l' ? 'fallo' : null, bestHits: bestW, bestMisses: bestL },
  };
}

const AGENT_LABEL = { jarvis: 'JARVIS (ranking)', gpt: 'GPT', claude: 'Claude', local: 'Modelo gratis', loteria: 'Estadístico de loterías' };
export const agentLabel = a => AGENT_LABEL[a] || a;

/** Comparación entre IA: quién acierta más, quién calcula mejor la probabilidad (Brier), quién gana más. */
export function compareAgents(db) {
  const out = [];
  const rank = db.prepare("SELECT * FROM predictions WHERE module = 'ranking'").all();
  out.push({ agent: 'jarvis', label: agentLabel('jarvis'), ...summarize(rank, 'ranking') });
  const ia = db.prepare("SELECT * FROM predictions WHERE module = 'ia_opinion'").all();
  for (const a of [...new Set(ia.map(r => r.agent))]) out.push({ agent: a, label: agentLabel(a), ...summarize(ia.filter(r => r.agent === a), 'ia_opinion') });
  // Agentes de estrategia: su dinero virtual en prueba en vivo
  for (const ag of db.prepare("SELECT id, name FROM agents WHERE role = 'bolsa'").all()) {
    const trades = db.prepare(`SELECT COUNT(*) n FROM trades t JOIN strategies s ON s.id = t.strategy_id WHERE s.agent = ? AND t.side = 'sell'`).get(ag.id).n;
    const coins = db.prepare('SELECT COALESCE(SUM(amount),0) c FROM coins WHERE agent = ? AND revoked = 0').get(ag.id).c;
    const cheats = db.prepare('SELECT COUNT(*) n FROM cheat_reports WHERE agent = ?').get(ag.id).n;
    out.push({ agent: ag.id, label: ag.name, kind: 'estrategia', closedTrades: trades, coins: round(coins, 2), cheats });
  }
  const rated = out.filter(r => r.resolved >= 1);
  const pick = (f, better) => rated.length ? rated.reduce((a, b) => (better(f(b), f(a)) ? b : a)) : null;
  const leaders = rated.length ? {
    masAciertos: pick(r => r.hitRate ?? -1, (x, y) => x > y)?.label,
    mejorProbabilidad: pick(r => r.brier ?? 9, (x, y) => x < y)?.label,
    masGanancia: pick(r => r.net, (x, y) => x > y)?.label,
    masErrores: pick(r => (r.resolved ? r.misses / r.resolved : -1), (x, y) => x > y)?.label,
  } : null;
  return { agents: out, leaders, note: rated.some(r => r.resolved < 20) ? 'Con menos de 20 casos por IA, las diferencias pueden ser suerte.' : null };
}

/** Lista completa (sin filtros ocultos): cada registro con lo que dijo, por qué, monto, probabilidad, fuentes y resultado. */
export function historyList(db, { module = null, limit = 300 } = {}) {
  return db.prepare(`SELECT * FROM predictions WHERE module IN ('ranking','ia_opinion','loteria') AND (? IS NULL OR module = ?) ORDER BY sealed_at DESC, id DESC LIMIT ?`).all(module, module, limit)
    .map(r => {
      const pl = JSON.parse(r.payload), out = r.outcome ? JSON.parse(r.outcome) : null;
      const m = moneyOf(r.module, pl, out);
      return { id: r.id, module: r.module, agent: r.module === 'ranking' ? 'jarvis' : r.agent, agentLabel: agentLabel(r.module === 'ranking' ? 'jarvis' : r.agent), sealedAt: r.sealed_at, hash: r.ledger_hash,
        subject: pl.symbol || `${pl.game} ${pl.date}`, claim: pl.claim, prob: r.prob, light: pl.light, stance: pl.stance, why: pl.why || pl.reasons || pl.argument || null,
        amount: r.module === 'loteria' ? { value: pl.amountRd, cur: 'RD$' } : { value: pl.amountUsd ?? null, cur: 'US$' },
        potential: pl.potentialUsd ?? pl.potentialRd ?? null, sources: pl.sources || null,
        dataDate: String(pl.startDate || pl.date || r.sealed_at).slice(0, 10),
        others: r.module === 'ranking' ? db.prepare("SELECT agent, payload, correct FROM predictions WHERE module = 'ia_opinion' AND subject LIKE ?").all(`ia:%:${pl.symbol}:${r.subject.split(':')[2] || r.sealed_at.slice(0, 10)}`)
          .map(o => { const op = JSON.parse(o.payload); return { agent: agentLabel(o.agent), stance: op.stance, probBeat: op.probBeat, argument: op.argument, correct: o.correct }; }) : null,
        status: r.correct == null ? 'pendiente' : r.correct ? 'acerto' : 'fallo', outcome: out, pnl: out ? round(m.pnl, 2) : null, resolvedAt: r.resolved_at };
    });
}

export function performance(db) {
  const by = mod => summarize(db.prepare('SELECT * FROM predictions WHERE module = ?').all(mod), mod);
  return { bolsa: by('ranking'), loterias: by('loteria'), ia: compareAgents(db), real: realSummary(db) };
}

// ---------- Apuestas e inversiones REALES (las registras tú; JARVIS nunca ejecuta nada) ----------
export function addReal(db, userId, { module, symbol, amountUsd, price, game, kind = 'quiniela', numbers, stakeRd, date, predictionId = null, note = '' }) {
  let detail;
  if (module === 'bolsa') {
    if (!/^[A-Z.\-]{1,10}$/.test(String(symbol || ''))) throw new Error('Símbolo no válido.');
    if (!(amountUsd > 0 && price > 0)) throw new Error('Pon el monto y el precio de compra.');
    detail = { symbol, amountUsd, price, qty: amountUsd / price };
  } else if (module === 'loteria') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !Array.isArray(numbers) || !numbers.every(n => /^\d{2}$/.test(n)) || !(stakeRd > 0)) throw new Error('Pon la fecha del sorteo, los números (00–99) y el monto.');
    detail = { game, kind, numbers, stakeRd, date };
  } else throw new Error('Tipo no válido.');
  const payload = { module, ...detail, predictionId, note: String(note).slice(0, 200) };
  const s = seal(db, { kind: 'registro_real', ref: `user:${userId}`, userId, payload });
  const info = db.prepare('INSERT INTO real_entries (user_id, ts, module, detail, prediction_id, note, ledger_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, s.ts, module, JSON.stringify(detail), predictionId, payload.note, s.hash);
  return { id: Number(info.lastInsertRowid), ...payload };
}
export function closeReal(db, userId, id, { sellPrice }) {
  const r = db.prepare('SELECT * FROM real_entries WHERE id = ? AND user_id = ?').get(id, userId);
  if (!r || r.module !== 'bolsa' || r.status !== 'abierta') throw new Error('No se encontró esa inversión abierta.');
  const d = JSON.parse(r.detail);
  if (!(sellPrice > 0)) throw new Error('Pon el precio de venta.');
  const pnl = round(d.qty * sellPrice - d.amountUsd, 2);
  seal(db, { kind: 'cierre_real', ref: `real:${id}`, userId, payload: { id, sellPrice, pnl } });
  db.prepare("UPDATE real_entries SET status = 'cerrada', result = ?, closed_at = ? WHERE id = ?").run(pnl, nowIso(), id);
  return { id, pnl };
}
export function settleRealLottery(db) {
  let n = 0;
  for (const r of db.prepare("SELECT * FROM real_entries WHERE module = 'loteria' AND status = 'abierta'").all()) {
    const d = JSON.parse(r.detail);
    const draw = db.prepare('SELECT nums FROM lottery_draws WHERE game = ? AND date = ? AND nums IS NOT NULL').get(d.game, d.date);
    if (!draw) continue;
    const P = getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS);
    const prize = settleMultiplier(d.kind, d.numbers, JSON.parse(draw.nums), P) * d.stakeRd;
    db.prepare("UPDATE real_entries SET status = 'cerrada', result = ?, closed_at = ? WHERE id = ?").run(prize - d.stakeRd, nowIso(), r.id);
    n++;
  }
  return n;
}
export function realSummary(db, userId = null) {
  const rows = db.prepare('SELECT * FROM real_entries WHERE (? IS NULL OR user_id = ?) ORDER BY ts DESC').all(userId, userId).map(r => ({ ...r, detail: JSON.parse(r.detail) }));
  const sum = mod => { const x = rows.filter(r => r.module === mod), c = x.filter(r => r.status === 'cerrada');
    return { count: x.length, open: x.length - c.length, closed: c.length, wins: c.filter(r => r.result > 0).length, net: round(c.reduce((s, r) => s + r.result, 0), 2),
      staked: round(x.reduce((s, r) => s + (r.detail.amountUsd ?? r.detail.stakeRd ?? 0), 0), 2), followed: x.filter(r => r.prediction_id).length }; };
  return { bolsa: sum('bolsa'), loterias: sum('loteria'), rows };
}
