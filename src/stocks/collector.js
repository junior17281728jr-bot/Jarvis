// Recolector de datos de bolsa: Alpaca si hay claves; si no, Yahoo como respaldo no oficial. Fundamentales de la SEC.
import * as alpaca from './providers/alpaca.js';
import * as yahoo from './providers/yahoo.js';
import { companyFacts, insiderActivity } from './providers/sec.js';
import { saveBars, saveQuote, qualityCheck, getBars } from './market.js';
import { nowIso, getSetting, setSetting } from '../core/db.js';

export const DEFAULT_UNIVERSE = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'KO', 'JNJ', 'V', 'WMT', 'COST', 'XOM'];
export const BENCH = 'SPY';
export const universe = db => getSetting(db, 'global', 'stocks.universe', DEFAULT_UNIVERSE);

export async function updateSymbol(db, cfg, symbol, { fetchImpl = fetch } = {}) {
  const have = getBars(db, symbol);
  const start = have.length ? have[have.length - 1].ts : new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  let res, quote = null;
  if (cfg.alpacaKey) res = await alpaca.dailyBars(cfg, symbol, { start, fetchImpl });
  else { res = await yahoo.dailyBars(symbol, { range: have.length ? '1mo' : '5y', fetchImpl }); quote = res.quote; }
  const qc = qualityCheck(res.bars);
  if (!qc.ok && res.bars.length) {
    // Se guardan igualmente, pero se informa: nunca se ocultan problemas
    db.prepare('INSERT INTO audit (ts, action, detail) VALUES (?, ?, ?)').run(nowIso(), 'calidad_datos', JSON.stringify({ symbol, source: res.source, problems: qc.problems.slice(0, 5) }));
  }
  saveBars(db, symbol, res);
  if (quote) saveQuote(db, quote);
  return { symbol, source: res.source, bars: res.bars.length, problems: qc.problems.length };
}

export async function updateQuotes(db, cfg, symbols, { fetchImpl = fetch } = {}) {
  if (cfg.alpacaKey) {
    const qs = await alpaca.snapshots(cfg, symbols, { fetchImpl });
    qs.forEach(q => saveQuote(db, q));
    return qs.length;
  }
  let n = 0;
  for (const s of symbols) { try { const r = await yahoo.dailyBars(s, { range: '5d', fetchImpl }); saveQuote(db, r.quote); n++; } catch { /* se informa en el estado de fuentes */ } }
  return n;
}

export async function updateFacts(db, cfg, symbol, { fetchImpl = fetch } = {}) {
  const r = await companyFacts(symbol, cfg.secUserAgent, fetchImpl);
  const st = db.prepare(`INSERT INTO fundamentals (symbol, metric, period, value, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, metric, period) DO UPDATE SET value=excluded.value, source=excluded.source, fetched_at=excluded.fetched_at`);
  const t = nowIso();
  for (const f of r.facts) st.run(symbol, f.metric, f.period, f.value, f.source, t);
  return { symbol, facts: r.facts.length, note: r.note || null };
}

/** Compras y ventas de los dueños (últimos 180 días) → se guardan como datos de la empresa para el ranking. */
export async function updateInsiders(db, cfg, symbol, { fetchImpl = fetch } = {}) {
  const r = await insiderActivity(symbol, cfg.secUserAgent, { fetchImpl });
  if (r.none) return { symbol, none: true };
  const st = db.prepare(`INSERT INTO fundamentals (symbol, metric, period, value, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, metric, period) DO UPDATE SET value=excluded.value, source=excluded.source, fetched_at=excluded.fetched_at`);
  const t = nowIso(), src = `SEC EDGAR Formulario 4 (${r.filings} presentados en ${r.days} días)`;
  for (const [m, v] of [['duenos_compras_usd', r.buyUsd], ['duenos_compradores', r.buyers], ['duenos_ventas_usd', r.sellUsd], ['duenos_vendedores', r.sellers]]) st.run(symbol, m, 'U180D', v, src, t);
  setSetting(db, 'global', `sec.insider.${symbol}`, { at: t, buyUsd: r.buyUsd, sellUsd: r.sellUsd, buyers: r.buyers, sellers: r.sellers,
    recent: [...r.buys, ...r.sells].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map(x => ({ who: x.who, title: x.title, code: x.code, usd: Math.round(x.usd), date: x.date })) });
  return { symbol, buys: r.buys.length, sells: r.sells.length };
}

export function factsFor(db, symbol) {
  return db.prepare('SELECT metric, period, value, source, fetched_at FROM fundamentals WHERE symbol = ?').all(symbol);
}
