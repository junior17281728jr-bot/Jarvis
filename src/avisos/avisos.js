// Avisos para el administrador. En la fase 1, parte c se ven en la pantalla de Administrador; en la parte e
// llegarán también por Telegram (se mandarán los que tengan enviado_en vacío).
//  - Hay como mucho UN aviso abierto por clave: si el problema se repite, suma «veces».
//  - El nivel puede subir pero nunca bajar mientras está abierto; si sube a «grave», se vuelve a mandar.
//  - Nunca se borran: cuando el problema se arregla quedan «resueltos», y si vuelve, se abre uno nuevo
//    (así queda la historia completa).

export const NIVELES = ['info', 'atencion', 'grave'];
export const CLAVES_AVISO = [
  'memoria_baja', 'disco_bajo', 'base_grande', 'wal_grande', 'pantallas_lentas', 'trabajador_reinicios',
  'modo_seguro', 'base_danada', 'tareas_fallidas', 'tareas_revisar', 'fila_atrasada',
];
// Además de las de arriba: 'freno:<tipo>' cuando un tipo de tarea se frenó solo por fallar mucho.
const FRENO = /^freno:[a-z0-9._-]{1,60}$/;

const iso = momento => new Date(momento).toISOString();
const ORDEN_SQL = nivel => `CASE ${nivel} WHEN 'info' THEN 0 WHEN 'atencion' THEN 1 ELSE 2 END`;

export function claveDeAvisoValida(clave) {
  return CLAVES_AVISO.includes(clave) || FRENO.test(String(clave));
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
export function abrirAviso(db, { clave, nivel = 'atencion', detalle = null, ahora = Date.now() }) {
  if (!claveDeAvisoValida(clave)) throw new Error(`Clave de aviso no válida: ${clave}`);
  if (!NIVELES.includes(nivel)) throw new Error(`Nivel de aviso no válido: ${nivel}`);
  const momento = iso(ahora);
  // En la parte DO UPDATE, «nivel» y «enviado_en» son los valores que el aviso tenía antes.
  const fila = db.prepare(`INSERT INTO avisos (clave, nivel, detalle, creado_en, ultima_vez) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(clave) WHERE resuelto_en IS NULL DO UPDATE SET
      veces = veces + 1,
      ultima_vez = excluded.ultima_vez,
      detalle = excluded.detalle,
      nivel = CASE WHEN ${ORDEN_SQL('excluded.nivel')} > ${ORDEN_SQL('nivel')} THEN excluded.nivel ELSE nivel END,
      enviado_en = CASE WHEN excluded.nivel = 'grave' AND nivel <> 'grave' THEN NULL ELSE enviado_en END
    RETURNING id`).get(clave, nivel, textoDetalle(detalle), momento, momento);
  return fila.id;
}

// Marca resuelto el aviso abierto de esa clave (si hay). Devuelve true si había uno.
export function resolverAviso(db, clave, ahora = Date.now()) {
  return db.prepare('UPDATE avisos SET resuelto_en = ? WHERE clave = ? AND resuelto_en IS NULL').run(iso(ahora), String(clave)).changes > 0;
}

// «Entendido»: el administrador lo vio. Devuelve false si ese aviso no existe.
export function marcarVisto(db, { id, usuarioId = null, ahora = Date.now() }) {
  const numero = Number(id);
  if (!Number.isSafeInteger(numero) || numero <= 0) return false;
  const existe = db.prepare('SELECT id FROM avisos WHERE id = ?').get(numero);
  if (!existe) return false;
  db.prepare('UPDATE avisos SET visto_en = COALESCE(visto_en, ?), visto_por = COALESCE(visto_por, ?) WHERE id = ?').run(iso(ahora), usuarioId, numero);
  return true;
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
    ORDER BY ${ORDEN_SQL('nivel')} DESC, ultima_vez DESC, id DESC LIMIT 50`).all().map(avisoPublico);
}

// Los de los últimos días (abiertos o resueltos), los más nuevos primero.
export function avisosRecientes(db, { dias = 7, limite = 20, ahora = Date.now() } = {}) {
  const desde = iso(ahora - dias * 86_400_000);
  return db.prepare('SELECT * FROM avisos WHERE creado_en >= ? ORDER BY id DESC LIMIT ?').all(desde, Math.max(1, Math.min(100, limite))).map(avisoPublico);
}
