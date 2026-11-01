// Perfil de cada persona: el núcleo (investigación, ranking, mapa, historial) es el mismo para todos;
// el perfil solo cambia CÓMO se le presenta y cuánto le sugiere poner a cada uno.
import { getSetting, setSetting } from '../core/db.js';
import { round } from '../core/util.js';

export const STYLES = {
  conservador: { label: 'Conservador', icon: '🛡️', desc: 'Prefiero perder poco aunque gane menos.', pct: { verde: 0.05, amarillo: 0.025 }, max: 0.10, w: { chance: 30, gain: 15, safety: 35, pat: 20 } },
  equilibrado: { label: 'Equilibrado', icon: '⚖️', desc: 'Un poco de riesgo para ganar más, sin locuras.', pct: { verde: 0.10, amarillo: 0.05 }, max: 0.20, w: { chance: 40, gain: 25, safety: 20, pat: 15 } },
  arriesgado: { label: 'Arriesgado', icon: '🚀', desc: 'Acepto subidas y bajadas fuertes por ganar más.', pct: { verde: 0.15, amarillo: 0.075 }, max: 0.25, w: { chance: 35, gain: 40, safety: 10, pat: 15 } },
};
export const HORIZONS = {
  corto: { label: 'Semanas', desc: 'Quiero ver resultados pronto.', patMul: 1.8 },
  medio: { label: 'Meses', desc: 'Puedo esperar unos meses.', patMul: 1 },
  largo: { label: 'Un año o más', desc: 'No necesito ese dinero en mucho tiempo.', patMul: 0.3 },
};
export const DEFAULT_PROFILE = { style: 'equilibrado', horizon: 'medio', interests: { empresas: true, fondos: true, loterias: true }, ntfyTopic: '', setup: false };
const FUNDS = new Set(['SPY', 'VOO', 'QQQ', 'VTI', 'SCHD']);
export const isFund = s => FUNDS.has(s);

export function getProfile(db, userId) {
  const p = { ...DEFAULT_PROFILE, ...getSetting(db, `user:${userId}`, 'profile', {}) };
  p.interests = { ...DEFAULT_PROFILE.interests, ...(p.interests || {}) };
  return p;
}

export function saveProfile(db, userId, input) {
  const p = getProfile(db, userId);
  if (input.style !== undefined) { if (!STYLES[input.style]) throw new Error('Estilo no válido.'); p.style = input.style; }
  if (input.horizon !== undefined) { if (!HORIZONS[input.horizon]) throw new Error('Plazo no válido.'); p.horizon = input.horizon; }
  if (input.interests) for (const k of ['empresas', 'fondos', 'loterias']) if (k in input.interests) p.interests[k] = !!input.interests[k];
  if (!p.interests.empresas && !p.interests.fondos) throw new Error('Elige al menos empresas o fondos.');
  if (input.ntfyTopic !== undefined) {
    const t = String(input.ntfyTopic || '').trim();
    if (t && !/^[A-Za-z0-9_\-]{8,64}$/.test(t)) throw new Error('El tema de avisos debe tener de 8 a 64 letras, números, guion o guion bajo, sin espacios.');
    p.ntfyTopic = t;
  }
  p.setup = true;
  setSetting(db, `user:${userId}`, 'profile', p);
  return p;
}

/** Qué tanto le conviene a ESTA persona (0–100), según su estilo y su paciencia. */
export function personalConv(card, profile) {
  const S = STYLES[profile.style] || STYLES.equilibrado, H = HORIZONS[profile.horizon] || HORIZONS.medio;
  const cl = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  const p = card.projection?.personal, t = card.timing;
  let pat = !t ? 0.3 : t.immediate ? 1 : t.recommended ? ({ 5: 1, 21: 0.9, 63: 0.8, 126: 0.6, 252: 0.4 }[t.recommended.days] ?? 0.5) : 0.15;
  if (profile.horizon === 'largo') pat = Math.max(pat, 0.8); // a quien puede esperar, la espera no le resta
  const wPat = S.w.pat * H.patMul, total = S.w.chance + S.w.gain + S.w.safety + wPat;
  const raw = (cl(card.probBeat ?? 0.5, 0.35, 0.65) * S.w.chance + (p ? cl(p.probable / 10, -0.05, 0.2) * S.w.gain + (1 - p.lossChance) * S.w.safety : (S.w.gain + S.w.safety) * 0.4) + pat * wPat) / total * 100;
  return round(raw * ({ verde: 1, amarillo: 0.85, rojo: 0.55 }[card.light] ?? 0.55), 0);
}

/** ¿Le interesa esta opción a esta persona? */
export const wants = (profile, symbol) => (isFund(symbol) ? profile.interests.fondos : profile.interests.empresas);

/** Una frase que explica cómo JARVIS se adapta a esta persona. */
export function profileLine(profile, budgetUsd) {
  const S = STYLES[profile.style], H = HORIZONS[profile.horizon];
  const v = Math.max(5, Math.round(budgetUsd * S.pct.verde)), a = Math.max(5, Math.round(budgetUsd * S.pct.amarillo));
  return `${S.icon} ${S.label}, plazo de ${H.label.toLowerCase()}: con tus US$${budgetUsd} te sugiere US$${v} cuando dice "Sí, invierte" y US$${a} cuando dice "Invierte poco"; máximo US$${Math.round(budgetUsd * S.max)} solo con pruebas fuertes. Ordena el mapa pensando en ${profile.style === 'conservador' ? 'perder poco' : profile.style === 'arriesgado' ? 'ganar más' : 'un equilibrio entre ganar y no perder'}${profile.horizon === 'corto' ? ' y en resultados rápidos' : profile.horizon === 'largo' ? ', sin castigar las que tardan' : ''}.`;
}
