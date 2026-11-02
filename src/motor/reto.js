// 🎯 El Reto de la IA: una cuenta virtual APARTE con una meta de ganancia y un plazo (por defecto: de US$100 a
// US$1,500 en 30 días). La IA mide cada hora si va al día o atrasada y, según la presión, arriesga más o menos.
// Está separada de "Dinero de la IA" para no dañar la medición honesta de si JARVIS acierta.
// Nunca inventa: usa precios reales, y calcula con simulaciones la chance real de lograr la meta.
import { activity, getSetting, setSetting, nowIso } from '../core/db.js';
import { ensureAccount, placeOrder, valuation, ledgerState } from '../stocks/account.js';
import { getQuote, quoteStatus, getBars, marketOpen } from '../stocks/market.js';
import { project } from '../stocks/advice.js';
import { round } from '../core/util.js';
import { equityCurve, byStock, bestWorst } from './account-stats.js';

export const RETO_OWNER = 'jarvis:reto';
const DEF = { startUsd: 100, goalUsd: 1500, days: 30 };
const LIMITS = { minTradeUsd: 1, maxTradeUsd: 1e9, maxPerSymbolPct: 50, minCashPct: 5, maxLossPct: 60 };
const STOP = -0.12, TRAIL = -0.10, FLOOR = 0.4; // nunca deja que la cuenta baje del 40% de lo que empezó

export function retoConfig(db) { return { ...DEF, n: 1, startedAt: null, ...getSetting(db, 'global', 'reto', {}) }; }
export function retoAccount(db) { const c = retoConfig(db); return ensureAccount(db, { owner: RETO_OWNER, name: `reto-${c.n}`, startCash: c.startUsd }); }

/** Cambia la meta o empieza un reto nuevo (cuenta nueva, la vieja queda en el historial). */
export function setReto(db, { goalUsd, days, startUsd, restart = false } = {}) {
  const c = retoConfig(db);
  const next = { ...c, goalUsd: Number(goalUsd) > 0 ? Number(goalUsd) : c.goalUsd, days: Number(days) > 0 ? Math.min(365, Number(days)) : c.days };
  if (restart) Object.assign(next, { n: c.n + 1, startUsd: Number(startUsd) > 0 ? Number(startUsd) : c.startUsd, startedAt: nowIso() });
  if (!next.startedAt) next.startedAt = nowIso();
  setSetting(db, 'global', 'reto', next);
  return retoView(db);
}

/** Cuánto le falta, cuánto tiene que ganar por día y qué tan presionada está. */
export function retoPace(db, now = new Date()) {
  const c = retoConfig(db), acc = retoAccount(db);
  const v = valuation(db, acc.id, s => getQuote(db, s)?.price ?? null);
  const started = Date.parse(c.startedAt || acc.created_at), end = started + c.days * 864e5;
  const daysLeft = Math.max(0, (end - now.getTime()) / 864e5), tradingLeft = Math.max(1, Math.round(daysLeft * 5 / 7));
  const needed = v.total > 0 ? Math.pow(c.goalUsd / v.total, 1 / tradingLeft) - 1 : null; // ganancia necesaria por día de bolsa
  const elapsed = Math.max(0, (now.getTime() - started) / (end - started));
  const shouldHave = c.startUsd * Math.pow(c.goalUsd / c.startUsd, Math.min(1, elapsed)); // dónde debería ir hoy
  const behind = v.total < shouldHave * 0.97;
  const level = v.total >= c.goalUsd ? 'lograda' : daysLeft <= 0 ? 'terminada' : v.total <= c.startUsd * FLOOR ? 'defensa' : needed > 0.08 ? 'maxima' : needed > 0.03 ? 'alta' : behind ? 'media' : 'baja';
  return { ...c, total: round(v.total, 2), cash: round(v.cash, 2), daysLeft: round(daysLeft, 1), tradingLeft, needed: needed == null ? null : round(needed * 100, 2), shouldHave: round(shouldHave, 2), behind, level, accountId: acc.id };
}

const PRESSURE_TXT = { baja: '🟢 Va al día', media: '🟡 Un poco atrasada', alta: '🟠 Muy presionada', maxima: '🔴 Presión máxima', defensa: '🛡️ Defensa: cuida lo que queda', lograda: '🏆 ¡Meta lograda!', terminada: '⏹️ Se acabó el plazo' };

/** Un paso del reto (cada hora con la bolsa abierta). */
export function retoStep(db, { now = new Date() } = {}) {
  const P = retoPace(db, now), out = { sold: [], bought: [], level: P.level };
  if (!retoConfig(db).startedAt) setReto(db, {});
  const say = t => activity(db, { agent: 'ia', type: 'reto', important: true, text: `🎯 Reto: ${t}` });
  const priceOf = s => getQuote(db, s)?.price ?? null;
  const usable = s => { const q = getQuote(db, s); return quoteStatus(q, now).usable ? q : null; };
  // 1) Ventas: salida de seguridad, asegurar ganancia, o si ya se logró/terminó la meta
  for (const p of valuation(db, P.accountId, priceOf).positions) {
    const peak = Math.max(p.price, ...getBars(db, p.symbol).filter(b => b.ts >= (db.prepare("SELECT MIN(ts) t FROM trades WHERE account_id = ? AND symbol = ? AND side = 'buy'").get(P.accountId, p.symbol)?.t || '').slice(0, 10)).map(b => b.close));
    let why = null;
    if (P.level === 'lograda') why = '¡llegó a la meta! Vendo todo y aseguro la ganancia.';
    else if (P.level === 'terminada') why = 'se acabó el plazo del reto: cierro todo para ver el resultado final.';
    else if (p.pnlPct <= STOP) why = `bajó ${Math.round(-p.pnlPct * 100)}% desde la compra: salgo (regla del 12%) para no hundir la cuenta.`;
    else if (p.pnlPct > 0.05 && p.price / peak - 1 <= TRAIL) why = `subió y luego bajó ${Math.round((1 - p.price / peak) * 100)}% desde su mejor precio: vendo y aseguro la ganancia.`;
    if (!why) continue;
    const q = usable(p.symbol); if (!q) continue;
    const r = placeOrder(db, { accountId: P.accountId, symbol: p.symbol, side: 'sell', qty: p.qty, quote: q, quoteUsable: { usable: true }, reason: `Reto vende: ${why}`, limits: LIMITS, now });
    if (r.ok) { out.sold.push(p.symbol); say(`vendí ${p.symbol}: ${why} Resultado: ${p.pnl >= 0 ? '+' : ''}US$${round(p.pnl)}.`); }
  }
  if (['lograda', 'terminada', 'defensa'].includes(P.level)) { if (P.level === 'defensa') say(`la cuenta bajó a US$${P.total}: no compro más para no llegar a 0.`); setSetting(db, 'global', 'reto.last', { at: nowIso(), ...out, why: PRESSURE_TXT[P.level] }); return out; }
  // 2) Compras: la presión decide cuántas empresas y cuánto en cada una
  const held = new Set(Object.keys(ledgerState(db, P.accountId).positions));
  const maxPos = P.level === 'maxima' ? 2 : P.level === 'alta' ? 2 : 3;
  if (held.size >= maxPos) { setSetting(db, 'global', 'reto.last', { at: nowIso(), ...out, why: `Tiene ${held.size} empresas; espera a vender alguna.` }); return out; }
  // Candidatas: todo lo que no está en rojo. Con presión alta busca las que MÁS pueden subir en el plazo que queda.
  const days = Math.max(5, P.tradingLeft), target = (Math.pow(1 + (P.needed || 0) / 100, days) - 1) * 100;
  const cands = db.prepare("SELECT symbol, conv, light FROM map_entries WHERE light != 'rojo' AND zone IN ('recomendada','observacion','candidata')").all()
    .filter(e => !held.has(e.symbol) && usable(e.symbol))
    .map(e => { const pr = project(getBars(db, e.symbol), 100, { days, sims: 600, target }); return pr && { ...e, med: pr.probable, good: pr.good, loss: pr.lossChance, pGoal: pr.pTarget }; })
    .filter(Boolean)
    .sort((a, b) => (['alta', 'maxima'].includes(P.level) ? b.good - a.good : b.med - a.med) || b.conv - a.conv);
  const share = P.level === 'maxima' ? 0.45 : P.level === 'alta' ? 0.40 : 0.30;
  for (const c of cands.slice(0, maxPos - held.size)) {
    const v = valuation(db, P.accountId, priceOf), usd = round(Math.min(v.total * share, v.cash - v.total * 0.05 - 0.05), 2);
    if (usd < 1) break;
    const why = `${PRESSURE_TXT[P.level]}: necesito +${P.needed}% por día y voy en US$${P.total} (debería ir en US$${P.shouldHave}). ` +
      (['alta', 'maxima'].includes(P.level) ? `Elijo ${c.symbol} porque es de las que MÁS pueden subir en ${days} días (en un buen caso +${round(c.good)}%), aunque se arriesga más (pierde ${Math.round(c.loss * 100)}% de las veces).`
        : `Elijo ${c.symbol} porque es de las que mejor ganancia probable tiene en ${days} días (+${round(c.med)}%).`) + ` Pongo ${Math.round(share * 100)}% de la cuenta.`;
    const r = placeOrder(db, { accountId: P.accountId, symbol: c.symbol, side: 'buy', usd, quote: getQuote(db, c.symbol), quoteUsable: { usable: true }, reason: `Reto compra: ${why}`, limits: LIMITS, now });
    if (r.ok) { out.bought.push(c.symbol); say(`compré US$${round(r.qty * r.execPrice)} de ${c.symbol}. ${why}`); }
  }
  setSetting(db, 'global', 'reto.last', { at: nowIso(), ...out, why: out.bought.length ? null : 'No encontró una compra que valga la pena con precio actual.' });
  return out;
}

/** Todo lo que muestra la pantalla del reto, con la chance real de lograrlo. */
export function retoView(db, { now = new Date() } = {}) {
  const P = retoPace(db, now);
  const v = valuation(db, P.accountId, s => getQuote(db, s)?.price ?? null);
  // Chance real: simulación con las empresas que tiene (o la mejor candidata) para el tiempo que queda
  let chance = null;
  try {
    const syms = v.positions.length ? v.positions.map(p => p.symbol) : db.prepare("SELECT symbol FROM map_entries WHERE light != 'rojo' ORDER BY conv DESC LIMIT 1").all().map(r => r.symbol);
    const need = (P.goalUsd / Math.max(0.01, P.total) - 1) * 100;
    // 2,000 caminos posibles por empresa, repitiendo al azar subidas y bajadas DIARIAS que de verdad tuvo (últimos 3 años)
    const ps = syms.map(s => project(getBars(db, s), 100, { days: Math.max(1, P.tradingLeft), sims: 2000, target: need })?.pTarget).filter(x => x != null);
    if (ps.length) { const best = Math.max(...ps); chance = round(best * 100, 2); var simHits = Math.round(best * 2000), simN = 2000, simSyms = syms; }
    // ¿Qué SÍ es realista con lo que tiene y el tiempo que queda? (lo más probable, 1 de cada 4 y 1 de cada 10 veces)
    var realistic = syms.map(sy => { const pr = project(getBars(db, sy), 100, { days: Math.max(1, P.tradingLeft), sims: 2000 }); return pr && { symbol: sy, probable: pr.probable, good: pr.good, bad: pr.bad }; }).filter(Boolean)
      .reduce((a, b) => (!a || b.good > a.good ? b : a), null);
    if (realistic) realistic = { probable: round(P.total * (1 + realistic.probable / 100), 2), good: round(P.total * (1 + realistic.good / 100), 2), bad: round(P.total * (1 + realistic.bad / 100), 2), days: P.tradingLeft };
  } catch { /* sin datos */ }
  const moves = db.prepare('SELECT ts, side, symbol, qty, exec_price, reason FROM trades WHERE account_id = ? ORDER BY ts DESC, id DESC LIMIT 15').all(P.accountId)
    .map(t => ({ at: t.ts, side: t.side, symbol: t.symbol, usd: round(t.qty * t.exec_price, 2), why: String(t.reason || '').replace(/^Reto (compra|vende):\s*/, '') }));
  // 📈 Cómo ha ido contra la meta: su dinero día a día y dónde debería ir cada día para llegar
  const curve = equityCurve(db, P.accountId, P.startUsd, P.startedAt);
  const t0 = Date.parse(P.startedAt || new Date().toISOString()), span = P.days * 864e5;
  const goalLine = curve.map(([d]) => [d, round(P.startUsd * Math.pow(P.goalUsd / P.startUsd, Math.min(1, Math.max(0, (Date.parse(d + 'T21:00:00Z') - t0) / span))), 2)]);
  const stocks = byStock(db, P.accountId), bw = bestWorst(curve);
  return { ...P, realistic: typeof realistic === 'undefined' ? null : realistic, sim: typeof simN === 'undefined' ? null : { hits: simHits, n: simN, symbols: simSyms }, curve, goalLine, stocks, best: bw.best, worst: bw.worst, pressure: PRESSURE_TXT[P.level], gain: round(P.total - P.startUsd, 2), progressPct: round(Math.max(0, Math.min(100, (P.total - P.startUsd) / (P.goalUsd - P.startUsd) * 100)), 1), chance,
    positions: v.positions.map(p => ({ symbol: p.symbol, value: round(p.value, 2), pnl: round(p.pnl, 2), pnlPct: round(p.pnlPct * 100, 2) })), moves, last: getSetting(db, 'global', 'reto.last', null),
    marketOpen: marketOpen(now),
    honest: `Para ir de US$${P.startUsd.toLocaleString("en-US")} a US$${P.goalUsd.toLocaleString("en-US")} en ${P.days} días hay que ganar cerca de +${round((Math.pow(P.goalUsd / P.startUsd, 1 / Math.max(1, Math.round(P.days * 5 / 7))) - 1) * 100, 1)}% cada día de bolsa. La presión no le da más acierto a la IA: la hace arriesgar más. Es dinero virtual para que veas qué pasa de verdad cuando se busca ganar rápido.` };
}
