// Fase 1, parte e (paso 2): unir el chat del dueño (código de un uso), las rutas de Copias y del Telegram con un servidor
// de verdad (quién puede qué, topes, la clave SOLO en «Crear»), la base restaurada en un «servidor nuevo», la consola y
// el programa para restaurar (deploy/oportia-restaurar.mjs). Contra el Telegram FALSO; nunca internet ni un token real.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carpetaTemporal, conServidor, esperarHasta } from './ayuda.js';
import { montar, ponerToken, unirChat, revisarYConfirmar, segundoCodigo, verificadorDe, BOT, CHAT, EXTRANO, GRUPO, MINUTO, HORA, SILENCIO } from './copias-tarea-base.js';
import { capturarConsola } from './ia-base.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { ponerModoSeguro } from '../src/tareas/modo-seguro.js';
import { empezarVinculo, revisarVinculo, canalActual, ErrorCanal } from '../src/canales/canales.js';
import { restaurarCopia } from '../src/copias/restaurar.js';
import { normalizarClave } from '../src/copias/clave.js';
import { estadoAlmacen, listarSecretos } from '../src/claves/almacen.js';
import { empezarLlaveNueva } from '../src/claves/cifrado.js';
import { clavesGuardadas } from '../src/claves/almacen.js';
import { CLAVE_SERVIDOR } from '../src/copias/formato.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const OTRO_LOGIN = { 'Tailscale-User-Login': 'amigo@example.com' };
const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
const CLAVE_ENTRAR = 'una clave bien larga';

// ---------- 2.12 Unir el chat ----------

test('2.12 unir el chat: offset −1 y confirmar, la primera pregunta sin offset; «/start CÓDIGO» desde el chat privado une; un extraño, un grupo, un bot o un mensaje viejo no', async () => {
  const b = await montar({ telegram: false, relleno: 0 });
  try {
    await ponerToken(b);
    // Lo que había en la cola de antes (semanas) se confirma y se olvida.
    b.falso.escribir({ chat: CHAT, texto: 'un mensaje viejo' });
    const v = await empezarVinculo(b.db, b.config, {});
    assert.match(v.codigo, /^\d{8}$/);
    assert.equal(v.paraMostrar, `${v.codigo.slice(0, 4)} ${v.codigo.slice(4)}`);
    assert.equal(v.enlace, `https://t.me/${BOT.usuario}?start=${v.codigo}`);
    const lecturas = b.falso.pedidos.filter(p => p.metodo === 'getUpdates').map(p => p.params);
    assert.equal(lecturas[0].offset, -1);
    assert.equal(lecturas.length, 2, 'se confirmó lo que había');
    assert.equal(b.falso.pendientes(), 0);
    const pendiente = b.db.prepare("SELECT * FROM canales WHERE estado = 'pendiente'").get();
    assert.equal(pendiente.novedades_desde, null);
    assert.ok(!JSON.stringify(pendiente).includes(v.codigo), 'solo se guarda la huella del código');
    // Lo que NO une: un grupo, un bot, un extraño con otro código, un mensaje de antes del código (5 s de margen).
    b.falso.escribir({ chat: GRUPO, de: CHAT, texto: `/start ${v.codigo}` });
    b.falso.escribir({ chat: CHAT, texto: v.codigo, esBot: true });
    b.falso.escribir({ chat: CHAT, texto: v.codigo, fecha: Math.floor(Date.now() / 1000) - 60 });
    b.falso.escribir({ chat: EXTRANO, texto: 'hola bot' });
    assert.deepEqual(await revisarVinculo(b.db, b.config, { cadaMs: 0 }), { estado: 'esperando' });
    assert.equal(b.falso.pedidos.filter(p => p.metodo === 'getUpdates').at(-1).params.offset, undefined, 'la primera pregunta va sin offset');
    // Escrito a mano, con espacios: une.
    b.falso.escribir({ chat: CHAT, texto: ` ${v.paraMostrar} ` });
    const r = await revisarYConfirmar(b);
    assert.deepEqual(r, { estado: 'vinculado', chat: { nombre: 'Junior' } });
    const c = canalActual(b.db);
    assert.deepEqual([c.estado, c.destino, c.cuenta_id], ['activo', String(CHAT), String(BOT.id)]);
    // Al extraño nunca se le contestó; al dueño le llegó la bienvenida (suena).
    assert.equal(b.falso.mensajes.filter(m => m.chatId === String(EXTRANO)).length, 0);
    const bienvenida = b.falso.mensajes.filter(m => m.chatId === String(CHAT) && m.text?.startsWith('✅ Listo'));
    assert.equal(bienvenida.length, 1);
    assert.equal(bienvenida[0].silencioso, false);
  } finally {
    await b.cerrar();
  }
});

test('2.12 cinco códigos equivocados de un chat → ese chat ya no une; 50 en total → vencido; un código vencido no une; tras una semana sin mensajes (ids al azar, más bajos) igual une; un webhook → bot_ocupado', async () => {
  const b = await montar({ telegram: false, relleno: 0 });
  try {
    await ponerToken(b);
    let v = await empezarVinculo(b.db, b.config, {});
    for (let i = 0; i < 5; i++) b.falso.escribir({ chat: CHAT, texto: String(10_000_000 + i) });
    assert.deepEqual(await revisarVinculo(b.db, b.config, { cadaMs: 0 }), { estado: 'esperando' });
    b.falso.escribir({ chat: CHAT, texto: v.codigo });
    assert.equal((await revisarVinculo(b.db, b.config, { cadaMs: 0 })).estado, 'esperando', 'ese chat gastó sus 5 intentos: se ignora');
    assert.equal(canalActual(b.db), null);
    // 50 equivocados en total (10 chats × 5): el código vence.
    for (let c = 1; c <= 9; c++) for (let i = 0; i < 5; i++) b.falso.escribir({ chat: 5_560_000 + c, texto: String(20_000_000 + c * 10 + i) });
    for (let k = 0; k < 6; k++) await revisarVinculo(b.db, b.config, { cadaMs: 0 });
    assert.deepEqual(await revisarVinculo(b.db, b.config, { cadaMs: 0 }), { estado: 'vencido' });
    assert.equal(b.db.prepare('SELECT codigo_intentos FROM canales ORDER BY id DESC LIMIT 1').get().codigo_intentos, 50);
    b.falso.escribir({ chat: CHAT, texto: v.codigo });
    assert.equal((await revisarVinculo(b.db, b.config, { cadaMs: 0 })).estado, 'vencido', 'ya no sirve');
    // Uno nuevo que vence a los 10 minutos.
    v = await empezarVinculo(b.db, b.config, {});
    b.falso.escribir({ chat: CHAT, texto: v.codigo });
    assert.equal((await revisarVinculo(b.db, b.config, { cadaMs: 0, ahora: () => Date.now() + 11 * MINUTO })).estado, 'vencido');
    // Una semana sin nada: el próximo update_id sale al azar y MÁS BAJO; igual se encuentra (no se guardó un offset viejo).
    b.falso.escribir({ chat: EXTRANO, texto: 'algo' });
    v = await empezarVinculo(b.db, b.config, {});
    b.falso.escribir({ chat: CHAT, texto: `/start ${v.codigo}`, idsAlAzar: true });
    assert.equal((await revisarYConfirmar(b)).estado, 'vinculado');
    // Un bot que usa otro programa (webhook): no se toca, se avisa.
    b.falso.ponerWebhook(b.token, 'https://otro.example.com/gancho');
    await assert.rejects(empezarVinculo(b.db, b.config, {}), e => e instanceof ErrorCanal && e.clave === 'bot_ocupado');
    assert.equal(b.falso.pedidos.filter(p => /webhook/i.test(p.metodo) && p.metodo !== 'getWebhookInfo').length, 0, 'nunca se borra el webhook de nadie');
  } finally {
    await b.cerrar();
  }
});

test('2.12 unir otra vez reemplaza el chat anterior (desvinculado); un token de OTRO bot desvincula el chat; las preguntas a Telegram van como mucho cada 3 s', async () => {
  const b = await montar({ relleno: 0 });
  try {
    const primero = canalActual(b.db);
    await unirChat(b);
    assert.equal(b.db.prepare('SELECT estado, motivo FROM canales WHERE id = ?').get(primero.id).motivo, 'reemplazado');
    // Sin el «cada 3 s» de las pruebas: dos preguntas seguidas → una sola a Telegram.
    await empezarVinculo(b.db, b.config, {});
    const antes = b.falso.pedidos.filter(p => p.metodo === 'getUpdates').length;
    await Promise.all([revisarVinculo(b.db, b.config), revisarVinculo(b.db, b.config), revisarVinculo(b.db, b.config)]);
    await revisarVinculo(b.db, b.config);
    assert.equal(b.falso.pedidos.filter(p => p.metodo === 'getUpdates').length - antes, 1);
    // El dueño pega el token de otro bot: la prueba gratis pasa, y el chat (del bot viejo) queda desvinculado.
    await ponerToken(b, { token: b.token2 });
    assert.equal(canalActual(b.db), null);
    assert.ok(b.db.prepare("SELECT 1 FROM canales WHERE estado = 'desvinculado' AND motivo = 'bot_cambiado'").get());
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.13 / 2.19 Las rutas ----------

async function conPlataforma(fn, { disco = 100_000, limites = {} } = {}) {
  const b = await montar({ telegram: false, clave: false, relleno: 2 });
  const despertares = [];
  const supervisor = { despertar: () => despertares.push(1), estado: () => ({ fase: 'esperando' }) };
  b.disco.libre = disco;
  const servidor = crearServidor({ db: b.db, config: b.config, supervisor, copias: { medirDisco: () => b.disco.libre, limites } });
  try {
    await conServidor(servidor, async base => {
      const respuestas = [];
      const pedir = async (metodo, ruta, { datos, galleta, cabeceras = {} } = {}) => {
        const r = await fetch(`${base}${ruta}`, {
          method: metodo,
          headers: { 'X-Oportia': '1', ...(galleta ? { Cookie: galleta } : {}), ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
          body: datos !== undefined ? JSON.stringify(datos) : undefined,
        });
        const texto = await r.text();
        respuestas.push({ ruta, texto });
        let cuerpo = {};
        try { cuerpo = JSON.parse(texto); } catch { cuerpo = {}; }
        return { codigo: r.status, datos: cuerpo, cache: r.headers.get('cache-control'), galleta: r.headers.get('set-cookie')?.split(';')[0] ?? null, texto };
      };
      // La tabla de usuarios ya tiene a «junior» (montar): se entra con una contraseña de verdad.
      b.db.prepare('DELETE FROM sesiones').run?.();
      const { hashClave } = await import('../src/cuentas/claves.js');
      b.db.prepare('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?').run(await hashClave(CLAVE_ENTRAR), b.admin);
      const admin = (await pedir('POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE_ENTRAR }, cabeceras: DUENO })).galleta;
      assert.ok(admin);
      // La primera entrada a una ruta del dueño anota su cuenta de Tailscale.
      const comoDueno = (metodo, ruta, opciones = {}) => pedir(metodo, ruta, { galleta: admin, ...opciones, cabeceras: { ...DUENO, ...(opciones.cabeceras ?? {}) } });
      await comoDueno('GET', '/api/admin/claves');
      await fn({ b, pedir, admin, comoDueno, respuestas, despertares });
    });
  } finally {
    await b.cerrar();
  }
}

test('2.13 Copias: verlo es para cualquier administrador; la clave, solo el dueño desde su Tailscale; la clave sale SOLO en «Crear» (sin caché)', async () => {
  const consola = await capturarConsola(async () => {
    await conPlataforma(async ({ b, pedir, admin, comoDueno, respuestas }) => {
      assert.equal((await pedir('GET', '/api/admin/copias', { galleta: admin, cabeceras: FUNNEL })).codigo, 200, 'ver, también por el enlace público');
      assert.equal((await pedir('GET', '/api/admin/copias')).codigo, 401);
      const estado = (await comoDueno('GET', '/api/admin/copias')).datos;
      assert.deepEqual([estado.clave.activa, estado.puede.ahora, estado.puede.motivoNoAhora, estado.puede.crearClave], [false, false, 'sin_clave', true]);
      for (const ruta of ['/api/admin/copias/clave/nueva', '/api/admin/copias/clave/confirmar', '/api/admin/copias/clave/comprobar', '/api/admin/telegram/vincular', '/api/admin/telegram/prueba', '/api/admin/telegram/desvincular']) {
        for (const cabeceras of [FUNNEL, { ...DUENO, ...FUNNEL }]) {
          const r = await pedir('POST', ruta, { datos: {}, galleta: admin, cabeceras });
          assert.deepEqual([r.codigo, r.datos.error], [403, 'solo_desde_tailnet'], `${ruta} por el enlace público`);
        }
        const otro = await pedir('POST', ruta, { datos: {}, galleta: admin, cabeceras: OTRO_LOGIN });
        assert.deepEqual([otro.codigo, otro.datos.error], [403, 'solo_dueno_tailscale'], `${ruta} desde otra cuenta de Tailscale`);
      }
      // Crear: la ÚNICA respuesta con la clave, sin caché.
      const nueva = await comoDueno('POST', '/api/admin/copias/clave/nueva', { datos: {} });
      assert.equal(nueva.codigo, 201);
      assert.equal(nueva.cache, 'no-store');
      assert.match(nueva.datos.clave, /^[0-9A-Z]{4}(?:-[0-9A-Z]{4}){6}$/);
      const clave = nueva.datos.clave;
      // Confirmar: solo el verificador; la clave escrita en el pedido se rechaza.
      assert.deepEqual((await comoDueno('POST', '/api/admin/copias/clave/confirmar', { datos: { clave } })).datos.error, 'verificador_formato');
      assert.deepEqual((await comoDueno('POST', '/api/admin/copias/clave/confirmar', { datos: { verificador: 'x' } })).datos.error, 'verificador_formato');
      assert.deepEqual((await comoDueno('POST', '/api/admin/copias/clave/confirmar', { datos: { verificador: '0'.repeat(64) } })).datos.error, 'clave_no_coincide');
      const ok = await comoDueno('POST', '/api/admin/copias/clave/confirmar', { datos: { verificador: verificadorDe(clave) } });
      assert.equal(ok.codigo, 200);
      assert.equal(ok.datos.activa.huella, nueva.datos.huella);
      assert.deepEqual((await comoDueno('POST', '/api/admin/copias/clave/confirmar', { datos: { verificador: verificadorDe(clave) } })).datos.error, 'sin_pendiente');
      // Comprobar: la de ahora, una anterior, ninguna.
      const actual = await comoDueno('POST', '/api/admin/copias/clave/comprobar', { datos: { verificador: verificadorDe(clave) } });
      assert.deepEqual([actual.datos.resultado, actual.datos.huella], ['actual', nueva.datos.huella]);
      const otra = await comoDueno('POST', '/api/admin/copias/clave/nueva', { datos: {} });
      await comoDueno('POST', '/api/admin/copias/clave/confirmar', { datos: { verificador: verificadorDe(otra.datos.clave) } });
      const anterior = await comoDueno('POST', '/api/admin/copias/clave/comprobar', { datos: { verificador: verificadorDe(clave) } });
      assert.equal(anterior.datos.resultado, 'anterior');
      assert.ok(anterior.datos.hasta);
      assert.equal((await comoDueno('POST', '/api/admin/copias/clave/comprobar', { datos: { verificador: 'a'.repeat(64) } })).datos.resultado, 'no_es');
      const despues = (await comoDueno('GET', '/api/admin/copias')).datos;
      assert.deepEqual([despues.clave.huella, despues.clave.anteriores.map(a => a.huella)], [otra.datos.huella, [nueva.datos.huella]]);
      // La clave no está en NINGUNA otra respuesta ni en ninguna fila de la base.
      for (const k of [clave, otra.datos.clave]) {
        const formas = [k, normalizarClave(k)];
        for (const r of respuestas.filter(x => x.ruta !== '/api/admin/copias/clave/nueva')) assert.ok(!formas.some(f => r.texto.includes(f)), r.ruta);
        for (const { name } of b.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()) {
          for (const f of b.db.prepare(`SELECT * FROM "${name}"`).all()) assert.ok(!formas.some(x => JSON.stringify(f).includes(x)), `la tabla ${name}`);
        }
        b.claveVista = k;
      }
    });
  });
  // 2.19: nada de lo que se escribió en la consola lleva la clave.
  assert.ok(!/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.test(consola), 'la consola nunca muestra una clave');
});

test('2.13 «Hacer una copia ahora»: falta la clave / en pausa / disco lleno / sin destino → 409; si se puede, 202 y una sola viva; tope de 6 por hora; los del Telegram', async () => {
  await conPlataforma(async ({ b, pedir, admin, comoDueno, despertares }) => {
    const ahora = () => pedir('POST', '/api/admin/copias/ahora', { galleta: admin });
    assert.deepEqual([(await ahora()).codigo, (await ahora()).datos.error], [409, 'falta_clave']);
    const { ponerClave } = await import('./copias-tarea-base.js');
    ponerClave(b.db, { config: b.config });
    b.disco.libre = 250;
    assert.equal((await ahora()).datos.error, 'disco_lleno');
    b.disco.libre = 1000;
    assert.equal((await ahora()).datos.error, 'sin_destino', 'sin Telegram y sin lugar en el disco');
    b.disco.libre = 100_000;
    ponerModoSeguro(b.db, { activo: true, origen: 'admin' });
    assert.equal((await ahora()).datos.error, 'trabajo_en_pausa');
    ponerModoSeguro(b.db, { activo: false, origen: 'admin' });
    assert.equal((await ahora()).codigo, 202, 'la sexta en esta hora');
    const r = await ahora();
    assert.deepEqual([r.codigo, r.datos.error], [429, 'demasiados_intentos'], 'la séptima: el tope');
  });
  await conPlataforma(async ({ b, pedir, admin, comoDueno, despertares }) => {
    const { ponerClave } = await import('./copias-tarea-base.js');
    ponerClave(b.db, { config: b.config });
    const r = await pedir('POST', '/api/admin/copias/ahora', { galleta: admin, cabeceras: FUNNEL });
    assert.equal(r.codigo, 202, 'pedir una copia no gasta: también por el enlace público');
    assert.equal(despertares.length, 1);
    assert.equal((await pedir('POST', '/api/admin/copias/ahora', { galleta: admin })).datos.error, 'copia_en_marcha');
    const t = b.db.prepare("SELECT * FROM tareas WHERE tipo = 'copias.hacer'").all();
    assert.equal(t.length, 1);
    assert.deepEqual(JSON.parse(t[0].datos), { origen: 'manual' });
    assert.equal((await comoDueno('GET', '/api/admin/copias')).datos.puede.motivoNoAhora, 'en_marcha');
    // El Telegram desde las rutas: sin token → 409; con token: código, revisar, prueba, desvincular.
    assert.deepEqual((await comoDueno('POST', '/api/admin/telegram/vincular', { datos: {} })).datos.error, 'sin_token');
    const pegada = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'telegram_bot', valor: b.token } });
    assert.deepEqual([pegada.codigo, pegada.datos.prueba.motivo], [201, 'ok']);
    const v = await comoDueno('POST', '/api/admin/telegram/vincular', { datos: {} });
    assert.equal(v.codigo, 201);
    assert.equal(v.cache, 'no-store');
    assert.equal((await comoDueno('POST', '/api/admin/telegram/vincular/revisar', { datos: {} })).datos.estado, 'esperando');
    b.falso.escribir({ chat: CHAT, texto: `/start ${v.datos.codigo}` });
    await new Promise(l => setTimeout(l, 3100));
    // Ronda 3: el código solo no une. El bot le manda a ESE chat un segundo código, que se escribe en la pantalla.
    assert.deepEqual((await comoDueno('POST', '/api/admin/telegram/vincular/revisar', { datos: {} })).datos, { estado: 'confirmar', chat: { nombre: 'Junior' } });
    assert.equal((await comoDueno('GET', '/api/admin/claves')).datos.telegram.vinculo.porConfirmar.nombre, 'Junior');
    const mal = await comoDueno('POST', '/api/admin/telegram/vincular/confirmar', { datos: { codigo: '000000' === segundoCodigo(b.falso) ? '111111' : '000000' } });
    assert.deepEqual([mal.codigo, mal.datos.error], [400, 'codigo_no_coincide']);
    assert.deepEqual((await comoDueno('POST', '/api/admin/telegram/vincular/confirmar', { datos: { codigo: segundoCodigo(b.falso) } })).datos, { estado: 'vinculado', chat: { nombre: 'Junior' } });
    const claves = (await comoDueno('GET', '/api/admin/claves')).datos;
    assert.deepEqual([claves.telegram.listo, claves.telegram.chat.nombre, claves.telegram.bot.usuario], [true, 'Junior', BOT.usuario]);
    assert.ok(!JSON.stringify(claves).includes(b.token), 'el token nunca vuelve');
    assert.deepEqual((await comoDueno('POST', '/api/admin/telegram/prueba', { datos: {} })).datos, { motivo: 'ok' });
    assert.match(b.falso.mensajes.at(-1).text, /Mensaje de prueba/);
    const sistema = (await pedir('GET', '/api/admin/sistema', { galleta: admin })).datos;
    assert.deepEqual([sistema.telegram.listo, sistema.copias.tono], [true, 'mal']);
    assert.deepEqual((await comoDueno('POST', '/api/admin/telegram/desvincular', { datos: {} })).datos, { chat: { estado: 'desvinculado' } });
    assert.equal(canalActual(b.db), null);
    // El tope del mensaje de prueba: 5 cada 10 minutos.
    let ultimo;
    for (let i = 0; i < 6; i++) ultimo = await comoDueno('POST', '/api/admin/telegram/prueba', { datos: {} });
    assert.equal(ultimo.datos.error, 'demasiados_intentos');
  });
});

test('2.13 el tope de «Crear mi clave» (10 cada 10 min) y de «Hacer una copia ahora» (6 por hora)', async () => {
  await conPlataforma(async ({ b, pedir, admin, comoDueno }) => {
    let r;
    for (let i = 0; i < 11; i++) r = await comoDueno('POST', '/api/admin/copias/clave/nueva', { datos: {} });
    assert.deepEqual([r.codigo, r.datos.error], [429, 'demasiados_intentos']);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM copias_llaves WHERE estado = 'caducada'").get().n, 9, 'cada clave nueva deja la anterior sin confirmar como caducada');
    for (let i = 0; i < 7; i++) r = await pedir('POST', '/api/admin/copias/ahora', { galleta: admin });
    assert.deepEqual([r.codigo, r.datos.error], [429, 'demasiados_intentos']);
  });
});

// ---------- 2.15 La base restaurada en un servidor nuevo ----------

test('2.15 restaurada en un servidor NUEVO: las claves no se pueden leer (sin la llave), se empieza una llave nueva, se pega el token del mismo bot y la copia siguiente va al mismo chat', async () => {
  const b = await montar({ relleno: 4 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const carpeta = carpetaTemporal('servidor-nuevo');
    const config = { archivoBase: join(carpeta, 'datos', 'oportia.db'), carpetaCopias: join(carpeta, 'datos', 'oportia-copias'), carpetaDatos: join(carpeta, 'datos'), canalesBases: b.config.canalesBases };
    mkdirSync(config.carpetaDatos, { recursive: true });
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'telegram', token: b.token, chatId: String(CHAT) }, destino: config.archivoBase, carpetaTrabajo: join(carpeta, 'partes'), base: b.falso.url });
    assert.deepEqual(r.claves.telegram, true);
    assert.ok(!existsSync(join(config.carpetaDatos, 'oportia-llave-secretos')), 'la llave de las claves nunca viaja');
    const db = abrirBase(config);
    try {
      assert.deepEqual(estadoAlmacen(db, config), { listo: false, motivo: 'llave_falta' });
      assert.ok(listarSecretos(db, config).filter(u => u.activa).every(u => u.activa.legible === false), 'Claves dice «pégala otra vez»');
      assert.equal(empezarLlaveNueva(config, clavesGuardadas(db)).creada, true);
      // Ronda 3: el sello de la clave de recuperación iba envuelto con la llave del servidor VIEJO: aquí no se abre (nadie
      // con solo la base puede armar copias). La pantalla dice que la clave ya no sirve aquí; la parte 1f la vuelve a
      // envolver con la clave del dueño (reenvolverSello), y entonces las copias siguen con la MISMA clave.
      const { selloDe, llaveActiva: activaDe, estadoCopias, reenvolverSello } = await import('../src/copias/estado.js');
      const { estadoLlave } = await import('../src/claves/cifrado.js');
      assert.equal(selloDe(config, activaDe(db)), null);
      assert.deepEqual(estadoCopias(db, { huellaLlave: estadoLlave(config).huella }).clave.ilegible, { huella: activaDe(db).huella });
      assert.throws(() => reenvolverSello(db, config, { clave: 'AAAA-BBBB' }), e => ['clave_formato', 'clave_control'].includes(e.clave));
      assert.equal(reenvolverSello(db, config, { clave: b.claveTexto }).huella, activaDe(db).huella);
      assert.equal(estadoCopias(db, { huellaLlave: estadoLlave(config).huella }).clave.activa, true);
      const viejo = JSON.parse(b.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_SERVIDOR).valor).id;
      const nuevo = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_SERVIDOR).valor).id;
      assert.notEqual(nuevo, viejo, 'el servidor nuevo tiene otro id');
      // El mismo bot: el chat sigue unido (no hay que unirlo otra vez).
      const n = { ...b, db, config };
      await ponerToken(n);
      assert.equal(canalActual(db)?.estado, 'activo');
      n.nuevoEjecutor = b.nuevoEjecutor;
      const { crearEjecutor } = await import('../src/tareas/ejecutor.js');
      const { crearEscritor } = await import('../src/tareas/escritor.js');
      const { nuevaCorrida } = await import('../src/tareas/corridas.js');
      const { MANEJADORES } = await import('../src/tareas/manejadores.js');
      const { crearManejadorCopias } = await import('../src/copias/hacer.js');
      const { encolar } = await import('../src/tareas/cola.js');
      const ejecutor = crearEjecutor({
        db, config, corrida: nuevaCorrida(db, { version: '0.5.0' }), escritor: crearEscritor(db, { registro: SILENCIO }), programas: [],
        manejadores: { ...MANEJADORES, 'copias.hacer': crearManejadorCopias({ ...b.opcionesManejador, reloj: Date.now }) }, tiempos: { rssMaxMb: 1e9 },
        memoriaDisponibleMb: () => 1000, discoLibreMb: () => 100_000, log: SILENCIO,
      });
      const { id } = encolar(db, { tipo: 'copias.hacer', programa: 'copias.hacer', claveUnica: 'nueva', datos: { origen: 'manual' } });
      await esperarHasta(async () => { await ejecutor.ciclo(); return db.prepare('SELECT estado FROM tareas WHERE id = ?').get(id).estado === 'hecha'; }, { que: 'la copia del servidor nuevo', cada: 20 });
      await ejecutor.parar({ esperaMs: 0 });
      const ultima = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 1').get();
      assert.deepEqual([ultima.estado, ultima.servidor], ['verificada', nuevo]);
      assert.equal(b.falso.fijado(CHAT), ultima.indice_mensaje_id, 'al mismo chat, y fijada');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM copias WHERE estado = 'interrumpida' AND motivo = 'restaurada'").get().n, 1, 'la copia que estaba haciéndose en la foto');
    } finally {
      db.close();
    }
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.14 La consola y el programa para restaurar ----------

function consola(config, ...argumentos) {
  return spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs', ...argumentos], {
    cwd: RAIZ, encoding: 'utf8', timeout: 20000,
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', OPORTIA_ENV_FILE: join(config.carpetaDatos, 'no-hay.env'), OPORTIA_DB: config.archivoBase, OPORTIA_COPIAS: config.carpetaCopias, OPORTIA_DATOS: config.carpetaDatos },
  });
}

test('2.14 la consola: --copias=estado, --copias=ahora y --telegram=desvincular (nada se borra)', async () => {
  const b = await montar({ relleno: 2 });
  try {
    let r = consola(b.config, '--copias=estado');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Clave de recuperación: [0-9A-Z]{4}/);
    assert.match(r.stdout, /Telegram: chat de Junior/);
    assert.match(r.stdout, /Nunca se borra ninguna copia/);
    r = consola(b.config, '--copias=ahora');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /quedó en la fila/);
    assert.match(consola(b.config, '--copias=ahora').stdout, /Ya hay una copia/);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'copias.hacer'").get().n, 1);
    r = consola(b.config, '--telegram=desvincular');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(canalActual(b.db), null);
    assert.ok(b.db.prepare("SELECT 1 FROM canales WHERE estado = 'desvinculado' AND motivo = 'consola'").get());
    assert.equal(consola(b.config, '--copias=nada').status, 2);
  } finally {
    await b.cerrar();
  }
});

// El programa para restaurar, como lo usa Claude en la Consola: la clave (y el token) por la entrada, nunca en la orden.
// abierta: la entrada queda abierta (alSalir escribe lo que falta en hijo.stdin y la cierra).
function restaurar(argumentos, { entrada = '', env = {}, alSalir = null, abierta = false } = {}) {
  return new Promise(listo => {
    const hijo = spawn(process.execPath, ['--no-warnings', 'deploy/oportia-restaurar.mjs', ...argumentos], {
      cwd: RAIZ, env: { PATH: process.env.PATH, OPORTIA_TEST: '1', ...env }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    hijo.stdout.on('data', d => { stdout += d; alSalir?.(stdout, hijo); });
    hijo.stderr.on('data', d => { stderr += d; });
    const reloj = setTimeout(() => hijo.kill('SIGKILL'), 60_000);
    hijo.on('close', status => { clearTimeout(reloj); listo({ status, stdout, stderr }); });
    if (abierta) hijo.stdin.write(entrada);
    else hijo.stdin.end(entrada);
  });
}

test('2.14 oportia-restaurar.mjs desde los archivos: la clave por la entrada; --comprobar; --json; los códigos de salida; nunca la clave en la orden; nunca pisa', async () => {
  const b = await montar({ relleno: 4, telegram: false });
  try {
    b.t = Date.now() - 3 * 24 * HORA; // una copia de hace 3 días
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const carpeta = join(b.config.carpetaCopias, 'cifradas');
    const destino = join(carpetaTemporal('cli'), 'recuperada.db');
    // Una copia vieja pregunta: «no» → 8, nada escrito.
    let r = await restaurar([`--archivos=${carpeta}`, `--destino=${destino}`], { entrada: `${b.claveTexto}\nno\n` });
    assert.equal(r.status, 8, r.stderr);
    assert.match(r.stdout, /Esta copia es de hace 3 días/);
    assert.ok(!existsSync(destino));
    // «sí» → la recupera (y dice qué hay que pegar otra vez). --json al final.
    r = await restaurar([`--archivos=${carpeta}`, `--destino=${destino}`, '--json'], { entrada: `${b.claveTexto}\nsí\n` });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /La clave corresponde/);
    assert.match(r.stdout, /Base recuperada: .*revisada: bien/);
    const final = JSON.parse(r.stdout.trim().split('\n').at(-1));
    assert.deepEqual([final.ok, final.autentica], [true, 'indice+flujo']);
    assert.ok(existsSync(destino));
    assert.ok(!r.stdout.includes(b.claveTexto) && !r.stderr.includes(b.claveTexto), 'la clave nunca se muestra');
    // Nunca pisa: el destino ya existe → 5.
    assert.equal((await restaurar([`--archivos=${carpeta}`, `--destino=${destino}`], { entrada: `${b.claveTexto}\nsí\n` })).status, 5);
    // --comprobar: sin destino, nada escrito.
    r = await restaurar([`--archivos=${carpeta}`, '--comprobar'], { entrada: `${b.claveTexto}\nsí\n` });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No se escribió ninguna base/);
    // Otra clave (válida, pero no la de esta copia) → 3; una mal escrita → 3.
    const { crearClave } = await import('../src/copias/clave.js');
    assert.equal((await restaurar([`--archivos=${carpeta}`, '--comprobar'], { entrada: `${crearClave().texto}\n` })).status, 3);
    assert.equal((await restaurar([`--archivos=${carpeta}`, '--comprobar'], { entrada: 'ABCD-EFGH\n' })).status, 3);
    // La clave en la orden: se rechaza sin leerla (2). Opciones que faltan: 2.
    r = await restaurar([`--archivos=${carpeta}`, '--comprobar', `--clave=${b.claveTexto}`]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /NUNCA van en la orden/);
    assert.equal((await restaurar(['--comprobar'])).status, 2);
    assert.equal((await restaurar([`--archivos=${carpeta}`])).status, 2);
    // Como root (fuera del modo de prueba) no corre.
    if (process.getuid?.() === 0) {
      const raiz = await new Promise(listo => {
        const hijo = spawn(process.execPath, ['--no-warnings', 'deploy/oportia-restaurar.mjs', `--archivos=${carpeta}`, '--comprobar'], { cwd: RAIZ, env: { PATH: process.env.PATH } });
        let err = '';
        hijo.stderr.on('data', d => { err += d; });
        hijo.on('close', status => listo({ status, err }));
        hijo.stdin.end();
      });
      assert.equal(raiz.status, 2);
      assert.match(raiz.err, /No lo ejecutes como root/);
    }
  } finally {
    await b.cerrar();
  }
});

test('2.14 oportia-restaurar.mjs por Telegram: el token por la entrada, el código de un uso (un extraño que escribe a la vez se ignora) y «¿es tu chat?»', async () => {
  const b = await montar({ relleno: 4 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const destino = join(carpetaTemporal('cli-telegram'), 'recuperada.db');
    let escrito = false;
    let confirmado = false;
    const r = await restaurar(['--telegram', `--destino=${destino}`], {
      entrada: `${b.token}\nsí\n`, abierta: true,
      env: { OPORTIA_TELEGRAM_URL: b.falso.url },
      alSalir: (texto, hijo) => {
        const m = /este código: (\d{4} \d{4})/.exec(texto);
        if (m && !escrito) {
          escrito = true;
          b.falso.escribir({ chat: EXTRANO, texto: 'hola, ¿me das una copia?' });
          b.falso.escribir({ chat: EXTRANO, texto: '1234 5678' });
          b.falso.escribir({ chat: CHAT, texto: m[1] });
        }
        // Ronda 3: el bot le mandó a ese chat un segundo código; el dueño lo escribe (primero uno equivocado).
        if (!confirmado && /código de 6 cifras que te mandó el bot/.test(texto)) {
          confirmado = true;
          const bueno = segundoCodigo(b.falso);
          hijo.stdin.end(`${bueno === '000000' ? '111111' : '000000'}\n${bueno}\n${b.claveTexto}\n`);
        }
      },
    });
    assert.match(r.stdout, /Ese no es el código/);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`@${BOT.usuario}`));
    assert.match(r.stdout, /Encontré el chat de Junior/);
    assert.match(r.stdout, /token del bot/);
    assert.ok(existsSync(destino));
    assert.equal(b.falso.mensajes.filter(m => m.chatId === String(EXTRANO)).length, 0, 'al extraño no se le contesta');
    assert.ok(!r.stdout.includes(b.token) && !r.stderr.includes(b.token), 'el token nunca se muestra');
    // «no es mi chat» → 8.
    const otro = join(carpetaTemporal('cli-telegram'), 'otra.db');
    let escrito2 = false;
    const no = await restaurar(['--telegram', `--destino=${otro}`], {
      entrada: `${b.token}\nno\n`, env: { OPORTIA_TELEGRAM_URL: b.falso.url },
      alSalir: texto => { const m = /este código: (\d{4} \d{4})/.exec(texto); if (m && !escrito2) { escrito2 = true; b.falso.escribir({ chat: CHAT, texto: m[1] }); } },
    });
    assert.equal(no.status, 8);
    assert.ok(!existsSync(otro));
  } finally {
    await b.cerrar();
  }
});
