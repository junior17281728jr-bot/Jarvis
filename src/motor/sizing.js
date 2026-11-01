// Cuánto poner, según TU dinero. Regla base: "Sí, invierte" = 10% de tu dinero por idea, "Invierte poco" = 5%, "No inviertas" = 0.
// Solo te propone poner MÁS (hasta 20%) cuando las pruebas son fuertes; si no, te dice exactamente qué falta.
// También revisa apuestas grandes y busca opciones con las condiciones que tú pongas.
import { getSetting, setSetting } from '../core/db.js';
import { round, wilson } from '../core/util.js';
import { HORIZONS } from '../stocks/timing.js';

export const BASE_PCT = { verde: 0.10, amarillo: 0.05, rojo: 0 };
const STRONG_PCT = 0.20, MIN_TICKET = 5;

export function getBudget(db, userId = null) {
  const g = getSetting(db, 'global', 'budget', { usd: 100, emergency: true });
  return userId ? { ...g, ...getSetting(db, `user:${userId}`, 'budget', {}) } : g;
}
export function saveBudget(db, userId, { usd, emergency }, { isAdmin = false } = {}) {
  const v = Number(usd);
  if (!(v >= 10 && v <= 10_000_000)) throw new Error('Pon un monto entre US$10 y US$10,000,000.');
  const b = { usd: round(v, 2), emergency: !!emergency };
  setSetting(db, `user:${userId}`, 'budget', b);
  if (isAdmin) setSetting(db, 'global', 'budget', b); // las recomendaciones selladas usan el dinero del administrador
  return b;
}

/** Monto base para una idea, según el veredicto y tu dinero. */
export function baseAmount(light, budgetUsd = 100) {
  const pct = BASE_PCT[light] ?? 0;
  if (!pct) return 0;
  return Math.max(MIN_TICKET, round(budgetUsd * pct, 0));
}

/** Qué tan bien le ha ido a JARVIS de verdad (para saber si las pruebas son fuertes). */
export function evidence(db) {
  const r = db.prepare("SELECT COUNT(*) n, SUM(correct) hits FROM predictions WHERE module = 'ranking' AND correct IS NOT NULL").get();
  const n = r.n || 0, hits = r.hits || 0, w = wilson(hits, n);
  return { n, hits, hitRate: n ? hits / n : null, lo: n ? w.lo : 0 };
}

/**
 * ¿Cuánto pongo en esta idea? y ¿puedo poner más? Solo dice que sí cuando TODO esto se cumple:
 * la recomienda, su probabilidad ya está medida con casos reales, JARVIS acierta más que la suerte (con margen),
 * estuvo ganando 7 de cada 10 veces en el plazo recomendado y la chance de perder es baja.
 */
export function sizeFor(card, budget, ev) {
  const B = budget.usd, usd = baseAmount(card.light, B), pct = B ? usd / B : 0;
  const t = card.timing, recDays = t?.recommended?.days, pAt = recDays ? (t.h?.[recDays]?.p ?? t.pProfit?.[recDays]) : null;
  const loss = card.projection?.personal?.lossChance;
  const checks = [
    { ok: card.light === 'verde', text: card.light === 'verde' ? 'JARVIS la recomienda.' : 'JARVIS no la recomienda con fuerza (no está en "Sí, invierte").' },
    { ok: card.probMethod === 'calibrado', text: card.probMethod === 'calibrado' ? 'Su probabilidad ya está medida con casos reales.' : 'Su probabilidad todavía es una estimación inicial, sin casos reales suficientes.' },
    { ok: ev.lo > 0.5, text: ev.n ? (ev.lo > 0.5 ? `JARVIS acierta más que la suerte (${Math.round(ev.hitRate * 100)}% en ${ev.n} casos).` : `JARVIS acierta ${Math.round((ev.hitRate || 0) * 100)}% en ${ev.n} casos: todavía no se distingue de lanzar una moneda.`) : 'JARVIS todavía no tiene recomendaciones calificadas.' },
    { ok: pAt != null && pAt >= 0.7, text: pAt != null ? (pAt >= 0.7 ? `En el plazo recomendado estuvo ganando ${Math.round(pAt * 10)} de cada 10 veces.` : `En el plazo recomendado estuvo ganando solo ${Math.round(pAt * 10)} de cada 10 veces.`) : 'No tiene un plazo en el que haya ganado casi siempre.' },
    { ok: loss != null && loss <= 0.25, text: loss != null ? (loss <= 0.25 ? `Chance de terminar perdiendo baja (${Math.round(loss * 100)} de cada 100).` : `Chance de terminar perdiendo: ${Math.round(loss * 100)} de cada 100 (alta para poner más).`) : 'Sin datos de pérdida.' },
  ];
  const canMore = usd > 0 && checks.every(c => c.ok);
  const maxUsd = canMore ? Math.max(usd, round(B * STRONG_PCT, 0)) : usd;
  const tooSmall = card.light !== 'rojo' && B * (BASE_PCT[card.light] || 0) < MIN_TICKET;
  return {
    usd, pct: round(pct * 100, 1), maxUsd, maxPct: B ? round(maxUsd / B * 100, 1) : 0, canMore, checks,
    more: canMore ? `Sí puedes subir hasta US$${maxUsd} (${Math.round(STRONG_PCT * 100)}% de tu dinero): se cumplen las 5 pruebas.` : usd ? `No subas de US$${usd}: ${checks.filter(c => !c.ok).length} de 5 pruebas no se cumplen todavía.` : 'No pongas dinero en esta.',
    note: tooSmall ? `El ${Math.round((BASE_PCT[card.light] || 0) * 100)}% de tu dinero es menos de US$${MIN_TICKET}; uso US$${MIN_TICKET}, que es lo mínimo práctico.` : null,
  };
}

// ---------- Buscador a tu medida ----------
const H = Object.fromEntries(HORIZONS.map(h => [h.days, h.label]));

/**
 * Busca entre todo lo que JARVIS estudió las opciones que cumplen TUS condiciones.
 * chance = "terminar ganando dinero" en el plazo elegido (historia real de esa acción), o "ganarle al mercado".
 */
export function finder(rows, { minP = 0, maxP = 1, days = 252, metric = 'ganar', maxLossPct = null, amount = 10, onlyRec = false, kind = 'todas' }) {
  const FUNDS = new Set(['SPY', 'VOO', 'QQQ', 'VTI', 'SCHD']);
  const scored = rows.filter(r => r.card).map(r => {
    const t = r.card.timing, h = t?.h?.[days];
    const p = metric === 'mercado' ? (h?.pBeat ?? null) : (h?.p ?? t?.pProfit?.[days] ?? null);
    const bad = h?.bad ?? null, median = h?.median ?? null;
    return { ...r, p, bad, median, normalUsd: median != null ? round(amount * median, 2) : null, badUsd: bad != null ? round(amount * bad, 2) : null };
  }).filter(r => r.p != null && (kind === 'todas' || (kind === 'fondos' ? FUNDS.has(r.symbol) : !FUNDS.has(r.symbol))));
  const fits = r => r.p >= minP && r.p <= maxP && (maxLossPct == null || (r.bad != null && -r.bad <= maxLossPct)) && (!onlyRec || r.zone === 'recomendada' || r.zone === 'observacion');
  const matches = scored.filter(fits).sort((a, b) => b.p - a.p || b.conv - a.conv);
  const dist = r => (r.p < minP ? minP - r.p : r.p > maxP ? r.p - maxP : 0) + (maxLossPct != null && r.bad != null && -r.bad > maxLossPct ? -r.bad - maxLossPct : 0);
  const closest = matches.length ? [] : scored.slice().sort((a, b) => dist(a) - dist(b)).slice(0, 3);
  const top = scored.length ? Math.max(...scored.map(r => r.p)) : null;
  const what = metric === 'mercado' ? 'le ganó al mercado' : 'terminó ganando dinero';
  return {
    label: H[days] || `${days} días`, what, matches, closest, studied: scored.length,
    honest: top == null ? 'Todavía no hay datos suficientes.' : minP > top
      ? `Ninguna llega a ${Math.round(minP * 10)} de cada 10. Lo más alto que hay hoy para ${H[days] || days + ' días'} es ${Math.round(top * 10)} de cada 10 (${what}). ${metric === 'mercado' ? 'Ganarle al mercado 8 de cada 10 veces casi no existe: desconfía de quien lo prometa.' : 'Esperar más tiempo suele subir la chance de terminar ganando.'}`
      : `${matches.length} de ${scored.length} opciones cumplen lo que pediste.`,
  };
}

/** Revisión de una apuesta grande para ti: qué tan grande es, cuánto podrías ver perder y cómo repartirla. */
export function bigBetCheck({ amount, budget, picks, fund = null }) {
  const pctOfBudget = budget.usd ? amount / budget.usd : 1;
  const big = pctOfBudget > 0.2;
  const checks = [
    { ok: budget.emergency, text: budget.emergency ? 'Tienes fondo de emergencia aparte.' : 'No tienes fondo de emergencia: arma eso primero (3 a 6 meses de gastos).' },
    { ok: pctOfBudget <= 0.2, text: `Es el ${Math.round(pctOfBudget * 100)}% de tu dinero para invertir${pctOfBudget > 0.2 ? ': más de 20% en una sola idea es mucho riesgo.' : '.'}` },
    { ok: picks.length >= 3, text: picks.length >= 3 ? 'Hay al menos 3 opciones buenas para repartir.' : 'Hay pocas opciones buenas para repartir: mejor usar un fondo amplio.' },
  ];
  const worst = picks.length ? Math.min(...picks.map(p => p.bad ?? 0)) : null;
  const parts = [];
  if (!picks.length && fund) parts.push({ symbol: fund.symbol, pct: 100, usd: round(amount, 2), why: 'No hay opciones que JARVIS recomiende con lo que pediste: un fondo amplio reparte el riesgo entre 500 empresas.' });
  if (picks.length) {
    const fundShare = fund ? 0.5 : 0, rest = 1 - fundShare, each = rest / Math.min(3, picks.length);
    if (fund) parts.push({ symbol: fund.symbol, pct: 50, usd: round(amount * 0.5, 2), why: 'La base: reparte el riesgo entre cientos de empresas.' });
    for (const p of picks.slice(0, 3)) parts.push({ symbol: p.symbol, pct: round(each * 100, 0), usd: round(amount * each, 2), why: `${Math.round(p.p * 10)} de cada 10 veces terminó ganando en el plazo.` });
  }
  const verdict = amount > budget.usd ? `Eso es más que el dinero que dijiste tener para invertir (US$${budget.usd}). No te lo recomiendo. Si de verdad tienes más, actualiza "Mi dinero" en Mi cuenta y vuelvo a revisar.`
    : !budget.emergency ? 'No te recomiendo hacer esta apuesta todavía: primero el fondo de emergencia.'
    : big ? `No te recomiendo poner US$${amount} en una sola: repártelo y entra en 3 partes (una por semana).`
      : picks.length ? `Puedes hacerlo, mejor repartido y en 3 partes (una por semana).` : 'Con lo que pediste no hay opciones buenas: mejor esperar o usar un fondo amplio.';
  return { amount, pctOfBudget: round(pctOfBudget * 100, 1), big, checks, worstUsd: worst != null ? round(amount * worst, 2) : null, parts, verdict,
    steps: ['Semana 1: pon un tercio.', 'Semana 2: otro tercio, solo si no cayó más de 8%.', 'Semana 3: el último tercio con la misma regla.', 'Revisa el mapa: si alguna pasa a "No te recomiendo", JARVIS te avisa.'] };
}
