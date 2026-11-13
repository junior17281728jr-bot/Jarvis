// 0.12.3: los «Exámenes del Test Guide» de cada materia (el examen final del Camino, academia_intentos.tipo = 'examen'),
// para el administrador: TODOS juntos, agrupados por materia (en el orden del contenido en uso), con cuántos intentos, la
// mejor y la última nota y cuántos aprobaron; cada fila: el alumno, la fecha, la nota, si aprobó, cuánto tardó y si fue
// «directo» (sin terminar los temas: src/academia/saltos.js). Solo lee (nada cambia). Los temas y las prácticas siguen en
// la ficha de cada alumno (Exámenes → «Prácticas y temas»).
import { saltoDeIntento } from './saltos.js';

const pct = (bien, total) => (total > 0 ? Math.floor((bien * 100) / total) : 0);
export const MAXIMO_FILAS = 2000;

// filas: las de academia_intentos (terminadas), de la más nueva a la más vieja. orden: los ids de materia del contenido.
export function agruparExamenes(filas, orden = []) {
  const grupos = new Map(orden.map(id => [id, []]));
  for (const f of filas) {
    if (!grupos.has(f.materia)) grupos.set(f.materia, []);
    grupos.get(f.materia).push(f);
  }
  return [...grupos].map(([id, lista]) => ({
    id,
    intentos: lista.length,
    mejor: lista.length ? Math.max(...lista.map(x => x.pct)) : null,
    ultima: lista.length ? lista[0].pct : null,
    aprobados: lista.filter(x => x.aprobado).length,
    tasa: lista.length ? Math.round((lista.filter(x => x.aprobado).length * 100) / lista.length) : null,
    filas: lista,
  }));
}

// alumno: solo los de ese alumno (o null: todos). → { materias, alumnos, enCurso }.
export function examenesTestGuide(db, paquete, { alumno = null } = {}) {
  const id = Number.isSafeInteger(alumno) && alumno > 0 ? alumno : null;
  const filas = db.prepare(`SELECT i.id, i.usuario_id, i.materia, i.total, i.aciertos, i.aprobado, i.empezado_en, i.terminado_en, u.nombre, u.nombre_visible
    FROM academia_intentos i JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.tipo = 'examen' AND i.terminado_en IS NOT NULL AND (? IS NULL OR i.usuario_id = ?) AND (? IS NOT NULL OR u.eliminado_en IS NULL)
    ORDER BY i.terminado_en DESC, i.id DESC LIMIT ?`).all(id, id, id, MAXIMO_FILAS).map(f => ({
    intento: f.id, materia: f.materia, alumno: { id: f.usuario_id, nombre: f.nombre_visible || f.nombre },
    fecha: f.terminado_en, pct: pct(f.aciertos, f.total), aciertos: f.aciertos, total: f.total, aprobado: f.aprobado === 1,
    segundos: Math.max(0, Math.round((Date.parse(f.terminado_en) - Date.parse(f.empezado_en)) / 1000)) || 0,
    directo: saltoDeIntento(db, f.usuario_id, f.id) != null,
  }));
  const alumnos = db.prepare(`SELECT DISTINCT u.id, u.nombre, u.nombre_visible FROM academia_intentos i JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.tipo = 'examen' AND i.terminado_en IS NOT NULL AND u.eliminado_en IS NULL ORDER BY COALESCE(u.nombre_visible, u.nombre)`).all().map(u => ({ id: u.id, nombre: u.nombre_visible || u.nombre }));
  const enCurso = db.prepare("SELECT COUNT(*) AS n FROM academia_intentos WHERE tipo = 'examen' AND terminado_en IS NULL AND (? IS NULL OR usuario_id = ?)").get(id, id).n;
  return { materias: agruparExamenes(filas, (paquete?.materias ?? []).map(m => m.id)), alumnos, enCurso };
}
