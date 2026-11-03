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
