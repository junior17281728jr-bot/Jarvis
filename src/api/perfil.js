// 0.9.0: rutas del perfil propio (Configuración → Mi perfil) y la ficha de cada alumno para el administrador.
//  - /api/yo/… usan SIEMPRE la cuenta de la sesión: nadie cambia el perfil de otro.
//  - /api/admin/academia/alumnos/:id/ficha, …/intentos/:intento y /api/admin/academia/comparar/:ids llevan { admin: true }
//    (403 para los alumnos, 401 sin sesión).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { Freno, Limitador } from '../nucleo/limites.js';
import { verificarClave } from '../cuentas/claves.js';
import { buscarPorId } from '../cuentas/usuarios.js';
import { perfilDe, guardarPerfil, cambiarNombreUsuario, ponerNombreVisible } from '../cuentas/perfil.js';
import { anotarCambioAdmin } from '../cuentas/confirmar.js';
import { nombreLegalDe } from '../cuentas/terminos.js';
import { enTransaccion } from '../nucleo/db.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { fichaAlumno, intentoDeAlumno, compararAlumnos } from '../academia/fichas.js';
import { examenesTestGuide } from '../academia/examenes-tg.js';
import { comoVanTodos, enLineaTodos, compararExamen } from '../academia/como-van.js';
import { notasDeTodos } from '../academia/notas.js';
import { reporteAcademia, opcionesReporte, guardarOpcionesReporte } from '../academia/reporte.js';

export function crearLimitesPerfil() {
  return {
    // Contraseñas malas al cambiar el nombre de usuario (por cuenta). 0.12.6: nunca bloquean, solo esperan (Freno).
    nombreUsuario: new Freno(),
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
  // 0.12.3: nombreFijo: un alumno que ya confirmó su Nombre y Apellido (al firmar) no cambia su nombre: lo cambia el
  // administrador. El avatar, la meta y «privado» los sigue cambiando él.
  const nombreFijo = (db, usuario) => usuario.rol === 'usuario' && nombreLegalDe(db, usuario.id)?.confirmado === true;
  rutas.agregar('GET', '/api/yo/perfil', ({ db, usuario }) => ({ codigo: 200, datos: { perfil: { ...perfilDe(db, usuario.id), nombreFijo: nombreFijo(db, usuario) } } }));

  rutas.agregar('POST', '/api/yo/perfil', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (!topes.cambios.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const pedido = {};
    for (const campo of ['nombreVisible', 'avatar', 'meta', 'privado']) if (Object.hasOwn(datos ?? {}, campo)) pedido[campo] = datos[campo];
    const fijo = nombreFijo(db, usuario);
    if (fijo && Object.hasOwn(pedido, 'nombreVisible')) {
      const actual = perfilDe(db, usuario.id).nombreVisible;
      if (typeof pedido.nombreVisible !== 'string' || pedido.nombreVisible.replace(/\s+/g, ' ').trim() !== actual) throw new ErrorHttp(403, 'nombre_lo_cambia_admin');
      delete pedido.nombreVisible;
    }
    return { codigo: 200, datos: { perfil: { ...guardarPerfil(db, usuario.id, pedido), nombreFijo: fijo } } };
  });

  // El nombre de usuario (con el que se entra): con la contraseña actual. Las sesiones abiertas siguen (van por el id).
  rutas.agregar('POST', '/api/yo/usuario', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const llave = String(usuario.id);
    await topes.nombreUsuario.esperarTurno(llave);
    const fila = buscarPorId(db, usuario.id);
    if (!(await verificarClave(textoDe(datos, 'clave'), fila?.clave_hash))) throw new ErrorHttp(400, 'clave_actual_incorrecta');
    topes.nombreUsuario.olvidar(llave);
    return { codigo: 200, datos: { perfil: cambiarNombreUsuario(db, usuario.id, textoDe(datos, 'nombre')) } };
  });

  // ---------- 0.9.2: el administrador cambia el nombre de usuario y el nombre para mostrar de alguien ----------
  // Las sesiones de la persona siguen abiertas (van por el id); al entrar ve «El administrador cambió tu usuario a …».
  // 0.12.3: a otro administrador, con la contraseña otra vez (también por el enlace público), y queda un aviso.
  rutas.agregar('POST', '/api/admin/usuarios/:id/nombre', async ({ db, req, usuario, parametros, confirmar }) => {
    const datos = await leerJson(req);
    const destino = buscarPorId(db, parametros.id);
    if (!destino) throw new ErrorHttp(404, 'no_existe');
    const otroAdmin = destino.rol === 'admin' && destino.id !== usuario.id;
    const confirmado = otroAdmin ? await confirmar() : null;
    const cambiaUsuario = Object.hasOwn(datos ?? {}, 'nombre') && textoDe(datos, 'nombre').trim().toLowerCase() !== destino.nombre.toLowerCase();
    const cambiaVisible = Object.hasOwn(datos ?? {}, 'nombreVisible');
    if (!cambiaUsuario && !cambiaVisible) throw new ErrorHttp(400, 'nombre_igual');
    const perfil = enTransaccion(db, () => {
      let p = null;
      if (cambiaUsuario) p = cambiarNombreUsuario(db, destino.id, textoDe(datos, 'nombre'), { hechoPor: usuario.id });
      if (cambiaVisible) p = ponerNombreVisible(db, destino.id, datos.nombreVisible, { hechoPor: usuario.id });
      if (otroAdmin) anotarCambioAdmin(db, { usuarioId: usuario.id, accion: 'admin_nombre', detalle: { cuenta: destino.nombre }, como: confirmado?.como });
      return p;
    });
    return { codigo: 200, datos: { id: destino.id, nombre: perfil.nombre, nombreVisible: perfil.nombreVisible } };
  }, { admin: true });

  // ---------- El administrador: la ficha de cada alumno y comparar ----------
  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/ficha', ({ db, parametros }) =>
    ({ codigo: 200, datos: fichaAlumno(db, activo(db), parametros.id, reloj()) }), { admin: true });

  // 0.12.3: los Exámenes del Test Guide de cada materia, de todos (o de un alumno: ?alumno=<n.º>), agrupados por materia.
  rutas.agregar('GET', '/api/admin/academia/examenes', ({ db, req }) => {
    const alumno = Number(new URL(req.url, 'http://x').searchParams.get('alumno'));
    return { codigo: 200, datos: examenesTestGuide(db, activo(db), { alumno: Number.isSafeInteger(alumno) && alumno > 0 ? alumno : null }) };
  }, { admin: true });

  // 0.13.5: «Cómo van todos»: cada alumno con sus notas de examen, sus clases, su plan, su avance y si está en línea.
  // …/en-linea es lo liviano que la pantalla pide cada 30 s (solo quién está en línea). Solo leen.
  rutas.agregar('GET', '/api/admin/academia/como-van', ({ db }) => ({ codigo: 200, datos: comoVanTodos(db, activo(db), reloj()) }), { admin: true });
  rutas.agregar('GET', '/api/admin/academia/como-van/en-linea', ({ db }) => ({ codigo: 200, datos: enLineaTodos(db, reloj()) }), { admin: true });
  // 0.14.6: «Notas»: SOLO las notas de cada alumno (cada materia y tema del Test Guide y del oral). Una sola respuesta para
  // #notas, #notas/<materia>, #notas/alumno/<n.º> y #notas/comparar/<n.º,n.º>. Solo lee.
  rutas.agregar('GET', '/api/admin/academia/notas', ({ db }) => ({ codigo: 200, datos: notasDeTodos(db, activo(db), reloj()) }), { admin: true });
  // 0.13.5: «Comparar un examen» (el de una materia): la nota de cada alumno y qué pregunta falló cada uno.
  rutas.agregar('GET', '/api/admin/academia/examenes/:materia/comparar', ({ db, parametros }) => {
    const datos = compararExamen(db, activo(db), String(parametros.materia ?? ''));
    if (!datos) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos };
  }, { admin: true });

  rutas.agregar('GET', '/api/admin/academia/alumnos/:id/intentos/:intento', ({ db, parametros }) =>
    ({ codigo: 200, datos: intentoDeAlumno(db, activo(db), parametros.id, parametros.intento) }), { admin: true });

  // 0.9.2: el Reporte. ?secciones=ranking,alumnos,grupo,comparar&desde=AAAA-MM-DD&hasta=…&bloqueados=1&comparar=todos|2,5
  rutas.agregar('GET', '/api/admin/academia/reporte', ({ db, req }) => {
    const q = new URL(req.url, 'http://x').searchParams;
    const lista = nombre => (q.get(nombre) ?? '').split(',').filter(Boolean);
    const comparar = q.get('comparar');
    const opciones = {
      secciones: q.has('secciones') ? lista('secciones') : undefined,
      desde: q.get('desde') || null, hasta: q.get('hasta') || null, bloqueados: q.get('bloqueados') === '1',
      comparar: comparar && comparar !== 'todos' ? lista('comparar').map(n => (/^\d{1,9}$/.test(n) ? Number(n) : -1)) : 'todos',
    };
    return { codigo: 200, datos: reporteAcademia(db, activo(db), opciones, reloj()) };
  }, { admin: true });
  // La última elección de cada administrador (qué partes, fechas, bloqueados, a quiénes comparar).
  rutas.agregar('GET', '/api/admin/academia/reporte/opciones', ({ db, usuario }) => ({ codigo: 200, datos: { opciones: opcionesReporte(db, usuario.id) } }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/reporte/opciones', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { opciones: guardarOpcionesReporte(db, usuario.id, datos) } };
  }, { admin: true });

  // :ids = «2,5,7» (de 2 a 6 cuentas distintas).
  rutas.agregar('GET', '/api/admin/academia/comparar/:ids', ({ db, parametros }) =>
    ({ codigo: 200, datos: compararAlumnos(db, activo(db), parametros.ids, reloj()) }), { admin: true });
}
