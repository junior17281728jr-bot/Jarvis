// Prueba en vivo: las estrategias que pasaron el examen operan con dinero virtual y precios reales.
// Cada señal se sella antes de operar; cada operación cerrada pasa por el auditor y paga o cobra monedas.
import { seal } from '../core/ledger.js';
import { nowIso, activity } from '../core/db.js';
import { FAMILIES, describe } from '../stocks/strategies.js';
import { getBars, getQuote, quoteStatus, nyParts } from '../stocks/market.js';
import { ensureAccount, placeOrder, ledgerState, STRATEGY_LIMITS } from '../stocks/account.js';
import { settleCoins } from './league.js';
import { setStatus, CRITERIA } from './research.js';
import { round, mean } from '../core/util.js';
import { regimes } from './contexts.js';

const LIVE_LIMITS = { ...STRATEGY_LIMITS, maxTradeUsd: 100, minTradeUsd: 1 };

export function liveStrategies(db) {
  return db.prepare("SELECT * FROM strategies WHERE module = 'bolsa' AND status IN ('en_prueba', 'validada')").all();
}

function closeOnBench(db, fromTs, toTs, bench = 'SPY') {
  const b = getBars(db, bench);
  const a = [...b].reverse().find(x => x.ts <= fromTs.slice(0, 10)), z = [...b].reverse().find(x => x.ts <= toTs.slice(0, 10));
  return a && z ? z.close / a.close - 1 : null;
}

export function liveStep(db, { symbols, now = new Date(), bench = 'SPY' }) {
  const today = nyParts(now).date, out = { signals: 0, orders: 0, coins: 0, cheats: 0 };
  const benchBars = getBars(db, bench, { before: today }), reg = regimes(benchBars), lastReg = benchBars.length ? reg.get(benchBars.at(-1).ts) : null;
  for (const s of liveStrategies(db)) {
    const params = JSON.parse(s.params), fam = FAMILIES[s.family];
    const regimeOk = !params.regimen || (lastReg && (lastReg.trend === params.regimen || lastReg.vol === params.regimen));
    const acc = ensureAccount(db, { owner: `strategy:${s.id}`, name: 'en_vivo', startCash: 1000 });
    for (const sym of symbols.filter(x => x !== bench)) {
      const bars = getBars(db, sym, { before: today });
      if (bars.length < 250) continue;
      const state = ledgerState(db, acc.id);
      const pos = state.positions[sym]?.qty > 0 ? 1 : 0;
      const target = regimeOk ? fam.target(bars, bars.length - 1, params, pos) : 0; // fuera de su situación: no tiene acciones
      const subject = `senal:${s.id}:${sym}:${today}`;
      let pred = db.prepare('SELECT * FROM predictions WHERE subject = ?').get(subject);
      if (!pred) {
        const payload = { strategyId: s.id, symbol: sym, target, dataUntil: bars.at(-1).ts, date: today, rule: describe(s.family, params) };
        const sl = seal(db, { kind: 'senal_bolsa', ref: subject, payload });
        db.prepare('INSERT INTO predictions (module, strategy_id, agent, subject, payload, sealed_at, ledger_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run('bolsa_senal', s.id, s.agent, subject, JSON.stringify(payload), sl.ts, sl.hash);
        pred = db.prepare('SELECT * FROM predictions WHERE subject = ?').get(subject);
        out.signals++;
      }
      if (target === pos) continue;
      const quote = getQuote(db, sym), qs = quoteStatus(quote, now);
      if (!qs.usable) continue; // sin precio actual no se opera
      const r = target === 1
        ? placeOrder(db, { accountId: acc.id, symbol: sym, side: 'buy', usd: Math.min(100, state.cash), quote, quoteUsable: qs, reason: describe(s.family, params), strategyId: s.id, strategyVersion: s.version, limits: LIVE_LIMITS, now })
        : placeOrder(db, { accountId: acc.id, symbol: sym, side: 'sell', qty: state.positions[sym].qty, quote, quoteUsable: qs, reason: 'señal de salida', strategyId: s.id, strategyVersion: s.version, limits: LIVE_LIMITS, now });
      if (!r.ok) continue;
      out.orders++;
      activity(db, { agent: s.agent, type: 'operacion', text: `${target ? 'Compra' : 'Venta'} virtual de ${sym} a US$${round(r.execPrice)} (${describe(s.family, params)})` });
      if (target === 0) {
        const after = ledgerState(db, acc.id);
        const closed = after.closed.at(-1);
        const exit = db.prepare('SELECT * FROM trades WHERE id = ?').get(r.tradeId);
        const entry = db.prepare("SELECT * FROM trades WHERE account_id = ? AND symbol = ? AND side = 'buy' AND ts <= ? ORDER BY ts DESC, id DESC LIMIT 1").get(acc.id, sym, exit.ts);
        const decision = db.prepare("SELECT * FROM predictions WHERE strategy_id = ? AND subject LIKE ? AND sealed_at <= ? ORDER BY sealed_at DESC LIMIT 1").get(s.id, `senal:${s.id}:${sym}:%`, entry.ts);
        const c = settleCoins(db, { agent: s.agent, strategyId: s.id, closed, entry, exit, decision, benchReturn: closeOnBench(db, entry.ts, exit.ts, bench), limits: LIVE_LIMITS });
        out.coins += c.coins; if (c.cheat) out.cheats++;
        activity(db, { agent: s.agent, type: c.cheat ? 'trampa' : 'monedas', important: c.cheat || Math.abs(c.coins) >= 3, text: c.cheat ? `Trampa detectada en ${sym}: ${c.issues.map(i => i.text).join(' ')}` : `${c.coins >= 0 ? '+' : ''}${c.coins} monedas: ${c.why} en ${sym}` });
      }
    }
    evaluateLive(db, s, acc.id, bench);
  }
  return out;
}

/** Tras suficientes operaciones y días en vivo, decide si la estrategia queda validada o no. */
function evaluateLive(db, s, accountId, bench) {
  if (s.status !== 'en_prueba') return;
  const since = db.prepare("SELECT ts FROM strategy_status_log WHERE strategy_id = ? AND to_status = 'en_prueba' ORDER BY ts DESC LIMIT 1").get(s.id)?.ts;
  if (!since || (Date.now() - Date.parse(since)) / 864e5 < CRITERIA.liveMinDays * 1.4) return;
  const st = ledgerState(db, accountId);
  if (st.closed.length < CRITERIA.liveMinTrades) return;
  const excess = st.closed.map(c => c.pnlPct - (closeOnBench(db, c.openedAt, c.closedAt, bench) ?? 0));
  const m = mean(excess);
  setStatus(db, s.id, m > 0 ? 'validada' : 'no_validada', m > 0
    ? `En vivo le ganó al mercado por ${round(m * 100, 2)}% promedio en ${excess.length} operaciones. Validada solo para simulación.`
    : `En vivo no le ganó al mercado (${round(m * 100, 2)}% promedio en ${excess.length} operaciones).`);
}
