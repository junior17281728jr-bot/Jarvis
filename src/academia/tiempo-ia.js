// Academia 0.10.0: el «tiempo con IA» de cada alumno y los pagos por transferencia para pedir más.
//  - Un «minuto de instructor IA» = UN uso de la IA del instructor (una explicación de otra forma, una duda o un
//    consejo): lo que se tarda en leer lo que escribe. El dueño puede cambiar cuántos minutos cuesta un uso.
//  - Cada alumno empieza con un regalo (20 minutos por defecto, lo pone el administrador). El saldo es la suma de su
//    libro (academia_ia_minutos) y nunca baja de 0: sin minutos no se pide nada a la IA (aunque haya clave) y el alumno
//    sigue con el instructor básico, gratis.
//  - Un uso se cobra al pedirlo; si la IA no respondió (error, tope, una respuesta que no sirvió), se devuelve solo.
//    Volver a abrir lo mismo (la misma explicación) no se cobra otra vez.
//  - Pagos: el alumno ve los datos de transferencia que el administrador puso (solo en la base; nunca en el
//    repositorio), elige un paquete, sube la foto del comprobante (jpg, png o webp, hasta 5 MB; se revisa que de verdad
//    sea una imagen) y queda «En revisión». El administrador lo aprueba (suma los minutos, una sola vez) o lo rechaza
//    con un motivo que el alumno ve. La imagen vive en la carpeta de datos (academia/pagos/) y solo la ven el
//    administrador y ese alumno. Nada se borra.
//  - 0.12.7 (pedido del dueño): la IA va por PLAN (modo 'planes', el de siempre desde ahora; 'minutos' es lo de antes):
//      · PRUEBA GRATIS de 5 días desde su PRIMER uso de la IA (no desde que se creó la cuenta: así nadie la pierde sin
//        verla), con un tope de usos por día (20) que cuida el presupuesto. Es para quien nunca pagó IA (un comprobante
//        aprobado); el administrador puede darla otra vez.
//      · Después, sin plan: lo básico (sin errores, como en la 0.12.4). Dos planes de 30 días desde que se aprueba el
//        comprobante: «IA Estándar» (US$12, 300 usos) e «IA Plus» (US$20, 800 usos); nombres, precios, usos y el precio
//        en RD$ (opcional) los cambia el administrador. Si se le acaban los usos antes, puede pasar a Plus pagando la
//        diferencia (sigue la misma fecha de vencimiento). Tres días antes de vencer, la app lo recuerda.
//      · Los minutos que alguien ya tenía (regalo, pagados o puestos por el administrador) se siguen usando hasta que se
//        acaben: se gasta primero el plan, después la prueba, después esos minutos. Nada se borra; lo nuevo va en el
//        mismo libro (motivos 'uso_plan', 'uso_prueba' y sus devoluciones) y en «ajustes».
//      · Con planes, una cuenta nueva ya no recibe los 20 minutos de regalo (si no, la IA seguiría después de la prueba).
//      · Lo de siempre sigue mandando: sin la IA encendida, su tope de plan, «Permitir IA» y su permiso, no hay IA
//        aunque tenga prueba o plan.
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorHttp } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { leerAjuste, guardarAjuste, carpetaAcademia } from './paquetes.js';
import { leerGuardado } from './instructor-ia.js';

export const CLAVE_PAGOS = 'academia.pagos.config';
export const RECIBO_MAX_BYTES = 5 * 1024 * 1024;
export const PAGOS_EN_REVISION_MAX = 3;
const TEXTO_CORTO = 120;
const TEXTO_LARGO = 1000;
export const ESPERA_POR_DEFECTO = 'En revisión — la verificación puede tardar hasta 24 horas.';

// 0.12.7: los planes de IA por defecto (el administrador los cambia en Pagos).
export const PLANES_IA = Object.freeze([
  Object.freeze({ id: 'estandar', nombre: 'IA Estándar', precioUsd: '12', usos: 300 }),
  Object.freeze({ id: 'plus', nombre: 'IA Plus', precioUsd: '20', usos: 800 }),
]);
export const CONFIG_PAGOS = Object.freeze({
  minutosRegalo: 20, minutosPorUso: 1,
  modo: 'planes', pruebaDias: 5, pruebaUsosDia: 20, planDias: 30, avisoRenovarDias: 3, tasaRd: '', planes: PLANES_IA,
  // 0.12.3 (auditoría P2-2): sin banco por defecto (ni el nombre de ninguno); vacío queda vacío.
  banco: '', tipoCuenta: '', numero: '', titular: '', documento: '', instrucciones: '', espera: ESPERA_POR_DEFECTO,
  paquetes: Object.freeze([]),
});
const texto = (v, max, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : d);
const entero = (v, min, max, d) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : d);
const ID_PAQUETE = /^[a-z0-9_-]{1,20}$/;
const PRECIO_USD = /^\d{1,4}(?:\.\d{1,2})?$/;
function normalizarPlanes(lista) {
  const d = Object.fromEntries(PLANES_IA.map(p => [p.id, p]));
  const dados = Array.isArray(lista) ? lista : [];
  return PLANES_IA.map(base => {
    const x = dados.find(p => p?.id === base.id) ?? {};
    return { id: base.id, nombre: texto(x.nombre, 40) || d[base.id].nombre, precioUsd: PRECIO_USD.test(String(x.precioUsd ?? '')) ? String(x.precioUsd) : d[base.id].precioUsd, usos: entero(x.usos, 1, 100_000, d[base.id].usos) };
  });
}

function normalizarPagos(v) {
  const d = CONFIG_PAGOS;
  const x = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const paquetes = (Array.isArray(x.paquetes) ? x.paquetes : []).slice(0, 8)
    .map(p => ({ id: texto(p?.id, 20), minutos: entero(p?.minutos, 1, 100_000, 0), precio: texto(p?.precio, 40) }))
    .filter(p => ID_PAQUETE.test(p.id) && p.minutos > 0 && p.precio);
  return {
    minutosRegalo: entero(x.minutosRegalo, 0, 100_000, d.minutosRegalo), minutosPorUso: entero(x.minutosPorUso, 1, 60, d.minutosPorUso),
    banco: texto(x.banco, TEXTO_CORTO, d.banco), tipoCuenta: texto(x.tipoCuenta, TEXTO_CORTO), numero: texto(x.numero, 60), titular: texto(x.titular, TEXTO_CORTO),
    documento: texto(x.documento, 40), instrucciones: texto(x.instrucciones, TEXTO_LARGO), espera: texto(x.espera, 300) || d.espera,
    paquetes: [...new Map(paquetes.map(p => [p.id, p])).values()],
    modo: x.modo === 'minutos' ? 'minutos' : 'planes',
    pruebaDias: entero(x.pruebaDias, 0, 60, d.pruebaDias), pruebaUsosDia: entero(x.pruebaUsosDia, 1, 1000, d.pruebaUsosDia),
    planDias: entero(x.planDias, 1, 366, d.planDias), avisoRenovarDias: entero(x.avisoRenovarDias, 0, 30, d.avisoRenovarDias),
    tasaRd: /^\d{1,4}(?:\.\d{1,2})?$/.test(String(x.tasaRd ?? '')) ? String(x.tasaRd) : '',
    planes: normalizarPlanes(x.planes),
  };
}
export function leerConfigPagos(db) {
  try { return normalizarPagos(JSON.parse(leerAjuste(db, CLAVE_PAGOS) ?? 'null')); } catch { return normalizarPagos(null); }
}
// Solo el administrador (src/api/pagos.js). Un campo que no se manda queda como estaba.
// Revisa lo que llegó sin guardar nada (lanza ErrorHttp). 0.12.3: un paquete malo (por ejemplo la línea «350», sin
// precio) dice CUÁL: 400 paquete_linea_no_valida { linea: n.º del paquete, desde 1 }; más de 8: paquetes_demasiados.
export function revisarConfigPagos(cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new ErrorHttp(400, 'datos_no_validos');
  const campos = ['minutosRegalo', 'minutosPorUso', 'banco', 'tipoCuenta', 'numero', 'titular', 'documento', 'instrucciones', 'espera', 'paquetes',
    'modo', 'pruebaDias', 'pruebaUsosDia', 'planDias', 'avisoRenovarDias', 'tasaRd', 'planes'];
  if (Object.keys(cambios).some(k => !campos.includes(k))) throw new ErrorHttp(400, 'datos_no_validos');
  if ('minutosRegalo' in cambios && entero(cambios.minutosRegalo, 0, 100_000, null) == null) throw new ErrorHttp(400, 'datos_no_validos');
  if ('minutosPorUso' in cambios && entero(cambios.minutosPorUso, 1, 60, null) == null) throw new ErrorHttp(400, 'datos_no_validos');
  if ('modo' in cambios && !['planes', 'minutos'].includes(cambios.modo)) throw new ErrorHttp(400, 'datos_no_validos');
  for (const [k, min, max] of [['pruebaDias', 0, 60], ['pruebaUsosDia', 1, 1000], ['planDias', 1, 366], ['avisoRenovarDias', 0, 30]]) {
    if (k in cambios && entero(cambios[k], min, max, null) == null) throw new ErrorHttp(400, 'datos_no_validos');
  }
  if ('tasaRd' in cambios && cambios.tasaRd !== '' && !/^\d{1,4}(?:\.\d{1,2})?$/.test(String(cambios.tasaRd))) throw new ErrorHttp(400, 'datos_no_validos');
  if ('planes' in cambios) {
    if (!Array.isArray(cambios.planes) || cambios.planes.some(p => !PLANES_IA.some(b => b.id === p?.id) || !texto(p?.nombre, 40)
      || !PRECIO_USD.test(String(p?.precioUsd ?? '')) || entero(p?.usos, 1, 100_000, null) == null)) throw new ErrorHttp(400, 'plan_no_valido');
  }
  if ('paquetes' in cambios) {
    if (!Array.isArray(cambios.paquetes)) throw new ErrorHttp(400, 'paquete_pago_no_valido');
    if (cambios.paquetes.length > 8) throw new ErrorHttp(400, 'paquetes_demasiados');
    const malo = cambios.paquetes.findIndex(p => !ID_PAQUETE.test(String(p?.id ?? '')) || entero(p?.minutos, 1, 100_000, null) == null || !texto(p?.precio, 40));
    if (malo >= 0) throw new ErrorHttp(400, 'paquete_linea_no_valida', { linea: malo + 1 });
  }
}
export function guardarConfigPagos(db, cambios) {
  revisarConfigPagos(cambios);
  const nueva = normalizarPagos({ ...leerConfigPagos(db), ...cambios });
  guardarAjuste(db, CLAVE_PAGOS, JSON.stringify(nueva));
  return nueva;
}
// Lo que ve un alumno para pagar (solo lectura): los datos de la cuenta, los paquetes y qué esperar.
export function datosParaPagar(cfg) {
  const conPlanes = cfg.modo === 'planes';
  return {
    banco: cfg.banco, tipoCuenta: cfg.tipoCuenta, numero: cfg.numero, titular: cfg.titular, documento: cfg.documento, instrucciones: cfg.instrucciones, espera: cfg.espera,
    // 0.12.7: con planes, lo que se vende son los planes (los paquetes de minutos quedan para el modo de antes).
    paquetes: conPlanes ? [] : cfg.paquetes, modo: cfg.modo, planes: conPlanes ? cfg.planes.map(p => ({ ...p, precioRd: precioRd(cfg, p.precioUsd) })) : [],
    planDias: cfg.planDias, pruebaDias: cfg.pruebaDias, pruebaUsosDia: cfg.pruebaUsosDia,
    listo: Boolean(cfg.numero && cfg.titular && (conPlanes || cfg.paquetes.length)),
  };
}
// El precio en RD$ (si el administrador puso la tasa), redondeado al peso: «720».
function precioRd(cfg, usd) {
  const tasa = Number(cfg.tasaRd);
  return tasa > 0 ? String(Math.round(Number(usd) * tasa)) : null;
}

// ---------- El saldo ----------
const iso = ms => new Date(ms).toISOString();
function anotar(db, { usuarioId, minutos, motivo, referencia = null, tareaId = null, hechoPor = null, ahora = Date.now() }) {
  db.prepare('INSERT INTO academia_ia_minutos (usuario_id, minutos, motivo, referencia, tarea_id, hecho_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(usuarioId, minutos, motivo, referencia, tareaId, hechoPor, iso(ahora));
}
// 0.12.7: los usos del plan y de la prueba van en el mismo libro con sus motivos, pero NO son minutos: no cuentan en el saldo.
const FAMILIAS = Object.freeze({ minutos: ['uso', 'devolucion'], plan: ['uso_plan', 'devolucion_plan'], prueba: ['uso_prueba', 'devolucion_prueba'] });
const NO_MINUTOS = "('uso_plan', 'devolucion_plan', 'uso_prueba', 'devolucion_prueba')";
const TODOS_LOS_USOS = "('uso', 'devolucion', 'uso_plan', 'devolucion_plan', 'uso_prueba', 'devolucion_prueba')";
const sumaDe = (db, usuarioId) => db.prepare(`SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ? AND motivo NOT IN ${NO_MINUTOS}`).get(usuarioId).n;

// Devuelve los usos que la IA no llegó a responder (la tarea terminó sin nada guardado). Una sola vez cada uno.
function devolverSinRespuesta(db, usuarioId, ahora) {
  for (const [uso, devolucion] of Object.values(FAMILIAS)) devolverFamilia(db, usuarioId, ahora, uso, devolucion);
}
function devolverFamilia(db, usuarioId, ahora, motivoUso, motivoDevolucion) {
  const usos = db.prepare(`SELECT u.referencia, u.tarea_id, -SUM(u.minutos) AS debe FROM academia_ia_minutos u
    WHERE u.usuario_id = ? AND u.tarea_id IS NOT NULL AND u.motivo IN (?, ?) GROUP BY u.tarea_id HAVING SUM(u.minutos) < 0`).all(usuarioId, motivoUso, motivoDevolucion);
  for (const u of usos) {
    const t = db.prepare('SELECT estado, datos FROM tareas WHERE id = ?').get(u.tarea_id);
    if (!t || ['lista', 'en_curso'].includes(t.estado)) continue;
    let clave = null;
    try { clave = JSON.parse(t.datos)?.clave ?? null; } catch { clave = null; }
    if (t.estado === 'hecha' && leerGuardado(db, clave)) continue;
    anotar(db, { usuarioId, minutos: u.debe, motivo: motivoDevolucion, referencia: u.referencia, tareaId: u.tarea_id, ahora });
  }
}

// El saldo de un alumno (con su regalo la primera vez y lo devuelto). { minutos, porUso, regalo }.
export function saldoIa(db, usuarioId, ahora = Date.now()) {
  const cfg = leerConfigPagos(db);
  return enTransaccion(db, () => {
    // 0.12.7: con planes, una cuenta nueva ya no recibe minutos de regalo (tiene la prueba gratis); lo ya dado sigue.
    const regalo = db.prepare("SELECT 1 FROM academia_ia_minutos WHERE usuario_id = ? AND motivo = 'regalo' LIMIT 1").get(usuarioId);
    if (!regalo && cfg.modo !== 'planes') anotar(db, { usuarioId, minutos: cfg.minutosRegalo, motivo: 'regalo', ahora });
    devolverSinRespuesta(db, usuarioId, ahora);
    return { minutos: Math.max(0, sumaDe(db, usuarioId)), porUso: cfg.minutosPorUso };
  });
}

// ¿Ya pagó esto (la misma explicación, la misma duda)? Entonces verlo otra vez no se cobra.
export function yaPagado(db, usuarioId, referencia) {
  return db.prepare(`SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ? AND referencia = ? AND motivo IN ${TODOS_LOS_USOS}`).get(usuarioId, referencia).n < 0;
}

// ---------- 0.12.7: la prueba gratis y los planes ----------
const DIA_MS = 86_400_000;
const clavePlan = id => `academia.ia.plan.${Number(id)}`;
const clavePrueba = id => `academia.ia.prueba.${Number(id)}`;
const jsonDe = texto => { try { const v = JSON.parse(texto ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } };
const inicioDiaRd = ms => Date.parse(`${new Date(ms - 4 * 3_600_000).toISOString().slice(0, 10)}T04:00:00Z`);
// Cuántos usos de esa familia ('plan' | 'prueba') desde «desde» (lo devuelto ya está restado).
function usosDesde(db, usuarioId, familia, desdeMs) {
  const [uso, devolucion] = FAMILIAS[familia];
  return -db.prepare('SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ? AND motivo IN (?, ?) AND creado_en >= ?').get(usuarioId, uso, devolucion, iso(desdeMs)).n;
}
export const leerPlan = (db, usuarioId) => jsonDe(leerAjuste(db, clavePlan(usuarioId)));
export const leerPrueba = (db, usuarioId) => jsonDe(leerAjuste(db, clavePrueba(usuarioId)));
// ¿Ya pagó IA alguna vez (un comprobante aprobado)? Entonces la prueba gratis no le toca (salvo que el administrador la dé).
const pagoAntes = (db, usuarioId) => Boolean(db.prepare("SELECT 1 FROM academia_pagos WHERE usuario_id = ? AND estado = 'aprobado' LIMIT 1").get(usuarioId));

// El derecho de un alumno a la IA AHORA. → { fuente: 'plan' | 'prueba' | 'minutos' | null, motivo (si null:
// 'prueba_terminada' | 'limite_diario' | 'sin_usos_plan' | 'sin_plan'), plan, prueba, minutos, porUso }.
export function derechoIa(db, usuarioId, ahora = Date.now()) {
  const cfg = leerConfigPagos(db);
  const { minutos, porUso } = saldoIa(db, usuarioId, ahora);
  if (cfg.modo !== 'planes') return { modo: 'minutos', fuente: minutos >= porUso ? 'minutos' : null, motivo: minutos >= porUso ? null : 'sin_minutos', plan: null, prueba: null, minutos, porUso };
  const pl = leerPlan(db, usuarioId);
  let plan = null;
  if (pl && Date.parse(pl.hasta) > ahora) {
    const usados = usosDesde(db, usuarioId, 'plan', Date.parse(pl.desde));
    plan = { id: pl.plan, nombre: pl.nombre, usos: pl.usos, usados, quedan: Math.max(0, pl.usos - usados), desde: pl.desde, hasta: pl.hasta,
      dias: Math.max(0, Math.ceil((Date.parse(pl.hasta) - ahora) / DIA_MS)), renovar: Date.parse(pl.hasta) - ahora <= cfg.avisoRenovarDias * DIA_MS };
  } else if (pl) plan = { id: pl.plan, nombre: pl.nombre, vencido: true, hasta: pl.hasta };
  const pr = leerPrueba(db, usuarioId);
  const elegible = pr?.dada === true || !pagoAntes(db, usuarioId);
  let prueba = null;
  if (elegible && cfg.pruebaDias > 0) {
    const desde = pr?.desde ? Date.parse(pr.desde) : null;
    const hasta = desde != null ? desde + cfg.pruebaDias * DIA_MS : null;
    const hoy = usosDesde(db, usuarioId, 'prueba', Math.max(inicioDiaRd(ahora), desde ?? 0));
    prueba = { empezada: desde != null, desde: pr?.desde ?? null, hasta: hasta != null ? iso(hasta) : null, dias: cfg.pruebaDias,
      quedanDias: hasta != null ? Math.max(0, Math.ceil((hasta - ahora) / DIA_MS)) : cfg.pruebaDias, terminada: hasta != null && hasta <= ahora,
      hoy, porDia: cfg.pruebaUsosDia };
  }
  const base = { modo: 'planes', plan, prueba, minutos, porUso };
  if (plan && !plan.vencido && plan.quedan > 0) return { ...base, fuente: 'plan', motivo: null };
  if (prueba && !prueba.terminada && prueba.hoy < prueba.porDia) return { ...base, fuente: 'prueba', motivo: null };
  if (minutos >= porUso) return { ...base, fuente: 'minutos', motivo: null };
  const motivo = plan && !plan.vencido ? 'sin_usos_plan' : prueba && !prueba.terminada ? 'limite_diario' : prueba?.terminada ? 'prueba_terminada' : 'sin_plan';
  return { ...base, fuente: null, motivo };
}

// Cobra un uso, o lanza 'sin_minutos' (nunca deja el saldo en menos de 0). Dentro de la escritura de quien llama.
// 0.12.7: con planes, primero el plan, después la prueba (su primer uso la empieza), después los minutos de antes.
export function cobrarUso(db, usuarioId, { referencia, tareaId = null, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const d = derechoIa(db, usuarioId, ahora);
    if (!d.fuente) throw new ErrorHttp(409, 'sin_minutos');
    if (d.fuente === 'minutos') {
      anotar(db, { usuarioId, minutos: -d.porUso, motivo: 'uso', referencia, tareaId, ahora });
      return d.minutos - d.porUso;
    }
    if (d.fuente === 'prueba' && !d.prueba.empezada) {
      guardarAjuste(db, clavePrueba(usuarioId), JSON.stringify({ ...(leerPrueba(db, usuarioId) ?? {}), desde: iso(ahora) }));
    }
    anotar(db, { usuarioId, minutos: -1, motivo: FAMILIAS[d.fuente][0], referencia, tareaId, ahora });
    return d.fuente === 'plan' ? d.plan.quedan - 1 : d.prueba.porDia - d.prueba.hoy - 1;
  });
}
export function ponerTareaAlUso(db, usuarioId, referencia, tareaId) {
  db.prepare(`UPDATE academia_ia_minutos SET tarea_id = ? WHERE id = (SELECT MAX(id) FROM academia_ia_minutos WHERE usuario_id = ? AND referencia = ? AND motivo IN ('uso', 'uso_plan', 'uso_prueba'))`).run(tareaId, usuarioId, referencia);
}
// El administrador le da la prueba gratis otra vez (empieza en su próximo uso). Queda en «ajustes» (nada se borra).
export function darPruebaOtraVez(db, usuarioId, adminId, ahora = Date.now()) {
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(usuarioId)) throw new ErrorHttp(404, 'no_existe');
  guardarAjuste(db, clavePrueba(usuarioId), JSON.stringify({ dada: true, desde: null, por: adminId, en: iso(ahora) }));
  return derechoIa(db, usuarioId, ahora);
}

// El administrador deja el saldo de un alumno en «minutos» (una fila de ajuste con la diferencia).
export function ajustarSaldo(db, usuarioId, minutos, adminId, ahora = Date.now()) {
  if (!Number.isSafeInteger(minutos) || minutos < 0 || minutos > 1_000_000) throw new ErrorHttp(400, 'datos_no_validos');
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(usuarioId)) throw new ErrorHttp(404, 'no_existe');
  return enTransaccion(db, () => {
    const actual = saldoIa(db, usuarioId, ahora).minutos;
    const real = sumaDe(db, usuarioId);
    if (minutos !== actual || real < 0) anotar(db, { usuarioId, minutos: minutos - real, motivo: 'ajuste', hechoPor: adminId, ahora });
    return saldoIa(db, usuarioId, ahora);
  });
}
export function movimientos(db, usuarioId, limite = 30) {
  return db.prepare('SELECT minutos, motivo, creado_en AS fecha FROM academia_ia_minutos WHERE usuario_id = ? ORDER BY id DESC LIMIT ?').all(usuarioId, limite);
}

// ---------- Los comprobantes ----------
const TIPOS_RECIBO = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
export const carpetaPagos = config => join(carpetaAcademia(config), 'pagos');
function esImagen(cabeza, tipo) {
  if (tipo === 'image/png') return cabeza.length >= 8 && cabeza.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (tipo === 'image/jpeg') return cabeza.length >= 3 && cabeza[0] === 0xff && cabeza[1] === 0xd8 && cabeza[2] === 0xff;
  if (tipo === 'image/webp') return cabeza.length >= 12 && cabeza.toString('latin1', 0, 4) === 'RIFF' && cabeza.toString('latin1', 8, 12) === 'WEBP';
  return false;
}

// 0.12.7: lo que se paga: un paquete de minutos (modo de antes), un plan ('plan:estandar', 'plan:plus') o pasar a Plus
// pagando la diferencia ('plan:plus:mejora', solo con un plan Estándar vigente). → { id, minutos (usos), precio } o null.
function elegirLoQuePaga(db, cfg, usuarioId, paquete, ahora) {
  if (cfg.modo !== 'planes') return cfg.paquetes.find(x => x.id === paquete) ?? null;
  const m = /^plan:([a-z]+)(:mejora)?$/.exec(String(paquete));
  const plan = m ? cfg.planes.find(x => x.id === m[1]) : null;
  if (!plan) return null;
  if (!m[2]) return { id: `plan:${plan.id}`, minutos: plan.usos, precio: `US$${plan.precioUsd}` };
  const d = derechoIa(db, usuarioId, ahora);
  const actual = d.plan && !d.plan.vencido ? cfg.planes.find(x => x.id === d.plan.id) : null;
  if (plan.id !== 'plus' || !actual || actual.id === 'plus') return null;
  const dif = Math.max(0, Math.round((Number(plan.precioUsd) - Number(actual.precioUsd)) * 100) / 100);
  return { id: `plan:${plan.id}:mejora`, minutos: plan.usos, precio: `US$${dif}` };
}

// Sube un comprobante: el cuerpo del pedido es la imagen tal cual. → la fila nueva (vista del alumno).
export async function subirRecibo(db, config, { usuarioId, req, paquete, nota = '', ahora = Date.now() }) {
  const tipo = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  const ext = TIPOS_RECIBO[tipo];
  if (!ext) throw new ErrorHttp(415, 'imagen_no_valida');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > RECIBO_MAX_BYTES) throw new ErrorHttp(413, 'demasiado_grande');
  const cfg = leerConfigPagos(db);
  const p = elegirLoQuePaga(db, cfg, usuarioId, paquete, ahora);
  if (!p) throw new ErrorHttp(400, 'paquete_pago_no_valido');
  const pendientes = db.prepare("SELECT COUNT(*) AS n FROM academia_pagos WHERE usuario_id = ? AND estado = 'revision'").get(usuarioId).n;
  if (pendientes >= PAGOS_EN_REVISION_MAX) throw new ErrorHttp(409, 'muchos_en_revision');
  // En memoria (5 MB como mucho) y revisada por dentro (los primeros bytes, nunca el nombre) ANTES de escribir nada:
  // una que no sirve nunca llega al disco.
  const partes = [];
  let bytes = 0;
  try {
    for await (const trozo of req) {
      bytes += trozo.length;
      if (bytes > RECIBO_MAX_BYTES) throw new ErrorHttp(413, 'demasiado_grande');
      partes.push(trozo);
    }
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    throw new ErrorHttp(400, 'imagen_no_valida');
  }
  const contenido = Buffer.concat(partes);
  if (!bytes || !esImagen(contenido.subarray(0, 16), tipo)) throw new ErrorHttp(400, 'imagen_no_valida');
  const carpeta = carpetaPagos(config);
  mkdirSync(carpeta, { recursive: true });
  const archivo = `${usuarioId}-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  writeFileSync(join(carpeta, archivo), contenido, { flag: 'wx', mode: 0o640 });
  const r = db.prepare(`INSERT INTO academia_pagos (usuario_id, paquete, minutos, precio, archivo, tipo, bytes, nota, estado, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'revision', ?)`).run(usuarioId, p.id, p.minutos, p.precio, archivo, tipo, bytes, texto(nota, 300) || null, iso(ahora));
  return vistaPago(db.prepare('SELECT * FROM academia_pagos WHERE id = ?').get(Number(r.lastInsertRowid)));
}

export const vistaPago = f => ({
  id: f.id, paquete: f.paquete, minutos: f.minutos, precio: f.precio, nota: f.nota, estado: f.estado, motivo: f.motivo,
  fecha: f.creado_en, revisadoEn: f.revisado_en, visto: f.visto_en != null, bytes: f.bytes,
});
export function pagosDe(db, usuarioId) {
  return db.prepare('SELECT * FROM academia_pagos WHERE usuario_id = ? ORDER BY id DESC LIMIT 50').all(usuarioId).map(vistaPago);
}
// La imagen de un comprobante: solo del alumno que lo subió, o para el administrador.
export function rutaRecibo(db, config, { id, usuarioId = null, admin = false }) {
  const n = Number(id);
  const f = Number.isSafeInteger(n) ? db.prepare('SELECT * FROM academia_pagos WHERE id = ?').get(n) : null;
  if (!f || (!admin && f.usuario_id !== usuarioId)) throw new ErrorHttp(404, 'no_existe');
  if (!/^[0-9]+-[0-9]+-[a-f0-9]{12}\.(?:jpg|png|webp)$/.test(f.archivo)) throw new ErrorHttp(404, 'no_existe');
  const ruta = join(carpetaPagos(config), f.archivo);
  if (!existsSync(ruta)) throw new ErrorHttp(404, 'no_existe');
  return { ruta, tipo: f.tipo, bytes: statSync(ruta).size };
}
// Los resueltos que el alumno todavía no vio (aprobado o rechazado): su aviso. Marcarlos vistos.
export function novedadesPagos(db, usuarioId) {
  return db.prepare("SELECT * FROM academia_pagos WHERE usuario_id = ? AND estado <> 'revision' AND visto_en IS NULL ORDER BY id").all(usuarioId).map(vistaPago);
}
export function marcarPagosVistos(db, usuarioId, ahora = Date.now()) {
  db.prepare("UPDATE academia_pagos SET visto_en = ? WHERE usuario_id = ? AND estado <> 'revision' AND visto_en IS NULL").run(iso(ahora), usuarioId);
}

// ---------- El administrador ----------
export function pagosParaRevisar(db) {
  return db.prepare(`SELECT p.*, u.nombre, u.nombre_visible FROM academia_pagos p JOIN usuarios u ON u.id = p.usuario_id
    ORDER BY CASE p.estado WHEN 'revision' THEN 0 ELSE 1 END, p.id DESC LIMIT 200`).all()
    .map(f => ({ ...vistaPago(f), alumno: { id: f.usuario_id, nombre: f.nombre_visible || f.nombre }, imagen: !String(f.archivo).startsWith('borrado-') }));
}
// 0.12.3: todos los comprobantes, de siempre (se guardan para siempre), los más nuevos primero, de a 100.
// imagen: si el archivo está en el servidor (los de antes de la 0.12.3 pudieron borrarse a los 30 días: «borrado-…»).
export function todosLosPagos(db, config, { antes = null, limite = 100 } = {}) {
  const filas = db.prepare(`SELECT p.*, u.nombre, u.nombre_visible FROM academia_pagos p JOIN usuarios u ON u.id = p.usuario_id
    WHERE (? IS NULL OR p.id < ?) ORDER BY p.id DESC LIMIT ?`).all(antes, antes, limite + 1);
  const pagos = filas.slice(0, limite).map(f => ({
    ...vistaPago(f), alumno: { id: f.usuario_id, nombre: f.nombre_visible || f.nombre },
    imagen: Boolean(config) && /^[0-9]+-[0-9]+-[a-f0-9]{12}\.(?:jpg|png|webp)$/.test(f.archivo) && existsSync(join(carpetaPagos(config), f.archivo)),
  }));
  return { pagos, total: db.prepare('SELECT COUNT(*) AS n FROM academia_pagos').get().n, siguiente: filas.length > limite ? pagos.at(-1).id : null };
}
// El nombre con que se baja un comprobante: «comprobante-12-juan.perez-2026-11-12.jpg» (solo letras simples).
export function nombreParaBajar(db, id) {
  const f = db.prepare('SELECT p.id, p.creado_en, p.tipo, u.nombre FROM academia_pagos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?').get(Number(id));
  if (!f) return null;
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[f.tipo] ?? 'jpg';
  return `comprobante-${f.id}-${String(f.nombre).replace(/[^a-z0-9._-]/gi, '_').slice(0, 40)}-${String(f.creado_en).slice(0, 10)}.${ext}`;
}
export const pagosPendientes = db => db.prepare("SELECT COUNT(*) AS n FROM academia_pagos WHERE estado = 'revision'").get().n;

// 0.12.7: aprobar un plan lo deja vigente 30 días desde HOY (o, al pasar a Plus, hasta la misma fecha que tenía, con los
// usos de Plus contados desde el principio de ese plan).
function activarPlan(db, f, adminId, ahora) {
  const cfg = leerConfigPagos(db);
  const m = /^plan:([a-z]+)(:mejora)?$/.exec(f.paquete);
  const plan = cfg.planes.find(x => x.id === m?.[1]) ?? { id: m?.[1] ?? 'estandar', nombre: m?.[1] ?? '', usos: f.minutos };
  const antes = leerPlan(db, f.usuario_id);
  const sigue = m?.[2] && antes && Date.parse(antes.hasta) > ahora;
  const valor = sigue ? { ...antes, plan: plan.id, nombre: plan.nombre, usos: f.minutos, pago: f.id, mejoraEn: iso(ahora) }
    : { plan: plan.id, nombre: plan.nombre, usos: f.minutos, desde: iso(ahora), hasta: iso(ahora + cfg.planDias * DIA_MS), pago: f.id, por: adminId };
  guardarAjuste(db, clavePlan(f.usuario_id), JSON.stringify(valor));
}

// Aprobar suma los minutos del paquete UNA sola vez (solo si sigue «en revisión»).
export function resolverPago(db, { id, adminId, aprobar, motivo = '', ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const n = Number(id);
    const f = Number.isSafeInteger(n) ? db.prepare('SELECT * FROM academia_pagos WHERE id = ?').get(n) : null;
    if (!f) throw new ErrorHttp(404, 'no_existe');
    if (f.estado !== 'revision') throw new ErrorHttp(409, 'pago_ya_revisado');
    const razon = texto(motivo, 300);
    if (!aprobar && !razon) throw new ErrorHttp(400, 'falta_motivo');
    db.prepare('UPDATE academia_pagos SET estado = ?, motivo = ?, revisado_por = ?, revisado_en = ? WHERE id = ?')
      .run(aprobar ? 'aprobado' : 'rechazado', aprobar ? null : razon, adminId, iso(ahora), f.id);
    if (aprobar && String(f.paquete).startsWith('plan:')) activarPlan(db, f, adminId, ahora);
    else if (aprobar) {
      saldoIa(db, f.usuario_id, ahora); // que tenga su regalo antes de sumar
      anotar(db, { usuarioId: f.usuario_id, minutos: f.minutos, motivo: 'pago', referencia: `pago:${f.id}`, hechoPor: adminId, ahora });
    }
    return vistaPago(db.prepare('SELECT * FROM academia_pagos WHERE id = ?').get(f.id));
  });
}
