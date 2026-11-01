// Pagos de una banca típica (por cada RD$1 apostado) y cálculo exacto del valor esperado.
// Quiniela, palé y tripleta no tienen pago oficial: los fija cada banca, por eso son configurables.
import { pad2 } from '../core/util.js';

export const DEFAULT_PAYOUTS = Object.freeze({
  q: [60, 8, 4],     // quiniela: sale en 1ra, 2da o 3ra
  p12: 1000, p13: 1000, p23: 100, // palé por par de posiciones
  t3: 20000, t2: 100, // tripleta: 3 aciertos / 2 aciertos
});

/** Cuánto paga (multiplicador) una jugada frente a un sorteo real [1ra, 2da, 3ra]. */
export function settleMultiplier(kind, numbers, draw, P = DEFAULT_PAYOUTS) {
  if (kind === 'quiniela') {
    let m = 0;
    for (let i = 0; i < 3; i++) if (draw[i] === numbers[0]) m += P.q[i];
    return m;
  }
  if (kind === 'pale') {
    const [a, b] = numbers;
    let best = 0;
    for (const [i, j, v] of [[0, 1, P.p12], [0, 2, P.p13], [1, 2, P.p23]]) {
      if ((draw[i] === a && draw[j] === b) || (draw[i] === b && draw[j] === a)) best = Math.max(best, v);
    }
    return best;
  }
  if (kind === 'tripleta') {
    const left = draw.slice();
    let hits = 0;
    for (const n of numbers) { const k = left.indexOf(n); if (k >= 0) { hits++; left.splice(k, 1); } }
    return hits === 3 ? P.t3 : hits === 2 ? P.t2 : 0;
  }
  throw new Error(`Tipo de jugada desconocido: ${kind}`);
}

const cache = new Map();
/** Retorno exacto por cada RD$1 recorriendo los 1,000,000 resultados posibles (cada posición 00–99, independientes). */
export function expectedReturn(kind, P = DEFAULT_PAYOUTS) {
  const key = kind + JSON.stringify(P);
  if (cache.has(key)) return cache.get(key);
  const sample = { quiniela: ['07'], pale: ['07', '23'], tripleta: ['07', '23', '45'] }[kind];
  const d = ['', '', ''];
  let total = 0;
  for (let a = 0; a < 100; a++) { d[0] = pad2(a);
    for (let b = 0; b < 100; b++) { d[1] = pad2(b);
      for (let c = 0; c < 100; c++) { d[2] = pad2(c); total += settleMultiplier(kind, sample, d, P); } } }
  const r = total / 1e6;
  cache.set(key, r);
  return r;
}

/** Probabilidad exacta de cobrar algo con una jugada. */
export function winProbability(kind, P = DEFAULT_PAYOUTS) {
  const sample = { quiniela: ['07'], pale: ['07', '23'], tripleta: ['07', '23', '45'] }[kind];
  const d = ['', '', ''];
  let wins = 0;
  for (let a = 0; a < 100; a++) { d[0] = pad2(a);
    for (let b = 0; b < 100; b++) { d[1] = pad2(b);
      for (let c = 0; c < 100; c++) { d[2] = pad2(c); if (settleMultiplier(kind, sample, d, P) > 0) wins++; } } }
  return wins / 1e6;
}
