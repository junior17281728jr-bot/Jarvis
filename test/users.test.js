import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, activity } from '../src/core/db.js';
import { createUser, login, userFromToken, changeOwnPassword, resetPassword, setActive } from '../src/core/auth.js';
import { getProfile, saveProfile, personalConv } from '../src/motor/profile.js';
import { sizeFor, baseAmount } from '../src/motor/sizing.js';
import { pushImportant } from '../src/core/notify.js';

test('dos usuarios: cada uno con su estilo, su plazo y sus intereses, sobre el mismo núcleo', () => {
  const db = openDb(':memory:');
  const a = createUser(db, { username: 'junior', password: 'clave-segura-123', role: 'admin', displayName: 'Junior' });
  const b = createUser(db, { username: 'amigo', password: 'clave-segura-456', displayName: 'Ricardo' });
  assert.equal(getProfile(db, b).setup, false);
  saveProfile(db, a, { style: 'arriesgado', horizon: 'largo' });
  saveProfile(db, b, { style: 'conservador', horizon: 'corto', interests: { loterias: false } });
  assert.equal(getProfile(db, b).interests.loterias, false);
  assert.throws(() => saveProfile(db, b, { interests: { empresas: false, fondos: false } }), /al menos/);
  assert.throws(() => saveProfile(db, b, { style: 'loco' }), /no válido/);
  // Montos según estilo con el mismo dinero
  assert.equal(baseAmount('verde', 1000, 'conservador'), 50); assert.equal(baseAmount('verde', 1000, 'arriesgado'), 150);
  // Orden personal: el conservador prefiere la segura; el arriesgado, la de más ganancia
  const segura = { light: 'verde', probBeat: 0.55, projection: { personal: { probable: 0.4, lossChance: 0.1 } }, timing: { immediate: false, recommended: { days: 63 } } };
  const brava = { light: 'verde', probBeat: 0.58, projection: { personal: { probable: 2.0, lossChance: 0.4 } }, timing: { immediate: false, recommended: { days: 252 } } };
  const pa = getProfile(db, a), pb = getProfile(db, b);
  assert.ok(personalConv(segura, pb) > personalConv(brava, pb), 'conservador');
  assert.ok(personalConv(brava, pa) > personalConv(segura, pa), 'arriesgado');
  const strong = { light: 'verde', probMethod: 'calibrado', timing: { recommended: { days: 126 }, h: { 126: { p: 0.75 } } }, projection: { personal: { lossChance: 0.2 } } };
  const ev = { n: 200, hits: 130, hitRate: 0.65, lo: 0.58 };
  assert.equal(sizeFor(strong, { usd: 1000 }, ev, 'conservador').maxUsd, 100);
  assert.equal(sizeFor(strong, { usd: 1000 }, ev, 'arriesgado').maxUsd, 250);
});

test('usuarios: cambiar contraseña, reiniciarla, desactivar y nunca quedarse sin administrador', () => {
  const db = openDb(':memory:');
  const a = createUser(db, { username: 'junior', password: 'clave-segura-123', role: 'admin' });
  const b = createUser(db, { username: 'amigo', password: 'clave-segura-456' });
  const s = login(db, 'amigo', 'clave-segura-456');
  assert.throws(() => changeOwnPassword(db, b, 'mala', 'nueva-clave-789'), /actual/);
  changeOwnPassword(db, b, 'clave-segura-456', 'nueva-clave-789', s.token);
  assert.ok(userFromToken(db, s.token)); // su sesión actual sigue
  assert.throws(() => login(db, 'amigo', 'clave-segura-456'), /incorrectos/);
  resetPassword(db, a, b, 'otra-clave-000');
  assert.equal(userFromToken(db, s.token), null); // se cierran sus sesiones
  setActive(db, a, b, false);
  assert.throws(() => login(db, 'amigo', 'otra-clave-000'), /incorrectos/);
  setActive(db, a, b, true); assert.ok(login(db, 'amigo', 'otra-clave-000').token);
  assert.throws(() => setActive(db, a, a, false), /a ti mismo/);
});

test('los avisos personales van solo a su dueño; los generales, al administrador', async () => {
  const db = openDb(':memory:');
  const a = createUser(db, { username: 'junior', password: 'clave-segura-123', role: 'admin' });
  const b = createUser(db, { username: 'amigo', password: 'clave-segura-456' });
  saveProfile(db, b, { ntfyTopic: 'amigo-secreto-123' });
  activity(db, { type: 'mapa', text: 'General', important: true });
  activity(db, { type: 'alerta', text: 'Dinero real de amigo', important: true, userId: b });
  const sent = [];
  const fetchImpl = async (url, opts) => { sent.push({ url, body: opts.body }); return { ok: true, text: async () => '' }; };
  await pushImportant(db, { ntfyServer: 'https://ntfy.sh', ntfyTopic: 'admin-topic-123' }, fetchImpl);
  const toAdmin = sent.find(x => x.url.endsWith('admin-topic-123')), toFriend = sent.find(x => x.url.endsWith('amigo-secreto-123'));
  assert.match(String(toAdmin.body), /General/); assert.doesNotMatch(String(toAdmin.body), /amigo/);
  assert.match(String(toFriend.body), /Dinero real de amigo/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM activity WHERE user_id IS NULL OR user_id = ?').get(a).n, 1);
});
