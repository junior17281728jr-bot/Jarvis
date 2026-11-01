// El estadístico de loterías: juega en virtual cada método antes de cada sorteo, elige "su número" con el
// método que mejor va en vivo, y reduce el esfuerzo si ningún método le gana al azar.
import { GAMES } from '../lottery/games.js';
import { METHODS } from '../lottery/methods.js';
import { history } from '../lottery/results.js';
import { nextDraw, sealPlay } from '../lottery/simulator.js';
import { getSetting, setSetting, activity } from '../core/db.js';
import { DEFAULT_PAYOUTS } from '../lottery/payouts.js';
import { sealLotteryPick } from './track.js';
import { rng, sha256, round, wilson } from '../core/util.js';

const STAKE = 10;

export function liveMethodStats(db) {
  return db.prepare(`SELECT method, COUNT(*) n, SUM(stake) staked, SUM(COALESCE(prize,0)) paid, SUM(status = 'gano') wins
    FROM lottery_plays WHERE agent = 'loteria' AND purpose = 'experimento' AND status != 'pending' GROUP BY method`).all()
    .map(r => ({ ...r, per100: r.staked ? round(r.paid / r.staked * 100, 1) : null }));
}

export function activeMethods(db) {
  if (getSetting(db, 'global', 'lottery.effort', 'normal') === 'bajo') {
    const best = liveMethodStats(db).filter(m => m.method !== 'azar').sort((a, b) => b.per100 - a.per100)[0]?.method;
    return ['azar', ...(best ? [best] : [])];
  }
  return Object.keys(METHODS);
}

export function autoPlays(db, { now = new Date() } = {}) {
  let sealed = 0;
  for (const game of Object.keys(GAMES)) {
    let nd; try { nd = nextDraw(game, now); } catch { continue; }
    const hist = history(db, game, { until: nd.date });
    if (hist.length < 10) continue;
    for (const method of activeMethods(db)) {
      const exists = db.prepare("SELECT 1 FROM lottery_plays WHERE agent = 'loteria' AND game = ? AND date = ? AND method = ? AND purpose = 'experimento'").get(game, nd.date, method);
      if (exists) continue;
      const seed = parseInt(sha256(`${game}${nd.date}${method}`).slice(0, 8), 16);
      const numbers = METHODS[method].pick(hist, 'quiniela', rng(seed));
      sealPlay(db, { agent: 'loteria', game, kind: 'quiniela', numbers, stake: STAKE, method, purpose: 'experimento', now, P: getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS) });
      sealed++;
    }
  }
  // "Su número" de cada sorteo también queda sellado como recomendación, para medir su acierto real
  for (const game of Object.keys(GAMES)) { try { const pk = pickOfTheDay(db, game, { now }); if (history(db, game, { until: pk.date }).length >= 10) sealLotteryPick(db, pk); } catch { /* sin datos */ } }
  if (sealed) activity(db, { agent: 'loteria', type: 'loteria', text: `${sealed} jugadas virtuales selladas antes de los próximos sorteos` });
  return sealed;
}

/** "Su número" para un sorteo, con la razón y su historial real. */
export function pickOfTheDay(db, game, { now = new Date() } = {}) {
  const nd = nextDraw(game, now);
  const hist = history(db, game, { until: nd.date });
  const stats = liveMethodStats(db).filter(m => m.n >= 30 && m.method !== 'azar').sort((a, b) => b.per100 - a.per100);
  const method = stats[0]?.method || 'frecuentes';
  const numbers = METHODS[method].pick(hist, 'quiniela', rng(parseInt(sha256(game + nd.date).slice(0, 8), 16)));
  const s = stats[0];
  const azar = liveMethodStats(db).find(m => m.method === 'azar');
  const w = s ? wilson(s.wins, s.n) : null;
  return {
    game, date: nd.date, closesAt: nd.close.toISOString(), numbers, method, methodLabel: METHODS[method].label, why: METHODS[method].why,
    record: s ? `En vivo este método acierta ${s.wins} de ${s.n} (${round(s.wins / s.n * 100, 1)}%, rango ${round(w.lo * 100)}–${round(w.hi * 100)}%). Devuelve RD$${s.per100} por cada RD$100; el azar, RD$${azar?.per100 ?? '—'}.` : 'Todavía no hay suficientes jugadas en vivo para medir este método.',
    light: 'gris', warning: 'Si los sorteos son justos, este número tiene la misma probabilidad que cualquier otro (3 de cada 100 en quiniela).',
  };
}

/** Si tras 100+ jugadas por método ninguno supera al azar, baja el esfuerzo dedicado a loterías. */
export function reviewEffort(db) {
  const st = liveMethodStats(db), azar = st.find(m => m.method === 'azar');
  if (!azar || st.some(m => m.n < 100)) return null;
  const better = st.filter(m => m.method !== 'azar' && m.per100 > azar.per100 + 10);
  const effort = better.length ? 'normal' : 'bajo';
  if (getSetting(db, 'global', 'lottery.effort', 'normal') !== effort) {
    setSetting(db, 'global', 'lottery.effort', effort);
    activity(db, { agent: 'loteria', type: 'decision', important: true, text: effort === 'bajo' ? 'Ningún método le gana al azar tras 100+ jugadas cada uno: reduzco el esfuerzo en loterías y priorizo la bolsa.' : 'Un método parece superar al azar: vuelvo a esfuerzo normal para confirmarlo.' });
  }
  return effort;
}
