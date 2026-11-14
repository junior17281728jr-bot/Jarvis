// Academia 0.14.15 (pedido del dueño): un alumno NUNCA ve un id interno («t4», «tg-3-28», «m03», «muestra-h3»,
// «factores_humanos/muestra-hipoxia») en lo que escribió la IA. Puro: se aplica a TODO lo guardado de la IA al leerlo
// (src/academia/instructor-ia.js, leerGuardado), también a lo que se guardó antes de esta versión.
// Se quitan (con la puntuación que queda colgando); los nombres de verdad los pone la app (botones con el título).

// «t4», «m03», «q12», «h3» (minúsculas: «VOR», «A1» o «PPL» no se tocan) y lo que tiene guion o barra con números o un
// guion bajo («tg-3-28», «muestra-h3», «factores_humanos», «fh/hipoxia»).
const CORTO = '[a-z]{1,3}\\d{1,4}';
const LARGO = '[a-z][a-z0-9]*(?:[-_/][a-z0-9]+)+';
const UNO = `(?:${LARGO}|${CORTO})`;
// Una lista de ids («t4, t5 y t9») sale entera, con sus comas y su «y».
// Nunca dentro de una dirección o un correo («evil.example/x», «a@b.c»): eso no es un id y se deja tal cual.
const GRUPO = new RegExp(`(?<![\\p{L}\\p{N}./:@-])${UNO}(?:\\s*(?:,|\\by\\b|\\bo\\b)\\s*${UNO})*(?![\\p{L}\\p{N}]|[./:@-][\\p{L}\\p{N}])`, 'gu');
const pareceId = s => /\d/.test(s) || /[_/]/.test(s);

export function sinIds(texto) {
  if (typeof texto !== 'string' || !texto) return texto;
  let s = texto.replace(GRUPO, m => (m.split(/\s*(?:,|\by\b|\bo\b)\s*/).every(pareceId) ? '\u0000' : m));
  if (s === texto) return texto;
  s = s
    .replace(/\s*\(\s*\u0000\s*\)/g, '') // «(m03)»
    .replace(/[«"']\s*\u0000\s*[»"']/g, '')
    .replace(/\s*\u0000\s*/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/,(?=[.;:])/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s;
}

// Las partes que NO son prosa (ids, claves, citas del Test Guide tal cual, términos, lo que escribió el alumno): sin tocar.
const NO_PROSA = new Set(['id', 'clave', 'tarjeta', 'tema', 'materia', 'numero', 'modelo', 'proveedor', 'en', 'videoId', 'url', 'costoMicro', 'citas', 'cita_test_guide', 'vio', 'terminos', 'pregunta', 'opciones', 'correcta', 'respuesta_correcta']);
export function limpiarProsa(valor, clave = null) {
  if (clave != null && NO_PROSA.has(clave)) return valor;
  if (typeof valor === 'string') return sinIds(valor);
  if (Array.isArray(valor)) return valor.map(x => limpiarProsa(x));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiarProsa(v, k)]));
  return valor;
}
