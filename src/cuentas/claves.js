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

export const LARGO_MINIMO_CLAVE = 6;

export function claveValida(clave) {
  return typeof clave === 'string' && clave.length >= LARGO_MINIMO_CLAVE && clave.length <= 200;
}

// Contraseñas que cualquiera adivina. Se comparan sin mayúsculas, sin tildes y sin espacios.
const CLAVES_OBVIAS = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '0123456789', '111111', '000000', '123123',
  '654321', '987654', '987654321', '121212', '112233', 'abcdef', 'abc123', 'abcd1234', 'qwerty', 'qwerty123', 'asdfgh', 'password',
  'password1', 'contrasena', 'contrasena1', 'clave123', 'iloveyou', 'teamo', 'oportia', 'oportia123', 'admin123', 'administrador']);

const simple = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s._-]+/g, '');

// ¿Es tan fácil que no sirve? Las de la lista, un mismo carácter repetido («aaaaaa») o el nombre de la persona
// (su usuario o su nombre completo, solo o con números al final, como «junior123»).
export function claveObvia(clave, nombres = []) {
  const c = simple(clave);
  if (!c) return true;
  if (CLAVES_OBVIAS.has(c) || /^(.)\1+$/.test(c)) return true;
  for (const nombre of nombres) {
    const n = simple(nombre);
    if (n.length >= 3 && c.startsWith(n) && /^\d{0,4}$/.test(c.slice(n.length))) return true;
  }
  return false;
}

// La clave de error que corresponde, o null si la contraseña sirve.
export function problemaDeClave(clave, nombres = []) {
  if (!claveValida(clave)) return 'clave_corta';
  if (claveObvia(clave, nombres)) return 'clave_obvia';
  return null;
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
