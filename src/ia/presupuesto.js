// El presupuesto de la IA: APARTAR el dinero antes de cada uso pagado (reservar), anotar lo que costó de verdad
// (liquidar), contar las veces que NO se usó (ia_bloqueos) y vigilar cada hora (vigilarIA). Lo usan los dos procesos;
// todo es síncrono y cada escritura va en UNA transacción (anidada dentro de la de quien llama, si hay una).
//
// Por qué NUNCA se pasa un tope, aunque lleguen varias llamadas a la vez (de las pantallas o del trabajador):
//  - SQLite deja escribir a uno solo a la vez, y reservar toma el permiso de escribir ANTES de mirar (BEGIN
//    IMMEDIATE): mirar el gasto y apartar la reserva pasan juntos, sin que nadie se meta en el medio.
//  - Cada reserva cuenta todas las que siguen en curso por lo MÁXIMO que pueden costar.
//  - La reserva es lo peor que puede costar la llamada (toda la entrada al precio más caro, toda la salida permitida,
//    el lugar más caro y un 5 % más). Si alguna vez costara más, se anota lo real, se avisa al momento y esa clave
//    queda en pausa hasta que el dueño la revise.
// Por qué nunca se reintenta en bucle: un error del proveedor pausa esa clave (src/ia/politica.js) y reservar la
// encuentra en pausa SIN tocar la red.
import { enTransaccion } from '../nucleo/db.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { mesCobro, inicioMesSiguienteCobro } from '../tareas/tiempo.js';
import { FASE_ACTUAL } from '../tareas/tipos.js';
import { estadoLlave } from '../claves/cifrado.js';
import { anotarPrueba, anotarUso, pausarSecreto, quitarPausaCorta, secretoUsable } from '../claves/almacen.js';
import { PROPOSITOS, MOTIVOS, ESTADOS_LLAMADA, definicionProposito } from './propositos.js';
import { precioDe, reservaMicro, costoMicro, cotaMicro, instantaneaPrecio } from './precios.js';
import { PROVEEDORES } from './proveedores/index.js';
import { politicaDe, finDePausa, FALLAS_SEGUIDAS } from './politica.js';
import { leerConfigIa } from './config.js';
import { gastoMicro, revisarUmbrales } from './gasto.js';
import { topeEspacioMicro, iaDeVersionActiva } from './topes.js';

export { mesCobro, inicioMesSiguienteCobro, gastoMicro, revisarUmbrales };

// Una reserva que lleva más de 10 minutos «en curso» quedó huérfana (el proceso se cayó o se actualizó): se cierra
// como «desconocida», contando lo máximo apartado (nunca menos).
export const VIEJA_MS = 10 * 60_000;
const HORA_MS = 3_600_000;
const iso = ms => new Date(ms).toISOString();

export function barrerViejas(db, { ahora = Date.now() } = {}) {
  return db.prepare(`UPDATE ia_llamadas SET estado = 'desconocida', resultado = 'interrumpida',
      costo_micro = MAX(reservado_micro, COALESCE(costo_micro, 0)), terminada_en = ?
    WHERE estado = 'reservada' AND creada_en < ?`).run(iso(ahora), iso(ahora - VIEJA_MS)).changes;
}

// Una vez más que no se usó la IA (crece poco: una fila por mes, ámbito, motivo y propósito).
export function anotarBloqueo(db, { mes, ambito, motivo, proposito, ahora = Date.now() }) {
  if (!MOTIVOS.includes(motivo)) throw new Error(`motivo no válido: ${String(motivo).slice(0, 40)}`);
  const momento = iso(ahora);
  db.prepare(`INSERT INTO ia_bloqueos (mes, ambito, motivo, proposito, veces, primera_vez, ultima_vez) VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(mes, ambito, motivo, proposito) DO UPDATE SET veces = veces + 1, ultima_vez = excluded.ultima_vez`)
    .run(mes, ambito, motivo, proposito, momento, momento);
}

// El primer proveedor (en el orden de la configuración) que se puede usar ahora mismo. Sin red: solo mira la base,
// la tabla de precios y la llave. { ok, proveedor, modelo, precio, secreto, adaptador } o { ok: false, motivo }.
export function elegirProveedor(db, config, cfg, ahora = Date.now()) {
  const llave = estadoLlave(config);
  let primero = null;
  for (const id of cfg.orden) {
    const p = cfg.proveedores[id];
    const adaptador = PROVEEDORES[id];
    if (!p?.usar || !adaptador) continue;
    const precio = precioDe(id, p.modelo);
    let motivo = null;
    let fila = null;
    if (!precio) motivo = 'precio_sin_confirmar';
    else {
      fila = db.prepare("SELECT * FROM secretos WHERE uso = ? AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(adaptador.uso);
      const usable = secretoUsable(fila, ahora, llave.listo ? llave.huella : null);
      if (!usable.si) motivo = usable.motivo;
    }
    if (!motivo) return { ok: true, proveedor: id, modelo: p.modelo, precio, secreto: fila, adaptador };
    primero ??= motivo;
  }
  return { ok: false, motivo: primero ?? 'proveedor_no_usado' };
}

// Todas las revisiones de reservar, SIN escribir nada (también las usa disponibilidad, para las pantallas).
function evaluar(db, { config, cfg, def, espacioId, proyectoId, entradaMax, salidaMax, maximoConfirmadoMicro, ahora }) {
  const mes = mesCobro(ahora);
  const no = (motivo, ambito = 'general', extra = {}) => ({ ok: false, motivo, ambito, mes, ...extra });
  if (!cfg.encendida) return no('ia_apagada');
  if (def.ajuste && cfg[def.ajuste] !== true) return no('ayuda_no_activada');
  const eleccion = elegirProveedor(db, config, cfg, ahora);
  if (!eleccion.ok) return no(eleccion.motivo);
  const reserva = reservaMicro(eleccion.precio, { entradaMax, salidaMax });
  const base = { proveedor: eleccion.proveedor, modelo: eleccion.modelo, reserva };
  if (reserva > def.maximoMicro) return no('llamada_muy_cara', 'general', base);
  if (maximoConfirmadoMicro != null && reserva > maximoConfirmadoMicro) return no('precio_cambio', 'general', base);
  const enLaHora = db.prepare('SELECT COUNT(*) AS n FROM ia_llamadas WHERE creada_en >= ?').get(iso(ahora - HORA_MS)).n;
  if (enLaHora >= cfg.llamadasPorHora) return no('demasiadas_llamadas', 'general', base);
  // Los topes. Un tope de 0 bloquea siempre.
  const general = { usadoMicro: gastoMicro(db, { mes }), topeMicro: cfg.topeGeneralMicro };
  if (general.usadoMicro + reserva > general.topeMicro) return no('tope_general', 'general', { ...base, ...general });
  let espacio = null;
  if (espacioId != null) {
    const t = topeEspacioMicro(db, cfg, espacioId);
    if (!t.admin) {
      espacio = { usadoMicro: gastoMicro(db, { mes, espacioId }), topeMicro: t.topeMicro };
      if (espacio.usadoMicro + reserva > espacio.topeMicro) return no('tope_espacio', `e${espacioId}`, { ...base, ...espacio });
    }
  }
  if (def.cuentaProyecto) {
    const ambito = `p${proyectoId}`;
    const v = iaDeVersionActiva(db, { proyectoId });
    if (!v.activo || v.espacioId !== Number(espacioId)) return no('proyecto_inactivo', ambito, base);
    if (!v.permitida || v.topeMicro <= 0) return no('no_permitida_en_proyecto', ambito, base);
    const usado = gastoMicro(db, { mes, proyectoId });
    if (usado + reserva > v.topeMicro) return no('tope_proyecto', ambito, { ...base, usadoMicro: usado, topeMicro: v.topeMicro });
  }
  return { ok: true, mes, eleccion, reserva, general, espacio };
}

function exigirDatos({ proposito, espacioId, proyectoId, entradaMax, salidaMax, maximoConfirmadoMicro, propositos }) {
  const def = definicionProposito(proposito, propositos);
  // Esto son errores de programación (nunca de la persona): se lanzan.
  if (!def) throw new Error(`propósito de IA desconocido: ${String(proposito).slice(0, 40)}`);
  if (def.fase > FASE_ACTUAL) throw new Error(`el propósito ${proposito} es de la fase ${def.fase}`);
  if (!Number.isSafeInteger(entradaMax) || entradaMax <= 0) throw new Error('entradaMax no válida');
  const salida = salidaMax ?? def.salidaMax;
  if (!Number.isSafeInteger(salida) || salida <= 0 || salida > def.salidaMax) throw new Error('salidaMax no válida');
  if (def.ambito !== 'general' && !(Number.isSafeInteger(espacioId) && espacioId > 0)) throw new Error('falta el espacio');
  if (def.cuentaProyecto && !(Number.isSafeInteger(proyectoId) && proyectoId > 0)) throw new Error('falta el proyecto');
  if (maximoConfirmadoMicro != null && !(Number.isSafeInteger(maximoConfirmadoMicro) && maximoConfirmadoMicro >= 0)) throw new Error('maximoConfirmadoMicro no válido');
  return { def, salida };
}

// Aparta el dinero de UNA llamada pagada, o dice por qué no (y lo cuenta). Nunca usa la red.
//  { ok: true, llamada: { id, mes, proveedor, modelo, secretoId, precio, reservadoMicro, entradaMax, salidaMax } }
//  { ok: false, motivo, ambito }
// maximoConfirmadoMicro: lo máximo que la persona aceptó pagar (si la reserva de ahora es mayor: 'precio_cambio').
// propositos: solo para las pruebas (por defecto, PROPOSITOS).
export function reservar(db, {
  config, proposito, espacioId = null, proyectoId = null, versionNumero = null, tareaId = null, usuarioId = null, paso = null,
  entradaMax, salidaMax = null, maximoConfirmadoMicro = null, ahora = Date.now(), propositos = PROPOSITOS,
}) {
  const { def, salida } = exigirDatos({ proposito, espacioId, proyectoId, entradaMax, salidaMax, maximoConfirmadoMicro, propositos });
  return enTransaccion(db, () => {
    barrerViejas(db, { ahora });
    const cfg = leerConfigIa(db);
    const r = evaluar(db, { config, cfg, def, espacioId, proyectoId, entradaMax, salidaMax: salida, maximoConfirmadoMicro, ahora });
    if (!r.ok) {
      anotarBloqueo(db, { mes: r.mes, ambito: r.ambito, motivo: r.motivo, proposito, ahora });
      if (r.motivo.startsWith('tope_')) revisarUmbrales(db, { mes: r.mes, ambitos: [r.ambito], lleno: r.ambito, ahora, cfg });
      return { ok: false, motivo: r.motivo, ambito: r.ambito };
    }
    const e = r.eleccion;
    const fila = db.prepare(`INSERT INTO ia_llamadas (mes, estado, proposito, paso, proveedor, modelo, secreto_id, espacio_id, proyecto_id,
        version_numero, cuenta_proyecto, tarea_id, usuario_id, entrada_max, salida_max, reservado_micro, precio, creada_en)
      VALUES (?, 'reservada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(r.mes, proposito, paso == null ? null : String(paso).slice(0, 80), e.proveedor, e.modelo, e.secreto.id, espacioId, proyectoId,
        versionNumero, def.cuentaProyecto ? 1 : 0, tareaId, usuarioId, entradaMax, salida, r.reserva, JSON.stringify(instantaneaPrecio(e.precio)), iso(ahora));
    return {
      ok: true,
      llamada: {
        id: Number(fila.lastInsertRowid), mes: r.mes, proveedor: e.proveedor, modelo: e.modelo, secretoId: e.secreto.id,
        precio: e.precio, reservadoMicro: r.reserva, entradaMax, salidaMax: salida,
      },
    };
  });
}

function usoValido(uso) {
  if (!uso || typeof uso !== 'object') return null;
  for (const campo of ['entrada', 'salida', 'cacheLectura', 'cacheEscritura', 'desconocidos']) {
    const v = uso[campo] ?? 0;
    if (!Number.isSafeInteger(v) || v < 0) return null;
  }
  return uso;
}

function precioDeLaFila(f) {
  try {
    const p = JSON.parse(f.precio);
    costoMicro(p, { entrada: 0, salida: 0 }); // ¿se puede hacer cuentas con ella?
    return p;
  } catch {
    return precioDe(f.proveedor, f.modelo);
  }
}

function avisoProveedor(db, { proveedor, motivo, pausa, hasta, nivel, ahora }) {
  abrirAviso(db, { clave: `ia_proveedor:${proveedor}`, nivel, detalle: { proveedor, motivo, pausa, hasta: hasta == null ? null : iso(hasta) }, ahora });
}

// ¿Es la tercera falla seguida de esa clave en una hora (sin un uso bueno entre ellas)?
function tresFallasSeguidas(db, secretoId, ahora) {
  const ultimas = db.prepare(`SELECT estado, resultado FROM ia_llamadas WHERE secreto_id = ? AND creada_en >= ? AND estado <> 'reservada'
    ORDER BY id DESC LIMIT ?`).all(secretoId, iso(ahora - FALLAS_SEGUIDAS.ventanaMs), FALLAS_SEGUIDAS.veces);
  return ultimas.length === FALLAS_SEGUIDAS.veces
    && ultimas.every(u => (u.estado === 'fallida' || u.estado === 'desconocida') && u.resultado !== 'interrumpida');
}

// Anota lo que pasó con una llamada reservada. resultado: lo que devolvió el adaptador (leer): { motivo, estado, uso,
// idPeticion, reintentarMs, http, detalle }. Nunca guarda lo preguntado ni lo respondido, ni un mensaje del proveedor.
// Devuelve { cambio, costoMicro, mayorQueReserva, estado, motivo }.
export function liquidar(db, { llamadaId, resultado, duracionMs = null, ahora = Date.now(), config = null }) {
  return enTransaccion(db, () => {
    const f = db.prepare('SELECT * FROM ia_llamadas WHERE id = ?').get(Number(llamadaId));
    const sinCambio = { cambio: false, costoMicro: f?.costo_micro ?? null, mayorQueReserva: false, estado: f?.estado ?? null, motivo: f?.resultado ?? null };
    if (!f) return sinCambio;
    // Una respuesta que llega tarde (la reserva ya se había cerrado como «interrumpida») todavía puede anotar lo real.
    const tardia = f.estado === 'desconocida' && f.resultado === 'interrumpida';
    if (f.estado !== 'reservada' && !tardia) return sinCambio;
    // Un motivo que no se conoce nunca cuenta de menos: queda «desconocida» (lo máximo apartado).
    const conocido = MOTIVOS.includes(resultado?.motivo);
    const motivo = conocido ? resultado.motivo : 'error_proveedor';
    const pol = politicaDe(motivo);
    let estado = !conocido ? 'desconocida'
      : ESTADOS_LLAMADA.includes(resultado?.estado) && resultado.estado !== 'reservada' ? resultado.estado : pol.estado;
    const uso = usoValido(resultado?.uso);
    if (estado === 'hecha' && !uso) estado = 'desconocida';
    if (tardia && !uso && estado !== 'fallida') return sinCambio;
    const reservado = f.reservado_micro;
    const precio = precioDeLaFila(f);
    let costo;
    if (uso) costo = precio ? (uso.raro ? cotaMicro(precio, uso, reservado) : costoMicro(precio, uso)) : reservado;
    else costo = estado === 'desconocida' ? reservado : 0;
    const mayor = Boolean(uso) && (costo > reservado || uso.raro === true);
    // Solo códigos cortos (tipo, código, motivo de parada…): nunca un mensaje del proveedor.
    const detalle = Object.fromEntries(Object.entries(resultado?.detalle ?? {})
      .filter(([clave, valor]) => /^[a-zA-Z]{1,30}$/.test(clave) && typeof valor === 'string' && /^[a-z0-9_]{1,60}$/.test(valor)));
    if (uso?.geo && /^[a-z]{2,20}$/.test(uso.geo)) detalle.geo = uso.geo;
    if (mayor) detalle.motivoInterno = uso.raro ? 'uso_desconocido' : 'costo_mayor';
    const http = Number.isSafeInteger(resultado?.http) ? resultado.http : null;
    const idPeticion = typeof resultado?.idPeticion === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(resultado.idPeticion) ? resultado.idPeticion : null;
    const duracion = Number.isFinite(duracionMs) ? Math.max(0, Math.round(duracionMs)) : null;
    const cambio = db.prepare(`UPDATE ia_llamadas SET estado = ?, resultado = ?, tokens_entrada = ?, tokens_salida = ?, tokens_cache_lectura = ?,
        tokens_cache_escritura = ?, costo_micro = ?, id_peticion = ?, http = ?, duracion_ms = ?, terminada_en = ?, detalle = ?
      WHERE id = ? AND (estado = 'reservada' OR (estado = 'desconocida' AND resultado = 'interrumpida'))`)
      .run(estado, motivo, uso?.entrada ?? null, uso?.salida ?? null, uso?.cacheLectura ?? null, uso?.cacheEscritura ?? null, costo,
        idPeticion, http, duracion, iso(ahora), Object.keys(detalle).length ? JSON.stringify(detalle) : null, f.id).changes;
    if (!cambio) return sinCambio;
    const secretoId = f.secreto_id;
    const proveedor = f.proveedor;
    if (secretoId != null) {
      if (http != null && http >= 200 && http <= 299) anotarUso(db, { id: secretoId, ahora });
      if (pol.prueba) anotarPrueba(db, { id: secretoId, motivo, ahora });
      if (pol.pausa === 'admin') {
        pausarSecreto(db, { id: secretoId, motivo, hastaMs: null, ahora });
        if (pol.aviso) avisoProveedor(db, { proveedor, motivo, pausa: 'admin', hasta: null, nivel: pol.aviso, ahora });
      } else if (pol.pausa === 'corta') {
        const hasta = finDePausa(pol, { reintentarMs: resultado?.reintentarMs ?? null, ahora });
        pausarSecreto(db, { id: secretoId, motivo, hastaMs: hasta, ahora });
        if (pol.aviso) avisoProveedor(db, { proveedor, motivo, pausa: 'corta', hasta, nivel: pol.aviso, ahora });
      }
      if (pol.resuelve) {
        quitarPausaCorta(db, { id: secretoId });
        resolverAviso(db, `ia_proveedor:${proveedor}`, ahora);
      }
      if ((estado === 'fallida' || estado === 'desconocida') && motivo !== 'interrumpida' && tresFallasSeguidas(db, secretoId, ahora)) {
        if (pausarSecreto(db, { id: secretoId, motivo: 'fallas_seguidas', hastaMs: null, ahora })) {
          avisoProveedor(db, { proveedor, motivo: 'fallas_seguidas', pausa: 'admin', hasta: null, nivel: 'atencion', ahora });
        }
      }
      if (mayor) {
        abrirAviso(db, { clave: 'ia_costo_mayor', nivel: 'grave', detalle: { proveedor, llamadaId: f.id, realMicro: costo, reservadoMicro: reservado, motivo: detalle.motivoInterno }, ahora });
        pausarSecreto(db, { id: secretoId, motivo: 'costo_mayor', hastaMs: null, ahora });
      }
    }
    const cfg = leerConfigIa(db);
    const ambitos = ['general'];
    if (f.espacio_id != null && !topeEspacioMicro(db, cfg, f.espacio_id).admin) ambitos.push(`e${f.espacio_id}`);
    if (f.cuenta_proyecto === 1 && f.proyecto_id != null) ambitos.push(`p${f.proyecto_id}`);
    revisarUmbrales(db, { mes: f.mes, ambitos, ahora, cfg });
    return { cambio: true, costoMicro: costo, mayorQueReserva: mayor, estado, motivo };
  });
}

// Cada hora (dentro de sistema.vigilar): cierra reservas huérfanas, cierra los avisos de tope de meses pasados, mira
// el tope general (por si se cambió desde la consola) y avisa si la llave de las claves no se puede leer.
export function vigilarIA(db, { config, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const barridas = barrerViejas(db, { ahora });
    const mes = mesCobro(ahora);
    let cerrados = 0;
    for (const a of db.prepare("SELECT clave FROM avisos WHERE resuelto_en IS NULL AND substr(clave, 1, 8) = 'ia_tope:'").all()) {
      if (a.clave.slice(-7) < mes && resolverAviso(db, a.clave, ahora)) cerrados += 1;
    }
    const cfg = leerConfigIa(db);
    revisarUmbrales(db, { mes, ambitos: ['general'], ahora, cfg });
    const activas = db.prepare("SELECT llave_huella FROM secretos WHERE estado = 'activa'").all();
    let llave = 'sin_claves';
    // Sin carpeta de datos (algunas pruebas de la fila corren sin ella) no se puede mirar la llave.
    const conCarpeta = Boolean(config && (config.carpetaDatos || config.archivoBase));
    if (activas.length && !conCarpeta) llave = 'sin_carpeta';
    else if (activas.length) {
      const e = estadoLlave(config);
      const mal = !e.listo || activas.some(a => a.llave_huella !== e.huella);
      llave = mal ? (e.motivo ?? 'clave_ilegible') : 'bien';
      if (mal) abrirAviso(db, { clave: 'ia_llave', nivel: 'grave', detalle: { motivo: llave }, ahora });
      else resolverAviso(db, 'ia_llave', ahora);
    } else {
      resolverAviso(db, 'ia_llave', ahora);
    }
    return { barridas, avisosCerrados: cerrados, llave };
  });
}

// Lo que suele costar un uso de ese propósito EN ESA CUENTA (la mediana de sus últimos 20 usos hechos), o lo que dice
// el propósito si todavía tiene menos de 3. Nunca mira usos de otras cuentas.
export function tipicoMicro(db, { proposito, espacioId, propositos = PROPOSITOS }) {
  const filas = db.prepare(`SELECT costo_micro AS c FROM ia_llamadas WHERE proposito = ? AND espacio_id IS ? AND estado = 'hecha' AND costo_micro IS NOT NULL
    ORDER BY id DESC LIMIT 20`).all(proposito, espacioId).map(f => f.c).sort((a, b) => a - b);
  if (filas.length < 3) return definicionProposito(proposito, propositos)?.tipicoMicro ?? null;
  const medio = Math.floor(filas.length / 2);
  return filas.length % 2 ? filas[medio] : Math.ceil((filas[medio - 1] + filas[medio]) / 2);
}

// Para las pantallas y para la ruta que pone en la fila la ayuda: ¿se podría usar ahora? Solo lee (no cuenta nada).
//  { disponible, motivo, maximoMicro, tipicoMicro, usadoMicro, topeMicro, vuelveEl, proveedor, modelo }
// maximoMicro es exactamente lo que reservar apartaría ahora.
export function disponibilidad(db, { config, espacioId, proposito, entradaMax, salidaMax = null, ahora = Date.now(), propositos = PROPOSITOS }) {
  const { def, salida } = exigirDatos({ proposito, espacioId, entradaMax, salidaMax, maximoConfirmadoMicro: null, proyectoId: null, propositos });
  const cfg = leerConfigIa(db);
  const mes = mesCobro(ahora);
  const r = evaluar(db, { config, cfg, def, espacioId, proyectoId: null, entradaMax, salidaMax: salida, maximoConfirmadoMicro: null, ahora });
  const t = espacioId != null ? topeEspacioMicro(db, cfg, espacioId) : { admin: true };
  const usadoMicro = t.admin ? gastoMicro(db, { mes }) : gastoMicro(db, { mes, espacioId });
  const topeMicro = t.admin ? cfg.topeGeneralMicro : t.topeMicro;
  const proveedor = r.ok ? r.eleccion.proveedor : (r.proveedor ?? null);
  const modelo = r.ok ? r.eleccion.modelo : (r.modelo ?? null);
  return {
    disponible: r.ok,
    motivo: r.ok ? 'ok' : r.motivo,
    maximoMicro: r.reserva ?? null,
    tipicoMicro: tipicoMicro(db, { proposito, espacioId, propositos }),
    usadoMicro,
    topeMicro,
    vuelveEl: iso(inicioMesSiguienteCobro(ahora)),
    proveedor,
    modelo,
  };
}
