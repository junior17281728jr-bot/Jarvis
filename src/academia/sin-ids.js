// Academia 0.14.16 (pedido del dueño): un alumno NUNCA ve un id interno («t4», «tg-3-28», «m03», «muestra-h3»,
// «factores_humanos/muestra-hipoxia») en lo que escribió la IA. Puro: se aplica a la PROSA de lo guardado de la IA al
// leerlo (src/academia/instructor-ia.js, leerGuardado), también a lo que se guardó antes de esta versión.
// Con un «mapa» (id → nombre de verdad), el id se cambia por su nombre («la tarjeta «Qué es»»); si no, se quita con la
// puntuación que queda colgando. Los botones con el título los pone la app.

// Cortos: solo los prefijos que los pedidos dan de verdad (t4 = tarjeta, tg…, m03, q12, p3): nunca «co2» ni «VOR».
const CORTO = '(?:tg|t|m|q|p)\\d{1,4}';
// Largos: con guion, guion bajo o barra Y con un número o un guion bajo («tg-3-28», «muestra-h3», «factores_humanos»):
// «aire/combustible», «pies/min» o «piloto-automático» no son ids.
const LARGO = '[a-z][a-z0-9]*(?:[-_/][a-z0-9]+)+';
const UNO = `(?:${LARGO}|${CORTO})`;
// Nunca dentro de una dirección o un correo («evil.example/x», «a@b.c»).
const ANTES = '(?<![\\p{L}\\p{N}./:@-])';
const DESPUES = '(?![\\p{L}\\p{N}]|[./:@-][\\p{L}\\p{N}])';
// Una lista de ids («t4, t5 y t9») sale entera, con sus comas y su «y».
const GRUPO = new RegExp(`${ANTES}${UNO}(?:\\s*(?:,|\\by\\b|\\bo\\b)\\s*${UNO})*${DESPUES}`, 'gu');
const SOLO = new RegExp(`${ANTES}${UNO}${DESPUES}`, 'gu');
const pareceId = s => /^(?:tg|t|m|q|p)\d{1,4}$/.test(s) || (/[-_/]/.test(s) && /\d|_/.test(s));

export function sinIds(texto, mapa = null) {
  if (typeof texto !== 'string' || !texto) return texto;
  let s = texto;
  if (typeof mapa === 'function') s = s.replace(SOLO, m => (pareceId(m) ? mapa(m) ?? m : m));
  s = s.replace(GRUPO, m => (m.split(/\s*(?:,|\by\b|\bo\b)\s*/).every(pareceId) ? '\u0000' : m));
  if (s === texto) return texto;
  return s
    .replace(/\s*\(\s*\u0000\s*\)/g, '') // «(m03)»
    .replace(/[«"']\s*\u0000\s*[»"']/g, '')
    .replace(/\s*\u0000\s*/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/(?:\s*,)?\s+(?:y|o|e)\s*(?=[.;:!?)]|$)/g, '') // «… y.» colgando
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/,(?=[.;:])/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Solo la PROSA (lo que escribió la IA para que lo lea el alumno). Todo lo demás (ids que usa el código como «accion»,
// «tarjeta», «tema»; citas del Test Guide tal cual; términos; lo que escribió el alumno) queda igual.
const PROSA = new Set(['saludo', 'porque', 'videoPorque', 'titulo', 'consejo', 'pasos', 'plan', 'intro', 'conclusion', 'explicacion', 'porQueNo', 'recuerda',
  'respuesta', 'control', 'estudiar', 'analogia', 'idea', 'concepto', 'ejemplo', 'trampa', 'texto', 'resumen', 'mas', 'profundo', 'entrena']);
const NUNCA = new Set(['citas', 'cita_test_guide', 'terminos', 'preguntas', 'opciones', 'vio', 'buscar', 'pregunta']);
export function limpiarProsa(valor, clave = null, mapa = null) {
  if (clave != null && NUNCA.has(clave)) return valor;
  if (typeof valor === 'string') return clave != null && PROSA.has(clave) ? sinIds(valor, mapa) : valor;
  if (Array.isArray(valor)) return valor.map(x => limpiarProsa(x, clave, mapa));
  if (valor && typeof valor === 'object') {
    // Las confusiones del consejo: { id del tema: texto }.
    if (clave === 'confusiones') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, typeof v === 'string' ? sinIds(v, mapa) : v]));
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiarProsa(v, k, mapa)]));
  }
  return valor;
}
