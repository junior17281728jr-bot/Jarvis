// Usuarios, contraseñas y sesiones. Cada usuario tiene sus datos privados y su propio tope de IA.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { nowIso, audit } from './db.js';

export function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [, saltHex, keyHex] = stored.split('$');
  const key = scryptSync(pw, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

export function createUser(db, { username, password, role = 'user', dailyCap, monthlyCap, displayName = null }) {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || '')) throw new Error('El usuario debe tener de 3 a 32 letras, números, punto, guion o guion bajo.');
  if (!password || password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  if (!['admin', 'user'].includes(role)) throw new Error('Rol no válido.');
  const name = displayName ? String(displayName).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 30) : null;
  const info = db.prepare(`INSERT INTO users (username, pass_hash, role, created_at, ai_daily_cap_usd, ai_monthly_cap_usd, display_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(username, hashPassword(password), role, nowIso(), dailyCap ?? (role === 'admin' ? 0.5 : 0.1), monthlyCap ?? (role === 'admin' ? 10 : 2), name || null);
  audit(db, null, 'usuario_creado', { username, role });
  return Number(info.lastInsertRowid);
}

const SESSION_DAYS = 30;
const failures = new Map(); // límite de intentos por usuario

export function login(db, username, password) {
  const f = failures.get(username) || { n: 0, until: 0 };
  if (Date.now() < f.until) throw new Error('Demasiados intentos. Espera unos minutos.');
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !checkPassword(password, u.pass_hash) || u.active === 0) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 5 * 60e3; f.n = 0; }
    failures.set(username, f);
    throw new Error('Usuario o contraseña incorrectos.');
  }
  failures.delete(username);
  const token = randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, u.id, nowIso(), exp);
  audit(db, u.id, 'inicio_sesion');
  return { token, user: publicUser(u) };
}

export function userFromToken(db, token) {
  if (!token) return null;
  const r = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`).get(token, nowIso());
  return r ? publicUser(r) : null;
}
export function logout(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
export function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name || u.username, role: u.role, active: u.active !== 0, aiDailyCapUsd: u.ai_daily_cap_usd, aiMonthlyCapUsd: u.ai_monthly_cap_usd };
}
export const countUsers = db => db.prepare('SELECT COUNT(*) n FROM users').get().n;

const checkNew = pw => { if (!pw || pw.length < 10) throw new Error('La contraseña nueva debe tener al menos 10 caracteres.'); };
/** Cambiar tu propia contraseña (pide la actual). Cierra tus otras sesiones. */
export function changeOwnPassword(db, userId, current, next, keepToken = null) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u || !checkPassword(current || '', u.pass_hash)) throw new Error('La contraseña actual no es correcta.');
  checkNew(next);
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(next), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken || '');
  audit(db, userId, 'contrasena_cambiada');
}
/** El administrador pone una contraseña nueva (por si tu amigo la olvidó). Cierra sus sesiones. */
export function resetPassword(db, adminId, userId, next) {
  checkNew(next);
  if (!db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(next), userId).changes) throw new Error('No existe ese usuario.');
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  audit(db, adminId, 'contrasena_reiniciada', { userId });
}
/** Activar o desactivar a un usuario (sus datos se guardan). Nunca deja el sistema sin administrador activo. */
export function setActive(db, adminId, userId, active) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) throw new Error('No existe ese usuario.');
  if (!active && userId === adminId) throw new Error('No puedes desactivarte a ti mismo.');
  if (!active && u.role === 'admin' && db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n <= 1) throw new Error('Debe quedar al menos un administrador activo.');
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, userId);
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  audit(db, adminId, active ? 'usuario_activado' : 'usuario_desactivado', { userId });
}
export function setDisplayName(db, userId, name) {
  const n = String(name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 30);
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(n || null, userId);
  return n;
}
