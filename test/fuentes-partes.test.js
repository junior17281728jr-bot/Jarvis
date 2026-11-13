// 0.13.0: las fuentes llegan como UN paquete en partes (fuentes-v1.tar.gz.partNN + fuentes-v1.json) desde un Drive FALSO
// (127.0.0.1). Partes revisadas una por una y el total, gunzip y tar por pedazos; rutas peligrosas y enlaces rechazados.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDePrueba, carpetaTemporal } from './ayuda.js';
import { abrirBase, enTransaccion } from '../src/nucleo/db.js';
import { guardarCarpetaDrive } from '../src/academia/drive-estado.js';
import { sincronizarFuentes, extraerTar, instalarPartes, revisarIndice, nombreDeEntrada, carpetaFuentes, estadoFuentes } from '../src/academia/fuentes.js';
import { TG, LIBRO, WEBP } from './fabrica-base.js';

// Un tar (ustar) armado a mano: [{ nombre, cuerpo, tipo? ('0' archivo, '2' enlace, '5' carpeta) }].
function tar(entradas) {
  const bloques = [];
  for (const e of entradas) {
    const h = Buffer.alloc(512);
    h.write(e.nombre, 0, 100, 'utf8');
    h.write('0000644\0', 100, 'latin1');
    h.write('0000000\0', 108, 'latin1');
    h.write('0000000\0', 116, 'latin1');
    const cuerpo = e.cuerpo ?? Buffer.alloc(0);
    h.write(`${cuerpo.length.toString(8).padStart(11, '0')}\0`, 124, 'latin1');
    h.write('00000000000\0', 136, 'latin1');
    h.write('        ', 148, 'latin1');
    h.write(e.tipo ?? '0', 156, 'latin1');
    if (e.enlace) h.write(e.enlace, 157, 100, 'utf8');
    h.write('ustar\0', 257, 'latin1');
    h.write('00', 263, 'latin1');
    let suma = 0;
    for (const b of h) suma += b;
    h.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
    bloques.push(h, cuerpo, Buffer.alloc((512 - (cuerpo.length % 512)) % 512));
  }
  bloques.push(Buffer.alloc(1024));
  return Buffer.concat(bloques);
}
const sha = b => createHash('sha256').update(b).digest('hex');
const MANIFIESTO = {
  formato: 'fuentes-academia', version: 1, libros: [{ id: 'pp-es', titulo: 'Manual de muestra' }],
  materias: [{ id: 'sistemas', num: 2, nombre: 'Sistemas (muestra)', temas: [{ id: 't01-motor', titulo: 'El motor', tg: ['2-1', '2-2'], lecturas: [{ libro: 'pp-es', archivo: 'libro-pp-es-cap02.txt', desde: 10, hasta: 11 }] }] }],
  imagenes: 'imagenes.json', tg: 'tg.json',
};
function bundle(extra = []) {
  return gzipSync(tar([
    { nombre: 'fuentes-manifiesto.json', cuerpo: Buffer.from(JSON.stringify(MANIFIESTO)) },
    { nombre: 'tg.json', cuerpo: Buffer.from(JSON.stringify({ preguntas: TG })) },
    { nombre: 'imagenes.json', cuerpo: Buffer.from('[]') },
    { nombre: 'libro-pp-es-cap02.txt', cuerpo: Buffer.from(LIBRO) },
    { nombre: 'fig-2.webp', cuerpo: WEBP },
    { nombre: 'oral/', tipo: '5' },
    { nombre: 'oral/oral.json', cuerpo: Buffer.from('{"capitulos":[]}') },
    { nombre: 'notas-del-armador.md', cuerpo: Buffer.from('se salta') },
    ...extra,
  ]));
}
function partir(gz, n = 3) {
  const tam = Math.ceil(gz.length / n);
  const partes = Array.from({ length: n }, (_, i) => gz.subarray(i * tam, (i + 1) * tam)).filter(p => p.length);
  return {
    partes: partes.map((b, i) => ({ archivo: `fuentes-v1.tar.gz.part${String(i + 1).padStart(2, '0')}`, b })),
    indice: { version: 1, partes: partes.map((b, i) => ({ archivo: `fuentes-v1.tar.gz.part${String(i + 1).padStart(2, '0')}`, sha256: sha(b), bytes: b.length })), sha256_total: sha(gz), bytes_total: gz.length },
  };
}

test('el tar: rutas absolutas, con «..», enlaces y archivos de más se rechazan; lo ajeno se salta', async () => {
  assert.equal(nombreDeEntrada('../etc/passwd').mal, true);
  assert.equal(nombreDeEntrada('/etc/passwd').mal, true);
  assert.equal(nombreDeEntrada('oral/../../x').mal, true);
  assert.equal(nombreDeEntrada('C:/x').mal, true);
  assert.equal(nombreDeEntrada('docs/leeme.txt').saltar, true);
  assert.deepEqual(nombreDeEntrada('./tg.json').ruta, 'tg.json');
  const dir = carpetaTemporal('tar');
  const una = async b => extraerTar((async function* () { yield b; })(), join(dir, String(Math.random()).slice(2)));
  assert.equal((await una(tar([{ nombre: '../tg.json', cuerpo: Buffer.from('x') }]))).motivo, 'ruta_no_permitida');
  assert.equal((await una(tar([{ nombre: 'tg.json', tipo: '2', enlace: '/etc/passwd' }]))).motivo, 'tipo_no_permitido');
  assert.equal((await una(tar([{ nombre: 'libro-pp-es-cap02.txt', cuerpo: Buffer.alloc(1024 * 1024 + 1) }]))).motivo, 'archivo_muy_grande');
  assert.equal((await una(tar([{ nombre: 'fig-grande.webp', cuerpo: Buffer.alloc(3 * 1024 * 1024) }]))).ok, true, 'una figura del Test Guide hasta 4 MB');
  const bien = await una(tar([{ nombre: 'tg.json', cuerpo: Buffer.from('{}') }, { nombre: 'otra/cosa.bin', cuerpo: Buffer.from('z') }]));
  assert.deepEqual(bien.archivos, ['tg.json']);
  assert.equal(revisarIndice({ version: 1, partes: [{ archivo: '../x', sha256: 'a'.repeat(64), bytes: 1 }], sha256_total: 'a'.repeat(64), bytes_total: 1 }).ok, false);
});

test('instalar las partes: juntas, gunzip, tar → las fuentes listas; un total distinto no instala nada', async () => {
  const dir = carpetaTemporal('partes');
  const gz = bundle();
  const { partes, indice } = partir(gz);
  mkdirSync(join(dir, 'partes'), { recursive: true });
  for (const p of partes) writeFileSync(join(dir, 'partes', p.archivo), p.b);
  const malo = { ...indice, sha256_total: sha(Buffer.from('otra cosa')) };
  assert.equal((await instalarPartes(dir, malo)).motivo, 'total_distinto');
  assert.ok(!existsSync(join(dir, 'tg.json')), 'nada a su lugar');
  const r = await instalarPartes(dir, indice);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(readFileSync(join(dir, 'libro-pp-es-cap02.txt'), 'utf8'), LIBRO);
  assert.ok(existsSync(join(dir, 'oral', 'oral.json')));
  assert.ok(!existsSync(join(dir, 'notas-del-armador.md')));
});

// Un Drive falso: la carpeta del dueño → «audios» → «fuentes» con las partes y su índice.
async function conDrive(archivos, fn) {
  const carpetas = new Map([['raizDePrueba000001', [{ id: 'audiosDePrueba0001', nombre: 'audios', carpeta: true }]], ['audiosDePrueba0001', [{ id: 'fuentesDePrueba001', nombre: 'fuentes', carpeta: true }]], ['fuentesDePrueba001', []]]);
  const cuerpos = new Map();
  archivos.forEach((a, i) => { const id = `archivoDePrueba${String(i).padStart(3, '0')}`; carpetas.get('fuentesDePrueba001').push({ id, nombre: a.nombre }); cuerpos.set(id, a.cuerpo); });
  const html = entradas => `<html><body>${entradas.map(e => `<div class="flip-entry"><a href="https://drive.google.com/${e.carpeta ? 'drive/folders' : 'file/d'}/${e.id}/view"><div class="flip-entry-title">${e.nombre}</div><div class="flip-entry-last-modified"><div>3:10 PM</div></div></a></div>`).join('')}</body></html>`;
  const servidor = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    if (u.pathname === '/embeddedfolderview' && carpetas.has(id)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html(carpetas.get(id))); }
    if (u.pathname === '/download' && cuerpos.has(id)) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(cuerpos.get(id)); }
    res.writeHead(404); res.end();
  });
  await new Promise(listo => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const config = { ...configDePrueba(), driveBases: { lista: base, bajar: base } };
  const db = abrirBase(config);
  guardarCarpetaDrive(db, 'raizDePrueba000001');
  try { await fn({ db, config }); } finally { db.close(); await new Promise(listo => servidor.close(listo)); }
}
const escribir = db => async trabajo => enTransaccion(db, trabajo);

test('la sincronización baja las partes de Drive, revisa cada una y el total, e instala; una parte dañada no instala nada', async () => {
  const { partes, indice } = partir(bundle());
  await conDrive([{ nombre: 'fuentes-v1.json', cuerpo: Buffer.from(JSON.stringify(indice)) }, ...partes.map(p => ({ nombre: p.archivo, cuerpo: p.b }))], async ({ db, config }) => {
    const r = await sincronizarFuentes(db, config, { escribir: escribir(db) });
    assert.equal(r.ok, true, JSON.stringify(r));
    const e = estadoFuentes(db);
    assert.equal(e.ok, true, JSON.stringify(e.errores));
    assert.deepEqual(e.materias, ['sistemas']);
    assert.equal(e.oral, true);
    assert.equal(e.archivo.instalado, indice.sha256_total);
    assert.ok(existsSync(join(carpetaFuentes(config), 'tg', 'sistemas', 't01-motor.json')));
    // Otra vez: ya instalado, no baja nada.
    assert.equal((await sincronizarFuentes(db, config, { escribir: escribir(db) })).bajados, 0);
  });
  const dañada = partes.map((p, i) => ({ nombre: p.archivo, cuerpo: i === 1 ? Buffer.concat([p.b.subarray(0, -1), Buffer.from([p.b.at(-1) ^ 1])]) : p.b }));
  await conDrive([{ nombre: 'fuentes-v1.json', cuerpo: Buffer.from(JSON.stringify(indice)) }, ...dañada], async ({ db, config }) => {
    const r = await sincronizarFuentes(db, config, { escribir: escribir(db) });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'parte_distinta');
    assert.equal(estadoFuentes(db).archivo.parte, 'fuentes-v1.tar.gz.part02');
    assert.ok(!existsSync(join(carpetaFuentes(config), 'tg.json')));
  });
  // Un paquete con una ruta peligrosa adentro (bien firmado): se rechaza entero.
  const { partes: p2, indice: i2 } = partir(bundle([{ nombre: '../../fuera.txt', cuerpo: Buffer.from('x') }]));
  await conDrive([{ nombre: 'fuentes-v1.json', cuerpo: Buffer.from(JSON.stringify(i2)) }, ...p2.map(p => ({ nombre: p.archivo, cuerpo: p.b }))], async ({ db, config }) => {
    const r = await sincronizarFuentes(db, config, { escribir: escribir(db) });
    assert.equal(r.motivo, 'ruta_no_permitida');
    assert.ok(!existsSync(join(carpetaFuentes(config), 'tg.json')));
  });
});
