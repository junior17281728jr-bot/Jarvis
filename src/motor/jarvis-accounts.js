// 💼 Las cuentas de JARVIS: su dinero virtual, en qué lo tiene, cuánto ganó o perdió y con cuánto queda.
//  - Bolsa: la cartera que JARVIS maneja solo (empieza con US$100).
//  - Lotería: su número de cada sorteo, con un monedero propio equivalente a US$100 en pesos.
// Todo sale de operaciones y jugadas selladas; nada se calcula "a ojo".
import { valuation, ledgerState } from '../stocks/account.js';
import { getQuote, marketOpen } from '../stocks/market.js';
import { aiAccount } from './autopilot.js';
import { fx } from './insights.js';
import { GAMES } from '../lottery/games.js';
import { round } from '../core/util.js';

const MAX_POSITIONS = 8;

/** Próxima apertura de la bolsa de Nueva York (para decir cuándo empieza a comprar). */
export function nextOpen(now = new Date()) {
  if (marketOpen(now)) return null;
  const t = new Date(Math.ceil(now.getTime() / 9e5) * 9e5);
  for (let i = 0; i < 4 * 24 * 5; i++, t.setTime(t.getTime() + 9e5)) if (marketOpen(t)) return t.toISOString();
  return null;
}

export function jarvisAccounts(db, { now = new Date() } = {}) {
  const rate = fx(db)?.rate || 60;
  // ---------- Bolsa ----------
  const acc = aiAccount(db), v = valuation(db, acc.id, s => getQuote(db, s)?.price ?? null);
  const positions = v.positions.map(p => ({ symbol: p.symbol, qty: round(p.qty, 4), invested: round(p.value - p.pnl, 2), value: round(p.value, 2), pnl: round(p.pnl, 2), pnlPct: round(p.pnlPct * 100, 2), price: p.price }))
    .sort((a, b) => b.value - a.value);
  const firstBuy = Object.fromEntries(db.prepare("SELECT symbol, MIN(ts) t FROM trades WHERE account_id = ? AND side = 'buy' GROUP BY symbol").all(acc.id).map(r => [r.symbol, r.t]));
  positions.forEach(p => { p.since = firstBuy[p.symbol] || null; });
  const closed = v.closed.slice(-20).reverse().map(c => ({ symbol: c.symbol, invested: round(c.entry * c.qty, 2), got: round(c.exit * c.qty, 2), pnl: round(c.pnl, 2), pnlPct: round(c.pnlPct * 100, 2), openedAt: c.openedAt, closedAt: c.closedAt, why: String(c.reason || '').replace(/^IA vende:\s*/, '') }));
  const moves = db.prepare('SELECT ts, side, symbol, qty, exec_price, reason FROM trades WHERE account_id = ? ORDER BY ts DESC, id DESC LIMIT 25').all(acc.id)
    .map(t => ({ at: t.ts, side: t.side, symbol: t.symbol, usd: round(t.qty * t.exec_price, 2), price: round(t.exec_price, 2), why: String(t.reason || '').replace(/^IA (compra|vende):\s*/, '') }));
  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const plan = db.prepare("SELECT symbol, conv FROM map_entries WHERE zone = 'recomendada' AND light = 'verde' ORDER BY conv DESC").all()
    .filter(e => !positions.some(p => p.symbol === e.symbol)).slice(0, Math.max(0, MAX_POSITIONS - positions.length))
    .map(e => ({ symbol: e.symbol, conv: e.conv, usd: round(Math.min(acc.start_cash * 0.10, v.cash - acc.start_cash * 0.10), 2) }));
  const bolsa = {
    since: acc.created_at, start: acc.start_cash, total: round(v.total, 2), cash: round(v.cash, 2), invested: round(invested, 2), valueNow: round(v.positionsValue, 2),
    gain: round(v.total - acc.start_cash, 2), returnPct: round(v.returnPct * 100, 2), realized: round(v.realized, 2), unrealized: round(v.unrealized, 2), fees: round(v.fees || 0, 2),
    positions, closed, moves, wins: v.closed.filter(c => c.pnl > 0).length, losses: v.closed.filter(c => c.pnl <= 0).length,
    marketOpen: marketOpen(now), nextOpen: nextOpen(now), plan: positions.length < MAX_POSITIONS ? plan : [],
    rules: 'Compra sola lo que está en "Te recomiendo" (10% del dinero por idea, máximo 8 a la vez, siempre deja 10% en efectivo). Vende si deja de recomendarla o si baja 8%. Solo opera con la bolsa abierta y precios actuales.',
  };
  // ---------- Lotería (su número de cada sorteo) ----------
  const startRd = Math.round(100 * rate);
  const picks = db.prepare("SELECT payload, outcome, correct, sealed_at FROM predictions WHERE module = 'loteria' ORDER BY sealed_at").all().map(r => ({ ...JSON.parse(r.payload), out: r.outcome ? JSON.parse(r.outcome) : null, correct: r.correct, sealedAt: r.sealed_at }));
  const done = picks.filter(p => p.correct != null), pend = picks.filter(p => p.correct == null);
  const playedRd = picks.reduce((s, p) => s + (p.amountRd || 0), 0), wonRd = done.reduce((s, p) => s + (p.out?.prizeRd || 0), 0);
  const lostRd = done.filter(p => !p.correct).reduce((s, p) => s + (p.amountRd || 0), 0), pendingRd = pend.reduce((s, p) => s + (p.amountRd || 0), 0);
  const byGame = {};
  for (const p of done) { const g = (byGame[p.game] ||= { game: p.game, name: GAMES[p.game]?.name || p.game, plays: 0, hits: 0, playedRd: 0, wonRd: 0 }); g.plays++; g.hits += p.correct ? 1 : 0; g.playedRd += p.amountRd || 0; g.wonRd += p.out?.prizeRd || 0; }
  // ¿Cuándo se habría quedado sin dinero? (sorteo a sorteo)
  let bal = startRd, brokeAt = null;
  for (const p of done) { bal += (p.out?.prizeRd || 0) - (p.amountRd || 0); if (bal < 100 && !brokeAt) brokeAt = p.date; }
  const loteria = {
    rate, startRd, startUsd: 100, playedRd, wonRd, lostRd, pendingRd, leftRd: startRd - playedRd + wonRd, netRd: wonRd - (playedRd - pendingRd),
    plays: picks.length, settled: done.length, hits: done.filter(p => p.correct).length, byGame: Object.values(byGame), brokeAt,
    note: 'Es el dinero de "su número" en cada sorteo (RD$100 por jugada). Aparte, JARVIS prueba 6 métodos para medirlos; esas jugadas de prueba no salen de este monedero.',
  };
  return { rate, bolsa, loteria };
}
