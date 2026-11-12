// Academia 0.10.0: el tiempo con IA de cada alumno y sus pagos por transferencia (src/academia/tiempo-ia.js), y los
// ajustes de las fallas registradas (src/academia/fallas.js).
//  - El alumno (siempre con el id de su sesión): su saldo, los datos para transferir (solo lectura), subir un
//    comprobante, su historial y la imagen de SUS comprobantes (la de otro: 404).
//  - El administrador: la lista de comprobantes (con la imagen), aprobar (suma los minutos una vez) o rechazar (con el
//    motivo que ve el alumno). Cambiar los datos de pago, los paquetes, el regalo, el saldo de un alumno o los umbrales de
//    las fallas es solo del dueño, desde su cuenta de Tailscale (soloDueno): nadie más puede cambiar adónde se paga.
import { createReadStream } from 'node:fs';
import { ErrorHttp, leerJson, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { espacioDe } from '../cuentas/espacios.js';
import { esEspacioAdmin, leerConfigIa } from '../ia/config.js';
import {
  leerConfigPagos, guardarConfigPagos, datosParaPagar, saldoIa, ajustarSaldo, movimientos, subirRecibo, pagosDe, rutaRecibo,
  novedadesPagos, marcarPagosVistos, pagosParaRevisar, pagosPendientes, resolverPago, RECIBO_MAX_BYTES,
} from '../academia/tiempo-ia.js';
import { leerConfigFallas, guardarConfigFallas, fallasDe } from '../academia/fallas.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { espacioConfirmado } from '../cuentas/confianza.js';
import { topeEspacioMicro } from '../ia/topes.js';
import { pagosPermitidos } from '../cuentas/terminos.js';

// ¿Sus minutos le sirven ahora? Los minutos solos no encienden la IA: también hacen falta la IA y el instructor
// encendidos, un tope de su plan mayor que US$0 y «Permitir IA» para su cuenta (y que no se haya llenado un tope del mes).
export function iaDeAlumno(db, usuario) {
  const cfg = leerConfigIa(db);
  const falta = [];
  if (!cfg.encendida || !cfg.instructorIa) falta.push('ia_apagada');
  const e = espacioDe(db, usuario);
  if (e && !esEspacioAdmin(db, e.id)) {
    if (!(topeEspacioMicro(db, cfg, e.id).topeMicro > 0)) falta.push('sin_presupuesto');
    if (!espacioConfirmado(db, e.id)) falta.push('cuenta_sin_permiso');
  }
  return { listo: falta.length === 0, falta };
}

const DIA = 24 * 60 * 60 * 1000;

export function crearLimitesPagos() {
  return {
    subir: new Limitador({ maximo: 10, ventanaMs: DIA }),
    lecturas: new Limitador({ maximo: 600, ventanaMs: 10 * 60 * 1000 }),
  };
}

// El tiempo con IA de una cuenta: la del administrador no tiene límite (paga con el tope general).
export function tiempoDe(db, usuario, ahora = Date.now()) {
  const e = espacioDe(db, usuario);
  const cfg = leerConfigIa(db);
  const activo = cfg.encendida && cfg.instructorIa;
  if (e && esEspacioAdmin(db, e.id)) return { ilimitado: true, minutos: null, porUso: leerConfigPagos(db).minutosPorUso, activo };
  return { ilimitado: false, ...saldoIa(db, usuario.id, ahora), activo };
}

export function registrarRutasPagos(rutas, { config = null, limites = {}, reloj = Date.now } = {}) {
  const topes = { ...crearLimitesPagos(), ...(limites ?? {}) };
  reloj ??= Date.now;
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const enviarImagen = r => ({
    codigo: 200,
    enviar: res => {
      res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': r.tipo, 'Content-Length': r.bytes, 'Cache-Control': 'private, no-store' });
      const flujo = createReadStream(r.ruta);
      flujo.on('error', () => res.destroy());
      flujo.pipe(res);
    },
  });

  // ---------- El alumno ----------
  rutas.agregar('GET', '/api/academia/tiempo-ia', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    return { codigo: 200, datos: { tiempo: tiempoDe(db, usuario, ahora), pagar: datosParaPagar(leerConfigPagos(db)), pagos: pagosDe(db, usuario.id), novedades: novedadesPagos(db, usuario.id), movimientos: movimientos(db, usuario.id), maxBytes: RECIBO_MAX_BYTES } };
  });
  rutas.agregar('POST', '/api/academia/tiempo-ia/visto', async ({ db, req, usuario }) => {
    await leerJson(req);
    marcarPagosVistos(db, usuario.id, reloj());
    return { codigo: 200, datos: { listo: true } };
  });
  // El comprobante: el cuerpo es la imagen tal cual; el paquete y la nota van en la dirección (?paquete=…&nota=…).
  rutas.agregar('POST', '/api/academia/pagos', async ({ db, req, usuario }) => {
    necesitaConfig();
    // 0.11.0: un menor de edad paga solo si el administrador marcó «el tutor autorizó pagos».
    if (!pagosPermitidos(db, usuario.id)) throw new ErrorHttp(403, 'pagos_menor');
    contar(topes.subir, usuario);
    const consulta = new URL(req.url, 'http://x').searchParams;
    const fila = await subirRecibo(db, config, { usuarioId: usuario.id, req, paquete: consulta.get('paquete') ?? '', nota: consulta.get('nota') ?? '', ahora: reloj() });
    return { codigo: 201, datos: { pago: fila, espera: leerConfigPagos(db).espera } };
  });
  rutas.agregar('GET', '/api/academia/pagos/:id/recibo', ({ db, usuario, parametros }) => {
    necesitaConfig();
    return enviarImagen(rutaRecibo(db, config, { id: parametros.id, usuarioId: usuario.id }));
  });

  // ---------- El administrador ----------
  rutas.agregar('GET', '/api/admin/academia/pagos', ({ db }) => {
    const ahora = reloj();
    const alumnos = db.prepare("SELECT id, nombre, nombre_visible FROM usuarios WHERE rol <> 'admin' AND activo = 1 ORDER BY nombre").all()
      .map(u => ({ id: u.id, nombre: u.nombre_visible || u.nombre, minutos: saldoIa(db, u.id, ahora).minutos, ia: iaDeAlumno(db, u) }));
    return { codigo: 200, datos: { config: leerConfigPagos(db), pagos: pagosParaRevisar(db), pendientes: pagosPendientes(db), alumnos, fallas: leerConfigFallas(db) } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/pagos/pendientes', ({ db }) => ({ codigo: 200, datos: { pendientes: pagosPendientes(db) } }), { admin: true });
  rutas.agregar('GET', '/api/admin/academia/pagos/:id/recibo', ({ db, parametros }) => {
    necesitaConfig();
    return enviarImagen(rutaRecibo(db, config, { id: parametros.id, admin: true }));
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/pagos/:id/aprobar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const pago = resolverPago(db, { id: parametros.id, adminId: usuario.id, aprobar: true, ahora: reloj() });
    const alumno = db.prepare('SELECT p.usuario_id AS id FROM academia_pagos p WHERE p.id = ?').get(pago.id);
    // Si sus minutos todavía no le sirven (falta un tope de plan o «Permitir IA»), se dice al aprobar.
    return { codigo: 200, datos: { pago, ia: iaDeAlumno(db, { id: alumno.id }) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/pagos/:id/rechazar', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { pago: resolverPago(db, { id: parametros.id, adminId: usuario.id, aprobar: false, motivo: datos?.motivo, ahora: reloj() }) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/pagos/ajustes', async ({ db, req }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { config: guardarConfigPagos(db, datos) } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/minutos', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { tiempo: ajustarSaldo(db, Number(parametros.id), datos?.minutos, usuario.id, reloj()) } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/fallas/ajustes', async ({ db, req }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { fallas: guardarConfigFallas(db, { umbral: datos?.umbral, examen: datos?.examen }) } };
  }, { admin: true, soloDueno: true });
  // Las fallas de un alumno (activas, en refuerzo y superadas: su historial).
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/fallas', ({ db, parametros }) => {
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos: { fallas: fallasDe(db, id, config ? paqueteActivo(db, config) : null, reloj()) } };
  }, { admin: true });
}
