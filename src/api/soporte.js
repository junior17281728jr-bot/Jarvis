// Academia 0.9.2: «Ayuda / Soporte» (src/cuentas/soporte.js). /api/soporte… usan la cuenta de la sesión (cada persona ve
// solo los suyos); /api/admin/soporte… son del administrador (403 para los alumnos, 401 sin sesión).
import { createReadStream } from 'node:fs';
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { crearTicket, subirImagen, imagenDe, ticketsDe, verTicket, responderAlumno, ticketsAdmin, verTicketAdmin, responderAdmin, pendientesSoporte,
  crearReporte, subirCaptura, capturaDe, reportesAdmin, verReporteAdmin, actualizarReporte, ponerVeredicto, claveOpinionIa, opinionIaDe } from '../cuentas/soporte.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { resolverReporte, TIPOS_PAQUETE } from '../academia/reporte-item.js';
import { armarRevision } from '../academia/reporte-ia.js';
import { PROPOSITOS } from '../ia/propositos.js';
import { retirarAprendido } from '../academia/oral-aprende.js';

// 0.14.93: el reporte (ya con su veredicto) es de una calificación del oral → retira lo aprendido de esa pregunta.
function retirarDeReporte(db, adminId, r, ahoraMs = Date.now()) {
  const item = r?.reporte?.item;
  if (item?.tipo !== 'oral' || item.ref?.nota !== true || typeof item.ref?.aprendido !== 'string') return null;
  return retirarAprendido(db, item.ref.aprendido, { por: Number(adminId), motivo: 'reporte', reporte: r.id ?? null }, ahoraMs);
}

export function registrarRutasSoporte(rutas, { config = null, reloj = Date.now, limites = {}, ganchos = null } = {}) {
  const topes = { imagenes: new Limitador({ maximo: 40, ventanaMs: 24 * 3600 * 1000 }), mensajes: new Limitador({ maximo: 60, ventanaMs: 3600 * 1000 }), ia: new Limitador({ maximo: 20, ventanaMs: 3600 * 1000 }), ...limites };
  const activo = db => { try { return config ? paqueteActivo(db, config) : null; } catch { return null; } };
  const iaHay = (db, usuario) => Boolean(ganchos?.iaHay?.(db, usuario)) && typeof ganchos?.iaCompe === 'function';
  // Lo del reporte que puede ver el administrador, con la IA (si hay) y su opinión guardada (si ya la pidió).
  // Solo para lo del paquete (una tarjeta, una pregunta, el oral, lo de la IA): de la app o un dibujo no hay texto que juzgar.
  const delPaquete = r => TIPOS_PAQUETE.includes(r.reporte.item?.tipo);
  const conIa = (db, usuario, r) => ({ ...r, ia: { disponible: delPaquete(r) && iaHay(db, usuario), opinion: delPaquete(r) ? opinionIaDe(db, r.reporte.clave) : null } });
  const servirCaptura = c => ({
    codigo: 200,
    enviar: res => {
      res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': c.tipo, 'Content-Length': c.datos.length, 'Cache-Control': 'private, no-store' });
      res.end(c.datos);
    },
  });
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const servir = img => ({
    codigo: 200,
    enviar: res => {
      res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': img.tipo, 'Content-Length': img.bytes, 'Cache-Control': 'private, no-store' });
      const flujo = createReadStream(img.ruta);
      flujo.on('error', () => res.destroy());
      flujo.pipe(res);
    },
  });

  rutas.agregar('GET', '/api/soporte', ({ db, usuario }) => ({ codigo: 200, datos: { tickets: ticketsDe(db, usuario.id) } }));
  rutas.agregar('POST', '/api/soporte', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    return { codigo: 201, datos: { ticket: crearTicket(db, usuario.id, { categoria: textoDe(datos, 'categoria'), texto: textoDe(datos, 'texto'), contexto: datos?.contexto }, { ahoraMs: reloj() }) } };
  });
  // «Mis datos»: pedir acceso, corrección, borrado u oposición (queda como mensaje de ayuda «Datos personales»).
  rutas.agregar('POST', '/api/yo/datos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const pedido = textoDe(datos, 'pedido');
    const texto = textoDe(datos, 'texto').trim() || `Pedido: ${pedido}`;
    return { codigo: 201, datos: { ticket: crearTicket(db, usuario.id, { categoria: 'datos', pedido, texto, contexto: { pantalla: 'mis-datos' } }, { ahoraMs: reloj() }) } };
  });
  rutas.agregar('GET', '/api/soporte/:id', ({ db, usuario, parametros }) => ({ codigo: 200, datos: { ticket: verTicket(db, usuario.id, parametros.id, { ahoraMs: reloj() }) } }));
  rutas.agregar('POST', '/api/soporte/:id/mensajes', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    if (!topes.mensajes.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 200, datos: { ticket: responderAlumno(db, usuario.id, parametros.id, textoDe(datos, 'texto'), { ahoraMs: reloj() }) } };
  });
  // Una captura (el cuerpo es la imagen tal cual: PNG, JPG o WEBP, 5 MB o menos).
  rutas.agregar('POST', '/api/soporte/:id/imagenes', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.imagenes.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 201, datos: await subirImagen(db, config, usuario.id, parametros.id, req, { ahoraMs: reloj() }) };
  });
  rutas.agregar('GET', '/api/soporte/:id/imagenes/:mensaje/:indice', ({ db, usuario, parametros }) => {
    necesitaConfig();
    return servir(imagenDe(db, config, parametros.id, parametros.mensaje, parametros.indice, { usuarioId: usuario.id }));
  });

  // ---------- 0.14.26: «Reportar un problema» (un mensaje de ayuda 'error' con su captura en la base) ----------
  // El contexto lo pone la app (pantalla, versión, equipo, tamaño, idioma); el servidor solo guarda esos campos (nunca
  // otro, así una contraseña nunca puede colarse) y pone la hora.
  // 0.14.85: «⚑ Reportar un error»: con «que» (lo que eligió), «porque» y el punto («item»: solo dónde está; el servidor
  // saca del paquete lo que vio y, de una pregunta, la letra que eligió de SUS respuestas guardadas).
  rutas.agregar('POST', '/api/soporte/reporte', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const que = Object.hasOwn(datos ?? {}, 'que') ? textoDe(datos, 'que') : null;
    if (que === null) return { codigo: 201, datos: { ticket: crearReporte(db, usuario.id, { texto: textoDe(datos, 'texto'), contexto: datos?.contexto }, { ahoraMs: reloj() }) } };
    const pantalla = typeof datos?.contexto?.pantalla === 'string' ? datos.contexto.pantalla : null;
    const item = resolverReporte(db, activo(db), usuario, datos?.item, { pantalla, ahora: reloj() });
    return { codigo: 201, datos: { ticket: crearReporte(db, usuario.id, { que, porque: textoDe(datos, 'porque'), contexto: datos?.contexto, item }, { ahoraMs: reloj() }) } };
  });
  rutas.agregar('POST', '/api/soporte/:id/captura', async ({ db, req, usuario, parametros }) => {
    if (!topes.imagenes.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 201, datos: await subirCaptura(db, usuario.id, parametros.id, req, { ahoraMs: reloj() }) };
  });
  rutas.agregar('GET', '/api/soporte/:id/captura', ({ db, usuario, parametros }) => servirCaptura(capturaDe(db, parametros.id, { usuarioId: usuario.id })));
  rutas.agregar('GET', '/api/admin/reportes', ({ db }) => ({ codigo: 200, datos: reportesAdmin(db) }), { admin: true });
  rutas.agregar('GET', '/api/admin/reportes/:id', ({ db, usuario, parametros }) => ({ codigo: 200, datos: { reporte: conIa(db, usuario, verReporteAdmin(db, parametros.id)) } }), { admin: true });
  // «¿Tiene razón?»: si | no | dudoso (todos: true → a todos los de ese punto que todavía no tienen veredicto).
  rutas.agregar('POST', '/api/admin/reportes/:id/veredicto', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const valor = textoDe(datos, 'valor');
    const r = ponerVeredicto(db, usuario.id, parametros.id, valor, { todos: datos?.todos === true, ahoraMs: reloj() });
    // 0.14.93: «Sí, es un error» en una calificación del oral: lo que el sistema aprendió de esa pregunta deja de usarse
    // (se retira, nunca se borra), así un veredicto malo de la IA no se copia a otros alumnos.
    const aprendido = valor === 'si' ? retirarDeReporte(db, usuario.id, r, reloj()) : null;
    return { codigo: 200, datos: { reporte: conIa(db, usuario, r), ...(aprendido ? { aprendido } : {}) } };
  }, { admin: true });
  // «Pedir opinión a la IA»: SOLO el punto y los porqués (sin nombres ni datos); la respuesta llega a la fila y se lee al
  // volver a abrir el reporte. Sin IA (o fuera de los topes): 409 ia_no_disponible.
  rutas.agregar('POST', '/api/admin/reportes/:id/ia', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    const r = verReporteAdmin(db, parametros.id);
    if (!delPaquete(r)) throw new ErrorHttp(409, 'reporte_sin_punto');
    if (!iaHay(db, usuario)) throw new ErrorHttp(409, 'ia_no_disponible');
    if (!topes.ia.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const porques = r.grupo.reportes.map(x => ({ que: x.que ?? '', texto: x.porque ?? '' }));
    const pedido = armarRevision(r.reporte.item, porques);
    if (Buffer.byteLength(pedido.sistema) + Buffer.byteLength(pedido.texto) > PROPOSITOS.reporte_revisar.entradaMaxBytes) throw new ErrorHttp(409, 'ia_no_disponible');
    const x = ganchos.iaCompe(db, usuario, { uso: 'reporte_revisar', ...pedido, clave: claveOpinionIa(r.reporte.clave), extra: { huella: r.reporte.item.ref?.h ?? null } });
    if (x.estado !== 'pendiente') throw new ErrorHttp(409, 'ia_no_disponible');
    return { codigo: 202, datos: { tarea: { id: x.tarea } } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/reportes/:id', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const pedido = {};
    if (Object.hasOwn(datos ?? {}, 'estado')) pedido.estado = textoDe(datos, 'estado');
    if (Object.hasOwn(datos ?? {}, 'notas')) pedido.notas = textoDe(datos, 'notas');
    return { codigo: 200, datos: { reporte: actualizarReporte(db, usuario.id, parametros.id, pedido, { ahoraMs: reloj() }) } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/reportes/:id/captura', ({ db, parametros }) => servirCaptura(capturaDe(db, parametros.id)), { admin: true });

  // ---------- El administrador ----------
  rutas.agregar('GET', '/api/admin/soporte', ({ db }) => ({ codigo: 200, datos: { tickets: ticketsAdmin(db), pendientes: pendientesSoporte(db) } }), { admin: true });
  rutas.agregar('GET', '/api/admin/soporte/:id', ({ db, parametros }) => ({ codigo: 200, datos: { ticket: verTicketAdmin(db, parametros.id, { ahoraMs: reloj() }) } }), { admin: true });
  rutas.agregar('POST', '/api/admin/soporte/:id', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const pedido = {};
    if (Object.hasOwn(datos ?? {}, 'texto')) pedido.texto = textoDe(datos, 'texto');
    if (Object.hasOwn(datos ?? {}, 'estado')) pedido.estado = textoDe(datos, 'estado');
    return { codigo: 200, datos: { ticket: responderAdmin(db, usuario.id, parametros.id, pedido, { ahoraMs: reloj() }) } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/soporte/:id/imagenes/:mensaje/:indice', ({ db, parametros }) => {
    necesitaConfig();
    return servir(imagenDe(db, config, parametros.id, parametros.mensaje, parametros.indice));
  }, { admin: true });
}
