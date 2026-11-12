// Academia: los paquetes de contenido en el disco del servidor (OPORTIA_DATOS/academia/paquetes/<id>-<huella>/).
//  - Cada paquete subido es una versión nueva en su propia carpeta: nunca se pisa ni se borra una. Subir otra vez el
//    MISMO JSON (misma huella) sigue la misma versión (por ejemplo, para terminar de subir las figuras que faltaban).
//  - Primero el JSON (se lee en memoria con su tope y se revisa ANTES de escribir nada), después cada figura por
//    separado, en su propio pedido, que se escribe por partes (sin cargarla entera en memoria) en «<archivo>.part» y
//    solo al final, revisada (tipo de imagen y huella), se renombra a su nombre: una figura terminada nunca cambia.
//  - Una versión «lista» (con todas sus figuras) se puede poner en uso. Desde la 0.7.1 puede haber VARIAS en uso a la
//    vez: cada materia sale de la última puesta en uso que la trae (ver «Varias versiones en uso», más abajo).
//  - 0.7.1: la narración en mp3 de una materia o un tema (opcional) va en «audio/», igual que las figuras. Las versiones
//    también llegan solas desde una carpeta de Google Drive (src/academia/sincronizar.js), por este mismo camino.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion, revisarModoPrueba } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { revisarPaquete, indexarPaquete, audiosDe, paginasDe, videosDe, clipsDe, LIMITES, ARCHIVO_FIGURA, ARCHIVO_AUDIO, ARCHIVO_MP4, ARCHIVO_VIDEO, MATERIAS } from './formato.js';
import { espacioLibre } from './espacio.js';
import { datosMp4 } from './mp4.js';
import { enAlmacen, enlazarDesdeAlmacen, guardarEnAlmacen, indexarVersiones } from './almacen.js';

const ahora = () => new Date().toISOString();
export const AJUSTE_ACTIVO = 'academia.paquete_activo';
export const ESTADOS_PAQUETE = Object.freeze(['incompleto', 'listo', 'fallido']);

export function carpetaAcademia(config) {
  const carpeta = config?.carpetaAcademia ?? join(dirname(config.archivoBase), 'academia');
  revisarModoPrueba(carpeta);
  return carpeta;
}
const carpetaDe = (config, fila) => join(carpetaAcademia(config), 'paquetes', fila.carpeta);

export function leerAjuste(db, clave) {
  return db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? null;
}
export function guardarAjuste(db, clave, valor) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, String(valor), ahora());
}

// El cuerpo de un pedido en memoria, con tope (para el JSON del paquete).
export function leerCuerpo(req, limite) {
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > limite) return Promise.reject(new ErrorHttp(413, 'demasiado_grande'));
  return new Promise((ok, mal) => {
    let tamano = 0;
    const partes = [];
    req.on('data', parte => {
      tamano += parte.length;
      if (tamano > limite) { mal(new ErrorHttp(413, 'demasiado_grande')); req.destroy(); return; }
      partes.push(parte);
    });
    req.on('end', () => { if (tamano <= limite) ok(Buffer.concat(partes)); });
    req.on('error', () => mal(new ErrorHttp(400, 'datos_no_validos')));
  });
}

const vista = fila => fila && ({
  id: fila.id, nombre: fila.nombre, edicion: fila.edicion, estado: fila.estado, muestra: fila.muestra === 1, bytes: fila.bytes,
  materias: fila.materias, temas: fila.temas, preguntas: fila.preguntas, figuras: fila.figuras,
  subidoEn: fila.subido_en, listoEn: fila.listo_en, activadoEn: fila.activado_en,
});

function leerJsonDe(config, fila) {
  return JSON.parse(readFileSync(join(carpetaDe(config, fila), 'paquete.json'), 'utf8'));
}

// Las figuras que el paquete nombra y todavía no están (terminadas) en su carpeta.
// Lo que una versión nombra (figuras, audios y materias), sin el resto del JSON, en «manifiesto.json» junto a él (unos
// pocos KB). Una versión nunca cambia. El TRABAJADOR solo lee este archivo (soloArchivo): nunca el JSON entero (con 12 MB
// pasaría su tope de memoria); el servidor web lo escribe al guardar una versión, y para las de antes, la primera vez.
const manifiestos = new Map();
const desdeDatos = datos => ({
  figuras: (datos.figuras ?? []).map(f => ({ archivo: f.archivo, sha256: f.sha256 ?? null })),
  audios: audiosDe(datos),
  materias: materiasDe(datos),
  paginas: paginasDe(datos), // 0.12.0
  videos: videosDe(datos), // 0.12.1
  clips: clipsDe(datos), // 0.12.1
});
export function manifiesto(config, fila, datosYaLeidos = null, { soloArchivo = false } = {}) {
  const carpeta = carpetaDe(config, fila);
  const clave = `${carpeta}|${fila.huella}`;
  if (manifiestos.has(clave)) return manifiestos.get(clave);
  let m = null;
  if (datosYaLeidos) m = desdeDatos(datosYaLeidos);
  else {
    let viejo = false;
    try {
      const leido = JSON.parse(readFileSync(join(carpeta, 'manifiesto.json'), 'utf8'));
      if (Array.isArray(leido?.figuras) && Array.isArray(leido?.audios) && Array.isArray(leido?.materias)) m = leido;
    } catch { m = null; }
    // 0.12.0: un manifiesto escrito por una versión de antes no dice «paginas». El trabajador lo usa así (sin páginas,
    // que son opcionales); el servidor web lo vuelve a armar desde el JSON y lo reescribe (la versión no cambia).
    if (m && (!Array.isArray(m.paginas) || !Array.isArray(m.videos) || !Array.isArray(m.clips))) {
      if (soloArchivo) return { ...m, paginas: m.paginas ?? [], videos: m.videos ?? [], clips: m.clips ?? [] }; // sin guardarlo en memoria: cuando el web lo reescriba, se lee el nuevo
      else { m = null; viejo = true; }
    }
    if (!m) {
      if (soloArchivo) return null;
      m = desdeDatos(leerJsonDe(config, fila));
      if (viejo) {
        try {
          const temporal = join(carpeta, `manifiesto.json.${process.pid}.tmp`);
          writeFileSync(temporal, JSON.stringify(m), { mode: 0o640 });
          renameSync(temporal, join(carpeta, 'manifiesto.json'));
        } catch { /* se arma otra vez la próxima */ }
      }
    }
  }
  if (!existsSync(join(carpeta, 'manifiesto.json'))) {
    try { writeFileSync(join(carpeta, 'manifiesto.json'), JSON.stringify(m), { flag: 'wx', mode: 0o640 }); } catch { /* se arma otra vez la próxima */ }
  }
  if (manifiestos.size >= 200) manifiestos.clear();
  manifiestos.set(clave, m);
  return m;
}
// 0.12.0: uno escrito por una versión de antes (sin «paginas») cuenta como que falta: el servidor web lo vuelve a armar.
export function tieneManifiesto(config, fila) {
  try { const m = JSON.parse(readFileSync(join(carpetaDe(config, fila), 'manifiesto.json'), 'utf8')); return Array.isArray(m?.paginas) && Array.isArray(m?.videos) && Array.isArray(m?.clips); } catch { return false; }
}

// La huella de un archivo, leyéndolo de a 1 MB (sin tenerlo entero en memoria).
export function huellaDeArchivo(ruta) {
  const hash = createHash('sha256');
  const trozo = Buffer.alloc(1024 * 1024);
  const fd = openSync(ruta, 'r');
  try {
    for (;;) {
      const n = readSync(fd, trozo, 0, trozo.length, null);
      if (!n) break;
      hash.update(trozo.subarray(0, n));
    }
  } finally { closeSync(fd); }
  return hash.digest('hex');
}

export function figurasQueFaltan(config, fila, datos = null) {
  const carpeta = join(carpetaDe(config, fila), 'figuras');
  return (datos ? datos.figuras ?? [] : manifiesto(config, fila).figuras).filter(f => !existsSync(join(carpeta, f.archivo))).map(f => f.archivo);
}

export function listarPaquetes(db, config) {
  let compuesto = null;
  try { compuesto = paqueteActivo(db, config); } catch { compuesto = null; }
  const filas = db.prepare('SELECT * FROM academia_paquetes ORDER BY id DESC LIMIT 50').all();
  return filas.map(f => {
    let faltan = [];
    let faltanAudio = [];
    let faltanPaginas = [];
    let faltanVideo = [];
    let faltanClips = [];
    const enUso = (compuesto?.materias ?? []).filter(m => m.paquete === f.id).map(m => m.id);
    // Solo se mira lo que falta en las incompletas y en las que están en uso (las demás quedan guardadas tal cual).
    if (f.estado === 'incompleto' || enUso.length) {
      try {
        if (f.estado === 'incompleto') faltan = figurasQueFaltan(config, f);
        faltanAudio = audiosQueFaltan(config, f);
        faltanPaginas = paginasQueFaltan(config, f);
        faltanVideo = videosQueFaltan(config, f);
        faltanClips = clipsQueFaltan(config, f);
      } catch { faltan = []; }
    }
    // 0.12.4: cuánto trae además de las figuras (antes la lista decía «0 figuras» de un paquete con páginas, clips y video).
    let recursos = { clips: 0, paginas: 0, videos: 0, audios: 0 };
    try {
      const m = manifiesto(config, f);
      recursos = { clips: (m.clips ?? []).length, paginas: (m.paginas ?? []).length, videos: (m.videos ?? []).filter(a => /\.mp4$/i.test(a.archivo ?? '')).length, audios: (m.audios ?? []).length };
    } catch { /* sin manifiesto: solo lo de la fila */ }
    return { ...vista(f), activo: enUso.length > 0, enUso, faltan, faltanAudio, faltanPaginas, faltanVideo, faltanClips, recursos };
  });
}

// Lee y revisa el JSON (en memoria, sin escribir nada). → { datos, revision, huella } o { error: { codigo, datos } }.
export function revisarJson(cuerpo) {
  let datos;
  try {
    const textoJson = cuerpo.toString('utf8');
    datos = JSON.parse(textoJson.charCodeAt(0) === 0xfeff ? textoJson.slice(1) : textoJson);
  } catch {
    return { error: { codigo: 422, datos: { error: 'json_no_valido', errores: [{ ruta: '', motivo: 'json_no_valido' }] } } };
  }
  const revision = revisarPaquete(datos);
  if (!revision.ok) return { error: { codigo: 422, datos: { error: 'paquete_no_valido', errores: revision.errores } } };
  return { datos, revision, huella: createHash('sha256').update(cuerpo).digest('hex') };
}

// ¿El paquete.json guardado de esa versión está entero (misma huella)? Una caída a mitad de guardarlo lo deja mal.
export function jsonEntero(config, fila) {
  try { return huellaDeArchivo(join(carpetaDe(config, fila), 'paquete.json')) === fila.huella; } catch { return false; }
}

const enSeguida = (db, trabajo) => enTransaccion(db, trabajo);

// Guarda el JSON ya revisado como versión nueva (o devuelve la que ya tiene esa huella). «escribir» hace cada escritura
// de la base: en el servidor web, una transacción aquí mismo; en el trabajador, ctx.escribir (src/academia/sincronizar.js).
// Nunca se escribe un archivo dentro de una escritura de la base.
export async function guardarJson(db, config, { cuerpo, revisado, usuarioId = null, origen = 'manual', escribir = trabajo => enSeguida(db, trabajo) }) {
  const { revision, huella } = revisado;
  const ya = db.prepare("SELECT * FROM academia_paquetes WHERE huella = ? AND estado <> 'fallido' ORDER BY id DESC LIMIT 1").get(huella);
  if (ya && jsonEntero(config, ya)) return { codigo: 200, datos: { paquete: vista(ya), repetido: true, faltan: ya.estado === 'listo' ? [] : figurasQueFaltan(config, ya), faltanAudio: audiosQueFaltan(config, ya), faltanPaginas: paginasQueFaltan(config, ya), faltanVideo: videosQueFaltan(config, ya), faltanClips: clipsQueFaltan(config, ya), avisos: revision.avisos ?? [] } };
  if (ya) await escribir(() => db.prepare("UPDATE academia_paquetes SET estado = 'fallido', detalle = 'no_se_pudo_guardar' WHERE id = ?").run(ya.id));
  const r = revision.resumen;
  const fila = await escribir(() => {
    const n = db.prepare(`INSERT INTO academia_paquetes (huella, nombre, edicion, carpeta, estado, muestra, bytes, materias, temas, preguntas, figuras, subido_por, subido_en)
      VALUES (?, ?, ?, '', 'incompleto', ?, ?, ?, ?, ?, ?, ?, ?)`).run(huella, r.nombre.slice(0, 200), r.edicion?.slice(0, 200) ?? null, r.muestra ? 1 : 0, cuerpo.length,
      r.materias, r.temas, r.preguntas, r.figuras, usuarioId, ahora());
    const id = Number(n.lastInsertRowid);
    db.prepare('UPDATE academia_paquetes SET carpeta = ? WHERE id = ?').run(`${id}-${huella.slice(0, 12)}`, id);
    auditar(db, { usuarioId, accion: origen === 'drive' ? 'academia_paquete_drive' : 'academia_paquete_subido', detalle: `${id} (${huella.slice(0, 12)})` });
    return db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(id);
  });
  try {
    const carpeta = carpetaDe(config, fila);
    mkdirSync(dirname(carpeta), { recursive: true });
    mkdirSync(carpeta); // nueva: si ya existiera, falla (nunca se escribe en la carpeta de otra versión)
    mkdirSync(join(carpeta, 'figuras'));
    mkdirSync(join(carpeta, 'audio'));
    mkdirSync(join(carpeta, 'paginas'));
    mkdirSync(join(carpeta, 'video'));
    mkdirSync(join(carpeta, 'clips'));
    writeFileSync(join(carpeta, 'paquete.json'), cuerpo, { flag: 'wx', mode: 0o640 });
  } catch {
    await escribir(() => db.prepare("UPDATE academia_paquetes SET estado = 'fallido', detalle = 'no_se_pudo_guardar' WHERE id = ?").run(fila.id));
    throw new ErrorHttp(507, 'no_se_pudo_guardar');
  }
  manifiesto(config, fila, revisado.datos); // lo que nombra, ya leído: nunca hace falta leer el JSON otra vez
  const faltan = revision.figuras.map(f => f.archivo);
  if (!faltan.length) await escribir(() => db.prepare("UPDATE academia_paquetes SET estado = 'listo', listo_en = ? WHERE id = ?").run(ahora(), fila.id));
  // 0.9.0: las opciones del Modo reto que parecen fáciles (avisos: no impiden usarlo; ver src/academia/reto-calidad.js).
  return { codigo: 201, datos: { paquete: vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id)), repetido: false, faltan, faltanAudio: revision.audios.map(a => a.archivo), faltanPaginas: (revision.paginas ?? []).map(g => g.archivo), faltanVideo: (revision.videos ?? []).map(g => g.archivo), faltanClips: (revision.clips ?? []).map(g => g.archivo), avisos: revision.avisos ?? [] } };
}

// Sube el JSON (la ruta del administrador). { codigo, datos }: 422 con la lista de errores si no está bien armado.
export async function subirJson(db, config, { cuerpo, usuarioId }) {
  const revisado = revisarJson(cuerpo);
  if (revisado.error) return revisado.error;
  return guardarJson(db, config, { cuerpo, revisado, usuarioId });
}

const TIPOS_IMAGEN = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export const tipoDeFigura = archivo => TIPOS_IMAGEN[String(archivo).split('.').pop().toLowerCase()] ?? null;
function esImagenDeTipo(cabeza, tipo) {
  if (tipo === 'image/png') return cabeza.length >= 8 && cabeza.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (tipo === 'image/jpeg') return cabeza.length >= 3 && cabeza[0] === 0xff && cabeza[1] === 0xd8 && cabeza[2] === 0xff;
  if (tipo === 'image/webp') return cabeza.length >= 12 && cabeza.toString('latin1', 0, 4) === 'RIFF' && cabeza.toString('latin1', 8, 12) === 'WEBP';
  return false;
}
// Un mp3: empieza con la etiqueta ID3 o con un cuadro de audio MPEG (11 bits en 1).
export function esMp3(cabeza) {
  if (cabeza.length >= 3 && cabeza.toString('latin1', 0, 3) === 'ID3') return true;
  return cabeza.length >= 2 && cabeza[0] === 0xff && (cabeza[1] & 0xe0) === 0xe0;
}
// 0.12.1: un mp4 (o mov/m4v): la caja «ftyp» al empezar (bytes 4 a 8).
export function esMp4(cabeza) {
  return cabeza.length >= 12 && cabeza.toString('latin1', 4, 8) === 'ftyp';
}
const TIPOS_VIDEO = { mp4: 'video/mp4', ...TIPOS_IMAGEN };
export const tipoDeVideo = archivo => TIPOS_VIDEO[String(archivo).split('.').pop().toLowerCase()] ?? null;
const esMp4DeNombre = archivo => ARCHIVO_MP4.test(String(archivo));
function primerosBytes(ruta, n = 16) {
  const fd = openSync(ruta, 'r');
  try { const b = Buffer.alloc(n); const leidos = readSync(fd, b, 0, n, 0); return b.subarray(0, leidos); } finally { closeSync(fd); }
}

// Las dos clases de archivo que acompañan al JSON: las figuras (las pide el paquete para estar «listo») y la narración en
// mp3 (0.7.1, opcional: sin ella el paquete se usa igual y el reproductor no sale).
export const RECURSOS = Object.freeze({
  figura: Object.freeze({ carpeta: 'figuras', patron: ARCHIVO_FIGURA, tope: LIMITES.figuraBytes, declarados: datos => datos.figuras ?? [], tipo: tipoDeFigura, valido: (cabeza, archivo) => esImagenDeTipo(cabeza, tipoDeFigura(archivo)), noValido: 'imagen_no_valida' }),
  audio: Object.freeze({ carpeta: 'audio', patron: ARCHIVO_AUDIO, tope: LIMITES.audioBytes, declarados: datos => audiosDe(datos), tipo: () => 'audio/mpeg', valido: cabeza => esMp3(cabeza), noValido: 'audio_no_valido' }),
  // 0.12.0: la página real del libro de una pregunta (opcional como el audio: sin ella se ve la referencia en texto).
  pagina: Object.freeze({ carpeta: 'paginas', patron: ARCHIVO_FIGURA, tope: LIMITES.paginaBytes, declarados: datos => paginasDe(datos), tipo: tipoDeFigura, valido: (cabeza, archivo) => esImagenDeTipo(cabeza, tipoDeFigura(archivo)), noValido: 'imagen_no_valida' }),
  // 0.12.1: el video resumen editado (mp4, hasta 150 MB) y su portada (una imagen, hasta 8 MB). Opcional como el audio.
  // Antes de escribir uno grande se mira el espacio libre del disco (hace falta el doble de lo que pesa).
  video: Object.freeze({ carpeta: 'video', patron: ARCHIVO_VIDEO, tope: LIMITES.videoBytes, topeDe: archivo => (esMp4DeNombre(archivo) ? LIMITES.videoBytes : LIMITES.figuraBytes), declarados: datos => videosDe(datos), tipo: tipoDeVideo, valido: (cabeza, archivo) => (esMp4DeNombre(archivo) ? esMp4(cabeza) : esImagenDeTipo(cabeza, tipoDeVideo(archivo))), noValido: 'mp4_no_valido', espacio: true }),
  // 0.12.1: el clip de una tarjeta (mp4 mudo en bucle, ≤ 8 s, ≤ 600 KB, hasta 720p) y su poster (una imagen, ≤ 1 MB).
  // Como es chico, al terminar de llegar se lee entero para mirar cuánto dura y su tamaño (revisar).
  clip: Object.freeze({ carpeta: 'clips', patron: ARCHIVO_VIDEO, tope: LIMITES.clipBytes, topeDe: archivo => (esMp4DeNombre(archivo) ? LIMITES.clipBytes : LIMITES.clipPosterBytes), declarados: datos => clipsDe(datos), tipo: tipoDeVideo, valido: (cabeza, archivo) => (esMp4DeNombre(archivo) ? esMp4(cabeza) : esImagenDeTipo(cabeza, tipoDeVideo(archivo))), noValido: 'clip_no_valido', revisar: (ruta, archivo) => (esMp4DeNombre(archivo) ? revisarClip(ruta) : null) }),
});
// 0.12.1: un clip: hasta 8 s (con medio segundo de gracia) y hasta 1280 × 720 (de pie o acostado). → motivo o null.
export function revisarClip(ruta) {
  let b;
  try { if (statSync(ruta).size > LIMITES.clipBytes) return 'clip_no_valido'; b = readFileSync(ruta); } catch { return 'clip_no_valido'; }
  const d = datosMp4(b);
  if (!d) return 'clip_no_valido';
  if (d.duracion_s > LIMITES.clipSegundos + 0.5) return 'clip_muy_largo';
  if (Math.max(d.ancho, d.alto) > 1280 || Math.min(d.ancho, d.alto) > 720) return 'clip_muy_grande';
  return null;
}
// El tope de un archivo de esa clase (el video y su portada tienen topes distintos).
export const topeDe = (clase, archivo) => (RECURSOS[clase].topeDe ? RECURSOS[clase].topeDe(archivo) : RECURSOS[clase].tope);

// 0.12.1: ¿hay lugar para escribir «bytes» en esa carpeta? Hace falta el DOBLE libre (el «.part» y lo que el disco
// necesita para seguir). bytes desconocido: el tope de su clase. Sin poder medirlo, se deja pasar (como antes).
export function revisarEspacio(carpeta, bytes, { libre = espacioLibre } = {}) {
  const hay = libre(carpeta);
  if (hay == null) return;
  if (hay < 2 * bytes) throw new ErrorHttp(507, 'sin_espacio_disco', { necesarioMb: Math.ceil((2 * bytes) / 1_048_576), libreMb: Math.floor(hay / 1_048_576) });
}
// La lista del manifiesto de cada clase.
const LISTA_DE = Object.freeze({ figura: 'figuras', audio: 'audios', pagina: 'paginas', video: 'videos', clip: 'clips' });
const NO_ESTA = Object.freeze({ figura: 'figura_no_esta_en_el_paquete', audio: 'audio_no_esta_en_el_paquete', pagina: 'pagina_no_esta_en_el_paquete', video: 'video_no_esta_en_el_paquete', clip: 'clip_no_esta_en_el_paquete' });
export const DISTINTO = Object.freeze({ figura: 'figura_distinta', audio: 'audio_distinto', pagina: 'pagina_distinta', video: 'video_distinto', clip: 'clip_distinto' });

// 0.12.1: los clips de las tarjetas (y sus posters) que el paquete nombra y todavía no están en su carpeta.
export function clipsQueFaltan(config, fila, datos = null) {
  try {
    const lista = datos ? RECURSOS.clip.declarados(datos) : manifiesto(config, fila).clips ?? [];
    const carpeta = join(carpetaDe(config, fila), 'clips');
    return lista.filter(a => !existsSync(join(carpeta, a.archivo))).map(a => a.archivo);
  } catch { return []; }
}

// 0.12.1: los archivos de «video/» (mp4 y portadas) que el paquete nombra y todavía no están en su carpeta.
export function videosQueFaltan(config, fila, datos = null) {
  try {
    const lista = datos ? RECURSOS.video.declarados(datos) : manifiesto(config, fila).videos ?? [];
    const carpeta = join(carpetaDe(config, fila), 'video');
    return lista.filter(a => !existsSync(join(carpeta, a.archivo))).map(a => a.archivo);
  } catch { return []; }
}

// 0.12.0: las páginas que el paquete nombra y todavía no están en su carpeta.
export function paginasQueFaltan(config, fila, datos = null) {
  try {
    const lista = datos ? RECURSOS.pagina.declarados(datos) : manifiesto(config, fila).paginas ?? [];
    const carpeta = join(carpetaDe(config, fila), 'paginas');
    return lista.filter(a => !existsSync(join(carpeta, a.archivo))).map(a => a.archivo);
  } catch { return []; }
}

// Los audios que el paquete nombra y todavía no están en su carpeta.
export function audiosQueFaltan(config, fila, datos = null) {
  try {
    const lista = datos ? RECURSOS.audio.declarados(datos) : manifiesto(config, fila).audios;
    const carpeta = join(carpetaDe(config, fila), 'audio');
    return lista.filter(a => !existsSync(join(carpeta, a.archivo))).map(a => a.archivo);
  } catch { return []; }
}

// Lo que el paquete dice de un archivo suyo (o null si no lo nombra).
export function declarado(config, fila, clase, archivo, datos = null) {
  const r = RECURSOS[clase];
  if (!r || typeof archivo !== 'string' || !r.patron.test(archivo)) return null;
  const lista = datos ? r.declarados(datos) : manifiesto(config, fila)[LISTA_DE[clase]] ?? [];
  return lista.find(f => f.archivo === archivo) ?? null;
}
export const rutaDeRecurso = (config, fila, clase, archivo) => join(carpetaDe(config, fila), RECURSOS[clase].carpeta, archivo);

const subiendo = new Set();
// Para que dos subidas del mismo archivo (la pantalla y Drive) nunca escriban a la vez el mismo «.part».
export function apartarRecurso(fila, clase, archivo) {
  const llave = `${fila.id}/${clase}/${archivo}`;
  if (subiendo.has(llave)) throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
  subiendo.add(llave);
  return () => subiendo.delete(llave);
}

// Revisa el «.part» ya escrito (tipo y huella) y solo entonces lo pone con su nombre: un archivo terminado nunca cambia.
// Si con eso ya están todas las figuras, la versión queda «lista».
export async function aceptarRecurso(db, config, { fila, clase, archivo, parcial, huella, bytes, usuarioId = null, escribir = trabajo => enSeguida(db, trabajo) }) {
  const r = RECURSOS[clase];
  const d = declarado(config, fila, clase, archivo);
  if (!d) throw new ErrorHttp(400, NO_ESTA[clase]);
  const destino = rutaDeRecurso(config, fila, clase, archivo);
  if (!bytes || bytes > topeDe(clase, archivo) || !r.valido(primerosBytes(parcial), archivo)) throw new ErrorHttp(422, r.noValido);
  if (d.sha256 && huella !== d.sha256) throw new ErrorHttp(422, DISTINTO[clase]);
  const motivo = r.revisar ? r.revisar(parcial, archivo) : null;
  if (motivo) throw new ErrorHttp(422, motivo);
  if (existsSync(destino)) throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
  // 0.12.1: si ese mismo contenido ya está guardado (de otra versión), el «.part» pasa a ser un enlace a ese: una sola copia.
  const academia = carpetaAcademia(config);
  if (enAlmacen(academia, huella)) {
    try { if (statSync(parcial).ino !== statSync(enAlmacen(academia, huella)).ino) enlazarDesdeAlmacen(academia, huella, parcial); } catch { /* queda su copia */ }
  }
  renameSync(parcial, destino);
  guardarEnAlmacen(academia, destino, huella);
  const faltan = figurasQueFaltan(config, fila);
  if (!faltan.length && fila.estado !== 'listo') {
    await escribir(() => {
      db.prepare("UPDATE academia_paquetes SET estado = 'listo', listo_en = ? WHERE id = ? AND estado = 'incompleto'").run(ahora(), fila.id);
      auditar(db, { usuarioId, accion: 'academia_paquete_listo', detalle: String(fila.id) });
    });
  }
  return { faltan, faltanAudio: audiosQueFaltan(config, fila), faltanPaginas: paginasQueFaltan(config, fila), faltanVideo: videosQueFaltan(config, fila), faltanClips: clipsQueFaltan(config, fila) };
}

// Sube UNA figura o UN audio del paquete (cuerpo = el archivo tal cual). Solo los que el paquete nombra y faltan.
export async function subirRecurso(db, config, { clase, paqueteId, archivo, req, usuarioId }) {
  const r = RECURSOS[clase];
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(Number(paqueteId));
  if (!fila || fila.estado === 'fallido') throw new ErrorHttp(404, 'no_existe');
  if (typeof archivo !== 'string' || !r.patron.test(archivo)) throw new ErrorHttp(400, 'archivo_no_valido');
  if (!declarado(config, fila, clase, archivo)) throw new ErrorHttp(400, NO_ESTA[clase]);
  const destino = rutaDeRecurso(config, fila, clase, archivo);
  if (existsSync(destino)) return { ya: true, faltan: figurasQueFaltan(config, fila), faltanAudio: audiosQueFaltan(config, fila), faltanPaginas: paginasQueFaltan(config, fila), faltanVideo: videosQueFaltan(config, fila), faltanClips: clipsQueFaltan(config, fila), paquete: vista(fila) };
  const tipoPedido = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (tipoPedido !== r.tipo(archivo) && tipoPedido !== 'application/octet-stream' && !(clase === 'audio' && tipoPedido === 'audio/mp3')) throw new ErrorHttp(415, 'formato_no_valido');
  const largo = Number(req.headers['content-length']);
  const tope = topeDe(clase, archivo);
  if (Number.isFinite(largo) && largo > tope) throw new ErrorHttp(413, 'demasiado_grande');
  mkdirSync(dirname(destino), { recursive: true }); // las versiones de antes no tienen la carpeta «audio», «paginas» ni «video»
  // 0.12.1: si el paquete dice su sha256 y ese contenido ya está guardado (otra versión), se enlaza sin recibir nada.
  const d = declarado(config, fila, clase, archivo);
  if (d?.sha256) {
    const academia = carpetaAcademia(config);
    if (!enAlmacen(academia, d.sha256)) indexarVersiones(academia, huellaDeArchivo);
    const ya = enAlmacen(academia, d.sha256);
    if (ya) {
      const soltarYa = apartarRecurso(fila, clase, archivo);
      try {
        const parcial = `${destino}.part`;
        if (enlazarDesdeAlmacen(academia, d.sha256, parcial)) {
          req.resume(); // lo que mande el pedido no hace falta
          const res = await aceptarRecurso(db, config, { fila, clase, archivo, parcial, huella: d.sha256, bytes: statSync(parcial).size, usuarioId });
          return { ya: false, reusado: true, ...res, paquete: vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id)) };
        }
      } finally { soltarYa(); }
    }
  }
  // 0.12.1: un video grande solo si el disco tiene el doble libre (con el largo que dice el pedido; si no, con el tope).
  if (r.espacio) revisarEspacio(dirname(destino), Number.isFinite(largo) && largo > 0 ? largo : tope, { libre: config?.espacioLibre ?? espacioLibre });
  const soltar = apartarRecurso(fila, clase, archivo);
  let resultado;
  try {
    const parcial = `${destino}.part`;
    const hash = createHash('sha256');
    let bytes = 0;
    await pipeline(req, async function* contar(fuente) {
      for await (const parte of fuente) {
        bytes += parte.length;
        if (bytes > tope) throw new ErrorHttp(413, 'demasiado_grande');
        hash.update(parte);
        yield parte;
      }
    }, createWriteStream(parcial, { flags: 'w', mode: 0o640 }));
    resultado = await aceptarRecurso(db, config, { fila, clase, archivo, parcial, huella: hash.digest('hex'), bytes, usuarioId });
  } finally {
    soltar();
  }
  return { ya: false, ...resultado, paquete: vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id)) };
}
export const subirFigura = (db, config, { paqueteId, archivo, req, usuarioId }) => subirRecurso(db, config, { clase: 'figura', paqueteId, archivo, req, usuarioId });

// ---------- Varias versiones en uso a la vez (0.7.1) ----------
// Cada materia sale de la versión que se puso en uso MÁS RECIENTEMENTE entre las que la traen (con un tema o más). Así
// un paquete de la materia 1 y después otro de la materia 2 se suman, y «Poner en uso» una versión vieja la vuelve a
// usar para SUS materias. La lista va en ajustes ('academia.en_uso': [{ id, materias }], en el orden en que se pusieron)
// y 'academia.paquete_activo' sigue diciendo la última (la 0.7.0, si se vuelve atrás, usa esa sola). Sin cambio de base.
export const AJUSTE_EN_USO = 'academia.en_uso';
const ID_MATERIA = /^[a-z_]{1,40}$/;

export function leerEnUso(db) {
  try {
    const lista = JSON.parse(leerAjuste(db, AJUSTE_EN_USO) ?? 'null');
    if (Array.isArray(lista)) {
      return lista.filter(e => Number.isSafeInteger(e?.id) && e.id > 0).slice(-30)
        .map(e => ({ id: e.id, materias: Array.isArray(e.materias) ? e.materias.filter(m => typeof m === 'string' && ID_MATERIA.test(m)) : null }));
    }
  } catch { /* se usa la de antes */ }
  const id = Number(leerAjuste(db, AJUSTE_ACTIVO)) || null;
  return id ? [{ id, materias: null }] : [];
}

// La lista nueva: la versión al final; se quitan las que ya no dan ninguna materia (todas las tapa otra más nueva).
export function listaConActivada(lista, id, materias) {
  const nueva = [...lista.filter(e => e.id !== id), { id, materias }];
  const tapadas = new Set();
  const queda = [];
  for (let i = nueva.length - 1; i >= 0; i--) {
    const e = nueva[i];
    if (e.materias == null) { queda.unshift(e); continue; }
    if (e.materias.some(m => !tapadas.has(m))) queda.unshift(e);
    for (const m of e.materias) tapadas.add(m);
  }
  return queda;
}

export const materiasDe = datos => (Array.isArray(datos?.materias) ? datos.materias.filter(m => Array.isArray(m?.temas) && m.temas.length > 0).map(m => m.id) : []);

// Pone en uso una versión «lista» (se suma a las demás). materias: las que trae (si no se dicen, se leen de su JSON).
export function activarPaquete(db, { paqueteId, usuarioId = null, config = null, materias = null }) {
  const antes = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(Number(paqueteId));
  if (!antes) throw new ErrorHttp(404, 'no_existe');
  let lista = materias;
  if (!Array.isArray(lista) && config) { try { lista = manifiesto(config, antes).materias; } catch { lista = null; } }
  return enTransaccion(db, () => {
    const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(Number(paqueteId));
    if (!fila) throw new ErrorHttp(404, 'no_existe');
    if (fila.estado !== 'listo') throw new ErrorHttp(409, 'paquete_incompleto');
    guardarAjuste(db, AJUSTE_EN_USO, JSON.stringify(listaConActivada(leerEnUso(db), fila.id, Array.isArray(lista) ? lista : null)));
    guardarAjuste(db, AJUSTE_ACTIVO, fila.id);
    db.prepare('UPDATE academia_paquetes SET activado_en = ? WHERE id = ?').run(ahora(), fila.id);
    auditar(db, { usuarioId, accion: 'academia_paquete_activado', detalle: String(fila.id) });
    return vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id));
  });
}

// El contenido en uso, ya indexado (o null): las materias de cada versión en uso, juntas, con la misma forma que tenía
// una sola versión (src/academia/progreso.js no cambia). Solo se lee el JSON de las versiones que dan alguna materia,
// de a una, y se guarda lo que se usa. Los archivos de una versión nunca cambian: se arma una sola vez.
let enMemoria = { clave: null, valor: null };
export function paqueteActivo(db, config) {
  const lista = leerEnUso(db);
  if (!lista.length) return null;
  const filas = new Map();
  for (const e of lista) {
    const f = db.prepare("SELECT id, huella, carpeta FROM academia_paquetes WHERE id = ? AND estado = 'listo'").get(e.id);
    if (f) filas.set(e.id, f);
  }
  const vivas = lista.filter(e => filas.has(e.id));
  if (!vivas.length) return null;
  const clave = `${carpetaAcademia(config)}|` + vivas.map(e => `${e.id}:${filas.get(e.id).huella}:${(e.materias ?? ['*']).join(',')}`).join('|');
  if (enMemoria.clave === clave) return enMemoria.valor;
  const valor = componer(config, vivas, filas);
  enMemoria = { clave, valor };
  return valor;
}

function componer(config, vivas, filas) {
  const deMateria = new Map(); // materia → { pid, materia indexada }
  const porPaquete = new Map(); // pid → { carpeta, figuras, libros, audios }
  const datosDe = new Map(); // pid → { nombre, edicion, muestra }
  for (let i = vivas.length - 1; i >= 0; i--) {
    const e = vivas[i];
    if (e.materias && e.materias.every(m => deMateria.has(m))) continue;
    const fila = filas.get(e.id);
    let indice;
    try { indice = indexarPaquete(leerJsonDe(config, fila)); } catch { continue; }
    let usada = false;
    for (const m of indice.materias) {
      if (!m.temas.length || deMateria.has(m.id)) continue;
      deMateria.set(m.id, { pid: e.id, m, indice });
      usada = true;
    }
    if (!usada) continue;
    porPaquete.set(e.id, { carpeta: join(carpetaAcademia(config), 'paquetes', fila.carpeta), figuras: indice.figuras, libros: indice.libros, paginas: indice.paginas ?? new Map() });
    datosDe.set(e.id, { nombre: indice.nombre, edicion: indice.edicion, muestra: indice.muestra });
  }
  if (!deMateria.size) return null;
  const preguntas = new Map();
  const deTema = new Map();
  const dePaquete = new Map();
  const figuras = new Map();
  const libros = new Map();
  const materias = MATERIAS.map(idMateria => {
    const usada = deMateria.get(idMateria);
    if (!usada) return { id: idMateria, temas: [], audio: null, video: null, paquete: null, extra: { tarjetas: [], preguntas: [] } };
    const { pid, m, indice } = usada;
    const temas = m.temas.map(t => {
      const suyas = t.preguntas.filter(qid => !preguntas.has(qid)); // un id repetido entre versiones: vale el primero
      for (const qid of suyas) {
        preguntas.set(qid, indice.preguntas.get(qid));
        deTema.set(qid, { materia: idMateria, tema: t.id });
        dePaquete.set(qid, pid);
      }
      return { ...t, preguntas: suyas, paquete: pid };
    });
    for (const [n, f] of indice.figuras) if (!figuras.has(n)) figuras.set(n, f);
    for (const [n, l] of indice.libros) if (!libros.has(n)) libros.set(n, l);
    return { id: idMateria, temas, audio: m.audio, video: m.video ?? null, paquete: pid, extra: m.extra ?? { tarjetas: [], preguntas: [] } };
  });
  // La versión «principal» (su nombre, su id en los intentos): la última puesta en uso que da alguna materia.
  const principal = [...vivas].reverse().find(e => porPaquete.has(e.id)).id;
  const ids = vivas.map(e => e.id).filter(id => porPaquete.has(id));
  const dp = datosDe.get(principal);
  return {
    id: principal, ids, nombre: dp.nombre, edicion: dp.edicion, muestra: dp.muestra,
    carpeta: porPaquete.get(principal).carpeta, materias, preguntas, deTema, dePaquete, figuras, libros, porPaquete,
  };
}

// Con varias versiones en uso, una figura se nombra «<versión>~<número>» (dos versiones pueden tener la figura «1»).
export function refFigura(paquete, qid, numero) {
  if (!paquete || numero == null) return null;
  return paquete.ids?.length > 1 ? `${paquete.dePaquete.get(qid)}~${numero}` : null;
}
export function figuraDe(paquete, qid, numero) {
  const pid = paquete?.dePaquete?.get(qid);
  return (pid != null ? paquete.porPaquete.get(pid)?.figuras.get(numero) : null) ?? paquete?.figuras.get(numero) ?? null;
}
export const librosDe = (paquete, pid) => (pid != null ? paquete?.porPaquete?.get(pid)?.libros : null) ?? paquete?.libros ?? new Map();

// La narración de una materia o un tema, si su archivo ya llegó: { ref: '<versión>~<archivo>', titulo }.
export function audioDe(paquete, pid, audio) {
  if (!paquete || !audio?.archivo || pid == null) return null;
  const p = paquete.porPaquete?.get(pid);
  if (!p) return null;
  try { if (!statSync(join(p.carpeta, 'audio', audio.archivo)).isFile()) return null; } catch { return null; }
  return { ref: `${pid}~${audio.archivo}`, titulo: audio.titulo ?? null };
}
export function rutaAudio(paquete, ref) {
  const m = /^(\d{1,12})~(.+)$/s.exec(String(ref));
  if (!m || !ARCHIVO_AUDIO.test(m[2])) return null;
  const pid = Number(m[1]);
  const p = paquete?.porPaquete?.get(pid);
  if (!p) return null;
  // Solo un audio que nombra una materia o un tema EN USO de esa versión.
  const nombrado = paquete.materias.some(x => x.paquete === pid && (x.audio?.archivo === m[2] || x.video?.audio?.archivo === m[2] || x.temas.some(t => t.audio?.archivo === m[2])));
  if (!nombrado) return null;
  const ruta = join(p.carpeta, 'audio', m[2]);
  try { const st = statSync(ruta); return st.isFile() ? { ruta, bytes: st.size, tipo: 'audio/mpeg' } : null; } catch { return null; }
}

// 0.12.1: el mp4 del video resumen de una materia en uso, si ya llegó: { ref, url, portada, duracion_s, capitulos }.
// La dirección lleva la huella (tamaño y fecha del archivo: una versión nunca cambia sus archivos), así se guarda mucho.
const huellaCorta = st => `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`;
export function mp4De(paquete, pid, mp4) {
  if (!paquete || pid == null || typeof mp4?.archivo !== 'string' || !ARCHIVO_MP4.test(mp4.archivo)) return null;
  const p = paquete.porPaquete?.get(pid);
  if (!p) return null;
  let st;
  try { st = statSync(join(p.carpeta, 'video', mp4.archivo)); if (!st.isFile() || !st.size) return null; } catch { return null; }
  const ref = `${pid}~${mp4.archivo}`;
  let portada = null;
  if (typeof mp4.portada === 'string' && ARCHIVO_FIGURA.test(mp4.portada)) {
    try {
      const sp = statSync(join(p.carpeta, 'video', mp4.portada));
      if (sp.isFile() && sp.size) portada = `/api/academia/videos/${encodeURIComponent(`${pid}~${mp4.portada}`)}?v=${huellaCorta(sp)}`;
    } catch { portada = null; }
  }
  const capitulos = Array.isArray(mp4.capitulos) ? mp4.capitulos.map(c => ({ inicio_s: c.inicio_s, titulo: c.titulo })) : [];
  return { ref, url: `/api/academia/videos/${encodeURIComponent(ref)}?v=${huellaCorta(st)}`, portada, duracion_s: mp4.duracion_s, capitulos, bytes: st.size };
}
// La ruta del mp4 (o de su portada) de una materia EN USO de esa versión (o null). etiqueta: para el ETag.
export function rutaVideo(paquete, ref) {
  const m = /^(\d{1,12})~(.+)$/s.exec(String(ref));
  if (!m || !ARCHIVO_VIDEO.test(m[2])) return null;
  const pid = Number(m[1]);
  const p = paquete?.porPaquete?.get(pid);
  if (!p) return null;
  const nombrado = paquete.materias.some(x => x.paquete === pid && (x.video?.mp4?.archivo === m[2] || x.video?.mp4?.portada === m[2]));
  if (!nombrado) return null;
  const ruta = join(p.carpeta, 'video', m[2]);
  try { const st = statSync(ruta); return st.isFile() ? { ruta, bytes: st.size, tipo: tipoDeVideo(m[2]), etiqueta: `"${pid}-${huellaCorta(st)}"` } : null; } catch { return null; }
}

// 0.12.1: el clip de una tarjeta, si ya llegó: { url, poster, alt } (con la huella en la dirección, como el video).
export function clipDe(paquete, pid, c) {
  if (!paquete || pid == null || typeof c?.archivo !== 'string' || !ARCHIVO_MP4.test(c.archivo)) return null;
  const p = paquete.porPaquete?.get(pid);
  if (!p) return null;
  const url = archivo => {
    try { const st = statSync(join(p.carpeta, 'clips', archivo)); return st.isFile() && st.size ? `/api/academia/clips/${encodeURIComponent(`${pid}~${archivo}`)}?v=${huellaCorta(st)}` : null; } catch { return null; }
  };
  const video = url(c.archivo);
  if (!video) return null;
  return { url: video, poster: typeof c.poster === 'string' && ARCHIVO_FIGURA.test(c.poster) ? url(c.poster) : null, alt: c.alt ?? '', sonido: clipConSonido(join(p.carpeta, 'clips', c.archivo)) };
}
// ¿El clip trae una pista de sonido? (lo lee una vez: un archivo de una versión nunca cambia; ≤ 600 KB).
const sonidoDeClip = new Map();
function clipConSonido(ruta) {
  if (sonidoDeClip.has(ruta)) return sonidoDeClip.get(ruta);
  let si = false;
  try { if (statSync(ruta).size <= LIMITES.clipBytes) si = datosMp4(readFileSync(ruta))?.audio === true; } catch { si = false; }
  if (sonidoDeClip.size >= 500) sonidoDeClip.clear();
  sonidoDeClip.set(ruta, si);
  return si;
}
// Los clips que nombran las tarjetas EN USO de cada versión: Set de «<versión>~<archivo>» (se arma una vez por contenido).
const clipsEnUso = new WeakMap();
export function rutaClip(paquete, ref) {
  const m = /^(\d{1,12})~(.+)$/s.exec(String(ref));
  if (!m || !ARCHIVO_VIDEO.test(m[2])) return null;
  const p = paquete?.porPaquete?.get(Number(m[1]));
  if (!p) return null;
  if (!clipsEnUso.has(paquete)) {
    const nombres = new Set();
    for (const x of paquete.materias) {
      if (x.paquete == null) continue;
      const listas = [...x.temas.flatMap(t => [t.secciones, t.reexplicacion]), x.extra?.tarjetas];
      for (const c of clipsDe({ materias: [{ temas: listas.map(l => ({ secciones: l })) }] })) nombres.add(`${x.paquete}~${c.archivo}`);
    }
    clipsEnUso.set(paquete, nombres);
  }
  if (!clipsEnUso.get(paquete).has(`${m[1]}~${m[2]}`)) return null;
  const ruta = join(p.carpeta, 'clips', m[2]);
  try { const st = statSync(ruta); return st.isFile() ? { ruta, bytes: st.size, tipo: tipoDeVideo(m[2]), etiqueta: `"${m[1]}-${huellaCorta(st)}"` } : null; } catch { return null; }
}

// La ruta de una figura del paquete en uso (o null).
export function rutaFigura(paquete, numero) {
  const m = /^(\d{1,12})~(.+)$/s.exec(String(numero));
  const p = m ? paquete?.porPaquete?.get(Number(m[1])) : null;
  const f = p ? p.figuras.get(m[2]) : paquete?.figuras.get(String(numero));
  if (!f) return null;
  const ruta = join(p ? p.carpeta : paquete.carpeta, 'figuras', f.archivo);
  try { return statSync(ruta).isFile() ? { ruta, tipo: tipoDeFigura(f.archivo), bytes: statSync(ruta).size } : null; } catch { return null; }
}

// 0.12.0: la página real del libro de una pregunta en uso: { archivo, libro, pagina } (o null). «existe» dice si su imagen
// ya llegó a la carpeta de su versión.
export function paginaDe(paquete, qid) {
  const q = paquete?.preguntas?.get(qid);
  const nombre = q?.original?.pagina_imagen;
  if (typeof nombre !== 'string') return null;
  const pid = paquete.dePaquete?.get(qid);
  const p = pid != null ? paquete.porPaquete?.get(pid) : null;
  const g = p?.paginas?.get(nombre.toLowerCase());
  if (!g || !ARCHIVO_FIGURA.test(g.archivo)) return null;
  const ruta = join(p.carpeta, 'paginas', g.archivo);
  let bytes = 0;
  try { const st = statSync(ruta); bytes = st.isFile() ? st.size : 0; } catch { bytes = 0; }
  return { archivo: g.archivo, libro: g.libro, pagina: g.pagina, libroTitulo: p.libros?.get(g.libro)?.titulo ?? g.libro, existe: bytes > 0, ruta, bytes, tipo: tipoDeFigura(g.archivo) };
}
