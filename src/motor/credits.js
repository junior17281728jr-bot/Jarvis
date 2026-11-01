// ⚡ Potenciador de IA: cada usuario tiene una base gratis de IA al mes. Si la gasta, JARVIS sigue funcionando
// completo (mapa, recomendaciones, historial); solo las respuestas de la IA esperan al mes siguiente.
// Para seguir usándolas, el usuario paga al administrador (transferencia, etc.), sube el comprobante y el
// administrador aprueba o rechaza. Lo aprobado se suma como "créditos extra" que no vencen.
// 1 crédito = US$0.01 de costo real de IA (el usuario solo ve créditos, nunca proveedores ni precios internos).
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getSetting, setSetting, nowIso, activity, audit } from '../core/db.js';
import { round } from '../core/util.js';

export const CREDIT_USD = 0.01;
export const toCredits = usd => Math.max(0, Math.floor(round(usd / CREDIT_USD, 6)));
const MAX_RECEIPT = 1_500_000;

export const DEFAULT_PACKS = [
  { id: 'p1', name: 'Potenciador básico', price: 'RD$150', credits: 200 },
  { id: 'p2', name: 'Potenciador plus', price: 'RD$300', credits: 500 },
  { id: 'p3', name: 'Potenciador máximo', price: 'RD$500', credits: 1000 },
];
export function creditSettings(db) {
  return { packs: getSetting(db, 'global', 'credits.packs', DEFAULT_PACKS), payInfo: getSetting(db, 'global', 'credits.payInfo', '') };
}
export function saveCreditSettings(db, { packs, payInfo }) {
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').trim().slice(0, max);
  if (packs !== undefined) {
    if (!Array.isArray(packs) || !packs.length || packs.length > 6) throw new Error('Pon entre 1 y 6 paquetes.');
    const out = packs.map((p, i) => {
      const credits = Math.round(Number(p.credits));
      if (!clean(p.name, 40) || !clean(p.price, 20) || !(credits >= 10 && credits <= 100000)) throw new Error(`Revisa el paquete ${i + 1}: nombre, precio y créditos (10 a 100,000).`);
      return { id: `p${i + 1}`, name: clean(p.name, 40), price: clean(p.price, 20), credits };
    });
    setSetting(db, 'global', 'credits.packs', out);
  }
  if (payInfo !== undefined) setSetting(db, 'global', 'credits.payInfo', clean(payInfo, 600));
  return creditSettings(db);
}

const monthStart = () => new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00Z').toISOString();
const nextMonth = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };

/** Cuánto le queda a una persona: base gratis del mes + créditos extra. */
export function creditStatus(db, userId) {
  const u = db.prepare('SELECT ai_monthly_cap_usd m, ai_extra_usd x FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const used = db.prepare('SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE ts >= ? AND user_id = ?').get(monthStart(), userId).c;
  const base = toCredits(u.m), baseUsed = Math.min(base, toCredits(used));
  return { base, baseUsed, baseLeft: Math.max(0, base - baseUsed), extra: toCredits(u.x), resetsAt: nextMonth(), pending: db.prepare("SELECT COUNT(*) n FROM credit_requests WHERE user_id = ? AND status = 'pendiente'").get(userId).n };
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

export function createRequest(db, cfg, user, { packId, receipt, reference, note }) {
  const { packs } = creditSettings(db), pack = packs.find(p => p.id === packId);
  if (!pack) throw new Error('Elige un paquete.');
  if (db.prepare("SELECT COUNT(*) n FROM credit_requests WHERE user_id = ? AND status = 'pendiente'").get(user.id).n >= 3) throw new Error('Ya tienes 3 solicitudes esperando respuesta. Espera a que el administrador las revise.');
  const r = decodeReceipt(receipt);
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
  const info = db.prepare(`INSERT INTO credit_requests (user_id, created_at, pack_name, price, credits, reference, note, receipt_ext, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`).run(user.id, nowIso(), pack.name, pack.price, pack.credits, clean(reference, 60), clean(note, 300), r.ext);
  const id = Number(info.lastInsertRowid), dir = receiptDir(cfg.dbPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, `${id}.${r.ext}`), r.buf, { mode: 0o600 });
  audit(db, user.id, 'potenciador_solicitud', { id, pack: pack.name, credits: pack.credits });
  activity(db, { type: 'potenciador', important: true, userId: adminId(db), text: `⚡ ${user.displayName || user.username} pidió "${pack.name}" (${pack.price}) y subió su comprobante. Revísalo en Potenciador.` });
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
  return db.prepare(`SELECT r.id, r.user_id, r.created_at, r.pack_name, r.price, r.credits, r.reference, r.note, r.status, r.decided_at, r.admin_note,
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
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(db, admin.id, approve ? 'potenciador_aprobado' : 'potenciador_rechazado', { id, userId: r.user_id, credits: r.credits });
  activity(db, { type: 'potenciador', important: true, userId: r.user_id, text: approve ? `⚡ ¡Tu Potenciador "${r.pack_name}" fue aprobado! Tienes ${r.credits} créditos extra de IA.${clean ? ' Nota: ' + clean : ''}` : `Tu solicitud de Potenciador "${r.pack_name}" no fue aprobada.${clean ? ' Motivo: ' + clean : ' Habla con el administrador.'}` });
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
