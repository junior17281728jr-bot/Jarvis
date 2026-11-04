// Los trabajos de verdad que hace el trabajador (el proceso aparte). Este archivo SOLO lo carga el trabajador:
// las pantallas nunca lo importan. En la fase 1, parte c hay dos, los dos del sistema:
//  - sistema.vigilar (cada hora, a los :07): revisa la fila y abre o resuelve sus avisos;
//  - sistema.base (cada madrugada, 4:10): revisa que la base esté sana y después la ordena.
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
  let walMb = tamanoWalMb(ctx.config);
  let checkpoint = null;
  if (walMb > WAL_GRANDE_MB) {
    checkpoint = await pasarWal(ctx);
    walMb = tamanoWalMb(ctx.config);
  }
  return { listo: true, resultado: { fila, walMb, ...(checkpoint ? { checkpoint } : {}) } };
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
});
