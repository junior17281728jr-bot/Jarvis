// Qué claves secretas guarda OPORTIA y cómo se reconocen. Solo DATOS (lo usan los dos procesos).
// El almacén (src/claves/almacen.js) es compartido: la IA ahora; el bot de Telegram en la parte e (uso 'telegram_bot').
//  - prefijos: con qué puede empezar una clave buena de ese uso (0.12.6: la Console de Claude da también claves
//    ligadas a la persona, «sk-ant-usr-…», que valen igual con x-api-key).
//  - prefijoAvisado: [prefijo, motivo]: lo que se parece (empieza igual) pero no es: un motivo más claro que clave_formato.
//  - rechazar: claves que se parecen pero NUNCA se guardan (se revisan antes que el prefijo y antes de cifrar nada):
//    una clave de administrador de la cuenta puede mucho más de lo que OPORTIA necesita, y una de la suscripción
//    (OAuth) no es de la API.
// Los nombres de los usos no llevan punto (se usan como final de las frases de las pantallas: claves.uso.<uso>).
// Las pruebas arman sus claves falsas al correr (['sk', 'ant', 'api03', …].join('-')): ninguna clave vive en el código.
export const USOS = Object.freeze({
  ia_anthropic: Object.freeze({
    grupo: 'ia', proveedor: 'anthropic', prefijos: Object.freeze(['sk-ant-api', 'sk-ant-usr']),
    prefijoAvisado: Object.freeze(['sk-ant-', 'clave_anthropic_prefijo']),
    rechazar: Object.freeze([
      Object.freeze(['sk-ant-admin', 'clave_admin']),
      Object.freeze(['sk-ant-oat', 'clave_suscripcion']),
      Object.freeze(['sk-ant-ort', 'clave_suscripcion']),
      // Claves de OpenAI pegadas en la casilla de Claude.
      Object.freeze(['sk-proj-', 'clave_otro_proveedor']),
      Object.freeze(['sk-svcacct-', 'clave_otro_proveedor']),
      Object.freeze(['sk-admin-', 'clave_admin']),
    ]),
  }),
  ia_openai: Object.freeze({
    grupo: 'ia', proveedor: 'openai', prefijos: Object.freeze(['sk-']),
    rechazar: Object.freeze([
      Object.freeze(['sk-ant-', 'clave_otro_proveedor']),
      Object.freeze(['sk-admin-', 'clave_admin']),
    ]),
  }),
  // 0.14.2: la clave de la «API propia (compatible con OpenAI)»: cualquier texto razonable (cada servidor da la suya),
  // nunca una de Claude ni de administrador.
  ia_propia: Object.freeze({
    grupo: 'ia', proveedor: 'propia',
    rechazar: Object.freeze([
      Object.freeze(['sk-ant-', 'clave_otro_proveedor']),
      Object.freeze(['sk-admin-', 'clave_admin']),
    ]),
  }),
  // Fase 1, parte e: el token del bot de Telegram del dueño (avisos graves y copias de cada noche). Lo da @BotFather:
  // números, dos puntos y letras. Lo usa SOLO src/canales/credencial.js (la puerta de los canales a esta clave).
  telegram_bot: Object.freeze({ grupo: 'avisos', formato: /^\d{6,15}:[A-Za-z0-9_-]{30,80}$/, rechazar: Object.freeze([]) }),
  // 0.14.8: el token de GitHub de «Claude mejora la app» (src/canales/github.js): SOLO uno «fine-grained» (github_pat_…),
  // de UN repositorio, con «Contents: Read and write». Uno clásico (ghp_…) puede todo en todas las cuentas: no se guarda.
  github_token: Object.freeze({
    grupo: 'codigo', prefijos: Object.freeze(['github_pat_']), formato: /^github_pat_[A-Za-z0-9_]{40,255}$/,
    rechazar: Object.freeze([Object.freeze(['ghp_', 'clave_github_clasica']), Object.freeze(['gho_', 'clave_github_clasica']), Object.freeze(['ghu_', 'clave_github_clasica']), Object.freeze(['ghs_', 'clave_github_clasica'])]),
  }),
});

export const GRUPOS = Object.freeze(['ia', 'avisos', 'codigo']);
export const LARGO = Object.freeze({ min: 20, max: 500 });

// secretos.estado. «No se puede leer» no se guarda: se calcula (la llave cambió o falta).
export const ESTADOS_SECRETO = Object.freeze(['activa', 'desactivada', 'reemplazada']);
// secretos.origen: 'pegada' (la pegó el dueño en Administrador → Claves).
export const ORIGENES_SECRETO = Object.freeze(['pegada']);

export function definicionUso(uso) {
  return typeof uso === 'string' && Object.hasOwn(USOS, uso) ? USOS[uso] : null;
}

// El uso de las claves de un proveedor de IA ('anthropic' → 'ia_anthropic'), o null.
export function usoDeProveedor(proveedor) {
  return Object.keys(USOS).find(uso => USOS[uso].proveedor === proveedor) ?? null;
}
