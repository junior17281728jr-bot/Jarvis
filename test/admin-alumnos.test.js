// Pruebas de la Academia 0.9.0: la ficha de cada alumno para el administrador (resumen, cada intento pregunta por
// pregunta, por materia, actividad con entradas y salidas), «Comparar», y «Mi perfil» (nombre para mostrar, avatar,
// meta y cambiar el nombre de usuario). Lo del administrador: 401 sin sesión y 403 para los alumnos. Un alumno nunca ve
// lo de otro. Usa solo el paquete de MUESTRA (test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { FORMAS_AVATAR, COLORES_AVATAR } from '../src/cuentas/perfil.js';
import { tiempoDeEstudio } from '../src/academia/fichas.js';
import { equipoDe } from '../src/cuentas/historial.js';
import * as avataresPantalla from '../public/avatares.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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
const entrar = async (base, nombre, cabeceras = {}) => (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE }, cabeceras })).galleta;
async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo() } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ids = {};
    for (const nombre of ['ana', 'beto']) ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) {
      await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const ana = await entrar(base, 'ana', { 'User-Agent': IPHONE });
    const beto = await entrar(base, 'beto');
    await fn({ base, db, admin: admin.galleta, ana, beto, ids });
  });
  db.close();
}
// Un tema de la muestra: «bien» respuestas correctas y las demás con una opción mala. → { intento, terminado }
async function hacerTema(base, galleta, tema, bien) {
  const i = (await pedir(base, 'POST', '/api/academia/intentos', { galleta, datos: { tipo: 'tema', materia: 'factores_humanos', tema } })).datos;
  let n = 0;
  const elegidas = {};
  for (const q of i.preguntas) {
    const c = DE(q.id).original.correcta;
    const letra = n < bien ? c : ['A', 'B', 'C'].find(l => l !== c);
    elegidas[q.id] = letra;
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: letra } })).codigo, 200);
    n += 1;
  }
  const t = await pedir(base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} });
  return { intento: i, terminado: t.datos, elegidas };
}

test('lo del administrador sobre cada alumno: 401 sin sesión, 403 para los alumnos (también para verse a sí mismos)', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids }) => {
    const { intento } = await hacerTema(base, ana, 'muestra-hipoxia', 5);
    const rutas = [`/api/admin/academia/alumnos/${ids.ana}/ficha`, `/api/admin/academia/alumnos/${ids.beto}/ficha`, `/api/admin/academia/alumnos/${ids.ana}/intentos/${intento.id}`,
      `/api/admin/academia/comparar/${ids.ana},${ids.beto}`, `/api/admin/academia/comparar/${ids.beto},${ids.ana}`];
    for (const ruta of rutas) {
      const sin = await pedir(base, 'GET', ruta);
      assert.equal(sin.codigo, 401, ruta);
      assert.equal(sin.datos.error, 'no_has_entrado');
      for (const galleta of [ana, beto]) {
        const r = await pedir(base, 'GET', ruta, { galleta });
        assert.equal(r.codigo, 403, ruta);
        assert.equal(r.datos.error, 'solo_admin');
        assert.deepEqual(Object.keys(r.datos), ['error'], 'un 403 no lleva datos');
      }
      assert.equal((await pedir(base, 'GET', ruta, { galleta: admin })).codigo, 200, ruta);
    }
  });
});

test('la ficha: resumen, cada intento (lo que eligió y la correcta), por materia (mejor y última nota), puntos débiles', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, ids }) => {
    const primero = await hacerTema(base, ana, 'muestra-hipoxia', 3); // 60 %: no aprueba
    const segundo = await hacerTema(base, ana, 'muestra-hipoxia', 5); // 100 %: aprueba
    assert.equal(primero.terminado.aprobado, false);
    assert.equal(segundo.terminado.aprobado, true);
    // Un intento a medias (empezado, sin terminar).
    const medias = (await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-ilusiones' } })).datos;
    await pedir(base, 'POST', `/api/academia/intentos/${medias.id}/responder`, { galleta: ana, datos: { pregunta: medias.preguntas[0].id, elegida: DE(medias.preguntas[0].id).original.correcta } });
    const deBeto = await hacerTema(base, beto, 'muestra-hipoxia', 1);

    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.equal(f.alumno.nombre, 'ana');
    const r = f.resumen;
    assert.equal(r.intentos, 2);
    assert.equal(r.enCurso, 1);
    assert.equal(r.aprobados, 1);
    assert.equal(r.reprobados, 1);
    assert.equal(r.notaPromedio, 80);
    assert.equal(r.respuestas, 11);
    assert.equal(r.aciertos, 9);
    assert.equal(r.pctAcierto, 81);
    assert.equal(r.temasAprobados, 1);
    assert.equal(r.temas, 2);
    assert.equal(r.racha, 1);
    assert.ok(r.minutosEstudio >= 1);
    assert.equal(r.preparacion.bien, 6);
    assert.equal(r.preparacion.total, 10);
    // Cada intento (el más nuevo primero), con su tipo, tema, nota y si aprobó.
    assert.deepEqual(f.intentos.map(x => [x.id, x.pct, x.aprobado, x.terminadoSi]), [[medias.id, 20, null, false], [segundo.intento.id, 100, true, true], [primero.intento.id, 60, false, true]]);
    assert.equal(f.intentos[1].temaTitulo, 'La hipoxia (muestra)');
    assert.ok(!f.intentos.some(x => x.id === deBeto.intento.id), 'nada de Beto en la ficha de Ana');
    // Por materia: la mejor y la última nota de cada tema.
    const tema = f.materias[0].temas.find(x => x.id === 'muestra-hipoxia');
    assert.deepEqual([tema.mejor, tema.ultima, tema.veces, tema.aprobado], [100, 100, 2, true]);
    assert.deepEqual([f.materias[0].examen.veces, f.materias[0].examen.mejor], [0, null]);
    assert.ok(f.puntosDebiles.total > 0);
    // Un intento pregunta por pregunta: el enunciado tal cual, lo que eligió y la correcta.
    const v = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/${primero.intento.id}`, { galleta: admin })).datos;
    assert.equal(v.preguntas.length, 5);
    assert.equal(v.pct, 60);
    assert.equal(v.aprobado, false);
    for (const q of v.preguntas) {
      const original = DE(q.id).original;
      assert.equal(q.enunciado, original.enunciado);
      assert.equal(q.respuesta.elegida, primero.elegidas[q.id]);
      assert.equal(q.respuesta.correcta, original.correcta);
      assert.equal(q.respuesta.acierto, primero.elegidas[q.id] === original.correcta);
      assert.ok(q.respondidaEn);
    }
    // El intento de Beto pedido «como de Ana» no existe (404), y uno que no existe tampoco.
    assert.equal((await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/${deBeto.intento.id}`, { galleta: admin })).codigo, 404);
    assert.equal((await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/99999`, { galleta: admin })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos/99999/ficha', { galleta: admin })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos/abc/ficha', { galleta: admin })).codigo, 404);
    // El intento a medias: lo respondido y lo que falta.
    const vm = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/${medias.id}`, { galleta: admin })).datos;
    assert.equal(vm.terminado, false);
    assert.equal(vm.preguntas.filter(q => q.respuesta).length, 1);
    // Una pregunta que ya no está en el contenido en uso igual muestra lo que eligió.
    db.prepare("UPDATE academia_respuestas SET pregunta = 'ya-no-existe' WHERE intento_id = ? AND pregunta = ?").run(primero.intento.id, v.preguntas[0].id);
    db.prepare('UPDATE academia_intentos SET orden = ? WHERE id = ?').run(JSON.stringify(['ya-no-existe', ...v.preguntas.slice(1).map(q => q.id)]), primero.intento.id);
    const vf = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/intentos/${primero.intento.id}`, { galleta: admin })).datos;
    assert.equal(vf.preguntas[0].falta, true);
    assert.equal(vf.preguntas[0].respuesta.elegida, primero.elegidas[v.preguntas[0].id]);
    assert.equal(vf.preguntas[0].respuesta.sinContenido, true);
  });
});

test('actividad: la última entrada, la última salida y cada sesión con su entrada y su salida', async () => {
  await conAcademia(async ({ base, db, admin, ana, ids }) => {
    const a0 = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.actividad;
    assert.ok(a0.ultimaEntrada);
    assert.equal(a0.ultimaSalida, null);
    assert.equal(a0.sesiones.length, 1);
    assert.equal(a0.sesiones[0].estado, 'en_linea');
    assert.equal(a0.sesiones[0].equipo, 'iPhone · Safari');
    assert.equal(a0.entradas, 1);
    // Ana toca «Salir»: queda su salida (y la sesión ya no sirve).
    assert.equal((await pedir(base, 'POST', '/api/salir', { galleta: ana, datos: {} })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).codigo, 401);
    const a1 = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.actividad;
    assert.ok(a1.ultimaSalida);
    assert.equal(a1.sesiones.length, 1);
    assert.deepEqual([a1.sesiones[0].estado, a1.sesiones[0].motivo], ['cerrada', 'salir']);
    assert.equal(a1.sesiones[0].entrada, a0.sesiones[0].entrada);
    assert.equal(a1.sesiones[0].salida, a1.ultimaSalida);
    // Entra otra vez y deja la sesión abierta; y una sesión vieja que venció sin «Salir».
    await entrar(base, 'ana');
    db.prepare("INSERT INTO sesiones (token_hash, usuario_id, creada_en, vence_en, ultimo_uso, navegador) VALUES ('viejo', ?, '2026-01-01T10:00:00.000Z', '2026-01-31T10:00:00.000Z', '2026-01-02T11:00:00.000Z', 'Windows Chrome/1')").run(ids.ana);
    const a2 = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.actividad;
    assert.equal(a2.entradas, 2);
    assert.deepEqual(a2.sesiones.map(s => s.estado), ['en_linea', 'cerrada', 'vencida']);
    assert.equal(a2.sesiones[2].ultimaActividad, '2026-01-02T11:00:00.000Z');
    assert.equal(a2.sesiones[2].salida, null);
    // Cambiar la contraseña cierra las otras sesiones: quedan como «cerrada» (las vencidas no se anotan).
    const otra = await entrar(base, 'ana');
    assert.equal((await pedir(base, 'POST', '/api/yo/clave', { galleta: otra, datos: { actual: CLAVE, nueva: 'otra clave bien larga 2' } })).codigo, 200);
    const a3 = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.actividad;
    assert.equal(a3.sesiones.filter(s => s.estado === 'cerrada' && s.motivo === 'cerrada').length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'salida'").get().n, 2);
  });
});

test('comparar: de 2 a 6 cuentas distintas, lado a lado (por materia, puntos débiles, actividad)', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids }) => {
    await hacerTema(base, ana, 'muestra-hipoxia', 5);
    await hacerTema(base, beto, 'muestra-hipoxia', 2);
    const c = (await pedir(base, 'GET', `/api/admin/academia/comparar/${ids.ana},${ids.beto}`, { galleta: admin })).datos;
    assert.deepEqual(c.alumnos.map(a => a.nombre), ['ana', 'beto']);
    assert.deepEqual(c.materias, ['factores_humanos']);
    const [a, b] = c.alumnos;
    assert.deepEqual([a.pctAcierto, b.pctAcierto], [100, 40]);
    assert.deepEqual([a.aprobados, b.aprobados], [1, 0]);
    assert.deepEqual([a.temasAprobados, b.temasAprobados], [1, 0]);
    assert.deepEqual([a.materias[0].pct, b.materias[0].pct], [50, 20]);
    assert.equal(a.debiles.temas.length, 0);
    assert.ok(b.debiles.temas.length >= 1);
    assert.ok(a.ultimaActividad && b.ultimaActividad);
    for (const malo of [`${ids.ana}`, `${ids.ana},${ids.ana}`, '1,2,3,4,5,6,7', `${ids.ana},x`, `${ids.ana},,${ids.beto}`, `${ids.ana},-1`]) {
      const r = await pedir(base, 'GET', `/api/admin/academia/comparar/${malo}`, { galleta: admin });
      assert.equal(r.codigo, 400, malo);
      assert.equal(r.datos.error, 'comparar_no_valido');
    }
    assert.equal((await pedir(base, 'GET', `/api/admin/academia/comparar/${ids.ana},99999`, { galleta: admin })).codigo, 404);
  });
});

test('mi perfil: nombre para mostrar, avatar y meta; el avatar sale arriba, en el Grupo y en las listas; la meta nunca a los compañeros', async () => {
  await conAcademia(async ({ base, admin, ana, beto, ids }) => {
    const p0 = (await pedir(base, 'GET', '/api/yo/perfil', { galleta: ana })).datos.perfil;
    assert.deepEqual([p0.nombre, p0.nombreVisible, p0.avatar, p0.meta], ['ana', 'ana', null, null]);
    assert.deepEqual(p0.opciones.formas, [...FORMAS_AVATAR]);
    assert.equal((await pedir(base, 'GET', '/api/yo/perfil')).codigo, 401);
    const g = await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { nombreVisible: '  Ana   María\n', avatar: 'jet-rojo', meta: '  Aprobar\u2028 en diciembre  ' } });
    assert.equal(g.codigo, 200);
    assert.deepEqual([g.datos.perfil.nombreVisible, g.datos.perfil.avatar, g.datos.perfil.meta], ['Ana María', 'jet-rojo', 'Aprobar en diciembre']);
    for (const malo of [{ avatar: 'jet' }, { avatar: 'jet-rosa' }, { avatar: 'cohete-rojo' }, { avatar: 5 }, { avatar: 'jet-rojo-x' }, { avatar: '<svg>' }]) {
      const r = await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: malo });
      assert.equal(r.codigo, 400, JSON.stringify(malo));
    }
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { nombreVisible: '   ' } })).datos.error, 'nombre_visible_vacio');
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { meta: 'x'.repeat(500) } })).datos.perfil.meta.length, 120);
    await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { meta: 'Aprobar en diciembre' } });
    // Arriba (en /api/yo), en el Grupo de Beto (sin la meta) y en las listas del administrador.
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: ana })).datos.usuario.avatar, 'jet-rojo');
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: beto })).datos.usuario.avatar, null);
    await pedir(base, 'POST', '/api/academia/plan', { galleta: ana, datos: { plan: 'un_mes' } });
    const grupo = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: beto })).datos.grupo;
    const deAna = grupo.companeros.find(x => x.nombre === 'Ana María');
    assert.equal(deAna.avatar, 'jet-rojo');
    const textoBeto = JSON.stringify([grupo, (await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos]);
    assert.doesNotMatch(textoBeto, /diciembre/, 'la meta de Ana no llega a Beto');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos', { galleta: admin })).datos.alumnos.find(a => a.id === ids.ana).avatar, 'jet-rojo');
    assert.equal((await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios.find(u => u.id === ids.ana).avatar, 'jet-rojo');
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos.alumno;
    assert.deepEqual([f.avatar, f.meta, f.nombreVisible], ['jet-rojo', 'Aprobar en diciembre', 'Ana María']);
    // Beto solo toca lo suyo: su perfil no cambió nada de Ana.
    await pedir(base, 'POST', '/api/yo/perfil', { galleta: beto, datos: { avatar: 'globo-verde', id: ids.ana, usuarioId: ids.ana } });
    assert.equal((await pedir(base, 'GET', '/api/yo/perfil', { galleta: ana })).datos.perfil.avatar, 'jet-rojo');
    assert.equal((await pedir(base, 'GET', '/api/yo/perfil', { galleta: beto })).datos.perfil.avatar, 'globo-verde');
    // Sin avatar otra vez.
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { avatar: null } })).datos.perfil.avatar, null);
  });
});

test('cambiar el nombre de usuario: con la contraseña, libre (sin importar mayúsculas), y la sesión sigue', async () => {
  await conAcademia(async ({ base, db, ana, ids }) => {
    const cambiar = (galleta, nombre, clave = CLAVE) => pedir(base, 'POST', '/api/yo/usuario', { galleta, datos: { nombre, clave } });
    assert.equal((await cambiar(null, 'ana2')).codigo, 401);
    assert.equal((await cambiar(ana, 'ana2', 'mala')).datos.error, 'clave_actual_incorrecta');
    assert.equal((await cambiar(ana, 'BETO')).codigo, 409);
    assert.equal((await cambiar(ana, 'Junior')).datos.error, 'nombre_ocupado');
    for (const malo of ['a', 'con espacio', 'ñandú', '-empieza', 'x'.repeat(41)]) assert.equal((await cambiar(ana, malo)).datos.error, 'nombre_no_valido', malo);
    assert.equal((await cambiar(ana, 'ANA')).datos.error, 'nombre_igual');
    const r = await cambiar(ana, 'Ana.Piloto');
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.perfil.nombre, 'ana.piloto');
    assert.equal(r.datos.perfil.nombreVisible, 'ana.piloto', 'el nombre para mostrar era el usuario: sigue al nuevo');
    // La sesión sigue abierta, con el nombre nuevo.
    const yo = await pedir(base, 'GET', '/api/yo', { galleta: ana });
    assert.equal(yo.codigo, 200);
    assert.equal(yo.datos.usuario.nombre, 'ana.piloto');
    assert.equal(yo.datos.usuario.id, ids.ana);
    // Se entra con el nuevo; el viejo ya no existe.
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana.piloto', clave: CLAVE } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).codigo, 401);
    assert.equal(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'nombre_usuario_cambiado'").get().detalle, 'ana -> ana.piloto');
    // Con la contraseña temporal no se puede (primero hay que cambiarla).
    const temporal = crearUsuario(db, { nombre: 'carla', claveHash: await hashClave(CLAVE), debeCambiarClave: true });
    assert.ok(temporal);
    const carla = await entrar(base, 'carla');
    assert.equal((await cambiar(carla, 'carla2')).datos.error, 'debe_cambiar_clave');
    assert.equal((await pedir(base, 'POST', '/api/yo/perfil', { galleta: carla, datos: { avatar: 'jet-rojo' } })).datos.error, 'debe_cambiar_clave');
    // 5 contraseñas malas: espera (aunque después ponga la buena).
    for (let k = 0; k < 5; k++) await cambiar(ana, 'otra.cosa', 'mala');
    assert.equal((await cambiar(ana, 'otra.cosa')).codigo, 429);
  });
});

test('un alumno nunca ve lo de otro: sus rutas usan la sesión, y lo del administrador da 403', async () => {
  await conAcademia(async ({ base, ana, beto, ids }) => {
    const deAna = await hacerTema(base, ana, 'muestra-hipoxia', 2);
    await pedir(base, 'POST', '/api/yo/perfil', { galleta: ana, datos: { meta: 'secreto de ana' } });
    // Beto pide el intento de Ana por la ruta del alumno: no existe para él.
    assert.equal((await pedir(base, 'GET', `/api/academia/intentos/${deAna.intento.id}`, { galleta: beto })).codigo, 404);
    // Nada de Ana en lo que Beto recibe.
    const todo = JSON.stringify([
      (await pedir(base, 'GET', '/api/academia/progreso', { galleta: beto })).datos,
      (await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos,
      (await pedir(base, 'GET', '/api/yo/perfil', { galleta: beto })).datos,
      (await pedir(base, 'GET', '/api/yo', { galleta: beto })).datos,
    ]);
    assert.doesNotMatch(todo, /secreto de ana/);
    assert.equal(JSON.parse(todo)[0].puntosDebiles.total, 0);
    for (const ruta of [`/api/admin/academia/alumnos/${ids.ana}`, `/api/admin/academia/alumnos/${ids.ana}/ficha`, '/api/admin/academia/alumnos', '/api/admin/usuarios']) {
      assert.equal((await pedir(base, 'GET', ruta, { galleta: beto })).codigo, 403, ruta);
    }
  });
});

test('la ficha cuenta TODOS los intentos (la pantalla recibe los 500 más nuevos) y la lista usa la última actividad aunque haya salido', async () => {
  await conAcademia(async ({ base, db, admin, ana, ids }) => {
    const primero = await hacerTema(base, ana, 'muestra-hipoxia', 5); // aprobado, el más viejo
    const fila = db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, orden, total, respondidas, aciertos, empezado_en, terminado_en) VALUES (?, 'repaso', NULL, NULL, '[]', 1, 1, 1, ?, ?)");
    const ahora = new Date().toISOString();
    for (let k = 0; k < 520; k++) fila.run(ids.ana, ahora, ahora);
    const f = (await pedir(base, 'GET', `/api/admin/academia/alumnos/${ids.ana}/ficha`, { galleta: admin })).datos;
    assert.equal(f.intentos.length, 500);
    assert.equal(f.intentosTotal, 521);
    assert.equal(f.resumen.intentos, 521);
    assert.equal(f.resumen.aprobados, 1);
    assert.ok(!f.intentos.some(x => x.id === primero.intento.id), 'el más viejo no viaja a la pantalla');
    const tema = f.materias[0].temas.find(x => x.id === 'muestra-hipoxia');
    assert.deepEqual([tema.aprobado, tema.mejor, tema.veces], [true, 100, 1], 'pero sí cuenta en Por materia');
    // Ana sale: la lista de alumnos sigue mostrando su última actividad (de la fila «salida»).
    db.prepare("UPDATE sesiones SET ultimo_uso = '2099-01-01T00:00:00.000Z' WHERE usuario_id = ?").run(ids.ana);
    await pedir(base, 'POST', '/api/salir', { galleta: ana, datos: {} });
    const lista = (await pedir(base, 'GET', '/api/admin/academia/alumnos', { galleta: admin })).datos.alumnos;
    assert.equal(lista.find(a => a.id === ids.ana).ultimaActividad, '2099-01-01T00:00:00.000Z');
  });
});

test('los avatares: las mismas listas en el servidor y en la pantalla; tiempo de estudio y equipo', () => {
  assert.deepEqual([...avataresPantalla.FORMAS_AVATAR], [...FORMAS_AVATAR]);
  assert.deepEqual([...avataresPantalla.COLORES_AVATAR], [...COLORES_AVATAR]);
  assert.ok(avataresPantalla.avatarValido('globo-azul'));
  assert.ok(!avataresPantalla.avatarValido('globo-azul-x'));
  assert.ok(COLORES_AVATAR.includes(avataresPantalla.colorDeNombre('Ana')));
  // Ratos de respuestas seguidas (pausas de menos de 10 min) + 1 min por rato.
  assert.equal(tiempoDeEstudio([]), 0);
  assert.equal(tiempoDeEstudio(['2026-01-01T10:00:00Z']), 1);
  assert.equal(tiempoDeEstudio(['2026-01-01T10:00:00Z', '2026-01-01T10:05:00Z', '2026-01-01T10:09:00Z']), 10);
  assert.equal(tiempoDeEstudio(['2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z']), 2);
  assert.equal(equipoDe(IPHONE), 'iPhone · Safari');
  assert.equal(equipoDe(''), null);
  assert.equal(equipoDe('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537'), 'Windows · Chrome');
});
