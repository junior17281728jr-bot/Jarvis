import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { createUser, makeTvCode, loginWithTvCode, setActive } from '../src/core/auth.js';

test('código de TV: 4 números + 2 letras, entra como esa persona, una sola vez', () => {
  const db = openDb(':memory:');
  createUser(db, { username: 'junior', password: 'unaclavemuylarga1', role: 'admin' });
  const id = createUser(db, { username: 'ricardo', password: 'otraclavemuylarga' });
  const { code } = makeTvCode(db, id);
  assert.match(code, /^\d{4} [A-HJ-NP-Z]{2}$/);
  const r = loginWithTvCode(db, code.toLowerCase().replace(' ', '-'));
  assert.equal(r.user.username, 'ricardo'); assert.ok(r.token.length > 20);
  assert.throws(() => loginWithTvCode(db, code), /no sirve|venció/);
  const second = makeTvCode(db, id), third = makeTvCode(db, id);
  assert.throws(() => loginWithTvCode(db, second.code), /no sirve/, 'pedir otro invalida el anterior');
  setActive(db, 1, id, false);
  assert.throws(() => loginWithTvCode(db, third.code), /desactivado/);
});
