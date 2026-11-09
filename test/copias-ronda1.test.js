// Fase 1, parte e — ronda 1 del equipo rojo: las copias y la restauración. Una prueba por cada problema confirmado:
//  1. una copia a medias cuya foto ya es vieja (modo seguro, trabajador apagado) nunca se termina ni sale como «de hoy»;
//  2. un error pasajero al fijar el índice se reintenta (y si nunca queda fijado, se avisa grave y restaurar lo dice);
//  3. una parte dañada (o una copia repetida dañada) no tumba la restauración; con aceptarAnterior se usa la anterior;
//  4. un archivo que parece índice y no se entiende se ignora (en la carpeta y en el fijado de Telegram);
//  5. sin índice, una copia nueva cortada se nota ANTES de preguntar, y con aceptarAnterior se usa la anterior;
//  6. muchos archivos en la carpeta (años de copias) no la dejan sin restaurar;
//  7. si el dueño deja el chat (o une otro) en medio de una copia, nada más va al chat viejo.
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { carpetaTemporal, esperarHasta } from './ayuda.js';
import { montar, unirChat, CHAT, EXTRANO, HORA, MINUTO } from './copias-tarea-base.js';
import { TELEGRAM } from '../src/canales/telegram.js';
import { crearCredencial } from '../src/canales/credencial.js';
import { canalActual, desvincular } from '../src/canales/canales.js';
import { restaurarCopia, MAX_ARCHIVOS } from '../src/copias/restaurar.js';
import { copiaAtrasada, resumenCopias, estadoCopias, ultimaFuera } from '../src/copias/estado.js';
import { carpetaDelMes, nombreIndice } from '../src/copias/formato.js';
import { ponerModoSeguro } from '../src/tareas/modo-seguro.js';

const iso = ms => new Date(ms).toISOString();
const contar = (archivo, sql) => { const d = new DatabaseSync(archivo); try { return d.prepare(sql).get().n; } finally { d.close(); } };
const restaurarDeTelegram = (b, extra = {}) => {
  const carpeta = carpetaTemporal('ronda1-tg');
  return restaurarCopia({
    clave: b.claveTexto, fuente: { tipo: 'telegram', token: b.token, chatId: CHAT, ...(extra.fuente ?? {}) }, destino: join(carpeta, 'r.db'),
    carpetaTrabajo: join(carpeta, 'trabajo'), base: b.falso.url, ahora: b.t, alElegir: extra.alElegir ?? (async () => true),
  }).then(r => ({ ...r, archivo: join(carpeta, 'r.db') }));
};
const rutaIndice = (b, c) => join(b.config.carpetaCopias, 'cifradas', carpetaDelMes(c.empezada_en), nombreIndice(c.copia, c.empezada_en));
// Una copia de esta base, en una carpeta nueva: sus partes (y su índice, si se pide).
function copiarCopia(b, c, carpeta, { indice = true } = {}) {
  mkdirSync(carpeta, { recursive: true });
  for (const p of b.partes(c.id)) copyFileSync(p.archivo_local, join(carpeta, basename(p.archivo_local)));
  if (indice) copyFileSync(rutaIndice(b, c), join(carpeta, basename(rutaIndice(b, c))));
  return carpeta;
}

// ---------- 1. La frescura es la de la FOTO ----------

test('ronda 1 (1): modo seguro en medio de una copia y 72 h después → la copia vieja no se termina: otra con foto nueva; copia_atrasada sigue hasta comprobarla', async () => {
  let llamadas = 0;
  let b = null;
  // La 2.ª medida del -wal es la de «generar» (la 1.ª es la de preparar): ahí se enciende el modo seguro.
  b = await montar({ manejador: { walMb: () => { if (++llamadas === 2) ponerModoSeguro(b.db, { activo: true, origen: 'automatico', motivo: 'servicio_inestable', ahora: b.t }); return 0; } } });
  try {
    const id = b.pedir();
    for (let i = 0; i < 30; i++) {
      await b.ejecutor.ciclo();
      await esperarHasta(() => !b.ejecutor.estado().enCurso.length, { que: 'el paso', cada: 5, ms: 60_000 });
    }
    const vieja = b.copias()[0];
    assert.equal(JSON.parse(b.tarea(id).punto).paso, 'subir', 'quedó a medias, con la foto ya tomada');
    assert.equal(vieja.estado, 'escrita');
    // 72 h después: un dato nuevo, y el dueño quita el modo seguro.
    b.avanzar(72 * HORA);
    const despues = b.t;
    b.db.prepare("INSERT INTO auditoria (fecha, accion, detalle) VALUES (?, 'dato_nuevo', 'de después de la pausa')").run(iso(b.t));
    assert.equal(copiaAtrasada(b.db, b.t).activo, true, 'atrasada mientras tanto');
    ponerModoSeguro(b.db, { activo: false, origen: 'admin', ahora: b.t });
    await b.ejecutor.parar({ esperaMs: 0 });
    b.nuevoEjecutor();
    // Mientras la copia vieja «se termina» (sus pasos corren), copia_atrasada nunca se apaga por ella.
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha');
    const [primera, nueva] = b.copias();
    assert.deepEqual([primera.estado, primera.motivo], ['interrumpida', 'foto_vieja'], 'la de la foto vieja nunca se termina');
    assert.equal(primera.verificada_en, null);
    assert.equal(nueva.estado, 'verificada');
    assert.ok(Date.parse(nueva.empezada_en) >= despues, 'la copia comprobada es de una foto de DESPUÉS de la pausa');
    assert.equal(copiaAtrasada(b.db, b.t).activo, false);
    assert.equal(resumenCopias(b.db, { ahora: b.t }).ultimaFuera.fecha, nueva.empezada_en, 'la fecha que se muestra es la de la foto');
    const r = await restaurarDeTelegram(b);
    assert.equal(r.copia, nueva.copia);
    assert.equal(contar(r.archivo, "SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'dato_nuevo'"), 1, 'la copia de Telegram tiene el dato nuevo');
  } finally {
    await b.cerrar();
  }
});

test('ronda 1 (1): una copia comprobada HOY pero con foto de hace 40 h está atrasada (pantallas, aviso y la copia de la noche)', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const c = b.copias()[0];
    b.avanzar(HORA);
    // Una foto vieja que se terminó de comprobar ahora (como hacía la versión de antes).
    b.db.prepare('UPDATE copias SET empezada_en = ?, verificada_en = ? WHERE id = ?').run(iso(b.t - 40 * HORA), iso(b.t), c.id);
    b.db.prepare("UPDATE canales SET vinculado_en = ? WHERE estado = 'activo'").run(iso(b.t - 50 * HORA));
    b.db.prepare("UPDATE copias_llaves SET confirmada_en = ? WHERE estado = 'activa'").run(iso(b.t - 50 * HORA));
    assert.equal(copiaAtrasada(b.db, b.t).activo, true);
    assert.equal(copiaAtrasada(b.db, b.t).detalle.desde, iso(b.t - 40 * HORA));
    const resumen = resumenCopias(b.db, { ahora: b.t });
    assert.deepEqual([resumen.estado, resumen.motivo, resumen.ultimaFuera.fecha], ['mal', 'atrasada', iso(b.t - 40 * HORA)]);
    assert.equal(estadoCopias(b.db, { ahora: b.t }).ultimaFuera.fecha, iso(b.t - 40 * HORA));
    assert.equal(estadoCopias(b.db, { ahora: b.t }).recientes[0].fecha, iso(b.t - 40 * HORA), 'la lista muestra la fecha de la foto');
    // La de la noche no se salta por «reciente»: se hace.
    const noche = await b.terminar(b.pedir({ origen: 'noche' }));
    assert.equal(noche.resultado.saltada, undefined, JSON.stringify(noche.resultado));
    assert.equal(b.copias().at(-1).estado, 'verificada');
    assert.equal(ultimaFuera(b.db, b.t).id, b.copias().at(-1).id, 'la última es la de la foto más nueva');
    // Y con una foto de hace 2 h, la de la noche sí se salta.
    b.avanzar(2 * HORA);
    assert.equal((await b.terminar(b.pedir({ origen: 'noche' }))).resultado.saltada, 'reciente');
  } finally {
    await b.cerrar();
  }
});

// ---------- 2. Fijar el índice ----------

test('ronda 1 (2): un 500 pasajero al fijar se reintenta: la copia queda fijada y restaurar desde Telegram toma la de esa noche', async () => {
  const b = await montar({});
  try {
    assert.equal((await b.terminar(b.pedir({ origen: 'noche' }))).estado, 'hecha');
    b.avanzar(24 * HORA);
    b.db.prepare("INSERT INTO auditoria (fecha, accion, detalle) VALUES (?, 'dato_del_dia_2', 'x')").run(iso(b.t));
    b.falso.escena('pinChatMessage', 'error_500');
    const t2 = await b.terminar(b.pedir({ origen: 'noche' }));
    assert.equal(t2.estado, 'hecha');
    const noche2 = b.copias()[1];
    assert.deepEqual([noche2.estado, noche2.fijada], ['verificada', 1], 'se reintentó y quedó fijada');
    assert.equal(b.falso.fijado(CHAT), noche2.indice_mensaje_id);
    assert.equal(b.aviso('copia_sin_fijar'), null);
    b.avanzar(3 * HORA);
    let vista = null;
    const r = await restaurarDeTelegram(b, { alElegir: async e => { vista = e; return true; } });
    assert.equal(r.copia, noche2.copia);
    assert.equal(vista.fijadaVieja, false);
    assert.equal(contar(r.archivo, "SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'dato_del_dia_2'"), 1);
  } finally {
    await b.cerrar();
  }
});

test('ronda 1 (2): si fijar nunca funciona → copia_sin_fijar GRAVE; restaurar desde el fijado avisa que es vieja, y --indice con el índice nuevo la recupera', async () => {
  const b = await montar({});
  try {
    assert.equal((await b.terminar(b.pedir({ origen: 'noche' }))).estado, 'hecha');
    const noche1 = b.copias()[0];
    b.avanzar(24 * HORA);
    b.db.prepare("INSERT INTO auditoria (fecha, accion, detalle) VALUES (?, 'dato_del_dia_2', 'x')").run(iso(b.t));
    b.falso.escena('pinChatMessage', 'error_500', { veces: 100 });
    assert.equal((await b.terminar(b.pedir({ origen: 'noche' }))).estado, 'hecha');
    const noche2 = b.copias()[1];
    assert.deepEqual([noche2.estado, noche2.fijada], ['verificada', 0]);
    assert.equal(b.aviso('copia_sin_fijar')?.nivel, 'grave');
    assert.equal(b.falso.pedidos.filter(p => p.metodo === 'pinChatMessage').length, 1 + 6, 'la primera noche, y 1 + 5 reintentos');
    b.falso.sinEscenas();
    b.avanzar(3 * HORA);
    // Desde el fijado sale la de la noche 1: restaurar dice que el fijado es viejo (y la consola pregunta).
    let vista = null;
    const r1 = await restaurarDeTelegram(b, { alElegir: async e => { vista = e; return true; } });
    assert.equal(r1.copia, noche1.copia);
    assert.equal(vista.fijadaVieja, true);
    assert.ok(vista.edadHoras > 26);
    // El dueño guarda de su chat el índice de la noche 2 y lo pasa (--indice): las partes se bajan con el bot.
    const r2 = await restaurarDeTelegram(b, { fuente: { chatId: null, indiceTexto: readFileSync(rutaIndice(b, noche2), 'utf8') } });
    assert.equal(r2.copia, noche2.copia);
    assert.equal(r2.fijadaVieja, false);
    assert.equal(contar(r2.archivo, "SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'dato_del_dia_2'"), 1);
  } finally {
    await b.cerrar();
  }
});

// ---------- 3. Una parte dañada ----------

test('ronda 1 (3): un byte dañado en la parte 2 de la copia nueva: parte_danada; con aceptarAnterior, la anterior (y se dice que hay una más nueva)', async () => {
  const b = await montar({});
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.avanzar(24 * HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const [vieja, nueva] = b.copias();
    const carpeta = carpetaTemporal('ronda1-danada');
    copiarCopia(b, vieja, join(carpeta, 'a'));
    copiarCopia(b, nueva, join(carpeta, 'b'));
    const parte2 = join(carpeta, 'b', basename(b.partes(nueva.id)[1].archivo_local));
    const datos = readFileSync(parte2);
    datos[datos.length - 3] ^= 0x01;
    writeFileSync(parte2, datos);
    const fuente = { tipo: 'archivos', archivos: [carpeta] };
    await assert.rejects(restaurarCopia({ clave: b.claveTexto, fuente, destino: null, ahora: b.t }), e => e.clave === 'parte_danada' && e.datos.n === 2);
    let vista = null;
    const r = await restaurarCopia({ clave: b.claveTexto, fuente, destino: null, aceptarAnterior: true, ahora: b.t, alElegir: async e => { vista = e; return true; } });
    assert.equal(r.copia, vieja.copia);
    assert.equal(vista.hayMasNueva.copia, nueva.copia);
    // Sin los índices (solo las partes): igual.
    const soloPartes = readdirSync(join(carpeta, 'a')).concat(readdirSync(join(carpeta, 'b'))).filter(n => n.endsWith('.opc'));
    const rutas = soloPartes.map(n => join(carpeta, readdirSync(join(carpeta, 'a')).includes(n) ? 'a' : 'b', n));
    await assert.rejects(restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: rutas }, destino: null, ahora: b.t }), e => e.clave === 'parte_danada' && e.datos.n === 2);
    assert.equal((await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: rutas }, destino: null, aceptarAnterior: true, ahora: b.t })).copia, vieja.copia);
  } finally {
    await b.cerrar();
  }
});

test('ronda 1 (3): una copia repetida dañada («Copia de parte 2.opc», como al bajar dos veces) junto a la buena no tumba nada', async () => {
  const b = await montar({});
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const c = b.copias()[0];
    const carpeta = copiarCopia(b, c, carpetaTemporal('ronda1-repetida'));
    const mala = readFileSync(b.partes(c.id)[1].archivo_local);
    mala[mala.length - 3] ^= 0x01;
    writeFileSync(join(carpeta, 'Copia de parte 2.opc'), mala); // va primero en el orden de la carpeta
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null, ahora: b.t });
    assert.equal(r.copia, c.copia);
    assert.equal(r.partes, c.partes);
    // Sin índice, igual.
    const sinIndice = readdirSync(carpeta).filter(n => n.endsWith('.opc')).map(n => join(carpeta, n));
    assert.equal((await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: sinIndice }, destino: null, ahora: b.t })).copia, c.copia);
  } finally {
    await b.cerrar();
  }
});

// ---------- 4. Un archivo que parece índice ----------

test('ronda 1 (4): un archivo con forma de índice que no se entiende (o de un formato nuevo) se ignora, en la carpeta y en el fijado', async () => {
  const b = await montar({});
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const c = b.copias()[0];
    const carpeta = copiarCopia(b, c, carpetaTemporal('ronda1-indices'));
    writeFileSync(join(carpeta, 'raro-1.txt'), '{"oportia":"indice-copia","formato":1}\n');
    writeFileSync(join(carpeta, 'raro-2.txt'), '{"oportia":"indice-copia","formato":2}\n');
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [carpeta] }, destino: null, ahora: b.t });
    assert.deepEqual([r.copia, r.autentica, r.indicesDescartados], [c.copia, 'indice+flujo', 2]);
    // Sin el índice bueno: las partes solas (autenticadas por el flujo), sin tumbarse por los raros.
    const sinBueno = readdirSync(carpeta).filter(n => !n.endsWith('-indice.txt')).map(n => join(carpeta, n));
    const r2 = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: sinBueno }, destino: null, ahora: b.t });
    assert.deepEqual([r2.copia, r2.autentica, r2.indicesDescartados], [c.copia, 'flujo', 2]);
    // Solo el de formato nuevo, sin partes: ahí sí, formato_nuevo.
    await assert.rejects(restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [join(carpeta, 'raro-2.txt')] }, destino: null }), e => e.clave === 'formato_nuevo');
    // En Telegram: alguien con el token fija un «índice» raro → «no hay índice» (nunca «usa una versión más nueva»).
    const cred = crearCredencial({ token: b.token, base: b.falso.url });
    const s = await TELEGRAM.enviarArchivo(cred, { destino: String(CHAT), nombre: 'x-indice.txt', datos: Buffer.from('{"oportia":"indice-copia","formato":1}\n'), silencioso: true });
    assert.equal((await TELEGRAM.fijar(cred, { destino: String(CHAT), mensajeId: s.mensajeId })).motivo, 'ok');
    await assert.rejects(restaurarDeTelegram(b), e => e.clave === 'sin_indice');
  } finally {
    await b.cerrar();
  }
});

// ---------- 5. Sin índice, una copia cortada ----------

test('ronda 1 (5): sin índice, la copia nueva sin su última parte se nota ANTES de preguntar; con aceptarAnterior, la completa de antes', async () => {
  const b = await montar({});
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.avanzar(30 * HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const [vieja, nueva] = b.copias();
    assert.ok(nueva.partes >= 2);
    const rutas = [...b.partes(vieja.id), ...b.partes(nueva.id).slice(0, -1)].map(p => p.archivo_local);
    const preguntas = [];
    const alElegir = async e => { preguntas.push(e); return true; };
    await assert.rejects(restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: rutas }, destino: null, ahora: b.t, alElegir }), e => e.clave === 'copia_cortada');
    assert.equal(preguntas.length, 0, 'nunca se le preguntó al dueño por una copia cortada');
    const destino = join(carpetaTemporal('ronda1-cortada'), 'r.db');
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: rutas }, destino, aceptarAnterior: true, ahora: b.t, alElegir });
    assert.equal(r.copia, vieja.copia);
    assert.equal(preguntas.length, 1);
    assert.equal(preguntas[0].copia, vieja.copia);
    assert.equal(preguntas[0].hayMasNueva.copia, nueva.copia, 'se dice que hay una más nueva');
  } finally {
    await b.cerrar();
  }
});

// ---------- 6. Muchos archivos ----------

test('ronda 1 (6): años de copias en la carpeta (más de 20.000 archivos) no impiden restaurar; la consola explica demasiados_archivos', async () => {
  assert.ok(MAX_ARCHIVOS >= 200_000, 'unos 10 años de copias de cada noche');
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const c = b.copias()[0];
    const raiz = carpetaTemporal('ronda1-muchos');
    copiarCopia(b, c, join(raiz, '2027-12'));
    for (let m = 0; m < 21; m++) {
      const mes = join(raiz, `2026-${String(m).padStart(2, '0')}`);
      mkdirSync(mes);
      for (let i = 0; i < 1000; i++) writeFileSync(join(mes, `x${i}.opc`), 'x');
    }
    const r = await restaurarCopia({ clave: b.claveTexto, fuente: { tipo: 'archivos', archivos: [raiz] }, destino: null, ahora: b.t });
    assert.equal(r.copia, c.copia);
  } finally {
    await b.cerrar();
  }
  const cli = readFileSync(new URL('../deploy/oportia-restaurar.mjs', import.meta.url), 'utf8');
  assert.match(cli, /\n {2}demasiados_archivos: 'Hay demasiados archivos/);
  assert.match(cli, /\n {2}demasiados_archivos: 'uso'/);
});

// ---------- 7. El chat cambia en medio de una copia ----------

// Después del 2.º documento, el dueño deja el chat (o une otro). → { b, fin, despues: lo que fue al chat viejo después }
async function cambiarEnMedio({ disco = 100_000, cambio }) {
  let b = null;
  let n = 0;
  let marca = null;
  const adaptador = {
    ...TELEGRAM,
    async enviarArchivo(cred, o) {
      const r = await TELEGRAM.enviarArchivo(cred, o);
      if (++n === 2) { await cambio(b); marca = b.falso.pedidos.length; }
      return r;
    },
  };
  b = await montar({ relleno: 16, disco, adaptador });
  const fin = await b.terminar(b.pedir());
  const despues = b.falso.pedidos.slice(marca).filter(p => ['sendDocument', 'pinChatMessage', 'getFile'].includes(p.metodo) && String(p.params?.chat_id) === String(CHAT));
  return { b, fin, despues, marca };
}

const dejar = b => desvincular(b.db, { usuarioId: b.admin, origen: 'pantalla' });
const unirOtro = b => unirChat(b, { chat: EXTRANO, nombre: 'Otro' });

test('ronda 1 (7): copia en el servidor y el dueño deja el chat entre la parte 2 y la 3: nada más va al chat viejo; la copia queda solo en el servidor', async () => {
  const { b, fin, despues, marca } = await cambiarEnMedio({ cambio: dejar });
  try {
    assert.ok(marca != null);
    assert.equal(fin.estado, 'hecha');
    assert.deepEqual(despues, [], 'nada al chat viejo');
    const c = b.copias()[0];
    assert.deepEqual([c.estado, c.fuera, c.motivo], ['solo_local', 0, 'chat_cambiado']);
    assert.equal(b.copias().length, 1);
  } finally {
    await b.cerrar();
  }
});

test('ronda 1 (7): copia en el servidor y el dueño une OTRO chat en medio: nada al chat viejo', async () => {
  const { b, fin, despues } = await cambiarEnMedio({ cambio: unirOtro });
  try {
    assert.equal(fin.estado, 'hecha');
    assert.deepEqual(despues, []);
    assert.equal(canalActual(b.db).destino, String(EXTRANO));
    const c = b.copias()[0];
    assert.deepEqual([c.estado, c.motivo], ['solo_local', 'chat_cambiado']);
  } finally {
    await b.cerrar();
  }
});

test('ronda 1 (7): sin copia en el servidor (directo a Telegram) y el dueño deja el chat: la copia se corta y no hay adónde mandar otra', async () => {
  const { b, fin, despues } = await cambiarEnMedio({ disco: 1000, cambio: dejar });
  try {
    assert.equal(fin.estado, 'hecha');
    assert.equal(fin.resultado.saltada, 'sin_destino');
    assert.deepEqual(despues, []);
    const c = b.copias()[0];
    assert.deepEqual([c.estado, c.motivo, c.local], ['interrumpida', 'chat_cambiado', 0]);
  } finally {
    await b.cerrar();
  }
});

test('ronda 1 (7): directo a Telegram y el dueño une OTRO chat: la copia se corta y la siguiente va entera al chat nuevo', async () => {
  const { b, fin, despues } = await cambiarEnMedio({ disco: 1000, cambio: unirOtro });
  try {
    assert.equal(fin.estado, 'hecha');
    assert.deepEqual(despues, []);
    const [cortada, nueva] = b.copias();
    assert.deepEqual([cortada.estado, cortada.motivo], ['interrumpida', 'chat_cambiado']);
    assert.equal(nueva.estado, 'verificada');
    assert.equal(nueva.canal_id, canalActual(b.db).id);
    const aNueva = b.falso.documentos.filter(d => d.nombre.includes(nueva.copia.replace(/-/g, '').slice(0, 8)));
    assert.ok(aNueva.length >= nueva.partes + 1 && aNueva.every(d => d.chatId === String(EXTRANO)), 'sus partes y su índice, al chat nuevo');
    assert.equal(b.falso.fijado(EXTRANO), nueva.indice_mensaje_id);
    assert.ok(Date.parse(nueva.empezada_en) - Date.parse(cortada.empezada_en) >= 10 * MINUTO);
  } finally {
    await b.cerrar();
  }
});
