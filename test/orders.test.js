import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// Arranca el servidor de verdad (con demo) y prueba: con la bolsa cerrada la orden queda lista y se puede cancelar.
test('órdenes con la bolsa cerrada: quedan listas, se ven y se pueden cancelar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jvo-')), db = join(dir, 'd.db');
  await new Promise((ok, ko) => { const p = spawn(process.execPath, ['--no-warnings', 'src/demo.js', db]); p.on('exit', c => (c ? ko(new Error('demo')) : ok())); });
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, ['--no-warnings', 'src/server.js'], { env: { ...process.env, DB_PATH: db, BACKUP_DIR: join(dir, 'b'), PORT: String(port), HOST: '127.0.0.1' } });
  try {
    await new Promise(ok => srv.stdout.on('data', d => /listo/.test(d) && ok()));
    const base = `http://127.0.0.1:${port}`;
    const lr = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'junior', password: 'demo-jarvis-2026' }) });
    const ck = lr.headers.get('set-cookie').split(';')[0], H = { cookie: ck, 'Content-Type': 'application/json' };
    const acc = await (await fetch(base + '/api/account', { headers: H })).json();
    if (acc.marketOpen) return; // con la bolsa abierta la orden se haría al momento: esta prueba aplica solo cerrada
    const r = await (await fetch(base + '/api/order', { method: 'POST', headers: H, body: JSON.stringify({ symbol: 'MSFT', side: 'buy', usd: 10 }) })).json();
    assert.equal(r.queued, true); assert.ok(r.nextOpen);
    const bad = await fetch(base + '/api/order', { method: 'POST', headers: H, body: JSON.stringify({ symbol: 'MSFT', side: 'buy', usd: 99999 }) });
    assert.equal(bad.status >= 400, true, 'monto fuera de límites se rechaza');
    const pend = await (await fetch(base + '/api/orders/pending', { headers: H })).json();
    assert.equal(pend.length, 1); assert.equal(pend[0].symbol, 'MSFT');
    await fetch(base + `/api/orders/pending/${pend[0].id}/cancel`, { method: 'POST', headers: H });
    assert.equal((await (await fetch(base + '/api/orders/pending', { headers: H })).json()).length, 0);
  } finally { srv.kill(); }
});
