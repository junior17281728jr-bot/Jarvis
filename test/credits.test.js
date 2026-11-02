import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/core/db.js';
import { createUser, userFromToken, login } from '../src/core/auth.js';
import { budgetCheck } from '../src/ai/providers.js';
import { acceptLegal } from '../src/core/legal.js';
import { createRequest, decideRequest, creditStatus, listRequests, receiptFile, grantCredits } from '../src/motor/credits.js';

const PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]).toString('base64');
const cfg = { dbPath: join(mkdtempSync(join(tmpdir(), 'jv-')), 'j.db'), aiMonthlyCapUsd: 10, aiDailyCapUsd: 1 };
function setup() {
  const db = openDb(':memory:');
  createUser(db, { username: 'junior', password: 'unaclavemuylarga1', role: 'admin' });
  createUser(db, { username: 'ricardo', password: 'otraclavemuylarga', monthlyCap: 0.02, dailyCap: 0.02, displayName: 'Ricardo' });
  const admin = userFromToken(db, login(db, 'junior', 'unaclavemuylarga1').token), user = userFromToken(db, login(db, 'ricardo', 'otraclavemuylarga').token);
  acceptLegal(db, user, { doc: 'contrato', fullName: 'Ricardo Pérez', cedula: '001-1234567-8', agree: true, ip: '1.2.3.4', ua: 'test' });
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
  const { id } = createRequest(db, cfg, user, { packId: 'p1', receipt: PNG, reference: '123', note: 'pagado', payerName: 'Ricardo', payerBank: 'Banco BHD', amount: '150' });
  assert.equal(listRequests(db, { status: 'pendiente' }).length, 1);
  assert.ok(receiptFile(db, cfg, id).buf.length > 0);
  assert.throws(() => createRequest(db, cfg, user, { packId: 'p1', receipt: 'data:image/png;base64,AAAA', payerName: 'R', payerBank: 'Otro', amount: 150 }), /válida/);
  decideRequest(db, admin, id, { approve: true });
  assert.equal(creditStatus(db, user.id).extra, 200);
  assert.equal(budgetCheck(db, cfg, { userId: user.id, estUsd: 0.5 }).ok, true);
  assert.throws(() => decideRequest(db, admin, id, { approve: true }), /ya fue decidida/);
});

test('potenciador: el gasto pasado de la base se descuenta de los créditos extra; rechazar no da créditos', async () => {
  const { db, admin, user } = setup();
  const { id } = createRequest(db, cfg, user, { packId: 'p1', receipt: PNG, payerName: 'R', payerBank: 'Otro', amount: 150 });
  decideRequest(db, admin, id, { approve: false, note: 'no llegó el pago' });
  assert.equal(creditStatus(db, user.id).extra, 0);
  grantCredits(db, admin, user.id, 100);
  const { complete } = await import('../src/ai/providers.js');
  db.prepare("INSERT INTO settings (scope, key, value) VALUES ('global','ai.enabled','{\"openai\":true}') ON CONFLICT DO UPDATE SET value = excluded.value").run();
  const fake = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 20000, completion_tokens: 20000 }, model: 'gpt-4o-mini', data: [{ id: 'gpt-4o-mini' }] }) });
  const r = await complete(db, { ...cfg, openaiKey: 'sk-test', openaiModel: 'gpt-4o-mini' }, { task: 'pregunta', userId: user.id, system: 's', prompt: 'p', prefer: 'paid', only: 'openai', fetchImpl: fake });
  if (r.ok) { const st = creditStatus(db, user.id); assert.ok(st.extra < 100 || st.baseLeft < st.base, 'algo se gastó'); }
});

test('potenciador: cuentas de banco del administrador, datos de quien paga y plan mensual con recordatorio', async () => {
  const { saveCreditSettings, creditSettings, planReminders } = await import('../src/motor/credits.js');
  const { db, admin, user } = setup();
  saveCreditSettings(db, { accounts: [{ bank: 'Banco Popular', type: 'Ahorros', number: '812-345678-9', holder: 'Junior', cedula: '001-1234567-8' }] });
  assert.equal(creditSettings(db).accounts[0].bank, 'Banco Popular');
  assert.throws(() => saveCreditSettings(db, { accounts: [{ bank: 'Banco BHD', number: 'abc', holder: 'J' }] }), /solo lleva números/);
  assert.throws(() => createRequest(db, cfg, user, { packId: 'p3', receipt: PNG, payerBank: 'Banco BHD' }), /a nombre de quién/);
  const { id } = createRequest(db, cfg, user, { packId: 'p3', receipt: PNG, payerName: 'Ricardo P', payerBank: 'Banco BHD', amount: 'RD$400.00' });
  assert.equal(listRequests(db)[0].payer_bank, 'Banco BHD');
  decideRequest(db, admin, id, { approve: true });
  const st = creditStatus(db, user.id);
  assert.equal(st.plan.active, true); assert.ok(st.plan.daysLeft >= 29);
  db.prepare('UPDATE users SET plan_until = ? WHERE id = ?').run(new Date(Date.now() + 2 * 864e5).toISOString(), user.id);
  assert.equal(planReminders(db)[0].stage, 'pronto');
  assert.equal(planReminders(db).length, 0, 'no repite el mismo aviso');
});

test('potenciador: exige la cantidad exacta enviada y recuerda al administrador después de 24 horas', async () => {
  const { adminPendingReminder } = await import('../src/motor/credits.js');
  const { db, user } = setup();
  assert.throws(() => createRequest(db, cfg, user, { packId: 'p1', receipt: PNG, payerName: 'R', payerBank: 'Otro' }), /cantidad exacta/);
  createRequest(db, cfg, user, { packId: 'p1', receipt: PNG, payerName: 'R', payerBank: 'Otro', amount: '1,500.50', currency: 'RD$' });
  assert.equal(listRequests(db)[0].amount, 1500.5);
  assert.equal(adminPendingReminder(db), 0);
  db.exec('DROP TRIGGER credit_requests_lock'); // solo en la prueba: simular que pasaron 25 horas
  db.prepare('UPDATE credit_requests SET created_at = ?').run(new Date(Date.now() - 25 * 3600e3).toISOString());
  assert.equal(adminPendingReminder(db), 1); assert.equal(adminPendingReminder(db), 0);
});

test('contrato: sin firmar no se puede pagar; la firma y el pago no se pueden borrar ni cambiar', async () => {
  const { openDb } = await import('../src/core/db.js');
  const { createUser, login, userFromToken } = await import('../src/core/auth.js');
  const { currentAcceptance, listAcceptances, signedText } = await import('../src/core/legal.js');
  const db = openDb(':memory:');
  createUser(db, { username: 'junior', password: 'unaclavemuylarga1', role: 'admin' });
  createUser(db, { username: 'pedro', password: 'otraclavemuylarga' });
  const u = userFromToken(db, login(db, 'pedro', 'otraclavemuylarga').token);
  assert.throws(() => createRequest(db, cfg, u, { packId: 'p1', receipt: PNG, payerName: 'P', payerBank: 'Otro', amount: 250 }), /firmar el contrato/);
  assert.throws(() => acceptLegal(db, u, { doc: 'contrato', fullName: 'Pedro', cedula: '00112345678', agree: true }), /nombre completo/);
  assert.throws(() => acceptLegal(db, u, { doc: 'contrato', fullName: 'Pedro Gómez', cedula: '123', agree: true }), /cédula/);
  const a = acceptLegal(db, u, { doc: 'contrato', fullName: 'Pedro Gómez', cedula: '001-1234567-8', agree: true, ip: '9.9.9.9', ua: 'iPhone' });
  assert.ok(currentAcceptance(db, u.id, 'contrato'));
  const { id } = createRequest(db, cfg, u, { packId: 'p1', receipt: PNG, payerName: 'Pedro Gómez', payerBank: 'Banco BHD', amount: 250 });
  assert.equal(listRequests(db)[0].legal_id, a.id);
  const row = listAcceptances(db)[0];
  assert.equal(row.id_number, '00112345678'); assert.equal(row.ip, '9.9.9.9');
  assert.match(signedText(db, row.doc_hash).text, /Ley 155-17/);
  assert.throws(() => db.prepare('DELETE FROM legal_acceptances').run(), /no se pueden borrar/);
  assert.throws(() => db.prepare("UPDATE legal_acceptances SET full_name = 'otro'").run(), /no se pueden modificar/);
  assert.throws(() => db.prepare('DELETE FROM credit_requests WHERE id = ?').run(id), /no se pueden borrar/);
  assert.throws(() => db.prepare('UPDATE credit_requests SET amount = 1 WHERE id = ?').run(id), /no se pueden cambiar/);
});
