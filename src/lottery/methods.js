// Métodos populares para elegir números. Cada uno solo ve el pasado (nunca el resultado que va a jugar).
import { pad2 } from '../core/util.js';
import { frequencies } from './stats.js';
import { KINDS } from './games.js';

function fill(picked, n, r) {
  const out = [...new Set(picked)].slice(0, n);
  while (out.length < n) { const x = pad2(Math.floor(r() * 100)); if (!out.includes(x)) out.push(x); }
  return out;
}
const byCount = (counts, desc = true) => Object.entries(counts).sort((a, b) => (desc ? b[1] - a[1] : a[1] - b[1]) || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);

export const METHODS = {
  azar: { version: 1, label: 'Azar puro', why: 'Números al azar: la referencia contra la que se mide todo.',
    pick: (h, k, r) => fill([], KINDS[k], r) },
  calientes: { version: 1, label: 'Calientes (últimos 30)', why: 'Los que más salieron en los últimos 30 sorteos.',
    pick: (h, k, r) => fill(byCount(frequencies(h.slice(-30)).total), KINDS[k], r) },
  atrasados: { version: 1, label: 'Atrasados', why: 'Los que llevan más tiempo sin salir.',
    pick: (h, k, r) => fill(byCount(frequencies(h).gaps), KINDS[k], r) },
  frecuentes: { version: 1, label: 'Más frecuentes de siempre', why: 'Los que más han salido en todo el historial.',
    pick: (h, k, r) => fill(byCount(frequencies(h).total), KINDS[k], r) },
  repetir: { version: 1, label: 'Repetir el último sorteo', why: 'Juega los números del sorteo anterior.',
    pick: (h, k, r) => fill(h.length ? h[h.length - 1].nums : [], KINDS[k], r) },
  espejo: { version: 1, label: 'Espejo del último', why: 'Invierte los dígitos del sorteo anterior (34 → 43).',
    pick: (h, k, r) => fill(h.length ? h[h.length - 1].nums.map(x => x[1] + x[0]) : [], KINDS[k], r) },
};
