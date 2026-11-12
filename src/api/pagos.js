// Academia 0.10.0: el tiempo con IA de cada alumno y sus pagos por transferencia (src/academia/tiempo-ia.js), y los
// ajustes de las fallas registradas (src/academia/fallas.js).
//  - El alumno (siempre con el id de su sesión): su saldo, los datos para transferir (solo lectura), subir un
//    comprobante, su historial y la imagen de SUS comprobantes (la de otro: 404).
//  - El administrador: la lista de comprobantes (con la imagen), aprobar (suma los minutos una vez) o rechazar (con el
//    motivo que ve el alumno). Cambiar los datos de pago, los paquetes, el regalo, el saldo de un alumno o los umbrales de
//    las fallas: con la sesión de administrador, también por el enlace público (0.12.3; antes solo desde la cuenta de
//    Tailscale del dueño). Los datos de pago y los paquetes (adónde se paga) piden además su contraseña otra vez y dejan
//    un aviso y una línea en la auditoría (qué campos cambiaron).
//  - 0.12.3: al subir un comprobante, un aviso para el administrador (en la pantalla y, si está unido, por Telegram) con
//    el nombre del alumno, el paquete y el monto. Los comprobantes se guardan PARA SIEMPRE (ya no se borran a los 30
//    días): el administrador ve cualquiera y los baja todos (GET /api/admin/academia/pagos/todos y …/:id/recibo?bajar=1).
import { createReadStream } from 'node:fs';
import { ErrorHttp, leerJson, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { espacioDe } from '../cuentas/espacios.js';
import { esEspacioAdmin, leerConfigIa } from '../ia/config.js';
import {
  leerConfigPagos, guardarConfigPagos, revisarConfigPagos, todosLosPagos, nombreParaBajar, datosParaPagar, saldoIa, ajustarSaldo, movimientos, subirRecibo, pagosDe, rutaRecibo,
  novedadesPagos, marcarPagosVistos, pagosParaRevisar, pagosPendientes, resolverPago, RECIBO_MAX_BYTES, derechoIa, darPruebaOtraVez,
} from '../academia/tiempo-ia.js';
import { leerConfigFallas, guardarConfigFallas, fallasDe } from '../academia/fallas.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { espacioConfirmado } from '../cuentas/confianza.js';
import { topeEspacioMicro } from '../ia/topes.js';
import { pagosPermitidos, iaPermitida } from '../cuentas/terminos.js';
import { anotarCambioAdmin } from '../cuentas/confirmar.js';
import { abrirAviso, resolverAviso } from '../avisos/avisos.js';

// ¿Sus minutos le sirven ahora? Los minutos solos no encienden la IA: también hacen falta la IA y el instructor
// encendidos, un tope de su plan mayor que US$0 y «Permitir IA» para su cuenta (y que no se haya llenado un tope del mes).
// 0.12.3 (auditoría P1-2): también su permiso para usar la IA (lo da al firmar o en «Mis datos»): sin él no se le vende
// tiempo ni se aprueba un pago sin avisar. estricto: como el instructor (config.terminosObligatorios).
export function iaDeAlumno(db, usuario, { estricto = true } = {}) {
  const cfg = leerConfigIa(db);
  const falta = [];
  if (!cfg.encendida || !cfg.instructorIa) falta.push('ia_apagada');
  if (usuario?.rol !== 'admin' && !iaPermitida(db, usuario.id, { estricto })) falta.push('sin_consentimiento');
  const e = espacioDe(db, usuario);
  if (e && !esEspacioAdmin(db, e.id)) {
    // 0.12.8: el administrador pausó la IA de este alumno (IA por alumno): para él no hay IA, ni se le vende.
    const tope = topeEspacioMicro(db, cfg, e.id);
    if (tope.fuente === 'pausa') falta.push('pausada');
    else if (!(tope.topeMicro > 0)) falta.push('sin_presupuesto');
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
// 0.12.3 (auditoría P1-2): activo es POR CUENTA: para un alumno, solo si la IA le sirve a él (iaDeAlumno: encendida, su
// tope, «Permitir IA» y su permiso). Si no, ninguna pantalla le muestra minutos.
export function tiempoDe(db, usuario, ahora = Date.now(), { estricto = true } = {}) {
  const e = espacioDe(db, usuario);
  const cfg = leerConfigIa(db);
  const activo = cfg.encendida && cfg.instructorIa;
  if (e && esEspacioAdmin(db, e.id)) return { ilimitado: true, minutos: null, porUso: leerConfigPagos(db).minutosPorUso, activo, puede: true };
  // 0.12.7: su derecho a la IA (plan, prueba gratis o minutos de antes): puede = le queda al menos un uso ahora.
  const d = derechoIa(db, usuario.id, ahora);
  return { ilimitado: false, minutos: d.minutos, porUso: d.porUso, activo: activo && iaDeAlumno(db, usuario, { estricto }).listo,
    puede: d.fuente != null, modo: d.modo, fuente: d.fuente, motivo: d.motivo, plan: d.plan, prueba: d.prueba };
}

export function registrarRutasPagos(rutas, { config = null, limites = {}, reloj = Date.now } = {}) {
  const topes = { ...crearLimitesPagos(), ...(limites ?? {}) };
  reloj ??= Date.now;
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const estricto = config?.terminosObligatorios !== false;
  // bajar: el nombre con que se guarda («comprobante-<n.º>-<alumno>-<fecha>.jpg»), para «Bajar».
  const enviarImagen = (r, bajar = null) => ({
    codigo: 200,
    enviar: res => {
      res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': r.tipo, 'Content-Length': r.bytes, 'Cache-Control': 'private, no-store',
        ...(bajar ? { 'Content-Disposition': `attachment; filename="${bajar}"` } : {}) });
      const flujo = createReadStream(r.ruta);
      flujo.on('error', () => res.destroy());
      flujo.pipe(res);
    },
  });

  // ---------- El alumno ----------
  rutas.agregar('GET', '/api/academia/tiempo-ia', ({ db, usuario }) => {
    contar(topes.lecturas, usuario);
    const ahora = reloj();
    // 0.12.3: venta: si el instructor IA le sirve AHORA a esta cuenta (si no, la pantalla no vende ni muestra minutos).
    const tiempo = tiempoDe(db, usuario, ahora, { estricto });
    const venta = tiempo.ilimitado ? { listo: false, falta: [] } : iaDeAlumno(db, usuario, { estricto });
    return { codigo: 200, datos: { tiempo, venta, pagar: datosParaPagar(leerConfigPagos(db)), pagos: pagosDe(db, usuario.id), novedades: novedadesPagos(db, usuario.id), movimientos: movimientos(db, usuario.id), maxBytes: RECIBO_MAX_BYTES } };
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
    // 0.12.3 (auditoría P1-2): nunca se cobra un servicio que no se puede dar: sin la IA lista para esta cuenta (encendida,
    // con su tope, «Permitir IA» y su permiso), 409 pago_ia_no_disponible (falta: qué). Los comprobantes ya subidos quedan.
    const ia = iaDeAlumno(db, usuario, { estricto });
    if (!ia.listo) throw new ErrorHttp(409, 'pago_ia_no_disponible', { falta: ia.falta });
    contar(topes.subir, usuario);
    const consulta = new URL(req.url, 'http://x').searchParams;
    const ahora = reloj();
    const fila = await subirRecibo(db, config, { usuarioId: usuario.id, req, paquete: consulta.get('paquete') ?? '', nota: consulta.get('nota') ?? '', ahora });
    // 0.12.3: el aviso para el administrador (nunca hace fallar la subida: el comprobante ya quedó guardado).
    try {
      const u = db.prepare('SELECT nombre, nombre_visible FROM usuarios WHERE id = ?').get(usuario.id);
      abrirAviso(db, { clave: `pago_recibido:${fila.id}`, nivel: 'atencion', detalle: { pago: fila.id, alumno: u?.nombre_visible || u?.nombre || usuario.nombre, minutos: fila.minutos, precio: fila.precio }, ahora });
    } catch (error) {
      console.error('No se pudo abrir el aviso del comprobante', error?.message);
    }
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
      .map(u => {
        // 0.12.7: su plan, su prueba gratis (días que le quedan) y sus usos.
        const d = derechoIa(db, u.id, ahora);
        return { id: u.id, nombre: u.nombre_visible || u.nombre, minutos: d.minutos, ia: iaDeAlumno(db, { ...u, rol: 'usuario' }, { estricto }), derecho: { fuente: d.fuente, motivo: d.motivo, plan: d.plan, prueba: d.prueba } };
      });
    // 0.12.8: lo que de verdad costó un uso de la IA del instructor en los últimos 30 días (para el presupuesto por plan).
    const costo = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(costo_micro), 0) AS c FROM ia_llamadas WHERE proposito LIKE 'instructor%'
      AND estado <> 'reservada' AND costo_micro IS NOT NULL AND creada_en >= ?`).get(new Date(ahora - 30 * DIA).toISOString());
    const estimado = { llamadas: costo.n, porUsoMicro: costo.n ? Math.round(costo.c / costo.n) : null };
    return { codigo: 200, datos: { config: leerConfigPagos(db), pagos: pagosParaRevisar(db), pendientes: pagosPendientes(db), alumnos, fallas: leerConfigFallas(db), estimado } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/pagos/pendientes', ({ db }) => ({ codigo: 200, datos: { pendientes: pagosPendientes(db) } }), { admin: true });
  // 0.12.3: todos los comprobantes, de siempre (los más nuevos primero, de a 100: ?antes=<n.º>), para verlos y bajarlos.
  rutas.agregar('GET', '/api/admin/academia/pagos/todos', ({ db, req }) => {
    const antes = Number(new URL(req.url, 'http://x').searchParams.get('antes'));
    return { codigo: 200, datos: todosLosPagos(db, config, { antes: Number.isSafeInteger(antes) && antes > 0 ? antes : null }) };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/pagos/:id/recibo', ({ db, req, parametros }) => {
    necesitaConfig();
    const r = rutaRecibo(db, config, { id: parametros.id, admin: true });
    const bajar = new URL(req.url, 'http://x').searchParams.get('bajar') === '1' ? nombreParaBajar(db, parametros.id) : null;
    return enviarImagen(r, bajar);
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/pagos/:id/aprobar', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    // 0.12.3 (auditoría P1-2): si sus minutos no le servirían ahora, no se aprueba sin que el administrador lo confirme
    // ({ aunAsi: true }): 409 ia_no_lista_alumno { falta }. Nada cambia hasta entonces (el comprobante queda en revisión).
    const fila = db.prepare('SELECT usuario_id FROM academia_pagos WHERE id = ?').get(Number(parametros.id));
    const cuenta = fila ? db.prepare('SELECT id, rol FROM usuarios WHERE id = ?').get(fila.usuario_id) : null;
    const lista = cuenta ? iaDeAlumno(db, cuenta, { estricto }) : null;
    if (lista && !lista.listo && datos?.aunAsi !== true && db.prepare("SELECT estado FROM academia_pagos WHERE id = ?").get(Number(parametros.id))?.estado === 'revision') {
      throw new ErrorHttp(409, 'ia_no_lista_alumno', { falta: lista.falta });
    }
    const pago = resolverPago(db, { id: parametros.id, adminId: usuario.id, aprobar: true, ahora: reloj() });
    resolverAviso(db, `pago_recibido:${pago.id}`, reloj());
    const alumno = db.prepare('SELECT p.usuario_id AS id FROM academia_pagos p WHERE p.id = ?').get(pago.id);
    // Si sus minutos todavía no le sirven (falta un tope de plan o «Permitir IA»), se dice al aprobar.
    return { codigo: 200, datos: { pago, ia: iaDeAlumno(db, db.prepare('SELECT id, rol FROM usuarios WHERE id = ?').get(alumno.id), { estricto }) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/pagos/:id/rechazar', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const pago = resolverPago(db, { id: parametros.id, adminId: usuario.id, aprobar: false, motivo: datos?.motivo, ahora: reloj() });
    resolverAviso(db, `pago_recibido:${pago.id}`, reloj());
    return { codigo: 200, datos: { pago } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/pagos/ajustes', async ({ db, req, usuario, confirmar }) => {
    const datos = await leerJson(req);
    // Primero se revisa lo que llegó (una línea de paquetes mala dice cuál), después la contraseña, después se guarda.
    revisarConfigPagos(datos);
    const confirmado = await confirmar();
    const antes = leerConfigPagos(db);
    const config = guardarConfigPagos(db, datos);
    const cambiados = Object.keys(config).filter(k => JSON.stringify(config[k]) !== JSON.stringify(antes[k]));
    if (cambiados.length) anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'datos_pago', detalle: { campos: cambiados }, como: confirmado.como });
    return { codigo: 200, datos: { config } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/minutos', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { tiempo: ajustarSaldo(db, Number(parametros.id), datos?.minutos, usuario.id, reloj()) } };
  }, { admin: true, soloDueno: true });
  // 0.12.7: darle la prueba gratis otra vez (empieza en su próximo uso de la IA).
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/prueba', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: { derecho: darPruebaOtraVez(db, Number(parametros.id), usuario.id, reloj()) } };
  }, { admin: true });
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
