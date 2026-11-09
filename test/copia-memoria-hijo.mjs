// Un proceso hijo para la prueba 1.19 de test/copias.test.js (no es un archivo *.test.js): hace una copia de una base de
// 4 MB que no se comprime (datos al azar), en partes de 64 KiB, con las banderas de memoria del trabajador, y cuenta:
// cuántas veces el partidor pidió su búfer, si algún búfer de parte sigue vivo después (WeakRef + gc) y el RSS máximo.
// Imprime una línea JSON. Nunca usa internet (carga ./ayuda.js primero).
import './ayuda.js';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { carpetaTemporal } from './ayuda.js';
import { baseSintetica, llavesDePrueba } from './copias-base.js';
import { abrirFotoDeLectura } from '../src/nucleo/db.js';
import { generarCopia } from '../src/copias/generar.js';

const archivo = join(carpetaTemporal('memoria'), 'm.db');
const db = baseSintetica(archivo, 'CREATE TABLE t (id INTEGER PRIMARY KEY, datos BLOB);');
const insertar = db.prepare('INSERT INTO t (datos) VALUES (?)');
for (let i = 0; i < 1024; i++) insertar.run(randomBytes(4096));
db.close();

const llaves = llavesDePrueba();
let asignaciones = 0;
let referencia = null;
let partes = 0;
const foto = abrirFotoDeLectura({ archivoBase: archivo });
await (async () => {
  const r = await generarCopia({
    foto: foto.db, publica: llaves.publica, sello: llaves.sello, tamanoParte: 65_536,
    asignar: largo => { asignaciones += 1; const b = Buffer.allocUnsafe(largo); referencia = new WeakRef(b); return b; },
    alParte: async () => { partes += 1; globalThis.gc?.(); },
  });
  if (r.partes !== partes) throw new Error('partes');
})();
foto.cerrar();
for (let i = 0; i < 5; i++) {
  globalThis.gc();
  await new Promise(listo => setTimeout(listo, 20));
}
const retenido = referencia?.deref() !== undefined;
console.log(JSON.stringify({ asignaciones, partes, retenido, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) }));
