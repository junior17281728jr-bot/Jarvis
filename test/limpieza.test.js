import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { limpiar } from '../src/limpieza.js';

test('borra los datos de JARVIS y conserva solo lo del actualizador y las claves', () => {
  const d = join(mkdtempSync(join(tmpdir(), 't-')), 'jarvis'); mkdirSync(d); mkdirSync(join(d, 'backups'));
  for (const f of ['jarvis.db', 'jarvis.db-wal', 'version.txt', 'update.log', 'secrets.env', 'backups/x.jvbk']) writeFileSync(join(d, f), 'x');
  const r = limpiar(d);
  assert.deepEqual(r.borrados.sort(), ['backups', 'jarvis.db', 'jarvis.db-wal']);
  for (const f of ['version.txt', 'update.log', 'secrets.env']) assert.ok(existsSync(join(d, f)));
});

test('nunca borra una carpeta que no sea de datos de JARVIS', () => {
  const d = mkdtempSync(join(tmpdir(), 'otra-')); writeFileSync(join(d, 'importante.txt'), 'x');
  assert.equal(limpiar(d).omitido, true); assert.ok(existsSync(join(d, 'importante.txt')));
});
