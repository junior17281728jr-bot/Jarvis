// RESTAURAR una copia cifrada (el contrato que la parte 1f envuelve con su pantalla y su instalador; la consola
// deploy/oportia-restaurar.mjs llega en el paso 2). Nunca corre dentro del servicio: ni el servidor web ni el
// trabajador cargan este archivo (test/reglas.test.js).
//  - Necesita SOLO lo que guarda el dueño: su clave de recuperación y su Telegram (o los archivos de una noche guardados
//    desde Telegram Desktop). Nunca un archivo del servidor viejo, nunca la llave de las claves.
//  - Nunca pisa nada: el destino es un archivo NUEVO ('wx'); si existe (o su -wal, -shm o -journal), destino_existe.
//    La marca de OPORTIA (application_id) se escribe AL FINAL: un archivo a medias nunca es una base de OPORTIA.
//  - Nunca abre una copia vieja en silencio: alElegir recibe la fecha y la edad ANTES de bajar o aplicar nada.
//  - No hay camino sin autenticar: con índice, su firma (sello) y la del flujo; sin índice, la del flujo (la última
//    línea del volcado). Una copia hecha por alguien que solo tiene la llave pública se rechaza.
//  - Nada se borra: las partes bajadas quedan en carpetaTrabajo (cifradas, como en Telegram).
import { closeSync, createReadStream, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, writeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ID_APLICACION, enTransaccion } from '../nucleo/db.js';
import {
  ErrorCopias, CABECERA_PARTE, INDICE_MAXIMO, MAGIA_PARTE, PARTE_MAXIMA, LINEA_MAX, CLAVE_SERVIDOR, CLAVE_ORIGENES,
  rutaSegura, leerCabeceraParte, leerIndice, pareceIndice, nombreParte, sha256Hex,
} from './formato.js';
import { leerClave, derivar } from './clave.js';
import { crearDescifrador, abrirSellado, leerCabeceraFlujo } from './cifrar.js';
import { crearLector, crearAplicador } from './volcado.js';
import { TELEGRAM } from '../canales/telegram.js';
import { crearCredencial } from '../canales/credencial.js';
import { crearCodigo, huellaCodigo, mensajeConCodigo, codigoParaMostrar, INTENTOS_MAXIMOS, VIGENCIA_MS } from '../canales/vinculo.js';

const HORA = 3_600_000;
export const MARCA_EN_CONSTRUCCION = 0x4f505442; // "OPTB"
export const HORAS_ANTIGUA = 30;
const MAX_ARCHIVOS = 20_000;

// ---------- Leer lo que hay ----------

// Las rutas (archivos o carpetas, una carpeta se recorre entera sin seguir enlaces) → archivos normales.
function archivosDe(rutas) {
  const lista = [];
  const pendientes = [...rutas].map(String);
  while (pendientes.length) {
    const ruta = pendientes.shift();
    let info;
    try { info = lstatSync(ruta); } catch { continue; }
    if (info.isDirectory()) {
      for (const nombre of readdirSync(ruta).sort()) pendientes.push(join(ruta, nombre));
    } else if (info.isFile()) {
      lista.push({ ruta, bytes: info.size });
    }
    if (lista.length > MAX_ARCHIVOS) throw new ErrorCopias('demasiados_archivos');
  }
  return lista;
}

function leerInicio(ruta, n) {
  const fd = openSync(rutaSegura(ruta), 'r');
  try {
    const b = Buffer.alloc(n);
    const leidos = readSync(fd, b, 0, n, 0);
    return b.subarray(0, leidos);
  } finally {
    closeSync(fd);
  }
}

// Qué hay en una lista de archivos: índices (texto) y partes (por copia y número). La llave de las claves nunca se abre
// (rutaSegura) y se salta sin error: no es parte de ninguna copia.
function inventario(rutas) {
  const indices = [];
  const partes = new Map();
  for (const { ruta, bytes } of archivosDe(rutas)) {
    try { rutaSegura(ruta); } catch { continue; }
    if (bytes < 14) continue;
    const inicio = leerInicio(ruta, CABECERA_PARTE);
    if (inicio.toString('latin1', 0, 8) === MAGIA_PARTE) {
      let cabecera;
      try {
        cabecera = leerCabeceraParte(inicio);
      } catch (error) {
        if (error.clave === 'formato_nuevo') throw error;
        continue; // una parte que no se entiende es como una que falta (falta_parte la nombra)
      }
      if (bytes !== CABECERA_PARTE + cabecera.largo) continue;
      if (!partes.has(cabecera.copia)) partes.set(cabecera.copia, []);
      partes.get(cabecera.copia).push({ ruta, bytes, cabecera });
    } else if (bytes <= INDICE_MAXIMO && inicio.toString('utf8').startsWith('{"oportia":"indice-copia"')) {
      const texto = readFileSync(rutaSegura(ruta), 'utf8');
      if (pareceIndice(texto)) indices.push({ ruta, texto });
    }
  }
  return { indices, partes };
}

// sha256 del archivo entero y de su carga (sin la cabecera), leyendo por pedazos.
async function hashesDeParte(ruta) {
  const entero = createHash('sha256');
  const carga = createHash('sha256');
  let visto = 0;
  for await (const pedazo of createReadStream(rutaSegura(ruta), { highWaterMark: 256 * 1024 })) {
    entero.update(pedazo);
    if (visto + pedazo.length > CABECERA_PARTE) carga.update(pedazo.subarray(Math.max(0, CABECERA_PARTE - visto)));
    visto += pedazo.length;
  }
  return { sha256: entero.digest('hex'), carga: carga.digest() };
}

// De las partes de UNA copia, la lista ordenada 1…n (contiguas en n y en desde), o qué falta. Una parte repetida igual
// se tolera; dos distintas con el mismo número no.
async function ordenarPartes(lista, indice) {
  const porN = new Map();
  for (const p of lista) {
    const h = await hashesDeParte(p.ruta);
    if (!h.carga.equals(p.cabecera.hashCarga)) throw new ErrorCopias('parte_danada', { n: p.cabecera.n });
    p.sha256 = h.sha256;
    const otra = porN.get(p.cabecera.n);
    if (indice) {
      const esperada = indice.partes[p.cabecera.n - 1];
      if (!esperada || esperada.sha256 !== h.sha256 || esperada.bytes !== p.bytes) continue; // no es la de este índice
    }
    if (otra && otra.sha256 !== p.sha256) throw new ErrorCopias('parte_danada', { n: p.cabecera.n });
    porN.set(p.cabecera.n, p);
  }
  const total = indice ? indice.partes.length : Math.max(0, ...porN.keys());
  const orden = [];
  let desde = 0;
  for (let n = 1; n <= total; n++) {
    const p = porN.get(n);
    if (!p) return { falta: n };
    if (p.cabecera.desde !== desde) throw new ErrorCopias('parte_danada', { n });
    desde += p.cabecera.largo;
    orden.push(p);
  }
  if (!orden.length) return { falta: 1 };
  return { orden };
}

// La cabecera del flujo de una copia (está al principio de la carga de la parte 1): fecha, servidor, receptor.
function cabeceraDelFlujo(rutaParte1) {
  const inicio = leerInicio(rutaParte1, CABECERA_PARTE + 14 + 4096);
  const flujo = inicio.subarray(CABECERA_PARTE);
  if (flujo.length < 14) throw new ErrorCopias('copia_danada');
  const largo = leerCabeceraFlujo(flujo);
  if (flujo.length < 14 + largo) throw new ErrorCopias('copia_danada');
  try { return JSON.parse(flujo.subarray(14, 14 + largo).toString('utf8')); } catch { throw new ErrorCopias('copia_danada'); }
}

// ---------- Telegram ----------

async function deTelegram(cred, motivo) {
  if (motivo === 'ok') return;
  throw new ErrorCopias(motivo === 'sin_red' || motivo === 'tiempo_agotado' ? 'sin_red' : 'telegram', { motivo });
}

async function bajarATexto(cred, archivoId, tope, senal) {
  // Se pide el enlace otra vez antes de cada bajada, y un segundo intento si el enlace venció o la red falló.
  for (let intento = 0; ; intento++) {
    const a = await TELEGRAM.archivo(cred, { archivoId, senal });
    if (a.motivo !== 'ok') { if (intento >= 1) await deTelegram(cred, a.motivo); continue; }
    const pedazos = [];
    const r = await TELEGRAM.bajar(cred, { ruta: a.ruta, topeBytes: tope, senal, alTrozo: async b => { pedazos.push(Buffer.from(b)); } });
    if (r.motivo === 'demasiado_grande') throw new ErrorCopias('indice_danado');
    if (r.motivo === 'ok') return Buffer.concat(pedazos);
    if (intento >= 1) await deTelegram(cred, r.motivo);
  }
}

// Baja una parte a un archivo NUEVO de carpetaTrabajo (nunca pisa: si el nombre existe, prueba otro). Un enlace nuevo
// antes de cada bajada (su enlace vale al menos 1 hora) y un segundo intento si la primera falla.
async function bajarParte(cred, { parte, copia, creada, carpeta, tope, senal }) {
  mkdirSync(carpeta, { recursive: true });
  for (let intento = 0; intento < 2; intento++) {
    const a = await TELEGRAM.archivo(cred, { archivoId: parte.telegram.archivo, senal });
    if (a.motivo !== 'ok') { if (intento === 1) await deTelegram(cred, a.motivo); continue; }
    if (a.bytes != null && a.bytes !== parte.bytes) throw new ErrorCopias('parte_danada', { n: parte.n });
    let ruta = null;
    let fd = null;
    for (let k = 0; k < 1000 && fd === null; k++) {
      const nombre = nombreParte(copia, creada, parte.n).replace(/\.opc$/, k ? `.${k}.opc` : '.opc');
      ruta = join(carpeta, nombre);
      try { fd = openSync(rutaSegura(ruta), 'wx', 0o640); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    }
    if (fd === null) throw new ErrorCopias('destino_existe');
    const hash = createHash('sha256');
    let r;
    try {
      r = await TELEGRAM.bajar(cred, {
        ruta: a.ruta, topeBytes: Math.min(tope, parte.bytes), senal,
        alTrozo: async b => { hash.update(b); writeSync(fd, b); },
      });
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (r.motivo === 'demasiado_grande') throw new ErrorCopias('parte_danada', { n: parte.n });
    if (r.motivo !== 'ok') { if (intento === 1) await deTelegram(cred, r.motivo); continue; }
    if (hash.digest('hex') !== parte.sha256 || r.bytes !== parte.bytes) throw new ErrorCopias('parte_danada', { n: parte.n });
    return ruta;
  }
  throw new ErrorCopias('sin_red');
}

// ---------- Elegir la copia ----------

function datosParaElegir({ copia, creada, servidor, anterior, hayMasNueva, ahora }) {
  const edadHoras = Math.max(0, Math.round(((ahora - Date.parse(creada)) / HORA) * 10) / 10);
  return { copia, creada, edadHoras, antigua: edadHoras > HORAS_ANTIGUA, hayMasNueva, servidor: servidor ?? null, anterior: anterior ?? null };
}

// Los índices de ESTA clave, auténticos, del más nuevo al más viejo.
function indicesDeLaClave(textos, llaves) {
  const publica = llaves.publica.toString('base64url');
  const leidos = textos.map(t => ({ ...t, datos: leerIndice(t.texto) })).sort((a, b) => Date.parse(b.datos.creada) - Date.parse(a.datos.creada));
  const mios = leidos.filter(x => x.datos.publica === publica);
  if (!mios.length) throw new ErrorCopias('clave_no_es_de_esta_copia', { receptor: String(leidos[0].datos.receptor).slice(0, 8) });
  const autenticos = [];
  for (const x of mios) {
    try { autenticos.push({ ...x, datos: leerIndice(x.texto, { sello: llaves.sello }) }); } catch (error) { if (error.clave !== 'indice_no_autentico') throw error; }
  }
  if (!autenticos.length) throw new ErrorCopias('indice_no_autentico');
  return { autenticos, noAutenticos: mios.length - autenticos.length };
}

async function resumenDe(indice, llaves) {
  const { texto, cabecera } = await abrirSellado(indice.sellado, llaves.privada);
  let r;
  try { r = JSON.parse(texto); } catch { throw new ErrorCopias('indice_danado'); }
  if (!r || r.copia !== indice.copia || cabecera.copia !== indice.copia || !r.volcado || !Number.isSafeInteger(r.volcado.bytes)
    || !/^[0-9a-f]{64}$/.test(String(r.volcado.sha256)) || !r.porTabla || typeof r.porTabla !== 'object') {
    throw new ErrorCopias('indice_danado');
  }
  return r;
}

// ---------- Restaurar ----------

function revisarDestino(destino) {
  rutaSegura(destino);
  for (const extra of ['', '-wal', '-shm', '-journal']) {
    if (existsSync(`${destino}${extra}`)) throw new ErrorCopias('destino_existe');
  }
}

function errorDeAplicar(error) {
  if (error instanceof ErrorCopias) return error;
  if (typeof error?.code === 'string' && /^(?:Z_|ERR_ZLIB|ERR_STREAM_PREMATURE_CLOSE)/.test(error.code)) return new ErrorCopias('copia_danada');
  if (error?.name === 'AbortError') return new ErrorCopias('cancelada');
  const detalle = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(error.code) ? error.code : (error?.name ?? 'error');
  return new ErrorCopias('base_no_valida', { detalle: String(detalle).slice(0, 40) });
}

function tablaExiste(db, nombre) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(nombre));
}

// Lo que se arregla en una base recién restaurada (antes de su marca): las copias que estaban «haciéndose» en la foto
// quedan 'interrumpida' (sin aviso), su tarea 'cancelada', y el servidor recibe un id NUEVO (el viejo queda anotado en
// servidor.origenes): un servidor viejo que reviviera y el nuevo nunca firman con el mismo id.
export function ajustarTrasRestaurar(db, { ahora = Date.now() } = {}) {
  const momento = new Date(ahora).toISOString();
  return enTransaccion(db, () => {
    let copiasInterrumpidas = 0;
    let tareasCanceladas = 0;
    if (tablaExiste(db, 'copias')) {
      copiasInterrumpidas = Number(db.prepare(`UPDATE copias SET estado = 'interrumpida', motivo = 'restaurada', terminada_en = ?
        WHERE estado IN ('haciendo', 'escrita', 'subida')`).run(momento).changes);
    }
    if (tablaExiste(db, 'tareas')) {
      const vivas = db.prepare("SELECT id FROM tareas WHERE tipo = 'copias.hacer' AND estado IN ('lista', 'en_curso', 'revisar')").all();
      for (const { id } of vivas) {
        db.prepare(`UPDATE tareas SET estado = 'cancelada', motivo_espera = NULL, dueno = NULL, arriendo_hasta = NULL, terminada_en = ?,
          actualizada_en = ? WHERE id = ?`).run(momento, momento, id);
        if (tablaExiste(db, 'tarea_eventos')) {
          db.prepare("INSERT INTO tarea_eventos (tarea_id, fecha, evento, detalle) VALUES (?, ?, 'cancelada', 'base_restaurada')").run(id, momento);
        }
        tareasCanceladas += 1;
      }
    }
    let servidorNuevo = null;
    if (tablaExiste(db, 'ajustes')) {
      const leer = clave => { try { return JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave)?.valor ?? 'null'); } catch { return null; } };
      const guardar = (clave, valor) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), momento);
      const viejo = leer(CLAVE_SERVIDOR);
      const origenes = Array.isArray(leer(CLAVE_ORIGENES)) ? leer(CLAVE_ORIGENES) : [];
      if (viejo?.id) origenes.push({ id: String(viejo.id), hasta: momento });
      servidorNuevo = randomUUID();
      guardar(CLAVE_ORIGENES, origenes);
      guardar(CLAVE_SERVIDOR, { id: servidorNuevo, creado: momento });
    }
    if (tablaExiste(db, 'auditoria')) {
      db.prepare("INSERT INTO auditoria (fecha, usuario_id, accion, detalle) VALUES (?, NULL, 'base_restaurada', ?)")
        .run(momento, `copias interrumpidas: ${copiasInterrumpidas}, tareas canceladas: ${tareasCanceladas}`);
    }
    return { copiasInterrumpidas, tareasCanceladas, servidorNuevo };
  });
}

// Ver el encabezado: { clave, fuente, destino, carpetaTrabajo, alElegir, aceptarAnterior, ajustar, senal, alAvanzar,
// base (solo pruebas), tamanoMaximoParte, ahora }. Ver diseno-1e §9.
export async function restaurarCopia({
  clave, fuente, destino = null, carpetaTrabajo = null, alElegir = async () => true, aceptarAnterior = false, ajustar = true,
  senal = null, alAvanzar = () => {}, base = null, tamanoMaximoParte = PARTE_MAXIMA, ahora = Date.now(),
}) {
  // 1. La clave (un error al escribirla se nota enseguida).
  const semilla = leerClave(clave);
  let llaves;
  try { llaves = derivar(semilla); } finally { semilla.fill(0); }
  try {
    if (destino != null) revisarDestino(destino);
    const tope = Math.min(PARTE_MAXIMA, Math.max(CABECERA_PARTE + 1, Number(tamanoMaximoParte) || PARTE_MAXIMA));
    // 2-3. El índice (o, sin índice, las partes solas) y la copia elegida.
    let elegida;
    if (fuente?.tipo === 'telegram') elegida = await elegirDeTelegram({ fuente, llaves, base, carpetaTrabajo, tope, senal, alElegir, ahora, alAvanzar });
    else if (fuente?.tipo === 'archivos') elegida = await elegirDeArchivos({ fuente, llaves, aceptarAnterior, alElegir, ahora });
    else throw new ErrorCopias('fuente_no_valida');
    alAvanzar({ paso: 'partes_listas', partes: elegida.orden.length });
    // 6-8. Descifrar, leer, aplicar y revisar.
    const resultado = await aplicarCopia({ elegida, llaves, destino, ajustar, senal, ahora, alAvanzar });
    return {
      ok: true, ...elegida.info, version: resultado.version, migracion: resultado.migracion, receptor: llaves.huella,
      autentica: elegida.indice ? 'indice+flujo' : 'flujo', copiaEnCurso: resultado.copiaEnCurso, tablas: resultado.tablas,
      filas: resultado.filas, bytes: elegida.bytes, archivo: destino, claves: resultado.claves, partes: elegida.orden.length,
      indicesNoAutenticos: elegida.noAutenticos ?? 0, ajuste: resultado.ajuste,
    };
  } finally {
    llaves.sello.fill(0);
    llaves.verificador.fill(0);
  }
}

async function preguntar(alElegir, info) {
  if ((await alElegir(info)) !== true) throw new ErrorCopias('cancelada_por_dueno');
}

async function elegirDeArchivos({ fuente, llaves, aceptarAnterior, alElegir, ahora }) {
  const { indices, partes } = inventario(fuente.archivos ?? []);
  if (indices.length) {
    const { autenticos, noAutenticos } = indicesDeLaClave(indices, llaves);
    let hayMasNueva = null;
    // Partes de una copia que no tiene su índice en la lista: si es más nueva, nunca se pasa por alto en silencio.
    const conIndice = new Set(indices.map(x => pareceIndice(x.texto)?.copia));
    let sinIndice = null;
    for (const [copia, lista] of partes) {
      const uno = conIndice.has(copia) ? null : lista.find(p => p.cabecera.n === 1);
      if (!uno) continue;
      const creada = cabeceraDelFlujo(uno.ruta).creada;
      if (!sinIndice || Date.parse(creada) > Date.parse(sinIndice.creada)) sinIndice = { copia, creada };
    }
    for (const x of autenticos) {
      const d = x.datos;
      const ordenadas = await ordenarPartes(partes.get(d.copia) ?? [], d);
      if (ordenadas.falta) {
        if (!aceptarAnterior) throw new ErrorCopias('falta_parte', { n: ordenadas.falta, copia: d.copia });
        hayMasNueva ??= { copia: d.copia, creada: d.creada };
        continue;
      }
      const resumen = await resumenDe(d, llaves);
      if (!hayMasNueva && sinIndice && Date.parse(sinIndice.creada) > Date.parse(d.creada)) hayMasNueva = sinIndice;
      const info = datosParaElegir({ copia: d.copia, creada: d.creada, servidor: d.servidor, anterior: d.anterior, hayMasNueva, ahora });
      await preguntar(alElegir, info);
      return { indice: d, resumen, orden: ordenadas.orden, info, bytes: d.flujo.bytes, noAutenticos };
    }
    const primera = autenticos[0].datos;
    throw new ErrorCopias('falta_parte', { n: 1, copia: primera.copia });
  }
  // Sin índice: las partes solas, ordenadas por su cabecera; la copia se acepta solo si el sello del flujo cuadra.
  const grupos = [];
  for (const [copia, lista] of partes) {
    const uno = lista.find(p => p.cabecera.n === 1);
    const cabecera = uno ? cabeceraDelFlujo(uno.ruta) : null;
    grupos.push({ copia, lista, cabecera, fecha: cabecera ? Date.parse(cabecera.creada) || 0 : -1 });
  }
  if (!grupos.length) throw new ErrorCopias('sin_indice');
  grupos.sort((a, b) => b.fecha - a.fecha);
  let hayMasNueva = null;
  for (const g of grupos) {
    const ordenadas = g.cabecera ? await ordenarPartes(g.lista, null) : { falta: 1 };
    if (ordenadas.falta) {
      if (!aceptarAnterior) throw new ErrorCopias('falta_parte', { n: ordenadas.falta, copia: g.copia });
      hayMasNueva ??= { copia: g.copia, creada: g.cabecera?.creada ?? null };
      continue;
    }
    const info = datosParaElegir({ copia: g.copia, creada: g.cabecera.creada, servidor: g.cabecera.servidor, anterior: null, hayMasNueva, ahora });
    await preguntar(alElegir, info);
    const bytes = ordenadas.orden.reduce((s, p) => s + p.cabecera.largo, 0);
    return { indice: null, resumen: null, orden: ordenadas.orden, info, bytes };
  }
  throw new ErrorCopias('falta_parte', { n: 1, copia: grupos[0].copia });
}

async function elegirDeTelegram({ fuente, llaves, base, carpetaTrabajo, tope, senal, alElegir, ahora, alAvanzar }) {
  if (!carpetaTrabajo) throw new ErrorCopias('fuente_no_valida');
  const cred = crearCredencial({ token: String(fuente.token ?? '').trim(), base });
  const yo = await TELEGRAM.probar(cred, { senal });
  if (yo.motivo !== 'ok' && yo.motivo !== 'bot_ocupado') await deTelegram(cred, yo.motivo);
  let archivoId = fuente.indiceArchivoId ?? null;
  if (!archivoId) {
    const f = await TELEGRAM.fijado(cred, { destino: fuente.chatId, senal });
    await deTelegram(cred, f.motivo);
    if (!f.documento) throw new ErrorCopias('sin_indice');
    archivoId = f.documento.archivoId;
  }
  const texto = (await bajarATexto(cred, archivoId, INDICE_MAXIMO, senal)).toString('utf8');
  if (!pareceIndice(texto)) throw new ErrorCopias('sin_indice');
  const { autenticos } = indicesDeLaClave([{ ruta: null, texto }], llaves);
  const d = autenticos[0].datos;
  if (d.bot !== yo.cuenta?.id) throw new ErrorCopias('otro_bot');
  if (d.partes.some(p => !p.telegram)) throw new ErrorCopias('falta_parte', { n: d.partes.find(p => !p.telegram).n, copia: d.copia });
  const resumen = await resumenDe(d, llaves);
  const info = datosParaElegir({ copia: d.copia, creada: d.creada, servidor: d.servidor, anterior: d.anterior, hayMasNueva: null, ahora });
  await preguntar(alElegir, info);
  // 5. Bajar cada parte (cifrada) a la carpeta de trabajo.
  const rutas = [];
  for (const parte of d.partes) {
    rutas.push(await bajarParte(cred, { parte, copia: d.copia, creada: d.creada, carpeta: carpetaTrabajo, tope, senal }));
    alAvanzar({ paso: 'bajada', n: parte.n, de: d.partes.length });
  }
  const lista = rutas.map(ruta => {
    const cabecera = leerCabeceraParte(leerInicio(ruta, CABECERA_PARTE));
    if (cabecera.copia !== d.copia) throw new ErrorCopias('parte_de_otra_copia', { n: cabecera.n });
    return { ruta, bytes: statSync(ruta).size, cabecera };
  });
  const ordenadas = await ordenarPartes(lista, d);
  if (ordenadas.falta) throw new ErrorCopias('falta_parte', { n: ordenadas.falta, copia: d.copia });
  return { indice: d, resumen, orden: ordenadas.orden, info, bytes: d.flujo.bytes };
}

async function* cargasDe(orden, hashFlujo) {
  for (const p of orden) {
    for await (const pedazo of createReadStream(rutaSegura(p.ruta), { start: CABECERA_PARTE, highWaterMark: 256 * 1024 })) {
      hashFlujo.update(pedazo);
      yield pedazo;
    }
  }
}

async function aplicarCopia({ elegida, llaves, destino, ajustar, senal, ahora, alAvanzar }) {
  const { indice, resumen, orden } = elegida;
  let db = null;
  let aplicador = null;
  let lector = null;
  let cabeceraVolcado = null;
  const hashFlujo = createHash('sha256');
  if (destino != null) {
    closeSync(openSync(rutaSegura(destino), 'wx', 0o640));
    db = new DatabaseSync(destino);
  }
  try {
    if (db) {
      // Mientras se arma lleva OTRA marca ('OPTB', en construcción): abrirBase la rechaza, nunca la toma por vacía.
      db.exec(`PRAGMA journal_mode = MEMORY; PRAGMA synchronous = FULL; PRAGMA foreign_keys = OFF; PRAGMA application_id = ${MARCA_EN_CONSTRUCCION};`);
      aplicador = crearAplicador(db);
    }
    let filasVistas = 0;
    const descifrador = crearDescifrador({
      privada: llaves.privada,
      alCabecera: (datos, hashCabecera) => {
        if (datos.copia !== elegida.info.copia) throw new ErrorCopias('parte_de_otra_copia', { n: 1 });
        if (indice && datos.creada !== indice.creada) throw new ErrorCopias('copia_danada');
        if (datos.compresion !== 'gzip' || datos.contenido !== 'oportia-volcado-v1') throw new ErrorCopias('copia_danada');
        lector = crearLector({
          sello: llaves.sello, copia: datos.copia, hashCabecera, lineaMax: LINEA_MAX,
          bytesMax: resumen ? resumen.volcado.bytes : undefined,
          alElemento: (e, bytes) => {
            if (e.t === 'cabecera') cabeceraVolcado = e;
            if (e.t === 'fila' && ++filasVistas % 20_000 === 0) alAvanzar({ paso: 'filas', filas: filasVistas });
            if (aplicador) aplicador.agregar(e, bytes.length);
          },
        });
      },
    });
    try {
      await pipeline(
        Readable.from(cargasDe(orden, hashFlujo)),
        descifrador,
        createGunzip(),
        new Writable({
          write(datos, _cod, listo) {
            try {
              if (!lector) throw new ErrorCopias('copia_danada');
              lector.alimentar(datos);
              listo();
            } catch (error) { listo(error); }
          },
        }),
        { signal: senal ?? undefined },
      );
    } catch (error) {
      throw errorDeAplicar(error);
    }
    const leido = lector.terminar();
    if (aplicador) {
      try { aplicador.terminar(); } catch (error) { throw errorDeAplicar(error); }
    }
    // 8. Revisar todo contra lo sellado.
    if (indice && (hashFlujo.digest('hex') !== indice.flujo.sha256)) throw new ErrorCopias('copia_danada');
    if (resumen) {
      const iguales = JSON.stringify(Object.entries(resumen.porTabla).sort()) === JSON.stringify(Object.entries(leido.porTabla).sort());
      if (resumen.volcado.bytes !== leido.bytes || resumen.volcado.sha256 !== leido.sha256 || !iguales) throw new ErrorCopias('volcado_danado');
    }
    if (cabeceraVolcado?.application_id !== ID_APLICACION) throw new ErrorCopias('base_no_valida', { detalle: 'application_id' });
    const salida = { version: cabeceraVolcado.version ?? null, migracion: cabeceraVolcado.migracion ?? null, tablas: leido.tablas, filas: leido.filas, copiaEnCurso: null, claves: null, ajuste: null };
    if (!db) return salida;
    const integridad = db.prepare('PRAGMA integrity_check').all().map(f => Object.values(f)[0]);
    if (integridad.length !== 1 || integridad[0] !== 'ok') throw new ErrorCopias('base_no_valida', { detalle: 'integrity_check' });
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new ErrorCopias('base_no_valida', { detalle: 'foreign_key_check' });
    if (tablaExiste(db, 'copias')) salida.copiaEnCurso = db.prepare('SELECT * FROM copias WHERE copia = ?').get(elegida.info.copia) ?? null;
    if (salida.copiaEnCurso) salida.copiaEnCurso = { ...salida.copiaEnCurso };
    if (ajustar) salida.ajuste = ajustarTrasRestaurar(db, { ahora });
    // 9. Las claves guardadas no se pueden leer en un servidor nuevo (la llave nunca viaja): hay que pegarlas otra vez.
    if (tablaExiste(db, 'secretos')) {
      const usos = db.prepare("SELECT uso, COUNT(*) AS n FROM secretos WHERE estado = 'activa' GROUP BY uso").all();
      salida.claves = {
        guardadas: Number(db.prepare('SELECT COUNT(*) AS n FROM secretos').get().n),
        deIa: usos.filter(u => String(u.uso).startsWith('ia_')).map(u => u.uso),
        telegram: usos.some(u => u.uso === 'telegram_bot'),
      };
    } else {
      salida.claves = { guardadas: 0, deIa: [], telegram: false };
    }
    // LO ÚLTIMO: la marca de OPORTIA, la versión del usuario y el modo WAL. Hasta aquí el archivo no es una base de OPORTIA.
    const userVersion = Number.isSafeInteger(cabeceraVolcado.user_version) ? cabeceraVolcado.user_version : 0;
    db.exec(`PRAGMA user_version = ${userVersion}; PRAGMA application_id = ${ID_APLICACION};`);
    db.exec('PRAGMA journal_mode = WAL;');
    return salida;
  } finally {
    if (db) { try { db.close(); } catch { /* ya cerrada */ } }
  }
}

// ---------- Buscar el chat del dueño en un servidor nuevo (un código de un uso, como al unir el chat) ----------
// empezarBusquedaDeChat({ token }) → { codigo, paraMostrar, esperar({ senal, hastaMs }) → { chatId, nombre } }.
// Las mismas reglas de src/canales/vinculo.js: chat privado, no un bot, mensaje nuevo, código exacto, 5 intentos.
// Nunca guarda un «offset» entre corridas: primero confirma lo que había (offset −1), y después pregunta sin offset.
export async function empezarBusquedaDeChat({ token, base = null, cadaMs = 3000, ahora = Date.now }) {
  const cred = crearCredencial({ token: String(token ?? '').trim(), base });
  const yo = await TELEGRAM.probar(cred);
  if (yo.motivo !== 'ok' && yo.motivo !== 'bot_ocupado') await deTelegram(cred, yo.motivo);
  if (yo.motivo === 'bot_ocupado') throw new ErrorCopias('telegram', { motivo: 'bot_ocupado' });
  const viejo = await TELEGRAM.recibir(cred, { desde: -1, limite: 1 });
  await deTelegram(cred, viejo.motivo);
  if (viejo.siguiente != null) {
    const confirmar = await TELEGRAM.recibir(cred, { desde: viejo.siguiente, limite: 1 });
    await deTelegram(cred, confirmar.motivo);
  }
  const codigo = crearCodigo();
  const huella = huellaCodigo(codigo);
  const desdeMs = ahora();
  return {
    codigo,
    paraMostrar: codigoParaMostrar(codigo),
    bot: yo.cuenta,
    async esperar({ senal = null, hastaMs = desdeMs + VIGENCIA_MS } = {}) {
      let desde = null;
      let intentos = 0;
      for (;;) {
        if (senal?.aborted) throw new ErrorCopias('cancelada');
        if (ahora() > hastaMs) throw new ErrorCopias('codigo_vencido');
        const r = await TELEGRAM.recibir(cred, { desde, limite: 50, senal });
        if (r.motivo === 'ok') {
          if (r.siguiente != null) desde = r.siguiente;
          for (const m of r.mensajes) {
            const v = mensajeConCodigo(m, { huella, desdeMs });
            if (v === 'coincide') return { chatId: m.chat.id, nombre: m.de?.nombre ?? m.chat.nombre ?? null };
            if (v === 'intento' && ++intentos >= INTENTOS_MAXIMOS) throw new ErrorCopias('codigo_vencido');
          }
        } else if (r.motivo === 'clave_no_valida' || r.motivo === 'conflicto') {
          await deTelegram(cred, r.motivo);
        }
        await new Promise(listo => setTimeout(listo, r.motivo === 'limite' ? Math.min(r.esperarMs ?? cadaMs, 60_000) : cadaMs));
      }
    },
  };
}
