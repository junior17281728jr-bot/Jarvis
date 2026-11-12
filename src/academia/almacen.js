// Academia (0.12.1): un archivo del paquete (figura, mp3, mp4, clip, página) se guarda UNA vez aunque lo nombren muchas
// versiones. El disco del servidor es chico: cada versión nueva del JSON es una carpeta nueva, y sin esto el mismo video
// de 90 MB se bajaba y se guardaba otra vez en cada una.
//  - academia/almacen/<sha256>: un enlace duro (hard link) a cada archivo ya aceptado, por su huella. Las carpetas de las
//    versiones siguen teniendo su archivo con su nombre (otro enlace duro al mismo contenido): cada versión se sirve igual
//    que antes, y nada se borra nunca (un enlace más no cuesta espacio).
//  - Antes de bajar o guardar uno: si su huella ya está (la que dice el paquete, o la que tuvo ese mismo archivo de Drive
//    —su id y su fecha— la vez anterior), se enlaza y no se baja. Si llega igual (sin huella conocida), al aceptarlo se
//    cambia por un enlace al que ya estaba: el disco guarda una sola copia.
//  - Los archivos de las versiones de antes (anteriores a esto) se indexan una vez (se lee su huella por partes) y quedan
//    en el almacén.
// Si el disco no deja enlaces duros, todo sigue como antes (una copia por versión).
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
// Las carpetas de archivos de cada versión (las de RECURSOS en src/academia/paquetes.js).
export const CARPETAS_DE_ARCHIVOS = Object.freeze(['figuras', 'audio', 'paginas', 'video', 'clips']);
const MAX_DRIVE = 5000;

export const carpetaAlmacen = academia => join(academia, 'almacen');
const ruta = (academia, huella) => join(carpetaAlmacen(academia), huella);
let secuencia = 0;
const temporal = academia => join(carpetaAlmacen(academia), `.enlace.${process.pid}.${Date.now()}.${secuencia++}.tmp`);

// La ruta del archivo con esa huella en el almacén (o null).
export function enAlmacen(academia, huella) {
  if (typeof huella !== 'string' || !SHA256.test(huella)) return null;
  try { return statSync(ruta(academia, huella)).isFile() ? ruta(academia, huella) : null; } catch { return null; }
}

// Deja en «destino» un enlace duro al archivo del almacén (con rename: nunca queda a medias). → true si se pudo.
export function enlazarDesdeAlmacen(academia, huella, destino) {
  const origen = enAlmacen(academia, huella);
  if (!origen) return false;
  try {
    const tmp = temporal(academia);
    linkSync(origen, tmp);
    renameSync(tmp, destino);
    return true;
  } catch { return false; }
}

// Anota en el almacén un archivo ya aceptado (si su huella no estaba). Nunca lanza.
export function guardarEnAlmacen(academia, archivo, huella) {
  if (typeof huella !== 'string' || !SHA256.test(huella) || enAlmacen(academia, huella)) return;
  try {
    mkdirSync(carpetaAlmacen(academia), { recursive: true });
    const tmp = temporal(academia);
    linkSync(archivo, tmp);
    renameSync(tmp, ruta(academia, huella));
  } catch { /* sin enlaces duros: queda la copia de la versión */ }
}

// Lo que se bajó de Drive: «<id>|<fecha de la lista>» → huella. Así, sin sha256 en el paquete, el mismo archivo de Drive no
// se baja otra vez para una versión nueva.
const archivoDrive = academia => join(carpetaAlmacen(academia), 'drive.json');
export function leerDrive(academia) {
  try { const o = JSON.parse(readFileSync(archivoDrive(academia), 'utf8')); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
export const claveDrive = (id, modificado) => (id && modificado ? `${id}|${modificado}` : null);
export function anotarDrive(academia, clave, huella) {
  if (!clave || !SHA256.test(String(huella))) return;
  try {
    mkdirSync(carpetaAlmacen(academia), { recursive: true });
    const todo = leerDrive(academia);
    todo[clave] = huella;
    const claves = Object.keys(todo);
    for (const k of claves.slice(0, Math.max(0, claves.length - MAX_DRIVE))) delete todo[k];
    const tmp = temporal(academia);
    writeFileSync(tmp, JSON.stringify(todo), { mode: 0o640 });
    renameSync(tmp, archivoDrive(academia));
  } catch { /* la próxima vez se baja */ }
}

// Indexa (una vez por archivo) los archivos de las versiones que todavía no están en el almacén: su huella se lee por
// partes (huella(ruta), de src/academia/paquetes.js). Se recuerda qué ya se miró («<ruta>|<tamaño>|<fecha>»).
const archivoVistos = academia => join(carpetaAlmacen(academia), 'vistos.json');
export function indexarVersiones(academia, huella) {
  let vistos = {};
  try { vistos = JSON.parse(readFileSync(archivoVistos(academia), 'utf8')) ?? {}; } catch { vistos = {}; }
  let nuevos = 0;
  let carpetas = [];
  try { carpetas = readdirSync(join(academia, 'paquetes')); } catch { return 0; }
  for (const version of carpetas) {
    for (const clase of CARPETAS_DE_ARCHIVOS) {
      let nombres = [];
      try { nombres = readdirSync(join(academia, 'paquetes', version, clase)); } catch { continue; }
      for (const nombre of nombres) {
        if (nombre.endsWith('.part') || nombre.endsWith('.tmp')) continue;
        const archivo = join(academia, 'paquetes', version, clase, nombre);
        let st;
        try { st = statSync(archivo); if (!st.isFile() || !st.size || st.nlink > 1) continue; } catch { continue; } // nlink > 1: ya enlazado
        const clave = `${version}/${clase}/${nombre}|${st.size}|${Math.floor(st.mtimeMs)}`;
        if (vistos[clave]) continue;
        try { const h = huella(archivo); guardarEnAlmacen(academia, archivo, h); vistos[clave] = h; nuevos += 1; } catch { /* la próxima vez */ }
      }
    }
  }
  if (nuevos) {
    try {
      mkdirSync(carpetaAlmacen(academia), { recursive: true });
      const tmp = temporal(academia);
      writeFileSync(tmp, JSON.stringify(vistos), { mode: 0o640 });
      renameSync(tmp, archivoVistos(academia));
    } catch { /* se vuelven a mirar */ }
  }
  return nuevos;
}
export const hayAlmacen = academia => existsSync(carpetaAlmacen(academia));
