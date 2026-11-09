// MEDIDA (fuera de la suite, como los ensayos): la copia de cada noche con el trabajador REAL (proceso aparte, con sus
// banderas: --max-old-space-size=64, --expose-gc…) sobre una base GRANDE, con copia en el servidor («local») y directo a
// Telegram («directo»). Imprime el pico de memoria del trabajador (VmHWM) y el tiempo. Nunca usa internet: el Telegram es
// el falso (vive en ESTE proceso, así su memoria no cuenta).
//
//   node --no-warnings test/medir-copia.mjs [MB=200] [local|directo|ambos]
//
// Regla del diseño (§6.6): si el pico pasa de 105 MB, las partes bajan a 2 MiB (TAMANO_PARTE, sin cambiar el formato).
// MEDIR_ENTORNO='{"VARIABLE":"valor"}' pasa variables de más al trabajador (para probar ajustes de memoria).
import './ayuda.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { esperarHasta, matarSiVive } from './ayuda.js';
import { montar, llenarAlAzar, SILENCIO } from './copias-tarea-base.js';
import { crearSupervisor } from '../src/tareas/supervisor.js';
import { CLAVE_AJUSTES } from '../src/copias/estado.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MB_BASE = Number(process.argv[2] ?? 200);
const MODOS = process.argv[3] === 'local' ? ['local'] : process.argv[3] === 'directo' ? ['directo'] : ['local', 'directo'];

function memoria(pid) {
  try {
    const s = readFileSync(`/proc/${pid}/status`, 'utf8');
    return { rss: Number(s.match(/VmRSS:\s+(\d+) kB/)[1]) / 1024, pico: Number(s.match(/VmHWM:\s+(\d+) kB/)[1]) / 1024 };
  } catch {
    return null;
  }
}

for (const modo of MODOS) {
  const b = await montar({ relleno: 0 });
  // Mitad datos al azar (no se comprimen) y mitad texto repetido (se comprimen), en filas de 16 KiB.
  const filas = Math.round((MB_BASE * 1024) / 16);
  llenarAlAzar(b.db, { filas: Math.round(filas / 2), bytes: 12 * 1024 });
  const poner = b.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)');
  for (let i = 0; i < filas / 2; i++) poner.run(`medir.texto.${i}`, JSON.stringify(`fila ${i} `.repeat(1700)), new Date().toISOString());
  if (modo === 'directo') {
    b.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(CLAVE_AJUSTES, JSON.stringify({ local: false }), new Date().toISOString());
  }
  b.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const baseMb = Math.round((Number(readFileSync(b.config.archivoBase).length) / 1024 / 1024) * 10) / 10;
  const supervisor = crearSupervisor({
    db: b.db, config: b.config, version: '0.5.0-medida', codigo: `medida-${randomUUID().slice(0, 8)}`, ruta: join(RAIZ, 'test', 'ia-trabajador.js'),
    // «local» de verdad aunque la máquina tenga poco disco libre (si no, la copia iría directo a Telegram).
    entorno: { OPORTIA_TELEGRAM_URL: b.falso.url, ...(modo === 'local' ? { PRUEBA_DISCO_LIBRE_MB: '100000' } : {}), ...JSON.parse(process.env.MEDIR_ENTORNO ?? '{}') },
    tiempos: { revisarCadaMs: 200 }, registro: SILENCIO,
  });
  let pid = null;
  try {
    supervisor.iniciar();
    pid = await esperarHasta(() => supervisor.estado().pid, { que: 'el trabajador encendido' });
    await new Promise(l => setTimeout(l, 1500));
    const quieto = memoria(pid);
    const id = b.pedir();
    supervisor.despertar();
    const inicio = Date.now();
    let ultimo = null;
    await esperarHasta(() => { ultimo = memoria(pid) ?? ultimo; return ['hecha', 'fallida', 'revisar'].includes(b.tarea(id).estado); }, { que: 'la copia', cada: 200, ms: 3_600_000 });
    const segundos = Math.round((Date.now() - inicio) / 100) / 10;
    const c = b.copias().at(-1);
    console.log(JSON.stringify({
      modo, baseMb, estado: c?.estado, tarea: b.tarea(id).estado, error: b.tarea(id).ultimo_error, partes: c?.partes, copiaMb: Math.round(((c?.bytes ?? 0) / 1024 / 1024) * 10) / 10,
      segundos, quietoMb: Math.round(quieto?.rss ?? 0), picoMb: Math.round(ultimo?.pico ?? 0), mismoTrabajador: supervisor.estado().pid === pid,
    }));
  } finally {
    await supervisor.parar();
    matarSiVive(pid);
    await b.cerrar();
  }
}
