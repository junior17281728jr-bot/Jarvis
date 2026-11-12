// El adaptador de Telegram (un bot de la Bot API): el ÚNICO archivo que nombra el servidor oficial de Telegram
// (test/reglas.test.js). Es un adaptador de canal genérico (src/canales/canal.js): la fase 3 agrega WhatsApp o Gmail
// con un archivo igual a este, sin tocar a quien lo usa.
//  - Toda llamada pasa por la única puerta a la red (src/ia/llamar.js): nunca sigue redirecciones, corta por tiempo y
//    por tamaño, y de un error guarda solo su nombre y su código. Esto es ESENCIAL aquí: la dirección de cada pedido
//    lleva el token del bot (…/bot<token>/…), así que nada de lo que devuelve este archivo lleva la dirección, el
//    texto de un error ni la «description» que manda Telegram: solo un motivo de MOTIVOS_CANAL y datos seguros.
//  - Cada método RESUELVE siempre (nunca lanza por la red): { motivo, esperarMs?, …datos }.
//  - Texto plano, salvo que quien manda pida { html: true } (0.12.8, pedido del dueño: «mensajes del bot limpios»): entonces
//    va con el formato HTML de Telegram, y quien arma el texto ya escapó TODO lo que viene de una persona (escaparHtml de
//    src/canales/textos.js) y lo cortó ANTES de escapar (un corte a la mitad de una etiqueta deja el mensaje sin mandar).
//    Nunca vista previa de enlaces, y nunca se protege el contenido (el dueño debe poder guardar los archivos de sus copias).
//  - Límites de la Bot API (telegram-bot-api.json, Bot API 10.3): un bot sube hasta 50 MB (sendDocument) y baja hasta
//    20 MB (getFile); texto 1–4096 caracteres, leyenda 0–1024.
//  - La dirección base solo se cambia en modo de prueba (config.canalesBases, 127.0.0.1): nunca desde las pantallas.
import { randomBytes } from 'node:crypto';
import { llamarProveedor } from '../ia/llamar.js';

export const HOST_OFICIAL = 'api.telegram.org';
const BASE_OFICIAL = `https://${HOST_OFICIAL}`;
export const LIMITES = Object.freeze({
  textoMax: 4096, leyendaMax: 1024, subirMaxBytes: 50 * 1000 * 1000, bajarMaxBytes: 20 * 1000 * 1000, pausaArchivosMs: 1100,
});
const JSON_MS = 15_000;
const JSON_TOPE = 262_144;
// getUpdates: un mensaje de texto puede tener 4.096 caracteres (hasta ~16 KB en UTF-8) más su «respuesta a» y datos:
// con 10 por pedido, 2 MB nunca se pasan. Si igual se pasa, se pide de a UNO; si UNO solo se pasa, se salta (ronda 2).
const UPDATES_TOPE = 2 * 1024 * 1024;
const ARCHIVO_MS = 120_000;
// Un file_path que devuelve getFile: solo letras, números y _ - / . ; sin «..», sin «/» al principio.
const RUTA_BUENA = /^[A-Za-z0-9_\-/.]{1,256}$/;
const TOKEN = /^\d{6,15}:[A-Za-z0-9_-]{30,80}$/;

export function rutaValida(ruta) {
  const r = String(ruta ?? '');
  return RUTA_BUENA.test(r) && !r.startsWith('/') && !r.split('/').some(s => s === '..' || s === '');
}

function baseDe(cred) {
  return process.env.OPORTIA_TEST === '1' && typeof cred?.base === 'string' && cred.base ? cred.base : BASE_OFICIAL;
}

function tokenDe(cred) {
  const t = cred?.token;
  return typeof t === 'string' && TOKEN.test(t) ? t : null;
}

const numero = v => (Number.isSafeInteger(v) ? v : null);
const textoCorto = (v, max = 64) => (typeof v === 'string' ? v.slice(0, max) : null);

// Lo que pasó con un pedido, en un motivo (nunca el texto que mandó Telegram).
function motivoDe(salida, { metodo, descarga = false } = {}) {
  if (salida.rechazado) return { motivo: 'rechazado' };
  if (salida.abortado) return { motivo: 'cancelado' };
  if (salida.tiempoAgotado) return { motivo: 'tiempo_agotado' };
  if (salida.falloAlRecibir) return { motivo: 'error_local' };
  if (salida.red === 'redireccion') return { motivo: 'respuesta_no_valida' };
  if (salida.red) return { motivo: 'sin_red' };
  const s = salida.status;
  if (descarga && s >= 200 && s <= 299) return salida.demasiado ? { motivo: 'demasiado_grande' } : { motivo: 'ok' };
  if (salida.demasiado || salida.profundo) return { motivo: 'respuesta_no_valida' };
  const j = salida.json;
  if (s === 200 && j && j.ok === true && Object.hasOwn(j, 'result')) return { motivo: 'ok', resultado: j.result };
  const descripcion = typeof j?.description === 'string' ? j.description.toLowerCase() : '';
  // Ronda 3: solo una respuesta de Telegram (JSON con ok:false) dice que el token no sirve; una página de error de en medio
  // (un 401 o 404 sin ese JSON) es pasajera. Y aun así, quien la recibe la toma como SOSPECHA (src/canales/canales.js).
  if (s === 401 || (s === 404 && metodo === 'getMe')) return j && j.ok === false ? { motivo: 'clave_no_valida' } : { motivo: 'respuesta_no_valida' };
  if (s === 403) return { motivo: 'bloqueado' };
  if (s === 400 && descripcion.includes('chat not found')) return { motivo: 'chat_no_existe' };
  if (s === 413 || (s === 400 && metodo === 'getFile' && descripcion.includes('too big'))) return { motivo: 'demasiado_grande' };
  if (s === 409) return { motivo: 'conflicto' };
  if (s === 429) {
    const despues = numero(j?.parameters?.retry_after) ?? Number.parseInt(salida.cabeceras?.['retry-after'] ?? '', 10);
    const segundos = Number.isFinite(despues) && despues > 0 ? Math.min(despues, 3600) : 5;
    return { motivo: 'limite', esperarMs: segundos * 1000 };
  }
  if (s >= 500 && s <= 599) return { motivo: 'error_servidor' };
  if (s >= 400 && s <= 499) return { motivo: 'pedido_no_valido' };
  return { motivo: 'respuesta_no_valida' };
}

async function llamarJson(cred, metodo, parametros = {}, { senal = null, timeoutMs = JSON_MS, topeBytes = JSON_TOPE } = {}) {
  const token = tokenDe(cred);
  if (!token) return { motivo: 'clave_no_valida' };
  const salida = await llamarProveedor({
    url: `${baseDe(cred)}/bot${token}/${metodo}`, metodo: 'POST', cabeceras: { 'content-type': 'application/json' },
    cuerpo: parametros, senal, timeoutMs, topeBytes, permitido: HOST_OFICIAL,
  });
  // Una respuesta 200 que pasó del tope se distingue (getUpdates la pide más chica); las demás siguen igual.
  if (salida.demasiado && salida.status >= 200 && salida.status <= 299) return { motivo: 'respuesta_no_valida', demasiado: true };
  const r = motivoDe(salida, { metodo });
  return quizasEntregado(salida, r.motivo) ? { ...r, quizas: true } : r;
}

// Ronda 3: el pedido SALIÓ y no se sabe si Telegram lo hizo (se cortó la respuesta, se acabó el tiempo, un 5xx de en
// medio): un mensaje así quizás llegó. Quien lo manda lo anota «dudoso» (cuenta para los topes y no vuelve a sonar).
function quizasEntregado(salida, motivo) {
  if (motivo === 'ok') return false;
  if (salida.tiempoAgotado || salida.red === 'durante') return true;
  return Number.isInteger(salida.status) && salida.status >= 500 && salida.status <= 599;
}

const mal = () => ({ motivo: 'respuesta_no_valida' });

function documentoDe(d) {
  if (!d || typeof d !== 'object' || typeof d.file_id !== 'string' || !d.file_id || d.file_id.length > 512) return null;
  return {
    archivoId: d.file_id,
    idUnico: textoCorto(d.file_unique_id, 256),
    nombre: textoCorto(d.file_name, 256),
    bytes: numero(d.file_size), // opcional en la Bot API: solo se compara cuando viene
  };
}

function mensajeDe(u) {
  const m = u?.message;
  if (!Number.isSafeInteger(u?.update_id)) return null;
  if (!m || typeof m !== 'object' || !m.chat || !Number.isSafeInteger(m.chat.id)) return { updateId: u.update_id, fecha: null, chat: null, de: null, texto: null, documento: null };
  return {
    updateId: u.update_id,
    mensajeId: numero(m.message_id),
    fecha: numero(m.date),
    chat: { id: String(m.chat.id), tipo: textoCorto(m.chat.type, 20), nombre: textoCorto(m.chat.first_name, 40) },
    de: m.from && Number.isSafeInteger(m.from.id) ? {
      id: String(m.from.id), esBot: m.from.is_bot === true, nombre: textoCorto(m.from.first_name, 40),
      usuario: typeof m.from.username === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(m.from.username) ? m.from.username : null,
    } : null,
    texto: typeof m.text === 'string' ? m.text.slice(0, 200) : null,
    documento: documentoDe(m.document),
  };
}

// El cuerpo multipart/form-data, armado a mano como un Blob (cabeza, datos, cola): fetch manda el largo exacto y, si
// los datos vienen de un archivo (openAsBlob), nunca se leen enteros a la memoria.
function multipart(campos, { nombre, datos }) {
  const limite = `oportia${randomBytes(8).toString('hex')}`;
  const seguro = String(nombre ?? 'archivo').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'archivo';
  let cabeza = '';
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor == null) continue;
    cabeza += `--${limite}\r\nContent-Disposition: form-data; name="${clave}"\r\n\r\n${String(valor)}\r\n`;
  }
  cabeza += `--${limite}\r\nContent-Disposition: form-data; name="document"; filename="${seguro}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const cola = `\r\n--${limite}--\r\n`;
  const cuerpo = new Blob([Buffer.from(cabeza, 'utf8'), datos, Buffer.from(cola, 'utf8')]);
  return { cuerpo, tipo: `multipart/form-data; boundary=${limite}` };
}

export const TELEGRAM = Object.freeze({
  id: 'telegram',
  nombre: 'Telegram',
  hostOficial: HOST_OFICIAL,
  limites: LIMITES,

  // getMe y después getWebhookInfo: un bot con webhook lo usa otro programa (bot_ocupado; OPORTIA nunca se lo quita).
  async probar(cred, { senal = null } = {}) {
    const yo = await llamarJson(cred, 'getMe', {}, { senal });
    if (yo.motivo !== 'ok') return { motivo: yo.motivo, esperarMs: yo.esperarMs };
    const r = yo.resultado;
    if (!r || !Number.isSafeInteger(r.id) || r.is_bot !== true) return mal();
    const cuenta = { id: String(r.id), usuario: textoCorto(r.username, 64), nombre: textoCorto(r.first_name, 64) };
    const gancho = await llamarJson(cred, 'getWebhookInfo', {}, { senal });
    if (gancho.motivo !== 'ok') return { motivo: gancho.motivo, esperarMs: gancho.esperarMs, cuenta };
    if (!gancho.resultado || typeof gancho.resultado.url !== 'string') return { ...mal(), cuenta };
    if (gancho.resultado.url !== '') return { motivo: 'bot_ocupado', cuenta };
    return { motivo: 'ok', cuenta };
  },

  async enviarTexto(cred, { destino, texto, silencioso = true, html = false, senal = null }) {
    const crudo = String(texto ?? '');
    // Con formato, un texto más largo que el tope no se corta aquí (quedaría una etiqueta abierta): no sale.
    if (html && crudo.length > LIMITES.textoMax) return { motivo: 'pedido_no_valido' };
    const t = crudo.slice(0, LIMITES.textoMax);
    if (!t) return { motivo: 'pedido_no_valido' };
    const r = await llamarJson(cred, 'sendMessage', {
      chat_id: String(destino), text: t, disable_notification: Boolean(silencioso), link_preview_options: { is_disabled: true },
      ...(html ? { parse_mode: 'HTML' } : {}),
    }, { senal });
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs, ...(r.quizas ? { quizas: true } : {}) };
    if (!Number.isSafeInteger(r.resultado?.message_id)) return mal();
    return { motivo: 'ok', mensajeId: r.resultado.message_id };
  },

  async enviarArchivo(cred, { destino, nombre, datos, leyenda = '', silencioso = true, html = false, senal = null }) {
    const token = tokenDe(cred);
    if (!token) return { motivo: 'clave_no_valida' };
    const bytes = datos?.size ?? datos?.length ?? 0;
    if (!bytes) return { motivo: 'pedido_no_valido' };
    if (bytes > LIMITES.subirMaxBytes) return { motivo: 'demasiado_grande' };
    if (html && String(leyenda ?? '').length > LIMITES.leyendaMax) return { motivo: 'pedido_no_valido' };
    const { cuerpo, tipo } = multipart({
      chat_id: String(destino), caption: String(leyenda ?? '').slice(0, LIMITES.leyendaMax) || null,
      disable_notification: silencioso ? 'true' : 'false', parse_mode: html && leyenda ? 'HTML' : null,
    }, { nombre, datos });
    const salida = await llamarProveedor({
      url: `${baseDe(cred)}/bot${token}/sendDocument`, metodo: 'POST', cabeceras: { 'content-type': tipo },
      cuerpoCrudo: cuerpo, senal, timeoutMs: ARCHIVO_MS, topeBytes: JSON_TOPE, permitido: HOST_OFICIAL,
    });
    const r = motivoDe(salida, { metodo: 'sendDocument' });
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs };
    const documento = documentoDe(r.resultado?.document);
    if (!Number.isSafeInteger(r.resultado?.message_id) || !documento) return mal();
    return { motivo: 'ok', mensajeId: r.resultado.message_id, archivo: { id: documento.archivoId, idUnico: documento.idUnico, bytes: documento.bytes } };
  },

  async fijar(cred, { destino, mensajeId, senal = null }) {
    const r = await llamarJson(cred, 'pinChatMessage', { chat_id: String(destino), message_id: mensajeId, disable_notification: true }, { senal });
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs };
    return r.resultado === true ? { motivo: 'ok' } : mal();
  },

  // getFile: dónde bajar un archivo (válido al menos 1 hora). bytes puede faltar (opcional en la Bot API).
  async archivo(cred, { archivoId, senal = null }) {
    if (typeof archivoId !== 'string' || !archivoId || archivoId.length > 512) return { motivo: 'pedido_no_valido' };
    const r = await llamarJson(cred, 'getFile', { file_id: archivoId }, { senal });
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs };
    const ruta = r.resultado?.file_path;
    if (!rutaValida(ruta)) return mal();
    return { motivo: 'ok', ruta, bytes: numero(r.resultado.file_size) };
  },

  // Baja un archivo por pedazos (alTrozo), sin guardarlo entero. topeBytes: lo más que se acepta.
  async bajar(cred, { ruta, topeBytes = LIMITES.bajarMaxBytes, alTrozo, senal = null }) {
    const token = tokenDe(cred);
    if (!token) return { motivo: 'clave_no_valida' };
    if (!rutaValida(ruta)) return mal(); // ningún pedido sale con una ruta rara
    if (typeof alTrozo !== 'function') return { motivo: 'pedido_no_valido' };
    const salida = await llamarProveedor({
      url: `${baseDe(cred)}/file/bot${token}/${ruta}`, metodo: 'GET', senal, timeoutMs: ARCHIVO_MS,
      topeBytes: Math.min(Math.max(1, Number(topeBytes) || 1), LIMITES.bajarMaxBytes), permitido: HOST_OFICIAL, alTrozo,
    });
    const r = motivoDe(salida, { metodo: 'file', descarga: true });
    return r.motivo === 'ok' ? { motivo: 'ok', bytes: salida.bytes } : { motivo: r.motivo, esperarMs: r.esperarMs };
  },

  // getUpdates (sin esperar: esperaS 0). desde null → sin offset (Telegram da las más viejas sin confirmar). Nunca se queda
  // atascado por una respuesta demasiado grande (ronda 2: un extraño que manda muchos mensajes largos): se pide de a uno,
  // y si uno solo no cabe, se salta (saltado: true; el cursor sigue). → { motivo, mensajes, siguiente, saltado? }
  async recibir(cred, { desde = null, limite = 10, esperaS = 0, senal = null } = {}) {
    const pedir = async (offset, cuantos) => {
      const parametros = { limit: Math.max(1, Math.min(100, cuantos)), timeout: Math.max(0, Math.min(50, esperaS)), allowed_updates: ['message'] };
      if (offset != null) parametros.offset = offset;
      return llamarJson(cred, 'getUpdates', parametros, { senal, timeoutMs: JSON_MS + parametros.timeout * 1000, topeBytes: UPDATES_TOPE });
    };
    let r = await pedir(desde, limite);
    if (r.demasiado && limite > 1) r = await pedir(desde, 1);
    if (r.demasiado) {
      // Uno solo no cabe. Con un cursor, se salta ese (el siguiente número). Sin cursor, se pide el ÚLTIMO (offset −1:
      // Telegram da por vistos los de antes) y se sigue después de él; ese último sí se revisa. Lo de en medio se pierde
      // (el dueño puede mandar otra vez su código).
      if (desde != null && desde >= 0) return { motivo: 'ok', mensajes: [], siguiente: desde + 1, saltado: true };
      const ultimo = await pedir(-1, 1);
      if (ultimo.motivo !== 'ok' || !Array.isArray(ultimo.resultado) || !Number.isSafeInteger(ultimo.resultado[0]?.update_id)) return mal();
      return { motivo: 'ok', mensajes: ultimo.resultado.map(mensajeDe).filter(Boolean), siguiente: ultimo.resultado[0].update_id + 1, saltado: true };
    }
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs };
    if (!Array.isArray(r.resultado)) return mal();
    const mensajes = r.resultado.map(mensajeDe).filter(Boolean);
    const ids = mensajes.map(m => m.updateId);
    return { motivo: 'ok', mensajes, siguiente: ids.length ? Math.max(...ids) + 1 : null };
  },

  // getChat: el mensaje fijado más reciente del chat (pinned_message) y su documento, si tiene.
  async fijado(cred, { destino, senal = null }) {
    const r = await llamarJson(cred, 'getChat', { chat_id: String(destino) }, { senal });
    if (r.motivo !== 'ok') return { motivo: r.motivo, esperarMs: r.esperarMs };
    if (!r.resultado || !Number.isSafeInteger(r.resultado.id)) return mal();
    const p = r.resultado.pinned_message;
    return {
      motivo: 'ok',
      chat: { id: String(r.resultado.id), tipo: textoCorto(r.resultado.type, 20), nombre: textoCorto(r.resultado.first_name, 40) },
      mensajeId: p && Number.isSafeInteger(p.message_id) ? p.message_id : null,
      fecha: p ? numero(p.date) : null,
      documento: p ? documentoDe(p.document) : null,
    };
  },
});
