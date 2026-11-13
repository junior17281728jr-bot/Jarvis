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
import { informeProfunda, publicarProfundaRevisada, resumenProfunda, fasesTodo, estimadoProfundo, empezarProfunda, claudeListo, topeTodoMicro, AJUSTE_TODO_TOPE, TODO_TOPE_MICRO } from '../academia/fabrica-profunda.js';
import { vistaFabrica, informeMateria, leerConfigFabrica, guardarConfigFabrica, reiniciarMateria, publicarRevisada, LIMITES_FABRICA, MODELOS_PROFUNDA } from '../academia/fabrica.js';
import { guardarAjuste } from '../academia/paquetes.js';
import { probarModeloClaude } from '../claves/probar.js';
import { vistaLoQueHizo } from '../academia/ia-hizo.js';
import { vistaChat, escribirMensaje, hazlo, cancelarTrabajo, publicarTrabajo } from '../academia/pidele.js';

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
      // 0.14.7: el modelo («opus» = lo mejor; «sonnet» = más barato).
      if (datos.profunda.modelo != null) {
        if (!MODELOS_PROFUNDA.includes(datos.profunda.modelo)) throw new ErrorHttp(400, 'datos_no_validos');
        cambios.profunda.modelo = datos.profunda.modelo;
      }
    }
    // 0.14.7: «Pídele a la IA» hace solo lo de contenido (sin «Hazlo»), o espera el «Hazlo».
    if (typeof datos?.chat?.auto === 'boolean') cambios.chat = { auto: datos.chat.auto };
    // 0.13.1: la pista oral ya se fabrica (capítulos 1–9, tema por tema; lo ya publicado a mano se salta).
    if (typeof datos?.oral === 'boolean') cambios.oral = datos.oral;
    const antes = leerConfigFabrica(db);
    const cfg = enTransaccion(db, () => {
      const nueva = guardarConfigFabrica(db, cambios);
      // 0.14.7: con «Mejorar todo» (tope compartido de las 5 fases), el tope nuevo también es el de todo.
      if (cambios.profunda?.topeMicro != null && topeTodoMicro(db) != null) guardarAjuste(db, AJUSTE_TODO_TOPE, String(cambios.profunda.topeMicro));
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

  const ponerEnFila = (db, usuario) => {
    const ahora = reloj();
    try { encolar(db, { tipo: 'academia.fabrica', programa: 'academia.fabrica', claveUnica: `academia.fabrica@chat-${ahora}`, creadaPor: usuario.id }, { ahora }); } catch { /* ya hay una en la fila */ }
    despertar();
  };
  // ---------- 0.14.7: «Mejorar todo con Claude (lo mejor)» (solo el administrador; aquí nunca se llama a la IA de pago) ----------
  //  - GET  /api/admin/academia/profunda                  lo corto: estado, gasto, tope, las 5 fases y si Claude está listo
  //  - GET  /api/admin/academia/profunda/estimado?topeUsd= el costo y el tiempo de cada etapa, con Opus y con Sonnet
  //  - POST /api/admin/academia/profunda/probar           la prueba GRATIS de la clave con Opus (count_tokens)
  //  - POST /api/admin/academia/profunda/empezar { modelo, topeUsd }   empezar (o seguir) con el tope elegido
  //  - POST /api/admin/academia/profunda/pausa { pausada }             pausar o seguir (lo hecho queda guardado)
  rutas.agregar('GET', '/api/admin/academia/profunda', ({ db }) => {
    necesitaConfig();
    const ahora = reloj();
    return { codigo: 200, datos: { ...fasesTodo(db, config, { ahora, memoMs: 3_000 }), listo: claudeListo(db, config, ahora), topeTodoMicro: topeTodoMicro(db) ?? TODO_TOPE_MICRO } };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/profunda/estimado', ({ db, req }) => {
    necesitaConfig();
    const texto = new URL(req.url, 'http://x').searchParams.get('topeUsd');
    const topeMicro = texto ? usdAMicro(conPunto(texto), LIMITES_FABRICA.profundaMaxMicro) : topeTodoMicro(db) ?? TODO_TOPE_MICRO;
    const r = resumenProfunda(db);
    const ronda = r.empezo && r.terminada && !r.materias.some(m => m.estado === 'fuera') ? leerConfigFabrica(db).profunda.ronda + 1 : null;
    return { codigo: 200, datos: { ...estimadoProfundo(db, config, { topeMicro, ronda, ahora: reloj() }), listo: claudeListo(db, config, reloj()) } };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/profunda/probar', async ({ db }) => {
    necesitaConfig();
    return { codigo: 200, datos: await probarModeloClaude(db, config, { modelo: 'claude-opus-5-5', ahora: reloj }) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/profunda/empezar', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    const modelo = datos?.modelo ?? 'opus';
    if (!MODELOS_PROFUNDA.includes(modelo)) throw new ErrorHttp(400, 'datos_no_validos');
    const listo = claudeListo(db, config, reloj());
    if (modelo === 'opus' && !listo.listo) throw new ErrorHttp(409, listo.motivo);
    const topeMicro = datos?.topeUsd != null ? usdAMicro(conPunto(datos.topeUsd), LIMITES_FABRICA.profundaMaxMicro) : null;
    const cfg = enTransaccion(db, () => {
      const nueva = empezarProfunda(db, config, { modelo, topeMicro, guardarConfig: guardarConfigFabrica, ahora: reloj() });
      auditar(db, { usuarioId: usuario.id, accion: 'fabrica_config', detalle: JSON.stringify({ profunda: nueva.profunda }).slice(0, 500) });
      return nueva;
    });
    ponerEnFila(db, usuario);
    return { codigo: 200, datos: { config: cfg } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/profunda/pausa', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    if (typeof datos?.pausada !== 'boolean') throw new ErrorHttp(400, 'datos_no_validos');
    const cfg = enTransaccion(db, () => {
      auditar(db, { usuarioId: usuario.id, accion: datos.pausada ? 'fabrica_pausada' : 'fabrica_reanudada', detalle: 'profunda' });
      return guardarConfigFabrica(db, { profunda: { activa: !datos.pausada } });
    });
    if (!datos.pausada) ponerEnFila(db, usuario);
    return { codigo: 200, datos: { config: cfg } };
  }, { admin: true, soloDueno: true });

  // ---------- 0.14.2: «Lo que hizo la IA» y «Pídele a la IA» (solo el administrador; aquí nunca se llama a la IA) ----------
  //  - GET  /api/admin/academia/ia-hizo                       registro de cambios, números, «Lo que falta» y materiales
  //  - GET  /api/admin/academia/chat                          la charla, los trabajos y lo que cuesta un mensaje
  //  - POST /api/admin/academia/chat { texto }                un mensaje (409 ia_en_pausa / chat_ocupado)
  //  - POST /api/admin/academia/chat/trabajos/:id/hazlo       «Hazlo» (el plan pasa a la fila de la fábrica)
  //  - POST /api/admin/academia/chat/trabajos/:id/cancelar    deja de hacerse (lo ya hecho queda)
  //  - POST /api/admin/academia/chat/trabajos/:id/publicar    publicar lo que quedó «Esperando revisión»
  // Pausar o reanudar TODO el trabajo de la IA (fábrica + chat): POST /api/admin/academia/fabrica/pausa.
  const idTrabajo = parametros => { if (!/^[0-9a-f]{12}$/.test(String(parametros.id))) throw new ErrorHttp(404, 'no_existe'); return parametros.id; };
  rutas.agregar('GET', '/api/admin/academia/ia-hizo', ({ db }) => { necesitaConfig(); return { codigo: 200, datos: vistaLoQueHizo(db, config, reloj()) }; }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/chat', ({ db }) => {
    necesitaConfig();
    return { codigo: 200, datos: vistaChat(db, config, { ahora: reloj(), pausada: leerConfigFabrica(db).pausada }) };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/chat', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    if (typeof datos?.texto !== 'string' || !datos.texto.trim() || datos.texto.length > 2000) throw new ErrorHttp(400, 'datos_no_validos');
    if (leerConfigFabrica(db).pausada) throw new ErrorHttp(409, 'ia_en_pausa');
    const r = enTransaccion(db, () => escribirMensaje(db, { texto: datos.texto, ahora: reloj() }));
    if (r?.ocupado) throw new ErrorHttp(409, 'chat_ocupado');
    if (!r?.rechazado) ponerEnFila(db, usuario);
    return { codigo: 200, datos: vistaChat(db, config, { ahora: reloj(), pausada: false }) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/chat/trabajos/:id/hazlo', ({ db, parametros, usuario }) => {
    necesitaConfig();
    if (leerConfigFabrica(db).pausada) throw new ErrorHttp(409, 'ia_en_pausa');
    const j = enTransaccion(db, () => {
      const x = hazlo(db, { id: idTrabajo(parametros), ahora: reloj() });
      if (x) auditar(db, { usuarioId: usuario.id, accion: 'ia_pedido_hazlo', detalle: `${x.tipo} ${x.materia} ${x.tema ?? ''}`.slice(0, 200) });
      return x;
    });
    if (!j) throw new ErrorHttp(409, 'no_se_puede');
    ponerEnFila(db, usuario);
    return { codigo: 200, datos: vistaChat(db, config, { ahora: reloj(), pausada: false }) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/chat/trabajos/:id/cancelar', ({ db, parametros }) => {
    necesitaConfig();
    if (!enTransaccion(db, () => cancelarTrabajo(db, { id: idTrabajo(parametros), ahora: reloj() }))) throw new ErrorHttp(409, 'no_se_puede');
    return { codigo: 200, datos: vistaChat(db, config, { ahora: reloj(), pausada: leerConfigFabrica(db).pausada }) };
  }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/chat/trabajos/:id/publicar', ({ db, parametros, usuario }) => {
    necesitaConfig();
    if (!enTransaccion(db, () => publicarTrabajo(db, { id: idTrabajo(parametros), usuarioId: usuario.id, ahora: reloj() }))) throw new ErrorHttp(409, 'no_se_puede');
    return { codigo: 200, datos: vistaChat(db, config, { ahora: reloj(), pausada: leerConfigFabrica(db).pausada }) };
  }, { admin: true, soloDueno: true });
}
