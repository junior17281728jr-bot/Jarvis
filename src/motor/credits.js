// ⚡ Potenciador de IA: cada usuario tiene una base gratis de IA al mes. Si la gasta, JARVIS sigue funcionando
// completo (mapa, recomendaciones, historial); solo las respuestas de la IA esperan al mes siguiente.
// Para seguir usándolas, el usuario paga al administrador (transferencia, etc.), sube el comprobante y el
// administrador aprueba o rechaza. Lo aprobado se suma como "créditos extra" que no vencen.
// 1 crédito = US$0.01 de costo real de IA (el usuario solo ve créditos, nunca proveedores ni precios internos).
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getSetting, setSetting, nowIso, activity, audit } from '../core/db.js';
import { round } from '../core/util.js';
import { currentAcceptance } from '../core/legal.js';

export const CREDIT_USD = 0.01;
export const toCredits = usd => Math.max(0, Math.floor(round(usd / CREDIT_USD, 6)));
const MAX_RECEIPT = 1_500_000;

export const DEFAULT_PACKS = [
  { id: 'p1', name: 'Potenciador básico', price: 'RD$250', credits: 200, kind: 'una_vez' },
  { id: 'p2', name: 'Potenciador plus', price: 'RD$620', credits: 500, kind: 'una_vez' },
  { id: 'p3', name: 'Plan mensual', price: 'RD$995 al mes', credits: 800, kind: 'mensual' },
];
export const BANKS = ['Banco Popular', 'Banco BHD', 'Banreservas', 'Banco Santa Cruz', 'Scotiabank', 'Asociación Popular (APAP)', 'Banco Promerica', 'Otro'];
export const PLAN_DAYS = 30;
export function creditSettings(db) {
  const packs = getSetting(db, 'global', 'credits.packs', DEFAULT_PACKS).map(p => ({ kind: 'una_vez', ...p }));
  return { packs, payInfo: getSetting(db, 'global', 'credits.payInfo', ''), accounts: getSetting(db, 'global', 'credits.accounts', []), banks: BANKS, margin: getSetting(db, 'global', 'credits.margin', 2) };
}
export function saveCreditSettings(db, { packs, payInfo, accounts, margin }) {
  if (margin !== undefined) { const m = Number(margin); if (!(m >= 1 && m <= 10)) throw new Error('El margen debe estar entre 1 (sin ganancia) y 10.'); setSetting(db, 'global', 'credits.margin', Math.round(m * 100) / 100); }
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').trim().slice(0, max);
  if (packs !== undefined) {
    if (!Array.isArray(packs) || !packs.length || packs.length > 6) throw new Error('Pon entre 1 y 6 paquetes.');
    const out = packs.map((p, i) => {
      const credits = Math.round(Number(p.credits));
      if (!clean(p.name, 40) || !clean(p.price, 20) || !(credits >= 10 && credits <= 100000)) throw new Error(`Revisa el paquete ${i + 1}: nombre, precio y créditos (10 a 100,000).`);
      return { id: `p${i + 1}`, name: clean(p.name, 40), price: clean(p.price, 24), credits, kind: p.kind === 'mensual' ? 'mensual' : 'una_vez' };
    });
    setSetting(db, 'global', 'credits.packs', out);
  }
  if (payInfo !== undefined) setSetting(db, 'global', 'credits.payInfo', clean(payInfo, 600));
  if (accounts !== undefined) {
    if (!Array.isArray(accounts) || accounts.length > 5) throw new Error('Pon hasta 5 cuentas.');
    const out = accounts.map((a, i) => {
      const bank = BANKS.includes(a.bank) ? a.bank : clean(a.bank, 40), number = clean(a.number, 30), holder = clean(a.holder, 60);
      if (!bank || !number || !holder) throw new Error(`Cuenta ${i + 1}: falta el banco, el número o a nombre de quién está.`);
      if (!/^[0-9 -]{4,30}$/.test(number)) throw new Error(`Cuenta ${i + 1}: el número de cuenta solo lleva números.`);
      const id = clean(a.cedula, 20);
      if (id && !/^[0-9 -]{9,20}$/.test(id)) throw new Error(`Cuenta ${i + 1}: la cédula o RNC solo lleva números.`);
      return { bank, type: a.type === 'Corriente' ? 'Corriente' : 'Ahorros', number, holder, cedula: id, note: clean(a.note, 80) };
    });
    setSetting(db, 'global', 'credits.accounts', out);
  }
  return creditSettings(db);
}

const monthStart = () => new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z').toISOString();
const nextMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };

/** Cuánto le queda a una persona: base gratis del mes + créditos extra. */
export function creditStatus(db, userId) {
  const u = db.prepare('SELECT ai_monthly_cap_usd m, ai_extra_usd x, plan_until, plan_name FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const used = db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE ts >= ? AND user_id = ?').get(monthStart(), userId).c;
  const base = toCredits(u.m), baseUsed = Math.min(base, toCredits(used));
  const planActive = u.plan_until && Date.parse(u.plan_until) > Date.now();
  return { base, baseUsed, baseLeft: Math.max(0, base - baseUsed), extra: toCredits(u.x), resetsAt: nextMonth(),
    plan: u.plan_until ? { name: u.plan_name, until: u.plan_until, active: !!planActive, daysLeft: planActive ? Math.ceil((Date.parse(u.plan_until) - Date.now()) / 864e5) : 0 } : null, pending: db.prepare("SELECT COUNT(*) n FROM credit_requests WHERE user_id = ? AND status = 'pendiente'").get(userId).n };
}

function decodeReceipt(dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Sube una foto del comprobante (PNG, JPG o WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_RECEIPT) throw new Error('La foto es muy pesada. Prueba con una captura de pantalla.');
  const png = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  const ext = png ? 'png' : jpg ? 'jpg' : webp ? 'webp' : null;
  if (!ext) throw new Error('El archivo no parece una foto válida.');
  return { buf, ext, type: { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext] };
}
const receiptDir = dbPath => join(dirname(dbPath), 'comprobantes');

export function createRequest(db, cfg, user, { packId, receipt, reference, note, payerName, payerBank, amount, currency }) {
  const { packs } = creditSettings(db), pack = packs.find(p => p.id === packId);
  if (!pack) throw new Error('Elige un paquete.');
  const signed = currentAcceptance(db, user.id, 'contrato');
  if (!signed) throw Object.assign(new Error('Antes de pagar tienes que leer y firmar el contrato de compra.'), { code: 428 });
  if (db.prepare("SELECT COUNT(*) n FROM credit_requests WHERE user_id = ? AND status = 'pendiente'").get(user.id).n >= 3) throw new Error('Ya tienes 3 solicitudes esperando respuesta. Espera a que el administrador las revise.');
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
  if (!clean(payerName, 60)) throw new Error('Escribe a nombre de quién salió el pago.');
  if (!clean(payerBank, 40)) throw new Error('Elige desde qué banco pagaste.');
  const amt = Math.round(Number(String(amount ?? '').replace(/[^0-9.]/g, '')) * 100) / 100;
  if (!(amt > 0 && amt < 10_000_000)) throw new Error('Escribe la cantidad exacta que enviaste, como sale en el comprobante.');
  const cur = currency === 'US$' ? 'US$' : 'RD$';
  const r = decodeReceipt(receipt);
  const info = db.prepare(`INSERT INTO credit_requests (user_id, created_at, pack_name, price, credits, reference, note, receipt_ext, status, payer_name, payer_bank, kind, amount, currency, legal_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?)`).run(user.id, nowIso(), pack.name, pack.price, pack.credits, clean(reference, 60), clean(note, 300), r.ext, clean(payerName, 60), clean(payerBank, 40), pack.kind === 'mensual' ? 'mensual' : 'una_vez', amt, cur, signed.id);
  const id = Number(info.lastInsertRowid), dir = receiptDir(cfg.dbPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${id}.${r.ext}`), r.buf, { mode: 0o600 });
  audit(db, user.id, 'potenciador_solicitud', { id, pack: pack.name, credits: pack.credits });
  activity(db, { type: 'potenciador', important: true, userId: adminId(db), text: `⚡ ${user.displayName || user.username} pidió "${pack.name}" (${pack.price}), dice que envió ${cur}${amt.toLocaleString('en-US')} y subió su comprobante. Confirma en tu banco que llegó y aprueba en Potenciador.` });
  return { id };
}
const adminId = db => db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1").get()?.id ?? null;

export function receiptFile(db, cfg, id) {
  const r = db.prepare('SELECT id, user_id, receipt_ext FROM credit_requests WHERE id = ?').get(id);
  if (!r) return null;
  const f = join(receiptDir(cfg.dbPath), `${r.id}.${r.receipt_ext}`);
  return existsSync(f) ? { userId: r.user_id, buf: readFileSync(f), type: { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[r.receipt_ext] } : null;
}

export function listRequests(db, { userId = null, status = null } = {}) {
  const where = [], args = [];
  if (userId != null) { where.push('r.user_id = ?'); args.push(userId); }
  if (status) { where.push('r.status = ?'); args.push(status); }
  return db.prepare(`SELECT r.id, r.user_id, r.created_at, r.pack_name, r.price, r.credits, r.reference, r.note, r.status, r.decided_at, r.admin_note, r.payer_name, r.payer_bank, r.kind, r.amount, r.currency, r.legal_id,
      COALESCE(u.display_name, u.username) who, u.username FROM credit_requests r JOIN users u ON u.id = r.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (r.status = 'pendiente') DESC, r.id DESC LIMIT 100`).all(...args);
}

/** El administrador decide. Al aprobar, los créditos se suman al saldo extra de esa persona. */
export function decideRequest(db, admin, id, { approve, note = '' }) {
  const r = db.prepare('SELECT * FROM credit_requests WHERE id = ?').get(id);
  if (!r) throw new Error('Esa solicitud no existe.');
  if (r.status !== 'pendiente') throw new Error('Esa solicitud ya fue decidida.');
  const clean = String(note ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 200);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE credit_requests SET status = ?, decided_at = ?, decided_by = ?, admin_note = ? WHERE id = ?').run(approve ? 'aprobada' : 'rechazada', nowIso(), admin.id, clean, id);
    if (approve) db.prepare('UPDATE users SET ai_extra_usd = ai_extra_usd + ? WHERE id = ?').run(r.credits * CREDIT_USD, r.user_id);
    if (approve && r.kind === 'mensual') {
      const u = db.prepare('SELECT plan_until FROM users WHERE id = ?').get(r.user_id);
      const from = Math.max(Date.now(), u.plan_until ? Date.parse(u.plan_until) : 0);
      db.prepare('UPDATE users SET plan_until = ?, plan_name = ?, plan_reminded = NULL WHERE id = ?').run(new Date(from + PLAN_DAYS * 864e5).toISOString(), r.pack_name, r.user_id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(db, admin.id, approve ? 'potenciador_aprobado' : 'potenciador_rechazado', { id, userId: r.user_id, credits: r.credits });
  activity(db, { type: 'potenciador', important: true, userId: r.user_id, text: approve ? `⚡ ¡Tu Potenciador "${r.pack_name}" fue aprobado! Tienes ${r.credits} créditos extra de IA.${r.kind === 'mensual' ? ` Tu plan dura ${PLAN_DAYS} días; te aviso antes de que venza para que lo renueves.` : ''}${clean ? ' Nota: ' + clean : ''}` : `Tu solicitud de Potenciador "${r.pack_name}" no fue aprobada.${clean ? ' Motivo: ' + clean : ' Habla con el administrador.'}` });
  return { ok: true };
}

/** Regalo o ajuste manual del administrador (por ejemplo, devolver créditos). */
export function grantCredits(db, admin, userId, credits) {
  const n = Math.round(Number(credits));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 100000) throw new Error('Pon una cantidad de créditos válida.');
  db.prepare('UPDATE users SET ai_extra_usd = MAX(0, ai_extra_usd + ?) WHERE id = ?').run(n * CREDIT_USD, userId);
  audit(db, admin.id, 'potenciador_ajuste', { userId, credits: n });
  activity(db, { type: 'potenciador', important: true, userId, text: n > 0 ? `⚡ El administrador te regaló ${n} créditos extra de IA.` : `El administrador ajustó tus créditos extra (${n}).` });
  return creditStatus(db, userId);
}

/** Avisa 3 días antes (y el día que vence) para que la persona renueve su plan mensual. */
export function planReminders(db) {
  const soon = new Date(Date.now() + 3 * 864e5).toISOString(), out = [];
  for (const u of db.prepare("SELECT id, plan_until, plan_name, plan_reminded FROM users WHERE plan_until IS NOT NULL AND active = 1").all()) {
    const left = Date.parse(u.plan_until) - Date.now();
    const stage = left <= 0 ? 'vencido' : u.plan_until <= soon ? 'pronto' : null;
    if (!stage || u.plan_reminded === `${u.plan_until}:${stage}`) continue;
    db.prepare('UPDATE users SET plan_reminded = ? WHERE id = ?').run(`${u.plan_until}:${stage}`, u.id);
    activity(db, { type: 'potenciador', important: true, userId: u.id, text: stage === 'pronto'
      ? `⚡ Tu "${u.plan_name}" vence en ${Math.ceil(left / 864e5)} día(s). Para renovarlo, entra a ⚡ Potenciador, paga y sube el comprobante. Tus créditos que sobren no se pierden.`
      : `⚡ Tu "${u.plan_name}" venció. JARVIS sigue funcionando y tus créditos que sobraron siguen ahí; para recibir los del próximo mes, renueva en ⚡ Potenciador.` });
    out.push({ userId: u.id, stage });
  }
  return out;
}

/** Precio del paquete en número (para avisar si lo enviado no coincide). */
export const priceNumber = p => { const n = Number(String(p || '').replace(/,/g, '').match(/[0-9]+(\.[0-9]+)?/)?.[0]); return Number.isFinite(n) ? n : null; };

/** Si una solicitud lleva más de 24 horas esperando, se le recuerda al administrador (una vez). */
export function adminPendingReminder(db) {
  const old = db.prepare("SELECT r.id, COALESCE(u.display_name, u.username) who, r.pack_name FROM credit_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pendiente' AND r.admin_reminded = 0 AND r.created_at <= ?").all(new Date(Date.now() - 24 * 3600e3).toISOString());
  if (!old.length) return 0;
  db.prepare(`UPDATE credit_requests SET admin_reminded = 1 WHERE id IN (${old.map(() => '?').join(',')})`).run(...old.map(r => r.id));
  activity(db, { type: 'potenciador', important: true, userId: adminId(db), text: `⚡ Tienes ${old.length} ${old.length === 1 ? 'solicitud' : 'solicitudes'} de Potenciador esperando más de 24 horas (${old.map(r => r.who).join(', ')}). Revisa tu banco y respóndelas en Potenciador.` });
  return old.length;
}

/** Cuánto te cuesta a ti un paquete en IA (como máximo) y cuánto cobrar con tu margen. 1 crédito = US$0.01 de costo real. */
export function packEconomics(credits, { margin = 2, rate = null } = {}) {
  const costUsd = credits * CREDIT_USD, chargeUsd = costUsd * margin;
  const chargeRd = rate ? Math.ceil(chargeUsd * rate / 5) * 5 : null; // redondeado a múltiplos de RD$5
  return { costUsd: round(costUsd, 2), chargeUsd: round(chargeUsd, 2), chargeRd, profitUsd: round(chargeUsd - costUsd, 2) };
}
