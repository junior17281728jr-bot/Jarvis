// 0.14.0: «API propia (compatible con OpenAI)»: un servidor del dueño (o de un tercero) que habla como OpenAI «Chat
// Completions» (POST {base}/chat/completions). El dueño pone la dirección (https, sin puerto, nunca una IP ni un nombre
// de la red interna: src/ia/config.js, basePropiaValida), la clave y los nombres de sus modelos. Puro: nunca usa la red.
//  - La dirección NO está escrita aquí: sale de la configuración (baseDe / hostDe). src/ia/llamar.js solo deja ir a ese
//    servidor (y en las pruebas, solo al proveedor falso en 127.0.0.1).
//  - El texto se lee de choices[0].message.content; usage.prompt_tokens es el TOTAL (la caché va dentro).
//  - La prueba gratis: GET {base}/models (si el servidor no la tiene, se dice «no se pudo probar» y nada más).
import {
  idPeticionDe, esperaPedida, tokens, comoJson, resultado, resultadoSinRespuesta, motivoSinRespuesta, revisarUsoDesconocido, TOKENS_MAX,
} from './comun.js';
import { motivoDeError, esquemaEstricto } from './openai.js';

const USO_CONOCIDO = new Set(['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_tokens_details', 'completion_tokens_details']);
const DETALLE_CONOCIDO = Object.freeze({
  prompt_tokens_details: new Set(['cached_tokens', 'audio_tokens']),
  completion_tokens_details: new Set(['reasoning_tokens', 'audio_tokens', 'accepted_prediction_tokens', 'rejected_prediction_tokens']),
});

function leerUso(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u) || u.prompt_tokens == null || u.completion_tokens == null) return null;
  const total = tokens(u.prompt_tokens);
  const salida = tokens(u.completion_tokens);
  const cacheLectura = tokens(u.prompt_tokens_details?.cached_tokens);
  if ([total, salida, cacheLectura].some(Number.isNaN)) return null;
  const nota = { raro: false, desconocidos: 0 };
  if (cacheLectura > total || [total, salida].some(n => n > TOKENS_MAX)) nota.raro = true;
  for (const [campo, conocidos] of Object.entries(DETALLE_CONOCIDO)) {
    const d = u[campo];
    if (d == null) continue;
    if (typeof d !== 'object' || Array.isArray(d)) { nota.raro = true; continue; }
    for (const [clave, v] of Object.entries(d)) if (!conocidos.has(clave)) revisarUsoDesconocido(v, nota, 1);
  }
  for (const [clave, v] of Object.entries(u)) if (!USO_CONOCIDO.has(clave)) revisarUsoDesconocido(v, nota);
  return { entrada: Math.max(0, total - cacheLectura), salida, cacheLectura, cacheEscritura: 0, geo: null, raro: nota.raro, desconocidos: nota.desconocidos };
}

export const propia = Object.freeze({
  id: 'propia',
  uso: 'ia_propia',
  base: null,
  host: null,
  // La dirección y el servidor salen de la configuración de la IA (proveedores.propia.base), nunca de aquí.
  baseDe: cfg => cfg?.proveedores?.propia?.base ?? null,
  hostDe(cfg) {
    const b = cfg?.proveedores?.propia?.base;
    try { return b ? new URL(b).hostname : null; } catch { return null; }
  },

  pedido({ modelo, sistema, texto, esquema = null, salidaMax }) {
    const cuerpo = {
      model: modelo, max_tokens: Math.max(16, Number(salidaMax) || 16),
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: texto }],
    };
    if (esquema) cuerpo.response_format = { type: 'json_schema', json_schema: { name: 'campos', schema: esquema, strict: esquemaEstricto(esquema) } };
    return { ruta: '/chat/completions', metodo: 'POST', cuerpo };
  },

  cabeceras(clave) {
    return { authorization: `Bearer ${clave}`, 'content-type': 'application/json' };
  },

  leer(resp, { json: quiereJson = true } = {}) {
    const antes = resultadoSinRespuesta(resp);
    if (antes) return antes;
    const { status, json } = resp;
    const idPeticion = idPeticionDe(resp.cabeceras?.['x-request-id']);
    if (status >= 200 && status <= 299) {
      const uso = resp.demasiado ? null : leerUso(json?.usage);
      const estado = uso ? 'hecha' : 'desconocida';
      const eleccion = Array.isArray(json?.choices) ? json.choices[0] : null;
      const razon = eleccion?.finish_reason;
      const detalle = { stop: razon };
      if (resp.demasiado || !json || !eleccion) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      if (razon === 'length') return resultado({ motivo: 'respuesta_incompleta', estado, uso, idPeticion, http: status, detalle });
      if (razon === 'content_filter' || (typeof eleccion.message?.refusal === 'string' && eleccion.message.refusal)) return resultado({ motivo: 'rechazada', estado, uso, idPeticion, http: status, detalle });
      if (razon !== 'stop') return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      if (!uso) return resultado({ motivo: 'respuesta_no_valida', estado, idPeticion, http: status, detalle });
      const texto = typeof eleccion.message?.content === 'string' ? eleccion.message.content : '';
      if (!quiereJson) return resultado({ motivo: 'ok', estado, uso, texto, idPeticion, http: status, detalle });
      const leido = comoJson(texto);
      if (leido.error) return resultado({ motivo: 'respuesta_no_valida', estado, uso, idPeticion, http: status, detalle });
      return resultado({ motivo: 'ok', estado, uso, texto, json: leido.json, idPeticion, http: status, detalle });
    }
    const motivo = motivoDeError(status, json);
    return resultado({
      motivo, estado: 'fallida', idPeticion, http: status,
      reintentarMs: motivo === 'limite_proveedor' ? esperaPedida(resp.cabeceras?.['retry-after']) : null,
      detalle: { tipo: json?.error?.type, codigo: json?.error?.code },
    });
  },

  prueba() {
    return { ruta: '/models', metodo: 'GET', cuerpo: null };
  },

  leerPrueba(resp) {
    const antes = motivoSinRespuesta(resp);
    if (antes) return antes;
    if (resp.status >= 200 && resp.status <= 299) return 'ok';
    const motivo = motivoDeError(resp.status, resp.json);
    return motivo === 'demasiado_largo' ? 'error_proveedor' : motivo;
  },
});
