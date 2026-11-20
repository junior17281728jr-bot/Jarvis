// Academia 0.14.57: lo COMPARTIDO que la IA ya escribió sale gratis cuando no hay IA (src/academia/saber-sin-ia.js).
// Siempre con el proveedor FALSO y el paquete de MUESTRA (todo inventado). Deterministas: ningún reloj ni azar de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, unaMala, explicar, explicacionFalsa, DE, DUENO, NOMBRES, pedidosIa, MUESTRA, mala } from './instructor-ia-base.js';
import { abrirBase } from '../src/nucleo/db.js';
import { configDePrueba } from './ayuda.js';
import { guardarConfigIa } from '../src/ia/config.js';
import { saldoIa, ajustarSaldo } from '../src/academia/tiempo-ia.js';
import { armadorClave, armarExplicacion, guardarRespuesta, TIPOS_SIN_IA } from '../src/academia/instructor-ia.js';
import { buscarGuardada, candidatos, recordarModelo, modelosConocidos, paraVer, anotarServida, resumenSaber } from '../src/academia/saber-sin-ia.js';
import { aprenderDeIa } from '../src/academia/oral-aprende.js';

const TEMA = { materia: 'factores_humanos', tema: 'muestra-hipoxia' };
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const correctaNum = id => String(DE(id).original.opciones.findIndex(o => o.letra === DE(id).original.correcta) + 1);
const apagar = c => guardarConfigIa(c.db, { encendida: false }, { config: c.config, usuarioId: c.adminId });
const sinPreparar = c => guardarConfigIa(c.db, { prepararClase: false }, { config: c.config, usuarioId: c.adminId });
const cuenta = (c, sql) => c.db.prepare(sql).get().n;
// Todo lo que tocaría un gasto: la fila, el libro de la IA, los usos del tiempo con IA y los pedidos al proveedor.
const gasto = c => ({
  tareas: cuenta(c, "SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'academia.instructor'"),
  llamadas: cuenta(c, 'SELECT COUNT(*) AS n FROM ia_llamadas'),
  usos: cuenta(c, 'SELECT COUNT(*) AS n FROM academia_ia_minutos WHERE minutos < 0'), // los cobros (el regalo de bienvenida no)
  pedidos: pedidosIa(c).length,
});
const conBase = fn => { const db = abrirBase(configDePrueba()); try { return fn(db); } finally { db.close(); } };
const guardarExplicacion = (db, clave, texto = 'Guardada antes.') => guardarRespuesta(db, { uso: 'instructor_explicar', correcta: '1', clave },
  { opcion_correcta: '1', explicacion: texto, por_que_no: 'Por eso no.', recuerda: 'Recuerda esto.', terminos: [] }, { proveedor: 'anthropic', modelo: 'x', costoMicro: 7 }, Date.parse('2026-11-01T12:00:00Z'));

// Zoelia pide la explicación CON IA (se guarda); devuelve { x, q }.
async function explicadaConIa(c) {
  const x = await unaMala(c, c.z, 'muestra-h1');
  c.falso.siguiente(explicacionFalsa(correctaNum('muestra-h1')));
  const r = (await explicar(c, c.z, x)).datos;
  assert.equal(r.ia.estado, 'pendiente');
  assert.equal((await c.hacer(r.ia.tarea)).estado, 'hecha');
  return x;
}

test('la IA apagada: el alumno ve la explicación que la IA ya escribió (marcada «guardada»), gratis, aunque la pantalla no pida IA', async () => {
  await conInstructor(async c => {
    await explicadaConIa(c);
    apagar(c);
    const y = await unaMala(c, c.q, 'muestra-h1');
    const antes = gasto(c);
    const saldo = saldoIa(c.db, idDe(c, 'quirino')).minutos;
    // La pantalla, con el instructor en «básico», manda ia: false.
    const r = (await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.q, datos: { intento: y.intento.id, pregunta: y.pregunta.id, ia: false } })).datos;
    assert.equal(r.instructor.modo, 'basico');
    assert.equal(r.ia.estado, 'lista');
    assert.equal(r.ia.guardada, true);
    assert.match(r.ia.explicacion, /menos presión/);
    assert.equal(r.ia.costoMicro, undefined, 'sin el costo ni el proveedor');
    assert.equal(r.ia.proveedor, undefined);
    assert.ok(r.basica, 'lo básico sigue');
    assert.deepEqual(gasto(c), antes, 'ni fila, ni llamada, ni uso, ni pedido');
    assert.equal(saldoIa(c.db, idDe(c, 'quirino')).minutos, saldo, 'no gasta su tiempo con IA');
    // La pista de una línea después del error, también (su «Recuerda»).
    const pista = (await pedir(c.base, 'GET', `/api/academia/tutor/pista/${y.intento.id}/${y.pregunta.id}`, { galleta: c.q })).datos.pista;
    assert.deepEqual([pista.texto, pista.guardada], ['Menos presión, menos oxígeno.', true]);
    // Otra opción de la misma pregunta: nada guardado → lo de antes (ia: null, sin ningún «no pudo»).
    const otra = DE('muestra-h1').original.opciones.find(o => o.letra !== DE('muestra-h1').original.correcta && o.letra !== mala('muestra-h1'));
    assert.ok(otra);
    {
      const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.q, datos: { tipo: 'tema', ...TEMA } })).datos;
      await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.q, datos: { pregunta: 'muestra-h1', elegida: otra.letra } });
      assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.q, datos: { intento: i.id, pregunta: 'muestra-h1', ia: false } })).datos.ia, null);
    }
    // Quien activó la academia sin IA no la ve (eligió no usar la IA).
    c.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '0', ?) ON CONFLICT(clave) DO UPDATE SET valor = '0'").run(`cuenta.consentimiento_ia.${idDe(c, 'quirino')}`, new Date().toISOString());
    assert.equal((await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.q, datos: { intento: y.intento.id, pregunta: y.pregunta.id, ia: false } })).datos.ia, null);
  });
});

test('con la IA encendida pero SIN tiempo con IA: la guardada sale gratis (sin «se acabaron tus minutos») y nunca baja de 0', async () => {
  await conInstructor(async c => {
    await explicadaConIa(c);
    const q = idDe(c, 'quirino');
    ajustarSaldo(c.db, q, 0, c.adminId);
    const y = await unaMala(c, c.q, 'muestra-h1');
    const antes = gasto(c);
    const r = (await explicar(c, c.q, y)).datos;
    assert.deepEqual(r.instructor, { modo: 'basico', motivo: 'sin_minutos' });
    assert.deepEqual([r.ia.estado, r.ia.guardada], ['lista', true]);
    assert.deepEqual(gasto(c), antes);
    assert.equal(saldoIa(c.db, q).minutos, 0);
  });
});

test('otro modelo: guardada con Sonnet, ahora el instructor usa Haiku y la IA está apagada → la de Sonnet sirve', async () => {
  await conInstructor(async c => {
    await explicadaConIa(c);
    const r0 = await pedir(c.base, 'POST', '/api/admin/ia/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { instructorModelo: 'claude-haiku-5-5' } });
    assert.equal(r0.datos.instructorModelo, 'claude-haiku-5-5');
    apagar(c);
    const y = await unaMala(c, c.q, 'muestra-h1');
    const r = (await explicar(c, c.q, y)).datos;
    assert.deepEqual([r.ia.estado, r.ia.guardada], ['lista', true]);
    assert.match(r.ia.explicacion, /menos presión/);
  });
});

test('las claves: un modelo que ya no está en la lista se recuerda; otro estilo en su idioma; el inglés usa el español, nunca al revés', () => conBase(db => {
  const q = { ...DE('muestra-h1'), original: { ...DE('muestra-h1').original } };
  const d = { q, elegida: 'B', acierto: false, modo: 'original' };
  const armar = armadorClave('explica', d);
  // La misma clave que armarExplicacion (las de siempre: nada se migra).
  assert.equal(armar({ estilo: 'tecnico', idioma: 'es', modelo: 'm-x' }), armarExplicacion({ ...d, alumno: { estilo: 'tecnico' }, idioma: 'es', modelo: 'm-x' }).clave);
  guardarExplicacion(db, armar({ estilo: 'tecnico', idioma: 'es', modelo: 'claude-modelo-viejo' }));
  assert.equal(buscarGuardada(db, armar, { estilo: 'tecnico', idioma: 'es', modelo: 'claude-sonnet-5-5' }), null, 'un modelo desconocido: no se adivina');
  recordarModelo(db, 'claude-modelo-viejo');
  assert.ok(modelosConocidos(db).includes('claude-modelo-viejo'));
  const h = buscarGuardada(db, armar, { estilo: 'tecnico', idioma: 'es', modelo: 'claude-sonnet-5-5' });
  assert.equal(h.guardado.explicacion, 'Guardada antes.');
  assert.equal(buscarGuardada(db, armar, { estilo: 'paso_a_paso', idioma: 'es' })?.estilo, 'tecnico', 'otro estilo, mismo idioma');
  const en = buscarGuardada(db, armar, { estilo: 'claro', idioma: 'en' });
  assert.equal(en.idioma, 'es', 'quien estudia en inglés ve la de español');
  assert.equal(paraVer(en, 'en').idioma, 'es', 'y la pantalla dice que está en español');
  assert.equal(paraVer(h, 'es').idioma, undefined);
  guardarExplicacion(db, armar({ estilo: 'claro', idioma: 'en', modelo: 'claude-haiku-5-5' }), 'English one.');
  assert.equal(buscarGuardada(db, armar, { estilo: 'claro', idioma: 'es' }).guardado.explicacion, 'Guardada antes.', 'a quien estudia en español nunca la de inglés');
  assert.equal(buscarGuardada(db, armar, { estilo: 'tecnico', idioma: 'en' }).guardado.explicacion, 'English one.', 'primero su idioma, aunque sea otro estilo');
  // El orden: su estilo y su idioma con cada modelo, después los otros estilos; el español al final (solo en inglés).
  const v = candidatos({ estilo: 'ejemplo', idioma: 'en', modelos: ['a', 'b'] });
  assert.deepEqual(v.slice(0, 3), [{ estilo: 'ejemplo', idioma: 'en', modelo: 'a' }, { estilo: 'ejemplo', idioma: 'en', modelo: 'b' }, { estilo: 'claro', idioma: 'en', modelo: 'a' }]);
  assert.equal(v.length, 16);
  assert.ok(candidatos({ idioma: 'es', modelos: ['a'] }).every(x => x.idioma === 'es'));
  // Otra opción, o si acertó, no es lo mismo.
  assert.equal(buscarGuardada(db, armadorClave('explica', { ...d, elegida: 'C' }), { estilo: 'tecnico', idioma: 'es' }), null);
  assert.equal(buscarGuardada(db, armadorClave('explica', { ...d, acierto: true }), { estilo: 'tecnico', idioma: 'es' }), null);
}));

test('si cambia el texto de la pregunta (o su correcta), la explicación guardada ya no coincide', () => conBase(db => {
  const base = DE('muestra-h1');
  const d = { q: base, elegida: 'B', acierto: false, modo: 'original' };
  guardarExplicacion(db, armadorClave('explica', d)({ estilo: 'claro', idioma: 'es', modelo: 'claude-sonnet-5-5' }));
  assert.ok(buscarGuardada(db, armadorClave('explica', d), { estilo: 'claro', idioma: 'es' }));
  const otroTexto = { ...base, original: { ...base.original, enunciado: `${base.original.enunciado} (edición nueva)` } };
  assert.equal(buscarGuardada(db, armadorClave('explica', { ...d, q: otroTexto }), { estilo: 'claro', idioma: 'es' }), null);
  const otraCorrecta = { ...base, original: { ...base.original, correcta: base.original.opciones.find(o => o.letra !== base.original.correcta).letra } };
  assert.equal(buscarGuardada(db, armadorClave('explica', { ...d, q: otraCorrecta }), { estilo: 'claro', idioma: 'es' }), null);
  // Una oculta por el administrador tampoco sale.
  const clave = armadorClave('explica', d)({ estilo: 'claro', idioma: 'es', modelo: 'claude-sonnet-5-5' });
  const en = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave).valor).en;
  db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(`academia.ia_oculto.${clave.slice('academia.ia.'.length)}`, en, en);
  assert.equal(buscarGuardada(db, armadorClave('explica', d), { estilo: 'claro', idioma: 'es' }), null);
}));

test('lo de cada alumno nunca pasa a otro: dudas, consejo y lo personal siguen siendo suyos', async () => {
  await conInstructor(async c => {
    sinPreparar(c);
    const x = await unaMala(c, c.z, 'muestra-h1');
    // Zoelia: una duda y el consejo de la semana, con IA.
    c.falso.siguiente({ tipo: 'ok', json: { respuesta: 'Respuesta SOLO-DE-ZOELIA sobre la hipoxia.', en_material: true, terminos: [], cita_test_guide: [] } });
    const d = (await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.z, datos: { ...TEMA, texto: 'Mi duda privada sobre la hipoxia' } })).datos;
    await c.hacer(d.ia.tarea);
    c.falso.siguiente({ tipo: 'ok', json: { saludo: 'Hola CONSEJO-DE-ZOELIA.', video_porque: '', temas: [{ id: `${TEMA.materia}/${TEMA.tema}`, confusion: 'Confunde algo.' }], porque: 'Porque sí.' } });
    const k = (await pedir(c.base, 'POST', '/api/academia/instructor/consejo', { galleta: c.z, datos: {} })).datos;
    if (k.ia?.tarea) await c.hacer(k.ia.tarea);
    apagar(c);
    // Quirino, sin IA, con la MISMA duda: lo básico; nada de Zoelia.
    await unaMala(c, c.q, 'muestra-h1');
    const respuestas = [
      await pedir(c.base, 'POST', '/api/academia/instructor/duda', { galleta: c.q, datos: { ...TEMA, texto: 'Mi duda privada sobre la hipoxia' } }),
      await pedir(c.base, 'POST', '/api/academia/instructor/consejo', { galleta: c.q, datos: {} }),
      await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.q }),
      await pedir(c.base, 'GET', '/api/academia/instructor/plan-hoy', { galleta: c.q }),
      await pedir(c.base, 'POST', '/api/academia/tutor/personalizadas', { galleta: c.q, datos: TEMA }),
    ];
    for (const r of respuestas) {
      const texto = JSON.stringify(r.datos);
      for (const marca of ['SOLO-DE-ZOELIA', 'CONSEJO-DE-ZOELIA', 'Mi duda privada', ...NOMBRES]) assert.ok(!texto.includes(marca), `«${marca}» en ${texto.slice(0, 200)}`);
    }
    assert.equal(respuestas[0].datos.ia, null);
    // La búsqueda solo mira lo compartido: una clave de un alumno, nunca.
    const idZ = idDe(c, 'zoelia');
    const deZ = c.db.prepare("SELECT clave FROM ajustes WHERE clave LIKE 'academia.ia.duda.%' OR clave LIKE 'academia.ia.consejo.%'").all().map(f => f.clave);
    assert.ok(deZ.length >= 1 && deZ.every(k2 => k2.includes(`.${idZ}.`)));
    for (const clave of deZ) assert.equal(buscarGuardada(c.db, () => clave, { idioma: 'es' }), null);
    assert.deepEqual([...TIPOS_SIN_IA], ['explica', 'miniclase', 'tarjeta', 'profundiza']);
    void x;
  });
});

const tarjetaFalsa = { tipo: 'ok', json: { explicacion: 'Arriba el aire está menos apretado: cada respiración trae menos oxígeno.', ejemplo: 'Subiendo a 12 000 pies.', recuerda: 'Más alto, menos oxígeno.', terminos: [] } };
const profundizarFalso = { tipo: 'ok', json: { por_que_pasa: 'La presión parcial del oxígeno baja con la altura.', ejemplo_vuelo: 'Un vuelo de noche a 10 000 pies.', trampa_examen: 'Fíjate en la altura.', recuerda: 'Presión baja, oxígeno bajo.', terminos: [] } };

test('«Explícamelo mejor» y «Profundizar» de una tarjeta, y la mini-clase: sin IA salen las guardadas, gratis', async () => {
  await conInstructor(async c => {
    sinPreparar(c);
    for (const g of [c.z, c.q]) for (let k = 0; k < 3; k++) await unaMala(c, g, 'muestra-h1');
    // Con IA (Zoelia): la tarjeta 1 explicada mejor y profundizada, y la mini-clase del concepto.
    for (const [tipo, falso] of [['mejor', tarjetaFalsa], ['profundizar', profundizarFalso]]) {
      c.falso.siguiente(falso);
      const r = (await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.z, datos: { ...TEMA, tarjeta: 1, tipo, ia: true } })).datos;
      assert.equal(r.ia.estado, 'pendiente', tipo);
      assert.equal((await c.hacer(r.ia.tarea)).estado, 'hecha');
    }
    const clave = (await pedir(c.base, 'GET', '/api/academia/mi-repaso', { galleta: c.z })).datos.paraRepasar.find(x => x.clave).clave;
    const clase = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(clave)}`, { galleta: c.z })).datos;
    c.falso.siguiente({ tipo: 'ok', json: { opcion_correcta: correctaNum(clase.pregunta.id), concepto: 'Arriba la presión baja y entra menos oxígeno.', ejemplo: 'A 12 000 pies.', trampa: 'Fíjate en «suficiente».', recuerda: 'Menos presión.', terminos: [] } });
    const m = (await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.z, datos: { concepto: clave } })).datos;
    assert.equal((await c.hacer(m.ia.tarea)).estado, 'hecha');
    apagar(c);
    const antes = gasto(c);
    const saldo = saldoIa(c.db, idDe(c, 'quirino')).minutos;
    // Quirino, sin IA: la pantalla pide «mejor» con ia: false.
    const t = (await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.q, datos: { ...TEMA, tarjeta: 1, tipo: 'mejor', ia: false } })).datos;
    assert.equal(t.instructor.modo, 'basico');
    assert.deepEqual([t.ia.estado, t.ia.guardada, t.ia.tipo, t.hayProfundizar], ['lista', true, 'mejor', true]);
    assert.match(t.ia.explicacion, /menos apretado/);
    assert.ok(t.basica && t.examen, 'lo básico y «Para el examen» siguen');
    const pr = (await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.q, datos: { ...TEMA, tarjeta: 1, tipo: 'profundizar', ia: false } })).datos;
    assert.deepEqual([pr.ia.estado, pr.ia.guardada, pr.ia.tipo], ['lista', true, 'profundizar']);
    assert.match(pr.ia.porQue, /presión parcial/);
    // Otra tarjeta (nada guardado): lo de antes.
    const t2 = (await pedir(c.base, 'POST', '/api/academia/tutor/tarjeta', { galleta: c.q, datos: { ...TEMA, tarjeta: 2, tipo: 'mejor', ia: false } })).datos;
    assert.equal(t2.ia, null);
    assert.equal(t2.hayProfundizar, undefined);
    // La mini-clase: el GET dice que hay una guardada (el botón) y el POST la da.
    const clq = (await pedir(c.base, 'GET', `/api/academia/mi-repaso/clase?concepto=${encodeURIComponent(clave)}`, { galleta: c.q })).datos;
    assert.deepEqual([clq.ia, clq.guardada], [false, true]);
    const mq = (await pedir(c.base, 'POST', '/api/academia/mi-repaso/clase/ia', { galleta: c.q, datos: { concepto: clave } })).datos;
    assert.deepEqual([mq.ia.estado, mq.ia.guardada], ['lista', true]);
    assert.match(mq.ia.concepto, /presión baja/);
    assert.deepEqual(gasto(c), antes, 'nada de esto gasta');
    assert.equal(saldoIa(c.db, idDe(c, 'quirino')).minutos, saldo);
    // El administrador: cuánto sabe el sistema sin IA y cuántas veces sirvió este mes (tarjeta + profundizar + mini-clase).
    const adm = (await pedir(c.base, 'GET', '/api/admin/academia/ia-alumnos', { galleta: c.admin })).datos.sabeSinIa;
    assert.deepEqual(adm, { explicaciones: 0, tarjetas: 2, miniclases: 1, oral: 0, servidasMes: 3 });
  });
});

test('el administrador: cuenta lo guardado por tipo (sin leer los valores), lo del oral y lo servido este mes', () => conBase(db => {
  const ahora = Date.parse('2026-11-20T15:00:00Z');
  assert.deepEqual(resumenSaber(db, ahora), { explicaciones: 0, tarjetas: 0, miniclases: 0, oral: 0, servidasMes: 0 });
  const q = DE('muestra-h1');
  for (const e of ['claro', 'tecnico']) guardarExplicacion(db, armadorClave('explica', { q, elegida: 'B', acierto: false, modo: 'original' })({ estilo: e, idioma: 'es', modelo: 'm' }));
  db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('academia.ia.duda.1.2', '{}', 'x'), ('academia.ia_reuso.explica.x', '3', 'x')").run();
  aprenderDeIa(db, { it: { m: 'oral_x', t: 't1', h: 'abc' }, texto: 'una respuesta del oral bien dicha', g: { veredicto: 'bien', linea: 'Bien.', bienDicho: '', falto: '', repregunta: '' } });
  anotarServida(db, 'explica', ahora);
  anotarServida(db, 'explica', ahora);
  anotarServida(db, 'tarjeta', ahora);
  anotarServida(db, 'duda', ahora); // no es compartido: no cuenta
  anotarServida(db, 'explica', Date.parse('2026-10-15T12:00:00Z')); // otro mes
  assert.deepEqual(resumenSaber(db, ahora), { explicaciones: 2, tarjetas: 0, miniclases: 0, oral: 1, servidasMes: 3 });
  // El primer día del mes a las 2 de la madrugada en Santo Domingo (UTC−4) todavía es el mes de antes.
  assert.equal(resumenSaber(db, Date.parse('2026-12-01T03:00:00Z')).servidasMes, 3);
  assert.equal(resumenSaber(db, Date.parse('2026-12-01T05:00:00Z')).servidasMes, 0);
  // Contar usa el índice de la clave primaria (nunca recorre «ajustes»).
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) AS n FROM ajustes WHERE clave >= 'academia.ia.explica.' AND clave < 'academia.ia.explica/'").all().map(f => f.detail).join(' ');
  assert.match(plan, /USING (?:COVERING )?INDEX/);
  void MUESTRA;
}));
