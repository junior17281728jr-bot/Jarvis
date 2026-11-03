// Arranque de OPORTIA. Solo abre el servidor web: no borra ni modifica ningún archivo.
import { crearServidor, VERSION } from './app.js';

const puerto = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';

crearServidor().listen(puerto, host, () => console.log(`OPORTIA ${VERSION} (en construcción) escuchando en ${host}:${puerto}`));

// Red de seguridad: un error inesperado se registra, pero no tumba el servidor.
process.on('uncaughtException', error => console.error('Error inesperado (el servidor sigue):', error));
process.on('unhandledRejection', error => console.error('Error no controlado (el servidor sigue):', error));
