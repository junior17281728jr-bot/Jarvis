// Quién puede entrar. OPORTIA solo atiende conexiones que llegan:
//  - desde el mismo servidor (127.0.0.1 / ::1): así llegan el enlace https de Tailscale Funnel y la revisión del actualizador;
//  - desde tu red privada de Tailscale (100.64.0.0/10 o fd7a:115c:a1e0::/48).
// La puerta 8080 abierta a internet, sin candado, deja de responder.

function sinPrefijo(direccion = '') {
  return String(direccion).replace(/^::ffff:/i, '').toLowerCase();
}

export function esLocal(direccion) {
  const d = sinPrefijo(direccion);
  return d === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(d);
}

export function esTailscale(direccion) {
  const d = sinPrefijo(direccion);
  const m = d.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 100 && b >= 64 && b <= 127; // 100.64.0.0/10
  }
  return d.startsWith('fd7a:115c:a1e0:'); // fd7a:115c:a1e0::/48
}

// Se decide por la dirección LOCAL del servidor que recibió la conexión (a qué "puerta" entró),
// no por cabeceras, que cualquiera puede inventar.
export function entradaPermitida(direccionLocal) {
  return esLocal(direccionLocal) || esTailscale(direccionLocal);
}

// Dirección real del visitante. Por el enlace https (Tailscale) todos llegan como 127.0.0.1,
// así que en ese caso se usa la cabecera X-Forwarded-For que pone Tailscale. Solo se confía
// en ella cuando la conexión viene del propio servidor.
export function clienteDe(req) {
  const remoto = req.socket?.remoteAddress;
  if (esLocal(remoto)) {
    const reenviado = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (reenviado) return reenviado.slice(0, 64);
  }
  return sinPrefijo(remoto || 'desconocido');
}

export function esHttps(req) {
  return esLocal(req.socket?.remoteAddress) && String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

// ¿La petición viene de un equipo de tu red Tailscale (y no del público a través de Funnel)?
//  - Directa a la dirección 100.x del servidor: sí.
//  - Por el enlace https: Tailscale añade Tailscale-User-Login a los usuarios de tu red y
//    Tailscale-Funnel-Request a los visitantes de internet. Tailscale borra esas cabeceras si alguien las inventa.
export function vieneDeTailscale(req) {
  const remoto = req.socket?.remoteAddress;
  if (esTailscale(remoto)) return { si: true, login: null };
  const login = req.headers['tailscale-user-login'];
  if (esLocal(remoto) && login && !req.headers['tailscale-funnel-request']) return { si: true, login: String(login).slice(0, 200) };
  return { si: false, login: null };
}
