// Rutas de Administrador → Claves (fase 1, parte d). TODAS son solo para el administrador. 0.12.3 (pedido del dueño): con
// su sesión, también por el enlace público (antes, solo desde su cuenta de Tailscale). Pegar una clave (o el token del bot)
// y activarla o desactivarla pide su contraseña otra vez en ese pedido (confirmar(), src/cuentas/confirmar.js; desde su
// cuenta de Tailscale no) y deja un aviso y una línea en la auditoría (nunca la clave). La parte e agrega aquí el token
// del bot de Telegram (mismo almacén, mismas reglas; unir el chat y el mensaje de prueba están en src/api/canales.js).
//  - Una clave pegada se revisa (las de administrador de la cuenta y las de la suscripción nunca se guardan), se cifra,
//    se guarda (la anterior queda «reemplazada», nunca se borra) y se prueba GRATIS enseguida.
//  - Lo que vuelve es solo lo público (los últimos 4 caracteres, el estado, la última prueba): nunca la clave.
//  - Si al cambiar o desactivar una clave ya no queda un proveedor listo con la IA encendida, la IA se apaga sola
//    (iaApagada: true). Una clave nueva nunca vuelve a gastar sin un «Encender» nuevo del dueño.
//  - Sin la configuración del servidor (algunas pruebas), si el archivo que protege las claves está dañado, o si falta
//    y ya hay claves guardadas con él (ronda 2: nunca se crea otro encima): 503 almacen_no_disponible. Nada se borra.
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { GRUPOS } from '../claves/usos.js';
import { guardarSecreto, listarSecretos, activarSecreto, desactivarSecreto, estadoAlmacen } from '../claves/almacen.js';
import { probarSecreto } from '../claves/probar.js';
import { apagarSiNoQuedaProveedor, leerConfigIa } from '../ia/config.js';
import { loginDeTailscale } from '../cuentas/tailscale.js';
import { definicionUso } from '../claves/usos.js';
import { estadoTelegram, trasCambiarToken } from '../canales/canales.js';
import { anotarCambioAdmin } from '../cuentas/confirmar.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;

export function crearLimitesClaves() {
  return { acciones: new Limitador({ maximo: 20, ventanaMs: DIEZ_MINUTOS }) };
}

export function registrarRutasClaves(rutas, { config = null, limites = {}, probadores = undefined } = {}) {
  const topes = { ...crearLimitesClaves(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'almacen_no_disponible'); };
  const contar = usuario => { if (!topes.acciones.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  // Dentro de la misma transacción del cambio: si ya no queda un proveedor listo, la IA se apaga.
  // Parte e: el token del bot de Telegram no toca la IA. Cambiarlo o desactivarlo pausa los mensajes hasta que la prueba
  // gratis pase con el bot nuevo (si es OTRO bot, el chat queda desvinculado: src/canales/canales.js).
  const trasCambio = usuario => (d, { uso } = {}) => {
    if (definicionUso(uso)?.grupo === 'avisos') return { iaApagada: false, telegram: trasCambiarToken(d, { usuarioId: usuario.id }) };
    return { iaApagada: apagarSiNoQuedaProveedor(d, config, { usuarioId: usuario.id }) };
  };

  rutas.agregar('GET', '/api/admin/claves', ({ db, usuario }) => {
    necesitaConfig();
    const usos = listarSecretos(db, config);
    return {
      codigo: 200,
      datos: {
        almacen: estadoAlmacen(db, config),
        duenoTailscale: loginDeTailscale(db, usuario.id),
        grupos: GRUPOS.map(grupo => ({ grupo, usos: usos.filter(u => u.grupo === grupo).map(({ uso, proveedor, activa, anteriores }) => ({ uso, proveedor, activa, anteriores })) })),
        // Parte e: el Telegram del dueño (el bot, su chat, si hay un código esperando, los últimos mensajes). Nunca el token.
        telegram: estadoTelegram(db, config),
      },
    };
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/claves', async ({ db, req, usuario, confirmar }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    contar(usuario);
    const uso = textoDe(datos, 'uso');
    let valor = textoDe(datos, 'valor');
    let guardada;
    try {
      const confirmado = await confirmar();
      guardada = guardarSecreto(db, config, { uso, valor, usuarioId: usuario.id, trasCambio: trasCambio(usuario) });
      anotarCambioAdmin(db, { usuarioId: usuario.id, accion: definicionUso(uso)?.grupo === 'avisos' ? 'token_telegram' : 'clave_ia', detalle: { uso }, como: confirmado.como });
    } finally {
      valor = null;
      datos.valor = null;
    }
    const prueba = await probarSecreto(db, config, { id: guardada.secreto.id, usuarioId: usuario.id, probadores });
    return { codigo: 201, datos: { secreto: prueba.secreto, prueba: { motivo: prueba.motivo }, iaApagada: guardada.efecto?.iaApagada === true } };
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/claves/:id/probar', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    if (datos.reanudar != null && typeof datos.reanudar !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    contar(usuario);
    const r = await probarSecreto(db, config, { id: parametros.id, usuarioId: usuario.id, reanudar: datos.reanudar === true, probadores });
    // Ronda 4 de revisión: si se reanudó pero la IA está apagada, la pantalla lo dice y ofrece encenderla.
    return { codigo: 200, datos: { secreto: r.secreto, prueba: { motivo: r.motivo }, reanudada: r.reanudada, iaEncendida: leerConfigIa(db).encendida } };
  }, { admin: true, soloDueno: true });

  rutas.agregar('POST', '/api/admin/claves/:id/activa', async ({ db, req, usuario, parametros, confirmar }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    if (typeof datos.activa !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    contar(usuario);
    const confirmado = await confirmar();
    const cambiar = datos.activa ? activarSecreto : desactivarSecreto;
    const r = cambiar(db, config, { id: parametros.id, usuarioId: usuario.id, trasCambio: trasCambio(usuario) });
    anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'clave_ia_activa', detalle: { uso: r.secreto?.uso ?? null, activa: datos.activa ? 1 : 0 }, como: confirmado.como });
    return { codigo: 200, datos: { secreto: r.secreto, iaApagada: r.efecto?.iaApagada === true } };
  }, { admin: true, soloDueno: true });
}
