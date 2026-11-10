// El ESTADO de las copias (fase 1, parte e): la clave de recuperación (solo su parte pública), la política del disco,
// los topes de intentos, las filas de cada copia y lo que muestran las pantallas. Lo usan los dos procesos: el
// trabajador (src/copias/hacer.js, que hace las copias) y el servidor web (rutas, el resumen de Administrador). Por eso
// aquí no hay red, ni foto de la base, ni archivos: solo la base y cuentas.
//  - La clave de recuperación del dueño NUNCA se guarda: de ella quedan la llave pública (para cifrar), el «sello»
//    (firma los índices; no abre nada), la huella («Clave A7F3») y el sha256 de su «verificador» (la página lo calcula
//    sola: así el servidor puede comprobar la clave sin verla).
//  - Ronda 3 del equipo rojo: el sello NUNCA queda en claro en la base. Va envuelto con la llave de las claves
//    (src/claves/almacen.js envolverDato), que nunca viaja en una copia: quien tiene solo la base (una copia vieja, una
//    foto, el archivo de antes de una migración) no puede armar una copia que parezca auténtica. Si la llave de las
//    claves cambia (otro servidor, una llave nueva), el sello no se abre: las copias se paran, copias_clave_ilegible
//    (grave) lo dice y la pantalla ofrece crear una clave nueva (o la parte 1f la vuelve a envolver con la clave del
//    dueño: reenvolverSello). El texto de la clave existe solo en la respuesta de
//    «Crear» (crearClavePendiente) y nunca entra en una fila, un registro, un aviso ni la auditoría.
//  - Nada se borra: una llave vieja queda «anterior» (las copias viejas la necesitan), una copia queda con su estado.
//  - Los errores son ErrorCopias con un código corto; las rutas los vuelven respuestas HTTP (src/api/copias.js).
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { ErrorCopias, CLAVE_SERVIDOR, ESTADOS_COPIA, CABECERA_PARTE } from './formato.js';
import { crearClave, derivar, esClaveDePrueba, hashVerificador, leerClave } from './clave.js';
import { envolverDato, abrirDato, huellaDeEnvuelto } from '../claves/almacen.js';
import { ranura } from '../tareas/tiempo.js';
import { PROGRAMAS_DEL_SISTEMA } from '../tareas/tipos.js';

export const ESTADOS_LLAVE = Object.freeze(['pendiente', 'activa', 'anterior', 'caducada']);
export const PENDIENTE_MS = 30 * 60_000; // una clave creada y no confirmada en 30 min caduca (no protege nada)
export const HORAS_COPIA_VIEJA = 30;     // sin una copia comprobada fuera del servidor en 30 h: copia_atrasada (grave)
export const DIAS_COMPROBAR_CLAVE = 90;  // cada 90 días, un recordatorio en silencio para comprobar la clave
export const CLAVE_AJUSTES = 'copias.ajustes';
// La política del disco («nunca se borra nada», decisión 3 del dueño). Ver planDeDisco.
export const DISCO = Object.freeze({ pisoMinimoMb: 2048, margenMb: 256, frenoMb: 300, fraccionEstimada: 0.6, diasAviso: 30, diasResuelve: 45 });
// Topes de intentos (para que una tormenta de errores nunca suba copias enteras sin fin). Salen de las filas: también
// sobreviven a una caída del trabajador.
export const TOPES = Object.freeze({ copiasPorTarea: 3, subidasSinExitoPorDia: 3, esperasPorCopia: 12, esperaTotalMs: 6 * 3_600_000 });
export const PROGRAMA_COPIAS = PROGRAMAS_DEL_SISTEMA.find(p => p.programa === 'copias.hacer');
// Ronda 2 del equipo rojo: una copia (o una clave, o un chat) con una fecha más de 5 min DESPUÉS de ahora es de un reloj
// que iba adelantado y se corrigió: nunca cuenta como «reciente» ni como la última copia (si no, las copias de cada
// noche se apagarían en silencio todo lo que se adelantó el reloj, con las pantallas en verde).
export const MARGEN_FUTURO_MS = 5 * 60_000;
// Cuántas copias (las últimas por id) se miran para saber su fecha creíble (cada noche hace 1–3).
export const VENTANA_CREIBLE = 400;

const MB = 1024 * 1024;
const HORA = 3_600_000;
const DIA = 24 * HORA;
const iso = ms => new Date(ms).toISOString();
const RD = -4 * HORA;

function leerAjuste(db, clave) {
  const fila = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!fila) return null;
  try { return JSON.parse(fila.valor); } catch { return null; }
}

function guardarAjuste(db, clave, valor, ahora) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(ahora));
}

// Los ajustes de las copias ({ local: true } por defecto: las copias del servidor también llevan candado).
export function ajustesCopias(db) {
  const a = leerAjuste(db, CLAVE_AJUSTES);
  return { local: a?.local !== false };
}

// El id de este servidor (va en cada copia). Se crea UNA vez; tras restaurar, ajustarTrasRestaurar pone uno nuevo.
export function servidorId(db, { ahora = Date.now() } = {}) {
  const a = leerAjuste(db, CLAVE_SERVIDOR);
  if (a?.id) return String(a.id);
  const id = randomUUID();
  guardarAjuste(db, CLAVE_SERVIDOR, { id, creado: iso(ahora) }, ahora);
  return id;
}

// El id de este servidor SIN crearlo (para leer desde el servidor web): null si todavía no hay ninguno.
export function servidorActual(db) {
  const a = leerAjuste(db, CLAVE_SERVIDOR);
  return a?.id ? String(a.id) : null;
}

// ---------- La clave de recuperación ----------

const USO_SELLO = 'copias_sello';
const refSello = publica => `copias-llave|${publica}`;

// Envuelve el sello (hex) de una llave con la llave de las claves. Lanza ErrorCopias('almacen_no_disponible').
function envolverSello(db, config, publica, selloHex) {
  try {
    return envolverDato(db, config, selloHex, { ref: refSello(publica), uso: USO_SELLO });
  } catch {
    throw new ErrorCopias('almacen_no_disponible');
  }
}

// El sello de una llave (Buffer de 32 bytes: quien lo usa lo borra con fill(0)), o null si no se puede abrir (la llave de
// las claves cambió o falta). Nunca un sello en claro: uno así (de antes de la ronda 3) no se acepta.
export function selloDe(config, llave) {
  const texto = llave ? abrirDato(config, llave.sello, { ref: refSello(llave.publica), uso: USO_SELLO }) : null;
  if (!texto || !/^[0-9a-f]{64}$/.test(texto)) return null;
  return Buffer.from(texto, 'hex');
}

// ¿Se puede abrir el sello con la llave de las claves de ahora? (sin abrir nada: por la huella) huellaLlave: la de
// estadoLlave(config) o null.
export function selloLegible(llave, huellaLlave) {
  return Boolean(llave && huellaLlave && huellaDeEnvuelto(llave.sello) === huellaLlave);
}

// Fase 1, parte f: lo que falta volver a poner en una base RECUPERADA de una copia (la marca «claves.restaurada» la deja
// ajustarTrasRestaurar). Solo lee. huellaLlave: la de la llave de las claves de este servidor (o null si no hay).
//  - token: el token del bot que traía la copia no se puede leer aquí (hay que revocarlo y pegar el NUEVO);
//  - claves: alguna clave de IA activa que traía la copia no se puede leer aquí (se pega otra vez);
//  - clave: la clave de recuperación que traía ya no sirve en este servidor (se crea una nueva).
// → null si la base no es recuperada o si ya no falta nada.
export function pendientesTrasRecuperar(db, { huellaLlave = null, usos = {} } = {}) {
  let marca;
  try { marca = JSON.parse(db.prepare("SELECT valor FROM ajustes WHERE clave = 'claves.restaurada'").get()?.valor ?? 'null'); } catch { marca = null; }
  if (!marca || !Array.isArray(marca.huellas)) return null;
  const activas = db.prepare("SELECT uso, llave_huella FROM secretos WHERE estado = 'activa'").all();
  const ilegible = grupo => activas.some(f => usos[f.uso]?.grupo === grupo && (!huellaLlave || f.llave_huella !== huellaLlave));
  const llave = llaveActiva(db);
  const r = { en: typeof marca.en === 'string' ? marca.en : null, token: ilegible('avisos'), claves: ilegible('ia'), clave: Boolean(llave) && !selloLegible(llave, huellaLlave) };
  return r.token || r.claves || r.clave ? r : null;
}

// Para la parte 1f (y la consola): con la clave de recuperación del dueño, vuelve a envolver el sello de SU llave con la
// llave de las claves de ESTE servidor (después de restaurar en uno nuevo). Nunca guarda la clave. → { huella } o lanza
// ErrorCopias('clave_no_es_de_esta_copia' | 'almacen_no_disponible').
export function reenvolverSello(db, config, { clave, ahora = Date.now() }) {
  const semilla = leerClave(clave);
  let d;
  try { d = derivar(semilla); } finally { semilla.fill(0); }
  try {
    const publica = d.publica.toString('base64url');
    const filas = db.prepare("SELECT * FROM copias_llaves WHERE publica = ? AND estado IN ('activa', 'anterior', 'pendiente')").all(publica);
    if (!filas.length) throw new ErrorCopias('clave_no_es_de_esta_copia', { receptor: d.huella });
    const envuelto = envolverSello(db, config, publica, d.sello.toString('hex'));
    enTransaccion(db, () => {
      for (const f of filas) db.prepare('UPDATE copias_llaves SET sello = ? WHERE id = ?').run(envuelto, f.id);
      auditar(db, { usuarioId: null, accion: 'clave_recuperacion_reenvuelta', detalle: `Clave ${d.huella}` });
      resolverAviso(db, 'copias_clave_ilegible', ahora);
    });
    return { huella: d.huella };
  } finally {
    d.sello.fill(0);
    d.verificador.fill(0);
  }
}

export function llaveActiva(db) {
  return db.prepare("SELECT * FROM copias_llaves WHERE estado = 'activa' ORDER BY id DESC LIMIT 1").get() ?? null;
}

export function llavePorId(db, id) {
  return db.prepare('SELECT * FROM copias_llaves WHERE id = ?').get(Number(id)) ?? null;
}

// La que espera confirmación (no vencida), o null. Las vencidas quedan «caducada» la próxima vez que se escribe.
export function llavePendiente(db, ahora = Date.now()) {
  const p = db.prepare("SELECT * FROM copias_llaves WHERE estado = 'pendiente' ORDER BY id DESC LIMIT 1").get();
  if (!p || (p.vence_en && Date.parse(p.vence_en) <= ahora)) return null;
  return p;
}

// «Crear mi clave de recuperación»: crea una clave al azar y guarda SOLO su parte pública, como «pendiente». Devuelve
// { clave, huella, expira } — la única vez que el texto de la clave sale del servidor (la respuesta va con no-store).
export function crearClavePendiente(db, { config, usuarioId = null, ahora = Date.now() } = {}) {
  if (!config) throw new ErrorCopias('almacen_no_disponible');
  const { texto, semilla } = crearClave();
  let d;
  try { d = derivar(semilla); } finally { semilla.fill(0); }
  try {
    const publica = d.publica.toString('base64url');
    if (esClaveDePrueba(publica)) throw new ErrorCopias('clave_de_prueba'); // imposible con 128 bits al azar, pero se revisa
    const sello = envolverSello(db, config, publica, d.sello.toString('hex'));
    const verificador = createHash('sha256').update(d.verificador).digest('hex');
    const vence = ahora + PENDIENTE_MS;
    enTransaccion(db, () => {
      db.prepare("UPDATE copias_llaves SET estado = 'caducada' WHERE estado = 'pendiente'").run();
      db.prepare(`INSERT INTO copias_llaves (formato, publica, sello, huella, verificador, estado, creada_por, creada_en, vence_en)
        VALUES (1, ?, ?, ?, ?, 'pendiente', ?, ?, ?)`).run(publica, sello, d.huella, verificador, usuarioId, iso(ahora), iso(vence));
      auditar(db, { usuarioId, accion: 'clave_recuperacion_creada', detalle: `Clave ${d.huella} (falta confirmarla)` });
    });
    return { clave: texto, huella: d.huella, expira: iso(vence) };
  } finally {
    d.sello.fill(0);
    d.verificador.fill(0);
  }
}

function mismoHash(a, b) {
  const x = Buffer.from(String(a ?? ''), 'hex');
  const y = Buffer.from(String(b ?? ''), 'hex');
  return x.length === 32 && y.length === 32 && timingSafeEqual(x, y);
}

// «Escríbela otra vez»: la página calcula el verificador de lo que escribió el dueño y manda SOLO eso (64 hex).
// Errores: verificador_formato · sin_pendiente · clave_no_coincide · clave_de_prueba. → { huella, desde }
export function confirmarClave(db, { verificador, usuarioId = null, ahora = Date.now() }) {
  const hash = hashVerificador(verificador);
  if (!hash) throw new ErrorCopias('verificador_formato');
  const r = enTransaccion(db, () => {
    const p = db.prepare("SELECT * FROM copias_llaves WHERE estado = 'pendiente' ORDER BY id DESC LIMIT 1").get();
    if (!p) throw new ErrorCopias('sin_pendiente');
    if (p.vence_en && Date.parse(p.vence_en) <= ahora) {
      db.prepare("UPDATE copias_llaves SET estado = 'caducada' WHERE id = ?").run(p.id);
      return { caducada: true };
    }
    if (!mismoHash(hash, p.verificador)) throw new ErrorCopias('clave_no_coincide');
    // La clave de prueba (escrita en test/, pública) nunca puede ser la de un servidor.
    if (esClaveDePrueba(p.publica)) throw new ErrorCopias('clave_de_prueba');
    const momento = iso(ahora);
    db.prepare("UPDATE copias_llaves SET estado = 'anterior', reemplazada_en = ? WHERE estado = 'activa'").run(momento);
    db.prepare("UPDATE copias_llaves SET estado = 'activa', confirmada_en = ?, vence_en = NULL WHERE id = ?").run(momento, p.id);
    auditar(db, { usuarioId, accion: 'clave_recuperacion_confirmada', detalle: `Clave ${p.huella}` });
    resolverAviso(db, 'copias_sin_clave', ahora);
    resolverAviso(db, 'copias_clave_ilegible', ahora);
    return { huella: p.huella, desde: momento };
  });
  if (r.caducada) throw new ErrorCopias('sin_pendiente');
  return r;
}

// La última copia buena hecha con esa llave: { bytes, tablas } (lo que dice «Comprobar mi clave»).
function ultimaCopiaDeLlave(db, llaveId) {
  const c = db.prepare("SELECT bytes, tablas FROM copias WHERE llave_id = ? AND estado IN ('verificada', 'solo_local') ORDER BY id DESC LIMIT 1").get(llaveId);
  return c ? { bytes: c.bytes, tablas: c.tablas } : null;
}

// «Comprobar mi clave»: ¿es la de ahora, una anterior, o ninguna? (solo con el verificador). Anota comprobada_en.
export function comprobarClave(db, { verificador, ahora = Date.now() }) {
  const hash = hashVerificador(verificador);
  if (!hash) throw new ErrorCopias('verificador_formato');
  const llaves = db.prepare("SELECT * FROM copias_llaves WHERE estado IN ('activa', 'anterior') ORDER BY id DESC").all();
  const encontrada = llaves.find(l => mismoHash(hash, l.verificador));
  if (!encontrada) return { resultado: 'no_es', huella: null, desde: null, hasta: null, ultimaCopia: null };
  enTransaccion(db, () => {
    db.prepare('UPDATE copias_llaves SET comprobada_en = ? WHERE id = ?').run(iso(ahora), encontrada.id);
    if (encontrada.estado === 'activa') resolverAviso(db, 'copias_comprobar_clave', ahora);
  });
  return {
    resultado: encontrada.estado === 'activa' ? 'actual' : 'anterior',
    huella: encontrada.huella,
    desde: encontrada.confirmada_en,
    hasta: encontrada.reemplazada_en,
    ultimaCopia: ultimaCopiaDeLlave(db, encontrada.id),
  };
}

// ---------- El disco («nunca se borra nada») ----------
// Pura. libreMb: disco libre de los DATOS (donde están la base y su -wal); libreCopiasMb: el del disco de la carpeta de
// las copias (si no se pasa, es el mismo); mismoDisco: false si las copias están en otro disco; baseMb/walMb: la base y su
// -wal; ultimaCopiaMb: lo que midió la última copia.
//  - piso = max(2 GB, 2 × base + wal + 256 MB): espacio para la copia obligatoria de antes de una migración futura, para
//    los picos del -wal y para revisar una restauración (1f). En el disco de los datos.
//  - local: se guarda una copia en el servidor solo si después queda al menos el piso (copias en el mismo disco) o al
//    menos 256 MB en el disco de las copias (copias en otro disco).
//  - freno: con menos de 300 MB libres para los datos el trabajador no toma copias (el freno «poco_disco» de la parte c).
// Una medida que no se pudo leer (null) nunca frena (como en la parte c).
export function planDeDisco({ libreMb = null, libreCopiasMb, mismoDisco = true, baseMb = 0, walMb = 0, ultimaCopiaMb = null, ajusteLocal = true } = {}) {
  const base = Math.max(0, Number(baseMb) || 0);
  const wal = Math.max(0, Number(walMb) || 0);
  const estimadoMb = ultimaCopiaMb != null && Number.isFinite(Number(ultimaCopiaMb)) ? Number(ultimaCopiaMb) : base * DISCO.fraccionEstimada;
  const pisoDatosMb = Math.max(DISCO.pisoMinimoMb, 2 * base + wal + DISCO.margenMb);
  const otroDisco = mismoDisco === false;
  const medido = libreMb != null && Number.isFinite(Number(libreMb));
  const libre = medido ? Number(libreMb) : null;
  const copiasMb = libreCopiasMb === undefined ? libreMb : libreCopiasMb;
  const copiasMedido = copiasMb != null && Number.isFinite(Number(copiasMb));
  const libreCopias = copiasMedido ? Number(copiasMb) : null;
  const pisoMb = otroDisco ? DISCO.margenMb : pisoDatosMb;
  const freno = medido && libre < DISCO.frenoMb;
  const cabe = !copiasMedido || libreCopias - estimadoMb >= pisoMb;
  const local = ajusteLocal !== false && cabe && !freno;
  const motivo = ajusteLocal === false ? 'apagado' : freno ? 'freno' : !cabe ? 'disco' : null;
  return {
    estimadoMb: Math.round(estimadoMb * 100) / 100, pisoMb: Math.round(pisoMb), libreMb: copiasMedido ? libreCopias : libre, libreDatosMb: libre,
    otroDisco, local, freno, motivo,
  };
}

// Cuántos días alcanza el disco para guardar copias aquí, al ritmo de las últimas 7 copias locales (null si no se sabe).
export function diasDeDisco(db, { libreMb, pisoMb }) {
  if (libreMb == null) return null;
  const f = db.prepare(`SELECT AVG(bytes) AS promedio, COUNT(*) AS n FROM (SELECT bytes FROM copias WHERE local = 1 AND bytes > 0
    AND estado IN ('verificada', 'solo_local') ORDER BY id DESC LIMIT 7)`).get();
  if (!f?.n || !(f.promedio > 0)) return null;
  const mbPorNoche = f.promedio / MB;
  return Math.max(0, Math.floor((libreMb - pisoMb) / mbPorNoche));
}

// Las copias guardadas en ESTE servidor, desde las filas (nunca mirando la carpeta: crece cada noche). Las de un servidor
// anterior (una base restaurada en un servidor nuevo trae sus filas, pero sus archivos se quedaron allá) van aparte en
// «anterior»: nunca se cuentan como si estuvieran aquí. Se cuenta desde «copias» (una fila por copia), no desde
// copia_partes (una fila por parte, ~50 por noche: con años de copias, una pantalla tardaría demasiado): las copias
// terminadas guardan su total; solo las que quedaron a medias se cuentan parte por parte (por su índice: CROSS JOIN
// hace que SQLite empiece por «copias», nunca recorriendo todas las partes).
export function copiasLocales(db) {
  const servidor = servidorActual(db);
  const vacio = () => ({ copias: 0, archivos: 0, bytes: 0 });
  const aqui = vacio();
  const anterior = vacio();
  const sumar = (destino, f) => { destino.copias += f.copias ?? 0; destino.archivos += f.archivos ?? 0; destino.bytes += f.bytes ?? 0; };
  const terminadas = db.prepare(`SELECT (servidor IS NOT NULL AND servidor = ?) AS aqui, COUNT(*) AS copias, COALESCE(SUM(partes), 0) AS archivos,
    COALESCE(SUM(bytes + partes * ?), 0) AS bytes FROM copias WHERE local = 1 AND estado IN ('verificada', 'solo_local') AND partes > 0 GROUP BY 1`).all(servidor, CABECERA_PARTE);
  const medias = db.prepare(`SELECT (c.servidor IS NOT NULL AND c.servidor = ?) AS aqui, COUNT(DISTINCT p.copia_id) AS copias, COUNT(*) AS archivos,
    COALESCE(SUM(p.bytes), 0) AS bytes FROM copias c CROSS JOIN copia_partes p ON p.copia_id = c.id
    WHERE c.local = 1 AND NOT (c.estado IN ('verificada', 'solo_local') AND c.partes > 0) AND p.archivo_local IS NOT NULL GROUP BY 1`).all(servidor);
  for (const f of [...terminadas, ...medias]) sumar(f.aqui === 1 ? aqui : anterior, f);
  const mb = b => Math.round((b / MB) * 10) / 10;
  return {
    copias: aqui.copias, archivos: aqui.archivos, mb: mb(aqui.bytes), bytes: aqui.bytes,
    anterior: anterior.copias ? { copias: anterior.copias, archivos: anterior.archivos, mb: mb(anterior.bytes), bytes: anterior.bytes } : null,
  };
}

// ---------- Topes de intentos ----------
// El comienzo del día de RD (UTC−4 todo el año) que contiene «ahora».
export function inicioDiaRd(ahora) {
  return Math.floor((ahora + RD) / DIA) * DIA - RD;
}

// { copiasDeTarea, subidasSinExitoHoy }. Una copia «subida sin éxito» subió al menos una parte y no llegó a
// comprobarse (las que sí se comprobaron no cuentan: el dueño puede pedir varias copias buenas en un día).
export function topesDeIntento(db, { tareaId, ahora = Date.now() }) {
  const copiasDeTarea = db.prepare('SELECT COUNT(*) AS n FROM copias WHERE tarea_id = ?').get(tareaId).n;
  const subidasSinExitoHoy = db.prepare(`SELECT COUNT(*) AS n FROM copias c WHERE c.empezada_en >= ? AND c.estado <> 'verificada'
    AND EXISTS (SELECT 1 FROM copia_partes p WHERE p.copia_id = c.id AND p.subida_en IS NOT NULL)`).get(iso(inicioDiaRd(ahora))).n;
  return { copiasDeTarea, subidasSinExitoHoy };
}

// ---------- Filas de las copias (escrituras cortas: el trabajador las hace dentro de ctx.escribir) ----------
const CAMPOS_COPIA = new Set(['estado', 'local', 'fuera', 'partes', 'bytes', 'sha256', 'volcado_bytes', 'volcado_sha256', 'tablas', 'filas',
  'migracion', 'version', 'sellado', 'indice_sha256', 'indice_mensaje_id', 'indice_archivo_id', 'fijada', 'motivo', 'detalle', 'escrita_en',
  'subida_en', 'verificada_en', 'terminada_en']);
const CAMPOS_PARTE = new Set(['archivo_local', 'mensaje_id', 'archivo_id', 'archivo_id_unico', 'subida_en', 'verificada_en', 'intentos', 'ultimo_error']);

export function empezarCopia(db, d) {
  const r = db.prepare(`INSERT INTO copias (copia, formato, origen, tarea_id, estado, llave_id, receptor, local, fuera, canal_id, secreto_id, cuenta_id,
      servidor, version, empezada_en)
    VALUES (?, 1, ?, ?, 'haciendo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.copia, d.origen === 'manual' ? 'manual' : 'noche', d.tareaId ?? null, d.llaveId, d.receptor, d.local ? 1 : 0, d.fuera ? 1 : 0,
      d.canalId ?? null, d.secretoId ?? null, d.cuentaId ?? null, d.servidor ?? null, d.version ?? null, d.empezadaEn);
  return Number(r.lastInsertRowid);
}

export function actualizarCopia(db, id, campos) {
  const claves = Object.keys(campos).filter(c => CAMPOS_COPIA.has(c));
  if (!claves.length) return false;
  if (campos.estado != null && !ESTADOS_COPIA.includes(campos.estado)) throw new ErrorCopias('estado_no_valido');
  const valor = v => (typeof v === 'boolean' ? (v ? 1 : 0) : v);
  return db.prepare(`UPDATE copias SET ${claves.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...claves.map(c => valor(campos[c])), id).changes > 0;
}

export function guardarParte(db, d) {
  const r = db.prepare(`INSERT INTO copia_partes (copia_id, n, desde, bytes, sha256, archivo_local, mensaje_id, archivo_id, archivo_id_unico, subida_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.copiaId, d.n, d.desde, d.bytes, d.sha256, d.archivoLocal ?? null, d.mensajeId ?? null, d.archivoId ?? null, d.idUnico ?? null, d.subidaEn ?? null);
  return Number(r.lastInsertRowid);
}

export function actualizarParte(db, id, campos) {
  const claves = Object.keys(campos).filter(c => CAMPOS_PARTE.has(c));
  if (!claves.length) return false;
  return db.prepare(`UPDATE copia_partes SET ${claves.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...claves.map(c => campos[c]), id).changes > 0;
}

export function partesDe(db, copiaId) {
  return db.prepare('SELECT * FROM copia_partes WHERE copia_id = ? ORDER BY n, id').all(copiaId);
}

// La copia más nueva que cumple «donde» (SQL sobre copias), por su fecha CREÍBLE (o null). La fecha de una copia es la de
// su FOTO (empezada_en): una copia a medias que terminó días después sigue siendo de su foto. Pero el reloj puede ir
// adelantado (un servidor que despertó con la hora mal, y después la hora se corrigió): por eso
//  - una copia con fecha más de 5 min después de «ahora» es del futuro: no cuenta;
//  - las filas se numeran en orden (copias.id): una copia hecha DESPUÉS (id mayor) con una fecha más vieja prueba que
//    la fecha de esta no es de verdad, y su fecha creíble baja a esa. Así una copia del reloj adelantado nunca vuelve a
//    parecer «la más nueva» cuando el reloj de verdad llega a su fecha.
// Devuelve la fila con efectivaMs (la fecha creíble, en ms).
export function ultimaCreible(db, { ahora = Date.now(), donde = '1', valores = [] } = {}) {
  const tope = ahora + MARGEN_FUTURO_MS;
  const todas = db.prepare('SELECT id, empezada_en FROM copias ORDER BY id DESC LIMIT ?').all(VENTANA_CREIBLE);
  const creible = new Map();
  let menorDespues = Infinity;
  for (const c of todas) {
    const ms = Date.parse(c.empezada_en);
    const propia = Number.isFinite(ms) ? ms : -Infinity;
    creible.set(c.id, Math.min(propia, menorDespues));
    menorDespues = Math.min(menorDespues, propia);
  }
  const desdeId = todas.length ? todas[todas.length - 1].id : 0;
  let mejor = null;
  for (const c of db.prepare(`SELECT * FROM copias WHERE id >= ? AND (${donde}) ORDER BY id DESC`).all(desdeId, ...valores)) {
    const efectiva = creible.get(c.id);
    if (efectiva == null || !Number.isFinite(efectiva) || efectiva > tope) continue;
    if (!mejor || efectiva > mejor.efectivaMs) mejor = { ...c, efectivaMs: efectiva };
  }
  if (mejor || todas.length < VENTANA_CREIBLE) return mejor;
  // Más atrás de la ventana (cientos de copias sin ninguna que sirva): la más nueva por fecha que no es del futuro.
  const vieja = db.prepare(`SELECT * FROM copias WHERE id < ? AND empezada_en <= ? AND (${donde}) ORDER BY empezada_en DESC, id DESC LIMIT 1`)
    .get(desdeId, iso(Math.min(tope, menorDespues)), ...valores);
  return vieja ? { ...vieja, efectivaMs: Date.parse(vieja.empezada_en) } : null;
}

// La última copia comprobada FUERA del servidor (o null), por su fecha creíble (ver ultimaCreible).
export function ultimaFuera(db, ahora = Date.now()) {
  return ultimaCreible(db, { ahora, donde: "estado = 'verificada' AND fuera = 1" });
}

// La última copia comprobada fuera del servidor por ORDEN (id), sin mirar la fecha: la que fijó su índice al último.
export function ultimaFueraPorId(db) {
  return db.prepare("SELECT * FROM copias WHERE estado = 'verificada' AND fuera = 1 ORDER BY id DESC LIMIT 1").get() ?? null;
}

// Las copias con una fecha del futuro (más de 5 min después de ahora) → { n, hasta } (hasta: la fecha más lejana).
export function copiasDelFuturo(db, ahora = Date.now()) {
  const f = db.prepare('SELECT COUNT(*) AS n, MAX(empezada_en) AS hasta FROM copias WHERE empezada_en > ?').get(iso(ahora + MARGEN_FUTURO_MS));
  return { n: f.n, hasta: f.hasta ?? null };
}

// Abre (o cierra) el aviso copias_fecha_futura: una copia tiene una fecha del futuro (el reloj del servidor iba
// adelantado). Las copias de cada noche siguen igual; el aviso dice que revisen la hora del servidor. Síncrona.
export function revisarFechasFuturas(db, ahora = Date.now()) {
  const f = copiasDelFuturo(db, ahora);
  if (f.n > 0) {
    const dias = Math.max(0, Math.round(((Date.parse(f.hasta) - ahora) / DIA) * 10) / 10);
    abrirAviso(db, { clave: 'copias_fecha_futura', nivel: 'atencion', detalle: { n: f.n, dias }, ahora });
  } else resolverAviso(db, 'copias_fecha_futura', ahora);
  return f;
}

// La copia de la noche no se hace si ya hay una comprobada de hace menos de esto (src/copias/hacer.js la salta).
export const RECIENTE_MS = 6 * HORA;

// Cuándo toca la próxima copia de la noche (ISO): la ranura de hoy si todavía no tiene tarea, si no la de mañana.
// Revisión final: si esa copia se va a saltar porque ya hay una comprobada de hace menos de 6 h (la misma regla que
// hacer.js, con la fecha creíble de la foto), la próxima es la de la noche siguiente: nunca se promete una que no se hará.
export function proximaCopia(db, ahora = Date.now()) {
  const r = ranura(PROGRAMA_COPIAS, ahora);
  const hecha = db.prepare('SELECT 1 FROM tareas WHERE clave_unica = ?').get(r.clave);
  const ms = x => (typeof x === 'number' ? x : Date.parse(x));
  const siguiente = ms(r.siguiente);
  const candidatas = hecha ? [siguiente, siguiente + DIA] : [Math.max(ms(r.inicio), ahora), siguiente, siguiente + DIA];
  const canal = db.prepare("SELECT 1 FROM canales WHERE tipo = 'telegram' AND proposito = 'avisos_dueno' AND estado = 'activo' LIMIT 1").get();
  const reciente = ultimaCreible(db, { ahora, donde: "estado = 'verificada' OR (estado = 'solo_local' AND ? = 0)", valores: [canal ? 1 : 0] });
  const proxima = candidatas.find(c => !(reciente && reciente.efectivaMs >= c - RECIENTE_MS)) ?? candidatas.at(-1);
  return iso(proxima);
}

// La tarea de copia viva (lista, en curso o por revisar), o null.
export function tareaDeCopiaViva(db) {
  return db.prepare("SELECT * FROM tareas WHERE tipo = 'copias.hacer' AND estado IN ('lista', 'en_curso', 'revisar') ORDER BY id DESC LIMIT 1").get() ?? null;
}

// La copia que se está haciendo y por dónde va: { paso, n, de } (de: null cuando todavía no se sabe el total).
export function copiaEnCurso(db) {
  const t = tareaDeCopiaViva(db);
  if (!t) return null;
  let punto = null;
  try { punto = t.punto ? JSON.parse(t.punto) : null; } catch { punto = null; }
  const paso = punto?.paso ?? 'preparar';
  const c = punto?.copiaId ? db.prepare('SELECT * FROM copias WHERE id = ?').get(punto.copiaId) : null;
  if (!c || !['haciendo', 'escrita', 'subida'].includes(c.estado)) return { paso: 'preparar', n: null, de: null, estado: t.estado };
  const cuenta = sql => db.prepare(`SELECT COUNT(*) AS n FROM copia_partes WHERE copia_id = ? ${sql}`).get(c.id).n;
  const de = c.partes > 0 ? c.partes : null;
  if (paso === 'generar') return { paso, n: cuenta(''), de: null, estado: t.estado };
  if (paso === 'subir') return { paso, n: cuenta('AND archivo_id IS NOT NULL'), de, estado: t.estado };
  if (paso === 'verificar') return { paso, n: cuenta('AND verificada_en IS NOT NULL'), de, estado: t.estado };
  return { paso, n: de, de, estado: t.estado };
}

// Revisión final: una copia que NO se está haciendo en este momento dice por qué espera, para que la pantalla nunca diga
// «empieza en un momento» de una que espera 30 min tras un fallo de Telegram. tomas: cuántas veces se empezó (0 = nunca:
// de verdad en la fila); motivo: el último error (si el último paso falló) o el motivo de la espera; disponibleEn: cuándo
// se intenta otra vez; revisar: una persona tiene que mirarla (Administrador → Trabajo).
const CODIGO_CORTO = /^[a-z_]{1,60}(?::[a-z0-9_]{1,40})?$/;
function esperandoPublico(enCurso, tarea, ahora) {
  const codigo = texto => (typeof texto === 'string' && CODIGO_CORTO.test(texto) ? texto : texto ? 'otro' : null);
  const motivo = tarea.fallos_seguidos > 0 ? codigo(tarea.ultimo_error) : codigo(tarea.motivo_espera);
  const ms = Date.parse(tarea.disponible_en ?? '');
  return {
    paso: enCurso.paso, n: enCurso.n, de: enCurso.de, esperando: true, tomas: Number(tarea.tomas) || 0, intento: (Number(tarea.fallos_seguidos) || 0) + 1,
    maxIntentos: Number(tarea.max_fallos) || null, motivo, disponibleEn: Number.isFinite(ms) && ms > ahora ? tarea.disponible_en : null, revisar: tarea.estado === 'revisar',
  };
}

function copiaPublica(c) {
  return {
    fecha: c.empezada_en, empezada: c.empezada_en, comprobada: c.verificada_en ?? null, origen: c.origen, bytes: c.bytes, partes: c.partes,
    local: c.local === 1, fuera: c.fuera === 1, estado: c.estado, motivo: c.motivo ?? null, fijada: c.fijada === 1, tablas: c.tablas,
  };
}

// ¿Hay que avisar «copia atrasada»? (lo evalúa el servidor web: src/canales/avisador.js). Regla: hay clave activa Y un
// chat de Telegram unido Y pasaron más de 30 h desde lo último de: confirmar la clave, unir el chat, la FOTO de la última
// copia comprobada fuera (nunca la hora en que se comprobó: una copia de hace 3 días comprobada hoy sigue atrasada).
// Así no hay una falsa alarma justo después de configurar. → { activo, detalle }
export function copiaAtrasada(db, ahora = Date.now()) {
  const llave = llaveActiva(db);
  const canal = db.prepare("SELECT * FROM canales WHERE tipo = 'telegram' AND proposito = 'avisos_dueno' AND estado IN ('activo', 'bloqueado', 'perdido') ORDER BY id DESC LIMIT 1").get();
  if (!llave || !canal) return { activo: false, detalle: null };
  const ultima = ultimaFuera(db, ahora);
  // Una fecha del futuro (reloj adelantado) nunca cuenta: si no, «atrasada» quedaría callada todo lo que se adelantó.
  const creible = texto => { const ms = Date.parse(texto ?? ''); return Number.isFinite(ms) && ms <= ahora + MARGEN_FUTURO_MS ? ms : 0; };
  const base = Math.max(creible(llave.confirmada_en), creible(canal.vinculado_en), ultima?.efectivaMs ?? 0);
  const horas = Math.floor((ahora - base) / HORA);
  return { activo: ahora > base + HORAS_COPIA_VIEJA * HORA, detalle: { horas, desde: ultima?.empezada_en ?? null } };
}

// Para el resumen de Administrador (GET /api/admin/sistema → copias): { estado, tono, ultimaFuera, proxima, motivo }.
export function resumenCopias(db, { ahora = Date.now() } = {}) {
  const llave = llaveActiva(db);
  const canal = db.prepare("SELECT estado FROM canales WHERE tipo = 'telegram' AND proposito = 'avisos_dueno' AND estado IN ('activo', 'bloqueado', 'perdido') ORDER BY id DESC LIMIT 1").get();
  const fuera = ultimaFuera(db, ahora);
  const ultima = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 1').get();
  const reciente = fuera && ahora - fuera.efectivaMs <= HORAS_COPIA_VIEJA * HORA;
  let tono = 'bien';
  let motivo = null;
  if (!llave) { tono = 'atencion'; motivo = 'sin_clave'; }
  else if (!canal) { tono = 'atencion'; motivo = 'solo_locales'; }
  else if (ultima?.estado === 'fallida') { tono = 'mal'; motivo = 'fallo'; }
  else if (!reciente) { tono = 'mal'; motivo = 'atrasada'; }
  return {
    estado: tono, tono, motivo, proxima: proximaCopia(db, ahora),
    ultimaFuera: fuera ? { fecha: fuera.empezada_en, comprobada: fuera.verificada_en, bytes: fuera.bytes, partes: fuera.partes } : null,
    ultima: ultima ? copiaPublica(ultima) : null,
  };
}

// Todo lo que muestra Administrador → Copias (GET /api/admin/copias). Solo filas de la base y UNA medida del disco
// (libreMb, que pasa quien llama): nunca mira la carpeta de las copias.
export function estadoCopias(db, { ahora = Date.now(), libreMb = null, libreCopiasMb, mismoDisco = true, baseMb = 0, walMb = 0, telegram = null, modoSeguro = false, trabajador = true, huellaLlave = null } = {}) {
  const guardada = llaveActiva(db);
  // Una llave cuyo sello no se abre con la llave de las claves de ahora no sirve para copias nuevas: es como no tener
  // clave (la pantalla ofrece crear otra y dice por qué).
  const ilegible = guardada && !selloLegible(guardada, huellaLlave) ? { huella: guardada.huella } : null;
  const activa = ilegible ? null : guardada;
  const pendiente = llavePendiente(db, ahora);
  const anteriores = db.prepare("SELECT huella, confirmada_en, reemplazada_en FROM copias_llaves WHERE estado = 'anterior' ORDER BY id DESC LIMIT 20").all()
    .map(l => ({ huella: l.huella, desde: l.confirmada_en, hasta: l.reemplazada_en }));
  const fuera = ultimaFuera(db, ahora);
  const ultima = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 1').get();
  const recientes = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 10').all().map(copiaPublica);
  const ultimaLocal = db.prepare("SELECT bytes FROM copias WHERE estado IN ('verificada', 'solo_local') AND bytes > 0 ORDER BY id DESC LIMIT 1").get();
  const ajustes = ajustesCopias(db);
  const plan = planDeDisco({ libreMb, libreCopiasMb, mismoDisco, baseMb, walMb, ultimaCopiaMb: ultimaLocal ? ultimaLocal.bytes / MB : null, ajusteLocal: ajustes.local });
  const locales = copiasLocales(db);
  const enCurso = copiaEnCurso(db);
  const viva = tareaDeCopiaViva(db);
  const motivoNoAhora = viva ? 'en_marcha' : modoSeguro ? 'modo_seguro' : !trabajador ? 'sin_trabajador' : !activa ? 'sin_clave' : plan.freno ? 'disco_lleno' : null;
  return {
    clave: {
      activa: Boolean(activa), huella: activa?.huella ?? null, desde: activa?.confirmada_en ?? null, comprobadaEn: activa?.comprobada_en ?? null,
      pendiente: pendiente ? { huella: pendiente.huella, expira: pendiente.vence_en } : null, anteriores, ilegible,
    },
    telegram,
    ultima: ultima ? copiaPublica(ultima) : null,
    ultimaFuera: fuera ? { fecha: fuera.empezada_en, comprobada: fuera.verificada_en, bytes: fuera.bytes, partes: fuera.partes, estado: fuera.estado, tablas: fuera.tablas } : null,
    proxima: proximaCopia(db, ahora),
    enCurso: enCurso && viva?.estado === 'en_curso' ? { paso: enCurso.paso, n: enCurso.n, de: enCurso.de } : enCurso ? esperandoPublico(enCurso, viva, ahora) : null,
    locales: {
      activas: ajustes.local, pausadas: ajustes.local && !plan.local, frenoDisco: plan.freno, copias: locales.copias, archivos: locales.archivos,
      mb: locales.mb, bytes: locales.bytes, anterior: locales.anterior, libreMb: plan.libreMb, pisoMb: plan.pisoMb, diasRestantes: diasDeDisco(db, { libreMb: plan.libreMb, pisoMb: plan.pisoMb }),
    },
    fijada: fuera ? fuera.fijada === 1 : null,
    recientes,
    modoSeguro,
    puede: { ahora: motivoNoAhora == null, motivoNoAhora },
  };
}

// Abre o cierra un aviso de las copias (una sola escritura corta).
export function avisoCopias(db, clave, { activo, nivel = 'atencion', detalle = null, ahora = Date.now() }) {
  if (activo) return abrirAviso(db, { clave, nivel, detalle, ahora });
  return resolverAviso(db, clave, ahora);
}
