// Fase 1, parte d: los arreglos de la ronda 3 de revisión, cada uno con su prueba.
//  1. Una respuesta buena que NO se pudo guardar se anota como lo que fue ('no_se_pudo_guardar'): no cierra el aviso
//     del proveedor y cuenta para la pausa de «tres seguidas». Y la ayuda no se ofrece si las dudas ya están llenas.
//  2. Un proveedor que devuelve la clave en lo que «escribe» el modelo o en sus códigos: no se guarda nada de eso.
//  3. Las llamadas de una hora se reparten: una cuenta con tope de plan nunca deja sin ayuda al dueño.
//  4. La versión de la IA guarda las notas del motor que siguen valiendo; si la IA no cambió nada, no hay versión nueva.
//  5. Más lugares desconocidos que dudas libres: la versión de la IA no se guarda.
// Todo contra el proveedor FALSO (test/proveedor-falso.js) en 127.0.0.1: nunca una API de verdad ni una clave de verdad.
import { configDePrueba, conServidor, esperarHasta } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { T0, claveAnthropic, preparar, buscarEnTodo, permitirIa } from './ia-base.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { TIPOS } from '../src/tareas/tipos.js';
import { MANEJADORES } from '../src/tareas/manejadores.js';
import { crearEjecutor } from '../src/tareas/ejecutor.js';
import { crearEscritor } from '../src/tareas/escritor.js';
import { encolar } from '../src/tareas/cola.js';
import { nuevaCorrida } from '../src/tareas/corridas.js';
import { espacioDe, crearProyecto, nuevaVersion, detalleProyecto } from '../src/proyectos/proyectos.js';
import { abrirAviso, claveDeAvisoValida } from '../src/avisos/avisos.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { espacioPropio } from '../src/cuentas/planes.js';
import { lugaresNuevosSinDuda, dudas } from '../src/motor/interpretar.js';
import { precioDe, costoMicro } from '../src/ia/precios.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { camposDelMotor, sinLugarParaDudas, supuestosQueSiguen } from '../src/ia/interpretar.js';
import { reservar, disponibilidad, vigilarIA, partesPorHora, RESPUESTAS_INSERVIBLES } from '../src/ia/presupuesto.js';
import { POLITICA } from '../src/ia/politica.js';
import { MOTIVOS } from '../src/ia/propositos.js';
import { codigoCorto } from '../src/ia/proveedores/comun.js';
import { PROVEEDORES } from '../src/ia/proveedores/index.js';
import { programaDeAyuda, crearLimitesIa } from '../src/api/ia.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { ErrorHttp } from '../src/nucleo/http.js';
import { vistaAyudaIa } from '../public/ia-vista.js';

const MIN = 60_000;
const SILENCIO = { log() {}, error() {}, warn() {}, info() {} };
const HAIKU = precioDe('anthropic', 'claude-haiku-5-5');
const ok450 = costoMicro(HAIKU, { entrada: 2000, salida: 500, cacheLectura: 0, cacheEscritura: 0, geo: 'global' });
// Lo mismo sin el lugar (una respuesta con la clave no guarda ni el lugar: se cobra con el más caro).
const sinLugar = costoMicro(HAIKU, { entrada: 2000, salida: 500, cacheLectura: 0, cacheEscritura: 0 });
const ESQUEMA_PRUEBA = { type: 'object', additionalProperties: false, properties: { listo: { type: 'boolean' } }, required: ['listo'] };

function conEjecutor(b) {
  const corrida = nuevaCorrida(b.db, { version: 'prueba', codigo: 'prueba' });
  const escritor = crearEscritor(b.db, { registro: SILENCIO, dormir: async () => {} });
  const ejecutor = crearEjecutor({
    db: b.db, config: b.config, corrida, escritor, registro: TIPOS, manejadores: MANEJADORES, tiempos: { rssMaxMb: 1e9 }, programas: [],
    memoriaDisponibleMb: () => 1000, discoLibreMb: () => 100_000, pedirSalida: () => {}, log: SILENCIO,
  });
  const fila = id => b.db.prepare('SELECT * FROM tareas WHERE id = ?').get(id);
  const terminar = async id => {
    await esperarHasta(async () => { await ejecutor.ciclo(); return ['hecha', 'fallida', 'revisar'].includes(fila(id).estado); }, { que: `la tarea ${id} terminada`, cada: 10 });
    return { ...fila(id), resultado: JSON.parse(fila(id).resultado ?? 'null') };
  };
  return { ejecutor, terminar };
}

function proyecto(b, instrucciones) {
  const usuario = { id: b.admin, rol: 'admin' };
  const espacio = espacioDe(b.db, usuario);
  const { numero } = crearProyecto(b.db, { espacio, usuarioId: usuario.id, instrucciones });
  const id = b.db.prepare('SELECT id FROM proyectos WHERE espacio_id = ? AND numero = ?').get(espacio.id, numero).id;
  return { numero, id, espacioId: espacio.id, usuarioId: usuario.id };
}

function pedirAyuda(b, p, { version = 1, maximoMicro = 5000, pedidaEn = Date.now() } = {}) {
  return encolar(b.db, {
    tipo: 'ia.interpretar', espacioId: p.espacioId, proyectoId: null, programa: programaDeAyuda(p.id),
    claveUnica: `${programaDeAyuda(p.id)}:v${version}:${pedidaEn}:${randomUUID()}`,
    datos: { proyecto: p.numero, version, usuarioId: p.usuarioId, idioma: 'es', pedidaEn, maximoMicro }, creadaPor: p.usuarioId,
  }).id;
}

// Deja la versión que espera aprobación con «n» dudas guardadas (como si una persona las hubiera dejado así).
function conDudasGuardadas(b, p, n) {
  const base = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
  const noEntendido = Array.from({ length: n }, (_, i) => ({ clave: 'texto', texto: `palabra rara ${i}`, sugerencias: [] }));
  return nuevaVersion(b.db, {
    espacioId: p.espacioId, proyectoId: p.numero, usuarioId: b.admin, instrucciones: base.instrucciones,
    configuracion: { ...base.configuracion, noEntendido }, supuestos: [], origen: 'campos',
  });
}

const versiones = (b, p) => b.db.prepare('SELECT numero, estado FROM proyecto_versiones WHERE proyecto_id = ? ORDER BY numero').all(p.id).map(v => [v.numero, v.estado]);
const llamadas = b => b.db.prepare('SELECT * FROM ia_llamadas ORDER BY id').all();
const secreto = b => b.db.prepare('SELECT * FROM secretos WHERE id = ?').get(b.secretoId);
const avisoAbierto = (b, clave) => b.db.prepare('SELECT * FROM avisos WHERE clave = ? AND resuelto_en IS NULL').get(clave);
const sinPausa = b => b.db.prepare("UPDATE secretos SET pausa_motivo = NULL, pausa_hasta = NULL, pausa_desde = NULL, prueba = 'ok'").run();

// ---------- 1. Lo que se pagó y no se pudo guardar ----------

test('ronda 3 (1): una respuesta buena que no se pudo guardar queda «no_se_pudo_guardar»: no cierra el aviso y cuenta para tres seguidas', async () => {
  assert.ok(MOTIVOS.includes('no_se_pudo_guardar') && RESPUESTAS_INSERVIBLES.includes('no_se_pudo_guardar'));
  assert.deepEqual([POLITICA.no_se_pudo_guardar.estado, POLITICA.no_se_pudo_guardar.resuelve, POLITICA.no_se_pudo_guardar.pausa], ['hecha', false, null]);
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  let ahora = T0;
  const escritor = crearEscritor(b.db, { registro: SILENCIO, dormir: async () => {} });
  const ia = crearClienteIA({ db: b.db, config: b.config, escritor, reloj: () => ahora, registro: SILENCIO });
  const usar = guardar => ia.pedir({ proposito: 'interpretar', espacioId: b.espacioAdmin, sistema: 'S', texto: 'T', esquema: ESQUEMA_PRUEBA, guardar });
  const noCabe = db => { abrirAviso(db, { clave: 'memoria_baja', nivel: 'info', ahora }); throw new Error('no cabe'); };
  try {
    abrirAviso(b.db, { clave: 'ia_proveedor:anthropic', nivel: 'info', detalle: { proveedor: 'anthropic', motivo: 'sobrecargado' }, ahora });
    falso.siguiente('ok');
    ahora += MIN;
    const r = await usar(noCabe);
    assert.deepEqual([r.usada, r.guardado, r.costoMicro], [true, { ok: false, error: 'no_se_pudo_guardar' }, ok450]);
    const fila = llamadas(b).at(-1);
    assert.deepEqual([fila.estado, fila.resultado, fila.costo_micro], ['hecha', 'no_se_pudo_guardar', ok450], 'se pagó y no sirvió');
    assert.ok(avisoAbierto(b, 'ia_proveedor:anthropic'), 'nunca cierra el aviso del proveedor');
    assert.equal(avisoAbierto(b, 'memoria_baja'), undefined, 'lo que guardar alcanzó a escribir se deshizo');
    // Con dos rechazos después: tres seguidas que no sirven → pausa del dueño y aviso.
    falso.siguiente('refusal', 'refusal');
    for (let i = 0; i < 2; i += 1) { ahora += MIN; assert.equal((await usar()).motivo, 'rechazada'); }
    assert.deepEqual([secreto(b).pausa_motivo, secreto(b).pausa_hasta], ['fallas_seguidas', null]);
    // El caso de la revisión: rechazo, rechazo, sin guardar… nunca reinicia la cuenta.
    sinPausa(b);
    b.db.prepare("UPDATE avisos SET resuelto_en = 'x' WHERE resuelto_en IS NULL").run();
    ahora += 2 * 60 * MIN;
    falso.siguiente('refusal', 'refusal', 'ok');
    for (let i = 0; i < 2; i += 1) { ahora += MIN; await usar(); }
    ahora += MIN;
    await usar(noCabe);
    assert.equal(secreto(b).pausa_motivo, 'fallas_seguidas', 'la respuesta sin guardar no reinicia la cuenta');
    const antes = falso.peticiones.length;
    ahora += MIN;
    assert.equal((await usar(noCabe)).motivo, 'proveedor_en_pausa');
    assert.equal(falso.peticiones.length, antes, 'en pausa no se toca la red');
    // Una versión que cambió mientras la IA pensaba no es culpa del modelo: queda 'ok'.
    sinPausa(b);
    ahora += 2 * 60 * MIN;
    falso.siguiente('ok');
    const cambio = await usar(() => { throw new ErrorHttp(409, 'version_cambio'); });
    assert.deepEqual(cambio.guardado, { ok: false, error: 'version_cambio' });
    assert.equal(llamadas(b).at(-1).resultado, 'ok');
  } finally {
    b.db.close();
    await falso.cerrar();
  }
});

test('ronda 3 (1): con las dudas llenas y una duda calculada la ayuda no se ofrece ni se paga; si lo de la IA no cabe, queda «no_se_pudo_guardar»', async () => {
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  const e = conEjecutor(b);
  try {
    const p = proyecto(b, 'Vendo paneles solares a hoteles en Punta Cana y en Miami');
    assert.equal(conDudasGuardadas(b, p, 12), 2);
    const llena = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
    assert.deepEqual([llena.configuracion.noEntendido.length, dudas(llena.configuracion).at(-1).clave], [12, 'fuera_del_pais']);
    assert.equal(sinLugarParaDudas(llena.configuracion), true);
    for (let i = 0; i < 3; i += 1) {
      const t = await e.terminar(pedirAyuda(b, p, { version: 2 }));
      assert.deepEqual([t.estado, t.resultado.usada, t.resultado.motivo, t.resultado.costoMicro], ['hecha', false, 'demasiadas_dudas', 0]);
    }
    assert.equal(falso.peticiones.length, 0, 'nada se pagó');
    assert.equal(llamadas(b).length, 0);
    // Con 11 dudas sí se ofrece. Si la IA quita Miami Y agrega un lugar desconocido, lo suyo no cabe: se pagó, no se
    // guardó, y queda anotado como lo que fue.
    assert.equal(conDudasGuardadas(b, p, 11), 3);
    const once = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
    assert.equal(sinLugarParaDudas(once.configuracion), false);
    falso.siguiente({ tipo: 'ok', json: { ...camposDelMotor(once.configuracion, 'es'), zonas: 'Punta Cana, Villa Zurbania', dudasResueltas: [] } });
    const t = await e.terminar(pedirAyuda(b, p, { version: 3 }));
    assert.deepEqual([t.resultado.usada, t.resultado.motivo, t.resultado.costoMicro], [false, 'no_se_pudo_guardar', ok450]);
    assert.deepEqual([llamadas(b).at(-1).estado, llamadas(b).at(-1).resultado], ['hecha', 'no_se_pudo_guardar']);
    assert.deepEqual(versiones(b, p).at(-1), [3, 'pendiente'], 'ninguna versión nueva');
  } finally {
    await e.ejecutor.parar({ esperaMs: 0 });
    b.db.close();
    await falso.cerrar();
  }
});

// ---------- 2. La clave devuelta en lo que escribe el modelo o en sus códigos ----------

// Ni la clave, ni la clave en minúsculas con solo letras y números, ni un pedazo de 12 de ella, en ninguna parte.
function sinPedazosDeClave(b, clave) {
  const plana = clave.toLowerCase().replace(/[^a-z0-9]/g, '');
  assert.deepEqual(buscarEnTodo(b.db, b.config, clave), []);
  assert.deepEqual(buscarEnTodo(b.db, b.config, plana), []);
  for (const tabla of ['ia_llamadas', 'proyecto_versiones', 'tareas', 'avisos', 'ia_bloqueos', 'proyecto_historial']) {
    for (const f of b.db.prepare(`SELECT * FROM ${tabla}`).all()) {
      for (const [columna, v] of Object.entries(f)) {
        if (v == null) continue;
        const texto = String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let i = 0; i + 12 <= plana.length; i++) assert.ok(!texto.includes(plana.slice(i, i + 12)), `${tabla}.${columna}`);
      }
    }
  }
}

test('ronda 3 (2): un proveedor que devuelve la clave en el contenido, en el motivo de parada o en el código de error: no se guarda nada de eso', async () => {
  // Un código de más de 40 letras nunca se guarda (ningún código de verdad es tan largo).
  assert.equal(codigoCorto('a'.repeat(40)), 'a'.repeat(40));
  assert.equal(codigoCorto('a'.repeat(41)), null);
  const leidoOpenai = PROVEEDORES.openai.leer({ status: 401, json: { error: { type: 'x'.repeat(41), code: 'invalid_api_key' } }, cabeceras: {} });
  assert.deepEqual(leidoOpenai.detalle, { codigo: 'invalid_api_key' });
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  const e = conEjecutor(b);
  let ahora = T0;
  const ia = crearClienteIA({ db: b.db, config: b.config, escritor: crearEscritor(b.db, { registro: SILENCIO, dormir: async () => {} }), reloj: () => ahora, registro: SILENCIO });
  const clave = claveAnthropic();
  try {
    // Por la ayuda de verdad: la respuesta «buena» trae la clave en producto, sectores y prioridades (tal cual o en
    // minúsculas con solo letras y números). No se usa, no hay versión nueva, la clave queda en pausa y se avisa grave.
    const p = proyecto(b, 'Busco clientes para mi taller de bicicletas en Santiago');
    for (const modo of ['contenido', 'minusculas']) {
      sinPausa(b);
      b.db.prepare("UPDATE avisos SET resuelto_en = 'x' WHERE resuelto_en IS NULL").run();
      falso.siguiente({ tipo: 'eco_clave_contenido', modo, json: camposDelMotor(detalleProyecto(b.db, p.espacioId, p.numero).pendiente.configuracion, 'es') });
      const t = await e.terminar(pedirAyuda(b, p));
      assert.deepEqual([t.estado, t.resultado.usada, t.resultado.motivo, t.resultado.numero, t.resultado.costoMicro], ['hecha', false, 'eco_de_clave', null, sinLugar], modo);
      assert.deepEqual(versiones(b, p), [[1, 'pendiente']], 'ninguna versión nueva');
      const f = llamadas(b).at(-1);
      assert.deepEqual([f.estado, f.resultado, f.costo_micro, f.id_peticion, f.detalle], ['hecha', 'eco_de_clave', sinLugar, null, null]);
      assert.deepEqual([secreto(b).pausa_motivo, secreto(b).pausa_hasta], ['eco_de_clave', null]);
      assert.equal(avisoAbierto(b, 'ia_proveedor:anthropic')?.nivel, 'grave');
    }
    // Directo por ctx.ia.pedir: el motivo de parada, el tipo y el código de un error (401 y 500).
    const casos = [
      [{ tipo: 'eco_clave_contenido', modo: 'stop' }, 'eco_de_clave', 'hecha', sinLugar],
      [{ tipo: 'eco_clave_contenido', modo: 'error' }, 'clave_no_valida', 'fallida', 0],
      [{ tipo: 'eco_clave_contenido', modo: 'error_500' }, 'eco_de_clave', 'fallida', 0],
    ];
    for (const [escena, motivo, estado, costo] of casos) {
      sinPausa(b);
      ahora += 10 * MIN;
      falso.siguiente(escena);
      const r = await ia.pedir({ proposito: 'interpretar', espacioId: b.espacioAdmin, sistema: 'S', texto: 'T', esquema: ESQUEMA_PRUEBA });
      assert.deepEqual([r.usada, r.motivo, r.costoMicro], [false, motivo, costo], escena.modo);
      const f = llamadas(b).at(-1);
      assert.deepEqual([f.estado, f.resultado, f.detalle], [estado, motivo, null], escena.modo);
      assert.equal(secreto(b).pausa_hasta, null, 'pausa del dueño');
      assert.ok(secreto(b).pausa_motivo, 'en pausa');
      assert.equal(avisoAbierto(b, 'ia_proveedor:anthropic')?.nivel, 'grave');
    }
    sinPedazosDeClave(b, clave);
    // Un uso normal después sigue funcionando (y su código corto sí se guarda).
    sinPausa(b);
    ahora += 10 * MIN;
    falso.siguiente('refusal');
    assert.equal((await ia.pedir({ proposito: 'interpretar', espacioId: b.espacioAdmin, sistema: 'S', texto: 'T', esquema: ESQUEMA_PRUEBA })).motivo, 'rechazada');
    assert.deepEqual(JSON.parse(llamadas(b).at(-1).detalle), { stop: 'refusal', geo: 'global' });
  } finally {
    await e.ejecutor.parar({ esperaMs: 0 });
    b.db.close();
    await falso.cerrar();
  }
});

// ---------- 3. Las llamadas de una hora, repartidas ----------

test('ronda 3 (3): una cuenta con tope de plan usa como mucho su parte de la hora; las cuentas juntas nunca dejan al dueño sin ayuda', async () => {
  assert.deepEqual(partesPorHora(30), { total: 30, porCuenta: 10, cuentas: 20 });
  assert.deepEqual(partesPorHora(1), { total: 1, porCuenta: 1, cuentas: 0 });
  assert.deepEqual(partesPorHora(600), { total: 600, porCuenta: 200, cuentas: 400 });
  const b = preparar({ planes: { prueba: 1_000_000 } });
  try {
    const cuentas = [b.espacioOtro];
    for (const nombre of ['pedro', 'ana']) {
      const id = crearUsuario(b.db, { nombre, claveHash: 'x', creadoPor: b.admin });
      permitirIa(b.db, id, b.admin);
      cuentas.push(espacioPropio(b.db, id).id);
    }
    for (const c of cuentas) assert.equal(b.db.prepare('SELECT plan FROM espacios WHERE id = ?').get(c).plan, 'prueba');
    let ahora = T0;
    const apartar = espacioId => { ahora += 1000; return reservar(b.db, { config: b.config, proposito: 'interpretar', espacioId, entradaMax: 4000, ahora }); };
    const [maria, pedro, ana] = cuentas;
    for (let i = 0; i < 10; i += 1) assert.equal(apartar(maria).ok, true, `maria ${i}`);
    assert.deepEqual([apartar(maria).ok, apartar(maria).motivo], [false, 'demasiadas_llamadas'], 'su parte de la hora');
    const aviso = avisoAbierto(b, `ia_llamadas:e${maria}`);
    assert.equal(aviso?.nivel, 'atencion', 'se avisa al momento, con el número de la cuenta');
    assert.deepEqual(JSON.parse(aviso.detalle), { ambito: `e${maria}`, usadas: 10, parte: 10 });
    assert.ok(claveDeAvisoValida(`ia_llamadas:e${maria}`));
    for (let i = 0; i < 10; i += 1) assert.equal(apartar(pedro).ok, true, `pedro ${i}`);
    assert.deepEqual([apartar(ana).ok, apartar(ana).motivo], [false, 'demasiadas_llamadas'], 'las cuentas juntas ya usaron su parte');
    assert.equal(avisoAbierto(b, `ia_llamadas:e${ana}`), undefined, 'ana no usó nada');
    // El dueño sigue teniendo las suyas.
    const d = disponibilidad(b.db, { config: b.config, espacioId: b.espacioAdmin, proposito: 'interpretar', entradaMax: 4000, ahora });
    assert.deepEqual([d.disponible, d.motivo], [true, 'ok']);
    for (let i = 0; i < 10; i += 1) assert.equal(apartar(b.espacioAdmin).ok, true, `dueño ${i}`);
    assert.equal(apartar(b.espacioAdmin).motivo, 'demasiadas_llamadas', 'el total de la hora sigue valiendo');
    // Pasada la hora, la revisión de cada hora cierra los avisos y todos vuelven a tener.
    ahora += 61 * MIN;
    const v = vigilarIA(b.db, { config: b.config, ahora });
    assert.ok(v.avisosCerrados >= 2);
    assert.equal(avisoAbierto(b, `ia_llamadas:e${maria}`), undefined);
    assert.equal(avisoAbierto(b, `ia_llamadas:e${pedro}`), undefined);
    assert.equal(apartar(ana).ok, true);
  } finally {
    b.db.close();
  }
});

// Un servidor de verdad (puerto al azar), el proveedor falso, el dueño con su cuenta de Tailscale y otra cuenta.
async function pedirHttp(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
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

test('ronda 3 (1 y 3): por las rutas, «demasiadas_dudas» antes de pagar, y otra cuenta pide ayuda como mucho 3 veces cada 10 minutos', async () => {
  assert.deepEqual([crearLimitesIa().ayudaCuentas.maximo, crearLimitesIa().ayudaCuentas.ventanaMs], [3, 10 * MIN]);
  const falso = await crearProveedorFalso();
  const config = { ...configDePrueba(), iaBases: { anthropic: falso.base } };
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, supervisor: { despertar() {} } });
  const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
  const CLAVE = 'una clave bien larga';
  try {
    await conServidor(servidor, async base => {
      const pedir = (metodo, ruta, opciones) => pedirHttp(base, metodo, ruta, opciones);
      const admin = (await pedir('POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const comoDueno = (metodo, ruta, opciones = {}) => pedir(metodo, ruta, { galleta: admin, ...opciones, cabeceras: DUENO });
      assert.equal((await comoDueno('POST', '/api/admin/claves', { datos: { uso: 'ia_anthropic', valor: claveAnthropic() } })).codigo, 201);
      assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { topeGeneralUsd: '2', topesPlanUsd: { prueba: '1' } } })).codigo, 200);
      assert.equal((await comoDueno('POST', '/api/admin/ia/ajustes', { datos: { encendida: true, ayudaProyectos: true } })).codigo, 200);
      // El dueño: 12 dudas guardadas y Miami → «demasiadas_dudas», sin botón y sin poner nada en la fila.
      assert.equal((await comoDueno('POST', '/api/proyectos', { datos: { instrucciones: 'Vendo paneles solares a hoteles en Punta Cana y en Miami' } })).codigo, 201);
      const adminId = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
      const espacioAdmin = espacioDe(db, { id: adminId, rol: 'admin' }).id;
      const p = { numero: 1, espacioId: espacioAdmin };
      conDudasGuardadas({ db, admin: adminId }, p, 12);
      const g = await comoDueno('GET', '/api/proyectos/1/ayuda-ia');
      assert.deepEqual([g.datos.disponible, g.datos.motivo], [false, 'demasiadas_dudas']);
      assert.equal(vistaAyudaIa(g.datos).vista, 'no_disponible', 'una línea con el motivo, sin botón');
      assert.equal((await comoDueno('POST', '/api/proyectos/1/versiones/2/ayuda-ia', { datos: { maximoMicro: 5000 } })).datos.error, 'ia_no_disponible');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE tipo = 'ia.interpretar'").get().n, 0);
      // Otra cuenta con tope de plan: el cuarto pedido en 10 minutos se frena (aunque los anteriores no pasaran).
      const creada = await comoDueno('POST', '/api/admin/usuarios', { datos: { nombre: 'maria' } });
      const entrada = await pedir('POST', '/api/entrar', { datos: { nombre: 'maria', clave: creada.datos.claveTemporal } });
      const cambio = await pedir('POST', '/api/yo/clave', { datos: { actual: creada.datos.claveTemporal, nueva: CLAVE }, galleta: entrada.galleta });
      assert.deepEqual([creada.codigo, entrada.codigo, cambio.codigo], [201, 200, 200], cambio.texto);
      assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'Busco clientes para mi taller de bicicletas en Santiago' }, galleta: entrada.galleta })).codigo, 201);
      const codigos = [];
      for (let i = 0; i < 4; i += 1) codigos.push((await pedir('POST', '/api/proyectos/1/versiones/9/ayuda-ia', { datos: { maximoMicro: 5000 }, galleta: entrada.galleta })).codigo);
      assert.deepEqual(codigos, [409, 409, 409, 429]);
    });
  } finally {
    db.close();
    await falso.cerrar();
  }
});

// ---------- 4. Las notas del motor, y una respuesta igual ----------

test('ronda 3 (4): si la IA entiende lo mismo, no hay versión nueva (se dice en pantalla); si cambia algo, las notas del motor que siguen valiendo pasan', async () => {
  assert.deepEqual(supuestosQueSiguen(['tipo', 'frecuencia', 'gran_santo_domingo', 'contactar_a_mano', 'clientes_sin_nombre'], ['zonas', 'exclusiones']), ['tipo', 'frecuencia', 'contactar_a_mano']);
  assert.deepEqual(supuestosQueSiguen(null, null), []);
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  const e = conEjecutor(b);
  try {
    const p = proyecto(b, 'Vendo paneles solares. Busca hoteles en Santiago y contáctalos, hazlo sin preguntarme. No busques a mis clientes actuales.');
    const v1 = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
    for (const s of ['frecuencia', 'contactar_a_mano', 'autonomia_pedida']) assert.ok(v1.supuestos.includes(s), s);
    // La IA responde exactamente lo que entendió el motor: se usó (y se pagó), pero no hace falta otra versión.
    falso.siguiente({ tipo: 'ok', json: { ...camposDelMotor(v1.configuracion, 'es'), dudasResueltas: [] } });
    const t = await e.terminar(pedirAyuda(b, p));
    assert.deepEqual([t.estado, t.resultado.usada, t.resultado.motivo, t.resultado.numero, t.resultado.costoMicro], ['hecha', true, 'sin_cambios', null, ok450]);
    assert.deepEqual(versiones(b, p), [[1, 'pendiente']], 'la versión del motor sigue esperando (no queda «descartada»)');
    assert.equal(llamadas(b).at(-1).resultado, 'ok', 'la respuesta sirvió');
    // La pantalla lo dice (una vez) y no como un fallo.
    const vista = vistaAyudaIa({ disponible: true, motivo: 'ok', maximoMicro: 5000, tarea: { id: t.id, estado: 'hecha', resultado: t.resultado } }, { seguida: { tareaId: t.id } });
    assert.deepEqual([vista.igual, vista.fallo, vista.lista], [{ costoMicro: ok450 }, null, null]);
    // La IA cambia dónde busca: versión nueva, con las notas que siguen valiendo.
    falso.siguiente({ tipo: 'ok', json: { ...camposDelMotor(v1.configuracion, 'es'), zonas: 'Santiago, Puerto Plata', dudasResueltas: [] } });
    const t2 = await e.terminar(pedirAyuda(b, p));
    assert.deepEqual([t2.resultado.usada, t2.resultado.motivo, t2.resultado.numero], [true, 'ok', 2]);
    const v2 = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
    assert.ok(v2.ayudaIa.cambios.includes('zonas'));
    assert.deepEqual(v2.supuestos, supuestosQueSiguen(v1.supuestos, v2.ayudaIa.cambios));
    for (const s of ['frecuencia', 'contactar_a_mano', 'autonomia_pedida']) assert.ok(v2.supuestos.includes(s), `la nota «${s}» sigue a la vista`);
  } finally {
    await e.ejecutor.parar({ esperaMs: 0 });
    b.db.close();
    await falso.cerrar();
  }
});

// ---------- 5. Más lugares desconocidos que dudas libres ----------

test('ronda 3 (5): la IA nombra 20 lugares que no existen: no caben como dudas, la versión no se guarda y queda «no_se_pudo_guardar»', async () => {
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  const e = conEjecutor(b);
  try {
    const p = proyecto(b, 'Vendo paneles solares a hoteles en Punta Cana');
    const v1 = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
    assert.equal(dudas(v1.configuracion).length, 0);
    const lugares = n => Array.from({ length: n }, (_, i) => `Villa Inventada ${String.fromCharCode(65 + i)}`).join(', ');
    falso.siguiente({ tipo: 'ok', json: { ...camposDelMotor(v1.configuracion, 'es'), zonas: lugares(20), dudasResueltas: [] } });
    const t = await e.terminar(pedirAyuda(b, p));
    assert.deepEqual([t.resultado.usada, t.resultado.motivo, t.resultado.costoMicro], [false, 'no_se_pudo_guardar', ok450]);
    assert.deepEqual(versiones(b, p), [[1, 'pendiente']]);
    assert.equal(llamadas(b).at(-1).resultado, 'no_se_pudo_guardar');
    // Con 3 lugares nuevos sí se guarda, y cada uno es una duda.
    falso.siguiente({ tipo: 'ok', json: { ...camposDelMotor(v1.configuracion, 'es'), zonas: lugares(3), dudasResueltas: [] } });
    const t2 = await e.terminar(pedirAyuda(b, p));
    assert.deepEqual([t2.resultado.usada, t2.resultado.numero], [true, 2]);
    const v2 = detalleProyecto(b.db, p.espacioId, p.numero).pendiente;
    assert.deepEqual(v2.configuracion.noEntendido.map(d => d.clave), ['lugar', 'lugar', 'lugar']);
    assert.deepEqual(lugaresNuevosSinDuda(v1.configuracion, v2.configuracion), []);
    // Lo puro: un lugar nuevo sin su duda se nota; uno de fuera del país o uno que ya estaba, no.
    assert.deepEqual(lugaresNuevosSinDuda({ zonasLibres: ['Villa Vieja'] }, { zonasLibres: ['Villa Vieja', 'Villa Nueva', 'Miami'], noEntendido: [] }), ['Villa Nueva']);
  } finally {
    await e.ejecutor.parar({ esperaMs: 0 });
    b.db.close();
    await falso.cerrar();
  }
});
