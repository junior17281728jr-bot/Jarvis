// Academia 0.9.2: «Ayuda / Soporte» (src/cuentas/soporte.js). /api/soporte… usan la cuenta de la sesión (cada persona ve
// solo los suyos); /api/admin/soporte… son del administrador (403 para los alumnos, 401 sin sesión).
import { createReadStream } from 'node:fs';
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { crearTicket, subirImagen, imagenDe, ticketsDe, verTicket, responderAlumno, ticketsAdmin, verTicketAdmin, responderAdmin, pendientesSoporte } from '../cuentas/soporte.js';

export function registrarRutasSoporte(rutas, { config = null, reloj = Date.now, limites = {} } = {}) {
  const topes = { imagenes: new Limitador({ maximo: 40, ventanaMs: 24 * 3600 * 1000 }), mensajes: new Limitador({ maximo: 60, ventanaMs: 3600 * 1000 }), ...limites };
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
