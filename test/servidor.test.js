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
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const r = await fetch(`${base}/api/no-existe`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /json/);
  });
  db.close();
});

test('la página principal dice Academia ENALAS (0.7.0)', async () => {
  await conServidor(crearServidor(), async base => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Academia ENALAS/);
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
  for (const host of ['jarvis', 'jarvis:8080', 'JARVIS.taila693e9.ts.net', 'jarvis.taila693e9.ts.net.:8080']) {
    const r = await peticionSimulada(servidor, { url: '/', direccionLocal: '100.101.2.3', direccionRemota: '100.90.0.1', host });
    assert.equal(r.codigo, 200, `el nombre ${host} es del servidor`);
  }
});

test('por la red Tailscale, un nombre inventado (DNS rebinding) se rechaza', async () => {
  const servidor = crearServidor();
  for (const host of ['malo.example', 'malo.example:8080', '', 'jarvis.otra.ts.net', '100.101.2.3.malo.example', 'localhost']) {
    const r = await peticionSimulada(servidor, { url: '/api/setup', direccionLocal: '100.101.2.3', direccionRemota: '100.90.0.1', host });
    assert.equal(r.codigo, 421, `${host || '(vacío)'} debió rechazarse`);
  }
  // Por el enlace https (llega desde el mismo servidor) el nombre lo pone Tailscale: no se rechaza.
  const r = await peticionSimulada(servidor, { url: '/', direccionLocal: '127.0.0.1', host: 'cualquiera.example' });
  assert.equal(r.codigo, 200);
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

test('una dirección mal formada no tumba el servidor: responde 400 y sigue funcionando', async () => {
  const { connect } = await import('node:net');
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const puerto = Number(new URL(base).port);
    for (const destino of ['//a:b', '//a:99999', '//%5B']) {
      const respuesta = await new Promise((ok, mal) => {
        const s = connect(puerto, '127.0.0.1', () => s.write(`GET ${destino} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
        let datos = '';
        s.on('data', d => { datos += d; });
        s.on('end', () => ok(datos));
        s.on('error', mal);
      });
      assert.match(respuesta, /^HTTP\/1\.1 400/, `respuesta para ${destino}`);
    }
    const r = await fetch(`${base}/api/setup`);
    assert.equal(r.status, 200, 'el servidor sigue vivo');
  });
  db.close();
});

test('una dirección mal formada también responde 400 cuando llega por la puerta simulada', async () => {
  const servidor = crearServidor();
  const r = await peticionSimulada(servidor, { url: '//a:b', direccionLocal: '127.0.0.1' });
  assert.equal(r.codigo, 400);
});
