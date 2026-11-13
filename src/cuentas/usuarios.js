// Usuarios y espacios de trabajo. Cada usuario tiene su propio espacio (donde vivirán sus proyectos).
// Aquí nunca se borra a nadie: un usuario se desactiva y se puede volver a activar.
import { enTransaccion } from '../nucleo/db.js';
import { limiteDe } from './planes.js';

const ahora = () => new Date().toISOString();

export const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9._-]{2,39}$/i;

export function auditar(db, { usuarioId = null, accion, detalle = null }) {
  db.prepare('INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, ?, ?, ?)')
    .run(ahora(), usuarioId, String(accion).slice(0, 100), detalle == null ? null : String(detalle).slice(0, 500));
}

export function hayAdmin(db) {
  return Boolean(db.prepare("SELECT 1 FROM usuarios WHERE rol = 'admin' LIMIT 1").get());
}

function crearEspacio(db, usuarioId, nombre) {
  const espacio = db.prepare('INSERT INTO espacios (nombre, creado_en) VALUES (?, ?)').run(`Espacio de ${nombre}`, ahora());
  db.prepare("INSERT INTO miembros (espacio_id, usuario_id, rol, creado_en) VALUES (?, ?, 'dueno', ?)")
    .run(Number(espacio.lastInsertRowid), usuarioId, ahora());
}

// Crea el primer administrador SOLO si todavía no existe ninguno (seguro aunque lleguen dos pedidos a la vez).
export function crearPrimerAdmin(db, { nombre, claveHash, idioma = 'es', tailscaleLogin = null }) {
  return enTransaccion(db, () => {
    const r = db.prepare(`INSERT INTO usuarios (nombre, nombre_visible, clave_hash, rol, idioma, creado_en, tailscale_login)
      SELECT ?, ?, ?, 'admin', ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE rol = 'admin')`)
      .run(nombre, nombre, claveHash, idioma, ahora(), tailscaleLogin);
    if (r.changes !== 1) return null;
    const id = Number(r.lastInsertRowid);
    crearEspacio(db, id, nombre);
    auditar(db, { usuarioId: id, accion: 'primer_admin_creado', detalle: tailscaleLogin ? `Tailscale: ${tailscaleLogin}` : null });
    return id;
  });
}

// «nombreVisible»: el nombre completo de la persona («Juan Pérez»); si no se da, se usa el de usuario.
export function crearUsuario(db, { nombre, nombreVisible = null, claveHash, rol = 'usuario', idioma = 'es', debeCambiarClave = true, creadoPor = null }) {
  return enTransaccion(db, () => {
    if (db.prepare('SELECT 1 FROM usuarios WHERE nombre = ?').get(nombre)) return null;
    const r = db.prepare(`INSERT INTO usuarios (nombre, nombre_visible, clave_hash, rol, idioma, debe_cambiar_clave, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(nombre, nombreVisible || nombre, claveHash, rol, idioma, debeCambiarClave ? 1 : 0, ahora());
    const id = Number(r.lastInsertRowid);
    crearEspacio(db, id, nombre);
    auditar(db, { usuarioId: creadoPor, accion: 'usuario_creado', detalle: `${nombre} (${rol})` });
    return id;
  });
}

export function buscarPorNombre(db, nombre) {
  return db.prepare('SELECT * FROM usuarios WHERE nombre = ?').get(String(nombre)) || null;
}

export function buscarPorId(db, id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(id)) || null;
}

// Para la pantalla «Administrador». Del espacio de cada cuenta solo se muestra su plan y cuántos proyectos
// permite: nunca nada de sus proyectos.
export function listarUsuarios(db) {
  return db.prepare(`SELECT u.id, u.nombre, u.nombre_visible, u.rol, u.activo, u.idioma, u.debe_cambiar_clave, u.creado_en, u.ultimo_acceso,
      (u.clave_hash LIKE 'pendiente$%') AS pendiente,
      (SELECT e.plan FROM miembros m JOIN espacios e ON e.id = m.espacio_id WHERE m.usuario_id = u.id AND m.rol = 'dueno' ORDER BY e.id LIMIT 1) AS plan
    FROM usuarios u WHERE u.eliminado_en IS NULL ORDER BY u.id`).all().map(u => ({
    id: u.id,
    nombre: u.nombre,
    nombreVisible: u.nombre_visible || u.nombre,
    rol: u.rol,
    activo: u.activo === 1,
    idioma: u.idioma,
    debeCambiarClave: u.debe_cambiar_clave === 1,
    // 0.9.2: creada sin contraseña; la pone la persona la primera vez que entra.
    pendiente: u.pendiente === 1,
    creadoEn: u.creado_en,
    ultimoAcceso: u.ultimo_acceso,
    plan: u.plan ?? null,
    proyectosPermitidos: u.plan == null ? null : limiteDe(u.plan, u.rol),
  }));
}

export function guardarClave(db, usuarioId, claveHash, { debeCambiarClave = false } = {}) {
  db.prepare('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = ? WHERE id = ?').run(claveHash, debeCambiarClave ? 1 : 0, usuarioId);
}

export function ponerActivo(db, usuarioId, activo) {
  db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, usuarioId);
}

export function ponerIdioma(db, usuarioId, idioma) {
  db.prepare('UPDATE usuarios SET idioma = ? WHERE id = ?').run(idioma, usuarioId);
}

export function registrarAcceso(db, usuarioId) {
  db.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(ahora(), usuarioId);
}

export function cuantosAdminsActivos(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1").get().n;
}

// ---------- 0.13.8: «Eliminar» una cuenta SIN borrar nada (cambio de base 10) ----------
// La cuenta queda marcada (cuándo, quién y si estaba activa), desactivada y fuera de todas las listas. Sus datos siguen
// en la base y su usuario queda reservado (nadie más lo puede usar; «Recuperar» la deja como estaba).
export const estaEliminada = u => Boolean(u?.eliminado_en);

// Por qué NO se puede bloquear o eliminar esta cuenta (o null si se puede): nunca la propia, nunca el último
// administrador activo. destino: la fila de usuarios; yoId: el administrador que lo pide.
export function problemaParaQuitar(db, destino, yoId) {
  if (!destino) return 'no_existe';
  if (destino.id === yoId) return 'no_puedes_quitarte';
  if (destino.rol === 'admin' && destino.activo === 1 && cuantosAdminsActivos(db) <= 1) return 'ultimo_admin';
  return null;
}

// Marca la cuenta como eliminada (sin tocar su activo: eso lo hace quien llama, como al bloquear).
export function marcarEliminada(db, usuarioId, { por, estabaActiva, ahoraIso = ahora() }) {
  db.prepare('UPDATE usuarios SET eliminado_en = ?, eliminado_por = ?, eliminado_activo = ? WHERE id = ? AND eliminado_en IS NULL')
    .run(ahoraIso, Number.isSafeInteger(por) ? por : null, estabaActiva ? 1 : 0, usuarioId);
}
// Le quita la marca. → si estaba activa antes de eliminarla (la cuenta vuelve como estaba).
export function quitarMarcaEliminada(db, usuarioId) {
  const f = db.prepare('SELECT eliminado_activo FROM usuarios WHERE id = ?').get(usuarioId);
  db.prepare('UPDATE usuarios SET eliminado_en = NULL, eliminado_por = NULL, eliminado_activo = NULL WHERE id = ?').run(usuarioId);
  return f?.eliminado_activo === 1;
}
// «Alumnos eliminados» (Administrador → Alumnos): las cuentas marcadas, la más nueva primero.
export function listarEliminadas(db) {
  return db.prepare(`SELECT u.id, u.nombre, u.nombre_visible, u.rol, u.eliminado_en, u.eliminado_activo, p.nombre AS por
    FROM usuarios u LEFT JOIN usuarios p ON p.id = u.eliminado_por WHERE u.eliminado_en IS NOT NULL ORDER BY u.eliminado_en DESC, u.id DESC`).all()
    .map(u => ({ id: u.id, nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, rol: u.rol, eliminadoEn: u.eliminado_en, estabaActiva: u.eliminado_activo === 1, por: u.por ?? null }));
}

// ---------- Avisos para la persona ----------
// Cuando el administrador reinicia la contraseña de alguien, queda un aviso guardado: la persona lo ve al entrar
// la próxima vez («El administrador reinició tu contraseña el …») y la lista completa está en Configuración.
// Así nadie puede entrar a una cuenta ajena con una contraseña reiniciada sin que la dueña se entere: «visto» no basta,
// porque quien entra con la clave temporal también ve el aviso. Por eso, cada vez que hay un aviso nuevo, la pantalla
// muestra TODOS los reinicios recientes (también los ya vistos), con su fecha: la dueña ve uno que no pidió.
// 0.9.2: otros avisos para la persona: 'usuario_cambiado' y 'nombre_cambiado' (lo cambió el administrador; la pantalla
// muestra el valor de ahora).
export const TIPOS_AVISO_CUENTA = Object.freeze(['clave_reiniciada', 'usuario_cambiado', 'nombre_cambiado', 'soporte_respondido', 'codigo_respaldo_usado']);
export function avisarCuenta(db, usuarioId, tipo) {
  if (!TIPOS_AVISO_CUENTA.includes(tipo)) throw new Error(`aviso desconocido: ${tipo}`);
  db.prepare('INSERT INTO avisos_cuenta (usuario_id, tipo, fecha) VALUES (?, ?, ?)').run(usuarioId, tipo, ahora());
}
export function avisarClaveReiniciada(db, usuarioId) {
  db.prepare("INSERT INTO avisos_cuenta (usuario_id, tipo, fecha) VALUES (?, 'clave_reiniciada', ?)").run(usuarioId, ahora());
}

export function avisosSinVer(db, usuarioId) {
  return db.prepare('SELECT id, tipo, fecha FROM avisos_cuenta WHERE usuario_id = ? AND visto_en IS NULL ORDER BY id LIMIT 20').all(usuarioId)
    .map(a => ({ id: a.id, tipo: a.tipo, fecha: a.fecha }));
}

// La pantalla ya mostró los avisos hasta «hasta» (incluido): quedan como vistos, pero no se borran.
export function marcarAvisosVistos(db, usuarioId, hasta) {
  return db.prepare('UPDATE avisos_cuenta SET visto_en = ? WHERE usuario_id = ? AND visto_en IS NULL AND id <= ?').run(ahora(), usuarioId, hasta).changes;
}

// Los reinicios de los últimos 90 días (hasta 5, del más nuevo al más viejo), vistos o no.
export const DIAS_REINICIOS_RECIENTES = 90;
export function reiniciosRecientes(db, usuarioId, { dias = DIAS_REINICIOS_RECIENTES, maximo = 5 } = {}) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare("SELECT fecha, visto_en FROM avisos_cuenta WHERE usuario_id = ? AND tipo = 'clave_reiniciada' AND fecha >= ? ORDER BY id DESC LIMIT ?")
    .all(usuarioId, desde, maximo).map(a => ({ fecha: a.fecha, vistoEn: a.visto_en }));
}

export function reiniciosDeClave(db, usuarioId) {
  return db.prepare("SELECT fecha, visto_en FROM avisos_cuenta WHERE usuario_id = ? AND tipo = 'clave_reiniciada' ORDER BY id DESC LIMIT 50").all(usuarioId)
    .map(a => ({ fecha: a.fecha, vistoEn: a.visto_en }));
}
