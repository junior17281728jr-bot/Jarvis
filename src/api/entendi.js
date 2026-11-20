// Academia 0.14.77: «¿Lo entendiste? 👍 / 👎» (src/academia/entendi.js) y Administrador → Avanzado → «Para Claude»
// (src/academia/para-claude.js).
//  - POST /api/academia/entendi             el voto de quien entró (cambiarlo = votar otra vez). Responde solo SU voto.
//  - GET  /api/admin/academia/para-claude   el informe y su Markdown (solo el administrador: 401/403 para los demás).
import { ErrorHttp, leerJson } from '../nucleo/http.js';
import { Limitador } from '../nucleo/limites.js';
import { paqueteActivo } from '../academia/paquetes.js';
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
  rutas.agregar('GET', '/api/admin/academia/para-claude', ({ db }) => {
    const reporte = armarReporte(db, activo(db), { ahora: reloj() });
    return { codigo: 200, datos: { reporte, markdown: markdownParaClaude(reporte) } };
  }, { admin: true });
}
