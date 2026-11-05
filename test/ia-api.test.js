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
import { nuevaVersion, detalleProyecto, MAXIMO_VERSIONES } from '../src/proyectos/proyectos.js';
import { precioDe, reservaMicro } from '../src/ia/precios.js';
import { armarPeticion } from '../src/ia/interpretar.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { leerLlave, cifrar } from '../src/claves/cifrado.js';
import { mesCobro } from '../src/ia/presupuesto.js';
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
        const creada = await pedir('POST', '/api/admin/usuarios', { datos: { nombre }, galleta: admin });
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

test('20. claves y ajustes: nunca por el enlace público; solo con la cuenta de Tailscale del dueño (ni otro equipo ni la 100.x directa)', async () => {
  await conPlataforma(async ({ db, servidor, admin, pedir, comoDueno, nuevaCuenta }) => {
    const rutas = [
      ['GET', '/api/admin/claves'], ['POST', '/api/admin/claves', { uso: 'ia_anthropic', valor: claveAnthropic() }], ['POST', '/api/admin/claves/1/probar', {}],
      ['POST', '/api/admin/claves/1/activa', { activa: false }], ['POST', '/api/admin/ia/ajustes', { topeGeneralUsd: '1' }], ['GET', '/api/admin/ia/consumo'],
    ];
    for (const [metodo, ruta, datos] of rutas) {
      for (const cabeceras of [{}, FUNNEL, { ...DUENO, ...FUNNEL }]) {
        const r = await pedir(metodo, ruta, { datos, galleta: admin, cabeceras });
        assert.equal(r.codigo, 403, `${metodo} ${ruta} ${JSON.stringify(cabeceras)}`);
        assert.equal(r.datos.error, 'solo_desde_tailnet');
      }
      if (ruta === '/api/admin/ia/consumo') continue;
      const otro = await pedir(metodo, ruta, { datos, galleta: admin, cabeceras: OTRO_LOGIN });
      assert.deepEqual([otro.codigo, otro.datos.error], [403, 'solo_dueno_tailscale'], `${metodo} ${ruta}: otra cuenta de Tailscale`);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n, 0, 'nada se guardó');
    // Directa a la 100.x: es de la red de Tailscale (ve el detalle del gasto), pero no dice de quién es: no ve las claves.
    assert.deepEqual([(await peticionDirecta(servidor, { url: '/api/admin/claves', galleta: admin })).datos.error], ['solo_dueno_tailscale']);
    assert.equal((await peticionDirecta(servidor, { url: '/api/admin/ia/consumo', galleta: admin })).codigo, 200);
    assert.equal((await pedir('GET', '/api/admin/ia/consumo', { galleta: admin, cabeceras: OTRO_LOGIN })).codigo, 200);
    // El dueño sí.
    const lista = await comoDueno('GET', '/api/admin/claves');
    assert.equal(lista.codigo, 200);
    assert.equal(lista.datos.duenoTailscale, 'junior@example.com');
    assert.deepEqual(lista.datos.almacen, { listo: true, motivo: 'llave_no_existe' });
    assert.deepEqual(lista.datos.grupos.map(g => [g.grupo, g.usos.map(u => u.uso)]), [['ia', ['ia_anthropic', 'ia_openai']]]);
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
    assert.equal((await pedir('GET', '/api/admin/claves', { galleta: admin, cabeceras: DUENO })).datos.error, 'solo_dueno_tailscale');
  });
});

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
    assert.equal((await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'telegram_bot', valor: claveAnthropic() } })).datos.error, 'uso_no_valido');
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
    assert.deepEqual(falso.peticiones.slice(1).map(p => [p.metodo, p.ruta]), [['GET', '/v1/models/gpt-6-luna']]);
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
    // Por el enlace público: se ve el estado y se puede apagar, pero nada más.
    const publico = await pedir('GET', '/api/admin/ia', { galleta: admin, cabeceras: FUNNEL });
    assert.equal(publico.codigo, 200);
    assert.equal(publico.datos.esDueno, false);
    for (const campo of ['faltan', 'proveedores', 'topesPlanMicro', 'tipicoMicro']) assert.ok(!(campo in publico.datos), campo);
    assert.equal((await pedir('POST', '/api/admin/ia/ajustes', { datos: { encendida: true }, galleta: admin, cabeceras: FUNNEL })).codigo, 403);
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

// ---------- 19. La ayuda en un proyecto, por las rutas ----------

test('19. la ayuda en un proyecto: el precio que se ve es el que se aparta; la cuenta del administrador solo desde Tailscale; la fila', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno, despertares, nuevaCuenta }) => {
    const creado = await pedir('POST', '/api/proyectos', { datos: { instrucciones: TALLER }, galleta: admin });
    assert.equal(creado.codigo, 201);
    // Con la IA apagada: una sola línea para el administrador (sin botón).
    let g = await comoDueno('GET', '/api/proyectos/1/ayuda-ia');
    assert.deepEqual([g.datos.disponible, g.datos.motivo, g.datos.esAdmin], [false, 'ia_apagada', true]);
    await encender(comoDueno, { ayuda: false });
    g = await comoDueno('GET', '/api/proyectos/1/ayuda-ia');
    assert.deepEqual([g.datos.disponible, g.datos.motivo], [false, 'ayuda_no_activada']);
    assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: 5000 } })).datos.error, 'ia_no_disponible');
    await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { ayudaProyectos: true } });
    g = await comoDueno('GET', '/api/proyectos/1/ayuda-ia');
    assert.equal(g.datos.disponible, true, g.texto);
    const version = detalleProyecto(db, db.prepare('SELECT espacio_id FROM proyectos').get().espacio_id, 1).pendiente;
    const esperado = reservaMicro(HAIKU, { entradaMax: armarPeticion(version, 'es').entradaMax, salidaMax: 2048 });
    assert.deepEqual([g.datos.maximoMicro, g.datos.proveedor, g.datos.modelo, g.datos.version, g.datos.tipicoMicro, g.datos.topeMicro], [esperado, 'anthropic', 'claude-haiku-5-5', 1, 500, 2_000_000]);
    assert.ok(esperado > 1000 && esperado < 5000, `como máximo ${esperado} µUSD`);
    // Por el enlace público: no (la cuenta del administrador se paga con el tope general).
    const publico = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: admin, cabeceras: FUNNEL });
    assert.deepEqual([publico.datos.disponible, publico.datos.motivo, publico.datos.esAdmin, 'maximoMicro' in publico.datos], [false, 'solo_tailnet', true, false]);
    assert.equal((await pedir('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado }, galleta: admin, cabeceras: FUNNEL })).datos.error, 'solo_desde_tailnet');
    // El precio cambió (la persona vio uno menor): 409 con el nuevo, y la pantalla vuelve a preguntar.
    let p = await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado - 1 } });
    assert.deepEqual([p.codigo, p.datos.error, p.datos.maximoMicro], [409, 'precio_cambio', esperado]);
    assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: '5000' } })).codigo, 400);
    assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/2/ayuda-ia', { datos: { maximoMicro: esperado } })).datos.error, 'version_no_pendiente');
    assert.equal((await comoDueno('POST', '/api/proyectos/7/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado } })).codigo, 404);
    // En modo seguro, no (el trabajador está apagado).
    ponerModoSeguro(db, { activo: true, origen: 'admin' });
    assert.equal((await comoDueno('GET', '/api/proyectos/1/ayuda-ia')).datos.motivo, 'trabajo_en_pausa');
    assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado } })).datos.error, 'trabajo_en_pausa');
    ponerModoSeguro(db, { activo: false, origen: 'admin' });
    // Ahora sí: 202, a la fila (sin proyecto en la tarea), y se despierta al trabajador.
    p = await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado } });
    assert.equal(p.codigo, 202, p.texto);
    const tarea = db.prepare('SELECT * FROM tareas WHERE id = ?').get(p.datos.tarea.id);
    assert.deepEqual([tarea.tipo, tarea.estado, tarea.proyecto_id, tarea.programa], ['ia.interpretar', 'lista', null, `ia.interpretar:p${db.prepare('SELECT id FROM proyectos').get().id}`]);
    const datos = JSON.parse(tarea.datos);
    assert.deepEqual([datos.proyecto, datos.version, datos.maximoMicro, datos.idioma], [1, 1, esperado, 'es']);
    assert.equal(despertares.length, 1);
    assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado } })).datos.error, 'ya_hay_otra_en_marcha');
    g = await comoDueno('GET', '/api/proyectos/1/ayuda-ia');
    assert.deepEqual(g.datos.tarea, { id: tarea.id, estado: 'lista', resultado: null });
    // Otra cuenta no ve ni pide la ayuda de este proyecto (su proyecto 1 no existe).
    const maria = await nuevaCuenta('maria');
    assert.equal((await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: maria.galleta })).codigo, 404);
    // Alguien que solo puede ver (lector) no la pide.
    const lector = await nuevaCuenta('lector');
    db.prepare("UPDATE miembros SET rol = 'lector', espacio_id = (SELECT espacio_id FROM miembros WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre = 'junior')) WHERE usuario_id = ?").run(lector.id);
    assert.equal((await pedir('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: esperado }, galleta: lector.galleta, cabeceras: DUENO })).datos.error, 'solo_lectura');
  });
});

test('19. papelera y 100 versiones: no se ofrece ni se acepta; y el tope de pedidos (10 cada 10 minutos)', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno }) => {
    await encender(comoDueno);
    await pedir('POST', '/api/proyectos', { datos: { instrucciones: TALLER }, galleta: admin });
    await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin });
    const espacioId = db.prepare('SELECT espacio_id FROM proyectos LIMIT 1').get().espacio_id;
    const { configuracion } = detalleProyecto(db, espacioId, 2).pendiente;
    for (let i = 1; i < MAXIMO_VERSIONES; i += 1) nuevaVersion(db, { espacioId, proyectoId: 2, usuarioId: 1, instrucciones: PANELES, configuracion, origen: 'campos' });
    assert.equal((await comoDueno('GET', '/api/proyectos/2/ayuda-ia')).datos.motivo, 'demasiadas_versiones');
    assert.equal((await comoDueno('POST', `/api/proyectos/2/versiones/${MAXIMO_VERSIONES}/ayuda-ia`, { datos: { maximoMicro: 5000 } })).datos.error, 'demasiadas_versiones');
    assert.equal((await pedir('POST', '/api/proyectos/1/papelera', { datos: { enPapelera: true }, galleta: admin })).codigo, 200);
    assert.equal((await comoDueno('GET', '/api/proyectos/1/ayuda-ia')).datos.motivo, 'en_papelera');
    assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: 5000 } })).datos.error, 'en_papelera');
    // El tope: 10 pedidos cada 10 minutos por persona (ya van 2).
    const codigos = [];
    for (let i = 0; i < 9; i += 1) codigos.push((await comoDueno('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: 5000 } })).codigo);
    assert.deepEqual(codigos.slice(-1), [429]);
    assert.equal(codigos.filter(c => c === 429).length, 1);
  });
});

test('19. otra cuenta: sin presupuesto de IA solo recibe { disponible: false } (nada del dueño); con tope, solo motivos suyos', async () => {
  await conPlataforma(async ({ db, comoDueno, pedir, nuevaCuenta }) => {
    const s = await encender(comoDueno);
    const maria = await nuevaCuenta('maria');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: TALLER }, galleta: maria.galleta })).codigo, 201);
    // Tope de su plan en US$0 (lo normal): solo { disponible: false }, también con la clave del dueño sin saldo.
    let g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: maria.galleta });
    assert.deepEqual(g.datos, { disponible: false });
    db.prepare("UPDATE secretos SET pausa_motivo = 'sin_credito', pausa_desde = ?, pausa_hasta = NULL WHERE id = ?").run(new Date().toISOString(), s.id);
    await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topesPlanUsd: { prueba: '1' } } });
    g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: maria.galleta });
    assert.deepEqual(g.datos, { disponible: false }, 'la clave del dueño en pausa no se cuenta');
    assert.equal((await pedir('POST', '/api/proyectos/1/versiones/1/ayuda-ia', { datos: { maximoMicro: 5000 }, galleta: maria.galleta })).datos.error, 'ia_no_disponible');
    // Con tope y la clave lista: ve su precio, su tope y su gasto; nunca el del dueño.
    db.prepare('UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL WHERE id = ?').run(s.id);
    const mes = mesCobro(Date.now());
    const espacioAdmin = db.prepare("SELECT espacio_id FROM miembros WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre = 'junior')").get().espacio_id;
    for (let i = 0; i < 3; i += 1) {
      db.prepare(`INSERT INTO ia_llamadas (mes, estado, resultado, proposito, proveedor, modelo, espacio_id, reservado_micro, costo_micro, creada_en)
        VALUES (?, 'hecha', 'ok', 'interpretar', 'anthropic', 'claude-haiku-5-5', ?, 2000, 999, ?)`).run(mes, espacioAdmin, new Date(Date.now() - 2 * 3_600_000).toISOString());
    }
    g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: maria.galleta });
    assert.equal(g.datos.disponible, true, g.texto);
    assert.deepEqual([g.datos.topeMicro, g.datos.usadoMicro, g.datos.tipicoMicro, g.datos.proveedor, 'modelo' in g.datos, 'esAdmin' in g.datos], [1_000_000, 0, 500, 'anthropic', false, false], 'su costo típico sale solo de sus propios usos');
    assert.equal((await comoDueno('GET', '/api/proyectos/1/ayuda-ia')).codigo, 404, 'el proyecto 1 del administrador no existe');
    // El tope general lleno: para ella es solo «no disponible» (no se le dice que es el del dueño).
    db.prepare(`INSERT INTO ia_llamadas (mes, estado, resultado, proposito, proveedor, modelo, reservado_micro, costo_micro, creada_en)
      VALUES (?, 'hecha', 'ok', 'interpretar', 'anthropic', 'claude-haiku-5-5', 2000, 1999000, ?)`).run(mes, new Date(Date.now() - 2 * 3_600_000).toISOString());
    g = await pedir('GET', '/api/proyectos/1/ayuda-ia', { galleta: maria.galleta });
    assert.deepEqual([g.datos.disponible, g.datos.motivo], [false, 'no_disponible']);
    assert.ok(!g.texto.includes('tope_general') && !g.texto.includes('sin_credito'));
  });
});

// ---------- 22. El detalle del gasto ----------

test('22. el detalle del gasto: las sumas cuadran con las filas, otra cuenta solo con números, y el enlace público solo ve el total', async () => {
  await conPlataforma(async ({ db, admin, pedir, comoDueno, nuevaCuenta }) => {
    await encender(comoDueno);
    const maria = await nuevaCuenta('maria');
    await pedir('POST', '/api/proyectos', { datos: { instrucciones: TALLER }, galleta: maria.galleta });
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
    // Lo que ve el enlace público del estado: el total del mes, sin desglose ni nada de las claves.
    const publico = await pedir('GET', '/api/admin/ia', { galleta: admin, cabeceras: FUNNEL });
    assert.equal(publico.datos.usadoMicro, 4810);
    assert.ok(!('proveedores' in publico.datos) && !publico.texto.includes(claveAnthropic().slice(-4)));
    assert.equal((await pedir('GET', '/api/admin/ia/consumo', { galleta: admin, cabeceras: FUNNEL })).codigo, 403);
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
