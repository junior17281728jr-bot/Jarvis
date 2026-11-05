// Arranque de OPORTIA. Abre la base propia (oportia.db), el servidor web y, cuando ya tiene el puerto, el
// trabajador (el programa aparte que hace las tareas de la fila). Son dos procesos dentro del mismo servicio.
// No borra ni modifica ningún archivo que no sea de OPORTIA.
import { crearServidor, VERSION, HUELLA } from './app.js';
import { leerConfig } from './nucleo/config.js';
import { abrirBase } from './nucleo/db.js';
import { crearSupervisor } from './tareas/supervisor.js';
import { registrarArranque, registrarCierre } from './tareas/modo-seguro.js';

// Los archivos nuevos de OPORTIA (la base y sus copias) solo los puede leer el servicio, no cualquier usuario.
process.umask(0o027);

const config = leerConfig();
let db = null;
try {
  db = abrirBase(config);
} catch (error) {
  console.error('Base de datos no disponible:', error.message);
}

const supervisor = db ? crearSupervisor({ db, config, version: VERSION, codigo: HUELLA }) : null;
const servidor = crearServidor({ db, config, supervisor });
let arranque = null;
let cerrando = false;

// Tener el puerto es el «candado»: una segunda copia que no lo consigue sale ANTES de escribir nada en la base
// y nunca enciende un trabajador. systemd la vuelve a intentar a los 5 s.
const alFallarPuerto = error => {
  console.error('No se pudo abrir el puerto:', error.message);
  process.exit(1);
};
servidor.once('error', alFallarPuerto);
servidor.listen(config.puerto, config.host, () => {
  servidor.off('error', alFallarPuerto);
  servidor.on('error', error => console.error('Error del servidor (sigue):', error));
  console.log(`OPORTIA ${VERSION} escuchando en ${config.host}:${servidor.address().port}`); // test/arranque.test.js lee esta línea
  if (!db || cerrando) return; // si ya se está apagando, no se enciende el trabajador
  try {
    arranque = registrarArranque(db, { version: VERSION, codigo: HUELLA, pid: process.pid });
  } catch (error) {
    console.error('No se pudo anotar el arranque:', error);
  }
  supervisor.iniciar();
});

// Apagado ordenado (systemctl stop/restart, el actualizador): una sola vez.
//  1. anota que fue un cierre limpio; 2. deja de aceptar visitas; 3. apaga al trabajador (le da 5 s y, si no,
//  lo corta); 4. cierra la base. Sale sí o sí a los 8 s (systemd espera hasta 90 s).
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  setTimeout(() => process.exit(0), 8000).unref();
  try {
    if (db && arranque) registrarCierre(db, arranque.id);
  } catch (error) {
    console.error('No se pudo anotar el cierre:', error.message);
  }
  servidor.close();
  servidor.closeIdleConnections?.();
  try {
    await supervisor?.parar();
  } catch (error) {
    console.error('No se pudo apagar el trabajador:', error);
  }
  try { db?.close(); } catch { /* ya cerrada */ }
  process.exit(0);
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
// Red de seguridad: un error inesperado se registra, pero no tumba el servidor.
process.on('uncaughtException', error => console.error('Error inesperado (el servidor sigue):', error));
process.on('unhandledRejection', error => console.error('Error no controlado (el servidor sigue):', error));
