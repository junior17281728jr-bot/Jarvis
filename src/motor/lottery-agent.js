// El estadístico de loterías: juega en virtual cada método antes de cada sorteo, elige "su número" con el
// método que mejor va en vivo, y reduce el esfuerzo si ningún método le gana al azar.
import { GAMES } from '../lottery/games.js';
import { METHODS } from '../lottery/methods.js';
import { history } from '../lottery/results.js';
import { nextDraw, sealPlay } from '../lottery/simulator.js';
import { getSetting, setSetting, activity } from '../core/db.js';
import { DEFAULT_PAYOUTS } from '../lottery/payouts.js';
import { sealLotteryPick } from './track.js';
import { rng, sha256, round, wilson, rdTimeToUtc } from '../core/util.js';
import { fx } from './insights.js';

// Monto de cada jugada virtual del agente: RD$100, lo mínimo que se juega normalmente en una banca
const STAKE = 100;

/**
 * 💵 Cuánto apuesta JARVIS en "su número", decidido con su monedero (como una persona prudente):
 *  - Nunca menos de RD$100 por número (lo mínimo de una banca).
 *  - Nunca más del 5% de lo que le queda en un solo sorteo (así nunca lo apuesta todo).
 *  - Solo sube (hasta RD$300 por número) si su método le gana al azar con pruebas fuertes; si no, juega el mínimo,
 *    porque en la lotería subir el monto sin ventaja solo hace perder más rápido.
 *  - Si no le alcanza para el mínimo, NO juega y lo avisa.
 */
export function smartStake(db, method, count = 3) {
  const C = getSetting(db, 'global', 'ia.config', {}), rate = fx(db)?.rate || 60, startRd = round((C.lotoUsd || 100) * rate, 2);
  const rows = db.prepare("SELECT payload, outcome FROM predictions WHERE module = 'loteria' AND sealed_at > ?").all(C.lotoSince || '');
  const played = rows.reduce((t, r) => t + (JSON.parse(r.payload).amountRd || 0), 0);
  const won = rows.reduce((t, r) => t + (r.outcome ? JSON.parse(r.outcome).prizeRd || 0 : 0), 0);
  const leftRd = startRd - played + won;
  const minTotal = STAKE * count;
  if (leftRd < minTotal) return { perNumberRd: 0, totalRd: 0, leftRd, skip: true, why: `No juega: le quedan ${Math.round(leftRd)} pesos y el mínimo es RD$${STAKE} por número (RD$${minTotal} los ${count}).` };
  const s = liveMethodStats(db).find(m => m.method === method);
  const fair = 0.03; // si los sorteos son justos, un número sale ~3 de cada 100 sorteos
  const proven = s && s.n >= 100 && s.per100 >= 115 && wilson(s.wins, s.n).lo > fair;
  let per = STAKE, why;
  if (proven) {
    const edge = Math.min(2, (s.per100 - 100) / 100 * 4); // ventaja medida → sube poco a poco, máximo ×3
    per = Math.round(STAKE * (1 + edge) / 50) * 50;
    why = `Sube a RD$${per} por número porque su método le gana al azar con pruebas fuertes (devuelve RD$${s.per100} por cada RD$100 en ${s.n} jugadas).`;
  } else why = `Juega el mínimo, RD$${STAKE} por número: ningún método le gana todavía al azar con pruebas fuertes, y subir sin ventaja solo hace perder más rápido.`;
  const cap = Math.floor(leftRd * 0.05 / count / 50) * 50; // nunca más del 5% de lo que le queda por sorteo
  if (per > cap && cap >= STAKE) { per = cap; why += ` Lo limita a RD$${per} para no arriesgar más del 5% de lo que le queda.`; }
  per = Math.max(STAKE, per);
  return { perNumberRd: per, totalRd: per * count, leftRd, skip: false, why };
}

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
      // Cada método juega SUS 3 números, cada uno como una quiniela de RD$100 (igual que "su número" de JARVIS)
      const three = [...new Set(METHODS[method].pick(hist, 'tripleta', rng(seed)))];
      for (const x of three) { sealPlay(db, { agent: 'loteria', game, kind: 'quiniela', numbers: [x], stake: STAKE, method, purpose: 'experimento', now, P: getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS) }); sealed++; }
    }
  }
  // "Su número" de cada sorteo también queda sellado como recomendación, para medir su acierto real
  for (const game of Object.keys(GAMES)) {
    try {
      const pk = pickOfTheDay(db, game, { now });
      if (history(db, game, { until: pk.date }).length < 10) continue;
      if (db.prepare('SELECT 1 FROM predictions WHERE subject = ?').get(`loteria:${pk.game}:${pk.date}`)) continue;
      const st = smartStake(db, pk.method, pk.numbers.length);
      if (st.skip) { if (!getSetting(db, 'global', 'lottery.brokeNoted', false)) { activity(db, { agent: 'loteria', type: 'loteria', important: true, text: `🪫 ${st.why}` }); setSetting(db, 'global', 'lottery.brokeNoted', true); } continue; }
      sealLotteryPick(db, { ...pk, stakeWhy: st.why }, { stake: st.perNumberRd });
    } catch { /* sin datos */ }
  }
  if (sealed) activity(db, { agent: 'loteria', type: 'loteria', text: `${sealed} jugadas virtuales selladas antes de los próximos sorteos` });
  return sealed;
}

/** "Su número" para un sorteo, con la razón y su historial real. */
export function pickOfTheDay(db, game, { now = new Date() } = {}) {
  const nd = nextDraw(game, now);
  const hist = history(db, game, { until: nd.date });
  const stats = liveMethodStats(db).filter(m => m.n >= 30 && m.method !== 'azar').sort((a, b) => b.per100 - a.per100);
  const method = stats[0]?.method || 'frecuentes';
  // 3 números por sorteo (cada uno una apuesta de quiniela): más chance de pegar uno, como juega la gente en la banca
  let numbers = METHODS[method].pick(hist, 'tripleta', rng(parseInt(sha256(game + nd.date).slice(0, 8), 16)));
  // "Sus 3 números" = los 3 primeros del orden aprendido (votos de todos los métodos + historial + los que le ganan al azar)
  let fromOrder = false;
  try { const v = methodVotes(db, game, { now }); if (v?.order?.length >= 3) { numbers = v.order.slice(0, 3).map(o => o.num); fromOrder = true; } } catch { /* se queda con el del método */ }
  const s = stats[0];
  const azar = liveMethodStats(db).find(m => m.method === 'azar');
  const w = s ? wilson(s.wins, s.n) : null;
  return {
    game, date: nd.date, closesAt: nd.close.toISOString(), numbers, method, methodLabel: fromOrder ? 'Orden aprendido' : METHODS[method].label,
    why: fromOrder ? `Los 3 primeros del orden aprendido: los números que más métodos votaron, ajustados por el historial y por los métodos que de verdad le ganan al azar (el mejor ahora: ${METHODS[method].label}).` : METHODS[method].why,
    record: s ? `En vivo este método acierta ${s.wins} de ${s.n} (${round(s.wins / s.n * 100, 1)}%, rango ${round(w.lo * 100)}–${round(w.hi * 100)}%). Devuelve RD$${s.per100} por cada RD$100; el azar, RD$${azar?.per100 ?? '—'}.` : 'Todavía no hay suficientes jugadas en vivo para medir este método.',
    light: 'gris', stake: (() => { const st = smartStake(db, method, numbers.length); return { min: STAKE, suggested: Math.max(STAKE, st.perNumberRd), perNumber: true, why: `${st.why} Mínimo RD$${STAKE} por número (US$${(STAKE / (fx(db)?.rate || 60)).toFixed(2)}).` }; })(),
    warning: 'Si los sorteos son justos, cada número tiene 3 de cada 100 de salir. Con 3 números, la chance de pegar al menos uno es de unos 9 de cada 100.',
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

/**
 * 🗳️ Votación: cada método popular propone sus 3 números para el próximo sorteo y se cuentan los votos.
 * Honestidad: en un sorteo justo cada número tiene 3 de 100 de salir en quiniela, voten lo que voten.
 * El "récord" de cada método es real (jugadas virtuales selladas antes del sorteo).
 */
export function methodVotes(db, game, { now = new Date() } = {}) {
  const nd = nextDraw(game, now), hist = history(db, game, { until: nd.date });
  if (hist.length < 10) return null;
  const live = Object.fromEntries(liveMethodStats(db).map(m => [m.method, m]));
  const azar = live.azar;
  // Votan LOS 6 métodos y cada uno elige 3 números (como juega la gente en la banca)
  const voters = Object.entries(METHODS).map(([k, m]) => {
    const nums = [...new Set(m.pick(hist, 'tripleta', rng(parseInt(sha256(game + nd.date + k).slice(0, 8), 16))))];
    const L = live[k];
    return { method: k, label: m.label, why: m.why, nums, n: L?.n || 0, wins: L?.wins || 0, per100: L?.per100 ?? null, beatsChance: L && azar && L.n >= 30 ? L.per100 > azar.per100 : null };
  });
  const tally = {};
  for (const v of voters) for (const x of v.nums) (tally[x] ||= { num: x, votes: 0, by: [] }), tally[x].votes++, tally[x].by.push(v.label);
  // 📈 Probabilidad aprendida de cada número votado: parte de la probabilidad justa (≈3 de 100) y la mueve
  // poquito según (a) cuántas veces salió en el historial y (b) si los métodos que lo votaron le ganan al azar
  // en jugadas reales. Con pocos datos casi no se mueve: así no se inventa una ventaja que no existe.
  const P0 = 1 - Math.pow(0.99, 3), n = hist.length;
  const seen = {}; for (const d of hist) for (const x of new Set(d.nums)) seen[x] = (seen[x] || 0) + 1;
  // ¿Cuánto de las diferencias entre números es real y cuánto es ruido del azar? (Bayes empírico / James-Stein)
  // Si los 100 números varían lo mismo que variaría el azar puro, B = 0 y todos quedan en ~2.97%.
  // Solo si varían MÁS de lo que explica el azar (un sesgo real), B sube y los diferencia.
  const ph = Array.from({ length: 100 }, (_, i) => (seen[String(i).padStart(2, '0')] || 0) / Math.max(1, n));
  const mean = ph.reduce((a, b) => a + b, 0) / 100, varObs = ph.reduce((t, x) => t + (x - mean) ** 2, 0) / 99, varExp = P0 * (1 - P0) / Math.max(1, n);
  const B = n >= 30 && varObs > 0 ? Math.max(0, Math.min(1, 1 - varExp / varObs)) : 0;
  for (const t of Object.values(tally)) {
    const pHist = P0 + B * ((seen[t.num] || 0) / Math.max(1, n) - P0);
    let skill = 0;
    for (const v of voters.filter(v => v.nums.includes(t.num))) {
      const L = live[v.method];
      if (L && azar && L.n >= 30 && azar.per100) skill += ((L.per100 - azar.per100) / azar.per100) * (L.n / (L.n + 300)) / voters.length;
    }
    const p = Math.min(2 * P0, Math.max(0.5 * P0, pHist * (1 + Math.max(-0.2, Math.min(0.2, skill)))));
    Object.assign(t, { prob: round(p * 100, 2), timesOut: seen[t.num] || 0, vsFair: round((p / P0 - 1) * 100, 1) });
  }
  const ranked = Object.values(tally).sort((a, b) => b.votes - a.votes || (a.num < b.num ? -1 : 1));
  const top = ranked.slice(0, 3);
  // Orden para jugar: primero el de más probabilidad aprendida; si empatan, el de más votos
  const order = Object.values(tally).sort((a, b) => b.prob - a.prob || b.votes - a.votes || (a.num < b.num ? -1 : 1)).map((t, i) => ({ ...t, rank: i + 1 }));
  // Los 3 de arriba de la votación son los mismos 3 primeros del orden (así no se contradicen)
  top.splice(0, top.length, ...order.slice(0, 3));
  const anyBeats = voters.some(v => v.beatsChance);
  return {
    game, date: nd.date, voters, top, order, totalVoters: voters.length, fairProb: round(P0 * 100, 2), draws: n, realShare: round(B * 100),
    chance: 'En quiniela salen 3 números de 100 (del 00 al 99): cada número tiene 3 de cada 100 de salir, sea cual sea.',
    verdict: anyBeats ? 'Algún método le va ganando al azar en las jugadas reales; sigue en observación (puede ser suerte).'
      : voters.every(v => v.n < 30) ? 'Todavía hay pocas jugadas reales para saber si algún método sirve.'
      : 'Ningún método le gana al azar en las jugadas reales: estos números son tan buenos como cualquier otro.',
  };
}

const pad = n => String(n).padStart(2, '0');
const drawTime = (game, date) => { const wd = new Date(date + 'T12:00:00Z').getUTCDay(); const [h, m] = GAMES[game].time(wd); return `${pad(h)}:${pad(m)}`; };

/**
 * 🎱 Tablero de JARVIS en loterías: lo que va a jugar (con fecha y hora del sorteo), lo que ya jugó,
 * qué salió de verdad y si acertó o no, con la explicación. Todo sellado ANTES del sorteo.
 */
export function lotteryBoard(db, { now = new Date(), limit = 40 } = {}) {
  const rate = fx(db)?.rate || null;
  const sealedPick = (game, date) => { const r = db.prepare("SELECT payload, sealed_at, ledger_hash FROM predictions WHERE subject = ?").get(`loteria:${game}:${date}`); return r ? { ...JSON.parse(r.payload), sealedAt: r.sealed_at, hash: r.ledger_hash } : null; };
  const seenAt = (game, date) => db.prepare('SELECT MIN(fetched_at) t FROM lottery_observations WHERE game = ? AND date = ?').get(game, date)?.t || null;
  const playsFor = (game, date) => {
    const by = new Map();
    for (const p of db.prepare("SELECT method, numbers, stake, status, prize FROM lottery_plays WHERE agent = 'loteria' AND game = ? AND date = ? ORDER BY method, id").all(game, date)) {
      const g = by.get(p.method) || { method: p.method, label: METHODS[p.method]?.label || p.method, numbers: [], stake: 0, status: 'perdio', prize: 0, pending: false };
      g.numbers.push(...JSON.parse(p.numbers)); g.stake += p.stake; g.prize += p.prize || 0;
      if (p.status === 'pending') g.pending = true; if (p.status === 'gano') g.status = 'gano';
      by.set(p.method, g);
    }
    return [...by.values()].map(g => ({ ...g, status: g.pending ? 'pending' : g.status }));
  };
  const upcoming = [];
  for (const game of Object.keys(GAMES)) {
    let nd; try { nd = nextDraw(game, now); } catch { continue; }
    const enough = history(db, game, { until: nd.date }).length >= 10;
    let pk = sealedPick(game, nd.date);
    if (!pk && enough) { try { const p = pickOfTheDay(db, game, { now }); pk = { ...p, amountRd: p.stake.suggested * p.numbers.length, perNumberRd: p.stake.suggested, stakeWhy: p.stake.why, sealedAt: null }; } catch { /* sin datos */ } }
    upcoming.push({ game, name: GAMES[game].name, date: nd.date, time: drawTime(game, nd.date), closesAt: nd.close.toISOString(), verified: !!GAMES[game].verified,
      pick: pk ? { stakeWhy: pk.stakeWhy || null, numbers: pk.numbers, method: pk.method, methodLabel: pk.methodLabel || METHODS[pk.method]?.label || pk.method, why: pk.why || METHODS[pk.method]?.why || '', stakeRd: pk.amountRd ?? STAKE, perNumberRd: pk.perNumberRd ?? pk.amountRd ?? STAKE, sealedAt: pk.sealedAt, hash: pk.hash || null } : null,
      plays: playsFor(game, nd.date), enough, draws: history(db, game).length,
      order: enough ? (() => { try { const v = methodVotes(db, game, { now }); return v ? { fair: v.fairProb, draws: v.draws, realShare: v.realShare, voters: v.totalVoters, list: v.order.slice(0, 6).map(o => ({ num: o.num, prob: o.prob, votes: o.votes, rank: o.rank, by: o.by, timesOut: o.timesOut })) } : null; } catch { return null; } })() : null,
      sources: enough ? null : (getSetting(db, 'global', 'lottery.sources', null)?.report || []).filter(x => x.game === game).map(x => ({ source: x.source, ok: x.ok, saved: x.saved, error: x.error })) });
  }
  upcoming.sort((a, b) => a.closesAt < b.closesAt ? -1 : 1);
  const past = db.prepare("SELECT subject, payload, sealed_at, ledger_hash, outcome, correct, resolved_at FROM predictions WHERE module = 'loteria' ORDER BY sealed_at DESC LIMIT ?").all(limit)
    .map(r => { const pl = JSON.parse(r.payload), out = r.outcome ? JSON.parse(r.outcome) : null; const draw = out?.draw || null;
      const hits = draw ? pl.numbers.filter(x => draw.includes(x)) : [], pos = draw && hits.length ? draw.indexOf(hits[0]) : -1;
      const per = pl.perNumberRd ?? pl.amountRd, many = pl.numbers.length > 1;
      const plays = playsFor(pl.game, pl.date);
      return { game: pl.game, name: GAMES[pl.game]?.name || pl.game, date: pl.date, time: GAMES[pl.game] ? drawTime(pl.game, pl.date) : null,
        numbers: pl.numbers, method: pl.method, methodLabel: pl.methodLabel || METHODS[pl.method]?.label || pl.method, why: pl.why || '', stakeRd: pl.amountRd, sealedAt: r.sealed_at, hash: r.ledger_hash, resultSeenAt: out ? seenAt(pl.game, pl.date) : null,
        draw, status: r.correct == null ? 'esperando' : r.correct ? 'acerto' : 'fallo', position: pos >= 0 ? pos + 1 : null, perNumberRd: per, hits, prizeRd: out?.prizeRd ?? null, pnlRd: out?.pnlRd ?? null,
        explain: r.correct == null ? 'El sorteo todavía no tiene resultado confirmado por dos fuentes.'
          : r.correct ? `¡Salió ${hits.map(h => `el ${h} (${['1ra', '2da', '3ra'][draw.indexOf(h)]} posición)`).join(' y ')}! Jugó RD$${pl.amountRd}${many ? ` (RD$${per} por número)` : ''} y cobró RD$${out.prizeRd}.`
          : `No salió ${many ? `ninguno de sus ${pl.numbers.length} números (${pl.numbers.join(', ')})` : `el ${pl.numbers[0]}`}. Salieron ${draw.join(' · ')}.${many ? '' : ' (Esta jugada era de antes, con un solo número.)'}`,
        others: plays.filter(p => p.status !== 'pending').map(p => ({ label: p.label, numbers: p.numbers, won: p.status === 'gano' })) };
    }).filter(p => !upcoming.some(u => u.game === p.game && u.date === p.date && p.status === 'esperando'));
  // 🏆 Todas las jugadas que ganaron (su número y las de prueba de cada método), con la hora en que se apostó y la del resultado
  const wins = db.prepare(`SELECT game, date, method, numbers, stake, prize, sealed_at, ledger_hash FROM lottery_plays WHERE agent = 'loteria' AND status = 'gano' ORDER BY date DESC, sealed_at DESC LIMIT 30`).all()
    .map(w => { const d = db.prepare('SELECT nums FROM lottery_draws WHERE game = ? AND date = ?').get(w.game, w.date); const draw = d ? JSON.parse(d.nums) : null, nums = JSON.parse(w.numbers);
      return { kind: 'prueba', game: w.game, name: GAMES[w.game]?.name || w.game, date: w.date, time: GAMES[w.game] ? drawTime(w.game, w.date) : null, method: w.method, methodLabel: METHODS[w.method]?.label || w.method,
        numbers: nums, draw, positions: draw ? nums.filter(n => draw.includes(n)).map(n => draw.indexOf(n) + 1) : [], stakeRd: w.stake, prizeRd: w.prize, sealedAt: w.sealed_at, resultSeenAt: seenAt(w.game, w.date), hash: w.ledger_hash }; });
  for (const p of past.filter(p => p.status === 'acerto')) wins.unshift({ kind: 'su_numero', game: p.game, name: p.name, date: p.date, time: p.time, method: p.method, methodLabel: p.methodLabel, numbers: p.numbers, draw: p.draw, positions: (p.hits || []).map(h => p.draw.indexOf(h) + 1), stakeRd: p.stakeRd, prizeRd: p.prizeRd, sealedAt: p.sealedAt, resultSeenAt: p.resultSeenAt, hash: p.hash });
  // 📋 La lista de apuestas: las que vienen (con la hora del sorteo) y las que ya salieron, que se quedan 24 horas
  // con su resultado; las nuevas entran arriba y empujan las viejas hacia abajo.
  const at = (game, date) => { const [h, m] = GAMES[game].time(new Date(date + 'T12:00:00Z').getUTCDay()); return rdTimeToUtc(date, h, m); };
  const nowMs = now.getTime(), DAY = 864e5;
  const feed = [];
  for (const u of upcoming) if (u.pick) {
    const d = at(u.game, u.date);
    feed.push({ game: u.game, name: u.name, date: u.date, time: u.time, drawAt: d.toISOString(), state: 'por_jugar', numbers: u.pick.numbers, stakeRd: u.pick.stakeRd, perNumberRd: u.pick.perNumberRd,
      sealedAt: u.pick.sealedAt, why: u.pick.why, methodLabel: u.pick.methodLabel, stakeWhy: u.pick.stakeWhy });
  }
  for (const p of past) {
    if (!GAMES[p.game]) continue;
    const d = at(p.game, p.date);
    if (nowMs - d.getTime() > DAY && p.status !== 'esperando') continue; // ya pasó su día: se va al historial
    feed.push({ game: p.game, name: p.name, date: p.date, time: p.time, drawAt: d.toISOString(), leavesAt: new Date(d.getTime() + DAY).toISOString(),
      state: p.status === 'esperando' ? (d.getTime() > nowMs ? 'por_jugar' : 'esperando_resultado') : p.status === 'acerto' ? 'gano' : 'perdio',
      numbers: p.numbers, stakeRd: p.stakeRd, perNumberRd: p.perNumberRd, sealedAt: p.sealedAt, resultSeenAt: p.resultSeenAt, draw: p.draw, hits: p.hits,
      prizeRd: p.prizeRd, pnlRd: p.pnlRd, why: p.why, methodLabel: p.methodLabel, explain: p.explain });
  }
  const seenKey = new Set();
  const feedList = feed.filter(f => { const k = `${f.game}|${f.date}`; if (seenKey.has(k)) return false; seenKey.add(k); return true; })
    .sort((a, b) => (a.drawAt < b.drawAt ? 1 : -1));
  const done = past.filter(p => p.status !== 'esperando');
  const staked = done.reduce((s, p) => s + (p.stakeRd || 0), 0), won = done.reduce((s, p) => s + (p.prizeRd || 0), 0);
  return { rate, upcoming, past, feed: feedList, wins, summary: { picks: done.length, hits: done.filter(p => p.status === 'acerto').length, stakedRd: staked, wonRd: won, netRd: won - staked },
    honest: 'Cada número se sella con hora y huella ANTES del sorteo; después se compara con el resultado oficial. En quiniela cada número tiene 3 de cada 100 de salir: ningún método puede adivinar el próximo si el sorteo es justo.' };
}
