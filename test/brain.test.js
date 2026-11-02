import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.js';
import { createUser } from '../src/core/auth.js';
import { exportBrain, restoreBrain } from '../src/core/brain.js';
import { DatabaseSync } from 'node:sqlite';

test('núcleo: se descarga cifrado, no abre sin la frase y se restaura completo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jvb-')), cfg = { dbPath: join(dir, 'a.db'), backupDir: join(dir, 'copias') };
  const db = openDb(cfg.dbPath);
  createUser(db, { username: 'junior', password: 'unaclavemuylarga1', role: 'admin' });
  db.prepare("INSERT INTO coins (ts, agent, amount, reason) VALUES ('2026-11-01', 'largo', 3, 'prueba')").run();
  assert.throws(() => exportBrain(db, cfg, 'corta', { id: 1 }), /10 o más/);
  const out = exportBrain(db, cfg, 'mi frase muy secreta', { id: 1 });
  assert.ok(!out.data.includes(Buffer.from('prueba')), 'va cifrada');
  const cfg2 = { dbPath: join(dir, 'b.db'), backupDir: join(dir, 'copias2') }, db2 = openDb(cfg2.dbPath);
  assert.throws(() => restoreBrain(db2, cfg2, out.data, 'otra frase cualquiera', { id: 1 }), /frase/);
  const r = restoreBrain(db2, cfg2, out.data, 'mi frase muy secreta', { id: 1 });
  r.swap();
  const back = new DatabaseSync(cfg2.dbPath, { readOnly: true });
  assert.equal(back.prepare("SELECT amount FROM coins WHERE reason = 'prueba'").get().amount, 3);
  back.close(); db.close();
});
