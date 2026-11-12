// Pruebas de la 0.12.1: un archivo del paquete se guarda y se baja UNA vez aunque lo nombren varias versiones (el disco del
// servidor es chico). Por su sha256 o, si el paquete no lo dice, por ser el mismo archivo de Drive con la misma fecha; los
// de versiones de antes se indexan; nunca se borra nada y cada versión lo sirve igual. Un Drive FALSO en 127.0.0.1.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { statSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { crearServidor } from '../src/app.js';
import { abrirBase, enTransaccion } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { crearSincronizador } from '../src/academia/sincronizar.js';
import { importarEntrante } from '../src/academia/importador.js';
import { guardarCarpetaDrive, leerRevisiones } from '../src/academia/drive-estado.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const RAIZ = 'carpetaRaizAlmacen01';
const sha = b => createHash('sha256').update(b).digest('hex');
function mp4(n) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (i * 13 + 5) % 251;
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12)]).copy(b, 0);
  return b;
}
const VIDEO = mp4(300_000);
function paquete(edicion, { conSha = false } = {}) {
  const p = paqueteMuestra();
  p.edicion = edicion;
  p.materias[0].video = { mp4: { archivo: 'video-materia-01.mp4', duracion_s: 20, ...(conSha ? { sha256: sha(VIDEO) } : {}) } };
  return p;
}

async function conDrive(fn) {
  const estado = { archivos: new Map(), pedidos: [] };
  const lista = createServer((req, res) => {
    const filas = [...estado.archivos.entries()].map(([id, a]) => `<div class="flip-entry"><a href="https://drive.google.com/file/d/${id}/view"><div class="flip-entry-title">${a.nombre}</div><div class="flip-entry-last-modified"><div>${a.fecha ?? 'Nov 10'}</div></div></a></div>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body>${filas}</body></html>`);
  });
  const bajar = createServer((req, res) => {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    estado.pedidos.push(id);
    const a = estado.archivos.get(id);
    if (!a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': a.tipo, 'Content-Length': a.cuerpo.length });
    res.end(a.cuerpo);
  });
  const abrir = s => new Promise(ok => s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${s.address().port}`)));
  estado.bases = { lista: await abrir(lista), bajar: await abrir(bajar) };
  estado.bajadas = id => estado.pedidos.filter(x => x === id).length;
  try { await fn(estado); } finally { await Promise.all([lista, bajar].map(s => new Promise(ok => s.close(ok)))); }
}
async function revisar(db, config) {
  const paso = crearSincronizador();
  let punto = null;
  for (let i = 0; i < 30; i++) {
    const r = await paso({ db, config, senal: new AbortController().signal, tarea: { id: 1, punto, datos: { origen: 'manual', forzar: true } }, escribir: async t => enTransaccion(db, t), quedaMs: () => 600_000 });
    if (r.listo) return leerRevisiones(db)[0];
    punto = r.punto;
    await importarEntrante(db, config);
  }
  throw new Error('no terminó');
}
const carpetaVersion = (config, db, id) => join(dirname(config.archivoBase), 'academia', 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta);
async function entrar(base, db) {
  const pedir = (ruta, cuerpo, cab = {}) => fetch(`${base}${ruta}`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) });
  const admin = (await pedir('/api/primer-admin', { nombre: 'junior', clave: CLAVE }, { 'Tailscale-User-Login': 'junior@example.com' })).headers.get('set-cookie').split(';')[0];
  crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
  const ana = (await pedir('/api/entrar', { nombre: 'ana', clave: CLAVE })).headers.get('set-cookie').split(';')[0];
  return { admin, ana };
}
const leerVideo = async (base, galleta) => {
  const v = await (await fetch(`${base}/api/academia/video/factores_humanos`, { headers: { 'X-Oportia': '1', Cookie: galleta } })).json();
  return Buffer.from(await (await fetch(`${base}${v.mp4.url}`, { headers: { 'X-Oportia': '1', Cookie: galleta } })).arrayBuffer());
};

test('almacén 0.12.1: una versión nueva del JSON con el mismo video (sin sha256): no se baja otra vez, una sola copia, las dos lo sirven', async () => {
  await conDrive(async drive => {
    const config = { ...configDePrueba(), driveBases: drive.bases };
    const db = abrirBase(config);
    enTransaccion(db, () => guardarCarpetaDrive(db, RAIZ));
    drive.archivos.set('archivoPaqueteAlm001', { nombre: 'paquete-m1.json', cuerpo: Buffer.from(JSON.stringify(paquete('v1'))), tipo: 'application/json' });
    drive.archivos.set('archivoFiguraAlm0001', { nombre: 'figura-m1.png', cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    drive.archivos.set('archivoVideoAlm00001', { nombre: 'video-materia-01.mp4', cuerpo: VIDEO, tipo: 'video/mp4' });
    let r = await revisar(db, config);
    assert.deepEqual(r.errores, []);
    assert.equal(drive.bajadas('archivoVideoAlm00001'), 1);
    assert.equal(drive.bajadas('archivoFiguraAlm0001'), 1);
    // El dueño cambia el JSON (otra versión) y deja el mismo video y la misma figura en Drive.
    drive.archivos.set('archivoPaqueteAlm001', { nombre: 'paquete-m1.json', cuerpo: Buffer.from(JSON.stringify(paquete('v2'))), tipo: 'application/json', fecha: 'Nov 11' });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, []);
    assert.equal(r.nuevos.length, 1);
    assert.equal(drive.bajadas('archivoVideoAlm00001'), 1, 'el video no se bajó otra vez');
    assert.equal(drive.bajadas('archivoFiguraAlm0001'), 1, 'la figura tampoco');
    assert.equal(r.reusados, 2);
    const [v1, v2] = db.prepare('SELECT id FROM academia_paquetes ORDER BY id').all().map(f => f.id);
    const a1 = statSync(join(carpetaVersion(config, db, v1), 'video', 'video-materia-01.mp4'));
    const a2 = statSync(join(carpetaVersion(config, db, v2), 'video', 'video-materia-01.mp4'));
    assert.equal(a1.ino, a2.ino, 'el mismo archivo en el disco (enlace duro): una sola copia');
    assert.equal(a2.size, VIDEO.length);
    // Las dos versiones lo sirven (la nueva en uso; después, la vieja otra vez).
    await conServidor(crearServidor({ db, config }), async base => {
      const { admin, ana } = await entrar(base, db);
      assert.ok((await leerVideo(base, ana)).equals(VIDEO));
      const act = await fetch(`${base}/api/admin/academia/paquetes/${v1}/activar`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(act.status, 200);
      const v = await (await fetch(`${base}/api/academia/video/factores_humanos`, { headers: { 'X-Oportia': '1', Cookie: ana } })).json();
      assert.match(v.mp4.ref, new RegExp(`^${v1}~`));
      assert.ok((await leerVideo(base, ana)).equals(VIDEO));
    });
    // Si en Drive cambia el archivo (otra fecha), sí se baja.
    drive.archivos.set('archivoPaqueteAlm001', { nombre: 'paquete-m1.json', cuerpo: Buffer.from(JSON.stringify(paquete('v3'))), tipo: 'application/json', fecha: 'Nov 12' });
    drive.archivos.set('archivoVideoAlm00001', { nombre: 'video-materia-01.mp4', cuerpo: mp4(200_000), tipo: 'video/mp4', fecha: 'Nov 12' });
    r = await revisar(db, config);
    assert.equal(drive.bajadas('archivoVideoAlm00001'), 2);
    db.close();
  });
});

test('almacén 0.12.1: con sha256 en el paquete se reconoce aunque esté en otro archivo de Drive, y también lo de versiones de antes', async () => {
  await conDrive(async drive => {
    const config = { ...configDePrueba(), driveBases: drive.bases };
    const db = abrirBase(config);
    enTransaccion(db, () => guardarCarpetaDrive(db, RAIZ));
    drive.archivos.set('archivoPaqueteAlm001', { nombre: 'paquete-m1.json', cuerpo: Buffer.from(JSON.stringify(paquete('v1', { conSha: true }))), tipo: 'application/json' });
    drive.archivos.set('archivoFiguraAlm0001', { nombre: 'figura-m1.png', cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    drive.archivos.set('archivoVideoAlm00001', { nombre: 'video-materia-01.mp4', cuerpo: VIDEO, tipo: 'video/mp4' });
    await revisar(db, config);
    assert.equal(drive.bajadas('archivoVideoAlm00001'), 1);
    // Como una versión guardada antes de que existiera el almacén: sin almacén, el archivo solo en su carpeta.
    rmSync(join(dirname(config.archivoBase), 'academia', 'almacen'), { recursive: true, force: true });
    // El dueño subió el video otra vez a Drive (otro id) y otro JSON: por su sha256 no se baja.
    drive.archivos.delete('archivoVideoAlm00001');
    drive.archivos.set('archivoVideoAlm00002', { nombre: 'video-materia-01.mp4', cuerpo: VIDEO, tipo: 'video/mp4' });
    drive.archivos.set('archivoPaqueteAlm001', { nombre: 'paquete-m1.json', cuerpo: Buffer.from(JSON.stringify(paquete('v2', { conSha: true }))), tipo: 'application/json', fecha: 'Nov 11' });
    const r = await revisar(db, config);
    assert.deepEqual(r.errores, []);
    assert.equal(drive.bajadas('archivoVideoAlm00002'), 0, 'reconocido por su sha256 (indexando la versión de antes)');
    assert.ok(existsSync(join(dirname(config.archivoBase), 'academia', 'almacen', sha(VIDEO))));
    // Nunca se borró nada: las dos versiones tienen su archivo.
    for (const f of db.prepare('SELECT id FROM academia_paquetes').all()) assert.ok(readdirSync(join(carpetaVersion(config, db, f.id), 'video')).includes('video-materia-01.mp4'));
    db.close();
  });
});

test('almacén 0.12.1: a mano, con sha256 no se recibe otra vez; sin sha256 se recibe pero se guarda una sola copia', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const { admin } = await entrar(base, db);
    const subirJson = async p => (await (await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(p) })).json()).paquete.id;
    const subir = (id, archivo, cuerpo, tipo) => fetch(`${base}/api/admin/academia/paquetes/${id}/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': tipo }, body: cuerpo }).then(async r => ({ codigo: r.status, datos: await r.json() }));
    const v1 = await subirJson(paquete('v1'));
    assert.equal((await subir(v1, 'video/video-materia-01.mp4', VIDEO, 'video/mp4')).codigo, 201);
    // Otra versión, sin sha256: llega entero, pero en el disco queda una copia (el mismo archivo).
    const v2 = await subirJson(paquete('v2'));
    const r2 = await subir(v2, 'video/video-materia-01.mp4', VIDEO, 'video/mp4');
    assert.equal(r2.codigo, 201);
    const ino = id => statSync(join(carpetaVersion(config, db, id), 'video', 'video-materia-01.mp4')).ino;
    assert.equal(ino(v1), ino(v2));
    // Con sha256: ni hace falta mandarlo (lo que llegue se ignora).
    const v3 = await subirJson(paquete('v3', { conSha: true }));
    const r3 = await subir(v3, 'video/video-materia-01.mp4', Buffer.from('lo que sea'), 'video/mp4');
    assert.equal(r3.codigo, 201);
    assert.equal(r3.datos.reusado, true);
    assert.equal(ino(v3), ino(v1));
    assert.equal(statSync(join(carpetaVersion(config, db, v3), 'video', 'video-materia-01.mp4')).size, VIDEO.length);
  });
  db.close();
});
