// Avisos para el administrador. En la fase 1, parte c se ven en la pantalla de Administrador; desde la parte e
// llegan también por Telegram (src/canales/avisador.js manda los que tienen enviado_en vacío, y los manda el proceso
// web, porque en modo seguro el trabajador está apagado).
//  - Hay como mucho UN aviso abierto por clave: si el problema se repite, suma «veces».
//  - El nivel puede subir pero nunca bajar mientras está abierto; si sube a «grave», se vuelve a mandar.
//  - Nunca se borran: cuando el problema se arregla quedan «resueltos», y si vuelve, se abre uno nuevo
//    (así queda la historia completa).
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';

export const NIVELES = Object.freeze(['info', 'atencion', 'grave']);
export const CLAVES_AVISO = Object.freeze([
  'memoria_baja', 'disco_bajo', 'base_grande', 'wal_grande', 'pantallas_lentas', 'trabajador_reinicios',
  'modo_seguro', 'base_danada', 'tareas_fallidas', 'tareas_revisar', 'fila_atrasada',
  // Fase 1, parte d (IA): un uso costó más de lo apartado; no se puede leer la llave que protege las claves.
  'ia_costo_mayor', 'ia_llave',
  // Fase 1, parte e (copias y Telegram): falta la clave de recuperación; solo hay copias en el servidor; una copia
  // falló; ninguna copia comprobada fuera del servidor en 30 horas; el disco no deja guardar copias aquí (las de Telegram
  // siguen); el disco se llenará pronto al ritmo de hoy; el mensaje fijado del chat no es la última copia; recordar
  // comprobar la clave cada 90 días; los mensajes no llegan al Telegram (solo en la pantalla).
  'copias_sin_clave', 'copias_sin_telegram', 'copia_fallida', 'copia_atrasada', 'copias_locales_pausadas', 'copias_disco_pronto',
  'copia_sin_fijar', 'copias_comprobar_clave', 'telegram_falla',
  // Ronda 2 del equipo rojo: una copia con fecha del futuro (el reloj iba adelantado); OTRO servidor (el viejo, después
  // de restaurar) manda copias al chat con el mismo bot (grave); la última copia quedó solo en el servidor porque
  // Telegram no respondió.
  'copias_fecha_futura', 'copias_otro_servidor', 'copia_solo_local',
  // Ronda 3: el sello de la clave de recuperación no se abre con la llave de las claves de ahora (grave: no hay copias).
  'copias_clave_ilegible',
  // Academia (0.7.1): la carpeta de Google Drive del contenido no se puede leer (solo en la pantalla).
  'drive_sin_acceso',
]);
// Además de las de arriba: 'freno:<tipo>' cuando un tipo de tarea se frenó solo por fallar mucho.
const FRENO = /^freno:[a-z0-9._-]{1,60}$/;
// Fase 1, parte d: 'ia_tope:<general|e<cuenta>|p<proyecto>>:<AAAA-MM>' (50, 80 y 100 % de un tope de IA en un mes
// de cobro: UNA fila por tope y por mes, que sube de nivel) y 'ia_proveedor:<proveedor>' (el proveedor no se pudo usar).
export const AVISO_IA_TOPE = /^ia_tope:(?:general|[ep][1-9]\d{0,9}):\d{4}-(?:0[1-9]|1[0-2])$/;
// 0.12.7: el resumen de un día CON gasto de IA ('ia_resumen:<AAAA-MM-DD>', día de RD). Un día sin gasto no tiene ninguno.
export const AVISO_IA_RESUMEN = /^ia_resumen:\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
export const AVISO_IA_PROVEEDOR = /^ia_proveedor:[a-z][a-z0-9_]{1,30}$/;
// Ronda 3 de revisión: 'ia_llamadas:e<cuenta>' (una cuenta que no es la del administrador usó su parte de las llamadas
// de IA de una hora; se cierra sola en la revisión de cada hora).
export const AVISO_IA_LLAMADAS = /^ia_llamadas:e[1-9]\d{0,9}$/;
// Fase 1, parte e: una actualización que no se instaló (alguna prueba falló) o que no arrancó y se devolvió a la anterior
// (lo escribe el actualizador del servidor en update.log; el trabajador solo lo LEE: src/copias/vigilar.js).
export const AVISO_ACTUALIZACION = /^actualizacion_(?:no_instalada|revertida):[0-9a-f]{7}$/;
// 0.12.3: avisos de UN hecho (cada uno con su propia clave): un cambio delicado del administrador
// ('cambio_admin:<acción>:<n.º de la auditoría>', src/cuentas/confirmar.js) y un comprobante de pago que subió un alumno
// ('pago_recibido:<n.º del pago>'). Se resuelven al tocar «Entendido» (el comprobante, también al aprobarlo o rechazarlo).
export const AVISO_HECHO = /^(?:cambio_admin:[a-z_]{1,40}:[1-9]\d{0,15}|pago_recibido:[1-9]\d{0,15})$/;

const iso = momento => new Date(momento).toISOString();
const RANGO_SQL = columna => `CASE ${columna} WHEN 'info' THEN 0 WHEN 'atencion' THEN 1 ELSE 2 END`;

export function claveDeAvisoValida(clave) {
  const texto = String(clave);
  return CLAVES_AVISO.includes(clave) || FRENO.test(texto) || AVISO_IA_TOPE.test(texto) || AVISO_IA_RESUMEN.test(texto) || AVISO_IA_PROVEEDOR.test(texto) || AVISO_IA_LLAMADAS.test(texto)
    || AVISO_ACTUALIZACION.test(texto) || AVISO_HECHO.test(texto);
}

function textoDetalle(detalle) {
  if (detalle == null) return null;
  const texto = JSON.stringify(detalle);
  return texto.length > 1000 ? JSON.stringify({ recortado: texto.slice(0, 900) }) : texto;
}

function leerDetalle(texto) {
  if (texto == null) return null;
  try { return JSON.parse(texto); } catch { return null; }
}

// Abre el aviso (o suma una vez al que ya está abierto). Devuelve su id.
// reenviar: true = es una noticia nueva aunque el aviso ya estuviera abierto (por ejemplo, el gasto de IA pasó del
// 50 % al 80 %): se vuelve a mandar (enviado_en vacío, para Telegram en la parte e) y la pantalla lo muestra como no
// visto. Sin reenviar, solo se vuelve a mandar si sube a «grave», como siempre.
export function abrirAviso(db, { clave, nivel = 'atencion', detalle = null, reenviar = false, ahora = Date.now() }) {
  if (!claveDeAvisoValida(clave)) throw new Error(`Clave de aviso no válida: ${clave}`);
  if (!NIVELES.includes(nivel)) throw new Error(`Nivel de aviso no válido: ${nivel}`);
  const momento = iso(ahora);
  // En la parte DO UPDATE, «nivel» y «enviado_en» sin «excluded.» son los valores que el aviso tenía antes.
  const fila = db.prepare(`INSERT INTO avisos (clave, nivel, detalle, creado_en, ultima_vez) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(clave) WHERE resuelto_en IS NULL DO UPDATE SET
      veces = veces + 1,
      ultima_vez = excluded.ultima_vez,
      detalle = excluded.detalle,
      nivel = CASE WHEN ${RANGO_SQL('excluded.nivel')} > ${RANGO_SQL('nivel')} THEN excluded.nivel ELSE nivel END,
      enviado_en = CASE WHEN ? = 1 THEN NULL WHEN excluded.nivel = 'grave' AND nivel <> 'grave' THEN NULL ELSE enviado_en END,
      visto_en = CASE WHEN ? = 1 THEN NULL ELSE visto_en END,
      visto_por = CASE WHEN ? = 1 THEN NULL ELSE visto_por END
    RETURNING id`).get(clave, nivel, textoDetalle(detalle), momento, momento, ...Array(3).fill(reenviar === true ? 1 : 0));
  return fila.id;
}

// Marca resuelto el aviso abierto de esa clave (si hay). Devuelve true si había uno.
export function resolverAviso(db, clave, ahora = Date.now()) {
  return db.prepare('UPDATE avisos SET resuelto_en = ? WHERE clave = ? AND resuelto_en IS NULL').run(iso(ahora), String(clave)).changes > 0;
}

// Abre o resuelve varios de una vez, según una lista [{ clave, nivel, activo, detalle }] (la que devuelve
// evaluarSalud, por ejemplo). Todo en una sola transacción corta.
export function sincronizarAvisos(db, lista, ahora = Date.now()) {
  return enTransaccion(db, () => {
    const cambios = { abiertos: [], resueltos: [] };
    for (const a of lista) {
      if (a.activo) {
        abrirAviso(db, { clave: a.clave, nivel: a.nivel, detalle: a.detalle ?? null, ahora });
        cambios.abiertos.push(a.clave);
      } else if (resolverAviso(db, a.clave, ahora)) {
        cambios.resueltos.push(a.clave);
      }
    }
    return cambios;
  });
}

// «Entendido»: el administrador lo vio. Devuelve false si ese aviso no existe.
export function marcarVisto(db, { id, usuarioId = null, ahora = Date.now() }) {
  const numero = Number(id);
  if (!Number.isSafeInteger(numero) || numero <= 0) return false;
  return enTransaccion(db, () => {
    const aviso = db.prepare('SELECT id, clave, visto_en FROM avisos WHERE id = ?').get(numero);
    if (!aviso) return false;
    if (aviso.visto_en == null) {
      db.prepare('UPDATE avisos SET visto_en = ?, visto_por = ? WHERE id = ? AND visto_en IS NULL').run(iso(ahora), usuarioId, numero);
      auditar(db, { usuarioId, accion: 'aviso_visto', detalle: `${aviso.clave} (n.º ${numero})` });
    }
    // 0.12.3: un aviso de un hecho ya visto no queda abierto para siempre.
    if (AVISO_HECHO.test(String(aviso.clave))) db.prepare('UPDATE avisos SET resuelto_en = ? WHERE id = ? AND resuelto_en IS NULL').run(iso(ahora), numero);
    return true;
  });
}

function avisoPublico(a) {
  return {
    id: a.id,
    clave: a.clave,
    nivel: a.nivel,
    detalle: leerDetalle(a.detalle),
    veces: a.veces,
    creadoEn: a.creado_en,
    ultimaVez: a.ultima_vez,
    resueltoEn: a.resuelto_en,
    vistoEn: a.visto_en,
  };
}

// Los abiertos, los graves primero y luego los más recientes.
export function avisosAbiertos(db) {
  return db.prepare(`SELECT * FROM avisos WHERE resuelto_en IS NULL
    ORDER BY ${RANGO_SQL('nivel')} DESC, ultima_vez DESC, id DESC LIMIT 50`).all().map(avisoPublico);
}

// Los de los últimos días (abiertos o resueltos), los más nuevos primero.
export function avisosRecientes(db, { dias = 7, limite = 20, ahora = Date.now() } = {}) {
  const desde = iso(ahora - dias * 86_400_000);
  const tope = Math.max(1, Math.min(100, Math.trunc(Number(limite)) || 20));
  return db.prepare('SELECT * FROM avisos WHERE creado_en >= ? ORDER BY id DESC LIMIT ?').all(desde, tope).map(avisoPublico);
}
