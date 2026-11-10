#!/bin/bash
# OPORTIA: el lanzador del actualizador. Fijo y pequeño: candados, tope de tiempo y vigilancia. Sin red y sin lógica de
# actualizar. Si el actualizador nuevo falla, se cuelga o no deja rastro 3 veces seguidas, vuelve al juego de antes.
set -euo pipefail
IFS=$'\n\t'
umask 022
export LC_ALL=C.UTF-8
# En las pruebas el PATH lo pone la prueba (solo trae lo que hace falta); en el servidor es siempre este.
if [ "${OPORTIA_PRUEBA:-}" != "1" ]; then PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
export PATH

# >>> base (este bloque es IDÉNTICO en oportia-comun.sh, oportia-actualizar.sh y oportia-lanzador.sh: lo comprueba la suite)
# Todas las rutas salen de un solo prefijo: vacío en el servidor, una carpeta temporal en las pruebas.
RAIZ="${OPORTIA_RAIZ:-}"
OPT="$RAIZ/opt/jarvis"
DATOS="$RAIZ/var/lib/jarvis"
EST="$RAIZ/var/lib/oportia-actualizador"
LIB="$RAIZ/usr/local/lib/oportia"
REGISTRO=""
PROPIA=""
CONTRATO_DEL_LANZADOR=1
ORDENES_DEL_SISTEMA=" systemctl apt-get dpkg tailscale ufw useradd id runuser setpriv swapon mkswap fallocate curl hostnamectl ss chown chgrp df uname "
# El «juego» de una versión: lo que root guarda en su carpeta para no ejecutar nunca nada de la carpeta de la app.
JUEGO="oportia-actualizar.sh oportia-comun.sh oportia.sh oportia-servidor.sh oportia-recuperar.sh install.sh oportia-lanzador.sh oportia-orden.sh node.pin jarvis.service oportia-actualizar.service oportia-actualizar.timer"

negar() {
  printf '%s\n' "Este programa solo corre instalado; no hice nada. ($1)" >&2
  exit 1
}

# ¿Es de root y nadie más puede escribir ahí?
de_root_y_cerrado() {
  local datos modo
  datos="$(stat -c '%u %A' -- "$1" 2>/dev/null)" || return 1
  [ "${datos%% *}" = "0" ] || return 1
  modo="${datos#* }"
  [ "${modo:5:1}" != "w" ] && [ "${modo:8:1}" != "w" ]
}

# Los dos modos fallan cerrado. De prueba: raíz falsa dentro de la carpeta temporal y comandos falsos obligatorios.
# Real: solo desde una carpeta conocida de root (nunca desde la carpeta de una prueba ni desde la carpeta de la app).
revisar_modo() {
  local yo aqui t r p
  yo="$(realpath -- "$0" 2>/dev/null)" || negar "no sé dónde estoy"
  aqui="$(dirname -- "$yo")"
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    [ -n "$RAIZ" ] || negar "modo de prueba sin raíz de prueba"
    if [ -z "${OPORTIA_FALSOS:-}" ] || [ ! -d "${OPORTIA_FALSOS:-}" ]; then negar "modo de prueba sin comandos falsos"; fi
    t="$(realpath -- "${TMPDIR:-$RAIZ/tmp}" 2>/dev/null)" || negar "no hay carpeta temporal"
    r="$(realpath -- "$RAIZ" 2>/dev/null)" || negar "la raíz de prueba no existe"
    case "$r" in
      "$t"/?*) ;;
      *) negar "la raíz de prueba no está dentro de la carpeta temporal" ;;
    esac
    return 0
  fi
  [ -z "$RAIZ" ] || negar "hay una raíz de prueba sin el modo de prueba"
  if [ "$aqui" = "$LIB" ] || [ "$aqui" = "$RAIZ/usr/local/sbin" ]; then :
  elif [[ "$aqui" =~ ^"$LIB"/v-[0-9a-f]{7}$ ]]; then :
  elif [[ "$aqui" =~ ^"$RAIZ/root"/oportia-instalador-[0-9a-f]{7}/deploy$ ]]; then :
  else negar "no estoy en una carpeta conocida de root"; fi
  [ "$EUID" = "0" ] || negar "hace falta ser administrador: escribe sudo delante"
  p="$yo"
  while [ -n "$p" ] && [ "$p" != "/" ]; do
    de_root_y_cerrado "$p" || negar "$p no es solo de root"
    p="$(dirname -- "$p")"
  done
}

decir() {
  printf '%s\n' "$*"
  if [ -n "$REGISTRO" ]; then printf '%s %s\n' "$(date -Is)" "$*" >> "$REGISTRO" 2>/dev/null || true; fi
}

fallar() {
  decir "✖ $*"
  exit 1
}

# Los comandos que tocan el sistema pasan SIEMPRE por aquí. En las pruebas solo existen los falsos: si falta uno, falla
# (nunca cae al comando de verdad).
ruta_de_orden() {
  case "$ORDENES_DEL_SISTEMA" in
    *" $1 "*) ;;
    *) fallar "«$1» no está en la lista de órdenes del sistema" ;;
  esac
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    [ -x "$OPORTIA_FALSOS/$1" ] || fallar "falta el comando falso «$1» (en las pruebas nunca se usa el de verdad)"
    printf '%s' "$OPORTIA_FALSOS/$1"
  else
    printf '%s' "$1"
  fi
}

sistema() {
  local orden
  orden="$(ruta_de_orden "$1")" || exit 1
  shift
  # (7, 8 y 9 son los candados: lo que se encienda desde aquí nunca los hereda)
  "$orden" "$@" 7>&- 8>&- 9>&-
}

# Lo mismo con un tope de tiempo en segundos: sistema_con_tope 120 tailscale up …
sistema_con_tope() {
  local tope="$1" orden
  orden="$(ruta_de_orden "$2")" || exit 1
  shift 2
  timeout "$tope" "$orden" "$@" 7>&- 8>&- 9>&-
}

hay_orden() {
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then [ -x "$OPORTIA_FALSOS/$1" ]; else command -v "$1" >/dev/null 2>&1; fi
}

existe() { [ -e "$1" ] || [ -L "$1" ]; }

# Mueve sin pisar. Nunca se fía del código de salida de «mv -n» (cambia entre versiones): comprueba el resultado.
mover_sin_pisar() {
  local origen="$1" destino="$2"
  if existe "$destino"; then return 1; fi
  mv -nT -- "$origen" "$destino" 2>/dev/null || true
  if existe "$origen" || ! existe "$destino"; then return 1; fi
  return 0
}

# Apartar = cambiar el nombre (nunca borrar).
apartar() {
  local ruta="$1" destino n=0
  existe "$ruta" || return 0
  destino="$ruta.apartada-$(date +%Y%m%d-%H%M%S)"
  while existe "$destino"; do
    n=$((n + 1))
    destino="$ruta.apartada-$(date +%Y%m%d-%H%M%S)-$n"
  done
  mover_sin_pisar "$ruta" "$destino" || fallar "No pude apartar $ruta (no cambié nada más)"
  decir "Aparté (no borré): $ruta → $destino"
}

# El ÚNICO borrado que existe en estos programas. Solo acepta: (1) la carpeta temporal propia de esta corrida o algo de
# adentro; (2) una carpeta de corrida que quedó cortada, mía y con mi marca; (3) las tres carpetas de código que arma el
# actualizador, y solo si traen su marca. Cualquier otra ruta: se niega y no toca nada.
borrar_lo_mio() {
  local ruta="${1:-}" vale=no
  [ -n "$ruta" ] || fallar "borrar_lo_mio: ruta vacía, no toqué nada"
  if [ -L "$ruta" ]; then fallar "borrar_lo_mio: $ruta es un enlace, no lo toqué"; fi
  case "$ruta" in
    */..|*/../*|*/.|*/./*) fallar "borrar_lo_mio: $ruta no es una ruta limpia, no la toqué" ;;
  esac
  [ -e "$ruta" ] || return 0
  if [ -n "$PROPIA" ] && [ -d "$PROPIA" ] && [ ! -L "$PROPIA" ]; then
    case "$ruta" in
      "$PROPIA"|"$PROPIA"/*) vale=si ;;
    esac
  fi
  if [ "$vale" = no ] && [[ "$ruta" =~ ^"$RAIZ/tmp"/oportia-corrida\.[A-Za-z0-9]{6}$ ]]; then
    if [ -d "$ruta" ] && [ -O "$ruta" ] && [ -f "$ruta/.oportia-corrida" ] && [ ! -L "$ruta/.oportia-corrida" ] && [ -O "$ruta/.oportia-corrida" ]; then vale=si; fi
  fi
  if [ "$vale" = no ]; then
    if [ "$ruta" = "$OPT.nueva" ] || [ "$ruta" = "$OPT.mala" ] || [ "$ruta" = "$OPT.anterior" ]; then
      if [ -d "$ruta" ] && [ -f "$ruta/.oportia-codigo" ]; then vale=si; fi
    fi
  fi
  [ "$vale" = si ] || fallar "borrar_lo_mio: $ruta no es mío, no lo toqué"
  rm -rf --one-file-system -- "$ruta"
}

al_salir() {
  local codigo=$?
  trap - EXIT
  if [ -n "$PROPIA" ]; then (borrar_lo_mio "$PROPIA") >/dev/null 2>&1 || true; fi
  exit "$codigo"
}

# Agrega UNA línea a update.log sin seguir enlaces (el servicio puede escribir en esa carpeta; root nunca le sigue un enlace).
agregar_linea() {
  local log="$DATOS/update.log"
  if ! printf '%s\n' "$1" | dd of="$log" oflag=append,nofollow conv=notrunc status=none 2>/dev/null; then
    printf '%s no pude escribir en update.log: %s\n' "$(date -Is)" "$1" >> "$EST/pasos.log" 2>/dev/null || true
  fi
}

aviso() {
  decir "Aviso: $*"
  agregar_linea "$(date -Is) aviso: $*"
}

# Reemplaza ENTERO un archivo pequeño (archivo temporal en la carpeta de root + cambio de nombre: reemplaza un enlace,
# nunca escribe en su destino). Si en ese nombre hay otra cosa (una carpeta): no se toca, se avisa y se sigue.
poner_texto() {
  local destino="$1" texto="$2" temporal="$EST/.poner.tmp"
  if [ -e "$destino" ] && [ ! -L "$destino" ] && [ ! -f "$destino" ]; then
    aviso "no pude escribir ${destino##*/}: en ese nombre hay algo que no es un archivo"
    return 0
  fi
  printf '%s\n' "$texto" > "$temporal"
  chmod 644 "$temporal"
  mv -fT -- "$temporal" "$destino"
}

# Cambia a dónde apunta un enlace de una sola vez (enlace con otro nombre + cambio de nombre).
cambiar_enlace() {
  local destino="$1" enlace="$2"
  ln -s -- "$destino" "$enlace.cambio"
  mv -fT -- "$enlace.cambio" "$enlace"
}

# ¿El enlace apunta a un juego completo, hermano suyo?
juego_de() {
  local enlace="$1" a
  [ -L "$enlace" ] || return 1
  a="$(readlink -- "$enlace")"
  [[ "$a" =~ ^v-[0-9a-f]{7}$ ]] || return 1
  [ -d "$LIB/$a" ] && [ ! -L "$LIB/$a" ] && [ -f "$LIB/$a/.completa" ] || return 1
  printf '%s' "$a"
}

# ¿Los archivos del juego de <carpeta de origen> son los mismos que los de <juego>?
mismo_juego() {
  local origen="$1" juego="$2" archivo
  local IFS=' '
  for archivo in $JUEGO; do
    cmp -s -- "$origen/$archivo" "$juego/$archivo" || return 1
  done
  return 0
}

# Arma el juego de una versión en la carpeta de root: copia, cierra permisos y revisa cada programa ANTES de darlo por
# bueno. Devuelve 1 (sin dejar nada a medias con el nombre bueno) si algo no pasa.
armar_juego() {
  local origen="$1" sha7="$2" juego archivo
  [[ "$sha7" =~ ^[0-9a-f]{7}$ ]] || return 1
  juego="$LIB/v-$sha7"
  if [ -d "$juego" ] && [ ! -L "$juego" ] && [ -f "$juego/.completa" ] && mismo_juego "$origen" "$juego"; then return 0; fi
  if existe "$juego"; then apartar "$juego"; fi
  mkdir -p -- "$LIB"
  mkdir -- "$juego" || return 1
  local IFS=' '
  for archivo in $JUEGO; do
    [ -f "$origen/$archivo" ] && [ ! -L "$origen/$archivo" ] || { decir "Al juego nuevo le falta $archivo"; return 1; }
    cp -- "$origen/$archivo" "$juego/$archivo" || return 1
    case "$archivo" in
      *.sh)
        chmod 755 "$juego/$archivo"
        bash -n "$juego/$archivo" 2>/dev/null || { decir "El programa $archivo del juego nuevo tiene un error de escritura"; return 1; }
        ;;
      *) chmod 644 "$juego/$archivo" ;;
    esac
  done
  chmod 755 "$juego"
  grep -q "^CONTRATO=$CONTRATO_DEL_LANZADOR\$" "$juego/oportia-actualizar.sh" || { decir "El actualizador nuevo habla otro contrato"; return 1; }
  return 0
}
# <<< base

TOPE_ACTUALIZADOR=2400

anotar_fallos() {
  printf '%s\n' "$1" > "$EST/fallos.tmp"
  mv -fT -- "$EST/fallos.tmp" "$EST/fallos"
}

principal() {
  local persona=no argumento fallos=0 codigo=0 id tope="$TOPE_ACTUALIZADOR" actual anterior
  local -a paso=()
  revisar_modo
  for argumento in "$@"; do
    case "$argumento" in
      --persona) persona=si ;;
      --sha=*|--reintentar|--solo-revisar) paso+=("$argumento") ;;
      *) fallar "No entiendo «$argumento». Usa: sudo oportia actualizar [--reintentar]" ;;
    esac
  done
  if [ -t 1 ]; then persona=si; fi
  mkdir -p -- "$EST" "$RAIZ/run"

  # 1) Candados: el mío y el del actualizador de antes (mientras conviven, nunca corren a la vez).
  exec 9> "$RAIZ/run/oportia-actualizar.lock"
  exec 8> "$RAIZ/run/jarvis-actualizar.lock"
  if ! flock -n 9 || ! flock -n 8; then
    if [ "$persona" = si ]; then printf '%s\n' "Ya hay una actualización corriendo; prueba en unos minutos."; fi
    exit 0
  fi

  # 2) ¿La corrida anterior no terminó? (la mataron, se colgó, se fue la luz)
  if [ -f "$EST/fallos" ]; then fallos="$(head -c 8 -- "$EST/fallos" | tr -dc '0-9')"; fi
  fallos="${fallos:-0}"
  if [ -f "$EST/corrida.empezo" ] && [ ! -f "$EST/corrida.termino" ]; then fallos=$((fallos + 1)); fi

  # 3) Una corrida, con tope de tiempo. El lanzador siempre sobrevive al actualizador y puede contar.
  id="$(date +%s)-$$-$RANDOM"
  if [ -f "$EST/corrida.termino" ]; then mv -fT -- "$EST/corrida.termino" "$EST/corrida.termino.ultima"; fi
  printf '%s\n' "$id" > "$EST/corrida.empezo"
  if [ "${OPORTIA_PRUEBA:-}" = "1" ] && [ -n "${OPORTIA_TOPE_ACTUALIZADOR:-}" ]; then tope="$OPORTIA_TOPE_ACTUALIZADOR"; fi
  if [ -f "$LIB/actual/oportia-actualizar.sh" ]; then
    timeout -k 30 "$tope" bash "$LIB/actual/oportia-actualizar.sh" --corrida "--id=$id" "${paso[@]}" || codigo=$?
  else
    printf '%s\n' "No encuentro el actualizador. Para arreglarlo: mira «Si el actualizador se daña» en la página de OPORTIA en GitHub."
    codigo=1
  fi
  printf '%s\n' "$id" > "$EST/corrida.termino"
  # Cuenta como fallo: salió mal, venció, o salió «bien» sin dejar su estado (no hizo nada).
  if [ "$codigo" -ne 0 ] || [ "$(cat "$EST/ultima-corrida.id" 2>/dev/null || true)" != "$id" ]; then
    fallos=$((fallos + 1))
  else
    fallos=0
  fi

  # 4) Tres fallos seguidos del actualizador nuevo: vuelve al juego de antes.
  if [ "$fallos" -ge 3 ]; then
    actual="$(juego_de "$LIB/actual" || true)"
    anterior="$(juego_de "$LIB/anterior" || true)"
    if [ -n "$anterior" ] && [ "$anterior" != "$actual" ]; then
      cambiar_enlace "$anterior" "$LIB/actual"
      if [ -n "$actual" ]; then cambiar_enlace "$actual" "$LIB/anterior"; fi
      fallos=0
      agregar_linea "$(date -Is) aviso: el actualizador nuevo falló 3 veces; volví al actualizador de antes"
      if [ "$persona" = si ]; then printf '%s\n' "El actualizador nuevo falló 3 veces: volví al de antes."; fi
    fi
  fi
  anotar_fallos "$fallos"
  # 5) Sale 0 siempre: lo que pasó está en update.log y en el estado.
  exit 0
}

principal "$@" </dev/null
exit $?
