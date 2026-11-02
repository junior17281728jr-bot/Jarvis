// Cuenta virtual: dinero de mentira, precios reales, costes reales y límites de riesgo. Nada toca dinero de verdad.
import { nowIso } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { round } from '../core/util.js';

export const DEFAULT_COSTS = Object.freeze({ commissionUsd: 0, spreadBps: 3, slippageBps: 5 });
// Sin monto fijo: el monto lo decide el análisis; los frenos son % de tu dinero (máx. 40% en una empresa, 10% siempre en efectivo)
export const PERSONAL_LIMITS = Object.freeze({ minTradeUsd: 1, maxTradeUsd: 1e9, maxPerSymbolPct: 40, minCashPct: 10, maxLossPct: 50 });
export const STRATEGY_LIMITS = Object.freeze({ minTradeUsd: 1, maxTradeUsd: 1e9, maxPerSymbolPct: 100, minCashPct: 0, maxLossPct: 50 });

export function ensureAccount(db, { owner, userId = null, name = 'principal', startCash = 100 }) {
  const ex = db.prepare('SELECT * FROM accounts WHERE owner = ? AND name = ?').get(owner, name);
  if (ex) return ex;
  db.prepare('INSERT INTO accounts (owner, user_id, name, start_cash, created_at) VALUES (?, ?, ?, ?, ?)').run(owner, userId, name, startCash, nowIso());
  return db.prepare('SELECT * FROM accounts WHERE owner = ? AND name = ?').get(owner, name);
}

/** Recorre las operaciones en orden: posiciones abiertas, efectivo y cada ganancia o pérdida realizada. */
export function ledgerState(db, accountId) {
  const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  const trades = db.prepare('SELECT * FROM trades WHERE account_id = ? ORDER BY ts, id').all(accountId);
  let cash = acc.start_cash, fees = 0;
  const pos = {}, closed = [];
  for (const t of trades) {
    const p = (pos[t.symbol] ||= { qty: 0, cost: 0, openedAt: t.ts });
    fees += t.fee;
    if (t.side === 'buy') {
      if (p.qty === 0) p.openedAt = t.ts;
      cash -= t.qty * t.exec_price + t.fee; p.qty += t.qty; p.cost += t.qty * t.exec_price + t.fee;
    } else {
      const avg = p.qty ? p.cost / p.qty : 0;
      const proceeds = t.qty * t.exec_price - t.fee;
      cash += proceeds;
      const pnl = proceeds - avg * t.qty;
      closed.push({ tradeId: t.id, symbol: t.symbol, qty: t.qty, entry: avg, exit: t.exec_price, pnl, pnlPct: avg ? pnl / (avg * t.qty) : 0, openedAt: p.openedAt, closedAt: t.ts, strategyId: t.strategy_id, reason: t.reason });
      p.qty -= t.qty; p.cost -= avg * t.qty;
      if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
    }
  }
  for (const s of Object.keys(pos)) if (!pos[s].qty) delete pos[s];
  return { account: acc, cash, positions: pos, closed, fees, trades };
}

export function valuation(db, accountId, priceOf) {
  const st = ledgerState(db, accountId);
  let posValue = 0, unrealized = 0;
  const positions = Object.entries(st.positions).map(([symbol, p]) => {
    const price = priceOf(symbol) ?? p.cost / p.qty;
    const value = p.qty * price;
    posValue += value; unrealized += value - p.cost;
    return { symbol, qty: p.qty, avgCost: p.cost / p.qty, price, value, pnl: value - p.cost, pnlPct: (value - p.cost) / p.cost };
  });
  const realized = st.closed.reduce((s, c) => s + c.pnl, 0);
  const total = st.cash + posValue;
  return { cash: st.cash, positionsValue: posValue, total, start: st.account.start_cash, returnPct: total / st.account.start_cash - 1, realized, unrealized, fees: st.fees, positions, closed: st.closed };
}

export function execPrice(side, observed, costs = DEFAULT_COSTS) {
  const bps = (costs.spreadBps / 2 + costs.slippageBps) / 1e4;
  return side === 'buy' ? observed * (1 + bps) : observed * (1 - bps);
}

/**
 * Orden virtual. Revisa: precio actual y verificable, monto permitido, efectivo, concentración y pérdida máxima.
 * Si algo falla, rechaza y explica el motivo. Si pasa, la sella en el registro antes de guardarla.
 */
export function placeOrder(db, { accountId, symbol, side, usd, qty, quote, reason, strategyId = null, strategyVersion = null, limits = PERSONAL_LIMITS, costs = DEFAULT_COSTS, now = new Date(), requireFresh = true, quoteUsable }) {
  if (!['buy', 'sell'].includes(side)) throw new Error('La operación debe ser compra o venta.');
  if (!quote || !(quote.price > 0)) return reject('No hay un precio verificable para esta acción; la operación queda en espera.');
  if (requireFresh && quoteUsable && !quoteUsable.usable) return reject(`El precio no es actual (${quoteUsable.label}); no se opera con precios viejos.`);
  const st = valuation(db, accountId, s => (s === symbol ? quote.price : null));
  const px = execPrice(side, quote.price, costs);
  // Al comprar por monto se redondea hacia abajo: nunca se pasa del monto pedido
  qty = usd != null && qty == null ? Math.floor((usd / px) * 1e6) / 1e6 : round(qty, 6);
  if (!(qty > 0)) return reject('La cantidad debe ser mayor que cero.');
  const notional = qty * px;
  if (side === 'buy' && st.total <= st.start * (1 - limits.maxLossPct / 100)) return reject(`La cuenta perdió más del ${limits.maxLossPct}% permitido; las compras están pausadas hasta que lo revises.`);
  if (side === 'buy') {
    if (notional < limits.minTradeUsd - 0.01) return reject(`El mínimo por operación es US$${limits.minTradeUsd}.`);
    if (notional > limits.maxTradeUsd + 1e-6) return reject(`El máximo por operación es US$${limits.maxTradeUsd}.`);
    if (notional + costs.commissionUsd > st.cash - st.total * limits.minCashPct / 100 + 1e-9) return reject(`No alcanza el efectivo: hay US$${round(st.cash)} y debe quedar al menos un ${limits.minCashPct}% libre.`);
    const held = st.positions.find(p => p.symbol === symbol)?.value || 0;
    if ((held + notional) / st.total * 100 > limits.maxPerSymbolPct + 1e-9) return reject(`Pasaría del ${limits.maxPerSymbolPct}% de la cuenta en ${symbol}.`);
  } else {
    const held = st.positions.find(p => p.symbol === symbol)?.qty || 0;
    if (qty > held + 1e-9) return reject(`Solo hay ${round(held, 4)} de ${symbol} para vender.`);
  }
  const ts = now.toISOString();
  const payload = { accountId, symbol, side, qty, observedPrice: quote.price, observedAt: quote.as_of ?? quote.asOf, quoteSource: quote.source, execPrice: px, fee: costs.commissionUsd, strategyId, strategyVersion, reason };
  const s = seal(db, { kind: 'operacion_bolsa', ref: `acct:${accountId}`, payload, ts });
  const info = db.prepare(`INSERT INTO trades (account_id, symbol, side, qty, observed_price, observed_at, exec_price, fee, ts, strategy_id, strategy_version, reason, ledger_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(accountId, symbol, side, qty, quote.price, payload.observedAt, px, costs.commissionUsd, ts, strategyId, strategyVersion, reason ?? null, s.hash);
  return { ok: true, tradeId: Number(info.lastInsertRowid), ...payload, hash: s.hash };

  function reject(why) { return { ok: false, reason: why }; }
}
