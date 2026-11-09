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

// En modo de prueba, nunca se escribe fuera de la carpeta temporal del sistema. La usan también otros archivos
// que escriben junto a la base (por ejemplo, la llave de las claves en src/claves/cifrado.js).
export function revisarModoPrueba(...rutas) {
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
// Se puede anidar (un trabajo puede llamar a otro que también usa enTransaccion):
//  - la de afuera abre BEGIN IMMEDIATE: toma el permiso de escribir de una vez, así nunca falla a mitad
//    porque otro proceso (el trabajador o las pantallas) escribió primero;
//  - las de adentro abren un SAVEPOINT: si fallan, se deshace SOLO lo de adentro (si quien llama atrapa
//    el error); si falla la de afuera, se deshace todo.
// Nunca acepta trabajo asíncrono: una espera (await) con la base tomada congelaría las pantallas, y lo
// que se hiciera después de la espera quedaría fuera de la transacción.
const profundidad = new WeakMap();

function esAsincrona(funcion) {
  const tipo = Object.prototype.toString.call(funcion);
  return tipo === '[object AsyncFunction]' || tipo === '[object AsyncGeneratorFunction]';
}

function errorAsincrono() {
  return Object.assign(new Error('enTransaccion no acepta trabajo asíncrono: nada de esperas con la base tomada'), { codigo: 'transaccion_asincrona' });
}

export function enTransaccion(db, trabajo) {
  if (typeof trabajo !== 'function') throw new TypeError('enTransaccion necesita una función');
  if (esAsincrona(trabajo)) throw errorAsincrono();
  const nivel = profundidad.get(db) ?? 0;
  const punto = `oportia_sp${nivel}`;
  db.exec(nivel === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${punto}`);
  profundidad.set(db, nivel + 1);
  try {
    const resultado = trabajo();
    if (resultado && typeof resultado.then === 'function') {
      // Se deshace todo y se avisa. La promesa se atiende aquí para que su error no tumbe el proceso.
      Promise.resolve(resultado).catch(() => {});
      throw errorAsincrono();
    }
    db.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${punto}`);
    return resultado;
  } catch (error) {
    try {
      db.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${punto}; RELEASE ${punto}`);
    } catch (errorAlDeshacer) {
      // SQLite ya deshizo la transacción entera por su cuenta (disco lleno, por ejemplo). Si esto pasó
      // adentro, la de afuera ya no existe: se avisa con el error original para que nadie siga escribiendo.
      if (nivel > 0) error.transaccionPerdida = true;
    }
    throw error;
  } finally {
    profundidad.set(db, nivel);
  }
}

// Para el trabajador (el otro proceso): abre una base de OPORTIA que YA existe y ya está al día.
// Nunca la crea, nunca le aplica cambios, nunca copia ni compacta: eso solo lo hace el servidor web al
// arrancar (abrirBase). Si algo no cuadra, lanza un error con `codigo`:
// 'base_no_existe' | 'base_ajena' | 'base_sin_wal' | 'base_vieja'.
export function conectarBase({ archivoBase }, { versionMinima = 0 } = {}) {
  revisarModoPrueba(archivoBase);
  const falla = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });
  if (!existsSync(archivoBase) || statSync(archivoBase).size === 0) throw falla('base_no_existe', `No existe la base ${archivoBase}`);
  if (leerMarca(archivoBase) !== ID_APLICACION) throw falla('base_ajena', `El archivo ${archivoBase} no es de OPORTIA: no se toca.`);
  const db = new DatabaseSync(archivoBase);
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    if (db.prepare('PRAGMA journal_mode').get().journal_mode !== 'wal') throw falla('base_sin_wal', 'La base no está en modo WAL');
    db.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
    let version = 0;
    try { version = db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v ?? 0; } catch { version = 0; }
    if (version < versionMinima) throw falla('base_vieja', `La base está en la versión ${version} y hace falta la ${versionMinima}`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// Fase 1, parte e: una FOTO de la base para las copias (src/copias/). Abre una conexión aparte, de SOLO LECTURA, y
// empieza una transacción de lectura: todo lo que se lea con ella ve la base tal como estaba en ese momento (la «foto»
// del modo WAL), aunque las pantallas y el trabajador sigan escribiendo. Nunca copia el archivo -wal a mano: las filas
// se leen a través de SQLite. Nunca escribe nada. Mientras está abierta, SQLite no puede pasar el -wal más allá de
// la foto (crece un poco): quien la usa la cierra apenas termina (cerrar(), en un finally). Es la única función de
// fuera de este archivo que deja una transacción abierta, y solo de lectura.
export function abrirFotoDeLectura({ archivoBase }) {
  revisarModoPrueba(archivoBase);
  const falla = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });
  if (!existsSync(archivoBase) || statSync(archivoBase).size === 0) throw falla('base_no_existe', `No existe la base ${archivoBase}`);
  if (leerMarca(archivoBase) !== ID_APLICACION) throw falla('base_ajena', `El archivo ${archivoBase} no es de OPORTIA: no se toca.`);
  const foto = new DatabaseSync(archivoBase, { readOnly: true });
  try {
    foto.exec('PRAGMA busy_timeout = 5000;');
    foto.exec('BEGIN'); // DEFERRED: la foto empieza con la primera lectura, la de la línea siguiente
    foto.prepare('SELECT COUNT(*) AS n FROM sqlite_schema').get();
  } catch (error) {
    try { foto.close(); } catch { /* ya estaba cerrada */ }
    throw error;
  }
  let cerrada = false;
  return {
    db: foto,
    cerrar() {
      if (cerrada) return;
      cerrada = true;
      try { foto.exec('COMMIT'); } catch { /* solo lectura: nada que guardar */ }
      try { foto.close(); } catch { /* ya estaba cerrada */ }
    },
  };
}
