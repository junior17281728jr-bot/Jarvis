// 0.12.8 (pedido del dueño): el dinero y la IA de cada alumno, siempre con el proveedor FALSO.
//  - el tope US$ de la cuenta de un alumno sale de su plan (presupuesto de IA por plan: Estándar US$4, Plus US$8, prueba
//    US$1), su tope personal o su pausa; el tope general sigue mandando;
//  - «IA por alumno»: la tabla (por gasto, con totales), regalar usos, pausar, tope personal en línea;
//  - el formulario de planes (presupuestos) se revisa; sin «minutos de regalo» con planes;
//  - «Registro de la IA»: lo de cada alumno y la biblioteca (veces reutilizado, ahorro, buscar, ocultar sin borrar).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, unaMala, explicar, explicacionFalsa, DE } from './instructor-ia-base.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { guardarConfigPagos, leerConfigPagos, CONFIG_PAGOS, derechoIa } from '../src/academia/tiempo-ia.js';
import { leerConfigIa } from '../src/ia/config.js';
import { topeEspacioMicro } from '../src/ia/topes.js';
import { espacioDe } from '../src/cuentas/espacios.js';
import { leerGuardado } from '../src/academia/instructor-ia.js';
import { deflateSync, crc32 } from 'node:zlib';

function png(ancho = 120, alto = 50) {
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  const filas = [];
  for (let y = 0; y < alto; y++) filas.push(Buffer.from([0]), Buffer.alloc(ancho * 4, y % 7 ? 0 : 255));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}

const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;
const correctaDe = id => String(['A', 'B', 'C'].indexOf(DE(id).original.correcta) + 1);
const topeDe = (c, nombre) => topeEspacioMicro(c.db, leerConfigIa(c.db), espacioDe(c.db, { id: idDe(c, nombre) }).id);
const DATOS_PAGO = { banco: 'Banco de Prueba', tipoCuenta: 'Ahorro', numero: '000-PRUEBA', titular: 'Titular de Prueba' };

test('el presupuesto de IA por plan: por defecto Estándar US$4, Plus US$8 y prueba US$1; se cambia y se revisa', () => {
  assert.deepEqual(CONFIG_PAGOS.presupuestos, { estandar: '4', plus: '8', prueba: '1' });
});

test('el tope de la cuenta sale del plan: prueba US$1, Estándar US$4 al aprobar; tope personal; pausa = sin IA (ni se vende)', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    assert.deepEqual([topeDe(c, 'zoelia').topeMicro, topeDe(c, 'zoelia').fuente], [1_000_000, 'prueba'], 'aunque el plan de su cuenta diga otra cosa');
    guardarConfigPagos(c.db, { ...DATOS_PAGO });
    const r = await pedir(c.base, 'POST', '/api/academia/pagos?paquete=plan:estandar', { galleta: c.z, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    assert.equal(r.codigo, 201, 'quien no tiene plan puede comprar (su tope no es 0)');
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/pagos/${r.datos.pago.id}/aprobar`, { galleta: c.admin, datos: {} })).codigo, 200);
    assert.deepEqual([topeDe(c, 'zoelia').topeMicro, topeDe(c, 'zoelia').fuente], [4_000_000, 'plan']);
    // El administrador cambia los presupuestos (con su contraseña, como los demás datos de pago).
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, datos: { presupuestos: { estandar: '25' } } })).datos.error, 'presupuesto_no_valido');
    guardarConfigPagos(c.db, { presupuestos: { estandar: '5.50' } });
    assert.deepEqual(leerConfigPagos(c.db).presupuestos, { estandar: '5.50', plus: '8', prueba: '1' }, 'lo que no se manda queda');
    assert.equal(topeDe(c, 'zoelia').topeMicro, 5_500_000);
    // Tope personal (en línea en «IA por alumno»).
    let x = await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${z}/tope`, { galleta: c.admin, datos: { usd: '2,50' } });
    assert.deepEqual([x.codigo, x.datos.topePersonalMicro], [200, 2_500_000]);
    assert.deepEqual([topeDe(c, 'zoelia').topeMicro, topeDe(c, 'zoelia').fuente], [2_500_000, 'personal']);
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${z}/tope`, { galleta: c.admin, datos: { usd: '30' } })).datos.error, 'tope_no_valido');
    await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${z}/tope`, { galleta: c.admin, datos: { usd: null } });
    assert.equal(topeDe(c, 'zoelia').fuente, 'plan', 'vacío: vuelve al de su plan');
    // Pausar: tope 0, y para el alumno no hay IA visible (ni se le vende).
    x = await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${z}/pausa`, { galleta: c.admin, datos: { pausada: true } });
    assert.equal(x.datos.pausada, true);
    assert.deepEqual([topeDe(c, 'zoelia').topeMicro, topeDe(c, 'zoelia').fuente], [0, 'pausa']);
    const t = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.z })).datos;
    assert.equal(t.tiempo.activo, false);
    assert.deepEqual(t.venta.falta, ['pausada']);
    const m = await unaMala(c, c.z);
    const e = (await explicar(c, c.z, m)).datos;
    assert.equal(e.instructor.modo, 'basico');
    assert.equal(e.ia, null, 'sin «no pudo»: solo lo básico');
    await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${z}/pausa`, { galleta: c.admin, datos: { pausada: false } });
    assert.equal(topeDe(c, 'zoelia').fuente, 'plan');
    // Nada se borró: cada cambio es una fila de «ajustes» y una línea de la auditoría.
    assert.ok(c.db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion IN ('ia_tope_personal', 'ia_alumno_pausada', 'ia_alumno_reanudada')").get().n >= 4);
  }, { pagos: 'planes', topePlan: 0 });
});

test('IA por alumno: la tabla por gasto con totales, regalar usos y «Dar la prueba otra vez»', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    const q = idDe(c, 'quirino');
    const x = await unaMala(c, c.z);
    c.falso.siguiente(explicacionFalsa(correctaDe(x.pregunta.id)));
    await c.hacer((await explicar(c, c.z, x)).datos.ia.tarea);
    let r = (await pedir(c.base, 'GET', '/api/admin/academia/ia-alumnos', { galleta: c.admin })).datos;
    assert.equal(r.modo, 'planes');
    assert.deepEqual(r.filas.map(f => f.usuario), ['zoelia', 'quirino'], 'primero quien más gastó');
    const fz = r.filas[0];
    assert.equal(fz.usosMes, 1);
    assert.ok(fz.usdMesMicro > 0);
    assert.deepEqual([fz.fuente, fz.topeMicro, fz.topeFuente, fz.pausada, fz.pago], ['prueba', 1_000_000, 'prueba', false, null]);
    assert.ok(fz.vence, 'la prueba vence');
    assert.equal(r.totales.usosMes, 1);
    assert.equal(r.totales.usdMesMicro, fz.usdMesMicro);
    assert.equal(r.totales.alumnos, 2);
    // Regalar 5 usos: van como minutos, que se gastan después del plan y de la prueba.
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${q}/regalo`, { galleta: c.admin, datos: { usos: 0 } })).datos.error, 'usos_no_validos');
    const g = await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${q}/regalo`, { galleta: c.admin, datos: { usos: 5 } });
    assert.equal(g.datos.derecho.minutos, 5);
    assert.equal(c.db.prepare("SELECT motivo FROM academia_ia_minutos WHERE usuario_id = ? ORDER BY id DESC LIMIT 1").get(q).motivo, 'regalo_usos');
    // Sin la prueba (ya pagó una vez), los regalados se usan.
    c.db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)").run(`academia.ia.prueba.${q}`, JSON.stringify({ desde: new Date(Date.now() - 10 * 86_400_000).toISOString() }), new Date().toISOString());
    assert.equal(derechoIa(c.db, q).fuente, 'minutos');
    // «Dar la prueba otra vez» (la ruta de siempre).
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${q}/prueba`, { galleta: c.admin, datos: {} })).datos.derecho.fuente, 'prueba');
    // Solo el administrador.
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/ia-alumnos', { galleta: c.z })).codigo, 403);
  }, { pagos: 'planes' });
});

test('Registro de la IA: lo de cada alumno, la biblioteca (reutilizada, ahorro, buscar) y ocultar una mala sin borrarla', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    const x = await unaMala(c, c.z);
    c.falso.siguiente(explicacionFalsa(correctaDe(x.pregunta.id), { explicacion: 'Arriba hay menos presión: por eso la hipoxia (hypoxia) llega antes.' }));
    await c.hacer((await explicar(c, c.z, x)).datos.ia.tarea);
    // Quirino pide la MISMA (misma pregunta, opción y estilo): sale de lo guardado, sin otra llamada.
    const y = await unaMala(c, c.q, x.pregunta.id);
    const otra = (await explicar(c, c.q, y)).datos;
    assert.equal(otra.ia.estado, 'lista', 'compartida');
    let b = (await pedir(c.base, 'GET', '/api/admin/academia/ia-biblioteca', { galleta: c.admin })).datos;
    assert.equal(b.total, 1);
    const item = b.lista[0];
    assert.equal(item.tipo, 'explicacion');
    assert.match(item.completo, /hipoxia/);
    assert.equal(item.veces, 1, 'Quirino la volvió a usar');
    assert.ok(item.costoMicro > 0 && item.ahorroMicro === item.costoMicro, 'el ahorro: lo que costó × las veces');
    assert.equal(b.ahorroMicro, item.ahorroMicro);
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/ia-biblioteca?buscar=nada-de-esto', { galleta: c.admin })).datos.total, 0);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/ia-biblioteca?buscar=${encodeURIComponent('HIPOXIA')}`, { galleta: c.admin })).datos.total, 1);
    // Lo de cada alumno: su meta, su foco y lo que la IA generó para él (con su costo).
    const reg = (await pedir(c.base, 'GET', `/api/admin/academia/ia-registro?alumno=${z}`, { galleta: c.admin })).datos;
    assert.equal(reg.alumnos.length, 2);
    assert.equal(reg.registro.meta, 'tutor.meta.texto');
    assert.equal(reg.registro.llamadas, 1);
    assert.ok(reg.registro.costoMicro > 0);
    assert.ok(Array.isArray(reg.registro.generado) && Array.isArray(reg.registro.memoria) && Array.isArray(reg.registro.preparaciones));
    // Ocultar: deja de servirse (lo básico o se pide otra vez), la fila sigue y la marca guarda el texto de esa vez.
    const o = await pedir(c.base, 'POST', '/api/admin/academia/ia-biblioteca/ocultar', { galleta: c.admin, datos: { clave: item.clave, oculto: true } });
    assert.deepEqual(o.datos, { clave: item.clave, oculto: true });
    assert.equal(leerGuardado(c.db, item.clave), null);
    assert.ok(c.db.prepare('SELECT 1 FROM ajustes WHERE clave = ?').get(item.clave), 'nunca se borra');
    assert.ok(c.db.prepare("SELECT 1 FROM auditoria WHERE accion = 'ia_guardado_oculto'").get());
    b = (await pedir(c.base, 'GET', '/api/admin/academia/ia-biblioteca', { galleta: c.admin })).datos;
    assert.equal(b.lista[0].oculto, true, 'se sigue viendo, marcada');
    // Una nueva (otra fecha) ya no queda oculta.
    const w = await unaMala(c, c.z, x.pregunta.id);
    c.falso.siguiente(explicacionFalsa(correctaDe(w.pregunta.id), { explicacion: 'Otra explicación mejor: hipoxia (hypoxia) por menos presión.' }));
    const nueva = (await explicar(c, c.z, w)).datos;
    assert.equal(nueva.ia.estado, 'pendiente', 'la oculta no se sirve: se pide otra');
    await c.hacer(nueva.ia.tarea);
    assert.match(leerGuardado(c.db, item.clave).explicacion, /mejor/);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/ia-biblioteca/ocultar', { galleta: c.admin, datos: { clave: 'academia.ia.plan.1', oculto: true } })).codigo, 404, 'solo lo que escribió la IA');
  }, { pagos: 'planes' });
});

test('al firmar por la ruta de siempre queda UNA marca para mandar el contrato al Telegram del dueño (firmar otra vez lo mismo no agrega otra)', async () => {
  await conInstructor(async c => {
    const z = idDe(c, 'zoelia');
    const datos = { version: 2, versionPrivacidad: 2, nombre: 'Zoe', apellido: 'Lia', nacimiento: '2000-05-10', acepto: true, aceptoPrivacidad: true, aceptoIa: true, firma: `data:image/png;base64,${png().toString('base64')}` };
    const marcas = () => c.db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'telegram.contrato.pendiente.%'").all();
    assert.equal((await pedir(c.base, 'POST', '/api/yo/terminos', { galleta: c.z, datos })).codigo, 200);
    assert.deepEqual(marcas().map(m => m.clave), [`telegram.contrato.pendiente.${z}.1`]);
    assert.equal(JSON.parse(marcas()[0].valor).n, 1);
    assert.equal((await pedir(c.base, 'POST', '/api/yo/terminos', { galleta: c.z, datos })).codigo, 200);
    assert.equal(marcas().length, 1, 'la misma versión otra vez no es una firma nueva');
  });
});
