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
import { DISCO, DIAS_COMPROBAR_CLAVE, llaveActiva, planDeDisco, ajustesCopias, diasDeDisco, actualizarCopia, revisarFechasFuturas } from './estado.js';

const DIA = 86_400_000;
const MB = 1024 * 1024;
const iso = ms => new Date(ms).toISOString();
export const CLAVE_ACTUALIZACIONES = 'avisos.actualizaciones';
export const LEER_MAXIMO = 64 * 1024;
export const COPIA_SIN_TAREA_MS = 2 * 3_600_000;
// Un «hasta» guardado más de 5 min en el futuro es de un reloj que iba adelantado: se vuelve 7 días atrás y las líneas
// ya vistas se reconocen por su contenido (las últimas VISTAS_MAX), así nada se avisa dos veces ni se salta.
// Ronda 3 del equipo rojo: lo que dice si una línea ya se vio es SOLO su contenido (vistas), dentro de una ventana de 7
// días antes de la más nueva vista: una línea con una hora de antes de la última vista (el reloj se corrigió entre dos
// corridas del actualizador) igual se avisa. El actualizador escribe como mucho 2 líneas por hora: 336 en 7 días.
export const MARGEN_RELOJ_MS = 5 * 60_000;
export const VISTAS_MAX = 400;
export const VENTANA_VISTAS_MS = 7 * DIA;

function tamanoMb(ruta) {
  try { return statSync(ruta).size / MB; } catch { return 0; }
}

// Las copias, el recordatorio de la clave y el disco. Síncrona: se llama dentro de ctx.escribir.
// libreMb: el disco libre (lo mide quien llama). → { fallidas, interrumpidas, comprobarClave, dias }
export function vigilarCopias(db, config, { ahora = Date.now(), libreMb = null, libreCopiasMb, mismoDisco = true } = {}) {
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
  // Ronda 2: una copia con una fecha del futuro (el reloj del servidor iba adelantado): copias_fecha_futura.
  revisarFechasFuturas(db, ahora);
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
  const plan = planDeDisco({ libreMb, libreCopiasMb, mismoDisco, baseMb: tamanoMb(config.archivoBase), walMb: tamanoMb(`${config.archivoBase}-wal`), ajusteLocal: ajustes.local });
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

// ---------- Fase 1, parte f: el estado que publica el actualizador nuevo ----------
// El actualizador (root) deja en <datos>/actualizador.json una copia de su estado después de CADA corrida. Aquí solo se
// LEE (≤ 4 KB, un archivo normal) y solo se aceptan los campos conocidos con su forma; cualquier otra cosa → null.
// Sin archivo (servidor con el actualizador de antes, o después de «sudo oportia volver») → null. Nunca escribe.
export const RESULTADOS_DEL_ACTUALIZADOR = Object.freeze(['al_dia', 'hay_nueva', 'actualizado', 'no_instalada', 'revertida', 'revertida_sin_arrancar', 'sin_red', 'sin_disco', 'mala_conocida']);
const ESTADO_MAXIMO = 4096;
const SHA40 = /^[0-9a-f]{40}$/;

export function entenderEstadoDelActualizador(texto) {
  let j;
  try { j = JSON.parse(String(texto ?? '')); } catch { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || j.contrato !== 1) return null;
  const revisado = typeof j.revisado === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(j.revisado) ? Date.parse(j.revisado) : NaN;
  if (!Number.isFinite(revisado)) return null;
  if (!RESULTADOS_DEL_ACTUALIZADOR.includes(j.resultado)) return null;
  const sha = v => (v == null ? null : (typeof v === 'string' && SHA40.test(v) ? v : undefined));
  const version = sha(j.version);
  const vista = sha(j.vista);
  if (version === undefined || vista === undefined) return null;
  const megas = v => (Number.isSafeInteger(v) && v >= 0 ? v : undefined);
  const libreMb = megas(j.libre_mb);
  const ocupaMb = megas(j.ocupa_mb);
  if (libreMb === undefined || ocupaMb === undefined) return null;
  if (!['encendido', 'pendiente', 'no_aplica'].includes(j.enlace)) return null;
  if (typeof j.actualizador !== 'string' || !/^(?:[0-9a-f]{7})?$/.test(j.actualizador)) return null;
  return { contrato: 1, revisado: new Date(revisado).toISOString(), resultado: j.resultado, version, vista, actualizador: j.actualizador || null, libreMb, ocupaMb, enlace: j.enlace };
}

export function leerEstadoDelActualizador(config) {
  const carpeta = config?.carpetaDatos;
  if (!carpeta) return null;
  const ruta = join(carpeta, 'actualizador.json');
  let fd;
  try {
    fd = openSync(rutaSegura(ruta), 'r');
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > ESTADO_MAXIMO) return null;
    const bufer = Buffer.alloc(info.size);
    let leido = 0;
    while (leido < info.size) {
      const n = readSync(fd, bufer, leido, info.size - leido, leido);
      if (n <= 0) break;
      leido += n;
    }
    return entenderEstadoDelActualizador(bufer.subarray(0, leido).toString('utf8'));
  } catch {
    return null;
  } finally {
    if (fd != null) { try { closeSync(fd); } catch { /* ya cerrado */ } }
  }
}

function leerAjuste(db, clave) {
  const f = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!f) return null;
  try { return JSON.parse(f.valor); } catch { return null; }
}

const claveDeLinea = l => `${l.fecha}|${l.tipo}|${l.sha}`;

// Abre o resuelve los avisos de las actualizaciones (síncrona: dentro de ctx.escribir). → { abiertos, resueltos } (y
// relojAtras: true si el reloj volvió atrás).
// La PRIMERA vez (ronda 3 del equipo rojo) no empieza en «ahora»: empieza cuando se instaló la versión que corre (la
// última línea «actualizado a …»; si no hay, cuando arrancó el proceso: arranque), nunca más de 24 h atrás. Así una
// vuelta atrás de minutos antes de la primera lectura se avisa; lo de antes de esa instalación solo se anota como visto.
export function aplicarActualizaciones(db, datos, { ahora = Date.now(), arranque = null } = {}) {
  const r = { abiertos: [], resueltos: [] };
  if (!datos) return r;
  const guardado = leerAjuste(db, CLAVE_ACTUALIZACIONES);
  let hasta = Date.parse(guardado?.hasta ?? '');
  let piso = Date.parse(guardado?.piso ?? '');
  const vistas = Array.isArray(guardado?.vistas) ? guardado.vistas.map(String).slice(-VISTAS_MAX) : [];
  const yaVista = new Set(vistas);
  const guardar = valor => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(CLAVE_ACTUALIZACIONES, JSON.stringify(valor), iso(ahora));
  const ver = l => { const k = claveDeLinea(l); if (!yaVista.has(k)) { vistas.push(k); yaVista.add(k); } };
  if (!Number.isFinite(hasta)) {
    const instalada = datos.lineas.filter(l => l.tipo === 'actualizado' && l.fecha <= ahora + MARGEN_RELOJ_MS).reduce((m, l) => Math.max(m, l.fecha), -Infinity);
    let inicio = Number.isFinite(instalada) ? instalada : (Number.isFinite(arranque) ? arranque : ahora);
    inicio = Math.min(ahora, Math.max(ahora - DIA, inicio));
    // Lo de hasta la instalación queda visto (sin avisar): nunca se avisa la historia vieja.
    for (const l of datos.lineas) if (l.fecha <= inicio && l.fecha >= inicio - VENTANA_VISTAS_MS) ver(l);
    piso = inicio;
    hasta = inicio;
  }
  // El reloj se corrigió hacia atrás: con el «hasta» viejo, las líneas nuevas (con fechas de antes) se saltarían.
  if (hasta > ahora + MARGEN_RELOJ_MS) {
    hasta = ahora - VENTANA_VISTAS_MS;
    r.relojAtras = true; // solo aparece cuando pasó
  }
  if (Number.isFinite(piso) && piso > ahora + MARGEN_RELOJ_MS) piso = NaN; // un piso del reloj adelantado no vale
  let nuevoHasta = hasta;
  for (const l of datos.lineas) {
    if (yaVista.has(claveDeLinea(l))) continue;
    if (Number.isFinite(piso) && l.fecha <= piso) continue; // de antes de la primera lectura
    if (l.fecha < hasta - VENTANA_VISTAS_MS) continue; // muy vieja (un archivo rotado que trae su historia)
    nuevoHasta = Math.max(nuevoHasta, l.fecha);
    ver(l);
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
  guardar({ hasta: iso(nuevoHasta), ...(Number.isFinite(piso) ? { piso: iso(piso) } : {}), versionMala: datos.versionMala ?? null, vistas: vistas.slice(-VISTAS_MAX) });
  return r;
}

// Las dos cosas juntas (para las pruebas y la consola).
export function leerActualizaciones(db, config, { ahora = Date.now(), arranque = null } = {}) {
  return aplicarActualizaciones(db, leerArchivosDeActualizacion(config), { ahora, arranque });
}

// Lo que muestra Administrador → Servidor: la última versión que no se instaló (del version.bad), o null.
export function ultimaVersionMala(db) {
  const a = leerAjuste(db, CLAVE_ACTUALIZACIONES);
  return typeof a?.versionMala === 'string' && /^[0-9a-f]{40}$/.test(a.versionMala) ? a.versionMala : null;
}
