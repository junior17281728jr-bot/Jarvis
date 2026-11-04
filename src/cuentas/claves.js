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

// Contraseñas que cualquiera adivina. Se comparan sin mayúsculas, sin tildes, sin espacios ni signos, y también con
// números o signos alrededor («password123», «Oportia2026», «qwerty1», «hola!»): quien adivina prueba primero esas.
// Desde internet se pueden probar unas 1.900 contraseñas al día por cuenta, así que estas tienen que quedar fuera.
const PALABRAS_OBVIAS = new Set([
  // Las de siempre (en inglés y en español).
  'password', 'passw', 'contrasena', 'clave', 'miclave', 'secreto', 'secret', 'iloveyou', 'teamo', 'teamomucho', 'tequiero',
  'admin', 'administrador', 'administrator', 'root', 'usuario', 'user', 'login', 'welcome', 'bienvenido', 'letmein', 'hello',
  'test', 'prueba', 'master', 'monkey', 'dragon', 'shadow', 'sunshine', 'superman', 'batman', 'pokemon', 'football', 'baseball',
  'soccer', 'princess', 'qwerty', 'azerty', 'qwertz', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh',
  // El servidor y el programa.
  'oportia', 'jarvis', 'servidor', 'server', 'tailscale', 'funnel',
  // Comunes en República Dominicana.
  'hola', 'holahola', 'amor', 'miamor', 'amorcito', 'mivida', 'micielo', 'cielo', 'corazon', 'dios', 'diosesamor', 'diostebendiga',
  'jesus', 'jesucristo', 'cristo', 'mariposa', 'princesa', 'principe', 'estrella', 'angel', 'angelito', 'bebe', 'mibebe',
  'familia', 'felicidad', 'chocolate', 'mama', 'papa', 'mami', 'papi', 'mamita', 'papito', 'hijo', 'hija', 'abuela', 'abuelo',
  'novia', 'novio', 'nene', 'nena', 'loco', 'loca', 'tigre', 'tiguere', 'dinero', 'money', 'love', 'lover', 'futbol', 'beisbol',
  'pelota', 'licey', 'aguilas', 'escogido', 'estrellas', 'toros', 'gigantes', 'yankees', 'dominicana', 'dominicano',
  'republicadominicana', 'rd', 'quisqueya', 'quisqueyana', 'santiago', 'santodomingo', 'puntacana', 'cibao', 'merengue',
  'bachata', 'mangu', 'presidente', 'internet', 'computadora', 'celular', 'iphone', 'samsung', 'google', 'facebook',
  'instagram', 'whatsapp', 'netflix',
]);

// Filas y columnas del teclado: un trozo de ellas («asdf», «qwertyuiop», «1q2w3e», «zxcvbn») se adivina enseguida.
const TECLADO = ['qwertyuiop', 'asdfghjkln', 'zxcvbnm', '1234567890', 'qazwsxedcrfvtgbyhnujmikolp', '1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p',
  'zaq1xsw2cde3vfr4bgt5nhy6mju7', '1q2w3e4r5t6y7u8i9o0p', 'q1w2e3r4t5y6u7i8o9p0', 'qwertzuiop', 'azertyuiop', '147258369', '159753'];
const alReves = x => [...x].reverse().join('');
const enTeclado = (x, minimo) => x.length >= minimo && TECLADO.some(f => f.includes(x) || f.includes(alReves(x)));

// «4 → a», «0 → o»…: «p4ssw0rd» es «password».
const sinNumerosDeLetra = x => x.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');

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

// Junta lo repetido seguido: «111222» → «12», «aaa111» → «a1», «aabbcc» → «abc».
const juntarRepetidos = x => x.replace(/(.)\1+/g, '$1');

// ¿Este texto (ya sin signos) se adivina solo por su forma o porque es una palabra de la lista?
function trivial(x) {
  if (!x) return true;
  if (/^(.)\1+$/.test(x)) return true;
  if (PALABRAS_OBVIAS.has(x) || PALABRAS_OBVIAS.has(sinNumerosDeLetra(x))) return true;
  if (enSerie(x) || enTeclado(x, 4)) return true;
  // Un mismo trozo repetido: «abcabc», «123123», «holahola».
  const repetido = x.match(/^(.+?)\1+$/);
  if (repetido && (repetido[1].length <= 4 || trivial(repetido[1]))) return true;
  // Al revés y al derecho: «123321», «abccba».
  if (x.length >= 4 && x === alReves(x) && trivial(x.slice(0, Math.ceil(x.length / 2)))) return true;
  const junto = juntarRepetidos(x);
  if (junto !== x && (junto.length <= 2 || trivial(junto))) return true;
  return false;
}

// Un trozo corto que alguien pone delante o detrás de la palabra: «123», «2026», «1».
const adorno = d => d.length <= 4 || trivial(d);
// La parte de letras: palabra de la lista, serie («abc»), trozo del teclado («qwe») o una o dos letras («1234567a»).
const letrasObvias = l => l.length <= 2 || trivial(l) || enTeclado(l, 3) || PALABRAS_OBVIAS.has(sinNumerosDeLetra(l));

// Palabra con números delante o detrás: «password123», «123qwe», «2026oportia», «1234567a».
function obviaPorSuForma(base) {
  if (trivial(base)) return true;
  const partes = base.match(/^(\d*)([a-z][a-z0-9]*?[a-z]|[a-z])(\d*)$/);
  if (!partes) return false;
  const [, antes, letras, despues] = partes;
  const numeros = antes + despues;
  if (numeros && (!antes || adorno(antes)) && (!despues || adorno(despues)) && letrasObvias(letras)) return true;
  return Boolean(!antes !== !despues && trivial(numeros) && letras.length <= 2);
}

const simple = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s._-]+/g, '');

// ¿Es tan fácil que no sirve? Las de la lista (también con números o signos alrededor), las series, el teclado, lo
// repetido o el nombre de la persona (su usuario, su nombre completo o una parte, solo o con números al final, como
// «junior123» o «maria2026»).
export function claveObvia(clave, nombres = []) {
  const c = simple(clave);
  if (!c) return true;
  // Sin signos: «hola!» es «hola», «p@ssword» es «password»; y los signos de arriba de los números («!@#$%^») son «123456».
  const sinSignos = c.replace(/@/g, 'a').replace(/\$/g, 's').replace(/[^a-z0-9]/g, '');
  const conNumeros = c.replace(/[!@#$%^&*()]/g, ch => String('!@#$%^&*()'.indexOf(ch) + 1).slice(-1)).replace(/[^a-z0-9]/g, '');
  if ([sinSignos, conNumeros].some(obviaPorSuForma)) return true;
  // El nombre entero («juanperez») y cada parte («juan», «perez»), sin tildes.
  const nombresSueltos = nombres.flatMap(nombre => {
    const sinTildes = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return [simple(nombre), ...sinTildes.split(/[^a-z0-9]+/)];
  });
  for (const n of nombresSueltos) {
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
