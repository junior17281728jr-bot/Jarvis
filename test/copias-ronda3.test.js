// Fase 1, parte e — ronda 3 del equipo rojo. Una prueba por cada problema confirmado:
//  1. un TEXT con un carácter NUL (o bytes que no son UTF-8) vuelve IGUAL, byte por byte, después de restaurar;
//  2. una copia más nueva y completa cuyo índice no se pudo escribir se ofrece primero (nunca la de la noche anterior);
//  3. quien tiene el token y repite el código del dueño desde SU chat nunca une su chat (falta el segundo código);
//  4. con solo la base (sin la llave de las claves) nadie puede armar una copia que restaurar acepte;
//  5. un 401 suelto (o un 404 a getMe) nunca deja mudos los avisos ni las copias para siempre;
//  6. una tormenta de 429 frena cada vez más y lo dice (telegram_falla «limite»);
//  7. la primera lectura de update.log avisa de una vuelta atrás de minutos antes;
//  8. un mensaje que quizás llegó (se cortó la respuesta) no suena otra vez cada hora y cuenta para los topes;
//  9. una línea de update.log con hora de antes de la última vista igual se avisa.
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, fsyncSync, mkdtempSync, openSync, readdirSync, writeFileSync, appendFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { carpetaTemporal, configDePrueba } from './ayuda.js';
import { montar, ponerToken, segundoCodigo, unirChat, CHAT, EXTRANO, BOT, MINUTO, HORA } from './copias-tarea-base.js';
import { hacerCopia, CLAVE_DE_PRUEBA, llavesDePrueba } from './copias-base.js';
import { abrirBase } from '../src/nucleo/db.js';
import { textoDe } from '../src/nucleo/http.js';
import { crearPrimerAdmin } from '../src/cuentas/usuarios.js';
import { espacioDe, crearProyecto } from '../src/proyectos/proyectos.js';
import { restaurarCopia } from '../src/copias/restaurar.js';
import { leerClave, derivar } from '../src/copias/clave.js';
import { TELEGRAM } from '../src/canales/telegram.js';
import { crearCredencial } from '../src/canales/credencial.js';
import {
  canalActual, empezarVinculo, revisarVinculo, confirmarVinculo, estadoTelegram, ErrorCanal, enviadosDesde,
} from '../src/canales/canales.js';
import { crearAvisador } from '../src/canales/avisador.js';
import { abrirAviso } from '../src/avisos/avisos.js';
import { leerActualizaciones } from '../src/copias/vigilar.js';

const DIA = 24 * HORA;
const deChat = (b, chat = CHAT) => b.falso.mensajes.filter(m => m.chatId === String(chat) && m.text && !m.text.startsWith('✅ Listo') && !m.text.startsWith('🔐'));

// ---------- 1. TEXT con NUL o con bytes que no son UTF-8 ----------

test('ronda 3 (1): unas instrucciones con un NUL (y textos que no son UTF-8, o con BOM) vuelven iguales byte por byte; la entrada ya no deja pasar el NUL', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const id = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x' });
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  const instrucciones = JSON.parse('{"i":"Buscar trabajos de contabilidad en Santiago\\u0000 y en La Vega, salario desde 30000"}').i;
  crearProyecto(db, { espacio: espacioDe(db, usuario), usuarioId: id, instrucciones });
  // Lo que solo se escribe con SQL a mano: bytes que no son UTF-8, una mitad de surrogate, un BOM al principio, vacío.
  db.exec(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES
    ('raro.no_utf8', CAST(x'ff80c0' AS TEXT), 'x'), ('raro.surrogate', CAST(x'eda080' AS TEXT), 'x'),
    ('raro.cortado', CAST(x'f09f9841' AS TEXT), 'x'), ('raro.bom', CAST(x'efbbbf686f6c61' AS TEXT), 'x'), ('raro.vacio', '', 'x')`);
  const carpeta = carpetaTemporal('nul');
  await hacerCopia({ config, carpeta });
  const destino = join(carpetaTemporal('nul-destino'), 'r.db');
  const r = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino });
  assert.equal(r.ok, true);
  const q = "SELECT hex(instrucciones) AS h, typeof(instrucciones) AS t FROM proyecto_versiones ORDER BY id";
  const raros = "SELECT clave, hex(valor) AS h, typeof(valor) AS t FROM ajustes WHERE clave LIKE 'raro.%' ORDER BY clave";
  const nueva = new DatabaseSync(destino, { readOnly: true });
  try {
    assert.deepEqual(nueva.prepare(q).all(), db.prepare(q).all(), 'las instrucciones vuelven enteras (con lo de después del NUL)');
    assert.match(nueva.prepare(q).get().h, /53616E746961676F00207920656E204C61205665676124?/i);
    assert.deepEqual(nueva.prepare(raros).all(), db.prepare(raros).all(), 'los bytes que no son UTF-8 vuelven iguales, como TEXT');
  } finally {
    nueva.close();
    db.close();
  }
  // La entrada de las pantallas ya no deja pasar el NUL.
  assert.equal(textoDe({ i: 'Santiago\u0000 y La Vega' }, 'i'), 'Santiago y La Vega');
});

// ---------- 2. Una copia más nueva sin su índice ----------

test('ronda 3 (2): el disco no deja escribir el índice de la noche 2: restaurar desde la carpeta ofrece la noche 2 (completa), con la de índice como «la otra»', async () => {
  let fallarIndice = false;
  const b = await montar({
    telegram: false, relleno: 4,
    manejador: {
      escribirArchivo: (ruta, datos) => {
        if (fallarIndice && ruta.endsWith('-indice.txt')) { const e = new Error('no space left on device'); e.code = 'ENOSPC'; throw e; }
        const fd = openSync(ruta, 'wx', 0o640);
        try { writeSync(fd, datos); fsyncSync(fd); } finally { closeSync(fd); }
      },
    },
  });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const noche1 = b.copias().at(-1);
    b.avanzar(DIA);
    b.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('dato.de.hoy', '\"lo que Junior hizo hoy\"', 'x')").run();
    fallarIndice = true;
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const noche2 = b.copias().at(-1);
    assert.equal(noche2.estado, 'solo_local');
    const carpeta = join(b.config.carpetaCopias, 'cifradas');
    assert.equal(readdirSync(carpeta).flatMap(m => readdirSync(join(carpeta, m))).filter(n => n.endsWith('-indice.txt')).length, 1, 'solo la noche 1 tiene índice');
    let pregunta = null;
    const destino = join(carpetaTemporal('sin-indice'), 'r.db');
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino, alElegir: async e => { pregunta = e; return true; } });
    assert.equal(r.copia, noche2.copia, 'la más nueva');
    assert.equal(r.autentica, 'flujo');
    assert.deepEqual([pregunta.sinIndice, pregunta.otraCandidata?.copia, pregunta.otraCandidata?.motivo, pregunta.hayMasNueva], [true, noche1.copia, 'con_indice_mas_vieja', null]);
    const d = new DatabaseSync(destino, { readOnly: true });
    try { assert.ok(d.prepare("SELECT 1 FROM ajustes WHERE clave = 'dato.de.hoy'").get(), 'con el dato de hoy'); } finally { d.close(); }
  } finally {
    await b.cerrar();
  }
});

// ---------- 3. El código del dueño repetido desde otro chat ----------

test('ronda 3 (3): quien tiene el token lee el código del dueño, lo confirma antes que OPORTIA y lo manda desde SU chat: su chat nunca queda unido', async () => {
  const b = await montar({ telegram: false, relleno: 0 });
  try {
    await ponerToken(b);
    const v = await empezarVinculo(b.db, b.config, {});
    b.falso.escribir({ chat: CHAT, texto: `/start ${v.codigo}` });
    // El que tiene el token lee los mensajes del bot y los confirma (OPORTIA ya no los ve).
    const ladron = crearCredencial({ token: b.token, base: b.falso.url });
    const leido = await TELEGRAM.recibir(ladron, { desde: null, limite: 10 });
    const codigo = leido.mensajes.find(m => m.chat.id === String(CHAT)).texto.replace('/start ', '');
    await TELEGRAM.recibir(ladron, { desde: leido.siguiente, limite: 10 });
    b.falso.escribir({ chat: EXTRANO, texto: codigo });
    const r = await revisarVinculo(b.db, b.config, { cadaMs: 0 });
    assert.deepEqual(r, { estado: 'confirmar', chat: { nombre: 'Extraño' } });
    assert.equal(canalActual(b.db), null, 'todavía nada unido: falta el segundo código');
    // El segundo código le llegó al chat del extraño (no al del dueño): el dueño no lo tiene.
    assert.ok(segundoCodigo(b.falso, EXTRANO));
    assert.equal(segundoCodigo(b.falso, CHAT), null);
    // El dueño no tiene ese código: 5 intentos y se anula. Nada quedó unido; no sale nada a ningún chat.
    for (let i = 0; i < 4; i++) {
      await assert.rejects(confirmarVinculo(b.db, b.config, { codigo: String(100000 + i) === segundoCodigo(b.falso, EXTRANO) ? '999999' : String(100000 + i) }),
        e => e instanceof ErrorCanal && e.clave === 'codigo_no_coincide' && e.http === 400);
    }
    await assert.rejects(confirmarVinculo(b.db, b.config, { codigo: segundoCodigo(b.falso, EXTRANO) === '123456' ? '654321' : '123456' }), e => e.clave === 'codigo_intentos');
    await assert.rejects(confirmarVinculo(b.db, b.config, { codigo: segundoCodigo(b.falso, EXTRANO) }), e => e.clave === 'codigo_vencido', 'anulado: ni el bueno sirve');
    assert.equal(canalActual(b.db), null);
    assert.equal(deChat(b, EXTRANO).length, 0, 'al extraño no le llegó ninguna bienvenida ni aviso');
    // El dueño, de nuevo y sin nadie en medio: su chat se une con el segundo código que le llegó a ÉL.
    await unirChat(b);
    assert.equal(canalActual(b.db).destino, String(CHAT));
    // Pega un token nuevo del MISMO bot (después de revocar): la pantalla dice qué chat sigue unido y ofrece unirlo otra vez.
    assert.equal(estadoTelegram(b.db, b.config).chat.tokenNuevo, false);
    b.t = Date.now() + 2000;
    await new Promise(listo => setTimeout(listo, 5));
    await ponerToken(b);
    const e = estadoTelegram(b.db, b.config);
    assert.deepEqual([e.chat.estado, e.chat.tokenNuevo], ['activo', true]);
  } finally {
    await b.cerrar();
  }
});

// ---------- 4. Copias falsas armadas con solo la base ----------

test('ronda 3 (4): la base nunca guarda el sello en claro: con lo que hay en la base (y el token) nadie arma una copia que restaurar acepte', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const semilla = leerClave(b.claveTexto);
    const real = derivar(semilla);
    const selloReal = real.sello.toString('hex');
    // Ninguna fila de ninguna tabla tiene el sello en claro.
    for (const { name } of b.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()) {
      for (const f of b.db.prepare(`SELECT * FROM "${name}"`).all()) assert.ok(!JSON.stringify(f).toLowerCase().includes(selloReal), name);
    }
    const fila = b.db.prepare("SELECT publica, sello, huella FROM copias_llaves WHERE estado = 'activa'").get();
    assert.match(fila.sello, /^env1\.[0-9a-f]{16}\./, 'envuelto con la llave de las claves');
    // El atacante arma su propia base y la copia con la llave pública del dueño y lo que encontró como «sello».
    const atacante = configDePrueba();
    const dbAtacante = abrirBase(atacante);
    crearPrimerAdmin(dbAtacante, { nombre: 'atacante', claveHash: 'y' });
    dbAtacante.close();
    const carpeta = carpetaTemporal('falsa');
    const llaves = { ...llavesDePrueba(), publica: Buffer.from(fila.publica, 'base64url'), sello: Buffer.from(fila.sello, 'utf8'), huella: fila.huella };
    await hacerCopia({ config: atacante, carpeta, llaves });
    await assert.rejects(restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null }),
      e => ['indice_no_autentico', 'copia_no_autentica'].includes(e.clave));
    real.sello.fill(0);
    real.verificador.fill(0);
  } finally {
    await b.cerrar();
  }
});

// ---------- 5. Un 401 suelto ----------

test('ronda 3 (5): un solo 401 a sendMessage y después Telegram bien: los avisos y las copias a Telegram vuelven solos', async () => {
  const b = await montar({ relleno: 4 });
  try {
    const av = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    b.falso.escena('sendMessage', 'no_autorizado');
    abrirAviso(b.db, { clave: 'disco_bajo', nivel: 'atencion', detalle: { libreMb: 900 }, ahora: b.t });
    assert.equal((await av.pasada()).motivo, 'clave_no_valida');
    const inicio = b.t;
    while (b.t - inicio < 2 * HORA) { await av.pasada(); b.avanzar(MINUTO); }
    abrirAviso(b.db, { clave: 'base_danada', nivel: 'grave', detalle: {}, ahora: b.t });
    for (let i = 0; i < 10; i++) { await av.pasada(); b.avanzar(MINUTO); }
    assert.ok(deChat(b).some(m => /URGENTE/.test(m.text)), 'lo grave llegó');
    assert.equal(b.db.prepare("SELECT prueba FROM secretos WHERE uso = 'telegram_bot' AND estado = 'activa'").get().prueba, 'ok', 'el token sigue bien');
    assert.ok(b.falso.pedidos.filter(p => p.metodo === 'getMe').length >= 1, 'se preguntó con getMe');
    const subidasAntes = b.falso.pedidos.filter(p => p.metodo === 'sendDocument').length;
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.equal(b.copias().at(-1).estado, 'verificada');
    assert.ok(b.falso.pedidos.filter(p => p.metodo === 'sendDocument').length > subidasAntes, 'la copia subió');
  } finally {
    await b.cerrar();
  }
});

test('ronda 3 (5b): un solo 404 a getMe en la copia de la noche: el token no queda marcado y la copia llega a Telegram', async () => {
  const b = await montar({ relleno: 4 });
  try {
    b.falso.escena('getMe', 'no_existe');
    const av = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    const id = b.pedir();
    // Mientras la copia espera (10 min), el que manda avisos pregunta otra vez con getMe y quita la sospecha.
    let t;
    for (let i = 0; i < 40; i++) {
      await b.ejecutor.ciclo();
      await new Promise(listo => setTimeout(listo, 5));
      t = b.tarea(id);
      if (['hecha', 'fallida', 'revisar'].includes(t.estado)) break;
      await av.pasada();
      b.avanzar(MINUTO);
    }
    t = await b.terminar(id);
    assert.equal(t.estado, 'hecha');
    assert.equal(b.copias().at(-1).estado, 'verificada', 'la copia llegó a Telegram');
    assert.equal(b.db.prepare("SELECT prueba FROM secretos WHERE uso = 'telegram_bot' AND estado = 'activa'").get().prueba, 'ok');
  } finally {
    await b.cerrar();
  }
});

// ---------- 6. Una tormenta de 429 ----------

test('ronda 3 (6): 24 h de 429 con retry_after 5: pocas preguntas, telegram_falla «limite» y la pantalla dice que no llega', async () => {
  const b = await montar({ relleno: 0 });
  try {
    let intentos = 0;
    const adaptador = { ...TELEGRAM, async enviarTexto() { intentos++; return { motivo: 'limite', esperarMs: 5000 }; } };
    const av = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj, adaptador });
    abrirAviso(b.db, { clave: 'base_danada', nivel: 'grave', detalle: {}, ahora: b.t });
    const inicio = b.t;
    while (b.t - inicio < DIA) { await av.pasada(); b.avanzar(15_000); }
    assert.ok(intentos <= 40, `${intentos} pedidos en 24 h`);
    assert.equal(JSON.parse(b.aviso('telegram_falla').detalle).motivo, 'limite');
    const e = estadoTelegram(b.db, b.config, { ahora: b.t });
    assert.deepEqual([e.listo, e.motivo], [false, 'limite']);
    // Telegram vuelve: el aviso grave llega y todo vuelve a la normalidad.
    const bien = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj });
    for (let i = 0; i < 8 && !deChat(b).some(m => /URGENTE/.test(m.text)); i++) { b.avanzar(10 * MINUTO); await bien.pasada(); }
    assert.ok(deChat(b).some(m => /URGENTE/.test(m.text)));
    assert.equal(b.aviso('telegram_falla'), null);
  } finally {
    await b.cerrar();
  }
});

// ---------- 7 y 9. update.log ----------

const lineaLog = (ms, txt) => `${new Date(ms).toISOString().slice(0, 19)}+00:00 ${txt}\n`;
function baseConLog() {
  const c = configDePrueba();
  const config = { ...c, carpetaDatos: dirname(c.archivoBase) };
  return { db: abrirBase(config), config, log: join(config.carpetaDatos, 'update.log') };
}

test('ronda 3 (7): la primera lectura (minuto 7) avisa de la vuelta atrás de las :02, después de instalar 0.5.0 a las :30; nunca lo de antes', () => {
  const { db, config, log } = baseConLog();
  try {
    const t = Date.parse('2026-11-10T14:07:00Z');
    writeFileSync(log, lineaLog(t - 3 * HORA, 'versión 9999999: alguna prueba falló, NO se instaló') + lineaLog(t - 37 * MINUTO, 'actualizado a aaaaaaa')
      + lineaLog(t - 5 * MINUTO, 'versión bbbbbbb no arrancó: volví a la anterior'));
    writeFileSync(join(config.carpetaDatos, 'version.bad'), `${'b'.repeat(40)}\n`);
    assert.deepEqual(leerActualizaciones(db, config, { ahora: t }).abiertos, ['actualizacion_revertida:bbbbbbb']);
    assert.equal(db.prepare("SELECT nivel FROM avisos WHERE clave = 'actualizacion_revertida:bbbbbbb'").get().nivel, 'grave');
    assert.equal(db.prepare("SELECT 1 FROM avisos WHERE clave LIKE 'actualizacion_no_instalada:%'").get(), undefined, 'lo de antes de la instalación no se avisa');
    assert.deepEqual(leerActualizaciones(db, config, { ahora: t + HORA }).abiertos, [], 'nada dos veces');
    // Sin línea «actualizado a»: empieza cuando arrancó el proceso.
    const otra = baseConLog();
    writeFileSync(otra.log, lineaLog(t - 2 * HORA, 'versión 1111111: alguna prueba falló, NO se instaló') + lineaLog(t - 4 * MINUTO, 'versión 2222222: alguna prueba falló, NO se instaló'));
    assert.deepEqual(leerActualizaciones(otra.db, otra.config, { ahora: t, arranque: t - 10 * MINUTO }).abiertos, ['actualizacion_no_instalada:2222222']);
    otra.db.close();
  } finally {
    db.close();
  }
});

test('ronda 3 (9): una línea con hora de antes de la última vista (el reloj se corrigió) igual se avisa, una sola vez', () => {
  const { db, config, log } = baseConLog();
  try {
    const t = Date.parse('2026-11-10T14:07:00Z');
    writeFileSync(log, '');
    leerActualizaciones(db, config, { ahora: t });
    appendFileSync(log, lineaLog(t + 43 * MINUTO, 'versión ccccccc: alguna prueba falló, NO se instaló'));
    assert.deepEqual(leerActualizaciones(db, config, { ahora: t + HORA }).abiertos, ['actualizacion_no_instalada:ccccccc']);
    appendFileSync(log, lineaLog(t + 38 * MINUTO, 'versión ddddddd no arrancó: volví a la anterior'));
    assert.deepEqual(leerActualizaciones(db, config, { ahora: t + 2 * HORA }).abiertos, ['actualizacion_revertida:ddddddd']);
    for (const h of [3, 24]) assert.deepEqual(leerActualizaciones(db, config, { ahora: t + h * HORA }).abiertos, []);
  } finally {
    db.close();
  }
});

// ---------- 8. Un mensaje que quizás llegó ----------

test('ronda 3 (8): Telegram entrega el mensaje pero la respuesta se pierde: suena una sola vez y los repetidos cuentan para los topes', async () => {
  for (const motivo of ['tiempo_agotado', 'error_servidor']) {
    const b = await montar({ relleno: 0 });
    try {
      const adaptador = { ...TELEGRAM, async enviarTexto(cred, o) { const r = await TELEGRAM.enviarTexto(cred, o); return r.motivo === 'ok' ? { motivo } : r; } };
      const av = crearAvisador({ db: b.db, config: b.config, reloj: b.reloj, adaptador });
      abrirAviso(b.db, { clave: 'modo_seguro', nivel: 'grave', detalle: { origen: 'automatico' }, ahora: b.t });
      const inicio = b.t;
      while (b.t - inicio < DIA) { await av.pasada(); b.avanzar(15_000); }
      const m = deChat(b);
      assert.equal(m.filter(x => !x.silencioso).length, 1, `${motivo}: suena una sola vez`);
      assert.ok(m.length <= 30, `${motivo}: ${m.length} mensajes en 24 h (el tope es 30 por día)`);
      assert.ok(m.slice(1).every(x => x.text.startsWith('(Otra vez')), 'los demás dicen que son otra vez');
      const canal = canalActual(b.db);
      assert.equal(enviadosDesde(b.db, canal.id, b.t - DIA, b.t), m.length, 'cada uno cuenta para los topes');
    } finally {
      await b.cerrar();
    }
  }
});
