// Fase 1, parte d: el almacén de claves secretas (cifradas) y la llave que las protege.
// Las claves de estas pruebas son FALSAS y se arman al correr: ninguna clave vive en el repositorio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configDePrueba } from './ayuda.js';
import { abrirBase } from '../src/nucleo/db.js';
import { ErrorHttp } from '../src/nucleo/http.js';
import { crearPrimerAdmin } from '../src/cuentas/usuarios.js';
import {
  rutaLlave, estadoLlave, asegurarLlave, leerLlave, apartarLlaveDanada, diagnosticoLlave, huellaDe, ErrorClaves, esArchivoDeLlave, recuperarLlave,
  PREFIJO_ARCHIVOS_LLAVE, empezarLlaveNueva,
} from '../src/claves/cifrado.js';
import {
  validarValor, guardarSecreto, leerSecreto, listarSecretos, activarSecreto, desactivarSecreto, anotarPrueba, pausarSecreto,
  quitarPausaCorta, reanudarSecreto, secretoUsable, pausaVigente, estadoAlmacen, clavesGuardadas,
} from '../src/claves/almacen.js';
import { USOS, ESTADOS_SECRETO, ORIGENES_SECRETO } from '../src/claves/usos.js';
import { MOTIVOS } from '../src/ia/propositos.js';
import { buscarEnTodo } from './ia-base.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.parse('2026-11-10T15:00:00Z');

// Claves FALSAS, armadas al correr (el revisor de secretos del repositorio nunca ve una clave entera).
const claveAnthropic = (letra = 'x') => ['sk', 'ant', 'api03', `prueba${letra.repeat(32)}`].join('-');
const claveOpenai = (letra = 'z') => ['sk', 'proj', `prueba${letra.repeat(32)}`].join('-');

function nuevaBase() {
  const config = configDePrueba();
  const db = abrirBase(config);
  const admin = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x' });
  return { config, db, admin };
}

function falla(fn, clave, codigo = null) {
  assert.throws(fn, e => {
    assert.ok(e instanceof ErrorHttp || e instanceof ErrorClaves, `error inesperado: ${e?.name}`);
    assert.equal(e.clave, clave);
    if (codigo != null) assert.equal(e.codigo, codigo);
    return true;
  });
}

// ---------- 2. La llave maestra ----------

test('la llave se crea solo al guardar la primera clave: 600, oportia-llave-v1, 32 bytes, y nunca cambia', () => {
  const { config, db, admin } = nuevaBase();
  const ruta = rutaLlave(config);
  assert.equal(existsSync(ruta), false, 'abrir la base no crea la llave');
  assert.deepEqual(estadoLlave(config), { listo: false, motivo: 'llave_no_existe', huella: null });
  assert.equal(leerSecreto(db, config, { id: 1 }), null);
  assert.deepEqual(listarSecretos(db, config).map(u => u.activa), Object.keys(USOS).map(() => null));
  assert.equal(existsSync(ruta), false, 'leer nunca crea la llave');

  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('a'), usuarioId: admin, ahora: T0 });
  assert.equal(statSync(ruta).mode & 0o777, 0o600);
  const contenido = readFileSync(ruta, 'latin1');
  assert.match(contenido, /^oportia-llave-v1:[A-Za-z0-9_-]{43}\n$/);
  assert.equal(Buffer.from(contenido.slice(17, -1), 'base64url').length, 32);
  for (let i = 0; i < 5; i++) guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(String.fromCharCode(98 + i)), usuarioId: admin, ahora: T0 + i });
  assert.equal(readFileSync(ruta, 'latin1'), contenido, 'cinco claves más dejan la llave igual, byte por byte');
  assert.equal(estadoLlave(config).huella, huellaDe(leerLlave(config).llave));
  db.close();
});

test('una llave dañada nunca se reemplaza: guardar responde 503 almacen_no_disponible y el archivo queda igual', () => {
  const { config, db, admin } = nuevaBase();
  const ruta = rutaLlave(config);
  writeFileSync(ruta, 'esto no es una llave\n', { mode: 0o600 });
  assert.equal(estadoLlave(config).motivo, 'llave_danada');
  const antes = db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n;
  falla(() => guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin }), 'almacen_no_disponible', 503);
  assert.equal(readFileSync(ruta, 'utf8'), 'esto no es una llave\n');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, antes, 'no se guardó nada');
  db.close();
});

test('una llave de una versión más nueva (oportia-llave-v2) no está dañada: no se aparta ni se reemplaza', () => {
  const { config, db, admin } = nuevaBase();
  const ruta = rutaLlave(config);
  writeFileSync(ruta, `oportia-llave-v2:${'Q'.repeat(60)}\n`, { mode: 0o600 });
  assert.equal(estadoLlave(config).motivo, 'llave_version_nueva');
  falla(() => guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin }), 'almacen_no_disponible', 503);
  assert.deepEqual(apartarLlaveDanada(config, { ahora: T0 }), { apartada: false, motivo: 'llave_version_nueva', archivo: null });
  assert.ok(existsSync(ruta));
  assert.ok(diagnosticoLlave(config, { db }).some(l => l.includes('versión más nueva')));
  db.close();
});

test('apartar una llave dañada le cambia el nombre (no la borra) y la próxima clave crea una llave nueva', () => {
  const { config, db, admin } = nuevaBase();
  const ruta = rutaLlave(config);
  // Una llave buena: no se aparta.
  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('v'), usuarioId: admin, ahora: T0 });
  assert.deepEqual(apartarLlaveDanada(config, { ahora: T0 }), { apartada: false, motivo: 'llave_sana', archivo: null });
  const huellaVieja = estadoLlave(config).huella;
  // Se daña desde afuera (un disco, una edición a mano).
  writeFileSync(ruta, 'roto');
  assert.equal(estadoLlave(config).motivo, 'llave_danada');
  const r = apartarLlaveDanada(config, { ahora: T0 });
  assert.equal(r.apartada, true);
  assert.equal(r.archivo, 'oportia-llave-secretos.danada-20261110-150000');
  assert.equal(readFileSync(join(dirname(ruta), r.archivo), 'utf8'), 'roto', 'el archivo apartado queda igual');
  assert.equal(existsSync(ruta), false);
  // Si el nombre de destino ya existe, no se pisa.
  writeFileSync(ruta, 'roto otra vez');
  assert.deepEqual(apartarLlaveDanada(config, { ahora: T0 }), { apartada: false, motivo: 'ya_existe', archivo: null });
  assert.equal(readFileSync(join(dirname(ruta), r.archivo), 'utf8'), 'roto');
  // Otro segundo: se aparta, y la siguiente clave crea una llave nueva; la clave vieja queda como historia ilegible.
  assert.equal(apartarLlaveDanada(config, { ahora: T0 + 1000 }).apartada, true);
  const nueva = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('w'), usuarioId: admin, ahora: T0 + 2000 });
  assert.notEqual(estadoLlave(config).huella, huellaVieja);
  assert.equal(nueva.secreto.legible, true);
  const lista = listarSecretos(db, config).find(u => u.uso === 'ia_anthropic');
  assert.equal(lista.anteriores[0].legible, false);
  assert.equal(leerSecreto(db, config, { id: nueva.secreto.id }), claveAnthropic('w'));
  const lineas = diagnosticoLlave(config, { db });
  assert.ok(lineas.some(l => l.includes('apartadas')));
  db.close();
});

test('si el proceso se cae mientras crea la llave, el nombre final nunca queda a medias y la próxima vez sale completa', () => {
  const { config, db, admin } = nuevaBase();
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  assert.throws(() => asegurarLlave(config, { prueba: { trasCrearTemporal() { throw new Error('se cayó a mitad'); } } }), /se cayó a mitad/);
  assert.equal(existsSync(ruta), false, 'el nombre final no existe');
  const temporales = readdirSync(carpeta).filter(n => n.startsWith('oportia-llave-secretos.nueva-'));
  assert.equal(temporales.length, 1);
  assert.equal(statSync(join(carpeta, temporales[0])).size, 0, 'quedó un temporal vacío');
  // La próxima clave crea la llave completa; el temporal viejo queda como estaba.
  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin });
  assert.equal(estadoLlave(config).listo, true);
  assert.equal(statSync(join(carpeta, temporales[0])).size, 0);
  assert.ok(diagnosticoLlave(config, { db }).some(l => l.includes(temporales[0]) && l.includes('a medias')));
  db.close();
});

// Ronda 1 de revisión: el nombre .nueva-… que queda al crear la llave ES la llave (el mismo archivo), no un sobrante:
// la revisión lo dice así, la regla de las copias es por el comienzo del nombre, y si falta el nombre final se puede
// recuperar desde él (sin borrar ni pisar nada).
test('el nombre .nueva-… que queda al crear la llave es la MISMA llave: se dice así, nunca se copia y sirve para recuperarla', () => {
  const { config, db, admin } = nuevaBase();
  const { secreto } = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin });
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  const otros = readdirSync(carpeta).filter(n => n.startsWith('oportia-llave-secretos.nueva-'));
  assert.equal(otros.length, 1);
  const principal = statSync(ruta);
  const otro = statSync(join(carpeta, otros[0]));
  assert.deepEqual([otro.ino, otro.nlink, principal.nlink], [principal.ino, 2, 2], 'el mismo archivo, con dos nombres');
  const texto = diagnosticoLlave(config, { db }).join('\n');
  assert.match(texto, new RegExp(`${otros[0].replace(/[.]/g, '\\.')}: es OTRO NOMBRE del mismo archivo de la llave`));
  assert.doesNotMatch(texto, /temporal\(es\)|no se usan/);
  // La regla para las copias (partes e y f): por el comienzo del nombre, nunca por el nombre exacto.
  assert.equal(PREFIJO_ARCHIVOS_LLAVE, 'oportia-llave');
  for (const nombre of ['oportia-llave-secretos', otros[0], 'oportia-llave-secretos.danada-20261110-150000', join(carpeta, otros[0]), 'OPORTIA-LLAVE-SECRETOS']) {
    assert.equal(esArchivoDeLlave(nombre), true, nombre);
  }
  for (const nombre of ['oportia.db', 'oportia.db-wal', 'oportia-copias', 'llave', '']) assert.equal(esArchivoDeLlave(nombre), false, nombre);
  // Una llave sana nunca se «recupera».
  assert.equal(recuperarLlave(config, { huellas: [secreto.llaveHuella ?? estadoLlave(config).huella] }).motivo, 'llave_sana');
  // Si el nombre final se pierde (por ejemplo, alguien lo movió), la llave sigue con su otro nombre: se recupera.
  const huella = estadoLlave(config).huella;
  renameSync(ruta, join(carpeta, 'movida-a-mano'));
  assert.equal(estadoLlave(config).motivo, 'llave_no_existe');
  const lineas = diagnosticoLlave(config, { db }).join('\n');
  assert.match(lineas, /es una llave completa de OPORTIA, la misma con la que se guardaron tus claves/);
  assert.match(lineas, /--claves=recuperar-llave/);
  assert.equal(recuperarLlave(config, { huellas: ['0000000000000000'] }).motivo, 'sin_llave_que_sirva', 'solo la llave de las claves guardadas');
  assert.equal(existsSync(ruta), false);
  const r = recuperarLlave(config, { huellas: [huella] });
  assert.deepEqual([r.recuperada, r.archivo, r.huella], [true, otros[0], huella]);
  assert.equal(estadoLlave(config).huella, huella);
  assert.equal(leerSecreto(db, config, { id: secreto.id }), claveAnthropic(), 'las claves guardadas se leen otra vez');
  assert.ok(existsSync(join(carpeta, otros[0])) && existsSync(join(carpeta, 'movida-a-mano')), 'nada se borró');
  db.close();
});

test('si el archivo de la llave se reemplazó por uno dañado, la revisión dice cuál nombre tiene la llave buena: apartar y recuperar', () => {
  const { config, db, admin } = nuevaBase();
  const { secreto } = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin });
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  const huella = estadoLlave(config).huella;
  // Una edición a mano que escribe un archivo NUEVO con el mismo nombre (el viejo queda con su otro nombre).
  renameSync(ruta, join(carpeta, 'copia-vieja'));
  writeFileSync(ruta, 'esto no es una llave\n', { mode: 0o600 });
  assert.equal(estadoLlave(config).motivo, 'llave_danada');
  assert.match(diagnosticoLlave(config, { db }).join('\n'), /primero --claves=apartar-llave-danada y luego --claves=recuperar-llave/);
  assert.equal(recuperarLlave(config, { huellas: [huella] }).motivo, 'llave_danada', 'nunca pisa un archivo que existe');
  assert.equal(apartarLlaveDanada(config).apartada, true);
  assert.equal(recuperarLlave(config, { huellas: [huella] }).recuperada, true);
  assert.equal(leerSecreto(db, config, { id: secreto.id }), claveAnthropic());
  db.close();
});

test('dos que crean la llave a la vez: gana uno (link) y el otro lee la misma llave', () => {
  const { config, db } = nuevaBase();
  let segunda = null;
  const primera = asegurarLlave(config, { prueba: { trasCrearTemporal() { segunda = asegurarLlave(config); } } });
  assert.ok(segunda);
  assert.equal(primera.huella, segunda.huella);
  assert.equal(estadoLlave(config).huella, primera.huella);
  db.close();
});

test('la revisión por consola de la llave explica en palabras simples y nunca muestra la llave', () => {
  const { config, db, admin } = nuevaBase();
  assert.ok(diagnosticoLlave(config, { db }).some(l => l.includes('No existe todavía')));
  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin });
  const lineas = diagnosticoLlave(config, { db });
  const texto = lineas.join('\n');
  const contenido = readFileSync(rutaLlave(config), 'latin1').trim();
  const llave = leerLlave(config).llave;
  for (const forma of [contenido, contenido.slice(17), llave.toString('hex'), llave.toString('base64')]) assert.ok(!texto.includes(forma));
  assert.ok(!texto.includes(claveAnthropic()));
  assert.match(texto, /Permisos: 600/);
  assert.match(texto, /Claves guardadas: 1; con esta llave: 1/);
  db.close();
});

// ---------- 3. El cifrado ----------

test('cifrado: ida y vuelta; la misma clave dos veces se cifra distinto; el texto cifrado no contiene la clave', () => {
  const { config, db, admin } = nuevaBase();
  const valor = claveAnthropic('c');
  const a = guardarSecreto(db, config, { uso: 'ia_anthropic', valor, usuarioId: admin }).secreto;
  assert.equal(leerSecreto(db, config, { id: a.id }), valor);
  const b = guardarSecreto(db, config, { uso: 'ia_anthropic', valor, usuarioId: admin }).secreto;
  const [fa, fb] = [a.id, b.id].map(id => db.prepare('SELECT * FROM secretos WHERE id = ?').get(id));
  assert.notDeepEqual(Buffer.from(fa.iv), Buffer.from(fb.iv));
  assert.notDeepEqual(Buffer.from(fa.cifrado), Buffer.from(fb.cifrado));
  assert.equal(Buffer.from(fa.iv).length, 12);
  assert.equal(Buffer.from(fa.sello).length, 16);
  for (const f of [fa, fb]) {
    const bytes = Buffer.from(f.cifrado);
    for (const forma of [valor, Buffer.from(valor).toString('base64'), Buffer.from(valor).toString('base64url')]) assert.ok(!bytes.includes(Buffer.from(forma)));
  }
  db.close();
});

test('cifrado: un byte cambiado, partes cambiadas entre filas o una llave distinta: no se lee, y nada cambia en la base', () => {
  const { config, db, admin } = nuevaBase();
  const a = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('d'), usuarioId: admin }).secreto;
  const b = guardarSecreto(db, config, { uso: 'ia_openai', valor: claveOpenai('e'), usuarioId: admin }).secreto;
  const fila = id => db.prepare('SELECT * FROM secretos WHERE id = ?').get(id);
  const original = fila(a.id);
  const poner = (campos) => {
    const sets = Object.keys(campos).map(c => `${c} = ?`).join(', ');
    db.prepare(`UPDATE secretos SET ${sets} WHERE id = ?`).run(...Object.values(campos), a.id);
  };
  const volver = () => poner({ cifrado: original.cifrado, iv: original.iv, sello: original.sello, llave_huella: original.llave_huella });
  for (const campo of ['cifrado', 'sello', 'iv']) {
    const bytes = Buffer.from(original[campo]);
    bytes[0] ^= 1;
    poner({ [campo]: bytes });
    const antes = JSON.stringify(fila(a.id), (k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v));
    assert.equal(leerSecreto(db, config, { id: a.id }), null, `un byte cambiado en ${campo}`);
    assert.equal(JSON.stringify(fila(a.id), (k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v)), antes, 'leer no cambia la fila');
    volver();
  }
  // Las partes de otra fila (otra ref y otro uso en la AAD): no se abren aquí.
  const otra = fila(b.id);
  poner({ cifrado: otra.cifrado, iv: otra.iv, sello: otra.sello });
  assert.equal(leerSecreto(db, config, { id: a.id }), null);
  volver();
  // La misma fila copiada con otra ref (como si se copiara a otra fila): no se abre.
  db.prepare('UPDATE secretos SET ref = ? WHERE id = ?').run('otra-ref', a.id);
  assert.equal(leerSecreto(db, config, { id: a.id }), null);
  db.prepare('UPDATE secretos SET ref = ? WHERE id = ?').run(original.ref, a.id);
  poner({ llave_huella: '0000000000000000' });
  assert.equal(leerSecreto(db, config, { id: a.id }), null, 'huella de otra llave');
  assert.equal(listarSecretos(db, config).find(u => u.uso === 'ia_anthropic').activa.legible, false);
  volver();
  assert.equal(leerSecreto(db, config, { id: a.id }), claveAnthropic('d'));
  db.close();
});

// ---------- 4. Cambiar, desactivar, activar ----------

test('cambiar una clave deja la vieja «reemplazada»; activar una vieja desactiva la actual; todo queda en la auditoría', () => {
  const { config, db, admin } = nuevaBase();
  const contar = () => db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n;
  const activas = uso => db.prepare("SELECT id FROM secretos WHERE uso = ? AND estado = 'activa'").all(uso).map(f => f.id);
  const a = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('f'), usuarioId: admin }).secreto;
  const b = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('g'), usuarioId: admin }).secreto;
  assert.equal(contar(), 2);
  assert.deepEqual(activas('ia_anthropic'), [b.id]);
  assert.equal(db.prepare('SELECT estado FROM secretos WHERE id = ?').get(a.id).estado, 'reemplazada');
  assert.equal(db.prepare('SELECT reemplaza_a FROM secretos WHERE id = ?').get(b.id).reemplaza_a, a.id);
  // Activar la vieja: la actual queda desactivada.
  const r = activarSecreto(db, config, { id: a.id, usuarioId: admin });
  assert.equal(r.secreto.estado, 'activa');
  assert.deepEqual(activas('ia_anthropic'), [a.id]);
  assert.equal(db.prepare('SELECT estado FROM secretos WHERE id = ?').get(b.id).estado, 'desactivada');
  // Desactivar y volver a activar.
  assert.equal(desactivarSecreto(db, config, { id: a.id, usuarioId: admin }).secreto.estado, 'desactivada');
  assert.deepEqual(activas('ia_anthropic'), []);
  assert.equal(leerSecreto(db, config, { id: a.id }), null, 'una clave desactivada no se lee');
  activarSecreto(db, config, { id: a.id, usuarioId: admin });
  assert.equal(leerSecreto(db, config, { id: a.id }), claveAnthropic('f'));
  assert.equal(contar(), 2, 'nunca se borra ni se agrega una fila al cambiar el estado');
  // trasCambio corre dentro de la misma transacción y su resultado vuelve en «efecto».
  assert.deepEqual(desactivarSecreto(db, config, { id: a.id, usuarioId: admin, trasCambio: (_db, info) => ({ visto: info.uso }) }).efecto, { visto: 'ia_anthropic' });
  falla(() => activarSecreto(db, config, { id: 999, usuarioId: admin }), 'no_existe', 404);
  const acciones = db.prepare("SELECT accion, detalle FROM auditoria WHERE accion LIKE 'clave_%' ORDER BY id").all();
  assert.deepEqual(acciones.map(x => x.accion), ['clave_guardada', 'clave_guardada', 'clave_desactivada', 'clave_activada', 'clave_desactivada', 'clave_activada', 'clave_desactivada']);
  for (const x of acciones) assert.match(x.detalle, /…[a-z]{4}\b/, 'la auditoría solo tiene los últimos 4 caracteres');
  for (const f of db.prepare('SELECT DISTINCT estado, origen FROM secretos').all()) {
    assert.ok(ESTADOS_SECRETO.includes(f.estado));
    assert.ok(ORIGENES_SECRETO.includes(f.origen));
  }
  db.close();
});

test('dos procesos guardando claves a la vez: siempre queda UNA sola activa, y ninguna fila se pierde', async () => {
  const { config, db } = nuevaBase();
  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('h') });
  const ayuda = join(RAIZ, 'test', 'ayuda.js');
  const almacen = join(RAIZ, 'src', 'claves', 'almacen.js');
  const baseDb = join(RAIZ, 'src', 'nucleo', 'db.js');
  const codigo = `import ${JSON.stringify(ayuda)};
    const { guardarSecreto } = await import(${JSON.stringify(almacen)});
    const { conectarBase } = await import(${JSON.stringify(baseDb)});
    const config = { archivoBase: process.argv[1] };
    const db = conectarBase(config, { versionMinima: 5 });
    const letra = process.argv[2];
    for (let i = 0; i < 20; i++) guardarSecreto(db, config, { uso: 'ia_anthropic', valor: ['sk', 'ant', 'api03', 'carrera' + letra.repeat(30) + i].join('-') });
    db.close();`;
  const correr = letra => new Promise((listo, mal) => {
    const hijo = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', codigo, config.archivoBase, letra], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    hijo.stderr.on('data', d => { error += d; });
    hijo.on('exit', c => (c === 0 ? listo() : mal(new Error(`el hijo salió con ${c}: ${error.slice(0, 300)}`))));
  });
  await Promise.all([correr('m'), correr('n')]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 41);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM secretos WHERE estado = 'activa'").get().n, 1);
  // La cadena de reemplazos no tiene huecos: cada una reemplaza a la que estaba activa justo antes.
  const reemplazos = db.prepare('SELECT reemplaza_a FROM secretos WHERE reemplaza_a IS NOT NULL').all().map(f => f.reemplaza_a);
  assert.equal(new Set(reemplazos).size, 40);
  db.close();
});

// ---------- 5. Qué claves se aceptan ----------

test('validar: se quitan los espacios de alrededor; las claves raras, de administrador o de la suscripción nunca se guardan', () => {
  const { config, db, admin } = nuevaBase();
  const contar = () => db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n;
  assert.equal(validarValor('ia_anthropic', `  ${claveAnthropic()}\n`), claveAnthropic());
  const casos = [
    ['ia_anthropic', ['sk', 'ant', 'api03', 'con espacio dentro xxxxxxxx'].join('-'), 'clave_formato'],
    ['ia_anthropic', ['sk', 'ant', 'api03', 'eñe' + 'x'.repeat(30)].join('-'), 'clave_formato'],
    ['ia_anthropic', ['sk', 'ant', 'api03', 'x'].join('-'), 'clave_formato'],
    ['ia_anthropic', ['sk', 'ant', 'api03', 'x'.repeat(600)].join('-'), 'clave_formato'],
    ['ia_anthropic', ['sk', 'ant', 'admin01', 'x'.repeat(40)].join('-'), 'clave_admin'],
    ['ia_anthropic', ['sk', 'ant', 'oat01', 'x'.repeat(40)].join('-'), 'clave_suscripcion'],
    ['ia_anthropic', ['sk', 'ant', 'ort01', 'x'.repeat(40)].join('-'), 'clave_suscripcion'],
    ['ia_anthropic', ['sk', 'ant', 'x'.repeat(40)].join('-'), 'clave_formato'],
    ['ia_anthropic', claveOpenai(), 'clave_otro_proveedor'],
    ['ia_openai', claveAnthropic(), 'clave_otro_proveedor'],
    ['ia_openai', ['sk', 'admin', 'x'.repeat(40)].join('-'), 'clave_admin'],
    ['ia_openai', `pk-${'x'.repeat(40)}`, 'clave_formato'],
    ['ia_anthropic', 12345, 'clave_formato'],
    ['telegram_bot', claveAnthropic(), 'clave_formato'], // parte e: el uso existe, y una clave de Claude no tiene forma de token de bot
    ['no_existe', claveAnthropic(), 'uso_no_valido'],
  ];
  for (const [uso, valor, clave] of casos) {
    assert.throws(() => guardarSecreto(db, config, { uso, valor, usuarioId: admin }), e => {
      assert.equal(e.clave, clave, `${uso}: ${String(valor).slice(0, 20)}`);
      assert.equal(e.codigo, 400);
      assert.ok(!String(e.message).includes(String(valor)), 'el error nunca lleva la clave');
      return true;
    });
  }
  assert.equal(contar(), 0, 'no se guardó ninguna fila');
  assert.equal(existsSync(rutaLlave(config)), false, 'ni siquiera se creó la llave');
  db.close();
});

// ---------- Pausas y uso ----------

test('pausas: la del dueño no se pasa sola ni la quita una buena respuesta; la corta se alarga y se pasa a su hora', () => {
  const { config, db, admin } = nuevaBase();
  const s = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin }).secreto;
  const fila = () => db.prepare('SELECT * FROM secretos WHERE id = ?').get(s.id);
  const huella = estadoLlave(config).huella;
  assert.deepEqual(secretoUsable(fila(), T0, huella), { si: true, motivo: null });
  assert.deepEqual(secretoUsable(fila(), T0, null), { si: false, motivo: 'llave_no_disponible' });
  // Pausa corta: se pasa sola, y una más larga la alarga.
  pausarSecreto(db, { id: s.id, motivo: 'sobrecargado', hastaMs: T0 + 120_000, ahora: T0 });
  pausarSecreto(db, { id: s.id, motivo: 'error_proveedor', hastaMs: T0 + 60_000, ahora: T0 + 1000 });
  assert.equal(fila().pausa_hasta, new Date(T0 + 120_000).toISOString(), 'una pausa corta nunca se acorta');
  assert.equal(secretoUsable(fila(), T0 + 119_000, huella).motivo, 'proveedor_en_pausa');
  assert.equal(secretoUsable(fila(), T0 + 120_000, huella).si, true, 'se pasó sola');
  // Pausa del dueño: gana sobre la corta y no se pasa sola.
  pausarSecreto(db, { id: s.id, motivo: 'sin_credito', hastaMs: null, ahora: T0 });
  assert.equal(pausaVigente(fila(), T0 + 10 * 86_400_000).admin, true);
  assert.equal(pausarSecreto(db, { id: s.id, motivo: 'sobrecargado', hastaMs: T0 + 1, ahora: T0 }), false, 'una corta no reemplaza la del dueño');
  assert.equal(pausarSecreto(db, { id: s.id, motivo: 'clave_no_valida', hastaMs: null, ahora: T0 }), false, 'queda el primer motivo');
  assert.equal(fila().pausa_motivo, 'sin_credito');
  assert.equal(quitarPausaCorta(db, { id: s.id }), false, 'una buena respuesta no quita la pausa del dueño');
  assert.equal(reanudarSecreto(db, { id: s.id, usuarioId: admin }), true);
  assert.equal(fila().pausa_motivo, null);
  assert.ok(db.prepare("SELECT 1 FROM auditoria WHERE accion = 'clave_reanudada'").get());
  // Una prueba que dice «no válida» inutiliza la clave hasta probarla otra vez.
  anotarPrueba(db, { id: s.id, motivo: 'clave_no_valida', ahora: T0 });
  assert.equal(secretoUsable(fila(), T0, huella).motivo, 'clave_no_valida');
  anotarPrueba(db, { id: s.id, motivo: 'ok', ahora: T0 });
  assert.equal(secretoUsable(fila(), T0, huella).si, true);
  assert.throws(() => anotarPrueba(db, { id: s.id, motivo: 'inventado' }), /motivo no válido/);
  for (const f of db.prepare('SELECT DISTINCT prueba, pausa_motivo FROM secretos').all()) {
    for (const v of [f.prueba, f.pausa_motivo]) if (v != null) assert.ok(MOTIVOS.includes(v));
  }
  db.close();
});

// ---------- Nada de la clave fuera del texto cifrado ----------

test('la clave nunca queda en ninguna columna, en los archivos de la base, en la lista pública ni en la consola', () => {
  const { config, db, admin } = nuevaBase();
  const valores = [claveAnthropic('k'), claveOpenai('q')];
  const escrito = [];
  const originales = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const nombre of Object.keys(originales)) console[nombre] = (...partes) => { escrito.push(partes.join(' ')); };
  try {
    guardarSecreto(db, config, { uso: 'ia_anthropic', valor: valores[0], usuarioId: admin });
    guardarSecreto(db, config, { uso: 'ia_openai', valor: valores[1], usuarioId: admin });
    guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('j'), usuarioId: admin });
    const lista = JSON.stringify(listarSecretos(db, config));
    for (const v of valores) {
      assert.ok(!lista.includes(v));
      assert.ok(!lista.includes(v.slice(0, -4)), 'la lista solo lleva los últimos 4');
      assert.deepEqual(buscarEnTodo(db, config, v), [], `la clave aparece en: ${buscarEnTodo(db, config, v).join(', ')}`);
    }
    assert.ok(!/cifrado|sello|"iv"|ref|huella/.test(lista), 'la lista no lleva el texto cifrado ni la ref');
  } finally {
    Object.assign(console, originales);
  }
  for (const v of valores) assert.ok(!escrito.join('\n').includes(v));
  db.close();
});

test('cada motivo para no guardar una clave tiene su explicación en los dos idiomas', () => {
  const es = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'en.json'), 'utf8'));
  const motivos = new Set(['clave_formato', 'uso_no_valido', 'almacen_no_disponible']);
  for (const def of Object.values(USOS)) for (const [, motivo] of def.rechazar) motivos.add(motivo);
  for (const m of motivos) assert.ok(`error.${m}` in es && `error.${m}` in en, `falta error.${m}`);
});

// Ronda 2 de revisión: si falta el nombre final de la llave y YA hay claves guardadas, pegar otra clave creaba en
// silencio una llave nueva: las demás claves quedaban sin poder leerse para siempre y --claves=recuperar-llave ya no
// servía. Ahora el almacén dice 'llave_falta' (no listo) y guardar responde 503 sin crear nada.
test('falta el nombre final con claves guardadas: no listo (llave_falta), guardar responde 503 y la recuperación sigue sirviendo', () => {
  const { config, db, admin } = nuevaBase();
  assert.deepEqual(estadoAlmacen(db, config), { listo: true, motivo: 'llave_no_existe' }, 'antes de la primera clave es lo normal');
  const claude = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('a'), usuarioId: admin, ahora: T0 }).secreto;
  const chatgpt = guardarSecreto(db, config, { uso: 'ia_openai', valor: claveOpenai('b'), usuarioId: admin, ahora: T0 + 1 }).secreto;
  assert.deepEqual(estadoAlmacen(db, config), { listo: true, motivo: null });
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  const huella = estadoLlave(config).huella;
  renameSync(ruta, join(carpeta, 'movida-a-mano'));
  assert.equal(estadoLlave(config).motivo, 'llave_no_existe');
  assert.deepEqual(estadoAlmacen(db, config), { listo: false, motivo: 'llave_falta' }, 'la pantalla esconde el lugar para pegar');
  const antes = readdirSync(carpeta).sort();
  const filas = db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n;
  falla(() => guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('c'), usuarioId: admin, ahora: T0 + 2 }), 'almacen_no_disponible', 503);
  assert.deepEqual(readdirSync(carpeta).sort(), antes, 'no se creó ninguna llave nueva');
  assert.equal(existsSync(ruta), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, filas, 'no se guardó nada');
  assert.throws(() => asegurarLlave(config, { guardadas: { huellas: [huella], ultimaMs: T0 } }), e => e.clave === 'llave_falta');
  // La revisión ya no dice «No existe todavía», y sí cómo recuperarla.
  const texto = diagnosticoLlave(config, { db }).join('\n');
  assert.doesNotMatch(texto, /No existe todavía/);
  assert.match(texto, /FALTA el archivo de la llave, y ya hay claves guardadas/);
  assert.match(texto, /--claves=recuperar-llave/);
  assert.doesNotMatch(texto, /--claves=empezar-de-nuevo/, 'se puede recuperar: no se ofrece empezar de nuevo');
  assert.deepEqual(empezarLlaveNueva(config, clavesGuardadas(db)), { creada: false, motivo: 'recuperable', huella: null });
  // La recuperación sigue sirviendo, y las dos claves se leen otra vez.
  const r = recuperarLlave(config, { huellas: [huella] });
  assert.equal(r.recuperada, true);
  assert.equal(leerSecreto(db, config, { id: claude.id }), claveAnthropic('a'));
  assert.equal(leerSecreto(db, config, { id: chatgpt.id }), claveOpenai('b'));
  assert.deepEqual(estadoAlmacen(db, config), { listo: true, motivo: null });
  db.close();
});

test('falta la llave y no queda ningún otro nombre con ella: solo la consola empieza de nuevo (y después de apartar una dañada, la próxima clave)', () => {
  const { config, db, admin } = nuevaBase();
  guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('a'), usuarioId: admin, ahora: T0 });
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  const huellaVieja = estadoLlave(config).huella;
  // Se pierden los DOS nombres (el final y el .nueva-…): ya no se puede recuperar.
  renameSync(ruta, join(carpeta, 'movida-1'));
  for (const n of readdirSync(carpeta).filter(x => x.startsWith('oportia-llave-secretos.nueva-'))) renameSync(join(carpeta, n), join(carpeta, `movida-${n.length}`));
  assert.deepEqual(estadoAlmacen(db, config), { listo: false, motivo: 'llave_falta' });
  falla(() => guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('b'), usuarioId: admin, ahora: T0 + 1000 }), 'almacen_no_disponible', 503);
  assert.match(diagnosticoLlave(config, { db }).join('\n'), /--claves=empezar-de-nuevo crea una llave nueva/);
  // La consola decide empezar de nuevo: una llave nueva; la clave vieja queda guardada sin poder leerse.
  const r = empezarLlaveNueva(config, clavesGuardadas(db));
  assert.equal(r.creada, true);
  assert.notEqual(r.huella, huellaVieja);
  assert.deepEqual(empezarLlaveNueva(config, clavesGuardadas(db)).motivo, 'llave_sana', 'una sola vez');
  const nueva = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('c'), usuarioId: admin, ahora: T0 + 2000 });
  assert.equal(nueva.secreto.legible, true);
  assert.equal(listarSecretos(db, config).find(u => u.uso === 'ia_anthropic').anteriores[0].legible, false);
  db.close();
  // Después de apartar una llave dañada (eso ya es decidir empezar de nuevo), la próxima clave pegada crea otra.
  const otra = nuevaBase();
  guardarSecreto(otra.db, otra.config, { uso: 'ia_anthropic', valor: claveAnthropic('d'), usuarioId: otra.admin, ahora: T0 });
  writeFileSync(rutaLlave(otra.config), 'roto');
  assert.equal(apartarLlaveDanada(otra.config, { ahora: T0 + 5000 }).apartada, true);
  assert.deepEqual(estadoAlmacen(otra.db, otra.config), { listo: true, motivo: 'llave_no_existe' });
  assert.match(diagnosticoLlave(otra.config, { db: otra.db }).join('\n'), /la llave dañada se apartó y la próxima clave que pegues/);
  assert.equal(guardarSecreto(otra.db, otra.config, { uso: 'ia_anthropic', valor: claveAnthropic('e'), usuarioId: otra.admin, ahora: T0 + 6000 }).secreto.legible, true);
  // …pero si DESPUÉS de esa llave nueva se pierde su nombre, no se vuelve a crear otra en silencio.
  renameSync(rutaLlave(otra.config), join(dirname(rutaLlave(otra.config)), 'movida-2'));
  assert.deepEqual(estadoAlmacen(otra.db, otra.config), { listo: false, motivo: 'llave_falta' });
  falla(() => guardarSecreto(otra.db, otra.config, { uso: 'ia_anthropic', valor: claveAnthropic('f'), usuarioId: otra.admin, ahora: T0 + 7000 }), 'almacen_no_disponible', 503);
  otra.db.close();
});

test('la llave nunca queda en la memoria del proceso: solo su huella (y lo leído para cifrar o descifrar se borra al terminar)', () => {
  const { config, db, admin } = nuevaBase();
  const { secreto } = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic('m'), usuarioId: admin, ahora: T0 });
  const una = leerLlave(config);
  const otra = leerLlave(config);
  assert.notEqual(una.llave, otra.llave, 'cada lectura es una copia nueva');
  assert.ok(una.llave.equals(otra.llave));
  una.llave.fill(0);
  assert.equal(leerSecreto(db, config, { id: secreto.id }), claveAnthropic('m'), 'borrar una copia no cambia la llave');
  assert.equal(estadoLlave(config).huella, otra.huella);
  const fuente = readFileSync(join(RAIZ, 'src', 'claves', 'cifrado.js'), 'utf8');
  assert.match(fuente, /huellasLeidas\.set\(ruta, \{ firma: firma\(info\), huella \}\)/, 'lo que se guarda es solo la huella');
  assert.doesNotMatch(fuente, /\.set\(ruta, \{[^}]*llave[^}]*\}\)/);
  const almacen = readFileSync(join(RAIZ, 'src', 'claves', 'almacen.js'), 'utf8');
  assert.equal((almacen.match(/llave\.llave\.fill\(0\)/g) || []).length, 4, 'guardar y leer (una clave, o un dato envuelto de las copias) borran la llave al terminar');
  db.close();
});
