// Recolector de datos de bolsa: Alpaca si hay claves; si no, Yahoo como respaldo no oficial. Fundamentales de la SEC.
import * as alpaca from './providers/alpaca.js';
import * as yahoo from './providers/yahoo.js';
import { companyFacts } from './providers/sec.js';
import { saveBars, saveQuote, qualityCheck, getBars } from './market.js';
import { nowIso, getSetting } from '../core/db.js';

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

export function factsFor(db, symbol) {
  return db.prepare('SELECT metric, period, value, source, fetched_at FROM fundamentals WHERE symbol = ?').all(symbol);
}
