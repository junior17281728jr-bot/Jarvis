// 📈 Estadísticas de una cuenta: cómo subió y bajó día a día, y en qué empresa ganó o perdió.
// Se reconstruye repitiendo las operaciones selladas con los precios de cierre de cada día (nada inventado).
import { getBars, getQuote } from '../stocks/market.js';
import { valuation } from '../stocks/account.js';
import { round } from '../core/util.js';

export function equityCurve(db, accountId, startCash, fromIso) {
  const trades = db.prepare('SELECT ts, side, symbol, qty, exec_price, fee FROM trades WHERE account_id = ? ORDER BY ts, id').all(accountId);
  const from = (fromIso || trades[0]?.ts || new Date().toISOString()).slice(0, 10);
  const days = getBars(db, 'SPY').map(b => b.ts).filter(d => d >= from);
  const closes = new Map();
  const closeOn = (sym, d) => { if (!closes.has(sym)) closes.set(sym, getBars(db, sym)); const b = closes.get(sym); let v = null; for (const x of b) { if (x.ts > d) break; v = x.close; } return v; };
  let cash = startCash, i = 0; const hold = {}, out = [];
  for (const d of days) {
    while (i < trades.length && trades[i].ts.slice(0, 10) <= d) {
      const t = trades[i++], amt = t.qty * t.exec_price;
      if (t.side === 'buy') { cash -= amt + (t.fee || 0); hold[t.symbol] = (hold[t.symbol] || 0) + t.qty; }
      else { cash += amt - (t.fee || 0); hold[t.symbol] = (hold[t.symbol] || 0) - t.qty; }
    }
    let v = cash; for (const [s, q] of Object.entries(hold)) if (q > 1e-9) v += q * (closeOn(s, d) ?? 0);
    out.push([d, round(v, 2)]);
  }
  // El valor de AHORA (con el precio de este momento) como último punto
  const now = valuation(db, accountId, s => getQuote(db, s)?.price ?? null).total, today = new Date().toISOString().slice(0, 10);
  if (!out.length || out.at(-1)[0] < today) out.push([today, round(now, 2)]); else out[out.length - 1][1] = round(now, 2);
  return out;
}

/** Por empresa: cuánto ganó o perdió (ya vendido y sin vender), cuántas veces ganó y perdió. */
export function byStock(db, accountId) {
  const v = valuation(db, accountId, s => getQuote(db, s)?.price ?? null), m = new Map();
  const g = s => m.get(s) || m.set(s, { symbol: s, realized: 0, unrealized: 0, wins: 0, losses: 0, open: false }).get(s);
  for (const c of v.closed) { const x = g(c.symbol); x.realized += c.pnl; if (c.pnl > 0) x.wins++; else x.losses++; }
  for (const p of v.positions) { const x = g(p.symbol); x.unrealized += p.pnl; x.open = true; }
  return [...m.values()].map(x => ({ ...x, realized: round(x.realized, 2), unrealized: round(x.unrealized, 2), total: round(x.realized + x.unrealized, 2) })).sort((a, b) => b.total - a.total);
}

/** Lo mejor y lo peor: el día que más subió y el que más bajó. */
export function bestWorst(curve) {
  let best = null, worst = null;
  for (let i = 1; i < curve.length; i++) { const ch = curve[i][1] - curve[i - 1][1]; if (!best || ch > best.change) best = { date: curve[i][0], change: round(ch, 2) }; if (!worst || ch < worst.change) worst = { date: curve[i][0], change: round(ch, 2) }; }
  return { best, worst };
}
