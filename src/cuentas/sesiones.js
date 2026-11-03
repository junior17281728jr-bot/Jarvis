// Sesiones: un código largo al azar en una galleta (cookie) que el navegador no deja leer a ningún programa.
// En la base solo se guarda su huella (sha256), así que ni con la base en la mano se puede entrar.
import { randomBytes, createHash } from 'node:crypto';

export const GALLETA = 'op_sesion';
const DURACION_MS = 30 * 24 * 3600 * 1000;

const huella = token => createHash('sha256').update(String(token)).digest('hex');
const ahora = () => new Date().toISOString();

export function crearSesion(db, usuarioId, navegador = '') {
  const token = randomBytes(32).toString('base64url');
  const venceEn = new Date(Date.now() + DURACION_MS).toISOString();
  db.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada_en, vence_en, ultimo_uso, navegador) VALUES (?, ?, ?, ?, ?, ?)')
    .run(huella(token), usuarioId, ahora(), venceEn, ahora(), String(navegador).slice(0, 200));
  return { token, venceEn };
}

export function leerSesion(db, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const fila = db.prepare(`SELECT s.token_hash, s.ultimo_uso, u.id, u.nombre, u.nombre_visible, u.rol, u.idioma, u.debe_cambiar_clave
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.vence_en > ? AND u.activo = 1`).get(huella(token), ahora());
  if (!fila) return null;
  if (!fila.ultimo_uso || Date.now() - Date.parse(fila.ultimo_uso) > 5 * 60 * 1000) {
    db.prepare('UPDATE sesiones SET ultimo_uso = ? WHERE token_hash = ?').run(ahora(), fila.token_hash);
  }
  return {
    id: fila.id,
    nombre: fila.nombre,
    nombreVisible: fila.nombre_visible,
    rol: fila.rol,
    idioma: fila.idioma,
    debeCambiarClave: fila.debe_cambiar_clave === 1,
  };
}

export function cerrarSesion(db, token) {
  if (token) db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(huella(token));
}

export function cerrarTodas(db, usuarioId, exceptoToken = null) {
  if (exceptoToken) db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?').run(usuarioId, huella(exceptoToken));
  else db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(usuarioId);
}

export function textoGalleta(token, { segura, borrar = false }) {
  const partes = [`${GALLETA}=${borrar ? '' : token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${borrar ? 0 : DURACION_MS / 1000}`];
  if (segura) partes.push('Secure');
  return partes.join('; ');
}

export function leerGalleta(req) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === GALLETA) return valor.join('=');
  }
  return null;
}
