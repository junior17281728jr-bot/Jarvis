// ¿Lo que respondió la IA cumple el esquema de la salida estructurada que se le pidió? Puro (sin red ni base).
// La salida estructurada del proveedor ya debería cumplirlo; esto es el segundo candado: una respuesta que no lo cumple
// ([], "hola", 42, {}, un campo de más o uno que falta) nunca se usa ni crea nada (cuenta como 'respuesta_no_valida',
// con su costo real) y una persona nunca ve «Listo» por algo que la IA no hizo.
// Solo entiende lo que usan los esquemas de OPORTIA: type (object, array, string, boolean, integer, number, null),
// enum, properties, required, additionalProperties (false), items y anyOf; description y title se ignoran. Una palabra que
// no conoce hace que NO cumpla: nunca se acepta algo que no se sabe revisar (falla cerrado).

const CONOCIDAS = new Set(['type', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'anyOf', 'description', 'title']);
const PROFUNDIDAD_MAXIMA = 32;

function esTipo(valor, tipo) {
  switch (tipo) {
    case 'object': return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
    case 'array': return Array.isArray(valor);
    case 'string': return typeof valor === 'string';
    case 'boolean': return typeof valor === 'boolean';
    case 'integer': return Number.isSafeInteger(valor);
    case 'number': return typeof valor === 'number' && Number.isFinite(valor);
    case 'null': return valor === null;
    default: return false;
  }
}

export function cumpleEsquema(valor, esquema, profundidad = 0) {
  if (profundidad > PROFUNDIDAD_MAXIMA) return false;
  if (!esquema || typeof esquema !== 'object' || Array.isArray(esquema)) return false;
  for (const clave of Object.keys(esquema)) if (!CONOCIDAS.has(clave)) return false;
  if (Array.isArray(esquema.anyOf)) {
    if (!esquema.anyOf.some(opcion => cumpleEsquema(valor, opcion, profundidad + 1))) return false;
  } else if (esquema.anyOf !== undefined) return false;
  if (esquema.type !== undefined) {
    const tipos = Array.isArray(esquema.type) ? esquema.type : [esquema.type];
    if (!tipos.some(tipo => esTipo(valor, tipo))) return false;
  }
  if (esquema.enum !== undefined) {
    if (!Array.isArray(esquema.enum) || !esquema.enum.some(opcion => opcion === valor)) return false;
  }
  if (esTipo(valor, 'object') && (esquema.properties !== undefined || esquema.required !== undefined || esquema.additionalProperties !== undefined)) {
    const propiedades = esquema.properties ?? {};
    if (typeof propiedades !== 'object' || Array.isArray(propiedades)) return false;
    const requeridas = esquema.required ?? [];
    if (!Array.isArray(requeridas)) return false;
    for (const clave of requeridas) if (!Object.hasOwn(valor, clave)) return false;
    for (const [clave, v] of Object.entries(valor)) {
      if (Object.hasOwn(propiedades, clave)) {
        if (!cumpleEsquema(v, propiedades[clave], profundidad + 1)) return false;
      } else if (esquema.additionalProperties !== true && esquema.additionalProperties !== undefined) return false;
    }
  }
  if (Array.isArray(valor) && esquema.items !== undefined) {
    for (const v of valor) if (!cumpleEsquema(v, esquema.items, profundidad + 1)) return false;
  }
  return true;
}
