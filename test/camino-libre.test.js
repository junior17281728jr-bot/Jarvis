// Pruebas de la Academia 0.14.81: el «Orden del camino» (src/academia/orden-camino.js). Pedido del dueño: «obvio que
// inicia en Factores Humanos, pero que pueda saltarme e irme al tema que quiero; pero lo recomendable siempre ir paso a
// paso desde Factores Humanos».
//  - Libre (lo de siempre): todos los temas con clases se abren (clase, tarjetas, práctica, reto, instructor), sin 403.
//  - Lo recomendado = el primer tema sin aprobar desde Factores Humanos: «Continuar», «Ahora en» y el tema resaltado;
//    lo de más adelante, «adelantado» (sin candado).
//  - El aviso «Te recomendamos ir en orden…»: «Seguir aquí» lo esconde en ese tema (por alumno, en el servidor);
//    «Ya sé lo anterior: tomar el examen»: aprobado, convalida la materia y lo recomendado pasa adelante; si no, nada se cierra.
//  - Estricto: lo de antes (un tema abre el siguiente; 403 tema_bloqueado).
//  - El ajuste es solo del administrador (401 / 403 / 400).
//  - El % del curso, el avance y los certificados dicen lo mismo con los dos.
// Reloj fijo y contenido inventado (test/academia-muestra.js, test/oral-muestra.js): nada espera ni llama a la IA.
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { ordenCamino, ORDEN_CAMINO_POR_DEFECTO } from '../src/academia/orden-camino.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const CLAVE = 'una clave bien larga';
const AHORA = Date.parse('2026-11-20T15:00:00Z');

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
const PAQUETE = paqueteTres();
const correcta = id => PAQUETE.preguntas.find(q => q.id === id).original.correcta;

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

async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async base => {
    const admin = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } });
    assert.equal(admin.codigo, 201);
    for (const pq of [paqueteTres(), paqueteOralMuestra()]) {
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(pq) });
      assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
      for (const a of s.datos.faltan ?? []) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${a}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    }
    const ids = {};
    const galletas = {};
    for (const n of ['ana', 'beto']) {
      ids[n] = crearUsuario(db, { nombre: n, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      galletas[n] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: n, clave: CLAVE } })).galleta;
      assert.ok(galletas[n]);
    }
    const camino = async g => { const r = await pedir(base, 'GET', '/api/academia/camino', { galleta: g }); assert.equal(r.codigo, 200); return r.datos; };
    const leccion = (g, m, t) => pedir(base, 'GET', `/api/academia/temas/${m}/${t}`, { galleta: g });
    // Hace la práctica de un tema por las rutas, con todo bien (aprueba) o todo mal.
    const hacerTema = async (g, materia, tema, { bien = true } = {}) => {
      const i = await pedir(base, 'POST', '/api/academia/intentos', { galleta: g, datos: { tipo: 'tema', materia, tema } });
      assert.equal(i.codigo, 201, JSON.stringify(i.datos));
      for (const q of i.datos.preguntas) {
        const elegida = bien ? correcta(q.id) : ['A', 'B', 'C'].find(l => l !== correcta(q.id));
        assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.datos.id}/responder`, { galleta: g, datos: { pregunta: q.id, elegida } })).codigo, 200);
      }
      const fin = await pedir(base, 'POST', `/api/academia/intentos/${i.datos.id}/terminar`, { galleta: g, datos: {} });
      assert.equal(fin.codigo, 200);
      return fin.datos;
    };
    const ponerOrden = async orden => {
      const r = await pedir(base, 'POST', '/api/admin/academia/orden-camino', { galleta: admin.galleta, datos: { orden } });
      assert.equal(r.codigo, 200, JSON.stringify(r.datos));
      assert.equal(r.datos.ordenCamino, orden);
    };
    const avance = async id => (await pedir(base, 'GET', `/api/admin/academia/alumnos/${id}/avance`, { galleta: admin.galleta })).datos.avanceAlumno;
    await fn({ base, db, admin: admin.galleta, ids, g: galletas, camino, leccion, hacerTema, ponerOrden, avance });
  });
  db.close();
}

const todosLosTemas = c => c.materias.flatMap(m => m.temas.map(t => ({ materia: m.id, ...t })));

test('libre es el ajuste por defecto: todos los temas abren (clase, tarjetas, leído, práctica, reto, instructor), nada «bloqueado», sin 403', async () => {
  await conAcademia(async ({ base, db, g, camino, leccion, hacerTema }) => {
    assert.equal(ORDEN_CAMINO_POR_DEFECTO, 'libre');
    assert.equal(ordenCamino(db), 'libre');
    const c = await camino(g.ana);
    assert.equal(c.ordenCamino, 'libre');
    const temas = todosLosTemas(c);
    assert.equal(temas.length, 5);
    assert.ok(temas.every(t => t.estado === 'abierto'), 'ningún tema bloqueado');
    assert.ok(c.materias.every(m => m.estado !== 'bloqueada'));
    for (const t of temas) {
      const l = await leccion(g.ana, t.materia, t.id);
      assert.equal(l.codigo, 200, `${t.materia}/${t.id}`);
      assert.equal(l.datos.estado, 'abierto');
      assert.equal((await pedir(base, 'POST', `/api/academia/temas/${t.materia}/${t.id}/paso`, { galleta: g.ana, datos: { paso: 1, total: 4 } })).codigo, 200);
      const reto = await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'reto', materia: t.materia, tema: t.id } });
      assert.notEqual(reto.codigo, 403, `reto ${t.materia}/${t.id}`);
      const inst = await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'instructor', materia: t.materia, tema: t.id } });
      assert.notEqual(inst.codigo, 403, `instructor ${t.materia}/${t.id}`);
    }
    // El reto de toda una materia de más adelante, también.
    assert.notEqual((await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'reto', materia: 'aerodinamica' } })).codigo, 403);
    // Aprueba el último tema del camino (Aerodinámica) sin hacer nada antes: cuenta como siempre.
    const fin = await hacerTema(g.ana, 'aerodinamica', 'muestra-hipoxia-2');
    assert.equal(fin.aprobado, true);
    const despues = await camino(g.ana);
    assert.equal(despues.materias.find(m => m.id === 'aerodinamica').estado, 'aprobada');
    assert.equal(despues.materias.find(m => m.id === 'aerodinamica').examen.disponible, true, 'el examen de materia: con todos sus temas aprobados, como siempre');
    assert.equal(despues.materias.find(m => m.id === 'sistemas').examen.disponible, false);
    assert.equal(despues.materias.find(m => m.id === 'sistemas').examen.saltable, true, '«Ir directo» sigue');
  });
});

test('lo recomendado y «Continuar»: el alumno nuevo empieza en Factores Humanos; saltar adelante no lo mueve; aprobar en orden sí', async () => {
  await conAcademia(async ({ base, ids, g, camino, hacerTema, avance }) => {
    let c = await camino(g.ana);
    assert.deepEqual(c.recomendado, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.deepEqual(c.continuar, { materia: 'factores_humanos', tema: 'muestra-hipoxia' }, 'Inicio: «Continuar» lleva a Factores Humanos');
    let temas = todosLosTemas(c);
    assert.deepEqual(temas.filter(t => t.recomendado).map(t => `${t.materia}/${t.id}`), ['factores_humanos/muestra-hipoxia']);
    assert.deepEqual(temas.filter(t => t.adelantado).map(t => `${t.materia}/${t.id}`),
      ['factores_humanos/muestra-ilusiones', 'sistemas/muestra-hipoxia-1', 'sistemas/muestra-ilusiones-1', 'aerodinamica/muestra-hipoxia-2']);
    assert.deepEqual(c.materias.filter(m => m.adelantada).map(m => m.id), ['sistemas', 'aerodinamica']);
    assert.equal((await avance(ids.ana)).tg.ahora, null, 'sin nada hecho: «sin empezar»');

    // Se va directo a Sistemas, tema 2 (ve tarjetas y lo aprueba): lo recomendado sigue en Factores Humanos.
    await pedir(base, 'POST', '/api/academia/temas/sistemas/muestra-ilusiones-1/paso', { galleta: g.ana, datos: { paso: 2, total: 5 } });
    await hacerTema(g.ana, 'sistemas', 'muestra-ilusiones-1');
    c = await camino(g.ana);
    assert.deepEqual(c.recomendado, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.deepEqual(c.continuar, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    let a = await avance(ids.ana);
    assert.deepEqual([a.tg.ahora.id, a.tg.ahora.tema], ['factores_humanos', 'muestra-hipoxia'], '«Ahora en» = lo recomendado, no lo último que hizo');
    assert.deepEqual([a.tg.hechos, a.tg.total], [1, 5]);

    // Empieza lo recomendado (tarjeta 2 de 5): «Continuar» sigue ahí, en su tarjeta.
    await pedir(base, 'POST', '/api/academia/temas/factores_humanos/muestra-hipoxia/paso', { galleta: g.ana, datos: { paso: 2, total: 5 } });
    c = await camino(g.ana);
    assert.deepEqual(c.continuar, { materia: 'factores_humanos', tema: 'muestra-hipoxia', paso: 2, total: 5 });
    // Lo aprueba: lo recomendado pasa al tema 2 de Factores Humanos.
    await hacerTema(g.ana, 'factores_humanos', 'muestra-hipoxia');
    c = await camino(g.ana);
    assert.deepEqual(c.recomendado, { materia: 'factores_humanos', tema: 'muestra-ilusiones' });
    assert.deepEqual(c.continuar, { materia: 'factores_humanos', tema: 'muestra-ilusiones' });
    temas = todosLosTemas(c);
    assert.equal(temas.find(t => t.id === 'muestra-ilusiones-1').estado, 'aprobado');
    assert.equal(temas.find(t => t.id === 'muestra-ilusiones-1').adelantado, undefined, 'lo aprobado no es «adelantado»');
    a = await avance(ids.ana);
    assert.equal(a.tg.ahora.tema, 'muestra-ilusiones');
    // Otro alumno no se mueve por lo de Ana.
    assert.deepEqual((await camino(g.beto)).recomendado, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
  });
});

test('el aviso «Te recomendamos ir en orden…»: solo en un tema adelantado, con lo recomendado y su examen; «Seguir aquí» lo esconde en ESE tema (por alumno) y «Continuar» no cambia', async () => {
  await conAcademia(async ({ base, g, camino, leccion }) => {
    // Lo recomendado: sin aviso.
    let l = (await leccion(g.ana, 'factores_humanos', 'muestra-hipoxia')).datos;
    assert.equal(l.adelantado, undefined);
    assert.equal(l.avisoOrden, undefined);
    // Más adelante: con el aviso, a dónde ir y si se puede tomar el examen de esa materia.
    l = (await leccion(g.ana, 'sistemas', 'muestra-hipoxia-1')).datos;
    assert.equal(l.adelantado, true);
    assert.equal(l.avisoOrden, true);
    assert.deepEqual(l.recomendado, { materia: 'factores_humanos', tema: 'muestra-hipoxia', titulo: 'La hipoxia (muestra)', examen: true });
    // Sin sesión o con datos malos, no.
    assert.equal((await pedir(base, 'POST', '/api/academia/aviso-orden', { datos: { materia: 'sistemas', tema: 'muestra-hipoxia-1' } })).codigo, 401);
    assert.equal((await pedir(base, 'POST', '/api/academia/aviso-orden', { galleta: g.ana, datos: {} })).codigo, 400);
    assert.equal((await pedir(base, 'POST', '/api/academia/aviso-orden', { galleta: g.ana, datos: { materia: 'sistemas', tema: 'no-existe' } })).codigo, 404);
    // «Seguir aquí» en Sistemas, tema 1: ahí ya no sale.
    const r = await pedir(base, 'POST', '/api/academia/aviso-orden', { galleta: g.ana, datos: { materia: 'sistemas', tema: 'muestra-hipoxia-1' } });
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos, { visto: true, materia: 'sistemas', tema: 'muestra-hipoxia-1' });
    l = (await leccion(g.ana, 'sistemas', 'muestra-hipoxia-1')).datos;
    assert.deepEqual([l.adelantado, l.avisoOrden], [true, false], 'sigue adelantado, pero el aviso no sale en este tema');
    // En otro tema adelantado, sí (se esconde por tema).
    assert.equal((await leccion(g.ana, 'aerodinamica', 'muestra-hipoxia-2')).datos.avisoOrden, true);
    // Otra vez: no cambia nada (idempotente).
    assert.equal((await pedir(base, 'POST', '/api/academia/aviso-orden', { galleta: g.ana, datos: { materia: 'sistemas', tema: 'muestra-hipoxia-1' } })).codigo, 200);
    // «Continuar» sigue en lo recomendado.
    const c = await camino(g.ana);
    assert.deepEqual(c.continuar, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.deepEqual(c.recomendado, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    // Beto todavía no lo vio en ningún tema.
    assert.equal((await leccion(g.beto, 'sistemas', 'muestra-hipoxia-1')).datos.avisoOrden, true);
  });
});

// «Ya sé lo anterior: tomar el examen»: el examen directo de la materia recomendada («¿Ya lo sabes? Toma el examen»).
async function examenDirecto({ base, g }, materia, { bien }) {
  const i = await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'examen', materia, saltar: true } });
  assert.equal(i.codigo, 201, JSON.stringify(i.datos));
  for (const q of i.datos.preguntas) {
    const elegida = bien ? correcta(q.id) : ['A', 'B', 'C'].find(l => l !== correcta(q.id));
    // El examen de materia va con reloj (su propia ruta); el reloj de la prueba está quieto: siempre a tiempo.
    const ruta = i.datos.examen?.reloj ? 'examen' : 'responder';
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${i.datos.id}/${ruta}`, { galleta: g.ana, datos: { pregunta: q.id, elegida } })).codigo, 200);
  }
  const fin = await pedir(base, 'POST', `/api/academia/intentos/${i.datos.id}/terminar`, { galleta: g.ana, datos: {} });
  assert.equal(fin.codigo, 200);
  return fin.datos;
}

test('«Ya sé lo anterior: tomar el examen» y lo aprueba: la materia queda convalidada y lo recomendado pasa adelante (el aviso ya no la recomienda)', async () => {
  await conAcademia(async c => {
    const { g, ids, camino, leccion, avance } = c;
    const fin = await examenDirecto(c, 'factores_humanos', { bien: true });
    assert.equal(fin.aprobado, true);
    const cam = await camino(g.ana);
    const fh = cam.materias.find(m => m.id === 'factores_humanos');
    assert.ok(fh.convalidada, 'convalidada por examen, como siempre');
    assert.ok(fh.temas.every(t => t.estado === 'aprobado' && t.convalidado === true));
    assert.deepEqual(cam.recomendado, { materia: 'sistemas', tema: 'muestra-hipoxia-1' });
    assert.deepEqual(cam.continuar, { materia: 'sistemas', tema: 'muestra-hipoxia-1' });
    assert.equal(cam.materias.find(m => m.id === 'sistemas').adelantada, undefined);
    // El aviso en un tema de más adelante ya recomienda Sistemas, no Factores Humanos.
    const l = (await leccion(g.ana, 'aerodinamica', 'muestra-hipoxia-2')).datos;
    assert.equal(l.recomendado.materia, 'sistemas');
    // Sistemas, tema 1 es lo recomendado: sin aviso.
    assert.equal((await leccion(g.ana, 'sistemas', 'muestra-hipoxia-1')).datos.avisoOrden, undefined);
    const a = await avance(ids.ana);
    assert.deepEqual([a.tg.hechos, a.tg.ahora.id, a.tg.ahora.tema], [2, 'sistemas', 'muestra-hipoxia-1']);
  });
});

test('«Ya sé lo anterior: tomar el examen» con la materia a medias (tema 1 aprobado): aprobado, la convalida igual y lo recomendado pasa a Sistemas', async () => {
  await conAcademia(async c => {
    const { g, camino, leccion, hacerTema } = c;
    await hacerTema(g.ana, 'factores_humanos', 'muestra-hipoxia');
    let cam = await camino(g.ana);
    assert.deepEqual(cam.recomendado, { materia: 'factores_humanos', tema: 'muestra-ilusiones' });
    assert.equal((await leccion(g.ana, 'sistemas', 'muestra-hipoxia-1')).datos.recomendado.examen, true, 'el aviso ofrece el examen');
    const fin = await examenDirecto(c, 'factores_humanos', { bien: true });
    assert.equal(fin.aprobado, true);
    cam = await camino(g.ana);
    const fh = cam.materias.find(m => m.id === 'factores_humanos');
    assert.ok(fh.convalidada, 'convalidada aunque ya tenía un tema hecho');
    assert.ok(fh.temas.every(t => t.estado === 'aprobado'));
    assert.deepEqual(cam.recomendado, { materia: 'sistemas', tema: 'muestra-hipoxia-1' });
    assert.deepEqual(cam.continuar, { materia: 'sistemas', tema: 'muestra-hipoxia-1' });
  });
});

test('«Ya sé lo anterior: tomar el examen» y no lo aprueba: nada se cierra, puede estudiar donde quiera y la recomendación queda', async () => {
  await conAcademia(async c => {
    const { base, g, camino, leccion } = c;
    const fin = await examenDirecto(c, 'factores_humanos', { bien: false });
    assert.equal(fin.aprobado, false);
    const cam = await camino(g.ana);
    assert.equal(cam.materias.find(m => m.id === 'factores_humanos').convalidada, undefined);
    assert.deepEqual(cam.recomendado, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.deepEqual(cam.continuar, { materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.ok(todosLosTemas(cam).every(t => t.estado === 'abierto'), 'nada se cierra');
    for (const t of todosLosTemas(cam)) assert.equal((await leccion(g.ana, t.materia, t.id)).codigo, 200);
    const i = await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'tema', materia: 'aerodinamica', tema: 'muestra-hipoxia-2' } });
    assert.equal(i.codigo, 201);
    const l = (await leccion(g.ana, 'sistemas', 'muestra-ilusiones-1')).datos;
    assert.deepEqual([l.avisoOrden, l.recomendado.materia, l.recomendado.examen], [true, 'factores_humanos', true], 'el aviso sigue recomendando Factores Humanos');
  });
});

test('Estricto: lo de antes (un tema abre el siguiente, 403 tema_bloqueado, sin «adelantado»); volver a libre no pierde nada', async () => {
  await conAcademia(async ({ base, g, camino, leccion, hacerTema, ponerOrden }) => {
    // En libre, Ana aprueba Aerodinámica (el último tema).
    await hacerTema(g.ana, 'aerodinamica', 'muestra-hipoxia-2');
    await ponerOrden('estricto');
    let c = await camino(g.ana);
    assert.equal(c.ordenCamino, 'estricto');
    const estados = c.materias.flatMap(m => m.temas.map(t => `${m.id}/${t.id}:${t.estado}`));
    assert.deepEqual(estados, ['factores_humanos/muestra-hipoxia:abierto', 'factores_humanos/muestra-ilusiones:bloqueado',
      'sistemas/muestra-hipoxia-1:bloqueado', 'sistemas/muestra-ilusiones-1:bloqueado', 'aerodinamica/muestra-hipoxia-2:aprobado']);
    assert.ok(todosLosTemas(c).every(t => t.adelantado === undefined && t.recomendado === undefined));
    assert.equal(c.materias.find(m => m.id === 'sistemas').estado, 'bloqueada');
    assert.equal(c.continuar, null, 'Estricto: «Continuar» como antes (la última clase abierta que empezó)');
    const cerrado = await leccion(g.ana, 'sistemas', 'muestra-hipoxia-1');
    assert.deepEqual([cerrado.codigo, cerrado.datos.error], [403, 'tema_bloqueado']);
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'tema', materia: 'sistemas', tema: 'muestra-hipoxia-1' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/academia/temas/sistemas/muestra-hipoxia-1/paso', { galleta: g.ana, datos: { paso: 1, total: 4 } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'reto', materia: 'sistemas', tema: 'muestra-hipoxia-1' } })).codigo, 403);
    // «Ir directo al examen» sigue igual en Estricto.
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'examen', materia: 'sistemas' } })).codigo, 403);
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: g.ana, datos: { tipo: 'examen', materia: 'sistemas', saltar: true } })).codigo, 201);
    // De vuelta a libre: todo abierto y lo aprobado sigue aprobado.
    await ponerOrden('libre');
    c = await camino(g.ana);
    assert.ok(todosLosTemas(c).every(t => t.estado !== 'bloqueado'));
    assert.equal(todosLosTemas(c).find(t => t.id === 'muestra-hipoxia-2').estado, 'aprobado');
    assert.equal((await leccion(g.ana, 'sistemas', 'muestra-hipoxia-1')).codigo, 200);
  });
});

test('el ajuste es solo del administrador: 401 sin sesión, 403 a un alumno, 400 si no vale; Contenido lo trae', async () => {
  await conAcademia(async ({ base, db, admin, g }) => {
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/orden-camino', { datos: { orden: 'estricto' } })).codigo, 401);
    const alumno = await pedir(base, 'POST', '/api/admin/academia/orden-camino', { galleta: g.ana, datos: { orden: 'estricto' } });
    assert.equal(alumno.codigo, 403);
    assert.equal(alumno.datos.ordenCamino, undefined);
    assert.equal(ordenCamino(db), 'libre', 'un alumno no lo cambia');
    for (const malo of ['', 'Estricto', 'abierto', 1, null, true]) {
      assert.equal((await pedir(base, 'POST', '/api/admin/academia/orden-camino', { galleta: admin, datos: { orden: malo } })).codigo, 400, String(malo));
    }
    assert.equal(ordenCamino(db), 'libre');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos.ordenCamino, 'libre');
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/orden-camino', { galleta: admin, datos: { orden: 'estricto' } })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos.ordenCamino, 'estricto');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia', { galleta: g.ana })).codigo, 403);
  });
});

test('el % del curso, el avance, la carrera y los certificados dicen lo mismo en libre y en Estricto (completo = todo aprobado)', async () => {
  await conAcademia(async ({ base, db, ids, g, hacerTema, ponerOrden, avance }) => {
    // Ana hace todo en libre, de atrás para adelante.
    for (const [m, t] of [['aerodinamica', 'muestra-hipoxia-2'], ['sistemas', 'muestra-ilusiones-1'], ['sistemas', 'muestra-hipoxia-1'], ['factores_humanos', 'muestra-ilusiones']]) await hacerTema(g.ana, m, t);
    const foto = async () => {
      const p = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: g.ana })).datos;
      const cert = (await pedir(base, 'GET', '/api/academia/certificados', { galleta: g.ana })).datos;
      const av = await avance(ids.ana);
      const carrera = (await pedir(base, 'GET', '/api/academia/carrera', { galleta: g.ana })).datos;
      return {
        carrera: carrera.yo?.avance?.tg?.pct ?? null,
        curso: p.curso, materias: p.materias.map(m => ({ id: m.id, pct: m.pct, temas: m.temas.filter(t => t.estado === 'aprobado').map(t => t.id) })),
        cert, pct: av.tg.pct, hechos: av.tg.hechos, terminado: av.tg.terminado,
      };
    };
    const libre = await foto();
    assert.deepEqual([libre.hechos, libre.terminado], [4, false]);
    assert.equal(libre.carrera, libre.pct, 'la carrera usa el mismo %');
    await ponerOrden('estricto');
    assert.deepEqual(await foto(), libre, 'el mismo progreso y los mismos certificados');
    await ponerOrden('libre');
    // Aprueba el último que faltaba: completo con los dos.
    await hacerTema(g.ana, 'factores_humanos', 'muestra-hipoxia');
    const completo = await foto();
    assert.deepEqual([completo.hechos, completo.pct, completo.terminado], [5, 100, true]);
    await ponerOrden('estricto');
    assert.deepEqual(await foto(), completo);
    // Nada se borró: las prácticas siguen todas en la base.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academia_intentos WHERE usuario_id = ? AND tipo = 'tema' AND aprobado = 1").get(ids.ana).n, 5);
  });
});
