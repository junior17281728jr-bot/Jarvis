// ¿La ganancia es inmediata o en cuánto tiempo llega? Se mide con lo que pasó de verdad en los precios de esa acción:
// para cada día del historial se mira qué habría pasado si alguien compraba ese día y esperaba 1 semana, 1 mes, 3, 6 o 12 meses.
// Es historia real, no una promesa: el futuro puede ser distinto.
import { round, quantile } from '../core/util.js';

export const HORIZONS = [
  { days: 5, label: '1 semana' }, { days: 21, label: '1 mes' }, { days: 63, label: '3 meses' },
  { days: 126, label: '6 meses' }, { days: 252, label: '1 año' },
];
const COST = 0.002; // ida y vuelta: diferencial y deslizamiento aproximados (0.2%)

const daysLabel = d => (d <= 7 ? `${d} días de bolsa (~${Math.max(1, Math.round(d / 5))} semana${Math.round(d / 5) > 1 ? 's' : ''})` : d < 42 ? `${d} días de bolsa (~${Math.round(d / 5)} semanas)` : `${d} días de bolsa (~${round(d / 21, 1)} meses)`);
export const humanDays = d => (d == null ? 'más de un año' : d <= 7 ? `${Math.max(1, Math.round(d / 5))} semana${Math.round(d / 5) > 1 ? 's' : ''}` : d < 42 ? `${Math.round(d / 5)} semanas` : `${Math.round(d / 21)} mes${Math.round(d / 21) > 1 ? 'es' : ''}`);

/**
 * @param bars precios diarios [{ts, close}] (los más recientes al final)
 * @param bench precios del mercado (SPY) para comparar
 * @param target ganancia que se busca (5% por defecto)
 */
export function timeToProfit(bars, bench = null, { target = 0.05, years = 5 } = {}) {
  const b = bars.slice(-(252 * years + 260));
  if (b.length < 160) return null;
  const close = b.map(x => x.close), n = close.length;
  const bm = bench ? new Map(bench.map(x => [x.ts, x.close])) : null;

  const horizons = HORIZONS.filter(h => n - h.days >= 60).map(h => {
    const rets = [], beats = [];
    for (let i = 0; i + h.days < n; i++) {
      const r = close[i + h.days] / close[i] - 1 - COST;
      rets.push(r);
      if (bm) { const s0 = bm.get(b[i].ts), s1 = bm.get(b[i + h.days].ts); if (s0 && s1) beats.push(r > s1 / s0 - 1 - COST ? 1 : 0); }
    }
    return { ...h, cases: rets.length, pProfit: round(rets.filter(r => r > 0).length / rets.length, 3), median: round(quantile(rets.slice().sort((x, y) => x - y), 0.5), 4),
      bad: round(quantile(rets.slice().sort((x, y) => x - y), 0.1), 4), pBeat: beats.length ? round(beats.reduce((s, x) => s + x, 0) / beats.length, 3) : null };
  });

  // ¿Cuánto tardó en llegar a la meta (+5%)? y si empezó perdiendo, ¿cuánto tardó en recuperarse?
  const reach = [], recover = []; let never = 0, starts = 0;
  for (let i = 0; i + 252 < n; i++) {
    starts++;
    let hit = null;
    for (let j = i + 1; j <= i + 252; j++) if (close[j] / close[i] - 1 - COST >= target) { hit = j - i; break; }
    if (hit == null) never++; else reach.push(hit);
    if (close[i + 21] / close[i] - 1 - COST < 0) { let back = null; for (let j = i + 22; j <= Math.min(n - 1, i + 504); j++) if (close[j] / close[i] - 1 - COST >= 0) { back = j - i; break; } recover.push(back); }
  }
  reach.sort((x, y) => x - y);
  const rec = recover.filter(x => x != null).sort((x, y) => x - y);
  const toTarget = starts >= 60 ? { target, median: reach.length ? Math.round(quantile(reach, 0.5)) : null, slow: reach.length ? Math.round(quantile(reach, 0.75)) : null, fast: reach.length ? Math.round(quantile(reach, 0.25)) : null, neverPct: round(never / starts, 3), cases: starts } : null;
  const recovery = recover.length >= 20 ? { median: rec.length ? Math.round(quantile(rec, 0.5)) : null, neverPct: round(recover.filter(x => x == null).length / recover.length, 3), cases: recover.length } : null;

  // Tiempo recomendado: el primer plazo en que estuvo en ganancia al menos 2 de cada 3 veces
  const good = horizons.find(h => h.pProfit >= 0.66);
  const week = horizons.find(h => h.days === 5);
  const immediate = week && week.pProfit >= 0.66;
  const yearsUsed = round(n / 252, 1);
  const summary = immediate
    ? `En esta acción la ganancia llegó rápido muchas veces, pero no está garantizada: en una semana estuvo ganando ${Math.round(week.pProfit * 10)} de cada 10 veces.`
    : good
      ? `La ganancia NO es inmediata. En una semana estuvo ganando solo ${week ? Math.round(week.pProfit * 10) : '—'} de cada 10 veces (casi como lanzar una moneda). Esperando ${good.label}, estuvo ganando ${Math.round(good.pProfit * 10)} de cada 10.`
      : `La ganancia NO es inmediata y en esta acción ni esperando un año fue segura: estuvo ganando ${horizons.length ? Math.round(horizons.at(-1).pProfit * 10) : '—'} de cada 10 veces.`;
  return {
    horizons, toTarget, recovery, recommended: good ? { days: good.days, label: good.label } : null, immediate: !!immediate, summary, yearsUsed,
    basedOn: `${yearsUsed} años de precios reales (${n} días), costos de 0.2% incluidos`,
    targetLine: toTarget?.median != null ? `Subir ${Math.round(target * 100)}% tardó normalmente ${humanDays(toTarget.median)} (${daysLabel(toTarget.median)}); 1 de cada 4 veces tardó más de ${humanDays(toTarget.slow)}; ${Math.round(toTarget.neverPct * 100)}% de las veces no llegó en un año.` : null,
  };
}

/** Cuándo tienes el dinero en la mano, paso a paso (la parte que no depende del precio). */
export const CASH_STEPS = [
  { step: 'Compras', note: 'La orden se hace en segundos si el mercado está abierto (9:30 a.m.–4:00 p.m. de Nueva York).' },
  { step: 'Esperas', note: 'El precio cambia cada día: la ganancia o pérdida es "en papel" hasta que vendas.' },
  { step: 'Vendes', note: 'Cuando decidas (por meta, por tiempo o por la regla de salida si cae 8%).' },
  { step: 'Se liquida al día hábil siguiente', note: 'Regla T+1 de la SEC desde el 28 de mayo de 2024: una venta del lunes se liquida el martes.', url: 'https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/new-t1-settlement-cycle-what-investors-need-know-investor-bulletin' },
  { step: 'Lo pasas a tu banco', note: 'Depende de tu bróker y del envío a RD: puede tardar varios días y tener costo. Pregúntalo antes.' },
];
