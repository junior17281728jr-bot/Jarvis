// La clave de recuperación EN LA PÁGINA (fase 1, parte e). La página nunca manda la clave que el dueño escribe: la
// revisa aquí (los 2 símbolos de control) y calcula su «verificador», que es lo único que viaja al servidor (el
// servidor guarda solo su sha256). Debe dar EXACTAMENTE lo mismo que src/copias/clave.js (una prueba lo compara con
// 1.000 claves y con el vector congelado).
// JavaScript puro, sin WebCrypto: en una dirección http:// de la red de Tailscale el navegador no da crypto.subtle.
// No importa nada y no usa la red.

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SIMBOLOS = 28;

// ---------- SHA-256, HMAC y HKDF (FIPS 180-4, RFC 2104, RFC 5869) ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotar = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(datos) {
  const largo = datos.length;
  const total = Math.ceil((largo + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(datos);
  m[largo] = 0x80;
  const bits = largo * 8;
  const vista = new DataView(m.buffer);
  vista.setUint32(total - 8, Math.floor(bits / 0x100000000));
  vista.setUint32(total - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotar(w[t - 15], 7) ^ rotar(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotar(w[t - 2], 17) ^ rotar(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (k + (rotar(e, 6) ^ rotar(e, 11) ^ rotar(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((rotar(a, 2) ^ rotar(a, 13) ^ rotar(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  const salida = new Uint8Array(32);
  const vs = new DataView(salida.buffer);
  for (let i = 0; i < 8; i++) vs.setUint32(i * 4, h[i]);
  m.fill(0);
  w.fill(0);
  return salida;
}

const unir = (...partes) => {
  const salida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of partes) { salida.set(p, i); i += p.length; }
  return salida;
};

const texto = s => new TextEncoder().encode(s);

export function hmac(llave, datos) {
  let k = llave.length > 64 ? sha256(llave) : llave;
  const bloque = new Uint8Array(64);
  bloque.set(k);
  const interior = bloque.map(x => x ^ 0x36);
  const exterior = bloque.map(x => x ^ 0x5c);
  const salida = sha256(unir(exterior, sha256(unir(interior, datos))));
  bloque.fill(0); interior.fill(0); exterior.fill(0);
  k = null;
  return salida;
}

// HKDF-SHA256 de 32 bytes (un solo bloque). Una sal vacía es 32 ceros (RFC 5869), igual que node:crypto.
export function hkdf32(llave, sal, info) {
  const prk = hmac(sal.length ? sal : new Uint8Array(32), llave);
  const salida = hmac(prk, unir(info, new Uint8Array([1])));
  prk.fill(0);
  return salida;
}

export const aHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

// ---------- La clave ----------
function aBase32(bytes, bits) {
  let s = '';
  for (let i = 0; i < bits; i += 5) {
    let valor = 0;
    for (let j = 0; j < 5; j++) {
      const bit = i + j;
      valor = (valor << 1) | (bit < bits ? (bytes[bit >> 3] >> (7 - (bit & 7))) & 1 : 0);
    }
    s += ALFABETO[valor];
  }
  return s;
}

// Igual que el servidor: mayúsculas; O→0, I→1, L→1; sin espacios, guiones, puntos ni rayas bajas.
export function normalizarClave(t) {
  return String(t ?? '').toUpperCase().replace(/[\s\-._]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

// → { ok: true, semilla } o { ok: false, error: 'clave_formato' | 'clave_control' }.
export function leerClave(t) {
  const s = normalizarClave(t);
  if (s.length !== SIMBOLOS) return { ok: false, error: 'clave_formato' };
  const valores = [];
  for (const c of s) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) return { ok: false, error: 'clave_formato' };
    valores.push(v);
  }
  const semilla = new Uint8Array(16);
  for (let i = 0; i < 130; i++) {
    const bit = (valores[Math.floor(i / 5)] >> (4 - (i % 5))) & 1;
    if (i >= 128) {
      if (bit) return { ok: false, error: 'clave_control' };
    } else if (bit) semilla[i >> 3] |= 1 << (7 - (i & 7));
  }
  const control = aBase32(sha256(unir(texto('oportia-clave-v1'), semilla)), 10);
  if (control !== s.slice(26)) { semilla.fill(0); return { ok: false, error: 'clave_control' }; }
  return { ok: true, semilla };
}

// El verificador (64 hex) de lo que escribió el dueño, o { ok: false, error }.
export function verificadorDe(t) {
  const leida = leerClave(t);
  if (!leida.ok) return leida;
  const raiz = hkdf32(leida.semilla, texto('oportia-recuperacion-v1'), new Uint8Array(0));
  const v = hkdf32(raiz, new Uint8Array(0), texto('verificar-v1'));
  const hex = aHex(v);
  leida.semilla.fill(0); raiz.fill(0); v.fill(0);
  return { ok: true, verificador: hex };
}

// El primer grupo de 4 (1…7) en que lo escrito no es igual a lo mostrado, o 0 si son iguales.
export function grupoDistinto(mostrada, escrita) {
  const a = normalizarClave(mostrada);
  const b = normalizarClave(escrita);
  for (let g = 0; g < 7; g++) if (a.slice(g * 4, g * 4 + 4) !== b.slice(g * 4, g * 4 + 4)) return g + 1;
  return 0;
}

// Para mostrarla: 7 grupos de 4 separados por un guion.
export function gruposDeClave(t) {
  const s = normalizarClave(t);
  return s.match(/.{1,4}/g) ?? [];
}
