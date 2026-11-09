// El VOLCADO de la base (contenido 'oportia-volcado-v1', congelado): una línea JSON por cosa, en UTF-8, '\n' nunca
// dentro de una línea. Se lee de una FOTO de la base (abrirFotoDeLectura: una transacción de lectura aparte), así que
// es una copia consistente aunque las pantallas y el trabajador sigan escribiendo. Nunca escribe nada en el disco.
//   {"t":"oportia-volcado","v":1,…}                   cabecera
//   {"t":"esquema","tipo":"table","nombre":…,"sql":…} el texto exacto de sqlite_schema
//   {"t":"filas","tabla":…,"columnas":["rowid",…]}    y una línea por fila: [1,"junior",…]
//   {"t":"fin_filas","tabla":…,"n":3}
//   … cada tabla, en el orden de sqlite_schema; después los índices (y triggers o vistas, si los hubiera) …
//   {"t":"fin","tablas":28,"filas":12345}
//   {"t":"sello","v":1,"hmac":…}                      SIEMPRE la última: HMAC(sello, copia, sha256(cabecera del flujo),
//                                                      sha256 de todo lo anterior) — solo quien tiene el sello la arma.
// Valores: NULL → null; INTEGER → número (o {"i":"…"} si pasa de 2^53−1); REAL → {"r":n} ({"r":"Infinity"},
// {"r":"-Infinity"}); TEXT → texto; BLOB → {"b":"<base64>"}. Al restaurar, cada uno vuelve con su mismo tipo.
// Tablas sin rowid, columnas generadas y tablas virtuales no se pueden volcar así: volcado_no_soportado (una
// migración que las agregue tendrá que subir el formato).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { enTransaccion } from '../nucleo/db.js';
import { ErrorCopias, LINEA_MAX } from './formato.js';

export const CONTENIDO = 'oportia-volcado-v1';
const ENTERO_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);
const NOMBRES_DE_ROWID = new Set(['rowid', 'oid', '_rowid_']);
const SQL_DE = Object.freeze({
  table: /^CREATE TABLE /i,
  index: /^CREATE (?:UNIQUE )?INDEX /i,
  trigger: /^CREATE TRIGGER /i,
  view: /^CREATE VIEW /i,
});

const comillas = nombre => `"${String(nombre).replace(/"/g, '""')}"`;
const esperar = () => new Promise(listo => setImmediate(listo));

function codificar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v <= ENTERO_SEGURO && v >= -ENTERO_SEGURO ? Number(v) : { i: v.toString() };
  if (typeof v === 'number') {
    if (v === Infinity) return { r: 'Infinity' };
    if (v === -Infinity) return { r: '-Infinity' };
    if (Number.isNaN(v)) return null; // SQLite nunca guarda NaN (lo vuelve NULL)
    if (Object.is(v, -0)) return { r: '-0' };
    return { r: v };
  }
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return { b: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') };
  throw new ErrorCopias('volcado_no_soportado');
}

export function decodificar(v) {
  if (v === null) return null;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new ErrorCopias('volcado_danado');
    return BigInt(v);
  }
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const claves = Object.keys(v);
    if (claves.length === 1 && claves[0] === 'i' && /^-?\d{1,19}$/.test(v.i)) return BigInt(v.i);
    if (claves.length === 1 && claves[0] === 'r') {
      if (typeof v.r === 'number') return v.r;
      if (v.r === 'Infinity') return Infinity;
      if (v.r === '-Infinity') return -Infinity;
      if (v.r === '-0') return -0;
    }
    if (claves.length === 1 && claves[0] === 'b' && typeof v.b === 'string') return Buffer.from(v.b, 'base64');
  }
  throw new ErrorCopias('volcado_danado');
}

// Lo que se vuelca de sqlite_schema, en su orden: las tablas, y aparte lo demás (índices, triggers, vistas).
// Se saltan las filas internas de SQLite (sqlite_*) y las de sql NULL (SQLite rehace solo sus índices automáticos).
export function esquemaDeLaFoto(db) {
  const tablas = [];
  const otros = [];
  for (const f of db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY rowid').all()) {
    if (String(f.name).startsWith('sqlite_') || f.sql == null) continue;
    if (!Object.hasOwn(SQL_DE, f.type) || !SQL_DE[f.type].test(f.sql)) throw new ErrorCopias('volcado_no_soportado', { tabla: f.name });
    if (f.type === 'table') {
      if (/\bWITHOUT\s+ROWID\b/i.test(f.sql)) throw new ErrorCopias('volcado_no_soportado', { tabla: f.name });
      const columnas = db.prepare('SELECT name, hidden FROM pragma_table_xinfo(?) ORDER BY cid').all(f.name);
      if (!columnas.length || columnas.some(c => c.hidden !== 0 || NOMBRES_DE_ROWID.has(String(c.name).toLowerCase()))) {
        throw new ErrorCopias('volcado_no_soportado', { tabla: f.name });
      }
      tablas.push({ tipo: 'table', nombre: f.name, sql: f.sql, columnas: columnas.map(c => c.name) });
    } else {
      otros.push({ tipo: f.type, nombre: f.name, sql: f.sql });
    }
  }
  return { tablas, otros };
}

// Las cuentas independientes (COUNT(*) por tabla), en la MISMA foto que el volcado. Se comparan con las del volcado
// y con las de la revisión: si no son iguales, la copia no sirve (volcado_incompleto).
export function contarFilas(db) {
  const { tablas, otros } = esquemaDeLaFoto(db);
  const porTabla = {};
  let filas = 0;
  for (const t of tablas) {
    const n = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${comillas(t.nombre)}`).get().n);
    porTabla[t.nombre] = n;
    filas += n;
  }
  return { porTabla, tablas: tablas.length, filas, esquema: tablas.length + otros.length };
}

function linea(valor) {
  return Buffer.from(`${JSON.stringify(valor)}\n`, 'utf8');
}

function selloDelFlujo(sello, copia, hashCabecera, hashB) {
  return createHmac('sha256', sello)
    .update(`oportia-sello-flujo-v1\n${copia}\n${Buffer.from(hashCabecera).toString('hex')}\n${hashB.toString('hex')}`, 'utf8')
    .digest('hex');
}

// Las líneas del volcado (Buffers), de una foto abierta. Cede el paso cada ~50 ms o 2.000 filas (el latido del
// trabajador nunca se para) y mira la señal de parar. resultado (opcional) recibe las cuentas del volcado.
export async function* volcar(db, { copia, creado = new Date().toISOString(), version = null, codigo = null, sello, hashCabecera, ceder = esperar, senal = null, lineaMax = LINEA_MAX, resultado = {} }) {
  if (!sello || !hashCabecera) throw new ErrorCopias('volcado_sin_sello');
  const hash = createHash('sha256');
  let bytes = 0;
  let ultimaVez = Date.now();
  let desdeCeder = 0;
  const salir = b => { hash.update(b); bytes += b.length; return b; };
  const revisar = async () => {
    desdeCeder += 1;
    if (desdeCeder >= 2000 || Date.now() - ultimaVez >= 50) {
      desdeCeder = 0;
      await ceder();
      ultimaVez = Date.now();
    }
    if (senal?.aborted) throw new ErrorCopias('cancelada');
  };
  let migracion = null;
  try { migracion = db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v ?? null; } catch { migracion = null; }
  const appId = Number(db.prepare('PRAGMA application_id').get().application_id);
  const userVersion = Number(db.prepare('PRAGMA user_version').get().user_version);
  const { tablas, otros } = esquemaDeLaFoto(db);
  yield salir(linea({ t: 'oportia-volcado', v: 1, app: 'oportia', version, codigo, migracion, application_id: appId, user_version: userVersion, copia, creado }));
  const porTabla = {};
  let total = 0;
  for (const t of tablas) {
    yield salir(linea({ t: 'esquema', tipo: 'table', nombre: t.nombre, sql: t.sql }));
    yield salir(linea({ t: 'filas', tabla: t.nombre, columnas: ['rowid', ...t.columnas] }));
    const consulta = db.prepare(`SELECT rowid, ${t.columnas.map(comillas).join(', ')} FROM ${comillas(t.nombre)} ORDER BY rowid`);
    consulta.setReadBigInts(true);
    consulta.setReturnArrays?.(true);
    let n = 0;
    for (const fila of consulta.iterate()) {
      const valores = Array.isArray(fila) ? fila : [fila.rowid, ...t.columnas.map(c => fila[c])];
      const b = linea(valores.map(codificar));
      if (b.length > lineaMax) throw new ErrorCopias('fila_muy_grande', { tabla: t.nombre });
      n += 1;
      yield salir(b);
      await revisar();
    }
    porTabla[t.nombre] = n;
    total += n;
    yield salir(linea({ t: 'fin_filas', tabla: t.nombre, n }));
  }
  for (const o of otros) yield salir(linea({ t: 'esquema', tipo: o.tipo, nombre: o.nombre, sql: o.sql }));
  yield salir(linea({ t: 'fin', tablas: tablas.length, filas: total }));
  const hashB = hash.digest();
  Object.assign(resultado, { porTabla, tablas: tablas.length, filas: total, bytes, sha256: hashB.toString('hex'), migracion });
  yield linea({ t: 'sello', v: 1, hmac: selloDelFlujo(sello, copia, hashCabecera, hashB) });
}

// El LECTOR del volcado: lo usan la revisión de cada copia (en el mismo paso) y la restauración. Recibe bytes en
// cualquier pedazo (parte líneas por el byte 0x0A: una letra de UTF-8 partida entre dos pedazos nunca se daña),
// revisa el orden de las líneas, cuenta, calcula el sha256 de todo hasta la línea «fin» y revisa la línea del sello.
//   alElemento(e, bytes): { t: 'cabecera'|'esquema'|'filas'|'fila'|'fin_filas'|'fin', … } (síncrono)
// Errores: volcado_danado (forma, orden, línea muy larga, demasiados bytes) · copia_no_autentica (sello).
export function crearLector({ sello = null, copia = null, hashCabecera = null, lineaMax = LINEA_MAX, bytesMax = 64 * 1024 ** 3, alElemento = () => {} } = {}) {
  const hash = createHash('sha256');
  let bytesB = 0;
  let total = 0;
  let pedazos = [];
  let largoPedazos = 0;
  let estado = 'cabecera'; // cabecera → cuerpo → (tabla) → … → sello → terminado
  let tabla = null; // { nombre, columnas, n }
  let cabecera = null;
  const porTabla = {};
  let tablas = 0;
  let filas = 0;
  let fin = null;
  let selloOk = false;
  let esquemas = 0;
  let ultimaTabla = null;
  const danado = () => new ErrorCopias('volcado_danado');
  const procesarLinea = bytes => {
    let e;
    try { e = JSON.parse(bytes.toString('utf8')); } catch { throw danado(); }
    if (estado === 'sello') {
      if (!e || e.t !== 'sello' || e.v !== 1 || !/^[0-9a-f]{64}$/.test(String(e.hmac))) throw new ErrorCopias('copia_no_autentica');
      if (sello) {
        const esperado = Buffer.from(selloDelFlujo(sello, copia, hashCabecera, hashFinal), 'hex');
        if (!timingSafeEqual(esperado, Buffer.from(e.hmac, 'hex'))) throw new ErrorCopias('copia_no_autentica');
        selloOk = true;
      }
      estado = 'terminado';
      return;
    }
    if (estado === 'terminado') throw new ErrorCopias('copia_no_autentica'); // nada después del sello
    hash.update(bytes);
    hash.update('\n');
    bytesB += bytes.length + 1;
    if (estado === 'cabecera') {
      if (!e || e.t !== 'oportia-volcado' || e.app !== 'oportia' || !Number.isSafeInteger(e.v)) throw danado();
      if (e.v > 1) throw new ErrorCopias('formato_nuevo', { formato: e.v });
      if (copia && e.copia !== copia) throw danado();
      cabecera = e;
      estado = 'cuerpo';
      alElemento({ ...e, t: 'cabecera' }, bytes);
      return;
    }
    if (tabla) {
      if (Array.isArray(e)) {
        if (e.length !== tabla.columnas.length) throw danado();
        tabla.n += 1;
        alElemento({ t: 'fila', tabla: tabla.nombre, valores: e }, bytes);
        return;
      }
      if (!e || e.t !== 'fin_filas' || e.tabla !== tabla.nombre || e.n !== tabla.n) throw danado();
      porTabla[tabla.nombre] = tabla.n;
      filas += tabla.n;
      alElemento({ t: 'fin_filas', tabla: tabla.nombre, n: tabla.n }, bytes);
      tabla = null;
      return;
    }
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw danado();
    if (estado === 'esperando_filas' && e.t !== 'filas') throw danado();
    if (e.t === 'esquema') {
      if (!Object.hasOwn(SQL_DE, e.tipo) || typeof e.nombre !== 'string' || typeof e.sql !== 'string' || !SQL_DE[e.tipo].test(e.sql) || e.nombre.startsWith('sqlite_')) throw danado();
      if (e.tipo === 'table') {
        if (Object.hasOwn(porTabla, e.nombre) || esquemas !== tablas) throw danado(); // las tablas van antes que lo demás
        tablas += 1;
        ultimaTabla = e.nombre;
        estado = 'esperando_filas';
      }
      esquemas += 1;
      alElemento({ t: 'esquema', tipo: e.tipo, nombre: e.nombre, sql: e.sql }, bytes);
      return;
    }
    if (e.t === 'filas') {
      if (estado !== 'esperando_filas' || e.tabla !== ultimaTabla || !Array.isArray(e.columnas) || e.columnas[0] !== 'rowid' || e.columnas.length < 2
        || !e.columnas.every(c => typeof c === 'string')) throw danado();
      tabla = { nombre: e.tabla, columnas: e.columnas, n: 0 };
      estado = 'cuerpo';
      alElemento({ t: 'filas', tabla: e.tabla, columnas: e.columnas }, bytes);
      return;
    }
    if (e.t === 'fin') {
      if (e.tablas !== tablas || e.filas !== filas) throw danado();
      fin = e;
      alElemento({ t: 'fin', tablas, filas }, bytes);
      hashFinal = hash.digest();
      estado = 'sello';
      return;
    }
    throw danado();
  };
  let hashFinal = null;
  return {
    alimentar(datos) {
      let inicio = 0;
      for (;;) {
        const i = datos.indexOf(0x0a, inicio);
        if (i < 0) break;
        const resto = datos.subarray(inicio, i);
        if (largoPedazos + resto.length > lineaMax) throw danado();
        const bytes = largoPedazos ? Buffer.concat([...pedazos, resto]) : Buffer.from(resto);
        pedazos = [];
        largoPedazos = 0;
        total += bytes.length + 1;
        if (total > bytesMax + 200) throw danado();
        procesarLinea(bytes);
        inicio = i + 1;
      }
      if (inicio < datos.length) {
        const resto = datos.subarray(inicio);
        if (largoPedazos + resto.length > lineaMax) throw danado();
        pedazos.push(Buffer.from(resto));
        largoPedazos += resto.length;
      }
    },
    terminar() {
      if (largoPedazos > 0) throw new ErrorCopias('copia_no_autentica'); // una línea a medias al final
      if (estado !== 'terminado') throw new ErrorCopias(estado === 'sello' || fin ? 'copia_no_autentica' : 'volcado_danado');
      if (sello && !selloOk) throw new ErrorCopias('copia_no_autentica');
      return { cabecera, porTabla, tablas, filas, bytes: bytesB, sha256: hashFinal.toString('hex'), selloOk };
    },
  };
}

// El APLICADOR de la restauración: arma una base NUEVA con los elementos del lector, por lotes (≤ 5.000 líneas o
// ≤ 8 MiB), cada lote en UNA transacción síncrona (enTransaccion: nada de esperas con la base tomada). Es seguro
// porque la marca de OPORTIA se escribe al final (restaurar.js): un archivo a medias nunca es una base de OPORTIA.
export function crearAplicador(db, { lineasPorLote = 5000, bytesPorLote = 8 * 1024 * 1024 } = {}) {
  let lote = [];
  let bytesLote = 0;
  let insertar = null;
  let columnas = null;
  const aplicar = () => {
    if (!lote.length) return;
    const elementos = lote;
    lote = [];
    bytesLote = 0;
    enTransaccion(db, () => {
      for (const e of elementos) {
        if (e.t === 'esquema') {
          db.prepare(e.sql).run();
        } else if (e.t === 'filas') {
          const reales = db.prepare('SELECT name FROM pragma_table_xinfo(?) WHERE hidden = 0 ORDER BY cid').all(e.tabla).map(c => c.name);
          if (JSON.stringify(['rowid', ...reales]) !== JSON.stringify(e.columnas)) throw new ErrorCopias('volcado_danado');
          columnas = e.columnas;
          insertar = db.prepare(`INSERT INTO ${comillas(e.tabla)} (${columnas.map(comillas).join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`);
        } else if (e.t === 'fila') {
          insertar.run(...e.valores.map(decodificar));
        } else if (e.t === 'fin_filas') {
          insertar = null;
        }
      }
    });
  };
  return {
    agregar(e, bytes = 0) {
      if (e.t === 'cabecera' || e.t === 'fin') return;
      lote.push(e);
      bytesLote += bytes;
      if (lote.length >= lineasPorLote || bytesLote >= bytesPorLote) aplicar();
    },
    terminar() { aplicar(); },
  };
}
