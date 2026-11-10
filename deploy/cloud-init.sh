#!/bin/bash
# OPORTIA: instalación automática en un Droplet NUEVO de DigitalOcean (Ubuntu 24.04). Tarda unos 15 minutos.
# Antes de pegarlo: cambia PEGA_AQUI por tu clave de Tailscale (una «Auth key» de UN solo uso; empieza con tskey-auth-).
TS_AUTHKEY="PEGA_AQUI"
REPO="junior17281728jr-bot/Jarvis"

# De aquí para abajo no hay nada que cambiar. Este texto solo baja OPORTIA de GitHub (una versión exacta) y corre su
# instalador (deploy/install.sh), que es idempotente y nunca borra ni pisa datos. También sirve con una palabra al final:
#   curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/cloud-init.sh | sudo bash -s -- revisar
#   (revisar · pasar · --solo-actualizador y las demás opciones de install.sh)
set -euo pipefail
IFS=$'\n\t'
umask 077
export LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
if [ "${OPORTIA_PRUEBA:-}" != "1" ]; then PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
export PATH
RAIZ="${OPORTIA_RAIZ:-}"
REGISTRO="$RAIZ/var/log/oportia-instalar.log"
D=""

decir() {
  printf '%s\n' "$*"
  printf '%s %s\n' "$(date -Is)" "$*" >> "$REGISTRO" 2>/dev/null || true
}

fallar() {
  decir "✖ $*"
  exit 1
}

sistema() {
  local orden="$1"
  shift
  case "$orden" in
    apt-get|curl) ;;
    *) fallar "orden no permitida: $orden" ;;
  esac
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    [ -x "$OPORTIA_FALSOS/$orden" ] || fallar "falta el comando falso $orden"
    "$OPORTIA_FALSOS/$orden" "$@"
  else
    "$orden" "$@"
  fi
}

# El único borrado: la carpeta temporal PROPIA donde estuvo la clave (se vacía antes).
borrar_lo_mio() {
  if [ -n "$D" ] && [ -d "$D" ] && [ ! -L "$D" ] && [[ "$D" =~ ^"$RAIZ/root"/oportia-clave\.[A-Za-z0-9]{6}$ ]]; then
    if [ -f "$D/clave" ] && [ ! -L "$D/clave" ]; then : > "$D/clave"; fi
    rm -rf --one-file-system -- "$D"
  fi
}

al_salir() {
  local codigo=$?
  trap - EXIT
  borrar_lo_mio || true
  exit "$codigo"
}

revisar_modo() {
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    if [ -z "$RAIZ" ] || [ -z "${OPORTIA_FALSOS:-}" ] || [ ! -d "${OPORTIA_FALSOS:-}" ]; then echo "Modo de prueba incompleto; no hice nada." >&2; exit 1; fi
    case "$(realpath -- "$RAIZ")" in
      "$(realpath -- "${TMPDIR:-$RAIZ/tmp}")"/?*) return 0 ;;
    esac
    echo "La raíz de prueba no está en la carpeta temporal; no hice nada." >&2
    exit 1
  fi
  # De verdad: nunca desde una copia del repositorio (la carpeta de una prueba, o la carpeta de la app).
  if [ -n "$RAIZ" ] || { [ -f "$0" ] && [ -e "$(dirname -- "$0")/oportia-actualizar.sh" ]; }; then
    echo "Este texto se pega al crear el servidor, o se corre con la línea de curl; no hice nada." >&2
    exit 1
  fi
  if [ "$EUID" != "0" ]; then echo "Hace falta ser administrador (sudo); no hice nada." >&2; exit 1; fi
}

# Quita espacios, saltos y comillas (rectas o curvas: el iPhone las cambia) de los extremos.
limpiar() {
  local t="$1" q cambio=si
  t="${t//[$' \t\r\n']/}"
  while [ "$cambio" = si ]; do
    cambio=no
    # shellcheck disable=SC1112
    for q in '"' "'" '“' '”' '‘' '’' '«' '»'; do
      if [[ "$t" == "$q"* ]]; then t="${t#"$q"}"; cambio=si; fi
      if [[ "$t" == *"$q" ]]; then t="${t%"$q"}"; cambio=si; fi
    done
  done
  printf '%s' "$t"
}

intentar() {
  local veces="$1" pausa="$2" n=1
  shift 2
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then pausa=0; fi
  until "$@"; do
    if [ "$n" -ge "$veces" ]; then return 1; fi
    n=$((n + 1))
    sleep "$pausa"
  done
}

pedir_sha() {
  SHA="$(sistema curl -fsSL -m 30 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/main" 2>/dev/null)" || return 1
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]
}

principal() {
  local clave="$TS_AUTHKEY" argumento modo="instalar" carpeta codigo=0 aviso_clave="" destino
  local -a opciones=()
  unset TS_AUTHKEY
  revisar_modo
  for argumento in "$@"; do
    case "$argumento" in
      revisar|pasar) modo="$argumento" ;;
      --*) opciones+=("$argumento") ;;
      *) echo "No entiendo «$argumento». Va sin nada, o con: revisar · pasar · --solo-actualizador (u otra opción de install.sh)." >&2; exit 2 ;;
    esac
  done
  mkdir -p -- "$RAIZ/var/log" "$RAIZ/root"
  touch -- "$REGISTRO"
  chmod 600 "$REGISTRO"
  trap al_salir EXIT
  if [ "$#" -eq 0 ]; then
    if [ -e "$RAIZ/var/lib/oportia-actualizador/instalado" ]; then
      decir "OPORTIA ya está instalado en este servidor: no hice nada."
      exit 0
    fi
    # 1) La clave de Tailscale: a un archivo propio (600), nunca a la pantalla, al registro ni a la línea de una orden.
    clave="$(limpiar "$clave")"
    if [ "$clave" != "PEGA_AQUI" ] && [ -n "$clave" ]; then
      if [[ "$clave" =~ ^tskey-[a-z]+-[A-Za-z0-9-]+$ ]]; then
        D="$(mktemp -d "$RAIZ/root/oportia-clave.XXXXXX")"
        printf '%s' "$clave" > "$D/clave"
        chmod 600 "$D/clave"
        opciones+=("--clave-tailscale=$D/clave")
      else
        aviso_clave="⚠ La clave de Tailscale que pegaste no tiene la forma correcta (debe empezar con tskey-auth-). El servidor quedó instalado pero SIN Tailscale. Crea otra clave y corre: sudo oportia tailscale"
        decir "$aviso_clave"
      fi
    fi
  fi
  clave=""

  # 2) Lo mínimo para bajar (al arrancar, el sistema puede tener ocupado el instalador de paquetes: se espera).
  if ! command -v tar >/dev/null 2>&1 || { [ "${OPORTIA_PRUEBA:-}" != "1" ] && ! command -v curl >/dev/null 2>&1; }; then
    intentar 3 20 sistema apt-get -o DPkg::Lock::Timeout=600 update || fallar "No pude actualizar la lista de paquetes"
    intentar 3 20 sistema apt-get -o DPkg::Lock::Timeout=600 install -y ca-certificates curl tar || fallar "No pude instalar curl y tar"
  fi

  # 3) y 4) La versión EXACTA de main, y su código a una carpeta de root.
  SHA=""
  intentar 6 20 pedir_sha || fallar "No pude preguntar a GitHub cuál es la última versión. Prueba otra vez en unos minutos."
  carpeta="$RAIZ/root/oportia-instalador-${SHA:0:7}"
  if [ -e "$carpeta" ] && [ ! -f "$carpeta/.completa" ]; then
    destino="$carpeta.apartada-$(date +%Y%m%d-%H%M%S)"
    mv -nT -- "$carpeta" "$destino"
    if [ -e "$carpeta" ]; then fallar "No pude apartar $carpeta"; fi
  fi
  if [ ! -d "$carpeta" ]; then
    mkdir -m 700 -- "$carpeta"
    intentar 6 20 sistema curl -fsSL -m 300 -o "$carpeta/.codigo.tgz" "https://codeload.github.com/$REPO/tar.gz/$SHA" || fallar "No pude bajar OPORTIA de GitHub."
    tar --no-same-owner --no-same-permissions -xzf "$carpeta/.codigo.tgz" -C "$carpeta" --strip-components=1
    chmod -R go-w -- "$carpeta"
    [ -f "$carpeta/deploy/install.sh" ] || fallar "Lo que bajé de GitHub no trae el instalador."
    : > "$carpeta/.completa"
  fi

  # 5) El instalador (o revisar/pasar) corre desde esa carpeta de root. Recibe la RUTA de la clave, nunca la clave.
  if [ "$modo" = "instalar" ]; then
    bash "$carpeta/deploy/install.sh" "--sha=$SHA" "${opciones[@]}" || codigo=$?
  else
    bash "$carpeta/deploy/oportia-servidor.sh" "$modo" || codigo=$?
  fi
  if [ -n "$aviso_clave" ]; then decir "$aviso_clave"; fi
  exit "$codigo"
}

principal "$@" </dev/null
exit $?
