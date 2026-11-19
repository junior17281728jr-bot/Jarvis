// Adaptador de ChatGPT (OpenAI, API «Responses»): arma el pedido y lee la respuesta. Puro: nunca usa la red ni la base.
// OPORTIA guarda y prueba (gratis) una clave de OpenAI, pero NO gasta con ella mientras su precio no esté confirmado
// en src/ia/precios.json (confirmado:false) y el dueño no la active.
//  - store:false siempre (si no, OpenAI guarda lo enviado al menos 30 días).
//  - max_output_tokens incluye lo que el modelo «razona»; mínimo 16.
//  - El texto se lee de output[] (type 'message') → content[] (type 'output_text').
//  - usage.input_tokens es el TOTAL; los de caché van dentro (input_tokens_details).
//  - «Sin saldo»: 429 con code credit_balance_exhausted, o type/code insufficient_quota.
import {
  codigoCorto, idPeticionDe, esperaPedida, tokens, comoJson, resultado, resultadoSinRespuesta, motivoSinRespuesta, revisarUsoDesconocido, TOKENS_MAX,
} from './comun.js';

const USO_CONOCIDO = new Set(['input_tokens', 'output_tokens', 'total_tokens', 'input_tokens_details', 'output_tokens_details']);
const NIVELES_NORMALES = new Set(['default', 'auto']);

// Lo que se sabe cobrar dentro de los detalles (lo demás que venga ahí es un gasto desconocido).
const DETALLE_CONOCIDO = Object.freeze({ input_tokens_details: new Set(['cached_tokens', 'cache_write_tokens']), output_tokens_details: new Set(['reasoning_tokens']) });

function leerUso(u, nivel) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  if (u.input_tokens == null || u.output_tokens == null) return null;
  const total = tokens(u.input_tokens);
  const salida = tokens(u.output_tokens);
  const cacheLectura = tokens(u.input_tokens_details?.cached_tokens);
  const cacheEscritura = tokens(u.input_tokens_details?.cache_write_tokens);
  if ([total, salida, cacheLectura, cacheEscritura].some(Number.isNaN)) return null;
  const nota = { raro: false, desconocidos: 0 };
  if (nivel != null && !NIVELES_NORMALES.has(nivel)) nota.raro = true; // por ejemplo «priority», que cuesta más
  if (cacheLectura + cacheEscritura > total) nota.raro = true;
  if ([total, salida].some(n => n > TOKENS_MAX)) nota.raro = true;
  // Los detalles: lo que se conoce ya está dentro de los totales; cualquier otra cosa (audio, imágenes, algo nuevo, a
  // cualquier profundidad) es un gasto desconocido.
  for (const [campo, conocidos] of Object.entries(DETALLE_CONOCIDO)) {
    const d = u[campo];
    if (d == null) continue;
    if (typeof d !== 'object' || Array.isArray(d)) { nota.raro = true; continue; }
    for (const [clave, v] of Object.entries(d)) if (!conocidos.has(clave)) revisarUsoDesconocido(v, nota, 1);
  }
  for (const [clave, v] of Object.entries(u)) if (!USO_CONOCIDO.has(clave)) revisarUsoDesconocido(v, nota);
  return { entrada: Math.max(0, total - cacheLectura - cacheEscritura), salida, cacheLectura, cacheEscritura, geo: null, raro: nota.raro, desconocidos: nota.desconocidos };
}

export function motivoDeError(status, json) {
  const tipo = codigoCorto(json?.error?.type);
  const codigo = codigoCorto(json?.error?.code);
  const sinCredito = codigo === 'credit_balance_exhausted' || codigo === 'insufficient_quota' || tipo === 'insufficient_quota';
  if (status === 400) return sinCredito ? 'sin_credito' : 'pedido_no_valido';
  if (status === 401) return 'clave_no_valida';
  if (status === 402) return 'sin_credito';
  if (status === 403) return 'sin_permiso';
  if (status === 404) return 'modelo_no_disponible';
  if (status === 408) return 'error_proveedor';
  if (status === 413) return 'demasiado_largo';
  if (status === 429) return sinCredito ? 'sin_credito' : 'limite_proveedor';
  if (status >= 500 && status <= 599) return 'error_proveedor';
  if (status >= 400 && status <= 499) return 'pedido_no_valido';
  return 'error_proveedor';
}

// ¿Se puede pedir el esquema con strict:true? Todo objeto con additionalProperties:false y todas sus claves en required.
export function esquemaEstricto(esquema, profundidad = 0) {
  if (!esquema || typeof esquema !== 'object' || profundidad > 32) return false;
  if (Array.isArray(esquema.anyOf)) return esquema.anyOf.every(x => esquemaEstricto(x, profundidad + 1));
  const tipos = Array.isArray(esquema.type) ? esquema.type : [esquema.type];
  if (tipos.includes('object')) {
    const props = esquema.properties ?? {};
    const req = new Set(esquema.required ?? []);
    if (esquema.additionalProperties !== false || Object.keys(props).some(k => !req.has(k))) return false;
    if (!Object.values(props).every(x => esquemaEstricto(x, profundidad + 1))) return false;
  }
  if (tipos.includes('array') && esquema.items) return esquemaEstricto(esquema.items, profundidad + 1);
  return true;
}

// Lo que gastó una imagen (gpt-image: tokens de entrada de texto y de salida de imagen).
const USO_IMAGEN = new Set(['input_tokens', 'output_tokens', 'total_tokens', 'input_tokens_details', 'output_tokens_details']);
function leerUsoImagen(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u) || u.input_tokens == null || u.output_tokens == null) return null;
  const entrada = tokens(u.input_tokens);
  const salida = tokens(u.output_tokens);
  if ([entrada, salida].some(Number.isNaN)) return null;
  const nota = { raro: [entrada, salida].some(n => n > TOKENS_MAX), desconocidos: 0 };
  for (const campo of ['input_tokens_details', 'output_tokens_details']) {
    const d = u[campo];
    if (d == null) continue;
    if (typeof d !== 'object' || Array.isArray(d)) { nota.raro = true; continue; }
    for (const [clave, v] of Object.entries(d)) if (!['text_tokens', 'image_tokens', 'cached_tokens'].includes(clave)) revisarUsoDesconocido(v, nota, 1);
  }
  for (const [clave, v] of Object.entries(u)) if (!USO_IMAGEN.has(clave)) revisarUsoDesconocido(v, nota);
  return { entrada, salida, cacheLectura: 0, cacheEscritura: 0, geo: null, raro: nota.raro, desconocidos: nota.desconocidos };
}

// 0.14.50: lo que gastó un dictado (gpt-4o-mini-transcribe): { type: 'tokens', input_tokens, input_token_details:
// { audio_tokens, text_tokens }, output_tokens, total_tokens }. Otro tipo (por ejemplo «duration» de whisper-1) no se
// sabe cobrar: null (se cuenta lo apartado).
const USO_DICTADO = new Set(['type', 'input_tokens', 'output_tokens', 'total_tokens', 'input_token_details', 'output_token_details']);
function leerUsoDictado(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u) || u.input_tokens == null || u.output_tokens == null) return null;
  if (u.type != null && u.type !== 'tokens') return null;
  const entrada = tokens(u.input_tokens);
  const salida = tokens(u.output_tokens);
  if ([entrada, salida].some(Number.isNaN)) return null;
  const nota = { raro: [entrada, salida].some(n => n > TOKENS_MAX), desconocidos: 0 };
  for (const campo of ['input_token_details', 'output_token_details']) {
    const d = u[campo];
    if (d == null) continue;
    if (typeof d !== 'object' || Array.isArray(d)) { nota.raro = true; continue; }
    for (const [clave, v] of Object.entries(d)) if (!['text_tokens', 'audio_tokens', 'cached_tokens'].includes(clave)) revisarUsoDesconocido(v, nota, 1);
  }
  for (const [clave, v] of Object.entries(u)) if (!USO_DICTADO.has(clave)) revisarUsoDesconocido(v, nota);
  return { entrada, salida, cacheLectura: 0, cacheEscritura: 0, geo: null, raro: nota.raro, desconocidos: nota.desconocidos };
}
// 0.14.50: el nombre del archivo según lo que grabó el navegador (OpenAI mira la extensión).
const EXTENSION_AUDIO = Object.freeze({ 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' });
// El cuerpo multipart/form-data, armado a mano (sin dependencias): los campos de texto y el archivo tal cual.
export function multipartDictado({ modelo, audio, tipo, idioma = null, pista = null, frontera }) {
  const base = String(tipo ?? '').split(';')[0].trim().toLowerCase();
  const ext = EXTENSION_AUDIO[base] ?? 'webm';
  const campo = (nombre, valor) => Buffer.from(`--${frontera}\r\nContent-Disposition: form-data; name="${nombre}"\r\n\r\n${valor}\r\n`, 'utf8');
  const partes = [campo('model', modelo), campo('response_format', 'json')];
  if (idioma === 'es' || idioma === 'en') partes.push(campo('language', idioma));
  if (typeof pista === 'string' && pista.trim()) partes.push(campo('prompt', pista.replace(/[\r\n]+/g, ' ').trim()));
  partes.push(Buffer.from(`--${frontera}\r\nContent-Disposition: form-data; name="file"; filename="dictado.${ext}"\r\nContent-Type: ${base in EXTENSION_AUDIO ? base : 'audio/webm'}\r\n\r\n`, 'utf8'));
  partes.push(Buffer.isBuffer(audio) ? audio : Buffer.alloc(0), Buffer.from(`\r\n--${frontera}--\r\n`, 'utf8'));
  return Buffer.concat(partes);
}

// 0.14.2: los modelos de la lista (GET /v1/models → data[].id), solo los que tienen un nombre que se entiende.
export function modelosDeLista(json) {
  const lista = Array.isArray(json?.data) ? json.data : [];
  return [...new Set(lista.map(x => x?.id).filter(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:\/-]{1,80}$/.test(id)))].slice(0, 400);
}

function textoDe(json) {
  const partes = [];
  let rechazo = false;
  for (const item of Array.isArray(json?.output) ? json.output : []) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c?.type === 'output_text' && typeof c.text === 'string') partes.push(c.text);
      else if (c?.type === 'refusal') rechazo = true;
    }
  }
  return { texto: partes.join(''), rechazo };
}

const VOZ = 'coral';
export const openai = Object.freeze({
  id: 'openai',
  uso: 'ia_openai',
  base: 'https://api.openai.com',
  host: 'api.openai.com',

  pedido({ modelo, sistema, texto, esquema = null, salidaMax }) {
    const cuerpo = { model: modelo, instructions: sistema, input: texto, max_output_tokens: Math.max(16, Number(salidaMax) || 16), store: false };
    // 0.14.2: strict solo si el esquema lo permite (todo objeto cerrado y con todas sus claves en «required»); si no,
    // igual se revisa con el mismo candado que a Claude (src/ia/esquema.js).
    if (esquema) cuerpo.text = { format: { type: 'json_schema', name: 'campos', schema: esquema, strict: esquemaEstricto(esquema) } };
    return { ruta: '/v1/responses', metodo: 'POST', cuerpo };
  },

  // 0.14.2: «Dibujos con IA» (solo ChatGPT dibuja): una imagen WebP pequeña. La respuesta trae la imagen en base64.
  pedidoImagen({ modelo, texto }) {
    return { ruta: '/v1/images/generations', metodo: 'POST', cuerpo: { model: modelo, prompt: texto, n: 1, size: '1024x1024', quality: 'low', output_format: 'webp', output_compression: 60 } };
  },

  leerImagen(resp) {
    const antes = resultadoSinRespuesta(resp);
    if (antes) return antes;
    const { status, json } = resp;
    const idPeticion = idPeticionDe(resp.cabeceras?.['x-request-id']);
    if (status >= 200 && status <= 299) {
      const uso = resp.demasiado ? null : leerUsoImagen(json?.usage);
      const estado = uso ? 'hecha' : 'desconocida';
      const b64 = json?.data?.[0]?.b64_json;
      if (resp.demasiado || !uso || typeof b64 !== 'string' || !b64) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status });
      return resultado({ motivo: 'ok', estado, uso, json: { b64 }, idPeticion, http: status });
    }
    return resultado({ motivo: motivoDeError(status, json), estado: 'fallida', idPeticion, http: status, detalle: { tipo: json?.error?.type, codigo: json?.error?.code } });
  },

  // 0.14.29: la voz natural de la «Práctica en vivo» (solo ChatGPT): el texto leído en mp3, como eventos (stream_format
  // 'sse'): así llega también lo que gastó (el último evento trae usage). Voz «coral», en español, como un examinador.
  pedidoAudio({ modelo, texto, instrucciones }) {
    return { ruta: '/v1/audio/speech', metodo: 'POST', cuerpo: { model: modelo, input: texto, voice: VOZ, response_format: 'mp3', stream_format: 'sse', ...(instrucciones ? { instructions: instrucciones } : {}) } };
  },
  // Los eventos → { audio: base64 de todo el mp3, usage } (o null si no se entienden).
  eventosAudio(crudo) {
    if (typeof crudo !== 'string' || !crudo) return null;
    const partes = [];
    let usage = null;
    for (const linea of crudo.split(/\r?\n/)) {
      if (!linea.startsWith('data:')) continue;
      let e = null;
      try { e = JSON.parse(linea.slice(5).trim()); } catch { continue; }
      if (e?.type === 'speech.audio.delta' && typeof e.audio === 'string') partes.push(e.audio);
      else if (e?.type === 'speech.audio.done' && e.usage && typeof e.usage === 'object') usage = e.usage;
    }
    if (!partes.length && !usage) return null;
    // Cada pedazo es base64 por separado: se junta como bytes.
    const audio = Buffer.concat(partes.map(b => Buffer.from(b, 'base64'))).toString('base64');
    return { audio, usage };
  },
  leerAudio(resp) {
    const antes = resultadoSinRespuesta(resp);
    if (antes) return antes;
    const { status, json } = resp;
    const idPeticion = idPeticionDe(resp.cabeceras?.['x-request-id']);
    if (status >= 200 && status <= 299) {
      const uso = resp.demasiado ? null : leerUsoImagen(json?.usage);
      const estado = uso ? 'hecha' : 'desconocida';
      const audio = json?.audio;
      if (resp.demasiado || !uso || typeof audio !== 'string' || !audio) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status });
      return resultado({ motivo: 'ok', estado, uso, json: { audio }, idPeticion, http: status });
    }
    return resultado({ motivo: motivoDeError(status, json), estado: 'fallida', idPeticion, http: status, detalle: { tipo: json?.error?.type, codigo: json?.error?.code } });
  },

  // 0.14.50: el dictado de la «Práctica en vivo» (solo ChatGPT): la grabación del alumno pasada a texto. Multipart (el
  // archivo tal cual, nunca en JSON); la respuesta es JSON { text, usage }. tipoCuerpo: el Content-Type con su frontera.
  pedidoTranscripcion({ modelo, audio, tipo, idioma, pista, frontera }) {
    return { ruta: '/v1/audio/transcriptions', metodo: 'POST', cuerpoCrudo: multipartDictado({ modelo, audio, tipo, idioma, pista, frontera }), tipoCuerpo: `multipart/form-data; boundary=${frontera}` };
  },
  leerTranscripcion(resp) {
    const antes = resultadoSinRespuesta(resp);
    if (antes) return antes;
    const { status, json } = resp;
    const idPeticion = idPeticionDe(resp.cabeceras?.['x-request-id']);
    if (status >= 200 && status <= 299) {
      const uso = resp.demasiado ? null : leerUsoDictado(json?.usage);
      const estado = uso ? 'hecha' : 'desconocida';
      const texto = json?.text;
      if (resp.demasiado || !uso || typeof texto !== 'string') return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status });
      return resultado({ motivo: 'ok', estado, uso, texto, json: { texto }, idPeticion, http: status });
    }
    // Un 400 que no es «sin saldo» casi siempre es la grabación (vacía, cortada, un formato raro): no pausa la clave.
    let motivo = motivoDeError(status, json);
    if (motivo === 'pedido_no_valido' && status === 400) motivo = 'audio_no_valido';
    return resultado({ motivo, estado: 'fallida', idPeticion, http: status, reintentarMs: motivo === 'limite_proveedor' ? esperaPedida(resp.cabeceras?.['retry-after']) : null, detalle: { tipo: json?.error?.type, codigo: json?.error?.code } });
  },

  cabeceras(clave) {
    return { authorization: `Bearer ${clave}`, 'content-type': 'application/json' };
  },

  leer(resp, { json: quiereJson = true } = {}) {
    const antes = resultadoSinRespuesta(resp);
    if (antes) return antes;
    const { status, json } = resp;
    const idPeticion = idPeticionDe(resp.cabeceras?.['x-request-id'], json?.id);
    if (status >= 200 && status <= 299) {
      const uso = resp.demasiado ? null : leerUso(json?.usage, json?.service_tier);
      const estado = uso ? 'hecha' : 'desconocida';
      const situacion = json?.status;
      const razon = json?.incomplete_details?.reason;
      const detalle = { stop: razon ?? situacion };
      if (resp.demasiado || !json) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      const { texto, rechazo } = textoDe(json);
      if (situacion === 'failed') return resultado({ motivo: 'error_proveedor', estado, uso, idPeticion, http: status, detalle: { ...detalle, codigo: json?.error?.code } });
      if (situacion === 'incomplete') {
        return resultado({ motivo: razon === 'content_filter' ? 'rechazada' : 'respuesta_incompleta', estado, uso, idPeticion, http: status, detalle });
      }
      if (situacion !== 'completed') return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      if (rechazo) return resultado({ motivo: 'rechazada', estado, uso, idPeticion, http: status, detalle });
      if (!uso) return resultado({ motivo: 'respuesta_no_valida', estado, idPeticion, http: status, detalle });
      if (!quiereJson) return resultado({ motivo: 'ok', estado, uso, texto, idPeticion, http: status, detalle });
      const leido = comoJson(texto);
      if (leido.error) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      return resultado({ motivo: 'ok', estado, uso, texto, json: leido.json, idPeticion, http: status, detalle });
    }
    const motivo = motivoDeError(status, json);
    return resultado({
      motivo,
      estado: 'fallida',
      idPeticion,
      reintentarMs: motivo === 'limite_proveedor' ? esperaPedida(resp.cabeceras?.['retry-after']) : null,
      http: status,
      detalle: { tipo: json?.error?.type, codigo: json?.error?.code },
    });
  },

  // La prueba de una clave: la LISTA de modelos (GET /v1/models, gratis: no usa tokens). 0.14.2: antes leía un modelo
  // adivinado; ahora la lista sirve además para elegir los modelos (src/claves/probar.js la guarda).
  prueba() {
    return { ruta: '/v1/models', metodo: 'GET', cuerpo: null };
  },

  leerPrueba(resp) {
    const antes = motivoSinRespuesta(resp);
    if (antes) return antes;
    if (resp.status >= 200 && resp.status <= 299) return 'ok';
    const motivo = motivoDeError(resp.status, resp.json);
    return motivo === 'demasiado_largo' ? 'error_proveedor' : motivo;
  },
});
