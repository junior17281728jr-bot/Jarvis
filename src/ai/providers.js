// Capa de IA: una interfaz común para ChatGPT (principal), Claude (opcional) y un modelo gratis local.
// Controla el gasto antes de cada llamada y nunca afirma haber investigado si la llamada falló.
import { nowIso, getSetting, setSetting } from '../core/db.js';

// Precios por millón de palabras-unidad (tokens), en US$. CONFIRMAR con la página oficial al configurar;
// se pueden cambiar en Configuración sin tocar el código.
// Revisados el 30 de octubre de 2026 (fuentes secundarias; confirmar en la página oficial).
export const DEFAULT_PRICES = {
  openai: { in: 0.25, out: 1.25 },      // estimación prudente si el modelo no está en la lista
  anthropic: { in: 0.1, out: 0.5 },
  ollama: { in: 0, out: 0 },
  models: {
    'gpt-6-luna': { in: 0.1, out: 0.5 }, 'gpt-5.6-luna': { in: 0.2, out: 1.2 }, 'gpt-5-nano': { in: 0.05, out: 0.4 },
    'gpt-5.4-nano': { in: 0.2, out: 1.25 }, 'gpt-5-mini': { in: 0.25, out: 2 }, 'gpt-4.1-nano': { in: 0.1, out: 0.4 }, 'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'claude-haiku-5-5': { in: 0.1, out: 0.5 }, // sube 5 veces si una petición pasa de 100,000 tokens (JARVIS envía mucho menos)
  },
};
// Orden de preferencia cuando no se fija OPENAI_MODEL: el más barato que tu cuenta tenga
export const OPENAI_PREFERENCE = ['gpt-5-nano', 'gpt-6-luna', 'gpt-4.1-nano', 'gpt-4o-mini', 'gpt-5.6-luna', 'gpt-5.4-nano', 'gpt-5-mini'];
function priceFor(db, provider, model) {
  const P = prices(db);
  return P.models?.[model] || P[provider] || { in: 0, out: 0 };
}
/** Si no hay modelo fijado, pregunta a OpenAI qué modelos tiene la cuenta y elige el más barato de la lista. */
export async function resolveOpenAIModel(db, cfg, fetchImpl = fetch) {
  if (cfg.openaiModel) return cfg.openaiModel;
  const saved = getSetting(db, 'global', 'ai.openaiModel', null);
  if (saved && Date.now() - Date.parse(saved.at) < 7 * 864e5) return saved.model;
  try {
    const res = await fetchImpl('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${cfg.openaiKey}` } });
    if (res.ok) {
      const ids = new Set((await res.json()).data.map(m => m.id));
      const pick = OPENAI_PREFERENCE.find(m => ids.has(m));
      if (pick) { setSetting(db, 'global', 'ai.openaiModel', { model: pick, at: new Date().toISOString() }); return pick; }
    }
  } catch { /* se usa el respaldo */ }
  return saved?.model || 'gpt-4o-mini';
}
const estTokens = s => Math.ceil((s || '').length / 4);

export function prices(db) { return getSetting(db, 'global', 'ai.prices', DEFAULT_PRICES); }

export function spent(db, { userId = null, sinceIso }) {
  const r = userId == null
    ? db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE ts >= ?').get(sinceIso)
    : db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE ts >= ? AND user_id = ?').get(sinceIso, userId);
  return r.c;
}
const dayStart = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').toISOString();
const monthStart = () => new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z').toISOString();

/** ¿Se puede gastar esto? Revisa el tope global (tu presupuesto) y el del usuario. */
export function budgetCheck(db, cfg, { userId = null, estUsd }) {
  const g = { day: spent(db, { sinceIso: dayStart() }), month: spent(db, { sinceIso: monthStart() }) };
  if (g.month + estUsd > cfg.aiMonthlyCapUsd) return { ok: false, reason: `Se llegó al tope mensual de IA (US$${cfg.aiMonthlyCapUsd}). Modo ahorro: sigo con código y el modelo gratis.` };
  if (g.day + estUsd > cfg.aiDailyCapUsd) return { ok: false, reason: `Se llegó al tope diario de IA (US$${cfg.aiDailyCapUsd}).` };
  if (userId != null) {
    const u = db.prepare('SELECT ai_daily_cap_usd d, ai_monthly_cap_usd m FROM users WHERE id = ?').get(userId);
    if (u) {
      if (spent(db, { userId, sinceIso: monthStart() }) + estUsd > u.m) return { ok: false, reason: 'Llegaste a tu tope mensual de IA.' };
      if (spent(db, { userId, sinceIso: dayStart() }) + estUsd > u.d) return { ok: false, reason: 'Llegaste a tu tope diario de IA.' };
    }
  }
  return { ok: true };
}

function record(db, { userId, provider, model, task, inTok, outTok, ok }) {
  const p = priceFor(db, provider, model);
  const cost = (inTok * p.in + outTok * p.out) / 1e6;
  db.prepare('INSERT INTO ai_usage (ts, user_id, provider, model, task, in_tokens, out_tokens, cost_usd, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(nowIso(), userId ?? null, provider, model ?? 'desconocido', task, inTok ?? 0, outTok ?? 0, cost, ok ? 1 : 0);
  return cost;
}

async function callOpenAI(cfg, { system, prompt, json, maxTokens }, fetchImpl) {
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.openaiModel, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!res.ok) throw new Error(`ChatGPT respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: j.choices[0].message.content, inTok: j.usage?.prompt_tokens, outTok: j.usage?.completion_tokens, model: cfg.openaiModel };
}
async function callAnthropic(cfg, { system, prompt, json, maxTokens }, fetchImpl) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.anthropicModel, max_tokens: maxTokens, system: system + (json ? '\nResponde solo con un objeto JSON válido.' : ''), messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: j.content.map(c => c.text || '').join(''), inTok: j.usage?.input_tokens, outTok: j.usage?.output_tokens, model: cfg.anthropicModel };
}
async function callOllama(cfg, { system, prompt, json }, fetchImpl) {
  const res = await fetchImpl(`${cfg.ollamaUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.ollamaModel, stream: false, ...(json ? { format: 'json' } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Modelo local respondió ${res.status}`);
  const j = await res.json();
  return { text: j.message?.content || '', inTok: j.prompt_eval_count, outTok: j.eval_count, model: cfg.ollamaModel };
}
const CALLERS = { openai: callOpenAI, anthropic: callAnthropic, ollama: callOllama };

export function available(db, cfg) {
  const enabled = getSetting(db, 'global', 'ai.enabled', { openai: true, anthropic: false, ollama: true });
  return {
    openai: !!cfg.openaiKey && enabled.openai !== false,
    anthropic: !!cfg.anthropicKey && !!enabled.anthropic,
    ollama: enabled.ollama !== false,
  };
}

/**
 * Pide una respuesta. `prefer`: 'local' (gratis primero) o 'paid' (ChatGPT primero).
 * Devuelve { ok, text, json, provider, cost } o { ok:false, reason } sin inventar nada.
 */
export async function complete(db, cfg, { task, userId = null, system, prompt, json = false, maxTokens = 600, prefer = 'local', only = null, fetchImpl = fetch }) {
  const av = available(db, cfg);
  const order = only ? [only] : prefer === 'paid' ? ['openai', 'anthropic', 'ollama'] : ['ollama', 'openai', 'anthropic'];
  const errors = [];
  for (const prov of order) {
    if (!av[prov]) continue;
    // Primero el tope (con un precio prudente); solo si hay presupuesto se consulta qué modelo usar
    const known = prov === 'openai' ? (cfg.openaiModel || getSetting(db, 'global', 'ai.openaiModel', null)?.model) : prov === 'anthropic' ? cfg.anthropicModel : cfg.ollamaModel;
    const p = priceFor(db, prov, known);
    const estUsd = (estTokens(system + prompt) * p.in + maxTokens * p.out) / 1e6;
    if (estUsd > 0) { const b = budgetCheck(db, cfg, { userId, estUsd }); if (!b.ok) { errors.push(b.reason); continue; } }
    if (prov === 'openai') cfg = { ...cfg, openaiModel: await resolveOpenAIModel(db, cfg, fetchImpl) };
    try {
      const r = await CALLERS[prov](cfg, { system, prompt, json, maxTokens }, fetchImpl);
      const cost = record(db, { userId, provider: prov, model: r.model, task, inTok: r.inTok ?? estTokens(system + prompt), outTok: r.outTok ?? estTokens(r.text), ok: true });
      let parsed = null;
      if (json) { try { parsed = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1)); } catch { errors.push(`${prov}: respuesta no fue JSON válido`); continue; } }
      return { ok: true, text: r.text, json: parsed, provider: prov, model: r.model, cost };
    } catch (e) {
      record(db, { userId, provider: prov, model: prov, task, inTok: 0, outTok: 0, ok: false });
      errors.push(`${prov}: ${e.message}`);
    }
  }
  return { ok: false, reason: errors.length ? errors.join(' | ') : 'No hay ninguna IA disponible (falta la clave de ChatGPT o el modelo local).' };
}
