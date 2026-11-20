// 0.14.70: ElevenLabs, la «voz natural» de la academia (leer en voz alta las preguntas del oral y las clases). NO es un
// proveedor de IA que escribe: no está en PROVEEDORES (index.js) ni pasa por ctx.ia.pedir (allí todo se cobra en dólares
// por tokens). Se cobra por LETRAS: su propio tope del mes (src/academia/voz-natural.js). Este archivo es puro (sin red,
// sin base): arma los pedidos y lee las respuestas; la ÚNICA llamada a la red sigue siendo src/ia/llamar.js, que solo deja
// ir a api.elevenlabs.io (en las pruebas, al ElevenLabs falso en 127.0.0.1).
//
// Lo que se sabe de su API (no se pudo leer la documentación desde aquí: el código se defiende):
//  - POST /v1/text-to-speech/{voice_id}?output_format=… con la cabecera xi-api-key; cuerpo { text, model_id,
//    voice_settings, language_code? }; responde el mp3 tal cual (audio/mpeg).
//  - GET /v1/user/subscription (gratis): { character_count, character_limit, next_character_count_reset_unix, … }.
//  - Los errores llegan como JSON { detail: { status, message } } (a veces con code o type). OJO: el «sin créditos»
//    (quota_exceeded) suele llegar como 401, igual que una clave mala: por eso se mira PRIMERO lo que dice el cuerpo y
//    solo después el número.
import { esperaPedida } from './comun.js';

export const HOST_ELEVENLABS = 'api.elevenlabs.io';
// mp3 a 22 050 Hz y 32 kbps: una voz clara y ~4 KB por segundo (500 letras ≈ 35 s ≈ 140 KB; cabe holgado en 400 KB).
export const FORMATO_ELEVENLABS = 'mp3_22050_32';
export const MODELOS_ELEVENLABS = Object.freeze(['eleven_multilingual_v2', 'eleven_flash_v2_5']);
// Solo Flash v2.5 acepta language_code (con otro modelo, la API lo rechaza).
const CON_IDIOMA = Object.freeze(['eleven_flash_v2_5']);
// Voces ya hechas (premade) de ElevenLabs, que valen para cualquier cuenta. La primera es la de por defecto.
export const VOCES_ELEVENLABS = Object.freeze([
  Object.freeze({ id: 'JBFqnCBsd6RMkjVDRZzb', nombre: 'George' }),
  Object.freeze({ id: 'onwK4e9ZLuTAKqWW03F9', nombre: 'Daniel' }),
  Object.freeze({ id: 'nPczCjzI2devNBz1zQrb', nombre: 'Brian' }),
  Object.freeze({ id: 'pNInz6obpgDQGcFmaJgB', nombre: 'Adam' }),
  Object.freeze({ id: 'EXAVITQu4vr4xnSDxMaL', nombre: 'Sarah' }),
  Object.freeze({ id: 'XB0fDUnXU5powFXDhCwa', nombre: 'Charlotte' }),
  Object.freeze({ id: 'XrExE9yKIg1WjnnlVkGX', nombre: 'Matilda' }),
]);
export const ID_VOZ = /^[A-Za-z0-9]{16,40}$/;
// Los ajustes de la voz (fijos: entran en el nombre del archivo guardado).
export const AJUSTES_VOZ = Object.freeze({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true });

// Lo que dice el cuerpo de un error, en minúsculas (status, code o type), o ''.
function estadoDe(json) {
  const d = json?.detail;
  const v = [d?.status, d?.code, d?.type, json?.status, json?.code].find(x => typeof x === 'string' && /^[a-z0-9_]{1,60}$/i.test(x));
  return v ? v.toLowerCase() : '';
}
const SIN_CREDITO = /quota|credit|insufficient|payment|billing|limit_reached|character_limit/;
const SIN_PERMISO = /permission|unusual|not_allowed|blocked|suspended|forbidden/;
const NO_VALIDA = /invalid_api_key|api_key|unauthorized|authentication|invalid_key/;
const ESPERA = /too_many|concurrent|rate_limit|system_busy|busy/;
const SIN_VOZ = /voice_not_found|voice_does_not_exist|voice_not|not_found/;

// El motivo (de src/ia/propositos.js) de una respuesta que no fue 2xx.
export function motivoElevenlabs(status, json) {
  const e = estadoDe(json);
  if (e) {
    if (SIN_CREDITO.test(e)) return 'sin_credito';
    if (SIN_PERMISO.test(e)) return 'sin_permiso';
    if (NO_VALIDA.test(e)) return 'clave_no_valida';
    if (ESPERA.test(e)) return 'limite_proveedor';
    if (SIN_VOZ.test(e)) return 'voz_no_existe';
  }
  if (status === 402) return 'sin_credito';
  if (status === 401) return 'clave_no_valida';
  if (status === 403) return 'sin_permiso';
  if (status === 404) return 'voz_no_existe';
  if (status === 429) return 'limite_proveedor';
  if (status === 400 || status === 413 || status === 422) return 'pedido_no_valido';
  if (status >= 500) return 'error_proveedor';
  return 'error_proveedor';
}

export const elevenlabs = Object.freeze({
  id: 'elevenlabs',
  uso: 'voz_elevenlabs',
  host: HOST_ELEVENLABS,
  base: `https://${HOST_ELEVENLABS}`,
  cabeceras(clave) {
    return { 'xi-api-key': clave, 'content-type': 'application/json', accept: 'audio/mpeg' };
  },
  // Para leer la cuenta (la suscripción): solo la clave.
  cabecerasCuenta(clave) {
    return { 'xi-api-key': clave };
  },
  // Un texto leído en mp3. idioma: 'es' | 'en' (solo se manda con Flash v2.5).
  pedidoVoz({ vozId, modelo, texto, idioma = null }) {
    if (!ID_VOZ.test(String(vozId)) || !MODELOS_ELEVENLABS.includes(modelo)) throw new Error('voz o modelo no válidos');
    const cuerpo = { text: String(texto), model_id: modelo, voice_settings: { ...AJUSTES_VOZ } };
    if (CON_IDIOMA.includes(modelo) && (idioma === 'es' || idioma === 'en')) cuerpo.language_code = idioma;
    return { ruta: `/v1/text-to-speech/${vozId}?output_format=${FORMATO_ELEVENLABS}`, metodo: 'POST', cuerpo };
  },
  // Lo que pasó (sin el audio: ese llega por pedazos a quien llama). → { motivo, reintentarMs, cobra }
  // cobra: false = un error claro antes de leer (el proveedor no cobró esas letras); true = no se sabe o sí leyó.
  leerVoz(resp, { bytes = 0 } = {}) {
    if (resp.abortado || resp.tiempoAgotado) return { motivo: 'tiempo_agotado', reintentarMs: null, cobra: true };
    if (resp.rechazado || resp.red === 'local') return { motivo: 'pedido_no_valido', reintentarMs: null, cobra: false };
    if (resp.red === 'antes') return { motivo: 'sin_red', reintentarMs: null, cobra: false };
    if (resp.red === 'redireccion') return { motivo: 'redireccion', reintentarMs: null, cobra: false };
    if (resp.falloAlRecibir) return { motivo: 'no_se_pudo_guardar', reintentarMs: null, cobra: true };
    if (resp.red === 'durante' || !Number.isSafeInteger(resp.status)) return { motivo: 'sin_red', reintentarMs: null, cobra: true };
    if (resp.status >= 200 && resp.status <= 299) {
      if (resp.demasiado || !(bytes > 0)) return { motivo: 'respuesta_no_valida', reintentarMs: null, cobra: true };
      return { motivo: 'ok', reintentarMs: null, cobra: true };
    }
    const motivo = motivoElevenlabs(resp.status, resp.json);
    return { motivo, reintentarMs: motivo === 'limite_proveedor' ? esperaPedida(resp.cabeceras?.['retry-after']) : null, cobra: false };
  },
  // La suscripción (gratis): cuántas letras usó y cuántas tiene este ciclo.
  suscripcion() {
    return { ruta: '/v1/user/subscription', metodo: 'GET', cuerpo: null };
  },
  // → { motivo, credito: { usados, limite, reinicio } | null }. Una clave sin permiso de leer la cuenta (una clave
  // limitada) NO es una clave mala: { motivo: 'ok', credito: null } (crédito desconocido).
  leerSuscripcion(resp) {
    if (resp.abortado || resp.tiempoAgotado) return { motivo: 'tiempo_agotado', credito: null };
    if (resp.rechazado || resp.red === 'local') return { motivo: 'pedido_no_valido', credito: null };
    if (resp.red === 'redireccion') return { motivo: 'redireccion', credito: null };
    if (resp.red || !Number.isSafeInteger(resp.status)) return { motivo: 'sin_red', credito: null };
    if (resp.status >= 200 && resp.status <= 299) {
      const j = resp.json ?? {};
      const usados = Number.isSafeInteger(j.character_count) && j.character_count >= 0 ? j.character_count : null;
      const limite = Number.isSafeInteger(j.character_limit) && j.character_limit >= 0 ? j.character_limit : null;
      const r = Number(j.next_character_count_reset_unix);
      const reinicio = Number.isSafeInteger(r) && r > 0 ? new Date(r * 1000).toISOString() : null;
      return { motivo: 'ok', credito: usados != null && limite != null ? { usados, limite, reinicio } : null };
    }
    const motivo = motivoElevenlabs(resp.status, resp.json);
    if (motivo === 'sin_permiso') return { motivo: 'ok', credito: null };
    return { motivo: motivo === 'voz_no_existe' ? 'error_proveedor' : motivo, credito: null };
  },
});
