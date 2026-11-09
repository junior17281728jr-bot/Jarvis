// Ayuda común para las pruebas de las copias (no es un archivo *.test.js): bases pequeñas con filas en TODAS las tablas,
// la clave de recuperación FIJA de prueba (su llave pública está en PUBLICAS_DE_PRUEBA: nunca puede ser la activa de
// un servidor), y una copia completa hecha a mano como la hará la tarea del paso 2 (a archivos o al Telegram falso).
import './ayuda.js';
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { configDePrueba } from './ayuda.js';
import { abrirBase, abrirFotoDeLectura, ID_APLICACION } from '../src/nucleo/db.js';
import { textoDeClave, derivar } from '../src/copias/clave.js';
import { generarCopia } from '../src/copias/generar.js';
import { armarIndice, nombreParte, nombreIndice, sha256Hex } from '../src/copias/formato.js';
import { TELEGRAM } from '../src/canales/telegram.js';
import { crearCredencial } from '../src/canales/credencial.js';
import { guardarSecreto } from '../src/claves/almacen.js';
import { crearPrimerAdmin } from '../src/cuentas/usuarios.js';

export const SEMILLA_DE_PRUEBA = createHash('sha256').update('oportia-clave-de-prueba-v1').digest().subarray(0, 16);
export const CLAVE_DE_PRUEBA = textoDeClave(Buffer.from(SEMILLA_DE_PRUEBA));
export const llavesDePrueba = () => derivar(Buffer.from(SEMILLA_DE_PRUEBA));
export const claveAnthropicFalsa = () => ['sk', 'ant', 'api03', `prueba${'q'.repeat(32)}`].join('-');

const comillas = n => `"${String(n).replace(/"/g, '""')}"`;

// Un valor de prueba para una columna (por su tipo declarado). k: número de fila.
function valorPara(tipo, nombre, k) {
  const t = String(tipo).toUpperCase();
  if (t.includes('INT')) return BigInt(k);
  if (t.includes('REAL')) return k + 0.25;
  if (t.includes('BLOB')) return Buffer.from([k, 0, 255, 10, 13]);
  return `${nombre}-${k}-ñ€\n"'`;
}

// Pone filas en CADA tabla de la base (respetando sus llaves foráneas, que apuntan a la fila 1 de la otra tabla).
// Nunca toca columnas con DEFAULT salvo las llaves foráneas: así pasan los CHECK que haya.
export function llenarTodas(db, { filasPorTabla = 2 } = {}) {
  const tablas = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(f => f.name)
    .filter(t => t !== 'oportia_migraciones'); // ya tiene sus filas de verdad
  const llenas = new Set();
  const pendientes = [...tablas];
  let vueltas = 0;
  while (pendientes.length && vueltas++ < 200) {
    const tabla = pendientes.shift();
    const fks = db.prepare('SELECT "table" AS destino, "from" AS columna FROM pragma_foreign_key_list(?)').all(tabla);
    if (fks.some(f => f.destino !== tabla && !llenas.has(f.destino) && tablas.includes(f.destino))) { pendientes.push(tabla); continue; }
    const columnas = db.prepare('SELECT name, type, "notnull" AS nn, dflt_value AS def, pk FROM pragma_table_xinfo(?)').all(tabla);
    const yaHay = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${comillas(tabla)}`).get().n);
    for (let k = yaHay + 1; k <= yaHay + filasPorTabla; k++) {
      const usar = columnas.filter(c => (c.nn && c.def == null && !(c.pk && /INT/i.test(c.type))) || fks.some(f => f.columna === c.name) || (c.def == null && !c.pk));
      const valores = usar.map(c => {
        const fk = fks.find(f => f.columna === c.name);
        if (fk) {
          if (fk.destino === tabla) return null;
          const n = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${comillas(fk.destino)}`).get().n);
          return db.prepare(`SELECT rowid AS r FROM ${comillas(fk.destino)} ORDER BY rowid LIMIT 1 OFFSET ?`).get((k - 1) % n).r;
        }
        if (/estado/.test(c.name) && tabla === 'tareas') return 'hecha';
        return valorPara(c.type, c.name, k);
      });
      try {
        db.prepare(`INSERT INTO ${comillas(tabla)} (${usar.map(c => comillas(c.name)).join(', ')}) VALUES (${usar.map(() => '?').join(', ')})`).run(...valores);
      } catch (error) {
        if (!/UNIQUE/.test(error.message)) throw error; // una combinación ya usada: esa fila se salta
      }
    }
    if (!Number(db.prepare(`SELECT COUNT(*) AS n FROM ${comillas(tabla)}`).get().n)) throw new Error(`la tabla ${tabla} quedó vacía`);
    llenas.add(tabla);
  }
  return tablas;
}

// Una base v6 de OPORTIA con filas en todas las tablas, una clave de IA guardada de verdad (cifrada con la llave de las
// claves, que queda JUNTO a la base: oportia-llave-secretos) y BLOBs.
export function baseCompleta({ filasPorTabla = 2 } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const admin = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x' });
  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropicFalsa(), usuarioId: admin });
  const tablas = llenarTodas(db, { filasPorTabla });
  return { config, db, admin, tablas };
}

// Una base sintética con marca de OPORTIA (para probar el volcado con todos los tipos de SQLite).
export function baseSintetica(archivo, sql, filas = []) {
  const db = new DatabaseSync(archivo);
  db.exec(`PRAGMA application_id = ${ID_APLICACION};`);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(sql);
  for (const [consulta, ...valores] of filas) db.prepare(consulta).run(...valores);
  return db;
}

// Cada fila de cada tabla, con sus tipos exactos (BigInt para INTEGER), para comparar dos bases.
export function contenido(db) {
  const salida = {};
  for (const { name, sql } of db.prepare("SELECT name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()) {
    salida[`esquema:${name}`] = sql;
  }
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
    const s = db.prepare(`SELECT rowid AS __rowid, * FROM ${comillas(name)} ORDER BY rowid`);
    s.setReadBigInts(true);
    salida[name] = s.all().map(f => Object.entries(f).map(([k, v]) => [k, v instanceof Uint8Array ? `blob:${Buffer.from(v).toString('hex')}` : typeof v === 'bigint' ? `int:${v}` : typeof v === 'number' ? `real:${Object.is(v, -0) ? '-0' : v}` : v]));
  }
  salida.application_id = db.prepare('PRAGMA application_id').get().application_id;
  return salida;
}

// Una copia hecha a mano, como la hará la tarea (paso 2): a una carpeta (partes + índice) y/o al Telegram falso
// (subida, bajada para comprobar el hash, índice subido, comprobado y fijado). Devuelve todo lo que pasó.
export async function hacerCopia({ config, llaves = llavesDePrueba(), carpeta = null, telegram = null, tamanoParte = 65_536, servidor = 'servidor-de-prueba', anterior = null, ...resto }) {
  const foto = abrirFotoDeLectura(config);
  const partes = [];
  const cred = telegram ? crearCredencial({ token: telegram.token, base: telegram.url }) : null;
  let creada = resto.creada ?? new Date().toISOString();
  let resultado;
  let copiaId = null;
  try {
    resultado = await generarCopia({
      foto: foto.db, publica: llaves.publica, sello: llaves.sello, servidor, version: '0.5.0', tamanoParte, creada, ...resto,
      alParte: async ({ n, archivo, sha256 }) => {
        copiaId ??= resto.copia ?? null;
        const p = { n, bytes: archivo.length, sha256, telegram: null, nombre: null, ruta: null };
        if (carpeta) {
          mkdirSync(carpeta, { recursive: true });
          p.ruta = join(carpeta, `parte-${String(n).padStart(3, '0')}-${Math.random().toString(16).slice(2, 8)}.bin`);
          const fd = openSync(p.ruta, 'wx');
          try { writeSync(fd, archivo); fsyncSync(fd); } finally { closeSync(fd); }
        }
        if (telegram) {
          const r = await TELEGRAM.enviarArchivo(cred, { destino: telegram.chat, nombre: `parte-${n}.opc`, datos: new Blob([archivo]), leyenda: `parte ${n}` });
          if (r.motivo !== 'ok') throw new Error(`subir parte ${n}: ${r.motivo}`);
          p.telegram = { mensaje: r.mensajeId, archivo: r.archivo.id, unico: r.archivo.idUnico };
        }
        partes.push(p);
      },
    });
  } finally {
    foto.cerrar();
  }
  creada = resultado.creada;
  for (const p of partes) p.nombre = nombreParte(resultado.copia, creada, p.n);
  // Comprobar cada parte bajándola otra vez.
  if (telegram) {
    for (const p of partes) {
      const a = await TELEGRAM.archivo(cred, { archivoId: p.telegram.archivo });
      if (a.motivo !== 'ok') throw new Error(`getFile ${p.n}: ${a.motivo}`);
      const h = createHash('sha256');
      const b = await TELEGRAM.bajar(cred, { ruta: a.ruta, topeBytes: p.bytes + 1, alTrozo: async x => { h.update(x); } });
      if (b.motivo !== 'ok' || h.digest('hex') !== p.sha256) throw new Error(`parte ${p.n} distinta`);
    }
  }
  const indice = armarIndice({
    copia: resultado.copia, creada, servidor, version: '0.5.0', migracion: resultado.migracion, receptor: llaves.huella,
    publica: llaves.publica.toString('base64url'), bot: telegram ? String(telegram.botId) : null, anterior,
    flujo: { bytes: resultado.bytes, sha256: resultado.sha256 }, partes, sellado: resultado.sellado,
  }, llaves.sello);
  let indiceMensaje = null;
  let rutaIndice = null;
  if (carpeta) {
    rutaIndice = join(carpeta, nombreIndice(resultado.copia, creada));
    const fd = openSync(rutaIndice, 'wx');
    try { writeSync(fd, indice); } finally { closeSync(fd); }
  }
  if (telegram) {
    const r = await TELEGRAM.enviarArchivo(cred, { destino: telegram.chat, nombre: nombreIndice(resultado.copia, creada), datos: Buffer.from(indice), leyenda: 'índice' });
    if (r.motivo !== 'ok') throw new Error(`subir índice: ${r.motivo}`);
    const a = await TELEGRAM.archivo(cred, { archivoId: r.archivo.id });
    const pedazos = [];
    await TELEGRAM.bajar(cred, { ruta: a.ruta, topeBytes: 1_000_000, alTrozo: async x => { pedazos.push(Buffer.from(x)); } });
    if (sha256Hex(Buffer.concat(pedazos)) !== sha256Hex(Buffer.from(indice))) throw new Error('índice distinto');
    const f = await TELEGRAM.fijar(cred, { destino: telegram.chat, mensajeId: r.mensajeId });
    if (f.motivo !== 'ok') throw new Error(`fijar: ${f.motivo}`);
    const fijado = await TELEGRAM.fijado(cred, { destino: telegram.chat });
    if (fijado.mensajeId !== r.mensajeId) throw new Error('el fijado no es el índice');
    indiceMensaje = r.mensajeId;
  }
  return { resultado, partes, indice, indiceMensaje, rutaIndice, creada };
}
