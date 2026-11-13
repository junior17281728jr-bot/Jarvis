// 0.13.1: la pista «Preparándote para el examen oral» para el alumno: el formato, las versiones juntas TEMA POR TEMA (los
// capítulos hechos a mano + lo de la fábrica), el Camino propio, la lección (las preguntas del libro tal cual), practicar
// con «¿De dónde salió?», el examen de capítulo, el examen final y «Listo para el oral». Nada se mezcla con el Test Guide.
// Paquetes de MUESTRA (todo inventado: test/oral-muestra.js y test/academia-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete, MATERIAS_ORAL } from '../src/academia/formato.js';
import { paqueteActivo, leerEnUso, guardarAjuste, AJUSTE_EN_USO } from '../src/academia/paquetes.js';
import { listoParaOral } from '../src/academia/oral.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const T0 = Date.parse('2026-11-13T14:00:00Z');

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  return { codigo: r.status, datos: await r.json().catch(() => ({})) };
}
async function entrar(base, nombre) {
  const r = await fetch(`${base}/api/entrar`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, clave: CLAVE }) });
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}
function azarFijo(semilla = 11) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function subirYActivar(base, admin, paquete) {
  const r = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(paquete) }).then(x => x.json());
  assert.ok(r.paquete?.id, JSON.stringify(r));
  for (const archivo of r.faltan ?? []) await fetch(`${base}/api/admin/academia/paquetes/${r.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
  const a = await pedir(base, 'POST', `/api/admin/academia/paquetes/${r.paquete.id}/activar`, { galleta: admin, datos: {} });
  assert.equal(a.codigo, 200, JSON.stringify(a.datos));
  return r.paquete.id;
}
async function conOral(fn, { tg = true, orales = [paqueteOralMuestra()] } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const reloj = () => ahora;
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  try {
    await conServidor(servidor, async base => {
      const admin = (await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', ...DUENO }, body: JSON.stringify({ nombre: 'junior', clave: CLAVE }) })).headers.get('set-cookie').split(';')[0];
      crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const ana = await entrar(base, 'ana');
      const ids = [];
      if (tg) ids.push(await subirYActivar(base, admin, paqueteMuestra()));
      for (const o of orales) ids.push(await subirYActivar(base, admin, o));
      await fn({ base, db, config, admin, ana, ids, avanzar: ms => { ahora += ms; } });
    });
  } finally { db.close(); }
}

test('formato oral: ids de las fuentes, libro_qa con puntos clave, adicionales y origen de cada pregunta; lo oral no entra a un paquete del Test Guide', () => {
  assert.equal(MATERIAS_ORAL[0], 'oral_calificaciones');
  assert.equal(MATERIAS_ORAL[7], 'oral_factores_humanos');
  assert.equal(MATERIAS_ORAL[8], 'oral_escenarios');
  const p = paqueteOralMuestra();
  assert.equal(revisarPaquete(p).ok, true, JSON.stringify(revisarPaquete(p).errores));
  const casos = [
    [x => { x.preguntas[0].fuente_pregunta.respuesta_en = ''; }, 'preguntas[0].fuente_pregunta.respuesta_en'],
    [x => { delete x.preguntas[0].fuente_pregunta; }, 'preguntas[0].fuente_pregunta'],
    [x => { x.preguntas[0].origen = 'test_guide'; }, 'preguntas[0].origen'],
    [x => { x.materias[0].temas[0].libro_qa[0].puntos_clave = Array(7).fill('x'); }, 'materias[0].temas[0].libro_qa[0].puntos_clave'],
    [x => { x.materias[0].temas[0].adicionales[0].pagina = ''; }, 'materias[0].temas[0].adicionales[0].pagina'],
    [x => { x.materias[0].id = 'sistemas'; }, 'materias[0].id'],
  ];
  for (const [cambiar, ruta] of casos) {
    const x = paqueteOralMuestra();
    cambiar(x);
    const r = revisarPaquete(x);
    assert.ok(r.errores.some(e => e.ruta === ruta), `${ruta}: ${JSON.stringify(r.errores)}`);
  }
  const tg = paqueteMuestra();
  tg.materias[0].temas[0].adicionales = [{ pregunta_en: 'x', pagina: '1' }];
  tg.materias[0].temas[0].titulo_en = 'x';
  const r = revisarPaquete(tg);
  assert.ok(r.errores.some(e => e.ruta.endsWith('.adicionales')) && r.errores.some(e => e.motivo === 'solo_oral'));
});

test('las versiones orales se juntan TEMA POR TEMA (capítulo hecho a mano + la fábrica) y nunca tocan lo del Test Guide', async () => {
  const mano = paqueteOralMuestra({ materias: ['oral_calificaciones'], temas: ['oral_calificaciones/t01-a'], edicion: 'a-mano' });
  const fabrica = paqueteOralMuestra({ materias: ['oral_calificaciones', 'oral_rendimiento', 'oral_escenarios'], temas: ['oral_calificaciones/t02-b', 'oral_rendimiento/t01-a', 'oral_escenarios/t01-escenarios'], edicion: 'fabrica' });
  await conOral(async ({ db, config, ids }) => {
    const enUso = leerEnUso(db);
    assert.equal(enUso.length, 3, 'la versión hecha a mano no se quita aunque otra más nueva traiga la misma materia');
    const p = paqueteActivo(db, config);
    const cal = p.oral.materias.find(m => m.id === 'oral_calificaciones');
    assert.deepEqual(cal.temas.map(t => [t.id, t.paquete]), [['t01-a', ids[1]], ['t02-b', ids[2]]]);
    assert.equal(p.oral.preguntas.size, 6);
    for (const qid of p.oral.preguntas.keys()) assert.ok(!p.preguntas.has(qid) && !p.deTema.has(qid), 'nada oral entre las preguntas del Test Guide');
    assert.ok(p.materias.every(m => !m.id.startsWith('oral_')));
    assert.equal(p.id, ids[0], 'la versión principal sigue siendo la del Test Guide');
  }, { orales: [mano, fabrica] });
  // Muchas versiones orales (cada capítulo republicado) nunca le quitan lugar a las del Test Guide.
  await conOral(async ({ db }) => {
    const lista = [{ id: 1, materias: ['factores_humanos'] }, ...Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, materias: ['oral_travesia'] }))];
    guardarAjuste(db, AJUSTE_EN_USO, JSON.stringify(lista));
    const en = leerEnUso(db);
    assert.equal(en[0].id, 1);
    assert.equal(en.length, 31, 'las últimas 30 orales');
  }, { tg: false, orales: [] });
  // Solo lo oral en uso (sin Test Guide): igual se compone.
  await conOral(async ({ db, config }) => {
    const p = paqueteActivo(db, config);
    assert.ok(p.oral.hay);
    assert.ok(p.materias.every(m => !m.temas.length));
  }, { tg: false });
});

test('el alumno: Camino oral, lección con las preguntas del libro tal cual, practicar con «¿De dónde salió?» solo después de responder', async () => {
  await conOral(async ({ base, db, ana }) => {
    let c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos;
    assert.equal(c.oral.hay, true);
    assert.equal(c.oral.siguientePaso, false, 'todavía no terminó el Test Guide');
    const o = (await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos;
    assert.deepEqual(o.materias.map(m => m.id), ['oral_calificaciones', 'oral_rendimiento', 'oral_escenarios']);
    assert.deepEqual(o.siguiente, { tipo: 'tema', materia: 'oral_calificaciones', tema: 't01-a' });
    assert.equal(o.listo.listo, false);
    assert.equal(o.listo.pct, 0);
    const l = (await pedir(base, 'GET', '/api/academia/oral/temas/oral_calificaciones/t01-a', { galleta: ana })).datos;
    const libro = paqueteOralMuestra().materias[0].temas[0].libro_qa;
    assert.deepEqual(l.libro_qa.map(x => [x.pregunta_en, x.respuesta_en, x.pagina]), libro.map(x => [x.pregunta_en, x.respuesta_en, x.pagina]), 'tal cual');
    assert.ok(l.libro_qa[0].explicacion_es && l.libro_qa[0].puntos_clave.length);
    assert.equal(l.adicionales.length, 1);
    assert.equal(l.secciones[1].visual.tipo, 'diagrama-pasos');
    assert.equal(l.secciones[1].fuentes[0].libro, 'Guía del examen oral (muestra)');
    assert.equal((await pedir(base, 'POST', '/api/academia/oral/temas/oral_calificaciones/t01-a/leido', { galleta: ana, datos: {} })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/academia/oral/temas/oral_calificaciones/zz', { galleta: ana })).codigo, 404);
    // Practicar el tema: la ronda NO trae la respuesta ni su origen.
    const r = (await pedir(base, 'POST', '/api/academia/oral/ronda', { galleta: ana, datos: { materia: 'oral_calificaciones', tema: 't01-a' } })).datos;
    assert.equal(r.preguntas.length, 2);
    assert.ok(!JSON.stringify(r).includes('respuesta_en') && !JSON.stringify(r).includes('correcta') && !JSON.stringify(r).includes(libro[0].respuesta_en));
    const q = r.preguntas[0];
    const x = (await pedir(base, 'POST', '/api/academia/oral/responder', { galleta: ana, datos: { pregunta: q.id, elegida: 'B' } })).datos;
    assert.equal(x.acierto, false);
    assert.equal(x.correcta, 'A');
    assert.ok(x.porque);
    assert.ok(libro.some(b => b.pregunta_en === x.origen.pregunta_en && b.respuesta_en === x.origen.respuesta_en), '¿De dónde salió?: la pregunta y la respuesta del libro tal cual');
    assert.ok(x.origen.como && x.origen.pagina && x.origen.libro);
    assert.equal((await pedir(base, 'POST', '/api/academia/oral/responder', { galleta: ana, datos: { pregunta: q.id, elegida: 'Z' } })).codigo, 400);
    // Lo oral nunca entra a lo del Test Guide.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas').get().n, 0);
    const prog = (await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana })).datos;
    assert.deepEqual(prog.extra, [], 'tampoco aparece como «Extra»');
    assert.equal(prog.oral.errores, 1);
    assert.equal(prog.oral.respuestas, 1);
    const rep = (await pedir(base, 'GET', '/api/academia/mi-repaso', { galleta: ana })).datos;
    assert.equal(rep.oral.errores, 1);
    assert.equal(rep.oral.temas[0].tema, 't01-a');
    // «Mis errores del oral»: solo la que falló.
    const e = (await pedir(base, 'POST', '/api/academia/oral/ronda', { galleta: ana, datos: { errores: true } })).datos;
    assert.deepEqual(e.preguntas.map(p => p.id), [q.id]);
    c = (await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos;
    assert.ok(c.materias[0].temas[0].leido);
    assert.equal(c.materias[0].temas[0].vistas, 1);
  });
});

test('examen de capítulo y examen final: nota al entregar, revisión con su origen, y «Listo para el oral» sin IA', async () => {
  await conOral(async ({ base, ana, db }) => {
    const todas = new Map(paqueteOralMuestra().preguntas.map(q => [q.id, q]));
    const examen = async (materia, bien = true) => {
      const e = (await pedir(base, 'POST', '/api/academia/oral/examen', { galleta: ana, datos: materia ? { materia } : {} })).datos;
      assert.ok(e.examen, JSON.stringify(e));
      assert.ok(!JSON.stringify(e).includes('respuesta_en') && !JSON.stringify(e).includes('"correcta"'));
      const respuestas = Object.fromEntries(e.preguntas.map(q => [q.id, bien ? todas.get(q.id).original.correcta : 'C']));
      return (await pedir(base, 'POST', '/api/academia/oral/examen/entregar', { galleta: ana, datos: { examen: e.examen, respuestas } })).datos;
    };
    let r = await examen('oral_calificaciones', false);
    assert.deepEqual([r.pct, r.aprobado, r.total], [0, false, 3]);
    assert.ok(r.revision.every(x => x.origen.pregunta_en && x.correcta === 'A'));
    assert.equal((await pedir(base, 'POST', '/api/academia/oral/examen/entregar', { galleta: ana, datos: { examen: 'otro', respuestas: {} } })).codigo, 404);
    for (const m of ['oral_calificaciones', 'oral_rendimiento', 'oral_escenarios']) assert.equal((r = await examen(m)).aprobado, true, m);
    let c = (await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos;
    assert.equal(c.listo.listo, false, 'falta el examen final');
    assert.deepEqual(c.listo.faltan, [{ tipo: 'final' }]);
    const f = await examen(null);
    assert.equal(f.alcance, 'final');
    assert.equal(f.total, 6, 'todas las de los capítulos y las de escenario');
    c = (await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos;
    assert.equal(c.listo.listo, true);
    // Un examen abierto y abandonado no bloquea la práctica.
    const abandonado = (await pedir(base, 'POST', '/api/academia/oral/examen', { galleta: ana, datos: { materia: 'oral_rendimiento' } })).datos;
    assert.equal((await pedir(base, 'POST', '/api/academia/oral/responder', { galleta: ana, datos: { pregunta: abandonado.preguntas[0].id, elegida: 'A' } })).codigo, 200);
    assert.equal(c.listo.pct, 100);
    assert.equal(c.final.aprobado, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academia_extra_respuestas WHERE nivel = 'oral_final'").get().n, 6);
  });
  // El % de «Listo»: lo que domina, los capítulos aprobados y la nota del final, por igual.
  const m = [{ id: 'a', preguntas: 10, bien: 5, examen: { aprobado: true } }, { id: 'b', preguntas: 10, bien: 5, examen: { aprobado: false } }];
  assert.deepEqual(listoParaOral(m, { mejor: 80, aprobado: true }, 80), { listo: false, pct: 60, dominio: 50, capitulos: 50, final: 80, umbral: 80, faltan: [{ tipo: 'examen', materia: 'b' }] });
});

test('sin contenido oral, nada cambia: el Camino dice que no hay y las rutas responden «no existe»', async () => {
  await conOral(async ({ base, ana }) => {
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/camino', { galleta: ana })).datos.oral, { hay: false });
    assert.equal((await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos.hay, false);
    assert.equal((await pedir(base, 'POST', '/api/academia/oral/ronda', { galleta: ana, datos: {} })).codigo, 409);
    assert.equal((await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana })).datos.oral, null);
  }, { orales: [] });
});

// 0.13.2: el mapa del libro (solo títulos) y cómo se cruza con lo que trae el paquete.
test('0.13.2: el Camino oral muestra los 8 capítulos y los 39 temas del libro; lo que no tiene clase queda «Pronto»', async () => {
  const { MAPA_ORAL, TOTAL_TEMAS_MAPA, caminoConMapa, letraDeTema } = await import('../public/oral-mapa.js');
  assert.equal(TOTAL_TEMAS_MAPA, 39);
  assert.deepEqual(MAPA_ORAL.map(c => c.id), [...MATERIAS_ORAL]);
  assert.deepEqual(MAPA_ORAL.map(c => c.temas.filter(x => x.letra).length), [3, 2, 5, 3, 6, 10, 2, 8, 0]);
  assert.equal(MAPA_ORAL[0].temas[0].es, 'Privilegios y limitaciones');
  assert.equal(MAPA_ORAL[0].temas[0].en, 'Privileges and Limitations');
  assert.equal(letraDeTema('t02-b'), 'B');
  assert.equal(letraDeTema('t01-escenarios'), null);
  const c = caminoConMapa([
    { id: 'oral_calificaciones', numero: 1, temas: [{ id: 't02-b', titulo: 'Recent Experience' }, { id: 'otro', titulo: 'Uno que el mapa no conoce' }] },
    { id: 'oral_escenarios', numero: 9, temas: [{ id: 't01-escenarios', titulo: 'Escenarios' }] },
  ]);
  assert.equal(c.length, 9);
  assert.deepEqual(c[0].temas.map(x => [x.letra, x.es, x.x?.id ?? null]), [['A', 'Privilegios y limitaciones', null], ['B', 'Vigencia', 't02-b'], ['C', 'Certificado médico', null], [null, 'Uno que el mapa no conoce', 'otro']]);
  assert.equal(c[1].m, null, 'un capítulo sin clases sale igual, con sus temas «Pronto»');
  assert.equal(c[1].temas.length, 2);
  assert.equal(c[8].temas[0].x.id, 't01-escenarios');
});
