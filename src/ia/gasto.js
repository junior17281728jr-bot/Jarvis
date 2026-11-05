// Cuánto se gastó en IA, y los avisos al 50, 80 y 100 % de cada tope.
// La ÚNICA cuenta del gasto (gastoMicro): lo que está «en curso» cuenta lo máximo apartado; lo demás, lo que costó.
// Así, mientras una llamada está en camino, ya cuenta para el tope: nunca se pasa aunque lleguen varias a la vez.
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';
import { inicioMesSiguienteCobro } from '../tareas/tiempo.js';
import { topeDeAmbito } from './topes.js';

export const GASTO_SQL = "COALESCE(SUM(CASE estado WHEN 'reservada' THEN reservado_micro ELSE COALESCE(costo_micro, 0) END), 0)";
const UMBRALES = Object.freeze([50, 80, 100]);
const NIVELES_GENERAL = Object.freeze({ 50: 'info', 80: 'atencion', 100: 'grave' });
const NIVELES_OTROS = Object.freeze({ 50: 'info', 80: 'atencion', 100: 'atencion' });

// Gasto del mes de cobro (µUSD). Con espacioId: solo esa cuenta. Con proyectoId: solo lo que cuenta contra el tope
// de ese proyecto (cuenta_proyecto = 1).
export function gastoMicro(db, { mes, espacioId = null, proyectoId = null }) {
  if (proyectoId != null) {
    return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE mes = ? AND proyecto_id = ? AND cuenta_proyecto = 1`).get(mes, Number(proyectoId)).g;
  }
  if (espacioId != null) return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE mes = ? AND espacio_id = ?`).get(mes, Number(espacioId)).g;
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE mes = ?`).get(mes).g;
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

// Abre o sube el aviso de cada ámbito que pasó un umbral. UNA fila por ámbito y mes de cobro: sube como mucho 3 veces
// (50 → 80 → 100); repetir el mismo nivel no escribe nada; cada subida vuelve a mandarse (enviado_en vacío, para
// Telegram en la parte e) y la pantalla la muestra como nueva. lleno: el ámbito cuyo tope acaba de frenar un uso
// (cuenta como 100 % aunque el número todavía no llegue). cfg: la configuración de IA (leerConfigIa).
export function revisarUmbrales(db, { mes, ambitos, lleno = null, ahora = Date.now(), cfg }) {
  const abiertos = [];
  for (const ambito of new Set((ambitos ?? []).filter(Boolean))) {
    const tope = topeDeAmbito(db, cfg, ambito);
    if (!Number.isSafeInteger(tope) || tope <= 0) continue;
    const m = /^([ep])(\d+)$/.exec(ambito);
    const usado = ambito === 'general' ? gastoMicro(db, { mes })
      : m[1] === 'e' ? gastoMicro(db, { mes, espacioId: Number(m[2]) }) : gastoMicro(db, { mes, proyectoId: Number(m[2]) });
    const pct = Math.floor((100 * usado) / tope);
    const umbral = lleno === ambito || pct >= 100 ? 100 : [...UMBRALES].reverse().find(u => pct >= u) ?? null;
    if (umbral == null) continue;
    const clave = claveAvisoTope(ambito, mes);
    const abierto = db.prepare('SELECT detalle FROM avisos WHERE clave = ? AND resuelto_en IS NULL').get(clave);
    if (umbral <= (Number(leerDetalle(abierto?.detalle)?.umbral) || 0)) continue;
    const niveles = ambito === 'general' ? NIVELES_GENERAL : NIVELES_OTROS;
    const [anio, mesNumero] = mes.split('-').map(Number);
    const vuelveEl = new Date(inicioMesSiguienteCobro(Date.UTC(anio, mesNumero - 1, 15))).toISOString();
    abrirAviso(db, { clave, nivel: niveles[umbral], detalle: { ambito, mes, umbral, pct, usadoMicro: usado, topeMicro: tope, vuelveEl }, reenviar: true, ahora });
    abiertos.push(clave);
  }
  return abiertos;
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
