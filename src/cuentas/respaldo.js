// 0.12.6 (pedido del dueño: «por si un día olvido la contraseña normal»): el código de acceso de respaldo de un
// administrador. Lo pone él mismo en Configuración (8 caracteres o más, con su contraseña otra vez: X-Confirmar-Clave),
// lo cambia o lo quita cuando quiere y nunca vence.
//  - Se guarda SOLO su huella (scrypt, igual que las contraseñas: src/cuentas/claves.js) en «ajustes»
//    ('codigo_respaldo:<id>'). Nunca el código: ni en la base, ni en un registro, ni en un aviso.
//  - Al entrar, la casilla de la contraseña acepta también el código (solo cuentas de administrador). Con las mismas
//    esperas que una contraseña mala (src/nucleo/limites.js, Freno). Cada uso deja un aviso para el administrador, una
//    línea en la auditoría y, en su pantalla, la sugerencia de poner una contraseña nueva (no obligatoria).
//  - También sirve como «contraseña actual» para poner una contraseña nueva (POST /api/yo/clave).
import { hashClave, verificarClave } from './claves.js';

export const LARGO_CODIGO = Object.freeze({ min: 8, max: 200 });
const clave = usuarioId => `codigo_respaldo:${usuarioId}`;

function leer(db, usuarioId) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave(usuarioId))?.valor ?? 'null');
    return v && typeof v.huella === 'string' ? v : null;
  } catch { return null; }
}

// Para la pantalla: si tiene uno y desde cuándo (nunca la huella).
export function estadoCodigo(db, usuarioId) {
  const v = leer(db, usuarioId);
  return { puesto: Boolean(v), puestoEn: v?.puestoEn ?? null };
}

// → la clave del error (400) o null.
export function problemaDeCodigo(codigo) {
  if (typeof codigo !== 'string' || codigo.trim().length < LARGO_CODIGO.min) return 'codigo_corto';
  if (codigo.length > LARGO_CODIGO.max) return 'codigo_largo';
  return null;
}

export async function ponerCodigo(db, usuarioId, codigo, ahora = Date.now()) {
  const huella = await hashClave(codigo);
  const fecha = new Date(ahora).toISOString();
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`)
    .run(clave(usuarioId), JSON.stringify({ huella, puestoEn: fecha }), fecha);
}

// Quitarlo deja la fila sin huella (nada se borra de la base): desde ese momento el código ya no sirve.
export function quitarCodigo(db, usuarioId, ahora = Date.now()) {
  if (!leer(db, usuarioId)) return false;
  const fecha = new Date(ahora).toISOString();
  db.prepare('UPDATE ajustes SET valor = ?, actualizado_en = ? WHERE clave = ?').run(JSON.stringify({ huella: null, quitadoEn: fecha }), fecha, clave(usuarioId));
  return true;
}

// ¿Es el código de respaldo de esta cuenta de administrador? (Una cuenta sin código nunca coincide.)
export async function codigoCorrecto(db, usuario, codigo) {
  if (!usuario || usuario.rol !== 'admin') return false;
  const v = leer(db, usuario.id);
  return Boolean(v) && verificarClave(codigo, v.huella);
}
