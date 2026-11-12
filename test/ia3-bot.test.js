// 0.12.8 (pedido del dueño): el bot del dueño, siempre con el Telegram FALSO (nunca uno de verdad).
//  - los comandos SOLO del chat unido del dueño (un extraño o un grupo: nunca se les contesta), sin leer nada mientras se
//    une un chat, sin contestar mensajes viejos, con un cursor que vence;
//  - al firmar, el documento firmado (con la firma adentro) llega como archivo «contrato-<usuario>-v<versión>-<fecha>.html»;
//  - los mensajes en HTML: el título en negrita con su emoji y TODO lo demás escapado; uno demasiado largo va plano;
//  - «Enviar a mi Telegram» con su espera de 3 s, y «Probar el bot».
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { deflateSync, crc32 } from 'node:zlib';
import { montar, CHAT, EXTRANO, GRUPO, MINUTO, HORA } from './copias-tarea-base.js';
import { leerHtmlTelegram } from './telegram-falso.js';
import { crearBot, marcarContratoPorMandar, esDelDueno, CLAVE_CURSOR } from '../src/canales/bot.js';
import { leerComando, textoAyuda, COMANDOS } from '../src/canales/comandos.js';
import { crearAvisador } from '../src/canales/avisador.js';
import { comoHtml, escaparHtml, textoDeAviso } from '../src/canales/textos.js';
import { empezarVinculo } from '../src/canales/canales.js';
import { CLASES_ENVIO, RESULTADOS_ENVIO } from '../src/canales/canal.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { aceptarTerminos } from '../src/cuentas/terminos.js';
import { nombreArchivoContrato } from '../src/cuentas/contrato-archivo.js';
import { abrirAviso } from '../src/avisos/avisos.js';
import { registrarRutasIaAlumnos } from '../src/api/ia-alumnos.js';

function png(ancho = 120, alto = 50) {
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([largo, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  const filas = [];
  for (let y = 0; y < alto; y++) filas.push(Buffer.from([0]), Buffer.alloc(ancho * 4, y % 7 ? 0 : 255));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}
const FIRMA = `data:image/png;base64,${png().toString('base64')}`;

async function conBot(fn) {
  const b = await montar({ relleno: 0, clave: false });
  b.bot = crearBot({ db: b.db, config: b.config, reloj: b.reloj, topes: { pausaArchivosMs: 0 } });
  b.delChat = (chat = CHAT) => b.falso.mensajes.filter(m => m.chatId === String(chat) && m.de?.esBot !== false && (m.text || m.document) && !String(m.text ?? '').startsWith('✅ Listo') && !String(m.text ?? '').startsWith('🔐'));
  b.alumno = (nombre, visible = null) => {
    const id = crearUsuario(b.db, { nombre, claveHash: 'x', debeCambiarClave: false, creadoPor: b.admin });
    if (visible) b.db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run(visible, id);
    return id;
  };
  b.firmar = (id, nombre = 'Ana', apellido = 'Pérez') => aceptarTerminos(b.db, id, { version: 2, versionPrivacidad: 2, nombre, apellido, nacimiento: '2000-05-10', acepto: true, aceptoPrivacidad: true, aceptoIa: true, firma: FIRMA }, { config: b.config });
  try { await fn(b); } finally { await b.bot.parar(); await b.cerrar(); }
}
const pedidosDe = (b, metodo) => b.falso.pedidos.filter(p => p.metodo === metodo).length;

test('los comandos: cómo se leen, la ayuda tiene los 6 y los textos para BotFather existen', () => {
  assert.deepEqual(leerComando('/alumno@oportia_junior_bot  juan '), { comando: 'alumno', arg: 'juan' });
  assert.deepEqual(leerComando('/firmas todos'), { comando: 'contratos', arg: 'todos' });
  assert.deepEqual(leerComando('/RESUMEN'), { comando: 'resumen', arg: '' });
  assert.equal(leerComando('/borrar_todo').comando, 'desconocido');
  assert.equal(leerComando('hola'), null);
  assert.deepEqual(COMANDOS, ['resumen', 'gastos', 'pagos', 'alumno', 'contratos', 'ayuda']);
  const ayuda = textoAyuda('es');
  assert.ok(leerHtmlTelegram(ayuda), 'HTML válido para Telegram');
  for (const c of COMANDOS) assert.match(ayuda, new RegExp(`/${c}`));
  assert.ok(CLASES_ENVIO.includes('comando') && CLASES_ENVIO.includes('contrato'));
});

test('solo el chat unido del dueño: un extraño, un grupo o un bot nunca reciben respuesta; el dueño sí, en HTML', async () => {
  await conBot(async b => {
    b.alumno('ana');
    b.falso.escribir({ chat: EXTRANO, texto: '/resumen' });
    b.falso.escribir({ chat: GRUPO, texto: '/pagos' });
    b.falso.escribir({ chat: CHAT, texto: 'hola, ¿qué tal?' });
    let r = await b.bot.pasada();
    assert.equal(r.contestados, 0);
    assert.equal(b.delChat(EXTRANO).length, 0, 'al extraño nunca se le contesta');
    assert.equal(b.delChat(GRUPO).length, 0, 'al grupo tampoco');
    assert.equal(b.delChat().length, 0, 'un mensaje que no es comando no se contesta');
    b.falso.escribir({ chat: CHAT, texto: '/resumen' });
    r = await b.bot.pasada();
    assert.equal(r.contestados, 1);
    const m = b.delChat().at(-1);
    assert.equal(m.params.parse_mode, 'HTML');
    assert.match(m.params.text, /^<b>📊 Resumen de hoy<\/b>\n/);
    assert.match(m.text, /Estudiaron hoy: 0 de 1 alumnos/);
    // El mismo comando no se contesta dos veces (el cursor avanzó), y una pasada sin nada no manda nada.
    const antes = b.falso.mensajes.length;
    await b.bot.pasada();
    assert.equal(b.falso.mensajes.length, antes);
    assert.ok(b.db.prepare("SELECT 1 FROM ajustes WHERE clave = ?").get(CLAVE_CURSOR));
    for (const f of b.db.prepare('SELECT DISTINCT clase, resultado FROM canal_envios').all()) assert.ok(CLASES_ENVIO.includes(f.clase) && RESULTADOS_ENVIO.includes(f.resultado), JSON.stringify(f));
    // Las respuestas no gastan los topes de los avisos graves.
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM canal_envios WHERE clase IN ('aviso', 'cierre', 'resumen', 'prueba')").get().n, 0);
  });
});

test('/alumno, /gastos, /pagos y /ayuda: nombres escapados (un nombre «<b>&» no rompe el mensaje)', async () => {
  await conBot(async b => {
    b.alumno('pepe', '<b>Pepe & Co</b>');
    for (const texto of ['/alumno pepe', '/gastos', '/pagos', '/ayuda', '/cualquiera', '/alumno nadie']) {
      b.falso.escribir({ chat: CHAT, texto });
      const r = await b.bot.pasada();
      assert.equal(r.contestados, 1, texto);
    }
    const textos = b.delChat().map(m => m.text);
    assert.match(textos[0], /^👤 <b>Pepe & Co<\/b> \(@pepe\)\n/, 'Telegram muestra el nombre tal cual, como texto');
    assert.match(b.delChat()[0].params.text, /&lt;b&gt;Pepe &amp; Co&lt;\/b&gt;/);
    assert.match(textos[0], /Sin plan de IA|Prueba gratis/);
    assert.match(textos[1], /^🤖 Gasto de la IA del mes\n/);
    assert.match(textos[2], /^💳 Comprobantes\nNinguno por revisar\./);
    assert.match(textos[3], /^🤖 Comandos del bot/);
    assert.match(textos[4], /^🤖 Comandos del bot/, 'lo que no conoce: la ayuda');
    assert.match(textos[5], /^⚠️ No encontré ese alumno/);
  });
});

test('nunca contesta un comando viejo (más de 10 min o de antes de unir el chat) y un cursor de hace más de un día no se usa', async () => {
  await conBot(async b => {
    b.falso.escribir({ chat: CHAT, texto: '/contratos todos', fecha: Math.floor((b.t - 11 * MINUTO) / 1000) });
    const r = await b.bot.pasada();
    assert.equal(r.contestados, 0, 'un «/contratos todos» viejo no se dispara');
    const canal = b.db.prepare("SELECT * FROM canales WHERE estado = 'activo'").get();
    const ahora = Date.now();
    assert.equal(esDelDueno({ chat: { id: String(CHAT), tipo: 'private' }, de: { id: String(CHAT), esBot: false }, fecha: Math.floor(ahora / 1000), texto: '/ayuda' }, canal, { ahora }), true);
    assert.equal(esDelDueno({ chat: { id: String(CHAT), tipo: 'private' }, de: { id: String(CHAT), esBot: true }, fecha: Math.floor(ahora / 1000), texto: '/ayuda' }, canal, { ahora }), false, 'un bot');
    // Unido hace una hora y el mensaje de hace 11 min: viejo por la regla de los 10 minutos (no por la de unir el chat).
    const unidoHace = { ...canal, vinculado_en: new Date(ahora - HORA).toISOString() };
    const mensaje = segundos => ({ chat: { id: String(CHAT), tipo: 'private' }, de: { id: String(CHAT), esBot: false }, fecha: Math.floor((ahora - segundos * 1000) / 1000), texto: '/resumen' });
    assert.equal(esDelDueno(mensaje(11 * 60), unidoHace, { ahora }), false, 'más de 10 minutos');
    assert.equal(esDelDueno(mensaje(9 * 60), unidoHace, { ahora }), true, 'menos de 10 minutos');
    assert.equal(esDelDueno({ ...mensaje(0), texto: '/start 12345678' }, unidoHace, { ahora }), false, 'el código de unir el chat');
    assert.equal(esDelDueno({ chat: { id: String(CHAT), tipo: 'private' }, de: { id: String(CHAT), esBot: false }, fecha: Math.floor(Date.parse(canal.vinculado_en) / 1000) - 60, texto: '/ayuda' }, canal, { ahora: Date.parse(canal.vinculado_en) }), false, 'de antes de unir el chat');
    // El cursor guardado hace más de un día: se pregunta sin cursor (Telegram puede haber cambiado la numeración).
    b.db.prepare('UPDATE ajustes SET valor = ? WHERE clave = ?').run(JSON.stringify({ desde: 999_999_999, en: new Date(b.t - 2 * 24 * HORA).toISOString() }), CLAVE_CURSOR);
    b.falso.escribir({ chat: CHAT, texto: '/ayuda' });
    const r2 = await b.bot.pasada();
    assert.equal(r2.contestados, 1, 'con el cursor vencido igual oye al dueño');
  });
});

test('mientras se une un chat, el bot no lee nada (el código del dueño llega por ahí)', async () => {
  await conBot(async b => {
    await empezarVinculo(b.db, b.config, {});
    const antes = pedidosDe(b, 'getUpdates');
    b.falso.escribir({ chat: CHAT, texto: '/resumen' });
    const r = await b.bot.pasada();
    assert.equal(r.motivo, 'uniendo');
    assert.equal(pedidosDe(b, 'getUpdates'), antes, 'ni un getUpdates');
  });
});

test('al firmar: el documento firmado llega al chat del dueño como archivo, con la firma adentro, una sola vez', async () => {
  await conBot(async b => {
    const id = b.alumno('ana.perez');
    b.firmar(id, 'Ana Luz', "D'Alba Gómez");
    marcarContratoPorMandar(b.db, id, 1, b.t);
    const r = await b.bot.pasada();
    assert.equal(r.hecho, 'contrato');
    const doc = b.falso.documentos.at(-1);
    // El día de la firma (hora de RD) sale de la firma misma: nunca de la hora en que corre la prueba.
    const en = b.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`cuenta.terminos.${id}`).valor;
    const dia = new Date(Date.parse(JSON.parse(en)[0].en) - 4 * HORA).toISOString().slice(0, 10);
    assert.equal(doc.nombre, `contrato-ana.perez-v2-${dia}.html`);
    assert.equal(doc.chatId, String(CHAT));
    assert.match(doc.leyenda, /^📄 Contrato firmado\nAna Luz D'Alba Gómez \(@ana\.perez\)\nTérminos v2 · Privacidad v2\n/);
    assert.match(doc.leyendaHtml, /^<b>📄 Contrato firmado<\/b>\n/);
    const html = doc.datos.toString('utf8');
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="Firma de Ana Luz D'Alba Gómez">/, 'la firma va dentro del archivo');
    assert.match(html, /Términos de uso y aviso/);
    assert.doesNotMatch(html, /<script/i);
    // Una sola vez: la marca queda «enviada» (no se borra).
    await b.bot.pasada();
    assert.equal(b.falso.documentos.filter(d => d.nombre.startsWith('contrato-')).length, 1);
    assert.ok(JSON.parse(b.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`telegram.contrato.pendiente.${id}.1`).valor).enviadoEn);
    assert.equal(nombreArchivoContrato({ usuario: 'Ñandú Pérez', usuarioId: 3, version: 2, en: '2026-11-12T15:00:00.000Z' }), 'contrato-_and__p_rez-v2-2026-11-12.html');
    // 50 marcas viejas ya enviadas nunca tapan una nueva.
    const poner = b.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)');
    for (let i = 0; i < 60; i++) poner.run(`telegram.contrato.pendiente.9${i}.1`, JSON.stringify({ usuarioId: 900 + i, n: 1, en: new Date(b.t - HORA).toISOString(), enviadoEn: new Date(b.t - HORA).toISOString() }), new Date(b.t - 2 * HORA).toISOString());
    const otro = b.alumno('beto');
    b.firmar(otro, 'Beto', 'Ruiz');
    marcarContratoPorMandar(b.db, otro, 1, b.t);
    assert.equal((await b.bot.pasada()).hecho, 'contrato', 'la nueva sale');
    assert.ok(b.falso.documentos.at(-1).nombre.startsWith('contrato-beto-v2-'));
    // /contratos <usuario> y /contratos todos.
    b.falso.escribir({ chat: CHAT, texto: '/firmas ana.perez' });
    await b.bot.pasada();
    assert.equal(b.falso.documentos.filter(d => d.nombre.startsWith('contrato-')).length, 3);
    assert.match(b.delChat().filter(m => m.text).at(-1).text, /Ahí van 1 \(de 1\)/);
  });
});

test('los avisos en HTML: título con su emoji y en negrita; un nombre con «<&>» no rompe nada; uno larguísimo va plano', async () => {
  const pago = { clave: 'pago_recibido:7', nivel: 'atencion', ultima_vez: new Date().toISOString(), detalle: JSON.stringify({ alumno: '<i>Juan & Ana', minutos: 300, precio: 'US$12' }) };
  const plano = textoDeAviso(pago, 'es');
  assert.match(plano, /^💳 Comprobante nuevo\n/);
  const html = comoHtml(plano);
  assert.match(html, /^<b>💳 Comprobante nuevo<\/b>\n/);
  assert.match(leerHtmlTelegram(html), /<i>Juan & Ana/);
  assert.equal(escaparHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');
  assert.match(textoDeAviso({ clave: 'ia_resumen:2026-11-11', nivel: 'atencion', ultima_vez: new Date().toISOString(), detalle: '{}' }, 'es'), /^🤖 Gasto de la IA\n/);
  await conBot(async b => {
    const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    abrirAviso(b.db, { clave: 'pago_recibido:9', nivel: 'atencion', detalle: { alumno: '&'.repeat(60), minutos: 1, precio: '&'.repeat(40) }, ahora: b.t });
    const r = await avisador.pasada();
    assert.equal(r.enviado, 'aviso');
    const m = b.falso.mensajes.filter(x => x.chatId === String(CHAT) && /Comprobante/.test(x.text ?? '')).at(-1);
    assert.equal(m.params.parse_mode, 'HTML', 'escapado cabe');
    // Un texto que escapado pasaría de 4.096 (900 «&» son 4.500 letras escapadas): va plano (lo grave siempre llega).
    abrirAviso(b.db, { clave: 'pago_recibido:10', nivel: 'atencion', detalle: { alumno: '&'.repeat(60), minutos: 1, precio: 'x' }, ahora: b.t });
    assert.ok(comoHtml(`T\n${'&'.repeat(900)}`).length > 4096);
  });
});

test('«Enviar a mi Telegram»: uno, todos, la espera de 3 s, «Probar el bot» y el error claro sin chat', async () => {
  await conBot(async b => {
    const id = b.alumno('luis');
    b.firmar(id, 'Luis', 'Mota');
    const rutas = new Map();
    let ahora = b.t;
    registrarRutasIaAlumnos({ agregar: (metodo, ruta, fn) => rutas.set(`${metodo} ${ruta}`, fn) }, { config: b.config, reloj: () => ahora, topesBot: { pausaArchivosMs: 0 } });
    const llamar = async (clave, parametros = {}, datos = {}) => {
      const req = Readable.from([Buffer.from(JSON.stringify(datos))]);
      req.headers = { 'content-type': 'application/json' };
      try { return await rutas.get(clave)({ db: b.db, req, parametros, usuario: { id: b.admin } }); } catch (e) { return { codigo: e.codigo ?? 500, error: e.clave, datos: e.detalle }; }
    };
    let r = await llamar('POST /api/admin/telegram/contratos/:usuario/:n', { usuario: String(id), n: '1' });
    assert.deepEqual([r.codigo, r.datos.motivo, r.datos.enviados], [200, 'ok', 1]);
    r = await llamar('POST /api/admin/telegram/contratos', {}, { usuario: id });
    assert.equal(r.error, 'espera_telegram', 'otra vez enseguida: «espera N s»');
    ahora += 3000;
    r = await llamar('POST /api/admin/telegram/contratos', {}, {});
    assert.deepEqual([r.datos.motivo, r.datos.enviados], ['ok', 1], 'todos (la última de cada alumno)');
    ahora += 3000;
    r = await llamar('POST /api/admin/telegram/probar-bot');
    assert.equal(r.datos.motivo, 'ok');
    assert.equal(r.datos.comandos.length, 6, 'los comandos para BotFather');
    assert.match(r.datos.comandos[0], /^resumen - /);
    assert.match(b.delChat().filter(m => m.text).at(-1).text, /^🤖 El bot funciona/);
    ahora += 3000;
    assert.equal((await llamar('POST /api/admin/telegram/contratos/:usuario/:n', { usuario: String(id), n: '9' })).error, 'no_existe');
    // Sin chat unido: un motivo claro (la pantalla lleva a Claves y Telegram).
    b.db.prepare("UPDATE canales SET estado = 'desvinculado'").run();
    r = await llamar('POST /api/admin/telegram/contratos/:usuario/:n', { usuario: String(id), n: '1' });
    assert.deepEqual([r.datos.motivo, r.datos.enviados], ['sin_chat', 0]);
  });
});
