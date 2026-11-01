// Debate antes de recomendar: dos IA con miradas distintas, en rondas, con datos y fuentes.
// La decisión final se apoya en los datos y el historial; el debate puede bajar la confianza, nunca inventarla.
import { complete, available } from './providers.js';
import { seal } from '../core/ledger.js';
import { nowIso } from '../core/db.js';
import { round } from '../core/util.js';
import { sealOpinion } from '../motor/track.js';

const SYSTEM = (role) => `Eres un analista de inversiones dentro de JARVIS. Tu papel: ${role}.
Reglas: usa SOLO los datos que te doy; si algo no está en los datos, dilo como opinión. Escribe en español sencillo, máximo 35 palabras.
Incluye "prob": tu probabilidad (0 a 100) de que la acción le gane al SPY en los próximos 20 días de bolsa; sé honesto, 50 es "no sé".
Responde en JSON: {"stance":"comprar|esperar|no_comprar","prob":55,"argument":"...","evidence":[{"text":"...","kind":"dato|opinion","source":"nombre de la fuente o null"}]}`;

const ROLE_A = 'OPTIMISTA: busca las mejores razones para invertir, sin exagerar';
const ROLE_B = 'PRUDENTE: busca los riesgos y lo que podría salir mal, sin ser alarmista';

function participants(db, cfg) {
  const av = available(db, cfg);
  if (av.openai && av.anthropic) return [{ who: 'GPT mini', only: 'openai', role: ROLE_A, label: 'optimista' }, { who: 'Claude', only: 'anthropic', role: ROLE_B, label: 'prudente' }];
  if (av.openai && av.ollama) return [{ who: 'GPT mini', only: 'openai', role: ROLE_A, label: 'optimista' }, { who: 'Modelo local', only: 'ollama', role: ROLE_B, label: 'prudente' }];
  if (av.openai) return [{ who: 'GPT mini (A)', only: 'openai', role: ROLE_A, label: 'optimista' }, { who: 'GPT mini (B)', only: 'openai', role: ROLE_B, label: 'prudente', sameModel: true }];
  if (av.ollama) return [{ who: 'Modelo local (A)', only: 'ollama', role: ROLE_A, label: 'optimista' }, { who: 'Modelo local (B)', only: 'ollama', role: ROLE_B, label: 'prudente', sameModel: true }];
  return [];
}

/** Pasos concretos según el semáforo y tus límites (operaciones de US$5 a 10). */
export function todoSteps(light, { minUsd = 5, maxUsd = 10, stopPct = 8 } = {}) {
  if (light === 'verde') return [{ step: `Invierte US$${maxUsd} ahora`, note: 'Dentro de tu límite por operación' }, { step: `Sal si cae ${stopPct}%`, note: `Pérdida máxima: US$${round(maxUsd * stopPct / 100)}` }];
  if (light === 'amarillo') return [{ step: `Invierte US$${minUsd} ahora`, note: 'Entrada en dos partes por la duda' }, { step: `Otros US$${minUsd} en 2 semanas`, note: 'Solo si no sube más de 5% ni aparece una polémica' }, { step: `Sal si cae ${stopPct}%`, note: `Pérdida máxima: US$${round(maxUsd * stopPct / 100)}` }];
  return [{ step: 'No compres por ahora', note: 'Las razones en contra pesan más' }, { step: 'Queda en tu lista de vigilancia', note: 'JARVIS te avisa si cambia' }];
}

export async function runDebate(db, cfg, { symbol, card, context, userId = null, fetchImpl }) {
  const ps = participants(db, cfg);
  const facts = JSON.stringify({ empresa: symbol, precio: context.price, razones: card.reasons.map(r => r.text), fuentes: context.sources || [], noticias: (context.news || []).slice(0, 5) });
  const rounds = [], cost = { usd: 0 };
  const ask = async (p, prompt) => {
    const r = await complete(db, cfg, { task: `debate:${symbol}`, userId, system: SYSTEM(p.role), prompt, json: true, maxTokens: 300, only: p.only, fetchImpl });
    if (!r.ok) return { who: p.who, label: p.label, failed: true, reason: r.reason };
    cost.usd += r.cost;
    const j = r.json || {};
    return { who: p.who, label: p.label, provider: r.provider, prob: Number.isFinite(Number(j.prob)) ? Math.max(1, Math.min(99, Number(j.prob))) : null, stance: ['comprar', 'esperar', 'no_comprar'].includes(j.stance) ? j.stance : 'esperar', text: String(j.argument || '').slice(0, 300), evidence: Array.isArray(j.evidence) ? j.evidence.slice(0, 3) : [] };
  };
  if (ps.length) {
    const r1 = [];
    for (const p of ps) r1.push(await ask(p, `Datos:\n${facts}\nDa tu opinión inicial sobre invertir en ${symbol}.`));
    rounds.push({ round: 1, title: 'Cada uno da su opinión', messages: r1 });
    if (r1.every(m => !m.failed)) {
      const r2 = [];
      for (let i = 0; i < ps.length; i++) {
        const other = r1[1 - i];
        r2.push(await ask(ps[i], `Datos:\n${facts}\nEl otro analista dijo: "${other.text}" (postura: ${other.stance}). Critícalo con datos y da tu postura final.`));
      }
      rounds.push({ round: 2, title: 'Se critican', messages: r2 });
    }
  }
  const finals = (rounds.at(-1)?.messages || []).filter(m => !m.failed);
  const dataDir = card.light === 'verde' ? 'comprar' : card.light === 'rojo' ? 'no_comprar' : 'esperar';
  const agree = finals.length === 2 && finals[0].stance === finals[1].stance;
  let light = card.light, confidence = card.confidence;
  const notes = [];
  if (!finals.length) notes.push('No hubo debate (IA no disponible o tope de gasto alcanzado). La decisión usa solo datos e historial.');
  else if (agree && finals[0].stance === dataDir) { confidence = Math.min(0.95, confidence + 0.05); notes.push('Las dos IA coinciden con los datos: sube la confianza.'); }
  else if (!agree) { if (light === 'verde') light = 'amarillo'; confidence = Math.max(0.05, confidence - 0.1); notes.push('Las IA no coinciden: la recomendación baja a amarillo y se muestran ambos argumentos.'); }
  else if (finals[0].stance !== dataDir) { if (light === 'verde') light = 'amarillo'; confidence = Math.max(0.05, confidence - 0.05); notes.push('Las IA coinciden entre ellas pero no con los datos: se mantiene la cautela.'); }
  if (ps.some(p => p.sameModel)) notes.push('Debate con el mismo modelo en dos papeles: vale menos que entre dos IA distintas.');
  const title = light === 'verde' ? 'Sí, te recomiendo invertir' : light === 'amarillo' ? 'Invierte poco, en dos partes' : 'No te recomiendo invertir ahora';
  const verdict = { light, title, confidence: round(confidence, 2), notes, agree, todo: todoSteps(light), basedOn: 'datos e historial (70%) + debate (30%)' };
  const s = seal(db, { kind: 'debate', ref: symbol, userId, payload: { symbol, rounds, verdict, card: { score: card.score, light: card.light, confidence: card.confidence } } });
  const info = db.prepare('INSERT INTO debates (subject, created_at, rounds, verdict, cost_usd, ledger_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .run(symbol, nowIso(), JSON.stringify(rounds), JSON.stringify(verdict), cost.usd, s.hash);
  const id = Number(info.lastInsertRowid);
  // Cada IA queda registrada con su propia predicción, para compararlas con el tiempo
  const AG = { openai: 'gpt', anthropic: 'claude', ollama: 'local' };
  for (const m of finals) sealOpinion(db, { agent: AG[m.provider] || m.provider, provider: m.provider, symbol, stance: m.stance, prob: m.prob != null ? m.prob / 100 : NaN, argument: m.text, debateId: id });
  return { id, symbol, rounds, verdict, costUsd: round(cost.usd, 4) };
}
