// Los trabajos de verdad que hace el trabajador (el proceso aparte). Este archivo SOLO lo carga el trabajador:
// las pantallas nunca lo importan. En la fase 1, parte c hay dos, los dos del sistema:
//  - sistema.vigilar (cada hora, a los :07): revisa la fila y abre o resuelve sus avisos (y, desde la parte d, la IA:
//    reservas huérfanas, avisos de tope de meses pasados y la llave de las claves);
//  - sistema.base (cada madrugada, 4:10): revisa que la base esté sana y después la ordena.
// En la parte d se suma 'ia.interpretar' (la ayuda de IA en un proyecto que espera aprobación, src/ia/ayuda.js).
// En la parte e se suma 'copias.hacer' (la copia cifrada de cada noche, src/copias/hacer.js), y vigilar revisa también
// las copias y LEE update.log (src/copias/vigilar.js).
// En la 0.7.1 se suma 'academia.drive' (trae los paquetes de la carpeta de Google Drive, src/academia/sincronizar.js).
// Los proyectos empiezan a tener trabajos en la fase 2 (la búsqueda de clientes).
//
// REGLAS PARA ESCRIBIR UN TRABAJO (valen también para la fase 2):
//  - Un paso devuelve { listo: true, resultado } (terminó) o { punto, esperarMs?, motivo? } (sigue después
//    desde ese punto), o lanza un error (mejor un ErrorTarea, que dice si se puede reintentar).
//  - Cada paso es corto y se puede repetir sin daño: si se va la luz a mitad, ese paso se vuelve a hacer.
//  - Leer: con ctx.db directamente (leer nunca traba a las pantallas).
//  - Escribir: SIEMPRE con ctx.escribir(() => …): corto, sin esperas adentro (nada de await), de a 200 filas
//    como mucho. Comprueba la cerca: si la tarea ya no es de este trabajador, lanza 'ya_no_es_mia' y no escribe.
//  - Respetar ctx.senal: si se pide parar (se acabó el tiempo o se apaga el servicio), terminar cuanto antes.
//  - Un trabajo que usa mucho el procesador llama a await ctx.ceder() cada ~50 ms.
//  - Todo lo que MANDA algo afuera (un correo, un mensaje) se declara repetible: false en tipos.js.
import { statSync } from 'node:fs';
import { resumenFila } from './cola.js';
import { sincronizarAvisos, abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { ponerModoSeguro } from './modo-seguro.js';
import { ErrorTarea } from './tipos.js';
import { vigilarIA } from '../ia/presupuesto.js';
import { MANEJADOR_INTERPRETAR } from '../ia/ayuda.js';
import { MANEJADOR_COPIAS } from '../copias/hacer.js';
import { MANEJADOR_DRIVE } from '../academia/sincronizar.js';
import { vigilarCopias, leerArchivosDeActualizacion, aplicarActualizaciones } from '../copias/vigilar.js';
import { discoLibreMb, discoDeCopias } from '../nucleo/salud.js';

export const WAL_GRANDE_MB = 64; // con más que esto, vigilar pasa lo pendiente del -wal a la base
export const PROBLEMAS_A_GUARDAR = 5;

const MB = 1024 * 1024;

function tamanoWalMb(config) {
  try {
    return Math.round((statSync(`${config.archivoBase}-wal`).size / MB) * 100) / 100;
  } catch {
    return 0;
  }
}

// Pasa al archivo principal lo que está en el -wal, sin esperar a nadie (PASSIVE: si alguien está leyendo,
// deja esa parte para la próxima). No puede ir dentro de una transacción.
function pasarWal(ctx) {
  return ctx.escribir(() => ctx.db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get(), { transaccion: false });
}

// sistema.vigilar: un solo paso.
async function vigilar(ctx) {
  const ahora = Date.now();
  const fila = resumenFila(ctx.db, { ahora });
  const avisos = [
    { clave: 'tareas_fallidas', nivel: 'atencion', activo: fila.fallidas24h > 0, detalle: { fallidas24h: fila.fallidas24h } },
    { clave: 'tareas_revisar', nivel: 'atencion', activo: fila.revisar > 0, detalle: { revisar: fila.revisar } },
    { clave: 'fila_atrasada', nivel: 'atencion', activo: fila.atrasadaDesde != null, detalle: { desde: fila.atrasadaDesde } },
  ];
  await ctx.escribir(() => sincronizarAvisos(ctx.db, avisos, ahora));
  // La IA (parte d): una sola escritura corta. Sin carpeta de datos (algunas pruebas) no mira la llave.
  const ia = await ctx.escribir(() => vigilarIA(ctx.db, { config: ctx.config, ahora }));
  // Las copias (parte e): las que quedaron a medias, el recordatorio de la clave, el disco; y las actualizaciones que
  // no se instalaron o se devolvieron (update.log: solo se LEE, fuera de la escritura).
  let copias = null;
  let actualizaciones = null;
  if (ctx.config?.archivoBase) {
    let libreMb = null;
    try { libreMb = discoLibreMb(ctx.config.carpetaDatos ?? ctx.config.carpetaCopias); } catch { libreMb = null; }
    let dc = { libreMb: null, mismoDisco: null };
    try { dc = discoDeCopias(ctx.config.carpetaCopias, ctx.config.carpetaDatos); } catch { dc = { libreMb: null, mismoDisco: null }; }
    copias = await ctx.escribir(() => vigilarCopias(ctx.db, ctx.config, { ahora, libreMb, libreCopiasMb: dc.libreMb, mismoDisco: dc.mismoDisco !== false }));
    const leido = leerArchivosDeActualizacion(ctx.config);
    // La primera lectura empieza cuando arrancó este proceso si el registro no dice cuándo se instaló la versión.
    const arranque = ahora - process.uptime() * 1000;
    actualizaciones = await ctx.escribir(() => aplicarActualizaciones(ctx.db, leido, { ahora, arranque }));
  }
  let walMb = tamanoWalMb(ctx.config);
  let checkpoint = null;
  if (walMb > WAL_GRANDE_MB) {
    checkpoint = await pasarWal(ctx);
    walMb = tamanoWalMb(ctx.config);
  }
  return { listo: true, resultado: { fila, walMb, ia, copias, actualizaciones: actualizaciones ? { abiertos: actualizaciones.abiertos.length, resueltos: actualizaciones.resueltos.length } : null, ...(checkpoint ? { checkpoint } : {}) } };
}

// sistema.base, paso 1 «revisar»: quick_check SOLO lee. Si encuentra un problema, se abre el aviso grave
// 'base_danada' y se activa el modo seguro (el trabajador deja de escribir en una base dañada; nada se borra).
async function revisarBase(ctx) {
  const filas = ctx.db.prepare('PRAGMA quick_check(20)').all();
  const textos = filas.map(f => String(Object.values(f)[0] ?? ''));
  const ahora = Date.now();
  if (textos.length === 1 && textos[0] === 'ok') {
    await ctx.escribir(() => resolverAviso(ctx.db, 'base_danada', ahora));
    return { punto: { paso: 'mantener' } };
  }
  const problemas = textos.slice(0, PROBLEMAS_A_GUARDAR).map(t => t.slice(0, 200));
  await ctx.escribir(() => {
    abrirAviso(ctx.db, { clave: 'base_danada', nivel: 'grave', detalle: { problemas }, ahora });
    ponerModoSeguro(ctx.db, { activo: true, origen: 'automatico', motivo: 'base_danada', codigo: ctx.codigo ?? null, version: ctx.version ?? null, ahora });
  });
  return { listo: true, resultado: { quickCheck: 'problemas', problemas } };
}

// sistema.base, paso 2 «mantener»: ordena las estadísticas de la base y pasa el -wal al archivo principal.
async function mantenerBase(ctx) {
  await ctx.escribir(() => ctx.db.exec('PRAGMA analysis_limit = 400; PRAGMA optimize;'), { transaccion: false });
  const checkpoint = await pasarWal(ctx);
  const paginas = ctx.db.prepare('PRAGMA page_count').get().page_count;
  const libres = ctx.db.prepare('PRAGMA freelist_count').get().freelist_count;
  return { listo: true, resultado: { quickCheck: 'ok', paginas, libres, checkpoint } };
}

async function base(ctx) {
  const paso = ctx.tarea.punto?.paso ?? 'revisar';
  if (paso === 'revisar') return revisarBase(ctx);
  if (paso === 'mantener') return mantenerBase(ctx);
  throw new ErrorTarea('punto_no_valido', { reintentable: false });
}

export const MANEJADORES = Object.freeze({
  'sistema.vigilar': Object.freeze({ paso: vigilar }),
  'sistema.base': Object.freeze({ paso: base }),
  'ia.interpretar': MANEJADOR_INTERPRETAR,
  'copias.hacer': MANEJADOR_COPIAS,
  'academia.drive': MANEJADOR_DRIVE,
});
