// Pruebas de la 0.12.3: el administrador hace todo desde el enlace público (sin Tailscale) con su sesión; lo delicado pide
// su contraseña otra vez (y deja un aviso y una línea en la auditoría); el primer administrador sigue siendo solo desde
// Tailscale; un comprobante nuevo avisa al administrador y nunca se borra; los paquetes dicen qué línea está mal; el
// alumno pone su nombre y apellido la primera vez y después solo el administrador lo cambia; la versión 2 del Aviso de
// privacidad (la 1 queda tal cual para las firmas).
import { guardarConfigPagos as modoPagos } from '../src/academia/tiempo-ia.js';
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { crearLimitesCuentas } from '../src/api/cuentas.js';
import { Limitador } from '../src/nucleo/limites.js';
import { leerPaquetes } from '../public/pagos.js';
import { cabeceraDeClave } from '../public/confirmar-clave.js';
import { crearLimitesConfirmar } from '../src/cuentas/confirmar.js';
import { cuerpoDeAviso } from '../src/canales/textos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { PRIVACIDAD_V1, PRIVACIDAD_V2, versionDoc, docVersion } from '../src/cuentas/terminos.js';
import { carpetaPagos } from '../src/academia/tiempo-ia.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { guardarConfigIa } from '../src/ia/config.js';
import { claveAnthropic, permitirIa } from './ia-base.js';
import { agruparExamenes } from '../src/academia/examenes-tg.js';
import { resumenExamenes } from '../public/admin-alumnos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const OTRA = 'otra clave bien larga';
const CON_CLAVE = (clave = CLAVE) => ({ 'X-Confirmar-Clave': cabeceraDeClave(clave) });
const TOKEN = ['123456789', 'A'.repeat(35)].join(':'); // falso: nunca se llama a Telegram

function png(ancho = 240, alto = 80) {
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([largo, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(ancho * 4);
    if (y % 9 === 0) for (let x = 10; x < ancho - 10; x++) fila[x * 4 + 3] = 255;
    filas.push(Buffer.from([0]), fila);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}
const FIRMA_PNG = png();
const FIRMA = `data:image/png;base64,${FIRMA_PNG.toString('base64')}`;

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const tipo = r.headers.get('content-type') ?? '';
  const contenido = tipo.includes('json') ? await r.json().catch(() => ({})) : {};
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null, cabeceras: r.headers };
}

// Un servidor con el primer administrador (creado desde Tailscale, como en la vida real) y un alumno. Después, todo lo del
// administrador va SIN la cabecera de Tailscale: el enlace público.
async function conPlataforma(fn, { terminos = false, confirmar = {} } = {}) {
  const config = { ...configDePrueba(), terminosObligatorios: terminos };
  const db = abrirBase(config);
  // 0.12.7: estas pruebas son del «tiempo con IA» por minutos (el modo de antes, que sigue existiendo); los planes y la
  // prueba gratis se prueban en test/planes-ia.test.js.
  modoPagos(db, { modo: 'minutos' });
  const limites = { ...crearLimitesCuentas(), entrarPorCliente: new Limitador({ maximo: 1000, ventanaMs: 60_000 }) };
  const servidor = crearServidor({ db, config, limites, confirmar, ia: { probadores: { telegram_bot: async () => 'ok' } } });
  await conServidor(servidor, async base => {
    const primero = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(primero.codigo, 201);
    const admin = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } })).galleta;
    const alumnoId = crearUsuario(db, { nombre: 'ana', nombreVisible: 'Ana Pérez', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const alumno = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    await fn({ base, db, config, admin, alumno, alumnoId });
  });
  db.close();
}
// La IA lista para el alumno (una clave probada, encendida con el instructor, un tope de su plan y «Permitir IA»).
function iaLista(db, config, alumnoId) {
  const adminId = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").get().id;
  const secretoId = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: adminId }).secreto.id;
  anotarPrueba(db, { id: secretoId, motivo: 'ok' });
  guardarConfigIa(db, { topeGeneralMicro: 2_000_000, topesPlanMicro: { prueba: 500_000, pago: 500_000 } }, { config, usuarioId: adminId });
  guardarConfigIa(db, { encendida: true }, { config, usuarioId: adminId });
  guardarConfigIa(db, { instructorIa: true }, { config, usuarioId: adminId });
  permitirIa(db, alumnoId, adminId);
}
const cambios = db => db.prepare("SELECT detalle FROM auditoria WHERE accion = 'cambio_admin' ORDER BY id").all().map(f => JSON.parse(f.detalle));
const avisosDe = (db, prefijo) => db.prepare('SELECT * FROM avisos WHERE clave LIKE ? ORDER BY id').all(`${prefijo}%`);
const BANCO = { banco: 'Banco de Prueba', numero: '000-111222-3', titular: 'Titular de Prueba', paquetes: [{ id: 'p60', minutos: 60, precio: 'RD$350' }] };

test('por el enlace público el administrador guarda los datos del banco solo con su contraseña otra vez (aviso y auditoría sin el número)', async () => {
  await conPlataforma(async ({ base, db, admin }) => {
    const sin = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO });
    assert.deepEqual([sin.codigo, sin.datos.error], [403, 'confirmar_clave']);
    const mala = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CON_CLAVE('no es esa') });
    assert.deepEqual([mala.codigo, mala.datos.error], [403, 'clave_confirmar_incorrecta']);
    assert.equal(mala.datos.quedan, undefined, '0.12.6: sin «te quedan N intentos»');
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/pagos', { galleta: admin })).datos.config.numero, '', 'nada se guardó');
    assert.equal(cambios(db).length, 0);
    const bien = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CON_CLAVE() });
    assert.equal(bien.codigo, 200, JSON.stringify(bien.datos));
    assert.equal(bien.datos.config.numero, '000-111222-3');
    const [c] = cambios(db);
    assert.equal(c.accion, 'datos_pago');
    assert.equal(c.como, 'clave');
    assert.deepEqual(c.campos.sort(), ['banco', 'numero', 'paquetes', 'titular']);
    const texto = JSON.stringify(db.prepare("SELECT * FROM auditoria").all()) + JSON.stringify(db.prepare('SELECT * FROM avisos').all());
    assert.ok(!texto.includes('000-111222-3') && !texto.includes(CLAVE), 'ni el número ni la contraseña quedan anotados');
    const [aviso] = avisosDe(db, 'cambio_admin:datos_pago:');
    assert.equal(aviso.nivel, 'atencion');
    assert.deepEqual(vaPorTelegram(aviso), { va: true, suena: false }, 'va también por Telegram');
    assert.match(cuerpoDeAviso(aviso, 'es'), /Datos de pago y paquetes/);
    // Desde la cuenta de Tailscale del dueño no se pide otra vez (ya dijo quién es).
    const ts = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: { ...BANCO, titular: 'Otro Titular' }, cabeceras: DESDE_TAILSCALE });
    assert.equal(ts.codigo, 200);
    assert.equal(cambios(db).at(-1).como, 'tailscale');
    // «Entendido» lo cierra (un aviso de un hecho no queda abierto para siempre).
    assert.equal((await pedir(base, 'POST', `/api/admin/avisos/${aviso.id}/visto`, { galleta: admin, datos: {} })).codigo, 200);
    assert.ok(db.prepare('SELECT resuelto_en FROM avisos WHERE id = ?').get(aviso.id).resuelto_en);
    // La historia para la pantalla.
    const h = await pedir(base, 'GET', '/api/admin/cambios', { galleta: admin });
    assert.deepEqual(h.datos.cambios.map(x => x.accion), ['datos_pago', 'datos_pago']);
  });
});

test('0.12.6: un alumno no puede (ni con la contraseña) y las contraseñas malas del administrador nunca cierran su sesión: solo esperan', async () => {
  const esperas = [];
  let t = Date.now();
  const confirmar = crearLimitesConfirmar({ dormir: async ms => { esperas.push(ms); t += ms; }, reloj: () => t });
  await conPlataforma(async ({ base, db, admin, alumno }) => {
    const r = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: alumno, datos: BANCO, cabeceras: CON_CLAVE() });
    assert.deepEqual([r.codigo, r.datos.error], [403, 'solo_admin']);
    for (let i = 0; i < 9; i++) {
      const mala = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CON_CLAVE(`mala ${i}`) });
      assert.deepEqual([mala.codigo, mala.datos.error, mala.datos.quedan], [403, 'clave_confirmar_incorrecta', undefined]);
    }
    assert.deepEqual(esperas, [1000, 2000, 4000, 8000]);
    assert.equal((await pedir(base, 'GET', '/api/yo', { galleta: admin })).codigo, 200, 'la sesión sigue abierta');
    const buena = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CON_CLAVE() });
    assert.equal(buena.codigo, 200, 'y la buena sirve');
    assert.equal(avisosDe(db, 'cambio_admin:clave_bloqueada:').length, 0, 'ya no hay «sesión cerrada»');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'clave_confirmar_fallida'").get().n, 9);
  }, { confirmar });
});

test('el primer administrador sigue siendo solo desde Tailscale', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const publico = await pedir(base, 'GET', '/api/setup');
    assert.deepEqual([publico.datos.necesitaAdmin, publico.datos.puedeCrearAdmin], [true, false]);
    assert.equal((await pedir(base, 'GET', '/api/setup', { cabeceras: DESDE_TAILSCALE })).datos.puedeCrearAdmin, true);
    const r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE } });
    assert.deepEqual([r.codigo, r.datos.error], [403, 'solo_desde_tailscale']);
    const funnel = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { ...DESDE_TAILSCALE, 'Tailscale-Funnel-Request': '?1' } });
    assert.equal(funnel.codigo, 403, 'por Funnel tampoco');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin'").get().n, 0);
  });
  db.close();
});

test('por el enlace público: crear otro administrador, la contraseña de un alumno, bloquear y la IA de una cuenta', async () => {
  await conPlataforma(async ({ base, db, admin, alumnoId }) => {
    const usuarios = await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin });
    assert.deepEqual(usuarios.datos.permisos, { cuentas: true, admins: true });
    const nuevo = { nombre: 'ayudante', rol: 'admin', clave: OTRA };
    assert.equal((await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: nuevo })).datos.error, 'confirmar_clave');
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: nuevo, cabeceras: CON_CLAVE() });
    assert.equal(creado.codigo, 201, JSON.stringify(creado.datos));
    assert.equal(creado.datos.rol, 'admin');
    assert.deepEqual(cambios(db).at(-1), { accion: 'admin_creado', cuenta: 'ayudante', como: 'clave' });
    // Un alumno común: sin contraseña otra vez (y con solo el usuario).
    const comun = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'beto', sinClave: true } });
    assert.equal(comun.codigo, 201);
    // La contraseña de otra persona: con la del administrador.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/reiniciar-clave`, { galleta: admin, datos: {} })).datos.error, 'confirmar_clave');
    const reinicio = await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/reiniciar-clave`, { galleta: admin, datos: {}, cabeceras: CON_CLAVE() });
    assert.equal(reinicio.codigo, 200);
    assert.ok(reinicio.datos.claveTemporal);
    const puesta = await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/clave`, { galleta: admin, datos: { clave: OTRA }, cabeceras: CON_CLAVE() });
    assert.equal(puesta.codigo, 200);
    assert.deepEqual(cambios(db).filter(c => c.accion === 'clave_otro').map(c => c.como), ['clave', 'clave']);
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM auditoria').all()).includes(OTRA), 'nunca la contraseña');
    // Bloquear y desbloquear a un alumno: con la sesión. Al otro administrador: con la contraseña otra vez.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/activo`, { galleta: admin, datos: { activo: false } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/activo`, { galleta: admin, datos: { activo: true } })).codigo, 200);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/activo`, { galleta: admin, datos: { activo: false } })).datos.error, 'confirmar_clave');
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/activo`, { galleta: admin, datos: { activo: false }, cabeceras: CON_CLAVE() })).codigo, 200);
    // El permiso de IA de una cuenta común, también por el enlace público.
    const ia = await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/ia`, { galleta: admin, datos: { permitida: true } });
    assert.equal(ia.codigo, 200);
    assert.equal(ia.datos.ia.permitida, true);
    // El plan, también.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/plan`, { galleta: admin, datos: { plan: 'pago' } })).codigo, 200);
  });
});

test('por el enlace público: las claves (el token del bot, falso; nunca se llama a Telegram) y la IA', async () => {
  await conPlataforma(async ({ base, db, admin }) => {
    assert.equal((await pedir(base, 'GET', '/api/admin/claves', { galleta: admin })).codigo, 200);
    const ia = await pedir(base, 'GET', '/api/admin/ia', { galleta: admin });
    assert.equal(ia.datos.esDueno, true, 've y cambia todo');
    assert.equal((await pedir(base, 'POST', '/api/admin/claves', { galleta: admin, datos: { uso: 'telegram_bot', valor: TOKEN } })).datos.error, 'confirmar_clave');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 0);
    const r = await pedir(base, 'POST', '/api/admin/claves', { galleta: admin, datos: { uso: 'telegram_bot', valor: TOKEN }, cabeceras: CON_CLAVE() });
    assert.equal(r.codigo, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.prueba.motivo, 'ok');
    assert.deepEqual(cambios(db).at(-1), { accion: 'token_telegram', uso: 'telegram_bot', como: 'clave' });
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM auditoria').all()).includes(TOKEN.slice(10)), 'el token nunca queda anotado');
    assert.equal((await pedir(base, 'POST', '/api/admin/ia/ajustes', { galleta: admin, datos: { topeGeneralUsd: 5 } })).codigo, 200);
    assert.equal((await pedir(base, 'GET', '/api/admin/ia/consumo', { galleta: admin })).codigo, 200);
    assert.equal((await pedir(base, 'POST', '/api/admin/telegram/vincular', { galleta: admin, datos: {} })).datos.error, 'confirmar_clave', 'unir un chat pide la contraseña');
  });
});

test('paquetes: una línea mala («350») dice cuál, en la pantalla y en el servidor (400 paquete_linea_no_valida)', async () => {
  assert.deepEqual(leerPaquetes('60 | RD$350\n\n120 | RD$600').paquetes, [{ id: 'p60', minutos: 60, precio: 'RD$350' }, { id: 'p120', minutos: 120, precio: 'RD$600' }]);
  assert.deepEqual(leerPaquetes('60 | RD$350\n350').error, { linea: 2, texto: '350', motivo: 'formato' });
  assert.equal(leerPaquetes('\n\nabc | RD$1').error.linea, 3);
  assert.equal(leerPaquetes('60 | ').error.motivo, 'formato');
  assert.equal(leerPaquetes('60 | a | b').error.motivo, 'formato');
  assert.equal(leerPaquetes('60 | RD$1\n60 | RD$2').error.motivo, 'repetido');
  assert.equal(leerPaquetes(Array.from({ length: 9 }, (_, i) => `${i + 1} | RD$${i}`).join('\n')).error.motivo, 'demasiados');
  assert.deepEqual(leerPaquetes('').paquetes, []);
  await conPlataforma(async ({ base, admin }) => {
    const r = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, cabeceras: CON_CLAVE(),
      datos: { paquetes: [{ id: 'p60', minutos: 60, precio: 'RD$350' }, { id: 'p350', minutos: 350, precio: '' }] } });
    assert.deepEqual([r.codigo, r.datos.error, r.datos.linea], [400, 'paquete_linea_no_valida', 2]);
    // Se revisa antes de pedir la contraseña: sin ella también dice qué línea.
    const sin = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: { paquetes: [{ id: 'x', minutos: 0, precio: 'RD$1' }] } });
    assert.deepEqual([sin.codigo, sin.datos.error, sin.datos.linea], [400, 'paquete_linea_no_valida', 1]);
    const muchos = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, cabeceras: CON_CLAVE(), datos: { paquetes: Array.from({ length: 9 }, (_, i) => ({ id: `p${i + 1}`, minutos: i + 1, precio: 'RD$1' })) } });
    assert.equal(muchos.datos.error, 'paquetes_demasiados');
    for (const idioma of ['es', 'en']) {
      const textos = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8'));
      for (const k of ['error.paquete_linea_no_valida', 'error.paquetes_demasiados', 'pagos.paquetes.error.formato', 'error.confirmar_clave', 'error.clave_confirmar_incorrecta', 'error.nombre_lo_cambia_admin']) assert.ok(textos[k], `${idioma}: ${k}`);
    }
    assert.match(JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'))['pagos.paquetes.error.formato'], /Cada línea: minutos \| precio\. Ejemplo: 60 \| RD\$350/);
  });
});

test('un comprobante nuevo avisa al administrador (nombre, paquete y monto; también por Telegram) y se guarda para siempre', async () => {
  await conPlataforma(async ({ base, db, config, admin, alumno, alumnoId }) => {
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CON_CLAVE() })).codigo, 200);
    iaLista(db, config, alumnoId);
    const subido = await pedir(base, 'POST', '/api/academia/pagos?paquete=p60&nota=hola', { galleta: alumno, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: FIRMA_PNG });
    assert.equal(subido.codigo, 201, JSON.stringify(subido.datos));
    const [aviso] = avisosDe(db, 'pago_recibido:');
    assert.equal(aviso.clave, `pago_recibido:${subido.datos.pago.id}`);
    assert.deepEqual(JSON.parse(aviso.detalle), { pago: subido.datos.pago.id, alumno: 'Ana Pérez', minutos: 60, precio: 'RD$350' });
    assert.deepEqual(vaPorTelegram(aviso), { va: true, suena: false });
    assert.equal(cuerpoDeAviso(aviso, 'es'), 'Comprobante nuevo de Ana Pérez: 60 usos de IA · RD$350. Revísalo en Pagos.');
    // Aprobarlo cierra el aviso; la imagen sigue ahí (y se puede bajar), también en «Todos los comprobantes».
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/pagos/${subido.datos.pago.id}/aprobar`, { galleta: admin, datos: {} })).codigo, 200);
    assert.ok(db.prepare('SELECT resuelto_en FROM avisos WHERE id = ?').get(aviso.id).resuelto_en);
    const todos = await pedir(base, 'GET', '/api/admin/academia/pagos/todos', { galleta: admin });
    assert.deepEqual([todos.datos.total, todos.datos.pagos[0].imagen, todos.datos.pagos[0].alumno.nombre], [1, true, 'Ana Pérez']);
    const bajar = await fetch(`${base}/api/admin/academia/pagos/${subido.datos.pago.id}/recibo?bajar=1`, { headers: { Cookie: admin } });
    assert.equal(bajar.status, 200);
    assert.match(bajar.headers.get('content-disposition'), /^attachment; filename="comprobante-\d+-ana-\d{4}-\d{2}-\d{2}\.png"$/);
    assert.deepEqual(Buffer.from(await bajar.arrayBuffer()), FIRMA_PNG);
    assert.equal((await fetch(`${base}/api/admin/academia/pagos/todos`, { headers: { Cookie: alumno, 'X-Oportia': '1' } })).status, 403, 'solo el administrador');
    // Uno de antes cuya imagen se borró (0.11.x): sale en la lista, sin imagen (nunca una imagen rota).
    db.prepare(`INSERT INTO academia_pagos (usuario_id, paquete, minutos, precio, archivo, tipo, bytes, estado, revisado_en, creado_en)
      VALUES (2, 'p60', 60, 'RD$350', 'borrado-2-1-aaaaaaaaaaaa.png', 'image/png', 10, 'aprobado', '2026-01-02', '2026-01-01')`).run();
    const otra = await pedir(base, 'GET', '/api/admin/academia/pagos/todos', { galleta: admin });
    assert.deepEqual(otra.datos.pagos.map(p => p.imagen), [false, true]);
    assert.ok(readdirSync(carpetaPagos(config)).length === 1);
  });
});

test('ya no queda ningún camino que borre comprobantes', () => {
  assert.equal(existsSync(join(RAIZ, 'src', 'academia', 'recibos.js')), false);
  const manejadores = readFileSync(join(RAIZ, 'src', 'tareas', 'manejadores.js'), 'utf8');
  assert.doesNotMatch(manejadores, /recibos|borrarRecibos/);
  const todo = [];
  (function recorrer(dir) {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      if (n.isDirectory()) recorrer(join(dir, n.name));
      else if (n.name.endsWith('.js')) todo.push(readFileSync(join(dir, n.name), 'utf8'));
    }
  })(join(RAIZ, 'src'));
  for (const texto of todo) {
    assert.doesNotMatch(texto, /DIAS_RECIBO|borrarRecibosVencidos|recibosVencidos/);
    assert.doesNotMatch(texto, /SET archivo = .borrado-/);
  }
});

test('el alumno pone su nombre y apellido la primera vez (con la cuenta creada solo con el usuario); después solo el administrador lo cambia', async () => {
  await conPlataforma(async ({ base, admin }) => {
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'pepe', sinClave: true } });
    assert.deepEqual([creado.codigo, creado.datos.nombreVisible, creado.datos.pendiente], [201, 'pepe', true]);
    // La primera vez: elige su cuenta, crea su contraseña y, antes de firmar, escribe su nombre y apellido.
    assert.equal((await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'pepe', clave: '' } })).datos.error, 'crear_clave');
    const pepe = (await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'pepe', nueva: OTRA } })).galleta;
    const estado = (await pedir(base, 'GET', '/api/yo/terminos', { galleta: pepe })).datos;
    assert.equal(estado.estado.pendiente, true);
    assert.equal(estado.estado.nombreLegal ?? null, null, 'nadie lo escribió todavía');
    const firma = await pedir(base, 'POST', '/api/yo/terminos', { galleta: pepe, datos: {
      version: estado.terminos.version, versionPrivacidad: estado.privacidad.version, nombre: 'Pepe', apellido: 'Martínez', nacimiento: '2000-05-10',
      acepto: true, aceptoPrivacidad: true, aceptoIa: true, firma: FIRMA } });
    assert.equal(firma.codigo, 200, JSON.stringify(firma.datos));
    const fila = (await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios.find(u => u.nombre === 'pepe');
    assert.deepEqual([fila.nombreVisible, fila.nombreLegal], ['Pepe Martínez', 'Pepe Martínez'], 'el administrador lo ve en Usuarios');
    // Ya no lo cambia él (sí su avatar).
    const perfil = (await pedir(base, 'GET', '/api/yo/perfil', { galleta: pepe })).datos.perfil;
    assert.equal(perfil.nombreFijo, true);
    const cambiar = await pedir(base, 'POST', '/api/yo/perfil', { galleta: pepe, datos: { nombreVisible: 'Otro Nombre' } });
    assert.deepEqual([cambiar.codigo, cambiar.datos.error], [403, 'nombre_lo_cambia_admin']);
    const avatar = await pedir(base, 'POST', '/api/yo/perfil', { galleta: pepe, datos: { nombreVisible: 'Pepe Martínez', avatar: `${perfil.opciones.formas[0]}-${perfil.opciones.colores[0]}` } });
    assert.equal(avatar.codigo, 200, JSON.stringify(avatar.datos));
    // El administrador sí (en los dos lados).
    const legal = await pedir(base, 'POST', `/api/admin/usuarios/${creado.datos.id}/nombre-legal`, { galleta: admin, datos: { nombre: 'José', apellido: 'Martínez' } });
    assert.equal(legal.codigo, 200);
    const despues = (await pedir(base, 'GET', '/api/admin/usuarios', { galleta: admin })).datos.usuarios.find(u => u.nombre === 'pepe');
    assert.deepEqual([despues.nombreVisible, despues.nombreLegal], ['José Martínez', 'José Martínez']);
  }, { terminos: true });
});

test('un nombre que el administrador escribió se ve al firmar y el alumno lo puede corregir; las cuentas de antes no cambian', async () => {
  await conPlataforma(async ({ base, db, admin, alumnoId }) => {
    const creado = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'luis', sinClave: true, nombreVisible: 'Luis Gómez', nombreLegal: { nombre: 'Luis', apellido: 'Gómez' } } });
    assert.equal(creado.codigo, 201);
    const luis = (await pedir(base, 'POST', '/api/crear-clave', { datos: { nombre: 'luis', nueva: OTRA } })).galleta;
    const estado = (await pedir(base, 'GET', '/api/yo/terminos', { galleta: luis })).datos;
    assert.deepEqual([estado.estado.nombreLegal.nombre, estado.estado.nombreLegal.confirmado], ['Luis', false]);
    await pedir(base, 'POST', '/api/yo/terminos', { galleta: luis, datos: { version: estado.terminos.version, versionPrivacidad: estado.privacidad.version, nombre: 'Luis Alberto', apellido: 'Gómez', nacimiento: '2001-01-01', acepto: true, aceptoPrivacidad: true, aceptoIa: false, firma: FIRMA } });
    assert.equal(db.prepare('SELECT nombre_visible FROM usuarios WHERE id = ?').get(creado.datos.id).nombre_visible, 'Luis Alberto Gómez');
    // «ana» (creada antes, sin firmar): nada cambió en su cuenta.
    assert.equal(db.prepare('SELECT nombre_visible FROM usuarios WHERE id = ?').get(alumnoId).nombre_visible, 'Ana Pérez');
  }, { terminos: true });
});

test('Aviso de privacidad: la versión 1 queda tal cual (las firmas y el archivo), la 2 ya no promete borrar los comprobantes', async () => {
  const huella = createHash('sha256').update(JSON.stringify(PRIVACIDAD_V1)).digest('hex');
  assert.equal(huella, '8b0ba17685110c501decfb9628d2778138ea53dff9760584d6e50ab3f4eef0e1', 'la v1 nunca cambia');
  const plazos = v => v.find(x => x.titulo.startsWith('6.')).texto;
  assert.match(plazos(PRIVACIDAD_V1), /se borra sola 30 días/);
  assert.doesNotMatch(plazos(PRIVACIDAD_V2), /30 días|se borra sola/);
  assert.match(plazos(PRIVACIDAD_V2), /No se borran solos/);
  assert.match(plazos(PRIVACIDAD_V2), /Nunca se borran solos/);
  assert.deepEqual(PRIVACIDAD_V2.filter(x => !x.titulo.startsWith('6.')), PRIVACIDAD_V1.filter(x => !x.titulo.startsWith('6.')), 'lo demás, igual');
  const config = configDePrueba();
  const db = abrirBase(config);
  assert.equal(versionDoc(db, 'privacidad'), 2, 'sin nada guardado, la que está en uso es la 2');
  assert.deepEqual(docVersion(db, 'privacidad', 1).secciones, PRIVACIDAD_V1.map(x => ({ ...x })));
  assert.equal(docVersion(db, 'privacidad', 3), null);
  // Un texto que el administrador ya había publicado manda (nada se pisa).
  db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('academia.privacidad.v2', ?, '2026-01-01'), ('academia.privacidad.version', '2', '2026-01-01')")
    .run(JSON.stringify({ secciones: [{ titulo: 'Mío', texto: 'Mi texto.' }], publicadoEn: '2026-01-01T00:00:00Z' }));
  assert.equal(docVersion(db, 'privacidad', 2).secciones[0].titulo, 'Mío');
  db.close();
  // En el servidor: quien firmó la v1 vuelve a firmar (la 2); su documento de la v1 sigue con el texto de la v1.
  await conPlataforma(async ({ base, db: base2, alumno, alumnoId }) => {
    base2.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-01-01')")
      .run(`cuenta.terminos.${alumnoId}`, JSON.stringify([{ n: 1, version: 1, versionPrivacidad: 1, firmado: 'Ana Pérez', en: '2026-01-01T00:00:00Z' }]));
    const e = (await pedir(base, 'GET', '/api/yo/terminos', { galleta: alumno })).datos;
    assert.deepEqual([e.privacidad.version, e.estado.pendiente], [2, true]);
    const doc = await pedir(base, 'GET', '/api/yo/documentos/1', { galleta: alumno });
    assert.equal(doc.codigo, 200, JSON.stringify(doc.datos));
    assert.match(JSON.stringify(doc.datos), /se borra sola 30 días/, 'el archivo guarda el texto que firmó');
  }, { terminos: true });
});

test('ningún texto de las pantallas dice OPORTIA', () => {
  for (const idioma of ['es', 'en']) {
    const texto = readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8');
    assert.doesNotMatch(texto, /OPORTIA/, idioma);
    const t = JSON.parse(texto);
    assert.doesNotMatch(t['admin.nuevo.rol.solo_dueno'], /dueño de|owner of/);
  }
});

test('sin la IA lista para el alumno no se vende ni se cobra (409 pago_ia_no_disponible), y aprobar pide confirmarlo', async () => {
  await conPlataforma(async ({ base, db, config, admin, alumno, alumnoId }) => {
    assert.equal((await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: BANCO, cabeceras: CON_CLAVE() })).codigo, 200);
    const t1 = (await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: alumno })).datos;
    assert.equal(t1.venta.listo, false);
    assert.ok(t1.venta.falta.includes('ia_apagada'));
    const subir = () => pedir(base, 'POST', '/api/academia/pagos?paquete=p60', { galleta: alumno, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: FIRMA_PNG });
    const no = await subir();
    assert.deepEqual([no.codigo, no.datos.error], [409, 'pago_ia_no_disponible']);
    assert.ok(no.datos.falta.includes('ia_apagada'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM academia_pagos').get().n, 0, 'nada se guardó');
    iaLista(db, config, alumnoId);
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: alumno })).datos.venta, { listo: true, falta: [] });
    const si = await subir();
    assert.equal(si.codigo, 201);
    // Retira su permiso de IA: ya no se le vende, y aprobar lo que subió pide confirmarlo (el comprobante queda).
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '0', '2026-11-12')").run(`cuenta.consentimiento_ia.${alumnoId}`);
    assert.deepEqual((await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: alumno })).datos.venta.falta, ['sin_consentimiento']);
    assert.equal((await subir()).datos.error, 'pago_ia_no_disponible');
    const aprobar = await pedir(base, 'POST', `/api/admin/academia/pagos/${si.datos.pago.id}/aprobar`, { galleta: admin, datos: {} });
    assert.deepEqual([aprobar.codigo, aprobar.datos.error, aprobar.datos.falta], [409, 'ia_no_lista_alumno', ['sin_consentimiento']]);
    assert.equal(db.prepare('SELECT estado FROM academia_pagos WHERE id = ?').get(si.datos.pago.id).estado, 'revision');
    const igual = await pedir(base, 'POST', `/api/admin/academia/pagos/${si.datos.pago.id}/aprobar`, { galleta: admin, datos: { aunAsi: true } });
    assert.equal(igual.codigo, 200);
    // Con la IA encendida, a quien le falta su permiso no se le muestran minutos (activo es por cuenta).
    assert.equal((await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: alumno })).datos.tiempo.activo, false);
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, '1', '2026-11-12') ON CONFLICT(clave) DO UPDATE SET valor = '1'").run(`cuenta.consentimiento_ia.${alumnoId}`);
    assert.equal((await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: alumno })).datos.tiempo.activo, true);
    // Lo que hace el administrador por el enlace público (reiniciar su contraseña, el plan, bloquear y desbloquear) no le
    // quita a la cuenta el «Permitir IA» que tenía: sigue pudiendo pagar.
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/reiniciar-clave`, { galleta: admin, datos: {}, cabeceras: CON_CLAVE() })).codigo, 200);
    assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/plan`, { galleta: admin, datos: { plan: 'pago' } })).codigo, 200);
    for (const activo of [false, true]) assert.equal((await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/activo`, { galleta: admin, datos: { activo } })).codigo, 200);
    const ana2 = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: (await pedir(base, 'POST', `/api/admin/usuarios/${alumnoId}/clave`, { galleta: admin, datos: { clave: OTRA }, cabeceras: CON_CLAVE() })).codigo === 200 ? OTRA : '' } })).galleta;
    const venta = (await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: ana2 })).datos.venta;
    assert.deepEqual(venta, { listo: true, falta: [] }, 'sigue con su permiso');
    // El administrador en «Tiempo con IA»: su tiempo no tiene límite (la pantalla no le vende nada).
    assert.equal((await pedir(base, 'GET', '/api/academia/tiempo-ia', { galleta: admin })).datos.tiempo.ilimitado, true);
    // El banco: vacío queda vacío (ya no vuelve un banco por defecto).
    const vacio = await pedir(base, 'POST', '/api/admin/academia/pagos/ajustes', { galleta: admin, datos: { banco: '' }, cabeceras: CON_CLAVE() });
    assert.equal(vacio.datos.config.banco, '');
    for (const idioma of ['es', 'en']) {
      const textos = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8'));
      for (const f of ['ia_apagada', 'sin_presupuesto', 'cuenta_sin_permiso', 'sin_consentimiento']) assert.ok(textos[`pagos.admin.falta.${f}`], f);
      assert.doesNotMatch(textos['pagos.admin.falta.ia_apagada'], /tu cuenta|your account/);
      for (const k of ['error.pago_ia_no_disponible', 'error.ia_no_lista_alumno', 'tiempo.no_disponible', 'tiempo.sin_consentimiento']) assert.ok(textos[k], k);
    }
  });
});

test('Exámenes del Test Guide: solo el examen de cada materia, agrupado por materia (en el orden del contenido), los más nuevos primero', async () => {
  const filas = [
    { intento: 9, materia: 'meteo', alumno: { id: 2, nombre: 'Ana' }, pct: 80, aprobado: true },
    { intento: 7, materia: 'fh', alumno: { id: 3, nombre: 'Beto' }, pct: 60, aprobado: false },
    { intento: 5, materia: 'fh', alumno: { id: 2, nombre: 'Ana' }, pct: 90, aprobado: true },
  ];
  const g = agruparExamenes(filas, ['fh', 'meteo', 'navegacion']);
  assert.deepEqual(g.map(m => [m.id, m.intentos, m.mejor, m.ultima, m.aprobados, m.tasa]), [['fh', 2, 90, 60, 1, 50], ['meteo', 1, 80, 80, 1, 100], ['navegacion', 0, null, null, 0, null]]);
  assert.deepEqual(resumenExamenes(g[0].filas.filter(x => x.alumno.id === 2)), { intentos: 1, mejor: 90, ultima: 90, aprobados: 1, tasa: 100 });
  await conPlataforma(async ({ base, db, admin, alumno, alumnoId }) => {
    const otro = crearUsuario(db, { nombre: 'beto', claveHash: 'x' });
    const meter = (usuario, tipo, materia, aciertos, aprobado, terminado, empezado = '2026-11-01T10:00:00Z') => Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en)
      VALUES (?, ?, ?, ?, 10, 10, ?, ?, ?, ?)`).run(usuario, tipo, materia, tipo === 'tema' ? 't1' : null, aciertos, aprobado, empezado, terminado).lastInsertRowid);
    const a1 = meter(alumnoId, 'examen', 'factores_humanos', 9, 1, '2026-11-01T10:20:00Z');
    const a2 = meter(alumnoId, 'examen', 'factores_humanos', 6, 0, '2026-11-03T10:20:00Z', '2026-11-03T10:00:00Z');
    meter(otro, 'examen', 'meteorologia', 8, 1, '2026-11-02T10:00:00Z', '2026-11-02T09:30:00Z');
    meter(alumnoId, 'tema', 'factores_humanos', 5, 0, '2026-11-04T10:00:00Z');
    meter(alumnoId, 'examen', 'factores_humanos', 0, null, null);
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-03')").run(`academia.salto.${a2}`, JSON.stringify({ usuario: alumnoId, materia: 'factores_humanos', pendientes: 3, total: 5, en: '2026-11-03' }));
    const r = await pedir(base, 'GET', '/api/admin/academia/examenes', { galleta: admin });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    const fh = r.datos.materias.find(m => m.id === 'factores_humanos');
    assert.deepEqual(fh.filas.map(x => x.intento), [a2, a1], 'solo los exámenes terminados, el más nuevo primero');
    assert.deepEqual([fh.intentos, fh.mejor, fh.ultima, fh.aprobados, fh.tasa], [2, 90, 60, 1, 50]);
    assert.deepEqual(Object.keys(fh.filas[0]).sort(), ['aciertos', 'alumno', 'aprobado', 'directo', 'fecha', 'intento', 'materia', 'pct', 'segundos', 'total']);
    assert.deepEqual([fh.filas[0].directo, fh.filas[1].directo, fh.filas[0].segundos, fh.filas[0].alumno.nombre], [true, false, 1200, 'Ana Pérez']);
    assert.equal(r.datos.enCurso, 1);
    assert.deepEqual(r.datos.alumnos.map(a => a.nombre).sort(), ['Ana Pérez', 'beto']);
    assert.equal(r.datos.materias.flatMap(m => m.filas).length, 3, 'los temas no entran');
    const deAna = await pedir(base, 'GET', `/api/admin/academia/examenes?alumno=${alumnoId}`, { galleta: admin });
    assert.deepEqual(deAna.datos.materias.flatMap(m => m.filas).map(x => x.alumno.id), [alumnoId, alumnoId]);
    assert.equal((await pedir(base, 'GET', '/api/admin/academia/examenes', { galleta: alumno })).codigo, 403);
    const textos = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', 'es.json'), 'utf8'));
    assert.equal(textos['examenes.titulo'], 'Examen del Test Guide'.replace('Examen', 'Exámenes'));
  });
});
