// Academia 0.12.4: la IA «más poderosa», siempre contra el proveedor FALSO (nunca una clave ni una API de verdad):
//  (a) el chat y las dudas CITAN la pregunta del Test Guide (número y respuesta) y se revisa contra la clave;
//  (b) la «nota para ti» encima de la explicación compartida (sin IA, con su historia de errores);
//  (c) la «Mini-clase IA» de un concepto de «Mi repaso» (compartida, cobrada como una explicación, con el candado);
//  (d) el «Plan de hoy» solo con acciones que existen en la app;
//  y una pregunta en la que la IA contradijo al Test Guide 2 veces queda 7 días con lo básico (sin pausar la IA).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, unaMala, explicar, pedidosIa, cuerpoDe, datosDe, explicacionFalsa, DE, NOMBRES, textoDe } from './instructor-ia-base.js';
import { darProfesor } from '../src/academia/profesor.js';
import { saldoIa } from '../src/academia/tiempo-ia.js';
import { revisarCitas, claveDeCitas, revisarRespuesta, preguntaSinIa } from '../src/academia/instructor-ia.js';

const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const correctaDe = id => DE(id).original.opciones.find(o => o.letra === DE(id).original.correcta).texto;
const malaDe = id => DE(id).original.opciones.find(o => o.letra !== DE(id).original.correcta).texto;
const chat = (respuesta, citas = []) => ({ tipo: 'ok', json: { respuesta, pregunta_control: '¿Qué baja con la altura?', estudiar_ahora: 'Hipoxia', buscar_en_youtube: [], terminos: [], cita_test_guide: citas } });

test('(a) revisar citas, puro: la buena queda con la respuesta del Test Guide; una que contradice, o «la correcta es <otra>», no sirve', () => {
  const clave = claveDeCitas([{ numero: 'M-01', opciones: ['Agua suficiente.', 'Oxígeno suficiente.', 'Azúcar suficiente.'], respuesta_del_test_guide: 'Oxígeno suficiente.' }]);
  assert.deepEqual(revisarCitas(clave, [{ numero: 'M-01', respuesta: 'oxigeno suficiente' }], 'Es por el oxígeno.'), [{ numero: 'M-01', respuesta: 'Oxígeno suficiente.' }]);
  assert.deepEqual(revisarCitas(clave, [{ numero: 'X-99', respuesta: 'lo que sea' }], ''), [], 'una pregunta que no se le dio no se muestra');
  assert.throws(() => revisarCitas(clave, [{ numero: 'M-01', respuesta: 'Agua suficiente.' }], ''), e => e.clave === 'no_se_pudo_guardar');
  assert.throws(() => revisarCitas(clave, [], 'En la M-01 la correcta es agua suficiente, ojo.'), e => e.clave === 'no_se_pudo_guardar');
  assert.throws(() => revisarRespuesta({ uso: 'instructor_plan', acciones: ['tema'] }, { titulo: 'x', pasos: [{ accion: 'inventada', porque: 'y' }] }), e => e.clave === 'no_se_pudo_guardar');
});

test('(a) el Profesor virtual cita la pregunta del Test Guide: la cita buena se guarda; la que contradice a la clave no se usa', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    await unaMala(c, c.z, 'muestra-h1');
    darProfesor(c.db, z, true);
    c.falso.siguiente(chat('Te falta oxígeno arriba.', [{ numero: 'M-01', respuesta: correctaDe('muestra-h1') }]));
    const r = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Qué es la hipoxia? Suficiente oxígeno' } })).datos;
    assert.equal(r.ia.estado, 'pendiente');
    await c.hacer(r.ia.tarea);
    const cuerpo = cuerpoDe(pedidosIa(c).at(-1));
    assert.match(cuerpo.system, /cita_test_guide/);
    assert.ok(cuerpo.output_config.format.schema.required.includes('cita_test_guide'));
    assert.deepEqual(datosDe(cuerpo.messages[0].content).preguntas_que_ya_respondio.map(p => p.numero), ['M-01']);
    let h = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos.historial.at(-1);
    assert.equal(h.estado, 'lista');
    assert.deepEqual(h.respuesta.citas, [{ numero: 'M-01', respuesta: correctaDe('muestra-h1') }]);
    // Contradice a la clave: no se usa (se pagó y no sirvió).
    c.falso.siguiente(chat('Es por el agua.', [{ numero: 'M-01', respuesta: malaDe('muestra-h1') }]));
    const r2 = (await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.z, datos: { mensaje: '¿Qué es la hipoxia? Suficiente oxígeno otra vez' } })).datos;
    const hecha = await c.hacer(r2.ia.tarea);
    assert.deepEqual([hecha.resultado.usada, hecha.resultado.motivo], [false, 'no_se_pudo_guardar']);
    h = (await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.z })).datos.historial.at(-1);
    assert.equal(h.respuesta, null);
    // El chat nunca deja la pausa del dueño por una sola respuesta mala.
    assert.notEqual(c.db.prepare('SELECT pausa_motivo FROM secretos').get().pausa_motivo, 'fallas_seguidas');
  }, { modelo: 'claude-haiku-5-5' });
});

test('(b) la nota para ti: después de fallar dos veces el mismo punto, «Explícamelo» lo dice (sin IA y sin mandar nada)', async () => {
  await conInstructor(async c => {
    await unaMala(c, c.z, 'muestra-h1');
    const x = await unaMala(c, c.z, 'muestra-h1');
    const r = (await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.z, datos: { intento: x.intento.id, pregunta: x.pregunta.id, ia: false } })).datos;
    assert.ok(r.basica.nota, 'la nota está');
    assert.equal(r.basica.nota.fallos >= 2, true);
    assert.equal(r.basica.nota.mismaOpcion, 2);
    assert.ok(r.basica.nota.idea, 'la idea equivocada que repite');
    assert.equal(r.ia, null);
    assert.equal(pedidosIa(c).length, 0, 'la nota no usa la IA');
  }, { modelo: 'claude-haiku-5-5' });
});

test('(c) la Mini-clase IA: se pide, se guarda compartida, otro alumno la ve sin pagar a la IA (pero cuesta su minuto) y el candado del Test Guide', async () => {
  await conInstructor(async c => {
    // Tres errores del mismo concepto lo ponen en «Mi repaso» (zoelia y quirino).
    for (const g of [c.z, c.q]) for (let k = 0; k < 3; k++) await unaMala(c, g, 'muestra-h1');
    const repaso = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.z })).datos;
    const clave = repaso.paraRepasar.find(x => x.clave)?.clave;
    assert.ok(clave, JSON.stringify(repaso.paraRepasar));
    const clase = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(clave)}`, { galleta: c.z })).datos;
    assert.equal(clase.ia, true, 'con IA de verdad, el botón está');
    const q = DE(clase.pregunta.id);
    const correcta = String(q.original.opciones.findIndex(o => o.letra === q.original.correcta) + 1);
    c.falso.siguiente({ tipo: 'ok', json: { opcion_correcta: correcta, concepto: 'Arriba la presión baja y entra menos oxígeno.', ejemplo: 'Subiendo a 12 000 pies sin oxígeno…', trampa: 'Fíjate en «suficiente».', recuerda: 'Menos presión, menos oxígeno.', terminos: [] } });
    const antes = saldoIa(c.db, idDe(c, 'zoelia')).minutos;
    const r = (await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.z, datos: { concepto: clave } })).datos;
    assert.equal(r.ia.estado, 'pendiente');
    assert.equal(saldoIa(c.db, idDe(c, 'zoelia')).minutos, antes - 1, 'se cobra como una explicación');
    await c.hacer(r.ia.tarea);
    const enviado = textoDe(pedidosIa(c).at(-1));
    for (const nombre of NOMBRES) assert.ok(!enviado.toLowerCase().includes(nombre), 'nada personal');
    const lista = (await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${r.ia.tarea}`, { galleta: c.z })).datos;
    assert.equal(lista.estado, 'lista');
    assert.match(lista.concepto, /presión/);
    // Quirino (mismo concepto y misma opción): de lo guardado, sin llamar otra vez.
    const n = pedidosIa(c).length;
    const antesQ = saldoIa(c.db, idDe(c, 'quirino')).minutos;
    const r2 = (await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.q, datos: { concepto: clave } })).datos;
    assert.equal(r2.ia.estado, 'lista', 'compartida: la misma mini-clase, ya guardada');
    assert.equal(pedidosIa(c).length, n, 'no se paga otra vez a la IA');
    assert.equal(saldoIa(c.db, idDe(c, 'quirino')).minutos, antesQ - 1, 'pero cuesta su minuto, como una explicación guardada');
    // Un alumno sin IA de verdad (retiró su permiso): la mini-clase no ofrece el botón y la ruta no pide nada.
    c.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '0', ?) ON CONFLICT(clave) DO UPDATE SET valor = '0'").run(`cuenta.consentimiento_ia.${idDe(c, 'quirino')}`, new Date().toISOString());
    assert.equal((await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(clave)}`, { galleta: c.q })).datos.ia, false);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.q, datos: { concepto: clave } })).datos.ia, null);
    assert.equal(pedidosIa(c).length, n);
  }, { modelo: 'claude-haiku-5-5' });
});

test('(c) una pregunta en la que la IA contradijo al Test Guide 2 veces queda 7 días con lo básico, sin pausar la IA', async () => {
  await conInstructor(async c => {
    const x = await unaMala(c, c.z, 'muestra-h1');
    const q = DE('muestra-h1');
    const otra = String(q.original.opciones.findIndex(o => o.letra !== q.original.correcta) + 1);
    for (const galleta of [c.z, c.q]) {
      const y = galleta === c.z ? x : await unaMala(c, galleta, 'muestra-h1');
      c.falso.siguiente(explicacionFalsa(otra));
      const r = (await explicar(c, galleta, y)).datos;
      assert.equal(r.ia.estado, 'pendiente');
      await c.hacer(r.ia.tarea);
    }
    assert.equal(preguntaSinIa(c.db, 'muestra-h1'), true);
    const n = pedidosIa(c).length;
    const r = (await explicar(c, c.z, x)).datos;
    assert.equal(r.ia, null, 'esa pregunta: solo lo básico, sin «no pudo»');
    assert.equal(pedidosIa(c).length, n);
    assert.equal(preguntaSinIa(c.db, 'muestra-h1', Date.now() + 8 * 86_400_000), false, 'a los 7 días vuelve a intentarse');
    assert.notEqual(c.db.prepare('SELECT pausa_motivo FROM secretos').get().pausa_motivo, 'fallas_seguidas', 'la IA sigue para todos');
  }, { modelo: 'claude-haiku-5-5' });
});

test('(d) el Plan de hoy: sin IA las primeras acciones; con IA, solo las acciones que existen (una inventada se descarta)', async () => {
  await conInstructor(async c => {
    await unaMala(c, c.z, 'muestra-h1');
    const g = (await pedir(c.base, 'GET', '/api/academia/instructor/plan-hoy', { galleta: c.z })).datos;
    assert.ok(g.basico.length >= 1 && g.basico.every(a => a.id && a.accion), JSON.stringify(g.basico));
    const ids = g.basico.map(a => a.id);
    c.falso.siguiente({ tipo: 'ok', json: { titulo: 'Hoy, 25 minutos', pasos: [{ accion: 'inventada', porque: 'no existe' }, { accion: ids[0], porque: 'primero esto' }] } });
    const r = (await pedir(c.base, 'POST', '/api/academia/instructor/plan-hoy', { galleta: c.z, datos: {} })).datos;
    assert.equal(r.ia.estado, 'pendiente');
    await c.hacer(r.ia.tarea);
    const enviado = datosDe(cuerpoDe(pedidosIa(c).at(-1)).messages[0].content);
    assert.ok(ids.every(id => enviado.acciones.some(a => a.id === id)), 'la IA recibe la lista de acciones de verdad');
    const despues = (await pedir(c.base, 'GET', '/api/academia/instructor/plan-hoy', { galleta: c.z })).datos;
    assert.equal(despues.ia.estado, 'lista');
    assert.deepEqual(despues.ia.pasos.map(p => p.id), [ids[0]], 'la inventada no está');
    assert.ok(despues.ia.pasos[0].accion, 'cada paso con su botón de verdad');
    // Pedirlo otra vez el mismo día: lo guardado.
    const n = pedidosIa(c).length;
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/plan-hoy', { galleta: c.z, datos: {} })).datos.ia.estado, 'lista');
    assert.equal(pedidosIa(c).length, n);
  }, { modelo: 'claude-haiku-5-5' });
});
