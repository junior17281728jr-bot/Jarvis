// La llave que protege las claves secretas, y el cifrado (AES-256-GCM). Es el ÚNICO archivo que cifra o descifra
// y el único que conoce el nombre del archivo de la llave (lo comprueba test/reglas.test.js).
//  - La llave vive en un archivo aparte, junto a la base (en el servidor: /var/lib/jarvis/oportia-llave-secretos),
//    con permiso 600. La base solo guarda el texto cifrado: una copia de la base sola no sirve para leer las claves.
//  - Se crea UNA vez, la primera vez que se guarda una clave (nunca al arrancar), y nunca se cambia, se reescribe ni
//    se borra. Se escribe primero con un nombre temporal y luego se «enlaza» con su nombre final (link): eso pasa
//    de una sola vez y falla si el nombre ya existe, así el nombre final solo aparece completo y nunca se pisa.
//  - Si el archivo está dañado, NO se reemplaza: las pantallas lo dicen y la consola lo explica
//    (oportia-admin.mjs --claves=revisar) o lo aparta con otro nombre (--claves=apartar-llave-danada), sin borrarlo.
//  - Ningún archivo cuyo nombre empiece con «oportia-llave» se copia nunca fuera del servidor (copias por Telegram de
//    la parte e, instalador de la parte f).
//  - Los errores nunca llevan la clave ni la llave: solo un código corto (ErrorClaves.clave).
import {
  closeSync, existsSync, fchmodSync, fsyncSync, linkSync, openSync, readFileSync, readdirSync, renameSync, statSync, writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { revisarModoPrueba } from '../nucleo/db.js';

const NOMBRE_LLAVE = 'oportia-llave-secretos';
// Para las partes e y f: ningún archivo que empiece así se copia fuera del servidor.
export const PREFIJO_ARCHIVOS_LLAVE = 'oportia-llave';
const FORMATO_V1 = /^oportia-llave-v1:([A-Za-z0-9_-]{43})\n$/;
const CABECERA = /^oportia-llave-v([1-9]\d{0,3}):/;
const TAMANO_MAXIMO = 4096;
const ALGORITMO = 'aes-256-gcm';
export const ESQUEMA_CIFRADO = 1;
export const MOTIVOS_LLAVE = Object.freeze(['llave_no_existe', 'llave_danada', 'llave_version_nueva', 'llave_sin_permiso']);

export class ErrorClaves extends Error {
  constructor(clave) {
    super(String(clave));
    this.name = 'ErrorClaves';
    this.clave = String(clave);
  }
}

export function rutaLlave(config) {
  const carpeta = config?.carpetaDatos ?? dirname(config.archivoBase);
  const ruta = join(carpeta, NOMBRE_LLAVE);
  revisarModoPrueba(ruta);
  return ruta;
}

export function huellaDe(llave) {
  return createHmac('sha256', llave).update('oportia-huella-v1').digest('hex').slice(0, 16);
}

// Lo leído, por archivo, mientras el archivo no cambie (mismo inodo, tamaño y fechas).
const leidas = new Map();
const firma = s => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;

function motivoDeError(error) {
  if (error?.code === 'ENOENT') return 'llave_no_existe';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'llave_sin_permiso';
  return 'llave_danada';
}

// Lee la llave sin crear nada. { llave, huella } o lanza ErrorClaves con su motivo.
function leerDelDisco(ruta) {
  let info;
  try { info = statSync(ruta); } catch (error) { throw new ErrorClaves(motivoDeError(error)); }
  if (!info.isFile() || info.size > TAMANO_MAXIMO) throw new ErrorClaves('llave_danada');
  const guardada = leidas.get(ruta);
  if (guardada && guardada.firma === firma(info)) return guardada.valor;
  let texto;
  try { texto = readFileSync(ruta, 'latin1'); } catch (error) { throw new ErrorClaves(motivoDeError(error)); }
  const m = texto.match(FORMATO_V1);
  if (!m) {
    const cabecera = texto.match(CABECERA);
    if (cabecera && Number(cabecera[1]) > 1) throw new ErrorClaves('llave_version_nueva');
    throw new ErrorClaves('llave_danada');
  }
  const llave = Buffer.from(m[1], 'base64url');
  if (llave.length !== 32) throw new ErrorClaves('llave_danada');
  const valor = Object.freeze({ llave, huella: huellaDe(llave) });
  leidas.set(ruta, { firma: firma(info), valor });
  return valor;
}

export function leerLlave(config) {
  return leerDelDisco(rutaLlave(config));
}

// Cómo está la llave, sin crear ni cambiar nada: { listo, motivo, huella }.
export function estadoLlave(config) {
  try {
    const { huella } = leerLlave(config);
    return { listo: true, motivo: null, huella };
  } catch (error) {
    if (error instanceof ErrorClaves) return { listo: false, motivo: error.clave, huella: null };
    throw error;
  }
}

let contador = 0;

// La llave para GUARDAR una clave: la que ya existe o, si no existe ninguna, una nueva. Nunca reemplaza un archivo que
// ya existe (aunque esté dañado: entonces lanza ErrorClaves('llave_danada')).
// prueba.trasCrearTemporal(ruta): solo para las pruebas (simula que el proceso se cae a mitad).
export function asegurarLlave(config, { prueba = null } = {}) {
  const ruta = rutaLlave(config);
  try {
    return leerDelDisco(ruta);
  } catch (error) {
    if (!(error instanceof ErrorClaves) || error.clave !== 'llave_no_existe') throw error;
  }
  const carpeta = dirname(ruta);
  contador += 1;
  const temporal = `${ruta}.nueva-${process.pid}-${Date.now()}-${contador}-${randomBytes(3).toString('hex')}`;
  const llave = randomBytes(32);
  let fd = null;
  try {
    fd = openSync(temporal, 'wx', 0o600);
    fchmodSync(fd, 0o600);
    prueba?.trasCrearTemporal?.(temporal);
    const contenido = Buffer.from(`oportia-llave-v1:${llave.toString('base64url')}\n`, 'latin1');
    let escritos = 0;
    while (escritos < contenido.length) escritos += writeSync(fd, contenido, escritos, contenido.length - escritos);
    fsyncSync(fd);
  } catch (error) {
    if (error instanceof ErrorClaves) throw error;
    if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') throw new ErrorClaves('llave_sin_permiso');
    throw error;
  } finally {
    if (fd != null) closeSync(fd);
  }
  // El temporal queda como un segundo nombre del mismo archivo (nada se borra); nunca se vuelve a leer.
  try {
    linkSync(temporal, ruta);
  } catch (error) {
    // Otro proceso creó la llave al mismo tiempo: vale la suya.
    if (error?.code === 'EEXIST') return leerDelDisco(ruta);
    if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') throw new ErrorClaves('llave_sin_permiso');
    throw error;
  }
  try {
    const dir = openSync(carpeta, 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
  } catch { /* algunos sistemas no dejan fsync de una carpeta: el archivo ya está completo */ }
  return leerDelDisco(ruta);
}

const aad = ({ ref, uso }) => Buffer.from(`oportia-secreto-v1|${ref}|${uso}`, 'utf8');

// Cifra un texto. ref (al azar, único) y uso van en la AAD: un texto cifrado copiado a otra fila u otro uso no se abre.
export function cifrar(llave, texto, { ref, uso }) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv(ALGORITMO, llave, iv);
  cifrador.setAAD(aad({ ref, uso }));
  const cifrado = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  return { iv, sello: cifrador.getAuthTag(), cifrado };
}

// Descifra; si algo no cuadra (otra llave, otra fila, un byte cambiado) lanza ErrorClaves('clave_ilegible').
export function descifrar(llave, { iv, sello, cifrado }, { ref, uso }) {
  try {
    const descifrador = createDecipheriv(ALGORITMO, llave, Buffer.from(iv));
    descifrador.setAAD(aad({ ref, uso }));
    descifrador.setAuthTag(Buffer.from(sello));
    return Buffer.concat([descifrador.update(Buffer.from(cifrado)), descifrador.final()]).toString('utf8');
  } catch {
    throw new ErrorClaves('clave_ilegible');
  }
}

const dos = n => String(n).padStart(2, '0');
function sello(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}-${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}${dos(d.getUTCSeconds())}`;
}

// Solo desde la consola: si (y solo si) la llave está DAÑADA, le cambia el nombre a
// oportia-llave-secretos.danada-AAAAMMDD-HHMMSS (no se borra nada). La próxima clave que se guarde crea una llave
// nueva; las claves viejas quedan como historia que no se puede leer. Devuelve { apartada, motivo, archivo }.
export function apartarLlaveDanada(config, { ahora = Date.now() } = {}) {
  const ruta = rutaLlave(config);
  const estado = estadoLlave(config);
  if (estado.motivo !== 'llave_danada') return { apartada: false, motivo: estado.listo ? 'llave_sana' : estado.motivo, archivo: null };
  const destino = `${ruta}.danada-${sello(ahora)}`;
  if (existsSync(destino)) return { apartada: false, motivo: 'ya_existe', archivo: null };
  renameSync(ruta, destino);
  leidas.delete(ruta);
  return { apartada: true, motivo: null, archivo: destino.slice(dirname(destino).length + 1) };
}

function nombreDeUsuario(uid) {
  try {
    const linea = readFileSync('/etc/passwd', 'utf8').split('\n').find(l => l.split(':')[2] === String(uid));
    return linea ? linea.split(':')[0] : null;
  } catch {
    return null;
  }
}

// Para la consola (--claves=revisar): cómo está el archivo de la llave, en palabras simples. No cambia nada y nunca
// muestra la llave. db (opcional): para contar las claves guardadas con esta llave.
export function diagnosticoLlave(config, { db = null } = {}) {
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  const lineas = [`Archivo de la llave: ${ruta}`];
  const estado = estadoLlave(config);
  let info = null;
  try { info = statSync(ruta); } catch { info = null; }
  if (!info) lineas.push('No existe todavía. Se crea solo la primera vez que guardes una clave en Administrador → Claves.');
  else {
    const modo = (info.mode & 0o777).toString(8).padStart(3, '0');
    lineas.push(`Existe. Permisos: ${modo}${modo === '600' ? ' (bien: solo su dueño lo lee)' : ' (debería ser 600: solo su dueño lo lee)'}.`);
    const dueno = nombreDeUsuario(info.uid);
    lineas.push(`Dueño: ${dueno ?? `usuario n.º ${info.uid}`}${process.getuid && info.uid !== process.getuid() ? ' (no es quien corre esta revisión)' : ''}.`);
  }
  const textos = {
    llave_no_existe: null,
    llave_danada: 'Está DAÑADO: no tiene el formato de una llave de OPORTIA. No se borró nada. Si nadie lo puede arreglar, --claves=apartar-llave-danada le cambia el nombre (no lo borra) y luego pegas tus claves otra vez.',
    llave_version_nueva: 'Lo escribió una versión más nueva de OPORTIA: no está dañado. Vuelve a esa versión para usarlo; no lo apartes.',
    llave_sin_permiso: 'No se puede leer por permisos. Corre esta revisión como el usuario del servicio (sudo -u jarvis …).',
  };
  if (estado.listo) lineas.push('Está bien: es una llave de OPORTIA (versión 1) y se puede leer.');
  else if (textos[estado.motivo]) lineas.push(textos[estado.motivo]);
  if (db) {
    try {
      const total = db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n;
      const conEsta = estado.huella ? db.prepare('SELECT COUNT(*) AS n FROM secretos WHERE llave_huella = ?').get(estado.huella).n : 0;
      const activasOtras = db.prepare("SELECT COUNT(*) AS n FROM secretos WHERE estado = 'activa' AND llave_huella IS NOT ?").get(estado.huella).n;
      lineas.push(`Claves guardadas: ${total}; con esta llave: ${conEsta}.`);
      if (activasOtras > 0) lineas.push(`${activasOtras} clave(s) activa(s) se guardaron con otra llave y no se pueden leer: pégalas otra vez.`);
    } catch {
      lineas.push('No se pudieron contar las claves guardadas (la base no está al día).');
    }
  }
  let nombres = [];
  try { nombres = readdirSync(carpeta); } catch { nombres = []; }
  const temporales = nombres.filter(n => n.startsWith(`${NOMBRE_LLAVE}.nueva-`)).length;
  const apartadas = nombres.filter(n => n.startsWith(`${NOMBRE_LLAVE}.danada-`));
  if (temporales) lineas.push(`Hay ${temporales} archivo(s) temporal(es) de cuando se creó la llave (${NOMBRE_LLAVE}.nueva-…): son normales, no se usan y no se borran.`);
  if (apartadas.length) lineas.push(`Llaves dañadas apartadas antes: ${apartadas.join(', ')}.`);
  lineas.push('Nunca copies fuera del servidor ningún archivo que empiece con «oportia-llave».');
  return lineas;
}
