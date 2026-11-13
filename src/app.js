// OPORTIA: servidor web. Une la entrada protegida, las rutas de la API y las pantallas.
// Este programa NUNCA borra archivos de datos.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { entradaPermitida, esLocal, clienteDe, esHttps, nombrePermitido } from './nucleo/red.js';
import { ErrorHttp, enviarJson, crearRuteador, servirArchivo, CABECERAS_SEGURIDAD } from './nucleo/http.js';
import { leerSesion, leerGalleta } from './cuentas/sesiones.js';
import { anotarActividad, registrarRutasVisitas } from './cuentas/visitas.js';
import { Limitador } from './nucleo/limites.js';
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
import { registrarRutasIaAlumnos } from './api/ia-alumnos.js';
import { registrarRutasFabrica } from './api/fabrica.js';
import { registrarRutasPagoServidor } from './api/pago-servidor.js';
import { cerradaPorOtroEquipo } from './cuentas/un-dispositivo.js';
import { duenoDeTailscale } from './cuentas/tailscale.js';
import { confirmarClave, crearLimitesConfirmar } from './cuentas/confirmar.js';
import { estadoTerminos } from './cuentas/terminos.js';

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
// opciones.confirmar: límites de la contraseña que se pide otra vez para lo delicado (solo para pruebas).
export function crearServidor({ db = null, config = null, limites, supervisor = null, tareas = {}, ia = {}, copias = {}, academia = {}, confirmar = {} } = {}) {
  const rutas = crearRuteador();
  const limitesConfirmar = { ...crearLimitesConfirmar(), ...confirmar };
  // 0.12.7: «terminó una sesión de estudio» (terminar un intento, una lección leída, cerrar la app): el instructor lo
  // usa para preparar la PRÓXIMA clase (src/api/instructor.js). Nunca hace fallar el pedido del alumno.
  const ganchos = { finDeSesion: null };
  const finDeSesion = (db, usuario, como) => { try { ganchos.finDeSesion?.(db, usuario, como); } catch { /* nunca molesta al alumno */ } };
  registrarRutasCuentas(rutas, { version: VERSION, limites, supervisor, alertaAdmin: limitesConfirmar.alerta });
  registrarRutasVisitas(rutas, { Limitador, finDeSesion });
  registrarRutasTareas(rutas, { supervisor, version: VERSION, codigo: HUELLA, config, ...tareas });
  registrarRutasIa(rutas, { config, supervisor, limites: ia.limites });
  registrarRutasClaves(rutas, { config, limites: ia.limitesClaves, probadores: ia.probadores });
  // Fase 1, parte e: las copias cifradas y el Telegram del dueño.
  registrarRutasCopias(rutas, { config, supervisor, limites: copias.limites, medirDisco: copias.medirDisco ?? null, kdf: copias.kdf });
  registrarRutasCanales(rutas, { config, limites: copias.limitesCanales, adaptador: copias.adaptador });
  // Academia (0.7.0): el contenido vive en la carpeta de datos del servidor (src/academia/paquetes.js).
  registrarRutasAcademia(rutas, { config, supervisor, ...academia, finDeSesion });
  // Academia (0.9.0): el instructor (sin IA siempre; con IA solo si el dueño lo enciende).
  registrarRutasInstructor(rutas, { config, supervisor, reloj: academia.reloj, limites: academia.limitesInstructor, ganchos });
  // 0.10.0: el tiempo con IA de cada alumno, sus pagos por transferencia y las fallas registradas.
  registrarRutasPagos(rutas, { config, reloj: academia.reloj, limites: academia.limitesPagos });
  // 0.9.0: «Mi perfil» (Configuración) y la ficha de cada alumno, con «Comparar» (Administrador → Alumnos).
  registrarRutasPerfil(rutas, { config, limites: academia.limitesPerfil, reloj: academia.reloj });
  // 0.9.2: «Términos de uso y aviso» y el nombre legal.
  registrarRutasTerminos(rutas, { config, reloj: academia.reloj });
  // 0.9.2: «Ayuda / Soporte» (escribirle al administrador).
  registrarRutasSoporte(rutas, { config, reloj: academia.reloj, limites: academia.limitesSoporte });
  // 0.12.8: IA por alumno, Registro de la IA y «Enviar a mi Telegram» (Administrador → Dinero e IA).
  registrarRutasIaAlumnos(rutas, { config, reloj: academia.reloj, adaptador: copias.adaptador, topesBot: academia.topesBot });
  registrarRutasFabrica(rutas, { config, supervisor, reloj: academia.reloj });
  // 0.14.1: Administrador → Sistema → «Pago del servidor» (DigitalOcean).
  registrarRutasPagoServidor(rutas, { reloj: academia.reloj });
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
    // 0.12.8: si su sesión se cerró porque la cuenta (de un alumno) se abrió en otro dispositivo, se dice.
    if (!opciones.publica && !usuario) return enviarJson(res, 401, { error: token && cerradaPorOtroEquipo(db, token) ? 'sesion_otro_equipo' : 'no_has_entrado' });
    if (usuario?.debeCambiarClave && !opciones.publica && !opciones.permitirConClaveTemporal) return enviarJson(res, 403, { error: 'debe_cambiar_clave' });
    if (opciones.admin && usuario?.rol !== 'admin') return enviarJson(res, 403, { error: 'solo_admin' });
    // 0.11.0: lo de estudiar (/api/academia/…, /api/soporte…) espera a que firme los términos en uso. Quedan libres: entrar,
    // salir, /api/yo/… (su firma, su perfil, sus documentos), /api/terminos y lo del administrador (para que arregle
    // los textos). config.terminosObligatorios === false solo lo ponen las pruebas que no son de los términos.
    if (usuario && config && config.terminosObligatorios !== false && /^\/api\/(?:academia\/|soporte(?:\/|$))/.test(ruta) && estadoTerminos(db, usuario.id).pendiente) {
      return enviarJson(res, 403, { error: 'terminos_pendientes' });
    }
    // 0.12.3: ya nada es «solo desde Tailscale» para un administrador con su sesión (pedido del dueño): lo que antes era
    // soloTailnet / soloDueno ahora es solo { admin: true }. Lo delicado pide, en ese pedido, su contraseña otra vez
    // (confirmar(), src/cuentas/confirmar.js). soloDueno solo anota la cuenta de Tailscale del dueño si todavía no la tiene
    // (con ella, desde su red, no se le pide la contraseña otra vez). Crear el PRIMER administrador sigue siendo solo
    // desde Tailscale (src/api/cuentas.js).
    if (opciones.soloDueno && usuario?.rol === 'admin') duenoDeTailscale(db, req, usuario, { anotar: true });
    const confirmar = () => confirmarClave({ db, req, usuario, cliente: clienteDe(req), limites: limitesConfirmar });

    // 0.12.4: cada pedido de quien entró es actividad de su visita (como mucho una escritura por minuto). El aviso de
    // «cerró la app» no cuenta como actividad.
    if (usuario && !opciones.noEsActividad) { try { anotarActividad(db, usuario.id); } catch { /* nunca frena un pedido */ } }
    try {
      const r = await encontrada.manejador({ db, req, res, usuario, token, parametros: encontrada.parametros, cliente: clienteDe(req), https: esHttps(req), confirmar });
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
