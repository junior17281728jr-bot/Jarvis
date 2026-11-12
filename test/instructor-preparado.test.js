// Academia 0.10.0 (sin IA): «¿Estás listo para el examen oficial?» (cada regla, el nivel, la probabilidad con su aviso,
// por materia y «aprobaste, pero repítelo») y Administrador → «Aprendizaje» (las cuentas, con su n). Lo de abajo es la
// misma ayuda que test/instructor-fallas.test.js:
// las «fallas registradas» (umbral, nunca se borran, superada con 3 aciertos en 2 días, cada
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

const preparado = (c, galleta) => pedir(c.base, 'GET', '/api/academia/preparado', { galleta }).then(r => r.datos);
const regla = (v, id) => v.reglas.find(r => r.id === id);
async function todoBien(c, galleta, datos) {
  const i = (await nuevo(c, galleta, datos)).datos;
  for (const q of i.preguntas) { c.reloj.avanzar(30_000); await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta, datos: { pregunta: q.id, elegida: DE(q.id).original.correcta } }); }
  return (await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta, datos: {} })).datos;
}

test('listo: un alumno nuevo está «Todavía no» (cada regla con su número) y sin probabilidad', async () => {
  await conAcademia(async c => {
    const v = await preparado(c, c.ana);
    assert.equal(v.nivel, 'todavia');
    assert.deepEqual(v.reglas.map(r => [r.id, r.ok]), [['acierto', false], ['cobertura', false], ['constancia', false], ['memoria', false], ['fallas', true], ['tiempo', false]]);
    assert.equal(v.probabilidad, null);
    assert.equal(v.siguiente.regla, 'acierto');
    assert.equal(v.porMateria.length, 1);
  });
});

test('listo: «Listo para presentarte» solo con TODO: acierto, cobertura, 3 exámenes de 90 %, memoria a 2 días, sin fallas y sin atracón', async () => {
  await conAcademia(async c => {
    await todoBien(c, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    await todoBien(c, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-ilusiones' });
    let v = await preparado(c, c.ana);
    assert.deepEqual([regla(v, 'acierto').ok, regla(v, 'acierto').valor, regla(v, 'cobertura').ok], [true, 100, true]);
    assert.deepEqual([regla(v, 'constancia').ok, regla(v, 'memoria').ok, regla(v, 'tiempo').ok], [false, false, false]);
    assert.equal(v.nivel, 'todavia', 'tres reglas sin cumplir');
    // Un examen bueno no basta (constancia), ni todo el mismo día (memoria y tiempo).
    await todoBien(c, c.ana, { tipo: 'examen', materia: 'factores_humanos' });
    v = await preparado(c, c.ana);
    assert.deepEqual([regla(v, 'constancia').valor, regla(v, 'constancia').ok], [1, false]);
    // Días distintos: memoria (acierta otra vez 2 días después) y constancia (3 exámenes).
    for (let k = 0; k < 6; k++) {
      c.reloj.avanzar(2 * DIA);
      await todoBien(c, c.ana, { tipo: 'examen', materia: 'factores_humanos' });
    }
    v = await preparado(c, c.ana);
    assert.deepEqual(v.reglas.filter(r => !r.ok).map(r => r.id), []);
    assert.equal(v.nivel, 'listo');
    assert.ok(v.probabilidad >= 90 && v.probabilidad <= 99);
    assert.equal(v.porMateria[0].nivel, 'listo');
    // Beto (nada) sigue «Todavía no»: cada uno lo suyo. El administrador ve el de Ana; Beto no puede.
    assert.equal((await preparado(c, c.beto)).nivel, 'todavia');
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/preparado`, { galleta: c.admin, cabeceras: DUENO })).datos.nivel, 'listo');
    assert.equal((await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${c.ids.ana}/preparado`, { galleta: c.beto })).codigo, 403);
  });
});

test('listo: una falla sin superar lo baja a «Casi», y un aprobado con preguntas nunca vistas pide repetirlo', async () => {
  await conAcademia(async c => {
    const r = await todoBien(c, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' });
    assert.equal(r.aprobado, true);
    let v = await preparado(c, c.ana);
    const s = v.suerte.find(x => x.intento === r.id);
    assert.ok(s && s.razones.some(x => x.id === 'nuevas'), 'acertó todo la primera vez: puede ser suerte');
    // Falla 3 veces la misma pregunta: una falla activa.
    for (let k = 0; k < 3; k++) await vuelta(c, c.ana, 'muestra-h2', { bien: false });
    v = await preparado(c, c.ana);
    assert.deepEqual([regla(v, 'fallas').ok, regla(v, 'fallas').valor], [false, 1]);
    assert.deepEqual(regla(v, 'fallas').donde, [{ materia: 'factores_humanos', n: 1 }]);
  });
});

test('Aprendizaje: primer intento contra los siguientes, lo que pasó de fallada a dominada, las más difíciles, con su n', async () => {
  await conAcademia(async c => {
    for (const g of [c.ana, c.beto]) {
      await vuelta(c, g, 'muestra-h2', { bien: false });
      await vuelta(c, g, 'muestra-h2', { bien: true });
      await vuelta(c, g, 'muestra-h2', { bien: true });
    }
    assert.equal((await pedir(c.base, 'GET', '/api/admin/academia/aprendizaje', { galleta: c.ana })).codigo, 403);
    const e = (await pedir(c.base, 'GET', '/api/admin/academia/aprendizaje', { galleta: c.admin, cabeceras: DUENO })).datos;
    assert.equal(e.alumnos, 2);
    assert.equal(e.respuestas, 30);
    // 10 preguntas distintas (5 por alumno): primera vez 8 de 10 bien (h2 mal en las dos).
    assert.deepEqual(e.aprendizaje.primera, { pct: 80, n: 10, pocos: false });
    assert.deepEqual(e.aprendizaje.despues, { pct: 100, n: 20, pocos: false });
    assert.deepEqual(e.aprendizaje.dominadas, { pct: 100, n: 2, pocos: true }, 'pocos datos: se dice');
    assert.equal(e.dificiles[0].pregunta, 'muestra-h2');
    assert.equal(e.dificiles[0].opcion, mala('muestra-h2'));
    assert.equal(e.dificiles[0].idea, DE('muestra-h2').errores[mala('muestra-h2')]);
    assert.ok(e.clases.temas.length >= 1);
    // De un alumno solo.
    const a = (await pedir(c.base, 'GET', `/api/admin/academia/aprendizaje?alumno=${c.ids.ana}`, { galleta: c.admin, cabeceras: DUENO })).datos;
    assert.deepEqual([a.alumnos, a.respuestas], [1, 15]);
    // Una re-explicación y el siguiente acierto.
    const i = (await nuevo(c, c.ana, { tipo: 'tema', materia: 'factores_humanos', tema: 'muestra-hipoxia' })).datos;
    const q = i.preguntas[0];
    await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.ana, datos: { pregunta: q.id, elegida: mala(q.id) } });
    await pedir(c.base, 'POST', '/api/academia/instructor/explicar', { galleta: c.ana, datos: { intento: i.id, pregunta: q.id } });
    c.reloj.avanzar(60_000);
    await vuelta(c, c.ana, 'nada', { bien: true });
    const b = (await pedir(c.base, 'GET', `/api/admin/academia/aprendizaje?alumno=${c.ids.ana}`, { galleta: c.admin, cabeceras: DUENO })).datos;
    assert.deepEqual(b.adaptacion.reexplicacionBasica, { pct: 100, n: 1, pocos: true });
    assert.deepEqual(b.adaptacion.reexplicacionIa, { pct: null, n: 0, pocos: true });
  });
});
