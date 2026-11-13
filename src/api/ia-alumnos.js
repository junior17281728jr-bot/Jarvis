// 0.12.8 (pedido del dueño): las rutas de «IA por alumno», «Registro de la IA» y «Enviar a mi Telegram» (todas solo del
// administrador). La lógica vive en src/academia/ia-alumnos.js y src/canales/bot.js.
//  - GET  /api/admin/academia/ia-alumnos                    la tabla (ordenada por gasto) y sus totales
//  - POST /api/admin/academia/alumnos/:id/regalo { usos }    regalar N usos (1–1000)
//  - POST /api/admin/academia/alumnos/:id/pausa { pausada }  pausar (o reanudar) la IA de ese alumno
//  - POST /api/admin/academia/alumnos/:id/tope { usd }       su tope personal del mes (US$, hasta 20; null: el de su plan)
//  - GET  /api/admin/academia/ia-registro?alumno=N           lo que la IA hizo para ese alumno
//  - GET  /api/admin/academia/ia-biblioteca?buscar=…         lo guardado y compartido
//  - POST /api/admin/academia/ia-biblioteca/ocultar { clave, oculto }
//  - POST /api/admin/telegram/contratos/:usuario/:n          mandar ese contrato al chat del dueño
//  - POST /api/admin/telegram/contratos { usuario? }         todos los de ese alumno (o la última firma de cada uno)
//  - POST /api/admin/telegram/probar-bot                     un mensaje de prueba con los comandos
// Mandar a Telegram: como mucho uno cada 3 s (429 espera_telegram { segundos }); responde { motivo, enviados, de }.
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { paqueteActivo } from '../academia/paquetes.js';
import { filasIaAlumnos, regalarUsos, pausarIa, ponerTopePersonal, registroAlumno, biblioteca, ocultarGuardado } from '../academia/ia-alumnos.js';
import { contratos } from '../cuentas/terminos.js';
import { mandarContratos, mandarTextoAlDueno, TOPES_BOT } from '../canales/bot.js';
import { contratosParaMandar, textoAyuda, COMANDOS } from '../canales/comandos.js';
import { frase, tituloHtml, escaparHtml, idiomaDelDueno } from '../canales/textos.js';
import { unDispositivoActivo, ponerUnDispositivo } from '../cuentas/un-dispositivo.js';

export function registrarRutasIaAlumnos(rutas, { config = null, reloj = Date.now, adaptador = undefined, topesBot = {} } = {}) {
  reloj ??= Date.now;
  const T = { ...TOPES_BOT, ...topesBot };
  let ultimoEnvio = -Infinity;
  const turno = () => {
    const ahora = reloj();
    const falta = ultimoEnvio + T.entreEnviosMs - ahora;
    if (falta > 0 && ahora >= ultimoEnvio) throw new ErrorHttp(429, 'espera_telegram', { segundos: Math.ceil(falta / 1000) });
    ultimoEnvio = ahora;
  };
  const opciones = () => ({ adaptador: adaptador ?? undefined, reloj, topes: T });
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };

  rutas.agregar('GET', '/api/admin/academia/ia-alumnos', ({ db }) => ({ codigo: 200, datos: filasIaAlumnos(db, reloj()) }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/regalo', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: { derecho: regalarUsos(db, parametros.id, datos?.usos, usuario.id, reloj()) } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/pausa', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: pausarIa(db, parametros.id, datos?.pausada, usuario.id, reloj()) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/alumnos/:id/tope', async ({ db, req, usuario, parametros }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: ponerTopePersonal(db, parametros.id, datos?.usd ?? null, usuario.id, reloj()) };
  }, { admin: true, soloDueno: true });

  rutas.agregar('GET', '/api/admin/academia/ia-registro', ({ db, req }) => {
    const id = new URL(req.url, 'http://x').searchParams.get('alumno');
    const alumnos = db.prepare("SELECT id, nombre, nombre_visible FROM usuarios WHERE rol <> 'admin' AND eliminado_en IS NULL ORDER BY nombre").all().map(u => ({ id: u.id, nombre: u.nombre_visible || u.nombre, usuario: u.nombre }));
    let p = null;
    try { p = config ? paqueteActivo(db, config) : null; } catch { p = null; }
    return { codigo: 200, datos: { alumnos, registro: id ? registroAlumno(db, id, p, reloj()) : null } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/ia-biblioteca', ({ db, req }) => {
    const buscar = new URL(req.url, 'http://x').searchParams.get('buscar') ?? '';
    return { codigo: 200, datos: biblioteca(db, { buscar }) };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/ia-biblioteca/ocultar', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    return { codigo: 200, datos: ocultarGuardado(db, datos?.clave, datos?.oculto, usuario.id) };
  }, { admin: true });

  // 0.12.8 (punto Z): «Un solo dispositivo a la vez para alumnos» (Usuarios).
  rutas.agregar('GET', '/api/admin/cuentas/un-dispositivo', ({ db }) => ({ codigo: 200, datos: { activo: unDispositivoActivo(db) } }), { admin: true });
  rutas.agregar('POST', '/api/admin/cuentas/un-dispositivo', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    if (typeof datos?.activo !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    return { codigo: 200, datos: { activo: ponerUnDispositivo(db, datos.activo, { usuarioId: usuario.id, ahora: reloj() }) } };
  }, { admin: true, soloDueno: true });

  // ---------- «Enviar a mi Telegram» ----------
  rutas.agregar('POST', '/api/admin/telegram/contratos/:usuario/:n', async ({ db, req, parametros }) => {
    necesitaConfig();
    await leerJson(req);
    const usuarioId = Number(parametros.usuario);
    const n = Number(parametros.n);
    if (!contratos(db).some(c => c.usuarioId === usuarioId && c.n === n)) throw new ErrorHttp(404, 'no_existe');
    turno();
    return { codigo: 200, datos: await mandarContratos(db, config, { lista: [{ usuarioId, n }], ...opciones() }) };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/telegram/contratos', async ({ db, req }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    const id = datos?.usuario == null ? null : Number(datos.usuario);
    if (id != null && !Number.isSafeInteger(id)) throw new ErrorHttp(400, 'datos_no_validos');
    const lista = id == null ? contratosParaMandar(db, 'todos').lista : contratos(db).filter(c => c.usuarioId === id).map(c => ({ usuarioId: c.usuarioId, n: c.n }));
    if (!lista.length) throw new ErrorHttp(404, 'no_existe');
    turno();
    return { codigo: 200, datos: await mandarContratos(db, config, { lista: lista.slice(0, T.porPedido), ...opciones() }) };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/telegram/probar-bot', async ({ db, req }) => {
    necesitaConfig();
    await leerJson(req);
    turno();
    const idioma = idiomaDelDueno(db);
    const texto = [tituloHtml('🤖', frase(idioma, 'bot.prueba.titulo')), escaparHtml(frase(idioma, 'bot.prueba.linea')), '', textoAyuda(idioma)].join('\n');
    return { codigo: 200, datos: { ...(await mandarTextoAlDueno(db, config, { texto, ...opciones() })), comandos: COMANDOS.map(c => `${c} - ${frase(idioma, `bot.botfather.${c}`)}`) } };
  }, { admin: true });
}
