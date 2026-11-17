// 0.14.31 (pedido del dueño: «no me especifica mucho»): UNA tarjeta «Dinero de la IA», en palabras simples.
//  - Cada tope como una barra: el general del mes, «Mejorar todo con Claude» (por ronda), el chat del admin («Pídele a la
//    IA», del mes), la Mejora continua (del mes) y lo de los alumnos (la suma de sus topes del mes).
//  - El pronóstico con lo gastado en los últimos 7 días: «a este ritmo, el tope alcanza hasta el 24 nov» o «sobra US$40».
//  - La mejora profunda: cuánto le queda (lo que de verdad puede gastar: su tope y lo libre del general) y cuántos temas
//    más caben, con los estimados de la propia mejora (src/academia/fabrica-profunda.js: estimadoProfundo).
//  - Por alumno: los usos que le quedan y hasta cuándo, y «Darle más IA» / «Quitarle IA» con opciones simples, cada una
//    con «≈ cuánto cuesta» (el costo medido de un uso de los alumnos este mes).
// Nada se borra: los usos regalados y quitados van como filas nuevas en academia_ia_minutos (motivos 'regalo_usos' y
// 'quitar_regalo'); el tiempo regalado mueve la fecha de fin del plan (academia.ia.plan.<id>) y deja su historia en
// academia.ia.regalo.tiempo.<id> (lo pagado, la base, nunca se quita). Todo queda en la auditoría.
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { mesCobro, inicioMesSiguienteCobro } from '../tareas/tiempo.js';
import { GASTO_SQL, gastoMicro } from '../ia/gasto.js';
import { leerConfigIa, LIMITES_IA } from '../ia/config.js';
import { leerAjuste, guardarAjuste } from './paquetes.js';
import { leerConfigPagos, leerPlan, derechoIa, saldoIa } from './tiempo-ia.js';
import { filasIaAlumnos, regalarUsos, REGALO_MAX } from './ia-alumnos.js';
import { leerConfigFabrica, gastoMejoraMesMicro, T as T_FABRICA } from './fabrica.js';
import { resumenProfunda, estimadoProfundo, topeTodoMicro, TODO_TOPE_MICRO } from './fabrica-profunda.js';
import { gastoChatMicro } from './pidele.js';

export const DIA_MS = 86_400_000;
const iso = ms => new Date(ms).toISOString();
const claveRegaloTiempo = id => `academia.ia.regalo.tiempo.${Number(id)}`;
export const DIAS_REGALO_MAX = 90;
export const FIN_REGALO_MAX_DIAS = 365;
// Sin usos medidos todavía: lo que cuesta un uso con el presupuesto de IA Estándar (US$4 por 300 usos).
export const COSTO_USO_POR_DEFECTO_MICRO = 13_333;

// ---------- Cuentas puras (sin base): las prueba test/dinero-ia.test.js con un reloj fijo ----------

// El pronóstico del mes con el ritmo de los últimos 7 días. → { estado, ritmoDiaMicro, libreMicro, fecha?, dias?, sobraMicro? }
// estado: 'sin_tope' | 'lleno' | 'sin_ritmo' (no se gastó nada en 7 días) | 'alcanza' (se llena antes de fin de mes) | 'sobra'.
export function pronosticoMes({ gastadoMicro, topeMicro, gasto7dMicro, ahora, finMesMs }) {
  const ritmo = Math.max(0, gasto7dMicro) / 7;
  const libre = Math.max(0, topeMicro - gastadoMicro);
  const base = { ritmoDiaMicro: Math.round(ritmo), libreMicro: libre };
  if (!(topeMicro > 0)) return { ...base, estado: 'sin_tope' };
  if (gastadoMicro >= topeMicro) return { ...base, estado: 'lleno' };
  if (ritmo <= 0) return { ...base, estado: 'sin_ritmo', sobraMicro: libre };
  const llenoEn = ahora + (libre / ritmo) * DIA_MS;
  if (llenoEn < finMesMs) return { ...base, estado: 'alcanza', fecha: iso(llenoEn), dias: Math.max(0, Math.floor((llenoEn - ahora) / DIA_MS)) };
  return { ...base, estado: 'sobra', sobraMicro: Math.max(0, Math.round(libre - ritmo * ((finMesMs - ahora) / DIA_MS))) };
}

// ¿El tope de la mejora es más alto de lo que el tope del mes la deja gastar? (la fábrica siempre deja libre el margen
// para los alumnos). → null, o { profundaMicro, generalMicro, paraEnMicro, margenPct }
export function conflictoTopes({ profundaMicro, generalMicro, margen = T_FABRICA.margenGeneral }) {
  const paraEn = Math.max(0, Math.floor(generalMicro * (1 - margen)));
  if (!(profundaMicro > paraEn)) return null;
  return { profundaMicro, generalMicro, paraEnMicro: paraEn, margenPct: Math.round(margen * 100) };
}

// Cuántos temas más caben en lo que le queda a la mejora, con su propio estimado (lo que falta: costo y tiempo).
// → { quedanMicro, temas, dias, porTemaMicro } (temas y dias en null si no hay estimado)
export function pronosticoProfunda({ topeMicro, gastadoMicro, libreGeneralMicro = Infinity, faltaMicro, faltaTemas, faltaEtaMs }) {
  const quedan = Math.max(0, Math.min(topeMicro - gastadoMicro, libreGeneralMicro));
  if (!(faltaTemas > 0) || !(faltaMicro > 0)) return { quedanMicro: quedan, temas: null, dias: null, porTemaMicro: null };
  const porTema = faltaMicro / faltaTemas;
  const temas = Math.min(faltaTemas, Math.floor(quedan / porTema));
  const ms = faltaEtaMs > 0 ? (faltaEtaMs / faltaTemas) * temas : 0;
  return { quedanMicro: quedan, temas, dias: temas > 0 ? Math.max(1, Math.ceil(ms / DIA_MS)) : 0, porTemaMicro: Math.round(porTema) };
}

// Lo que cuesta un uso de los alumnos, medido (con al menos 5 usos), o el de por defecto.
export function costoPorUso({ usdMicro, usos }) {
  return usos >= 5 && usdMicro > 0 ? Math.round(usdMicro / usos) : COSTO_USO_POR_DEFECTO_MICRO;
}

// Las opciones simples de «Darle más IA» (y las mismas para «Quitarle IA»), con su costo aproximado.
// +1 semana / +1 mes: mueven la fecha de fin de su plan y le suman los usos que su plan da en ese tiempo (solo con planes).
export function opcionesRegalo({ modo = 'planes', planUsos = 300, planDias = 30, costoUsoMicro = COSTO_USO_POR_DEFECTO_MICRO } = {}) {
  const usosDe = dias => Math.max(1, Math.round((planUsos * dias) / Math.max(1, planDias)));
  const lista = [{ id: 'usos50', tipo: 'usos', usos: 50 }];
  if (modo === 'planes') lista.push({ id: 'semana', tipo: 'tiempo', dias: 7, usos: usosDe(7) }, { id: 'mes', tipo: 'tiempo', dias: 30, usos: usosDe(30) });
  return lista.map(o => ({ ...o, costoMicro: o.usos * costoUsoMicro }));
}

// ---------- Con la base ----------

// Lo gastado en los últimos «dias» días (todo: alumnos, fábrica, chat). El filtro por mes usa el índice.
export function gastoUltimosDias(db, ahora = Date.now(), dias = 7) {
  const desde = ahora - dias * DIA_MS;
  const meses = [...new Set([mesCobro(desde), mesCobro(ahora)])];
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE mes IN (${meses.map(() => '?').join(', ')}) AND creada_en >= ?`).get(...meses, iso(desde)).g;
}

// Lo gastado este mes por las cuentas de los alumnos (una sola consulta).
function gastoAlumnosMes(db, mes) {
  return db.prepare(`SELECT ${GASTO_SQL} AS g FROM ia_llamadas WHERE mes = ? AND espacio_id IN (
    SELECT m.espacio_id FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.rol = 'dueno' AND u.rol <> 'admin')`).get(mes).g;
}

// El estimado de la mejora lee el libro y los paquetes: se guarda 60 s (y si falla, no hay estimado).
let memoProfunda = null;
function estimadoCorto(db, config, ahora) {
  if (memoProfunda && memoProfunda.db === db && ahora >= memoProfunda.en && ahora - memoProfunda.en < 60_000) return memoProfunda.valor;
  let valor = null;
  try {
    const e = estimadoProfundo(db, config, { ahora });
    const m = e.porModo?.[e.modelo] ?? e.porModo?.opus;
    const temas = (m?.materias ?? []).filter(x => x.entra !== undefined).reduce((n, x) => n + x.temas, 0);
    valor = { libreGeneralMicro: e.libreGeneralMicro, faltaMicro: (m?.materias ?? []).reduce((n, x) => n + x.aMicro + x.cMicro, 0), faltaTemas: temas, faltaEtaMs: m?.etaMs ?? 0, pasosDentro: m?.pasos ?? 0, totalDentro: m?.totalMicro ?? 0 };
    // etaMs del estimado es de lo que ENTRA en el tope; el tiempo por tema sale de ahí.
    const temasDentro = (m?.materias ?? []).filter(x => x.entra).reduce((n, x) => n + x.temas, 0);
    if (temasDentro > 0 && m?.etaMs) valor.faltaEtaMs = Math.round((m.etaMs / temasDentro) * temas);
  } catch { valor = null; }
  memoProfunda = { db, en: ahora, valor };
  return valor;
}

// Los regalos netos (en minutos) de cada alumno: lo regalado menos lo quitado. → Map(usuarioId → minutos)
function regaladoNetoDe(db) {
  return new Map(db.prepare("SELECT usuario_id AS id, SUM(minutos) AS n FROM academia_ia_minutos WHERE motivo IN ('regalo_usos', 'quitar_regalo') GROUP BY usuario_id").all().map(f => [f.id, Math.max(0, f.n)]));
}
function leerRegaloTiempo(db, id) {
  try { const v = JSON.parse(leerAjuste(db, claveRegaloTiempo(id)) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
// El registro del tiempo regalado sirve solo para ESTE plan (una compra nueva cambia el plan: la base vuelve a empezar).
function regaloVigente(db, id, pl) {
  const r = leerRegaloTiempo(db, id);
  return r && pl && (r.pago ?? null) === (pl.pago ?? null) && r.desde === pl.desde && r.base ? r : null;
}

// La tarjeta entera (corto: solo los topes y los pronósticos, para el Resumen).
export function vistaDinero(db, config, { ahora = Date.now(), corto = false } = {}) {
  const cfgIa = leerConfigIa(db);
  const cfgF = leerConfigFabrica(db);
  const mes = mesCobro(ahora);
  const finMes = inicioMesSiguienteCobro(ahora);
  const general = gastoMicro(db, { mes });
  const pro = resumenProfunda(db);
  // Sin empezar «Mejorar todo», su tope es el que usará al empezar (US$90 o el que eligió el dueño).
  if (!pro.etapas) pro.topeMicro = topeTodoMicro(db) ?? TODO_TOPE_MICRO;
  const alumnosGasto = gastoAlumnosMes(db, mes);
  const topes = [
    { id: 'general', usadoMicro: general, topeMicro: cfgIa.topeGeneralMicro, periodo: 'mes' },
    { id: 'todo', usadoMicro: pro.gastoMicro, topeMicro: pro.topeMicro, periodo: 'ronda', activa: pro.activa },
    { id: 'chat', usadoMicro: gastoChatMicro(db, ahora), topeMicro: cfgF.chat.topeMicro, periodo: 'mes' },
    { id: 'mejora', usadoMicro: gastoMejoraMesMicro(db, ahora), topeMicro: cfgF.mejora.topeMesMicro, periodo: 'mes', activa: cfgF.mejora.activa === true },
    { id: 'alumnos', usadoMicro: alumnosGasto, topeMicro: null, periodo: 'mes' },
  ].map(x => ({ ...x, pct: x.topeMicro > 0 ? Math.min(999, Math.round((x.usadoMicro * 100) / x.topeMicro)) : null }));
  const pronostico = pronosticoMes({ gastadoMicro: general, topeMicro: cfgIa.topeGeneralMicro, gasto7dMicro: gastoUltimosDias(db, ahora), ahora, finMesMs: finMes });
  const conflicto = conflictoTopes({ profundaMicro: pro.topeMicro, generalMicro: cfgIa.topeGeneralMicro });
  const est = pro.activa || pro.empezo ? estimadoCorto(db, config, ahora) : null;
  const profunda = pronosticoProfunda({ topeMicro: pro.topeMicro, gastadoMicro: pro.gastoMicro, libreGeneralMicro: est?.libreGeneralMicro ?? Math.max(0, Math.floor(cfgIa.topeGeneralMicro * (1 - T_FABRICA.margenGeneral)) - general), faltaMicro: est?.faltaMicro ?? 0, faltaTemas: est?.faltaTemas ?? 0, faltaEtaMs: est?.faltaEtaMs ?? 0 });
  const salida = { mes, finMes: iso(finMes), topes, pronostico, profunda: { ...profunda, activa: pro.activa }, conflicto, maxGeneralMicro: LIMITES_IA.topeGeneralMaxMicro };
  if (corto) return salida;
  // Los alumnos: lo que les queda y hasta cuándo, y las opciones para darles (o quitarles) IA.
  const t = filasIaAlumnos(db, ahora);
  const pagos = leerConfigPagos(db);
  const porUso = Math.max(1, pagos.minutosPorUso);
  const costoUso = costoPorUso({ usdMicro: t.totales.usdMesMicro, usos: t.totales.usosMes });
  const plan0 = pagos.planes[0] ?? { usos: 300 };
  const netos = regaladoNetoDe(db);
  topes[4].topeMicro = t.filas.reduce((n, f) => n + (f.topeMicro ?? 0), 0);
  topes[4].pct = topes[4].topeMicro > 0 ? Math.min(999, Math.round((topes[4].usadoMicro * 100) / topes[4].topeMicro)) : null;
  const alumnos = t.filas.map(f => {
    const pl = pagos.modo === 'planes' ? leerPlan(db, f.id) : null;
    const rt = pl ? regaloVigente(db, f.id, pl) : null;
    const plan = f.plan && !f.plan.vencido ? f.plan : null;
    // La prueba solo se usa sin plan (el plan va primero): con plan no se cuenta.
    const prueba = !plan && f.prueba && !f.prueba.terminada ? f.prueba : null;
    const usosMinutos = Math.floor((f.minutos ?? 0) / porUso);
    const usosPlan = plan ? plan.quedan : 0;
    const usosPruebaHoy = prueba ? Math.max(0, prueba.porDia - prueba.hoy) : 0;
    // El tope de US$ de su cuenta también manda: con lo que le queda, ¿cuántos usos le alcanzan?
    const porDinero = f.topeMicro > 0 ? Math.max(0, Math.floor((f.topeMicro - f.usdMesMicro) / costoUso)) : 0;
    return {
      id: f.id, nombre: f.nombre, pausada: f.pausada, usosMes: f.usosMes, usdMesMicro: f.usdMesMicro, topeMicro: f.topeMicro,
      plan: plan ? { nombre: plan.nombre ?? plan.id, quedan: plan.quedan, usos: plan.usos, hasta: plan.hasta, regalo: pl?.regalo === true } : null,
      prueba: prueba ? { hoy: usosPruebaHoy, porDia: prueba.porDia, hasta: prueba.hasta } : null,
      usosRegalados: Math.floor((netos.get(f.id) ?? 0) / porUso), usosMinutos,
      quedan: usosPlan + usosMinutos + usosPruebaHoy, porDinero, limitaDinero: !f.pausada && f.topeMicro > 0 && porDinero < usosPlan + usosMinutos + usosPruebaHoy,
      hasta: plan?.hasta ?? prueba?.hasta ?? null,
      tiempoRegalado: rt ? { base: rt.base.hasta, hasta: pl.hasta, dias: Math.max(0, Math.round((Date.parse(pl.hasta) - Math.max(Date.parse(rt.base.hasta), ahora)) / DIA_MS)) } : null,
    };
  });
  return { ...salida, alumnos, costoUsoMicro: costoUso, modo: pagos.modo, opciones: opcionesRegalo({ modo: pagos.modo, planUsos: plan0.usos, planDias: pagos.planDias, costoUsoMicro: costoUso }), regaloMax: REGALO_MAX, diasMax: DIAS_REGALO_MAX };
}

// ---------- Darle más IA / Quitarle IA ----------
function alumnoDe(db, id) {
  const n = Number(id);
  const u = Number.isSafeInteger(n) ? db.prepare('SELECT id, rol FROM usuarios WHERE id = ?').get(n) : null;
  if (!u || u.rol === 'admin') throw new ErrorHttp(404, 'no_existe');
  return u.id;
}
const diasValidos = d => Number.isSafeInteger(d) && d >= 1 && d <= DIAS_REGALO_MAX;

// Quitar usos regalados: nunca más de lo regalado (lo pagado, la bienvenida y los ajustes no se tocan) ni más de lo que
// le queda (lo ya usado queda como está). usos: N, o 'todo'. → { quitados, derecho }
export function quitarUsos(db, id, usos, adminId, ahora = Date.now()) {
  const uid = alumnoDe(db, id);
  if (usos !== 'todo' && !(Number.isSafeInteger(usos) && usos >= 1 && usos <= REGALO_MAX)) throw new ErrorHttp(400, 'usos_no_validos');
  return enTransaccion(db, () => {
    const { minutos, porUso } = saldoIa(db, uid, ahora);
    const neto = Math.max(0, db.prepare("SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ? AND motivo IN ('regalo_usos', 'quitar_regalo')").get(uid).n);
    const quitable = Math.min(neto, minutos);
    const quitar = usos === 'todo' ? quitable : Math.min(quitable, usos * porUso);
    if (quitar <= 0) throw new ErrorHttp(409, 'nada_que_quitar');
    db.prepare("INSERT INTO academia_ia_minutos (usuario_id, minutos, motivo, referencia, tarea_id, hecho_por, creado_en) VALUES (?, ?, 'quitar_regalo', ?, NULL, ?, ?)")
      .run(uid, -quitar, `quitar:${Math.floor(quitar / porUso)}`, adminId, iso(ahora));
    auditar(db, { usuarioId: adminId, accion: 'ia_quitar_usos', detalle: `${uid}: ${Math.floor(quitar / porUso)}` });
    return { quitados: Math.floor(quitar / porUso), derecho: derechoIa(db, uid, ahora) };
  });
}

function guardarTiempo(db, uid, rec, plan, entrada, adminId, ahora) {
  guardarAjuste(db, `academia.ia.plan.${uid}`, JSON.stringify(plan));
  guardarAjuste(db, claveRegaloTiempo(uid), JSON.stringify({ ...rec, pago: plan.pago ?? null, desde: plan.desde, log: [...(rec.log ?? []), { ...entrada, por: adminId, en: iso(ahora) }].slice(-100) }));
  auditar(db, { usuarioId: adminId, accion: `ia_tiempo_${entrada.tipo}`, detalle: `${uid}: ${entrada.antes.hasta} → ${plan.hasta}` });
}

// +N días: con un plan vigente, su fecha de fin se corre N días y se le suman los usos que su plan da en ese tiempo; sin
// plan vigente, un plan de regalo (el primero de los planes, marcado «regalo») desde hoy. Solo con planes.
export function regalarTiempo(db, id, dias, adminId, ahora = Date.now()) {
  const uid = alumnoDe(db, id);
  if (!diasValidos(dias)) throw new ErrorHttp(400, 'dias_no_validos');
  const cfg = leerConfigPagos(db);
  if (cfg.modo !== 'planes') throw new ErrorHttp(409, 'solo_con_planes');
  return enTransaccion(db, () => {
    const pl = leerPlan(db, uid);
    const vigente = pl && Date.parse(pl.hasta) > ahora;
    const tipoPlan = (vigente && cfg.planes.find(x => x.id === pl.plan)) || cfg.planes[0] || { id: 'estandar', nombre: 'IA Estándar', usos: 300 };
    const extra = Math.max(1, Math.round((tipoPlan.usos * dias) / Math.max(1, cfg.planDias)));
    let rec;
    let nuevo;
    if (vigente) {
      rec = regaloVigente(db, uid, pl) ?? { base: pl.regalo ? { hasta: pl.desde, usos: 0 } : { hasta: pl.hasta, usos: pl.usos }, log: [] };
      nuevo = { ...pl, hasta: iso(Date.parse(pl.hasta) + dias * DIA_MS), usos: pl.usos + extra };
    } else {
      rec = { base: { hasta: iso(ahora), usos: 0 }, log: pl ? [{ tipo: 'plan_anterior', antes: pl, despues: null }] : [] };
      nuevo = { plan: tipoPlan.id, nombre: tipoPlan.nombre, usos: extra, desde: iso(ahora), hasta: iso(ahora + dias * DIA_MS), regalo: true, pago: null, por: adminId };
    }
    guardarTiempo(db, uid, rec, nuevo, { tipo: 'mas', dias, usos: extra, antes: { hasta: pl?.hasta ?? null, usos: pl?.usos ?? null } }, adminId, ahora);
    return derechoIa(db, uid, ahora);
  });
}

// −N días (o 'todo': hasta lo que trae su plan): la fecha de fin y los usos de su plan vuelven atrás, nunca antes de lo
// que el alumno pagó (la base). Lo ya usado no se toca.
export function quitarTiempo(db, id, dias, adminId, ahora = Date.now()) {
  const uid = alumnoDe(db, id);
  if (dias !== 'todo' && !diasValidos(dias)) throw new ErrorHttp(400, 'dias_no_validos');
  return enTransaccion(db, () => {
    const pl = leerPlan(db, uid);
    const rec = pl ? regaloVigente(db, uid, pl) : null;
    if (!rec || Date.parse(pl.hasta) <= Date.parse(rec.base.hasta)) throw new ErrorHttp(409, 'nada_que_quitar');
    const cfg = leerConfigPagos(db);
    const tipoPlan = cfg.planes.find(x => x.id === pl.plan) ?? { usos: pl.usos };
    const base = rec.base;
    const hasta = dias === 'todo' ? Date.parse(base.hasta) : Math.max(Date.parse(base.hasta), Date.parse(pl.hasta) - dias * DIA_MS);
    const menos = dias === 'todo' ? Infinity : Math.max(1, Math.round((tipoPlan.usos * dias) / Math.max(1, cfg.planDias)));
    const usos = Math.max(base.usos, pl.usos - menos);
    guardarTiempo(db, uid, rec, { ...pl, hasta: iso(hasta), usos }, { tipo: 'menos', dias, antes: { hasta: pl.hasta, usos: pl.usos } }, adminId, ahora);
    return derechoIa(db, uid, ahora);
  });
}

// Cambiar la fecha de fin del tiempo regalado (fecha 'AAAA-MM-DD', al final de ese día en RD): nunca antes de lo pagado.
export function cambiarFinRegalo(db, id, fecha, adminId, ahora = Date.now()) {
  const uid = alumnoDe(db, id);
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorHttp(400, 'fecha_no_valida');
  const hasta = Date.parse(`${fecha}T23:59:00-04:00`);
  if (!Number.isFinite(hasta) || hasta > ahora + FIN_REGALO_MAX_DIAS * DIA_MS) throw new ErrorHttp(400, 'fecha_no_valida');
  return enTransaccion(db, () => {
    const pl = leerPlan(db, uid);
    const rec = pl ? regaloVigente(db, uid, pl) : null;
    if (!rec) throw new ErrorHttp(409, 'sin_regalo_tiempo');
    const fin = Math.max(hasta, Date.parse(rec.base.hasta));
    guardarTiempo(db, uid, rec, { ...pl, hasta: iso(fin) }, { tipo: 'fecha', fecha, antes: { hasta: pl.hasta, usos: pl.usos } }, adminId, ahora);
    return derechoIa(db, uid, ahora);
  });
}

// Una opción de la pantalla → lo que hace. { accion: 'dar' | 'quitar', tipo: 'usos' | 'tiempo' | 'todo', usos?, dias? }
export function aplicarOpcion(db, id, datos, adminId, ahora = Date.now()) {
  const { accion, tipo } = datos ?? {};
  if (accion === 'dar' && tipo === 'usos') return { derecho: regalarUsos(db, id, datos.usos, adminId, ahora) };
  if (accion === 'dar' && tipo === 'tiempo') return { derecho: regalarTiempo(db, id, datos.dias, adminId, ahora) };
  if (accion === 'quitar' && tipo === 'usos') return quitarUsos(db, id, datos.usos, adminId, ahora);
  if (accion === 'quitar' && tipo === 'tiempo') return { derecho: quitarTiempo(db, id, datos.dias, adminId, ahora) };
  if (accion === 'quitar' && tipo === 'todo') {
    // Todo lo regalado: los usos y el tiempo (lo que haya de cada uno).
    let quitados = 0;
    let tiempo = false;
    try { quitados = quitarUsos(db, id, 'todo', adminId, ahora).quitados; } catch (e) { if (e?.clave !== 'nada_que_quitar') throw e; }
    try { quitarTiempo(db, id, 'todo', adminId, ahora); tiempo = true; } catch (e) { if (e?.clave !== 'nada_que_quitar') throw e; }
    if (!quitados && !tiempo) throw new ErrorHttp(409, 'nada_que_quitar');
    return { quitados, tiempo, derecho: derechoIa(db, alumnoDe(db, id), ahora) };
  }
  if (tipo === 'fecha') return { derecho: cambiarFinRegalo(db, id, datos.fecha, adminId, ahora) };
  throw new ErrorHttp(400, 'datos_no_validos');
}
