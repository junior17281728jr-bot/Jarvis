// Datos de mercado: guardar con su origen, revisar calidad, saber si el mercado está abierto y si un precio es actual.
import { nowIso } from '../core/db.js';

// Feriados de la bolsa de Nueva York (NYSE). Si hay claves de Alpaca se puede consultar su calendario oficial.
const NYSE_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

export function nyParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour) % 24, m: Number(p.minute), wd: p.weekday };
}
let TRADING_DAYS = null; // calendario oficial de Alpaca cuando está disponible
export function setTradingDays(days) { TRADING_DAYS = days?.length ? new Set(days) : null; }
export function marketOpen(d = new Date()) {
  const p = nyParts(d);
  if (TRADING_DAYS && p.date >= [...TRADING_DAYS][0]) { if (!TRADING_DAYS.has(p.date)) return false; }
  else if (p.wd === 'Sat' || p.wd === 'Sun' || NYSE_HOLIDAYS.has(p.date)) return false;
  const mins = p.h * 60 + p.m;
  return mins >= 570 && mins < 960; // 9:30 a 16:00 hora de Nueva York
}

/** Revisa barras antes de usarlas: valores imposibles, duplicados y huecos raros. */
export function qualityCheck(bars) {
  const problems = [];
  const seen = new Set();
  bars.forEach((b, i) => {
    if (seen.has(b.ts)) problems.push(`${b.ts}: fecha duplicada`);
    seen.add(b.ts);
    if (!(b.close > 0 && b.open > 0 && b.low > 0)) problems.push(`${b.ts}: precio no positivo`);
    if (b.high < Math.max(b.open, b.close) - 1e-9 || b.low > Math.min(b.open, b.close) + 1e-9) problems.push(`${b.ts}: máximo/mínimo incoherentes`);
    if (i > 0) {
      const gapDays = (Date.parse(b.ts) - Date.parse(bars[i - 1].ts)) / 864e5;
      if (gapDays <= 0) problems.push(`${b.ts}: fechas fuera de orden`);
      if (gapDays > 6) problems.push(`${b.ts}: faltan ${Math.round(gapDays)} días de datos`);
      const jump = Math.abs(b.close / bars[i - 1].close - 1);
      if (jump > 0.5) problems.push(`${b.ts}: salto de ${Math.round(jump * 100)}% (revisar división de acciones)`);
    }
  });
  return { ok: problems.length === 0, problems };
}

export function saveBars(db, symbol, { source, bars }, interval = '1d') {
  const st = db.prepare(`INSERT INTO stock_bars (symbol, interval, ts, open, high, low, close, volume, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, interval, ts) DO UPDATE SET open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume, source=excluded.source, fetched_at=excluded.fetched_at`);
  const t = nowIso();
  db.exec('BEGIN');
  try { for (const b of bars) st.run(symbol, interval, b.ts, b.open, b.high, b.low, b.close, b.volume ?? 0, source, t); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  return bars.length;
}

/** Barras hasta una fecha (sin incluirla): así ninguna decisión ve el futuro. */
export function getBars(db, symbol, { before, limit } = {}) {
  const rows = before
    ? db.prepare("SELECT ts, open, high, low, close, volume, source FROM stock_bars WHERE symbol = ? AND interval = '1d' AND ts < ? ORDER BY ts").all(symbol, before)
    : db.prepare("SELECT ts, open, high, low, close, volume, source FROM stock_bars WHERE symbol = ? AND interval = '1d' ORDER BY ts").all(symbol);
  return limit ? rows.slice(-limit) : rows;
}

export function saveQuote(db, q) {
  db.prepare(`INSERT INTO stock_quotes (symbol, price, prev_close, as_of, kind, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET price=excluded.price, prev_close=excluded.prev_close, as_of=excluded.as_of, kind=excluded.kind, source=excluded.source, fetched_at=excluded.fetched_at`)
    .run(q.symbol, q.price, q.prevClose ?? null, q.asOf, q.kind, q.source, nowIso());
}

/** Un precio sirve para operar solo si es reciente: con el mercado abierto, de menos de 20 minutos. */
export function quoteStatus(q, now = new Date()) {
  if (!q) return { usable: false, label: 'no disponible' };
  const ageMin = (now - new Date(q.as_of ?? q.asOf)) / 60e3;
  if (marketOpen(now)) return ageMin <= 20 ? { usable: true, label: q.kind === 'retrasado' ? 'retrasado (≤20 min)' : 'en vivo', ageMin } : { usable: false, label: `desactualizado (${Math.round(ageMin)} min)`, ageMin };
  return { usable: false, label: 'mercado cerrado: precio de cierre', ageMin };
}
export function getQuote(db, symbol) {
  return db.prepare('SELECT * FROM stock_quotes WHERE symbol = ?').get(symbol) || null;
}

/** Datos de prueba con semilla (solo para pruebas automáticas, nunca se muestran como reales). */
export function syntheticBars(n, { seed = 1, start = 100, drift = 0.0003, vol = 0.015, from = '2022-01-03' } = {}) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
  const bars = [];
  let p = start, d = new Date(from + 'T00:00:00Z');
  while (bars.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const open = p * (1 + gauss() * vol * 0.3);
      const close = open * (1 + drift + gauss() * vol);
      bars.push({ ts: d.toISOString().slice(0, 10), open, high: Math.max(open, close) * (1 + r() * vol * 0.5), low: Math.min(open, close) * (1 - r() * vol * 0.5), close, volume: 1e6 });
      p = close;
    }
    d = new Date(d.getTime() + 864e5);
  }
  return bars;
}
