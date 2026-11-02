// 📚 La IA aprende de SUS PROPIAS operaciones: guarda cómo estaba todo cuando compró (qué tan segura estaba,
// si el mercado subía o bajaba, si la acción se movía mucho…) y, al cerrar, mira con qué condiciones gana y con
// cuáles pierde. Lo que casi siempre pierde, no lo repite; lo que casi siempre gana, lo apuesta un poco más.
// Con pocos casos no concluye nada (se dice cuántos faltan).
import { getSetting, setSetting } from '../core/db.js';
import { valuation } from '../stocks/account.js';
import { getQuote } from '../stocks/market.js';
import { round, wilson } from '../core/util.js';

const MIN_CASES = 4;
const LABEL = {
  nivel: { 'muy segura': 'cuando se sentía muy segura', segura: 'cuando se sentía segura', normal: 'cuando se sentía normal' },
  mercado: { alcista: 'con el mercado entero subiendo', bajista: 'con el mercado entero bajando', '?': 'sin saber cómo iba el mercado' },
  movimiento: { baja: 'en acciones tranquilas (se mueven poco)', media: 'en acciones que se mueven normal', alta: 'en acciones muy movidas' },
  tendencia: { arriba: 'en acciones que le venían ganando al mercado', abajo: 'en acciones que venían peor que el mercado', '?': 'sin dato de tendencia' },
  semaforo: { verde: 'cuando JARVIS decía "Sí, invierte"', amarillo: 'cuando JARVIS decía "Invierte poco"', rojo: 'en acciones en rojo' },
};

/** Guarda las condiciones del momento de la compra (se llama justo al comprar). */
export function rememberBuy(db, { owner, symbol, ctx }) {
  const list = getSetting(db, 'global', 'ia.buyctx', []);
  list.push({ owner, symbol, at: new Date().toISOString(), ctx });
  setSetting(db, 'global', 'ia.buyctx', list.slice(-800));
}

/** Las condiciones de HOY para una acción (las mismas que se guardan al comprar). */
export function contextFor({ level, regime, vol, card, light }) {
  const tf = card?.contributions?.find(c => c.factor === 'tendencia')?.value;
  return {
    nivel: level || 'normal', mercado: regime || '?', semaforo: light || card?.light || 'amarillo',
    movimiento: vol == null ? 'media' : vol < 0.25 ? 'baja' : vol > 0.45 ? 'alta' : 'media',
    tendencia: tf == null ? '?' : tf > 0 ? 'arriba' : 'abajo',
  };
}

/** Lo aprendido: con cada condición, cuántas veces ganó y perdió en operaciones YA cerradas. */
export function tradeLessons(db, accounts) {
  const ctxs = getSetting(db, 'global', 'ia.buyctx', []);
  const closed = [];
  for (const acc of accounts) for (const c of valuation(db, acc.id, s => getQuote(db, s)?.price ?? null).closed) {
    // La compra de esa operación: la más cercana antes de que se abriera, de la misma acción y cuenta
    const m = ctxs.filter(x => x.owner === acc.owner && x.symbol === c.symbol && Date.parse(x.at) <= Date.parse(c.openedAt) + 36e5).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (m) closed.push({ ctx: m.ctx, win: c.pnl > 0, pnlPct: c.pnlPct });
  }
  const stats = [];
  for (const key of Object.keys(LABEL)) {
    const by = new Map();
    for (const t of closed) { const v = t.ctx[key]; if (v == null) continue; const s = by.get(v) || { n: 0, wins: 0, sum: 0 }; s.n++; s.wins += t.win ? 1 : 0; s.sum += t.pnlPct; by.set(v, s); }
    for (const [v, s] of by) {
      const rate = s.wins / s.n, w = wilson(s.wins, s.n);
      const kind = s.n >= MIN_CASES && rate <= 0.25 && w.hi < 0.65 ? 'evitar' : s.n >= MIN_CASES && rate >= 0.75 && w.lo > 0.35 ? 'repetir' : null;
      stats.push({ key, value: v, n: s.n, wins: s.wins, losses: s.n - s.wins, rate: round(rate * 100), avgPct: round(s.sum / s.n * 100, 1), kind,
        text: `${LABEL[key][v] || `${key} = ${v}`}: ganó ${s.wins} de ${s.n} veces (promedio ${s.sum >= 0 ? '+' : ''}${round(s.sum / s.n * 100, 1)}%).` });
    }
  }
  return { closed: closed.length, minCases: MIN_CASES, stats: stats.sort((a, b) => b.n - a.n),
    avoid: stats.filter(s => s.kind === 'evitar'), repeat: stats.filter(s => s.kind === 'repetir') };
}

/** ¿Qué dice lo aprendido de una compra con estas condiciones? */
export function judge(lessons, ctx) {
  const avoid = lessons.avoid.filter(s => ctx[s.key] === s.value), repeat = lessons.repeat.filter(s => ctx[s.key] === s.value);
  return {
    avoid: avoid.length > 0, boost: !avoid.length && repeat.length > 0,
    why: avoid.length ? `Aprendí de mis operaciones que ${avoid.map(s => s.text.charAt(0).toLowerCase() + s.text.slice(1)).join(' y ')} No lo repito.`
      : repeat.length ? `Aprendí que ${repeat.map(s => s.text.charAt(0).toLowerCase() + s.text.slice(1)).join(' y ')} Por eso pongo un poco más.` : null,
  };
}
