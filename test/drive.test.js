import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { openDb, nowIso } from '../src/core/db.js';
import { createUser } from '../src/core/auth.js';
import { restoreBrain } from '../src/core/brain.js';
import { encryptBuffer, decryptBuffer } from '../src/core/offsite.js';
import { gzipSync } from 'node:zlib';
import { driveScript, driveBackup, driveLatest, driveLegal, lightCopy, drivePing } from '../src/core/drive.js';
import { buildMemory } from '../src/core/memory.js';
import { acceptLegal } from '../src/core/legal.js';
import { saveBars, syntheticBars } from '../src/stocks/market.js';

/** Un Google Drive de mentira que corre el código de Apps Script de verdad. */
function fakeDrive(token) {
  let seq = 0;
  const mkFolder = name => ({ name, files: [], folders: [] });
  const root = mkFolder('root');
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const fileObj = (name, bytes, mime) => { const f = { id: ++seq, name, bytes, mime, trashed: false,
    getName: () => f.name, getSize: () => f.bytes.length, isTrashed: () => f.trashed, setTrashed: t => { f.trashed = t; },
    setContent: t => { f.bytes = Buffer.from(t); }, getBlob: () => ({ getBytes: () => [...f.bytes] }) }; return f; };
  const folderApi = F => ({ F,
    getFilesByName: n => iter(F.files.filter(f => f.name === n && !f.trashed)),
    getFiles: () => iter(F.files), getFolders: () => iter(F.folders.map(folderApi)),
    getFoldersByName: n => iter(F.folders.filter(x => x.name === n).map(folderApi)),
    createFolder: n => { const x = mkFolder(n); F.folders.push(x); return folderApi(x); },
    createFile: (a, b, mime) => { const f = typeof a === 'string' ? fileObj(a, Buffer.from(b), mime) : fileObj(a.name, a.bytes, a.mime); F.files.push(f); return f; },
    getUrl: () => `https://drive.google.com/drive/folders/${F.name}` });
  const ctx = {
    DriveApp: { getFoldersByName: n => folderApi(root).getFoldersByName(n), createFolder: n => folderApi(root).createFolder(n) },
    Utilities: { base64Decode: s => Buffer.from(s, 'base64'), base64Encode: b => Buffer.from(b).toString('base64'), newBlob: (bytes, mime, name) => ({ bytes: Buffer.from(bytes), mime, name }) },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
  };
  vm.createContext(ctx);
  vm.runInContext(driveScript(token, 3), ctx);
  const fetchImpl = async (url, opts) => { const r = ctx.doPost({ postData: { contents: opts.body } }); return { text: async () => r.t }; };
  const folder = () => root.folders.find(f => f.name === 'JARVIS - copias y memoria');
  return { fetchImpl, folder };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'jvd-')), cfg = { dbPath: join(dir, 'a.db'), backupDir: join(dir, 'copias'), driveUrl: 'https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec', driveToken: 'tok123tok123tok123', backupPassphrase: 'mi frase muy secreta' };
  const db = openDb(cfg.dbPath);
  createUser(db, { username: 'junior', password: 'unaclavemuylarga1', role: 'admin' });
  const amigo = { id: createUser(db, { username: 'amigo', password: 'unaclavemuylarga2' }) };
  saveBars(db, 'SPY', { bars: syntheticBars(400), source: 'demo' });
  db.prepare("INSERT INTO coins (ts, agent, amount, reason) VALUES ('2026-11-01', 'largo', 3, 'prueba')").run();
  return { dir, cfg, db, amigo };
}

test('Drive: memoria se reemplaza, el núcleo ligero se rota (quedan 3) y se puede recuperar', async () => {
  const { cfg, db, dir } = setup(), D = fakeDrive(cfg.driveToken);
  await drivePing(cfg, D.fetchImpl);
  await assert.rejects(drivePing({ ...cfg, driveToken: 'otra' }, D.fetchImpl), /clave/);
  for (let i = 0; i < 5; i++) {
    const r = await driveBackup(db, cfg, { fetchImpl: async (u, o) => { const b = JSON.parse(o.body); b.files.forEach(f => { if (f.data) f.name = f.name.replace('.jvbk', `-${i}.jvbk`); }); return D.fetchImpl(u, { ...o, body: JSON.stringify(b) }); } });
    assert.ok(r.core.bytes > 0);
  }
  const live = D.folder().files.filter(f => !f.trashed);
  assert.equal(live.filter(f => /^jarvis-nucleo-/.test(f.name)).length, 3, 'solo se guardan 3 copias');
  assert.equal(live.filter(f => f.name === 'JARVIS-memoria.md').length, 1, 'la memoria se reemplaza, no se duplica');
  const latest = await driveLatest(cfg, D.fetchImpl);
  assert.match(latest.name, /-4\.jvbk$/);
  const cfg2 = { dbPath: join(dir, 'b.db'), backupDir: join(dir, 'c2') }, db2 = openDb(cfg2.dbPath);
  const r = restoreBrain(db2, cfg2, latest.data, cfg.backupPassphrase, { id: 1 });
  assert.equal(r.info.bars, 0, 'la copia ligera no lleva precios (se vuelven a bajar)');
  r.swap();
  const back = new DatabaseSync(cfg2.dbPath, { readOnly: true });
  assert.equal(back.prepare("SELECT amount FROM coins WHERE reason = 'prueba'").get().amount, 3);
  back.close(); db.close();
});

test('Copia ligera + brotli: ocupa menos que la completa y las copias viejas (gzip) se siguen abriendo', () => {
  const { cfg, db } = setup();
  const light = lightCopy(db, cfg);
  const enc = encryptBuffer(light, 'frase de prueba larga');
  assert.equal(enc.subarray(0, 5).toString(), 'JVBK2');
  assert.deepEqual(decryptBuffer(enc, 'frase de prueba larga'), light);
  // Formato viejo (JVBK1 + gzip)
  const { createCipheriv, randomBytes, scryptSync } = awaitImport();
  const salt = randomBytes(16), iv = randomBytes(12), key = scryptSync('vieja frase larga', salt, 32, { N: 16384, r: 8, p: 1 });
  const c = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(gzipSync(Buffer.from('hola'))), c.final()]);
  const old = Buffer.concat([Buffer.from('JVBK1'), salt, iv, c.getAuthTag(), body]);
  assert.equal(decryptBuffer(old, 'vieja frase larga').toString(), 'hola');
  db.close();
});
import * as nodeCrypto from 'node:crypto';
function awaitImport() { return nodeCrypto; }

test('Firmas, contratos, pagos y comprobantes se suben a Drive (una sola vez cada foto)', async () => {
  const { cfg, db, amigo } = setup(), D = fakeDrive(cfg.driveToken);
  acceptLegal(db, { id: amigo.id }, { doc: 'contrato', fullName: 'Pedro Pérez', cedula: '00112345678', agree: true, ip: '1.2.3.4', ua: 'prueba' });
  db.prepare(`INSERT INTO credit_requests (user_id, created_at, pack_name, price, credits, receipt_ext, status, payer_name, payer_bank, kind, amount, currency)
    VALUES (?, ?, 'Básico', 'RD$250', 200, 'png', 'pendiente', 'Pedro Pérez', 'BHD', 'una_vez', 250, 'RD$')`).run(amigo.id, nowIso());
  mkdirSync(join(cfg.dbPath, '..', 'comprobantes'), { recursive: true });
  writeFileSync(join(cfg.dbPath, '..', 'comprobantes', '1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  const r = await driveLegal(db, cfg, { fetchImpl: D.fetchImpl });
  assert.deepEqual([r.firmas, r.pagos, r.receipts], [1, 1, 1]);
  const legal = D.folder().folders.find(f => f.name === 'Firmas, contratos y pagos');
  const names = legal.files.map(f => f.name);
  assert.ok(names.includes('firmas.csv') && names.includes('pagos.csv') && names.includes('comprobante-1.png'));
  assert.ok(names.some(n => /^texto-contrato-/.test(n)), 'guarda el texto exacto firmado');
  assert.match(legal.files.find(f => f.name === 'firmas.csv').bytes.toString(), /00112345678/);
  const r2 = await driveLegal(db, cfg, { fetchImpl: D.fetchImpl });
  assert.equal(r2.receipts, 0, 'la foto no se vuelve a subir');
  assert.equal(legal.files.filter(f => f.name === 'comprobante-1.png').length, 1);
  db.close();
});

test('La memoria no lleva datos personales ni claves', () => {
  const { db, amigo } = setup();
  acceptLegal(db, { id: amigo.id }, { doc: 'terminos', fullName: 'Pedro Pérez', cedula: '00112345678', agree: true });
  const m = buildMemory(db, {});
  for (const bad of ['00112345678', 'Pedro', 'unaclavemuylarga', 'pass_hash']) assert.ok(!m.md.includes(bad) && !m.json.includes(bad), bad);
  assert.match(m.md, /Para la próxima IA/);
  assert.ok(JSON.parse(m.json).principios.length >= 5);
  db.close();
});
