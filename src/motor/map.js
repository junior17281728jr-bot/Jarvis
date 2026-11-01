// El mapa de oportunidades: dónde está cada empresa (te recomiendo / en observación / no te recomiendo / descartada),
// ordenadas por lo que más te conviene, con el porqué explícito y qué le falta a cada una para subir.
// El explorador nunca para: estudia empresas nuevas y reemplaza las que llevan mucho tiempo en "no te recomiendo".
// Ningún movimiento se borra: cada cambio de zona queda sellado con su motivo.
import { nowIso, activity, getSetting, setSetting } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { round } from '../core/util.js';
import { getBars } from '../stocks/market.js';
import { universe, updateSymbol, BENCH } from '../stocks/collector.js';
import { cardFor } from './recommend.js';
import { recommendedAmount } from './track.js';
import { getBudget, evidence, sizeFor, baseAmount } from './sizing.js';
import { getProfile, personalConv, wants, STYLES } from './profile.js';

/** Empresas y fondos grandes de EE. UU. que el explorador va estudiando por turnos. */
export const CANDIDATES = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'KO', 'JNJ', 'V', 'WMT', 'COST', 'XOM', 'AVGO', 'LLY', 'MA', 'UNH', 'HD', 'PG',
  'PEP', 'MCD', 'NFLX', 'DIS', 'ORCL', 'CRM', 'ADBE', 'AMD', 'INTC', 'BAC', 'CVX', 'ABBV', 'MRK', 'PFE', 'TMO', 'NKE', 'SBUX', 'CSCO', 'QCOM', 'TXN', 'IBM', 'CAT', 'GS',
  'VOO', 'QQQ', 'VTI', 'SCHD'];
export const ZONES = { verde: 'recomendada', amarillo: 'observacion', rojo: 'no_recomendada' };
export const ZONE_LABEL = { recomendada: 'Te recomiendo', observacion: 'En observación', no_recomendada: 'No te recomiendo', candidata: 'Explorando', descartada: 'Fuera del mapa' };
const lc = t => t.charAt(0).toLowerCase() + t.slice(1);
const RANK = { recomendada: 3, observacion: 2, no_recomendada: 1, candidata: 0, descartada: 0 };
const MAX_ACTIVE = 15, RED_STREAK = 10, RECHECK_DAYS = 14;

/** ¿Cuánto te conviene? 0–100: chance de ganarle al mercado, ganancia probable, chance de perder y paciencia que pide. */
export function convenience(card) {
  const cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  const p = card.projection?.personal, t = card.timing;
  const pat = !t ? 0.3 : t.immediate ? 1 : t.recommended ? ({ 5: 1, 21: 0.9, 63: 0.8, 126: 0.6, 252: 0.4 }[t.recommended.days] ?? 0.5) : 0.15;
  const raw = cl(card.probBeat ?? 0.5, 0.35, 0.65) * 40 + (p ? cl(p.probable / 10, -0.05, 0.2) * 25 + (1 - p.lossChance) * 20 : 22) + pat * 15;
  // El veredicto manda: una que no te recomiendo nunca aparece como "muy conveniente"
  return round(raw * ({ verde: 1, amarillo: 0.85, rojo: 0.55 }[card.light] ?? 0.55), 0);
}

const NEED = {
  tendencia: 'Que le vaya mejor que al mercado durante varias semanas (ahora va por detrás).',
  historial: 'Que JARVIS acierte más con ella: hoy falla más de lo que acierta.',
  riesgo: 'Que se calme: hoy sube y baja demasiado para tu dinero.',
  polemicas: 'Que se aclaren las noticias negativas.',
  empresa: 'Mejores números en sus informes oficiales (ventas y ganancias).',
};

/** Todo lo que la pantalla necesita decir de forma explícita: veredicto, por qué, qué falta y cuánto tiempo dejarla. */
export function explain(card, { budgetUsd = 100, style = 'equilibrado' } = {}) {
  const zone = ZONES[card.light] || 'no_recomendada';
  const amt = baseAmount(card.light, budgetUsd, style);
  const contrib = Object.fromEntries((card.contributions || []).map(c => [c.factor, c.contribution]));
  const reasons = card.reasons || [];
  const favor = reasons.filter(r => (contrib[r.factor] ?? 0) > 0.5).sort((a, b) => contrib[b.factor] - contrib[a.factor]);
  const against = reasons.filter(r => r.factor === 'calibracion' || (contrib[r.factor] ?? 0) < -0.5).sort((a, b) => (contrib[a.factor] ?? -99) - (contrib[b.factor] ?? -99));
  const verdict = zone === 'recomendada' ? `Sí, te recomiendo invertir US$${amt}` : zone === 'observacion' ? `Invierte poco: US$${amt}, con cuidado` : 'No te recomiendo invertir ahora';
  const why = zone === 'recomendada' ? favor.slice(0, 2).map(r => r.text) : zone === 'observacion' ? [favor[0], against[0]].filter(Boolean).map(r => r.text) : against.slice(0, 2).map(r => r.text);
  if (!why.length) why.push(reasons[0]?.text || 'Las razones a favor y en contra están parejas.');
  const need = zone === 'recomendada' ? [] : [...new Set(against.map(r => (r.factor === 'calibracion' ? `Que los casos parecidos salgan mejor: hoy le ganó al mercado ${Math.round((card.probBeat ?? 0.5) * 10)} de cada 10 veces.` : NEED[r.factor])).filter(Boolean))].slice(0, 3);
  if (zone !== 'recomendada' && !need.length) need.push('Más pruebas a favor: hoy lo bueno y lo malo están parejos.');
  const t = card.timing;
  const hold = !t ? 'Faltan precios para saber cuánto tiempo dejarla.'
    : t.immediate ? 'Puede dar ganancia en pocas semanas, aunque no siempre.'
      : t.recommended ? `Déjala al menos ${t.recommended.label}: esperando eso, estuvo ganando ${Math.round(t.pProfit[t.recommended.days] * 10)} de cada 10 veces.`
        : 'Sube y baja mucho: si entras, que sea con dinero que puedas dejar 1 año o más.';
  const exitIf = zone === 'recomendada' || zone === 'observacion' ? ['Si cae 8% desde tu compra, sal y no esperes más.', 'Si en la revisión diaria pasa a "No te recomiendo", te aviso.'] : [];
  return { zone, verdict, amountUsd: amt, why, need, hold, exitIf };
}

const compact = c => ({ symbol: c.symbol, light: c.light, score: c.score, probBeat: c.probBeat, probMethod: c.probMethod, price: c.price, projection: { personal: c.projection?.personal || null },
  timing: c.timing, reasons: c.reasons, contributions: c.contributions, lightBefore: c.lightBefore || null });

function move(db, { symbol, from, to, reason, date }) {
  const s = seal(db, { kind: 'mapa', ref: symbol, payload: { symbol, from, to, reason } });
  db.prepare('INSERT INTO map_moves (ts, symbol, from_zone, to_zone, reason, ledger_hash) VALUES (?, ?, ?, ?, ?, ?)').run(date || s.ts, symbol, from, to, reason, s.hash);
  const up = (RANK[to] ?? 0) > (RANK[from] ?? 0);
  if (from && to !== from) activity(db, { agent: 'largo', type: 'mapa', important: to === 'recomendada' || from === 'recomendada', text: `${symbol}: ${ZONE_LABEL[from] || from} → ${ZONE_LABEL[to]}. ${reason}` });
  return up;
}

/** Después de cada ranking diario: pone cada empresa en su zona y anota si subió o bajó (con el motivo). */
export function updateMap(db, cards, { date = nowIso().slice(0, 10) } = {}) {
  let moves = 0;
  for (const c of cards) {
    const e = explain(c), conv = convenience(c), prev = db.prepare('SELECT * FROM map_entries WHERE symbol = ?').get(c.symbol);
    const reds = e.zone === 'no_recomendada' ? (prev?.zone === 'no_recomendada' ? prev.reds + 1 : 1) : 0;
    if (!prev || prev.zone !== e.zone) {
      const up = prev && (RANK[e.zone] > RANK[prev.zone]);
      const reason = !prev ? `Primera revisión: ${lc(e.verdict)}.` : up ? `Subió: ${e.why[0]}` : `Bajó: ${e.why[0]}`;
      move(db, { symbol: c.symbol, from: prev?.zone || null, to: e.zone, reason, date }); moves++;
    }
    db.prepare(`INSERT INTO map_entries (symbol, zone, conv, light, prob, since, checked_at, reds, card) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET zone = excluded.zone, conv = excluded.conv, light = excluded.light, prob = excluded.prob, checked_at = excluded.checked_at, reds = excluded.reds, card = excluded.card,
      since = CASE WHEN map_entries.zone = excluded.zone THEN map_entries.since ELSE excluded.since END`)
      .run(c.symbol, e.zone, conv, c.light, c.probBeat ?? null, date, date, reds, JSON.stringify(compact(c)));
  }
  return moves;
}

/** El explorador: estudia unas pocas empresas nuevas por vuelta y, si encuentra una mejor, la mete al mapa. */
export async function exploreStep(db, cfg, { n = 3, fetchImpl = fetch, fetchBars = null, date = nowIso().slice(0, 10) } = {}) {
  const U = universe(db), inU = new Set(U);
  const spy = getBars(db, BENCH);
  const seen = new Map(db.prepare('SELECT symbol, zone, checked_at FROM map_entries').all().map(r => [r.symbol, r]));
  const due = s => { const r = seen.get(s); return !r || ((r.zone === 'candidata' || r.zone === 'descartada') && Date.parse(date) - Date.parse(r.checked_at) >= RECHECK_DAYS * 864e5); };
  const dropped = [...seen.values()].filter(r => r.zone === 'descartada').map(r => r.symbol);
  const queue = [...new Set([...dropped, ...CANDIDATES])].filter(s => !inU.has(s) && s !== BENCH && due(s)).sort((a, b) => (seen.get(a)?.checked_at || '').localeCompare(seen.get(b)?.checked_at || ''));
  const studied = [];
  for (const sym of queue.slice(0, n)) {
    try { await (fetchBars ? fetchBars(sym) : updateSymbol(db, cfg, sym, { fetchImpl })); } catch (err) { studied.push({ symbol: sym, error: err.message }); continue; }
    const card = cardFor(db, sym, spy);
    if (!card) { studied.push({ symbol: sym, error: 'pocos precios' }); continue; }
    delete card._bars;
    const e = explain(card), conv = convenience(card), prev = seen.get(sym);
    const zone = prev?.zone === 'descartada' ? 'descartada' : 'candidata';
    db.prepare(`INSERT INTO map_entries (symbol, zone, conv, light, prob, since, checked_at, reds, card, note) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET conv = excluded.conv, light = excluded.light, prob = excluded.prob, checked_at = excluded.checked_at, card = excluded.card, note = excluded.note`)
      .run(sym, zone, conv, card.light, card.probBeat, date, date, JSON.stringify(compact(card)), e.verdict);
    if (!prev) move(db, { symbol: sym, from: null, to: 'candidata', reason: `Empecé a estudiarla: ${lc(e.verdict)} (conveniencia ${conv}).`, date });
    activity(db, { agent: 'largo', type: 'explorar', text: `Exploré ${sym}: ${lc(e.verdict)} · conveniencia ${conv}/100.` });
    studied.push({ symbol: sym, conv, zone: e.zone });
  }
  // ¿Alguna estudiada es mejor que lo que ya está en el mapa?
  const best = db.prepare("SELECT * FROM map_entries WHERE zone IN ('candidata','descartada') AND light != 'rojo' ORDER BY conv DESC LIMIT 1").get();
  let swap = null;
  if (best) {
    const active = db.prepare(`SELECT * FROM map_entries WHERE symbol IN (${U.map(() => '?').join(',')}) AND symbol != ?`).all(...U, BENCH);
    const card = JSON.parse(best.card), e = explain(card);
    const enter = (reason, out = null) => {
      const next = universe(db).filter(s => s !== out).concat(best.symbol);
      setSetting(db, 'global', 'stocks.universe', next);
      db.prepare('UPDATE map_entries SET zone = ?, since = ?, reds = 0 WHERE symbol = ?').run(e.zone, date, best.symbol);
      move(db, { symbol: best.symbol, from: best.zone, to: e.zone, reason, date });
    };
    if (U.filter(s => s !== BENCH).length < MAX_ACTIVE) { enter(`Entró al mapa: ${lc(e.verdict)} (conveniencia ${best.conv}).`); swap = { in: best.symbol }; }
    else {
      const worst = active.filter(a => a.reds >= RED_STREAK).sort((a, b) => a.conv - b.conv)[0];
      if (worst && best.conv > worst.conv + 5) {
        db.prepare("UPDATE map_entries SET zone = 'descartada', since = ? WHERE symbol = ?").run(date, worst.symbol);
        move(db, { symbol: worst.symbol, from: worst.zone, to: 'descartada', reason: `Salió del mapa: lleva ${worst.reds} revisiones seguidas en "No te recomiendo" y ${best.symbol} conviene más (${best.conv} vs ${worst.conv}). La vuelvo a revisar cada ${RECHECK_DAYS} días.`, date });
        enter(`Entró en lugar de ${worst.symbol}: ${lc(e.verdict)} (conveniencia ${best.conv} vs ${worst.conv}).`, worst.symbol);
        swap = { in: best.symbol, out: worst.symbol };
      }
    }
  }
  setSetting(db, 'global', 'map.explore', { at: nowIso(), studied: studied.length, queue: Math.max(0, queue.length - n) });
  return { studied, swap };
}

/** Lo que muestra la pantalla Mapa. */
export function mapView(db, { userId = null } = {}) {
  const budget = getBudget(db, userId), ev = evidence(db), profile = userId ? getProfile(db, userId) : null, style = profile?.style || 'equilibrado';
  const U = new Set(universe(db));
  const rows = db.prepare('SELECT * FROM map_entries').all().map(r => {
    const card = r.card ? JSON.parse(r.card) : null;
    return { symbol: r.symbol, zone: r.zone, conv: r.conv, since: r.since, checkedAt: r.checked_at, reds: r.reds, active: U.has(r.symbol), card, ...(card ? explain(card, { budgetUsd: budget.usd, style }) : {}), size: card ? sizeFor(card, budget, ev, style) : null, myConv: card && profile ? personalConv(card, profile) : r.conv, wanted: !profile || wants(profile, r.symbol), zoneNow: r.zone };
  }).filter(r => r.card);
  const lastMove = new Map(db.prepare('SELECT symbol, from_zone, to_zone, ts FROM map_moves ORDER BY id').all().map(m => [m.symbol, m]));
  for (const r of rows) { r.zone = r.zoneNow; delete r.zoneNow; const m = lastMove.get(r.symbol); r.trend = m && m.from_zone ? ((RANK[m.to_zone] ?? 0) > (RANK[m.from_zone] ?? 0) ? 'sube' : (RANK[m.to_zone] ?? 0) < (RANK[m.from_zone] ?? 0) ? 'baja' : null) : null; }
  // Mismo núcleo para todos; el orden se adapta al estilo de cada persona y oculta lo que no le interesa
  const by = z => rows.filter(r => r.zone === z && r.wanted).sort((a, b) => b.myConv - a.myConv);
  const zones = { recomendada: by('recomendada'), observacion: by('observacion'), no_recomendada: by('no_recomendada'), candidata: by('candidata'), descartada: by('descartada') };
  const order = [...zones.recomendada, ...zones.observacion, ...zones.no_recomendada];
  order.forEach((r, i) => { r.rank = i + 1; });
  const ex = getSetting(db, 'global', 'map.explore', null);
  const studied = rows.filter(r => !r.active).length + rows.filter(r => r.active).length;
  return {
    budget, evidence: ev, rows, profile, styleLabel: STYLES[style].label,
    zones, best: zones.recomendada[0] || zones.observacion[0] || null,
    moves: db.prepare('SELECT * FROM map_moves ORDER BY id DESC LIMIT 40').all(),
    explore: { pool: CANDIDATES.length, studied, pending: CANDIDATES.filter(s => !rows.some(r => r.symbol === s)).length, lastAt: ex?.at || null, every: '6 horas', recheckDays: RECHECK_DAYS, maxActive: MAX_ACTIVE, redStreak: RED_STREAK },
  };
}

/**
 * Vigila TUS inversiones reales (las que anotaste en Historial → Dinero real): si una cae 8% desde tu compra
 * o pasa a "No te recomiendo", te avisa una sola vez para que decidas salir. JARVIS nunca vende por ti.
 */
export function watchRealPositions(db) {
  const sent = getSetting(db, 'global', 'real.alerts', {});
  const out = [];
  for (const r of db.prepare("SELECT * FROM real_entries WHERE module = 'bolsa' AND status = 'abierta'").all()) {
    const d = JSON.parse(r.detail), q = db.prepare('SELECT price FROM stock_quotes WHERE symbol = ?').get(d.symbol);
    const zone = db.prepare('SELECT zone FROM map_entries WHERE symbol = ?').get(d.symbol)?.zone;
    const drop = q ? q.price / d.price - 1 : null;
    const alerts = [];
    if (drop != null && drop <= -0.08) alerts.push(['caida', `Tu inversión REAL en ${d.symbol} va ${round(drop * 100, 1)}% desde tu compra (US$${d.price}). Tu regla dice salir al -8%: revisa y decide en tu bróker.`]);
    if (zone === 'no_recomendada' || zone === 'descartada') alerts.push(['zona', `Tu inversión REAL en ${d.symbol} pasó a "${ZONE_LABEL[zone]}". Mira el análisis y decide si salir.`]);
    for (const [kind, text] of alerts) {
      const key = `${r.id}:${kind}`;
      if (sent[key]) continue;
      sent[key] = nowIso();
      activity(db, { agent: 'largo', type: 'alerta', important: true, text, userId: r.user_id });
      out.push({ id: r.id, kind, text });
    }
  }
  setSetting(db, 'global', 'real.alerts', sent);
  return out;
}

/** Líneas del mapa para el resumen diario. */
export function mapDigest(db) {
  const v = mapView(db), since = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const moved = v.moves.filter(m => String(m.ts).slice(0, 10) >= since && m.from_zone);
  return [
    v.best ? `• Mejor opción: ${v.best.symbol} → ${v.best.verdict}. ${v.best.hold}` : '• Hoy no te recomiendo invertir en ninguna.',
    `• Mapa: ${v.zones.recomendada.length} te recomiendo, ${v.zones.observacion.length} en observación, ${v.zones.no_recomendada.length} no te recomiendo; explorando ${v.zones.candidata.length} más.`,
    ...(moved.length ? [`• Cambios: ${moved.slice(0, 4).map(m => `${m.symbol} ${ZONE_LABEL[m.from_zone] || m.from_zone} → ${ZONE_LABEL[m.to_zone]}`).join('; ')}.`] : []),
  ];
}
