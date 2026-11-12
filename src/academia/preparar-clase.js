// Academia 0.12.7: «Preparar tu próxima clase» (la IA piensa en la PRÓXIMA clase del alumno, no todo el día).
// Lo usa SOLO el servidor web (abre el paquete): arma lo que la IA necesita y decide si hace falta prepararla. La llamada
// la hace el trabajador (src/academia/instructor-tarea.js, uso 'instructor_preparar'); este archivo nunca usa la red.
//
// Cuándo se pone en la fila (src/api/instructor.js, prepararProximaClase): cuando el alumno TERMINA una sesión de estudio
// (termina un tema, una práctica o un examen, marca una lección leída, o cierra la app después de estudiar de verdad), y
// solo si TODO esto se cumple, de lo más barato a lo más caro:
//  1. la IA, el instructor con IA y «Preparar la próxima clase con IA» están encendidos;
//  2. hoy (día de RD) todavía no se preparó nada para él: como mucho UNA por alumno y por día;
//  3. estudió de verdad en las últimas 48 horas, y algo nuevo desde la última preparación;
//  4. la IA está disponible para él ahora (el mismo estado que el instructor: permiso, tope, plan o prueba…);
//  5. lo que se mandaría (su huella) cambió desde la última preparación: si nada cambió, no se pide nada.
// Ningún reloj la pone en la fila: un servidor sin alumnos estudiando no gasta ni un token (test/preparar-clase.test.js).
// No cobra usos al alumno (es un regalo de la academia) ni empieza su prueba gratis; cuenta en el tope de su cuenta y
// en el general del dueño (src/ia/presupuesto.js), con el modelo barato (Claude Haiku 5.5, fijo).
// Se muestra al ABRIR ese tema («Preparado para ti»): si abre otro tema, ve la versión básica de ese otro (sin IA).
import { createHash } from 'node:crypto';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { camino } from './progreso.js';
import { modeloAlumno } from './instructor.js';
import { miRepaso } from './fallas.js';
import { ideaDe } from './reto.js';
import { conceptoDePregunta, nombreConcepto } from './conceptos.js';
import { prefijoPreparar, armarPreparar, leerGuardado } from './instructor-ia.js';
import { memoriaParaIa, tomoExamen, leerSenales, preferencias } from './tutor.js';

export const PREPARAR = Object.freeze({ activoMs: 48 * 3_600_000, caducaMs: 2 * 3_600_000, tarjetasMaxBytes: 18_000, conceptos: 5, temasFlojos: 6 });
const clavePuntero = id => `academia.preparar.ultimo.${Number(id)}`;
export const clavePrefijo = huella => `academia.preparar.prefijo.${huella}`;
export const HUELLA = /^[a-f0-9]{32}$/;
const huella = texto => createHash('sha256').update(texto).digest('hex').slice(0, 32);
export const diaRd = ms => new Date(ms - 4 * 3_600_000).toISOString().slice(0, 10);

// Lo último que estudió (una respuesta, una tarjeta de una clase o una lección leída), en ms; null si nunca.
export function ultimaActividad(db, usuarioId) {
  const r = db.prepare('SELECT MAX(creada_en) AS en FROM academia_respuestas WHERE usuario_id = ?').get(usuarioId)?.en ?? null;
  const a = db.prepare('SELECT MAX(actualizado_en) AS en FROM ajustes WHERE clave IN (?, ?)').get(`academia.tema_paso.${Number(usuarioId)}`, `academia.temas_leidos.${Number(usuarioId)}`)?.en ?? null;
  const ms = [r, a].map(x => Date.parse(x ?? '')).filter(Number.isFinite);
  return ms.length ? Math.max(...ms) : null;
}

export function leerPuntero(db, usuarioId) {
  try { const v = JSON.parse(leerAjuste(db, clavePuntero(usuarioId)) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
export function guardarPuntero(db, usuarioId, valor) {
  guardarAjuste(db, clavePuntero(usuarioId), JSON.stringify(valor));
}

// El tema que sigue en su Camino (el primero abierto que todavía no aprobó), o null si ya terminó todo.
export function proximoTema(db, usuarioId, paquete, ahora = Date.now()) {
  for (const m of camino(db, usuarioId, paquete, ahora).materias) {
    for (const t of m.temas) if (t.estado === 'abierto') return { materia: m.id, tema: t.id };
  }
  return null;
}

const temaDe = (p, materia, tema) => p?.materias.find(m => m.id === materia)?.temas.find(t => t.id === tema) ?? null;
const textoTarjeta = s => [s.texto, ...(Array.isArray(s.puntos) ? s.puntos : []), s.recuerda].filter(x => typeof x === 'string' && x.trim()).join('\n');

// El material del tema, igual para todos: las tarjetas (ids t1, t2… en el orden de la clase) y las preguntas del Test
// Guide del tema TAL CUAL, sin la respuesta. Si las tarjetas pasan del tope, cada una se acorta por igual (determinista).
export function materialDelTema(p, materia, tema) {
  const t = temaDe(p, materia, tema);
  if (!t) return null;
  let tarjetas = (t.secciones ?? []).map((s, i) => ({ id: `t${i + 1}`, titulo: String(s.titulo ?? ''), texto: textoTarjeta(s) }));
  const total = tarjetas.reduce((n, x) => n + Buffer.byteLength(x.titulo) + Buffer.byteLength(x.texto), 0);
  if (total > PREPARAR.tarjetasMaxBytes) {
    const parte = PREPARAR.tarjetasMaxBytes / total;
    tarjetas = tarjetas.map(x => ({ ...x, texto: x.texto.slice(0, Math.max(80, Math.floor(x.texto.length * parte))) }));
  }
  const preguntas = (t.preguntas ?? []).map(id => p.preguntas.get(id)).filter(Boolean)
    .map(q => ({ numero: String(q.original.numero ?? q.id), enunciado: q.original.enunciado, opciones: q.original.opciones.map(o => o.texto) }));
  return { materia, tema: t.id, titulo: t.titulo, tarjetas, preguntas };
}

// Lo del alumno para ESE tema (solo números y textos del paquete; nunca su nombre ni su usuario). Sin lo que cambia con
// la hora (hoy, lo que vence hoy): así la huella solo cambia cuando cambió lo que estudió.
export function insumosAlumno(db, usuarioId, p, materia, tema, ahora = Date.now()) {
  const m = modeloAlumno(db, usuarioId, p, ahora);
  const t = temaDe(p, materia, tema);
  const ultima = new Map();
  for (const f of db.prepare('SELECT pregunta, elegida, correcta FROM academia_respuestas WHERE usuario_id = ? ORDER BY id').all(usuarioId)) ultima.set(f.pregunta, f);
  const falladas = [];
  const sinResponder = [];
  for (const id of t?.preguntas ?? []) {
    const q = p.preguntas.get(id);
    if (!q) continue;
    const numero = String(q.original.numero ?? q.id);
    const f = ultima.get(id);
    if (!f) { sinResponder.push({ numero, opciones: q.original.opciones.map(o => o.texto) }); continue; }
    if (f.correcta === 1) continue;
    const correcta = q.original.opciones.find(o => o.letra === q.original.correcta)?.texto ?? '';
    falladas.push({ id, numero, eligio: q.original.opciones.find(o => o.letra === f.elegida)?.texto ?? null, respuesta_del_test_guide: correcta, idea: ideaDe(q, f.elegida) ?? null, opciones: q.original.opciones.map(o => o.texto) });
  }
  let conceptos = [];
  try {
    conceptos = miRepaso(db, usuarioId, p, ahora).paraRepasar.slice(0, PREPARAR.conceptos).map(x => ({ concepto: x.concepto, tema: x.temaTitulo, fallos: x.fallos }));
  } catch { conceptos = []; }
  // Los conceptos del tema que sigue que ya le costaron (las preguntas falladas, por su tarjeta).
  const delTema = [...new Set(falladas.map(f => conceptoDePregunta(p, f.id)).filter(Boolean).map(nombreConcepto))];
  const alumno = {
    respuestas: m.respuestas, pct: m.pct, estilo: m.estilo, prisa: m.prisa.activa, hora: m.hora?.franja ?? null,
    formatos: { original: m.formatos.original.pct, reto: m.formatos.reto.pct },
    temas_flojos: [...m.temas].sort((a, b) => a.pct - b.pct).slice(0, PREPARAR.temasFlojos).map(x => ({ tema: x.titulo, pct: x.pct, vistas: x.vistas, preguntas: x.preguntas })),
    ideas_equivocadas: m.ideas.map(x => x.idea).filter(Boolean).slice(0, 3),
    conceptos_del_tema_que_le_costaron: delTema,
  };
  return { alumno, falladas, sinResponder, conceptos };
}

// Todo lo que haría falta para preparar su próxima clase, o null (no hay tema que siga). → { prefijo: { clave, sistema },
// texto, huella, tema: 'materia/tema', tarjetas: [ids], citas, sinResponder }.
export function datosPreparacion(db, usuarioId, p, { idioma = 'es', ahora = Date.now() } = {}) {
  const sigue = proximoTema(db, usuarioId, p, ahora);
  if (!sigue) return null;
  const material = materialDelTema(p, sigue.materia, sigue.tema);
  if (!material) return null;
  const prefijo = prefijoPreparar({ material, idioma: idioma === 'en' ? 'en' : 'es' });
  const ins = insumosAlumno(db, usuarioId, p, sigue.materia, sigue.tema, ahora);
  // 0.12.9 (T, U, I): sus últimas entradas de la memoria del tutor (sin fechas: así la huella solo cambia cuando estudia),
  // el «¿Tomo el examen?» de la materia (ya decidido sin IA: la IA solo lo explica a su estilo) y sus preferencias.
  const memoria = memoriaParaIa(db, usuarioId, 3, ahora).map(({ hace_dias, ...x }) => x);
  const ex = tomoExamen(db, usuarioId, p, ahora).materias.find(m => m.materia === sigue.materia);
  const examen = ex ? { decision: ex.si ? 'SI' : 'TODAVIA_NO', pct: ex.pct, razones: ex.porques.map(x => ({ razon: x.clave, ...x.vars })) } : null;
  const alumno = { ...ins.alumno, preferencias: preferencias(leerSenales(db, usuarioId)) };
  const pedido = armarPreparar({ alumno, falladas: ins.falladas.map(({ id, opciones, ...resto }) => resto), sinResponder: ins.sinResponder.map(x => x.numero), conceptos: ins.conceptos, memoria, examen });
  // Las citas se revisan contra la clave de las falladas (con sus opciones, para reconocer una contradicción).
  const citas = armarPreparar({ falladas: ins.falladas }).citas;
  return {
    prefijo: { clave: clavePrefijo(prefijo.huella), sistema: prefijo.sistema }, texto: pedido.texto, huella: huella(`${prefijo.huella}|${pedido.texto}`),
    tema: `${sigue.materia}/${sigue.tema}`, tarjetas: material.tarjetas.map(x => x.id), citas, sinResponder: ins.sinResponder,
  };
}

// Lo preparado con IA para ESE tema (si es el que se preparó y ya llegó), con el título de cada tarjeta. null si no.
export function preparadoConIa(db, usuarioId, p, materia, tema) {
  const pt = leerPuntero(db, usuarioId);
  if (!pt || pt.tema !== `${materia}/${tema}` || typeof pt.clave !== 'string') return null;
  const g = leerGuardado(db, pt.clave);
  if (!g) return null;
  const t = temaDe(p, materia, tema);
  const titulo = id => { const n = Number(String(id).slice(1)) - 1; return t?.secciones?.[n]?.titulo ?? ''; };
  return { ...g, tarjetas: (g.tarjetas ?? []).map(x => ({ ...x, titulo: titulo(x.tarjeta), numero: Number(String(x.tarjeta).slice(1)) })) };
}

// La versión básica (gratis, sin IA) para el tema que abre: cuántas tarjetas, cuántas preguntas falló y cuántas son
// nuevas, los conceptos de ese tema que le costaron y un plan de 3 pasos que existe en la app.
export function preparadoBasico(db, usuarioId, p, materia, tema, ahora = Date.now()) {
  const t = temaDe(p, materia, tema);
  if (!t) return null;
  const ins = insumosAlumno(db, usuarioId, p, materia, tema, ahora);
  return {
    tarjetas: (t.secciones ?? []).length, falladas: ins.falladas.length, nuevas: ins.sinResponder.length, preguntas: (t.preguntas ?? []).length,
    conceptos: ins.alumno.conceptos_del_tema_que_le_costaron.slice(0, 3), estilo: ins.alumno.estilo,
    plan: ['leer', (t.preguntas ?? []).length ? 'practicar' : null, ins.conceptos.length ? 'repaso' : 'siguiente'].filter(Boolean),
  };
}
