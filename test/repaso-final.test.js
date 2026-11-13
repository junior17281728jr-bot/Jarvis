// 0.13.7: «Repaso final» (src/academia/repaso-final.js): todo el Test Guide tal cual (de cada materia con contenido, de una,
// o solo lo fallado), con una línea corta sacada tal cual de la explicación sencilla; nunca cuenta como examen; no se usa con
// un examen con reloj abierto; y las tarjetas del oral (las preguntas del libro tal cual) con «La sabía» / «No la sabía».
// Solo lo de quien entró. Paquetes de MUESTRA (todo inventado: test/academia-muestra.js y test/oral-muestra.js).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { lineaBreve } from '../src/academia/repaso-final.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { mazoOral } from '../public/repaso-final-vista.js';

const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const T0 = Date.parse('2026-11-13T14:00:00Z');
const DIA = 24 * 3600 * 1000;

async function pedir(base, metodo, ruta, { datos, galleta } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1' } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  return { codigo: r.status, datos: await r.json().catch(() => ({})) };
}
async function entrar(base, nombre) {
  const r = await fetch(`${base}/api/entrar`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, clave: CLAVE }) });
  return (r.headers.get('set-cookie') ?? '').split(';')[0];
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function subirYActivar(base, admin, paquete) {
  const r = await fetch(`${base}/api/admin/academia/paquetes`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify(paquete) }).then(x => x.json());
  assert.ok(r.paquete?.id, JSON.stringify(r));
  for (const archivo of r.faltan ?? []) await fetch(`${base}/api/admin/academia/paquetes/${r.paquete.id}/figuras/${archivo}`, { method: 'POST', headers: { 'X-Oportia': '1', Cookie: admin, 'Content-Type': 'image/png' }, body: figuraMuestraPng() });
  const a = await pedir(base, 'POST', `/api/admin/academia/paquetes/${r.paquete.id}/activar`, { galleta: admin, datos: {} });
  assert.equal(a.codigo, 200, JSON.stringify(a.datos));
}

// La muestra con una SEGUNDA materia (otra copia, con sus propios ids) y una pregunta del POH (no es del Test Guide).
function paqueteDosMaterias() {
  const p = paqueteMuestra();
  const otra = structuredClone(p.materias[0]);
  otra.id = 'sistemas';
  for (const t of otra.temas) { t.id = `s-${t.id}`; t.preguntas = t.preguntas.map(id => `s-${id}`); }
  const copias = p.preguntas.map(q => ({ ...structuredClone(q), id: `s-${q.id}`, original: { ...structuredClone(q.original), numero: `S-${q.original.numero}` } }));
  const poh = { ...structuredClone(p.preguntas[0]), id: 'muestra-poh1', origen: 'poh', fuente: { libro: 'muestra', pagina: '3' } };
  delete poh.original.numero;
  otra.temas[0].preguntas.push(poh.id);
  p.preguntas.push(...copias, poh);
  p.materias.push(otra);
  const r = revisarPaquete(p);
  assert.equal(r.ok, true, JSON.stringify(r.errores?.slice(0, 5)));
  return p;
}

async function conRepaso(fn, { tg = paqueteDosMaterias(), oral = paqueteOralMuestra() } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj: () => ahora } });
  try {
    await conServidor(servidor, async base => {
      const admin = (await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json', ...DUENO }, body: JSON.stringify({ nombre: 'junior', clave: CLAVE }) })).headers.get('set-cookie').split(';')[0];
      for (const nombre of ['ana', 'beto']) crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      const ana = await entrar(base, 'ana');
      const beto = await entrar(base, 'beto');
      if (tg) await subirYActivar(base, admin, tg);
      if (oral) await subirYActivar(base, admin, oral);
      await fn({ base, db, ana, beto, avanzar: ms => { ahora += ms; } });
    });
  } finally { db.close(); }
}

test('Test Guide completo: todas las preguntas del Test Guide de cada materia, TAL CUAL; la línea corta sale tal cual del paquete; nunca cuenta como examen', async () => {
  const pack = paqueteDosMaterias();
  const delPack = new Map(pack.preguntas.map(q => [q.id, q]));
  const tgIds = pack.preguntas.filter(q => q.origen === 'test_guide').map(q => q.id);
  await conRepaso(async ({ base, db, ana }) => {
    const r0 = await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: ana });
    assert.equal(r0.codigo, 200);
    assert.equal(r0.datos.tg.total, tgIds.length, 'las dos materias, sin la del POH');
    assert.deepEqual(r0.datos.tg.materias.map(m => [m.id, m.total]), [['factores_humanos', 10], ['sistemas', 10]]);
    assert.equal(r0.datos.tg.falladas, 0);
    assert.equal(r0.datos.tg.abierta, null);

    const r = await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: ana, datos: {} });
    assert.equal(r.codigo, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.tipo, 'final');
    assert.deepEqual(r.datos.preguntas.map(q => q.id).sort(), [...tgIds].sort(), 'todas, aunque sus temas estén cerrados en el Camino');
    for (const q of r.datos.preguntas) {
      const o = delPack.get(q.id).original;
      assert.equal(q.enunciado, o.enunciado, `${q.id}: el enunciado tal cual`);
      assert.equal(q.numero, o.numero);
      assert.deepEqual(q.opciones, o.opciones.map(x => ({ letra: x.letra, texto: x.texto })), `${q.id}: las opciones tal cual y en su orden`);
      assert.equal(q.respuesta, null, 'la correcta nunca viaja antes de responder');
    }
    // Responder: la correcta del paquete y UNA línea que está tal cual en su explicación sencilla.
    const respuestas = [];
    for (const [i, q] of r.datos.preguntas.entries()) {
      const o = delPack.get(q.id).original;
      const elegida = i < 2 ? o.opciones.find(x => x.letra !== o.correcta).letra : o.correcta;
      const x = await pedir(base, 'POST', `/api/academia/repaso-final/ronda/${r.datos.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida } });
      assert.equal(x.codigo, 200, JSON.stringify(x.datos));
      assert.equal(x.datos.respuesta.correcta, o.correcta);
      assert.equal(x.datos.respuesta.acierto, elegida === o.correcta);
      assert.ok(x.datos.respuesta.breve && delPack.get(q.id).sencilla.includes(x.datos.respuesta.breve), `${q.id}: la línea corta es del paquete`);
      assert.ok(!x.datos.respuesta.breve.includes('\n'), 'una sola línea');
      respuestas.push({ q, elegida });
    }
    // A medias (antes de terminar): se puede seguir hoy.
    const medio = await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: ana });
    assert.equal(medio.datos.tg.abierta?.id, r.datos.id);
    assert.equal(medio.datos.tg.falladas, 2, 'las 2 que falló');
    const vista = await pedir(base, 'GET', `/api/academia/repaso-final/ronda/${r.datos.id}`, { galleta: ana });
    assert.ok(vista.datos.preguntas.every(q => q.respuesta && q.respuesta.breve));

    const fin = await pedir(base, 'POST', `/api/academia/repaso-final/ronda/${r.datos.id}/terminar`, { galleta: ana, datos: {} });
    assert.equal(fin.codigo, 200);
    assert.equal(fin.datos.aprobado, null, 'es práctica: no aprueba nada');
    assert.equal(fin.datos.total, tgIds.length);
    assert.equal(fin.datos.aciertos, tgIds.length - 2);
    assert.equal(fin.datos.falladas.length, 2);
    // Se anotó como cualquier práctica, sin examen ni tema aprobado.
    const u = db.prepare("SELECT id FROM usuarios WHERE nombre = 'ana'").get().id;
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_respuestas WHERE usuario_id = ? AND intento_id = ?').get(u, r.datos.id).n, tgIds.length);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academia_intentos WHERE usuario_id = ? AND (tipo IN ('examen', 'tema') OR aprobado IS NOT NULL)").get(u).n, 0);
    const c = await pedir(base, 'GET', '/api/academia/camino', { galleta: ana });
    assert.ok(c.datos.materias.every(m => !m.examen?.aprobado && !(m.examen?.veces > 0)), 'ningún examen cuenta');
    const mr = await pedir(base, 'GET', '/api/academia/mi-repaso', { galleta: ana });
    assert.equal(mr.codigo, 200, 'Mi repaso sigue bien');
    const enMiRepaso = JSON.stringify(mr.datos.errores);
    for (const { q } of respuestas.slice(0, 2)) {
      assert.ok(enMiRepaso.includes(q.enunciado), `${q.id}: la fallada sale en «Tus errores» de Mi repaso`);
      assert.equal(db.prepare('SELECT caja FROM academia_repaso WHERE usuario_id = ? AND pregunta = ?').get(u, q.id)?.caja, 1, `${q.id}: entra al repaso espaciado`);
    }
    assert.equal((await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: ana })).datos.tg.abierta, null, 'terminada: ya no se sigue');

    // «Solo las que fallé» y «Por materia».
    const malas = await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: ana, datos: { falladas: true } });
    assert.equal(malas.codigo, 201);
    assert.deepEqual(malas.datos.preguntas.map(q => q.id).sort(), respuestas.slice(0, 2).map(x => x.q.id).sort());
    const sis = await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: ana, datos: { materia: 'sistemas' } });
    assert.equal(sis.codigo, 201);
    assert.ok(sis.datos.preguntas.length === 10 && sis.datos.preguntas.every(q => q.id.startsWith('s-')), 'solo esa materia, sin el POH');
    assert.equal((await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: ana, datos: { materia: 'meteorologia' } })).codigo, 404, 'una materia sin contenido');
  });
});

test('la línea corta: el «Truco para recordar», si no el «Por qué», si no la primera línea (siempre tal cual)', () => {
  const s = '✔ La correcta es: B.\n\nPor qué: porque sí. Otra frase.\n\nPiensa así: algo.\n\nTruco para recordar: «B de bien».';
  assert.equal(lineaBreve({ sencilla: s }), 'Truco para recordar: «B de bien».');
  assert.equal(lineaBreve({ sencilla: '✔ La correcta es: B. Por qué: porque sí.' }), 'Por qué: porque sí.');
  assert.equal(lineaBreve({ sencilla: 'Una sola línea.' }), 'Una sola línea.');
  assert.equal(lineaBreve({ sencilla: '', original: { explicacion: 'De la guía.\nMás.' } }), 'De la guía.');
});

test('Repaso final: solo con sesión, solo lo propio, nunca por la ruta de siempre y nunca con un examen con reloj abierto', async () => {
  await conRepaso(async ({ base, ana, beto }) => {
    for (const [m, ruta] of [['GET', '/api/academia/repaso-final'], ['POST', '/api/academia/repaso-final/ronda'], ['GET', '/api/academia/repaso-final/oral'], ['POST', '/api/academia/repaso-final/oral/marcar']]) {
      assert.equal((await pedir(base, m, ruta, { datos: m === 'POST' ? {} : undefined })).codigo, 401, `${m} ${ruta} sin sesión`);
    }
    const r = await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: ana, datos: {} });
    const q = r.datos.preguntas[0];
    assert.equal((await pedir(base, 'GET', `/api/academia/repaso-final/ronda/${r.datos.id}`, { galleta: beto })).codigo, 404, 'la vuelta de otra persona no existe');
    assert.equal((await pedir(base, 'POST', `/api/academia/repaso-final/ronda/${r.datos.id}/responder`, { galleta: beto, datos: { pregunta: q.id, elegida: 'A' } })).codigo, 404);
    assert.equal((await pedir(base, 'POST', `/api/academia/repaso-final/ronda/${r.datos.id}/terminar`, { galleta: beto, datos: {} })).codigo, 404);
    assert.equal((await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: beto })).datos.tg.abierta, null, 'lo de hoy de ana no se ve en beto');
    assert.equal((await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'final' } })).codigo, 400, 'solo por su ruta');
    // Otro intento (no del Repaso final) no se abre por aquí.
    const tema = await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' } });
    assert.equal(tema.codigo, 201);
    assert.equal((await pedir(base, 'GET', `/api/academia/repaso-final/ronda/${tema.datos.id}`, { galleta: ana })).codigo, 404);
    // Con un examen con reloj abierto: ni empezar ni responder (por ninguna ruta).
    const ex = await pedir(base, 'POST', '/api/academia/intentos', { galleta: ana, datos: { tipo: 'examen', materia: 'factores_humanos', saltar: true } });
    assert.ok([200, 201].includes(ex.codigo), JSON.stringify(ex.datos));
    assert.equal((await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: ana })).datos.tg.enExamen, true);
    const n = await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: ana, datos: {} });
    assert.equal(n.codigo, 409);
    assert.equal(n.datos.error, 'repaso_final_en_examen');
    assert.equal((await pedir(base, 'POST', `/api/academia/repaso-final/ronda/${r.datos.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida: 'A' } })).codigo, 409);
    assert.equal((await pedir(base, 'POST', `/api/academia/intentos/${r.datos.id}/responder`, { galleta: ana, datos: { pregunta: q.id, elegida: 'A' } })).codigo, 409);
    // beto no tiene examen abierto: él sí puede.
    assert.equal((await pedir(base, 'POST', '/api/academia/repaso-final/ronda', { galleta: beto, datos: {} })).codigo, 201);
  });
});

test('el oral: todas las preguntas del libro TAL CUAL (con su página) y las de practicar en voz alta; «La sabía / No la sabía» de hoy, por alumno', async () => {
  const oral = paqueteOralMuestra();
  const esperadas = oral.materias.flatMap(m => m.temas.flatMap(t => [...(t.libro_qa ?? []).map(x => ({ ...x, adicional: false })), ...(t.adicionales ?? []).map(x => ({ ...x, adicional: true }))]));
  await conRepaso(async ({ base, ana, beto, avanzar }) => {
    const r0 = await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: ana });
    assert.equal(r0.datos.oral.hay, true);
    assert.equal(r0.datos.oral.total, esperadas.length);
    assert.deepEqual(r0.datos.oral.capitulos.map(c => c.id), ['oral_calificaciones', 'oral_rendimiento', 'oral_escenarios']);
    const r = await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: ana });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.tarjetas.length, esperadas.length);
    for (const e of esperadas) {
      const x = r.datos.tarjetas.find(y => y.pregunta_en === e.pregunta_en);
      assert.ok(x, `falta «${e.pregunta_en}»`);
      assert.equal(x.pagina, e.pagina);
      assert.equal(x.adicional, e.adicional);
      assert.equal(x.respuesta_en, e.adicional ? null : (e.respuesta_en ?? null), 'la respuesta del libro tal cual (las de practicar no la traen)');
    }
    assert.deepEqual(r.datos.marcas, {});
    const [a, b] = r.datos.tarjetas;
    assert.equal((await pedir(base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: ana, datos: { tarjeta: a.id, sabia: true } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: ana, datos: { tarjeta: b.id, sabia: false } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: ana, datos: { tarjeta: 'oral_x/t/q0', sabia: true } })).codigo, 404);
    assert.equal((await pedir(base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: ana, datos: { tarjeta: a.id, sabia: 'si' } })).codigo, 400);
    const r2 = await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: ana });
    assert.deepEqual(r2.datos.marcas, { [a.id]: 1, [b.id]: 0 });
    // El mazo para seguir: primero las que no vio, al final la que no sabía; la que sabía, no.
    const mazo = mazoOral(r2.datos.tarjetas, r2.datos.marcas).map(x => x.id);
    assert.equal(mazo.at(-1), b.id);
    assert.ok(!mazo.includes(a.id));
    assert.equal(mazo.length, esperadas.length - 1);
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: beto })).datos.marcas, {}, 'lo de ana no es de beto');
    // «Empezar de nuevo» de un capítulo borra solo lo de ese capítulo.
    await pedir(base, 'POST', '/api/academia/repaso-final/oral/reiniciar', { galleta: ana, datos: { materia: 'oral_rendimiento' } });
    assert.equal(Object.keys((await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: ana })).datos.marcas).length, 2);
    await pedir(base, 'POST', '/api/academia/repaso-final/oral/reiniciar', { galleta: ana, datos: {} });
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: ana })).datos.marcas, {});
    // Lo de hoy es de hoy: al otro día se empieza limpio.
    await pedir(base, 'POST', '/api/academia/repaso-final/oral/marcar', { galleta: ana, datos: { tarjeta: a.id, sabia: true } });
    avanzar(DIA);
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: ana })).datos.marcas, {});
  });
  // Sin contenido oral: la parte B dice que todavía no hay (y la A sigue).
  await conRepaso(async ({ base, ana }) => {
    const r = await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: ana });
    assert.equal(r.datos.oral.hay, false);
    assert.equal(r.datos.tg.total, 10);
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/repaso-final/oral', { galleta: ana })).datos, { hay: false, tarjetas: [], marcas: {} });
  }, { tg: paqueteMuestra(), oral: null });
});
