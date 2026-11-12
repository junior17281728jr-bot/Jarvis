// Academia 0.9.2: «Términos de uso y aviso», «Aviso de privacidad» y la firma (src/cuentas/terminos.js).
//  - GET /api/terminos: los dos textos en uso (público: el enlace del pie se ve también antes de entrar).
//  - GET/POST /api/yo/terminos: la cuenta de la sesión firma (nombre, fecha de nacimiento, las 3 casillas, su firma y,
//    si es menor, la de su padre, madre o tutor). «Mis documentos»: su copia de cada firma.
//  - Administrador: publicar versiones, contratos firmados, nombre legal, verificación de identidad, pagos de menores.
// No frena las rutas: la pantalla no deja seguir sin firmar (y la firma queda guardada con fecha y versión).
import { ErrorHttp, leerJson, textoDe, CABECERAS_SEGURIDAD } from '../nucleo/http.js';
import {
  docActual, docVersion, versionDoc, DOCUMENTOS, estadoTerminos, aceptarTerminos, publicarDoc, ponerNombreLegal, firmasDe, DECLARACION, REEMBOLSO,
  contratos, contrato, pngDeFirma, ponerConsentimientoIa, ponerVerificacion, ponerTutorPagos, ponerNacimiento, nombreLegalDe, queCambio,
} from '../cuentas/terminos.js';
import { ponerNombreVisible } from '../cuentas/perfil.js';

const LIMITE_CUERPO_FIRMA = 240 * 1024;

export function registrarRutasTerminos(rutas, { config = null, reloj = Date.now } = {}) {
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const png = datos => ({ codigo: 200, enviar: res => { res.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'image/png', 'Content-Length': datos.length, 'Cache-Control': 'private, no-store' }); res.end(datos); } });
  const textos = db => ({ terminos: docActual(db, 'terminos'), privacidad: docActual(db, 'privacidad'), declaracion: DECLARACION, reembolso: REEMBOLSO });

  rutas.agregar('GET', '/api/terminos', ({ db }) => ({ codigo: 200, datos: textos(db) }), { publica: true });
  // 0.12.4: «novedades»: qué cambió desde la última versión que firmó (si firmó una anterior).
  rutas.agregar('GET', '/api/yo/terminos', ({ db, usuario }) => {
    const estado = estadoTerminos(db, usuario.id);
    const u = estado.pendiente ? estado.ultima : null;
    const novedades = u ? { terminos: queCambio(db, 'terminos', u.version), privacidad: queCambio(db, 'privacidad', u.versionPrivacidad ?? 1) } : null;
    return { codigo: 200, datos: { ...textos(db), estado, novedades: novedades && (novedades.terminos || novedades.privacidad) ? novedades : null } };
  });

  // Firmar: se guarda con la fecha y hora del servidor, las versiones y huellas de los textos exactos, de dónde (IP y
  // navegador) y la huella de cada firma dibujada.
  rutas.agregar('POST', '/api/yo/terminos', async ({ db, req, usuario, cliente }) => {
    necesitaConfig();
    const datos = await leerJson(req, LIMITE_CUERPO_FIRMA);
    const estado = aceptarTerminos(db, usuario.id, datos, { config, ip: cliente, navegador: req.headers['user-agent'] ?? null, ahoraMs: reloj() });
    return { codigo: 200, datos: { estado } };
  });

  // «Mis documentos»: su copia de cada firma (para ver e imprimir).
  rutas.agregar('GET', '/api/yo/documentos', ({ db, usuario }) => ({ codigo: 200, datos: { documentos: firmasDe(db, usuario.id).map(f => ({ n: f.n, version: f.version, versionPrivacidad: f.versionPrivacidad ?? null, firmado: f.firmado, en: f.en })) } }));
  rutas.agregar('GET', '/api/yo/documentos/:n', ({ db, usuario, parametros }) => {
    necesitaConfig();
    const c = contrato(db, config, usuario.id, parametros.n);
    delete c.verificacion; // la nota interna del administrador no es parte de su copia
    return { codigo: 200, datos: { contrato: c } };
  });
  rutas.agregar('GET', '/api/yo/documentos/:n/firma', ({ db, usuario, parametros }) => {
    necesitaConfig();
    const p = pngDeFirma(db, config, usuario.id, parametros.n);
    if (!p) throw new ErrorHttp(404, 'no_existe');
    return png(p);
  });
  rutas.agregar('GET', '/api/yo/documentos/:n/firma-tutor', ({ db, usuario, parametros }) => {
    necesitaConfig();
    const p = pngDeFirma(db, config, usuario.id, parametros.n, { tutor: true });
    if (!p) throw new ErrorHttp(404, 'no_existe');
    return png(p);
  });
  // Retirar (o volver a dar) el permiso de enviar sus datos de estudio a la IA en el extranjero.
  rutas.agregar('POST', '/api/yo/consentimiento-ia', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { aceptoIa: ponerConsentimientoIa(db, usuario.id, datos?.permitido) } };
  });

  // ---------- El administrador ----------
  rutas.agregar('GET', '/api/admin/terminos', ({ db }) => {
    const cuentas = db.prepare('SELECT id FROM usuarios WHERE activo = 1').all();
    const vt = versionDoc(db, 'terminos');
    const vp = versionDoc(db, 'privacidad');
    const aceptaron = cuentas.filter(u => firmasDe(db, u.id).some(f => f.version === vt && (f.versionPrivacidad ?? 1) === vp)).length;
    const versiones = doc => Array.from({ length: versionDoc(db, doc) }, (_, k) => docVersion(db, doc, k + 1)).filter(Boolean).map(v => ({ version: v.version, publicadoEn: v.publicadoEn }));
    return { codigo: 200, datos: { terminos: docActual(db, 'terminos'), privacidad: docActual(db, 'privacidad'), versiones: { terminos: versiones('terminos'), privacidad: versiones('privacidad') }, aceptaron, cuentas: cuentas.length } };
  }, { admin: true });

  // { doc: 'terminos' | 'privacidad', secciones: [{ titulo, texto }] } → la versión siguiente (todos firman otra vez).
  rutas.agregar('POST', '/api/admin/terminos', async ({ db, req, usuario }) => {
    const datos = await leerJson(req, 256 * 1024);
    const doc = datos?.doc ?? 'terminos';
    if (!DOCUMENTOS.includes(doc)) throw new ErrorHttp(400, 'terminos_no_validos');
    return { codigo: 200, datos: { [doc]: publicarDoc(db, doc, datos?.secciones, { hechoPor: usuario.id, cambios: datos?.cambios ?? null }), terminos: docActual(db, 'terminos') } };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/usuarios/:id/nombre-legal', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id)) throw new ErrorHttp(404, 'no_existe');
    // 0.9.2: «nacimiento» (opcional): corregir la fecha de nacimiento (y con ella si es menor).
    const hay = campo => Object.hasOwn(datos ?? {}, campo);
    const nombreLegal = hay('nombre') || hay('apellido') ? ponerNombreLegal(db, id, { nombre: textoDe(datos, 'nombre'), apellido: textoDe(datos, 'apellido') }, { por: 'admin', hechoPor: usuario.id }) : nombreLegalDe(db, id);
    // 0.12.3: el Nombre y Apellido de un alumno que ya lo confirmó es también su nombre en la app: si el administrador lo
    // corrige, se corrige en los dos lados (antes de confirmarlo, el alumno lo ve escrito al firmar y lo puede arreglar).
    if ((hay('nombre') || hay('apellido')) && nombreLegal?.confirmado) {
      const cuenta = db.prepare('SELECT rol, nombre_visible FROM usuarios WHERE id = ?').get(id);
      if (cuenta?.rol === 'usuario' && cuenta.nombre_visible !== nombreLegal.completo) ponerNombreVisible(db, id, nombreLegal.completo, { hechoPor: usuario.id });
    }
    const nacimiento = hay('nacimiento') ? ponerNacimiento(db, id, textoDe(datos, 'nacimiento'), { hechoPor: usuario.id, ahoraMs: reloj() }) : null;
    return { codigo: 200, datos: { nombreLegal, ...(nacimiento ? { nacimiento } : {}) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/usuarios/:id/verificacion', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { verificacion: ponerVerificacion(db, Number(parametros.id), textoDe(datos, 'nota'), { hechoPor: usuario.id }) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/usuarios/:id/tutor-pagos', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    const id = Number(parametros.id);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos: { autorizado: ponerTutorPagos(db, id, datos?.autorizado, { hechoPor: usuario.id }) } };
  }, { admin: true });

  // ---------- Los contratos firmados (Administrador → Alumnos → Contratos firmados) ----------
  rutas.agregar('GET', '/api/admin/contratos', ({ db }) => ({ codigo: 200, datos: { contratos: contratos(db) } }), { admin: true });
  rutas.agregar('GET', '/api/admin/contratos/:usuario/:n', ({ db, parametros }) => {
    necesitaConfig();
    return { codigo: 200, datos: { contrato: contrato(db, config, parametros.usuario, parametros.n) } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/contratos/:usuario/:n/firma', ({ db, parametros }) => {
    necesitaConfig();
    const p = pngDeFirma(db, config, parametros.usuario, parametros.n);
    if (!p) throw new ErrorHttp(404, 'no_existe');
    return png(p);
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/contratos/:usuario/:n/firma-tutor', ({ db, parametros }) => {
    necesitaConfig();
    const p = pngDeFirma(db, config, parametros.usuario, parametros.n, { tutor: true });
    if (!p) throw new ErrorHttp(404, 'no_existe');
    return png(p);
  }, { admin: true });
}
