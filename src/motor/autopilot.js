// La cartera de la IA: JARVIS invierte SOLO, con dinero virtual y precios reales, siguiendo sus propias
// recomendaciones del mapa. Está separada de la cartera de cada persona (donde decide la persona).
// Así se puede comparar: lo que haces tú vs lo que hace la IA vs no hacer nada (el mercado).
import { activity, getSetting, setSetting, nowIso } from '../core/db.js';
import { ensureAccount, placeOrder, valuation, ledgerState } from '../stocks/account.js';
import { getQuote, quoteStatus, getBars } from '../stocks/market.js';
import { getBudget, baseAmount } from './sizing.js';
import { round, sd } from '../core/util.js';
import { regimes } from './contexts.js';

export const AI_OWNER = 'jarvis:ia';
const MAX_POSITIONS = 8, STOP_LOSS = -0.08, TRAIL = -0.10, TARGET_VOL = 0.25;

export function aiAccount(db) {
  return ensureAccount(db, { owner: AI_OWNER, name: 'principal', startCash: getBudget(db).usd || 100 });
}
function limitsFor(start) {
  return { minTradeUsd: 1, maxTradeUsd: Math.max(5, round(start * 0.15, 2)), maxPerSymbolPct: 20, minCashPct: 10, maxLossPct: 30 };
}

/** Un paso de la IA: primero vende lo que ya no conviene, después compra lo mejor recomendado. */
export function autopilotStep(db, { now = new Date() } = {}) {
  const acc = aiAccount(db), lim = limitsFor(acc.start_cash), out = { sold: [], bought: [], skipped: [] };
  const entries = new Map(db.prepare('SELECT symbol, zone, light, conv, note FROM map_entries').all().map(r => [r.symbol, r]));
  const priceOf = s => getQuote(db, s)?.price ?? null;
  const say = (text, important = false) => activity(db, { agent: 'ia', type: 'cartera_ia', important, text: `🤖 ${text}` });

  // 1) Ventas
  for (const p of valuation(db, acc.id, priceOf).positions) {
    const e = entries.get(p.symbol);
    let why = null;
    const peak = peakSince(db, acc.id, p.symbol, p.price);
    if (p.pnlPct <= STOP_LOSS) why = `bajó ${Math.round(-p.pnlPct * 100)}% desde que la compré: salgo para cuidar el dinero (regla de seguridad del 8%).`;
    else if (peak && p.pnlPct > 0 && p.price / peak - 1 <= TRAIL) why = `llegó a US$${round(peak)} y bajó ${Math.round((1 - p.price / peak) * 100)}% desde ahí: vendo para asegurar la ganancia (regla del 10% desde el punto más alto).`;
    else if (!e || e.zone === 'no_recomendada' || e.zone === 'descartada' || e.light === 'rojo') why = 'ya no la recomiendo.';
    if (!why) continue;
    const quote = getQuote(db, p.symbol), qs = quoteStatus(quote, now);
    if (!qs.usable) { out.skipped.push({ symbol: p.symbol, why: 'sin precio actual' }); continue; }
    const r = placeOrder(db, { accountId: acc.id, symbol: p.symbol, side: 'sell', qty: p.qty, quote, quoteUsable: qs, reason: `IA vende: ${why}`, limits: lim, now });
    if (r.ok) { out.sold.push(p.symbol); say(`La IA vendió ${p.symbol} a US$${round(r.execPrice)}: ${why} Resultado: ${p.pnl >= 0 ? '+' : ''}US$${round(p.pnl)}.`, true); }
  }

  // 2) Compras: lo recomendado, de mayor a menor conveniencia
  const held = new Set(Object.keys(ledgerState(db, acc.id).positions));
  // No vuelve a comprar algo que vendió en los últimos 7 días (evita comprar y vender lo mismo una y otra vez)
  const cooling = new Set(db.prepare("SELECT DISTINCT symbol FROM trades WHERE account_id = ? AND side = 'sell' AND ts >= ?").all(acc.id, new Date(now.getTime() - 7 * 864e5).toISOString()).map(r => r.symbol));
  const picks = [...entries.values()].filter(e => e.zone === 'recomendada' && e.light === 'verde' && !held.has(e.symbol) && !cooling.has(e.symbol)).sort((a, b) => b.conv - a.conv);
  const mk = marketRegime(db);
  if (mk === 'bajista' && picks.length) { out.skipped.push({ symbol: '*', why: 'mercado bajista' }); out.regime = mk; setSetting(db, 'global', 'ia.lastStep', { at: nowIso(), ...out }); return out; }
  for (const e of picks) {
    if (held.size >= MAX_POSITIONS) break;
    // Monto según el riesgo: las que se mueven mucho reciben menos, las tranquilas un poco más (5% a 15%)
    const vol = annualVol(db, e.symbol), scale = vol ? Math.min(1.5, Math.max(0.5, TARGET_VOL / vol)) : 1;
    const usd = Math.min(round(baseAmount('verde', acc.start_cash, 'equilibrado') * scale, 2), lim.maxTradeUsd);
    const quote = getQuote(db, e.symbol), qs = quoteStatus(quote, now);
    if (!qs.usable) { out.skipped.push({ symbol: e.symbol, why: 'sin precio actual' }); continue; }
    const r = placeOrder(db, { accountId: acc.id, symbol: e.symbol, side: 'buy', usd, quote, quoteUsable: qs, reason: `IA compra: está en "Te recomiendo" (conveniencia ${e.conv}/100)${vol ? `; se mueve ${Math.round(vol * 100)}% al año, por eso pongo ${Math.round(scale * 10)}% del dinero` : ''}.`, limits: lim, now });
    if (r.ok) { held.add(e.symbol); out.bought.push(e.symbol); say(`La IA compró US$${round(r.qty * r.execPrice)} de ${e.symbol}: está en "Te recomiendo" (conveniencia ${e.conv}/100).`, true); }
    else out.skipped.push({ symbol: e.symbol, why: r.reason });
  }
  setSetting(db, 'global', 'ia.lastStep', { at: nowIso(), ...out });
  return out;
}

/** ¿El mercado entero va subiendo o bajando? (SPY contra su promedio de 200 días) */
export function marketRegime(db) {
  const b = getBars(db, 'SPY'); if (b.length < 210) return null;
  const r = regimes(b).get(b.at(-1).ts); return r ? r.trend : null;
}
function annualVol(db, sym) {
  const b = getBars(db, sym).slice(-127); if (b.length < 60) return null;
  return sd(b.slice(1).map((x, i) => x.close / b[i].close - 1)) * Math.sqrt(252);
}
/** El precio más alto desde que compró (cierres diarios + precio de ahora). */
function peakSince(db, accountId, sym, now) {
  const t = db.prepare("SELECT MIN(ts) t FROM trades WHERE account_id = ? AND symbol = ? AND side = 'buy'").get(accountId, sym)?.t; if (!t) return null;
  const m = db.prepare("SELECT MAX(close) m FROM stock_bars WHERE symbol = ? AND interval = '1d' AND ts >= ?").get(sym, t.slice(0, 10))?.m;
  return Math.max(m || 0, now || 0) || null;
}

/** Rendimiento del mercado (SPY) desde una fecha, para comparar. */
function marketSince(db, iso) {
  const b = getBars(db, 'SPY');
  if (!b.length || !iso) return null;
  const a = b.find(x => x.ts >= iso.slice(0, 10)), z = b.at(-1);
  return a && z && a !== z ? z.close / a.close - 1 : 0; // si empezó hoy, todavía 0%
}

export function aiView(db) {
  const acc = aiAccount(db), v = valuation(db, acc.id, s => getQuote(db, s)?.price ?? null);
  const trades = db.prepare('SELECT symbol, side, qty, exec_price, ts, reason FROM trades WHERE account_id = ? ORDER BY ts DESC, id DESC LIMIT 30').all(acc.id);
  return {
    since: acc.created_at, start: acc.start_cash, total: round(v.total, 2), cash: round(v.cash, 2), returnPct: v.returnPct,
    realized: round(v.realized, 2), unrealized: round(v.unrealized, 2),
    positions: v.positions.map(p => ({ symbol: p.symbol, value: round(p.value, 2), pnl: round(p.pnl, 2), pnlPct: p.pnlPct })),
    closed: v.closed.length, trades: trades.map(t => ({ ...t, usd: round(t.qty * t.exec_price, 2) })),
    market: marketSince(db, acc.created_at), last: getSetting(db, 'global', 'ia.lastStep', null),
    rules: [
      'Compra sola lo que está en "Te recomiendo": entre 5% y 15% de su dinero por idea según qué tanto se mueve (menos si es arriesgada), como máximo 8 a la vez.',
      'Si el mercado entero va bajando (SPY por debajo de su promedio de 200 días), no compra nada nuevo y espera.',
      'Vende sola si una deja de estar recomendada, si baja 8% desde que la compró o si, ya ganando, baja 10% desde su punto más alto (asegura la ganancia). Después espera 7 días antes de volver a comprarla.',
      'Siempre deja al menos 10% en efectivo. Solo opera con precios actuales (mercado abierto).',
      'Es dinero virtual: no toca tu cuenta ni tu dinero real.',
    ],
  };
}
