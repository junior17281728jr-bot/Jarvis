// 🔑 ¿Se te olvidó la contraseña del administrador? Esto le pone una NUEVA (la vieja no se puede leer: se guarda cifrada).
// Úsalo en la consola de DigitalOcean (botón "Console" de tu servidor), escribiendo:
//
//     sudo -u jarvis node /opt/jarvis/deploy/nueva-clave.mjs
//
// Opcional: el usuario y tu propia clave (10 letras o más):
//     sudo -u jarvis node /opt/jarvis/deploy/nueva-clave.mjs junior MiClaveNueva2026
//
// Cierra las sesiones abiertas de ese usuario y queda anotado en el registro.
import { readFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { openDb, audit } from '../src/core/db.js';
import { hashPassword } from '../src/core/auth.js';

function dbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const env = '/opt/jarvis/.env';
  if (existsSync(env)) { const m = readFileSync(env, 'utf8').match(/^DB_PATH=(.+)$/m); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); }
  return '/var/lib/jarvis/jarvis.db';
}
const WORDS = ['Mango', 'Lluvia', 'Playa', 'Cacao', 'Merengue', 'Palma', 'Brisa', 'Coco', 'Sol', 'Rio', 'Monte', 'Faro', 'Nube', 'Arena', 'Luna', 'Ancla'];
const easy = () => `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${1000 + randomInt(9000)}`;

const [who, mine] = process.argv.slice(2);
const db = openDb(dbPath());
const admins = db.prepare("SELECT id, username, COALESCE(display_name, username) n FROM users WHERE role = 'admin' AND active = 1 ORDER BY id").all();
const u = who ? db.prepare('SELECT id, username, role, COALESCE(display_name, username) n FROM users WHERE lower(username) = lower(?)').get(who) : admins[0];
if (!u) { console.log(`\n❌ No encontré ese usuario. Administradores: ${admins.map(a => a.username).join(', ') || 'ninguno'}\n`); process.exit(1); }
if (mine && mine.length < 10) { console.log('\n❌ La clave debe tener 10 letras o más.\n'); process.exit(1); }
const pw = mine || easy();
db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pw), u.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
try { db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(u.id); } catch { /* versión vieja */ }
audit(db, u.id, 'contrasena_reiniciada_consola', { username: u.username });
db.close();
console.log(`\n✅ Listo. Usuario: ${u.username}\n🔑 Clave nueva: ${pw}\n\nEntra a JARVIS con esa clave y, si quieres, cámbiala en "Mi perfil".\n`);
