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
// Los historiales al azar se crean una sola vez por tamaño y se reutilizan en todas las pruebas (mucho más rápido)
const FAKES = new Map();
function fakesFor(n, sims, seed) {
  const key = `${n}|${sims}|${seed}`;
  if (!FAKES.has(key)) {
    if (FAKES.size > 6) FAKES.clear();
    const r = rng(seed);
    FAKES.set(key, Array.from({ length: sims }, () => Array.from({ length: n }, () => ({ nums: [0, 1, 2].map(() => pad2(Math.floor(r() * 100))) }))));
  }
  return FAKES.get(key);
}
function monteCarloP(n, statFn, observed, { sims = 1000, seed = 11, tail = 'upper' } = {}) {
  const pool = fakesFor(n, sims, 7); // el mismo grupo de historiales al azar para todas las pruebas
  let hits = 0;
  for (let s = 0; s < sims; s++) {
    const v = statFn(pool[s]);
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
  if (n > 300) sims = Math.min(sims, 200); // con muchos sorteos, 200 simulaciones ya dan un % muy preciso
  const tests = [];
  const f = frequencies(hist);

  // Valor p por simulación: válido aunque haya pocos sorteos (la fórmula clásica falla con pocos datos)
  const all = chiUniform(f.total);
  // Con muchos sorteos (5+ esperados por número) la fórmula clásica es exacta y mucho más rápida
  const pAll = n < 10 ? 1 : 3 * n / 100 >= 5 ? all.p : monteCarloP(n, h => chiUniform(frequencies(h).total).stat, all.stat, { sims, seed: 21 });
  tests.push({ id: 'uniforme_total', title: 'Todos los números salen parecido', p: pAll, detail: `${all.n} números observados` });
  [0, 1, 2].forEach(i => {
    const u = chiUniform(f.byPos[i]);
    const pp = n < 10 ? 1 : n / 100 >= 5 ? u.p : monteCarloP(n, h => chiUniform(frequencies(h).byPos[i]).stat, u.stat, { sims, seed: 22 + i });
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
    let p;
    if (3 * half / 100 >= 5) {
      // Muchos sorteos: prueba clásica de "¿las dos mitades tienen el mismo reparto?" (rápida y exacta)
      const fa = frequencies(hist.slice(0, half)).total, fb = frequencies(hist.slice(half)).total;
      const A = 3 * half, B = 3 * (n - half);
      let stat = 0;
      for (const k of NUMS) { const t = fa[k] + fb[k]; if (!t) continue; const ea = t * A / (A + B), eb = t * B / (A + B); stat += (fa[k] - ea) ** 2 / ea + (fb[k] - eb) ** 2 / eb; }
      p = chiSquareP(stat, 99);
    } else p = monteCarloP(n, h => tvd(h.slice(0, half), h.slice(half)), obs, { sims: Math.min(sims, 500), seed: 15 });
    tests.push({ id: 'cambio_brusco', title: 'Se comporta igual antes y después', p, detail: `diferencia entre mitades: ${round(obs * 100, 1)}%` });
  }

  // 🔬 Auditoría profunda (como la de un casino): decenas, pares/impares, suma de las bolas y día de la semana
  if (n >= 20) {
    const all3 = hist.flatMap(d => d.nums.map(Number));
    const dec = Array(10).fill(0); all3.forEach(x => dec[Math.floor(x / 10)]++);
    const ed = all3.length / 10, sDec = dec.reduce((t, o) => t + (o - ed) ** 2 / ed, 0);
    tests.push({ id: 'decenas', title: 'Las decenas (00-09, 10-19…) salen parejo', p: chiSquareP(sDec, 9), detail: `más: ${pad2(dec.indexOf(Math.max(...dec)) * 10)}-${pad2(dec.indexOf(Math.max(...dec)) * 10 + 9)} (${Math.max(...dec)} veces; esperado ≈ ${round(ed, 1)})` });
    const ev = all3.filter(x => x % 2 === 0).length, zE = (ev - all3.length / 2) / Math.sqrt(all3.length / 4);
    tests.push({ id: 'pares', title: 'Pares e impares salen parejo', p: 2 * (1 - normalCdf(Math.abs(zE))), detail: `${round(ev / all3.length * 100, 1)}% pares (esperado 50%)` });
    const sums = hist.map(d => d.nums.reduce((t, x) => t + Number(x), 0)), mS = sums.reduce((a, b) => a + b, 0) / n;
    const zS = (mS - 148.5) / Math.sqrt(2499.75 / n);
    tests.push({ id: 'suma', title: 'Las bolas no tiran hacia números altos o bajos', p: 2 * (1 - normalCdf(Math.abs(zS))), detail: `suma promedio de las 3 bolas: ${round(mS, 1)} (esperado 148.5)` });
  }
  if (n >= 140 && hist[0]?.date) {
    // ¿Los números altos (50-99) salen más algún día de la semana? (tabla 7 días × alto/bajo)
    const hi = Array(7).fill(0), tot = Array(7).fill(0);
    for (const d of hist) { const w = new Date(d.date + 'T12:00:00Z').getUTCDay(); for (const x of d.nums) { tot[w]++; if (Number(x) >= 50) hi[w]++; } }
    const H = hi.reduce((a, b) => a + b, 0), T = tot.reduce((a, b) => a + b, 0);
    let st = 0;
    for (let w = 0; w < 7; w++) if (tot[w]) { const eh = tot[w] * H / T, el = tot[w] - eh; st += (hi[w] - eh) ** 2 / eh + ((tot[w] - hi[w]) - el) ** 2 / el; }
    const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const share = hi.map((h, w) => (tot[w] ? h / tot[w] : 0.5)), wMax = share.indexOf(Math.max(...share));
    tests.push({ id: 'dia_semana', title: 'Se comporta igual todos los días de la semana', p: chiSquareP(st, 6), detail: `el día con más números altos: ${DAYS[wMax]} (${round(share[wMax] * 100)}%; lo normal ≈ 50%)` });
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
