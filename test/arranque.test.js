// Prueba de arranque REAL: inicia src/server.js como lo hace el servidor (con DB_PATH apuntando a una
// carpeta de datos de prueba llena de archivos) y comprueba, con huellas digitales, que no cambió ni
// desapareció ningún archivo que ya existía. Es la promesa principal de OPORTIA: nunca borrar datos.
// Desde la fase 1, parte c también comprueba que el trabajador (el segundo proceso) arranca, queda listo y
// se apaga junto con el servidor, sin dejar nada encendido.
import { carpetaTemporal, esperarHasta, huellas, matarSiVive, procesoTerminado } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

test('al arrancar el servidor completo, ningún archivo existente cambia ni desaparece, y el trabajador se apaga con él', async () => {
  const datos = join(carpetaTemporal(), 'jarvis');
  mkdirSync(join(datos, 'backups'), { recursive: true });
  mkdirSync(join(datos, 'data'), { recursive: true });
  for (const f of ['jarvis.db', 'jarvis.db-wal', 'secrets.env', 'version.txt', 'version.bad', 'update.log', 'public-url.txt', 'funnel.log', '.instalado', 'backups/copia.jvbk', 'data/otro.txt']) {
    writeFileSync(join(datos, f), `contenido de ${f}`);
  }
  const antes = huellas(datos);

  const hijo = spawn(process.execPath, ['--no-warnings', 'src/server.js'], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', PORT: '0', HOST: '127.0.0.1', DB_PATH: join(datos, 'jarvis.db'), BACKUP_DIR: join(datos, 'backups') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', d => { salida += d; });
  hijo.stderr.on('data', d => { salida += d; });
  let termino = null;
  const salio = new Promise(listo => hijo.once('exit', (codigo, senal) => { termino = { codigo, senal }; listo(termino); }));
  let pidTrabajador = null;
  try {
    const puerto = Number((await esperarHasta(() => {
      if (termino) throw new Error(`El servidor se cerró (código ${termino.codigo}). Salida: ${salida}`);
      return salida.match(/escuchando en 127\.0\.0\.1:(\d+)/);
    }, { que: `que el servidor abra el puerto. Salida: ${salida}` }))[1]);
    // Ronda 2 de revisión: el servidor web (que puede tener por un momento una clave descifrada) tampoco deja archivos
    // «core»: se baja a sí mismo ese límite a 0 al arrancar, con prlimit (si existe).
    if (existsSync(`/proc/${hijo.pid}/limits`) && (existsSync('/usr/bin/prlimit') || existsSync('/bin/prlimit'))) {
      const linea = readFileSync(`/proc/${hijo.pid}/limits`, 'utf8').split('\n').find(l => l.startsWith('Max core file size'));
      assert.match(linea, /Max core file size\s+0\s+0\s+bytes/, 'el servidor web corre sin archivos «core»');
      assert.doesNotMatch(salida, /no se pudo quitar los archivos «core»/);
    }
    // El actualizador del servidor pregunta varias veces: mientras el trabajador arranca, responde 503 «arrancando».
    const r = await esperarHasta(async () => {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/setup`);
      return respuesta.status === 200 ? respuesta : null;
    }, { que: '/api/setup en 200', cada: 100 });
    assert.equal((await r.json()).base.estado, 'ok');
    pidTrabajador = Number((await esperarHasta(() => salida.match(/\[tareas\] trabajador \S* listo \(pid (\d+)\)/), { que: `la línea «listo» del trabajador. Salida: ${salida}` }))[1]);

    hijo.kill('SIGTERM');
    let reloj;
    const fin = await Promise.race([salio, new Promise(listo => { reloj = setTimeout(() => listo(null), 15_000); })]);
    clearTimeout(reloj);
    assert.ok(fin, `el servidor no salió en 15 s. Salida: ${salida}`);
    assert.equal(fin.codigo, 0, `el servidor salió con ${fin.codigo}. Salida: ${salida}`);
    await esperarHasta(() => procesoTerminado(pidTrabajador), { que: 'que el trabajador ya no exista' });
  } finally {
    if (!termino) hijo.kill('SIGKILL');
    matarSiVive(pidTrabajador);
  }

  const db = new DatabaseSync(join(datos, 'oportia.db'), { readOnly: true });
  try {
    const ultima = db.prepare('SELECT como_termino FROM trabajador_corridas ORDER BY id DESC LIMIT 1').get();
    assert.ok(['normal', 'senal'].includes(ultima?.como_termino), `la última corrida terminó «${ultima?.como_termino}»`);
    assert.ok(db.prepare('SELECT termino_en FROM servidor_arranques ORDER BY id DESC LIMIT 1').get()?.termino_en, 'el cierre quedó anotado como limpio');
  } finally {
    db.close();
  }

  const despues = huellas(datos);
  for (const [archivo, huella] of Object.entries(antes)) {
    assert.ok(archivo in despues, `desapareció ${archivo}`);
    assert.equal(despues[archivo], huella, `cambió ${archivo}`);
  }
  const nuevos = Object.keys(despues).filter(a => !(a in antes));
  for (const a of nuevos) assert.match(a, /^oportia/, `apareció un archivo que no es de OPORTIA: ${a}`);
});
