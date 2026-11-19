// 0.14.51: el sistema aprende de lo que califica la IA en la «Práctica en vivo» del oral (src/academia/oral-aprende.js) y lo
// usa cuando no hay IA. Siempre con el proveedor FALSO y el paquete de MUESTRA (todo inventado: test/oral-muestra.js).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { conInstructor, pedir, CLAVE } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { abrirBase } from '../src/nucleo/db.js';
import { configDePrueba } from './ayuda.js';
import { calificarSistema } from '../src/academia/oral-vivo.js';
import { APRENDE, aprenderDeIa, normalizar, parecido, clavesAprendidas, ejemplosDe, resumenAprendido } from '../src/academia/oral-aprende.js';
import { clavePausa } from '../src/ia/tope-alumno.js';

const ORAL_JSON = paqueteOralMuestra();
const ORAL = { oral: { hay: true, materias: ORAL_JSON.materias } };
const huella = t => createHash('sha256').update(String(t ?? '')).digest('hex').slice(0, 16);
const item = (m, t, i) => {
  const x = ORAL_JSON.materias.find(y => y.id === m).temas.find(y => y.id === t).libro_qa[i];
  return { m, t, i, h: huella(x.pregunta_en) };
};
const LLEVAR = item('oral_calificaciones', 't01-a', 0); // «What may a sample private pilot carry?»
const ATERRIZAJES = item('oral_calificaciones', 't02-b', 0); // «How many sample landings…» (3 en 90 días)
const DATUM = item('oral_rendimiento', 't01-a', 1); // «What is the sample datum?»
const ia = (veredicto, extra = {}) => ({ veredicto, linea: `La IA dice: ${veredicto}.`, bienDicho: 'Lo principal.', falto: veredicto === 'bien' ? '' : 'Un detalle del libro.', repregunta: '', ...extra });
const conBase = fn => { const db = abrirBase(configDePrueba()); try { return fn(db); } finally { db.close(); } };
const filas = db => db.prepare('SELECT * FROM academia_oral_aprendido ORDER BY id').all();

test('normalizar: sin acentos ni signos, raíces cortas, números (también con letras) y la negación', () => {
  assert.deepEqual(normalizar('3 aterrizajes en los últimos 90 días'), ['#3', 'aterr', 'ultim', '#90', 'dia']);
  assert.deepEqual(normalizar('Three landings in ninety days'), ['#3', 'land', '#90', 'day']);
  assert.deepEqual(normalizar('1,500 ft'), ['#1500']);
  assert.ok(normalizar('No puedo cobrar').includes('~no'));
  assert.equal(parecido(normalizar('Puedo llevar a mis amigos pero no cobrar'), normalizar('Puedo llevar amigos, pero no puedo cobrar.')), 1);
  assert.equal(parecido(normalizar('3 aterrizajes en 90 días'), normalizar('3 aterrizajes en 60 días')), 0, 'otro número: nunca parecida');
  assert.equal(parecido(normalizar('Puedo llevar amigos y cobrar'), normalizar('Puedo llevar amigos y no cobrar')), 0, 'la negación cuenta');
  assert.equal(parecido(normalizar('llevar amigos'), normalizar('llevar amigos gratis')), 0, 'con pocas palabras, solo si es igual');
});

test('sin nada aprendido: exactamente lo de antes (con o sin la base)', () => conBase(db => {
  for (const [it, texto] of [[LLEVAR, 'Puedo llevar a mis amigos pero no cobrar'], [LLEVAR, 'Llevo amigos'], [LLEVAR, 'No sé'], [ATERRIZAJES, '3 aterrizajes en 60 días'], [DATUM, 'Es una referencia cero donde se mide']]) {
    assert.deepEqual(calificarSistema(ORAL, it, texto, { db }), calificarSistema(ORAL, it, texto), texto);
    assert.equal(calificarSistema(ORAL, it, texto, { db }).aprendido, undefined);
  }
  assert.deepEqual(resumenAprendido(db), { respuestas: 0, preguntas: 0 });
}));

test('guardar lo que calificó la IA: sin usuario, una respuesta igual no ocupa otro lugar, nunca lo del sistema ni en blanco, y como mucho 200 por pregunta', () => conBase(db => {
  assert.ok(!db.prepare('PRAGMA table_info(academia_oral_aprendido)').all().some(c => /usuario/.test(c.name)), 'la tabla no tiene usuario');
  assert.equal(aprenderDeIa(db, { it: LLEVAR, edicion: 'e1', texto: 'Puedo llevar amigos y cobrarles el vuelo', g: ia('mal') }), true);
  assert.equal(aprenderDeIa(db, { it: LLEVAR, edicion: 'e2', texto: '¡Puedo llevar amigos, y cobrarles el vuelo!', g: ia('mal') }), true);
  assert.equal(filas(db).length, 1, 'la misma respuesta (normalizada): una fila');
  assert.deepEqual([filas(db)[0].veces, filas(db)[0].edicion, filas(db)[0].pregunta], [2, 'e2', `oral_calificaciones/t01-a#${LLEVAR.h}`]);
  assert.equal(aprenderDeIa(db, { it: LLEVAR, texto: 'otra cosa distinta aquí', g: { ...ia('bien'), sistema: true } }), false, 'nunca lo que calificó el sistema');
  assert.equal(aprenderDeIa(db, { it: LLEVAR, texto: '   ', g: ia('mal') }), false, 'nunca en blanco');
  assert.equal(aprenderDeIa(db, { it: LLEVAR, texto: 'algo de verdad dicho', g: { veredicto: 'excelente' } }), false, 'nunca un veredicto que no existe');
  assert.equal(aprenderDeIa(db, { it: LLEVAR, texto: 'Llevo amigos sin cobrar', seguimiento: true, g: ia('bien') }), true);
  assert.equal(filas(db).filter(f => f.seguimiento === 1).length, 1);
  assert.deepEqual(resumenAprendido(db), { respuestas: 3, preguntas: 1 });
  // El tope: las 200 más nuevas de cada pregunta (las otras preguntas no se tocan).
  aprenderDeIa(db, { it: DATUM, texto: 'una línea imaginaria', g: ia('bien') });
  const t0 = Date.now() + 60_000;
  for (let k = 0; k < APRENDE.porPregunta + 5; k++) aprenderDeIa(db, { it: LLEVAR, texto: `respuesta número ${k} palabra${k}`, g: ia('casi') }, t0 + k * 1000);
  const suyas = filas(db).filter(f => f.pregunta.startsWith('oral_calificaciones/'));
  assert.equal(suyas.length, APRENDE.porPregunta);
  assert.ok(!suyas.some(f => f.tokens.split(' ').includes('#0')), 'las más viejas se quitan');
  assert.ok(suyas.some(f => f.tokens.includes(`#${APRENDE.porPregunta + 4}`)), 'la más nueva queda');
  assert.equal(filas(db).filter(f => f.pregunta.startsWith('oral_rendimiento/')).length, 1);
  assert.ok(ejemplosDe(db, LLEVAR).length <= APRENDE.porPregunta);
}));

test('sin IA: una respuesta casi igual a una que ya calificó la IA lleva su veredicto (y su línea solo si dijo lo mismo); una que no se parece, lo de antes', () => conBase(db => {
  // El sistema de palabras clave diría «bien» (llevar, amigos, cobrar), pero la IA dijo «mal» (cobrarles no se puede).
  const mal = 'Puedo llevar amigos y cobrarles el vuelo';
  assert.equal(calificarSistema(ORAL, LLEVAR, mal).veredicto, 'bien');
  aprenderDeIa(db, { it: LLEVAR, texto: mal, g: ia('mal', { linea: 'No: nunca por dinero.', bienDicho: 'Lo de los amigos.', falto: 'No se puede cobrar.' }) });
  const igual = calificarSistema(ORAL, LLEVAR, 'puedo llevar a mis amigos, y cobrarles el vuelo', { db });
  assert.deepEqual([igual.veredicto, igual.sistema, igual.aprendido, igual.linea, igual.falto], ['mal', true, true, 'No: nunca por dinero.', 'No se puede cobrar.']);
  // Parecida pero no igual (una palabra más): el veredicto sí; el texto, del sistema con SUS palabras (nunca lo de otro).
  aprenderDeIa(db, { it: LLEVAR, texto: 'Puedo llevar amigos familia vecinos y cobrarles el vuelo entero', g: ia('mal', { linea: 'Dijiste «vecinos»: no.' }) });
  const parecida = calificarSistema(ORAL, LLEVAR, 'Puedo llevar amigos familia vecinos y cobrarles el vuelo', { db });
  assert.deepEqual([parecida.veredicto, parecida.aprendido], ['mal', true]);
  assert.ok(!parecida.linea.includes('«'), 'sin citar a otro alumno');
  // Con comillas en lo que dijo la IA: nunca se repite, aunque sea igual.
  const citada = calificarSistema(ORAL, LLEVAR, 'Puedo llevar amigos familia vecinos y cobrarles el vuelo entero', { db });
  assert.ok(!citada.linea.includes('vecinos»'), citada.linea);
  // Algo que no se parece: lo de antes (nada aprendido que sirva).
  for (const otra of ['Puedo llevar a mis amigos pero no cobrar', 'No sé']) assert.deepEqual(calificarSistema(ORAL, LLEVAR, otra, { db }), calificarSistema(ORAL, LLEVAR, otra), otra);
  // La repregunta se compara con las de repregunta (lo de la primera + lo de la repregunta), no con las primeras.
  aprenderDeIa(db, { it: LLEVAR, texto: 'Puedo llevar gente creo. No, nunca por dinero', seguimiento: true, g: ia('bien', { linea: 'Eso, nunca por dinero.' }) });
  const seg = calificarSistema(ORAL, LLEVAR, 'No, nunca por dinero', { db, seguimiento: true, previo: 'Puedo llevar gente, creo' });
  assert.deepEqual([seg.veredicto, seg.aprendido, seg.linea], ['bien', true, 'Eso, nunca por dinero.']);
  assert.notEqual(calificarSistema(ORAL, LLEVAR, 'Puedo llevar gente creo. No, nunca por dinero', { db }).linea, 'Eso, nunca por dinero.', 'una primera respuesta no usa las de repregunta');
  // Si la IA no se pone de acuerdo con la misma respuesta, gana la más estricta.
  conBase(db2 => {
    aprenderDeIa(db2, { it: LLEVAR, texto: 'Llevo amigos y familia sin cobrar nada nunca', g: ia('bien') });
    aprenderDeIa(db2, { it: LLEVAR, texto: 'Llevo amigos y familia sin cobrar nada nunca, de verdad', g: ia('casi') });
    assert.equal(calificarSistema(ORAL, LLEVAR, 'Llevo a amigos y familia, sin cobrar nada nunca', { db: db2 }).veredicto, 'casi');
  });
}));

test('sin IA, con algo aprendido: los números que el libro no dice bajan la nota (en aviación, los números cuentan)', () => conBase(db => {
  // Lo de antes (sin aprender): «bien» aunque dijo 60 días (el libro: 3 aterrizajes en 90 días).
  assert.equal(calificarSistema(ORAL, ATERRIZAJES, '3 aterrizajes en 60 días').veredicto, 'bien');
  aprenderDeIa(db, { it: ATERRIZAJES, texto: 'Tres aterrizajes en noventa días', g: ia('bien') });
  // La misma (con números en letras): «bien» aprendido.
  const ok = calificarSistema(ORAL, ATERRIZAJES, '3 aterrizajes en 90 días', { db });
  assert.deepEqual([ok.veredicto, ok.aprendido], ['bien', true]);
  // Un número que no es: nunca parecida; con uno bien y otro mal, «casi»; sin ninguno del libro, «mal».
  const casi = calificarSistema(ORAL, ATERRIZAJES, '3 aterrizajes en 60 días', { db });
  assert.equal(casi.veredicto, 'casi');
  assert.match(casi.linea, /60/);
  assert.equal(calificarSistema(ORAL, ATERRIZAJES, '5 aterrizajes en 60 días', { db }).veredicto, 'mal');
  assert.equal(calificarSistema(ORAL, ATERRIZAJES, 'Five landings in sixty days', { db }).veredicto, 'mal');
}));

test('sin IA: las palabras que la IA premió seguido (y casi nunca en las «mal») se suman a las del libro', () => conBase(db => {
  const texto = 'Es una referencia cero donde se mide';
  assert.equal(calificarSistema(ORAL, DATUM, texto).veredicto, 'casi', 'antes: solo «mide» del libro');
  for (const t of ['Es la referencia cero', 'Referencia cero del fabricante', 'Un punto cero de referencia']) aprenderDeIa(db, { it: DATUM, texto: t, g: ia('bien') });
  aprenderDeIa(db, { it: DATUM, texto: 'No sé, el peso', g: ia('mal') });
  assert.deepEqual(clavesAprendidas(ejemplosDe(db, DATUM)), ['cero', 'refer']);
  const g = calificarSistema(ORAL, DATUM, texto, { db });
  assert.deepEqual([g.veredicto, g.sistema, g.aprendido], ['bien', true, true]);
  assert.match(g.bienDicho, /referencia/, 'lo que dijo él, como lo dijo');
  // Con menos de 3 «bien», nada aprendido como palabra clave.
  assert.deepEqual(clavesAprendidas(ejemplosDe(db, DATUM).filter(e => e.veredicto !== 'bien').concat(ejemplosDe(db, DATUM).filter(e => e.veredicto === 'bien').slice(0, 2))), []);
}));

// ---------- Por las rutas, como en la app ----------
const ORAL_SUBIR = paqueteOralMuestra();
async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(ORAL_SUBIR) });
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
const tareaVivo = c => c.db.prepare(`SELECT id FROM tareas WHERE datos LIKE '%"uso":"instructor_oral_vivo"%' ORDER BY id DESC`).get();
const calificacion = (veredicto, extra = {}) => ({ tipo: 'ok', json: { veredicto, linea: veredicto === 'bien' ? 'Bien, eso es.' : 'No, eso no.', bien_dicho: 'Lo de los amigos.', falto: veredicto === 'bien' ? '' : 'Que nunca se cobra.', repregunta: '', ...extra } });
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const indiceDe = (s, pregunta) => s.preguntas.findIndex(q => q.pregunta_en === pregunta);

test('por las rutas: aprende de la IA (la primera y la repregunta, nunca «No sé»); sin IA, otro alumno recibe ese veredicto; eliminar al alumno no rompe nada', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const pLlevar = ORAL_JSON.materias[0].temas[0].libro_qa[0].pregunta_en;
    const pVeces = ORAL_JSON.materias[0].temas[0].libro_qa[1].pregunta_en;
    const pDatum = ORAL_JSON.materias[1].temas[0].libro_qa[1].pregunta_en;
    const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 6 } })).datos;
    // La primera: «casi» con repregunta; la repregunta: «bien».
    const i0 = indiceDe(s, pVeces);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: i0, texto: 'Con un instructor cada tanto' } })).datos.estado, 'pendiente');
    c.falso.siguiente(calificacion('casi', { repregunta: '¿Cada cuántos meses?' }));
    await c.hacer(tareaVivo(c).id);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/${i0}`, { galleta: c.z })).datos.repregunta, '¿Cada cuántos meses?');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: i0, texto: 'Cada 24 meses', seguimiento: true } })).datos.estado, 'pendiente');
    c.falso.siguiente(calificacion('bien'));
    await c.hacer(tareaVivo(c).id);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/${i0}`, { galleta: c.z })).datos.veredicto, 'bien');
    // La de llevar amigos: la IA dice «mal» (y esta la lee «terminar», no la pantalla).
    const i1 = indiceDe(s, pLlevar);
    await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: i1, texto: 'Puedo llevar amigos y cobrarles el vuelo' } });
    c.falso.siguiente(calificacion('mal', { linea: 'No: nunca por dinero.' }));
    await c.hacer(tareaVivo(c).id);
    // «No sé»: nada que aprender.
    await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: indiceDe(s, pDatum), texto: '' } });
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_oral_aprendido').get().n, 2, 'la primera y la repregunta (leídas por la pantalla)');
    await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.z, datos: { sesion: s.sesion } });
    const fs = filas(c.db);
    assert.deepEqual(fs.map(f => [f.seguimiento, f.veredicto]).sort(), [[0, 'casi'], [0, 'mal'], [1, 'bien']]);
    assert.equal(fs.find(f => f.seguimiento === 1).tokens, normalizar('Con un instructor cada tanto Cada 24 meses').join(' '), 'la repregunta, junto con la primera');
    assert.ok(fs.every(f => f.edicion === 'muestra-oral'), JSON.stringify(fs.map(f => f.edicion)));
    const todo = JSON.stringify(fs).toLowerCase();
    for (const n of ['zoelia', 'quirino']) assert.ok(!todo.includes(n), 'sin nombres');
    // El administrador lo ve (Dinero e IA → IA por alumno).
    const adm = (await pedir(c.base, 'GET', '/api/admin/academia/ia-alumnos', { galleta: c.admin })).datos;
    assert.deepEqual(adm.aprendioOral, { respuestas: 3, preguntas: 2 });
    // Se elimina a la alumna que respondió: lo aprendido sigue sirviendo.
    const el = await pedir(c.base, 'POST', `/api/admin/usuarios/${idDe(c, 'zoelia')}/eliminar`, { galleta: c.admin, datos: {}, cabeceras: { 'X-Confirmar-Clave': Buffer.from(CLAVE).toString('base64') } });
    assert.equal(el.codigo, 200, JSON.stringify(el.datos));
    // Otro alumno, con la IA en pausa: lo califica el sistema con lo aprendido.
    c.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(clavePausa(idDe(c, 'quirino')), JSON.stringify({ pausada: true }), new Date().toISOString());
    const s2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 6 } })).datos;
    const r = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s2.sesion, i: indiceDe(s2, pLlevar), texto: 'Puedo llevar a mis amigos y cobrarles el vuelo.' } })).datos;
    assert.deepEqual([r.estado, r.veredicto, r.sistema, r.aprendido, r.linea], ['lista', 'mal', true, true, 'No: nunca por dinero.'], JSON.stringify(r));
    const v = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s2.sesion}/${indiceDe(s2, pLlevar)}`, { galleta: c.q })).datos;
    assert.equal(v.aprendido, true);
    // Una que no se parece: el sistema de siempre, sin «aprendido».
    const r2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s2.sesion, i: indiceDe(s2, pDatum), texto: 'Una línea imaginaria desde donde se mide el brazo' } })).datos;
    assert.deepEqual([r2.estado, r2.sistema, r2.aprendido], ['lista', true, undefined]);
    assert.equal(filas(c.db).length, 3, 'lo que califica el sistema no se aprende');
    const fin = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.q, datos: { sesion: s2.sesion } })).datos;
    assert.equal(fin.revision[indiceDe(s2, pLlevar)].aprendido, true);
  });
});

test('los textos de lo aprendido existen en los dos idiomas', async () => {
  const { readFileSync } = await import('node:fs');
  for (const n of ['es', 'en']) {
    const d = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    for (const k of ['vivo.califico_aprendido', 'ia3.aprendio_oral']) assert.ok(d[k], `${n}: ${k}`);
  }
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.match(vista, /vivo\.califico_aprendido/);
});
