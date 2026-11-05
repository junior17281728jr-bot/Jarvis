// Rutas del administrador para la «zona de sistema» (fase 1, parte c): el trabajo automático, el modo seguro,
// los avisos y la salud del servidor. Todas son solo para administradores.
//  - Las acciones (POST) pasan por un tope: 30 cada 10 minutos por administrador.
//  - Los errores son claves (por ejemplo 'accion_no_permitida_ahora'); las pantallas las traducen.
//  - Privacidad: de las tareas de proyectos (fase 2) el administrador solo ve el tipo, el estado, los contadores,
//    el número de proyecto y de cuenta, y una clave de error. Nunca sus datos ni sus resultados.
//  - Cada acción deja una fila de auditoría con el administrador que la hizo.
import { dirname } from 'node:path';
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { FASE_ACTUAL } from '../tareas/tipos.js';
import {
  resumenFila, proximasEjecuciones, erroresRecientes, listarTareas, reintentar, cancelar,
} from '../tareas/cola.js';
import { ultimasCorridas, reiniciosDesde } from '../tareas/corridas.js';
import { leerModoSeguro, ponerModoSeguro, leerFrenos } from '../tareas/modo-seguro.js';
import { avisosAbiertos, avisosRecientes, marcarVisto } from '../avisos/avisos.js';
import { medirSalud, evaluarSalud, semaforo, historialSalud } from '../nucleo/salud.js';
import { espacioDe } from '../proyectos/proyectos.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;
const DIA_MS = 86_400_000;

export function crearLimitesTareas() {
  return { acciones: new Limitador({ maximo: 30, ventanaMs: DIEZ_MINUTOS }) };
}

// Dónde está la base, preguntándole a la propia base (para medir la salud cuando no hay supervisor: pruebas).
function archivoDeLaBase(db) {
  try {
    return db.prepare("SELECT file FROM pragma_database_list WHERE name = 'main'").get()?.file || null;
  } catch {
    return null;
  }
}

function medir(db, supervisor) {
  if (supervisor?.medirAhora) return supervisor.medirAhora();
  const archivoBase = archivoDeLaBase(db);
  return medirSalud({ archivoBase, carpetaDatos: archivoBase ? dirname(archivoBase) : null });
}

// Lo que se muestra del modo seguro (sin el número interno del administrador).
function modoSeguroPublico(m) {
  return {
    activo: m.activo,
    origen: m.origen,
    motivo: m.motivo,
    desde: m.desde,
    version: m.version,
    ultimo: m.ultimo ? { desde: m.ultimo.desde ?? null, hasta: m.ultimo.hasta ?? null, por: m.ultimo.por ?? null, motivo: m.ultimo.motivo ?? null } : null,
  };
}

// Todo lo que muestra la zona de sistema de Administrador, en un solo pedido.
export function estadoDelSistema(db, { supervisor = null, usuario = null, version = '', codigo = '', ahora = Date.now() } = {}) {
  const espacioAdmin = usuario ? espacioDe(db, usuario)?.id ?? null : null;
  let trabajador;
  try {
    trabajador = supervisor?.estado ? supervisor.estado() : { fase: 'sin_supervisor' };
  } catch {
    trabajador = { fase: 'sin_supervisor' };
  }
  if (trabajador.reinicios24h == null) trabajador = { ...trabajador, reinicios24h: reiniciosDesde(db, ahora - DIA_MS) };
  const medidas = medir(db, supervisor);
  const problemas = evaluarSalud(medidas, { reinicios24h: trabajador.reinicios24h ?? 0 }).filter(p => p.activo);
  return {
    fase: FASE_ACTUAL,
    version,
    codigo,
    trabajador,
    modoSeguro: modoSeguroPublico(leerModoSeguro(db)),
    fila: resumenFila(db, { ahora }),
    frenos: leerFrenos(db, ahora).map(f => ({ tipo: f.tipo, hasta: f.hasta })),
    proximas: proximasEjecuciones(db, { ahora }),
    errores: erroresRecientes(db, { limite: 20, espacioAdmin }),
    corridas: ultimasCorridas(db, 5).map(c => ({
      empezoEn: c.empezoEn, terminoEn: c.terminoEn, como: c.como, codigoSalida: c.codigoSalida, senal: c.senal, version: c.version, pasosHechos: c.pasosHechos,
    })),
    avisos: { abiertos: avisosAbiertos(db), recientes: avisosRecientes(db, { ahora }) },
    salud: { ...medidas, semaforo: semaforo(problemas), problemas },
    historial: historialSalud(db, { horas: 24 }),
  };
}

// opciones.supervisor: el que cuida al trabajador (null en las pruebas que no lo usan).
// opciones.version y opciones.codigo: la versión de package.json y la huella del código (para el modo seguro).
export function registrarRutasTareas(rutas, { supervisor = null, limites = crearLimitesTareas(), version = '', codigo = '' } = {}) {
  const topes = { ...crearLimitesTareas(), ...limites };

  function contarAccion(usuario) {
    if (!topes.acciones.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
  }

  const sistema = (db, usuario) => estadoDelSistema(db, { supervisor, usuario, version, codigo });

  rutas.agregar('GET', '/api/admin/sistema', ({ db, usuario }) => ({ codigo: 200, datos: sistema(db, usuario) }), { admin: true });

  // La fila completa, de a 25 (las más nuevas primero). ?estado=fallida filtra; ?antes=<id> trae las siguientes.
  rutas.agregar('GET', '/api/admin/tareas', ({ db, req, usuario }) => {
    const consulta = new URL(req.url, 'http://x').searchParams;
    const espacioAdmin = espacioDe(db, usuario)?.id ?? null;
    return { codigo: 200, datos: listarTareas(db, { estado: consulta.get('estado'), antesDe: consulta.get('antes'), limite: 25, espacioAdmin }) };
  }, { admin: true });

  // Activar o quitar el modo seguro desde la pantalla. El supervisor lo aplica enseguida.
  rutas.agregar('POST', '/api/admin/modo-seguro', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (typeof datos?.activo !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    contarAccion(usuario);
    if (supervisor?.ponerModoSeguro) supervisor.ponerModoSeguro({ activo: datos.activo, usuarioId: usuario.id });
    else ponerModoSeguro(db, { activo: datos.activo, origen: 'admin', usuarioId: usuario.id, codigo, version });
    return { codigo: 200, datos: sistema(db, usuario) };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/tareas/:id/reintentar', ({ db, usuario, parametros }) => {
    contarAccion(usuario);
    const r = reintentar(db, { id: parametros.id, usuarioId: usuario.id });
    try { supervisor?.despertar?.(); } catch { /* el trabajador la tomará en su próxima vuelta */ }
    return { codigo: 200, datos: r };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/tareas/:id/cancelar', ({ db, usuario, parametros }) => {
    contarAccion(usuario);
    return { codigo: 200, datos: cancelar(db, { id: parametros.id, usuarioId: usuario.id }) };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/avisos/:id/visto', ({ db, usuario, parametros }) => {
    contarAccion(usuario);
    if (!marcarVisto(db, { id: parametros.id, usuarioId: usuario.id })) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos: { ok: true } };
  }, { admin: true });
}
