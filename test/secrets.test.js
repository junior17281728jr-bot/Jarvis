import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveKeys, loadSecrets, keyStatus } from '../src/core/secrets.js';

test('claves desde el celular: se validan, se guardan solo en el servidor (600) y nunca se devuelven', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jv-')), cfg = { dbPath: join(dir, 'jarvis.db'), openaiKey: '', secUserAgent: 'JARVIS personal research contacto@example.com' };
  const key = 'sk-proj-' + 'a'.repeat(40);
  const st = saveKeys(cfg, { OPENAI_API_KEY: key, NTFY_TOPIC: 'jarvis-junior-7f3k9' }).status;
  assert.equal(cfg.openaiKey, key);
  assert.ok(!JSON.stringify(st).includes(key));
  assert.equal(st.find(s => s.name === 'OPENAI_API_KEY').hint, '…aaaa');
  assert.equal(statSync(join(dir, 'secrets.env')).mode & 0o777, 0o600);
  assert.match(readFileSync(join(dir, 'secrets.env'), 'utf8'), /NTFY_TOPIC=jarvis-junior-7f3k9/);
  assert.throws(() => saveKeys(cfg, { OPENAI_API_KEY: 'hola\nOTRA=1' }), /formato/);
  const cfg2 = { dbPath: cfg.dbPath }; assert.equal(loadSecrets(cfg2), 2); assert.equal(cfg2.openaiKey, key);
  saveKeys(cfg, { OPENAI_API_KEY: '' }); assert.equal(cfg.openaiKey, '');
  assert.equal(keyStatus(cfg).find(s => s.name === 'SEC_USER_AGENT').set, false);
});
