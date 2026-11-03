// Arranque de OPORTIA. Abre la base propia (oportia.db) y el servidor web.
// No borra ni modifica ningún archivo que no sea de OPORTIA.
import { crearServidor, VERSION } from './app.js';
import { leerConfig } from './nucleo/config.js';
import { abrirBase } from './nucleo/db.js';

const config = leerConfig();
let db = null;
try {
  db = abrirBase(config);
} catch (error) {
  console.error('Base de datos no disponible:', error.message);
}

const servidor = crearServidor({ db });
servidor.listen(config.puerto, config.host, () => console.log(`OPORTIA ${VERSION} escuchando en ${config.host}:${config.puerto}`));

function cerrar() {
  servidor.close(() => { try { db?.close(); } catch { /* ya cerrada */ } process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
process.on('unhandledRejection', error => console.error('Error no controlado:', error));
