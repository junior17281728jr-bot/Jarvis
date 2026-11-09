// La llave que protege las claves secretas, y el cifrado (AES-256-GCM). Es el ÚNICO archivo que cifra o descifra
// y el único que conoce el nombre del archivo de la llave (lo comprueba test/reglas.test.js).
//  - La llave vive en un archivo aparte, junto a la base (en el servidor: /var/lib/jarvis/oportia-llave-secretos),
//    con permiso 600. La base solo guarda el texto cifrado: una copia de la base sola no sirve para leer las claves.
//  - Se crea UNA vez, la primera vez que se guarda una clave (nunca al arrancar), y nunca se cambia, se reescribe ni
//    se borra. Se escribe primero con un nombre temporal (oportia-llave-secretos.nueva-…) y luego se «enlaza» con su
//    nombre final (link): eso pasa de una sola vez y falla si el nombre ya existe, así el nombre final solo aparece
//    completo y nunca se pisa. Como nada se borra, el nombre temporal QUEDA: es un segundo nombre del MISMO archivo,
//    es decir, ES la llave (no un sobrante). Por eso la regla de las copias es por el comienzo del nombre, nunca por
//    el nombre exacto (esArchivoDeLlave).
//  - Si el archivo está dañado, NO se reemplaza: las pantallas lo dicen y la consola lo explica
//    (oportia-admin.mjs --claves=revisar) o lo aparta con otro nombre (--claves=apartar-llave-danada), sin borrarlo.
//  - Ningún archivo cuyo nombre empiece con «oportia-llave» se copia nunca fuera del servidor (copias por Telegram de
//    la parte e, instalador de la parte f): esArchivoDeLlave(nombre) es la ÚNICA pregunta que deben hacer.
//  - Si el nombre final falta pero queda otro nombre con una llave completa (.nueva-…) con la que se guardaron las
//    claves, la consola la puede recuperar (--claves=recuperar-llave): le pone otra vez el nombre final (link, nunca
//    pisa nada).
//  - Ronda 2 de revisión: si falta el nombre final y YA hay claves guardadas, nunca se crea una llave nueva en
//    silencio (eso cerraría para siempre la recuperación): guardar responde 503 ('llave_falta') hasta que la consola
//    la recupere (--claves=recuperar-llave) o el dueño decida empezar de nuevo (--claves=empezar-de-nuevo, o el
//    --claves=apartar-llave-danada de antes, que ya decidió eso). permisoLlaveNueva lo dice.
//  - En la memoria del proceso solo queda la HUELLA de la llave (para estadoLlave), nunca la llave: quien la necesita
//    para cifrar o descifrar la lee del disco en ese momento y la borra de la memoria al terminar (src/claves/almacen.js).
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
const PREFIJO_TEMPORAL = `${NOMBRE_LLAVE}.nueva-`;

// ¿Este nombre de archivo (sin carpeta) es la llave o uno de sus otros nombres? Las copias de seguridad (parte e) y el
// instalador (parte f) se lo preguntan a CADA archivo antes de copiarlo: si dice que sí, no se copia nunca. Incluye
// oportia-llave-secretos, sus nombres .nueva-… (la misma llave) y .danada-… (llaves apartadas).
export function esArchivoDeLlave(nombre) {
  const solo = String(nombre ?? '').split(/[\\/]/).pop();
  return solo.toLowerCase().startsWith(PREFIJO_ARCHIVOS_LLAVE);
}
const FORMATO_V1 = /^oportia-llave-v1:([A-Za-z0-9_-]{43})\n$/;
const CABECERA = /^oportia-llave-v([1-9]\d{0,3}):/;
const TAMANO_MAXIMO = 4096;
const ALGORITMO = 'aes-256-gcm';
export const ESQUEMA_CIFRADO = 1;
export const MOTIVOS_LLAVE = Object.freeze(['llave_no_existe', 'llave_danada', 'llave_version_nueva', 'llave_sin_permiso']);
// Lo que dice el almacén (además de MOTIVOS_LLAVE) cuando falta el archivo de la llave pero ya hay claves guardadas.
export const LLAVE_FALTA = 'llave_falta';

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

// La HUELLA leída, por archivo, mientras el archivo no cambie (mismo inodo, tamaño y fechas). Ronda 2 de revisión:
// nunca la llave (un volcado de memoria del proceso no la tendría guardada todo el día).
const huellasLeidas = new Map();
const firma = s => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;

function motivoDeError(error) {
  if (error?.code === 'ENOENT') return 'llave_no_existe';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'llave_sin_permiso';
  return 'llave_danada';
}

// Lee la llave sin crear nada. { llave, huella } (o solo { huella } si conLlave es false y ya se conoce) o lanza
// ErrorClaves con su motivo. Cada llamada con conLlave devuelve una copia nueva (quien la usa la puede borrar).
function leerDelDisco(ruta, { conLlave = true } = {}) {
  let info;
  try { info = statSync(ruta); } catch (error) { throw new ErrorClaves(motivoDeError(error)); }
  if (!info.isFile() || info.size > TAMANO_MAXIMO) throw new ErrorClaves('llave_danada');
  const guardada = huellasLeidas.get(ruta);
  if (!conLlave && guardada && guardada.firma === firma(info)) return { huella: guardada.huella };
  let texto;
  try { texto = readFileSync(ruta, 'latin1'); } catch (error) { throw new ErrorClaves(motivoDeError(error)); }
  const m = texto.match(FORMATO_V1);
  if (!m) {
    const cabecera = texto.match(CABECERA);
    if (cabecera && Number(cabecera[1]) > 1) throw new ErrorClaves('llave_version_nueva');
    throw new ErrorClaves('llave_danada');
  }
  const llave = Buffer.from(m[1], 'base64url');
  if (llave.length !== 32) { llave.fill(0); throw new ErrorClaves('llave_danada'); }
  const huella = huellaDe(llave);
  huellasLeidas.set(ruta, { firma: firma(info), huella });
  if (!conLlave) { llave.fill(0); return { huella }; }
  return { llave, huella };
}

export function leerLlave(config) {
  return leerDelDisco(rutaLlave(config));
}

// Cómo está la llave, sin crear ni cambiar nada: { listo, motivo, huella }.
export function estadoLlave(config) {
  try {
    const { huella } = leerDelDisco(rutaLlave(config), { conLlave: false });
    return { listo: true, motivo: null, huella };
  } catch (error) {
    if (error instanceof ErrorClaves) return { listo: false, motivo: error.clave, huella: null };
    throw error;
  }
}

let contador = 0;

// Los momentos (ms) en que la consola apartó una llave dañada (nombres .danada-AAAAMMDD-HHMMSS), del más nuevo al
// más viejo.
function apartadasMs(config) {
  const carpeta = dirname(rutaLlave(config));
  let nombres = [];
  try { nombres = readdirSync(carpeta); } catch { nombres = []; }
  const lista = [];
  for (const n of nombres) {
    const m = /^oportia-llave-secretos\.danada-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(n);
    if (!m) continue;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    if (Number.isFinite(ms)) lista.push(ms);
  }
  return lista.sort((a, b) => b - a);
}

// La marca que deja ajustarTrasRestaurar (src/copias/restaurar.js) en una base recuperada: { en, huellas } o null.
export const CLAVE_RESTAURADA = 'claves.restaurada';
export function marcaDeRestaurada(db) {
  try {
    const v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_RESTAURADA)?.valor ?? 'null');
    return v && Array.isArray(v.huellas) ? { en: typeof v.en === 'string' ? v.en : null, huellas: v.huellas.filter(h => typeof h === 'string') } : null;
  } catch {
    return null;
  }
}

// ¿Se puede crear una llave NUEVA (porque falta el archivo)? Ronda 2 de revisión: solo si todavía no hay ninguna clave
// guardada, o si todas las guardadas son de antes de la última llave dañada que la consola apartó (eso ya fue decidir
// empezar de nuevo). Si no, crearla en silencio dejaría sin poder leer, para siempre, las claves guardadas con la
// llave que falta (y cerraría --claves=recuperar-llave). guardadas: { huellas, ultimaMs } de la tabla secretos (las
// huellas de sus claves y cuándo se guardó la más nueva). { si, motivo, recuperable }: recuperable si queda otro
// nombre (.nueva-…) con la llave de alguna clave guardada.
//  Revisión final de la parte e: una base RECUPERADA de una copia (ajustarTrasRestaurar la marca: «restaurada», con las
//  huellas de las claves que traía) nunca trae el archivo de la llave (a propósito: no viaja en las copias). Si TODAS
//  las claves guardadas son de las que traía la copia y no queda ningún otro nombre con su llave, no hay nada que
//  recuperar: se puede crear una llave nueva y el dueño pega otra vez sus claves en la pantalla (motivo 'restaurada').
//  Una clave guardada DESPUÉS de restaurar (con otra llave) vuelve a cerrar esa puerta, como siempre.
export function permisoLlaveNueva(config, { huellas: guardadas = [], ultimaMs = null, restaurada = null } = {}) {
  const lista = (Array.isArray(guardadas) ? guardadas : []).filter(h => typeof h === 'string' && h);
  if (!lista.length) return { si: true, motivo: null, recuperable: false };
  const completas = otrosNombres(config).filter(o => o.tipo === 'completa');
  if (lista.some(h => completas.some(o => o.huella === h))) return { si: false, motivo: LLAVE_FALTA, recuperable: true };
  const traidas = Array.isArray(restaurada?.huellas) ? restaurada.huellas.filter(h => typeof h === 'string' && h) : null;
  if (traidas && lista.every(h => traidas.includes(h))) return { si: true, motivo: 'restaurada', recuperable: false };
  const apartada = apartadasMs(config)[0];
  // El nombre guarda solo los segundos: una clave guardada en ese mismo segundo cuenta como de antes.
  if (apartada != null && Number.isFinite(ultimaMs) && apartada + 999 >= ultimaMs) return { si: true, motivo: null, recuperable: false };
  return { si: false, motivo: LLAVE_FALTA, recuperable: false };
}

// La llave para GUARDAR una clave: la que ya existe o, si no existe ninguna, una nueva. Nunca reemplaza un archivo que
// ya existe (aunque esté dañado: entonces lanza ErrorClaves('llave_danada')).
// guardadas: { huellas, ultimaMs } de las claves que ya están en la base (permisoLlaveNueva): si falta el archivo y
// no se puede crear otra, lanza ErrorClaves('llave_falta'). empezarDeNuevo: solo la consola (--claves=empezar-de-nuevo).
// prueba.trasCrearTemporal(ruta): solo para las pruebas (simula que el proceso se cae a mitad).
export function asegurarLlave(config, { prueba = null, guardadas = null, empezarDeNuevo = false } = {}) {
  const ruta = rutaLlave(config);
  try {
    return leerDelDisco(ruta);
  } catch (error) {
    if (!(error instanceof ErrorClaves) || error.clave !== 'llave_no_existe') throw error;
  }
  if (!empezarDeNuevo && !permisoLlaveNueva(config, guardadas ?? {}).si) throw new ErrorClaves(LLAVE_FALTA);
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
  huellasLeidas.delete(ruta);
  return { apartada: true, motivo: null, archivo: destino.slice(dirname(destino).length + 1) };
}

// Los otros nombres de la llave en la carpeta de datos (.nueva-…), cada uno con lo que es:
//  - 'mismo': otro nombre del MISMO archivo que la llave (mismo inodo): es la llave.
//  - 'completa': una llave completa de OPORTIA (otro archivo), con su huella.
//  - 'a_medias': un intento de crearla que quedó a medias (vacío o incompleto): no sirve.
function otrosNombres(config) {
  const ruta = rutaLlave(config);
  const carpeta = dirname(ruta);
  let principal = null;
  try { principal = statSync(ruta); } catch { principal = null; }
  let nombres = [];
  try { nombres = readdirSync(carpeta).filter(n => n.startsWith(PREFIJO_TEMPORAL)).sort(); } catch { nombres = []; }
  return nombres.map(nombre => {
    const completa = join(carpeta, nombre);
    let info = null;
    try { info = statSync(completa); } catch { info = null; }
    if (principal && info && info.dev === principal.dev && info.ino === principal.ino) return { nombre, ruta: completa, tipo: 'mismo', huella: null };
    try {
      return { nombre, ruta: completa, tipo: 'completa', huella: leerDelDisco(completa, { conLlave: false }).huella };
    } catch {
      return { nombre, ruta: completa, tipo: 'a_medias', huella: null };
    }
  });
}

// Solo desde la consola (--claves=recuperar-llave): si el nombre final de la llave NO existe, y queda otro nombre
// (.nueva-…) con una llave completa cuya huella es la de las claves guardadas (huellas: las de la base, de la más
// usada a la menos), le vuelve a poner el nombre final (link: nunca pisa nada, nunca borra). { recuperada, motivo,
// archivo, huella }.
export function recuperarLlave(config, { huellas = [] } = {}) {
  const ruta = rutaLlave(config);
  const estado = estadoLlave(config);
  if (estado.motivo !== 'llave_no_existe') return { recuperada: false, motivo: estado.listo ? 'llave_sana' : estado.motivo, archivo: null, huella: null };
  const completas = otrosNombres(config).filter(o => o.tipo === 'completa');
  const elegida = huellas.map(h => completas.find(o => o.huella === h)).find(Boolean);
  if (!elegida) return { recuperada: false, motivo: 'sin_llave_que_sirva', archivo: null, huella: null };
  try {
    linkSync(elegida.ruta, ruta);
  } catch (error) {
    if (error?.code === 'EEXIST') return { recuperada: false, motivo: 'ya_existe', archivo: null, huella: null };
    throw error;
  }
  huellasLeidas.delete(ruta);
  return { recuperada: true, motivo: null, archivo: elegida.nombre, huella: elegida.huella };
}

// Solo desde la consola (--claves=empezar-de-nuevo): si falta el archivo de la llave y NO queda ningún otro nombre con
// la llave de las claves guardadas, crea una llave nueva (la decisión de empezar de nuevo es del dueño, nunca de una
// pantalla). Las claves viejas quedan guardadas como historia que no se puede leer; nada se borra.
// guardadas: { huellas, ultimaMs } (como permisoLlaveNueva). { creada, motivo, huella }.
export function empezarLlaveNueva(config, guardadas = {}) {
  const estado = estadoLlave(config);
  if (estado.motivo !== 'llave_no_existe') return { creada: false, motivo: estado.listo ? 'llave_sana' : estado.motivo, huella: null };
  if (permisoLlaveNueva(config, guardadas).recuperable) return { creada: false, motivo: 'recuperable', huella: null };
  const { llave, huella } = asegurarLlave(config, { empezarDeNuevo: true });
  llave?.fill(0);
  return { creada: true, motivo: null, huella };
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
  // Ronda 2 de revisión: si ya hay claves guardadas, que falte el archivo NO es «todavía no existe».
  let guardadas = { huellas: [], ultimaMs: null };
  if (db) {
    try {
      const f = db.prepare('SELECT COUNT(*) AS n, MAX(creado_en) AS ultima FROM secretos').get();
      guardadas = { huellas: db.prepare('SELECT DISTINCT llave_huella AS h FROM secretos').all().map(x => x.h), ultimaMs: f.ultima ? Date.parse(f.ultima) : null };
      guardadas.restaurada = marcaDeRestaurada(db);
    } catch { /* la base no está al día: se dice abajo */ }
  }
  const permiso = !info && estado.motivo === 'llave_no_existe' ? permisoLlaveNueva(config, guardadas) : null;
  if (!info && guardadas.huellas.length === 0) lineas.push('No existe todavía. Se crea solo la primera vez que guardes una clave en Administrador → Claves.');
  else if (!info && permiso?.motivo === 'restaurada') lineas.push('No existe: esta base se recuperó de una copia (la llave nunca viaja en las copias). La próxima clave que pegues en Administrador → Claves crea una nueva; pega otra vez tus claves (las de antes quedan guardadas, sin poder leerse).');
  else if (!info && permiso?.si) lineas.push('No existe: la llave dañada se apartó y la próxima clave que pegues en Administrador → Claves crea una nueva (las claves de antes quedan guardadas, sin poder leerse).');
  else if (!info) {
    lineas.push('FALTA el archivo de la llave, y ya hay claves guardadas con ella. No se borró nada. Mientras falte, OPORTIA no deja pegar claves: así nunca se crea otra llave encima de la que falta.');
    if (permiso && !permiso.recuperable) lineas.push('Si nadie puede devolver el archivo a su lugar, --claves=empezar-de-nuevo crea una llave nueva (las claves de antes quedan guardadas, sin poder leerse) y luego pegas tus claves otra vez.');
  }
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
  const apartadas = nombres.filter(n => n.startsWith(`${NOMBRE_LLAVE}.danada-`));
  // Los otros nombres (.nueva-…): uno con el mismo inodo ES la llave; uno con una llave completa puede servir para
  // recuperarla si falta el nombre final.
  let huellasGuardadas = new Set();
  if (db) {
    try { huellasGuardadas = new Set(db.prepare('SELECT DISTINCT llave_huella AS h FROM secretos').all().map(f => f.h)); } catch { huellasGuardadas = new Set(); }
  }
  for (const o of otrosNombres(config)) {
    if (o.tipo === 'mismo') lineas.push(`${o.nombre}: es OTRO NOMBRE del mismo archivo de la llave (es la llave, no un sobrante). Es normal, no se borra y nunca se copia.`);
    else if (o.tipo === 'completa') {
      const sirve = huellasGuardadas.has(o.huella);
      lineas.push(`${o.nombre}: es una llave completa de OPORTIA${sirve ? ', la misma con la que se guardaron tus claves' : ''}. No se borra y nunca se copia.`);
      if (sirve && estado.motivo === 'llave_no_existe') lineas.push('Falta el archivo de la llave, pero esta sirve: --claves=recuperar-llave le vuelve a poner su nombre (no borra ni pisa nada).');
      if (sirve && estado.motivo === 'llave_danada') lineas.push('El archivo de la llave está dañado, pero esta sirve: primero --claves=apartar-llave-danada y luego --claves=recuperar-llave (no se borra nada).');
    } else lineas.push(`${o.nombre}: un intento de crear la llave que quedó a medias (vacío o incompleto). No sirve, no se usa y no se borra.`);
  }
  if (apartadas.length) lineas.push(`Llaves dañadas apartadas antes: ${apartadas.join(', ')}.`);
  lineas.push('Nunca copies fuera del servidor ningún archivo que empiece con «oportia-llave» (tampoco los .nueva-… ni los .danada-…).');
  return lineas;
}
