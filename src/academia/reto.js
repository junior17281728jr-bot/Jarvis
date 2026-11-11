// Academia (0.8.0): el «Modo reto». El enunciado y la respuesta correcta van TAL CUAL; las otras dos opciones son las del
// paquete (pregunta.reto.opciones, escritas para engañar más). Las tres se mezclan y se muestran como A, B y C.
//  - El orden sale del intento y de la pregunta (una huella): al volver a abrir el intento se ve igual, sin guardar nada.
//  - Antes de responder, la pantalla solo recibe los tres textos: nada dice cuál es el original ni por qué una es mala.
//  - En la base se guarda la opción de verdad (la letra original de la correcta, o «R1» / «R2»), nunca la letra que se
//    vio: así la memoria de errores sabe qué idea equivocada eligió aunque el orden cambie.
import { createHash } from 'node:crypto';

export const MODO_ORIGINAL = 'original';
export const MODO_RETO = 'reto';
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const tieneReto = q => Array.isArray(q?.reto?.opciones) && q.reto.opciones.length === 2;

// Las opciones del reto, en el orden que se ve: [{ letra, clave, texto }]. clave: la letra original de la correcta, o R1/R2.
export function opcionesReto(q, intentoId, preguntaId) {
  if (!tieneReto(q)) return null;
  const correcta = q.original.opciones.find(o => o.letra === q.original.correcta);
  const lista = [{ clave: correcta.letra, texto: correcta.texto }, ...q.reto.opciones.map((o, i) => ({ clave: `R${i + 1}`, texto: o.texto }))];
  const h = createHash('sha256').update(`reto:${intentoId}:${preguntaId}`).digest();
  for (let i = lista.length - 1; i > 0; i--) {
    const j = h[i] % (i + 1);
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista.map((o, i) => ({ letra: LETRAS[i], clave: o.clave, texto: o.texto }));
}

// La letra que se vio → la opción de verdad (null si no es una de las que se vieron).
export function claveDeLetra(opciones, letra) {
  return opciones.find(o => o.letra === letra)?.clave ?? null;
}
export function letraDeClave(opciones, clave) {
  return opciones.find(o => o.clave === clave)?.letra ?? null;
}

// La opción de reto que se eligió mal ({ texto, porque_es_incorrecta, trampa }) o null.
export function opcionRetoDe(q, clave) {
  const m = /^R([12])$/.exec(String(clave ?? ''));
  return m && tieneReto(q) ? q.reto.opciones[Number(m[1]) - 1] : null;
}

// La idea equivocada detrás de una respuesta mala (para la memoria de errores): la del paquete para esa opción.
export function ideaDe(q, clave) {
  if (!q || clave == null || clave === q.original.correcta) return null;
  const r = opcionRetoDe(q, clave);
  if (r) return r.trampa || r.porque_es_incorrecta || null;
  return q.errores?.[clave] ?? null;
}
