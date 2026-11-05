// Piezas que comparten los adaptadores de los proveedores de IA. Todo es puro: nada de red, nada de base.
// Lo que dice un proveedor (sus mensajes de error) se lee SOLO en memoria para clasificarlo; nunca se guarda.

const CODIGO = /^[a-z0-9_]{1,60}$/;
// El id de una petición, SOLO con la forma que usan los proveedores: req_… (Anthropic y OpenAI), msg_… (un mensaje de
// Claude) o resp_… (una respuesta de OpenAI), con letras, números y _ (nunca «-»: una clave sk-… nunca cabe aquí).
// Cualquier otra cosa no se guarda (ia_llamadas.id_peticion queda vacío). Además, src/ia/cliente.js quita todo id que
// traiga un pedazo de la clave antes de leer la respuesta.
export const ID_PETICION = /^(?:req|msg|resp)_[A-Za-z0-9_]{1,90}$/;

// Un código corto que sí se puede guardar (detalle de la fila): solo letras minúsculas, números y _.
export function codigoCorto(valor) {
  const texto = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  return CODIGO.test(texto) ? texto : null;
}

export function idPeticionDe(...candidatos) {
  for (const c of candidatos) if (typeof c === 'string' && ID_PETICION.test(c)) return c;
  return null;
}

// Retry-After: segundos o una fecha HTTP. Devuelve milisegundos (o null).
export function esperaPedida(valor, ahoraMs = Date.now()) {
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (/^\d{1,7}$/.test(texto)) return Number(texto) * 1000;
  const fecha = Date.parse(texto);
  return Number.isFinite(fecha) ? Math.max(0, fecha - ahoraMs) : null;
}

// Un número de tokens: entero de 0 en adelante (o 0 si no vino). NaN si vino algo raro.
export function tokens(valor) {
  if (valor == null) return 0;
  return Number.isSafeInteger(valor) && valor >= 0 ? valor : Number.NaN;
}

// Lo que el modelo escribió, si es JSON: { json } o { error: true }.
export function comoJson(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return { error: true };
  try {
    return { json: JSON.parse(texto) };
  } catch {
    return { error: true };
  }
}

// El resultado común de leer una respuesta (lo que recibe liquidar). estado: 'hecha' | 'fallida' | 'desconocida'.
export function resultado({ motivo, estado, uso = null, texto = null, json = null, idPeticion = null, reintentarMs = null, http = null, detalle = {} }) {
  const limpio = {};
  for (const [clave, valor] of Object.entries(detalle ?? {})) {
    const v = codigoCorto(valor);
    if (v && /^[a-zA-Z]{1,30}$/.test(clave)) limpio[clave] = v;
  }
  return { motivo, estado, uso, texto, json, idPeticion, reintentarMs, http: Number.isSafeInteger(http) ? http : null, detalle: limpio };
}

// Lo que pasó ANTES de tener una respuesta del proveedor (lo arma src/ia/llamar.js).
export function resultadoSinRespuesta(resp) {
  if (resp.abortado) return resultado({ motivo: 'interrumpida', estado: 'desconocida' });
  if (resp.tiempoAgotado) return resultado({ motivo: 'tiempo_agotado', estado: 'desconocida', http: resp.status });
  if (resp.red === 'local') return resultado({ motivo: 'pedido_no_valido', estado: 'fallida' });
  if (resp.red === 'antes') return resultado({ motivo: 'sin_red', estado: 'fallida' });
  if (resp.red === 'redireccion') return resultado({ motivo: 'redireccion', estado: 'fallida', http: resp.status });
  if (resp.red === 'durante') return resultado({ motivo: 'sin_red', estado: 'desconocida', http: resp.status });
  if (!Number.isSafeInteger(resp.status)) return resultado({ motivo: 'sin_red', estado: 'desconocida' });
  return null;
}

// Para la prueba gratis: lo mismo, pero solo el motivo.
export function motivoSinRespuesta(resp) {
  if (resp.tiempoAgotado || resp.abortado) return 'tiempo_agotado';
  if (resp.red === 'local') return 'pedido_no_valido';
  if (resp.red === 'redireccion') return 'redireccion';
  if (resp.red === 'antes' || resp.red === 'durante' || !Number.isSafeInteger(resp.status)) return 'sin_red';
  return null;
}
