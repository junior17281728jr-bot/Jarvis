// Modo seguro y frenos del trabajo automático. Se guardan en la tabla `ajustes` (con una fila de auditoría
// por cada cambio) para que los lean los dos procesos y la herramienta de la consola.
//
// MODO SEGURO: el trabajador no se enciende; las pantallas siguen funcionando y lo que está en la fila espera
// sin perder nada. Se activa a mano (pantalla o consola) o solo:
//  - 'trabajador_inestable': el trabajo automático se cayó 5 veces en 15 minutos;
//  - 'servicio_inestable': OPORTIA se apagó mal 3 veces en 30 minutos;
//  - 'base_no_compatible': el trabajador no pudo abrir la base;
//  - 'base_danada': la revisión de la base encontró un problema.
// Las 3 primeras causas solas las puede arreglar un código nuevo: se quitan UNA vez cuando cambia la huella
// del código. El modo seguro manual y el de base dañada solo los quita una persona.
//
// FRENOS: un tipo de tarea que falla mucho seguido se frena un rato (5 min, 10 min… hasta 1 h) y se suelta
// solo. No hay botones: es automático.
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { TIPOS, definicion } from './tipos.js';
import { encolar } from './cola.js';

export const CLAVE_MODO_SEGURO = 'tareas.modo_seguro';
export const CLAVE_FRENOS = 'tareas.frenos';
export const ORIGENES_MODO_SEGURO = Object.freeze(['admin', 'consola', 'automatico']);
export const MOTIVOS_MODO_SEGURO = Object.freeze(['admin', 'consola', 'trabajador_inestable', 'servicio_inestable', 'base_no_compatible', 'base_danada']);
export const SE_LEVANTAN_CON_CODIGO_NUEVO = Object.freeze(['trabajador_inestable', 'servicio_inestable', 'base_no_compatible']);
export const QUIEN_QUITA = Object.freeze(['admin', 'consola', 'codigo_nuevo']);
export const MOTIVOS_FRENO = Object.freeze(['muchos_fallos']);

export const VENTANA_CAIDAS_SERVICIO_MS = 30 * 60_000;
export const CAIDAS_SERVICIO_PARA_MODO_SEGURO = 3;
export const FRENO_BASE_MS = 5 * 60_000;
export const FRENO_MAXIMO_MS = 60 * 60_000;

const iso = ms => new Date(ms).toISOString();

const APAGADO = Object.freeze({ activo: false, origen: null, motivo: null, desde: null, codigo: null, version: null, usuarioId: null, ultimo: null });

function leerAjuste(db, clave) {
  const fila = db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(clave);
  if (!fila) return null;
  try { return JSON.parse(fila.valor); } catch { return null; }
}

function guardarAjuste(db, clave, valor, ahora) {
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`)
    .run(clave, JSON.stringify(valor), iso(ahora));
}

// ---------- Modo seguro ----------
export function leerModoSeguro(db) {
  const valor = leerAjuste(db, CLAVE_MODO_SEGURO);
  if (!valor || typeof valor !== 'object') return { ...APAGADO };
  return { ...APAGADO, ...valor, activo: valor.activo === true };
}

// Activa o quita el modo seguro. origen: 'admin' | 'consola' | 'automatico' (y, solo al quitar, 'codigo_nuevo').
// Si ya está activo, una causa que NO se quita sola (manual o base dañada) reemplaza a una que sí; si no, se
// deja como está (no se pisa el «desde» original).
export function ponerModoSeguro(db, { activo, origen, motivo = null, codigo = null, version = null, usuarioId = null, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const actual = leerModoSeguro(db);
    if (activo === true) {
      if (!ORIGENES_MODO_SEGURO.includes(origen)) throw new Error(`Origen de modo seguro no válido: ${origen}`);
      const causa = origen === 'automatico' ? motivo : origen;
      if (!MOTIVOS_MODO_SEGURO.includes(causa) || (origen === 'automatico' && (causa === 'admin' || causa === 'consola'))) {
        throw new Error(`Motivo de modo seguro no válido: ${causa}`);
      }
      if (actual.activo && !(SE_LEVANTAN_CON_CODIGO_NUEVO.includes(actual.motivo) && !SE_LEVANTAN_CON_CODIGO_NUEVO.includes(causa))) {
        return { ...actual, cambio: false };
      }
      const nuevo = { activo: true, origen, motivo: causa, desde: iso(ahora), codigo, version, usuarioId, ultimo: actual.ultimo ?? null };
      guardarAjuste(db, CLAVE_MODO_SEGURO, nuevo, ahora);
      auditar(db, { usuarioId, accion: 'modo_seguro_activado', detalle: `${origen}: ${causa}` });
      abrirAviso(db, { clave: 'modo_seguro', nivel: origen === 'automatico' ? 'grave' : 'info', detalle: { origen, motivo: causa, codigo, version }, ahora });
      return { ...nuevo, cambio: true };
    }
    if (!QUIEN_QUITA.includes(origen)) throw new Error(`Origen de modo seguro no válido: ${origen}`);
    if (!actual.activo) return { ...actual, cambio: false };
    const nuevo = {
      ...APAGADO,
      ultimo: { desde: actual.desde, hasta: iso(ahora), por: origen, motivo: actual.motivo, origen: actual.origen, codigo: actual.codigo, usuarioId },
    };
    guardarAjuste(db, CLAVE_MODO_SEGURO, nuevo, ahora);
    auditar(db, { usuarioId, accion: 'modo_seguro_quitado', detalle: `${origen}: ${actual.motivo}` });
    resolverAviso(db, 'modo_seguro', ahora);
    // Después de un problema en la base, se vuelve a revisar enseguida (sin esperar a la madrugada).
    if (actual.motivo === 'base_danada') {
      encolar(db, {
        tipo: 'sistema.base', programa: 'sistema.base', claveUnica: `manual:sistema.base:${iso(ahora).slice(0, 16)}`, creadaPor: usuarioId,
      }, { ahora });
    }
    return { ...nuevo, cambio: true };
  });
}

// Al arrancar el servidor web: si el modo seguro es automático, por una causa que el código puede arreglar, y
// el código cambió desde que se activó, se quita UNA vez (queda en la auditoría). Si el código nuevo vuelve a
// fallar, se activa otra vez, ya con la huella nueva.
export function revisarAlArrancar(db, { codigo, version = null, ahora = Date.now() }) {
  const actual = leerModoSeguro(db);
  if (actual.activo && actual.origen === 'automatico' && SE_LEVANTAN_CON_CODIGO_NUEVO.includes(actual.motivo) && actual.codigo !== codigo) {
    const quitado = ponerModoSeguro(db, { activo: false, origen: 'codigo_nuevo', codigo, version, ahora });
    return { ...quitado, levantado: true };
  }
  return { ...actual, levantado: false };
}

// ---------- Arranques del servidor ----------
// Anota que el servidor web arrancó (después de abrir el puerto). Cuenta los arranques del MISMO código en los
// últimos 30 minutos que nunca se cerraron bien, desde el último cierre limpio; con 3 o más se activa el modo
// seguro 'servicio_inestable'. Devuelve { id, caidasRecientes, modoSeguro }.
export function registrarArranque(db, { version, codigo = '', pid = process.pid, ahora = Date.now(), ventanaMs = VENTANA_CAIDAS_SERVICIO_MS, caidasParaModoSeguro = CAIDAS_SERVICIO_PARA_MODO_SEGURO }) {
  return enTransaccion(db, () => {
    const caidasRecientes = db.prepare(`SELECT COUNT(*) AS n FROM servidor_arranques
      WHERE codigo = ? AND termino_en IS NULL AND empezo_en >= ?
        AND id > COALESCE((SELECT MAX(id) FROM servidor_arranques WHERE termino_en IS NOT NULL), 0)`)
      .get(String(codigo), iso(ahora - ventanaMs)).n;
    const r = db.prepare('INSERT INTO servidor_arranques (version, codigo, pid, empezo_en) VALUES (?, ?, ?, ?)')
      .run(String(version ?? ''), String(codigo), pid, iso(ahora));
    let modoSeguro = null;
    if (caidasRecientes >= caidasParaModoSeguro) {
      modoSeguro = ponerModoSeguro(db, { activo: true, origen: 'automatico', motivo: 'servicio_inestable', codigo, version, ahora });
    }
    return { id: Number(r.lastInsertRowid), caidasRecientes, modoSeguro };
  });
}

// Cierre limpio del servidor web (systemctl stop/restart, el actualizador).
export function registrarCierre(db, id, ahora = Date.now()) {
  return db.prepare("UPDATE servidor_arranques SET termino_en = ?, como_termino = 'normal' WHERE id = ? AND termino_en IS NULL")
    .run(iso(ahora), Number(id)).changes === 1;
}

// ---------- Frenos por tipo ----------
function todosLosFrenos(db) {
  const valor = leerAjuste(db, CLAVE_FRENOS);
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
}

// Los frenos que siguen puestos ahora: [{ tipo, motivo, desde, hasta, veces }].
export function leerFrenos(db, ahora = Date.now()) {
  const momento = iso(ahora);
  return Object.entries(todosLosFrenos(db))
    .filter(([, f]) => f && typeof f.hasta === 'string' && f.hasta > momento)
    .map(([tipo, f]) => ({ tipo, motivo: f.motivo ?? 'muchos_fallos', desde: f.desde, hasta: f.hasta, veces: f.veces ?? 1 }));
}

// Frena un tipo: 5 min la primera vez, el doble cada vez que se repite, hasta 1 h. Abre el aviso 'freno:<tipo>'.
export function frenarTipo(db, { tipo, ms = null, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const frenos = todosLosFrenos(db);
    const antes = frenos[tipo] ?? null;
    const veces = Math.max(0, Number(antes?.veces) || 0);
    const duracion = ms == null ? Math.min(FRENO_MAXIMO_MS, FRENO_BASE_MS * 2 ** veces) : Math.max(0, Number(ms));
    const freno = { motivo: 'muchos_fallos', desde: iso(ahora), hasta: iso(ahora + duracion), veces: veces + 1 };
    guardarAjuste(db, CLAVE_FRENOS, { ...frenos, [tipo]: freno }, ahora);
    auditar(db, { accion: 'tipo_frenado', detalle: `${tipo} hasta ${freno.hasta}` });
    abrirAviso(db, { clave: `freno:${tipo}`, nivel: 'atencion', detalle: { tipo, hasta: freno.hasta, veces: freno.veces }, ahora });
    return { tipo, ...freno };
  });
}

// Después de un paso bueno: la cuenta del tipo vuelve a cero y su aviso se resuelve. Solo escribe si hacía
// falta; devuelve true si cambió algo.
export function soltarFreno(db, { tipo, ahora = Date.now() }) {
  const frenos = todosLosFrenos(db);
  const antes = frenos[tipo];
  const avisoAbierto = db.prepare('SELECT 1 FROM avisos WHERE clave = ? AND resuelto_en IS NULL').get(`freno:${tipo}`);
  if (!(antes && Number(antes.veces) > 0) && !avisoAbierto) return false;
  return enTransaccion(db, () => {
    if (antes && Number(antes.veces) > 0) {
      const hasta = antes.hasta && antes.hasta < iso(ahora) ? antes.hasta : iso(ahora);
      guardarAjuste(db, CLAVE_FRENOS, { ...frenos, [tipo]: { ...antes, hasta, veces: 0, soltadoEn: iso(ahora) } }, ahora);
      auditar(db, { accion: 'freno_soltado', detalle: String(tipo) });
    }
    resolverAviso(db, `freno:${tipo}`, ahora);
    return true;
  });
}

// La cuenta en memoria del trabajador: cuántos pasos seguidos fallaron por tipo, y en cuántas tareas distintas.
// anotar() devuelve { frenar, soltar }: frenar cuando llegan a frenoTrasFallos (6) en 2 tareas o más; soltar
// en el primer paso bueno después de fallos o de un freno (o en el primero de esta vida del trabajador, por si
// quedó un freno de antes).
export function crearCuentaDeFallos({ registro = TIPOS } = {}) {
  const porTipo = new Map();
  return {
    anotar(tipo, tareaId, conError) {
      const cuenta = porTipo.get(tipo) ?? { seguidos: 0, tareas: new Set(), vistoBueno: false, frenado: false };
      porTipo.set(tipo, cuenta);
      if (!conError) {
        const soltar = cuenta.seguidos > 0 || cuenta.frenado || !cuenta.vistoBueno;
        cuenta.seguidos = 0;
        cuenta.tareas.clear();
        cuenta.vistoBueno = true;
        cuenta.frenado = false;
        return { frenar: false, soltar };
      }
      cuenta.seguidos += 1;
      cuenta.tareas.add(tareaId);
      const limite = definicion(tipo, registro)?.frenoTrasFallos ?? 6;
      if (cuenta.seguidos >= limite && cuenta.tareas.size >= 2) {
        cuenta.seguidos = 0;
        cuenta.tareas.clear();
        cuenta.frenado = true;
        return { frenar: true, soltar: false };
      }
      return { frenar: false, soltar: false };
    },
    estado: tipo => {
      const c = porTipo.get(tipo);
      return c ? { seguidos: c.seguidos, tareas: c.tareas.size } : { seguidos: 0, tareas: 0 };
    },
  };
}
