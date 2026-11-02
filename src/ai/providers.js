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
export const OPENAI_FALLBACK = 'gpt-4o-mini';
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

/** ¿Se puede gastar esto? Revisa el tope global (tu presupuesto) y el del usuario.
 *  Si el usuario ya gastó su base gratis del mes, puede seguir con sus créditos extra (Potenciador). */
export function budgetCheck(db, cfg, { userId = null, estUsd }) {
  const g = { day: spent(db, { sinceIso: dayStart() }), month: spent(db, { sinceIso: monthStart() }) };
  let extra = 0, overBase = false;
  if (userId != null) {
    const u = db.prepare('SELECT ai_daily_cap_usd d, ai_monthly_cap_usd m, ai_extra_usd x FROM users WHERE id = ?').get(userId);
    if (u) {
      const month = spent(db, { userId, sinceIso: monthStart() });
      extra = u.x || 0; overBase = month + estUsd > u.m;
      if (overBase && month + estUsd > u.m + extra) return { ok: false, reason: 'Se acabó tu IA gratis de este mes. JARVIS sigue funcionando igual; para más respuestas de la IA, activa un Potenciador (menú ⚡ Potenciador) o espera al día 1.' };
      if (!overBase && !(extra > 0) && spent(db, { userId, sinceIso: dayStart() }) + estUsd > u.d) return { ok: false, reason: 'Llegaste al límite de IA de hoy. Mañana se renueva, o activa un Potenciador (menú ⚡ Potenciador).' };
    }
  }
  // Lo que paga el usuario con su Potenciador no cuenta contra el tope general del administrador
  const room = overBase ? extra : 0;
  if (g.month + estUsd > cfg.aiMonthlyCapUsd + room) return { ok: false, reason: `Se llegó al tope mensual de IA (US$${cfg.aiMonthlyCapUsd}). Modo ahorro: sigo con código y el modelo gratis.` };
  if (g.day + estUsd > cfg.aiDailyCapUsd + room) return { ok: false, reason: `Se llegó al tope diario de IA (US$${cfg.aiDailyCapUsd}).` };
  return { ok: true };
}

function record(db, { userId, provider, model, task, inTok, outTok, ok }) {
  const p = priceFor(db, provider, model);
  const cost = (inTok * p.in + outTok * p.out) / 1e6;
  // Si este gasto pasa la base gratis del mes, la parte que sobra se descuenta de los créditos extra
  if (userId != null && cost > 0) {
    const u = db.prepare('SELECT ai_monthly_cap_usd m FROM users WHERE id = ?').get(userId);
    if (u) {
      const before = spent(db, { userId, sinceIso: monthStart() });
      const over = Math.max(0, before + cost - u.m) - Math.max(0, before - u.m);
      if (over > 0) db.prepare('UPDATE users SET ai_extra_usd = MAX(0, ai_extra_usd - ?) WHERE id = ?').run(over, userId);
    }
  }
  db.prepare('INSERT INTO ai_usage (ts, user_id, provider, model, task, in_tokens, out_tokens, cost_usd, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(nowIso(), userId ?? null, provider, model ?? 'desconocido', task, inTok ?? 0, outTok ?? 0, cost, ok ? 1 : 0);
  return cost;
}

// Los modelos que "piensan" antes de responder (gpt-5, gpt-6, o-series) gastan parte del límite pensando:
// con un límite corto devolvían la respuesta VACÍA. Se les da más espacio y se les pide pensar lo mínimo.
export const isReasoningModel = m => /^(gpt-5|gpt-6|o\d)/i.test(m || '');
async function callOpenAI(cfg, { system, prompt, json, maxTokens }, fetchImpl) {
  const model = cfg.openaiModel, R = isReasoningModel(model);
  const body = { model, max_completion_tokens: R ? maxTokens * 4 + 1500 : maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], ...(json ? { response_format: { type: 'json_object' } } : {}), ...(R ? { reasoning_effort: 'minimal' } : {}) };
  const post = b => fetchImpl('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  let res = await post(body);
  if (!res.ok && R && res.status === 400) {
    const t = await res.text();
    if (/reasoning/i.test(t)) { delete body.reasoning_effort; res = await post(body); } // ese modelo no acepta ese ajuste
    else throw Object.assign(new Error(`ChatGPT respondió 400: ${t.slice(0, 200)}`), { status: 400, body: t });
  }
  if (!res.ok) { const t = await res.text(); throw Object.assign(new Error(`ChatGPT respondió ${res.status}: ${t.slice(0, 200)}`), { status: res.status, body: t }); }
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw Object.assign(new Error(`ChatGPT no devolvió texto (${j.choices?.[0]?.finish_reason || 'vacío'})`), { empty: true });
  return { text, inTok: j.usage?.prompt_tokens, outTok: j.usage?.completion_tokens, model };
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
  const ollamaDown = getSetting(db, 'global', 'ai.ollamaDown', null);
  for (const prov of order) {
    if (!av[prov]) continue;
    if (prov === 'ollama' && ollamaDown && Date.now() - Date.parse(ollamaDown) < 6 * 3600e3 && (av.openai || av.anthropic)) continue; // el modelo gratis no está instalado: no perder tiempo
    // Primero el tope (con un precio prudente); solo si hay presupuesto se consulta qué modelo usar
    const known = prov === 'openai' ? (cfg.openaiModel || getSetting(db, 'global', 'ai.openaiModel', null)?.model) : prov === 'anthropic' ? cfg.anthropicModel : cfg.ollamaModel;
    const p = priceFor(db, prov, known);
    const estUsd = (estTokens(system + prompt) * p.in + maxTokens * p.out) / 1e6;
    if (estUsd > 0) { const b = budgetCheck(db, cfg, { userId, estUsd }); if (!b.ok) { errors.push(b.reason); continue; } }
    if (prov === 'openai') cfg = { ...cfg, openaiModel: await resolveOpenAIModel(db, cfg, fetchImpl) };
    try {
      let r;
      try { r = await CALLERS[prov](cfg, { system, prompt, json, maxTokens }, fetchImpl); }
      catch (e) {
        // ChatGPT: si el modelo elegido no existe, no sirve o respondió vacío, se prueba una vez con uno clásico y estable
        const modelProblem = prov === 'openai' && (e.empty || e.status === 404 || /model/i.test(e.body || ''));
        if (!modelProblem || cfg.openaiModel === OPENAI_FALLBACK) throw e;
        record(db, { userId, provider: prov, model: cfg.openaiModel, task, inTok: 0, outTok: 0, ok: false });
        setSetting(db, 'global', 'ai.openaiModel', { model: OPENAI_FALLBACK, at: nowIso(), why: e.message.slice(0, 160) });
        cfg = { ...cfg, openaiModel: OPENAI_FALLBACK };
        r = await CALLERS[prov](cfg, { system, prompt, json, maxTokens }, fetchImpl);
      }
      const cost = record(db, { userId, provider: prov, model: r.model, task, inTok: r.inTok ?? estTokens(system + prompt), outTok: r.outTok ?? estTokens(r.text), ok: true });
      let parsed = null;
      if (json) { try { parsed = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1)); } catch { errors.push(`${prov}: respuesta no fue JSON válido`); continue; } }
      return { ok: true, text: r.text, json: parsed, provider: prov, model: r.model, cost };
    } catch (e) {
      record(db, { userId, provider: prov, model: prov === 'openai' ? cfg.openaiModel : prov, task, inTok: 0, outTok: 0, ok: false });
      errors.push(`${prov}: ${e.message}`);
      if (prov === 'ollama') setSetting(db, 'global', 'ai.ollamaDown', nowIso());
      setSetting(db, 'global', 'ai.lastError', { at: nowIso(), provider: prov, task, error: e.message.slice(0, 300) });
    }
  }
  // Mensaje claro para la persona; el detalle técnico queda guardado para el administrador (Ajustes → Plus con IA)
  const budget = errors.find(e => /tope|límite|Potenciador|gratis de este mes/i.test(e));
  const reason = !errors.length ? 'No hay ninguna IA disponible (falta la clave de ChatGPT).' : budget || 'La IA no pudo responder en este momento. Intenta de nuevo en unos minutos; si sigue igual, el administrador lo verá en Ajustes.';
  return { ok: false, reason, detail: errors.join(' | ') };
}
