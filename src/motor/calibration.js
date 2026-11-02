// 📏 ¿Se cumplen sus %? Cuando JARVIS dice "6 de cada 10", revisa si de verdad pasa 6 de cada 10 veces.
// Si exagera (dice 65% y pasa 52%), sus % se corrigen solos hacia el 50% hasta que demuestre lo contrario.
// Todo sale de predicciones selladas ANTES de saber el resultado.
import { getSetting, setSetting, activity, nowIso } from '../core/db.js';
import { round, wilson } from '../core/util.js';

const BINS = [[0.5, 0.55], [0.55, 0.6], [0.6, 0.65], [0.65, 1.01]];
const MIN_N = 50; // con menos casos no se corrige nada (sería ruido)

export function calibration(db) {
  const rows = db.prepare("SELECT prob, correct, payload, outcome FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL AND prob IS NOT NULL").all();
  const bins = BINS.map(([a, b]) => {
    const r = rows.filter(x => x.prob >= a && x.prob < b);
    if (!r.length) return { from: a, to: Math.min(1, b), n: 0 };
    const hits = r.filter(x => x.correct).length, w = wilson(hits, r.length), said = r.reduce((t, x) => t + x.prob, 0) / r.length;
    return { from: a, to: Math.min(1, b), n: r.length, said: round(said * 100, 1), happened: round(hits / r.length * 100, 1), lo: round(w.lo * 100, 1), hi: round(w.hi * 100, 1),
      ok: r.length < 10 ? null : said >= w.lo && said <= w.hi };
  });
  const n = rows.length;
  // Para la corrección se usa lo que JARVIS decía ANTES de corregirse (si no, se corregiría dos veces)
  const rawOf = x => { try { return JSON.parse(x.payload).probRaw ?? x.prob; } catch { return x.prob; } };
  const brier = n ? rows.reduce((t, x) => t + (x.prob - x.correct) ** 2, 0) / n : null;
  const said = n ? rows.reduce((t, x) => t + rawOf(x), 0) / n : null, happened = n ? rows.filter(x => x.correct).length / n : null;
  // ¿Cuánto de su "ventaja sobre el 50%" se cumple de verdad? 1 = todo, 0 = nada (adivinaba)
  let shrink = 1;
  if (n >= MIN_N && said > 0.5) shrink = Math.max(0.3, Math.min(1, (happened - 0.5) / (said - 0.5)));
  // Rangos: "9 de cada 10 veces terminará entre X y Y" (se guardan al sellar) → ¿cuántas veces cayó dentro?
  const withRange = rows.map(x => ({ p: JSON.parse(x.payload), o: JSON.parse(x.outcome || 'null') })).filter(x => x.p.range && x.o);
  const inside = withRange.filter(x => x.o.ret >= x.p.range.lo && x.o.ret <= x.p.range.hi).length;
  const lot = db.prepare("SELECT prob, correct FROM predictions WHERE module = 'loteria' AND correct IS NOT NULL").all();
  return {
    n, bins, brier: brier == null ? null : round(brier, 4), skill: brier == null ? null : round((1 - brier / 0.25) * 100, 1),
    said: said == null ? null : round(said * 100, 1), happened: happened == null ? null : round(happened * 100, 1), shrink: round(shrink, 2), minN: MIN_N,
    range: { n: withRange.length, inside, pct: withRange.length ? round(inside / withRange.length * 100, 1) : null, target: 80 },
    lottery: { n: lot.length, said: lot.length ? round(lot.reduce((t, x) => t + x.prob, 0) / lot.length * 100, 1) : null, happened: lot.length ? round(lot.filter(x => x.correct).length / lot.length * 100, 1) : null },
    verdict: n < MIN_N ? `Todavía hay ${n} recomendaciones terminadas; con ${MIN_N} se puede saber si sus % se cumplen.`
      : shrink >= 0.9 ? `Sus % se cumplen: dijo ${round(said * 100)}% en promedio y pasó ${round(happened * 100)}%.`
      : happened <= 0.5 ? `Sus % NO se cumplen: dijo ${round(said * 100)}% y pasó ${round(happened * 100)}% (como lanzar una moneda). Por eso ahora sus % se muestran más cerca del 50%.`
      : `Exagera un poco: dijo ${round(said * 100)}% y pasó ${round(happened * 100)}%. Sus % se corrigen solos (se quedan con el ${round(shrink * 100)}% de la ventaja que dice tener).`,
  };
}

/** Se corre cada día: guarda el factor de corrección que usan los % del ranking. */
export function runCalibration(db) {
  const c = calibration(db), prev = getSetting(db, 'global', 'calib.shrink', 1);
  setSetting(db, 'global', 'calib.shrink', c.shrink);
  setSetting(db, 'global', 'calib.last', { at: nowIso(), n: c.n, shrink: c.shrink, brier: c.brier });
  if (Math.abs(prev - c.shrink) >= 0.05) activity(db, { agent: 'jarvis', type: 'aprendizaje', important: true, text: `📏 ${c.verdict}` });
  return { n: c.n, shrink: c.shrink };
}

/** Aplica la corrección a un % ("le gana al mercado X de cada 10"). */
export const calibrated = (db, p) => { const k = getSetting(db, 'global', 'calib.shrink', 1); return p == null ? p : round(0.5 + (p - 0.5) * k, 3); };
