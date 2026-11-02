// Resultados: cada fuente se guarda por separado y un sorteo solo queda "verificado" si dos fuentes coinciden.
import { nowIso, getSetting } from '../core/db.js';
import { isValidDraw, GAMES } from './games.js';

export function recordObservation(db, { game, date, source, nums, fetchedAt = nowIso() }) {
  if (!GAMES[game]) throw new Error(`Lotería desconocida: ${game}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Fecha no válida: ${date}`);
  if (!isValidDraw(nums)) throw new Error(`Números no válidos para ${game} ${date}: ${JSON.stringify(nums)}`);
  db.prepare(`INSERT INTO lottery_observations (game, date, source, nums, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(game, date, source) DO UPDATE SET fetched_at = CASE WHEN lottery_observations.nums = excluded.nums THEN lottery_observations.fetched_at ELSE excluded.fetched_at END, nums = excluded.nums`) // se guarda la PRIMERA vez que se vio ese resultado
    .run(game, date, source, JSON.stringify(nums), fetchedAt);
  return reconcile(db, game, date);
}

/**
 * Estados: verificado (2+ fuentes coinciden), conflicto (fuentes distintas), una_fuente (solo una).
 * Si en ajustes se permite, una sola fuente cuenta para pagar jugadas, pero queda marcada así.
 */
export function reconcile(db, game, date) {
  const obs = db.prepare('SELECT source, nums FROM lottery_observations WHERE game = ? AND date = ?').all(game, date);
  const groups = new Map();
  for (const o of obs) groups.set(o.nums, [...(groups.get(o.nums) || []), o.source]);
  let status, nums = null;
  if (groups.size > 1) status = 'conflicto';
  else if (obs.length >= 2) { status = 'verificado'; nums = obs[0].nums; }
  else { status = 'una_fuente'; nums = obs[0]?.nums ?? null; }
  const sources = Object.fromEntries([...groups].map(([n, s]) => [n, s]));
  db.prepare(`INSERT INTO lottery_draws (game, date, nums, status, sources, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(game, date) DO UPDATE SET nums = excluded.nums, status = excluded.status, sources = excluded.sources, updated_at = excluded.updated_at`)
    .run(game, date, status === 'conflicto' ? null : nums, status, JSON.stringify(sources), nowIso());
  return { game, date, status, nums: nums ? JSON.parse(nums) : null, sources };
}

export function payableStatuses(db) {
  return getSetting(db, 'global', 'lottery.allowSingleSource', true) ? ['verificado', 'una_fuente'] : ['verificado'];
}

/** Historial ordenado por fecha (solo sorteos con números). */
export function history(db, game, { until } = {}) {
  const rows = until
    ? db.prepare("SELECT date, nums, status FROM lottery_draws WHERE game = ? AND nums IS NOT NULL AND date < ? ORDER BY date").all(game, until)
    : db.prepare("SELECT date, nums, status FROM lottery_draws WHERE game = ? AND nums IS NOT NULL ORDER BY date").all(game);
  return rows.map(r => ({ date: r.date, nums: JSON.parse(r.nums), status: r.status }));
}

export function latest(db) {
  const out = {};
  for (const g of Object.keys(GAMES)) {
    const r = db.prepare('SELECT date, nums, status, sources FROM lottery_draws WHERE game = ? ORDER BY date DESC LIMIT 1').get(g);
    out[g] = r ? { date: r.date, nums: r.nums ? JSON.parse(r.nums) : null, status: r.status, sources: JSON.parse(r.sources) } : null;
  }
  return out;
}
