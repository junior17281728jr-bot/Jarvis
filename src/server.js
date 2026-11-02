// Servidor de JARVIS: API + pantallas + ciclo automático. Sin dependencias externas.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, config } from './core/config.js';
import { openDb, getSetting, setSetting, audit, nowIso, activity } from './core/db.js';
import { createUser, login, logout, makeTvCode, loginWithTvCode, makeDeviceToken, loginWithDevice, forgetDevice, userFromToken, countUsers, changeOwnPassword, resetPassword, setActive, setDisplayName } from './core/auth.js';
import { verifyLedger } from './core/ledger.js';
import { recentErrors } from './core/jobs.js';
import { runCycle, startMotor, pauseMotor, resumeMotor, stopMotor, motorState, taskStatus } from './motor/cycle.js';
import { home, predictionStats, aiSpend, dailySummary } from './motor/reports.js';
import { latestRanking, debateTop } from './motor/recommend.js';
import { leagueTable, cheatReports, ensureAgents, coinAudit } from './motor/league.js';
import { strategiesSummary, seedAgenda } from './motor/research.js';
import { pickOfTheDay, liveMethodStats, methodVotes } from './motor/lottery-agent.js';
import { runDebate } from './ai/debate.js';
import { complete, available, DEFAULT_PRICES } from './ai/providers.js';
import { ensureAccount, valuation, placeOrder } from './stocks/account.js';
import { getBars, getQuote, quoteStatus, marketOpen } from './stocks/market.js';
import { factsFor, universe, DEFAULT_UNIVERSE } from './stocks/collector.js';
import { adviseAmount, project } from './stocks/advice.js';
import { GAMES } from './lottery/games.js';
import { history, latest, recordObservation } from './lottery/results.js';
import { compareMethods, playStats, sealPlay, nextDraw } from './lottery/simulator.js';
import { scan, numberInsights, frequencies } from './lottery/stats.js';
import { DEFAULT_PAYOUTS, expectedReturn } from './lottery/payouts.js';
import { SEED } from './lottery/seed-data.js';
import { round } from './core/util.js';
import { whatIf, monthlyGrade, emotionPause, fx } from './motor/insights.js';
import { stockAnalysis, lotteryAnalysis, explainAnalysis, analysisHistory, fetchProfile } from './motor/analysis.js';
import { historyList, performance, addReal, closeReal, realSummary } from './motor/track.js';
import { sendPush } from './core/notify.js';
import { mapView, exploreStep } from './motor/map.js';
import { aiView } from './motor/autopilot.js';
import { brainSummary, exportBrain, restoreBrain, brainFileInfo } from './core/brain.js';
import { legalDoc, acceptLegal, currentAcceptance, listAcceptances, signedText, LEGAL_VERSION } from './core/legal.js';
import { aiOn, suggestStocks, aiSuggestions, lotteryExplain } from './ai/plus.js';
import { packEconomics, creditSettings, saveCreditSettings, creditStatus, createRequest, listRequests, decideRequest, receiptFile, grantCredits } from './motor/credits.js';
import { getProfile, saveProfile, profileLine, STYLES, HORIZONS } from './motor/profile.js';
import { getBudget, saveBudget, sizeFor, evidence, finder, bigBetCheck } from './motor/sizing.js';
import { publicBrand, saveBrand, logoFile, manifest } from './core/brand.js';
import { setTradingDays } from './stocks/market.js';
import { loadSecrets, keyStatus, saveKeys } from './core/secrets.js';

loadEnv();
const cfg = config();
loadSecrets(cfg);
const db = openDb(cfg.dbPath);
ensureAgents(db); seedAgenda(db);
if (!db.prepare('SELECT 1 FROM lottery_observations LIMIT 1').get()) for (const o of SEED) recordObservation(db, o);
setTradingDays(getSetting(db, 'global', 'market.tradingDays', null)?.days);

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const cache = new Map();
const cached = (key, ms, fn) => { const c = cache.get(key); if (c && Date.now() - c.t < ms) return c.v; const v = fn(); cache.set(key, { t: Date.now(), v }); return v; };

function send(res, code, body, headers = {}) {
  let out = typeof body === 'string' ? body : JSON.stringify(body);
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers };
  // Comprimido: carga más rápido en el celular y en la TV (sobre todo con internet lento)
  if (res.__gz && out.length > 1400) { out = gzipSync(out, { level: 6 }); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  res.writeHead(code, h);
  res.end(out);
}
async function body(req, max = 1e6) {
  let s = ''; for await (const ch of req) { s += ch; if (s.length > max) throw new Error('Petición demasiado grande.'); }
  return s ? JSON.parse(s) : {};
}
const tokenOf = req => (req.headers.cookie || '').split(';').map(x => x.trim().split('=')).find(([k]) => k === 'jv')?.[1];

// Cuenta de práctica de cada usuario: empieza con SU dinero; al reiniciarla, la anterior se guarda (nunca se borra)
function userAccount(user) {
  const name = getSetting(db, `user:${user.id}`, 'account.name', 'principal');
  return ensureAccount(db, { owner: `user:${user.id}`, userId: user.id, name, startCash: getBudget(db, user.id).usd ?? cfg.startCashUsd });
}
const tradeLimits = user => { const b = getBudget(db, user.id).usd; return { min: cfg.tradeMinUsd, max: Math.max(cfg.tradeMaxUsd, Math.round(b * 0.2)) }; };

// ---------- Rutas ----------
const routes = [];
const route = (method, path, handler, { auth = true, admin = false } = {}) => routes.push({ method, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, auth, admin });

/** Contraseña automática fácil de dictar: sin letras que se confunden (0/O, 1/l/I). */
function autoPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join('');
  return `${part()}-${part()}-${part()}`;
}
/** Con enlace público (Tailscale Funnel), el primer usuario solo se crea desde tu red privada: nadie de internet puede adueñarse de JARVIS. */
function setupAllowed(req) {
  if (process.env.SETUP_TAILNET_ONLY !== '1') return true;
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) || ip.toLowerCase().startsWith('fd7a:115c:a1e0')) return true; // http://jarvis:8080
  return false;
}
/** Si Tailscale pide permiso para el enlace público, el servidor guarda ese enlace de activación en funnel.log. */
function funnelEnableLink() {
  try { const m = readFileSync(join(dirname(cfg.dbPath), 'funnel.log'), 'utf8').match(/https:\/\/login\.tailscale\.com\/[^\s"'<>]+/); return m ? m[0] : null; } catch { return null; }
}
/** Enlace público para la TV o cualquier navegador (lo escribe el servidor cuando Tailscale Funnel queda activo). */
function publicUrl() {
  try { const u = readFileSync(join(dirname(cfg.dbPath), 'public-url.txt'), 'utf8').trim(); return /^https:\/\/[\w.-]+$/.test(u) ? u : null; } catch { return null; }
}
route('GET', '/api/setup', () => ({ needsSetup: countUsers(db) === 0 }), { auth: false });
route('POST', '/api/setup', async ({ req }) => {
  if (countUsers(db) > 0) throw Object.assign(new Error('JARVIS ya está configurado.'), { code: 403 });
  if (!setupAllowed(req)) throw Object.assign(new Error('Por seguridad, el primer usuario se crea desde tu celular con Tailscale abierto: entra a http://jarvis:8080'), { code: 403 });
  const b = await body(req);
  createUser(db, { username: b.username, password: b.password, role: 'admin' });
  return login(db, b.username, b.password);
}, { auth: false });
route('POST', '/api/login', async ({ req }) => { const b = await body(req); const r = login(db, b.username, b.password); if (b.remember) r.deviceToken = makeDeviceToken(db, r.user.id, req.headers['user-agent']); return r; }, { auth: false });
route('POST', '/api/login/device', async ({ req }) => { const b = await body(req); return loginWithDevice(db, b.username, b.token); }, { auth: false });
route('POST', '/api/login/forget', async ({ req }) => { const b = await body(req); if (b.token) forgetDevice(db, b.token); return { ok: true }; }, { auth: false });
// Lista de usuarios en la pantalla de entrada (el administrador la puede apagar en Ajustes)
route('GET', '/api/login/users', () => getSetting(db, 'global', 'login.showUsers', true)
  ? db.prepare('SELECT username u, COALESCE(display_name, username) name, role FROM users WHERE active = 1 ORDER BY (role = \'admin\') DESC, id').all().map(x => ({ u: x.u, name: x.name, admin: x.role === 'admin' }))
  : [], { auth: false });
route('POST', '/api/login/users', async ({ req }) => { const b = await body(req); setSetting(db, 'global', 'login.showUsers', !!b.show); return { show: !!b.show }; }, { admin: true });
route('POST', '/api/tvcode', ({ user }) => makeTvCode(db, user.id));
route('POST', '/api/tvlogin', async ({ req }) => { const b = await body(req); return loginWithTvCode(db, b.code); }, { auth: false });
route('POST', '/api/logout', ({ req }) => { logout(db, tokenOf(req)); return { ok: true }; });
route('GET', '/api/me', ({ user }) => ({ ...user, profile: getProfile(db, user.id), needsTerms: user.role !== 'admin' && !currentAcceptance(db, user.id, 'terminos') }));
route('GET', '/api/profile', ({ user }) => { const p = getProfile(db, user.id), b = getBudget(db, user.id); return { profile: p, budget: b, displayName: user.displayName, styles: STYLES, horizons: HORIZONS, line: profileLine(p, b.usd) }; });
route('POST', '/api/profile', async ({ req, user }) => {
  const b = await body(req);
  if (b.displayName !== undefined) setDisplayName(db, user.id, b.displayName);
  const p = saveProfile(db, user.id, b);
  if (b.budget) saveBudget(db, user.id, b.budget, { isAdmin: user.role === 'admin' });
  audit(db, user.id, 'perfil', { style: p.style, horizon: p.horizon });
  return { profile: p, line: profileLine(p, getBudget(db, user.id).usd) };
});
route('POST', '/api/me/password', async ({ req, user }) => { const b = await body(req); changeOwnPassword(db, user.id, b.current, b.next, tokenOf(req)); return { ok: true }; });
route('GET', '/api/brand', () => publicBrand(db), { auth: false });
route('POST', '/api/brand', async ({ req, user }) => { const b = await body(req); const out = saveBrand(db, b); audit(db, user.id, 'marca', Object.keys(b).filter(k => k !== 'logo').concat(b.logo ? ['logo'] : [])); return out; }, { admin: true });

route('GET', '/api/home', ({ user }) => home(db, cfg, user));
route('GET', '/api/activity', ({ url, user }) => db.prepare('SELECT * FROM activity WHERE id > ? AND (user_id IS NULL OR user_id = ?) ORDER BY id DESC LIMIT 60').all(Number(url.searchParams.get('after') || 0), user.id));

// ---------- Modo TV: titular con datos concretos y "pensamientos" del analista con datos reales ----------
const VOTE_TV = { tendencia: 'precio', historial: 'aciertos previos', empresa: 'salud de la empresa', riesgo: 'riesgo', polemicas: 'noticias' };
function cardFacts(c) {
  const t = (c.reasons || []).find(r => r.factor === 'tendencia')?.text || '';
  const m = t.match(/(subió|bajó) ([\d.]+)%/), mk = t.match(/(subieron|bajaron) ([\d.]+)%/);
  const votes = (c.contributions || []).filter(x => VOTE_TV[x.factor]), yes = votes.filter(x => x.value > 0.05), no = votes.filter(x => x.value < -0.05);
  return { r6: m ? (m[1] === 'bajó' ? -1 : 1) * Number(m[2]) : null, mk6: mk ? (mk[1] === 'bajaron' ? -1 : 1) * Number(mk[2]) : null, yes, no, votes, p10: c.probBeat != null ? Math.round(c.probBeat * 10) : null };
}
function tvHeadline(c) {
  const f = cardFacts(c), amt = c.light === 'verde' ? 'invierte US$10' : 'invierte poco (US$5)';
  return `Mejor idea hoy: ${coLabel(c.symbol)} a US$${round(pval(c), 2)} → ${amt}`
    + (f.r6 != null ? ` · 6 meses: ${f.r6 >= 0 ? '+' : ''}${f.r6}%${f.mk6 != null ? ` (mercado ${f.mk6 >= 0 ? '+' : ''}${f.mk6}%)` : ''}` : '')
    + (f.p10 != null ? ` · le ganó al mercado ${f.p10} de 10 veces` : '')
    + (f.votes.length ? ` · ${f.yes.length}/${f.votes.length} señales a favor` : '')
    + (c.timing?.recommended ? ` · déjala ${c.timing.recommended.label}` : '') + '.';
}
const coLabel = s => s;
const pval = c => Number(c.price?.value ?? c.price) || 0;
function tvThoughts(r, lot) {
  const out = [], verdict = { verde: 'Sí, invierte', amarillo: 'Invierte poco', rojo: 'No inviertas' };
  for (const c of r.slice(0, 6)) {
    const f = cardFacts(c);
    out.push({ kind: 'bolsa', sym: c.symbol, light: c.light, text: `Analizando ${c.symbol} (US$${round(pval(c), 2)}): `
      + (f.r6 != null ? `en 6 meses ${f.r6 >= 0 ? 'subió' : 'bajó'} ${Math.abs(f.r6)}%${f.mk6 != null ? ` contra ${f.mk6}% del mercado` : ''}. ` : '')
      + (f.votes.length ? `A favor: ${f.yes.map(x => VOTE_TV[x.factor]).join(', ') || 'nada'}${f.no.length ? `; en contra: ${f.no.map(x => VOTE_TV[x.factor]).join(', ')}` : ''}. ` : '')
      + (f.p10 != null ? `Le ganó al mercado ${f.p10} de cada 10 veces. ` : '') + `Mi voto: ${verdict[c.light] || '—'}.` });
  }
  for (const g of lot.slice(0, 3)) out.push({ kind: 'loto', text: `Revisando ${g.game}: ${g.verdict} Los métodos votan por ${g.top.join(', ')} (cada uno tiene 3 de 100 de salir).` });
  return out;
}
route('GET', '/api/tv', ({ user }) => {
  const r = latestRanking(db);
  const tvVotes = Object.keys(GAMES).map(g => { try { const v = methodVotes(db, g); return v ? { game: GAMES[g].name, date: v.date, top: v.top.map(t => t.num), votes: v.top.map(t => t.votes), voters: v.totalVoters, verdict: v.verdict } : null; } catch { return null; } }).filter(Boolean).slice(0, 4);
  const lot = Object.keys(GAMES).map(g => { try { return pickOfTheDay(db, g); } catch { return null; } }).filter(Boolean);
  const st = strategiesSummary(db);
  const best = r.find(c => c.light === 'verde') || r.find(c => c.light === 'amarillo');
  return {
    now: nowIso(), motor: motorState(db), heartbeat: getSetting(db, 'global', 'motor.heartbeat', null), marketOpen: marketOpen(),
    headline: best ? tvHeadline(best) : 'Hoy no te recomiendo invertir en ninguna: lo mejor es esperar.',
    lotteryLine: (() => { const s = liveMethodStats(db); const az = s.find(m => m.method === 'azar'); const better = s.filter(m => m.method !== 'azar' && az && m.n >= 30 && m.per100 > az.per100 + 10); return better.length ? `Loterías: ${better[0].method} va por encima del azar; falta confirmarlo.` : 'Loterías: ningún método le gana al azar todavía.'; })(),
    ranking: r.slice(0, 8).map(c => ({ symbol: c.symbol, light: c.light, confidence: c.confidence, probBeat: c.probBeat ?? null, score: c.score, why: c.reasons[0]?.text, price: c.price })),
    league: leagueTable(db), predictions: predictionStats(db), learning: st, lottery: lot, ai: aiSpend(db, cfg),
    activity: db.prepare('SELECT * FROM activity WHERE user_id IS NULL OR user_id = ? ORDER BY id DESC LIMIT 40').all(user.id),
    account: (() => { const acc = userAccount(user); const v = valuation(db, acc.id, s => getQuote(db, s)?.price); return { total: round(v.total, 2), start: v.start, returnPct: round(v.returnPct * 100, 2), realized: round(v.realized, 2), unrealized: round(v.unrealized, 2), positions: v.positions.length, fx: fx(db)?.rate ?? null }; })(),
    quotes: db.prepare('SELECT symbol, price, prev_close, kind, source, as_of FROM stock_quotes ORDER BY symbol').all().map(q => ({ ...q, changePct: q.prev_close ? round((q.price / q.prev_close - 1) * 100, 2) : null })),
    // Para el Modo TV: lo que hace cada área, en vivo
    map: (() => { const zs = { recomendada: [], observacion: [], no_recomendada: [], candidata: [] }; for (const e of db.prepare("SELECT symbol, zone, conv FROM map_entries WHERE zone != 'descartada' ORDER BY conv DESC").all()) (zs[e.zone] ||= []).push({ s: e.symbol, c: e.conv }); const ex = getSetting(db, 'global', 'map.explore', null); return { zones: zs, exploredAt: ex?.at || null }; })(),
    votes: tvVotes,
    thoughts: tvThoughts(r, tvVotes),
    exp: (() => { const e = evidence(db), ls = playStats(db, { agent: 'loteria' }); return { n: e.n, hitRate: e.hitRate, lot: { plays: ls.plays, settled: ls.settled, staked: ls.staked, paid: ls.paid, wins: ls.wins } }; })(),
    positions: (() => { const acc = userAccount(user); return valuation(db, acc.id, s => getQuote(db, s)?.price).positions.map(p => ({ s: p.symbol, v: round(p.value, 2), pct: round(p.pnlPct * 100, 1) })); })(),
    nextDraws: Object.keys(GAMES).map(g => { try { const nd = nextDraw(g); return { game: GAMES[g].name, closesAt: nd.close.toISOString() }; } catch { return null; } }).filter(Boolean).sort((a, b) => a.closesAt.localeCompare(b.closesAt)).slice(0, 4),
    ia: (() => { try { const v = aiView(db); return { total: v.total, start: v.start, returnPct: v.returnPct, market: v.market, positions: v.positions.length, last: v.trades[0] || null }; } catch { return null; } })(),
    tasks: taskStatus(db).filter(t => ['bolsa_precios', 'loterias_resultados', 'investigacion', 'explorar', 'ranking', 'cartera_ia', 'noticias', 'prueba_en_vivo'].includes(t.name)).map(t => ({ name: t.name, every: t.every, last: t.last?.at || null, ok: t.last ? t.last.ok !== false : null })),
    debate: (() => { const d = db.prepare('SELECT * FROM debates ORDER BY id DESC LIMIT 1').get(); return d ? { id: d.id, subject: d.subject, at: d.created_at, rounds: JSON.parse(d.rounds), verdict: JSON.parse(d.verdict) } : null; })(),
    chart: (() => {
      const w = whatIf(db, { perTradeUsd: 10 });
      if (w.curve.length >= 2) return { title: 'Si hubieras seguido a JARVIS vs el mercado (US$10 por idea)', unit: 'usd', a: w.curve.map(c => [c.date, c.jarvis]), b: w.curve.map(c => [c.date, c.market]), aLabel: 'JARVIS', bLabel: 'Mercado' };
      const top = best || r[0]; if (!top) return null;
      const A = getBars(db, top.symbol).slice(-126), B = new Map(getBars(db, 'SPY').map(x => [x.ts, x.close]));
      const rows = A.filter(x => B.has(x.ts)); if (rows.length < 10) return null;
      const a0 = rows[0].close, b0 = B.get(rows[0].ts);
      return { title: `Mejor idea de hoy (${top.symbol}) vs el mercado, últimos 6 meses`, unit: 'pct', a: rows.map(x => [x.ts, round((x.close / a0 - 1) * 100, 2)]), b: rows.map(x => [x.ts, round((B.get(x.ts) / b0 - 1) * 100, 2)]), aLabel: top.symbol, bLabel: 'SPY' };
    })(),
  };
});

route('GET', '/api/ranking', () => latestRanking(db));
route('GET', '/api/map', ({ user }) => { const v = mapView(db, { userId: user.id }); delete v.rows; return { ...v, aiOn: aiOn(db, cfg), aiIdeas: aiSuggestions(db).slice(0, 8) }; });
route('GET', '/api/budget', ({ user }) => ({ ...getBudget(db, user.id), evidence: evidence(db), account: userAccount(user), profile: getProfile(db, user.id) }));
route('POST', '/api/budget', async ({ req, user }) => { const b = await body(req); const out = saveBudget(db, user.id, b, { isAdmin: user.role === 'admin' }); audit(db, user.id, 'mi_dinero', { usd: out.usd }); return out; });
route('POST', '/api/account/reset', async ({ user }) => {
  const old = userAccount(user), n = db.prepare('SELECT COUNT(*) n FROM accounts WHERE owner = ?').get(`user:${user.id}`).n;
  const name = `practica-${n + 1}`;
  setSetting(db, `user:${user.id}`, 'account.name', name);
  audit(db, user.id, 'cuenta_nueva', { anterior: old.name, nueva: name, dinero: getBudget(db, user.id).usd });
  return { ok: true, previous: old.name, account: userAccount(user) };
});
route('POST', '/api/finder', async ({ req, user }) => {
  const b = await body(req), budget = getBudget(db, user.id);
  const q = { minP: Math.max(0, Math.min(1, Number(b.minP ?? 0))), maxP: Math.max(0, Math.min(1, Number(b.maxP ?? 1))), days: [5, 21, 63, 126, 252].includes(Number(b.days)) ? Number(b.days) : 252,
    metric: b.metric === 'mercado' ? 'mercado' : 'ganar', maxLossPct: b.maxLossPct != null && b.maxLossPct !== '' ? Number(b.maxLossPct) / 100 : null, amount: Math.max(1, Number(b.amount) || 10), onlyRec: !!b.onlyRec, kind: ['fondos', 'empresas'].includes(b.kind) ? b.kind : 'todas' };
  const v = mapView(db, { userId: user.id }), res = finder(v.rows.filter(r => r.wanted), q);
  const picks = res.matches.filter(r => r.zone === 'recomendada' || r.zone === 'observacion');
  const strip = r => ({ symbol: r.symbol, zone: r.zone, conv: r.conv, verdict: r.verdict, why: r.why, hold: r.hold, p: r.p, bad: r.bad, median: r.median, normalUsd: r.normalUsd, badUsd: r.badUsd, active: r.active, size: r.size });
  return { query: q, budget, ...res, matches: res.matches.map(strip), closest: res.closest.map(strip), bigBet: bigBetCheck({ amount: q.amount, budget, picks: picks.length ? picks : [], fund: { symbol: 'SPY' } }) };
});
route('GET', '/api/debates', () => db.prepare('SELECT id, subject, created_at, verdict, cost_usd FROM debates ORDER BY id DESC LIMIT 30').all().map(d => ({ ...d, verdict: JSON.parse(d.verdict) })));
route('GET', '/api/debate/:id', ({ p }) => { const d = db.prepare('SELECT * FROM debates WHERE id = ?').get(Number(p.id)); if (!d) throw Object.assign(new Error('No existe ese debate.'), { code: 404 }); const card = latestRanking(db).find(c => c.symbol === d.subject); return { ...d, rounds: JSON.parse(d.rounds), verdict: JSON.parse(d.verdict), card }; });
route('POST', '/api/debate/:symbol', async ({ p, user }) => {
  const card = latestRanking(db).find(c => c.symbol === p.symbol.toUpperCase());
  if (!card) throw Object.assign(new Error('Esa empresa no está en el ranking de hoy.'), { code: 404 });
  const news = db.prepare('SELECT title, source FROM news WHERE symbols LIKE ? ORDER BY fetched_at DESC LIMIT 5').all(`%"${card.symbol}"%`);
  const d = await runDebate(db, cfg, { symbol: card.symbol, card, userId: user.id, context: { price: card.price, news: news.map(n => `${n.title} (${n.source})`) } });
  db.prepare('UPDATE recommendations SET debate_id = ? WHERE id = ?').run(d.id, card.id);
  return d;
});

route('GET', '/api/stock/:symbol', ({ p }) => {
  const s = p.symbol.toUpperCase(), bars = getBars(db, s);
  const card = latestRanking(db).find(c => c.symbol === s) || null;
  const q = getQuote(db, s);
  return { symbol: s, card, quote: q, quoteStatus: quoteStatus(q), bars: bars.slice(-260).map(b => [b.ts, round(b.close, 2)]), barsSource: bars.at(-1)?.source, facts: factsFor(db, s),
    news: db.prepare('SELECT title, source, url, published_at, summary, polemic, verified FROM news WHERE symbols LIKE ? ORDER BY fetched_at DESC LIMIT 12').all(`%"${s}"%`),
    history: db.prepare("SELECT payload, correct, outcome, sealed_at FROM predictions WHERE module = 'ranking' AND subject LIKE ? ORDER BY sealed_at DESC LIMIT 30").all(`ranking:${s}:%`).map(r => ({ ...JSON.parse(r.payload), correct: r.correct, outcome: r.outcome ? JSON.parse(r.outcome) : null, sealedAt: r.sealed_at })) };
});
route('GET', '/api/account', ({ user }) => {
  const acc = userAccount(user);
  const v = valuation(db, acc.id, s => getQuote(db, s)?.price);
  const spy = getBars(db, 'SPY'), since = acc.created_at.slice(0, 10);
  const s0 = spy.find(b => b.ts >= since), s1 = spy.at(-1);
  const strat = db.prepare("SELECT a.id, s.family FROM accounts a JOIN strategies s ON a.owner = 'strategy:' || s.id").all()
    .map(x => { const vv = valuation(db, x.id, sym => getQuote(db, sym)?.price); return vv.returnPct; });
  return { ...v, trades: db.prepare('SELECT * FROM trades WHERE account_id = ? ORDER BY ts DESC LIMIT 100').all(acc.id), limits: tradeLimits(user), budget: getBudget(db, user.id), marketOpen: marketOpen(), fx: fx(db),
    compare: { you: v.returnPct, market: s0 && s1 ? s1.close / s0.close - 1 : null, jarvisBest: strat.length ? Math.max(...strat) : null, since } };
});
route('POST', '/api/order', async ({ req, user }) => {
  const b = await body(req);
  const acc = userAccount(user);
  if (b.side === 'buy' && !b.confirmEmotion) { const ep = emotionPause(db, acc.id); if (ep.pause) throw Object.assign(new Error(ep.text), { code: 409 }); }
  const q = getQuote(db, String(b.symbol || '').toUpperCase());
  const r = placeOrder(db, { accountId: acc.id, symbol: String(b.symbol).toUpperCase(), side: b.side, usd: b.side === 'buy' ? Number(b.usd) : undefined, qty: b.side === 'sell' ? Number(b.qty) : undefined, quote: q, quoteUsable: quoteStatus(q), reason: b.reason || 'manual', limits: { minTradeUsd: tradeLimits(user).min, maxTradeUsd: tradeLimits(user).max, maxPerSymbolPct: 40, minCashPct: 10, maxLossPct: 30 } });
  if (!r.ok) throw Object.assign(new Error(r.reason), { code: 400 });
  return r;
});
route('POST', '/api/advice', async ({ req }) => {
  const b = await body(req);
  const a = adviseAmount({ amountUsd: Number(b.amountUsd), hasEmergencyFund: !!b.hasEmergencyFund, fixedCostUsd: Number(b.fixedCostUsd || 0), horizonMonths: Number(b.horizonMonths || 12), extremeIdea: b.extremeIdea || null });
  const spy = getBars(db, 'SPY');
  a.projectionSPY = spy.length ? project(spy, Number(b.amountUsd), { days: Math.round(Number(b.horizonMonths || 12) * 21), fixedCostUsd: Number(b.fixedCostUsd || 0) }) : null;
  return a;
});
route('GET', '/api/watchlist', ({ user }) => db.prepare('SELECT symbol FROM watchlist WHERE user_id = ?').all(user.id).map(r => r.symbol));
route('POST', '/api/watchlist', async ({ req, user }) => { const b = await body(req); const s = String(b.symbol || '').toUpperCase(); if (!/^[A-Z.\-]{1,10}$/.test(s)) throw new Error('Símbolo no válido.'); if (b.remove) db.prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?').run(user.id, s); else db.prepare('INSERT OR IGNORE INTO watchlist (user_id, symbol, added_at) VALUES (?, ?, ?)').run(user.id, s, nowIso()); return { ok: true }; });

route('POST', '/api/lottery/plus', async ({ user }) => {
  const L = cache.get('lottery')?.v || null;
  const games = (L?.games || Object.values(GAMES).map(g => { const h = history(db, g.id); return { name: g.name, draws: h.length, scan: h.length >= 10 ? scan(h, { sims: 300 }) : null, compare: null }; }))
    .map(g => ({ juego: g.name, sorteos_revisados: g.draws, vigilancia: g.scan?.verdict || 'pocos datos', metodos: g.compare?.verdict || 'pocos datos' }));
  const P = getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS);
  const facts = { juegos: games, devolucion_promedio_por_cada_100_pesos: { quiniela: round(expectedReturn('quiniela', P) * 100, 1), pale: round(expectedReturn('pale', P) * 100, 1), tripleta: round(expectedReturn('tripleta', P) * 100, 1) }, jugadas_virtuales_de_jarvis: playStats(db, { agent: 'loteria' }) };
  return lotteryExplain(db, cfg, { userId: user.id, facts });
});
route('GET', '/api/lottery', () => cached('lottery', 30 * 60e3, () => {
  const games = Object.values(GAMES).map(g => {
    const h = history(db, g.id);
    let nd = null; try { nd = nextDraw(g.id); } catch { /* sin horario */ }
    return { id: g.id, name: g.name, entity: g.entity, timeVerified: g.verified, next: nd ? { date: nd.date, closesAt: nd.close.toISOString() } : null, draws: h.length, last: h.slice(-10).reverse(),
      freq: h.length ? frequencies(h).total : null, insights: h.length ? numberInsights(h, 10) : [], scan: h.length >= 10 ? scan(h, { sims: 400 }) : null,
      compare: h.length >= 20 ? compareMethods(h, 'quiniela', { sims: 200, P: getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS) }) : null, pick: (() => { try { return pickOfTheDay(db, g.id); } catch { return null; } })(), votes: (() => { try { return methodVotes(db, g.id); } catch { return null; } })() };
  });
  return { games, live: liveMethodStats(db), stats: playStats(db, { agent: 'loteria' }), payouts: getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS), expected: (() => { const P = getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS); return { quiniela: round(expectedReturn('quiniela', P) * 100, 2), pale: round(expectedReturn('pale', P) * 100, 2), tripleta: round(expectedReturn('tripleta', P) * 100, 2) }; })() };
}));
route('POST', '/api/lottery/play', async ({ req, user }) => { const b = await body(req); return sealPlay(db, { userId: user.id, game: b.game, kind: b.kind, numbers: b.numbers, stake: Number(b.stake), method: 'manual', purpose: 'usuario', P: getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS) }); });
route('GET', '/api/lottery/mine', ({ user }) => ({ stats: playStats(db, { userId: user.id }), plays: db.prepare('SELECT * FROM lottery_plays WHERE user_id = ? ORDER BY sealed_at DESC LIMIT 50').all(user.id) }));

route('GET', '/api/coins/audit', () => coinAudit(db));
// Registro de votos: qué votó JARVIS, qué pasó de verdad y si ganó o perdió su moneda
route('GET', '/api/votes/recent', () => {
  const rows = db.prepare("SELECT id, payload, outcome, correct, sealed_at, resolved_at FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL ORDER BY resolved_at DESC, id DESC LIMIT 12").all();
  const pending = db.prepare("SELECT COUNT(*) n FROM predictions WHERE module = 'ranking' AND correct IS NULL").get().n;
  const coinsWeek = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM coins WHERE ref LIKE 'pred:%' AND revoked = 0 AND ts >= ?").get(new Date(Date.now() - 7 * 864e5).toISOString()).s;
  return { pending, coinsWeek: round(coinsWeek, 1), list: rows.map(r => { const p = JSON.parse(r.payload), o = JSON.parse(r.outcome || '{}'); return { symbol: p.symbol, light: p.light, claim: (p.claimBeat ?? p.light !== 'rojo') ? 'le gana al mercado' : 'no le gana al mercado', ret: o.ret, bench: o.bench, ok: !!r.correct, sealed: r.sealed_at, end: o.endDate }; }) };
});
route('GET', '/api/learning', () => ({ strategies: strategiesSummary(db), league: leagueTable(db, new Date(Date.now() - 7 * 864e5).toISOString()), cheats: cheatReports(db, 30), predictions: predictionStats(db), byModule: { ranking: predictionStats(db, 'ranking'), senales: predictionStats(db, 'bolsa_senal') },
  list: db.prepare('SELECT s.*, (SELECT result FROM experiments e WHERE e.strategy_id = s.id ORDER BY id DESC LIMIT 1) result FROM strategies s ORDER BY s.id DESC LIMIT 60').all().map(s => ({ ...s, params: JSON.parse(s.params), result: s.result ? JSON.parse(s.result) : null })),
  coins: db.prepare('SELECT * FROM coins ORDER BY ts DESC LIMIT 30').all(),
  dontKnow: [
    'Si alguna estrategia tiene ventaja real: hasta que pase la prueba en vivo con datos nuevos, no se sabe.',
    'Los pesos del ranking son la versión 1: se miden con cada recomendación calificada.',
    'Los horarios de los sorteos están por verificar con las fuentes oficiales.',
    'Datos de Yahoo son de respaldo no oficial; con claves de Alpaca la calidad mejora.',
  ] }));

const fullStatus = () => ({ aiOn: aiOn(db, cfg), storage: { persistent: cfg.persistent, platform: cfg.platform }, version: (() => { try { return readFileSync(join(dirname(cfg.dbPath), 'version.txt'), 'utf8').trim().slice(0, 7); } catch { return null; } })(), publicUrl: publicUrl(), funnelEnable: publicUrl() ? null : funnelEnableLink(), motor: motorState(db), heartbeat: getSetting(db, 'global', 'motor.heartbeat', null), tasks: taskStatus(db), errors: recentErrors(db), ledger: verifyLedger(db), ai: { ...aiSpend(db, cfg), available: available(db, cfg) },
  sources: { alpaca: !!cfg.alpacaKey, openai: !!cfg.openaiKey, anthropic: !!cfg.anthropicKey }, db: { bars: db.prepare('SELECT COUNT(*) n FROM stock_bars').get().n, draws: db.prepare('SELECT COUNT(*) n FROM lottery_draws').get().n, ledger: db.prepare('SELECT COUNT(*) n FROM ledger').get().n },
  dailySummary: getSetting(db, 'global', 'report.daily', null), backup: getSetting(db, 'global', 'backup.last', null), notify: !!cfg.ntfyTopic, fx: fx(db) });
route('GET', '/api/status', ({ user }) => user.role === 'admin' ? fullStatus() : { aiOn: aiOn(db, cfg), motor: motorState(db), heartbeat: getSetting(db, 'global', 'motor.heartbeat', null), ledger: { ok: verifyLedger(db).ok }, storage: { persistent: true } });
route('GET', '/api/summary', () => ({ text: dailySummary(db) }));

route('POST', '/api/motor/:action', async ({ p, req }) => {
  const b = await body(req);
  if (p.action === 'start') return startMotor(db, b.hours ? Number(b.hours) : null);
  if (p.action === 'pause') return pauseMotor(db);
  if (p.action === 'resume') return resumeMotor(db);
  if (p.action === 'stop') return stopMotor(db);
  if (p.action === 'run') { const r = await runCycle(db, cfg, { force: b.force || [] }); return r; }
  throw new Error('Acción desconocida.');
}, { admin: true });

route('GET', '/api/settings', () => ({ showUsers: getSetting(db, 'global', 'login.showUsers', true), payouts: getSetting(db, 'global', 'lottery.payouts', DEFAULT_PAYOUTS), universe: universe(db), aiEnabled: getSetting(db, 'global', 'ai.enabled', { openai: true, anthropic: false, ollama: true }), prices: getSetting(db, 'global', 'ai.prices', DEFAULT_PRICES), allowSingleSource: getSetting(db, 'global', 'lottery.allowSingleSource', true), caps: { month: cfg.aiMonthlyCapUsd, day: cfg.aiDailyCapUsd }, models: { openai: cfg.openaiModel, anthropic: cfg.anthropicModel, local: cfg.ollamaModel }, keys: { openai: !!cfg.openaiKey, anthropic: !!cfg.anthropicKey, alpaca: !!cfg.alpacaKey }, notify: { on: !!cfg.ntfyTopic, topic: cfg.ntfyTopic ? cfg.ntfyTopic.slice(0, 4) + '…' : null }, offsite: !!(cfg.backupPassphrase && cfg.rcloneRemote) }), { admin: true });
route('POST', '/api/settings', async ({ req, user }) => {
  const b = await body(req);
  if (b.payouts) { const P = b.payouts; if (!Array.isArray(P.q) || P.q.length !== 3 || ['p12', 'p13', 'p23', 't3', 't2'].some(k => !(Number(P[k]) >= 0))) throw new Error('Los pagos no tienen el formato correcto.'); setSetting(db, 'global', 'lottery.payouts', P); cache.delete('lottery'); }
  if (Array.isArray(b.universe)) setSetting(db, 'global', 'stocks.universe', b.universe.map(s => String(s).toUpperCase()).filter(s => /^[A-Z.\-]{1,10}$/.test(s)).slice(0, 40));
  if (b.aiEnabled) setSetting(db, 'global', 'ai.enabled', b.aiEnabled);
  if (b.prices) setSetting(db, 'global', 'ai.prices', b.prices);
  if (typeof b.allowSingleSource === 'boolean') setSetting(db, 'global', 'lottery.allowSingleSource', b.allowSingleSource);
  audit(db, user.id, 'ajustes', Object.keys(b));
  return { ok: true };
}, { admin: true });
route('GET', '/api/keys', () => keyStatus(cfg), { admin: true });
route('POST', '/api/keys', async ({ req, user }) => { const b = await body(req); const r = saveKeys(cfg, b); audit(db, user.id, 'claves', { cambiadas: r.changed }); return r.status; }, { admin: true });
route('GET', '/api/users', () => db.prepare('SELECT id, username, display_name, role, active, created_at, ai_daily_cap_usd, ai_monthly_cap_usd FROM users').all()
  .map(u => { const p = getProfile(db, u.id), b = getBudget(db, u.id); return { ...u, style: p.style, horizon: p.horizon, setup: p.setup, budget: b.usd, lastSeen: db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get(u.id).last_seen_at || db.prepare('SELECT MAX(created_at) t FROM sessions WHERE user_id = ?').get(u.id).t }; }), { admin: true });
route('POST', '/api/users/:id/password', async ({ req, user, p }) => { const b = await body(req); const pw = String(b.password || '').trim() || autoPassword(); resetPassword(db, user.id, Number(p.id), pw); return { ok: true, password: b.password ? undefined : pw }; }, { admin: true });
route('POST', '/api/users/:id/active', async ({ req, user, p }) => { const b = await body(req); setActive(db, user.id, Number(p.id), !!b.active); return { ok: true }; }, { admin: true });
route('POST', '/api/users', async ({ req }) => { const b = await body(req); const pw = String(b.password || '').trim() || autoPassword(); return { password: b.password ? undefined : pw, id: createUser(db, { username: b.username, password: pw, role: b.role === 'admin' ? 'admin' : 'user', displayName: b.displayName, dailyCap: Number(b.dailyCap || 0.1), monthlyCap: Number(b.monthlyCap || 2) }) }; }, { admin: true });





// ---------- El núcleo: descargar copia cifrada y restaurar ----------
route('GET', '/api/brain', () => ({ summary: brainSummary(db), file: brainFileInfo(cfg), last: getSetting(db, 'global', 'backup.last', null) }), { admin: true });
route('POST', '/api/brain/export', async ({ req, res, user }) => {
  const b = await body(req); const out = exportBrain(db, cfg, b.passphrase, user);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${out.name}"`, 'Cache-Control': 'no-store' });
  res.end(out.data);
}, { admin: true });
route('POST', '/api/brain/restore', async ({ req, user }) => {
  const b = await body(req, 400e6);
  const buf = Buffer.from(String(b.file || '').replace(/^data:[^,]*,/, ''), 'base64');
  const r = restoreBrain(db, cfg, buf, b.passphrase, user);
  setTimeout(() => { try { server.close(); r.swap(); } catch (e) { console.error('Restaurar:', e.message); } process.exit(0); }, 800);
  return { ok: true, info: r.info, message: 'Copia revisada. JARVIS se reinicia con ese núcleo en unos segundos.' };
}, { admin: true });
// ---------- Contratos y términos (firmas que no se borran) ----------
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
route('GET', '/api/legal', ({ user }) => ({
  terminos: { ...legalDoc(db, 'terminos'), signed: currentAcceptance(db, user.id, 'terminos'), required: user.role !== 'admin' },
  contrato: { ...legalDoc(db, 'contrato'), signed: currentAcceptance(db, user.id, 'contrato') },
  mine: listAcceptances(db, { userId: user.id }).map(a => ({ id: a.id, doc: a.doc, version: a.version, accepted_at: a.accepted_at })),
}));
route('POST', '/api/legal/accept', async ({ req, user }) => { const b = await body(req); return acceptLegal(db, user, { doc: b.doc, fullName: b.fullName, cedula: b.cedula, agree: !!b.agree, ip: clientIp(req), ua: req.headers['user-agent'] }); });
route('GET', '/api/legal/firmas', () => listAcceptances(db), { admin: true });
route('GET', '/api/legal/texto/:hash', ({ p, user }) => {
  const own = listAcceptances(db, { userId: user.id }).some(a => a.doc_hash === p.hash);
  if (user.role !== 'admin' && !own) throw Object.assign(new Error('No encontrado.'), { code: 404 });
  return signedText(db, p.hash) || {};
});
// ---------- ⚡ Potenciador de IA ----------
route('GET', '/api/potenciador', ({ user }) => {
  const isAdmin = user.role === 'admin', st = creditSettings(db);
  return { me: creditStatus(db, user.id), packs: st.packs, payInfo: st.payInfo, accounts: st.accounts, banks: st.banks, mine: listRequests(db, { userId: user.id }), isAdmin,
    admin: isAdmin ? { margin: st.margin, rate: fx(db)?.rate || 62, rateSource: fx(db)?.source || 'aproximado', economics: st.packs.map(p => packEconomics(p.credits, { margin: st.margin, rate: fx(db)?.rate || 62 })), requests: listRequests(db), users: db.prepare("SELECT id FROM users WHERE active = 1 AND role != 'admin'").all().map(u => ({ id: u.id, ...creditStatus(db, u.id), name: db.prepare('SELECT COALESCE(display_name, username) n FROM users WHERE id = ?').get(u.id).n })) } : null };
});
route('POST', '/api/potenciador', async ({ req, user }) => { const b = await body(req, 2.2e6); return createRequest(db, cfg, user, b); });
route('GET', '/api/potenciador/:id/foto', ({ res, user, p }) => {
  const f = receiptFile(db, cfg, Number(p.id));
  if (!f || (user.role !== 'admin' && f.userId !== user.id)) throw Object.assign(new Error('No encontrado.'), { code: 404 });
  res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
  res.end(f.buf);
});
route('POST', '/api/potenciador/:id/decidir', async ({ req, user, p }) => { const b = await body(req); return decideRequest(db, user, Number(p.id), { approve: !!b.approve, note: b.note }); }, { admin: true });
route('POST', '/api/potenciador/ajustes', async ({ req }) => saveCreditSettings(db, await body(req)), { admin: true });
route('POST', '/api/potenciador/regalar', async ({ req, user }) => { const b = await body(req); return grantCredits(db, user, Number(b.userId), Number(b.credits)); }, { admin: true });
// ---------- Cartera de la IA (decide sola) y búsqueda enfocada ----------
route('GET', '/api/ia', () => aiView(db));
const FOCUS_DAYS = { corto: [21, 63], medio: [126, 63], largo: [252, 126] };
const FOCUS_TXT = { corto: 'en 1 mes', medio: 'en 6 meses', largo: 'en 1 año' };
function focusTop(horizon) {
  const [d, alt] = FOCUS_DAYS[horizon] || FOCUS_DAYS.medio;
  return db.prepare("SELECT symbol, zone, light, conv, card FROM map_entries WHERE light != 'rojo' AND zone != 'descartada'").all().map(r => {
    const c = JSON.parse(r.card || '{}'), h = c.timing?.h || {}, x = h[d] || h[alt];
    return x?.p != null ? { symbol: r.symbol, zone: r.zone, light: r.light, conv: r.conv, p: x.p, median: x.median ?? null, bad: x.bad ?? null, days: h[d] ? d : alt } : null;
  }).filter(Boolean).sort((a, b) => b.p - a.p || b.conv - a.conv).slice(0, 3);
}
let focusRun = null;
route('GET', '/api/focus', ({ user }) => { const hz = getProfile(db, user.id).horizon; return { horizon: hz, when: FOCUS_TXT[hz], top: focusTop(hz), searching: !!focusRun, last: getSetting(db, 'global', 'focus.last', null) }; });
route('POST', '/api/focus', async ({ req, user }) => {
  const b = await body(req);
  if (!HORIZONS[b.horizon]) throw new Error('Elige corto, medio o largo plazo.');
  saveProfile(db, user.id, { horizon: b.horizon });
  const last = getSetting(db, 'global', 'focus.last', null);
  const recent = last && Date.now() - Date.parse(last.at) < 10 * 60e3;
  if (!focusRun && !recent) {
    setSetting(db, 'global', 'focus.last', { at: nowIso(), horizon: b.horizon, by: user.id });
    activity(db, { agent: 'largo', type: 'explorar', userId: user.id, text: `🔎 Búsqueda enfocada: buscando las mejores opciones para ${FOCUS_TXT[b.horizon]}…` });
    const lastAi = getSetting(db, 'global', `plus.suggest.${b.horizon}`, null);
    const askAi = aiOn(db, cfg) && (!lastAi || Date.now() - Date.parse(lastAi) > 864e5)
      ? suggestStocks(db, cfg, { horizon: b.horizon }).then(() => setSetting(db, 'global', `plus.suggest.${b.horizon}`, nowIso())).catch(() => {}) : Promise.resolve();
    focusRun = askAi.then(() => exploreStep(db, cfg, { n: 4 })).then(() => {
      const t = focusTop(b.horizon)[0];
      activity(db, { agent: 'largo', type: 'explorar', important: true, userId: user.id, text: t ? `🔎 Búsqueda enfocada lista. Lo mejor para ${FOCUS_TXT[b.horizon]}: ${t.symbol} (terminó ganando ${Math.round(t.p * 10)} de cada 10 veces).` : '🔎 Búsqueda enfocada lista: todavía no hay datos suficientes.' });
    }).catch(err => activity(db, { type: 'error', text: `Búsqueda enfocada falló: ${err.message}` })).finally(() => { focusRun = null; });
  }
  return { horizon: b.horizon, when: FOCUS_TXT[b.horizon], top: focusTop(b.horizon), searching: !!focusRun, recent };
});
route('GET', '/api/comments', ({ url }) => db.prepare('SELECT c.*, u.username FROM comments c JOIN users u ON u.id = c.user_id WHERE subject = ? ORDER BY ts').all(url.searchParams.get('subject') || ''));
route('POST', '/api/comments', async ({ req, user }) => { const b = await body(req); const t = String(b.body || '').trim().slice(0, 1000); if (!t) throw new Error('El comentario está vacío.'); db.prepare('INSERT INTO comments (subject, user_id, ts, body) VALUES (?, ?, ?, ?)').run(String(b.subject).slice(0, 80), user.id, nowIso(), t); return { ok: true }; });

route('POST', '/api/ask', async ({ req, user }) => {
  const b = await body(req);
  const q = String(b.question || '').slice(0, 500);
  // La misma pregunta en la misma hora no se paga dos veces
  const askKey = `${user.id}:${q.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '').replace(/\s+/g, ' ').trim()}`;
  const hit = askCache.get(askKey); if (hit && Date.now() - hit.t < 60 * 60e3) return { answer: hit.answer, provider: hit.provider, cached: true };
  const h = home(db, cfg, user);
  const ctx = JSON.stringify({ cuenta: h.account, predicciones: h.predictions, ranking: h.ranking.map(c => ({ s: c.symbol, luz: c.light, conf: c.confidence, razones: c.reasons.map(r => r.text) })), aprendizaje: h.learning.byStatus, loterias: h.lottery.stats, liga: h.league });
  const r = await complete(db, cfg, { task: 'pregunta', userId: user.id, prefer: 'paid', maxTokens: 400,
    system: `Eres ${publicBrand(db).name}, el asistente de inversiones. Responde en español sencillo y corto usando SOLO el estado que te doy. Si el dato no está, dilo. Distingue hechos de opiniones. Nunca prometas ganancias.`, prompt: `Estado:\n${ctx}\n\nPregunta: ${q}` });
  if (r.ok) askCache.set(askKey, { t: Date.now(), answer: r.text, provider: r.provider });
  if (askCache.size > 300) askCache.delete(askCache.keys().next().value);
  return r.ok ? { answer: r.text, provider: r.provider } : { answer: user.role === 'admin' ? `No pude consultar la IA: ${r.reason}` : (/Potenciador|límite de IA/.test(r.reason) ? r.reason : 'La IA no está disponible en este momento. JARVIS sigue funcionando; intenta más tarde.'), provider: null };
});

route('GET', '/api/whatif', ({ url }) => whatIf(db, { perTradeUsd: Number(url.searchParams.get('usd') || 10) }));
route('GET', '/api/grade', ({ url }) => monthlyGrade(db, url.searchParams.get('month') || undefined));
route('GET', '/api/fx', () => fx(db));
route('POST', '/api/notify/test', async () => { const r = await sendPush(cfg, { title: 'JARVIS', message: 'Prueba de aviso: si ves esto, los avisos funcionan.', tags: ['white_check_mark'] }); if (!r.ok) throw new Error(r.reason || 'No se pudo enviar el aviso.'); return r; }, { admin: true });
const csv = rows => { if (!rows.length) return 'sin datos\n'; const k = Object.keys(rows[0]); return '\ufeff' + [k.join(','), ...rows.map(r => k.map(x => `"${String(r[x] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); };
route('GET', '/api/export/firmas', ({ user, res }) => {
  if (user.role !== 'admin') throw Object.assign(new Error('Solo el administrador.'), { code: 403 });
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="firmas-jarvis.csv"' });
  res.end(csv(listAcceptances(db).map(a => ({ fecha: a.accepted_at, usuario: a.username, documento: a.doc, version: a.version, nombre: a.full_name, cedula: a.id_number, ip: a.ip, navegador: a.user_agent, huella_texto: a.doc_hash, sello: a.ledger_hash }))));
});
route('GET', '/api/export/:what', ({ p, user, res }) => {
  const acc = userAccount(user);
  const data = {
    operaciones: () => db.prepare('SELECT ts fecha, symbol accion, side tipo, qty cantidad, observed_price precio_observado, exec_price precio_ejecucion, fee comision, reason motivo, ledger_hash huella FROM trades WHERE account_id = ? ORDER BY ts').all(acc.id),
    jugadas: () => db.prepare('SELECT sealed_at sellada, game loteria, date sorteo, kind tipo, numbers numeros, stake monto, status estado, prize premio, method metodo, ledger_hash huella FROM lottery_plays WHERE user_id = ? OR agent IS NOT NULL ORDER BY sealed_at').all(user.id),
    predicciones: () => db.prepare('SELECT sealed_at sellada, module modulo, subject tema, prob confianza, correct acerto, resolved_at calificada, ledger_hash huella FROM predictions ORDER BY sealed_at').all(),
    ranking: () => latestRanking(db).map(c => ({ accion: c.symbol, semaforo: c.light, confianza: c.confidence, puntuacion: c.score, razon: c.reasons.map(r => r.text).join(' | ') })),
  }[p.what];
  if (!data) throw Object.assign(new Error('Exportación desconocida.'), { code: 404 });
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="jarvis-${p.what}-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.end(csv(data()));
  return undefined;
});

route('GET', '/api/analysis/stock/:symbol', async ({ p, user }) => {
  const sym = p.symbol.toUpperCase();
  if (!db.prepare('SELECT 1 FROM profiles WHERE subject = ?').get(sym)) await fetchProfile(db, sym).catch(() => null);
  const a = stockAnalysis(db, sym);
  if (a.empty) return a;
  const budget = getBudget(db, user.id);
  const like = { light: a.light, probMethod: a.probMethod, timing: a.timing ? { recommended: a.timing.recommended, h: Object.fromEntries(a.timing.horizons.map(h => [h.days, { p: h.pProfit }])) } : null, projection: { personal: { lossChance: a.scenarios[1]?.lossChance } } };
  return { ...a, budget, size: sizeFor(like, budget, evidence(db), getProfile(db, user.id).style), timeline: analysisHistory(db, `bolsa:${sym}`) };
});
route('GET', '/api/analysis/lottery/:game', ({ p }) => { const a = lotteryAnalysis(db, p.game); return a.empty ? a : { ...a, timeline: analysisHistory(db, `loteria:${p.game}`) }; });
route('POST', '/api/analysis/:id/explain', ({ p, user }) => explainAnalysis(db, cfg, Number(p.id), { userId: user.id }));
route('GET', '/api/history', ({ url }) => historyList(db, { module: url.searchParams.get('module') || null }));
route('GET', '/api/performance', () => ({ ...performance(db), ledger: verifyLedger(db) }));
route('GET', '/api/real', ({ user }) => realSummary(db, user.id));
route('POST', '/api/real', async ({ req, user }) => { const b = await body(req); return addReal(db, user.id, { ...b, amountUsd: Number(b.amountUsd), price: Number(b.price), stakeRd: Number(b.stakeRd), symbol: b.symbol ? String(b.symbol).toUpperCase() : undefined }); });
route('POST', '/api/real/:id/close', async ({ req, user, p }) => { const b = await body(req); return closeReal(db, user.id, Number(p.id), { sellPrice: Number(b.sellPrice) }); });

const staticCache = new Map();
const askCache = new Map();

// ---------- En línea ----------
const seenAt = new Map();
function markSeen(id) { const now = Date.now(); if (now - (seenAt.get(id) || 0) < 60e3) return; seenAt.set(id, now); db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), id); }

// ---------- Servidor ----------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.__gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  try {
    if (url.pathname.startsWith('/api/')) {
      const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!r) return send(res, 404, { error: 'Ruta no encontrada.' });
      const user = userFromToken(db, tokenOf(req));
      if (user) markSeen(user.id);
      if (r.auth && !user) return send(res, 401, { error: 'Inicia sesión.' });
      if (r.admin && user?.role !== 'admin') return send(res, 403, { error: 'Solo el administrador puede hacer esto.' });
      const out = await r.handler({ req, res, url, user, p: url.pathname.match(r.re).groups || {} });
      if (res.writableEnded) return;
      if (out && out.token) return send(res, 200, { user: out.user, deviceToken: out.deviceToken }, { 'Set-Cookie': `jv=${out.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });
      return send(res, 200, out ?? { ok: true });
    }
    if (url.pathname === '/brand/logo') {
      const f = logoFile(db);
      if (!f) { res.writeHead(302, { Location: '/icon.svg' }); return res.end(); }
      res.writeHead(200, { 'Content-Type': f.type, 'Cache-Control': 'max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
      return res.end(f.buf);
    }
    if (url.pathname === '/manifest.webmanifest') return send(res, 200, manifest(db), { 'Content-Type': 'application/manifest+json' });
    let file = normalize(join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'No permitido.' });
    let st;
    try { st = await stat(file); if (!st.isFile()) throw new Error('no'); } catch { file = join(PUBLIC, 'index.html'); st = await stat(file); }
    // ETag: si el archivo no cambió, el navegador usa su copia (respuesta vacía 304) → abre mucho más rápido
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const base = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, base); return res.end(); }
    let f = staticCache.get(file);
    if (!f || f.etag !== etag) { const raw = await readFile(file); f = { etag, raw, gz: /\.(js|css|html|svg|json|webmanifest)$/.test(file) && raw.length > 1400 ? gzipSync(raw, { level: 9 }) : null }; staticCache.set(file, f); }
    if (res.__gz && f.gz) { res.writeHead(200, { ...base, 'Content-Encoding': 'gzip' }); return res.end(f.gz); }
    res.writeHead(200, base);
    res.end(f.raw);
  } catch (e) {
    send(res, e.code && Number.isInteger(e.code) ? e.code : 400, { error: e.message || 'Error.' });
  }
});

server.listen(cfg.port, cfg.host, () => console.log(`JARVIS listo en http://${cfg.host}:${cfg.port}`));

// Ciclo automático cada 5 minutos (y uno al arrancar)
let busy = false;
async function tick() {
  if (busy) return; busy = true;
  try { await runCycle(db, cfg); } catch (e) { console.error('Ciclo:', e.message); } finally { busy = false; }
  // Precalcula lo pesado (loterías) en segundo plano, para que la pantalla abra al instante
  const lc = cache.get('lottery'); if (lc && Date.now() - lc.t > 20 * 60e3) cache.delete('lottery');
  if (!cache.get('lottery')) setTimeout(() => { try { routes.find(r => r.method === 'GET' && r.re.test('/api/lottery')).handler({}); } catch { /* se calcula al abrir */ } }, 1000);
}
setTimeout(tick, 3000);
setInterval(tick, 5 * 60e3);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
export { db, cfg };
