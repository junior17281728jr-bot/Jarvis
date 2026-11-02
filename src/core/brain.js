// "El núcleo" de JARVIS = su base de datos: experiencia, votos, ideas probadas, monedas, usuarios, firmas y pagos.
// Aquí se descarga como copia cifrada (solo se abre con tu frase) y se restaura en este u otro servidor.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { encryptBuffer, decryptBuffer } from './offsite.js';
import { backup } from './jobs.js';
import { nowIso, audit } from './db.js';

const NEED = ['users', 'ledger', 'predictions', 'strategies', 'coins', 'settings'];

export function brainSummary(db) {
  const n = t => { try { return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { return 0; } };
  return { predictions: n('predictions'), strategies: n('strategies'), experiments: n('experiments'), coins: n('coins'), ledger: n('ledger'), users: n('users'), lottery: n('lottery_plays'), bars: n('stock_bars') };
}

export function exportBrain(db, cfg, passphrase, user) {
  if (String(passphrase || '').length < 10) throw new Error('Pon una frase secreta de 10 o más letras. Guárdala: sin ella la copia no se puede abrir.');
  const b = backup(db, cfg.backupDir);
  const data = encryptBuffer(readFileSync(b.file), passphrase);
  audit(db, user.id, 'nucleo_descargado', { bytes: data.length });
  return { name: `jarvis-nucleo-${nowIso().slice(0, 10)}.jvbk`, data };
}

/** Revisa la copia (frase, integridad, tablas) y deja todo listo para reemplazar el núcleo al reiniciar. */
export function restoreBrain(db, cfg, buf, passphrase, user) {
  let raw;
  try { raw = decryptBuffer(buf, passphrase); } catch { throw new Error('No pude abrir la copia: la frase no es la correcta o el archivo no es una copia de JARVIS.'); }
  const tmp = cfg.dbPath + '.restaurar';
  writeFileSync(tmp, raw);
  let info;
  try {
    const c = new DatabaseSync(tmp, { readOnly: true });
    const ok = Object.values(c.prepare('PRAGMA integrity_check').get())[0] === 'ok';
    const tables = new Set(c.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
    const missing = NEED.filter(t => !tables.has(t));
    const admins = tables.has('users') ? c.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n : 0;
    info = brainSummary(c); c.close();
    if (!ok) throw new Error('La copia está dañada (no pasó la revisión de integridad).');
    if (missing.length) throw new Error(`A la copia le faltan partes del núcleo: ${missing.join(', ')}.`);
    if (!admins) throw new Error('La copia no tiene un administrador activo.');
  } catch (e) { try { unlinkSync(tmp); } catch { /* nada */ } throw e; }
  // Antes de reemplazar, se guarda el núcleo actual por si acaso
  mkdirSync(cfg.backupDir, { recursive: true });
  backup(db, cfg.backupDir);
  audit(db, user.id, 'nucleo_restaurado', info);
  return { ok: true, info, swap: () => {
    db.close();
    for (const ext of ['-wal', '-shm']) if (existsSync(cfg.dbPath + ext)) unlinkSync(cfg.dbPath + ext);
    renameSync(tmp, cfg.dbPath);
  } };
}
export const brainFileInfo = cfg => { try { return { bytes: statSync(cfg.dbPath).size, path: cfg.dbPath, backups: cfg.backupDir }; } catch { return null; } };
