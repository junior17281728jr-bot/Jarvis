// 🧬 Las "piezas" con las que JARVIS arma reglas nuevas por su cuenta. Cada pieza mira SOLO datos hasta el día t
// (nunca el futuro) y dice sí o no. Una regla = 1 a 3 piezas que deben cumplirse a la vez.
const sma = (b, t, n) => { if (t + 1 < n) return null; let s = 0; for (let i = t - n + 1; i <= t; i++) s += b[i].close; return s / n; };
const vol = (b, t, n) => { if (t < n) return null; let s = 0, s2 = 0; for (let i = t - n + 1; i <= t; i++) { const r = b[i].close / b[i - 1].close - 1; s += r; s2 += r * r; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
function rsi(b, t, n = 14) { if (t < n) return null; let up = 0, dn = 0; for (let i = t - n + 1; i <= t; i++) { const d = b[i].close - b[i - 1].close; if (d > 0) up += d; else dn -= d; } return dn === 0 ? 100 : 100 - 100 / (1 + up / dn); }

export const GENES = {
  sobre_media: { opts: [{ n: 10 }, { n: 20 }, { n: 50 }, { n: 100 }, { n: 200 }], text: p => `el precio está por encima de su promedio de ${p.n} días`, test: (b, t, p) => { const m = sma(b, t, p.n); return m != null && b[t].close > m; } },
  bajo_media: { opts: [{ n: 10 }, { n: 20 }, { n: 50 }, { n: 200 }], text: p => `el precio está por debajo de su promedio de ${p.n} días`, test: (b, t, p) => { const m = sma(b, t, p.n); return m != null && b[t].close < m; } },
  subio: { opts: [{ n: 5 }, { n: 20 }, { n: 60 }, { n: 120 }, { n: 250 }], text: p => `subió en los últimos ${p.n} días`, test: (b, t, p) => t >= p.n && b[t].close > b[t - p.n].close },
  bajo: { opts: [{ n: 3 }, { n: 5 }, { n: 10 }, { n: 20 }], text: p => `bajó en los últimos ${p.n} días`, test: (b, t, p) => t >= p.n && b[t].close < b[t - p.n].close },
  cerca_maximo: { opts: [{ n: 60 }, { n: 252 }], text: p => `está a menos de 5% de su máximo de ${p.n} días`, test: (b, t, p) => { if (t < p.n) return false; let hi = -Infinity; for (let i = t - p.n + 1; i <= t; i++) hi = Math.max(hi, b[i].high ?? b[i].close); return b[t].close >= 0.95 * hi; } },
  calma: { opts: [{}], text: () => 'se está moviendo menos de lo normal (calma)', test: (b, t) => { const a = vol(b, t, 20), y = vol(b, t, 252); return a != null && y != null && a < y; } },
  nervioso: { opts: [{}], text: () => 'se está moviendo más de lo normal (nervios)', test: (b, t) => { const a = vol(b, t, 20), y = vol(b, t, 252); return a != null && y != null && a > y; } },
  volumen_alto: { opts: [{ k: 1.5 }, { k: 2 }], text: p => `hoy se negoció ${p.k} veces más de lo normal`, test: (b, t, p) => { if (t < 20 || !b[t].volume) return false; let s = 0; for (let i = t - 20; i < t; i++) s += b[i].volume || 0; return b[t].volume > p.k * (s / 20); } },
  racha_bajando: { opts: [{ k: 2 }, { k: 3 }, { k: 4 }], text: p => `bajó ${p.k} días seguidos`, test: (b, t, p) => { if (t < p.k) return false; for (let i = t - p.k + 1; i <= t; i++) if (!(b[i].close < b[i - 1].close)) return false; return true; } },
  rsi_bajo: { opts: [{ th: 30 }, { th: 40 }], text: p => `su RSI está por debajo de ${p.th} (muy vendida)`, test: (b, t, p) => { const r = rsi(b, t); return r != null && r < p.th; } },
  rsi_alto: { opts: [{ th: 60 }, { th: 70 }], text: p => `su RSI está por encima de ${p.th} (con mucha fuerza)`, test: (b, t, p) => { const r = rsi(b, t); return r != null && r > p.th; } },
};

/** Forma única de escribir una regla (así no se prueba dos veces la misma). */
export const canon = genes => JSON.stringify({ genes: [...genes].map(g => ({ g: g.g, p: g.p })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
export const ruleText = p => `Compra cuando ${p.genes.map(g => GENES[g.g]?.text(g.p) || g.g).join(' y ')}; si deja de cumplirse, vende.`;
export const ruleTest = (b, t, p) => p.genes.every(g => GENES[g.g]?.test(b, t, g.p));
