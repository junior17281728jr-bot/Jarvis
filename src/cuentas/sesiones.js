// Sesiones: un código largo al azar en una galleta (cookie) que el navegador no deja leer a ningún programa.
// En la base solo se guarda su huella (sha256), así que ni con la base en la mano se puede entrar.
import { randomBytes, createHash } from 'node:crypto';
import { anotarActividad, anotarFin } from './visitas.js';

export const GALLETA = 'op_sesion';
const DURACION_MS = 30 * 24 * 3600 * 1000;

const huella = token => createHash('sha256').update(String(token)).digest('hex');
const ahora = () => new Date().toISOString();

export function crearSesion(db, usuarioId, navegador = '') {
  const token = randomBytes(32).toString('base64url');
  const venceEn = new Date(Date.now() + DURACION_MS).toISOString();
  db.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada_en, vence_en, ultimo_uso, navegador) VALUES (?, ?, ?, ?, ?, ?)')
    .run(huella(token), usuarioId, ahora(), venceEn, ahora(), String(navegador).slice(0, 200));
  // 0.12.4: entrar con su contraseña empieza una visita (src/cuentas/visitas.js).
  try { anotarActividad(db, usuarioId, Date.now(), { entrada: true }); } catch { /* nunca impide entrar */ }
  return { token, venceEn };
}

export function leerSesion(db, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const fila = db.prepare(`SELECT s.token_hash, s.ultimo_uso, u.id, u.nombre, u.nombre_visible, u.rol, u.idioma, u.debe_cambiar_clave
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.vence_en > ? AND u.activo = 1 AND u.eliminado_en IS NULL`).get(huella(token), ahora());
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

// 0.9.0: antes de borrar una sesión queda anotada su «salida» en la auditoría (cuándo entró, su última actividad, cuándo
// salió y por qué), así el administrador ve la historia de entradas y salidas de cada alumno (src/cuentas/historial.js).
// Sin cambio de base: la sesión abierta ya guarda creada_en y ultimo_uso; la auditoría ya existe.
// motivo: 'salir' (tocó «Salir»), 'cerrada' (se cerraron sus sesiones: cambio o reinicio de contraseña, desactivada),
// 'bloqueo' (muchas contraseñas malas con la sesión abierta; solo hasta la 0.12.4: desde la 0.12.6 no se cierra por eso).
// 0.12.8: 'otro_equipo' (la cuenta de un alumno se abrió en otro dispositivo: src/cuentas/un-dispositivo.js).
export const MOTIVOS_SALIDA = Object.freeze(['salir', 'cerrada', 'bloqueo', 'otro_equipo']);
function anotarSalidas(db, filas, motivo) {
  for (const s of filas) {
    if (!s.vence_en || s.vence_en <= ahora()) continue; // ya había vencido: su historia sale de su última actividad
    const detalle = JSON.stringify({ entrada: s.creada_en, ultimoUso: s.ultimo_uso ?? null, motivo, nav: String(s.navegador ?? '').slice(0, 120) });
    db.prepare("INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, ?, 'salida', ?)").run(ahora(), s.usuario_id, detalle);
  }
}

export function cerrarSesion(db, token, motivo = 'salir') {
  if (!token || typeof token !== 'string' || token.length > 100) return;
  const filas = db.prepare('SELECT usuario_id, creada_en, vence_en, ultimo_uso, navegador FROM sesiones WHERE token_hash = ?').all(huella(token));
  anotarSalidas(db, filas, motivo);
  // 0.12.4: tocó «Salir»: su visita termina ahí.
  if (motivo === 'salir') for (const s of filas) { try { anotarFin(db, s.usuario_id, 'salir'); } catch { /* sigue saliendo */ } }
  db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(huella(token));
}

export function cerrarTodas(db, usuarioId, exceptoToken = null, motivo = 'cerrada') {
  const columnas = 'SELECT usuario_id, creada_en, vence_en, ultimo_uso, navegador FROM sesiones';
  if (exceptoToken) {
    anotarSalidas(db, db.prepare(`${columnas} WHERE usuario_id = ? AND token_hash <> ?`).all(usuarioId, huella(exceptoToken)), motivo);
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?').run(usuarioId, huella(exceptoToken));
  } else {
    anotarSalidas(db, db.prepare(`${columnas} WHERE usuario_id = ?`).all(usuarioId), motivo);
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(usuarioId);
  }
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
