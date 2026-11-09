// Fase 1, parte e (paso 2): la tarea copias.hacer en el ejecutor de verdad (en este mismo proceso, con un reloj de
// mentira) contra el Telegram FALSO: los pasos, los reinicios, los topes, el disco, los errores de Telegram (caído días,
// el bot sacado del chat, tormentas de 429), el token que cambia en medio, el fijado, y la vuelta completa (la copia que
// hizo la tarea se restaura y es igual). Nunca usa internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaTemporal } from './ayuda.js';
import { contenido } from './copias-base.js';
import { montar, ponerToken, unirChat, BOT, BOT2, CHAT, MINUTO, HORA } from './copias-tarea-base.js';
import { TELEGRAM } from '../src/canales/telegram.js';
import { restaurarCopia } from '../src/copias/restaurar.js';
import { planDeDisco, topesDeIntento, estadoCopias, TOPES } from '../src/copias/estado.js';
import { vigilarCopias } from '../src/copias/vigilar.js';
import { ESTADOS_COPIA, ErrorCopias } from '../src/copias/formato.js';
import { volcar } from '../src/copias/volcado.js';
import { crearAvisador } from '../src/canales/avisador.js';
import { ranura } from '../src/tareas/tiempo.js';
import { PROGRAMAS_DEL_SISTEMA, definicion } from '../src/tareas/tipos.js';
import { programar } from '../src/tareas/cola.js';
import { guardarSecreto } from '../src/claves/almacen.js';
import { abrirBase } from '../src/nucleo/db.js';

const archivosEn = carpeta => {
  const lista = [];
  (function recorrer(d) {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d)) {
      const r = join(d, n);
      if (statSync(r).isDirectory()) recorrer(r); else lista.push(r);
    }
  })(carpeta);
  return lista;
};
const docsDe = (b, uuid) => b.falso.documentos.filter(d => d.nombre.includes(String(uuid).replace(/-/g, '').slice(0, 8)));
const sinCopias = c => Object.fromEntries(Object.entries(c).filter(([k]) => !/^(?:copias|copia_partes|canal_envios|tareas|tarea_eventos|tarea_carriles|trabajador_corridas|canales)$/.test(k)));

// ---------- 2.1 La copia de punta a punta (al disco y a Telegram) ----------

test('2.1 copias.hacer en el ejecutor: preparar → generar → subir → verificar → índice; disco + Telegram; y la copia se restaura igual', async () => {
  const b = await montar({ relleno: 16 });
  try {
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha', JSON.stringify(fin));
    const [c] = b.copias();
    assert.equal(c.estado, 'verificada');
    assert.deepEqual([c.local, c.fuera, c.fijada, c.origen, c.tarea_id], [1, 1, 1, 'manual', id]);
    assert.ok(c.partes >= 4, `${c.partes} partes`);
    const partes = b.partes(c.id);
    assert.equal(partes.length, c.partes);
    for (const p of partes) {
      assert.ok(p.archivo_local && existsSync(p.archivo_local), 'la parte está en el disco');
      assert.ok(p.archivo_id && p.subida_en && p.verificada_en, `parte ${p.n} subida y comprobada`);
      assert.ok(p.archivo_local.includes(`${join('cifradas', '')}`), 'en cifradas/<AAAA-MM>/');
      assert.equal(statSync(p.archivo_local).mode & 0o777, 0o640);
    }
    // En Telegram: cada parte + el índice, en silencio, y el índice fijado.
    const docs = docsDe(b, c.copia);
    assert.equal(docs.length, c.partes + 1);
    assert.ok(docs.every(d => d.silencioso), 'en silencio');
    assert.equal(b.falso.fijado(CHAT), c.indice_mensaje_id);
    assert.match(docs.at(-1).leyenda, /No borres estos mensajes/);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM canal_envios WHERE clase = 'copia_parte' AND copia_id = ?").get(c.id).n, c.partes);
    // Nada sin cifrar en la carpeta, y el índice también quedó en el disco.
    const locales = archivosEn(join(b.config.carpetaCopias, 'cifradas'));
    assert.equal(locales.length, c.partes + 1);
    // El estado para la pantalla.
    const e = estadoCopias(b.db, { libreMb: 100_000, telegram: { listo: true } });
    assert.equal(e.ultimaFuera.partes, c.partes);
    assert.equal(e.locales.copias, 1);
    assert.equal(e.enCurso, null);
    for (const f of b.db.prepare('SELECT DISTINCT estado FROM copias').all()) assert.ok(ESTADOS_COPIA.includes(f.estado));
    // Una sola copia viva: otra pedida mientras tanto no se crea (el índice parcial de la parte c).
    // La vuelta completa: desde Telegram (el índice fijado) y desde los archivos del disco.
    const original = contenido(b.db);
    for (const fuente of [{ tipo: 'telegram', token: b.token, chatId: String(CHAT) }, { tipo: 'archivos', archivos: [join(b.config.carpetaCopias, 'cifradas')] }]) {
      const carpeta = carpetaTemporal('restaurar');
      const destino = join(carpeta, 'nueva.db');
      const r = await restaurarCopia({ clave: b.claveTexto, fuente, destino, carpetaTrabajo: join(carpeta, 'partes'), ajustar: false, base: b.falso.url });
      assert.equal(r.copia, c.copia);
      assert.equal(r.autentica, 'indice+flujo');
      const db2 = abrirBase({ archivoBase: destino, carpetaCopias: join(carpeta, 'copias') });
      const restaurado = contenido(db2);
      db2.close();
      // La foto se tomó DENTRO de la tarea: lo que se escribió después (la fila de la copia, sus partes) no está.
      assert.deepEqual(sinCopias(restaurado), sinCopias(original), fuente.tipo);
      assert.equal(restaurado['esquema:copias'], original['esquema:copias']);
    }
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'copias.hacer'").get().n, 1, 'nunca una tarea nueva desde adentro');
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.2 Interrupciones, reinicios y topes ----------

test('2.2 cortada en «generar» (se apaga el trabajador): la fila queda interrumpida y la MISMA tarea hace una copia nueva', async () => {
  const b = await montar({ relleno: 8 });
  try {
    let esperando = null;
    // Un volcado que se queda esperando la señal de parar (como uno largo).
    const lento = async function* (foto, opciones) {
      await new Promise((listo, mal) => {
        esperando = listo;
        opciones.senal?.addEventListener('abort', () => mal(new ErrorCopias('cancelada')), { once: true });
      });
      yield* volcar(foto, opciones);
    };
    b.nuevoEjecutor({ manejador: { volcar: lento } });
    const id = b.pedir();
    for (let i = 0; i < 50 && !esperando; i++) { await b.ejecutor.ciclo(); await new Promise(l => setTimeout(l, 10)); }
    assert.ok(esperando, 'llegó a generar');
    await b.ejecutor.parar({ esperaMs: 0 });
    assert.equal(b.tarea(id).estado, 'lista', 'apagarse no es un fallo');
    b.nuevoEjecutor();
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha');
    const [primera, segunda] = b.copias();
    assert.deepEqual([primera.estado, primera.motivo], ['interrumpida', 'foto_interrumpida']);
    assert.equal(segunda.estado, 'verificada');
    assert.notEqual(primera.copia, segunda.copia, 'otra copia, otro uuid');
    assert.equal(primera.tarea_id, segunda.tarea_id);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'copias.hacer'").get().n, 1);
  } finally {
    await b.cerrar();
  }
});

test('2.2 cortada en «subir» después de la parte 2: sigue desde la 3; una caída entre subir y anotar deja UN documento repetido y la copia igual se comprueba', async () => {
  // a) Telegram falla (500) al subir la tercera parte: la siguiente vuelta sube solo de la 3 en adelante.
  const b = await montar({ relleno: 16, manejador: { pasoCortoMs: -1 } });
  try {
    b.falso.escena('sendDocument', 'error_500', { saltar: 2 });
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha');
    const [c] = b.copias();
    assert.equal(c.estado, 'verificada');
    const subidas = b.falso.pedidos.filter(p => p.metodo === 'sendDocument' && p.archivo?.nombre.endsWith('.opc')).map(p => p.archivo.nombre);
    for (let n = 1; n <= c.partes; n++) {
      const nombre = `p${String(n).padStart(3, '0')}.opc`;
      assert.equal(subidas.filter(x => x.endsWith(nombre)).length, n === 3 ? 2 : 1, `la parte ${n}`);
    }
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tarea_eventos WHERE tarea_id = ? AND evento = 'error'").get(id).n, 1);
  } finally {
    await b.cerrar();
  }
  // b) Se cae justo después de subir la parte 3 (antes de anotarla): esa parte queda dos veces en el chat, y nada más.
  let caido = false;
  const adaptador = {
    ...TELEGRAM,
    async enviarArchivo(cred, o) {
      const r = await TELEGRAM.enviarArchivo(cred, o);
      if (!caido && o.nombre.endsWith('-p003.opc')) { caido = true; throw new Error('se_apago_el_servidor'); }
      return r;
    },
  };
  const c2 = await montar({ relleno: 16, adaptador });
  try {
    const fin = await c2.terminar(c2.pedir());
    assert.equal(fin.estado, 'hecha');
    const [c] = c2.copias();
    assert.equal(c.estado, 'verificada');
    const docs = docsDe(c2, c.copia);
    assert.equal(docs.length, c.partes + 2, 'un solo documento repetido');
    assert.equal(docs.filter(d => d.nombre.endsWith('-p003.opc')).length, 2);
  } finally {
    await c2.cerrar();
  }
});

test('2.2 topes: una 4.ª copia en la misma tarea, o una 4.ª copia subida sin éxito en el mismo día, deja la tarea fallida con copia_fallida (grave)', async () => {
  // Sin copia en el servidor (disco casi lleno) y Telegram cambia un byte de cada parte que se baja: cada copia falla.
  const b = await montar({ relleno: 4, disco: 1500 });
  try {
    b.falso.escena('file', 'cambiar_bytes', { veces: 1000 });
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'fallida');
    assert.equal(fin.ultimo_error, 'copia_sin_exito');
    const copias = b.copias();
    assert.equal(copias.length, TOPES.copiasPorTarea);
    assert.ok(copias.every(c => c.estado === 'fallida' && /^parte_distinta/.test(c.motivo) && c.local === 0), JSON.stringify(copias.map(c => [c.estado, c.motivo])));
    assert.equal(b.aviso('copia_fallida')?.nivel, 'grave');
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'copias.hacer'").get().n, 1, 'nunca se pidió una tarea nueva desde adentro');
    // Las esperas entre copias: al menos 10 minutos.
    const t = copias.map(c => Date.parse(c.empezada_en));
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 10 * MINUTO);
    // Otra tarea el mismo día: ya hubo 3 copias subidas sin éxito → no sube otra.
    const otra = await b.terminar(b.pedir());
    assert.deepEqual([otra.estado, otra.ultimo_error], ['fallida', 'copia_sin_exito']);
    assert.equal(b.copias().length, 3, 'no empezó una cuarta');
    assert.deepEqual(topesDeIntento(b.db, { tareaId: id, ahora: b.t }), { copiasDeTarea: 3, subidasSinExitoHoy: 3 });
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.3 Lo que hace Telegram ----------

test('2.3 un byte cambiado al bajar: se sube otra vez desde el disco y se comprueba; 429: se espera retry_after sin contar fallo; sin file_size: decide el hash', async () => {
  const b = await montar({ relleno: 8 });
  try {
    b.falso.escena('file', 'cambiar_bytes', { saltar: 1 });
    b.falso.escena('sendDocument', 'limite', { segundos: 3, saltar: 1 });
    b.falso.escena('sendDocument', 'sin_tamano', { veces: 2 });
    b.falso.escena('getFile', 'sin_tamano', { veces: 3 });
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha');
    const [c] = b.copias();
    assert.equal(c.estado, 'verificada');
    const p2 = b.partes(c.id).find(p => p.n === 2);
    assert.equal(p2.intentos, 1, 'la parte 2 se subió otra vez');
    assert.match(p2.ultimo_error, /^distinta:/);
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tarea_eventos WHERE tarea_id = ? AND evento IN ('error', 'fallida')").get(id).n, 0, 'nada contó como fallo');
  } finally {
    await b.cerrar();
  }
});

test('2.3 tormenta de 429 (con copia en el servidor): cada espera cuenta; a las 12 la tarea falla con telegram_limite_largo; el 429 pausa también al que manda avisos', async () => {
  const b = await montar({ relleno: 4 });
  try {
    b.falso.escena('sendDocument', 'limite', { segundos: 120, veces: 1000 });
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.deepEqual([fin.estado, fin.ultimo_error], ['fallida', 'telegram_limite_largo']);
    assert.equal(b.aviso('copia_fallida')?.nivel, 'grave');
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM tarea_eventos WHERE tarea_id = ? AND evento = 'error'").get(id).n, 0, 'las esperas no cuentan como fallos');
    const canal = b.db.prepare("SELECT * FROM canales WHERE estado = 'activo'").get();
    assert.ok(canal.pausa_hasta, 'el trabajador anotó la pausa en el canal');
    // El que manda avisos (servidor web) espera lo mismo.
    b.db.prepare("UPDATE canales SET pausa_hasta = ? WHERE id = ?").run(new Date(Date.now() + HORA).toISOString(), canal.id);
    const avisador = crearAvisador({ db: b.db, config: b.config });
    assert.equal((await avisador.pasada()).motivo, 'pausa');
  } finally {
    await b.cerrar();
  }
});

test('2.3 sin copia en el servidor (directo a Telegram): un 429 largo cierra la foto y empieza otra copia; repetido, se para en el tope', async () => {
  const b = await montar({ relleno: 4, disco: 1500 });
  try {
    b.falso.escena('sendDocument', 'limite', { segundos: 120, veces: 1000 });
    const fin = await b.terminar(b.pedir());
    assert.deepEqual([fin.estado, fin.ultimo_error], ['fallida', 'copia_sin_exito']);
    const copias = b.copias();
    assert.equal(copias.length, 3);
    assert.ok(copias.every(c => c.estado === 'interrumpida' && c.motivo === 'telegram_limite' && c.local === 0));
    const t = copias.map(c => Date.parse(c.empezada_en));
    assert.ok(t[1] - t[0] >= 120_000 && t[2] - t[1] >= 10 * MINUTO);
  } finally {
    await b.cerrar();
  }
});

test('2.3 Telegram caído (500 tres veces seguidas): la tarea queda fallida y vigilar cierra la copia con copia_fallida (grave); las partes del disco quedan', async () => {
  const b = await montar({ relleno: 4 });
  try {
    b.falso.escena('sendDocument', 'error_500', { veces: 3 });
    const id = b.pedir();
    const fin = await b.terminar(id);
    assert.deepEqual([fin.estado, fin.ultimo_error], ['fallida', 'error_servidor']);
    assert.equal(b.copias()[0].estado, 'escrita');
    vigilarCopias(b.db, b.config, { ahora: b.t, libreMb: 100_000 });
    const [c] = b.copias();
    assert.deepEqual([c.estado, c.motivo], ['fallida', 'error_servidor']);
    assert.equal(b.aviso('copia_fallida')?.nivel, 'grave');
    assert.ok(b.partes(c.id).every(p => existsSync(p.archivo_local)), 'nada se borró');
    // Días después, con Telegram de vuelta, la copia de la noche funciona sola.
    b.avanzar(3 * 24 * HORA);
    const otra = await b.terminar(b.pedir({}));
    assert.equal(otra.estado, 'hecha');
    assert.equal(b.copias().at(-1).estado, 'verificada');
    assert.equal(b.aviso('copia_fallida'), null, 'una copia buena cierra el aviso');
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.4 El disco («nunca se borra nada») ----------

test('2.4 la política del disco: piso = máx(2 GB, 2×base + wal + 256 MB); debajo, sin copias en el servidor; con menos de 300 MB, nada', () => {
  assert.equal(planDeDisco({ libreMb: 10_000, baseMb: 10, walMb: 1 }).pisoMb, 2048);
  assert.equal(planDeDisco({ libreMb: 10_000, baseMb: 1000, walMb: 100 }).pisoMb, 2356);
  assert.equal(planDeDisco({ libreMb: 2100, baseMb: 100, walMb: 0 }).local, false, '2100 − 60 < 2048');
  assert.equal(planDeDisco({ libreMb: 2200, baseMb: 100, walMb: 0 }).local, true);
  assert.equal(planDeDisco({ libreMb: 2200, baseMb: 100, walMb: 0, ultimaCopiaMb: 200 }).local, false, 'mide con la última copia');
  assert.deepEqual([planDeDisco({ libreMb: 299 }).freno, planDeDisco({ libreMb: 299 }).motivo], [true, 'freno']);
  assert.equal(planDeDisco({ libreMb: null }).local, true, 'una medida que no se pudo leer nunca frena');
  assert.equal(planDeDisco({ libreMb: 50_000, ajusteLocal: false }).motivo, 'apagado');
});

test('2.4 disco casi lleno: la copia va directo a Telegram, se avisa (y vuelve sola); con < 300 MB el freno no deja empezar; los días que alcanzan', async () => {
  const b = await montar({ relleno: 8, disco: 1800 });
  try {
    const fin = await b.terminar(b.pedir());
    assert.equal(fin.estado, 'hecha');
    const [c] = b.copias();
    assert.deepEqual([c.estado, c.local, c.fuera], ['verificada', 0, 1]);
    assert.ok(b.partes(c.id).every(p => p.archivo_local == null && p.archivo_id));
    assert.equal(archivosEn(join(b.config.carpetaCopias, 'cifradas')).length, 0, 'nada en el disco');
    assert.equal(b.aviso('copias_locales_pausadas')?.nivel, 'atencion');
    // Vuelve el espacio: vigilar lo cierra solo.
    b.disco.libre = 50_000;
    vigilarCopias(b.db, b.config, { ahora: b.t, libreMb: b.disco.libre });
    assert.equal(b.aviso('copias_locales_pausadas'), null);
    // Menos de 300 MB: el freno «poco_disco» de la parte c no deja tomar la copia (sigue en la fila).
    b.disco.libre = 250;
    b.nuevoEjecutor();
    const id = b.pedir();
    for (let i = 0; i < 5; i++) await b.ejecutor.ciclo();
    assert.equal(b.tarea(id).estado, 'lista');
    assert.equal(b.ejecutor.estado().freno, 'poco_disco');
    b.disco.libre = 50_000;
    b.nuevoEjecutor();
    assert.equal((await b.terminar(id)).estado, 'hecha');
    // Los días: copias locales de 40 MB y 3 GB libres → (3000 − 2048) / 40 ≈ 23 días → aviso; con más espacio se cierra.
    b.db.prepare("UPDATE copias SET bytes = ?, local = 1 WHERE estado = 'verificada'").run(40 * 1024 * 1024);
    vigilarCopias(b.db, b.config, { ahora: b.t, libreMb: 3000 });
    assert.equal(b.aviso('copias_disco_pronto')?.nivel, 'atencion');
    assert.equal(JSON.parse(b.aviso('copias_disco_pronto').detalle).dias, 23);
    vigilarCopias(b.db, b.config, { ahora: b.t, libreMb: 6000 });
    assert.equal(b.aviso('copias_disco_pronto'), null);
  } finally {
    await b.cerrar();
  }
});

test('2.4 directo a Telegram con la foto abierta: si el -wal crece más de 64 MB (o el disco baja de 500 MB), la foto se cierra en esa parte y empieza otra copia', async () => {
  for (const caso of ['wal', 'disco']) {
    let partesVistas = 0;
    const b = await montar({ relleno: 16, disco: 1800 });
    try {
      b.opcionesManejador.walMb = () => (caso === 'wal' && partesVistas >= 2 ? 200 : 1);
      b.opcionesManejador.discoLibreMb = () => (caso === 'disco' && partesVistas >= 2 ? 450 : b.disco.libre);
      const adaptador = { ...TELEGRAM, async enviarArchivo(cred, o) { partesVistas += 1; return TELEGRAM.enviarArchivo(cred, o); } };
      b.nuevoEjecutor({ manejador: { adaptador } });
      const id = b.pedir();
      // La primera copia se corta; la segunda (con el disco y el -wal normales otra vez) termina.
      for (let i = 0; i < 30 && b.copias().length < 2; i++) {
        await b.ejecutor.ciclo();
        await new Promise(l => setTimeout(l, 5));
        const f = b.tarea(id);
        if (f.estado === 'lista' && Date.parse(f.disponible_en) > b.t) { partesVistas = -1000; b.t = Date.parse(f.disponible_en) + 1; }
      }
      const fin = await b.terminar(id);
      assert.equal(fin.estado, 'hecha', caso);
      const [primera, segunda] = b.copias();
      assert.deepEqual([primera.estado, primera.motivo], ['interrumpida', 'foto_larga'], caso);
      assert.equal(b.partes(primera.id).length, 2, `${caso}: se cortó antes de la tercera parte`);
      assert.equal(segunda.estado, 'verificada');
    } finally {
      await b.cerrar();
    }
  }
});

// ---------- 2.5 Sin clave, sin Telegram, sin nada; el bot bloqueado en medio ----------

test('2.5 sin clave: no hay copia y se avisa; sin Telegram: solo en el servidor; sin ninguno: sin destino; bloqueado en medio: solo en el servidor', async () => {
  const sinClave = await montar({ clave: false, relleno: 2 });
  try {
    const fin = await sinClave.terminar(sinClave.pedir());
    assert.deepEqual(fin.resultado, { saltada: 'sin_clave' });
    assert.equal(sinClave.aviso('copias_sin_clave')?.nivel, 'atencion');
    assert.equal(sinClave.copias().length, 0);
  } finally {
    await sinClave.cerrar();
  }
  const sinTelegram = await montar({ telegram: false, relleno: 2 });
  try {
    const fin = await sinTelegram.terminar(sinTelegram.pedir());
    assert.equal(fin.resultado.estado, 'solo_local');
    assert.equal(sinTelegram.copias()[0].estado, 'solo_local');
    assert.ok(sinTelegram.aviso('copias_sin_telegram'));
    assert.equal(sinTelegram.falso.documentos.length, 0);
    // Y sin espacio en el disco tampoco: no hay adónde.
    sinTelegram.disco.libre = 1000;
    const nada = await sinTelegram.terminar(sinTelegram.pedir());
    assert.deepEqual(nada.resultado, { saltada: 'sin_destino' });
    assert.ok(sinTelegram.aviso('copias_locales_pausadas'));
  } finally {
    await sinTelegram.cerrar();
  }
  // El dueño bloquea al bot en medio de la copia (después de escribir las partes): la copia queda en el servidor.
  const adaptador = {
    ...TELEGRAM,
    async enviarArchivo(cred, o) {
      if (o.nombre.endsWith('-p002.opc')) bloqueado.falso.bloquear(CHAT);
      return TELEGRAM.enviarArchivo(cred, o);
    },
  };
  const bloqueado = await montar({ relleno: 8, adaptador });
  try {
    const fin = await bloqueado.terminar(bloqueado.pedir());
    assert.equal(fin.estado, 'hecha');
    const [c] = bloqueado.copias();
    assert.deepEqual([c.estado, c.fuera, c.motivo], ['solo_local', 0, 'bloqueado']);
    assert.equal(bloqueado.db.prepare('SELECT estado FROM canales ORDER BY id DESC LIMIT 1').get().estado, 'bloqueado');
    assert.equal(bloqueado.aviso('telegram_falla')?.nivel, 'atencion');
  } finally {
    await bloqueado.cerrar();
  }
});

// ---------- 2.7 La hora de la noche ----------

test('2.7 la copia de la noche: 4:40 a. m. de RD (8:40 UTC), se pone al día UNA vez tras estar apagado, y una de hace más de 20 h no se hace', async () => {
  const plan = PROGRAMAS_DEL_SISTEMA.find(p => p.programa === 'copias.hacer');
  assert.deepEqual([plan.cada, plan.hora, plan.minuto], ['diaria', 4, 40]);
  const r = ranura(plan, Date.parse('2026-11-10T09:00:00Z'));
  assert.equal(new Date(r.inicio).toISOString(), '2026-11-10T08:40:00.000Z');
  assert.equal(r.clave, 'copias.hacer@2026-11-10');
  assert.equal(ranura(plan, Date.parse('2026-11-10T08:39:00Z')).clave, 'copias.hacer@2026-11-09', 'antes de las 4:40 vale la de ayer');
  assert.equal(definicion('copias.hacer').cupo, 'grande');
  assert.equal(definicion('copias.hacer').ignoraFrenos, false, 'los dos frenos la paran');
  const b = await montar({ relleno: 2 });
  try {
    // Apagado 3 días: al volver se crea UNA sola tarea, la de ahora (y programar otra vez no crea otra).
    const ahora = Date.parse('2026-11-13T15:00:00Z');
    const cuenta = () => b.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE programa = 'copias.hacer'").get().n;
    programar(b.db, { programas: [plan], ahora });
    programar(b.db, { programas: [plan], ahora: ahora + 60_000 });
    assert.equal(cuenta(), 1);
    const t = b.db.prepare("SELECT * FROM tareas WHERE programa = 'copias.hacer'").get();
    assert.equal(t.clave_unica, 'copias.hacer@2026-11-13');
    // Esa tarea se toma 21 h después (el trabajador estuvo en pausa): ya no se hace.
    b.t = Date.parse(t.creada_en) + 21 * HORA;
    const fin = await b.terminar(t.id);
    assert.deepEqual(fin.resultado, { saltada: 'caducada' });
    assert.equal(b.copias().length, 0);
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.8b La revisión en el mismo paso ----------

test('2.8b un volcado que pierde una fila (o una tabla) deja la copia fallida volcado_incompleto: nunca «comprobada»', async () => {
  for (const que of ['fila', 'tabla']) {
    const pierde = async function* (foto, opciones) {
      let tabla = null;
      let saltada = false;
      for await (const linea of volcar(foto, opciones)) {
        const texto = linea.toString();
        if (texto.startsWith('{"t":"filas"')) tabla = JSON.parse(texto).tabla;
        if (!saltada && tabla === 'ajustes' && texto.startsWith('[')) {
          saltada = true;
          if (que === 'fila') continue;
        }
        if (que === 'tabla' && tabla === 'ajustes' && !texto.startsWith('{"t":"esquema"') && !texto.startsWith('{"t":"fin"') && !texto.startsWith('{"t":"sello"')) continue;
        yield linea;
      }
    };
    const b = await montar({ relleno: 4, manejador: { volcar: pierde } });
    try {
      const fin = await b.terminar(b.pedir());
      assert.deepEqual([fin.estado, fin.ultimo_error], ['fallida', 'volcado_incompleto'], que);
      const [c] = b.copias();
      assert.deepEqual([c.estado, c.motivo, c.verificada_en], ['fallida', 'volcado_incompleto', null]);
      assert.equal(b.aviso('copia_fallida')?.nivel, 'grave');
      assert.equal(b.falso.documentos.filter(d => d.nombre.endsWith('-indice.txt')).length, 0, 'ningún índice');
    } finally {
      await b.cerrar();
    }
  }
});

// ---------- 2.16 El token cambia en medio ----------

test('2.16 el token cambia a OTRO bot entre la parte 2 y la 3: la copia se interrumpe (bot_cambiado) y la nueva usa solo el bot nuevo', async () => {
  let b;
  let cambiado = false;
  const adaptador = {
    ...TELEGRAM,
    async enviarArchivo(cred, o) {
      const r = await TELEGRAM.enviarArchivo(cred, o);
      if (!cambiado && o.nombre.endsWith('-p002.opc')) {
        cambiado = true;
        // El dueño pega el token de otro bot en Claves (y une su chat otra vez con el bot nuevo).
        guardarSecreto(b.db, b.config, { uso: 'telegram_bot', valor: b.token2, usuarioId: b.admin });
      }
      return r;
    },
  };
  b = await montar({ relleno: 16, adaptador, manejador: { pasoCortoMs: -1 } });
  try {
    const id = b.pedir();
    for (let i = 0; i < 40 && !cambiado; i++) { await b.ejecutor.ciclo(); await new Promise(l => setTimeout(l, 5)); }
    for (let i = 0; i < 10 && b.copias()[0].estado !== 'interrumpida'; i++) {
      await b.ejecutor.ciclo();
      await new Promise(l => setTimeout(l, 10));
    }
    assert.deepEqual([b.copias()[0].estado, b.copias()[0].motivo], ['interrumpida', 'bot_cambiado']);
    const s = b.db.prepare("SELECT id FROM secretos WHERE uso = 'telegram_bot' AND estado = 'activa'").get();
    await ponerToken(b, { token: b.token2 }).catch(() => {});
    assert.equal(b.db.prepare('SELECT estado, motivo FROM canales WHERE cuenta_id = ? ORDER BY id DESC LIMIT 1').get(String(BOT.id)).motivo, 'bot_cambiado');
    await unirChat(b);
    const fin = await b.terminar(id);
    assert.equal(fin.estado, 'hecha');
    const ultima = b.copias().at(-1);
    assert.deepEqual([ultima.estado, ultima.cuenta_id], ['verificada', String(BOT2.id)]);
    assert.ok(ultima.secreto_id >= s.id);
    const raiz = ultima.copia.replace(/-/g, '').slice(0, 8);
    const envios = b.falso.pedidos.filter(p => p.metodo === 'sendDocument' && p.archivo?.nombre.includes(raiz));
    assert.ok(envios.length >= ultima.partes + 1);
    assert.ok(envios.every(p => p.bot === BOT2.id), 'cada archivo de la copia buena es del MISMO bot');
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.17 El fijado ----------

test('2.17 el fijado: alguien lo quita entre noches → copia_sin_fijar; si fijar no queda fijado → fijada 0; uno bueno lo cierra', async () => {
  const b = await montar({ relleno: 2 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.equal(b.copias()[0].fijada, 1);
    b.falso.desfijar(CHAT);
    b.falso.escena('pinChatMessage', 'otro_fijado');
    b.avanzar(24 * HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.ok(b.aviso('copia_sin_fijar'), 'el preparar de la noche siguiente lo notó');
    assert.equal(b.copias()[1].fijada, 0, 'fijar respondió bien pero el fijado no es el nuestro');
    b.avanzar(24 * HORA);
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    assert.equal(b.copias()[2].fijada, 1);
    assert.equal(b.aviso('copia_sin_fijar'), null);
    assert.equal(b.falso.fijado(CHAT), b.copias()[2].indice_mensaje_id);
  } finally {
    await b.cerrar();
  }
});

// ---------- 2.18 Una copia a mano poco antes de la noche ----------

test('2.18 una copia a mano comprobada a las 4:30 → la de las 4:40 termina «reciente» (una sola copia esa noche)', async () => {
  const b = await montar({ relleno: 2 });
  try {
    b.t = Date.parse('2026-11-10T08:30:00Z');
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    b.t = Date.parse('2026-11-10T08:41:00Z');
    programar(b.db, { programas: PROGRAMAS_DEL_SISTEMA.filter(p => p.programa === 'copias.hacer'), ahora: b.t });
    const noche = b.db.prepare("SELECT id FROM tareas WHERE clave_unica = 'copias.hacer@2026-11-10'").get();
    assert.ok(noche);
    const fin = await b.terminar(noche.id);
    assert.deepEqual(fin.resultado, { saltada: 'reciente' });
    assert.equal(b.copias().length, 1);
  } finally {
    await b.cerrar();
  }
});
