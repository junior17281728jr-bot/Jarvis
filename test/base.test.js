// Pruebas de la base de datos propia de OPORTIA.
import { configDePrueba, carpetaTemporal } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBase, estadoBase, ID_APLICACION } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { leerConfig } from '../src/nucleo/config.js';

test('crea su base nueva, marcada como de OPORTIA, con todos los cambios aplicados', () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  assert.equal(db.prepare('PRAGMA application_id').get().application_id, ID_APLICACION);
  assert.equal(estadoBase(db).version, Math.max(...MIGRACIONES.map(m => m.id)));
  db.close();
});

test('abrirla otra vez no repite cambios ni hace copias innecesarias', () => {
  const config = configDePrueba();
  abrirBase(config).close();
  const db = abrirBase(config);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM oportia_migraciones').get().n, MIGRACIONES.length);
  db.close();
  assert.ok(!existsSync(config.carpetaCopias) || readdirSync(config.carpetaCopias).length === 0);
});

test('antes de aplicar un cambio nuevo a una base con datos, guarda una copia completa que se puede abrir', () => {
  const config = configDePrueba();
  const db1 = abrirBase(config);
  db1.prepare('INSERT INTO auditoria (fecha, accion) VALUES (?, ?)').run('2026-11-03', 'dato importante');
  db1.close();
  const nueva = { id: 999, nombre: 'prueba', sql: 'CREATE TABLE IF NOT EXISTS prueba_nueva (id INTEGER PRIMARY KEY)' };
  const db2 = abrirBase(config, [...MIGRACIONES, nueva]);
  db2.close();
  const copias = readdirSync(config.carpetaCopias);
  assert.equal(copias.length, 1);
  const copia = new DatabaseSync(join(config.carpetaCopias, copias[0]), { readOnly: true });
  assert.equal(copia.prepare('SELECT accion FROM auditoria').get().accion, 'dato importante');
  copia.close();
});

test('si un cambio falla, la base queda exactamente como estaba', () => {
  const config = configDePrueba();
  abrirBase(config).close();
  const rota = { id: 998, nombre: 'rota', sql: 'CREATE TABLE a_medias (id INTEGER); ESTO NO ES SQL;' };
  assert.throws(() => abrirBase(config, [...MIGRACIONES, rota]), /No se pudo aplicar el cambio 998/);
  const db = abrirBase(config);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'a_medias'").get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM oportia_migraciones WHERE id = 998').get().n, 0);
  db.close();
});

test('nunca toca un archivo con su nombre que no sea de OPORTIA', () => {
  const raiz = carpetaTemporal();
  const ajeno = join(raiz, 'oportia.db');
  const otra = new DatabaseSync(ajeno);
  otra.exec("CREATE TABLE usuarios (id INTEGER); INSERT INTO usuarios VALUES (7);");
  otra.close();
  const antes = readFileSync(ajeno);
  assert.throws(() => abrirBase({ archivoBase: ajeno, carpetaCopias: join(raiz, 'copias') }), /no es de OPORTIA/);
  assert.deepEqual(readFileSync(ajeno), antes);
});

test('usa su propio archivo y su propia carpeta de copias, nunca los de JARVIS', () => {
  const c = leerConfig({ DB_PATH: '/srv/x/jarvis/jarvis.db', BACKUP_DIR: '/srv/x/jarvis/backups' });
  assert.equal(c.archivoBase, '/srv/x/jarvis/oportia.db');
  assert.equal(c.carpetaCopias, '/srv/x/jarvis/oportia-copias');
});

test('en modo de prueba se niega a usar /var/lib (los datos reales)', () => {
  assert.throws(() => leerConfig({ OPORTIA_TEST: '1', DB_PATH: '/var/lib/jarvis/jarvis.db' }), /\/var\/lib/);
});

test('un jarvis.db que esté al lado queda intacto', () => {
  const config = configDePrueba();
  mkdirSync(join(config.raiz, 'datos'), { recursive: true });
  const viejo = join(config.raiz, 'datos', 'jarvis.db');
  writeFileSync(viejo, 'datos de jarvis');
  abrirBase(config).close();
  assert.equal(readFileSync(viejo, 'utf8'), 'datos de jarvis');
});

test('la marca de OPORTIA queda en el archivo principal, aunque se pierda el archivo -wal', () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const cabecera = readFileSync(config.archivoBase).subarray(0, 100);
  assert.equal(cabecera.readUInt32BE(68), ID_APLICACION);
  db.close();
});

test('un archivo ajeno en modo WAL, con su -wal, no se modifica en absoluto', () => {
  const raiz = carpetaTemporal();
  const original = join(raiz, 'otra.db');
  const otra = new DatabaseSync(original);
  otra.exec("PRAGMA journal_mode = WAL; CREATE TABLE t (x); INSERT INTO t VALUES (1);");
  // Copia el archivo y su -wal mientras la otra base sigue abierta (como si se hubiera cerrado mal).
  const ajeno = join(raiz, 'oportia.db');
  copyFileSync(original, ajeno);
  copyFileSync(`${original}-wal`, `${ajeno}-wal`);
  otra.close();
  const antes = readFileSync(ajeno);
  const antesWal = readFileSync(`${ajeno}-wal`);
  assert.throws(() => abrirBase({ archivoBase: ajeno, carpetaCopias: join(raiz, 'copias') }), /no es de OPORTIA/);
  assert.deepEqual(readFileSync(ajeno), antes, 'el archivo principal cambió');
  assert.ok(existsSync(`${ajeno}-wal`), 'se borró su archivo -wal');
  assert.deepEqual(readFileSync(`${ajeno}-wal`), antesWal, 'el archivo -wal cambió');
});

test('un archivo con ese nombre que no es una base de datos tampoco se toca', () => {
  const raiz = carpetaTemporal();
  const ajeno = join(raiz, 'oportia.db');
  writeFileSync(ajeno, 'esto no es una base de datos, pero es de alguien');
  assert.throws(() => abrirBase({ archivoBase: ajeno, carpetaCopias: join(raiz, 'copias') }), /no es de OPORTIA/);
  assert.equal(readFileSync(ajeno, 'utf8'), 'esto no es una base de datos, pero es de alguien');
});
