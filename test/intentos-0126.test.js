// 0.12.6: sin bloqueos por contraseñas malas (solo esperas que crecen), el aviso de muchos fallos de un administrador,
// el código de acceso de respaldo y las claves pegadas con restos de la copia (saltos de línea, invisibles, rayas).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { hashClave } from '../src/cuentas/claves.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { crearLimitesConfirmar, FALLOS_PARA_AVISO } from '../src/cuentas/confirmar.js';
import { Freno } from '../src/nucleo/limites.js';
import { validarValor, limpiarPegado } from '../src/claves/almacen.js';
import { sinSaltos } from '../public/ia-vista.js';
import { claveAnthropic, claveOpenai } from './ia-base.js';

const CLAVE = 'una clave bien larga';
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CONFIRMA = (clave = CLAVE) => ({ 'X-Confirmar-Clave': Buffer.from(clave).toString('base64') });
const DESDE_INTERNET = ip => ({ 'X-Forwarded-For': `1.2.3.4, ${ip}`, 'Tailscale-Funnel-Request': '?1' });
const BANCO = { banco: 'Banco de Prueba', numero: '000-111222-3', titular: 'Titular de Prueba', paquetes: [{ id: 'p60', minutos: 60, precio: 'RD$350' }] };
const codigoAlAzar = () => `respaldo-${randomBytes(9).toString('hex')}`;

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  const r = await fetch(`${base}${ruta}`, opciones);
  const cuerpo = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: cuerpo, galleta: setCookie ? setCookie.split(';')[0] : null };
}

function relojFalso() {
  const r = { t: Date.now(), esperas: [] };
  r.reloj = () => r.t;
  r.dormir = async ms => { r.esperas.push(ms); r.t += ms; };
  return r;
}

async function conPlataforma(fn, { dormir, reloj } = relojFalso()) {
  const db = abrirBase(configDePrueba());
  const servidor = crearServidor({ db, limites: crearLimitesCuentas({ dormir, reloj }), confirmar: crearLimitesConfirmar({ dormir, reloj }) });
  await conServidor(servidor, async base => {
    const r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 201);
    const admin = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } })).galleta;
    const alumnoId = crearUsuario(db, { nombre: 'ana', nombreVisible: 'Ana Pérez', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const alumno = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    await fn({ base, db, admin, alumno, alumnoId });
  });
  db.close();
}
const avisosDe = (db, prefijo) => db.prepare('SELECT * FROM avisos WHERE clave LIKE ? ORDER BY id').all(`${prefijo}%`);

test('Freno: 5 sin espera, después 1, 2, 4, 8, 8 s; al acertar se olvida; la memoria tiene tope', async () => {
  const f = relojFalso();
  const freno = new Freno({ dormir: f.dormir, reloj: f.reloj });
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => freno.retraso(i)), [0, 0, 0, 0, 0, 1000, 2000, 4000, 8000]);
  for (let i = 0; i < 10; i++) await freno.esperarTurno('a');
  assert.deepEqual(f.esperas, [1000, 2000, 4000, 8000, 8000]);
  freno.olvidar('a');
  assert.equal(await freno.esperarTurno('a'), 0);
  // 15 minutos después del último fallo empieza de cero.
  for (let i = 0; i < 6; i++) await freno.esperarTurno('b');
  f.t += 16 * 60 * 1000;
  assert.equal(await freno.esperarTurno('b'), 0);
  const chico = new Freno({ dormir: f.dormir, reloj: f.reloj, maximoClaves: 50 });
  for (let i = 0; i < 500; i++) await chico.esperarTurno(`k${i}`);
  assert.ok(chico.registro.size <= 50, `tope de memoria: ${chico.registro.size}`);
});

test('la espera es un temporizador: mientras un intento espera, el servidor contesta lo demás', async () => {
  const pendientes = [];
  const dormir = ms => new Promise(listo => pendientes.push({ ms, listo }));
  await conPlataforma(async ({ base }) => {
    for (let i = 0; i < 5; i++) assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-xxxxxx` }, cabeceras: DESDE_INTERNET('203.0.113.7') })).codigo, 401);
    const sexto = pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: 'mala-6-xxxxxx' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    while (!pendientes.length) await new Promise(r => setTimeout(r, 5));
    assert.equal(pendientes[0].ms, 1000);
    assert.equal((await pedir(base, 'GET', '/api/setup')).codigo, 200, 'otro pedido no espera');
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } })).codigo, 200, 'ni el dueño desde otro lugar');
    pendientes[0].listo();
    const r = await sexto;
    assert.deepEqual([r.codigo, r.datos.error], [401, 'credenciales'], 'después de la espera, la respuesta normal');
  }, { dormir, reloj: Date.now });
});

test(`${FALLOS_PARA_AVISO} contraseñas malas de un administrador en una hora: UN aviso, sin bloqueo; las de un alumno no avisan`, async () => {
  await conPlataforma(async ({ base, db, admin }) => {
    for (let i = 0; i < 12; i++) await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `mala-${i}-xxxxxx` }, cabeceras: DESDE_INTERNET(`203.0.113.${i}`) });
    for (let i = 0; i < 5; i++) await pedir(base, 'POST', '/api/yo/clave', { galleta: admin, datos: { actual: `mala-${i}-xxxxxx`, nueva: 'otra clave muy larga' } });
    assert.equal(avisosDe(db, 'cambio_admin:claves_fallidas:').length, 0, 'todavía no');
    for (let i = 0; i < 8; i++) {
      const r = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CONFIRMA(`mala ${i}`) });
      assert.equal(r.datos.error, 'clave_confirmar_incorrecta');
    }
    const avisos = avisosDe(db, 'cambio_admin:claves_fallidas:');
    assert.equal(avisos.length, 1, 'uno solo');
    assert.equal(avisos[0].nivel, 'atencion');
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: admin })).codigo, 200, 'la sesión sigue');
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_INTERNET('203.0.113.1') })).codigo, 200, 'y entra');
    for (let i = 0; i < 25; i++) await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: `mala-${i}-xxxxxx` }, cabeceras: DESDE_INTERNET(`198.51.100.${i}`) });
    assert.equal(avisosDe(db, 'cambio_admin:claves_fallidas:').length, 1);
  });
});

test('crear la contraseña ya no tiene tope de intentos (nunca 429)', async () => {
  await conPlataforma(async ({ base }) => {
    for (let i = 0; i < 15; i++) {
      const r = await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: `nadie${i}`, nueva: 'otra clave muy larga' } });
      assert.deepEqual([r.codigo, r.datos.error], [409, 'ya_tiene_clave']);
    }
  });
});

test('código de acceso de respaldo: lo pone el administrador con su contraseña, se guarda solo su huella, entra con él y avisa; quitado ya no sirve', async () => {
  await conPlataforma(async ({ base, db, admin, alumno }) => {
    const codigo = codigoAlAzar();
    assert.equal((await pedir(base, 'GET', '/api/yo/codigo-respaldo', { galleta: alumno })).codigo, 403, 'solo administradores');
    assert.deepEqual((await pedir(base, 'GET', '/api/yo/codigo-respaldo', { galleta: admin })).datos, { puesto: false, puestoEn: null });
    let r = await pedir(base, 'POST', '/api/yo/codigo-respaldo', { galleta: admin, datos: { codigo } });
    assert.deepEqual([r.codigo, r.datos.error], [403, 'confirmar_clave'], 'pide la contraseña otra vez');
    r = await pedir(base, 'POST', '/api/yo/codigo-respaldo', { galleta: admin, datos: { codigo }, cabeceras: CONFIRMA('no es esa') });
    assert.deepEqual([r.codigo, r.datos.error], [403, 'clave_confirmar_incorrecta']);
    r = await pedir(base, 'POST', '/api/yo/codigo-respaldo', { galleta: admin, datos: { codigo: 'corto' }, cabeceras: CONFIRMA() });
    assert.deepEqual([r.codigo, r.datos.error], [400, 'codigo_corto']);
    r = await pedir(base, 'POST', '/api/yo/codigo-respaldo', { galleta: admin, datos: { codigo: CLAVE }, cabeceras: CONFIRMA() });
    assert.deepEqual([r.codigo, r.datos.error], [400, 'codigo_igual_clave']);
    assert.equal(estadoGuardado(db), null, 'nada se guardó');
    r = await pedir(base, 'POST', '/api/yo/codigo-respaldo', { galleta: admin, datos: { codigo }, cabeceras: CONFIRMA() });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.puesto, true);
    // Solo la huella (scrypt), nunca el código: ni en la base entera.
    assert.match(estadoGuardado(db).huella, /^scrypt\$/);
    const todo = JSON.stringify(db.prepare('SELECT * FROM ajustes').all()) + JSON.stringify(db.prepare('SELECT * FROM auditoria').all()) + JSON.stringify(db.prepare('SELECT * FROM avisos').all());
    assert.ok(!todo.includes(codigo), 'el código no queda en ninguna parte');
    assert.equal(avisosDe(db, 'cambio_admin:codigo_respaldo:').length, 1);

    // Un alumno no puede usar un código (aunque fuera igual) y un código malo es una contraseña mala más.
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: codigo } });
    assert.deepEqual([r.codigo, r.datos.error], [401, 'credenciales']);
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: `${codigo}x` } });
    assert.deepEqual([r.codigo, r.datos.error], [401, 'credenciales']);
    // Con el código: entra, aviso para el administrador, auditoría y la sugerencia en su pantalla.
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: codigo }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 200);
    assert.ok(r.datos.avisos.some(a => a.tipo === 'codigo_respaldo_usado'), 'la pantalla sugiere poner una contraseña nueva');
    assert.equal(avisosDe(db, 'cambio_admin:codigo_respaldo_usado:').length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'entrada_codigo_respaldo'").get().n, 1);
    // Con el código como «contraseña actual» pone una nueva (no está obligado).
    const conCodigo = r.galleta;
    assert.equal((await pedir(base, 'POST', '/api/yo/clave', { galleta: conCodigo, datos: { actual: codigo, nueva: 'la clave nueva de junior' } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: 'la clave nueva de junior' } })).codigo, 200);
    const admin2 = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: codigo } })).galleta;
    assert.ok(admin2, 'el código sigue valiendo (nunca vence)');

    // Quitarlo (con la contraseña otra vez): ya no sirve.
    r = await pedir(base, 'POST', '/api/yo/codigo-respaldo/quitar', { galleta: admin2, datos: {} });
    assert.deepEqual([r.codigo, r.datos.error], [403, 'confirmar_clave']);
    r = await pedir(base, 'POST', '/api/yo/codigo-respaldo/quitar', { galleta: admin2, datos: {}, cabeceras: CONFIRMA('la clave nueva de junior') });
    assert.deepEqual([r.codigo, r.datos], [200, { puesto: false, puestoEn: null }]);
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: codigo } });
    assert.deepEqual([r.codigo, r.datos.error], [401, 'credenciales'], 'quitado, ya no entra');
  });
});
function estadoGuardado(db) {
  const f = db.prepare("SELECT valor FROM ajustes WHERE clave LIKE 'codigo_respaldo:%'").get();
  return f ? JSON.parse(f.valor) : null;
}

test('claves pegadas: sin espacios, saltos, invisibles ni rayas parecidas; sk-ant-usr vale; sk-ant-<otra cosa> dice qué copiar', () => {
  const buena = claveAnthropic();
  const cortada = `${buena.slice(0, 15)}\n${buena.slice(15, 30)}\r\n  ${buena.slice(30)}\t`;
  assert.equal(validarValor('ia_anthropic', cortada), buena, 'cortada en varias líneas');
  assert.equal(validarValor('ia_anthropic', `﻿${buena.slice(0, 10)}​${buena.slice(10)}‍`), buena, 'invisibles');
  assert.equal(validarValor('ia_anthropic', buena.replace(/-/g, '–')), buena, 'rayas parecidas al guion');
  assert.equal(validarValor('ia_anthropic', buena.replace(/-/g, '−')), buena);
  const usr = ['sk', 'ant', 'usr', '1', `prueba${'u'.repeat(90)}`].join('-');
  assert.equal(validarValor('ia_anthropic', ` ${usr.slice(0, 50)}\n${usr.slice(50)} `), usr, 'las claves ligadas a la persona (sk-ant-usr-…)');
  for (const [valor, error] of [
    [['sk', 'ant', 'admin01', 'x'.repeat(40)].join('-'), 'clave_admin'],
    [['sk', 'ant', 'oat01', 'x'.repeat(40)].join('-'), 'clave_suscripcion'],
    [['sk', 'ant', 'ort01', 'x'.repeat(40)].join('-'), 'clave_suscripcion'],
    [['sk', 'ant', 'apikey', 'oportia'].join('-').replace('apikey', 'ap'), 'clave_anthropic_prefijo'],
    [['sk', 'ant', 'u', 'x'.repeat(40)].join('-'), 'clave_anthropic_prefijo'],
    ['oportia-produccion', 'clave_formato'],
  ]) assert.throws(() => validarValor('ia_anthropic', valor), e => e.clave === error, `${valor.slice(0, 12)} → ${error}`);
  const openai = claveOpenai();
  assert.equal(validarValor('ia_openai', `${openai.slice(0, 20)}\n${openai.slice(20)}`), openai);
  const bot = `123456789:${'A'.repeat(20)}-${'b'.repeat(15)}`;
  assert.equal(validarValor('telegram_bot', `${bot.slice(0, 12)}\n ${bot.slice(12).replace('-', '‐')}​`), bot);
  assert.equal(limpiarPegado(' a b\n\tc​–'), 'abc-');
  assert.equal(sinSaltos('abc\r\ndef\nghi'), 'abcdefghi', 'la casilla de la pantalla quita los saltos al pegar');
});
