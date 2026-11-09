// Salud del servidor: memoria, disco, tamaño de la base, carga del procesador. Aquí solo se LEE (de /proc, de
// /sys y del tamaño de los archivos); lo único que escribe es guardarMuestra, una fila por hora en la base.
// Nunca abre, cambia ni borra ningún archivo: solo pregunta su tamaño.
import { readFileSync, statSync, statfsSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { totalmem, freemem, loadavg, uptime } from 'node:os';

export const UMBRALES = Object.freeze({
  memoriaAtencionMb: 64,
  memoriaGraveMb: 32,
  discoAtencionMb: 1024,
  discoGraveMb: 300,
  baseAtencionMb: 1024, // las copias van en partes de 2 MiB (parte e): el tamaño ya no choca con Telegram, pero una base
  // de más de 1 GB tarda mucho en copiarse cada noche con 1 procesador
  walAtencionMb: 64,
  pantallasAtencionMs: 200,
  reiniciosAtencion24h: 3,
});

export const CLAVES_SALUD = Object.freeze(['memoria_baja', 'disco_bajo', 'base_grande', 'wal_grande', 'pantallas_lentas', 'trabajador_reinicios']);

const MB = 1024 * 1024;
const redondear = (n, decimales = 1) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** decimales) / 10 ** decimales);
const iso = ms => new Date(ms).toISOString();

function leerTexto(ruta) {
  try { return readFileSync(ruta, 'utf8'); } catch { return null; }
}

// Lee los campos «Nombre: 123 kB» de archivos como /proc/meminfo o /proc/<pid>/smaps_rollup.
function camposKb(texto) {
  const campos = {};
  for (const linea of String(texto ?? '').split('\n')) {
    const m = /^([A-Za-z_()]+):\s+(\d+)\s*kB/.exec(linea);
    if (m) campos[m[1]] = Number(m[2]);
  }
  return campos;
}

function tamanoMb(ruta) {
  try { return statSync(ruta).size / MB; } catch { return null; }
}

// Memoria PROPIA de un proceso (la que no comparte con otros: Private_Clean + Private_Dirty), en MB.
export function memoriaPropiaMb(pid) {
  const numero = Number(pid);
  if (!Number.isSafeInteger(numero) || numero <= 0) return null;
  const campos = camposKb(leerTexto(`/proc/${numero}/smaps_rollup`));
  if (campos.Private_Clean == null && campos.Private_Dirty == null) return null;
  return redondear(((campos.Private_Clean ?? 0) + (campos.Private_Dirty ?? 0)) / 1024);
}

// Memoria de todo el servicio (el cgroup de systemd: pantallas + trabajador), si se puede leer.
function memoriaDelServicioMb() {
  const grupo = /^0::(\/.*)$/m.exec(leerTexto('/proc/self/cgroup') ?? '');
  if (!grupo) return null;
  const texto = leerTexto(join('/sys/fs/cgroup', grupo[1], 'memory.current'));
  const bytes = texto == null ? NaN : Number(texto.trim());
  return Number.isFinite(bytes) ? redondear(bytes / MB) : null;
}

function disco(carpeta) {
  for (const ruta of [carpeta, carpeta && dirname(carpeta)]) {
    if (!ruta || !existsSync(ruta)) continue;
    try {
      const s = statfsSync(ruta);
      return { libreMb: redondear((s.bavail * s.bsize) / MB), totalMb: redondear((s.blocks * s.bsize) / MB) };
    } catch { /* se prueba la siguiente */ }
  }
  return { libreMb: null, totalMb: null };
}

function copias(carpeta) {
  const resumen = { archivos: 0, mb: 0 };
  if (!carpeta) return resumen;
  let nombres = [];
  try { nombres = readdirSync(carpeta); } catch { return resumen; }
  let bytes = 0;
  for (const nombre of nombres) {
    if (!nombre.startsWith('oportia')) continue;
    try {
      const s = statSync(join(carpeta, nombre));
      if (!s.isFile()) continue;
      resumen.archivos += 1;
      bytes += s.size;
    } catch { /* desapareció entre medio: se ignora */ }
  }
  resumen.mb = redondear(bytes / MB);
  return resumen;
}

// Memoria libre del servidor en MB (MemAvailable: la que de verdad se puede usar), o null si no se puede leer.
// La usa el trabajador antes de tomar una tarea.
export function memoriaDisponibleMb() {
  const meminfo = camposKb(leerTexto('/proc/meminfo'));
  if (meminfo.MemAvailable != null) return redondear(meminfo.MemAvailable / 1024);
  const libre = freemem();
  return Number.isFinite(libre) && libre > 0 ? redondear(libre / MB) : null;
}

// Disco libre (en MB) donde está esa carpeta, o null si no se puede leer.
export function discoLibreMb(carpeta) {
  return disco(carpeta).libreMb;
}

// Todas las medidas de una vez. Lo que no se puede leer queda en null (nunca se inventa un número).
export function medirSalud({ carpetaDatos = null, archivoBase, carpetaCopias = null, pids = {}, pantallasP99Ms = null } = {}) {
  const meminfo = camposKb(leerTexto('/proc/meminfo'));
  const swapTotal = meminfo.SwapTotal == null ? null : meminfo.SwapTotal / 1024;
  const swapUsada = meminfo.SwapTotal == null || meminfo.SwapFree == null ? null : (meminfo.SwapTotal - meminfo.SwapFree) / 1024;
  const disponible = meminfo.MemAvailable != null ? meminfo.MemAvailable / 1024 : freemem() / MB;
  const [m1, m5, m15] = loadavg();
  return {
    memoria: {
      totalMb: redondear(totalmem() / MB),
      disponibleMb: redondear(disponible),
      swapTotalMb: redondear(swapTotal),
      swapUsadaMb: redondear(swapUsada),
    },
    oportiaMb: memoriaDelServicioMb(),
    webMb: memoriaPropiaMb(pids.web ?? process.pid),
    trabajadorMb: pids.trabajador ? memoriaPropiaMb(pids.trabajador) : null,
    disco: disco(carpetaDatos ?? (archivoBase ? dirname(archivoBase) : null)),
    base: { archivoMb: redondear(tamanoMb(archivoBase), 2), walMb: redondear(tamanoMb(`${archivoBase}-wal`) ?? 0, 2) },
    copias: copias(carpetaCopias),
    carga: { m1: redondear(m1, 2), m5: redondear(m5, 2), m15: redondear(m15, 2) },
    pantallasP99Ms: pantallasP99Ms == null ? null : redondear(pantallasP99Ms),
    encendidoDesde: iso(Date.now() - uptime() * 1000),
  };
}

// Qué avisos de salud tocan con estas medidas: [{ clave, nivel, activo, detalle }]. Función pura.
// Una medida que no se pudo leer (null) nunca enciende un aviso.
export function evaluarSalud(medidas, { reinicios24h = 0 } = {}, umbrales = UMBRALES) {
  const u = { ...UMBRALES, ...umbrales };
  const lista = [];
  const poner = (clave, nivel, detalle) => lista.push({ clave, nivel: nivel ?? 'atencion', activo: nivel != null, detalle });
  const memoria = medidas?.memoria?.disponibleMb;
  poner('memoria_baja', memoria == null ? null : memoria < u.memoriaGraveMb ? 'grave' : memoria < u.memoriaAtencionMb ? 'atencion' : null, { disponibleMb: memoria ?? null });
  const libre = medidas?.disco?.libreMb;
  poner('disco_bajo', libre == null ? null : libre < u.discoGraveMb ? 'grave' : libre < u.discoAtencionMb ? 'atencion' : null, { libreMb: libre ?? null });
  const base = medidas?.base?.archivoMb;
  poner('base_grande', base != null && base > u.baseAtencionMb ? 'atencion' : null, { archivoMb: base ?? null });
  const wal = medidas?.base?.walMb;
  poner('wal_grande', wal != null && wal > u.walAtencionMb ? 'atencion' : null, { walMb: wal ?? null });
  const p99 = medidas?.pantallasP99Ms;
  poner('pantallas_lentas', p99 != null && p99 > u.pantallasAtencionMs ? 'atencion' : null, { p99Ms: p99 ?? null });
  poner('trabajador_reinicios', reinicios24h >= u.reiniciosAtencion24h ? 'atencion' : null, { reinicios24h });
  return lista;
}

// Verde si todo está bien, amarillo si hay algo para mirar, rojo si hay algo grave.
export function semaforo(lista) {
  const activos = (lista ?? []).filter(a => a.activo);
  if (activos.some(a => a.nivel === 'grave')) return 'rojo';
  return activos.length ? 'amarillo' : 'verde';
}

// Una muestra por hora (la hora UTC es única): aunque se llame dos veces, o tras varios reinicios, queda una.
// Devuelve true si guardó una nueva.
export function guardarMuestra(db, medidas, fila = {}, ahora = Date.now()) {
  const momento = iso(ahora);
  return db.prepare(`INSERT INTO salud_muestras (hora, fecha, memoria_total_mb, memoria_disponible_mb, swap_usada_mb, web_mb, trabajador_mb,
      disco_libre_mb, disco_total_mb, base_mb, wal_mb, copias_mb, carga_1m, pantallas_p99_ms, fila_lista, fila_en_curso, fila_fallida)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(hora) DO NOTHING`)
    .run(momento.slice(0, 13), momento,
      medidas?.memoria?.totalMb ?? null, medidas?.memoria?.disponibleMb ?? null, medidas?.memoria?.swapUsadaMb ?? null,
      medidas?.webMb ?? null, medidas?.trabajadorMb ?? null, medidas?.disco?.libreMb ?? null, medidas?.disco?.totalMb ?? null,
      medidas?.base?.archivoMb ?? null, medidas?.base?.walMb ?? null, medidas?.copias?.mb ?? null, medidas?.carga?.m1 ?? null,
      medidas?.pantallasP99Ms ?? null, fila?.listas ?? null, fila?.enCurso ?? null, fila?.fallidas24h ?? null).changes === 1;
}

// Las últimas muestras, de la más nueva a la más vieja.
export function historialSalud(db, { horas = 24 } = {}) {
  const cuantas = Math.max(1, Math.min(24 * 31, Math.trunc(Number(horas)) || 24));
  return db.prepare('SELECT * FROM salud_muestras ORDER BY hora DESC LIMIT ?').all(cuantas).map(m => ({
    hora: m.hora,
    fecha: m.fecha,
    memoriaTotalMb: m.memoria_total_mb,
    memoriaDisponibleMb: m.memoria_disponible_mb,
    swapUsadaMb: m.swap_usada_mb,
    webMb: m.web_mb,
    trabajadorMb: m.trabajador_mb,
    discoLibreMb: m.disco_libre_mb,
    discoTotalMb: m.disco_total_mb,
    baseMb: m.base_mb,
    walMb: m.wal_mb,
    copiasMb: m.copias_mb,
    carga1m: m.carga_1m,
    pantallasP99Ms: m.pantallas_p99_ms,
    filaLista: m.fila_lista,
    filaEnCurso: m.fila_en_curso,
    filaFallida: m.fila_fallida,
  }));
}
