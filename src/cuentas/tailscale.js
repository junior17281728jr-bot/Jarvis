// ¿Quién es el DUEÑO en la red de Tailscale? (fase 1, parte d: las claves y lo que gasta dinero)
// El dueño es UNA sola persona: la PRIMERA cuenta de administrador (la que creó /api/primer-admin, o la consola si no había
// ninguna). Otro administrador (un ayudante, o uno creado con una contraseña robada) nunca es el dueño: no ve ni cambia
// las claves ni los ajustes de la IA, desde ningún equipo ni con ninguna cuenta de Tailscale.
// Venir de la red de Tailscale tampoco alcanza: también vienen de ella otros equipos (uno compartido, el de un amigo, un
// enrutador) y una conexión directa a la 100.x, que no dice de quién es. Por eso, para las claves y los ajustes de la
// IA, la cuenta de Tailscale que trae el enlace https (cabecera Tailscale-User-Login, que pone Tailscale Serve) tiene
// que ser la del dueño, guardada en usuarios.tailscale_login de SU cuenta:
//  - Se guardó al crear el primer administrador (parte a). Si quedó vacía (se creó por una conexión directa), la
//    primera petición DEL DUEÑO que trae una cuenta la anota (queda en la auditoría). Nunca se anota la de otro
//    administrador.
//  - Si el dueño cambia de cuenta de Tailscale: oportia-admin.mjs --tailscale=reanotar la vacía (queda en la auditoría
//    lo que tenía) y la próxima petición del dueño anota la nueva.
// Lo que queda: un programa que corre en el mismo servidor puede inventar esa cabecera en 127.0.0.1:8080 (el mismo nivel
// de confianza que root o el usuario jarvis; src/nucleo/red.js).
import { enTransaccion } from '../nucleo/db.js';
import { ErrorHttp } from '../nucleo/http.js';
import { vieneDeTailscale } from '../nucleo/red.js';
import { auditar } from './usuarios.js';

const normal = login => String(login ?? '').trim().toLowerCase();

// El id de la cuenta del dueño (la primera cuenta de administrador), o null si todavía no hay ninguna. Los roles nunca
// cambian y nada se borra, así que siempre es la misma.
export function idDelDueno(db) {
  return db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").get()?.id ?? null;
}

// { si, motivo: null | 'solo_desde_tailnet' | 'solo_el_dueno' | 'solo_dueno_tailscale', login, anotado }.
// anotar: si el dueño todavía no tiene cuenta de Tailscale guardada, guarda esta (solo en las rutas de solo-dueño).
export function duenoDeTailscale(db, req, usuario, { anotar = false } = {}) {
  const ts = vieneDeTailscale(req);
  if (!ts.si) return { si: false, motivo: 'solo_desde_tailnet', login: null, anotado: false };
  if (!usuario?.id || usuario.rol !== 'admin' || Number(usuario.id) !== idDelDueno(db)) return { si: false, motivo: 'solo_el_dueno', login: null, anotado: false };
  if (!ts.login) return { si: false, motivo: 'solo_dueno_tailscale', login: null, anotado: false };
  const fila = db.prepare('SELECT tailscale_login FROM usuarios WHERE id = ?').get(usuario.id);
  if (!fila) return { si: false, motivo: 'solo_dueno_tailscale', login: null, anotado: false };
  if (fila.tailscale_login == null || fila.tailscale_login === '') {
    if (!anotar) return { si: true, motivo: null, login: ts.login, anotado: false };
    const anotado = enTransaccion(db, () => {
      // Otra vez dentro de la transacción: solo la cuenta del dueño, nunca la de otro administrador.
      if (Number(usuario.id) !== idDelDueno(db)) return false;
      const r = db.prepare("UPDATE usuarios SET tailscale_login = ? WHERE id = ? AND (tailscale_login IS NULL OR tailscale_login = '')").run(ts.login, usuario.id);
      if (r.changes) auditar(db, { usuarioId: usuario.id, accion: 'tailscale_login_anotado', detalle: JSON.stringify({ antes: null, despues: ts.login }) });
      return r.changes > 0;
    });
    if (anotado) return { si: true, motivo: null, login: ts.login, anotado: true };
    // Otra petición la anotó entretanto: se compara con la que quedó.
    return duenoDeTailscale(db, req, usuario, { anotar: false });
  }
  if (normal(fila.tailscale_login) !== normal(ts.login)) return { si: false, motivo: 'solo_dueno_tailscale', login: null, anotado: false };
  return { si: true, motivo: null, login: fila.tailscale_login, anotado: false };
}

// Lanza ErrorHttp(403, motivo) si quien pide no es el dueño desde su cuenta de Tailscale (para las acciones que dependen
// de los datos: crear un administrador, reiniciar la contraseña de otro o desactivarlo).
export function exigirDueno(db, req, usuario) {
  const dueno = duenoDeTailscale(db, req, usuario, { anotar: true });
  if (!dueno.si) throw new ErrorHttp(403, dueno.motivo);
  return dueno;
}

// La cuenta de Tailscale guardada de un administrador (o null).
export function loginDeTailscale(db, usuarioId) {
  return db.prepare('SELECT tailscale_login FROM usuarios WHERE id = ?').get(Number(usuarioId))?.tailscale_login || null;
}

// Para la consola (--tailscale=reanotar): vacía la cuenta guardada; la próxima petición del dueño anota la nueva.
// Devuelve la que tenía (o null). Queda en la auditoría con lo de antes y lo de después.
export function reanotarTailscale(db, { usuarioId, origen = 'consola' }) {
  return enTransaccion(db, () => {
    const antes = loginDeTailscale(db, usuarioId);
    if (antes == null) return null;
    db.prepare('UPDATE usuarios SET tailscale_login = NULL WHERE id = ?').run(Number(usuarioId));
    auditar(db, { usuarioId, accion: 'tailscale_login_reanotar', detalle: JSON.stringify({ antes, despues: null, origen }) });
    return antes;
  });
}
