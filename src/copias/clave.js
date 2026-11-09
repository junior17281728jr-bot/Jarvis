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
import { createHash, createPrivateKey, createPublicKey, hkdfSync, randomBytes } from 'node:crypto';
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
