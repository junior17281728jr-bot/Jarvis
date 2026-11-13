// Fase 1, parte e (paso 1): el formato de las copias cifradas — migración 6, clave de recuperación, flujo cifrado,
// partes, índice, volcado y la copia completa con su revisión en el mismo paso. Nunca usa internet.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { carpetaTemporal, configDePrueba } from './ayuda.js';
import { CLAVE_DE_PRUEBA, SEMILLA_DE_PRUEBA, llavesDePrueba, baseSintetica, baseCompleta } from './copias-base.js';
import { abrirBase, abrirFotoDeLectura, conectarBase } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { crearClave, leerClave, derivar, textoDeClave, normalizarClave, huellaDe, hashVerificador, esClaveDePrueba, PUBLICAS_DE_PRUEBA, ALFABETO } from '../src/copias/clave.js';
import * as pagina from '../public/clave-recuperacion.js';
import { crearCifrador, transformarCifrado, crearDescifrador, sellar, abrirSellado } from '../src/copias/cifrar.js';
import {
  ErrorCopias, crearPartidor, leerCabeceraParte, armarIndice, leerIndice, nombreParte, nombreIndice, carpetaDelMes, rutaSegura,
  ESTADOS_COPIA, CABECERA_PARTE, TROZO,
} from '../src/copias/formato.js';
import { volcar, contarFilas, crearLector, decodificar } from '../src/copias/volcado.js';
import { generarCopia } from '../src/copias/generar.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const codigoDe = clave => error => error instanceof ErrorCopias && error.clave === clave;

async function recoger(stream, entrada) {
  const salida = [];
  await pipeline(Readable.from(entrada), stream, new Writable({ write(d, _c, l) { salida.push(Buffer.from(d)); l(); } }));
  return Buffer.concat(salida);
}

// Un flujo cifrado de un texto cualquiera (sin gzip) para las pruebas del formato.
async function flujoDe(datos, llaves = llavesDePrueba(), extra = {}) {
  const cifrador = crearCifrador({ publica: llaves.publica, copia: '11111111-2222-4333-8444-555555555555', creada: '2026-11-09T08:40:00.000Z', ...extra });
  const bytes = await recoger(transformarCifrado(cifrador), [datos]);
  cifrador.cerrar();
  return { bytes, hashCabecera: cifrador.hashCabecera, largoCabecera: cifrador.cabecera.length };
}

const descifrar = (bytes, llaves = llavesDePrueba()) => recoger(crearDescifrador({ privada: llaves.privada }), [bytes]);

// ---------- 1.1 Migración 6 ----------

test('1.1 la migración 6 solo agrega: sin CHECK, sin UNIQUE, sin ADD COLUMN, idempotente, y la base queda en la 6', () => {
  const m = MIGRACIONES.find(x => x.id === 6);
  assert.ok(m, 'falta la migración 6');
  assert.equal(m.nombre, 'copias_y_canales');
  assert.equal((m.sql.match(/\bCHECK\b/gi) || []).length, 0);
  assert.doesNotMatch(m.sql, /\bUNIQUE\b/i);
  assert.doesNotMatch(m.sql, /ADD\s+COLUMN/i);
  assert.equal(Buffer.byteLength(m.sql), 3760);
  const config = configDePrueba();
  const db = abrirBase(config);
  assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 10); // 0.7.0: la 7 (academia) también; 0.10.0: la 8 (el Instructor); 0.12.0: la 9 (lo extra); 0.13.8: la 10 (cuentas eliminadas)
  for (const t of ['copias_llaves', 'canales', 'copias', 'copia_partes', 'canal_envios']) {
    assert.ok(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(t), t);
  }
  const antes = db.prepare("SELECT name, sql FROM sqlite_schema ORDER BY name").all();
  db.exec(m.sql); // otra vez: no cambia nada
  assert.deepEqual(db.prepare("SELECT name, sql FROM sqlite_schema ORDER BY name").all(), antes);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
  // La 0.4.1 (migraciones 1–5) abre esta base sin aplicar nada, y su trabajador (versión mínima 5) se conecta.
  const db41 = abrirBase(config, MIGRACIONES.filter(x => x.id <= 5));
  assert.equal(db41.prepare('SELECT COUNT(*) AS n FROM oportia_migraciones').get().n, 10); // 0.7.0: con la 7 (academia); 0.10.0: con la 8; 0.12.0: con la 9; 0.13.8: con la 10
  db41.close();
  conectarBase(config, { versionMinima: 5 }).close();
});

// ---------- 1.2 La clave de recuperación ----------

const semillaFija = i => createHash('sha256').update(`clave-${i}`).digest().subarray(0, 16);

test('1.2 la clave: 1.000 claves van y vuelven, la página da el MISMO verificador, y se normaliza O/I/L, espacios y guiones', () => {
  for (let i = 0; i < 1000; i++) {
    const semilla = Buffer.from(i < 500 ? semillaFija(i) : crearClave().semilla);
    const texto = textoDeClave(semilla);
    assert.match(texto, /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$/);
    assert.ok(leerClave(texto).equals(semilla));
    const d = derivar(Buffer.from(semilla));
    assert.ok(derivar(Buffer.from(semilla)).publica.equals(d.publica), 'derivar es determinista');
    const escrita = i % 3 === 0 ? texto.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l') : texto.replace(/-/g, ' ');
    const v = pagina.verificadorDe(escrita);
    assert.ok(v.ok, texto);
    assert.equal(v.verificador, d.verificador.toString('hex'));
    assert.equal(pagina.normalizarClave(escrita), normalizarClave(escrita));
    assert.equal(hashVerificador(v.verificador), createHash('sha256').update(d.verificador).digest('hex'));
  }
  assert.equal(huellaDe(llavesDePrueba().publica), 'NB5W');
  assert.equal(CLAVE_DE_PRUEBA, textoDeClave(Buffer.from(SEMILLA_DE_PRUEBA)));
  assert.ok(esClaveDePrueba(llavesDePrueba().publica), 'la clave de prueba está en PUBLICAS_DE_PRUEBA');
  assert.deepEqual(PUBLICAS_DE_PRUEBA, [llavesDePrueba().publica.toString('base64url')]);
  assert.ok(!esClaveDePrueba(derivar(crearClave().semilla).publica));
  assert.equal(hashVerificador('xyz'), null);
  assert.equal(hashVerificador('A'.repeat(64)), null, 'solo hex en minúsculas');
});

test('1.2 un error de un símbolo casi siempre se nota (control), y la página dice lo mismo que el servidor', () => {
  let probadas = 0;
  let pasaron = 0;
  for (let i = 0; i < 40; i++) {
    const texto = normalizarClave(textoDeClave(Buffer.from(semillaFija(1000 + i))));
    for (let p = 0; p < 28; p++) {
      for (const c of ALFABETO) {
        if (c === texto[p]) continue;
        const mala = texto.slice(0, p) + c + texto.slice(p + 1);
        probadas += 1;
        let servidor;
        try { leerClave(mala); servidor = 'ok'; } catch (error) { servidor = error.clave; }
        const enPagina = pagina.leerClave(mala);
        assert.equal(enPagina.ok ? 'ok' : enPagina.error, servidor, mala);
        if (servidor === 'ok') pasaron += 1;
      }
    }
  }
  assert.ok(probadas > 30_000);
  assert.ok(pasaron / probadas < 2 / 1024, `pasaron ${pasaron} de ${probadas}`);
  for (const mala of ['', 'ABC', 'U'.repeat(28), `${normalizarClave(CLAVE_DE_PRUEBA)}0`]) {
    assert.throws(() => leerClave(mala), codigoDe('clave_formato'));
    assert.equal(pagina.leerClave(mala).error, 'clave_formato');
  }
  assert.equal(pagina.grupoDistinto(CLAVE_DE_PRUEBA, CLAVE_DE_PRUEBA.toLowerCase()), 0);
  assert.equal(pagina.grupoDistinto(CLAVE_DE_PRUEBA, CLAVE_DE_PRUEBA.replace(/^(.{10})./, '$1Z')), 3);
  assert.equal(pagina.gruposDeClave(CLAVE_DE_PRUEBA).length, 7);
});

test('1.2 el SHA-256, el HMAC y el HKDF de la página son los de node:crypto', async () => {
  const { createHmac, hkdfSync } = await import('node:crypto');
  for (const n of [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000, 70_000]) {
    const b = randomBytes(n);
    assert.equal(pagina.aHex(pagina.sha256(b)), createHash('sha256').update(b).digest('hex'), `sha256 de ${n}`);
    const k = randomBytes(n % 100);
    assert.equal(pagina.aHex(pagina.hmac(k, b)), createHmac('sha256', k).update(b).digest('hex'), `hmac de ${n}`);
  }
  const ikm = randomBytes(16);
  assert.equal(pagina.aHex(pagina.hkdf32(ikm, new TextEncoder().encode('sal'), new TextEncoder().encode('info'))),
    Buffer.from(hkdfSync('sha256', ikm, 'sal', 'info', 32)).toString('hex'));
  assert.equal(pagina.aHex(pagina.hkdf32(ikm, new Uint8Array(0), new TextEncoder().encode('x'))), Buffer.from(hkdfSync('sha256', ikm, '', 'x', 32)).toString('hex'));
});

// ---------- 1.3 / 1.4 El flujo cifrado ----------

test('1.3 X25519 + HKDF + AES-GCM: con una llave efímera fija el flujo es SIEMPRE el mismo, y un secreto compartido de ceros se rechaza', async () => {
  const llaves = llavesDePrueba();
  const efimera = createHash('sha256').update('efimera-1.3').digest();
  const hacer = () => {
    const c = crearCifrador({ publica: llaves.publica, copia: '11111111-2222-4333-8444-555555555555', creada: '2026-11-09T08:40:00.000Z', efimera, compresion: 'ninguna' });
    const salida = Buffer.concat([c.cabecera, c.trozo(Buffer.from('hola, OPORTIA'), true)]);
    c.cerrar();
    return salida;
  };
  const a = hacer();
  assert.ok(a.equals(hacer()));
  assert.equal(createHash('sha256').update(a).digest('hex').length, 64);
  assert.equal((await descifrar(a, llaves)).toString(), 'hola, OPORTIA');
  // Otra efímera → otro flujo; la misma clave lo abre igual.
  const { bytes } = await flujoDe(Buffer.from('hola, OPORTIA'));
  assert.ok(!bytes.equals(a));
  assert.equal((await descifrar(bytes)).toString(), 'hola, OPORTIA');
  // Una efímera de ceros (un punto de orden bajo): el secreto compartido sería cero → copia_danada.
  const largo = a.readUInt32BE(10);
  const cab = JSON.parse(a.subarray(14, 14 + largo).toString());
  cab.efimera = Buffer.alloc(32).toString('base64url');
  const json = Buffer.from(JSON.stringify(cab));
  const mala = Buffer.concat([a.subarray(0, 10), Buffer.from([0, 0, 0, json.length]), json, a.subarray(14 + largo)]);
  await assert.rejects(descifrar(mala, llaves), codigoDe('copia_danada'));
});

test('1.4 el flujo: cortado en cada registro, cambiado, reordenado o con algo de más → se rechaza; formato nuevo se nombra', async () => {
  const datos = randomBytes(TROZO * 3 + 1234);
  const { bytes, largoCabecera } = await flujoDe(datos);
  assert.ok((await descifrar(bytes)).equals(datos));
  const reg = 4 + TROZO + 16;
  const inicio = largoCabecera;
  // Cortado justo después de la cabecera y de cada registro (salvo el último): copia_cortada.
  for (let k = 0; k <= 3; k++) await assert.rejects(descifrar(bytes.subarray(0, inicio + k * reg)), codigoDe('copia_cortada'), `corte ${k}`);
  await assert.rejects(descifrar(bytes.subarray(0, bytes.length - 1)), codigoDe('copia_cortada'));
  await assert.rejects(descifrar(bytes.subarray(0, 20)), codigoDe('copia_cortada'));
  // Un registro de más después del último.
  await assert.rejects(descifrar(Buffer.concat([bytes, bytes.subarray(inicio, inicio + reg)])), codigoDe('copia_danada'));
  // El bit «último» borrado en el último registro.
  const sinUltimo = Buffer.from(bytes);
  sinUltimo[inicio + 3 * reg] &= 0x7f;
  await assert.rejects(descifrar(sinUltimo), codigoDe('copia_danada'));
  // Dos registros cambiados de lugar.
  const cambiados = Buffer.concat([bytes.subarray(0, inicio), bytes.subarray(inicio + reg, inicio + 2 * reg), bytes.subarray(inicio, inicio + reg), bytes.subarray(inicio + 2 * reg)]);
  await assert.rejects(descifrar(cambiados), codigoDe('copia_danada'));
  // Un byte de la cabecera (dentro del JSON) y un byte cifrado.
  for (const i of [30, inicio + 100, bytes.length - 3]) {
    const tocado = Buffer.from(bytes);
    tocado[i] ^= 0x01;
    await assert.rejects(descifrar(tocado), e => e instanceof ErrorCopias && ['copia_danada', 'clave_no_es_de_esta_copia'].includes(e.clave), `byte ${i}`);
  }
  // Formato 2 y una cabecera de más de 4096 bytes.
  const f2 = Buffer.from(bytes);
  f2.writeUInt16BE(2, 8);
  await assert.rejects(descifrar(f2), e => e.clave === 'formato_nuevo' && e.datos.formato === 2);
  const largo = Buffer.from(bytes);
  largo.writeUInt32BE(4097, 10);
  await assert.rejects(descifrar(largo), codigoDe('copia_danada'));
  // Otra clave: se dice cuál era la de la copia (su huella), no «dañada».
  const otra = derivar(crearClave().semilla);
  await assert.rejects(descifrar(bytes, otra), e => e.clave === 'clave_no_es_de_esta_copia' && e.datos.receptor === 'NB5W');
});

test('1.4 los registros: el último puede ser de 1 byte o de 64 KiB exactos, y un registro corto que no es el último se rechaza', async () => {
  for (const n of [1, TROZO - 1, TROZO, TROZO + 1, 2 * TROZO]) {
    const datos = randomBytes(n);
    const { bytes } = await flujoDe(datos);
    assert.ok((await descifrar(bytes)).equals(datos), `largo ${n}`);
  }
  const c = crearCifrador({ publica: llavesDePrueba().publica });
  assert.throws(() => c.trozo(Buffer.alloc(10), false), codigoDe('copia_danada'));
  assert.throws(() => c.trozo(Buffer.alloc(TROZO + 1), true), codigoDe('copia_danada'));
  c.trozo(Buffer.alloc(5), true);
  assert.throws(() => c.trozo(Buffer.alloc(5), true), codigoDe('copia_danada'), 'nada después del último');
  await assert.rejects(recoger(transformarCifrado(crearCifrador({ publica: llavesDePrueba().publica })), []), codigoDe('copia_danada'), 'un flujo vacío no existe');
});

// ---------- 1.5 Partes ----------

test('1.5 las partes: un solo búfer, tamaños, desde contiguo, cabeceras completas y nombres en hora de RD', async () => {
  const copia = '11111111-2222-4333-8444-555555555555';
  const vistas = [];
  let pedidos = 0;
  const partidor = crearPartidor({
    copia, tamanoParte: 4096, asignar: n => { pedidos += 1; return Buffer.allocUnsafe(n); },
    alParte: async p => { vistas.push({ ...p, archivo: Buffer.from(p.archivo) }); },
  });
  const datos = randomBytes(4096 * 3 + 100);
  for (let i = 0; i < datos.length; i += 777) await partidor.escribir(datos.subarray(i, i + 777));
  assert.deepEqual(await partidor.terminar(), { partes: 4, bytes: datos.length });
  assert.equal(pedidos, 1, 'un solo búfer para todas las partes');
  let desde = 0;
  for (const [i, p] of vistas.entries()) {
    const c = leerCabeceraParte(p.archivo);
    assert.equal(c.copia, copia);
    assert.equal(c.n, i + 1);
    assert.equal(c.desde, desde);
    assert.equal(c.largo, p.archivo.length - CABECERA_PARTE);
    assert.ok(c.hashCarga.equals(createHash('sha256').update(p.archivo.subarray(CABECERA_PARTE)).digest()));
    assert.equal(p.sha256, createHash('sha256').update(p.archivo).digest('hex'));
    assert.ok(p.archivo.subarray(CABECERA_PARTE).equals(datos.subarray(desde, desde + c.largo)));
    desde += c.largo;
  }
  assert.equal(vistas[3].largo, 100);
  // Formato nuevo y cabecera rota.
  const f2 = Buffer.from(vistas[0].archivo);
  f2.writeUInt16BE(2, 8);
  assert.throws(() => leerCabeceraParte(f2), e => e.clave === 'formato_nuevo');
  assert.throws(() => leerCabeceraParte(Buffer.from('nada')), codigoDe('parte_danada'));
  // 4:40 a. m. en RD = 08:40 UTC.
  assert.equal(nombreParte(copia, '2026-11-09T08:40:12.000Z', 1), 'oportia-copia-20261109-0440-11111111-p001.opc');
  assert.equal(nombreIndice(copia, '2026-11-09T08:40:12.000Z'), 'oportia-copia-20261109-0440-11111111-indice.txt');
  assert.equal(carpetaDelMes('2026-12-01T02:00:00.000Z'), '2026-11', 'el 1 de diciembre a las 2 UTC todavía es noviembre en RD');
  assert.deepEqual([...ESTADOS_COPIA], ['haciendo', 'escrita', 'subida', 'verificada', 'solo_local', 'fallida', 'interrumpida', 'saltada']);
});

// ---------- 1.6 – 1.9 El volcado ----------

const SQL_TIPOS = `
CREATE TABLE tipos (id INTEGER PRIMARY KEY, entero INTEGER, real REAL, texto TEXT, datos BLOB, nada);
CREATE TABLE compuesta (a TEXT, b INTEGER, c, PRIMARY KEY (a, b));
CREATE TABLE con_unico (id INTEGER PRIMARY KEY, nombre TEXT UNIQUE, correo TEXT UNIQUE);
CREATE TABLE "raro ""nombre""" (
  "columna con espacio" TEXT,
  otra INTEGER DEFAULT 5
);
CREATE INDEX tipos_texto ON tipos(texto);
CREATE UNIQUE INDEX compuesta_c ON compuesta(c) WHERE c IS NOT NULL;
`;

function filasDeTipos() {
  return [
    ['INSERT INTO tipos VALUES (?, ?, ?, ?, ?, ?)', 1n, 9223372036854775807n, 0.1, 'año ñ "comillas" \\ \n línea 🙂  ', Buffer.from([0, 1, 2, 255]), null],
    ['INSERT INTO tipos VALUES (?, ?, ?, ?, ?, ?)', 2n, -9223372036854775808n, 1e308, '', Buffer.alloc(0), 7n],
    ['INSERT INTO tipos VALUES (?, ?, ?, ?, ?, ?)', 3n, 9007199254740993n, Infinity, 'x', null, 1.5],
    ['INSERT INTO tipos VALUES (?, ?, ?, ?, ?, ?)', 4n, -9007199254740991n, -Infinity, '\u0000cero', Buffer.from('hola'), 'texto'],
    ['INSERT INTO tipos VALUES (?, ?, ?, ?, ?, ?)', 5n, 0n, -0, '𝄞'.repeat(1000), randomBytes(3000), Buffer.from([7])],
    ['INSERT INTO tipos VALUES (?, ?, ?, ?, ?, ?)', 6n, 1n, 1.0, null, null, 2.0],
    ['INSERT INTO compuesta VALUES (?, ?, ?)', 'b', 2n, null],
    ['INSERT INTO compuesta VALUES (?, ?, ?)', 'a', 1n, 'único'],
    ['INSERT INTO con_unico (nombre, correo) VALUES (?, ?)', 'junior', 'j@x'],
    ['INSERT INTO con_unico (nombre, correo) VALUES (?, ?)', 'maria', null],
    ['INSERT INTO "raro ""nombre""" VALUES (?, ?)', 'sí', 3n],
  ];
}

// Una copia completa (con la revisión en el mismo paso) de una base, a una lista de partes en memoria.
async function copiaEnMemoria(config, opciones = {}) {
  const llaves = llavesDePrueba();
  const foto = abrirFotoDeLectura(config);
  const partes = [];
  try {
    const r = await generarCopia({ foto: foto.db, publica: llaves.publica, sello: llaves.sello, tamanoParte: 4096, ...opciones, alParte: async p => { partes.push(Buffer.from(p.archivo)); } });
    return { ...r, partes, llaves };
  } finally {
    foto.cerrar();
  }
}

// Descifra unas partes (en orden) hasta las líneas del volcado.
async function lineasDe(partes, llaves = llavesDePrueba()) {
  const { createGunzip } = await import('node:zlib');
  const flujo = Buffer.concat(partes.map(p => p.subarray(CABECERA_PARTE)));
  const claro = await recoger(crearDescifrador({ privada: llaves.privada }), [flujo]);
  const texto = await recoger(createGunzip(), [claro]);
  return texto.toString('utf8').split('\n').filter(Boolean);
}

test('1.6 el volcado guarda cada tipo exacto (enteros de 64 bits, reales, ±Infinito, textos raros, BLOB vacío, NULL)', async () => {
  const archivo = join(carpetaTemporal('volcado'), 'tipos.db');
  const db = baseSintetica(archivo, SQL_TIPOS, filasDeTipos());
  const c = await copiaEnMemoria({ archivoBase: archivo });
  assert.equal(c.tablas, 4);
  assert.equal(c.filas, 11);
  assert.deepEqual(c.porTabla, { tipos: 6, compuesta: 2, con_unico: 2, 'raro "nombre"': 1 });
  const lineas = await lineasDe(c.partes);
  const datos = lineas.map(l => JSON.parse(l));
  assert.equal(datos[0].t, 'oportia-volcado');
  assert.equal(datos[0].application_id, 0x4f505254);
  assert.equal(datos.at(-1).t, 'sello');
  assert.equal(datos.at(-2).t, 'fin');
  assert.ok(!lineas.some(l => l.includes('sqlite_autoindex')), 'los índices automáticos no se vuelcan (SQLite los rehace)');
  const filaTipos = datos.find(d => Array.isArray(d) && d[0] === 1);
  assert.deepEqual(filaTipos.slice(0, 3), [1, 1, { i: '9223372036854775807' }]);
  assert.deepEqual(datos.find(d => Array.isArray(d) && d[0] === 3)[3], { r: 'Infinity' });
  assert.equal(decodificar({ i: '-9223372036854775808' }), -9223372036854775808n);
  assert.deepEqual(decodificar({ b: '' }), Buffer.alloc(0));
  assert.throws(() => decodificar({ x: 1 }), codigoDe('volcado_danado'));
  assert.throws(() => decodificar(1.5), codigoDe('volcado_danado'), 'un número suelto siempre es entero');
  db.close();
});

test('1.7 la copia es una FOTO: lo que se escribe mientras se hace no entra en ella (y sí queda en la base)', async () => {
  const archivo = join(carpetaTemporal('foto'), 'f.db');
  const db = baseSintetica(archivo, 'CREATE TABLE t (id INTEGER PRIMARY KEY, x TEXT);', Array.from({ length: 50 }, (_, i) => ['INSERT INTO t (x) VALUES (?)', `fila ${i}`]));
  const llaves = llavesDePrueba();
  const foto = abrirFotoDeLectura({ archivoBase: archivo });
  db.prepare('INSERT INTO t (x) VALUES (?)').run('después de la foto');
  db.prepare('UPDATE t SET x = ? WHERE id = 1').run('cambiada');
  const partes = [];
  const r = await generarCopia({ foto: foto.db, publica: llaves.publica, sello: llaves.sello, tamanoParte: 4096, alParte: async p => { partes.push(Buffer.from(p.archivo)); } });
  foto.cerrar();
  assert.equal(r.filas, 50);
  const texto = (await lineasDe(partes)).join('\n');
  assert.ok(!texto.includes('después de la foto'));
  assert.ok(!texto.includes('cambiada'));
  assert.ok(texto.includes('"fila 0"'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM t').get().n, 51);
  // La foto es de solo lectura.
  const otra = abrirFotoDeLectura({ archivoBase: archivo });
  assert.throws(() => otra.db.exec("INSERT INTO t (x) VALUES ('no')"));
  otra.cerrar();
  otra.cerrar(); // cerrar dos veces no pasa nada
  db.close();
});

test('1.8 lo que el formato no sabe volcar se rechaza (sin rowid, columnas generadas, tablas virtuales), y una fila gigante también', async () => {
  const carpeta = carpetaTemporal('no-soportado');
  const casos = [
    'CREATE TABLE s (a TEXT PRIMARY KEY, b) WITHOUT ROWID;',
    'CREATE TABLE g (a INTEGER, b INTEGER GENERATED ALWAYS AS (a * 2) VIRTUAL);',
    'CREATE TABLE r (rowid TEXT, x);',
  ];
  try {
    const v = new DatabaseSync(':memory:');
    v.exec('CREATE VIRTUAL TABLE v USING fts5(x)');
    v.close();
    casos.push('CREATE VIRTUAL TABLE v USING fts5(x);');
  } catch { /* este SQLite no trae fts5 */ }
  for (const [i, sql] of casos.entries()) {
    const archivo = join(carpeta, `n${i}.db`);
    baseSintetica(archivo, sql).close();
    const foto = abrirFotoDeLectura({ archivoBase: archivo });
    assert.throws(() => contarFilas(foto.db), codigoDe('volcado_no_soportado'), sql);
    foto.cerrar();
  }
  const archivo = join(carpeta, 'grande.db');
  baseSintetica(archivo, 'CREATE TABLE t (x TEXT);', [['INSERT INTO t VALUES (?)', 'x'.repeat(5000)]]).close();
  await assert.rejects(copiaEnMemoria({ archivoBase: archivo }, { lineaMax: 4096 }), e => e.clave === 'fila_muy_grande' && e.datos.tabla === 't');
});

test('1.8 el lector rechaza una línea más larga que el tope y más bytes que los del resumen', () => {
  const lector = crearLector({ lineaMax: 100 });
  assert.throws(() => lector.alimentar(Buffer.from(`${'x'.repeat(101)}\n`)), codigoDe('volcado_danado'));
  const sinFin = crearLector({ lineaMax: 100 });
  assert.throws(() => sinFin.alimentar(Buffer.alloc(150, 0x61)), codigoDe('volcado_danado'), 'también sin salto de línea');
  const cab = Buffer.from(`${JSON.stringify({ t: 'oportia-volcado', v: 1, app: 'oportia' })}\n`);
  const corto = crearLector({ bytesMax: 10 });
  assert.throws(() => { corto.alimentar(cab); corto.alimentar(Buffer.alloc(300, 0x0a)); }, codigoDe('volcado_danado'));
  const nuevo = crearLector();
  assert.throws(() => nuevo.alimentar(Buffer.from(`${JSON.stringify({ t: 'oportia-volcado', v: 2, app: 'oportia' })}\n`)), e => e.clave === 'formato_nuevo');
});

test('1.9 una letra de UTF-8 partida entre dos pedazos nunca se daña (el lector parte por bytes)', async () => {
  const archivo = join(carpetaTemporal('utf8'), 'u.db');
  const db = baseSintetica(archivo, 'CREATE TABLE t (x TEXT);', Array.from({ length: 200 }, (_, i) => ['INSERT INTO t VALUES (?)', `ñandú 🙂 𝄞 €${i}`]));
  const c = await copiaEnMemoria({ archivoBase: archivo });
  const { createGunzip } = await import('node:zlib');
  const flujo = Buffer.concat(c.partes.map(p => p.subarray(CABECERA_PARTE)));
  let hashCabecera = null;
  const claro = await recoger(crearDescifrador({ privada: c.llaves.privada, alCabecera: (_d, h) => { hashCabecera = h; } }), [flujo]);
  const texto = await recoger(createGunzip(), [claro]);
  const vistas = [];
  const lector = crearLector({ sello: c.llaves.sello, copia: c.copia, hashCabecera, alElemento: e => { if (e.t === 'fila') vistas.push(e.valores[1]); } });
  for (let i = 0; i < texto.length; i += 3) lector.alimentar(texto.subarray(i, i + 3)); // de 3 en 3 bytes
  const r = lector.terminar();
  assert.equal(r.filas, 200);
  assert.ok(r.selloOk);
  assert.deepEqual(vistas, db.prepare('SELECT x FROM t ORDER BY rowid').all().map(f => f.x));
  db.close();
});

// ---------- 1.10 / 1.11 Índice y resumen sellado ----------

test('1.10 el índice: firmado con el sello; un byte cambiado → indice_no_autentico; formato nuevo se nombra', () => {
  const llaves = llavesDePrueba();
  const datos = {
    copia: '11111111-2222-4333-8444-555555555555', creada: '2026-11-09T08:41:00.000Z', servidor: 's', version: '0.5.0', migracion: 6,
    receptor: llaves.huella, publica: llaves.publica.toString('base64url'), bot: '700000001', anterior: null,
    flujo: { bytes: 200, sha256: 'a'.repeat(64) }, partes: [{ n: 1, nombre: 'x.opc', bytes: 274, sha256: 'b'.repeat(64), telegram: { mensaje: 5, archivo: 'BQ1', unico: 'U1' } }],
    sellado: 'zzz',
  };
  const texto = armarIndice(datos, llaves.sello);
  assert.match(texto, /^\{"oportia":"indice-copia","formato":1,"copia":/);
  assert.match(texto.split('\n')[1], /^OPORTIA-SELLO-1 [0-9a-f]{64}$/);
  assert.equal(leerIndice(texto, { sello: llaves.sello }).copia, datos.copia);
  for (const i of [20, 100, texto.indexOf('"bytes":274') + 9]) {
    const malo = texto.slice(0, i) + (texto[i] === '1' ? '2' : '1') + texto.slice(i + 1);
    assert.throws(() => leerIndice(malo, { sello: llaves.sello }), e => ['indice_no_autentico', 'indice_danado'].includes(e.clave), `byte ${i}`);
  }
  assert.throws(() => leerIndice(texto.replace('"bot":"700000001"', '"bot":"700000002"'), { sello: llaves.sello }), codigoDe('indice_no_autentico'));
  assert.throws(() => leerIndice(texto, { sello: derivar(crearClave().semilla).sello }), codigoDe('indice_no_autentico'));
  assert.throws(() => leerIndice(texto.split('\n')[0], { sello: llaves.sello }), codigoDe('indice_no_autentico'), 'sin firma');
  assert.throws(() => leerIndice(armarIndice({ ...datos, partes: [] }, llaves.sello)), codigoDe('indice_danado'));
  assert.throws(() => leerIndice(texto.replace('"formato":1', '"formato":2')), e => e.clave === 'formato_nuevo');
});

test('1.11 el resumen sellado solo se abre con la clave, y sus cuentas son las de la copia', async () => {
  const { config } = baseCompleta();
  const c = await copiaEnMemoria(config);
  const { texto, cabecera } = await abrirSellado(c.sellado, c.llaves.privada);
  const resumen = JSON.parse(texto);
  assert.equal(cabecera.contenido, 'oportia-resumen-v1');
  assert.equal(resumen.copia, c.copia);
  assert.deepEqual(resumen.porTabla, c.porTabla);
  assert.equal(resumen.filas, c.filas);
  assert.equal(resumen.migracion, 10); // 0.13.8: la 10 (cuentas eliminadas)
  await assert.rejects(abrirSellado(c.sellado, derivar(crearClave().semilla).privada), codigoDe('clave_no_es_de_esta_copia'));
  const s = sellar('x'.repeat(TROZO), c.llaves.publica, { copia: c.copia, creada: c.creada });
  assert.equal((await abrirSellado(s, c.llaves.privada)).texto.length, TROZO, 'un resumen de 64 KiB justos');
});

// ---------- 2.8b (núcleo): la revisión en el mismo paso ----------

test('la revisión en el mismo paso: un volcado que pierde una fila o una tabla nunca queda «comprobado» (volcado_incompleto)', async () => {
  const archivo = join(carpetaTemporal('revision'), 'r.db');
  baseSintetica(archivo, 'CREATE TABLE a (x); CREATE TABLE b (y);', [['INSERT INTO a VALUES (1)'], ['INSERT INTO a VALUES (2)'], ['INSERT INTO b VALUES (3)']]).close();
  // Un volcador «roto» que se salta una fila (y ajusta sus propias cuentas para que no se note a simple vista).
  const saltaFila = async function* (db, opciones) {
    let saltada = false;
    for await (const l of volcar(db, opciones)) {
      const texto = l.toString();
      if (!saltada && texto.startsWith('[2,')) { saltada = true; continue; }
      yield l;
    }
  };
  await assert.rejects(copiaEnMemoria({ archivoBase: archivo }, { volcar: saltaFila }), e => e.clave === 'volcado_incompleto' && e.datos.revision === 'volcado_danado');
  // Uno que pierde una tabla entera pero arma un volcado bien formado (sus cuentas no son las del COUNT(*)).
  const sinTablaB = async function* (db, opciones) {
    const { esquemaDeLaFoto } = await import('../src/copias/volcado.js');
    const original = esquemaDeLaFoto(db);
    const vista = { prepare: q => (/sqlite_schema ORDER BY rowid/.test(q) ? { all: () => db.prepare(q).all().filter(f => f.name !== 'b') } : db.prepare(q)) };
    assert.ok(original.tablas.length === 2);
    yield* volcar(vista, opciones);
  };
  await assert.rejects(copiaEnMemoria({ archivoBase: archivo }, { volcar: sinTablaB }), codigoDe('volcado_incompleto'));
  // Y la de verdad pasa.
  const buena = await copiaEnMemoria({ archivoBase: archivo });
  assert.equal(buena.filas, 3);
});

// ---------- 1.18 La llave de las claves nunca va en una copia ----------

test('1.18 la llave de las claves (oportia-llave-secretos y sus otros nombres) nunca se abre ni entra en una copia', async () => {
  const { config, db } = baseCompleta();
  const carpeta = dirname(config.archivoBase);
  const { readdirSync, readFileSync } = await import('node:fs');
  const deLlave = readdirSync(carpeta).filter(n => n.startsWith('oportia-llave'));
  assert.ok(deLlave.includes('oportia-llave-secretos'), 'la llave existe junto a la base');
  for (const nombre of deLlave) assert.throws(() => rutaSegura(join(carpeta, nombre)), codigoDe('archivo_de_llave'));
  assert.throws(() => rutaSegura(join(carpeta, 'OPORTIA-LLAVE-secretos.danada-1')), codigoDe('archivo_de_llave'));
  assert.equal(rutaSegura(config.archivoBase), config.archivoBase);
  const llaveTexto = readFileSync(join(carpeta, 'oportia-llave-secretos'), 'utf8').trim();
  const llaveB64 = llaveTexto.split(':')[1];
  const llaveBytes = Buffer.from(llaveB64, 'base64url');
  const c = await copiaEnMemoria(config);
  const lineas = await lineasDe(c.partes);
  const todo = Buffer.concat([...c.partes, Buffer.from(lineas.join('\n')), Buffer.from(c.sellado)]);
  for (const prohibido of [Buffer.from(llaveTexto), Buffer.from(llaveB64), llaveBytes, Buffer.from(llaveBytes.toString('hex')), Buffer.from('oportia-llave')]) {
    assert.equal(todo.indexOf(prohibido), -1, 'la llave (o su nombre) aparece en la copia');
  }
  // La clave de IA guardada sí va (CIFRADA, como está en la base), y no se puede leer sin la llave.
  assert.ok(lineas.some(l => l.includes('"ia_anthropic"')));
  assert.ok(!lineas.join('\n').includes('sk-ant-api03'));
  db.close();
});

// ---------- 1.19 Memoria acotada ----------

test('1.19 memoria: una base de 4 MB que no se comprime, en partes de 64 KiB, con un solo búfer y sin quedarse con ninguno', () => {
  const r = spawnSync(process.execPath, ['--no-warnings', '--expose-gc', '--max-old-space-size=64', '--max-semi-space-size=2', join(RAIZ, 'test', 'copia-memoria-hijo.mjs')], {
    encoding: 'utf8', timeout: 120_000, env: { PATH: process.env.PATH, OPORTIA_TEST: '1' },
  });
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(m.asignaciones, 1, 'el partidor pide su búfer una sola vez');
  assert.ok(m.partes >= 60, `partes: ${m.partes}`);
  assert.equal(m.retenido, false, 'después de la copia, ningún búfer de parte queda vivo');
  assert.ok(m.maxRssMb < 120, `el hijo usó ${m.maxRssMb} MB (el trabajador se apaga solo a los 120 MB)`);
});
