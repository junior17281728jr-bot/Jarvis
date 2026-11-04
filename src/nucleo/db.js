// Base de datos de OPORTIA (SQLite incluido en Node). Reglas de seguridad:
//  - Usa SOLO su propio archivo (oportia.db). Nunca abre, cambia ni borra otros archivos.
//  - Si encuentra un archivo con ese nombre que no es de OPORTIA, no lo toca y avisa.
//  - Antes de aplicar cambios a una base que ya tiene datos, guarda una copia completa.
//  - Cada cambio va dentro de una transacción: si falla, la base queda como estaba.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { MIGRACIONES } from './migraciones.js';

export const ID_APLICACION = 0x4f505254; // "OPRT": marca los archivos que son de OPORTIA

function ahora() { return new Date().toISOString(); }

// Lee la cabecera del archivo SIN abrirlo como base de datos, para no modificar nunca un archivo ajeno.
function leerMarca(archivo) {
  const fd = openSync(archivo, 'r');
  try {
    const cabecera = Buffer.alloc(100);
    const leidos = readSync(fd, cabecera, 0, 100, 0);
    if (leidos < 100 || cabecera.toString('latin1', 0, 16) !== 'SQLite format 3\0') return null;
    return cabecera.readUInt32BE(68); // aquí guarda SQLite el "application_id"
  } finally {
    closeSync(fd);
  }
}

// En modo de prueba, nunca se escribe fuera de la carpeta temporal del sistema.
function revisarModoPrueba(...rutas) {
  if (process.env.OPORTIA_TEST !== '1') return;
  const temporal = resolve(tmpdir()) + sep;
  for (const ruta of rutas) {
    if (!resolve(ruta).startsWith(temporal)) throw new Error(`Modo de prueba: no se permite escribir en ${ruta}`);
  }
}

export function abrirBase({ archivoBase, carpetaCopias }, migraciones = MIGRACIONES) {
  revisarModoPrueba(archivoBase, carpetaCopias);
  const existia = existsSync(archivoBase) && statSync(archivoBase).size > 0;
  if (existia && leerMarca(archivoBase) !== ID_APLICACION) {
    throw new Error(`El archivo ${archivoBase} existe y no es de OPORTIA: no se toca.`);
  }
  mkdirSync(dirname(archivoBase), { recursive: true });
  const db = new DatabaseSync(archivoBase);
  try {
    // La marca se escribe ANTES de pasar a modo WAL, para que quede guardada en el archivo principal.
    if (!existia) db.exec(`PRAGMA application_id = ${ID_APLICACION};`);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    db.exec(`CREATE TABLE IF NOT EXISTS oportia_migraciones (
      id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, aplicada_en TEXT NOT NULL)`);

    const hechas = new Set(db.prepare('SELECT id FROM oportia_migraciones').all().map(f => f.id));
    const pendientes = migraciones.filter(m => !hechas.has(m.id)).sort((a, b) => a.id - b.id);
    if (pendientes.length && hechas.size > 0) {
      // La base ya tenía cambios aplicados: copia completa antes de tocarla.
      mkdirSync(carpetaCopias, { recursive: true });
      const sello = ahora().replace(/[:.]/g, '-');
      const destino = join(carpetaCopias, `oportia-antes-m${pendientes[0].id}-${sello}.db`);
      db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    }
    for (const m of pendientes) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(m.sql);
        db.prepare('INSERT INTO oportia_migraciones (id, nombre, aplicada_en) VALUES (?, ?, ?)').run(m.id, m.nombre, ahora());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw new Error(`No se pudo aplicar el cambio ${m.id} (${m.nombre}): ${error.message}`);
      }
    }
    // Deja el archivo principal completo (sin depender del archivo -wal) después de los cambios.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function estadoBase(db) {
  const version = db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v ?? 0;
  return { estado: 'ok', version };
}

// Hace un trabajo completo o nada: si algo falla a mitad, la base queda como estaba.
// Se puede anidar: la de afuera abre BEGIN IMMEDIATE (toma el permiso de escribir de una vez, así nunca falla a
// mitad por otro proceso que también escribe); las de adentro abren un SAVEPOINT. Un error adentro deshace solo
// lo de adentro (si quien llama lo atrapa); un error afuera deshace todo.
// Nunca acepta trabajo asíncrono: una espera (await) con la base bloqueada congelaría las pantallas.
const profundidad = new WeakMap();

function esAsincrona(funcion) {
  const nombre = funcion?.constructor?.name;
  return nombre === 'AsyncFunction' || nombre === 'AsyncGeneratorFunction';
}

export function enTransaccion(db, trabajo) {
  if (typeof trabajo !== 'function') throw new TypeError('enTransaccion necesita una función');
  if (esAsincrona(trabajo)) throw new Error('enTransaccion no acepta trabajo asíncrono');
  const nivel = profundidad.get(db) ?? 0;
  const punto = `oportia_sp${nivel}`;
  db.exec(nivel === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${punto}`);
  profundidad.set(db, nivel + 1);
  try {
    const resultado = trabajo();
    if (resultado && typeof resultado.then === 'function') {
      resultado.then(null, () => {}); // el error real es este: se avisa abajo y la promesa no tumba el proceso
      throw new Error('enTransaccion no acepta trabajo asíncrono');
    }
    db.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${punto}`);
    return resultado;
  } catch (error) {
    try {
      db.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${punto}; RELEASE ${punto}`);
    } catch { /* SQLite ya la había deshecho sola */ }
    throw error;
  } finally {
    profundidad.set(db, nivel);
  }
}

// Para el trabajador (otro proceso): abre una base de OPORTIA que YA existe. Nunca la crea, nunca aplica
// cambios de base, nunca copia ni compacta: eso solo lo hace el servidor web al arrancar.
// Si algo no cuadra, avisa con un error que lleva `codigo`:
// 'base_no_existe' | 'base_ajena' | 'base_sin_wal' | 'base_vieja'.
export function conectarBase({ archivoBase }, { versionMinima = 0 } = {}) {
  revisarModoPrueba(archivoBase);
  const falla = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });
  if (!existsSync(archivoBase) || statSync(archivoBase).size === 0) throw falla('base_no_existe', `No existe la base ${archivoBase}`);
  if (leerMarca(archivoBase) !== ID_APLICACION) throw falla('base_ajena', `El archivo ${archivoBase} no es de OPORTIA: no se toca.`);
  const db = new DatabaseSync(archivoBase);
  try {
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'wal') throw falla('base_sin_wal', 'La base no está en modo WAL');
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
    let version = 0;
    try { version = db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v ?? 0; } catch { version = 0; }
    if (version < versionMinima) throw falla('base_vieja', `La base está en la versión ${version} y hace falta la ${versionMinima}`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
