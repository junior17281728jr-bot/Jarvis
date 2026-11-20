// Academia 0.14.77: «¿Lo entendiste? 👍 / 👎» (src/academia/entendi.js), su señal en «Dónde más cuesta» y Administrador →
// «Para Claude» (src/academia/para-claude.js). Todo con alumnos y datos INVENTADOS aquí (el paquete de muestra de las
// pruebas), fechas fijas y sin la IA.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir } from './instructor-ia-base.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { paqueteActivo, guardarAjuste, leerAjuste } from '../src/academia/paquetes.js';
import { analisisTema } from '../src/academia/tutor.js';
import { guardarOpinion } from '../src/academia/opiniones.js';
import { votar, votosVigentes, todosLosVotos, resolverItem, claveVoto, votosDeClave, MUESTRA_VOTOS, PRE_ENTENDI } from '../src/academia/entendi.js';
import { puntaje, ordenCuesta, calcularCuesta, wilsonBajo, idTarjeta, huellaTarjeta, anotarUsoTarjeta } from '../src/academia/donde-cuesta.js';
import { armarReporte, markdownParaClaude, semanaIso, fotoSemanal, guardarSemana, claveSemana, FORMATO_PARA_CLAUDE } from '../src/academia/para-claude.js';
import { semanaParaClaude } from '../src/tareas/manejadores.js';

const MATERIA = 'factores_humanos';
const TEMA = 'muestra-hipoxia';
const CLAVE_IA = `academia.ia.tarjeta.${'b'.repeat(32)}`;
const AHORA = Date.parse('2026-11-18T12:00:00Z');
const T = n => new Date(Date.parse('2026-11-01T10:00:00Z') + n * 60_000).toISOString();
const alumno = id => ({ id, rol: 'alumno' });

function alumnos(db, n, prefijo = 'al', extra = {}) {
  const admin = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get()?.id ?? null;
  return Array.from({ length: n }, (_, i) => crearUsuario(db, { nombre: `${prefijo}${i}`, claveHash: 'x', creadoPor: admin, ...extra }));
}
function responder(db, u, pregunta, correcta, en) {
  const it = db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, empezado_en) VALUES (?, 'practica', ?)").run(u, en).lastInsertRowid;
  db.prepare('INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(it, u, pregunta, MATERIA, TEMA, correcta ? 'B' : 'A', correcta ? 1 : 0, en.slice(0, 10), en);
}
function tarjetaConPreguntas(p) {
  const a = analisisTema(p, MATERIA, TEMA);
  const [indice, ids] = [...a.porTarjeta.entries()].sort((x, y) => x[0] - y[0])[0];
  return { indice, ids, n: indice + 1 };
}
// Un paquete mínimo (solo para lo que mira entendi.js): una tarjeta cuyo texto se puede cambiar.
const paqueteChico = texto => ({ materias: [{ id: 'm1', temas: [{ id: 't1', paquete: 7, secciones: [{ titulo: 'La hélice', texto }] }] }], preguntas: new Map(), deTema: new Map() });
const filasDe = db => db.prepare('SELECT clave, valor FROM ajustes WHERE clave > ? AND clave < ? ORDER BY clave').all(PRE_ENTENDI, `${PRE_ENTENDI}~`);

test('votar: un voto por alumno, el mismo dos veces no cambia nada, se puede cambiar, y el administrador no cuenta', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const p = paqueteChico('Empuja aire hacia atrás.');
    const [a, b] = alumnos(db, 2, 'v');
    const item = { tipo: 'tarjeta', materia: 'm1', tema: 't1', n: 1 };
    assert.deepEqual(votar(db, p, alumno(a), { ...item, voto: 'no' }, { ahora: AHORA }), { voto: 'no', guardado: true });
    const antes = filasDe(db);
    votar(db, p, alumno(a), { ...item, voto: 'no' }, { ahora: AHORA + 1000 });
    assert.deepEqual(filasDe(db), antes, 'idempotente: lo mismo otra vez no escribe');
    votar(db, p, alumno(a), { ...item, voto: 'si' }, { ahora: AHORA + 2000 });
    votar(db, p, alumno(b), { ...item, voto: 'no' }, { ahora: AHORA + 3000 });
    votar(db, p, { id: c.adminId, rol: 'admin' }, { ...item, voto: 'no' }, { ahora: AHORA + 4000 });
    const [v] = votosVigentes(db, p);
    assert.deepEqual([v.si, v.no, v.n], [1, 1, 2], 'cambió de 👎 a 👍; el administrador no cuenta');
    assert.equal(filasDe(db).length, 1);
    assert.throws(() => votar(db, p, alumno(a), { ...item, voto: 'quizas' }), /datos_no_validos/);
    assert.throws(() => votar(db, p, alumno(a), { ...item, n: 9, voto: 'si' }), /no_existe/);
    assert.throws(() => votar(db, p, alumno(a), { tipo: 'ia', clave: 'academia.ia.consejo.5.x', voto: 'si' }), /no_existe/, 'nunca algo de un alumno');
    // Por la API: responde solo SU voto (nunca la cuenta de los demás).
    const pk = paqueteActivo(db, c.config);
    const { n } = tarjetaConPreguntas(pk);
    const r = await pedir(c.base, 'POST', '/api/academia/entendi', { galleta: c.z, datos: { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n, voto: 'no' } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.deepEqual(r.datos, { voto: 'no', guardado: true });
    const r2 = await pedir(c.base, 'POST', '/api/academia/entendi', { galleta: c.z, datos: { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n, voto: 'si' } });
    assert.deepEqual(r2.datos, { voto: 'si', guardado: true });
    const fila = votosVigentes(db, pk).find(x => x.tipo === 'tarjeta' && x.donde.materia === MATERIA);
    assert.deepEqual([fila.si, fila.no], [1, 0]);
  }, { encender: false });
});

test('si el texto cambia (otra huella), la cuenta empieza de cero y lo de antes queda guardado tal cual', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const us = alumnos(db, 6, 'h');
    const viejo = paqueteChico('Texto viejo.');
    for (const u of us) votar(db, viejo, alumno(u), { tipo: 'tarjeta', materia: 'm1', tema: 't1', n: 1, voto: 'no' }, { ahora: AHORA });
    const claveVieja = claveVoto(resolverItem(db, viejo, { tipo: 'tarjeta', materia: 'm1', tema: 't1', n: 1 }));
    const guardadoViejo = leerAjuste(db, claveVieja);
    const nuevo = paqueteChico('Texto nuevo, más claro.');
    assert.deepEqual(votosVigentes(db, nuevo), [], 'con el texto nuevo: sin votos');
    votar(db, nuevo, alumno(us[0]), { tipo: 'tarjeta', materia: 'm1', tema: 't1', n: 1, voto: 'si' }, { ahora: AHORA + 1000 });
    const [v] = votosVigentes(db, nuevo);
    assert.deepEqual([v.si, v.no], [1, 0]);
    assert.equal(leerAjuste(db, claveVieja), guardadoViejo, 'nada se borra ni se pisa');
    assert.equal(todosLosVotos(db, nuevo).filter(x => !x.vigente).length, 1);
    // Lo de la IA: si se escribe otra explicación con la misma clave, también empieza de cero.
    guardarAjuste(db, CLAVE_IA, JSON.stringify({ tipo: 'mejor', explicacion: 'Primera.', en: '2026-11-01T09:00:00.000Z' }));
    votar(db, null, alumno(us[1]), { tipo: 'ia', clave: CLAVE_IA, voto: 'no' }, { ahora: AHORA });
    guardarAjuste(db, CLAVE_IA, JSON.stringify({ tipo: 'mejor', explicacion: 'Segunda, distinta.', en: '2026-11-02T09:00:00.000Z' }));
    assert.equal(votosVigentes(db, nuevo).filter(x => x.tipo === 'ia').length, 0);
  }, { encender: false });
});

test('«no se entendió» en el puntaje: con menos de 5 votos no cuenta; sin votos el puntaje es el de antes', () => {
  assert.equal(MUESTRA_VOTOS, 5);
  for (let n = 1; n < MUESTRA_VOTOS; n++) assert.equal(puntaje({ no: { n, no: n } }).puntaje, null, `${n} votos`);
  assert.equal(puntaje({ no: { n: 5, no: 4 } }).puntaje, 80);
  // Sin votos, lo de siempre (los pesos de antes por 0,8: la misma proporción).
  assert.equal(puntaje({ fallo: { n: 10, mal: 6, alumnos: 3 }, pide: { pidieron: 2, alumnos: 10 }, despues: { n: 5, bien: 0 } }).puntaje, 56);
  // Con votos pesa 0,2 de 1: fallo 60 y 👎 100 → (0,4·60 + 0,2·100) / 0,6 = 73.
  assert.equal(puntaje({ fallo: { n: 10, mal: 6, alumnos: 3 }, no: { n: 5, no: 5 } }).puntaje, 73);
});

test('proporción y muestra juntas: 1 de 1 nunca arriba; 7 de 10 queda arriba de 2 de 2', () => {
  assert.equal(puntaje({ no: { n: 1, no: 1 } }).puntaje, null, '1 de 1 👎: pocos datos');
  assert.equal(puntaje({ fallo: { n: 1, mal: 1, alumnos: 1, alumnosMal: 1 } }).puntaje, null, '1 de 1 falló: pocos datos');
  const fila = (nombre, partes) => ({ materia: 'm', tema: nombre, indice: 0, ...puntaje(partes) });
  const siete = fila('siete', { no: { n: 10, no: 7 } });
  const dos = fila('dos', { no: { n: 2, no: 2 } });
  const uno = fila('uno', { fallo: { n: 1, mal: 1, alumnos: 1, alumnosMal: 1 } });
  const poco = fila('poco', { no: { n: 6, no: 1 } });
  const orden = [dos, uno, poco, siete].sort(ordenCuesta).map(x => x.tema);
  assert.deepEqual(orden.slice(0, 2), ['siete', 'poco']);
  assert.ok(orden.indexOf('siete') < orden.indexOf('dos') && orden.indexOf('siete') < orden.indexOf('uno'));
  // Con la misma proporción, más alumnos = más seguro: 70 de 100 arriba de 7 de 10.
  const setenta = fila('setenta', { fallo: { n: 100, mal: 70, alumnos: 100, alumnosMal: 70 } });
  const sieteF = fila('sieteF', { fallo: { n: 10, mal: 7, alumnos: 10, alumnosMal: 7 } });
  assert.equal(setenta.puntaje, sieteF.puntaje);
  assert.deepEqual([sieteF, setenta].sort(ordenCuesta).map(x => x.tema), ['setenta', 'sieteF']);
  assert.ok(wilsonBajo(7, 10) > wilsonBajo(1, 1));
});

test('la cuenta con votos (SQL y filas): 5 alumnos 👎 ponen la tarjeta en la lista; 1 solo queda en «pocos datos»', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { indice, n } = tarjetaConPreguntas(p);
    const [solo] = alumnos(db, 1, 'solo');
    votar(db, p, alumno(solo), { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n, voto: 'no' }, { ahora: AHORA });
    let cuenta = calcularCuesta(db, p, { ahora: AHORA });
    assert.equal(cuenta.tarjetas.length, 0, '1 de 1 no entra');
    assert.ok(cuenta.pocos.some(x => x.indice === indice && x.partes.no.n === 1));
    for (const u of alumnos(db, 4, 'mas')) votar(db, p, alumno(u), { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n, voto: 'no' }, { ahora: AHORA });
    cuenta = calcularCuesta(db, p, { ahora: AHORA });
    const t = cuenta.tarjetas.find(x => x.indice === indice);
    assert.ok(t, JSON.stringify(cuenta));
    assert.deepEqual([t.partes.no.ok, t.partes.no.n, t.partes.no.no, t.puntaje], [true, 5, 5, 100]);
    assert.ok(cuenta.temas.some(x => x.tema === TEMA && x.partes.no?.ok));
  }, { encender: false });
});

test('«Para Claude»: solo el administrador (403); sin nombres ni ids de alumnos; formato estable', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { ids, n } = tarjetaConPreguntas(p);
    const us = alumnos(db, 10, 'Wenceslao');
    db.prepare("UPDATE usuarios SET nombre_visible = 'Ximena Quintanilla' WHERE nombre LIKE 'Wenceslao%'").run();
    us.forEach((u, i) => {
      for (const q of ids) { responder(db, u, q, i >= 7, T(i)); responder(db, u, q, i >= 7, T(i + 1)); }
      votar(db, p, alumno(u), { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n, voto: i < 7 ? 'no' : 'si' }, { ahora: AHORA });
      guardarOpinion(db, u, { tipo: 'tema', materia: MATERIA, tema: TEMA, voto: 'duda', texto: 'Wenceslao0 no entendió, escríbanle a ximena@correo.com' }, { ahoraMs: AHORA });
    });
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/para-claude', { galleta: c.z })).codigo, 403);
    const r = await pedir(c.base, 'GET', '/api/admin/academia/para-claude', { galleta: c.admin });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    const todo = `${JSON.stringify(r.datos.reporte)}\n${r.datos.markdown}`;
    for (const x of ['Wenceslao', 'Ximena', 'Quintanilla', 'ximena@', 'zoelia', 'quirino', 'junior', 'usuarioId', '"u":']) assert.ok(!todo.includes(x), `sale «${x}»`);
    const md = r.datos.markdown;
    assert.match(md, new RegExp(`^formato: ${FORMATO_PARA_CLAUDE}$`, 'm'));
    // Las secciones, siempre las mismas y en el mismo orden.
    assert.deepEqual([...md.matchAll(/^## (.+)$/gm)].map(m => m[1].replace(/ .*/, '')), ['1.', '2.', '3.', '4.', '5.', '6.', '7.', 'Cómo']);
    // Los ids que mapean al paquete y «x de n».
    const id = idTarjeta(MATERIA, TEMA, p.materias.find(m => m.id === MATERIA).temas.find(t => t.id === TEMA).secciones[n - 1].titulo);
    assert.ok(md.includes(`id=${id}`), md);
    assert.match(md, /7 de 10 votaron 👎 \(70 %\)/);
    assert.match(md, /7 de 10 alumnos fallaron la mayoría/);
    assert.match(md, new RegExp(`pregunta=${ids[0]}`));
    assert.match(md, /10 de 10 alumnos \(100 %\): duda 10/);
    // Determinista: lo mismo con los mismos datos y la misma hora.
    const a = armarReporte(db, p, { ahora: AHORA });
    assert.equal(markdownParaClaude(a), markdownParaClaude(armarReporte(db, p, { ahora: AHORA })));
    assert.equal(a.semana, '2026-W47');
  }, { encender: false });
});

test('la foto de cada semana: una vez por semana, nunca se pisa, y «antes / ahora» la compara', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { ids, n } = tarjetaConPreguntas(p);
    for (const [i, u] of alumnos(db, 6, 's').entries()) {
      for (const q of ids) { responder(db, u, q, false, T(i)); responder(db, u, q, false, T(i + 1)); }
      votar(db, p, alumno(u), { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n, voto: 'no' }, { ahora: AHORA });
    }
    const ctx = { db, config, escribir: async fn => fn() };
    const semana1 = AHORA - 7 * 86_400_000;
    assert.equal(await semanaParaClaude(ctx, semana1), true);
    const guardada = leerAjuste(db, claveSemana(semanaIso(semana1)));
    assert.ok(guardada);
    assert.equal(await semanaParaClaude(ctx, semana1 + 3600_000), false, 'la misma semana: no otra');
    assert.equal(guardarSemana(db, { ...fotoSemanal(armarReporte(db, p, { ahora: semana1 })), puntaje: 'otro' }, semana1), false, 'nunca se pisa');
    assert.equal(leerAjuste(db, claveSemana(semanaIso(semana1))), guardada);
    const foto = JSON.parse(guardada);
    assert.ok(foto.items.length > 0 && foto.items.every(x => typeof x.id === 'string' && 'huella' in x));
    assert.ok(!guardada.includes('"u":') && !/nombre/.test(guardada));
    assert.equal(await semanaParaClaude(ctx, AHORA), true, 'la semana siguiente: otra');
    const r = armarReporte(db, p, { ahora: AHORA + 1000 });
    assert.equal(r.comparadaCon, semanaIso(semana1));
    const x = r.mejorar.find(y => y.tipo === 'tarjeta');
    assert.equal(x.antes.semana, semanaIso(semana1));
    assert.equal(x.antes.textoNuevo, false);
    assert.match(markdownParaClaude(r), /antes \(2026-W46\): \d+\/100 — mismo texto/);
  }, { encender: false });
});

test('la promoción a «Otra forma de verlo»: con 5 votos o más y más 👎 que 👍 no pasa (las muestras no cambian)', async () => {
  const { anotarUsoTarjeta, decidirPromociones } = await import('../src/academia/donde-cuesta.js');
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { indice, ids } = tarjetaConPreguntas(p);
    const s = p.materias.find(m => m.id === MATERIA).temas.find(t => t.id === TEMA).secciones[indice];
    guardarAjuste(db, CLAVE_IA, JSON.stringify({ tipo: 'mejor', explicacion: 'Arriba hay menos oxígeno en cada respiración.', en: '2026-11-01T09:00:00.000Z' }));
    const vieron = alumnos(db, 5, 'vio');
    for (const u of vieron) {
      anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: u, tipo: 'mejor', clave: CLAVE_IA, ahora: Date.parse(T(3)) });
      for (const q of ids) { responder(db, u, q, true, T(4)); responder(db, u, q, true, T(5)); }
    }
    for (const u of alumnos(db, 4, 'sin')) for (const q of ids) { responder(db, u, q, false, T(4)); responder(db, u, q, false, T(6)); }
    assert.equal(decidirPromociones(db, p).length, 1, 'sin votos pasa, como antes');
    for (const [i, u] of vieron.entries()) votar(db, p, alumno(u), { tipo: 'ia', clave: CLAVE_IA, voto: i < 3 ? 'no' : 'si' }, { ahora: AHORA });
    assert.deepEqual(decidirPromociones(db, p), [], '3 de 5 👎: no pasa');
    for (const u of vieron.slice(0, 2)) votar(db, p, alumno(u), { tipo: 'ia', clave: CLAVE_IA, voto: 'si' }, { ahora: AHORA + 1 });
    const [x] = decidirPromociones(db, p);
    assert.deepEqual(x.valor.medida.votos, { si: 4, no: 1 });
  }, { encender: false });
});

test('los otros lugares: la respuesta del libro del oral, una tarjeta del oral y la «Otra forma de verlo» (cuenta para su explicación)', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const [u] = alumnos(db, 1, 'o');
    const p = {
      ...paqueteChico('Empuja aire.'),
      oral: { materias: [{ id: 'oral_sistemas', temas: [{ id: 't01-a', paquete: 2, secciones: [{ titulo: 'El motor', texto: 'Cuatro tiempos.' }], libro_qa: [{ pregunta_en: 'What is a magneto?', respuesta_en: 'A generator.', pagina: 3 }] }] }] },
    };
    votar(db, p, alumno(u), { tipo: 'oral', materia: 'oral_sistemas', tema: 't01-a', n: 1, voto: 'no' }, { ahora: AHORA });
    votar(db, p, alumno(u), { tipo: 'tarjeta', materia: 'oral_sistemas', tema: 't01-a', n: 1, voto: 'si' }, { ahora: AHORA });
    const v = votosVigentes(db, p);
    assert.deepEqual(v.map(x => [x.tipo, x.si, x.no]).sort(), [['oral', 0, 1], ['tarjeta', 1, 0]]);
    assert.throws(() => votar(db, p, alumno(u), { tipo: 'oral', materia: 'oral_sistemas', tema: 't01-a', n: 2, voto: 'si' }), /no_existe/);
    // «Otra forma de verlo»: el voto va a la explicación guardada a la que apunta la clase.
    assert.throws(() => votar(db, p, alumno(u), { tipo: 'otra', materia: 'm1', tema: 't1', n: 1, voto: 'no' }), /no_existe/, 'sin «Otra forma de verlo»: nada');
    const s = p.materias[0].temas[0].secciones[0];
    guardarAjuste(db, CLAVE_IA, JSON.stringify({ tipo: 'mejor', explicacion: 'Como un ventilador.', en: '2026-11-01T09:00:00.000Z' }));
    guardarAjuste(db, `academia.clase.otra.${idTarjeta('m1', 't1', s.titulo)}`, JSON.stringify({ materia: 'm1', tema: 't1', titulo: s.titulo, h: huellaTarjeta(s), clave: CLAVE_IA }));
    votar(db, p, alumno(u), { tipo: 'otra', materia: 'm1', tema: 't1', n: 1, voto: 'no' }, { ahora: AHORA });
    assert.deepEqual(votosDeClave(db, CLAVE_IA), { si: 0, no: 1, n: 1 });
  }, { encender: false });
});

test('un alumno que repite no infla nada: «acertó después» y el fallo cuentan alumnos distintos', async () => {
  await conInstructor(async c => {
    const { db, config } = c;
    const p = paqueteActivo(db, config);
    const { indice, ids } = tarjetaConPreguntas(p);
    const s = p.materias.find(m => m.id === MATERIA).temas.find(t => t.id === TEMA).secciones[indice];
    const [solo, b1, b2] = alumnos(db, 3, 'rep');
    anotarUsoTarjeta(db, { materia: MATERIA, tema: TEMA, seccion: s, usuarioId: solo, tipo: 'mejor', ahora: Date.parse(T(1)) });
    for (let k = 0; k < 20; k++) for (const q of ids) responder(db, solo, q, false, T(2 + k));
    for (const u of [b1, b2]) for (const q of ids) { responder(db, u, q, true, T(30)); responder(db, u, q, true, T(31)); }
    const cuenta = calcularCuesta(db, p, { ahora: AHORA });
    const t = [...cuenta.tarjetas, ...cuenta.pocos].find(x => x.indice === indice);
    assert.ok(t, JSON.stringify(cuenta));
    assert.equal(t.partes.despues.n, 1, 'un alumno = un caso');
    assert.equal(t.partes.despues.ok, false);
    assert.deepEqual([t.partes.fallo.alumnosMal, t.partes.fallo.alumnos, t.partes.fallo.pct], [1, 3, 33], '1 de 3 alumnos, no el % de respuestas');
    assert.ok(t.partes.fallo.pctRespuestas > 80);
  }, { encender: false });
});
