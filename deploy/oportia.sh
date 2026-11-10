#!/bin/bash
# OPORTIA: reparte «sudo oportia <palabra>» al programa de su misma carpeta de root. Lo llama /usr/local/sbin/oportia.
set -euo pipefail
IFS=$'\n\t'
umask 022
export LC_ALL=C.UTF-8
if [ "${OPORTIA_PRUEBA:-}" != "1" ]; then PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
export PATH

ayuda() {
  printf '%s\n' \
    "Órdenes de OPORTIA (todas empiezan con sudo):" \
    "  sudo oportia estado          cómo está el servidor (no cambia nada)" \
    "  sudo oportia actualizar      busca e instala la versión nueva ahora (con --reintentar prueba otra vez una que falló)" \
    "  sudo oportia recuperar       trae tus datos desde tu última copia (Telegram o archivos)" \
    "  sudo oportia probar-copia    comprueba que tu copia y tu clave sirven (no cambia nada)" \
    "  sudo oportia tailscale       une el servidor a tu red privada y enciende el enlace" \
    "  sudo oportia revisar         mira si este servidor puede pasar al actualizador nuevo (no cambia nada)" \
    "  sudo oportia pasar           pasa al actualizador nuevo (hace una copia antes)" \
    "  sudo oportia volver          vuelve al actualizador de antes" \
    "  sudo oportia servicio        pone el archivo del servicio de esta versión (hace una copia antes)" \
    "  sudo oportia ayuda           esta lista"
}

principal() {
  local aqui palabra="${1:-ayuda}"
  aqui="$(dirname -- "$(realpath -- "$0")")"
  # shellcheck source=deploy/oportia-comun.sh
  . "$aqui/oportia-comun.sh"
  revisar_modo
  if [ "$#" -gt 0 ]; then shift; fi
  case "$palabra" in
    estado|revisar|pasar|volver|servicio|tailscale) exec bash "$aqui/oportia-servidor.sh" "$palabra" "$@" ;;
    recuperar|probar-copia) exec bash "$aqui/oportia-recuperar.sh" "$palabra" "$@" ;;
    actualizar) exec bash "$LIB/oportia-lanzador.sh" --persona "$@" ;;
    ayuda|--ayuda|-h|--help) ayuda ;;
    *)
      printf '%s\n\n' "No conozco la orden «$palabra»."
      ayuda
      exit 2
      ;;
  esac
}

principal "$@" </dev/null
exit $?
