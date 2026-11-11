// La fila de tareas 24/7: crear, repartir, guardar el avance y recuperar tareas. Todo es síncrono y en
// transacciones cortas; la hora («ahora», en milisegundos) se puede pasar desde afuera para las pruebas.
//
// REGLAS QUE CUIDA ESTE ARCHIVO:
//  - Nunca se borra una tarea ni un evento: una tarea termina «hecha», «fallida», «cancelada» o «por revisar»,
//    y su historia queda en tarea_eventos.
//  - «Cerca» (dueno + tomas): solo quien tomó la tarea, y en ESA toma, puede guardar su avance. Si otro la
//    recuperó entretanto, lo que llegue tarde no cambia nada.
//  - Turnos justos por TIEMPO usado: primero entre cuentas y después entre los proyectos de una cuenta. Una
//    cuenta que estuvo quieta mucho tiempo adelanta como mucho 60 s (el «tope de crédito»).
//  - Privacidad: de las tareas de proyectos solo se muestra el tipo, el estado, los contadores, el número de
//    proyecto y de cuenta, y un motivo que sea una clave. Nunca sus datos ni sus resultados.
import { enTransaccion } from '../nucleo/db.js';
import { ErrorHttp } from '../nucleo/http.js';
import { auditar } from '../cuentas/usuarios.js';
import { TIPOS, CUPOS, FASE_ACTUAL, POR_DEFECTO, PROGRAMAS_DEL_SISTEMA, ANORMALES, ErrorTarea, definicion, tiposEjecutables } from './tipos.js';
import { ranura } from './tiempo.js';

export const ESTADOS_TAREA = Object.freeze(['lista', 'en_curso', 'hecha', 'fallida', 'cancelada', 'revisar']);
export const VIVAS = Object.freeze(['lista', 'en_curso', 'revisar']);
export const EVENTOS = Object.freeze(['error', 'espera', 'fallida', 'revisar', 'abandonada', 'interrumpida', 'cancelada', 'reintentada', 'programa_saltado']);
// Qué se puede hacer con una tarea desde la pantalla de Administrador, según su estado.
export const SE_PUEDE = Object.freeze({
  reintentar: Object.freeze(['fallida', 'revisar', 'cancelada']),
  cancelar: Object.freeze(['lista', 'revisar']),
});
export const MAXIMO_RESULTADO = 4000; // los resultados grandes van en sus propias tablas (fase 2), nunca aquí
export const MAXIMO_PUNTO = 16_000;
export const MAXIMO_DATOS = 16_000;
export const TOPE_CREDITO_MS = 60_000;
export const ARRIENDO_MS = 120_000;
export const MARGEN_ARRIENDO_MS = 30_000;
export const ESPERA_MINIMA_MS = 1000;
export const ESPERA_MAXIMA_MS = 7 * 86_400_000;
export const ATRASO_MS = 2 * 3_600_000;

const CLAVE_PUBLICA = /^[a-z_]{1,60}$/;

const iso = ms => new Date(ms).toISOString();
const falla = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

function leerJson(texto, porDefecto) {
  if (texto == null) return porDefecto;
  try { return JSON.parse(texto); } catch { return porDefecto; }
}

function textoCorto(valor, largo = 120) {
  return String(valor ?? '').slice(0, largo);
}

function anotarEvento(db, tareaId, evento, detalle, ahora) {
  if (!EVENTOS.includes(evento)) throw new Error(`Evento de tarea no válido: ${evento}`);
  let texto = detalle == null ? null : JSON.stringify(detalle);
  if (texto && texto.length > 1000) texto = JSON.stringify({ recortado: texto.slice(0, 900) });
  db.prepare('INSERT INTO tarea_eventos (tarea_id, fecha, evento, detalle) VALUES (?, ?, ?, ?)').run(tareaId, iso(ahora), evento, texto);
}

// Lo que se puede mostrar de un motivo. Las tareas del sistema muestran el texto tal cual; las de proyectos
// solo una clave (por ejemplo 'tiempo_agotado'), o 'error_interno' si es otra cosa.
export function motivoParaMostrar(tipo, motivo) {
  if (motivo == null || motivo === '') return null;
  if (String(tipo).startsWith('sistema.')) return textoCorto(motivo);
  return CLAVE_PUBLICA.test(String(motivo)) ? String(motivo) : 'error_interno';
}

// ---------- Carriles (para repartir turnos) ----------
export function carrilesDe(espacioId, proyectoId) {
  if (proyectoId != null) {
    if (espacioId == null) throw new Error('carrilesDe: un proyecto siempre tiene cuenta');
    return { espacio: `e:${espacioId}`, proyecto: `p:${proyectoId}` };
  }
  if (espacioId != null) return { espacio: `e:${espacioId}`, proyecto: `e:${espacioId}:sin_proyecto` };
  return { espacio: 'sistema', proyecto: 'sistema' };
}

// Cuánto esperar antes del siguiente intento: 1 min, 4 min, 16 min… (con ±25 % al azar), hasta el tope.
export function esperaDeReintento(fallos, politica = POR_DEFECTO.reintentos, azar = Math.random) {
  const n = Math.max(1, Math.trunc(Number(fallos)) || 1);
  const { baseMs, factor, topeMs } = { ...POR_DEFECTO.reintentos, ...(politica ?? {}) };
  const base = Math.min(topeMs, baseMs * factor ** (n - 1));
  return Math.round(base * (0.75 + 0.5 * azar()));
}

// Los tipos que se pueden tomar ahora: los que este código conoce, menos los frenados por fallar mucho y,
// si falta memoria o disco, menos los que no son de vigilancia.
export function tiposPermitidos({ registro = TIPOS, fase = FASE_ACTUAL, frenos = [], frenoRecursos = null } = {}) {
  const frenados = new Set(frenos.map(f => f.tipo));
  return tiposEjecutables(registro, fase).filter(tipo => !frenados.has(tipo) && (!frenoRecursos || definicion(tipo, registro).ignoraFrenos));
}

function tareaDeFila(f) {
  return {
    id: f.id,
    tipo: f.tipo,
    espacioId: f.espacio_id,
    proyectoId: f.proyecto_id,
    programa: f.programa,
    cupo: f.cupo,
    carrilEspacio: f.carril_espacio,
    carrilProyecto: f.carril_proyecto,
    repetible: f.repetible === 1,
    estado: f.estado,
    datos: leerJson(f.datos, {}),
    punto: leerJson(f.punto, null),
    pasos: f.pasos,
    tomas: f.tomas,
    fallosSeguidos: f.fallos_seguidos,
    maxFallos: f.max_fallos,
    intento: f.fallos_seguidos + 1,
    dueno: f.dueno,
    arriendoHasta: f.arriendo_hasta,
    empezadaEn: f.empezada_en,
  };
}

// ---------- Crear ----------
// Devuelve { id, nueva }. Si ya existe la misma clave_unica, o ya hay una tarea viva del mismo programa, no
// crea nada (nueva: false). ON CONFLICT DO NOTHING cubre las dos cosas y, a diferencia de INSERT OR IGNORE,
// no esconde un estado no válido (el CHECK sigue fallando).
export function encolar(db, { tipo, espacioId = null, proyectoId = null, programa = null, datos = {}, claveUnica = null, prioridad = null, disponibleEn = null, creadaPor = null } = {}, { registro = TIPOS, fase = FASE_ACTUAL, ahora = Date.now() } = {}) {
  const def = definicion(tipo, registro);
  if (!def) throw falla('tipo_desconocido', `Tipo de tarea desconocido: ${tipo}`);
  if (def.fase > fase) throw falla('tipo_de_otra_fase', `El tipo ${tipo} es de la fase ${def.fase}`);
  if (!Object.hasOwn(CUPOS, def.cupo)) throw falla('cupo_no_valido', `Cupo no válido para ${tipo}: ${def.cupo}`);
  const textoDatos = JSON.stringify(datos ?? {});
  if (textoDatos.length > MAXIMO_DATOS) throw falla('datos_muy_grandes', `Los datos de la tarea pasan de ${MAXIMO_DATOS} caracteres`);
  const orden = prioridad == null ? def.prioridad : Number(prioridad);
  if (!Number.isSafeInteger(orden)) throw falla('prioridad_no_valida', 'La prioridad debe ser un número entero');
  let espacio = espacioId == null ? null : Number(espacioId);
  const proyecto = proyectoId == null ? null : Number(proyectoId);
  if (proyecto != null) {
    const p = db.prepare('SELECT espacio_id FROM proyectos WHERE id = ?').get(proyecto);
    if (!p) throw falla('proyecto_no_existe', `No existe el proyecto ${proyecto}`);
    if (espacio != null && espacio !== p.espacio_id) throw falla('proyecto_de_otra_cuenta', 'El proyecto es de otra cuenta');
    espacio = p.espacio_id;
  }
  const carriles = carrilesDe(espacio, proyecto);
  const momento = iso(ahora);
  const r = db.prepare(`INSERT INTO tareas (tipo, espacio_id, proyecto_id, programa, clave_unica, carril_espacio, carril_proyecto, cupo,
      prioridad, repetible, estado, datos, max_fallos, disponible_en, creada_por, creada_en, actualizada_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lista', ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
    .run(tipo, espacio, proyecto, programa, claveUnica, carriles.espacio, carriles.proyecto, def.cupo,
      orden, def.repetible ? 1 : 0, textoDatos, def.maxFallos, disponibleEn == null ? momento : iso(disponibleEn), creadaPor, momento, momento);
  if (r.changes === 1) return { id: Number(r.lastInsertRowid), nueva: true };
  const existente = (claveUnica != null && db.prepare('SELECT id FROM tareas WHERE clave_unica = ?').get(claveUnica))
    || (programa != null && db.prepare("SELECT id FROM tareas WHERE programa = ? AND estado IN ('lista', 'en_curso', 'revisar')").get(programa))
    || null;
  return { id: existente?.id ?? null, nueva: false };
}

// ---------- Elegir y tomar ----------
const FILTRO_TOMABLE = `t.estado = 'lista' AND t.cupo = ? AND t.disponible_en <= ?
  AND t.tipo IN (SELECT value FROM json_each(?))
  AND (t.proyecto_id IS NULL OR (p.estado = 'en_ejecucion' AND p.en_papelera = 0))`;

// Solo LEE (fuera de cualquier candado). Devuelve la siguiente candidata, o null. Las tareas de tipos que este
// código no conoce, y las de proyectos en pausa, terminados o en la papelera, esperan sin perder nada.
export function elegir(db, { cupo, tipos, ocupados = [], ahora = Date.now() }) {
  const momento = iso(ahora);
  const listaTipos = JSON.stringify(tipos ?? []);
  const c = db.prepare(`SELECT t.*, COALESCE(ce.virtual_ms, 0) AS v_espacio, COALESCE(cp.virtual_ms, 0) AS v_proyecto
    FROM tareas t
    LEFT JOIN tarea_carriles ce ON ce.carril = t.carril_espacio
    LEFT JOIN tarea_carriles cp ON cp.carril = t.carril_proyecto
    LEFT JOIN proyectos p ON p.id = t.proyecto_id
    WHERE ${FILTRO_TOMABLE}
    ORDER BY (t.carril_proyecto IN (SELECT value FROM json_each(?))) ASC,
      v_espacio, v_proyecto, t.prioridad DESC, t.disponible_en, t.id
    LIMIT 1`).get(cupo, momento, listaTipos, JSON.stringify(ocupados ?? []));
  if (!c) return null;
  // El menor tiempo de las OTRAS cuentas con trabajo listo, y el de los otros proyectos de esta cuenta.
  const otrasCuentas = db.prepare(`SELECT MIN(COALESCE(ce.virtual_ms, 0)) AS m FROM tareas t
    LEFT JOIN tarea_carriles ce ON ce.carril = t.carril_espacio LEFT JOIN proyectos p ON p.id = t.proyecto_id
    WHERE ${FILTRO_TOMABLE} AND t.carril_espacio <> ?`).get(cupo, momento, listaTipos, c.carril_espacio).m;
  const otrosProyectos = db.prepare(`SELECT MIN(COALESCE(cp.virtual_ms, 0)) AS m FROM tareas t
    LEFT JOIN tarea_carriles cp ON cp.carril = t.carril_proyecto LEFT JOIN proyectos p ON p.id = t.proyecto_id
    WHERE ${FILTRO_TOMABLE} AND t.carril_espacio = ? AND t.carril_proyecto <> ?`).get(cupo, momento, listaTipos, c.carril_espacio, c.carril_proyecto).m;
  return { ...c, minOtrosEspacio: otrasCuentas ?? null, minOtrosProyecto: otrosProyectos ?? null };
}

function subirAlTope(db, carril, actual, minOtros, momento) {
  if (minOtros == null) return;
  const piso = minOtros - TOPE_CREDITO_MS;
  if (!(actual < piso)) return;
  db.prepare(`INSERT INTO tarea_carriles (carril, virtual_ms, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(carril) DO UPDATE SET virtual_ms = MAX(virtual_ms, excluded.virtual_ms), actualizado_en = excluded.actualizado_en`)
    .run(carril, piso, momento);
}

// Toma la candidata para esta corrida. null si otro la tomó primero (o cambió algo): se elige otra vez.
export function marcarTomada(db, { candidata, corrida, arriendoMs = ARRIENDO_MS, ahora = Date.now() }) {
  if (!candidata || !corrida) throw new Error('marcarTomada necesita la candidata y la corrida');
  return enTransaccion(db, () => {
    const momento = iso(ahora);
    const r = db.prepare(`UPDATE tareas SET estado = 'en_curso', dueno = ?, tomas = tomas + 1, arriendo_hasta = ?, motivo_espera = NULL,
        empezada_en = COALESCE(empezada_en, ?), actualizada_en = ?
      WHERE id = ? AND estado = 'lista' AND tomas = ?
        AND (proyecto_id IS NULL OR EXISTS (SELECT 1 FROM proyectos p WHERE p.id = tareas.proyecto_id AND p.estado = 'en_ejecucion' AND p.en_papelera = 0))`)
      .run(corrida, iso(ahora + arriendoMs), momento, momento, candidata.id, candidata.tomas);
    if (r.changes !== 1) return null;
    subirAlTope(db, candidata.carril_espacio, candidata.v_espacio, candidata.minOtrosEspacio, momento);
    if (candidata.carril_proyecto !== candidata.carril_espacio) {
      subirAlTope(db, candidata.carril_proyecto, candidata.v_proyecto, candidata.minOtrosProyecto, momento);
    }
    return tareaDeFila(db.prepare('SELECT * FROM tareas WHERE id = ?').get(candidata.id));
  });
}

// ---------- Lo que devuelve un paso ----------
// Un error que pone NUESTRO código (no el trabajo): por ejemplo, el trabajo devolvió algo que no se puede guardar.
function salidaDeErrorClave(clave, reintentable = false) {
  return { tipo: 'error', error: { clave, reintentable, esperarMs: null, noEsFallo: false, revisar: false, delTrabajo: false } };
}

// El texto JSON de un valor, o null si no se puede convertir (un BigInt, un objeto que se contiene a sí mismo,
// un toJSON que falla…). Así un resultado raro es un error de la tarea y nunca tumba al trabajador.
function aJson(valor) {
  try {
    return { texto: JSON.stringify(valor ?? null) };
  } catch {
    return null;
  }
}

// Convierte lo que devolvió un paso en una de tres salidas: listo, seguir (con su punto) o error.
// Cualquier otra cosa es el error 'respuesta_no_valida', que no se reintenta (es un error del código).
export function normalizarSalida(valor) {
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    if (valor.listo === true) {
      if (!aJson(valor.resultado)) return salidaDeErrorClave('respuesta_no_valida');
      return { tipo: 'listo', resultado: valor.resultado ?? null };
    }
    if (Object.hasOwn(valor, 'punto') && valor.listo !== true) {
      if (!aJson(valor.punto)) return salidaDeErrorClave('respuesta_no_valida');
      const esperarMs = valor.esperarMs == null ? 0 : Number(valor.esperarMs);
      if (!Number.isFinite(esperarMs) || esperarMs < 0) return salidaDeErrorClave('respuesta_no_valida');
      const motivo = valor.motivo == null ? null : textoCorto(valor.motivo, 60);
      return { tipo: 'seguir', punto: valor.punto, esperarMs, motivo };
    }
  }
  return salidaDeErrorClave('respuesta_no_valida');
}

// Qué clase de error es. ErrorTarea guarda lo que dijo el trabajo (delTrabajo: true: el trabajo sabe lo que
// pasó); un corte por tiempo es 'tiempo_agotado' (se reintenta); cualquier otro error se reintenta, con su
// mensaje recortado. Para un tipo repetible:false, solo un ErrorTarea puede volver a la fila (ver guardarPaso).
export function clasificarError(error) {
  if (error instanceof ErrorTarea || error?.name === 'ErrorTarea') {
    return {
      clave: textoCorto(error.clave ?? error.message) || 'error',
      reintentable: error.reintentable !== false,
      esperarMs: error.esperarMs == null ? null : Number(error.esperarMs),
      noEsFallo: error.noEsFallo === true,
      revisar: error.revisar === true,
      delTrabajo: true,
    };
  }
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return { clave: 'tiempo_agotado', reintentable: true, esperarMs: null, noEsFallo: false, revisar: false, delTrabajo: false };
  }
  return { clave: textoCorto(error?.message ?? error) || 'error', reintentable: true, esperarMs: null, noEsFallo: false, revisar: false, delTrabajo: false };
}

export function salidaDeError(error) {
  return { tipo: 'error', error: clasificarError(error) };
}

function cobrarTiempo(db, f, ms, momento) {
  const carriles = f.carril_espacio === f.carril_proyecto ? [f.carril_espacio] : [f.carril_espacio, f.carril_proyecto];
  const cobrar = db.prepare(`INSERT INTO tarea_carriles (carril, virtual_ms, usado_ms, turnos, actualizado_en) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(carril) DO UPDATE SET virtual_ms = virtual_ms + excluded.usado_ms / MAX(peso, 0.01), usado_ms = usado_ms + excluded.usado_ms,
      turnos = turnos + 1, actualizado_en = excluded.actualizado_en`);
  for (const carril of carriles) cobrar.run(carril, ms, ms, momento);
  db.prepare('UPDATE tareas SET ms_usados = ms_usados + ? WHERE id = ?').run(ms, f.id);
}

// Guarda lo que pasó en un paso, con la cerca: si la tarea ya no es de esta corrida y de esta toma, devuelve
// aceptado:false y no cambia nada. Si queda «fallida» y es de un proyecto, alFallar (marcarConErrores) corre
// en la MISMA transacción: o queda todo guardado, o nada.
export function guardarPaso(db, { tarea, corrida, salida, duracionMs = 0, ahora = Date.now(), azar = Math.random, alFallar = null, registro = TIPOS }) {
  return enTransaccion(db, () => {
    const f = db.prepare('SELECT * FROM tareas WHERE id = ?').get(tarea?.id);
    if (!f || f.estado !== 'en_curso' || f.dueno !== corrida || f.tomas !== tarea.tomas) {
      return { aceptado: false, estado: f?.estado ?? null, fallida: false, motivo: 'ya_no_es_mia' };
    }
    const momento = iso(ahora);
    cobrarTiempo(db, f, Math.max(0, Math.round(Number(duracionMs) || 0)), momento);
    let s = salida && ['listo', 'seguir', 'error'].includes(salida.tipo) ? salida : normalizarSalida(null);

    if (s.tipo === 'listo') {
      const json = s.resultado == null ? { texto: null } : aJson(s.resultado);
      const texto = json?.texto ?? null;
      if (!json) s = salidaDeErrorClave('respuesta_no_valida');
      else if (texto != null && texto.length > MAXIMO_RESULTADO) s = salidaDeErrorClave('resultado_muy_grande');
      else {
        db.prepare(`UPDATE tareas SET estado = 'hecha', resultado = ?, pasos = pasos + 1, fallos_seguidos = 0, motivo_espera = NULL,
          dueno = NULL, arriendo_hasta = NULL, terminada_en = ?, actualizada_en = ? WHERE id = ?`).run(texto, momento, momento, f.id);
        return { aceptado: true, estado: 'hecha', fallida: false, motivo: null };
      }
    }

    if (s.tipo === 'seguir') {
      const json = aJson(s.punto);
      const texto = json?.texto ?? 'null';
      if (!json) s = salidaDeErrorClave('respuesta_no_valida');
      else if (texto.length > MAXIMO_PUNTO) s = salidaDeErrorClave('punto_muy_grande');
      else {
        const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(0, Number(s.esperarMs) || 0));
        db.prepare(`UPDATE tareas SET estado = 'lista', punto = ?, pasos = pasos + 1, fallos_seguidos = 0, disponible_en = ?, motivo_espera = ?,
          dueno = NULL, arriendo_hasta = NULL, actualizada_en = ? WHERE id = ?`).run(texto, iso(ahora + espera), s.motivo ?? null, momento, f.id);
        return { aceptado: true, estado: 'lista', fallida: false, motivo: s.motivo ?? null };
      }
    }

    const e = s.error ?? clasificarError(null);
    if (e.noEsFallo) {
      // Una espera que no es culpa de la tarea (tope de gasto, cortesía con una web): no cuenta como fallo.
      const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(ESPERA_MINIMA_MS, Number(e.esperarMs) || 0));
      db.prepare(`UPDATE tareas SET estado = 'lista', disponible_en = ?, motivo_espera = ?, dueno = NULL, arriendo_hasta = NULL, actualizada_en = ?
        WHERE id = ?`).run(iso(ahora + espera), textoCorto(e.clave, 60), momento, f.id);
      anotarEvento(db, f.id, 'espera', { motivo: e.clave, esperaMs: espera }, ahora);
      return { aceptado: true, estado: 'lista', fallida: false, motivo: e.clave, espera: true };
    }

    const fallos = f.fallos_seguidos + 1;
    let estado = 'lista';
    let evento = 'error';
    let disponible = f.disponible_en;
    // Un tipo que «manda algo» (repetible:false) nunca se repite solo: si el paso se cortó por tiempo o falló sin
    // que el trabajo dijera qué pasó (un ErrorTarea), pudo haber mandado ya. Una persona revisa.
    if (e.revisar || (f.repetible === 0 && e.delTrabajo !== true)) { estado = 'revisar'; evento = 'revisar'; }
    else if (!e.reintentable || fallos >= f.max_fallos) { estado = 'fallida'; evento = 'fallida'; }
    else {
      const def = definicion(f.tipo, registro);
      const espera = e.esperarMs != null && Number.isFinite(e.esperarMs) ? Math.max(0, e.esperarMs) : esperaDeReintento(fallos, def?.reintentos, azar);
      disponible = iso(ahora + Math.min(ESPERA_MAXIMA_MS, espera));
    }
    const final = estado === 'fallida' || estado === 'revisar';
    db.prepare(`UPDATE tareas SET estado = ?, fallos_seguidos = ?, ultimo_error = ?, disponible_en = ?, motivo_espera = NULL,
      dueno = NULL, arriendo_hasta = NULL, terminada_en = ?, actualizada_en = ? WHERE id = ?`)
      .run(estado, fallos, textoCorto(e.clave), disponible, final ? momento : null, momento, f.id);
    anotarEvento(db, f.id, evento, { motivo: textoCorto(e.clave), intento: fallos, maxFallos: f.max_fallos }, ahora);
    if (estado === 'fallida' && f.proyecto_id != null && alFallar) alFallar(db, f.proyecto_id, motivoParaMostrar(f.tipo, e.clave));
    return { aceptado: true, estado, fallida: estado === 'fallida', motivo: e.clave, fallos };
  });
}

// Comprueba, dentro de una escritura, que la tarea sigue siendo de esta corrida y de esta toma.
export function asegurarQueEsMia(db, tarea, corrida) {
  const sigue = db.prepare("SELECT 1 FROM tareas WHERE id = ? AND estado = 'en_curso' AND dueno = ? AND tomas = ?").get(tarea?.id, corrida, tarea?.tomas);
  if (!sigue) throw new ErrorTarea('ya_no_es_mia', { reintentable: false });
}

// La función «escribir» que recibe cada trabajo (ctx.escribir): pasa por el escritor (con su pausa) y, en la
// misma transacción, comprueba la cerca. Si la tarea ya no es suya, lanza 'ya_no_es_mia' y no escribe nada.
// { transaccion: false } es solo para órdenes PRAGMA que no pueden ir dentro de una transacción (por ejemplo
// wal_checkpoint): la cerca se comprueba justo antes.
export function escritorDeTarea(escritor, db, { tarea, corrida }) {
  return (trabajo, { transaccion = true } = {}) => escritor.escribir(() => {
    asegurarQueEsMia(db, tarea, corrida);
    return trabajo();
  }, { transaccion });
}

// ---------- Devolver y recuperar ----------
// Suelta una tarea en curso (con la cerca de su dueño y su toma). Devuelve { id, estado, proyectoId } o null.
//  - repetible = 0 → «por revisar» (nunca se repite sola: podría mandar dos veces un correo);
//  - contando un fallo → «fallida» si llegó a su máximo (y alFallar en la misma transacción), si no «lista»
//    con la espera de reintento;
//  - sin fallo → «lista» de una vez, sin perder nada.
function soltar(db, f, { conFallo, motivo, eventoSinFallo, ahora, azar, alFallar, registro }) {
  return enTransaccion(db, () => {
    const momento = iso(ahora);
    let fallos = f.fallos_seguidos;
    let estado = 'lista';
    let evento = eventoSinFallo;
    let disponible = momento;
    if (conFallo) fallos += 1;
    if (f.repetible === 0) { estado = 'revisar'; evento = 'revisar'; }
    else if (conFallo && fallos >= f.max_fallos) { estado = 'fallida'; evento = 'fallida'; }
    else if (conFallo) {
      evento = 'abandonada';
      disponible = iso(ahora + esperaDeReintento(fallos, definicion(f.tipo, registro)?.reintentos, azar));
    }
    const final = estado === 'fallida' || estado === 'revisar';
    // Sin fallo, el último error real de la tarea no se pisa.
    const error = conFallo || final ? textoCorto(motivo) : null;
    const r = db.prepare(`UPDATE tareas SET estado = ?, fallos_seguidos = ?, ultimo_error = COALESCE(?, ultimo_error), dueno = NULL, arriendo_hasta = NULL,
        disponible_en = ?, motivo_espera = NULL, terminada_en = ?, actualizada_en = ?
      WHERE id = ? AND estado = 'en_curso' AND dueno IS ? AND tomas = ?`)
      .run(estado, fallos, error, estado === 'lista' ? disponible : f.disponible_en, final ? momento : null, momento, f.id, f.dueno, f.tomas);
    if (r.changes !== 1) return null;
    anotarEvento(db, f.id, evento, { motivo: textoCorto(motivo), intento: fallos, maxFallos: f.max_fallos, conFallo: Boolean(conFallo) }, ahora);
    if (estado === 'fallida' && f.proyecto_id != null && alFallar) alFallar(db, f.proyecto_id, motivoParaMostrar(f.tipo, motivo));
    return { id: f.id, estado, proyectoId: f.proyecto_id };
  });
}

// Al apagarse: el trabajador devuelve lo que tenía en las manos. Sin fallo (una actualización no gasta
// intentos), salvo conFallo (salió por falta de memoria: la tarea pudo ser la culpable).
// culpables: tareas cuyo paso no se pudo guardar (el trabajador sale por eso). Esas SÍ suman un fallo, con el
// motivo 'no_se_pudo_guardar': así una tarea que nunca se puede guardar queda «fallida» después de sus intentos,
// en vez de hacer caer al trabajador una y otra vez hasta el modo seguro.
export function devolverLasMias(db, { corrida, conFallo = false, motivo = 'apagado', culpables = [], ahora = Date.now(), azar = Math.random, alFallar = null, registro = TIPOS }) {
  const filas = db.prepare("SELECT * FROM tareas WHERE estado = 'en_curso' AND dueno = ?").all(corrida);
  const culpable = new Set(culpables);
  return filas.map(f => soltar(db, f, {
    conFallo: conFallo || culpable.has(f.id), motivo: culpable.has(f.id) ? 'no_se_pudo_guardar' : motivo, eventoSinFallo: 'interrumpida', ahora, azar, alFallar, registro,
  })).filter(Boolean);
}

// Tareas «en curso» cuyo dueño ya no es una corrida abierta. El fallo se cuenta según cómo terminó esa corrida:
// si se cayó (ANORMALES) la tarea pudo ser la culpable; si fue un apagón o un apagado normal, no.
// corridas: solo las de esas corridas (lo usa el servidor web cuando el trabajador acaba de salir).
export function recuperarAbandonadas(db, { yo = null, corridas = null, ahora = Date.now(), azar = Math.random, alFallar = null, registro = TIPOS } = {}) {
  const filas = db.prepare(`SELECT t.*, c.corrida AS c_corrida, c.como_termino AS c_como FROM tareas t
    LEFT JOIN trabajador_corridas c ON c.corrida = t.dueno
    WHERE t.estado = 'en_curso' AND (c.id IS NULL OR c.termino_en IS NOT NULL)`).all()
    .filter(f => (yo == null || f.dueno !== yo) && (corridas == null || corridas.includes(f.dueno)));
  return filas.map(f => {
    const conFallo = ANORMALES.includes(f.c_como);
    const motivo = f.c_corrida ? `trabajador_${f.c_como ?? 'sin_fin'}` : 'sin_dueno';
    return soltar(db, f, { conFallo, motivo, eventoSinFallo: 'interrumpida', ahora, azar, alFallar, registro });
  }).filter(Boolean);
}

// Tareas de OTRA corrida cuyo arriendo venció hace más de 30 s (su dueño dejó de latir): cuentan un fallo.
// Las mías nunca se tocan aquí.
export function recuperarVencidas(db, { yo = null, ahora = Date.now(), azar = Math.random, alFallar = null, margenMs = MARGEN_ARRIENDO_MS, registro = TIPOS } = {}) {
  const filas = db.prepare("SELECT * FROM tareas WHERE estado = 'en_curso' AND arriendo_hasta < ? AND dueno IS NOT ?").all(iso(ahora - margenMs), yo);
  return filas.map(f => soltar(db, f, { conFallo: true, motivo: 'arriendo_vencido', eventoSinFallo: 'interrumpida', ahora, azar, alFallar, registro })).filter(Boolean);
}

// ---------- Programas (trabajos que se repiten) ----------
// Solo se encola la ranura de AHORA: tras 3 días apagado se hace una sola vez. Si la tarea anterior del
// programa sigue viva, no se encima otra: se anota «programa_saltado» (una vez por ranura) y se prueba de
// nuevo más tarde; la ranura corre apenas termine la anterior.
// recordadas y saltos son memoria del trabajador para no tocar la base cuando no hace falta.
export function programar(db, { programas = PROGRAMAS_DEL_SISTEMA, tipos = null, ahora = Date.now(), recordadas = new Map(), saltos = new Map(), registro = TIPOS, fase = FASE_ACTUAL } = {}) {
  const conocidos = new Set(tipos ?? tiposEjecutables(registro, fase));
  let creadas = 0;
  let saltadas = 0;
  for (const plan of programas) {
    if (!conocidos.has(plan.tipo) || !definicion(plan.tipo, registro)) continue;
    const r = ranura(plan, ahora);
    if (!r) continue;
    if (recordadas.get(plan.programa) === r.clave) continue;
    if (db.prepare('SELECT 1 FROM tareas WHERE clave_unica = ?').get(r.clave)) { recordadas.set(plan.programa, r.clave); continue; }
    const viva = db.prepare("SELECT id FROM tareas WHERE programa = ? AND estado IN ('lista', 'en_curso', 'revisar') ORDER BY id LIMIT 1").get(plan.programa);
    if (viva) {
      saltadas += 1;
      if (saltos.get(plan.programa) !== r.clave) {
        const detalle = { ranura: r.clave };
        const ya = db.prepare("SELECT 1 FROM tarea_eventos WHERE tarea_id = ? AND evento = 'programa_saltado' AND detalle = ?").get(viva.id, JSON.stringify(detalle));
        if (!ya) anotarEvento(db, viva.id, 'programa_saltado', detalle, ahora);
        saltos.set(plan.programa, r.clave);
      }
      continue;
    }
    const { nueva } = encolar(db, {
      tipo: plan.tipo, espacioId: plan.espacioId ?? null, proyectoId: plan.proyectoId ?? null, programa: plan.programa, claveUnica: r.clave, datos: plan.datos ?? {},
    }, { registro, fase, ahora });
    if (nueva) {
      creadas += 1;
      recordadas.set(plan.programa, r.clave);
    }
  }
  return { creadas, saltadas };
}

// Cuándo toca cada programa la próxima vez, y cómo le fue la última.
export function proximasEjecuciones(db, { programas = PROGRAMAS_DEL_SISTEMA, ahora = Date.now() } = {}) {
  return programas.map(plan => {
    const r = ranura(plan, ahora);
    const ultima = db.prepare('SELECT estado, creada_en, terminada_en FROM tareas WHERE programa = ? ORDER BY id DESC LIMIT 1').get(plan.programa);
    let proxima = null;
    if (r) proxima = db.prepare('SELECT 1 FROM tareas WHERE clave_unica = ?').get(r.clave) ? r.siguiente : Math.max(r.inicio, ahora);
    return {
      programa: plan.programa,
      tipo: plan.tipo,
      proximaEn: proxima == null ? null : iso(proxima),
      ultimaEn: ultima ? (ultima.terminada_en ?? ultima.creada_en) : null,
      ultimoEstado: ultima?.estado ?? null,
    };
  });
}

// ---------- Botones del administrador ----------
function tareaParaAccion(db, id) {
  const numero = Number(id);
  if (!Number.isSafeInteger(numero) || numero <= 0) throw new ErrorHttp(404, 'no_existe');
  const f = db.prepare('SELECT * FROM tareas WHERE id = ?').get(numero);
  if (!f) throw new ErrorHttp(404, 'no_existe');
  return f;
}

export function reintentar(db, { id, usuarioId = null, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const f = tareaParaAccion(db, id);
    if (!SE_PUEDE.reintentar.includes(f.estado)) throw new ErrorHttp(409, 'accion_no_permitida_ahora');
    if (f.programa != null && db.prepare("SELECT 1 FROM tareas WHERE programa = ? AND id <> ? AND estado IN ('lista', 'en_curso', 'revisar')").get(f.programa, f.id)) {
      throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
    }
    const momento = iso(ahora);
    db.prepare(`UPDATE tareas SET estado = 'lista', fallos_seguidos = 0, disponible_en = ?, motivo_espera = NULL, terminada_en = NULL,
      dueno = NULL, arriendo_hasta = NULL, actualizada_en = ? WHERE id = ? AND estado = ?`).run(momento, momento, f.id, f.estado);
    anotarEvento(db, f.id, 'reintentada', { desde: f.estado, usuarioId }, ahora);
    auditar(db, { usuarioId, accion: 'tarea_reintentada', detalle: `${f.tipo} n.º ${f.id} (${f.estado})` });
    return { id: f.id, estado: 'lista' };
  });
}

export function cancelar(db, { id, usuarioId = null, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const f = tareaParaAccion(db, id);
    if (!SE_PUEDE.cancelar.includes(f.estado)) throw new ErrorHttp(409, 'accion_no_permitida_ahora');
    const momento = iso(ahora);
    db.prepare(`UPDATE tareas SET estado = 'cancelada', motivo_espera = NULL, terminada_en = ?, actualizada_en = ? WHERE id = ? AND estado = ?`)
      .run(momento, momento, f.id, f.estado);
    anotarEvento(db, f.id, 'cancelada', { desde: f.estado, usuarioId }, ahora);
    auditar(db, { usuarioId, accion: 'tarea_cancelada', detalle: `${f.tipo} n.º ${f.id} (${f.estado})` });
    return { id: f.id, estado: 'cancelada' };
  });
}

// ---------- Lo que se muestra ----------
// Los números de la fila. Se cuentan en SQLite (GROUP BY), nunca trayendo cada fila a JavaScript: aunque la fila
// tuviera cien mil tareas, las pantallas no se congelan.
export function resumenFila(db, { tipos = null, ahora = Date.now() } = {}) {
  const conocidos = [...new Set(tipos ?? tiposEjecutables())];
  const momento = iso(ahora);
  const resumen = {
    listas: 0, esperando: 0, enCurso: 0, revisar: 0, enPausa: 0, esperanVersion: 0,
    fallidas7d: 0, hechas24h: 0, fallidas24h: 0, canceladas24h: 0, masViejaDesde: null, atrasadaDesde: null,
  };
  // Cada tarea viva cae en UN grupo, en este orden (igual que antes): en curso, por revisar, de un tipo que esta
  // versión no conoce, de un proyecto en pausa, esperando su hora, o lista para tomar.
  const grupos = db.prepare(`SELECT grupo, COUNT(*) AS n, MIN(disponible_en) AS mas_vieja FROM (
      SELECT t.disponible_en, CASE
        WHEN t.estado = 'en_curso' THEN 'enCurso'
        WHEN t.estado = 'revisar' THEN 'revisar'
        WHEN t.tipo NOT IN (SELECT value FROM json_each(?)) THEN 'esperanVersion'
        WHEN t.proyecto_id IS NOT NULL AND NOT (p.estado IS 'en_ejecucion' AND p.en_papelera IS 0) THEN 'enPausa'
        WHEN t.disponible_en > ? THEN 'esperando'
        ELSE 'listas' END AS grupo
      FROM tareas t LEFT JOIN proyectos p ON p.id = t.proyecto_id WHERE t.estado IN ('lista', 'en_curso', 'revisar'))
    GROUP BY grupo`).all(JSON.stringify(conocidos), momento);
  for (const g of grupos) {
    resumen[g.grupo] = Number(g.n);
    if (g.grupo === 'listas') resumen.masViejaDesde = g.mas_vieja ?? null;
  }
  if (resumen.masViejaDesde != null && resumen.masViejaDesde < iso(ahora - ATRASO_MS)) resumen.atrasadaDesde = resumen.masViejaDesde;
  const hace24h = iso(ahora - 86_400_000);
  const t = db.prepare(`SELECT
      COALESCE(SUM(estado = 'fallida'), 0) AS fallidas7d,
      COALESCE(SUM(estado = 'hecha' AND terminada_en >= ?), 0) AS hechas24h,
      COALESCE(SUM(estado = 'fallida' AND terminada_en >= ?), 0) AS fallidas24h,
      COALESCE(SUM(estado = 'cancelada' AND terminada_en >= ?), 0) AS canceladas24h
    FROM tareas WHERE estado IN ('hecha', 'fallida', 'cancelada') AND terminada_en >= ?`).get(hace24h, hace24h, hace24h, iso(ahora - 7 * 86_400_000));
  for (const clave of ['fallidas7d', 'hechas24h', 'fallidas24h', 'canceladas24h']) resumen[clave] = Number(t[clave]);
  return resumen;
}

function tareaPublica(f, { espacioAdmin = null } = {}) {
  const sistema = String(f.tipo).startsWith('sistema.');
  const publica = {
    id: f.id,
    tipo: f.tipo,
    estado: f.estado,
    cupo: f.cupo,
    programa: f.programa,
    pasos: f.pasos,
    fallosSeguidos: f.fallos_seguidos,
    maxFallos: f.max_fallos,
    intento: f.fallos_seguidos + 1,
    msUsados: f.ms_usados,
    disponibleEn: f.disponible_en,
    motivoEspera: motivoParaMostrar(f.tipo, f.motivo_espera),
    ultimoError: motivoParaMostrar(f.tipo, f.ultimo_error),
    creadaEn: f.creada_en,
    empezadaEn: f.empezada_en,
    terminadaEn: f.terminada_en,
    proyecto: f.proyecto_id,
    cuenta: f.espacio_id,
    ajena: f.espacio_id != null && f.espacio_id !== espacioAdmin,
    puedeReintentar: SE_PUEDE.reintentar.includes(f.estado),
    puedeCancelar: SE_PUEDE.cancelar.includes(f.estado),
  };
  // Los datos, el punto de avance y el resultado solo se muestran en las tareas del sistema.
  if (sistema) {
    publica.datos = leerJson(f.datos, {});
    publica.punto = leerJson(f.punto, null);
    publica.resultado = leerJson(f.resultado, null);
  }
  return publica;
}

function tope(limite, porDefecto, maximo) {
  const n = Math.trunc(Number(limite));
  return Number.isFinite(n) && n > 0 ? Math.min(maximo, n) : porDefecto;
}

function idAntes(antesDe) {
  if (antesDe == null || antesDe === '') return null;
  const n = Number(antesDe);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErrorHttp(400, 'datos_no_validos');
  return n;
}

// Lo que salió mal hace poco (para «Errores recientes» del administrador).
export function erroresRecientes(db, { limite = 20, espacioAdmin = null } = {}) {
  const filas = db.prepare(`SELECT e.fecha, e.evento, e.detalle, t.id, t.tipo, t.estado, t.max_fallos, t.proyecto_id, t.espacio_id
    FROM tarea_eventos e JOIN tareas t ON t.id = e.tarea_id
    WHERE e.evento IN ('error', 'fallida', 'revisar', 'abandonada')
    ORDER BY e.id DESC LIMIT ?`).all(tope(limite, 20, 100));
  return filas.map(f => {
    const detalle = leerJson(f.detalle, {}) ?? {};
    return {
      tareaId: f.id,
      tipo: f.tipo,
      estado: f.estado,
      evento: f.evento,
      fecha: f.fecha,
      motivo: motivoParaMostrar(f.tipo, detalle.motivo),
      intento: Number.isSafeInteger(detalle.intento) ? detalle.intento : null,
      maxFallos: f.max_fallos,
      proyecto: f.proyecto_id,
      cuenta: f.espacio_id,
      ajena: f.espacio_id != null && f.espacio_id !== espacioAdmin,
      puedeReintentar: SE_PUEDE.reintentar.includes(f.estado),
      puedeCancelar: SE_PUEDE.cancelar.includes(f.estado),
    };
  });
}

// La fila completa para el administrador, de la más nueva a la más vieja, de a 25 («Ver más» usa «siguiente»).
export function listarTareas(db, { estado = null, antesDe = null, limite = 25, espacioAdmin = null } = {}) {
  const filtro = estado == null || estado === '' ? null : String(estado);
  if (filtro != null && !ESTADOS_TAREA.includes(filtro)) throw new ErrorHttp(400, 'datos_no_validos');
  const antes = idAntes(antesDe);
  const cuantas = tope(limite, 25, 100);
  const filas = db.prepare('SELECT * FROM tareas WHERE (? IS NULL OR estado = ?) AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?')
    .all(filtro, filtro, antes, antes, cuantas + 1);
  return {
    tareas: filas.slice(0, cuantas).map(f => tareaPublica(f, { espacioAdmin })),
    siguiente: filas.length > cuantas ? filas[cuantas - 1].id : null,
  };
}

// Las tareas de UNA cuenta (para la pantalla «Tareas» de la fase 2). Siempre con WHERE espacio_id = ?.
export function tareasDelEspacio(db, espacioId, { limite = 50, antesDe = null } = {}) {
  const espacio = Number(espacioId);
  if (!Number.isSafeInteger(espacio) || espacio <= 0) throw new ErrorHttp(404, 'no_existe');
  const antes = idAntes(antesDe);
  const cuantas = tope(limite, 50, 100);
  const filas = db.prepare('SELECT * FROM tareas WHERE espacio_id = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?')
    .all(espacio, antes, antes, cuantas + 1);
  return {
    tareas: filas.slice(0, cuantas).map(f => tareaPublica(f, { espacioAdmin: espacio })),
    siguiente: filas.length > cuantas ? filas[cuantas - 1].id : null,
  };
}
