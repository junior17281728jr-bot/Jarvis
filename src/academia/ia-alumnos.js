// 0.12.8 (pedido del dueño): «IA por alumno» y «Registro de la IA» (Administrador → Dinero e IA). Solo el administrador.
//  - IA por alumno: por cada alumno, su prueba o plan, los usos y los US$ del mes, el tope de su cuenta (y su tope
//    personal, que se cambia en la misma fila), si pagó este mes (fecha y monto del último comprobante aprobado) y cuándo
//    vence. Acciones: dar la prueba otra vez (tiempo-ia.js), regalar N usos y pausar la IA de ese alumno.
//  - Registro de la IA: (1) por alumno: la meta de la IA con él, su foco de ahora, la próxima clase preparada y todo lo
//    que la IA generó para él (fecha, tipo, un trozo, costo); (2) la biblioteca de lo guardado y compartido (lo que sirve a
//    todos: explicaciones, mini-clases y lo que venga después): el texto completo, cuántas veces se volvió a usar, cuánto
//    se ahorró, buscar, y «ocultar» uno malo (se marca: nunca se borra; la marca guarda el texto de esa vez).
//  - Nada se borra: todo va en «ajustes» y en el libro de academia_ia_minutos (motivo 'regalo_usos').
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { espacioDe } from '../cuentas/espacios.js';
import { mesCobro } from '../tareas/tiempo.js';
import { gastoMicro } from '../ia/gasto.js';
import { leerConfigIa } from '../ia/config.js';
import { topeEspacioMicro } from '../ia/topes.js';
import { clavePausa, claveTopePersonal, pausaDe, topePersonalDe, usdAMicro, TOPE_ALUMNO_MAX_MICRO } from '../ia/tope-alumno.js';
import { derechoIa, leerConfigPagos } from './tiempo-ia.js';
import { generadoPara, preparacionesDe, memoriaDe, metaDe, biblioteca as bibliotecaIa, ocultar } from './registro-ia.js';

const iso = ms => new Date(ms).toISOString();
const json = texto => { try { const v = JSON.parse(texto ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const guardar = (db, clave, valor, ahora) => db.prepare(`INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)
  ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`).run(clave, JSON.stringify(valor), iso(ahora));
const USOS = "('uso', 'uso_plan', 'uso_prueba')";
const DEVOLUCIONES = "('devolucion', 'devolucion_plan', 'devolucion_prueba')";
export const REGALO_MAX = 1000;

function alumno(db, id) {
  const n = Number(id);
  const u = Number.isSafeInteger(n) ? db.prepare("SELECT id, nombre, nombre_visible, rol, activo FROM usuarios WHERE id = ?").get(n) : null;
  if (!u || u.rol === 'admin') throw new ErrorHttp(404, 'no_existe');
  return u;
}

// Los usos de la IA de ese alumno en ese mes de cobro (los devueltos ya restados).
function usosDelMes(db, usuarioId, mes) {
  const desde = `${mes}-01T00:00:00.000Z`;
  const [a, m] = mes.split('-').map(Number);
  const hasta = new Date(Date.UTC(a, m, 1)).toISOString();
  const f = db.prepare(`SELECT COALESCE(SUM(CASE WHEN motivo IN ${USOS} THEN 1 WHEN motivo IN ${DEVOLUCIONES} THEN -1 ELSE 0 END), 0) AS n
    FROM academia_ia_minutos WHERE usuario_id = ? AND creado_en >= ? AND creado_en < ?`).get(usuarioId, desde, hasta);
  return Math.max(0, f.n);
}

// ---------- IA por alumno ----------
export function filasIaAlumnos(db, ahora = Date.now()) {
  const cfgIa = leerConfigIa(db);
  const mes = mesCobro(ahora);
  const inicioMes = `${mes}-01T00:00:00.000Z`;
  const filas = db.prepare("SELECT id, nombre, nombre_visible FROM usuarios WHERE rol <> 'admin' AND activo = 1 ORDER BY nombre").all().map(u => {
    const d = derechoIa(db, u.id, ahora);
    const e = espacioDe(db, { id: u.id });
    const tope = e ? topeEspacioMicro(db, cfgIa, e.id, ahora) : { topeMicro: 0 };
    const ultimo = db.prepare("SELECT id, precio, paquete, revisado_en FROM academia_pagos WHERE usuario_id = ? AND estado = 'aprobado' ORDER BY revisado_en DESC, id DESC LIMIT 1").get(u.id);
    const vence = d.plan && !d.plan.vencido ? d.plan.hasta : d.prueba?.hasta ?? null;
    return {
      id: u.id, nombre: u.nombre_visible || u.nombre, usuario: u.nombre,
      fuente: d.fuente, motivo: d.motivo, plan: d.plan, prueba: d.prueba, minutos: d.minutos,
      usosMes: usosDelMes(db, u.id, mes), usdMesMicro: e ? gastoMicro(db, { mes, espacioId: e.id }) : 0,
      topeMicro: tope.topeMicro, topeFuente: tope.fuente ?? 'cuenta', topePersonalMicro: topePersonalDe(db, u.id), pausada: pausaDe(db, u.id),
      pago: ultimo ? { fecha: ultimo.revisado_en, precio: ultimo.precio, esteMes: String(ultimo.revisado_en) >= inicioMes } : null,
      vence,
    };
  }).sort((a, b) => b.usdMesMicro - a.usdMesMicro || b.usosMes - a.usosMes || a.nombre.localeCompare(b.nombre));
  const totales = {
    alumnos: filas.length, usosMes: filas.reduce((n, f) => n + f.usosMes, 0), usdMesMicro: filas.reduce((n, f) => n + f.usdMesMicro, 0),
    pagaronMes: filas.filter(f => f.pago?.esteMes).length, conPlan: filas.filter(f => f.plan && !f.plan.vencido).length,
    generalMicro: gastoMicro(db, { mes }), topeGeneralMicro: cfgIa.topeGeneralMicro,
  };
  return { mes, filas, totales, modo: leerConfigPagos(db).modo };
}

// Regalar N usos: van como minutos (N × lo que cuesta un uso), que se gastan después del plan y de la prueba.
export function regalarUsos(db, id, usos, adminId, ahora = Date.now()) {
  const u = alumno(db, id);
  if (!Number.isSafeInteger(usos) || usos < 1 || usos > REGALO_MAX) throw new ErrorHttp(400, 'usos_no_validos');
  const porUso = leerConfigPagos(db).minutosPorUso;
  return enTransaccion(db, () => {
    db.prepare("INSERT INTO academia_ia_minutos (usuario_id, minutos, motivo, referencia, tarea_id, hecho_por, creado_en) VALUES (?, ?, 'regalo_usos', ?, NULL, ?, ?)")
      .run(u.id, usos * porUso, `regalo:${usos}`, adminId, iso(ahora));
    auditar(db, { usuarioId: adminId, accion: 'ia_regalo_usos', detalle: `${u.id}: ${usos}` });
    return derechoIa(db, u.id, ahora);
  });
}
export function pausarIa(db, id, pausada, adminId, ahora = Date.now()) {
  const u = alumno(db, id);
  if (typeof pausada !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  enTransaccion(db, () => {
    guardar(db, clavePausa(u.id), { pausada, por: adminId, en: iso(ahora) }, ahora);
    auditar(db, { usuarioId: adminId, accion: pausada ? 'ia_alumno_pausada' : 'ia_alumno_reanudada', detalle: String(u.id) });
  });
  return { pausada };
}
// usd: '2.50' (hasta US$20), o null para volver al que sale de su plan.
export function ponerTopePersonal(db, id, usd, adminId, ahora = Date.now()) {
  const u = alumno(db, id);
  const texto = usd == null ? '' : String(usd).trim().replace(',', '.');
  const micro = texto === '' ? null : usdAMicro(texto);
  if (texto !== '' && (micro == null || Number(texto) * 1_000_000 > TOPE_ALUMNO_MAX_MICRO)) throw new ErrorHttp(400, 'tope_no_valido');
  enTransaccion(db, () => {
    guardar(db, claveTopePersonal(u.id), { usd: micro == null ? null : (micro / 1_000_000).toFixed(2), por: adminId, en: iso(ahora) }, ahora);
    auditar(db, { usuarioId: adminId, accion: 'ia_tope_personal', detalle: `${u.id}: ${micro == null ? 'del plan' : micro}` });
  });
  return { topePersonalMicro: micro };
}

// ---------- Registro de la IA ----------
// 0.12.11: los datos salen de src/academia/registro-ia.js (rama del tutor, 0.12.9): lo generado para él, sus
// preparaciones, la memoria del tutor, su meta y foco, la biblioteca de lo compartido (con reusos y ahorro) y «ocultar».
// Aquí solo se juntan para la pantalla y se suma lo que de verdad costó (ia_llamadas) y la auditoría de «ocultar».

// Lo compartido, con nombres de la pantalla. buscar: en el texto completo.
export function biblioteca(db, { buscar = '', limite = 200 } = {}) {
  const b = bibliotecaIa(db, { buscar, limite });
  const lista = b.items.map(x => ({ clave: x.clave, tipo: x.tipo, en: x.fecha, modelo: x.modelo, corto: x.texto, completo: x.textoCompleto ?? x.texto,
    oculto: x.oculto, veces: x.reusos, costoMicro: x.costoMicro, ahorroMicro: x.ahorroMicro }));
  return { lista, total: b.total, ahorroMicro: lista.reduce((n, x) => n + (x.ahorroMicro ?? 0), 0), vecesReusado: lista.reduce((n, x) => n + (x.veces ?? 0), 0) };
}

// Ocultar (o mostrar otra vez) una que salió mala: la marca de registro-ia.js (nunca se borra nada) y la auditoría.
export function ocultarGuardado(db, clave, oculto, adminId) {
  if (typeof clave !== 'string' || clave.length > 300 || typeof oculto !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
  const r = enTransaccion(db, () => {
    const x = ocultar(db, clave, oculto);
    if (x) auditar(db, { usuarioId: adminId, accion: oculto ? 'ia_guardado_oculto' : 'ia_guardado_visible', detalle: clave.slice(0, 200) });
    return x;
  });
  if (!r) throw new ErrorHttp(404, 'no_existe');
  return r;
}

// El registro de UN alumno: su meta y foco, la próxima clase, lo que la IA generó para él, sus preparaciones, la memoria
// del tutor y lo que costaron sus llamadas (ia_llamadas, con el tipo y la fecha de cada una).
export function registroAlumno(db, id, paquete = null, ahora = Date.now()) {
  const u = alumno(db, id);
  const m = metaDe(db, u.id, paquete, ahora);
  const llamadas = db.prepare('SELECT proposito, costo_micro, creada_en FROM ia_llamadas WHERE usuario_id = ? ORDER BY id DESC LIMIT 300').all(u.id);
  return {
    alumno: { id: u.id, nombre: u.nombre_visible || u.nombre, usuario: u.nombre },
    meta: m.meta, foco: m.foco,
    proximaClase: m.proximaClase ? { materia: m.proximaClase.materia, tema: m.proximaClase.tema, preparada: m.proximaClase.preparada ?? null,
      titulo: paquete?.materias?.find(x => x.id === m.proximaClase.materia)?.temas?.find(x => x.id === m.proximaClase.tema)?.titulo ?? m.proximaClase.tema } : null,
    generado: generadoPara(db, u.id), preparaciones: preparacionesDe(db, u.id).slice(0, 10), memoria: memoriaDe(db, u.id, { limite: 20 }),
    llamadas: llamadas.length, costoMicro: llamadas.reduce((n, l) => n + (l.costo_micro ?? 0), 0),
  };
}
