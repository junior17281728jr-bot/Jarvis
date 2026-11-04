// Rutas de proyectos. Cada pedido trabaja SOLO dentro del espacio de quien pregunta.
// Todo dato que llega se revisa aquí, en la entrada: un valor del tipo equivocado (un objeto donde va un texto,
// por ejemplo) se responde con 400 datos_no_validos, nunca con un error del servidor.
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { interpretar, configuracionDesdeCampos, catalogo } from '../motor/interpretar.js';
import {
  espacioDe, permisosDe, listarProyectos, detalleProyecto, versionDeProyecto, baseParaCambiar, crearProyecto, nuevaVersion,
  aprobarVersion, rechazarVersion, cambiarEstado, renombrarProyecto, moverAPapelera, validarInstrucciones,
} from '../proyectos/proyectos.js';

const CATALOGO = catalogo();
// Versiones que se pueden volver a usar: las que no están en uso ni esperan aprobación.
const ESTADOS_REUSABLES = ['descartada', 'rechazada', 'reemplazada'];
const DIEZ_MINUTOS = 10 * 60 * 1000;

// Cada cambio hace trabajar al motor y cada lectura arma una respuesta: un tope por persona protege al servidor pequeño.
export function crearLimitesProyectos() {
  return {
    escrituras: new Limitador({ maximo: 120, ventanaMs: DIEZ_MINUTOS }),
    lecturas: new Limitador({ maximo: 600, ventanaMs: DIEZ_MINUTOS }),
  };
}

// El motor se puede cambiar en las pruebas, para comprobar que no trabaja cuando el pedido no se va a poder guardar.
const MOTOR = { interpretar, configuracionDesdeCampos };

// ---------- Revisión de lo que manda el formulario «Cambiar los datos a mano» ----------
const CAMPOS_TEXTO = ['tipo', 'objetivo', 'producto', 'moneda', 'frecuencia', 'autonomia'];
const CAMPOS_TEXTO_O_LISTA = ['sectores', 'zonas', 'exclusiones', 'prioridades'];
const CAMPOS_SI_NO = ['paisCompleto', 'experienciaNoRequerida'];
const CAMPOS_SALARIO = ['salarioMinimo', 'salarioMaximo'];

const vacio = v => v === undefined || v === null;
const esTexto = v => vacio(v) || typeof v === 'string';
const listaDeTextos = (v, maximo) => Array.isArray(v) && v.length <= maximo && v.every(x => typeof x === 'string');

// Un salario: vacío, o un número entero positivo (como número o como texto de cifras).
function salarioDe(v) {
  if (vacio(v) || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && /^\s*\d{1,12}(?:\.\d{1,2})?\s*$/.test(v)) return Number(v);
  throw new ErrorHttp(400, 'salario_no_valido');
}

export function revisarCampos(campos) {
  const mal = () => new ErrorHttp(400, 'datos_no_validos');
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) throw mal();
  for (const k of CAMPOS_TEXTO) if (!esTexto(campos[k])) throw mal();
  for (const k of CAMPOS_TEXTO_O_LISTA) if (!esTexto(campos[k]) && !listaDeTextos(campos[k], 200)) throw mal();
  for (const k of CAMPOS_SI_NO) if (!vacio(campos[k]) && typeof campos[k] !== 'boolean') throw mal();
  if (!vacio(campos.tamanos) && !listaDeTextos(campos.tamanos, 20)) throw mal();
  if (!vacio(campos.capacidades)) {
    const c = campos.capacidades;
    if (typeof c !== 'object' || Array.isArray(c) || !Object.values(c).every(x => typeof x === 'boolean')) throw mal();
  }
  if (!vacio(campos.resueltas) && !(Array.isArray(campos.resueltas) && campos.resueltas.length <= 50 && campos.resueltas.every(Number.isSafeInteger))) throw mal();
  const [minimo, maximo] = CAMPOS_SALARIO.map(k => salarioDe(campos[k]));
  if (minimo != null && maximo != null && minimo > maximo) throw new ErrorHttp(400, 'salario_al_reves');
  return campos;
}

function resumenEspacio(db, e) {
  const proyectos = listarProyectos(db, e.id);
  return {
    proyectos,
    limite: e.limite,
    usados: proyectos.filter(p => !p.enPapelera).length,
    guardados: proyectos.length,
    maximoGuardados: e.maximoGuardados,
    plan: e.plan,
    rol: e.rol,
    puedeEscribir: e.puedeEscribir,
    permisos: permisosDe(e),
  };
}

export function registrarRutasProyectos(rutas, { limites = {}, motor = MOTOR } = {}) {
  const topes = { ...crearLimitesProyectos(), ...limites };

  // El espacio de quien pregunta; para cambiar algo, además, tiene que poder escribir y no pasarse del tope.
  function espacio(db, usuario, { escribir = false } = {}) {
    const e = espacioDe(db, usuario);
    if (!e) throw new ErrorHttp(409, 'sin_espacio');
    if (escribir && !e.puedeEscribir) throw new ErrorHttp(403, 'solo_lectura');
    const tope = escribir ? topes.escrituras : topes.lecturas;
    if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return e;
  }

  // El proyecto como lo ven las pantallas, con lo que esta persona puede hacer en él.
  const detalle = (db, e, numero) => ({ ...detalleProyecto(db, e.id, numero), puedeEscribir: e.puedeEscribir, permisos: permisosDe(e) });

  rutas.agregar('GET', '/api/catalogo', () => ({ codigo: 200, datos: CATALOGO }));

  rutas.agregar('GET', '/api/proyectos', ({ db, usuario }) => ({ codigo: 200, datos: resumenEspacio(db, espacio(db, usuario)) }));

  rutas.agregar('POST', '/api/proyectos', async ({ db, req, usuario }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    const instrucciones = textoDe(datos, 'instrucciones');
    const { numero, repetido } = crearProyecto(db, { espacio: e, usuarioId: usuario.id, instrucciones, idioma: usuario.idioma, interpretarCon: motor.interpretar });
    return { codigo: repetido ? 200 : 201, datos: { ...detalle(db, e, numero), repetido } };
  });

  rutas.agregar('GET', '/api/proyectos/:id', ({ db, usuario, parametros }) => {
    const e = espacio(db, usuario);
    return { codigo: 200, datos: detalle(db, e, parametros.id) };
  });

  rutas.agregar('GET', '/api/proyectos/:id/versiones/:numero', ({ db, usuario, parametros }) => {
    const e = espacio(db, usuario);
    return { codigo: 200, datos: { version: versionDeProyecto(db, e.id, parametros.id, parametros.numero) } };
  });

  // Versión nueva: o se vuelven a escribir las instrucciones (el motor las interpreta otra vez),
  // o se cambian los campos a mano, o se vuelve a usar una versión anterior que no quedó en uso
  // (modo 'version': cambiada antes de aprobar, rechazada o usada antes). En todos los casos queda esperando aprobación.
  // Antes de que trabaje el motor se revisa que se pueda guardar (papelera, tope de versiones).
  rutas.agregar('POST', '/api/proyectos/:id/versiones', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    let pedido;
    if (datos.modo === 'instrucciones') pedido = { instrucciones: validarInstrucciones(textoDe(datos, 'instrucciones')) };
    else if (datos.modo === 'campos') pedido = { campos: revisarCampos(datos.campos) };
    else if (datos.modo === 'version' && Number.isSafeInteger(datos.numero) && datos.numero > 0) pedido = { desde: datos.numero };
    else throw new ErrorHttp(400, 'datos_no_validos');
    const { numero, base } = baseParaCambiar(db, e.id, parametros.id);
    let version;
    if (pedido.desde) {
      // Se copia tal cual (instrucciones y datos): el motor no trabaja.
      const vieja = versionDeProyecto(db, e.id, parametros.id, pedido.desde);
      if (!ESTADOS_REUSABLES.includes(vieja.estado)) throw new ErrorHttp(409, 'version_no_reusable');
      version = { instrucciones: vieja.instrucciones, configuracion: vieja.configuracion, supuestos: vieja.supuestos, origen: vieja.origen };
    } else if (pedido.instrucciones) {
      const { configuracion, supuestos } = motor.interpretar(pedido.instrucciones, { idioma: usuario.idioma });
      version = { instrucciones: pedido.instrucciones, configuracion, supuestos, origen: 'instrucciones' };
    } else {
      version = { instrucciones: base.instrucciones, configuracion: motor.configuracionDesdeCampos(pedido.campos, base.configuracion), supuestos: [], origen: 'campos' };
    }
    nuevaVersion(db, { espacioId: e.id, proyectoId: numero, usuarioId: usuario.id, ...version });
    return { codigo: 201, datos: detalle(db, e, numero) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/versiones/:numero/aprobar', ({ db, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    aprobarVersion(db, { espacioId: e.id, proyectoId: parametros.id, numero: parametros.numero, usuarioId: usuario.id, idioma: usuario.idioma });
    return { codigo: 200, datos: detalle(db, e, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/versiones/:numero/rechazar', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    rechazarVersion(db, { espacioId: e.id, proyectoId: parametros.id, numero: parametros.numero, usuarioId: usuario.id, motivo: textoDe(datos, 'motivo') });
    return { codigo: 200, datos: detalle(db, e, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/estado', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    cambiarEstado(db, { espacio: e, proyectoId: parametros.id, accion: textoDe(datos, 'accion'), usuarioId: usuario.id });
    return { codigo: 200, datos: detalle(db, e, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/nombre', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    renombrarProyecto(db, { espacioId: e.id, proyectoId: parametros.id, nombre: textoDe(datos, 'nombre'), usuarioId: usuario.id });
    return { codigo: 200, datos: detalle(db, e, parametros.id) };
  });

  rutas.agregar('POST', '/api/proyectos/:id/papelera', async ({ db, req, usuario, parametros }) => {
    const e = espacio(db, usuario, { escribir: true });
    const datos = await leerJson(req);
    if (typeof datos.enPapelera !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    moverAPapelera(db, { espacio: e, proyectoId: parametros.id, usuarioId: usuario.id, enPapelera: datos.enPapelera });
    return { codigo: 200, datos: detalle(db, e, parametros.id) };
  });
}
