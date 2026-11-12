// 0.12.8 (pedido del dueño, punto Z): una cuenta de ALUMNO se usa en un solo dispositivo a la vez.
//  - Al entrar (contraseña, código de respaldo o al crear su primera contraseña), las OTRAS sesiones abiertas de ese
//    alumno se cierran: la fila de la sesión queda (vence en ese momento; nunca se borra), con una marca en «ajustes»
//    (`sesion.otro_equipo.<huella>`) y su «salida» en la auditoría con el motivo 'otro_equipo' (sale en la Actividad de su
//    ficha). El otro dispositivo, en su próximo pedido, recibe 401 'sesion_otro_equipo': la pantalla dice «Tu cuenta se
//    abrió en otro dispositivo. Si no fuiste tú, avisa al administrador.» con «Entrar aquí».
//  - Las cuentas de administrador no (el dueño usa Mac y iPhone). El administrador lo apaga o enciende en Usuarios:
//    «Un solo dispositivo a la vez para alumnos» (encendido por defecto; `ajustes` 'cuentas.un_dispositivo').
//  - Aviso para el administrador SOLO si a un mismo alumno le pasa más de 3 veces en un día (hora de RD): quizás comparte
//    la cuenta. Un aviso por alumno y día ('cuenta_compartida:<id>:<día>'), con su nombre y las veces.
import { createHash } from 'node:crypto';
import { abrirAviso } from '../avisos/avisos.js';

export const CLAVE_AJUSTE = 'cuentas.un_dispositivo';
export const VECES_PARA_AVISAR = 3;
const huella = token => createHash('sha256').update(String(token)).digest('hex');
const iso = ms => new Date(ms).toISOString();
const diaRd = ms => iso(ms - 4 * 3_600_000).slice(0, 10);
const claveMarca = h => `sesion.otro_equipo.${h}`;
const leer = (db, clave) => db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
const guardar = (db, clave, valor, ahora) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, valor, iso(ahora));

export const unDispositivoActivo = db => leer(db, CLAVE_AJUSTE) !== '0';
export function ponerUnDispositivo(db, activo, { usuarioId = null, ahora = Date.now() } = {}) {
  guardar(db, CLAVE_AJUSTE, activo ? '1' : '0', ahora);
  db.prepare("INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, ?, 'un_dispositivo', ?)").run(iso(ahora), usuarioId, activo ? 'si' : 'no');
  return unDispositivoActivo(db);
}

// Después de crear la sesión nueva (tokenNuevo): cierra las otras de ese alumno. → cuántas cerró.
export function cerrarOtrosEquipos(db, usuarioId, tokenNuevo, ahora = Date.now()) {
  const u = db.prepare('SELECT id, rol, nombre, nombre_visible FROM usuarios WHERE id = ?').get(Number(usuarioId));
  if (!u || u.rol === 'admin' || !unDispositivoActivo(db)) return 0;
  const otras = db.prepare('SELECT token_hash, creada_en, vence_en, ultimo_uso, navegador FROM sesiones WHERE usuario_id = ? AND token_hash <> ? AND vence_en > ?')
    .all(u.id, huella(tokenNuevo), iso(ahora));
  for (const s of otras) {
    db.prepare('UPDATE sesiones SET vence_en = ? WHERE token_hash = ?').run(iso(ahora), s.token_hash);
    guardar(db, claveMarca(s.token_hash), JSON.stringify({ usuarioId: u.id, motivo: 'otro_equipo', en: iso(ahora) }), ahora);
    db.prepare("INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, ?, 'salida', ?)").run(iso(ahora), u.id,
      JSON.stringify({ entrada: s.creada_en, ultimoUso: s.ultimo_uso ?? null, motivo: 'otro_equipo', nav: String(s.navegador ?? '').slice(0, 120) }));
  }
  if (!otras.length) return 0;
  // Las veces de hoy (hora de RD): más de 3, un aviso (quizás comparte la cuenta).
  const dia = diaRd(ahora);
  let cuenta = null;
  try { cuenta = JSON.parse(leer(db, `cuenta.otro_equipo.${u.id}`) ?? 'null'); } catch { cuenta = null; }
  const veces = (cuenta?.dia === dia ? Number(cuenta.veces) || 0 : 0) + 1;
  guardar(db, `cuenta.otro_equipo.${u.id}`, JSON.stringify({ dia, veces }), ahora);
  if (veces > VECES_PARA_AVISAR) {
    abrirAviso(db, { clave: `cuenta_compartida:${u.id}:${dia}`, nivel: 'atencion', detalle: { alumno: u.nombre_visible || u.nombre, usuario: u.nombre, veces }, reenviar: veces === VECES_PARA_AVISAR + 1, ahora });
  }
  return otras.length;
}

// ¿Esta sesión se cerró porque la cuenta se abrió en otro dispositivo? (para decirlo en vez de «no has entrado»)
export function cerradaPorOtroEquipo(db, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return false;
  return leer(db, claveMarca(huella(token))) != null;
}
