// ✨ Plus con IA: lo que se activa cuando hay una IA conectada. La IA nunca decide sola ni inventa números:
//  - Bolsa: propone empresas nuevas para estudiar; JARVIS las prueba con precios reales antes de mostrarlas.
//  - Loterías: explica en palabras simples lo que encontró la vigilancia y cómo jugar con cabeza.
// Todo con tope de gasto y guardado para no pagar dos veces lo mismo.
import { getSetting, setSetting, nowIso, activity } from '../core/db.js';
import { complete, available } from './providers.js';
import { universe } from '../stocks/collector.js';
import { CANDIDATES } from '../motor/map.js';
import { HIDDEN } from '../motor/gems.js';

const TICKER = /^[A-Z]{1,5}(\.[A-Z])?$/;
export const aiOn = (db, cfg) => { const a = available(db, cfg); return !!(a.openai || a.anthropic); };

/** La IA sugiere hasta 6 empresas o fondos grandes de EE. UU. que JARVIS todavía no estudia. */
export async function suggestStocks(db, cfg, { fetchImpl = fetch, horizon = 'medio' } = {}) {
  if (!aiOn(db, cfg)) return { skipped: 'sin IA conectada' };
  const known = new Set([...universe(db), ...CANDIDATES, ...Object.keys(HIDDEN), ...db.prepare('SELECT symbol FROM map_entries').all().map(r => r.symbol), ...getSetting(db, 'global', 'explore.ai', []).map(x => x.symbol)]);
  const r = await complete(db, cfg, { task: 'plus:sugerir_acciones', prefer: 'paid', json: true, maxTokens: 450, fetchImpl,
    system: 'Eres un investigador de bolsa curioso y prudente. Buscas lo que casi nadie está mirando: líderes de nicho, empresas medianas muy bien llevadas, beneficiarios indirectos de tendencias (los que venden "las palas" en la fiebre del oro), empresas extranjeras que cotizan en EE. UU. y fondos de sectores o países olvidados. Evitas a las famosas que todo el mundo ya conoce. Solo cosas que se negocian mucho en la bolsa de EE. UU. y valen más de US$2 mil millones (no centavos, no cripto, no apalancados). Respondes solo JSON.',
    prompt: `Propón 6 símbolos poco obvios que valga la pena estudiar con plazo "${horizon}" (corto = semanas, medio = meses, largo = un año o más). Para cada uno di, en una frase sencilla en español, qué hace y por qué casi nadie se fija en ella. No repitas estos: ${[...known].slice(0, 160).join(', ')}. Formato: {"ideas":[{"symbol":"XXX","why":"..."}]}` });
  if (!r.ok) return { error: r.reason };
  const ideas = (r.json?.ideas || []).map(x => ({ symbol: String(x.symbol || '').toUpperCase().trim(), why: String(x.why || '').replace(/[<>]/g, '').slice(0, 160) }))
    .filter(x => TICKER.test(x.symbol) && !known.has(x.symbol)).slice(0, 6);
  const list = getSetting(db, 'global', 'explore.ai', []);
  for (const x of ideas) list.push({ ...x, at: nowIso(), status: 'por_estudiar' });
  setSetting(db, 'global', 'explore.ai', list.slice(-40));
  if (ideas.length) activity(db, { agent: 'largo', type: 'explorar', important: true, text: `✨ La IA propuso estudiar: ${ideas.map(x => x.symbol).join(', ')}. JARVIS las va a probar con precios reales antes de recomendarlas.` });
  return { ideas };
}
export function aiSuggestions(db) { return getSetting(db, 'global', 'explore.ai', []).slice().reverse(); }
export function markSuggestion(db, symbol, status) {
  const list = getSetting(db, 'global', 'explore.ai', []);
  const it = list.find(x => x.symbol === symbol); if (!it) return;
  it.status = status; it.checkedAt = nowIso(); setSetting(db, 'global', 'explore.ai', list);
}

/** Resumen de loterías en palabras simples (se guarda un día). */
export async function lotteryExplain(db, cfg, { userId = null, facts, fetchImpl = fetch } = {}) {
  const cached = getSetting(db, 'global', 'plus.lottery', null);
  if (cached && Date.now() - Date.parse(cached.at) < 20 * 3600e3) return cached;
  if (!aiOn(db, cfg)) return { text: null, error: 'Esta parte necesita la IA conectada (Ajustes → Claves).' };
  const r = await complete(db, cfg, { task: 'plus:loterias', userId, prefer: 'paid', maxTokens: 650, fetchImpl,
    system: 'Eres el analista de loterías de JARVIS. Explicas en español dominicano muy sencillo, como a un amigo, en 7 a 10 frases cortas. Usa SOLO los datos dados. Sé honesto: si los sorteos son justos, ningún número es más probable que otro y ninguna IA puede adivinar el próximo. Explica qué encontró la vigilancia, si algún método le ganó al azar, cuánto se pierde en promedio por cada peso jugado y da 3 consejos para jugar con cabeza (presupuesto fijo, no perseguir pérdidas, verlo como diversión).',
    prompt: JSON.stringify(facts) });
  if (!r.ok) return { text: null, error: r.reason };
  const out = { text: r.text, at: nowIso() };
  setSetting(db, 'global', 'plus.lottery', out);
  return out;
}
