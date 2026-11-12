// Rutas del Telegram del dueño (fase 1, parte e), en Administrador → Claves. Todas solo para el administrador; 0.12.3: con
// su sesión, también por el enlace público. Empezar a unir un chat pide su contraseña otra vez (decide adónde llegan los
// avisos y las copias); unirlo y dejarlo dejan un aviso y una línea en la auditoría. El token se pega por la ruta de siempre de las claves
// (POST /api/admin/claves { uso: 'telegram_bot', valor }): estas rutas nunca lo reciben ni lo devuelven.
//  - vincular: un código de 8 cifras de un solo uso (10 min) para mandárselo al bot desde el chat privado del dueño.
//  - vincular/revisar: la pantalla pregunta cada 3 s; el servidor le pregunta a Telegram como mucho una vez cada 3 s.
//  - vincular/confirmar (ronda 3): el segundo código, el que el bot le mandó al chat que escribió el primero.
//  - prueba: un mensaje de prueba (suena). desvincular: deja de usar ese chat (la fila queda; nada se borra).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { anotarCambioAdmin } from '../cuentas/confirmar.js';
import { ErrorCanal, empezarVinculo, revisarVinculo, confirmarVinculo, cancelarVinculo, mandarPrueba, desvincular } from '../canales/canales.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;

export function crearLimitesCanales() {
  return {
    vincular: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
    revisar: new Limitador({ maximo: 400, ventanaMs: DIEZ_MINUTOS }),
    confirmar: new Limitador({ maximo: 20, ventanaMs: DIEZ_MINUTOS }),
    prueba: new Limitador({ maximo: 5, ventanaMs: DIEZ_MINUTOS }),
    desvincular: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
  };
}

const deCanal = error => (error instanceof ErrorCanal ? new ErrorHttp(error.http, error.clave) : error);

export function registrarRutasCanales(rutas, { config = null, limites = {}, adaptador = undefined } = {}) {
  const topes = { ...crearLimitesCanales(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'almacen_no_disponible'); };
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };

  rutas.agregar('POST', '/api/admin/telegram/vincular', async ({ db, usuario, confirmar }) => {
    necesitaConfig();
    contar(topes.vincular, usuario);
    await confirmar();
    try {
      const r = await empezarVinculo(db, config, { usuarioId: usuario.id, adaptador });
      return { codigo: 201, datos: { codigo: r.codigo, paraMostrar: r.paraMostrar, enlace: r.enlace, hasta: r.hasta, bot: r.bot }, cabeceras: { 'Cache-Control': 'no-store' } };
    } catch (error) {
      throw deCanal(error);
    }
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/telegram/vincular/revisar', async ({ db, usuario }) => {
    necesitaConfig();
    contar(topes.revisar, usuario);
    return { codigo: 200, datos: await revisarVinculo(db, config, { usuarioId: usuario.id, adaptador }) };
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/telegram/vincular/confirmar', async ({ db, req, usuario }) => {
    necesitaConfig();
    contar(topes.confirmar, usuario);
    let datos;
    try { datos = await leerJson(req, 1024); } catch (error) { throw error instanceof ErrorHttp ? error : new ErrorHttp(400, 'datos_no_validos'); }
    try {
      const r = await confirmarVinculo(db, config, { codigo: textoDe(datos, 'codigo').slice(0, 20), usuarioId: usuario.id, adaptador });
      if (r?.estado === 'vinculado') anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'telegram_unir' });
      return { codigo: 200, datos: r };
    } catch (error) {
      if (error instanceof ErrorCanal && error.clave === 'codigo_no_coincide') throw new ErrorHttp(400, 'codigo_no_coincide', { quedan: error.quedan ?? null });
      throw deCanal(error);
    }
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/telegram/vincular/cancelar', ({ db, usuario }) => {
    contar(topes.desvincular, usuario);
    return { codigo: 200, datos: cancelarVinculo(db, { usuarioId: usuario.id }) };
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/telegram/prueba', async ({ db, usuario }) => {
    necesitaConfig();
    contar(topes.prueba, usuario);
    try {
      return { codigo: 200, datos: await mandarPrueba(db, config, { usuarioId: usuario.id, adaptador }) };
    } catch (error) {
      throw deCanal(error);
    }
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/telegram/desvincular', ({ db, usuario }) => {
    contar(topes.desvincular, usuario);
    desvincular(db, { usuarioId: usuario.id, origen: 'pantalla' });
    anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'telegram_dejar' });
    return { codigo: 200, datos: { chat: { estado: 'desvinculado' } } };
  }, { admin: true, soloDueno: true });
}
