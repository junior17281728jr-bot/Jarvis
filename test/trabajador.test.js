// Pruebas del trabajador con PROCESOS DE VERDAD (fase 1, parte c): el supervisor lo enciende con nice, lo
// vigila, recupera sus tareas cuando se cae, lo deja apagado en modo seguro, y el servicio completo se apaga
// ordenado. Corren una detrás de otra; cada una, al final, corta todo proceso que haya encendido.
// Nunca usan internet, ni el puerto 8080, ni /var/lib.
import { configDePrueba, carpetaTemporal, esperarHasta, matarSiVive, procesoTerminado } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBase } from '../src/nucleo/db.js';
import { encolar } from '../src/tareas/cola.js';
import { leerModoSeguro, ponerModoSeguro } from '../src/tareas/modo-seguro.js';
import { nuevaCorrida, terminarCorrida } from '../src/tareas/corridas.js';
import { crearSupervisor, lanzarTrabajador } from '../src/tareas/supervisor.js';
import { REGISTRO_PRUEBA } from './tareas-prueba.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_PRUEBA = join(RAIZ, 'test', 'tareas-prueba.js');
const dormir = ms => new Promise(listo => setTimeout(listo, ms));
// Espera la promesa como mucho ms (null si no llegó). El reloj se limpia: no deja la prueba esperando de más.
function conTope(promesa, ms) {
  let reloj;
  return Promise.race([promesa, new Promise(listo => { reloj = setTimeout(() => listo(null), ms); })]).finally(() => clearTimeout(reloj));
}

// Un supervisor de prueba con su base propia, tiempos cortos y un registro de cada trabajador que encendió.
function preparar({ tiempos = {}, tiemposTrabajador = {}, entorno = {} } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const pids = new Set();
  const lanzados = [];
  const registro = [];
  const lanzar = opciones => {
    const proceso = lanzarTrabajador(opciones);
    lanzados.push(proceso);
    if (proceso.pid) pids.add(proceso.pid);
    return proceso;
  };
  const anotar = (...partes) => registro.push(partes.map(p => (p instanceof Error ? p.message : String(p))).join(' '));
  const supervisor = crearSupervisor({
    db, config, version: '0.0.0-prueba', codigo: `prueba-${Math.random().toString(16).slice(2, 10)}`, ruta: RUTA_PRUEBA, lanzar,
    tiempos: { revisarCadaMs: 100, modoSeguroCadaMs: 300, reinicioBaseMs: 100, reintentoSenalMs: 100, ...tiempos },
    tiemposTrabajador: { latidoMs: 200, cicloMs: 100, recuperarCadaMs: 500, ...tiemposTrabajador },
    entorno,
    registro: { log: anotar, error: anotar, warn: anotar },
  });
  return {
    config, db, supervisor, pids, lanzados, registro,
    poner: (tipo, datos = {}) => encolar(db, { tipo, datos }, { registro: REGISTRO_PRUEBA }).id,
    tarea: id => db.prepare('SELECT * FROM tareas WHERE id = ?').get(id),
    corrida: corrida => db.prepare('SELECT * FROM trabajador_corridas WHERE corrida = ?').get(corrida),
    corridas: () => db.prepare('SELECT * FROM trabajador_corridas ORDER BY id').all(),
    log: () => registro.join('\n'),
    async cerrar() {
      try { await supervisor.parar(); } finally {
        for (const pid of pids) matarSiVive(pid);
        db.close();
      }
    },
  };
}

function niceDeLosHilos(pid) {
  return readdirSync(`/proc/${pid}/task`).map(hilo => {
    const estado = readFileSync(`/proc/${pid}/task/${hilo}/stat`, 'utf8');
    return Number(estado.slice(estado.lastIndexOf(')') + 2).split(' ')[16]);
  });
}

// Enciende src/server.js como lo hace systemd (en su propio grupo de procesos), con una carpeta de datos de
// prueba. Devuelve lo necesario para hablarle y para cortarlo.
async function encenderServidor() {
  const datos = carpetaTemporal('oportia-servicio');
  const hijo = spawn(process.execPath, ['--no-warnings', 'src/server.js'], {
    cwd: RAIZ,
    detached: true,
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', PORT: '0', HOST: '127.0.0.1', DB_PATH: join(datos, 'jarvis.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', d => { salida += d; });
  hijo.stderr.on('data', d => { salida += d; });
  const servicio = {
    hijo, datos, salida: () => salida, pidTrabajador: null, puerto: null,
    salio: new Promise(listo => hijo.once('exit', (codigo, senal) => listo({ codigo, senal }))),
  };
  servicio.puerto = Number((await esperarHasta(() => salida.match(/escuchando en 127\.0\.0\.1:(\d+)/), { que: `que el servidor abra el puerto. Salida: ${salida}` }))[1]);
  await esperarHasta(async () => (await fetch(`http://127.0.0.1:${servicio.puerto}/api/setup`)).status === 200, { que: '/api/setup en 200', cada: 100 });
  servicio.pidTrabajador = Number((await esperarHasta(() => salida.match(/\[tareas\] trabajador \S* listo \(pid (\d+)\)/), { que: 'la línea «listo» del trabajador' }))[1]);
  return servicio;
}

function leerBase(datos) {
  const db = new DatabaseSync(join(datos, 'oportia.db'));
  try {
    return {
      corridas: db.prepare('SELECT * FROM trabajador_corridas ORDER BY id').all(),
      arranques: db.prepare('SELECT * FROM servidor_arranques ORDER BY id').all(),
    };
  } finally {
    db.close();
  }
}

// ---------- El supervisor con un trabajador DE MENTIRA (sin procesos: rápido y exacto) ----------
// Un «proceso» que solo hace lo que la prueba le dice. contestaParar: si sale ordenado cuando se le pide por
// el canal. Nunca tiene un pid de verdad, así que nada se puede cortar por error.
function trabajadorDeMentira({ contestaParar = true, alNacer = null } = {}) {
  const p = new EventEmitter();
  p.pid = null;
  p.connected = true;
  p.mensajes = [];
  p.senales = [];
  p.salir = (codigo, senal = null) => setImmediate(() => {
    if (p.salido) return;
    p.salido = true;
    p.connected = false;
    p.emit('exit', codigo, senal);
  });
  p.decir = mensaje => setImmediate(() => { if (!p.salido) p.emit('message', mensaje); });
  p.send = mensaje => {
    p.mensajes.push(mensaje);
    if (mensaje.tipo === 'parar' && contestaParar) {
      p.decir({ tipo: 'saliendo', motivo: mensaje.motivo });
      p.salir(0);
    }
    return true;
  };
  p.kill = senal => {
    p.senales.push(senal);
    if (senal === 'SIGTERM') { p.decir({ tipo: 'saliendo', motivo: 'senal' }); p.salir(0); } else p.salir(null, senal);
    return true;
  };
  if (alNacer) setImmediate(() => alNacer(p));
  return p;
}

function supervisorDeMentira({ tiempos = {}, reloj, ...opciones } = {}) {
  const config = configDePrueba();
  const db = abrirBase(config);
  const lanzados = [];
  const cuando = [];
  const codigo = `mentira-${Math.random().toString(16).slice(2, 10)}`;
  const crear = opciones.crear ?? (() => trabajadorDeMentira());
  const supervisor = crearSupervisor({
    db, config, version: '0.0.0-prueba', codigo,
    lanzar: () => { const p = crear(lanzados.length); lanzados.push(p); cuando.push(performance.now()); return p; },
    tiempos: { revisarCadaMs: 50, modoSeguroCadaMs: 50, saludCadaMs: 600_000, ...tiempos },
    registro: { log() {}, error() {}, warn() {} },
    ...(reloj ? { reloj } : {}),
    ...(opciones.monotono ? { monotono: opciones.monotono } : {}),
  });
  return { db, config, codigo, supervisor, lanzados, cuando, cerrar: async () => { await supervisor.parar(); db.close(); } };
}

test('supervisor: la puerta de arranque nunca queda en «arrancando» para siempre, aunque nunca se llame a iniciar()', async () => {
  let ahora = 1_000_000;
  const m = supervisorDeMentira({ reloj: () => ahora });
  try {
    assert.equal(m.supervisor.estadoArranque(), 'arrancando');
    ahora += 89_000;
    assert.equal(m.supervisor.estadoArranque(), 'arrancando');
    ahora += 1_001;
    assert.equal(m.supervisor.estadoArranque(), 'no_aplica');
    // Si el servicio ya se está apagando cuando llega iniciar(), no se enciende ningún trabajador.
    await m.supervisor.parar();
    m.supervisor.iniciar();
    assert.equal(m.lanzados.length, 0);
  } finally {
    await m.cerrar();
  }
});

test('supervisor: después de 3 fallos al arrancar queda «fallido» y deja de reintentar cada segundo (espera cada vez más)', async () => {
  const m = supervisorDeMentira({
    tiempos: { reinicioBaseMs: 40 },
    crear: () => trabajadorDeMentira({ alNacer: p => p.salir(1) }),
  });
  try {
    m.supervisor.iniciar();
    await esperarHasta(() => m.lanzados.length >= 6, { que: '6 intentos' });
    assert.equal(m.supervisor.estadoArranque(), 'fallido');
    // Dentro de la ventana: 20, 40, 60 ms. Ya «fallido»: 40, 80, 160 ms (los relojes nunca llegan antes).
    const espera = m.cuando[5] - m.cuando[4];
    assert.ok(espera >= 150, `el 6.º intento esperó solo ${Math.round(espera)} ms`);
    for (const c of m.db.prepare('SELECT como_termino FROM trabajador_corridas WHERE termino_en IS NOT NULL').all()) assert.equal(c.como_termino, 'no_arranco');
  } finally {
    await m.cerrar();
  }
});

test('supervisor: si el trabajador sale porque se activó el modo seguro mientras arrancaba, /api/setup no se queda en 503', async () => {
  // La revisión de cada 30 s no llega a tiempo aquí: la puerta tiene que abrirse sola al quedar en modo seguro.
  const m = supervisorDeMentira({ tiempos: { modoSeguroCadaMs: 600_000 }, crear: () => trabajadorDeMentira() });
  try {
    m.supervisor.iniciar();
    assert.equal(m.supervisor.estadoArranque(), 'arrancando');
    // Como la consola: escribe directo en la base; el trabajador lo ve al arrancar y sale «modo_seguro».
    ponerModoSeguro(m.db, { activo: true, origen: 'consola' });
    m.lanzados[0].decir({ tipo: 'saliendo', motivo: 'modo_seguro' });
    m.lanzados[0].salir(0);
    await esperarHasta(() => m.supervisor.estado().fase === 'modo_seguro', { que: 'fase modo_seguro' });
    assert.equal(m.supervisor.estadoArranque(), 'no_aplica');
    assert.equal(m.lanzados.length, 1);
  } finally {
    await m.cerrar();
  }
});

test('supervisor: al apagar, si el trabajador no contesta por el canal en 1 s, recibe SIGTERM (y no hace falta SIGKILL)', async () => {
  const m = supervisorDeMentira({
    tiempos: { senalTrasMs: 50 },
    crear: () => trabajadorDeMentira({ contestaParar: false, alNacer: p => p.decir({ tipo: 'listo' }) }),
  });
  try {
    m.supervisor.iniciar();
    await esperarHasta(() => m.supervisor.estadoArranque() === 'listo', { que: 'listo' });
    const { corrida } = m.supervisor.estado();
    await m.supervisor.parar();
    assert.deepEqual(m.lanzados[0].mensajes.map(x => x.tipo), ['parar']);
    assert.deepEqual(m.lanzados[0].senales, ['SIGTERM']);
    assert.equal(m.db.prepare('SELECT como_termino FROM trabajador_corridas WHERE corrida = ?').get(corrida).como_termino, 'normal');
    assert.equal(m.lanzados.length, 1);
  } finally {
    await m.cerrar();
  }
});

test('supervisor: después de quitar el modo seguro, solo cuentan las caídas NUEVAS (el trabajador tiene otras 5 oportunidades)', async () => {
  const m = supervisorDeMentira({
    tiempos: { ventanaArranqueMs: 0, reinicioBaseMs: 10, reinicioMaxMs: 20 },
    crear: () => trabajadorDeMentira({ alNacer: p => { p.decir({ tipo: 'listo' }); setTimeout(() => p.salir(1), 5); } }),
  });
  try {
    // 5 caídas recientes del mismo código, y después alguien quitó el modo seguro.
    for (let i = 0; i < 5; i += 1) terminarCorrida(m.db, { corrida: nuevaCorrida(m.db, { version: '0.0.0-prueba', codigo: m.codigo }), como: 'caida', codigo: 1 });
    await dormir(5);
    ponerModoSeguro(m.db, { activo: true, origen: 'automatico', motivo: 'trabajador_inestable', codigo: m.codigo });
    ponerModoSeguro(m.db, { activo: false, origen: 'consola' });
    await dormir(5);
    m.supervisor.iniciar();
    await esperarHasta(() => m.lanzados.length >= 3, { que: '3 intentos' });
    assert.equal(leerModoSeguro(m.db).activo, false, 'las caídas de antes de quitarlo no cuentan');
    await esperarHasta(() => leerModoSeguro(m.db).activo, { que: 'modo seguro con 5 caídas nuevas' });
    assert.equal(m.lanzados.length, 5);
    assert.equal(leerModoSeguro(m.db).motivo, 'trabajador_inestable');
  } finally {
    await m.cerrar();
  }
});

test('supervisor: si el reloj del servidor salta 2 min adelante, un trabajador sano NO se corta por «colgado»; si salta 1 h atrás, la puerta igual se abre a los 90 s', async () => {
  let salto = 0;
  const m = supervisorDeMentira({
    reloj: () => Date.now() + salto,
    monotono: () => performance.now(),
    crear: () => trabajadorDeMentira({ alNacer: p => p.decir({ tipo: 'listo' }) }),
  });
  try {
    m.supervisor.iniciar();
    await esperarHasta(() => m.supervisor.estado().fase === 'esperando', { que: 'listo' });
    salto = 120_000; // NTP corrige la hora del servidor: 2 minutos adelante de golpe
    await dormir(300); // la vigilancia mira cada 50 ms
    assert.deepEqual(m.lanzados[0].senales, [], 'nadie le mandó SIGKILL');
    assert.equal(m.lanzados.length, 1);
    assert.equal(m.supervisor.estado().fase, 'esperando');
    assert.ok(m.supervisor.estado().segundosDesdeLatido < 5);
  } finally {
    await m.cerrar();
  }

  salto = 0;
  const n = supervisorDeMentira({ tiempos: { ventanaArranqueMs: 150 }, reloj: () => Date.now() + salto, monotono: () => performance.now() });
  try {
    salto = -3_600_000;
    await dormir(250);
    assert.equal(n.supervisor.estadoArranque(), 'no_aplica', 'la ventana de 90 s se mide con un reloj que no salta');
  } finally {
    await n.cerrar();
  }
});

test('supervisor: si el trabajador sale una y otra vez por pasos zombis, cada vez espera más (no se reinicia sin parar)', async () => {
  const m = supervisorDeMentira({
    tiempos: { ventanaArranqueMs: 0, reintentoSenalMs: 20, reinicioBaseMs: 100, reinicioMaxMs: 10_000 },
    crear: () => trabajadorDeMentira({ alNacer: p => { p.decir({ tipo: 'listo' }); setTimeout(() => p.salir(76), 5); } }),
  });
  try {
    m.supervisor.iniciar();
    await esperarHasta(() => m.lanzados.length >= 4, { que: '4 vidas' });
    const esperas = [1, 2, 3].map(i => m.cuando[i] - m.cuando[i - 1]);
    assert.ok(esperas[0] < 95, `la primera vez vuelve rápido (${Math.round(esperas[0])} ms)`);
    assert.ok(esperas[1] >= 95, `la segunda ya espera más (${Math.round(esperas[1])} ms)`);
    assert.ok(esperas[2] >= 190, `y la tercera, más todavía (${Math.round(esperas[2])} ms)`);
    assert.equal(leerModoSeguro(m.db).activo, false, 'los zombis no cuentan para el modo seguro');
    assert.ok(m.db.prepare("SELECT COUNT(*) AS n FROM trabajador_corridas WHERE como_termino = 'zombis'").get().n >= 3);
  } finally {
    await m.cerrar();
  }
});

test('supervisor: si el servicio arranca en modo seguro, las tareas que quedaron «en curso» de una vida anterior que ya no existe vuelven a la fila', async () => {
  const m = supervisorDeMentira();
  try {
    // Una vida anterior del trabajador (su proceso ya no existe) tenía una tarea en las manos cuando se cayó todo.
    const vieja = nuevaCorrida(m.db, { version: '0.0.0-prueba', codigo: m.codigo });
    m.db.prepare('UPDATE trabajador_corridas SET pid = ?, listo_en = empezo_en, latido_en = empezo_en WHERE corrida = ?').run(2 ** 30, vieja);
    const id = encolar(m.db, { tipo: 'sistema.vigilar' }).id;
    m.db.prepare("UPDATE tareas SET estado = 'en_curso', dueno = ?, tomas = 1, arriendo_hasta = ? WHERE id = ?").run(vieja, new Date(Date.now() + 120_000).toISOString(), id);
    ponerModoSeguro(m.db, { activo: true, origen: 'admin' });
    m.supervisor.iniciar();
    assert.equal(m.supervisor.estado().fase, 'modo_seguro');
    assert.equal(m.lanzados.length, 0, 'en modo seguro no se enciende ningún trabajador');
    const t = m.db.prepare('SELECT * FROM tareas WHERE id = ?').get(id);
    assert.equal(t.estado, 'lista');
    assert.equal(t.fallos_seguidos, 0, 'no fue culpa de la tarea');
    assert.equal(t.dueno, null);
    assert.equal(m.db.prepare('SELECT como_termino FROM trabajador_corridas WHERE corrida = ?').get(vieja).como_termino, 'perdida');
  } finally {
    await m.cerrar();
  }
});

// ---------- Con procesos de verdad ----------
test('1. el trabajador arranca con nice, queda listo, hace sus tareas y se apaga normal', async () => {
  const s = preparar();
  try {
    const eco = s.poner('prueba.eco', { hola: 1 });
    s.supervisor.iniciar();
    await esperarHasta(() => s.supervisor.estadoArranque() === 'listo', { que: `que el trabajador quede listo. Registro: ${s.log()}` });
    const { pid, corrida } = s.supervisor.estado();
    const fila = s.corrida(corrida);
    assert.equal(fila.pid, pid);
    assert.ok(fila.listo_en, 'la corrida anota cuándo quedó lista');
    if (existsSync('/usr/bin/nice')) {
      for (const nice of niceDeLosHilos(pid)) assert.ok(nice >= 10, `un hilo del trabajador tiene nice ${nice}`);
    }
    let oom = null;
    try { oom = readFileSync(`/proc/${pid}/oom_score_adj`, 'utf8').trim(); } catch { oom = null; }
    if (oom != null) assert.equal(oom, '500');
    await esperarHasta(() => s.tarea(eco).estado === 'hecha', { que: 'prueba.eco hecha' });
    assert.deepEqual(JSON.parse(s.tarea(eco).resultado), { eco: { hola: 1 } });
    await esperarHasta(() => s.db.prepare("SELECT estado FROM tareas WHERE tipo = 'sistema.vigilar'").get()?.estado === 'hecha', { que: 'sistema.vigilar hecha' });
    await s.supervisor.parar();
    assert.equal(s.corrida(corrida).como_termino, 'normal');
    await esperarHasta(() => procesoTerminado(pid), { que: 'que el trabajador termine' });
    assert.equal(s.lanzados.length, 1);
  } finally {
    await s.cerrar();
  }
});

test('2. si matan al trabajador a mitad de un paso, el servidor web recupera sus tareas enseguida y enciende otro', async () => {
  const s = preparar();
  try {
    const pasos = s.poner('prueba.pasos', { esperaMs: 60_000 });
    const correo = s.poner('prueba.correo', { esperaMs: 60_000 });
    s.supervisor.iniciar();
    await esperarHasta(() => s.tarea(pasos).estado === 'en_curso' && s.tarea(correo).estado === 'en_curso', { que: `las dos tareas en curso. Registro: ${s.log()}` });
    const viejo = s.supervisor.estado();
    process.kill(viejo.pid, 'SIGKILL');
    await esperarHasta(() => s.corrida(viejo.corrida).como_termino === 'caida', { que: 'la corrida vieja queda «caida»' });
    const t = s.tarea(pasos);
    assert.equal(t.estado, 'lista');
    assert.equal(t.fallos_seguidos, 1, 'una caída del trabajador le cuesta un intento a la tarea');
    assert.equal(t.dueno, null);
    assert.equal(s.tarea(correo).estado, 'revisar', 'lo que «manda algo» nunca se repite solo');
    const nueva = await esperarHasta(() => s.corridas().find(c => c.corrida !== viejo.corrida && c.listo_en), { que: 'un trabajador nuevo listo' });
    // La recuperación la hizo el servidor web (el padre) ANTES de encender al nuevo.
    const evento = s.db.prepare("SELECT fecha FROM tarea_eventos WHERE tarea_id = ? AND evento = 'abandonada'").get(pasos);
    assert.ok(evento && evento.fecha <= nueva.empezo_en, 'la tarea se recuperó antes de encender al trabajador nuevo');
  } finally {
    await s.cerrar();
  }
});

test('3. un trabajador colgado se corta solo («colgado»), su tarea suma un fallo y el nuevo sigue trabajando', async () => {
  const s = preparar({ tiempos: { vigiaMs: 1500 } });
  try {
    s.supervisor.iniciar();
    await esperarHasta(() => s.supervisor.estadoArranque() === 'listo', { que: `listo. Registro: ${s.log()}` });
    const viejo = s.supervisor.estado();
    const colgar = s.poner('prueba.colgar', { ms: 20_000 });
    s.supervisor.despertar();
    await esperarHasta(() => s.corrida(viejo.corrida).como_termino === 'colgado', { que: `la corrida queda «colgado». Registro: ${s.log()}` });
    await esperarHasta(() => procesoTerminado(viejo.pid), { que: 'el trabajador colgado ya no existe' });
    const t = s.tarea(colgar);
    assert.equal(t.estado, 'lista');
    assert.equal(t.fallos_seguidos, 1);
    const eco = s.poner('prueba.eco');
    await esperarHasta(() => s.tarea(eco).estado === 'hecha', { que: `prueba.eco hecha por el trabajador nuevo. Registro: ${s.log()}` });
  } finally {
    await s.cerrar();
  }
});

test('4a. si el trabajador no puede arrancar, la puerta de arranque queda «fallido» después de 3 intentos', async () => {
  const s = preparar({ entorno: { OPORTIA_PRUEBA_ROMPER: '1' } });
  try {
    assert.equal(s.supervisor.estadoArranque(), 'arrancando');
    s.supervisor.iniciar();
    await esperarHasta(() => s.supervisor.estadoArranque() === 'fallido', { que: `puerta «fallido». Registro: ${s.log()}` });
    assert.ok(s.lanzados.length >= 3);
    for (const c of s.corridas().filter(c => c.termino_en)) assert.equal(c.como_termino, 'no_arranco');
    assert.equal(leerModoSeguro(s.db).activo, false, 'dentro de la ventana de arranque no se activa el modo seguro (taparía el 503)');
  } finally {
    await s.cerrar();
  }
});

test('4b. fuera de la ventana, 5 caídas seguidas activan el modo seguro, con aviso grave, y no hay un 6.º intento', async () => {
  const s = preparar({ entorno: { OPORTIA_PRUEBA_ROMPER: '1' }, tiempos: { ventanaArranqueMs: 0, reinicioBaseMs: 20, caidasParaModoSeguro: 5 } });
  try {
    s.supervisor.iniciar();
    await esperarHasta(() => leerModoSeguro(s.db).activo, { que: `modo seguro. Registro: ${s.log()}` });
    const m = leerModoSeguro(s.db);
    assert.equal(m.origen, 'automatico');
    assert.equal(m.motivo, 'trabajador_inestable');
    const aviso = s.db.prepare("SELECT nivel FROM avisos WHERE clave = 'modo_seguro' AND resuelto_en IS NULL").get();
    assert.equal(aviso?.nivel, 'grave');
    assert.equal(s.lanzados.length, 5);
    await dormir(500);
    assert.equal(s.lanzados.length, 5, 'en modo seguro no se vuelve a encender');
    assert.equal(s.supervisor.estado().fase, 'modo_seguro');
    assert.equal(s.supervisor.estadoArranque(), 'no_aplica');
  } finally {
    await s.cerrar();
  }
});

test('5. modo seguro: desde la pantalla apaga al trabajador (y no vuelve); quitado desde la consola, vuelve solo', async () => {
  const s = preparar();
  try {
    s.supervisor.iniciar();
    await esperarHasta(() => s.supervisor.estadoArranque() === 'listo', { que: `listo. Registro: ${s.log()}` });
    const primero = s.supervisor.estado();
    s.supervisor.ponerModoSeguro({ activo: true, usuarioId: null });
    await esperarHasta(() => s.corrida(primero.corrida).como_termino === 'modo_seguro', { que: `la corrida termina «modo_seguro». Registro: ${s.log()}` });
    await esperarHasta(() => procesoTerminado(primero.pid), { que: 'el trabajador salió' });
    await dormir(700);
    assert.equal(s.lanzados.length, 1, 'en modo seguro no se enciende otro');
    assert.equal(s.supervisor.estado().fase, 'modo_seguro');
    // Como hace la herramienta de la consola: escribe directo en la base, sin hablar con el servidor.
    ponerModoSeguro(s.db, { activo: false, origen: 'consola' });
    await esperarHasta(() => s.corridas().some(c => c.corrida !== primero.corrida && c.listo_en), { que: `un trabajador nuevo listo. Registro: ${s.log()}` });
    assert.equal(s.lanzados.length, 2);
  } finally {
    await s.cerrar();
  }
});

test('6. como systemd: SIGTERM a los dos procesos a la vez; el servicio sale a tiempo y nada cuenta como caída', async () => {
  let servicio = null;
  try {
    servicio = await encenderServidor();
    process.kill(-servicio.hijo.pid, 'SIGTERM');
    const fin = await conTope(servicio.salio, 15_000);
    assert.ok(fin, `el servidor no salió en 15 s. Salida: ${servicio.salida()}`);
    assert.equal(fin.codigo, 0);
    await esperarHasta(() => procesoTerminado(servicio.pidTrabajador), { que: 'el trabajador ya no existe' });
    const { corridas, arranques } = leerBase(servicio.datos);
    assert.ok(['senal', 'normal'].includes(corridas.at(-1).como_termino), `la última corrida terminó «${corridas.at(-1).como_termino}»`);
    assert.ok(arranques.at(-1).termino_en, 'el arranque del servidor quedó cerrado limpio');
  } finally {
    if (servicio) {
      matarSiVive(servicio.hijo.pid);
      matarSiVive(servicio.pidTrabajador);
    }
  }
});

test('7. si el servidor web muere de golpe, el trabajador se da cuenta y sale solo («sin_padre»)', async () => {
  let servicio = null;
  try {
    servicio = await encenderServidor();
    process.kill(servicio.hijo.pid, 'SIGKILL');
    await servicio.salio;
    await esperarHasta(() => procesoTerminado(servicio.pidTrabajador), { que: 'el trabajador salió solo' });
    const { corridas } = leerBase(servicio.datos);
    assert.equal(corridas.at(-1).como_termino, 'sin_padre');
  } finally {
    if (servicio) {
      matarSiVive(servicio.hijo.pid);
      matarSiVive(servicio.pidTrabajador);
    }
  }
});

test('8. el trabajador sin canal con el servidor web no arranca: sale con 1 sin tocar la base', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const corrida = nuevaCorrida(db, { version: '0.0.0-prueba', codigo: 'sin-canal' });
  const hijo = spawn(process.execPath, ['--no-warnings', RUTA_PRUEBA], {
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', OPORTIA_DB: config.archivoBase, OPORTIA_COPIAS: config.carpetaCopias, OPORTIA_CORRIDA: corrida },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stderr.on('data', d => { salida += d; });
  try {
    const fin = await conTope(new Promise(listo => hijo.once('exit', codigo => listo({ codigo }))), 20_000);
    assert.equal(fin?.codigo, 1, `salió con ${fin?.codigo}. Salida: ${salida}`);
    assert.match(salida, /solo lo enciende el servidor web/);
    assert.equal(db.prepare('SELECT pid FROM trabajador_corridas WHERE corrida = ?').get(corrida).pid, null, 'no anotó nada en la base');
  } finally {
    matarSiVive(hijo.pid);
    db.close();
  }
});
