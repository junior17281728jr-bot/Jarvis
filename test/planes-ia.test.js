// Academia 0.12.7: la IA por plan (pedido del dueño). Siempre con el proveedor FALSO y un reloj de mentira donde hace falta.
//  - prueba gratis de 5 días desde el PRIMER uso de la IA, con un tope de usos por día; después, sin plan, lo básico;
//  - planes de 30 días «IA Estándar» (US$12, 300 usos) e «IA Plus» (US$20, 800 usos), pagados por transferencia con
//    el comprobante de siempre; pasar a Plus pagando la diferencia; aviso de renovar 3 días antes;
//  - los minutos que alguien ya tenía se siguen usando; una cuenta nueva ya no recibe minutos de regalo;
//  - el administrador ve el estado de cada alumno y le puede dar la prueba otra vez.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, unaMala, explicar, explicacionFalsa, DE } from './instructor-ia-base.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { derechoIa, saldoIa, guardarConfigPagos, leerConfigPagos, cobrarUso, ajustarSaldo, CONFIG_PAGOS } from '../src/academia/tiempo-ia.js';
import { permisoProfesor } from '../src/academia/profesor.js';

const DIA = 86_400_000;
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const correctaDe = id => String(['A', 'B', 'C'].indexOf(DE(id).original.correcta) + 1);
const DATOS_PAGO = { banco: 'Banco de Prueba', tipoCuenta: 'Ahorro', numero: '000-PRUEBA', titular: 'Titular de Prueba' };
async function pagarPlan(c, galleta, paquete) {
  const r = await pedir(c.base, 'POST', `/api/academia/pagos?paquete=${encodeURIComponent(paquete)}`, { galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal(r.codigo, 201, JSON.stringify(r.datos));
  const a = await pedir(c.base, 'POST', `/api/admin/academia/pagos/${r.datos.pago.id}/aprobar`, { galleta: c.admin, datos: {} });
  assert.equal(a.codigo, 200, JSON.stringify(a.datos));
  return r.datos.pago;
}

test('los valores por defecto: planes, 5 días de prueba con 20 usos por día, Estándar US$12/300 y Plus US$20/800', () => {
  assert.equal(CONFIG_PAGOS.modo, 'planes');
  assert.deepEqual([CONFIG_PAGOS.pruebaDias, CONFIG_PAGOS.pruebaUsosDia, CONFIG_PAGOS.planDias, CONFIG_PAGOS.avisoRenovarDias], [5, 20, 30, 3]);
  assert.deepEqual(CONFIG_PAGOS.planes.map(p => [p.id, p.nombre, p.precioUsd, p.usos]), [['estandar', 'IA Estándar', '12', 300], ['plus', 'IA Plus', '20', 800]]);
});

test('la prueba gratis: empieza con el primer uso, tiene su tope por día, dura 5 días y después queda lo básico (sin errores)', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    assert.equal(saldoIa(c.db, z).minutos, 0, 'con planes no hay minutos de regalo');
    let d = derechoIa(c.db, z);
    assert.deepEqual([d.fuente, d.prueba.empezada, d.prueba.quedanDias], ['prueba', false, 5], 'nadie la pierde sin verla: todavía no empezó');
    const x = await unaMala(c, c.z);
    c.falso.siguiente(explicacionFalsa(correctaDe(x.pregunta.id)));
    const r = (await explicar(c, c.z, x)).datos;
    assert.equal(r.ia.estado, 'pendiente');
    await c.hacer(r.ia.tarea);
    d = derechoIa(c.db, z);
    assert.deepEqual([d.fuente, d.prueba.empezada, d.prueba.hoy], ['prueba', true, 1]);
    assert.equal(c.db.prepare("SELECT motivo FROM academia_ia_minutos WHERE usuario_id = ? ORDER BY id DESC LIMIT 1").get(z).motivo, 'uso_prueba');
    // El tope del día (el administrador lo baja a 1): lo básico hasta mañana, sin ningún «no pudo».
    guardarConfigPagos(c.db, { pruebaUsosDia: 1 });
    const y = await unaMala(c, c.z, 'muestra-h2');
    const r2 = (await explicar(c, c.z, y)).datos;
    assert.deepEqual([r2.instructor.modo, r2.ia?.motivo], ['basico', 'sin_minutos']);
    const ahora = Date.now();
    assert.equal(derechoIa(c.db, z, ahora + DIA).fuente, 'prueba', 'mañana vuelve a tener sus usos');
    // Pasados los 5 días: sin plan, nada (y nunca se cobra).
    d = derechoIa(c.db, z, ahora + 6 * DIA);
    assert.deepEqual([d.fuente, d.motivo], [null, 'prueba_terminada']);
    assert.throws(() => cobrarUso(c.db, z, { referencia: 'x', ahora: ahora + 6 * DIA }), e => e.clave === 'sin_minutos');
    // Los minutos que tenga (puestos por el administrador) se siguen usando.
    ajustarSaldo(c.db, z, 2, c.adminId, ahora + 6 * DIA);
    assert.equal(derechoIa(c.db, z, ahora + 6 * DIA).fuente, 'minutos');
    // El Profesor virtual va con la prueba (mientras dure).
    assert.equal(permisoProfesor(c.db, z).por, 'prueba');
  }, { pagos: 'planes' });
});

test('los planes: se pagan con el comprobante de siempre, duran 30 días desde que se aprueban, avisan 3 días antes y se puede pasar a Plus', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    guardarConfigPagos(c.db, { ...DATOS_PAGO, tasaRd: '60' });
    const t = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.z })).datos;
    assert.deepEqual(t.pagar.planes.map(p => [p.id, p.precioUsd, p.precioRd, p.usos]), [['estandar', '12', '720', 300], ['plus', '20', '1200', 800]]);
    assert.equal(t.pagar.listo, true);
    assert.equal(t.tiempo.fuente, 'prueba');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/pagos?paquete=p60', { galleta: c.z, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() })).codigo, 400, 'con planes no se venden minutos');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/pagos?paquete=plan:plus:mejora', { galleta: c.z, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() })).codigo, 400, 'sin plan Estándar no hay «diferencia»');
    const pago = await pagarPlan(c, c.z, 'plan:estandar');
    assert.deepEqual([pago.precio, pago.minutos], ['US$12', 300]);
    const ahora = Date.now();
    let d = derechoIa(c.db, z, ahora);
    assert.deepEqual([d.fuente, d.plan.id, d.plan.quedan, d.plan.dias, d.plan.renovar], ['plan', 'estandar', 300, 30, false]);
    assert.equal(derechoIa(c.db, z, ahora + 28 * DIA).plan.renovar, true, '3 días antes, «renueva tu plan»');
    // Pasar a Plus pagando la diferencia: la misma fecha de vencimiento, con los usos de Plus.
    const mejora = await pagarPlan(c, c.z, 'plan:plus:mejora');
    assert.equal(mejora.precio, 'US$8');
    d = derechoIa(c.db, z, ahora);
    assert.deepEqual([d.plan.id, d.plan.usos, d.plan.dias], ['plus', 800, 30]);
    // Vencido: quien pagó ya no tiene prueba; sin plan, lo básico.
    d = derechoIa(c.db, z, ahora + 31 * DIA);
    assert.deepEqual([d.fuente, d.motivo, d.plan.vencido], [null, 'sin_plan', true]);
    // El administrador ve su estado y le puede dar la prueba otra vez.
    const admin = (await pedir(c.base, 'GET', '/api/admin/academia/pagos', { galleta: c.admin })).datos;
    const fila = admin.alumnos.find(a => a.id === z);
    assert.deepEqual([fila.derecho.fuente, fila.derecho.plan.id], ['plan', 'plus']);
    const otra = await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${z}/prueba`, { galleta: c.admin, datos: {} });
    assert.equal(otra.codigo, 200);
    assert.equal(derechoIa(c.db, z, ahora + 31 * DIA).fuente, 'prueba');
    assert.equal(leerConfigPagos(c.db).planes[1].precioUsd, '20');
  }, { pagos: 'planes' });
});
