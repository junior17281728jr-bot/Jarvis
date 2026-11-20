// 0.14.53: los archivos del dictado en el equipo (src/academia/voz.js): se bajan una vez, por pedazos, con el sha256
// revisado; un archivo distinto se rechaza (y se prueba la fuente siguiente); un «.parte» a medias queda vacío; muchos
// pedidos a la vez → una sola bajada; se sirven con sus tipos y guardados un año. Sin internet: un servidor falso en
// 127.0.0.1 hace de jsdelivr, de Hugging Face y de npm.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaTemporal, configDePrueba, conServidor } from './ayuda.js';
import { crearVoz, revisarManifiesto, extraerTar, hostVozPermitido, tipoVoz, MANIFIESTO_VOZ, HOSTS_VOZ } from '../src/academia/voz.js';
import { CABECERAS_SEGURIDAD } from '../src/nucleo/http.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { crearSesion, GALLETA } from '../src/cuentas/sesiones.js';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const sha512 = b => `sha512-${createHash('sha512').update(b).digest('base64')}`;

// Un .tar mínimo (ustar), como los de npm.
function tar(entradas) {
  const bloques = [];
  for (const [nombre, contenido] of entradas) {
    const h = Buffer.alloc(512);
    h.write(nombre, 0, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(`${contenido.length.toString(8).padStart(11, '0')}\0`, 124);
    h.write('00000000000\0', 136);
    h.write('        ', 148);
    h[156] = 48;
    h.write('ustar\0', 257); h.write('00', 263);
    let suma = 0;
    for (const b of h) suma += b;
    h.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148);
    bloques.push(h, contenido, Buffer.alloc((512 - (contenido.length % 512)) % 512));
  }
  bloques.push(Buffer.alloc(1024));
  return Buffer.concat(bloques);
}

const LIB = Buffer.from('export const pipeline = 1;\n'.repeat(50));
const WASM = Buffer.concat([Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), Buffer.alloc(70_000, 7)]);
const MODELO = Buffer.alloc(300_000, 3); // más que un pedazo de la red: llega en varios
const CONFIG = Buffer.from('{"model_type":"whisper"}');

// El servidor falso: rutas → { cuerpo, estado, redirige, lento }. Cuenta los pedidos.
async function conFalso(fn) {
  const rutas = new Map();
  const pedidos = [];
  const s = createServer((req, res) => {
    pedidos.push(req.url);
    const r = rutas.get(req.url);
    if (!r) { res.writeHead(404); return res.end('no'); }
    if (r.redirige) { res.writeHead(302, { Location: r.redirige }); return res.end(); }
    if (r.cuelga) return; // acepta y nunca responde
    if (r.quieto) { res.writeHead(200, { 'Content-Length': r.cuerpo.length }); res.write(r.cuerpo.subarray(0, 1000)); return; }
    if (r.corta) { res.writeHead(200, { 'Content-Length': r.cuerpo.length }); res.write(r.cuerpo.subarray(0, 1000)); return setTimeout(() => res.destroy(), 20); }
    const mandar = () => { res.writeHead(r.estado ?? 200, { 'Content-Length': r.cuerpo.length }); res.end(r.cuerpo); };
    if (r.lento) setTimeout(mandar, r.lento); else mandar();
  });
  await new Promise(ok => s.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${s.address().port}`;
  try { await fn({ base, rutas, pedidos }); } finally { await new Promise(ok => s.close(ok)); }
}

function manifiestoDe(base, { paquete = null } = {}) {
  const archivos = [
    { ruta: 'lib/transformers.min.js', cuerpo: LIB, url: `${base}/jsd/transformers.min.js` },
    { ruta: 'ort/ort-wasm-simd-threaded.jsep.wasm', cuerpo: WASM, url: `${base}/jsd/ort.wasm` },
    { ruta: 'modelos/X/w/config.json', cuerpo: CONFIG, url: `${base}/hf/config.json` },
    { ruta: 'modelos/X/w/onnx/encoder_model_quantized.onnx', cuerpo: MODELO, url: `${base}/hf/encoder.onnx` },
  ].map(a => ({ ruta: a.ruta, bytes: a.cuerpo.length, sha256: sha256(a.cuerpo), fuentes: [{ url: a.url }, ...(paquete ? [{ paquete: 'p', dentro: `package/${a.ruta}` }] : [])] }));
  return {
    id: 'prueba-1', modelo: 'X/w', bytes: archivos.reduce((s, a) => s + a.bytes, 0),
    paquetes: paquete ? { p: { url: `${base}/npm/p.tgz`, bytes: paquete.length, integridad: sha512(paquete) } } : {},
    archivos,
  };
}
const tgzBueno = () => gzipSync(tar([
  ['package/package.json', Buffer.from('{}')],
  ['package/lib/transformers.min.js', LIB], ['package/ort/ort-wasm-simd-threaded.jsep.wasm', WASM],
  ['package/modelos/X/w/config.json', CONFIG], ['package/modelos/X/w/onnx/encoder_model_quantized.onnx', MODELO],
]));
const ponerDirectas = (rutas, { malo = null } = {}) => {
  rutas.set('/jsd/transformers.min.js', { cuerpo: LIB });
  rutas.set('/jsd/ort.wasm', { cuerpo: WASM });
  rutas.set('/hf/config.json', { cuerpo: CONFIG });
  rutas.set('/hf/encoder.onnx', { redirige: '/cdn/encoder.onnx' }); // como Hugging Face → su CDN
  rutas.set('/cdn/encoder.onnx', { cuerpo: malo ?? MODELO });
};

// Una respuesta falsa (para servir()): un Writable de verdad (createReadStream().pipe() lo necesita) con writeHead.
async function servir(voz, ruta, cabeceras = {}, metodo = 'GET') {
  const { Writable } = await import('node:stream');
  const partes = [];
  const w = new Writable({ write(b, _e, cb) { partes.push(Buffer.from(b)); cb(); } });
  w.writeHead = (c, h) => { w.codigo = c; w.cabeceras = h; };
  const fin = new Promise(ok => w.on('finish', ok));
  const atendida = await voz.servir({ method: metodo, headers: cabeceras }, w, ruta);
  await fin;
  return { atendida, codigo: w.codigo, cabeceras: w.cabeceras, cuerpo: Buffer.concat(partes) };
}

test('la lista del repositorio es válida: versiones exactas, solo servidores permitidos, sha256 y tamaños, y nada grande en el repo', () => {
  assert.deepEqual(revisarManifiesto(MANIFIESTO_VOZ, { prueba: false }), []);
  assert.equal(MANIFIESTO_VOZ.modelo, 'Xenova/whisper-base');
  assert.match(MANIFIESTO_VOZ.id, /^tf3\.8\.1-wb[0-9a-f]{7}-wt[0-9a-f]{7}$/);
  assert.equal(MANIFIESTO_VOZ.modeloChico, 'Xenova/whisper-tiny');
  for (const a of MANIFIESTO_VOZ.archivos) {
    for (const f of a.fuentes) {
      if (f.url) {
        const u = new URL(f.url);
        assert.ok(HOSTS_VOZ.includes(u.hostname), f.url);
        // Versión exacta (jsdelivr) o commit fijo (Hugging Face): nunca «latest» ni «main».
        if (u.hostname === 'cdn.jsdelivr.net') assert.match(u.pathname, /^\/npm\/@huggingface\/transformers@3\.8\.1\/dist\//);
        if (u.hostname === 'huggingface.co') assert.match(u.pathname, /^\/Xenova\/whisper-(?:base|tiny)\/resolve\/[0-9a-f]{40}\//);
      } else assert.ok(MANIFIESTO_VOZ.paquetes[f.paquete], f.paquete);
    }
    if (a.ruta.startsWith('modelos/')) assert.ok(a.ruta.startsWith(`modelos/${MANIFIESTO_VOZ.modelo}/`) || a.ruta.startsWith(`modelos/${MANIFIESTO_VOZ.modeloChico}/`), a.ruta);
  }
  for (const p of Object.values(MANIFIESTO_VOZ.paquetes)) assert.match(p.url, /^https:\/\/registry\.npmjs\.org\/.+-\d+\.\d+\.\d+\.tgz$/);
  const rutas = MANIFIESTO_VOZ.archivos.map(a => a.ruta);
  for (const r of ['lib/transformers.min.js', 'ort/ort-wasm-simd-threaded.jsep.mjs', 'ort/ort-wasm-simd-threaded.jsep.wasm', 'modelos/Xenova/whisper-base/onnx/encoder_model_quantized.onnx', 'modelos/Xenova/whisper-base/onnx/decoder_model_merged_quantized.onnx', 'modelos/Xenova/whisper-base/tokenizer.json']) assert.ok(rutas.includes(r), r);
  // La lista misma es chica; los archivos grandes nunca están en public/.
  assert.ok(statSync(new URL('../src/academia/voz-archivos.json', import.meta.url)).size < 20_000);
  for (const r of rutas) assert.ok(!existsSync(new URL(`../public/${r.split('/').at(-1)}`, import.meta.url)), r);
  // Revisa de verdad: una ruta con «..», un sha256 corto o un servidor de otro lado no pasan.
  const malo = structuredClone(MANIFIESTO_VOZ);
  malo.archivos[0].ruta = 'lib/../../x.js';
  malo.archivos[1].sha256 = 'abc';
  malo.archivos[2].fuentes = [{ url: 'https://evil.example.com/x' }];
  const problemas = revisarManifiesto(malo, { prueba: false });
  assert.ok(problemas.some(p => p.startsWith('ruta:')) && problemas.some(p => p.startsWith('huella:')) && problemas.some(p => p.startsWith('fuente:')), problemas.join());
});

test('los servidores permitidos: en modo de prueba solo 127.0.0.1; en el servidor real, los tres de la lista y la CDN de Hugging Face', () => {
  assert.equal(hostVozPermitido('http://127.0.0.1:4567/x'), true);
  assert.equal(hostVozPermitido('https://cdn.jsdelivr.net/npm/x'), false, 'en las pruebas nunca internet');
  const antes = process.env.OPORTIA_TEST;
  process.env.OPORTIA_TEST = '0';
  try {
    assert.equal(hostVozPermitido('https://cdn.jsdelivr.net/npm/x'), true);
    assert.equal(hostVozPermitido('https://registry.npmjs.org/x.tgz'), true);
    assert.equal(hostVozPermitido('https://us.aws.cdn.hf.co/xet/abc', 'huggingface.co'), true, 'Hugging Face → su CDN');
    assert.equal(hostVozPermitido('https://us.aws.cdn.hf.co/xet/abc', 'cdn.jsdelivr.net'), false, 'a *.hf.co solo desde huggingface.co');
    assert.equal(hostVozPermitido('http://cdn.jsdelivr.net/x'), false, 'solo https');
    assert.equal(hostVozPermitido('https://evil.com/x', 'huggingface.co'), false);
    assert.equal(hostVozPermitido('https://hf.co.evil.com/x', 'huggingface.co'), false);
    assert.equal(hostVozPermitido('https://u:p@cdn.jsdelivr.net/x'), false);
  } finally { process.env.OPORTIA_TEST = antes; }
  assert.equal(tipoVoz('ort/a.wasm'), 'application/wasm');
  assert.equal(tipoVoz('lib/a.js'), 'text/javascript; charset=utf-8');
  assert.equal(tipoVoz('ort/a.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(tipoVoz('modelos/a/config.json'), 'application/json; charset=utf-8');
  assert.equal(tipoVoz('modelos/a/onnx/b.onnx'), 'application/octet-stream');
});

test('la CSP deja compilar WebAssembly y nada más cambia: todo sigue siendo solo de OPORTIA', () => {
  assert.equal(CABECERAS_SEGURIDAD['Content-Security-Policy'], "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  assert.doesNotMatch(CABECERAS_SEGURIDAD['Content-Security-Policy'], /(?<!wasm-)unsafe-eval|unsafe-inline|blob:|https:/);
});

test('se bajan una vez (aunque los pidan muchos a la vez), siguiendo la redirección, y se sirven con sus tipos, guardados un año', async () => {
  await conFalso(async ({ base, rutas, pedidos }) => {
    ponerDirectas(rutas);
    rutas.get('/jsd/transformers.min.js').lento = 80;
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: manifiestoDe(base) });
    assert.equal((await voz.estado({ empezar: false })).estado, 'falta');
    const [a, b, c, e] = await Promise.all([voz.preparar(), voz.preparar(), voz.preparar(), voz.estado()]);
    assert.deepEqual([a, b, c], [true, true, true]);
    assert.equal(e.estado, 'bajando', 'mientras baja, la pantalla lo sabe');
    assert.equal(pedidos.filter(p => p === '/jsd/transformers.min.js').length, 1, 'una sola bajada');
    assert.equal(pedidos.filter(p => p === '/cdn/encoder.onnx').length, 1, 'siguió la redirección');
    const listo = await voz.estado();
    assert.equal(listo.estado, 'lista');
    assert.equal(listo.pct, 100);
    assert.equal(listo.base, '/voz/prueba-1/');
    assert.equal(listo.bytes, LIB.length + WASM.length + CONFIG.length + MODELO.length);
    assert.deepEqual(listo.bytesDe, { 'X/w': listo.bytes }, 'lo que baja el navegador con ese modelo');
    // Otra vez (o al reiniciar): ya están, no se baja nada.
    const n = pedidos.length;
    assert.equal(await crearVoz({ config: { carpetaVoz: voz.carpeta.replace(/\/prueba-1$/, '') }, manifiesto: manifiestoDe(base) }).preparar(), true);
    assert.equal(pedidos.length, n);

    const w = await servir(voz, '/voz/prueba-1/ort/ort-wasm-simd-threaded.jsep.wasm');
    assert.equal(w.codigo, 200);
    assert.equal(w.cabeceras['Content-Type'], 'application/wasm');
    assert.equal(w.cabeceras['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal(w.cabeceras['Content-Length'], WASM.length);
    assert.equal(w.cabeceras['Content-Security-Policy'], CABECERAS_SEGURIDAD['Content-Security-Policy']);
    assert.equal(w.cabeceras['X-Content-Type-Options'], 'nosniff');
    assert.ok(w.cuerpo.equals(WASM), 'el archivo, tal cual');
    const js = await servir(voz, '/voz/prueba-1/lib/transformers.min.js');
    assert.equal(js.cabeceras['Content-Type'], 'text/javascript; charset=utf-8');
    const onnx = await servir(voz, '/voz/prueba-1/modelos/X/w/onnx/encoder_model_quantized.onnx');
    assert.equal(onnx.cabeceras['Content-Type'], 'application/octet-stream');
    assert.ok(onnx.cuerpo.equals(MODELO));
    assert.equal((await servir(voz, '/voz/prueba-1/modelos/X/w/config.json')).cabeceras['Content-Type'], 'application/json; charset=utf-8');
    const cache = await servir(voz, '/voz/prueba-1/lib/transformers.min.js', { 'if-none-match': js.cabeceras.ETag });
    assert.equal(cache.codigo, 304);
    assert.equal(cache.cuerpo.length, 0);
    const head = await servir(voz, '/voz/prueba-1/lib/transformers.min.js', {}, 'HEAD');
    assert.equal(head.codigo, 200);
    assert.equal(head.cuerpo.length, 0);
    for (const r of ['/voz/prueba-1/lib/otra.js', '/voz/otra-version/lib/transformers.min.js', '/voz/prueba-1/../voz-archivos.json', '/voz/prueba-1/lib/transformers.min.js.parte']) assert.equal((await servir(voz, r)).codigo, 404, r);
  });
});

test('un archivo con otro sha256 se rechaza y se prueba la fuente siguiente (el paquete de npm); el .parte queda vacío', async () => {
  await conFalso(async ({ base, rutas }) => {
    const tgz = tgzBueno();
    const modeloMalo = Buffer.from(MODELO);
    modeloMalo[1234] ^= 1; // mismo tamaño, un byte distinto
    ponerDirectas(rutas, { malo: modeloMalo });
    rutas.delete('/jsd/ort.wasm'); // 404 en jsdelivr
    rutas.set('/npm/p.tgz', { cuerpo: tgz });
    const carpeta = carpetaTemporal('voz');
    const voz = crearVoz({ config: { carpetaVoz: carpeta }, manifiesto: manifiestoDe(base, { paquete: tgz }) });
    assert.equal(await voz.preparar(), true);
    const final = join(voz.carpeta, 'modelos', 'X', 'w', 'onnx', 'encoder_model_quantized.onnx');
    assert.ok(readFileSync(final).equals(MODELO), 'el bueno, del paquete');
    assert.ok(readFileSync(join(voz.carpeta, 'ort', 'ort-wasm-simd-threaded.jsep.wasm')).equals(WASM));
    assert.equal(existsSync(`${final}.parte`), false, 'renombrado: no queda el .parte');
  });
  await conFalso(async ({ base, rutas }) => {
    const modeloMalo = Buffer.from(MODELO);
    modeloMalo[7] ^= 1;
    ponerDirectas(rutas, { malo: modeloMalo });
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: manifiestoDe(base) });
    assert.equal(await voz.preparar(), false, 'sin otra fuente: no hay dictado en el equipo');
    const e = await voz.estado({ empezar: false });
    assert.equal(e.estado, 'no');
    const final = join(voz.carpeta, 'modelos', 'X', 'w', 'onnx', 'encoder_model_quantized.onnx');
    assert.equal(existsSync(final), false, 'nunca queda un archivo malo con su nombre');
    assert.equal(statSync(`${final}.parte`).size, 0, 'el .parte a medias queda vacío');
    assert.equal((await servir(voz, '/voz/prueba-1/modelos/X/w/onnx/encoder_model_quantized.onnx')).codigo, 404);
    // Después de un fallo no se prueba en cada pedido; sí al pasar el rato (o a la fuerza).
    rutas.set('/cdn/encoder.onnx', { cuerpo: MODELO });
    assert.equal(await voz.preparar(), false);
    assert.equal(await voz.preparar({ forzar: true }), true);
    assert.equal((await voz.estado()).estado, 'lista');
  });
});

test('una bajada cortada a la mitad, un paquete con otra integridad o un servidor que no deja: nada queda a medias', async () => {
  await conFalso(async ({ base, rutas }) => {
    ponerDirectas(rutas);
    rutas.set('/cdn/encoder.onnx', { cuerpo: MODELO, corta: true });
    const tgz = tgzBueno();
    const otro = gzipSync(tar([['package/x', Buffer.from('x')]]));
    rutas.set('/npm/p.tgz', { cuerpo: tgz });
    const m = manifiestoDe(base, { paquete: otro }); // la integridad es la de OTRO paquete
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: m });
    assert.equal(await voz.preparar(), false);
    const final = join(voz.carpeta, 'modelos', 'X', 'w', 'onnx', 'encoder_model_quantized.onnx');
    assert.equal(existsSync(final), false);
    assert.equal(statSync(`${final}.parte`).size, 0);
    // Los que sí se bajaron bien quedan (la próxima vez solo falta el modelo).
    assert.ok(existsSync(join(voz.carpeta, 'lib', 'transformers.min.js')));
  });
  // Sin espacio en el disco: ni empieza.
  await conFalso(async ({ base, rutas, pedidos }) => {
    ponerDirectas(rutas);
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: manifiestoDe(base), espacioLibre: async () => 1000 });
    assert.equal(await voz.preparar(), false);
    assert.equal((await voz.estado({ empezar: false })).motivo, 'sin_espacio');
    assert.equal(pedidos.length, 0);
  });
  // Una lista mala: nunca baja nada.
  const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: { id: 'x', archivos: [] } });
  assert.equal(await voz.preparar(), false);
  assert.equal((await voz.estado()).estado, 'no');
  // La lista de verdad, en modo de prueba: la puerta a la red no sale a internet (y no se queda colgado).
  const real = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') } });
  assert.equal(await real.preparar(), false);
  assert.equal((await real.estado({ empezar: false })).estado, 'no');
});

test('0.14.91: un servidor que acepta y nunca responde: se corta sin avance, no se espera otra vez en la misma vuelta y queda «no» enseguida', async () => {
  await conFalso(async ({ base, rutas, pedidos }) => {
    for (const r of ['/jsd/transformers.min.js', '/jsd/ort.wasm', '/hf/config.json', '/hf/encoder.onnx']) rutas.set(r, { cuelga: true });
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: manifiestoDe(base), sinAvanceMs: 300 });
    const t0 = Date.now();
    assert.equal(await voz.preparar(), false);
    assert.ok(Date.now() - t0 < 5000, `termina enseguida (${Date.now() - t0} ms), no a los 15 minutos por archivo`);
    assert.equal(pedidos.length, 1, 'el mismo servidor (127.0.0.1) no se vuelve a esperar en esta vuelta');
    const e = await voz.estado({ empezar: false });
    assert.equal(e.estado, 'no');
    assert.equal((await voz.estado()).estado, 'no', 'y no vuelve a probar enseguida (espera ESPERA_TRAS_FALLO_MS)');
    assert.equal(pedidos.length, 1);
  });
  // Uno que manda la cabecera y unos bytes y después se queda quieto: también se corta.
  await conFalso(async ({ base, rutas }) => {
    ponerDirectas(rutas);
    rutas.set('/cdn/encoder.onnx', { cuerpo: MODELO, quieto: true });
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: manifiestoDe(base), sinAvanceMs: 300 });
    const t0 = Date.now();
    assert.equal(await voz.preparar(), false);
    assert.ok(Date.now() - t0 < 5000);
    assert.ok(existsSync(join(voz.carpeta, 'lib', 'transformers.min.js')), 'los que sí llegaron quedan');
  });
});

test('el .tar por pedazos: nombres largos (pax), entradas que no interesan, y una cabecera rota se rechaza', async () => {
  const largo = `package/${'a'.repeat(120)}/x.bin`;
  const registro = ` path=${largo}\n`;
  let n = registro.length + 2;
  while (String(n).length + registro.length !== n) n = String(n).length + registro.length;
  const pax = Buffer.from(`${n}${registro}`);
  const crudo = tar([['package/otro', Buffer.alloc(700, 1)], ['package/PaxHeader', pax], ['nombre-corto', Buffer.from('hola mundo')]]);
  // La segunda cabecera pasa a ser de tipo «x» (pax), con su suma.
  const h = crudo.subarray(512 + 1024, 512 + 1024 + 512);
  h[156] = 'x'.charCodeAt(0);
  h.write('        ', 148);
  let suma = 0;
  for (const b of h) suma += b;
  h.write(`${suma.toString(8).padStart(6, '0')}\0 `, 148);
  const vistos = [];
  const contenidos = [];
  async function* pedazos(b) { for (let k = 0; k < b.length; k += 333) yield b.subarray(k, k + 333); }
  await extraerTar(pedazos(crudo), (nombre, tamano) => {
    vistos.push([nombre, tamano]);
    const partes = [];
    return { async escribir(t) { partes.push(Buffer.from(t)); }, async cerrar() { contenidos.push(Buffer.concat(partes)); } };
  });
  assert.deepEqual(vistos, [['package/otro', 700], [largo, 10]]);
  assert.ok(contenidos[0].equals(Buffer.alloc(700, 1)));
  assert.equal(contenidos[1].toString(), 'hola mundo');
  const roto = Buffer.from(tar([['package/a', Buffer.from('x')]]));
  roto[10] ^= 0xff;
  await assert.rejects(extraerTar(pedazos(roto), () => null), /tar_cabecera/);
  const cortado = tar([['package/a', Buffer.alloc(2000, 1)]]).subarray(0, 1500);
  await assert.rejects(extraerTar(pedazos(cortado), () => null), /tar_cortado/);
});

test('/voz/… solo para quien entró, y /api/academia/voz/estado empieza la bajada', async () => {
  await conFalso(async ({ base, rutas }) => {
    ponerDirectas(rutas);
    const config = configDePrueba();
    const db = abrirBase(config);
    const id = crearUsuario(db, { nombre: 'alumno', claveHash: 'x', debeCambiarClave: false });
    const { token } = crearSesion(db, id);
    const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz') }, manifiesto: manifiestoDe(base) });
    const servidor = crearServidor({ db, config, voz });
    await conServidor(servidor, async b => {
      const galleta = { Cookie: `${GALLETA}=${token}` };
      assert.equal((await fetch(`${b}/api/academia/voz/estado`)).status, 401);
      const e = await (await fetch(`${b}/api/academia/voz/estado`, { headers: galleta })).json();
      assert.ok(['bajando', 'lista'].includes(e.estado), e.estado);
      for (let k = 0; k < 100 && (await voz.estado({ empezar: false })).estado !== 'lista'; k++) await new Promise(ok => setTimeout(ok, 20));
      assert.equal((await fetch(`${b}/voz/prueba-1/lib/transformers.min.js`)).status, 404, 'sin sesión, no');
      const r = await fetch(`${b}/voz/prueba-1/ort/ort-wasm-simd-threaded.jsep.wasm`, { headers: galleta });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'application/wasm');
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(WASM));
      // Las páginas también llevan la CSP nueva (la del trabajador del dictado sale de ahí).
      const pagina = await fetch(`${b}/voz-trabajador.js`);
      assert.equal(pagina.status, 200);
      assert.match(pagina.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval';/);
    });
    db.close();
  });
});

// El paquete de npm de verdad (si alguna vez está en la carpeta de pruebas) no hace falta: la lista se revisó arriba.
test('la carpeta de los archivos vive en los datos del servidor, nunca en el repositorio', () => {
  const v = crearVoz({ config: { carpetaDatos: '/srv/datos' } });
  assert.equal(v.carpeta, join('/srv/datos', 'oportia-voz', MANIFIESTO_VOZ.id));
  const carpeta = carpetaTemporal('voz');
  mkdirSync(join(carpeta, 'x'), { recursive: true });
  writeFileSync(join(carpeta, 'x', 'y'), 'z');
  assert.equal(crearVoz({ config: { archivoBase: join(carpeta, 'oportia.db') } }).carpeta, join(carpeta, 'oportia-voz', MANIFIESTO_VOZ.id));
});
