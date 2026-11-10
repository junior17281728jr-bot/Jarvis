#!/bin/bash
# OPORTIA: la orden corta «oportia» (se instala como /usr/local/sbin/oportia). Fija y mínima: comprueba que el juego de
# programas de root está sano y le pasa la orden. Nunca ejecuta nada de la carpeta de la app.
set -euo pipefail
IFS=$'\n\t'
umask 022
export LC_ALL=C.UTF-8
if [ "${OPORTIA_PRUEBA:-}" != "1" ]; then PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
export PATH
RAIZ="${OPORTIA_RAIZ:-}"
LIB="$RAIZ/usr/local/lib/oportia"
ARREGLO="curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/cloud-init.sh | sudo bash -s -- --solo-actualizador"

negar() {
  printf '%s\n' "No hice nada: $1" >&2
  exit 1
}

cerrado() {
  local datos modo
  datos="$(stat -c '%u %A' -- "$1" 2>/dev/null)" || return 1
  if [ "${OPORTIA_PRUEBA:-}" != "1" ] && [ "${datos%% *}" != "0" ]; then return 1; fi
  modo="${datos#* }"
  [ "${modo:5:1}" != "w" ] && [ "${modo:8:1}" != "w" ]
}

principal() {
  local yo destino juego
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    if [ -z "$RAIZ" ] || [ -z "${OPORTIA_FALSOS:-}" ]; then negar "modo de prueba incompleto"; fi
    case "$(realpath -- "$RAIZ")" in
      "$(realpath -- "${TMPDIR:-$RAIZ/tmp}")"/?*) ;;
      *) negar "la raíz de prueba no está en la carpeta temporal" ;;
    esac
  else
    [ -z "$RAIZ" ] || negar "hay una raíz de prueba sin el modo de prueba"
    yo="$(realpath -- "$0" 2>/dev/null)" || negar "no sé dónde estoy"
    [ "$yo" = "$RAIZ/usr/local/sbin/oportia" ] || negar "este programa solo corre instalado"
    [ "$EUID" = "0" ] || negar "hace falta ser administrador. Escribe sudo delante: sudo oportia $*"
    cerrado "$yo" || negar "la orden oportia no es solo de root"
  fi
  # La cadena: carpeta → actual → v-<7 letras> → oportia.sh, todo de root y cerrado.
  destino=""
  if [ -L "$LIB/actual" ]; then destino="$(readlink -- "$LIB/actual")"; fi
  if ! [[ "$destino" =~ ^v-[0-9a-f]{7}$ ]]; then
    printf '%s\n' "Los programas de OPORTIA no están bien puestos en este servidor. No hice nada." "Para arreglarlo, pega esta línea:" "$ARREGLO" >&2
    exit 1
  fi
  juego="$LIB/$destino"
  if [ -L "$juego" ] || ! cerrado "$LIB" || ! cerrado "$juego" || [ ! -f "$juego/.completa" ] || [ -L "$juego/oportia.sh" ] || ! cerrado "$juego/oportia.sh"; then
    printf '%s\n' "Los programas de OPORTIA no están bien puestos en este servidor. No hice nada." "Para arreglarlo, pega esta línea:" "$ARREGLO" >&2
    exit 1
  fi
  exec bash "$juego/oportia.sh" "$@"
}

principal "$@" </dev/null
exit $?
