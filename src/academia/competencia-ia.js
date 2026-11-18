// Academia 0.14.38: lo OPCIONAL de la IA en la Competencia (src/academia/competencia.js funciona entera sin esto):
//  - 'compe_frase': la frase chistosa y personal de un certificado de ronda, con su puntuación y los TEMAS que falló
//    (nunca su nombre). Sin IA (o si falla), la frase sale de las variantes fijas por banda (i18n compe.frase.*).
//  - 'compe_mejorar': «Mejorar preguntas con IA» (solo el administrador): SUGIERE otra redacción, otra explicación o un
//    chiste mejor para las preguntas de UNA ronda. Nunca cambia las opciones ni la correcta, y la sugerencia no se usa
//    hasta que el administrador la aprueba (y solo si nadie ha empezado esa ronda).
// Lo usan el servidor web (armar los pedidos) y el trabajador (guardar lo que respondió, en la misma escritura que anota lo
// que costó: src/academia/instructor-tarea.js). No importa nada pesado.
export const USOS_COMPE = Object.freeze(['compe_frase', 'compe_mejorar']);
const CAMPOS = Object.freeze(['pregunta', 'explicacion', 'bien', 'mal']);
const LARGO = Object.freeze({ pregunta: 220, explicacion: 260, bien: 140, mal: 140, frase: 240 });
export const CLAVE_FRASE = /^academia\.certificado\.compe[1-6]\.\d{1,9}$/;
export const CLAVE_SUGERENCIA = /^academia\.compe\.sugerencia\.[1-6]$/;
// Nada de empresas, enlaces ni nombres de modelos en lo que se guarda.
const PROHIBIDO = /https?:|www\.|claude|anthropic|openai|chatgpt|\bgpt|gemini|<|>/i;

export const ESQUEMA_FRASE = Object.freeze({
  type: 'object', additionalProperties: false, required: ['frase'], properties: { frase: { type: 'string' } },
});
export const ESQUEMA_MEJORA = Object.freeze({
  type: 'object', additionalProperties: false, required: ['cambios'],
  properties: {
    cambios: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'pregunta', 'explicacion', 'bien', 'mal'],
        properties: { id: { type: 'string' }, pregunta: { type: 'string' }, explicacion: { type: 'string' }, bien: { type: 'string' }, mal: { type: 'string' } },
      },
    },
  },
});
export const esquemaCompe = uso => (uso === 'compe_mejorar' ? ESQUEMA_MEJORA : ESQUEMA_FRASE);

const TONO = 'Humor dominicano sano y cariñoso (como un pana que te vacila), nunca un insulto, nada de groserías, política, religión ni burlas del físico. Español de República Dominicana, claro y corto.';

// La frase del certificado. aciertos/total y los temas (el texto corto de las preguntas que falló, hasta 6).
export function armarFrase({ ronda, titulo, aciertos, total, falladas = [] }) {
  const sistema = [
    'Eres el animador de una competencia de aviación entre alumnos de piloto privado.',
    'Escribe UNA frase chistosa y personal para el certificado de recuerdo de un alumno, según su puntuación y lo que falló.',
    TONO,
    'Si le fue muy mal, búrlate con cariño de ti mismo también. Ejemplo del estilo del dueño: «No me monto con ese piloto ni porque me paguen 😂… y ojo, que soy una IA: imagínate si fuera humano.»',
    'Si le fue muy bien, celébralo en grande. Máximo 200 letras, sin comillas, sin enlaces, sin nombres de personas ni de empresas.',
    'Usa lo que falló para el chiste (por ejemplo, si falló la de la brújula: «la brújula hoy apuntaba pa\'l colmado»), pero sin enseñar la respuesta ni corregirlo: es un recuerdo, no una clase.',
    'Ejemplos del tono por puntuación (no los copies, inventa uno nuevo):',
    '- 20 de 20: «Veinte de veinte: la torre te pide autógrafo y el Concorde quiere volver solo para verte volar.»',
    '- 17 a 19: «Casi perfecto: con ese copiloto yo me monto hasta en una avioneta con una sola rueda.»',
    '- 13 a 16: «El avión despegó, voló y aterrizó. Con un poquito de susto, pero aterrizó.»',
    '- 9 a 12: «Llegaste… pero al aeropuerto de al lado. Nada que un buen repaso y un cafecito no arreglen.»',
    '- 8 o menos: «No me monto con ese piloto ni porque me paguen 😂… y ojo, que soy una IA: imagínate si fuera humano.»',
    'Si falló pocas, no exageres lo malo; si falló muchas, que el chiste lo anime a volver a intentarlo en la próxima ronda y a pasar por «Mi repaso».',
    'Puedes usar palabras de la cabina (torre, pista, flaps, turbulencia, aterrizaje, despegue, combustible, copiloto) y expresiones dominicanas cariñosas (mi pana, diache, qué lo qué, tremendo), siempre de buena fe y entendibles para cualquiera.',
    'Un solo emoji como mucho, y solo si suma al chiste.',
    'Nunca digas que es un examen oficial ni que esto vale como licencia: es solo un certificado de recuerdo de una competencia entre amigos.',
    'Responde solo el JSON pedido: { "frase": "…" }.',
  ].join('\n');
  const texto = `<datos>\n${JSON.stringify({ ronda, titulo, aciertos, total, fallo_en: falladas.slice(0, 6).map(x => String(x).slice(0, 120)) })}\n</datos>`;
  return { sistema, texto };
}
export function armarMejora({ ronda, titulo, preguntas }) {
  const sistema = [
    'Eres editor de una trivia de aviación para alumnos de piloto privado en República Dominicana.',
    'Te damos las 20 preguntas de una ronda (cada una con sus opciones A/B/C, la correcta, una explicación de una línea y dos chistes: «bien» al acertar y «mal» al fallar).',
    'Sugiere mejoras SOLO de redacción: una pregunta más clara, una explicación más precisa y corta, y chistes mejores.',
    TONO,
    'NUNCA cambies el hecho ni la respuesta correcta; no agregues datos que no estén seguros; nada de precios, flotas actuales, marcas ni aerolíneas.',
    'Devuelve solo las preguntas que de verdad mejoras (con su id), con los 4 campos completos. Pregunta ≤ 200 letras, explicación ≤ 240, cada chiste ≤ 130.',
  ].join('\n');
  const texto = `<datos>\n${JSON.stringify({ ronda, titulo, preguntas: preguntas.map(q => ({ id: q.id, pregunta: q.pregunta, opciones: q.opciones, correcta: q.correcta, explicacion: q.explicacion, bien: q.bien, mal: q.mal })) })}\n</datos>`;
  return { sistema, texto };
}

const noSirve = () => Object.assign(new Error('respuesta_no_valida'), { clave: 'respuesta_no_valida' });
const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const escribir = (db, clave, valor, en) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), en);

export function limpiarFrase(texto) {
  const t = String(texto ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^["«]+|["»]+$/g, '');
  if (!t || [...t].length > LARGO.frase || PROHIBIDO.test(t)) return null;
  return t;
}
// Guardar la frase en el certificado (solo si el certificado existe y todavía no tiene frase).
export function guardarFrase(db, datos, json, ahora = Date.now()) {
  if (!CLAVE_FRASE.test(String(datos?.clave))) throw noSirve();
  const frase = limpiarFrase(json?.frase);
  if (!frase) throw noSirve();
  let c = null;
  try { c = JSON.parse(leer(db, datos.clave) ?? 'null'); } catch { c = null; }
  if (!c || typeof c.codigo !== 'string') throw noSirve();
  if (c.frase) return { clave: datos.clave, ya: true };
  escribir(db, datos.clave, { ...c, frase }, new Date(ahora).toISOString());
  return { clave: datos.clave };
}
// Guardar la sugerencia (esperando revisión). ids: los de esa ronda (solo esos se aceptan).
export function guardarSugerencia(db, datos, json, ahora = Date.now()) {
  if (!CLAVE_SUGERENCIA.test(String(datos?.clave)) || !Array.isArray(datos?.ids)) throw noSirve();
  const ids = new Set(datos.ids);
  const cambios = [];
  for (const c of Array.isArray(json?.cambios) ? json.cambios : []) {
    if (!c || !ids.has(c.id) || cambios.some(x => x.id === c.id)) continue;
    const limpio = { id: c.id };
    for (const k of CAMPOS) {
      const v = String(c[k] ?? '').replace(/\s+/g, ' ').trim();
      if (v && [...v].length <= LARGO[k] && !PROHIBIDO.test(v)) limpio[k] = v;
    }
    if (Object.keys(limpio).length > 1) cambios.push(limpio);
  }
  if (!cambios.length) throw noSirve();
  escribir(db, datos.clave, { estado: 'lista', en: new Date(ahora).toISOString(), cambios }, new Date(ahora).toISOString());
  return { clave: datos.clave, cambios: cambios.length };
}
