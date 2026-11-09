// El trabajador REAL (src/tareas/trabajador.js, con sus tipos y manejadores de verdad) para las pruebas que lo
// encienden como proceso aparte (crearSupervisor({ ruta: este archivo })). No es un archivo *.test.js.
// Primero carga ./ayuda.js: así este proceso tampoco puede usar internet (fetch solo a 127.0.0.1), además de que
// src/ia/llamar.js, en modo de prueba, solo deja llamar al proveedor falso en 127.0.0.1.
// Su nombre termina en «trabajador.js» a propósito: la revisión «ps … | grep '[t]rabajador.js'» también lo encuentra
// si alguna prueba lo dejara vivo.
import './ayuda.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

// Revisión final de la parte e: PRUEBA_DISCO_LIBRE_MB hace que ESTE trabajador de prueba vea ese espacio libre en el
// disco (así las pruebas no dependen de cuánto disco le queda a la máquina: con menos de 2 GB libres las copias van
// directo a Telegram y no quedan en el disco). Solo en las pruebas; el código de src/ no lo conoce.
const libreDePrueba = Number(process.env.PRUEBA_DISCO_LIBRE_MB);
if (Number.isFinite(libreDePrueba) && libreDePrueba > 0) {
  const real = fs.statfsSync;
  fs.statfsSync = (ruta, ...resto) => {
    const s = real(ruta, ...resto);
    const bloques = Math.floor((libreDePrueba * 1024 * 1024) / Number(s.bsize));
    return Object.assign(Object.create(Object.getPrototypeOf(s)), s, { bavail: bloques, bfree: bloques, blocks: Math.max(Number(s.blocks), bloques * 2) });
  };
  syncBuiltinESMExports();
}

const { principal, SALIDA } = await import('../src/tareas/trabajador.js');
principal().catch(error => {
  console.error('El trabajador de prueba no pudo arrancar:', error?.name ?? 'Error');
  process.exit(SALIDA?.caida ?? 1);
});
