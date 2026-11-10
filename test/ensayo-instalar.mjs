// Ensayo del instalador (fase 1, parte f). NO es parte de la suite (no termina en .test.js): se corre a mano antes de
// publicar, y en GitHub (trabajo «instalador»):   node --no-warnings test/ensayo-instalar.mjs
//
// Corre deploy/install.sh ENTERO en una raíz falsa (test/raiz-falsa.js): los comandos del sistema son falsos, no hay
// red, no toca el servidor y nunca corre como root (si quien lo corre es root, baja a «nobody»). Es una SIMULACIÓN:
// no prueba systemd, ufw, Tailscale ni cloud-init de verdad (eso es el simulacro en un servidor de ensayo).
import './ayuda.js';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaTemporal, huellas } from './ayuda.js';
import { crearRaiz, motivoParaSaltar, sha, DEPLOY } from './raiz-falsa.js';

const motivo = motivoParaSaltar();
if (motivo) {
  console.log(`ENSAYO SALTADO: ${motivo}`);
  process.exit(0);
}

const EST = 'var/lib/oportia-actualizador';
const DATOS = 'var/lib/jarvis';
const V = sha('e');
const hechos = [];
const paso = (nombre, fn) => { fn(); hechos.push(nombre); console.log(`✔ ${nombre}`); };
// Llamadas que solo MIRAN (todas las demás cambian algo).
const SOLO_MIRA = /^(?:dpkg -s |systemctl (?:is-enabled|is-active) |id jarvis$|swapon --show|uname -m$|df -Pm |ufw status$|tailscale status --json$|tailscale funnel status$|ss -ltn$|curl .*(?:api\.github\.com|127\.0\.0\.1))/;

// Un «Node» de mentira empaquetado como el de nodejs.org, y una copia de deploy/ cuyo node.pin trae SU huella.
const VERSION_NODE = '22.99.0';
function prepararNode() {
  const base = carpetaTemporal('ensayo-node');
  const paquetes = join(base, 'paquetes');
  mkdirSync(paquetes);
  const huellasPin = {};
  for (const arq of ['x64', 'arm64']) {
    const nombre = `node-v${VERSION_NODE}-linux-${arq}`;
    mkdirSync(join(base, nombre, 'bin'), { recursive: true });
    writeFileSync(join(base, nombre, 'bin', 'node'), `#!/bin/bash\n# node de mentira (${arq}) para el ensayo: llama al de verdad\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
    execFileSync('tar', ['-cJf', join(paquetes, `${nombre}.tar.xz`), '-C', base, nombre]);
    huellasPin[arq] = execFileSync('sha256sum', [join(paquetes, `${nombre}.tar.xz`)], { encoding: 'utf8' }).split(' ')[0];
  }
  const deploy = join(base, 'deploy');
  cpSync(DEPLOY, deploy, { recursive: true });
  writeFileSync(join(deploy, 'node.pin'), `NODE_VERSION=${VERSION_NODE}\nNODE_SHA256_X64=${huellasPin.x64}\nNODE_SHA256_ARM64=${huellasPin.arm64}\n`);
  return { paquetes, deploy };
}
const node = prepararNode();

// Un Droplet recién creado (raíz falsa vacía), con «GitHub» y «nodejs.org» falsos.
function droplet({ pruebas = 'pasa', conPaquetes = true } = {}) {
  const r = crearRaiz();
  if (conPaquetes) for (const n of readdirSync(node.paquetes)) { mkdirSync(r.g('nodejs'), { recursive: true }); cpSync(join(node.paquetes, n), r.g('nodejs', n)); }
  r.publicar(V, { version: '6.0.0', pruebas, deploy: node.deploy });
  r.salud(['503', '200 6.0.0'], '6.0.0');
  r.guionar('funnel-permitido');
  // En un Droplet nuevo Tailscale no viene instalado: lo pone apt.
  execFileSync('mv', [join(r.falsos, 'tailscale'), join(r.guion, 'tailscale.guardado')]);
  const instalador = r.ponerInstalador(V.slice(0, 7), { deploy: node.deploy });
  const clave = ['tskey', 'auth', `k${'E5n6'.repeat(6)}`, 'CNTRL'].join('-');
  mkdirSync(r.en('root/oportia-clave.prueba'), { recursive: true });
  writeFileSync(r.en('root/oportia-clave.prueba/clave'), clave, { mode: 0o600 });
  r.clave = clave;
  r.instalar = (opciones = [`--sha=${V}`, `--clave-tailscale=${r.en('root/oportia-clave.prueba/clave')}`], extra = {}) => r.correr(join(instalador, 'install.sh'), opciones, { tope: 180_000, ...extra });
  return r;
}
const modo = ruta => (statSync(ruta).mode & 0o777).toString(8);

paso('NUEVA: instalación completa, en orden (protege y da acceso ANTES de la app), con la clave solo por archivo', () => {
  const r = droplet();
  const x = r.instalar();
  assert.equal(x.codigo, 0, x.salida);
  const llamadas = r.llamadas();
  const i = patron => { const n = llamadas.findIndex(l => patron.test(l)); assert.ok(n >= 0, `falta la llamada ${patron}\n${llamadas.join('\n')}`); return n; };
  // El orden: swap → paquetes → Node → usuario → cortafuegos → Tailscale → (actualizador) → la app → temporizador.
  const orden = [i(/^fallocate -l 1024M /), i(/^apt-get .* install -y .*unattended-upgrades ufw$/), i(/^curl .*nodejs\.org\/dist\/v22\.99\.0\/node-v22\.99\.0-linux-x64\.tar\.xz$/), i(/^useradd --system .* jarvis$/), i(/^ufw --force enable$/), i(/^tailscale up /), i(/^tailscale funnel --bg 8080$/), i(/^curl .*codeload\.github\.com/), i(/^setpriv --reuid=nobody/), i(/^systemctl restart jarvis$/), i(/^systemctl enable --now oportia-actualizar\.timer$/)];
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), `el orden no es el esperado:\n${llamadas.join('\n')}`);
  // El cortafuegos: lo justo, y nunca abre el puerto de la app.
  assert.deepEqual(llamadas.filter(l => l.startsWith('ufw ') && l !== 'ufw status'), ['ufw default deny incoming', 'ufw default allow outgoing', 'ufw allow in on tailscale0', 'ufw limit 22/tcp', 'ufw allow 41641/udp', 'ufw --force enable']);
  assert.ok(!llamadas.some(l => /^ufw .*(?:8080|\b80\b|443)/.test(l)));
  // La clave de Tailscale: solo «file:<ruta>»; nunca en las llamadas, la pantalla ni el registro.
  assert.ok(llamadas.includes(`tailscale up --auth-key=file:${r.en('root/oportia-clave.prueba/clave')} --hostname=jarvis`));
  assert.ok(!llamadas.join('\n').includes(r.clave) && !x.salida.includes(r.clave) && !r.leer('var/log/oportia-instalar.log').includes(r.clave));
  assert.ok(!llamadas.some(l => /--ssh|funnel reset|apt-key|sysctl|reboot/.test(l)));
  // Todas las llamadas a apt-get esperan el candado.
  for (const l of llamadas.filter(l => l.startsWith('apt-get'))) assert.match(l, /^apt-get -o DPkg::Lock::Timeout=600 /);
  // Node: bajado, huella comprobada, enlazado.
  assert.match(x.salida, /✔ Node 22\.99\.0: instalado \(huella comprobada\)/);
  assert.ok(existsSync(r.en('opt/node-v22.99.0-linux-x64/bin/node')) && existsSync(r.en('opt/node22/bin/node')) && existsSync(r.en('usr/bin/node')));
  // Dueños y permisos pedidos.
  assert.ok(llamadas.includes(`chown jarvis:jarvis ${r.en(DATOS)}`));
  assert.ok(llamadas.some(l => l.startsWith('chown root:jarvis ') && l.includes('/opt/jarvis/.env')));
  assert.equal(modo(r.en(DATOS)), '750');
  assert.equal(modo(r.en('opt/jarvis/.env')), '640');
  assert.equal(modo(r.en(EST, 'respaldo')), '700');
  assert.equal(modo(r.en('var/log/oportia-instalar.log')), '600');
  assert.equal(modo(r.en('swapfile')), '600');
  assert.equal(r.leer('opt/jarvis/.env'), 'PORT=8080\nHOST=0.0.0.0\n');
  assert.match(r.leer('etc/fstab'), /swapfile none swap sw 0 0\n$/);
  assert.equal(r.leer('etc/systemd/system/jarvis.service'), readFileSync(join(DEPLOY, 'jarvis.service'), 'utf8'));
  assert.match(r.leer('etc/apt/apt.conf.d/20auto-upgrades'), /Unattended-Upgrade "1"/);
  // La app la instaló el actualizador (pruebas como nobody) y quedó sana.
  assert.equal(JSON.parse(r.leer('opt/jarvis/package.json')).version, '6.0.0');
  assert.equal(r.leer(DATOS, 'version.txt'), `${V}\n`);
  assert.equal(r.estado().resultado, 'actualizado');
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')));
  // El informe.
  const informe = r.leer(EST, 'instalacion.txt');
  for (const frase of ['Enlace: https://jarvis.cola-falsa.ts.net', '✔ Cortafuegos: encendido', '✔ Tailscale: el servidor entró a tu red privada', '✔ Enlace público (https): encendido', '✔ La app: instalada y sana', 'Para traer tus datos: sudo oportia recuperar', 'Borra la clave que usaste: Tailscale → Settings → Keys → Revoke']) assert.ok(informe.includes(frase), `el informe no dice «${frase}»:\n${informe}`);
  assert.equal(modo(r.en(EST, 'instalacion.txt')), '644');
  assert.equal(r.problemas(), '');

  // Segunda y tercera corrida: CERO llamadas que cambian y CERO archivos nuevos.
  for (const vuelta of [2, 3]) {
    const antes = huellas(r.raiz);
    const n = r.llamadas().length;
    const y = r.instalar();
    assert.equal(y.codigo, 0, y.salida);
    const nuevas = r.llamadas().slice(n);
    assert.deepEqual(nuevas.filter(l => !SOLO_MIRA.test(l)), [], `corrida ${vuelta}: llamadas que cambian`);
    const despues = huellas(r.raiz);
    for (const propio of ['var/log/oportia-instalar.log', `${EST}/instalacion.txt`, `${EST}/pasos.log`, `${EST}/ultima-corrida.json`, `${EST}/ultima-corrida.id`, `${DATOS}/actualizador.json`, `${EST}/corrida.empezo`, `${EST}/corrida.termino`, `${EST}/corrida.termino.ultima`, `${EST}/fallos`]) { delete antes[propio]; delete despues[propio]; }
    assert.deepEqual(despues, antes, `corrida ${vuelta}: archivos nuevos o cambiados`);
    assert.match(y.salida, /Este servidor YA tiene OPORTIA: solo agrego lo que falte/);
  }
});

paso('La huella de Node no coincide → se detiene antes de abrir el paquete', () => {
  const r = droplet();
  writeFileSync(r.g('nodejs', `node-v${VERSION_NODE}-linux-x64.tar.xz`), 'esto no es el Node esperado');
  const x = r.instalar();
  assert.equal(x.codigo, 1, x.salida);
  assert.match(x.salida, /El Node que bajé NO es el esperado \(su huella no coincide\)\. No lo abrí ni instalé nada de él\./);
  assert.ok(!readdirSync(r.en('opt')).some(n => n.startsWith('node')) && !existsSync(r.en('usr/bin/node')));
  assert.ok(!r.llamadas().some(l => /^useradd|^ufw --force enable|^tailscale up/.test(l)), 'no siguió');
});

paso('arm64: baja el paquete y usa la huella de arm64', () => {
  const r = droplet();
  r.guionar('uname', 'aarch64\n');
  const x = r.instalar();
  assert.equal(x.codigo, 0, x.salida);
  assert.ok(existsSync(r.en('opt/node-v22.99.0-linux-arm64/bin/node')));
  assert.ok(r.llamadas().some(l => l.endsWith('node-v22.99.0-linux-arm64.tar.xz')));
});

paso('NUEVA con la app que no pasa sus pruebas: cortafuegos, Tailscale, temporizador e informe hechos; salida ≠ 0; sin version.bad; una corrida más la instala', () => {
  const r = droplet({ pruebas: 'falla' });
  const x = r.instalar();
  assert.notEqual(x.codigo, 0, x.salida);
  const llamadas = r.llamadas();
  for (const l of ['ufw --force enable', 'systemctl enable --now oportia-actualizar.timer']) assert.ok(llamadas.includes(l), l);
  assert.ok(llamadas.some(l => l.startsWith('tailscale up ')));
  assert.match(x.salida, /✖ La app no quedó instalada \(no pasó sus pruebas\)\. El servidor está protegido y conectado\. Para probar otra vez: sudo oportia actualizar --reintentar/);
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')), 'en la instalación nunca se marca mala');
  assert.ok(existsSync(r.en(EST, 'instalado')) && existsSync(r.en('usr/local/sbin/oportia')));
  assert.ok(!existsSync(r.en('opt/jarvis/src')));
  // La versión se arregla (ahora sus pruebas pasan): la orden de una línea la instala.
  r.publicar(V, { version: '6.0.0', deploy: node.deploy });
  const y = r.correr(r.en('usr/local/sbin/oportia'), ['actualizar', '--reintentar'], { tope: 120_000 });
  assert.equal(y.codigo, 0, y.salida);
  assert.equal(r.estado().resultado, 'actualizado');
  assert.equal(JSON.parse(r.leer('opt/jarvis/package.json')).version, '6.0.0');
});

paso('El cortafuegos se comprueba a sí mismo: sin la regla del 22 (o sin nadie escuchando en el 22) se APAGA y queda pendiente', () => {
  for (const preparar of [q => q.guionar('ufw-pierde-el-22'), q => q.guionar('sin-el-22')]) {
    const r = droplet();
    preparar(r);
    const x = r.instalar();
    assert.equal(x.codigo, 0, x.salida);
    assert.ok(r.llamadas().includes('ufw --force disable'));
    assert.match(x.salida, /⚠ Cortafuegos: pendiente\. Lo encendí pero no vi la regla de la consola, así que lo APAGUÉ para no dejarte fuera/);
    assert.equal(readFileSync(r.g('ufw'), 'utf8').trim(), 'inactive');
    assert.match(x.salida, /✔ La app: instalada y sana/, 'la instalación siguió');
  }
});

paso('Funnel no permitido: https solo para la red privada, marca «enlace-pendiente», y la corrida siguiente del actualizador lo reintenta', () => {
  const r = droplet();
  execFileSync('rm', ['-f', r.g('funnel-permitido')]);
  const x = r.instalar();
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /⚠ Enlace público: pendiente/);
  assert.ok(existsSync(r.en(EST, 'enlace-pendiente')) && existsSync(r.g('serve')));
  assert.equal(r.estado().enlace, 'pendiente');
  r.guionar('funnel-permitido');
  const y = r.correr(r.en('usr/local/lib/oportia/oportia-lanzador.sh'), []);
  assert.equal(y.codigo, 0, y.salida);
  assert.equal(r.estado().enlace, 'encendido');
  assert.ok(!existsSync(r.en(EST, 'enlace-pendiente')) && existsSync(r.en(EST, 'enlace-pendiente.ultima')));
  assert.ok(!r.llamadas().some(l => l.includes('funnel reset')));
});

paso('Sin clave de Tailscale: pasos pendientes con su orden de una línea, y salida 0; el nombre «jarvis-1» se avisa', () => {
  let r = droplet();
  let x = r.instalar([`--sha=${V}`]);
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /⚠ Tailscale: pendiente\. Falta unir el servidor a tu red privada: sudo oportia tailscale/);
  assert.ok(!r.llamadas().some(l => /^tailscale (?:up|funnel --bg|serve --bg)/.test(l)));
  assert.match(x.salida, /✔ La app: instalada y sana/);
  r = droplet();
  r.guionar('ts-nombre', 'jarvis-1.cola-falsa.ts.net.');
  x = r.instalar();
  assert.match(x.salida, /quedó con el nombre «jarvis-1»\. Quita el servidor viejo en Tailscale → Machines/);
  r = droplet();
  r.guionar('falla.ts-up');
  x = r.instalar();
  assert.equal(x.codigo, 0, x.salida);
  assert.match(x.salida, /No pude entrar a Tailscale con esa clave\. Crea otra clave y corre: sudo oportia tailscale/);
  // Opciones que no entiende, o un sistema que no es Ubuntu: se detiene sin cambiar nada.
  r = droplet();
  assert.equal(r.instalar(['--borrar-todo']).codigo, 1);
  writeFileSync(r.en('etc/os-release'), 'ID=ubuntu\nVERSION_ID="20.04"\n');
  x = r.instalar();
  assert.equal(x.codigo, 1);
  assert.deepEqual(r.llamadas().filter(l => !SOLO_MIRA.test(l)), []);
});

paso('EXISTENTE (un servidor lleno, como el de hoy): huellas idénticas de TODO lo que había, ufw sin tocar, temporizador sin encender, una sola propuesta aunque se corra tres veces', () => {
  const r = droplet();
  execFileSync('mv', [join(r.guion, 'tailscale.guardado'), join(r.falsos, 'tailscale')]); // aquí Tailscale ya está y unido
  r.guionar('ts-estado', 'Running');
  r.guionar('usuario.jarvis');
  r.guionar('swap', '/swapfile file 2G 0B -2\n');
  for (const p of ['ca-certificates', 'curl', 'tar', 'xz-utils', 'util-linux', 'coreutils', 'iproute2', 'unattended-upgrades']) r.guionar(`dpkg.${p}`);
  writeFileSync(r.en('usr/bin/node'), `#!/bin/bash\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
  r.ponerApp({ version: '0.5.1', sha: sha('5'), marca: false, env: 'PORT=8080\nHOST=0.0.0.0\nSETUP_TAILNET_ONLY=1\nDB_PATH=/var/lib/jarvis/jarvis.db\n' });
  writeFileSync(r.en('etc/systemd/system/jarvis.service'), '[Unit]\nDescription=la unidad de antes\n[Service]\nUser=jarvis\nExecStart=/usr/bin/node --no-warnings src/server.js\n');
  for (const [nombre, texto] of [['oportia.db', 'la base'], ['oportia.db-wal', 'su registro'], ['jarvis.db', 'la de JARVIS'], ['secrets.env', 'secretos viejos'], ['update.log', 'historia\n'], ['version.bad', `${sha('4')}\n`], ['oportia-copias/oportia-antes-m6.db', 'una copia'], ['oportia-copias/cifradas/2026-11/p001.opc', 'una parte']]) {
    mkdirSync(join(r.en(DATOS), nombre, '..'), { recursive: true });
    writeFileSync(r.en(DATOS, nombre), texto);
  }
  writeFileSync(r.en(DATOS, ['oportia', 'llave', 'secretos'].join('-')), 'la llave de las claves\n', { mode: 0o600 });
  chmodSync(r.en(DATOS), 0o700);
  writeFileSync(r.en('etc/cron.d/jarvis-actualizar'), '*/30 * * * * root /usr/local/bin/jarvis-actualizar\n');
  writeFileSync(r.en('usr/local/bin/jarvis-actualizar'), '#!/bin/bash\n# el de antes\n');
  writeFileSync(r.en('etc/fstab'), '/swapfile none swap sw 0 0\n');
  const antes = huellas(r.raiz);
  const modoDatos = modo(r.en(DATOS));
  for (const vuelta of [1, 2, 3]) {
    const x = r.instalar();
    assert.equal(x.codigo, 0, x.salida);
    assert.match(x.salida, /Este servidor YA tiene OPORTIA/);
    assert.match(x.salida, /Cortafuegos: en un servidor que ya tiene OPORTIA no lo toco/);
    assert.match(x.salida, /este servidor usa el actualizador de antes \(funciona\)\. Para cambiarlo: sudo oportia pasar/);
    assert.match(x.salida, /✔ Tailscale: ya estaba unido a tu red, no lo toqué/);
    assert.match(x.salida, /ya había uno distinto, no lo toqué/);
    assert.match(x.salida, /✔ La app: ya estaba instalada, no la toqué/);
    const despues = huellas(r.raiz);
    for (const [nombre, h] of Object.entries(antes)) assert.equal(despues[nombre], h, `corrida ${vuelta}: cambió ${nombre}`);
  }
  const llamadas = r.llamadas();
  assert.deepEqual(llamadas.filter(l => l.startsWith('ufw ') && l !== 'ufw status'), [], 'ninguna llamada a ufw que cambie');
  assert.ok(!llamadas.some(l => /^apt-get|^useradd|^chown|^tailscale (?:up|funnel --bg|serve --bg)|^fallocate|^mkswap|^systemctl (?:restart|stop|start) |oportia-actualizar\.timer$|^setpriv|codeload/.test(l)), llamadas.filter(l => !SOLO_MIRA.test(l)).join('\n'));
  assert.equal(modo(r.en(DATOS)), modoDatos, 'ni permisos ni dueño de la carpeta de datos');
  assert.deepEqual(readdirSync(r.en(EST, 'propuestos')).filter(n => n.startsWith('jarvis.service.nuevo-')).length, 1, 'un solo archivo propuesto');
  assert.equal(readdirSync(r.en(EST, 'propuestos')).length, 1);
  assert.ok(!existsSync(r.g('habilitada.oportia-actualizar.timer')), 'el temporizador NO se enciende mientras exista el cron de antes');
  assert.ok(existsSync(r.en('usr/local/sbin/oportia')), 'lo nuevo (la orden y el juego) sí quedó puesto, sin uso');
});

paso('--solo-actualizador: solo el juego, el lanzador, la orden y las unidades; nada más', () => {
  const r = droplet();
  r.guionar('usuario.jarvis');
  const x = r.instalar([`--sha=${V}`, '--solo-actualizador']);
  assert.equal(x.codigo, 0, x.salida);
  assert.deepEqual(r.llamadas().filter(l => !SOLO_MIRA.test(l)), [`chown jarvis:jarvis ${r.en(DATOS)}`, 'systemctl daemon-reload']);
  assert.ok(existsSync(r.en('usr/local/lib/oportia/actual/oportia-actualizar.sh')) && existsSync(r.en('usr/local/sbin/oportia')));
  assert.ok(!existsSync(r.en('opt/jarvis')) && !existsSync(r.en('swapfile')));
});

paso('shellcheck de todos los programas (si está instalado)', () => {
  const tiene = spawnSync('shellcheck', ['--version'], { stdio: 'ignore' }).status === 0;
  if (!tiene) { console.log('   (shellcheck no está instalado aquí: solo se revisó con bash -n)'); return; }
  const programas = readdirSync(DEPLOY).filter(n => n.endsWith('.sh')).map(n => join(DEPLOY, n));
  const r = spawnSync('shellcheck', ['-S', 'warning', '-x', ...programas], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});

console.log(`\nENSAYO DEL INSTALADOR (en simulación): ${hechos.length} pasos, todos bien.`);
