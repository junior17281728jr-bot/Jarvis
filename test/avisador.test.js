// Fase 1, parte e (paso 2): el que manda los avisos al Telegram del dueño (en el proceso WEB), la «copia atrasada» que
// él mismo revisa, lo que vigila el trabajador de las copias, y la lectura (solo lectura) de update.log y version.bad.
// Contra el Telegram FALSO; nunca internet, nunca un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync, statSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { montar, CHAT, MINUTO, HORA } from './copias-tarea-base.js';
import { crearAvisador, vaPorTelegram } from '../src/canales/avisador.js';
import { textoDeAviso, existeFrase, baseDeClave } from '../src/canales/textos.js';
import { abrirAviso, resolverAviso, CLAVES_AVISO } from '../src/avisos/avisos.js';
import { ponerModoSeguro } from '../src/tareas/modo-seguro.js';
import { vigilarCopias, leerActualizaciones, lineasDeActualizacion, ultimaVersionMala } from '../src/copias/vigilar.js';
import { copiaAtrasada } from '../src/copias/estado.js';
import { ESTADOS_CANAL, CLASES_ENVIO, RESULTADOS_ENVIO } from '../src/canales/canal.js';

const iso = ms => new Date(ms).toISOString();
const mensajesDelChat = b => b.falso.mensajes.filter(m => m.chatId === String(CHAT) && m.text && !m.text.startsWith('✅ Listo') && !m.text.startsWith('🔐'));

async function conAvisador(fn, opciones = {}) {
  const b = await montar({ relleno: 0, ...opciones });
  b.avisador = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj, ...(opciones.avisador ?? {}) });
  b.abrir = (clave, nivel = 'atencion', extra = {}) => abrirAviso(b.db, { clave, nivel, ahora: b.t, ...extra });
  try { await fn(b); } finally { await b.cerrar(); }
}

// ---------- 2.10 Qué va, qué suena, no repetir, topes, juntar, «Ya se arregló» ----------

test('2.10 la tabla de lo que va: todo lo grave suena; lo demás en silencio; lo que es solo de la pantalla no va', () => {
  assert.deepEqual(vaPorTelegram({ clave: 'modo_seguro', nivel: 'grave' }), { va: true, suena: true });
  assert.deepEqual(vaPorTelegram({ clave: 'modo_seguro', nivel: 'info' }), { va: false, suena: false }, 'modo seguro puesto a mano');
  for (const clave of ['trabajador_reinicios', 'disco_bajo', 'memoria_baja', 'copias_locales_pausadas', 'copias_sin_clave', 'copias_comprobar_clave', 'copias_disco_pronto', 'copia_sin_fijar',
    'ia_tope:general:2026-11', 'ia_proveedor:anthropic', 'actualizacion_no_instalada:abc1234']) {
    assert.deepEqual(vaPorTelegram({ clave, nivel: 'atencion' }), { va: true, suena: false }, clave);
  }
  for (const clave of ['tareas_fallidas', 'tareas_revisar', 'fila_atrasada', 'freno:sistema.base', 'pantallas_lentas', 'wal_grande', 'base_grande', 'ia_llamadas:e2', 'copias_sin_telegram', 'telegram_falla']) {
    assert.equal(vaPorTelegram({ clave, nivel: 'atencion' }).va, false, clave);
  }
  // Cada aviso que puede ir tiene su texto en los dos idiomas (o el «otro» genérico); ninguno lleva el detalle.
  for (const clave of CLAVES_AVISO) {
    const t = textoDeAviso({ clave, nivel: 'grave', ultima_vez: iso(Date.now()), detalle: JSON.stringify({ libreMb: 210, correo: 'junior@example.com' }) });
    assert.ok(t.length <= 1000 && !t.includes('junior@example.com'), clave);
    if (vaPorTelegram({ clave, nivel: 'atencion' }).va) assert.ok(existeFrase(`telegram.aviso.${baseDeClave(clave)}.texto`), `falta telegram.aviso.${clave}`);
  }
  assert.match(textoDeAviso({ clave: 'actualizacion_revertida:abc1234', nivel: 'grave', ultima_vez: iso(Date.now()) }), /abc1234/);
});

test('2.10 un aviso grave llega sonando y una sola vez; uno de atención en silencio; lo que no va queda anotado; uno por pasada', async () => {
  await conAvisador(async b => {
    b.abrir('modo_seguro', 'grave');
    b.abrir('fila_atrasada');
    b.abrir('disco_bajo', 'atencion', { detalle: { libreMb: 900 } });
    const r1 = await b.avisador.pasada();
    assert.equal(r1.enviado, 'aviso');
    assert.equal(r1.suena, true);
    let m = mensajesDelChat(b);
    assert.equal(m.length, 1, 'uno por pasada');
    assert.match(m[0].text, /URGENTE/);
    assert.equal(m[0].silencioso, false);
    // 0.12.8: en HTML (el título en negrita, todo escapado).
    assert.equal(m[0].params.parse_mode, 'HTML');
    assert.match(m[0].params.text, /^<b>🔴 URGENTE<\/b>\n/);
    assert.match(m[0].text, /^🔴 URGENTE\n/, 'Telegram lo muestra sin las etiquetas');
    assert.deepEqual(m[0].params.link_preview_options, { is_disabled: true });
    assert.ok(b.db.prepare("SELECT 1 FROM canal_envios WHERE clave = 'fila_atrasada' AND resultado = 'no_va'").get());
    await b.avisador.pasada();
    m = mensajesDelChat(b);
    assert.equal(m.length, 2);
    assert.match(m[1].text, /900 MB/);
    assert.equal(m[1].silencioso, true);
    // Nada más: el mismo aviso otra vez (sin noticia nueva) no se repite.
    b.abrir('modo_seguro', 'grave');
    b.abrir('disco_bajo', 'atencion', { detalle: { libreMb: 800 } });
    assert.equal((await b.avisador.pasada()).motivo, 'nada');
    assert.equal(mensajesDelChat(b).length, 2);
  });
});

test('2.10 sube a grave → otra vez (no antes de 30 min); una noticia nueva (IA del 50 al 80 %) → otra vez; va y viene → se calla; resuelto o de hace 48 h → no va', async () => {
  await conAvisador(async b => {
    b.abrir('disco_bajo', 'atencion', { detalle: { libreMb: 900 } });
    await b.avisador.pasada();
    b.avanzar(MINUTO);
    b.abrir('disco_bajo', 'grave', { detalle: { libreMb: 200 } });
    assert.equal((await b.avisador.pasada()).motivo, 'nada', 'la misma fila: no antes de 30 min');
    b.avanzar(30 * MINUTO);
    const r = await b.avisador.pasada();
    assert.deepEqual([r.enviado, r.suena], ['aviso', true]);
    // ia_tope: la parte d lo «re-arma» (reenviar) cuando pasa del 50 al 80 %.
    const tope = 'ia_tope:general:2026-11';
    b.abrir(tope, 'atencion', { detalle: { pct: 50 } });
    await b.avisador.pasada();
    b.avanzar(5 * MINUTO);
    b.abrir(tope, 'atencion', { detalle: { pct: 80 }, reenviar: true });
    assert.equal((await b.avisador.pasada()).motivo, 'nada');
    b.avanzar(30 * MINUTO);
    assert.equal((await b.avisador.pasada()).enviado, 'aviso');
    // Va y viene (no grave): se resuelve y vuelve en menos de 6 h → callado.
    b.abrir('memoria_baja', 'atencion');
    await b.avisador.pasada();
    resolverAviso(b.db, 'memoria_baja', b.t);
    b.avanzar(HORA);
    b.abrir('memoria_baja', 'atencion');
    const antes = mensajesDelChat(b).length;
    assert.equal((await b.avisador.pasada()).motivo, 'nada');
    assert.equal(mensajesDelChat(b).length, antes);
    assert.ok(b.db.prepare("SELECT 1 FROM canal_envios WHERE clave = 'memoria_baja' AND resultado = 'silenciado'").get());
    // Resuelto antes de mandarlo, o de hace más de 48 h: no va.
    b.abrir('trabajador_reinicios');
    resolverAviso(b.db, 'trabajador_reinicios', b.t);
    abrirAviso(b.db, { clave: 'copias_sin_clave', nivel: 'atencion', ahora: b.t - 49 * HORA });
    assert.equal((await b.avisador.pasada()).motivo, 'nada');
    assert.equal(mensajesDelChat(b).length, antes);
  });
});

test('2.10 topes: 10 por hora y 30 por día SOLO de avisos (50 partes de copias no cuentan); con 3 o más, uno que los junta', async () => {
  await conAvisador(async b => {
    const canal = b.db.prepare("SELECT id FROM canales WHERE estado = 'activo'").get().id;
    const poner = (clase, n) => {
      for (let i = 0; i < n; i++) b.db.prepare("INSERT INTO canal_envios (canal_id, clase, resultado, creado_en) VALUES (?, ?, 'enviado', ?)").run(canal, clase, iso(b.t - MINUTO));
    };
    poner('copia_parte', 50);
    b.abrir('disco_bajo');
    assert.equal((await b.avisador.pasada()).enviado, 'aviso', '50 partes de copias no cuentan');
    poner('aviso', 9); // con la de recién: 10 en la hora
    b.abrir('memoria_baja');
    assert.equal((await b.avisador.pasada()).motivo, 'tope');
    b.abrir('modo_seguro', 'grave');
    assert.equal((await b.avisador.pasada()).motivo, 'tope', 'lo grave tampoco pasa el tope: espera');
    b.avanzar(61 * MINUTO);
    b.abrir('trabajador_reinicios');
    // Ahora hay 3 pendientes (memoria, modo seguro, reinicios): van JUNTOS, y suena porque uno es grave.
    const r = await b.avisador.pasada();
    assert.deepEqual([r.enviado, r.suena, r.avisos.length], ['resumen', true, 3]);
    const ultimo = mensajesDelChat(b).at(-1);
    assert.match(ultimo.text, /^3 avisos de la app:/); // 0.12.3: sin «OPORTIA»
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM canal_envios WHERE resultado = 'agrupado'").get().n, 3);
    assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM avisos WHERE enviado_en IS NULL AND resuelto_en IS NULL').get().n, 0);
    // 30 por día.
    poner('aviso', 25);
    b.avanzar(61 * MINUTO);
    b.abrir('copias_sin_clave');
    assert.equal((await b.avisador.pasada()).motivo, 'tope');
  });
});

test('2.10 lo grave: «Ya se arregló» una vez; si vuelve, «Volvió a pasar» y suena; si vuelve 3 veces en 6 h, uno cada 30 min como mucho', async () => {
  await conAvisador(async b => {
    b.abrir('base_danada', 'grave');
    await b.avisador.pasada();
    resolverAviso(b.db, 'base_danada', b.t);
    b.avanzar(MINUTO);
    const cierre = await b.avisador.pasada();
    assert.equal(cierre.enviado, 'cierre');
    assert.match(mensajesDelChat(b).at(-1).text, /Ya se arregló/);
    assert.equal((await b.avisador.pasada()).motivo, 'nada', 'el cierre va una sola vez');
    b.avanzar(MINUTO);
    b.abrir('base_danada', 'grave');
    const otra = await b.avisador.pasada();
    assert.deepEqual([otra.enviado, otra.suena], ['aviso', true]);
    assert.match(mensajesDelChat(b).at(-1).text, /Volvió a pasar/);
    // Una tercera vez en menos de 6 h: se junta (no antes de 30 min desde el último).
    resolverAviso(b.db, 'base_danada', b.t);
    b.avanzar(MINUTO);
    await b.avisador.pasada(); // su «Ya se arregló»
    b.avanzar(MINUTO);
    b.abrir('base_danada', 'grave');
    assert.equal((await b.avisador.pasada()).motivo, 'nada');
    b.avanzar(30 * MINUTO);
    const junta = await b.avisador.pasada();
    assert.equal(junta.enviado, 'aviso');
    assert.match(mensajesDelChat(b).at(-1).text, /volvió a pasar 3 veces/);
    // Solo lo grave suena.
    const suenan = mensajesDelChat(b).filter(m => !m.silencioso);
    assert.ok(suenan.every(m => /URGENTE|Volvió a pasar/.test(m.text)), suenan.map(m => m.text.split('\n')[0]).join(' | '));
  });
});

test('2.10 errores de Telegram: 429 → pausa; 403 → «bloqueado» y telegram_falla; 401 → el token queda «no válido»; red caída → esperas 1, 5, 15 min; primero se manda, después se anota', async () => {
  await conAvisador(async b => {
    const canal = () => b.db.prepare('SELECT * FROM canales ORDER BY id DESC LIMIT 1').get();
    b.abrir('disco_bajo');
    b.falso.escena('sendMessage', 'limite', { segundos: 40 });
    assert.equal((await b.avisador.pasada()).motivo, 'limite');
    assert.ok(Date.parse(canal().pausa_hasta) >= b.t + 39_000);
    assert.equal(b.db.prepare('SELECT enviado_en FROM avisos WHERE clave = ?').get('disco_bajo').enviado_en, null, 'no se marcó: no se perdió');
    assert.equal((await b.avisador.pasada()).motivo, 'pausa');
    b.avanzar(41_000);
    b.falso.escena('sendMessage', 'error_502');
    assert.equal((await b.avisador.pasada()).motivo, 'error_servidor');
    assert.deepEqual([canal().fallos_seguidos, Date.parse(canal().pausa_hasta) - b.t], [1, MINUTO]);
    b.avanzar(MINUTO + 1);
    b.falso.escena('sendMessage', 'error_500');
    await b.avisador.pasada();
    assert.equal(Date.parse(canal().pausa_hasta) - b.t, 5 * MINUTO);
    b.avanzar(5 * MINUTO + 1);
    assert.equal((await b.avisador.pasada()).enviado, 'aviso', 'Telegram volvió');
    assert.equal(canal().fallos_seguidos, 0);
    // 403: el dueño bloqueó al bot.
    b.abrir('memoria_baja');
    b.falso.bloquear(CHAT);
    assert.equal((await b.avisador.pasada()).motivo, 'bloqueado');
    assert.equal(canal().estado, 'bloqueado');
    assert.equal(b.aviso('telegram_falla')?.nivel, 'atencion');
    // Se reintenta una vez por hora; cuando lo desbloquea, vuelve solo.
    b.falso.bloquear(CHAT, false);
    assert.equal((await b.avisador.pasada()).motivo, 'bloqueado');
    b.avanzar(HORA + 1);
    assert.equal((await b.avisador.pasada()).enviado, 'aviso');
    assert.deepEqual([canal().estado, b.aviso('telegram_falla')], ['activo', null]);
    // 401 suelto (ronda 3): una SOSPECHA. getMe pregunta otra vez y, como el token sirve, el aviso llega solo.
    const prueba = () => b.db.prepare("SELECT prueba FROM secretos WHERE uso = 'telegram_bot' AND estado = 'activa'").get().prueba;
    b.abrir('trabajador_reinicios');
    b.falso.escena('sendMessage', 'no_autorizado');
    assert.equal((await b.avisador.pasada()).motivo, 'clave_no_valida');
    assert.equal(prueba(), 'ok', 'un 401 suelto no marca el token');
    assert.equal(canal().pausa_motivo, 'clave_dudosa');
    assert.equal((await b.avisador.pasada()).enviado, 'aviso', 'getMe dijo que sirve: llegó');
    assert.equal(canal().pausa_motivo, null);
    // El token de verdad ya no sirve: solo después de DOS getMe seguidos con 401 queda «no válido».
    b.abrir('copias_disco_pronto');
    b.falso.escena('*', 'no_autorizado', { veces: 1000 });
    assert.equal((await b.avisador.pasada()).motivo, 'clave_no_valida');
    assert.equal((await b.avisador.pasada()).motivo, 'pausa', 'el primer getMe con 401: otra pregunta en 5 min');
    assert.equal(canal().pausa_motivo, 'clave_dudosa_1');
    assert.equal(prueba(), 'ok');
    b.avanzar(5 * MINUTO + 1);
    assert.equal((await b.avisador.pasada()).motivo, 'clave_no_valida');
    assert.equal(prueba(), 'clave_no_valida');
    assert.equal(JSON.parse(b.aviso('telegram_falla').detalle).motivo, 'clave');
    const pedidos = b.falso.pedidos.length;
    assert.equal((await b.avisador.pasada()).motivo, 'clave_no_valida', 'no vuelve a intentar con un token malo');
    assert.equal(b.falso.pedidos.length, pedidos, 'y no pregunta otra vez hasta dentro de una hora');
    // La base solo tiene los valores que conoce el código (migración 6 no tiene CHECK).
    for (const f of b.db.prepare('SELECT DISTINCT estado FROM canales').all()) assert.ok(ESTADOS_CANAL.includes(f.estado), f.estado);
    for (const f of b.db.prepare('SELECT DISTINCT clase, resultado FROM canal_envios').all()) assert.ok(CLASES_ENVIO.includes(f.clase) && RESULTADOS_ENVIO.includes(f.resultado), JSON.stringify(f));
    // El token nunca aparece en ninguna fila ni en ningún mensaje.
    for (const { name } of b.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()) {
      for (const f of b.db.prepare(`SELECT * FROM "${name}"`).all()) assert.ok(!JSON.stringify(f).includes(b.token), name);
    }
  });
});

// ---------- 2.11 En modo seguro, el aviso llega igual (lo manda el proceso web) ----------

test('2.11 con el trabajador en modo seguro, el aviso grave del modo seguro llega al chat', async () => {
  await conAvisador(async b => {
    ponerModoSeguro(b.db, { activo: true, origen: 'automatico', motivo: 'trabajador_inestable', ahora: b.t });
    const r = await b.avisador.pasada();
    assert.deepEqual([r.enviado, r.suena], ['aviso', true]);
    const m = mensajesDelChat(b).at(-1);
    assert.match(m.text, /🔴 URGENTE/); // 0.12.3: sin «OPORTIA»
    assert.match(m.text, /modo seguro/);
    // El temporizador de verdad también arranca y para sin trabar nada.
    const real = crearAvisador({ db: b.db, config: b.config, topes: { cadaMs: 20 } });
    real.iniciar();
    await new Promise(l => setTimeout(l, 60));
    await real.parar();
  });
});

// ---------- 2.8 La copia atrasada la revisa el proceso web ----------

test('2.8 copia_atrasada: recién configurado no avisa; 30 h sin copia (trabajador en modo seguro) → grave al chat; una copia buena lo cierra', async () => {
  await conAvisador(async b => {
    // Recién unido el chat y con clave: nada hasta 30 h después.
    assert.equal(copiaAtrasada(b.db, b.t).activo, false);
    b.avanzar(29 * HORA);
    await b.avisador.pasada();
    assert.equal(b.aviso('copia_atrasada'), null);
    ponerModoSeguro(b.db, { activo: true, origen: 'automatico', motivo: 'trabajador_inestable', ahora: b.t });
    b.avanzar(2 * HORA + 5 * MINUTO);
    await b.avisador.pasada(); // modo seguro (grave, primero)
    await b.avisador.pasada(); // copia atrasada
    const a = b.aviso('copia_atrasada');
    assert.equal(a?.nivel, 'grave');
    assert.equal(JSON.parse(a.detalle).modoSeguro, true);
    const m = mensajesDelChat(b).find(x => /30 horas/.test(x.text));
    assert.ok(m, 'llegó al chat');
    assert.match(m.text, /modo seguro/);
    assert.equal(m.silencioso, false);
    // Se quita el modo seguro y el trabajador hace la copia: se cierra (y llega «Ya se arregló»).
    ponerModoSeguro(b.db, { activo: false, origen: 'admin', ahora: b.t });
    b.nuevoEjecutor();
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.equal(b.aviso('copia_atrasada'), null);
    b.avanzar(6 * MINUTO);
    const textos = [];
    for (let i = 0; i < 3; i++) { const r = await b.avisador.pasada(); if (r.enviado) textos.push(mensajesDelChat(b).at(-1).text); }
    assert.ok(textos.some(t => /Ya se arregló/.test(t) && /Copias atrasadas/.test(t)), textos.join(' | '));
  });
});

test('2.8 vigilar: copias a medias con su tarea fallida → fallida (grave); sin tarea viva por 2 h → interrumpida; 90 días sin comprobar la clave → recordatorio', async () => {
  await conAvisador(async b => {
    const tarea = estado => b.db.prepare(`INSERT INTO tareas (tipo, carril_espacio, carril_proyecto, cupo, estado, datos, max_fallos, disponible_en, creada_en, actualizada_en, ultimo_error)
      VALUES ('copias.hacer', 'sistema', 'sistema', 'grande', ?, '{}', 3, ?, ?, ?, 'error_servidor')`).run(estado, iso(b.t), iso(b.t), iso(b.t)).lastInsertRowid;
    const llave = b.db.prepare("SELECT id FROM copias_llaves WHERE estado = 'activa'").get().id;
    const copia = (tareaId, estado, desde) => b.db.prepare(`INSERT INTO copias (copia, tarea_id, estado, llave_id, receptor, empezada_en) VALUES (?, ?, ?, ?, 'X', ?)`)
      .run(randomUUID(), tareaId, estado, llave, iso(desde)).lastInsertRowid;
    const a = copia(tarea('fallida'), 'escrita', b.t);
    const c = copia(tarea('cancelada'), 'subida', b.t - 3 * HORA);
    const d = copia(tarea('en_curso'), 'haciendo', b.t - 5 * HORA);
    const r = vigilarCopias(b.db, b.config, { ahora: b.t, libreMb: 50_000 });
    assert.deepEqual([r.fallidas, r.interrumpidas], [1, 1]);
    const estado = id => ({ ...b.db.prepare('SELECT estado, motivo FROM copias WHERE id = ?').get(id) });
    assert.deepEqual(estado(a), { estado: 'fallida', motivo: 'error_servidor' });
    assert.deepEqual(estado(c), { estado: 'interrumpida', motivo: 'tarea_cancelada' });
    assert.equal(estado(d).estado, 'haciendo', 'la de una tarea viva no se toca');
    assert.equal(b.aviso('copia_fallida')?.nivel, 'grave');
    assert.equal(b.aviso('copias_comprobar_clave'), null);
    vigilarCopias(b.db, b.config, { ahora: b.t + 91 * 24 * HORA, libreMb: 50_000 });
    assert.equal(b.aviso('copias_comprobar_clave')?.nivel, 'atencion');
    assert.deepEqual(vaPorTelegram(b.aviso('copias_comprobar_clave')), { va: true, suena: false });
  });
});

// ---------- 2.9 update.log y version.bad: solo se LEEN ----------

test('2.9 update.log: no se instaló → atención; no arrancó → grave; «actualizado a» lo cierra; la primera vez no avisa de lo viejo; una línea a medias espera; nunca se escribe', async () => {
  await conAvisador(async b => {
    const carpeta = b.config.carpetaDatos;
    const log = join(carpeta, 'update.log');
    const malo = join(carpeta, 'version.bad');
    const fecha = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
    writeFileSync(log, `${fecha(b.t - HORA)} versión 1111111: alguna prueba falló, NO se instaló\n`);
    // Sin archivos de antes: nada (y anota «desde ahora»).
    assert.deepEqual(leerActualizaciones(b.db, b.config, { ahora: b.t }), { abiertos: [], resueltos: [] });
    b.avanzar(MINUTO);
    const sha = 'abcdef1234567890abcdef1234567890abcdef12';
    writeFileSync(malo, `${sha}\n`);
    appendFileSync(log, `basura que no es una línea del actualizador\n${fecha(b.t)} versión abcdef1 no arrancó: volví a la anterior\n${fecha(b.t)} versión 2222222: alguna prueba falló, NO se instaló\n${fecha(b.t)} actualizado a 33333`);
    const antes = { log: readFileSync(log), malo: readFileSync(malo), mlog: statSync(log).mtimeMs, mmalo: statSync(malo).mtimeMs };
    const r = leerActualizaciones(b.db, b.config, { ahora: b.t + 1000 });
    assert.deepEqual(r.abiertos.sort(), ['actualizacion_no_instalada:2222222', 'actualizacion_revertida:abcdef1']);
    assert.equal(b.aviso('actualizacion_revertida:abcdef1').nivel, 'grave');
    assert.equal(JSON.parse(b.aviso('actualizacion_revertida:abcdef1').detalle).sha, sha);
    assert.equal(b.aviso('actualizacion_no_instalada:1111111'), null, 'lo de antes de la primera vez no se avisa');
    assert.equal(ultimaVersionMala(b.db), sha);
    // La línea a medias se termina de escribir: «actualizado a 3333333» cierra los dos.
    b.avanzar(MINUTO);
    appendFileSync(log, `33\n`);
    writeFileSync(log, `${readFileSync(log, 'utf8')}${fecha(b.t)} actualizado a 4444444\n`);
    const r2 = leerActualizaciones(b.db, b.config, { ahora: b.t + 1000 });
    assert.equal(r2.resueltos.length, 2);
    assert.equal(b.aviso('actualizacion_revertida:abcdef1'), null);
    // Nunca escribe en ellos (y si no se pueden leer, no pasa nada).
    assert.ok(readFileSync(malo).equals(antes.malo));
    assert.equal(statSync(malo).mtimeMs, antes.mmalo);
    chmodSync(log, 0o000);
    assert.doesNotThrow(() => leerActualizaciones(b.db, b.config, { ahora: b.t + 2000 }));
    chmodSync(log, 0o644);
    // Un archivo rotado (más corto, empieza de nuevo): solo cuentan las fechas nuevas.
    writeFileSync(log, `${fecha(b.t + 5 * MINUTO)} versión 5555555: alguna prueba falló, NO se instaló\n`);
    assert.deepEqual(leerActualizaciones(b.db, b.config, { ahora: b.t + 6 * MINUTO }).abiertos, ['actualizacion_no_instalada:5555555']);
  });
  assert.deepEqual(lineasDeActualizacion('2026-11-09T08:00:00-04:00 actualizado a 1234567\n2026-11-09T09:00:00-04:00 actualizado a 7654321'), [
    { tipo: 'actualizado', fecha: Date.parse('2026-11-09T12:00:00Z'), sha: '1234567' },
  ]);
});
