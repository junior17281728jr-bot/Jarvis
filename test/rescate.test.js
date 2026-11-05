// Herramienta de rescate (deploy/oportia-admin.mjs): recupera o crea el administrador desde la Consola.
import { carpetaTemporal, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { leerConfig } from '../src/nucleo/config.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function prepararServidorDePrueba() {
  const raiz = carpetaTemporal();
  mkdirSync(join(raiz, 'jarvis'));
  const archivoEnv = join(raiz, '.env');
  writeFileSync(archivoEnv, `PORT=8080\nHOST=0.0.0.0\nDB_PATH=${join(raiz, 'jarvis', 'jarvis.db')}\n`);
  return { raiz, archivoEnv };
}

function rescatar(archivoEnv, ...argumentos) {
  return spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs', ...argumentos], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH, OPORTIA_TEST: '1', OPORTIA_ENV_FILE: archivoEnv },
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('si no hay administrador, lo crea con una clave temporal que hay que cambiar al entrar', async () => {
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  const salida = rescatar(archivoEnv, 'junior');
  assert.equal(salida.status, 0, salida.stderr);
  const temporal = salida.stdout.match(/Contraseña temporal: (\S+)/)[1];
  assert.match(salida.stdout, /Usuario: junior/);

  const db = abrirBase(leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') }));
  await conServidor(crearServidor({ db }), async base => {
    const r = await fetch(`${base}/api/entrar`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'junior', clave: temporal }) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).usuario.debeCambiarClave, true);
  });
  db.close();
});

test('si el administrador existe, le pone una clave temporal nueva sin borrar nada', () => {
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  assert.equal(rescatar(archivoEnv, 'junior').status, 0);
  const segunda = rescatar(archivoEnv);
  assert.equal(segunda.status, 0, segunda.stderr);
  assert.match(segunda.stdout, /Usuario: junior/);
  const db = abrirBase(leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') }));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 1, 'no se creó ni se borró a nadie');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'acceso_recuperado_consola'").get().n, 1);
  db.close();
});

test('rechaza un nombre no válido', () => {
  const { archivoEnv } = prepararServidorDePrueba();
  const salida = rescatar(archivoEnv, 'nombre con espacios');
  assert.equal(salida.status, 2);
});

test('fuera del modo de prueba se niega a correr como root (para no dañar los permisos de la base)', { skip: process.getuid?.() !== 0 }, () => {
  const { archivoEnv } = prepararServidorDePrueba();
  const salida = spawnSync(process.execPath, ['--no-warnings', 'deploy/oportia-admin.mjs'], {
    cwd: RAIZ, env: { PATH: process.env.PATH, OPORTIA_ENV_FILE: archivoEnv }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(salida.status, 2);
  assert.match(salida.stderr, /No lo ejecutes como root/);
});

test('--modo-seguro=si pone en pausa el trabajo automático (con auditoría «consola»); --modo-seguro=no lo quita', async () => {
  const { leerModoSeguro } = await import('../src/tareas/modo-seguro.js');
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  const abrir = () => abrirBase(leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') }));
  let salida = rescatar(archivoEnv, '--modo-seguro=si');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /modo seguro ACTIVADO/);
  let db = abrir();
  let m = leerModoSeguro(db);
  assert.equal(m.activo, true);
  assert.equal(m.origen, 'consola');
  assert.equal(m.motivo, 'consola');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'modo_seguro_activado' AND detalle LIKE 'consola%'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'modo_seguro' AND resuelto_en IS NULL").get().n, 1);
  db.close();

  salida = rescatar(archivoEnv, '--modo-seguro=si');
  assert.equal(salida.status, 0);
  assert.match(salida.stdout, /ya estaba activado/);

  salida = rescatar(archivoEnv, '--modo-seguro=no');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /modo seguro QUITADO/);
  db = abrir();
  m = leerModoSeguro(db);
  assert.equal(m.activo, false);
  assert.equal(m.ultimo.por, 'consola');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'modo_seguro_quitado' AND detalle LIKE 'consola%'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'modo_seguro' AND resuelto_en IS NULL").get().n, 0, 'el aviso queda resuelto (no se borra)');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'modo_seguro'").get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n, 0, 'no toca las cuentas');
  db.close();
});

test('--modo-seguro con el servicio encendido no «ordena» la base al abrirla (así no frena lo que las pantallas guardan)', async () => {
  const { statSync } = await import('node:fs');
  const { leerModoSeguro } = await import('../src/tareas/modo-seguro.js');
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  // El «servicio»: la base abierta, con cambios recientes que todavía viven en el archivo -wal.
  const config = leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') });
  const db = abrirBase(config);
  try {
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('prueba.relleno', ?, 'x')").run('x'.repeat(400_000));
    const wal = `${config.archivoBase}-wal`;
    const antes = statSync(wal).size;
    assert.ok(antes > 400_000);
    const salida = rescatar(archivoEnv, '--modo-seguro=si');
    assert.equal(salida.status, 0, salida.stderr);
    assert.equal(leerModoSeguro(db).activo, true);
    // Con abrirBase, el archivo -wal habría quedado casi vacío (wal_checkpoint TRUNCATE, que espera a las
    // lecturas en marcha y mientras tanto no deja escribir a nadie).
    assert.ok(statSync(wal).size >= antes, 'la herramienta no ordenó la base');
  } finally {
    db.close();
  }
});

test('una opción que no existe se rechaza sin tocar la base', () => {
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  for (const opcion of ['--modo-seguro', '--modo-seguro=tal-vez', '--borrar']) {
    const salida = rescatar(archivoEnv, opcion);
    assert.equal(salida.status, 2, opcion);
    assert.match(salida.stderr, /Opción no válida/);
  }
  assert.equal(existsSync(join(raiz, 'jarvis', 'oportia.db')), false, 'ni siquiera abrió la base');
});

// ---------- Fase 1, parte d: la IA y las claves desde la consola ----------

// Una base como la del servidor, con el administrador (y su cuenta de Tailscale), una clave probada y la IA encendida.
async function baseConIa(raiz) {
  const { crearPrimerAdmin } = await import('../src/cuentas/usuarios.js');
  const { guardarSecreto, anotarPrueba } = await import('../src/claves/almacen.js');
  const { guardarConfigIa } = await import('../src/ia/config.js');
  const { claveAnthropic } = await import('./ia-base.js');
  const config = leerConfig({ DB_PATH: join(raiz, 'jarvis', 'jarvis.db') });
  const db = abrirBase(config);
  const admin = crearPrimerAdmin(db, { nombre: 'junior', claveHash: 'x', tailscaleLogin: 'junior@example.com' });
  const { secreto } = guardarSecreto(db, config, { uso: 'ia_anthropic', valor: claveAnthropic(), usuarioId: admin });
  anotarPrueba(db, { id: secreto.id, motivo: 'ok' });
  guardarConfigIa(db, { topeGeneralMicro: 2_000_000 }, { config, usuarioId: admin });
  guardarConfigIa(db, { encendida: true, ayudaProyectos: true }, { config, usuarioId: admin });
  db.close();
  return { config, admin };
}

test('--ia=no apaga la IA desde la consola (auditoría «consola»), no toca la ayuda ni los topes, y lo próximo ya no aparta nada', async () => {
  const { leerConfigIa } = await import('../src/ia/config.js');
  const { reservar } = await import('../src/ia/presupuesto.js');
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  const { config } = await baseConIa(raiz);
  let salida = rescatar(archivoEnv, '--ia=no');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /la IA quedó APAGADA desde la consola/);
  assert.match(salida.stdout, /Estado ahora: IA apagada\./);
  const db = abrirBase(config);
  try {
    const cfg = leerConfigIa(db);
    assert.deepEqual([cfg.encendida, cfg.ayudaProyectos, cfg.topeGeneralMicro, cfg.origen], [false, true, 2_000_000, 'consola']);
    const a = db.prepare("SELECT detalle FROM auditoria WHERE accion = 'ia_config' ORDER BY id DESC").get();
    assert.deepEqual(JSON.parse(a.detalle), { antes: { encendida: true }, despues: { encendida: false }, origen: 'consola' });
    const espacio = db.prepare('SELECT espacio_id FROM miembros LIMIT 1').get().espacio_id;
    assert.deepEqual(reservar(db, { config, proposito: 'interpretar', espacioId: espacio, entradaMax: 6900 }), { ok: false, motivo: 'ia_apagada', ambito: 'general' });
  } finally {
    db.close();
  }
  salida = rescatar(archivoEnv, '--ia=no');
  assert.equal(salida.status, 0);
  assert.match(salida.stdout, /ya estaba apagada: no cambió nada/);
  // No existe una opción para encenderla desde la consola.
  salida = rescatar(archivoEnv, '--ia=si');
  assert.equal(salida.status, 2);
  assert.match(salida.stderr, /Opción no válida/);
});

test('--claves=revisar explica el archivo que protege las claves sin cambiar nada y sin mostrarlo', async () => {
  const { readFileSync, statSync } = await import('node:fs');
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  // Antes de la primera clave: no existe todavía (y revisar no lo crea).
  let salida = rescatar(archivoEnv, '--claves=revisar');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /No existe todavía/);
  const ruta = join(raiz, 'jarvis', 'oportia-llave-secretos');
  assert.equal(existsSync(ruta), false);
  await baseConIa(raiz);
  const antes = readFileSync(ruta);
  const fecha = statSync(ruta).mtimeMs;
  salida = rescatar(archivoEnv, '--claves=revisar');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /Permisos: 600/);
  assert.match(salida.stdout, /Está bien/);
  assert.match(salida.stdout, /Claves guardadas: 1; con esta llave: 1\./);
  assert.match(salida.stdout, /Nunca copies fuera del servidor/);
  const llave = antes.toString('latin1').split(':')[1].trim();
  assert.ok(!salida.stdout.includes(llave) && !salida.stderr.includes(llave), 'nunca muestra la llave');
  assert.ok(readFileSync(ruta).equals(antes) && statSync(ruta).mtimeMs === fecha, 'no cambió nada');
});

test('--claves=apartar-llave-danada solo aparta un archivo DAÑADO, con otro nombre (nunca lo borra), y deja la auditoría', async () => {
  const { readFileSync, writeFileSync, readdirSync } = await import('node:fs');
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  const { config } = await baseConIa(raiz);
  const ruta = join(raiz, 'jarvis', 'oportia-llave-secretos');
  const buena = readFileSync(ruta);
  let salida = rescatar(archivoEnv, '--claves=apartar-llave-danada');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /No se apartó nada: el archivo que protege las claves está bien/);
  assert.ok(readFileSync(ruta).equals(buena), 'una llave sana nunca se toca');
  // Un archivo dañado (por ejemplo, editado a mano): se aparta con otro nombre, igual byte a byte.
  const otra = join(raiz, 'otra');
  mkdirSync(join(otra, 'jarvis'), { recursive: true });
  const envOtra = join(otra, '.env');
  writeFileSync(envOtra, `DB_PATH=${join(otra, 'jarvis', 'jarvis.db')}\n`);
  abrirBase(leerConfig({ DB_PATH: join(otra, 'jarvis', 'jarvis.db') })).close();
  const danada = join(otra, 'jarvis', 'oportia-llave-secretos');
  writeFileSync(danada, 'esto no es una llave\n', { mode: 0o600 });
  salida = rescatar(envOtra, '--claves=apartar-llave-danada');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /quedó guardado como oportia-llave-secretos\.danada-\d{8}-\d{6} \(no se borró\)/);
  assert.match(salida.stdout, /pega tus claves otra vez/);
  assert.equal(existsSync(danada), false);
  const apartada = readdirSync(join(otra, 'jarvis')).find(n => n.startsWith('oportia-llave-secretos.danada-'));
  assert.equal(readFileSync(join(otra, 'jarvis', apartada), 'utf8'), 'esto no es una llave\n');
  const db = abrirBase(leerConfig({ DB_PATH: join(otra, 'jarvis', 'jarvis.db') }));
  try {
    assert.deepEqual(JSON.parse(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'llave_apartada'").get().detalle), { archivo: apartada, origen: 'consola' });
  } finally {
    db.close();
  }
  void config;
});

test('--tailscale=reanotar olvida la cuenta de Tailscale guardada del administrador (queda en la auditoría); la próxima entrada anota la nueva', async () => {
  const { raiz, archivoEnv } = prepararServidorDePrueba();
  const { config } = await baseConIa(raiz);
  let salida = rescatar(archivoEnv, '--tailscale=reanotar');
  assert.equal(salida.status, 0, salida.stderr);
  assert.match(salida.stdout, /se olvidó la cuenta de Tailscale de «junior»/);
  const db = abrirBase(config);
  try {
    assert.equal(db.prepare("SELECT tailscale_login FROM usuarios WHERE nombre = 'junior'").get().tailscale_login, null);
    assert.deepEqual(JSON.parse(db.prepare("SELECT detalle FROM auditoria WHERE accion = 'tailscale_login_reanotar'").get().detalle), { antes: 'junior@example.com', despues: null, origen: 'consola' });
  } finally {
    db.close();
  }
  salida = rescatar(archivoEnv, '--tailscale=reanotar', 'junior');
  assert.equal(salida.status, 0);
  assert.match(salida.stdout, /no tenía una cuenta de Tailscale guardada/);
  assert.equal(rescatar(archivoEnv, '--tailscale=reanotar', 'nadie').status, 2);
});
