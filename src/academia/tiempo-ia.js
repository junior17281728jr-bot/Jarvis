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
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
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

export const CONFIG_PAGOS = Object.freeze({
  minutosRegalo: 20, minutosPorUso: 1,
  banco: 'Banco Popular', tipoCuenta: '', numero: '', titular: '', documento: '', instrucciones: '', espera: ESPERA_POR_DEFECTO,
  paquetes: Object.freeze([]),
});
const texto = (v, max, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : d);
const entero = (v, min, max, d) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : d);
const ID_PAQUETE = /^[a-z0-9_-]{1,20}$/;

function normalizarPagos(v) {
  const d = CONFIG_PAGOS;
  const x = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const paquetes = (Array.isArray(x.paquetes) ? x.paquetes : []).slice(0, 8)
    .map(p => ({ id: texto(p?.id, 20), minutos: entero(p?.minutos, 1, 100_000, 0), precio: texto(p?.precio, 40) }))
    .filter(p => ID_PAQUETE.test(p.id) && p.minutos > 0 && p.precio);
  return {
    minutosRegalo: entero(x.minutosRegalo, 0, 100_000, d.minutosRegalo), minutosPorUso: entero(x.minutosPorUso, 1, 60, d.minutosPorUso),
    banco: texto(x.banco, TEXTO_CORTO, d.banco) || d.banco, tipoCuenta: texto(x.tipoCuenta, TEXTO_CORTO), numero: texto(x.numero, 60), titular: texto(x.titular, TEXTO_CORTO),
    documento: texto(x.documento, 40), instrucciones: texto(x.instrucciones, TEXTO_LARGO), espera: texto(x.espera, 300) || d.espera,
    paquetes: [...new Map(paquetes.map(p => [p.id, p])).values()],
  };
}
export function leerConfigPagos(db) {
  try { return normalizarPagos(JSON.parse(leerAjuste(db, CLAVE_PAGOS) ?? 'null')); } catch { return normalizarPagos(null); }
}
// Solo el administrador (src/api/pagos.js). Un campo que no se manda queda como estaba.
export function guardarConfigPagos(db, cambios) {
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) throw new ErrorHttp(400, 'datos_no_validos');
  const campos = ['minutosRegalo', 'minutosPorUso', 'banco', 'tipoCuenta', 'numero', 'titular', 'documento', 'instrucciones', 'espera', 'paquetes'];
  if (Object.keys(cambios).some(k => !campos.includes(k))) throw new ErrorHttp(400, 'datos_no_validos');
  if ('minutosRegalo' in cambios && entero(cambios.minutosRegalo, 0, 100_000, null) == null) throw new ErrorHttp(400, 'datos_no_validos');
  if ('minutosPorUso' in cambios && entero(cambios.minutosPorUso, 1, 60, null) == null) throw new ErrorHttp(400, 'datos_no_validos');
  if ('paquetes' in cambios && (!Array.isArray(cambios.paquetes) || cambios.paquetes.length > 8
    || cambios.paquetes.some(p => !ID_PAQUETE.test(String(p?.id ?? '')) || entero(p?.minutos, 1, 100_000, null) == null || !texto(p?.precio, 40)))) throw new ErrorHttp(400, 'paquete_pago_no_valido');
  const nueva = normalizarPagos({ ...leerConfigPagos(db), ...cambios });
  guardarAjuste(db, CLAVE_PAGOS, JSON.stringify(nueva));
  return nueva;
}
// Lo que ve un alumno para pagar (solo lectura): los datos de la cuenta, los paquetes y qué esperar.
export function datosParaPagar(cfg) {
  return { banco: cfg.banco, tipoCuenta: cfg.tipoCuenta, numero: cfg.numero, titular: cfg.titular, documento: cfg.documento, instrucciones: cfg.instrucciones, espera: cfg.espera, paquetes: cfg.paquetes, listo: Boolean(cfg.numero && cfg.titular && cfg.paquetes.length) };
}

// ---------- El saldo ----------
const iso = ms => new Date(ms).toISOString();
function anotar(db, { usuarioId, minutos, motivo, referencia = null, tareaId = null, hechoPor = null, ahora = Date.now() }) {
  db.prepare('INSERT INTO academia_ia_minutos (usuario_id, minutos, motivo, referencia, tarea_id, hecho_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(usuarioId, minutos, motivo, referencia, tareaId, hechoPor, iso(ahora));
}
const sumaDe = (db, usuarioId) => db.prepare('SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ?').get(usuarioId).n;

// Devuelve los usos que la IA no llegó a responder (la tarea terminó sin nada guardado). Una sola vez cada uno.
function devolverSinRespuesta(db, usuarioId, ahora) {
  const usos = db.prepare(`SELECT u.referencia, u.tarea_id, -SUM(u.minutos) AS debe FROM academia_ia_minutos u
    WHERE u.usuario_id = ? AND u.tarea_id IS NOT NULL AND u.motivo IN ('uso', 'devolucion') GROUP BY u.tarea_id HAVING SUM(u.minutos) < 0`).all(usuarioId);
  for (const u of usos) {
    const t = db.prepare('SELECT estado, datos FROM tareas WHERE id = ?').get(u.tarea_id);
    if (!t || ['lista', 'en_curso'].includes(t.estado)) continue;
    let clave = null;
    try { clave = JSON.parse(t.datos)?.clave ?? null; } catch { clave = null; }
    if (t.estado === 'hecha' && leerGuardado(db, clave)) continue;
    anotar(db, { usuarioId, minutos: u.debe, motivo: 'devolucion', referencia: u.referencia, tareaId: u.tarea_id, ahora });
  }
}

// El saldo de un alumno (con su regalo la primera vez y lo devuelto). { minutos, porUso, regalo }.
export function saldoIa(db, usuarioId, ahora = Date.now()) {
  const cfg = leerConfigPagos(db);
  return enTransaccion(db, () => {
    const regalo = db.prepare("SELECT 1 FROM academia_ia_minutos WHERE usuario_id = ? AND motivo = 'regalo' LIMIT 1").get(usuarioId);
    if (!regalo) anotar(db, { usuarioId, minutos: cfg.minutosRegalo, motivo: 'regalo', ahora });
    devolverSinRespuesta(db, usuarioId, ahora);
    return { minutos: Math.max(0, sumaDe(db, usuarioId)), porUso: cfg.minutosPorUso };
  });
}

// ¿Ya pagó esto (la misma explicación, la misma duda)? Entonces verlo otra vez no se cobra.
export function yaPagado(db, usuarioId, referencia) {
  return db.prepare("SELECT COALESCE(SUM(minutos), 0) AS n FROM academia_ia_minutos WHERE usuario_id = ? AND referencia = ? AND motivo IN ('uso', 'devolucion')").get(usuarioId, referencia).n < 0;
}
// Cobra un uso, o lanza 'sin_minutos' (nunca deja el saldo en menos de 0). Dentro de la escritura de quien llama.
export function cobrarUso(db, usuarioId, { referencia, tareaId = null, ahora = Date.now() }) {
  return enTransaccion(db, () => {
    const { minutos, porUso } = saldoIa(db, usuarioId, ahora);
    if (minutos < porUso) throw new ErrorHttp(409, 'sin_minutos');
    anotar(db, { usuarioId, minutos: -porUso, motivo: 'uso', referencia, tareaId, ahora });
    return minutos - porUso;
  });
}
export function ponerTareaAlUso(db, usuarioId, referencia, tareaId) {
  db.prepare("UPDATE academia_ia_minutos SET tarea_id = ? WHERE id = (SELECT MAX(id) FROM academia_ia_minutos WHERE usuario_id = ? AND referencia = ? AND motivo = 'uso')").run(tareaId, usuarioId, referencia);
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

// Sube un comprobante: el cuerpo del pedido es la imagen tal cual. → la fila nueva (vista del alumno).
export async function subirRecibo(db, config, { usuarioId, req, paquete, nota = '', ahora = Date.now() }) {
  const tipo = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  const ext = TIPOS_RECIBO[tipo];
  if (!ext) throw new ErrorHttp(415, 'imagen_no_valida');
  const largo = Number(req.headers['content-length']);
  if (Number.isFinite(largo) && largo > RECIBO_MAX_BYTES) throw new ErrorHttp(413, 'demasiado_grande');
  const cfg = leerConfigPagos(db);
  const p = cfg.paquetes.find(x => x.id === paquete);
  if (!p) throw new ErrorHttp(400, 'paquete_pago_no_valido');
  const pendientes = db.prepare("SELECT COUNT(*) AS n FROM academia_pagos WHERE usuario_id = ? AND estado = 'revision'").get(usuarioId).n;
  if (pendientes >= PAGOS_EN_REVISION_MAX) throw new ErrorHttp(409, 'muchos_en_revision');
  const carpeta = carpetaPagos(config);
  mkdirSync(carpeta, { recursive: true });
  const archivo = `${usuarioId}-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  const ruta = join(carpeta, archivo);
  let bytes = 0;
  const contar = new Transform({
    transform(trozo, _c, listo) {
      bytes += trozo.length;
      if (bytes > RECIBO_MAX_BYTES) return listo(new ErrorHttp(413, 'demasiado_grande'));
      listo(null, trozo);
    },
  });
  try {
    await pipeline(req, contar, createWriteStream(ruta, { flags: 'wx', mode: 0o640 }));
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    throw new ErrorHttp(400, 'imagen_no_valida');
  }
  // La imagen se revisa por dentro (los primeros bytes), nunca por su nombre. Una que no sirve queda en el disco (nada se
  // borra) pero nunca entra a la base.
  const fd = openSync(ruta, 'r');
  const cabeza = Buffer.alloc(16);
  try { readSync(fd, cabeza, 0, 16, 0); } finally { closeSync(fd); }
  if (!bytes || !esImagen(cabeza, tipo)) throw new ErrorHttp(400, 'imagen_no_valida');
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
    .map(f => ({ ...vistaPago(f), alumno: { id: f.usuario_id, nombre: f.nombre_visible || f.nombre } }));
}
export const pagosPendientes = db => db.prepare("SELECT COUNT(*) AS n FROM academia_pagos WHERE estado = 'revision'").get().n;

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
    if (aprobar) {
      saldoIa(db, f.usuario_id, ahora); // que tenga su regalo antes de sumar
      anotar(db, { usuarioId: f.usuario_id, minutos: f.minutos, motivo: 'pago', referencia: `pago:${f.id}`, hechoPor: adminId, ahora });
    }
    return vistaPago(db.prepare('SELECT * FROM academia_pagos WHERE id = ?').get(f.id));
  });
}
