// Pruebas del servidor de la fase 0. No usan internet: solo hablan con un servidor local de prueba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crearServidor, VERSION } from '../src/app.js';

const paquete = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

async function conServidor(fn) {
  const servidor = crearServidor();
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await fn(base); } finally { await new Promise(ok => servidor.close(ok)); }
}

test('/api/setup responde 200 con la app y la versión instalada', async () => {
  await conServidor(async base => {
    const r = await fetch(`${base}/api/setup`);
    assert.equal(r.status, 200);
    const datos = await r.json();
    assert.equal(datos.app, 'oportia');
    assert.equal(datos.version, paquete.version);
    assert.equal(VERSION, paquete.version);
  });
});

test('/sw.js se sirve como JavaScript (borra la app vieja de JARVIS del navegador)', async () => {
  await conServidor(async base => {
    const r = await fetch(`${base}/sw.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.match(await r.text(), /unregister/);
  });
});

test('una ruta /api desconocida responde 404 en JSON', async () => {
  await conServidor(async base => {
    const r = await fetch(`${base}/api/no-existe`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type'), /json/);
  });
});

test('la página principal dice OPORTIA', async () => {
  await conServidor(async base => {
    const r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /OPORTIA/);
  });
});

test('arrancar el servidor no borra ningún archivo de la carpeta de datos', async () => {
  const datos = join(mkdtempSync(join(tmpdir(), 'oportia-')), 'jarvis');
  mkdirSync(join(datos, 'backups'), { recursive: true });
  const archivos = ['jarvis.db', 'oportia.db', 'secrets.env', 'version.txt', 'update.log', 'backups/copia.db'];
  for (const f of archivos) writeFileSync(join(datos, f), 'x');
  const antes = process.env.DB_PATH;
  process.env.DB_PATH = join(datos, 'jarvis.db');
  try {
    await conServidor(async base => { await fetch(`${base}/api/setup`); });
  } finally {
    if (antes === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = antes;
  }
  for (const f of archivos) assert.ok(existsSync(join(datos, f)), `se borró ${f}`);
});

test('una dirección mal formada no tumba el servidor: responde 400 y sigue funcionando', async () => {
  const { connect } = await import('node:net');
  await conServidor(async base => {
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
});
