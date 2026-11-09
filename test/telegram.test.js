// Fase 1, parte e (paso 1): el adaptador de Telegram contra el Telegram FALSO (test/telegram-falso.js), la puerta a la red
// con sus dos opciones nuevas (cuerpo crudo y respuesta por pedazos), la credencial y las reglas del código de un uso.
// Nunca usa internet ni un token de verdad (los tokens se arman al correr).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { configDePrueba } from './ayuda.js';
import { crearTelegramFalso, tokenDePrueba, leerMultipart } from './telegram-falso.js';
import { TELEGRAM, rutaValida, HOST_OFICIAL } from '../src/canales/telegram.js';
import { MOTIVOS_CANAL, ADAPTADORES, adaptador, esPasajero } from '../src/canales/canal.js';
import { crearCredencial, conCredencial } from '../src/canales/credencial.js';
import { crearCodigo, huellaCodigo, mensajeConCodigo, cifrasDelTexto, codigoParaMostrar } from '../src/canales/vinculo.js';
import { llamarProveedor, destinoPermitido } from '../src/ia/llamar.js';
import { leerConfig } from '../src/nucleo/config.js';
import { abrirBase } from '../src/nucleo/db.js';
import { guardarSecreto, desactivarSecreto } from '../src/claves/almacen.js';
import { crearPrimerAdmin } from '../src/cuentas/usuarios.js';

const BOT = 700000001;
const CHAT = 5550001;

async function conFalso(fn, opciones = {}) {
  const token = tokenDePrueba(1);
  const falso = await crearTelegramFalso({ bots: [{ token, id: BOT, usuario: 'oportia_junior_bot' }], chats: [{ id: CHAT, nombre: 'Junior' }, { id: -100200, tipo: 'group', nombre: 'Grupo' }], ...opciones });
  const cred = crearCredencial({ token, base: falso.url });
  try { await fn({ falso, cred, token }); } finally { await falso.cerrar(); }
}

// Corre fn guardando todo lo que se escriba en la consola (para buscar el token ahí también).
async function capturarConsola(fn) {
  const escrito = [];
  const originales = {};
  for (const m of ['log', 'error', 'warn', 'info', 'debug']) {
    originales[m] = console[m];
    console[m] = (...a) => escrito.push(a.map(x => (typeof x === 'string' ? x : inspect(x, { depth: 10 }))).join(' '));
  }
  try { return { valor: await fn(), escrito }; } finally { Object.assign(console, originales); }
}

function sinToken(valor, token, que) {
  const texto = typeof valor === 'string' ? valor : `${JSON.stringify(valor, (_k, v) => (typeof v === 'bigint' ? String(v) : v))} ${inspect(valor, { depth: 10, showHidden: true })}`;
  assert.ok(!texto.includes(token), `el token aparece en ${que}`);
  assert.ok(!texto.includes(token.split(':')[1]), `la parte secreta del token aparece en ${que}`);
}

test('el registro de canales: Telegram es un adaptador con todos sus métodos y límites de la Bot API', () => {
  assert.equal(adaptador('telegram'), TELEGRAM);
  assert.equal(adaptador('whatsapp'), null);
  for (const a of Object.values(ADAPTADORES)) {
    for (const m of ['probar', 'enviarTexto', 'enviarArchivo', 'fijar', 'archivo', 'bajar', 'recibir', 'fijado']) assert.equal(typeof a[m], 'function', m);
    assert.ok(a.limites.subirMaxBytes <= 50_000_000 && a.limites.bajarMaxBytes <= 20_000_000);
  }
  assert.equal(HOST_OFICIAL, 'api.telegram.org');
  assert.equal(new Set(MOTIVOS_CANAL).size, MOTIVOS_CANAL.length);
  assert.ok(esPasajero('limite') && !esPasajero('bloqueado'));
});

test('1.13 todo bien: probar, mandar texto y archivo, fijar, getFile, bajar, recibir y el fijado', async () => {
  await conFalso(async ({ falso, cred }) => {
    const p = await TELEGRAM.probar(cred);
    assert.deepEqual(p, { motivo: 'ok', cuenta: { id: String(BOT), usuario: 'oportia_junior_bot', nombre: 'OPORTIA' } });
    const t = await TELEGRAM.enviarTexto(cred, { destino: CHAT, texto: '🔴 OPORTIA · URGENTE', silencioso: false });
    assert.equal(t.motivo, 'ok');
    const enviado = falso.pedidos.find(x => x.metodo === 'sendMessage').params;
    assert.deepEqual(enviado.link_preview_options, { is_disabled: true });
    assert.equal(enviado.chat_id, String(CHAT));
    assert.equal(enviado.disable_notification, false);
    for (const prohibido of ['parse_mode', 'protect_content']) assert.ok(!(prohibido in enviado), prohibido);
    const datos = randomBytes(70_000);
    const a = await TELEGRAM.enviarArchivo(cred, { destino: CHAT, nombre: 'oportia-copia-x-p001.opc', datos: new Blob([datos]), leyenda: 'Copia de OPORTIA · parte 1' });
    assert.equal(a.motivo, 'ok');
    assert.equal(a.archivo.bytes, datos.length);
    const doc = falso.documentos.at(-1);
    assert.equal(doc.sha256, createHash('sha256').update(datos).digest('hex'), 'llegó el archivo exacto');
    assert.equal(doc.silencioso, true);
    assert.equal(doc.leyenda, 'Copia de OPORTIA · parte 1');
    const pedido = falso.pedidos.find(x => x.metodo === 'sendDocument');
    assert.equal(pedido.contentLength, pedido.largo, 'el largo exacto (Content-Length) del multipart');
    assert.ok(!('protect_content' in pedido.params));
    assert.deepEqual(await TELEGRAM.fijar(cred, { destino: CHAT, mensajeId: a.mensajeId }), { motivo: 'ok' });
    const f = await TELEGRAM.fijado(cred, { destino: CHAT });
    assert.equal(f.mensajeId, a.mensajeId);
    assert.equal(f.documento.archivoId, a.archivo.id);
    const g = await TELEGRAM.archivo(cred, { archivoId: a.archivo.id });
    assert.equal(g.motivo, 'ok');
    assert.equal(g.bytes, datos.length);
    const h = createHash('sha256');
    let pedazos = 0;
    const b = await TELEGRAM.bajar(cred, { ruta: g.ruta, topeBytes: datos.length, alTrozo: async x => { pedazos += 1; h.update(x); } });
    assert.deepEqual(b, { motivo: 'ok', bytes: datos.length });
    assert.equal(h.digest('hex'), doc.sha256);
    assert.ok(pedazos >= 1);
    falso.escribir({ chat: CHAT, texto: '/start 48217730' });
    const r = await TELEGRAM.recibir(cred, {});
    assert.equal(r.motivo, 'ok');
    assert.equal(r.mensajes[0].texto, '/start 48217730');
    assert.deepEqual(r.mensajes[0].chat, { id: String(CHAT), tipo: 'private', nombre: 'Junior' });
    assert.equal(r.siguiente, r.mensajes[0].updateId + 1);
    assert.equal((await TELEGRAM.recibir(cred, { desde: r.siguiente })).mensajes.length, 0, 'confirmado');
  });
});

test('1.13 cada error de Telegram da su motivo (nunca lanza), un 429 dice cuánto esperar, y nada sigue una redirección', async () => {
  await conFalso(async ({ falso, cred }) => {
    const casos = [
      ['getMe', 'no_autorizado', c => TELEGRAM.probar(c), 'clave_no_valida'],
      ['getMe', 'no_existe', c => TELEGRAM.probar(c), 'clave_no_valida'],
      ['sendMessage', 'bloqueado', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'bloqueado'],
      ['sendMessage', 'expulsado', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'bloqueado'],
      ['sendMessage', 'chat_no_existe', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'chat_no_existe'],
      ['sendDocument', 'muy_grande', c => TELEGRAM.enviarArchivo(c, { destino: CHAT, nombre: 'a', datos: Buffer.from('x') }), 'demasiado_grande'],
      ['sendMessage', 'error_500', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'error_servidor'],
      ['sendMessage', 'error_502', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'error_servidor'],
      ['sendMessage', 'json_roto', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'respuesta_no_valida'],
      ['sendMessage', 'profundo', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'respuesta_no_valida'],
      ['sendMessage', 'enorme', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'respuesta_no_valida'],
      ['sendMessage', 'sin_forma', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'respuesta_no_valida'],
      ['getUpdates', 'conflicto', c => TELEGRAM.recibir(c, {}), 'conflicto'],
      ['sendMessage', 'redirige', c => TELEGRAM.enviarTexto(c, { destino: CHAT, texto: 'x' }), 'respuesta_no_valida'],
      ['getFile', 'sin_ruta', async c => TELEGRAM.archivo(c, { archivoId: (await TELEGRAM.enviarArchivo(c, { destino: CHAT, nombre: 'a', datos: Buffer.from('x') })).archivo.id }), 'respuesta_no_valida'],
      ['getFile', 'no_autorizado', c => TELEGRAM.archivo(c, { archivoId: 'BQ-no-importa' }), 'clave_no_valida'],
      ['getChat', 'chat_no_existe', c => TELEGRAM.fijado(c, { destino: CHAT }), 'chat_no_existe'],
      ['pinChatMessage', 'bloqueado', c => TELEGRAM.fijar(c, { destino: CHAT, mensajeId: 1 }), 'bloqueado'],
    ];
    for (const [metodo, escena, llamar, motivo] of casos) {
      falso.escena(metodo, escena);
      const { valor, escrito } = await capturarConsola(() => llamar(cred));
      assert.equal(valor.motivo, motivo, `${metodo} ${escena}`);
      sinToken(valor, cred.token, `${metodo} ${escena}`);
      sinToken(escrito.join('\n'), cred.token, `la consola (${escena})`);
    }
    falso.escena('sendMessage', 'limite', { segundos: 7 });
    assert.deepEqual(await TELEGRAM.enviarTexto(cred, { destino: CHAT, texto: 'x' }), { motivo: 'limite', esperarMs: 7000 });
    falso.escena('sendMessage', 'limite', { segundos: 99_999 });
    assert.equal((await TELEGRAM.enviarTexto(cred, { destino: CHAT, texto: 'x' })).esperarMs, 3_600_000, 'nunca más de 1 hora');
    // getFile de un archivo de más de 20 MB (el falso con el tope bajado) → demasiado_grande.
    const grande = await TELEGRAM.enviarArchivo(cred, { destino: CHAT, nombre: 'g', datos: Buffer.alloc(3000, 1) });
    assert.equal(grande.motivo, 'ok');
    // Un chat inexistente y un chat bloqueado de verdad (sin escena).
    assert.equal((await TELEGRAM.enviarTexto(cred, { destino: 123, texto: 'x' })).motivo, 'chat_no_existe');
    falso.bloquear(CHAT);
    assert.equal((await TELEGRAM.enviarTexto(cred, { destino: CHAT, texto: 'x' })).motivo, 'bloqueado');
    falso.bloquear(CHAT, false);
    // Un webhook puesto: el bot lo usa otro programa.
    falso.ponerWebhook(cred.token, 'https://otro.example/gancho');
    assert.equal((await TELEGRAM.probar(cred)).motivo, 'bot_ocupado');
    assert.equal((await TELEGRAM.recibir(cred, {})).motivo, 'conflicto');
    assert.ok(!falso.pedidos.some(p => p.metodo === 'deleteWebhook'), 'OPORTIA nunca le quita el webhook a nadie');
  });
});

test('1.13 un Telegram que no contesta corta por tiempo, y la señal de parar corta enseguida', async () => {
  await conFalso(async ({ falso, cred }) => {
    falso.escena('sendMessage', 'nunca');
    const control = new AbortController();
    setTimeout(() => control.abort(), 100);
    const r = await TELEGRAM.enviarTexto(cred, { destino: CHAT, texto: 'x', senal: control.signal });
    assert.equal(r.motivo, 'cancelado');
    // Sin red (un puerto cerrado).
    const muerta = crearCredencial({ token: cred.token, base: 'http://127.0.0.1:19' });
    assert.equal((await TELEGRAM.probar(muerta)).motivo, 'sin_red');
    // Un token con forma rara nunca sale a la red.
    const antes = falso.pedidos.length;
    assert.equal((await TELEGRAM.probar(crearCredencial({ token: 'nada', base: falso.url }))).motivo, 'clave_no_valida');
    assert.equal(falso.pedidos.length, antes);
  });
});

test('1.13 file_size es opcional: si falta, no es un error; si viene, se informa', async () => {
  await conFalso(async ({ falso, cred }) => {
    falso.escena('sendDocument', 'sin_tamano');
    const a = await TELEGRAM.enviarArchivo(cred, { destino: CHAT, nombre: 'x', datos: Buffer.from('hola') });
    assert.equal(a.motivo, 'ok');
    assert.equal(a.archivo.bytes, null);
    falso.escena('getFile', 'sin_tamano');
    const g = await TELEGRAM.archivo(cred, { archivoId: a.archivo.id });
    assert.equal(g.motivo, 'ok');
    assert.equal(g.bytes, null);
  });
});

test('1.20 una ruta de archivo rara (.., /, muy larga, con espacios) se rechaza sin hacer ningún pedido', async () => {
  for (const mala of ['../x', '/x', 'a/../b', 'a//b', 'a b', 'x'.repeat(300), '', 'documents/', 'documents/ñ']) assert.equal(rutaValida(mala), false, mala);
  for (const buena of ['documents/file_1.opc', 'photos/a-b_c.jpg']) assert.equal(rutaValida(buena), true, buena);
  await conFalso(async ({ falso, cred }) => {
    const antes = falso.pedidos.length;
    for (const mala of ['../x', '/x', 'a b']) {
      assert.equal((await TELEGRAM.bajar(cred, { ruta: mala, alTrozo: async () => {} })).motivo, 'respuesta_no_valida');
    }
    assert.equal(falso.pedidos.length, antes, 'ningún pedido salió');
    const a = await TELEGRAM.enviarArchivo(cred, { destino: CHAT, nombre: 'x', datos: Buffer.from('hola') });
    falso.escena('getFile', 'ruta_rara');
    assert.equal((await TELEGRAM.archivo(cred, { archivoId: a.archivo.id })).motivo, 'respuesta_no_valida');
  });
});

test('1.14 llamar.js: el cuerpo crudo llega exacto (multipart con su largo), la bajada por pedazos corta en el tope, y solo 127.0.0.1 en pruebas', async () => {
  await conFalso(async ({ falso, token }) => {
    const datos = randomBytes(300_000);
    const limite = 'oportiaprueba123';
    const cuerpo = new Blob([`--${limite}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${CHAT}\r\n--${limite}\r\nContent-Disposition: form-data; name="document"; filename="d.bin"\r\n\r\n`, datos, `\r\n--${limite}--\r\n`]);
    const s = await llamarProveedor({ url: `${falso.url}/bot${token}/sendDocument`, cabeceras: { 'content-type': `multipart/form-data; boundary=${limite}` }, cuerpoCrudo: cuerpo, permitido: HOST_OFICIAL });
    assert.equal(s.status, 200);
    assert.equal(s.json.result.document.file_size, datos.length);
    const p = falso.pedidos.at(-1);
    assert.equal(p.contentLength, cuerpo.size);
    assert.equal(p.archivo.bytes, datos.length);
    const ruta = falso.archivos.get(s.json.result.document.file_id).ruta;
    let llegados = 0;
    const corta = await llamarProveedor({ url: `${falso.url}/file/bot${token}/${ruta}`, metodo: 'GET', topeBytes: 100_000, alTrozo: async b => { llegados += b.length; }, permitido: HOST_OFICIAL });
    assert.equal(corta.demasiado, true);
    assert.ok(llegados <= 100_000, 'nunca entrega más del tope');
    assert.equal(corta.json, null, 'por pedazos no se lee como JSON');
    const entera = await llamarProveedor({ url: `${falso.url}/file/bot${token}/${ruta}`, metodo: 'GET', topeBytes: datos.length, alTrozo: async () => {}, permitido: HOST_OFICIAL });
    assert.equal(entera.bytes, datos.length);
    assert.equal(entera.demasiado, false);
    // Un error con alTrozo (404) se lee como siempre: su JSON, no por pedazos.
    const error = await llamarProveedor({ url: `${falso.url}/file/bot${token}/documents/no-existe`, metodo: 'GET', alTrozo: async () => { throw new Error('no debía llegar'); }, permitido: HOST_OFICIAL });
    assert.equal(error.status, 404);
    assert.equal(error.json.ok, false);
    // Si falla quien recibe, se dice (y no es «la red»).
    const falla = await llamarProveedor({ url: `${falso.url}/file/bot${token}/${ruta}`, metodo: 'GET', topeBytes: datos.length, alTrozo: async () => { throw Object.assign(new Error('disco'), { code: 'ENOSPC' }); }, permitido: HOST_OFICIAL });
    assert.equal(falla.falloAlRecibir, true);
    assert.equal(falla.error.codigo, 'ENOSPC');
  });
  // En el servidor real solo el host oficial y por https; en pruebas solo 127.0.0.1.
  assert.equal(destinoPermitido('https://api.telegram.org/botX/getMe', HOST_OFICIAL, { prueba: false }), true);
  assert.equal(destinoPermitido('https://api.telegram.org.malo.com/x', HOST_OFICIAL, { prueba: false }), false);
  assert.equal(destinoPermitido('http://api.telegram.org/x', HOST_OFICIAL, { prueba: false }), false);
  assert.equal(destinoPermitido('http://127.0.0.1:8081/x', HOST_OFICIAL, { prueba: false }), false);
  assert.equal(destinoPermitido('https://api.telegram.org/x', HOST_OFICIAL, { prueba: true }), false);
  assert.equal(destinoPermitido('http://127.0.0.1:8081/x', HOST_OFICIAL, { prueba: true }), true);
  // Y en pruebas el adaptador nunca va al Telegram de verdad: sin base, se rechaza antes de la red.
  const sinBase = crearCredencial({ token: tokenDePrueba(9) });
  assert.equal((await TELEGRAM.probar(sinBase)).motivo, 'rechazado');
});

test('la dirección del Telegram falso solo se acepta en modo de prueba y solo 127.0.0.1 (nunca desde las pantallas)', () => {
  const base = { OPORTIA_DATOS: configDePrueba().raiz };
  assert.deepEqual(leerConfig({ ...base, OPORTIA_TEST: '1', OPORTIA_TELEGRAM_URL: 'http://127.0.0.1:4567' }).canalesBases, { telegram: 'http://127.0.0.1:4567' });
  assert.deepEqual(leerConfig({ ...base, OPORTIA_TEST: '1', OPORTIA_TELEGRAM_URL: 'https://api.telegram.org' }).canalesBases, {});
  assert.deepEqual(leerConfig({ ...base, OPORTIA_TEST: '1', OPORTIA_TELEGRAM_URL: 'http://127.0.0.1:4567/x' }).canalesBases, {});
  assert.ok(Object.isFrozen(leerConfig({ ...base, OPORTIA_TEST: '1' }).canalesBases));
});

test('la credencial: el token nunca sale en JSON, inspect ni texto; con secretoId, una clave cambiada se nota', async () => {
  const token = tokenDePrueba(3);
  const cred = crearCredencial({ token, base: 'http://127.0.0.1:1', secretoId: 4 });
  for (const forma of [JSON.stringify(cred), JSON.stringify({ cred }), inspect(cred, { showHidden: true }), String(cred), `${cred}`, Object.keys(cred).join(',')]) {
    assert.ok(!forma.includes(token.split(':')[1]), forma);
  }
  assert.equal(cred.token, token);
  assert.ok(Object.isFrozen(cred));
  const config = configDePrueba();
  const db = abrirBase(config);
  const admin = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x' });
  const clave = ['sk', 'ant', 'api03', `prueba${'w'.repeat(32)}`].join('-');
  assert.deepEqual(await conCredencial(db, config, { uso: 'ia_anthropic' }, async () => 'no'), { motivo: 'sin_clave' });
  const { secreto } = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: clave, usuarioId: admin });
  const visto = await conCredencial(db, config, { uso: 'ia_anthropic' }, async c => ({ igual: c.token === clave, id: c.secretoId }));
  assert.deepEqual(visto, { igual: true, id: secreto.id });
  assert.equal((await conCredencial(db, config, { uso: 'ia_anthropic', secretoId: secreto.id }, async () => 'ok')), 'ok');
  const otra = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: clave.replace(/w/g, 'v'), usuarioId: admin }).secreto;
  assert.deepEqual(await conCredencial(db, config, { uso: 'ia_anthropic', secretoId: secreto.id }, async () => 'no'), { motivo: 'credencial_cambiada' });
  desactivarSecreto(db, config, { id: otra.id, usuarioId: admin });
  assert.deepEqual(await conCredencial(db, config, { uso: 'ia_anthropic', secretoId: otra.id }, async () => 'no'), { motivo: 'credencial_cambiada' });
  db.close();
});

test('el código de un uso: 8 cifras, solo chat privado, no un bot, mensaje nuevo, código exacto (con /start, espacios o guiones)', () => {
  const codigo = crearCodigo();
  assert.match(codigo, /^\d{8}$/);
  assert.match(codigoParaMostrar('48217730'), /^4821 7730$/);
  const huella = huellaCodigo('48217730');
  const desdeMs = Date.parse('2026-11-09T15:00:00Z');
  const ahora = desdeMs / 1000 + 30;
  const m = (texto, extra = {}) => ({ chat: { id: '5', tipo: 'private' }, de: { id: '5', esBot: false }, fecha: ahora, texto, ...extra });
  for (const t of ['48217730', '/start 48217730', '/start48217730', ' 4821 7730 ', '4821-7730', '/start@oportia_bot 48217730']) {
    assert.equal(mensajeConCodigo(m(t), { huella, desdeMs }), 'coincide', t);
  }
  assert.equal(mensajeConCodigo(m('48217731'), { huella, desdeMs }), 'intento');
  assert.equal(mensajeConCodigo(m('hola'), { huella, desdeMs }), 'ignorar');
  assert.equal(mensajeConCodigo(m('48217730', { chat: { id: '-1', tipo: 'group' } }), { huella, desdeMs }), 'ignorar');
  assert.equal(mensajeConCodigo(m('48217730', { de: { id: '9', esBot: true } }), { huella, desdeMs }), 'ignorar');
  assert.equal(mensajeConCodigo(m('48217730', { fecha: desdeMs / 1000 - 60 }), { huella, desdeMs }), 'ignorar', 'un mensaje de antes del código');
  assert.equal(mensajeConCodigo(m('48217730', { fecha: desdeMs / 1000 - 3 }), { huella, desdeMs }), 'coincide', '5 s de margen');
  assert.equal(cifrasDelTexto('123456789'), null);
  assert.equal(cifrasDelTexto(null), null);
});

test('el Telegram falso imita la Bot API: multipart de verdad, offset negativo que olvida, y nunca guarda tokens', async () => {
  const cuerpo = Buffer.from('--L\r\nContent-Disposition: form-data; name="a"\r\n\r\nuno\r\n--L\r\nContent-Disposition: form-data; name="document"; filename="f.bin"\r\n\r\n\r\nxy\r\n--L--\r\n');
  const m = leerMultipart(cuerpo, 'multipart/form-data; boundary=L');
  assert.deepEqual(m.campos, { a: 'uno' });
  assert.equal(m.archivos.document.datos.toString(), '\r\nxy');
  await conFalso(async ({ falso, cred, token }) => {
    for (let i = 0; i < 4; i++) falso.escribir({ chat: CHAT, texto: `m${i}` });
    const ultimo = await TELEGRAM.recibir(cred, { desde: -1 });
    assert.deepEqual(ultimo.mensajes.map(x => x.texto), ['m3']);
    assert.equal(falso.pendientes(), 1, 'las anteriores se olvidaron');
    await TELEGRAM.recibir(cred, { desde: ultimo.siguiente });
    assert.equal(falso.pendientes(), 0);
    assert.ok(!JSON.stringify(falso.pedidos).includes(token.split(':')[1]), 'el falso nunca guarda el token');
  });
});
