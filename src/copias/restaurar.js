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
//  - Un archivo raro en la carpeta nunca tumba todo: una parte dañada (o una copia repetida dañada, «parte-2 (1).opc») se
//    salta si hay otra buena con ese número; un archivo que parece índice y no se entiende se ignora (y se cuenta). Con
//    aceptarAnterior, una copia dañada o cortada deja probar la anterior (siempre se dice que hay una más nueva).
//  - Sin índice no se sabe cuántas partes tiene una copia: se descifra entera SIN escribir nada antes de preguntar.
// Ronda 2 del equipo rojo:
//  - Una copia con fecha del futuro (reloj adelantado) nunca se elige en silencio: alElegir recibe futura: true. Con
//    índices, el orden de verdad es la cadena («anterior»): una copia que otra nombra como su anterior NO es la más nueva
//    aunque su fecha lo diga. Si hay otra copia candidata (más nueva por fecha, u otra «punta» de la cadena: dos
//    servidores con el mismo bot), alElegir recibe otraCandidata con su fecha y su servidor, y la consola pregunta.
//  - Los intentos del código del chat se cuentan por chat (src/canales/vinculo.js): un extraño no lo vence.
// Ronda 3 del equipo rojo:
//  - Una copia más nueva SIN su índice en la carpeta (el disco no dejó escribirlo, o no se guardó de Telegram) se prueba
//    entera sin escribir nada; si está completa, se ofrece ELLA (sinIndice: true) y la de índice queda como otraCandidata
//    ('con_indice_mas_vieja'). Si está cortada o dañada, se usa la de índice y hayMasNueva lo dice.
//  - Al buscar el chat en un servidor nuevo, el bot le manda a ese chat un segundo código que hay que escribir
//    (confirmar): quien tenga el token y repita el código del dueño desde SU chat no lo tiene.
//  - «Auténtica» quiere decir: la hizo un servidor que tenía el sello (envuelto con su llave de las claves). La base sola
//    ya no alcanza para armar una copia falsa (src/copias/estado.js).
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
import { leerClave, derivar, leerKdf, derivarDeContrasena, normalizarContrasena } from './clave.js';
import { crearDescifrador, abrirSellado, leerCabeceraFlujo } from './cifrar.js';
import { crearLector, crearAplicador } from './volcado.js';
import { TELEGRAM } from '../canales/telegram.js';
import { crearCredencial } from '../canales/credencial.js';
import { crearCodigo, huellaCodigo, codigoParaMostrar, revisarLote, VIGENCIA_MS, crearCodigoConfirmar, huellaConfirmar, cifrasConfirmar, confirmarCoincide, INTENTOS_CONFIRMAR } from '../canales/vinculo.js';
import { textoConfirmarVinculo } from '../canales/textos.js';
import { CLAVE_RESTAURADA } from '../claves/cifrado.js';

const HORA = 3_600_000;
export const MARCA_EN_CONSTRUCCION = 0x4f505442; // "OPTB"
export const HORAS_ANTIGUA = 30;
// La copia fijada en el chat es de hace más de 26 h: quizás la de la última noche no quedó fijada (se pregunta siempre).
export const HORAS_FIJADA_VIEJA = 26;
// Una copia con fecha más de 5 min después de ahora es de un reloj adelantado (futura: siempre se pregunta).
export const MARGEN_FUTURO_MS = 5 * 60_000;
// Cada noche deja unas 20–60 partes en el servidor (nunca se borran): 200.000 archivos son unos 10 años de copias.
// Por cada archivo se guarda solo su ruta, su tamaño y dos números (memoria acotada).
export const MAX_ARCHIVOS = 200_000;
// Errores que, sin índice y con aceptarAnterior, dejan probar la copia anterior.
const SE_PRUEBA_LA_ANTERIOR = Object.freeze(['copia_cortada', 'copia_danada', 'copia_no_autentica', 'volcado_danado', 'parte_de_otra_copia', 'base_no_valida', 'parte_danada', 'falta_parte']);

// ---------- Leer lo que hay ----------

// Las rutas (archivos o carpetas, una carpeta se recorre entera sin seguir enlaces) → archivos normales.
function archivosDe(rutas) {
  const lista = [];
  const pendientes = [...rutas].map(String);
  for (let i = 0; i < pendientes.length; i++) {
    const ruta = pendientes[i];
    pendientes[i] = null; // lo ya visto se suelta (la lista de carpetas por ver nunca guarda todo)
    let info;
    try { info = lstatSync(ruta); } catch { continue; }
    if (info.isDirectory()) {
      let nombres;
      try { nombres = readdirSync(ruta).sort(); } catch { continue; }
      for (const nombre of nombres) pendientes.push(join(ruta, nombre));
    } else if (info.isFile()) {
      lista.push({ ruta, bytes: info.size });
    }
    if (lista.length > MAX_ARCHIVOS) throw new ErrorCopias('demasiados_archivos', { tope: MAX_ARCHIVOS });
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

// Qué hay en una lista de archivos: índices (texto) y partes (por copia: solo ruta, tamaño y número; la cabecera se lee
// otra vez para las partes de la copia elegida). La llave de las claves nunca se abre (rutaSegura) y se salta sin error.
// Una parte de un formato más nuevo no tumba nada: se anota (formatoNuevo) por si no queda ninguna otra copia.
function inventario(rutas) {
  const indices = [];
  const partes = new Map();
  let formatoNuevo = false;
  for (const { ruta, bytes } of archivosDe(rutas)) {
    try { rutaSegura(ruta); } catch { continue; }
    if (bytes < 14) continue;
    let inicio;
    try { inicio = leerInicio(ruta, CABECERA_PARTE); } catch { continue; }
    if (inicio.toString('latin1', 0, 8) === MAGIA_PARTE) {
      let cabecera;
      try {
        cabecera = leerCabeceraParte(inicio);
      } catch (error) {
        if (error.clave === 'formato_nuevo') formatoNuevo = true;
        continue; // una parte que no se entiende es como una que falta (falta_parte la nombra)
      }
      if (bytes !== CABECERA_PARTE + cabecera.largo) continue;
      if (!partes.has(cabecera.copia)) partes.set(cabecera.copia, []);
      partes.get(cabecera.copia).push({ ruta, bytes, n: cabecera.n });
    } else if (bytes <= INDICE_MAXIMO && inicio.toString('utf8').startsWith('{"oportia":"indice-copia"')) {
      let texto;
      try { texto = readFileSync(rutaSegura(ruta), 'utf8'); } catch { continue; }
      if (pareceIndice(texto)) indices.push({ ruta, texto });
    }
  }
  return { indices, partes, formatoNuevo };
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

// De las partes de UNA copia ([{ ruta, bytes, n }]), la lista ordenada 1…n (contiguas en n y en desde) → { orden }, o
// lo que no deja seguir: { falta: n } o { danada: n }. Nunca lanza por una parte mala: un archivo dañado (su cabecera no
// cuadra, o no es el del índice) se salta, y solo cuenta como «dañada» si no queda otro bueno con ese número. Sin índice,
// dos buenas distintas con el mismo número tampoco se mezclan (dañada).
async function ordenarPartes(lista, indice) {
  const porN = new Map();
  const danadas = new Set();
  const dobles = new Set();
  let maximo = 0;
  for (const x of lista) {
    maximo = Math.max(maximo, x.n);
    if (indice) {
      const esperada = indice.partes[x.n - 1];
      if (!esperada) continue; // no es de este índice
      if (esperada.bytes !== x.bytes) { danadas.add(x.n); continue; }
    }
    let cabecera;
    try { cabecera = leerCabeceraParte(leerInicio(x.ruta, CABECERA_PARTE)); } catch { danadas.add(x.n); continue; }
    if (cabecera.n !== x.n || x.bytes !== CABECERA_PARTE + cabecera.largo) { danadas.add(x.n); continue; }
    const h = await hashesDeParte(x.ruta);
    if (!h.carga.equals(cabecera.hashCarga)) { danadas.add(x.n); continue; }
    if (indice && indice.partes[x.n - 1].sha256 !== h.sha256) { danadas.add(x.n); continue; }
    const otra = porN.get(x.n);
    if (otra) {
      if (otra.sha256 !== h.sha256) dobles.add(x.n);
      continue; // la misma parte otra vez (bajada dos veces): se usa la primera
    }
    porN.set(x.n, { ruta: x.ruta, bytes: x.bytes, n: x.n, cabecera, sha256: h.sha256 });
  }
  const total = indice ? indice.partes.length : maximo;
  const orden = [];
  let desde = 0;
  for (let n = 1; n <= total; n++) {
    const p = porN.get(n);
    if (!p) return danadas.has(n) ? { danada: n } : { falta: n };
    if (dobles.has(n) || p.cabecera.desde !== desde) return { danada: n };
    desde += p.cabecera.largo;
    orden.push(p);
  }
  if (!orden.length) return { falta: 1 };
  return { orden };
}

// Lo que no dejó ordenar las partes, como error.
const errorDePartes = (o, copia) => (o.danada ? new ErrorCopias('parte_danada', { n: o.danada, copia }) : new ErrorCopias('falta_parte', { n: o.falta, copia }));

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

// fijadaVieja: la copia sale del mensaje FIJADO en Telegram y es de hace más de 26 h (la de anoche pudo no quedar fijada).
// futura: la fecha de la copia es del futuro (el reloj del servidor que la hizo iba adelantado): se pregunta siempre.
// otraCandidata: { copia, creada, servidor, motivo } otra copia que también podría ser la más nueva (se pregunta siempre).
function datosParaElegir({ copia, creada, servidor, anterior, hayMasNueva, ahora, fijadaVieja = false, otraCandidata = null }) {
  const ms = Date.parse(creada);
  const futura = Number.isFinite(ms) && ms > ahora + MARGEN_FUTURO_MS;
  const edadHoras = Math.max(0, Math.round(((ahora - ms) / HORA) * 10) / 10);
  return {
    copia, creada, edadHoras, antigua: edadHoras > HORAS_ANTIGUA, hayMasNueva, servidor: servidor ?? null, anterior: anterior ?? null, fijadaVieja,
    futura, otraCandidata: otraCandidata ?? null,
  };
}

// Los índices auténticos en el orden de verdad: primero las «puntas» de la cadena (ninguna otra copia dice que esta fue
// su anterior), por fecha; después las demás, por fecha. Una copia que otra nombra como anterior es más vieja que esa,
// diga lo que diga su fecha (un reloj adelantado). → la lista ordenada
function enOrdenDeCadena(autenticos) {
  const seguidas = new Set(autenticos.map(x => x.datos.anterior?.copia).filter(Boolean));
  const porFecha = (a, b) => Date.parse(b.datos.creada) - Date.parse(a.datos.creada);
  return [...autenticos.filter(x => !seguidas.has(x.datos.copia)).sort(porFecha), ...autenticos.filter(x => seguidas.has(x.datos.copia)).sort(porFecha)];
}

// Otra copia que también podría ser «la más nueva» frente a la elegida: otra punta de la cadena hecha por OTRO servidor
// (dos servidores con el mismo bot y la misma clave: el viejo revivió), o una con fecha más nueva que la cadena dice más
// vieja (un reloj adelantado). Solo las copias que fueron a Telegram (bot) forman la cadena. → o null
function otraCandidataDe(elegida, autenticos, ahora) {
  const seguidas = new Set(autenticos.map(x => x.datos.anterior?.copia).filter(Boolean));
  const otras = autenticos.filter(x => x.datos.copia !== elegida.copia);
  const punta = otras.filter(x => !seguidas.has(x.datos.copia) && x.datos.bot && x.datos.servidor && x.datos.servidor !== elegida.servidor)
    .sort((a, b) => Date.parse(b.datos.creada) - Date.parse(a.datos.creada))[0];
  const masNuevaPorFecha = otras.filter(x => Date.parse(x.datos.creada) > Date.parse(elegida.creada)).sort((a, b) => Date.parse(b.datos.creada) - Date.parse(a.datos.creada))[0];
  const x = punta ?? masNuevaPorFecha;
  if (!x) return null;
  const futura = Date.parse(x.datos.creada) > ahora + MARGEN_FUTURO_MS;
  return { copia: x.datos.copia, creada: x.datos.creada, servidor: x.datos.servidor ?? null, motivo: punta ? 'otra_punta' : 'fecha_mas_nueva', futura };
}

// Los índices de ESTA clave, auténticos, del más nuevo al más viejo. Nunca lanza por un archivo que parece índice y no
// se entiende (forma rara, un formato más nuevo puesto por cualquiera con el token): se descarta y se cuenta.
// → { autenticos, noAutenticos, descartados, leidos, problema } (problema: el error a dar si no hay ninguno auténtico).
function indicesDeLaClave(textos, llaves) {
  const publica = llaves.publica.toString('base64url');
  const leidos = [];
  let descartados = 0;
  let formatoNuevo = false;
  for (const t of textos) {
    try {
      leidos.push({ ...t, datos: leerIndice(t.texto) });
    } catch (error) {
      if (!(error instanceof ErrorCopias)) throw error;
      descartados += 1;
      if (error.clave === 'formato_nuevo') formatoNuevo = true;
    }
  }
  leidos.sort((a, b) => Date.parse(b.datos.creada) - Date.parse(a.datos.creada));
  const mios = leidos.filter(x => x.datos.publica === publica);
  const autenticos = [];
  for (const x of mios) {
    try { autenticos.push({ ...x, datos: leerIndice(x.texto, { sello: llaves.sello }) }); } catch (error) { if (error.clave !== 'indice_no_autentico') throw error; }
  }
  let problema = null;
  if (!autenticos.length) {
    if (mios.length) problema = new ErrorCopias('indice_no_autentico');
    else if (leidos.length) problema = new ErrorCopias('clave_no_es_de_esta_copia', { receptor: String(leidos[0].datos.receptor).slice(0, 8) });
    else problema = new ErrorCopias(formatoNuevo ? 'formato_nuevo' : 'indice_danado');
  }
  return { autenticos, noAutenticos: mios.length - autenticos.length, descartados, leidos: leidos.length, problema };
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
      // Revisión final: la marca de «base recuperada», con las huellas de las claves que trae (su llave nunca viaja en
      // una copia). Con ella, la pantalla Claves deja pegar otra vez las claves (crea una llave nueva) sin pasar por la
      // consola; una clave guardada después con otra llave vuelve a pedir la consola si esa llave faltara (cifrado.js).
      const huellas = tablaExiste(db, 'secretos') ? db.prepare('SELECT DISTINCT llave_huella AS h FROM secretos').all().map(x => x.h).filter(Boolean) : [];
      const marca = leer(CLAVE_RESTAURADA);
      const juntas = [...new Set([...(Array.isArray(marca?.huellas) ? marca.huellas : []), ...huellas])];
      guardar(CLAVE_RESTAURADA, { en: momento, huellas: juntas });
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
  // 1. La clave de 28 símbolos se lee enseguida; una contraseña de copias (0.14.2) se estira cuando se sabe su sal (de
  // los índices o de las cabeceras de las copias).
  const llavero = crearLlavero(clave);
  try {
    if (destino != null) revisarDestino(destino);
    const tope = Math.min(PARTE_MAXIMA, Math.max(CABECERA_PARTE + 1, Number(tamanoMaximoParte) || PARTE_MAXIMA));
    // 2-3. El índice (o, sin índice, las partes solas) y la copia elegida.
    let elegida;
    if (fuente?.tipo === 'telegram') elegida = await elegirDeTelegram({ fuente, llavero, base, carpetaTrabajo, tope, senal, alElegir, ahora, alAvanzar });
    else if (fuente?.tipo === 'archivos') elegida = await elegirDeArchivos({ fuente, llavero, aceptarAnterior, alElegir, ahora, senal, alAvanzar });
    else throw new ErrorCopias('fuente_no_valida');
    const llaves = llavero.llaves;
    alAvanzar({ paso: 'partes_listas', partes: elegida.orden.length });
    // 6-8. Descifrar, leer, aplicar y revisar.
    const resultado = await aplicarCopia({ elegida, llaves, destino, ajustar, senal, ahora, alAvanzar });
    return {
      ok: true, ...elegida.info, version: resultado.version, migracion: resultado.migracion, receptor: llaves.huella,
      autentica: elegida.indice ? 'indice+flujo' : 'flujo', copiaEnCurso: resultado.copiaEnCurso, tablas: resultado.tablas,
      filas: resultado.filas, bytes: elegida.bytes, archivo: destino, claves: resultado.claves, partes: elegida.orden.length,
      indicesNoAutenticos: elegida.noAutenticos ?? 0, indicesDescartados: elegida.descartados ?? 0, ajuste: resultado.ajuste,
      con: llaves.kdf ? 'contrasena' : 'clave',
    };
  } finally {
    llavero.cerrar();
  }
}

// ---------- 0.14.2: la clave de 28 símbolos o la contraseña de copias ----------
// Cuántas sales distintas se prueban con una contraseña (cada una es un cálculo de scrypt; de la más nueva a la más
// vieja: si el dueño cambió su contraseña, la de antes abre las copias de antes).
export const SALES_POR_PROBAR = 8;

// El llavero de una restauración. Se decide por la COPIA, no por lo escrito: si lo escrito es una clave de 28 símbolos
// válida, es esa; si no, y alguna copia trae un kdf, se prueba como contraseña con la sal de cada copia (la huella que
// sale debe ser la del receptor de esa copia). Sin ningún kdf, el error de la clave de siempre (clave_formato,
// clave_control). Una contraseña que no da ninguna huella: contrasena_no_abre.
function crearLlavero(clave) {
  let llaves = null;
  let errorClave = null;
  try {
    const semilla = leerClave(clave);
    try { llaves = derivar(semilla); } finally { semilla.fill(0); }
  } catch (error) {
    if (!(error instanceof ErrorCopias)) throw error;
    errorClave = error;
  }
  if (!llaves && !normalizarContrasena(clave)) throw errorClave;
  return {
    get llaves() { return llaves; },
    // candidatos(): [{ kdf, receptor, creada }] (solo se piden si hace falta: leer las cabeceras cuesta).
    async para(candidatos) {
      if (llaves) return llaves;
      const vistas = new Set();
      const sales = [];
      const lista = [...(candidatos() ?? [])].sort((a, b) => (Date.parse(b.creada) || 0) - (Date.parse(a.creada) || 0));
      for (const c of lista) {
        const k = leerKdf(c?.kdf);
        if (!k || typeof c.receptor !== 'string' || vistas.has(k.sal)) continue;
        vistas.add(k.sal);
        sales.push({ k, receptor: c.receptor });
        if (sales.length >= SALES_POR_PROBAR) break;
      }
      if (!sales.length) throw errorClave;
      for (const { k, receptor } of sales) {
        let d;
        try { d = await derivarDeContrasena(clave, k); } catch (error) { if (error instanceof ErrorCopias && error.clave === 'contrasena_formato') throw errorClave; throw error; }
        if (d.huella === receptor) { llaves = d; return d; }
        d.sello.fill(0);
        d.verificador.fill(0);
      }
      throw new ErrorCopias('contrasena_no_abre');
    },
    cerrar() {
      if (!llaves) return;
      llaves.sello.fill(0);
      llaves.verificador.fill(0);
    },
  };
}

// Lo que dice cada índice y la parte 1 de cada copia sobre su kdf (sin revisar nada: solo para saber qué sal probar).
function candidatosDe(indices, partes) {
  const lista = [];
  for (const x of indices) {
    const d = pareceIndice(x.texto);
    if (d?.kdf) lista.push({ kdf: d.kdf, receptor: d.receptor, creada: d.creada });
  }
  for (const [, grupo] of partes ?? []) {
    const uno = grupo.find(p => p.n === 1);
    if (!uno) continue;
    try {
      const c = cabeceraDelFlujo(uno.ruta);
      if (c?.kdf) lista.push({ kdf: c.kdf, receptor: c.receptor, creada: c.creada });
    } catch { /* una parte rara no tumba nada */ }
  }
  return lista;
}

async function preguntar(alElegir, info) {
  if ((await alElegir(info)) !== true) throw new ErrorCopias('cancelada_por_dueno');
}

async function elegirDeArchivos({ fuente, llavero, aceptarAnterior, alElegir, ahora, senal, alAvanzar }) {
  const { indices, partes, formatoNuevo } = inventario(fuente.archivos ?? []);
  const llaves = await llavero.para(() => candidatosDe(indices, partes));
  const deIndices = indices.length ? indicesDeLaClave(indices, llaves) : null;
  // Hay índices que se entienden pero ninguno auténtico de esta clave: se dice (un índice tocado es una señal, nunca se
  // pasa por alto). Si ninguno se entendió (todos rotos o de un formato nuevo), se sigue como si no hubiera índice.
  if (deIndices && !deIndices.autenticos.length && deIndices.leidos > 0) throw deIndices.problema;
  if (deIndices?.autenticos.length) {
    const { autenticos, noAutenticos, descartados } = deIndices;
    let hayMasNueva = null;
    let primerProblema = null;
    // Partes de una copia que no tiene su índice en la lista (ronda 3: el disco no dejó escribir el índice, o el dueño no
    // guardó el «…-indice.txt» de esa noche). Si es más nueva que la elegida, nunca se pasa por alto: se prueba entera
    // (descifrar y revisar su sello, SIN escribir nada) y, si está completa, se ofrece ELLA primero.
    const conIndice = new Set(autenticos.map(x => x.datos.copia));
    const sinIndice = [];
    for (const [copia, lista] of partes) {
      const uno = conIndice.has(copia) ? null : lista.find(p => p.n === 1);
      if (!uno) continue;
      let cabecera;
      try { cabecera = cabeceraDelFlujo(uno.ruta); } catch { continue; }
      if (cabecera?.receptor !== llaves.huella || !Number.isFinite(Date.parse(cabecera.creada))) continue; // de otra clave
      sinIndice.push({ copia, lista, cabecera, fecha: Date.parse(cabecera.creada) });
    }
    sinIndice.sort((a, b) => b.fecha - a.fecha);
    const probadas = new Set();
    for (const x of enOrdenDeCadena(autenticos)) {
      const d = x.datos;
      const ordenadas = await ordenarPartes(partes.get(d.copia) ?? [], d);
      if (!ordenadas.orden) {
        const error = errorDePartes(ordenadas, d.copia);
        if (!aceptarAnterior) throw error;
        primerProblema ??= error;
        hayMasNueva ??= { copia: d.copia, creada: d.creada };
        continue;
      }
      const resumen = await resumenDe(d, llaves);
      for (const g of sinIndice) {
        if (g.fecha <= Date.parse(d.creada) || probadas.has(g.copia)) continue;
        probadas.add(g.copia);
        const completa = await probarSinIndice(g, { llaves, senal, ahora, alAvanzar });
        if (!completa.orden) { hayMasNueva ??= { copia: g.copia, creada: g.cabecera.creada }; continue; }
        // Está completa y su sello es bueno: es la más nueva. La de índice queda como «la otra» (se pregunta siempre).
        const otra = { copia: d.copia, creada: d.creada, servidor: d.servidor ?? null, motivo: 'con_indice_mas_vieja', futura: Date.parse(d.creada) > ahora + MARGEN_FUTURO_MS };
        const info = { ...datosParaElegir({ copia: g.copia, creada: g.cabecera.creada, servidor: g.cabecera.servidor, anterior: null, hayMasNueva, ahora, otraCandidata: otra }), sinIndice: true };
        await preguntar(alElegir, info);
        const bytes = completa.orden.reduce((s2, p) => s2 + p.cabecera.largo, 0);
        return { indice: null, resumen: null, orden: completa.orden, info, bytes, noAutenticos, descartados };
      }
      const otraCandidata = hayMasNueva ? null : otraCandidataDe(d, autenticos, ahora);
      const info = datosParaElegir({ copia: d.copia, creada: d.creada, servidor: d.servidor, anterior: d.anterior, hayMasNueva, ahora, otraCandidata });
      await preguntar(alElegir, info);
      return { indice: d, resumen, orden: ordenadas.orden, info, bytes: d.flujo.bytes, noAutenticos, descartados };
    }
    throw primerProblema ?? new ErrorCopias('falta_parte', { n: 1, copia: autenticos[0].datos.copia });
  }
  try {
    const r = await elegirSinIndice({ partes, llaves, aceptarAnterior, alElegir, ahora, senal, alAvanzar, formatoNuevo });
    return { ...r, descartados: deIndices?.descartados ?? 0 };
  } catch (error) {
    if (deIndices?.problema && error instanceof ErrorCopias && error.clave === 'sin_indice') throw deIndices.problema;
    throw error;
  }
}

// Una copia SIN índice (sus partes, con la cabecera del flujo de la parte 1): se ordenan sus partes y se descifra entera
// SIN escribir nada (revisa el sello del flujo, los largos y la última línea). → { orden } o { error }.
async function probarSinIndice(g, { llaves, senal, ahora, alAvanzar }) {
  const ordenadas = await ordenarPartes(g.lista, null);
  if (!ordenadas.orden) return { error: errorDePartes(ordenadas, g.copia) };
  alAvanzar({ paso: 'revisando', copia: g.copia });
  try {
    await aplicarCopia({ elegida: { indice: null, resumen: null, orden: ordenadas.orden, info: { copia: g.copia } }, llaves, destino: null, ajustar: false, senal, ahora, alAvanzar: () => {} });
  } catch (e) {
    if (!(e instanceof ErrorCopias) || !SE_PRUEBA_LA_ANTERIOR.includes(e.clave)) throw e;
    return { error: e };
  }
  return { orden: ordenadas.orden };
}

// Sin índice: las partes solas, ordenadas por su cabecera; la copia se acepta solo si el sello del flujo cuadra. Como
// las partes no dicen cuántas son, una copia cortada (le faltan las últimas) parece completa: cada una se descifra entera
// SIN escribir nada antes de preguntarle al dueño, y con aceptarAnterior una cortada o dañada deja probar la anterior.
async function elegirSinIndice({ partes, llaves, aceptarAnterior, alElegir, ahora, senal, alAvanzar, formatoNuevo }) {
  const grupos = [];
  for (const [copia, lista] of partes) {
    const uno = lista.find(p => p.n === 1);
    let cabecera = null;
    if (uno) { try { cabecera = cabeceraDelFlujo(uno.ruta); } catch { cabecera = null; } }
    grupos.push({ copia, lista, cabecera, fecha: cabecera ? Date.parse(cabecera.creada) || 0 : -1 });
  }
  if (!grupos.length) throw new ErrorCopias(formatoNuevo ? 'formato_nuevo' : 'sin_indice');
  // Solo las copias para ESTA clave (la huella del receptor viene en la cabecera del flujo); una sin parte 1 se queda
  // (dirá falta_parte 1).
  const mias = grupos.filter(g => !g.cabecera || g.cabecera.receptor === llaves.huella);
  if (!mias.length) throw new ErrorCopias('clave_no_es_de_esta_copia', { receptor: String(grupos[0].cabecera?.receptor ?? '').slice(0, 8) });
  mias.sort((a, b) => b.fecha - a.fecha);
  let hayMasNueva = null;
  let primerProblema = null;
  for (const g of mias) {
    const ordenadas = g.cabecera ? await ordenarPartes(g.lista, null) : { falta: 1 };
    let error = ordenadas.orden ? null : errorDePartes(ordenadas, g.copia);
    if (!error) {
      const prueba = { indice: null, resumen: null, orden: ordenadas.orden, info: { copia: g.copia } };
      alAvanzar({ paso: 'revisando', copia: g.copia });
      try {
        await aplicarCopia({ elegida: prueba, llaves, destino: null, ajustar: false, senal, ahora, alAvanzar: () => {} });
      } catch (e) {
        if (!(e instanceof ErrorCopias) || !SE_PRUEBA_LA_ANTERIOR.includes(e.clave)) throw e;
        error = e;
      }
    }
    if (error) {
      if (!aceptarAnterior) throw error;
      primerProblema ??= error;
      hayMasNueva ??= { copia: g.copia, creada: g.cabecera?.creada ?? null };
      continue;
    }
    // Sin índice no hay cadena: si esta copia dice ser del futuro, se nombra la siguiente por fecha (la consola pregunta).
    const siguiente = mias.find(o => o !== g && o.cabecera && o.fecha < g.fecha);
    const futura = g.fecha > ahora + MARGEN_FUTURO_MS;
    const otraCandidata = futura && !hayMasNueva && siguiente
      ? { copia: siguiente.copia, creada: siguiente.cabecera.creada, servidor: siguiente.cabecera.servidor ?? null, motivo: 'fecha_mas_vieja', futura: false } : null;
    const info = datosParaElegir({ copia: g.copia, creada: g.cabecera.creada, servidor: g.cabecera.servidor, anterior: null, hayMasNueva, ahora, otraCandidata });
    await preguntar(alElegir, info);
    const bytes = ordenadas.orden.reduce((s, p) => s + p.cabecera.largo, 0);
    return { indice: null, resumen: null, orden: ordenadas.orden, info, bytes };
  }
  throw primerProblema ?? new ErrorCopias('falta_parte', { n: 1, copia: mias[0].copia });
}

async function elegirDeTelegram({ fuente, llavero, base, carpetaTrabajo, tope, senal, alElegir, ahora, alAvanzar }) {
  if (!carpetaTrabajo) throw new ErrorCopias('fuente_no_valida');
  const cred = crearCredencial({ token: String(fuente.token ?? '').trim(), base });
  const yo = await TELEGRAM.probar(cred, { senal });
  if (yo.motivo !== 'ok' && yo.motivo !== 'bot_ocupado') await deTelegram(cred, yo.motivo);
  // El índice: el que el dueño guardó de su chat (fuente.indiceTexto, la consola lo lee de --indice=<archivo>), uno por
  // su id, o el mensaje FIJADO en el chat (el de la última copia que quedó fijada).
  let texto;
  const delFijado = fuente.indiceTexto == null && !fuente.indiceArchivoId;
  if (fuente.indiceTexto != null) {
    texto = String(fuente.indiceTexto);
    if (Buffer.byteLength(texto) > INDICE_MAXIMO) throw new ErrorCopias('indice_danado');
  } else {
    let archivoId = fuente.indiceArchivoId ?? null;
    if (!archivoId) {
      const f = await TELEGRAM.fijado(cred, { destino: fuente.chatId, senal });
      await deTelegram(cred, f.motivo);
      if (!f.documento) throw new ErrorCopias('sin_indice');
      archivoId = f.documento.archivoId;
    }
    texto = (await bajarATexto(cred, archivoId, INDICE_MAXIMO, senal)).toString('utf8');
  }
  if (!pareceIndice(texto)) throw new ErrorCopias('sin_indice');
  const llaves = await llavero.para(() => candidatosDe([{ ruta: null, texto }], null));
  // Un índice que no se entiende (cualquiera con el token puede fijar un archivo) no tumba con un error raro: «no hay
  // índice» con su motivo; uno de otra clave o tocado se nombra.
  const deIndices = indicesDeLaClave([{ ruta: null, texto }], llaves);
  if (!deIndices.autenticos.length) {
    if (deIndices.problema.clave === 'indice_danado') throw new ErrorCopias('sin_indice', { indice: 'danado' });
    throw deIndices.problema;
  }
  const d = deIndices.autenticos[0].datos;
  if (d.bot !== yo.cuenta?.id) throw new ErrorCopias('otro_bot');
  if (d.partes.some(p => !p.telegram)) throw new ErrorCopias('falta_parte', { n: d.partes.find(p => !p.telegram).n, copia: d.copia });
  const resumen = await resumenDe(d, llaves);
  const fijadaVieja = delFijado && ahora - Date.parse(d.creada) > HORAS_FIJADA_VIEJA * HORA;
  const info = datosParaElegir({ copia: d.copia, creada: d.creada, servidor: d.servidor, anterior: d.anterior, hayMasNueva: null, ahora, fijadaVieja });
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
    return { ruta, bytes: statSync(ruta).size, n: cabecera.n };
  });
  const ordenadas = await ordenarPartes(lista, d);
  if (!ordenadas.orden) throw errorDePartes(ordenadas, d.copia);
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
// empezarBusquedaDeChat({ token }) → { codigo, paraMostrar, esperar({ senal, hastaMs }) → { chatId, nombre, usuario,
// confirmar(texto) → true | false } }.
// Ronda 3 del equipo rojo: quien tenga el token puede leer el código del dueño y mandarlo desde SU chat. Por eso, al
// encontrar el chat, el bot le manda a ESE chat un segundo código (6 cifras) y la consola le pide al dueño que lo
// escriba (confirmar; 5 intentos): si el código le llegó a otra persona, el dueño no lo tiene.

// El chat encontrado: le manda el segundo código. → { chatId, nombre, usuario, confirmar }
async function confirmacionDe(cred, m, { senal }) {
  const segundo = crearCodigoConfirmar();
  const huella = huellaConfirmar(segundo);
  const envio = await TELEGRAM.enviarTexto(cred, { destino: m.chat.id, texto: textoConfirmarVinculo('es', { codigo: segundo }), silencioso: false, senal });
  await deTelegram(cred, envio.motivo);
  let intentos = 0;
  return {
    chatId: m.chat.id,
    nombre: m.de?.nombre ?? m.chat.nombre ?? null,
    usuario: m.de?.usuario ?? null,
    confirmar(texto) {
      if (intentos >= INTENTOS_CONFIRMAR) throw new ErrorCopias('codigo_vencido');
      intentos += 1;
      const bien = confirmarCoincide(cifrasConfirmar(texto), huella);
      if (!bien && intentos >= INTENTOS_CONFIRMAR) throw new ErrorCopias('codigo_vencido');
      return bien;
    },
  };
}
// Las mismas reglas de src/canales/vinculo.js: chat privado, no un bot, mensaje nuevo, código exacto, 5 intentos por
// chat y 50 en total.
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
      let cuenta = { total: 0, porChat: {} };
      for (;;) {
        if (senal?.aborted) throw new ErrorCopias('cancelada');
        if (ahora() > hastaMs) throw new ErrorCopias('codigo_vencido');
        const r = await TELEGRAM.recibir(cred, { desde, limite: 10, senal });
        if (r.motivo === 'ok') {
          if (r.siguiente != null) desde = r.siguiente;
          // 5 intentos por chat y 50 en total (un extraño que escribe al bot nunca vence el código del dueño).
          const visto = revisarLote(r.mensajes, { huella, desdeMs, cuenta });
          cuenta = visto.cuenta;
          if (visto.encontrado) return confirmacionDe(cred, visto.encontrado, { senal });
          if (visto.vencido) throw new ErrorCopias('codigo_vencido');
          if (r.saltado) continue; // un mensaje demasiado grande se saltó: se pregunta otra vez enseguida
        } else if (r.motivo === 'clave_no_valida' || r.motivo === 'conflicto') {
          await deTelegram(cred, r.motivo);
        }
        await new Promise(listo => setTimeout(listo, r.motivo === 'limite' ? Math.min(r.esperarMs ?? cadaMs, 60_000) : cadaMs));
      }
    },
  };
}
