import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { seal, verifyLedger } from '../src/core/ledger.js';
import { createUser, login, userFromToken } from '../src/core/auth.js';
import { runOnce, backup } from '../src/core/jobs.js';
import { chiSquareP, wilson, benjaminiHochberg, rdTimeToUtc, canonical } from '../src/core/util.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('registro sellado detecta cualquier cambio y no permite borrar', () => {
  const db = openDb(':memory:');
  seal(db, { kind: 'prueba', payload: { a: 1 } });
  seal(db, { kind: 'prueba', payload: { a: 2 } });
  assert.deepEqual(verifyLedger(db), { ok: true, checked: 2 });
  assert.throws(() => db.exec("UPDATE ledger SET payload = '{\"a\":9}' WHERE id = 1"), /no se puede modificar/);
  assert.throws(() => db.exec('DELETE FROM ledger'), /no se puede borrar/);
  // Aun quitando los candados, la cadena delata la alteración
  db.exec('DROP TRIGGER ledger_no_update');
  db.exec("UPDATE ledger SET payload = '{\"a\":9}' WHERE id = 1");
  assert.equal(verifyLedger(db).ok, false);
  assert.equal(verifyLedger(db).brokenAt, 1);
});

test('usuarios: contraseña, sesión y límites de intentos', () => {
  const db = openDb(':memory:');
  assert.throws(() => createUser(db, { username: 'junior', password: 'corta' }), /10 caracteres/);
  createUser(db, { username: 'junior', password: 'una-clave-larga', role: 'admin' });
  assert.throws(() => login(db, 'junior', 'mala-clave-xx'), /incorrectos/);
  const { token, user } = login(db, 'junior', 'una-clave-larga');
  assert.equal(user.role, 'admin');
  assert.equal(userFromToken(db, token).username, 'junior');
  assert.equal(userFromToken(db, 'falso'), null);
});

test('tareas con huella única no se repiten', async () => {
  const db = openDb(':memory:');
  let n = 0;
  await runOnce(db, 'jugar:leidsa:2026-10-30', 'loteria', () => ++n);
  const again = await runOnce(db, 'jugar:leidsa:2026-10-30', 'loteria', () => ++n);
  assert.equal(n, 1);
  assert.equal(again.skipped, true);
});

test('copia de seguridad verificada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jv-'));
  const db = openDb(join(dir, 'x.db'));
  seal(db, { kind: 'prueba', payload: { a: 1 } });
  const b = backup(db, join(dir, 'b'));
  assert.equal(b.verified, true);
  assert.ok(b.bytes > 0);
});

test('estadística básica', () => {
  assert.ok(Math.abs(chiSquareP(3.841, 1) - 0.05) < 0.001);
  assert.ok(Math.abs(chiSquareP(123.225, 99) - 0.05) < 0.002);
  const w = wilson(10, 14);
  assert.ok(w.lo > 0.4 && w.hi < 0.9);
  assert.deepEqual([...benjaminiHochberg([0.001, 0.2, 0.03, 0.9])].sort(), [0]);
  assert.equal(rdTimeToUtc('2026-10-30', 20, 55).toISOString(), '2026-10-31T00:55:00.000Z');
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 0 }] }), '{"a":[2,{"c":0,"d":1}],"b":1}');
});
