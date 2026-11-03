// Base de datos de OPORTIA (SQLite incluido en Node). Reglas de seguridad:
//  - Usa SOLO su propio archivo (oportia.db). Nunca abre, cambia ni borra otros archivos.
//  - Si encuentra un archivo con ese nombre que no es de OPORTIA, no lo toca y avisa.
//  - Antes de aplicar cambios a una base que ya tiene datos, guarda una copia completa.
//  - Cada cambio va dentro de una transacción: si falla, la base queda como estaba.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

export function abrirBase({ archivoBase, carpetaCopias }, migraciones = MIGRACIONES) {
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
