// Rutas del Telegram del dueño (fase 1, parte e), en Administrador → Claves. Todas solo para el dueño, desde su cuenta de
// Tailscale (soloDueno), como las claves de la IA. El token se pega por la ruta de siempre de las claves
// (POST /api/admin/claves { uso: 'telegram_bot', valor }): estas rutas nunca lo reciben ni lo devuelven.
//  - vincular: un código de 8 cifras de un solo uso (10 min) para mandárselo al bot desde el chat privado del dueño.
//  - vincular/revisar: la pantalla pregunta cada 3 s; el servidor le pregunta a Telegram como mucho una vez cada 3 s.
//  - prueba: un mensaje de prueba (suena). desvincular: deja de usar ese chat (la fila queda; nada se borra).
import { ErrorHttp } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { ErrorCanal, empezarVinculo, revisarVinculo, mandarPrueba, desvincular } from '../canales/canales.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;

export function crearLimitesCanales() {
  return {
    vincular: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
    revisar: new Limitador({ maximo: 400, ventanaMs: DIEZ_MINUTOS }),
    prueba: new Limitador({ maximo: 5, ventanaMs: DIEZ_MINUTOS }),
    desvincular: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
  };
}

const deCanal = error => (error instanceof ErrorCanal ? new ErrorHttp(error.http, error.clave) : error);

export function registrarRutasCanales(rutas, { config = null, limites = {}, adaptador = undefined } = {}) {
  const topes = { ...crearLimitesCanales(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'almacen_no_disponible'); };
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };

  rutas.agregar('POST', '/api/admin/telegram/vincular', async ({ db, usuario }) => {
    necesitaConfig();
    contar(topes.vincular, usuario);
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
    return { codigo: 200, datos: { chat: { estado: 'desvinculado' } } };
  }, { admin: true, soloDueno: true });
}
