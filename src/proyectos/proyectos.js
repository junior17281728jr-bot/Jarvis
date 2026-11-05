// Proyectos: cada uno con sus instrucciones, su configuración por versiones, su estado y su historial.
// REGLA DE PRIVACIDAD: toda consulta lleva el espacio de quien pregunta (WHERE espacio_id = ?),
// así una cuenta nunca ve ni cambia proyectos de otra. Ni el administrador ve proyectos ajenos.
// Las pantallas solo ven el número del proyecto DENTRO de su espacio (1, 2, 3…), nunca el id interno.
// Aquí nunca se borra nada: «eliminar» manda a la papelera, y una versión vieja queda en el historial.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { interpretar, limpiarConfiguracion, faltantes, dudas, nombreSugerido, idiomaDelNombre, LIMITES, TIPOS } from '../motor/interpretar.js';
import { limiteDe, guardadosPermitidos, contarProyectos, LIMITE_POR_PLAN, LIMITE_ADMINISTRADOR } from '../cuentas/planes.js';

export { LIMITE_POR_PLAN, LIMITE_ADMINISTRADOR };

const ahora = () => new Date().toISOString();

// Valores permitidos. La base no los revisa (sin CHECK, para poder agregar valores en fases futuras):
// los revisa el código antes de escribir, y test/proyectos.test.js comprueba que en la base solo haya estos.
export const ESTADOS = ['borrador', 'pendiente', 'en_ejecucion', 'pausado', 'completado', 'con_errores'];
export const ESTADOS_VERSION = ['pendiente', 'aprobada', 'rechazada', 'reemplazada', 'descartada'];
export const ORIGENES = ['instrucciones', 'campos'];

// Botones de estado: de qué estados se puede salir con cada uno y a cuál se llega.
// «soloDueno»: el editor puede pausar, reanudar y reintentar; completar (y reabrir lo completado) es del dueño.
export const ACCIONES = {
  pausar: { desde: ['en_ejecucion', 'con_errores'], hacia: 'pausado', evento: 'pausado' },
  reanudar: { desde: ['pausado'], hacia: 'en_ejecucion', evento: 'reanudado' },
  completar: { desde: ['en_ejecucion', 'pausado'], hacia: 'completado', evento: 'completado', soloDueno: true },
  reabrir: { desde: ['completado'], hacia: 'en_ejecucion', evento: 'reabierto', soloDueno: true },
  reintentar: { desde: ['con_errores'], hacia: 'en_ejecucion', evento: 'reintentado' },
};

// Lo que queda escrito en el historial de cada proyecto.
export const EVENTOS = ['creado', 'version_nueva', 'aprobada', 'rechazada', 'renombrado', 'a_papelera', 'restaurado', 'con_errores',
  ...new Set(Object.values(ACCIONES).map(a => a.evento))];

// Topes para cuidar el disco del servidor (nada se borra nunca, así que lo guardado solo crece).
export const MAXIMO_VERSIONES = 100;            // versiones guardadas por proyecto
export const MAXIMO_BYTES_VERSION = 24 * 1024;  // tamaño de una versión (instrucciones + configuración)
export const MINIMO_INSTRUCCIONES = 10;
// El detalle de un proyecto trae completas la versión en uso, la que espera y las 3 últimas; de las demás,
// solo número, estado y fechas (se abren una por una con GET /api/proyectos/:id/versiones/:numero).
export const VERSIONES_COMPLETAS = 3;
// Si llega el mismo pedido de crear dos veces seguidas (dos toques con internet lento), se devuelve el mismo proyecto.
const VENTANA_REPETIDO_MS = 2 * 60 * 1000;

const ROLES_QUE_ESCRIBEN = new Set(['dueno', 'editor']);

// Un valor que no está en su lista es un error del programa (no de la persona): se detiene antes de guardarlo.
function exigir(lista, valor, que) {
  if (!lista.includes(valor)) throw new Error(`Valor no permitido para ${que}: ${valor}`);
  return valor;
}

// ---------- Espacio de quien pregunta ----------
export function espacioDe(db, usuario) {
  // El límite es el del espacio: depende de su plan y de quién es su dueño (un administrador tiene al menos 20),
  // no de quién pregunta (un editor o lector del espacio ve el mismo límite que el dueño).
  const fila = db.prepare(`SELECT m.espacio_id, m.rol, e.plan,
      (SELECT u.rol FROM miembros d JOIN usuarios u ON u.id = d.usuario_id WHERE d.espacio_id = e.id AND d.rol = 'dueno' ORDER BY d.usuario_id LIMIT 1) AS rol_dueno
    FROM miembros m JOIN espacios e ON e.id = m.espacio_id
    WHERE m.usuario_id = ?
    ORDER BY CASE m.rol WHEN 'dueno' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, m.espacio_id LIMIT 1`).get(usuario.id);
  if (!fila) return null;
  const limite = limiteDe(fila.plan, fila.rol_dueno ?? usuario.rol);
  const esDueno = fila.rol === 'dueno';
  return {
    id: fila.espacio_id,
    rol: fila.rol,
    plan: fila.plan,
    puedeEscribir: ROLES_QUE_ESCRIBEN.has(fila.rol),
    esDueno,
    limite,
    maximoGuardados: guardadosPermitidos(limite),
  };
}

// El límite del espacio leído AHORA de la base (su plan y el rol de su dueño). Las revisiones que van dentro de una
// transacción usan este, no el que se calculó al empezar el pedido: si el administrador bajó el plan mientras
// llegaba un pedido lento, vale el plan nuevo.
export function limiteActual(db, espacioId) {
  const fila = db.prepare(`SELECT e.plan,
      (SELECT u.rol FROM miembros d JOIN usuarios u ON u.id = d.usuario_id WHERE d.espacio_id = e.id AND d.rol = 'dueno' ORDER BY d.usuario_id LIMIT 1) AS rol_dueno
    FROM espacios e WHERE e.id = ?`).get(espacioId);
  const limite = limiteDe(fila?.plan, fila?.rol_dueno ?? 'usuario');
  return { limite, maximoGuardados: guardadosPermitidos(limite) };
}

// Lo que cada rol puede hacer, para que las pantallas muestren solo los botones que funcionan.
export function permisosDe(espacio) {
  return { escribir: espacio.puedeEscribir, papelera: espacio.esDueno, completar: espacio.esDueno };
}

function soloDueno(espacio) {
  if (!espacio.esDueno) throw new ErrorHttp(403, 'solo_dueno');
}

function anotar(db, proyectoId, usuarioId, accion, detalle = null) {
  db.prepare('INSERT INTO proyecto_historial (proyecto_id, fecha, usuario_id, accion, detalle) VALUES (?, ?, ?, ?, ?)')
    .run(proyectoId, ahora(), usuarioId, exigir(EVENTOS, accion, 'historial'), detalle == null ? null : JSON.stringify(detalle));
}

// El número que llega en la dirección: solo cifras normales («2»), nada de «02», «2.0», «2e0» ni «+2».
function numeroDe(valor) {
  const texto = String(valor ?? '');
  if (!/^[1-9]\d{0,14}$/.test(texto)) return null;
  return Number(texto);
}

function filaProyecto(db, espacioId, numeroProyecto) {
  const numero = numeroDe(numeroProyecto);
  if (numero == null) throw new ErrorHttp(404, 'no_existe');
  const fila = db.prepare('SELECT * FROM proyectos WHERE espacio_id = ? AND numero = ?').get(espacioId, numero);
  if (!fila) throw new ErrorHttp(404, 'no_existe');
  return fila;
}

function noEnPapelera(fila) {
  if (fila.en_papelera === 1) throw new ErrorHttp(409, 'en_papelera');
}

function tocar(db, proyectoId, cambios = {}) {
  if ('estado' in cambios) exigir(ESTADOS, cambios.estado, 'estado');
  if ('tipo' in cambios) exigir(TIPOS, cambios.tipo, 'tipo');
  const columnas = Object.keys(cambios);
  const sets = [...columnas.map(c => `${c} = ?`), 'actualizado_en = ?'].join(', ');
  db.prepare(`UPDATE proyectos SET ${sets} WHERE id = ?`).run(...columnas.map(c => cambios[c]), ahora(), proyectoId);
}

// ---------- Cómo se muestra cada cosa ----------
function leerJson(texto, porDefecto) {
  try { return JSON.parse(texto); } catch { return porDefecto; }
}

function versionCompleta(v) {
  const configuracion = limpiarConfiguracion(leerJson(v.configuracion, {}));
  const interpretacion = leerJson(v.interpretacion, {});
  return {
    numero: v.numero,
    estado: v.estado,
    origen: v.origen,
    completa: true,
    instrucciones: v.instrucciones,
    configuracion,
    supuestos: Array.isArray(interpretacion.supuestos) ? interpretacion.supuestos : [],
    faltantes: faltantes(configuracion),
    dudas: dudas(configuracion),
    motivo: v.motivo,
    creadaEn: v.creada_en,
    decididaEn: v.decidida_en,
  };
}

// Una versión vieja en la lista: solo lo necesario para mostrar la línea («Versión 4 · rechazada · fecha»).
function versionResumida(v) {
  return { numero: v.numero, estado: v.estado, origen: v.origen, completa: false, motivo: v.motivo, creadaEn: v.creada_en, decididaEn: v.decidida_en };
}

// El nombre que se muestra. Si lo escribió la persona, tal cual. Si lo puso OPORTIA (con lo que se creó o lo último
// aprobado), se vuelve a armar en el idioma de quien lo mira: «Clientes para paneles solares · Hoteles» se ve
// «Customers for solar panels · Hotels» en inglés. Lo que la persona escribió con sus palabras no se traduce.
function nombreParaMostrar(p, configTexto, idioma) {
  if (p.nombre_propio === 1 || !configTexto || !idioma) return p.nombre;
  const config = limpiarConfiguracion(leerJson(configTexto, {}));
  return nombreSugerido(config, idioma, idiomaDelNombre(p.nombre));
}

// La configuración de la que salió el nombre automático: la versión en uso o, si nunca se aprobó, la primera.
const CONFIG_DEL_NOMBRE = `(SELECT v.configuracion FROM proyecto_versiones v
  WHERE v.proyecto_id = p.id AND v.numero = COALESCE(p.version_activa, 1) AND p.nombre_propio = 0)`;

function proyectoPublico(p, pendiente = null, idioma = null) {
  return {
    id: p.numero,
    nombre: nombreParaMostrar(p, p.config_del_nombre, idioma),
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
export function listarProyectos(db, espacioId, idioma = null) {
  return db.prepare(`SELECT p.*, (SELECT v.numero FROM proyecto_versiones v WHERE v.proyecto_id = p.id AND v.estado = 'pendiente') AS pendiente,
      ${CONFIG_DEL_NOMBRE} AS config_del_nombre, ${CONFIG_VISTAZO} AS config_vistazo
    FROM proyectos p WHERE p.espacio_id = ? ORDER BY p.en_papelera, p.actualizado_en DESC, p.id DESC`).all(espacioId)
    .map(p => ({ ...proyectoPublico(p, p.pendiente ?? null, idioma), vistazo: vistazoDe(p.config_vistazo) }));
}

// Pase visual 2 (0.3.2): lo poco que la lista muestra con íconos (a qué negocios y dónde), de la versión en uso,
// o de la que espera, o de la última. Solo claves y pocos elementos: la lista sigue siendo liviana.
const CONFIG_VISTAZO = `(SELECT v.configuracion FROM proyecto_versiones v WHERE v.proyecto_id = p.id
  ORDER BY (v.numero = p.version_activa) DESC, (v.estado = 'pendiente') DESC, v.numero DESC LIMIT 1)`;
function vistazoDe(texto) {
  const c = leerJson(texto, null);
  if (!c || typeof c !== 'object') return null;
  const lista = (v, n) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, n) : []);
  return {
    sectores: lista(c.sectores, 3),
    sectoresLibres: lista(c.sectoresLibres, 1),
    zonas: lista(c.zonas, 2),
    zonasLibres: lista(c.zonasLibres, 1),
    paisCompleto: c.paisCompleto === true,
  };
}

// Un cambio de nombre automático guarda el nombre en los dos idiomas: el historial lo muestra en el de quien lo mira.
function detalleDelHistorial(h, idioma) {
  const detalle = leerJson(h.detalle, null);
  if (h.accion !== 'renombrado' || !detalle?.automatico || !detalle.nombres || typeof detalle.nombres[idioma] !== 'string') return detalle;
  const { nombres, ...resto } = detalle;
  return { ...resto, ahora: nombres[idioma] };
}

export function detalleProyecto(db, espacioId, numeroProyecto, idioma = null) {
  const fila = filaProyecto(db, espacioId, numeroProyecto);
  const p = { ...fila, config_del_nombre: db.prepare(`SELECT ${CONFIG_DEL_NOMBRE} AS c FROM proyectos p WHERE p.id = ?`).get(fila.id).c };
  const filas = db.prepare('SELECT numero, estado, origen, motivo, creada_en, decidida_en FROM proyecto_versiones WHERE proyecto_id = ? ORDER BY numero DESC').all(p.id);
  const pendienteFila = filas.find(v => v.estado === 'pendiente') || null;
  const completas = new Set(filas.slice(0, VERSIONES_COMPLETAS).map(v => v.numero));
  if (p.version_activa != null) completas.add(p.version_activa);
  if (pendienteFila) completas.add(pendienteFila.numero);
  const lista = [...completas];
  const contenido = new Map(lista.length
    ? db.prepare(`SELECT * FROM proyecto_versiones WHERE proyecto_id = ? AND numero IN (${lista.map(() => '?').join(', ')})`).all(p.id, ...lista)
      .map(v => [v.numero, versionCompleta(v)])
    : []);
  const versiones = filas.map(v => contenido.get(v.numero) || versionResumida(v));
  const historial = db.prepare('SELECT fecha, accion, detalle FROM proyecto_historial WHERE proyecto_id = ? ORDER BY id DESC LIMIT 100').all(p.id)
    .map(h => ({ fecha: h.fecha, accion: h.accion, detalle: detalleDelHistorial(h, idioma) }));
  return {
    proyecto: proyectoPublico(p, pendienteFila?.numero ?? null, idioma),
    activa: (p.version_activa != null && contenido.get(p.version_activa)) || null,
    pendiente: (pendienteFila && contenido.get(pendienteFila.numero)) || null,
    versiones,
    historial,
  };
}

// Una versión completa, sola (para abrir las viejas desde la lista).
export function versionDeProyecto(db, espacioId, numeroProyecto, numeroVersion) {
  const p = filaProyecto(db, espacioId, numeroProyecto);
  const numero = numeroDe(numeroVersion);
  const v = numero == null ? null : db.prepare('SELECT * FROM proyecto_versiones WHERE proyecto_id = ? AND numero = ?').get(p.id, numero);
  if (!v) throw new ErrorHttp(404, 'no_existe');
  return versionCompleta(v);
}

// ---------- Revisar ANTES de hacer trabajar al motor ----------
// El motor usa el único procesador del servidor: si el pedido no se va a poder guardar (límite del plan,
// papelera, tope de versiones), se responde enseguida sin interpretar nada.
export function revisarAntesDeCrear(db, espacio) {
  const { activos, guardados } = contarProyectos(db, espacio.id);
  const { limite, maximoGuardados } = limiteActual(db, espacio.id);
  if (activos >= limite) throw new ErrorHttp(409, 'limite_de_proyectos');
  if (guardados >= maximoGuardados) throw new ErrorHttp(409, 'demasiados_guardados');
}

// La versión sobre la que se hace un cambio: la que espera aprobación, si no la que está en uso, si no la última.
// Lee solo esa (no el proyecto entero) y antes revisa que el cambio se pueda guardar.
export function baseParaCambiar(db, espacioId, numeroProyecto) {
  const p = filaProyecto(db, espacioId, numeroProyecto);
  noEnPapelera(p);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM proyecto_versiones WHERE proyecto_id = ?').get(p.id);
  if (n >= MAXIMO_VERSIONES) throw new ErrorHttp(409, 'demasiadas_versiones');
  const v = db.prepare(`SELECT * FROM proyecto_versiones WHERE proyecto_id = ?
    ORDER BY (estado = 'pendiente') DESC, (numero = ?) DESC, numero DESC LIMIT 1`).get(p.id, p.version_activa ?? -1);
  return { numero: p.numero, base: v ? versionCompleta(v) : null };
}

// ---------- Crear y cambiar ----------
export function validarInstrucciones(texto) {
  if (texto != null && typeof texto !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  const instrucciones = (texto ?? '').trim();
  if (instrucciones.length < MINIMO_INSTRUCCIONES) throw new ErrorHttp(400, 'instrucciones_cortas');
  if (instrucciones.length > LIMITES.instrucciones) throw new ErrorHttp(400, 'instrucciones_largas');
  return instrucciones;
}

// Lo que se guarda de una versión, ya en texto, y si cabe en el tope de tamaño.
function filaDeVersion(instrucciones, configuracion, supuestos) {
  const fila = { instrucciones, configuracion: JSON.stringify(configuracion), interpretacion: JSON.stringify({ supuestos }) };
  const bytes = Buffer.byteLength(fila.instrucciones) + Buffer.byteLength(fila.configuracion) + Buffer.byteLength(fila.interpretacion);
  if (bytes > MAXIMO_BYTES_VERSION) throw new ErrorHttp(400, 'version_demasiado_grande');
  return fila;
}

// Dos toques seguidos con las mismas instrucciones: el segundo devuelve el proyecto que creó el primero.
function creadoHaceUnMomento(db, espacioId, usuarioId, instrucciones) {
  const desde = new Date(Date.now() - VENTANA_REPETIDO_MS).toISOString();
  return db.prepare(`SELECT p.numero FROM proyectos p JOIN proyecto_versiones v ON v.proyecto_id = p.id AND v.numero = 1
    WHERE p.espacio_id = ? AND p.creado_por = ? AND p.creado_en >= ? AND p.en_papelera = 0 AND v.instrucciones = ?
    ORDER BY p.id DESC LIMIT 1`).get(espacioId, usuarioId, desde, instrucciones)?.numero ?? null;
}

// Devuelve { numero, repetido }. «interpretarCon» deja que las pruebas comprueben cuándo trabaja el motor.
export function crearProyecto(db, { espacio, usuarioId, instrucciones, idioma = 'es', interpretarCon = interpretar }) {
  const texto = validarInstrucciones(instrucciones);
  const repetido = creadoHaceUnMomento(db, espacio.id, usuarioId, texto);
  if (repetido != null) return { numero: repetido, repetido: true };
  revisarAntesDeCrear(db, espacio);
  const { configuracion, supuestos } = interpretarCon(texto, { idioma });
  const config = limpiarConfiguracion(configuracion);
  const fila = filaDeVersion(texto, config, supuestos);
  return enTransaccion(db, () => {
    // Otra vez dentro de la transacción: dos pedidos a la vez no pueden pasarse del límite.
    revisarAntesDeCrear(db, espacio);
    const momento = ahora();
    const numero = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM proyectos WHERE espacio_id = ?').get(espacio.id).n;
    const r = db.prepare(`INSERT INTO proyectos (espacio_id, numero, nombre, tipo, estado, creado_por, creado_en, actualizado_en)
      VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?)`).run(espacio.id, numero, nombreSugerido(config, idioma), exigir(TIPOS, config.tipo, 'tipo'), usuarioId, momento, momento);
    const id = Number(r.lastInsertRowid);
    db.prepare(`INSERT INTO proyecto_versiones (proyecto_id, numero, instrucciones, configuracion, interpretacion, origen, estado, creada_por, creada_en)
      VALUES (?, 1, ?, ?, ?, 'instrucciones', 'pendiente', ?, ?)`)
      .run(id, fila.instrucciones, fila.configuracion, fila.interpretacion, usuarioId, momento);
    anotar(db, id, usuarioId, 'creado', { numero: 1 });
    return { numero, repetido: false };
  });
}

// Guarda una versión nueva que espera aprobación. Si ya había otra esperando, esa queda «descartada».
// La versión aprobada que está en uso NO cambia hasta que se apruebe la nueva.
export function nuevaVersion(db, { espacioId, proyectoId, usuarioId, instrucciones, configuracion, supuestos = [], origen }) {
  const config = limpiarConfiguracion(configuracion);
  const fila = filaDeVersion(instrucciones, config, supuestos);
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
      .run(p.id, numero, fila.instrucciones, fila.configuracion, fila.interpretacion, exigir(ORIGENES, origen, 'origen'), usuarioId, momento);
    const cambios = {};
    if (p.estado === 'borrador') cambios.estado = 'pendiente';
    if (p.version_activa == null) cambios.tipo = config.tipo;
    tocar(db, p.id, cambios);
    anotar(db, p.id, usuarioId, 'version_nueva', { numero });
    return numero;
  });
}

function versionPendiente(db, proyectoId, numero) {
  const v = db.prepare("SELECT * FROM proyecto_versiones WHERE proyecto_id = ? AND numero = ? AND estado = 'pendiente'").get(proyectoId, numeroDe(numero));
  if (!v) throw new ErrorHttp(409, 'version_no_pendiente');
  return v;
}

// Aprobar: la versión pasa a estar en uso. Si la persona nunca le cambió el nombre al proyecto,
// el nombre se vuelve a sugerir con lo aprobado (queda en el historial). Se guarda en el idioma en que se creó, no en
// el de quien aprueba: así aprobar en inglés no deja «Customers for paneles solares». (Las pantallas lo muestran
// en el idioma de cada persona; ver nombreParaMostrar.)
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
    const original = idiomaDelNombre(p.nombre);
    const nombre = p.nombre_propio === 1 ? p.nombre : nombreSugerido(config, original, original);
    if (nombre !== p.nombre) cambios.nombre = nombre;
    tocar(db, p.id, cambios);
    anotar(db, p.id, usuarioId, 'aprobada', { numero: v.numero });
    if (cambios.nombre) {
      const nombres = { es: nombreSugerido(config, 'es', original), en: nombreSugerido(config, 'en', original) };
      anotar(db, p.id, usuarioId, 'renombrado', { antes: p.nombre, ahora: nombre, automatico: true, nombres });
    }
    return v.numero;
  });
}

export function rechazarVersion(db, { espacioId, proyectoId, numero, usuarioId, motivo = '' }) {
  if (motivo != null && typeof motivo !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    noEnPapelera(p);
    const v = versionPendiente(db, p.id, numero);
    const razon = (motivo ?? '').trim().slice(0, 300) || null;
    db.prepare("UPDATE proyecto_versiones SET estado = 'rechazada', motivo = ?, decidida_por = ?, decidida_en = ? WHERE id = ?")
      .run(razon, usuarioId, ahora(), v.id);
    tocar(db, p.id, p.version_activa == null ? { estado: 'borrador' } : {});
    anotar(db, p.id, usuarioId, 'rechazada', { numero: v.numero, motivo: razon });
    return v.numero;
  });
}

export function cambiarEstado(db, { espacio, proyectoId, accion, usuarioId }) {
  const regla = typeof accion === 'string' && Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null;
  if (!regla) throw new ErrorHttp(400, 'accion_no_valida');
  if (regla.soloDueno) soloDueno(espacio);
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacio.id, proyectoId);
    noEnPapelera(p);
    if (!regla.desde.includes(p.estado)) throw new ErrorHttp(409, 'accion_no_permitida_ahora');
    tocar(db, p.id, accion === 'reintentar' ? { estado: regla.hacia, motivo_error: null } : { estado: regla.hacia });
    anotar(db, p.id, usuarioId, regla.evento);
    return regla.hacia;
  });
}

export function renombrarProyecto(db, { espacioId, proyectoId, nombre, usuarioId }) {
  if (nombre != null && typeof nombre !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  const limpio = (nombre ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio || limpio.length > LIMITES.nombre) throw new ErrorHttp(400, 'nombre_proyecto_no_valido');
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacioId, proyectoId);
    if (p.nombre === limpio) return limpio;
    // Desde ahora el nombre es suyo: aprobar otra versión ya no lo cambia.
    tocar(db, p.id, { nombre: limpio, nombre_propio: 1 });
    anotar(db, p.id, usuarioId, 'renombrado', { antes: p.nombre, ahora: limpio });
    return limpio;
  });
}

// Papelera (solo el dueño): el proyecto se esconde y deja de trabajar, pero no se borra. Si estaba trabajando,
// queda pausado (y así queda en el historial); al restaurarlo vuelve pausado y la persona elige «Reanudar».
export function moverAPapelera(db, { espacio, proyectoId, usuarioId, enPapelera }) {
  soloDueno(espacio);
  return enTransaccion(db, () => {
    const p = filaProyecto(db, espacio.id, proyectoId);
    const quiere = enPapelera === true;
    if ((p.en_papelera === 1) === quiere) return quiere;
    if (quiere) {
      const pausar = ['en_ejecucion', 'con_errores'].includes(p.estado);
      tocar(db, p.id, pausar ? { en_papelera: 1, estado: 'pausado' } : { en_papelera: 1 });
      if (pausar) anotar(db, p.id, usuarioId, 'pausado', { porPapelera: true });
      anotar(db, p.id, usuarioId, 'a_papelera');
    } else {
      if (contarProyectos(db, espacio.id).activos >= limiteActual(db, espacio.id).limite) throw new ErrorHttp(409, 'limite_para_restaurar');
      tocar(db, p.id, { en_papelera: 0 });
      anotar(db, p.id, usuarioId, 'restaurado');
    }
    return quiere;
  });
}

// Para la fila de tareas (parte c): si un trabajo falla, el proyecto queda «Con errores» con el motivo a la vista.
// Recibe el id INTERNO del proyecto (la fila de tareas no pasa por las pantallas).
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
