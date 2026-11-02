// ☁️ Copia automática en el Google Drive del administrador, sin pagar nada extra.
// Funciona con un pequeño código (Google Apps Script) que el administrador pega UNA vez en su cuenta de Google.
// Cada día JARVIS manda:
//   - JARVIS-memoria.md / .json  → lo que aprendió (texto pequeño; se REEMPLAZA, no ocupa más espacio)
//   - JARVIS-memoria-AAAA-MM.md   → una foto por mes, para ver cómo fue mejorando
//   - jarvis-nucleo-….jvbk         → el núcleo completo, cifrado con tu frase y SIN el historial de precios
//                                    (se vuelve a bajar solo). Se guardan solo las últimas copias.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encryptBuffer } from './offsite.js';
import { nowIso } from './db.js';
import { buildMemory, journalEntry } from './memory.js';
import { listAcceptances } from './legal.js';
import { getSetting, setSetting } from './db.js';

export const DRIVE_KEEP = { diarias: 7, semanas: 8 }; // + una por mes PARA SIEMPRE
export const DRIVE_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
export const newDriveToken = () => randomBytes(18).toString('hex');

/** El código que se pega en script.google.com (lleva la clave para que nadie más pueda escribir en tu Drive). */
export function driveScript(token, keep = DRIVE_KEEP) {
  if (typeof keep === 'number') keep = { diarias: keep, semanas: 0 };
  return `// JARVIS → tu Google Drive. Pega TODO esto sin cambiar nada.
var TOKEN = '${token}';
var CARPETA = 'JARVIS - copias y memoria';
// Qué copias del núcleo se guardan (lo aprendido NUNCA se pierde: cada copia lleva TODO lo acumulado hasta ese día)
var DIARIAS = ${keep.diarias}; // las más nuevas
var SEMANAS = ${keep.semanas}; // una por semana de las últimas semanas
// + la última de CADA MES, para siempre

function doGet() { return out({ ok: true, jarvis: true }); }

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.token !== TOKEN) return out({ ok: false, error: 'La clave del código no coincide.' });
  var f = carpeta();
  if (d.action === 'ultima') {
    var c0 = copias(f);
    if (!c0.length) return out({ ok: false, error: 'Todavía no hay copias del núcleo en tu Drive.' });
    return out({ ok: true, name: c0[0].getName(), data: Utilities.base64Encode(c0[0].getBlob().getBytes()) });
  }
  (d.files || []).forEach(function (x) {
    var dest = x.folder ? sub(f, x.folder) : f;
    var it = dest.getFilesByName(x.name);
    if (x.text != null) {
      if (it.hasNext()) { var old = it.next(); old.setContent(x.append ? old.getBlob().getDataAsString() + x.text : x.text); }
      else dest.createFile(x.name, (x.head || '') + x.text, MimeType.PLAIN_TEXT);
    } else if (x.data && !it.hasNext()) {
      dest.createFile(Utilities.newBlob(Utilities.base64Decode(x.data), x.mime || 'application/octet-stream', x.name));
    }
  });
  var c = copias(f), k = cuales(c), n = 0;
  for (var i = 0; i < c.length; i++) { if (k[i]) n++; else c[i].setTrashed(true); }
  return out({ ok: true, folder: f.getUrl(), used: tam(f), copias: n });
}

function sub(f, name) { var it = f.getFoldersByName(name); return it.hasNext() ? it.next() : f.createFolder(name); }
function carpeta() { var it = DriveApp.getFoldersByName(CARPETA); return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA); }
function copias(f) {
  var a = [], it = f.getFiles();
  while (it.hasNext()) { var x = it.next(); if (/^jarvis-nucleo-.*\\.jvbk$/.test(x.getName()) && !x.isTrashed()) a.push(x); }
  a.sort(function (p, q) { return p.getName() < q.getName() ? 1 : -1; });
  return a;
}
function cuales(c) { // c: de la más nueva a la más vieja
  var k = {}, sem = {}, mes = {}, nsem = 0;
  for (var i = 0; i < c.length; i++) {
    var m = /(\\d{4})(\\d{2})(\\d{2})/.exec(c[i].getName());
    if (!m) { k[i] = true; continue; }
    var w = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 6048e5), mm = m[1] + m[2];
    if (i < DIARIAS) k[i] = true;
    if (!sem[w] && nsem < SEMANAS) { sem[w] = true; nsem++; k[i] = true; }
    if (!mes[mm]) { mes[mm] = true; k[i] = true; }
  }
  return k;
}
function tam(f) {
  var n = 0, a = f.getFiles(), s = f.getFolders();
  while (a.hasNext()) { var y = a.next(); if (!y.isTrashed()) n += y.getSize(); }
  while (s.hasNext()) n += tam(s.next());
  return n;
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
`;
}

/** Copia LIGERA del núcleo: todo lo aprendido, sin lo que se puede volver a bajar (precios) ni sesiones abiertas. */
export function lightCopy(db, cfg) {
  mkdirSync(cfg.backupDir, { recursive: true });
  const tmp = join(cfg.backupDir, `ligera-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  try {
    const c = new DatabaseSync(tmp);
    const old = new Date(Date.now() - 45 * 864e5).toISOString();
    for (const sql of ['DELETE FROM stock_bars', 'DELETE FROM sessions', 'DELETE FROM device_tokens', 'DELETE FROM jobs',
      `DELETE FROM activity WHERE important = 0 AND ts < '${old}'`, `DELETE FROM news WHERE fetched_at < '${old}'`]) { try { c.exec(sql); } catch { /* tabla que no existe */ } }
    // Al restaurar, que vuelva a bajar los precios enseguida
    const lr = c.prepare("SELECT value FROM settings WHERE scope = 'global' AND key = 'motor.lastRun'").get();
    if (lr) { const v = JSON.parse(lr.value); delete v.bolsa_historial; delete v.perfiles; delete v.fundamentales; c.prepare("UPDATE settings SET value = ? WHERE scope = 'global' AND key = 'motor.lastRun'").run(JSON.stringify(v)); }
    c.exec('VACUUM');
    const ok = Object.values(c.prepare('PRAGMA integrity_check').get())[0] === 'ok';
    c.close();
    if (!ok) throw new Error('La copia ligera no pasó la revisión.');
    return readFileSync(tmp);
  } finally { for (const f of [tmp, tmp + '-wal', tmp + '-shm']) if (existsSync(f)) try { unlinkSync(f); } catch { /* nada */ } }
}

async function call(cfg, body, fetchImpl, timeout = 180e3) {
  if (!cfg.driveUrl || !cfg.driveToken) throw new Error('Google Drive no está conectado.');
  let res;
  try {
    res = await fetchImpl(cfg.driveUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: cfg.driveToken, ...body }), signal: AbortSignal.timeout(timeout) });
  } catch (e) { throw new Error(`No pude llegar a tu Google Drive (${e.name === 'TimeoutError' ? 'tardó demasiado' : e.message}).`); }
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error(/<html/i.test(text) ? 'Google respondió con una página en vez del código. Revisa que al publicar elegiste "Cualquier usuario" (Anyone) y que copiaste el enlace que termina en /exec.' : 'Respuesta rara de Google Drive.'); }
  if (!j.ok) throw new Error(j.error || 'Google Drive no aceptó la copia.');
  return j;
}

export const drivePing = (cfg, fetchImpl = fetch) => call(cfg, { action: 'ping', files: [] }, fetchImpl, 60e3);

/** Arma y manda la memoria y (si hay frase) el núcleo ligero cifrado. */
export async function driveBackup(db, cfg, { fetchImpl = fetch, tasks = [], version = null, withCore = true } = {}) {
  const mem = buildMemory(db, { tasks, version });
  const month = nowIso().slice(0, 7), stamp = nowIso().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const files = [
    { name: 'JARVIS-memoria.md', text: mem.md },
    { name: 'JARVIS-memoria.json', text: mem.json },
    { name: `JARVIS-memoria-${month}.md`, text: mem.md },
  ];
  // Bitácora: cada día se AGREGA lo nuevo al final (nunca se reemplaza ni se borra)
  const since = getSetting(db, 'global', 'drive.journalAt', null), year = nowIso().slice(0, 4);
  const entry = journalEntry(db, since);
  files.push({ name: `JARVIS-bitacora-${year}.md`, append: true, head: `# 📓 Bitácora de JARVIS ${year}\n\nCada día se agrega lo que aprendió, lo que cambió y por qué. Nunca se borra nada.\n`, text: entry });
  let core = null;
  if (withCore && cfg.backupPassphrase) {
    const enc = encryptBuffer(lightCopy(db, cfg), cfg.backupPassphrase);
    core = { name: `jarvis-nucleo-${stamp}.jvbk`, bytes: enc.length };
    files.push({ name: core.name, data: enc.toString('base64') });
  }
  const r = await call(cfg, { action: 'guardar', files }, fetchImpl);
  setSetting(db, 'global', 'drive.journalAt', nowIso());
  return { uploaded: true, journalBytes: Buffer.byteLength(entry), memoryBytes: Buffer.byteLength(mem.md) + Buffer.byteLength(mem.json), core, folder: r.folder, used: r.used, copies: r.copias, at: nowIso() };
}

/** Trae la copia del núcleo más nueva que hay en Drive (para restaurar). */
export async function driveLatest(cfg, fetchImpl = fetch) {
  const r = await call(cfg, { action: 'ultima' }, fetchImpl, 300e3);
  return { name: r.name, data: Buffer.from(r.data, 'base64') };
}

// ---------- Firmas, contratos y pagos (prueba legal: se suben solos y NO se rotan ni se borran) ----------
export const LEGAL_FOLDER = 'Firmas, contratos y pagos';
const csvCell = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = rows => rows.length ? '\ufeff' + [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(csvCell).join(','))].join('\n') : '\ufeffsin datos todavía';

export function legalFiles(db, cfg, { maxReceipts = 8 } = {}) {
  const firmas = listAcceptances(db).reverse().map(a => ({ fecha: a.accepted_at, usuario: a.username, documento: a.doc, version: a.version, nombre_completo: a.full_name, cedula_o_pasaporte: a.id_number, ip: a.ip, navegador: a.user_agent, huella_del_texto: a.doc_hash, sello: a.ledger_hash }));
  let pagos = [];
  try {
    pagos = db.prepare(`SELECT r.id, r.created_at, u.username, COALESCE(u.display_name, u.username) persona, r.pack_name, r.price, r.credits, r.amount, r.currency, r.payer_name, r.payer_bank, r.reference, r.note, r.status, r.decided_at, r.admin_note, r.legal_id, r.receipt_ext
      FROM credit_requests r JOIN users u ON u.id = r.user_id ORDER BY r.id`).all();
  } catch { /* sin tabla */ }
  const files = [
    { folder: LEGAL_FOLDER, name: 'firmas.csv', text: toCsv(firmas) },
    { folder: LEGAL_FOLDER, name: 'pagos.csv', text: toCsv(pagos.map(p => ({ solicitud: p.id, fecha: p.created_at, usuario: p.username, persona: p.persona, paquete: p.pack_name, precio: p.price, creditos: p.credits, monto_enviado: p.amount, moneda: p.currency, pago_a_nombre_de: p.payer_name, banco: p.payer_bank, referencia: p.reference, nota: p.note, estado: p.status, decidido: p.decided_at, nota_admin: p.admin_note, firma_del_contrato: p.legal_id, comprobante: `comprobante-${p.id}.${p.receipt_ext}` }))) },
  ];
  // El texto EXACTO de cada versión firmada (la huella del CSV corresponde a este archivo)
  try { for (const d of db.prepare('SELECT hash, doc, version, text FROM legal_docs').all()) files.push({ folder: LEGAL_FOLDER, name: `texto-${d.doc}-${d.version}-${d.hash.slice(0, 10)}.txt`, text: d.text }); } catch { /* nada */ }
  // Fotos de comprobantes que todavía no se han subido
  const sent = new Set(getSetting(db, 'global', 'drive.receipts', [])), dir = join(dirname(cfg.dbPath), 'comprobantes'), newIds = [];
  for (const p of pagos) {
    if (sent.has(p.id) || newIds.length >= maxReceipts) continue;
    const f = join(dir, `${p.id}.${p.receipt_ext}`);
    if (!existsSync(f)) continue;
    files.push({ folder: LEGAL_FOLDER, name: `comprobante-${p.id}.${p.receipt_ext}`, mime: { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[p.receipt_ext], data: readFileSync(f).toString('base64') });
    newIds.push(p.id);
  }
  return { files, newIds, counts: { firmas: firmas.length, pagos: pagos.length } };
}

export async function driveLegal(db, cfg, { fetchImpl = fetch } = {}) {
  const { files, newIds, counts } = legalFiles(db, cfg);
  await call(cfg, { action: 'guardar', files }, fetchImpl);
  if (newIds.length) setSetting(db, 'global', 'drive.receipts', [...getSetting(db, 'global', 'drive.receipts', []), ...newIds]);
  const r = { ok: true, at: nowIso(), ...counts, receipts: newIds.length };
  setSetting(db, 'global', 'drive.legal', r);
  return r;
}

/** Al firmar o al mover un pago: sube lo legal en unos segundos (sin frenar la pantalla). */
let legalTimer = null;
export function queueLegalSync(db, cfg, fetchImpl = fetch) {
  if (!cfg.driveUrl || !cfg.driveToken) return false;
  clearTimeout(legalTimer);
  legalTimer = setTimeout(() => { driveLegal(db, cfg, { fetchImpl }).catch(e => setSetting(db, 'global', 'drive.legal', { ok: false, error: e.message, at: nowIso() })); }, 15e3);
  legalTimer.unref?.();
  return true;
}
