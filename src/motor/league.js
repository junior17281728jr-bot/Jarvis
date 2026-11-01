// Liga de agentes, monedas y auditor.
// Las monedas se ganan cuando una idea gana dinero real (virtual) en la bolsa, verificado contra el mercado.
// Los agentes no pueden tocar su billetera: solo este código suma o quita, y el auditor revisa cada moneda.
import { nowIso } from '../core/db.js';
import { seal } from '../core/ledger.js';
import { round } from '../core/util.js';

export const DEFAULT_AGENTS = [
  { id: 'largo', name: 'El de largo plazo', role: 'bolsa', style: JSON.stringify({ families: ['comprar_y_mantener', 'cruce_medias', 'impulso'], mira: 'empresas sólidas y tendencias de meses' }) },
  { id: 'corto', name: 'El de corto plazo', role: 'bolsa', style: JSON.stringify({ families: ['rebote_rsi', 'ruptura'], mira: 'movimientos de días o semanas' }) },
  { id: 'polemicas', name: 'El cazador de polémicas', role: 'investigacion', style: JSON.stringify({ mira: 'noticias, demandas y riesgos escondidos' }) },
  { id: 'loteria', name: 'El estadístico de loterías', role: 'loteria', style: JSON.stringify({ mira: 'si los sorteos son justos y qué métodos sirven' }) },
];

export function ensureAgents(db) {
  const st = db.prepare('INSERT OR IGNORE INTO agents (id, name, role, style, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const a of DEFAULT_AGENTS) st.run(a.id, a.name, a.role, a.style, nowIso());
}
export const wallet = (db, agent) => db.prepare('SELECT COALESCE(SUM(amount),0) w FROM coins WHERE agent = ? AND revoked = 0').get(agent).w;

export function leagueTable(db, sinceIso = null) {
  return db.prepare('SELECT * FROM agents ORDER BY created_at').all().map(a => {
    const week = sinceIso ? db.prepare('SELECT COALESCE(SUM(amount),0) w FROM coins WHERE agent = ? AND revoked = 0 AND ts >= ?').get(a.id, sinceIso).w : null;
    const cheats = db.prepare('SELECT COUNT(*) n FROM cheat_reports WHERE agent = ?').get(a.id).n;
    return { id: a.id, name: a.name, role: a.role, status: a.status, coins: round(wallet(db, a.id), 2), week: week == null ? null : round(week, 2), cheats };
  }).sort((x, y) => y.coins - x.coins);
}

/** Recursos que compran las monedas: más turnos de investigación para quien gana. Mínimo 1 para todos. */
export function researchSlots(db, total = 6) {
  const ag = db.prepare("SELECT id FROM agents WHERE role = 'bolsa' AND status = 'activo'").all().map(a => ({ id: a.id, w: Math.max(1, wallet(db, a.id) + 10) }));
  const sum = ag.reduce((s, a) => s + a.w, 0);
  return Object.fromEntries(ag.map(a => [a.id, Math.max(1, Math.round(total * a.w / sum))]));
}

/** El contexto que el agente ve en cada turno: su meta, su saldo y su puesto. Así la meta está "en su cabeza". */
export function agentBrief(db, agentId) {
  const t = leagueTable(db);
  const pos = t.findIndex(a => a.id === agentId) + 1;
  const me = t.find(a => a.id === agentId);
  return `Eres "${me?.name}". Tienes ${me?.coins ?? 0} monedas y vas en el puesto ${pos} de ${t.length}. ` +
    'Ganas monedas cuando tus ideas ganan dinero en la bolsa (verificado contra el mercado y después de costes). ' +
    'Con más monedas recibes más dinero virtual, más pruebas y prioridad. Las trampas se detectan y cuestan todas las monedas de esa operación. ' +
    'Admitir que no hay oportunidad clara también es válido.';
}

// ---------- Auditor ----------
/**
 * Revisa una operación cerrada antes de pagar monedas. Reglas:
 *  precio_viejo, precio_del_futuro, sin_decision_previa, datos_del_futuro, fuera_de_limites.
 */
export function audit(db, { entry, exit, decision, limits }) {
  const issues = [];
  for (const t of [entry, exit]) {
    const age = (new Date(t.ts) - new Date(t.observed_at)) / 60e3;
    if (age < -0.01) issues.push({ rule: 'precio_del_futuro', text: `La operación ${t.id} usó un precio con hora posterior a la operación.` });
    else if (age > 20) issues.push({ rule: 'precio_viejo', text: `La operación ${t.id} usó un precio de hace ${Math.round(age)} minutos (máximo 20).` });
  }
  if (!decision) issues.push({ rule: 'sin_decision_previa', text: 'No hay una decisión sellada antes de la compra.' });
  else {
    if (decision.sealed_at > entry.ts) issues.push({ rule: 'sin_decision_previa', text: 'La decisión se selló después de la compra.' });
    const p = JSON.parse(decision.payload);
    if (p.dataUntil && p.dataUntil >= entry.ts.slice(0, 10)) issues.push({ rule: 'datos_del_futuro', text: `La señal usó datos del mismo día de la compra (${p.dataUntil}).` });
  }
  if (limits && entry.qty * entry.exec_price > limits.maxTradeUsd + 1e-6) issues.push({ rule: 'fuera_de_limites', text: `La compra de US$${round(entry.qty * entry.exec_price)} pasó el máximo de US$${limits.maxTradeUsd}.` });
  return { ok: issues.length === 0, issues };
}

/**
 * Paga (o cobra) monedas por una operación cerrada: +1 moneda por cada 1% ganado, +1 extra si le ganó al SPY
 * en el mismo periodo; las pérdidas restan igual. Si el auditor encuentra trampa: 0 monedas, se revocan las de
 * esa operación y queda un reporte con la explicación.
 */
export function settleCoins(db, { agent, strategyId, closed, entry, exit, decision, benchReturn, limits }) {
  const ref = `trade:${exit.id}`;
  const a = audit(db, { entry, exit, decision, limits });
  if (!a.ok) {
    const prev = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM coins WHERE ref = ? AND revoked = 0').get(ref).s;
    db.prepare("UPDATE coins SET revoked = 1, revoked_reason = 'trampa detectada' WHERE ref = ?").run(ref);
    for (const i of a.issues) db.prepare('INSERT INTO cheat_reports (ts, agent, strategy_id, ref, rule, explanation, coins_removed) VALUES (?, ?, ?, ?, ?, ?, ?)').run(nowIso(), agent, strategyId, ref, i.rule, i.text, prev);
    seal(db, { kind: 'trampa_detectada', ref, payload: { agent, strategyId, issues: a.issues } });
    return { coins: 0, cheat: true, issues: a.issues };
  }
  const pct = closed.pnlPct * 100;
  let amount = round(pct, 2), why = `${pct >= 0 ? 'Ganó' : 'Perdió'} ${round(Math.abs(pct), 2)}% neto`;
  if (benchReturn != null && closed.pnlPct > benchReturn) { amount += 1; why += ' y le ganó al mercado'; }
  db.prepare('INSERT INTO coins (ts, agent, strategy_id, amount, reason, ref) VALUES (?, ?, ?, ?, ?, ?)').run(nowIso(), agent, strategyId, amount, why, ref);
  return { coins: amount, cheat: false, why };
}

export function cheatReports(db, limit = 20) {
  return db.prepare('SELECT * FROM cheat_reports ORDER BY ts DESC LIMIT ?').all(limit);
}
