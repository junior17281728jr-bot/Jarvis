// Usuarios, contraseñas y sesiones. Cada usuario tiene sus datos privados y su propio tope de IA.
import { scryptSync, randomBytes, timingSafeEqual, randomInt, createHash } from 'node:crypto';
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
  return newSession(db, u, 'inicio_sesion');
}
function newSession(db, u, how) {
  const token = randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, u.id, nowIso(), exp);
  audit(db, u.id, how);
  return { token, user: publicUser(u) };
}

// ---------- 📺 Código para la TV: 4 números + 2 letras, sirve 10 minutos y una sola vez ----------
const TV_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O (se confunden con 1 y 0)
const tvCodes = new Map(); // código -> { userId, expires }
const tvFails = { n: 0, since: 0, until: 0 };
const normCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export function makeTvCode(db, userId) {
  for (const [c, v] of tvCodes) if (v.userId === userId || v.expires < Date.now()) tvCodes.delete(c);
  let code;
  do { code = String(randomInt(0, 10000)).padStart(4, '0') + TV_LETTERS[randomInt(TV_LETTERS.length)] + TV_LETTERS[randomInt(TV_LETTERS.length)]; } while (tvCodes.has(code));
  const expires = Date.now() + 10 * 60e3;
  tvCodes.set(code, { userId, expires });
  audit(db, userId, 'codigo_tv_creado');
  return { code: `${code.slice(0, 4)} ${code.slice(4)}`, expiresAt: new Date(expires).toISOString() };
}
export function loginWithTvCode(db, code) {
  const now = Date.now();
  if (now < tvFails.until) throw new Error('Demasiados códigos equivocados. Espera 10 minutos y pide un código nuevo en tu celular.');
  const c = normCode(code), v = tvCodes.get(c);
  if (!v || v.expires < now) {
    if (now - tvFails.since > 10 * 60e3) { tvFails.n = 0; tvFails.since = now; }
    if (++tvFails.n >= 10) { tvFails.until = now + 10 * 60e3; tvFails.n = 0; }
    throw new Error('Ese código no sirve o ya venció. Pide uno nuevo en tu celular (Mi perfil → Código para la TV).');
  }
  tvCodes.delete(c);
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(v.userId);
  if (!u) throw new Error('Ese usuario está desactivado.');
  return newSession(db, u, 'inicio_sesion_tv');
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
  db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(userId);
  audit(db, userId, 'contrasena_cambiada');
}
/** El administrador pone una contraseña nueva (por si tu amigo la olvidó). Cierra sus sesiones. */
export function resetPassword(db, adminId, userId, next) {
  checkNew(next);
  if (!db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(next), userId).changes) throw new Error('No existe ese usuario.');
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(userId);
  audit(db, adminId, 'contrasena_reiniciada', { userId });
}
/** Activar o desactivar a un usuario (sus datos se guardan). Nunca deja el sistema sin administrador activo. */
export function setActive(db, adminId, userId, active) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) throw new Error('No existe ese usuario.');
  if (!active && userId === adminId) throw new Error('No puedes desactivarte a ti mismo.');
  if (!active && u.role === 'admin' && db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n <= 1) throw new Error('Debe quedar al menos un administrador activo.');
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, userId);
  if (!active) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(userId); }
  audit(db, adminId, active ? 'usuario_activado' : 'usuario_desactivado', { userId });
}
export function setDisplayName(db, userId, name) {
  const n = String(name || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 30);
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(n || null, userId);
  return n;
}

// ---------- Recordar en este equipo: entrar sin escribir la contraseña ----------
// Se guarda solo una huella del código (nunca la contraseña). Dura 180 días; cambiar la contraseña o desactivar la cuenta lo borra.
const DEVICE_DAYS = 180, sha = t => createHash('sha256').update(String(t)).digest('hex');
export function makeDeviceToken(db, userId, ua = '') {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO device_tokens (hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').run(sha(token), userId, nowIso(), new Date(Date.now() + DEVICE_DAYS * 864e5).toISOString(), String(ua).slice(0, 200));
  return token;
}
export function loginWithDevice(db, username, token) {
  const r = db.prepare('SELECT d.hash, u.* FROM device_tokens d JOIN users u ON u.id = d.user_id WHERE d.hash = ? AND d.expires_at > ? AND u.active = 1').get(sha(token), nowIso());
  if (!r || r.username.toLowerCase() !== String(username || '').toLowerCase()) throw new Error('Este equipo ya no recuerda tu contraseña. Escríbela otra vez.');
  db.prepare('UPDATE device_tokens SET last_used = ? WHERE hash = ?').run(nowIso(), r.hash);
  return newSession(db, r, 'inicio_sesion_equipo');
}
export function forgetDevice(db, token) { db.prepare('DELETE FROM device_tokens WHERE hash = ?').run(sha(token)); }
