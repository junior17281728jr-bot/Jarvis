// Configuración de OPORTIA. Solo lee variables de entorno: no crea, cambia ni borra nada.
import { dirname, join, resolve } from 'node:path';

export function leerConfig(env = process.env) {
  // DB_PATH viene de /opt/jarvis/.env (apunta al archivo viejo de JARVIS). Solo usamos su CARPETA.
  const carpetaDatos = resolve(env.OPORTIA_DATOS || dirname(env.DB_PATH || '/var/lib/jarvis/jarvis.db'));
  const config = {
    puerto: Number(env.PORT || 8080),
    host: env.HOST || '127.0.0.1',
    carpetaDatos,
    // Archivo propio de OPORTIA: nunca se usa ni se toca el jarvis.db de antes.
    archivoBase: resolve(env.OPORTIA_DB || join(carpetaDatos, 'oportia.db')),
    // Carpeta propia para las copias: nunca se escribe en las carpetas de JARVIS.
    carpetaCopias: resolve(env.OPORTIA_COPIAS || join(carpetaDatos, 'oportia-copias')),
    // Academia (0.7.0): los paquetes de contenido (libros, Test Guide, figuras). Solo en el servidor, nunca en el repositorio.
    carpetaAcademia: resolve(env.OPORTIA_ACADEMIA || join(carpetaDatos, 'academia')),
    modoPrueba: env.OPORTIA_TEST === '1' || process.env.OPORTIA_TEST === '1',
  };
  // Direcciones de los proveedores de IA. En el servidor real queda VACÍO: cada adaptador usa su dirección oficial
  // (src/ia/proveedores/). Solo en modo de prueba se puede apuntar a un proveedor FALSO en 127.0.0.1
  // (test/proveedor-falso.js). Nunca se cambia desde las pantallas.
  config.iaBases = config.modoPrueba ? basesDePrueba(env) : {};
  Object.freeze(config.iaBases);
  // Fase 1, parte e: lo mismo para los canales (hoy, Telegram: src/canales/telegram.js). En el servidor real queda VACÍO
  // (el adaptador usa la dirección oficial); solo en modo de prueba puede apuntar al Telegram FALSO en 127.0.0.1
  // (test/telegram-falso.js). Nunca se cambia desde las pantallas.
  config.canalesBases = config.modoPrueba ? basesDeCanalDePrueba(env) : {};
  Object.freeze(config.canalesBases);
  // Academia (0.7.1): lo mismo para Google Drive (src/academia/drive.js). En el servidor real queda VACÍO (se usan las
  // direcciones oficiales); solo en modo de prueba puede apuntar al Drive FALSO en 127.0.0.1.
  config.driveBases = config.modoPrueba ? basesDeDriveDePrueba(env) : {};
  Object.freeze(config.driveBases);
  if (config.modoPrueba && (config.archivoBase.startsWith('/var/lib') || config.carpetaCopias.startsWith('/var/lib'))) {
    throw new Error('En modo de prueba no se permite usar /var/lib: las pruebas nunca tocan los datos reales.');
  }
  return config;
}

const BASE_DE_PRUEBA = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;
const VARIABLES_DE_PRUEBA = Object.freeze({ anthropic: 'OPORTIA_IA_URL_ANTHROPIC', openai: 'OPORTIA_IA_URL_OPENAI', propia: 'OPORTIA_IA_URL_PROPIA' });

function basesDePrueba(env) {
  const bases = {};
  for (const [proveedor, variable] of Object.entries(VARIABLES_DE_PRUEBA)) {
    const valor = String(env[variable] ?? '');
    if (BASE_DE_PRUEBA.test(valor)) bases[proveedor] = valor;
  }
  return bases;
}

const VARIABLES_DE_CANAL_DE_PRUEBA = Object.freeze({ telegram: 'OPORTIA_TELEGRAM_URL' });

function basesDeCanalDePrueba(env) {
  const bases = {};
  for (const [canal, variable] of Object.entries(VARIABLES_DE_CANAL_DE_PRUEBA)) {
    const valor = String(env[variable] ?? '');
    if (BASE_DE_PRUEBA.test(valor)) bases[canal] = valor;
  }
  return bases;
}

function basesDeDriveDePrueba(env) {
  const bases = {};
  for (const [parte, variable] of Object.entries({ lista: 'OPORTIA_DRIVE_URL_LISTA', bajar: 'OPORTIA_DRIVE_URL_BAJAR' })) {
    const valor = String(env[variable] ?? '');
    if (BASE_DE_PRUEBA.test(valor)) bases[parte] = valor;
  }
  return bases;
}

// Para un programa de la consola que no abre la base de este servidor (deploy/oportia-restaurar.mjs): solo si está en
// modo de prueba y adónde va el Telegram FALSO (127.0.0.1, solo en modo de prueba). Nunca otra cosa del entorno.
export function configDeCanales(env = process.env) {
  const modoPrueba = env.OPORTIA_TEST === '1' || process.env.OPORTIA_TEST === '1';
  return Object.freeze({ modoPrueba, canalesBases: Object.freeze(modoPrueba ? basesDeCanalDePrueba(env) : {}) });
}
