// Pruebas de proyectos (fase 1, parte b): crear con instrucciones normales, ver lo que entendió, aprobar,
// versiones, estados, papelera, límites del plan y, sobre todo, que una cuenta nunca vea proyectos de otra.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { marcarConErrores, LIMITE_ADMINISTRADOR } from '../src/proyectos/proyectos.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const PANELES = 'Tengo una empresa que vende paneles solares. Quiero encontrar hoteles, clínicas y fábricas en República Dominicana.';

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

// Crea a «junior» (administrador) y devuelve una función para crear más cuentas ya listas para usar.
async function conPlataforma(fn) {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE })).galleta;
    assert.ok(admin);
    async function nuevaCuenta(nombre) {
      const creada = await pedir(base, 'POST', '/api/admin/usuarios', { datos: { nombre }, galleta: admin });
      assert.equal(creada.codigo, 201);
      const entrada = await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: creada.datos.claveTemporal } });
      const r = await pedir(base, 'POST', '/api/yo/clave', { datos: { actual: creada.datos.claveTemporal, nueva: CLAVE }, galleta: entrada.galleta });
      assert.equal(r.codigo, 200);
      return { galleta: entrada.galleta, id: creada.datos.id };
    }
    await fn({ base, admin, db, nuevaCuenta, pedir: (metodo, ruta, opciones) => pedir(base, metodo, ruta, opciones) });
  });
  db.close();
}

test('crear un proyecto con instrucciones normales: queda pendiente con lo que entendió', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const r = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin });
    assert.equal(r.codigo, 201);
    const { proyecto, pendiente, activa } = r.datos;
    assert.equal(proyecto.estado, 'pendiente');
    assert.equal(proyecto.nombre, 'Clientes para paneles solares');
    assert.equal(proyecto.tipo, 'comercial');
    assert.equal(proyecto.versionPendiente, 1);
    assert.equal(activa, null, 'nada trabaja hasta que se apruebe');
    assert.equal(pendiente.numero, 1);
    assert.equal(pendiente.instrucciones, PANELES);
    assert.deepEqual(pendiente.configuracion.sectores, ['hoteles', 'clinicas', 'fabricas']);
    assert.deepEqual(pendiente.faltantes, []);
    assert.ok(pendiente.supuestos.includes('frecuencia'));

    const lista = await pedir('GET', '/api/proyectos', { galleta: admin });
    assert.equal(lista.datos.usados, 1);
    assert.equal(lista.datos.limite, LIMITE_ADMINISTRADOR);
    assert.equal(lista.datos.proyectos[0].versionPendiente, 1);
  });
});

test('aprobar pone el proyecto en ejecución; un cambio espera aprobación y la versión vieja sigue en uso', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    let r = await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.proyecto.estado, 'en_ejecucion');
    assert.equal(r.datos.activa.numero, 1);
    assert.equal(r.datos.activa.estado, 'aprobada');

    // Cambio a mano: versión 2 pendiente; la 1 sigue en uso.
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { tipo: 'comercial', producto: 'paneles solares', sectores: 'hoteles', zonas: 'Santiago', frecuencia: 'diaria', capacidades: { investigar: true } } }, galleta: admin });
    assert.equal(r.codigo, 201);
    assert.equal(r.datos.proyecto.estado, 'en_ejecucion');
    assert.equal(r.datos.activa.numero, 1);
    assert.equal(r.datos.pendiente.numero, 2);
    assert.equal(r.datos.pendiente.origen, 'campos');
    assert.equal(r.datos.pendiente.instrucciones, PANELES, 'las instrucciones originales se conservan');
    assert.deepEqual(r.datos.pendiente.configuracion.zonas, ['santiago']);

    // Otro cambio antes de aprobar: la 2 queda descartada, la 3 espera.
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: 'Vendo paneles solares a hoteles en Punta Cana' }, galleta: admin });
    assert.equal(r.datos.pendiente.numero, 3);
    assert.equal(r.datos.versiones.find(v => v.numero === 2).estado, 'descartada');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/2/aprobar`, { galleta: admin })).codigo, 409, 'una versión descartada no se aprueba');

    r = await pedir('POST', `/api/proyectos/${id}/versiones/3/aprobar`, { galleta: admin });
    assert.equal(r.datos.activa.numero, 3);
    assert.equal(r.datos.versiones.find(v => v.numero === 1).estado, 'reemplazada');
    assert.equal(r.datos.pendiente, null);
    assert.deepEqual(r.datos.historial.map(h => h.accion), ['aprobada', 'version_nueva', 'version_nueva', 'aprobada', 'creado']);
  });
});

test('rechazar la primera versión deja el proyecto en borrador; escribir de nuevo vuelve a pedir aprobación', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    let r = await pedir('POST', `/api/proyectos/${id}/versiones/1/rechazar`, { datos: { motivo: 'No era eso' }, galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'borrador');
    assert.equal(r.datos.versiones[0].estado, 'rechazada');
    assert.equal(r.datos.versiones[0].motivo, 'No era eso');
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: 'Busco trabajo de chofer en Santiago' }, galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'pendiente');
    assert.equal(r.datos.proyecto.tipo, 'laboral', 'sin versión en uso, el tipo sigue a la versión nueva');
  });
});

test('no se puede aprobar si falta algo importante (no se adivina)', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const r = await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'Busco clientes para mi negocio de uniformes' }, galleta: admin });
    assert.deepEqual(r.datos.pendiente.faltantes, ['zonas']);
    const id = r.datos.proyecto.id;
    const a = await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin });
    assert.equal(a.codigo, 400);
    assert.equal(a.datos.error, 'faltan_datos');
    const sinCapacidades = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { tipo: 'comercial', producto: 'uniformes', sectores: 'hoteles', zonas: 'todo el país', capacidades: {} } }, galleta: admin });
    assert.deepEqual(sinCapacidades.datos.pendiente.faltantes, ['capacidades']);
    assert.equal(sinCapacidades.datos.pendiente.configuracion.paisCompleto, true);
  });
});

test('estados: pausar, reanudar, completar, reabrir; y los botones que no tocan dan error claro', async () => {
  await conPlataforma(async ({ admin, pedir, db }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    const accion = a => pedir('POST', `/api/proyectos/${id}/estado`, { datos: { accion: a }, galleta: admin });
    assert.equal((await accion('pausar')).datos.error, 'accion_no_permitida_ahora', 'no se pausa lo que no ha empezado');
    await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin });
    assert.equal((await accion('pausar')).datos.proyecto.estado, 'pausado');
    assert.equal((await accion('reanudar')).datos.proyecto.estado, 'en_ejecucion');
    assert.equal((await accion('completar')).datos.proyecto.estado, 'completado');
    assert.equal((await accion('reabrir')).datos.proyecto.estado, 'en_ejecucion');
    assert.equal((await accion('borrar')).datos.error, 'accion_no_valida');
    assert.equal((await accion('__proto__')).datos.error, 'accion_no_valida');
    assert.equal((await accion('reintentar')).codigo, 409);

    // La fila de tareas (parte c) marcará errores así; «Reintentar» lo devuelve a ejecución.
    assert.equal(marcarConErrores(db, id, 'La web no respondió'), true);
    let r = await pedir('GET', `/api/proyectos/${id}`, { galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'con_errores');
    assert.equal(r.datos.proyecto.motivoError, 'La web no respondió');
    r = await accion('reintentar');
    assert.equal(r.datos.proyecto.estado, 'en_ejecucion');
    assert.equal(r.datos.proyecto.motivoError, null);
  });
});

test('papelera: no se borra nada, el proyecto se esconde y se puede restaurar', async () => {
  await conPlataforma(async ({ admin, pedir, db }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    let r = await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: true }, galleta: admin });
    assert.equal(r.datos.proyecto.enPapelera, true);
    assert.equal((await pedir('GET', '/api/proyectos', { galleta: admin })).datos.usados, 0);
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin })).datos.error, 'en_papelera');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proyecto_versiones WHERE proyecto_id = ?').get(id).n, 1, 'la versión sigue guardada');
    r = await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: false }, galleta: admin });
    assert.equal(r.datos.proyecto.enPapelera, false);
    assert.equal(r.datos.proyecto.estado, 'pendiente', 'vuelve como estaba');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: 'si' }, galleta: admin })).codigo, 400);
  });
});

test('cambiar el nombre queda en el historial', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    const r = await pedir('POST', `/api/proyectos/${id}/nombre`, { datos: { nombre: '  Paneles   para hoteles ' }, galleta: admin });
    assert.equal(r.datos.proyecto.nombre, 'Paneles para hoteles');
    assert.deepEqual(r.datos.historial[0].detalle, { antes: 'Clientes para paneles solares', ahora: 'Paneles para hoteles' });
    assert.equal((await pedir('POST', `/api/proyectos/${id}/nombre`, { datos: { nombre: 'x'.repeat(81) }, galleta: admin })).datos.error, 'nombre_proyecto_no_valido');
  });
});

test('una cuenta nunca ve ni cambia los proyectos de otra; ni siquiera el administrador', async () => {
  await conPlataforma(async ({ admin, pedir, nuevaCuenta }) => {
    const ana = await nuevaCuenta('ana');
    const luis = await nuevaCuenta('luis');
    const deAna = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta })).datos.proyecto.id;
    const deJunior = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto.id;

    for (const [quien, ajeno] of [[luis.galleta, deAna], [admin, deAna], [ana.galleta, deJunior]]) {
      const rutas = [
        ['GET', `/api/proyectos/${ajeno}`],
        ['POST', `/api/proyectos/${ajeno}/versiones/1/aprobar`],
        ['POST', `/api/proyectos/${ajeno}/versiones/1/rechazar`, {}],
        ['POST', `/api/proyectos/${ajeno}/versiones`, { modo: 'instrucciones', instrucciones: PANELES }],
        ['POST', `/api/proyectos/${ajeno}/estado`, { accion: 'pausar' }],
        ['POST', `/api/proyectos/${ajeno}/nombre`, { nombre: 'mío' }],
        ['POST', `/api/proyectos/${ajeno}/papelera`, { enPapelera: true }],
      ];
      for (const [metodo, ruta, datos] of rutas) {
        const r = await pedir(metodo, ruta, { datos, galleta: quien });
        assert.equal(r.codigo, 404, `${metodo} ${ruta} dejó entrar a un proyecto ajeno`);
      }
    }
    assert.deepEqual((await pedir('GET', '/api/proyectos', { galleta: luis.galleta })).datos.proyectos, []);
    assert.deepEqual((await pedir('GET', '/api/proyectos', { galleta: admin })).datos.proyectos.map(p => p.id), [deJunior]);
    const r = await pedir('GET', `/api/proyectos/${deAna}`, { galleta: ana.galleta });
    assert.equal(r.datos.proyecto.estado, 'pendiente', 'el proyecto de Ana sigue intacto');
    assert.equal(r.datos.versiones.length, 1);
  });
});

test('límite de proyectos según el plan; la papelera no cuenta', async () => {
  await conPlataforma(async ({ pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    db.prepare("UPDATE espacios SET plan = 'gratis' WHERE id = (SELECT espacio_id FROM miembros WHERE usuario_id = ?)").run(ana.id);
    const primero = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta });
    assert.equal(primero.codigo, 201);
    const segundo = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta });
    assert.equal(segundo.codigo, 409);
    assert.equal(segundo.datos.error, 'limite_de_proyectos');
    await pedir('POST', `/api/proyectos/${primero.datos.proyecto.id}/papelera`, { datos: { enPapelera: true }, galleta: ana.galleta });
    const tercero = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta });
    assert.equal(tercero.codigo, 201);
    const restaurar = await pedir('POST', `/api/proyectos/${primero.datos.proyecto.id}/papelera`, { datos: { enPapelera: false }, galleta: ana.galleta });
    assert.equal(restaurar.datos.error, 'limite_de_proyectos', 'restaurar también respeta el límite');
  });
});

test('un lector solo puede ver; nadie entra sin sesión ni sin la protección contra pedidos falsos', async () => {
  await conPlataforma(async ({ base, admin, pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta })).datos.proyecto;
    // Luis entra al espacio de Ana como lector (en el plan empresarial esto se hará desde la pantalla).
    const luis = await nuevaCuenta('luis');
    db.prepare("UPDATE miembros SET rol = 'lector' WHERE usuario_id = ?").run(luis.id);
    db.prepare("UPDATE miembros SET espacio_id = (SELECT espacio_id FROM miembros WHERE usuario_id = ?) WHERE usuario_id = ?").run(ana.id, luis.id);
    assert.equal((await pedir('GET', `/api/proyectos/${id}`, { galleta: luis.galleta })).datos.puedeEscribir, false);
    for (const [ruta, datos] of [[`/api/proyectos/${id}/versiones/1/aprobar`], ['/api/proyectos', { instrucciones: PANELES }], [`/api/proyectos/${id}/estado`, { accion: 'pausar' }]]) {
      const r = await pedir('POST', ruta, { datos, galleta: luis.galleta });
      assert.equal(r.codigo, 403, ruta);
      assert.equal(r.datos.error, 'solo_lectura');
    }
    assert.equal((await pedir('GET', '/api/proyectos')).codigo, 401);
    assert.equal((await pedir('GET', '/api/catalogo')).codigo, 401);
    const sinCabecera = await fetch(`${base}/api/proyectos`, { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ instrucciones: PANELES }) });
    assert.equal(sinCabecera.status, 403);
    const otraPagina = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin, cabeceras: { Origin: 'https://malo.example' } });
    assert.equal(otraPagina.codigo, 403);
  });
});

test('datos raros o enormes se rechazan con un error claro', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'hola' }, galleta: admin })).datos.error, 'instrucciones_cortas');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'x'.repeat(4001) }, galleta: admin })).datos.error, 'instrucciones_largas');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: ['lista'] }, galleta: admin })).datos.error, 'instrucciones_cortas');
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'otro' }, galleta: admin })).datos.error, 'datos_no_validos');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: 'texto' }, galleta: admin })).datos.error, 'datos_no_validos');
    for (const ruta of ['/api/proyectos/abc', '/api/proyectos/0', '/api/proyectos/-1', '/api/proyectos/1e3', '/api/proyectos/99999999999999999999']) {
      assert.equal((await pedir('GET', ruta, { galleta: admin })).codigo, 404, ruta);
    }
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/abc/aprobar`, { galleta: admin })).codigo, 409);
    const catalogo = await pedir('GET', '/api/catalogo', { galleta: admin });
    assert.equal(catalogo.datos.capacidades.length, 7);
  });
});
