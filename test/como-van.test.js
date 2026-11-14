// Pruebas de la Academia 0.13.5 (0.13.6: la nota general del curso): «Cómo van todos» (Administrador → Alumnos) y «Comparar un examen».
//  - Solo el administrador: 401 sin sesión, 403 para los alumnos (sin datos).
//  - En línea con un reloj falso (nada de esperas): visita de hace 2 min → en línea; de hace 4 min o cerrada → no.
//  - Exámenes: SOLO las notas de examen, por materia (mejor, última, aprobó) y los del oral (capítulos y final).
//  - Clases: temas aprobados por materia y el % de aciertos SIN las respuestas de los exámenes.
// Usa solo el paquete de MUESTRA (test/academia-muestra.js). Los intentos y respuestas se escriben directo en la base.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { anotarActividad, anotarFin } from '../src/cuentas/visitas.js';
import { comoVanTodos, enLineaTodos, examenesPorMateria, ordenarAlumnos } from '../src/academia/como-van.js';
import { examenesOralDe } from '../src/academia/oral.js';
import { notaGeneralDelCurso } from '../src/academia/progreso.js';
import { MATERIAS } from '../src/academia/formato.js';
import { ordenarComoVan, fallasPorTema, tonoExamen } from '../public/admin-alumnos.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const AHORA = Date.parse('2026-11-13T15:00:00Z');
const MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  // El reloj de las rutas, fijo: lo que dicen no depende de la hora de la máquina ni de lo lenta que sea.
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = {};
    for (const nombre of ['ana', 'beto', 'carla']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    await fn({ base, db, admin: admin.galleta, ana, ids });
  });
  db.close();
}
// Un intento terminado con sus respuestas (correctas: las letras de «bien»). → id del intento
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
function meterIntento(db, usuario, { tipo, tema = null, preguntas, bien, terminado, umbral = 80 }) {
  const aciertos = preguntas.filter(q => bien.includes(q)).length;
  const aprobado = tipo === 'examen' || tipo === 'tema' ? (aciertos * 100 >= umbral * preguntas.length ? 1 : 0) : null;
  const id = Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, ?, 'factores_humanos', ?, ?, ?, ?, ?, ?, ?, ?)`).run(usuario, tipo, tema, preguntas.length, preguntas.length, aciertos, aprobado, iso(Date.parse(terminado) - 10 * MIN), terminado, JSON.stringify(preguntas)).lastInsertRowid);
  for (const q of preguntas) {
    const c = DE(q).original.correcta;
    const elegida = bien.includes(q) ? c : ['A', 'B', 'C'].find(l => l !== c);
    db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, 'factores_humanos', ?, ?, ?, ?, ?)`)
      .run(id, usuario, q, DE(q).tema ?? tema ?? 'muestra-hipoxia', elegida, bien.includes(q) ? 1 : 0, terminado.slice(0, 10), terminado);
  }
  return id;
}
const H = ['muestra-h1', 'muestra-h2', 'muestra-h3', 'muestra-h4', 'muestra-h5'];
const V = ['muestra-v1', 'muestra-v2', 'muestra-v3', 'muestra-v4', 'muestra-v5'];

test('«Cómo van todos» y «Comparar un examen» son solo del administrador (401 sin sesión, 403 para los alumnos, sin datos)', async () => {
  await conAcademia(async ({ base, admin, ana }) => {
    for (const ruta of ['/api/admin/academia/como-van', '/api/admin/academia/como-van/en-linea', '/api/admin/academia/examenes/factores_humanos/comparar']) {
      const sin = await pedir(base, 'GET', ruta);
      assert.equal(sin.codigo, 401, ruta);
      const r = await pedir(base, 'GET', ruta, { galleta: ana });
      assert.equal(r.codigo, 403, ruta);
      assert.deepEqual(Object.keys(r.datos), ['error'], 'un 403 no lleva datos');
      assert.equal((await pedir(base, 'GET', ruta, { galleta: admin })).codigo, 200, ruta);
    }
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/examenes/no_existe/comparar', { galleta: admin })).codigo, 404);
  });
});

test('«Cómo van todos»: solo alumnos; exámenes por materia (mejor y última), clases sin los exámenes, plan, avance y tiempo', async () => {
  await conAcademia(async ({ base, db, admin, ids }) => {
    // Ana: aprueba Hipoxia (tema), practica Ilusiones con 3 de 5, y hace el examen dos veces: 100 % y después 60 %.
    meterIntento(db, ids.ana, { tipo: 'tema', tema: 'muestra-hipoxia', preguntas: H, bien: H, terminado: '2026-11-10T10:00:00.000Z' });
    meterIntento(db, ids.ana, { tipo: 'tema', tema: 'muestra-ilusiones', preguntas: V, bien: V.slice(0, 3), terminado: '2026-11-11T10:00:00.000Z' });
    meterIntento(db, ids.ana, { tipo: 'examen', preguntas: [...H, ...V], bien: [...H, ...V], terminado: '2026-11-12T10:00:00.000Z' });
    meterIntento(db, ids.ana, { tipo: 'examen', preguntas: [...H, ...V], bien: [...H.slice(0, 3), ...V.slice(0, 3)], terminado: '2026-11-13T10:00:00.000Z' });
    // Ana entró por HTTP (su visita quedó con la hora de la máquina): se pone a una hora fija de antes del reloj de las rutas.
    anotarActividad(db, ids.ana, AHORA - 10 * MIN, { entrada: true });
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-01')").run(`academia.plan.${ids.ana}`, JSON.stringify({ plan: 'un_mes', desde: '2026-11-01' }));
    const r = await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    const d = r.datos;
    assert.equal(d.total, 3, 'el administrador no sale');
    assert.deepEqual(d.alumnos.map(a => a.nombre).sort(), ['ana', 'beto', 'carla']);
    assert.equal(d.enLinea, 0);
    assert.deepEqual(d.materias, ['factores_humanos']);
    const a = d.alumnos.find(x => x.id === ids.ana);
    assert.deepEqual(a.examenes.materias, [{ id: 'factores_humanos', intentos: 2, mejor: 100, ultima: 60, aprobado: true }]);
    assert.deepEqual(a.examenes.oral, []);
    assert.equal(a.examenes.promedio, 100);
    assert.equal(a.examenes.aprobados, 1);
    // 0.13.6: la nota general es de las 11 materias: su mejor nota (100) ÷ 11 → 9 %; 1 de 11 aprobados.
    assert.deepEqual(a.examenes.general, { pct: 9, aprobados: 1, total: 11 });
    // Clases: 1 de 2 temas aprobados; aciertos SOLO de los temas (8 de 10), no de los exámenes.
    assert.deepEqual([a.clases.temasAprobados, a.clases.temas, a.clases.respuestas, a.clases.aciertos, a.clases.pctAcierto], [1, 2, 10, 8, 80]);
    assert.deepEqual(a.clases.materias.map(m => [m.id, m.temasAprobados, m.temas, m.pct, m.pctAcierto]), [['factores_humanos', 1, 2, 50, 80]]);
    assert.equal(a.plan.elegido, 'un_mes');
    assert.ok(['adelantado', 'a_tiempo', 'atrasado', 'terminado'].includes(a.plan.ritmo));
    assert.match(a.plan.fin, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(a.avance.pct > 0 && a.avance.pct <= 100);
    // Tiempo (aprox., de sus respuestas): 4 ratos; los 4 dentro de los últimos 7 días.
    assert.ok(a.tiempo.minutos > 0);
    assert.equal(a.tiempo.semana, a.tiempo.minutos);
    assert.equal(a.tiempo.dias, 4);
    const b = d.alumnos.find(x => x.id === ids.beto);
    assert.deepEqual([b.examenes.materias, b.examenes.promedio, b.clases.respuestas, b.plan, b.tiempo.minutos], [[], null, 0, null, 0]);
    assert.deepEqual(b.examenes.general, { pct: 0, aprobados: 0, total: 11 });
    // La ficha (Resumen) dice lo mismo: de las 11 materias, no solo de las que tienen contenido.
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.deepEqual([f.resumen.notaGeneral, f.resumen.examenesAprobados, f.resumen.examenes], [9, 1, 11]);
    assert.ok(!JSON.stringify(d).includes('clave_hash'));
  });
});

test('en línea con un reloj falso: visita de hace 2 min sí; de hace 4 min o cerrada no; una respuesta de hace 1 min sí', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    const ana = crearUsuario(db, { nombre: 'ana', claveHash: 'x' });
    const beto = crearUsuario(db, { nombre: 'beto', claveHash: 'x' });
    const carla = crearUsuario(db, { nombre: 'carla', claveHash: 'x' });
    const jefe = crearUsuario(db, { nombre: 'jefe', claveHash: 'x', rol: 'admin' });
    anotarActividad(db, ana, AHORA - 30_000, { entrada: true });
    anotarActividad(db, beto, AHORA - 4 * MIN, { entrada: true });
    anotarActividad(db, jefe, AHORA, { entrada: true });
    const linea = id => enLineaTodos(db, AHORA).alumnos.find(a => a.id === id);
    assert.equal(linea(ana).enLinea, true);
    assert.equal(linea(beto).enLinea, false);
    assert.equal(linea(beto).ultimaActividad, iso(AHORA - 4 * MIN));
    assert.equal(linea(carla).enLinea, false);
    assert.equal(linea(carla).ultimaActividad, null);
    assert.equal(enLineaTodos(db, AHORA).alumnos.some(a => a.id === jefe), false, 'el administrador no cuenta');
    assert.equal(enLineaTodos(db, AHORA).enLinea, 1);
    // Ana cierra la app: deja de estar en línea aunque haya sido hace segundos.
    anotarFin(db, ana, 'cerro', AHORA - 10_000);
    assert.equal(linea(ana).enLinea, false);
    // Una respuesta de hace 30 s (sin visita anotada) la pone en línea.
    const i = Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, empezado_en, orden) VALUES (?, 'tema', 'factores_humanos', 'muestra-hipoxia', 5, 1, 1, ?, '[]')`).run(carla, iso(AHORA - 5 * MIN)).lastInsertRowid);
    db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, 'muestra-h1', 'factores_humanos', 'muestra-hipoxia', 'B', 1, '2026-11-13', ?)`).run(i, carla, iso(AHORA - 30_000));
    assert.equal(linea(carla).enLinea, true);
    // Y lo mismo en la lista completa (sin contenido en uso: igual funciona).
    const todos = comoVanTodos(db, null, AHORA);
    assert.deepEqual(todos.alumnos.map(a => [a.nombre, a.enLinea]), [['carla', true], ['ana', false], ['beto', false]], 'en línea primero, después lo más reciente');
    // Diez minutos después, nadie.
    assert.equal(enLineaTodos(db, AHORA + 10 * MIN).enLinea, 0);
  } finally { db.close(); }
});

test('las notas de examen: agrupadas por materia en el orden del contenido; el oral por capítulo y el final', () => {
  const filas = [
    { materia: 'meteorologia', pct: 70, aprobado: false },
    { materia: 'factores_humanos', pct: 60, aprobado: false },
    { materia: 'factores_humanos', pct: 95, aprobado: true },
  ];
  assert.deepEqual(examenesPorMateria(filas, ['factores_humanos', 'meteorologia']), [
    { id: 'factores_humanos', intentos: 2, mejor: 95, ultima: 60, aprobado: true },
    { id: 'meteorologia', intentos: 1, mejor: 70, ultima: 70, aprobado: false },
  ]);
  assert.deepEqual(examenesPorMateria([], ['factores_humanos']), []);
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    const ana = crearUsuario(db, { nombre: 'ana', claveHash: 'x' });
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-13')").run(`academia.oral.${ana}`, JSON.stringify({ leidos: [], examenes: {
      final: { aprobado: false, mejor: 70, ultimo: 55, veces: 2, en: '2026-11-12T10:00:00.000Z' },
      oral_meteorologia: { aprobado: true, mejor: 90, ultimo: 90, veces: 1 },
      oral_calificaciones: { aprobado: true, mejor: 85, ultimo: 80, veces: 3 },
      inventado: { aprobado: true, mejor: 100, veces: 1 },
    } }));
    const conOral = { oral: { hay: true, materias: [] } };
    assert.deepEqual(examenesOralDe(db, ana, conOral).map(x => [x.id, x.mejor, x.ultima, x.aprobado, x.veces]), [
      ['oral_calificaciones', 85, 80, true, 3], ['oral_meteorologia', 90, 90, true, 1], ['final', 70, 55, false, 2],
    ]);
    assert.deepEqual(examenesOralDe(db, ana, { oral: { hay: false } }), [], 'sin pista oral, nada');
  } finally { db.close(); }
});

test('el orden de la pantalla es el mismo que el del servidor; el color de cada nota; «Falló en» por tema', () => {
  const a = (id, nombre, enLinea, ultima, promedio, avance, pctAcierto) => ({ id, nombre, nombreVisible: nombre, enLinea, ultimaActividad: ultima, examenes: { promedio }, avance: { pct: avance }, clases: { pctAcierto } });
  const lista = [a(1, 'Beto', false, '2026-11-13T10:00:00Z', 80, 50, 70), a(2, 'ana', true, '2026-11-13T09:00:00Z', null, 10, 90), a(3, 'Carla', false, '2026-11-13T11:00:00Z', 95, 50, 80), a(4, 'Dani', false, null, 80, 0, 0)];
  const nombres = l => l.map(x => x.nombre);
  for (const orden of ['en_linea', 'nota', 'avance']) assert.deepEqual(nombres(ordenarComoVan(lista, orden)), nombres(ordenarAlumnos(lista, orden)), orden);
  assert.deepEqual(nombres(ordenarComoVan(lista, 'en_linea')), ['ana', 'Carla', 'Beto', 'Dani']);
  assert.deepEqual(nombres(ordenarComoVan(lista, 'nota')), ['Carla', 'Beto', 'Dani', 'ana']);
  assert.deepEqual(nombres(ordenarComoVan(lista, 'avance')), ['Carla', 'Beto', 'ana', 'Dani']);
  assert.deepEqual(nombres(ordenarComoVan(lista, 'otro')), nombres(ordenarComoVan(lista, 'en_linea')));
  assert.deepEqual([tonoExamen({ mejor: 95, aprobado: true }), tonoExamen({ mejor: 75, aprobado: false }), tonoExamen({ mejor: 40, aprobado: false }), tonoExamen(null)], ['bien', 'atencion', 'mal', 'apagado']);
  const q = (tema, titulo, acierto) => ({ tema, temaTitulo: titulo, respuesta: acierto == null ? null : { acierto } });
  assert.deepEqual(fallasPorTema([q('h', 'Hipoxia', false), q('v', 'Ilusiones', false), q('h', 'Hipoxia', false), q('h', 'Hipoxia', true), q('v', 'Ilusiones', null)]).map(x => [x.titulo, x.fallos]), [['Hipoxia', 2], ['Ilusiones', 1]]);
});

test('«Comparar un examen»: la nota de cada uno y las preguntas que más fallan (quién y qué eligió), por tema; un alumno no lo ve', async () => {
  await conAcademia(async ({ base, db, admin, ana, ids }) => {
    // Ana: primero falla h1 y h2, después solo h2 (cuenta su ÚLTIMA respuesta). Beto: falla h2 y v1.
    meterIntento(db, ids.ana, { tipo: 'examen', preguntas: [...H, ...V], bien: [...H.slice(2), ...V], terminado: '2026-11-12T10:00:00.000Z' });
    const ultimoAna = meterIntento(db, ids.ana, { tipo: 'examen', preguntas: [...H, ...V], bien: [H[0], ...H.slice(2), ...V], terminado: '2026-11-13T10:00:00.000Z' });
    meterIntento(db, ids.beto, { tipo: 'examen', preguntas: [...H, ...V], bien: [H[0], ...H.slice(2), ...V.slice(1)], terminado: '2026-11-13T11:00:00.000Z' });
    // Una práctica de Carla no es examen: no entra.
    meterIntento(db, ids.carla, { tipo: 'tema', tema: 'muestra-hipoxia', preguntas: H, bien: [], terminado: '2026-11-13T12:00:00.000Z' });
    const r = await pedir(base, 'GET', '/api/admin/academia/examenes/factores_humanos/comparar', { galleta: admin });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    const d = r.datos;
    assert.deepEqual(d.alumnos.map(a => [a.nombre, a.intentos, a.mejor, a.ultima, a.aprobado]), [['ana', 2, 90, 90, true], ['beto', 1, 80, 80, true]]);
    assert.equal(d.alumnos[0].ultimoIntento, ultimoAna);
    assert.deepEqual(d.preguntas[0].id, 'muestra-h2', 'la que más fallan, primero');
    assert.deepEqual(d.preguntas[0].fallaron.map(f => f.nombre), ['ana', 'beto']);
    assert.equal(d.preguntas[0].respondieron, 2);
    assert.equal(d.preguntas[0].correcta, DE('muestra-h2').original.correcta);
    assert.equal(d.preguntas[0].enunciado, DE('muestra-h2').original.enunciado, 'el enunciado tal cual');
    assert.notEqual(d.preguntas[0].fallaron[0].elegida, d.preguntas[0].correcta);
    assert.equal(d.preguntas.find(x => x.id === 'muestra-h1').fallaron.length, 0, 'ana la acertó en su último examen');
    assert.deepEqual(d.preguntas.find(x => x.id === 'muestra-v1').fallaron.map(f => f.nombre), ['beto']);
    assert.deepEqual(d.temas.map(t => [t.id, t.fallos, t.alumnos]), [['muestra-hipoxia', 2, 2], ['muestra-ilusiones', 1, 1]]);
    assert.equal(d.preguntas.length, 10);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/examenes/factores_humanos/comparar', { galleta: ana })).codigo, 403);
    // El intento de un alumno pregunta por pregunta trae el título del tema de cada pregunta (para agruparlas).
    const v = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/${ultimoAna}`, { galleta: admin })).datos;
    assert.ok(v.preguntas.every(q => typeof q.temaTitulo === 'string' && q.temaTitulo.length > 0), JSON.stringify(v.preguntas.map(q => q.temaTitulo)));
    assert.deepEqual(fallasPorTema(v.preguntas).map(x => x.fallos), [1]);
    // La ficha trae el avance del curso y el tiempo de los últimos 7 días.
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.equal(typeof f.resumen.avance.pct, 'number');
    assert.equal(typeof f.resumen.minutosSemana, 'number');
    assert.deepEqual(f.examenesOral, [], 'la muestra no trae pista oral');
  });
});

test('0.13.6: la nota general del curso es de las 11 materias (la que no tiene examen cuenta 0); «Mejor nota» ordena por ella', () => {
  assert.equal(MATERIAS.length, 11);
  // Un solo examen con 80 % → 80 ÷ 11 = 7 %; aprobado → 1 de 11.
  assert.deepEqual(notaGeneralDelCurso([{ id: 'factores_humanos', mejor: 80, aprobado: true }]), { pct: 7, aprobados: 1, total: 11 });
  assert.deepEqual(notaGeneralDelCurso([]), { pct: 0, aprobados: 0, total: 11 });
  // Lo mismo desde el Map de progreso.examenes(); el oral u otra materia no cuentan; la mejor de cada materia.
  const m = new Map([['factores_humanos', { mejor: 90, aprobado: true }], ['meteorologia', { mejor: 70, aprobado: false }], ['oral_meteorologia', { mejor: 100, aprobado: true }]]);
  assert.deepEqual(notaGeneralDelCurso(m), { pct: 14, aprobados: 1, total: 11 });
  assert.deepEqual(notaGeneralDelCurso(MATERIAS.map(id => ({ id, mejor: 100, aprobado: true }))), { pct: 100, aprobados: 11, total: 11 });
  // Orden «nota»: la nota general manda (2 exámenes buenos le ganan a 1 perfecto); sin exámenes, al final.
  const a = (id, nombre, general, promedio) => ({ id, nombre, nombreVisible: nombre, enLinea: false, ultimaActividad: null, examenes: { promedio, general: { pct: general, aprobados: 0, total: 11 } }, avance: { pct: 0 }, clases: { pctAcierto: 0 } });
  const lista = [a(1, 'Uno', 9, 100), a(2, 'Dos', 16, 90), a(3, 'Nadie', 0, null)];
  assert.deepEqual(ordenarComoVan(lista, 'nota').map(x => x.nombre), ['Dos', 'Uno', 'Nadie']);
  assert.deepEqual(ordenarAlumnos(lista, 'nota').map(x => x.nombre), ['Dos', 'Uno', 'Nadie']);
});
