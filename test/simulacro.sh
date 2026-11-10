#!/bin/bash
# El SIMULACRO de la parte 1f, tan de verdad como se puede SIN un servidor (no es parte de la suite):
#   bash test/simulacro.sh            corre todo; el contenedor solo si hay docker (si no, lo dice y sigue)
#   bash test/simulacro.sh --lista    solo imprime la lista de comprobación
# Qué corre: (1) la escritura de cada programa de deploy/ (bash -n, y shellcheck si está); (2) el instalador entero en
# una raíz falsa (test/ensayo-instalar.mjs); (3) las pruebas del actualizador, de «pasar/volver», de «recuperar» y la ida
# y vuelta copia → cifrar → recuperar en una carpeta nueva → comparar; (4) un contenedor Ubuntu DESECHABLE
# (test/ensayo-contenedor.sh: instalar dos veces, actualizar, volver atrás y recuperar). Al final, la lista de lo que
# solo se puede comprobar en un Droplet de ensayo.
# No toca ningún servidor, no contacta GitHub, Tailscale, Telegram ni DigitalOcean, y no usa ninguna clave de verdad.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
HECHOS=0
SALTADOS=0

lista() {
  cat <<'FIN_DE_LA_LISTA'

LISTA DE COMPROBACIÓN DEL SIMULACRO
Hoy, sin costo:
  [ ] Copiar el texto de instalación (Administrador → Copias → «Si un día pierdes el servidor») y guardarlo en Notas.
  [ ] Tener a mano la clave de recuperación (papel y Contraseñas) y comprobarla en Copias → «Comprobar mi clave».
  [ ] sudo oportia probar-copia   (en producción, cuando exista «oportia» allí)
Completo, en un Droplet de ensayo (centavos; se destruye al terminar; SOLO con permiso de Junior):
  [ ] Crear la clave de Tailscale de un solo uso.
  [ ] Crear el Droplet siguiendo el paso 3 al pie de la letra; anotar cada nombre del formulario que no coincida.
  [ ] A los 15 minutos abre el enlace https.
  [ ] sudo oportia estado   → todo en verde.
  [ ] La Consola web sigue entrando con el cortafuegos puesto.
  [ ] sudo tail -n 30 /var/log/oportia-instalar.log   y   free -m   (¿alcanzó 1 GB de swap?)
  [ ] sudo systemctl start oportia-actualizar.service   y   journalctl -u oportia-actualizar -n 30
  [ ] tailscale serve status   y   tailscale funnel status   → copiar el texto exacto.
  [ ] Borrar la clave en Tailscale → Keys.
  [ ] sudo oportia recuperar --simulacro   → entra con su usuario y ve sus proyectos. NO pegar el token ni hacer /revoke.
  [ ] Reiniciar el Droplet: vuelve solo y el enlace sigue.
  [ ] systemd-cgls -u jarvis.service muestra 2 procesos de node; sudo systemctl stop jarvis no deja ninguno.
  [ ] Destruir el Droplet y quitar la máquina en Tailscale.
Nada de esto está comprobado todavía en un servidor real: systemd, el cortafuegos, Tailscale y Funnel, cloud-init de
DigitalOcean, la Consola con el cortafuegos puesto y la suite en 512 MB.
FIN_DE_LA_LISTA
}

paso() {
  local nombre="$1"
  shift
  echo ""
  echo "== $nombre =="
  "$@"
  HECHOS=$((HECHOS + 1))
  echo "✔ $nombre"
}

saltar() {
  SALTADOS=$((SALTADOS + 1))
  echo ""
  echo "== $1 =="
  echo "• SALTADO: $2"
}

escritura() {
  local f
  for f in "$REPO"/deploy/*.sh "$REPO"/test/*.sh; do bash -n "$f"; done
  if command -v shellcheck >/dev/null 2>&1; then
    (cd "$REPO" && shellcheck -S warning -x deploy/*.sh)
    echo "  shellcheck: limpio"
  else
    echo "  (no hay shellcheck aquí: solo bash -n)"
  fi
}

principal() {
  if [ "${1:-}" = "--lista" ]; then lista; return 0; fi
  echo "SIMULACRO de OPORTIA $(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$REPO/package.json" | head -n 1) — $(date -Is)"
  cd "$REPO"
  paso "1. Escritura de los programas del servidor" escritura
  paso "2. El instalador entero en una raíz falsa" node --no-warnings test/ensayo-instalar.mjs
  paso "3. Actualizar, pasar/volver, recuperar y la ida y vuelta de una copia" \
    node --no-warnings --test test/actualizador.test.js test/instalar.test.js test/restaurar-cli.test.js test/copias-restaurar.test.js
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    paso "4. Contenedor Ubuntu desechable: instalar dos veces, actualizar, volver atrás y recuperar" bash test/ensayo-contenedor.sh
  else
    saltar "4. Contenedor Ubuntu desechable" "aquí no hay docker funcionando"
  fi
  echo ""
  echo "SIMULACRO: $HECHOS partes bien, $SALTADOS saltadas. TODO ESTO ES SIMULACIÓN: falta el Droplet de ensayo."
  lista
}

principal "$@"
