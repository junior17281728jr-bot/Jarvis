// 0.14.1 (pedido del dueño): «Pago del servidor». El servidor (un droplet de DigitalOcean) se paga cada mes en la cuenta de
// DigitalOcean del dueño; aquí se anota cuánto, qué día, con qué se paga (una nota corta, nunca el número de la tarjeta) y si
// se cobra solo. Sin cambio de base: todo en la tabla «ajustes» (clave 'servidor.pago').
//  - proximoPago: la fecha del próximo pago en días de RD (UTC−4 todo el año), cuántos días faltan y el color. Pura (el
//    reloj llega de afuera: las pruebas usan uno de mentira).
//  - Recordatorios por Telegram con los avisos de siempre (src/canales/avisador.js los manda): 7 días antes, 2 días antes y
//    el día del pago; nada si ese mes ya está marcado como pagado. Con «pago automático», UNO solo, 2 días antes («se
//    cobrará solo; revisa que tu tarjeta tenga fondos»). Cada uno tiene su propia clave
//    ('servidor_pago:<AAAA-MM>:<d7|d2|d0|auto>') y NUNCA se abre dos veces (aunque ya esté resuelto o «Entendido»).
//  - Si la app estuvo apagada y se saltó un recordatorio, solo va el que toca ahora (nunca tres juntos).
import { enTransaccion } from '../nucleo/db.js';
import { ErrorHttp } from '../nucleo/http.js';
import { auditar } from '../cuentas/usuarios.js';
import { abrirAviso, resolverAviso } from './avisos.js';

export const CLAVE_PAGO = 'servidor.pago';
export const ENLACES_PAGO = Object.freeze({
  factura: 'https://cloud.digitalocean.com/account/billing',
  servidor: 'https://cloud.digitalocean.com/droplets',
});
// Naranja a 7 días o menos; rojo a 2 días o menos (y vencido).
export const UMBRALES_PAGO = Object.freeze({ atencion: 7, mal: 2 });
// Un pago que pasó sin marcarse «pagado» se muestra vencido hasta 5 días; después se piensa en el del mes siguiente.
export const GRACIA_PAGO_DIAS = 5;
export const ETAPAS_PAGO = Object.freeze(['d7', 'd2', 'd0', 'auto']);
export const METODO_MAX = 60;
export const MONTO_MAX = 10_000;

const DIA_MS = 86_400_000;
const RD = -4 * 3600 * 1000;
const dos = n => String(n).padStart(2, '0');
const claveMes = (y, m) => `${y}-${dos(m)}`;
const ultimoDia = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ordinal = (y, m, d) => Date.UTC(y, m - 1, d) / DIA_MS;
const siguiente = ({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });

// El día de RD de un momento: { y, m, d }.
export function diaRd(ahora) {
  const f = new Date(ahora + RD);
  return { y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() };
}

// El día de pago de un mes (el 31 en noviembre es el 30; el 30 en febrero, el 28 o 29).
function vencimiento({ y, m }, dia) {
  const d = Math.min(dia, ultimoDia(y, m));
  return { y, m, d, mes: claveMes(y, m), fecha: `${claveMes(y, m)}-${dos(d)}` };
}

export function tonoPago(dias) {
  if (dias <= UMBRALES_PAGO.mal) return 'mal';
  if (dias <= UMBRALES_PAGO.atencion) return 'atencion';
  return 'bien';
}

// → { fecha: 'AAAA-MM-DD', mes: 'AAAA-MM', dias (negativo si ya venció), vencido, tono }. Pura.
// pago: { dia, pagadoMes, automatico, desde }. desde: el día en que se guardó por primera vez (un pago de antes nunca
// sale «vencido»).
export function proximoPago(pago = {}, ahora = Date.now()) {
  const dia = Number.isSafeInteger(pago.dia) && pago.dia >= 1 && pago.dia <= 31 ? pago.dia : 1;
  const hoy = diaRd(ahora);
  const hoyN = ordinal(hoy.y, hoy.m, hoy.d);
  let mes = { y: hoy.y, m: hoy.m };
  const este = vencimiento(mes, dia);
  const atraso = hoyN - ordinal(este.y, este.m, este.d);
  if (atraso > 0) {
    const puedeVencer = pago.automatico !== true && atraso <= GRACIA_PAGO_DIAS && (!pago.desde || este.fecha >= pago.desde);
    if (!puedeVencer) mes = siguiente(mes);
  }
  // Los meses ya marcados como pagados se saltan (se puede pagar por adelantado).
  const pagado = typeof pago.pagadoMes === 'string' && /^\d{4}-\d{2}$/.test(pago.pagadoMes) ? pago.pagadoMes : null;
  while (pagado && claveMes(mes.y, mes.m) <= pagado) mes = siguiente(mes);
  const v = vencimiento(mes, dia);
  const dias = ordinal(v.y, v.m, v.d) - hoyN;
  return { fecha: v.fecha, mes: v.mes, dias, vencido: dias < 0, tono: tonoPago(dias) };
}

// El recordatorio que toca ahora (o null): solo el más reciente.
export function recordatorioQueToca(pago, proximo) {
  if (!pago?.configurado || !proximo) return null;
  const { dias } = proximo;
  if (pago.automatico === true) return dias >= 0 && dias <= UMBRALES_PAGO.mal ? 'auto' : null;
  if (dias <= 0) return 'd0';
  if (dias <= UMBRALES_PAGO.mal) return 'd2';
  if (dias <= UMBRALES_PAGO.atencion) return 'd7';
  return null;
}

// ---------- Lo guardado ----------

export function leerPago(db) {
  let v = null;
  try { v = JSON.parse(db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(CLAVE_PAGO)?.valor ?? 'null'); } catch { v = null; }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return {
    configurado: Boolean(v),
    montoUsd: typeof o.montoUsd === 'number' && Number.isFinite(o.montoUsd) && o.montoUsd > 0 ? o.montoUsd : null,
    dia: Number.isSafeInteger(o.dia) && o.dia >= 1 && o.dia <= 31 ? o.dia : 1,
    metodo: typeof o.metodo === 'string' ? o.metodo.slice(0, METODO_MAX) : '',
    automatico: o.automatico === true,
    pagadoMes: typeof o.pagadoMes === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(o.pagadoMes) ? o.pagadoMes : null,
    desde: typeof o.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.desde) ? o.desde : null,
  };
}

function guardar(db, pago, ahora) {
  const { configurado, ...resto } = pago;
  db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(CLAVE_PAGO, JSON.stringify(resto), new Date(ahora).toISOString());
}

// Un número de tarjeta (8 cifras o más seguidas, con o sin espacios o guiones entre ellas) nunca se guarda.
export function pareceTarjeta(texto) {
  return /\d(?:[\s.-]?\d){7,}/.test(String(texto ?? ''));
}

function leerMonto(valor) {
  if (valor == null || valor === '') return null;
  const texto = String(valor).trim().replace(/^US\$\s*|^\$\s*/i, '').replace(',', '.');
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(texto)) throw new ErrorHttp(400, 'pago_servidor_monto');
  const n = Number(texto);
  if (!(n > 0 && n <= MONTO_MAX)) throw new ErrorHttp(400, 'pago_servidor_monto');
  return n;
}

// Cambia monto, día, nota del método y «automático» (lo que venga). Devuelve lo guardado.
export function guardarAjustesPago(db, datos = {}, { usuarioId = null, ahora = Date.now() } = {}) {
  const actual = leerPago(db);
  const nuevo = { ...actual };
  if (Object.hasOwn(datos, 'montoUsd')) nuevo.montoUsd = leerMonto(datos.montoUsd);
  if (Object.hasOwn(datos, 'dia')) {
    const d = Number(datos.dia);
    if (!Number.isSafeInteger(d) || d < 1 || d > 31) throw new ErrorHttp(400, 'pago_servidor_dia');
    nuevo.dia = d;
  }
  if (Object.hasOwn(datos, 'metodo')) {
    if (typeof datos.metodo !== 'string') throw new ErrorHttp(400, 'pago_servidor_metodo');
    const m = datos.metodo.replace(/\s+/g, ' ').trim();
    if (m.length > METODO_MAX || /[\u0000-\u001f\u007f]/.test(m)) throw new ErrorHttp(400, 'pago_servidor_metodo');
    if (pareceTarjeta(m)) throw new ErrorHttp(400, 'pago_servidor_tarjeta');
    nuevo.metodo = m;
  }
  if (Object.hasOwn(datos, 'automatico')) {
    if (typeof datos.automatico !== 'boolean') throw new ErrorHttp(400, 'pago_servidor_automatico');
    nuevo.automatico = datos.automatico;
  }
  if (!nuevo.desde) { const h = diaRd(ahora); nuevo.desde = `${claveMes(h.y, h.m)}-${dos(h.d)}`; }
  enTransaccion(db, () => {
    guardar(db, nuevo, ahora);
    // Nunca la nota del método en la auditoría.
    auditar(db, { usuarioId, accion: 'servidor_pago_ajustes', detalle: `día ${nuevo.dia} · automático ${nuevo.automatico ? 'sí' : 'no'}` });
  });
  revisarPagoServidor(db, ahora);
  return leerPago(db);
}

// «Marcar como pagado este mes»: marca el mes del pago que se muestra (y cierra sus recordatorios). deshacer: el mes
// anterior al último marcado.
export function marcarPagado(db, { deshacer = false, usuarioId = null, ahora = Date.now() } = {}) {
  const actual = leerPago(db);
  const nuevo = { ...actual };
  if (deshacer) {
    if (!actual.pagadoMes) return actual;
    const [y, m] = actual.pagadoMes.split('-').map(Number);
    nuevo.pagadoMes = m === 1 ? claveMes(y - 1, 12) : claveMes(y, m - 1);
  } else {
    nuevo.pagadoMes = proximoPago(actual, ahora).mes;
  }
  if (!nuevo.desde) { const h = diaRd(ahora); nuevo.desde = `${claveMes(h.y, h.m)}-${dos(h.d)}`; }
  enTransaccion(db, () => {
    guardar(db, nuevo, ahora);
    auditar(db, { usuarioId, accion: deshacer ? 'servidor_pago_deshacer' : 'servidor_pago_pagado', detalle: deshacer ? actual.pagadoMes : nuevo.pagadoMes });
  });
  revisarPagoServidor(db, ahora);
  return leerPago(db);
}

// Lo que ve la pantalla (y el Resumen): nunca nada más que esto.
export function estadoPago(db, ahora = Date.now()) {
  const pago = leerPago(db);
  const proximo = proximoPago(pago, ahora);
  return {
    pago: { configurado: pago.configurado, montoUsd: pago.montoUsd, dia: pago.dia, metodo: pago.metodo, automatico: pago.automatico, pagadoMes: pago.pagadoMes },
    proximo,
    recordatorio: recordatorioQueToca(pago, proximo),
    enlaces: ENLACES_PAGO,
  };
}

// La revisión (la hace el avisador cada 5 min, y al guardar): abre el recordatorio que toca si nunca se abrió, y cierra
// los otros de este aviso que siguieran abiertos. → { clave, abierto } o null.
export function revisarPagoServidor(db, ahora = Date.now()) {
  const pago = leerPago(db);
  const proximo = proximoPago(pago, ahora);
  const etapa = recordatorioQueToca(pago, proximo);
  const clave = etapa ? `servidor_pago:${proximo.mes}:${etapa}` : null;
  return enTransaccion(db, () => {
    const abiertos = db.prepare("SELECT clave FROM avisos WHERE resuelto_en IS NULL AND clave LIKE 'servidor_pago:%'").all();
    for (const a of abiertos) if (a.clave !== clave) resolverAviso(db, a.clave, ahora);
    if (!clave) return null;
    if (db.prepare('SELECT 1 FROM avisos WHERE clave = ? LIMIT 1').get(clave)) return { clave, abierto: false };
    // En el detalle, solo la fecha, los días y el monto (nunca la nota del método).
    abrirAviso(db, { clave, nivel: 'atencion', detalle: { fecha: proximo.fecha, dias: proximo.dias, montoCentavos: pago.montoUsd == null ? null : Math.round(pago.montoUsd * 100) }, ahora });
    return { clave, abierto: true };
  });
}
