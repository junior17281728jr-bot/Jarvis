// Rutas de la Academia (etapa 1, 0.7.0).
//  - Las del alumno (/api/academia/…) usan SIEMPRE el id de quien entró (la sesión): no aceptan el id de otra persona,
//    y un intento de otro responde «no existe». Así ningún alumno puede leer los datos de otro.
//  - Las del administrador (/api/admin/academia/…) llevan { admin: true }: subir y poner en uso un paquete, el nombre
//    de la app, el % para aprobar y lo de cada alumno.
//  - El paquete se sube en partes: primero el JSON (un pedido), después cada figura (un pedido por figura, el cuerpo es
//    la imagen tal cual y se escribe por partes en el disco). Ver src/academia/paquetes.js.
import { createReadStream } from 'node:fs';
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { LIMITES } from '../academia/formato.js';
import { leerCuerpo, subirJson, subirFigura, activarPaquete, listarPaquetes, paqueteActivo, rutaFigura } from '../academia/paquetes.js';
import { camino, leccion, crearIntento, verIntento, responder, terminar, progreso, alumnos, detalleAlumno, ajustesAcademia, guardarAjustesAcademia } from '../academia/progreso.js';

export function crearLimitesAcademia() {
  return { subidas: new Limitador({ maximo: 3000, ventanaMs: 60 * 60 * 1000 }), intentos: new Limitador({ maximo: 300, ventanaMs: 60 * 60 * 1000 }) };
}

export function registrarRutasAcademia(rutas, { config = null, limites = {}, azar = Math.random, reloj = Date.now } = {}) {
  const topes = { ...crearLimitesAcademia(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const activo = db => { necesitaConfig(); return paqueteActivo(db, config); };

  // ---------- El alumno ----------
  rutas.agregar('GET', '/api/academia/camino', ({ db, usuario }) => ({ codigo: 200, datos: camino(db, usuario.id, activo(db), reloj()) }));

  rutas.agregar('GET', '/api/academia/temas/:materia/:tema', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: leccion(db, usuario.id, activo(db), parametros.materia, parametros.tema) }));

  rutas.agregar('POST', '/api/academia/intentos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!topes.intentos.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const pedido = { tipo: textoDe(datos, 'tipo'), materia: textoDe(datos, 'materia') || null, tema: textoDe(datos, 'tema') || null };
    return { codigo: 201, datos: crearIntento(db, usuario.id, activo(db), pedido, { azar, ahoraMs: reloj() }) };
  });

  rutas.agregar('GET', '/api/academia/intentos/:id', ({ db, usuario, parametros }) =>
    ({ codigo: 200, datos: verIntento(db, usuario.id, activo(db), parametros.id) }));

  rutas.agregar('POST', '/api/academia/intentos/:id/responder', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: responder(db, usuario.id, activo(db), parametros.id, { pregunta: textoDe(datos, 'pregunta'), elegida: textoDe(datos, 'elegida') }, { ahoraMs: reloj() }) };
  });

  rutas.agregar('POST', '/api/academia/intentos/:id/terminar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: terminar(db, usuario.id, activo(db), parametros.id, { ahoraMs: reloj() }) };
  });

  rutas.agregar('GET', '/api/academia/progreso', ({ db, usuario }) => ({ codigo: 200, datos: progreso(db, usuario.id, activo(db), reloj()) }));

  // Una figura del paquete en uso (solo con la sesión abierta; nunca sale de public/).
  rutas.agregar('GET', '/api/academia/figuras/:numero', ({ db, parametros }) => {
    const f = rutaFigura(activo(db), parametros.numero);
    if (!f) throw new ErrorHttp(404, 'no_existe');
    return {
      codigo: 200,
      enviar: res => {
        res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': f.tipo, 'Content-Length': f.bytes, 'Cache-Control': 'private, max-age=3600' });
        const flujo = createReadStream(f.ruta);
        flujo.on('error', () => res.destroy());
        flujo.pipe(res);
      },
    };
  });

  // ---------- El administrador ----------
  rutas.agregar('GET', '/api/admin/academia', ({ db }) => {
    necesitaConfig();
    return { codigo: 200, datos: { ajustes: ajustesAcademia(db), paquetes: listarPaquetes(db, config), limites: { jsonBytes: LIMITES.jsonBytes, figuraBytes: LIMITES.figuraBytes } } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/ajustes', async ({ db, req }) => {
    const datos = await leerJson(req);
    const pedido = {};
    if (Object.hasOwn(datos, 'nombre')) pedido.nombre = datos.nombre;
    if (Object.hasOwn(datos, 'umbral')) pedido.umbral = datos.umbral;
    return { codigo: 200, datos: { ajustes: guardarAjustesAcademia(db, pedido) } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/paquetes', async ({ db, req, usuario }) => {
    necesitaConfig();
    const tipo = String(req.headers['content-type'] || '').toLowerCase();
    if (!tipo.startsWith('application/json')) throw new ErrorHttp(415, 'formato_no_valido');
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const cuerpo = await leerCuerpo(req, LIMITES.jsonBytes);
    const r = subirJson(db, config, { cuerpo, usuarioId: usuario.id });
    return { codigo: r.codigo, datos: r.datos };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/figuras/:archivo', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    if (!topes.subidas.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const r = await subirFigura(db, config, { paqueteId: parametros.id, archivo: parametros.archivo, req, usuarioId: usuario.id });
    return { codigo: r.ya ? 200 : 201, datos: r };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/academia/paquetes/:id/activar', async ({ db, req, usuario, parametros }) => {
    await leerJson(req);
    return { codigo: 200, datos: { paquete: activarPaquete(db, { paqueteId: parametros.id, usuarioId: usuario.id }) } };
  }, { admin: true });

  rutas.agregar('GET', '/api/admin/academia/alumnos', ({ db }) => ({ codigo: 200, datos: { alumnos: alumnos(db, activo(db), reloj()), ajustes: ajustesAcademia(db) } }), { admin: true });

  rutas.agregar('GET', '/api/admin/academia/alumnos/:id', ({ db, parametros }) =>
    ({ codigo: 200, datos: detalleAlumno(db, activo(db), parametros.id, reloj()) }), { admin: true });
}
