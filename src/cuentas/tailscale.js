// ¿Quién es el DUEÑO en la red de Tailscale? (fase 1, parte d: las claves y lo que gasta dinero)
// Venir de la red de Tailscale no alcanza: también vienen de ella otros equipos (uno compartido, el de un amigo, un
// enrutador) y una conexión directa a la 100.x, que no dice de quién es. Por eso, para las claves y los ajustes de la
// IA, la cuenta de Tailscale que trae el enlace https (cabecera Tailscale-User-Login, que pone Tailscale Serve) tiene
// que ser la del administrador que entró, guardada en usuarios.tailscale_login:
//  - Se guardó al crear el primer administrador (parte a). Si quedó vacía (se creó por una conexión directa), la
//    primera petición del dueño que trae una cuenta la anota (queda en la auditoría).
//  - Si el dueño cambia de cuenta de Tailscale: oportia-admin.mjs --tailscale=reanotar la vacía (queda en la auditoría
//    lo que tenía) y la próxima petición anota la nueva.
// Lo que queda: un programa que corre en el mismo servidor puede inventar esa cabecera en 127.0.0.1:8080 (el mismo nivel
// de confianza que root o el usuario jarvis; src/nucleo/red.js).
import { enTransaccion } from '../nucleo/db.js';
import { vieneDeTailscale } from '../nucleo/red.js';
import { auditar } from './usuarios.js';

const normal = login => String(login ?? '').trim().toLowerCase();

// { si, motivo: null | 'solo_desde_tailnet' | 'solo_dueno_tailscale', login, anotado }. anotar: si el administrador
// todavía no tiene cuenta de Tailscale guardada, guarda esta (solo en las rutas de solo-dueño).
export function duenoDeTailscale(db, req, usuario, { anotar = false } = {}) {
  const ts = vieneDeTailscale(req);
  if (!ts.si) return { si: false, motivo: 'solo_desde_tailnet', login: null, anotado: false };
  if (!ts.login || !usuario?.id) return { si: false, motivo: 'solo_dueno_tailscale', login: null, anotado: false };
  const fila = db.prepare('SELECT tailscale_login FROM usuarios WHERE id = ?').get(usuario.id);
  if (!fila) return { si: false, motivo: 'solo_dueno_tailscale', login: null, anotado: false };
  if (fila.tailscale_login == null || fila.tailscale_login === '') {
    if (!anotar) return { si: true, motivo: null, login: ts.login, anotado: false };
    const anotado = enTransaccion(db, () => {
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
