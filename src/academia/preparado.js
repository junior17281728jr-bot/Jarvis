// Academia 0.10.0: «¿Estás listo para el examen oficial?». Un veredicto ESTRICTO y explicable, sin IA, sobre el banco del
// Test Guide (el examen oficial sale de ahí). Cada razón es una regla con su número (✔ / ✘):
//  - acierto: ≥ 90 % de las preguntas del Test Guide con su última respuesta buena;
//  - cobertura: ≥ 95 % de las preguntas respondidas al menos una vez (y cuántas materias vio);
//  - constancia: los 3 últimos exámenes de materia con 90 % o más (no basta uno);
//  - memoria: ≥ 80 % de las preguntas acertadas otra vez 2 días o más después de acertarlas la primera vez;
//  - fallas: ninguna falla registrada sin superar;
//  - tiempo: 7 días o más desde que empezó y 5 días distintos de estudio (no todo de un tirón).
// «Listo para presentarte» con todo ✔; «Casi» con 80 % o más y como mucho 2 ✘; si no, «Todavía no». La probabilidad es una
// ESTIMACIÓN basada en su práctica: nunca garantiza el resultado del examen oficial.
// Además: por materia, y «aprobaste, pero te recomiendo repetirlo» cuando un aprobado tiene señales de suerte.
import { diaDe, examenes } from './progreso.js';
import { porMateria } from './progreso.js';

// materias: las 11 de ENALAS con contenido (con menos, nunca «Listo»: faltaría lo que no se ha podido estudiar).
export const REGLAS = Object.freeze({ materias: 11, acierto: 90, cobertura: 95, examenes: 3, examenPct: 90, memoria: 80, dias: 7, diasEstudio: 5, casi: 80 });
const DIA = 86_400_000;
const pct = (a, b) => (b > 0 ? Math.floor((a * 100) / b) : 0);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);

export function veredicto(db, usuarioId, paquete, ahoraMs = Date.now()) {
  const R = REGLAS;
  const materias = porMateria(db, usuarioId, paquete);
  const total = materias.reduce((n, m) => n + m.preguntas, 0);
  const bien = materias.reduce((n, m) => n + m.bien, 0);
  const vistas = materias.reduce((n, m) => n + m.bien + m.mal, 0);
  const filas = db.prepare('SELECT pregunta, correcta, dia, intento_id FROM academia_respuestas WHERE usuario_id = ? ORDER BY id').all(usuarioId).filter(f => paquete?.preguntas.has(f.pregunta));
  // Memoria: acertada otra vez ≥ 2 días después del primer acierto.
  const primerAcierto = new Map();
  const retenidas = new Set();
  for (const f of filas) {
    if (f.correcta !== 1) continue;
    const p = primerAcierto.get(f.pregunta);
    if (!p) primerAcierto.set(f.pregunta, f.dia);
    else if (diasEntre(p, f.dia) >= 2) retenidas.add(f.pregunta);
  }
  const ultimos = db.prepare(`SELECT id, materia, total, aciertos FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NOT NULL
    ORDER BY id DESC LIMIT ?`).all(usuarioId, R.examenes);
  const buenos = ultimos.filter(x => pct(x.aciertos, x.total) >= R.examenPct).length;
  const fallas = db.prepare("SELECT materia, COUNT(*) AS n FROM academia_fallas WHERE usuario_id = ? AND estado <> 'superada' GROUP BY materia ORDER BY n DESC").all(usuarioId);
  const activas = fallas.reduce((n, f) => n + f.n, 0);
  const dias = [...new Set(filas.map(f => f.dia))];
  const desde = dias.length ? diasEntre(dias[0], diaDe(ahoraMs)) : 0;
  const conContenido = materias.length;
  const materiasVistas = materias.filter(m => m.bien + m.mal > 0).length;
  const reglas = [
    { id: 'materias', ok: conContenido >= R.materias, valor: conContenido, meta: R.materias, n: conContenido },
    { id: 'acierto', ok: pct(bien, total) >= R.acierto, valor: pct(bien, total), meta: R.acierto, n: total },
    { id: 'cobertura', ok: pct(vistas, total) >= R.cobertura, valor: pct(vistas, total), meta: R.cobertura, n: total, materias: materiasVistas, deMaterias: conContenido },
    { id: 'constancia', ok: buenos >= R.examenes, valor: buenos, meta: R.examenes, n: ultimos.length },
    { id: 'memoria', ok: pct(retenidas.size, total) >= R.memoria, valor: pct(retenidas.size, total), meta: R.memoria, n: total },
    { id: 'fallas', ok: activas === 0, valor: activas, meta: 0, n: activas, donde: fallas.map(f => ({ materia: f.materia, n: f.n })) },
    { id: 'tiempo', ok: desde >= R.dias && dias.length >= R.diasEstudio, valor: desde, meta: R.dias, n: dias.length, diasEstudio: R.diasEstudio },
  ];
  const malas = reglas.filter(r => !r.ok);
  const nivel = !malas.length ? 'listo' : pct(bien, total) >= R.casi && malas.length <= 2 ? 'casi' : 'todavia';
  // (las materias que faltan en el paquete cuentan como una regla más: con todo lo demás bien, «Casi»)
  // La probabilidad: el promedio de sus últimos exámenes (o su acierto), menos 5 por cada regla que no cumple.
  const base = ultimos.length ? Math.floor(ultimos.reduce((n, x) => n + pct(x.aciertos, x.total), 0) / ultimos.length) : pct(bien, total);
  const probabilidad = filas.length ? Math.max(1, Math.min(99, base - 5 * malas.length)) : null;
  const ACCION = { materias: null, cobertura: { tipo: 'intento', datos: { tipo: 'instructor' } }, acierto: { tipo: 'intento', datos: { tipo: 'instructor' } }, constancia: { tipo: 'examen' }, memoria: { tipo: 'intento', datos: { tipo: 'repaso' } }, fallas: { tipo: 'refuerzo' }, tiempo: { tipo: 'seguir' } };
  // El paso que más importa: el primero que el alumno puede hacer (que falten materias no depende de él).
  const suya = malas.find(r => r.id !== 'materias') ?? malas[0];
  const siguiente = suya ? { regla: suya.id, accion: ACCION[suya.id] } : null;
  const ex = examenes(db, usuarioId);
  const fallasPor = new Map(fallas.map(f => [f.materia, f.n]));
  const porMateriaV = materias.map(m => {
    const p = m.pct;
    const cob = pct(m.bien + m.mal, m.preguntas);
    const e = ex.get(m.id);
    const fa = fallasPor.get(m.id) ?? 0;
    const listo = p >= R.acierto && cob >= R.cobertura && e?.aprobado === true && fa === 0;
    return { materia: m.id, pct: p, cobertura: cob, examen: e?.mejor ?? null, aprobado: e?.aprobado === true, fallas: fa, nivel: listo ? 'listo' : p >= R.casi ? 'casi' : 'todavia', n: m.preguntas };
  });
  return { nivel, reglas, siguiente, probabilidad, porMateria: porMateriaV, suerte: aprobadosConSuerte(db, usuarioId, paquete, fallasPor) };
}

// «Aprobaste, pero te recomiendo repetirlo porque…»: un aprobado (tema o examen) con señales de suerte.
export function aprobadosConSuerte(db, usuarioId, paquete, fallasPor = new Map()) {
  const aprobados = db.prepare(`SELECT id, tipo, materia, tema, total, aciertos, umbral FROM academia_intentos WHERE usuario_id = ? AND aprobado = 1 AND tipo IN ('tema', 'examen')
    ORDER BY id DESC LIMIT 5`).all(usuarioId);
  const lista = [];
  for (const a of aprobados) {
    const razones = [];
    const suyas = db.prepare('SELECT id, pregunta, correcta FROM academia_respuestas WHERE intento_id = ? AND usuario_id = ?').all(a.id, usuarioId).filter(f => paquete?.preguntas.has(f.pregunta));
    const buenas = suyas.filter(f => f.correcta === 1);
    // Acertó por primera vez preguntas que nunca había visto.
    const nuevas = buenas.filter(f => !db.prepare('SELECT 1 FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? AND id < ? LIMIT 1').get(usuarioId, f.pregunta, f.id)).length;
    if (buenas.length >= 5 && nuevas * 100 >= buenas.length * 30) razones.push({ id: 'nuevas', n: nuevas, de: buenas.length });
    // Después falló esas mismas preguntas en otra práctica.
    const despues = buenas.filter(f => db.prepare('SELECT 1 FROM academia_respuestas WHERE usuario_id = ? AND pregunta = ? AND id > ? AND correcta = 0 LIMIT 1').get(usuarioId, f.pregunta, f.id)).length;
    if (despues >= 2) razones.push({ id: 'despues', n: despues });
    // Justo en el límite.
    if (a.total && pct(a.aciertos, a.total) - (a.umbral ?? 90) < 5) razones.push({ id: 'justo', pct: pct(a.aciertos, a.total), umbral: a.umbral ?? 90 });
    if ((fallasPor.get(a.materia) ?? 0) > 0) razones.push({ id: 'fallas', n: fallasPor.get(a.materia) });
    if (razones.length) lista.push({ intento: a.id, tipo: a.tipo, materia: a.materia, tema: a.tema, pct: pct(a.aciertos, a.total), razones });
  }
  return lista;
}
