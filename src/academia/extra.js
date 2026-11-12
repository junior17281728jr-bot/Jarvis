// Academia 0.12.0: «¿Quieres estudiar algo extra?». El contenido EXTRA de una materia (paquete: materias[].extra) NO es
// del Test Guide: tarjetas «profundiza» y preguntas por nivel (básico, intermedio, avanzado) hechas de los libros del
// curso, cada una con su fuente (libro, página y una cita corta). Reglas:
//  - Nunca se mezcla con lo del Test Guide: no está en paquete.preguntas (ni en deTema), así que los exámenes, los
//    temas, el repaso, la preparación, la memoria de errores, las fallas, los puntos y la racha no lo ven.
//  - Sus respuestas van en su propia tabla (academia_extra_respuestas, cambio de base 9) y se muestran APARTE (Progreso
//    y la ficha del administrador), con la etiqueta «Extra — no es del Test Guide».
//  - Siempre se puede abrir (opcional); se recomienda después de aprobar el examen de la materia.
//  - Como en todo lo demás: la respuesta correcta no viaja antes de responder.
import { ErrorHttp } from '../nucleo/http.js';
import { NIVELES_EXTRA } from './formato.js';
import { librosDe, clipDe, fotoDe } from './paquetes.js';

const POR_RONDA = 10;
const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);
const diaDe = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);

function materiaDe(paquete, materia) {
  const m = paquete?.materias?.find(x => x.id === materia);
  if (!m || !m.temas.length) throw new ErrorHttp(404, 'no_existe');
  return m;
}
const tituloTema = (m, id) => m.temas.find(t => t.id === id)?.titulo ?? id;
const fuenteVista = (paquete, m, f) => (f ? { libro: librosDe(paquete, m.paquete).get(f.libro)?.titulo ?? f.libro, pagina: f.pagina ?? null, cita: f.cita_corta ?? null } : null);

// Lo que el alumno ha respondido de lo extra: la última respuesta de cada pregunta y los totales.
function respuestasDe(db, usuarioId, materia = null) {
  const filas = materia
    ? db.prepare('SELECT pregunta, materia, nivel, correcta FROM academia_extra_respuestas WHERE usuario_id = ? AND materia = ? ORDER BY id').all(usuarioId, materia)
    : db.prepare('SELECT pregunta, materia, nivel, correcta FROM academia_extra_respuestas WHERE usuario_id = ? ORDER BY id').all(usuarioId);
  const ultima = new Map();
  for (const f of filas) ultima.set(`${f.materia}/${f.pregunta}`, f);
  return { filas, ultima };
}

// La pantalla «Extra» de una materia: las tarjetas por tema, cuántas preguntas hay por nivel y cómo va en cada nivel.
export function extraDeMateria(db, usuarioId, paquete, materia, { examenAprobado = false } = {}) {
  const m = materiaDe(paquete, materia);
  const { preguntas, tarjetas } = m.extra ?? { preguntas: [], tarjetas: [] };
  const { filas, ultima } = respuestasDe(db, usuarioId, materia);
  const niveles = NIVELES_EXTRA.map(nivel => {
    const ids = preguntas.filter(q => q.nivel === nivel).map(q => q.id);
    const bien = ids.filter(id => ultima.get(`${materia}/${id}`)?.correcta === 1).length;
    const vistas = ids.filter(id => ultima.has(`${materia}/${id}`)).length;
    return { nivel, preguntas: ids.length, bien, vistas, pct: pct(bien, ids.length) };
  });
  const temas = m.temas.map(t => ({
    id: t.id, titulo: t.titulo,
    tarjetas: tarjetas.filter(c => c.tema === t.id).map(c => ({
      titulo: c.titulo, puntos: c.puntos ?? [], recuerda: c.recuerda ?? null, ejemplo: c.ejemplo ?? null, ingles: Array.isArray(c.ingles) ? c.ingles : [],
      fuentes: (c.fuentes ?? []).map(f => fuenteVista(paquete, m, f)),
      clip: clipDe(paquete, m.paquete, c.clip), // 0.12.1
      imagen: fotoDe(paquete, m.paquete, c.imagen, c.fuentes), // 0.12.5
    })),
    preguntas: preguntas.filter(q => q.tema === t.id).length,
  })).filter(t => t.tarjetas.length || t.preguntas);
  return {
    materia, hay: preguntas.length > 0 || tarjetas.length > 0, recomendado: examenAprobado === true,
    total: preguntas.length, tarjetas: tarjetas.length, niveles, temas,
    respondidas: filas.length, aciertos: filas.filter(f => f.correcta === 1).length,
  };
}

// Una ronda de preguntas extra (sin la respuesta): de un nivel y, si se pide, de un tema. Primero las que no ha visto,
// después las que falló, después las demás; mezcladas dentro de cada grupo.
export function rondaExtra(db, usuarioId, paquete, materia, { nivel = null, tema = null } = {}, { azar = Math.random } = {}) {
  const m = materiaDe(paquete, materia);
  if (nivel != null && !NIVELES_EXTRA.includes(nivel)) throw new ErrorHttp(400, 'datos_no_validos');
  if (tema != null && !m.temas.some(t => t.id === tema)) throw new ErrorHttp(404, 'no_existe');
  const lista = (m.extra?.preguntas ?? []).filter(q => (nivel == null || q.nivel === nivel) && (tema == null || q.tema === tema));
  if (!lista.length) throw new ErrorHttp(409, 'sin_preguntas');
  const { ultima } = respuestasDe(db, usuarioId, materia);
  const grupo = q => { const u = ultima.get(`${materia}/${q.id}`); return !u ? 0 : u.correcta === 1 ? 2 : 1; };
  const mezcla = q => azar();
  const orden = lista.map(q => ({ q, g: grupo(q), r: mezcla(q) })).sort((a, b) => a.g - b.g || a.r - b.r).slice(0, POR_RONDA).map(x => x.q);
  return {
    materia, nivel, tema,
    preguntas: orden.map(q => ({
      id: q.id, tema: q.tema, temaTitulo: tituloTema(m, q.tema), nivel: q.nivel, enunciado: q.enunciado,
      opciones: q.opciones.map(o => ({ letra: o.letra, texto: o.texto })),
    })),
  };
}

// Responder una pregunta extra: se guarda (aparte de todo lo del Test Guide) y vuelve la retroalimentación: por qué su
// opción no (si falló), la explicación y la fuente (libro, página y la cita).
export function responderExtra(db, usuarioId, paquete, materia, { pregunta, elegida }, { ahoraMs = Date.now() } = {}) {
  const m = materiaDe(paquete, materia);
  const q = typeof pregunta === 'string' ? (m.extra?.preguntas ?? []).find(x => x.id === pregunta) : null;
  if (!q) throw new ErrorHttp(404, 'no_existe');
  if (typeof elegida !== 'string' || !q.opciones.some(o => o.letra === elegida)) throw new ErrorHttp(400, 'opcion_no_valida');
  const acierto = elegida === q.correcta;
  db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuarioId, m.paquete ?? null, materia, q.tema ?? null, q.id, q.nivel ?? null, elegida, acierto ? 1 : 0, diaDe(ahoraMs), new Date(ahoraMs).toISOString());
  return {
    pregunta: q.id, elegida, correcta: q.correcta, acierto,
    porque: acierto ? null : q.porque_incorrectas?.[elegida] ?? null,
    explicacion: q.explicacion, fuente: fuenteVista(paquete, m, q.fuente),
  };
}

// Para Progreso y la ficha del administrador: cómo va en lo extra de cada materia (aparte del Test Guide).
export function resumenExtra(db, usuarioId, paquete) {
  const { filas, ultima } = respuestasDe(db, usuarioId);
  return (paquete?.materias ?? []).filter(m => m.extra?.preguntas?.length).map(m => {
    const qs = m.extra.preguntas;
    const suyas = filas.filter(f => f.materia === m.id);
    const niveles = NIVELES_EXTRA.map(nivel => {
      const ids = qs.filter(q => q.nivel === nivel).map(q => q.id);
      const bien = ids.filter(id => ultima.get(`${m.id}/${id}`)?.correcta === 1).length;
      return { nivel, preguntas: ids.length, bien, vistas: ids.filter(id => ultima.has(`${m.id}/${id}`)).length, pct: pct(bien, ids.length) };
    });
    const bien = qs.filter(q => ultima.get(`${m.id}/${q.id}`)?.correcta === 1).length;
    return { materia: m.id, preguntas: qs.length, bien, vistas: qs.filter(q => ultima.has(`${m.id}/${q.id}`)).length, pct: pct(bien, qs.length), respuestas: suyas.length, aciertos: suyas.filter(f => f.correcta === 1).length, niveles };
  }).filter(x => x.respuestas > 0);
}
