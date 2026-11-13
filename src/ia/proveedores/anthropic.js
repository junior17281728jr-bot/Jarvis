// Adaptador de Claude (Anthropic): arma el pedido y lee la respuesta. Puro: nunca usa la red (eso lo hace
// src/ia/llamar.js, el único que llama a fetch) ni la base.
// Reglas de la API (versión 2026-10-21, revisadas el 2026-11-05):
//  - Solo se mandan model, max_tokens, system, messages y output_config (effort + formato JSON). En esta versión los
//    parámetros de muestreo dan error 400 en todos los modelos, así que nunca se mandan; tampoco «pensar» a mano (en
//    Claude Haiku 5.5 piensa solo, y lo que piensa cuenta dentro de max_tokens), ni respuestas empezadas, ni modelos de
//    reemplazo del lado del servidor (Haiku 5.5 no los tiene).
//  - Nunca se manda inference_geo: decide el espacio de trabajo. Lo que se usó llega en usage.inference_geo y se cobra
//    (×1,1 si fue solo en EE. UU.).
//  - La respuesta se lee por TIPO de bloque: pueden venir bloques de «pensar» antes del texto.
//  - «Sin saldo» llega como 402 o como 400 con «credit balance» en el mensaje (también como texto plano); el límite de
//    gasto propio llega como 400 «You have reached your specified … API usage limits» o como 429
//    enforced_spend_limit_reached. Esos mensajes se leen solo en memoria, nunca se guardan.
import {
  codigoCorto, idPeticionDe, esperaPedida, tokens, comoJson, resultado, resultadoSinRespuesta, motivoSinRespuesta, revisarUsoDesconocido, TOKENS_MAX,
} from './comun.js';

const VERSION_API = '2026-10-21';
const LIMITE_GASTO = /you have reached your specified (?:workspace )?api usage limits/i;
const SIN_CREDITO = /credit balance/i;
const VERIFICACION_IDENTIDAD = /identity verification/i;
// Lo que Anthropic informa y OPORTIA sabe cobrar. Cualquier otra cosa (un número mayor que 0, un texto o un objeto con
// algo dentro, a cualquier profundidad) es un gasto desconocido: src/ia/proveedores/comun.js (revisarUsoDesconocido).
const USO_CONOCIDO = new Set(['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'cache_creation', 'server_tool_use', 'service_tier', 'inference_geo', 'speed']);

function leerUso(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  if (u.input_tokens == null || u.output_tokens == null) return null;
  const entrada = tokens(u.input_tokens);
  const salida = tokens(u.output_tokens);
  const cacheLectura = tokens(u.cache_read_input_tokens);
  const cacheEscritura = tokens(u.cache_creation_input_tokens);
  if ([entrada, salida, cacheLectura, cacheEscritura].some(Number.isNaN)) return null;
  const nota = { raro: false, desconocidos: 0 };
  // Un número absurdo (más de lo que cabe en cualquier modelo): nunca se confía en él.
  if ([entrada, salida, cacheLectura, cacheEscritura].some(n => n > TOKENS_MAX)) nota.raro = true;
  // cache_creation: el detalle de cache_creation_input_tokens. La caché de 5 minutos ya está dentro de ese total; la de
  // 1 hora (cuesta el doble de la entrada) OPORTIA nunca la pide, y cualquier otra cosa ahí dentro es desconocida.
  if (u.cache_creation != null) {
    if (typeof u.cache_creation !== 'object' || Array.isArray(u.cache_creation)) nota.raro = true;
    else {
      for (const [clave, v] of Object.entries(u.cache_creation)) {
        if (clave === 'ephemeral_5m_input_tokens' && Number.isSafeInteger(v) && v >= 0) continue;
        revisarUsoDesconocido(v, nota, 1);
      }
    }
  }
  // Herramientas del servidor (búsqueda web…): se cobran aparte; OPORTIA nunca las pide. Cualquier número mayor que 0,
  // a cualquier profundidad, es un gasto desconocido.
  revisarUsoDesconocido(u.server_tool_use, nota);
  if (u.service_tier != null && u.service_tier !== 'standard') nota.raro = true;
  if (u.speed != null && u.speed !== 'standard') nota.raro = true;
  for (const [clave, v] of Object.entries(u)) if (!USO_CONOCIDO.has(clave)) revisarUsoDesconocido(v, nota);
  const geo = typeof u.inference_geo === 'string' && /^[a-z]{2,20}$/.test(u.inference_geo) ? u.inference_geo : null;
  // Un lugar que vino pero no se entiende es un cobro desconocido (puede ser más caro): nunca se cuenta de menos.
  // (Uno que se entiende pero que la tabla de precios no conoce lo revisa liquidar, con el precio de esa llamada.)
  if (u.inference_geo != null && geo == null) nota.raro = true;
  return { entrada, salida, cacheLectura, cacheEscritura, geo, raro: nota.raro, desconocidos: nota.desconocidos };
}

function mensajeDe(json, textoCorto) {
  return String(json?.error?.message ?? textoCorto ?? '');
}

// El motivo de una respuesta de error (status ≠ 2xx). Sirve para el uso pagado y para la prueba gratis.
function motivoDeError(status, json, textoCorto) {
  const mensaje = mensajeDe(json, textoCorto);
  const codigo = codigoCorto(json?.error?.details?.error_code);
  // 0.13.9: la cuenta todavía no terminó la verificación de identidad (llega con cualquier código 4xx; también como texto).
  if (status >= 400 && status <= 499 && VERIFICACION_IDENTIDAD.test(mensaje)) return 'verificacion_identidad';
  if (status === 400) {
    if (LIMITE_GASTO.test(mensaje)) return 'limite_gasto_proveedor';
    if (SIN_CREDITO.test(mensaje)) return 'sin_credito';
    return 'pedido_no_valido';
  }
  if (status === 401) return 'clave_no_valida';
  if (status === 402) return 'sin_credito';
  if (status === 403) return 'sin_permiso';
  if (status === 404) return 'modelo_no_disponible';
  if (status === 408) return 'error_proveedor';
  if (status === 413) return 'demasiado_largo';
  if (status === 429) {
    if (codigo === 'enforced_spend_limit_reached') return 'limite_gasto_proveedor';
    if (SIN_CREDITO.test(mensaje)) return 'sin_credito';
    return 'limite_proveedor';
  }
  if (status === 529) return 'sobrecargado';
  if (status >= 500 && status <= 599) return 'error_proveedor';
  if (status >= 400 && status <= 499) return 'pedido_no_valido';
  return 'error_proveedor';
}

export const anthropic = Object.freeze({
  id: 'anthropic',
  uso: 'ia_anthropic',
  base: 'https://api.anthropic.com',
  host: 'api.anthropic.com',
  version: VERSION_API,

  // 0.12.7: cachear = true marca el «sistema» (lo estable y compartido: reglas, tarjetas del tema, preguntas del Test
  // Guide sin respuestas) con cache_control de 5 minutos (la única caché que OPORTIA pide y sabe cobrar: leerUso trata
  // cualquier otra como un gasto desconocido). Lo de cada alumno va después, en el mensaje. Sin cachear, el cuerpo es
  // el de siempre (byte a byte). Con menos de 512 tokens (Haiku 5.5 / Sonnet 5.5) el proveedor no cachea y no cobra extra.
  // 0.14.2: imagenes (opcional): [{ tipo: 'image/webp', base64 }] van antes del texto (Claude MIRA el dibujo que hizo
  // ChatGPT para revisarlo; Claude nunca dibuja).
  pedido({ modelo, sistema, texto, esquema = null, salidaMax, esfuerzo = 'low', cachear = false, imagenes = null }) {
    const outputConfig = { effort: esfuerzo };
    if (esquema) outputConfig.format = { type: 'json_schema', schema: esquema };
    const system = cachear ? [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }] : sistema;
    const content = Array.isArray(imagenes) && imagenes.length
      ? [...imagenes.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.tipo, data: i.base64 } })), { type: 'text', text: texto }]
      : texto;
    return {
      ruta: '/v1/messages',
      metodo: 'POST',
      cuerpo: { model: modelo, max_tokens: salidaMax, system, messages: [{ role: 'user', content }], output_config: outputConfig },
    };
  },

  cabeceras(clave) {
    return { 'x-api-key': clave, 'anthropic-version': VERSION_API, 'content-type': 'application/json' };
  },

  // resp: lo que devuelve llamarProveedor. Nunca lanza.
  leer(resp, { json: quiereJson = true } = {}) {
    const antes = resultadoSinRespuesta(resp);
    if (antes) return antes;
    const { status, json } = resp;
    const idPeticion = idPeticionDe(resp.cabeceras?.['request-id'], json?.request_id, json?.id);
    if (status >= 200 && status <= 299) {
      const uso = resp.demasiado ? null : leerUso(json?.usage);
      const estado = uso ? 'hecha' : 'desconocida';
      const stop = json?.stop_reason;
      const detalle = { stop };
      if (resp.demasiado || !json || !Array.isArray(json.content)) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      const texto = json.content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('');
      if (stop === 'max_tokens') return resultado({ motivo: 'respuesta_incompleta', estado, uso, idPeticion, http: status, detalle });
      if (stop === 'refusal') return resultado({ motivo: 'rechazada', estado, uso, idPeticion, http: status, detalle });
      if (stop !== 'end_turn') return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      if (!quiereJson) return resultado({ motivo: uso ? 'ok' : 'respuesta_no_valida', estado, uso, texto, idPeticion, http: status, detalle });
      const leido = comoJson(texto);
      if (leido.error) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      // Sin lo que gastó no se puede cobrar bien: cuenta lo máximo y no se usa la respuesta.
      if (!uso) return resultado({ motivo: 'respuesta_no_valida', estado, idPeticion, http: status, detalle });
      return resultado({ motivo: 'ok', estado, uso, texto, json: leido.json, idPeticion, http: status, detalle });
    }
    const motivo = motivoDeError(status, json, resp.textoCorto);
    return resultado({
      motivo,
      estado: 'fallida', // «Las peticiones que fallan no se cobran» (Anthropic)
      idPeticion,
      reintentarMs: motivo === 'limite_proveedor' ? esperaPedida(resp.cabeceras?.['retry-after']) : null,
      http: status,
      detalle: { tipo: json?.error?.type, codigo: json?.error?.details?.error_code },
    });
  },

  // La prueba GRATIS de una clave: contar los tokens de «Hola» con el modelo configurado (no gasta saldo; además
  // dice si esa clave puede usar ese modelo).
  prueba({ modelo }) {
    return { ruta: '/v1/messages/count_tokens', metodo: 'POST', cuerpo: { model: modelo, messages: [{ role: 'user', content: 'Hola' }] } };
  },

  leerPrueba(resp) {
    const antes = motivoSinRespuesta(resp);
    if (antes) return antes;
    if (resp.status >= 200 && resp.status <= 299) return 'ok';
    const motivo = motivoDeError(resp.status, resp.json, resp.textoCorto);
    return motivo === 'sobrecargado' || motivo === 'demasiado_largo' ? 'error_proveedor' : motivo;
  },
});
