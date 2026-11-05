// Pruebas de la rapidez (0.3.3): los archivos de las pantallas se sirven desde la memoria, comprimidos (brotli y
// gzip), con ETag (304 si el navegador ya los tiene) y con su huella en la dirección; y las respuestas grandes
// de la API viajan comprimidas. Sin cambiar nada de lo que se ve: el contenido es siempre el mismo archivo.
import { configDePrueba, conServidor, carpetaTemporal } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { servirArchivo, elegirCodificacion, enviarJson } from '../src/nucleo/http.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(RAIZ, 'public');
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };

// Un pedido «crudo» (node:http): sin descomprimir nada, para ver los bytes tal como viajan.
function pedir(base, ruta, cabeceras = {}, metodo = 'GET', cuerpo = null) {
  return new Promise((ok, mal) => {
    const url = new URL(ruta, base);
    const req = request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method: metodo, headers: cabeceras }, res => {
      const partes = [];
      res.on('data', p => partes.push(p));
      res.on('end', () => ok({ codigo: res.statusCode, cabeceras: res.headers, cuerpo: Buffer.concat(partes) }));
    });
    req.on('error', mal);
    req.end(cuerpo);
  });
}

function descomprimir(r) {
  const cod = r.cabeceras['content-encoding'];
  if (cod === 'br') return brotliDecompressSync(r.cuerpo);
  if (cod === 'gzip') return gunzipSync(r.cuerpo);
  assert.equal(cod, undefined, `codificación inesperada: ${cod}`);
  return r.cuerpo;
}

const sinHuellas = texto => texto.replace(/\?v=[A-Za-z0-9_-]+/g, '');

function revisarSeguridad(r, que) {
  assert.match(r.cabeceras['content-security-policy'] || '', /default-src 'self'/, `${que}: sin política de seguridad`);
  assert.equal(r.cabeceras['x-frame-options'], 'DENY', que);
  assert.equal(r.cabeceras['x-content-type-options'], 'nosniff', que);
  assert.equal(r.cabeceras['referrer-policy'], 'no-referrer', que);
}

async function conOportia(fn) {
  const db = abrirBase(configDePrueba());
  try {
    await conServidor(crearServidor({ db }), base => fn(base));
  } finally {
    db.close();
  }
}

// Un servidor mínimo que sirve una carpeta propia de la prueba (para poder cambiar sus archivos).
async function conCarpeta(archivos, fn) {
  const carpeta = carpetaTemporal('publica');
  const escribir = (nombre, texto) => {
    mkdirSync(dirname(join(carpeta, nombre)), { recursive: true });
    writeFileSync(join(carpeta, nombre), texto);
  };
  for (const [nombre, texto] of Object.entries(archivos)) escribir(nombre, texto);
  const servidor = createServer((req, res) => {
    const ruta = new URL(req.url, 'http://x').pathname;
    if (!servirArchivo(res, carpeta, ruta, req)) { res.writeHead(404); res.end('no'); }
  });
  await conServidor(servidor, base => fn(base, escribir, carpeta));
}

test('elegir la compresión: brotli o gzip según el navegador; cualquier otra cosa, sin comprimir', () => {
  assert.equal(elegirCodificacion('gzip, deflate, br'), 'br');
  assert.equal(elegirCodificacion('br;q=1.0, gzip;q=0.8, *;q=0.1'), 'br');
  assert.equal(elegirCodificacion('gzip, deflate'), 'gzip');
  assert.equal(elegirCodificacion('gzip;q=1, br;q=0.5'), 'gzip');
  assert.equal(elegirCodificacion('*'), 'br');
  assert.equal(elegirCodificacion('br;q=0, gzip'), 'gzip');
  for (const nada of [undefined, '', 'identity', 'zstd', 'deflate', 'compress, x-raro', 'br;q=0, gzip;q=0', 'br;q=abc', ',,;;', '*;q=0']) {
    assert.equal(elegirCodificacion(nada), null, String(nada));
  }
});

test('los archivos comprimidos (brotli y gzip) se descomprimen exactamente al archivo', async () => {
  await conOportia(async base => {
    for (const nombre of ['estilos.css', 'i18n/es.json', 'i18n/en.json', 'tema.js', 'creador.js', 'dibujos.js', 'icono.svg']) {
      const original = readFileSync(join(PUB, nombre));
      for (const [pide, sale] of [['br', 'br'], ['gzip, deflate', 'gzip'], ['gzip, deflate, br', 'br']]) {
        const r = await pedir(base, `/${nombre}`, { 'accept-encoding': pide });
        assert.equal(r.codigo, 200, nombre);
        assert.equal(r.cabeceras['content-encoding'], sale, `${nombre} con «${pide}»`);
        assert.equal(r.cabeceras.vary, 'Accept-Encoding', nombre);
        assert.ok(r.cuerpo.length < original.length, `${nombre} comprimido no es más chico`);
        assert.equal(Number(r.cabeceras['content-length']), r.cuerpo.length, nombre);
        // creador.js y dibujos.js no importan nada: salen idénticos al archivo.
        assert.ok(descomprimir(r).equals(original), `${nombre} (${sale}) no es el archivo exacto`);
        revisarSeguridad(r, nombre);
      }
    }
    // app.js e index.html llevan las huellas en las direcciones; sin ellas son el archivo exacto.
    for (const ruta of ['/app.js', '/']) {
      const original = readFileSync(join(PUB, ruta === '/' ? 'index.html' : 'app.js'), 'utf8');
      const plano = await pedir(base, ruta, {});
      assert.equal(plano.cabeceras['content-encoding'], undefined);
      const quitarAvisos = texto => texto.replace(/\n {2}<link rel="modulepreload" href="[^"]+">/g, '');
      assert.equal(quitarAvisos(sinHuellas(plano.cuerpo.toString('utf8'))), original, ruta);
      for (const pide of ['br', 'gzip']) {
        const r = await pedir(base, ruta, { 'accept-encoding': pide });
        assert.ok(descomprimir(r).equals(plano.cuerpo), `${ruta} (${pide}) no es igual al que va sin comprimir`);
      }
    }
    // Un .png ya viene comprimido: nunca se vuelve a comprimir.
    const png = await pedir(base, '/icono-180.png', { 'accept-encoding': 'br, gzip' });
    assert.equal(png.cabeceras['content-encoding'], undefined);
    assert.ok(png.cuerpo.equals(readFileSync(join(PUB, 'icono-180.png'))));
  });
});

test('una compresión desconocida (o ninguna) recibe el archivo tal cual', async () => {
  await conOportia(async base => {
    const original = readFileSync(join(PUB, 'estilos.css'));
    for (const pide of [undefined, 'identity', 'zstd', 'deflate', 'compress', 'x-raro, otra', 'br;q=0, gzip;q=0']) {
      const r = await pedir(base, '/estilos.css', pide === undefined ? {} : { 'accept-encoding': pide });
      assert.equal(r.codigo, 200);
      assert.equal(r.cabeceras['content-encoding'], undefined, String(pide));
      assert.ok(r.cuerpo.equals(original), String(pide));
    }
  });
});

test('con el mismo ETag el servidor responde 304 sin cuerpo (y con las cabeceras de seguridad)', async () => {
  await conOportia(async base => {
    for (const [ruta, pide] of [['/estilos.css', 'br'], ['/i18n/es.json', 'gzip'], ['/app.js', ''], ['/', 'br'], ['/configuracion', 'br'], ['/icono-180.png', 'br']]) {
      const primero = await pedir(base, ruta, pide ? { 'accept-encoding': pide } : {});
      assert.equal(primero.codigo, 200, ruta);
      const etag = primero.cabeceras.etag;
      assert.match(etag, /^"[A-Za-z0-9_-]{22}(-br|-gz)?"$/, `${ruta}: ETag fuerte de la huella`);
      for (const condicion of [etag, `W/${etag}`, `"otro", ${etag}`, '*']) {
        const otra = await pedir(base, ruta, { ...(pide ? { 'accept-encoding': pide } : {}), 'if-none-match': condicion });
        assert.equal(otra.codigo, 304, `${ruta} con ${condicion}`);
        assert.equal(otra.cuerpo.length, 0);
        assert.equal(otra.cabeceras.etag, etag);
        assert.equal(otra.cabeceras['cache-control'], 'no-cache', `${ruta}: se sigue revisando cada vez`);
        revisarSeguridad(otra, `${ruta} 304`);
      }
      const distinta = await pedir(base, ruta, { ...(pide ? { 'accept-encoding': pide } : {}), 'if-none-match': '"otra-huella"' });
      assert.equal(distinta.codigo, 200, `${ruta}: con otro ETag va el archivo entero`);
    }
    // Cada forma tiene su propio ETag: el de brotli no sirve para pedir gzip.
    const br = await pedir(base, '/estilos.css', { 'accept-encoding': 'br' });
    const gz = await pedir(base, '/estilos.css', { 'accept-encoding': 'gzip', 'if-none-match': br.cabeceras.etag });
    assert.equal(gz.codigo, 200);
    assert.notEqual(gz.cabeceras.etag, br.cabeceras.etag);
    assert.equal(gz.cabeceras['content-encoding'], 'gzip');
    // HEAD: las mismas cabeceras y nada de cuerpo.
    const cabeza = await pedir(base, '/app.js', { 'accept-encoding': 'br' }, 'HEAD');
    assert.equal(cabeza.codigo, 200);
    assert.equal(cabeza.cuerpo.length, 0);
    assert.equal(cabeza.cabeceras['content-encoding'], 'br');
  });
});

test('index.html pide cada archivo con su huella y avisa de los módulos de app.js; una huella vieja no se guarda', async () => {
  await conOportia(async base => {
    const html = (await pedir(base, '/')).cuerpo.toString('utf8');
    const huellaDe = async ruta => /^"([A-Za-z0-9_-]{22})"$/.exec((await pedir(base, ruta)).cabeceras.etag)[1];
    for (const ruta of ['/tema.js', '/estilos.css', '/app.js', '/icono.svg', '/icono-180.png']) {
      assert.ok(html.includes(`"${ruta}?v=${await huellaDe(ruta)}"`), `index.html no pide ${ruta} con su huella`);
    }
    // Todo lo que app.js importa se avisa desde index.html (y con la misma dirección que usa app.js).
    const app = (await pedir(base, '/app.js')).cuerpo.toString('utf8');
    const importados = [...app.matchAll(/from '\.\/([a-z0-9-]+\.js)\?v=([A-Za-z0-9_-]+)'/g)];
    assert.ok(importados.length >= 2, 'app.js importa sus módulos con huella');
    for (const [, nombre, huella] of importados) {
      assert.equal(huella, await huellaDe(`/${nombre}`), `${nombre}: la huella que usa app.js es la del archivo`);
      assert.ok(html.includes(`<link rel="modulepreload" href="/${nombre}?v=${huella}">`), `falta el aviso de ${nombre}`);
    }
    const original = readFileSync(join(PUB, 'app.js'), 'utf8');
    assert.equal([...original.matchAll(/from '\.\/[a-z0-9-]+\.js'/g)].length, importados.length, 'toda importación lleva huella');
    // Con la huella vigente se guarda un año; sin huella o con una vieja se revisa cada vez.
    const vigente = await pedir(base, `/app.js?v=${await huellaDe('/app.js')}`, { 'accept-encoding': 'br' });
    assert.equal(vigente.cabeceras['cache-control'], 'max-age=31536000, immutable');
    for (const ruta of ['/app.js', '/app.js?v=vieja', '/app.js?v=', '/i18n/es.json', '/']) {
      assert.equal((await pedir(base, ruta)).cabeceras['cache-control'], 'no-cache', ruta);
    }
    // El HTML sigue sin nada incrustado (la política de seguridad no lo dejaría correr).
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  });
});

test('un archivo que cambia tiene otro ETag, y también los que lo nombran (app.js, index.html)', async () => {
  const pagina = '<!doctype html><html><head><link rel="stylesheet" href="/e.css"><script type="module" src="/a.js"></script></head><body></body></html>';
  await conCarpeta({ 'index.html': pagina, 'a.js': "import { b } from './b.js';\nconsole.log(b);\n", 'b.js': "export const b = 'uno';\n", 'e.css': 'body { color: red; }\n' }, async (base, escribir) => {
    const antes = {};
    for (const ruta of ['/', '/a.js', '/b.js', '/e.css']) antes[ruta] = await pedir(base, ruta);
    const huellaB = /"(.{22})"/.exec(antes['/b.js'].cabeceras.etag)[1];
    assert.ok(antes['/a.js'].cuerpo.toString().includes(`from './b.js?v=${huellaB}'`));
    assert.ok(antes['/'].cuerpo.toString().includes(`<link rel="modulepreload" href="/b.js?v=${huellaB}">`));
    // Cambia b.js (mismo largo, a propósito): b.js, a.js e index.html cambian de ETag; e.css no.
    escribir('b.js', "export const b = 'dos';\n");
    const despues = {};
    for (const ruta of ['/', '/a.js', '/b.js', '/e.css']) despues[ruta] = await pedir(base, ruta, { 'if-none-match': antes[ruta].cabeceras.etag });
    for (const ruta of ['/', '/a.js', '/b.js']) {
      assert.equal(despues[ruta].codigo, 200, `${ruta} cambió: va entero`);
      assert.notEqual(despues[ruta].cabeceras.etag, antes[ruta].cabeceras.etag, `${ruta}: ETag nuevo`);
    }
    assert.equal(despues['/b.js'].cuerpo.toString(), "export const b = 'dos';\n");
    assert.equal(despues['/e.css'].codigo, 304, 'e.css no cambió');
    // La dirección con la huella vieja ya no se guarda un año; la nueva sí.
    assert.equal((await pedir(base, `/b.js?v=${huellaB}`)).cabeceras['cache-control'], 'no-cache');
    const nueva = /"(.{22})"/.exec(despues['/b.js'].cabeceras.etag)[1];
    assert.equal((await pedir(base, `/b.js?v=${nueva}`)).cabeceras['cache-control'], 'max-age=31536000, immutable');
    // Lo comprimido también es lo nuevo.
    const br = await pedir(base, '/b.js', { 'accept-encoding': 'br' });
    if (br.cabeceras['content-encoding']) assert.equal(descomprimir(br).toString(), "export const b = 'dos';\n");
    escribir('e.css', 'body { color: blue; }\n');
    const css = await pedir(base, '/e.css', { 'if-none-match': antes['/e.css'].cabeceras.etag });
    assert.equal(css.codigo, 200);
    assert.equal(css.cuerpo.toString(), 'body { color: blue; }\n');
  });
});

test('servirArchivo sigue sin dejar salir de la carpeta (ni con dependencias de index.html o de app.js)', async () => {
  const fuera = carpetaTemporal('fuera');
  writeFileSync(join(fuera, 'secreto.js'), "export const secreto = 'no';\n");
  await conCarpeta({
    'index.html': '<script type="module" src="/../secreto.js"></script><link rel="stylesheet" href="/../../etc/passwd">',
    'a.js': "import { secreto } from '../secreto.js';\nimport '../../../etc/passwd.js';\n",
  }, async (base, _escribir, carpeta) => {
    const html = (await pedir(base, '/')).cuerpo.toString();
    assert.doesNotMatch(html, /\?v=/, 'nada de afuera recibe huella');
    const a = (await pedir(base, '/a.js')).cuerpo.toString();
    assert.doesNotMatch(a, /\?v=/);
    const falso = { writeHead() { throw new Error('no debía responder'); }, end() {} };
    for (const ruta of ['/../secreto.js', '../secreto.js', '/..%2fsecreto.js', '/a.js\0', `/${'../'.repeat(8)}etc/passwd`, '/i18n/../../secreto.js']) {
      assert.equal(servirArchivo(falso, carpeta, ruta), false, ruta);
    }
  });
  await conOportia(async base => {
    for (const ruta of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/i18n/../../src/app.js', '/.env', '/%2e%2e/%2e%2e/etc/passwd']) {
      const r = await pedir(base, ruta, { 'accept-encoding': 'br' });
      const cuerpo = descomprimir(r).toString();
      assert.ok(!cuerpo.includes('"name": "oportia"') && !cuerpo.includes('crearServidor') && !cuerpo.includes('root:'), `${ruta} dejó ver un archivo`);
    }
  });
});

test('las respuestas grandes de la API viajan comprimidas; las chicas, las POST y las de error, no', async () => {
  await conOportia(async base => {
    const json = { 'content-type': 'application/json', 'x-oportia': '1', ...DESDE_TAILSCALE };
    const alta = await pedir(base, '/api/primer-admin', json, 'POST', JSON.stringify({ nombre: 'junior', clave: 'una clave bien larga' }));
    assert.equal(alta.codigo, 201);
    const galleta = alta.cabeceras['set-cookie'][0].split(';')[0];
    assert.equal(alta.cabeceras['content-encoding'], undefined, 'una respuesta con galleta nunca se comprime');
    const plano = await pedir(base, '/api/catalogo', { cookie: galleta });
    assert.equal(plano.cabeceras['content-encoding'], undefined);
    for (const [pide, sale] of [['br', 'br'], ['gzip, deflate', 'gzip'], ['gzip, deflate, br', 'br'], ['zstd', undefined]]) {
      const r = await pedir(base, '/api/catalogo', { cookie: galleta, 'accept-encoding': pide });
      assert.equal(r.codigo, 200);
      assert.equal(r.cabeceras['content-encoding'], sale, pide);
      assert.equal(r.cabeceras.vary, 'Accept-Encoding');
      assert.equal(r.cabeceras['cache-control'], 'no-store', 'la API nunca se guarda');
      assert.deepEqual(JSON.parse(descomprimir(r)), JSON.parse(plano.cuerpo), pide);
      revisarSeguridad(r, `/api/catalogo ${pide}`);
    }
    // Chica (menos de 1 KB): sin comprimir.
    const setup = await pedir(base, '/api/setup', { 'accept-encoding': 'br' });
    assert.equal(setup.cabeceras['content-encoding'], undefined);
    // Una ruta que no está en la lista (aunque sea GET): sin comprimir.
    const yo = await pedir(base, '/api/yo/reinicios', { cookie: galleta, 'accept-encoding': 'br' });
    assert.equal(yo.cabeceras['content-encoding'], undefined);
    // POST con una contraseña temporal: nunca comprimida.
    const nueva = await pedir(base, '/api/admin/usuarios', { ...json, cookie: galleta, 'accept-encoding': 'br' }, 'POST', JSON.stringify({ nombre: 'ana.perez' }));
    assert.equal(nueva.codigo, 201);
    assert.ok(JSON.parse(nueva.cuerpo).claveTemporal);
    assert.equal(nueva.cabeceras['content-encoding'], undefined);
    // Un error: sin comprimir.
    const error = await pedir(base, '/api/proyectos/999', { cookie: galleta, 'accept-encoding': 'br' });
    assert.equal(error.codigo, 404);
    assert.equal(error.cabeceras['content-encoding'], undefined);
    // Las que sí están en la lista (si pasan de 1 KB) se comprimen.
    const usuarios = await pedir(base, '/api/admin/usuarios', { cookie: galleta, 'accept-encoding': 'br' });
    assert.equal(usuarios.codigo, 200);
    if (descomprimir(usuarios).length >= 1024) assert.equal(usuarios.cabeceras['content-encoding'], 'br');
    assert.ok(JSON.parse(descomprimir(usuarios)).usuarios.some(u => u.nombre === 'ana.perez'));
  });
});

test('enviarJson solo comprime GET correctos, grandes, sin galleta y de rutas de la lista', () => {
  const grande = { lista: Array.from({ length: 200 }, (_, i) => ({ i, texto: 'algo que se repite' })) };
  const responder = (metodo, codigo, extra, opciones, aceptadas = 'br') => {
    const res = {
      req: { method: metodo, headers: { 'accept-encoding': aceptadas } },
      writeHead(c, cab) { this.codigo = c; this.cabeceras = cab; },
      end(cuerpo) { this.cuerpo = Buffer.from(cuerpo); },
    };
    enviarJson(res, codigo, grande, extra, opciones);
    return res;
  };
  const si = responder('GET', 200, {}, { comprimir: true });
  assert.equal(si.cabeceras['Content-Encoding'], 'br');
  assert.deepEqual(JSON.parse(brotliDecompressSync(si.cuerpo)), grande);
  assert.equal(si.cabeceras['Cache-Control'], 'no-store');
  assert.equal(si.cabeceras['X-Frame-Options'], 'DENY');
  const gz = responder('GET', 200, {}, { comprimir: true }, 'gzip');
  assert.deepEqual(JSON.parse(gunzipSync(gz.cuerpo)), grande);
  for (const [que, res] of [
    ['POST', responder('POST', 200, {}, { comprimir: true })],
    ['201', responder('GET', 201, {}, { comprimir: true })],
    ['con galleta', responder('GET', 200, { 'Set-Cookie': 'op_sesion=x' }, { comprimir: true })],
    ['con galleta (minúsculas)', responder('GET', 200, { 'set-cookie': 'op_sesion=x' }, { comprimir: true })],
    ['fuera de la lista', responder('GET', 200, {}, {})],
    ['sin compresión conocida', responder('GET', 200, {}, { comprimir: true }, 'zstd')],
  ]) {
    assert.equal(res.cabeceras['Content-Encoding'], undefined, que);
    assert.deepEqual(JSON.parse(res.cuerpo), grande, que);
  }
  // Sin el pedido (respuestas armadas a mano en las pruebas): sin comprimir.
  const suelto = { writeHead(c, cab) { this.cabeceras = cab; }, end(cuerpo) { this.cuerpo = cuerpo; } };
  enviarJson(suelto, 200, grande, {}, { comprimir: true });
  assert.equal(suelto.cabeceras['Content-Encoding'], undefined);
});
