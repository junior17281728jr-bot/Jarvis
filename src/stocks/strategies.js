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

// ---------- Estrategias que usan los profesionales (estudiadas por años en la literatura de inversión) ----------
const sd = (b, t, n) => { if (t < n) return null; const r = []; for (let i = t - n + 1; i <= t; i++) r.push(b[i].close / b[i - 1].close - 1); const m = r.reduce((a, x) => a + x, 0) / n; return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / n); };
Object.assign(FAMILIES, {
  tendencia_larga: {
    label: 'Filtro de tendencia (estilo Faber)', explain: p => `Está invertido solo mientras el precio está por encima de su promedio de ${p.n} días; si cae por debajo, sale para esquivar las caídas grandes.`,
    grid: [100, 150, 200].map(n => ({ n })),
    target: (b, t, p) => { const m = sma(b, t, p.n); return m == null ? 0 : b[t].close > m ? 1 : 0; },
  },
  momento_12_1: {
    label: 'Momento de 12 meses (sin el último mes)', explain: p => `Compra si subió desde hace ${Math.round(p.look / 21)} meses hasta hace ${Math.round(p.skip / 21)} mes(es); ignora el último mes porque suele revertirse.`,
    grid: [[252, 21], [126, 21], [189, 21]].map(([look, skip]) => ({ look, skip })),
    target: (b, t, p) => (t < p.look ? 0 : b[t - p.skip].close > b[t - p.look].close ? 1 : 0),
  },
  baja_volatilidad: {
    label: 'Solo en calma (baja volatilidad)', explain: p => `Está invertido cuando el precio se mueve menos de lo normal (últimos ${p.n} días contra el último año) y sale cuando hay nerviosismo.`,
    grid: [20, 60].map(n => ({ n })),
    target: (b, t, p) => { if (t < 260) return 0; const now = sd(b, t, p.n), year = sd(b, t, 252); return now == null || year == null ? 0 : now < year ? 1 : 0; },
  },
  bandas_bollinger: {
    label: 'Rebote en bandas de Bollinger', explain: p => `Compra cuando el precio cae ${p.k} desviaciones por debajo de su promedio de ${p.n} días (muy barato para lo normal) y vende cuando vuelve al promedio.`,
    grid: [[20, 2], [20, 1.5]].map(([n, k]) => ({ n, k })),
    target: (b, t, p, prev) => { const m = sma(b, t, p.n); if (m == null || t < p.n) return 0; let v = 0; for (let i = t - p.n + 1; i <= t; i++) v += (b[i].close - m) ** 2; const s = Math.sqrt(v / p.n); if (prev === 0 && b[t].close < m - p.k * s) return 1; if (prev === 1 && b[t].close >= m) return 0; return prev; },
  },
});

const REGIMEN = { alcista: 'solo cuando el mercado va subiendo', bajista: 'solo cuando el mercado va bajando', calma: 'solo con el mercado en calma', nervioso: 'solo con el mercado nervioso' };
export function describe(family, params) {
  const f = FAMILIES[family];
  return f ? `${f.label}: ${f.explain(params)}${params?.regimen ? ` (${REGIMEN[params.regimen] || params.regimen})` : ''}` : family;
}
