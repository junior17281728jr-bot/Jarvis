// Contraseñas: se guardan con scrypt (incluido en Node), de una forma que no se puede deshacer.
// Nadie, ni el administrador, puede leer una contraseña guardada.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384, R = 8, P = 1, LARGO = 32;
const MAX_A_LA_VEZ = 2; // en un servidor de 512 MB, como máximo 2 cálculos a la vez (unos 16 MB cada uno)
let enCurso = 0;
const enEspera = [];

async function porTurno(trabajo) {
  while (enCurso >= MAX_A_LA_VEZ) await new Promise(ok => enEspera.push(ok));
  enCurso++;
  try {
    return await trabajo();
  } finally {
    enCurso--;
    enEspera.shift()?.();
  }
}

function derivar(clave, sal) {
  return new Promise((ok, mal) => scrypt(clave, sal, LARGO, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? mal(e) : ok(k))));
}

export function claveValida(clave) {
  return typeof clave === 'string' && clave.length >= 10 && clave.length <= 200;
}

export async function hashClave(clave) {
  const sal = randomBytes(16);
  const k = await porTurno(() => derivar(clave, sal));
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64url')}$${k.toString('base64url')}`;
}

// Hash de relleno: se usa cuando el usuario no existe, para que tarde lo mismo y no se pueda averiguar quién existe.
const RELLENO = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(LARGO).toString('base64url')}`;

export async function verificarClave(clave, guardado = RELLENO) {
  if (typeof clave !== 'string' || clave.length > 200) return false;
  const partes = String(guardado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt' || partes[1] !== String(N) || partes[2] !== String(R) || partes[3] !== String(P)) return false;
  try {
    const sal = Buffer.from(partes[4], 'base64url');
    const esperado = Buffer.from(partes[5], 'base64url');
    if (esperado.length !== LARGO) return false;
    const k = await porTurno(() => derivar(clave, sal));
    return timingSafeEqual(k, esperado) && guardado !== RELLENO;
  } catch {
    return false;
  }
}

// Clave temporal fácil de copiar: 3 grupos de 4 letras y números, sin caracteres que se confunden.
export function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let texto = '';
  for (let i = 0; i < 12; i++) texto += letras[bytes[i] % letras.length] + (i % 4 === 3 && i < 11 ? '-' : '');
  return texto;
}
