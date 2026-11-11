// Rutas de cuentas: crear el primer administrador, entrar, salir, cambiar la clave y administrar usuarios.
// Las respuestas de error llevan una CLAVE (por ejemplo 'credenciales'); las pantallas la traducen.
// Los textos que llegan se leen con textoDe: un valor que no es texto se responde con 400, nunca con 500.
import { ajustesAcademia } from '../academia/progreso.js';
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { Limitador } from '../nucleo/limites.js';
import { createHash } from 'node:crypto';
import { vieneDeTailscale } from '../nucleo/red.js';
import { hashClave, verificarClave, problemaDeClave, claveTemporal } from '../cuentas/claves.js';
import { crearSesion, cerrarSesion, cerrarTodas, textoGalleta } from '../cuentas/sesiones.js';
import {
  NOMBRE_VALIDO, auditar, hayAdmin, crearPrimerAdmin, crearUsuario, buscarPorNombre, buscarPorId,
  listarUsuarios, guardarClave, ponerActivo, ponerIdioma, registrarAcceso, cuantosAdminsActivos,
  avisarClaveReiniciada, avisosSinVer, marcarAvisosVistos, reiniciosDeClave, reiniciosRecientes,
} from '../cuentas/usuarios.js';
import { cambiarPlan, planesPublicos } from '../cuentas/planes.js';
import { duenoDeTailscale, exigirDueno } from '../cuentas/tailscale.js';
import { leerConfigIa, algunTopeDePlan } from '../ia/config.js';
import { anotarConfianza, cuentaConfirmada, seguirConfianza, estadoConfianza, ponerPermisoIa } from '../cuentas/confianza.js';

const IDIOMAS = new Set(['es', 'en']);

const QUINCE_MINUTOS = 15 * 60 * 1000;

export function crearLimitesCuentas() {
  return {
    entrarPorCliente: new Limitador({ maximo: 10, ventanaMs: QUINCE_MINUTOS }),
    // 5 contraseñas malas para una cuenta desde un mismo lugar: ese lugar espera 15 minutos.
    fallosPorCuentaYLugar: new Limitador({ maximo: 5, ventanaMs: QUINCE_MINUTOS }),
    // Contando todos los lugares de internet juntos (ataques repartidos). Quien entra por Tailscale no
    // cuenta aquí ni queda frenado por esto: así el dueño siempre puede entrar desde sus equipos.
    fallosPorCuentaDesdeInternet: new Limitador({ maximo: 20, ventanaMs: QUINCE_MINUTOS }),
    cambioDeClave: new Limitador({ maximo: 5, ventanaMs: QUINCE_MINUTOS }),
    primerAdmin: new Limitador({ maximo: 5, ventanaMs: 60 * 60 * 1000 }),
  };
}

// La cuenta se identifica por su nombre y una huella de su contraseña guardada. Si el administrador o la
// herramienta de rescate ponen una contraseña nueva, la huella cambia y cualquier bloqueo anterior deja de valer.
function llaveDeCuenta(nombre, usuario) {
  const huella = usuario ? createHash('sha256').update(usuario.clave_hash).digest('hex').slice(0, 16) : '-';
  return `${nombre}|${huella}`;
}

function nombreDe(datos) {
  const nombre = textoDe(datos, 'nombre').trim();
  if (!NOMBRE_VALIDO.test(nombre)) throw new ErrorHttp(400, 'nombre_no_valido');
  return nombre;
}

function idiomaDe(datos, porDefecto = 'es') {
  return IDIOMAS.has(datos.idioma) ? datos.idioma : porDefecto;
}

// El nombre completo que escribió el administrador («Juan Pérez»): espacios normales y hasta 80 letras.
function nombreVisibleDe(datos) {
  const valor = datos.nombreVisible;
  if (valor == null || valor === '') return null;
  if (typeof valor !== 'string') throw new ErrorHttp(400, 'datos_no_validos');
  return valor.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
}

function usuarioPublico(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    nombreVisible: u.nombreVisible || u.nombre_visible || u.nombre,
    rol: u.rol,
    idioma: u.idioma,
    debeCambiarClave: Boolean(u.debeCambiarClave ?? u.debe_cambiar_clave === 1),
  };
}

function avisosParaLaPantalla(db, usuario) {
  const avisos = avisosSinVer(db, usuario.id);
  return { usuario: usuarioPublico(usuario), avisos, reiniciosRecientes: avisos.length ? reiniciosRecientes(db, usuario.id) : [] };
}

// La puerta de arranque: los primeros 90 s después de encender el servicio, /api/setup responde 503
// «arrancando» hasta que el trabajo automático avisa que está listo (o, si falló 3 veces al arrancar, hasta que
// se acaba ese rato). Así el actualizador del servidor ve el 503 y vuelve SOLO a la versión anterior del código
// (nunca de los datos) si una versión nueva trae un trabajador que no arranca. Contesta enseguida, sin esperar
// a nada, y no dice nada de la fila ni del modo seguro.
function arrancando(supervisor) {
  try {
    const estado = supervisor?.estadoArranque?.();
    return estado === 'arrancando' || estado === 'fallido';
  } catch {
    return false;
  }
}

// Fase 1, parte d. Mientras alguna cuenta pueda gastar IA (un plan con tope mayor que 0), lo que da acceso a ese dinero
// (crear una cuenta, cambiar su plan, reiniciar su contraseña o volver a activarla) solo se hace desde la red de
// Tailscale: con una contraseña de administrador robada, por el enlace público, nadie puede multiplicar las cuentas que
// gastan hasta llenar el tope general. Con todos los topes de plan en US$0 (lo que trae OPORTIA) no cambia nada.
function cuentasDesdeAqui(db, req) {
  return vieneDeTailscale(req).si || !algunTopeDePlan(leerConfigIa(db));
}
function exigirCuentasDesdeAqui(db, req) {
  if (!cuentasDesdeAqui(db, req)) throw new ErrorHttp(403, 'cuentas_solo_tailnet');
}
// Ronda 5 de revisión: lo de arriba solo mira los topes de AHORA. Por eso cada uno de esos cambios, además, queda anotado
// con de dónde vino (src/cuentas/confianza.js): una cuenta tocada desde internet no gasta IA (aunque el dueño ponga un
// tope de plan más adelante) hasta que el dueño, desde su cuenta de Tailscale, le da permiso.
function anotarOrigen(db, req, { usuarioId, accion, hechoPor }) {
  anotarConfianza(db, { usuarioId, accion, desdeTailnet: vieneDeTailscale(req).si, hechoPor });
}

export function registrarRutasCuentas(rutas, { version, limites = crearLimitesCuentas(), supervisor = null } = {}) {
  rutas.agregar('GET', '/api/setup', ({ db, req }) => {
    if (arrancando(supervisor)) {
      return { codigo: 503, datos: { app: 'oportia', estado: 'arrancando', version, error: 'arrancando' }, cabeceras: { 'Retry-After': '1' } };
    }
    const necesitaAdmin = !hayAdmin(db);
    return {
      codigo: 200,
      datos: {
        app: 'oportia',
        estado: 'en construcción',
        version,
        base: { estado: 'ok', version: db.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v ?? 0 },
        necesitaAdmin,
        puedeCrearAdmin: necesitaAdmin && vieneDeTailscale(req).si,
        // Academia (0.7.0): el nombre de la app (lo cambia el administrador), también para la pantalla de entrar.
        nombreApp: ajustesAcademia(db).nombre,
      },
    };
  }, { publica: true });

  rutas.agregar('POST', '/api/primer-admin', async ({ db, req, cliente, https }) => {
    const tailscale = vieneDeTailscale(req);
    if (!tailscale.si) throw new ErrorHttp(403, 'solo_desde_tailscale');
    const datos = await leerJson(req);
    // Un error al escribir (nombre o contraseña no válidos) no cuenta como intento.
    const nombre = nombreDe(datos);
    const problema = problemaDeClave(datos.clave, [nombre]);
    if (problema) throw new ErrorHttp(400, problema);
    if (hayAdmin(db)) throw new ErrorHttp(409, 'ya_existe_admin');
    if (!limites.primerAdmin.permitir(cliente)) throw new ErrorHttp(429, 'demasiados_intentos_una_hora');
    const id = crearPrimerAdmin(db, { nombre, claveHash: await hashClave(datos.clave), idioma: idiomaDe(datos), tailscaleLogin: tailscale.login });
    if (!id) throw new ErrorHttp(409, 'ya_existe_admin');
    const sesion = crearSesion(db, id, req.headers['user-agent']);
    registrarAcceso(db, id);
    return { codigo: 201, datos: { usuario: usuarioPublico(buscarPorId(db, id)) }, cabeceras: { 'Set-Cookie': textoGalleta(sesion.token, { segura: https }) } };
  }, { publica: true });

  rutas.agregar('POST', '/api/entrar', async ({ db, req, cliente, https }) => {
    if (!limites.entrarPorCliente.permitir(cliente)) throw new ErrorHttp(429, 'demasiados_intentos');
    const datos = await leerJson(req);
    const nombre = textoDe(datos, 'nombre').trim().toLowerCase().slice(0, 40);
    const clave = textoDe(datos, 'clave');
    const usuario = nombre ? buscarPorNombre(db, nombre) : null;
    const cuenta = llaveDeCuenta(nombre, usuario);
    const lugar = `${cuenta}|${cliente}`;
    const desdeInternet = !vieneDeTailscale(req).si;
    if (limites.fallosPorCuentaYLugar.bloqueado(lugar) || (desdeInternet && limites.fallosPorCuentaDesdeInternet.bloqueado(cuenta))) {
      throw new ErrorHttp(429, 'cuenta_bloqueada_un_rato');
    }
    // El intento se aparta ANTES de calcular la contraseña: así muchos pedidos a la vez no se saltan el límite.
    limites.fallosPorCuentaYLugar.permitir(lugar);
    if (desdeInternet) limites.fallosPorCuentaDesdeInternet.permitir(cuenta);
    const correcta = await verificarClave(clave, usuario?.clave_hash);
    if (!usuario || !correcta || usuario.activo !== 1) {
      auditar(db, { usuarioId: usuario?.id ?? null, accion: 'entrada_fallida', detalle: nombre });
      throw new ErrorHttp(401, 'credenciales');
    }
    limites.fallosPorCuentaYLugar.olvidar(lugar);
    if (desdeInternet) limites.fallosPorCuentaDesdeInternet.descontar(cuenta);
    const sesion = crearSesion(db, usuario.id, req.headers['user-agent']);
    registrarAcceso(db, usuario.id);
    auditar(db, { usuarioId: usuario.id, accion: 'entrada' });
    // «avisos»: por ejemplo, que el administrador reinició su contraseña. La pantalla los muestra y luego avisa
    // que ya se vieron (POST /api/yo/avisos/vistos); hasta entonces se siguen mostrando. Junto a ellos van los
    // reinicios recientes, también los ya vistos (ver usuarios.js): así nadie puede «tapar» un reinicio que la dueña no pidió.
    return {
      codigo: 200,
      datos: avisosParaLaPantalla(db, usuario),
      cabeceras: { 'Set-Cookie': textoGalleta(sesion.token, { segura: https }) },
    };
  }, { publica: true });

  rutas.agregar('POST', '/api/salir', ({ db, token, https }) => {
    cerrarSesion(db, token);
    return { codigo: 200, datos: { ok: true }, cabeceras: { 'Set-Cookie': textoGalleta('', { segura: https, borrar: true }) } };
  }, { permitirConClaveTemporal: true });

  rutas.agregar('GET', '/api/yo', ({ db, usuario }) => ({ codigo: 200, datos: avisosParaLaPantalla(db, usuario) }),
    { permitirConClaveTemporal: true });

  // La pantalla ya mostró los avisos hasta este número: quedan como vistos (no se borran).
  // Con la contraseña temporal NO se puede: quien entra con ella puede ser otra persona (el que la reinició),
  // y el aviso tiene que seguir esperando a la dueña de la cuenta.
  rutas.agregar('POST', '/api/yo/avisos/vistos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!Number.isSafeInteger(datos.hasta) || datos.hasta < 1) throw new ErrorHttp(400, 'datos_no_validos');
    marcarAvisosVistos(db, usuario.id, datos.hasta);
    return { codigo: 200, datos: { ok: true } };
  });

  // Para Configuración: cada vez que el administrador reinició la contraseña de esta cuenta.
  rutas.agregar('GET', '/api/yo/reinicios', ({ db, usuario }) => ({ codigo: 200, datos: { reinicios: reiniciosDeClave(db, usuario.id) } }),
    { permitirConClaveTemporal: true });

  rutas.agregar('POST', '/api/yo/clave', async ({ db, req, usuario, token, https }) => {
    const datos = await leerJson(req);
    const fila = buscarPorId(db, usuario.id);
    // Con una sesión abierta tampoco se puede adivinar la contraseña: 5 fallos cierran esta sesión.
    const llave = llaveDeCuenta(fila.nombre, fila);
    if (!limites.cambioDeClave.permitir(llave)) {
      cerrarSesion(db, token);
      return { codigo: 429, datos: { error: 'demasiados_intentos_clave' }, cabeceras: { 'Set-Cookie': textoGalleta('', { segura: https, borrar: true }) } };
    }
    if (!(await verificarClave(textoDe(datos, 'actual'), fila.clave_hash))) throw new ErrorHttp(400, 'clave_actual_incorrecta');
    limites.cambioDeClave.olvidar(llave);
    const problema = problemaDeClave(datos.nueva, [fila.nombre, fila.nombre_visible]);
    if (problema) throw new ErrorHttp(400, problema);
    if (datos.nueva === datos.actual) throw new ErrorHttp(400, 'clave_igual');
    const claveHash = await hashClave(datos.nueva);
    // El permiso de IA que tenía la cuenta (si lo tenía) sigue: la persona sabía su contraseña actual.
    enTransaccion(db, () => {
      const teniaPermiso = cuentaConfirmada(db, usuario.id);
      guardarClave(db, usuario.id, claveHash, { debeCambiarClave: false });
      seguirConfianza(db, { usuarioId: usuario.id, teniaPermiso, desdeTailnet: vieneDeTailscale(req).si });
      cerrarTodas(db, usuario.id, token);
      auditar(db, { usuarioId: usuario.id, accion: 'clave_cambiada' });
    });
    return { codigo: 200, datos: { ok: true } };
  }, { permitirConClaveTemporal: true });

  rutas.agregar('POST', '/api/yo/idioma', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!IDIOMAS.has(datos.idioma)) throw new ErrorHttp(400, 'idioma_no_valido');
    ponerIdioma(db, usuario.id, datos.idioma);
    return { codigo: 200, datos: { ok: true } };
  }, { permitirConClaveTemporal: true });

  // permisos: qué se puede hacer desde esta entrada (la pantalla solo muestra los botones que sirven).
  //  - cuentas: crear cuentas, cambiar planes, reiniciar contraseñas y volver a activar (ver cuentasDesdeAqui).
  //  - admins: crear un administrador, o reiniciar, desactivar o activar a otro: solo el dueño, desde su cuenta de Tailscale.
  rutas.agregar('GET', '/api/admin/usuarios', ({ db, req, usuario }) => ({
    codigo: 200,
    datos: {
      // ia (solo de las cuentas comunes): si puede gastar IA y de dónde vino su último cambio (src/cuentas/confianza.js).
      usuarios: listarUsuarios(db).map(u => (u.rol === 'admin' ? u : { ...u, ia: estadoConfianza(db, u.id) })),
      planes: planesPublicos(),
      permisos: { cuentas: cuentasDesdeAqui(db, req), admins: duenoDeTailscale(db, req, usuario).si },
    },
  }), { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const nombre = nombreDe(datos);
    const nombreVisible = nombreVisibleDe(datos);
    const rol = datos.rol === 'admin' ? 'admin' : 'usuario';
    // Otro administrador solo lo crea el dueño, desde su cuenta de Tailscale (nunca por el enlace público).
    if (rol === 'admin') exigirDueno(db, req, usuario);
    else exigirCuentasDesdeAqui(db, req);
    // Si el nombre ya existe, se responde antes de calcular nada (la pantalla propone otro: juan.perez2…).
    if (buscarPorNombre(db, nombre)) throw new ErrorHttp(409, 'nombre_ocupado');
    const temporal = claveTemporal();
    const claveHash = await hashClave(temporal);
    const id = enTransaccion(db, () => {
      const nuevo = crearUsuario(db, { nombre, nombreVisible, claveHash, rol, idioma: idiomaDe(datos), creadoPor: usuario.id });
      if (nuevo && rol === 'usuario') anotarOrigen(db, req, { usuarioId: nuevo, accion: 'creada', hechoPor: usuario.id });
      return nuevo;
    });
    if (!id) throw new ErrorHttp(409, 'nombre_ocupado');
    return { codigo: 201, datos: { id, nombre, nombreVisible: nombreVisible ?? nombre, rol, claveTemporal: temporal } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/reiniciar-clave', async ({ db, req, parametros, usuario }) => {
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    // Entrar a la cuenta de otro administrador (o a una que puede gastar IA) tiene las mismas protecciones que crearla.
    if (destino.rol === 'admin') exigirDueno(db, req, usuario);
    else exigirCuentasDesdeAqui(db, req);
    const temporal = claveTemporal();
    const claveHash = await hashClave(temporal);
    // Todo junto o nada: la clave nueva, sus sesiones cerradas, el aviso para la persona y la auditoría.
    enTransaccion(db, () => {
      guardarClave(db, destino.id, claveHash, { debeCambiarClave: true });
      if (destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'clave_reiniciada', hechoPor: usuario.id });
      cerrarTodas(db, destino.id);
      avisarClaveReiniciada(db, destino.id);
      auditar(db, { usuarioId: usuario.id, accion: 'clave_reiniciada', detalle: destino.nombre });
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, claveTemporal: temporal } };
  }, { admin: true });

  // «Proyectos permitidos»: el plan de la cuenta (prueba = 1, pago = 5, empresarial = 20). Nunca por debajo de los
  // proyectos que ya tiene en uso: en ese caso no cambia nada y se responde un error claro.
  rutas.agregar('POST', '/api/admin/usuarios/:id/plan', async ({ db, req, parametros, usuario }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    exigirCuentasDesdeAqui(db, req);
    const r = cambiarPlan(db, {
      usuario: destino,
      plan: datos.plan,
      alCambiar: (antes, ahora) => {
        auditar(db, { usuarioId: usuario.id, accion: 'plan_cambiado', detalle: `${destino.nombre}: ${antes} -> ${ahora}` });
        if (destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'plan', hechoPor: usuario.id });
      },
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, plan: r.ahora, proyectosPermitidos: r.limite } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/activo', async ({ db, req, parametros, usuario }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    const activo = datos.activo === true;
    if (!activo && destino.id === usuario.id) throw new ErrorHttp(400, 'no_puedes_desactivarte');
    // A otro administrador solo lo desactiva o lo activa el dueño. Desactivar una cuenta común se puede desde cualquier
    // entrada (protege); volver a activarla le devuelve su presupuesto de IA: las mismas protecciones que crearla.
    if (destino.rol === 'admin') exigirDueno(db, req, usuario);
    else if (activo) exigirCuentasDesdeAqui(db, req);
    if (!activo && destino.rol === 'admin' && cuantosAdminsActivos(db) <= 1) throw new ErrorHttp(400, 'ultimo_admin');
    enTransaccion(db, () => {
      ponerActivo(db, destino.id, activo);
      // Volver a activar una cuenta común queda anotado (solo si de verdad estaba desactivada).
      if (activo && destino.activo !== 1 && destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'activada', hechoPor: usuario.id });
      if (!activo) cerrarTodas(db, destino.id);
      auditar(db, { usuarioId: usuario.id, accion: activo ? 'usuario_activado' : 'usuario_desactivado', detalle: destino.nombre });
    });
    return { codigo: 200, datos: { ok: true } };
  }, { admin: true });

  // Ronda 5 de revisión: el permiso de IA de una cuenta común. Darlo solo lo hace el dueño, desde su cuenta de Tailscale
  // (la pantalla le muestra antes cuándo y desde dónde se tocó la cuenta por última vez). Quitarlo protege: se puede desde
  // cualquier entrada. Las dos cosas quedan en la auditoría.
  rutas.agregar('POST', '/api/admin/usuarios/:id/ia', async ({ db, req, parametros, usuario }) => {
    const datos = await leerJson(req);
    if (typeof datos.permitida !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    if (destino.rol !== 'usuario') throw new ErrorHttp(400, 'datos_no_validos');
    if (datos.permitida) {
      exigirDueno(db, req, usuario);
      if (destino.activo !== 1) throw new ErrorHttp(409, 'cuenta_inactiva');
    }
    enTransaccion(db, () => {
      ponerPermisoIa(db, { usuarioId: destino.id, permitida: datos.permitida, hechoPor: usuario.id, desdeTailnet: vieneDeTailscale(req).si });
      auditar(db, { usuarioId: usuario.id, accion: datos.permitida ? 'ia_cuenta_permitida' : 'ia_cuenta_retirada', detalle: destino.nombre });
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, ia: estadoConfianza(db, destino.id) } };
  }, { admin: true });
}
