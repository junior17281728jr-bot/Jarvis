// Ayuda para probar los programas del servidor (deploy/*.sh) sin tocar el servidor (no es un archivo *.test.js).
// Arma una RAÍZ FALSA dentro de la carpeta temporal (ahí «/opt/jarvis» es <raíz>/opt/jarvis) y escribe, al correr, los
// COMANDOS FALSOS del sistema (systemctl, curl, apt-get, tailscale, ufw…): cada uno anota cómo lo llamaron en
// llamadas.log y contesta según los archivos de la carpeta «guion». Los falsos devuelven los textos REALES conocidos.
// Reglas: nunca la red, nunca un comando del sistema de verdad, y NUNCA como root: si quien corre las pruebas es root
// (el actualizador de antes las corre así), cada programa baja a «nobody» con setpriv y la raíz falsa es de «nobody»:
// una ruta que se escapara de la raíz fallaría con «Permission denied». Si no se puede (falta setpriv, o «nobody» no
// puede entrar a la carpeta temporal), las pruebas se SALTAN con su motivo: nunca fallan por el entorno.
import './ayuda.js';
import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carpetaTemporal } from './ayuda.js';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEPLOY = join(REPO, 'deploy');
export const NADIE = 65534;
export const JUEGO = ['oportia-actualizar.sh', 'oportia-comun.sh', 'oportia.sh', 'oportia-servidor.sh', 'oportia-recuperar.sh', 'install.sh', 'oportia-lanzador.sh', 'oportia-orden.sh', 'node.pin', 'jarvis.service', 'oportia-actualizar.service', 'oportia-actualizar.timer'];
const ES_ROOT = process.getuid?.() === 0;
const BASH = ['/bin/bash', '/usr/bin/bash'].find(p => existsSync(p)) ?? null;
const ENV = ['/usr/bin/env', '/bin/env'].find(p => existsSync(p)) ?? null;
const hay = orden => spawnSync(BASH ?? 'sh', ['-c', `command -v ${orden}`], { stdio: 'ignore' }).status === 0;
const comoNadie = ['--reuid', String(NADIE), '--regid', String(NADIE), '--clear-groups'];

let motivo;
// ¿Se pueden correr estas pruebas aquí? → null (sí) o el motivo para saltarlas.
export function motivoParaSaltar() {
  if (motivo !== undefined) return motivo;
  motivo = null;
  if (!BASH || !ENV) motivo = 'no hay bash';
  else if (!hay('flock') || !hay('tar') || !hay('sha256sum') || !hay('realpath')) motivo = 'faltan flock, tar, sha256sum o realpath';
  else if (ES_ROOT) {
    if (!hay('setpriv')) motivo = 'quien corre las pruebas es root y falta setpriv: los programas del servidor nunca se prueban como root';
    else {
      const carpeta = carpetaTemporal('oportia-raiz-prueba');
      execFileSync('chown', [`${NADIE}:${NADIE}`, carpeta]);
      const r = spawnSync('setpriv', [...comoNadie, BASH, '-c', `: > "${carpeta}/puedo" && "${process.execPath}" --version`], { stdio: 'ignore' });
      if (r.status !== 0) motivo = 'quien corre las pruebas es root y «nobody» no puede entrar a la carpeta temporal (o usar node): los programas del servidor nunca se prueban como root';
    }
  }
  return motivo;
}

const FALSOS = {
  systemctl: `
unidad="\${*: -1}"
case "$*" in
  "is-active "*)
    if [ -f "$G/activo.$unidad" ]; then estado="$(cat "$G/activo.$unidad")"
    elif [ "$unidad" = "jarvis" ]; then if [ -e "$G/parado.jarvis" ]; then estado=inactive; else estado=active; fi
    elif [ -e "$G/encendida.$unidad" ]; then estado=active; else estado=inactive; fi
    echo "$estado"; [ "$estado" = active ] ;;
  "is-enabled "*) [ -e "$G/habilitada.$unidad" ] ;;
  "enable --now "*) : > "$G/habilitada.$unidad"; : > "$G/encendida.$unidad"; [ ! -e "$G/falla.enable" ] ;;
  "enable "*) : > "$G/habilitada.$unidad" ;;
  "disable --now "*) rm -f "$G/habilitada.$unidad" "$G/encendida.$unidad" ;;
  "restart jarvis"|"start jarvis")
    rm -f "$G/parado.jarvis" "$G"/salud.n "$G"/salud.v.*.n
    if [ ! -f "$OPORTIA_RAIZ/opt/jarvis/src/server.js" ]; then echo "arranque con el código a medias" >> "$G/problemas"; fi
    sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' "$OPORTIA_RAIZ/opt/jarvis/package.json" 2>/dev/null >> "$G/arranques"
    if [ -x "$G/al-arrancar" ]; then "$G/al-arrancar" "$1"; fi ;;
  "stop jarvis") : > "$G/parado.jarvis"; if [ -x "$G/al-parar" ]; then "$G/al-parar"; fi ;;
  "cat jarvis") cat "$OPORTIA_RAIZ/etc/systemd/system/jarvis.service" 2>/dev/null ;;
  *) : ;;
esac`,
  curl: `
salida=""; url=""; formato=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) salida="$2"; shift ;;
    -w) formato="$2"; shift ;;
    -m|-H|--max-filesize) shift ;;
    http*) url="$1" ;;
  esac
  shift
done
dar() { if [ -n "$salida" ]; then cp "$1" "$salida"; else cat "$1"; fi; }
case "$url" in
  https://api.github.com/repos/*/commits/*) [ -f "$G/github/sha" ] || exit 6; dar "$G/github/sha" ;;
  https://codeload.github.com/*/tar.gz/*) [ -f "$G/github/\${url##*/}.tgz" ] || exit 22; dar "$G/github/\${url##*/}.tgz" ;;
  https://nodejs.org/dist/*) [ -f "$G/nodejs/\${url##*/}" ] || exit 22; dar "$G/nodejs/\${url##*/}" ;;
  https://pkgs.tailscale.com/*) echo "falso" > "$salida" ;;
  http://127.0.0.1:*/api/setup)
    if [ -x "$G/salud-de-verdad" ]; then exec "$G/salud-de-verdad" "$salida" "$url"; fi
    viva="$(sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' "$OPORTIA_RAIZ/opt/jarvis/package.json" 2>/dev/null | head -n 1)"
    f="$G/salud"; if [ -f "$G/salud.v.$viva" ]; then f="$G/salud.v.$viva"; fi
    n="$(cat "$f.n" 2>/dev/null || echo 0)"; n=$((n + 1)); echo "$n" > "$f.n"
    [ -f "$f" ] || { printf '000'; exit 7; }
    linea="$(sed -n "\${n}p" "$f")"; [ -n "$linea" ] || linea="$(tail -n 1 "$f")"
    codigo="\${linea%% *}"
    if [ "$codigo" = "000" ]; then printf '000'; exit 7; fi
    printf '%s' "\${linea#* }" > "$salida"; printf '%s' "$codigo" ;;
  *) echo "curl: dirección inesperada $url" >> "$G/problemas"; exit 6 ;;
esac`,
  setpriv: `
while [ "$#" -gt 0 ]; do case "$1" in --*) shift ;; *) break ;; esac; done
exec "$@"`,
  runuser: `
[ "$1" = "-u" ] && [ "$2" = "jarvis" ] && [ "$3" = "--" ] || { echo "runuser: llamada inesperada" >> "$G/problemas"; exit 1; }
shift 3
exec "$@"`,
  chown: ':',
  chgrp: ':',
  hostnamectl: ':',
  mkswap: ':',
  df: `
printf 'Filesystem 1048576-blocks Used Available Capacity Mounted on\\n/dev/falso 100000 1000 %s 1%% /\\n' "$(cat "$G/df" 2>/dev/null || echo 50000)"`,
  id: '[ "$1" = "jarvis" ] && [ -e "$G/usuario.jarvis" ]',
  useradd: ': > "$G/usuario.${*: -1}"',
  uname: 'cat "$G/uname" 2>/dev/null || echo x86_64',
  swapon: `
if [ "$1" = "--show" ]; then cat "$G/swap" 2>/dev/null || true; else [ ! -e "$G/falla.swapon" ] || exit 1; echo "$1 file 1024M 0B -2" > "$G/swap"; fi`,
  fallocate: ': > "${*: -1}"',
  'apt-get': `
if [ -e "$G/apt-lee-la-entrada" ]; then cat > /dev/null; fi
[ ! -e "$G/falla.apt" ] || exit 100
instalar=no
for a in "$@"; do
  case "$a" in
    install) instalar=si ;;
    -*|update|DPkg*|Dpkg*) ;;
    *) if [ "$instalar" = si ]; then : > "$G/dpkg.$a"; if [ "$a" = "tailscale" ]; then cp "$G/tailscale.plantilla" "$OPORTIA_FALSOS/tailscale"; fi; fi ;;
  esac
done`,
  dpkg: '[ "$1" = "-s" ] && [ -e "$G/dpkg.$2" ]',
  ufw: `
case "$*" in
  status)
    if [ "$(cat "$G/ufw" 2>/dev/null || echo inactive)" = "inactive" ]; then echo "Status: inactive"
    else printf 'Status: active\\n\\nTo                         Action      From\\n--                         ------      ----\\n'; cat "$G/ufw.reglas" 2>/dev/null || true; fi ;;
  "allow in on tailscale0") echo "Anywhere on tailscale0     ALLOW       Anywhere" >> "$G/ufw.reglas" ;;
  "limit 22/tcp") [ -e "$G/ufw-pierde-el-22" ] || echo "22/tcp                     LIMIT       Anywhere" >> "$G/ufw.reglas" ;;
  "allow 41641/udp") echo "41641/udp                  ALLOW       Anywhere" >> "$G/ufw.reglas" ;;
  "--force enable") echo active > "$G/ufw" ;;
  "--force disable") echo inactive > "$G/ufw" ;;
  *) : ;;
esac`,
  ss: '[ -e "$G/sin-el-22" ] || echo "LISTEN 0      128          0.0.0.0:22        0.0.0.0:*"',
  tailscale: `
case "$1 \${2:-}" in
  "status --json") printf '{"BackendState":"%s","Self":{"DNSName":"%s"}}\\n' "$(cat "$G/ts-estado" 2>/dev/null || echo NeedsLogin)" "$(cat "$G/ts-nombre" 2>/dev/null || echo jarvis.cola-falsa.ts.net.)" ;;
  "up "*)
    [ ! -e "$G/falla.ts-up" ] || exit 1
    archivo=""
    for a in "$@"; do case "$a" in --auth-key=file:*) archivo="\${a#--auth-key=file:}" ;; esac; done
    [ -s "$archivo" ] || exit 1
    wc -c < "$archivo" > "$G/ts-clave-largo"
    echo Running > "$G/ts-estado" ;;
  "funnel --bg") if [ -e "$G/funnel-permitido" ]; then echo on > "$G/funnel"; else echo "Funnel is not enabled on your tailnet." >&2; exit 1; fi ;;
  "funnel status") if [ "$(cat "$G/funnel" 2>/dev/null)" = "on" ]; then printf 'https://jarvis.cola-falsa.ts.net (Funnel on)\\n|-- / proxy http://127.0.0.1:8080\\n'; else echo "No serve config"; fi ;;
  "serve --bg") : > "$G/serve" ;;
  "serve status") echo "No serve config" ;;
  "file get") if [ -d "$G/taildrop" ]; then cp "$G/taildrop"/* "\${*: -1}"/; fi ;;
  *) : ;;
esac`,
};

function sha256De(archivo) {
  return execFileSync('sha256sum', [archivo], { encoding: 'utf8' }).split(' ')[0];
}

// Una raíz falsa nueva, con sus comandos falsos y su guion.
export function crearRaiz() {
  const base = carpetaTemporal('oportia-raiz');
  const raiz = join(base, 'raiz');
  const falsos = join(base, 'falsos');
  const guion = join(base, 'guion');
  for (const c of ['opt', 'var/lib', 'var/log', 'etc/systemd/system', 'etc/cron.d', 'usr/local/bin', 'usr/local/sbin', 'usr/local/lib', 'usr/bin', 'run/systemd/system', 'root', 'tmp']) mkdirSync(join(raiz, c), { recursive: true });
  mkdirSync(falsos);
  mkdirSync(join(guion, 'github'), { recursive: true });
  writeFileSync(join(raiz, 'etc/os-release'), 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\n');
  writeFileSync(join(raiz, 'etc/fstab'), '# fstab de la raíz falsa\n');
  for (const [nombre, cuerpo] of Object.entries(FALSOS)) {
    const texto = `#!/bin/bash\n# Comando FALSO de las pruebas de OPORTIA: no toca el sistema.\nG=${JSON.stringify(guion)}\nprintf '%s\\n' "${nombre} $*" >> "$G/llamadas.log"\n${cuerpo.trim()}\n`;
    writeFileSync(join(nombre === 'tailscale' ? guion : falsos, nombre === 'tailscale' ? 'tailscale.plantilla' : nombre), texto, { mode: 0o755 });
  }
  cpSync(join(guion, 'tailscale.plantilla'), join(falsos, 'tailscale'));
  chmodSync(join(falsos, 'tailscale'), 0o755);
  chmodSync(base, 0o755);

  const r = {
    base, raiz, falsos, guion,
    en: (...partes) => join(raiz, ...partes),
    g: (...partes) => join(guion, ...partes),
    // Escribe un archivo del guion (lo que contestan los falsos).
    guionar(nombre, texto = '') { mkdirSync(dirname(join(guion, nombre)), { recursive: true }); writeFileSync(join(guion, nombre), texto); },
    llamadas() { try { return readFileSync(join(guion, 'llamadas.log'), 'utf8').split('\n').filter(Boolean); } catch { return []; } },
    problemas() { try { return readFileSync(join(guion, 'problemas'), 'utf8'); } catch { return ''; } },
    // La salud que contesta la app falsa, respuesta por respuesta: ['503', '200 0.6.0', '000' (no contesta)…]. La última se repite.
    // Con «cuando»: solo mientras la versión viva (la de package.json de la carpeta de la app) sea esa.
    salud(respuestas, cuando = null) {
      const lineas = respuestas.map(x => {
        const [codigo, version] = String(x).split(' ');
        if (codigo === '000') return '000';
        return `${codigo} ${codigo === '200' ? JSON.stringify({ app: 'oportia', version: version ?? '?', base: { estado: 'ok' } }) : JSON.stringify({ error: 'arrancando' })}`;
      });
      writeFileSync(join(guion, cuando ? `salud.v.${cuando}` : 'salud'), `${lineas.join('\n')}\n`);
    },
    // Deja toda la raíz falsa a nombre de «nobody» (solo hace falta si quien corre las pruebas es root).
    duenos() { if (ES_ROOT) execFileSync('chown', ['-R', '-h', `${NADIE}:${NADIE}`, base]); },
    // Corre un programa de deploy/ (o una ruta completa) dentro de la raíz falsa. → { codigo, salida }
    // porEntrada: el programa entra por la ENTRADA de bash (como «curl … | sudo bash -s -- …»).
    correr(programa, argumentos = [], { entorno = {}, modoPrueba = true, entrada = null, tope = 60_000, sinRaiz = false, porEntrada = false } = {}) {
      const ruta = programa.startsWith('/') ? programa : join(DEPLOY, programa);
      const variables = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, TMPDIR: base };
      if (modoPrueba) Object.assign(variables, { OPORTIA_PRUEBA: '1', OPORTIA_FALSOS: falsos, OPORTIA_SALUD_PASO: '0.05', OPORTIA_SALUD_VENTANA_MS: '1500', OPORTIA_SALUD_ESPERA_MS: '1500' });
      if (!sinRaiz) variables.OPORTIA_RAIZ = raiz;
      Object.assign(variables, entorno);
      const pares = Object.entries(variables).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`);
      r.duenos();
      const deBash = porEntrada ? [BASH, '-s', '--', ...argumentos] : [BASH, ruta, ...argumentos];
      const orden = ES_ROOT ? ['setpriv', [...comoNadie, ENV, '-i', ...pares, ...deBash]] : [ENV, ['-i', ...pares, ...deBash]];
      const p = spawnSync(orden[0], orden[1], { encoding: 'utf8', timeout: tope, input: porEntrada ? readFileSync(ruta, 'utf8') : (entrada ?? undefined), cwd: base, maxBuffer: 16 * 1024 * 1024 });
      return { codigo: p.status, senal: p.signal, salida: `${p.stdout ?? ''}${p.stderr ?? ''}` };
    },
    // «GitHub»: publica una versión diminuta de OPORTIA (su tarball) y, si se pide, la deja como la última de main.
    // pruebas: 'pasa' | 'falla' | 'falla-una-vez' | 'cuelga'. deploy: carpeta de donde salen los programas (por defecto, los de verdad).
    publicar(sha, { version = '9.9.9', pruebas = 'pasa', deploy = DEPLOY, enMain = true, cambiar = null, node = '>=22.13' } = {}) {
      const armado = join(base, `armado-${sha.slice(0, 7)}-${Math.random().toString(16).slice(2, 8)}`);
      const p = join(armado, `Jarvis-${sha}`);
      for (const c of ['src', 'public', 'deploy', 'test']) mkdirSync(join(p, c), { recursive: true });
      writeFileSync(join(p, 'src', 'server.js'), `// servidor de mentira de la versión ${version}\n`);
      writeFileSync(join(p, 'public', 'index.html'), `<!doctype html><title>${version}</title>\n`);
      writeFileSync(join(p, 'package.json'), `${JSON.stringify({ name: 'oportia', version, type: 'module', engines: { node } }, null, 2)}\n`);
      for (const n of readdirSync(deploy)) cpSync(join(deploy, n), join(p, 'deploy', n));
      const rastro = join(guion, 'pruebas-corridas');
      const cuerpo = {
        pasa: '',
        falla: "assert.fail('esta versión trae una prueba que falla');",
        'falla-una-vez': "if (String(process.env.TMPDIR).includes('/p1/')) assert.fail('falla solo la primera vez');",
        cuelga: 'await new Promise(listo => setTimeout(listo, 60000));',
      }[pruebas];
      writeFileSync(join(p, 'test', 'x.test.js'), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { appendFileSync } from 'node:fs';\ntest('la prueba de la versión diminuta', async () => {\n  appendFileSync(${JSON.stringify(rastro)}, JSON.stringify({ tmp: process.env.TMPDIR, casa: process.env.HOME, cwd: process.cwd(), claves: Object.keys(process.env).sort() }) + '\\n');\n  ${cuerpo}\n  assert.ok(true);\n});\n`);
      if (cambiar) cambiar(p);
      const tgz = join(guion, 'github', `${sha}.tgz`);
      execFileSync('tar', ['-czf', tgz, '-C', armado, `Jarvis-${sha}`]);
      if (enMain) writeFileSync(join(guion, 'github', 'sha'), `${sha}`);
      return tgz;
    },
    // Deja puesto el actualizador (juego, enlace «actual», lanzador y orden) como lo deja el instalador.
    ponerActualizador(sha7 = 'aaaaaaa', { deploy = DEPLOY } = {}) {
      const lib = join(raiz, 'usr/local/lib/oportia');
      const juego = join(lib, `v-${sha7}`);
      mkdirSync(juego, { recursive: true });
      for (const n of JUEGO) { cpSync(join(deploy, n), join(juego, n)); chmodSync(join(juego, n), n.endsWith('.sh') ? 0o755 : 0o644); }
      writeFileSync(join(juego, '.completa'), '');
      if (!existsSync(join(lib, 'actual'))) symlinkSync(`v-${sha7}`, join(lib, 'actual'));
      cpSync(join(deploy, 'oportia-lanzador.sh'), join(lib, 'oportia-lanzador.sh'));
      cpSync(join(deploy, 'oportia-orden.sh'), join(raiz, 'usr/local/sbin/oportia'));
      for (const c of ['var/lib/oportia-actualizador', 'var/lib/jarvis']) mkdirSync(join(raiz, c), { recursive: true });
      return juego;
    },
    // Una app ya instalada (de mentira) en la carpeta de la app, con su .env.
    ponerApp({ version = '1.0.0', sha = null, marca = true, env = 'PORT=8080\nHOST=0.0.0.0\n' } = {}) {
      const opt = join(raiz, 'opt/jarvis');
      for (const c of ['src', 'public', 'deploy']) mkdirSync(join(opt, c), { recursive: true });
      writeFileSync(join(opt, 'src', 'server.js'), `// servidor de mentira de la versión ${version}\n`);
      writeFileSync(join(opt, 'public', 'index.html'), `<!doctype html><title>${version}</title>\n`);
      writeFileSync(join(opt, 'package.json'), `${JSON.stringify({ name: 'oportia', version, type: 'module' }, null, 2)}\n`);
      writeFileSync(join(opt, '.env'), env);
      if (marca) writeFileSync(join(opt, '.oportia-codigo'), '');
      mkdirSync(join(raiz, 'var/lib/jarvis'), { recursive: true });
      if (sha) writeFileSync(join(raiz, 'var/lib/jarvis/version.txt'), `${sha}\n`);
      cpSync(join(DEPLOY, 'jarvis.service'), join(raiz, 'etc/systemd/system/jarvis.service'));
      return opt;
    },
    // Los programas del instalador en su carpeta de root (como los deja cloud-init.sh): …/oportia-instalador-<sha7>/deploy
    ponerInstalador(sha7 = 'abc1234', { deploy = DEPLOY } = {}) {
      const carpeta = join(raiz, 'root', `oportia-instalador-${sha7}`);
      mkdirSync(join(carpeta, 'deploy'), { recursive: true });
      for (const n of readdirSync(deploy)) cpSync(join(deploy, n), join(carpeta, 'deploy', n));
      cpSync(join(REPO, 'package.json'), join(carpeta, 'package.json'));
      return join(carpeta, 'deploy');
    },
    // La app DE VERDAD en la carpeta de la app (enlaces al repositorio) con su .env apuntando a la carpeta de datos falsa.
    ponerCodigoReal({ puerto = 8080 } = {}) {
      const opt = join(raiz, 'opt/jarvis');
      mkdirSync(opt, { recursive: true });
      for (const n of ['src', 'public', 'package.json']) symlinkSync(join(REPO, n), join(opt, n));
      cpSync(DEPLOY, join(opt, 'deploy'), { recursive: true }); // copia de verdad: los programas de la consola miran su propia ruta
      mkdirSync(join(raiz, 'var/lib/jarvis'), { recursive: true });
      writeFileSync(join(opt, '.env'), `PORT=${puerto}\nHOST=127.0.0.1\nDB_PATH=${join(raiz, 'var/lib/jarvis/jarvis.db')}\n`);
      cpSync(join(DEPLOY, 'jarvis.service'), join(raiz, 'etc/systemd/system/jarvis.service'));
      return opt;
    },
    estado() { try { return JSON.parse(readFileSync(join(raiz, 'var/lib/oportia-actualizador/ultima-corrida.json'), 'utf8')); } catch { return null; } },
    leer(...partes) { try { return readFileSync(join(raiz, ...partes), 'utf8'); } catch { return null; } },
    sha256: sha256De,
  };
  return r;
}

export const sha = letra => String(letra).repeat(40).slice(0, 40);
