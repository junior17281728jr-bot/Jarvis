// Fase 1, parte e — ronda 1 del equipo rojo: unir el chat y los avisos al Telegram. Una prueba por cada problema:
//  8. el código de un uso: 5 intentos equivocados lo vencen, aunque lleguen todos en el mismo lote;
//  9. un 4xx que no se conoce (400 PEER_ID_INVALID) no se reintenta cada 15 s: esperas, y telegram_falla lo dice;
// 10. un token nuevo del MISMO bot cuya prueba falló por algo pasajero se prueba otra vez solo: los avisos vuelven;
// 11. Telegram caído 30 h (502) o el bot bloqueado 50 h (403): lo grave llega igual cuando vuelve, y lo que se arregló
//     solo sin llegar va en «No te llegaron a tiempo»; lo que no es grave y pasa de 48 h queda «vencido»;
// 12. un reloj que se corrige hacia atrás no frena los avisos (pausas, topes, «hace poco», update.log).
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, ponerToken, BOT, CHAT, EXTRANO, MINUTO, HORA } from './copias-tarea-base.js';
import { tokenDePrueba } from './telegram-falso.js';
import { crearAvisador } from '../src/canales/avisador.js';
import { frase } from '../src/canales/textos.js';
import { abrirAviso, resolverAviso } from '../src/avisos/avisos.js';
import { canalActual, empezarVinculo, revisarVinculo, estadoTelegram, enviadosDesde, anotarEnvio, pausaDe } from '../src/canales/canales.js';
import { aplicarActualizaciones } from '../src/copias/vigilar.js';

const iso = ms => new Date(ms).toISOString();
const textosDelChat = (b, chat = CHAT) => b.falso.mensajes.filter(m => m.chatId === String(chat) && m.text).map(m => m.text);
const pedidosDe = (b, metodo) => b.falso.pedidos.filter(p => p.metodo === metodo).length;

async function conAvisador(fn, opciones = {}) {
  const b = await montar({ relleno: 0, ...opciones });
  b.avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
  // Pasadas cada 15 s (reloj de mentira) durante ms, o hasta que hasta() diga que sí. → cuántas pasadas
  b.pasadas = async (ms, hasta = () => false) => {
    const fin = b.t + ms;
    let n = 0;
    while (b.t < fin) {
      await b.avisador.pasada();
      n += 1;
      if (hasta()) return n;
      b.avanzar(15_000);
    }
    return n;
  };
  try { await fn(b); } finally { await b.cerrar(); }
}

// ---------- 8. El código de un uso ----------

function equivocados(codigo, n) {
  return Array.from({ length: n }, (_, i) => String((Number(codigo) + 1 + i) % 100_000_000).padStart(8, '0'));
}

test('ronda 1 (8): 5 códigos equivocados y después el bueno, en el MISMO lote: el código vence (un extraño nunca une su chat)', async () => {
  const b = await montar({ telegram: false, relleno: 0 });
  try {
    await ponerToken(b);
    const v = await empezarVinculo(b.db, b.config, {});
    for (const malo of equivocados(v.codigo, 5)) b.falso.escribir({ chat: EXTRANO, texto: malo });
    b.falso.escribir({ chat: EXTRANO, texto: v.codigo });
    const r = await revisarVinculo(b.db, b.config, { cadaMs: 0 });
    assert.equal(r.estado, 'vencido');
    assert.equal(canalActual(b.db), null, 'ningún chat unido');
    const fila = b.db.prepare("SELECT estado, codigo_intentos FROM canales ORDER BY id DESC LIMIT 1").get();
    assert.deepEqual([fila.estado, fila.codigo_intentos], ['vencido', 5]);
    // Con 4 equivocados, el bueno todavía sirve (y en dos lotes también se cuentan juntos).
    const v2 = await empezarVinculo(b.db, b.config, {});
    for (const malo of equivocados(v2.codigo, 3)) b.falso.escribir({ chat: EXTRANO, texto: malo });
    assert.equal((await revisarVinculo(b.db, b.config, { cadaMs: 0 })).estado, 'esperando');
    for (const malo of equivocados(v2.codigo, 2)) b.falso.escribir({ chat: EXTRANO, texto: malo });
    b.falso.escribir({ chat: CHAT, texto: v2.codigo });
    assert.equal((await revisarVinculo(b.db, b.config, { cadaMs: 0 })).estado, 'vencido', '3 + 2 = 5 equivocados: vence antes de ver el bueno');
    const v3 = await empezarVinculo(b.db, b.config, {});
    for (const malo of equivocados(v3.codigo, 4)) b.falso.escribir({ chat: EXTRANO, texto: malo });
    b.falso.escribir({ chat: CHAT, texto: v3.codigo });
    const r3 = await revisarVinculo(b.db, b.config, { cadaMs: 0 });
    assert.equal(r3.estado, 'vinculado');
    assert.equal(canalActual(b.db).destino, String(CHAT));
  } finally {
    await b.cerrar();
  }
});

// ---------- 9. Un 4xx que no se conoce ----------

test('ronda 1 (9): sendMessage responde 400 PEER_ID_INVALID: en 1 h, pocos pedidos; telegram_falla «pedido»; las pantallas dicen que no llega; lo grave espera y llega después', async () => {
  await conAvisador(async b => {
    b.falso.escena('sendMessage', 'peer_invalido', { veces: 100_000 });
    abrirAviso(b.db, { clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 900 }, ahora: b.t });
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', ahora: b.t });
    const antes = pedidosDe(b, 'sendMessage');
    await b.pasadas(HORA);
    const hechos = pedidosDe(b, 'sendMessage') - antes;
    assert.ok(hechos >= 2 && hechos <= 5, `pedidos en 1 h: ${hechos}`);
    const falla = b.aviso('telegram_falla');
    assert.equal(JSON.parse(falla.detalle).motivo, 'pedido');
    const tg = estadoTelegram(b.db, b.config, { ahora: b.t });
    assert.deepEqual([tg.listo, tg.motivo], [false, 'pedido']);
    assert.equal(b.aviso('modo_seguro').enviado_en, null, 'lo grave nunca queda marcado como enviado ni fallido');
    // Telegram vuelve: lo grave llega solo y telegram_falla se cierra.
    b.falso.sinEscenas();
    await b.pasadas(2 * HORA, () => textosDelChat(b).some(t => t.startsWith(frase('es', 'telegram.titulo.grave'))));
    assert.ok(textosDelChat(b).some(t => t.startsWith(frase('es', 'telegram.titulo.grave'))), 'llegó el modo seguro');
    assert.equal(b.aviso('telegram_falla'), null);
  });
});

// ---------- 10. Un token nuevo del mismo bot ----------

test('ronda 1 (10): un token nuevo del MISMO bot cuya prueba dio 502: se prueba otra vez solo y los avisos vuelven en menos de 10 min', async () => {
  await conAvisador(async b => {
    const nuevo = tokenDePrueba(3, 'D');
    b.falso.agregarBot({ token: nuevo, id: BOT.id, usuario: BOT.usuario });
    b.falso.escena('getMe', 'error_502', { veces: 2 }); // la prueba de la pantalla y el primer reintento
    const p = await ponerToken(b, { token: nuevo });
    assert.notEqual(p.motivo, 'ok');
    assert.equal(estadoTelegram(b.db, b.config, { ahora: b.t }).motivo, 'sin_probar');
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', ahora: b.t });
    const desde = b.t;
    await b.avisador.pasada();
    assert.equal(JSON.parse(b.aviso('telegram_falla')?.detalle ?? '{}').motivo, 'sin_probar', 'mientras no pasa, se dice');
    const llego = () => textosDelChat(b).some(t => t.startsWith(frase('es', 'telegram.titulo.grave')));
    await b.pasadas(10 * MINUTO, llego);
    assert.ok(llego(), 'el aviso grave llegó solo');
    assert.ok(b.t - desde <= 10 * MINUTO);
    assert.equal(canalActual(b.db).secreto_id, p.id, 'el chat sigue, ahora con el token nuevo');
    assert.equal(b.aviso('telegram_falla'), null);
    assert.ok(pedidosDe(b, 'getMe') <= 6, 'pocas pruebas gratis');
  });
});

// ---------- 11. Telegram caído mucho tiempo ----------

test('ronda 1 (11): Telegram con 502 durante 30 h: la actualización devuelta (grave, una sola vez) llega cuando vuelve; nunca queda «fallida»', async () => {
  await conAvisador(async b => {
    abrirAviso(b.db, { clave: 'actualizacion_revertida:abc1234', nivel: 'grave', detalle: { sha7: 'abc1234' }, ahora: b.t });
    b.falso.escena('sendMessage', 'error_502', { veces: 100_000 });
    await b.pasadas(30 * HORA);
    const a = b.db.prepare("SELECT * FROM avisos WHERE clave = 'actualizacion_revertida:abc1234'").get();
    assert.equal(a.enviado_en, null);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM canal_envios WHERE aviso_id = ? AND resultado = 'fallido'").get(a.id).n, 0);
    assert.equal(JSON.parse(b.aviso('telegram_falla').detalle).motivo, 'sin_respuesta', 'las pantallas dicen que no llega');
    b.falso.sinEscenas();
    const llego = () => textosDelChat(b).some(t => t.includes('abc1234'));
    await b.pasadas(3 * HORA, llego);
    assert.ok(llego(), 'el dueño se enteró de la actualización devuelta');
  });
});

test('ronda 1 (11): el bot bloqueado 50 h: lo grave llega al desbloquear; lo que se arregló solo va en «No te llegaron a tiempo» (sin «Ya se arregló»); lo leve queda anotado', async () => {
  await conAvisador(async b => {
    abrirAviso(b.db, { clave: 'actualizacion_revertida:abc1234', nivel: 'grave', detalle: { sha7: 'abc1234' }, ahora: b.t });
    abrirAviso(b.db, { clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 900 }, ahora: b.t });
    b.falso.bloquear(CHAT);
    await b.pasadas(10 * HORA);
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', ahora: b.t });
    await b.pasadas(2 * HORA);
    resolverAviso(b.db, 'modo_seguro', b.t);
    await b.pasadas(38 * HORA);
    assert.equal(textosDelChat(b).filter(t => !t.startsWith('✅')).length, 0, 'nada llegó mientras estaba bloqueado');
    b.falso.bloquear(CHAT, false);
    const titulo = frase('es', 'telegram.titulo.perdidos');
    await b.pasadas(3 * HORA, () => textosDelChat(b).some(t => t.includes('abc1234')) && textosDelChat(b).some(t => t.startsWith(titulo)));
    const textos = textosDelChat(b);
    assert.ok(textos.some(t => t.includes('abc1234')), 'llegó la actualización devuelta');
    const perdido = textos.find(t => t.startsWith(titulo));
    assert.ok(perdido, 'llegó «No te llegaron a tiempo»');
    assert.ok(perdido.includes(frase('es', 'telegram.aviso.modo_seguro.titulo')), perdido);
    await b.pasadas(2 * HORA);
    assert.ok(!textosDelChat(b).some(t => t.startsWith(frase('es', 'telegram.titulo.cierre')) && t.includes(frase('es', 'telegram.aviso.modo_seguro.titulo'))), 'sin un «Ya se arregló» de más');
    // Lo leve que no se pudo mandar en 24 h quedó anotado «fallido» (nunca en silencio).
    const leve = b.db.prepare("SELECT id FROM avisos WHERE clave = 'disco_bajo'").get();
    assert.equal(b.db.prepare("SELECT resultado FROM canal_envios WHERE aviso_id = ? ORDER BY id DESC LIMIT 1").get(leve.id)?.resultado, 'fallido');
  });
});

test('ronda 1 (11): lo leve que pasó de 48 h sin poder intentarse (sin token, por ejemplo) queda «vencido»; lo grave de hace 3 días todavía llega', async () => {
  await conAvisador(async b => {
    b.avanzar(60 * HORA);
    abrirAviso(b.db, { clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 900 }, ahora: b.t - 50 * HORA });
    abrirAviso(b.db, { clave: 'actualizacion_revertida:abc1234', nivel: 'grave', detalle: { sha7: 'abc1234' }, ahora: b.t - 55 * HORA });
    await b.pasadas(5 * MINUTO, () => textosDelChat(b).some(t => t.includes('abc1234')));
    const leve = b.db.prepare("SELECT id, enviado_en FROM avisos WHERE clave = 'disco_bajo'").get();
    assert.equal(b.db.prepare('SELECT resultado FROM canal_envios WHERE aviso_id = ? ORDER BY id DESC LIMIT 1').get(leve.id)?.resultado, 'vencido');
    assert.ok(textosDelChat(b).some(t => t.includes('abc1234')), 'lo grave espera hasta 7 días');
  });
});

// ---------- 12. El reloj se corrige hacia atrás ----------

test('ronda 1 (12): un 429 con el reloj 6 h adelantado y después corregido: lo grave sale enseguida (pausa, topes y «hace poco» no frenan)', async () => {
  await conAvisador(async b => {
    const real = b.t;
    b.t += 6 * HORA; // el reloj va adelantado
    abrirAviso(b.db, { clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 900 }, ahora: b.t });
    b.falso.escena('sendMessage', 'limite', { segundos: 5 });
    await b.avisador.pasada();
    const canal = canalActual(b.db);
    assert.ok(Date.parse(canal.pausa_hasta) > real + 6 * HORA, 'quedó la pausa del 429');
    // Con el reloj adelantado también salieron 10 mensajes (el tope de una hora).
    const antes = enviadosDesde(b.db, canal.id, real - HORA, real);
    for (let i = 0; i < 10; i++) anotarEnvio(b.db, { canalId: canal.id, clase: 'aviso', resultado: 'enviado', clave: 'modo_seguro', nivel: 'grave', ahora: b.t });
    b.t = real; // NTP lo corrige
    assert.equal(pausaDe(canalActual(b.db), b.t), null, 'una pausa más larga que la máxima no se respeta');
    assert.equal(enviadosDesde(b.db, canal.id, b.t - HORA, b.t), antes, 'lo «del futuro» no cuenta para los topes');
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', ahora: b.t });
    await b.pasadas(MINUTO, () => textosDelChat(b).some(t => t.startsWith(frase('es', 'telegram.titulo.grave'))));
    assert.ok(textosDelChat(b).some(t => t.startsWith(frase('es', 'telegram.titulo.grave'))), 'el modo seguro llegó en menos de un minuto');
  });
});

test('ronda 1 (12): update.log con el reloj corregido hacia atrás: la línea nueva (con fecha de antes) se avisa; la ya vista nunca otra vez', async () => {
  await conAvisador(async b => {
    const real = b.t;
    const adelantado = real + 6 * HORA;
    const linea = (fecha, sha) => ({ tipo: 'revertida', fecha, sha });
    aplicarActualizaciones(b.db, { lineas: [], versionMala: null }, { ahora: adelantado }); // la primera vez: «desde ahora»
    const vieja = linea(adelantado + MINUTO, 'aaaaaaa');
    assert.deepEqual(aplicarActualizaciones(b.db, { lineas: [vieja], versionMala: null }, { ahora: adelantado + 2 * MINUTO }).abiertos, ['actualizacion_revertida:aaaaaaa']);
    resolverAviso(b.db, 'actualizacion_revertida:aaaaaaa', adelantado + 3 * MINUTO);
    // El reloj vuelve 6 h atrás; el actualizador escribe una línea nueva con la hora corregida.
    const nueva = linea(real + MINUTO, 'bbbbbbb');
    const r = aplicarActualizaciones(b.db, { lineas: [vieja, nueva], versionMala: null }, { ahora: real + 2 * MINUTO });
    assert.deepEqual(r.abiertos, ['actualizacion_revertida:bbbbbbb']);
    assert.equal(r.relojAtras, true);
    assert.equal(b.aviso('actualizacion_revertida:aaaaaaa'), null, 'la ya vista no se abre otra vez');
    // La hora siguiente, nada nuevo: nada se repite.
    assert.deepEqual(aplicarActualizaciones(b.db, { lineas: [vieja, nueva], versionMala: null }, { ahora: real + HORA }).abiertos, []);
  });
});
