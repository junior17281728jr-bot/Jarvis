// Herramienta de rescate (deploy/oportia-admin.mjs): recupera o crea el administrador desde la Consola.
import { carpetaTemporal, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { leerConfig } from '../src/nucleo/config.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function prepararServidorDePrueba() {
  const raiz = carpetaTemporal();
  mkdirSync(join(raiz, 'jarvis'));
  const archivoEnv = join(raiz, '.env');
  writeFileSync(archivoEnv, `PORT=8080\nHOST=0.0.0.0\nDB_PATH=${join(raiz, 'jarvis', 'jarvis.db')}\n`);
  return { raiz, archivoEnv };
}

function rescatar(archivoEnv, ...argumentos) {
  return spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs', ...argumentos], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', OPORTIA_ENV_FILE: archivoEnv },
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('si no hay administrador, lo crea con una clave temporal que hay que cambiar al entrar', async () => {
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  const salida = rescatar(archivoEnv, 'junior');
  assert.equal(salida.status, 0, salida.stderr);
  const temporal = salida.stdout.match(/Contraseña temporal: (\S+)/)[1];
  assert.match(salida.stdout, /Usuario: junior/);

  const db = abrirBase(leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') }));
  await conServidor(crearServidor({ db }), async base => {
    const r = await fetch(`${base}/api/entrar`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'junior', clave: temporal }) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).usuario.debeCambiarClave, true);
  });
  db.close();
});

test('si el administrador existe, le pone una clave temporal nueva sin borrar nada', () => {
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  assert.equal(rescatar(archivoEnv, 'junior').status, 0);
  const segunda = rescatar(archivoEnv);
  assert.equal(segunda.status, 0, segunda.stderr);
  assert.match(segunda.stdout, /Usuario: junior/);
  const db = abrirBase(leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') }));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 1, 'no se creó ni se borró a nadie');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'acceso_recuperado_consola'").get().n, 1);
  db.close();
});

test('rechaza un nombre no válido', () => {
  const { archivoEnv } = prepararServidorDePrueba();
  const salida = rescatar(archivoEnv, 'nombre con espacios');
  assert.equal(salida.status, 2);
});

test('fuera del modo de prueba se niega a correr como root (para no dañar los permisos de la base)', { skip: process.getuid?.() !== 0 }, () => {
  const { archivoEnv } = prepararServidorDePrueba();
  const salida = spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs'], {
    cwd: RAIZ, env: { PATH: process.env.PATH, OPORTIA_ENV_FILE: archivoEnv }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(salida.status, 2);
  assert.match(salida.stderr, /No lo ejecutes como root/);
});
