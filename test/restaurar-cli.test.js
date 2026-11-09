// Fase 1, parte e — ronda 2 del equipo rojo (6): el programa para restaurar (deploy/oportia-restaurar.mjs) en una
// TERMINAL de verdad. Antes, una pregunta oculta (la clave, el token) quitaba el lector de la entrada y la siguiente
// pregunta («¿es tu chat?», «¿es esa la que quieres?») se quedaba esperando para siempre.
//  - El lector, con una terminal de mentira (modo crudo, tecla por tecla, lo que sigue al Enter en el mismo pedazo).
//  - El programa entero dentro de una terminal (pty) de verdad, con python3 (si no está, esas dos pruebas se saltan):
//    --archivos con una copia de hace 3 días (pregunta) y --telegram (token → código → «¿es tu chat?» → clave).
// Contra el Telegram FALSO; nunca internet ni un token de verdad.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carpetaTemporal } from './ayuda.js';
import { montar, segundoCodigo, CHAT, HORA } from './copias-tarea-base.js';
import { crearLector } from '../deploy/oportia-restaurar.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// Las carpetas oportia-restaurar-… que hay en la carpeta temporal del sistema (y en /tmp).
const sueltasEnTmp = () => [...new Set([tmpdir(), '/tmp'])].flatMap(c => { try { return readdirSync(c).filter(n => n.startsWith('oportia-restaurar-')).map(n => join(c, n)); } catch { return []; } }).sort();

function terminalDeMentira() {
  const entrada = Object.assign(new EventEmitter(), {
    isTTY: true, crudo: false, modos: [], setRawMode(v) { this.crudo = v; this.modos.push(v); }, setEncoding() {}, pause() {}, destroy() {},
  });
  const salida = { texto: '', write(t) { this.texto += t; } };
  return { entrada, salida };
}

test('ronda 2 (6): el lector en una terminal: oculta → visible → oculta, tecla por tecla, borrar, y lo que sigue al Enter queda para la próxima', async () => {
  const { entrada, salida } = terminalDeMentira();
  const lector = crearLector(entrada, salida);
  const p1 = lector.preguntar('Token: ', { oculto: true });
  assert.equal(entrada.crudo, true);
  for (const c of 'abc') entrada.emit('data', c);
  entrada.emit('data', '\u007f');
  entrada.emit('data', 'd\rsi\n'); // el Enter y la respuesta siguiente en el MISMO pedazo
  assert.equal(await p1, 'abd');
  assert.equal(entrada.crudo, false);
  assert.equal(await lector.preguntar('¿Es el tuyo? '), 'si', 'la siguiente pregunta (visible) recibe lo que ya había llegado');
  const p3 = lector.preguntar('¿Es esa? ');
  entrada.emit('data', 'sí\n'); // visible: la terminal manda la línea entera
  assert.equal(await p3, 'sí');
  const p4 = lector.preguntar('Clave: ', { oculto: true });
  entrada.emit('data', 'XY');
  entrada.emit('data', 'Z\r\n');
  assert.equal(await p4, 'XYZ');
  assert.deepEqual(entrada.modos, [true, false, true, false]);
  assert.ok(!salida.texto.includes('abd') && !salida.texto.includes('XYZ'), 'lo oculto nunca se muestra');
  // Ctrl+C en lo oculto: no hay respuesta (el programa cancela), y la terminal vuelve a la normal.
  const p5 = lector.preguntar('Clave: ', { oculto: true });
  entrada.emit('data', 'ab\u0003');
  assert.equal(await p5, null);
  assert.equal(entrada.crudo, false);
  lector.cerrar();
});

// python3 con terminales (pty) que se pueden abrir de verdad aquí; si no, esas pruebas se saltan (el lector igual se
// prueba arriba con la terminal de mentira).
const hayPython = spawnSync('python3', ['-I', '-c', 'import pty, select, json, os; m, s = pty.openpty(); os.close(m); os.close(s)'], { stdio: 'ignore', timeout: 10_000 }).status === 0;

// Corre el programa dentro de una terminal (pty) con python3: cada paso espera un texto (expresión regular) y escribe
// algo; «avisar» le cuenta a esta prueba lo encontrado (para escribirle al bot el código); «escribirDe» escribe lo que
// haya en ese archivo (lo deja la prueba en alAviso: el segundo código que el bot le mandó al chat). → { status, salida, colgado }
function enTerminal({ argv, env, pasos, alAviso = () => {}, msFin = 30_000 }) {
  const carpeta = carpetaTemporal('pty');
  const script = join(carpeta, 'terminal.py');
  writeFileSync(script, `
import os, pty, sys, time, select, json, re, signal
c = json.loads(sys.argv[1])
pid, fd = pty.fork()
if pid == 0:
    os.chdir(c['cwd'])
    os.execve(c['node'], c['argv'], c['env'])
salida = b''
pos = 0
def leer(t):
    global salida
    r, _, _ = select.select([fd], [], [], t)
    if not r: return True
    try: d = os.read(fd, 65536)
    except OSError: return False
    if not d: return False
    salida += d
    return True
vivo = True
for p in c['pasos']:
    fin = time.time() + p.get('ms', 20000) / 1000
    m = None
    while time.time() < fin and vivo:
        m = re.compile(p['esperar'].encode()).search(salida, pos)
        if m: break
        vivo = leer(0.1)
    if not m:
        m = re.compile(p['esperar'].encode()).search(salida, pos)
    if not m: break
    pos = m.end()
    if p.get('avisar'):
        print(json.dumps({'avisar': p['avisar'], 'grupos': [g.decode('utf8', 'replace') for g in m.groups()]}), flush=True)
        time.sleep(0.3)
    if 'escribir' in p: os.write(fd, p['escribir'].encode())
    if 'escribirDe' in p:
        for _ in range(50):
            if os.path.exists(p['escribirDe']): break
            time.sleep(0.1)
        with open(p['escribirDe'], 'rb') as f: os.write(fd, f.read() + b'\\r')
fin = time.time() + c['msFin'] / 1000
estado = None
while time.time() < fin:
    leer(0.1)
    r = os.waitpid(pid, os.WNOHANG)
    if r[0] != 0:
        estado = r[1]
        break
colgado = estado is None
if colgado:
    os.kill(pid, signal.SIGKILL)
    os.waitpid(pid, 0)
while leer(0.05): pass
print(json.dumps({'fin': True, 'status': (os.waitstatus_to_exitcode(estado) if estado is not None else None), 'colgado': colgado, 'salida': salida.decode('utf8', 'replace')}), flush=True)
`);
  const config = { cwd: RAIZ, node: process.execPath, argv: ['node', '--no-warnings', 'deploy/oportia-restaurar.mjs', ...argv], env: { PATH: process.env.PATH, OPORTIA_TEST: '1', ...env }, pasos, msFin };
  return new Promise((listo, mal) => {
    const hijo = spawn('python3', ['-I', script, JSON.stringify(config)], { cwd: carpeta, stdio: ['ignore', 'pipe', 'pipe'] });
    let resto = '';
    let final = null;
    let errores = '';
    hijo.stdout.on('data', d => {
      resto += d;
      let i;
      while ((i = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, i);
        resto = resto.slice(i + 1);
        let x = null;
        try { x = JSON.parse(linea); } catch { x = null; }
        if (x?.avisar) alAviso(x);
        if (x?.fin) final = x;
      }
    });
    hijo.stderr.on('data', d => { errores += d; });
    const reloj = setTimeout(() => hijo.kill('SIGKILL'), msFin + 60_000);
    hijo.on('close', () => { clearTimeout(reloj); if (final) listo(final); else mal(new Error(`la terminal no terminó: ${errores}`)); });
  });
}

test('ronda 2 (6): en una terminal de verdad, --archivos con una copia de hace 3 días: la clave (oculta) y después «¿es esa la que quieres?» → termina', { skip: hayPython ? false : 'sin python3 para abrir una terminal' }, async () => {
  const b = await montar({ relleno: 4, telegram: false });
  try {
    b.t = Date.now() - 3 * 24 * HORA;
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const carpeta = join(b.config.carpetaCopias, 'cifradas');
    const r = await enTerminal({
      argv: [`--archivos=${carpeta}`, '--comprobar'],
      pasos: [
        { esperar: 'clave de recuperaci\u00f3n \\(no se muestra\\): ', escribir: `${b.claveTexto}\r` },
        { esperar: '\u00bfEs esa la que quieres\\? \\(s\u00ed/no\\): ', escribir: 'si\r' },
      ],
    });
    assert.equal(r.colgado, false, r.salida);
    assert.equal(r.status, 0, r.salida);
    assert.match(r.salida, /Esta copia es de hace 3 días/);
    assert.match(r.salida, /Copia comprobada/);
    assert.ok(!r.salida.includes(b.claveTexto), 'la clave nunca se ve en la terminal');
  } finally {
    await b.cerrar();
  }
});

test('ronda 2 (6): en una terminal de verdad, --telegram: el token (oculto), el código al bot, «¿es tu chat?», la clave (oculta) → termina y dice que revoques el token', { skip: hayPython ? false : 'sin python3 para abrir una terminal' }, async () => {
  const b = await montar({ relleno: 4 });
  try {
    assert.equal((await b.terminar(b.pedir())).estado, 'hecha');
    const archivoSegundo = join(carpetaTemporal('pty-segundo'), 'codigo.txt');
    // Revisión final: la carpeta de trabajo va dentro de las carpetas de prueba (antes quedaba una oportia-restaurar-…
    // suelta en /tmp en cada corrida, fuera de lo que limpia el actualizador).
    const sueltasAntes = sueltasEnTmp();
    const r = await enTerminal({
      argv: ['--telegram', '--comprobar', `--trabajo=${carpetaTemporal('cli-trabajo')}`],
      env: { OPORTIA_TELEGRAM_URL: b.falso.url },
      pasos: [
        { esperar: 'token de tu bot \\(no se muestra\\): ', escribir: `${b.token}\r` },
        { esperar: 'este c\u00f3digo: (\\d{4} \\d{4})', avisar: 'codigo' },
        { esperar: '\u00bfEs el tuyo\\? \\(s\u00ed/no\\): ', escribir: 'si\r', ms: 30_000 },
        { esperar: 'c\u00f3digo de 6 cifras que te mand\u00f3 el bot: ', avisar: 'segundo', escribirDe: archivoSegundo },
        { esperar: 'clave de recuperaci\u00f3n \\(no se muestra\\): ', escribir: `${b.claveTexto}\r` },
      ],
      alAviso: x => {
        if (x.avisar === 'codigo') b.falso.escribir({ chat: CHAT, texto: `/start ${x.grupos[0]}` });
        if (x.avisar === 'segundo') writeFileSync(archivoSegundo, segundoCodigo(b.falso));
      },
    });
    assert.equal(r.colgado, false, r.salida);
    assert.equal(r.status, 0, r.salida);
    assert.match(r.salida, /Encontré el chat de Junior/);
    assert.match(r.salida, /Copia comprobada/);
    assert.match(r.salida, /@BotFather.*\/revoke/);
    assert.ok(!r.salida.includes(b.token) && !r.salida.includes(b.claveTexto), 'ni el token ni la clave se ven');
    assert.deepEqual(sueltasEnTmp(), sueltasAntes, 'no queda ninguna carpeta oportia-restaurar-… suelta en /tmp');
  } finally {
    await b.cerrar();
  }
});
