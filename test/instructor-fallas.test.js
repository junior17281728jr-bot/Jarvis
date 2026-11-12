// Academia 0.10.0 (sin IA): las «fallas registradas» (umbral, nunca se borran, superada con 3 aciertos en 2 días, cada
// alumno las suyas), el refuerzo en la clase («Refuerzo para ti» y las preguntas extra en el repaso), el «Plan para pasar
// la próxima vez», y el tiempo con IA con sus pagos por transferencia (subir el comprobante, quién lo ve, aprobar una sola
// vez, rechazar con motivo, nunca menos de 0 minutos, solo el dueño cambia los datos de pago). Paquete de MUESTRA.
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

const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
const CLAVE = 'una clave bien larga';
const MUESTRA = paqueteMuestra();
const DE = id => MUESTRA.preguntas.find(q => q.id === id);
const T0 = Date.parse('2026-11-12T14:00:00Z');
const DIA = 86_400_000;
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
// Un intento del tema 1: la pregunta «id» como diga «bien», las demás bien. Termina el intento.
async function vuelta(c, galleta, id, { bien }) {
  const i = (await nuevo(c, galleta, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
  for (const q of i.preguntas) {
    c.reloj.avanzar(30_000);
    const letra = q.id === id && !bien ? mala(q.id) : DE(q.id).original.correcta;
    await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: letra } });
  }
  return (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos;
}
const fallasDe = (c, galleta) => pedir(c.base, 'GET', '/api/academia/instructor/fallas', { galleta }).then(r => r.datos.fallas);

test('fallas: la misma pregunta fallada 3 veces queda registrada (2 no), con su idea; un examen con 2 del mismo tema también', async () => {
  await conAcademia(async c => {
    const id = 'muestra-h2';
    await vuelta(c, c.ana, id, { bien: false });
    await vuelta(c, c.ana, id, { bien: false });
    assert.deepEqual((await fallasDe(c, c.ana)).filter(f => f.origen === 'pregunta'), [], 'con 2 todavía no');
    await vuelta(c, c.ana, id, { bien: false });
    const [f] = (await fallasDe(c, c.ana)).filter(x => x.origen === 'pregunta');
    assert.deepEqual([f.estado, f.fallos, f.materia, f.tema, f.idea], ['activa', 3, 'factores_humanos', 'muestra-hipoxia', DE(id).errores[mala(id)]]);
    assert.ok(f.extras > 0, 'preguntas extra del mismo tema');
    // Las extras están en el repaso de hoy.
    assert.ok(c.db.prepare('SELECT COUNT(*) AS n FROM academia_repaso WHERE usuario_id = ? AND vence_en <= ?').get(c.ids.ana, new Date(c.reloj()).toISOString()).n >= 1 + f.extras);
    // Beto no tiene ninguna, ni ve las de Ana.
    assert.deepEqual(await fallasDe(c, c.beto), []);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/fallas`, { galleta: c.beto })).codigo, 403);
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/fallas`, { galleta: c.admin, cabeceras: DUENO })).datos.fallas.length >= 1, true);
    // El umbral lo cambia solo el dueño.
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/fallas/ajustes', { galleta: c.admin, cabeceras: { ...DUENO, ...FUNNEL }, datos: { umbral: 2 } })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/fallas/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { umbral: 2 } })).codigo, 200);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/fallas/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { umbral: 1 } })).codigo, 400);
  });
});

test('fallas: se supera con 3 aciertos seguidos en 2 días distintos (fallar reinicia), y nunca se borra', async () => {
  await conAcademia(async c => {
    const id = 'muestra-h2';
    for (let k = 0; k < 3; k++) await vuelta(c, c.ana, id, { bien: false });
    await vuelta(c, c.ana, id, { bien: true });
    await vuelta(c, c.ana, id, { bien: true });
    await vuelta(c, c.ana, id, { bien: true });
    let [f] = (await fallasDe(c, c.ana)).filter(x => x.origen === 'pregunta');
    assert.equal(f.aciertos, 3);
    assert.notEqual(f.estado, 'superada', 'tres el mismo día no alcanzan');
    await vuelta(c, c.ana, id, { bien: false });
    [f] = (await fallasDe(c, c.ana)).filter(x => x.origen === 'pregunta');
    assert.deepEqual([f.aciertos, f.fallos], [0, 4], 'fallar otra vez vuelve a empezar');
    await vuelta(c, c.ana, id, { bien: true });
    await vuelta(c, c.ana, id, { bien: true });
    c.reloj.avanzar(DIA);
    await vuelta(c, c.ana, id, { bien: true });
    [f] = (await fallasDe(c, c.ana)).filter(x => x.origen === 'pregunta');
    assert.equal(f.estado, 'superada');
    // Se queda en el historial; si vuelve a fallar 3 veces, es otra falla (la vieja sigue ahí).
    for (let k = 0; k < 3; k++) await vuelta(c, c.ana, id, { bien: false });
    const todas = (await fallasDe(c, c.ana)).filter(x => x.origen === 'pregunta');
    assert.deepEqual(todas.map(x => x.estado).sort(), ['activa', 'superada']);
    assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM academia_fallas WHERE usuario_id = ?').get(c.ids.ana).n >= 2, true);
  });
});

test('refuerzo: la tarjeta de su falla sale primero («Refuerzo para ti»), el plan de refuerzo la muestra y la práctica empieza por ella', async () => {
  await conAcademia(async c => {
    const id = 'muestra-h2';
    for (let k = 0; k < 3; k++) await vuelta(c, c.ana, id, { bien: false });
    const ini = (await pedir(c.base, 'GET', '/api/academia/instructor', { galleta: c.ana })).datos;
    assert.equal(ini.plan.length >= 1, true);
    assert.equal(ini.plan[0].tema, 'muestra-hipoxia');
    const t = (await pedir(c.base, 'GET', '/api/academia/instructor?materia=factores_humanos&tema=muestra-hipoxia', { galleta: c.ana })).datos;
    assert.ok(t.refuerzo?.tarjeta?.titulo, 'la tarjeta que se pone primero');
    assert.equal(MUESTRA.materias[0].temas[0].secciones[t.refuerzo.tarjeta.indice].titulo, t.refuerzo.tarjeta.titulo);
    const [f] = (await fallasDe(c, c.ana)).filter(x => x.origen === 'pregunta');
    assert.deepEqual([f.estado, f.tarjeta], ['refuerzo', t.refuerzo.tarjeta.titulo]);
    // «Repasar ahora»: la práctica de refuerzo de ese tema, con la fallada primero, en Original (tal cual).
    const p = (await nuevo(c, c.ana, { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    assert.equal(p.preguntas[0].id, id);
    assert.ok(p.preguntas.every(q => q.id.startsWith('muestra-h')));
    assert.deepEqual(p.preguntas[0].opciones, DE(id).original.opciones.map(o => ({ letra: o.letra, texto: o.texto })));
    assert.equal((await nuevo(c, c.ana, { tipo: 'instructor', materia: 'factores_humanos', tema: 'muestra-ilusiones' })).codigo, 403, 'un tema cerrado no');
  });
});

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
    // También queda en su plan de refuerzo (falla del tema) y el administrador lo ve.
    assert.ok((await fallasDe(c, c.ana)).some(f => f.origen === 'examen' && f.tema === 'muestra-hipoxia'));
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
    assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/alumnos/${c.ids.ana}/minutos`, { galleta: c.admin, cabeceras: { ...DUENO, ...FUNNEL }, datos: { minutos: 50 } })).codigo, 403);
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
    // Los datos para pagar: solo el dueño, desde Tailscale (datos inventados de prueba).
    const datosPago = { banco: 'Banco Popular', tipoCuenta: 'Ahorro', numero: '000-PRUEBA', titular: 'Titular de Prueba', paquetes: [{ id: 'p60', minutos: 60, precio: 'RD$1' }] };
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, cabeceras: { ...DUENO, ...FUNNEL }, datos: datosPago })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.ana, datos: datosPago })).codigo, 403);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: { ...datosPago, paquetes: [{ id: 'x', minutos: 0, precio: '' }] } })).codigo, 400);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: c.admin, cabeceras: DUENO, datos: datosPago })).codigo, 200);
    const t = (await pedir(c.base, 'GET', '/api/academia/tiempo-ia', { galleta: c.ana })).datos;
    assert.deepEqual([t.pagar.listo, t.pagar.numero, t.pagar.paquetes[0].minutos], [true, '000-PRUEBA', 60]);
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
