// Academia 0.14.83: Administrador → Avanzado → «Traspaso (para otro Claude)». La «bóveda» de cada administrador: los
// enlaces de Drive, cómo entrar al servidor, las notas para Claude, lo que falta y sus campos propios. Pedido del dueño:
// «solo se desbloquea con mi contraseña».
//  - La llave sale de SU contraseña (la de entrar) con scrypt (N=2^15, r=8, p=1: unos 32 MB y uno a la vez) y una sal
//    al azar; el texto va cifrado con AES-256-GCM (cifrar/descifrar de src/claves/cifrado.js, el único que cifra).
//    La llave nunca se guarda: ni en la base, ni en el disco, ni en la memoria después del pedido (se llena de ceros).
//    A diferencia de «Claves e IA» (que usa la llave del servidor, en un archivo aparte), aquí ni la base ni la llave
//    del servidor sirven: sin la contraseña, nadie lo lee.
//  - En la base (ajustes, 'traspaso.boveda.<id>') solo queda el sobre: { v, kdf (con la sal), ref, iv, sello, cifrado,
//    en }. ref (al azar) va en la AAD: un sobre copiado a otra fila no se abre.
//  - Nada se borra: «Empezar de nuevo» (la contraseña cambió y la de antes se olvidó) guarda el sobre viejo con otro
//    nombre ('traspaso.boveda.<id>.apartada-<fecha>') y empieza uno vacío.
//  - Los errores son solo un código corto; ningún texto de la bóveda ni la contraseña van a un error, la consola o la
//    auditoría.
import { randomBytes, scrypt } from 'node:crypto';
import { cifrar, descifrar } from '../claves/cifrado.js';
import { ErrorHttp } from '../nucleo/http.js';

export const VERSION_SOBRE = 1;
export const KDF_TRASPASO = Object.freeze({ kdf: 'scrypt', N: 32768, r: 8, p: 1 });
const USO = 'traspaso';
const PREFIJO = 'traspaso.boveda.';
const N_MIN = 1024;
const N_MAX = 131072;
// Los campos fijos (con su tope de caracteres) y los propios del dueño (nombre + valor, hasta 30).
export const CAMPOS = Object.freeze({
  driveContenido: 500,
  driveFuentes: 500,
  repo: 500,
  servidor: 4000,
  notas: 20000,
  pendientes: 8000,
});
export const MAX_PROPIOS = 30;
export const LARGO_NOMBRE_PROPIO = 60;
export const LARGO_VALOR_PROPIO = 4000;
export const LARGO_CONTRASENA = 200;

export const claveDeBoveda = usuarioId => `${PREFIJO}${Number(usuarioId)}`;

function leerFila(db, clave) {
  return db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
}
function escribirFila(db, clave, valor) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, valor, new Date().toISOString());
}

// Un contenido vacío (lo que muestra la pantalla la primera vez).
export function contenidoVacio() {
  return { ...Object.fromEntries(Object.keys(CAMPOS).map(k => [k, ''])), propios: [] };
}

// Lo que llega de la pantalla → un contenido limpio (o ErrorHttp 400). Nunca guarda campos que no conoce.
export function limpiarContenido(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new ErrorHttp(400, 'datos_no_validos');
  const limpio = contenidoVacio();
  for (const [campo, tope] of Object.entries(CAMPOS)) {
    const v = datos[campo] ?? '';
    if (typeof v !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
    if (v.length > tope) throw new ErrorHttp(400, 'traspaso_muy_largo');
    limpio[campo] = v.replace(/\r\n?/g, '\n');
  }
  const propios = datos.propios ?? [];
  if (!Array.isArray(propios)) throw new ErrorHttp(400, 'datos_no_validos');
  if (propios.length > MAX_PROPIOS) throw new ErrorHttp(400, 'traspaso_muchos_campos');
  for (const p of propios) {
    if (!p || typeof p !== 'object' || typeof (p.nombre ?? '') !== 'string' || typeof (p.valor ?? '') !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
    const nombre = String(p.nombre ?? '').replace(/\s+/g, ' ').trim();
    const valor = String(p.valor ?? '').replace(/\r\n?/g, '\n');
    if (nombre.length > LARGO_NOMBRE_PROPIO || valor.length > LARGO_VALOR_PROPIO) throw new ErrorHttp(400, 'traspaso_muy_largo');
    if (!nombre && !valor.trim()) continue; // una fila vacía no se guarda
    if (!nombre) throw new ErrorHttp(400, 'traspaso_sin_nombre');
    limpio.propios.push({ nombre, valor });
  }
  return limpio;
}

function leerKdf(k) {
  if (!k || typeof k !== 'object' || k.kdf !== 'scrypt') return null;
  const { N, r, p } = k;
  if (!Number.isSafeInteger(N) || N < N_MIN || N > N_MAX || (N & (N - 1)) !== 0 || r !== 8 || p !== 1) return null;
  if (typeof k.sal !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(k.sal)) return null;
  return { kdf: 'scrypt', N, r, p, sal: k.sal };
}
const kdfNuevo = (base = KDF_TRASPASO) => ({ kdf: 'scrypt', N: base.N, r: base.r, p: base.p, sal: randomBytes(16).toString('base64url') });

// Un cálculo de scrypt a la vez (32 MB cada uno, en un servidor de 512 MB): el resto espera su turno.
let enCurso = Promise.resolve();
function porTurno(trabajo) {
  const r = enCurso.then(trabajo, trabajo);
  enCurso = r.then(() => {}, () => {});
  return r;
}

// contraseña + kdf → la llave (32 bytes). Quien la pide la llena de ceros al terminar.
function llaveDe(contrasena, kdf) {
  const k = leerKdf(kdf);
  if (!k) return Promise.reject(new ErrorHttp(500, 'traspaso_danado'));
  const entrada = Buffer.from(String(contrasena), 'utf8');
  return porTurno(() => new Promise((ok, mal) => {
    scrypt(entrada, Buffer.from(k.sal, 'base64url'), 32, { N: k.N, r: k.r, p: k.p, maxmem: 160 * k.N * k.r }, (error, llave) => {
      entrada.fill(0);
      if (error) mal(new ErrorHttp(500, 'traspaso_danado'));
      else ok(llave);
    });
  }));
}

function leerSobre(db, usuarioId) {
  const texto = leerFila(db, claveDeBoveda(usuarioId));
  if (texto == null) return null;
  try {
    const s = JSON.parse(texto);
    if (s?.v !== VERSION_SOBRE || !leerKdf(s.kdf) || typeof s.ref !== 'string' || typeof s.iv !== 'string' || typeof s.sello !== 'string' || typeof s.cifrado !== 'string') return { danado: true };
    return s;
  } catch {
    return { danado: true };
  }
}

// ¿Hay bóveda? → { existe, en, danada }. Nunca descifra nada.
export function estadoBoveda(db, usuarioId) {
  const s = leerSobre(db, usuarioId);
  if (!s) return { existe: false, en: null, danada: false };
  return { existe: true, en: s.danado ? null : (typeof s.en === 'string' ? s.en : null), danada: Boolean(s.danado) };
}

const b64 = x => Buffer.from(x).toString('base64url');

function sellar(db, usuarioId, llave, kdf, contenido, ahora = Date.now()) {
  const ref = randomBytes(12).toString('base64url');
  const { iv, sello, cifrado } = cifrar(llave, JSON.stringify(contenido), { ref, uso: USO });
  const en = new Date(ahora).toISOString();
  escribirFila(db, claveDeBoveda(usuarioId), JSON.stringify({ v: VERSION_SOBRE, kdf, ref, iv: b64(iv), sello: b64(sello), cifrado: b64(cifrado), en }));
  return en;
}

// Abre la bóveda con la contraseña. → { contenido, en, llave, kdf } (quien la pide llena la llave de ceros) o
// ErrorHttp 409 'traspaso_otra_clave' si no abre con ella (se cerró con una contraseña anterior).
async function abrirConLlave(db, usuarioId, contrasena) {
  const s = leerSobre(db, usuarioId);
  if (!s) return null;
  if (s.danado) throw new ErrorHttp(500, 'traspaso_danado');
  const llave = await llaveDe(contrasena, s.kdf);
  let texto;
  try {
    texto = descifrar(llave, { iv: Buffer.from(s.iv, 'base64url'), sello: Buffer.from(s.sello, 'base64url'), cifrado: Buffer.from(s.cifrado, 'base64url') }, { ref: s.ref, uso: USO });
  } catch {
    llave.fill(0);
    throw new ErrorHttp(409, 'traspaso_otra_clave');
  }
  let contenido;
  try { contenido = limpiarContenido(JSON.parse(texto)); } catch { contenido = contenidoVacio(); }
  return { contenido, en: s.en ?? null, llave, kdf: leerKdf(s.kdf) };
}

// La contraseña ya se revisó (es la de entrar). Si no hay bóveda, la crea vacía con ella. → { contenido, en }.
export async function abrirBoveda(db, usuarioId, contrasena, { kdf = KDF_TRASPASO, ahora = Date.now() } = {}) {
  const abierta = await abrirConLlave(db, usuarioId, contrasena);
  if (abierta) {
    abierta.llave.fill(0);
    return { contenido: abierta.contenido, en: abierta.en };
  }
  const nuevo = kdfNuevo(kdf);
  const llave = await llaveDe(contrasena, nuevo);
  try {
    const contenido = contenidoVacio();
    return { contenido, en: sellar(db, usuarioId, llave, nuevo, contenido, ahora) };
  } finally {
    llave.fill(0);
  }
}

// Guarda un contenido nuevo (la contraseña ya se revisó). La bóveda tiene que abrir con ella (409 si no).
export async function guardarBoveda(db, usuarioId, contrasena, datos, { kdf = KDF_TRASPASO, ahora = Date.now() } = {}) {
  const contenido = limpiarContenido(datos);
  const abierta = await abrirConLlave(db, usuarioId, contrasena);
  if (abierta) {
    try {
      return { contenido, en: sellar(db, usuarioId, abierta.llave, abierta.kdf, contenido, ahora) };
    } finally {
      abierta.llave.fill(0);
    }
  }
  const nuevo = kdfNuevo(kdf);
  const llave = await llaveDe(contrasena, nuevo);
  try {
    return { contenido, en: sellar(db, usuarioId, llave, nuevo, contenido, ahora) };
  } finally {
    llave.fill(0);
  }
}

// La contraseña cambió: abre con la de antes y la vuelve a cerrar con la de ahora (sal nueva). 401 si la de antes no es.
export async function cambiarContrasenaBoveda(db, usuarioId, anterior, actual, { kdf = KDF_TRASPASO, ahora = Date.now() } = {}) {
  let abierta;
  try {
    abierta = await abrirConLlave(db, usuarioId, anterior);
  } catch (error) {
    if (error instanceof ErrorHttp && error.clave === 'traspaso_otra_clave') throw new ErrorHttp(401, 'traspaso_anterior_incorrecta');
    throw error;
  }
  if (!abierta) return abrirBoveda(db, usuarioId, actual, { kdf, ahora });
  abierta.llave.fill(0);
  const nuevo = kdfNuevo(kdf);
  const llave = await llaveDe(actual, nuevo);
  try {
    return { contenido: abierta.contenido, en: sellar(db, usuarioId, llave, nuevo, abierta.contenido, ahora) };
  } finally {
    llave.fill(0);
  }
}

// «Empezar de nuevo»: el sobre viejo queda guardado con otro nombre (nunca se borra) y empieza uno vacío.
export async function empezarDeNuevo(db, usuarioId, contrasena, { kdf = KDF_TRASPASO, ahora = Date.now() } = {}) {
  const viejo = leerFila(db, claveDeBoveda(usuarioId));
  if (viejo != null) {
    const sello = new Date(ahora).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    let nombre = `${claveDeBoveda(usuarioId)}.apartada-${sello}`;
    for (let i = 2; leerFila(db, nombre) != null; i++) nombre = `${claveDeBoveda(usuarioId)}.apartada-${sello}-${i}`;
    escribirFila(db, nombre, viejo);
  }
  const nuevo = kdfNuevo(kdf);
  const llave = await llaveDe(contrasena, nuevo);
  try {
    const contenido = contenidoVacio();
    return { contenido, en: sellar(db, usuarioId, llave, nuevo, contenido, ahora) };
  } finally {
    llave.fill(0);
  }
}
