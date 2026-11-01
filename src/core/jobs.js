// Tareas con huella única: si el servidor se reinicia, nada se ejecuta dos veces.
import { nowIso } from './db.js';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export async function runOnce(db, key, kind, fn) {
  const row = db.prepare('SELECT * FROM jobs WHERE key = ?').get(key);
  if (row && row.status === 'hecho') return { skipped: true, result: row.result ? JSON.parse(row.result) : null };
  const t = nowIso();
  db.prepare(`INSERT INTO jobs (key, kind, status, attempts, created_at, updated_at) VALUES (?, ?, 'corriendo', 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET status = 'corriendo', attempts = attempts + 1, updated_at = excluded.updated_at`).run(key, kind, t, t);
  try {
    const result = await fn();
    db.prepare("UPDATE jobs SET status = 'hecho', result = ?, last_error = NULL, updated_at = ? WHERE key = ?")
      .run(JSON.stringify(result ?? null), nowIso(), key);
    return { skipped: false, result };
  } catch (err) {
    db.prepare("UPDATE jobs SET status = 'error', last_error = ?, updated_at = ? WHERE key = ?").run(String(err.message || err), nowIso(), key);
    throw err;
  }
}

export function recentErrors(db, limit = 10) {
  return db.prepare("SELECT key, kind, last_error, updated_at FROM jobs WHERE status = 'error' ORDER BY updated_at DESC LIMIT ?").all(limit);
}

/** Copia consistente de la base de datos; verifica que la copia abre y está íntegra. Conserva las últimas `keep`. */
export function backup(db, dir, keep = 14) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `jarvis-${nowIso().replace(/[:.]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const copy = new DatabaseSync(file, { readOnly: true });
  const check = copy.prepare('PRAGMA integrity_check').get();
  copy.close();
  const ok = Object.values(check)[0] === 'ok';
  if (!ok) { unlinkSync(file); throw new Error('La copia no pasó la verificación de integridad; se descartó y se conservan las anteriores.'); }
  const files = readdirSync(dir).filter(f => f.startsWith('jarvis-') && f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) unlinkSync(join(dir, f));
  return { file, bytes: statSync(file).size, verified: true };
}
