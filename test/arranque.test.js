// Prueba de arranque REAL: inicia src/server.js como lo hace el servidor (con DB_PATH apuntando a una
// carpeta de datos de prueba llena de archivos) y comprueba, con huellas digitales, que no cambió ni
// desapareció ningún archivo que ya existía. Es la promesa principal de OPORTIA: nunca borrar datos.
import { carpetaTemporal } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function huellas(carpeta) {
  const lista = {};
  (function recorrer(dir) {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else lista[relative(carpeta, ruta)] = createHash('sha256').update(readFileSync(ruta)).digest('hex');
    }
  })(carpeta);
  return lista;
}

test('al arrancar el servidor completo, ningún archivo existente cambia ni desaparece', async () => {
  const datos = join(carpetaTemporal(), 'jarvis');
  mkdirSync(join(datos, 'backups'), { recursive: true });
  mkdirSync(join(datos, 'data'), { recursive: true });
  for (const f of ['jarvis.db', 'jarvis.db-wal', 'secrets.env', 'version.txt', 'version.bad', 'update.log', 'public-url.txt', 'funnel.log', '.instalado', 'backups/copia.jvbk', 'data/otro.txt']) {
    writeFileSync(join(datos, f), `contenido de ${f}`);
  }
  const antes = huellas(datos);

  const hijo = spawn(process.execPath, ['--no-warnings', 'src/server.js'], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', PORT: '0', HOST: '127.0.0.1', DB_PATH: join(datos, 'jarvis.db'), BACKUP_DIR: join(datos, 'backups') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', d => { salida += d; });
  hijo.stderr.on('data', d => { salida += d; });
  try {
    const puerto = await new Promise((ok, mal) => {
      const limite = setTimeout(() => mal(new Error(`El servidor no arrancó a tiempo. Salida: ${salida}`)), 10000);
      hijo.stdout.on('data', () => {
        const m = salida.match(/escuchando en 127\.0\.0\.1:(\d+)/);
        if (m) { clearTimeout(limite); ok(Number(m[1])); }
      });
      hijo.on('exit', codigo => { clearTimeout(limite); mal(new Error(`El servidor se cerró (código ${codigo}). Salida: ${salida}`)); });
    });
    const r = await fetch(`http://127.0.0.1:${puerto}/api/setup`);
    assert.equal(r.status, 200, `respuesta de /api/setup. Salida: ${salida}`);
    assert.equal((await r.json()).base.estado, 'ok');
  } finally {
    await new Promise(ok => { hijo.once('exit', ok); hijo.kill('SIGTERM'); setTimeout(() => { hijo.kill('SIGKILL'); ok(); }, 5000).unref(); });
  }

  const despues = huellas(datos);
  for (const [archivo, huella] of Object.entries(antes)) {
    assert.ok(archivo in despues, `desapareció ${archivo}`);
    assert.equal(despues[archivo], huella, `cambió ${archivo}`);
  }
  const nuevos = Object.keys(despues).filter(a => !(a in antes));
  for (const a of nuevos) assert.match(a, /^oportia/, `apareció un archivo que no es de OPORTIA: ${a}`);
});
