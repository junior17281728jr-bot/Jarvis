// Academia 0.10.0 (sin IA): el «Plan para pasar la próxima vez» y el tiempo con IA con sus pagos por transferencia (subir
// el comprobante, quién lo ve, aprobar una sola vez, rechazar con motivo, nunca menos de 0 minutos, solo el dueño cambia
// los datos de pago). 0.12.2: las fallas («Mi repaso», por concepto) están en test/mi-repaso.test.js. Paquete de MUESTRA.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { saldoIa, cobrarUso, ajustarSaldo, guardarConfigPagos } from '../src/academia/tiempo-ia.js';
import { busquedaYoutube, ENLACE_YOUTUBE } from '../src/academia/profesor.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { guardarConfigIa } from '../src/ia/config.js';
import { claveAnthropic, permitirIa } from './ia-base.js';

const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const T0 = Date.parse('2026-11-12T14:00:00Z');
const PNG = figuraMuestraPng();

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const tipo = r.headers.get('content-type') ?? '';
  const contenido = tipo.includes('json') ? await r.json().catch(() => ({})) : Buffer.from(await r.arrayBuffer());
  return { codigo: r.status, datos: contenido, tipo, galleta: (r.headers.get('set-cookie') ?? '').split(';')[0] || null };
}
function azarFijo(semilla = 7) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  // 0.12.7: estas pruebas son del «tiempo con IA» por minutos (el modo de antes, que sigue existiendo); los planes y la
  // prueba gratis se prueban en test/planes-ia.test.js.
  guardarConfigPagos(db, { modo: 'minutos' });
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    const alumnos = {};
    const ids = {};
    for (const nombre of ['ana', 'beto']) {
      ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      alumnos[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
    }
    const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    for (const archivo of s.datos.faltan) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: PNG });
    await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} });
    await fn({ base, db, config, reloj, admin, ids, ...alumnos });
  });
  db.close();
}
const nuevo = (c, galleta, datos) => pedir(c.base, 'POST', '/api/academia/intentos', { galleta, datos });
const mala = id => ['A', 'B', 'C'].find(l => l !== DE(id).original.correcta);
const fallasDe = (c, galleta) => pedir(c.base, 'GET', '/api/academia/instructor/fallas', { galleta }).then(r => r.datos.fallas);

// 0.12.2: las reglas de las fallas (por concepto, «Mi repaso», la mini-clase y las fallas de antes) se prueban en
// test/mi-repaso.test.js. Aquí queda el «Plan para pasar», el tiempo con IA y los pagos.

test('«Plan para pasar la próxima vez»: en qué falló por tema, la tarjeta, las preguntas, videos solo de YouTube; solo su intento', async () => {
  await conAcademia(async c => {
    const i = (await nuevo(c, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    for (const q of i.preguntas) await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: mala(q.id) } });
    const fin = (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.ana, datos: {} })).datos;
    assert.equal(fin.aprobado, false);
    // Un video del administrador para ese tema (solo enlaces de YouTube).
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/videos', { galleta: c.admin, cabeceras: DUENO, datos: { videos: [{ materia: 'factores_humanos', tema: 'muestra-hipoxia', titulo: 'Hipoxia', url: 'https://example.com/x' }] } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/videos', { galleta: c.admin, cabeceras: DUENO, datos: { videos: [{ materia: 'factores_humanos', tema: 'muestra-hipoxia', titulo: 'Hipoxia', url: 'https://www.youtube.com/watch?v=abcdefgh123' }] } })).codigo, 200);
    const plan = (await pedir(c.base, 'GET', `/api/academia/instructor/plan/${i.id}`, { galleta: c.ana })).datos;
    assert.equal(plan.temas.length, 1);
    const x = plan.temas[0];
    assert.equal(x.fallos, 5);
    assert.ok(x.ideas.length >= 1 && x.ideas.every(idea => MUESTRA.preguntas.some(q => Object.values(q.errores).includes(idea))));
    assert.ok(x.tarjeta);
    assert.ok(x.preguntas.every(q => DE(q.id).original.enunciado === q.enunciado), 'las preguntas tal cual');
    assert.deepEqual(x.videos, [{ titulo: 'Hipoxia', url: 'https://www.youtube.com/watch?v=abcdefgh123' }]);
    assert.match(x.buscar[0].url, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
    assert.deepEqual([plan.otraVez.listo, plan.otraVez.cuando], [false, 'tras_refuerzo']);
    // Hace el refuerzo: ya puede volver a tomarlo.
    const p = (await nuevo(c, c.ana, { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    for (const q of p.preguntas) await pedir(c.base, 'POST', `/api/academia/intentos/${p.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: DE(q.id).original.correcta } });
    await pedir(c.base, 'POST', `/api/academia/intentos/${p.id}/terminar`, { galleta: c.ana, datos: {} });
    assert.equal((await pedir(c.base, 'GET', `/api/academia/instructor/plan/${i.id}`, { galleta: c.ana })).datos.otraVez.listo, true);
    // 0.12.2: con 3 errores en cosas de un mismo punto («¿Qué es?»), ese punto entra a «Mi repaso» (y ya no se crea la
    // falla vieja de «2 de un tema en un intento»). El administrador lo ve.
    const fallas = await fallasDe(c, c.ana);
    assert.ok(fallas.some(f => f.origen === 'concepto' && f.tema === 'muestra-hipoxia' && f.concepto === '¿Qué es?'));
    assert.ok(!fallas.some(f => f.origen === 'examen' || f.origen === 'pregunta'));
    assert.ok(x.concepto?.startsWith('c:factores_humanos/muestra-hipoxia/'), 'el plan lleva a la mini-clase de ese punto');
    assert.equal((await pedir(c.base, 'GET', `/api/academia/instructor/plan/${i.id}`, { galleta: c.beto })).codigo, 404);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/plan/${i.id}`, { galleta: c.admin, cabeceras: DUENO })).codigo, 200);
  });
});

test('tiempo con IA: 20 minutos de regalo, cobrar nunca deja menos de 0, el administrador ajusta (solo el dueño)', async () => {
  await conAcademia(async c => {
    assert.deepEqual(saldoIa(c.db, c.ids.ana), { minutos: 20, porUso: 1 });
    assert.equal(saldoIa(c.db, c.ids.ana).minutos, 20, 'el regalo es una sola vez');
    for (let k = 0; k < 20; k++) cobrarUso(c.db, c.ids.ana, { referencia: `prueba:${k}` });
    assert.throws(() => cobrarUso(c.db, c.ids.ana, { referencia: 'prueba:x' }), e => e.clave === 'sin_minutos');
    assert.equal(saldoIa(c.db, c.ids.ana).minutos, 0);
    assert.throws(() => ajustarSaldo(c.db, c.ids.ana, -5, 1), e => e.clave === 'datos_no_validos');
    // 0.12.3: también por el enlace público, con la sesión del administrador.
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${c.ids.ana}/minutos`, { galleta: c.admin, cabeceras: { ...DUENO, ...FUNNEL }, datos: { minutos: 40 } })).datos.tiempo.minutos, 40);
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${c.ids.ana}/minutos`, { galleta: c.ana, datos: { minutos: 50 } })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${c.ids.ana}/minutos`, { galleta: c.admin, cabeceras: DUENO, datos: { minutos: 50 } })).datos.tiempo.minutos, 50);
    // El regalo de los nuevos lo pone el dueño.
    guardarConfigPagos(c.db, { minutosRegalo: 5 });
    assert.equal(saldoIa(c.db, c.ids.beto).minutos, 5);
    const t = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.ana })).datos;
    assert.equal(t.tiempo.minutos, 50);
    assert.equal(t.pagar.listo, false, 'sin datos de pago todavía');
  });
});

test('pagos: el alumno sube su comprobante (imagen de verdad, hasta 5 MB), solo él y el administrador lo ven; aprobar suma una vez; rechazar con motivo', async () => {
  await conAcademia(async c => {
    // Los datos para pagar (datos inventados de prueba). 0.12.3: por el enlace público, con la contraseña otra vez.
    const datosPago = { banco: 'Banco de Prueba', tipoCuenta: 'Ahorro', numero: '000-PRUEBA', titular: 'Titular de Prueba', paquetes: [{ id: 'p60', minutos: 60, precio: 'RD$1' }] };
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, cabeceras: { ...DUENO, ...FUNNEL }, datos: datosPago })).datos.error, 'confirmar_clave');
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.ana, datos: datosPago })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { ...datosPago, paquetes: [{ id: 'x', minutos: 0, precio: '' }] } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: datosPago })).codigo, 200);
    const t = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.ana })).datos;
    assert.deepEqual([t.pagar.listo, t.pagar.numero, t.pagar.paquetes[0].minutos], [true, '000-PRUEBA', 60]);
    // 0.12.3: solo se paga si la IA le sirve a esa cuenta (encendida con el instructor, su tope y «Permitir IA»).
    const adminId = c.db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
    anotarPrueba(c.db, { id: guardarSecreto(c.db, c.config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: adminId }).secreto.id, motivo: 'ok' });
    guardarConfigIa(c.db, { topeGeneralMicro: 2_000_000, topesPlanMicro: { prueba: 500_000 } }, { config: c.config, usuarioId: adminId });
    guardarConfigIa(c.db, { encendida: true }, { config: c.config, usuarioId: adminId });
    guardarConfigIa(c.db, { instructorIa: true }, { config: c.config, usuarioId: adminId });
    permitirIa(c.db, c.ids.ana, adminId);
    const subir = (galleta, cuerpo, tipo = 'image/png', paquete = 'p60') => pedir(c.base, 'POST', `/api/academia/pagos?paquete=${paquete}&nota=ref%20123`, { galleta, cabeceras: { 'Content-Type': tipo }, cuerpo });
    assert.equal((await subir(c.ana, Buffer.from('no soy una imagen'))).codigo, 400, 'se revisan los primeros bytes');
    assert.equal((await subir(c.ana, PNG, 'application/pdf')).codigo, 415);
    assert.equal((await subir(c.ana, PNG, 'image/png', 'nada')).codigo, 400);
    assert.equal((await subir(c.ana, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]))).codigo, 413);
    const s = await subir(c.ana, PNG);
    assert.equal(s.codigo, 201);
    assert.equal(s.datos.pago.estado, 'revision');
    assert.match(s.datos.espera, /24 horas/);
    const id = s.datos.pago.id;
    // La imagen: Ana y el administrador sí; Beto no (ni sabiendo el número).
    const suya = await pedir(c.base, 'GET', `/api/academia/pagos/${id}/recibo`, { galleta: c.ana });
    assert.equal(suya.codigo, 200);
    assert.ok(suya.datos.equals(PNG));
    assert.equal((await pedir(c.base, 'GET', `/api/academia/pagos/${id}/recibo`, { galleta: c.beto })).codigo, 404);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/pagos/${id}/recibo`, { galleta: c.beto })).codigo, 403);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/pagos/${id}/recibo`, { galleta: c.admin, cabeceras: DUENO })).codigo, 200);
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/pagos', { galleta: c.beto })).codigo, 403);
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/pagos/pendientes', { galleta: c.admin, cabeceras: DUENO })).datos.pendientes, 1);
    assert.deepEqual((await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.beto })).datos.pagos, [], 'Beto no ve los pagos de Ana');
    // Aprobar: +60, una sola vez; el alumno tiene su aviso hasta que lo ve.
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/pagos/${id}/aprobar`, { galleta: c.ana, datos: {} })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/pagos/${id}/aprobar`, { galleta: c.admin, cabeceras: DUENO, datos: {} })).codigo, 200);
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/pagos/${id}/aprobar`, { galleta: c.admin, cabeceras: DUENO, datos: {} })).codigo, 409);
    let a = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.ana })).datos;
    assert.equal(a.tiempo.minutos, 80);
    assert.equal(a.novedades.length, 1);
    await pedir(c.base, 'POST', '/api/academia/tiempo-ia/visto', { galleta: c.ana, datos: {} });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.ana })).datos.novedades.length, 0);
    // Rechazar necesita el motivo, que el alumno ve. Nunca suma.
    const otro = (await subir(c.ana, PNG)).datos.pago.id;
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/pagos/${otro}/rechazar`, { galleta: c.admin, cabeceras: DUENO, datos: {} })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/pagos/${otro}/rechazar`, { galleta: c.admin, cabeceras: DUENO, datos: { motivo: 'No se ve el monto' } })).codigo, 200);
    a = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.ana })).datos;
    assert.equal(a.tiempo.minutos, 80);
    assert.equal(a.pagos.find(p => p.id === otro).motivo, 'No se ve el monto');
    // Nada se borra: los dos quedan.
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_pagos').get().n, 2);
    // Un alumno que pagó tiene el Profesor virtual; el otro no.
    assert.equal((await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.ana })).datos.permiso.permitido, true);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/profesor', { galleta: c.beto })).datos.permiso.permitido, false);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/profesor', { galleta: c.beto, datos: { mensaje: '¿Qué estudio hoy?' } })).codigo, 403);
  });
});

test('YouTube: solo enlaces de video de YouTube y la búsqueda armada aquí', () => {
  assert.ok(ENLACE_YOUTUBE.test('https://www.youtube.com/watch?v=abcdefgh123'));
  assert.ok(ENLACE_YOUTUBE.test('https://youtu.be/abcdefgh123'));
  for (const malo of ['http://www.youtube.com/watch?v=abcdefgh', 'https://evil.com/watch?v=abcdefgh', 'https://www.youtube.com/watch?v=abc"><script>', 'javascript:alert(1)']) assert.ok(!ENLACE_YOUTUBE.test(malo), malo);
  assert.equal(busquedaYoutube('Visión nocturna'), 'https://www.youtube.com/results?search_query=Visi%C3%B3n%20nocturna%20piloto%20privado');
  assert.equal(busquedaYoutube('<script>'), 'https://www.youtube.com/results?search_query=script%20piloto%20privado');
});
