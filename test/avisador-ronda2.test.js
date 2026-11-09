// Fase 1, parte e — ronda 2 del equipo rojo: el Telegram (unir el chat, el mensaje de prueba, los avisos). Una prueba por
// cada problema confirmado:
//  7. «Mandar un mensaje de prueba» nunca ata el chat a OTRO bot; y una copia que ve otro bot lo avisa;
//  8. un extraño que conoce el @usuario del bot nunca vence el código del dueño (al unir el chat, ni al restaurar);
// 11. unir el chat OTRA vez nunca calla lo grave que esperaba; la bienvenida que no salió se manda después;
// 12. un reloj que salta hacia adelante no vence los avisos pendientes;
// 13. muchos mensajes largos (más de 256 KB por pregunta) nunca dejan atascado al que une el chat;
// 14. las pantallas nunca recorren todas las filas de las partes ni de los envíos (crecen cada noche).
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar, ponerToken, unirChat, revisarYConfirmar, segundoCodigo, BOT, BOT2, CHAT, EXTRANO, MINUTO, HORA } from './copias-tarea-base.js';
import { tokenDePrueba } from './telegram-falso.js';
import { crearAvisador } from '../src/canales/avisador.js';
import { frase } from '../src/canales/textos.js';
import { abrirAviso, resolverAviso } from '../src/avisos/avisos.js';
import {
  canalActual, empezarVinculo, revisarVinculo, estadoTelegram, listoParaMandar, mandarPrueba, anotarProblema,
} from '../src/canales/canales.js';
import { empezarBusquedaDeChat } from '../src/copias/restaurar.js';
import { estadoCopias } from '../src/copias/estado.js';

const DIA = 24 * HORA;
const iso = ms => new Date(ms).toISOString();
const textosDelChat = (b, chat = CHAT) => b.falso.mensajes.filter(m => m.chatId === String(chat) && m.text && !m.text.startsWith('🔐')).map(m => m.text);
const equivocados = (codigo, n) => Array.from({ length: n }, (_, i) => String((Number(codigo) + 1 + i) % 100_000_000).padStart(8, '0'));

function conPasadas(b, avisador) {
  return async (ms, hasta = () => false, alAvanzar = () => {}) => {
    const fin = b.t + ms;
    while (b.t < fin) {
      await avisador.pasada();
      if (hasta()) return true;
      b.avanzar(15_000);
      alAvanzar();
    }
    return false;
  };
}

// ---------- 7. El mensaje de prueba y otro bot ----------

test('ronda 2 (7): el dueño pega el token de OTRO bot y su prueba falla de paso; «Mandar un mensaje de prueba» lo prueba primero: el chat queda desvinculado y nada sale por el otro bot', async () => {
  const b = await montar({ relleno: 0 });
  try {
    b.falso.escena('getMe', 'error_500');
    const nuevo = await ponerToken(b, { token: b.token2 });
    assert.equal(nuevo.motivo, 'error_proveedor');
    assert.equal(listoParaMandar(b.db, b.config).motivo, 'sin_probar');
    const r = await mandarPrueba(b.db, b.config, {});
    assert.equal(r.motivo, 'bot_cambiado');
    assert.equal(canalActual(b.db), null, 'el chat del otro bot queda desvinculado (hay que unirlo con este)');
    assert.equal(b.falso.pedidos.filter(p => p.metodo === 'sendMessage' && p.bot === BOT2.id).length, 0, 'nada salió por el bot nuevo al chat viejo');
    assert.equal(estadoTelegram(b.db, b.config).listo, false);
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (7): un token NUEVO del MISMO bot cuya prueba falló de paso: el mensaje de prueba lo prueba, sigue con el chat y sale', async () => {
  const b = await montar({ relleno: 0 });
  try {
    const token3 = tokenDePrueba(3, 'D');
    b.falso.agregarBot({ token: token3, id: BOT.id, usuario: BOT.usuario });
    b.falso.escena('getMe', 'error_500');
    const nuevo = await ponerToken(b, { token: token3 });
    assert.equal(nuevo.motivo, 'error_proveedor');
    const r = await mandarPrueba(b.db, b.config, {});
    assert.equal(r.motivo, 'ok');
    assert.equal(canalActual(b.db).secreto_id, nuevo.id);
    assert.ok(textosDelChat(b).some(t => t.length > 0));
    assert.equal(listoParaMandar(b.db, b.config).si, true);
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (7): una copia que ve que el token es de otro bot que el del chat lo avisa (telegram_falla «bot_cambiado»), nunca en silencio', async () => {
  const b = await montar({ relleno: 2 });
  try {
    b.db.prepare("UPDATE canales SET cuenta_id = '7000099' WHERE estado = 'activo'").run();
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.deepEqual([b.copias()[0].estado, b.copias()[0].fuera], ['solo_local', 0]);
    assert.equal(JSON.parse(b.aviso('telegram_falla').detalle).motivo, 'bot_cambiado');
    const t = estadoTelegram(b.db, b.config);
    assert.deepEqual([t.listo, t.motivo], [false, 'bot_cambiado']);
  } finally {
    await b.cerrar();
  }
});

// ---------- 8. Un extraño no vence el código ----------

test('ronda 2 (8): al restaurar, 5 códigos equivocados de un extraño (y hasta el bueno, adivinado) antes del «/start» del dueño: se encuentra el chat del dueño', async () => {
  const b = await montar({ relleno: 0 });
  try {
    const busqueda = await empezarBusquedaDeChat({ token: b.token, base: b.falso.url, cadaMs: 5 });
    for (const malo of equivocados(busqueda.codigo, 5)) b.falso.escribir({ chat: EXTRANO, texto: malo });
    b.falso.escribir({ chat: EXTRANO, texto: busqueda.codigo });
    b.falso.escribir({ chat: CHAT, texto: `/start ${busqueda.codigo}` });
    const chat = await busqueda.esperar({ hastaMs: Date.now() + 20_000 });
    assert.equal(chat.chatId, String(CHAT));
  } finally {
    await b.cerrar();
  }
});

// ---------- 11. Unir el chat otra vez ----------

test('ronda 2 (11): el chat se pierde, se abre modo seguro (grave), el dueño une el chat otra vez y la bienvenida choca con un 429: llegan la bienvenida y el modo seguro', async () => {
  const b = await montar({ relleno: 0 });
  try {
    const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    const pasadas = conPasadas(b, avisador);
    anotarProblema(b.db, canalActual(b.db), { motivo: 'chat_no_existe', ahora: b.t });
    assert.equal(canalActual(b.db).estado, 'perdido');
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', detalle: { motivo: 'servicio_inestable' }, ahora: b.t });
    assert.equal((await avisador.pasada()).motivo, 'perdido');
    b.falso.escena('sendMessage', 'limite', { segundos: 3, saltar: 1 }); // el segundo código sale; la bienvenida choca
    const antes = textosDelChat(b).length;
    await unirChat(b);
    assert.equal(textosDelChat(b).length, antes, 'la bienvenida no salió (429)');
    b.t = Math.max(b.t, Date.now()) + 1000;
    const llego = await pasadas(30 * MINUTO, () => textosDelChat(b).some(t => /URGENTE/.test(t)));
    assert.ok(llego, JSON.stringify(textosDelChat(b)));
    const nuevos = textosDelChat(b).slice(antes);
    assert.match(nuevos[0], /^✅ Listo/, 'primero la bienvenida');
    assert.ok(nuevos.some(t => /URGENTE/.test(t)), 'y el modo seguro, que esperaba');
    const a = b.db.prepare("SELECT * FROM avisos WHERE clave = 'modo_seguro'").get();
    const envios = b.db.prepare('SELECT resultado FROM canal_envios WHERE aviso_id = ?').all(a.id).map(e => e.resultado);
    assert.ok(envios.includes('enviado'));
    assert.ok(!envios.includes('antes_de_conectar'), 'nunca se calla como «de antes de conectar»');
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (11): un grave se abre y se arregla mientras el chat estaba perdido; al unir el chat otra vez llega en «No te llegaron a tiempo»', async () => {
  const b = await montar({ relleno: 0 });
  try {
    const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    const pasadas = conPasadas(b, avisador);
    anotarProblema(b.db, canalActual(b.db), { motivo: 'chat_no_existe', ahora: b.t });
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', detalle: { motivo: 'servicio_inestable' }, ahora: b.t });
    b.avanzar(HORA);
    resolverAviso(b.db, 'modo_seguro', b.t);
    b.avanzar(HORA);
    await unirChat(b);
    b.t = Math.max(b.t, Date.now()) + 1000;
    const titulo = frase('es', 'telegram.titulo.perdidos');
    assert.ok(await pasadas(20 * MINUTO, () => textosDelChat(b).some(t => t.startsWith(titulo))), JSON.stringify(textosDelChat(b)));
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (11): la PRIMERA vez que se une un chat, lo de antes no se manda uno por uno: la bienvenida dice cuántos hay', async () => {
  const b = await montar({ telegram: false, relleno: 0 });
  try {
    await ponerToken(b);
    abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', detalle: { motivo: 'servicio_inestable' }, ahora: Date.now() - 5000 });
    await unirChat(b);
    assert.ok(textosDelChat(b).some(t => t.includes(frase('es', 'telegram.bienvenida_abiertos_uno'))));
    const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    await conPasadas(b, avisador)(5 * MINUTO);
    assert.ok(!textosDelChat(b).some(t => /URGENTE/.test(t)));
    const a = b.db.prepare("SELECT * FROM avisos WHERE clave = 'modo_seguro'").get();
    assert.deepEqual(b.db.prepare('SELECT resultado FROM canal_envios WHERE aviso_id = ?').all(a.id).map(e => e.resultado), ['antes_de_conectar']);
  } finally {
    await b.cerrar();
  }
});

// ---------- 12. El reloj salta hacia adelante ----------

test('ronda 2 (12): un aviso de atención espera tras un 502; el reloj salta 3 días y vuelve: el aviso NO queda «vencido» y llega; si la hora nueva se queda, se acepta', async () => {
  const b = await montar({ relleno: 0 });
  try {
    b.mono = 0;
    const avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj, monotono: () => b.mono, topes: { aceptarSaltoMs: 30 * MINUTO } });
    const t0 = b.t;
    abrirAviso(b.db, { clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 700 }, ahora: b.t });
    b.falso.escena('sendMessage', 'error_502');
    assert.equal((await avisador.pasada()).enviado, null);
    b.t = t0 + 3 * DIA;
    b.mono += 15_000;
    await avisador.pasada();
    const a = () => b.db.prepare("SELECT * FROM avisos WHERE clave = 'disco_bajo'").get();
    assert.equal(a().enviado_en, null, 'un salto del reloj no vence nada');
    b.t = t0 + 2 * MINUTO;
    let llego = false;
    for (let i = 0; i < 40 && !llego; i++) {
      b.mono += 15_000;
      b.avanzar(15_000);
      await avisador.pasada();
      llego = textosDelChat(b).some(t => t.includes('700'));
    }
    assert.ok(llego, 'llegó cuando el reloj volvió');
    assert.ok(b.db.prepare("SELECT 1 FROM canal_envios WHERE aviso_id = ? AND resultado = 'enviado'").get(a().id));
    // Otro aviso, y un salto que se QUEDA: pasado el tiempo de aceptarlo (aquí 30 min del proceso), sí se vence.
    resolverAviso(b.db, 'disco_bajo', b.t);
    abrirAviso(b.db, { clave: 'memoria_baja', nivel: 'atencion', detalle: { disponibleMb: 40 }, ahora: b.t });
    b.falso.escena('sendMessage', 'error_502', { veces: 1e6 });
    await avisador.pasada();
    b.t += 3 * DIA;
    for (let i = 0; i < 10; i++) { b.mono += 15_000; b.avanzar(15_000); await avisador.pasada(); }
    const m = () => b.db.prepare("SELECT * FROM avisos WHERE clave = 'memoria_baja'").get();
    assert.equal(m().enviado_en, null, 'todavía no');
    for (let i = 0; i < 140; i++) { b.mono += 15_000; b.avanzar(15_000); await avisador.pasada(); }
    assert.ok(m().enviado_en, 'la hora nueva se aceptó: lo de más de 48 h queda vencido');
    assert.ok(b.db.prepare("SELECT 1 FROM canal_envios WHERE aviso_id = ? AND resultado = 'vencido'").get(m().id));
  } finally {
    await b.cerrar();
  }
});

// ---------- 13. Muchos mensajes largos ----------

test('ronda 2 (13): un extraño manda 40 mensajes de 4096 «ñ» (más de 256 KB) y uno de 3 MB: el chat del dueño igual se une', async () => {
  const b = await montar({ telegram: false, relleno: 0 });
  try {
    await ponerToken(b);
    let v = await empezarVinculo(b.db, b.config, {});
    for (let i = 0; i < 40; i++) b.falso.escribir({ chat: EXTRANO, texto: 'ñ'.repeat(4096) });
    b.falso.escribir({ chat: CHAT, texto: `/start ${v.codigo}` });
    let r = null;
    for (let i = 0; i < 10 && r?.estado !== 'vinculado'; i++) r = await revisarYConfirmar(b);
    assert.equal(r.estado, 'vinculado');
    // Uno solo demasiado grande (3 MB): se salta; el cursor nunca se queda atascado.
    v = await empezarVinculo(b.db, b.config, {});
    b.falso.escribir({ chat: EXTRANO, texto: 'hola' });
    assert.equal((await revisarVinculo(b.db, b.config, { cadaMs: 0 })).estado, 'esperando');
    b.falso.escribir({ chat: EXTRANO, texto: 'x'.repeat(3_000_000) });
    b.falso.escribir({ chat: CHAT, texto: `/start ${v.codigo}` });
    r = null;
    for (let i = 0; i < 6 && r?.estado !== 'vinculado'; i++) r = await revisarYConfirmar(b);
    assert.equal(r.estado, 'vinculado');
    // Sin cursor todavía (código recién pedido) y el enorme primero: se salta hasta el último, y el «/start» une.
    v = await empezarVinculo(b.db, b.config, {});
    b.falso.escribir({ chat: EXTRANO, texto: 'y'.repeat(3_000_000) });
    b.falso.escribir({ chat: CHAT, texto: `/start ${v.codigo}` });
    r = null;
    for (let i = 0; i < 4 && r?.estado !== 'vinculado'; i++) r = await revisarYConfirmar(b);
    assert.equal(r.estado, 'vinculado');
    assert.ok(b.falso.pedidos.filter(p => p.metodo === 'getUpdates').every(p => p.params.limit <= 10), 'de a pocos');
  } finally {
    await b.cerrar();
  }
});

// ---------- 14. Las pantallas nunca recorren todo ----------

test('ronda 2 (14): las consultas de las pantallas de Copias y Telegram usan sus índices: nunca recorren copia_partes ni canal_envios enteras, ni ordenan todo', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const vistas = [];
    const preparar = b.db.prepare.bind(b.db);
    b.db.prepare = sql => { vistas.push(sql); return preparar(sql); };
    try {
      estadoTelegram(b.db, b.config, { ahora: b.t });
      estadoCopias(b.db, { ahora: b.t, libreMb: 50_000 });
    } finally {
      delete b.db.prepare;
    }
    const tocan = vistas.filter(sql => /copia_partes|canal_envios/.test(sql));
    assert.ok(tocan.length >= 3, 'se miraron las consultas que importan');
    for (const sql of tocan) {
      const plan = preparar(`EXPLAIN QUERY PLAN ${sql}`).all().map(f => f.detail);
      for (const paso of plan) {
        assert.doesNotMatch(paso, /^SCAN (copia_partes|canal_envios|p|e)\b/, `${sql}\n→ ${plan.join(' | ')}`);
        assert.doesNotMatch(paso, /USE TEMP B-TREE FOR ORDER BY/, `${sql}\n→ ${plan.join(' | ')}`);
      }
    }
  } finally {
    await b.cerrar();
  }
});

void iso;
