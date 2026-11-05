// El trabajador REAL (src/tareas/trabajador.js, con sus tipos y manejadores de verdad) para las pruebas que lo
// encienden como proceso aparte (crearSupervisor({ ruta: este archivo })). No es un archivo *.test.js.
// Primero carga ./ayuda.js: así este proceso tampoco puede usar internet (fetch solo a 127.0.0.1), además de que
// src/ia/llamar.js, en modo de prueba, solo deja llamar al proveedor falso en 127.0.0.1.
// Su nombre termina en «trabajador.js» a propósito: la revisión «ps … | grep '[t]rabajador.js'» también lo encuentra
// si alguna prueba lo dejara vivo.
import './ayuda.js';

const { principal, SALIDA } = await import('../src/tareas/trabajador.js');
principal().catch(error => {
  console.error('El trabajador de prueba no pudo arrancar:', error?.name ?? 'Error');
  process.exit(SALIDA?.caida ?? 1);
});
