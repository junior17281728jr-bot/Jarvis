// Simulador: prueba métodos contra el azar con el historial real y sella jugadas virtuales antes de cada sorteo.
import { rng, quantile, benjaminiHochberg, round, rdDate, ymd, rdTimeToUtc, addDays, weekday } from '../core/util.js';
import { seal } from '../core/ledger.js';
import { nowIso } from '../core/db.js';
import { settleMultiplier, expectedReturn, DEFAULT_PAYOUTS } from './payouts.js';
import { METHODS } from './methods.js';
export const MIN_STAKE = 100;
import { GAMES, isValidNumbers } from './games.js';
import { history, payableStatuses } from './results.js';

/** Juega un método sorteo por sorteo: en cada fecha solo conoce lo anterior. */
export function backtest(hist, methodId, kind, { stake = 100, warmup = 10, seed = 1, P = DEFAULT_PAYOUTS } = {}) {
  const m = METHODS[methodId], r = rng(seed);
  let plays = 0, wins = 0, staked = 0, paid = 0;
  const curve = [];
  for (let t = warmup; t < hist.length; t++) {
    const nums = m.pick(hist.slice(0, t), kind, r);
    const prize = settleMultiplier(kind, nums, hist[t].nums, P) * stake;
    plays++; staked += stake; paid += prize; if (prize > 0) wins++;
    curve.push(round(paid - staked));
  }
  return { method: methodId, kind, plays, wins, staked, paid, net: paid - staked, per100: staked ? round(paid / staked * 100, 1) : null, curve };
}

/** Compara cada método con 400 jugadores al azar y corrige por haber probado varios métodos. */
export function compareMethods(hist, kind, { stake = 100, warmup = 10, sims = 400, P = DEFAULT_PAYOUTS } = {}) {
  hist = hist.slice(-400); // los últimos 400 sorteos bastan para comparar y la página no se pone lenta
  const baseline = [];
  for (let s = 0; s < sims; s++) baseline.push(backtest(hist, 'azar', kind, { stake, warmup, seed: 1000 + s, P }).per100 ?? 0);
  baseline.sort((a, b) => a - b);
  const rows = Object.keys(METHODS).filter(k => k !== 'azar').map(id => {
    const b = backtest(hist, id, kind, { stake, warmup, P });
    const better = baseline.filter(x => x >= b.per100).length;
    return { ...b, label: METHODS[id].label, why: METHODS[id].why, pBetterThanRandom: (better + 1) / (sims + 1) };
  });
  const sig = benjaminiHochberg(rows.map(r => r.pBetterThanRandom), 0.05);
  rows.forEach((r, i) => { r.beatsRandom = sig.has(i); });
  const ev = round(expectedReturn(kind, P) * 100, 1);
  return {
    kind, draws: hist.length, expectedPer100: ev,
    random: { median: round(quantile(baseline, 0.5), 1), lo: round(quantile(baseline, 0.05), 1), hi: round(quantile(baseline, 0.95), 1) },
    methods: rows.sort((a, b) => b.per100 - a.per100),
    verdict: rows.some(r => r.beatsRandom)
      ? `${rows.filter(r => r.beatsRandom).map(r => r.label).join(', ')} supera al azar con evidencia. Hay que confirmarlo con sorteos nuevos.`
      : `Ningún método le gana al azar en ${hist.length} sorteos. A largo plazo cada RD$100 devuelve unos RD$${ev}.`,
  };
}

// ---------- Jugadas virtuales en vivo ----------

/** Próximo sorteo abierto (cierra 5 minutos antes). */
export function nextDraw(game, now = new Date()) {
  const today = ymd(rdDate(now));
  for (let add = 0; add < 3; add++) {
    const date = addDays(today, add);
    const [h, m] = GAMES[game].time(weekday(date));
    const close = new Date(rdTimeToUtc(date, h, m).getTime() - 5 * 60e3);
    if (now < close) return { date, close, h, m };
  }
  throw new Error('No se encontró un sorteo próximo.');
}

/** Sella una jugada antes del cierre. Después nadie puede cambiarla. */
export function sealPlay(db, { userId = null, agent = null, game, kind, numbers, stake, method, purpose = 'control', P = DEFAULT_PAYOUTS, now = new Date() }) {
  if (!GAMES[game]) throw new Error('Lotería desconocida.');
  if (!isValidNumbers(numbers, kind)) throw new Error('Números no válidos para esa jugada (00–99, sin repetir).');
  if (!(stake > 0)) throw new Error('El monto debe ser mayor que 0.');
  if (purpose === 'usuario' && stake < MIN_STAKE) throw new Error(`El mínimo por jugada es RD$${MIN_STAKE} (como en las bancas). Puedes jugar más.`);
  const nd = nextDraw(game, now);
  const m = METHODS[method] || { version: 0 };
  const payload = { game, date: nd.date, kind, numbers, stake, payouts: P, method, methodVersion: m.version, purpose, closesAt: nd.close.toISOString(), userId, agent };
  const s = seal(db, { kind: 'jugada_loteria', ref: `${game}:${nd.date}`, userId, payload });
  const info = db.prepare(`INSERT INTO lottery_plays (user_id, agent, game, date, kind, numbers, stake, payouts, method, method_version, purpose, sealed_at, ledger_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, agent, game, nd.date, kind, JSON.stringify(numbers), stake, JSON.stringify(P), method, m.version, purpose, s.ts, s.hash);
  return { id: Number(info.lastInsertRowid), ...payload, hash: s.hash };
}

/** Paga o da por perdidas las jugadas cuyo sorteo ya tiene resultado aceptado. */
export function settlePending(db) {
  const ok = payableStatuses(db);
  const pend = db.prepare(`SELECT p.*, d.nums dnums, d.status dstatus FROM lottery_plays p
    JOIN lottery_draws d ON d.game = p.game AND d.date = p.date
    WHERE p.status = 'pending' AND d.nums IS NOT NULL`).all();
  let settled = 0;
  for (const p of pend) {
    if (!ok.includes(p.dstatus)) continue;
    const prize = settleMultiplier(p.kind, JSON.parse(p.numbers), JSON.parse(p.dnums), JSON.parse(p.payouts)) * p.stake;
    const status = prize > 0 ? 'gano' : 'perdio';
    seal(db, { kind: 'liquidacion_loteria', ref: `play:${p.id}`, userId: p.user_id, payload: { playId: p.id, draw: JSON.parse(p.dnums), drawStatus: p.dstatus, prize, status } });
    db.prepare('UPDATE lottery_plays SET status = ?, prize = ?, settled_at = ? WHERE id = ?').run(status, prize, nowIso(), p.id);
    settled++;
  }
  return settled;
}

/** Estadísticas de jugadas ya liquidadas (pendientes fuera del cálculo), con rachas. */
export function playStats(db, { userId = null, agent = null } = {}) {
  const rows = db.prepare(`SELECT * FROM lottery_plays WHERE (? IS NULL OR user_id = ?) AND (? IS NULL OR agent = ?) ORDER BY sealed_at`)
    .all(userId, userId, agent, agent);
  const done = rows.filter(r => r.status !== 'pending');
  const wins = done.filter(r => r.status === 'gano').length;
  const staked = done.reduce((s, r) => s + r.stake, 0), paid = done.reduce((s, r) => s + (r.prize || 0), 0);
  let cur = 0, curType = null, bestWin = 0, bestLose = 0, run = 0, runType = null;
  for (const r of done) {
    const t = r.status;
    if (t === runType) run++; else { run = 1; runType = t; }
    if (t === 'gano') bestWin = Math.max(bestWin, run); else bestLose = Math.max(bestLose, run);
  }
  cur = run; curType = runType;
  const byGame = {};
  for (const r of done) { const g = (byGame[r.game] ||= { plays: 0, staked: 0, paid: 0 }); g.plays++; g.staked += r.stake; g.paid += r.prize || 0; }
  return {
    plays: rows.length, settled: done.length, pending: rows.length - done.length, wins, losses: done.length - wins,
    hitRate: done.length ? round(wins / done.length * 100, 1) : null,
    staked, paid, net: paid - staked, per100: staked ? round(paid / staked * 100, 1) : null,
    streak: { current: cur, type: curType, bestWin, bestLose }, byGame,
  };
}

export function gameHistory(db, game) { return history(db, game); }
