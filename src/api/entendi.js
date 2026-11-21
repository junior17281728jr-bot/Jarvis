// Academia 0.14.77: «¿Lo entendiste? 👍 / 👎» (src/academia/entendi.js) y Administrador → Avanzado → «Para Claude»
// (src/academia/para-claude.js).
//  - POST /api/academia/entendi             el voto de quien entró (cambiarlo = votar otra vez). Responde solo SU voto.
//  - POST /api/academia/consecuencia        0.14.95: se vio una consecuencia 3D ({ situacion, opcion }): un número por
//                                           consecuencia en ajustes («academia.consecuencias_vistas»), sin nombres.
//  - GET  /api/admin/academia/para-claude   el informe y su Markdown (solo el administrador: 401/403 para los demás).
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { paqueteActivo, leerAjuste, guardarAjuste } from '../academia/paquetes.js';
import { SITUACIONES_3D } from '../academia/diagramas.js';
import { votar } from '../academia/entendi.js';
import { armarReporte, markdownParaClaude } from '../academia/para-claude.js';

export function registrarRutasEntendi(rutas, { config = null, reloj = Date.now, limites = {} } = {}) {
  const topes = { votos: new Limitador({ maximo: 600, ventanaMs: 3600 * 1000 }), ...limites };
  const activo = db => (config ? paqueteActivo(db, config) : null);
  rutas.agregar('POST', '/api/academia/entendi', async ({ db, req, usuario }) => {
    const d = await leerJson(req);
    if (!topes.votos.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    const datos = { tipo: d?.tipo, voto: d?.voto, materia: d?.materia, tema: d?.tema, n: d?.n, pregunta: d?.pregunta, clave: d?.clave };
    return { codigo: 200, datos: votar(db, activo(db), usuario, datos, { ahora: reloj() }) };
  });
  rutas.agregar('POST', '/api/academia/consecuencia', async ({ db, req, usuario }) => {
    const d = await leerJson(req);
    if (!topes.votos.permitir(String(usuario.id))) throw new ErrorHttp(429, 'demasiados_intentos');
    return { codigo: 200, datos: { vistas: anotarConsecuencia(db, d?.situacion, d?.opcion) } };
  });
  rutas.agregar('GET', '/api/admin/academia/para-claude', ({ db }) => {
    const reporte = armarReporte(db, activo(db), { ahora: reloj() });
    return { codigo: 200, datos: { reporte, markdown: markdownParaClaude(reporte) } };
  }, { admin: true });
}

// 0.14.95: cuántas veces se vio cada consecuencia («clase-c.entrar»: 3). Solo ids que existen; nunca se borra nada.
export const CLAVE_CONSECUENCIAS = 'academia.consecuencias_vistas';
export function anotarConsecuencia(db, situacion, opcion) {
  if (typeof situacion !== 'string' || !Object.hasOwn(SITUACIONES_3D, situacion) || typeof opcion !== 'string' || !SITUACIONES_3D[situacion].opciones.includes(opcion)) throw new ErrorHttp(400, 'datos_no_validos');
  let cuentas;
  try { cuentas = JSON.parse(leerAjuste(db, CLAVE_CONSECUENCIAS) ?? '{}'); } catch { cuentas = null; }
  // Algo que no se entiende ahí se deja como está (nunca se pisa).
  if (!cuentas || typeof cuentas !== 'object' || Array.isArray(cuentas)) return 0;
  const k = `${situacion}.${opcion}`;
  cuentas[k] = (Number.isSafeInteger(cuentas[k]) ? cuentas[k] : 0) + 1;
  guardarAjuste(db, CLAVE_CONSECUENCIAS, JSON.stringify(cuentas));
  return cuentas[k];
}
