// Rutas de proyectos. Cada pedido trabaja SOLO dentro del espacio de quien pregunta.
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { interpretar, configuracionDesdeCampos, catalogo } from '../motor/interpretar.js';
import {
  espacioDe, listarProyectos, detalleProyecto, crearProyecto, nuevaVersion, aprobarVersion, rechazarVersion,
  cambiarEstado, renombrarProyecto, moverAPapelera, validarInstrucciones,
} from '../proyectos/proyectos.js';

const CATALOGO = catalogo();

// Cada cambio hace trabajar al motor: un tope por persona protege al servidor pequeño.
export function crearLimitesProyectos() {
  return { escrituras: new Limitador({ maximo: 120, ventanaMs: 10 * 60 * 1000 }) };
}

function resumenEspacio(db, e) {
  const proyectos = listarProyectos(db, e.id);
  return { proyectos, limite: e.limite, usados: proyectos.filter(p => !p.enPapelera).length, puedeEscribir: e.puedeEscribir };
}

export function registrarRutasProyectos(rutas, { limites = crearLimitesProyectos() } = {}) {
  // El espacio de quien pregunta; para cambiar algo, además, tiene que poder escribir y no pasarse del tope.
  function espacio(db, usuario, { escribir = false } = {}) {
    const e = espacioDe(db, usuario);
    if (!e) throw new ErrorHttp(409, 'sin_espacio');
    if (escribir && !e.puedeEscribir) throw new ErrorHttp(403, 'solo_lectura');
    if (escribir && !limites.escrituras.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return e;
  }

  rutas.agregar('GET', '/api/catalogo', () => ({ codigo: 200, datos: CATALOGO }));

  rutas.agregar('GET', '/api/proyectos', ({ db, usuario }) => ({ codigo: 200, datos: resumenEspacio(db, espacio(db, usuario)) }));

  rutas.agregar('POST', '/api/proyectos', async ({ db, req, usuario }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    const id = crearProyecto(db, { espacio: e, usuarioId: usuario.id, instrucciones: datos.instrucciones, idioma: usuario.idioma });
    return { codigo: 201, datos: detalleProyecto(db, e.id, id) };
  });

  rutas.agregar('GET', '/api/proyectos/:id', ({ db, usuario, parametros }) => {
    const e = espacio(db, usuario);
    return { codigo: 200, datos: { ...detalleProyecto(db, e.id, parametros.id), puedeEscribir: e.puedeEscribir } };
  });

  // Versión nueva: o se vuelven a escribir las instrucciones (el motor las interpreta otra vez),
  // o se cambian los campos a mano. En los dos casos queda esperando aprobación.
  rutas.agregar('POST', '/api/proyectos/:id/versiones', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    const actual = detalleProyecto(db, e.id, parametros.id);
    const base = actual.pendiente || actual.activa || actual.versiones[0];
    let version;
    if (datos.modo === 'instrucciones') {
      const instrucciones = validarInstrucciones(datos.instrucciones);
      const { configuracion, supuestos } = interpretar(instrucciones, { idioma: usuario.idioma });
      version = { instrucciones, configuracion, supuestos, origen: 'instrucciones' };
    } else if (datos.modo === 'campos' && datos.campos && typeof datos.campos === 'object') {
      version = { instrucciones: base.instrucciones, configuracion: configuracionDesdeCampos(datos.campos, base.configuracion), supuestos: [], origen: 'campos' };
    } else {
      throw new ErrorHttp(400, 'datos_no_validos');
    }
    nuevaVersion(db, { espacioId: e.id, proyectoId: actual.proyecto.id, usuarioId: usuario.id, ...version });
    return { codigo: 201, datos: detalleProyecto(db, e.id, actual.proyecto.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/versiones/:numero/aprobar', ({ db, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    aprobarVersion(db, { espacioId: e.id, proyectoId: parametros.id, numero: parametros.numero, usuarioId: usuario.id });
    return { codigo: 200, datos: detalleProyecto(db, e.id, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/versiones/:numero/rechazar', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    rechazarVersion(db, { espacioId: e.id, proyectoId: parametros.id, numero: parametros.numero, usuarioId: usuario.id, motivo: datos.motivo });
    return { codigo: 200, datos: detalleProyecto(db, e.id, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/estado', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    cambiarEstado(db, { espacioId: e.id, proyectoId: parametros.id, accion: datos.accion, usuarioId: usuario.id });
    return { codigo: 200, datos: detalleProyecto(db, e.id, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/nombre', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    renombrarProyecto(db, { espacioId: e.id, proyectoId: parametros.id, nombre: datos.nombre, usuarioId: usuario.id });
    return { codigo: 200, datos: detalleProyecto(db, e.id, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/papelera', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    if (typeof datos.enPapelera !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    moverAPapelera(db, { espacio: e, proyectoId: parametros.id, usuarioId: usuario.id, enPapelera: datos.enPapelera });
    return { codigo: 200, datos: detalleProyecto(db, e.id, parametros.id) };
  });
}

