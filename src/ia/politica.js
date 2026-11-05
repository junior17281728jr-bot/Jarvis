// Qué hace OPORTIA con cada respuesta del proveedor. Nunca reintenta solo: un error PAUSA esa clave, y el próximo
// uso la encuentra en pausa y sigue con el motor propio SIN tocar la red. Así un error nunca se repite en bucle.
//  - estado: cómo queda la fila del libro de gastos si el adaptador no dice otra cosa ('hecha' = respondió con lo
//    que gastó, 'fallida' = error claro, no se cobra, 'desconocida' = no se sabe: cuenta lo máximo apartado).
//  - pausa: 'admin' = hasta que el dueño toque «Probar y reanudar» en Claves; 'corta' = se pasa sola (pausaMs); null.
//  - aviso: nivel del aviso 'ia_proveedor:<proveedor>' para el administrador (al momento), o null.
//  - prueba: true = también queda como resultado de la prueba de la clave (la clave no sirve hasta probarla otra vez).
//  - resuelve: true = el proveedor volvió a funcionar: se cierra su aviso y se quita una pausa corta.
// «Las peticiones que fallan no se cobran» (Anthropic): un error claro cuenta 0. Lo que no se sabe cuenta lo máximo.
import { MOTIVOS } from './propositos.js';

const MINUTO = 60_000;
export const PAUSA_CORTA_MS = 2 * MINUTO;
// Cuando el proveedor pide esperar (429): lo que diga retry-after, entre 1 y 15 minutos (1 minuto si no dice).
export const ESPERA_PEDIDA = Object.freeze({ minimoMs: MINUTO, maximoMs: 15 * MINUTO, porDefectoMs: MINUTO });
// Tres fallas seguidas de la misma clave en una hora (sin un uso bueno entre ellas): pausa del dueño.
export const FALLAS_SEGUIDAS = Object.freeze({ veces: 3, ventanaMs: 60 * MINUTO });

const P = (estado, pausa = null, aviso = null, extra = {}) => Object.freeze({ estado, pausa, aviso, prueba: false, resuelve: false, ...extra });

export const POLITICA = Object.freeze({
  ok: P('hecha', null, null, { resuelve: true }),
  respuesta_incompleta: P('hecha'),
  rechazada: P('hecha'),
  respuesta_no_valida: P('hecha'), // sin lo que gastó, el adaptador la deja 'desconocida'
  clave_no_valida: P('fallida', 'admin', 'grave', { prueba: true }),
  sin_permiso: P('fallida', 'admin', 'grave', { prueba: true }),
  sin_credito: P('fallida', 'admin', 'grave'),
  limite_gasto_proveedor: P('fallida', 'admin', 'grave'),
  modelo_no_disponible: P('fallida', 'admin', 'atencion', { prueba: true }),
  limite_proveedor: P('fallida', 'corta', 'atencion', { espera: 'pedida' }),
  sobrecargado: P('fallida', 'corta', 'info'),
  error_proveedor: P('fallida', 'corta', 'info'),
  redireccion: P('fallida', 'admin', 'atencion'),
  // Un pedido que el proveedor rechaza (400) no se arregla solo: el pedido de OPORTIA está fijo y probado.
  pedido_no_valido: P('fallida', 'admin', 'atencion'),
  demasiado_largo: P('fallida'),
  sin_red: P('fallida', 'corta'), // si se cortó a mitad, el adaptador la deja 'desconocida'
  tiempo_agotado: P('desconocida', 'corta'),
  interrumpida: P('desconocida'),
  // La clave guardada no se pudo abrir justo antes de llamar (la llave cambió o falta): no salió nada, cuesta 0. No se
  // pausa al proveedor: el aviso es 'ia_llave' (lo abre src/ia/cliente.js), y reservar ya no la elige.
  clave_ilegible: P('fallida'),
});

// La política de un motivo. Uno que no esté en la tabla nunca cuenta de menos: queda 'desconocida' (lo máximo).
export function politicaDe(motivo) {
  if (Object.hasOwn(POLITICA, motivo)) return POLITICA[motivo];
  return P('desconocida', 'corta', 'info');
}

// Hasta cuándo dura una pausa corta.
export function finDePausa(politica, { reintentarMs = null, ahora = Date.now() } = {}) {
  if (politica.pausa !== 'corta') return null;
  if (politica.espera !== 'pedida') return ahora + PAUSA_CORTA_MS;
  const pedida = Number.isFinite(reintentarMs) && reintentarMs != null ? reintentarMs : ESPERA_PEDIDA.porDefectoMs;
  return ahora + Math.min(ESPERA_PEDIDA.maximoMs, Math.max(ESPERA_PEDIDA.minimoMs, pedida));
}

// Cada motivo de la tabla existe en MOTIVOS (lo comprueba test/ia.test.js; si no, las pantallas no tendrían su texto).
export const MOTIVOS_CON_POLITICA = Object.freeze(Object.keys(POLITICA).filter(m => MOTIVOS.includes(m)));
