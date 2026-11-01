// Familias de estrategias con parámetros. Cada señal usa solo datos hasta el cierre del día t
// y se ejecuta en la apertura del día siguiente (así nunca ve el futuro).
const sma = (b, t, n) => { if (t + 1 < n) return null; let s = 0; for (let i = t - n + 1; i <= t; i++) s += b[i].close; return s / n; };
function rsi(b, t, n) {
  if (t < n) return null;
  let up = 0, dn = 0;
  for (let i = t - n + 1; i <= t; i++) { const d = b[i].close - b[i - 1].close; if (d > 0) up += d; else dn -= d; }
  return dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
}

export const FAMILIES = {
  comprar_y_mantener: {
    label: 'Comprar y mantener', explain: () => 'Compra y no vende: la referencia del mercado.',
    grid: [{}], target: () => 1,
  },
  cruce_medias: {
    label: 'Cruce de medias', explain: p => `Compra cuando el promedio de ${p.fast} días supera al de ${p.slow} días; vende cuando baja.`,
    grid: [[10, 50], [20, 100], [50, 200], [5, 20]].map(([fast, slow]) => ({ fast, slow })),
    target: (b, t, p) => { const f = sma(b, t, p.fast), s = sma(b, t, p.slow); return f == null || s == null ? 0 : f > s ? 1 : 0; },
  },
  impulso: {
    label: 'Impulso', explain: p => `Compra si subió en los últimos ${p.lookback} días; sale si bajó.`,
    grid: [20, 60, 120, 250].map(lookback => ({ lookback })),
    target: (b, t, p) => (t < p.lookback ? 0 : b[t].close > b[t - p.lookback].close ? 1 : 0),
  },
  rebote_rsi: {
    label: 'Rebote por sobreventa (RSI)', explain: p => `Compra cuando el RSI de ${p.period} días baja de ${p.low}; vende cuando sube de ${p.high}.`,
    grid: [[14, 30, 60], [14, 25, 55], [5, 20, 70]].map(([period, low, high]) => ({ period, low, high })),
    target: (b, t, p, prev) => { const r = rsi(b, t, p.period); if (r == null) return 0; if (prev === 0 && r < p.low) return 1; if (prev === 1 && r > p.high) return 0; return prev; },
  },
  ruptura: {
    label: 'Ruptura de máximos', explain: p => `Compra al superar el máximo de ${p.n} días; vende al perder el mínimo de ${Math.round(p.n / 2)} días.`,
    grid: [20, 55, 100].map(n => ({ n })),
    target: (b, t, p, prev) => {
      if (t < p.n) return 0;
      let hi = -Infinity, lo = Infinity; const half = Math.round(p.n / 2);
      for (let i = t - p.n; i < t; i++) hi = Math.max(hi, b[i].high);
      for (let i = t - half; i < t; i++) lo = Math.min(lo, b[i].low);
      if (b[t].close > hi) return 1; if (b[t].close < lo) return 0; return prev;
    },
  },
};

export function describe(family, params) {
  const f = FAMILIES[family];
  return f ? `${f.label}: ${f.explain(params)}` : family;
}
