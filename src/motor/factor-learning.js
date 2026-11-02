// 🧠 Aprender qué señales aciertan. Cada recomendación guardó cuánto aportó cada señal (tendencia, historial,
// empresa, riesgo, polémicas). Cuando se sabe si la acción le ganó o no al mercado, se mide qué tan seguido
// cada señal apuntó al lado correcto. Las que aciertan más pesan más; las que fallan, menos.
// Con freno: con pocos casos casi no cambia nada (no se exagera con la suerte), y nunca baja de la mitad ni sube del doble.
import { getSetting, setSetting, nowIso, activity } from '../core/db.js';
import { WEIGHTS } from '../stocks/advice.js';

const NAMES = { tendencia: 'Cómo va su precio', historial: 'Lo que JARVIS ya acertó con ella', empresa: 'Salud de la empresa', riesgo: 'Qué tan riesgosa es', polemicas: 'Noticias graves', duenos: 'Lo que hacen los dueños', sorpresa: 'Sorpresa de ganancias' };
const PRIOR = 150; // casos "imaginarios" en 50% que frenan los cambios con pocos datos

export function factorStats(db) {
  const rows = db.prepare(`SELECT r.payload card, p.outcome FROM predictions p JOIN recommendations r ON r.ledger_hash = p.ledger_hash
    WHERE p.module = 'ranking' AND p.correct IS NOT NULL`).all();
  const st = {};
  for (const r of rows) {
    let card, out; try { card = JSON.parse(r.card); out = JSON.parse(r.outcome); } catch { continue; }
    const beat = (out.excess ?? 0) > 0;
    for (const c of card.contributions || []) {
      if (Math.abs(c.value) < 0.05) continue; // señal neutra: no votó
      const s = (st[c.factor] ||= { n: 0, right: 0 });
      s.n++; if ((c.value > 0) === beat) s.right++;
    }
  }
  return st;
}

export function learnWeights(db) {
  const st = factorStats(db), weights = {}, detail = {};
  for (const [f, base] of Object.entries(WEIGHTS)) {
    const s = st[f] || { n: 0, right: 0 };
    const acc = (s.right + PRIOR * 0.5) / (s.n + PRIOR); // acierto "frenado"
    const mult = Math.min(2, Math.max(0.5, 1 + (acc - 0.5) * 4));
    weights[f] = Math.round(base * mult * 1000) / 1000;
    detail[f] = { name: NAMES[f], n: s.n, rawPct: s.n ? Math.round(s.right / s.n * 1000) / 10 : null, mult: Math.round(mult * 100) / 100, base, weight: weights[f] };
  }
  const prev = getSetting(db, 'global', 'ranking.learnedWeights', null);
  const out = { at: nowIso(), weights, detail, cases: Math.max(0, ...Object.values(st).map(s => s.n)) };
  setSetting(db, 'global', 'ranking.learnedWeights', out);
  const moved = Object.values(detail).filter(d => Math.abs(d.mult - (prev?.detail?.[Object.keys(detail).find(k => detail[k] === d)]?.mult ?? 1)) >= 0.05);
  if (moved.length) activity(db, { agent: 'largo', type: 'leccion', important: true, text: `🧠 Ajusté cuánto pesa cada señal según lo que acertó: ${Object.values(detail).filter(d => d.n).map(d => `${d.name} ${d.rawPct}% (×${d.mult})`).join(' · ')}.` });
  return out;
}

export const learnedWeights = db => getSetting(db, 'global', 'ranking.learnedWeights', null)?.weights || null;
