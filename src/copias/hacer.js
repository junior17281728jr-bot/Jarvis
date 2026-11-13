// La tarea de la copia de cada noche (fase 1, parte e): 'copias.hacer', en el trabajador (proceso aparte, con menos
// prioridad). Solo la carga el trabajador: el servidor web nunca (test/reglas.test.js). Pasos (cada uno corto, con su
// avance guardado en el «punto» de la tarea):
//   1. preparar  — topes de intentos, ¿hay clave?, ¿adónde va? (Telegram y/o el disco del servidor), la fila de la copia.
//   2. generar   — la foto de la base → volcado → gzip → cifrado → partes de 2 MiB, con la revisión en el mismo paso.
//                  Con copia en el servidor, cada parte va a un archivo nuevo (y NADA de red con la foto abierta); sin
//                  ella (disco casi lleno), cada parte va directo a Telegram bajo un «presupuesto de foto».
//   3. subir     — cada parte del disco a Telegram (se reanuda en la parte n).
//   4. verificar — cada parte se BAJA otra vez de Telegram y su sha256 debe ser el mismo; la del disco se lee otra vez.
//   5. indice    — el índice firmado: al disco, a Telegram (bajado y comprobado otra vez) y fijado arriba en el chat.
// Reglas:
//  - Nunca se borra nada (ni partes viejas, ni copias interrumpidas). Nunca se pisa un archivo ('wx').
//  - Un «reinicio» es una copia NUEVA (otro uuid) dentro de la MISMA tarea, nunca una tarea nueva (este archivo nunca
//    llama a encolar). Topes salidos de las filas: 3 copias por tarea, 3 copias subidas sin éxito por día de RD, 12
//    esperas o 6 h de esperas por copia. Pasado un tope: la tarea queda «fallida» y el aviso copia_fallida (grave).
//  - Una copia queda atada a UN bot (su secreto y su id de bot): si el token cambia en medio, se empieza otra copia.
//  - Y a UN chat: antes de cada envío (y de cada bajada para comprobar) se mira otra vez que su chat siga siendo el chat
//    en uso del dueño. Si lo dejó o unió otro en medio, nada más va al chat viejo: la copia sigue solo en el servidor
//    (si sus partes están en el disco) o se empieza otra («chat_cambiado»).
//  - La frescura es la de la FOTO (empezada_en): una copia cuya foto ya tiene más de 20 h (modo seguro, el trabajador
//    apagado, una vuelta a 0.4.1 en medio) nunca se termina: se empieza otra con una foto nueva («foto_vieja»).
//  - El índice se fija arriba en el chat, y la copia queda «verificada» solo cuando el fijado se comprobó; un error
//    pasajero al fijar se reintenta (1, 5, 15, 30 y 60 min). Si nunca queda fijado: copia_sin_fijar GRAVE.
//  - Lo que dice Telegram es solo un motivo (src/canales/telegram.js); el token nunca aparece en nada de lo que se guarda.
// Ronda 2 del equipo rojo:
//  - Una copia con fecha del futuro (reloj adelantado y después corregido) nunca cuenta como «reciente»: la de la noche
//    se hace igual (estado.js ultimaCreible), y copias_fecha_futura lo dice.
//  - El disco que manda es el de la carpeta de las COPIAS (puede ser otro). Si escribir una parte falla por el disco
//    (lleno, sin inodos, de solo lectura, un error de E/S), la copia sigue SIN guardar aquí: va directo a Telegram (otra
//    copia de la misma tarea) y copias_locales_pausadas lo dice. Telegram nunca espera detrás del disco del servidor.
//  - Solo una pausa de Telegram de verdad (429) se espera; las esperas tras fallos del que manda avisos no son de la
//    copia. Y una copia que ya está entera en el disco nunca se pierde porque Telegram no responda (caído, o 429 sin
//    fin): queda «solo en el servidor», comprobada, y copia_solo_local lo dice.
//  - Si el bot del token no es el del chat (bot_cambiado), se avisa (telegram_falla): la copia nunca queda solo aquí
//    en silencio.
import { closeSync, fsyncSync, mkdirSync, openAsBlob, openSync, readFileSync, statSync, writeSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as esperarCon } from 'node:timers/promises';
import { abrirFotoDeLectura } from '../nucleo/db.js';
import { discoLibreMb as discoDelServidor, discoDeCopias } from '../nucleo/salud.js';
import { ErrorTarea } from '../tareas/tipos.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import {
  ErrorCopias, TAMANO_PARTE, INDICE_MAXIMO, CLAVE_ORIGENES, rutaSegura, nombreParte, nombreIndice, carpetaDelMes, armarIndice, sha256Hex, leerIndice, pareceIndice,
} from './formato.js';
import { generarCopia } from './generar.js';
import { volcar as volcarDeVerdad } from './volcado.js';
import {
  TOPES, ajustesCopias, servidorId, servidorActual, llaveActiva, llavePorId, planDeDisco, topesDeIntento, empezarCopia, actualizarCopia, guardarParte,
  actualizarParte, partesDe, ultimaFueraPorId, ultimaCreible, revisarFechasFuturas, selloDe, kdfDeLlave, RECIENTE_MS,
} from './estado.js';
import { conCredencial } from '../canales/credencial.js';
import { ADAPTADORES, esPasajero } from '../canales/canal.js';
import { USO, canalActual, canalActivo, pausa429De, pausarCanal, anotarProblema, anotarEnvio, marcarBien } from '../canales/canales.js';
import { textoCopia, idiomaDelDueno } from '../canales/textos.js';

const MINUTO = 60_000;
const MB = 1024 * 1024;

// Los ids de los servidores de antes de restaurar (ajustes «servidor.origenes», los anota ajustarTrasRestaurar).
function origenesDe(db) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_ORIGENES)?.valor ?? '[]');
    return Array.isArray(v) ? v.map(o => String(o?.id ?? o)) : [];
  } catch { return []; }
}
const iso = ms => new Date(ms).toISOString();
// Lo que el canal dice que NO se arregla esperando (hay que hacer algo en Telegram o en Claves).
const PROBLEMAS_DEL_CANAL = Object.freeze(['clave_no_valida', 'bloqueado', 'chat_no_existe', 'sin_clave']);
// Errores del volcado que son del código (no se arreglan solos): la copia falla de una vez.
const FALLAS_DEL_VOLCADO = Object.freeze(['volcado_incompleto', 'volcado_no_soportado', 'volcado_danado']);
// Errores al escribir en el disco del servidor que no se arreglan reintentando enseguida (lleno, sin inodos, cuota, solo
// lectura, E/S): la copia sigue sin guardar aquí.
export const ERRORES_DE_DISCO = Object.freeze(['ENOSPC', 'EDQUOT', 'EIO', 'EROFS', 'EFBIG']);
const esErrorDeDisco = error => ERRORES_DE_DISCO.includes(error?.code);

// Revisión final: directo a Telegram (sin copia en el disco, con la foto abierta) cada parte mide como mucho 1 MiB. Medido
// con una base de 187 MB, con partes de 2 MiB el trabajador llegaba a 112–116 MB (su tope es 120 MB); la parte en la
// memoria, su envío y lo que el sistema guarda de la respuesta se cuentan dos veces por parte. El formato no cambia
// (cada parte dice su largo); solo hay el doble de partes.
export const TAMANO_PARTE_DIRECTO = 1024 * 1024;

export const OPCIONES_COPIAS = Object.freeze({
  tamanoParte: TAMANO_PARTE,
  pasoCortoMs: 60_000, // subir y verificar vuelven cada ~60 s con su avance guardado
  esperaInternaMaxMs: 60_000, // un 429 de hasta 60 s se espera adentro del paso (subir, verificar, índice)
  esperaFotoMaxMs: 10_000, // con la foto abierta, solo hasta 10 s
  esperaReinicioMs: 10 * MINUTO, // una copia nueva después de un problema: no antes de 10 min
  caducaMs: 20 * 3_600_000, // una copia de la noche que se toma 20 h tarde ya no se hace (viene otra)
  recienteMs: RECIENTE_MS, // la de la noche no se hace si ya hay una comprobada de hace menos de 6 h
  intentosRedPreparar: 2, esperaRedPrepararMs: 10 * MINUTO, // Telegram no responde al empezar: 2 esperas de 10 min
  presupuestoFoto: Object.freeze({ walMb: 64, libreMinMb: 500, ms: 25 * MINUTO }),
  pausaArchivosMs: null, // null = la del adaptador (≥ 1,1 s entre documentos)
  reintentosParte: 2,
  esperasFijarMs: Object.freeze([1, 5, 15, 30, 60].map(m => m * MINUTO)), // fijar el índice: un reintento tras cada espera
});

function tamanoMb(ruta) {
  try { return statSync(ruta).size / MB; } catch { return 0; }
}

// Escribe un archivo NUEVO entero ('wx': nunca pisa uno) y lo baja al disco (fsync).
function escribirNuevo(ruta, datos, modo = 0o640) {
  const fd = openSync(rutaSegura(ruta), 'wx', modo);
  try {
    let hecho = 0;
    while (hecho < datos.length) hecho += writeSync(fd, datos, hecho, datos.length - hecho);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

async function hashDeArchivo(ruta, senal) {
  const h = createHash('sha256');
  for await (const pedazo of createReadStream(rutaSegura(ruta), { signal: senal ?? undefined })) h.update(pedazo);
  return h.digest('hex');
}

export function crearManejadorCopias(opciones = {}) {
  const O = { ...OPCIONES_COPIAS, ...opciones };
  const adaptador = O.adaptador ?? ADAPTADORES.telegram;
  const volcar = O.volcar ?? volcarDeVerdad;
  const reloj = O.reloj ?? Date.now;
  const pausaArchivos = O.pausaArchivosMs ?? adaptador.limites?.pausaArchivosMs ?? 1100;
  const dormir = O.dormir ?? ((ms, senal) => esperarCon(Math.max(0, ms), undefined, { signal: senal ?? undefined }));
  const medirDisco = config => (O.discoLibreMb ? O.discoLibreMb(config, 'datos') : discoDelServidor(config.carpetaDatos ?? config.carpetaCopias));
  // El disco de la carpeta de las copias (OPORTIA_COPIAS puede ser otro disco): { libreMb, mismoDisco }.
  const medirDiscoCopias = config => {
    if (O.discoCopias) return O.discoCopias(config);
    if (O.discoLibreMb) return { libreMb: O.discoLibreMb(config, 'copias'), mismoDisco: true };
    return discoDeCopias(config.carpetaCopias, config.carpetaDatos);
  };
  const escribirArchivo = O.escribirArchivo ?? escribirNuevo; // las pruebas lo cambian para imitar un disco lleno
  const medirWal = config => (O.walMb ? O.walMb(config) : tamanoMb(`${config.archivoBase}-wal`));
  const medirBase = config => (O.baseMb ? O.baseMb(config) : tamanoMb(config.archivoBase));

  const filaCopia = (db, id) => (id == null ? null : db.prepare('SELECT * FROM copias WHERE id = ?').get(id) ?? null);
  // ¿La foto de esta copia ya es vieja? (más de 20 h: una copia así se empieza otra vez, nunca se termina)
  const fotoVieja = copia => reloj() - Date.parse(copia.empezada_en) > O.caducaMs;
  // El chat de la copia, SOLO si sigue siendo el chat en uso del dueño (o null: lo dejó, unió otro, o se perdió).
  const chatDeLaCopia = (db, copia) => {
    const actual = canalActual(db);
    return actual && actual.id === copia.canal_id && actual.estado !== 'perdido' ? actual : null;
  };

  // Una copia nueva dentro de la misma tarea (nunca una tarea nueva), no antes de 10 min.
  async function reiniciar(ctx, copia, { motivo, estado = 'interrumpida', esperarMs = 0 }) {
    if (copia) {
      await ctx.escribir(() => actualizarCopia(ctx.db, copia.id, { estado, motivo: String(motivo).slice(0, 80), terminada_en: iso(reloj()) }));
    }
    return { punto: { paso: 'preparar', reinicio: String(motivo).slice(0, 60) }, esperarMs: Math.max(O.esperaReinicioMs, Number(esperarMs) || 0), motivo: String(motivo).slice(0, 60) };
  }

  // Falla de una vez (sin reintento): la copia queda «fallida» y el aviso copia_fallida (grave) se abre.
  async function fallar(ctx, copia, clave) {
    const ahora = reloj();
    await ctx.escribir(() => {
      if (copia) actualizarCopia(ctx.db, copia.id, { estado: 'fallida', motivo: clave, terminada_en: iso(ahora) });
      abrirAviso(ctx.db, { clave: 'copia_fallida', nivel: 'grave', detalle: { motivo: clave }, ahora });
    });
    throw new ErrorTarea(clave, { reintentable: false });
  }

  // Una espera por Telegram («espera N s»): cuenta en el punto. agotado: pasó los topes (12 esperas o 6 h).
  function cuentaEspera(punto, esperarMs) {
    const esperas = (punto.esperas ?? 0) + 1;
    const esperadoMs = (punto.esperadoMs ?? 0) + Math.max(0, Number(esperarMs) || 0);
    return { esperas, esperadoMs, agotado: esperas > TOPES.esperasPorCopia || esperadoMs > TOPES.esperaTotalMs };
  }
  const sinAgotado = ({ agotado, ...c }) => c;

  // Telegram no deja terminar (caído, o pide esperar sin fin) y la copia YA está entera en el disco del servidor: nunca
  // se pierde. Queda «solo en el servidor» (se comprueba leyéndola otra vez) y copia_solo_local lo dice. → el punto
  // siguiente, o null si no se puede (sin copia en el disco).
  async function quedarseAqui(ctx, copia, motivo, { aviso = true } = {}) {
    const db = ctx.db;
    const fila = filaCopia(db, copia.id);
    if (!fila || fila.local !== 1 || !['escrita', 'subida'].includes(fila.estado)) return null;
    const partes = partesDe(db, fila.id);
    if (!partes.length || !partes.every(p => p.archivo_local)) return null;
    await ctx.escribir(() => {
      actualizarCopia(db, fila.id, { fuera: false, motivo: String(motivo).slice(0, 80) });
      if (aviso) abrirAviso(db, { clave: 'copia_solo_local', nivel: 'atencion', detalle: { motivo: String(motivo).slice(0, 40) }, ahora: reloj() });
    });
    return { punto: { paso: 'verificar', copiaId: fila.id, n: 1 }, motivo: String(motivo).slice(0, 60) };
  }

  // Los topes de esperas se pasaron: la copia queda en el servidor si está entera allí; si no, falla.
  async function esperasAgotadas(ctx, copia) {
    const r = copia ? await quedarseAqui(ctx, copia, 'telegram_limite_largo') : null;
    if (r) return r;
    return fallar(ctx, copia, 'telegram_limite_largo');
  }

  // Corre fn(cred) con el MISMO bot de la copia (su secreto y su id de bot). → { salida } o { problema, esperarMs }.
  async function conElBot(ctx, copia, fn) {
    const r = await conCredencial(ctx.db, ctx.config, { uso: USO, secretoId: copia.secreto_id }, async cred => {
      const yo = await adaptador.probar(cred, { senal: ctx.senal });
      if (yo.motivo !== 'ok' && yo.motivo !== 'bot_ocupado') return { problema: yo.motivo, esperarMs: yo.esperarMs };
      if (!yo.cuenta || String(yo.cuenta.id) !== String(copia.cuenta_id)) return { problema: 'bot_cambiado' };
      return { salida: await fn(cred) };
    });
    if (r.motivo === 'credencial_cambiada') return { problema: 'bot_cambiado' };
    if (r.motivo) return { problema: r.motivo };
    return r;
  }

  // Qué hacer con un problema de Telegram en medio de una copia (subir, verificar, índice).
  async function atenderProblema(ctx, copia, punto, { problema, esperarMs }) {
    const db = ctx.db;
    const ahora = reloj();
    const canal = copia.canal_id ? db.prepare('SELECT * FROM canales WHERE id = ?').get(copia.canal_id) : null;
    if (problema === 'cancelado') throw new ErrorCopias('cancelada');
    if (problema === 'bot_cambiado') return reiniciar(ctx, copia, { motivo: 'bot_cambiado' });
    if (problema === 'chat_cambiado') {
      // El dueño dejó el chat (o unió otro) en medio: nada más va al chat viejo. Con las partes en el disco, la copia
      // termina como «solo en el servidor»; si no, se empieza otra (al chat de ahora, si hay uno).
      const enDisco = partesDe(db, copia.id).every(p => p.archivo_local);
      if (copia.local === 1 && enDisco) {
        await ctx.escribir(() => actualizarCopia(db, copia.id, { fuera: false, motivo: 'chat_cambiado' }));
        return { punto: { paso: 'verificar', copiaId: copia.id, n: 1 }, motivo: 'chat_cambiado' };
      }
      return reiniciar(ctx, copia, { motivo: 'chat_cambiado' });
    }
    if (problema === 'limite_largo') return esperasAgotadas(ctx, copia);
    if (problema === 'limite') {
      const c = cuentaEspera(punto, esperarMs);
      if (canal) await ctx.escribir(() => pausarCanal(db, canal.id, esperarMs, ahora));
      if (c.agotado) return esperasAgotadas(ctx, copia);
      return { punto: { ...punto, ...sinAgotado(c) }, esperarMs, motivo: 'telegram_limite' };
    }
    if (problema === 'clave_no_valida') {
      // Ronda 3: un 401 suelto es una SOSPECHA (el servidor web pregunta con getMe antes de dar el token por malo). La
      // copia se reintenta como con un error pasajero; en el último intento, si está entera en el disco, queda aquí.
      await ctx.escribir(() => { if (canal) anotarProblema(db, canal, { motivo: problema, secretoId: copia.secreto_id, ahora }); });
      const ultimoIntento = (ctx.tarea.intento ?? 1) >= (ctx.tarea.maxFallos ?? 3);
      if (ultimoIntento) {
        const r = await quedarseAqui(ctx, copia, 'telegram_clave_dudosa');
        if (r) return r;
      }
      throw new ErrorTarea('telegram_clave_dudosa');
    }
    if (PROBLEMAS_DEL_CANAL.includes(problema)) {
      // El canal no sirve (bloqueado, chat perdido, token malo): se marca, y si las partes están en el disco, la copia
      // termina igual como «solo en el servidor» (un canal roto nunca pierde la copia local).
      await ctx.escribir(() => {
        if (canal && problema !== 'sin_clave') anotarProblema(db, canal, { motivo: problema, esperarMs, secretoId: copia.secreto_id, ahora });
      });
      const enDisco = partesDe(db, copia.id).every(p => p.archivo_local);
      if (copia.local === 1 && enDisco) {
        await ctx.escribir(() => actualizarCopia(db, copia.id, { fuera: false, motivo: problema }));
        return { punto: { paso: 'verificar', copiaId: copia.id, n: 1 }, motivo: problema };
      }
      return reiniciar(ctx, copia, { motivo: problema, estado: 'fallida' });
    }
    // Pasajero (red, Telegram caído, una respuesta rara): se reintenta desde la misma parte (10, 30 min…). En el ÚLTIMO
    // intento que deja la tarea, una copia que ya está entera en el disco queda «solo en el servidor» (nunca se pierde).
    await ctx.escribir(() => { if (canal) db.prepare('UPDATE canales SET ultimo_error = ?, ultimo_error_en = ? WHERE id = ?').run(problema, iso(ahora), canal.id); });
    const ultimo = (ctx.tarea.intento ?? 1) >= (ctx.tarea.maxFallos ?? 3);
    if (ultimo) {
      const r = await quedarseAqui(ctx, copia, 'telegram_no_responde');
      if (r) return r;
    }
    throw new ErrorTarea(esPasajero(problema) ? problema : `telegram_${problema}`.slice(0, 60));
  }

  // Respeta la pausa del canal SOLO si es un 429 de Telegram (de antes, del servidor web o de otra copia): espera contada.
  // Las esperas tras fallos del que manda avisos no son de la copia (ella tiene sus propios reintentos).
  async function respetarPausa(ctx, copia, punto) {
    if (copia.fuera !== 1 || !copia.canal_id) return null;
    const canal = ctx.db.prepare('SELECT * FROM canales WHERE id = ?').get(copia.canal_id);
    const hasta = pausa429De(canal, reloj());
    if (!hasta) return null;
    const espera = hasta - reloj();
    const c = cuentaEspera(punto, espera);
    if (c.agotado) return esperasAgotadas(ctx, copia);
    return { punto: { ...punto, ...sinAgotado(c) }, esperarMs: espera, motivo: 'telegram_limite' };
  }

  // ---------- 1. preparar ----------
  async function preparar(ctx, punto) {
    const db = ctx.db;
    const ahora = reloj();
    const origen = ctx.tarea.datos?.origen === 'manual' ? 'manual' : 'noche';
    const tarea = db.prepare('SELECT creada_en FROM tareas WHERE id = ?').get(ctx.tarea.id);
    if (origen === 'noche' && tarea && ahora - Date.parse(tarea.creada_en) > O.caducaMs) return { listo: true, resultado: { saltada: 'caducada' } };
    const topes = topesDeIntento(db, { tareaId: ctx.tarea.id, ahora });
    if (topes.copiasDeTarea >= TOPES.copiasPorTarea || topes.subidasSinExitoHoy >= TOPES.subidasSinExitoPorDia) await fallar(ctx, null, 'copia_sin_exito');
    const canal = canalActivo(db);
    // Una copia con fecha del futuro (reloj adelantado y corregido): copias_fecha_futura. Nunca cuenta como reciente.
    await ctx.escribir(() => revisarFechasFuturas(db, ahora));
    if (origen === 'noche') {
      // «Reciente» por la hora CREÍBLE de la FOTO (nunca por cuándo se comprobó, nunca una del futuro).
      const reciente = ultimaCreible(db, { ahora, donde: "estado = 'verificada' OR (estado = 'solo_local' AND ? = 0)", valores: [canal ? 1 : 0] });
      if (reciente && reciente.efectivaMs >= ahora - O.recienteMs) return { listo: true, resultado: { saltada: 'reciente' } };
    }
    const llave = llaveActiva(db);
    if (!llave) {
      await ctx.escribir(() => abrirAviso(db, { clave: 'copias_sin_clave', nivel: 'atencion', ahora }));
      return { listo: true, resultado: { saltada: 'sin_clave' } };
    }
    // Ronda 3: el sello va envuelto con la llave de las claves. Si no se abre (la llave cambió: otro servidor, una llave
    // nueva), no se puede hacer ninguna copia auténtica: GRAVE, y la pantalla ofrece crear una clave nueva.
    const selloPrueba = selloDe(ctx.config, llave);
    if (!selloPrueba) {
      await ctx.escribir(() => abrirAviso(db, { clave: 'copias_clave_ilegible', nivel: 'grave', detalle: { huella: llave.huella }, ahora }));
      return { listo: true, resultado: { saltada: 'clave_ilegible' } };
    }
    selloPrueba.fill(0);
    await ctx.escribir(() => resolverAviso(db, 'copias_clave_ilegible', ahora));
    // ¿Cabe una copia en el disco de la carpeta de las copias? (el freno y el piso de la base: el disco de los datos)
    const ultimaLocal = db.prepare("SELECT bytes FROM copias WHERE estado IN ('verificada', 'solo_local') AND bytes > 0 ORDER BY id DESC LIMIT 1").get();
    let libre = null;
    try { libre = medirDisco(ctx.config); } catch { libre = null; }
    let dc = { libreMb: null, mismoDisco: null };
    try { dc = medirDiscoCopias(ctx.config) ?? dc; } catch { dc = { libreMb: null, mismoDisco: null }; }
    const ajustes = ajustesCopias(db);
    const plan = planDeDisco({
      libreMb: libre, libreCopiasMb: dc.libreMb, mismoDisco: dc.mismoDisco !== false, baseMb: medirBase(ctx.config), walMb: medirWal(ctx.config),
      ultimaCopiaMb: ultimaLocal ? ultimaLocal.bytes / MB : null, ajusteLocal: ajustes.local,
    });
    // Esta tarea ya intentó guardar aquí y el disco no dejó (lleno, sin inodos…): esta vez, solo a Telegram.
    const local = plan.local && !punto.sinDisco;
    // ¿Se puede mandar a Telegram? (el chat unido, su token sirve, sin un 429 pendiente, y el bot responde)
    let fuera = null;
    let fijadoBien = null;
    let otroServidor = null;
    if (canal) {
      const hasta = pausa429De(canal, ahora);
      let rendido = false;
      if (hasta) {
        const c = cuentaEspera(punto, hasta - ahora);
        if (!c.agotado) return { punto: { ...punto, paso: 'preparar', ...sinAgotado(c) }, esperarMs: hasta - ahora, motivo: 'telegram_limite' };
        if (!local) await fallar(ctx, null, 'telegram_limite_largo');
        rendido = true; // esperó lo más que se espera: esta noche, solo en el servidor
      }
      const r = rendido ? { problema: 'limite_largo' } : await conCredencial(db, ctx.config, { uso: USO }, async cred => {
        const yo = await adaptador.probar(cred, { senal: ctx.senal });
        if (yo.motivo !== 'ok' && yo.motivo !== 'bot_ocupado') return { problema: yo.motivo, esperarMs: yo.esperarMs };
        if (!yo.cuenta || (canal.cuenta_id && String(yo.cuenta.id) !== String(canal.cuenta_id))) return { problema: 'bot_cambiado' };
        // ¿Sigue fijado el índice de la última copia? (alguien con el token pudo quitarlo entre noches, u OTRO servidor
        // —el viejo, después de restaurar en uno nuevo— pudo fijar el suyo)
        const anterior = ultimaFueraPorId(db);
        if (anterior?.indice_mensaje_id && anterior.fijada === 1 && anterior.canal_id === canal.id) {
          const f = await adaptador.fijado(cred, { destino: canal.destino, senal: ctx.senal });
          if (f.motivo === 'ok') {
            fijadoBien = f.mensajeId === anterior.indice_mensaje_id;
            if (!fijadoBien && f.documento) otroServidor = await servidorDelFijado(ctx, cred, f.documento, llave);
          }
        }
        return { secretoId: cred.secretoId, cuentaId: String(yo.cuenta.id) };
      });
      const problema = r.motivo ?? r.problema ?? null;
      if (!problema) fuera = { secretoId: r.secretoId, cuentaId: r.cuentaId };
      else if (problema === 'cancelado') throw new ErrorCopias('cancelada');
      else if (problema === 'limite_largo') { /* solo en el servidor */ }
      else if (problema === 'limite') {
        await ctx.escribir(() => pausarCanal(db, canal.id, r.esperarMs, ahora));
        const c = cuentaEspera(punto, r.esperarMs);
        if (!c.agotado) return { punto: { ...punto, paso: 'preparar', ...sinAgotado(c) }, esperarMs: r.esperarMs, motivo: 'telegram_limite' };
        if (!local) await fallar(ctx, null, 'telegram_limite_largo');
      } else if (problema === 'bot_cambiado') {
        // El token de ahora es de OTRO bot que el del chat: nada va a ese chat hasta unirlo otra vez. Se avisa (si no, las
        // copias quedarían solo aquí en silencio hasta copia_atrasada).
        await ctx.escribir(() => abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'bot_cambiado' }, ahora }));
      } else if (PROBLEMAS_DEL_CANAL.includes(problema)) {
        // (un token que la base ya da por malo no es una respuesta nueva de Telegram: no se anota otra vez)
        const deTelegram = r.problema != null;
        if (problema !== 'sin_clave' && (deTelegram || problema !== 'clave_no_valida')) await ctx.escribir(() => anotarProblema(db, canal, { motivo: problema, esperarMs: r.esperarMs, ahora }));
        // Un 401 (o 404) a getMe es una sospecha (ronda 3): se espera como con la red, y el servidor web pregunta otra vez.
        if (problema === 'clave_no_valida' && deTelegram && (punto.intentosRed ?? 0) < O.intentosRedPreparar) {
          return { punto: { ...punto, paso: 'preparar', intentosRed: (punto.intentosRed ?? 0) + 1 }, esperarMs: O.esperaRedPrepararMs, motivo: 'telegram_clave_dudosa' };
        }
      } else if ((punto.intentosRed ?? 0) < O.intentosRedPreparar) {
        // Telegram no responde: se espera un poco (2 × 10 min); después, la copia sigue solo en el servidor esta noche.
        return { punto: { ...punto, paso: 'preparar', intentosRed: (punto.intentosRed ?? 0) + 1 }, esperarMs: O.esperaRedPrepararMs, motivo: 'telegram_no_responde' };
      }
    }
    if (!fuera && !local) {
      await ctx.escribir(() => {
        if (!canal) abrirAviso(db, { clave: 'copias_sin_telegram', nivel: 'atencion', ahora });
        if (plan.motivo === 'disco') abrirAviso(db, { clave: 'copias_locales_pausadas', nivel: 'atencion', detalle: { libreMb: plan.libreMb }, ahora });
      });
      if (punto.sinDisco) await fallar(ctx, null, 'disco_lleno');
      return { listo: true, resultado: { saltada: 'sin_destino' } };
    }
    const copiaId = await ctx.escribir(() => {
      const servidor = servidorId(db, { ahora });
      if (!canal) abrirAviso(db, { clave: 'copias_sin_telegram', nivel: 'atencion', ahora });
      if (ajustes.local && plan.motivo === 'disco') abrirAviso(db, { clave: 'copias_locales_pausadas', nivel: 'atencion', detalle: { libreMb: plan.libreMb }, ahora });
      else if (local) resolverAviso(db, 'copias_locales_pausadas', ahora);
      if (fijadoBien === true) resolverAviso(db, 'copias_otro_servidor', ahora);
      if (fijadoBien === false) {
        abrirAviso(db, { clave: 'copia_sin_fijar', nivel: 'atencion', ahora });
        const anterior = ultimaFueraPorId(db);
        if (anterior) actualizarCopia(db, anterior.id, { fijada: false });
      }
      // El mensaje fijado es el índice de una copia de OTRO servidor (el viejo, que sigue vivo con el mismo bot, o uno que
      // no es este): restaurar desde Telegram tomaría esa. GRAVE: hay que apagar el otro o revocar el token en BotFather.
      if (otroServidor) {
        abrirAviso(db, { clave: 'copias_otro_servidor', nivel: 'grave', detalle: { viejo: otroServidor.viejo, servidor: otroServidor.servidor.slice(0, 8) }, ahora });
      }
      return empezarCopia(db, {
        copia: randomUUID(), origen, tareaId: ctx.tarea.id, llaveId: llave.id, receptor: llave.huella, local, fuera: Boolean(fuera),
        canalId: fuera ? canal.id : null, secretoId: fuera?.secretoId ?? null, cuentaId: fuera?.cuentaId ?? null, servidor,
        version: ctx.version ?? null, empezadaEn: iso(ahora),
      });
    });
    return { punto: { paso: 'generar', copiaId, ...(punto.sinDisco ? { sinDisco: true } : {}) } };
  }

  // El documento fijado en el chat no es el índice de nuestra última copia: si es el índice auténtico de una copia de
  // OTRO servidor (firmado con nuestro sello), → { servidor, viejo } (viejo: es un servidor de antes de restaurar).
  // Cualquier otra cosa (un archivo raro, un índice que no se entiende, la red) → null. Nunca lanza.
  async function servidorDelFijado(ctx, cred, documento, llave) {
    try {
      if (!documento?.archivoId || (documento.bytes != null && documento.bytes > INDICE_MAXIMO)) return null;
      const a = await adaptador.archivo(cred, { archivoId: documento.archivoId, senal: ctx.senal });
      if (a.motivo !== 'ok' || (a.bytes != null && a.bytes > INDICE_MAXIMO)) return null;
      const pedazos = [];
      let total = 0;
      const b = await adaptador.bajar(cred, { ruta: a.ruta, topeBytes: INDICE_MAXIMO, senal: ctx.senal, alTrozo: async x => { total += x.length; if (total <= INDICE_MAXIMO) pedazos.push(Buffer.from(x)); } });
      if (b.motivo !== 'ok') return null;
      const texto = Buffer.concat(pedazos).toString('utf8');
      if (!pareceIndice(texto)) return null;
      const sello = selloDe(ctx.config, llave);
      if (!sello) return null;
      let datos;
      try { datos = leerIndice(texto, { sello }); } finally { sello.fill(0); }
      const propio = servidorActual(ctx.db);
      if (!datos?.servidor || String(datos.servidor) === propio) return null;
      const origenes = origenesDe(ctx.db);
      return { servidor: String(datos.servidor), viejo: origenes.includes(String(datos.servidor)) };
    } catch {
      return null;
    }
  }

  // ---------- 2. generar ----------
  async function generar(ctx, punto) {
    const db = ctx.db;
    const copia = filaCopia(db, punto.copiaId);
    if (!copia || copia.estado !== 'haciendo') return { punto: { paso: 'preparar' } };
    if (fotoVieja(copia)) return reiniciar(ctx, copia, { motivo: 'foto_vieja' });
    // Una copia nunca mezcla dos fotos: si este paso ya empezó antes (se cortó, se apagó el trabajador), otra copia.
    const primera = await ctx.escribir(() => db.prepare("UPDATE copias SET detalle = 'generando' WHERE id = ? AND detalle IS NULL").run(copia.id).changes === 1);
    if (!primera || partesDe(db, copia.id).length) return reiniciar(ctx, copia, { motivo: 'foto_interrumpida' });
    const llave = llavePorId(db, copia.llave_id);
    if (!llave) return fallar(ctx, copia, 'sin_llave');
    const directo = copia.fuera === 1 && copia.local === 0;
    if (directo) {
      const r = await conElBot(ctx, copia, cred => generarYGuardar(ctx, copia, llave, cred));
      if (r.problema) {
        if (r.problema === 'limite') {
          const canal = db.prepare('SELECT * FROM canales WHERE id = ?').get(copia.canal_id);
          if (canal) await ctx.escribir(() => pausarCanal(db, canal.id, r.esperarMs, reloj()));
          return reiniciar(ctx, copia, { motivo: 'telegram_limite', esperarMs: r.esperarMs });
        }
        if (r.problema === 'cancelado') throw new ErrorCopias('cancelada');
        if (PROBLEMAS_DEL_CANAL.includes(r.problema)) {
          const canal = db.prepare('SELECT * FROM canales WHERE id = ?').get(copia.canal_id);
          if (canal && r.problema !== 'sin_clave') await ctx.escribir(() => anotarProblema(db, canal, { motivo: r.problema, secretoId: copia.secreto_id, ahora: reloj() }));
          return reiniciar(ctx, copia, { motivo: r.problema, estado: 'fallida' });
        }
        return reiniciar(ctx, copia, { motivo: r.problema });
      }
      return r.salida;
    }
    return generarYGuardar(ctx, copia, llave, null);
  }

  async function generarYGuardar(ctx, copia, llave, cred) {
    const db = ctx.db;
    const config = ctx.config;
    const directo = cred != null;
    const publica = Buffer.from(llave.publica, 'base64url');
    const sello = selloDe(config, llave);
    if (!sello) return fallar(ctx, copia, 'clave_ilegible');
    const creada = copia.empezada_en;
    const carpeta = join(config.carpetaCopias, 'cifradas', carpetaDelMes(creada));
    const idioma = directo ? idiomaDelDueno(db) : 'es';
    const canal = directo ? db.prepare('SELECT * FROM canales WHERE id = ?').get(copia.canal_id) : null;
    const presupuesto = O.presupuestoFoto;
    let foto = null;
    let walInicio = 0;
    let inicio = 0;
    let ultimoDocumento = 0;
    const alParte = async ({ n, desde, archivo, sha256 }) => {
      if (!directo) {
        const ruta = join(carpeta, nombreParte(copia.copia, creada, n));
        try {
          mkdirSync(carpeta, { recursive: true, mode: 0o750 });
          escribirArchivo(ruta, archivo);
        } catch (error) {
          // El disco de las copias no deja escribir (lleno, sin inodos, E/S): esta copia no se termina aquí.
          if (esErrorDeDisco(error)) throw new ErrorCopias('disco_local', { codigo: error.code, n });
          throw error;
        }
        await ctx.escribir(() => guardarParte(db, { copiaId: copia.id, n, desde, bytes: archivo.length, sha256, archivoLocal: ruta }));
        return;
      }
      // Directo a Telegram con la foto abierta: el presupuesto se mide ANTES de cada parte. Pasado → la foto se cierra.
      // Y el chat: si el dueño lo dejó o unió otro, ninguna parte más va al chat viejo.
      if (!chatDeLaCopia(db, copia)) throw new ErrorCopias('telegram', { motivo: 'chat_cambiado' });
      let libre = null;
      try { libre = medirDisco(config); } catch { libre = null; }
      if (medirWal(config) - walInicio > presupuesto.walMb || (libre != null && libre < presupuesto.libreMinMb) || reloj() - inicio > presupuesto.ms) {
        throw new ErrorCopias('foto_larga');
      }
      const falta = pausaArchivos - (reloj() - ultimoDocumento);
      if (falta > 0) await dormir(falta, ctx.senal);
      globalThis.gc?.(); // antes de mandarla también: lo de la parte anterior no se suma a esta
      let r;
      for (let vueltas = 0; ; vueltas++) {
        r = await adaptador.enviarArchivo(cred, {
          destino: canal.destino, nombre: nombreParte(copia.copia, creada, n), datos: archivo, silencioso: true, senal: ctx.senal,
          leyenda: textoCopia('parte', idioma, { creada, n }),
        });
        ultimoDocumento = reloj();
        if (r.motivo === 'limite' && (r.esperarMs ?? Infinity) <= O.esperaFotoMaxMs && vueltas < 3) { await dormir(r.esperarMs, ctx.senal); continue; }
        break;
      }
      if (r.motivo !== 'ok') throw new ErrorCopias('telegram', { motivo: r.motivo, esperarMs: r.esperarMs ?? null });
      if (r.archivo.bytes != null && r.archivo.bytes !== archivo.length) throw new ErrorCopias('parte_distinta', { n });
      const momento = reloj();
      await ctx.escribir(() => {
        guardarParte(db, { copiaId: copia.id, n, desde, bytes: archivo.length, sha256, mensajeId: r.mensajeId, archivoId: r.archivo.id, idUnico: r.archivo.idUnico, subidaEn: iso(momento) });
        anotarEnvio(db, { canalId: canal.id, clase: 'copia_parte', copiaId: copia.id, resultado: 'enviado', mensajeId: r.mensajeId, bytes: archivo.length, ahora: momento });
      });
      globalThis.gc?.();
    };
    let resultado;
    try {
      foto = abrirFotoDeLectura(config);
      walInicio = medirWal(config);
      inicio = reloj();
      resultado = await generarCopia({
        foto: foto.db, publica, sello, alParte, copia: copia.copia, creada, servidor: copia.servidor, version: ctx.version ?? null,
        codigo: ctx.codigo ?? null, tamanoParte: directo ? Math.min(O.tamanoParte, TAMANO_PARTE_DIRECTO) : O.tamanoParte, ceder: ctx.ceder, senal: ctx.senal, volcar, kdf: kdfDeLlave(db, llave),
      });
    } catch (error) {
      foto?.cerrar();
      foto = null;
      if (!(error instanceof ErrorCopias)) throw error; // el disco, la base…: se reintenta (y la próxima vez es otra copia)
      if (error.clave === 'cancelada') throw error;
      if (FALLAS_DEL_VOLCADO.includes(error.clave) || error.clave.startsWith('fila_muy_grande')) return fallar(ctx, copia, error.clave);
      if (error.clave === 'foto_larga') return reiniciar(ctx, copia, { motivo: 'foto_larga' });
      if (error.clave === 'disco_local') return sinDiscoLocal(ctx, copia, error.datos?.codigo);
      if (error.clave === 'parte_distinta') return reiniciar(ctx, copia, { motivo: `parte_distinta:${error.datos?.n ?? 0}`, estado: 'fallida' });
      if (error.clave === 'telegram') {
        const motivo = error.datos?.motivo ?? 'sin_red';
        if (motivo === 'cancelado') throw new ErrorCopias('cancelada');
        if (motivo === 'limite') {
          if (canal) await ctx.escribir(() => pausarCanal(db, canal.id, error.datos?.esperarMs, reloj()));
          return reiniciar(ctx, copia, { motivo: 'telegram_limite', esperarMs: error.datos?.esperarMs });
        }
        if (PROBLEMAS_DEL_CANAL.includes(motivo)) {
          if (canal) await ctx.escribir(() => anotarProblema(db, canal, { motivo, secretoId: copia.secreto_id, ahora: reloj() }));
          return reiniciar(ctx, copia, { motivo, estado: 'fallida' });
        }
        return reiniciar(ctx, copia, { motivo });
      }
      throw error;
    } finally {
      foto?.cerrar();
      sello.fill(0);
    }
    const momento = reloj();
    await ctx.escribir(() => actualizarCopia(db, copia.id, {
      partes: resultado.partes, bytes: resultado.bytes, sha256: resultado.sha256, volcado_bytes: resultado.volcado.bytes,
      volcado_sha256: resultado.volcado.sha256, tablas: resultado.tablas, filas: resultado.filas, sellado: resultado.sellado,
      migracion: resultado.migracion, version: resultado.resumen?.version ?? ctx.version ?? null, escrita_en: iso(momento),
      estado: directo ? 'subida' : 'escrita', ...(directo ? { subida_en: iso(momento) } : {}), detalle: null,
    }));
    const siguiente = copia.fuera === 1 && !directo ? 'subir' : 'verificar';
    return { punto: { paso: siguiente, copiaId: copia.id, n: 1 } };
  }

  // El disco de las copias no dejó escribir una parte. La copia a medias queda «interrumpida» (sus archivos se quedan:
  // nunca se borra nada) y copias_locales_pausadas lo dice. Si va a Telegram, la MISMA tarea empieza otra copia que va
  // directo a Telegram (sin escribir aquí); si no, falla (copia_fallida, grave).
  async function sinDiscoLocal(ctx, copia, codigo) {
    const db = ctx.db;
    const ahora = reloj();
    await ctx.escribir(() => {
      actualizarCopia(db, copia.id, { estado: 'interrumpida', motivo: 'disco_lleno', terminada_en: iso(ahora) });
      abrirAviso(db, { clave: 'copias_locales_pausadas', nivel: 'atencion', detalle: { motivo: 'escribir', codigo: String(codigo ?? '').slice(0, 12) }, ahora });
    });
    if (copia.fuera !== 1) return fallar(ctx, null, 'disco_lleno');
    return { punto: { paso: 'preparar', reinicio: 'disco_lleno', sinDisco: true }, esperarMs: O.esperaReinicioMs, motivo: 'disco_lleno' };
  }

  // ---------- 3. subir (las partes del disco a Telegram; se reanuda en la parte n) ----------
  async function subir(ctx, punto) {
    const db = ctx.db;
    const copia = filaCopia(db, punto.copiaId);
    if (!copia || !['escrita', 'subida'].includes(copia.estado)) return { punto: { paso: 'preparar' } };
    if (fotoVieja(copia)) return reiniciar(ctx, copia, { motivo: 'foto_vieja' });
    if (copia.fuera !== 1) return { punto: { paso: 'verificar', copiaId: copia.id, n: 1 } };
    if (!chatDeLaCopia(db, copia)) return atenderProblema(ctx, copia, punto, { problema: 'chat_cambiado' });
    const pausa = await respetarPausa(ctx, copia, punto);
    if (pausa) return pausa;
    let estadoPunto = { ...punto };
    const r = await conElBot(ctx, copia, async cred => {
      const idioma = idiomaDelDueno(db);
      const limite = reloj() + O.pasoCortoMs;
      let ultimoDocumento = 0;
      let hechas = 0; // cada llamada sube al menos una parte; después vuelve cuando pasa su tiempo (~60 s)
      for (const p of partesDe(db, copia.id)) {
        if (p.n < (estadoPunto.n ?? 1) || p.archivo_id) continue;
        let intentos = p.intentos ?? 0;
        for (;;) {
          if (hechas > 0 && reloj() > limite) return { punto: { ...estadoPunto, paso: 'subir', n: p.n } };
          const falta = pausaArchivos - (reloj() - ultimoDocumento);
          if (falta > 0) await dormir(falta, ctx.senal);
          // Antes de CADA parte: ¿sigue siendo el chat del dueño? (pudo dejarlo o unir otro mientras se esperaba)
          const canal = chatDeLaCopia(db, copia);
          if (!canal) return { problema: 'chat_cambiado', n: p.n };
          const datos = await openAsBlob(rutaSegura(p.archivo_local));
          const s = await adaptador.enviarArchivo(cred, {
            destino: canal.destino, nombre: nombreParte(copia.copia, copia.empezada_en, p.n), datos, silencioso: true, senal: ctx.senal,
            leyenda: textoCopia('parte', idioma, { creada: copia.empezada_en, n: p.n, de: copia.partes }),
          });
          ultimoDocumento = reloj();
          if (s.motivo === 'limite') {
            const c = cuentaEspera(estadoPunto, s.esperarMs);
            if (c.agotado) return { problema: 'limite_largo', n: p.n };
            estadoPunto = { ...estadoPunto, ...sinAgotado(c) };
            if ((s.esperarMs ?? Infinity) <= O.esperaInternaMaxMs) { await dormir(s.esperarMs, ctx.senal); continue; }
            await ctx.escribir(() => pausarCanal(db, copia.canal_id, s.esperarMs, reloj()));
            return { punto: { ...estadoPunto, paso: 'subir', n: p.n }, esperarMs: s.esperarMs, motivo: 'telegram_limite' };
          }
          if (s.motivo !== 'ok') return { problema: s.motivo, esperarMs: s.esperarMs, n: p.n };
          if (s.archivo.bytes != null && s.archivo.bytes !== p.bytes) {
            // Telegram dice otro tamaño: se sube otra vez (como mucho 2 veces por parte).
            intentos += 1;
            await ctx.escribir(() => actualizarParte(db, p.id, { intentos, ultimo_error: 'tamano_distinto' }));
            if (intentos > O.reintentosParte) return { distinta: p.n };
            continue;
          }
          const momento = reloj();
          await ctx.escribir(() => {
            actualizarParte(db, p.id, { mensaje_id: s.mensajeId, archivo_id: s.archivo.id, archivo_id_unico: s.archivo.idUnico, subida_en: iso(momento) });
            anotarEnvio(db, { canalId: copia.canal_id, clase: 'copia_parte', copiaId: copia.id, resultado: 'enviado', mensajeId: s.mensajeId, bytes: p.bytes, ahora: momento });
          });
          globalThis.gc?.();
          hechas += 1;
          break;
        }
      }
      await ctx.escribir(() => actualizarCopia(db, copia.id, { estado: 'subida', subida_en: iso(reloj()) }));
      return { punto: { ...estadoPunto, paso: 'verificar', n: 1 } };
    });
    if (r.problema) return atenderProblema(ctx, copia, { ...estadoPunto, n: r.n ?? estadoPunto.n }, r);
    if (r.salida?.problema) return atenderProblema(ctx, copia, { ...estadoPunto, n: r.salida.n ?? estadoPunto.n }, r.salida);
    if (r.salida?.distinta) return reiniciar(ctx, copia, { motivo: `parte_distinta:${r.salida.distinta}`, estado: 'fallida' });
    return r.salida;
  }

  // Baja un archivo de Telegram a un sha256 (nunca lo guarda entero). → { motivo, sha256, esperarMs }
  async function bajarHash(cred, archivoId, bytes, senal) {
    for (let vez = 0; vez < 2; vez++) {
      const a = await adaptador.archivo(cred, { archivoId, senal });
      if (a.motivo !== 'ok') return { motivo: a.motivo, esperarMs: a.esperarMs };
      if (a.bytes != null && a.bytes !== bytes) return { motivo: 'ok', sha256: null };
      const h = createHash('sha256');
      const b = await adaptador.bajar(cred, { ruta: a.ruta, topeBytes: bytes + 1, senal, alTrozo: async x => { h.update(x); } });
      if (b.motivo === 'ok') return { motivo: 'ok', sha256: b.bytes === bytes ? h.digest('hex') : null };
      if (b.motivo === 'demasiado_grande') return { motivo: 'ok', sha256: null };
      // El enlace de getFile pudo vencer: se pide otro una vez.
      if (b.motivo !== 'pedido_no_valido' || vez === 1) return { motivo: b.motivo, esperarMs: b.esperarMs };
    }
    return { motivo: 'respuesta_no_valida' };
  }

  // ---------- 4. verificar (cada parte bajada otra vez y comparada; la del disco, leída otra vez) ----------
  async function verificar(ctx, punto) {
    const db = ctx.db;
    const copia = filaCopia(db, punto.copiaId);
    if (!copia || !['escrita', 'subida'].includes(copia.estado)) return { punto: { paso: 'preparar' } };
    if (fotoVieja(copia)) return reiniciar(ctx, copia, { motivo: 'foto_vieja' });
    if (copia.fuera === 1 && !chatDeLaCopia(db, copia)) return atenderProblema(ctx, copia, punto, { problema: 'chat_cambiado' });
    const pausa = await respetarPausa(ctx, copia, punto);
    if (pausa) return pausa;
    let estadoPunto = { ...punto };
    const recorrer = async cred => {
      const limite = reloj() + O.pasoCortoMs;
      let hechas = 0;
      for (const p of partesDe(db, copia.id)) {
        if (p.n < (estadoPunto.n ?? 1) || p.verificada_en) continue;
        if (hechas > 0 && reloj() > limite) return { punto: { ...estadoPunto, paso: 'verificar', n: p.n } };
        if (p.archivo_local) {
          const h = await hashDeArchivo(p.archivo_local, ctx.senal);
          if (h !== p.sha256) return { discoDanado: p.n };
        }
        if (cred) {
          if (!chatDeLaCopia(db, copia)) return { problema: 'chat_cambiado', n: p.n };
          for (;;) {
            const b = await bajarHash(cred, p.archivo_id, p.bytes, ctx.senal);
            if (b.motivo === 'limite') {
              const c = cuentaEspera(estadoPunto, b.esperarMs);
              if (c.agotado) return { problema: 'limite_largo', n: p.n };
              estadoPunto = { ...estadoPunto, ...sinAgotado(c) };
              if ((b.esperarMs ?? Infinity) <= O.esperaInternaMaxMs) { await dormir(b.esperarMs, ctx.senal); continue; }
              await ctx.escribir(() => pausarCanal(db, copia.canal_id, b.esperarMs, reloj()));
              return { punto: { ...estadoPunto, paso: 'verificar', n: p.n }, esperarMs: b.esperarMs, motivo: 'telegram_limite' };
            }
            if (b.motivo !== 'ok') return { problema: b.motivo, esperarMs: b.esperarMs, n: p.n };
            if (b.sha256 !== p.sha256) {
              // Volvió distinta. Con la parte en el disco: se sube otra vez (como mucho 2 veces); sin ella, la copia falla.
              if (p.archivo_local && (p.intentos ?? 0) < O.reintentosParte) {
                await ctx.escribir(() => actualizarParte(db, p.id, { archivo_id: null, intentos: (p.intentos ?? 0) + 1, ultimo_error: `distinta:${p.archivo_id}`.slice(0, 200) }));
                return { punto: { ...estadoPunto, paso: 'subir', n: p.n } };
              }
              return { distinta: p.n };
            }
            break;
          }
        }
        await ctx.escribir(() => actualizarParte(db, p.id, { verificada_en: iso(reloj()) }));
        globalThis.gc?.(); // lo que se bajó (los pedazos de la respuesta) no espera a la próxima limpieza de memoria
        hechas += 1;
      }
      return { punto: { ...estadoPunto, paso: 'indice', n: null } };
    };
    let salida;
    if (copia.fuera === 1) {
      const r = await conElBot(ctx, copia, recorrer);
      if (r.problema) return atenderProblema(ctx, copia, estadoPunto, r);
      salida = r.salida;
    } else salida = await recorrer(null);
    if (salida.problema) return atenderProblema(ctx, copia, { ...estadoPunto, n: salida.n ?? estadoPunto.n }, salida);
    if (salida.discoDanado) return fallar(ctx, copia, `disco_distinto:${salida.discoDanado}`);
    if (salida.distinta) return reiniciar(ctx, copia, { motivo: `parte_distinta:${salida.distinta}`, estado: 'fallida' });
    return salida;
  }

  // ---------- 5. indice ----------
  function textoDelIndice(db, config, copia, llave) {
    const porN = new Map();
    for (const p of partesDe(db, copia.id)) porN.set(p.n, p);
    const partes = [...porN.values()].sort((a, b) => a.n - b.n).map(p => ({
      n: p.n, nombre: nombreParte(copia.copia, copia.empezada_en, p.n), bytes: p.bytes, sha256: p.sha256,
      telegram: copia.fuera === 1 && p.archivo_id ? { mensaje: p.mensaje_id, archivo: p.archivo_id, unico: p.archivo_id_unico } : null,
    }));
    const anterior = db.prepare("SELECT copia, empezada_en FROM copias WHERE estado = 'verificada' AND fuera = 1 AND id < ? ORDER BY id DESC LIMIT 1").get(copia.id);
    const sello = selloDe(config, llave);
    if (!sello) throw new ErrorCopias('clave_ilegible');
    try {
      return armarIndice({
        copia: copia.copia, creada: copia.empezada_en, servidor: copia.servidor, version: copia.version, migracion: copia.migracion,
        receptor: llave.huella, publica: llave.publica, bot: copia.fuera === 1 ? copia.cuenta_id : null,
        anterior: anterior ? { copia: anterior.copia, creada: anterior.empezada_en } : null,
        flujo: { bytes: copia.bytes, sha256: copia.sha256 }, partes, sellado: copia.sellado, kdf: kdfDeLlave(db, llave),
      }, sello);
    } finally {
      sello.fill(0);
    }
  }

  // El índice en la carpeta del servidor (nunca pisa: si ya está igual, sirve; si hay otro con ese nombre, otro nombre).
  function guardarIndiceLocal(config, copia, texto) {
    const carpeta = join(config.carpetaCopias, 'cifradas', carpetaDelMes(copia.empezada_en));
    mkdirSync(carpeta, { recursive: true, mode: 0o750 });
    const datos = Buffer.from(texto, 'utf8');
    const base = nombreIndice(copia.copia, copia.empezada_en);
    for (let i = 1; i <= 20; i++) {
      const ruta = join(carpeta, i === 1 ? base : base.replace(/\.txt$/, `-${i}.txt`));
      try {
        escribirArchivo(ruta, datos);
        return ruta;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        if (sha256Hex(readFileSync(rutaSegura(ruta))) === sha256Hex(datos)) return ruta;
      }
    }
    throw new ErrorTarea('indice_sin_nombre');
  }

  async function indice(ctx, punto) {
    const db = ctx.db;
    let copia = filaCopia(db, punto.copiaId);
    if (!copia || !['escrita', 'subida'].includes(copia.estado)) return { punto: { paso: 'preparar' } };
    if (fotoVieja(copia)) return reiniciar(ctx, copia, { motivo: 'foto_vieja' });
    if (copia.fuera === 1 && !chatDeLaCopia(db, copia)) return atenderProblema(ctx, copia, punto, { problema: 'chat_cambiado' });
    const llave = llavePorId(db, copia.llave_id);
    if (!llave) return fallar(ctx, copia, 'sin_llave');
    let texto;
    try { texto = textoDelIndice(db, ctx.config, copia, llave); } catch (error) { if (error?.clave === 'clave_ilegible') return fallar(ctx, copia, 'clave_ilegible'); throw error; }
    const hash = sha256Hex(Buffer.from(texto, 'utf8'));
    if (copia.local === 1) {
      try {
        guardarIndiceLocal(ctx.config, copia, texto);
      } catch (error) {
        // El disco no deja escribir el índice: la copia sigue (sin índice en el servidor se restaura igual por sus partes).
        if (!esErrorDeDisco(error)) throw error;
        const momento = reloj();
        await ctx.escribir(() => abrirAviso(db, { clave: 'copias_locales_pausadas', nivel: 'atencion', detalle: { motivo: 'escribir', codigo: String(error.code).slice(0, 12) }, ahora: momento }));
      }
    }
    let fijada = false;
    let sinFijar = null; // por qué no quedó fijado (cuando ya no se reintenta)
    if (copia.fuera === 1) {
      const pausa = await respetarPausa(ctx, copia, punto);
      if (pausa) return pausa;
      const r = await conElBot(ctx, copia, async cred => {
        let canal = chatDeLaCopia(db, copia);
        if (!canal) return { problema: 'chat_cambiado' };
        // Subir (una vez: si ya se subió y se anotó, no se repite).
        if (!copia.indice_archivo_id || copia.indice_sha256 !== hash) {
          const s = await adaptador.enviarArchivo(cred, {
            destino: canal.destino, nombre: nombreIndice(copia.copia, copia.empezada_en), datos: Buffer.from(texto, 'utf8'), silencioso: true, senal: ctx.senal,
            leyenda: textoCopia('indice', idiomaDelDueno(db), { creada: copia.empezada_en, bytes: copia.bytes, partes: copia.partes }),
          });
          if (s.motivo !== 'ok') return { problema: s.motivo, esperarMs: s.esperarMs };
          const momento = reloj();
          await ctx.escribir(() => {
            actualizarCopia(db, copia.id, { indice_mensaje_id: s.mensajeId, indice_archivo_id: s.archivo.id, indice_sha256: hash });
            anotarEnvio(db, { canalId: canal.id, clase: 'copia_indice', copiaId: copia.id, resultado: 'enviado', mensajeId: s.mensajeId, bytes: Buffer.byteLength(texto), ahora: momento });
          });
          copia = filaCopia(db, copia.id);
        }
        // Bajarlo otra vez y comparar.
        const b = await bajarHash(cred, copia.indice_archivo_id, Buffer.byteLength(texto), ctx.senal);
        if (b.motivo !== 'ok') return { problema: b.motivo, esperarMs: b.esperarMs };
        if (b.sha256 !== hash) {
          const veces = (punto.indiceOtraVez ?? 0) + 1;
          await ctx.escribir(() => actualizarCopia(db, copia.id, { indice_archivo_id: null }));
          if (veces > O.reintentosParte) return { distinta: 'indice' };
          return { otraVez: veces };
        }
        // Fijarlo arriba en el chat, y comprobar que el fijado es el nuestro (restaurar desde Telegram lee el fijado).
        canal = chatDeLaCopia(db, copia);
        if (!canal) return { problema: 'chat_cambiado' };
        const f = await adaptador.fijar(cred, { destino: canal.destino, mensajeId: copia.indice_mensaje_id, senal: ctx.senal });
        if (f.motivo === 'limite' || f.motivo === 'cancelado') return { problema: f.motivo, esperarMs: f.esperarMs };
        if (f.motivo !== 'ok') return { sinFijar: f.motivo };
        const v = await adaptador.fijado(cred, { destino: canal.destino, senal: ctx.senal });
        if (v.motivo === 'limite' || v.motivo === 'cancelado') return { problema: v.motivo, esperarMs: v.esperarMs };
        if (v.motivo !== 'ok') return { sinFijar: v.motivo };
        if (v.mensajeId !== copia.indice_mensaje_id) return { sinFijar: 'otro_fijado' };
        fijada = true;
        return { listo: true };
      });
      if (r.problema) return atenderProblema(ctx, copia, punto, r);
      const s = r.salida;
      if (s.problema) return atenderProblema(ctx, copia, punto, s);
      if (s.distinta) return reiniciar(ctx, copia, { motivo: 'parte_distinta:indice', estado: 'fallida' });
      if (s.otraVez) return { punto: { ...punto, paso: 'indice', indiceOtraVez: s.otraVez } };
      if (s.sinFijar) {
        // Un error pasajero (Telegram caído, la red, otro mensaje fijado justo ahora) se reintenta con esperas; la copia
        // NO queda «verificada» mientras tanto. Lo que no se arregla esperando (o los reintentos acabados) termina la
        // copia sin fijar y abre copia_sin_fijar GRAVE: restaurar desde Telegram tomaría la copia fijada de antes.
        const veces = (punto.fijarIntentos ?? 0) + 1;
        const pasajero = esPasajero(s.sinFijar) || s.sinFijar === 'otro_fijado';
        if (pasajero && veces <= O.esperasFijarMs.length) {
          const momento = reloj();
          await ctx.escribir(() => db.prepare('UPDATE canales SET ultimo_error = ?, ultimo_error_en = ? WHERE id = ?').run(`fijar:${s.sinFijar}`.slice(0, 60), iso(momento), copia.canal_id));
          return { punto: { ...punto, paso: 'indice', fijarIntentos: veces }, esperarMs: O.esperasFijarMs[veces - 1], motivo: 'telegram_fijar' };
        }
        if (PROBLEMAS_DEL_CANAL.includes(s.sinFijar) && s.sinFijar !== 'sin_clave') {
          const canal = db.prepare('SELECT * FROM canales WHERE id = ?').get(copia.canal_id);
          await ctx.escribir(() => anotarProblema(db, canal, { motivo: s.sinFijar, secretoId: copia.secreto_id, ahora: reloj() }));
        }
        sinFijar = s.sinFijar;
      }
    }
    const ahora = reloj();
    const estado = copia.fuera === 1 ? 'verificada' : 'solo_local';
    await ctx.escribir(() => {
      actualizarCopia(db, copia.id, { estado, verificada_en: iso(ahora), terminada_en: iso(ahora), fijada, detalle: null });
      for (const clave of ['copia_fallida', 'copias_sin_clave']) resolverAviso(db, clave, ahora);
      if (copia.fuera === 1) {
        for (const clave of ['copia_atrasada', 'copias_sin_telegram', 'copia_solo_local']) resolverAviso(db, clave, ahora);
        if (fijada) resolverAviso(db, 'copia_sin_fijar', ahora);
        else abrirAviso(db, { clave: 'copia_sin_fijar', nivel: 'grave', detalle: { motivo: String(sinFijar ?? 'otro_fijado').slice(0, 40) }, ahora });
        if (copia.canal_id && !PROBLEMAS_DEL_CANAL.includes(sinFijar)) marcarBien(db, copia.canal_id, ahora);
      }
    });
    return { listo: true, resultado: { copia: copia.copia, estado, partes: copia.partes, bytes: copia.bytes, fijada } };
  }

  const PASOS = { preparar, generar, subir, verificar, indice };
  return Object.freeze({
    async paso(ctx) {
      const punto = ctx.tarea.punto && typeof ctx.tarea.punto === 'object' ? ctx.tarea.punto : { paso: 'preparar' };
      const hacer = PASOS[punto.paso ?? 'preparar'];
      if (!hacer) throw new ErrorTarea('punto_no_valido', { reintentable: false });
      return hacer(ctx, punto);
    },
  });
}

export const MANEJADOR_COPIAS = crearManejadorCopias();
