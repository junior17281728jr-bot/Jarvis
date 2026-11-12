// 0.9.0: el perfil que cada persona personaliza en Configuración: su nombre para mostrar (usuarios.nombre_visible), un
// avatar de aviación (una figura y un color de una lista fija: se dibuja en la pantalla, sin archivos) y una línea
// corta «Mi meta». El avatar y la meta van en «ajustes» (cuenta.perfil.<id>): sin cambio de base.
//  - El avatar sale en la barra de arriba, en el panel «Grupo» y en las listas del administrador.
//  - La meta solo la ven la persona y el administrador (nunca los compañeros: el Grupo no la lleva).
//  - El nombre de usuario (con el que se entra) también se puede cambiar, con la contraseña actual: las sesiones van
//    por el id de la cuenta, así que siguen abiertas; el nombre nuevo tiene que estar libre (sin importar mayúsculas).
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { NOMBRE_VALIDO, auditar, avisarCuenta } from './usuarios.js';

// Las mismas listas que dibuja public/avatares.js (test/admin-alumnos.test.js revisa que coincidan).
export const FORMAS_AVATAR = Object.freeze(['avioneta', 'jet', 'helicoptero', 'globo', 'alas', 'brujula']);
export const COLORES_AVATAR = Object.freeze(['azul', 'rojo', 'verde', 'naranja', 'morado', 'amarillo']);
export const META_MAXIMA = 120;
export const NOMBRE_VISIBLE_MAXIMO = 80;

const clavePerfil = id => `cuenta.perfil.${Number(id)}`;
export const avatarValido = valor => {
  if (typeof valor !== 'string') return false;
  const [forma, color, ...resto] = valor.split('-');
  return !resto.length && FORMAS_AVATAR.includes(forma) && COLORES_AVATAR.includes(color);
};
// Un texto de una línea: sin caracteres de control, espacios normales, recortado.
const unaLinea = (valor, maximo) => String(valor).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximo);

export function leerPerfil(db, usuarioId) {
  let p = null;
  try {
    p = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clavePerfil(usuarioId))?.valor ?? 'null');
  } catch { p = null; }
  return {
    avatar: avatarValido(p?.avatar) ? p.avatar : null,
    meta: typeof p?.meta === 'string' && p.meta ? p.meta.slice(0, META_MAXIMA) : null,
  };
}

// Los avatares de varias cuentas de una vez (para listas): id → avatar (o null).
export function avataresDe(db) {
  const m = new Map();
  for (const f of db.prepare("SELECT clave, valor FROM ajustes WHERE clave LIKE 'cuenta.perfil.%'").all()) {
    const id = Number(f.clave.slice('cuenta.perfil.'.length));
    try {
      const p = JSON.parse(f.valor);
      if (Number.isSafeInteger(id) && avatarValido(p?.avatar)) m.set(id, p.avatar);
    } catch { /* un valor raro no rompe la lista */ }
  }
  return m;
}

// 0.9.2: «Perfil privado»: el mismo interruptor que «ocultarme» del panel Grupo (academia.grupo_oculto.<id>). Privado =
// no aparece para los otros alumnos (Grupo ni ningún ranking); el administrador siempre ve todo.
const clavePrivado = id => `academia.grupo_oculto.${Number(id)}`;
export const esPrivado = (db, id) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clavePrivado(id))?.valor === '1';

export function perfilDe(db, usuarioId) {
  const u = db.prepare('SELECT id, nombre, nombre_visible FROM usuarios WHERE id = ?').get(Number(usuarioId));
  if (!u) throw new ErrorHttp(404, 'no_existe');
  return {
    nombre: u.nombre, nombreVisible: u.nombre_visible || u.nombre, ...leerPerfil(db, u.id), privado: esPrivado(db, u.id),
    opciones: { formas: [...FORMAS_AVATAR], colores: [...COLORES_AVATAR], metaMaxima: META_MAXIMA, nombreVisibleMaximo: NOMBRE_VISIBLE_MAXIMO },
  };
}

// datos: { nombreVisible?, avatar?, meta? } (lo que no viene no se toca; avatar null = el de siempre; meta '' = sin meta).
export function guardarPerfil(db, usuarioId, datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new ErrorHttp(400, 'datos_no_validos');
  const id = Number(usuarioId);
  return enTransaccion(db, () => {
    const u = db.prepare('SELECT id, nombre, nombre_visible FROM usuarios WHERE id = ?').get(id);
    if (!u) throw new ErrorHttp(404, 'no_existe');
    const actual = leerPerfil(db, id);
    const nuevo = { ...actual };
    if (Object.hasOwn(datos, 'avatar')) {
      if (datos.avatar !== null && !avatarValido(datos.avatar)) throw new ErrorHttp(400, 'avatar_no_valido');
      nuevo.avatar = datos.avatar;
    }
    if (Object.hasOwn(datos, 'meta')) {
      if (datos.meta !== null && typeof datos.meta !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
      nuevo.meta = datos.meta ? unaLinea(datos.meta, META_MAXIMA) || null : null;
    }
    if (Object.hasOwn(datos, 'nombreVisible')) {
      if (typeof datos.nombreVisible !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
      const visible = unaLinea(datos.nombreVisible, NOMBRE_VISIBLE_MAXIMO);
      if (!visible) throw new ErrorHttp(400, 'nombre_visible_vacio');
      if (visible !== (u.nombre_visible || u.nombre)) {
        db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run(visible, id);
        auditar(db, { usuarioId: id, accion: 'nombre_visible_cambiado', detalle: visible });
      }
    }
    if (Object.hasOwn(datos, 'privado')) {
      if (typeof datos.privado !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
      db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clavePrivado(id), datos.privado ? '1' : '0', new Date().toISOString());
    }
    if (nuevo.avatar !== actual.avatar || nuevo.meta !== actual.meta) {
      db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`)
        .run(clavePerfil(id), JSON.stringify({ avatar: nuevo.avatar, meta: nuevo.meta }), new Date().toISOString());
    }
    return perfilDe(db, id);
  });
}

// El nombre de usuario (con el que se entra). La contraseña ya se revisó en la ruta (src/api/perfil.js).
// 0.9.2: hechoPor = el administrador que lo cambió (la auditoría lo nombra y la persona ve un aviso al entrar).
export function cambiarNombreUsuario(db, usuarioId, nombreNuevo, { hechoPor = null } = {}) {
  const nombre = typeof nombreNuevo === 'string' ? nombreNuevo.trim().toLowerCase() : '';
  if (!NOMBRE_VALIDO.test(nombre)) throw new ErrorHttp(400, 'nombre_no_valido');
  const id = Number(usuarioId);
  return enTransaccion(db, () => {
    const u = db.prepare('SELECT id, nombre, nombre_visible FROM usuarios WHERE id = ?').get(id);
    if (!u) throw new ErrorHttp(404, 'no_existe');
    if (u.nombre.toLowerCase() === nombre) throw new ErrorHttp(400, 'nombre_igual');
    // COLLATE NOCASE: «Ana» y «ana» son el mismo nombre.
    if (db.prepare('SELECT 1 FROM usuarios WHERE nombre = ? AND id <> ?').get(nombre, id)) throw new ErrorHttp(409, 'nombre_ocupado');
    db.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').run(nombre, id);
    // Si el nombre para mostrar era el usuario de antes (nunca se puso otro), sigue al nuevo.
    if (!u.nombre_visible || u.nombre_visible === u.nombre) db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run(nombre, id);
    const porOtro = hechoPor != null && hechoPor !== id;
    auditar(db, { usuarioId: porOtro ? hechoPor : id, accion: 'nombre_usuario_cambiado', detalle: `${u.nombre} -> ${nombre}${porOtro ? ' (por el administrador)' : ''}` });
    if (porOtro) avisarCuenta(db, id, 'usuario_cambiado');
    return perfilDe(db, id);
  });
}

// 0.9.2: el administrador cambia el nombre para mostrar de alguien (la persona ve un aviso al entrar).
export function ponerNombreVisible(db, usuarioId, texto, { hechoPor }) {
  if (typeof texto !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  const visible = unaLinea(texto, NOMBRE_VISIBLE_MAXIMO);
  if (!visible) throw new ErrorHttp(400, 'nombre_visible_vacio');
  const id = Number(usuarioId);
  return enTransaccion(db, () => {
    const u = db.prepare('SELECT id, nombre, nombre_visible FROM usuarios WHERE id = ?').get(id);
    if (!u) throw new ErrorHttp(404, 'no_existe');
    if (visible !== (u.nombre_visible || u.nombre)) {
      db.prepare('UPDATE usuarios SET nombre_visible = ? WHERE id = ?').run(visible, id);
      auditar(db, { usuarioId: hechoPor, accion: 'nombre_visible_cambiado', detalle: `${u.nombre}: ${visible}` });
      if (hechoPor !== id) avisarCuenta(db, id, 'nombre_cambiado');
    }
    return perfilDe(db, id);
  });
}
