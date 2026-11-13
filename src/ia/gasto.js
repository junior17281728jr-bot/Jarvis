// Cuánto se gastó en IA, y los avisos al 50, 80 y 100 % de cada tope.
// La ÚNICA cuenta del gasto (gastoMicro): lo que está «en curso» cuenta lo máximo apartado; lo demás, lo que costó.
// Así, mientras una llamada está en camino, ya cuenta para el tope: nunca se pasa aunque lleguen varias a la vez.
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { inicioMesSiguienteCobro } from '../tareas/tiempo.js';
import { FASE_ACTUAL } from '../tareas/tipos.js';
import { topeDeAmbito } from './topes.js';
import { precioPara, reservaMicro } from './precios.js';
import { PROPOSITOS } from './propositos.js';

export const GASTO_SQL = "COALESCE(SUM(CASE estado WHEN 'reservada' THEN reservado_micro ELSE COALESCE(costo_micro, 0) END), 0)";
const UMBRALES = Object.freeze([50, 80, 100]);
// 0.12.7 (pedido del dueño): el tope GENERAL (el del mes del dueño) avisa cada 10 % (10, 20 … 100), cada uno una vez por
// mes, por la pantalla y por Telegram (en silencio; el 100 %, la IA queda en modo básico, suena). Los topes de cada
// cuenta siguen en 50, 80 y 100 %.
const UMBRALES_GENERAL = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
const NIVELES_GENERAL = Object.freeze(Object.fromEntries(UMBRALES_GENERAL.map(u => [u, u >= 100 ? 'grave' : 'atencion'])));
const NIVELES_OTROS = Object.freeze({ 50: 'info', 80: 'atencion', 100: 'atencion' });

// Lo ya cerrado (sin lo que está en curso): solo crece durante el mes. Sirve para saber si un tope está LLENO de
// verdad (src/ia/presupuesto.js: topeLleno), no para apartar (para eso cuenta GASTO_SQL, con lo que está en curso).
const CERRADO_SQL = "COALESCE(SUM(CASE estado WHEN 'reservada' THEN 0 ELSE COALESCE(costo_micro, 0) END), 0)";

function sumar(db, suma, { mes, espacioId = null, proyectoId = null }) {
  if (proyectoId != null) {
    return db.prepare(`SELECT ${suma} AS g FROM ia_llamadas WHERE mes = ? AND proyecto_id = ? AND cuenta_proyecto = 1`).get(mes, Number(proyectoId)).g;
  }
  if (espacioId != null) return db.prepare(`SELECT ${suma} AS g FROM ia_llamadas WHERE mes = ? AND espacio_id = ?`).get(mes, Number(espacioId)).g;
  return db.prepare(`SELECT ${suma} AS g FROM ia_llamadas WHERE mes = ?`).get(mes).g;
}

// Gasto del mes de cobro (µUSD). Con espacioId: solo esa cuenta. Con proyectoId: solo lo que cuenta contra el tope
// de ese proyecto (cuenta_proyecto = 1).
export function gastoMicro(db, filtro) {
  return sumar(db, GASTO_SQL, filtro);
}

// Lo mismo, sin lo que todavía está en curso.
export function gastoCerradoMicro(db, filtro) {
  return sumar(db, CERRADO_SQL, filtro);
}

// El filtro de gastoMicro para un ámbito ('general', 'e<cuenta>', 'p<proyecto>').
export function filtroDeAmbito(mes, ambito) {
  const m = /^([ep])(\d+)$/.exec(String(ambito));
  if (!m) return { mes };
  return m[1] === 'e' ? { mes, espacioId: Number(m[2]) } : { mes, proyectoId: Number(m[2]) };
}

// Lo apartado para usos que todavía están en curso (µUSD).
export function apartadoMicro(db, { mes, espacioId = null }) {
  if (espacioId != null) {
    return db.prepare("SELECT COALESCE(SUM(reservado_micro), 0) AS g FROM ia_llamadas WHERE mes = ? AND estado = 'reservada' AND espacio_id = ?").get(mes, Number(espacioId)).g;
  }
  return db.prepare("SELECT COALESCE(SUM(reservado_micro), 0) AS g FROM ia_llamadas WHERE mes = ? AND estado = 'reservada'").get(mes).g;
}

export const claveAvisoTope = (ambito, mes) => `ia_tope:${ambito}:${mes}`;

function leerDetalle(texto) {
  try { return texto == null ? null : JSON.parse(texto); } catch { return null; }
}

// El precio con el que se mide si un tope está lleno: el del primer proveedor que el dueño usa y cuyo precio está
// confirmado (el que reservar elegiría si su clave está lista). null si no hay ninguno.
export function precioDeReferencia(cfg, db = null) {
  for (const id of cfg?.orden ?? []) {
    const p = cfg.proveedores?.[id];
    if (!p?.usar) continue;
    const precio = precioPara(db, id, p.modelo);
    if (precio) return precio;
  }
  return null;
}

// Lo mínimo que puede apartar UN uso de la IA con ese precio: el pedido más corto (entradaMinBytes) del propósito más
// barato de los que existen ahora.
export function reservaMinimaMicro(precio, propositos = PROPOSITOS) {
  let minimo = null;
  for (const def of Object.values(propositos ?? {})) {
    if (!def || def.fase > FASE_ACTUAL) continue;
    // 0.14.2: los usos especiales (un dibujo, mirar un dibujo) no cuentan: no dicen si cabe una clase o una explicación.
    if (def.tipo === 'imagen' || Array.isArray(def.proveedores)) continue;
    const entrada = Number.isSafeInteger(def.entradaMinBytes) && def.entradaMinBytes > 0 ? def.entradaMinBytes : 1;
    const r = reservaMicro(precio, { entradaMax: entrada, salidaMax: def.salidaMax });
    if (minimo == null || r < minimo) minimo = r;
  }
  return minimo ?? 1;
}

// ¿El tope de ese ámbito está LLENO para el resto del mes? Sí cuando lo ya cerrado (sin lo que está en curso, que
// puede costar menos) llegó al tope o no deja lugar ni para el uso más barato posible. Ronda 2 de revisión: un pedido
// grande que no cabe NO llena el tope (uno más corto todavía cabe y se puede pagar). La misma regla vale para el
// aviso del 100 %, para «Tope lleno» en las pantallas (src/ia/consumo.js) y para la ayuda del proyecto.
export function topeLleno(db, { cfg, ambito, mes, precio = undefined, propositos = PROPOSITOS }) {
  const tope = topeDeAmbito(db, cfg, ambito);
  if (!Number.isSafeInteger(tope)) return false;
  const usado = gastoCerradoMicro(db, filtroDeAmbito(mes, ambito));
  if (usado >= tope) return true;
  const elPrecio = precio === undefined ? precioDeReferencia(cfg, db) : precio;
  return Boolean(elPrecio) && tope - usado < reservaMinimaMicro(elPrecio, propositos);
}

// Abre o sube el aviso de cada ámbito que pasó un umbral. UNA fila por ámbito y mes de cobro: sube como mucho 3 veces
// (50 → 80 → 100); repetir el mismo nivel no escribe nada; cada subida vuelve a mandarse (enviado_en vacío, para
// Telegram en la parte e) y la pantalla la muestra como nueva. cfg: la configuración de IA (leerConfigIa).
// Un tope LLENO (topeLleno: lo que queda no alcanza ni para el uso más barato) cuenta como 100 % aunque el número
// todavía no llegue. Ronda 2 de revisión: antes, cualquier pedido frenado por el tope lo marcaba «lleno»; ahora un
// pedido grande que no cabe no llena el tope: así el aviso «queda en pausa» nunca sale mientras se sigue gastando, y el
// 80 % sigue avisando cuando de verdad se pasa. propositos: solo para las pruebas.
export function revisarUmbrales(db, { mes, ambitos, ahora = Date.now(), cfg, propositos = PROPOSITOS }) {
  const abiertos = [];
  for (const ambito of new Set((ambitos ?? []).filter(Boolean))) {
    const tope = topeDeAmbito(db, cfg, ambito);
    if (!Number.isSafeInteger(tope) || tope <= 0) continue;
    const usado = gastoMicro(db, filtroDeAmbito(mes, ambito));
    const pct = Math.floor((100 * usado) / tope);
    const lleno = pct >= 100 || topeLleno(db, { cfg, ambito, mes, propositos });
    const umbral = lleno ? 100 : [...(ambito === 'general' ? UMBRALES_GENERAL : UMBRALES)].reverse().find(u => pct >= u) ?? null;
    if (umbral == null) continue;
    const clave = claveAvisoTope(ambito, mes);
    const abierto = db.prepare('SELECT detalle FROM avisos WHERE clave = ? AND resuelto_en IS NULL').get(clave);
    if (umbral <= (Number(leerDetalle(abierto?.detalle)?.umbral) || 0)) continue;
    const niveles = ambito === 'general' ? NIVELES_GENERAL : NIVELES_OTROS;
    const [anio, mesNumero] = mes.split('-').map(Number);
    const vuelveEl = new Date(inicioMesSiguienteCobro(Date.UTC(anio, mesNumero - 1, 15))).toISOString();
    // 0.12.7: cuántos días quedan del mes de cobro (para «quedan 18 días»).
    const dias = Math.max(0, Math.ceil((Date.parse(vuelveEl) - ahora) / 86_400_000));
    abrirAviso(db, { clave, nivel: niveles[umbral], detalle: { ambito, mes, umbral, pct, usadoMicro: usado, topeMicro: tope, vuelveEl, dias }, reenviar: true, ahora });
    abiertos.push(clave);
  }
  return abiertos;
}

// 0.12.7: el resumen de AYER (día de RD) si ayer se gastó algo: lo llama la vigilancia de cada hora (src/ia/presupuesto.js,
// vigilarIA; solo la base, nunca la red). Uno por día; un día sin gasto no tiene ninguno. Solo números (nunca un nombre).
export function resumenDelDia(db, { ahora = Date.now(), cfg }) {
  const hoy = new Date(ahora - 4 * 3_600_000).toISOString().slice(0, 10);
  const inicioHoy = Date.parse(`${hoy}T04:00:00Z`);
  const inicioAyer = inicioHoy - 86_400_000;
  const dia = new Date(inicioAyer).toISOString().slice(0, 10);
  const clave = `ia_resumen:${dia}`;
  if (db.prepare('SELECT 1 FROM avisos WHERE clave = ?').get(clave)) return null;
  const f = db.prepare(`SELECT ${GASTO_SQL} AS g, COUNT(*) AS n FROM ia_llamadas WHERE creada_en >= ? AND creada_en < ? AND estado <> 'reservada'`)
    .get(new Date(inicioAyer).toISOString(), new Date(inicioHoy).toISOString());
  if (!(f.g > 0)) return null;
  const mes = new Date(ahora).toISOString().slice(0, 7); // el mes de cobro (src/tareas/tiempo.js, mesCobro)
  const usadoMes = gastoMicro(db, { mes });
  const tope = cfg?.topeGeneralMicro ?? 0;
  const dias = Math.max(0, Math.ceil((inicioMesSiguienteCobro(ahora) - ahora) / 86_400_000));
  // Los anteriores ya se leyeron (o no hace falta): se cierran para que la lista no crezca.
  for (const a of db.prepare("SELECT clave FROM avisos WHERE resuelto_en IS NULL AND substr(clave, 1, 11) = 'ia_resumen:'").all()) resolverAviso(db, a.clave, ahora);
  abrirAviso(db, { clave, nivel: 'atencion', detalle: { dia, usadoMicro: f.g, n: f.n, mesMicro: usadoMes, topeMicro: tope, pct: tope > 0 ? Math.floor((100 * usadoMes) / tope) : 0, dias }, ahora });
  return clave;
}

// Cierra los avisos de tope del mes de cobro que cumplan el filtro (por ámbito). Devuelve los ámbitos cerrados.
export function resolverAvisosDeTope(db, { mes, filtro = () => true, ahora = Date.now() }) {
  const cerrados = [];
  for (const a of db.prepare("SELECT clave FROM avisos WHERE resuelto_en IS NULL AND substr(clave, 1, 8) = 'ia_tope:'").all()) {
    const partes = a.clave.split(':');
    if (partes.length !== 3 || partes[2] !== mes || !filtro(partes[1])) continue;
    if (resolverAviso(db, a.clave, ahora)) cerrados.push(partes[1]);
  }
  return cerrados;
}
