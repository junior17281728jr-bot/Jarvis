// Pruebas de la 0.12.1: el «clip» de una tarjeta (un ejemplo en video corto, mudo y en bucle). El formato, leer del mp4
// cuánto dura, su tamaño y si trae sonido (sin nada de afuera), subirlo (tope, ≤ 8 s, ≤ 720p), que la lección lo traiga solo
// cuando llegó, servirlo por partes solo con la sesión, Drive, y que en la pantalla el clip mande sobre el dibujo. Los mp4
// son «de mentira» (solo las cajas que se leen), hechos aquí mismo.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase, enTransaccion } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete, clipsDe } from '../src/academia/formato.js';
import { datosMp4 } from '../src/academia/mp4.js';
import { crearSincronizador } from '../src/academia/sincronizar.js';
import { importarEntrante } from '../src/academia/importador.js';
import { guardarCarpetaDrive, leerRevisiones } from '../src/academia/drive-estado.js';
import { partirLeccion } from '../public/tarjetas.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Un mp4 mínimo: ftyp + moov (mvhd con la duración, una pista de video con su tamaño y, si se pide, una de sonido).
const caja = (tipo, ...partes) => { const cuerpo = Buffer.concat(partes); const c = Buffer.alloc(8); c.writeUInt32BE(8 + cuerpo.length); c.write(tipo, 4, 'latin1'); return Buffer.concat([c, cuerpo]); };
function mp4Clip({ segundos = 6, ancho = 960, alto = 540, sonido = false, relleno = 2000 } = {}) {
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(Math.round(segundos * 1000), 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(ancho * 65536, 76); tkhd.writeUInt32BE(alto * 65536, 80);
  const hdlr = t => { const h = Buffer.alloc(24); h.write(t, 8, 'latin1'); return caja('hdlr', h); };
  const trakVideo = caja('trak', caja('tkhd', tkhd), caja('mdia', hdlr('vide')));
  const trakSonido = caja('trak', caja('tkhd', Buffer.alloc(84)), caja('mdia', hdlr('soun')));
  return Buffer.concat([caja('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1')), caja('moov', caja('mvhd', mvhd), trakVideo, ...(sonido ? [trakSonido] : [])), caja('mdat', Buffer.alloc(relleno, 9))]);
}
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 3)]);

function paqueteConClip() {
  const p = paqueteMuestra();
  p.edicion = 'muestra-clip';
  p.materias[0].temas[0].secciones.push({
    tipo: 'tarjeta', titulo: 'El motor en marcha', puntos: ['Así suena y se ve un motor encendido.'],
    visual: { tipo: 'motor', parametros: {} },
    clip: { archivo: 'clip-motor.mp4', poster: 'clip-motor.jpg', alt: 'Un motor de avioneta encendido, visto de cerca.' },
    fuentes: [{ libro: 'muestra', capitulo: 'Capítulo de muestra', seccion: 'Muestra', pagina: '1' }],
  });
  return p;
}
async function pedir(base, metodo, ruta, { galleta, datos, cabeceras = {}, cuerpo } = {}) {
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : cuerpo });
  const tipo = r.headers.get('content-type') || '';
  return { codigo: r.status, cabeceras: r.headers, datos: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), galleta: r.headers.get('set-cookie')?.split(';')[0] };
}

test('clip 0.12.1: el formato (archivo, poster, alt) y lo que nombra el paquete', () => {
  const r = revisarPaquete(paqueteConClip());
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.clips.map(c => c.archivo), ['clip-motor.mp4', 'clip-motor.jpg']);
  assert.deepEqual(clipsDe(paqueteConClip()).map(c => c.archivo), ['clip-motor.mp4', 'clip-motor.jpg']);
  const casos = [
    [c => { c.archivo = 'clip.mov'; }, 'archivo', 'archivo_no_valido'],
    [c => { c.poster = 'p.gif'; }, 'poster', 'archivo_no_valido'],
    [c => { delete c.alt; }, 'alt', 'falta'],
    [c => { c.sha256 = 'x'; }, 'sha256', 'no_valido'],
  ];
  for (const [cambiar, campo, motivo] of casos) {
    const p = paqueteConClip();
    cambiar(p.materias[0].temas[0].secciones.at(-1).clip);
    const x = revisarPaquete(p);
    assert.deepEqual(x.errores, [{ ruta: `materias[0].temas[0].secciones[${p.materias[0].temas[0].secciones.length - 1}].clip.${campo}`, motivo }], campo);
  }
});

test('clip 0.12.1: del mp4 se lee la duración, el tamaño y si trae sonido (sin nada de afuera; lo raro es null)', () => {
  assert.deepEqual(datosMp4(mp4Clip()), { duracion_s: 6, ancho: 960, alto: 540, audio: false });
  assert.deepEqual(datosMp4(mp4Clip({ segundos: 7.5, ancho: 1280, alto: 720, sonido: true })), { duracion_s: 7.5, ancho: 1280, alto: 720, audio: true });
  assert.equal(datosMp4(Buffer.from('no soy un video')), null);
  assert.equal(datosMp4(mp4Clip().subarray(0, 40)), null);
});

test('clip 0.12.1: subirlo (≤ 8 s, ≤ 720p, ≤ 600 KB), la lección lo trae solo cuando llegó, por partes y solo con la sesión', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const p = paqueteConClip();
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
    assert.equal(s.codigo, 201);
    assert.deepEqual(s.datos.faltanClips, ['clip-motor.mp4', 'clip-motor.jpg']);
    const id = s.datos.paquete.id;
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} });
    const tema = p.materias[0].temas[0].id;
    const tarjeta = async () => (await pedir(base, 'GET', `/api/academia/temas/factores_humanos/${tema}`, { galleta: ana })).datos.secciones.at(-1);
    // Sin el clip: el dibujo de siempre.
    let x = await tarjeta();
    assert.equal(x.clip, null);
    assert.equal(x.visual.tipo, 'motor');
    const subir = (archivo, cuerpo, tipo = 'video/mp4', galleta = admin) => pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/clips/${archivo}`, { galleta, cabeceras: { 'Content-Type': tipo }, cuerpo });
    assert.equal((await subir('clip-motor.mp4', mp4Clip(), 'video/mp4', ana)).codigo, 403);
    assert.equal((await subir('otro.mp4', mp4Clip())).datos.error, 'clip_no_esta_en_el_paquete');
    assert.equal((await subir('clip-motor.mp4', Buffer.from('ID3 un mp3'))).datos.error, 'clip_no_valido');
    assert.equal((await subir('clip-motor.mp4', mp4Clip({ segundos: 9 }))).datos.error, 'clip_muy_largo');
    assert.equal((await subir('clip-motor.mp4', mp4Clip({ ancho: 1920, alto: 1080 }))).datos.error, 'clip_muy_grande');
    assert.equal((await subir('clip-motor.mp4', mp4Clip({ relleno: 620 * 1024 }))).codigo, 413);
    const CLIP = mp4Clip({ sonido: true, relleno: 30_000 });
    const r = await subir('clip-motor.mp4', CLIP);
    assert.equal(r.codigo, 201, JSON.stringify(r.datos));
    assert.deepEqual(r.datos.faltanClips, ['clip-motor.jpg']);
    assert.equal((await subir('clip-motor.jpg', JPG, 'image/jpeg')).codigo, 201);
    x = await tarjeta();
    assert.match(x.clip.url, new RegExp(`^/api/academia/clips/${id}~clip-motor\\.mp4\\?v=`));
    assert.match(x.clip.poster, /clip-motor\.jpg\?v=/);
    assert.equal(x.clip.alt, 'Un motor de avioneta encendido, visto de cerca.');
    assert.equal(x.clip.sonido, true);
    assert.equal(x.visual.tipo, 'motor', 'el dibujo sigue (la pantalla elige el clip)');
    // Servirlo.
    assert.equal((await pedir(base, 'GET', x.clip.url)).codigo, 401);
    let y = await pedir(base, 'GET', x.clip.url, { galleta: ana, cabeceras: { Range: 'bytes=0-99' } });
    assert.equal(y.codigo, 206);
    assert.equal(y.cabeceras.get('content-type'), 'video/mp4');
    assert.equal(y.cabeceras.get('content-range'), `bytes 0-99/${CLIP.length}`);
    assert.equal(y.cabeceras.get('cache-control'), 'private, max-age=31536000, immutable');
    assert.ok(y.datos.equals(CLIP.subarray(0, 100)));
    y = await pedir(base, 'GET', x.clip.url, { galleta: ana, cabeceras: { Range: `bytes=${CLIP.length + 5}-` } });
    assert.equal(y.codigo, 416);
    y = await pedir(base, 'GET', x.clip.poster, { galleta: ana });
    assert.equal(y.cabeceras.get('content-type'), 'image/jpeg');
    for (const otra of [`${id}~otro.mp4`, `${id}~..%2Fpaquete.json`, `999~clip-motor.mp4`]) assert.equal((await pedir(base, 'GET', `/api/academia/clips/${encodeURIComponent(otra)}`, { galleta: ana })).codigo, 404, otra);
  });
  db.close();
});

test('clip 0.12.1: Drive lo baja por su nombre como una figura (y uno muy largo no entra)', async () => {
  const archivos = new Map();
  const lista = createServer((req, res) => {
    const filas = [...archivos.entries()].map(([id, a]) => `<div class="flip-entry"><a href="https://drive.google.com/file/d/${id}/view"><div class="flip-entry-title">${a.nombre}</div></a></div>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body>${filas}</body></html>`);
  });
  const bajar = createServer((req, res) => {
    const a = archivos.get(new URL(req.url, 'http://x').searchParams.get('id'));
    if (!a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': a.tipo, 'Content-Length': a.cuerpo.length });
    res.end(a.cuerpo);
  });
  const abrir = s => new Promise(ok => s.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${s.address().port}`)));
  const bases = { lista: await abrir(lista), bajar: await abrir(bajar) };
  try {
    const config = { ...configDePrueba(), driveBases: bases };
    const db = abrirBase(config);
    enTransaccion(db, () => guardarCarpetaDrive(db, 'carpetaRaizDeClips01'));
    archivos.set('archivoPaqueteClip01', { nombre: 'paquete-clip.json', cuerpo: Buffer.from(JSON.stringify(paqueteConClip())), tipo: 'application/json' });
    archivos.set('archivoFiguraClip001', { nombre: 'figura-m1.png', cuerpo: figuraMuestraPng(), tipo: 'image/png' });
    archivos.set('archivoClipMotor0001', { nombre: 'clip-motor.mp4', cuerpo: mp4Clip({ segundos: 12 }), tipo: 'video/mp4' });
    archivos.set('archivoClipPoster001', { nombre: 'clip-motor.jpg', cuerpo: JPG, tipo: 'image/jpeg' });
    const revisar = async () => {
      const paso = crearSincronizador();
      let punto = null;
      for (let i = 0; i < 20; i++) {
        const r = await paso({ db, config, senal: new AbortController().signal, tarea: { id: 1, punto, datos: { origen: 'manual', forzar: true } }, escribir: async t => enTransaccion(db, t), quedaMs: () => 900_000 });
        if (r.listo) return leerRevisiones(db)[0];
        punto = r.punto;
        await importarEntrante(db, config);
      }
      throw new Error('no terminó');
    };
    let r = await revisar();
    assert.deepEqual(r.errores, [{ archivo: 'clip-motor.mp4', motivo: 'clip_muy_largo' }]);
    archivos.set('archivoClipMotor0001', { nombre: 'clip-motor.mp4', cuerpo: mp4Clip(), tipo: 'video/mp4' });
    r = await revisar();
    assert.deepEqual(r.errores, []);
    assert.ok(r.completados >= 1);
    db.close();
  } finally { await Promise.all([lista, bajar].map(s => new Promise(ok => s.close(ok)))); }
});

test('clip 0.12.1: en la pantalla el clip manda sobre el dibujo, suena solo si se pide y respeta «reducir movimiento»', () => {
  const [p] = partirLeccion([{ tipo: 'tarjeta', titulo: 'T', puntos: ['a'], visual: { tipo: 'motor' }, clip: { url: '/x.mp4', alt: 'a' }, fuentes: [] }]);
  assert.equal(p.clip.url, '/x.mp4');
  const app = readFileSync(join(RAIZ_REPO, 'public', 'app.js'), 'utf8');
  const vista = app.slice(app.indexOf('function vistaClip('), app.indexOf('function vistaTarjeta('));
  assert.match(app, /const visual = p\.visual && !clip \?/, 'con clip, sin dibujo');
  for (const x of ['muted: true', 'loop: true', 'playsinline: true', 'IntersectionObserver', "prefers-reduced-motion: reduce", 'sonidosEncendidos()', 'c.sonido === true', 'sonidoClipElegido()']) assert.ok(vista.includes(x), x);
  assert.ok(app.includes('op_clip_sonido.'), 'la elección se recuerda por cuenta');
  assert.match(vista, /preload: reducir \? 'none' : 'metadata'/);
  assert.match(vista, /let pausadoAMano = reducir;/, 'con reducir movimiento no arranca solo');
});
