// Arranque de OPORTIA. Solo abre el servidor web: no borra ni modifica ningún archivo.
import { crearServidor, VERSION } from './app.js';

const puerto = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';

crearServidor().listen(puerto, host, () => console.log(`OPORTIA ${VERSION} (en construcción) escuchando en ${host}:${puerto}`));
