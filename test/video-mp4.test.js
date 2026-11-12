// Pruebas de la 0.12.1: el «Video resumen» editado (mp4) de una materia. El formato (video.mp4), subirlo por la API del
// administrador y bajarlo de Drive (por pedazos al disco, mirando antes el espacio libre), servirlo por partes (Range,
// 206/416, video/mp4, la huella en la dirección, solo con la sesión), dónde quedó cada alumno, «visto» al 90 % y el
// reproductor de escenas de siempre cuando el mp4 no está. Nunca usan internet: un Drive FALSO en 127.0.0.1. Los mp4 son
// «de mentira» (la caja ftyp y bytes que se reconocen por su posición), hechos aquí mismo.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { crearServidor } from '../src/app.js';
import { abrirBase, enTransaccion } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete, videosDe, LIMITES } from '../src/academia/formato.js';
import { esMp4, revisarEspacio } from '../src/academia/paquetes.js';
import { crearSincronizador } from '../src/academia/sincronizar.js';
import { importarEntrante } from '../src/academia/importador.js';
import { guardarCarpetaDrive, leerRevisiones } from '../src/academia/drive-estado.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { posicionMasNueva, inicioDesde, cuentaComoVisto, capituloEn, reloj, velocidadValida, VISTO_DESDE } from '../public/academia-video.js';

const CLAVE = 'una clave bien larga';
const RAIZ = 'carpetaRaizDeVideo001';
const RAIZ_SRC = join(dirname(new URL(import.meta.url).pathname), '..', 'src');

// El byte i de un mp4 de mentira (para comprobar cualquier parte sin tenerlo entero).
const byteEn = i => (i * 7 + 3) % 251;
const CABEZA = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(12)]);
function mp4(n = 4000) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = byteEn(i);
  CABEZA.copy(b, 0);
  return b;
}
// Un mp4 grande que se genera por pedazos (nunca entero en memoria).
function flujoMp4(total, trozo = 256 * 1024) {
  let hecho = 0;
  return new Readable({
    read() {
      if (hecho >= total) return this.push(null);
      const n = Math.min(trozo, total - hecho);
      const b = Buffer.alloc(n);
      for (let i = 0; i < n; i++) b[i] = byteEn(hecho + i);
      if (hecho === 0) CABEZA.copy(b, 0);
      hecho += n;
      this.push(b);
    },
  });
}

function paqueteConVideo({ escenas = true, capitulos = true, portada = true } = {}) {
  const p = paqueteMuestra();
  p.edicion = 'muestra-video';
  p.materias[0].video = {
    titulo: 'Factores humanos en 10 minutos',
    ...(escenas ? { escenas: [{ inicio_s: 0, fin_s: 12, subtitulo: 'Empieza' }] } : {}),
    mp4: {
      archivo: 'video-materia-01.mp4', duracion_s: 20,
      ...(portada ? { portada: 'video-materia-01.jpg' } : {}),
      ...(capitulos ? { capitulos: [{ inicio_s: 0, titulo: 'El pájaro y el piloto' }, { inicio_s: 8, titulo: 'La hipoxia' }, { inicio_s: 15, titulo: 'Resumen' }] } : {}),
    },
  };
  return p;
}
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

async function pedir(base, metodo, ruta, { galleta, datos, cabeceras = {}, cuerpo } = {}) {
  const r = await fetch(`${base}${ruta}`, {
    method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
    body: datos ? JSON.stringify(datos) : cuerpo, ...(cuerpo instanceof Readable ? { duplex: 'half' } : {}),
  });
  const tipo = r.headers.get('content-type') || '';
  return { codigo: r.status, cabeceras: r.headers, tipo, datos: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), galleta: r.headers.get('set-cookie')?.split(';')[0] };
}

async function preparar(base, db) {
  const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
  crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
  const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
  return { admin, ana };
}
async function subirPaquete(base, admin, p) {
  const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
  assert.equal(s.codigo, 201, JSON.stringify(s.datos));
  const id = s.datos.paquete.id;
  await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
  return s.datos;
}

test('video 0.12.1: el formato de video.mp4 (archivo, duración, portada, capítulos) y lo que nombra', () => {
  const bien = revisarPaquete(paqueteConVideo());
  assert.equal(bien.ok, true, JSON.stringify(bien.errores));
  assert.deepEqual(bien.videos.map(v => v.archivo), ['video-materia-01.mp4', 'video-materia-01.jpg']);
  assert.deepEqual(videosDe(paqueteConVideo()).map(v => v.archivo), ['video-materia-01.mp4', 'video-materia-01.jpg']);
  // Solo el mp4 (sin escenas ni audio) también vale; sin portada ni capítulos, también.
  assert.equal(revisarPaquete(paqueteConVideo({ escenas: false, capitulos: false, portada: false })).ok, true);
  // Uno sin video.mp4 sigue igual que antes (y un video sin nada, no).
  assert.deepEqual(revisarPaquete(paqueteMuestra()).videos, []);
  const nada = paqueteMuestra();
  nada.materias[0].video = { titulo: 'x' };
  assert.deepEqual(revisarPaquete(nada).errores, [{ ruta: 'materias[0].video.escenas', motivo: 'falta' }]);
  const casos = [
    [x => { x.archivo = 'video.mov'; }, 'materias[0].video.mp4.archivo', 'archivo_no_valido'],
    [x => { x.archivo = '../x.mp4'; }, 'materias[0].video.mp4.archivo', 'archivo_no_valido'],
    [x => { delete x.duracion_s; }, 'materias[0].video.mp4.duracion_s', 'tiempo_no_valido'],
    [x => { x.duracion_s = -3; }, 'materias[0].video.mp4.duracion_s', 'tiempo_no_valido'],
    [x => { x.portada = 'portada.gif'; }, 'materias[0].video.mp4.portada', 'archivo_no_valido'],
    [x => { x.sha256 = 'abc'; }, 'materias[0].video.mp4.sha256', 'no_valido'],
    [x => { x.capitulos = 'uno'; }, 'materias[0].video.mp4.capitulos', 'no_es_lista'],
    [x => { x.capitulos[1].inicio_s = 0; }, 'materias[0].video.mp4.capitulos[1].inicio_s', 'tiempo_no_valido'],
    [x => { x.capitulos[2].inicio_s = 20; }, 'materias[0].video.mp4.capitulos[2].inicio_s', 'tiempo_no_valido'],
    [x => { x.capitulos[0].titulo = ''; }, 'materias[0].video.mp4.capitulos[0].titulo', 'vacio'],
    [x => { x.capitulos = Array.from({ length: LIMITES.capitulos + 1 }, (_, i) => ({ inicio_s: i / 10, titulo: 'c' })); }, 'materias[0].video.mp4.capitulos', 'no_es_lista'],
  ];
  for (const [cambiar, ruta, motivo] of casos) {
    const p = paqueteConVideo();
    cambiar(p.materias[0].video.mp4);
    const r = revisarPaquete(p);
    assert.equal(r.ok, false, ruta);
    assert.deepEqual(r.errores, [{ ruta, motivo }], ruta);
  }
  assert.equal(revisarPaquete({ ...paqueteConVideo(), materias: [{ ...paqueteConVideo().materias[0], video: { mp4: 'x.mp4' } }] }).errores[0].motivo, 'no_es_objeto');
  // La caja ftyp.
  assert.equal(esMp4(mp4(64)), true);
  assert.equal(esMp4(Buffer.from('ID3 no soy un video')), false);
});

test('video 0.12.1: la lógica del reproductor (seguir donde quedó, visto al 90 %, capítulo actual, m:ss, velocidad)', () => {
  assert.equal(VISTO_DESDE, 0.9);
  assert.equal(posicionMasNueva(null, null), null);
  assert.deepEqual(posicionMasNueva({ s: 10, en: '2026-11-12T10:00:00Z' }, null), { s: 10, en: '2026-11-12T10:00:00Z' });
  assert.deepEqual(posicionMasNueva({ s: 10, en: '2026-11-12T10:00:00Z' }, { s: 99, en: '2026-11-12T11:00:00Z' }).s, 99);
  assert.deepEqual(posicionMasNueva({ s: 10, en: '2026-11-12T12:00:00Z' }, { s: 99, en: '2026-11-12T11:00:00Z' }).s, 10);
  assert.equal(posicionMasNueva({ s: 'x' }, { s: 5, en: 'a' }).s, 5);
  assert.equal(inicioDesde(null, 600), 0);
  assert.equal(inicioDesde({ s: 3 }, 600), 0, 'muy al principio: desde 0');
  assert.equal(inicioDesde({ s: 192.6 }, 600), 189, 'unos segundos antes, para retomar el hilo');
  assert.equal(inicioDesde({ s: 590 }, 600), 0, 'ya casi al final: desde 0');
  assert.equal(cuentaComoVisto(539, 600), false);
  assert.equal(cuentaComoVisto(540, 600), true);
  assert.equal(cuentaComoVisto(10, 0), false);
  const caps = [{ inicio_s: 0 }, { inicio_s: 60 }, { inicio_s: 300 }];
  assert.deepEqual([capituloEn(caps, 0), capituloEn(caps, 59.9), capituloEn(caps, 60), capituloEn(caps, 1000), capituloEn([], 5)], [0, 0, 1, 2, -1]);
  assert.deepEqual([reloj(0), reloj(65.7), reloj(600), reloj(3725)], ['0:00', '1:05', '10:00', '1:02:05']);
  assert.deepEqual([velocidadValida('1.25'), velocidadValida(1.5), velocidadValida(2), velocidadValida(null)], [1.25, 1.5, 1, 1]);
});

test('video 0.12.1: subir el mp4 y su portada, el reproductor de escenas mientras no llega, servirlo por partes y seguir donde quedó', async () => {
  let libre = 10 * 1024 * 1024 * 1024;
  const config = { ...configDePrueba(), espacioLibre: () => libre };
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const { admin, ana } = await preparar(base, db);
    const p = paqueteConVideo();
    const s = await subirPaquete(base, admin, p);
    assert.deepEqual(s.faltanVideo, ['video-materia-01.mp4', 'video-materia-01.jpg']);
    const id = s.paquete.id;

    // Sin el mp4: el reproductor de escenas de siempre (lo de antes no cambia).
    let c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.deepEqual(c.materias[0].video, { escenas: 1, audio: false, duracion: 12, visto: false });
    let v = (await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: ana })).datos;
    assert.equal(v.mp4, null);
    assert.equal(v.escenas.length, 1);
    let a = (await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos;
    assert.deepEqual(a.paquetes[0].faltanVideo, ['video-materia-01.mp4', 'video-materia-01.jpg']);
    assert.equal(a.limites.videoBytes, 150 * 1024 * 1024);

    const subir = (archivo, cuerpo, { tipo = 'video/mp4', galleta = admin, cabeceras = {} } = {}) => pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/video/${archivo}`, { galleta, cabeceras: { 'Content-Type': tipo, ...cabeceras }, cuerpo });
    const VIDEO = mp4(40_000);
    // Solo el administrador; solo lo que el paquete nombra; solo un mp4 de verdad; con su tipo.
    assert.equal((await subir('video-materia-01.mp4', VIDEO, { galleta: ana })).codigo, 403);
    assert.equal((await subir('otro.mp4', VIDEO)).datos.error, 'video_no_esta_en_el_paquete');
    assert.equal((await subir('video-materia-01.mp4', Buffer.from('ID3 esto es un mp3 y no un video'))).datos.error, 'mp4_no_valido');
    assert.equal((await subir('video-materia-01.mp4', VIDEO, { tipo: 'image/png' })).codigo, 415);
    // Sin el doble libre en el disco: 507 con cuánto hace falta y cuánto hay (nada se escribe).
    libre = 50_000;
    const sinLugar = await subir('video-materia-01.mp4', VIDEO);
    assert.equal(sinLugar.codigo, 507);
    assert.deepEqual(sinLugar.datos, { error: 'sin_espacio_disco', necesarioMb: 1, libreMb: 0 });
    const carpetaVideo = join(dirname(config.archivoBase), 'academia', 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta, 'video');
    assert.ok(!readdirSync(carpetaVideo).includes('video-materia-01.mp4'), 'nada terminado');
    libre = 10 * 1024 * 1024 * 1024;
    const r1 = await subir('video-materia-01.mp4', VIDEO);
    assert.equal(r1.codigo, 201, JSON.stringify(r1.datos));
    assert.deepEqual(r1.datos.faltanVideo, ['video-materia-01.jpg']);
    assert.equal((await subir('video-materia-01.mp4', mp4(10))).codigo, 200, 'otra vez: no se pisa');
    assert.equal((await subir('video-materia-01.jpg', Buffer.from('no soy imagen'), { tipo: 'image/jpeg' })).datos.error, 'mp4_no_valido');
    assert.equal((await subir('video-materia-01.jpg', JPG, { tipo: 'image/jpeg' })).codigo, 201);

    // Ya está: el camino y el video lo dicen (con la duración del mp4) y traen la dirección con su huella.
    c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.deepEqual(c.materias[0].video, { escenas: 1, audio: false, mp4: true, duracion: 20, visto: false });
    v = (await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: ana })).datos;
    assert.equal(v.mp4.ref, `${id}~video-materia-01.mp4`);
    assert.match(v.mp4.url, new RegExp(`^/api/academia/videos/${id}~video-materia-01\\.mp4\\?v=[a-z0-9]+-[a-z0-9]+$`));
    assert.match(v.mp4.portada, /^\/api\/academia\/videos\/\d+~video-materia-01\.jpg\?v=/);
    assert.equal(v.mp4.duracion_s, 20);
    assert.deepEqual(v.mp4.capitulos.map(x => x.titulo), ['El pájaro y el piloto', 'La hipoxia', 'Resumen']);
    assert.equal(v.mp4.bytes, undefined);
    assert.equal(v.posicion, null);
    assert.equal(v.escenas.length, 1, 'las escenas siguen ahí (por si el teléfono no puede con el mp4)');

    // Servirlo: solo con la sesión; entero (200) o por partes (206), video/mp4, guardado un año con su ETag.
    const url = v.mp4.url;
    assert.equal((await pedir(base, 'GET', url)).codigo, 401);
    let x = await pedir(base, 'GET', url, { galleta: ana, cabeceras: { Range: 'bytes=0-1' } });
    assert.equal(x.codigo, 206);
    assert.equal(x.cabeceras.get('content-type'), 'video/mp4');
    assert.equal(x.cabeceras.get('content-range'), `bytes 0-1/${VIDEO.length}`);
    assert.equal(x.cabeceras.get('accept-ranges'), 'bytes');
    assert.equal(x.cabeceras.get('cache-control'), 'private, max-age=31536000, immutable');
    assert.ok(x.datos.equals(VIDEO.subarray(0, 2)));
    const etiqueta = x.cabeceras.get('etag');
    assert.match(etiqueta, /^"\d+-[a-z0-9]+-[a-z0-9]+"$/);
    x = await pedir(base, 'GET', url, { galleta: ana, cabeceras: { Range: 'bytes=30000-' } });
    assert.equal(x.codigo, 206);
    assert.ok(x.datos.equals(VIDEO.subarray(30000)));
    x = await pedir(base, 'GET', url, { galleta: ana, cabeceras: { Range: 'bytes=-100' } });
    assert.ok(x.datos.equals(VIDEO.subarray(VIDEO.length - 100)));
    x = await pedir(base, 'GET', url, { galleta: ana, cabeceras: { Range: `bytes=${VIDEO.length}-` } });
    assert.equal(x.codigo, 416);
    assert.equal(x.cabeceras.get('content-range'), `bytes */${VIDEO.length}`);
    x = await pedir(base, 'GET', url, { galleta: ana });
    assert.equal(x.codigo, 200);
    assert.equal(Number(x.cabeceras.get('content-length')), VIDEO.length);
    assert.ok(x.datos.equals(VIDEO));
    x = await pedir(base, 'GET', url, { galleta: ana, cabeceras: { 'If-None-Match': etiqueta } });
    assert.equal(x.codigo, 304);
    x = await pedir(base, 'GET', url, { galleta: ana, cabeceras: { Range: 'bytes=0-9', 'If-Range': '"otra"' } });
    assert.equal(x.codigo, 200, 'If-Range de otra versión: entero');
    x = await pedir(base, 'GET', v.mp4.portada, { galleta: ana });
    assert.equal(x.codigo, 200);
    assert.equal(x.cabeceras.get('content-type'), 'image/jpeg');
    for (const otra of [`${id}~otro.mp4`, `${id}~..%2Fpaquete.json`, `${id}~video-materia-01.mp4x`, '999~video-materia-01.mp4']) {
      assert.equal((await pedir(base, 'GET', `/api/academia/videos/${encodeURIComponent(otra)}`, { galleta: ana })).codigo, 404, otra);
    }

    // Dónde quedó: se guarda por alumno (cada uno el suyo) y vuelve con el video; lo de otro no se ve.
    assert.equal((await pedir(base, 'POST', '/api/academia/video/factores_humanos/posicion', { galleta: ana, datos: { segundos: 'x' } })).codigo, 400);
    assert.equal((await pedir(base, 'POST', '/api/academia/video/factores_humanos/posicion', { datos: { segundos: 3 } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/academia/video/sistemas/posicion', { galleta: ana, datos: { segundos: 3 } })).codigo, 404);
    const g = await pedir(base, 'POST', '/api/academia/video/factores_humanos/posicion', { galleta: ana, datos: { segundos: 12.34 } });
    assert.equal(g.codigo, 200);
    assert.equal(g.datos.posicion.s, 12.3);
    v = (await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: ana })).datos;
    assert.equal(v.posicion.s, 12.3);
    assert.equal((await pedir(base, 'POST', '/api/academia/video/factores_humanos/posicion', { galleta: ana, datos: { segundos: 999 } })).datos.posicion.s, 20, 'nunca después del final');
    assert.equal((await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: admin })).datos.posicion, null);
    // «Visto» por el mismo camino de siempre.
    assert.equal((await pedir(base, 'POST', '/api/academia/video/factores_humanos/visto', { galleta: ana, datos: {} })).codigo, 200);
    c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.equal(c.materias[0].video.visto, true);
  });
  db.close();
});

test('video 0.12.1: sin pasar nunca el archivo entero por la memoria (subirlo y servirlo de 48 MB, por pedazos)', () => {
  // En un proceso hijo con --expose-gc: mide los búferes que quedan VIVOS mientras pasa (entero serían 48 MB).
  const r = spawnSync(process.execPath, ['--no-warnings', '--expose-gc', join(RAIZ_SRC, '..', 'test', 'video-memoria-hijo.mjs')], {
    encoding: 'utf8', timeout: 240_000, env: { PATH: process.env.PATH, OPORTIA_TEST: '1', ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) },
  });
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(m.subida, 201);
  assert.equal(m.bajada, 200);
  assert.equal(m.visto, 48 * 1024 * 1024);
  assert.equal(m.mal, 0);
  assert.ok(m.picoMb < 16, `quedaron vivos ${m.picoMb} MB de búferes`);
  assert.ok(m.maxRssMb < 200, `el proceso usó ${m.maxRssMb} MB`);
  // Y el código que lo hace nunca lee un video entero: por pedazos (createReadStream, pipeline), nunca readFile.
  const api = readFileSync(join(RAIZ_SRC, 'api', 'academia.js'), 'utf8');
  const enviar = api.slice(api.indexOf('export function enviarPorPartes'), api.indexOf('export function registrarRutasAcademia'));
  assert.match(enviar, /pipeline\(createReadStream\(ruta, \{ start: inicio, end: fin/);
  assert.doesNotMatch(enviar, /readFile/);
  const paquetes = readFileSync(join(RAIZ_SRC, 'academia', 'paquetes.js'), 'utf8');
  const subirFn = paquetes.slice(paquetes.indexOf('export async function subirRecurso'), paquetes.indexOf('export const subirFigura'));
  assert.match(subirFn, /await pipeline\(req,/);
  assert.doesNotMatch(subirFn, /readFile|leerCuerpo|Buffer\.concat/);
});

// ---------- Drive ----------
async function conDrive(fn) {
  const estado = { carpetas: new Map(), archivos: new Map(), pedidos: [] };
  const lista = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    if (u.pathname !== '/embeddedfolderview' || !estado.carpetas.has(id)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<html>no</html>'); }
    const filas = estado.carpetas.get(id).map(e => `<div class="flip-entry"><a href="https://drive.google.com/file/d/${e.id}/view"><div class="flip-entry-title">${e.nombre}</div><div class="flip-entry-last-modified"><div>3:10 PM</div></div></a></div>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body><div class="flip-entries">${filas}</div></body></html>`);
  });
  const bajar = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    estado.pedidos.push(id);
    const a = estado.archivos.get(id);
    if (u.pathname !== '/download' || u.searchParams.get('confirm') !== 't' || !a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': a.tipo, ...(a.sinLargo ? {} : { 'Content-Length': a.largo ?? a.cuerpo.length }) });
    if (a.flujo) return a.flujo().pipe(res);
    if (a.sinLargo) { res.write(a.cuerpo); return res.end(); } // por pedazos: sin Content-Length
    res.end(a.cuerpo);
  });
  const abrir = s => new Promise(ok => s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${s.address().port}`)));
  const [bLista, bBajar] = await Promise.all([abrir(lista), abrir(bajar)]);
  estado.bases = { lista: bLista, bajar: bBajar };
  estado.poner = (entrada, archivo) => {
    if (!estado.carpetas.has(RAIZ)) estado.carpetas.set(RAIZ, []);
    estado.carpetas.get(RAIZ).push(entrada);
    estado.archivos.set(entrada.id, archivo);
  };
  try { await fn(estado); } finally { await Promise.all([lista, bajar].map(s => new Promise(ok => s.close(ok)))); }
}
async function revisar(db, config, { quedaMs = 900_000 } = {}) {
  const paso = crearSincronizador();
  let punto = null;
  for (let i = 0; i < 50; i++) {
    const ctx = { db, config, senal: new AbortController().signal, tarea: { id: 1, punto, datos: { origen: 'manual', forzar: true } }, escribir: async trabajo => enTransaccion(db, trabajo), quedaMs: () => quedaMs };
    const r = await paso(ctx);
    if (r.listo) return leerRevisiones(db)[0];
    punto = r.punto;
    await importarEntrante(db, config);
  }
  assert.fail('la revisión no terminó');
}

test('video 0.12.1: Drive baja el mp4 por su nombre (por pedazos, con confirm=t), mira antes el espacio libre y espera tiempo para empezarlo', async () => {
  await conDrive(async drive => {
    let libre = 10 * 1024 * 1024 * 1024;
    const config = { ...configDePrueba(), driveBases: drive.bases, espacioLibre: () => libre };
    const db = abrirBase(config);
    enTransaccion(db, () => guardarCarpetaDrive(db, RAIZ));
    const TOTAL = 6 * 1024 * 1024;
    drive.poner({ id: 'archivoPaqueteVideo1', nombre: 'paquete-materia1.json' }, { cuerpo: Buffer.from(JSON.stringify(paqueteConVideo())), tipo: 'application/json' });
    drive.poner({ id: 'archivoFiguraVideo01', nombre: 'figura-m1.png' }, { cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    drive.poner({ id: 'archivoVideoMp400001', nombre: 'video-materia-01.mp4' }, { flujo: () => flujoMp4(TOTAL, 64 * 1024), largo: TOTAL, tipo: 'video/mp4' });
    drive.poner({ id: 'archivoPortadaVid001', nombre: 'video-materia-01.jpg' }, { cuerpo: JPG, tipo: 'image/jpeg' });

    // Poco tiempo en el paso: lo demás llega, el mp4 queda para la próxima revisión (sin cortarlo a mitad).
    let r = await revisar(db, config, { quedaMs: 300_000 });
    assert.equal(r.parcial, true);
    assert.equal(drive.pedidos.filter(x => x === 'archivoVideoMp400001').length, 0);
    const fila = db.prepare('SELECT * FROM academia_paquetes').get();
    assert.equal(fila.estado, 'listo', 'el video no hace falta para estar lista');
    const carpetaVideo = join(dirname(config.archivoBase), 'academia', 'paquetes', fila.carpeta, 'video');

    // Sin el doble libre: no se escribe nada y la revisión lo dice (para el administrador).
    libre = TOTAL;
    r = await revisar(db, config);
    assert.deepEqual(r.errores.filter(e => e.archivo === 'video-materia-01.mp4'), [{ archivo: 'video-materia-01.mp4', motivo: 'sin_espacio_disco' }]);
    assert.equal(statSync(join(carpetaVideo, 'video-materia-01.mp4.drive.part')).size, 0);

    // Con lugar: llega entero, por pedazos, y el alumno lo ve.
    libre = 10 * 1024 * 1024 * 1024;
    r = await revisar(db, config);
    assert.deepEqual(r.errores, []);
    assert.equal(statSync(join(carpetaVideo, 'video-materia-01.mp4')).size, TOTAL);
    assert.equal(statSync(join(carpetaVideo, 'video-materia-01.jpg')).size, JPG.length);
    await conServidor(crearServidor({ db, config }), async base => {
      const { ana } = await preparar(base, db);
      const v = (await pedir(base, 'GET', '/api/academia/video/factores_humanos', { galleta: ana })).datos;
      assert.ok(v.mp4?.url);
      const x = await pedir(base, 'GET', v.mp4.url, { galleta: ana, cabeceras: { Range: `bytes=${TOTAL - 4}-` } });
      assert.equal(x.codigo, 206);
      assert.ok(x.datos.equals(Buffer.from([0, 1, 2, 3].map(i => byteEn(TOTAL - 4 + i)))));
    });
    db.close();
  });
});

test('video 0.12.1: Drive, un mp4 sin largo usa el tope para medir el espacio, y uno más grande que el tope no entra', async () => {
  await conDrive(async drive => {
    const vistos = [];
    const config = { ...configDePrueba(), driveBases: drive.bases, espacioLibre: () => { vistos.push('medido'); return 200 * 1024 * 1024; } };
    const db = abrirBase(config);
    enTransaccion(db, () => guardarCarpetaDrive(db, RAIZ));
    drive.poner({ id: 'archivoPaqueteVideo1', nombre: 'paquete-materia1.json' }, { cuerpo: Buffer.from(JSON.stringify(paqueteConVideo({ portada: false }))), tipo: 'application/json' });
    drive.poner({ id: 'archivoFiguraVideo01', nombre: 'figura-m1.png' }, { cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    drive.poner({ id: 'archivoVideoMp400001', nombre: 'video-materia-01.mp4' }, { cuerpo: mp4(5000), sinLargo: true, tipo: 'video/mp4' });
    // 200 MB libres < 2 × 150 MB (el tope, porque Drive no dijo cuánto pesa).
    let r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'video-materia-01.mp4', motivo: 'sin_espacio_disco' }], JSON.stringify(r));
    assert.ok(vistos.length >= 1);
    // Drive dice que pesa más que el tope: ni se empieza.
    drive.archivos.set('archivoVideoMp400001', { cuerpo: mp4(5000), largo: LIMITES.videoBytes + 1, tipo: 'video/mp4', flujo: () => Readable.from([]) });
    r = await revisar(db, config);
    assert.deepEqual(r.errores, [{ archivo: 'video-materia-01.mp4', motivo: 'demasiado_grande' }]);
    db.close();
  });
});

test('video 0.12.1: revisarEspacio pide el doble libre y deja pasar si no se puede medir', () => {
  assert.doesNotThrow(() => revisarEspacio('/x', 100, { libre: () => 200 }));
  assert.doesNotThrow(() => revisarEspacio('/x', 100, { libre: () => null }));
  assert.throws(() => revisarEspacio('/x', 100, { libre: () => 199 }), e => e.codigo === 507 && e.clave === 'sin_espacio_disco');
});
