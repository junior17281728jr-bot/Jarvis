// Pruebas de la 0.9.2: el examen de materia con reloj (sin ver nada antes de entregar, respuestas que se cambian,
// marcadas, segundos por pregunta, entrega con faltantes, vencido que se entrega solo) y las cuentas: crear sin
// contraseña (la crea el alumno), contraseña puesta por el administrador, bloquear sin borrar y cambiar el usuario de
// alguien. Usa solo el paquete de MUESTRA (test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { avisosDe, relojTexto } from '../public/examen-vista.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const entrar = async (base, nombre, clave = CLAVE) => (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave } }));
async function conAcademia(fn) {
  const reloj = { ahora: Date.parse('2026-11-12T15:00:00Z') };
  const config = configDePrueba();
  const db = abrirBase(config);
  // Muchas entradas seguidas desde el mismo lugar (las pruebas): sin el freno por lugar (el de cada cuenta sigue).
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, academia: { azar: azarFijo(), reloj: () => reloj.ahora } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = {};
    for (const nombre of ['ana', 'beto']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const ana = (await entrar(base, 'ana')).galleta;
    const beto = (await entrar(base, 'beto')).galleta;
    await fn({ base, db, admin: admin.galleta, ana, beto, ids, reloj });
  });
  db.close();
}
async function aprobarTemas(base, galleta) {
  for (const tema of ['muestra-hipoxia', 'muestra-ilusiones']) {
    const i = (await pedir(base, 'POST', '/api/academia/intentos', { galleta, datos: { tipo: 'tema', materia: 'factores_humanos', tema } })).datos;
    for (const q of i.preguntas) await pedir(base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: DE(q.id).original.correcta } });
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos.aprobado, true);
  }
}
const SOPLON = /"correcta"|"acierto"|"explicacion"|"sencilla"|"idea"/;

test('examen con reloj: nada dice si acertó antes de entregar; se cambia, se marca, se cuentan los segundos; faltantes = malas', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids, reloj }) => {
    await aprobarTemas(base, ana);
    const puntosAntes = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.puntos;
    const c = await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'examen', materia: 'factores_humanos' } });
    assert.equal(c.codigo, 201);
    const ex = c.datos;
    assert.equal(ex.examen.reloj, true);
    assert.equal(ex.examen.limiteSegundos, 10 * 90);
    assert.equal(ex.examen.restanteMs, 900_000);
    assert.doesNotMatch(JSON.stringify(ex), SOPLON);
    // Empezar otra vez sigue el mismo (no otro reloj).
    reloj.ahora += 60_000;
    const otra = await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'examen', materia: 'factores_humanos' } });
    assert.deepEqual([otra.codigo, otra.datos.id, otra.datos.examen.restanteMs], [200, ex.id, 840_000]);
    const ruta = `/api/academia/intentos/${ex.id}/examen`;
    const qs = ex.preguntas.map(q => q.id);
    // 8 respondidas (la primera mal y después cambiada a bien), 2 sin responder; la 3 marcada.
    for (const [k, id] of qs.slice(0, 8).entries()) {
      const r = await pedir(base, 'POST', ruta, { galleta: ana, datos: { pregunta: id, elegida: k === 0 ? mala(id) : DE(id).original.correcta, segundos: 12.5 } });
      assert.equal(r.codigo, 200, JSON.stringify(r.datos));
      assert.doesNotMatch(JSON.stringify(r.datos), SOPLON);
    }
    assert.equal((await pedir(base, 'POST', ruta, { galleta: ana, datos: { pregunta: qs[0], elegida: DE(qs[0]).original.correcta, segundos: 5 } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', ruta, { galleta: ana, datos: { pregunta: qs[2], marcada: true } })).datos.marcadas.length, 1);
    assert.equal((await pedir(base, 'POST', ruta, { galleta: ana, datos: { pregunta: qs[9], segundos: 3 } })).codigo, 200, 'solo segundos (sin responder)');
    for (const malo of [{ pregunta: 'otra', elegida: 'A' }, { pregunta: qs[1], elegida: 'Z' }, { pregunta: qs[1], segundos: -1 }, { pregunta: qs[1], marcada: 'si' }]) {
      assert.equal((await pedir(base, 'POST', ruta, { galleta: ana, datos: malo })).codigo, 400, JSON.stringify(malo));
    }
    // Responder «a la vieja» no sirve en el examen con reloj (diría si acertó).
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/responder`, { galleta: ana, datos: { pregunta: qs[8], elegida: 'A' } })).datos.error, 'examen_con_reloj');
    // Lo que se ve al volver: lo elegido y lo marcado, nada de la nota. Los puntos no cambiaron.
    const v = (await pedir(base, 'GET', `/api/academia/intentos/${ex.id}`, { galleta: ana })).datos;
    assert.doesNotMatch(JSON.stringify(v), SOPLON);
    assert.equal(Object.keys(v.examen.respuestas).length, 8);
    assert.equal(v.examen.respuestas[qs[0]], DE(qs[0]).original.correcta);
    assert.deepEqual(v.examen.marcadas, [qs[2]]);
    assert.equal(v.examen.tiempos[qs[0]], 18);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.puntos, puntosAntes, 'nada cuenta antes de entregar');
    // Beto no ve ni toca el examen de Ana.
    assert.equal((await pedir(base, 'GET', `/api/academia/intentos/${ex.id}`, { galleta: beto })).codigo, 404);
    assert.equal((await pedir(base, 'POST', ruta, { galleta: beto, datos: { pregunta: qs[8], elegida: 'A' } })).codigo, 404);
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: beto, datos: {} })).codigo, 404);
    // Entregar con 2 sin responder: 8 de 10 = 80 %, no aprueba (90 %).
    reloj.ahora += 5 * 60_000;
    const fin = (await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: ana, datos: {} })).datos;
    assert.deepEqual([fin.total, fin.aciertos, fin.pct, fin.aprobado], [10, 8, 80, false]);
    assert.equal(fin.revision.length, 10);
    assert.equal(fin.revision.filter(q => q.respuesta.sinResponder).length, 2);
    assert.equal(fin.revision.find(q => q.id === qs[9]).respuesta.elegida, null);
    assert.equal(fin.revision.find(q => q.id === qs[9]).respuesta.correcta, DE(qs[9]).original.correcta);
    assert.equal(fin.revision.find(q => q.id === qs[0]).segundos, 18);
    assert.equal(fin.examen.tiempoUsado, 6 * 60);
    assert.equal(fin.examen.sinResponder, 2);
    // Ya entregado: nada se cambia; volver a entregar da lo mismo.
    assert.equal((await pedir(base, 'POST', ruta, { galleta: ana, datos: { pregunta: qs[9], elegida: 'A' } })).datos.error, 'intento_terminado');
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: ana, datos: {} })).datos.pct, 80);
    // Ahora sí cuentan (8 aciertos más).
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.puntos, puntosAntes + 80);
    // El administrador ve el tiempo usado y el de cada pregunta.
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    const fila = f.intentos.find(x => x.id === ex.id);
    assert.deepEqual([fila.segundos, fila.limiteSegundos], [360, 900]);
    const d = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/${ex.id}`, { galleta: admin })).datos;
    assert.equal(d.segundos, 360);
    assert.equal(d.examen.limiteSegundos, 900);
    assert.equal(d.preguntas.find(q => q.id === qs[0]).segundos, 18);
  });
});

test('examen con reloj: se acaba el tiempo → no se guarda nada más y se entrega solo; el ajuste del administrador', async () => {
  await conAcademia(async ({ base, admin, ana, reloj }) => {
    await aprobarTemas(base, ana);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: admin, datos: { examenSegundos: 10 } })).datos.error, 'examen_segundos_no_valido');
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: ana, datos: { examenSegundos: 30 } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: admin, datos: { examenSegundos: 30 } })).datos.ajustes.examenSegundos, 30);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.examenSegundos, 30);
    const ex = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'examen', materia: 'factores_humanos' } })).datos;
    assert.equal(ex.examen.limiteSegundos, 300);
    const empezo = reloj.ahora;
    const q = ex.preguntas[0].id;
    await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/examen`, { galleta: ana, datos: { pregunta: q, elegida: DE(q).original.correcta } });
    // Cambiar el ajuste no mueve un examen que ya corre.
    await pedir(base, 'POST', '/api/admin/academia/ajustes', { galleta: admin, datos: { examenSegundos: 600 } });
    reloj.ahora = empezo + 300_000 + 10_000; // dentro de la gracia: todavía se guarda
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/examen`, { galleta: ana, datos: { pregunta: ex.preguntas[1].id, elegida: 'A' } })).codigo, 200);
    reloj.ahora = empezo + 300_000 + 60_000;
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${ex.id}/examen`, { galleta: ana, datos: { pregunta: ex.preguntas[2].id, elegida: 'A' } })).datos.error, 'tiempo_agotado');
    // Al mirarlo, se entregó solo: terminado a la hora del límite, con lo que tenía.
    const v = (await pedir(base, 'GET', `/api/academia/intentos/${ex.id}`, { galleta: ana })).datos;
    assert.equal(v.terminado, true);
    assert.equal(v.respondidas, 2);
    assert.equal(v.examen.tiempoUsado, 300);
    // Un examen nuevo usa el ajuste de ahora.
    const nuevo = await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'examen', materia: 'factores_humanos' } });
    assert.equal(nuevo.codigo, 201);
    assert.notEqual(nuevo.datos.id, ex.id);
    assert.equal(nuevo.datos.examen.limiteSegundos, 6000);
  });
});

test('la pantalla del examen: el reloj y qué avisos tocan', () => {
  assert.equal(relojTexto(0), '0:00');
  assert.equal(relojTexto(61_000), '1:01');
  assert.equal(relojTexto(59_100), '1:00');
  assert.equal(relojTexto(3_725_000), '1:02:05');
  assert.deepEqual(avisosDe(900), [300, 60]);
  assert.deepEqual(avisosDe(300), [60]);
  assert.deepEqual(avisosDe(60), []);
});

test('cuenta sin contraseña: la crea el alumno la primera vez (4 o más, no de las peores); la primera gana', async () => {
  await conAcademia(async ({ base, db, admin, ana }) => {
    const c = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'carla', nombreVisible: 'Carla Ruiz', sinClave: true } });
    assert.equal(c.codigo, 201);
    assert.deepEqual([c.datos.pendiente, c.datos.claveTemporal], [true, null]);
    assert.equal((await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios.find(u => u.nombre === 'carla').pendiente, true);
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios', { galleta: ana, datos: { nombre: 'otro', sinClave: true } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre: 'otro', sinClave: true } })).codigo, 401);
    for (const clave of ['', 'cualquier', 'una clave bien larga']) assert.equal((await entrar(base, 'carla', clave)).datos.error, 'crear_clave');
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'carla', nueva: '1234' } })).datos.error, 'clave_obvia');
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'carla', nueva: 'abc' } })).datos.error, 'clave_corta');
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'carla', nueva: 'carla' } })).datos.error, 'clave_obvia');
    const r = await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'Carla', nueva: 'sol1' } });
    assert.equal(r.codigo, 200);
    assert.ok(r.galleta);
    assert.equal(r.datos.usuario.nombre, 'carla');
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: r.galleta })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'carla', nueva: 'otra1' } })).datos.error, 'ya_tiene_clave');
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'ana', nueva: 'otra1' } })).datos.error, 'ya_tiene_clave', 'una cuenta con contraseña no se toma');
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'nadie', nueva: 'otra1' } })).datos.error, 'ya_tiene_clave');
    assert.equal((await entrar(base, 'carla', 'sol1')).codigo, 200);
    assert.equal((await entrar(base, 'carla', 'mal1')).codigo, 401);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'clave_creada'").get().n, 1);
    // Con la contraseña que pone el administrador: entra sin tener que cambiarla.
    const d = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'dario', clave: 'pepe' } });
    assert.equal(d.codigo, 201);
    const e = await entrar(base, 'dario', 'pepe');
    assert.equal(e.datos.usuario.debeCambiarClave, false);
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'eva', clave: '0000' } })).datos.error, 'clave_obvia');
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'eva', clave: 'pepe', sinClave: true } })).codigo, 400);
  });
});

test('el administrador pone una contraseña: se cierran las sesiones de la persona y ve el aviso', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids }) => {
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/clave`, { galleta: beto, datos: { clave: 'pepe' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/clave`, { datos: { clave: 'pepe' } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/clave`, { galleta: admin, datos: { clave: '1111' } })).datos.error, 'clave_obvia');
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios/1/clave', { galleta: admin, datos: { clave: 'pepe' } })).datos.error, 'tu_clave_en_configuracion');
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/clave`, { galleta: admin, datos: { clave: 'pepe' } })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).codigo, 401);
    const e = await entrar(base, 'ana', 'pepe');
    assert.equal(e.codigo, 200);
    assert.equal(e.datos.usuario.debeCambiarClave, false);
    assert.deepEqual(e.datos.avisos.map(a => a.tipo), ['clave_reiniciada']);
  });
});

test('bloquear sin borrar: se cierran sus sesiones, al entrar ve «bloqueada», su progreso queda; no se bloquea uno mismo', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    await aprobarTemas(base, ana);
    const antes = db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas WHERE usuario_id = ?').get(ids.ana).n;
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { galleta: beto, datos: { activo: false } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { datos: { activo: false } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios/1/activo', { galleta: admin, datos: { activo: false } })).datos.error, 'no_puedes_desactivarte');
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { galleta: admin, datos: { activo: false } })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).codigo, 401, 'su sesión se cerró');
    const e = await entrar(base, 'ana');
    assert.deepEqual([e.codigo, e.datos.error], [403, 'cuenta_bloqueada']);
    assert.deepEqual([(await entrar(base, 'ana', 'mala clave')).codigo, (await entrar(base, 'ana', 'mala clave')).datos.error], [401, 'credenciales'], 'sin la contraseña no dice nada');
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.equal(f.alumno.activo, false);
    assert.equal(f.resumen.respuestas, antes);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas WHERE usuario_id = ?').get(ids.ana).n, antes);
    // Una cuenta sin contraseña bloqueada tampoco se puede tomar.
    await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'carla', sinClave: true } });
    const carla = (await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios.find(u => u.nombre === 'carla').id;
    await pedir(base, 'POST', `/api/admin/usuarios/${carla}/activo`, { galleta: admin, datos: { activo: false } });
    assert.equal((await entrar(base, 'carla', '')).datos.error, 'cuenta_bloqueada');
    assert.equal((await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'carla', nueva: 'sol1' } })).datos.error, 'cuenta_bloqueada');
    // Desbloquear: entra como siempre.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${ids.ana}/activo`, { galleta: admin, datos: { activo: true } })).codigo, 200);
    assert.equal((await entrar(base, 'ana')).codigo, 200);
  });
});

test('el administrador cambia el usuario y el nombre de alguien: la sesión sigue y la persona ve el aviso', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    const ruta = `/api/admin/usuarios/${ids.ana}/nombre`;
    assert.equal((await pedir(base, 'POST', ruta, { datos: { nombre: 'ana.nueva' } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', ruta, { galleta: beto, datos: { nombre: 'ana.nueva' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', ruta, { galleta: admin, datos: { nombre: 'BETO' } })).codigo, 409);
    assert.equal((await pedir(base, 'POST', ruta, { galleta: admin, datos: { nombre: 'a b' } })).datos.error, 'nombre_no_valido');
    assert.equal((await pedir(base, 'POST', ruta, { galleta: admin, datos: { nombre: 'ANA' } })).datos.error, 'nombre_igual');
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios/999/nombre', { galleta: admin, datos: { nombre: 'x.y.z' } })).codigo, 404);
    const r = await pedir(base, 'POST', ruta, { galleta: admin, datos: { nombre: 'Ana.Nueva', nombreVisible: 'Ana María' } });
    assert.equal(r.codigo, 200);
    assert.deepEqual([r.datos.nombre, r.datos.nombreVisible], ['ana.nueva', 'Ana María']);
    const yo = await pedir(base, 'GET', '/api/yo', { galleta: ana });
    assert.equal(yo.codigo, 200, 'su sesión sigue');
    assert.equal(yo.datos.usuario.nombre, 'ana.nueva');
    assert.deepEqual(yo.datos.avisos.map(a => a.tipo).sort(), ['nombre_cambiado', 'usuario_cambiado']);
    assert.deepEqual(yo.datos.reiniciosRecientes, [], 'no es un reinicio de contraseña');
    assert.equal((await entrar(base, 'ana.nueva')).codigo, 200);
    assert.equal((await entrar(base, 'ana')).codigo, 401);
    const fila = db.prepare("SELECT usuario_id, detalle FROM auditoria WHERE accion = 'nombre_usuario_cambiado'").get();
    assert.equal(fila.usuario_id, 1, 'la auditoría nombra al administrador');
    assert.match(fila.detalle, /ana -> ana\.nueva/);
    // A otro administrador solo lo cambia el dueño (desde su cuenta de Tailscale).
    const otro = crearUsuario(db, { nombre: 'admin2', claveHash: await hashClave(CLAVE), rol: 'admin', debeCambiarClave: false });
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${otro}/nombre`, { galleta: admin, datos: { nombre: 'admin3' } })).datos.error, 'solo_desde_tailnet');
  });
});
