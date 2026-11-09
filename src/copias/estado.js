// El ESTADO de las copias (fase 1, parte e): la clave de recuperación (solo su parte pública), la política del disco,
// los topes de intentos, las filas de cada copia y lo que muestran las pantallas. Lo usan los dos procesos: el
// trabajador (src/copias/hacer.js, que hace las copias) y el servidor web (rutas, el resumen de Administrador). Por eso
// aquí no hay red, ni foto de la base, ni archivos: solo la base y cuentas.
//  - La clave de recuperación del dueño NUNCA se guarda: de ella quedan la llave pública (para cifrar), el «sello»
//    (firma los índices; no abre nada), la huella («Clave A7F3») y el sha256 de su «verificador» (la página lo calcula
//    sola: así el servidor puede comprobar la clave sin verla). El texto de la clave existe solo en la respuesta de
//    «Crear» (crearClavePendiente) y nunca entra en una fila, un registro, un aviso ni la auditoría.
//  - Nada se borra: una llave vieja queda «anterior» (las copias viejas la necesitan), una copia queda con su estado.
//  - Los errores son ErrorCopias con un código corto; las rutas los vuelven respuestas HTTP (src/api/copias.js).
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { ErrorCopias, CLAVE_SERVIDOR, ESTADOS_COPIA } from './formato.js';
import { crearClave, derivar, esClaveDePrueba, hashVerificador } from './clave.js';
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

// ---------- La clave de recuperación ----------

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
export function crearClavePendiente(db, { usuarioId = null, ahora = Date.now() } = {}) {
  const { texto, semilla } = crearClave();
  let d;
  try { d = derivar(semilla); } finally { semilla.fill(0); }
  try {
    const publica = d.publica.toString('base64url');
    if (esClaveDePrueba(publica)) throw new ErrorCopias('clave_de_prueba'); // imposible con 128 bits al azar, pero se revisa
    const sello = d.sello.toString('hex');
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
// Pura. libreMb: disco libre; baseMb/walMb: la base y su -wal; ultimaCopiaMb: lo que midió la última copia.
//  - piso = max(2 GB, 2 × base + wal + 256 MB): espacio para la copia obligatoria de antes de una migración futura, para
//    los picos del -wal y para revisar una restauración (1f).
//  - local: se guarda una copia en el servidor solo si después queda al menos el piso.
//  - freno: con menos de 300 MB libres el trabajador no toma copias (el freno «poco_disco» de la parte c).
// Una medida que no se pudo leer (null) nunca frena (como en la parte c).
export function planDeDisco({ libreMb = null, baseMb = 0, walMb = 0, ultimaCopiaMb = null, ajusteLocal = true } = {}) {
  const base = Math.max(0, Number(baseMb) || 0);
  const wal = Math.max(0, Number(walMb) || 0);
  const estimadoMb = ultimaCopiaMb != null && Number.isFinite(Number(ultimaCopiaMb)) ? Number(ultimaCopiaMb) : base * DISCO.fraccionEstimada;
  const pisoMb = Math.max(DISCO.pisoMinimoMb, 2 * base + wal + DISCO.margenMb);
  const medido = libreMb != null && Number.isFinite(Number(libreMb));
  const libre = medido ? Number(libreMb) : null;
  const freno = medido && libre < DISCO.frenoMb;
  const cabe = !medido || libre - estimadoMb >= pisoMb;
  const local = ajusteLocal !== false && cabe && !freno;
  const motivo = ajusteLocal === false ? 'apagado' : freno ? 'freno' : !cabe ? 'disco' : null;
  return { estimadoMb: Math.round(estimadoMb * 100) / 100, pisoMb: Math.round(pisoMb), libreMb: libre, local, freno, motivo };
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

// Las copias guardadas en el servidor, desde las filas (nunca mirando la carpeta: crece cada noche).
export function copiasLocales(db) {
  const f = db.prepare(`SELECT COUNT(DISTINCT copia_id) AS copias, COUNT(*) AS archivos, COALESCE(SUM(bytes), 0) AS bytes
    FROM copia_partes WHERE archivo_local IS NOT NULL`).get();
  return { copias: f.copias, archivos: f.archivos, mb: Math.round((f.bytes / MB) * 10) / 10 };
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

// La última copia comprobada FUERA del servidor (o null).
export function ultimaFuera(db) {
  return db.prepare("SELECT * FROM copias WHERE estado = 'verificada' AND fuera = 1 ORDER BY verificada_en DESC, id DESC LIMIT 1").get() ?? null;
}

// Cuándo toca la próxima copia de la noche (ISO): la ranura de hoy si todavía no tiene tarea, si no la de mañana.
export function proximaCopia(db, ahora = Date.now()) {
  const r = ranura(PROGRAMA_COPIAS, ahora);
  const hecha = db.prepare('SELECT 1 FROM tareas WHERE clave_unica = ?').get(r.clave);
  return iso(hecha ? r.siguiente : Math.max(r.inicio, ahora));
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

function copiaPublica(c) {
  return {
    fecha: c.verificada_en ?? c.terminada_en ?? c.empezada_en, empezada: c.empezada_en, origen: c.origen, bytes: c.bytes, partes: c.partes,
    local: c.local === 1, fuera: c.fuera === 1, estado: c.estado, motivo: c.motivo ?? null, fijada: c.fijada === 1, tablas: c.tablas,
  };
}

// ¿Hay que avisar «copia atrasada»? (lo evalúa el servidor web: src/canales/avisador.js). Regla: hay clave activa Y un
// chat de Telegram unido Y pasaron más de 30 h desde lo último de: confirmar la clave, unir el chat, la última copia
// comprobada fuera. Así no hay una falsa alarma justo después de configurar. → { activo, detalle }
export function copiaAtrasada(db, ahora = Date.now()) {
  const llave = llaveActiva(db);
  const canal = db.prepare("SELECT * FROM canales WHERE tipo = 'telegram' AND proposito = 'avisos_dueno' AND estado IN ('activo', 'bloqueado', 'perdido') ORDER BY id DESC LIMIT 1").get();
  if (!llave || !canal) return { activo: false, detalle: null };
  const ultima = ultimaFuera(db);
  const base = Math.max(Date.parse(llave.confirmada_en ?? 0) || 0, Date.parse(canal.vinculado_en ?? 0) || 0, Date.parse(ultima?.verificada_en ?? 0) || 0);
  const horas = Math.floor((ahora - base) / HORA);
  return { activo: ahora > base + HORAS_COPIA_VIEJA * HORA, detalle: { horas, desde: ultima?.verificada_en ?? null } };
}

// Para el resumen de Administrador (GET /api/admin/sistema → copias): { estado, tono, ultimaFuera, proxima, motivo }.
export function resumenCopias(db, { ahora = Date.now() } = {}) {
  const llave = llaveActiva(db);
  const canal = db.prepare("SELECT estado FROM canales WHERE tipo = 'telegram' AND proposito = 'avisos_dueno' AND estado IN ('activo', 'bloqueado', 'perdido') ORDER BY id DESC LIMIT 1").get();
  const fuera = ultimaFuera(db);
  const ultima = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 1').get();
  const reciente = fuera && ahora - Date.parse(fuera.verificada_en) <= HORAS_COPIA_VIEJA * HORA;
  let tono = 'bien';
  let motivo = null;
  if (!llave) { tono = 'atencion'; motivo = 'sin_clave'; }
  else if (!canal) { tono = 'atencion'; motivo = 'solo_locales'; }
  else if (ultima?.estado === 'fallida') { tono = 'mal'; motivo = 'fallo'; }
  else if (!reciente) { tono = 'mal'; motivo = 'atrasada'; }
  return {
    estado: tono, tono, motivo, proxima: proximaCopia(db, ahora),
    ultimaFuera: fuera ? { fecha: fuera.verificada_en, bytes: fuera.bytes, partes: fuera.partes } : null,
    ultima: ultima ? copiaPublica(ultima) : null,
  };
}

// Todo lo que muestra Administrador → Copias (GET /api/admin/copias). Solo filas de la base y UNA medida del disco
// (libreMb, que pasa quien llama): nunca mira la carpeta de las copias.
export function estadoCopias(db, { ahora = Date.now(), libreMb = null, baseMb = 0, walMb = 0, telegram = null, modoSeguro = false, trabajador = true } = {}) {
  const activa = llaveActiva(db);
  const pendiente = llavePendiente(db, ahora);
  const anteriores = db.prepare("SELECT huella, confirmada_en, reemplazada_en FROM copias_llaves WHERE estado = 'anterior' ORDER BY id DESC LIMIT 20").all()
    .map(l => ({ huella: l.huella, desde: l.confirmada_en, hasta: l.reemplazada_en }));
  const fuera = ultimaFuera(db);
  const ultima = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 1').get();
  const recientes = db.prepare('SELECT * FROM copias ORDER BY id DESC LIMIT 10').all().map(copiaPublica);
  const ultimaLocal = db.prepare("SELECT bytes FROM copias WHERE estado IN ('verificada', 'solo_local') AND bytes > 0 ORDER BY id DESC LIMIT 1").get();
  const ajustes = ajustesCopias(db);
  const plan = planDeDisco({ libreMb, baseMb, walMb, ultimaCopiaMb: ultimaLocal ? ultimaLocal.bytes / MB : null, ajusteLocal: ajustes.local });
  const locales = copiasLocales(db);
  const enCurso = copiaEnCurso(db);
  const viva = tareaDeCopiaViva(db);
  const motivoNoAhora = viva ? 'en_marcha' : modoSeguro ? 'modo_seguro' : !trabajador ? 'sin_trabajador' : !activa ? 'sin_clave' : plan.freno ? 'disco_lleno' : null;
  return {
    clave: {
      activa: Boolean(activa), huella: activa?.huella ?? null, desde: activa?.confirmada_en ?? null, comprobadaEn: activa?.comprobada_en ?? null,
      pendiente: pendiente ? { huella: pendiente.huella, expira: pendiente.vence_en } : null, anteriores,
    },
    telegram,
    ultima: ultima ? copiaPublica(ultima) : null,
    ultimaFuera: fuera ? { fecha: fuera.verificada_en, bytes: fuera.bytes, partes: fuera.partes, estado: fuera.estado, tablas: fuera.tablas } : null,
    proxima: proximaCopia(db, ahora),
    enCurso: enCurso && viva?.estado === 'en_curso' ? { paso: enCurso.paso, n: enCurso.n, de: enCurso.de } : enCurso ? { paso: enCurso.paso, n: enCurso.n, de: enCurso.de, esperando: true } : null,
    locales: {
      activas: ajustes.local, pausadas: ajustes.local && !plan.local, frenoDisco: plan.freno, copias: locales.copias, archivos: locales.archivos,
      mb: locales.mb, libreMb: plan.libreMb, pisoMb: plan.pisoMb, diasRestantes: diasDeDisco(db, { libreMb: plan.libreMb, pisoMb: plan.pisoMb }),
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
