// OPORTIA: servidor web. Une la entrada protegida, las rutas de la API y las pantallas.
// Este programa NUNCA borra archivos de datos.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entradaPermitida, esLocal, clienteDe, esHttps, nombrePermitido } from './nucleo/red.js';
import { ErrorHttp, enviarJson, crearRuteador, servirArchivo, CABECERAS_SEGURIDAD } from './nucleo/http.js';
import { leerSesion, leerGalleta } from './cuentas/sesiones.js';
import { registrarRutasCuentas } from './api/cuentas.js';
import { registrarRutasProyectos } from './api/proyectos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(RAIZ, 'public');

export const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

// Protección contra pedidos falsos desde otras páginas: toda acción necesita la cabecera X-Oportia
// (que solo pone la propia app) y, si el navegador dice de dónde viene, tiene que ser de OPORTIA.
function origenValido(req) {
  if (req.headers['x-oportia'] !== '1') return false;
  const origen = req.headers.origin;
  if (!origen) return true;
  let host;
  try {
    host = new URL(origen).host;
  } catch {
    return false;
  }
  const esperado = (esLocal(req.socket.remoteAddress) && req.headers['x-forwarded-host']) || req.headers.host;
  return host === esperado;
}

function texto(res, codigo, mensaje) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CABECERAS_SEGURIDAD });
  res.end(mensaje);
}

// opciones.db: la base abierta (null si no se pudo abrir). opciones.limites: límites de cuentas (para pruebas).
// opciones.proyectos: límites o motor de las rutas de proyectos (solo para pruebas).
export function crearServidor({ db = null, limites, proyectos = {} } = {}) {
  const rutas = crearRuteador();
  registrarRutasCuentas(rutas, { version: VERSION, limites });
  registrarRutasProyectos(rutas, proyectos);
  const sw = readFileSync(join(PUB, 'sw.js'));

  async function atenderApi(req, res, ruta) {
    // Si la base no abrió, responde 503: el actualizador del servidor lo ve y vuelve a la versión anterior.
    if (!db) return enviarJson(res, 503, { app: 'oportia', estado: 'error', version: VERSION, base: 'no disponible' });
    const encontrada = rutas.buscar(req.method, ruta);
    if (!encontrada) return enviarJson(res, 404, { error: 'no_existe' });
    if (encontrada.metodoNoPermitido) return enviarJson(res, 405, { error: 'metodo_no_permitido' });
    if (encontrada.direccionNoValida) return enviarJson(res, 400, { error: 'direccion_no_valida' });
    if (req.method !== 'GET' && !origenValido(req)) return enviarJson(res, 403, { error: 'origen_no_valido' });

    const token = leerGalleta(req);
    const usuario = leerSesion(db, token);
    const { opciones } = encontrada;
    if (!opciones.publica && !usuario) return enviarJson(res, 401, { error: 'no_has_entrado' });
    if (usuario?.debeCambiarClave && !opciones.publica && !opciones.permitirConClaveTemporal) return enviarJson(res, 403, { error: 'debe_cambiar_clave' });
    if (opciones.admin && usuario?.rol !== 'admin') return enviarJson(res, 403, { error: 'solo_admin' });

    try {
      const r = await encontrada.manejador({ db, req, res, usuario, token, parametros: encontrada.parametros, cliente: clienteDe(req), https: esHttps(req) });
      enviarJson(res, r.codigo, r.datos, r.cabeceras);
    } catch (error) {
      if (error instanceof ErrorHttp) return enviarJson(res, error.codigo, { error: error.clave });
      throw error;
    }
  }

  async function atender(req, res) {
    if (!entradaPermitida(req.socket.localAddress)) return texto(res, 403, 'Entra por https://jarvis.taila693e9.ts.net');
    if (!nombrePermitido(req)) return texto(res, 421, 'Entra por https://jarvis.taila693e9.ts.net');
    let ruta;
    try {
      ruta = new URL(req.url, 'http://x').pathname;
    } catch {
      // Una dirección mal formada no puede tumbar el servidor: se responde 400 y se sigue.
      return texto(res, 400, 'Dirección no válida');
    }
    if (ruta.startsWith('/api/')) return atenderApi(req, res, ruta);
    if (req.method !== 'GET' && req.method !== 'HEAD') return texto(res, 405, 'Método no permitido');
    if (ruta === '/sw.js') {
      // Se sigue sirviendo para que los navegadores que tenían la app vieja de JARVIS la borren.
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', ...CABECERAS_SEGURIDAD });
      return res.end(sw);
    }
    if (servirArchivo(res, PUB, ruta)) return;
    // Rutas sin extensión (por ejemplo /inicio) muestran la app; lo demás no existe.
    if (!extname(ruta)) return servirArchivo(res, PUB, '/');
    return texto(res, 404, 'No existe');
  }

  return createServer((req, res) => {
    atender(req, res).catch(error => {
      console.error('Error atendiendo', req.method, req.url, error);
      if (!res.headersSent) enviarJson(res, 500, { error: 'error_interno' });
      else res.end();
    });
  });
}
