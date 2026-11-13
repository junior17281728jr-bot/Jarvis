// 0.14.8: las rutas de «Mejorar la app con Claude» (solo el administrador; aquí nunca se llama a la IA ni a GitHub: eso lo
// hace el trabajador, y las pruebas el probador de este proceso).
//  - GET  /api/admin/academia/app                  el estado, las propuestas (con su diff), el gasto, si hay token
//  - POST /api/admin/academia/app/config           { pausada?, autoSubir?, activa?, topeUsd? }
//  - POST /api/admin/academia/app/pedir            { texto } un cambio que pide el dueño (409 ia_en_pausa)
//  - POST /api/admin/academia/app/revisar          «Que Claude busque mejoras»: otra vuelta por todas las pantallas
//  - POST /api/admin/academia/app/deshacer         «Deshacer el último cambio» (un commit nuevo hacia adelante)
//  - POST /api/admin/academia/app/:id/aprobar      «Aprobar» (solo cuando «subir solo» está apagado)
//  - POST /api/admin/academia/app/:id/descartar    no subirlo
//  - GET  /api/admin/academia/app/:id/parche       el cambio para «Copiar / Descargar» (diff + JSON; nunca un token)
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { enTransaccion } from '../nucleo/db.js';
import { auditar } from '../cuentas/usuarios.js';
import { encolar } from '../tareas/cola.js';
import { usdAMicro } from '../ia/config.js';
import { leerConfigFabrica } from '../academia/fabrica.js';
import { vistaApp, guardarConfigApp, leerConfigApp, pedirMejora, aprobarPropuesta, descartarPropuesta, pedirDeshacer, otraRonda, parcheParaDescargar, LIMITES_APP } from '../academia/app-mejora.js';

const conPunto = v => (typeof v === 'string' ? v.trim().replace(',', '.') : v);
// Solo lo público del token (sus 4 últimos caracteres y cuándo se guardó): nunca el token.
const estadoToken = db => {
  const f = db.prepare("SELECT final, creado_en FROM secretos WHERE uso = 'github_token' AND espacio_id IS NULL AND estado = 'activa' ORDER BY id DESC LIMIT 1").get();
  return f ? { hay: true, final: f.final, en: f.creado_en } : { hay: false };
};

export function registrarRutasAppMejora(rutas, { config = null, supervisor = null, reloj = Date.now } = {}) {
  reloj ??= Date.now;
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'academia_no_disponible'); };
  const despertar = (db, usuario) => {
    const ahora = reloj();
    try { encolar(db, { tipo: 'academia.fabrica', programa: 'academia.fabrica', claveUnica: `academia.fabrica@app-${ahora}`, creadaPor: usuario?.id ?? null }, { ahora }); } catch { /* ya hay una en la fila */ }
    try { supervisor?.despertar?.(); } catch { /* la toma en su próxima vuelta */ }
  };
  const vista = db => vistaApp(db, { ahora: reloj(), pausadaIa: leerConfigFabrica(db).pausada, token: estadoToken(db) });
  const idDe = parametros => { if (!/^[0-9a-f]{12}$/.test(String(parametros.id))) throw new ErrorHttp(404, 'no_existe'); return parametros.id; };

  rutas.agregar('GET', '/api/admin/academia/app', ({ db }) => { necesitaConfig(); return { codigo: 200, datos: vista(db) }; }, { admin: true });
  rutas.agregar('POST', '/api/admin/academia/app/config', async ({ db, req, usuario }) => {
    const datos = await leerJson(req);
    const cambios = {};
    for (const k of ['pausada', 'autoSubir', 'activa']) if (typeof datos?.[k] === 'boolean') cambios[k] = datos[k];
    if (datos?.topeUsd != null) cambios.topeMicro = usdAMicro(conPunto(datos.topeUsd), LIMITES_APP.topeMaxMicro);
    const antes = leerConfigApp(db);
    const cfg = enTransaccion(db, () => {
      const nueva = guardarConfigApp(db, cambios);
      auditar(db, { usuarioId: usuario.id, accion: 'app_mejora_config', detalle: JSON.stringify({ antes: { ...antes, repo: undefined }, despues: { ...nueva, repo: undefined } }).slice(0, 500) });
      return nueva;
    });
    if (cambios.pausada === false || cambios.activa === true || cambios.topeMicro > antes.topeMicro) despertar(db, usuario);
    return { codigo: 200, datos: { config: cfg } };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/app/pedir', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    if (typeof datos?.texto !== 'string' || !datos.texto.trim() || datos.texto.length > 2000) throw new ErrorHttp(400, 'datos_no_validos');
    if (leerConfigFabrica(db).pausada) throw new ErrorHttp(409, 'ia_en_pausa');
    enTransaccion(db, () => pedirMejora(db, { texto: datos.texto, origen: 'dueno', ahora: reloj() }));
    despertar(db, usuario);
    return { codigo: 200, datos: vista(db) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/app/revisar', ({ db, usuario }) => {
    necesitaConfig();
    enTransaccion(db, () => otraRonda(db, { ahora: reloj() }));
    despertar(db, usuario);
    return { codigo: 200, datos: vista(db) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/app/deshacer', ({ db, usuario }) => {
    necesitaConfig();
    const r = enTransaccion(db, () => pedirDeshacer(db, { ahora: reloj() }));
    if (!r.ok) throw new ErrorHttp(409, r.motivo);
    despertar(db, usuario);
    return { codigo: 200, datos: vista(db) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/app/:id/aprobar', ({ db, parametros, usuario }) => {
    const p = enTransaccion(db, () => aprobarPropuesta(db, { id: idDe(parametros), usuarioId: usuario.id, ahora: reloj() }));
    if (!p) throw new ErrorHttp(409, 'no_se_puede');
    despertar(db, usuario);
    return { codigo: 200, datos: vista(db) };
  }, { admin: true, soloDueno: true });
  rutas.agregar('POST', '/api/admin/academia/app/:id/descartar', ({ db, parametros }) => {
    const p = enTransaccion(db, () => descartarPropuesta(db, { id: idDe(parametros), ahora: reloj() }));
    if (!p) throw new ErrorHttp(409, 'no_se_puede');
    return { codigo: 200, datos: vista(db) };
  }, { admin: true });
  rutas.agregar('GET', '/api/admin/academia/app/:id/parche', ({ db, parametros }) => {
    const d = parcheParaDescargar(db, idDe(parametros));
    if (!d) throw new ErrorHttp(404, 'no_existe');
    return { codigo: 200, datos: d };
  }, { admin: true });
}
