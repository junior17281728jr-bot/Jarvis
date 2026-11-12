// Academia 0.9.2: «Términos de uso y aviso» (src/cuentas/terminos.js).
//  - GET /api/terminos: el texto en uso (público: el enlace del pie se ve también antes de entrar).
//  - GET /api/yo/terminos y POST /api/yo/terminos { version, nombre, apellido, acepto: true }: la cuenta de la sesión.
//  - Administrador: ver y publicar una versión nueva, y poner el nombre legal de alguien.
// No frena las rutas: la pantalla no deja seguir sin aceptar (y la firma queda guardada con fecha y versión).
import { ErrorHttp, leerJson, textoDe } from '../nucleo/http.js';
import { terminosActuales, terminosVersion, estadoTerminos, aceptarTerminos, publicarTerminos, ponerNombreLegal, versionTerminos, firmasDe } from '../cuentas/terminos.js';

export function registrarRutasTerminos(rutas) {
  rutas.agregar('GET', '/api/terminos', ({ db }) => ({ codigo: 200, datos: { terminos: terminosActuales(db) } }), { publica: true });

  rutas.agregar('GET', '/api/yo/terminos', ({ db, usuario }) => ({ codigo: 200, datos: { terminos: terminosActuales(db), estado: estadoTerminos(db, usuario.id) } }));

  rutas.agregar('POST', '/api/yo/terminos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const estado = aceptarTerminos(db, usuario.id, { version: datos?.version, nombre: textoDe(datos, 'nombre'), apellido: textoDe(datos, 'apellido'), acepto: datos?.acepto });
    return { codigo: 200, datos: { estado } };
  });

  rutas.agregar('GET', '/api/admin/terminos', ({ db }) => {
    const version = versionTerminos(db);
    const versiones = Array.from({ length: version }, (_, k) => terminosVersion(db, k + 1)).filter(Boolean).map(v => ({ version: v.version, publicadoEn: v.publicadoEn }));
    const cuentas = db.prepare('SELECT id FROM usuarios WHERE activo = 1').all();
    const aceptaron = cuentas.filter(u => firmasDe(db, u.id).some(f => f.version === version)).length;
    return { codigo: 200, datos: { terminos: terminosActuales(db), versiones, aceptaron, cuentas: cuentas.length } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/terminos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { terminos: publicarTerminos(db, datos?.secciones, { hechoPor: usuario.id }) } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/nombre-legal', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id)) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos: { nombreLegal: ponerNombreLegal(db, id, { nombre: textoDe(datos, 'nombre'), apellido: textoDe(datos, 'apellido') }, { por: 'admin', hechoPor: usuario.id }) } };
  }, { admin: true });
}
