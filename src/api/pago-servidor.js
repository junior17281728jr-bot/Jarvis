// 0.14.1: Administrador → Sistema → «Pago del servidor» (src/avisos/pago-servidor.js). Todo solo del administrador
// (401 sin sesión, 403 para un alumno).
//  - GET  /api/admin/servidor-pago          lo guardado, el próximo pago (fecha, días, color) y los enlaces de DigitalOcean.
//  - POST /api/admin/servidor-pago          { montoUsd?, dia?, metodo?, automatico? } guarda lo que venga.
//  - POST /api/admin/servidor-pago/pagado   { deshacer? } «Marcar como pagado este mes» (o deshacerlo).
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { estadoPago, guardarAjustesPago, marcarPagado } from '../avisos/pago-servidor.js';

export function registrarRutasPagoServidor(rutas, { reloj = Date.now, limites = {} } = {}) {
  const topes = { cambios: new Limitador({ maximo: 60, ventanaMs: 10 * 60_000 }), ...limites };
  const contar = usuario => { if (!topes.cambios.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };

  rutas.agregar('GET', '/api/admin/servidor-pago', ({ db }) => ({ codigo: 200, datos: estadoPago(db, reloj()) }), { admin: true });
  rutas.agregar('POST', '/api/admin/servidor-pago', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(usuario);
    const pedido = {};
    for (const campo of ['montoUsd', 'dia', 'metodo', 'automatico']) if (Object.hasOwn(datos ?? {}, campo)) pedido[campo] = datos[campo];
    guardarAjustesPago(db, pedido, { usuarioId: usuario.id, ahora: reloj() });
    return { codigo: 200, datos: estadoPago(db, reloj()) };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/servidor-pago/pagado', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    contar(usuario);
    marcarPagado(db, { deshacer: datos?.deshacer === true, usuarioId: usuario.id, ahora: reloj() });
    return { codigo: 200, datos: estadoPago(db, reloj()) };
  }, { admin: true });
}
