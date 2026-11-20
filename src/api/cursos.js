// Academia 0.14.79: las rutas de los cursos (src/academia/cursos.js). TODAS solo para el administrador (403 a un alumno).
//  - GET  /api/admin/academia/cursos: la lista (con cuántos alumnos), el de por defecto y el nombre que se propone.
//  - POST /api/admin/academia/cursos { nombre? }: crear (sin nombre: «Grupo Piloto N», el que sigue).
//  - POST /api/admin/academia/cursos/:id/nombre { nombre }: cambiarle el nombre.
//  - POST /api/admin/academia/cursos/:id/archivar { archivado }: archivar o volver a abrir (nunca se borra).
//  - POST /api/admin/academia/alumnos/:id/curso { curso }: mover a un alumno (su progreso no se toca).
import { leerJson } from '../nucleo/http.js';
import { listarCursos, crearCurso, renombrarCurso, archivarCurso, moverAlumno, cursoPorDefecto, siguienteNombre } from '../academia/cursos.js';

export function registrarRutasCursos(rutas, { reloj = Date.now } = {}) {
  const vista = db => ({ cursos: listarCursos(db), porDefecto: cursoPorDefecto(db), siguiente: siguienteNombre(db) });
  rutas.agregar('GET', '/api/admin/academia/cursos', ({ db }) => ({ codigo: 200, datos: vista(db) }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/cursos', async ({ db, req, usuario }) => {
    const d = await leerJson(req);
    const curso = crearCurso(db, { nombre: d?.nombre ?? null, hechoPor: usuario.id }, reloj());
    return { codigo: 201, datos: { curso, ...vista(db) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/cursos/:id/nombre', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    const curso = renombrarCurso(db, parametros.id, d?.nombre, { hechoPor: usuario.id });
    return { codigo: 200, datos: { curso, ...vista(db) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/cursos/:id/archivar', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    const curso = archivarCurso(db, parametros.id, d?.archivado, { hechoPor: usuario.id }, reloj());
    return { codigo: 200, datos: { curso, ...vista(db) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/curso', async ({ db, req, usuario, parametros }) => {
    const d = await leerJson(req);
    return { codigo: 200, datos: moverAlumno(db, parametros.id, d?.curso, { hechoPor: usuario.id }) };
  }, { admin: true });
}
