// 0.14.13: el paquete de fuentes en muchas partes (como en el Drive del dueño: la carpeta principal con «1 · Test Guide y
// libro de piloto», «2 · Examen oral (libro oral)» y «fuentes» con fuentes-vN.json + N partes) se baja en VARIOS pasos de
// la fábrica: cada paso tiene su tiempo (quedaMs), las partes bajadas se quedan y el paso siguiente sigue donde quedó,
// sin esperar la hora. Mientras tanto la pantalla dice «Bajando los libros: X de N»; si falla, el motivo exacto.
// Drive FALSO (127.0.0.1), reloj de mentira, sin red, sin esperas. Fuentes sintéticas (nunca material real).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { enTransaccion } from '../src/nucleo/db.js';
import { guardarCarpetaDrive } from '../src/academia/drive-estado.js';
import { carpetaFuentes, estadoFuentes, resumenFuentes } from '../src/academia/fuentes.js';
import { crearFabrica, vistaFabrica, estadoGeneral } from '../src/academia/fabrica.js';
import { materialesQueFaltan } from '../src/academia/ia-hizo.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { preparar, T0 } from './ia-base.js';
import { TG, LIBRO, WEBP } from './fabrica-base.js';

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
// Como el paquete real: una entrada «./» de carpeta y los archivos con «./» delante.
const GZ = gzipSync(tar([
  { nombre: './', tipo: '5' },
  { nombre: './fig-2.webp', cuerpo: WEBP },
  { nombre: './fuentes-manifiesto.json', cuerpo: Buffer.from(JSON.stringify(MANIFIESTO)) },
  { nombre: './tg.json', cuerpo: Buffer.from(JSON.stringify({ preguntas: TG })) },
  { nombre: './imagenes.json', cuerpo: Buffer.from('[]') },
  { nombre: './libro-pp-es-cap02.txt', cuerpo: Buffer.from(LIBRO) },
]), { level: 0 });
const N = 8;
const tam = Math.ceil(GZ.length / N);
const PARTES = Array.from({ length: N }, (_, i) => ({ archivo: `fuentes-v2.tar.gz.part${String(i + 1).padStart(2, '0')}`, b: GZ.subarray(i * tam, (i + 1) * tam) }));
const INDICE = { version: 2, partes: PARTES.map(p => ({ archivo: p.archivo, sha256: sha(p.b), bytes: p.b.length })), sha256_total: sha(GZ), bytes_total: GZ.length };

// Cada parte servida «gasta» 40 s del paso (el reloj del paso es de mentira): en un paso de 170 s caben 4.
async function conDrive(fn, { fallar = () => false, dañar = false } = {}) {
  const id = n => `idDePrueba${String(n).padStart(6, '0')}`;
  const fuentes = [{ id: id(100), nombre: 'fuentes-v2.json' }, ...PARTES.map((p, i) => ({ id: id(101 + i), nombre: p.archivo }))];
  const carpetas = new Map([
    ['raizDePrueba000001', [
      { id: id(1), nombre: '1 · Test Guide y libro de piloto', carpeta: true }, { id: id(2), nombre: '2 · Examen oral (libro oral)', carpeta: true }, { id: id(3), nombre: 'fuentes', carpeta: true },
      { id: id(10), nombre: 'paquete-materia-01-muestra-v1.json' }, { id: id(11), nombre: 'libro-p10-1.webp' }]],
    [id(1), [{ id: id(20), nombre: 'tg-p018.webp' }]], [id(2), [{ id: id(21), nombre: 'oral-muestra.jpg' }]], [id(3), fuentes]]);
  const cuerpos = new Map([[id(100), Buffer.from(JSON.stringify(INDICE))], ...PARTES.map((p, i) => [id(101 + i), p.b])]);
  const reloj = { restante: 170_000 };
  const pedidas = [];
  const html = entradas => `<html><body>${entradas.map(e => `<div class="flip-entry"><a href="https://drive.google.com/${e.carpeta ? 'drive/folders' : 'file/d'}/${e.id}/view"><div class="flip-entry-title">${e.nombre}</div></a></div>`).join('')}</body></html>`;
  const servidor = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const q = u.searchParams.get('id');
    if (u.pathname === '/embeddedfolderview' && carpetas.has(q)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html(carpetas.get(q))); }
    if (u.pathname === '/download' && cuerpos.has(q)) {
      const nombre = fuentes.find(f => f.id === q).nombre;
      pedidas.push(nombre);
      if (nombre !== 'fuentes-v2.json') reloj.restante -= 40_000;
      if (fallar(nombre, pedidas)) { res.writeHead(503); return res.end(); }
      const cuerpo = dañar && nombre.endsWith('part03') ? Buffer.concat([cuerpos.get(q).subarray(0, -1), Buffer.from([cuerpos.get(q).at(-1) ^ 1])]) : cuerpos.get(q);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(cuerpo);
    }
    res.writeHead(404); res.end();
  });
  await new Promise(listo => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const b = preparar({ ahora: T0 });
  const config = { ...b.config, driveBases: { lista: base, bajar: base } };
  const { db } = b;
  guardarCarpetaDrive(db, 'raizDePrueba000001');
  let ahoraMs = T0;
  const escribir = async trabajo => enTransaccion(db, trabajo);
  const paso = crearFabrica({ reloj: () => ahoraMs });
  // Una tarea de la fábrica: pasos seguidos (cada uno con su tiempo nuevo) hasta que termina o hasta «max».
  const correr = async ({ max = 12, alPaso = () => {} } = {}) => {
    const tarea = { id: 7, punto: null };
    const salidas = [];
    for (let i = 0; i < max; i++) {
      reloj.restante = 170_000;
      const ia = crearClienteIA({ db, config, escritor: { escribir }, reloj: () => ahoraMs, registro: { error() {} } });
      const r = await paso({ db, config, tarea, escribir, ia, senal: new AbortController().signal, quedaMs: () => reloj.restante });
      salidas.push(r);
      alPaso(r, i);
      ahoraMs += 1000 + (r.esperarMs ?? 0);
      if (r.listo) break;
      tarea.punto = r.punto;
    }
    return salidas;
  };
  try { await fn({ db, config, correr, pedidas }); } finally { db.close(); await new Promise(listo => servidor.close(listo)); }
}

test('las partes se bajan en varios pasos seguidos (sin esperar la hora), se siguen donde quedaron y se instalan', async () => {
  await conDrive(async ({ db, config, correr, pedidas }) => {
    const vistos = [];
    await correr({ alPaso: () => { const v = vistaFabrica(db, config, T0); vistos.push(v.fuentes?.resumen ?? null); } });
    const e = estadoFuentes(db);
    assert.equal(e?.ok, true, `las fuentes quedan instaladas: ${JSON.stringify(e)}`);
    assert.deepEqual(e.materias, ['sistemas']);
    assert.ok(existsSync(join(carpetaFuentes(config), 'tg', 'sistemas', 't01-motor.json')));
    // Cada parte se bajó UNA sola vez (lo bajado se quedó entre pasos).
    const partes = pedidas.filter(n => n !== 'fuentes-v2.json');
    assert.equal(partes.length, N);
    assert.equal(new Set(partes).size, N);
    // Mientras tanto, la pantalla dijo cuántas van.
    assert.deepEqual(vistos[0], { estado: 'bajando', hechas: 4, total: N, motivo: 'parcial' });
    assert.equal(vistos.find(x => x?.estado === 'bajando' && x.hechas === N)?.motivo, 'instalando');
    assert.equal(vistos.at(-1).estado, 'listas');
    assert.equal(estadoGeneral(db).sync.parcial, false);
  });
});

test('un corte pasajero de Drive no pierde lo bajado; un fallo de verdad dice el motivo exacto', async () => {
  await conDrive(async ({ db, config, correr }) => {
    const s = await correr({ max: 1 });
    assert.equal(s[0].listo, undefined, 'la tarea sigue viva');
    assert.deepEqual(resumenFuentes(estadoFuentes(db)), { estado: 'bajando', hechas: 2, total: N, motivo: 'no_responde' });
    assert.deepEqual(materialesQueFaltan(db, config)[0], { clave: 'fuentes_bajando', hechas: 2, total: N });
    await correr();
    assert.equal(estadoFuentes(db)?.ok, true);
  }, { fallar: (nombre, pedidas) => nombre.endsWith('part03') && pedidas.filter(x => x === nombre).length === 1 });
  // Una parte que no coincide con su huella (siempre): fallo, con su motivo en palabras para la pantalla.
  await conDrive(async ({ db, config, correr }) => {
    const s = await correr();
    assert.equal(s.at(-1).listo, true);
    const r = vistaFabrica(db, config, T0).fuentes.resumen;
    assert.equal(r.estado, 'fallo');
    assert.equal(r.motivo, 'parte_distinta');
    assert.deepEqual(materialesQueFaltan(db, config)[0], { clave: 'fuentes_fallo', motivo: 'parte_distinta' });
  }, { fallar: () => false, dañar: true });
});
