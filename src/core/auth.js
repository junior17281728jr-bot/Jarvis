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

export function createUser(db, { username, password, role = 'user', dailyCap, monthlyCap }) {
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username || '')) throw new Error('El usuario debe tener de 3 a 32 letras, números, punto, guion o guion bajo.');
  if (!password || password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  if (!['admin', 'user'].includes(role)) throw new Error('Rol no válido.');
  const info = db.prepare(`INSERT INTO users (username, pass_hash, role, created_at, ai_daily_cap_usd, ai_monthly_cap_usd)
    VALUES (?, ?, ?, ?, ?, ?)`).run(username, hashPassword(password), role, nowIso(), dailyCap ?? (role === 'admin' ? 0.5 : 0.1), monthlyCap ?? (role === 'admin' ? 10 : 2));
  audit(db, null, 'usuario_creado', { username, role });
  return Number(info.lastInsertRowid);
}

const SESSION_DAYS = 30;
const failures = new Map(); // límite de intentos por usuario

export function login(db, username, password) {
  const f = failures.get(username) || { n: 0, until: 0 };
  if (Date.now() < f.until) throw new Error('Demasiados intentos. Espera unos minutos.');
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !checkPassword(password, u.pass_hash)) {
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
  const r = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`).get(token, nowIso());
  return r ? publicUser(r) : null;
}
export function logout(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
export function publicUser(u) {
  return { id: u.id, username: u.username, role: u.role, aiDailyCapUsd: u.ai_daily_cap_usd, aiMonthlyCapUsd: u.ai_monthly_cap_usd };
}
export const countUsers = db => db.prepare('SELECT COUNT(*) n FROM users').get().n;
