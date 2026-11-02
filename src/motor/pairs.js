// 🔗 Empresas que se mueven juntas: "cuando A sube fuerte un día, ¿B suele subir (o bajar) al día siguiente?".
// Con 40 empresas son más de 1,500 parejas: imposible de seguir a ojo. Se busca en la primera parte del historial
// y SOLO se acepta si se repite en la parte final que nunca se usó para buscar (con corrección por pruebas múltiples).
import { getSetting, setSetting, nowIso, activity } from '../core/db.js';
import { getBars } from '../stocks/market.js';
import { normalCdf, benjaminiHochberg, round } from '../core/util.js';

function corrP(x, y) {
  const n = x.length; if (n < 60) return { r: 0, p: 1, n };
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, z = r * Math.sqrt(n - 3);
  return { r, p: 2 * (1 - normalCdf(Math.abs(z))), n };
}

/** Busca parejas líder → seguidora. Corre una vez al día; es rápido (solo sumas). */
export function findPairs(db, { symbols, bench = 'SPY', fdr = 0.05, minR = 0.08 } = {}) {
  const syms = symbols.filter(s => s !== bench);
  const bb = getBars(db, bench), bRet = new Map(bb.map((b, i) => [b.ts, i ? b.close / bb[i - 1].close - 1 : 0]));
  // Retorno de cada día QUITANDO lo que se movió el mercado entero (si no, todas "se mueven juntas" por el mercado)
  const R = new Map();
  for (const s of syms) { const b = getBars(db, s).slice(-1000); const m = new Map(); for (let i = 1; i < b.length; i++) { const br = bRet.get(b[i].ts); if (br != null) m.set(b[i].ts, b[i].close / b[i - 1].close - 1 - br); } if (m.size > 300) R.set(s, m); }
  const days = bb.slice(-1000).map(b => b.ts), cut = Math.floor(days.length * 0.7);
  const cands = [];
  for (const [a, ra] of R) for (const [b, rb] of R) {
    if (a === b) continue;
    const pairsFor = (from, to) => { const x = [], y = []; for (let i = from; i < to - 1; i++) { const t0 = days[i], t1 = days[i + 1]; if (ra.has(t0) && rb.has(t1)) { x.push(ra.get(t0)); y.push(rb.get(t1)); } } return [x, y]; };
    const [x1, y1] = pairsFor(0, cut), c1 = corrP(x1, y1);
    if (c1.p < 0.01 && Math.abs(c1.r) >= minR) { const [x2, y2] = pairsFor(cut, days.length), c2 = corrP(x2, y2); cands.push({ leader: a, follower: b, rTrain: round(c1.r, 3), rTest: round(c2.r, 3), pTest: c2.p, nTest: c2.n }); }
  }
  // Examen final: en la parte que nunca se usó para buscar, con la exigencia extra por haber mirado tantas parejas
  const tested = R.size * (R.size - 1);
  const ok = benjaminiHochberg(cands.map(c => c.pTest), fdr);
  const found = cands.filter((c, i) => ok.has(i) && Math.sign(c.rTest) === Math.sign(c.rTrain) && Math.abs(c.rTest) >= minR / 2)
    .sort((a, b) => Math.abs(b.rTest) - Math.abs(a.rTest)).slice(0, 15)
    .map(c => ({ ...c, pTest: round(c.pTest, 5), text: `Cuando ${c.leader} sube más que el mercado un día, al día siguiente ${c.follower} tiende a ${c.rTest > 0 ? 'subir' : 'bajar'} más que el mercado (se cumplió en el examen final, ${c.nTest} días).` }));
  const prev = getSetting(db, 'global', 'parejas', null);
  setSetting(db, 'global', 'parejas', { at: nowIso(), tested, candidates: cands.length, found });
  const nuevas = found.filter(f => !(prev?.found || []).some(p => p.leader === f.leader && p.follower === f.follower));
  if (nuevas.length) activity(db, { agent: 'largo', type: 'investigacion', important: true, text: `🔗 Encontré ${nuevas.length} pareja(s) de empresas que se mueven juntas y pasaron el examen: ${nuevas.slice(0, 3).map(f => `${f.leader} → ${f.follower}`).join(', ')}.` });
  return { tested, candidates: cands.length, found: found.length };
}

/** Señales de HOY: si la líder se movió fuerte, qué se espera de la seguidora mañana. */
export function pairSignals(db, { bench = 'SPY' } = {}) {
  const P = getSetting(db, 'global', 'parejas', null); if (!P?.found?.length) return [];
  const bb = getBars(db, bench).slice(-2), br = bb.length === 2 ? bb[1].close / bb[0].close - 1 : 0;
  const out = [];
  for (const f of P.found) {
    const b = getBars(db, f.leader).slice(-61); if (b.length < 61) continue;
    const rets = b.slice(1).map((x, i) => x.close / b[i].close - 1), last = rets.at(-1) - br;
    const sd = Math.sqrt(rets.reduce((a, x) => a + x * x, 0) / rets.length);
    if (Math.abs(last) >= 1.5 * sd) out.push({ ...f, leaderMove: round(last * 100, 1), date: b.at(-1).ts, expect: Math.sign(last) * Math.sign(f.rTest) > 0 ? 'subir' : 'bajar' });
  }
  return out;
}
export const pairsView = db => { const p = getSetting(db, 'global', 'parejas', null); return p && { ...p, today: pairSignals(db) }; };
