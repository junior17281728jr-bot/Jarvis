// Fase 1, parte f: el actualizador que vive en el repositorio (deploy/oportia-actualizar.sh) y su lanzador.
// Todo corre en una RAÍZ FALSA dentro de la carpeta temporal, con los comandos del sistema falsos (test/raiz-falsa.js):
// sin red, sin tocar el servidor y nunca como root. La «versión nueva» que baja es un proyecto diminuto.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { huellas, esperarHasta } from './ayuda.js';
import { crearRaiz, motivoParaSaltar, sha, DEPLOY } from './raiz-falsa.js';
import { lineasDeActualizacion, leerEstadoDelActualizador, entenderEstadoDelActualizador } from '../src/copias/vigilar.js';

const saltar = motivoParaSaltar() ?? false;
const LANZADOR = 'usr/local/lib/oportia/oportia-lanzador.sh';
const DATOS = 'var/lib/jarvis';
const EST = 'var/lib/oportia-actualizador';
const V1 = sha('1');
const V2 = sha('2');
const V3 = sha('3');

// Un servidor con la versión 1.0.0 instalada y sana, y el actualizador puesto.
function servidor({ conApp = true } = {}) {
  const r = crearRaiz();
  r.ponerActualizador('aaaaaaa');
  if (conApp) r.ponerApp({ version: '1.0.0', sha: V1 });
  r.salud(['200 1.0.0'], '1.0.0');
  r.lanzar = (argumentos = ['--persona'], opciones = {}) => r.correr(r.en(LANZADOR), argumentos, opciones);
  r.log = () => r.leer(DATOS, 'update.log') ?? '';
  r.viva = () => JSON.parse(r.leer('opt/jarvis/package.json')).version;
  return r;
}
const corridasSueltas = r => readdirSync(r.en('tmp')).filter(n => n.startsWith('oportia-corrida.'));

test('1f actualizador 1: camino feliz: pruebas como nobody, instala al lado, salud, versión, registro y estado; nada queda en la carpeta temporal', { skip: saltar }, () => {
  const r = servidor();
  writeFileSync(r.en('opt/jarvis/.env'), 'PORT=8123\nHOST=0.0.0.0\nOTRA=valor\n');
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['503', '503', '200 2.0.0'], '2.0.0');
  const x = r.lanzar();
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(r.leer(DATOS, 'version.txt'), `${V2}\n`);
  assert.match(r.log(), /^\S+ actualizado a 2222222\n$/);
  assert.equal(r.viva(), '2.0.0');
  assert.equal(r.problemas(), '', 'el servicio nunca arrancó con el código a medias');
  assert.equal(r.leer('opt/jarvis/.env'), 'PORT=8123\nHOST=0.0.0.0\nOTRA=valor\n', 'el .env viaja tal cual');
  assert.equal(JSON.parse(r.leer('opt/jarvis.anterior/package.json')).version, '1.0.0', 'el código sano de antes queda guardado');
  assert.ok(!existsSync(r.en('opt/jarvis.previa')) && !existsSync(r.en('opt/jarvis.nueva')) && !existsSync(r.en(EST, 'en-curso')));
  // Las pruebas corrieron por setpriv como nobody, con un entorno limpio y su carpeta temporal DENTRO de la corrida.
  const llamadas = r.llamadas();
  assert.ok(llamadas.some(l => /^setpriv --reuid=nobody --regid=nogroup --clear-groups env -i PATH=\S+ HOME=\S+ TMPDIR=\S+ timeout 900 node --no-warnings --test test\/x\.test\.js$/.test(l)), llamadas.join('\n'));
  assert.ok(llamadas.some(l => /^curl .* http:\/\/127\.0\.0\.1:8123\/api\/setup$/.test(l)), 'la salud usa el puerto del .env');
  const rastro = JSON.parse(readFileSync(r.g('pruebas-corridas'), 'utf8').trim().split('\n').pop());
  assert.match(rastro.tmp, /\/tmp\/oportia-corrida\.\w{6}\/p1\/t$/);
  assert.match(rastro.cwd, /\/tmp\/oportia-corrida\.\w{6}\/p1\/src$/);
  assert.ok(llamadas.some(l => /^chown -R nobody:nogroup \S+\/oportia-corrida\.\w{6}\/p1$/.test(l)), 'la carpeta ENTERA de las pruebas es de nobody (las pruebas de la app escriben junto al código)');
  assert.deepEqual(rastro.claves.filter(k => !k.startsWith('NODE_')), ['HOME', 'PATH', 'TMPDIR']);
  assert.deepEqual(corridasSueltas(r), [], 'la carpeta de la corrida (con los temporales de las pruebas) se fue entera');
  // El estado: la copia de root y la publicada para la app son iguales, y la app la entiende.
  const estado = r.estado();
  assert.deepEqual({ contrato: estado.contrato, resultado: estado.resultado, version: estado.version, vista: estado.vista, actualizador: estado.actualizador, enlace: estado.enlace }, { contrato: 1, resultado: 'actualizado', version: V2, vista: V2, actualizador: 'aaaaaaa', enlace: 'no_aplica' });
  assert.equal(r.leer(DATOS, 'actualizador.json'), r.leer(EST, 'ultima-corrida.json'));
  const leido = leerEstadoDelActualizador({ carpetaDatos: r.en(DATOS) });
  assert.equal(leido?.resultado, 'actualizado');
  assert.equal(leido.version, V2);
  // La corrida siguiente no hace nada: ya está al día (y refresca el estado).
  const y = r.lanzar();
  assert.match(y.salida, /Ya tienes la última versión/);
  assert.equal(r.estado().resultado, 'al_dia');
  assert.equal(r.llamadas().filter(l => l.includes('codeload')).length, 1, 'no bajó nada la segunda vez');
});

test('1f actualizador 2: pruebas que fallan dos veces → no se instala (línea exacta, version.bad, registro guardado); una vez → sí; --reintentar; --sha nunca marca', { skip: saltar }, () => {
  const r = servidor();
  const antes = huellas(r.en('opt/jarvis'));
  r.publicar(V2, { version: '2.0.0', pruebas: 'falla' });
  let x = r.lanzar();
  assert.equal(x.codigo, 0, x.salida);
  assert.deepEqual(huellas(r.en('opt/jarvis')), antes, 'el código vivo no cambió');
  assert.match(r.log(), /^\S+ versión 2222222: alguna prueba falló, NO se instaló\n$/);
  assert.equal(r.leer(DATOS, 'version.bad'), `${V2}\n`);
  assert.equal(r.estado().resultado, 'no_instalada');
  assert.equal(readFileSync(r.g('pruebas-corridas'), 'utf8').trim().split('\n').length, 2, 'se repitieron UNA vez antes de marcarla');
  const guardado = r.leer(EST, 'ultima-prueba-fallida.log');
  assert.match(guardado, /corrida 1[\s\S]*corrida 2/);
  assert.match(guardado, /esta versión trae una prueba que falla/);
  assert.ok(!r.llamadas().some(l => l.startsWith('systemctl restart')), 'no reinició nada');
  // La corrida siguiente ni la baja.
  x = r.lanzar();
  assert.equal(r.estado().resultado, 'mala_conocida');
  assert.match(x.salida, /sudo oportia actualizar --reintentar/);
  assert.equal(r.llamadas().filter(l => l.includes('codeload')).length, 1);
  // --reintentar APARTA version.bad y prueba otra vez (ahora la versión falla solo la primera vez: se instala).
  r.publicar(V2, { version: '2.0.0', pruebas: 'falla-una-vez' });
  r.salud(['200 2.0.0'], '2.0.0');
  x = r.lanzar(['--persona', '--reintentar']);
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.ok(readdirSync(r.en(DATOS)).some(n => /^version\.bad\.apartada-\d{8}-\d{6}$/.test(n)), 'la marca de mala quedó apartada, no borrada');
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')));
  assert.equal(r.viva(), '2.0.0');
  // Con --sha (la instalación): pruebas que fallan NO escriben version.bad…
  r.publicar(V3, { version: '3.0.0', pruebas: 'falla', enMain: false });
  x = r.lanzar(['--persona', `--sha=${V3}`]);
  assert.equal(r.estado().resultado, 'no_instalada', x.salida);
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')));
  // …y un version.bad que ya exista no se obedece.
  writeFileSync(r.en(DATOS, 'version.bad'), `${V3}\n`);
  r.publicar(V3, { version: '3.0.0', enMain: false });
  r.salud(['200 3.0.0'], '3.0.0');
  x = r.lanzar(['--persona', `--sha=${V3}`]);
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.equal(r.viva(), '3.0.0');
  assert.equal(r.leer(DATOS, 'version.bad'), `${V3}\n`, 'ni lo escribe ni lo quita');
  for (const l of lineasDeActualizacion(r.log())) assert.ok(['no_instalada', 'actualizado'].includes(l.tipo));
});

test('1f actualizador 3: no arranca → vuelve el código anterior (idéntico), línea exacta y version.bad; si la anterior tampoco, queda intacto el último sano', { skip: saltar }, () => {
  const r = servidor();
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['200 2.0.0'], '2.0.0');
  r.lanzar();
  assert.equal(r.viva(), '2.0.0');
  const sana = huellas(r.en('opt/jarvis'));
  const anterior = huellas(r.en('opt/jarvis.anterior'));
  // La 3 nunca queda sana (503 todo el tiempo); al volver, la 2 contesta bien.
  r.publicar(V3, { version: '3.0.0' });
  r.salud(['503'], '3.0.0');
  let x = r.lanzar();
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(r.estado().resultado, 'revertida');
  assert.deepEqual(huellas(r.en('opt/jarvis')), sana, 'volvió exactamente el código que estaba');
  assert.deepEqual(huellas(r.en('opt/jarvis.anterior')), anterior, 'el último sano de antes no se tocó');
  assert.match(r.log(), /\n\S+ versión 3333333 no arrancó: volví a la anterior\n$/);
  assert.equal(r.leer(DATOS, 'version.bad'), `${V3}\n`);
  assert.equal(r.leer(DATOS, 'version.txt'), `${V2}\n`);
  assert.ok(!existsSync(r.en('opt/jarvis.mala')) && !existsSync(r.en('opt/jarvis.previa')) && !existsSync(r.en(EST, 'en-curso')));
  assert.deepEqual(readFileSync(r.g('arranques'), 'utf8').trim().split('\n').slice(-2), ['3.0.0', '2.0.0'], 'reinició la nueva y después la anterior');
  // Otra versión que no arranca, y esta vez la anterior tampoco contesta bien.
  const V4 = sha('4');
  r.publicar(V4, { version: '4.0.0' });
  r.salud(['503'], '4.0.0');
  r.salud(['503'], '2.0.0');
  x = r.lanzar();
  assert.equal(r.estado().resultado, 'revertida_sin_arrancar', x.salida);
  assert.match(r.log(), /aviso: la versión anterior tampoco arrancó\n$/);
  assert.deepEqual(huellas(r.en('opt/jarvis')), sana);
  assert.deepEqual(huellas(r.en('opt/jarvis.anterior')), anterior, 'opt/jarvis.anterior (el último código sano de antes) sigue intacta');
  const tipos = lineasDeActualizacion(r.log()).map(l => `${l.tipo}:${l.sha}`);
  assert.deepEqual(tipos, ['actualizado:2222222', 'revertida:3333333', 'revertida:4444444'], 'las líneas de aviso no cuentan para la app');
});

// La puerta de 90 s de la app: pasados 90 s de arrancar contesta 200 aunque su trabajador haya fallado. Un 200 solo vale
// si llega dentro de la ventana contada desde la primera respuesta.
for (const [nombre, respuestas, esperado] of [
  ['503 durante TODA la ventana y 200 después → nunca «actualizado»', [...Array(400).fill('503'), '200 2.0.0'], 'revertida'],
  ['503 y luego dos 200 seguidos dentro de la ventana → sana', ['503', '503', '200 2.0.0', '200 2.0.0'], 'actualizado'],
  ['un solo 200 y otra vez 503 → no sana', ['200 2.0.0', '503'], 'revertida'],
  ['contesta 200 pero OTRA versión → no sana', ['200 1.0.0'], 'revertida'],
  ['el puerto nunca abre → no sana', ['000'], 'revertida'],
]) {
  test(`1f actualizador 4: salud: ${nombre}`, { skip: saltar }, () => {
    const r = servidor();
    r.publicar(V2, { version: '2.0.0' });
    r.salud(respuestas, '2.0.0');
    const x = r.lanzar();
    assert.equal(r.estado().resultado, esperado, x.salida);
    assert.equal(r.viva(), esperado === 'actualizado' ? '2.0.0' : '1.0.0');
  });
}

test('1f actualizador 4b: la ventana de salud es una constante de 75 s o menos, igual en los dos programas, y nada espera la salud de otra forma', () => {
  for (const archivo of ['oportia-actualizar.sh', 'oportia-comun.sh']) {
    const texto = readFileSync(join(DEPLOY, archivo), 'utf8');
    const m = [...texto.matchAll(/^SALUD_VENTANA=(\d+)$/gm)];
    assert.equal(m.length, 1, archivo);
    assert.ok(Number(m[0][1]) <= 75 && Number(m[0][1]) >= 30, `${archivo}: SALUD_VENTANA=${m[0][1]}`);
    // Las variables de prueba solo pueden ACORTAR, y solo en modo de prueba.
    assert.match(texto, /"\$OPORTIA_SALUD_VENTANA_MS" -lt "\$ventana_ms"/);
  }
});

test('1f actualizador 5: las líneas REALES de update.log las entiende la app (los 3 tipos, con fecha), y las de aviso se ignoran', { skip: saltar }, () => {
  const r = servidor();
  r.publicar(V2, { version: '2.0.0', pruebas: 'falla' });
  r.lanzar();
  r.publicar(V3, { version: '3.0.0' });
  r.salud(['503'], '3.0.0');
  r.lanzar();
  const V4 = sha('4');
  r.publicar(V4, { version: '4.0.0' });
  r.salud(['200 4.0.0'], '4.0.0');
  r.guionar('df', '100');
  r.lanzar(); // sin disco: una línea de aviso
  r.guionar('df', '50000');
  r.lanzar();
  const texto = r.log();
  assert.match(texto, /aviso: no hay disco para probar la versión 4444444/);
  const lineas = lineasDeActualizacion(texto);
  assert.deepEqual(lineas.map(l => `${l.tipo}:${l.sha}`), ['no_instalada:2222222', 'revertida:3333333', 'actualizado:4444444']);
  for (const l of lineas) assert.ok(Number.isFinite(l.fecha) && Math.abs(l.fecha - Date.now()) < 3_600_000, 'la fecha se entiende');
  assert.equal(texto.endsWith('\n'), true);
  assert.equal(entenderEstadoDelActualizador('{"contrato":2}'), null);
  assert.equal(entenderEstadoDelActualizador(r.leer(DATOS, 'actualizador.json')).resultado, 'actualizado');
});

test('1f actualizador 6: se actualiza a sí mismo solo tras una actualización sana y solo si el juego nuevo pasa su revisión', { skip: saltar }, () => {
  const r = servidor();
  const lib = r.en('usr/local/lib/oportia');
  const conCambio = cambio => p => {
    const archivo = join(p, 'deploy', cambio.archivo ?? 'oportia-actualizar.sh');
    writeFileSync(archivo, cambio.hacer(readFileSync(archivo, 'utf8')));
  };
  // Un juego nuevo bueno (cambia un comentario): pasa a «actual» y el de antes a «anterior».
  mkdirSync(join(lib, 'v-2222222')); // un juego a medias que quedó (sin .completa): se aparta
  writeFileSync(join(lib, 'v-2222222', 'resto.txt'), 'a medias');
  r.publicar(V2, { version: '2.0.0', cambiar: conCambio({ archivo: 'oportia-servidor.sh', hacer: t => `${t}\n# un cambio de la versión 2\n` }) });
  r.salud(['200 2.0.0'], '2.0.0');
  let x = r.lanzar();
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.equal(readlinkSync(join(lib, 'actual')), 'v-2222222');
  assert.equal(readlinkSync(join(lib, 'anterior')), 'v-aaaaaaa');
  assert.ok(existsSync(join(lib, 'v-2222222', '.completa')));
  assert.ok(readdirSync(lib).some(n => /^v-2222222\.apartada-/.test(n) && existsSync(join(lib, n, 'resto.txt'))), 'el juego a medias se apartó, no se borró');
  assert.match(readFileSync(join(lib, 'v-2222222', 'oportia-servidor.sh'), 'utf8'), /un cambio de la versión 2/);
  assert.equal(r.estado().actualizador, '2222222');
  // Juegos malos: un error de escritura, otro contrato, o una autoprueba que falla → la app SÍ se instala, el actualizador se queda.
  const malos = [
    [sha('3'), '3.0.0', { archivo: 'oportia-recuperar.sh', hacer: t => `${t}\nif then fi (\n` }],
    [sha('4'), '4.0.0', { hacer: t => t.replace(/^CONTRATO=1$/m, 'CONTRATO=2') }],
    [sha('5'), '5.0.0', { hacer: t => t.replace('autoprueba() {\n', 'autoprueba() {\n  exit 1\n') }],
  ];
  for (const [v, version, cambio] of malos) {
    r.publicar(v, { version, cambiar: conCambio(cambio) });
    r.salud([`200 ${version}`], version);
    x = r.lanzar();
    assert.equal(r.estado().resultado, 'actualizado', x.salida);
    assert.equal(r.viva(), version);
    assert.equal(readlinkSync(join(lib, 'actual')), 'v-2222222', `el juego de la ${version} no debió entrar`);
    assert.match(r.log(), new RegExp(`aviso: el actualizador de la versión ${v.slice(0, 7)} no pasó su revisión; sigo con el de antes\\n$`));
    assert.ok(!existsSync(join(lib, `v-${v.slice(0, 7)}`, '.completa')));
  }
  assert.equal(r.leer(EST, 'fallos'), '0\n', 'nada de esto cuenta como fallo del actualizador');
});

test('1f actualizador 7: el lanzador: 3 fallos seguidos (sale mal, se cuelga, sale bien sin dejar su estado) → vuelve al juego de antes; corrida sin terminar; candados ocupados', { skip: saltar }, async () => {
  const r = servidor();
  const lib = r.en('usr/local/lib/oportia');
  const malo = r.ponerActualizador('bbbbbbb');
  symlinkSync('v-aaaaaaa', join(lib, 'anterior'));
  rmSync(join(lib, 'actual'));
  symlinkSync('v-bbbbbbb', join(lib, 'actual'));
  const ponerMalo = cuerpo => writeFileSync(join(malo, 'oportia-actualizar.sh'), `#!/bin/bash\n${cuerpo}\n`);
  assert.equal(readlinkSync(join(lib, 'actual')), 'v-bbbbbbb');
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['200 2.0.0'], '2.0.0');

  ponerMalo('exit 1');
  let x = r.lanzar(['--persona']);
  assert.equal(x.codigo, 0, 'el lanzador sale 0 siempre');
  assert.equal(r.leer(EST, 'fallos'), '1\n');
  ponerMalo('sleep 30');
  const t0 = Date.now();
  x = r.lanzar(['--persona'], { entorno: { OPORTIA_TOPE_ACTUALIZADOR: '1' } });
  assert.ok(Date.now() - t0 < 15_000, 'el lanzador corta al actualizador colgado');
  assert.equal(r.leer(EST, 'fallos'), '2\n', 'un actualizador que se cuelga cuenta como fallo');
  ponerMalo('exit 0');
  x = r.lanzar(['--persona']);
  assert.match(x.salida, /El actualizador nuevo falló 3 veces: volví al de antes/);
  assert.equal(readlinkSync(join(lib, 'actual')), 'v-aaaaaaa');
  assert.equal(readlinkSync(join(lib, 'anterior')), 'v-bbbbbbb');
  assert.equal(r.leer(EST, 'fallos'), '0\n');
  assert.match(r.log(), /^\S+ aviso: el actualizador nuevo falló 3 veces; volví al actualizador de antes\n$/);
  assert.equal(r.viva(), '1.0.0', 'ninguno de los malos instaló nada');
  // Con el de antes de vuelta, la corrida siguiente instala.
  x = r.lanzar(['--persona']);
  assert.equal(r.estado().resultado, 'actualizado', x.salida);

  // Una corrida que empezó y nunca terminó (la mataron, se fue la luz) cuenta como fallo.
  writeFileSync(r.en(EST, 'corrida.empezo'), 'vieja\n');
  if (existsSync(r.en(EST, 'corrida.termino'))) renameSync(r.en(EST, 'corrida.termino'), r.en(EST, 'corrida.termino.ultima'));
  writeFileSync(join(lib, 'v-aaaaaaa', 'oportia-actualizar.sh'), '#!/bin/bash\nexit 1\n');
  r.lanzar(['--persona']);
  assert.equal(r.leer(EST, 'fallos'), '2\n', 'la corrida cortada + la que salió mal');

  // Candado ocupado (el nuevo, o el del actualizador de ANTES): sale 0 sin hacer nada; a una persona se lo dice.
  for (const candado of ['oportia-actualizar.lock', 'jarvis-actualizar.lock']) {
    const antes = r.llamadas().length;
    const fallosAntes = r.leer(EST, 'fallos');
    r.duenos();
    const dueno = spawn('flock', [r.en('run', candado), 'sleep', '20'], { stdio: 'ignore' });
    try {
      await esperarHasta(() => spawnSync('flock', ['-n', r.en('run', candado), 'true'], { stdio: 'ignore' }).status !== 0, { que: 'que el candado esté tomado' });
      x = r.lanzar(['--persona']);
      assert.equal(x.codigo, 0);
      assert.match(x.salida, /Ya hay una actualización corriendo; prueba en unos minutos\./);
      assert.equal(r.llamadas().length, antes, 'con el candado ocupado no llamó a nada');
      assert.equal(r.leer(EST, 'fallos'), fallosAntes);
      x = r.lanzar([]);
      assert.equal(x.codigo, 0);
      assert.equal(x.salida, '', 'bajo el temporizador sale callado');
    } finally {
      dueno.kill('SIGKILL');
      await new Promise(listo => dueno.once('exit', listo));
    }
  }
});

test('1f actualizador 8: lo que deja una corrida cortada se repara antes de nada, y solo se limpia lo propio', { skip: saltar }, () => {
  // (a) Marca «en curso», sin la carpeta de la app y con la previa → la devuelve y no marca mala la versión.
  let r = servidor();
  renameSync(r.en('opt/jarvis'), r.en('opt/jarvis.previa'));
  mkdirSync(r.en(EST), { recursive: true });
  writeFileSync(r.en(EST, 'en-curso'), `${V2}\n${V1}\n2.0.0\n`);
  let x = r.lanzar(); // sin red: solo repara
  assert.equal(r.viva(), '1.0.0', x.salida);
  assert.ok(!existsSync(r.en('opt/jarvis.previa')) && !existsSync(r.en(EST, 'en-curso')));
  assert.ok(r.llamadas().includes('systemctl restart jarvis'));
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')), 'el corte no fue culpa de la versión');

  // (b) Marca «en curso» con la nueva puesta y la previa al lado: nunca se supo si quedó sana → reinicia y MIRA.
  r = servidor();
  cpSync(r.en('opt/jarvis'), r.en('opt/jarvis.anterior'), { recursive: true }); // el último sano de antes (con su marca)
  writeFileSync(r.en('opt/jarvis.anterior/package.json'), '{"version":"0.9.0"}\n');
  const anterior = huellas(r.en('opt/jarvis.anterior'));
  renameSync(r.en('opt/jarvis'), r.en('opt/jarvis.previa'));
  r.ponerApp({ version: '2.0.0' });
  writeFileSync(r.en(EST, 'en-curso'), `${V2}\n${V1}\n2.0.0\n`);
  r.salud(['503'], '2.0.0');
  // Además quedó una «mala» de una vuelta atrás cortada: no debe romper la vuelta atrás de ahora.
  cpSync(r.en('opt/jarvis'), r.en('opt/jarvis.mala'), { recursive: true });
  x = r.lanzar();
  assert.equal(r.estado().resultado, 'revertida', x.salida);
  assert.equal(r.viva(), '1.0.0');
  assert.deepEqual(huellas(r.en('opt/jarvis.anterior')), anterior, 'la anterior no se toca en una reparación');
  assert.ok(!existsSync(r.en('opt/jarvis.mala')) && !existsSync(r.en('opt/jarvis.previa')));
  assert.equal(r.leer(DATOS, 'version.bad'), `${V2}\n`);
  // (b2) lo mismo, pero la nueva sí queda sana → se da por instalada.
  r = servidor();
  renameSync(r.en('opt/jarvis'), r.en('opt/jarvis.previa'));
  r.ponerApp({ version: '2.0.0' });
  writeFileSync(r.en(EST, 'en-curso'), `${V2}\n${V1}\n2.0.0\n`);
  r.salud(['200 2.0.0'], '2.0.0');
  x = r.lanzar();
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.equal(r.leer(DATOS, 'version.txt'), `${V2}\n`);
  assert.equal(JSON.parse(r.leer('opt/jarvis.anterior/package.json')).version, '1.0.0');

  // (c) Carpetas de corridas viejas: se quitan las PROPIAS (con su marca); nada más de la carpeta temporal.
  r = servidor();
  mkdirSync(r.en('tmp/oportia-corrida.abc123/t1'), { recursive: true });
  writeFileSync(r.en('tmp/oportia-corrida.abc123/.oportia-corrida'), '');
  writeFileSync(r.en('tmp/oportia-corrida.abc123/t1/basura'), 'x'.repeat(1000));
  mkdirSync(r.en('tmp/oportia-corrida.zzzzzz')); // sin la marca: no es mía
  writeFileSync(r.en('tmp/oportia-corrida.zzzzzz/ajeno'), 'de otro');
  mkdirSync(r.en('tmp/oportia-pruebas-viejas'));
  writeFileSync(r.en('tmp/oportia-pruebas-viejas/testigo'), 'testigo');
  writeFileSync(r.en('tmp/testigo'), 'testigo');
  writeFileSync(join(r.base, 'testigo'), 'testigo');
  mkdirSync(r.en('opt/jarvis.nueva'));
  writeFileSync(r.en('opt/jarvis.nueva/.oportia-codigo'), '');
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['200 2.0.0'], '2.0.0');
  x = r.lanzar();
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.deepEqual(readdirSync(r.en('tmp')).sort(), ['oportia-corrida.zzzzzz', 'oportia-pruebas-viejas', 'testigo']);
  assert.equal(r.leer('tmp/oportia-corrida.zzzzzz/ajeno'), 'de otro');
  assert.equal(r.leer('tmp/oportia-pruebas-viejas/testigo'), 'testigo');
  assert.equal(readFileSync(join(r.base, 'testigo'), 'utf8'), 'testigo');
});
test('1f actualizador 9: el único borrado (borrar_lo_mio) rechaza todo lo que no es suyo; una «anterior» sin marca se aparta con su .env', { skip: saltar }, () => {
  const r = servidor();
  mkdirSync(r.en(DATOS, 'oportia-copias'), { recursive: true });
  writeFileSync(r.en(DATOS, 'oportia.db'), 'datos de verdad');
  // La «anterior» que dejó el actualizador de ANTES: sin marca y con su copia del .env.
  mkdirSync(r.en('opt/jarvis.anterior/src'), { recursive: true });
  writeFileSync(r.en('opt/jarvis.anterior/.env'), 'SECRETO_VIEJO=1\n');
  writeFileSync(r.en('opt/jarvis.anterior/src/server.js'), '// de antes\n');
  mkdirSync(r.en('opt/jarvis.mala'));
  writeFileSync(r.en('opt/jarvis.mala/.oportia-codigo'), '');
  symlinkSync(r.en('opt/jarvis.mala'), r.en('opt/enlace-a-mala'));
  const guion = join(r.base, 'borrar.sh');
  writeFileSync(guion, `#!/bin/bash\nset -euo pipefail\n. "${DEPLOY}/oportia-comun.sh"\nPROPIA="\${PROPIA_DE_PRUEBA:-}"\nborrar_lo_mio "\${1-}"\n`);
  const antes = huellas(r.raiz);
  for (const ruta of ['/', '', r.en('opt/jarvis'), r.en(DATOS), r.en(DATOS, 'oportia.db'), r.en('opt/enlace-a-mala'), r.en('opt/jarvis.anterior'), r.en('opt/jarvis.mala/../jarvis'), r.en('opt'), r.raiz, r.base, `${r.en('tmp')}/oportia-corrida.abc123/../../opt`]) {
    const x = r.correr(guion, [ruta]);
    assert.equal(x.codigo, 1, `debió rechazar «${ruta}»: ${x.salida}`);
    assert.match(x.salida, /no toqu|no lo toqu|no la toqu/);
  }
  assert.deepEqual(huellas(r.raiz), antes, 'nada cambió');
  // Lo que SÍ es suyo: una de las tres carpetas de código con su marca.
  assert.equal(r.correr(guion, [r.en('opt/jarvis.mala')]).codigo, 0);
  assert.ok(!existsSync(r.en('opt/jarvis.mala')));
  assert.ok(lstatSync(r.en('opt/enlace-a-mala')).isSymbolicLink(), 'el enlace no se toca');
  // Dentro de la carpeta propia sí; fuera de ella (con «..») no.
  mkdirSync(join(r.base, 'propia', 'cosa'), { recursive: true });
  assert.equal(r.correr(guion, [`${join(r.base, 'propia')}/../raiz`], { entorno: { PROPIA_DE_PRUEBA: join(r.base, 'propia') } }).codigo, 1);
  assert.equal(r.correr(guion, [join(r.base, 'propia', 'cosa')], { entorno: { PROPIA_DE_PRUEBA: join(r.base, 'propia') } }).codigo, 0);
  assert.ok(existsSync(join(r.base, 'propia')) && !existsSync(join(r.base, 'propia', 'cosa')));
  // Y en una actualización de verdad: la «anterior» sin marca se APARTA (con su .env adentro), no se borra.
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['200 2.0.0'], '2.0.0');
  const x = r.lanzar();
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  const apartada = readdirSync(r.en('opt')).find(n => /^jarvis\.anterior\.apartada-\d{8}-\d{6}$/.test(n));
  assert.ok(apartada, readdirSync(r.en('opt')).join(' '));
  assert.equal(r.leer('opt', apartada, '.env'), 'SECRETO_VIEJO=1\n');
  assert.equal(JSON.parse(r.leer('opt/jarvis.anterior/package.json')).version, '1.0.0');
  assert.equal(r.leer(DATOS, 'oportia.db'), 'datos de verdad');
});

test('1f actualizador 10: sin red, poco disco (no la marca mala, avisa una vez) y --solo-revisar (no baja, no reinicia)', { skip: saltar }, () => {
  const r = servidor();
  const antes = huellas(r.en('opt'));
  let x = r.lanzar();
  assert.equal(r.estado().resultado, 'sin_red', x.salida);
  assert.equal(r.estado().vista, null);
  assert.equal(r.log(), '');
  r.guionar('github/sha', 'esto no es una versión');
  r.lanzar();
  assert.equal(r.estado().resultado, 'sin_red', 'una respuesta rara es como no tener red');
  r.publicar(V2, { version: '2.0.0' });
  r.guionar('df', '699');
  r.lanzar();
  r.lanzar();
  assert.equal(r.estado().resultado, 'sin_disco');
  assert.equal(r.estado().libre_mb, 699);
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')));
  assert.equal(r.log().split('\n').filter(l => l.includes('aviso: no hay disco')).length, 1, 'avisa una vez por versión');
  assert.ok(!r.llamadas().some(l => l.includes('codeload')));
  r.guionar('df', '50000');
  const llamadasAntes = r.llamadas().length;
  x = r.correr(r.en('usr/local/lib/oportia/actual/oportia-actualizar.sh'), ['--corrida', '--solo-revisar', '--id=prueba']);
  assert.equal(x.codigo, 0, x.salida);
  assert.equal(r.estado().resultado, 'hay_nueva');
  assert.equal(r.leer(EST, 'ultima-corrida.id'), 'prueba\n');
  const nuevas = r.llamadas().slice(llamadasAntes);
  assert.ok(!nuevas.some(l => l.startsWith('systemctl') || l.includes('codeload') || l.startsWith('setpriv')), nuevas.join('\n'));
  assert.deepEqual(huellas(r.en('opt')), antes, 'nada de esto tocó el código');
  assert.equal(r.leer(EST, 'fallos'), '0\n', 'sin red y sin disco no son fallos del actualizador');
  // Sin lanzador y sin --corrida no hace nada.
  x = r.correr(r.en('usr/local/lib/oportia/actual/oportia-actualizar.sh'), []);
  assert.equal(x.codigo, 1);
  assert.match(x.salida, /sudo oportia actualizar/);
});

test('1f actualizador 11: root nunca sigue un enlace plantado en la carpeta de datos; una carpeta plantada: aviso y la corrida termina bien', { skip: saltar }, () => {
  const r = servidor();
  const testigo = join(r.base, 'testigo-secreto');
  writeFileSync(testigo, 'NO TOCAR\n');
  rmSync(r.en(DATOS, 'version.txt'));
  for (const nombre of ['update.log', 'version.txt', 'version.bad', 'actualizador.json']) symlinkSync(testigo, r.en(DATOS, nombre));
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['200 2.0.0'], '2.0.0');
  let x = r.lanzar();
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.equal(readFileSync(testigo, 'utf8'), 'NO TOCAR\n');
  assert.ok(lstatSync(r.en(DATOS, 'version.txt')).isFile(), 'el enlace se reemplazó por un archivo de verdad');
  assert.equal(r.leer(DATOS, 'version.txt'), `${V2}\n`);
  assert.ok(lstatSync(r.en(DATOS, 'actualizador.json')).isFile());
  assert.ok(lstatSync(r.en(DATOS, 'update.log')).isSymbolicLink(), 'en update.log no se escribe a través del enlace');
  assert.match(r.leer(EST, 'pasos.log'), /no pude escribir en update\.log: \S+ actualizado a 2222222/);
  // version.bad plantado + una versión que no arranca.
  r.publicar(V3, { version: '3.0.0' });
  r.salud(['503'], '3.0.0');
  x = r.lanzar();
  assert.equal(r.estado().resultado, 'revertida', x.salida);
  assert.equal(readFileSync(testigo, 'utf8'), 'NO TOCAR\n');
  assert.equal(r.leer(DATOS, 'version.bad'), `${V3}\n`);
  assert.ok(lstatSync(r.en(DATOS, 'version.bad')).isFile());
  // Una CARPETA plantada donde va el estado publicado: no se toca, se avisa, y el lanzador no cuenta un fallo.
  const r2 = servidor();
  mkdirSync(r2.en(DATOS, 'actualizador.json'));
  writeFileSync(r2.en(DATOS, 'actualizador.json', 'adentro'), 'x');
  r2.publicar(V2, { version: '2.0.0' });
  r2.salud(['200 2.0.0'], '2.0.0');
  x = r2.lanzar();
  assert.equal(r2.estado().resultado, 'actualizado', x.salida);
  assert.equal(r2.leer(DATOS, 'actualizador.json', 'adentro'), 'x');
  assert.match(r2.log(), /aviso: no pude escribir actualizador\.json: en ese nombre hay algo que no es un archivo/);
  assert.equal(r2.leer(EST, 'fallos'), '0\n');
  assert.equal(leerEstadoDelActualizador({ carpetaDatos: r2.en(DATOS) }), null);
});

test('1f actualizador 12: la primera instalación (carpeta de la app solo con su .env): bien; con pruebas que fallan no marca nada y se reintenta; si no arranca, se apaga', { skip: saltar }, () => {
  const nuevo = () => {
    const r = servidor({ conApp: false });
    mkdirSync(r.en('opt/jarvis'), { recursive: true });
    writeFileSync(r.en('opt/jarvis/.env'), 'PORT=8080\nHOST=0.0.0.0\n');
    return r;
  };
  let r = nuevo();
  r.publicar(V2, { version: '2.0.0', enMain: false });
  r.salud(['503', '200 2.0.0'], '2.0.0');
  let x = r.lanzar(['--persona', `--sha=${V2}`]);
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  assert.equal(r.viva(), '2.0.0');
  assert.equal(r.leer('opt/jarvis/.env'), 'PORT=8080\nHOST=0.0.0.0\n');
  assert.equal(r.leer(DATOS, 'version.txt'), `${V2}\n`);
  assert.ok(existsSync(r.en('opt/jarvis/.oportia-codigo')));
  // Pruebas que fallan en la instalación: nada instalado, sin version.bad; el temporizador lo intenta después.
  r = nuevo();
  r.publicar(V2, { version: '2.0.0', pruebas: 'falla' });
  x = r.lanzar(['--persona', `--sha=${V2}`]);
  assert.equal(r.estado().resultado, 'no_instalada', x.salida);
  assert.ok(!existsSync(r.en('opt/jarvis/src')) && !existsSync(r.en(DATOS, 'version.bad')));
  r.publicar(V2, { version: '2.0.0' });
  r.salud(['200 2.0.0'], '2.0.0');
  x = r.lanzar([]);
  assert.equal(r.estado().resultado, 'actualizado', x.salida);
  // No arranca en la primera instalación: no hay versión anterior → el servicio se APAGA (no se deja dando vueltas sin código).
  r = nuevo();
  r.publicar(V2, { version: '2.0.0', enMain: false });
  r.salud(['503'], '2.0.0');
  x = r.lanzar(['--persona', `--sha=${V2}`]);
  assert.equal(r.estado().resultado, 'revertida_sin_arrancar', x.salida);
  assert.ok(!existsSync(r.en('opt/jarvis/src')), 'el código que no arrancó no queda puesto');
  assert.equal(r.leer('opt/jarvis/.env'), 'PORT=8080\nHOST=0.0.0.0\n', 'el .env sigue en su sitio');
  assert.equal(r.llamadas().filter(l => l === 'systemctl restart jarvis').length, 1, 'no reinicia una carpeta sin código');
  assert.ok(r.llamadas().includes('systemctl stop jarvis'));
  assert.doesNotMatch(r.log(), /la versión anterior tampoco arrancó/);
  assert.ok(!existsSync(r.en(DATOS, 'version.bad')));
});

test('1f actualizador 13: sin el modo de prueba, ningún programa del servidor hace nada desde la carpeta de las pruebas', { skip: saltar }, () => {
  const r = servidor();
  const antes = huellas(r.raiz);
  const programas = readdirSync(DEPLOY).filter(n => n.endsWith('.sh') && n !== 'oportia-comun.sh');
  assert.ok(programas.length >= 8);
  for (const programa of programas) {
    for (const opciones of [{ modoPrueba: false, sinRaiz: true }, { modoPrueba: false }, { modoPrueba: false, sinRaiz: true, entorno: { OPORTIA_FALSOS: r.falsos } }]) {
      for (const argumentos of [[], ['--corrida'], ['pasar'], ['recuperar'], ['estado']]) {
        const x = r.correr(programa, argumentos, { ...opciones, entorno: { PATH: `${r.falsos}:/usr/bin:/bin`, ...(opciones.entorno ?? {}) } });
        assert.ok(x.codigo === 1 || (programa === 'cloud-init.sh' && x.codigo === 2), `${programa} ${argumentos.join(' ')} → ${x.codigo}: ${x.salida}`);
        assert.match(x.salida, /no hice nada|No hice nada|No entiendo/);
      }
    }
  }
  assert.deepEqual(r.llamadas(), [], 'no llamó a ningún comando');
  assert.deepEqual(huellas(r.raiz), antes, 'no creó ni cambió nada');
  // Y en modo de prueba fallan cerrado si la raíz no está dentro de la carpeta temporal o faltan los falsos.
  assert.equal(r.correr('oportia-actualizar.sh', ['--corrida'], { entorno: { OPORTIA_RAIZ: '/' } }).codigo, 1);
  assert.equal(r.correr('oportia-actualizar.sh', ['--corrida'], { entorno: { OPORTIA_FALSOS: '' } }).codigo, 1);
  assert.equal(r.correr('oportia-actualizar.sh', ['--corrida'], { entorno: { TMPDIR: r.raiz } }).codigo, 1);
  assert.deepEqual(r.llamadas(), []);
});
