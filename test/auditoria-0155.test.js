// 0.14.55: lo que arregló la auditoría del servidor (de la 0.14.53). Cada arreglo con su prueba:
//  1. Las carpetas temporales del probador de «Claude mejora la app» (src/academia/app-temporales.js): solo tmp-*, solo
//     dentro de su carpeta y esta dentro de la carpeta temporal del sistema; cada «no» probado. El candado del
//     actualizador (/proc/locks). (Que el probador las quite al pasar, fallar o pasarse del tiempo: test/app-mejora.test.js.)
//  2. «Cómo van todos» suma en la base lo que antes armaba en memoria: da EXACTAMENTE lo mismo que la cuenta de antes.
//  3. Los índices de la migración 13 se usan (EXPLAIN QUERY PLAN), sin tocar ningún dato.
//  4. La entrada: tope de la fila de cálculos (503 «servidor_ocupado»), tope por lugar, y el dueño desde Tailscale nunca.
//  5. Un contenido dañado: el aviso «paquete_danado» para el administrador; el alumno sigue sin errores.
//  6. El actualizador (deploy/cloud-init.sh): 124/137/SIGKILL se vuelven a probar (hasta 3), solo un fallo marca version.bad.
//  7. tg.json una vez por versión del archivo; /api/setup dice el disco; el disco lleno da 507 «disco_sin_espacio».
import { configDePrueba, conServidor, carpetaTemporal, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, symlinkSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { abrirBase } from '../src/nucleo/db.js';
import { MIGRACIONES } from '../src/nucleo/migraciones.js';
import { crearServidor, esDiscoLleno } from '../src/app.js';
import { crearUsuario, auditar } from '../src/cuentas/usuarios.js';
import { hashClave as hashClaveReal, verificarClave, ClaveOcupada, enFilaDeClaves } from '../src/cuentas/claves.js';
import { crearLimitesCuentas, estadoDisco } from '../src/api/cuentas.js';
import { EnCurso, Freno } from '../src/nucleo/limites.js';
import { quitarTemporal, quitarTemporalesViejos, motivoParaNoQuitar } from '../src/academia/app-temporales.js';
import { candadoTomado } from '../src/academia/app-probador.js';
import { carpetaApp } from '../src/academia/app-fuente.js';
import { fechasDeRespuestas, ultimasRespuestas } from '../src/academia/como-van.js';
import { tiempoDeEstudio } from '../src/academia/fichas.js';
import { diasActivosSemana } from '../src/academia/por-materia.js';
import { ultimaActividad } from '../src/academia/progreso.js';
import { preguntaDelTestGuide } from '../src/academia/biblioteca.js';
import { carpetaFuentes } from '../src/academia/fuentes.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const CLAVE = 'una clave bien larga';
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };
const DESDE_INTERNET = ip => ({ 'X-Forwarded-For': `1.2.3.4, ${ip}`, 'Tailscale-Funnel-Request': '?1' });
const RAIZ = join(import.meta.dirname, '..');
const iso = ms => new Date(ms).toISOString();

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null, cabeceras: r.headers };
}
const planDe = (db, sql, ...p) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...p).map(f => f.detail).join(' | ');

// ---------- 1. Las carpetas temporales del probador ----------
function conCarpetaApp() {
  const raiz = carpetaTemporal('temporales');
  const config = { carpetaAppMejora: join(raiz, 'app-mejora') };
  mkdirSync(config.carpetaAppMejora, { recursive: true });
  return { raiz, config };
}

test('1. quitarTemporal: quita SOLO una tmp-* del probador, con todo lo que tiene', async () => {
  const { config } = conCarpetaApp();
  const tmp = join(carpetaApp(config), 'tmp-b04fe8c02daf');
  mkdirSync(join(tmp, 'oportia-x', 'datos'), { recursive: true });
  writeFileSync(join(tmp, 'oportia-x', 'datos', 'oportia.db'), Buffer.alloc(8192));
  assert.equal(motivoParaNoQuitar(config, tmp), null);
  assert.equal(await quitarTemporal(config, tmp), true);
  assert.equal(existsSync(tmp), false);
  assert.equal(existsSync(carpetaApp(config)), true, 'la carpeta del probador queda');
  assert.equal(await quitarTemporal(config, tmp), false, 'lo que ya no está: nada');
});

test('1. quitarTemporal dice que no a todo lo demás (y no toca nada)', async () => {
  const { raiz, config } = conCarpetaApp();
  const app = carpetaApp(config);
  const hacer = ruta => { mkdirSync(ruta, { recursive: true }); writeFileSync(join(ruta, 'dato.txt'), 'importante'); return ruta; };
  const casos = [
    [hacer(join(app, 'arbol-' + 'a'.repeat(40))), 'nombre'], // la copia del código
    [hacer(join(app, 'datos')), 'nombre'],
    [hacer(join(app, 'oportia-pruebas-x')), 'nombre'],
    [hacer(join(app, 'tmp-x', 'tmp-y')), 'fuera_de_app'], // una tmp- más adentro
    [hacer(join(raiz, 'tmp-afuera')), 'fuera_de_app'], // al lado, no dentro de la carpeta del probador
    [join(app, 'tmp-..'), 'nombre'],
    [join(app, 'tmp-no-existe'), 'no_existe'],
  ];
  // Un enlace con nombre de temporal que apunta a otra carpeta: nunca se sigue.
  const destino = hacer(join(raiz, 'otra'));
  symlinkSync(destino, join(app, 'tmp-enlace'));
  casos.push([join(app, 'tmp-enlace'), 'no_es_carpeta']);
  for (const [ruta, motivo] of casos) {
    assert.equal(motivoParaNoQuitar(config, ruta), motivo, ruta);
    assert.equal(await quitarTemporal(config, ruta), false, ruta);
  }
  assert.equal(readFileSync(join(destino, 'dato.txt'), 'utf8'), 'importante');
  assert.equal(readFileSync(join(app, 'tmp-x', 'tmp-y', 'dato.txt'), 'utf8'), 'importante');
  // La carpeta del probador FUERA de la carpeta temporal del sistema (por ejemplo, junto a los datos): nunca.
  const tmp = hacer(join(app, 'tmp-bien'));
  assert.equal(motivoParaNoQuitar(config, tmp, { temporal: join(raiz, 'otra') }), 'fuera_de_temporal');
  assert.equal(await quitarTemporal(config, tmp, { temporal: join(raiz, 'otra') }), false);
  assert.equal(existsSync(join(tmp, 'dato.txt')), true);
  assert.equal(await quitarTemporal(config, 'relativa/tmp-x'), false);
  assert.equal(await quitarTemporal(config, ''), false);
});

test('1. al arrancar y antes de cada prueba: quita las tmp-* viejas (y oportia-pruebas) y deja la copia del código y la descarga', async () => {
  const { config } = conCarpetaApp();
  const app = carpetaApp(config);
  for (const n of ['tmp-uno', 'tmp-dos', 'oportia-pruebas', `arbol-${'b'.repeat(40)}`]) { mkdirSync(join(app, n, 'x'), { recursive: true }); writeFileSync(join(app, n, 'x', 'a'), 'a'); }
  writeFileSync(join(app, `fuente-${'b'.repeat(40)}.tgz`), 'tgz');
  writeFileSync(join(app, 'tmp-archivo'), 'no es carpeta');
  assert.equal(await quitarTemporalesViejos(config), 3);
  assert.deepEqual(['tmp-uno', 'tmp-dos', 'oportia-pruebas'].map(n => existsSync(join(app, n))), [false, false, false]);
  assert.ok(existsSync(join(app, `arbol-${'b'.repeat(40)}`, 'x', 'a')));
  assert.ok(existsSync(join(app, `fuente-${'b'.repeat(40)}.tgz`)));
  assert.ok(existsSync(join(app, 'tmp-archivo')));
  assert.equal(await quitarTemporalesViejos({ carpetaAppMejora: join(app, 'no-existe') }), 0);
});

test('1. el candado del actualizador: se ve en /proc/locks por su número de archivo y su disco (solo los tomados)', () => {
  const estado = () => ({ dev: (0x19 << 8) | 0x03, ino: 4242 }); // mayor 0x19, menor 3
  const con = texto => candadoTomado('/run/x.lock', { estado, leerCandados: () => texto });
  assert.equal(con('1: FLOCK  ADVISORY  WRITE 1234 19:03:4242 0 EOF\n'), true);
  assert.equal(con('1: POSIX  ADVISORY  WRITE 1234 19:03:4242 0 EOF\n'), false, 'solo flock');
  assert.equal(con('1: FLOCK  ADVISORY  WRITE 1234 19:03:4243 0 EOF\n'), false, 'otro archivo');
  assert.equal(con('1: FLOCK  ADVISORY  WRITE 1234 fd:03:4242 0 EOF\n'), false, 'otro disco');
  assert.equal(con('1: -> FLOCK  ADVISORY  WRITE 99 19:03:4242 0 EOF\n'), false, 'uno que solo espera');
  assert.equal(con(''), false);
  assert.equal(candadoTomado('/run/x.lock', { estado: () => { throw new Error('no'); }, leerCandados: () => '' }), false, 'sin el archivo: se prueba');
  assert.equal(candadoTomado('/run/x.lock', { estado, leerCandados: () => { throw new Error('no'); } }), false);
});

test('1. el candado del actualizador, de verdad: un flock tomado por otro proceso se ve, y al soltarlo ya no', async t => {
  const flock = ['/usr/bin/flock', '/bin/flock'].find(r => existsSync(r));
  if (!flock || !existsSync('/proc/locks')) return t.skip('sin flock o sin /proc/locks');
  const archivo = join(carpetaTemporal('candado'), 'actualizar.lock');
  writeFileSync(archivo, '');
  assert.equal(candadoTomado(archivo), false);
  // -o: solo flock tiene el candado; su hijo termina cuando se le cierra la entrada (y flock, con él).
  const hijo = spawn(flock, ['-n', '-o', archivo, process.execPath, '-e', 'process.stdout.write("tomado\\n"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0))'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const termino = new Promise(ok => hijo.on('exit', ok));
  try {
    await new Promise((ok, mal) => { hijo.stdout.on('data', d => { if (String(d).includes('tomado')) ok(); }); hijo.on('exit', () => mal(new Error('flock terminó'))); });
    assert.equal(candadoTomado(archivo), true);
  } finally {
    hijo.stdin.end();
    await termino;
  }
  assert.equal(candadoTomado(archivo), false);
});

// ---------- 2 y 3. «Cómo van todos» en la base, y los índices ----------
// La cuenta de ANTES (0.14.53), tal cual: todas las fechas en memoria, en orden.
function comoAntes(db, ahoraMs) {
  const SEMANA = 7 * 24 * 3600 * 1000;
  const porId = new Map();
  for (const f of db.prepare('SELECT usuario_id, creada_en, dia FROM academia_respuestas ORDER BY usuario_id, creada_en').all()) {
    if (!porId.has(f.usuario_id)) porId.set(f.usuario_id, []);
    porId.get(f.usuario_id).push(f);
  }
  return new Map([...porId].map(([id, l]) => [id, {
    minutos: tiempoDeEstudio(l.map(f => f.creada_en)),
    semana: tiempoDeEstudio(l.filter(f => { const t = Date.parse(f.creada_en); return t <= ahoraMs && ahoraMs - t < SEMANA; }).map(f => f.creada_en)),
    dias: new Set(l.map(f => f.dia)).size,
    diasSemana: diasActivosSemana(l, ahoraMs),
    ultima: l.at(-1).creada_en,
  }]));
}

async function baseConRespuestas() {
  const config = configDePrueba();
  const db = abrirBase(config);
  const ids = [];
  for (const nombre of ['ana', 'beto', 'carla', 'dario', 'sin-nada']) ids.push(crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false }));
  const intento = u => Number(db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, materia, empezado_en) VALUES (?, 'practica', 'factores_humanos', ?)").run(u, iso(0)).lastInsertRowid);
  const meter = db.prepare("INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, 'factores_humanos', 't', ?, ?, ?, ?)");
  return { config, db, ids, intento, meter };
}
const AHORA = Date.parse('2026-11-19T15:00:00.000Z');
const MIN = 60_000;

test('2. «Cómo van todos»: los minutos, la semana y los días salen de la base IGUAL que la cuenta de antes (casos de borde)', async () => {
  const { db, ids: [ana, beto, carla, dario, sinNada], intento, meter } = await baseConRespuestas();
  const poner = (u, ms, { dia = iso(ms).slice(0, 10), fecha = iso(ms) } = {}) => meter.run(intento(u), u, `tg-${ms}`, 'A', 1, dia, fecha);
  const SEMANA = 7 * 24 * 60 * MIN;
  // ana: una pausa de EXACTAMENTE 10 min (cuenta), una de 10 min + 1 ms (no), dos a la misma hora, una del futuro.
  for (const ms of [AHORA - 60 * MIN, AHORA - 50 * MIN, AHORA - 40 * MIN + 1, AHORA - 40 * MIN + 1, AHORA - 39 * MIN, AHORA + 5 * MIN]) poner(ana, ms);
  // beto: justo en el borde de la semana (7 días exactos: fuera; 7 días − 1 ms: dentro) y la cadena que empieza dentro.
  for (const ms of [AHORA - SEMANA - 2 * MIN, AHORA - SEMANA, AHORA - SEMANA + 1, AHORA - SEMANA + 3 * MIN, AHORA - 2 * MIN]) poner(beto, ms);
  // carla: una fecha rara (no se cuenta en el tiempo, pero su día sí, como antes) y fechas sin milisegundos.
  poner(carla, AHORA - 5 * MIN, { fecha: 'no-es-fecha', dia: '2026-11-01' });
  poner(carla, AHORA - 4 * MIN, { fecha: '2026-11-19T14:56:00Z' });
  poner(carla, AHORA - 3 * MIN);
  // dario: muchas al azar (con semilla fija), con pausas cortas y largas, varios días.
  let s = 7;
  const azar = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31; };
  let t = AHORA - 20 * 24 * 60 * MIN;
  for (let i = 0; i < 400; i++) { t += Math.floor(azar() * (azar() < 0.8 ? 12 * MIN : 3 * 24 * 60 * MIN)); if (t < AHORA + 60 * MIN) poner(dario, t); }
  const antes = comoAntes(db, AHORA);
  const ahora = fechasDeRespuestas(db, AHORA);
  for (const u of [ana, beto, carla, dario]) {
    const { ultima, ...resto } = antes.get(u);
    assert.deepEqual(ahora.get(u), resto, `alumno ${u}`);
  }
  assert.equal(ahora.has(sinNada), false, 'sin respuestas: no sale (la pantalla pone 0)');
  assert.equal(antes.get(ana).minutos, 1 + 10 + 1 + 0 + 1 + 1, 'el caso de borde de ana, a mano');
  // La última respuesta (para «en línea»): la misma, ahora una consulta corta por cuenta.
  const ultimas = ultimasRespuestas(db, [ana, beto, carla, dario, sinNada]);
  for (const u of [ana, beto, carla, dario]) assert.equal(ultimas.get(u), antes.get(u).ultima);
  assert.equal(ultimas.has(sinNada), false);
  db.close();
});

test('3. migración 13: solo índices nuevos, y «en línea», «Cómo van», la mejora semanal y la auditoría los usan', async () => {
  const m = MIGRACIONES.find(x => x.id === 13);
  assert.ok(m);
  const sentencias = m.sql.split(';').map(x => x.trim()).filter(Boolean);
  assert.equal(sentencias.length, 5);
  for (const x of sentencias) assert.match(x, /^CREATE INDEX IF NOT EXISTS \w+ ON \w+\([\w, ]+\)$/);
  const { db, ids: [ana] } = await baseConRespuestas();
  assert.match(planDe(db, 'SELECT MAX(creada_en) AS f FROM academia_respuestas WHERE usuario_id = ?', ana), /academia_respuestas_usuario_fecha/);
  assert.match(planDe(db, `SELECT id, (SELECT MAX(creada_en) FROM academia_respuestas r WHERE r.usuario_id = u.id) AS f,
    (SELECT MAX(json_extract(detalle, '$.ultimoUso')) FROM auditoria a WHERE a.usuario_id = u.id AND a.accion = 'salida' AND json_valid(a.detalle)) AS s FROM usuarios u`),
  /SEARCH r USING COVERING INDEX academia_respuestas_usuario_fecha.*SEARCH a USING INDEX auditoria_usuario_accion/s);
  // La mejora de cada semana (src/academia/fabrica-mejora.js): la opción más elegida de UNA pregunta, sin leer la tabla.
  assert.match(planDe(db, 'SELECT elegida, COUNT(*) AS n FROM academia_respuestas WHERE pregunta = ? AND correcta = 0 GROUP BY elegida ORDER BY n DESC LIMIT 1', '1-1'), /SEARCH academia_respuestas USING COVERING INDEX academia_respuestas_pregunta/);
  // El reporte y las fichas (src/cuentas/historial.js).
  assert.match(planDe(db, "SELECT fecha FROM auditoria WHERE usuario_id = ? AND accion = 'salida' ORDER BY id DESC LIMIT 1", ana), /SEARCH auditoria USING INDEX auditoria_usuario_accion/);
  assert.match(planDe(db, "SELECT COUNT(*) AS n FROM auditoria WHERE usuario_id = ? AND accion IN ('entrada', 'primer_admin_creado')", ana), /auditoria_usuario_accion/);
  assert.doesNotMatch(planDe(db, "SELECT fecha FROM auditoria WHERE usuario_id = ? AND accion = 'salida' ORDER BY id DESC LIMIT 1", ana), /SCAN auditoria/);
  db.close();
});

test('3. la última actividad (con «Salir» en la auditoría) da lo mismo que antes', async () => {
  const { db, ids: [ana, beto], intento, meter } = await baseConRespuestas();
  meter.run(intento(ana), ana, '1-1', 'A', 1, '2026-11-18', '2026-11-18T10:00:00.000Z');
  auditar(db, { usuarioId: beto, accion: 'salida', detalle: JSON.stringify({ ultimoUso: '2026-11-19T09:00:00.000Z' }) });
  auditar(db, { usuarioId: beto, accion: 'salida', detalle: 'no es json' });
  const m = ultimaActividad(db);
  assert.equal(m.get(ana), '2026-11-18T10:00:00.000Z');
  assert.equal(m.get(beto), '2026-11-19T09:00:00.000Z');
  db.close();
});

// ---------- 4. La entrada ----------
test('4. la fila de cálculos de contraseña tiene tope SOLO para quien lo pide (maxEspera): «ocupado» sin calcular nada', async () => {
  const llenar = Array.from({ length: 6 }, () => hashClaveReal('relleno de la fila'));
  assert.ok(enFilaDeClaves() >= 4);
  await assert.rejects(verificarClave('cualquier cosa', undefined, { maxEspera: 2 }), e => e instanceof ClaveOcupada && e.code === 'ocupado');
  // Sin maxEspera (crear o cambiar una contraseña, confirmar con la sesión abierta): espera su turno, como siempre.
  const sin = verificarClave('cualquier cosa');
  await Promise.all(llenar);
  assert.equal(await sin, false);
  assert.equal(enFilaDeClaves(), 0);
});

test('4. EnCurso: como mucho N a la vez por lugar; al soltar, entra el siguiente; memoria acotada', () => {
  const e = new EnCurso({ maximo: 2, maximoClaves: 2 });
  assert.deepEqual([e.tomar('a'), e.tomar('a'), e.tomar('a')], [true, true, false]);
  assert.equal(e.tomar('b'), true);
  assert.equal(e.tomar('c'), false, 'tope de lugares a la vez');
  e.soltar('a');
  assert.equal(e.tomar('a'), true);
  e.soltar('a'); e.soltar('a'); e.soltar('b');
  assert.equal(e.enMarcha('a'), 0);
  assert.equal(e.registro.size, 0);
});

async function conEntrada(fn, limites) {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, limites }), async base => {
    const r = await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 201);
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    await fn(base, db);
  });
  db.close();
}

test('4. muchas entradas a la vez desde un lugar: las que sobran reciben 503 «servidor_ocupado» al instante; otro lugar y el dueño entran', async () => {
  const limites = { ...crearLimitesCuentas(), aLaVez: new EnCurso({ maximo: 1 }) };
  await conEntrada(async base => {
    // Un pedido de 203.0.113.7 «en marcha» (como si esperara su cálculo).
    assert.equal(limites.aLaVez.tomar('203.0.113.7'), true);
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'x123', clave: 'cualquier-clave' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.deepEqual([r.codigo, r.datos.error, r.cabeceras.get('retry-after')], [503, 'servidor_ocupado', '2']);
    // Otro lugar entra (con su contraseña buena).
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE }, cabeceras: DESDE_INTERNET('198.51.100.20') });
    assert.equal(r.codigo, 200);
    // El dueño desde Tailscale nunca pasa por el tope de lugar (aunque «su» lugar, 127.0.0.1, estuviera lleno).
    assert.equal(limites.aLaVez.tomar('127.0.0.1'), true);
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(r.codigo, 200);
    // Al soltarse, el lugar vuelve a entrar normal (no es un bloqueo).
    limites.aLaVez.soltar('203.0.113.7');
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 200);
    assert.equal(limites.aLaVez.enMarcha('203.0.113.7'), 0, 'cada pedido suelta lo que tomó');
  }, limites);
});

test('4. con la fila de cálculos llena: 503 «servidor_ocupado» desde internet; el dueño desde Tailscale entra igual', async () => {
  const limites = { ...crearLimitesCuentas(), filaMaxima: 3 };
  await conEntrada(async base => {
    const llenar = Array.from({ length: 24 }, () => hashClaveReal('relleno de la fila'));
    try {
      const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE }, cabeceras: DESDE_INTERNET('203.0.113.7') });
      assert.deepEqual([r.codigo, r.datos.error], [503, 'servidor_ocupado']);
      assert.deepEqual([limites.porLugar.registro.size, limites.freno.registro.size], [0, 0], '«ocupado» no cuenta como una contraseña mala');
      const dueno = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
      assert.equal(dueno.codigo, 200, 'el dueño nunca recibe «ocupado»');
    } finally { await Promise.all(llenar); }
    const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 200, 'con la fila vacía, entra');
  }, limites);
});

test('4. el freno por lugar: nombres inventados desde un mismo lugar esperan, otro lugar no; al entrar bien se olvida', async () => {
  assert.equal(crearLimitesCuentas().porLugar.libres, 30, 'en el servidor: 30 sin espera por lugar');
  const f = { t: Date.now(), esperas: [] };
  const dormir = async ms => { f.esperas.push(ms); f.t += ms; };
  const reloj = () => f.t;
  // Aquí con 3 sin espera (en vez de 30), para no calcular tantas contraseñas.
  const limites = { ...crearLimitesCuentas({ dormir, reloj }), porLugar: new Freno({ libres: 3, dormir, reloj }) };
  await conEntrada(async base => {
    for (let i = 0; i < 6; i++) {
      const r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: `x${i}`, clave: 'cualquier-clave' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
      assert.equal(r.codigo, 401);
    }
    assert.deepEqual(f.esperas, [1000, 2000, 4000], 'cada nombre es nuevo (su cuenta no frena), pero el lugar sí');
    f.esperas.length = 0;
    let r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE }, cabeceras: DESDE_INTERNET('198.51.100.20') });
    assert.equal(r.codigo, 200);
    assert.deepEqual(f.esperas, [], 'otro lugar no espera');
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.equal(r.codigo, 200, 'la buena entra (después de su espera)');
    f.esperas.length = 0;
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'x99', clave: 'cualquier-clave' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    assert.deepEqual([r.codigo, f.esperas], [401, []], 'al acertar se olvida');
    // El dueño desde Tailscale: nunca el freno por lugar.
    for (let i = 0; i < 5; i++) await pedir(base, 'POST', '/api/entrar', { datos: { nombre: `t${i}`, clave: 'cualquier-clave' }, cabeceras: DESDE_TAILSCALE });
    assert.deepEqual(f.esperas, []);
  }, limites);
});

test('4. el freno del lugar y el de la cuenta se esperan A LA VEZ (nunca más de 8 s en total)', async () => {
  const pendientes = [];
  const dormir = ms => new Promise(ok => pendientes.push({ ms, ok }));
  const reloj = () => 1_000_000;
  const limites = { ...crearLimitesCuentas({ dormir, reloj }), freno: new Freno({ libres: 0, dormir, reloj }), porLugar: new Freno({ libres: 0, dormir, reloj }) };
  await conEntrada(async base => {
    const r = pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: 'mala-clave-larga' }, cabeceras: DESDE_INTERNET('203.0.113.7') });
    for (let i = 0; i < 200 && pendientes.length < 2; i++) await new Promise(ok => setTimeout(ok, 5));
    assert.deepEqual(pendientes.map(p => p.ms), [1000, 1000], 'las dos esperas empezaron juntas');
    for (const p of pendientes) p.ok();
    assert.equal((await r).codigo, 401);
  }, limites);
});

// ---------- 5. Un contenido dañado ----------
test('5. un contenido en uso con su paquete.json dañado: el alumno sigue sin errores, y el administrador ve el aviso', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE })).galleta;
    crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const subir = async () => {
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(paqueteMuestra()) });
      assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
      for (const archivo of s.datos.faltan) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      return s.datos.paquete.id;
    };
    const id = await subir();
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    // El archivo se daña en el disco (por ejemplo, se cortó al copiarlo) antes de que nadie lo arme.
    const fila = db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id);
    const json = join(config.archivoBase, '..', 'academia', 'paquetes', fila.carpeta, 'paquete.json');
    writeFileSync(json, readFileSync(json, 'utf8').slice(0, 2048));
    const ana = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    const progreso = await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana });
    assert.ok(progreso.codigo < 500, `el alumno no ve un error: ${progreso.codigo}`);
    const aviso = db.prepare("SELECT nivel, detalle FROM avisos WHERE clave = 'paquete_danado' AND resuelto_en IS NULL").get();
    assert.ok(aviso, 'el aviso del administrador');
    assert.equal(aviso.nivel, 'grave');
    assert.deepEqual(JSON.parse(aviso.detalle), { paquetes: [id] });
    const vista = await pedir(base, 'GET', '/api/admin/academia', { galleta: admin });
    assert.deepEqual(vista.datos.danados, [id]);
    // Se vuelve a subir bien (una versión nueva) y se pone en uso: el aviso se resuelve solo.
    const nueva = await subir();
    assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${nueva}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    await pedir(base, 'GET', '/api/academia/progreso', { galleta: ana });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'paquete_danado' AND resuelto_en IS NULL").get().n, 0);
    assert.deepEqual((await pedir(base, 'GET', '/api/admin/academia', { galleta: admin })).datos.danados, []);
  });
  db.close();
  // Su texto en los dos idiomas (pantalla y Telegram).
  for (const idioma of ['es', 'en']) {
    const t = JSON.parse(readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8'));
    for (const k of ['aviso.paquete_danado', 'telegram.aviso.paquete_danado.titulo', 'telegram.aviso.paquete_danado.texto', 'error.servidor_ocupado', 'error.disco_sin_espacio']) assert.ok(t[k], `${idioma}: ${k}`);
  }
});

// ---------- 6. El actualizador ----------
test('6. el actualizador: «no terminó» (124, 137, SIGKILL) se vuelve a probar hasta 3 veces; solo un fallo marca version.bad', () => {
  const texto = readFileSync(join(RAIZ, 'deploy', 'cloud-init.sh'), 'utf8');
  const script = texto.slice(texto.indexOf("cat >> /usr/local/bin/jarvis-actualizar <<'SH'"), texto.indexOf('chmod 755 /usr/local/bin/jarvis-actualizar'));
  assert.match(script, /exec 9>\/run\/jarvis-actualizar\.lock; flock -n 9 \|\| exit 0/, 'el candado que mira el probador');
  assert.match(script, /nice -n 10 timeout 900 node --no-warnings --test test\/\*\.test\.js/);
  assert.match(script, /"\$CODIGO" -eq 124 \] \|\| \[ "\$CODIGO" -eq 137 \] \|\| grep -q "signal: 'SIGKILL'"/);
  assert.match(script, /if \[ "\$VECES" -lt 3 \]; then/);
  // version.bad solo después de revisar si fue «no terminó».
  const antes = script.slice(0, script.indexOf('alguna prueba falló')).split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
  assert.equal((antes.match(/version\.bad/g) ?? []).length, 1, 'antes de la línea del fallo, solo la lectura de version.bad');
  assert.ok(spawnSync('bash', ['-n', join(RAIZ, 'deploy', 'cloud-init.sh')]).status === 0, 'el script se puede leer');
});

// ---------- 7. tg.json, el disco ----------
test('7. «Ver en el Test Guide»: tg.json se lee una vez por versión del archivo; si cambia, se vuelve a leer', () => {
  const config = configDePrueba();
  config.carpetaDatos = join(config.raiz, 'datos');
  const dir = carpetaFuentes(config);
  mkdirSync(dir, { recursive: true });
  const escribir = (enunciado, ms) => {
    writeFileSync(join(dir, 'tg.json'), JSON.stringify({ preguntas: [{ id: '1-1', enunciado }, { id: '1-1', enunciado: 'repetida' }, { id: '1-2', enunciado: 'otra' }] }));
    utimesSync(join(dir, 'tg.json'), ms / 1000, ms / 1000);
  };
  escribir('uno', Date.parse('2026-11-01T00:00:00Z'));
  const a = preguntaDelTestGuide(config, '1-1');
  assert.equal(a.enunciado, 'uno', 'la primera, como antes');
  a.enunciado = 'cambiada por quien la usó';
  assert.equal(preguntaDelTestGuide(config, '1-1').enunciado, 'uno', 'lo guardado no se cambia desde afuera');
  assert.equal(preguntaDelTestGuide(config, '1-9'), null);
  escribir('dos', Date.parse('2026-11-02T00:00:00Z'));
  assert.equal(preguntaDelTestGuide(config, '1-1').enunciado, 'dos', 'el archivo cambió: se lee otra vez');
});

test('7. /api/setup dice el disco (siempre con 200), y el disco lleno da 507 «disco_sin_espacio» (no «algo falló»)', async () => {
  assert.deepEqual([estadoDisco(10 * 2 ** 20), estadoDisco(200 * 2 ** 20), estadoDisco(2 * 2 ** 30), estadoDisco(null)], ['lleno', 'bajo', 'ok', null]);
  assert.equal(esDiscoLleno(Object.assign(new Error('database or disk is full'), { code: 'ERR_SQLITE_ERROR', errcode: 13 })), true);
  assert.equal(esDiscoLleno(Object.assign(new Error('x'), { code: 'ENOSPC' })), true);
  assert.equal(esDiscoLleno(new Error('otra cosa')), false);
  const config = configDePrueba();
  const db = abrirBase(config);
  let libre = 10 * 2 ** 20;
  await conServidor(crearServidor({ db, config, discoLibre: () => libre }), async base => {
    let r = await pedir(base, 'GET', '/api/setup');
    assert.deepEqual([r.codigo, r.datos.disco], [200, 'lleno']);
    libre = 5 * 2 ** 30;
    r = await pedir(base, 'GET', '/api/setup');
    assert.deepEqual([r.codigo, r.datos.disco, r.datos.base.version], [200, 'ok', 13]);
    assert.equal((await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE })).codigo, 201);
    // La base ya no puede crecer (como un disco lleno): entrar no puede guardar la sesión.
    const paginas = db.prepare('PRAGMA page_count').get().page_count;
    db.exec(`PRAGMA max_page_count = ${paginas}`);
    let lleno = null;
    for (let i = 0; i < 50 && !lleno; i++) {
      r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } });
      if (r.codigo !== 200) lleno = r;
    }
    assert.ok(lleno, 'la base se llenó');
    assert.deepEqual([lleno.codigo, lleno.datos.error], [507, 'disco_sin_espacio']);
    db.exec('PRAGMA max_page_count = 1073741823');
    r = await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'junior', clave: CLAVE } });
    assert.equal(r.codigo, 200, 'con espacio otra vez, sigue como siempre');
  });
  db.close();
});
