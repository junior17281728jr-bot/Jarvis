// Pruebas de proyectos (fase 1, parte b): crear con instrucciones normales, ver lo que entendió, aprobar,
// versiones, estados, papelera, límites del plan y, sobre todo, que una cuenta nunca vea proyectos de otra.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { Limitador } from '../src/nucleo/limites.js';
import { interpretar, configuracionDesdeCampos, TIPOS, AUTONOMIAS } from '../src/motor/interpretar.js';
import {
  marcarConErrores, LIMITE_ADMINISTRADOR, MAXIMO_VERSIONES, MAXIMO_BYTES_VERSION, VERSIONES_COMPLETAS, ESTADOS, ESTADOS_VERSION, ORIGENES, EVENTOS,
} from '../src/proyectos/proyectos.js';
import { LIMITE_POR_PLAN, guardadosPermitidos } from '../src/cuentas/planes.js';

const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const CLAVE = 'una clave bien larga';
const PANELES = 'Tengo una empresa que vende paneles solares. Quiero encontrar hoteles, clínicas y fábricas en República Dominicana.';
const CHOFER = 'Busco trabajo de chofer en Santiago, con salario desde 25 mil pesos';

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
  return { codigo: r.status, datos: cuerpo, galleta: setCookie ? setCookie.split(';')[0] : null, texto: JSON.stringify(cuerpo) };
}

// Crea a «junior» (administrador) y devuelve una función para crear más cuentas ya listas para usar.
async function conPlataforma(fn, opcionesServidor = {}) {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db, ...opcionesServidor }), async base => {
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

// Pone a «quien» dentro del espacio de «dueno» con ese rol (en el plan empresarial esto se hará desde la pantalla).
function unirAlEspacio(db, quien, dueno, rol) {
  db.prepare('UPDATE miembros SET rol = ?, espacio_id = (SELECT espacio_id FROM miembros WHERE usuario_id = ?) WHERE usuario_id = ?').run(rol, dueno.id, quien.id);
}

// En la base no hay CHECK: el código es quien cuida que solo haya valores conocidos. Esto lo comprueba.
function revisarValoresDeLaBase(db) {
  for (const p of db.prepare('SELECT tipo, estado, en_papelera, nombre_propio FROM proyectos').all()) {
    assert.ok(TIPOS.includes(p.tipo), `tipo desconocido en la base: ${p.tipo}`);
    assert.ok(ESTADOS.includes(p.estado), `estado desconocido en la base: ${p.estado}`);
    assert.ok([0, 1].includes(p.en_papelera) && [0, 1].includes(p.nombre_propio));
  }
  for (const v of db.prepare('SELECT origen, estado, configuracion FROM proyecto_versiones').all()) {
    assert.ok(ORIGENES.includes(v.origen), `origen desconocido en la base: ${v.origen}`);
    assert.ok(ESTADOS_VERSION.includes(v.estado), `estado de versión desconocido en la base: ${v.estado}`);
    const c = JSON.parse(v.configuracion);
    assert.ok(TIPOS.includes(c.tipo) && AUTONOMIAS.includes(c.autonomia));
    assert.deepEqual(c.ia, { permitida: false, topeMensualUsd: 0 });
  }
  for (const h of db.prepare('SELECT accion FROM proyecto_historial').all()) assert.ok(EVENTOS.includes(h.accion), `evento desconocido: ${h.accion}`);
}

test('crear un proyecto con instrucciones normales: queda pendiente con lo que entendió', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const r = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin });
    assert.equal(r.codigo, 201);
    const { proyecto, pendiente, activa } = r.datos;
    assert.equal(proyecto.id, 1, 'el número del proyecto es el de su espacio');
    assert.equal(proyecto.estado, 'pendiente');
    assert.equal(proyecto.nombre, 'Clientes para paneles solares · Hoteles');
    assert.equal(proyecto.tipo, 'comercial');
    assert.equal(proyecto.versionPendiente, 1);
    assert.equal(activa, null, 'nada trabaja hasta que se apruebe');
    assert.equal(pendiente.numero, 1);
    assert.equal(pendiente.completa, true);
    assert.equal(pendiente.instrucciones, PANELES);
    assert.deepEqual(pendiente.configuracion.sectores, ['hoteles', 'clinicas', 'fabricas']);
    assert.deepEqual(pendiente.faltantes, []);
    assert.ok(pendiente.supuestos.includes('frecuencia'));
    // Decisiones del dueño: el nivel más seguro por defecto, y la IA guardada como no permitida, con costo US$0.
    assert.equal(pendiente.configuracion.autonomia, 'aprobar_salidas');
    assert.deepEqual(pendiente.configuracion.ia, { permitida: false, topeMensualUsd: 0 });
    assert.equal(pendiente.configuracion.costoEstimadoUsd, 0);
    assert.deepEqual(r.datos.permisos, { escribir: true, papelera: true, completar: true });

    const lista = await pedir('GET', '/api/proyectos', { galleta: admin });
    assert.equal(lista.datos.usados, 1);
    assert.equal(lista.datos.limite, LIMITE_ADMINISTRADOR);
    assert.equal(lista.datos.guardados, 1);
    assert.equal(lista.datos.maximoGuardados, guardadosPermitidos(LIMITE_ADMINISTRADOR));
    assert.equal(lista.datos.proyectos[0].versionPendiente, 1);
  });
});

test('«solo cuando yo lo pida»: autonomía «solo cuando pida» y frecuencia manual, guardadas en la versión', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    let r = await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'Vendo software a hoteles en Santiago. Busca solo cuando yo lo pida.' }, galleta: admin });
    const id = r.datos.proyecto.id;
    assert.equal(r.datos.pendiente.configuracion.autonomia, 'solo_cuando_pida');
    assert.equal(r.datos.pendiente.configuracion.frecuencia, 'manual');
    // Elegir otra autonomía en el formulario la cambia (y espera aprobación como todo cambio).
    const campos = { tipo: 'comercial', producto: 'software', sectores: 'hoteles', zonas: 'Santiago', frecuencia: 'semanal', autonomia: 'frecuencia_aprobada', capacidades: { investigar: true } };
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos }, galleta: admin });
    assert.equal(r.codigo, 201);
    assert.equal(r.datos.pendiente.configuracion.autonomia, 'frecuencia_aprobada');
    assert.equal(r.datos.pendiente.configuracion.frecuencia, 'semanal');
    // Una autonomía que no existe no vale: queda la que tenía.
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { ...campos, autonomia: 'sin_preguntar' } }, galleta: admin });
    assert.equal(r.datos.pendiente.configuracion.autonomia, 'frecuencia_aprobada', 'si no eligió una válida, queda la que tenía');
    // «Solo cuando pida» siempre va con la frecuencia manual, aunque llegue otra.
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { ...campos, autonomia: 'solo_cuando_pida', frecuencia: 'diaria' } }, galleta: admin });
    assert.equal(r.datos.pendiente.configuracion.frecuencia, 'manual');
    // Si después elige otra frecuencia sin tocar la autonomía, vuelve al nivel más seguro.
    const { autonomia, ...sinAutonomia } = campos;
    assert.ok(autonomia);
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { ...sinAutonomia, frecuencia: 'diaria' } }, galleta: admin });
    assert.deepEqual([r.datos.pendiente.configuracion.autonomia, r.datos.pendiente.configuracion.frecuencia], ['aprobar_salidas', 'diaria']);
    const catalogo = await pedir('GET', '/api/catalogo', { galleta: admin });
    assert.deepEqual(catalogo.datos.autonomias, ['aprobar_salidas', 'frecuencia_aprobada', 'solo_cuando_pida']);
    assert.equal(catalogo.datos.autonomiaPorDefecto, 'aprobar_salidas');
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

    // La fila de tareas (parte c) marcará errores así (con el id interno); «Reintentar» lo devuelve a ejecución.
    const interno = db.prepare("SELECT id FROM proyectos WHERE numero = ? AND espacio_id = (SELECT espacio_id FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE u.nombre = 'junior')").get(id).id;
    assert.equal(marcarConErrores(db, interno, 'La web no respondió'), true);
    let r = await pedir('GET', `/api/proyectos/${id}`, { galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'con_errores');
    assert.equal(r.datos.proyecto.motivoError, 'La web no respondió');
    r = await accion('reintentar');
    assert.equal(r.datos.proyecto.estado, 'en_ejecucion');
    assert.equal(r.datos.proyecto.motivoError, null);
  });
});

test('papelera: no se borra nada; lo que trabajaba queda pausado y vuelve pausado (queda en el historial)', async () => {
  await conPlataforma(async ({ admin, pedir, db }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    let r = await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: true }, galleta: admin });
    assert.equal(r.datos.proyecto.enPapelera, true);
    assert.equal(r.datos.proyecto.estado, 'pendiente', 'lo que no trabajaba no cambia de estado');
    assert.equal((await pedir('GET', '/api/proyectos', { galleta: admin })).datos.usados, 0);
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin })).datos.error, 'en_papelera');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proyecto_versiones').get().n, 1, 'la versión sigue guardada');
    r = await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: false }, galleta: admin });
    assert.equal(r.datos.proyecto.enPapelera, false);
    assert.equal(r.datos.proyecto.estado, 'pendiente', 'vuelve como estaba');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: 'si' }, galleta: admin })).codigo, 400);

    // Un proyecto en ejecución: al mandarlo a la papelera se pausa; al restaurarlo vuelve pausado y él elige «Reanudar».
    await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin });
    r = await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: true }, galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'pausado');
    assert.deepEqual(r.datos.historial.slice(0, 2).map(h => [h.accion, h.detalle]), [['a_papelera', null], ['pausado', { porPapelera: true }]]);
    assert.equal(marcarConErrores(db, db.prepare('SELECT id FROM proyectos').get().id, 'x'), false, 'en la papelera no trabaja');
    r = await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: false }, galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'pausado', 'vuelve pausado');
    r = await pedir('POST', `/api/proyectos/${id}/estado`, { datos: { accion: 'reanudar' }, galleta: admin });
    assert.equal(r.datos.proyecto.estado, 'en_ejecucion');
  });
});

test('cambiar el nombre queda en el historial, y desde entonces aprobar no lo cambia', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    let r = await pedir('POST', `/api/proyectos/${id}/nombre`, { datos: { nombre: '  Paneles   para hoteles ' }, galleta: admin });
    assert.equal(r.datos.proyecto.nombre, 'Paneles para hoteles');
    assert.deepEqual(r.datos.historial[0].detalle, { antes: 'Clientes para paneles solares · Hoteles', ahora: 'Paneles para hoteles' });
    assert.equal((await pedir('POST', `/api/proyectos/${id}/nombre`, { datos: { nombre: 'x'.repeat(81) }, galleta: admin })).datos.error, 'nombre_proyecto_no_valido');
    await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: CHOFER }, galleta: admin });
    r = await pedir('POST', `/api/proyectos/${id}/versiones/2/aprobar`, { galleta: admin });
    assert.equal(r.datos.proyecto.nombre, 'Paneles para hoteles', 'el nombre que él puso se respeta');
  });
});

test('el nombre sugerido lleva el sector o el lugar, y se recalcula al aprobar si él nunca lo cambió', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    const a = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'Vendo paneles solares a hoteles en Punta Cana' }, galleta: admin })).datos.proyecto;
    const b = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'Vendo paneles solares a fábricas en Santiago' }, galleta: admin })).datos.proyecto;
    assert.notEqual(a.nombre, b.nombre, 'dos proyectos del mismo producto no se ven iguales');
    assert.match(b.nombre, /^Clientes para paneles solares · F/);
    await pedir('POST', `/api/proyectos/${a.id}/versiones/1/aprobar`, { galleta: admin });
    // Ahora busca empleo: al aprobar, el nombre sigue a lo aprobado (y queda en el historial).
    let r = await pedir('POST', `/api/proyectos/${a.id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: CHOFER }, galleta: admin });
    assert.match(r.datos.proyecto.nombre, /^Clientes para paneles solares/, 'mientras espera aprobación, el nombre no cambia');
    r = await pedir('POST', `/api/proyectos/${a.id}/versiones/2/aprobar`, { galleta: admin });
    assert.equal(r.datos.proyecto.nombre, 'Empleo: chofer · Santiago');
    assert.equal(r.datos.proyecto.tipo, 'laboral');
    assert.deepEqual(r.datos.historial[0], { ...r.datos.historial[0], accion: 'renombrado', detalle: { antes: a.nombre, ahora: 'Empleo: chofer · Santiago', automatico: true } });
  });
});

test('una cuenta nunca ve ni cambia los proyectos de otra; ni siquiera el administrador', async () => {
  await conPlataforma(async ({ admin, pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    const luis = await nuevaCuenta('luis');
    // Cada espacio numera sus proyectos desde 1: el número no dice cuántos proyectos tienen las demás cuentas.
    const deJunior = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: CHOFER }, galleta: admin })).datos.proyecto.id;
    const deAna1 = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta })).datos.proyecto.id;
    await pedir('POST', `/api/proyectos/${deAna1}/papelera`, { datos: { enPapelera: true }, galleta: ana.galleta });
    const deAna2 = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'Vendo software de inventario a colmados en Moca' }, galleta: ana.galleta })).datos.proyecto.id;
    assert.deepEqual([deAna1, deAna2, deJunior], [1, 2, 1]);

    // Luis no tiene proyectos: ningún número le abre los de Ana. El administrador no tiene un proyecto 2.
    for (const [quien, numero] of [[luis.galleta, 1], [luis.galleta, 2], [admin, 2]]) {
      const rutas = [
        ['GET', `/api/proyectos/${numero}`],
        ['GET', `/api/proyectos/${numero}/versiones/1`],
        ['POST', `/api/proyectos/${numero}/versiones/1/aprobar`],
        ['POST', `/api/proyectos/${numero}/versiones/1/rechazar`, {}],
        ['POST', `/api/proyectos/${numero}/versiones`, { modo: 'instrucciones', instrucciones: PANELES }],
        ['POST', `/api/proyectos/${numero}/estado`, { accion: 'pausar' }],
        ['POST', `/api/proyectos/${numero}/nombre`, { nombre: 'mío' }],
        ['POST', `/api/proyectos/${numero}/papelera`, { enPapelera: true }],
      ];
      for (const [metodo, ruta, datos] of rutas) {
        const r = await pedir(metodo, ruta, { datos, galleta: quien });
        assert.equal(r.codigo, 404, `${metodo} ${ruta} dejó entrar a un proyecto ajeno`);
      }
    }
    // El mismo número en otro espacio es otro proyecto: el administrador cambia SU proyecto 1, nunca el de Ana.
    const delAdmin = await pedir('GET', `/api/proyectos/${deJunior}`, { galleta: admin });
    assert.equal(delAdmin.datos.pendiente.instrucciones, CHOFER);
    assert.ok(!delAdmin.texto.includes('paneles'), 'nada del proyecto de Ana');
    await pedir('POST', `/api/proyectos/${deJunior}/nombre`, { datos: { nombre: 'mío' }, galleta: admin });
    const proyectoDeAna = await pedir('GET', `/api/proyectos/${deAna1}`, { galleta: ana.galleta });
    assert.equal(proyectoDeAna.datos.proyecto.nombre, 'Clientes para paneles solares · Hoteles', 'el proyecto de Ana sigue intacto');
    assert.equal(proyectoDeAna.datos.versiones.length, 1);
    assert.deepEqual((await pedir('GET', '/api/proyectos', { galleta: luis.galleta })).datos.proyectos, []);
    const deAdmin = (await pedir('GET', '/api/proyectos', { galleta: admin })).datos.proyectos;
    assert.deepEqual(deAdmin.map(p => [p.id, p.nombre]), [[1, 'mío']]);
    // El id interno nunca sale en las respuestas.
    const internoDeAna = db.prepare('SELECT id FROM proyectos WHERE numero = 2 AND nombre LIKE ?').get('%software%').id;
    assert.ok(internoDeAna > 2);
    assert.ok(!(await pedir('GET', `/api/proyectos/${deAna2}`, { galleta: ana.galleta })).texto.includes(`"id":${internoDeAna}`));
  });
});

test('plan «prueba»: 1 proyecto; la papelera no cuenta para el límite; restaurar también lo respeta', async () => {
  await conPlataforma(async ({ pedir, nuevaCuenta }) => {
    const ana = await nuevaCuenta('ana');
    assert.equal(LIMITE_POR_PLAN.prueba, 1);
    const lista = await pedir('GET', '/api/proyectos', { galleta: ana.galleta });
    assert.equal(lista.datos.limite, 1, 'una cuenta nueva empieza con 1 proyecto');
    assert.equal(lista.datos.plan, 'prueba');
    const primero = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta });
    assert.equal(primero.codigo, 201);
    const segundo = await pedir('POST', '/api/proyectos', { datos: { instrucciones: CHOFER }, galleta: ana.galleta });
    assert.equal(segundo.codigo, 409);
    assert.equal(segundo.datos.error, 'limite_de_proyectos');
    await pedir('POST', `/api/proyectos/${primero.datos.proyecto.id}/papelera`, { datos: { enPapelera: true }, galleta: ana.galleta });
    const tercero = await pedir('POST', '/api/proyectos', { datos: { instrucciones: CHOFER }, galleta: ana.galleta });
    assert.equal(tercero.codigo, 201);
    const restaurar = await pedir('POST', `/api/proyectos/${primero.datos.proyecto.id}/papelera`, { datos: { enPapelera: false }, galleta: ana.galleta });
    assert.equal(restaurar.datos.error, 'limite_para_restaurar', 'restaurar respeta el límite, con su propio mensaje');
  });
});

test('el administrador cambia los proyectos permitidos de una cuenta: queda auditado y nunca baja de los que están en uso', async () => {
  await conPlataforma(async ({ admin, pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    let usuarios = await pedir('GET', '/api/admin/usuarios', { galleta: admin });
    assert.deepEqual(usuarios.datos.planes, [{ clave: 'prueba', proyectos: 1 }, { clave: 'pago', proyectos: 5 }, { clave: 'empresarial', proyectos: 20 }]);
    const fila = nombre => usuarios.datos.usuarios.find(u => u.nombre === nombre);
    assert.deepEqual([fila('ana').plan, fila('ana').proyectosPermitidos], ['prueba', 1]);
    assert.equal(fila('junior').proyectosPermitidos, LIMITE_ADMINISTRADOR, 'el administrador tiene 20');
    assert.ok(!('proyectos' in fila('ana')), 'del espacio ajeno solo se ve el plan, nunca los proyectos');

    let r = await pedir('POST', `/api/admin/usuarios/${ana.id}/plan`, { datos: { plan: 'pago' }, galleta: admin });
    assert.equal(r.codigo, 200);
    assert.deepEqual([r.datos.plan, r.datos.proyectosPermitidos], ['pago', 5]);
    assert.match(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'plan_cambiado'").get().detalle, /^ana: prueba -> pago$/);
    for (const texto of [PANELES, CHOFER]) assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: texto }, galleta: ana.galleta })).codigo, 201);
    assert.equal((await pedir('GET', '/api/proyectos', { galleta: ana.galleta })).datos.limite, 5);

    // Con 2 proyectos en uso no se puede bajar a «prueba» (1): error claro y no cambia nada.
    r = await pedir('POST', `/api/admin/usuarios/${ana.id}/plan`, { datos: { plan: 'prueba' }, galleta: admin });
    assert.equal(r.codigo, 409);
    assert.equal(r.datos.error, 'plan_menor_que_activos');
    assert.equal((await pedir('GET', '/api/proyectos', { galleta: ana.galleta })).datos.plan, 'pago');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'plan_cambiado'").get().n, 1);

    for (const plan of ['gratis', 'toString', '__proto__', '', 5, null, { a: 1 }]) {
      assert.equal((await pedir('POST', `/api/admin/usuarios/${ana.id}/plan`, { datos: { plan }, galleta: admin })).datos.error, 'plan_no_valido', String(plan));
    }
    assert.equal((await pedir('POST', '/api/admin/usuarios/999/plan', { datos: { plan: 'pago' }, galleta: admin })).codigo, 404);
    assert.equal((await pedir('POST', `/api/admin/usuarios/${ana.id}/plan`, { datos: { plan: 'empresarial' }, galleta: ana.galleta })).datos.error, 'solo_admin');
  });
});

test('tope de proyectos guardados (en uso + papelera): no se borra nada y se explica qué hacer', async () => {
  await conPlataforma(async ({ pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    const maximo = guardadosPermitidos(1);
    assert.equal(maximo, 10);
    for (let i = 0; i < maximo; i++) {
      const r = await pedir('POST', '/api/proyectos', { datos: { instrucciones: `${PANELES} Proyecto ${i}.` }, galleta: ana.galleta });
      assert.equal(r.codigo, 201, `proyecto ${i}`);
      await pedir('POST', `/api/proyectos/${r.datos.proyecto.id}/papelera`, { datos: { enPapelera: true }, galleta: ana.galleta });
    }
    const otro = await pedir('POST', '/api/proyectos', { datos: { instrucciones: CHOFER }, galleta: ana.galleta });
    assert.equal(otro.codigo, 409);
    assert.equal(otro.datos.error, 'demasiados_guardados');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proyectos').get().n, maximo, 'nada se borró');
    // La salida: restaurar uno de la papelera (y cambiarlo).
    const restaurado = await pedir('POST', '/api/proyectos/3/papelera', { datos: { enPapelera: false }, galleta: ana.galleta });
    assert.equal(restaurado.datos.proyecto.enPapelera, false);
    assert.equal((await pedir('POST', '/api/proyectos/3/versiones', { datos: { modo: 'instrucciones', instrucciones: CHOFER }, galleta: ana.galleta })).codigo, 201);
  });
});

test('el detalle trae completas solo la versión en uso, la que espera y las últimas; las demás se abren una por una', async () => {
  await conPlataforma(async ({ admin, pedir, nuevaCuenta }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    await pedir('POST', `/api/proyectos/${id}/versiones/1/aprobar`, { galleta: admin });
    for (let i = 0; i < 6; i++) {
      const campos = { tipo: 'comercial', producto: 'paneles solares', sectores: 'hoteles', zonas: 'Santiago', prioridades: `Prioridad ${i}`, capacidades: { investigar: true } };
      assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos }, galleta: admin })).codigo, 201);
    }
    const r = await pedir('GET', `/api/proyectos/${id}`, { galleta: admin });
    assert.equal(r.datos.versiones.length, 7);
    assert.equal(VERSIONES_COMPLETAS, 3);
    const completas = r.datos.versiones.filter(v => v.completa).map(v => v.numero);
    assert.deepEqual(completas, [7, 6, 5, 1], 'las 3 últimas (la 7 espera aprobación) y la que está en uso');
    for (const v of r.datos.versiones.filter(x => !x.completa)) {
      assert.deepEqual(Object.keys(v).sort(), ['completa', 'creadaEn', 'decididaEn', 'estado', 'motivo', 'numero', 'origen']);
    }
    assert.equal(r.datos.activa.numero, 1);
    assert.equal(r.datos.pendiente.numero, 7);

    const vieja = await pedir('GET', `/api/proyectos/${id}/versiones/3`, { galleta: admin });
    assert.equal(vieja.codigo, 200);
    assert.equal(vieja.datos.version.completa, true);
    assert.equal(vieja.datos.version.estado, 'descartada');
    assert.deepEqual(vieja.datos.version.configuracion.prioridades, ['Prioridad 1']);
    for (const numero of ['8', '0', '03', '3.0', 'abc', '-1']) {
      assert.equal((await pedir('GET', `/api/proyectos/${id}/versiones/${numero}`, { galleta: admin })).codigo, 404, numero);
    }
    const luis = await nuevaCuenta('luis');
    assert.equal((await pedir('GET', `/api/proyectos/${id}/versiones/3`, { galleta: luis.galleta })).codigo, 404, 'nunca de otra cuenta');
  });
});

test('tope de versiones por proyecto y de tamaño por versión, con un error claro (no se borra nada)', async () => {
  await conPlataforma(async ({ admin, pedir, db }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    // Una versión enorme (listas al máximo con letras que pesan 3 bytes) no se guarda.
    const tres = n => 'ḗ'.repeat(n);
    const enorme = {
      tipo: 'comercial', producto: 'paneles', sectores: Array.from({ length: 30 }, (_, i) => `${i} ${tres(75)}`).join(', '),
      zonas: Array.from({ length: 30 }, (_, i) => `${i} ${tres(75)}`).join(', '), exclusiones: Array.from({ length: 30 }, (_, i) => `${i} ${tres(75)}`).join(', '),
      prioridades: Array.from({ length: 30 }, (_, i) => `${i} ${tres(155)}`).join('\n'), capacidades: { investigar: true },
    };
    let r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: enorme }, galleta: admin });
    assert.equal(r.codigo, 400);
    assert.equal(r.datos.error, 'version_demasiado_grande');
    assert.equal(MAXIMO_BYTES_VERSION, 24 * 1024);
    // Una versión normal y larga sí cabe de sobra.
    const larga = `${PANELES} ${'Prioriza los hoteles que tengan facturas de luz altas y apagones frecuentes este año. '.repeat(40)}`.slice(0, 4000);
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: larga }, galleta: admin })).codigo, 201);

    // Al llegar al tope de versiones, el error lo explica; nada se borra.
    assert.equal(MAXIMO_VERSIONES, 100);
    const interno = db.prepare('SELECT id FROM proyectos').get().id;
    const insertar = db.prepare(`INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, origen, estado, creada_en)
      SELECT proyecto_id, ?, instrucciones, configuracion, origen, 'descartada', creada_en FROM proyecto_versiones WHERE proyecto_id = ? AND numero = 1`);
    for (let n = 3; n <= MAXIMO_VERSIONES; n++) insertar.run(n, interno);
    r = await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: CHOFER }, galleta: admin });
    assert.equal(r.codigo, 409);
    assert.equal(r.datos.error, 'demasiadas_versiones');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proyecto_versiones').get().n, MAXIMO_VERSIONES);
    // El proyecto se sigue abriendo rápido: solo unas pocas versiones vienen completas.
    r = await pedir('GET', `/api/proyectos/${id}`, { galleta: admin });
    assert.equal(r.datos.versiones.length, MAXIMO_VERSIONES);
    assert.ok(r.datos.versiones.filter(v => v.completa).length <= VERSIONES_COMPLETAS + 2);
  });
});

test('el motor no trabaja si el pedido no se va a poder guardar (límite, papelera, tope de versiones)', async () => {
  let llamadas = 0;
  const motor = {
    interpretar: (...args) => { llamadas++; return interpretar(...args); },
    configuracionDesdeCampos: (...args) => { llamadas++; return configuracionDesdeCampos(...args); },
  };
  await conPlataforma(async ({ pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta })).datos.proyecto;
    assert.equal(llamadas, 1);
    // En el límite (1 de 1): se responde sin interpretar.
    const trabado = Array.from({ length: 600 }, (_, i) => `sin a${i}`).join(' ').slice(0, 4000);
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: trabado }, galleta: ana.galleta })).datos.error, 'limite_de_proyectos');
    assert.equal(llamadas, 1, 'en el límite el motor no trabajó');
    // En la papelera: tampoco.
    await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: true }, galleta: ana.galleta });
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: trabado }, galleta: ana.galleta })).datos.error, 'en_papelera');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { producto: 'x' } }, galleta: ana.galleta })).datos.error, 'en_papelera');
    assert.equal(llamadas, 1, 'en la papelera el motor no trabajó');
    // Con el tope de versiones lleno: tampoco.
    await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: false }, galleta: ana.galleta });
    const interno = db.prepare('SELECT id FROM proyectos').get().id;
    const insertar = db.prepare(`INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, origen, estado, creada_en)
      VALUES (?, ?, 'x', '{}', 'campos', 'descartada', '2026-01-01')`);
    for (let n = 2; n <= MAXIMO_VERSIONES; n++) insertar.run(interno, n);
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: trabado }, galleta: ana.galleta })).datos.error, 'demasiadas_versiones');
    assert.equal(llamadas, 1, 'con el tope lleno el motor no trabajó');
  }, { proyectos: { motor } });
});

test('dos toques seguidos en «Entender mis instrucciones» no crean dos proyectos iguales', async () => {
  await conPlataforma(async ({ pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    await pedir('POST', `/api/admin/usuarios/${ana.id}/plan`, { datos: { plan: 'pago' }, galleta: (await pedir('POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } })).galleta });
    const [a, b] = await Promise.all([1, 2].map(() => pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta })));
    assert.deepEqual([a.codigo, b.codigo].sort(), [200, 201]);
    assert.equal(a.datos.proyecto.id, b.datos.proyecto.id);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proyectos').get().n, 1);
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: CHOFER }, galleta: ana.galleta })).codigo, 201, 'otras instrucciones sí crean otro');
  });
});

test('editor: crea, cambia, aprueba, rechaza, pausa y reanuda; solo el dueño manda a la papelera, restaura, completa y reabre', async () => {
  await conPlataforma(async ({ pedir, nuevaCuenta, admin, db }) => {
    const ana = await nuevaCuenta('ana');
    await pedir('POST', `/api/admin/usuarios/${ana.id}/plan`, { datos: { plan: 'pago' }, galleta: admin });
    const carla = await nuevaCuenta('carla');
    unirAlEspacio(db, carla, ana, 'editor');
    const deCarla = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: carla.galleta }));
    assert.equal(deCarla.codigo, 201, 'el editor crea');
    assert.deepEqual(deCarla.datos.permisos, { escribir: true, papelera: false, completar: false });
    const id = deCarla.datos.proyecto.id;
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/1/rechazar`, { datos: { motivo: 'otra vez' }, galleta: carla.galleta })).codigo, 200, 'rechaza');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'instrucciones', instrucciones: PANELES }, galleta: carla.galleta })).codigo, 201, 'cambia');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/2/aprobar`, { galleta: carla.galleta })).codigo, 200, 'aprueba');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/nombre`, { datos: { nombre: 'De Carla' }, galleta: carla.galleta })).codigo, 200, 'renombra');
    const estado = (accion, galleta = carla.galleta) => pedir('POST', `/api/proyectos/${id}/estado`, { datos: { accion }, galleta });
    assert.equal((await estado('pausar')).datos.proyecto.estado, 'pausado');
    assert.equal((await estado('reanudar')).datos.proyecto.estado, 'en_ejecucion');
    for (const r of [await estado('completar'), await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: true }, galleta: carla.galleta })]) {
      assert.equal(r.codigo, 403);
      assert.equal(r.datos.error, 'solo_dueno');
    }
    // La dueña sí puede; y reabrir lo completado también es suyo.
    assert.equal((await estado('completar', ana.galleta)).datos.proyecto.estado, 'completado');
    assert.equal((await estado('reabrir')).datos.error, 'solo_dueno');
    assert.equal((await estado('reabrir', ana.galleta)).datos.proyecto.estado, 'en_ejecucion');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: true }, galleta: ana.galleta })).codigo, 200);
    assert.equal((await pedir('POST', `/api/proyectos/${id}/papelera`, { datos: { enPapelera: false }, galleta: carla.galleta })).datos.error, 'solo_dueno', 'restaurar es de la dueña');
    assert.deepEqual((await pedir('GET', '/api/proyectos', { galleta: ana.galleta })).datos.permisos, { escribir: true, papelera: true, completar: true });
  });
});

test('un lector solo puede ver; nadie entra sin sesión ni sin la protección contra pedidos falsos', async () => {
  await conPlataforma(async ({ base, admin, pedir, nuevaCuenta, db }) => {
    const ana = await nuevaCuenta('ana');
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: ana.galleta })).datos.proyecto;
    const luis = await nuevaCuenta('luis');
    unirAlEspacio(db, luis, ana, 'lector');
    const visto = await pedir('GET', `/api/proyectos/${id}`, { galleta: luis.galleta });
    assert.equal(visto.datos.puedeEscribir, false);
    assert.deepEqual(visto.datos.permisos, { escribir: false, papelera: false, completar: false });
    for (const [ruta, datos] of [[`/api/proyectos/${id}/versiones/1/aprobar`], ['/api/proyectos', { instrucciones: PANELES }], [`/api/proyectos/${id}/estado`, { accion: 'pausar' }], [`/api/proyectos/${id}/papelera`, { enPapelera: true }]]) {
      const r = await pedir('POST', ruta, { datos, galleta: luis.galleta });
      assert.equal(r.codigo, 403, ruta);
      assert.equal(r.datos.error, 'solo_lectura');
    }
    assert.equal((await pedir('GET', '/api/proyectos')).codigo, 401);
    assert.equal((await pedir('GET', '/api/catalogo')).codigo, 401);
    assert.equal((await pedir('GET', `/api/proyectos/${id}/versiones/1`)).codigo, 401);
    const sinCabecera = await fetch(`${base}/api/proyectos`, { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ instrucciones: PANELES }) });
    assert.equal(sinCabecera.status, 403);
    const otraPagina = await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin, cabeceras: { Origin: 'https://malo.example' } });
    assert.equal(otraPagina.codigo, 403);
  });
});

test('datos raros o enormes se rechazan con un error claro', async () => {
  await conPlataforma(async ({ admin, pedir }) => {
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'hola' }, galleta: admin })).datos.error, 'instrucciones_cortas');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: {}, galleta: admin })).datos.error, 'instrucciones_cortas');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: 'x'.repeat(4001) }, galleta: admin })).datos.error, 'instrucciones_largas');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: ['lista'] }, galleta: admin })).datos.error, 'datos_no_validos');
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'otro' }, galleta: admin })).datos.error, 'datos_no_validos');
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: 'texto' }, galleta: admin })).datos.error, 'datos_no_validos');
    for (const ruta of ['/api/proyectos/abc', '/api/proyectos/0', '/api/proyectos/-1', '/api/proyectos/1e3', '/api/proyectos/01', '/api/proyectos/1.0', '/api/proyectos/+1', '/api/proyectos/99999999999999999999']) {
      assert.equal((await pedir('GET', ruta, { galleta: admin })).codigo, 404, ruta);
    }
    assert.equal((await pedir('POST', `/api/proyectos/${id}/versiones/abc/aprobar`, { galleta: admin })).codigo, 409);
    const catalogo = await pedir('GET', '/api/catalogo', { galleta: admin });
    assert.equal(catalogo.datos.capacidades.length, 7);
    // Salarios del formulario: números, sin letras, y el mínimo nunca mayor que el máximo.
    const empleo = { tipo: 'laboral', producto: 'chofer', zonas: 'Santiago', capacidades: { investigar: true } };
    const conSalario = (salarioMinimo, salarioMaximo) => pedir('POST', `/api/proyectos/${id}/versiones`, { datos: { modo: 'campos', campos: { ...empleo, salarioMinimo, salarioMaximo } }, galleta: admin });
    assert.equal((await conSalario('50000', '20000')).datos.error, 'salario_al_reves');
    assert.equal((await conSalario('veinte mil', null)).datos.error, 'salario_no_valido');
    assert.equal((await conSalario(-5, null)).datos.error, 'salario_no_valido');
    const bien = await conSalario('20000', 50000);
    assert.equal(bien.codigo, 201);
    assert.deepEqual([bien.datos.pendiente.configuracion.salarioMinimo, bien.datos.pendiente.configuracion.salarioMaximo], [20000, 50000]);
  });
});

test('un valor del tipo equivocado (un objeto donde va un texto) da 400, nunca un error del servidor', async () => {
  await conPlataforma(async ({ admin, pedir, nuevaCuenta }) => {
    const raro = { toString: 0 };
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    const camposBuenos = { tipo: 'comercial', producto: 'paneles', sectores: 'hoteles', zonas: 'Santiago', capacidades: { investigar: true } };
    const pedidos = [
      ['/api/proyectos', { instrucciones: raro }],
      ['/api/proyectos', { instrucciones: 12345678901 }],
      [`/api/proyectos/${id}/versiones`, { modo: 'instrucciones', instrucciones: raro }],
      [`/api/proyectos/${id}/versiones/1/rechazar`, { motivo: raro }],
      [`/api/proyectos/${id}/versiones/1/rechazar`, { motivo: ['a'] }],
      [`/api/proyectos/${id}/estado`, { accion: raro }],
      [`/api/proyectos/${id}/estado`, { accion: ['pausar'] }],
      [`/api/proyectos/${id}/nombre`, { nombre: raro }],
      [`/api/proyectos/${id}/nombre`, { nombre: 7 }],
      [`/api/proyectos/${id}/papelera`, { enPapelera: raro }],
      ['/api/entrar', { nombre: raro, clave: CLAVE }],
      ['/api/entrar', { nombre: 'junior', clave: raro }],
      ['/api/yo/clave', { actual: raro, nueva: 'otra clave muy larga' }],
      ['/api/admin/usuarios', { nombre: raro }],
      ['/api/yo/avisos/vistos', { hasta: raro }],
      ...['tipo', 'objetivo', 'producto', 'moneda', 'frecuencia', 'autonomia', 'sectores', 'zonas', 'exclusiones', 'prioridades', 'paisCompleto',
        'experienciaNoRequerida', 'tamanos', 'capacidades', 'resueltas']
        .map(k => [`/api/proyectos/${id}/versiones`, { modo: 'campos', campos: { ...camposBuenos, [k]: raro } }]),
      [`/api/proyectos/${id}/versiones`, { modo: 'campos', campos: { ...camposBuenos, sectores: [raro] } }],
      [`/api/proyectos/${id}/versiones`, { modo: 'campos', campos: { ...camposBuenos, capacidades: { investigar: 'si' } } }],
      [`/api/proyectos/${id}/versiones`, { modo: 'campos', campos: { ...camposBuenos, resueltas: ['0'] } }],
      [`/api/proyectos/${id}/versiones`, { modo: 'campos', campos: { ...camposBuenos, salarioMinimo: raro } }],
      [`/api/proyectos/${id}/versiones`, { modo: 'campos', campos: [] }],
    ];
    for (const [ruta, datos] of pedidos) {
      const r = await pedir('POST', ruta, { datos, galleta: admin });
      assert.equal(r.codigo, 400, `${ruta} ${JSON.stringify(datos).slice(0, 120)} respondió ${r.codigo} ${r.datos.error}`);
      assert.ok(['datos_no_validos', 'accion_no_valida', 'salario_no_valido'].includes(r.datos.error), r.datos.error);
    }
    // Nada de eso cambió el proyecto.
    const r = await pedir('GET', `/api/proyectos/${id}`, { galleta: admin });
    assert.equal(r.datos.versiones.length, 1);
    assert.equal(r.datos.proyecto.nombre, 'Clientes para paneles solares · Hoteles');
    // Y un usuario normal tampoco puede romper nada con datos raros al entrar.
    const ana = await nuevaCuenta('ana');
    assert.equal((await pedir('POST', '/api/proyectos', { datos: { instrucciones: raro }, galleta: ana.galleta })).codigo, 400);
  });
});

test('hay un tope de cambios por persona para cuidar el servidor', async () => {
  const { crearRuteador } = await import('../src/nucleo/http.js');
  const { registrarRutasProyectos } = await import('../src/api/proyectos.js');
  const db = abrirBase(configDePrueba());
  db.prepare("INSERT INTO usuarios (nombre, clave_hash, rol, creado_en) VALUES ('ana', 'x', 'usuario', '2026-01-01')").run();
  db.prepare("INSERT INTO espacios (nombre, creado_en) VALUES ('e', '2026-01-01')").run();
  db.prepare("INSERT INTO miembros (espacio_id, usuario_id, rol, creado_en) VALUES (1, 1, 'dueno', '2026-01-01')").run();
  const rutas = crearRuteador();
  registrarRutasProyectos(rutas, { limites: { escrituras: new Limitador({ maximo: 2, ventanaMs: 60000 }) } });
  const ruta = rutas.buscar('POST', '/api/proyectos/1/estado');
  const pedido = () => ruta.manejador({ db, usuario: { id: 1, rol: 'usuario' }, parametros: { id: '1' }, req: null });
  for (let i = 0; i < 2; i++) await assert.rejects(pedido(), e => e.clave === 'datos_no_validos' || e.clave === 'no_existe' || e instanceof TypeError);
  await assert.rejects(pedido(), e => e.clave === 'demasiados_intentos');
  db.close();
});

test('también hay un tope de lecturas por persona (abrir proyectos una y otra vez)', async () => {
  const lecturas = new Limitador({ maximo: 3, ventanaMs: 60000 });
  await conPlataforma(async ({ admin, pedir, nuevaCuenta }) => {
    const { id } = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto;
    assert.equal((await pedir('GET', '/api/proyectos', { galleta: admin })).codigo, 200);
    assert.equal((await pedir('GET', `/api/proyectos/${id}`, { galleta: admin })).codigo, 200);
    assert.equal((await pedir('GET', `/api/proyectos/${id}/versiones/1`, { galleta: admin })).codigo, 200);
    const cuarta = await pedir('GET', `/api/proyectos/${id}`, { galleta: admin });
    assert.equal(cuarta.codigo, 429);
    assert.equal(cuarta.datos.error, 'demasiados_intentos');
    const ana = await nuevaCuenta('ana');
    assert.equal((await pedir('GET', '/api/proyectos', { galleta: ana.galleta })).codigo, 200, 'el tope es de cada persona');
  }, { proyectos: { limites: { lecturas } } });
});

test('sin CHECK en la base: el código solo guarda valores conocidos (tipo, estado, origen, historial)', async () => {
  await conPlataforma(async ({ admin, pedir, db }) => {
    const sql = db.prepare("SELECT group_concat(sql, ' ') AS s FROM sqlite_master WHERE name IN ('proyectos', 'proyecto_versiones', 'proyecto_historial')").get().s;
    assert.doesNotMatch(sql, /CHECK/i, 'las listas se revisan en el código, así una fase futura puede agregar valores');
    // Un recorrido completo por todo lo que se puede hacer.
    const a = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: PANELES }, galleta: admin })).datos.proyecto.id;
    const b = (await pedir('POST', '/api/proyectos', { datos: { instrucciones: CHOFER }, galleta: admin })).datos.proyecto.id;
    await pedir('POST', `/api/proyectos/${a}/versiones/1/aprobar`, { galleta: admin });
    await pedir('POST', `/api/proyectos/${b}/versiones/1/rechazar`, { datos: { motivo: 'no' }, galleta: admin });
    await pedir('POST', `/api/proyectos/${b}/versiones`, { datos: { modo: 'campos', campos: { tipo: 'laboral', producto: 'chofer', zonas: 'Santiago', capacidades: { investigar: true } } }, galleta: admin });
    await pedir('POST', `/api/proyectos/${a}/versiones`, { datos: { modo: 'instrucciones', instrucciones: 'Vendo paneles solares a hoteles en Punta Cana. Revisa solo cuando yo lo pida' }, galleta: admin });
    await pedir('POST', `/api/proyectos/${a}/versiones`, { datos: { modo: 'instrucciones', instrucciones: 'Vendo paneles solares a hoteles en Samaná' }, galleta: admin });
    await pedir('POST', `/api/proyectos/${a}/versiones/3/aprobar`, { galleta: admin });
    for (const accion of ['pausar', 'reanudar', 'completar', 'reabrir']) await pedir('POST', `/api/proyectos/${a}/estado`, { datos: { accion }, galleta: admin });
    marcarConErrores(db, db.prepare('SELECT id FROM proyectos WHERE numero = ?').get(a).id, 'falló');
    await pedir('POST', `/api/proyectos/${a}/estado`, { datos: { accion: 'reintentar' }, galleta: admin });
    await pedir('POST', `/api/proyectos/${a}/nombre`, { datos: { nombre: 'Mío' }, galleta: admin });
    await pedir('POST', `/api/proyectos/${a}/papelera`, { datos: { enPapelera: true }, galleta: admin });
    await pedir('POST', `/api/proyectos/${a}/papelera`, { datos: { enPapelera: false }, galleta: admin });
    revisarValoresDeLaBase(db);
    const estados = new Set(db.prepare('SELECT estado FROM proyecto_versiones').all().map(v => v.estado));
    assert.deepEqual([...estados].sort(), ['descartada', 'pendiente', 'rechazada', 'reemplazada', 'aprobada'].sort());
  });
});
