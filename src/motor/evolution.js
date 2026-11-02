// 🧬 Evolución de reglas: JARVIS inventa reglas combinando piezas, las prueba con años de precios (solo la parte
// de entrenamiento), cruza y muta las mejores, y repite. Así prueba miles de ideas que una persona nunca probaría.
// Las que sobresalen pasan a la agenda normal, donde las espera el EXAMEN FINAL con precios que nunca vio
// (con la exigencia extra por pruebas múltiples). Ninguna regla se usa sin pasar ese examen.
import { getSetting, setSetting, nowIso, activity } from '../core/db.js';
import { getBars } from '../stocks/market.js';
import { splitIndex } from '../stocks/backtest.js';
import { GENES, canon, ruleText, ruleTest } from '../stocks/genes.js';
import { describe } from '../stocks/strategies.js';
import { rng, round } from '../core/util.js';

const POOL = Object.entries(GENES).flatMap(([g, d]) => d.opts.map(p => ({ g, p })));
const COST = 0.0008; // 0.08% por cada entrada o salida

/** Prepara, por acción, qué piezas se cumplen cada día (se calcula una sola vez por vuelta). */
function prepare(db, symbols, bench) {
  const bb = getBars(db, bench), bRet = new Map(bb.map((b, i) => [b.ts, i ? b.close / bb[i - 1].close - 1 : 0]));
  return symbols.map(sym => {
    const bars = getBars(db, sym);
    if (bars.length < 400) return null;
    const split = splitIndex(bars, 0.3); // solo la parte de entrenamiento: lo último queda bajo llave
    const memo = new Map();
    const flags = gene => { const k = JSON.stringify(gene); if (!memo.has(k)) { const a = new Uint8Array(split); for (let t = 0; t < split; t++) a[t] = GENES[gene.g].test(bars, t, gene.p) ? 1 : 0; memo.set(k, a); } return memo.get(k); };
    return { sym, bars, split, flags, bRet };
  }).filter(Boolean);
}

/** Qué tan buena es una regla en entrenamiento: ganancia extra diaria contra el mercado (t-stat), con costos. */
function fitness(data, genes) {
  const ex = []; let trades = 0, inDays = 0, days = 0;
  for (const d of data) {
    const F = genes.map(g => d.flags(g));
    let pos = 0;
    for (let t = 1; t < d.split - 1; t++) {
      const want = F.every(a => a[t - 1]) ? 1 : 0; // decidido con el cierre de ayer
      let r = 0;
      if (want !== pos) { r -= COST; if (want) trades++; pos = want; }
      if (pos) { r += d.bars[t].close / d.bars[t - 1].close - 1; inDays++; }
      const br = d.bRet.get(d.bars[t].ts);
      if (br != null) { ex.push(r - br); days++; } // igual que el examen final: estar fuera cuando el mercado sube también cuenta en contra
    }
  }
  const n = ex.length; if (n < 200) return { t: -9, trades, exposure: 0 };
  const m = ex.reduce((a, b) => a + b, 0) / n, s = Math.sqrt(ex.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return { t: s > 0 ? m / (s / Math.sqrt(n)) : 0, annual: m * 252, trades, exposure: inDays / Math.max(1, days) };
}

const randGene = r => POOL[Math.floor(r() * POOL.length)];
const randRule = r => { const k = 1 + Math.floor(r() * 3), set = new Map(); while (set.size < k) { const g = randGene(r); set.set(g.g, g); } return [...set.values()]; };
function mutate(genes, r) {
  const out = genes.map(g => ({ ...g })), op = r();
  if (op < 0.4 && out.length) { const i = Math.floor(r() * out.length), opts = GENES[out[i].g].opts; out[i] = { g: out[i].g, p: opts[Math.floor(r() * opts.length)] }; }
  else if (op < 0.7 && out.length < 3) { const g = randGene(r); if (!out.some(x => x.g === g.g)) out.push(g); }
  else if (out.length > 1) out.splice(Math.floor(r() * out.length), 1);
  return out;
}
function cross(a, b, r) { const mix = [...a, ...b].filter(() => r() < 0.6), m = new Map(); for (const g of mix) m.set(g.g, g); const out = [...m.values()].slice(0, 3); return out.length ? out : [a[0]]; }

/** Una generación: crea reglas nuevas, las prueba y manda las mejores al examen final. */
export function evolveStep(db, { symbols, bench = 'SPY', size = 40, seed = Date.now() } = {}) {
  const r = rng(seed % 2147483647);
  const data = prepare(db, symbols.filter(s => s !== bench), bench);
  if (data.length < 3) return { skipped: 'pocos datos' };
  const st = getSetting(db, 'global', 'evo', { gen: 0, tested: 0, pop: [], best: [] });
  const seen = new Set(st.pop.map(x => x.key));
  const parents = st.pop.slice(0, 10);
  const kids = [];
  while (kids.length < size) {
    const genes = !parents.length || r() < 0.3 ? randRule(r) : r() < 0.5 ? mutate(parents[Math.floor(r() * parents.length)].genes, r) : cross(parents[Math.floor(r() * parents.length)].genes, parents[Math.floor(r() * parents.length)].genes, r);
    const key = canon(genes); if (seen.has(key)) continue; seen.add(key);
    kids.push({ key, genes: JSON.parse(key).genes });
  }
  for (const k of kids) Object.assign(k, fitness(data, k.genes));
  const pop = [...st.pop, ...kids].sort((a, b) => b.t - a.t).slice(0, 30);
  // Las que sobresalen de verdad en entrenamiento (con suficientes operaciones) van a la agenda → examen final
  const ins = db.prepare('INSERT OR IGNORE INTO agenda (module, family, title, params, created_at, source) VALUES (?, ?, ?, ?, ?, ?)');
  const promoted = [];
  for (const k of kids.filter(k => k.t >= 2 && k.trades >= 30 && k.exposure > 0.05 && k.exposure < 0.95)) {
    const params = { genes: k.genes };
    if (ins.run('bolsa', 'combinada', describe('combinada', params), JSON.stringify(params), nowIso(), 'evolucion').changes) promoted.push({ text: ruleText(params), t: round(k.t, 2) });
  }
  const best = pop.slice(0, 5).map(x => ({ text: ruleText(x), t: round(x.t, 2), annual: round((x.annual || 0) * 100, 1), trades: x.trades, exposure: Math.round(x.exposure * 100) }));
  setSetting(db, 'global', 'evo', { gen: st.gen + 1, tested: st.tested + kids.length, pop, best, at: nowIso(), lastPromoted: promoted.length ? promoted : st.lastPromoted || [] });
  if (promoted.length) activity(db, { agent: 'largo', type: 'investigacion', important: true, text: `🧬 Inventé ${promoted.length} regla(s) nueva(s) que sobresalen en el entrenamiento; ahora van al examen final con precios que nunca vieron: ${promoted.map(p => p.text).join(' · ')}` });
  return { gen: st.gen + 1, tested: kids.length, promoted: promoted.length, bestT: round(pop[0]?.t ?? 0, 2) };
}

export const evoView = db => { const e = getSetting(db, 'global', 'evo', null); return e && { gen: e.gen, tested: e.tested, at: e.at, best: e.best, lastPromoted: e.lastPromoted || [] }; };
export { ruleTest };
