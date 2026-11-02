// Investigación de estrategias: agenda inteligente, hipótesis pre-registradas, examen con datos bajo llave,
// corrección por pruebas múltiples y cambios de estado con su motivo.
import { nowIso } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { normalCdf, benjaminiHochberg, round } from '../core/util.js';
import { FAMILIES, describe } from '../stocks/strategies.js';
import { runStrategy, metrics, splitIndex } from '../stocks/backtest.js';
import { getBars } from '../stocks/market.js';
import { DEFAULT_AGENTS, researchSlots } from './league.js';
import { regimes } from './contexts.js';

export const STATUSES = ['en_desarrollo', 'en_prueba', 'en_evaluacion', 'validada', 'no_validada', 'en_revision', 'retirada'];
export const CRITERIA = Object.freeze({ holdoutFrac: 0.3, trainMinT: 1.0, minTrades: 20, fdr: 0.1, liveMinTrades: 20, liveMinDays: 60 });

export function seedAgenda(db) {
  const st = db.prepare('INSERT OR IGNORE INTO agenda (module, family, title, params, created_at, source) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [fam, f] of Object.entries(FAMILIES)) {
    if (fam === 'comprar_y_mantener') continue;
    for (const p of f.grid) st.run('bolsa', fam, describe(fam, p), JSON.stringify(p), nowIso(), 'semilla');
  }
}

function agentFor(family) {
  return DEFAULT_AGENTS.find(a => a.role === 'bolsa' && JSON.parse(a.style).families.includes(family))?.id || 'largo';
}

/** Elige qué investigar: mezcla lo prometedor con lo poco probado (UCB) y reparte según las monedas de cada agente. */
export function pickNext(db, k = 3) {
  const items = db.prepare("SELECT * FROM agenda WHERE status = 'activa'").all();
  const N = items.reduce((s, i) => s + i.tries, 0) + 1;
  // Pequeño desempate determinista para que todos los agentes reciban turnos cuando las ideas empatan
  const jitter = id => ((id * 2654435761 + N * 97) % 1000) / 1e5;
  const scored = items.map(i => ({ ...i, agent: agentFor(i.family), ucb: ((i.wins + 1) / (i.tries + 2) + Math.sqrt(2 * Math.log(N) / (i.tries + 1))) / i.cost + jitter(i.id) }))
    .sort((a, b) => b.ucb - a.ucb);
  const slots = researchSlots(db, k * 2);
  const out = [];
  for (const it of scored) { if (out.length >= k) break; if ((slots[it.agent] ?? 1) > 0) { out.push(it); slots[it.agent]--; } }
  return out;
}

function ensureStrategy(db, family, params, agent) {
  db.prepare('INSERT OR IGNORE INTO strategies (module, family, params, agent, created_at) VALUES (?, ?, ?, ?, ?)').run('bolsa', family, JSON.stringify(params), agent, nowIso());
  return db.prepare('SELECT * FROM strategies WHERE module = ? AND family = ? AND params = ?').get('bolsa', family, JSON.stringify(params));
}
export function setStatus(db, strategyId, to, reason) {
  const s = db.prepare('SELECT status FROM strategies WHERE id = ?').get(strategyId);
  if (s.status === to) return;
  db.prepare('UPDATE strategies SET status = ? WHERE id = ?').run(to, strategyId);
  db.prepare('INSERT INTO strategy_status_log (strategy_id, ts, from_status, to_status, reason) VALUES (?, ?, ?, ?, ?)').run(strategyId, nowIso(), s.status, to, reason);
}

/** Retornos diarios de la estrategia menos los del SPY, por fecha, juntando todas las acciones. */
function pooledExcess(db, family, params, symbols, part, bench) {
  const benchBars = getBars(db, bench);
  const bRet = new Map(benchBars.map((b, i) => [b.ts, i ? b.close / benchBars[i - 1].close - 1 : 0]));
  // Ideas "solo en tal situación del mercado": se miden solo en los días de esa situación
  const reg = params.regimen ? regimes(benchBars) : null, inRegime = ts => { const r = reg.get(ts); return r && (r.trend === params.regimen || r.vol === params.regimen); };
  const excess = []; let trades = 0;
  for (const sym of symbols) {
    const bars = getBars(db, sym);
    if (bars.length < 300) continue;
    const split = splitIndex(bars, CRITERIA.holdoutFrac);
    const slice = part === 'train' ? bars.slice(0, split) : bars;
    const run = runStrategy(slice, family, params, { from: part === 'train' ? 1 : split });
    run.curve.forEach((c, i) => { const br = bRet.get(c.ts); if (br != null && (!reg || inRegime(c.ts))) excess.push(run.daily[i] - br); });
    trades += metrics(run).trades;
  }
  const n = excess.length, m = n ? excess.reduce((a, b) => a + b, 0) / n : 0;
  const s = n > 1 ? Math.sqrt(excess.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  const t = s > 0 ? m / (s / Math.sqrt(n)) : 0;
  return { n, meanDaily: m, annual: m * 252, t, p: 1 - normalCdf(t), trades };
}

/** Un experimento completo sobre una idea de la agenda. */
export function runExperiment(db, item, { symbols, bench = 'SPY' }) {
  const params = JSON.parse(item.params);
  const strat = ensureStrategy(db, item.family, params, item.agent);
  const plan = { hypothesis: `${describe(item.family, params)} le gana al SPY después de costes`, metric: 'retorno diario extra contra SPY', criteria: CRITERIA, symbols, bench };
  const sealRes = seal(db, { kind: 'experimento_preregistrado', ref: `strategy:${strat.id}`, payload: plan });
  const exp = db.prepare('INSERT INTO experiments (strategy_id, kind, plan, preregistered_at, ledger_hash) VALUES (?, ?, ?, ?, ?)').run(strat.id, 'historico', JSON.stringify(plan), sealRes.ts, sealRes.hash);
  const expId = Number(exp.lastInsertRowid);
  const train = pooledExcess(db, item.family, params, symbols.filter(s => s !== bench), 'train', bench);
  let result = { train }, status, reason;
  if (train.n < 100) { status = 'en_desarrollo'; reason = 'Pocos datos todavía para probar.'; }
  else if (train.t < CRITERIA.trainMinT) { status = 'no_validada'; reason = 'La probé con años de precios reales y no ganó más que simplemente comprar el mercado y esperar. La descarto.'; }
  else {
    const hold = pooledExcess(db, item.family, params, symbols.filter(s => s !== bench), 'holdout', bench);
    result.holdout = hold;
    // Corrección por pruebas múltiples con TODOS los exámenes hechos hasta hoy
    const prior = db.prepare("SELECT id, result FROM experiments WHERE status = 'decidido' AND result LIKE '%holdout%'").all().map(r => ({ id: r.id, p: JSON.parse(r.result).holdout.p }));
    const all = [...prior.map(x => x.p), hold.p];
    const sig = benjaminiHochberg(all, CRITERIA.fdr).has(all.length - 1);
    result.testsSoFar = all.length;
    if (sig && hold.trades >= CRITERIA.minTrades && hold.meanDaily > 0) { status = 'en_prueba'; reason = `¡Pasó el examen final con precios que nunca había visto (y con la exigencia extra por haber probado ${all.length} ideas)! Ahora la pruebo en vivo con dinero virtual.`; }
    else { status = 'no_validada'; reason = 'Pasó la primera prueba, pero en el examen final (con precios que nunca había visto) no ganó más que el mercado. La descarto.'; }
  }
  db.prepare("UPDATE experiments SET status = 'decidido', result = ?, decided_at = ? WHERE id = ?").run(JSON.stringify(result), nowIso(), expId);
  db.prepare('UPDATE agenda SET tries = tries + 1, wins = wins + ? WHERE id = ?').run(status === 'en_prueba' ? 1 : 0, item.id);
  setStatus(db, strat.id, status, reason);
  return { strategyId: strat.id, title: item.title, agent: item.agent, status, reason, result };
}

export function strategiesSummary(db) {
  const rows = db.prepare('SELECT status, COUNT(*) n FROM strategies GROUP BY status').all();
  const tested = db.prepare("SELECT COUNT(*) n FROM experiments WHERE status = 'decidido'").get().n;
  return { byStatus: Object.fromEntries(rows.map(r => [r.status, r.n])), experiments: tested,
    recent: db.prepare('SELECT l.ts, l.to_status, l.reason, s.family, s.params, s.agent FROM strategy_status_log l JOIN strategies s ON s.id = l.strategy_id ORDER BY l.ts DESC LIMIT 10').all() };
}

// ---------- Ideas propuestas por los agentes (la meta y las monedas van "en su cabeza") ----------
import { complete } from '../ai/providers.js';
import { agentBrief } from './league.js';
import { activity } from '../core/db.js';

function paramBounds(family) {
  const grid = FAMILIES[family].grid, keys = Object.keys(grid[0] || {});
  return Object.fromEntries(keys.map(k => { const vals = grid.map(g => g[k]); return [k, { min: Math.max(1, Math.floor(Math.min(...vals) / 2)), max: Math.ceil(Math.max(...vals) * 2) }]; }));
}
/** Valida una idea: familia permitida para el agente y parámetros enteros dentro de rango. */
export function validateIdea(idea, allowedFamilies) {
  if (!idea || !allowedFamilies.includes(idea.family) || !FAMILIES[idea.family]) return null;
  const b = paramBounds(idea.family), params = {};
  for (const [k, { min, max }] of Object.entries(b)) {
    const v = Math.round(Number(idea.params?.[k]));
    if (!Number.isFinite(v) || v < min || v > max) return null;
    params[k] = v;
  }
  if (idea.family === 'cruce_medias' && params.fast >= params.slow) return null;
  if (idea.family === 'rebote_rsi' && params.low >= params.high) return null;
  return { family: idea.family, params, why: String(idea.why || '').slice(0, 200) };
}

export async function proposeIdeas(db, cfg, { fetchImpl } = {}) {
  const out = [];
  for (const a of DEFAULT_AGENTS.filter(x => x.role === 'bolsa')) {
    const fams = JSON.parse(a.style).families.filter(f => f !== 'comprar_y_mantener');
    const recent = db.prepare(`SELECT s.family, s.params, s.status, e.result FROM strategies s LEFT JOIN experiments e ON e.strategy_id = s.id WHERE s.agent = ? ORDER BY e.id DESC LIMIT 8`).all(a.id)
      .map(r => ({ familia: r.family, parametros: JSON.parse(r.params), estado: r.status, t_examen: r.result ? JSON.parse(r.result).holdout?.t ?? JSON.parse(r.result).train?.t : null }));
    const menu = Object.fromEntries(fams.map(f => [f, { descripcion: FAMILIES[f].label, rangos: paramBounds(f) }]));
    const r = await complete(db, cfg, { task: `ideas:${a.id}`, prefer: 'local', json: true, maxTokens: 350, fetchImpl,
      system: `${agentBrief(db, a.id)}\nPropón hasta 3 variaciones NUEVAS de estrategia que crees que pueden ganarle al mercado. Responde JSON: {"ideas":[{"family":"...","params":{...},"why":"en español, una frase"}]}. Usa solo las familias y rangos permitidos.`,
      prompt: `Familias permitidas: ${JSON.stringify(menu)}\nTus resultados recientes: ${JSON.stringify(recent)}` });
    if (!r.ok) { out.push({ agent: a.id, added: 0, reason: r.reason }); continue; }
    let added = 0;
    for (const raw of (r.json?.ideas || []).slice(0, 3)) {
      const idea = validateIdea(raw, fams);
      if (!idea) continue;
      const res = db.prepare('INSERT OR IGNORE INTO agenda (module, family, title, params, created_at, source) VALUES (?, ?, ?, ?, ?, ?)')
        .run('bolsa', idea.family, `${describe(idea.family, idea.params)} (idea de ${a.name}: ${idea.why})`, JSON.stringify(idea.params), new Date().toISOString(), `ia:${a.id}`);
      added += res.changes;
    }
    if (added) activity(db, { agent: a.id, type: 'ideas', text: `${a.name} propuso ${added} idea(s) nueva(s) para ganar más monedas.` });
    out.push({ agent: a.id, added });
  }
  return out;
}
