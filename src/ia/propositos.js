// Para qué se usa la IA (los «propósitos») y por qué se usó o no (los «motivos»). Solo DATOS: lo importan los dos
// procesos (las pantallas y el trabajador). La IA es OPCIONAL: OPORTIA funciona completo con su motor propio.
//
// Cada propósito dice cuánto puede costar UNA vez y cuánto puede tardar:
//  - fase: desde qué fase del plan existe (un propósito de una fase futura no se puede usar todavía).
//  - ambito: 'espacio' (lo paga la cuenta, dentro de su tope y del general) o 'proyecto' (fase 2: también cuenta
//    contra el tope de la versión APROBADA del proyecto, y solo si esa versión permite IA).
//  - cuentaProyecto: true = la llamada cuenta contra el tope del proyecto (ia_llamadas.cuenta_proyecto = 1).
//  - salidaMax: lo máximo que puede escribir el modelo (max_tokens / max_output_tokens; incluye su «pensar»).
//  - entradaMaxBytes: lo más largo que se le puede mandar (en bytes UTF-8).
//  - maximoMicro: lo máximo que puede costar una vez, en millonésimas de dólar (si la reserva pasa de esto, no se usa).
//  - tipicoMicro: lo que suele costar (para la pantalla, mientras no haya usos de verdad que mirar).
//  - esfuerzo: cuánto «piensa» el modelo ('low' = lo más barato).
//  - timeoutMs: tiempo máximo de una llamada (siempre menos que el tiempo de un paso de su tarea).
//  - alFaltar: qué hace quien la usa cuando la IA no está: 'motor_propio' (sigue con el motor, lo normal).
//  - ajuste: el interruptor propio del dueño que este uso necesita, además de la IA encendida.
//  - tarea: el tipo de tarea del trabajador que hace este uso.
export const PROPOSITOS = Object.freeze({
  // Fase 1: «Pedir ayuda a la IA» en un proyecto que espera aprobación (solo si el dueño encendió «Ayuda en
  // proyectos»). La IA llena el formulario y el motor propio lo vuelve a leer; una persona revisa y aprueba.
  interpretar: Object.freeze({
    fase: 1, ambito: 'espacio', cuentaProyecto: false, salidaMax: 2048, entradaMaxBytes: 24_000,
    maximoMicro: 5_000, tipicoMicro: 500, esfuerzo: 'low', timeoutMs: 45_000, alFaltar: 'motor_propio',
    ajuste: 'ayudaProyectos', tarea: 'ia.interpretar',
  }),
});

// UNA sola lista para todo: el libro de gastos (ia_llamadas.resultado), las veces sin IA (ia_bloqueos.motivo), las
// pruebas gratis de las claves (secretos.prueba), las pausas (secretos.pausa_motivo) y las pantallas
// (ia.motivo.<motivo> en es.json y en.json). Agregar un motivo aquí obliga a escribir su texto en los dos idiomas.
export const MOTIVOS = Object.freeze([
  'ok',
  // La IA no se usó (sin costo): lo decide OPORTIA antes de llamar.
  'ia_apagada', 'ayuda_no_activada', 'proveedor_no_usado', 'sin_clave', 'clave_ilegible', 'llave_no_disponible',
  'precio_sin_confirmar', 'proveedor_en_pausa', 'llamada_muy_cara', 'precio_cambio', 'demasiado_largo',
  'demasiadas_llamadas', 'tope_general', 'tope_espacio', 'tope_proyecto', 'no_permitida_en_proyecto', 'proyecto_inactivo',
  // Lo que respondió el proveedor (o la red).
  'clave_no_valida', 'sin_permiso', 'sin_credito', 'limite_gasto_proveedor', 'limite_proveedor', 'sobrecargado',
  'error_proveedor', 'redireccion', 'modelo_no_disponible', 'pedido_no_valido', 'tiempo_agotado', 'sin_red',
  'respuesta_no_valida', 'respuesta_incompleta', 'rechazada',
  // Lo que pasó alrededor de la llamada.
  'interrumpida', 'ya_cobrada', 'base_ocupada', 'costo_mayor', 'fallas_seguidas',
  // La ayuda de la fase 1 y las rutas.
  'version_cambio', 'sin_pendiente', 'en_papelera', 'demasiadas_versiones', 'caducada', 'no_se_pudo_guardar',
  'trabajo_en_pausa', 'solo_tailnet', 'no_disponible',
]);

// Estados de una fila de ia_llamadas (un intento PAGADO, que pasó la reserva):
//  - reservada: en curso; cuenta lo máximo que puede costar.
//  - hecha: el proveedor respondió 200 con lo que gastó; cuenta lo que costó de verdad.
//  - fallida: error claro del proveedor o de la red antes de mandar: el proveedor no cobra; cuenta 0.
//  - desconocida: se cortó (tiempo agotado, interrumpida, respuesta ilegible): cuenta lo máximo, nunca menos.
export const ESTADOS_LLAMADA = Object.freeze(['reservada', 'hecha', 'fallida', 'desconocida']);

// ia_bloqueos.ambito: 'general', 'e<cuenta>' (espacio) o 'p<proyecto>' (id interno del proyecto).
export const AMBITO = /^(?:general|[ep][1-9]\d{0,9})$/;

// registro: los propósitos que valen (las pruebas pasan uno propio, por ejemplo un propósito de proyecto de la fase 2).
export function definicionProposito(proposito, registro = PROPOSITOS) {
  return typeof proposito === 'string' && registro && Object.hasOwn(registro, proposito) ? registro[proposito] : null;
}

export function esMotivo(motivo) {
  return typeof motivo === 'string' && MOTIVOS.includes(motivo);
}
