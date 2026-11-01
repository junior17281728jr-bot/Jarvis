import { mapDigest, mapView } from './map.js';
import { getBudget } from './sizing.js';
// Lo que se muestra: pantalla de inicio, estadísticas y resumen diario en lenguaje simple.
import { getSetting } from '../core/db.js';
import { round, wilson } from '../core/util.js';
import { ensureAccount, valuation } from '../stocks/account.js';
import { getQuote } from '../stocks/market.js';
import { leagueTable, cheatReports } from './league.js';
import { strategiesSummary } from './research.js';
import { latestRanking } from './recommend.js';
import { playStats } from '../lottery/simulator.js';
import { latest } from '../lottery/results.js';
import { liveMethodStats } from './lottery-agent.js';
import { expectedReturn } from '../lottery/payouts.js';

export function predictionStats(db, module = null) {
  const rows = db.prepare(`SELECT correct, resolved_at FROM predictions WHERE (? IS NULL OR module = ?) ORDER BY sealed_at`).all(module, module);
  const done = rows.filter(r => r.correct !== null);
  const hits = done.filter(r => r.correct === 1).length;
  let cur = 0, type = null, bestW = 0, bestL = 0;
  for (const r of done) { const k = r.correct ? 'acierto' : 'fallo'; cur = k === type ? cur + 1 : 1; type = k; if (k === 'acierto') bestW = Math.max(bestW, cur); else bestL = Math.max(bestL, cur); }
  const w = wilson(hits, done.length);
  return { total: rows.length, resolved: done.length, pending: rows.length - done.length, hits, misses: done.length - hits,
    hitRate: done.length ? round(hits / done.length * 100, 1) : null, range: done.length ? [round(w.lo * 100), round(w.hi * 100)] : null,
    streak: { current: cur, type, bestHits: bestW, bestMisses: bestL } };
}

export function aiSpend(db, cfg) {
  const m = db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE ts >= ?').get(new Date().toISOString().slice(0, 7) + '-01').c;
  const d = db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE ts >= ?').get(new Date().toISOString().slice(0, 10)).c;
  return { month: round(m, 4), day: round(d, 4), monthCap: cfg.aiMonthlyCapUsd, dayCap: cfg.aiDailyCapUsd };
}

export function home(db, cfg, user) {
  const acc = ensureAccount(db, { owner: `user:${user.id}`, userId: user.id, name: getSetting(db, `user:${user.id}`, 'account.name', 'principal'), startCash: getBudget(db, user.id).usd ?? cfg.startCashUsd });
  const v = valuation(db, acc.id, s => getQuote(db, s)?.price);
  const spyQ = getQuote(db, 'SPY');
  const lot = playStats(db, { agent: 'loteria' });
  const azar = liveMethodStats(db).find(m => m.method === 'azar');
  const heartbeat = getSetting(db, 'global', 'motor.heartbeat', null);
  const mv = mapView(db, { userId: user.id }), mb = mv.best;
  return { budget: getBudget(db, user.id), myBest: mb ? { symbol: mb.symbol, light: mb.card.light, probBeat: mb.card.probBeat, timing: mb.card.timing, reasons: mb.card.reasons } : null, styleLabel: mv.styleLabel,
    user: { username: user.username, role: user.role },
    system: { heartbeat, alive: heartbeat ? Date.now() - Date.parse(heartbeat) < 20 * 60e3 : false, motor: getSetting(db, 'global', 'motor.state', { running: false }) },
    ai: aiSpend(db, cfg),
    account: { total: round(v.total), start: v.start, returnPct: round(v.returnPct * 100, 2), cash: round(v.cash), realized: round(v.realized, 2), unrealized: round(v.unrealized, 2), positions: v.positions, spy: spyQ ? { price: spyQ.price, changePct: spyQ.prev_close ? round((spyQ.price / spyQ.prev_close - 1) * 100, 2) : null } : null },
    predictions: predictionStats(db),
    rankingStats: predictionStats(db, 'ranking'),
    league: leagueTable(db, new Date(Date.now() - 7 * 864e5).toISOString()),
    cheats: cheatReports(db, 5),
    ranking: latestRanking(db).slice(0, 6),
    opportunities: opportunities(db, cfg),
    setup: [
      { ok: !!db.prepare('SELECT 1 FROM stock_bars LIMIT 1').get(), text: 'Precios de la bolsa cargados', how: 'Se cargan solos en la primera hora; para precios en vivo agrega las claves gratis de Alpaca.' },
      { ok: !!cfg.openaiKey, text: 'Clave de ChatGPT conectada', how: 'Ponla en .env (OPENAI_API_KEY) con un límite de gasto en platform.openai.com.' },
      { ok: !!cfg.alpacaKey, text: 'Precios en vivo (Alpaca)', how: 'Cuenta gratis de práctica en alpaca.markets; solo datos, nunca dinero real.' },
      { ok: !!cfg.ntfyTopic, text: 'Avisos al celular', how: 'App gratis ntfy + NTFY_TOPIC en .env.' },
      { ok: !!(cfg.backupPassphrase && cfg.rcloneRemote), text: 'Copia fuera del servidor', how: 'rclone con Google Drive + BACKUP_PASSPHRASE en .env.' },
      { ok: !!getSetting(db, 'global', 'motor.state', { running: false }).running, text: 'Motor autónomo encendido', how: 'Ajustes → Motor autónomo → Iniciar.' },
    ],
    learning: strategiesSummary(db),
    lottery: { stats: lot, latest: latest(db), expectedQuinielaPer100: round(expectedReturn('quiniela') * 100, 1), randomLivePer100: azar?.per100 ?? null, effort: getSetting(db, 'global', 'lottery.effort', 'normal'), scan: getSetting(db, 'global', 'lottery.lastScan', null) },
    activity: db.prepare('SELECT * FROM activity WHERE user_id IS NULL OR user_id = ? ORDER BY id DESC LIMIT 30').all(user.id),
  };
}

/** Lo que se puede ganar o perder con las mejores ideas, en % (sirve para cualquier monto) y con el mínimo para entrar. */
export function opportunities(db, cfg, k = 3) {
  const fixed = getSetting(db, 'global', 'stocks.fixedCostUsd', 0);
  const worth = fixed > 0 ? Math.max(cfg.tradeMinUsd, Math.ceil(fixed / 0.02)) : cfg.tradeMinUsd;
  return latestRanking(db).filter(c => c.light !== 'rojo' && c.projection?.ejemplo).slice(0, k).map(c => {
    const p = c.projection.ejemplo, a = p.amountUsd;
    return { symbol: c.symbol, light: c.light, confidence: c.confidence, probBeat: c.probBeat ?? null, timing: c.timing ?? null, why: c.reasons[0]?.text || '', months: Math.round(p.days / 21),
      pct: { bad: round(p.bad / a * 100, 1), probable: round(p.probable / a * 100, 1), good: round(p.good / a * 100, 1) }, lossChance: p.lossChance,
      minimum: cfg.tradeMinUsd, minimumWorth: worth, fixedCostUsd: fixed };
  });
}

export function dailySummary(db) {
  const p = predictionStats(db), r = latestRanking(db), l = playStats(db, { agent: 'loteria' }), s = strategiesSummary(db);
  const green = r.filter(c => c.light === 'verde').map(c => c.symbol), amber = r.filter(c => c.light === 'amarillo').map(c => c.symbol);
  return [
    `Buenos días. Resumen de JARVIS:`,
    ...mapDigest(db),
    `• Predicciones: ${p.hits} aciertos y ${p.misses} fallos${p.hitRate != null ? ` (${p.hitRate}%)` : ''}; ${p.pending} pendientes.`,
    `• Bolsa: ${green.length ? `verdes ${green.join(', ')}` : 'ninguna en verde'}${amber.length ? `; amarillas ${amber.slice(0, 4).join(', ')}` : ''}.`,
    `• Investigación: ${s.experiments} experimentos; en prueba en vivo: ${s.byStatus.en_prueba || 0}; validadas: ${s.byStatus.validada || 0}.`,
    `• Loterías: ${l.settled} jugadas virtuales, devuelven RD$${l.per100 ?? '—'} por cada RD$100 (el azar justo ≈ RD$72).`,
    `Todo es dinero virtual. La decisión de invertir dinero real es tuya.`,
  ].join('\n');
}
