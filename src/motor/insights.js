// Extras de la fase 2: "¿y si hubiera seguido a JARVIS?", boletín mensual A–D, pausa por emoción,
// tipo de cambio US$→RD$ y calendario oficial de la bolsa.
import { getSetting, setSetting, nowIso } from '../core/db.js';
import { round, wilson } from '../core/util.js';
import { ledgerState } from '../stocks/account.js';

/** Si hubieras puesto US$X en cada recomendación verde/amarilla ya calificada, ¿cuánto llevarías? */
export function whatIf(db, { perTradeUsd = 10, sinceIso = null } = {}) {
  const rows = db.prepare("SELECT payload, outcome, sealed_at FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL AND (? IS NULL OR sealed_at >= ?) ORDER BY sealed_at").all(sinceIso, sinceIso);
  let invested = 0, jarvis = 0, market = 0, trades = 0;
  const curve = [];
  for (const r of rows) {
    const p = JSON.parse(r.payload), o = JSON.parse(r.outcome);
    if (p.light === 'rojo') continue;
    trades++; invested += perTradeUsd;
    jarvis += perTradeUsd * o.ret; market += perTradeUsd * o.bench;
    curve.push({ date: r.sealed_at.slice(0, 10), jarvis: round(jarvis), market: round(market) });
  }
  return { perTradeUsd, trades, invested, jarvisGain: round(jarvis), marketGain: round(market), beatMarket: jarvis > market, curve,
    text: trades ? `Con US$${perTradeUsd} en cada una de sus ${trades} recomendaciones calificadas, habrías ${jarvis >= 0 ? 'ganado' : 'perdido'} US$${Math.abs(round(jarvis))}; el mercado, US$${round(market)} con el mismo dinero.` : 'Todavía no hay recomendaciones calificadas (se califican a los 20 días de bolsa).' };
}

/** Nota del mes: A (le ganó al mercado con evidencia) … D (perdió contra el mercado). */
export function monthlyGrade(db, month = new Date().toISOString().slice(0, 7)) {
  const rows = db.prepare("SELECT correct, outcome FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL AND substr(resolved_at,1,7) = ?").all(month);
  if (rows.length < 5) return { month, grade: '—', n: rows.length, text: `Solo ${rows.length} recomendaciones calificadas este mes: todavía no hay nota.` };
  const hits = rows.filter(r => r.correct).length, w = wilson(hits, rows.length);
  const excess = rows.reduce((s, r) => s + JSON.parse(r.outcome).excess, 0) / rows.length;
  const grade = w.lo > 0.5 && excess > 0 ? 'A' : excess > 0 ? 'B' : excess > -0.01 ? 'C' : 'D';
  const meaning = { A: 'le ganó al mercado con evidencia', B: 'le ganó al mercado, pero todavía puede ser suerte', C: 'empató con el mercado', D: 'perdió contra el mercado' }[grade];
  return { month, grade, n: rows.length, hits, hitRate: round(hits / rows.length * 100, 1), excessAvg: round(excess * 100, 2), text: `Nota ${grade}: ${meaning}. Acertó ${hits} de ${rows.length} (${round(hits / rows.length * 100)}%), ${excess >= 0 ? '+' : ''}${round(excess * 100, 2)}% promedio frente al mercado.` };
}

/** Si en las últimas 24 h cerraste una pérdida fuerte, JARVIS sugiere esperar antes de volver a comprar. */
export function emotionPause(db, accountId, { lossPct = 5, hours = 24, now = new Date() } = {}) {
  const st = ledgerState(db, accountId);
  const recent = st.closed.filter(c => now - new Date(c.closedAt) < hours * 3600e3 && c.pnlPct * 100 <= -lossPct);
  return recent.length ? { pause: true, text: `Cerraste una pérdida de ${round(Math.abs(recent.at(-1).pnlPct * 100), 1)}% hace menos de ${hours} horas. Decidir en caliente suele salir caro: JARVIS recomienda esperar.` } : { pause: false };
}

// ---------- Tipo de cambio ----------
export async function updateFx(db, fetchImpl = fetch) {
  const res = await fetchImpl('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error(`Tipo de cambio: HTTP ${res.status}`);
  const j = await res.json();
  const rate = j.rates?.DOP;
  if (!(rate > 20 && rate < 200)) throw new Error('Tipo de cambio fuera de rango; no se guardó.');
  const v = { rate, asOf: j.time_last_update_utc || nowIso(), source: 'open.er-api.com (referencial, no oficial del Banco Central)' };
  setSetting(db, 'global', 'fx.usd_dop', v);
  return v;
}
export const fx = db => getSetting(db, 'global', 'fx.usd_dop', null);

// ---------- Calendario oficial de la bolsa (Alpaca) ----------
export async function updateCalendar(db, cfg, fetchImpl = fetch) {
  if (!cfg.alpacaKey) return { skipped: 'sin claves de Alpaca' };
  const y = new Date().getUTCFullYear();
  const res = await fetchImpl(`https://paper-api.alpaca.markets/v2/calendar?start=${y}-01-01&end=${y + 1}-12-31`, { headers: { 'APCA-API-KEY-ID': cfg.alpacaKey, 'APCA-API-SECRET-KEY': cfg.alpacaSecret } });
  if (!res.ok) throw new Error(`Calendario Alpaca: HTTP ${res.status}`);
  const days = (await res.json()).map(d => d.date);
  setSetting(db, 'global', 'market.tradingDays', { days, source: 'Alpaca', updatedAt: nowIso() });
  return { days: days.length };
}
