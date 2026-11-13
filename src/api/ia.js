// Rutas de la IA opcional (fase 1, parte d). Los errores son claves; las pantallas las traducen.
//  - Administrador → Inteligencia artificial: ver el estado (también por el enlace público), APAGAR (desde cualquier
//    entrada: apagar nunca gasta) y cambiar los ajustes. 0.12.3: todo con la sesión de administrador, también por el
//    enlace público (antes los ajustes eran solo desde la cuenta de Tailscale del dueño y el detalle, desde Tailscale).
//  - El detalle del gasto: solo números y claves.
//  - 0.8.0: la «ayuda de IA» en los proyectos de OPORTIA se quitó junto con los proyectos.
//  - 0.9.0: «Instructor con IA» de la academia (instructorIa, instructorModelo), con las mismas reglas del dueño.
// Este archivo NUNCA llama a la IA (eso lo hace solo el trabajador: src/ia/cliente.js).
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { vieneDeTailscale } from '../nucleo/red.js';
import { espacioDe } from '../cuentas/espacios.js';
import { PLANES } from '../cuentas/planes.js';
import { guardarConfigIa, usdAMicro, LIMITES_IA, leerConfigIa, PREFERIDOS, proveedoresParaEncender } from '../ia/config.js';
import { estadoIA, consumoIA } from '../ia/consumo.js';
import { modelosVistos } from '../ia/modelos.js';
import { precioPara, precioPublico, guardarPrecioPropio, leerTablaPropia, PROVEEDORES_CON_TABLA } from '../ia/precios.js';
import { leerConfigFabrica, guardarConfigFabrica, LIMITES_FABRICA } from '../academia/fabrica.js';
import { estimadoDibujos } from '../academia/dibujos-ia.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;

export function crearLimitesIa() {
  return {
    ajustes: new Limitador({ maximo: 30, ventanaMs: DIEZ_MINUTOS }),
    apagar: new Limitador({ maximo: 30, ventanaMs: DIEZ_MINUTOS }),
    lecturas: new Limitador({ maximo: 600, ventanaMs: DIEZ_MINUTOS }),
  };
}

export function registrarRutasIa(rutas, { config = null, supervisor = null, limites = {} } = {}) {
  const topes = { ...crearLimitesIa(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'almacen_no_disponible'); };
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const estado = (db, req, usuario) => {
    const espacioAdmin = espacioDe(db, usuario)?.id ?? null;
    // 0.12.3: esDueno (ve todo y cambia todo): cualquier administrador con su sesión, también por el enlace público.
    return estadoIA(db, { config, enTailnet: vieneDeTailscale(req).si, esDueno: usuario?.rol === 'admin', motivoDueno: null, espacioAdmin });
  };

  rutas.agregar('GET', '/api/admin/ia', ({ db, req, usuario }) => {
    necesitaConfig();
    return { codigo: 200, datos: estado(db, req, usuario) };
  }, { admin: true });

  // Apagar se puede siempre, desde cualquier entrada (también por el enlace público): nunca gasta. Lo que ya estaba en
  // camino termina y se anota; lo próximo ya encuentra la IA apagada.
  rutas.agregar('POST', '/api/admin/ia/apagar', ({ db, req, usuario }) => {
    necesitaConfig();
    contar(topes.apagar, usuario);
    guardarConfigIa(db, { encendida: false }, { config, usuarioId: usuario.id, origen: 'pantalla' });
    return { codigo: 200, datos: estado(db, req, usuario) };
  }, { admin: true });

  rutas.agregar('POST', '/api/admin/ia/ajustes', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    contar(topes.ajustes, usuario);
    const cambios = {};
    for (const campo of Object.keys(datos)) {
      if (!['encendida', 'ayudaProyectos', 'instructorIa', 'instructorModelo', 'prepararClase', 'topeGeneralUsd', 'topesPlanUsd', 'usar'].includes(campo)) throw new ErrorHttp(400, 'datos_no_validos');
    }
    if ('encendida' in datos) cambios.encendida = datos.encendida;
    if ('ayudaProyectos' in datos) cambios.ayudaProyectos = datos.ayudaProyectos;
    // 0.9.0: el instructor con IA de la academia (encenderlo y su modelo: Sonnet 5.5 o Haiku 5.5).
    if ('instructorIa' in datos) cambios.instructorIa = datos.instructorIa;
    if ('instructorModelo' in datos) cambios.instructorModelo = datos.instructorModelo;
    // 0.12.7: «Preparar la próxima clase con IA» (encendido por defecto; solo trabaja con la IA y el instructor encendidos).
    if ('prepararClase' in datos) cambios.prepararClase = datos.prepararClase;
    if ('topeGeneralUsd' in datos) cambios.topeGeneralMicro = usdAMicro(datos.topeGeneralUsd, LIMITES_IA.topeGeneralMaxMicro);
    if ('topesPlanUsd' in datos) {
      const t = datos.topesPlanUsd;
      if (!t || typeof t !== 'object' || Array.isArray(t)) throw new ErrorHttp(400, 'tope_no_valido');
      cambios.topesPlanMicro = {};
      for (const [plan, usd] of Object.entries(t)) {
        if (!PLANES.includes(plan)) throw new ErrorHttp(400, 'tope_no_valido');
        cambios.topesPlanMicro[plan] = usdAMicro(usd, LIMITES_IA.topePlanMaxMicro);
      }
    }
    if ('usar' in datos) cambios.usar = datos.usar;
    // Ronda 4 de revisión: si el cambio apagó la IA (por ejemplo, el último «Usar …» o el tope en US$0), la respuesta lo
    // dice (apagadaPor: lo que falta) y la pantalla explica por qué, nunca en silencio.
    const informe = {};
    guardarConfigIa(db, cambios, { config, usuarioId: usuario.id, origen: 'pantalla', informe });
    return { codigo: 200, datos: { ...estado(db, req, usuario), apagadaPor: informe.apagadaPor ?? null } };
  }, { admin: true, soloDueno: true });

  // 0.14.2: «IA (Claude o ChatGPT)»: quién escribe, el orden de «el que funcione», los modelos de ChatGPT y de la API
  // propia (de la lista de la prueba gratis), su tabla de precios y los «Dibujos con IA». Nunca una clave.
  const vistaProveedores = (db, ahora = Date.now()) => {
    const cfg = leerConfigIa(db);
    const listos = proveedoresParaEncender(db, config, cfg, ahora, { seguir: true });
    const tabla = leerTablaPropia(db);
    const proveedores = cfg.orden.map(id => {
      const p = cfg.proveedores[id];
      const modelos = [...new Set([p.modeloEscribir, p.modelo, p.modeloImagen].filter(Boolean))];
      return {
        id, usar: p.usar, modelo: p.modelo, modeloEscribir: p.modeloEscribir ?? null, modeloImagen: p.modeloImagen ?? null, base: p.base ?? null,
        clave: listos.find(x => x.id === id)?.clave ?? false,
        vistos: id === 'anthropic' ? [] : modelosVistos(db, id).modelos,
        precios: id === 'anthropic' ? [] : modelos.map(m => ({ modelo: m, ...precioPublico(precioPara(db, id, m, tabla)) })),
      };
    });
    const f = leerConfigFabrica(db);
    return { preferido: cfg.preferido, orden: cfg.orden, proveedores, dibujos: { ...f.dibujos, estimado: estimadoDibujos(db, config) }, encendida: cfg.encendida };
  };
  rutas.agregar('GET', '/api/admin/ia/proveedores', ({ db }) => {
    necesitaConfig();
    return { codigo: 200, datos: vistaProveedores(db) };
  }, { admin: true });
  // { preferido?, orden?, modelos?: { openai?: {...}, propia?: {...} }, basePropia? }. Elegir quién escribe enciende
  // su «Usar» (y con «el que funcione», el de cada uno que ya tiene su clave probada).
  rutas.agregar('POST', '/api/admin/ia/proveedores', async ({ db, req, usuario, confirmar }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    // Cambiar la dirección de la API propia cambia ADÓNDE va su clave: pide la contraseña otra vez, como cambiar una clave.
    if (datos && typeof datos === 'object' && 'basePropia' in datos) await confirmar();
    contar(topes.ajustes, usuario);
    if (!datos || typeof datos !== 'object') throw new ErrorHttp(400, 'datos_no_validos');
    const cambios = {};
    for (const campo of Object.keys(datos)) if (!['preferido', 'orden', 'modelos', 'basePropia'].includes(campo)) throw new ErrorHttp(400, 'datos_no_validos');
    if ('orden' in datos) cambios.orden = datos.orden;
    if ('modelos' in datos) cambios.modelos = datos.modelos;
    if ('basePropia' in datos) cambios.basePropia = typeof datos.basePropia === 'string' && !datos.basePropia.trim() ? null : datos.basePropia;
    if (Object.keys(cambios).length) guardarConfigIa(db, cambios, { config, usuarioId: usuario.id, origen: 'pantalla' });
    if ('preferido' in datos) {
      if (!PREFERIDOS.includes(datos.preferido)) throw new ErrorHttp(400, 'datos_no_validos');
      const cfg = leerConfigIa(db);
      const listos = proveedoresParaEncender(db, config, cfg, Date.now(), { seguir: true });
      const usar = {};
      if (datos.preferido === 'auto') { for (const p of listos) if (p.clave && p.precio && !p.usar) usar[p.id] = true; }
      else if (!cfg.proveedores[datos.preferido].usar) usar[datos.preferido] = true;
      guardarConfigIa(db, { preferido: datos.preferido, ...(Object.keys(usar).length ? { usar } : {}) }, { config, usuarioId: usuario.id, origen: 'pantalla' });
    }
    return { codigo: 200, datos: vistaProveedores(db) };
  }, { admin: true, soloDueno: true });
  // El precio de UN modelo (US$ por millón de tokens), o { borrar: true } para volver al de por defecto.
  rutas.agregar('POST', '/api/admin/ia/precios', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    contar(topes.ajustes, usuario);
    if (!PROVEEDORES_CON_TABLA.includes(datos?.proveedor)) throw new ErrorHttp(400, 'datos_no_validos');
    try {
      guardarPrecioPropio(db, { proveedor: datos.proveedor, modelo: datos.modelo, precio: datos.borrar === true ? null : { entrada: datos.entrada, cacheLectura: datos.cacheLectura, salida: datos.salida } });
    } catch { throw new ErrorHttp(400, 'precio_no_valido'); }
    return { codigo: 200, datos: vistaProveedores(db) };
  }, { admin: true, soloDueno: true });
  // «Dibujos con IA»: { activa?, topeUsd? } (apagados por defecto, con su tope propio).
  rutas.agregar('POST', '/api/admin/ia/dibujos', async ({ db, req, usuario }) => {
    necesitaConfig();
    const datos = await leerJson(req);
    contar(topes.ajustes, usuario);
    const cambio = {};
    if (typeof datos?.activa === 'boolean') cambio.activa = datos.activa;
    if (datos?.topeUsd != null) cambio.topeMicro = usdAMicro(typeof datos.topeUsd === 'string' ? datos.topeUsd.trim().replace(',', '.') : datos.topeUsd, LIMITES_FABRICA.dibujosMaxMicro);
    if (!Object.keys(cambio).length) throw new ErrorHttp(400, 'datos_no_validos');
    guardarConfigFabrica(db, { dibujos: cambio });
    return { codigo: 200, datos: vistaProveedores(db) };
  }, { admin: true, soloDueno: true });

  rutas.agregar('GET', '/api/admin/ia/consumo', ({ db, req, usuario }) => {
    necesitaConfig();
    const consulta = new URL(req.url, 'http://x').searchParams;
    const espacioAdmin = espacioDe(db, usuario)?.id ?? null;
    return { codigo: 200, datos: consumoIA(db, { mes: consulta.get('mes'), antesDe: consulta.get('antes'), espacioAdmin }) };
  }, { admin: true });
}
