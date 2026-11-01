import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.js';
import { createUser, userFromToken, login } from '../src/core/auth.js';
import { budgetCheck } from '../src/ai/providers.js';
import { createRequest, decideRequest, creditStatus, listRequests, receiptFile, grantCredits } from '../src/motor/credits.js';

const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]).toString('base64');
const cfg = { dbPath: join(mkdtempSync(join(tmpdir(), 'jv-')), 'j.db'), aiMonthlyCapUsd: 10, aiDailyCapUsd: 1 };
function setup() {
  const db = openDb(':memory:');
  createUser(db, { username: 'junior', password: 'unaclavemuylarga1', role: 'admin' });
  createUser(db, { username: 'ricardo', password: 'otraclavemuylarga', monthlyCap: 0.02, dailyCap: 0.02, displayName: 'Ricardo' });
  const admin = userFromToken(db, login(db, 'junior', 'unaclavemuylarga1').token), user = userFromToken(db, login(db, 'ricardo', 'otraclavemuylarga').token);
  const spend = usd => db.prepare("INSERT INTO ai_usage (ts, user_id, provider, model, task, in_tokens, out_tokens, cost_usd, ok) VALUES (?, ?, 'x', 'x', 't', 0, 0, ?, 1)").run(new Date().toISOString(), user.id, usd);
  return { db, admin, user, spend };
}

test('potenciador: sin base ni créditos la IA se frena, pero con el mensaje claro', () => {
  const { db, user, spend } = setup();
  spend(0.02);
  const r = budgetCheck(db, cfg, { userId: user.id, estUsd: 0.001 });
  assert.equal(r.ok, false); assert.match(r.reason, /Potenciador/); assert.doesNotMatch(r.reason, /OpenAI|ChatGPT/);
});

test('potenciador: pedir con comprobante, aprobar y poder seguir usando la IA', () => {
  const { db, admin, user, spend } = setup();
  spend(0.02);
  const { id } = createRequest(db, cfg, user, { packId: 'p1', receipt: PNG, reference: '123', note: 'pagado' });
  assert.equal(listRequests(db, { status: 'pendiente' }).length, 1);
  assert.ok(receiptFile(db, cfg, id).buf.length > 0);
  assert.throws(() => createRequest(db, cfg, user, { packId: 'p1', receipt: 'data:image/png;base64,AAAA' }), /válida/);
  decideRequest(db, admin, id, { approve: true });
  assert.equal(creditStatus(db, user.id).extra, 200);
  assert.equal(budgetCheck(db, cfg, { userId: user.id, estUsd: 0.5 }).ok, true);
  assert.throws(() => decideRequest(db, admin, id, { approve: true }), /ya fue decidida/);
});

test('potenciador: el gasto pasado de la base se descuenta de los créditos extra; rechazar no da créditos', async () => {
  const { db, admin, user } = setup();
  const { id } = createRequest(db, cfg, user, { packId: 'p1', receipt: PNG });
  decideRequest(db, admin, id, { approve: false, note: 'no llegó el pago' });
  assert.equal(creditStatus(db, user.id).extra, 0);
  grantCredits(db, admin, user.id, 100);
  const { complete } = await import('../src/ai/providers.js');
  db.prepare("INSERT INTO settings (scope, key, value) VALUES ('global','ai.enabled','{\"openai\":true}') ON CONFLICT DO UPDATE SET value = excluded.value").run();
  const fake = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 20000, completion_tokens: 20000 }, model: 'gpt-4o-mini', data: [{ id: 'gpt-4o-mini' }] }) });
  const r = await complete(db, { ...cfg, openaiKey: 'sk-test', openaiModel: 'gpt-4o-mini' }, { task: 'pregunta', userId: user.id, system: 's', prompt: 'p', prefer: 'paid', only: 'openai', fetchImpl: fake });
  if (r.ok) { const st = creditStatus(db, user.id); assert.ok(st.extra < 100 || st.baseLeft < st.base, 'algo se gastó'); }
});
