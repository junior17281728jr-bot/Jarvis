// Academia 0.13.0: las rutas de la «Fábrica de materias» (solo del administrador). La lógica vive en src/academia/fabrica.js;
// aquí nunca se llama a la IA (eso lo hace solo el trabajador).
//  - GET  /api/admin/academia/fabrica                       el estado: por materia, %, gasto, tiempo estimado, lo que falta
//  - GET  /api/admin/academia/fabrica/:materia/informe      el informe de verificación (dudas y lo corregido)
//  - POST /api/admin/academia/fabrica/pausa { pausada }     pausar o reanudar (sin llamadas mientras está en pausa)
//  - POST /api/admin/academia/fabrica/config { topeUsd?, mejora?: { activa?, topeUsd? }, oral? } (oral: fabricar la pista oral)
//  - POST /api/admin/academia/fabrica/:materia/reiniciar    una generación nueva de esa materia (lo de antes se guarda)
//  - POST /api/admin/academia/fabrica/:materia/publicar     publicar la versión que esperaba revisión
//  - POST /api/admin/academia/fabrica/ahora                 mirar ya (sin esperar a la próxima hora)
//  - 0.13.9: config { profunda?: { activa?, topeUsd? } } (la «Mejora profunda de las clases», apagada por defecto);
//    GET .../:materia/profunda/informe y POST .../:materia/profunda/publicar (lo que la mejora profunda dejó esperando revisión)
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { encolar } from '../tareas/cola.js';
import { usdAMicro } from '../ia/config.js';
import { MATERIAS, MATERIAS_ORAL } from '../academia/formato.js';
import { informeProfunda, publicarProfundaRevisada } from '../academia/fabrica-profunda.js';
import { vistaFabrica, informeMateria, leerConfigFabrica, guardarConfigFabrica, reiniciarMateria, publicarRevisada, LIMITES_FABRICA } from '../academia/fabrica.js';

// «3,50» y «3.50» son lo mismo (el teléfono en español pone coma).
const conPunto = v => (typeof v === 'string' ? v.trim().replace(',', '.') : v);

export function registrarRutasFabrica(rutas, { config = null, supervisor = null, reloj = Date.now } = {}) {
  reloj ??= Date.now;
  const materiaDe = parametros => {
    if (!MATERIAS.includes(parametros.materia) && !MATERIAS_ORAL.includes(parametros.materia)) throw new ErrorHttp(404, 'no_existe');
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
    if (datos?.profunda && typeof datos.profunda === 'object') {
      cambios.profunda = {};
      if (typeof datos.profunda.activa === 'boolean') cambios.profunda.activa = datos.profunda.activa;
      if (datos.profunda.topeUsd != null) cambios.profunda.topeMicro = usdAMicro(conPunto(datos.profunda.topeUsd), LIMITES_FABRICA.profundaMaxMicro);
    }
    // 0.13.1: la pista oral ya se fabrica (capítulos 1–9, tema por tema; lo ya publicado a mano se salta).
    if (typeof datos?.oral === 'boolean') cambios.oral = datos.oral;
    const antes = leerConfigFabrica(db);
    const cfg = enTransaccion(db, () => {
      const nueva = guardarConfigFabrica(db, cambios);
      auditar(db, { usuarioId: usuario.id, accion: 'fabrica_config', detalle: JSON.stringify({ antes: { tope: antes.topeMicro, mejora: antes.mejora, oral: antes.oral, profunda: antes.profunda }, despues: { tope: nueva.topeMicro, mejora: nueva.mejora, oral: nueva.oral, profunda: nueva.profunda } }).slice(0, 500) });
      return nueva;
    });
    if (cambios.oral === true || cambios.profunda?.activa === true) despertar();
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
  rutas.agregar('GET', '/api/admin/academia/fabrica/:materia/profunda/informe', ({ db, parametros }) => ({ codigo: 200, datos: informeProfunda(db, materiaDe(parametros)) }), { admin: true });
  rutas.agregar('POST', '/api/admin/academia/fabrica/:materia/profunda/publicar', ({ db, parametros, usuario }) => {
    const materia = materiaDe(parametros);
    const r = enTransaccion(db, () => {
      const x = publicarProfundaRevisada(db, { materia, usuarioId: usuario.id, ahora: reloj() });
      if (x.ok) auditar(db, { usuarioId: usuario.id, accion: 'fabrica_publicar', detalle: `profunda ${materia} ${x.version}` });
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
