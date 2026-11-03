// Pruebas del servidor de la fase 0. No usan internet: solo hablan con un servidor local de prueba.
import { configDePrueba, conServidor, peticionSimulada, carpetaTemporal } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearServidor, VERSION } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';

const paquete = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('/api/setup responde 200 con la app, la versión instalada y la base lista', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const r = await fetch(`${base}/api/setup`);
    assert.equal(r.status, 200);
    const datos = await r.json();
    assert.equal(datos.app, 'oportia');
    assert.equal(datos.version, paquete.version);
    assert.equal(VERSION, paquete.version);
    assert.equal(datos.base.estado, 'ok');
    assert.ok(datos.base.version >= 1);
  });
  db.close();
});

test('/api/setup responde 503 si la base no está disponible (así el servidor vuelve a la versión anterior)', async () => {
  await conServidor(crearServidor({ db: null }), async base => {
    const r = await fetch(`${base}/api/setup`);
    assert.equal(r.status, 503);
  });
});

test('/sw.js se sirve como JavaScript (borra la app vieja de JARVIS del navegador)', async () => {
  await conServidor(crearServidor(), async base => {
    const r = await fetch(`${base}/sw.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.match(await r.text(), /unregister/);
  });
});

test('una ruta /api desconocida responde 404 en JSON', async () => {
  await conServidor(crearServidor(), async base => {
    const r = await fetch(`${base}/api/no-existe`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /json/);
  });
});

test('la página principal dice OPORTIA', async () => {
  await conServidor(crearServidor(), async base => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /OPORTIA/);
  });
});

test('la puerta abierta a internet (IP pública) queda cerrada', async () => {
  const servidor = crearServidor();
  for (const direccionLocal of ['203.0.113.5', '::ffff:203.0.113.5', '10.17.0.5', '2001:db8::1']) {
    const r = await peticionSimulada(servidor, { url: '/api/setup', direccionLocal });
    assert.equal(r.codigo, 403, `debió cerrarse para ${direccionLocal}`);
  }
});

test('el enlace seguro (llega desde el propio servidor) y la red Tailscale sí entran', async () => {
  const servidor = crearServidor();
  for (const direccionLocal of ['127.0.0.1', '::ffff:127.0.0.1', '::1', '100.101.2.3', 'fd7a:115c:a1e0::1']) {
    const r = await peticionSimulada(servidor, { url: '/', direccionLocal });
    assert.equal(r.codigo, 200, `debió entrar por ${direccionLocal}`);
  }
});

test('arrancar no borra ningún archivo que ya existía en la carpeta de datos', async () => {
  const datos = join(carpetaTemporal(), 'jarvis');
  mkdirSync(join(datos, 'backups'), { recursive: true });
  const archivos = ['jarvis.db', 'secrets.env', 'version.txt', 'update.log', 'public-url.txt', 'backups/copia.db'];
  for (const f of archivos) writeFileSync(join(datos, f), `contenido ${f}`);
  const db = abrirBase({ archivoBase: join(datos, 'oportia.db'), carpetaCopias: join(datos, 'oportia-copias') });
  await conServidor(crearServidor({ db }), async base => { await fetch(`${base}/api/setup`); });
  db.close();
  for (const f of archivos) {
    assert.ok(existsSync(join(datos, f)), `se borró ${f}`);
    assert.equal(readFileSync(join(datos, f), 'utf8'), `contenido ${f}`, `se cambió ${f}`);
  }
});
