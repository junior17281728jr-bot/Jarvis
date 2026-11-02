// La cartera de la IA: JARVIS invierte SOLO, con dinero virtual y precios reales, siguiendo sus propias
// recomendaciones del mapa. Está separada de la cartera de cada persona (donde decide la persona).
// Así se puede comparar: lo que haces tú vs lo que hace la IA vs no hacer nada (el mercado).
import { activity, getSetting, setSetting, nowIso } from '../core/db.js';
import { ensureAccount, placeOrder, valuation, ledgerState } from '../stocks/account.js';
import { getQuote, quoteStatus, getBars } from '../stocks/market.js';
import { getBudget, baseAmount } from './sizing.js';
import { round, sd } from '../core/util.js';
import { regimes } from './contexts.js';
import { rememberBuy, contextFor, tradeLessons, judge } from './trade-lessons.js';

export const AI_OWNER = 'jarvis:ia';
const MAX_POSITIONS = 8, STOP_LOSS = -0.08, TRAIL = -0.10, TARGET_VOL = 0.25;

/** ⚙️ Con cuánto dinero trabaja la IA. Cambiarlo NO borra nada: empieza un periodo nuevo y el anterior queda guardado. */
export function aiConfig(db) { return { bolsaUsd: getBudget(db).usd || 100, lotoUsd: 100, n: 1, lotoSince: null, history: [], ...getSetting(db, 'global', 'ia.config', {}) }; }
export function aiAccount(db) {
  const c = aiConfig(db);
  return ensureAccount(db, { owner: AI_OWNER, name: c.n > 1 ? `principal-${c.n}` : 'principal', startCash: c.bolsaUsd });
}
export function setAiMoney(db, { bolsaUsd, lotoUsd } = {}) {
  const c = aiConfig(db), at = nowIso(), b = Number(bolsaUsd), l = Number(lotoUsd);
  if (b > 0 && Math.abs(b - c.bolsaUsd) >= 0.01) {
    const old = aiAccount(db), v = valuation(db, old.id, s => getQuote(db, s)?.price ?? null);
    c.history.push({ at, kind: 'bolsa', from: c.bolsaUsd, to: b, period: c.n, endedWith: Math.round(v.total * 100) / 100 });
    Object.assign(c, { bolsaUsd: b, n: c.n + 1 });
    setSetting(db, 'global', 'ia.peakTotal', b);
    activity(db, { agent: 'ia', type: 'cartera_ia', important: true, text: `⚙️ La IA empieza un periodo nuevo en la bolsa con US$${b} (el anterior terminó con US$${Math.round(v.total * 100) / 100} y queda guardado).` });
  }
  if (l > 0 && Math.abs(l - c.lotoUsd) >= 0.01) {
    c.history.push({ at, kind: 'loteria', from: c.lotoUsd, to: l });
    Object.assign(c, { lotoUsd: l, lotoSince: at });
    setSetting(db, 'global', 'lottery.brokeNoted', false);
    activity(db, { agent: 'loteria', type: 'loteria', important: true, text: `⚙️ El monedero de lotería de la IA empieza de nuevo con US$${l} (lo anterior queda en el historial).` });
  }
  c.history = c.history.slice(-30);
  setSetting(db, 'global', 'ia.config', c);
  return c;
}
function limitsFor(start, total = start) {
  return { minTradeUsd: 1, maxTradeUsd: Math.max(5, round(Math.max(start, total) * 0.30, 2)), maxPerSymbolPct: 30, minCashPct: 10, maxLossPct: 40 };
}

/**
 * 🎯 ¿Cuánto arriesga la IA en una compra? Lo decide ella según qué tan segura está y cuánto tiene AHORA:
 *  - Normal: 8% de la cartera. Segura: 15%. Muy segura: 25%. (Ajustado por lo que se mueve la acción.)
 *  - Nunca más del 30% en una sola empresa y siempre deja 10% en efectivo.
 *  - Cada compra tiene su salida del 8%: aunque salga mal, una compra del 25% le quita como mucho ~2% de la cartera.
 *  - Frenos para no quedar en 0: si baja 20% desde su mejor momento, arriesga la mitad ("modo cuidado");
 *    si pierde 40% de lo que empezó, deja de comprar ("modo defensa") y solo cuida lo que tiene.
 */
export function riskDecision(db, { symbol, conv = 50, total, start, peak, vol = null }) {
  const card = (() => { try { const r = db.prepare('SELECT payload FROM recommendations WHERE symbol = ? ORDER BY id DESC LIMIT 1').get(symbol); return r ? JSON.parse(r.payload) : null; } catch { return null; } })();
  const pb = card?.probBeat ?? null, conf = card?.confidence ?? null;
  let level, pctOf;
  if (conv >= 80 && (pb ?? 0) >= 0.65 && (conf ?? 0) >= 0.75) { level = 'muy segura'; pctOf = 0.25; }
  else if (conv >= 70 && (pb ?? 0) >= 0.6) { level = 'segura'; pctOf = 0.15; }
  else { level = 'normal'; pctOf = 0.08; }
  const scale = vol ? Math.min(1.3, Math.max(0.6, TARGET_VOL / vol)) : 1;
  let mode = 'normal';
  if (total <= start * 0.6) mode = 'defensa';
  else if (peak && total <= peak * 0.8) mode = 'cuidado';
  const final = mode === 'defensa' ? 0 : Math.min(0.30, pctOf * scale * (mode === 'cuidado' ? 0.5 : 1));
  const usd = round(total * final, 2);
  const why = mode === 'defensa'
    ? `No compro: la cartera bajó a US$${round(total)} (perdió 40% o más de los US$${round(start)} con que empezó). Primero cuido lo que queda para no llegar a 0.`
    : `Me siento ${level}${pb != null ? ` (le ganó al mercado ${Math.round(pb * 10)} de cada 10 veces` : ' ('}${conf != null ? `, confianza ${Math.round(conf * 100)}%` : ''}, conveniencia ${conv}/100) → pongo ${Math.round(final * 100)}% de lo que tengo (US$${usd} de US$${round(total)})${vol ? `; se mueve ${Math.round(vol * 100)}% al año` : ''}${mode === 'cuidado' ? '; la mitad de lo normal porque la cartera bajó 20% desde su mejor momento' : ''}.`;
  return { level, mode, pct: final, usd, why, probBeat: pb, confidence: conf };
}

/** Un paso de la IA: primero vende lo que ya no conviene, después compra lo mejor recomendado. */
export function autopilotStep(db, { now = new Date() } = {}) {
  const acc = aiAccount(db), out = { sold: [], bought: [], skipped: [] };
  const priceOf0 = s => getQuote(db, s)?.price ?? null;
  const v0 = valuation(db, acc.id, priceOf0);
  // Su mejor momento (para el freno de "modo cuidado")
  const peakTotal = Math.max(getSetting(db, 'global', 'ia.peakTotal', acc.start_cash), v0.total);
  setSetting(db, 'global', 'ia.peakTotal', round(peakTotal, 2));
  const lim = limitsFor(acc.start_cash, v0.total);
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
  const lessons = tradeLessons(db, [{ id: acc.id, owner: AI_OWNER }]);
  if (mk === 'bajista' && picks.length) { out.skipped.push({ symbol: '*', why: 'mercado bajista' }); out.regime = mk; setSetting(db, 'global', 'ia.lastStep', { at: nowIso(), ...out }); return out; }
  for (const e of picks) {
    if (held.size >= MAX_POSITIONS) break;
    const vNow = valuation(db, acc.id, priceOf0);
    const vol = annualVol(db, e.symbol);
    const d = riskDecision(db, { symbol: e.symbol, conv: e.conv, total: vNow.total, start: acc.start_cash, peak: peakTotal, vol });
    out.mode = d.mode;
    if (d.mode === 'defensa') { out.skipped.push({ symbol: '*', why: d.why }); if (getSetting(db, 'global', 'ia.defenseNoted', null) !== nowIso().slice(0, 10)) { say(d.why, true); setSetting(db, 'global', 'ia.defenseNoted', nowIso().slice(0, 10)); } break; }
    // 📚 Lo que aprendió de sus propias operaciones: si con estas condiciones casi siempre pierde, no compra;
    // si casi siempre gana, pone un poco más (máximo 30% en una empresa)
    const card = (() => { try { const r = db.prepare('SELECT payload FROM recommendations WHERE symbol = ? ORDER BY id DESC LIMIT 1').get(e.symbol); return r ? JSON.parse(r.payload) : null; } catch { return null; } })();
    const ctx = contextFor({ level: d.level, regime: mk, vol, card, light: e.light });
    const L = judge(lessons, ctx);
    if (L.avoid) { out.skipped.push({ symbol: e.symbol, why: L.why }); say(`No compré ${e.symbol}: ${L.why}`); continue; }
    // No puede usar el 10% de reserva: si no alcanza, compra con lo que se puede
    const usd = Math.min(L.boost ? Math.min(d.usd * 1.5, vNow.total * 0.30) : d.usd, round(vNow.cash - vNow.total * 0.10 - 0.05, 2), lim.maxTradeUsd);
    if (usd < 1) { out.skipped.push({ symbol: e.symbol, why: 'sin efectivo libre (guarda 10% de reserva)' }); break; }
    const quote = getQuote(db, e.symbol), qs = quoteStatus(quote, now);
    if (!qs.usable) { out.skipped.push({ symbol: e.symbol, why: 'sin precio actual' }); continue; }
    const r = placeOrder(db, { accountId: acc.id, symbol: e.symbol, side: 'buy', usd, quote, quoteUsable: qs, reason: `IA compra: está en "Te recomiendo". ${d.why}${L.why ? ' ' + L.why : ''}`, limits: lim, now });
    if (r.ok) { held.add(e.symbol); out.bought.push(e.symbol); rememberBuy(db, { owner: AI_OWNER, symbol: e.symbol, ctx }); say(`La IA compró US$${round(r.qty * r.execPrice)} de ${e.symbol}. ${d.why}${L.why ? ' ' + L.why : ''}`, true); }
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
