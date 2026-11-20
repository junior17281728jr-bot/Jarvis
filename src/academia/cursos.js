// Academia 0.14.79 (pedido del dueño): los «cursos» (grupos de alumnos). Migración 14: academia_cursos y usuarios.curso_id.
//  - Cada alumno es de UN curso. Los nombres por defecto son «Grupo Piloto 1», «Grupo Piloto 2»… y el administrador los
//    puede cambiar. Un curso nunca se borra: se archiva (y se puede volver a abrir).
//  - SEPARADO por curso: la lista de alumnos (con el filtro del administrador), las notas, el grupo y la carrera de
//    Progreso, y las tablas, la galería, las reacciones y los comentarios de la Competencia. Los cursos no se mezclan.
//  - DE TODOS (no lleva curso, a propósito): los paquetes y las clases, las explicaciones guardadas de la IA, las voces
//    guardadas, «dónde más cuesta», los votos, las explicaciones promovidas y todo lo que el sistema aprende.
//  - Mover a un alumno de curso solo cambia usuarios.curso_id: su progreso, sus notas y sus intentos siguen igual (las
//    tablas los leen por su cuenta, así que van con él a su curso nuevo).
//  - El administrador que también estudia es de su curso (el que tenga) como cualquiera; las pantallas del administrador
//    ven todos los cursos, cada fila con el nombre de su curso, y un filtro «Todos los cursos» / cada curso.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';

export const PREFIJO = 'Grupo Piloto';
export const LARGO_NOMBRE = 60;
const iso = ms => new Date(ms).toISOString();

// Un nombre de curso: sin saltos ni caracteres raros, de 1 a 60 letras.
export function limpiarNombreCurso(nombre) {
  const n = String(nombre ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n || [...n].length > LARGO_NOMBRE) throw new ErrorHttp(400, 'curso_nombre_no_valido');
  return n;
}

const fila = f => ({ id: f.id, nombre: f.nombre, creadoEn: f.creado_en, archivado: f.archivado_en != null, archivadoEn: f.archivado_en ?? null });

// Todos los cursos (los activos primero, del más nuevo al más viejo; después los archivados), con cuántos alumnos tiene
// cada uno (sin administradores ni cuentas eliminadas). Una consulta.
export function listarCursos(db) {
  return db.prepare(`SELECT c.id, c.nombre, c.creado_en, c.archivado_en,
      (SELECT COUNT(*) FROM usuarios u WHERE u.curso_id = c.id AND u.rol <> 'admin' AND u.eliminado_en IS NULL) AS alumnos
    FROM academia_cursos c ORDER BY (c.archivado_en IS NOT NULL), c.id DESC`).all().map(f => ({ ...fila(f), alumnos: f.alumnos }));
}

// → Map id → nombre (todos, también los archivados).
export function nombresDeCursos(db) {
  return new Map(db.prepare('SELECT id, nombre FROM academia_cursos').all().map(f => [f.id, f.nombre]));
}

// El curso que se propone para una cuenta nueva: el activo más nuevo (si todos están archivados, el más nuevo).
export function cursoPorDefecto(db) {
  return db.prepare('SELECT id FROM academia_cursos ORDER BY (archivado_en IS NOT NULL), id DESC LIMIT 1').get()?.id ?? 1;
}

// El nombre que se propone para un curso nuevo: «Grupo Piloto N», con N uno más que el número más alto ya usado (o que
// cuántos hay), así nunca se repite aunque se hayan renombrado algunos.
export function siguienteNombre(db) {
  let mayor = 0;
  const filas = db.prepare('SELECT nombre FROM academia_cursos').all();
  for (const f of filas) {
    const m = /^grupo piloto (\d{1,6})$/i.exec(f.nombre.trim());
    if (m) mayor = Math.max(mayor, Number(m[1]));
  }
  return `${PREFIJO} ${Math.max(mayor, filas.length) + 1}`;
}

function buscar(db, id) {
  const n = Number(id);
  const f = Number.isSafeInteger(n) && n > 0 ? db.prepare('SELECT id, nombre, creado_en, archivado_en FROM academia_cursos WHERE id = ?').get(n) : null;
  if (!f) throw new ErrorHttp(404, 'curso_no_existe');
  return f;
}
function repetido(db, nombre, salvoId = 0) {
  return Boolean(db.prepare('SELECT 1 FROM academia_cursos WHERE nombre = ? COLLATE NOCASE AND id <> ?').get(nombre, salvoId));
}

export function crearCurso(db, { nombre = null, hechoPor = null } = {}, ahoraMs = Date.now()) {
  return enTransaccion(db, () => {
    const n = nombre == null || String(nombre).trim() === '' ? siguienteNombre(db) : limpiarNombreCurso(nombre);
    if (repetido(db, n)) throw new ErrorHttp(409, 'curso_repetido');
    const id = Number(db.prepare('INSERT INTO academia_cursos (nombre, creado_en) VALUES (?, ?)').run(n, iso(ahoraMs)).lastInsertRowid);
    auditar(db, { usuarioId: hechoPor, accion: 'curso_creado', detalle: JSON.stringify({ id, nombre: n }) });
    return fila(buscar(db, id));
  });
}

export function renombrarCurso(db, id, nombre, { hechoPor = null } = {}) {
  return enTransaccion(db, () => {
    const c = buscar(db, id);
    const n = limpiarNombreCurso(nombre);
    if (repetido(db, n, c.id)) throw new ErrorHttp(409, 'curso_repetido');
    db.prepare('UPDATE academia_cursos SET nombre = ? WHERE id = ?').run(n, c.id);
    auditar(db, { usuarioId: hechoPor, accion: 'curso_renombrado', detalle: JSON.stringify({ id: c.id, antes: c.nombre, nombre: n }) });
    return fila(buscar(db, c.id));
  });
}

// Archivar (o volver a abrir). Nunca se borra. No se archiva el último curso activo: las cuentas nuevas necesitan uno.
// Sus alumnos siguen en él (entran y estudian igual); solo deja de proponerse para las cuentas nuevas y para mover.
export function archivarCurso(db, id, archivado, { hechoPor = null } = {}, ahoraMs = Date.now()) {
  if (typeof archivado !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  return enTransaccion(db, () => {
    const c = buscar(db, id);
    if (archivado && c.archivado_en == null) {
      const activos = db.prepare('SELECT COUNT(*) AS n FROM academia_cursos WHERE archivado_en IS NULL').get().n;
      if (activos <= 1) throw new ErrorHttp(409, 'curso_ultimo_activo');
      db.prepare('UPDATE academia_cursos SET archivado_en = ? WHERE id = ?').run(iso(ahoraMs), c.id);
    } else if (!archivado && c.archivado_en != null) {
      db.prepare('UPDATE academia_cursos SET archivado_en = NULL WHERE id = ?').run(c.id);
    }
    auditar(db, { usuarioId: hechoPor, accion: archivado ? 'curso_archivado' : 'curso_abierto', detalle: JSON.stringify({ id: c.id, nombre: c.nombre }) });
    return fila(buscar(db, c.id));
  });
}

// Mover una cuenta a otro curso (activo). Solo cambia su curso: nada de su progreso se toca.
export function moverAlumno(db, usuarioId, cursoId, { hechoPor = null } = {}) {
  return enTransaccion(db, () => {
    const id = Number(usuarioId);
    const u = Number.isSafeInteger(id) && id > 0 ? db.prepare('SELECT id, nombre, curso_id FROM usuarios WHERE id = ? AND eliminado_en IS NULL').get(id) : null;
    if (!u) throw new ErrorHttp(404, 'no_existe');
    const c = buscar(db, cursoId);
    if (c.archivado_en != null && c.id !== u.curso_id) throw new ErrorHttp(409, 'curso_archivado');
    if (c.id !== u.curso_id) {
      db.prepare('UPDATE usuarios SET curso_id = ? WHERE id = ?').run(c.id, u.id);
      auditar(db, { usuarioId: hechoPor, accion: 'alumno_movido_de_curso', detalle: JSON.stringify({ alumno: u.id, de: u.curso_id, a: c.id }) });
    }
    return { id: u.id, curso: { id: c.id, nombre: c.nombre } };
  });
}

// Para una cuenta nueva: el curso pedido (debe existir y estar activo) o, sin pedir, el de por defecto.
export function cursoParaCuentaNueva(db, cursoId) {
  if (cursoId == null || cursoId === '') return cursoPorDefecto(db);
  const c = buscar(db, cursoId);
  if (c.archivado_en != null) throw new ErrorHttp(409, 'curso_archivado');
  return c.id;
}

// El curso de una cuenta. → { id, nombre }
export function cursoDe(db, usuarioId) {
  const f = db.prepare('SELECT c.id, c.nombre FROM usuarios u JOIN academia_cursos c ON c.id = u.curso_id WHERE u.id = ?').get(Number(usuarioId));
  return f ? { id: f.id, nombre: f.nombre } : null;
}
export function cursoIdDe(db, usuarioId) {
  return db.prepare('SELECT curso_id AS c FROM usuarios WHERE id = ?').get(Number(usuarioId))?.c ?? null;
}

// → Map usuarioId → { id, nombre } de TODAS las cuentas, en una consulta (para poner el curso en cada fila).
export function cursoDeCadaUno(db) {
  const nombres = nombresDeCursos(db);
  return new Map(db.prepare('SELECT id, curso_id FROM usuarios').all().map(f => [f.id, { id: f.curso_id, nombre: nombres.get(f.curso_id) ?? `${PREFIJO} ${f.curso_id}` }]));
}

// Le pone «curso» a cada fila de una lista (por su campo de usuario). No cambia nada más.
// «enCurso» (y no «curso»: los certificados ya usan «curso» para tg/oral/compe).
export function conCurso(lista, mapa, campo = 'id') {
  return lista.map(x => ({ ...x, enCurso: mapa.get(Number(x[campo])) ?? null }));
}
// Lo que las listas del administrador llevan para su filtro: los cursos (para el selector) y el curso de cada fila.
export function cursosParaFiltro(db) {
  return listarCursos(db).map(c => ({ id: c.id, nombre: c.nombre, archivado: c.archivado, alumnos: c.alumnos }));
}

// El filtro del administrador (?curso=N de una dirección): null = todos; si no, el id de un curso que existe.
// Un curso que ya no existe (un filtro viejo recordado en el navegador) cuenta como «todos».
export function filtroCurso(db, req) {
  const v = new URL(req.url, 'http://x').searchParams.get('curso');
  if (v == null || v === '' || v === 'todos') return null;
  try { return buscar(db, v).id; } catch { return null; }
}
