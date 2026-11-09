// Fase 1, parte e (paso 2): la copia de cada noche con el trabajador REAL (proceso aparte, con sus banderas de memoria)
// contra el Telegram FALSO: una base de 4 MB sin comprimir, en partes de 2 MiB. El trabajador sigue latiendo, no se sale
// por memoria, y si lo matan en medio de una subida, al volver sigue desde esa parte. Sin cotas de memoria finas (la suite
// corre en el servidor de verdad): la medida precisa está en test/medir-copia.mjs.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { esperarHasta, matarSiVive } from './ayuda.js';
import { montar, llenarAlAzar, SILENCIO } from './copias-tarea-base.js';
import { crearSupervisor } from '../src/tareas/supervisor.js';
import { TAMANO_PARTE } from '../src/copias/formato.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

async function conTrabajador(fn) {
  const b = await montar({ relleno: 0 });
  llenarAlAzar(b.db, { filas: 256, bytes: 12 * 1024 }); // ≈ 4 MB que no se comprimen
  const pids = new Set();
  const supervisor = crearSupervisor({
    db: b.db, config: b.config, version: '0.5.0-prueba', codigo: `prueba-${randomUUID().slice(0, 8)}`, ruta: join(RAIZ, 'test', 'ia-trabajador.js'),
    entorno: { OPORTIA_TELEGRAM_URL: b.falso.url },
    tiempos: { revisarCadaMs: 100, modoSeguroCadaMs: 300, reinicioBaseMs: 100, reintentoSenalMs: 100 },
    tiemposTrabajador: { latidoMs: 200, cicloMs: 100, recuperarCadaMs: 500 },
    registro: SILENCIO,
  });
  try {
    await fn({ b, supervisor, pids });
  } finally {
    await supervisor.parar();
    for (const pid of pids) matarSiVive(pid);
    await b.cerrar();
  }
}

test('2.6 el trabajador de verdad copia una base de 4 MB: sigue latiendo, no se sale por memoria, y corre con --expose-gc', async () => {
  await conTrabajador(async ({ b, supervisor, pids }) => {
    const id = b.pedir();
    supervisor.iniciar();
    // El trabajador ya arrancó de verdad (no el instante en que el proceso todavía no cambió a node).
    const pid = await esperarHasta(() => ['esperando', 'trabajando'].includes(supervisor.estado().fase) && supervisor.estado().pid, { que: 'el trabajador encendido' });
    pids.add(pid);
    if (existsSync(`/proc/${pid}/cmdline`)) assert.ok(readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes('--expose-gc'));
    let rssMaxMb = 0;
    await esperarHasta(() => {
      try { rssMaxMb = Math.max(rssMaxMb, Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+) kB/)[1]) / 1024); } catch { /* ya salió */ }
      return b.tarea(id).estado === 'hecha';
    }, { que: 'la copia hecha por el trabajador', cada: 50, ms: 90_000 });
    const [c] = b.copias();
    assert.equal(c.estado, 'verificada');
    assert.ok(c.bytes > 3_000_000, `${c.bytes} bytes`);
    assert.equal(c.partes, Math.ceil(c.bytes / TAMANO_PARTE));
    assert.ok(c.partes >= 2, 'más de una parte');
    const corridas = b.db.prepare('SELECT como_termino FROM trabajador_corridas WHERE como_termino IS NOT NULL').all().map(x => x.como_termino);
    assert.ok(!corridas.includes('colgado') && !corridas.includes('memoria'), corridas.join(','));
    assert.equal(supervisor.estado().pid, pid, 'el mismo trabajador de principio a fin');
    console.log(`# memoria del trabajador durante la copia: hasta ${Math.round(rssMaxMb)} MB (se sale solo a los 120 MB)`);
  });
});

test('2.6 lo matan en medio de una subida a Telegram: al volver, la MISMA copia sigue desde esa parte y se comprueba', async () => {
  await conTrabajador(async ({ b, supervisor, pids }) => {
    b.falso.escena('sendDocument', 'nunca');
    const id = b.pedir();
    supervisor.iniciar();
    const pid = await esperarHasta(() => supervisor.estado().pid, { que: 'el trabajador encendido' });
    pids.add(pid);
    await esperarHasta(() => b.falso.pedidos.some(p => p.metodo === 'sendDocument'), { que: 'empezó a subir', ms: 60_000 });
    process.kill(pid, 'SIGKILL');
    const otro = await esperarHasta(() => { const p = supervisor.estado().pid; return p && p !== pid ? p : null; }, { que: 'el trabajador encendido otra vez', ms: 30_000 });
    pids.add(otro);
    // La tarea quedó con un fallo (la caída pudo ser su culpa) y espera su reintento (10 min): se adelanta.
    await esperarHasta(() => b.tarea(id).estado === 'lista', { que: 'la tarea de vuelta en la fila', ms: 30_000 });
    b.db.prepare('UPDATE tareas SET disponible_en = ? WHERE id = ?').run(new Date().toISOString(), id);
    supervisor.despertar();
    await esperarHasta(() => b.tarea(id).estado === 'hecha', { que: 'la copia terminada después de la caída', cada: 50, ms: 90_000 });
    const copias = b.copias();
    assert.equal(copias.length, 1, 'la misma copia (las partes estaban en el disco)');
    assert.equal(copias[0].estado, 'verificada');
    const subidas = b.falso.pedidos.filter(p => p.metodo === 'sendDocument' && p.archivo?.nombre.endsWith('-p001.opc'));
    assert.equal(subidas.length, 2, 'la parte 1 otra vez (la primera nunca terminó), y nada más repetido');
    assert.equal(b.falso.fijado(5_550_001), copias[0].indice_mensaje_id);
  });
});
