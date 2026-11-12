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
import { revisarPaquete, indexarPaquete, audiosDe, paginasDe, LIMITES, ARCHIVO_FIGURA, ARCHIVO_AUDIO, MATERIAS } from './formato.js';

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
    if (m && !Array.isArray(m.paginas)) {
      if (soloArchivo) return { ...m, paginas: [] }; // sin guardarlo en memoria: cuando el web lo reescriba, se lee el nuevo
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
  try { return Array.isArray(JSON.parse(readFileSync(join(carpetaDe(config, fila), 'manifiesto.json'), 'utf8'))?.paginas); } catch { return false; }
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
    const enUso = (compuesto?.materias ?? []).filter(m => m.paquete === f.id).map(m => m.id);
    // Solo se mira lo que falta en las incompletas y en las que están en uso (las demás quedan guardadas tal cual).
    if (f.estado === 'incompleto' || enUso.length) {
      try {
        if (f.estado === 'incompleto') faltan = figurasQueFaltan(config, f);
        faltanAudio = audiosQueFaltan(config, f);
        faltanPaginas = paginasQueFaltan(config, f);
      } catch { faltan = []; }
    }
    return { ...vista(f), activo: enUso.length > 0, enUso, faltan, faltanAudio, faltanPaginas };
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
  if (ya && jsonEntero(config, ya)) return { codigo: 200, datos: { paquete: vista(ya), repetido: true, faltan: ya.estado === 'listo' ? [] : figurasQueFaltan(config, ya), faltanAudio: audiosQueFaltan(config, ya), faltanPaginas: paginasQueFaltan(config, ya), avisos: revision.avisos ?? [] } };
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
    writeFileSync(join(carpeta, 'paquete.json'), cuerpo, { flag: 'wx', mode: 0o640 });
  } catch {
    await escribir(() => db.prepare("UPDATE academia_paquetes SET estado = 'fallido', detalle = 'no_se_pudo_guardar' WHERE id = ?").run(fila.id));
    throw new ErrorHttp(507, 'no_se_pudo_guardar');
  }
  manifiesto(config, fila, revisado.datos); // lo que nombra, ya leído: nunca hace falta leer el JSON otra vez
  const faltan = revision.figuras.map(f => f.archivo);
  if (!faltan.length) await escribir(() => db.prepare("UPDATE academia_paquetes SET estado = 'listo', listo_en = ? WHERE id = ?").run(ahora(), fila.id));
  // 0.9.0: las opciones del Modo reto que parecen fáciles (avisos: no impiden usarlo; ver src/academia/reto-calidad.js).
  return { codigo: 201, datos: { paquete: vista(db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(fila.id)), repetido: false, faltan, faltanAudio: revision.audios.map(a => a.archivo), faltanPaginas: (revision.paginas ?? []).map(g => g.archivo), avisos: revision.avisos ?? [] } };
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
});
// La lista del manifiesto de cada clase.
const LISTA_DE = Object.freeze({ figura: 'figuras', audio: 'audios', pagina: 'paginas' });
const NO_ESTA = Object.freeze({ figura: 'figura_no_esta_en_el_paquete', audio: 'audio_no_esta_en_el_paquete', pagina: 'pagina_no_esta_en_el_paquete' });
const DISTINTO = Object.freeze({ figura: 'figura_distinta', audio: 'audio_distinto', pagina: 'pagina_distinta' });

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
  if (!bytes || bytes > r.tope || !r.valido(primerosBytes(parcial), archivo)) throw new ErrorHttp(422, r.noValido);
  if (d.sha256 && huella !== d.sha256) throw new ErrorHttp(422, DISTINTO[clase]);
  if (existsSync(destino)) throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
  renameSync(parcial, destino);
  const faltan = figurasQueFaltan(config, fila);
  if (!faltan.length && fila.estado !== 'listo') {
    await escribir(() => {
      db.prepare("UPDATE academia_paquetes SET estado = 'listo', listo_en = ? WHERE id = ? AND estado = 'incompleto'").run(ahora(), fila.id);
      auditar(db, { usuarioId, accion: 'academia_paquete_listo', detalle: String(fila.id) });
    });
  }
  return { faltan, faltanAudio: audiosQueFaltan(config, fila), faltanPaginas: paginasQueFaltan(config, fila) };
}

// Sube UNA figura o UN audio del paquete (cuerpo = el archivo tal cual). Solo los que el paquete nombra y faltan.
export async function subirRecurso(db, config, { clase, paqueteId, archivo, req, usuarioId }) {
  const r = RECURSOS[clase];
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(Number(paqueteId));
  if (!fila || fila.estado === 'fallido') throw new ErrorHttp(404, 'no_existe');
  if (typeof archivo !== 'string' || !r.patron.test(archivo)) throw new ErrorHttp(400, 'archivo_no_valido');
  if (!declarado(config, fila, clase, archivo)) throw new ErrorHttp(400, NO_ESTA[clase]);
  const destino = rutaDeRecurso(config, fila, clase, archivo);
  if (existsSync(destino)) return { ya: true, faltan: figurasQueFaltan(config, fila), faltanAudio: audiosQueFaltan(config, fila), faltanPaginas: paginasQueFaltan(config, fila), paquete: vista(fila) };
  const tipoPedido = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (tipoPedido !== r.tipo(archivo) && tipoPedido !== 'application/octet-stream' && !(clase === 'audio' && tipoPedido === 'audio/mp3')) throw new ErrorHttp(415, 'formato_no_valido');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > r.tope) throw new ErrorHttp(413, 'demasiado_grande');
  const soltar = apartarRecurso(fila, clase, archivo);
  let resultado;
  try {
    mkdirSync(dirname(destino), { recursive: true }); // las versiones de antes no tienen la carpeta «audio» ni «paginas»
    const parcial = `${destino}.part`;
    const hash = createHash('sha256');
    let bytes = 0;
    await pipeline(req, async function* contar(fuente) {
      for await (const parte of fuente) {
        bytes += parte.length;
        if (bytes > r.tope) throw new ErrorHttp(413, 'demasiado_grande');
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
