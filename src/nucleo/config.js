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
    modoPrueba: env.OPORTIA_TEST === '1' || process.env.OPORTIA_TEST === '1',
  };
  if (config.modoPrueba && (config.archivoBase.startsWith('/var/lib') || config.carpetaCopias.startsWith('/var/lib'))) {
    throw new Error('En modo de prueba no se permite usar /var/lib: las pruebas nunca tocan los datos reales.');
  }
  return config;
}
