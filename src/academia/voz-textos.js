// 0.14.70: QUÉ se puede leer con una voz pagada (ElevenLabs o ChatGPT): solo lo COMPARTIDO del contenido en uso (las
// clases, las preguntas del Test Guide y sus opciones, las explicaciones del paquete y las preguntas del examinador del
// oral). Lo arma el servidor web a partir del paquete en uso (el trabajador nunca abre un paquete) y lo guarda en memoria
// por paquete. Un texto que la pantalla pide leer y que NO está aquí (una duda del alumno, lo que dijo en el oral, el chat
// con la IA, un consejo personal, la repregunta de la IA) nunca se manda a un proveedor: se lee con la voz del teléfono.
import { createHash } from 'node:crypto';

// Lo más largo que se manda de una vez (≈ 35 s de voz). Un texto más largo se parte en frases.
export const LETRAS_PARTE = 500;
const MINIMO = 2;

// El texto tal como se lee: sin marcas (**, __, `), sin emojis y con los espacios juntos. La pantalla manda el texto tal
// cual viene del paquete y aquí se limpia igual que al armar la lista: así coinciden.
export function normalizarHabla(texto) {
  return String(texto ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Un texto en partes de hasta LETRAS_PARTE letras, cortando en el final de una frase (si no se puede, en una coma o un
// espacio). Siempre las mismas partes para el mismo texto.
export function partirHabla(texto, max = LETRAS_PARTE) {
  const t = normalizarHabla(texto);
  if (t.length <= max) return t ? [t] : [];
  const frases = t.split(/(?<=[.!?…;:])\s+/);
  const partes = [];
  let actual = '';
  const meter = pedazo => {
    if (!actual) actual = pedazo;
    else if (actual.length + 1 + pedazo.length <= max) actual = `${actual} ${pedazo}`;
    else { partes.push(actual); actual = pedazo; }
  };
  for (const f of frases) {
    if (f.length <= max) { meter(f); continue; }
    // Una frase larguísima: por comas y, si hace falta, por espacios.
    for (const c of f.split(/(?<=,)\s+/)) {
      if (c.length <= max) { meter(c); continue; }
      let resto = c;
      while (resto.length > max) {
        const corte = resto.lastIndexOf(' ', max);
        const n = corte > max / 2 ? corte : max;
        meter(resto.slice(0, n).trim());
        resto = resto.slice(n).trim();
      }
      if (resto) meter(resto);
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

export const huellaHabla = texto => createHash('sha256').update(String(texto)).digest('hex').slice(0, 32);
const sinParentesisFinal = t => String(t ?? '').replace(/\s*\(([^()]*)\)\s*$/, '');

// Las pantallas parten un texto largo de una sección en «puntos» (public/tarjetas.js: por viñetas y por frases): esos
// pedazos también se reconocen (solo para buscar; «Preparar» lee el texto entero). trozo(texto, idioma).
const VINETA = /^\s*(?:[•·▪◦\-–*]|\d{1,2}[.)])\s+/;
function trozosDe(texto, trozo) {
  for (const parrafo of String(texto).split(/\n\s*\n/)) {
    const lineas = parrafo.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of lineas) trozo(l.replace(VINETA, ''), 'es');
    for (const f of lineas.join(' ').replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+(?=[«"¿¡(A-ZÁÉÍÓÚÑ0-9])/u)) trozo(f.replace(VINETA, ''), 'es');
  }
}

// Junta los textos de un objeto del paquete (una tarjeta, una pregunta…). meter(texto, idioma).
function deTarjeta(s, meter, trozo = null) {
  if (!s || typeof s !== 'object') return;
  if (trozo && typeof s.texto === 'string' && s.tipo !== 'tarjeta') trozosDe(s.texto, trozo);
  if (typeof s.titulo === 'string') { meter(sinParentesisFinal(s.titulo), 'es'); (trozo ?? meter)(s.titulo, 'es'); }
  for (const k of ['texto', 'recuerda', 'ejemplo', 'nota', 'pregunta', 'respuesta', 'consecuencia']) if (typeof s[k] === 'string') meter(s[k], 'es');
  for (const x of Array.isArray(s.puntos) ? s.puntos : []) if (typeof x === 'string') meter(x, 'es');
  for (const o of Array.isArray(s.opciones) ? s.opciones : []) { if (typeof o?.texto === 'string') meter(o.texto, 'es'); if (typeof o?.consecuencia === 'string') meter(o.consecuencia, 'es'); }
  for (const w of Array.isArray(s.ingles) ? s.ingles : []) {
    if (typeof w?.palabra === 'string') meter(w.palabra, 'en');
    if (typeof w?.ejemplo === 'string') meter(w.ejemplo, 'en');
    if (typeof w?.significado === 'string') meter(w.significado, 'es');
  }
}
function dePregunta(q, meter) {
  if (!q || typeof q !== 'object') return;
  const o = q.original ?? {};
  for (const k of ['enunciado', 'explicacion']) if (typeof o[k] === 'string') meter(o[k], 'es');
  for (const op of Array.isArray(o.opciones) ? o.opciones : []) if (typeof op?.texto === 'string') meter(op.texto, 'es');
  if (typeof q.sencilla === 'string') meter(q.sencilla, 'es');
  for (const v of Object.values(q.errores && typeof q.errores === 'object' ? q.errores : {})) if (typeof v === 'string') meter(v, 'es');
  for (const op of Array.isArray(q.reto?.opciones) ? q.reto.opciones : []) {
    if (typeof op?.texto === 'string') meter(op.texto, 'es');
    if (typeof op?.porque_es_incorrecta === 'string') meter(op.porque_es_incorrecta, 'es');
  }
  if (typeof q.enunciado_en === 'string') meter(q.enunciado_en, 'en');
  for (const op of Array.isArray(q.opciones_en) ? q.opciones_en : []) if (typeof op?.texto === 'string') meter(op.texto, 'en');
  if (typeof q.fuente_pregunta?.pregunta_en === 'string') meter(q.fuente_pregunta.pregunta_en, 'en');
  for (const w of Array.isArray(q.ingles) ? q.ingles : []) {
    if (typeof w?.palabra === 'string') meter(w.palabra, 'en');
    if (typeof w?.ejemplo === 'string') meter(w.ejemplo, 'en');
    if (typeof w?.significado === 'string') meter(w.significado, 'es');
  }
}
function deTema(t, meter, trozo = null) {
  if (typeof t?.titulo === 'string') { meter(sinParentesisFinal(t.titulo), 'es'); (trozo ?? meter)(t.titulo, 'es'); }
  if (typeof t?.titulo_en === 'string') meter(t.titulo_en, 'en');
  for (const s of Array.isArray(t?.secciones) ? t.secciones : []) deTarjeta(s, meter, trozo);
  for (const s of Array.isArray(t?.reexplicacion) ? t.reexplicacion : []) deTarjeta(s, meter, trozo);
  for (const x of Array.isArray(t?.libro_qa) ? t.libro_qa : []) {
    if (typeof x?.respuesta_es === 'string') meter(x.respuesta_es, 'es');
    if (typeof x?.respuesta_en === 'string') meter(x.respuesta_en, 'en');
    if (typeof x?.explicacion_es === 'string') meter(x.explicacion_es, 'es');
    for (const p of Array.isArray(x?.puntos_clave) ? x.puntos_clave : []) if (typeof p === 'string') meter(p, 'es');
  }
  for (const x of Array.isArray(t?.adicionales) ? t.adicionales : []) {
    if (typeof x === 'string') meter(x, 'es');
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (typeof v === 'string' && v.length > 8) meter(v, k.endsWith('_en') ? 'en' : 'es');
  }
}

// La lista del paquete en uso (en memoria por paquete): porTexto: texto limpio → { idioma, ambito }.
//  ambito 'oral': las preguntas del examinador del oral (pregunta_es / pregunta_en del libro); 'clase': las tarjetas de
//  las clases (y las respuestas del libro del oral); 'pregunta': las preguntas de práctica, sus opciones y explicaciones.
const enMemoria = new WeakMap();
export function indiceVoz(paquete) {
  if (!paquete || typeof paquete !== 'object') return { porTexto: new Map() };
  const ya = enMemoria.get(paquete);
  if (ya) return ya;
  const porTexto = new Map();
  const meterCon = ambito => (texto, idioma) => {
    const t = normalizarHabla(texto);
    if (t.length < MINIMO) return;
    const antes = porTexto.get(t);
    if (!antes) porTexto.set(t, { idioma, ambito });
    else if ((ambito === 'oral' && antes.ambito !== 'oral') || (antes.ambito === 'trozo' && ambito !== 'trozo')) porTexto.set(t, { idioma: antes.idioma, ambito });
  };
  const oral = meterCon('oral');
  const clase = meterCon('clase');
  const pregunta = meterCon('pregunta');
  const trozo = meterCon('trozo');
  for (const m of Array.isArray(paquete.oral?.materias) ? paquete.oral.materias : []) {
    for (const t of m.temas ?? []) for (const x of Array.isArray(t.libro_qa) ? t.libro_qa : []) {
      if (typeof x?.pregunta_es === 'string') oral(x.pregunta_es, 'es');
      if (typeof x?.pregunta_en === 'string') oral(x.pregunta_en, 'en');
    }
  }
  for (const m of Array.isArray(paquete.oral?.materias) ? paquete.oral.materias : []) for (const t of m.temas ?? []) deTema(t, clase, trozo);
  for (const m of Array.isArray(paquete.materias) ? paquete.materias : []) {
    for (const t of m.temas ?? []) deTema(t, clase, trozo);
    for (const s of Array.isArray(m.extra?.tarjetas) ? m.extra.tarjetas : []) deTarjeta(s, clase, trozo);
    for (const q of Array.isArray(m.extra?.preguntas) ? m.extra.preguntas : []) dePregunta(q, pregunta);
  }
  for (const mapa of [paquete.preguntas, paquete.oral?.preguntas]) if (mapa instanceof Map) for (const q of mapa.values()) dePregunta(q, pregunta);
  const valor = { porTexto };
  enMemoria.set(paquete, valor);
  return valor;
}

// ¿Este texto es del contenido compartido? → { texto, idioma, ambito, partes } o null.
export function buscarTexto(paquete, texto) {
  const t = normalizarHabla(texto);
  if (t.length < MINIMO) return null;
  const e = indiceVoz(paquete).porTexto.get(t);
  return e ? { texto: t, idioma: e.idioma, ambito: e.ambito, partes: partirHabla(t) } : null;
}

// Todas las partes (sin repetir) de un alcance: 'oral' (solo las preguntas del examinador), 'clases' (el oral y las
// tarjetas de todas las clases) o 'todo' (además, las preguntas de práctica y sus explicaciones).
// → [{ texto, idioma }]
export function partesDeAlcance(paquete, alcance) {
  const vistas = new Set();
  const out = [];
  for (const [t, e] of indiceVoz(paquete).porTexto) {
    if (e.ambito === 'trozo') continue;
    if (alcance === 'oral' && e.ambito !== 'oral') continue;
    if (alcance === 'clases' && e.ambito === 'pregunta') continue;
    for (const p of partirHabla(t)) {
      if (vistas.has(p)) continue;
      vistas.add(p);
      out.push({ texto: p, idioma: e.idioma });
    }
  }
  // El oral sale primero (se metió primero en la lista), y siempre en el mismo orden.
  return out;
}
