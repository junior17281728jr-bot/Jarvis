// OPORTIA: servidor web. Une la entrada protegida, las rutas de la API y las pantallas.
// Este programa NUNCA borra archivos de datos.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { entradaPermitida, esLocal, clienteDe, esHttps, nombrePermitido, vieneDeTailscale } from './nucleo/red.js';
import { ErrorHttp, enviarJson, crearRuteador, servirArchivo, CABECERAS_SEGURIDAD } from './nucleo/http.js';
import { leerSesion, leerGalleta } from './cuentas/sesiones.js';
import { registrarRutasCuentas } from './api/cuentas.js';
import { registrarRutasTareas } from './api/tareas.js';
import { registrarRutasIa } from './api/ia.js';
import { registrarRutasClaves } from './api/claves.js';
import { registrarRutasCopias } from './api/copias.js';
import { registrarRutasCanales } from './api/canales.js';
import { registrarRutasAcademia } from './api/academia.js';
import { registrarRutasInstructor } from './api/instructor.js';
import { registrarRutasPagos } from './api/pagos.js';
import { registrarRutasPerfil } from './api/perfil.js';
import { registrarRutasTerminos } from './api/terminos.js';
import { registrarRutasSoporte } from './api/soporte.js';
import { duenoDeTailscale } from './cuentas/tailscale.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(RAIZ, 'public');

export const VERSION = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

// La «huella» del código: los primeros 12 caracteres de un sha256 de todos los src/**/*.js, src/**/*.json (por
// ejemplo, la tabla de precios de la IA) y package.json (con
// sus rutas, en orden). Cambia con CUALQUIER cambio de código, aunque nadie suba la versión. El modo seguro la
// usa para saber si el código es el mismo que falló (solo cuenta las caídas del mismo código) y para quitarse
// solo una vez cuando llega código nuevo.
function calcularHuella() {
  const archivos = [];
  (function recorrer(carpeta) {
    for (const nombre of readdirSync(carpeta)) {
      const ruta = join(carpeta, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (nombre.endsWith('.js') || nombre.endsWith('.json')) archivos.push(ruta);
    }
  })(join(RAIZ, 'src'));
  archivos.push(join(RAIZ, 'package.json'));
  const huella = createHash('sha256');
  for (const ruta of archivos.map(r => relative(RAIZ, r).split(sep).join('/')).sort()) {
    huella.update(`${ruta}\0`);
    huella.update(readFileSync(join(RAIZ, ruta)));
    huella.update('\0');
  }
  return huella.digest('hex').slice(0, 12);
}

export const HUELLA = calcularHuella();

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

// Lo que se agrega a una respuesta de error: solo un objeto de datos simples (listas de claves, números).
function detalleSeguro(detalle) {
  if (!detalle || typeof detalle !== 'object' || Array.isArray(detalle)) return {};
  const limpio = {};
  for (const [clave, valor] of Object.entries(detalle)) {
    if (!/^[a-zA-Z]{1,30}$/.test(clave)) continue;
    if (Number.isSafeInteger(valor)) limpio[clave] = valor;
    else if (Array.isArray(valor) && valor.every(v => typeof v === 'string' && /^[a-z_]{1,40}$/.test(v))) limpio[clave] = valor.slice(0, 20);
  }
  return limpio;
}

// Respuestas que viajan comprimidas si el navegador sabe (de 7 a 30 KB bajan a 1-6 KB): las grandes que piden
// las pantallas y que no llevan ningún secreto (ver enviarJson en src/nucleo/http.js). Una ruta nueva no se
// comprime hasta que se agregue aquí.
const RESPUESTAS_COMPRIMIBLES = new Set([
  '/api/admin/sistema', '/api/admin/tareas', '/api/admin/usuarios',
  // Academia (0.7.0): ninguna lleva secretos.
  '/api/academia/camino', '/api/academia/temas/:materia/:tema', '/api/academia/intentos/:id', '/api/academia/progreso', '/api/admin/academia/alumnos',
  '/api/admin/academia/alumnos/:id', '/api/admin/academia', '/api/admin/academia/respuestas',
  // 0.9.0: la ficha de un alumno, uno de sus intentos y «Comparar».
  '/api/admin/academia/alumnos/:id/ficha', '/api/admin/academia/alumnos/:id/intentos/:intento', '/api/admin/academia/comparar/:ids',
  '/api/admin/academia/reporte']);

function texto(res, codigo, mensaje) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CABECERAS_SEGURIDAD });
  res.end(mensaje);
}

// opciones.db: la base abierta (null si no se pudo abrir). opciones.limites: límites de cuentas (para pruebas).
// opciones.supervisor: el que cuida al trabajador (src/tareas/supervisor.js); null en las pruebas que no lo usan.
// opciones.tareas: límites de las rutas del sistema (solo para pruebas).
// opciones.config: la configuración del servidor (src/nucleo/config.js). La necesitan las claves y la IA (dónde está el
// archivo que protege las claves; en las pruebas, adónde va el proveedor falso). Sin ella, esas rutas responden 503.
// opciones.ia: límites de las rutas de la IA y de las claves, y probadores de prueba (solo para pruebas).
// opciones.copias: límites de las rutas de las copias y del Telegram (solo para pruebas).
// opciones.academia: límites, azar y reloj de las rutas de la Academia (solo para pruebas).
export function crearServidor({ db = null, config = null, limites, supervisor = null, tareas = {}, ia = {}, copias = {}, academia = {} } = {}) {
  const rutas = crearRuteador();
  registrarRutasCuentas(rutas, { version: VERSION, limites, supervisor });
  registrarRutasTareas(rutas, { supervisor, version: VERSION, codigo: HUELLA, config, ...tareas });
  registrarRutasIa(rutas, { config, supervisor, limites: ia.limites });
  registrarRutasClaves(rutas, { config, limites: ia.limitesClaves, probadores: ia.probadores });
  // Fase 1, parte e: las copias cifradas y el Telegram del dueño.
  registrarRutasCopias(rutas, { config, supervisor, limites: copias.limites, medirDisco: copias.medirDisco ?? null });
  registrarRutasCanales(rutas, { config, limites: copias.limitesCanales, adaptador: copias.adaptador });
  // Academia (0.7.0): el contenido vive en la carpeta de datos del servidor (src/academia/paquetes.js).
  registrarRutasAcademia(rutas, { config, supervisor, ...academia });
  // Academia (0.9.0): el instructor (sin IA siempre; con IA solo si el dueño lo enciende).
  registrarRutasInstructor(rutas, { config, supervisor, reloj: academia.reloj, limites: academia.limitesInstructor });
  // 0.10.0: el tiempo con IA de cada alumno, sus pagos por transferencia y las fallas registradas.
  registrarRutasPagos(rutas, { config, reloj: academia.reloj, limites: academia.limitesPagos });
  // 0.9.0: «Mi perfil» (Configuración) y la ficha de cada alumno, con «Comparar» (Administrador → Alumnos).
  registrarRutasPerfil(rutas, { config, limites: academia.limitesPerfil, reloj: academia.reloj });
  // 0.9.2: «Términos de uso y aviso» y el nombre legal.
  registrarRutasTerminos(rutas, { config, reloj: academia.reloj });
  // 0.9.2: «Ayuda / Soporte» (escribirle al administrador).
  registrarRutasSoporte(rutas, { config, reloj: academia.reloj, limites: academia.limitesSoporte });
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
    // Fase 1, parte d. soloTailnet: solo desde la red de Tailscale (nunca por el enlace público de Funnel).
    // soloDueno: además, con la cuenta de Tailscale del administrador que entró (las claves y lo que gasta dinero).
    if (opciones.soloTailnet && !vieneDeTailscale(req).si) return enviarJson(res, 403, { error: 'solo_desde_tailnet' });
    if (opciones.soloDueno) {
      const dueno = duenoDeTailscale(db, req, usuario, { anotar: true });
      if (!dueno.si) return enviarJson(res, 403, { error: dueno.motivo });
    }

    try {
      const r = await encontrada.manejador({ db, req, res, usuario, token, parametros: encontrada.parametros, cliente: clienteDe(req), https: esHttps(req) });
      // Academia (0.7.0): una figura del paquete se manda tal cual (una imagen, no JSON).
      if (typeof r.enviar === 'function') return r.enviar(res);
      enviarJson(res, r.codigo, r.datos, r.cabeceras, { comprimir: RESPUESTAS_COMPRIMIBLES.has(encontrada.patron) });
    } catch (error) {
      // detalle: solo datos simples que la pantalla necesita (por ejemplo, qué falta para encender la IA).
      if (error instanceof ErrorHttp) return enviarJson(res, error.codigo, { ...detalleSeguro(error.detalle), error: error.clave });
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
