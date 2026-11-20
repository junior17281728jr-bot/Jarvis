// Academia 0.14.19 («test out», pedido del dueño): quien ya sabe una materia toma su examen («Ir directo al examen») y,
// si lo APRUEBA (con la nota de aprobar de los exámenes de materia: 90 % por defecto), la materia queda «Convalidada por
// examen»: todos sus temas cuentan hechos, se abre la siguiente y el avance lo cuenta. Si no aprueba, nada se abre y se
// le dice cuánto le faltó y qué temas estudiar. Solo se agrega un registro en «ajustes» (nunca se borra nada).
// Reloj falso, azar fijo y contenido inventado (test/academia-muestra.js, test/oral-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from './ayuda.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { guardarOrdenCamino } from '../src/academia/orden-camino.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLAVE = 'una clave bien larga';
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const T0 = Date.parse('2026-11-17T14:00:00Z');
const FH = 'factores_humanos';

// Tres materias con clases: Factores humanos (2 temas), Sistemas (2) y Aerodinámica (1).
function paqueteTres() {
  const p = paqueteMuestra();
  const base = p.materias[0];
  const copias = [];
  for (const [k, id, cuantos] of [[1, 'sistemas', 2], [2, 'aerodinamica', 1]]) {
    const temas = base.temas.slice(0, cuantos).map(t => ({ ...t, id: `${t.id}-${k}`, titulo: `${t.titulo} ${k}`, preguntas: t.preguntas.map(q => `${q}-${k}`) }));
    for (const t of temas) for (const q of t.preguntas) copias.push({ ...p.preguntas.find(x => x.id === q.replace(/-\d$/, '')), id: q });
    p.materias.push({ id, temas });
  }
  p.preguntas.push(...copias);
  return p;
}
const TRES = paqueteTres();
const correctaDe = id => TRES.preguntas.find(q => q.id === id).original.correcta;
const malaDe = id => ['A', 'B', 'C'].find(l => l !== correctaDe(id));

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) o.headers.Cookie = galleta;
  if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) o.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, o);
  const c = await r.json().catch(() => ({}));
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: c, galleta: sc ? sc.split(';')[0] : null };
}
function azarFijo(semilla = 11) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  // 0.14.81: estas pruebas son del camino «Estricto» (un tema abre el siguiente), el de antes: el ajuste de verdad.
  guardarOrdenCamino(db, 'estricto');
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    for (const pq of [TRES, paqueteOralMuestra()]) {
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(pq) });
      assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
      for (const a of s.datos.faltan ?? []) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${a}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    }
    const ids = {};
    const g = {};
    for (const nombre of ['ana', 'beto']) {
      ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      g[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    await fn({ base, db, reloj, admin, ids, ...g });
  });
  db.close();
}
// Un examen o una práctica entera (con reloj o sin él) y su resultado.
async function hacer(c, galleta, datos, eleccion = correctaDe) {
  const i = await pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos });
  assert.ok([200, 201].includes(i.codigo), JSON.stringify(i.datos));
  const ruta = i.datos.examen?.reloj ? 'examen' : 'responder';
  for (const q of i.datos.preguntas) { c.reloj.avanzar(10_000); await pedir(c.base, 'POST', `/api/academia/intentos/${i.datos.id}/${ruta}`, { galleta, datos: { pregunta: q.id, elegida: eleccion(q.id) } }); }
  const r = await pedir(c.base, 'POST', `/api/academia/intentos/${i.datos.id}/terminar`, { galleta, datos: {} });
  assert.equal(r.codigo, 200, JSON.stringify(r.datos));
  return r.datos;
}
const camino = async (c, galleta) => (await pedir(c.base, 'GET', '/api/academia/camino', { galleta })).datos;
const materia = (cam, id) => cam.materias.find(m => m.id === id);
const ajuste = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const avanceDe = async (c, id) => (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${id}/avance`, { galleta: c.admin })).datos.avanceAlumno;
const tablas = db => ({
  intentos: db.prepare('SELECT * FROM academia_intentos ORDER BY id').all(),
  respuestas: db.prepare('SELECT * FROM academia_respuestas ORDER BY id').all(),
  ajustes: db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'academia.%' ORDER BY clave").all(),
});

test('convalidar: aprobar el examen directo convalida la materia, abre la siguiente y el avance cuenta sus temas', async () => {
  await conAcademia(async c => {
    const antes = await camino(c, c.ana);
    assert.equal(materia(antes, 'sistemas').estado, 'bloqueada');
    assert.equal(materia(antes, FH).examen.saltable, true, 'se ofrece «¿Ya lo sabes?»');
    assert.equal(antes.umbral, 90, 'la nota de aprobar de los exámenes de materia (no se inventa otra)');

    const res = await hacer(c, c.ana, { tipo: 'examen', materia: FH, saltar: true });
    assert.equal(res.aprobado, true);
    assert.deepEqual(res.convalidada, { pct: 100 });
    assert.equal(res.salto.pendientes, 0);
    assert.equal(res.falto, undefined);

    const cam = await camino(c, c.ana);
    const fh = materia(cam, FH);
    assert.equal(fh.estado, 'aprobada');
    assert.equal(fh.pct, 100);
    assert.equal(fh.convalidada.pct, 100);
    assert.ok(fh.temas.every(t => t.estado === 'aprobado' && t.convalidado === true && t.avance.pct === 100));
    assert.equal(fh.examen.aprobado, true);
    assert.equal(fh.examen.saltable, false);
    const sis = materia(cam, 'sistemas');
    assert.equal(sis.estado, 'abierta', 'se abrió la siguiente materia');
    assert.deepEqual(sis.temas.map(t => t.estado), ['abierto', 'bloqueado']);
    assert.equal(sis.convalidada, undefined);
    // Ya puede entrar a la clase de la siguiente.
    assert.equal((await pedir(c.base, 'GET', '/api/academia/temas/sistemas/muestra-hipoxia-1', { galleta: c.ana })).codigo, 200);

    // El avance del administrador (0.14.11): los 2 temas de 5 cuentan hechos; «Convalidada (examen 100 %)».
    const av = await avanceDe(c, c.ids.ana);
    assert.equal(av.tg.hechos, 2);
    assert.equal(av.tg.total, 5);
    assert.equal(av.tg.pct, 40);
    const b = av.tg.bloques.find(x => x.id === FH);
    assert.deepEqual(b.convalidada, { pct: 100 });
    assert.ok(b.temas.every(t => t.estado === 'hecho'));
    // «Cómo van todos»: las clases de la materia, todas; la ficha: el salto que la convalidó, marcado.
    const todos = (await pedir(c.base, 'GET', '/api/admin/academia/como-van', { galleta: c.admin })).datos.alumnos.find(x => x.id === c.ids.ana);
    assert.equal(todos.clases.materias.find(m => m.id === FH).temasAprobados, 2);
    assert.deepEqual(todos.clases.materias.find(m => m.id === FH).convalidada, { pct: 100 });
    assert.deepEqual(todos.examenes.materias.find(m => m.id === FH).convalidada, { pct: 100 });
    assert.equal(todos.cadaMateria.find(m => m.id === FH).temasHechos, 2);
    const ficha = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/ficha`, { galleta: c.admin })).datos;
    assert.ok(ficha.saltos, JSON.stringify(ficha).slice(0, 200));
    assert.equal(ficha.saltos.eventos[0].convalidada, true);
    assert.equal(ficha.saltos.convalidadas[FH].pct, 100);
    assert.equal(ficha.resumen.temasAprobados, 2);
    // El otro alumno no cambia.
    assert.equal(materia(await camino(c, c.beto), 'sistemas').estado, 'bloqueada');
  });
});

test('convalidar: si no aprueba, «te faltó X %» con los temas más flojos (nombres reales) y nada se abre', async () => {
  await conAcademia(async c => {
    // Mal toda «La hipoxia», bien «Ilusiones visuales»: 5 de 10 = 50 % (necesita 90).
    const res = await hacer(c, c.ana, { tipo: 'examen', materia: FH, saltar: true }, id => (id.startsWith('muestra-h') ? malaDe(id) : correctaDe(id)));
    assert.equal(res.aprobado, false);
    assert.equal(res.convalidada, undefined);
    assert.deepEqual(res.falto, { pct: 40, umbral: 90, temas: [{ tema: 'muestra-hipoxia', titulo: 'La hipoxia (muestra)', bien: 0, total: 5, pct: 0, abierto: true }] });
    const cam = await camino(c, c.ana);
    assert.deepEqual(materia(cam, FH).temas.map(t => t.estado), ['abierto', 'bloqueado'], 'no se salta ningún tema');
    assert.equal(materia(cam, FH).convalidada, undefined);
    assert.equal(materia(cam, 'sistemas').estado, 'bloqueada', 'no se abre la siguiente materia');
    assert.equal(ajuste(c.db, `academia.convalidadas.${c.ids.ana}`), null, 'nada guardado');
    assert.equal((await avanceDe(c, c.ids.ana)).tg.hechos, 0);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/temas/sistemas/muestra-hipoxia-1', { galleta: c.ana })).codigo, 403);
    // Con el examen de siempre (temas hechos) que no aprueba, también dice cuánto le faltó, y nunca convalida.
    await hacer(c, c.ana, { tipo: 'tema', materia: FH, tema: 'muestra-hipoxia' });
    await hacer(c, c.ana, { tipo: 'tema', materia: FH, tema: 'muestra-ilusiones' });
    const otra = await hacer(c, c.ana, { tipo: 'examen', materia: FH }, malaDe);
    assert.equal(otra.falto.pct, 90);
    assert.equal(otra.falto.temas.length, 2);
    assert.equal(ajuste(c.db, `academia.convalidadas.${c.ids.ana}`), null);
  });
});

test('convalidar: idempotente, solo agrega, y no toca a quien ya tenía datos (sin convalidar lo de antes)', async () => {
  await conAcademia(async c => {
    // Beto: un examen directo aprobado ANTES de la 0.14.19 (sin registro de convalidación) y una práctica aprobada.
    await hacer(c, c.beto, { tipo: 'tema', materia: FH, tema: 'muestra-hipoxia' });
    const viejo = await hacer(c, c.beto, { tipo: 'examen', materia: FH, saltar: true });
    c.db.prepare('DELETE FROM ajustes WHERE clave = ?').run(`academia.convalidadas.${c.ids.beto}`); // así estaba antes de la 0.14.19
    const camBeto = await camino(c, c.beto);
    assert.deepEqual(materia(camBeto, FH).temas.map(t => t.estado), ['aprobado', 'abierto'], 'lo de antes no se convalida solo');
    assert.equal(materia(camBeto, 'sistemas').estado, 'bloqueada');
    // Volver a entregar el examen viejo (ya terminado) no lo convalida ni cambia nada.
    const foto = tablas(c.db);
    await pedir(c.base, 'POST', `/api/academia/intentos/${viejo.id}/terminar`, { galleta: c.beto, datos: {} });
    await camino(c, c.beto);
    await avanceDe(c, c.ids.beto);
    await pedir(c.base, 'GET', '/api/admin/academia/como-van', { galleta: c.admin });
    assert.deepEqual(tablas(c.db), foto, 'mirar y re-entregar no escribe nada');

    // Ana convalida; re-entregar el mismo examen o aprobar/reprobar otro después no cambia el registro.
    const res = await hacer(c, c.ana, { tipo: 'examen', materia: FH, saltar: true }, id => (id === 'muestra-h1' ? malaDe(id) : correctaDe(id)));
    assert.equal(res.convalidada.pct, 90);
    const registro = ajuste(c.db, `academia.convalidadas.${c.ids.ana}`);
    assert.equal(JSON.parse(registro)[FH].intento, res.id);
    const otraVez = (await pedir(c.base, 'POST', `/api/academia/intentos/${res.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    assert.deepEqual(otraVez.convalidada, { pct: 90 });
    await hacer(c, c.ana, { tipo: 'examen', materia: FH }, malaDe);
    assert.equal(ajuste(c.db, `academia.convalidadas.${c.ids.ana}`), registro, 'el primero se queda');
    assert.equal(materia(await camino(c, c.ana), FH).estado, 'aprobada');
    // Las filas de Beto siguen tal cual (ningún dato de otro alumno se tocó).
    assert.deepEqual(tablas(c.db).intentos.filter(f => f.usuario_id === c.ids.beto), foto.intentos.filter(f => f.usuario_id === c.ids.beto));
    // Nada se borra: los intentos y respuestas de Ana siguen todos.
    assert.ok(tablas(c.db).intentos.filter(f => f.usuario_id === c.ids.ana).length >= 2);
  });
});

test('convalidar: una materia de más adelante también (el servidor lo deja): se abre la que le sigue y la de antes sigue igual', async () => {
  await conAcademia(async c => {
    const res = await hacer(c, c.ana, { tipo: 'examen', materia: 'sistemas', saltar: true });
    assert.deepEqual(res.convalidada, { pct: 100 });
    const cam = await camino(c, c.ana);
    assert.deepEqual(materia(cam, FH).temas.map(t => t.estado), ['abierto', 'bloqueado'], 'Factores humanos sigue por hacer');
    assert.equal(materia(cam, 'sistemas').estado, 'aprobada');
    assert.deepEqual(materia(cam, 'aerodinamica').temas.map(t => t.estado), ['abierto'], 'se abre la que sigue a la convalidada');
    assert.equal((await avanceDe(c, c.ids.ana)).tg.hechos, 2);
  });
});

test('convalidar (oral): aprobar el examen de un capítulo antes de sus temas lo deja «convalidado» (no hay candados que abrir)', async () => {
  await conAcademia(async c => {
    const oral = (await pedir(c.base, 'GET', '/api/academia/oral', { galleta: c.ana })).datos;
    const cap = oral.materias[0];
    const ex = (await pedir(c.base, 'POST', '/api/academia/oral/examen', { galleta: c.ana, datos: { materia: cap.id } })).datos;
    const r = (await pedir(c.base, 'POST', '/api/academia/oral/examen/entregar', { galleta: c.ana, datos: { examen: ex.examen, respuestas: Object.fromEntries(ex.preguntas.map(q => [q.id, 'A'])) } })).datos;
    assert.equal(r.aprobado, true);
    assert.deepEqual(r.convalidada, { pct: 100 });
    const despues = (await pedir(c.base, 'GET', '/api/academia/oral', { galleta: c.ana })).datos.materias.find(m => m.id === cap.id);
    assert.deepEqual(despues.convalidada, { pct: 100 });
    const av = await avanceDe(c, c.ids.ana);
    const b = av.oral.bloques.find(x => x.id === cap.id);
    assert.ok(b.temas.every(t => t.estado === 'hecho'));
    assert.deepEqual(b.convalidada, { pct: 100 });
    // Otra vez: no cambia el registro. Uno reprobado nunca convalida.
    const ex2 = (await pedir(c.base, 'POST', '/api/academia/oral/examen', { galleta: c.ana, datos: { materia: cap.id } })).datos;
    const r2 = (await pedir(c.base, 'POST', '/api/academia/oral/examen/entregar', { galleta: c.ana, datos: { examen: ex2.examen, respuestas: {} } })).datos;
    assert.equal(r2.convalidada, undefined);
    const otro = oral.materias[1];
    const ex3 = (await pedir(c.base, 'POST', '/api/academia/oral/examen', { galleta: c.ana, datos: { materia: otro.id } })).datos;
    const r3 = (await pedir(c.base, 'POST', '/api/academia/oral/examen/entregar', { galleta: c.ana, datos: { examen: ex3.examen, respuestas: {} } })).datos;
    assert.equal(r3.aprobado, false);
    assert.equal(r3.convalidada, undefined);
    assert.ok((await avanceDe(c, c.ids.ana)).oral.bloques.find(x => x.id === otro.id).temas.every(t => t.estado !== 'hecho'));
  });
});

test('convalidar: los textos (es/en), el botón en la tarjeta de la materia y la hoja con la regla', () => {
  const ES = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'));
  const EN = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'en.json'), 'utf8'));
  assert.equal(ES['acad.convalidar.boton'], '¿Ya lo sabes? Toma el examen y pásala');
  assert.equal(ES['acad.convalidar.sello'], 'Convalidada por examen ✓');
  assert.equal(ES['acad.convalidar.falto'], 'Te faltó {pct} %: estudia estos temas');
  assert.equal(ES['av.convalidada'], 'Convalidada (examen {pct})');
  for (const k of Object.keys(ES).filter(x => x.includes('convalid'))) assert.ok(k in EN, `falta ${k} en inglés`);
  const app = readFileSync(join(RAIZ, 'public', 'app.js'), 'utf8');
  assert.match(app, /ofrecerConvalidar\(m\)/);
  assert.match(app, /acad\.convalidar\.regla/);
  const saltos = readFileSync(join(RAIZ, 'src', 'academia', 'saltos.js'), 'utf8');
  assert.doesNotMatch(saltos, /el examen aprobado así no los aprueba/);
});
