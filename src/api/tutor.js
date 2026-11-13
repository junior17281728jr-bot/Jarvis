// Academia 0.12.9: las rutas del «tutor» del alumno (src/academia/tutor.js, sin IA; y lo nuevo con IA de la clase).
// Las registra src/api/instructor.js (comparten su estado de la IA, su cobro de usos y su fila): este archivo NUNCA
// llama a la IA; pone en la fila la tarea 'academia.instructor' como los demás usos del instructor.
// Regla de siempre (N): sin IA para ese alumno, NADA de IA: las rutas devuelven ia: null / ia: false y la pantalla solo
// muestra lo gratis («Modo básico»). Nunca va al proveedor el nombre del alumno.
import { anotarEvidenciaTarjeta } from '../academia/fabrica-mejora.js';
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { camino } from '../academia/progreso.js';
import { modeloAlumno, respuestaDelAlumno, reexplicarSinIa } from '../academia/instructor.js';
import { armarTarjeta, armarPersonal, armarExplicacion, leerGuardado, preguntaSinIa } from '../academia/instructor-ia.js';
import { leerConfigIa } from '../ia/config.js';
import { ideaDe } from '../academia/reto.js';
import { vistaSecciones } from '../academia/progreso.js';
import { conceptoDePregunta, concepto as conceptoPorClave, nombreConcepto } from '../academia/conceptos.js';
import { miRepaso } from '../academia/fallas.js';
import { yaPagado } from '../academia/tiempo-ia.js';
import { leerPuntero } from '../academia/preparar-clase.js';
import { diaRd } from '../academia/preparar-clase.js';
import {
  analisisTema, paraElExamen, memoriaTutor, anotarSenal, leerSenales, preferencias, estiloConSenales, anotarEvento, tomoExamen,
  novedadesTutor, aperturaTutor, preguntasDeMateria,
} from '../academia/tutor.js';

const temaDe = (p, materia, tema) => p?.materias.find(m => m.id === materia)?.temas.find(t => t.id === tema) ?? null;
const textoTarjeta = s => [s?.texto, ...(Array.isArray(s?.puntos) ? s.puntos : []), s?.recuerda, s?.ejemplo].filter(x => typeof x === 'string' && x.trim()).join('\n');
const PREFIJO_PERSONAL = id => `academia.tutor.personal.${Number(id)}.`;

// Lo que se guardó de la preparación (si existe) — también su «examen» y su conclusión.
function preparacionDe(db, usuarioId, ahora) {
  const pt = leerPuntero(db, usuarioId);
  if (!pt?.tema) return null;
  const g = typeof pt.clave === 'string' ? leerGuardado(db, pt.clave) : null;
  if (!g && pt.dia !== diaRd(ahora)) return null;
  return { tema: pt.tema, listo: Boolean(g), examen: g?.examen ?? null, conclusion: g?.conclusion ?? null };
}
// Las preguntas personalizadas que se le muestran: SIN la correcta (se revisa al responder).
export const personalParaVer = g => ({ preguntas: (g?.preguntas ?? []).map((x, i) => ({ i, enunciado: x.enunciado, opciones: x.opciones, entrena: x.entrena })), tema: g?.tema ?? null });

// Cómo le fue en sus preguntas personalizadas (cuentan en «Mi repaso», nunca en el % del Test Guide).
export function progresoPersonal(db, usuarioId) {
  const filas = db.prepare('SELECT valor FROM ajustes WHERE clave > ? AND clave < ?').all(PREFIJO_PERSONAL(usuarioId), `${PREFIJO_PERSONAL(usuarioId)}~`);
  const ultima = new Map();
  for (const f of filas) { try { const v = JSON.parse(f.valor); ultima.set(`${v.clave}#${v.i}`, v.acierto === true); } catch { /* una fila rara no cuenta */ } }
  return { respondidas: ultima.size, bien: [...ultima.values()].filter(Boolean).length };
}

export function registrarRutasTutor(rutas, h) {
  const { estadoInstructor, pedirIa, deGuardado, iaNoAhora, lista, contar, topes, activo, reloj } = h;
  const conIa = (db, req, usuario, ahora) => estadoInstructor(db, req, usuario, ahora);
  const temaAbierto = (db, usuario, p, materia, tema, ahora) => {
    const estado = camino(db, usuario.id, p, ahora).materias.find(m => m.id === materia)?.temas.find(t => t.id === tema)?.estado;
    if (!estado) throw new ErrorHttp(404, 'no_existe');
    if (estado === 'bloqueado') throw new ErrorHttp(403, 'tema_bloqueado');
    return temaDe(p, materia, tema);
  };

  // F / G / M / S / U: todo lo de la tarjeta «Tu tutor IA» y el primer mensaje del Profesor (sin llamar a la IA).
  rutas.agregar('GET', '/api/academia/tutor', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    const p = activo(db);
    const instructor = conIa(db, req, usuario, ahora);
    // N: sin IA para él, nada de IA (ni la tarjeta del tutor).
    if (!p || instructor.modo !== 'ia') return { codigo: 200, datos: { ia: false } };
    const preparado = preparacionDe(db, usuario.id, ahora);
    const apertura = aperturaTutor(db, usuario.id, p, ahora);
    const ex = tomoExamen(db, usuario.id, p, ahora);
    const materia = apertura?.tema?.materia ?? null;
    return {
      codigo: 200, datos: {
        ia: true, apertura, novedades: novedadesTutor(db, usuario.id, p, { preparado, ahora }),
        examen: { oficial: ex.oficial, materia: ex.materias.find(m => m.materia === materia) ?? null },
        examenIa: preparado?.examen && (!preparado.examen.materia || preparado.examen.materia === materia) ? preparado.examen : null,
        memoria: memoriaTutor(db, usuario.id, { limite: 5 }), conclusion: preparado?.conclusion ?? null,
      },
    };
  });

  // U sin IA (para todos: el nodo del examen en el Camino y Progreso). examenIa solo con IA (el porqué a su estilo).
  rutas.agregar('GET', '/api/academia/tutor/examen', ({ db, req, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const ex = tomoExamen(db, usuario.id, p, ahora);
    const ia = conIa(db, req, usuario, ahora).modo === 'ia' ? preparacionDe(db, usuario.id, ahora)?.examen ?? null : null;
    return { codigo: 200, datos: { ...ex, examenIa: ia } };
  });

  // T: la memoria del tutor (lo que recuerda de él: sin IA).
  rutas.agregar('GET', '/api/academia/tutor/memoria', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    return { codigo: 200, datos: { memoria: memoriaTutor(db, usuario.id, { limite: 30 }) } };
  });
  // El administrador, en la ficha de un alumno: su memoria, «¿Tomo el examen?» y sus señales de estilo.
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/tutor', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    const p = activo(db);
    const senales = leerSenales(db, id);
    return { codigo: 200, datos: { memoria: memoriaTutor(db, id, { limite: 30 }), examen: p ? tomoExamen(db, id, p, reloj()) : null, senales, preferencias: preferencias(senales), personal: progresoPersonal(db, id) } };
  }, { admin: true });

  // I: una señal de estilo (👍/🤔, abrir un video, el tiempo en una tarjeta…). Solo números.
  rutas.agregar('POST', '/api/academia/tutor/senal', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const tipo = textoDe(datos, 'tipo');
    anotarSenal(db, usuario.id, tipo, datos?.ms);
    return { codigo: 200, datos: { listo: true } };
  });

  // J: «¿Lo entendiste?» → 🤔: «Explícamelo mejor» (tipo 'mejor') o «Profundizar» (tipo 'profundizar') de UNA tarjeta.
  // Sin IA: la «sencilla» de sus preguntas ya respondidas y la reexplicación del tema (gratis, «Modo básico»).
  rutas.agregar('POST', '/api/academia/tutor/tarjeta', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    const materia = textoDe(datos, 'materia');
    const tema = textoDe(datos, 'tema');
    const tipo = textoDe(datos, 'tipo') === 'profundizar' ? 'profundizar' : 'mejor';
    const n = Number(datos?.tarjeta);
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const ahora = reloj();
    // 0.13.1: una tarjeta de la pista oral (siempre abierta): lo gratis es su «Recuerda», la explicación en español de las
    // preguntas del libro del tema y la reexplicación; con IA, lo mismo que una del Test Guide (sin «Para el examen»).
    if (/^oral_[a-z_]+$/.test(materia)) return { codigo: 200, datos: tarjetaOral(db, req, usuario, p, { materia, tema, tipo, n, ia: datos?.ia === true }, ahora) };
    const t = temaAbierto(db, usuario, p, materia, tema, ahora);
    const s = Number.isSafeInteger(n) && n >= 1 ? t.secciones?.[n - 1] : null;
    if (!s) throw new ErrorHttp(404, 'no_existe');
    const a = analisisTema(p, materia, tema);
    const ids = a?.porTarjeta.get(n - 1) ?? [];
    const respondidas = new Set(ids.length ? db.prepare(`SELECT DISTINCT pregunta FROM academia_respuestas WHERE usuario_id = ? AND pregunta IN (${ids.map(() => '?').join(', ')})`).all(usuario.id, ...ids).map(f => f.pregunta) : []);
    const basica = {
      recuerda: s.recuerda ?? null,
      // La «sencilla» del paquete solo de las preguntas que YA respondió (nunca adelanta una respuesta).
      sencilla: ids.filter(id => respondidas.has(id)).map(id => p.preguntas.get(id)?.sencilla).filter(x => typeof x === 'string' && x.trim()).slice(0, 2),
      reexplicacion: vistaSecciones(p, t.reexplicacion, t.paquete).slice(0, 3).map(x => ({ titulo: x.titulo, texto: x.texto ?? (x.puntos ?? []).join('\n') })),
    };
    anotarSenal(db, usuario.id, tipo === 'profundizar' ? 'profundizar' : 'mejor');
    // 0.13.0: la evidencia de la «Mejora continua» (cuántos alumnos distintos no entendieron ESTA tarjeta; solo números).
    if (tipo === 'mejor' && typeof s.titulo === 'string') anotarEvidenciaTarjeta(db, { materia, tema, titulo: s.titulo, usuarioId: usuario.id });
    const instructor = conIa(db, req, usuario, ahora);
    let ia = null;
    if (datos?.ia === true && instructor.modo === 'ia') {
      const estilo = estiloConSenales(modeloAlumno(db, usuario.id, p, ahora).estilo, leerSenales(db, usuario.id));
      const preguntas = ids.map(id => p.preguntas.get(id)).filter(Boolean).map(q => ({ numero: String(q.original.numero ?? q.id), enunciado: q.original.enunciado, opciones: q.original.opciones.map(o => o.texto) }));
      const trampas = [...new Set((a?.preguntas ?? []).filter(x => x.tarjeta === n - 1).flatMap(x => x.trampas))];
      const pedido = armarTarjeta({ tipo, tarjeta: { titulo: String(s.titulo ?? ''), texto: textoTarjeta(s) }, tema: t.titulo, preguntas, trampas, estilo, idioma: usuario.idioma, modelo: 'claude-haiku-5-5' });
      const uso = tipo === 'profundizar' ? 'instructor_profundizar' : 'instructor_tarjeta';
      const ya = leerGuardado(db, pedido.clave);
      ia = ya ? deGuardado(db, usuario, pedido.clave, ya)
        : pedirIa(db, usuario, { uso, sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { sinResponder: pedido.sinResponder, tarjetaTitulo: String(s.titulo ?? '') } });
      if (ia?.estado === 'lista' || ia?.estado === 'pendiente') anotarEvento(db, usuario.id, { tipo: tipo === 'profundizar' ? 'profundizar' : 'mejor', materia, tema, tarjeta: n, titulo: String(s.titulo ?? '') }, ahora);
    } else if (datos?.ia === true) ia = iaNoAhora(instructor);
    // K: «Para el examen» (lo pone la app): citadas solo las que ya respondió; de las otras, el número.
    return { codigo: 200, datos: { instructor: { modo: instructor.modo }, basica, ia, examen: paraElExamen(db, usuario.id, p, materia, tema, n - 1) } };
  });

  function tarjetaOral(db, req, usuario, p, { materia, tema, tipo, n, ia: quiereIa }, ahora) {
    const t = p.oral?.materias.find(m => m.id === materia)?.temas.find(x => x.id === tema);
    const s = t && Number.isSafeInteger(n) && n >= 1 ? t.secciones?.[n - 1] : null;
    if (!s) throw new ErrorHttp(404, 'no_existe');
    const basica = {
      recuerda: s.recuerda ?? null,
      sencilla: (t.libro_qa ?? []).map(x => x.explicacion_es).filter(x => typeof x === 'string' && x.trim()).slice(0, 2),
      reexplicacion: vistaSecciones(p, t.reexplicacion, t.paquete).slice(0, 3).map(x => ({ titulo: x.titulo, texto: x.texto ?? (x.puntos ?? []).join('\n') })),
    };
    anotarSenal(db, usuario.id, tipo === 'profundizar' ? 'profundizar' : 'mejor');
    const instructor = conIa(db, req, usuario, ahora);
    let ia = null;
    if (quiereIa && instructor.modo === 'ia') {
      const estilo = estiloConSenales(modeloAlumno(db, usuario.id, p, ahora).estilo, leerSenales(db, usuario.id));
      // Solo el material de la tarjeta (no hay preguntas del Test Guide en la pista oral).
      const pedido = armarTarjeta({ tipo, tarjeta: { titulo: String(s.titulo ?? ''), texto: textoTarjeta(s) }, tema: t.titulo, preguntas: [], trampas: [], estilo, idioma: usuario.idioma, modelo: 'claude-haiku-5-5' });
      const uso = tipo === 'profundizar' ? 'instructor_profundizar' : 'instructor_tarjeta';
      const ya = leerGuardado(db, pedido.clave);
      ia = ya ? deGuardado(db, usuario, pedido.clave, ya)
        : pedirIa(db, usuario, { uso, sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { sinResponder: pedido.sinResponder, tarjetaTitulo: String(s.titulo ?? '') } });
    } else if (quiereIa) ia = iaNoAhora(instructor);
    return { instructor: { modo: instructor.modo }, basica, ia, examen: null };
  }

  // O: «Preguntas personalizadas» (solo con IA) de un tema que ya practicó: hechas a lo que confundió.
  function confusionDe(db, usuarioId, p, materia, tema, ahora) {
    const rep = miRepaso(db, usuarioId, p, ahora).paraRepasar.filter(x => x.materia === materia && x.tema === tema && x.clave);
    // Solo conceptos en los que ya respondió TODAS sus preguntas del Test Guide (nada adelanta una respuesta).
    const vistas = new Set(db.prepare('SELECT DISTINCT pregunta FROM academia_respuestas WHERE usuario_id = ?').all(usuarioId).map(f => f.pregunta));
    return rep.map(x => conceptoPorClave(p, x.clave)).filter(c => c && c.preguntas.every(id => vistas.has(id))).slice(0, 2);
  }
  rutas.agregar('POST', '/api/academia/tutor/personalizadas', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.explicar, usuario);
    const materia = textoDe(datos, 'materia');
    const tema = textoDe(datos, 'tema');
    const p = activo(db);
    if (!p) throw new ErrorHttp(409, 'sin_paquete');
    const ahora = reloj();
    const t = temaAbierto(db, usuario, p, materia, tema, ahora);
    const instructor = conIa(db, req, usuario, ahora);
    if (instructor.modo !== 'ia') return { codigo: 200, datos: { ia: iaNoAhora(instructor) } };
    const conceptos = confusionDe(db, usuario.id, p, materia, tema, ahora);
    if (!conceptos.length) return { codigo: 200, datos: { ia: null, sinConfusion: true } };
    const preguntas = conceptos.flatMap(c => c.preguntas).slice(0, 6).map(id => p.preguntas.get(id)).filter(Boolean).map(q => ({
      numero: String(q.original.numero ?? q.id), enunciado: q.original.enunciado, opciones: q.original.opciones.map(o => o.texto),
      respuesta_del_test_guide: q.original.opciones.find(o => o.letra === q.original.correcta)?.texto ?? '',
    }));
    const pedido = armarPersonal({
      tema: t.titulo, conceptos: conceptos.map(c => ({ clave: c.clave, nombre: nombreConcepto(c), tarjeta: c.indice >= 0 ? { titulo: t.secciones?.[c.indice]?.titulo ?? '', texto: textoTarjeta(t.secciones?.[c.indice]) } : null })),
      preguntas, idioma: usuario.idioma, modelo: 'claude-haiku-5-5',
    });
    const ya = leerGuardado(db, pedido.clave);
    let ia = ya ? deGuardado(db, usuario, pedido.clave, ya)
      : pedirIa(db, usuario, { uso: 'instructor_personal', sistema: pedido.sistema, texto: pedido.texto, clave: pedido.clave, extra: { clavePreguntas: pedido.clavePreguntas, tema: `${materia}/${tema}` } });
    if (ia?.estado === 'lista') ia = { estado: 'lista', clave: pedido.clave, ...personalParaVer(ia) };
    if (ia?.estado === 'lista' || ia?.estado === 'pendiente') anotarEvento(db, usuario.id, { tipo: 'personalizadas', materia, tema, titulo: t.titulo }, ahora);
    return { codigo: 200, datos: { ia: ia ? { ...ia, clave: pedido.clave } : null } };
  });
  // Responder una pregunta personalizada: la correcta se revisa aquí (nunca viaja antes). Aditivo: una fila por respuesta.
  rutas.agregar('POST', '/api/academia/tutor/personalizadas/responder', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(topes.lecturas, usuario);
    const clave = textoDe(datos, 'clave');
    const i = Number(datos?.i);
    const elegida = Number(datos?.elegida);
    if (!/^academia\.ia\.personal\.[a-f0-9]{32}$/.test(clave) || !Number.isSafeInteger(i) || ![0, 1, 2].includes(elegida)) throw new ErrorHttp(400, 'datos_no_validos');
    const g = leerGuardado(db, clave);
    const x = g?.preguntas?.[i];
    // Solo quien la pidió (la pagó como un uso) o el administrador.
    if (!x || !(yaPagado(db, usuario.id, clave) || usuario.rol === 'admin')) throw new ErrorHttp(404, 'no_existe');
    const ahora = reloj();
    const acierto = elegida === x.correcta;
    db.prepare('INSERT OR IGNORE INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(`${PREFIJO_PERSONAL(usuario.id)}${ahora}.${i}`, JSON.stringify({ clave, i, elegida, acierto }), new Date(ahora).toISOString());
    return { codigo: 200, datos: { acierto, correcta: x.correcta, explicacion: x.explicacion, entrena: x.entrena, progreso: progresoPersonal(db, usuario.id) } };
  });

  // H: después de un error en la práctica: una pista de una línea a su estilo y la tarjeta EXACTA de la clase.
  rutas.agregar('GET', '/api/academia/tutor/pista/:intento/:pregunta', ({ db, req, usuario, parametros }) => {
    contar(topes.lecturas, usuario);
    const p = activo(db);
    const ahora = reloj();
    const r = respuestaDelAlumno(db, usuario.id, p, parametros.intento, parametros.pregunta); // 404 si no la respondió en SU intento
    const c = conceptoDePregunta(p, r.q.id);
    const t = c ? temaDe(p, c.materia, c.tema) : null;
    const tarjeta = c && c.indice >= 0 && t ? { materia: c.materia, tema: c.tema, n: c.indice + 1, titulo: String(t.secciones?.[c.indice]?.titulo ?? '') } : c ? { materia: c.materia, tema: c.tema, n: 1, titulo: c.temaTitulo } : null;
    let pista = null;
    const instructor = conIa(db, req, usuario, ahora);
    if (!r.acierto && instructor.modo === 'ia' && !preguntaSinIa(db, r.q.id, ahora)) {
      // La explicación compartida que ya existe para ESA opción y SU estilo (si alguien la pidió): sin llamar a la IA.
      const m = modeloAlumno(db, usuario.id, p, ahora);
      const basica = reexplicarSinIa(db, usuario.id, p, r, m.estilo);
      const pedido = armarExplicacion({ q: r.q, elegida: r.elegida, acierto: r.acierto, modo: r.modo, idea: basica.idea, tarjeta: basica.tarjeta, alumno: { estilo: m.estilo }, idioma: usuario.idioma, modelo: leerConfigIa(db).instructorModelo });
      const g = leerGuardado(db, pedido.clave);
      if (g?.recuerda) pista = { texto: g.recuerda, ia: true };
    }
    if (!pista && !r.acierto) {
      const idea = ideaDe(r.q, r.elegida);
      const sec = c && c.indice >= 0 ? t?.secciones?.[c.indice] : null;
      const texto = sec?.recuerda || idea || null;
      if (texto) pista = { texto: String(texto), ia: false, idea: Boolean(!sec?.recuerda && idea) };
    }
    return { codigo: 200, datos: { pista, tarjeta } };
  });

  return { preparacionDe, preguntasDeMateria };
}
