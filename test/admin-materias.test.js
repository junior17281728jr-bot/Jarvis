// Pruebas de la Academia 0.13.8: «Ver cada materia» (las 11, en el orden del curso, las sin contenido «pronto»), lo útil
// de la actividad (con un reloj falso), y la cuenta desde «Cómo van todos» y la ficha: bloquear / desbloquear, eliminar
// SIN borrar nada (sale de las listas, no entra, sus sesiones se cierran, sus datos siguen, su usuario queda reservado)
// y recuperar. Nunca la propia cuenta ni el último administrador. Solo el administrador (401 / 403).
// Usa solo el paquete de MUESTRA (test/academia-muestra.js). Los intentos y respuestas se escriben directo en la base.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario, buscarPorId, problemaParaQuitar } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { anotarActividad } from '../src/cuentas/visitas.js';
import { MATERIAS } from '../src/academia/formato.js';
import { pasosDelCamino } from '../src/academia/plan.js';
import { avancePorMateria, materiaMasDebil, diasSinEntrar, diasActivosSemana } from '../src/academia/por-materia.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { avisarSinEntrar, DIAS_SIN_ENTRAR_AVISO } from '../public/admin-alumnos.js';
import { DIAS_SIN_ENTRAR_AVISO as DIAS_SERVIDOR } from '../src/academia/por-materia.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const CONFIRMA = { 'X-Confirmar-Clave': Buffer.from(CLAVE).toString('base64') };
const MUESTRA = paqueteMuestra();
const AHORA = Date.parse('2026-11-13T15:00:00Z');
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
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
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = { junior: admin.datos.usuario.id };
    for (const nombre of ['ana', 'beto', 'carla']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const entrar = nombre => pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } });
    const ana = (await entrar('ana')).galleta;
    await fn({ base, db, config, admin: admin.galleta, ana, ids, entrar });
  });
  db.close();
}
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
function meterIntento(db, usuario, { tipo, tema = null, preguntas, bien, terminado }) {
  const aciertos = preguntas.filter(q => bien.includes(q)).length;
  const aprobado = aciertos * 100 >= 80 * preguntas.length ? 1 : 0;
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
// Ana: aprueba Hipoxia, practica Ilusiones con 3 de 5 y aprueba el examen (100 %). Su última actividad: hace 9 días.
function prepararAna(db, ids) {
  meterIntento(db, ids.ana, { tipo: 'tema', tema: 'muestra-hipoxia', preguntas: H, bien: H, terminado: iso(AHORA - 12 * DIA) });
  meterIntento(db, ids.ana, { tipo: 'tema', tema: 'muestra-ilusiones', preguntas: V, bien: V.slice(0, 3), terminado: iso(AHORA - 10 * DIA) });
  meterIntento(db, ids.ana, { tipo: 'examen', preguntas: [...H, ...V], bien: [...H, ...V], terminado: iso(AHORA - 9 * DIA) });
}

test('«Ver cada materia»: las 11 en el orden del curso, las sin contenido «pronto», con la misma cuenta que el avance del curso', async () => {
  await conAcademia(async ({ base, db, config, admin, ids }) => {
    prepararAna(db, ids);
    const d = (await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin })).datos;
    const a = d.alumnos.find(x => x.id === ids.ana);
    assert.equal(a.cadaMateria.length, 11);
    assert.deepEqual(a.cadaMateria.map(m => m.id), [...MATERIAS]);
    const fh = a.cadaMateria[0];
    // 1 de 2 temas + el examen aprobado = 2 de 3 pasos → 66 %; mejor examen 100; aciertos SIN el examen: 8 de 10.
    assert.deepEqual([fh.pronto, fh.temasHechos, fh.temas, fh.hechos, fh.pasos, fh.pct, fh.examen.mejor, fh.examen.aprobado, fh.respuestas, fh.pctAcierto],
      [false, 1, 2, 2, 3, 66, 100, true, 10, 80]);
    for (const m of a.cadaMateria.slice(1)) {
      assert.equal(m.pronto, true, m.id);
      assert.deepEqual([m.pct, m.pasos, m.hechos, m.examen.mejor], [0, 0, 0, null], m.id);
    }
    // La suma de lo hecho es la del avance del curso entero (pasosDelCamino).
    const p = paqueteActivo(db, config);
    assert.equal(avancePorMateria(db, ids.ana, p).hechos, pasosDelCamino(db, ids.ana, p).hechos);
    assert.equal(avancePorMateria(db, ids.ana, p).hechos, 2);
    assert.equal(a.cadaMateria.reduce((n, m) => n + m.hechos, 0), a.avance.hechos);
    // Dónde va (el tema sin aprobar) y lo que más le cuesta (con 10 respuestas o más).
    assert.deepEqual([a.detalles.dondeVa.materia, a.detalles.dondeVa.tema, typeof a.detalles.dondeVa.titulo], ['factores_humanos', 'muestra-ilusiones', 'string']);
    assert.deepEqual(a.detalles.masDebil, { id: 'factores_humanos', pctAcierto: 80, respuestas: 10 });
    assert.equal(a.detalles.ultimoExamen, iso(AHORA - 9 * DIA));
    assert.equal(a.detalles.diasSemana, 0, 'nada en los últimos 7 días');
    assert.equal(a.detalles.racha, 0);
    // Sin el oral en la muestra: no hay capítulos.
    assert.equal(a.cadaOral, null);
    // Beto no hizo nada: va en el primer tema; nada «le cuesta»; nunca entró (sin días).
    const b = d.alumnos.find(x => x.id === ids.beto);
    assert.equal(b.cadaMateria.length, 11);
    assert.equal(b.detalles.dondeVa.tema, 'muestra-hipoxia');
    assert.deepEqual([b.detalles.masDebil, b.detalles.ultimoExamen, b.detalles.diasSinEntrar], [null, null, null]);
    // La ficha trae lo mismo.
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.deepEqual(f.cadaMateria, a.cadaMateria);
    assert.deepEqual(f.detalles.dondeVa, a.detalles.dondeVa);
    assert.equal(f.detalles.ultimoExamen, a.detalles.ultimoExamen);
  });
});

test('«Hace N días que no entra» con un reloj falso (desde 7 días), días de esta semana y la materia más débil', () => {
  assert.equal(DIAS_SIN_ENTRAR_AVISO, 7);
  assert.equal(DIAS_SERVIDOR, DIAS_SIN_ENTRAR_AVISO);
  assert.equal(diasSinEntrar(iso(AHORA - 9 * DIA), AHORA), 9);
  assert.equal(diasSinEntrar(iso(AHORA - 6 * DIA - 23 * 60 * MIN), AHORA), 6);
  assert.equal(diasSinEntrar(null, AHORA), null);
  assert.equal(diasSinEntrar(iso(AHORA + MIN), AHORA), 0, 'una hora del futuro no da números negativos');
  assert.deepEqual([avisarSinEntrar(9), avisarSinEntrar(7), avisarSinEntrar(6), avisarSinEntrar(null)], [true, true, false, false]);
  const filas = [
    { dia: '2026-11-13', creada_en: iso(AHORA - MIN) }, { dia: '2026-11-13', creada_en: iso(AHORA - 2 * MIN) },
    { dia: '2026-11-10', creada_en: iso(AHORA - 3 * DIA) }, { dia: '2026-11-06', creada_en: iso(AHORA - 7 * DIA - MIN) },
    { dia: '2026-11-14', creada_en: iso(AHORA + DIA) },
  ];
  assert.equal(diasActivosSemana(filas, AHORA), 2);
  const m = [
    { id: 'a', pronto: false, respuestas: 9, pctAcierto: 10 }, // muy pocas respuestas: no cuenta
    { id: 'b', pronto: false, respuestas: 20, pctAcierto: 60 },
    { id: 'c', pronto: false, respuestas: 12, pctAcierto: 55 },
    { id: 'd', pronto: true, respuestas: 50, pctAcierto: 0 },
    { id: 'e', pronto: false, respuestas: 30, pctAcierto: 55 }, // empate: gana la primera en el orden del curso
  ];
  assert.deepEqual(materiaMasDebil(m), { id: 'c', pctAcierto: 55, respuestas: 12 });
  assert.equal(materiaMasDebil([]), null);
});

test('«Hace 9 días que no entra»: lo dice «Cómo van todos» con el reloj de las rutas', async () => {
  await conAcademia(async ({ base, db, admin, ids }) => {
    anotarActividad(db, ids.carla, AHORA - 9 * DIA, { entrada: true });
    const d = (await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin })).datos;
    const c = d.alumnos.find(x => x.id === ids.carla);
    assert.equal(c.detalles.diasSinEntrar, 9);
  });
});

test('bloquear y desbloquear: no entra, sus sesiones se cierran, y vuelve a entrar al desbloquear', async () => {
  await conAcademia(async ({ base, admin, ana, ids, entrar }) => {
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).codigo, 200);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { galleta: admin, datos: { activo: false } })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).codigo, 401, 'su sesión se cerró');
    const r = await entrar('ana');
    assert.deepEqual([r.codigo, r.datos.error], [403, 'cuenta_bloqueada']);
    // Bloqueada sigue en las listas (con «Inactivo»).
    const d = (await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin })).datos;
    assert.equal(d.alumnos.find(x => x.id === ids.ana).activo, false);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { galleta: admin, datos: { activo: true } })).codigo, 200);
    assert.equal((await entrar('ana')).codigo, 200);
    // Nunca la propia cuenta.
    const yo = await pedir(base, 'POST', `/api/admin/usuarios/${ids.junior}/activo`, { galleta: admin, datos: { activo: false } });
    assert.deepEqual([yo.codigo, yo.datos.error], [400, 'no_puedes_desactivarte']);
  });
});

test('eliminar NO borra nada: pide la contraseña, sale de las listas, no entra, sus datos siguen; su usuario queda reservado; recuperar la deja como estaba', async () => {
  await conAcademia(async ({ base, db, admin, ana, ids, entrar }) => {
    prepararAna(db, ids);
    const antes = {
      respuestas: db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas WHERE usuario_id = ?').get(ids.ana).n,
      intentos: db.prepare('SELECT COUNT(*) AS n FROM academia_intentos WHERE usuario_id = ?').get(ids.ana).n,
    };
    assert.ok(antes.respuestas > 0 && antes.intentos > 0);
    // Sin la contraseña otra vez: no (y no cambia nada).
    const sin = await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/eliminar`, { galleta: admin, datos: {} });
    assert.deepEqual([sin.codigo, sin.datos.error], [403, 'confirmar_clave']);
    assert.equal(buscarPorId(db, ids.ana).eliminado_en, null);
    const mal = await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/eliminar`, { galleta: admin, datos: {}, cabeceras: { 'X-Confirmar-Clave': Buffer.from('otra clave mala').toString('base64') } });
    assert.deepEqual([mal.codigo, mal.datos.error], [403, 'clave_confirmar_incorrecta']);
    const r = await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/eliminar`, { galleta: admin, datos: {}, cabeceras: CONFIRMA });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    // No entra y su sesión se cerró.
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).codigo, 401);
    const e = await entrar('ana');
    assert.equal(e.codigo, 403);
    assert.equal(e.galleta, null);
    // Fuera de las listas.
    const cv = (await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin })).datos;
    assert.ok(!cv.alumnos.some(x => x.id === ids.ana));
    assert.equal(cv.total, 2);
    const usuarios = (await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios;
    assert.ok(!usuarios.some(x => x.id === ids.ana));
    const lista = (await pedir(base, 'GET', '/api/admin/academia/alumnos', { galleta: admin })).datos.alumnos;
    assert.ok(!lista.some(x => x.id === ids.ana));
    const comparar = (await pedir(base, 'GET', '/api/admin/academia/examenes/factores_humanos/comparar', { galleta: admin })).datos;
    assert.ok(!comparar.alumnos.some(x => x.id === ids.ana), 'tampoco en «Comparar un examen»');
    // En «Alumnos eliminados», con quién y cuándo.
    const el = (await pedir(base, 'GET', '/api/admin/usuarios/eliminados', { galleta: admin })).datos.cuentas;
    assert.deepEqual(el.map(c => [c.id, c.nombre, c.por, c.estabaActiva]), [[ids.ana, 'ana', 'junior', true]]);
    assert.match(el[0].eliminadoEn, /^\d{4}-\d{2}-\d{2}T/);
    // Sus datos siguen en la base, y su ficha se sigue viendo (marcada).
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas WHERE usuario_id = ?').get(ids.ana).n, antes.respuestas);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_intentos WHERE usuario_id = ?').get(ids.ana).n, antes.intentos);
    const fila = buscarPorId(db, ids.ana);
    assert.deepEqual([fila.nombre, fila.activo, fila.eliminado_por, fila.eliminado_activo], ['ana', 0, ids.junior, 1]);
    const ficha = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.ok(ficha.alumno.eliminado?.en);
    // Queda anotado en la auditoría.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'usuario_eliminado' AND detalle = 'ana'").get().n, 1);
    // Su usuario queda reservado.
    const otra = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'ana', sinClave: true } });
    assert.deepEqual([otra.codigo, otra.datos.error], [409, 'nombre_ocupado']);
    // Nada la «revive» por otro lado: ni desbloquearla, ni ponerle contraseña, ni eliminarla otra vez.
    for (const [ruta, datos] of [['activo', { activo: true }], ['clave', { clave: 'otra clave larga' }], ['reiniciar-clave', {}], ['eliminar', {}]]) {
      const x = await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/${ruta}`, { galleta: admin, datos, cabeceras: CONFIRMA });
      assert.deepEqual([x.codigo, x.datos.error], [409, 'cuenta_eliminada'], ruta);
    }
    assert.equal((await entrar('ana')).codigo, 403);
    // Recuperar: vuelve a las listas y entra como antes.
    const rec = await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/recuperar`, { galleta: admin, datos: {} });
    assert.deepEqual([rec.codigo, rec.datos.activo], [200, true]);
    assert.equal((await entrar('ana')).codigo, 200);
    assert.ok((await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin })).datos.alumnos.some(x => x.id === ids.ana));
    assert.deepEqual((await pedir(base, 'GET', '/api/admin/usuarios/eliminados', { galleta: admin })).datos.cuentas, []);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/recuperar`, { galleta: admin, datos: {} })).datos.error, 'cuenta_no_eliminada');
    // Una cuenta bloqueada que se elimina vuelve BLOQUEADA al recuperarla.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/activo`, { galleta: admin, datos: { activo: false } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/eliminar`, { galleta: admin, datos: {}, cabeceras: CONFIRMA })).codigo, 200);
    const recB = await pedir(base, 'POST', `/api/admin/usuarios/${ids.beto}/recuperar`, { galleta: admin, datos: {} });
    assert.deepEqual([recB.codigo, recB.datos.activo], [200, false]);
    assert.equal(buscarPorId(db, ids.beto).activo, 0);
    assert.equal((await entrar('beto')).datos.error, 'cuenta_bloqueada');
  });
});

test('nunca se elimina la propia cuenta ni el último administrador', async () => {
  await conAcademia(async ({ base, db, admin, ids }) => {
    const yo = await pedir(base, 'POST', `/api/admin/usuarios/${ids.junior}/eliminar`, { galleta: admin, datos: {}, cabeceras: CONFIRMA });
    assert.deepEqual([yo.codigo, yo.datos.error], [400, 'no_puedes_quitarte']);
    assert.equal(buscarPorId(db, ids.junior).eliminado_en, null);
    // El último administrador activo: ni otro administrador lo puede quitar.
    assert.equal(problemaParaQuitar(db, buscarPorId(db, ids.junior), ids.ana), 'ultimo_admin');
    assert.equal(problemaParaQuitar(db, buscarPorId(db, ids.ana), ids.junior), null);
    assert.equal(problemaParaQuitar(db, null, ids.junior), 'no_existe');
    // Con dos administradores, uno sí puede eliminar al otro (con la contraseña), y entonces el que queda es el último.
    const otro = crearUsuario(db, { nombre: 'otro', claveHash: await hashClave(CLAVE), rol: 'admin', debeCambiarClave: false });
    assert.equal(problemaParaQuitar(db, buscarPorId(db, ids.junior), otro), null);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${otro}/eliminar`, { galleta: admin, datos: {}, cabeceras: CONFIRMA })).codigo, 200);
    assert.equal(problemaParaQuitar(db, buscarPorId(db, ids.junior), otro), 'ultimo_admin');
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'otro', clave: CLAVE } })).codigo, 403);
  });
});

test('eliminar, recuperar y «Alumnos eliminados» son solo del administrador (401 sin sesión, 403 para los alumnos, sin cambios)', async () => {
  await conAcademia(async ({ base, db, ana, ids }) => {
    const rutas = [['POST', `/api/admin/usuarios/${ids.beto}/eliminar`], ['POST', `/api/admin/usuarios/${ids.beto}/recuperar`], ['GET', '/api/admin/usuarios/eliminados'], ['POST', `/api/admin/usuarios/${ids.beto}/activo`]];
    for (const [metodo, ruta] of rutas) {
      const datos = metodo === 'POST' ? { activo: false } : undefined;
      assert.equal((await pedir(base, metodo, ruta, { datos, cabeceras: CONFIRMA })).codigo, 401, ruta);
      const r = await pedir(base, metodo, ruta, { galleta: ana, datos, cabeceras: CONFIRMA });
      assert.equal(r.codigo, 403, ruta);
      assert.deepEqual(Object.keys(r.datos), ['error'], 'un 403 no lleva datos');
    }
    const beto = buscarPorId(db, ids.beto);
    assert.deepEqual([beto.activo, beto.eliminado_en], [1, null]);
  });
});
