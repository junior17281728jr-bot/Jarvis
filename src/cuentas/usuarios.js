// Usuarios y espacios de trabajo. Cada usuario tiene su propio espacio (donde vivirán sus proyectos).
// Aquí nunca se borra a nadie: un usuario se desactiva y se puede volver a activar.
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

function enTransaccion(db, trabajo) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = trabajo();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
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
      (SELECT e.plan FROM miembros m JOIN espacios e ON e.id = m.espacio_id WHERE m.usuario_id = u.id AND m.rol = 'dueno' ORDER BY e.id LIMIT 1) AS plan
    FROM usuarios u ORDER BY u.id`).all().map(u => ({
    id: u.id,
    nombre: u.nombre,
    nombreVisible: u.nombre_visible || u.nombre,
    rol: u.rol,
    activo: u.activo === 1,
    idioma: u.idioma,
    debeCambiarClave: u.debe_cambiar_clave === 1,
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

// ---------- Avisos para la persona ----------
// Cuando el administrador reinicia la contraseña de alguien, queda un aviso guardado: la persona lo ve al entrar
// la próxima vez («El administrador reinició tu contraseña el …») y la lista completa está en Configuración.
// Así nadie puede entrar a una cuenta ajena con una contraseña reiniciada sin que la dueña se entere.
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

export function reiniciosDeClave(db, usuarioId) {
  return db.prepare("SELECT fecha, visto_en FROM avisos_cuenta WHERE usuario_id = ? AND tipo = 'clave_reiniciada' ORDER BY id DESC LIMIT 50").all(usuarioId)
    .map(a => ({ fecha: a.fecha, vistoEn: a.visto_en }));
}
