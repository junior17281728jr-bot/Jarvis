// La CLAVE DE RECUPERACIÓN del dueño (fase 1, parte e): lo único que abre sus copias. Es el ÚNICO archivo que convierte
// la semilla en una llave privada.
//  - 128 bits al azar, escritos como 28 símbolos (Crockford base32: sin I, L, O ni U) en 7 grupos de 4: 26 de la
//    semilla y 2 de control (atrapan un error de un símbolo, salvo 1 de cada 1.024).
//  - De ella salen: una llave X25519 (el servidor guarda solo la PÚBLICA: con ella cifra, nunca puede abrir), el
//    «sello» (firma los índices y cada flujo: una copia falsa hecha con un token robado se rechaza; no abre nada), el
//    «verificador» (la página lo calcula sola, public/clave-recuperacion.js: el servidor guarda solo su sha256) y la
//    huella de 4 símbolos («Clave A7F3»).
//  - El texto de la clave nunca se guarda, nunca se anota, nunca va en un error ni en un aviso. Cada búfer derivado se
//    llena de ceros al terminar.
//  - 128 bits al azar no necesitan «estirar» la clave (nadie la elige).
import { createHash, createPrivateKey, createPublicKey, hkdfSync, randomBytes, scrypt } from 'node:crypto';
import { ErrorCopias } from './formato.js';

export const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SIMBOLOS = 28;
const DER_PRIVADA_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex');

// Llaves PÚBLICAS de las claves de prueba que están escritas en test/ (valores públicos, no secretos). Nunca pueden ser
// la clave activa de un servidor (confirmarClave las rechaza, parte e paso 2).
export const PUBLICAS_DE_PRUEBA = Object.freeze([
  'yUN3Z0y3YtqGEh83TOCN90IyKJY1jJvFyRw1Lss4kSQ', // la de test/copias-base.js (semilla: sha256('oportia-clave-de-prueba-v1'))
]);

export function esClaveDePrueba(publica) {
  const texto = Buffer.isBuffer(publica) ? publica.toString('base64url') : String(publica ?? '');
  return PUBLICAS_DE_PRUEBA.includes(texto);
}

// Bits → símbolos (de 5 en 5, rellenando con ceros al final).
function aBase32(bytes, bits) {
  let texto = '';
  for (let i = 0; i < bits; i += 5) {
    let valor = 0;
    for (let j = 0; j < 5; j++) {
      const bit = i + j;
      const uno = bit < bits ? (bytes[bit >> 3] >> (7 - (bit & 7))) & 1 : 0;
      valor = (valor << 1) | uno;
    }
    texto += ALFABETO[valor];
  }
  return texto;
}

function control(semilla) {
  return aBase32(createHash('sha256').update('oportia-clave-v1').update(semilla).digest(), 10);
}

// Normaliza lo que escribió el dueño: mayúsculas; O→0, I→1, L→1; sin espacios, guiones, puntos ni rayas bajas.
export function normalizarClave(texto) {
  return String(texto ?? '').toUpperCase().replace(/[\s\-._]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function textoDeClave(semilla) {
  const s = aBase32(semilla, 128) + control(semilla);
  return s.match(/.{4}/g).join('-');
}

export function crearClave() {
  const semilla = randomBytes(16);
  return { texto: textoDeClave(semilla), semilla };
}

// Texto → semilla (16 bytes). ErrorCopias('clave_formato') si no son 28 símbolos válidos; 'clave_control' si los de
// control (o los bits de relleno) no cuadran: casi seguro un error al escribirla.
export function leerClave(texto) {
  const s = normalizarClave(texto);
  if (s.length !== SIMBOLOS) throw new ErrorCopias('clave_formato');
  const valores = [];
  for (const c of s) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) throw new ErrorCopias('clave_formato');
    valores.push(v);
  }
  const semilla = Buffer.alloc(16);
  for (let i = 0; i < 130; i++) {
    const bit = (valores[Math.floor(i / 5)] >> (4 - (i % 5))) & 1;
    if (i >= 128) {
      if (bit !== 0) throw new ErrorCopias('clave_control');
    } else if (bit) semilla[i >> 3] |= 1 << (7 - (i & 7));
  }
  if (control(semilla) !== s.slice(26)) {
    semilla.fill(0);
    throw new ErrorCopias('clave_control');
  }
  return semilla;
}

const hkdf = (llave, sal, info) => Buffer.from(hkdfSync('sha256', llave, sal, info, 32));

export function huellaDe(publica) {
  return aBase32(createHash('sha256').update('oportia-huella-v1').update(Buffer.from(publica)).digest(), 20);
}

// La llave pública (32 bytes) de una llave privada X25519.
export function publicaDe(privada) {
  return Buffer.from(createPublicKey(privada).export({ format: 'jwk' }).x, 'base64url');
}

// semilla → { privada (KeyObject), publica (32 B), sello (32 B), verificador (32 B), huella }. Quien llama llena de
// ceros sello y verificador cuando termina (la semilla también).
export function derivar(semilla) {
  if (!Buffer.isBuffer(semilla) || semilla.length !== 16) throw new ErrorCopias('clave_formato');
  const raiz = hkdf(semilla, 'oportia-recuperacion-v1', '');
  const d = hkdf(raiz, '', 'x25519');
  const der = Buffer.concat([DER_PRIVADA_X25519, d]);
  try {
    const privada = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    const publica = publicaDe(privada);
    return {
      privada,
      publica,
      sello: hkdf(raiz, '', 'sello-indice'),
      verificador: hkdf(raiz, '', 'verificar-v1'),
      huella: huellaDe(publica),
    };
  } finally {
    raiz.fill(0);
    d.fill(0);
    der.fill(0);
  }
}

// Lo que el servidor guarda del verificador (copias_llaves.verificador): su sha256. Recibe el hex de 64 que manda la
// página; null si no tiene esa forma.
export function hashVerificador(hex) {
  const texto = String(hex ?? '');
  if (!/^[0-9a-f]{64}$/.test(texto)) return null;
  return createHash('sha256').update(Buffer.from(texto, 'hex')).digest('hex');
}

// El sha256 (hex) de un verificador en bytes (lo que se guarda en copias_llaves.verificador).
export const hashDeVerificador = bytes => createHash('sha256').update(bytes).digest('hex');

// ---------- 0.14.2: la CONTRASEÑA DE COPIAS (la elige el dueño) ----------
// Pedido del dueño: «quita eso, pon una contraseña normal». La contraseña se «estira» con scrypt (lento a propósito: quien
// tenga una copia y quiera adivinar tarda ~0,1–0,5 s por intento en una máquina como el servidor) y salen 16 bytes que
// son la MISMA «semilla» de siempre: derivar() da la llave X25519, el sello, el verificador y la huella. El sobre de las
// copias no cambia. La sal (al azar, 16 bytes) y los números de scrypt van con la parte pública: en la base (ajustes), en
// la cabecera del flujo de cada copia y en su índice; así se puede recuperar solo con la contraseña.
//  - La contraseña nunca se guarda, nunca se anota, nunca va en un error, un aviso, Telegram ni a una IA.
//  - Se normaliza igual en todas partes (NFC y sin espacios al principio ni al final): una «ñ» escrita en el iPhone y
//    pegada en la terminal de la Mac da la misma llave.
//  - scrypt N=2^15, r=8, p=1: 32 MB por cálculo y uno a la vez (servidor de 512 MB). Las pruebas pasan uno más chico.
export const KDF = Object.freeze({ kdf: 'scrypt', N: 32768, r: 8, p: 1 });
export const CONTRASENA_MIN = 10;
export const CONTRASENA_MAX = 200;
// Lo que se acepta al LEER un kdf (viene de una copia o un índice antes de saber si es auténtico: cualquiera con el token
// del bot puede fijar un archivo). Un N enorme no puede tumbar nada.
const N_MIN = 1024;
const N_MAX = 131072;
const LARGO_SAL = 16;

export function normalizarContrasena(texto) {
  return String(texto ?? '').normalize('NFC').trim();
}

// El problema de una contraseña nueva (código corto) o null si sirve: 10 caracteres o más, una letra y un número.
export function problemaDeContrasena(contrasena, repetida) {
  const c = normalizarContrasena(contrasena);
  const largo = [...c].length;
  if (largo < CONTRASENA_MIN) return 'contrasena_corta';
  if (largo > CONTRASENA_MAX) return 'contrasena_larga';
  if (!/\p{L}/u.test(c)) return 'contrasena_sin_letra';
  if (!/\p{Nd}/u.test(c)) return 'contrasena_sin_numero';
  if (repetida !== undefined && normalizarContrasena(repetida) !== c) return 'contrasenas_distintas';
  return null;
}

// ¿Este kdf (de la base, de una cabecera o de un índice) tiene la forma de siempre? → { kdf, N, r, p, sal } o null.
export function leerKdf(k) {
  if (!k || typeof k !== 'object' || k.kdf !== 'scrypt') return null;
  const { N, r, p } = k;
  if (!Number.isSafeInteger(N) || N < N_MIN || N > N_MAX || (N & (N - 1)) !== 0 || r !== 8 || p !== 1) return null;
  if (typeof k.sal !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(k.sal) || Buffer.from(k.sal, 'base64url').length !== LARGO_SAL) return null;
  return { kdf: 'scrypt', N, r, p, sal: k.sal };
}

export function nuevoKdf(base = KDF) {
  return leerKdf({ kdf: 'scrypt', N: base.N, r: base.r, p: base.p, sal: randomBytes(LARGO_SAL).toString('base64url') });
}

// Un cálculo de scrypt a la vez (32 MB cada uno): el resto espera su turno.
let enCurso = Promise.resolve();
function porTurno(trabajo) {
  const r = enCurso.then(trabajo, trabajo);
  enCurso = r.then(() => {}, () => {});
  return r;
}

// contraseña + kdf → la semilla (16 bytes; quien llama la llena de ceros). ErrorCopias('contrasena_formato') si no hay
// contraseña, 'kdf_no_valido' si el kdf no tiene la forma de siempre.
export function semillaDeContrasena(contrasena, kdf) {
  const k = leerKdf(kdf);
  if (!k) return Promise.reject(new ErrorCopias('kdf_no_valido'));
  const texto = normalizarContrasena(contrasena);
  if (!texto || [...texto].length > CONTRASENA_MAX) return Promise.reject(new ErrorCopias('contrasena_formato'));
  const entrada = Buffer.from(texto, 'utf8');
  return porTurno(() => new Promise((ok, mal) => {
    scrypt(entrada, Buffer.from(k.sal, 'base64url'), 16, { N: k.N, r: k.r, p: k.p, maxmem: 160 * k.N * k.r }, (error, semilla) => {
      entrada.fill(0);
      if (error) mal(new ErrorCopias('kdf_no_valido'));
      else ok(semilla);
    });
  }));
}

// contraseña + kdf → lo mismo que derivar(): { privada, publica, sello, verificador, huella } y además el kdf.
export async function derivarDeContrasena(contrasena, kdf) {
  const semilla = await semillaDeContrasena(contrasena, kdf);
  try {
    return { ...derivar(semilla), kdf: leerKdf(kdf) };
  } finally {
    semilla.fill(0);
  }
}
