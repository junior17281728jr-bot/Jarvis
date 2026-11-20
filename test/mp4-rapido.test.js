// Pruebas de la 0.14.61: un mp4 con «moov» al final se copia AL LADO con moov antes de mdat (faststart), sin ffmpeg,
// corriendo los lugares de los pedazos (stco y co64); el original no se toca. Y lo que se manda por partes: HEAD, el
// «bytes=0-1» del iPhone y varias partes juntas. Los mp4 son chicos y se arman aquí mismo, byte a byte (nunca un video real).
import { configDePrueba, conServidor, carpetaTemporal, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { planRapido, hacerRapido, correrLugares, versionParaServir, SUFIJO_RAPIDO } from '../src/academia/mp4-rapido.js';
import { datosMp4 } from '../src/academia/mp4.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const caja = (tipo, ...partes) => { const cuerpo = Buffer.concat(partes); const c = Buffer.alloc(8); c.writeUInt32BE(8 + cuerpo.length); c.write(tipo, 4, 'latin1'); return Buffer.concat([c, cuerpo]); };
const PEDAZOS = [Buffer.alloc(300, 0x11), Buffer.alloc(500, 0x22), Buffer.alloc(200, 0x33)];
const sha = b => createHash('sha256').update(b).digest('hex');

// Un mp4 mínimo: ftyp, (free), mdat con 3 pedazos conocidos y moov con mvhd, una pista de video (tkhd, mdhd, hdlr) y la
// tabla de lugares (stco de 32 bits o co64 de 64). alFinal: moov después de mdat (lo que hay que arreglar).
function mp4({ alFinal = true, co64 = false, extra = [] } = {}) {
  const ftyp = caja('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1'));
  const free = caja('free');
  const mdat = caja('mdat', ...PEDAZOS);
  const tabla = lugares => {
    const b = Buffer.alloc(8 + lugares.length * (co64 ? 8 : 4));
    b.writeUInt32BE(lugares.length, 4);
    lugares.forEach((o, k) => (co64 ? b.writeBigUInt64BE(BigInt(o), 8 + k * 8) : b.writeUInt32BE(o, 8 + k * 4)));
    return caja(co64 ? 'co64' : 'stco', b);
  };
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(6000, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(640 * 65536, 76); tkhd.writeUInt32BE(360 * 65536, 80);
  const hdlr = Buffer.alloc(24); hdlr.write('vide', 8, 'latin1');
  const moovCon = lugares => caja('moov', caja('mvhd', mvhd), caja('trak', caja('tkhd', tkhd), caja('mdia', caja('mdhd', Buffer.alloc(24)), caja('hdlr', hdlr), caja('minf', caja('stbl', tabla(lugares))))), ...extra);
  // Dónde empieza cada pedazo dentro del archivo (depende de lo que va antes de mdat).
  const lugaresDesde = inicioMdat => { let o = inicioMdat + 8; return PEDAZOS.map(p => { const x = o; o += p.length; return x; }); };
  if (alFinal) return Buffer.concat([ftyp, free, mdat, moovCon(lugaresDesde(ftyp.length + free.length))]);
  const largoMoov = moovCon([0, 0, 0]).length;
  return Buffer.concat([ftyp, free, moovCon(lugaresDesde(ftyp.length + free.length + largoMoov)), mdat]);
}
// Las cajas de arriba de un Buffer y los lugares de su stco/co64.
function arriba(b) { const l = []; for (let i = 0; i < b.length;) { const n = b.readUInt32BE(i); l.push(b.toString('latin1', i + 4, i + 8)); i += n; } return l; }
function lugaresDe(b) {
  for (const tipo of ['stco', 'co64']) {
    const i = b.indexOf(Buffer.from(tipo, 'latin1'));
    if (i < 0) continue;
    const n = b.readUInt32BE(i + 8);
    return Array.from({ length: n }, (_, k) => (tipo === 'stco' ? b.readUInt32BE(i + 12 + k * 4) : Number(b.readBigUInt64BE(i + 12 + k * 8))));
  }
  return null;
}
const pedazosEn = b => lugaresDe(b).map((o, k) => b.subarray(o, o + PEDAZOS[k].length));

test('mp4 rápido 0.14.61: moov al final pasa adelante y cada lugar (stco y co64) sigue apuntando a su pedazo', async () => {
  const dir = carpetaTemporal('mp4-rapido');
  for (const co64 of [false, true]) {
    const original = mp4({ co64 });
    assert.deepEqual(arriba(original), ['ftyp', 'free', 'mdat', 'moov']);
    // Lo que el archivo de prueba dice antes de arreglarlo: los pedazos están donde dice.
    pedazosEn(original).forEach((p, k) => assert.ok(p.equals(PEDAZOS[k])));
    const ruta = join(dir, `v${co64 ? 64 : 32}.mp4`);
    writeFileSync(ruta, original);
    assert.equal(planRapido(ruta).hacer, true);
    const r = await hacerRapido(ruta, ruta + SUFIJO_RAPIDO);
    assert.deepEqual(r, { hecho: true });
    const nuevo = readFileSync(ruta + SUFIJO_RAPIDO);
    assert.deepEqual(arriba(nuevo), ['ftyp', 'free', 'moov', 'mdat'], 'moov antes de mdat');
    assert.equal(nuevo.length, original.length, 'el mismo largo');
    pedazosEn(nuevo).forEach((p, k) => assert.ok(p.equals(PEDAZOS[k]), `pedazo ${k} (${co64 ? 'co64' : 'stco'})`));
    assert.deepEqual(datosMp4(nuevo), datosMp4(original), 'duración y tamaño iguales');
    assert.ok(readFileSync(ruta).equals(original), 'el original no se toca');
    // Ya rápido: no se hace nada (ni se escribe otra copia).
    assert.deepEqual(await hacerRapido(ruta + SUFIJO_RAPIDO, join(dir, 'otra.mp4')), { hecho: false, motivo: 'ya_rapido' });
    assert.equal(existsSync(join(dir, 'otra.mp4')), false);
  }
  // Un mp4 que ya viene bien (moov adelante), como casi todos.
  const bien = join(dir, 'bien.mp4');
  writeFileSync(bien, mp4({ alFinal: false }));
  pedazosEn(readFileSync(bien)).forEach((p, k) => assert.ok(p.equals(PEDAZOS[k])));
  assert.deepEqual(planRapido(bien), { hacer: false, motivo: 'ya_rapido' });
  assert.equal(versionParaServir(bien).ruta, bien, 'sin copia: el original');
  // Con la copia del mismo largo, se sirve la copia; una copia cortada no.
  const ruta = join(dir, 'v32.mp4');
  assert.equal(versionParaServir(ruta).ruta, ruta + SUFIJO_RAPIDO);
  writeFileSync(join(dir, 'corta.mp4'), mp4());
  writeFileSync(join(dir, `corta.mp4${SUFIJO_RAPIDO}`), Buffer.alloc(10));
  assert.equal(versionParaServir(join(dir, 'corta.mp4')).ruta, join(dir, 'corta.mp4'));
  assert.equal(readdirSync(dir).some(n => n.endsWith('.part')), false, 'no queda nada a medias');
});

test('mp4 rápido 0.14.61: lo raro no se toca (fragmentado, moov comprimido, no cabe en 32 bits, no es mp4, sin disco)', async () => {
  const dir = carpetaTemporal('mp4-raro');
  const escribir = (nombre, b) => { const r = join(dir, nombre); writeFileSync(r, b); return r; };
  const frag = Buffer.concat([mp4(), caja('moof', Buffer.alloc(8)), caja('mdat', Buffer.alloc(4))]);
  assert.deepEqual(await hacerRapido(escribir('frag.mp4', frag), join(dir, 'x1')), { hecho: false, motivo: 'fragmentado' });
  assert.deepEqual(await hacerRapido(escribir('cmov.mp4', mp4({ extra: [caja('cmov', Buffer.alloc(4))] })), join(dir, 'x2')), { hecho: false, motivo: 'cmov' });
  assert.deepEqual(await hacerRapido(escribir('mp3.mp4', Buffer.from('ID3 no soy un video de verdad')), join(dir, 'x3')), { hecho: false, motivo: 'no_es_mp4' });
  assert.deepEqual(await hacerRapido(escribir('corto.mp4', mp4().subarray(0, 60)), join(dir, 'x4')), { hecho: false, motivo: 'no_es_mp4' });
  assert.deepEqual(await hacerRapido(escribir('lleno.mp4', mp4()), join(dir, 'x5'), { espacio: () => 'sin_espacio_disco' }), { hecho: false, motivo: 'sin_espacio_disco' });
  for (const n of ['x1', 'x2', 'x3', 'x4', 'x5']) assert.equal(existsSync(join(dir, n)), false, n);
  // Un lugar de 32 bits que al correrse ya no cabe: no se escribe nada a medias.
  const moov = caja('moov', caja('trak', caja('mdia', caja('minf', caja('stbl', caja('stco', Buffer.from([0, 0, 0, 0, 0, 0, 0, 1, 0xff, 0xff, 0xff, 0x00])))))));
  assert.equal(correrLugares(moov, { desde: 0, hasta: 2 ** 32, corrimiento: 0x1000 }), 'no_cabe');
  // co64 sí cabe; y lo que está fuera de [desde, hasta) no se mueve.
  const moov64 = caja('moov', caja('trak', caja('mdia', caja('minf', caja('stbl', caja('co64', Buffer.from([0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0x00, 0, 0, 0, 0, 0, 0, 0, 5])))))));
  assert.equal(correrLugares(moov64, { desde: 10, hasta: 2 ** 33, corrimiento: 0x1000 }), null);
  assert.deepEqual(lugaresDe(moov64), [0xffffff00 + 0x1000, 5]);
});

// Lo que la app hace con un clip y un video resumen con moov al final: los guarda tal cual (la huella del paquete sigue
// siendo la del archivo), escribe la copia rápida al lado y sirve esa, por partes: HEAD, «bytes=0-1» y varias partes.
test('mp4 rápido 0.14.61: al subirlos se sirve la copia rápida, por partes, con HEAD; el original queda igual', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const CLAVE = 'una clave bien larga';
  const CLIP = mp4();
  const p = paqueteMuestra();
  p.edicion = 'muestra-rapido';
  p.materias[0].temas[0].secciones.push({ tipo: 'tarjeta', titulo: 'Clip', puntos: ['Un clip.'], clip: { archivo: 'clip-final.mp4', alt: 'Un clip de prueba.', sha256: sha(CLIP) }, fuentes: [{ libro: 'muestra', capitulo: 'C', seccion: 'M', pagina: '1' }] });
  p.materias[0].video = { titulo: 'Video', mp4: { archivo: 'video-final.mp4', duracion_s: 6 } };
  await conServidor(crearServidor({ db, config }), async base => {
    const pedir = async (metodo, ruta, { galleta, cabeceras = {}, cuerpo, datos } = {}) => {
      const r = await fetch(base + ruta, { method: metodo, headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: datos ? JSON.stringify(datos) : cuerpo });
      const tipo = r.headers.get('content-type') || '';
      return { codigo: r.status, cabeceras: r.headers, datos: tipo.includes('json') && metodo !== 'HEAD' ? await r.json() : Buffer.from(await r.arrayBuffer()), galleta: r.headers.get('set-cookie')?.split(';')[0] };
    };
    const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const ana = (await pedir('POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const s = await pedir('POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(p) });
    assert.equal(s.codigo, 201, JSON.stringify(s.datos));
    const id = s.datos.paquete.id;
    await pedir('POST', `/api/admin/academia/paquetes/${id}/figuras/${p.figuras[0].archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal((await pedir('POST', `/api/admin/academia/paquetes/${id}/clips/clip-final.mp4`, { galleta: admin, cabeceras: { 'Content-Type': 'video/mp4' }, cuerpo: CLIP })).codigo, 201);
    assert.equal((await pedir('POST', `/api/admin/academia/paquetes/${id}/video/video-final.mp4`, { galleta: admin, cabeceras: { 'Content-Type': 'video/mp4' }, cuerpo: CLIP })).codigo, 201);
    assert.equal((await pedir('POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    // En el disco: el original tal cual (su sha256 es el del paquete) y la copia rápida al lado.
    const carpeta = join(config.raiz, 'datos', 'academia', 'paquetes');
    const version = readdirSync(carpeta).find(n => n.startsWith(`${id}-`));
    for (const [sub, nombre] of [['clips', 'clip-final.mp4'], ['video', 'video-final.mp4']]) {
      const ruta = join(carpeta, version, sub, nombre);
      assert.equal(sha(readFileSync(ruta)), sha(CLIP), `${nombre}: el original no cambia`);
      assert.deepEqual(arriba(readFileSync(ruta + SUFIJO_RAPIDO)), ['ftyp', 'free', 'moov', 'mdat'], `${nombre}: la copia rápida`);
    }
    const tema = p.materias[0].temas[0].id;
    const clip = (await pedir('GET', `/api/academia/temas/factores_humanos/${tema}`, { galleta: ana })).datos.secciones.at(-1).clip;
    const video = (await pedir('GET', '/api/academia/video/factores_humanos', { galleta: ana })).datos.mp4;
    for (const url of [clip.url, video.url]) {
      const entero = await pedir('GET', url, { galleta: ana });
      assert.equal(entero.codigo, 200);
      assert.deepEqual(arriba(entero.datos), ['ftyp', 'free', 'moov', 'mdat'], 'se sirve la copia rápida');
      pedazosEn(entero.datos).forEach((x, k) => assert.ok(x.equals(PEDAZOS[k])));
      const etag = entero.cabeceras.get('etag');
      // El iPhone pregunta primero por 2 bytes.
      const dos = await pedir('GET', url, { galleta: ana, cabeceras: { Range: 'bytes=0-1' } });
      assert.equal(dos.codigo, 206);
      assert.equal(dos.cabeceras.get('content-range'), `bytes 0-1/${CLIP.length}`);
      assert.equal(dos.cabeceras.get('content-length'), '2');
      assert.equal(dos.cabeceras.get('accept-ranges'), 'bytes');
      assert.ok(dos.datos.equals(entero.datos.subarray(0, 2)));
      // HEAD: las cabeceras, sin cuerpo (también con Range).
      const cabeza = await pedir('HEAD', url, { galleta: ana });
      assert.equal(cabeza.codigo, 200);
      assert.equal(cabeza.cabeceras.get('content-length'), String(CLIP.length));
      assert.equal(cabeza.cabeceras.get('content-type'), 'video/mp4');
      assert.equal(cabeza.cabeceras.get('etag'), etag);
      assert.equal(cabeza.datos.length, 0);
      const cabezaParte = await pedir('HEAD', url, { galleta: ana, cabeceras: { Range: 'bytes=0-1' } });
      assert.equal(cabezaParte.codigo, 206);
      assert.equal(cabezaParte.cabeceras.get('content-range'), `bytes 0-1/${CLIP.length}`);
      assert.equal((await pedir('HEAD', url)).codigo, 401, 'HEAD también pide la sesión');
      // Varias partes juntas: se ignora el pedido y va entero (antes, 416).
      const varias = await pedir('GET', url, { galleta: ana, cabeceras: { Range: 'bytes=0-1,10-20' } });
      assert.equal(varias.codigo, 200);
      assert.ok(varias.datos.equals(entero.datos));
      // Guardado un año, y «¿cambió?» → 304.
      assert.equal(entero.cabeceras.get('cache-control'), 'private, max-age=31536000, immutable');
      assert.equal((await pedir('GET', url, { galleta: ana, cabeceras: { 'If-None-Match': etag } })).codigo, 304);
    }
    // HEAD sigue sin valer en lo que no se manda por partes.
    assert.equal((await pedir('HEAD', '/api/academia/camino', { galleta: ana })).codigo, 405);
  });
  db.close();
});
