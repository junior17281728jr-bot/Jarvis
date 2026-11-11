// Fase 1, parte e (paso 1): RESTAURAR una copia (el contrato que envuelve la parte 1f). La vuelta completa (base → volcado
// → cifrado → partes → Telegram falso → bajar → comprobar → descifrar → abrir → comparar), desde archivos, el vector
// congelado, copias dañadas o falsas, la clave equivocada, partes que faltan, repetidas o en otro orden, y que nunca se
// pisa nada. Nunca usa internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { carpetaTemporal } from './ayuda.js';
import { CLAVE_DE_PRUEBA, llavesDePrueba, baseCompleta, baseSintetica, contenido, hacerCopia } from './copias-base.js';
import { crearTelegramFalso, tokenDePrueba } from './telegram-falso.js';
import { abrirBase, abrirFotoDeLectura, conectarBase, ID_APLICACION } from '../src/nucleo/db.js';
import { restaurarCopia, ajustarTrasRestaurar, empezarBusquedaDeChat, MARCA_EN_CONSTRUCCION } from '../src/copias/restaurar.js';
import { crearClave, derivar, textoDeClave } from '../src/copias/clave.js';
import { crearCifrador, transformarCifrado } from '../src/copias/cifrar.js';
import { volcar } from '../src/copias/volcado.js';
import { ErrorCopias, crearPartidor, armarIndice, CLAVE_SERVIDOR, CLAVE_ORIGENES } from '../src/copias/formato.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOT = 700000001;
const CHAT = 5550001;
const HORA = 3_600_000;
const codigoDe = clave => error => error instanceof ErrorCopias && error.clave === clave;
const marcaDe = archivo => readFileSync(archivo).readUInt32BE(68);
const huellaArchivo = archivo => createHash('sha256').update(readFileSync(archivo)).digest('hex');
const sinLlaves = c => Object.fromEntries(Object.entries(c));

// Una base v6 con filas en todas las tablas y bastante texto que no se comprime (la copia ocupa muchas partes).
function baseGrande() {
  const b = baseCompleta();
  const insertar = b.db.prepare("INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, NULL, 'prueba', ?)");
  for (let i = 0; i < 1500; i++) insertar.run(new Date().toISOString(), randomBytes(300).toString('base64'));
  return b;
}

test('1.12 el vector congelado (test/copia-v1.json) se abre con la clave de prueba, para siempre', async () => {
  const vector = JSON.parse(readFileSync(join(RAIZ, 'test', 'copia-v1.json'), 'utf8'));
  assert.equal(vector.clave, CLAVE_DE_PRUEBA);
  const carpeta = carpetaTemporal('vector');
  vector.partes.forEach((hex, i) => writeFileSync(join(carpeta, `p${i}.bin`), Buffer.from(hex, 'hex'), { flag: 'wx' }));
  writeFileSync(join(carpeta, 'indice.txt'), vector.indice, { flag: 'wx' });
  const destino = join(carpeta, 'restaurada.db');
  const r = await restaurarCopia({ clave: vector.clave, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino, ajustar: false, ahora: Date.parse(vector.creada) + HORA });
  assert.equal(r.copia, vector.copia);
  assert.equal(r.autentica, 'indice+flujo');
  assert.equal(r.receptor, vector.huella);
  assert.equal(r.edadHoras, 1);
  const db = new DatabaseSync(destino);
  assert.deepEqual(JSON.parse(JSON.stringify(contenido(db))), vector.esperado);
  db.close();
  // También sin el índice (solo las partes): la firma del flujo basta.
  const solo = carpetaTemporal('vector-solo');
  vector.partes.forEach((hex, i) => writeFileSync(join(solo, `x${i}.opc`), Buffer.from(hex, 'hex'), { flag: 'wx' }));
  const r2 = await restaurarCopia({ clave: vector.clave, fuente: { tipo: 'archivos', archivos: [solo] }, destino: null, ahora: Date.parse(vector.creada) });
  assert.equal(r2.autentica, 'flujo');
  assert.equal(r2.filas, 7);
});

test('1.15 la vuelta completa por Telegram: subir, bajar y comprobar cada parte, índice fijado, restaurar y TODO igual', async () => {
  const { config, db } = baseGrande();
  const token = tokenDePrueba(1);
  const falso = await crearTelegramFalso({ bots: [{ token, id: BOT, usuario: 'oportia_junior_bot' }], chats: [{ id: CHAT, nombre: 'Junior' }] });
  try {
    const c = await hacerCopia({ config, telegram: { token, url: falso.url, chat: CHAT, botId: BOT }, tamanoParte: 65_536 });
    assert.ok(c.partes.length >= 8, `partes: ${c.partes.length}`);
    assert.equal(falso.documentos.length, c.partes.length + 1, 'las partes y el índice');
    assert.equal(falso.fijado(CHAT), c.indiceMensaje);
    assert.ok(falso.documentos.every(d => d.silencioso), 'todo en silencio');
    for (const d of falso.documentos) assert.ok(d.bytes <= 65_536 + 74, 'cada parte cabe en una bajada de bot');
    const carpeta = carpetaTemporal('restaurar-telegram');
    const destino = join(carpeta, 'nueva.db');
    let elegida = null;
    const avances = [];
    const r = await restaurarCopia({
      clave: CLAVE_DE_PRUEBA.toLowerCase(), fuente: { tipo: 'telegram', token, chatId: String(CHAT) }, destino, carpetaTrabajo: join(carpeta, 'partes'),
      base: falso.url, ajustar: false, alElegir: async e => { elegida = e; return true; }, alAvanzar: a => avances.push(a.paso),
    });
    assert.equal(r.ok, true);
    assert.equal(r.autentica, 'indice+flujo');
    assert.equal(r.copia, c.resultado.copia);
    assert.equal(r.partes, c.partes.length);
    assert.equal(r.migracion, 7);
    assert.equal(r.version, '0.5.0');
    assert.equal(r.servidor, 'servidor-de-prueba');
    assert.deepEqual(r.claves.deIa, ['ia_anthropic']);
    assert.equal(r.claves.telegram, false);
    assert.equal(elegida.copia, c.resultado.copia);
    assert.equal(elegida.antigua, false);
    assert.ok(avances.includes('bajada'));
    // EXACTAMENTE igual: cada fila de cada tabla (con sus tipos), el esquema y la marca.
    const nueva = new DatabaseSync(destino);
    assert.deepEqual(contenido(nueva), contenido(db));
    assert.equal(nueva.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(nueva.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    nueva.close();
    assert.equal(marcaDe(destino), ID_APLICACION);
    // Las partes bajadas quedan (cifradas) en la carpeta de trabajo: nada de la base se lee en ellas.
    const bajadas = readdirSync(join(carpeta, 'partes'));
    assert.equal(bajadas.length, c.partes.length);
    for (const n of bajadas) assert.equal(readFileSync(join(carpeta, 'partes', n)).indexOf('junior'), -1);
    // La base restaurada abre como una base de OPORTIA más (sin cambios que aplicar) y el trabajador se conecta.
    const abierta = abrirBase({ archivoBase: destino, carpetaCopias: join(carpeta, 'copias') });
    assert.equal(abierta.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 7);
    abierta.close();
    assert.ok(!existsSync(join(carpeta, 'copias')), 'nada que copiar antes de cambios: no había cambios');
    conectarBase({ archivoBase: destino }, { versionMinima: 6 }).close();
    // Otra vez a la misma carpeta de trabajo: nunca pisa las partes ya bajadas.
    const otra = join(carpeta, 'otra.db');
    await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token, chatId: CHAT }, destino: otra, carpetaTrabajo: join(carpeta, 'partes'), base: falso.url, ajustar: false });
    assert.equal(readdirSync(join(carpeta, 'partes')).length, 2 * c.partes.length);
    // Con el token de OTRO bot: esa copia no es suya.
    const token2 = tokenDePrueba(2);
    falso.agregarBot({ token: token2, id: BOT + 1 });
    await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token: token2, chatId: CHAT }, destino: join(carpeta, 'x.db'), carpetaTrabajo: join(carpeta, 'p2'), base: falso.url }), codigoDe('otro_bot'));
    // El índice que Telegram devuelve cambiado: se rechaza. Según qué bytes cambie el Telegram falso (al azar), el
    // índice deja de parecer un índice («sin_indice») o parece uno pero no es auténtico: las dos respuestas lo rechazan.
    falso.escena('file', 'cambiar_bytes');
    await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token, chatId: CHAT }, destino: null, carpetaTrabajo: join(carpeta, 'p3'), base: falso.url }),
      e => ['indice_no_autentico', 'sin_indice'].includes(e?.clave));
    // Una parte que Telegram devuelve cambiada: se nota (y nada queda como base).
    falso.escena('file', 'cambiar_bytes', { saltar: 2 });
    await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token, chatId: CHAT }, destino: join(carpeta, 'y.db'), carpetaTrabajo: join(carpeta, 'p3'), base: falso.url }), codigoDe('parte_danada'));
    assert.ok(!existsSync(join(carpeta, 'y.db')));
    // Un enlace vencido una vez: pide otro getFile y sigue.
    falso.escena('file', 'ruta_vencida');
    const r3 = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token, chatId: CHAT }, destino: null, carpetaTrabajo: join(carpeta, 'p4'), base: falso.url });
    assert.equal(r3.ok, true);
    // Sin nada fijado: sin_indice (la 1f pide entonces reenviar el índice al bot).
    falso.desfijar(CHAT);
    await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token, chatId: CHAT }, destino: null, carpetaTrabajo: join(carpeta, 'p5'), base: falso.url }), codigoDe('sin_indice'));
    // Con el índice por su id (camino B′: el dueño lo reenvía al bot).
    const indiceId = falso.documentos.at(-1).archivoId;
    const r4 = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token, chatId: CHAT, indiceArchivoId: indiceId }, destino: null, carpetaTrabajo: join(carpeta, 'p6'), base: falso.url });
    assert.equal(r4.copia, c.resultado.copia);
    // Un token que ya no sirve.
    await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'telegram', token: tokenDePrueba(5), chatId: CHAT }, destino: null, carpetaTrabajo: join(carpeta, 'p7'), base: falso.url }), e => e.clave === 'telegram' && e.datos.motivo === 'clave_no_valida');
  } finally {
    await falso.cerrar();
    db.close();
  }
});

test('1.16 desde archivos: en cualquier orden y con cualquier nombre, sin índice, solo comprobar, y una parte repetida', async () => {
  const { config, db } = baseGrande();
  const carpeta = carpetaTemporal('archivos');
  const c = await hacerCopia({ config, carpeta: join(carpeta, 'noche'), tamanoParte: 65_536 });
  const rutas = c.partes.map(p => p.ruta).sort(() => Math.random() - 0.5);
  // Una parte repetida (copiada con otro nombre) se tolera.
  copyFileSync(rutas[0], join(carpeta, 'noche', 'repetida.bin'));
  const destino = join(carpeta, 'a.db');
  const r = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [c.rutaIndice, ...rutas, join(carpeta, 'noche', 'repetida.bin')] }, destino });
  assert.equal(r.autentica, 'indice+flujo');
  const nueva = new DatabaseSync(destino);
  assert.equal(nueva.prepare('SELECT COUNT(*) AS n FROM auditoria').get().n, db.prepare('SELECT COUNT(*) AS n FROM auditoria').get().n + 1, 'más la fila «base_restaurada»');
  nueva.close();
  // Sin el índice: las partes solas (firma del flujo).
  const r2 = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: rutas }, destino: join(carpeta, 'b.db'), ajustar: false });
  assert.equal(r2.autentica, 'flujo');
  const b = new DatabaseSync(join(carpeta, 'b.db'));
  assert.deepEqual(contenido(b), contenido(db));
  b.close();
  // Solo comprobar: no escribe ninguna base.
  const antes = readdirSync(carpeta).length;
  const r3 = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'noche')] }, destino: null });
  assert.equal(r3.ok, true);
  assert.equal(r3.filas, c.resultado.filas);
  assert.equal(readdirSync(carpeta).length, antes);
  // La llave de las claves en la lista: se salta (nunca se abre) y la copia se restaura igual.
  const llave = join(dirname(config.archivoBase), 'oportia-llave-secretos');
  assert.ok(existsSync(llave));
  const r4 = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [llave, join(carpeta, 'noche')] }, destino: null });
  assert.equal(r4.ok, true);
  db.close();
});

test('1.16 dos noches en la carpeta: si a la más nueva le falta una parte, se dice; con «anterior», la otra y se avisa que hay una más nueva', async () => {
  const { config, db } = baseCompleta();
  const carpeta = carpetaTemporal('dos-noches');
  const ahora = Date.now();
  const vieja = await hacerCopia({ config, carpeta: join(carpeta, 'todo'), tamanoParte: 4096, creada: new Date(ahora - 40 * HORA).toISOString() });
  db.prepare("INSERT INTO auditoria (fecha, accion) VALUES (?, 'después')").run(new Date().toISOString());
  const nueva = await hacerCopia({ config, carpeta: join(carpeta, 'todo'), tamanoParte: 4096, creada: new Date(ahora - HORA).toISOString() });
  assert.ok(nueva.partes.length >= 2);
  const lista = [...vieja.partes.map(p => p.ruta), vieja.rutaIndice, ...nueva.partes.slice(1).map(p => p.ruta), nueva.rutaIndice];
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: lista }, destino: null }),
    e => e.clave === 'falta_parte' && e.datos.copia === nueva.resultado.copia && e.datos.n === 1);
  let vista = null;
  const r = await restaurarCopia({
    clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: lista }, destino: null, aceptarAnterior: true, ahora,
    alElegir: async e => { vista = e; return true; },
  });
  assert.equal(r.copia, vieja.resultado.copia);
  assert.deepEqual(r.hayMasNueva, { copia: nueva.resultado.copia, creada: nueva.creada });
  assert.equal(vista.antigua, true, 'de hace 40 horas');
  assert.equal(vista.edadHoras, 40);
  // El dueño dice «no»: nada se escribe.
  const destino = join(carpeta, 'no.db');
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: lista }, destino, aceptarAnterior: true, alElegir: async () => false }), codigoDe('cancelada_por_dueno'));
  assert.ok(!existsSync(destino));
  // Con todas las partes, la más nueva.
  const todas = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'todo')] }, destino: null });
  assert.equal(todas.copia, nueva.resultado.copia);
  assert.equal(todas.hayMasNueva, null);
  // Ronda 3: las partes de la nueva SIN su índice, junto a la vieja con el suyo: la nueva está completa (se prueba entera
  // sin escribir nada), así que se ofrece ELLA, y la del índice queda como «la otra» (se pregunta).
  let pregunta = null;
  const sinIndice = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [...vieja.partes.map(p => p.ruta), vieja.rutaIndice, ...nueva.partes.map(p => p.ruta)] }, destino: null, alElegir: async e => { pregunta = e; return true; } });
  assert.equal(sinIndice.copia, nueva.resultado.copia);
  assert.equal(sinIndice.autentica, 'flujo');
  assert.equal(pregunta.sinIndice, true);
  assert.equal(pregunta.otraCandidata.copia, vieja.resultado.copia);
  assert.equal(pregunta.otraCandidata.motivo, 'con_indice_mas_vieja');
  // Si a la nueva sin índice le falta su última parte (está cortada), se usa la del índice y se dice que hay una más nueva.
  const cortada = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [...vieja.partes.map(p => p.ruta), vieja.rutaIndice, ...nueva.partes.slice(0, -1).map(p => p.ruta)] }, destino: null });
  assert.equal(cortada.copia, vieja.resultado.copia);
  assert.deepEqual(cortada.hayMasNueva, { copia: nueva.resultado.copia, creada: nueva.creada });
  db.close();
});

test('1.10 / 1.16 la clave equivocada, un índice tocado, una parte dañada o de otra copia: cada uno con su nombre', async () => {
  const { config, db } = baseCompleta();
  const carpeta = carpetaTemporal('danadas');
  const c = await hacerCopia({ config, carpeta: join(carpeta, 'buena'), tamanoParte: 4096 });
  const fuente = { tipo: 'archivos', archivos: [join(carpeta, 'buena')] };
  // Otra clave (bien escrita): «esta copia se hizo con otra clave» y su huella.
  const otra = crearClave().texto;
  await assert.rejects(restaurarCopia({ clave: otra, fuente, destino: null }), e => e.clave === 'clave_no_es_de_esta_copia' && e.datos.receptor === 'NB5W');
  await assert.rejects(restaurarCopia({ clave: otra, fuente: { tipo: 'archivos', archivos: c.partes.map(p => p.ruta) }, destino: null }), codigoDe('clave_no_es_de_esta_copia'));
  // Mal escrita: se dice enseguida.
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA.replace(/^./, CLAVE_DE_PRUEBA[0] === 'Z' ? 'Y' : 'Z'), fuente, destino: null }), codigoDe('clave_control'));
  await assert.rejects(restaurarCopia({ clave: 'hola', fuente, destino: null }), codigoDe('clave_formato'));
  // El índice tocado (un número cambiado): no es auténtico.
  const tocado = join(carpeta, 'tocado');
  mkdirSync(tocado);
  for (const p of c.partes) copyFileSync(p.ruta, join(tocado, `${p.n}.bin`));
  writeFileSync(join(tocado, 'indice.txt'), c.indice.replace('"version":"0.5.0"', '"version":"0.5.1"'));
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [tocado] }, destino: null }), codigoDe('indice_no_autentico'));
  // Una parte con un byte cambiado (su cabecera ya no cuadra): parte_danada con su número.
  const danada = join(carpeta, 'danada');
  mkdirSync(danada);
  for (const p of c.partes) {
    const b = readFileSync(p.ruta);
    if (p.n === 2) b[b.length - 5] ^= 0x10;
    writeFileSync(join(danada, `${p.n}.bin`), b);
  }
  writeFileSync(join(danada, 'indice.txt'), c.indice);
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [danada] }, destino: null }), e => e.clave === 'parte_danada' && e.datos.n === 2);
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [...readdirSync(danada).filter(n => n.endsWith('.bin')).map(n => join(danada, n))] }, destino: null }), e => e.clave === 'parte_danada' && e.datos.n === 2);
  // La parte 2 de OTRA copia en su lugar: falta la de esta copia (y no se mezclan).
  const otraCopia = await hacerCopia({ config, carpeta: join(carpeta, 'otra'), tamanoParte: 4096 });
  const mezcla = [c.rutaIndice, ...c.partes.filter(p => p.n !== 2).map(p => p.ruta), otraCopia.partes[1].ruta];
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: mezcla }, destino: null }), e => e.clave === 'falta_parte' && e.datos.n === 2);
  // Sin la última parte y sin índice: la copia está cortada.
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: c.partes.slice(0, -1).map(p => p.ruta) }, destino: null }), codigoDe('copia_cortada'));
  // Sin la primera y sin índice: falta la 1.
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: c.partes.slice(1).map(p => p.ruta) }, destino: null }), e => e.clave === 'falta_parte' && e.datos.n === 1);
  // Una carpeta sin copias.
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [carpetaTemporal('vacia')] }, destino: null }), codigoDe('sin_indice'));
  db.close();
});

// Un «atacante» que solo tiene la llave PÚBLICA (y quizás el token del bot): arma una copia cifrada a esa llave con el
// volcado que quiera. Sin el sello (que sale de la clave de recuperación) nunca pasa.
async function copiaDeAtacante({ archivo, carpeta, cambiar = l => l, selloFalso = randomBytes(32) }) {
  const llaves = llavesDePrueba();
  const foto = abrirFotoDeLectura({ archivoBase: archivo });
  const copia = randomUUID();
  const cifrador = crearCifrador({ publica: llaves.publica, copia, creada: new Date().toISOString() });
  mkdirSync(carpeta, { recursive: true });
  const rutas = [];
  const partidor = crearPartidor({ copia, tamanoParte: 4096, alParte: async p => { const r = join(carpeta, `${p.n}.bin`); writeFileSync(r, p.archivo, { flag: 'wx' }); rutas.push(r); } });
  async function* lineas() {
    const todas = [];
    for await (const l of volcar(foto.db, { copia, sello: selloFalso, hashCabecera: cifrador.hashCabecera })) todas.push(l);
    yield* cambiar(todas);
  }
  await pipeline(Readable.from(lineas()), createGzip(), transformarCifrado(cifrador), new Writable({
    async write(d, _c, l) { await partidor.escribir(d); l(); }, async final(l) { await partidor.terminar(); l(); },
  }));
  foto.cerrar();
  return { rutas, copia, llaves };
}

test('1.4 una copia hecha con solo la llave pública (sin el sello) nunca se restaura, con o sin índice', async () => {
  const carpeta = carpetaTemporal('atacante');
  const archivo = join(carpeta, 'base.db');
  baseSintetica(archivo, 'CREATE TABLE t (x TEXT);', [['INSERT INTO t VALUES (?)', 'datos falsos']]).close();
  // Con un sello inventado.
  const a = await copiaDeAtacante({ archivo, carpeta: join(carpeta, 'a') });
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: a.rutas }, destino: join(carpeta, 'a.db') }), codigoDe('copia_no_autentica'));
  // Sin índice, la copia se descifra entera ANTES de escribir nada: el destino ni se crea (y nunca sería de OPORTIA).
  assert.ok(!existsSync(join(carpeta, 'a.db')) || marcaDe(join(carpeta, 'a.db')) !== ID_APLICACION, 'lo que alcanzó a escribir nunca es una base de OPORTIA');
  // Sin la línea del sello.
  const b = await copiaDeAtacante({ archivo, carpeta: join(carpeta, 'b'), cambiar: l => l.slice(0, -1) });
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: b.rutas }, destino: null }), codigoDe('copia_no_autentica'));
  // Con algo después del sello.
  const c = await copiaDeAtacante({ archivo, carpeta: join(carpeta, 'c'), cambiar: l => [...l, Buffer.from('{"t":"fin","tablas":0,"filas":0}\n')] });
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: c.rutas }, destino: null }), codigoDe('copia_no_autentica'));
  // Y con un índice firmado con un sello inventado (la llave pública es la del dueño): no es auténtico.
  const d = await copiaDeAtacante({ archivo, carpeta: join(carpeta, 'd') });
  const llaves = llavesDePrueba();
  const partes = d.rutas.map((r, i) => ({ n: i + 1, nombre: `${i + 1}.bin`, bytes: statSync(r).size, sha256: huellaArchivo(r), telegram: null }));
  const indice = armarIndice({ copia: d.copia, creada: new Date().toISOString(), receptor: llaves.huella, publica: llaves.publica.toString('base64url'), flujo: { bytes: 1, sha256: 'a'.repeat(64) }, partes, sellado: 'x' }, randomBytes(32));
  writeFileSync(join(carpeta, 'd', 'indice.txt'), indice);
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'd')] }, destino: null }), codigoDe('indice_no_autentico'));
});

test('1.16b una base restaurada se ajusta: la copia que se estaba haciendo queda interrumpida, su tarea cancelada y el servidor con un id nuevo', async () => {
  const { config, db } = baseCompleta();
  const ahora = new Date().toISOString();
  const copia = randomUUID();
  db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").run(CLAVE_SERVIDOR, JSON.stringify({ id: 'servidor-viejo' }), ahora);
  const tarea = db.prepare(`INSERT INTO tareas (tipo, programa, estado, disponible_en, creada_en, actualizada_en) VALUES ('copias.hacer', 'copias.hacer', 'en_curso', ?, ?, ?)`).run(ahora, ahora, ahora).lastInsertRowid;
  db.prepare("INSERT INTO copias (copia, estado, empezada_en, tarea_id) VALUES (?, 'haciendo', ?, ?)").run(copia, ahora, tarea);
  db.prepare("INSERT INTO copias (copia, estado, empezada_en, verificada_en) VALUES (?, 'verificada', ?, ?)").run(randomUUID(), ahora, ahora);
  const carpeta = carpetaTemporal('ajustar');
  await hacerCopia({ config, carpeta: join(carpeta, 'p'), tamanoParte: 4096, copia });
  const destino = join(carpeta, 'nueva.db');
  const r = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'p')] }, destino });
  assert.equal(r.copiaEnCurso.copia, copia);
  assert.equal(r.copiaEnCurso.estado, 'haciendo', 'así estaba en la foto');
  assert.ok(r.ajuste.copiasInterrumpidas >= 1);
  assert.equal(r.ajuste.tareasCanceladas, 1);
  const nueva = new DatabaseSync(destino);
  assert.equal(nueva.prepare("SELECT COUNT(*) AS n FROM copias WHERE estado IN ('haciendo', 'escrita', 'subida')").get().n, 0);
  assert.equal(nueva.prepare('SELECT estado, motivo FROM copias WHERE copia = ?').get(copia).motivo, 'restaurada');
  assert.equal(nueva.prepare("SELECT COUNT(*) AS n FROM copias WHERE estado = 'verificada'").get().n, 1, 'las demás quedan como estaban');
  assert.equal(nueva.prepare('SELECT estado FROM tareas WHERE id = ?').get(tarea).estado, 'cancelada');
  assert.ok(nueva.prepare("SELECT 1 FROM tarea_eventos WHERE tarea_id = ? AND evento = 'cancelada'").get(tarea));
  const servidor = JSON.parse(nueva.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_SERVIDOR).valor);
  assert.equal(servidor.id, r.ajuste.servidorNuevo);
  assert.notEqual(servidor.id, 'servidor-viejo');
  assert.deepEqual(JSON.parse(nueva.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_ORIGENES).valor).map(o => o.id), ['servidor-viejo']);
  assert.ok(nueva.prepare("SELECT 1 FROM auditoria WHERE accion = 'base_restaurada'").get());
  nueva.close();
  // ajustarTrasRestaurar en una base sin esas tablas no falla.
  const vacia = new DatabaseSync(':memory:');
  assert.deepEqual(ajustarTrasRestaurar(vacia), { copiasInterrumpidas: 0, tareasCanceladas: 0, servidorNuevo: null });
  db.close();
});

test('1.17 nunca pisa nada: un destino que existe (o su -wal) se rechaza intacto; cortar a mitad deja un archivo que no es base de OPORTIA', async () => {
  const carpeta = carpetaTemporal('no-pisar');
  const archivo = join(carpeta, 'base.db');
  baseSintetica(archivo, 'CREATE TABLE t (id INTEGER PRIMARY KEY, x TEXT);', Array.from({ length: 25_000 }, (_, i) => ['INSERT INTO t (x) VALUES (?)', `fila ${i}`])).close();
  const c = await hacerCopia({ config: { archivoBase: archivo }, carpeta: join(carpeta, 'p'), tamanoParte: 65_536 });
  const fuente = { tipo: 'archivos', archivos: [join(carpeta, 'p')] };
  const existe = join(carpeta, 'existe.db');
  writeFileSync(existe, 'algo del dueño');
  const antes = huellaArchivo(existe);
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente, destino: existe }), codigoDe('destino_existe'));
  assert.equal(huellaArchivo(existe), antes);
  writeFileSync(join(carpeta, 'conwal.db-wal'), 'x');
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente, destino: join(carpeta, 'conwal.db') }), codigoDe('destino_existe'));
  assert.ok(!existsSync(join(carpeta, 'conwal.db')));
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente, destino: join(carpeta, 'oportia-llave-secretos') }), codigoDe('archivo_de_llave'));
  // Cortar a mitad (la señal de parar cuando ya se aplicaron filas).
  const control = new AbortController();
  const mitad = join(carpeta, 'mitad.db');
  await assert.rejects(restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente, destino: mitad, senal: control.signal, alAvanzar: a => { if (a.paso === 'filas') control.abort(); } }), codigoDe('cancelada'));
  assert.ok(existsSync(mitad), 'lo hecho queda (nada se borra)');
  assert.equal(marcaDe(mitad), MARCA_EN_CONSTRUCCION, 'con la marca «en construcción», no la de OPORTIA');
  const parcial = new DatabaseSync(mitad, { readOnly: true });
  const n = parcial.prepare('SELECT COUNT(*) AS n FROM t').get().n;
  parcial.close();
  assert.ok(n > 0 && n < 25_000, `filas aplicadas antes de cortar: ${n}`);
  assert.throws(() => abrirBase({ archivoBase: mitad, carpetaCopias: join(carpeta, 'c') }), /no es de OPORTIA/);
  assert.equal(c.resultado.filas, 25_000);
});

test('la búsqueda del chat en un servidor nuevo: código de un uso, un extraño que escribe a la vez se ignora, y ids que saltan hacia abajo', async () => {
  const token = tokenDePrueba(1);
  const falso = await crearTelegramFalso({ bots: [{ token, id: BOT }], chats: [{ id: CHAT, nombre: 'Junior' }, { id: 999, nombre: 'Extraño' }, { id: -5, tipo: 'group', nombre: 'Grupo' }] });
  try {
    falso.escribir({ chat: CHAT, texto: 'un mensaje de hace semanas', fecha: Math.floor(Date.now() / 1000) - 3 * 86400 });
    const busqueda = await empezarBusquedaDeChat({ token, base: falso.url, cadaMs: 20 });
    assert.match(busqueda.codigo, /^\d{8}$/);
    assert.equal(falso.pendientes(), 0, 'lo viejo quedó confirmado');
    const espera = busqueda.esperar({ hastaMs: Date.now() + 10_000 });
    falso.escribir({ chat: 999, texto: busqueda.codigo.replace(/./, d => String((Number(d) + 1) % 10)) }); // un extraño con otro código
    falso.escribir({ chat: -5, texto: busqueda.codigo }); // un grupo
    falso.escribir({ chat: 777, de: 777, texto: busqueda.codigo, esBot: true });
    falso.escribir({ chat: CHAT, texto: `/start ${busqueda.codigo}`, idsAlAzar: true });
    const r = await espera;
    assert.deepEqual([r.chatId, r.nombre, r.usuario], [String(CHAT), 'Junior', null]);
    // Ronda 3: el bot le mandó a ESE chat un segundo código; hasta escribirlo, no se confía en el chat.
    const m = falso.mensajes.filter(x => x.chatId === String(CHAT) && x.text?.startsWith('🔐')).at(-1);
    const segundo = /(\d{3}) (\d{3})/.exec(m.text).slice(1).join('');
    assert.equal(r.confirmar(segundo === '000000' ? '111111' : '000000'), false);
    assert.equal(r.confirmar(` ${segundo.slice(0, 3)} ${segundo.slice(3)} `), true);
    assert.equal(falso.mensajes.filter(x => x.chatId === '999').length, 0, 'al extraño no se le manda nada');
    // Cinco intentos equivocados: el código vence.
    const otra = await empezarBusquedaDeChat({ token, base: falso.url, cadaMs: 20 });
    const vence = otra.esperar({ hastaMs: Date.now() + 10_000 });
    for (let i = 0; i < 5; i++) falso.escribir({ chat: 999, texto: '00000000' === otra.codigo ? '11111111' : '00000000' });
    await assert.rejects(vence, codigoDe('codigo_vencido'));
    // El tiempo se acaba.
    const tarde = await empezarBusquedaDeChat({ token, base: falso.url, cadaMs: 20 });
    await assert.rejects(tarde.esperar({ hastaMs: Date.now() + 100 }), codigoDe('codigo_vencido'));
    // Un bot con webhook lo usa otro programa: no se busca.
    falso.ponerWebhook(token, 'https://otro.example/x');
    await assert.rejects(empezarBusquedaDeChat({ token, base: falso.url }), e => e.clave === 'telegram' && e.datos.motivo === 'bot_ocupado');
  } finally {
    await falso.cerrar();
  }
});
