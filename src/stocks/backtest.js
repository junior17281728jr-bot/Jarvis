// Prueba histórica con costes, ejecución al día siguiente y métricas honestas.
import { FAMILIES } from './strategies.js';
import { mean, sd, round } from '../core/util.js';

/** Corre una estrategia sobre barras diarias. Devuelve curva de capital, operaciones y retornos diarios. */
export function runStrategy(bars, family, params, { costBps = 8, from = 0 } = {}) {
  const f = FAMILIES[family];
  let pos = 0, equity = 1, entryPx = null, entryTs = null;
  const curve = [], daily = [], trades = [];
  for (let t = Math.max(1, from); t < bars.length; t++) {
    // 1) La decisión tomada ayer al cierre se ejecuta hoy en la apertura
    const want = f.target(bars, t - 1, params, pos);
    let r = 0;
    if (want !== pos) {
      if (want === 1) { entryPx = bars[t].open * (1 + costBps / 1e4); entryTs = bars[t].ts; r = bars[t].close / entryPx - 1; }
      else { const exit = bars[t].open * (1 - costBps / 1e4); r = exit / bars[t - 1].close - 1; trades.push({ entry: entryTs, exit: bars[t].ts, ret: exit / entryPx - 1 }); }
      pos = want;
    } else if (pos === 1) r = bars[t].close / bars[t - 1].close - 1;
    equity *= 1 + r;
    daily.push(r);
    curve.push({ ts: bars[t].ts, equity });
  }
  if (pos === 1 && entryPx) trades.push({ entry: entryTs, exit: null, ret: bars[bars.length - 1].close / entryPx - 1, open: true });
  return { family, params, curve, daily, trades };
}

export function metrics(run, benchDaily = null) {
  const d = run.daily, eq = run.curve.map(c => c.equity);
  let peak = 1, maxDD = 0;
  for (const e of eq) { peak = Math.max(peak, e); maxDD = Math.min(maxDD, e / peak - 1); }
  const closed = run.trades.filter(t => !t.open);
  const wins = closed.filter(t => t.ret > 0), losses = closed.filter(t => t.ret <= 0);
  let run_ = 0, type = null, bestW = 0, bestL = 0;
  for (const t of closed) { const k = t.ret > 0 ? 'w' : 'l'; run_ = k === type ? run_ + 1 : 1; type = k; if (k === 'w') bestW = Math.max(bestW, run_); else bestL = Math.max(bestL, run_); }
  const s = sd(d), m = mean(d);
  const out = {
    days: d.length, totalReturn: eq.length ? eq[eq.length - 1] - 1 : 0, maxDrawdown: maxDD,
    sharpe: s > 0 ? (m / s) * Math.sqrt(252) : 0, trades: closed.length, winRate: closed.length ? wins.length / closed.length : null,
    avgWin: wins.length ? mean(wins.map(t => t.ret)) : 0, avgLoss: losses.length ? mean(losses.map(t => t.ret)) : 0,
    streak: { current: run_, type: type === 'w' ? 'ganancia' : type === 'l' ? 'perdida' : null, bestWin: bestW, bestLoss: bestL },
    exposure: d.length ? d.filter(x => x !== 0).length / d.length : 0,
  };
  if (benchDaily && benchDaily.length === d.length) {
    const ex = d.map((x, i) => x - benchDaily[i]);
    const es = sd(ex), em = mean(ex);
    out.excessDaily = ex;
    out.tStat = es > 0 ? em / (es / Math.sqrt(ex.length)) : 0;
    out.benchReturn = benchDaily.reduce((e, x) => e * (1 + x), 1) - 1;
  }
  for (const k of ['totalReturn', 'maxDrawdown', 'sharpe', 'winRate', 'avgWin', 'avgLoss', 'exposure', 'benchReturn', 'tStat']) if (typeof out[k] === 'number') out[k] = round(out[k], 4);
  return out;
}

/** Divide por fecha: lo primero para buscar, lo último bajo llave para el examen final. */
export function splitIndex(bars, holdoutFrac = 0.3) {
  return Math.floor(bars.length * (1 - holdoutFrac));
}
