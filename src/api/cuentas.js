// Rutas de cuentas: crear el primer administrador, entrar, salir, cambiar la clave y administrar usuarios.
// Las respuestas de error llevan una CLAVE (por ejemplo 'credenciales'); las pantallas la traducen.
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { createHash } from 'node:crypto';
import { vieneDeTailscale } from '../nucleo/red.js';
import { hashClave, verificarClave, claveValida, claveTemporal } from '../cuentas/claves.js';
import { crearSesion, cerrarSesion, cerrarTodas, textoGalleta } from '../cuentas/sesiones.js';
import {
  NOMBRE_VALIDO, auditar, hayAdmin, crearPrimerAdmin, crearUsuario, buscarPorNombre, buscarPorId,
  listarUsuarios, guardarClave, ponerActivo, ponerIdioma, registrarAcceso, cuantosAdminsActivos,
} from '../cuentas/usuarios.js';

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
  const nombre = String(datos.nombre || '').trim();
  if (!NOMBRE_VALIDO.test(nombre)) throw new ErrorHttp(400, 'nombre_no_valido');
  return nombre;
}

function idiomaDe(datos, porDefecto = 'es') {
  return IDIOMAS.has(datos.idioma) ? datos.idioma : porDefecto;
}

function usuarioPublico(u) {
  return { id: u.id, nombre: u.nombre, rol: u.rol, idioma: u.idioma, debeCambiarClave: Boolean(u.debeCambiarClave ?? u.debe_cambiar_clave === 1) };
}

export function registrarRutasCuentas(rutas, { version, limites = crearLimitesCuentas() } = {}) {
  rutas.agregar('GET', '/api/setup', ({ db, req }) => {
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
      },
    };
  }, { publica: true });

  rutas.agregar('POST', '/api/primer-admin', async ({ db, req, cliente, https }) => {
    const tailscale = vieneDeTailscale(req);
    if (!tailscale.si) throw new ErrorHttp(403, 'solo_desde_tailscale');
    const datos = await leerJson(req);
    // Un error al escribir (nombre o contraseña no válidos) no cuenta como intento.
    const nombre = nombreDe(datos);
    if (!claveValida(datos.clave)) throw new ErrorHttp(400, 'clave_corta');
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
    const nombre = String(datos.nombre || '').trim().toLowerCase().slice(0, 40);
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
    const correcta = await verificarClave(String(datos.clave || ''), usuario?.clave_hash);
    if (!usuario || !correcta || usuario.activo !== 1) {
      auditar(db, { usuarioId: usuario?.id ?? null, accion: 'entrada_fallida', detalle: nombre });
      throw new ErrorHttp(401, 'credenciales');
    }
    limites.fallosPorCuentaYLugar.olvidar(lugar);
    if (desdeInternet) limites.fallosPorCuentaDesdeInternet.descontar(cuenta);
    const sesion = crearSesion(db, usuario.id, req.headers['user-agent']);
    registrarAcceso(db, usuario.id);
    auditar(db, { usuarioId: usuario.id, accion: 'entrada' });
    return { codigo: 200, datos: { usuario: usuarioPublico(usuario) }, cabeceras: { 'Set-Cookie': textoGalleta(sesion.token, { segura: https }) } };
  }, { publica: true });

  rutas.agregar('POST', '/api/salir', ({ db, token, https }) => {
    cerrarSesion(db, token);
    return { codigo: 200, datos: { ok: true }, cabeceras: { 'Set-Cookie': textoGalleta('', { segura: https, borrar: true }) } };
  }, { permitirConClaveTemporal: true });

  rutas.agregar('GET', '/api/yo', ({ usuario }) => ({ codigo: 200, datos: { usuario: usuarioPublico(usuario) } }), { permitirConClaveTemporal: true });

  rutas.agregar('POST', '/api/yo/clave', async ({ db, req, usuario, token, https }) => {
    const datos = await leerJson(req);
    const fila = buscarPorId(db, usuario.id);
    // Con una sesión abierta tampoco se puede adivinar la contraseña: 5 fallos cierran esta sesión.
    const llave = llaveDeCuenta(fila.nombre, fila);
    if (!limites.cambioDeClave.permitir(llave)) {
      cerrarSesion(db, token);
      return { codigo: 429, datos: { error: 'demasiados_intentos_clave' }, cabeceras: { 'Set-Cookie': textoGalleta('', { segura: https, borrar: true }) } };
    }
    if (!(await verificarClave(String(datos.actual || ''), fila.clave_hash))) throw new ErrorHttp(400, 'clave_actual_incorrecta');
    limites.cambioDeClave.olvidar(llave);
    if (!claveValida(datos.nueva)) throw new ErrorHttp(400, 'clave_corta');
    if (datos.nueva === datos.actual) throw new ErrorHttp(400, 'clave_igual');
    guardarClave(db, usuario.id, await hashClave(datos.nueva), { debeCambiarClave: false });
    cerrarTodas(db, usuario.id, token);
    auditar(db, { usuarioId: usuario.id, accion: 'clave_cambiada' });
    return { codigo: 200, datos: { ok: true } };
  }, { permitirConClaveTemporal: true });

  rutas.agregar('POST', '/api/yo/idioma', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!IDIOMAS.has(datos.idioma)) throw new ErrorHttp(400, 'idioma_no_valido');
    ponerIdioma(db, usuario.id, datos.idioma);
    return { codigo: 200, datos: { ok: true } };
  }, { permitirConClaveTemporal: true });

  rutas.agregar('GET', '/api/admin/usuarios', ({ db }) => ({ codigo: 200, datos: { usuarios: listarUsuarios(db) } }), { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const nombre = nombreDe(datos);
    const rol = datos.rol === 'admin' ? 'admin' : 'usuario';
    const temporal = claveTemporal();
    const id = crearUsuario(db, { nombre, claveHash: await hashClave(temporal), rol, idioma: idiomaDe(datos), creadoPor: usuario.id });
    if (!id) throw new ErrorHttp(409, 'nombre_ocupado');
    return { codigo: 201, datos: { id, nombre, rol, claveTemporal: temporal } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/reiniciar-clave', async ({ db, parametros, usuario }) => {
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    const temporal = claveTemporal();
    guardarClave(db, destino.id, await hashClave(temporal), { debeCambiarClave: true });
    cerrarTodas(db, destino.id);
    auditar(db, { usuarioId: usuario.id, accion: 'clave_reiniciada', detalle: destino.nombre });
    return { codigo: 200, datos: { id: destino.id, nombre: destino.nombre, claveTemporal: temporal } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/activo', async ({ db, req, parametros, usuario }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    const activo = datos.activo === true;
    if (!activo && destino.id === usuario.id) throw new ErrorHttp(400, 'no_puedes_desactivarte');
    if (!activo && destino.rol === 'admin' && cuantosAdminsActivos(db) <= 1) throw new ErrorHttp(400, 'ultimo_admin');
    ponerActivo(db, destino.id, activo);
    if (!activo) cerrarTodas(db, destino.id);
    auditar(db, { usuarioId: usuario.id, accion: activo ? 'usuario_activado' : 'usuario_desactivado', detalle: destino.nombre });
    return { codigo: 200, datos: { ok: true } };
  }, { admin: true });
}
