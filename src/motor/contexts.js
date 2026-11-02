// 🔎 "¿Dónde sí sirve?": revisa las ideas que NO pasaron en general y busca casos específicos donde sí funcionan
// (mercado subiendo o bajando, en calma o nervioso, o en una acción en particular).
// Muy exigente para no engañarse: muchos días, señal fuerte (corrección por todas las comparaciones hechas)
// y que funcione en las DOS mitades del tiempo. Un hallazgo es una PISTA para probar, no una idea aprobada.
import { getBars } from '../stocks/market.js';
import { runStrategy } from '../stocks/backtest.js';
import { describe } from '../stocks/strategies.js';
import { getSetting, setSetting, nowIso, activity } from '../core/db.js';
import { normalCdf, benjaminiHochberg } from '../core/util.js';

export const CONTEXT_LABEL = {
  alcista: 'cuando el mercado va subiendo (SPY por encima de su promedio de 200 días)',
  bajista: 'cuando el mercado va bajando (SPY por debajo de su promedio de 200 días)',
  calma: 'cuando el mercado está en calma (se mueve menos de lo normal)',
  nervioso: 'cuando el mercado está nervioso (se mueve más de lo normal)',
};
const MIN_DAYS = { regimen: 250, accion: 400 };

/** Situación del mercado de cada día, mirando SOLO el pasado. */
export function regimes(bench) {
  const out = new Map(), vols = [];
  for (let i = 0; i < bench.length; i++) {
    if (i < 200) continue;
    let s = 0; for (let k = i - 199; k <= i; k++) s += bench[k].close;
    const rets = []; for (let k = i - 19; k <= i; k++) rets.push(bench[k].close / bench[k - 1].close - 1);
    const m = rets.reduce((a, b) => a + b, 0) / 20, v = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / 19);
    vols.push(v);
    const hist = vols.slice(-252).slice().sort((a, b) => a - b), med = hist[Math.floor(hist.length / 2)];
    out.set(bench[i].ts, { trend: bench[i].close > s / 200 ? 'alcista' : 'bajista', vol: v > med ? 'nervioso' : 'calma' });
  }
  return out;
}

function stat(xs) {
  const n = xs.length; if (n < 30) return null;
  const m = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  const h = Math.floor(n / 2), m1 = xs.slice(0, h).reduce((a, b) => a + b, 0) / h, m2 = xs.slice(h).reduce((a, b) => a + b, 0) / (n - h);
  return { n, mean: m, t, p: 1 - normalCdf(t), both: m1 > 0 && m2 > 0 };
}

/** Revisa las ideas descartadas en cada situación y en cada acción. */
export function contextScan(db, { symbols, bench = 'SPY', maxStrategies = 60 } = {}) {
  const benchBars = getBars(db, bench);
  if (benchBars.length < 300) return { skipped: 'faltan precios del mercado', findings: [] };
  const bRet = new Map(benchBars.map((b, i) => [b.ts, i ? b.close / benchBars[i - 1].close - 1 : 0]));
  const reg = regimes(benchBars);
  const strats = db.prepare(`SELECT id, family, params, status FROM strategies WHERE module = 'bolsa' AND status IN ('no_validada', 'retirada', 'en_revision') ORDER BY id DESC LIMIT ?`).all(maxStrategies);
  const barsBy = new Map(symbols.filter(s => s !== bench).map(s => [s, getBars(db, s)]).filter(([, b]) => b.length >= 300));
  const tests = [];
  for (const s of strats) {
    const params = JSON.parse(s.params), buckets = {};
    for (const [sym, bars] of barsBy) {
      const run = runStrategy(bars, s.family, params);
      run.curve.forEach((c, i) => {
        const br = bRet.get(c.ts), rg = reg.get(c.ts); if (br == null || !rg) return;
        const x = run.daily[i] - br;
        (buckets[`regimen:${rg.trend}`] ||= []).push(x); (buckets[`regimen:${rg.vol}`] ||= []).push(x); (buckets[`accion:${sym}`] ||= []).push(x);
      });
    }
    for (const [key, xs] of Object.entries(buckets)) {
      const [kind, what] = key.split(':'); const st = stat(xs);
      if (st && st.n >= MIN_DAYS[kind]) tests.push({ strategyId: s.id, family: s.family, params, kind, what, ...st });
    }
  }
  // Corrección por TODAS las comparaciones (si no, por pura suerte algo siempre "funciona")
  const sig = benjaminiHochberg(tests.map(t => t.p), 0.05);
  const findings = tests.filter((t, i) => sig.has(i) && t.mean > 0 && t.both)
    .sort((a, b) => b.t - a.t).slice(0, 25)
    .map(t => ({ strategyId: t.strategyId, regla: describe(t.family, t.params), familia: t.family, tipo: t.kind, caso: t.what,
      donde: t.kind === 'accion' ? `en ${t.what}` : CONTEXT_LABEL[t.what], dias: t.n, extra_anual_pct: Math.round(t.mean * 252 * 1000) / 10, t: Math.round(t.t * 10) / 10 }));
  return { at: nowIso(), checkedStrategies: strats.length, comparisons: tests.length, findings };
}

/** Votos del ranking según la situación del mercado ese día (¿acierta más cuando sube o cuando baja?). */
export function votesByContext(db, bench = 'SPY') {
  const benchBars = getBars(db, bench); if (benchBars.length < 300) return [];
  const reg = regimes(benchBars), acc = {};
  for (const r of db.prepare("SELECT json_extract(payload,'$.startDate') d, correct FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL").all()) {
    let rg = reg.get(r.d); if (!rg) { const prev = benchBars.filter(b => b.ts <= r.d).pop(); rg = prev && reg.get(prev.ts); } if (!rg) continue;
    for (const k of [rg.trend, rg.vol]) { const a = (acc[k] ||= { n: 0, c: 0 }); a.n++; a.c += r.correct; }
  }
  return Object.entries(acc).map(([k, a]) => ({ situacion: CONTEXT_LABEL[k], resueltos: a.n, acierto_pct: Math.round(a.c / a.n * 1000) / 10 }));
}

/** Tarea semanal: busca, guarda y avisa de los hallazgos nuevos. */
export function runContextScan(db, opts) {
  const prev = new Set((getSetting(db, 'global', 'lessons.contexts', null)?.findings || []).map(f => `${f.strategyId}:${f.caso}`));
  const r = contextScan(db, opts);
  if (r.skipped) return r;
  const votes = votesByContext(db, opts.bench);
  setSetting(db, 'global', 'lessons.contexts', { ...r, votes });
  const nuevos = r.findings.filter(f => !prev.has(`${f.strategyId}:${f.caso}`));
  for (const f of nuevos.slice(0, 3)) activity(db, { agent: 'largo', type: 'leccion', important: true, text: `🔎 Pista: "${f.regla}" no sirve en general, pero ${f.donde} le ganó al mercado ${f.extra_anual_pct}% al año (${f.dias} días, en las dos mitades del tiempo). Es una pista para probar, no una idea aprobada.` });
  return { comparisons: r.comparisons, findings: r.findings.length, nuevos: nuevos.length };
}
