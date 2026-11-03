// Proyectos: cada uno con sus instrucciones, su configuración por versiones, su estado y su historial.
// REGLA DE PRIVACIDAD: toda consulta lleva el espacio de quien pregunta (WHERE espacio_id = ?),
// así una cuenta nunca ve ni cambia proyectos de otra. Ni el administrador ve proyectos ajenos.
// Aquí nunca se borra nada: «eliminar» manda a la papelera, y una versión vieja queda en el historial.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { interpretar, limpiarConfiguracion, faltantes, nombreSugerido, LIMITES } from '../motor/interpretar.js';

const ahora = () => new Date().toISOString();

export const ESTADOS = ['borrador', 'pendiente', 'en_ejecucion', 'pausado', 'completado', 'con_errores'];

// Botones de estado: de qué estados se puede salir con cada uno y a cuál se llega.
export const ACCIONES = {
  pausar: { desde: ['en_ejecucion', 'con_errores'], hacia: 'pausado', evento: 'pausado' },
  reanudar: { desde: ['pausado'], hacia: 'en_ejecucion', evento: 'reanudado' },
  completar: { desde: ['en_ejecucion', 'pausado'], hacia: 'completado', evento: 'completado' },
  reabrir: { desde: ['completado'], hacia: 'en_ejecucion', evento: 'reabierto' },
  reintentar: { desde: ['con_errores'], hacia: 'en_ejecucion', evento: 'reintentado' },
};

// Cuántos proyectos (fuera de la papelera) puede tener cada espacio según su plan.
export const LIMITE_POR_PLAN = { prueba: 5, gratis: 1, pago: 5, empresarial: 20 };
export const LIMITE_ADMINISTRADOR = 20;
export const MAXIMO_VERSIONES = 500;
export const MINIMO_INSTRUCCIONES = 10;

const ROLES_QUE_ESCRIBEN = new Set(['dueno', 'editor']);

// ---------- Espacio de quien pregunta ----------
export function espacioDe(db, usuario) {
  const fila = db.prepare(`SELECT m.espacio_id, m.rol, e.plan FROM miembros m JOIN espacios e ON e.id = m.espacio_id
    WHERE m.usuario_id = ?
    ORDER BY CASE m.rol WHEN 'dueno' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, m.espacio_id LIMIT 1`).get(usuario.id);
  if (!fila) return null;
  const limitePlan = LIMITE_POR_PLAN[fila.plan] ?? 1;
  return {
    id: fila.espacio_id,
    rol: fila.rol,
    plan: fila.plan,
    puedeEscribir: ROLES_QUE_ESCRIBEN.has(fila.rol),
    limite: usuario.rol === 'admin' ? Math.max(limitePlan, LIMITE_ADMINISTRADOR) : limitePlan,
  };
}

function contarActivos(db, espacioId) {
  return db.prepare('SELECT COUNT(*) AS n FROM proyectos WHERE espacio_id = ? AND en_papelera = 0').get(espacioId).n;
}

function anotar(db, proyectoId, usuarioId, accion, detalle = null) {
  db.prepare('INSERT INTO proyecto_historial (proyecto_id, fecha, usuario_id, accion, detalle) VALUES (?, ?, ?, ?, ?)')
    .run(proyectoId, ahora(), usuarioId, accion, detalle == null ? null : JSON.stringify(detalle));
}

function filaProyecto(db, espacioId, proyectoId) {
  const id = Number(proyectoId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErrorHttp(404, 'no_existe');
  const fila = db.prepare('SELECT * FROM proyectos WHERE id = ? AND espacio_id = ?').get(id, espacioId);
  if (!fila) throw new ErrorHttp(404, 'no_existe');
  return fila;
}

function noEnPapelera(fila) {
  if (fila.en_papelera === 1) throw new ErrorHttp(409, 'en_papelera');
}

function tocar(db, proyectoId, cambios = {}) {
  const columnas = Object.keys(cambios);
  const sets = [...columnas.map(c => `${c} = ?`), 'actualizado_en = ?'].join(', ');
  db.prepare(`UPDATE proyectos SET ${sets} WHERE id = ?`).run(...columnas.map(c => cambios[c]), ahora(), proyectoId);
}

// ---------- Cómo se muestra cada cosa ----------
function leerJson(texto, porDefecto) {
  try { return JSON.parse(texto); } catch { return porDefecto; }
}

function versionPublica(v) {
  const configuracion = limpiarConfiguracion(leerJson(v.configuracion, {}));
  const interpretacion = leerJson(v.interpretacion, {});
  return {
    numero: v.numero,
    estado: v.estado,
    origen: v.origen,
    instrucciones: v.instrucciones,
    configuracion,
    supuestos: Array.isArray(interpretacion.supuestos) ? interpretacion.supuestos : [],
    faltantes: faltantes(configuracion),
    motivo: v.motivo,
    creadaEn: v.creada_en,
    decididaEn: v.decidida_en,
  };
}

function proyectoPublico(p, pendiente = null) {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    estado: p.estado,
    enPapelera: p.en_papelera === 1,
    versionActiva: p.version_activa,
    versionPendiente: pendiente,
    motivoError: p.motivo_error,
    creadoEn: p.creado_en,
    actualizadoEn: p.actualizado_en,
  };
}

// ---------- Leer ----------
export function listarProyectos(db, espacioId) {
  return db.prepare(`SELECT p.*, (SELECT v.numero FROM proyecto_versiones v WHERE v.proyecto_id = p.id AND v.estado = 'pendiente') AS pendiente
    FROM proyectos p WHERE p.espacio_id = ? ORDER BY p.en_papelera, p.actualizado_en DESC, p.id DESC`).all(espacioId)
    .map(p => proyectoPublico(p, p.pendiente ?? null));
}

export function detalleProyecto(db, espacioId, proyectoId) {
  const p = filaProyecto(db, espacioId, proyectoId);
  const versiones = db.prepare('SELECT * FROM proyecto_versiones WHERE proyecto_id = ? ORDER BY numero DESC').all(p.id).map(versionPublica);
  const historial = db.prepare('SELECT fecha, accion, detalle FROM proyecto_historial WHERE proyecto_id = ? ORDER BY id DESC LIMIT 100').all(p.id)
    .map(h => ({ fecha: h.fecha, accion: h.accion, detalle: leerJson(h.detalle, null) }));
  const pendiente = versiones.find(v => v.estado === 'pendiente') || null;
  return {
    proyecto: proyectoPublico(p, pendiente?.numero ?? null),
    activa: versiones.find(v => v.numero === p.version_activa) || null,
    pendiente,
    versiones,
    historial,
  };
}

// ---------- Crear y cambiar ----------
export function validarInstrucciones(texto) {
  const instrucciones = String(texto ?? '').trim();
  if (instrucciones.length < MINIMO_INSTRUCCIONES) throw new ErrorHttp(400, 'instrucciones_cortas');
  if (instrucciones.length > LIMITES.instrucciones) throw new ErrorHttp(400, 'instrucciones_largas');
  return instrucciones;
}

export function crearProyecto(db, { espacio, usuarioId, instrucciones, idioma = 'es' }) {
  const texto = validarInstrucciones(instrucciones);
  const { configuracion, supuestos } = interpretar(texto, { idioma });
  return enTransaccion(db, () => {
    if (contarActivos(db, espacio.id) >= espacio.limite) throw new ErrorHttp(409, 'limite_de_proyectos');
    const momento = ahora();
    const r = db.prepare(`INSERT INTO proyectos (espacio_id, nombre, tipo, estado, creado_por, creado_en, actualizado_en)
      VALUES (?, ?, ?, 'pendiente', ?, ?, ?)`).run(espacio.id, nombreSugerido(configuracion, idioma), configuracion.tipo, usuarioId, momento, momento);
    const id = Number(r.lastInsertRowid);
    db.prepare(`INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, interpretacion, origen, estado, creada_por, creada_en)
      VALUES (?, 1, ?, ?, ?, 'instrucciones', 'pendiente', ?, ?)`)
      .run(id, texto, JSON.stringify(configuracion), JSON.stringify({ supuestos }), usuarioId, momento);
    anotar(db, id, usuarioId, 'creado', { numero: 1 });
    return id;
  });
}

// Guarda una versión nueva que espera aprobación. Si ya había otra esperando, esa queda «descartada».
// La versión aprobada que está en uso NO cambia hasta que se apruebe la nueva.
export function nuevaVersion(db, { espacioId, proyectoId, usuarioId, instrucciones, configuracion, supuestos = [], origen }) {
  const config = limpiarConfiguracion(configuracion);
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    noEnPapelera(p);
    const { n, maximo } = db.prepare('SELECT COUNT(*) AS n, MAX(numero) AS maximo FROM proyecto_versiones WHERE proyecto_id = ?').get(p.id);
    if (n >= MAXIMO_VERSIONES) throw new ErrorHttp(409, 'demasiadas_versiones');
    const momento = ahora();
    db.prepare(`UPDATE proyecto_versiones SET estado = 'descartada', decidida_por = ?, decidida_en = ?
      WHERE proyecto_id = ? AND estado = 'pendiente'`).run(usuarioId, momento, p.id);
    const numero = (maximo ?? 0) + 1;
    db.prepare(`INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, interpretacion, origen, estado, creada_por, creada_en)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`)
      .run(p.id, numero, instrucciones, JSON.stringify(config), JSON.stringify({ supuestos }), origen === 'campos' ? 'campos' : 'instrucciones', usuarioId, momento);
    const cambios = {};
    if (p.estado === 'borrador') cambios.estado = 'pendiente';
    if (p.version_activa == null) cambios.tipo = config.tipo;
    tocar(db, p.id, cambios);
    anotar(db, p.id, usuarioId, 'version_nueva', { numero });
    return numero;
  });
}

function versionPendiente(db, proyectoId, numero) {
  const v = db.prepare("SELECT * FROM proyecto_versiones WHERE proyecto_id = ? AND numero = ? AND estado = 'pendiente'").get(proyectoId, Number(numero));
  if (!v) throw new ErrorHttp(409, 'version_no_pendiente');
  return v;
}

export function aprobarVersion(db, { espacioId, proyectoId, numero, usuarioId }) {
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    noEnPapelera(p);
    const v = versionPendiente(db, p.id, numero);
    const config = limpiarConfiguracion(leerJson(v.configuracion, {}));
    if (faltantes(config).length) throw new ErrorHttp(400, 'faltan_datos');
    const momento = ahora();
    if (p.version_activa != null) {
      db.prepare("UPDATE proyecto_versiones SET estado = 'reemplazada' WHERE proyecto_id = ? AND numero = ? AND estado = 'aprobada'").run(p.id, p.version_activa);
    }
    db.prepare("UPDATE proyecto_versiones SET estado = 'aprobada', decidida_por = ?, decidida_en = ? WHERE id = ?").run(usuarioId, momento, v.id);
    const cambios = { version_activa: v.numero, tipo: config.tipo };
    if (p.estado === 'borrador' || p.estado === 'pendiente') cambios.estado = 'en_ejecucion';
    tocar(db, p.id, cambios);
    anotar(db, p.id, usuarioId, 'aprobada', { numero: v.numero });
    return v.numero;
  });
}

export function rechazarVersion(db, { espacioId, proyectoId, numero, usuarioId, motivo = '' }) {
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    noEnPapelera(p);
    const v = versionPendiente(db, p.id, numero);
    const razon = String(motivo ?? '').trim().slice(0, 300) || null;
    db.prepare("UPDATE proyecto_versiones SET estado = 'rechazada', motivo = ?, decidida_por = ?, decidida_en = ? WHERE id = ?")
      .run(razon, usuarioId, ahora(), v.id);
    tocar(db, p.id, p.version_activa == null ? { estado: 'borrador' } : {});
    anotar(db, p.id, usuarioId, 'rechazada', { numero: v.numero, motivo: razon });
    return v.numero;
  });
}

export function cambiarEstado(db, { espacioId, proyectoId, accion, usuarioId }) {
  const regla = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null;
  if (!regla) throw new ErrorHttp(400, 'accion_no_valida');
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    noEnPapelera(p);
    if (!regla.desde.includes(p.estado)) throw new ErrorHttp(409, 'accion_no_permitida_ahora');
    tocar(db, p.id, accion === 'reintentar' ? { estado: regla.hacia, motivo_error: null } : { estado: regla.hacia });
    anotar(db, p.id, usuarioId, regla.evento);
    return regla.hacia;
  });
}

export function renombrarProyecto(db, { espacioId, proyectoId, nombre, usuarioId }) {
  const limpio = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio || limpio.length > LIMITES.nombre) throw new ErrorHttp(400, 'nombre_proyecto_no_valido');
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    if (p.nombre === limpio) return limpio;
    tocar(db, p.id, { nombre: limpio });
    anotar(db, p.id, usuarioId, 'renombrado', { antes: p.nombre, ahora: limpio });
    return limpio;
  });
}

// Papelera: el proyecto deja de trabajar y se esconde, pero no se borra. Se puede restaurar.
export function moverAPapelera(db, { espacio, proyectoId, usuarioId, enPapelera }) {
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacio.id, proyectoId);
    const quiere = enPapelera === true;
    if ((p.en_papelera === 1) === quiere) return quiere;
    if (!quiere && contarActivos(db, espacio.id) >= espacio.limite) throw new ErrorHttp(409, 'limite_de_proyectos');
    tocar(db, p.id, { en_papelera: quiere ? 1 : 0 });
    anotar(db, p.id, usuarioId, quiere ? 'a_papelera' : 'restaurado');
    return quiere;
  });
}

// Para la fila de tareas (parte c): si un trabajo falla, el proyecto queda «Con errores» con el motivo a la vista.
export function marcarConErrores(db, proyectoId, motivo) {
  return enTransaccion(db, () => {
    const p = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(Number(proyectoId));
    if (!p || p.estado !== 'en_ejecucion' || p.en_papelera === 1) return false;
    const razon = String(motivo ?? '').trim().slice(0, 300) || null;
    tocar(db, p.id, { estado: 'con_errores', motivo_error: razon });
    anotar(db, p.id, null, 'con_errores', { motivo: razon });
    return true;
  });
}
