// Un Telegram FALSO para las pruebas (no es un archivo *.test.js): imita la Bot API en 127.0.0.1 (puerto al azar), así
// ninguna prueba usa nunca el Telegram de verdad ni un token de verdad. Imita las respuestas reales
// (telegram-bot-api.json, Bot API 10.3): { ok: true, result } y { ok: false, error_code, description, parameters }.
//   const falso = await crearTelegramFalso({ bots: [{ token, id, usuario }], chats: [{ id, tipo, nombre }] });
//   config.canalesBases = { telegram: falso.url }    (o OPORTIA_TELEGRAM_URL para un proceso hijo)
//   falso.escena('sendDocument', 'limite', { segundos: 3 })   el siguiente pedido de ese método (o '*') la toma
//                                                             ({ veces: n } para n pedidos, { saltar: n } deja pasar n antes)
//   falso.escribir({ chat, de, texto })     un mensaje que llega al bot (una «update»)
//   falso.pedidos   cada pedido (método, bot, cuerpo, largo): NUNCA guarda el token.
// Rutas: POST|GET /bot<token>/<método> (JSON y multipart/form-data) y GET /file/bot<token>/<file_path>.
// Límites reales: un documento de más de 50 MB → 413; getFile de más de 20 MB → 400 «Bad Request: file is too big»
// (las pruebas pueden bajarlos con { subirMax, bajarMax } para no mover archivos enormes).
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

export const ESCENAS = Object.freeze([
  'no_autorizado', 'no_existe', 'bloqueado', 'expulsado', 'chat_no_existe', 'muy_grande', 'limite', 'error_500', 'error_502',
  'nunca', 'lento', 'json_roto', 'profundo', 'conflicto', 'redirige', 'cambiar_bytes', 'ruta_vencida', 'sin_ruta', 'sin_tamano',
  'ruta_rara', 'otro_fijado', 'enorme', 'sin_forma', 'peer_invalido',
]);

const TOKEN = /^(\d{6,15}):([A-Za-z0-9_-]{30,80})$/;

// Un token de prueba armado al correr (nunca escrito en el código: el revisor de secretos del repositorio lo vería).
export function tokenDePrueba(n = 1, letra = 'B') {
  return [String(700_000_000 + n), `${letra}x`.repeat(18)].join(':');
}

function leerCuerpo(req) {
  return new Promise(listo => {
    const partes = [];
    req.on('data', p => partes.push(p));
    req.on('end', () => listo(Buffer.concat(partes)));
    req.on('error', () => listo(Buffer.alloc(0)));
  });
}

// Un lector multipart/form-data de verdad (con su límite).
export function leerMultipart(cuerpo, tipo) {
  const m = /boundary=([^;]+)/i.exec(String(tipo ?? ''));
  if (!m) return null;
  const limite = Buffer.from(`--${m[1].trim()}`);
  const campos = {};
  const archivos = {};
  let i = cuerpo.indexOf(limite);
  if (i !== 0) return null;
  for (;;) {
    i += limite.length;
    if (cuerpo.subarray(i, i + 2).toString() === '--') break;
    if (cuerpo.subarray(i, i + 2).toString() !== '\r\n') return null;
    i += 2;
    const finCabeza = cuerpo.indexOf('\r\n\r\n', i);
    if (finCabeza < 0) return null;
    const cabeza = cuerpo.subarray(i, finCabeza).toString('utf8');
    const siguiente = cuerpo.indexOf(Buffer.concat([Buffer.from('\r\n'), limite]), finCabeza + 4);
    if (siguiente < 0) return null;
    const datos = cuerpo.subarray(finCabeza + 4, siguiente);
    const nombre = /name="([^"]*)"/.exec(cabeza)?.[1];
    const archivo = /filename="([^"]*)"/.exec(cabeza)?.[1];
    if (archivo != null) archivos[nombre] = { nombre: archivo, datos: Buffer.from(datos) };
    else campos[nombre] = datos.toString('utf8');
    i = siguiente + 2;
  }
  return { campos, archivos };
}

export async function crearTelegramFalso({ bots = [], chats = [], subirMax = 50 * 1000 * 1000, bajarMax = 20 * 1000 * 1000, esperaMaximaMs = 300 } = {}) {
  const porToken = new Map();
  for (const b of bots) porToken.set(b.token, { id: b.id, usuario: b.usuario ?? `bot${b.id}`, nombre: b.nombre ?? 'OPORTIA', webhook: b.webhook ?? '' });
  const chatsPorId = new Map();
  const agregarChat = c => chatsPorId.set(String(c.id), { id: Number(c.id), tipo: c.tipo ?? 'private', nombre: c.nombre ?? 'Junior', fijado: null, bloqueado: false });
  for (const c of chats) agregarChat(c);
  const pedidos = [];
  const mensajes = [];
  const documentos = [];
  const archivos = new Map(); // file_id → { unico, datos, ruta }
  const porRuta = new Map();
  const escenas = [];
  const updates = [];
  let siguienteUpdate = 1000;
  let saltoAlAzar = false;
  let siguienteMensaje = 1;
  let siguienteArchivo = 1;
  const abiertos = new Set();

  const ahora = () => Math.floor(Date.now() / 1000);
  const tomarEscena = metodo => {
    const i = escenas.findIndex(e => e.metodo === metodo || e.metodo === '*');
    if (i < 0) return null;
    const e = escenas[i];
    if (e.saltar > 0) { e.saltar -= 1; return null; } // { saltar: n }: deja pasar n pedidos antes de actuar
    e.veces -= 1;
    if (e.veces <= 0) escenas.splice(i, 1);
    return e;
  };
  const responder = (res, status, cuerpo, cabeceras = {}) => {
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    res.writeHead(status, { 'content-type': typeof cuerpo === 'string' ? 'text/html' : 'application/json', 'content-length': Buffer.byteLength(texto), ...cabeceras });
    res.end(texto);
  };
  const ok = (res, result) => responder(res, 200, { ok: true, result });
  const error = (res, codigo, descripcion, parametros) => responder(res, codigo, { ok: false, error_code: codigo, description: descripcion, ...(parametros ? { parameters: parametros } : {}) });

  // Lo que hace una escena de error (true si ya respondió).
  function aplicarEscena(e, res) {
    if (!e) return false;
    switch (e.nombre) {
      case 'no_autorizado': error(res, 401, 'Unauthorized'); return true;
      case 'no_existe': error(res, 404, 'Not Found'); return true;
      case 'bloqueado': error(res, 403, 'Forbidden: bot was blocked by the user'); return true;
      case 'expulsado': error(res, 403, 'Forbidden: bot was kicked from the group chat'); return true;
      case 'chat_no_existe': error(res, 400, 'Bad Request: chat not found'); return true;
      case 'peer_invalido': error(res, 400, 'Bad Request: PEER_ID_INVALID'); return true; // un 400 que el adaptador no conoce
      case 'muy_grande': error(res, 413, 'Request Entity Too Large'); return true;
      case 'limite': error(res, 429, `Too Many Requests: retry after ${e.segundos ?? 3}`, { retry_after: e.segundos ?? 3 }); return true;
      case 'error_500': responder(res, 500, '<html><body>Internal Server Error</body></html>'); return true;
      case 'error_502': responder(res, 502, '<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>'); return true;
      case 'conflicto': error(res, 409, 'Conflict: terminated by other getUpdates request; make sure that only one bot instance is running'); return true;
      case 'json_roto': res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":tr'); return true;
      case 'profundo': res.writeHead(200, { 'content-type': 'application/json' }); res.end(`{"ok":true,"result":${'['.repeat(200)}${']'.repeat(200)}}`); return true;
      case 'enorme': res.writeHead(200, { 'content-type': 'application/json' }); res.end(`{"ok":true,"result":"${'x'.repeat(600_000)}"}`); return true;
      case 'sin_forma': ok(res, { cosa: 'rara' }); return true;
      case 'redirige': res.writeHead(302, { location: 'http://127.0.0.2:9/robar' }); res.end(); return true;
      case 'nunca': abiertos.add(res); return true;
      case 'lento': {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"ok":true,');
        const t = setTimeout(() => { try { res.end('"result":true}'); } catch { /* cerrado */ } }, e.ms ?? 1000);
        res.on('close', () => clearTimeout(t));
        abiertos.add(res);
        return true;
      }
      default: return false;
    }
  }

  const mensajeDe = (chat, extra) => ({
    message_id: siguienteMensaje++, date: ahora(),
    chat: { id: chat.id, type: chat.tipo, ...(chat.tipo === 'private' ? { first_name: chat.nombre } : { title: chat.nombre }) },
    ...extra,
  });

  function chatDe(id, res) {
    const chat = chatsPorId.get(String(id));
    if (!chat) { error(res, 400, 'Bad Request: chat not found'); return null; }
    if (chat.bloqueado) { error(res, 403, 'Forbidden: bot was blocked by the user'); return null; }
    return chat;
  }

  async function metodo(res, bot, nombre, params, escena, extra) {
    switch (nombre) {
      case 'getMe':
        return ok(res, { id: bot.id, is_bot: true, first_name: bot.nombre, username: bot.usuario, can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false });
      case 'getWebhookInfo':
        return ok(res, { url: bot.webhook, has_custom_certificate: false, pending_update_count: updates.length });
      case 'sendMessage': {
        const chat = chatDe(params.chat_id, res);
        if (!chat) return;
        const texto = String(params.text ?? '');
        if (!texto) return error(res, 400, 'Bad Request: message text is empty');
        if (texto.length > 4096) return error(res, 400, 'Bad Request: message is too long');
        const m = mensajeDe(chat, { from: { id: bot.id, is_bot: true, first_name: bot.nombre, username: bot.usuario }, text: texto });
        mensajes.push({ ...m, chatId: String(chat.id), silencioso: params.disable_notification === true || params.disable_notification === 'true', params });
        return ok(res, m);
      }
      case 'sendDocument': {
        const chat = chatDe(params.chat_id, res);
        if (!chat) return;
        const doc = extra?.archivos?.document;
        if (!doc) return error(res, 400, 'Bad Request: there is no document in the request');
        if (doc.datos.length > subirMax) return error(res, 413, 'Request Entity Too Large');
        const id = `BQ${randomBytes(12).toString('hex')}`;
        const unico = `AgAD${randomBytes(6).toString('hex')}`;
        const ruta = `documents/file_${siguienteArchivo++}.opc`;
        archivos.set(id, { unico, datos: doc.datos, ruta });
        porRuta.set(ruta, id);
        const documento = { file_name: doc.nombre, mime_type: 'application/octet-stream', file_id: id, file_unique_id: unico, file_size: doc.datos.length };
        if (escena?.nombre === 'sin_tamano') delete documento.file_size;
        const m = mensajeDe(chat, { from: { id: bot.id, is_bot: true, first_name: bot.nombre, username: bot.usuario }, document: documento, ...(params.caption ? { caption: params.caption } : {}) });
        mensajes.push({ ...m, chatId: String(chat.id), silencioso: params.disable_notification === 'true' });
        documentos.push({ chatId: String(chat.id), mensajeId: m.message_id, nombre: doc.nombre, bytes: doc.datos.length, sha256: createHash('sha256').update(doc.datos).digest('hex'), leyenda: params.caption ?? null, archivoId: id, silencioso: params.disable_notification === 'true' });
        return ok(res, m);
      }
      case 'getFile': {
        const a = archivos.get(String(params.file_id ?? ''));
        if (!a) return error(res, 400, 'Bad Request: invalid file_id');
        if (a.datos.length > bajarMax) return error(res, 400, 'Bad Request: file is too big');
        const r = { file_id: params.file_id, file_unique_id: a.unico, file_size: a.datos.length, file_path: a.ruta };
        if (escena?.nombre === 'sin_ruta') delete r.file_path;
        if (escena?.nombre === 'sin_tamano') delete r.file_size;
        if (escena?.nombre === 'ruta_rara') r.file_path = '../secretos/x';
        return ok(res, r);
      }
      case 'pinChatMessage': {
        const chat = chatDe(params.chat_id, res);
        if (!chat) return;
        const m = mensajes.find(x => x.chatId === String(chat.id) && x.message_id === Number(params.message_id));
        if (!m) return error(res, 400, 'Bad Request: message to pin not found');
        if (escena?.nombre !== 'otro_fijado') chat.fijado = m.message_id;
        return ok(res, true);
      }
      case 'getChat': {
        const chat = chatsPorId.get(String(params.chat_id));
        if (!chat) return error(res, 400, 'Bad Request: chat not found');
        const fijado = chat.fijado != null ? mensajes.find(x => x.chatId === String(chat.id) && x.message_id === chat.fijado) : null;
        const limpio = fijado ? Object.fromEntries(Object.entries(fijado).filter(([k]) => !['chatId', 'silencioso', 'params'].includes(k))) : null;
        return ok(res, {
          id: chat.id, type: chat.tipo, ...(chat.tipo === 'private' ? { first_name: chat.nombre } : { title: chat.nombre }),
          accent_color_id: 0, max_reaction_count: 11, ...(limpio ? { pinned_message: limpio } : {}),
        });
      }
      case 'getUpdates': {
        if (bot.webhook) return error(res, 409, "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first");
        const offset = params.offset == null ? null : Number(params.offset);
        const limite = Math.max(1, Math.min(100, Number(params.limit ?? 100)));
        if (offset != null && offset < 0) {
          const ultimas = updates.slice(offset);
          updates.splice(0, updates.length - ultimas.length); // las anteriores se olvidan
        } else if (offset != null) {
          for (let i = updates.length - 1; i >= 0; i--) if (updates[i].update_id < offset) updates.splice(i, 1);
        }
        const espera = Math.min(Number(params.timeout ?? 0) * 1000, esperaMaximaMs);
        if (!updates.length && espera > 0) await new Promise(listo => setTimeout(listo, espera));
        const lista = offset != null && offset < 0 ? updates.slice(0, -offset) : updates;
        return ok(res, lista.slice(0, limite));
      }
      default:
        return error(res, 404, 'Not Found');
    }
  }

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const archivo = /^\/file\/bot([^/]+)\/(.+)$/.exec(url.pathname);
    const llamada = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(url.pathname);
    const cuerpo = await leerCuerpo(req);
    if (archivo) {
      const bot = porToken.get(archivo[1]);
      pedidos.push({ metodo: 'file', bot: bot?.id ?? null, ruta: archivo[2], largo: cuerpo.length });
      const escena = tomarEscena('file');
      if (aplicarEscena(escena, res)) return;
      if (!bot) return error(res, 401, 'Unauthorized');
      if (escena?.nombre === 'ruta_vencida') return error(res, 404, 'Not Found');
      const id = porRuta.get(archivo[2]);
      if (!id) return error(res, 404, 'Not Found');
      let datos = archivos.get(id).datos;
      if (escena?.nombre === 'cambiar_bytes') { datos = Buffer.from(datos); datos[Math.floor(datos.length / 2)] ^= 0x01; }
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': datos.length });
      return res.end(datos);
    }
    if (!llamada) return error(res, 404, 'Not Found');
    const [, token, nombre] = llamada;
    const bot = porToken.get(token);
    let params = {};
    let extra = null;
    const tipo = String(req.headers['content-type'] ?? '');
    if (tipo.startsWith('multipart/form-data')) {
      extra = leerMultipart(cuerpo, tipo);
      if (!extra) return error(res, 400, 'Bad Request: invalid multipart');
      params = extra.campos;
    } else if (cuerpo.length) {
      try { params = JSON.parse(cuerpo.toString('utf8')); } catch { return error(res, 400, "Bad Request: can't parse JSON"); }
    }
    pedidos.push({
      metodo: nombre, bot: bot?.id ?? null, params: { ...params }, largo: cuerpo.length,
      contentLength: Number(req.headers['content-length'] ?? -1), tipo,
      archivo: extra?.archivos?.document ? { nombre: extra.archivos.document.nombre, bytes: extra.archivos.document.datos.length } : null,
    });
    const escena = tomarEscena(nombre);
    if (aplicarEscena(escena, res)) return;
    if (!TOKEN.test(token)) return error(res, 404, 'Not Found');
    if (!bot) return error(res, 401, 'Unauthorized');
    try {
      await metodo(res, bot, nombre, params, escena, extra);
    } catch {
      responder(res, 500, '<html>error</html>');
    }
  });
  await new Promise(listo => servidor.listen(0, '127.0.0.1', listo));
  const url = `http://127.0.0.1:${servidor.address().port}`;

  return {
    url, pedidos, mensajes, documentos, archivos,
    chats: chatsPorId,
    escena(metodoDe, nombre, opciones = {}) {
      if (!ESCENAS.includes(nombre)) throw new Error(`escena desconocida: ${nombre}`);
      escenas.push({ metodo: metodoDe, nombre, veces: opciones.veces ?? 1, ...opciones });
    },
    // Quita las escenas que quedan (Telegram «vuelve a funcionar»).
    sinEscenas() { escenas.splice(0, escenas.length); },
    agregarBot(b) { porToken.set(b.token, { id: b.id, usuario: b.usuario ?? `bot${b.id}`, nombre: b.nombre ?? 'OPORTIA', webhook: b.webhook ?? '' }); },
    ponerWebhook(token, url) { porToken.get(token).webhook = url; },
    agregarChat,
    bloquear(chat, si = true) { chatsPorId.get(String(chat)).bloqueado = si; },
    desfijar(chat) { chatsPorId.get(String(chat)).fijado = null; },
    fijado(chat) { return chatsPorId.get(String(chat))?.fijado ?? null; },
    // Lo que manda una persona al bot. idsAlAzar: el update_id salta HACIA ABAJO (como después de una semana sin nada).
    escribir({ chat, de = null, texto = null, documento = null, fecha = ahora(), esBot = false, idsAlAzar = false }) {
      const c = chatsPorId.get(String(chat));
      if (idsAlAzar || saltoAlAzar) { siguienteUpdate = 10 + Math.floor(Math.random() * 100); saltoAlAzar = false; }
      const u = {
        update_id: siguienteUpdate++,
        message: {
          message_id: siguienteMensaje++, date: fecha,
          from: { id: Number(de ?? chat), is_bot: esBot, first_name: c?.nombre ?? 'Alguien', ...(c?.usuario ? { username: c.usuario } : {}) },
          chat: { id: Number(chat), type: c?.tipo ?? 'private', ...(c?.tipo === 'private' || !c ? { first_name: c?.nombre ?? 'Alguien' } : { title: c.nombre }) },
          ...(texto != null ? { text: texto } : {}),
          ...(documento ? { document: documento } : {}),
        },
      };
      updates.push(u);
      return u;
    },
    saltarIdsAlAzar() { saltoAlAzar = true; },
    pendientes() { return updates.length; },
    // Cambia un byte de un archivo guardado (como si Telegram lo dañara para siempre).
    danarArchivo(archivoId) { const a = archivos.get(archivoId); a.datos = Buffer.from(a.datos); a.datos[0] ^= 0xff; },
    async cerrar() {
      for (const res of abiertos) { try { res.destroy(); } catch { /* ya cerrado */ } }
      servidor.closeAllConnections?.();
      await new Promise(listo => servidor.close(listo));
    },
  };
}
