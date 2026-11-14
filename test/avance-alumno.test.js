// Pruebas de la Academia 0.14.11: el AVANCE de cada alumno para el administrador («Cómo van todos» y su ficha).
//  - El % del curso suma TODOS los temas de TODAS las materias con clases (pesado por temas): ni el % de una sola materia
//    (lo que se veía antes) ni el promedio de las materias. Lo mismo en el oral (por capítulo).
//  - «Ahora en»: el tema de lo último que hizo (o el siguiente sin hacer), en el Test Guide y en el oral.
//  - Al día: lo nuevo se ve en el siguiente pedido (sin memoria en el servidor ni en el navegador: no-store).
//  - Solo el administrador (401 / 403).
// Reloj falso y fechas escritas a mano: nada espera. Contenido inventado (test/academia-muestra.js, test/oral-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { MATERIAS, MATERIAS_ORAL } from '../src/academia/formato.js';
import { posicionActual } from '../src/academia/avance-alumno.js';
import { textoAhora, pctTg } from '../public/admin-avance.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const CLAVE = 'una clave bien larga';
const AHORA = Date.parse('2026-11-13T15:00:00Z');
const MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();

// Tres materias con clases: Factores humanos (2 temas), Sistemas (2) y Aerodinámica (1). Las otras 8, «pronto».
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

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) o.headers.Cookie = galleta;
  if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) o.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, o);
  const c = await r.json().catch(() => ({}));
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: c, galleta: sc ? sc.split(';')[0] : null, cache: r.headers.get('cache-control') };
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
    const ana = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const beto = crearUsuario(db, { nombre: 'beto', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const avance = async id => {
      const todos = await pedir(base, 'GET', '/api/admin/academia/como-van/avance', { galleta: admin.galleta });
      assert.equal(todos.codigo, 200);
      const uno = await pedir(base, 'GET', `/api/admin/academia/alumnos/${id}/avance`, { galleta: admin.galleta });
      assert.equal(uno.codigo, 200);
      const a = todos.datos.alumnos.find(x => x.id === id).avanceAlumno;
      assert.deepEqual(uno.datos.avanceAlumno, a, 'la lista y la ficha dicen lo mismo');
      return a;
    };
    await fn({ base, db, admin: admin.galleta, ana, beto, avance });
  });
  db.close();
}

const ponerAjuste = (db, clave, valor) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(AHORA));
function intento(db, usuario, { tipo = 'tema', materia, tema = null, aprobado, en, terminado = true }) {
  return Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, ?, ?, ?, 5, 5, ?, ?, ?, ?, '[]')`).run(usuario, tipo, materia, tema, aprobado ? 5 : 2, terminado ? (aprobado ? 1 : 0) : null, iso(en - MIN), terminado ? iso(en) : null).lastInsertRowid);
}
function respuesta(db, usuario, { materia, tema, pregunta, en, intentoId = null }) {
  db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, ?, ?, 'A', 1, ?, ?)`)
    .run(intentoId, usuario, pregunta, materia, tema, iso(en).slice(0, 10), iso(en));
}
const estados = b => b.temas.map(t => t.estado);

test('posicionActual: el tema de lo último; si ya está hecho, el siguiente sin hacer; sin fechas, el primero sin hacer', () => {
  const bloques = [
    { id: 'a', temas: [{ id: 'a1', estado: 'hecho' }, { id: 'a2', estado: 'nuevo' }] },
    { id: 'b', temas: [{ id: 'b1', estado: 'hecho' }, { id: 'b2', estado: 'empezado' }, { id: 'b3', estado: 'nuevo' }] },
  ];
  assert.deepEqual(posicionActual(bloques, { bloque: 'b', tema: 'b2' }), { bloque: 1, tema: 1 });
  assert.deepEqual(posicionActual(bloques, { bloque: 'b', tema: 'b1' }), { bloque: 1, tema: 1 }, 'hecho → el siguiente de esa materia');
  assert.deepEqual(posicionActual(bloques, { bloque: 'b', tema: null }), { bloque: 1, tema: 1 }, 'su examen → el primero sin hacer de esa materia');
  assert.deepEqual(posicionActual(bloques, null), { bloque: 0, tema: 1 });
  const todo = [{ id: 'a', temas: [{ id: 'a1', estado: 'hecho' }] }];
  assert.equal(posicionActual(todo, { bloque: 'a', tema: 'a1' }), null);
});

test('el % del curso suma TODOS los temas de TODAS las materias (pesado por temas), no una sola materia; y dónde va', async () => {
  await conAcademia(async ({ db, ana, avance }) => {
    // Sin nada: 0 %, «sin empezar», las 11 materias en orden (8 «pronto»), 5 temas en total.
    let a = await avance(ana);
    assert.deepEqual(a.tg.bloques.map(b => b.id), [...MATERIAS]);
    assert.deepEqual(a.tg.bloques.filter(b => !b.pronto).map(b => [b.id, b.temas.length]), [['factores_humanos', 2], ['sistemas', 2], ['aerodinamica', 1]]);
    assert.deepEqual([a.tg.pct, a.tg.hechos, a.tg.total, a.tg.ahora, a.tg.empezo], [0, 0, 5, null, false]);

    // Aprueba el tema 1 de Factores humanos y el ÚNICO tema de Aerodinámica (en ese orden de tiempo).
    intento(db, ana, { materia: 'factores_humanos', tema: 'muestra-hipoxia', aprobado: true, en: AHORA - 60 * MIN });
    intento(db, ana, { materia: 'aerodinamica', tema: 'muestra-hipoxia-2', aprobado: true, en: AHORA - 50 * MIN });
    a = await avance(ana);
    const pctDe = id => a.tg.bloques.find(b => b.id === id).pct;
    assert.deepEqual([pctDe('factores_humanos'), pctDe('sistemas'), pctDe('aerodinamica')], [50, 0, 100]);
    // 2 de 5 temas = 40 % (no 100 % de una materia, ni el promedio de materias 50 %).
    const conClases = a.tg.bloques.filter(b => !b.pronto);
    const suma = conClases.reduce((n, b) => n + b.hechos, 0) * 100 / conClases.reduce((n, b) => n + b.temas.length, 0);
    assert.equal(a.tg.pct, Math.floor(suma));
    assert.deepEqual([a.tg.pct, a.tg.hechos, a.tg.total], [40, 2, 5]);
    assert.notEqual(a.tg.pct, Math.floor(conClases.reduce((n, b) => n + b.pct, 0) / conClases.length));
    // Lo último fue Aerodinámica, ya entera: sigue el siguiente sin hacer (Factores humanos está antes, así que el
    // siguiente DESPUÉS de Aerodinámica no hay; el primero sin hacer de todo el curso: Factores humanos, tema 2).
    assert.deepEqual(a.tg.ahora, { id: 'factores_humanos', numero: 1, tema: 'muestra-ilusiones', temaNumero: 2, temas: 2, titulo: 'Ilusiones visuales (muestra)' });
    assert.equal(a.tg.bloques.find(b => b.actual).id, 'factores_humanos');

    // Va directo al examen de Sistemas (lo aprueba) y después ve tarjetas del tema 2 de Sistemas: «Ahora en» M2 · T2.
    intento(db, ana, { tipo: 'examen', materia: 'sistemas', aprobado: true, en: AHORA - 40 * MIN });
    ponerAjuste(db, `academia.tema_paso.${ana}`, { 'sistemas/muestra-ilusiones-1': { paso: 2, max: 2, total: 5, en: iso(AHORA - 30 * MIN) } });
    a = await avance(ana);
    const sis = a.tg.bloques.find(b => b.id === 'sistemas');
    assert.deepEqual(estados(sis), ['nuevo', 'empezado']);
    assert.deepEqual(sis.examen, { aprobado: true, mejor: 100 });
    assert.equal(sis.pct, 0, 'aprobar el examen no inventa temas hechos');
    assert.deepEqual([a.tg.ahora.id, a.tg.ahora.numero, a.tg.ahora.temaNumero, a.tg.ahora.temas], ['sistemas', 2, 2, 2]);
    assert.equal(a.tg.ultima, iso(AHORA - 30 * MIN));
    assert.equal(a.tg.empezados, 1);

    // El Repaso final (y el repaso, «Mis errores»…) mezcla temas de todo el curso: no mueve «Ahora en» ni empieza temas.
    const rf = intento(db, ana, { tipo: 'final', materia: null, aprobado: false, en: AHORA - 10 * MIN });
    respuesta(db, ana, { materia: 'aerodinamica', tema: 'muestra-hipoxia-2', pregunta: 'muestra-h1-2', en: AHORA - 10 * MIN, intentoId: rf });
    respuesta(db, ana, { materia: 'factores_humanos', tema: 'muestra-ilusiones', pregunta: 'muestra-v1', en: AHORA - 10 * MIN, intentoId: rf });
    const despues = await avance(ana);
    assert.deepEqual(despues.tg.ahora, a.tg.ahora);
    assert.deepEqual(estados(despues.tg.bloques.find(b => b.id === 'factores_humanos')), ['hecho', 'nuevo']);
  });
});

test('el oral: % de todos los temas de todos los capítulos y «Ahora en» capítulo y tema', async () => {
  await conAcademia(async ({ db, ana, avance }) => {
    let a = await avance(ana);
    assert.deepEqual(a.oral.bloques.map(b => b.id), [...MATERIAS_ORAL]);
    const conTemas = a.oral.bloques.filter(b => !b.pronto).map(b => [b.id, b.temas.length]);
    const total = conTemas.reduce((n, [, k]) => n + k, 0);
    assert.deepEqual([a.oral.pct, a.oral.hechos, a.oral.total, a.oral.ahora], [0, 0, total, null]);
    // Leyó el tema 1 del capítulo 1 y practica (una de dos preguntas) el tema 1 del capítulo 4.
    ponerAjuste(db, `academia.oral.${ana}`, { leidos: ['oral_calificaciones/t01-a'], examenes: {} });
    db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
      VALUES (?, NULL, 'oral_rendimiento', 't01-a', 'or-rend-t01-a-01', 'oral_practica', 'A', 1, '2026-11-13', ?)`).run(ana, iso(AHORA - 5 * MIN));
    a = await avance(ana);
    assert.deepEqual(estados(a.oral.bloques.find(b => b.id === 'oral_calificaciones')), ['hecho', 'nuevo']);
    assert.deepEqual(estados(a.oral.bloques.find(b => b.id === 'oral_rendimiento')), ['empezado']);
    assert.deepEqual([a.oral.hechos, a.oral.pct], [1, Math.floor(100 / total)]);
    assert.deepEqual([a.oral.ahora.id, a.oral.ahora.numero, a.oral.ahora.temaNumero, a.oral.ahora.temas], ['oral_rendimiento', 4, 1, 1]);
    // Practica la otra pregunta: el tema queda hecho y pasa al siguiente sin hacer después del capítulo 4.
    db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
      VALUES (?, NULL, 'oral_rendimiento', 't01-a', 'or-rend-t01-a-02', 'oral_practica', 'A', 1, '2026-11-13', ?)`).run(ana, iso(AHORA - 4 * MIN));
    a = await avance(ana);
    assert.equal(a.oral.hechos, 2);
    assert.equal(a.oral.ahora.id, 'oral_escenarios');
    assert.equal(a.ultima, iso(AHORA - 4 * MIN));
    // El examen final del oral (de todos los capítulos) no mueve «Ahora en» ni empieza temas.
    db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
      VALUES (?, NULL, 'oral_calificaciones', 't02-b', 'or-cali-t02-b-01', 'oral_final', 'A', 1, '2026-11-13', ?)`).run(ana, iso(AHORA - 3 * MIN));
    const tras = await avance(ana);
    assert.equal(tras.oral.ahora.id, 'oral_escenarios');
    assert.deepEqual(estados(tras.oral.bloques.find(b => b.id === 'oral_calificaciones')), ['hecho', 'nuevo']);
    // Nada del oral se mezcla con el Test Guide.
    assert.equal(a.tg.hechos, 0);
  });
});

test('al día: lo nuevo se ve en el siguiente pedido (lista, ficha y «Cómo van todos»), sin memoria (no-store)', async () => {
  await conAcademia(async ({ base, db, admin, ana, beto, avance }) => {
    intento(db, ana, { materia: 'factores_humanos', tema: 'muestra-hipoxia', aprobado: true, en: AHORA - 20 * MIN });
    const antes = await avance(ana);
    assert.equal(antes.tg.ahora.tema, 'muestra-ilusiones');
    // Una práctica (sin aprobar) en Sistemas, más nueva: «Ahora en» cambia enseguida, el % todavía no.
    const id = intento(db, ana, { materia: 'sistemas', tema: 'muestra-hipoxia-1', aprobado: false, en: AHORA - 2 * MIN });
    respuesta(db, ana, { materia: 'sistemas', tema: 'muestra-hipoxia-1', pregunta: 'muestra-h1-1', en: AHORA - MIN, intentoId: id });
    const despues = await avance(ana);
    assert.equal(despues.tg.ahora.id, 'sistemas');
    assert.equal(despues.tg.ultima, iso(AHORA - MIN));
    assert.equal(despues.tg.pct, antes.tg.pct);
    // La aprueba: el % sube en el siguiente pedido.
    intento(db, ana, { materia: 'sistemas', tema: 'muestra-hipoxia-1', aprobado: true, en: AHORA - 30 * 1000 });
    const ya = await avance(ana);
    assert.deepEqual([ya.tg.hechos, ya.tg.pct], [2, 40]);
    // La ficha y «Cómo van todos» traen lo mismo (y beto, sin nada, su avance vacío).
    const ficha = await pedir(base, 'GET', `/api/admin/academia/alumnos/${ana}/ficha`, { galleta: admin });
    assert.deepEqual(ficha.datos.avanceAlumno, ya);
    const cv = await pedir(base, 'GET', '/api/admin/academia/como-van', { galleta: admin });
    assert.deepEqual(cv.datos.alumnos.find(x => x.id === ana).avanceAlumno, ya);
    const b = cv.datos.alumnos.find(x => x.id === beto).avanceAlumno;
    assert.deepEqual([b.tg.pct, b.tg.total, b.tg.ahora, b.oral.pct], [0, 5, null, 0]);
    // Ninguna se guarda en el navegador ni en el camino.
    for (const ruta of ['/api/admin/academia/como-van/avance', `/api/admin/academia/alumnos/${ana}/avance`]) {
      assert.match((await pedir(base, 'GET', ruta, { galleta: admin })).cache ?? '', /no-store/);
    }
    // El orden «avance» usa el % de todos los temas.
    assert.equal(pctTg({ avanceAlumno: ya }), 40);
    assert.equal(pctTg({ avance: { pct: 7 } }), 7);
  });
});

test('solo el administrador ve el avance (401 sin entrar, 403 un alumno, 404 si no existe)', async () => {
  await conAcademia(async ({ base, ana, admin }) => {
    const entrar = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } });
    assert.ok(entrar.galleta);
    for (const ruta of ['/api/admin/academia/como-van/avance', `/api/admin/academia/alumnos/${ana}/avance`]) {
      assert.equal((await pedir(base, 'GET', ruta)).codigo, 401, ruta);
      const r = await pedir(base, 'GET', ruta, { galleta: entrar.galleta });
      assert.equal(r.codigo, 403, ruta);
      assert.deepEqual(Object.keys(r.datos), ['error']);
    }
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos/99999/avance', { galleta: admin })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/alumnos/abc/avance', { galleta: admin })).codigo, 404);
  });
});

test('«Ahora en» en pocas palabras (lista) y entero (ficha)', () => {
  const textos = { 'av.ahora.tg_corto': 'M{m} · T{t}/{n}', 'av.ahora.tg_largo': 'Materia {m} · Tema {t} de {n}: {titulo}', 'av.ahora.oral_largo': 'Capítulo {c} de {total} · Tema {t} de {n}: {titulo}' };
  const h = { numero: n => String(n), t: (k, d) => textos[k].replace(/\{(\w+)\}/g, (_, x) => d[x]) };
  const ahora = { numero: 3, temaNumero: 2, temas: 6, titulo: 'Las nubes' };
  assert.equal(textoAhora(h, ahora), 'M3 · T2/6');
  assert.equal(textoAhora(h, ahora, { largo: true }), 'Materia 3 · Tema 2 de 6: Las nubes');
  assert.equal(textoAhora(h, { ...ahora, numero: 4, temaNumero: 3, temas: 5 }, { oral: true, largo: true, capitulos: 9 }), 'Capítulo 4 de 9 · Tema 3 de 5: Las nubes');
  assert.equal(textoAhora(h, null), null);
});
