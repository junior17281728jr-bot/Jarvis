// Vigilancia estadística: ¿se comportan los sorteos como azar justo? Busca anomalías y posibles trampas.
// Una anomalía es una señal para investigar, no una prueba de fraude.
import { chiSquareP, normalCdf, benjaminiHochberg, rng, pad2, round } from '../core/util.js';

const NUMS = Array.from({ length: 100 }, (_, i) => pad2(i));

export function frequencies(hist) {
  const byPos = [0, 1, 2].map(() => Object.fromEntries(NUMS.map(n => [n, 0])));
  const total = Object.fromEntries(NUMS.map(n => [n, 0]));
  const lastSeen = Object.fromEntries(NUMS.map(n => [n, null]));
  hist.forEach((d, t) => d.nums.forEach((n, i) => { byPos[i][n]++; total[n]++; lastSeen[n] = t; }));
  const gaps = Object.fromEntries(NUMS.map(n => [n, lastSeen[n] === null ? hist.length : hist.length - 1 - lastSeen[n]]));
  return { byPos, total, gaps, draws: hist.length };
}

function chiUniform(counts) {
  const vals = Object.values(counts), n = vals.reduce((a, b) => a + b, 0);
  if (!n) return { stat: 0, p: 1, n: 0 };
  const e = n / vals.length;
  const stat = vals.reduce((s, o) => s + (o - e) ** 2 / e, 0);
  return { stat, p: chiSquareP(stat, vals.length - 1), n };
}

/** Valor p por simulación: compara una medida real contra miles de historiales al azar del mismo tamaño. */
function monteCarloP(n, statFn, observed, { sims = 1000, seed = 11, tail = 'upper' } = {}) {
  const r = rng(seed);
  let hits = 0;
  for (let s = 0; s < sims; s++) {
    const fake = Array.from({ length: n }, () => ({ nums: [0, 1, 2].map(() => pad2(Math.floor(r() * 100))) }));
    const v = statFn(fake);
    if (tail === 'upper' ? v >= observed : v <= observed) hits++;
  }
  return (hits + 1) / (sims + 1);
}

const dupWithin = h => h.filter(d => new Set(d.nums).size < 3).length / Math.max(1, h.length);
const repeatPrev = h => {
  let c = 0;
  for (let t = 1; t < h.length; t++) if (h[t].nums.some(n => h[t - 1].nums.includes(n))) c++;
  return c / Math.max(1, h.length - 1);
};
const maxCount = h => { const t = {}; h.forEach(d => d.nums.forEach(n => (t[n] = (t[n] || 0) + 1))); return Math.max(0, ...Object.values(t)); };

/** Revisa todo y devuelve hallazgos con su probabilidad de ser casualidad, ya corregida por pruebas múltiples. */
export function scan(hist, { label = '', sims = 1000 } = {}) {
  const n = hist.length;
  const tests = [];
  const f = frequencies(hist);

  // Valor p por simulación: válido aunque haya pocos sorteos (la fórmula clásica falla con pocos datos)
  const all = chiUniform(f.total);
  const pAll = n >= 10 ? monteCarloP(n, h => chiUniform(frequencies(h).total).stat, all.stat, { sims, seed: 21 }) : 1;
  tests.push({ id: 'uniforme_total', title: 'Todos los números salen parecido', p: pAll, detail: `${all.n} números observados` });
  [0, 1, 2].forEach(i => {
    const u = chiUniform(f.byPos[i]);
    const pp = n >= 10 ? monteCarloP(n, h => chiUniform(frequencies(h).byPos[i]).stat, u.stat, { sims, seed: 22 + i }) : 1;
    tests.push({ id: `uniforme_pos${i + 1}`, title: `Reparto parejo en ${['1ra', '2da', '3ra'][i]} posición`, p: pp, detail: `${n} sorteos` });
  });

  // Números individuales que salen demasiado (prueba z), con corrección por haber mirado 100 números
  const exp = 3 * n / 100, sdv = Math.sqrt(3 * n * 0.01 * 0.99);
  const perNum = NUMS.map(num => {
    const z = sdv ? (f.total[num] - exp) / sdv : 0;
    return { num, count: f.total[num], z, p: 2 * (1 - normalCdf(Math.abs(z))) };
  });
  const sig = benjaminiHochberg(perNum.map(x => x.p));
  const hotOutliers = perNum.filter((_, i) => sig.has(i));

  const mc = h => maxCount(h);
  const pMax = n >= 10 ? monteCarloP(n, mc, maxCount(hist), { sims }) : 1;
  tests.push({ id: 'numero_dominante', title: 'Ningún número sale exageradamente', p: pMax, detail: `máximo observado: ${maxCount(hist)} veces (esperado ≈ ${round(exp, 1)})` });

  const dw = dupWithin(hist);
  tests.push({ id: 'repetidos_mismo_sorteo', title: 'Números repetidos en el mismo sorteo, frecuencia normal', p: n >= 10 ? Math.min(1, 2 * Math.min(monteCarloP(n, dupWithin, dw, { sims }), monteCarloP(n, dupWithin, dw, { sims, tail: 'lower', seed: 12 }))) : 1, detail: `${round(dw * 100, 1)}% de sorteos (esperado ≈ 3.0%)` });

  const rp = repeatPrev(hist);
  tests.push({ id: 'repite_anterior', title: 'Repite números del sorteo anterior con frecuencia normal', p: n >= 10 ? Math.min(1, 2 * Math.min(monteCarloP(n, repeatPrev, rp, { sims, seed: 13 }), monteCarloP(n, repeatPrev, rp, { sims, seed: 14, tail: 'lower' }))) : 1, detail: `${round(rp * 100, 1)}% de sorteos (esperado ≈ 8.7%)` });

  // Cambio brusco: primera mitad contra segunda mitad
  if (n >= 40) {
    const half = Math.floor(n / 2);
    const tvd = (a, b) => { const fa = frequencies(a).total, fb = frequencies(b).total; return NUMS.reduce((s, k) => s + Math.abs(fa[k] / (3 * a.length) - fb[k] / (3 * b.length)), 0) / 2; };
    const obs = tvd(hist.slice(0, half), hist.slice(half));
    const p = monteCarloP(n, h => tvd(h.slice(0, half), h.slice(half)), obs, { sims: Math.min(sims, 500), seed: 15 });
    tests.push({ id: 'cambio_brusco', title: 'Se comporta igual antes y después', p, detail: `diferencia entre mitades: ${round(obs * 100, 1)}%` });
  }

  const corrected = benjaminiHochberg(tests.map(t => t.p), 0.05);
  tests.forEach((t, i) => { t.anomaly = corrected.has(i); t.p = round(t.p, 4); });
  const anomalies = tests.filter(t => t.anomaly);
  const minDraws = 100;
  return {
    label, draws: n, tests, hotOutliers,
    enoughData: n >= minDraws,
    verdict: n < 30
      ? `Solo hay ${n} sorteos: todavía muy pocos para sacar conclusiones.`
      : anomalies.length || hotOutliers.length
        ? `Señal para revisar: ${anomalies.map(a => a.title.toLowerCase()).concat(hotOutliers.map(h => `el ${h.num} sale ${h.count} veces`)).join('; ')}. No es prueba de fraude.`
        : `Sin anomalías en ${n} sorteos: se comporta como azar justo${n < minDraws ? ' (con pocos datos todavía)' : ''}.`,
  };
}

/** Ranking de números con su explicación, para mostrar antes del sorteo (siempre con la advertencia de azar). */
export function numberInsights(hist, top = 10) {
  const f = frequencies(hist), n = hist.length, exp = 3 * n / 100;
  return Object.keys(f.total)
    .map(num => ({ num, count: f.total[num], expected: round(exp, 1), gap: f.gaps[num] }))
    .sort((a, b) => b.count - a.count || a.gap - b.gap)
    .slice(0, top);
}
