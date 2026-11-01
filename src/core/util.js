// Utilidades comunes: tiempo de RD, huellas, azar reproducible y estadística.
import { createHash } from 'node:crypto';

export const RD_OFFSET_H = -4; // República Dominicana: UTC-4 todo el año (sin horario de verano)

export function rdDate(d = new Date()) {
  return new Date(d.getTime() + RD_OFFSET_H * 3600e3);
}
export function ymd(d) {
  return d.toISOString().slice(0, 10);
}
export function rdToday(now = new Date()) {
  return ymd(rdDate(now));
}
/** Convierte fecha RD (YYYY-MM-DD) + hora/minuto RD a un Date real (UTC). */
export function rdTimeToUtc(dateStr, h, m) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - RD_OFFSET_H, m));
}
export function addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return ymd(new Date(Date.UTC(y, mo - 1, d + n)));
}
export function weekday(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** JSON con llaves ordenadas: la misma información produce siempre la misma huella. */
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

/** Generador de azar con semilla (para que las simulaciones se puedan repetir). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pad2 = n => String(n).padStart(2, '0');

// ---------- Estadística ----------
export const sum = a => a.reduce((s, x) => s + x, 0);
export const mean = a => (a.length ? sum(a) / a.length : NaN);
export function sd(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1));
}
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function logGamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
/** Gamma incompleta regularizada superior Q(s, x). */
function gammaQ(s, x) {
  if (x <= 0) return 1;
  if (x < s + 1) {
    let sumv = 1 / s, term = sumv;
    for (let n = 1; n < 500; n++) { term *= x / (s + n); sumv += term; if (Math.abs(term) < Math.abs(sumv) * 1e-14) break; }
    return 1 - sumv * Math.exp(-x + s * Math.log(x) - logGamma(s));
  }
  let b = x + 1 - s, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + s * Math.log(x) - logGamma(s)) * h;
}
/** Valor p de una chi-cuadrado con k grados de libertad. */
export function chiSquareP(stat, k) {
  return gammaQ(k / 2, stat / 2);
}
export function normalCdf(z) {
  // Aproximación de Abramowitz-Stegun (error < 1.5e-7)
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
/** Intervalo de Wilson al 95% para una proporción (aciertos / total). */
export function wilson(hits, n, z = 1.96) {
  if (!n) return { p: NaN, lo: 0, hi: 1 };
  const p = hits / n, den = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / den;
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / den;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}
/** Benjamini-Hochberg: corrige cuando se prueban muchas hipótesis a la vez. Devuelve los índices significativos. */
export function benjaminiHochberg(pvalues, fdr = 0.05) {
  const idx = pvalues.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  let k = -1;
  idx.forEach(([p], r) => { if (p <= ((r + 1) / idx.length) * fdr) k = r; });
  return new Set(idx.slice(0, k + 1).map(([, i]) => i));
}
/** Intervalo por remuestreo (bootstrap) de la media. */
export function bootstrapMean(values, { iters = 2000, seed = 7, lo = 0.05, hi = 0.95 } = {}) {
  if (!values.length) return { mean: NaN, lo: NaN, hi: NaN };
  const r = rng(seed), n = values.length, means = new Array(iters);
  for (let i = 0; i < iters; i++) { let s = 0; for (let j = 0; j < n; j++) s += values[Math.floor(r() * n)]; means[i] = s / n; }
  means.sort((a, b) => a - b);
  return { mean: mean(values), lo: quantile(means, lo), hi: quantile(means, hi) };
}
export const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
