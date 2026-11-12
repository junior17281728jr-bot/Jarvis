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
import { ID_PETICION, TOKENS_MAX } from './proveedores/comun.js';
import { politicaDe, finDePausa, FALLAS_SEGUIDAS, FALLAS_SEGUIDAS_INSTRUCTOR, PASAJEROS } from './politica.js';
import { leerConfigIa } from './config.js';
import { gastoMicro, revisarUmbrales, topeLleno, reservaMinimaMicro, resumenDelDia } from './gasto.js';
import { topeEspacioMicro, iaDeVersionActiva, esEspacioAdmin } from './topes.js';
import { espacioConfirmado } from '../cuentas/confianza.js';

export { mesCobro, inicioMesSiguienteCobro, gastoMicro, revisarUmbrales, topeLleno, reservaMinimaMicro };

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
// 0.9.0: modelos = { anthropic: '…' } usa otro modelo de ese proveedor (el del instructor de la academia: el propósito
// dice de qué ajuste sale, modeloAjuste). Con la misma clave y el mismo precio confirmado que pide cualquier modelo.
export function elegirProveedor(db, config, cfg, ahora = Date.now(), modelos = null) {
  const llave = estadoLlave(config);
  let primero = null;
  for (const id of cfg.orden) {
    const p0 = cfg.proveedores[id];
    const p = p0 && typeof modelos?.[id] === 'string' ? { ...p0, modelo: modelos[id] } : p0;
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

// Ronda 3 de revisión: las llamadas de una hora (cfg.llamadasPorHora) se reparten, así una cuenta con tope de plan
// nunca deja sin ayuda al dueño ni a las demás cuentas:
//  - total: entre todos, como siempre.
//  - porCuenta: lo más que usa en una hora UNA cuenta que no es la del administrador (un tercio; al menos 1).
//  - cuentas: lo más que usan en una hora, juntas, las cuentas que no son la del administrador. El resto (un tercio,
//    al menos 1) queda siempre para el dueño.
export function partesPorHora(llamadasPorHora) {
  const total = Number.isSafeInteger(llamadasPorHora) && llamadasPorHora > 0 ? llamadasPorHora : 1;
  return { total, porCuenta: Math.max(1, Math.floor(total / 3)), cuentas: Math.max(0, total - Math.max(1, Math.ceil(total / 3))) };
}

// Cuántas llamadas hubo en la última hora: todas, las de las cuentas que no son la del administrador y las de esa
// cuenta. cuenta: true si espacioId es una cuenta que no es la del administrador.
export function llamadasEnLaHora(db, { cfg, espacioId = null, ahora = Date.now() }) {
  const partes = partesPorHora(cfg.llamadasPorHora);
  const filas = db.prepare('SELECT espacio_id AS e, COUNT(*) AS n FROM ia_llamadas WHERE creada_en >= ? GROUP BY espacio_id').all(iso(ahora - HORA_MS));
  let todas = 0;
  let deCuentas = 0;
  let deLaCuenta = 0;
  for (const f of filas) {
    todas += f.n;
    if (f.e != null && !esEspacioAdmin(db, f.e)) deCuentas += f.n;
    if (espacioId != null && f.e === Number(espacioId)) deLaCuenta = f.n;
  }
  const cuenta = espacioId != null && !esEspacioAdmin(db, espacioId);
  return { partes, todas, deCuentas, deLaCuenta, cuenta };
}

// El modelo propio de un propósito (0.9.0: el instructor de la academia usa cfg.instructorModelo con Claude), o null.
export function modelosDe(def, cfg) {
  // 0.12.7: un modelo FIJO (preparar la próxima clase: siempre el barato) manda sobre el del ajuste.
  const modelo = typeof def?.modelo === 'string' ? def.modelo : def?.modeloAjuste ? cfg?.[def.modeloAjuste] : null;
  return typeof modelo === 'string' ? { anthropic: modelo } : null;
}

// Todas las revisiones de reservar, SIN escribir nada (también las usa disponibilidad, para las pantallas).
function evaluar(db, { config, cfg, def, espacioId, proyectoId, entradaMax, salidaMax, maximoConfirmadoMicro, ahora }) {
  const mes = mesCobro(ahora);
  const no = (motivo, ambito = 'general', extra = {}) => ({ ok: false, motivo, ambito, mes, ...extra });
  if (!cfg.encendida) return no('ia_apagada');
  // 0.12.7: un propósito puede pedir varios interruptores (preparar la próxima clase: el instructor y el suyo).
  if ((Array.isArray(def.ajuste) ? def.ajuste : def.ajuste ? [def.ajuste] : []).some(a => cfg[a] !== true)) return no('ayuda_no_activada');
  // Ronda 5 de revisión: una cuenta común gasta solo con el permiso de IA vigente (src/cuentas/confianza.js): se mira
  // AQUÍ, al gastar, y no solo al crear la cuenta o cambiar su plan.
  if (espacioId != null && !esEspacioAdmin(db, espacioId) && !espacioConfirmado(db, espacioId)) return no('cuenta_sin_permiso', `e${espacioId}`);
  const eleccion = elegirProveedor(db, config, cfg, ahora, modelosDe(def, cfg));
  if (!eleccion.ok) return no(eleccion.motivo);
  const reserva = reservaMicro(eleccion.precio, { entradaMax, salidaMax });
  const base = { proveedor: eleccion.proveedor, modelo: eleccion.modelo, reserva };
  if (reserva > def.maximoMicro) return no('llamada_muy_cara', 'general', base);
  if (maximoConfirmadoMicro != null && reserva > maximoConfirmadoMicro) return no('precio_cambio', 'general', base);
  const hora = llamadasEnLaHora(db, { cfg, espacioId, ahora });
  if (hora.todas >= hora.partes.total) return no('demasiadas_llamadas', 'general', base);
  if (hora.cuenta && hora.deLaCuenta >= hora.partes.porCuenta) return no('demasiadas_llamadas', `e${espacioId}`, base);
  if (hora.cuenta && hora.deCuentas >= hora.partes.cuentas) return no('demasiadas_llamadas', 'general', base);
  // Los topes. Un tope de 0 bloquea siempre.
  const general = { usadoMicro: gastoMicro(db, { mes }), topeMicro: cfg.topeGeneralMicro };
  if (general.usadoMicro + reserva > general.topeMicro) return no('tope_general', 'general', { ...base, ...general });
  let espacio = null;
  if (espacioId != null) {
    const t = topeEspacioMicro(db, cfg, espacioId, ahora);
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
      // El aviso del 100 % («queda en pausa hasta…») solo sale si el tope está lleno de verdad (revisarUmbrales lo mira
      // con topeLleno): si este pedido no cabe pero uno más corto sí, solo se cuenta la vez sin IA (ia_bloqueos) y la
      // pantalla del proyecto dice que este pedido no cabe.
      if (r.motivo.startsWith('tope_')) revisarUmbrales(db, { mes: r.mes, ambitos: [r.ambito], ahora, cfg, propositos });
      return { ok: false, motivo: r.motivo, ambito: r.ambito };
    }
    const e = r.eleccion;
    const fila = db.prepare(`INSERT INTO ia_llamadas (mes, estado, proposito, paso, proveedor, modelo, secreto_id, espacio_id, proyecto_id,
        version_numero, cuenta_proyecto, tarea_id, usuario_id, entrada_max, salida_max, reservado_micro, precio, creada_en)
      VALUES (?, 'reservada', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(r.mes, proposito, paso == null ? null : String(paso).slice(0, 80), e.proveedor, e.modelo, e.secreto.id, espacioId, proyectoId,
        versionNumero, def.cuentaProyecto ? 1 : 0, tareaId, usuarioId, entradaMax, salida, r.reserva, JSON.stringify(instantaneaPrecio(e.precio)), iso(ahora));
    // Ronda 3 de revisión: la cuenta (que no es la del administrador) acaba de usar su parte de llamadas de esta hora:
    // se avisa al momento, con su número de cuenta (se cierra solo en la revisión de cada hora, cuando vuelve a tener).
    if (espacioId != null) {
      const hora = llamadasEnLaHora(db, { cfg, espacioId, ahora });
      if (hora.cuenta && hora.deLaCuenta >= hora.partes.porCuenta) {
        abrirAviso(db, { clave: `ia_llamadas:e${espacioId}`, nivel: 'atencion', detalle: { ambito: `e${espacioId}`, usadas: hora.deLaCuenta, parte: hora.partes.porCuenta }, ahora });
      }
    }
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

// Respuestas que se PAGAN pero no sirven (el modelo respondió mal, se cortó o no quiso): para la pausa de «tres
// seguidas» cuentan como fallas, así un modelo que responde mal una y otra vez no gasta sin freno (fases 2 a 7: los
// trabajos automáticos piden solos). Un uso bueno entre ellas vuelve a empezar la cuenta.
// Ronda 3: también una respuesta buena que no se pudo guardar ('no_se_pudo_guardar') y una que traía la clave.
export const RESPUESTAS_INSERVIBLES = Object.freeze(['respuesta_no_valida', 'respuesta_incompleta', 'rechazada', 'no_se_pudo_guardar', 'eco_de_clave']);
// 0.12.4: un error pasajero del proveedor o de la red (429, 5xx, 529, sin red, tiempo agotado) NO es una falla para esta
// cuenta: solo da una pausa corta que crece (src/ia/politica.js). Los demás errores claros (fallida) siguen contando.
const esPasajero = resultado => PASAJEROS.includes(resultado);
const esFalla = ({ estado, resultado }) => (((estado === 'fallida' || estado === 'desconocida') && resultado !== 'interrumpida' && !esPasajero(resultado))
  || RESPUESTAS_INSERVIBLES.includes(resultado));

// ¿Es la tercera falla seguida de esa clave en una hora (sin un uso bueno entre ellas)? 0.12.4: los errores pasajeros
// se saltan (ni cuentan ni cortan la cuenta) y se mira el MISMO propósito; el instructor de la academia pide 6.
// El instructor: una respuesta cortada (max_tokens) tampoco cuenta: su salida ya subió a 4 096 tokens para que no pase,
// y una cortada no es un modelo que «responde mal» (se pagó lo usado y sigue lo básico).
function tresFallasSeguidas(db, secretoId, ahora, proposito) {
  const instructor = typeof proposito === 'string' && proposito.startsWith('instructor_');
  const veces = instructor ? FALLAS_SEGUIDAS_INSTRUCTOR : FALLAS_SEGUIDAS.veces;
  const salta = f => esPasajero(f.resultado) || f.resultado === 'interrumpida' || (instructor && f.resultado === 'respuesta_incompleta');
  const ultimas = db.prepare(`SELECT estado, resultado FROM ia_llamadas WHERE secreto_id = ? AND proposito IS ? AND creada_en >= ? AND estado <> 'reservada'
    ORDER BY id DESC LIMIT ?`).all(secretoId, proposito ?? null, iso(ahora - FALLAS_SEGUIDAS.ventanaMs), veces * 4).filter(f => !salta(f)).slice(0, veces);
  return ultimas.length === veces && ultimas.every(esFalla);
}
// Cuántos errores pasajeros seguidos lleva esa clave en la última hora (para que la pausa corta crezca: 2, 5, 15 min).
function pasajerosSeguidos(db, secretoId, ahora) {
  const ultimas = db.prepare(`SELECT resultado FROM ia_llamadas WHERE secreto_id = ? AND creada_en >= ? AND estado <> 'reservada'
    ORDER BY id DESC LIMIT 6`).all(secretoId, iso(ahora - FALLAS_SEGUIDAS.ventanaMs));
  let n = 0;
  for (const f of ultimas) { if (!esPasajero(f.resultado)) break; n += 1; }
  return n;
}

// Lo mínimo que puede gastar de entrada un pedido de OPORTIA: 1 token por cada 32 bytes enviados (en la práctica un
// token son 3 a 5 bytes; ni siquiera un texto hecho de un solo carácter repetido llega a 32). Ronda 2 de revisión: un
// 200 que dice «0 tokens» (o casi nada) para un pedido de miles de bytes no se cree: es un gasto desconocido.
export const BYTES_POR_TOKEN_MAX = 32;

// ¿Lo que el proveedor dice que gastó es imposible para lo que OPORTIA mandó? enviadoBytes: los bytes del pedido
// (sistema, texto y esquema); conTexto: si volvió una respuesta con texto (entonces escribió al menos 1 token).
function usoImposible(uso, { enviadoBytes, conTexto }) {
  if (!Number.isSafeInteger(enviadoBytes) || enviadoBytes <= 0) return false;
  const entrada = uso.entrada + uso.cacheLectura + uso.cacheEscritura;
  if (entrada < Math.max(1, Math.ceil(enviadoBytes / BYTES_POR_TOKEN_MAX))) return true;
  return conTexto && uso.salida < 1;
}

// Anota lo que pasó con una llamada reservada. resultado: lo que devolvió el adaptador (leer): { motivo, estado, uso,
// idPeticion, reintentarMs, http, detalle }. Nunca guarda lo preguntado ni lo respondido, ni un mensaje del proveedor.
// enviadoBytes: lo que OPORTIA mandó (src/ia/cliente.js lo pasa siempre): un uso menor que lo posible es desconocido.
// Devuelve { cambio, costoMicro, mayorQueReserva, estado, motivo }.
export function liquidar(db, { llamadaId, resultado, duracionMs = null, ahora = Date.now(), config = null, enviadoBytes = null }) {
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
    let uso = usoValido(resultado?.uso);
    if (estado === 'hecha' && !uso) estado = 'desconocida';
    if (tardia && !uso && estado !== 'fallida') return sinCambio;
    const reservado = f.reservado_micro;
    const precio = precioDeLaFila(f);
    // Un lugar (inference_geo) que la tabla de precios no conoce puede costar más que el más caro conocido: cuenta como
    // un cobro desconocido (al menos lo apartado), pausa la clave y avisa, como un service_tier o una velocidad nueva.
    // Si el proveedor no dice el lugar, se usa el multiplicador más alto (src/ia/precios.js).
    if (uso && precio && typeof uso.geo === 'string' && !Object.hasOwn(precio.geoMil ?? {}, uso.geo)) uso = { ...uso, raro: true };
    const conTexto = typeof resultado?.texto === 'string' && resultado.texto.length > 0;
    if (uso && usoImposible(uso, { enviadoBytes, conTexto })) uso = { ...uso, raro: true };
    // Un número absurdo (más tokens de los que caben en cualquier modelo, o un gasto desconocido así de grande): no se
    // puede creer ni hacer cuentas con él. Cuenta lo apartado (lo máximo que ese pedido podía costar de verdad), pausa la
    // clave y avisa grave (ronda 2 de revisión: antes la cuenta no cabía en la base y la llamada quedaba «en curso»).
    const absurdo = Boolean(uso) && ['entrada', 'salida', 'cacheLectura', 'cacheEscritura', 'desconocidos'].some(c => (uso[c] ?? 0) > TOKENS_MAX);
    if (absurdo) uso = { ...uso, raro: true };
    let costo;
    if (absurdo) costo = reservado;
    else if (uso) costo = precio ? (uso.raro ? cotaMicro(precio, uso, reservado) : costoMicro(precio, uso)) : reservado;
    else costo = estado === 'desconocida' ? reservado : 0;
    // Nunca un costo que la base no pueda guardar (src/ia/precios.js ya lo limita; esto es por si acaso).
    if (!Number.isSafeInteger(costo) || costo < 0) costo = Number.MAX_SAFE_INTEGER;
    const mayor = Boolean(uso) && (costo > reservado || uso.raro === true);
    // Solo códigos cortos (tipo, código, motivo de parada…): nunca un mensaje del proveedor.
    const detalle = Object.fromEntries(Object.entries(resultado?.detalle ?? {})
      .filter(([clave, valor]) => /^[a-zA-Z]{1,30}$/.test(clave) && typeof valor === 'string' && /^[a-z0-9_]{1,40}$/.test(valor)));
    if (uso?.geo && /^[a-z]{2,20}$/.test(uso.geo)) detalle.geo = uso.geo;
    if (mayor) detalle.motivoInterno = uso.raro ? 'uso_desconocido' : 'costo_mayor';
    const http = Number.isSafeInteger(resultado?.http) ? resultado.http : null;
    const idPeticion = typeof resultado?.idPeticion === 'string' && ID_PETICION.test(resultado.idPeticion) ? resultado.idPeticion : null;
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
        const hasta = finDePausa(pol, { reintentarMs: resultado?.reintentarMs ?? null, ahora, seguidos: pasajerosSeguidos(db, secretoId, ahora) });
        pausarSecreto(db, { id: secretoId, motivo, hastaMs: hasta, ahora });
        if (pol.aviso) avisoProveedor(db, { proveedor, motivo, pausa: 'corta', hasta, nivel: pol.aviso, ahora });
      }
      if (pol.resuelve) {
        quitarPausaCorta(db, { id: secretoId });
        resolverAviso(db, `ia_proveedor:${proveedor}`, ahora);
      }
      if (esFalla({ estado, resultado: motivo }) && tresFallasSeguidas(db, secretoId, ahora, f.proposito)) {
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

// Cierra una llamada cuya respuesta no se pudo anotar (liquidar lanzó un error que no es «base ocupada»): cuenta lo
// apartado (nunca menos), esa clave queda en pausa del dueño y se abre el aviso grave. Nunca lanza por la fila.
export function cerrarLlamadaRota(db, { llamadaId, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const f = db.prepare('SELECT * FROM ia_llamadas WHERE id = ?').get(Number(llamadaId));
    if (!f) return { cambio: false };
    const cambio = db.prepare(`UPDATE ia_llamadas SET estado = 'desconocida', resultado = 'costo_mayor',
        costo_micro = MAX(reservado_micro, COALESCE(costo_micro, 0)), terminada_en = ?, detalle = ?
      WHERE id = ? AND (estado = 'reservada' OR (estado = 'desconocida' AND resultado = 'interrumpida'))`)
      .run(iso(ahora), JSON.stringify({ motivoInterno: 'no_se_pudo_anotar' }), f.id).changes;
    if (f.secreto_id != null) {
      abrirAviso(db, { clave: 'ia_costo_mayor', nivel: 'grave', detalle: { proveedor: f.proveedor, llamadaId: f.id, realMicro: f.reservado_micro, reservadoMicro: f.reservado_micro, motivo: 'no_se_pudo_anotar' }, ahora });
      pausarSecreto(db, { id: f.secreto_id, motivo: 'costo_mayor', hastaMs: null, ahora });
    }
    return { cambio: cambio > 0 };
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
    // 0.12.7: el resumen de ayer, solo si ayer se gastó algo (un día sin gasto no manda nada).
    const resumen = resumenDelDia(db, { ahora, cfg });
    // Ronda 3: el aviso de una cuenta que usó su parte de llamadas se cierra cuando ya vuelve a tener.
    for (const a of db.prepare("SELECT clave FROM avisos WHERE resuelto_en IS NULL AND substr(clave, 1, 12) = 'ia_llamadas:'").all()) {
      const m = /^ia_llamadas:e([1-9]\d{0,9})$/.exec(a.clave);
      const hora = m ? llamadasEnLaHora(db, { cfg, espacioId: Number(m[1]), ahora }) : null;
      if ((!hora || hora.deLaCuenta < hora.partes.porCuenta) && resolverAviso(db, a.clave, ahora)) cerrados += 1;
    }
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
    return { barridas, avisosCerrados: cerrados, llave, resumen };
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
//  { disponible, motivo, maximoMicro, tipicoMicro, usadoMicro, topeMicro, vuelveEl, proveedor, modelo, topeLleno }
// maximoMicro es exactamente lo que reservar apartaría ahora. topeLleno (solo si el motivo es un tope): true si ya no
// cabe ningún uso este mes; false si solo este pedido no cabe (uno más corto sí).
export function disponibilidad(db, { config, espacioId, proposito, entradaMax, salidaMax = null, ahora = Date.now(), propositos = PROPOSITOS }) {
  const { def, salida } = exigirDatos({ proposito, espacioId, entradaMax, salidaMax, maximoConfirmadoMicro: null, proyectoId: null, propositos });
  const cfg = leerConfigIa(db);
  const mes = mesCobro(ahora);
  const r = evaluar(db, { config, cfg, def, espacioId, proyectoId: null, entradaMax, salidaMax: salida, maximoConfirmadoMicro: null, ahora });
  const t = espacioId != null ? topeEspacioMicro(db, cfg, espacioId, ahora) : { admin: true };
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
    topeLleno: !r.ok && r.motivo.startsWith('tope_') ? topeLleno(db, { cfg, ambito: r.ambito, mes, propositos }) : null,
  };
}
