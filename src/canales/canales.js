// Los CANALES guardados en la base (tabla «canales», migración 6): hoy, el chat privado del dueño con su bot de Telegram
// (proposito 'avisos_dueno'). Lo usan el servidor web (unir el chat, el mensaje de prueba, el que manda los avisos) y el
// trabajador (las copias de cada noche). Genérico: la fase 3 agrega canales de clientes con otro «proposito» y su cuenta.
//  - Unir el chat (vincular): el dueño pide un código de 8 cifras de UN uso (10 min; 5 intentos por chat y 50 en total;
//    solo se guarda su huella) y se lo manda a su bot. La pantalla pregunta cada 3 s (revisarVinculo) y el servidor le pregunta a Telegram
//    como mucho una vez cada 3 s, sin quedarse escuchando: no hay un «escucha» permanente del bot.
//  - Un mensaje une el chat SOLO si las reglas de src/canales/vinculo.js lo aceptan (chat privado, no un bot, nuevo,
//    código exacto). A un extraño que le escriba al bot nunca se le contesta.
//  - Nada se borra: un chat que se deja de usar queda «desvinculado»; cada mensaje que sale queda en canal_envios.
//  - El token nunca entra aquí: solo pasa por src/canales/credencial.js (conCredencial).
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { anotarPrueba, secretoUsable } from '../claves/almacen.js';
import { estadoLlave } from '../claves/cifrado.js';
import { conCredencial } from './credencial.js';
import { ADAPTADORES, CLASES_ENVIO, RESULTADOS_ENVIO, ESTADOS_CANAL, USO_DE_CANAL, esPasajero } from './canal.js';
import { crearCodigo, huellaCodigo, codigoParaMostrar, revisarLote, leerCuenta, textoCuenta, VIGENCIA_MS } from './vinculo.js';
import { textoBienvenida, textoPrueba, idiomaDelDueno } from './textos.js';

export const TIPO = 'telegram';
export const PROPOSITO = 'avisos_dueno';
export const USO = USO_DE_CANAL.telegram;
export const CLAVE_BOT = 'telegram.bot'; // en «ajustes»: el bot del token guardado (id, @usuario, nombre), sin el token
export const REVISAR_CADA_MS = 3000;
// Cuántos mensajes se piden a Telegram por pregunta (getUpdates): pocos, para que la respuesta nunca pase del tope
// (src/canales/telegram.js), aunque un extraño mande muchos mensajes largos.
export const NOVEDADES_POR_VEZ = 10;
export const CLASES_QUE_CUENTAN = Object.freeze(['aviso', 'cierre', 'resumen', 'bienvenida', 'prueba']);
// Después de un error pasajero, esperar 1, 5, 15 y 60 minutos antes del próximo intento.
export const ESPERAS_TRAS_FALLO_MS = Object.freeze([60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]);
export const REINTENTO_BLOQUEADO_MS = 60 * 60_000;
export const PAUSA_MAXIMA_MS = 60 * 60_000;
// Ninguna pausa guardada puede pasar de PAUSA_MAXIMA_MS: una que pasa (más este margen) es de un reloj que iba adelantado
// y se corrigió hacia atrás. Se ignora (si no, los avisos graves quedarían parados todo lo que se movió el reloj).
export const MARGEN_RELOJ_MS = 60_000;
// Fallos pasajeros seguidos (red, Telegram caído) desde los que se abre telegram_falla «No llega a Telegram».
export const FALLOS_PARA_AVISAR = 4;
// Lo que no es un problema del canal (no cuenta como fallo).
const NO_ES_DEL_CANAL = Object.freeze(['ok', 'cancelado', 'sin_clave', 'credencial_cambiada']);

const iso = ms => new Date(ms).toISOString();
const RANGO = { info: 0, atencion: 1, grave: 2 };

export class ErrorCanal extends Error {
  constructor(clave, http = 409) {
    super(String(clave));
    this.name = 'ErrorCanal';
    this.clave = String(clave);
    this.http = http;
  }
}

function leerAjuste(db, clave) {
  const f = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!f) return null;
  try { return JSON.parse(f.valor); } catch { return null; }
}

function guardarAjuste(db, clave, valor, ahora) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(ahora));
}

// El chat del dueño que está en uso (activo, o con un problema que se puede arreglar), o null.
export function canalActual(db) {
  return db.prepare(`SELECT * FROM canales WHERE tipo = ? AND proposito = ? AND espacio_id IS NULL AND estado IN ('activo', 'bloqueado', 'perdido')
    ORDER BY id DESC LIMIT 1`).get(TIPO, PROPOSITO) ?? null;
}

export function canalActivo(db) {
  const c = canalActual(db);
  return c?.estado === 'activo' ? c : null;
}

export function canalPendiente(db, ahora = Date.now()) {
  const p = db.prepare("SELECT * FROM canales WHERE tipo = ? AND proposito = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1").get(TIPO, PROPOSITO);
  if (!p) return null;
  return { ...p, vencido: Date.parse(p.codigo_hasta) <= ahora };
}

// La fila de la clave del bot que está activa (o null).
export function secretoDelBot(db) {
  return db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(USO) ?? null;
}

export function anotarEnvio(db, { canalId, clase, avisoId = null, clave = null, nivel = null, copiaId = null, resultado, motivo = null, mensajeId = null, bytes = null, ahora = Date.now() }) {
  if (!CLASES_ENVIO.includes(clase)) throw new Error(`clase de envío no válida: ${clase}`);
  if (!RESULTADOS_ENVIO.includes(resultado)) throw new Error(`resultado de envío no válido: ${resultado}`);
  db.prepare(`INSERT INTO canal_envios (canal_id, clase, aviso_id, clave, nivel, copia_id, resultado, motivo, mensaje_id, bytes, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(canalId, clase, avisoId, clave, nivel, copiaId, resultado, motivo, mensajeId, bytes, iso(ahora));
}

// Cuántos mensajes de avisos salieron (no cuentan las partes de las copias: una base grande sube ~50 por noche). Las filas
// «del futuro» (anotadas con un reloj adelantado que después se corrigió) no cuentan: si no, los topes quedarían llenos.
export function enviadosDesde(db, canalId, desdeMs, ahora = Date.now()) {
  return db.prepare(`SELECT COUNT(*) AS n FROM canal_envios WHERE canal_id = ? AND resultado = 'enviado' AND creado_en >= ? AND creado_en <= ?
    AND clase IN (${CLASES_QUE_CUENTAN.map(() => '?').join(', ')})`).get(canalId, iso(desdeMs), iso(ahora + MARGEN_RELOJ_MS), ...CLASES_QUE_CUENTAN).n;
}

// Todo salió bien: el canal vuelve a «activo» y se cierra el aviso de que los mensajes no llegaban.
export function marcarBien(db, canalId, ahora = Date.now()) {
  const c = db.prepare('SELECT * FROM canales WHERE id = ?').get(canalId);
  if (!c) return;
  const estado = ['bloqueado', 'perdido'].includes(c.estado) ? 'activo' : c.estado;
  db.prepare('UPDATE canales SET estado = ?, ultimo_ok_en = ?, fallos_seguidos = 0, pausa_hasta = NULL, pausa_motivo = NULL WHERE id = ?').run(estado, iso(ahora), canalId);
  resolverAviso(db, 'telegram_falla', ahora);
}

// Telegram pidió esperar (429): nadie manda nada por ese canal hasta entonces (ni el servidor web ni el trabajador).
export function pausarCanal(db, canalId, esperarMs, ahora = Date.now()) {
  const hasta = ahora + Math.min(PAUSA_MAXIMA_MS, Math.max(1000, Number(esperarMs) || 1000));
  // Una pausa guardada más larga que la máxima (reloj corregido hacia atrás) se reemplaza, nunca se respeta. Queda
  // anotado que es un 429 (pausa_motivo 'limite'): es la única pausa que frena una copia (src/copias/hacer.js).
  const cambia = 'pausa_hasta IS NULL OR pausa_hasta < ? OR pausa_hasta > ?';
  db.prepare(`UPDATE canales SET pausa_hasta = CASE WHEN ${cambia} THEN ? ELSE pausa_hasta END,
    pausa_motivo = CASE WHEN ${cambia} THEN 'limite' ELSE pausa_motivo END WHERE id = ?`)
    .run(iso(hasta), iso(ahora + PAUSA_MAXIMA_MS + MARGEN_RELOJ_MS), iso(hasta), iso(hasta), iso(ahora + PAUSA_MAXIMA_MS + MARGEN_RELOJ_MS), canalId);
  return hasta;
}

// La pausa del canal (ms) o null. Una pausa que termina más allá de PAUSA_MAXIMA_MS desde ahora no puede ser de verdad
// (ninguna se guarda así): el reloj iba adelantado y se corrigió. Se ignora.
export function pausaDe(canal, ahora = Date.now()) {
  const ms = canal?.pausa_hasta ? Date.parse(canal.pausa_hasta) : NaN;
  if (!Number.isFinite(ms) || ms <= ahora) return null;
  return ms - ahora > PAUSA_MAXIMA_MS + MARGEN_RELOJ_MS ? null : ms;
}

// La pausa del canal SOLO si Telegram pidió esperar (un 429): la única que frena una copia. Las esperas tras fallos (las
// pone el que manda avisos) no son de la copia: ella tiene sus propios reintentos y, si no, se queda en el servidor.
export function pausa429De(canal, ahora = Date.now()) {
  return canal?.pausa_motivo === 'limite' ? pausaDe(canal, ahora) : null;
}

// Lo que se hace con un problema del canal (lo usan el que manda avisos y las copias). Una sola escritura corta.
//  bloqueado (403) → «bloqueado» (se vuelve a intentar cada hora) · chat_no_existe → «perdido» (hay que unirlo otra vez)
//  clave_no_valida (401) → la clave del bot queda marcada (Claves dice «pégala otra vez») · limite (429) → pausa
//  pasajero (red, Telegram caído) → esperas de 1, 5, 15 y 60 min; desde el 4.º seguido, telegram_falla «sin_respuesta».
//  cualquier otro (un 400 o 404 que no se conoce, 409, 413, un error de aquí) → las mismas esperas Y telegram_falla
//  «pedido» enseguida: nunca se reintenta cada 15 s sin fin, y las pantallas dicen que no llega.
export function anotarProblema(db, canal, { motivo, esperarMs = null, secretoId = null, ahora = Date.now() }) {
  if (!canal || NO_ES_DEL_CANAL.includes(motivo)) return;
  const momento = iso(ahora);
  db.prepare('UPDATE canales SET ultimo_error = ?, ultimo_error_en = ? WHERE id = ?').run(motivo, momento, canal.id);
  if (motivo === 'limite') { pausarCanal(db, canal.id, esperarMs, ahora); return; }
  if (motivo === 'bloqueado') {
    db.prepare("UPDATE canales SET estado = 'bloqueado', pausa_hasta = ?, pausa_motivo = 'bloqueado' WHERE id = ? AND estado IN ('activo', 'bloqueado')").run(iso(ahora + REINTENTO_BLOQUEADO_MS), canal.id);
    abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'bloqueado' }, ahora });
    return;
  }
  if (motivo === 'chat_no_existe') {
    db.prepare("UPDATE canales SET estado = 'perdido' WHERE id = ? AND estado IN ('activo', 'bloqueado', 'perdido')").run(canal.id);
    abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'perdido' }, ahora });
    return;
  }
  if (motivo === 'clave_no_valida') {
    const s = secretoId ?? canal.secreto_id;
    if (s != null) anotarPrueba(db, { id: s, motivo: 'clave_no_valida', ahora });
    abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'clave' }, ahora });
    return;
  }
  // Lo leído antes puede ser viejo (otro proceso anotó otro fallo): se cuenta sobre la fila de ahora.
  const fila = db.prepare('SELECT fallos_seguidos FROM canales WHERE id = ?').get(canal.id);
  const fallos = (fila?.fallos_seguidos ?? canal.fallos_seguidos ?? 0) + 1;
  const espera = ESPERAS_TRAS_FALLO_MS[Math.min(fallos, ESPERAS_TRAS_FALLO_MS.length) - 1];
  db.prepare("UPDATE canales SET fallos_seguidos = ?, pausa_hasta = ?, pausa_motivo = 'espera' WHERE id = ?").run(fallos, iso(ahora + espera), canal.id);
  if (!esPasajero(motivo)) abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'pedido' }, ahora });
  else if (fallos >= FALLOS_PARA_AVISAR) abrirAviso(db, { clave: 'telegram_falla', nivel: 'atencion', detalle: { motivo: 'sin_respuesta' }, ahora });
}

// ¿Se puede mandar por este canal AHORA? → { si, motivo, canal, secreto }
//  - tiene que haber un chat unido (activo, o bloqueado con su hora de reintento cumplida);
//  - la clave del bot activa tiene que servir y ser LA MISMA con la que se probó el bot de ese chat (si se cambió el token,
//    no se manda nada hasta que la prueba gratis pase: si es otro bot, el chat queda desvinculado);
//  - sin pausa (429 o esperas tras fallos).
export function listoParaMandar(db, config, ahora = Date.now()) {
  const canal = canalActual(db);
  if (!canal) return { si: false, motivo: 'sin_chat' };
  if (canal.estado === 'perdido') return { si: false, motivo: 'perdido', canal };
  const secreto = secretoDelBot(db);
  if (!secreto) return { si: false, motivo: 'sin_token', canal };
  const llave = estadoLlave(config);
  const usable = secretoUsable(secreto, ahora, llave.listo ? llave.huella : null);
  if (!usable.si && usable.motivo !== 'proveedor_en_pausa') return { si: false, motivo: usable.motivo === 'clave_no_valida' ? 'clave_no_valida' : 'sin_token', canal };
  if (canal.secreto_id !== secreto.id) return { si: false, motivo: 'sin_probar', canal };
  if (pausaDe(canal, ahora)) return { si: false, motivo: canal.estado === 'bloqueado' ? 'bloqueado' : 'pausa', canal };
  return { si: true, motivo: null, canal, secreto };
}

// La prueba gratis del token pasó (src/claves/probar.js): se anota el bot y, si el chat unido era de OTRO bot, ese chat
// queda desvinculado (hay que unirlo otra vez con el bot nuevo). Si es el mismo bot, el chat sigue con la clave nueva.
export function trasProbarToken(db, { secretoId, cuenta, ahora = Date.now() }) {
  if (!cuenta?.id) return;
  enTransaccion(db, () => {
    guardarAjuste(db, CLAVE_BOT, { id: String(cuenta.id), usuario: cuenta.usuario ?? null, nombre: cuenta.nombre ?? null, secretoId, probadoEn: iso(ahora) }, ahora);
    const canal = canalActual(db);
    if (!canal) return;
    if (canal.cuenta_id && canal.cuenta_id !== String(cuenta.id)) {
      db.prepare("UPDATE canales SET estado = 'desvinculado', desvinculado_en = ?, motivo = 'bot_cambiado' WHERE id = ?").run(iso(ahora), canal.id);
      auditar(db, { usuarioId: null, accion: 'telegram_desvinculado', detalle: 'otro bot' });
      return;
    }
    db.prepare('UPDATE canales SET secreto_id = ?, cuenta_id = ?, cuenta_nombre = ? WHERE id = ?').run(secretoId, String(cuenta.id), cuenta.usuario ?? null, canal.id);
  });
}

// El token del bot se cambió o se desactivó (src/api/claves.js, dentro de la misma transacción). No hace falta cambiar
// nada: el chat sigue atado a la clave con la que se probó (canales.secreto_id), así que no sale ningún mensaje hasta que
// la prueba gratis del token nuevo pase (trasProbarToken). → { pausado }
export function trasCambiarToken(db) {
  const canal = canalActual(db);
  const s = secretoDelBot(db);
  return { pausado: Boolean(canal && (!s || canal.secreto_id !== s.id)) };
}

export function botGuardado(db) {
  const b = leerAjuste(db, CLAVE_BOT);
  return b && typeof b === 'object' ? b : null;
}

// ---------- Unir el chat del dueño ----------

// POST /api/admin/telegram/vincular → { codigo, enlace, hasta }. Errores (ErrorCanal): sin_token · clave_no_valida ·
// bot_ocupado · telegram_no_responde.
export async function empezarVinculo(db, config, { usuarioId = null, ahora = Date.now, adaptador = ADAPTADORES.telegram } = {}) {
  const reloj = typeof ahora === 'function' ? ahora : () => ahora;
  const r = await conCredencial(db, config, { uso: USO }, async cred => {
    const p = await adaptador.probar(cred);
    if (p.motivo !== 'ok') return { error: p.motivo };
    // Lo que Telegram tenga guardado de antes se confirma (offset −1 y luego el siguiente): la cola queda vacía y nunca se
    // guarda un número de update de antes (tras una semana sin mensajes, Telegram elige el siguiente al azar).
    const viejo = await adaptador.recibir(cred, { desde: -1, limite: 1 });
    if (viejo.motivo !== 'ok') return { error: viejo.motivo };
    if (viejo.siguiente != null) {
      const confirmar = await adaptador.recibir(cred, { desde: viejo.siguiente, limite: 1 });
      if (confirmar.motivo !== 'ok') return { error: confirmar.motivo };
    }
    return { cuenta: p.cuenta, secretoId: cred.secretoId };
  });
  if (r.motivo === 'sin_clave' || r.motivo === 'credencial_cambiada') throw new ErrorCanal('sin_token');
  if (r.motivo === 'clave_no_valida' || r.error === 'clave_no_valida') throw new ErrorCanal('clave_no_valida');
  if (r.error === 'bot_ocupado' || r.error === 'conflicto') throw new ErrorCanal('bot_ocupado');
  if (r.error || !r.cuenta) throw new ErrorCanal('telegram_no_responde', 503);
  const codigo = crearCodigo();
  const momento = reloj();
  const hasta = momento + VIGENCIA_MS;
  enTransaccion(db, () => {
    db.prepare("UPDATE canales SET estado = 'vencido' WHERE tipo = ? AND proposito = ? AND estado = 'pendiente'").run(TIPO, PROPOSITO);
    db.prepare(`INSERT INTO canales (tipo, proposito, estado, secreto_id, cuenta_id, cuenta_nombre, codigo_huella, codigo_desde, codigo_hasta,
        codigo_intentos, novedades_desde, creado_por, creado_en)
      VALUES (?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`)
      .run(TIPO, PROPOSITO, r.secretoId, String(r.cuenta.id), r.cuenta.usuario ?? null, huellaCodigo(codigo), iso(momento), iso(hasta), usuarioId, iso(momento));
    guardarAjuste(db, CLAVE_BOT, { id: String(r.cuenta.id), usuario: r.cuenta.usuario ?? null, nombre: r.cuenta.nombre ?? null, secretoId: r.secretoId, probadoEn: iso(momento) }, momento);
  });
  const usuario = String(r.cuenta.usuario ?? '').replace(/[^A-Za-z0-9_]/g, '');
  return { codigo, paraMostrar: codigoParaMostrar(codigo), enlace: usuario ? `https://t.me/${usuario}?start=${codigo}` : null, hasta: iso(hasta), bot: usuario || null };
}

// Por base (una por servidor; las pruebas abren varias en el mismo proceso): id del canal pendiente → { en, promesa,
// resultado }. Solo en la memoria del servidor web.
const revisiones = new WeakMap();
const revisionesDe = db => {
  if (!revisiones.has(db)) revisiones.set(db, new Map());
  return revisiones.get(db);
};

// POST /api/admin/telegram/vincular/revisar → { estado: 'esperando' | 'vinculado' | 'vencido', chat? }. Como mucho UNA
// pregunta a Telegram cada 3 s, aunque la pantalla (o varias) pregunten más seguido.
export async function revisarVinculo(db, config, { usuarioId = null, ahora = Date.now, adaptador = ADAPTADORES.telegram, cadaMs = REVISAR_CADA_MS } = {}) {
  const reloj = typeof ahora === 'function' ? ahora : () => ahora;
  const momento = reloj();
  const p = canalPendiente(db, momento);
  if (!p) {
    const unido = canalActual(db);
    return unido?.estado === 'activo' && unido.vinculado_en ? { estado: 'vinculado', chat: { nombre: unido.destino_nombre } } : { estado: 'vencido' };
  }
  if (p.vencido) {
    db.prepare("UPDATE canales SET estado = 'vencido' WHERE id = ? AND estado = 'pendiente'").run(p.id);
    return { estado: 'vencido' };
  }
  const ultimaRevision = revisionesDe(db);
  const previa = ultimaRevision.get(p.id);
  if (previa?.promesa) return previa.promesa;
  if (previa && momento - previa.en < cadaMs) return previa.resultado;
  const promesa = (async () => {
    try {
      return await revisarAhora(db, config, p, { usuarioId, reloj, adaptador });
    } catch {
      return { estado: 'esperando' };
    }
  })();
  ultimaRevision.set(p.id, { en: momento, promesa, resultado: { estado: 'esperando' } });
  const resultado = await promesa;
  ultimaRevision.set(p.id, { en: momento, promesa: null, resultado });
  return resultado;
}

async function revisarAhora(db, config, p, { usuarioId, reloj, adaptador }) {
  const r = await conCredencial(db, config, { uso: USO, secretoId: p.secreto_id }, async cred => {
    const lote = await adaptador.recibir(cred, { desde: p.novedades_desde ?? null, limite: NOVEDADES_POR_VEZ });
    if (lote.motivo !== 'ok') return { error: lote.motivo };
    // Los intentos equivocados se cuentan POR CHAT (5) y en total (50), uno por uno con los de antes: un extraño gasta
    // solo los suyos (después se lo ignora), nunca los del dueño.
    const visto = revisarLote(lote.mensajes, { huella: p.codigo_huella, desdeMs: Date.parse(p.codigo_desde), cuenta: leerCuenta(p.codigo_intentos, p.codigo_intentos_chats) });
    return { ...visto, siguiente: lote.siguiente };
  });
  if (r.motivo) return { estado: 'esperando', problema: r.motivo === 'credencial_cambiada' ? 'sin_token' : r.motivo };
  if (r.error) return { estado: 'esperando', problema: r.error };
  const momento = reloj();
  if (!r.encontrado) {
    db.prepare(`UPDATE canales SET codigo_intentos = ?, codigo_intentos_chats = ?, novedades_desde = COALESCE(?, novedades_desde),
      estado = CASE WHEN ? THEN 'vencido' ELSE estado END WHERE id = ? AND estado = 'pendiente'`)
      .run(r.cuenta.total, textoCuenta(r.cuenta), r.siguiente, r.vencido ? 1 : 0, p.id);
    return { estado: r.vencido ? 'vencido' : 'esperando', ...(r.vencido ? { motivo: 'intentos' } : {}) };
  }
  const m = r.encontrado;
  const nombre = String(m.de?.nombre ?? m.chat?.nombre ?? '').slice(0, 40) || null;
  const unido = enTransaccion(db, () => {
    const sigue = db.prepare("SELECT * FROM canales WHERE id = ? AND estado = 'pendiente'").get(p.id);
    if (!sigue) return false;
    const ahoraIso = iso(momento);
    for (const viejo of db.prepare("SELECT id FROM canales WHERE tipo = ? AND proposito = ? AND estado IN ('activo', 'bloqueado', 'perdido')").all(TIPO, PROPOSITO)) {
      db.prepare("UPDATE canales SET estado = 'desvinculado', desvinculado_en = ?, motivo = 'reemplazado' WHERE id = ?").run(ahoraIso, viejo.id);
    }
    db.prepare(`UPDATE canales SET estado = 'activo', destino = ?, destino_nombre = ?, vinculado_en = ?, novedades_desde = ?, codigo_intentos = ?,
      codigo_intentos_chats = ?, fallos_seguidos = 0, pausa_hasta = NULL, pausa_motivo = NULL WHERE id = ?`)
      .run(String(m.chat.id), nombre, ahoraIso, r.siguiente, r.cuenta.total, textoCuenta(r.cuenta), p.id);
    // Ronda 2: aquí NO se marca ningún aviso. Lo de antes de la PRIMERA vez que se unió un chat lo marca el que manda
    // avisos («antes_de_conectar», la bienvenida dice cuántos hay); al unir el chat OTRA vez (se perdió, otro bot), lo
    // grave que esperaba sigue pendiente y llega (src/canales/avisador.js).
    auditar(db, { usuarioId, accion: 'telegram_vinculado', detalle: `chat de ${nombre ?? 'Telegram'}` });
    return true;
  });
  if (!unido) return { estado: 'vencido' };
  revisionesDe(db).delete(p.id);
  // La bienvenida (en silencio no: es la primera vez, que suene). Si no sale, el que manda avisos la manda después.
  await mandarBienvenida(db, config, { canalId: p.id, adaptador, ahora: momento });
  return { estado: 'vinculado', chat: { nombre } };
}

// La bienvenida de un chat recién unido: «✅ Listo…» y cuántos avisos hay abiertos. → { motivo }
export async function mandarBienvenida(db, config, { canalId, adaptador = ADAPTADORES.telegram, ahora = Date.now() }) {
  const canal = db.prepare('SELECT * FROM canales WHERE id = ?').get(canalId);
  if (!canal?.destino) return { motivo: 'sin_chat' };
  const abiertos = db.prepare('SELECT COUNT(*) AS n FROM avisos WHERE resuelto_en IS NULL').get().n;
  const idioma = idiomaDelDueno(db);
  const nombre = canal.destino_nombre ?? '';
  const r = await conCredencial(db, config, { uso: USO, secretoId: canal.secreto_id }, async cred => {
    const envio = await adaptador.enviarTexto(cred, { destino: canal.destino, texto: textoBienvenida(idioma, { nombre, abiertos }), silencioso: false });
    enTransaccion(db, () => {
      anotarEnvio(db, { canalId, clase: 'bienvenida', resultado: envio.motivo === 'ok' ? 'enviado' : 'fallido', motivo: envio.motivo === 'ok' ? null : envio.motivo, mensajeId: envio.mensajeId ?? null, ahora });
      if (envio.motivo === 'ok') marcarBien(db, canalId, ahora);
      else if (!['sin_clave', 'credencial_cambiada', 'cancelado'].includes(envio.motivo)) anotarProblema(db, canal, { motivo: envio.motivo, esperarMs: envio.esperarMs, ahora });
    });
    return envio;
  });
  return { motivo: r.motivo ?? 'error' };
}

// ¿Le falta la bienvenida a este chat? (se unió y la bienvenida nunca salió)
export function bienvenidaPendiente(db, canal) {
  if (!canal?.vinculado_en) return false;
  return !db.prepare("SELECT 1 FROM canal_envios WHERE canal_id = ? AND clase = 'bienvenida' AND resultado = 'enviado' LIMIT 1").get(canal.id);
}

// La PRIMERA vez que se unió un chat del dueño (lo de antes nunca llegó a ningún chat: «antes_de_conectar»), o null.
export function primerVinculo(db) {
  return db.prepare('SELECT MIN(vinculado_en) AS en FROM canales WHERE tipo = ? AND proposito = ? AND vinculado_en IS NOT NULL').get(TIPO, PROPOSITO)?.en ?? null;
}

// «Dejar de usar este chat» (o la consola: --telegram=desvincular). La fila queda; nada se borra.
export function desvincular(db, { usuarioId = null, origen = 'pantalla', ahora = Date.now() } = {}) {
  return enTransaccion(db, () => {
    const filas = db.prepare("SELECT id FROM canales WHERE tipo = ? AND proposito = ? AND estado IN ('activo', 'bloqueado', 'perdido', 'pendiente')").all(TIPO, PROPOSITO);
    for (const f of filas) {
      db.prepare("UPDATE canales SET estado = 'desvinculado', desvinculado_por = ?, desvinculado_en = ?, motivo = ? WHERE id = ?").run(usuarioId, iso(ahora), origen, f.id);
    }
    if (filas.length) auditar(db, { usuarioId, accion: 'telegram_desvinculado', detalle: origen });
    resolverAviso(db, 'telegram_falla', ahora);
    return { cambiados: filas.length };
  });
}

// «Mandar un mensaje de prueba»: suena, cuenta para los topes, y si pasa, el chat vuelve a «activo». Va SIEMPRE con el bot
// del chat: si la clave activa no es con la que se probó el bot de ese chat (el dueño pegó un token nuevo), primero la
// prueba gratis (getMe, como en Claves). Si es OTRO bot, el chat queda desvinculado (trasProbarToken) y no se manda nada
// (bot_cambiado); si la prueba no pasa, tampoco (sin_probar).
export async function mandarPrueba(db, config, { usuarioId = null, ahora = Date.now, adaptador = ADAPTADORES.telegram, probar = null } = {}) {
  const reloj = typeof ahora === 'function' ? ahora : () => ahora;
  let canal = canalActual(db);
  if (!canal) throw new ErrorCanal('sin_chat');
  const s = secretoDelBot(db);
  if (s && canal.secreto_id !== s.id) {
    const probarSecreto = probar ?? (await import('../claves/probar.js')).probarSecreto;
    let prueba = null;
    try { prueba = (await probarSecreto(db, config, { id: s.id, usuarioId, ahora: reloj })).motivo; } catch { prueba = 'error_proveedor'; }
    const ahoraCanal = canalActual(db);
    let motivo = null;
    if (!ahoraCanal || ahoraCanal.id !== canal.id) motivo = 'bot_cambiado';
    else if (prueba !== 'ok' || ahoraCanal.secreto_id !== s.id) motivo = 'sin_probar';
    if (motivo) {
      enTransaccion(db, () => auditar(db, { usuarioId, accion: 'telegram_prueba', detalle: motivo }));
      return { motivo };
    }
    canal = ahoraCanal;
  }
  const r = await conCredencial(db, config, { uso: USO, secretoId: canal.secreto_id }, cred => adaptador.enviarTexto(cred, { destino: canal.destino, texto: textoPrueba(idiomaDelDueno(db), reloj()), silencioso: false }));
  const motivo = r.motivo === 'sin_clave' || r.motivo === 'credencial_cambiada' ? 'sin_token' : r.motivo;
  const momento = reloj();
  enTransaccion(db, () => {
    anotarEnvio(db, { canalId: canal.id, clase: 'prueba', resultado: motivo === 'ok' ? 'enviado' : 'fallido', motivo: motivo === 'ok' ? null : motivo, mensajeId: r.mensajeId ?? null, ahora: momento });
    if (motivo === 'ok') marcarBien(db, canal.id, momento);
    else if (motivo !== 'sin_token') anotarProblema(db, canal, { motivo, esperarMs: r.esperarMs, ahora: momento });
    auditar(db, { usuarioId, accion: 'telegram_prueba', detalle: motivo });
  });
  return { motivo };
}

// Lo que muestran las pantallas del Telegram (Claves y Copias). Nunca el token.
export function estadoTelegram(db, config, { ahora = Date.now() } = {}) {
  const secreto = secretoDelBot(db);
  const bot = botGuardado(db);
  const canal = canalActual(db);
  const pendiente = canalPendiente(db, ahora);
  const listo = listoParaMandar(db, config, ahora);
  const desde = ahora - 24 * 3_600_000;
  // Por su índice (canal_id, creado_en), de atrás hacia adelante: nunca ordena todas las filas del canal (crecen cada noche).
  const ultimoOk = canal ? db.prepare("SELECT creado_en FROM canal_envios WHERE canal_id = ? AND resultado = 'enviado' ORDER BY creado_en DESC LIMIT 1").get(canal.id)?.creado_en ?? null : null;
  let motivo = listo.motivo;
  let listoSi = listo.si;
  if (!secreto) motivo = 'sin_token';
  else if (secreto.prueba && secreto.prueba !== 'ok' && !canal) motivo = secreto.prueba;
  // Los mensajes no llegan aunque entre intento e intento parezca listo (un 4xx raro, o Telegram que no responde hace
  // rato): las pantallas lo dicen («No llega a Telegram»).
  if (canal && (motivo == null || motivo === 'pausa')) {
    const falla = db.prepare("SELECT detalle FROM avisos WHERE clave = 'telegram_falla' AND resuelto_en IS NULL").get();
    let d = null;
    try { d = JSON.parse(falla?.detalle ?? 'null'); } catch { d = null; }
    if (['pedido', 'sin_respuesta', 'bot_cambiado'].includes(d?.motivo)) { motivo = d.motivo; listoSi = false; }
  }
  return {
    listo: listoSi,
    motivo,
    bot: bot && secreto && bot.secretoId === secreto.id ? { usuario: bot.usuario, nombre: bot.nombre } : null,
    token: secreto ? { final: secreto.final, prueba: secreto.prueba, probadoEn: secreto.probado_en } : null,
    chat: canal ? { estado: canal.estado, nombre: canal.destino_nombre, vinculadoEn: canal.vinculado_en, problema: canal.estado === 'activo' ? null : canal.estado } : null,
    vinculo: { pendiente: Boolean(pendiente && !pendiente.vencido), hasta: pendiente && !pendiente.vencido ? pendiente.codigo_hasta : null },
    envios: canal ? { ultimoOk, ultimoError: canal.ultimo_error_en ? { motivo: canal.ultimo_error, en: canal.ultimo_error_en } : null, hoy: enviadosDesde(db, canal.id, desde, ahora) } : null,
  };
}

// Para que una prueba revise que la base solo tiene valores conocidos.
export const ESTADOS = ESTADOS_CANAL;
export const rangoDe = nivel => RANGO[nivel] ?? 0;
