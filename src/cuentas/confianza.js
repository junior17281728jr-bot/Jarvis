// Fase 1, parte d (ronda 5 de revisión): ¿esta cuenta común puede gastar IA? Se mira AL GASTAR, no al crearla.
//
// El problema: con una contraseña de administrador robada, por el enlace público, alguien crea cuentas (o les cambia el
// plan, les reinicia la contraseña o las vuelve a activar) mientras todos los topes de plan están en US$0, y espera a que
// el dueño ponga un tope de plan más adelante. Revisar solo al crear la cuenta no alcanza.
//
// La regla: cada uno de esos cambios deja una fila en cuentas_confianza con DE DÓNDE vino (la red de Tailscale o
// internet). Una cuenta común gasta IA solo si:
//  - su última fila es «confiable»: el cambio vino de la red de Tailscale, o el dueño, desde su cuenta de Tailscale, le
//    dio permiso después (Administrador → Usuarios → «Permitir IA»), y
//  - su huella sigue igual que en esa fila: la contraseña guardada, si está activa, su plan y cuándo se creó. Un cambio
//    que no quedó anotado (la versión anterior del código, si el actualizador vuelve atrás) cambia la huella y la cuenta
//    queda sin permiso hasta que el dueño la revise. Nunca al revés: nada da permiso sin una fila confiable.
// Una cuenta sin filas (creada antes de esta versión) espera el permiso del dueño. Cuando la persona cambia SU
// contraseña (sabiendo la actual), el permiso que tenía sigue: se anota una fila nueva con la huella nueva.
// La cuenta del administrador no pasa por aquí: solo usa el tope general (src/ia/topes.js).
// Nada se borra: quitar el permiso es otra fila más.
import { createHash } from 'node:crypto';
import { enTransaccion } from '../nucleo/db.js';

// 0.12.3: 'desactivada' (bloquearla deja anotado si tenía permiso, así volver a activarla no se lo quita).
export const ACCIONES_CONFIANZA = Object.freeze(['creada', 'plan', 'clave_reiniciada', 'activada', 'clave_cambiada', 'permitida', 'retirada', 'desactivada']);
export const DESDE = Object.freeze(['tailnet', 'internet']);

const ahora = () => new Date().toISOString();

// La huella de lo que da acceso a la cuenta y a su presupuesto. null si la cuenta no existe.
export function huellaDeCuenta(db, usuarioId) {
  const u = db.prepare(`SELECT u.id, u.clave_hash, u.activo, u.rol, u.creado_en,
      (SELECT e.plan FROM miembros m JOIN espacios e ON e.id = m.espacio_id WHERE m.usuario_id = u.id AND m.rol = 'dueno' ORDER BY e.id LIMIT 1) AS plan
    FROM usuarios u WHERE u.id = ?`).get(Number(usuarioId));
  if (!u) return null;
  return createHash('sha256').update(['v1', u.id, u.clave_hash, u.activo, u.rol, u.creado_en, u.plan ?? '-'].join('|')).digest('hex').slice(0, 32);
}

function ultimaFila(db, usuarioId) {
  return db.prepare('SELECT accion, desde, confiable, huella, fecha FROM cuentas_confianza WHERE usuario_id = ? ORDER BY id DESC LIMIT 1').get(Number(usuarioId)) || null;
}

// Anota un cambio (después de hacerlo, en la misma transacción). confiable: vino de la red de Tailscale (o es el permiso
// del dueño). Devuelve el id de la fila.
export function anotarConfianza(db, { usuarioId, accion, desdeTailnet, confiable = desdeTailnet, hechoPor = null }) {
  if (!ACCIONES_CONFIANZA.includes(accion)) throw new Error(`acción no válida: ${String(accion).slice(0, 40)}`);
  const huella = huellaDeCuenta(db, usuarioId);
  if (!huella) throw new Error('la cuenta no existe');
  const r = db.prepare('INSERT INTO cuentas_confianza (usuario_id, accion, desde, confiable, huella, hecho_por, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(Number(usuarioId), accion, desdeTailnet ? 'tailnet' : 'internet', confiable ? 1 : 0, huella, Number.isSafeInteger(hechoPor) ? hechoPor : null, ahora());
  return Number(r.lastInsertRowid);
}

// ¿Esta cuenta puede gastar IA ahora mismo? (solo mira la base)
export function cuentaConfirmada(db, usuarioId) {
  const f = ultimaFila(db, usuarioId);
  if (!f || f.confiable !== 1) return false;
  return f.huella === huellaDeCuenta(db, usuarioId);
}

// La persona cambió SU contraseña (sabía la actual). Si la cuenta tenía permiso justo antes, lo sigue teniendo.
// teniaPermiso: cuentaConfirmada ANTES de guardar la contraseña nueva.
export function seguirConfianza(db, { usuarioId, teniaPermiso, desdeTailnet }) {
  if (!teniaPermiso) return null;
  return anotarConfianza(db, { usuarioId, accion: 'clave_cambiada', desdeTailnet, confiable: true, hechoPor: Number(usuarioId) });
}

// Para la pantalla «Administrador»: { permitida, ultimo: { accion, desde, fecha, vigente } | null }.
// vigente: false si algo cambió después sin quedar anotado.
export function estadoConfianza(db, usuarioId) {
  const f = ultimaFila(db, usuarioId);
  if (!f) return { permitida: false, ultimo: null };
  const vigente = f.huella === huellaDeCuenta(db, usuarioId);
  return {
    permitida: f.confiable === 1 && vigente,
    ultimo: { accion: f.accion, desde: DESDE.includes(f.desde) ? f.desde : 'internet', fecha: f.fecha, vigente },
  };
}

// ¿El espacio (que no es del administrador) puede gastar IA? Todas sus personas que no son administradores tienen que
// tener permiso (y tiene que haber al menos una).
export function espacioConfirmado(db, espacioId) {
  const miembros = db.prepare(`SELECT u.id, u.rol FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.espacio_id = ?`).all(Number(espacioId));
  const comunes = miembros.filter(m => m.rol !== 'admin');
  if (!comunes.length) return miembros.length > 0;
  return comunes.every(m => cuentaConfirmada(db, m.id));
}

// El dueño da (o quita) el permiso de IA a una cuenta común. Dar: solo desde su cuenta de Tailscale (lo revisa la ruta).
export function ponerPermisoIa(db, { usuarioId, permitida, hechoPor, desdeTailnet }) {
  return enTransaccion(db, () => anotarConfianza(db, {
    usuarioId, accion: permitida ? 'permitida' : 'retirada', desdeTailnet, confiable: permitida === true, hechoPor,
  }));
}

// Cuántas cuentas comunes activas tienen permiso de IA y cuántas lo esperan (para la pantalla de la IA).
export function resumenConfianza(db) {
  const ids = db.prepare("SELECT id FROM usuarios WHERE rol = 'usuario' AND activo = 1 ORDER BY id").all();
  let permitidas = 0;
  for (const { id } of ids) if (cuentaConfirmada(db, id)) permitidas += 1;
  return { permitidas, sinPermiso: ids.length - permitidas };
}
