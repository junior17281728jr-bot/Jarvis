// Academia 0.13.1: la pista «Preparándote para el examen oral» (para el alumno). Vive APARTE de todo lo del Test Guide:
//  - El contenido sale de paquete.oral (src/academia/paquetes.js: las versiones con pista «oral», juntas TEMA POR TEMA);
//    nada de esto está en paquete.materias, paquete.preguntas ni deTema, así que los exámenes del Test Guide, la
//    preparación, el repaso, la memoria de errores, las fallas, los puntos y la racha no lo ven.
//  - Sus respuestas van en la tabla de lo «extra» (academia_extra_respuestas, sin cambio de base) con la materia oral_* y
//    el «nivel» que dice dónde se respondió (oral_practica, oral_examen, oral_final). Lo de lo extra (src/academia/extra.js)
//    solo mira las materias del Test Guide, así que nunca las muestra.
//  - Los exámenes (de un capítulo y el final) y lo leído se guardan por alumno en «ajustes» (academia.oral.<id>).
//  - Funciona sin IA: la lección, la práctica, los exámenes y «Listo para el oral» salen solo del paquete y de lo que
//    respondió. La respuesta correcta (y «¿De dónde salió?», que la trae) nunca viaja antes de responder.
import { randomBytes } from 'node:crypto';
import { ErrorHttp } from '../nucleo/http.js';
import { MATERIAS_ORAL } from './formato.js';
import { leerAjuste, guardarAjuste, librosDe } from './paquetes.js';
import { vistaSecciones, ajustesAcademia } from './progreso.js';

export const NIVELES_ORAL = Object.freeze({ practica: 'oral_practica', examen: 'oral_examen', final: 'oral_final' });
export const ORAL = Object.freeze({ porRonda: 10, examenCapitulo: 20, examenFinal: 40, escenariosFinal: 6, examenVivoMs: 6 * 3600_000 });
const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);
const diaDe = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
const claveAlumno = id => `academia.oral.${Number(id)}`;
const esObjeto = v => v != null && typeof v === 'object' && !Array.isArray(v);

export const hayOral = paquete => Boolean(paquete?.oral?.hay);
const materiasConTemas = paquete => (paquete?.oral?.materias ?? []).filter(m => m.temas.length);

function estadoAlumno(db, usuarioId) {
  let v = null;
  try { v = JSON.parse(leerAjuste(db, claveAlumno(usuarioId)) ?? 'null'); } catch { v = null; }
  v = esObjeto(v) ? v : {};
  return { leidos: Array.isArray(v.leidos) ? v.leidos.filter(x => typeof x === 'string').slice(-500) : [], examenes: esObjeto(v.examenes) ? v.examenes : {}, abierto: esObjeto(v.abierto) ? v.abierto : null };
}
const guardarAlumno = (db, usuarioId, v) => guardarAjuste(db, claveAlumno(usuarioId), JSON.stringify(v));

function materiaOral(paquete, materia) {
  if (!MATERIAS_ORAL.includes(materia)) throw new ErrorHttp(404, 'no_existe');
  const m = paquete?.oral?.materias.find(x => x.id === materia);
  if (!m || !m.temas.length) throw new ErrorHttp(404, 'no_existe');
  return m;
}
function temaOral(paquete, materia, tema) {
  const m = materiaOral(paquete, materia);
  const t = m.temas.find(x => x.id === tema);
  if (!t) throw new ErrorHttp(404, 'no_existe');
  return { m, t };
}
// La última respuesta del alumno a cada pregunta oral (en cualquier lugar: práctica o examen).
function ultimas(db, usuarioId) {
  const filas = db.prepare("SELECT pregunta, materia, nivel, correcta FROM academia_extra_respuestas WHERE usuario_id = ? AND materia LIKE 'oral\\_%' ESCAPE '\\' ORDER BY id").all(usuarioId);
  const ultima = new Map();
  for (const f of filas) if (MATERIAS_ORAL.includes(f.materia)) ultima.set(`${f.materia}/${f.pregunta}`, f);
  return { filas: filas.filter(f => MATERIAS_ORAL.includes(f.materia)), ultima };
}
const libroDe = (paquete, pid, id) => librosDe(paquete, pid).get(id)?.titulo ?? null;

// Una pregunta, para responder (SIN la respuesta ni su origen).
function vistaPreguntaOral(paquete, qid) {
  const q = paquete.oral.preguntas.get(qid);
  const lugar = paquete.oral.deTema.get(qid);
  const t = paquete.oral.materias.find(m => m.id === lugar.materia)?.temas.find(x => x.id === lugar.tema);
  return { id: qid, materia: lugar.materia, tema: lugar.tema, temaTitulo: t?.titulo ?? lugar.tema, enunciado: q.original.enunciado, opciones: q.original.opciones.map(o => ({ letra: o.letra, texto: o.texto })) };
}
// Lo que se ve DESPUÉS de responder: la correcta, por qué su opción no, la explicación y «¿De dónde salió?».
function retroOral(paquete, qid, elegida) {
  const q = paquete.oral.preguntas.get(qid);
  const pid = paquete.oral.dePaquete.get(qid);
  const f = q.fuente_pregunta;
  const acierto = elegida === q.original.correcta;
  return {
    pregunta: qid, elegida, correcta: q.original.correcta, acierto,
    porque: acierto ? null : q.errores?.[elegida] ?? null,
    explicacion: q.original.explicacion, sencilla: q.sencilla ?? null,
    origen: { libro: libroDe(paquete, pid, f.libro), pagina: f.pagina, pregunta_en: f.pregunta_en, respuesta_en: f.respuesta_en, como: f.como },
  };
}
function anotar(db, usuarioId, paquete, qid, elegida, acierto, nivel, ahoraMs) {
  const lugar = paquete.oral.deTema.get(qid);
  db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, paquete.oral.dePaquete.get(qid) ?? null, lugar.materia, lugar.tema, qid, nivel, elegida, acierto ? 1 : 0, diaDe(ahoraMs), new Date(ahoraMs).toISOString());
}

// ---------- El Camino oral ----------
// Por capítulo: sus temas (lo leído y cómo va la práctica), su examen y el examen final; «Listo para el oral».
export function caminoOral(db, usuarioId, paquete, { tgTerminado = false } = {}) {
  if (!hayOral(paquete)) return { hay: false, materias: [], final: null, listo: null, siguientePaso: false };
  const { umbral } = ajustesAcademia(db);
  const yo = estadoAlumno(db, usuarioId);
  const leidos = new Set(yo.leidos);
  const { ultima } = ultimas(db, usuarioId);
  const materias = materiasConTemas(paquete).map(m => {
    const temas = m.temas.map(t => {
      const bien = t.preguntas.filter(id => ultima.get(`${m.id}/${id}`)?.correcta === 1).length;
      const vistas = t.preguntas.filter(id => ultima.has(`${m.id}/${id}`)).length;
      return {
        id: t.id, titulo: t.titulo, titulo_en: t.titulo_en ?? null, leido: leidos.has(`${m.id}/${t.id}`), preguntas: t.preguntas.length, qa: (t.libro_qa ?? []).length,
        adicionales: (t.adicionales ?? []).length, bien, vistas, pct: pct(bien, t.preguntas.length),
      };
    });
    const total = temas.reduce((n, t) => n + t.preguntas, 0);
    const bien = temas.reduce((n, t) => n + t.bien, 0);
    const ex = yo.examenes[m.id] ?? null;
    return {
      id: m.id, numero: MATERIAS_ORAL.indexOf(m.id) + 1, temas, preguntas: total, bien, pct: pct(bien, total),
      examen: { disponible: total > 0, aprobado: ex?.aprobado === true, mejor: ex?.mejor ?? null, veces: ex?.veces ?? 0 },
    };
  });
  const final = yo.examenes.final ?? null;
  const totalFinal = materias.reduce((n, m) => n + m.preguntas, 0);
  const vista = {
    hay: true, umbral, materias,
    final: { disponible: totalFinal > 0, preguntas: Math.min(totalFinal, ORAL.examenFinal), aprobado: final?.aprobado === true, mejor: final?.mejor ?? null, veces: final?.veces ?? 0 },
    listo: listoParaOral(materias, final, umbral),
    // Se muestra como «siguiente paso» cuando terminó los exámenes del Test Guide (pero siempre se puede abrir).
    siguientePaso: tgTerminado === true,
  };
  vista.siguiente = siguienteOral(vista);
  return vista;
}

// «Listo para el oral / Todavía no» (sin IA). El % junta tres cosas por igual: lo que domina (la última respuesta de
// cada pregunta, bien), los exámenes de capítulo aprobados y la mejor nota del examen final. «Listo» = todos los
// exámenes de capítulo aprobados y el final aprobado.
export function listoParaOral(materias, final, umbral) {
  const con = materias.filter(m => m.preguntas > 0);
  const preguntas = con.reduce((n, m) => n + m.preguntas, 0);
  const dominio = pct(con.reduce((n, m) => n + m.bien, 0), preguntas);
  const capitulos = pct(con.filter(m => m.examen.aprobado).length, con.length);
  const nota = Math.max(0, Math.min(100, Number(final?.mejor) || 0));
  const faltan = [];
  for (const m of con) if (!m.examen.aprobado) faltan.push({ tipo: 'examen', materia: m.id });
  if (final?.aprobado !== true) faltan.push({ tipo: 'final' });
  return { listo: con.length > 0 && faltan.length === 0, pct: con.length ? Math.floor((dominio + capitulos + nota) / 3) : 0, dominio, capitulos, final: nota, umbral, faltan: faltan.slice(0, 12) };
}
function siguienteOral(v) {
  for (const m of v.materias) {
    const t = m.temas.find(x => !x.leido);
    if (t) return { tipo: 'tema', materia: m.id, tema: t.id };
    const p = m.temas.find(x => x.preguntas && x.vistas < x.preguntas);
    if (p) return { tipo: 'practica', materia: m.id, tema: p.id };
    if (!m.examen.aprobado && m.examen.disponible) return { tipo: 'examen', materia: m.id };
  }
  return v.final.disponible && !v.final.aprobado ? { tipo: 'final' } : null;
}

// ---------- La lección de un tema ----------
// Las tarjetas (en español, con sus dibujos, fotos y fichas de inglés) y cada pregunta del libro TAL CUAL (inglés)
// con su respuesta TAL CUAL, la explicación en español y los puntos clave; y las «Additional Study Questions».
export function leccionOral(db, usuarioId, paquete, materia, tema) {
  const { t } = temaOral(paquete, materia, tema);
  const primerLibro = [...librosDe(paquete, t.paquete).values()][0]?.titulo ?? null;
  return {
    materia, tema: t.id, titulo: t.titulo, titulo_en: t.titulo_en ?? null, libro: primerLibro,
    secciones: vistaSecciones(paquete, t.secciones, t.paquete),
    libro_qa: (t.libro_qa ?? []).map(x => ({ n: x.n ?? null, pregunta_en: x.pregunta_en, respuesta_en: x.respuesta_en ?? null, pagina: x.pagina, explicacion_es: x.explicacion_es ?? null, puntos_clave: Array.isArray(x.puntos_clave) ? x.puntos_clave : [] })),
    adicionales: (t.adicionales ?? []).map(x => ({ n: x.n ?? null, pregunta_en: x.pregunta_en, pagina: x.pagina })),
    preguntas: t.preguntas.length, leido: estadoAlumno(db, usuarioId).leidos.includes(`${materia}/${t.id}`),
  };
}
export function marcarLeidoOral(db, usuarioId, paquete, materia, tema) {
  temaOral(paquete, materia, tema);
  const yo = estadoAlumno(db, usuarioId);
  const clave = `${materia}/${tema}`;
  if (!yo.leidos.includes(clave)) guardarAlumno(db, usuarioId, { ...yo, leidos: [...yo.leidos, clave] });
  return { leido: true };
}

// ---------- Practicar (sin reloj, una por una, con la respuesta al momento) ----------
// De un tema, de un capítulo, o «mis errores» (las que la última vez respondió mal). Primero las que no ha visto,
// después las que falló, después las demás; mezcladas dentro de cada grupo.
export function rondaOral(db, usuarioId, paquete, { materia = null, tema = null, errores = false } = {}, { azar = Math.random } = {}) {
  if (!hayOral(paquete)) throw new ErrorHttp(409, 'sin_paquete');
  let ids;
  if (tema != null) ids = temaOral(paquete, materia, tema).t.preguntas;
  else if (materia != null) ids = materiaOral(paquete, materia).temas.flatMap(t => t.preguntas);
  else ids = materiasConTemas(paquete).flatMap(m => m.temas.flatMap(t => t.preguntas));
  const { ultima } = ultimas(db, usuarioId);
  const de = id => ultima.get(`${paquete.oral.deTema.get(id).materia}/${id}`);
  if (errores) ids = ids.filter(id => de(id)?.correcta === 0);
  if (!ids.length) throw new ErrorHttp(409, 'sin_preguntas');
  const grupo = id => { const u = de(id); return !u ? 0 : u.correcta === 1 ? 2 : 1; };
  const orden = ids.map(id => ({ id, g: grupo(id), r: azar() })).sort((a, b) => a.g - b.g || a.r - b.r).slice(0, ORAL.porRonda).map(x => x.id);
  return { materia, tema, errores: errores === true, preguntas: orden.map(id => vistaPreguntaOral(paquete, id)) };
}
export function responderOral(db, usuarioId, paquete, { pregunta, elegida }, { ahoraMs = Date.now() } = {}) {
  if (!hayOral(paquete)) throw new ErrorHttp(409, 'sin_paquete');
  const q = typeof pregunta === 'string' ? paquete.oral.preguntas.get(pregunta) : null;
  if (!q) throw new ErrorHttp(404, 'no_existe');
  if (typeof elegida !== 'string' || !q.original.opciones.some(o => o.letra === elegida)) throw new ErrorHttp(400, 'opcion_no_valida');
  // Mientras tenga abierto un examen con esta pregunta, no se responde (ni se ve su origen) por la práctica.
  const abierto = estadoAlumno(db, usuarioId).abierto;
  if (abierto && ahoraMs - Date.parse(abierto.creado) < ORAL.examenVivoMs && (abierto.preguntas ?? []).includes(pregunta)) throw new ErrorHttp(403, 'pregunta_en_examen');
  const r = retroOral(paquete, pregunta, elegida);
  anotar(db, usuarioId, paquete, pregunta, elegida, r.acierto, NIVELES_ORAL.practica, ahoraMs);
  return r;
}

// ---------- Los exámenes: de un capítulo y el final («Examen oral (práctica final)») ----------
// Se responden todas y se entregan juntas; la nota y la revisión (con «¿De dónde salió?») llegan al entregar. El final
// mezcla todos los capítulos (por partes iguales, lo que alcance) y las preguntas de escenario.
export function crearExamenOral(db, usuarioId, paquete, { materia = null }, { azar = Math.random, ahoraMs = Date.now() } = {}) {
  if (!hayOral(paquete)) throw new ErrorHttp(409, 'sin_paquete');
  const mezclar = lista => lista.map(x => ({ x, r: azar() })).sort((a, b) => a.r - b.r).map(x => x.x);
  let ids;
  if (materia != null) ids = mezclar(materiaOral(paquete, materia).temas.flatMap(t => t.preguntas)).slice(0, ORAL.examenCapitulo);
  else {
    const capitulos = materiasConTemas(paquete).filter(m => m.id !== 'oral_escenarios').map(m => mezclar(m.temas.flatMap(t => t.preguntas)));
    const escenarios = mezclar(materiasConTemas(paquete).filter(m => m.id === 'oral_escenarios').flatMap(m => m.temas.flatMap(t => t.preguntas))).slice(0, ORAL.escenariosFinal);
    const cupo = ORAL.examenFinal - escenarios.length;
    ids = [];
    for (let vuelta = 0; ids.length < cupo && capitulos.some(l => l.length > vuelta); vuelta++) for (const l of capitulos) if (l[vuelta] && ids.length < cupo) ids.push(l[vuelta]);
    ids = mezclar([...ids, ...escenarios]);
  }
  if (!ids.length) throw new ErrorHttp(409, 'sin_preguntas');
  const yo = estadoAlumno(db, usuarioId);
  const abierto = { id: randomBytes(9).toString('base64url'), alcance: materia ?? 'final', preguntas: ids, creado: new Date(ahoraMs).toISOString() };
  guardarAlumno(db, usuarioId, { ...yo, abierto });
  return { examen: abierto.id, alcance: abierto.alcance, total: ids.length, preguntas: ids.map(id => vistaPreguntaOral(paquete, id)) };
}
export function entregarExamenOral(db, usuarioId, paquete, { examen, respuestas }, { ahoraMs = Date.now() } = {}) {
  if (!hayOral(paquete)) throw new ErrorHttp(409, 'sin_paquete');
  const yo = estadoAlumno(db, usuarioId);
  const a = yo.abierto;
  if (!a || typeof examen !== 'string' || a.id !== examen) throw new ErrorHttp(404, 'no_existe');
  if (!esObjeto(respuestas)) throw new ErrorHttp(400, 'datos_no_validos');
  const ids = a.preguntas.filter(id => paquete.oral.preguntas.has(id));
  const { umbral } = ajustesAcademia(db);
  const nivel = a.alcance === 'final' ? NIVELES_ORAL.final : NIVELES_ORAL.examen;
  const revision = [];
  for (const id of ids) {
    const q = paquete.oral.preguntas.get(id);
    const elegida = typeof respuestas[id] === 'string' && q.original.opciones.some(o => o.letra === respuestas[id]) ? respuestas[id] : null;
    const r = elegida ? retroOral(paquete, id, elegida) : { ...retroOral(paquete, id, null), acierto: false, elegida: null };
    if (elegida) anotar(db, usuarioId, paquete, id, elegida, r.acierto, nivel, ahoraMs);
    revision.push({ ...vistaPreguntaOral(paquete, id), ...r });
  }
  const bien = revision.filter(x => x.acierto).length;
  const nota = pct(bien, ids.length);
  const aprobado = ids.length > 0 && bien * 100 >= umbral * ids.length;
  const antes = yo.examenes[a.alcance] ?? {};
  const examenes = { ...yo.examenes, [a.alcance]: { aprobado: antes.aprobado === true || aprobado, mejor: Math.max(Number(antes.mejor) || 0, nota), ultimo: nota, veces: (Number(antes.veces) || 0) + 1, en: new Date(ahoraMs).toISOString() } };
  guardarAlumno(db, usuarioId, { ...yo, abierto: null, examenes });
  return { alcance: a.alcance, bien, total: ids.length, pct: nota, aprobado, umbral, revision };
}

// ---------- Progreso, Mi repaso y la ficha del administrador (aparte del Test Guide) ----------
export function resumenOral(db, usuarioId, paquete) {
  if (!hayOral(paquete)) return null;
  const c = caminoOral(db, usuarioId, paquete);
  const { filas, ultima } = ultimas(db, usuarioId);
  const fallas = [];
  for (const [clave, f] of ultima) if (f.correcta === 0 && paquete.oral.preguntas.has(f.pregunta)) fallas.push(clave);
  return {
    listo: c.listo, final: c.final, respuestas: filas.length, aciertos: filas.filter(f => f.correcta === 1).length, errores: fallas.length,
    materias: c.materias.map(m => ({ id: m.id, numero: m.numero, preguntas: m.preguntas, bien: m.bien, pct: m.pct, examen: m.examen, temas: m.temas.length })),
  };
}
// Mi repaso: las preguntas del oral que la última vez respondió mal, por tema (para practicarlas otra vez).
export function repasoOral(db, usuarioId, paquete) {
  if (!hayOral(paquete)) return null;
  const { ultima } = ultimas(db, usuarioId);
  const porTema = new Map();
  for (const f of ultima.values()) {
    if (f.correcta !== 0 || !paquete.oral.preguntas.has(f.pregunta)) continue;
    const lugar = paquete.oral.deTema.get(f.pregunta);
    const clave = `${lugar.materia}/${lugar.tema}`;
    if (!porTema.has(clave)) {
      const t = paquete.oral.materias.find(m => m.id === lugar.materia)?.temas.find(x => x.id === lugar.tema);
      porTema.set(clave, { materia: lugar.materia, tema: lugar.tema, titulo: t?.titulo ?? lugar.tema, errores: 0 });
    }
    porTema.get(clave).errores += 1;
  }
  const temas = [...porTema.values()].sort((a, b) => b.errores - a.errores);
  return { errores: temas.reduce((n, t) => n + t.errores, 0), temas: temas.slice(0, 20) };
}
