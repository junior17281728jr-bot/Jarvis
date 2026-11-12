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

// 0.9.2 (pedido de Junior): cada persona pone la contraseña que quiera, de 4 caracteres o más. Solo se rechazan las
// peores («1234», «0000», «abcd», «aaaa», «password», su propio usuario o nombre). Lo que protege una contraseña corta es
// el freno de la entrada: 5 contraseñas malas para una cuenta desde un mismo lugar = 15 minutos de espera, y 20 desde
// todo internet (src/api/cuentas.js).
export const LARGO_MINIMO_CLAVE = 4;

export function claveValida(clave) {
  return typeof clave === 'string' && clave.length >= LARGO_MINIMO_CLAVE && clave.length <= 200;
}

const PEORES = new Set(['password', 'contrasena', 'clave', 'qwerty', 'asdf', 'asdfg', 'qwer', 'admin', 'usuario', 'user', 'test', 'prueba', 'abcd1234', '12345678a']);

// Números o letras seguidos con el mismo salto («123456», «97531», «abcdef», «fedcba»), y números de 2 o 3 cifras
// que suben o bajan igual («102030», «112233», «100200300»).
function enSerie(x) {
  if (x.length < 3) return false;
  if (/^\d+$/.test(x) || /^[a-z]+$/.test(x)) {
    const codigos = [...x].map(ch => ch.charCodeAt(0));
    const salto = codigos[1] - codigos[0];
    const digitos = /^\d+$/.test(x);
    // En los números, «7890» y «3210987» también cuentan (después del 9 viene el 0).
    const igual = (a, b) => b - a === salto || (digitos && Math.abs(salto) === 1 && (b - a + 10) % 10 === (salto + 10) % 10);
    if (Math.abs(salto) <= 3 && codigos.every((c, i) => i === 0 || igual(codigos[i - 1], c))) return true;
  }
  if (/^\d+$/.test(x)) {
    for (const k of [2, 3]) {
      if (x.length % k || x.length / k < 3) continue;
      const numeros = x.match(new RegExp(`\\d{${k}}`, 'g')).map(Number);
      const salto = numeros[1] - numeros[0];
      if (numeros.every((n, i) => i === 0 || n - numeros[i - 1] === salto)) return true;
    }
  }
  return false;
}

const simple = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s._-]+/g, '');

// ¿Es de las peores? Todo el mismo carácter, una serie entera («1234», «abcd», «9876»), una de la lista corta, o
// exactamente su usuario, su nombre o una parte de su nombre.
export function claveObvia(clave, nombres = []) {
  const c = simple(clave);
  if (!c) return true;
  if (/^(.)\1+$/.test(c) || enSerie(c) || PEORES.has(c)) return true;
  const nombresSueltos = nombres.flatMap(nombre => {
    const sinTildes = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return [simple(nombre), ...sinTildes.split(/[^a-z0-9]+/)];
  }).filter(n => n.length >= 3);
  return nombresSueltos.includes(c);
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

// 0.9.2: una cuenta «pendiente de contraseña» (el administrador la creó solo con el nombre): en vez del hash guarda esta
// marca, que nunca coincide con ninguna contraseña. La primera persona que entra con ese usuario crea la suya.
export const MARCA_PENDIENTE = 'pendiente$';
export const clavePendiente = () => `${MARCA_PENDIENTE}${randomBytes(12).toString('hex')}`;
export const esPendiente = guardado => typeof guardado === 'string' && guardado.startsWith(MARCA_PENDIENTE);

// Clave temporal fácil de copiar: 3 grupos de 4 letras y números, sin caracteres que se confunden.
export function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let texto = '';
  for (let i = 0; i < 12; i++) texto += letras[bytes[i] % letras.length] + (i % 4 === 3 && i < 11 ? '-' : '');
  return texto;
}
