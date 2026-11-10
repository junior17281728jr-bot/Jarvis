// Fase 1, parte f: recuperar en un servidor nuevo, pasar el servidor de hoy al actualizador nuevo, el texto de
// instalación (cloud-init.sh) y la copia «antes de cambio». Los programas del servidor corren en una RAÍZ FALSA
// (test/raiz-falsa.js): sin red, sin tocar el servidor y nunca como root. La base, la copia cifrada, la recuperación y
// el arranque del servidor SÍ son de verdad (el código de src/).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { carpetaTemporal, configDePrueba, esperarHasta, huellas, matarSiVive } from './ayuda.js';
import { crearRaiz, motivoParaSaltar, sha, DEPLOY, REPO } from './raiz-falsa.js';
import { baseCompleta, hacerCopia, CLAVE_DE_PRUEBA, claveAnthropicFalsa } from './copias-base.js';
import { abrirBase, conectarBase, ID_APLICACION } from '../src/nucleo/db.js';
import { restaurarCopia } from '../src/copias/restaurar.js';
import { hashClave } from '../src/cuentas/claves.js';
import { guardarClave } from '../src/cuentas/usuarios.js';
import { esArchivoDeLlave, estadoLlave } from '../src/claves/cifrado.js';
import { estadoAlmacen, guardarSecreto, listarSecretos } from '../src/claves/almacen.js';
import { leerEstadoDelActualizador, vigilarActualizador, avisosDelActualizador, lineasDeActualizacion } from '../src/copias/vigilar.js';
import { pendientesTrasRecuperar } from '../src/copias/estado.js';
import { vaPorTelegram } from '../src/canales/avisador.js';

const saltar = motivoParaSaltar() ?? false;
const DATOS = 'var/lib/jarvis';
const EST = 'var/lib/oportia-actualizador';
const CONTRASENA = 'la-clave-de-junior-2026';
const llavesDe = carpeta => readdirSync(carpeta).filter(n => esArchivoDeLlave(n)).sort();

// Un «servidor viejo» con usuario, proyectos y una clave de IA guardada, y su copia cifrada en archivos. Se hace una vez.
let origen;
async function servidorViejo() {
  if (origen) return origen;
  const { config, db, admin } = baseCompleta({ filasPorTabla: 1 });
  guardarClave(db, admin, await hashClave(CONTRASENA));
  const carpeta = join(carpetaTemporal('1f-copia'), 'noche');
  const copia = await hacerCopia({ config, carpeta, tamanoParte: 65_536 });
  const usuarios = Number(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n);
  const proyectos = Number(db.prepare('SELECT COUNT(*) AS n FROM proyectos').get().n);
  db.close();
  const carpetaDatos = join(config.raiz, 'datos');
  origen = { config, carpetaDatos, archivos: [copia.rutaIndice, ...copia.partes.map(p => p.ruta)], usuarios, proyectos };
  return origen;
}

// Un servidor NUEVO (raíz falsa) con la app de verdad puesta, y la copia ya recuperada en su carpeta de trabajo.
async function servidorNuevoConCopia() {
  const o = await servidorViejo();
  const r = crearRaiz();
  r.ponerCodigoReal();
  const trabajo = r.en(DATOS, 'recuperar-20260101-000000');
  mkdirSync(trabajo, { recursive: true });
  const recuperada = join(trabajo, 'recuperada.db');
  const hecho = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: o.archivos }, destino: recuperada });
  assert.equal(hecho.ok, true);
  r.salud(['503', '200 0.6.0']);
  r.config = { archivoBase: r.en(DATOS, 'oportia.db'), carpetaCopias: r.en(DATOS, 'oportia-copias'), carpetaDatos: r.en(DATOS) };
  r.poner = (opciones = {}) => r.correr('oportia-recuperar.sh', ['poner', recuperada], opciones);
  r.mirarLlave = archivo => spawnSync(process.execPath, ['--no-warnings', join(REPO, 'deploy', 'oportia-base.mjs'), '--llave', archivo], {
    encoding: 'utf8', env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR ?? '', OPORTIA_TEST: '1', OPORTIA_ENV_FILE: r.en('opt/jarvis/.env') },
  });
  return { r, recuperada, o };
}

// Enciende el servidor de VERDAD (src/server.js, con su trabajador) sobre esa carpeta de datos y comprueba que queda
// sano dentro de la puerta de arranque y que la contraseña de siempre entra.
async function arrancaYEntra(carpetaDatos) {
  const hijo = spawn(process.execPath, ['--no-warnings', 'src/server.js'], {
    cwd: REPO,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR ?? '', OPORTIA_TEST: '1', PORT: '0', HOST: '127.0.0.1', DB_PATH: join(carpetaDatos, 'jarvis.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', d => { salida += d; });
  hijo.stderr.on('data', d => { salida += d; });
  let termino = false;
  const salio = new Promise(listo => hijo.once('exit', () => { termino = true; listo(); }));
  let pidTrabajador = null;
  try {
    const puerto = Number((await esperarHasta(() => {
      if (termino) throw new Error(`el servidor se cerró: ${salida}`);
      return salida.match(/escuchando en 127\.0\.0\.1:(\d+)/);
    }, { ms: 60_000, que: `que el servidor abra el puerto: ${salida}` }))[1]);
    const t0 = Date.now();
    const r = await esperarHasta(async () => {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/setup`);
      return respuesta.status === 200 ? respuesta.json() : null;
    }, { ms: 80_000, cada: 100, que: `/api/setup en 200: ${salida}` });
    assert.ok(Date.now() - t0 < 80_000, 'contesta 200 dentro de la puerta de arranque (el trabajador arrancó)');
    assert.equal(r.app, 'oportia');
    assert.equal(r.base.estado, 'ok');
    assert.equal(r.necesitaAdmin, false, 'el usuario de siempre está');
    pidTrabajador = Number((await esperarHasta(() => salida.match(/\[tareas\] trabajador \S* listo \(pid (\d+)\)/), { que: `el trabajador listo: ${salida}` }))[1]);
    const entrar = await fetch(`http://127.0.0.1:${puerto}/api/entrar`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'junior', clave: CONTRASENA }) });
    assert.equal(entrar.status, 200, 'la misma contraseña entra');
    hijo.kill('SIGTERM');
    await Promise.race([salio, new Promise(listo => setTimeout(listo, 15_000))]);
  } finally {
    matarSiVive(hijo.pid);
    matarSiVive(pidTrabajador);
  }
}

test('1f instalar 1a: la base recuperada ARRANCA como servidor en una carpeta nueva (sin llave): entra la misma contraseña y Claves dice «recuperada»', { skip: saltar }, async () => {
  const { r, recuperada, o } = await servidorNuevoConCopia();
  const huella = r.sha256(recuperada);
  const x = r.poner();
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(r.sha256(r.en(DATOS, 'oportia.db')), huella, 'la base recuperada quedó en su sitio, idéntica');
  assert.ok(!existsSync(recuperada));
  assert.ok(!readdirSync(r.en(DATOS)).some(n => n.startsWith('apartado-')), 'no había nada que apartar');
  assert.deepEqual(llavesDe(r.en(DATOS)), [], 'un servidor nuevo no trae la llave de las claves');
  assert.deepEqual(r.llamadas().filter(l => /^systemctl (stop|start|restart)/.test(l)), ['systemctl stop jarvis', 'systemctl start jarvis']);
  await arrancaYEntra(r.en(DATOS));
  const db = conectarBase(r.config);
  try {
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n), o.usuarios);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM proyectos').get().n), o.proyectos);
    assert.deepEqual(estadoAlmacen(db, r.config), { listo: true, motivo: 'restaurada' });
    assert.ok(listarSecretos(db, r.config).filter(u => u.activa).every(u => u.activa.legible === false), 'las claves de antes piden «pégala otra vez»');
    // Deja guardar una clave nueva (crea una llave nueva), sin pasar por la consola.
    guardarSecreto(db, r.config, { uso: 'ia_anthropic', valor: claveAnthropicFalsa(), usuarioId: 1 });
    assert.ok(llavesDe(r.en(DATOS)).length >= 1, 'se creó una llave nueva');
    assert.ok(listarSecretos(db, r.config).some(u => u.activa?.legible === true));
  } finally {
    db.close();
  }
});

test('1f instalar 1b: con una llave AJENA en el servidor, «poner» la aparta junto con la base que había; la recuperada arranca en el estado «recuperada»', { skip: saltar }, async () => {
  const { r, recuperada } = await servidorNuevoConCopia();
  // El servidor nuevo ya se había usado: tiene su propia base, con una clave pegada (y por eso su propia llave).
  const propia = abrirBase(r.config);
  guardarSecreto(propia, r.config, { uso: 'ia_anthropic', valor: claveAnthropicFalsa(), usuarioId: null });
  propia.close();
  writeFileSync(r.en(DATOS, 'oportia.db-shm'), 'memoria compartida de antes');
  mkdirSync(r.en(DATOS, 'oportia-copias'), { recursive: true });
  writeFileSync(r.en(DATOS, 'oportia-copias', 'una-copia.db'), 'una copia local');
  const llaves = llavesDe(r.en(DATOS)); // la llave y sus otros nombres
  assert.ok(llaves.length >= 1);
  const antes = huellas(r.en(DATOS));
  assert.match(r.mirarLlave(recuperada).stdout, /^llave ajena\n(?:archivo \S+\n)+$/);
  const huella = r.sha256(recuperada);
  const x = r.poner();
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /quedó apartada con ella\. Pega otra vez tus claves/);
  const apartado = readdirSync(r.en(DATOS)).find(n => /^apartado-\d{8}-\d{6}(?:-\d+)?$/.test(n));
  assert.ok(apartado);
  const guardado = huellas(r.en(DATOS, apartado));
  for (const nombre of ['oportia.db', 'oportia.db-shm', ...llaves]) assert.equal(guardado[nombre], antes[nombre], `${nombre} quedó apartado, idéntico`);
  assert.match(r.leer(DATOS, apartado, 'LEEME.txt'), /Nada se borró/);
  assert.deepEqual(llavesDe(r.en(DATOS)), [], 'la llave ajena ya no está junto a la base recuperada');
  assert.equal(r.sha256(r.en(DATOS, 'oportia.db')), huella);
  assert.equal(huellas(r.en(DATOS, 'oportia-copias'))['una-copia.db'], antes['oportia-copias/una-copia.db'], 'las copias no se tocan');
  await arrancaYEntra(r.en(DATOS));
  const db = conectarBase(r.config);
  try {
    assert.deepEqual(estadoAlmacen(db, r.config), { listo: true, motivo: 'restaurada' });
  } finally {
    db.close();
  }
});

test('1f instalar 1c: con la llave que SIRVE (la del servidor de donde salió la copia), no se mueve y las claves guardadas se leen', { skip: saltar }, async () => {
  const { r, recuperada, o } = await servidorNuevoConCopia();
  const llave = llavesDe(o.carpetaDatos).find(n => !n.includes('.'));
  assert.ok(llave, 'el servidor viejo tiene su llave');
  copyFileSync(join(o.carpetaDatos, llave), r.en(DATOS, llave));
  const huellaLlave = r.sha256(r.en(DATOS, llave));
  assert.match(r.mirarLlave(recuperada).stdout, /^llave sirve\n/);
  const x = r.poner();
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /Tus claves de IA siguen guardadas/);
  assert.equal(r.sha256(r.en(DATOS, llave)), huellaLlave, 'la llave no se movió');
  assert.ok(!readdirSync(r.en(DATOS)).some(n => n.startsWith('apartado-')));
  await arrancaYEntra(r.en(DATOS));
  const db = conectarBase(r.config);
  try {
    assert.deepEqual(estadoAlmacen(db, r.config), { listo: true, motivo: null });
    assert.ok(listarSecretos(db, r.config).some(u => u.activa?.legible === true), 'la clave guardada se lee');
  } finally {
    db.close();
  }
  // Los otros dos veredictos del programa de solo lectura: sin llave en el servidor, y una base sin claves guardadas.
  const otro = crearRaiz();
  otro.ponerCodigoReal();
  const entorno = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR ?? '', OPORTIA_TEST: '1', OPORTIA_ENV_FILE: otro.en('opt/jarvis/.env') };
  const mirar = (...a) => spawnSync(process.execPath, ['--no-warnings', join(REPO, 'deploy', 'oportia-base.mjs'), ...a], { encoding: 'utf8', env: entorno });
  assert.equal(mirar('--llave', r.en(DATOS, 'oportia.db')).stdout, 'llave sin_llave\n');
  const vacia = configDePrueba();
  abrirBase(vacia).close();
  copyFileSync(join(o.carpetaDatos, llave), otro.en(DATOS, llave));
  assert.match(mirar('--llave', vacia.archivoBase).stdout, /^llave sin_claves\narchivo /);
  assert.match(mirar(r.en(DATOS, 'oportia.db')).stdout, new RegExp(`^base ${o.usuarios} ${o.proyectos} 6\\n$`));
  assert.equal(mirar().status, 2);
  assert.equal(mirar(join(otro.base, 'no-existe.db')).status, 1);
});

test('1f instalar 2: «poner» nunca pisa: la base que había (con -wal y -shm) queda apartada idéntica; si no arranca, TODO vuelve exactamente', { skip: saltar }, async () => {
  const { r, recuperada } = await servidorNuevoConCopia();
  const propia = abrirBase(r.config);
  guardarSecreto(propia, r.config, { uso: 'ia_anthropic', valor: claveAnthropicFalsa(), usuarioId: null });
  propia.close();
  writeFileSync(r.en(DATOS, 'oportia.db-wal'), 'registro de antes');
  writeFileSync(r.en(DATOS, 'oportia.db-shm'), 'memoria de antes');
  mkdirSync(r.en(DATOS, 'oportia-copias'), { recursive: true });
  writeFileSync(r.en(DATOS, 'oportia-copias', 'una-copia.db'), 'una copia local');
  writeFileSync(r.en(DATOS, 'update.log'), 'historia\n');
  const huella = r.sha256(recuperada);
  const antes = huellas(r.en(DATOS));
  delete antes['recuperar-20260101-000000/recuperada.db'];
  // La app no llega a quedar sana con la base recuperada (503 toda la ventana).
  r.salud(['503']);
  let x = r.poner();
  assert.equal(x.codigo, 1, x.salida);
  assert.match(x.salida, /no arrancó bien con la base recuperada: deshago el cambio/);
  const despues = huellas(r.en(DATOS));
  const noArranco = Object.keys(despues).find(n => /^oportia\.db\.recuperada-no-arranco-\d{8}-\d{6}(?:-\d+)?$/.test(n));
  assert.ok(noArranco, Object.keys(despues).join(' '));
  assert.equal(despues[noArranco], huella, 'la recuperada quedó guardada con su nombre de «no arrancó»');
  const apartado = readdirSync(r.en(DATOS)).find(n => n.startsWith('apartado-'));
  for (const [nombre, h] of Object.entries(antes)) assert.equal(despues[nombre], h, `${nombre} volvió exactamente (base, -wal, -shm, llave, copias…)`);
  const nuevos = Object.keys(despues).filter(n => !(n in antes) && !n.startsWith('recuperar-20260101-000000/')).sort();
  assert.deepEqual(nuevos.filter(n => n !== `${noArranco}-wal`), [`${apartado}/LEEME.txt`, noArranco].sort(), 'nada más apareció y nada se borró');
  assert.deepEqual(r.llamadas().filter(l => /^systemctl (stop|start|restart)/.test(l)), ['systemctl stop jarvis', 'systemctl start jarvis', 'systemctl stop jarvis', 'systemctl start jarvis']);
  // «poner» solo acepta una base recuperada de su carpeta de trabajo, y nunca pisa una base que esté en su sitio.
  x = r.correr('oportia-recuperar.sh', ['poner', r.en(DATOS, 'oportia.db')]);
  assert.equal(x.codigo, 1);
  assert.match(x.salida, /no está donde debe/);
  x = r.correr('oportia-recuperar.sh', ['poner', join(r.base, 'no-existe.db')]);
  assert.equal(x.codigo, 1);
  assert.deepEqual(huellas(r.en(DATOS)), despues);
});

test('1f instalar 5: «sudo oportia recuperar» de punta a punta desde archivos (con el programa de la parte 1e de verdad): aparta lo que había, pone la copia y arranca; probar-copia no cambia nada', { skip: saltar }, async () => {
  const o = await servidorViejo();
  const r = crearRaiz();
  r.ponerCodigoReal();
  r.guionar('usuario.jarvis');
  r.guionar('ts-estado', 'Running');
  r.salud(['503', '200 0.6.0']);
  // Los archivos de la copia «llegan» por Tailscale (Taildrop falso).
  mkdirSync(r.g('taildrop'), { recursive: true });
  for (const [i, archivo] of o.archivos.entries()) copyFileSync(archivo, r.g('taildrop', i === 0 ? 'copia-indice.txt' : `parte-${i}.opc`));
  // El servidor nuevo recién instalado: una base vacía (0 usuarios).
  const config = { archivoBase: r.en(DATOS, 'oportia.db'), carpetaCopias: r.en(DATOS, 'oportia-copias'), carpetaDatos: r.en(DATOS) };
  abrirBase(config).close();
  const terminal = join(r.base, 'terminal');
  const recuperar = (palabra, lineas, extra = []) => {
    writeFileSync(terminal, `${lineas.join('\n')}\n`);
    return r.correr('oportia-recuperar.sh', [palabra, ...extra], { entorno: { OPORTIA_TERMINAL: terminal }, tope: 120_000 });
  };

  // probar-copia: descifra y revisa todo; no escribe ninguna base ni apaga nada.
  const antes = huellas(r.en(DATOS));
  let x = recuperar('probar-copia', ['2', '', CLAVE_DE_PRUEBA]);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /Copia comprobada: .* todo bien\. No se escribió ninguna base\./);
  assert.match(x.salida, /✔ Tu copia y tu clave sirven\. No se cambió nada\./);
  assert.ok(!x.salida.includes(CLAVE_DE_PRUEBA), 'la clave nunca sale en la pantalla');
  assert.ok(!r.llamadas().some(l => /^systemctl (stop|start|restart)/.test(l)));
  const trasProbar = huellas(r.en(DATOS));
  for (const [nombre, h] of Object.entries(antes)) assert.equal(trasProbar[nombre], h);
  assert.ok(!Object.keys(trasProbar).some(n => n.endsWith('recuperada.db')));

  // Una clave equivocada: lo dice y prueba otra vez (hasta 3), sin cambiar nada; a la tercera se detiene.
  const otraClave = CLAVE_DE_PRUEBA.replace(/[A-Z2-9]/, c => (c === 'A' ? 'B' : 'A'));
  x = recuperar('recuperar', ['2', '', otraClave, otraClave, otraClave]);
  assert.equal(x.codigo, 1, x.salida);
  assert.match(x.salida, /No cambié nada/);
  assert.ok(!r.llamadas().some(l => /^systemctl (stop|start|restart)/.test(l)), 'con la clave mala no se apaga nada');

  // recuperar de verdad: servidor vacío → sigue sin preguntar más.
  x = recuperar('recuperar', ['2', '', CLAVE_DE_PRUEBA]);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /Este servidor está vacío\. Sigo\./);
  assert.match(x.salida, /Lo que pegues ahora NO se verá en la pantalla/);
  assert.match(x.salida, /✔ Tus datos volvieron\. Abre https:\/\/jarvis\.cola-falsa\.ts\.net OPORTIA y entra con tu usuario y contraseña de siempre\./);
  assert.match(x.salida, /\/revoke[\s\S]*clave de recuperación nueva/);
  assert.ok(!x.salida.includes(CLAVE_DE_PRUEBA));
  const apartado = readdirSync(r.en(DATOS)).find(n => n.startsWith('apartado-'));
  assert.ok(existsSync(r.en(DATOS, apartado, 'oportia.db')), 'la base vacía que había quedó apartada');
  assert.ok(readdirSync(r.en(EST)).some(n => n.startsWith('llegados.')), 'los archivos que llegaron se quedan donde llegaron');
  await arrancaYEntra(r.en(DATOS));

  // Ahora el servidor YA tiene datos: sin la palabra APARTAR no hace nada.
  const conDatos = huellas(r.en(DATOS));
  x = recuperar('recuperar', ['no', '2', '', CLAVE_DE_PRUEBA]);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, new RegExp(`⚠ Este servidor YA tiene datos \\(${o.usuarios} usuarios, ${o.proyectos} proyectos\\)`));
  assert.match(x.salida, /No cambié nada\.\n$/);
  const igual = huellas(r.en(DATOS));
  for (const [nombre, h] of Object.entries(conDatos)) if (!nombre.startsWith('oportia.db-')) assert.equal(igual[nombre], h, nombre);
  // Con APARTAR, y como simulacro: no pide revocar el token y deja el modo seguro.
  x = recuperar('recuperar', ['APARTAR', '2', '', CLAVE_DE_PRUEBA], ['--simulacro']);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /ESTO ES UN ENSAYO: no pegues el token aquí ni hagas \/revoke/);
  assert.equal(readdirSync(r.en(DATOS)).filter(n => n.startsWith('apartado-')).length, 2, 'cada vez aparta en una carpeta nueva');
  const db = conectarBase(config);
  try {
    assert.equal(JSON.parse(db.prepare("SELECT valor FROM ajustes WHERE clave = 'tareas.modo_seguro'").get()?.valor ?? 'null')?.activo ?? true, true, 'el servidor de ensayo queda en modo seguro');
  } finally {
    db.close();
  }
  // Con una actualización corriendo no empieza.
  const { spawn: encender } = await import('node:child_process');
  r.duenos();
  const dueno = encender('flock', [r.en('run/oportia-actualizar.lock'), 'sleep', '20'], { stdio: 'ignore' });
  try {
    await esperarHasta(() => spawnSync('flock', ['-n', r.en('run/oportia-actualizar.lock'), 'true'], { stdio: 'ignore' }).status !== 0, { que: 'el candado tomado' });
    x = recuperar('recuperar', ['APARTAR', '2', '', CLAVE_DE_PRUEBA]);
    assert.equal(x.codigo, 1);
    assert.match(x.salida, /Hay una actualización corriendo ahora mismo/);
  } finally {
    dueno.kill('SIGKILL');
  }
});

test('1f instalar 5b: «sudo oportia tailscale»: pide la clave oculta, dice cuántos caracteres recibió, nunca la muestra y la borra; mal formada no hace nada', { skip: saltar }, () => {
  const r = crearRaiz();
  r.ponerApp({ version: '0.6.0' });
  r.ponerActualizador('aaaaaaa');
  const terminal = join(r.base, 'terminal');
  const orden = lineas => {
    writeFileSync(terminal, `${lineas.join('\n')}\n`);
    return r.correr(r.en('usr/local/sbin/oportia'), ['tailscale'], { entorno: { OPORTIA_TERMINAL: terminal } });
  };
  let x = orden(['una cosa que no es una clave']);
  assert.equal(x.codigo, 1, x.salida);
  assert.match(x.salida, /Lo que pegues ahora NO se verá en la pantalla/);
  assert.match(x.salida, /Recibí 22 caracteres\./);
  assert.match(x.salida, /no parece una clave de Tailscale/);
  assert.ok(!r.llamadas().some(l => l.startsWith('tailscale up')));
  const clave = ['tskey', 'auth', `k${'Q7w8'.repeat(6)}`, 'CNTRL'].join('-');
  x = orden([` ${clave} `]);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, new RegExp(`Recibí ${clave.length} caracteres\\.`));
  assert.match(x.salida, /✔ El servidor entró a tu red privada\./);
  assert.match(x.salida, /El enlace público todavía no se pudo encender/, 'Funnel no permitido: queda https solo para la red privada');
  assert.match(x.salida, /Tu enlace: https:\/\/jarvis\.cola-falsa\.ts\.net/);
  assert.ok(existsSync(r.en(EST, 'enlace-pendiente')) && existsSync(r.g('serve')));
  assert.ok(!x.salida.includes(clave) && !r.llamadas().join('\n').includes(clave));
  assert.equal(spawnSync('grep', ['-rl', clave, r.raiz, r.guion], { encoding: 'utf8' }).stdout, '', 'la clave no queda en ningún archivo');
  assert.ok(!r.llamadas().some(l => l.includes('funnel reset')));
  // Ya unido y con el enlace pendiente: cuando la red privada lo permite, lo enciende; y la corrida del actualizador también lo intenta.
  r.guionar('funnel-permitido');
  x = orden([]);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /✔ Enlace público \(https\): encendido/);
  assert.ok(!existsSync(r.en(EST, 'enlace-pendiente')) && existsSync(r.en(EST, 'enlace-encendido')));
  x = orden([]);
  assert.match(x.salida, /ya está en tu red privada\. No cambié nada/);
});

// Un servidor «como el de hoy»: la app de verdad, su base al día, el actualizador de ANTES (cron) y nada del nuevo.
function servidorDeHoy() {
  const r = crearRaiz();
  r.ponerCodigoReal();
  const config = { archivoBase: r.en(DATOS, 'oportia.db'), carpetaCopias: r.en(DATOS, 'oportia-copias'), carpetaDatos: r.en(DATOS) };
  const db = abrirBase(config);
  db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run('prueba.1f', '"dato de hoy"', new Date().toISOString());
  db.close();
  writeFileSync(r.en('etc/cron.d/jarvis-actualizar'), '*/30 * * * * root /usr/local/bin/jarvis-actualizar\n');
  writeFileSync(r.en('etc/cron.d/jarvis-enlace'), '*/10 * * * * root /usr/local/bin/jarvis-enlace\n');
  writeFileSync(r.en('usr/local/bin/jarvis-actualizar'), '#!/bin/bash\n# el actualizador de antes\n');
  writeFileSync(r.en(DATOS, 'version.txt'), `${sha('1')}\n`);
  writeFileSync(r.en(DATOS, 'update.log'), '2026-11-01T10:00:00+00:00 actualizado a 1111111\n');
  r.guionar('usuario.jarvis');
  r.guionar('ts-estado', 'Running');
  r.guionar('github/sha', sha('1'));
  r.salud(['200 0.6.0']);
  r.instalador = r.ponerInstalador('abc1234');
  r.servidor = (palabra, opciones) => r.correr(join(r.instalador, 'oportia-servidor.sh'), [palabra], opciones);
  r.config = config;
  return r;
}
const sinLoPropio = (h, r) => Object.fromEntries(Object.entries(h).filter(([n]) => !n.startsWith('root/') && !n.includes('oportia.db-')));

test('1f instalar 3: revisar no cambia nada; pasar copia primero, cambia solo el programador y nunca reinicia; volver deja todo como estaba', { skip: saltar }, () => {
  const r = servidorDeHoy();
  const antes = sinLoPropio(huellas(r.raiz), r);
  let x = r.servidor('revisar');
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /✔ Listo para pasar al actualizador nuevo\n$/);
  assert.match(x.salida, /Ajustes \(\.env\), solo nombres:\s+PORT HOST DB_PATH/);
  assert.doesNotMatch(x.salida, /jarvis\.db\b.*=|127\.0\.0\.1\n/, 'del .env solo los nombres');
  assert.deepEqual(sinLoPropio(huellas(r.raiz), r), antes, 'revisar no cambió nada');
  assert.ok(!r.llamadas().some(l => /^systemctl (enable|disable|restart|stop|start|daemon-reload)|^ufw (?!status$)|^apt-get|^useradd|^tailscale (up|funnel --bg|serve --bg)/.test(l)), r.llamadas().join('\n'));

  x = r.servidor('pasar');
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /✔ Hecho\. Mira en OPORTIA → Administrador → Servidor/);
  assert.match(x.salida, /Para volver atrás: sudo oportia volver/);
  const llamadas = r.llamadas();
  assert.ok(!llamadas.some(l => /^systemctl (restart|stop|start) jarvis/.test(l)), 'pasar NUNCA reinicia el servicio');
  assert.ok(!llamadas.some(l => /^ufw (?!status$)/.test(l)), 'ni toca el cortafuegos');
  assert.ok(!llamadas.some(l => /^apt-get|^useradd|^tailscale (up|funnel --bg|serve --bg)/.test(l)));
  assert.ok(llamadas.includes('systemctl enable --now oportia-actualizar.timer'));
  assert.ok(!existsSync(r.en('etc/cron.d/jarvis-actualizar')), 'el cron de antes se movió');
  const respaldo = readdirSync(r.en(EST, 'respaldo'))[0];
  assert.equal(r.leer(EST, 'respaldo', respaldo, 'jarvis-actualizar.cron'), '*/30 * * * * root /usr/local/bin/jarvis-actualizar\n');
  for (const n of ['opt-jarvis.tgz', 'jarvis.service', 'jarvis-actualizar', 'cron.d/jarvis-actualizar', 'cron.d/jarvis-enlace']) assert.ok(existsSync(r.en(EST, 'respaldo', respaldo, n)), n);
  assert.equal(r.leer('usr/local/bin/jarvis-actualizar'), '#!/bin/bash\n# el actualizador de antes\n', 'el programa de antes sigue intacto');
  assert.equal(r.leer('etc/cron.d/jarvis-enlace'), '*/10 * * * * root /usr/local/bin/jarvis-enlace\n');
  // La copia de los DATOS antes del cambio: un archivo nuevo que abre como base de OPORTIA.
  const copia = readdirSync(r.en(DATOS, 'oportia-copias')).find(n => /^oportia-antes-de-1f-.*\.db$/.test(n));
  assert.ok(copia);
  const c = new DatabaseSync(r.en(DATOS, 'oportia-copias', copia), { readOnly: true });
  assert.equal(c.prepare('PRAGMA application_id').get().application_id, ID_APLICACION);
  assert.equal(c.prepare("SELECT valor FROM ajustes WHERE clave = 'prueba.1f'").get().valor, '"dato de hoy"');
  c.close();
  // El actualizador nuevo quedó puesto y ya dejó su estado (solo miró): la app lo lee.
  assert.equal(r.estado().resultado, 'al_dia');
  assert.equal(leerEstadoDelActualizador(r.config)?.resultado, 'al_dia');
  assert.ok(existsSync(r.en('usr/local/lib/oportia/actual/oportia-actualizar.sh')) && existsSync(r.en('usr/local/sbin/oportia')));
  // Los datos y el código no cambiaron.
  const despues = sinLoPropio(huellas(r.raiz), r);
  for (const [nombre, h] of Object.entries(antes)) if (nombre !== 'etc/cron.d/jarvis-actualizar') assert.equal(despues[nombre], h, `${nombre} cambió`);
  // Pasar otra vez: no hay nada que pasar.
  x = r.correr(r.en('usr/local/sbin/oportia'), ['pasar']);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /ya usa el actualizador nuevo/);
  // La orden corta reparte bien y sin palabra muestra la lista.
  x = r.correr(r.en('usr/local/sbin/oportia'), []);
  assert.match(x.salida, /sudo oportia recuperar/);
  assert.equal(r.correr(r.en('usr/local/sbin/oportia'), ['inventada']).codigo, 2);
  x = r.correr(r.en('usr/local/sbin/oportia'), ['estado']);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /Actualizador:\s+el nuevo/);

  // Volver: el cron vuelve byte por byte, el temporizador se apaga y el estado publicado queda apartado.
  x = r.correr(r.en('usr/local/sbin/oportia'), ['volver']);
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(r.leer('etc/cron.d/jarvis-actualizar'), '*/30 * * * * root /usr/local/bin/jarvis-actualizar\n');
  assert.ok(r.llamadas().includes('systemctl disable --now oportia-actualizar.timer'));
  assert.ok(!existsSync(r.en(DATOS, 'actualizador.json')));
  assert.ok(readdirSync(r.en(DATOS)).some(n => /^actualizador\.json\.apartada-/.test(n)));
  assert.equal(leerEstadoDelActualizador(r.config), null, 'la tarjeta vuelve a «actualizador de antes»');
  assert.ok(!r.llamadas().some(l => /^systemctl (restart|stop|start) jarvis/.test(l)));
  const final = sinLoPropio(huellas(r.raiz), r);
  for (const [nombre, h] of Object.entries(antes)) assert.equal(final[nombre], h, `${nombre} no volvió igual`);
});

test('1f instalar 3b: con una revisión ✖ pasar no cambia nada; un fallo a mitad (o sin internet) vuelve solo al actualizador de antes', { skip: saltar }, () => {
  // El servicio con KillMode=process: no se pasa.
  let r = servidorDeHoy();
  const unidad = r.en('etc/systemd/system/jarvis.service');
  writeFileSync(unidad, readFileSync(unidad, 'utf8').replace('KillMode=control-group', 'KillMode=process'));
  let antes = sinLoPropio(huellas(r.raiz), r);
  let x = r.servidor('pasar');
  assert.equal(x.codigo, 1, x.salida);
  assert.match(x.salida, /✖ No lo pasé: El servicio usa KillMode=process/);
  assert.deepEqual(sinLoPropio(huellas(r.raiz), r), antes);
  assert.match(r.servidor('revisar').salida, /✖ No lo pases todavía: El servicio usa KillMode=process/);
  // Poco disco, o el servicio como root: tampoco.
  r = servidorDeHoy();
  r.guionar('df', '900');
  assert.match(r.servidor('pasar').salida, /menos de 1 GB libre/);
  r = servidorDeHoy();
  writeFileSync(r.en('etc/systemd/system/jarvis.service'), readFileSync(r.en('etc/systemd/system/jarvis.service'), 'utf8').replace('User=jarvis\n', ''));
  assert.match(r.servidor('pasar').salida, /corre como root/);
  assert.ok(existsSync(r.en('etc/cron.d/jarvis-actualizar')));

  // No se pudo encender el temporizador nuevo (fallo a mitad) → vuelve solo.
  for (const preparar of [q => q.guionar('falla.enable'), q => { q.guionar('github/sha', 'sin internet'); }, q => q.salud(['000'])]) {
    r = servidorDeHoy();
    preparar(r);
    antes = sinLoPropio(huellas(r.raiz), r);
    x = r.servidor('pasar');
    assert.equal(x.codigo, 1, x.salida);
    assert.match(x.salida, /No se pasó\. Todo quedó como estaba/);
    assert.equal(r.leer('etc/cron.d/jarvis-actualizar'), '*/30 * * * * root /usr/local/bin/jarvis-actualizar\n', 'el cron de antes está en su sitio');
    assert.ok(!existsSync(r.g('habilitada.oportia-actualizar.timer')), 'el temporizador nuevo no quedó encendido');
    assert.equal(leerEstadoDelActualizador(r.config), null);
    const despues = sinLoPropio(huellas(r.raiz), r);
    for (const [nombre, h] of Object.entries(antes)) assert.equal(despues[nombre], h, `${nombre} cambió`);
    assert.ok(!r.llamadas().some(l => /^systemctl (restart|stop|start) jarvis/.test(l)));
  }
  // «volver» en un servidor que nació con el actualizador nuevo: no hay a qué volver, no cambia nada.
  r = servidorDeHoy();
  rmSync(r.en('etc/cron.d/jarvis-actualizar'));
  r.guionar('habilitada.oportia-actualizar.timer');
  x = r.servidor('volver');
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /nació con el actualizador nuevo/);
  assert.ok(existsSync(r.g('habilitada.oportia-actualizar.timer')));
});

test('1f instalar 3c: «servicio» cambia el archivo del servicio con copia; si no arranca devuelve el de antes; «volver» también lo devuelve', { skip: saltar }, () => {
  const r = servidorDeHoy();
  const unidad = r.en('etc/systemd/system/jarvis.service');
  const vieja = readFileSync(unidad, 'utf8').replace('KillMode=control-group', 'KillMode=process').replace(/^IPAddressDeny=.*\n/m, '');
  writeFileSync(unidad, vieja);
  const terminal = join(r.base, 'terminal');
  // Sin el «SI»: no cambia nada.
  writeFileSync(terminal, 'no\n');
  let x = r.servidor('servicio', { entorno: { OPORTIA_TERMINAL: terminal } });
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /- KillMode=process[\s\S]*\+ KillMode=control-group/);
  assert.equal(readFileSync(unidad, 'utf8'), vieja);
  // Con «SI» pero no arranca: vuelve el de antes.
  writeFileSync(terminal, 'SI\n');
  r.salud(['503']);
  x = r.servidor('servicio', { entorno: { OPORTIA_TERMINAL: terminal } });
  assert.equal(x.codigo, 1, x.salida);
  assert.equal(readFileSync(unidad, 'utf8'), vieja, 'quedó el archivo de antes');
  // Con «SI» y sana: queda el nuevo, con copia; «volver» devuelve el de antes.
  writeFileSync(terminal, 'SI\n');
  r.salud(['200 0.6.0']);
  x = r.servidor('servicio', { entorno: { OPORTIA_TERMINAL: terminal } });
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(readFileSync(unidad, 'utf8'), readFileSync(join(DEPLOY, 'jarvis.service'), 'utf8'));
  assert.ok(r.llamadas().includes('systemctl daemon-reload'));
  x = r.servidor('volver');
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(readFileSync(unidad, 'utf8'), vieja, 'volver devolvió el archivo del servicio que había');
});

// El texto de instalación: baja el repositorio por SHA a una carpeta de root y corre el instalador.
function servidorRecien() {
  const r = crearRaiz();
  // (Node «ya está»: bajar Node de verdad con su huella lo prueba el ensayo, test/ensayo-instalar.mjs)
  writeFileSync(r.en('usr/bin/node'), `#!/bin/bash\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
  r.publicar(sha('c'), { version: '6.0.0' });
  r.salud(['503', '200 6.0.0'], '6.0.0');
  r.guionar('funnel-permitido');
  r.nube = (argumentos = [], opciones = {}) => r.correr('cloud-init.sh', argumentos, opciones);
  return r;
}
const conClave = clave => readFileSync(join(DEPLOY, 'cloud-init.sh'), 'utf8').replace('TS_AUTHKEY="PEGA_AQUI"', `TS_AUTHKEY=${clave}`);

test('1f instalar 4: cloud-init.sh: instala entero por la ENTRADA, limpia la clave de Tailscale, nunca la deja en disco ni en registros, y con la marca «instalado» no hace nada', { skip: saltar }, () => {
  const r = servidorRecien();
  // La clave se arma al correr (nunca hay una con esa forma en el repositorio). El iPhone le cambió las comillas.
  const clave = ['tskey', 'auth', `k${'A1b2'.repeat(6)}`, 'CNTRL'].join('-');
  const texto = join(r.base, 'pegado.sh');
  writeFileSync(texto, conClave(`“ ${clave} ”`.replace(/ /g, '')));
  r.guionar('apt-lee-la-entrada'); // un apt-get que se come la entrada: el programa debe terminar igual
  let x = r.correr(texto, [], { porEntrada: true, tope: 120_000 });
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /✔ Tailscale: el servidor entró a tu red privada/);
  assert.match(x.salida, /✔ Enlace público \(https\): encendido/);
  assert.match(x.salida, /✔ La app: instalada y sana \(versión ccccccc\)/);
  assert.match(x.salida, /Para traer tus datos: sudo oportia recuperar/);
  assert.match(x.salida, /Borra la clave que usaste: Tailscale → Settings → Keys → Revoke/);
  assert.equal(r.g('ts-clave-largo') && readFileSync(r.g('ts-clave-largo'), 'utf8').trim(), String(clave.length), 'a Tailscale le llegó la clave limpia, por un archivo');
  // La clave no aparece en ninguna llamada, ni en la pantalla, ni en ningún archivo que quede.
  assert.ok(!x.salida.includes(clave) && !r.llamadas().join('\n').includes(clave));
  assert.ok(r.llamadas().some(l => /^tailscale up --auth-key=file:\S+\/root\/oportia-clave\.\w{6}\/clave --hostname=jarvis$/.test(l)));
  assert.ok(!readdirSync(r.en('root')).some(n => n.startsWith('oportia-clave')), 'la carpeta de la clave no existe al terminar');
  const todo = spawnSync('grep', ['-rl', clave, r.raiz, r.guion], { encoding: 'utf8' }).stdout;
  assert.equal(todo, '', `la clave quedó escrita en: ${todo}`);
  // Quedó instalado: orden, juego, temporizador, app, y el informe.
  assert.ok(existsSync(r.en('root/oportia-instalador-ccccccc/.completa')));
  assert.ok(existsSync(r.en('usr/local/sbin/oportia')) && existsSync(r.en('usr/local/lib/oportia/v-ccccccc/.completa')));
  assert.equal(JSON.parse(r.leer('opt/jarvis/package.json')).version, '6.0.0');
  assert.match(r.leer(EST, 'instalacion.txt'), /Enlace: https:\/\/jarvis\.cola-falsa\.ts\.net/);
  assert.ok(existsSync(r.en(EST, 'instalado')));
  const llamadas = r.llamadas();
  const orden = patron => llamadas.findIndex(l => patron.test(l));
  assert.ok(orden(/^ufw --force enable/) >= 0 && orden(/^ufw --force enable/) < orden(/^setpriv /), 'el cortafuegos va ANTES de instalar la app');
  assert.ok(orden(/^tailscale up/) < orden(/^setpriv /), 'y Tailscale también');
  assert.ok(llamadas.includes('systemctl enable --now oportia-actualizar.timer'));
  // Otra vez sin argumentos (cloud-init corre en cada arranque en algunas nubes): con la marca no hace nada.
  const antes = huellas(r.raiz);
  const n = llamadas.length;
  x = r.nube();
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /ya está instalado en este servidor: no hice nada/);
  assert.equal(r.llamadas().length, n);
  const despues = huellas(r.raiz);
  delete antes['var/log/oportia-instalar.log'];
  delete despues['var/log/oportia-instalar.log'];
  assert.deepEqual(despues, antes);
  // Argumentos que no entiende: se detiene.
  assert.equal(r.nube(['borrar-todo']).codigo, 2);
});

test('1f instalar 4b: cloud-init.sh: una clave mal formada avisa y sigue sin Tailscale; la carpeta de la clave se quita aunque el instalador falle; --solo-actualizador y revisar', { skip: saltar }, () => {
  // Clave cambiada pero mal formada → aviso bien visible, sin «tailscale up», y la instalación sigue.
  let r = servidorRecien();
  let texto = join(r.base, 'pegado.sh');
  writeFileSync(texto, conClave('"mi clave de tailscale"'.replace(/ /g, '_')));
  let x = r.correr(texto, [], { tope: 120_000 });
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /⚠ La clave de Tailscale que pegaste no tiene la forma correcta \(debe empezar con tskey-auth-\)\. El servidor quedó instalado pero SIN Tailscale\. Crea otra clave y corre: sudo oportia tailscale\n$/);
  assert.ok(!r.llamadas().some(l => l.startsWith('tailscale up')));
  assert.match(x.salida, /⚠ Tailscale: pendiente/);
  assert.match(x.salida, /✔ La app: instalada y sana/);
  // Sin clave (PEGA_AQUI): paso pendiente, salida 0.
  r = servidorRecien();
  x = r.nube([], { tope: 120_000 });
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /⚠ Tailscale: pendiente\. Falta unir el servidor a tu red privada: sudo oportia tailscale/);
  assert.doesNotMatch(x.salida, /no tiene la forma correcta/);

  // El instalador falla (no es Ubuntu): la carpeta de la clave igual desaparece.
  r = servidorRecien();
  writeFileSync(r.en('etc/os-release'), 'ID=debian\nVERSION_ID="12"\n');
  const clave = ['tskey', 'auth', `k${'Z9y8'.repeat(6)}`, 'CNTRL'].join('-');
  texto = join(r.base, 'pegado.sh');
  writeFileSync(texto, conClave(`"${clave}"`));
  x = r.correr(texto, [], { tope: 120_000 });
  assert.equal(x.codigo, 1, x.salida);
  assert.match(x.salida, /Este instalador es para Ubuntu 22\.04 o 24\.04/);
  assert.ok(!readdirSync(r.en('root')).some(n => n.startsWith('oportia-clave')));
  assert.equal(spawnSync('grep', ['-rl', clave, r.raiz, r.guion], { encoding: 'utf8' }).stdout, '');
  assert.ok(!existsSync(r.en('opt/jarvis')) && !existsSync(r.en(EST, 'instalado')));

  // La línea de arreglo: con la marca «instalado» y --solo-actualizador vuelve a poner lanzador, orden y juego.
  r = servidorRecien();
  assert.equal(r.nube([], { tope: 120_000 }).codigo, 0);
  writeFileSync(r.en('usr/local/lib/oportia/oportia-lanzador.sh'), '#!/bin/bash\n# un lanzador dañado\n');
  writeFileSync(r.en('usr/local/sbin/oportia'), '#!/bin/bash\n# una orden dañada\n');
  rmSync(r.en('usr/local/lib/oportia/actual'));
  const datos = huellas(r.en('opt'));
  x = r.nube(['--solo-actualizador']);
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(r.leer('usr/local/lib/oportia/oportia-lanzador.sh'), readFileSync(join(DEPLOY, 'oportia-lanzador.sh'), 'utf8'));
  assert.equal(r.leer('usr/local/lib/oportia/oportia-lanzador.sh.anterior'), '#!/bin/bash\n# un lanzador dañado\n', 'lo reemplazado queda como .anterior');
  assert.equal(r.leer('usr/local/sbin/oportia.anterior'), '#!/bin/bash\n# una orden dañada\n');
  assert.equal(r.correr(r.en('usr/local/sbin/oportia'), ['ayuda']).codigo, 0);
  assert.deepEqual(huellas(r.en('opt')), datos, 'la línea de arreglo no toca la app');
  // «revisar» por el mismo texto: baja los programas a la carpeta de root y solo mira.
  const antes = huellas(r.raiz);
  x = r.nube(['revisar']);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /ya usa el actualizador nuevo/);
  const despues = huellas(r.raiz);
  delete antes['var/log/oportia-instalar.log'];
  delete despues['var/log/oportia-instalar.log'];
  assert.deepEqual(despues, antes);
});

test('1f instalar 6: la consola hace la copia «antes de cambio» en un archivo NUEVO que abre como base de OPORTIA, y nunca pisa', async () => {
  const raiz = carpetaTemporal('1f-antes');
  const datos = join(raiz, 'jarvis');
  const config = { archivoBase: join(datos, 'oportia.db'), carpetaCopias: join(datos, 'oportia-copias'), carpetaDatos: datos };
  const db = abrirBase(config);
  db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run('prueba.1f', '"antes"', new Date().toISOString());
  const archivoEnv = join(raiz, '.env');
  writeFileSync(archivoEnv, `PORT=8080\nDB_PATH=${join(datos, 'jarvis.db')}\n`);
  const copiar = () => spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs', '--copias=antes-de-cambio'], {
    cwd: REPO, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR ?? '', OPORTIA_TEST: '1', OPORTIA_ENV_FILE: archivoEnv }, encoding: 'utf8', timeout: 30_000,
  });
  try {
    const antes = huellas(datos);
    const uno = copiar();
    assert.equal(uno.status, 0, uno.stderr);
    assert.match(uno.stdout, /Copia de la base hecha: \S+oportia-antes-de-1f-\S+\.db/);
    await new Promise(listo => setTimeout(listo, 5));
    const dos = copiar();
    assert.equal(dos.status, 0, dos.stderr);
    const copias = readdirSync(config.carpetaCopias).filter(n => /^oportia-antes-de-1f-.*\.db$/.test(n));
    assert.equal(copias.length, 2, 'cada copia es un archivo nuevo: ninguna pisa a otra');
    const c = new DatabaseSync(join(config.carpetaCopias, copias[0]), { readOnly: true });
    assert.equal(c.prepare('PRAGMA application_id').get().application_id, ID_APLICACION);
    assert.equal(c.prepare("SELECT valor FROM ajustes WHERE clave = 'prueba.1f'").get().valor, '"antes"');
    assert.equal(c.prepare('SELECT MAX(id) AS v FROM oportia_migraciones').get().v, 6);
    c.close();
    const despues = huellas(datos);
    // (el archivo de la base puede «ordenarse» por dentro al copiar; lo que importa es que sus datos siguen y nada más cambió)
    for (const [nombre, h] of Object.entries(antes)) if (!nombre.startsWith('oportia.db')) assert.equal(despues[nombre], h, `${nombre} cambió`);
    assert.equal(db.prepare("SELECT valor FROM ajustes WHERE clave = 'prueba.1f'").get().valor, '"antes"');
  } finally {
    db.close();
  }
  // Sin base: no hace nada.
  const vacio = join(carpetaTemporal('1f-antes-vacio'), '.env');
  writeFileSync(vacio, `DB_PATH=${join(carpetaTemporal('1f-antes-vacio2'), 'jarvis', 'jarvis.db')}\n`);
  const sin = spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs', '--copias=antes-de-cambio'], {
    cwd: REPO, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR ?? '', OPORTIA_TEST: '1', OPORTIA_ENV_FILE: vacio }, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(sin.status, 1);
  assert.match(sin.stderr, /No se pudo abrir la base/);
});

// ---------- 7. El vigilante del actualizador nuevo y lo que falta en una base recuperada (paso 2 de la parte 1f) ----------
const estadoDelActualizador = revisado => JSON.stringify({
  contrato: 1, revisado: new Date(revisado).toISOString().replace(/\.\d{3}Z$/, 'Z'), resultado: 'al_dia', version: sha('a'), vista: sha('a'), actualizador: 'abc1234', libre_mb: 5000, ocupa_mb: 120, enlace: 'encendido',
});

test('1f instalar 7: «actualizador parado»: no avisa con el servicio recién encendido ni con el reloj adelantado; avisa a los 45 min; se resuelve al revisar y sin archivo', () => {
  const config = configDePrueba();
  config.carpetaDatos = join(config.raiz, 'datos');
  const db = abrirBase(config);
  const archivo = join(config.carpetaDatos, 'actualizador.json');
  const HORA = 3_600_000;
  const t = Date.parse('2026-11-10T12:00:00Z');
  const abiertos = () => db.prepare("SELECT clave, nivel FROM avisos WHERE resuelto_en IS NULL AND clave = 'actualizador_parado'").all();
  const mirar = (ahora, encendidoMs) => vigilarActualizador(db, leerEstadoDelActualizador(config), { ahora, encendidoMs });
  try {
    // Sin archivo (el actualizador de antes): nada que vigilar.
    assert.equal(mirar(t, 10 * HORA), null);
    assert.deepEqual(abiertos(), []);
    // Fresco: nada.
    writeFileSync(archivo, estadoDelActualizador(t - 20 * 60_000));
    assert.equal(mirar(t, 10 * HORA), null);
    // Viejo (4 h), pero el servicio lleva 10 minutos encendido (un apagón largo: el temporizador ya va a correr): espera.
    writeFileSync(archivo, estadoDelActualizador(t - 4 * HORA));
    assert.equal(mirar(t, 10 * 60_000), 'espera');
    assert.deepEqual(abiertos(), []);
    // Viejo y el servicio lleva más de 45 minutos: avisa (atención, va por Telegram en silencio).
    assert.equal(mirar(t, 46 * 60_000), 'abierto');
    assert.deepEqual(abiertos().map(a => ({ ...a })), [{ clave: 'actualizador_parado', nivel: 'atencion' }]);
    assert.deepEqual(vaPorTelegram({ clave: 'actualizador_parado', nivel: 'atencion' }), { va: true, suena: false });
    // Otra hora igual: sigue siendo UN aviso abierto.
    mirar(t + HORA, 2 * HORA);
    assert.equal(abiertos().length, 1);
    // El actualizador volvió a revisar: se resuelve solo.
    writeFileSync(archivo, estadoDelActualizador(t + HORA));
    assert.equal(mirar(t + HORA + 60_000, 3 * HORA), 'resuelto');
    assert.deepEqual(abiertos(), []);
    // Una fecha «revisado» del futuro (el reloj saltó): no es «parado».
    writeFileSync(archivo, estadoDelActualizador(t + 9 * HORA));
    assert.equal(mirar(t, 10 * HORA), null);
    // Parado otra vez, y después «sudo oportia volver» aparta el archivo: el aviso se resuelve (ningún aviso falso).
    writeFileSync(archivo, estadoDelActualizador(t - 5 * HORA));
    assert.equal(mirar(t, 10 * HORA), 'abierto');
    rmSync(archivo);
    assert.equal(mirar(t, 10 * HORA), 'resuelto');
    assert.deepEqual(abiertos(), []);
    // Un archivo que no es lo esperado (una carpeta, basura): como si no hubiera.
    mkdirSync(archivo);
    assert.equal(mirar(t, 10 * HORA), null);
  } finally {
    db.close();
  }
  // Las líneas «aviso:» del registro: las 3 últimas, como texto, sin caracteres de control y con tope de 200.
  const registro = ['2026-11-10T10:00:00+00:00 actualizado a abc1234', '2026-11-10T10:30:00+00:00 aviso: uno', 'basura aviso: sin fecha', '2026-11-10T11:00:00+00:00 aviso: dos\u0007',
    '2026-11-10T11:30:00+00:00 aviso: tres', `2026-11-10T12:00:00+00:00 aviso: ${'x'.repeat(300)}`, '2026-11-10T12:30:00+00:00 aviso: a medias'].join('\n');
  const dichos = avisosDelActualizador(registro);
  assert.deepEqual(dichos.map(a => a.texto.slice(0, 5)), ['dos', 'tres', 'xxxxx']);
  assert.equal(dichos[2].texto.length, 200);
  assert.equal(dichos[0].fecha, '2026-11-10T11:00:00.000Z');
  assert.deepEqual(lineasDeActualizacion(registro).map(l => l.tipo), ['actualizado'], 'las líneas «aviso:» nunca abren un aviso');
});

test('1f instalar 7b: una base recuperada dice lo que falta (token nuevo, claves de IA, clave de recuperación nueva) y deja de decirlo cuando está hecho', async () => {
  const { pasosAdmin, resumenGuia } = await import('../public/guia.js');
  const { USOS } = await import('../src/claves/usos.js');
  const o = await servidorViejo();
  const carpeta = join(carpetaTemporal('1f-falta'), 'jarvis');
  mkdirSync(carpeta, { recursive: true });
  const archivo = join(carpeta, 'oportia.db');
  const hecho = await restaurarCopia({ clave: CLAVE_DE_PRUEBA, fuente: { tipo: 'archivos', archivos: o.archivos }, destino: archivo });
  assert.equal(hecho.ok, true);
  const config = { archivoBase: archivo, carpetaCopias: join(carpeta, 'oportia-copias'), carpetaDatos: carpeta };
  const db = abrirBase(config);
  try {
    // Una base que NO es recuperada: nada.
    const otra = abrirBase(configDePrueba());
    assert.equal(pendientesTrasRecuperar(otra, { huellaLlave: null, usos: USOS }), null);
    otra.close();
    // (La base de prueba trae una clave de recuperación «pendiente»: se deja como la activa del servidor de antes.)
    db.prepare("UPDATE copias_llaves SET estado = 'activa'").run();
    // Recién recuperada, sin llave en el servidor nuevo: faltan las claves de IA y la clave de recuperación.
    const falta = pendientesTrasRecuperar(db, { huellaLlave: null, usos: USOS });
    assert.equal(falta.claves, true, 'la clave de IA que traía la copia no se puede leer aquí');
    assert.equal(falta.clave, true, 'la clave de recuperación de antes ya no sirve en este servidor');
    assert.equal(typeof falta.token, 'boolean');
    // «Primeros pasos» lo pone primero, con enlaces a pantallas que existen.
    const sistema = { copias: { motivo: null, ultimaFuera: { fecha: '2026-11-09T08:41:00Z' } }, telegram: { chat: { estado: 'activo' } }, recuperada: falta };
    const g = resumenGuia(pasosAdmin({ sistema, ia: null, proyectos: [{ id: 1, versionActiva: 1 }] }));
    assert.deepEqual(g.pasos.slice(0, 3).map(p => p.id), ['recuperada_token', 'recuperada_claves', 'recuperada_clave']);
    assert.deepEqual(g.pasos.slice(0, 3).map(p => p.destino), ['#claves', '#claves', '#copias']);
    assert.equal(g.completa, false);
    assert.equal(g.siguiente.grupo, 'recuperada');
    // Se pega la clave de IA otra vez (se crea la llave nueva de este servidor): ese paso queda hecho.
    assert.equal(estadoAlmacen(db, config).motivo, 'restaurada');
    guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropicFalsa() });
    const huellaLlave = estadoLlave(config).huella;
    const despues = pendientesTrasRecuperar(db, { huellaLlave, usos: USOS });
    assert.equal(despues.claves, false);
    assert.equal(despues.clave, true, 'la clave de recuperación sigue pendiente hasta crear una nueva');
    // Sin la marca de «recuperada» (o cuando ya no falta nada) deja de llegar: la guía vuelve a ser la de siempre.
    db.prepare("UPDATE copias_llaves SET estado = 'anterior' WHERE estado = 'activa'").run();
    assert.equal(pendientesTrasRecuperar(db, { huellaLlave, usos: USOS }), null);
  } finally {
    db.close();
  }
});
