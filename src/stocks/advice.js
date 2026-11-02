// Ranking de empresas, cuánto podrías ganar o perder, y cuánto conviene invertir según tu dinero.
// Los pesos son la versión 1: cada recomendación se sella y el motor mide si de verdad funcionan.
import { wilson, quantile, rng, round, mean, sd } from '../core/util.js';

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
export const RANKING_VERSION = 1;
export const WEIGHTS = { tendencia: 0.25, historial: 0.25, empresa: 0.25, riesgo: 0.15, polemicas: 0.10, duenos: 0.10, sorpresa: 0.10 };

/**
 * Puntúa una empresa con razones explícitas. Entrada:
 *  bars (diarias), bench (barras del SPY), facts (de la SEC), polemics (número de polémicas abiertas),
 *  track ({wins, losses, net}: historial real de JARVIS con esta empresa).
 */
export function scoreSymbol({ symbol, bars, bench, facts = [], polemics = 0, track = { wins: 0, losses: 0, net: 0 }, weights = WEIGHTS }) {
  const W = { ...WEIGHTS, ...(weights || {}) };
  const reasons = [], factors = {};
  const ret = (b, n) => (b.length > n ? b[b.length - 1].close / b[b.length - 1 - n].close - 1 : null);

  const r6 = ret(bars, 126), b6 = bench ? ret(bench, 126) : null;
  if (r6 != null) {
    const rel = b6 != null ? r6 - b6 : r6;
    factors.tendencia = clamp(rel / 0.2);
    reasons.push({ factor: 'tendencia', text: `En los últimos 6 meses su precio ${r6 >= 0 ? 'subió' : 'bajó'} ${round(Math.abs(r6) * 100, 1)}%.${b6 != null ? ` En ese mismo tiempo, las 500 empresas más grandes de EE. UU. ("el mercado") ${b6 >= 0 ? 'subieron' : 'bajaron'} ${round(Math.abs(b6) * 100, 1)}%: ${rel > 0.02 ? 'le fue mejor que al promedio' : rel < -0.02 ? 'le fue peor que al promedio' : 'le fue más o menos igual que al promedio'}.` : ''}`, kind: 'dato' });
  }
  const n = track.wins + track.losses;
  if (n > 0) {
    const w = wilson(track.wins, n);
    factors.historial = clamp((w.lo - 0.5) * 4) * Math.min(1, n / 20) + (track.net > 0 ? 0.1 : -0.1);
    reasons.push({ factor: 'historial', text: `Las veces que JARVIS ya la recomendó: ${track.wins} aciertos y ${track.losses} fallos${n < 10 ? ' (todavía son pocas veces, puede ser suerte)' : ''}.`, kind: 'dato' });
  }
  const val = (metric) => facts.filter(f => f.metric === metric).sort((a, b) => (a.period < b.period ? 1 : -1)).map(f => f.value);
  const rev = val('ingresos'), ni = val('ganancia_neta'), debt = val('deuda_largo_plazo'), eq = val('patrimonio');
  if (rev.length >= 2 || ni.length >= 1) {
    let s = 0, parts = [];
    if (rev.length >= 2 && rev[1]) { const g = rev[0] / rev[1] - 1; s += clamp(g / 0.15); parts.push(`vendió ${round(Math.abs(g) * 100, 1)}% ${g >= 0 ? 'más' : 'menos'} que el año anterior`); }
    if (ni.length >= 1) { s += ni[0] > 0 ? 0.5 : -0.7; parts.push(ni[0] > 0 ? 'está ganando dinero' : 'está perdiendo dinero'); }
    if (debt.length && eq.length && eq[0] > 0) { const de = debt[0] / eq[0]; s += de > 2 ? -0.5 : de < 0.5 ? 0.3 : 0; parts.push(de > 2 ? 'debe mucho comparado con lo que tiene' : de < 0.5 ? 'debe poco comparado con lo que tiene' : 'tiene una deuda normal'); }
    factors.empresa = clamp(s / 1.5);
    reasons.push({ factor: 'empresa', text: `Lo que dicen sus informes oficiales (los que la ley le obliga a publicar): ${parts.join(', ')}.`, kind: 'dato' });
  }
  // 👔 Lo que hacen los dueños con su propio dinero (SEC, Formulario 4, últimos 6 meses)
  const one = m => facts.find(f => f.metric === m)?.value;
  const bUsd = one('duenos_compras_usd'), buyers = one('duenos_compradores'), sUsd = one('duenos_ventas_usd');
  if (bUsd != null) {
    let v;
    if (buyers >= 2 && bUsd >= 100000) v = 0.8; else if (buyers >= 1 && bUsd >= 100000) v = 0.5; else if (buyers >= 1) v = 0.25;
    else v = sUsd > 50e6 ? -0.15 : 0;
    factors.duenos = v;
    reasons.push({ factor: 'duenos', text: buyers ? `${buyers} ${buyers === 1 ? 'directivo compró' : 'directivos compraron'} acciones de la empresa con su propio dinero en los últimos 6 meses (US$${Math.round(bUsd).toLocaleString('en-US')}). Casi nadie se fija en esto y suele ser buena señal: compran por una sola razón.` : sUsd ? `Los directivos no compraron en 6 meses; vendieron US$${Math.round(sUsd).toLocaleString('en-US')} (vender es común: impuestos, planes automáticos), así que pesa poco.` : 'Los directivos no compraron ni vendieron acciones en los últimos 6 meses.', kind: 'dato' });
  }
  // 📊 Sorpresa de ganancias: el último trimestre contra el mismo trimestre del año pasado
  const q = facts.filter(f => f.metric === 'bpa_trimestral').sort((a, b) => (a.period < b.period ? 1 : -1));
  if (q.length >= 5) {
    const [y, qq] = [Number(q[0].period.slice(2, 6)), q[0].period.slice(6)], prev = q.find(f => f.period === `CY${y - 1}${qq}`);
    if (prev) {
      const e0 = q[0].value, e4 = prev.value, filed = (q[0].source.match(/presentado (\d{4}-\d{2}-\d{2})/) || [])[1];
      const fresh = filed ? (Date.now() - Date.parse(filed)) / 864e5 <= 90 : false; // el efecto dura unas semanas después del informe
      const g = e4 > 0 ? (e0 - e4) / Math.abs(e4) : e0 > 0 ? 1 : (e0 - e4) / Math.max(Math.abs(e4), 0.01);
      factors.sorpresa = clamp(g / 0.3) * (fresh ? 1 : 0.4);
      reasons.push({ factor: 'sorpresa', text: `En su último trimestre ganó US$${e0} por acción; el mismo trimestre del año pasado, US$${e4} (${g >= 0 ? '+' : ''}${Math.round(g * 100)}%).${fresh ? ' El informe es reciente: las empresas que mejoran mucho suelen seguir subiendo unas semanas, porque la gente reacciona tarde.' : ' El informe ya tiene más de 3 meses, así que pesa menos.'}`, kind: 'dato' });
    }
  }
  const daily = bars.slice(-253).map((b, i, a) => (i ? b.close / a[i - 1].close - 1 : 0)).slice(1);
  if (daily.length > 60) {
    const vol = sd(daily) * Math.sqrt(252);
    factors.riesgo = clamp((0.3 - vol) / 0.3);
    reasons.push({ factor: 'riesgo', text: `Qué tanto se mueve su precio: en un año normal sube y baja alrededor de ${round(vol * 100)}%. ${vol > 0.45 ? 'Se mueve mucho: riesgo alto (puedes ver caídas fuertes).' : vol < 0.2 ? 'Se mueve poco: riesgo bajo.' : 'Riesgo medio.'}`, kind: 'dato' });
  }
  factors.polemicas = polemics > 0 ? -Math.min(1, polemics / 2) : 0.2;
  reasons.push({ factor: 'polemicas', text: polemics ? `Hay ${polemics} ${polemics === 1 ? 'noticia grave' : 'noticias graves'} contra la empresa (demanda, fraude o investigación del gobierno).` : 'No encontré noticias graves contra la empresa (demandas, fraudes o investigaciones).', kind: 'dato' });

  const used = Object.keys(factors);
  const wsum = used.reduce((s, k) => s + W[k], 0) || 1;
  const contributions = used.map(k => ({ factor: k, weight: W[k] / wsum, value: factors[k], contribution: round((W[k] / wsum) * factors[k] * 100, 1) }));
  const score = contributions.reduce((s, c) => s + c.contribution, 0) / 100;
  // Confianza: cuántos datos hay, cuánto historial real, si los factores apuntan al mismo lado y qué tan clara es la señal
  const coverage = Math.min(1, used.reduce((s, k) => s + WEIGHTS[k], 0)); // cuántos datos hay (con los pesos base)
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
