// Pruebas de la Academia 0.14.79: los «cursos» (src/academia/cursos.js, src/api/cursos.js, public/admin-cursos.js,
// migración 14). Reloj fijo, sin internet, sin IA de verdad. Lo que se cuida:
//  - La migración: las cuentas que ya existían quedan TODAS en «Grupo Piloto 1» (creado solo), sin perder nada.
//  - Crear («Grupo Piloto N», el que sigue), cambiar el nombre y archivar (nunca borrar).
//  - El curso al crear una cuenta (el elegido o el activo más nuevo) y mover a un alumno (su progreso no se toca).
//  - El filtro de cada lista (Alumnos, Cómo van, Notas por materia y su CSV, Certificados, Reporte, Comparar un examen).
//  - Lo de cada curso no se mezcla: el grupo, la carrera y la Competencia (tablas, galería, reacciones y comentarios).
//  - Lo de todos sigue siendo de todos: una explicación guardada para un alumno del curso 1 le sirve a uno del curso 2.
//  - Un alumno recibe 403 en las rutas de los cursos; el administrador sigue fuera donde ya estaba fuera.
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import {
  listarCursos, crearCurso, renombrarCurso, archivarCurso, moverAlumno, cursoPorDefecto, siguienteNombre, cursoDe, cursoParaCuentaNueva,
} from '../src/academia/cursos.js';
import { grupoDe } from '../src/academia/plan.js';
import { encenderGrupo } from '../src/academia/progreso.js';
import { carreraDe, corredores } from '../src/academia/carrera.js';
import { tablaRonda, tablaGeneral, galeria, resumenCompetencia, resumenAdmin, SEMILLA, LETRAS } from '../src/academia/competencia.js';
import { resumenPorMateria } from '../src/academia/resumen-materias.js';
import { compararExamen } from '../src/academia/como-van.js';
import { reporteAcademia } from '../src/academia/reporte.js';
import { MATERIAS, MATERIAS_ORAL } from '../src/academia/formato.js';
import { filtrarPorCurso, leerFiltro, guardarFiltro, filtroValido, datosDelCurso, consultaCurso, nombreCursoFila, TODOS, CLAVE_FILTRO } from '../public/admin-cursos.js';
import { csvResumen } from '../public/admin-resumen.js';
import { paraHoy, cursosDeHoy, AREAS_ADMIN, areaAdmin } from '../public/navegacion.js';
import { conInstructor, pedir as pedirInstructor, unaMala, explicar, explicacionFalsa, DE, pedidosIa } from './instructor-ia-base.js';
import { guardarConfigIa } from '../src/ia/config.js';

const AHORA = Date.parse('2026-11-20T15:00:00Z');
const CLAVE = 'una clave bien larga';
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const t = (k, v = {}) => String(es[k] ?? k).replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, x, uno, varios) => (Number(v[x]) === 1 ? uno : varios)).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
const nombreMateria = id => es[`acad.materia.${id}`] ?? id;

const PAQUETE = {
  materias: MATERIAS.map(id => (id === 'factores_humanos'
    ? { id, temas: [{ id: 't1', titulo: 'Tema uno', preguntas: ['q1', 'q2'] }, { id: 't2', titulo: 'Tema dos', preguntas: ['q3', 'q4'] }] }
    : { id, temas: [] })),
  oral: { hay: false, materias: [] },
  preguntas: new Map(), deTema: new Map(),
};
const base = () => abrirBase(configDePrueba());
const nuevo = (db, nombre, extra = {}) => crearUsuario(db, { nombre, nombreVisible: `${nombre[0].toUpperCase()}${nombre.slice(1)} Pérez`, claveHash: 'x', debeCambiarClave: false, ...extra });
const cursoId = (db, id) => db.prepare('SELECT curso_id AS c FROM usuarios WHERE id = ?').get(id).c;
const iso = ms => new Date(ms).toISOString();
function examen(db, usuario, aciertos, total = 2, terminado = '2026-11-19T12:00:00.000Z') {
  const id = Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, 'examen', 'factores_humanos', NULL, ?, ?, ?, ?, ?, ?, '[]')`).run(usuario, total, total, aciertos, aciertos === total ? 1 : 0, terminado, terminado).lastInsertRowid);
  for (let i = 0; i < total; i++) {
    db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
      VALUES (?, ?, ?, 'factores_humanos', 't1', 'A', ?, '2026-11-19', ?)`).run(id, usuario, `q${i + 1}`, i < aciertos ? 1 : 0, terminado);
  }
  return id;
}

// ---------- La migración ----------
test('migración 14: las cuentas que ya existían quedan todas en «Grupo Piloto 1» (creado solo), y no se pierde nada', () => {
  const config = configDePrueba();
  // Una base de antes (hasta la 13) con un administrador, dos alumnos y su progreso.
  const vieja = abrirBase(config, MIGRACIONES.filter(m => m.id <= 13));
  const junior = crearUsuario(vieja, { nombre: 'junior', claveHash: 'x', rol: 'admin', debeCambiarClave: false });
  const ana = crearUsuario(vieja, { nombre: 'ana', claveHash: 'x', debeCambiarClave: false });
  const beto = crearUsuario(vieja, { nombre: 'beto', claveHash: 'x', debeCambiarClave: false });
  examen(vieja, ana, 2);
  examen(vieja, beto, 1);
  const antes = {
    usuarios: vieja.prepare('SELECT id, nombre, clave_hash, rol, activo, creado_en FROM usuarios ORDER BY id').all(),
    intentos: vieja.prepare('SELECT * FROM academia_intentos ORDER BY id').all(),
    respuestas: vieja.prepare('SELECT * FROM academia_respuestas ORDER BY id').all(),
  };
  assert.equal(vieja.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name = 'academia_cursos'").get().n, 0);
  vieja.close();
  // La versión nueva la abre: aplica la 14.
  const db = abrirBase(config);
  assert.equal(db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 14);
  assert.deepEqual(listarCursos(db).map(c => [c.id, c.nombre, c.archivado, c.alumnos]), [[1, 'Grupo Piloto 1', false, 2]]);
  assert.deepEqual(db.prepare('SELECT id, curso_id FROM usuarios ORDER BY id').all().map(f => [f.id, f.curso_id]), [[junior, 1], [ana, 1], [beto, 1]]);
  assert.deepEqual(db.prepare('SELECT id, nombre, clave_hash, rol, activo, creado_en FROM usuarios ORDER BY id').all(), antes.usuarios, 'las cuentas, igual');
  assert.deepEqual(db.prepare('SELECT * FROM academia_intentos ORDER BY id').all(), antes.intentos, 'los intentos, igual');
  assert.deepEqual(db.prepare('SELECT * FROM academia_respuestas ORDER BY id').all(), antes.respuestas, 'las respuestas, igual');
  assert.deepEqual(cursoDe(db, ana), { id: 1, nombre: 'Grupo Piloto 1' });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
  // La migración solo agrega (sin CHECK, sin UNIQUE) y el curso 1 no se repite si el SQL corre otra vez.
  const m = MIGRACIONES.find(x => x.id === 14);
  assert.equal(m.nombre, 'academia_cursos');
  assert.doesNotMatch(m.sql, /\bCHECK\b|\bUNIQUE\b|\bREFERENCES\b/);
  const otra = new DatabaseSync(':memory:');
  otra.exec('CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT)');
  otra.exec(m.sql);
  otra.exec(m.sql.replace(/^ALTER TABLE.*$/m, ''));
  assert.equal(otra.prepare('SELECT COUNT(*) AS n FROM academia_cursos').get().n, 1);
  otra.close();
});

// ---------- Crear, cambiar el nombre y archivar ----------
test('crear («Grupo Piloto N», el que sigue), cambiar el nombre y archivar; nunca se borra', () => {
  const db = base();
  assert.equal(siguienteNombre(db), 'Grupo Piloto 2');
  const c2 = crearCurso(db, {}, AHORA);
  assert.deepEqual([c2.id, c2.nombre, c2.archivado, c2.creadoEn], [2, 'Grupo Piloto 2', false, iso(AHORA)]);
  assert.equal(cursoPorDefecto(db), 2, 'el activo más nuevo');
  const c3 = crearCurso(db, { nombre: '  Grupo   de la tarde ' }, AHORA);
  assert.equal(c3.nombre, 'Grupo de la tarde');
  assert.equal(siguienteNombre(db), 'Grupo Piloto 4', 'cuenta los que hay aunque uno tenga otro nombre');
  assert.throws(() => crearCurso(db, { nombre: 'grupo piloto 2' }), { codigo: 409, message: 'curso_repetido' });
  assert.throws(() => crearCurso(db, { nombre: 'x'.repeat(61) }), { codigo: 400 });
  // Cambiar el nombre.
  assert.equal(renombrarCurso(db, 1, 'Mañana 2026').nombre, 'Mañana 2026');
  assert.throws(() => renombrarCurso(db, 1, 'Grupo de la tarde'), { codigo: 409 });
  assert.throws(() => renombrarCurso(db, 99, 'Otro'), { codigo: 404 });
  assert.equal(siguienteNombre(db), 'Grupo Piloto 4');
  // Archivar: sale de «por defecto»; se puede volver a abrir; el último activo no se archiva.
  assert.equal(archivarCurso(db, 3, true, {}, AHORA).archivado, true);
  assert.equal(cursoPorDefecto(db), 2);
  archivarCurso(db, 2, true, {}, AHORA);
  assert.throws(() => archivarCurso(db, 1, true, {}, AHORA), { codigo: 409, message: 'curso_ultimo_activo' });
  assert.equal(cursoPorDefecto(db), 1);
  assert.equal(archivarCurso(db, 2, false).archivado, false);
  assert.equal(cursoPorDefecto(db), 2);
  assert.throws(() => cursoParaCuentaNueva(db, 3), { codigo: 409, message: 'curso_archivado' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_cursos').get().n, 3, 'nada se borró');
  assert.deepEqual(listarCursos(db).map(c => c.id), [2, 1, 3], 'los activos primero (del más nuevo), después los archivados');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion LIKE 'curso\\_%' ESCAPE '\\'").get().n >= 5, 'cada cambio queda en la auditoría');
  db.close();
});

// ---------- Las rutas: crear una cuenta con su curso, mover, y 403 para un alumno ----------
async function pedir(urlBase, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${urlBase}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
async function conServidorDeCursos(fn) {
  const reloj = { ahora: AHORA };
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora } });
  await conServidor(servidor, async url => {
    const admin = await pedir(url, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const entrar = async nombre => (await pedir(url, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    await fn({ url, db, admin: admin.galleta, entrar, reloj });
  });
  db.close();
}

test('rutas de los cursos: 401 sin sesión, 403 a un alumno (sin datos), y el administrador crea, renombra, archiva y mueve', async () => {
  await conServidorDeCursos(async ({ url, db, admin, entrar }) => {
    const ana = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const g = await entrar('ana');
    const rutas = [['GET', '/api/admin/academia/cursos'], ['POST', '/api/admin/academia/cursos', {}], ['POST', '/api/admin/academia/cursos/1/nombre', { nombre: 'X' }],
      ['POST', '/api/admin/academia/cursos/1/archivar', { archivado: true }], ['POST', `/api/admin/academia/alumnos/${ana}/curso`, { curso: 1 }]];
    for (const [m, r, datos] of rutas) {
      assert.equal((await pedir(url, m, r, { datos })).codigo, 401, r);
      const p = await pedir(url, m, r, { datos, galleta: g });
      assert.equal(p.codigo, 403, r);
      assert.deepEqual(Object.keys(p.datos), ['error'], `${r}: un 403 no lleva datos`);
    }
    assert.equal(listarCursos(db).length, 1, 'el alumno no creó nada');
    assert.equal(listarCursos(db)[0].nombre, 'Grupo Piloto 1');
    // El administrador.
    let r = await pedir(url, 'GET', '/api/admin/academia/cursos', { galleta: admin });
    assert.equal(r.codigo, 200);
    assert.deepEqual([r.datos.porDefecto, r.datos.siguiente, r.datos.cursos.length], [1, 'Grupo Piloto 2', 1]);
    r = await pedir(url, 'POST', '/api/admin/academia/cursos', { galleta: admin, datos: {} });
    assert.equal(r.codigo, 201);
    assert.deepEqual([r.datos.curso.nombre, r.datos.porDefecto], ['Grupo Piloto 2', 2]);
    r = await pedir(url, 'POST', '/api/admin/academia/cursos/2/nombre', { galleta: admin, datos: { nombre: 'Noche' } });
    assert.equal(r.datos.curso.nombre, 'Noche');
    assert.equal((await pedir(url, 'POST', '/api/admin/academia/cursos/2/nombre', { galleta: admin, datos: { nombre: '' } })).codigo, 400);
    // Crear una cuenta: sin curso, al activo más nuevo; con curso, a ese; uno archivado o que no existe, no.
    r = await pedir(url, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'beto', rol: 'usuario' } });
    assert.equal(r.codigo, 201);
    assert.deepEqual(r.datos.curso, { id: 2, nombre: 'Noche' }, 'el activo más nuevo (y la pantalla lo pone en el mensaje)');
    r = await pedir(url, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'carla', rol: 'usuario', curso: 1 } });
    assert.deepEqual(r.datos.curso, { id: 1, nombre: 'Grupo Piloto 1' });
    assert.equal(cursoId(db, r.datos.id), 1);
    assert.equal((await pedir(url, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'dani', rol: 'usuario', curso: 9 } })).codigo, 404);
    assert.equal((await pedir(url, 'POST', '/api/admin/academia/cursos/2/archivar', { galleta: admin, datos: { archivado: true } })).codigo, 200);
    assert.equal((await pedir(url, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'dani', rol: 'usuario', curso: 2 } })).codigo, 409);
    assert.equal((await pedir(url, 'POST', '/api/admin/academia/cursos/2/archivar', { galleta: admin, datos: { archivado: false } })).codigo, 200);
    // Mover a Ana (con progreso) al curso 2: su progreso sigue igual.
    examen(db, ana, 2);
    const progreso = db.prepare('SELECT * FROM academia_intentos WHERE usuario_id = ? ORDER BY id').all(ana);
    r = await pedir(url, 'POST', `/api/admin/academia/alumnos/${ana}/curso`, { galleta: admin, datos: { curso: 2 } });
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos, { id: ana, curso: { id: 2, nombre: 'Noche' } });
    assert.equal(cursoId(db, ana), 2);
    assert.deepEqual(db.prepare('SELECT * FROM academia_intentos WHERE usuario_id = ? ORDER BY id').all(ana), progreso);
    assert.equal((await pedir(url, 'POST', `/api/admin/academia/alumnos/${ana}/curso`, { galleta: admin, datos: { curso: 7 } })).codigo, 404);
    // Su ficha dice su curso; su Progreso, el nombre de su curso.
    const ficha = await pedir(url, 'GET', `/api/admin/academia/alumnos/${ana}/ficha`, { galleta: admin });
    assert.deepEqual(ficha.datos.curso, { id: 2, nombre: 'Noche' });
    assert.deepEqual(ficha.datos.cursos.map(c => c.id), [2, 1]);
    const prog = await pedir(url, 'GET', '/api/academia/progreso', { galleta: g });
    assert.deepEqual(prog.datos.miCurso, { id: 2, nombre: 'Noche' });
    // Las listas del administrador traen el curso de cada fila (enCurso) y los cursos (el administrador no sale en Notas por materia).
    const lista = await pedir(url, 'GET', '/api/admin/academia/alumnos', { galleta: admin });
    assert.deepEqual(lista.datos.cursos.map(c => [c.id, c.alumnos]), [[2, 2], [1, 1]]);
    const de = (filas, nombre) => filas.find(a => a.nombre === nombre)?.enCurso;
    assert.deepEqual(de(lista.datos.alumnos, 'ana'), { id: 2, nombre: 'Noche' });
    assert.deepEqual(de(lista.datos.alumnos, 'carla'), { id: 1, nombre: 'Grupo Piloto 1' });
    for (const ruta of ['/api/admin/academia/como-van', '/api/admin/academia/notas-materia']) {
      const x = await pedir(url, 'GET', ruta, { galleta: admin });
      assert.equal(x.codigo, 200, ruta);
      assert.deepEqual(x.datos.alumnos.map(a => [a.nombre, a.enCurso.id]).sort(), [['ana', 2], ['beto', 2], ['carla', 1]], ruta);
      assert.ok(Array.isArray(x.datos.cursos), ruta);
    }
    // El Reporte: con curso, solo sus alumnos.
    const rep2 = await pedir(url, 'GET', '/api/admin/academia/reporte?secciones=alumnos&curso=2', { galleta: admin });
    assert.equal(rep2.codigo, 200);
    assert.deepEqual(rep2.datos.alumnos.map(a => a.nombre).sort(), ['ana', 'beto']);
    const repTodos = await pedir(url, 'GET', '/api/admin/academia/reporte?secciones=alumnos', { galleta: admin });
    assert.deepEqual(repTodos.datos.alumnos.map(a => a.nombre).sort(), ['ana', 'beto', 'carla']);
    const guardadas = await pedir(url, 'POST', '/api/admin/academia/reporte/opciones', { galleta: admin, datos: { secciones: ['alumnos'], curso: 2 } });
    assert.equal(guardadas.datos.opciones.curso, 2, 'el curso del reporte se recuerda');
    assert.equal((await pedir(url, 'POST', '/api/admin/academia/reporte/opciones', { galleta: admin, datos: { secciones: ['alumnos'], curso: 'x' } })).codigo, 400);
    // Los certificados: cada uno con el curso de su alumno.
    const certs = await pedir(url, 'GET', '/api/admin/academia/certificados', { galleta: admin });
    assert.equal(certs.codigo, 200);
    assert.ok(Array.isArray(certs.datos.cursos));
  });
});

// ---------- Los filtros (la pantalla) ----------
test('el filtro de curso: se recuerda (y sin almacenamiento, «Todos»), filtra las filas, el CSV y las demás listas', () => {
  const almacen = new Map();
  const falso = { getItem: k => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: k => almacen.delete(k) };
  assert.equal(leerFiltro(falso), TODOS);
  guardarFiltro(2, falso);
  assert.equal(almacen.get(CLAVE_FILTRO), '2');
  assert.equal(leerFiltro(falso), 2);
  guardarFiltro(TODOS, falso);
  assert.equal(leerFiltro(falso), TODOS);
  const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
  assert.equal(leerFiltro(roto), TODOS, 'en una ventana privada: «Todos los cursos»');
  assert.doesNotThrow(() => guardarFiltro(3, roto));
  const cursos = [{ id: 2, nombre: 'Grupo Piloto 2' }, { id: 1, nombre: 'Grupo Piloto 1' }];
  assert.equal(filtroValido(2, cursos), 2);
  assert.equal(filtroValido(9, cursos), TODOS, 'un curso que ya no existe vuelve a «Todos»');
  const filas = [{ id: 1, enCurso: cursos[1] }, { id: 2, enCurso: cursos[0] }, { id: 3, enCurso: cursos[1] }];
  assert.deepEqual(filtrarPorCurso(filas, 1).map(x => x.id), [1, 3]);
  assert.deepEqual(filtrarPorCurso(filas, 2).map(x => x.id), [2]);
  assert.deepEqual(filtrarPorCurso(filas, TODOS).map(x => x.id), [1, 2, 3]);
  // Los certificados (su lista se llama «certificados» y su curso tg/oral va en «curso»: el del alumno es enCurso).
  const certs = { certificados: [{ usuarioId: 1, curso: 'tg', enCurso: cursos[1] }, { usuarioId: 2, curso: 'compe', enCurso: cursos[0] }] };
  assert.deepEqual(datosDelCurso(certs, 2, 'certificados').certificados.map(c => c.usuarioId), [2]);
  assert.equal(consultaCurso(2), '?curso=2');
  assert.equal(consultaCurso(2, false), '&curso=2');
  assert.equal(consultaCurso(TODOS), '');
  assert.equal(nombreCursoFila(filas[0], cursos), 'Grupo Piloto 1');
  assert.equal(nombreCursoFila(filas[0], [cursos[1]]), '', 'con un solo curso no hace falta decirlo');
  // Notas por materia: el CSV lleva solo los alumnos del curso elegido.
  const db = base();
  crearCurso(db, {}, AHORA);
  const ana = nuevo(db, 'ana', { cursoId: 1 });
  const beto = nuevo(db, 'beto', { cursoId: 2 });
  examen(db, ana, 2);
  examen(db, beto, 1);
  const mapa = new Map(listarCursos(db).map(c => [c.id, { id: c.id, nombre: c.nombre }]));
  const d = resumenPorMateria(db, PAQUETE, AHORA);
  d.alumnos = d.alumnos.map(a => ({ ...a, enCurso: mapa.get(cursoId(db, a.id)) }));
  const csv1 = csvResumen(datosDelCurso(d, 1), t, nombreMateria);
  const csv2 = csvResumen(datosDelCurso(d, 2), t, nombreMateria);
  assert.match(csv1, /Ana Pérez;Grupo Piloto 1;100 %/);
  assert.doesNotMatch(csv1, /Beto/);
  assert.match(csv2, /Beto Pérez;Grupo Piloto 2;50 %/);
  assert.doesNotMatch(csv2, /Ana/);
  // Comparar un examen y el reporte, del lado del servidor.
  assert.deepEqual(compararExamen(db, PAQUETE, 'factores_humanos', { curso: 1 }).alumnos.map(a => a.id), [ana]);
  assert.deepEqual(compararExamen(db, PAQUETE, 'factores_humanos', { curso: 2 }).alumnos.map(a => a.id), [beto]);
  assert.equal(compararExamen(db, PAQUETE, 'factores_humanos').alumnos.length, 2);
  assert.deepEqual(reporteAcademia(db, PAQUETE, { secciones: ['alumnos'], curso: 2 }, AHORA).alumnos.map(a => a.id), [beto]);
  db.close();
});

test('«Para hoy» sigue siendo de todos los cursos, y cada cosa dice de qué curso son sus alumnos', () => {
  const semana = 8 * 24 * 3_600_000;
  const quieto = (id, curso) => ({ id, nombre: `a${id}`, rol: 'usuario', activo: true, enLinea: false, ultimaActividad: iso(AHORA - semana), enCurso: curso });
  const lista = paraHoy({ alumnos: [quieto(1, { id: 1, nombre: 'Grupo Piloto 1' }), quieto(2, { id: 2, nombre: 'Grupo Piloto 2' }), quieto(3, { id: 1, nombre: 'Grupo Piloto 1' })], ahora: AHORA });
  const item = lista.find(x => x.id === 'sin-estudiar');
  assert.equal(item.n, 3, 'los de todos los cursos');
  assert.equal(item.curso, 'Grupo Piloto 1, Grupo Piloto 2');
  assert.deepEqual(cursosDeHoy([{ enCurso: null }]), {});
  // Sin cursos en las filas (como antes): igual que siempre.
  assert.equal(Object.hasOwn(paraHoy({ alumnos: [{ ...quieto(1), enCurso: undefined }], ahora: AHORA })[0], 'curso'), false);
});

// ---------- Lo de cada curso no se mezcla ----------
function dosCursos() {
  const db = base();
  crearCurso(db, {}, AHORA); // el 2
  const junior = crearUsuario(db, { nombre: 'junior', claveHash: 'x', rol: 'admin', debeCambiarClave: false, cursoId: 1 });
  const ana = nuevo(db, 'ana', { cursoId: 1 });
  const beto = nuevo(db, 'beto', { cursoId: 1 });
  const carla = nuevo(db, 'carla', { cursoId: 2 });
  const dario = nuevo(db, 'dario', { cursoId: 2 });
  return { db, junior, ana, beto, carla, dario };
}

test('el grupo y la carrera: cada alumno ve solo a los de su curso (y el administrador que no estudia sigue fuera)', () => {
  const { db, junior, ana, beto, carla, dario } = dosCursos();
  encenderGrupo(db, true);
  const nombres = (id, d = grupoDe(db, id, PAQUETE, AHORA)) => d.companeros.map(c => c.nombre).sort();
  assert.deepEqual(nombres(ana), ['Ana Pérez', 'Beto Pérez']);
  assert.deepEqual(nombres(carla), ['Carla Pérez', 'Dario Pérez']);
  assert.ok(!nombres(ana).some(n => /Junior|junior/.test(n)), 'el administrador que no estudia no sale');
  // La carrera: los de su curso (los alias «Piloto N» se cuentan dentro de su curso).
  const carrera = id => carreraDe(db, PAQUETE, id, AHORA).pilotos;
  assert.equal(carrera(ana).length, 2);
  assert.equal(carrera(carla).length, 2);
  assert.deepEqual(carrera(ana).filter(p => p.esYo).length, 1);
  assert.deepEqual(corredores(db, { curso: 2 }).map(u => u.id), [carla, dario]);
  assert.deepEqual(corredores(db).map(u => u.id), [ana, beto, carla, dario], 'el administrador que no estudia no corre');
  // El administrador que estudia corre en SU curso.
  examen(db, junior, 1);
  assert.deepEqual(corredores(db, { curso: 1 }).map(u => u.id), [junior, ana, beto]);
  assert.equal(carrera(carla).length, 2, 'no aparece en el curso 2');
  // Moverla: Carla pasa al curso 1 con su avance; desde ahí ve a los del 1.
  moverAlumno(db, carla, 1);
  assert.deepEqual(nombres(carla), ['Ana Pérez', 'Beto Pérez', 'Carla Pérez'], 'el administrador sale en el grupo solo si eligió un plan (como antes)');
  assert.deepEqual(nombres(dario), ['Dario Pérez']);
  db.close();
});

test('la Competencia: tablas, «jugaron», galería, reacciones y comentarios por curso; las rondas son las mismas para todos', () => {
  const { db, ana, beto, carla, dario } = dosCursos();
  const jugar = (id, aciertos, segundos, n = 1) => db.prepare(`INSERT INTO academia_compe_intentos (usuario_id, ronda, huella, total, actual, aciertos, segundos, empezado_en, terminado_en)
    VALUES (?, ?, 'h', 20, 20, ?, ?, ?, ?)`).run(id, n, aciertos, segundos, iso(AHORA - 60_000), iso(AHORA - segundos));
  jugar(ana, 15, 100);
  jugar(beto, 18, 90);
  jugar(carla, 20, 80);
  jugar(dario, 10, 70);
  const tabla = id => tablaRonda(db, 1, { yoId: id }).map(f => [f.puesto, f.esYo, f.aciertos]);
  assert.deepEqual(tabla(ana), [[1, false, 18], [2, true, 15]], 'Ana ve su curso: Beto primero, ella segunda');
  assert.deepEqual(tabla(carla), [[1, true, 20], [2, false, 10]], 'Carla es primera de SU curso');
  assert.deepEqual(tablaGeneral(db, { yoId: dario }).map(f => f.aciertos), [20, 10]);
  assert.ok(tablaRonda(db, 1, { yoId: ana }).every(f => f.usuarioId === undefined && f.enCurso === undefined), 'a un alumno nunca le llegan ids ni cursos');
  // Los alias «Piloto N» se cuentan dentro del curso (nunca dejan ver cuántos hay en otro).
  assert.deepEqual(resumenCompetencia(db, ana, AHORA).rondas[0].jugadores, 2);
  assert.deepEqual(resumenCompetencia(db, carla, AHORA).rondas[0].puesto, 1);
  // Las preguntas de la ronda son las mismas para todos los cursos.
  assert.equal(SEMILLA[1].preguntas.length, 20);
  assert.ok(LETRAS.length === 3);
  // El administrador: con filtro, un curso; sin filtro, todos, cada fila con su curso y los puestos dentro de su curso.
  const todos = tablaRonda(db, 1, { admin: true });
  assert.deepEqual(todos.map(f => [f.enCurso.nombre, f.puesto, f.aciertos]), [['Grupo Piloto 1', 1, 18], ['Grupo Piloto 1', 2, 15], ['Grupo Piloto 2', 1, 20], ['Grupo Piloto 2', 2, 10]]);
  assert.deepEqual(tablaRonda(db, 1, { admin: true, curso: 2 }).map(f => f.usuarioId), [carla, dario]);
  const adm = resumenAdmin(db, { curso: 1 });
  assert.equal(adm.curso, 1);
  assert.deepEqual(adm.general.map(f => f.usuarioId), [beto, ana]);
  assert.deepEqual(adm.cursos.map(c => c.id), [2, 1]);
  db.close();
});

test('la galería de la Competencia: cada alumno ve, reacciona y comenta solo en su curso (un código de otro curso: 404)', async () => {
  const reloj = { ahora: Date.parse('2026-11-18T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { reloj: () => reloj.ahora } });
  await conServidor(servidor, async url => {
    const a = await pedir(url, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    crearCurso(db, {}, reloj.ahora);
    const g = {};
    const ids = {};
    for (const [nombre, curso] of [['ana', 1], ['beto', 1], ['carla', 2]]) {
      ids[nombre] = crearUsuario(db, { nombre, nombreVisible: `${nombre} Pérez`, claveHash: await hashClave(CLAVE), debeCambiarClave: false, cursoId: curso });
      g[nombre] = (await pedir(url, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    // Cada uno juega la ronda 1 entera (las 20, todas buenas).
    for (const quien of ['ana', 'beto', 'carla']) {
      assert.equal((await pedir(url, 'POST', '/api/academia/competencia/1/empezar', { galleta: g[quien], datos: {} })).codigo, 200);
      for (let i = 0; i < 20; i++) {
        const v = await pedir(url, 'GET', '/api/academia/competencia/1', { galleta: g[quien] });
        const q = v.datos.actual;
        reloj.ahora += 3000;
        const r = await pedir(url, 'POST', '/api/academia/competencia/1/responder', { galleta: g[quien], datos: { pregunta: q.id, elegida: SEMILLA[1].preguntas.find(x => x.id === q.id).correcta } });
        assert.equal(r.codigo, 200);
      }
    }
    const galeriaDe = async quien => (await pedir(url, 'GET', '/api/academia/competencia/1/certificados', { galleta: g[quien] })).datos.certificados;
    const deAna = await galeriaDe('ana');
    const deCarla = await galeriaDe('carla');
    assert.equal(deAna.length, 2, 'Ana ve los de su curso (el suyo y el de Beto)');
    assert.equal(deCarla.length, 1, 'Carla solo el suyo');
    const codigoBeto = deAna.find(c => !c.esYo).codigo;
    const codigoCarla = deCarla[0].codigo;
    assert.ok(!deAna.some(c => c.codigo === codigoCarla));
    // Reaccionar y comentar: en su curso sí; en otro, como si no existiera.
    assert.equal((await pedir(url, 'POST', `/api/academia/competencia/1/certificados/${codigoBeto}/reaccion`, { galleta: g.ana, datos: { emoji: '👏' } })).codigo, 200);
    assert.equal((await pedir(url, 'POST', `/api/academia/competencia/1/certificados/${codigoCarla}/reaccion`, { galleta: g.ana, datos: { emoji: '👏' } })).codigo, 404);
    assert.equal((await pedir(url, 'POST', `/api/academia/competencia/1/certificados/${codigoBeto}/comentario`, { galleta: g.ana, datos: { texto: 'Bien hecho' } })).codigo, 201);
    assert.equal((await pedir(url, 'POST', `/api/academia/competencia/1/certificados/${codigoBeto}/comentario`, { galleta: g.carla, datos: { texto: 'Hola' } })).codigo, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_compe_comentarios').get().n, 1);
    // La tabla de la ronda: cada uno, la de su curso.
    assert.equal((await pedir(url, 'GET', '/api/academia/competencia/1/tabla', { galleta: g.carla })).datos.tabla.length, 1);
    // El administrador: todas, o las del filtro (?curso=N).
    const todas = await pedir(url, 'GET', '/api/admin/academia/competencia/1/certificados', { galleta: a.galleta });
    assert.equal(todas.datos.certificados.length, 3);
    const curso2 = await pedir(url, 'GET', '/api/admin/academia/competencia/1/certificados?curso=2', { galleta: a.galleta });
    assert.deepEqual(curso2.datos.certificados.map(c => c.usuarioId), [ids.carla]);
    const resumen = await pedir(url, 'GET', '/api/admin/academia/competencia?curso=1', { galleta: a.galleta });
    assert.deepEqual(resumen.datos.general.map(f => f.usuarioId).sort(), [ids.ana, ids.beto].sort());
    assert.equal((await pedir(url, 'GET', '/api/admin/academia/competencia?curso=99', { galleta: a.galleta })).datos.general.length, 3, 'un filtro viejo: todos');
  });
  db.close();
});

// ---------- Lo de todos sigue siendo de todos ----------
test('una explicación guardada para un alumno del curso 1 le sirve a uno del curso 2 (gratis, sin IA)', async () => {
  await conInstructor(async c => {
    // Zoelia (curso 1) la pide con IA: se guarda.
    const x = await unaMala(c, c.z, 'muestra-h1');
    const correcta = String(DE('muestra-h1').original.opciones.findIndex(o => o.letra === DE('muestra-h1').original.correcta) + 1);
    c.falso.siguiente(explicacionFalsa(correcta));
    const r = (await explicar(c, c.z, x)).datos;
    assert.equal((await c.hacer(r.ia.tarea)).estado, 'hecha');
    // Quirino pasa a un curso nuevo; la IA se apaga.
    const curso2 = crearCurso(c.db, {}, Date.parse('2026-11-20T12:00:00Z'));
    const quirino = c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'quirino'").get().id;
    const zoelia = c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'zoelia'").get().id;
    moverAlumno(c.db, quirino, curso2.id);
    assert.notEqual(cursoId(c.db, quirino), cursoId(c.db, zoelia));
    guardarConfigIa(c.db, { encendida: false }, { config: c.config, usuarioId: c.adminId });
    const pedidos = pedidosIa(c).length;
    const y = await unaMala(c, c.q, 'muestra-h1');
    const v = (await pedirInstructor(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.q, datos: { intento: y.intento.id, pregunta: y.pregunta.id, ia: false } })).datos;
    assert.equal(v.ia.estado, 'lista');
    assert.equal(v.ia.guardada, true, 'la de Zoelia, del otro curso');
    assert.match(v.ia.explicacion, /menos presión/);
    assert.equal(pedidosIa(c).length, pedidos, 'sin pedir nada a la IA');
  });
});

test('lo de todos no lleva curso: explicaciones, voces, paquetes, «dónde más cuesta», votos, «Para Claude» y lo que aprende el sistema', () => {
  for (const archivo of ['instructor-ia.js', 'saber-sin-ia.js', 'donde-cuesta.js', 'entendi.js', 'para-claude.js', 'oral-aprende.js', 'paquetes.js', 'oral-voz.js', 'fabrica-mejora.js']) {
    const texto = readFileSync(new URL(`../src/academia/${archivo}`, import.meta.url), 'utf8');
    assert.doesNotMatch(texto, /curso_id|cursos\.js/, `${archivo} no se parte por curso`);
  }
  const migracion = MIGRACIONES.find(m => m.id === 14).sql;
  assert.deepEqual([...migracion.matchAll(/ALTER TABLE (\w+)/g)].map(m => m[1]), ['usuarios'], 'solo las cuentas llevan curso');
});

// ---------- La pantalla ----------
test('la pantalla: «Cursos» en Alumnos, textos en los dos idiomas, sin HTML pegado ni estilos en línea, sin «cond ? x : null» en append', () => {
  const alumnos = AREAS_ADMIN.find(a => a.id === 'alumnos');
  assert.ok(alumnos.sub.some(x => x.id === 'cursos' && x.href === '#cursos'));
  assert.equal(areaAdmin('cursos').id, 'alumnos');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /seccion === 'cursos' && esAdmin\) return pantallaCursos\(\)/);
  assert.match(app, /id: 'campo-curso', name: 'curso'/, 'el formulario de crear una cuenta tiene «Curso»');
  const js = readFileSync(new URL('../public/admin-cursos.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|\.style\.|style:/);
  assert.doesNotMatch(js, /\.(?:append|replaceChildren)\([^)]*\?[^)]*:\s*null/);
  const claves = new Set([...js.matchAll(/'(cursos\.[a-z0-9_.]+)'/g)].map(m => m[1]));
  assert.ok(claves.size > 20);
  for (const k of [...claves, 'admin.sub.cursos', 'admin.linea.cursos', 'admin.nuevo.curso', 'admin.nuevo.curso.ayuda', 'admin.plantilla.curso', 'cursos.mio', 'reporte.curso',
    'error.curso_repetido', 'error.curso_ultimo_activo', 'error.curso_archivado', 'error.curso_no_existe', 'error.curso_nombre_no_valido', 'nm.banda.tg', 'nm.banda.oral', 'nm.col.oral_total', 'nm.col.curso']) {
    assert.ok(es[k], `es: ${k}`);
    assert.ok(en[k], `en: ${k}`);
  }
  assert.deepEqual(Object.keys(es).filter(k => k.startsWith('cursos.')).sort(), Object.keys(en).filter(k => k.startsWith('cursos.')).sort());
  // Los alumnos nunca bajan public/admin-cursos.js: solo lo importan pantallas del administrador.
  for (const archivo of ['certificado-vista.js', 'competencia-vista.js', 'carrera-vista.js', 'progreso-tablero.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../public/${archivo}`, import.meta.url), 'utf8'), /admin-cursos\.js/, archivo);
  }
  assert.ok(MATERIAS_ORAL.length === 9);
});
