// Academia 0.13.0: las rutas de la «Fábrica de materias» (solo del administrador). La lógica vive en src/academia/fabrica.js;
// aquí nunca se llama a la IA (eso lo hace solo el trabajador).
//  - GET  /api/admin/academia/fabrica                       el estado: por materia, %, gasto, tiempo estimado, lo que falta
//  - GET  /api/admin/academia/fabrica/:materia/informe      el informe de verificación (dudas y lo corregido)
//  - POST /api/admin/academia/fabrica/pausa { pausada }     pausar o reanudar (sin llamadas mientras está en pausa)
//  - POST /api/admin/academia/fabrica/config { topeUsd?, mejora?: { activa?, topeUsd? }, oral? }
//  - POST /api/admin/academia/fabrica/:materia/reiniciar    una generación nueva de esa materia (lo de antes se guarda)
//  - POST /api/admin/academia/fabrica/:materia/publicar     publicar la versión que esperaba revisión
//  - POST /api/admin/academia/fabrica/ahora                 mirar ya (sin esperar a la próxima hora)
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { encolar } from '../tareas/cola.js';
import { usdAMicro } from '../ia/config.js';
import { MATERIAS } from '../academia/formato.js';
import { vistaFabrica, informeMateria, leerConfigFabrica, guardarConfigFabrica, reiniciarMateria, publicarRevisada, LIMITES_FABRICA } from '../academia/fabrica.js';

// «3,50» y «3.50» son lo mismo (el teléfono en español pone coma).
const conPunto = v => (typeof v === 'string' ? v.trim().replace(',', '.') : v);

export function registrarRutasFabrica(rutas, { config = null, supervisor = null, reloj = Date.now } = {}) {
  reloj ??= Date.now;
  const materiaDe = parametros => {
    if (!MATERIAS.includes(parametros.materia)) throw new ErrorHttp(404, 'no_existe');
    return parametros.materia;
  };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const despertar = () => { try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta */ } };

  rutas.agregar('GET', '/api/admin/academia/fabrica', ({ db }) => { necesitaConfig(); return { codigo: 200, datos: vistaFabrica(db, config, reloj()) }; }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/fabrica/:materia/informe', ({ db, parametros }) => ({ codigo: 200, datos: informeMateria(db, materiaDe(parametros)) }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/fabrica/pausa', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const pausada = datos?.pausada === true;
    const cfg = enTransaccion(db, () => {
      auditar(db, { usuarioId: usuario.id, accion: pausada ? 'fabrica_pausada' : 'fabrica_reanudada', detalle: '' });
      return guardarConfigFabrica(db, { pausada });
    });
    if (!pausada) despertar();
    return { codigo: 200, datos: { config: cfg } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/fabrica/config', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const cambios = {};
    if (datos?.topeUsd != null) cambios.topeMicro = usdAMicro(conPunto(datos.topeUsd), LIMITES_FABRICA.topeMaxMicro);
    if (datos?.mejora && typeof datos.mejora === 'object') {
      cambios.mejora = {};
      if (typeof datos.mejora.activa === 'boolean') cambios.mejora.activa = datos.mejora.activa;
      if (datos.mejora.topeUsd != null) cambios.mejora.topeMesMicro = usdAMicro(conPunto(datos.mejora.topeUsd), LIMITES_FABRICA.mejoraMaxMicro);
    }
    // La pista oral todavía no se fabrica (README): encenderla no haría nada, así que no se deja.
    if (datos?.oral === true) throw new ErrorHttp(409, 'no_disponible');
    if (datos?.oral === false) cambios.oral = false;
    const antes = leerConfigFabrica(db);
    const cfg = enTransaccion(db, () => {
      const nueva = guardarConfigFabrica(db, cambios);
      auditar(db, { usuarioId: usuario.id, accion: 'fabrica_config', detalle: JSON.stringify({ antes: { tope: antes.topeMicro, mejora: antes.mejora, oral: antes.oral }, despues: { tope: nueva.topeMicro, mejora: nueva.mejora, oral: nueva.oral } }).slice(0, 500) });
      return nueva;
    });
    return { codigo: 200, datos: { config: cfg } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/fabrica/:materia/reiniciar', ({ db, parametros, usuario }) => {
    const materia = materiaDe(parametros);
    enTransaccion(db, () => { reiniciarMateria(db, materia); auditar(db, { usuarioId: usuario.id, accion: 'fabrica_reiniciar', detalle: materia }); });
    despertar();
    return { codigo: 200, datos: { listo: true } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/fabrica/:materia/publicar', ({ db, parametros, usuario }) => {
    const materia = materiaDe(parametros);
    const r = enTransaccion(db, () => {
      const x = publicarRevisada(db, { materia, usuarioId: usuario.id, ahora: reloj() });
      if (x.ok) auditar(db, { usuarioId: usuario.id, accion: 'fabrica_publicar', detalle: `${materia} ${x.version}` });
      return x;
    });
    if (!r.ok) throw new ErrorHttp(409, r.motivo);
    return { codigo: 200, datos: r };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/fabrica/ahora', ({ db, usuario }) => {
    const ahora = reloj();
    const r = encolar(db, { tipo: 'academia.fabrica', programa: 'academia.fabrica', claveUnica: `academia.fabrica@manual-${ahora}`, creadaPor: usuario.id }, { ahora });
    despertar();
    return { codigo: 200, datos: r };
  }, { admin: true });
}
