// 0.9.0: rutas del perfil propio (Configuración → Mi perfil) y la ficha de cada alumno para el administrador.
//  - /api/yo/… usan SIEMPRE la cuenta de la sesión: nadie cambia el perfil de otro.
//  - /api/admin/academia/alumnos/:id/ficha, …/intentos/:intento y /api/admin/academia/comparar/:ids llevan { admin: true }
//    (403 para los alumnos, 401 sin sesión).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { verificarClave } from '../cuentas/claves.js';
import { buscarPorId } from '../cuentas/usuarios.js';
import { perfilDe, guardarPerfil, cambiarNombreUsuario } from '../cuentas/perfil.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { fichaAlumno, intentoDeAlumno, compararAlumnos } from '../academia/fichas.js';

export function crearLimitesPerfil() {
  return {
    // Contraseñas malas al cambiar el nombre de usuario (por cuenta): 5 cada 15 minutos.
    nombreUsuario: new Limitador({ maximo: 5, ventanaMs: 15 * 60 * 1000 }),
    cambios: new Limitador({ maximo: 120, ventanaMs: 60 * 60 * 1000 }),
  };
}

export function registrarRutasPerfil(rutas, { config = null, limites = {}, reloj = Date.now } = {}) {
  const topes = { ...crearLimitesPerfil(), ...limites };
  const activo = db => {
    if (!config) throw new ErrorHttp(503, 'academia_no_disponible');
    return paqueteActivo(db, config);
  };

  // ---------- Mi perfil ----------
  rutas.agregar('GET', '/api/yo/perfil', ({ db, usuario }) => ({ codigo: 200, datos: { perfil: perfilDe(db, usuario.id) } }));

  rutas.agregar('POST', '/api/yo/perfil', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!topes.cambios.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const pedido = {};
    for (const campo of ['nombreVisible', 'avatar', 'meta']) if (Object.hasOwn(datos ?? {}, campo)) pedido[campo] = datos[campo];
    return { codigo: 200, datos: { perfil: guardarPerfil(db, usuario.id, pedido) } };
  });

  // El nombre de usuario (con el que se entra): con la contraseña actual. Las sesiones abiertas siguen (van por el id).
  rutas.agregar('POST', '/api/yo/usuario', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const llave = String(usuario.id);
    if (topes.nombreUsuario.bloqueado(llave)) throw new ErrorHttp(429, 'demasiados_intentos');
    const fila = buscarPorId(db, usuario.id);
    if (!(await verificarClave(textoDe(datos, 'clave'), fila?.clave_hash))) {
      topes.nombreUsuario.permitir(llave);
      throw new ErrorHttp(400, 'clave_actual_incorrecta');
    }
    return { codigo: 200, datos: { perfil: cambiarNombreUsuario(db, usuario.id, textoDe(datos, 'nombre')) } };
  });

  // ---------- El administrador: la ficha de cada alumno y comparar ----------
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/ficha', ({ db, parametros }) =>
    ({ codigo: 200, datos: fichaAlumno(db, activo(db), parametros.id, reloj()) }), { admin: true });

  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/intentos/:intento', ({ db, parametros }) =>
    ({ codigo: 200, datos: intentoDeAlumno(db, activo(db), parametros.id, parametros.intento) }), { admin: true });

  // :ids = «2,5,7» (de 2 a 6 cuentas distintas).
  rutas.agregar('GET', '/api/admin/academia/comparar/:ids', ({ db, parametros }) =>
    ({ codigo: 200, datos: compararAlumnos(db, activo(db), parametros.ids, reloj()) }), { admin: true });
}
