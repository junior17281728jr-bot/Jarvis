// Lo que revisa sistema.vigilar (cada hora, en el trabajador) de las copias (fase 1, parte e). Cada parte es una
// escritura corta. Nada se borra, nada se escribe fuera de la base.
//  - vigilarCopias: copias que quedaron a medias (su tarea falló o ya no existe) → «fallida» (con el aviso grave) o
//    «interrumpida»; el recordatorio de comprobar la clave cada 90 días; cuántos días alcanza el disco; si las copias
//    del servidor pueden volver.
//  - leerActualizaciones: SOLO LEE /var/lib/jarvis/update.log y version.bad (los escribe el actualizador del servidor,
//    que corre como root) para avisar de una actualización que no se instaló o que se devolvió. Nunca los cambia.
import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { abrirAviso, resolverAviso, AVISO_ACTUALIZACION } from '../avisos/avisos.js';
import { rutaSegura } from './formato.js';
import { DISCO, DIAS_COMPROBAR_CLAVE, llaveActiva, planDeDisco, ajustesCopias, diasDeDisco, actualizarCopia } from './estado.js';

const DIA = 86_400_000;
const MB = 1024 * 1024;
const iso = ms => new Date(ms).toISOString();
export const CLAVE_ACTUALIZACIONES = 'avisos.actualizaciones';
export const LEER_MAXIMO = 64 * 1024;
export const COPIA_SIN_TAREA_MS = 2 * 3_600_000;

function tamanoMb(ruta) {
  try { return statSync(ruta).size / MB; } catch { return 0; }
}

// Las copias, el recordatorio de la clave y el disco. Síncrona: se llama dentro de ctx.escribir.
// libreMb: el disco libre (lo mide quien llama). → { fallidas, interrumpidas, comprobarClave, dias }
export function vigilarCopias(db, config, { ahora = Date.now(), libreMb = null } = {}) {
  const r = { fallidas: 0, interrumpidas: 0, comprobarClave: false, dias: null };
  const enCurso = db.prepare(`SELECT c.id, c.empezada_en, t.estado AS tarea_estado, t.ultimo_error AS tarea_error FROM copias c
    LEFT JOIN tareas t ON t.id = c.tarea_id WHERE c.estado IN ('haciendo', 'escrita', 'subida')`).all();
  for (const c of enCurso) {
    if (['lista', 'en_curso'].includes(c.tarea_estado)) continue;
    if (['fallida', 'revisar'].includes(c.tarea_estado)) {
      actualizarCopia(db, c.id, { estado: 'fallida', motivo: String(c.tarea_error ?? 'tarea_fallida').slice(0, 80), terminada_en: iso(ahora) });
      abrirAviso(db, { clave: 'copia_fallida', nivel: 'grave', detalle: { motivo: 'tarea_fallida' }, ahora });
      r.fallidas += 1;
    } else if (ahora - Date.parse(c.empezada_en) > COPIA_SIN_TAREA_MS) {
      actualizarCopia(db, c.id, { estado: 'interrumpida', motivo: c.tarea_estado ? `tarea_${c.tarea_estado}` : 'sin_tarea', terminada_en: iso(ahora) });
      r.interrumpidas += 1;
    }
  }
  // Cada 90 días, un recordatorio en silencio: «Comprueba tu clave de recuperación».
  const llave = llaveActiva(db);
  if (llave) {
    const desde = Date.parse(llave.comprobada_en ?? llave.confirmada_en ?? llave.creada_en);
    r.comprobarClave = Number.isFinite(desde) && ahora - desde > DIAS_COMPROBAR_CLAVE * DIA;
    if (r.comprobarClave) abrirAviso(db, { clave: 'copias_comprobar_clave', nivel: 'atencion', ahora });
    else resolverAviso(db, 'copias_comprobar_clave', ahora);
  } else resolverAviso(db, 'copias_comprobar_clave', ahora);
  // El disco: ¿pueden volver las copias del servidor? ¿Cuántos días alcanza al ritmo de hoy?
  const ajustes = ajustesCopias(db);
  const plan = planDeDisco({ libreMb, baseMb: tamanoMb(config.archivoBase), walMb: tamanoMb(`${config.archivoBase}-wal`), ajusteLocal: ajustes.local });
  if (plan.local) resolverAviso(db, 'copias_locales_pausadas', ahora);
  if (ajustes.local) {
    r.dias = diasDeDisco(db, { libreMb: plan.libreMb, pisoMb: plan.pisoMb });
    if (r.dias != null && r.dias < DISCO.diasAviso) abrirAviso(db, { clave: 'copias_disco_pronto', nivel: 'atencion', detalle: { dias: r.dias }, ahora });
    else if (r.dias == null || r.dias > DISCO.diasResuelve) resolverAviso(db, 'copias_disco_pronto', ahora);
  }
  return r;
}

// Lee el final (≤ 64 KB) de un archivo, SOLO lectura. null si no existe o no se puede leer.
function leerFinal(ruta) {
  let fd;
  try {
    fd = openSync(rutaSegura(ruta), 'r');
    const tam = fstatSync(fd).size;
    const cuanto = Math.min(tam, LEER_MAXIMO);
    const bufer = Buffer.alloc(cuanto);
    let leido = 0;
    while (leido < cuanto) {
      const n = readSync(fd, bufer, leido, cuanto - leido, tam - cuanto + leido);
      if (n <= 0) break;
      leido += n;
    }
    return { texto: bufer.subarray(0, leido).toString('utf8'), desdeElPrincipio: tam <= LEER_MAXIMO };
  } catch {
    return null;
  } finally {
    if (fd != null) { try { closeSync(fd); } catch { /* ya cerrado */ } }
  }
}

// Las líneas que entiende (cualquier otra se ignora). Pura. La última línea sin «\n» todavía se está escribiendo: no.
export function lineasDeActualizacion(texto, { desdeElPrincipio = true } = {}) {
  const lineas = String(texto ?? '').split('\n');
  lineas.pop(); // lo que viene después del último «\n» (vacío, o una línea a medias)
  if (!desdeElPrincipio) lineas.shift(); // la primera puede estar cortada por el tope de 64 KB
  const salida = [];
  for (const linea of lineas) {
    let m = /^(\S+) versión ([0-9a-f]{7}): alguna prueba falló, NO se instaló$/.exec(linea);
    if (m) { salida.push({ tipo: 'no_instalada', fecha: Date.parse(m[1]), sha: m[2] }); continue; }
    m = /^(\S+) versión ([0-9a-f]{7}) no arrancó: volví a la anterior$/.exec(linea);
    if (m) { salida.push({ tipo: 'revertida', fecha: Date.parse(m[1]), sha: m[2] }); continue; }
    m = /^(\S+) actualizado a ([0-9a-f]{7})$/.exec(linea);
    if (m) salida.push({ tipo: 'actualizado', fecha: Date.parse(m[1]), sha: m[2] });
  }
  return salida.filter(l => Number.isFinite(l.fecha));
}

// Lee update.log y version.bad (sin escribir nada en ellos). → { lineas, versionMala, desdeElPrincipio } o null.
export function leerArchivosDeActualizacion(config) {
  const carpeta = config?.carpetaDatos;
  if (!carpeta) return null;
  const log = leerFinal(join(carpeta, 'update.log'));
  const malo = leerFinal(join(carpeta, 'version.bad'));
  const sha = /^[0-9a-f]{40}$/.exec(String(malo?.texto ?? '').trim())?.[0] ?? null;
  if (!log) return { lineas: [], versionMala: sha };
  return { lineas: lineasDeActualizacion(log.texto, { desdeElPrincipio: log.desdeElPrincipio }), versionMala: sha };
}

function leerAjuste(db, clave) {
  const f = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!f) return null;
  try { return JSON.parse(f.valor); } catch { return null; }
}

// Abre o resuelve los avisos de las actualizaciones (síncrona: dentro de ctx.escribir). La primera vez solo anota
// «desde ahora» (no avisa de la historia vieja). → { abiertos, resueltos }
export function aplicarActualizaciones(db, datos, { ahora = Date.now() } = {}) {
  const r = { abiertos: [], resueltos: [] };
  if (!datos) return r;
  const guardado = leerAjuste(db, CLAVE_ACTUALIZACIONES);
  const hasta = Date.parse(guardado?.hasta ?? '');
  const guardar = valor => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(CLAVE_ACTUALIZACIONES, JSON.stringify(valor), iso(ahora));
  if (!Number.isFinite(hasta)) {
    guardar({ hasta: iso(ahora), versionMala: datos.versionMala ?? null });
    return r;
  }
  let nuevoHasta = hasta;
  for (const l of datos.lineas) {
    if (l.fecha <= hasta) continue;
    nuevoHasta = Math.max(nuevoHasta, l.fecha);
    if (l.tipo === 'actualizado') {
      for (const a of db.prepare("SELECT id, clave, detalle FROM avisos WHERE resuelto_en IS NULL AND clave LIKE 'actualizacion_%'").all()) {
        let d = null;
        try { d = JSON.parse(a.detalle ?? 'null'); } catch { d = null; }
        const fecha = Date.parse(d?.fecha ?? '');
        if (AVISO_ACTUALIZACION.test(a.clave) && (!Number.isFinite(fecha) || fecha < l.fecha) && resolverAviso(db, a.clave, ahora)) r.resueltos.push(a.clave);
      }
      continue;
    }
    const clave = `actualizacion_${l.tipo}:${l.sha}`;
    const detalle = { fecha: iso(l.fecha), sha7: l.sha, ...(datos.versionMala?.startsWith(l.sha) ? { sha: datos.versionMala } : {}) };
    abrirAviso(db, { clave, nivel: l.tipo === 'revertida' ? 'grave' : 'atencion', detalle, ahora });
    r.abiertos.push(clave);
  }
  guardar({ hasta: iso(nuevoHasta), versionMala: datos.versionMala ?? null });
  return r;
}

// Las dos cosas juntas (para las pruebas y la consola).
export function leerActualizaciones(db, config, { ahora = Date.now() } = {}) {
  return aplicarActualizaciones(db, leerArchivosDeActualizacion(config), { ahora });
}

// Lo que muestra Administrador → Servidor: la última versión que no se instaló (del version.bad), o null.
export function ultimaVersionMala(db) {
  const a = leerAjuste(db, CLAVE_ACTUALIZACIONES);
  return typeof a?.versionMala === 'string' && /^[0-9a-f]{40}$/.test(a.versionMala) ? a.versionMala : null;
}
