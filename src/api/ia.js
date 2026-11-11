// Rutas de la IA opcional (fase 1, parte d). Los errores son claves; las pantallas las traducen.
//  - Administrador → Inteligencia artificial: ver el estado (también por el enlace público), APAGAR (desde cualquier
//    entrada: apagar nunca gasta) y cambiar los ajustes (solo desde la cuenta de Tailscale del dueño: soloDueno).
//  - El detalle del gasto: solo desde la red de Tailscale (soloTailnet), y solo números y claves.
//  - 0.8.0: la «ayuda de IA» en los proyectos de OPORTIA se quitó junto con los proyectos.
// Este archivo NUNCA llama a la IA (eso lo hace solo el trabajador: src/ia/cliente.js).
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { vieneDeTailscale } from '../nucleo/red.js';
import { espacioDe } from '../cuentas/espacios.js';
import { duenoDeTailscale } from '../cuentas/tailscale.js';
import { PLANES } from '../cuentas/planes.js';
import { guardarConfigIa, usdAMicro, LIMITES_IA } from '../ia/config.js';
import { estadoIA, consumoIA } from '../ia/consumo.js';

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
    // Ronda 4 de revisión: si el cambio apagó la IA (por ejemplo, el último «Usar …» o el tope en US$0), la respuesta lo
    // dice (apagadaPor: lo que falta) y la pantalla explica por qué, nunca en silencio.
    const informe = {};
    guardarConfigIa(db, cambios, { config, usuarioId: usuario.id, origen: 'pantalla', informe });
    return { codigo: 200, datos: { ...estado(db, req, usuario), apagadaPor: informe.apagadaPor ?? null } };
  }, { admin: true, soloDueno: true });

  rutas.agregar('GET', '/api/admin/ia/consumo', ({ db, req, usuario }) => {
    necesitaConfig();
    const consulta = new URL(req.url, 'http://x').searchParams;
    const espacioAdmin = espacioDe(db, usuario)?.id ?? null;
    return { codigo: 200, datos: consumoIA(db, { mes: consulta.get('mes'), antesDe: consulta.get('antes'), espacioAdmin }) };
  }, { admin: true, soloTailnet: true });
}
