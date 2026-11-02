// ⭐ Sigue a la IA: lo que la IA MÁS cree que va a ganar, para que tú decidas si la sigues con tu dinero de práctica.
// Muestra qué tan segura está, por qué, lo que aprendió de sus propias operaciones y cómo le ha ido de verdad.
import { valuation } from '../stocks/account.js';
import { getQuote } from '../stocks/market.js';
import { aiAccount, riskDecision, marketRegime, AI_OWNER } from './autopilot.js';
import { retoAccount, RETO_OWNER } from './reto.js';
import { tradeLessons, contextFor, judge } from './trade-lessons.js';
import { methodVotes } from './lottery-agent.js';
import { nextDraw } from '../lottery/simulator.js';
import { GAMES } from '../lottery/games.js';
import { round } from '../core/util.js';
import { getBars } from '../stocks/market.js';
import { sd } from '../core/util.js';

const volOf = (db, s) => { const b = getBars(db, s).slice(-253); if (b.length < 60) return null; const r = b.slice(1).map((x, i) => x.close / b[i].close - 1); return sd(r) * Math.sqrt(252); };

export function followView(db, { userTotal = 100 } = {}) {
  const ai = aiAccount(db), v = valuation(db, ai.id, s => getQuote(db, s)?.price ?? null);
  const lessons = tradeLessons(db, [{ id: ai.id, owner: AI_OWNER }, { id: retoAccount(db).id, owner: RETO_OWNER }]);
  const mk = marketRegime(db);
  const picks = db.prepare("SELECT symbol, conv, light FROM map_entries WHERE zone = 'recomendada' AND light = 'verde' ORDER BY conv DESC LIMIT 8").all().map(e => {
    const card = (() => { try { const r = db.prepare('SELECT payload FROM recommendations WHERE symbol = ? ORDER BY id DESC LIMIT 1').get(e.symbol); return r ? JSON.parse(r.payload) : null; } catch { return null; } })();
    const vol = volOf(db, e.symbol);
    // Mismo cálculo que usa la IA con su dinero, pero con TU dinero de práctica
    const d = riskDecision(db, { symbol: e.symbol, conv: e.conv, total: userTotal, start: userTotal, peak: userTotal, vol });
    const J = judge(lessons, contextFor({ level: d.level, regime: mk, vol, card, light: e.light }));
    const pct = J.avoid ? 0 : J.boost ? Math.min(0.30, d.pct * 1.5) : d.pct;
    const top = (card?.reasons || []).find(r => r.factor !== 'calibracion')?.text || '';
    return { symbol: e.symbol, conv: e.conv, level: d.level, pct: Math.round(pct * 100), usd: round(userTotal * pct, 2), probBeat: card?.probBeat ?? null, why: top, learned: J.why, avoid: J.avoid,
      aiHas: v.positions.some(p => p.symbol === e.symbol) };
  }).filter(p => !p.avoid).sort((a, b) => b.pct - a.pct || b.conv - a.conv).slice(0, 3);
  // Lotería: los 3 primeros del orden aprendido del sorteo que viene más pronto
  let loto = null;
  try {
    const next = Object.keys(GAMES).map(g => { try { return { g, nd: nextDraw(g) }; } catch { return null; } }).filter(Boolean).sort((a, b) => a.nd.close - b.nd.close)[0];
    const vv = next && methodVotes(db, next.g);
    if (vv) loto = { game: next.g, name: GAMES[next.g].name, date: vv.date, closesAt: next.nd.close.toISOString(), numbers: vv.order.slice(0, 3).map(o => ({ num: o.num, prob: o.prob })), fair: vv.fairProb, perNumberRd: 100 };
  } catch { /* sin datos */ }
  const wins = v.closed.filter(c => c.pnl > 0).length;
  return {
    record: { closed: v.closed.length, wins, losses: v.closed.length - wins, returnPct: round(v.returnPct * 100, 2), total: round(v.total, 2) },
    picks, loto, lessons: { closed: lessons.closed, minCases: lessons.minCases, avoid: lessons.avoid.map(s => s.text), repeat: lessons.repeat.map(s => s.text), stats: lessons.stats.slice(0, 8) },
    note: 'Es lo que la IA haría con TU dinero de práctica, con las mismas reglas y frenos que usa con el suyo. Tú decides si la sigues.',
  };
}
