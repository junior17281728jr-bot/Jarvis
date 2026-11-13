// Fase 1, parte d (paso 2): las rutas de la IA y de las claves con un servidor de verdad (puerto al azar) y el proveedor
// FALSO: quién puede qué (enlace público, otro equipo de Tailscale, la cuenta del dueño), encender y apagar, los topes,
// la ayuda en un proyecto (precio, fila, privacidad entre cuentas), el detalle del gasto y que la clave nunca se filtre.
// Nunca una API de verdad ni una clave de verdad.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { Limitador } from '../src/nucleo/limites.js';
import { ponerModoSeguro } from '../src/tareas/modo-seguro.js';
import { precioDe, reservaMicro } from '../src/ia/precios.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { leerLlave, cifrar } from '../src/claves/cifrado.js';
import { mesCobro, reservar } from '../src/ia/presupuesto.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { claveAnthropic, claveOpenai, buscarEnTodo, capturarConsola } from './ia-base.js';

const CLAVE = 'una clave bien larga';
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const OTRO_LOGIN = { 'Tailscale-User-Login': 'amigo@example.com' };
const FUNNEL = { 'Tailscale-Funnel-Request': '?1' };
const HAIKU = precioDe('anthropic', 'claude-haiku-5-5');
const TALLER = 'Busco clientes para mi taller de bicicletas en Los Minaslandia';
const PANELES = 'Tengo una empresa que vende paneles solares. Quiero encontrar hoteles, clínicas y fábricas en Santiago.';
const SILENCIO = { log() {}, error() {}, warn() {}, info() {} };

async function pedirHttp(base, metodo, ruta, { datos, galleta, cabeceras = {}, sinOportia = false } = {}) {
  const opciones = { method: metodo, headers: { ...(sinOportia ? {} : { 'X-Oportia': '1' }), ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  const r = await fetch(`${base}${ruta}`, opciones);
  const texto = await r.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = {}; }
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: cuerpo, galleta: setCookie ? setCookie.split(';')[0] : null, texto };
}

// Una petición que llega DIRECTA a la dirección 100.x del servidor (sin el enlace https: sin cuenta de Tailscale).
function peticionDirecta(servidor, { url, galleta }) {
  return new Promise(resolver => {
    const req = { url, method: 'GET', headers: { host: '100.64.0.5:8080', cookie: galleta }, socket: { localAddress: '100.64.0.5', remoteAddress: '100.64.0.9' } };
    const res = {
      codigo: 0, cuerpo: '',
      writeHead(codigo) { this.codigo = codigo; return this; },
      end(cuerpo = '') { this.cuerpo = String(cuerpo); resolver({ codigo: this.codigo, datos: JSON.parse(this.cuerpo || '{}') }); },
    };
    servidor.emit('request', req, res);
  });
}

// Un servidor de verdad con su base, el proveedor falso y «junior» (administrador, con su cuenta de Tailscale).
async function conPlataforma(fn, { limitesIa = {}, limitesClaves = {} } = {}) {
  const falso = await crearProveedorFalso();
  const config = { ...configDePrueba(), iaBases: { anthropic: falso.base, openai: falso.base } };
  const db = abrirBase(config);
  const despertares = [];
  const supervisor = { despertar: () => despertares.push(Date.now()) };
  const servidor = crearServidor({ db, config, supervisor, ia: { limites: limitesIa, limitesClaves } });
  try {
    await conServidor(servidor, async base => {
      const pedir = (metodo, ruta, opciones) => pedirHttp(base, metodo, ruta, opciones);
      const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      assert.ok(admin);
      const comoDueno = (metodo, ruta, opciones = {}) => pedir(metodo, ruta, { galleta: admin, ...opciones, cabeceras: { ...DUENO, ...(opciones.cabeceras ?? {}) } });
      async function nuevaCuenta(nombre) {
        // Desde la red de Tailscale del dueño (como lo hace Junior): así la cuenta queda con permiso de IA (ronda 5).
        const creada = await comoDueno('POST', '/api/admin/usuarios', { datos: { nombre } });
        assert.equal(creada.codigo, 201);
        const entrada = await pedir('POST', '/api/entrar', { datos: { nombre, clave: creada.datos.claveTemporal } });
        assert.equal((await pedir('POST', '/api/yo/clave', { datos: { actual: creada.datos.claveTemporal, nueva: CLAVE }, galleta: entrada.galleta })).codigo, 200);
        return { galleta: entrada.galleta, id: creada.datos.id };
      }
      await fn({ base, admin, db, config, servidor, falso, despertares, pedir, comoDueno, nuevaCuenta });
    });
  } finally {
    db.close();
    await falso.cerrar();
  }
}

// Guarda la clave de Claude (prueba gratis contra el falso), pone el tope y enciende la IA y la ayuda.
async function encender(comoDueno, { tope = '2', ayuda = true } = {}) {
  const g = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() } });
  assert.equal(g.codigo, 201, g.texto);
  assert.equal(g.datos.prueba.motivo, 'ok');
  assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: tope } })).codigo, 200);
  const r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true, ...(ayuda ? { ayudaProyectos: true } : {}) } });
  assert.equal(r.codigo, 200, r.texto);
  return g.datos.secreto;
}

// ---------- 20. Las claves: solo la cuenta de Tailscale del dueño ----------

test('20. claves y ajustes (0.12.3): también por el enlace público con la sesión; cambiar una clave pide la contraseña otra vez', async () => {
  await conPlataforma(async ({ db, servidor, admin, pedir, comoDueno, nuevaCuenta }) => {
    const CON_CLAVE = { 'X-Confirmar-Clave': Buffer.from(CLAVE).toString('base64') };
    for (const cabeceras of [{}, FUNNEL, { ...DUENO, ...FUNNEL }, OTRO_LOGIN]) {
      assert.equal((await pedir('GET', '/api/admin/claves', { galleta: admin, cabeceras })).codigo, 200, JSON.stringify(cabeceras));
      assert.equal((await pedir('GET', '/api/admin/ia/consumo', { galleta: admin, cabeceras })).codigo, 200);
      assert.equal((await pedir('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: '1' }, galleta: admin, cabeceras })).codigo, 200);
      for (const [ruta, datos] of [['/api/admin/claves', { uso: 'ia_anthropic', valor: claveAnthropic() }], ['/api/admin/claves/1/activa', { activa: false }]]) {
        const r = await pedir('POST', ruta, { datos, galleta: admin, cabeceras });
        assert.deepEqual([r.codigo, r.datos.error], [403, 'confirmar_clave'], `${ruta} ${JSON.stringify(cabeceras)}`);
      }
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 0, 'nada se guardó sin la contraseña');
    assert.equal((await peticionDirecta(servidor, { url: '/api/admin/claves', galleta: admin })).codigo, 200);
    // Con la contraseña otra vez, por el enlace público: se guarda (y se prueba gratis).
    const g = await pedir('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic('p') }, galleta: admin, cabeceras: { ...FUNNEL, ...CON_CLAVE } });
    assert.equal(g.codigo, 201, JSON.stringify(g.datos));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 1);
    // El dueño sí.
    const lista = await comoDueno('GET', '/api/admin/claves');
    assert.equal(lista.codigo, 200);
    assert.equal(lista.datos.duenoTailscale, 'junior@example.com');
    assert.deepEqual(lista.datos.almacen, { listo: true, motivo: null }, 'la llave ya existe: se guardó una clave');
    assert.deepEqual(lista.datos.grupos.map(g => [g.grupo, g.usos.map(u => u.uso)]), [['ia', ['ia_anthropic', 'ia_openai', 'ia_propia']], ['avisos', ['telegram_bot']]]);
    // Sin ser administrador, ni el dueño de Tailscale entra; sin la cabecera de OPORTIA, nada.
    const maria = await nuevaCuenta('maria');
    assert.equal((await pedir('GET', '/api/admin/claves', { galleta: maria.galleta, cabeceras: DUENO })).datos.error, 'solo_admin');
    assert.equal((await pedir('POST', '/api/admin/claves', { datos: {}, galleta: admin, cabeceras: DUENO, sinOportia: true })).datos.error, 'origen_no_valido');
    // Ninguna ruta borra.
    for (const ruta of ['/api/admin/claves', '/api/admin/claves/1', '/api/admin/ia']) {
      assert.ok([404, 405].includes((await comoDueno('DELETE', ruta)).codigo), ruta);
    }
  });
});

test('20. si el administrador no tiene cuenta de Tailscale guardada, la primera que llega se anota (en la auditoría) y otra después no entra', async () => {
  await conPlataforma(async ({ db, admin, pedir }) => {
    db.prepare("UPDATE usuarios SET tailscale_login = NULL WHERE nombre = 'junior'").run();
    const nueva = { 'Tailscale-User-Login': 'Junior.Nuevo@example.com' };
    assert.equal((await pedir('GET', '/api/admin/claves', { galleta: admin, cabeceras: nueva })).codigo, 200);
    assert.equal(db.prepare("SELECT tailscale_login FROM usuarios WHERE nombre = 'junior'").get().tailscale_login, 'Junior.Nuevo@example.com');
    const a = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'tailscale_login_anotado'").get();
    assert.deepEqual(JSON.parse(a.detalle), { antes: null, despues: 'Junior.Nuevo@example.com' });
    assert.equal((await pedir('GET', '/api/admin/claves', { galleta: admin, cabeceras: { 'Tailscale-User-Login': 'junior.nuevo@EXAMPLE.com' } })).codigo, 200, 'sin importar mayúsculas');
    // 0.12.3: otra cuenta de Tailscale ve las claves (es la sesión del administrador), pero no es la del dueño: cambiar
    // una pide la contraseña otra vez.
    assert.equal((await pedir('GET', '/api/admin/claves', { galleta: admin, cabeceras: DUENO })).codigo, 200);
    assert.equal((await pedir('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() }, galleta: admin, cabeceras: DUENO })).datos.error, 'confirmar_clave');
    assert.equal(db.prepare("SELECT tailscale_login FROM usuarios WHERE nombre = 'junior'").get().tailscale_login, 'Junior.Nuevo@example.com', 'no se pisa');
  });
});

// Ronda 1 de revisión, 0.12.3: un segundo administrador (con su sesión) también administra, también por el enlace
// público; lo delicado le pide SU contraseña otra vez (aunque venga con la cuenta de Tailscale del dueño) y queda un aviso.
test('20b. un segundo administrador administra con su sesión; lo delicado le pide su contraseña; nunca se le anota una cuenta de Tailscale', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno }) => {
    await encender(comoDueno);
    // Crear otro administrador: por el enlace público, con la contraseña otra vez; desde la cuenta del dueño, sin pedirla.
    for (const cabeceras of [FUNNEL, {}, OTRO_LOGIN]) {
      const r = await pedir('POST', '/api/admin/usuarios', { datos: { nombre: 'intruso', rol: 'admin' }, galleta: admin, cabeceras });
      assert.deepEqual([r.codigo, r.datos.error], [403, 'confirmar_clave'], JSON.stringify(cabeceras));
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE nombre = 'intruso'").get().n, 0);
    assert.equal((await pedir('GET', '/api/admin/usuarios', { galleta: admin, cabeceras: FUNNEL })).datos.permisos.admins, true);
    const creado = await comoDueno('POST', '/api/admin/usuarios', { datos: { nombre: 'ayudante', rol: 'admin' } });
    assert.equal(creado.codigo, 201);
    const entrada = await pedir('POST', '/api/entrar', { datos: { nombre: 'ayudante', clave: creado.datos.claveTemporal } });
    assert.equal((await pedir('POST', '/api/yo/clave', { datos: { actual: creado.datos.claveTemporal, nueva: CLAVE }, galleta: entrada.galleta })).codigo, 200);
    const ayudante = entrada.galleta;
    const SUYA = { 'X-Confirmar-Clave': Buffer.from(CLAVE).toString('base64') };
    for (const cabeceras of [OTRO_LOGIN, DUENO, FUNNEL]) {
      assert.equal((await pedir('GET', '/api/admin/claves', { galleta: ayudante, cabeceras })).codigo, 200);
      const r = await pedir('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic('q') }, galleta: ayudante, cabeceras });
      assert.deepEqual([r.codigo, r.datos.error], [403, 'confirmar_clave'], `con ${JSON.stringify(cabeceras)}: Tailscale del dueño no le sirve`);
    }
    const estado = await pedir('GET', '/api/admin/ia', { galleta: ayudante, cabeceras: OTRO_LOGIN });
    assert.equal(estado.datos.esDueno, true);
    const g = await pedir('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic('q') }, galleta: ayudante, cabeceras: { ...FUNNEL, ...SUYA } });
    assert.equal(g.codigo, 201);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave LIKE 'cambio_admin:clave_ia:%'").get().n >= 2, true, 'cada cambio deja un aviso');
    assert.equal(db.prepare("SELECT tailscale_login FROM usuarios WHERE nombre = 'ayudante'").get().tailscale_login, null);
    db.prepare("UPDATE usuarios SET tailscale_login = NULL WHERE nombre = 'junior'").run();
    await pedir('GET', '/api/admin/claves', { galleta: ayudante, cabeceras: OTRO_LOGIN });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE tailscale_login IS NOT NULL").get().n, 0, 'al ayudante nunca se le anota nada');
    db.prepare("UPDATE usuarios SET tailscale_login = 'junior@example.com' WHERE nombre = 'junior'").run();
    // El ayudante toca al dueño solo con su contraseña otra vez; el último administrador activo nunca se desactiva.
    const junior = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
    assert.equal((await pedir('POST', `/api/admin/usuarios/${junior}/reiniciar-clave`, { datos: {}, galleta: ayudante, cabeceras: DUENO })).datos.error, 'confirmar_clave');
    assert.equal(db.prepare("SELECT activo FROM usuarios WHERE id = ?").get(junior).activo, 1);
    assert.equal((await pedir('POST', '/api/admin/usuarios', { datos: { nombre: 'cliente.uno' }, galleta: ayudante, cabeceras: OTRO_LOGIN })).codigo, 201);
    // El dueño desactiva al ayudante: desde su cuenta de Tailscale sin más; por el enlace público, con su contraseña.
    const idAyudante = creado.datos.id;
    assert.equal((await pedir('POST', `/api/admin/usuarios/${idAyudante}/activo`, { datos: { activo: false }, galleta: admin, cabeceras: FUNNEL })).datos.error, 'confirmar_clave');
    assert.equal((await pedir('POST', `/api/admin/usuarios/${idAyudante}/activo`, { datos: { activo: false }, galleta: admin, cabeceras: { ...FUNNEL, ...SUYA } })).codigo, 200);
  });
});

// 0.12.3 (antes «20c»: con un tope de plan, el enlace público no creaba cuentas ni cambiaba planes): ahora sí, con la
// sesión del administrador. Lo que sigue protegiendo: la contraseña de otra persona pide la del administrador otra vez, y
// una cuenta tocada desde internet no gasta IA hasta «Permitir IA» (ronda 5, abajo).
test('20c. con un tope de plan mayor que US$0, el enlace público crea cuentas, cambia planes y reactiva; reiniciar pide la contraseña', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno, nuevaCuenta }) => {
    await encender(comoDueno);
    const maria = await nuevaCuenta('maria');
    assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topesPlanUsd: { pago: '0.01' } } })).codigo, 200);
    assert.equal((await pedir('GET', '/api/admin/usuarios', { galleta: admin, cabeceras: FUNNEL })).datos.permisos.cuentas, true);
    assert.equal((await pedir('POST', '/api/admin/usuarios', { datos: { nombre: 'nuevo.uno' }, galleta: admin, cabeceras: FUNNEL })).codigo, 201);
    assert.equal((await pedir('POST', `/api/admin/usuarios/${maria.id}/plan`, { datos: { plan: 'pago' }, galleta: admin, cabeceras: FUNNEL })).codigo, 200);
    assert.equal((await pedir('POST', `/api/admin/usuarios/${maria.id}/reiniciar-clave`, { datos: {}, galleta: admin, cabeceras: FUNNEL })).datos.error, 'confirmar_clave');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos_cuenta WHERE usuario_id = ?").get(maria.id).n, 0, 'sin la contraseña, nadie reinició la suya');
    assert.equal((await pedir('POST', `/api/admin/usuarios/${maria.id}/activo`, { datos: { activo: false }, galleta: admin, cabeceras: FUNNEL })).codigo, 200);
    assert.equal((await pedir('POST', `/api/admin/usuarios/${maria.id}/activo`, { datos: { activo: true }, galleta: admin, cabeceras: FUNNEL })).codigo, 200);
    // 0.12.3: lo que hace el administrador con su sesión no le quita a maria el permiso que tenía; una cuenta NUEVA creada
    // desde internet empieza sin él (hasta «Permitir IA»).
    const lista = (await comoDueno('GET', '/api/admin/usuarios')).datos.usuarios;
    assert.equal(lista.find(x => x.nombre === 'maria').ia.permitida, true);
    assert.equal(lista.find(x => x.nombre === 'nuevo.uno').ia.permitida, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas').get().n, 0, 'nada gastó');
  });
});

// Ronda 5 de revisión: lo de 20c solo mira los topes de AHORA. Con todos los topes de plan en US$0, una contraseña de
// administrador robada crea cuentas (o les pone plan, o reinicia la de una clienta) por el enlace público, y espera a que
// el dueño ponga un tope de plan más adelante. Se revisa al GASTAR: esas cuentas no gastan ni un centavo hasta que el
// dueño, desde su cuenta de Tailscale, les da permiso.
test('20. guardar y probar: solo lo público vuelve, la prueba es GRATIS (count_tokens / GET models) y cada respuesta tiene su motivo', async () => {
  await conPlataforma(async ({ db, falso, comoDueno }) => {
    // Las claves que nunca se guardan (ni siquiera se cifran: el archivo de la llave no se crea).
    for (const [valor, error] of [
      [['sk', 'ant', 'admin01', 'prueba'.padEnd(40, 'x')].join('-'), 'clave_admin'],
      [['sk', 'ant', 'oat01', 'prueba'.padEnd(40, 'x')].join('-'), 'clave_suscripcion'],
      [claveOpenai(), 'clave_otro_proveedor'],
      ['corta', 'clave_formato'],
    ]) {
      const r = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor } });
      assert.deepEqual([r.codigo, r.datos.error], [400, error]);
      assert.ok(!r.texto.includes(valor));
    }
    assert.equal((await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'telegram_bot', valor: claveAnthropic() } })).datos.error, 'clave_formato');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 0);
    // Una buena: 201, solo lo público, y la prueba gratis (count_tokens con el modelo configurado).
    const g = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() } });
    assert.equal(g.codigo, 201);
    assert.ok(!g.texto.includes(claveAnthropic()) && !g.texto.includes('cifrado') && !g.texto.includes('"ref"'));
    assert.deepEqual([g.datos.secreto.final, g.datos.secreto.estado, g.datos.secreto.prueba, g.datos.prueba.motivo, g.datos.iaApagada], [claveAnthropic().slice(-4), 'activa', 'ok', 'ok', false]);
    assert.deepEqual(falso.peticiones.map(p => [p.metodo, p.ruta, p.cuerpo?.model]), [['POST', '/v1/messages/count_tokens', 'claude-haiku-5-5']]);
    // ChatGPT: solo GET /v1/models/<modelo>.
    const o = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_openai', valor: claveOpenai() } });
    assert.equal(o.datos.prueba.motivo, 'ok');
    assert.deepEqual(falso.peticiones.slice(1).map(p => [p.metodo, p.ruta]), [['GET', '/v1/models']]);
    assert.ok(!falso.peticiones.some(p => p.ruta === '/v1/messages' || p.ruta === '/v1/responses'), 'la prueba nunca gasta');
    // Lo que dice cada respuesta de la prueba.
    const id = g.datos.secreto.id;
    for (const [escena, motivo] of [[{ tipo: 'status', status: 401 }, 'clave_no_valida'], ['sin_credito_400', 'sin_credito'], ['limite_gasto_400', 'limite_gasto_proveedor'], [{ tipo: 'status', status: 404 }, 'modelo_no_disponible'], ['limite_429', 'limite_proveedor'], ['otro_400', 'pedido_no_valido'], ['redirige', 'redireccion'], [{ tipo: 'status', status: 529 }, 'error_proveedor'], ['ok', 'ok']]) {
      falso.siguiente(escena);
      const r = await comoDueno('POST', `/api/admin/claves/${id}/probar`, { datos: {} });
      assert.deepEqual([r.codigo, r.datos.prueba.motivo], [200, motivo], String(escena.tipo ?? escena));
      assert.equal(r.datos.secreto.prueba, motivo);
    }
    assert.equal(falso.segundo.peticiones.length, 0);
    assert.equal((await comoDueno('POST', '/api/admin/claves/99999/probar', { datos: {} })).codigo, 404);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'clave_probada'").get().n, 11);
  });
});

// Ronda 2 de revisión: si falta el nombre final de la llave con claves guardadas, la pantalla no ofrece pegar y la ruta
// no crea una llave nueva (503): la recuperación por consola sigue sirviendo.
test('20d. falta el archivo de la llave con claves guardadas: GET dice llave_falta, pegar responde 503 y nada se crea', async () => {
  const { readdirSync, renameSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { rutaLlave, recuperarLlave, estadoLlave } = await import('../src/claves/cifrado.js');
  await conPlataforma(async ({ db, config, comoDueno }) => {
    assert.deepEqual((await comoDueno('GET', '/api/admin/claves')).datos.almacen, { listo: true, motivo: 'llave_no_existe' });
    assert.equal((await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() } })).codigo, 201);
    assert.equal((await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_openai', valor: claveOpenai() } })).codigo, 201);
    const huella = estadoLlave(config).huella;
    const ruta = rutaLlave(config);
    renameSync(ruta, join(dirname(ruta), 'movida'));
    const lista = await comoDueno('GET', '/api/admin/claves');
    assert.deepEqual(lista.datos.almacen, { listo: false, motivo: 'llave_falta' });
    const antes = readdirSync(dirname(ruta)).sort();
    const r = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic('n') } });
    assert.deepEqual([r.codigo, r.datos.error], [503, 'almacen_no_disponible']);
    assert.deepEqual(readdirSync(dirname(ruta)).sort(), antes, 'ninguna llave nueva');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 2);
    assert.equal(recuperarLlave(config, { huellas: [huella] }).recuperada, true, 'la consola la recupera');
    const despues = await comoDueno('GET', '/api/admin/claves');
    assert.deepEqual(despues.datos.almacen, { listo: true, motivo: null });
    assert.ok(despues.datos.grupos.flatMap(g => g.usos).filter(u => u.activa).every(u => u.activa.legible === true), 'las dos claves se leen otra vez');
  });
});

test('20. «Probar y reanudar» quita la pausa del dueño y cierra su aviso; la prueba gratis también funciona en modo seguro', async () => {
  await conPlataforma(async ({ db, comoDueno, falso }) => {
    const s = await encender(comoDueno);
    db.prepare("UPDATE secretos SET pausa_motivo = 'sin_credito', pausa_desde = ?, pausa_hasta = NULL WHERE id = ?").run(new Date().toISOString(), s.id);
    db.prepare("INSERT INTO avisos (clave, nivel, detalle, creado_en, ultima_vez) VALUES ('ia_proveedor:anthropic', 'grave', '{}', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
    ponerModoSeguro(db, { activo: true, origen: 'admin' });
    // Probar sin reanudar: la pausa sigue.
    let r = await comoDueno('POST', `/api/admin/claves/${s.id}/probar`, { datos: { reanudar: false } });
    assert.deepEqual([r.datos.prueba.motivo, r.datos.reanudada, r.datos.secreto.pausa?.motivo], ['ok', false, 'sin_credito']);
    // Si la prueba no pasa, no se reanuda.
    falso.siguiente({ tipo: 'status', status: 401 });
    r = await comoDueno('POST', `/api/admin/claves/${s.id}/probar`, { datos: { reanudar: true } });
    assert.deepEqual([r.datos.prueba.motivo, r.datos.reanudada], ['clave_no_valida', false]);
    r = await comoDueno('POST', `/api/admin/claves/${s.id}/probar`, { datos: { reanudar: true } });
    assert.deepEqual([r.datos.prueba.motivo, r.datos.reanudada, r.datos.secreto.pausa], ['ok', true, null]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'ia_proveedor:anthropic' AND resuelto_en IS NULL").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'clave_reanudada'").get().n, 1);
    assert.equal((await comoDueno('POST', `/api/admin/claves/${s.id}/probar`, { datos: { reanudar: 'si' } })).codigo, 400);
  });
});

test('20. las acciones de claves tienen un tope (20 cada 10 minutos): la 21.ª responde 429', async () => {
  await conPlataforma(async ({ comoDueno }) => {
    const g = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() } });
    for (let i = 0; i < 19; i += 1) assert.equal((await comoDueno('POST', `/api/admin/claves/${g.datos.secreto.id}/probar`, { datos: {} })).codigo, 200);
    assert.equal((await comoDueno('POST', `/api/admin/claves/${g.datos.secreto.id}/probar`, { datos: {} })).codigo, 429);
  }, { limitesClaves: { acciones: new Limitador({ maximo: 20, ventanaMs: 600_000 }) } });
});

// ---------- 21. Los ajustes: encender, apagar, topes ----------

test('21. encender necesita clave probada, tope y precio; la ayuda necesita la IA; apagar se puede por el enlace público y no toca la ayuda', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno }) => {
    let r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true } });
    assert.deepEqual([r.codigo, r.datos.error, r.datos.faltan], [409, 'ia_falta', ['clave', 'tope']]);
    r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { ayudaProyectos: true } });
    assert.deepEqual([r.codigo, r.datos.faltan], [409, ['encendida']]);
    for (const tope of ['100.01', '1.234', '-1', 'abc', 101, '']) {
      const t = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: tope } });
      assert.deepEqual([t.codigo, t.datos.error], [400, 'tope_no_valido'], String(tope));
    }
    assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topesPlanUsd: { prueba: '20.01' } } })).datos.error, 'tope_no_valido');
    assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topesPlanUsd: { inventado: '1' } } })).datos.error, 'tope_no_valido');
    assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { otraCosa: true } })).datos.error, 'datos_no_validos');
    // ChatGPT: su precio no está confirmado, no se puede activar para gastar.
    r = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { usar: { openai: true } } });
    assert.deepEqual([r.codigo, r.datos.faltan], [409, ['precio']]);
    await encender(comoDueno);
    let estado = (await comoDueno('GET', '/api/admin/ia')).datos;
    assert.deepEqual([estado.encendida, estado.ayudaProyectos, estado.estado, estado.topeGeneralMicro, estado.faltan], [true, true, 'encendida', 2_000_000, []]);
    // 0.12.3: por el enlace público, el administrador con su sesión ve y cambia todo (antes solo veía y apagaba).
    const publico = await pedir('GET', '/api/admin/ia', { galleta: admin, cabeceras: FUNNEL });
    assert.equal(publico.codigo, 200);
    assert.equal(publico.datos.esDueno, true);
    for (const campo of ['faltan', 'proveedores', 'topesPlanMicro', 'tipicoMicro']) assert.ok(campo in publico.datos, campo);
    assert.equal((await pedir('POST', '/api/admin/ia/ajustes', { datos: { encendida: true }, galleta: admin, cabeceras: FUNNEL })).codigo, 200);
    const apagada = await pedir('POST', '/api/admin/ia/apagar', { datos: {}, galleta: admin, cabeceras: FUNNEL });
    assert.deepEqual([apagada.codigo, apagada.datos.encendida, apagada.datos.ayudaProyectos], [200, false, true], 'apagar no toca la ayuda');
    // Encender otra vez no pide confirmar la ayuda de nuevo (cada uso igual se confirma con su precio).
    estado = (await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true } })).datos;
    assert.deepEqual([estado.encendida, estado.ayudaProyectos], [true, true]);
    // Cada cambio, en la auditoría, con lo de antes y lo de después (nunca una clave).
    const cambios = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'ia_config' ORDER BY id").all().map(f => JSON.parse(f.detalle));
    assert.ok(cambios.length >= 4);
    for (const c of cambios) assert.ok(c.antes && c.despues && c.origen);
    assert.deepEqual(cambios.at(-2), { antes: { encendida: true }, despues: { encendida: false }, origen: 'pantalla' });
    // Desactivar la única clave con la IA encendida: la IA se apaga sola.
    const clave = db.prepare("SELECT id FROM secretos WHERE estado = 'activa'").get().id;
    const d = await comoDueno('POST', `/api/admin/claves/${clave}/activa`, { datos: { activa: false } });
    assert.deepEqual([d.codigo, d.datos.iaApagada, d.datos.secreto.estado], [200, true, 'desactivada']);
    assert.equal((await comoDueno('GET', '/api/admin/ia')).datos.encendida, false);
    // Activarla otra vez no enciende la IA (hace falta un «Encender» nuevo).
    const a = await comoDueno('POST', `/api/admin/claves/${clave}/activa`, { datos: { activa: true } });
    assert.deepEqual([a.datos.iaApagada, a.datos.secreto.estado], [false, 'activa']);
    assert.equal((await comoDueno('GET', '/api/admin/ia')).datos.encendida, false);
    assert.equal((await comoDueno('POST', `/api/admin/claves/${clave}/activa`, { datos: { activa: 'no' } })).codigo, 400);
    // Cambiar la clave con la IA encendida también la apaga (la nueva todavía no estaba probada).
    await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true } });
    const nueva = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic('n') } });
    assert.deepEqual([nueva.datos.iaApagada, nueva.datos.prueba.motivo], [true, 'ok']);
    assert.equal(db.prepare('SELECT estado FROM secretos WHERE id = ?').get(clave).estado, 'reemplazada', 'la vieja no se borra');
  });
});

// ---------- 22. El detalle del gasto ----------

test('22. el detalle del gasto: las sumas cuadran con las filas, otra cuenta solo con números, y el enlace público solo ve el total', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno, nuevaCuenta }) => {
    await encender(comoDueno);
    const maria = await nuevaCuenta('maria');
    // 0.8.0: los proyectos se quitaron; una fila vieja de la base (escrita a mano) sigue contando en el detalle.
    const espacioMaria = db.prepare("SELECT m.espacio_id AS e FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE u.nombre = 'maria'").get().e;
    db.prepare("INSERT INTO proyectos (espacio_id, numero, nombre, creado_en, actualizado_en) VALUES (?, 1, ?, 'x', 'x')").run(espacioMaria, TALLER);
    const proyecto = db.prepare('SELECT id, espacio_id FROM proyectos').get();
    const mes = mesCobro(Date.now());
    const poner = (estado, reservado, costo, extra = {}) => db.prepare(`INSERT INTO ia_llamadas (mes, estado, resultado, proposito, proveedor, modelo, espacio_id, proyecto_id, reservado_micro, costo_micro, creada_en, detalle)
      VALUES (?, ?, ?, 'interpretar', 'anthropic', 'claude-haiku-5-5', ?, ?, ?, ?, ?, ?)`).run(mes, estado, estado === 'reservada' ? null : 'ok', extra.espacio ?? proyecto.espacio_id, extra.proyecto ?? proyecto.id, reservado, costo, new Date().toISOString(), extra.detalle ?? null);
    poner('hecha', 2180, 450, { detalle: '{"geo":"us"}' });
    poner('reservada', 2180, null);
    poner('desconocida', 2180, 2180);
    poner('fallida', 2180, 0);
    db.prepare("INSERT INTO ia_bloqueos (mes, ambito, motivo, proposito, veces, primera_vez, ultima_vez) VALUES (?, 'general', 'tope_general', 'interpretar', 3, 'x', 'x')").run(mes);
    const r = await comoDueno('GET', `/api/admin/ia/consumo?mes=${mes}`);
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos.general, { usadoMicro: 450 + 2180 + 2180, apartadoMicro: 2180, topeMicro: 2_000_000, pct: 0 });
    assert.deepEqual(r.datos.porCuenta.map(c => [c.cuenta, c.propia, c.plan, c.usadoMicro, c.n]), [[proyecto.espacio_id, false, 'prueba', 4810, 4]]);
    assert.deepEqual(r.datos.porProyecto, [{ proyecto: 1, cuenta: proyecto.espacio_id, propia: false, usadoMicro: 4810, n: 4 }]);
    assert.deepEqual(r.datos.bloqueos, [{ motivo: 'tope_general', veces: 3 }]);
    assert.equal(r.datos.ultimas.length, 4);
    assert.equal(r.datos.ultimas.at(-1).geo, 'us');
    assert.ok(!r.texto.includes('taller') && !r.texto.includes('Minaslandia'), 'nunca el nombre ni el texto de un proyecto');
    assert.deepEqual(r.datos.meses, [{ mes, usadoMicro: 4810, n: 4 }]);
    // 0.12.3: por el enlace público, el administrador ve también el detalle (nunca una clave entera).
    const publico = await pedir('GET', '/api/admin/ia', { galleta: admin, cabeceras: FUNNEL });
    assert.equal(publico.datos.usadoMicro, 4810);
    assert.ok(!publico.texto.includes(claveAnthropic()));
    assert.equal((await pedir('GET', '/api/admin/ia/consumo', { galleta: admin, cabeceras: FUNNEL })).codigo, 200);
  });
});

// ---------- 23. La clave nunca se filtra ----------

test('23. la clave nunca aparece: ni en respuestas, ni en la consola, ni en ninguna fila o archivo de la base (tampoco con un valor con salto de línea)', async () => {
  await conPlataforma(async ({ db, config, falso, comoDueno }) => {
    let respuestas = '';
    const escrito = await capturarConsola(async () => {
      const g = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: `  ${claveAnthropic()}\n` } });
      respuestas += g.texto;
      for (const escena of [{ tipo: 'status', status: 401 }, 'eco_clave', 'sin_credito_texto', 'ok']) {
        falso.siguiente(escena);
        respuestas += (await comoDueno('POST', `/api/admin/claves/${g.datos.secreto.id}/probar`, { datos: { reanudar: true } })).texto;
      }
      respuestas += (await comoDueno('GET', '/api/admin/claves')).texto;
      respuestas += (await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: '2', encendida: true, ayudaProyectos: true } })).texto;
      respuestas += (await comoDueno('GET', '/api/admin/ia')).texto;
      // El camino pagado (como el trabajador), con cada respuesta rara del proveedor.
      const escritor = crearEscritor(db, { registro: SILENCIO, dormir: async () => {} });
      const espacioId = db.prepare('SELECT espacio_id FROM miembros LIMIT 1').get().espacio_id;
      for (const escena of ['ok', { tipo: 'status', status: 401 }, { tipo: 'status', status: 500 }, 'json_roto', 'eco_clave', 'sin_credito_texto', 'redirige']) {
        db.prepare("UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL, pausa_hasta = NULL, prueba = 'ok'").run();
        falso.siguiente(escena);
        const n = falso.peticiones.length;
        const r = await crearClienteIA({ db, config, escritor }).pedir({ proposito: 'interpretar', espacioId, sistema: 'S', texto: 'T' });
        assert.equal(falso.peticiones.length, n + 1, `${escena.tipo ?? escena}: llamó (${r.motivo ?? 'ok'})`);
      }
      // Un valor con salto de línea que, saltándose la revisión (solo en esta prueba), llega a la cabecera: Node lo
      // rechaza con un error que TRAE el valor; OPORTIA nunca lee ese texto.
      db.prepare("UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL, pausa_hasta = NULL, prueba = 'ok'").run();
      const fila = db.prepare("SELECT id, ref, uso FROM secretos WHERE estado = 'activa'").get();
      const partes = cifrar(leerLlave(config).llave, `${claveAnthropic('q')}\nX: y`, { ref: fila.ref, uso: fila.uso });
      db.prepare('UPDATE secretos SET cifrado = ?, iv = ?, sello = ? WHERE id = ?').run(partes.cifrado, partes.iv, partes.sello, fila.id);
      const antes = falso.peticiones.length;
      const r = await crearClienteIA({ db, config, escritor, validar: (uso, v) => v }).pedir({ proposito: 'interpretar', espacioId, sistema: 'S', texto: 'T' });
      assert.deepEqual([r.usada, r.motivo], [false, 'pedido_no_valido']);
      assert.equal(falso.peticiones.length, antes, 'no salió nada');
    });
    for (const k of [claveAnthropic(), claveAnthropic('q')]) {
      assert.ok(!respuestas.includes(k), 'en ninguna respuesta');
      assert.ok(!escrito.includes(k), 'en ninguna línea de la consola');
      assert.deepEqual(buscarEnTodo(db, config, k), [], 'en ninguna fila ni archivo de la base');
    }
    assert.equal(falso.peticiones.find(p => p.cabeceras['x-api-key'])?.cabeceras['x-api-key'], claveAnthropic(), 'sí llegó al proveedor (falso): sin espacios alrededor');
    assert.ok(existsSync(join(dirname(config.archivoBase), 'oportia-llave-secretos')));
  });
});

test('sin la configuración del servidor, las rutas de claves y de IA responden 503 (nunca crean una llave donde no deben)', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const admin = (await pedirHttp(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    for (const [metodo, ruta, datos] of [['GET', '/api/admin/claves'], ['POST', '/api/admin/claves', { uso: 'ia_anthropic', valor: claveAnthropic() }], ['GET', '/api/admin/ia'], ['POST', '/api/admin/ia/apagar', {}]]) {
      const r = await pedirHttp(base, metodo, ruta, { datos, galleta: admin, cabeceras: DUENO });
      assert.deepEqual([r.codigo, r.datos.error], [503, 'almacen_no_disponible'], `${metodo} ${ruta}`);
    }
  });
  db.close();
});

// ---------- 0.14.2: ChatGPT por las pantallas (el camino real del dueño), sus rutas y las del chat ----------
test('0.14.2: pegar la clave de ChatGPT → probar → tope → encender: trabaja ChatGPT (sin Claude); modelos, precios, dibujos y el chat por HTTP', async () => {
  await conPlataforma(async ({ comoDueno, falso, pedir }) => {
    const o = await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_openai', valor: claveOpenai() } });
    assert.equal(o.codigo, 201, o.texto);
    assert.equal(o.datos.prueba.motivo, 'ok');
    assert.deepEqual(falso.peticiones.map(p => [p.metodo, p.ruta]), [['GET', '/v1/models']], 'gratis: solo la lista de modelos');
    let p = await comoDueno('GET', '/api/admin/ia/proveedores');
    assert.equal(p.codigo, 200);
    const gpt = p.datos.proveedores.find(x => x.id === 'openai');
    assert.deepEqual([gpt.usar, gpt.clave, gpt.modeloEscribir, gpt.modelo, gpt.modeloImagen], [true, true, 'gpt-6', 'gpt-6-mini', 'gpt-image-2'], 'pasó la prueba: queda en «Usar» con sus modelos');
    assert.ok(gpt.precios.every(x => x.porDefecto === true) && gpt.vistos.includes('gpt-6-nano'));
    assert.ok(!p.texto.includes(claveOpenai()));
    assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: '20' } })).codigo, 200);
    const e = await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true } });
    assert.equal(e.codigo, 200, e.texto);
    const ia = await comoDueno('GET', '/api/admin/ia');
    assert.deepEqual([ia.datos.encendida, ia.datos.proveedorActivo, ia.datos.preferido], [true, 'openai', 'auto']);
    // Precios, quién escribe, el orden y los dibujos.
    p = await comoDueno('POST', '/api/admin/ia/precios', { datos: { proveedor: 'openai', modelo: 'gpt-6', entrada: '1,25', cacheLectura: '0.125', salida: '10' } });
    assert.equal(p.codigo, 200, p.texto);
    assert.deepEqual(p.datos.proveedores.find(x => x.id === 'openai').precios.find(x => x.modelo === 'gpt-6'), { modelo: 'gpt-6', ...p.datos.proveedores.find(x => x.id === 'openai').precios.find(x => x.modelo === 'gpt-6'), entradaUsd: '1.25', porDefecto: false });
    assert.equal((await comoDueno('POST', '/api/admin/ia/precios', { datos: { proveedor: 'openai', modelo: 'gpt-6', entrada: 'gratis', cacheLectura: '0', salida: '1' } })).datos.error, 'precio_no_valido');
    p = await comoDueno('POST', '/api/admin/ia/proveedores', { datos: { preferido: 'openai', orden: ['openai', 'anthropic', 'propia'] } });
    assert.deepEqual([p.codigo, p.datos.preferido, p.datos.orden[0]], [200, 'openai', 'openai']);
    assert.equal((await comoDueno('POST', '/api/admin/ia/proveedores', { datos: { basePropia: 'http://10.0.0.1/v1' } })).datos.error, 'base_no_valida');
    assert.equal((await comoDueno('POST', '/api/admin/ia/proveedores', { datos: { algo: 1 } })).codigo, 400);
    p = await comoDueno('POST', '/api/admin/ia/dibujos', { datos: { activa: true, topeUsd: '3,50' } });
    assert.deepEqual([p.datos.dibujos.activa, p.datos.dibujos.topeMicro], [true, 3_500_000]);
    // El chat: un mensaje (sin IA todavía: lo contesta el trabajador), un pedido prohibido (gratis) y la pausa.
    let c = await comoDueno('GET', '/api/admin/academia/chat');
    assert.equal(c.codigo, 200);
    assert.ok(c.datos.estimado.micro > 0 && c.datos.estimado.proveedor === 'openai', 'lo que cuesta un mensaje');
    c = await comoDueno('POST', '/api/admin/academia/chat', { datos: { texto: 'cambia el código de la app' } });
    assert.equal(c.datos.mensajes.at(-1).rechazo, 'codigo');
    c = await comoDueno('POST', '/api/admin/academia/chat', { datos: { texto: 'explica mejor el tema de hipoxia' } });
    assert.deepEqual([c.codigo, c.datos.pendiente], [200, true]);
    assert.equal((await comoDueno('POST', '/api/admin/academia/chat', { datos: { texto: 'otra cosa' } })).datos.error, 'chat_ocupado');
    assert.equal((await comoDueno('POST', '/api/admin/academia/fabrica/pausa', { datos: { pausada: true } })).codigo, 200);
    assert.equal((await comoDueno('POST', '/api/admin/academia/chat', { datos: { texto: 'algo' } })).datos.error, 'ia_en_pausa');
    const h = await comoDueno('GET', '/api/admin/academia/ia-hizo');
    assert.equal(h.codigo, 200);
    assert.equal(h.datos.numeros.pausada, true);
    assert.equal(falso.peticiones.filter(x => x.ruta === '/v1/responses').length, 0, 'el servidor web nunca llama a la IA');
    // Un alumno (sin sesión de administrador) no entra.
    assert.equal((await pedir('GET', '/api/admin/academia/chat')).codigo, 401);
  });
});
