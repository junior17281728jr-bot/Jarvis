// 0.9.0: la ficha de cada alumno para el administrador (Administrador → Alumnos → un alumno) y «Comparar».
// SOLO para las rutas { admin: true } (src/api/perfil.js). Todo sale de lo que ya se guarda (academia_intentos,
// academia_respuestas, academia_repaso, sesiones, auditoría y ajustes): sin cambio de base.
// Los tres «%» que se muestran, cada uno con su nombre:
//  - preparación: preguntas cuya ÚLTIMA respuesta fue correcta, sobre todas las del contenido en uso (el medidor);
//  - acierto: respuestas correctas sobre todas las respuestas que dio (también las repetidas);
//  - nota promedio: el promedio de la nota (%) de sus temas y exámenes TERMINADOS (la práctica no cuenta).
import { ErrorHttp } from '../nucleo/http.js';
import { porMateria, puntosYRacha, examenes, temasAprobados, verIntento, resumenDebiles, modoDeTipo, PUNTOS_POR_ACIERTO } from './progreso.js';
import { puntosDebiles } from './memoria.js';
import { planDe, preparacionDe } from './plan.js';
import { actividadDe } from '../cuentas/historial.js';
import { leerPerfil } from '../cuentas/perfil.js';
import { cerrarVencidos, tiemposDe, leerExamen } from './examen.js';
import { nombreLegalDe, estadoTerminos, verificacionDe, tutorAutorizoPagos } from '../cuentas/terminos.js';

export const MAXIMO_COMPARAR = 6;
export const MAXIMO_INTENTOS_EN_PANTALLA = 500;
// Para el tiempo de estudio: dos respuestas seguidas con menos de esto entre sí son el mismo rato de estudio.
const PAUSA_MAXIMA_MS = 10 * 60 * 1000;
const POR_RESPUESTA_SUELTA_MS = 60 * 1000;
const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);
const CALIFICADOS = ['tema', 'examen'];

function cuentaDe(db, alumnoId) {
  const id = Number(alumnoId);
  const u = Number.isSafeInteger(id) && id > 0 ? db.prepare("SELECT id, nombre, nombre_visible, rol, activo, creado_en, (clave_hash LIKE 'pendiente$%') AS pendiente FROM usuarios WHERE id = ?").get(id) : null;
  if (!u) throw new ErrorHttp(404, 'no_existe');
  return u;
}
const titulosDe = paquete => new Map((paquete?.materias ?? []).flatMap(m => m.temas.map(t => [`${m.id}/${t.id}`, t.titulo])));

// Minutos de estudio (aproximado): los ratos de respuestas seguidas (pausas de menos de 10 min), y 1 min por rato.
export function tiempoDeEstudio(fechas) {
  let ms = 0;
  let anterior = null;
  for (const f of fechas) {
    const t = Date.parse(f);
    if (!Number.isFinite(t)) continue;
    ms += anterior != null && t - anterior >= 0 && t - anterior <= PAUSA_MAXIMA_MS ? t - anterior : POR_RESPUESTA_SUELTA_MS;
    anterior = t;
  }
  return Math.round(ms / 60000);
}

// Todos sus intentos (sin tope: los totales y las notas por tema salen de aquí); la pantalla recibe los 500 más nuevos.
function intentosDe(db, alumnoId, paquete) {
  const titulos = titulosDe(paquete);
  return db.prepare(`SELECT id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en FROM academia_intentos
    WHERE usuario_id = ? ORDER BY id DESC`).all(alumnoId).map(f => ({
    id: f.id, tipo: f.tipo, modo: modoDeTipo(f.tipo), materia: f.materia, tema: f.tema,
    temaTitulo: f.tema ? titulos.get(`${f.materia}/${f.tema}`) ?? null : null,
    total: f.total, respondidas: f.respondidas, aciertos: f.aciertos, pct: pct(f.aciertos, f.total),
    aprobado: f.aprobado == null ? null : f.aprobado === 1, empezado: f.empezado_en, terminado: f.terminado_en, terminadoSi: f.terminado_en != null,
    // 0.9.2: el tiempo que usó (de empezar a terminar) y, si fue examen con reloj, su límite.
    segundos: f.terminado_en ? Math.max(0, Math.round((Date.parse(f.terminado_en) - Date.parse(f.empezado_en)) / 1000)) : null,
    limiteSegundos: f.tipo === 'examen' ? (e => (e ? Math.round(e.limiteMs / 1000) : null))(leerExamen(db, f.id)) : null,
  }));
}

// Lo de cada materia y cada tema: el dominio (de porMateria) y la mejor y la última nota de sus temas y su examen.
function materiasDe(db, alumnoId, paquete, intentos) {
  const terminados = intentos.filter(x => x.terminadoSi && CALIFICADOS.includes(x.tipo)); // del más nuevo al más viejo
  const notas = filtro => {
    const lista = terminados.filter(filtro);
    if (!lista.length) return { veces: 0, mejor: null, ultima: null, aprobado: false, fecha: null };
    return { veces: lista.length, mejor: Math.max(...lista.map(x => x.pct)), ultima: lista[0].pct, aprobado: lista.some(x => x.aprobado === true), fecha: lista[0].terminado };
  };
  return porMateria(db, alumnoId, paquete).map(m => {
    const mp = paquete.materias.find(x => x.id === m.id);
    return {
      ...m,
      examen: notas(x => x.tipo === 'examen' && x.materia === m.id),
      temas: (mp?.temas ?? []).map(t => ({ id: t.id, titulo: t.titulo, preguntas: t.preguntas.length, ...notas(x => x.tipo === 'tema' && x.materia === m.id && x.tema === t.id) })),
    };
  });
}

function resumenDe(db, alumnoId, paquete, intentos, ahoraMs) {
  const terminados = intentos.filter(x => x.terminadoSi);
  const calificados = terminados.filter(x => CALIFICADOS.includes(x.tipo));
  const r = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(correcta), 0) AS bien, COUNT(DISTINCT pregunta) AS distintas FROM academia_respuestas WHERE usuario_id = ?').get(alumnoId);
  const fechas = db.prepare('SELECT creada_en FROM academia_respuestas WHERE usuario_id = ? ORDER BY creada_en').all(alumnoId).map(f => f.creada_en);
  const aprobadosTemas = [...temasAprobados(db, alumnoId).values()].filter(x => x.aprobado).length;
  const deExamen = examenes(db, alumnoId);
  const { racha, hoy } = puntosYRacha(db, alumnoId, ahoraMs);
  const plan = planDe(db, alumnoId, paquete, ahoraMs);
  return {
    plan: plan.elegido ? { elegido: plan.elegido, pct: plan.pct, fin: plan.fin, finPlan: plan.finPlan, ritmo: plan.ritmo, desde: plan.desde } : null,
    preparacion: preparacionDe(db, alumnoId, paquete),
    notaPromedio: calificados.length ? Math.round(calificados.reduce((s, x) => s + x.pct, 0) / calificados.length) : null,
    intentos: terminados.length, enCurso: intentos.length - terminados.length,
    calificados: calificados.length,
    aprobados: calificados.filter(x => x.aprobado === true).length,
    reprobados: calificados.filter(x => x.aprobado === false).length,
    temasAprobados: aprobadosTemas, temas: (paquete?.materias ?? []).reduce((n, m) => n + m.temas.length, 0),
    examenesAprobados: [...deExamen.values()].filter(x => x.aprobado).length, examenes: (paquete?.materias ?? []).filter(m => m.temas.length).length,
    respuestas: r.n, aciertos: r.bien, errores: r.n - r.bien, pctAcierto: pct(r.bien, r.n), preguntasDistintas: r.distintas,
    racha, estudioHoy: hoy, puntos: r.bien * PUNTOS_POR_ACIERTO,
    minutosEstudio: tiempoDeEstudio(fechas), diasEstudio: db.prepare('SELECT COUNT(DISTINCT dia) AS n FROM academia_respuestas WHERE usuario_id = ?').get(alumnoId).n,
    primeraRespuesta: fechas[0] ?? null, ultimaRespuesta: fechas.at(-1) ?? null,
  };
}

function cabeceraDe(db, u) {
  const perfil = leerPerfil(db, u.id);
  return { id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, rol: u.rol, activo: u.activo === 1, pendiente: u.pendiente === 1, creadoEn: u.creado_en, avatar: perfil.avatar, meta: perfil.meta,
    // 0.9.2: su nombre legal y los términos que aceptó (versión, nombre tal como firmó, fecha).
    nombreLegal: nombreLegalDe(db, u.id),
    terminos: (e => ({ version: e.version, versionPrivacidad: e.versionPrivacidad, pendiente: e.pendiente, ultima: e.ultima, nacimiento: e.nacimiento, menor: e.menor, aceptoIa: e.aceptoIa }))(estadoTerminos(db, u.id)),
    verificacion: verificacionDe(db, u.id), tutorPagos: tutorAutorizoPagos(db, u.id) };
}
// La última actividad: la de sus sesiones o su última respuesta (lo más nuevo).
function actividadCompleta(db, u, ahoraMs, ultimaRespuesta) {
  const a = actividadDe(db, u.id, ahoraMs);
  const ultima = [a.ultimaActividad, ultimaRespuesta, a.ultimaEntrada].filter(Boolean).sort().pop() ?? null;
  return { ...a, ultimaActividad: ultima, enLinea: Boolean(ultima && ahoraMs - Date.parse(ultima) <= 10 * 60 * 1000) };
}

export function fichaAlumno(db, paquete, alumnoId, ahoraMs = Date.now()) {
  const u = cuentaDe(db, alumnoId);
  cerrarVencidos(db, u.id, paquete, ahoraMs);
  const intentos = intentosDe(db, u.id, paquete);
  const resumen = resumenDe(db, u.id, paquete, intentos, ahoraMs);
  return {
    alumno: cabeceraDe(db, u),
    paquete: paquete ? { id: paquete.id, nombre: paquete.nombre, muestra: paquete.muestra } : null,
    resumen,
    intentos: intentos.slice(0, MAXIMO_INTENTOS_EN_PANTALLA), intentosTotal: intentos.length,
    materias: paquete ? materiasDe(db, u.id, paquete, intentos) : [],
    puntosDebiles: resumenDebiles(puntosDebiles(db, u.id, paquete), paquete),
    actividad: actividadCompleta(db, u, ahoraMs, resumen.ultimaRespuesta),
  };
}

// Un intento de ese alumno, pregunta por pregunta: el enunciado tal cual, lo que eligió, la correcta y si acertó.
// Si una pregunta ya no está en el contenido en uso, igual se ve lo que eligió (la letra guardada).
export function intentoDeAlumno(db, paquete, alumnoId, intentoId) {
  const u = cuentaDe(db, alumnoId);
  cerrarVencidos(db, u.id, paquete, Date.now());
  const v = verIntento(db, u.id, paquete, intentoId); // 404 si el intento no es de ese alumno
  const f = db.prepare('SELECT * FROM academia_intentos WHERE id = ?').get(v.id);
  const reloj = tiemposDe(db, f);
  const guardadas = new Map(db.prepare('SELECT pregunta, elegida, correcta, creada_en FROM academia_respuestas WHERE intento_id = ?').all(v.id).map(r => [r.pregunta, r]));
  const titulos = titulosDe(paquete);
  return {
    ...v,
    alumno: { id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre },
    temaTitulo: v.tema ? titulos.get(`${v.materia}/${v.tema}`) ?? null : null,
    pct: pct(v.aciertos, v.total), aprobado: f.aprobado == null ? null : f.aprobado === 1, empezado: f.empezado_en, terminadoEn: f.terminado_en,
    segundos: f.terminado_en ? Math.max(0, Math.round((Date.parse(f.terminado_en) - Date.parse(f.empezado_en)) / 1000)) : null,
    examen: reloj,
    preguntas: v.preguntas.map(q => {
      const g = guardadas.get(q.id);
      const base = { ...q, respondidaEn: g?.creada_en ?? null, segundos: reloj ? reloj.tiempos[q.id] ?? 0 : null };
      if (!q.respuesta && g) base.respuesta = { elegida: g.elegida, acierto: g.correcta === 1, correcta: null, sinContenido: true };
      return base;
    }),
  };
}

export function compararAlumnos(db, paquete, texto, ahoraMs = Date.now()) {
  const partes = String(texto ?? '').split(',');
  if (partes.length < 2 || partes.length > MAXIMO_COMPARAR || !partes.every(p => /^\d{1,9}$/.test(p))) throw new ErrorHttp(400, 'comparar_no_valido');
  const ids = [...new Set(partes.map(Number))];
  if (ids.length !== partes.length) throw new ErrorHttp(400, 'comparar_no_valido');
  const alumnos = ids.map(id => {
    const u = cuentaDe(db, id);
    const intentos = intentosDe(db, u.id, paquete);
    const r = resumenDe(db, u.id, paquete, intentos, ahoraMs);
    const debiles = resumenDebiles(puntosDebiles(db, u.id, paquete), paquete, { limite: 3 });
    const act = actividadCompleta(db, u, ahoraMs, r.ultimaRespuesta);
    return {
      ...cabeceraDe(db, u),
      preparacion: r.preparacion.pct, pctAcierto: r.pctAcierto, notaPromedio: r.notaPromedio, respuestas: r.respuestas,
      intentos: r.intentos, aprobados: r.aprobados, examenesAprobados: r.examenesAprobados, examenes: r.examenes, temasAprobados: r.temasAprobados, temas: r.temas,
      racha: r.racha, puntos: r.puntos, minutosEstudio: r.minutosEstudio, plan: r.plan,
      ultimaActividad: act.ultimaActividad, enLinea: act.enLinea, ultimaEntrada: act.ultimaEntrada, ultimaSalida: act.ultimaSalida,
      materias: paquete ? porMateria(db, u.id, paquete).map(m => ({ id: m.id, pct: m.pct, pctRespuestas: m.pctRespuestas, respuestas: m.respuestas })) : [],
      debiles: { temas: debiles.temas.map(t => ({ materia: t.materia, tema: t.tema, titulo: t.titulo, fallos: t.fallos, pct: t.pct })), ideas: debiles.ideas.map(x => ({ idea: x.idea, numero: x.numero, materia: x.materia, fallos: x.fallos })) },
    };
  });
  const materias = (paquete?.materias ?? []).filter(m => m.temas.length).map(m => m.id);
  return { alumnos, materias };
}
