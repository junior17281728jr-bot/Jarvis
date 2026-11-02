// Resultados: cada fuente se guarda por separado y un sorteo solo queda "verificado" si dos fuentes coinciden.
import { nowIso, getSetting, setSetting, activity } from '../core/db.js';
import { rdTimeToUtc, weekday } from '../core/util.js';
import { seal } from '../core/ledger.js';
import { settleMultiplier } from './payouts.js';
import { isValidDraw, GAMES } from './games.js';

export function recordObservation(db, { game, date, source, nums, fetchedAt = nowIso() }) {
  if (!GAMES[game]) throw new Error(`Lotería desconocida: ${game}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Fecha no válida: ${date}`);
  if (!isValidDraw(nums)) throw new Error(`Números no válidos para ${game} ${date}: ${JSON.stringify(nums)}`);
  // Un resultado no puede existir antes de que se haga el sorteo: si la página lo pone con la fecha de hoy
  // antes de la hora del sorteo, en realidad es el de ayer mal fechado → no se guarda.
  if (Date.parse(fetchedAt) < drawTime(game, date).getTime()) return { game, date, skipped: 'antes_del_sorteo' };
  // Si la página repite EXACTAMENTE los números del sorteo anterior, casi seguro todavía no se actualizó
  // (que salgan los mismos 3 números en el mismo orden dos veces seguidas es de 1 en un millón).
  const prev = db.prepare('SELECT nums FROM lottery_observations WHERE game = ? AND source = ? AND date < ? ORDER BY date DESC LIMIT 1').get(game, source, date);
  if (prev && prev.nums === JSON.stringify(nums)) return { game, date, skipped: 'igual_al_anterior' };
  db.prepare(`INSERT INTO lottery_observations (game, date, source, nums, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(game, date, source) DO UPDATE SET fetched_at = CASE WHEN lottery_observations.nums = excluded.nums THEN lottery_observations.fetched_at ELSE excluded.fetched_at END, nums = excluded.nums`) // se guarda la PRIMERA vez que se vio ese resultado
    .run(game, date, source, JSON.stringify(nums), fetchedAt);
  return reconcile(db, game, date);
}

/** Hora del sorteo (hora de RD) de una lotería en una fecha. */
export function drawTime(game, date) { const [h, m] = GAMES[game].time(weekday(date)); return rdTimeToUtc(date, h, m); }

/**
 * Estados: verificado (2+ fuentes coinciden), conflicto (fuentes distintas), una_fuente (solo una).
 * Si en ajustes se permite, una sola fuente cuenta para pagar jugadas, pero queda marcada así.
 */
export function reconcile(db, game, date) {
  const obs = db.prepare('SELECT source, nums, fetched_at FROM lottery_observations WHERE game = ? AND date = ?').all(game, date);
  const groups = new Map();
  for (const o of obs) groups.set(o.nums, [...(groups.get(o.nums) || []), o.source]);
  let status, nums = null;
  if (groups.size > 1) status = 'conflicto';
  else if (obs.length >= 2) { status = 'verificado'; nums = obs[0].nums; }
  // Una sola página: si sigue diciendo lo mismo 2 horas después de verlo por primera vez, se toma como estable
  // (los errores de antes eran páginas que todavía no se habían actualizado).
  else { nums = obs[0]?.nums ?? null; status = obs[0] && Date.now() - Date.parse(obs[0].fetched_at) >= 2 * 3600e3 ? 'estable' : 'una_fuente'; }
  const sources = Object.fromEntries([...groups].map(([n, s]) => [n, s]));
  db.prepare(`INSERT INTO lottery_draws (game, date, nums, status, sources, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(game, date) DO UPDATE SET nums = excluded.nums, status = excluded.status, sources = excluded.sources, updated_at = excluded.updated_at`)
    .run(game, date, status === 'conflicto' ? null : nums, status, JSON.stringify(sources), nowIso());
  return { game, date, status, nums: nums ? JSON.parse(nums) : null, sources };
}

export function payableStatuses(db) {
  // Por defecto solo se paga cuando DOS páginas distintas dicen lo mismo (una sola página puede leerse mal)
  // o cuando una sola página lleva 2 horas diciendo lo mismo ('estable')
  return getSetting(db, 'global', 'lottery.allowSingleSource', false) ? ['verificado', 'estable', 'una_fuente'] : ['verificado', 'estable'];
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

/**
 * 🔧 Reparación: quita resultados guardados ANTES de la hora del sorteo (mal fechados) y vuelve a revisar
 * todo lo que ya se pagó contra el resultado bueno. Lo que estaba mal se corrige y queda sellado en el registro.
 * Se puede correr siempre: si no hay nada malo, no cambia nada.
 */
export function repairLotteryData(db) {
  const out = { badObservations: 0, playsFixed: 0, picksFixed: 0 };
  const touched = new Set();
  // Los de una sola página se revisan otra vez: si ya llevan 2 horas iguales, pasan a 'estable'
  for (const d of db.prepare("SELECT game, date FROM lottery_draws WHERE status = 'una_fuente' AND date >= date('now', '-10 day')").all()) reconcile(db, d.game, d.date);
  for (const o of db.prepare("SELECT id, game, date, source, fetched_at FROM lottery_observations WHERE date >= date('now', '-30 day')").all()) {
    if (!GAMES[o.game]) continue;
    if (Date.parse(o.fetched_at) < drawTime(o.game, o.date).getTime()) { db.prepare('DELETE FROM lottery_observations WHERE id = ?').run(o.id); touched.add(`${o.game}|${o.date}`); out.badObservations++; }
  }
  for (const k of touched) {
    const [game, date] = k.split('|');
    if (db.prepare('SELECT COUNT(*) n FROM lottery_observations WHERE game = ? AND date = ?').get(game, date).n) reconcile(db, game, date);
    else db.prepare('DELETE FROM lottery_draws WHERE game = ? AND date = ?').run(game, date);
  }
  const ok = payableStatuses(db);
  const drawOf = (game, date) => { const d = db.prepare('SELECT nums, status FROM lottery_draws WHERE game = ? AND date = ?').get(game, date); return d && d.nums && ok.includes(d.status) ? JSON.parse(d.nums) : null; };
  // Jugadas ya pagadas o perdidas: ¿siguen cuadrando con el resultado bueno?
  for (const p of db.prepare("SELECT * FROM lottery_plays WHERE status IN ('gano','perdio') AND date >= date('now', '-45 day')").all()) {
    const draw = drawOf(p.game, p.date);
    const prize = draw ? settleMultiplier(p.kind, JSON.parse(p.numbers), draw, JSON.parse(p.payouts)) * p.stake : null;
    if (draw && prize === p.prize) continue;
    if (draw) db.prepare('UPDATE lottery_plays SET status = ?, prize = ?, settled_at = ? WHERE id = ?').run(prize > 0 ? 'gano' : 'perdio', prize, nowIso(), p.id);
    else db.prepare("UPDATE lottery_plays SET status = 'pending', prize = NULL, settled_at = NULL WHERE id = ?").run(p.id);
    seal(db, { kind: 'correccion_loteria', ref: `play:${p.id}`, userId: p.user_id, payload: { playId: p.id, before: { status: p.status, prize: p.prize }, after: draw ? { draw, prize } : { status: 'pending', why: 'el resultado usado estaba mal leído' } } });
    out.playsFixed++;
  }
  // "Su número" de cada sorteo (predicciones): igual
  for (const r of db.prepare("SELECT id, payload, outcome FROM predictions WHERE module = 'loteria' AND correct IS NOT NULL AND sealed_at >= date('now', '-45 day')").all()) {
    const pl = JSON.parse(r.payload), was = JSON.parse(r.outcome || 'null'), draw = drawOf(pl.game, pl.date);
    if (draw && was && JSON.stringify(was.draw) === JSON.stringify(draw)) continue;
    if (draw) {
      const per = pl.perNumberRd ?? pl.amountRd, prize = pl.numbers.reduce((t, x) => t + settleMultiplier('quiniela', [x], draw, pl.payouts) * per, 0);
      db.prepare('UPDATE predictions SET outcome = ?, correct = ?, resolved_at = ? WHERE id = ?').run(JSON.stringify({ draw, prizeRd: prize, pnlRd: prize - pl.amountRd, hits: pl.numbers.filter(x => draw.includes(x)), corrected: true }), prize > 0 ? 1 : 0, nowIso(), r.id);
    } else db.prepare('UPDATE predictions SET outcome = NULL, correct = NULL, resolved_at = NULL WHERE id = ?').run(r.id);
    out.picksFixed++;
  }
  if (out.badObservations || out.playsFixed || out.picksFixed) {
    activity(db, { agent: 'loteria', type: 'correccion', important: true, text: `🔧 Corregí resultados de lotería mal leídos: ${out.badObservations} resultado(s) que tenían fecha de un sorteo que todavía no había pasado, ${out.playsFixed} jugada(s) de prueba y ${out.picksFixed} de "su número" vueltas a calcular con el resultado bueno.` });
    setSetting(db, 'global', 'lottery.lastRepair', { at: nowIso(), ...out });
  }
  return out;
}
