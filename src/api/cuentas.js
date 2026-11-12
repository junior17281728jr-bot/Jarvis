// Rutas de cuentas: crear el primer administrador, entrar, salir, cambiar la clave y administrar usuarios.
// Las respuestas de error llevan una CLAVE (por ejemplo 'credenciales'); las pantallas la traducen.
// Los textos que llegan se leen con textoDe: un valor que no es texto se responde con 400, nunca con 500.
import { ajustesAcademia } from '../academia/progreso.js';
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { Limitador } from '../nucleo/limites.js';
import { createHash } from 'node:crypto';
import { vieneDeTailscale } from '../nucleo/red.js';
import { hashClave, verificarClave, problemaDeClave, claveTemporal, clavePendiente, esPendiente } from '../cuentas/claves.js';
import { crearSesion, cerrarSesion, cerrarTodas, textoGalleta } from '../cuentas/sesiones.js';
import {
  NOMBRE_VALIDO, auditar, hayAdmin, crearPrimerAdmin, crearUsuario, buscarPorNombre, buscarPorId,
  listarUsuarios, guardarClave, ponerActivo, ponerIdioma, registrarAcceso, cuantosAdminsActivos,
  avisarClaveReiniciada, avisarCuenta, avisosSinVer, marcarAvisosVistos, reiniciosDeClave, reiniciosRecientes,
} from '../cuentas/usuarios.js';
import { cambiarPlan, planesPublicos } from '../cuentas/planes.js';
import { anotarCambioAdmin, historialAdmin } from '../cuentas/confirmar.js';
import { leerPerfil, avataresDe } from '../cuentas/perfil.js';
import { estadoTerminos, nombresLegales, ponerNombreLegal } from '../cuentas/terminos.js';
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
  // 0.9.0: con su avatar (Configuración → Mi perfil), para la barra de arriba.
  // 0.9.2: «terminos»: si le falta aceptar la versión en uso (la pantalla no deja seguir sin aceptar).
  return { usuario: { ...usuarioPublico(usuario), avatar: leerPerfil(db, usuario.id).avatar }, terminos: estadoTerminos(db, usuario.id), avisos, reiniciosRecientes: avisos.some(a => a.tipo === 'clave_reiniciada') ? reiniciosRecientes(db, usuario.id) : [] };
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

// 0.12.3 (pedido del dueño): el administrador, con su sesión, administra las cuentas también por el enlace público (antes,
// mientras alguna cuenta podía gastar IA, crear, cambiar planes, reiniciar contraseñas y volver a activar era solo desde
// Tailscale). Lo delicado (la contraseña de otra persona, crear o tocar a otro administrador) pide su contraseña otra vez
// en ese pedido (confirmar(), src/cuentas/confirmar.js) y deja un aviso y una línea en la auditoría.
// Ronda 5 de revisión (sigue): cada cambio queda anotado con de dónde vino (src/cuentas/confianza.js). 0.12.3: lo que hace
// el administrador con su sesión (reiniciar o poner una contraseña, cambiar el plan, bloquear y desbloquear) NO le quita a
// la cuenta el «Permitir IA» que ya tenía (teniaPermiso: cuentaConfirmada ANTES del cambio); una cuenta nueva creada
// desde internet sigue empezando sin él hasta que el administrador lo da (también por el enlace público).
function anotarOrigen(db, req, { usuarioId, accion, hechoPor, teniaPermiso = false }) {
  const desdeTailnet = vieneDeTailscale(req).si;
  anotarConfianza(db, { usuarioId, accion, desdeTailnet, confiable: desdeTailnet || teniaPermiso === true, hechoPor });
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
    // 0.9.2: una cuenta creada sin contraseña: la persona crea la suya (POST /api/crear-clave). Bloqueada: lo dice.
    if (usuario && esPendiente(usuario.clave_hash)) throw new ErrorHttp(usuario.activo === 1 ? 409 : 403, usuario.activo === 1 ? 'crear_clave' : 'cuenta_bloqueada');
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
    // 0.9.2: con la contraseña correcta, una cuenta bloqueada (desactivada) lo dice: «habla con el administrador».
    if (usuario && correcta && usuario.activo !== 1) {
      limites.fallosPorCuentaYLugar.olvidar(lugar);
      if (desdeInternet) limites.fallosPorCuentaDesdeInternet.descontar(cuenta);
      auditar(db, { usuarioId: usuario.id, accion: 'entrada_bloqueada', detalle: nombre });
      throw new ErrorHttp(403, 'cuenta_bloqueada');
    }
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

  // 0.9.2: la primera vez de una cuenta creada sin contraseña: la persona pone la suya (4 o más) y entra.
  // La primera que llega con ese usuario se la queda: por eso el administrador avisa a la persona enseguida.
  rutas.agregar('POST', '/api/crear-clave', async ({ db, req, cliente, https }) => {
    if (!limites.entrarPorCliente.permitir(cliente)) throw new ErrorHttp(429, 'demasiados_intentos');
    const datos = await leerJson(req);
    const nombre = textoDe(datos, 'nombre').trim().toLowerCase().slice(0, 40);
    const usuario = nombre ? buscarPorNombre(db, nombre) : null;
    if (!usuario || !esPendiente(usuario.clave_hash) || usuario.rol === 'admin') throw new ErrorHttp(409, 'ya_tiene_clave');
    if (usuario.activo !== 1) throw new ErrorHttp(403, 'cuenta_bloqueada');
    const problema = problemaDeClave(datos.nueva, [usuario.nombre, usuario.nombre_visible]);
    if (problema) throw new ErrorHttp(400, problema);
    const claveHash = await hashClave(datos.nueva);
    const puesta = enTransaccion(db, () => {
      // Solo si sigue pendiente (dos a la vez: gana la primera).
      const r = db.prepare('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ? AND clave_hash = ?').run(claveHash, usuario.id, usuario.clave_hash);
      if (r.changes !== 1) return false;
      auditar(db, { usuarioId: usuario.id, accion: 'clave_creada' });
      return true;
    });
    if (!puesta) throw new ErrorHttp(409, 'ya_tiene_clave');
    const sesion = crearSesion(db, usuario.id, req.headers['user-agent']);
    registrarAcceso(db, usuario.id);
    auditar(db, { usuarioId: usuario.id, accion: 'entrada' });
    return { codigo: 200, datos: avisosParaLaPantalla(db, buscarPorId(db, usuario.id)), cabeceras: { 'Set-Cookie': textoGalleta(sesion.token, { segura: https }) } };
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
      cerrarSesion(db, token, 'bloqueo');
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
  //  - cuentas: crear cuentas, cambiar planes, reiniciar contraseñas y volver a activar.
  //  - admins: crear un administrador, o reiniciar, desactivar o activar a otro (con la contraseña otra vez).
  rutas.agregar('GET', '/api/admin/usuarios', ({ db }) => ({
    codigo: 200,
    datos: {
      // ia (solo de las cuentas comunes): si puede gastar IA y de dónde vino su último cambio (src/cuentas/confianza.js).
      // 0.9.0: avatar (el que eligió en Configuración → Mi perfil, o null).
      // 0.9.2: nombreLegal (Nombre y Apellido de verdad, el de la firma de los términos).
      usuarios: ((avatares, legales) => listarUsuarios(db).map(u => ({ ...(u.rol === 'admin' ? u : { ...u, ia: estadoConfianza(db, u.id) }), avatar: avatares.get(u.id) ?? null, nombreLegal: legales.get(u.id) ?? null })))(avataresDe(db), nombresLegales(db)),
      planes: planesPublicos(),
      // 0.12.3: siempre todo (lo delicado pide la contraseña otra vez). Se dejan los dos para las pantallas viejas.
      permisos: { cuentas: true, admins: true },
    },
  }), { admin: true });

  // 0.12.3: los últimos cambios delicados (hora, quién y qué; nunca un secreto), para Administrador → Usuarios.
  rutas.agregar('GET', '/api/admin/cambios', ({ db }) => ({ codigo: 200, datos: { cambios: historialAdmin(db, { limite: 50 }) } }), { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios', async ({ db, req, usuario, confirmar }) => {
    const datos = await leerJson(req);
    const nombre = nombreDe(datos);
    const nombreVisible = nombreVisibleDe(datos);
    const rol = datos.rol === 'admin' ? 'admin' : 'usuario';
    // Si el nombre ya existe, se responde antes de calcular nada (la pantalla propone otro: juan.perez2…).
    if (buscarPorNombre(db, nombre)) throw new ErrorHttp(409, 'nombre_ocupado');
    // 0.12.3: otro administrador, con la contraseña del que lo crea otra vez (también por el enlace público).
    const confirmado = rol === 'admin' ? await confirmar() : null;
    // 0.9.2: «sinClave»: la persona pone la suya al entrar la primera vez; «clave»: la pone el administrador. Si no,
    // como siempre: una contraseña temporal que hay que cambiar al entrar.
    const sinClave = datos.sinClave === true;
    const propia = datos.clave !== undefined && datos.clave !== null && datos.clave !== '';
    if (sinClave && propia) throw new ErrorHttp(400, 'datos_no_validos');
    // Un administrador sin contraseña lo podría tomar cualquiera desde internet: nunca.
    if (sinClave && rol === 'admin') throw new ErrorHttp(400, 'admin_sin_clave');
    if (propia) {
      const problema = problemaDeClave(datos.clave, [nombre, nombreVisible]);
      if (problema) throw new ErrorHttp(400, problema);
    }
    // 0.9.2: su Nombre y Apellido de verdad (opcional; la persona lo confirma al aceptar los términos).
    const legal = datos.nombreLegal && (datos.nombreLegal.nombre || datos.nombreLegal.apellido) ? { nombre: datos.nombreLegal.nombre, apellido: datos.nombreLegal.apellido } : null;
    const temporal = sinClave || propia ? null : claveTemporal();
    const claveHash = sinClave ? clavePendiente() : await hashClave(propia ? datos.clave : temporal);
    const id = enTransaccion(db, () => {
      const nuevo = crearUsuario(db, { nombre, nombreVisible, claveHash, rol, idioma: idiomaDe(datos), debeCambiarClave: Boolean(temporal), creadoPor: usuario.id });
      if (nuevo && rol === 'usuario') anotarOrigen(db, req, { usuarioId: nuevo, accion: 'creada', hechoPor: usuario.id });
      if (nuevo && legal) ponerNombreLegal(db, nuevo, legal, { por: 'admin', hechoPor: usuario.id });
      if (nuevo && rol === 'admin') anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'admin_creado', detalle: { cuenta: nombre }, como: confirmado?.como });
      return nuevo;
    });
    if (!id) throw new ErrorHttp(409, 'nombre_ocupado');
    return { codigo: 201, datos: { id, nombre, nombreVisible: nombreVisible ?? nombre, rol, claveTemporal: temporal, pendiente: sinClave } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/reiniciar-clave', async ({ db, req, parametros, usuario, confirmar }) => {
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    // 0.12.3: la contraseña de otra persona, con la del administrador otra vez.
    const confirmado = await confirmar();
    const temporal = claveTemporal();
    const claveHash = await hashClave(temporal);
    // Todo junto o nada: la clave nueva, sus sesiones cerradas, el aviso para la persona y la auditoría.
    enTransaccion(db, () => {
      const teniaPermiso = cuentaConfirmada(db, destino.id);
      guardarClave(db, destino.id, claveHash, { debeCambiarClave: true });
      if (destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'clave_reiniciada', hechoPor: usuario.id, teniaPermiso });
      cerrarTodas(db, destino.id);
      avisarClaveReiniciada(db, destino.id);
      auditar(db, { usuarioId: usuario.id, accion: 'clave_reiniciada', detalle: destino.nombre });
      anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'clave_otro', detalle: { cuenta: destino.nombre, como: 'reiniciada' }, como: confirmado.como });
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, claveTemporal: temporal } };
  }, { admin: true });

  // 0.9.2: el administrador le pone una contraseña a alguien (la que la persona le pidió). Igual que reiniciarla: se
  // cierran sus sesiones y la persona ve el aviso; pero no tiene que cambiarla al entrar.
  rutas.agregar('POST', '/api/admin/usuarios/:id/clave', async ({ db, req, parametros, usuario, confirmar }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    // La suya, el administrador la cambia en Configuración (con la actual).
    if (destino.id === usuario.id) throw new ErrorHttp(400, 'tu_clave_en_configuracion');
    const problema = problemaDeClave(datos.clave, [destino.nombre, destino.nombre_visible]);
    if (problema) throw new ErrorHttp(400, problema);
    const confirmado = await confirmar();
    const claveHash = await hashClave(datos.clave);
    enTransaccion(db, () => {
      const teniaPermiso = cuentaConfirmada(db, destino.id);
      guardarClave(db, destino.id, claveHash, { debeCambiarClave: false });
      if (destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'clave_reiniciada', hechoPor: usuario.id, teniaPermiso });
      cerrarTodas(db, destino.id);
      avisarClaveReiniciada(db, destino.id);
      auditar(db, { usuarioId: usuario.id, accion: 'clave_puesta', detalle: destino.nombre });
      anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'clave_otro', detalle: { cuenta: destino.nombre, como: 'puesta' }, como: confirmado.como });
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre } };
  }, { admin: true });

  // «Proyectos permitidos»: el plan de la cuenta (prueba = 1, pago = 5, empresarial = 20). Nunca por debajo de los
  // proyectos que ya tiene en uso: en ese caso no cambia nada y se responde un error claro.
  rutas.agregar('POST', '/api/admin/usuarios/:id/plan', async ({ db, req, parametros, usuario }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    const teniaPermiso = cuentaConfirmada(db, destino.id);
    const r = cambiarPlan(db, {
      usuario: destino,
      plan: datos.plan,
      alCambiar: (antes, ahora) => {
        auditar(db, { usuarioId: usuario.id, accion: 'plan_cambiado', detalle: `${destino.nombre}: ${antes} -> ${ahora}` });
        if (destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'plan', hechoPor: usuario.id, teniaPermiso });
      },
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, plan: r.ahora, proyectosPermitidos: r.limite } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/activo', async ({ db, req, parametros, usuario, confirmar }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    const activo = datos.activo === true;
    if (!activo && destino.id === usuario.id) throw new ErrorHttp(400, 'no_puedes_desactivarte');
    if (!activo && destino.rol === 'admin' && cuantosAdminsActivos(db) <= 1) throw new ErrorHttp(400, 'ultimo_admin');
    // 0.12.3: bloquear o desbloquear una cuenta común, con la sesión; a otro administrador, con la contraseña otra vez.
    const confirmado = destino.rol === 'admin' ? await confirmar() : null;
    enTransaccion(db, () => {
      const teniaPermiso = cuentaConfirmada(db, destino.id);
      ponerActivo(db, destino.id, activo);
      // Volver a activar una cuenta común queda anotado (solo si de verdad estaba desactivada); bloquearla también (0.12.3).
      if (activo && destino.activo !== 1 && destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'activada', hechoPor: usuario.id, teniaPermiso });
      if (!activo && destino.activo === 1 && destino.rol === 'usuario') anotarOrigen(db, req, { usuarioId: destino.id, accion: 'desactivada', hechoPor: usuario.id, teniaPermiso });
      if (!activo) cerrarTodas(db, destino.id);
      auditar(db, { usuarioId: usuario.id, accion: activo ? 'usuario_activado' : 'usuario_desactivado', detalle: destino.nombre });
      if (destino.rol === 'admin') anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'admin_activo', detalle: { cuenta: destino.nombre, activo: activo ? 1 : 0 }, como: confirmado?.como });
    });
    return { codigo: 200, datos: { ok: true } };
  }, { admin: true });

  // Ronda 5 de revisión: el permiso de IA de una cuenta común (la pantalla muestra antes cuándo y desde dónde se tocó la
  // cuenta por última vez). 0.12.3: darlo y quitarlo, con la sesión del administrador (también por el enlace público).
  // Las dos cosas quedan en la auditoría.
  rutas.agregar('POST', '/api/admin/usuarios/:id/ia', async ({ db, req, parametros, usuario }) => {
    const datos = await leerJson(req);
    if (typeof datos.permitida !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    if (destino.rol !== 'usuario') throw new ErrorHttp(400, 'datos_no_validos');
    if (datos.permitida && destino.activo !== 1) throw new ErrorHttp(409, 'cuenta_inactiva');
    enTransaccion(db, () => {
      ponerPermisoIa(db, { usuarioId: destino.id, permitida: datos.permitida, hechoPor: usuario.id, desdeTailnet: vieneDeTailscale(req).si });
      auditar(db, { usuarioId: usuario.id, accion: datos.permitida ? 'ia_cuenta_permitida' : 'ia_cuenta_retirada', detalle: destino.nombre });
    });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, ia: estadoConfianza(db, destino.id) } };
  }, { admin: true });
}
