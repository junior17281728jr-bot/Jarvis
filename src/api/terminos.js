// Academia 0.9.2: «Términos de uso y aviso» (src/cuentas/terminos.js).
//  - GET /api/terminos: el texto en uso (público: el enlace del pie se ve también antes de entrar).
//  - GET /api/yo/terminos y POST /api/yo/terminos { version, nombre, apellido, acepto: true }: la cuenta de la sesión.
//  - Administrador: ver y publicar una versión nueva, y poner el nombre legal de alguien.
// No frena las rutas: la pantalla no deja seguir sin aceptar (y la firma queda guardada con fecha y versión).
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import { terminosActuales, terminosVersion, estadoTerminos, aceptarTerminos, publicarTerminos, ponerNombreLegal, versionTerminos, firmasDe, DECLARACION, contratos, contrato, pngDeFirma } from '../cuentas/terminos.js';

const LIMITE_CUERPO_FIRMA = 120 * 1024;

export function registrarRutasTerminos(rutas, { config = null } = {}) {
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  rutas.agregar('GET', '/api/terminos', ({ db }) => ({ codigo: 200, datos: { terminos: terminosActuales(db) } }), { publica: true });

  rutas.agregar('GET', '/api/yo/terminos', ({ db, usuario }) => ({ codigo: 200, datos: { terminos: terminosActuales(db), declaracion: DECLARACION, estado: estadoTerminos(db, usuario.id) } }));

  // Aceptar = firmar: nombre y apellido, «acepto» y la firma dibujada (PNG de 50 KB o menos). Se guarda con la fecha y
  // hora del servidor, la versión y la huella del texto exacto, de dónde (IP y navegador) y la huella de la firma.
  rutas.agregar('POST', '/api/yo/terminos', async ({ db, req, usuario, cliente }) => {
    necesitaConfig();
    const datos = await leerJson(req, LIMITE_CUERPO_FIRMA);
    const estado = aceptarTerminos(db, usuario.id, { version: datos?.version, nombre: textoDe(datos, 'nombre'), apellido: textoDe(datos, 'apellido'), acepto: datos?.acepto, firma: datos?.firma },
      { config, ip: cliente, navegador: req.headers['user-agent'] ?? null });
    return { codigo: 200, datos: { estado } };
  });

  // ---------- Los contratos firmados (Administrador → Alumnos → Contratos firmados) ----------
  rutas.agregar('GET', '/api/admin/contratos', ({ db }) => ({ codigo: 200, datos: { contratos: contratos(db) } }), { admin: true });
  rutas.agregar('GET', '/api/admin/contratos/:usuario/:version', ({ db, parametros }) => {
    necesitaConfig();
    return { codigo: 200, datos: { contrato: contrato(db, config, parametros.usuario, parametros.version) } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/contratos/:usuario/:version/firma', ({ db, parametros }) => {
    necesitaConfig();
    const png = pngDeFirma(db, config, parametros.usuario, parametros.version);
    if (!png) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, enviar: res => { res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'private, no-store' }); res.end(png); } };
  }, { admin: true });

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
