// Ranking de empresas, cuánto podrías ganar o perder, y cuánto conviene invertir según tu dinero.
// Los pesos son la versión 1: cada recomendación se sella y el motor mide si de verdad funcionan.
import { wilson, quantile, rng, round, mean, sd } from '../core/util.js';

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
export const RANKING_VERSION = 1;
const WEIGHTS = { tendencia: 0.25, historial: 0.25, empresa: 0.25, riesgo: 0.15, polemicas: 0.10 };

/**
 * Puntúa una empresa con razones explícitas. Entrada:
 *  bars (diarias), bench (barras del SPY), facts (de la SEC), polemics (número de polémicas abiertas),
 *  track ({wins, losses, net}: historial real de JARVIS con esta empresa).
 */
export function scoreSymbol({ symbol, bars, bench, facts = [], polemics = 0, track = { wins: 0, losses: 0, net: 0 } }) {
  const reasons = [], factors = {};
  const ret = (b, n) => (b.length > n ? b[b.length - 1].close / b[b.length - 1 - n].close - 1 : null);

  const r6 = ret(bars, 126), b6 = bench ? ret(bench, 126) : null;
  if (r6 != null) {
    const rel = b6 != null ? r6 - b6 : r6;
    factors.tendencia = clamp(rel / 0.2);
    reasons.push({ factor: 'tendencia', text: `En 6 meses ${r6 >= 0 ? 'subió' : 'bajó'} ${round(Math.abs(r6) * 100, 1)}%${b6 != null ? `; el mercado ${round(b6 * 100, 1)}%` : ''}.`, kind: 'dato' });
  }
  const n = track.wins + track.losses;
  if (n > 0) {
    const w = wilson(track.wins, n);
    factors.historial = clamp((w.lo - 0.5) * 4) * Math.min(1, n / 20) + (track.net > 0 ? 0.1 : -0.1);
    reasons.push({ factor: 'historial', text: `JARVIS con ${symbol}: ${track.wins} aciertos y ${track.losses} fallos${n < 10 ? ' (pocos casos, puede ser suerte)' : ''}.`, kind: 'dato' });
  }
  const val = (metric) => facts.filter(f => f.metric === metric).sort((a, b) => (a.period < b.period ? 1 : -1)).map(f => f.value);
  const rev = val('ingresos'), ni = val('ganancia_neta'), debt = val('deuda_largo_plazo'), eq = val('patrimonio');
  if (rev.length >= 2 || ni.length >= 1) {
    let s = 0, parts = [];
    if (rev.length >= 2 && rev[1]) { const g = rev[0] / rev[1] - 1; s += clamp(g / 0.15); parts.push(`ingresos ${g >= 0 ? '+' : ''}${round(g * 100, 1)}% en un año`); }
    if (ni.length >= 1) { s += ni[0] > 0 ? 0.5 : -0.7; parts.push(ni[0] > 0 ? 'con ganancias' : 'con pérdidas'); }
    if (debt.length && eq.length && eq[0] > 0) { const de = debt[0] / eq[0]; s += de > 2 ? -0.5 : de < 0.5 ? 0.3 : 0; parts.push(`deuda/patrimonio ${round(de, 2)}`); }
    factors.empresa = clamp(s / 1.5);
    reasons.push({ factor: 'empresa', text: `Informes oficiales (SEC): ${parts.join(', ')}.`, kind: 'dato' });
  }
  const daily = bars.slice(-253).map((b, i, a) => (i ? b.close / a[i - 1].close - 1 : 0)).slice(1);
  if (daily.length > 60) {
    const vol = sd(daily) * Math.sqrt(252);
    factors.riesgo = clamp((0.3 - vol) / 0.3);
    reasons.push({ factor: 'riesgo', text: `Sube y baja ${round(vol * 100)}% al año (volatilidad)${vol > 0.45 ? ': riesgo alto' : vol < 0.2 ? ': riesgo bajo' : ''}.`, kind: 'dato' });
  }
  factors.polemicas = polemics > 0 ? -Math.min(1, polemics / 2) : 0.2;
  reasons.push({ factor: 'polemicas', text: polemics ? `${polemics} polémica(s) abierta(s) en noticias.` : 'Sin polémicas abiertas detectadas.', kind: 'dato' });

  const used = Object.keys(factors);
  const wsum = used.reduce((s, k) => s + WEIGHTS[k], 0) || 1;
  const contributions = used.map(k => ({ factor: k, weight: WEIGHTS[k] / wsum, value: factors[k], contribution: round((WEIGHTS[k] / wsum) * factors[k] * 100, 1) }));
  const score = contributions.reduce((s, c) => s + c.contribution, 0) / 100;
  // Confianza: cuántos datos hay, cuánto historial real, si los factores apuntan al mismo lado y qué tan clara es la señal
  const coverage = wsum;
  const sample = Math.min(1, n / 20) * (track.wins >= track.losses ? 1 : 0.4);
  const signed = contributions.filter(c => Math.abs(c.value) > 0.05);
  const agreement = signed.length ? signed.filter(c => Math.sign(c.value) === Math.sign(score || 1)).length / signed.length : 0.5;
  const strength = Math.min(1, Math.abs(score) / 0.4);
  const confidence = round(clamp(0.15 + 0.25 * coverage + 0.25 * sample + 0.2 * agreement + 0.15 * strength, 0.05, 0.95), 2);
  const light = polemics >= 2 || score < -0.1 ? 'rojo' : score > 0.25 && confidence >= 0.6 && polemics === 0 ? 'verde' : 'amarillo';
  return { symbol, score: round(score, 3), confidence, light, contributions, reasons, version: RANKING_VERSION };
}

/** Rango de lo que podría pasar con un monto, remuestreando bloques de retornos reales (no es promesa). */
export function project(bars, amountUsd, { days = 126, sims = 2000, block = 10, seed = 5, fixedCostUsd = 0 } = {}) {
  const daily = bars.slice(-756).map((b, i, a) => (i ? b.close / a[i - 1].close - 1 : 0)).slice(1);
  if (daily.length < 120) return null;
  const r = rng(seed), outcomes = [];
  for (let s = 0; s < sims; s++) {
    let g = 1, d = 0;
    while (d < days) { const st = Math.floor(r() * (daily.length - block)); for (let k = 0; k < block && d < days; k++, d++) g *= 1 + daily[st + k]; }
    outcomes.push(amountUsd * g - amountUsd - fixedCostUsd);
  }
  outcomes.sort((a, b) => a - b);
  return { amountUsd, days, bad: round(quantile(outcomes, 0.1)), probable: round(quantile(outcomes, 0.5)), good: round(quantile(outcomes, 0.9)), lossChance: round(outcomes.filter(x => x < 0).length / sims, 2), basedOnDays: daily.length };
}

/** ¿Cuánto invertir? Revisa tu situación y te dice si el monto vale la pena y cómo repartirlo. */
export function adviseAmount({ amountUsd, hasEmergencyFund, fixedCostUsd = 0, horizonMonths = 12, extremeIdea = null }) {
  const notes = [], plan = [];
  let light = 'verde';
  if (!hasEmergencyFund) { light = 'rojo'; notes.push('Primero arma un fondo de emergencia (3 a 6 meses de gastos). No inviertas dinero que puedes necesitar.'); }
  if (fixedCostUsd > 0 && amountUsd > 0) {
    const pct = fixedCostUsd / amountUsd;
    if (pct > 0.02) { light = light === 'rojo' ? 'rojo' : 'amarillo'; notes.push(`Los costos fijos (US$${fixedCostUsd}) son el ${round(pct * 100, 1)}% de tu monto. Junta al menos US$${Math.ceil(fixedCostUsd / 0.02)} para que no se coman la ganancia.`); }
  }
  if (horizonMonths < 12) notes.push('Menos de un año es poco tiempo para la bolsa: el precio puede estar abajo justo cuando necesites el dinero.');
  if (amountUsd < 100) plan.push({ part: 'Fondo amplio (por ejemplo, uno del S&P 500)', pct: 100, why: 'Con poco dinero, un fondo reparte el riesgo entre 500 empresas con una sola compra fraccionada.' });
  else if (amountUsd < 1000) plan.push({ part: 'Fondo amplio', pct: 75, why: 'La base: crecimiento del mercado con riesgo repartido.' }, { part: 'Hasta 3 empresas del ranking (máximo 10% cada una)', pct: 25, why: 'Para probar las ideas de JARVIS sin arriesgar todo.' });
  else plan.push({ part: 'Fondo amplio', pct: 70, why: 'La base.' }, { part: 'De 3 a 6 empresas del ranking (máximo 8% cada una)', pct: 25, why: 'Diversificar entre sectores.' }, { part: 'Operaciones de corto plazo', pct: 5, why: 'Solo una parte pequeña: es lo más arriesgado.' });
  if (extremeIdea) notes.push(`Sobre "${extremeIdea}": poner todo en una sola cosa significa que una mala noticia puede borrar gran parte del dinero. JARVIS muestra la peor caída histórica antes de decidir.`);
  return { amountUsd, light, notes, plan: hasEmergencyFund ? plan : [] };
}

export const meanReturn = d => mean(d);
