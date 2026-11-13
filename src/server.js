// Arranque de OPORTIA. Abre la base propia (oportia.db), el servidor web y, cuando ya tiene el puerto, el
// trabajador (el programa aparte que hace las tareas de la fila). Son dos procesos dentro del mismo servicio.
// No borra ni modifica ningún archivo que no sea de OPORTIA.
import { crearServidor, VERSION, HUELLA } from './app.js';
import { leerConfig } from './nucleo/config.js';
import { abrirBase } from './nucleo/db.js';
import { crearSupervisor, quitarArchivosCore } from './tareas/supervisor.js';
import { registrarArranque, registrarCierre } from './tareas/modo-seguro.js';
import { crearAvisador } from './canales/avisador.js';
import { crearBot } from './canales/bot.js';
import { crearImportador } from './academia/importador.js';
import { autoEmpezarTodo } from './academia/fabrica-profunda.js';
import { guardarConfigFabrica } from './academia/fabrica.js';
import { crearProbador } from './academia/app-probador.js';

// Los archivos nuevos de OPORTIA (la base y sus copias) solo los puede leer el servicio, no cualquier usuario.
process.umask(0o027);
// Sin archivos «core» (una copia de la memoria en el disco si el proceso se cae), ANTES de abrir la base: este proceso
// puede tener por un momento una clave descifrada. El trabajador ya arranca así (src/tareas/supervisor.js).
if (!quitarArchivosCore()) console.error('Aviso: no se pudo quitar los archivos «core» de este proceso (sigue igual).');

const config = leerConfig();
let db = null;
try {
  db = abrirBase(config);
} catch (error) {
  console.error('Base de datos no disponible:', error.message);
}

const supervisor = db ? crearSupervisor({ db, config, version: VERSION, codigo: HUELLA }) : null;
const servidor = crearServidor({ db, config, supervisor });
// Fase 1, parte e: el que manda los avisos graves al Telegram del dueño. Vive en ESTE proceso (no en el trabajador): así
// llegan también en modo seguro o con el trabajador caído. Empieza después de abrir el puerto y nunca lo traba.
const avisador = db ? crearAvisador({ db, config, registro: console, pagoServidor: true }) : null;
// 0.12.8: el bot del dueño (sus comandos y los contratos firmados), también en este proceso y después de abrir el puerto.
const bot = db ? crearBot({ db, config }) : null;
// Academia (0.7.1): el que entra al contenido los paquetes que el trabajador trae de Google Drive (src/academia/importador.js).
// También en este proceso: revisar un JSON de 12 MB pasaría el tope de memoria del trabajador.
const importador = db ? crearImportador({ db, config, supervisor, registro: console }) : null;
// 0.14.8: el que prueba los cambios de «Claude mejora la app» (todas las pruebas, en una copia, con prioridad baja).
const probador = db ? crearProbador({ db, config, supervisor, registro: console }) : null;
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
  // 0.14.7 (lo pidió el dueño): con la clave de Claude ya probada, «Mejorar todo con Claude» empieza solo, UNA vez.
  try {
    if (autoEmpezarTodo(db, config, { guardarConfig: guardarConfigFabrica })) supervisor.despertar?.();
  } catch (error) {
    console.error('No se pudo empezar «Mejorar todo con Claude»:', error?.message ?? error);
  }
  try {
    avisador?.iniciar();
  } catch (error) {
    console.error('No se pudo encender el aviso por Telegram (sigue):', error?.name ?? 'error');
  }
  try {
    bot?.iniciar();
  } catch (error) {
    console.error('No se pudo encender el bot de Telegram (sigue):', error?.name ?? 'error');
  }
  try {
    importador?.iniciar();
  } catch (error) {
    console.error('No se pudo encender el que trae el contenido de Drive (sigue):', error?.name ?? 'error');
  }
  try {
    probador?.iniciar();
  } catch (error) {
    console.error('No se pudo encender el que prueba los cambios de Claude (sigue):', error?.name ?? 'error');
  }
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
  try {
    await avisador?.parar();
  } catch { /* nada que esperar */ }
  try {
    await bot?.parar();
  } catch { /* nada que esperar */ }
  try {
    await probador?.parar();
  } catch { /* nada que esperar */ }
  try {
    await importador?.parar();
  } catch { /* nada que esperar */ }
  try { db?.close(); } catch { /* ya cerrada */ }
  process.exit(0);
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
// Red de seguridad: un error inesperado se registra, pero no tumba el servidor.
process.on('uncaughtException', error => console.error('Error inesperado (el servidor sigue):', error));
process.on('unhandledRejection', error => console.error('Error no controlado (el servidor sigue):', error));
