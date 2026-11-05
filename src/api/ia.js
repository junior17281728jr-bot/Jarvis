// Rutas de la IA opcional (fase 1, parte d). Los errores son claves; las pantallas las traducen.
//  - Administrador → Inteligencia artificial: ver el estado (también por el enlace público), APAGAR (desde cualquier
//    entrada: apagar nunca gasta) y cambiar los ajustes (solo desde la cuenta de Tailscale del dueño: soloDueno).
//  - El detalle del gasto: solo desde la red de Tailscale (soloTailnet), y solo números y claves.
//  - La ayuda en un proyecto: cada cuenta solo ve y pide la de sus proyectos. La de la cuenta del administrador se paga
//    con el tope general: se pide solo desde la red de Tailscale (una contraseña robada en el enlace público no gasta).
//    Una cuenta sin presupuesto de IA (lo normal en la fase 1) solo recibe { disponible: false }: nada del estado del
//    dueño (saldo, claves, pausas).
// Este archivo NUNCA llama a la IA (eso lo hace solo el trabajador: src/ia/cliente.js). Lo que gasta se pone en la fila
// de tareas como 'ia.interpretar', con el precio máximo que la persona vio y aceptó.
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { vieneDeTailscale } from '../nucleo/red.js';
import { encolar } from '../tareas/cola.js';
import { leerModoSeguro } from '../tareas/modo-seguro.js';
import { espacioDe, pendienteDeProyecto, puedeTenerOtraVersion, LUGARES_PARA_AYUDA_IA } from '../proyectos/proyectos.js';
import { duenoDeTailscale } from '../cuentas/tailscale.js';
import { PLANES } from '../cuentas/planes.js';
import { leerConfigIa, guardarConfigIa, usdAMicro, esEspacioAdmin, LIMITES_IA } from '../ia/config.js';
import { disponibilidad, elegirProveedor } from '../ia/presupuesto.js';
import { estadoIA, consumoIA } from '../ia/consumo.js';
import { armarPeticion, PROPOSITO_AYUDA } from '../ia/interpretar.js';

const DIEZ_MINUTOS = 10 * 60 * 1000;
const DIA_MS = 86_400_000;
// Lo único que ve de la ayuda una cuenta que no es la del administrador (nunca el estado del dueño: saldo, clave…).
const MOTIVOS_PARA_CUENTAS = new Set(['ok', 'tope_espacio', 'demasiadas_llamadas', 'trabajo_en_pausa', 'sin_pendiente', 'en_papelera', 'demasiadas_versiones',
  'caducada', 'version_cambio', 'rechazada', 'respuesta_no_valida', 'respuesta_incompleta', 'demasiado_largo', 'precio_cambio']);

export function crearLimitesIa() {
  return {
    ajustes: new Limitador({ maximo: 30, ventanaMs: DIEZ_MINUTOS }),
    apagar: new Limitador({ maximo: 30, ventanaMs: DIEZ_MINUTOS }),
    ayuda: new Limitador({ maximo: 10, ventanaMs: DIEZ_MINUTOS }),
    lecturas: new Limitador({ maximo: 600, ventanaMs: DIEZ_MINUTOS }),
  };
}

// La programa de la ayuda de un proyecto: una sola viva a la vez por proyecto (id interno: único en toda la base).
export const programaDeAyuda = proyectoInternoId => `ia.interpretar:p${proyectoInternoId}`;

// La última ayuda pedida para ese proyecto en las últimas 24 horas: { estado, resultado } (de la propia cuenta).
function ultimaAyuda(db, { espacioId, proyectoInternoId, paraCuenta, ahora }) {
  const f = db.prepare(`SELECT id, estado, resultado FROM tareas WHERE programa = ? AND espacio_id = ? AND tipo = 'ia.interpretar' AND creada_en >= ?
    ORDER BY id DESC LIMIT 1`).get(programaDeAyuda(proyectoInternoId), espacioId, new Date(ahora - DIA_MS).toISOString());
  if (!f) return null;
  let resultado = null;
  try { resultado = f.resultado == null ? null : JSON.parse(f.resultado); } catch { resultado = null; }
  if (resultado && typeof resultado === 'object') {
    resultado = {
      usada: resultado.usada === true,
      motivo: typeof resultado.motivo === 'string' ? resultado.motivo : null,
      numero: Number.isSafeInteger(resultado.numero) ? resultado.numero : null,
      costoMicro: Number.isSafeInteger(resultado.costoMicro) ? resultado.costoMicro : null,
    };
    if (paraCuenta && resultado.motivo && !MOTIVOS_PARA_CUENTAS.has(resultado.motivo)) resultado.motivo = 'no_disponible';
  } else resultado = null;
  return { id: f.id, estado: f.estado, resultado };
}

export function registrarRutasIa(rutas, { config = null, supervisor = null, limites = {} } = {}) {
  const topes = { ...crearLimitesIa(), ...limites };
  const necesitaConfig = () => { if (!config) throw new ErrorHttp(503, 'almacen_no_disponible'); };
  const contar = (tope, usuario) => { if (!tope.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos'); };
  const estado = (db, req, usuario) => {
    const espacioAdmin = espacioDe(db, usuario)?.id ?? null;
    const dueno = duenoDeTailscale(db, req, usuario);
    return estadoIA(db, { config, enTailnet: vieneDeTailscale(req).si, esDueno: dueno.si, motivoDueno: dueno.motivo, espacioAdmin });
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
      if (!['encendida', 'ayudaProyectos', 'topeGeneralUsd', 'topesPlanUsd', 'usar'].includes(campo)) throw new ErrorHttp(400, 'datos_no_validos');
    }
    if ('encendida' in datos) cambios.encendida = datos.encendida;
    if ('ayudaProyectos' in datos) cambios.ayudaProyectos = datos.ayudaProyectos;
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
    guardarConfigIa(db, cambios, { config, usuarioId: usuario.id, origen: 'pantalla' });
    return { codigo: 200, datos: estado(db, req, usuario) };
  }, { admin: true, soloDueno: true });

  rutas.agregar('GET', '/api/admin/ia/consumo', ({ db, req, usuario }) => {
    necesitaConfig();
    const consulta = new URL(req.url, 'http://x').searchParams;
    const espacioAdmin = espacioDe(db, usuario)?.id ?? null;
    return { codigo: 200, datos: consumoIA(db, { mes: consulta.get('mes'), antesDe: consulta.get('antes'), espacioAdmin }) };
  }, { admin: true, soloTailnet: true });

  // ---------- La ayuda en un proyecto ----------

  // Todo lo que se revisa antes de ofrecer (o de poner en la fila) la ayuda, sin escribir nada.
  function revisarAyuda(db, { e, numeroProyecto, idioma, ahora }) {
    const info = pendienteDeProyecto(db, e.id, numeroProyecto); // 404 si no es de esta cuenta
    const r = { info, motivo: null, d: null };
    if (!info.pendiente) { r.motivo = 'sin_pendiente'; return r; }
    const no = puedeTenerOtraVersion(db, { espacioId: e.id, proyectoId: numeroProyecto, libres: LUGARES_PARA_AYUDA_IA });
    if (no) { r.motivo = no; return r; }
    const peticion = armarPeticion(info.pendiente, idioma);
    if (!peticion) { r.motivo = 'demasiado_largo'; return r; }
    r.d = disponibilidad(db, { config, espacioId: e.id, proposito: PROPOSITO_AYUDA, entradaMax: peticion.entradaMax, ahora });
    if (!r.d.disponible) { r.motivo = r.d.motivo; return r; }
    if (leerModoSeguro(db).activo) { r.motivo = 'trabajo_en_pausa'; return r; }
    r.motivo = 'ok';
    return r;
  }

  // ¿Esta cuenta (que no es la del administrador) tiene presupuesto de IA? Si no, no se le dice nada más.
  function cuentaConPresupuesto(db, espacioId, ahora) {
    const cfg = leerConfigIa(db);
    if (!cfg.encendida || !cfg.ayudaProyectos) return false;
    const plan = db.prepare('SELECT plan FROM espacios WHERE id = ?').get(espacioId)?.plan;
    if (!((cfg.topesPlanMicro?.[plan] ?? 0) > 0)) return false;
    return elegirProveedor(db, config, cfg, ahora).ok;
  }

  rutas.agregar('GET', '/api/proyectos/:id/ayuda-ia', ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    const e = espacioDe(db, usuario);
    if (!e) throw new ErrorHttp(409, 'sin_espacio');
    contar(topes.lecturas, usuario);
    const ahora = Date.now();
    const esAdmin = esEspacioAdmin(db, e.id);
    const info = pendienteDeProyecto(db, e.id, parametros.id); // 404 si no es de esta cuenta
    const tarea = ultimaAyuda(db, { espacioId: e.id, proyectoInternoId: info.id, paraCuenta: !esAdmin, ahora });
    if (esAdmin && !vieneDeTailscale(req).si) return { codigo: 200, datos: { disponible: false, motivo: 'solo_tailnet', esAdmin: true, tarea } };
    if (!esAdmin && !cuentaConPresupuesto(db, e.id, ahora)) return { codigo: 200, datos: { disponible: false } };
    const r = revisarAyuda(db, { e, numeroProyecto: parametros.id, idioma: usuario.idioma, ahora });
    const d = r.d ?? {};
    const motivo = esAdmin || MOTIVOS_PARA_CUENTAS.has(r.motivo) ? r.motivo : 'no_disponible';
    const comun = {
      disponible: r.motivo === 'ok', motivo, version: info.pendiente?.numero ?? null,
      maximoMicro: d.maximoMicro ?? null, tipicoMicro: d.tipicoMicro ?? null, usadoMicro: d.usadoMicro ?? null,
      topeMicro: d.topeMicro ?? null, vuelveEl: d.vuelveEl ?? null, proveedor: d.proveedor ?? null, topeLleno: d.topeLleno ?? null, tarea,
    };
    return { codigo: 200, datos: esAdmin ? { ...comun, modelo: d.modelo ?? null, esAdmin: true } : comun };
  });

  rutas.agregar('POST', '/api/proyectos/:id/versiones/:numero/ayuda-ia', async ({ db, req, usuario, parametros }) => {
    necesitaConfig();
    const e = espacioDe(db, usuario);
    if (!e) throw new ErrorHttp(409, 'sin_espacio');
    if (!e.puedeEscribir) throw new ErrorHttp(403, 'solo_lectura');
    contar(topes.ayuda, usuario);
    const esAdmin = esEspacioAdmin(db, e.id);
    if (esAdmin && !vieneDeTailscale(req).si) throw new ErrorHttp(403, 'solo_desde_tailnet');
    const datos = await leerJson(req);
    const aceptado = datos.maximoMicro;
    if (!Number.isSafeInteger(aceptado) || aceptado < 0) throw new ErrorHttp(400, 'datos_no_validos');
    const ahora = Date.now();
    const r = revisarAyuda(db, { e, numeroProyecto: parametros.id, idioma: usuario.idioma, ahora });
    const { info } = r;
    if (info.enPapelera || r.motivo === 'en_papelera') throw new ErrorHttp(409, 'en_papelera');
    if (r.motivo === 'demasiadas_versiones') throw new ErrorHttp(409, 'demasiadas_versiones');
    if (!info.pendiente || String(info.pendiente.numero) !== String(parametros.numero) || info.ultima !== info.pendiente.numero) {
      throw new ErrorHttp(409, 'version_no_pendiente');
    }
    if (r.motivo === 'trabajo_en_pausa') throw new ErrorHttp(409, 'trabajo_en_pausa');
    if (r.motivo !== 'ok') throw new ErrorHttp(409, 'ia_no_disponible');
    // Nunca más de lo que la persona vio y aceptó: si el precio subió, la pantalla vuelve a preguntar.
    if (r.d.maximoMicro > aceptado) throw new ErrorHttp(409, 'precio_cambio', { maximoMicro: r.d.maximoMicro });
    const version = info.pendiente.numero;
    const { id, nueva } = encolar(db, {
      tipo: 'ia.interpretar',
      espacioId: e.id,
      // A propósito sin proyecto: la fila solo toma tareas de proyectos en marcha, y este todavía espera aprobación;
      // además, un problema de la ayuda nunca deja al proyecto «con errores».
      proyectoId: null,
      programa: programaDeAyuda(info.id),
      claveUnica: `${programaDeAyuda(info.id)}:v${version}:${ahora}`,
      datos: { proyecto: info.numero, version, usuarioId: usuario.id, idioma: usuario.idioma === 'en' ? 'en' : 'es', pedidaEn: ahora, maximoMicro: aceptado },
      creadaPor: usuario.id,
    }, { ahora });
    if (!nueva) throw new ErrorHttp(409, 'ya_hay_otra_en_marcha');
    try { supervisor?.despertar?.(); } catch { /* el trabajador la toma en su próxima vuelta */ }
    return { codigo: 202, datos: { tarea: { id, estado: 'lista' } } };
  });
}
