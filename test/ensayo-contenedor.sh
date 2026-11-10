#!/bin/bash
# Ensayo de la parte 1f en un contenedor Ubuntu DESECHABLE (no es parte de la suite). Hace falta docker y python3.
#   bash test/ensayo-contenedor.sh
#
# DE VERDAD dentro del contenedor (modo real de los programas, como root): cloud-init.sh → install.sh, apt-get, useradd,
# Node bajado de nodejs.org y comprobado con la huella fija de deploy/node.pin, las carpetas y sus dueños, el actualizador
# (pruebas de la app como «nobody», instalar al lado, salud contra la app de verdad corriendo como «jarvis», vuelta atrás),
# la segunda corrida del instalador, y «oportia recuperar» en una terminal de verdad con una copia hecha por la tarea
# de la app. DE MENTIRA: systemd (un systemctl de ensayo que enciende y apaga la app con todo su grupo de procesos),
# ufw y Tailscale (comandos falsos), y GitHub (un curl que sirve las versiones desde archivos locales: nunca se
# contacta a GitHub ni a Tailscale). cloud-init de DigitalOcean y un servidor de 512 MB tampoco se prueban aquí.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
IMAGEN="${1:-ubuntu:24.04}"
NOMBRE="oportia-ensayo-$$"
T="$(mktemp -d "${TMPDIR:-/tmp}/oportia-ensayo.XXXXXX")"
E="$T/ensayo"
A="$(printf 'a%.0s' {1..40})"; B="$(printf 'b%.0s' {1..40})"; C="$(printf 'c%.0s' {1..40})"; D="$(printf 'd%.0s' {1..40})"
BIEN=0
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$REPO/package.json" | head -n 1)"

terminar() {
  local codigo=$?
  docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
  rm -rf -- "$T"
  if [ "$codigo" -eq 0 ]; then echo "ENSAYO EN CONTENEDOR: $BIEN comprobaciones, todas bien."; else echo "ENSAYO EN CONTENEDOR: FALLÓ (código $codigo) después de $BIEN comprobaciones."; fi
  exit "$codigo"
}
trap terminar EXIT

en() { docker exec "$NOMBRE" "$@"; }
bien() { BIEN=$((BIEN + 1)); echo "  ✔ $1"; }
mal() { echo "  ✖ $1"; exit 1; }
comprobar() { local que="$1" visto; shift; if visto="$("$@" 2>&1)"; then bien "$que"; else printf '%s\n' "$visto" | tail -n 20; mal "$que"; fi; }
contiene() { local que="$1" texto="$2" patron="$3"; if grep -qE -- "$patron" <<< "$texto"; then bien "$que"; else echo "$texto" | tail -n 40; mal "$que"; fi; }

echo "== Preparo las versiones (GitHub de mentira) =="
mkdir -p "$E/github" "$E/falsos" "$E/taildrop"
empaquetar() {  # <sha> <función que cambia el árbol>
  local sha="$1" cambio="$2" p="$T/arbol-$1/Jarvis-$1"
  mkdir -p "$p"
  (cd "$REPO" && tar -c --exclude=.git --exclude=node_modules .) | tar -x -C "$p"
  "$cambio" "$p"
  tar -czf "$E/github/$sha.tgz" -C "$T/arbol-$sha" "Jarvis-$sha"
}
pocas_pruebas() { rm -rf -- "$1/test"; mkdir "$1/test"; printf '%s\n' "import { test } from 'node:test';" "import assert from 'node:assert/strict';" "test('una prueba', () => { assert.ok($2); });" > "$1/test/una.test.js"; }
igual() { :; }
con_prueba_que_falla() { pocas_pruebas "$1" false; }
que_nunca_arranca() {
  pocas_pruebas "$1" true
  printf '%s\n' "import { createServer } from 'node:http';" "createServer((req, res) => { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{\"error\":\"arrancando\"}'); }).listen(Number(process.env.PORT || 8080), '127.0.0.1');" > "$1/src/server.js"
}
con_actualizador_nuevo() { pocas_pruebas "$1" true; printf '\n# un cambio del actualizador (ensayo)\n' >> "$1/deploy/oportia-servidor.sh"; }
empaquetar "$A" igual
empaquetar "$B" con_prueba_que_falla
empaquetar "$C" que_nunca_arranca
empaquetar "$D" con_actualizador_nuevo
printf '%s' "$A" > "$E/github/sha"
cp "$REPO/deploy/cloud-init.sh" "$E/cloud-init.sh"
if [ -n "${CURL_CA_BUNDLE:-${SSL_CERT_FILE:-}}" ] && [ -f "${CURL_CA_BUNDLE:-${SSL_CERT_FILE:-}}" ]; then cp "${CURL_CA_BUNDLE:-$SSL_CERT_FILE}" "$E/ca.crt"; elif [ -f /root/.ccr/ca-bundle.crt ]; then cp /root/.ccr/ca-bundle.crt "$E/ca.crt"; fi

cat > "$E/falsos/systemctl" <<'EOF'
#!/bin/bash
# systemctl de ENSAYO: enciende y apaga la app de verdad (como «jarvis», con todo su grupo de procesos).
R=/run/ensayo; mkdir -p "$R"; echo "systemctl $*" >> "$R/llamadas.log"
u="${*: -1}"
vivo() { [ -f "$R/jarvis.pid" ] && kill -0 "$(cat "$R/jarvis.pid")" 2>/dev/null; }
parar() {
  if vivo; then
    p="$(cat "$R/jarvis.pid")"; kill -TERM -- "-$p" 2>/dev/null
    for _ in $(seq 1 150); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done
    kill -KILL -- "-$p" 2>/dev/null
  fi
  rm -f "$R/jarvis.pid"
}
arrancar() {
  vivo && return 0
  [ -f /opt/jarvis/src/server.js ] || { echo "arranque sin código" >> "$R/problemas"; return 0; }
  ( cd /opt/jarvis && set -a && . /opt/jarvis/.env && set +a && exec setsid runuser -u jarvis -- /usr/bin/node --no-warnings src/server.js >> /var/log/jarvis-ensayo.log 2>&1 </dev/null ) &
  echo $! > "$R/jarvis.pid"
}
case "$*" in
  "is-active jarvis") if vivo; then echo active; else echo inactive; exit 3; fi ;;
  "is-active "*) if [ -e "$R/encendida.$u" ]; then echo active; else echo inactive; exit 3; fi ;;
  "is-enabled "*) [ -e "$R/habilitada.$u" ] ;;
  "enable --now "*) : > "$R/habilitada.$u"; : > "$R/encendida.$u" ;;
  "enable "*) : > "$R/habilitada.$u" ;;
  "disable --now "*) rm -f "$R/habilitada.$u" "$R/encendida.$u" ;;
  "start jarvis") arrancar ;;
  "restart jarvis") parar; arrancar ;;
  "stop jarvis") parar ;;
  "cat jarvis") cat /etc/systemd/system/jarvis.service ;;
  *) : ;;
esac
EOF
cat > "$E/falsos/curl" <<'EOF'
#!/bin/bash
# curl de ENSAYO: GitHub sale de archivos locales (nunca se contacta); todo lo demás es el curl de verdad.
salida=""; url=""
args=("$@")
while [ "$#" -gt 0 ]; do case "$1" in -o) salida="$2"; shift ;; http*) url="$1" ;; esac; shift; done
dar() { if [ -n "$salida" ]; then cp "$1" "$salida"; else cat "$1"; fi; }
case "$url" in
  https://api.github.com/*) [ -f /ensayo/github/sha ] || exit 6; dar /ensayo/github/sha ;;
  https://codeload.github.com/*) [ -f "/ensayo/github/${url##*/}.tgz" ] || exit 22; dar "/ensayo/github/${url##*/}.tgz" ;;
  *github*|*tailscale*) echo "curl de ensayo: dirección prohibida $url" >&2; exit 6 ;;
  *) exec /usr/bin/curl "${args[@]}" ;;
esac
EOF
cat > "$E/falsos/tailscale" <<'EOF'
#!/bin/bash
# tailscale de ENSAYO (nunca se contacta a Tailscale): sin unir; «file get» entrega los archivos de /ensayo/taildrop.
echo "tailscale $*" >> /run/ensayo/llamadas.log
case "$1 ${2:-}" in
  "status --json") echo '{"BackendState":"NeedsLogin","Self":{"DNSName":""}}' ;;
  "file get") cp /ensayo/taildrop/* "${*: -1}"/ ;;
  "funnel status"|"serve status") echo "No serve config" ;;
  *) exit 1 ;;
esac
EOF
cat > "$E/falsos/ufw" <<'EOF'
#!/bin/bash
# ufw de ENSAYO: solo anota.
R=/run/ensayo; mkdir -p "$R"; echo "ufw $*" >> "$R/llamadas.log"
case "$*" in
  status) if [ -e "$R/ufw-activo" ]; then printf 'Status: active\n\n'; cat "$R/ufw-reglas" 2>/dev/null; else echo "Status: inactive"; fi ;;
  "allow in on tailscale0") echo "Anywhere on tailscale0     ALLOW       Anywhere" >> "$R/ufw-reglas" ;;
  "limit 22/tcp") echo "22/tcp                     LIMIT       Anywhere" >> "$R/ufw-reglas" ;;
  "--force enable") : > "$R/ufw-activo" ;;
  "--force disable") rm -f "$R/ufw-activo" ;;
  *) : ;;
esac
EOF
chmod 755 "$E/falsos"/*

echo "== Enciendo el contenedor ($IMAGEN) =="
RED=()
if [ -n "${HTTPS_PROXY:-}" ]; then RED=(--network host -e "HTTPS_PROXY=$HTTPS_PROXY" -e "https_proxy=$HTTPS_PROXY" -e CURL_CA_BUNDLE=/ensayo/ca.crt -e NODE_EXTRA_CA_CERTS=/ensayo/ca.crt); fi
# (--init: un proceso 1 que recoge a los procesos terminados, como hace systemd en un servidor)
docker run -d --init --name "$NOMBRE" "${RED[@]}" -v "$E:/ensayo:ro" "$IMAGEN" sleep infinity >/dev/null
en bash -c 'cp /ensayo/falsos/* /usr/local/bin/ && mkdir -p /run/systemd/system /run/ensayo'
if [ -n "${HTTPS_PROXY:-}" ]; then
  # (solo para el ensayo detrás de un proxy: apt por https y con su certificado)
  en bash -c 'printf "Acquire::https::Proxy \"%s\";\nAcquire::https::CaInfo \"/ensayo/ca.crt\";\n" "$HTTPS_PROXY" > /etc/apt/apt.conf.d/99ensayo && sed -i "s|http://|https://|g" /etc/apt/sources.list.d/ubuntu.sources'
fi

echo "== 1. Instalación completa con el texto de instalación (por la ENTRADA, como «curl … | sudo bash») =="
SALIDA="$(docker exec -i "$NOMBRE" bash -s < "$E/cloud-init.sh" 2>&1)" || { echo "$SALIDA" | tail -n 60; en tail -n 40 /var/lib/oportia-actualizador/ultima-prueba-fallida.log 2>/dev/null || true; mal "la instalación terminó mal"; }
echo "$SALIDA" | sed -n '/==== OPORTIA ====/,$p'
contiene "Node bajado de nodejs.org y su huella comprobada" "$SALIDA" 'Node 22\.[0-9.]+: instalado \(huella comprobada\)'
contiene "la app quedó instalada y sana (sus pruebas corrieron antes)" "$SALIDA" 'La app: instalada y sana \(versión aaaaaaa\)'
contiene "Tailscale quedó pendiente con su orden de una línea" "$SALIDA" 'Tailscale: pendiente.*sudo oportia tailscale'
comprobar "el usuario jarvis existe y no puede entrar" en bash -c 'getent passwd jarvis | grep -q nologin'
comprobar "la carpeta de datos es de jarvis y cerrada (750)" en bash -c '[ "$(stat -c "%U:%G %a" /var/lib/jarvis)" = "jarvis:jarvis 750" ]'
comprobar "el .env es root:jarvis 640" en bash -c '[ "$(stat -c "%U:%G %a" /opt/jarvis/.env)" = "root:jarvis 640" ]'
comprobar "el código es de root y jarvis no puede escribirlo" en bash -c '[ "$(stat -c "%U %a" /opt/jarvis/src)" = "root 755" ] && ! runuser -u jarvis -- touch /opt/jarvis/src/x 2>/dev/null'
comprobar "la app corre como jarvis (servidor y trabajador)" en bash -c '[ "$(ps -eo user:20,args | grep -c "^jarvis .*node")" -ge 2 ]'
comprobar "la app contesta 200 como OPORTIA $VERSION" en bash -c 'r="$(/usr/bin/curl -fsS http://127.0.0.1:8080/api/setup)" && grep -q "\"app\":\"oportia\"" <<< "$r" && grep -q "\"version\":\"'"$VERSION"'\"" <<< "$r" || { echo "$r"; exit 1; }'
comprobar "las pruebas de la app corrieron como nobody (y pasaron)" en bash -c 'grep -q "actualizado a aaaaaaa" /var/lib/jarvis/update.log && [ ! -e /var/lib/jarvis/version.bad ]'
comprobar "no quedó ninguna carpeta de corrida en la carpeta temporal" en bash -c '! ls -d /tmp/oportia-corrida.* 2>/dev/null | grep -q .'
comprobar "la orden corta existe y dice el estado" en bash -c 'oportia estado | grep -q "La app contesta:.*sí"'
comprobar "el temporizador quedó encendido y el juego puesto" en bash -c '[ -e /run/ensayo/habilitada.oportia-actualizar.timer ] && [ "$(readlink /usr/local/lib/oportia/actual)" = "v-aaaaaaa" ]'
comprobar "el estado publicado lo puede leer jarvis" en bash -c 'runuser -u jarvis -- cat /var/lib/jarvis/actualizador.json | grep -q "\"resultado\":\"actualizado\""'
comprobar "sin root la orden se niega y dice que falta sudo" en bash -c 'runuser -u nobody -- /usr/local/sbin/oportia estado 2>&1 | grep -q "sudo"'

echo "== 2. Datos de verdad, y el instalador otra vez (no debe tocar nada) =="
en bash -c 'cd /opt/jarvis && runuser -u jarvis -- /usr/bin/node --no-warnings deploy/oportia-admin.mjs junior' >/dev/null
ANTES="$(en bash -c 'sha256sum /opt/jarvis/.env /etc/systemd/system/jarvis.service /var/lib/jarvis/version.txt /var/lib/jarvis/update.log /etc/fstab; stat -c "%U:%G %a %n" /var/lib/jarvis /opt/jarvis /opt/jarvis/.env /var/lib/jarvis/oportia.db; ls /var/lib/jarvis | grep -v -- "-wal\|-shm"; cd /opt/jarvis && runuser -u jarvis -- /usr/bin/node --no-warnings deploy/oportia-base.mjs /var/lib/jarvis/oportia.db')"
SALIDA="$(en bash /root/oportia-instalador-aaaaaaa/deploy/install.sh "--sha=$A" 2>&1)" || { echo "$SALIDA" | tail -n 40; mal "la segunda corrida terminó mal"; }
DESPUES="$(en bash -c 'sha256sum /opt/jarvis/.env /etc/systemd/system/jarvis.service /var/lib/jarvis/version.txt /var/lib/jarvis/update.log /etc/fstab; stat -c "%U:%G %a %n" /var/lib/jarvis /opt/jarvis /opt/jarvis/.env /var/lib/jarvis/oportia.db; ls /var/lib/jarvis | grep -v -- "-wal\|-shm"; cd /opt/jarvis && runuser -u jarvis -- /usr/bin/node --no-warnings deploy/oportia-base.mjs /var/lib/jarvis/oportia.db')"
contiene "la segunda corrida reconoce el servidor y no toca la app" "$SALIDA" 'La app: ya estaba instalada, no la toqué'
contiene "la segunda corrida no toca los paquetes ni Node ni el usuario" "$(grep -c 'ya estaba' <<< "$SALIDA")" '^([5-9]|1[0-9])$'
if [ "$ANTES" = "$DESPUES" ]; then bien "datos, configuración, dueños y permisos idénticos tras instalar otra vez (1 usuario en la base)"; else diff <(echo "$ANTES") <(echo "$DESPUES") || true; mal "algo cambió en la segunda corrida"; fi
comprobar "la segunda corrida no reinició la app" en bash -c '[ "$(grep -c "restart jarvis" /run/ensayo/llamadas.log)" = "1" ]'

actualizar() { printf '%s' "$1" > "$E/github/sha"; en oportia actualizar 2>&1; }
echo "== 3. Una versión cuyas pruebas fallan =="
SALIDA="$(actualizar "$B")"
contiene "no se instaló" "$SALIDA" 'no pasó sus pruebas: NO se instaló'
comprobar "línea exacta, version.bad, y la app sigue en la de antes y sana" en bash -c 'tail -n 1 /var/lib/jarvis/update.log | grep -qE "^\S+ versión bbbbbbb: alguna prueba falló, NO se instaló$" && [ "$(cat /var/lib/jarvis/version.bad)" = "'"$B"'" ] && [ "$(cat /var/lib/jarvis/version.txt)" = "'"$A"'" ] && /usr/bin/curl -fsS http://127.0.0.1:8080/api/setup >/dev/null'
comprobar "el registro de la prueba fallida quedó guardado (solo root)" en bash -c '[ "$(stat -c %a /var/lib/oportia-actualizador/ultima-prueba-fallida.log)" = "600" ]'

echo "== 4. Una versión que pasa sus pruebas pero nunca queda sana → vuelta atrás =="
SALIDA="$(actualizar "$C")"
contiene "volvió al código anterior" "$SALIDA" 'no arrancó bien: vuelvo al código anterior'
comprobar "línea exacta, version.bad, el código anterior de vuelta y la app sana otra vez" en bash -c 'grep -qE "^\S+ versión ccccccc no arrancó: volví a la anterior$" /var/lib/jarvis/update.log && [ "$(cat /var/lib/jarvis/version.bad)" = "'"$C"'" ] && [ "$(cat /var/lib/jarvis/version.txt)" = "'"$A"'" ] && grep -q "abrirBase" /opt/jarvis/src/server.js && /usr/bin/curl -fsS http://127.0.0.1:8080/api/setup | grep -q oportia'
comprobar "estado «revertida», sin carpetas a medias, y los datos siguen (1 usuario)" en bash -c 'grep -q "\"resultado\":\"revertida\"" /var/lib/jarvis/actualizador.json && [ ! -e /opt/jarvis.mala ] && [ ! -e /opt/jarvis.previa ] && [ ! -e /opt/jarvis.nueva ] && cd /opt/jarvis && runuser -u jarvis -- /usr/bin/node --no-warnings deploy/oportia-base.mjs /var/lib/jarvis/oportia.db | grep -q "^base 1 "'
# (Todo lo que corre como «jarvis» debe ser del servicio de AHORA: su misma sesión. La app puede tener más de dos procesos un momento.)
comprobar "al apagar la versión mala no quedó ningún proceso suyo" en bash -c 'p="$(cat /run/ensayo/jarvis.pid)"; ps -eo user:20,sid,pid,etime,args | grep "^jarvis " | grep -v "<defunct>" > /tmp/de-jarvis.txt; [ "$(grep -c node /tmp/de-jarvis.txt)" -ge 2 ] && ! awk -v p="$p" "\$2 != p" /tmp/de-jarvis.txt | grep -q . || { echo "servicio $p"; cat /tmp/de-jarvis.txt; exit 1; }'

echo "== 5. Una versión buena con el actualizador cambiado → se instala y el actualizador se renueva =="
SALIDA="$(actualizar "$D")"
contiene "quedó instalada" "$SALIDA" 'Quedó instalada y sana la versión ddddddd'
comprobar "el juego nuevo es el actual y el de antes quedó guardado" en bash -c '[ "$(readlink /usr/local/lib/oportia/actual)" = "v-ddddddd" ] && [ "$(readlink /usr/local/lib/oportia/anterior)" = "v-aaaaaaa" ] && [ -d /opt/jarvis.anterior ]'
comprobar "la corrida siguiente (con el actualizador nuevo) dice «al día»" en bash -c 'oportia actualizar | grep -q "Ya tienes la última versión"'

echo "== 6. Recuperar: una copia hecha por la tarea de la app, traída por «archivos», en una terminal de verdad =="
cat > "$T/copia.mjs" <<'EOF'
// Hace una copia con la TAREA de verdad de la app (copias.hacer, contra el Telegram falso de las pruebas).
import { readdirSync, statSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { montar } = await import(`${process.argv[2]}/test/copias-tarea-base.js`);
const b = await montar({ relleno: 8 });
const t = await b.terminar(b.pedir());
if (t.estado !== 'hecha') throw new Error(`la copia quedó ${t.estado}`);
const lista = [];
(function ver(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) ver(p); else lista.push(p); } })(join(b.config.carpetaCopias, 'cifradas'));
for (const p of lista) cpSync(p, join(process.argv[3], p.split('/').pop()));
writeFileSync(join(process.argv[3], 'clave.txt'), b.claveTexto);
process.exit(0);
EOF
docker cp "$T/copia.mjs" "$NOMBRE:/tmp/copia.mjs" >/dev/null
en bash -c 'mkdir -p /tmp/copia-hecha /tmp/copia-t && chown nobody /tmp/copia-hecha /tmp/copia-t && tar -xzf /ensayo/github/'"$A"'.tgz -C /tmp && cd /tmp/Jarvis-'"$A"' && runuser -u nobody -- env TMPDIR=/tmp/copia-t /usr/bin/node --no-warnings /tmp/copia.mjs /tmp/Jarvis-'"$A"' /tmp/copia-hecha'
CLAVE="$(en cat /tmp/copia-hecha/clave.txt)"
en bash -c 'rm -f /usr/local/bin/tailscale && printf "%s\n" "#!/bin/bash" "case \"\$1 \${2:-}\" in \"status --json\") echo {} ;; \"file get\") cp /tmp/copia-hecha/*.opc /tmp/copia-hecha/*-indice.txt \"\${*: -1}\"/ ;; *) exit 1 ;; esac" > /usr/local/bin/tailscale && chmod 755 /usr/local/bin/tailscale'
SALIDA="$(CLAVE="$CLAVE" NOMBRE="$NOMBRE" python3 - <<'PY'
import os, pty, re, select, sys, time
clave, nombre = os.environ['CLAVE'], os.environ['NOMBRE']
pid, fd = pty.fork()
if pid == 0:
    os.execvp('docker', ['docker', 'exec', '-it', nombre, 'oportia', 'recuperar'])
pasos = [(r'escribe APARTAR', 'APARTAR'), (r'Escribe 1 o 2', '2'), (r'Pulsa Enter cuando ya los hayas mandado', ''), (r'clave de recuperaci.n \(no se muestra\)', clave)]
texto, fin = '', time.time() + 600
while time.time() < fin:
    r, _, _ = select.select([fd], [], [], 1)
    if not r:
        continue
    try:
        dato = os.read(fd, 4096)
    except OSError:
        break
    if not dato:
        break
    texto += dato.decode('utf-8', 'replace')
    if pasos and re.search(pasos[0][0], texto):
        time.sleep(0.5)
        os.write(fd, (pasos[0][1] + '\r').encode())
        texto += '\n<<respondido: %s>>\n' % pasos[0][0]
        pasos.pop(0)
_, estado = os.waitpid(pid, 0)
sys.stdout.write(texto.replace(clave, '<<LA CLAVE SE VIO EN LA PANTALLA>>'))
sys.stdout.write('\n<<salida %d>>\n' % os.waitstatus_to_exitcode(estado))
PY
)"
echo "$SALIDA" | tr -d '\r' | grep -vE '^\s*$' | tail -n 22
contiene "avisó de los datos que había y pidió la palabra" "$SALIDA" 'YA tiene datos \(1 usuarios'
contiene "recuperar terminó bien" "$SALIDA" '<<salida 0>>'
contiene "dijo que los datos volvieron y qué hacer después" "$SALIDA" 'Tus datos volvieron'
if grep -q 'LA CLAVE SE VIO' <<< "$SALIDA"; then mal "la clave de recuperación se vio en la pantalla"; else bien "la clave de recuperación nunca se vio en la pantalla"; fi
comprobar "la base que había quedó apartada (no borrada) y la recuperada está en su sitio, de jarvis" en bash -c 'ls -d /var/lib/jarvis/apartado-*/oportia.db >/dev/null && [ "$(stat -c %U /var/lib/jarvis/oportia.db)" = "jarvis" ]'
comprobar "la app arrancó con la base recuperada y contesta sana" en bash -c '/usr/bin/curl -fsS http://127.0.0.1:8080/api/setup | grep -q "\"necesitaAdmin\":false"'
comprobar "la base recuperada trae la marca «recuperada» (Claves pedirá pegar otra vez)" en bash -c 'cd /opt/jarvis && runuser -u jarvis -- /usr/bin/node --no-warnings -e "const { DatabaseSync } = require(\"node:sqlite\"); const d = new DatabaseSync(\"/var/lib/jarvis/oportia.db\", { readOnly: true }); process.exit(d.prepare(\"SELECT 1 AS s FROM ajustes WHERE clave = ?\").get(\"claves.restaurada\") ? 0 : 1)"'
comprobar "probar-copia no existe a medias: la orden está y las ayudas salen" en bash -c 'oportia ayuda | grep -q "probar-copia"'
comprobar "ningún comando de ensayo anotó un problema" en bash -c '[ ! -s /run/ensayo/problemas ]'
comprobar "nunca se intentó contactar a GitHub ni a Tailscale de verdad" en bash -c '! grep -rq "dirección prohibida" /var/log /var/lib/oportia-actualizador 2>/dev/null'
exit 0
