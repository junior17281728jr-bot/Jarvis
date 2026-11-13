// Academia 0.13.8 (pedido del dueño: «si quiero ver toda materia, me enseñe el porcentaje de cada materia que ha hecho»).
// SOLO para el administrador («Cómo van todos» y la ficha de un alumno, rutas { admin: true }). Solo lee: sin cambio de base.
//  - avancePorMateria: las 11 materias del curso, SIEMPRE en el orden de la escuela (MATERIAS), cada una con su % hecho
//    con la MISMA cuenta que el avance del curso entero (pasosDelCamino, src/academia/plan.js): cada tema aprobado (o
//    leído, si no tiene preguntas) es un paso y el examen aprobado de la materia es otro. La que el paquete todavía no
//    trae sale «pronto» (sin pasos). También la mejor nota de su examen y el % de aciertos FUERA de los exámenes.
//  - dondeVa: el tema donde se quedó (el primero sin hacer, como su Camino) o el examen de esa materia.
//  - materiaMasDebil: la de menos aciertos (con al menos 10 respuestas: con menos no dice nada).
//  - avanceOral: los capítulos del oral (si el alumno ya hizo algo ahí): temas leídos + examen aprobado.
//  - diasSinEntrar / diasActivosSemana: con el reloj que llega (las pruebas usan uno falso).
import { MATERIAS } from './formato.js';
import { temasAprobados, temasLeidos, examenes } from './progreso.js';
import { caminoOral, examenesOralDe, hayOral } from './oral.js';

const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);
const DIA_MS = 24 * 3600 * 1000;
export const MINIMO_PARA_DEBIL = 10;
// Desde cuántos días sin entrar se avisa (en naranja) «Hace N días que no entra».
export const DIAS_SIN_ENTRAR_AVISO = 7;

// Las respuestas de cada materia FUERA de los exámenes (temas, prácticas, reto, repaso): Map materia → { n, bien }.
export function respuestasSinExamen(db, usuarioId) {
  return new Map(db.prepare(`SELECT r.materia, COUNT(*) AS n, COALESCE(SUM(r.correcta), 0) AS bien
    FROM academia_respuestas r LEFT JOIN academia_intentos i ON i.id = r.intento_id
    WHERE r.usuario_id = ? AND (i.tipo IS NULL OR i.tipo <> 'examen') GROUP BY r.materia`).all(usuarioId).map(f => [f.materia, { n: f.n, bien: f.bien }]));
}

// → { materias: [11 × { id, pronto, temas, temasHechos, examen: { mejor, aprobado, veces }, pasos, hechos, pct, respuestas, pctAcierto }],
//     hechos, pasos, dondeVa: { materia, tema, titulo } | { materia, examen: true } | null }
export function avancePorMateria(db, usuarioId, paquete, { respuestas = null } = {}) {
  const aprobados = temasAprobados(db, usuarioId);
  const leidos = temasLeidos(db, usuarioId);
  const deExamen = examenes(db, usuarioId);
  const resp = respuestas ?? respuestasSinExamen(db, usuarioId);
  let dondeVa = null;
  let todoHecho = true;
  const materias = MATERIAS.map(id => {
    const m = paquete?.materias?.find(x => x.id === id);
    const ex = deExamen.get(id);
    const r = resp.get(id);
    const examen = { mejor: ex?.mejor ?? null, aprobado: ex?.aprobado === true, veces: ex?.veces ?? 0 };
    const base = { id, examen, respuestas: r?.n ?? 0, pctAcierto: r?.n ? pct(r.bien, r.n) : null };
    if (!m || !m.temas.length) return { ...base, pronto: true, temas: 0, temasHechos: 0, pasos: 0, hechos: 0, pct: 0 };
    const hecho = t => aprobados.get(`${id}/${t.id}`)?.aprobado === true || (!t.preguntas.length && leidos.has(`${id}/${t.id}`));
    const temasHechos = m.temas.filter(hecho).length;
    const hechos = temasHechos + (examen.aprobado ? 1 : 0);
    const pasos = m.temas.length + 1;
    if (hechos < pasos) {
      todoHecho = false;
      if (!dondeVa) {
        const t = m.temas.find(x => !hecho(x));
        dondeVa = t ? { materia: id, tema: t.id, titulo: t.titulo } : { materia: id, examen: true };
      }
    }
    return { ...base, pronto: false, temas: m.temas.length, temasHechos, pasos, hechos, pct: pct(hechos, pasos) };
  });
  return {
    materias,
    hechos: materias.reduce((n, m) => n + m.hechos, 0),
    pasos: materias.reduce((n, m) => n + m.pasos, 0),
    dondeVa: todoHecho ? null : dondeVa,
  };
}

// La materia de menos aciertos (con al menos «minimo» respuestas). Empate: la primera en el orden del curso. → { id, pctAcierto, respuestas } | null
export function materiaMasDebil(materias, minimo = MINIMO_PARA_DEBIL) {
  let peor = null;
  for (const m of materias ?? []) {
    if (m.pronto || (m.respuestas ?? 0) < minimo || m.pctAcierto == null) continue;
    if (!peor || m.pctAcierto < peor.pctAcierto) peor = { id: m.id, pctAcierto: m.pctAcierto, respuestas: m.respuestas };
  }
  return peor;
}

// Los capítulos del oral, solo si el alumno ya hizo algo ahí (leyó, respondió o dio un examen). → [{ id, numero, temas, leidos, examen, pasos, hechos, pct, pctDominio }] | null
export function avanceOral(db, usuarioId, paquete) {
  if (!hayOral(paquete)) return null;
  const c = caminoOral(db, usuarioId, paquete);
  const algo = c.materias.some(m => m.temas.some(t => t.leido || t.vistas) || m.examen.veces) || (c.final?.veces ?? 0) > 0;
  if (!algo) return null;
  return c.materias.map(m => {
    const leidos = m.temas.filter(t => t.leido).length;
    const hechos = leidos + (m.examen.aprobado ? 1 : 0);
    const pasos = m.temas.length + 1;
    return { id: m.id, numero: m.numero, temas: m.temas.length, leidos, examen: { mejor: m.examen.mejor, aprobado: m.examen.aprobado, veces: m.examen.veces }, pasos, hechos, pct: pct(hechos, pasos), pctDominio: m.pct };
  });
}

// La fecha del último examen que terminó (de una materia o del oral). → ISO | null
export function ultimoExamenDe(db, usuarioId, paquete) {
  const tg = db.prepare("SELECT MAX(terminado_en) AS f FROM academia_intentos WHERE usuario_id = ? AND tipo = 'examen' AND terminado_en IS NOT NULL").get(usuarioId).f;
  const oral = examenesOralDe(db, usuarioId, paquete).map(x => x.en).filter(Boolean);
  return [tg, ...oral].filter(Boolean).sort().pop() ?? null;
}

// Días enteros desde su última actividad (null: nunca entró).
export function diasSinEntrar(ultima, ahoraMs) {
  const t = Date.parse(ultima ?? '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahoraMs - t) / DIA_MS));
}

// En cuántos días distintos estudió en los últimos 7 (contando hoy). fechas: las de sus respuestas (ISO).
export function diasActivosSemana(filas, ahoraMs) {
  const dias = new Set();
  for (const f of filas ?? []) {
    const t = Date.parse(f.creada_en);
    if (Number.isFinite(t) && t <= ahoraMs && ahoraMs - t < 7 * DIA_MS) dias.add(f.dia ?? new Date(t).toISOString().slice(0, 10));
  }
  return dias.size;
}
