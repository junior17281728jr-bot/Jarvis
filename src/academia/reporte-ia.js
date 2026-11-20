// Academia 0.14.85: «Pedir opinión a la IA» en Mensajes → Reportes (solo el administrador, solo si hay IA y dentro de los
// topes). La IA recibe SOLO el punto (lo que vio el alumno: la tarjeta o la pregunta con sus opciones y su explicación, y
// sus fuentes) y los porqués que escribieron los alumnos, sin nombres, usuarios, ids, correos ni teléfonos. Responde un
// veredicto sugerido (si / no / dudoso) y su razonamiento corto. Es una SUGERENCIA: el veredicto lo pone el administrador.
// Lo usan el servidor web (armar el pedido) y el trabajador (guardar lo que respondió): no importa nada pesado.
import { sinDatosPersonales } from './reporte-que.js';

export const USOS_REPORTE = Object.freeze(['reporte_revisar']);
export const CLAVE_OPINION = /^academia\.reporte\.ia\.[a-f0-9]{32}$/;
export const ESQUEMA_REVISION = Object.freeze({
  type: 'object', additionalProperties: false, required: ['veredicto', 'razon'],
  properties: { veredicto: { type: 'string', enum: ['si', 'no', 'dudoso'] }, razon: { type: 'string' } },
});
const RAZON_MAX = 900;
const corto = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// item: el punto guardado en el reporte ({ tipo, vista, fuentes }); porques: [{ que, texto }] de los alumnos.
// → { sistema, texto }. Nada del alumno salvo lo que escribió (limpio).
export function armarRevision(item, porques) {
  const sistema = [
    'Eres un instructor de vuelo que revisa el material de estudio de alumnos de piloto privado (PPL, FAA) en República Dominicana.',
    'Un alumno reportó que algo del material está mal. Te damos EXACTAMENTE lo que vio (una tarjeta de la clase, o una pregunta con sus opciones, la correcta y la explicación) y por qué cree que está mal.',
    'Decide si el alumno tiene razón: "si" (es un error del material), "no" (el material está bien; es una confusión del alumno) o "dudoso" (no se puede saber con esto).',
    'Explica tu razonamiento en 2 a 5 frases cortas, en español sencillo, citando el dato técnico que decide (regla, número, página de la fuente si la hay).',
    'Si el material está bien pero la explicación puede confundir, dilo: eso ayuda a mejorarla.',
    'Si el punto trae una «calificacion» (cómo calificó el sistema la respuesta del alumno en la práctica del examen oral), decide si esa CALIFICACIÓN fue injusta: la respuesta del libro es un resumen, así que un dato más completo o más preciso que coincide con la FAA no es un error del alumno; y una repregunta se califica solo con lo que ella pide.',
    'No inventes datos. Si no estás seguro, responde "dudoso".',
    'Responde solo el JSON pedido: { "veredicto": "si" | "no" | "dudoso", "razon": "…" }.',
  ].join('\n');
  const v = item?.vista ?? {};
  const punto = item?.tipo === 'pregunta'
    ? { tipo: 'pregunta', enunciado: corto(v.enunciado, 1200), opciones: (v.opciones ?? []).map(o => `${o.letra}) ${corto(o.texto, 400)}`), correcta: v.correcta ?? null, eligio_el_alumno: v.elegida ?? null, explicacion: corto(v.explicacion, 1500) || null, explicacion_sencilla: corto(v.sencilla, 1000) || null }
    : { tipo: item?.tipo ?? 'otro', titulo: corto(v.titulo ?? v.temaTitulo, 200) || null, texto: corto(v.texto ?? v.respuesta ?? JSON.stringify(v.textos ?? ''), 2500) || null, puntos: (v.puntos ?? []).map(x => corto(x, 300)), recuerda: corto(v.recuerda, 400) || null, pregunta: corto(v.pregunta, 500) || null };
  // 0.14.93: la calificación del oral que reportó (lo que dijo él, limpio de datos personales, y lo que le dijo el calificador).
  const c = item?.tipo === 'oral' ? v.calificacion : null;
  const parte = g => (g ? { dijo: corto(sinDatosPersonales(g.texto ?? ''), 1000) || null, veredicto: g.veredicto ?? null, lo_que_le_dijo: corto(g.linea, 200) || null, lo_que_falto_segun_el_calificador: corto(g.falto, 400) || null } : null);
  if (c) Object.assign(punto, { pregunta_es: corto(v.preguntaEs, 500) || null, respuesta_del_libro_es: corto(v.respuestaEs, 2000) || null, calificacion: { veredicto_final: c.veredicto ?? null, primera: parte(c.primera), repregunta: corto(c.repregunta, 300) || null, respuesta_a_la_repregunta: parte(c.seguimiento) } });
  const fuentes = (item?.fuentes ?? []).slice(0, 4).map(f => [f.libro, f.capitulo, f.seccion, f.pagina ? `p. ${f.pagina}` : null].filter(Boolean).join(' · '));
  const lo_que_dicen = (porques ?? []).slice(0, 8).map(x => ({ que: corto(x.que, 40), porque: corto(sinDatosPersonales(x.texto), 600) })).filter(x => x.porque || x.que);
  const texto = `<datos>\n${JSON.stringify({ punto, fuentes, reportes: lo_que_dicen })}\n</datos>`;
  return { sistema, texto };
}

export function limpiarRevision(json) {
  const veredicto = ['si', 'no', 'dudoso'].includes(json?.veredicto) ? json.veredicto : null;
  const razon = corto(json?.razon, RAZON_MAX);
  if (!veredicto || razon.length < 10 || /https?:|<|>/i.test(razon)) return null;
  return { veredicto, razon };
}
const escribir = (db, clave, valor, en) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), en);
// Lo guarda el trabajador (en la misma escritura que anota lo que costó).
export function guardarRevision(db, datos, json, ahora = Date.now()) {
  if (!CLAVE_OPINION.test(String(datos?.clave))) throw Object.assign(new Error('respuesta_no_valida'), { clave: 'respuesta_no_valida' });
  const r = limpiarRevision(json);
  if (!r) throw Object.assign(new Error('respuesta_no_valida'), { clave: 'respuesta_no_valida' });
  const en = new Date(ahora).toISOString();
  escribir(db, datos.clave, { estado: 'lista', ...r, en, huella: typeof datos.huella === 'string' ? datos.huella.slice(0, 64) : null }, en);
  return { clave: datos.clave };
}
