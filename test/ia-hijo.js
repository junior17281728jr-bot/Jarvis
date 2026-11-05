// Proceso hijo para la prueba de CARRERA de reservas (no es un archivo *.test.js): varios de estos reservan a la vez
// contra la misma base, con el reservar de verdad, y ninguno puede pasar ningún tope.
//   node test/ia-hijo.js <archivoBase> <cuántas> <semilla> <carpetaDeSalida> <espacio> [<espacio>…]
// Para que de verdad corran A LA VEZ: cada hijo deja «listo-<semilla>» en la carpeta de salida y espera a que aparezca
// «vamos» (lo pone la prueba cuando todos están listos). Escribe en su salida un JSON con cuántas reservó y por qué no
// pudo las demás. Nunca usa la red.
import './ayuda.js';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conectarBase } from '../src/nucleo/db.js';
import { reservar, liquidar } from '../src/ia/presupuesto.js';

const [archivoBase, cuantas, semilla, salida, ...espacios] = process.argv.slice(2);
const config = { archivoBase };
const db = conectarBase(config, { versionMinima: 5 });
const cuenta = { ok: 0, no: {}, liquidadas: 0 };
writeFileSync(join(salida, `listo-${semilla}`), '');
const limite = Date.now() + 60_000;
while (!existsSync(join(salida, 'vamos'))) {
  if (Date.now() > limite) process.exit(2);
  await new Promise(listo => setTimeout(listo, 5));
}
try {
  for (let i = 0; i < Number(cuantas); i++) {
    const espacioId = Number(espacios[i % espacios.length]);
    const entradaMax = 1000 + ((i * 7919 + Number(semilla) * 104_729) % 23_000);
    const r = reservar(db, { config, proposito: 'interpretar', espacioId, entradaMax });
    if (!r.ok) {
      cuenta.no[r.motivo] = (cuenta.no[r.motivo] ?? 0) + 1;
      continue;
    }
    cuenta.ok += 1;
    // Dos de cada tres de CADA cuenta terminan (con un costo real menor que lo apartado); la otra queda «en curso».
    if (Math.floor(i / espacios.length) % 3) {
      liquidar(db, {
        llamadaId: r.llamada.id,
        resultado: { motivo: 'ok', estado: 'hecha', http: 200, uso: { entrada: Math.floor(entradaMax * 0.3), salida: 300, cacheLectura: 0, cacheEscritura: 0, geo: 'global', raro: false, desconocidos: 0 } },
      });
      cuenta.liquidadas += 1;
    }
  }
} finally {
  db.close();
}
process.stdout.write(JSON.stringify(cuenta));
