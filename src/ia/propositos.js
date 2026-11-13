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
//  - entradaMinBytes: lo más CORTO que puede ser un pedido de este uso (su texto fijo; test/ia-ayuda.test.js comprueba
//    que nunca es más que el pedido más corto de verdad). Sirve para saber si un tope está lleno de verdad: si lo que
//    queda no alcanza ni para el pedido más corto, ya no cabe ninguno (src/ia/presupuesto.js, topeLleno).
//  - respuestaMaxBytes: lo más largo que se LEE de su respuesta (más que eso no se lee ni se usa). Una respuesta de
//    salidaMax tokens ocupa unos 20 KB: el tope deja mucho margen y protege la memoria del trabajador (120 MB).
//  - maximoMicro: lo máximo que puede costar una vez, en millonésimas de dólar (si la reserva pasa de esto, no se usa).
//  - tipicoMicro: lo que suele costar (para la pantalla, mientras no haya usos de verdad que mirar).
//  - esfuerzo: cuánto «piensa» el modelo ('low' = lo más barato).
//  - timeoutMs: tiempo máximo de una llamada (siempre menos que el tiempo de un paso de su tarea).
//  - alFaltar: qué hace quien la usa cuando la IA no está: 'motor_propio' (sigue con el motor, lo normal).
//  - ajuste: el interruptor propio del dueño que este uso necesita, además de la IA encendida.
//  - tarea: el tipo de tarea del trabajador que hace este uso.
//  - modeloAjuste (0.9.0, opcional): el ajuste de la configuración con el modelo de Claude de este uso (si no, el de
//    Claude de siempre). El instructor usa «instructorModelo»: Sonnet 5.5 o Haiku 5.5.
// 0.9.0: los tres usos del «Instructor con IA» de la academia (src/academia/instructor-ia.js). Los paga la cuenta del
// alumno (dentro del tope de su plan y del general, y solo con el permiso de IA del dueño para esa cuenta) y solo con
// «Instructor con IA» encendido. El tamaño está pensado para Sonnet 5.5 (el más caro de los dos): lo peor que puede
// costar una vez (toda la entrada al precio más caro, toda la salida, el lugar más caro y un 5 % más) era ~US$0.045 con
// Sonnet y ~US$0.002 con Haiku; lo normal, ~US$0.011 y ~US$0.0006. entradaMinBytes: el pedido más corto de verdad (el
// consejo sin cifras; test/instructor-ia.test.js lo comprueba).
// 0.12.4: la entrada sube de 7 000 a 16 384 bytes (las tarjetas largas con tildes ya no responden «demasiado_largo» y el
// Profesor recuerda más) y la salida de 2 048 a 4 096 tokens: lo que el modelo «piensa» (también con effort 'low') entra
// en max_tokens, y con 2 048 una explicación larga se cortaba («respuesta_incompleta»). Lo peor de una vez con Sonnet 5.5
// queda en ~US$0.095 (máximo 100 000 µUSD); con Haiku 5.5, ~US$0.005. Lo normal casi no cambia (se paga lo usado).
// 0.14.2: con ChatGPT o la API propia, techoMicro US$0,15 (su precio lo pone el dueño; los topes del mes no cambian).
const INSTRUCTOR = Object.freeze({
  fase: 1, ambito: 'espacio', cuentaProyecto: false, salidaMax: 4096, entradaMaxBytes: 16_384, entradaMinBytes: 2_200, respuestaMaxBytes: 65_536,
  maximoMicro: 100_000, tipicoMicro: 12_000, esfuerzo: 'low', timeoutMs: 50_000, alFaltar: 'motor_propio',
  ajuste: 'instructorIa', modeloAjuste: 'instructorModelo', tarea: 'academia.instructor', techoMicro: 150_000,
});
// 0.12.7: con «cachear», el sistema (lo estable: las reglas, igual para todos los alumnos de ese estilo) va marcado para la
// caché de 5 minutos del proveedor (src/ia/proveedores/anthropic.js). Solo donde se repite en minutos (explicar varias
// preguntas seguidas, un chat, una duda); el consejo de la semana y el plan de hoy no (casi nunca se repiten a tiempo).
const INSTRUCTOR_CACHE = Object.freeze({ ...INSTRUCTOR, cachear: true });
// 0.12.7: «Preparar tu próxima clase» (src/academia/preparar-clase.js): el ÚNICO trabajo de la IA que no espera una
// respuesta en pantalla. Lo pone en la fila el servidor web cuando el alumno TERMINA una sesión de estudio (como mucho
// uno por alumno y por día, solo si algo cambió); nunca un reloj. Siempre con Claude Haiku 5.5 (modelo fijo: es rutina),
// con su propio interruptor del dueño («prepararClase», además del instructor con IA). No cobra usos al alumno; cuenta en
// el tope de su cuenta y en el general. La entrada es más grande (las tarjetas del tema enteras + las preguntas del Test
// Guide del tema, en el prefijo que se cachea): lo peor con Haiku 5.5 es 32 768 × US$0.125/M + 4 096 × US$0.50/M, ×1,1
// (EE. UU.) ×1,05 ≈ US$0.0071 (máximo 8 000 µUSD); lo normal ≈ US$0.0015.
const PREPARAR = Object.freeze({
  ...INSTRUCTOR, entradaMaxBytes: 32_768, maximoMicro: 8_000, tipicoMicro: 1_500, ajuste: Object.freeze(['instructorIa', 'prepararClase']),
  modelo: 'claude-haiku-5-5', cachear: true, timeoutMs: 60_000, techoMicro: 60_000,
});
// 0.12.9: lo que el alumno pide DENTRO de la clase (J) y las «Preguntas personalizadas» (O): se guarda COMPARTIDO (por
// tarjeta + estilo + idioma; por tema + confusión), así que se paga una vez y lo reutilizan todos. Siempre Claude Haiku 5.5
// (modelo fijo y barato) con el sistema (el material, igual para todos) marcado para la caché de 5 minutos. Se cobra un uso
// al alumno, como una explicación. Lo peor con Haiku 5.5: 16 384 bytes (~4 100 tokens) × US$0.125/M + 4 096 × US$0.50/M,
// ×1,1 ×1,05 ≈ US$0.003 (máximo 8 000 µUSD); lo normal ≈ US$0.0012.
const CLASE_IA = Object.freeze({ ...INSTRUCTOR, maximoMicro: 8_000, tipicoMicro: 1_200, modelo: 'claude-haiku-5-5', cachear: true, techoMicro: 40_000 });
// 0.13.0: la «Fábrica de materias» (src/academia/fabrica.js) y su «Mejora continua». Los paga el dueño (ámbito
// 'general': ninguna cuenta), dentro de su TOPE PROPIO (por defecto US$20 la fábrica y US$2 al mes la mejora, editables)
// y del tope general del mes. Nunca los pide un alumno. Escribir: siempre Claude Sonnet 5.5 con el sistema (reglas + la
// lectura del libro del tema) marcado para la caché; verificar y sacar pasajes: siempre Claude Haiku 5.5.
// EXCEPCIÓN pensada (test/reglas.test.js la conoce): escribir puede apartar hasta US$0,26 por vez (la regla general es
// US$0,10), porque la lectura del tema entra entera (hasta 72 000 bytes). La reserva cuenta cada byte como un token al
// precio de escribir en caché (US$2,50/M) + 4 096 tokens de salida (US$10/M), ×1,1 (EE. UU.) ×1,05: ≈ US$0,255. Lo normal,
// con la caché: ≈ US$0,02–0,04. Salida y tiempo como todos (4 096 tokens, 60 s): cada paso pide poco (3 tarjetas, 3 preguntas).
// 0.14.2: rol 'escribir' / 'verificar' (src/ia/presupuesto.js: con ChatGPT o la API propia, el modelo fuerte o el barato
// que eligió el dueño; un rol «verificar» lo hace Claude siempre que funcione: la revisión cruzada). techoMicro: lo más
// que puede apartar una vez con OTRO precio que el de Claude (maximoDe): US$0,50 escribir, US$0,15 verificar.
const FABRICA = Object.freeze({
  fase: 1, ambito: 'general', cuentaProyecto: false, salidaMax: 4096, entradaMaxBytes: 72_000, entradaMinBytes: 4_000, respuestaMaxBytes: 131_072,
  maximoMicro: 260_000, tipicoMicro: 30_000, esfuerzo: 'low', timeoutMs: 60_000, alFaltar: 'esperar', tarea: 'academia.fabrica',
  modelo: 'claude-sonnet-5-5', cachear: true, rol: 'escribir', techoMicro: 500_000,
});
// Haiku 5.5: lo peor, 190 000 bytes × US$0,125/M + 4 096 × US$0,50/M, ×1,1 ×1,05 ≈ US$0,030.
const FABRICA_HAIKU = Object.freeze({ ...FABRICA, entradaMaxBytes: 190_000, maximoMicro: 32_000, tipicoMicro: 5_000, modelo: 'claude-haiku-5-5', rol: 'verificar', techoMicro: 150_000 });
// 0.14.2: «Pídele a la IA» (el chat del dueño, Administrador → Contenido): cada mensaje es UNA llamada corta (lo que
// pidió, un resumen corto de la charla y la lista de materias y temas), con el modelo fuerte. Lo peor con Sonnet 5.5:
// 16 384 bytes × US$2,50/M + 2 048 × US$10/M, ×1,1 ×1,05 ≈ US$0,071. Lo normal ≈ US$0,01.
const CHAT = Object.freeze({ ...FABRICA, salidaMax: 2048, entradaMaxBytes: 16_384, entradaMinBytes: 3_500, respuestaMaxBytes: 65_536, maximoMicro: 80_000, tipicoMicro: 10_000, cachear: false, techoMicro: 120_000 });
// 0.14.2: «Dibujos con IA» (APAGADO por defecto; solo ChatGPT dibuja): una imagen WebP 1024×1024 de calidad baja. Con
// el precio por defecto de un modelo de imagen (US$10/M de entrada, US$40/M de salida): 4 000 bytes + 1 100 tokens de
// imagen, ×1,05 ≈ US$0,05 lo peor; lo normal ≈ US$0,015. Su tope propio (US$5 por defecto).
const DIBUJO = Object.freeze({ ...FABRICA, tipo: 'imagen', rol: 'imagen', salidaMax: 1100, entradaMaxBytes: 4_000, entradaMinBytes: 300, respuestaMaxBytes: 524_288, maximoMicro: 60_000, tipicoMicro: 15_000, cachear: false, modelo: undefined, techoMicro: 100_000 });
// Claude MIRA cada dibujo de ChatGPT (¿coincide con la tarjeta? ¿etiquetas o números mal? ¿algo engañoso?). Solo Claude
// (Haiku 5.5): 8 000 bytes + la imagen (1 600) × US$0,125/M + 1 024 × US$0,50/M, ×1,1 ×1,05 ≈ US$0,002.
const DIBUJO_REVISAR = Object.freeze({ ...FABRICA_HAIKU, proveedores: Object.freeze(['anthropic']), salidaMax: 1024, entradaMaxBytes: 12_000, entradaMinBytes: 500, respuestaMaxBytes: 32_768, maximoMicro: 6_000, tipicoMicro: 1_500, cachear: false });
// 0.14.7: «Mejorar todo con Claude (lo mejor)»: la mejora profunda lee la lectura ENTERA del libro de cada tema (hasta
// 95 000 bytes directo; más que eso, Haiku saca primero los pasajes) y la escribe y la verifica el modelo que elige el
// dueño. EXCEPCIÓN pensada (test/reglas.test.js la conoce: profunda: true; solo la fábrica, ámbito general, nunca un
// alumno; con su tope propio, US$90 por defecto con el botón, y dentro del 80 % del tope general):
//  - «Más barato: Sonnet» (PROFUNDA_SONNET): escribe Sonnet 5.5, verifica Haiku 5.5. Lo peor de una vez escribiendo:
//    125 200 bytes × US$2,50/M (escribir en caché) + 4 096 × US$10/M, ×1,1 (EE. UU.) ×1,05 ≈ US$0,409.
//  - «Lo mejor: Opus» (PROFUNDA_OPUS y PROFUNDA_OPUS_VERIFICAR): escribe Opus 5.5 y verifica OTRA llamada de Opus 5.5,
//    independiente (otro «sistema»: solo el libro y la clave; nunca ve cómo pensó el autor). Esfuerzo «medium» y salida
//    de 8 192 tokens (Opus 5.5 piensa siempre y lo que piensa entra en max_tokens: con 4 096 se cortaría). Tiempo 150 s
//    (el paso de la fábrica tiene 180 s). Solo Claude (proveedores: ['anthropic']): con «Lo mejor» nunca escribe otro.
//    Lo peor de una vez: escribir 125 200 × US$5/M + 8 192 × US$20/M, ×1,155 ≈ US$0,912; verificar 160 200 × US$5/M +
//    8 192 × US$20/M, ×1,155 ≈ US$1,115. Lo normal es mucho menos: la lectura va en la caché (lectura a US$0,20/M).
//  - Los pasajes de una lectura muy larga (extracto): siempre Haiku 5.5 (copia TAL CUAL, barato).
// Haiku 5.5 con una lectura de más de 100 000 tokens cobra el tramo largo (US$0,625/M al escribir en caché y US$2,50/M de
// salida): lo peor con 190 200 bytes ≈ US$0,149. Para los pasajes y la verificación «barata» de la mejora profunda.
const PROFUNDA_HAIKU = Object.freeze({ ...FABRICA_HAIKU, maximoMicro: 160_000, techoMicro: 300_000, profunda: true });
const PROFUNDA_SONNET = Object.freeze({ ...FABRICA, entradaMaxBytes: 125_000, maximoMicro: 410_000, tipicoMicro: 40_000, techoMicro: 600_000, profunda: true });
const PROFUNDA_OPUS = Object.freeze({
  ...FABRICA, modelo: 'claude-opus-5-5', proveedores: Object.freeze(['anthropic']), entradaMaxBytes: 125_000, salidaMax: 8192, esfuerzo: 'medium',
  timeoutMs: 150_000, maximoMicro: 915_000, tipicoMicro: 90_000, techoMicro: 915_000, profunda: true,
});
const PROFUNDA_OPUS_VERIFICAR = Object.freeze({ ...PROFUNDA_OPUS, entradaMaxBytes: 160_000, maximoMicro: 1_120_000, tipicoMicro: 150_000, techoMicro: 1_120_000, rol: 'verificar' });
// 0.14.8: «Claude mejora la app» (src/academia/app-mejora.js): Claude Opus 5.5 (solo Claude) mira UNA pantalla (sus
// archivos cortados, ~20 KB, en el sistema marcado para la caché) y propone UN cambio chico. Lo paga el dueño con su tope
// propio (US$20 por defecto; los pedidos del chat, con el tope del chat) y dentro del tope general. La reserva: 28 200
// bytes × US$5/M (escribir en caché) + 4 096 × US$20/M, ×1,05 ×1,1 ≈ US$0,257 (la misma excepción de la fábrica: ≤ US$0,26).
// EXCEPCIÓN pensada (test/reglas.test.js la conoce): hasta 110 s por llamada (el modelo grande escribe más despacio; el
// paso de la fábrica tiene 180 s). Lo normal, con la caché: ≈ US$0,05–0,10 por propuesta.
const APP = Object.freeze({
  ...FABRICA, proveedores: Object.freeze(['anthropic']), modelo: 'claude-opus-5-5', salidaMax: 4096, entradaMaxBytes: 28_000, entradaMinBytes: 2_500,
  respuestaMaxBytes: 131_072, maximoMicro: 260_000, tipicoMicro: 70_000, esfuerzo: 'low', timeoutMs: 110_000, cachear: true, rol: 'escribir', profunda: true,
});
export const PROPOSITOS = Object.freeze({
  // Fase 1: «Pedir ayuda a la IA» en un proyecto que espera aprobación (solo si el dueño encendió «Ayuda en
  // proyectos»). La IA llena el formulario y el motor propio lo vuelve a leer; una persona revisa y aprueba.
  interpretar: Object.freeze({
    fase: 1, ambito: 'espacio', cuentaProyecto: false, salidaMax: 2048, entradaMaxBytes: 24_000, entradaMinBytes: 3_500, respuestaMaxBytes: 262_144,
    maximoMicro: 5_000, tipicoMicro: 500, esfuerzo: 'low', timeoutMs: 45_000, alFaltar: 'motor_propio',
    ajuste: 'ayudaProyectos', tarea: 'ia.interpretar',
  }),
  // «Explícamelo de otra forma» en una pregunta ya respondida (se guarda por pregunta, opción y estilo: la misma
  // explicación sirve a todos los alumnos que eligieron eso y no se vuelve a pagar).
  instructor_explicar: INSTRUCTOR_CACHE,
  // El consejo de estudio de la semana (o después de un examen), con las cifras del alumno (nunca su nombre).
  instructor_consejo: INSTRUCTOR,
  // Una duda escrita sobre un tema: la IA solo puede usar las tarjetas de ese tema que se le mandan.
  instructor_duda: INSTRUCTOR_CACHE,
  // 0.10.0: el «Profesor virtual» (un chat): su modelo, tarjetas y preguntas que ya respondió (nunca su nombre).
  instructor_chat: INSTRUCTOR_CACHE,
  // 0.12.4: la «Mini-clase IA» de un concepto de «Mi repaso» (se guarda compartida por concepto, idea equivocada y
  // estilo; se cobra como una explicación) y el plan de estudio de HOY (solo con acciones que existen en la app).
  instructor_miniclase: INSTRUCTOR_CACHE,
  instructor_plan: INSTRUCTOR,
  // 0.12.7: «Preparado para ti» (ver PREPARAR).
  instructor_preparar: PREPARAR,
  // 0.12.9: «Explícamelo mejor» y «Profundizar» de una tarjeta, y las «Preguntas personalizadas» (ver CLASE_IA).
  instructor_tarjeta: CLASE_IA,
  instructor_profundizar: CLASE_IA,
  instructor_personal: CLASE_IA,
  // 0.13.0: la fábrica de materias y su mejora continua (ver FABRICA).
  fabrica_escribir: FABRICA,
  fabrica_verificar: FABRICA_HAIKU,
  mejora_escribir: FABRICA,
  mejora_verificar: FABRICA_HAIKU,
  // 0.13.9: la «Mejora profunda de las clases» (src/academia/fabrica-profunda.js): reescribir con Sonnet, verificar con
  // Haiku, con su tope propio (no gasta el de la fábrica) y dentro del tope general.
  // 0.14.7: Sonnet escribe con la lectura entera; Opus («lo mejor») escribe y verifica; Haiku saca los pasajes.
  profunda_escribir: PROFUNDA_SONNET,
  profunda_verificar: PROFUNDA_HAIKU,
  profunda_extracto: PROFUNDA_HAIKU,
  profunda_escribir_opus: PROFUNDA_OPUS,
  profunda_verificar_opus: PROFUNDA_OPUS_VERIFICAR,
  // 0.14.2: «Pídele a la IA»: cada mensaje (chat_admin) y los trabajos que el dueño aprobó con «Hazlo» (reescribir un
  // tema y verificarlo contra el libro, o «Revisar errores»), con su tope propio. Y los «Dibujos con IA» con el suyo.
  chat_admin: CHAT,
  // 0.14.7: los trabajos del chat usan el mismo modelo que eligió el dueño para la mejora profunda (Opus por defecto).
  chat_escribir: PROFUNDA_SONNET,
  chat_verificar: PROFUNDA_HAIKU,
  chat_escribir_opus: PROFUNDA_OPUS,
  chat_verificar_opus: PROFUNDA_OPUS_VERIFICAR,
  dibujo_generar: DIBUJO,
  dibujo_revisar: DIBUJO_REVISAR,
  // 0.14.8: «Claude mejora la app» (solo o lo que pidió el dueño en su pantalla) y lo que pidió en el chat.
  app_mejorar: APP,
  chat_app: APP,
});
export const PROPOSITOS_FABRICA = Object.freeze(['fabrica_escribir', 'fabrica_verificar']);
export const PROPOSITOS_CHAT = Object.freeze(['chat_admin', 'chat_escribir', 'chat_verificar', 'chat_escribir_opus', 'chat_verificar_opus', 'chat_app']);
export const PROPOSITOS_APP = Object.freeze(['app_mejorar']);
export const PROPOSITOS_DIBUJO = Object.freeze(['dibujo_generar', 'dibujo_revisar']);
export const PROPOSITOS_MEJORA = Object.freeze(['mejora_escribir', 'mejora_verificar']);
export const PROPOSITOS_PROFUNDA = Object.freeze(['profunda_escribir', 'profunda_verificar', 'profunda_extracto', 'profunda_escribir_opus', 'profunda_verificar_opus']);

// UNA sola lista para todo: el libro de gastos (ia_llamadas.resultado), las veces sin IA (ia_bloqueos.motivo), las
// pruebas gratis de las claves (secretos.prueba), las pausas (secretos.pausa_motivo) y las pantallas
// (ia.motivo.<motivo> en es.json y en.json). Agregar un motivo aquí obliga a escribir su texto en los dos idiomas.
export const MOTIVOS = Object.freeze([
  'ok',
  // La IA no se usó (sin costo): lo decide OPORTIA antes de llamar.
  'ia_apagada', 'ayuda_no_activada', 'proveedor_no_usado', 'sin_clave', 'clave_ilegible', 'llave_no_disponible',
  'precio_sin_confirmar', 'proveedor_en_pausa', 'llamada_muy_cara', 'precio_cambio', 'demasiado_largo',
  'demasiadas_llamadas', 'tope_general', 'tope_espacio', 'tope_proyecto', 'no_permitida_en_proyecto', 'proyecto_inactivo',
  // Ronda 5 de revisión: la cuenta no tiene el permiso de IA del dueño (src/cuentas/confianza.js).
  'cuenta_sin_permiso',
  // Lo que respondió el proveedor (o la red).
  'clave_no_valida', 'sin_permiso', 'sin_credito', 'limite_gasto_proveedor', 'limite_proveedor', 'sobrecargado',
  'error_proveedor', 'redireccion', 'modelo_no_disponible', 'pedido_no_valido', 'tiempo_agotado', 'sin_red',
  'respuesta_no_valida', 'respuesta_incompleta', 'rechazada',
  // Ronda 3 de revisión: la respuesta traía la clave (o un pedazo): no se guarda nada de ella y esa clave queda en pausa.
  'eco_de_clave',
  // Lo que pasó alrededor de la llamada.
  'interrumpida', 'ya_cobrada', 'base_ocupada', 'costo_mayor', 'fallas_seguidas',
  // La ayuda de la fase 1 y las rutas.
  'version_cambio', 'sin_pendiente', 'en_papelera', 'demasiadas_versiones', 'caducada', 'no_se_pudo_guardar',
  'trabajo_en_pausa', 'solo_tailnet', 'no_disponible',
  // Ronda 3 de revisión: la versión ya tiene todas las dudas que caben y además una que calcula el motor (la ayuda no
  // se ofrece: lo que hiciera la IA no se podría guardar), y la IA respondió lo mismo que entendió OPORTIA (no hace
  // falta una versión nueva).
  'demasiadas_dudas', 'sin_cambios',
  // Fase 1, parte e: la prueba gratis del token del bot de Telegram (src/claves/probar.js → src/canales/telegram.js):
  // otro programa usa ese bot (tiene un webhook), el dueño bloqueó al bot, o el chat ya no existe.
  'bot_ocupado', 'bloqueado', 'chat_no_existe',
  // 0.13.9: Anthropic todavía pide la verificación de identidad de la cuenta («Identity verification is required»).
  'verificacion_identidad',
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
