#!/bin/bash
# OPORTIA: funciones compartidas de los programas del servidor. No se ejecuta solo: lo cargan (con «source», desde su
# misma carpeta de root) install.sh, oportia.sh, oportia-servidor.sh y oportia-recuperar.sh.
# shellcheck disable=SC2034
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

# >>> salud (este bloque es IDÉNTICO en oportia-comun.sh y oportia-actualizar.sh: lo comprueba la suite)
# La app contesta 200 en /api/setup pasados 90 s de arrancar AUNQUE su trabajador haya fallado. Por eso un 200 solo
# prueba algo si llega dentro de esta ventana, contada desde la PRIMERA respuesta del servidor. Nunca se alarga.
SALUD_VENTANA=70

# La carpeta del «node» que usa el servicio (la de su ExecStart); si no se puede leer, la del PATH.
carpeta_de_node() {
  local unidad="$RAIZ/etc/systemd/system/jarvis.service" ruta=""
  if [ -f "$unidad" ]; then ruta="$(sed -n 's/^ExecStart=\([^[:space:]]*\/node\)[[:space:]].*$/\1/p' "$unidad" | head -n 1)"; fi
  if [ -n "$ruta" ] && [ -x "$RAIZ$ruta" ]; then
    dirname -- "$RAIZ$ruta"
    return 0
  fi
  ruta="$(command -v node 2>/dev/null || true)"
  [ -n "$ruta" ] || return 1
  dirname -- "$ruta"
}

puerto_app() {
  local p=""
  if [ -f "$OPT/.env" ]; then p="$(sed -n 's/^PORT=\([0-9]\{1,5\}\)[[:space:]]*$/\1/p' "$OPT/.env" | tail -n 1)"; fi
  printf '%s' "${p:-8080}"
}

ahora_ms() {
  local t="${EPOCHREALTIME/[.,]/}"
  printf '%s' "$((t / 1000))"
}

# Una pregunta a la app. Imprime el código (200, 503…; 000 si no contestó) y deja la respuesta en <archivo>.
pedir_salud() {
  local codigo
  codigo="$(sistema curl -sS -m 5 -o "$2" -w '%{http_code}' "http://127.0.0.1:$1/api/setup" 2>/dev/null)" || codigo="000"
  printf '%s' "${codigo:-000}"
}

# ¿La respuesta es de OPORTIA (y de la versión esperada, si se pide una)? El JSON lo lee node, por la entrada.
salud_vale() {
  local nodo
  nodo="$(carpeta_de_node)/node" || return 1
  [ -f "$1" ] || return 1
  "$nodo" -e '
    let texto = "";
    process.stdin.on("data", d => { texto += d; }).on("end", () => {
      try {
        const j = JSON.parse(texto);
        const esperada = process.argv[1];
        process.exit(j && j.app === "oportia" && (esperada === "-" || j.version === esperada) ? 0 : 1);
      } catch { process.exit(1); }
    });
  ' "$2" < "$1"
}

# La única que decide «sana»: arrancar_y_salud <restart|start> <versión esperada|-> [segundos de espera del puerto]
arrancar_y_salud() {
  local accion="$1" esperada="$2" espera="${3:-60}" paso=3
  local ventana_ms=$((SALUD_VENTANA * 1000)) espera_ms respuesta puerto codigo activo fin limite buenas=0
  espera_ms=$((espera * 1000))
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    paso="${OPORTIA_SALUD_PASO:-$paso}"
    if [ -n "${OPORTIA_SALUD_VENTANA_MS:-}" ] && [ "$OPORTIA_SALUD_VENTANA_MS" -lt "$ventana_ms" ]; then ventana_ms="$OPORTIA_SALUD_VENTANA_MS"; fi
    if [ -n "${OPORTIA_SALUD_ESPERA_MS:-}" ] && [ "$OPORTIA_SALUD_ESPERA_MS" -lt "$espera_ms" ]; then espera_ms="$OPORTIA_SALUD_ESPERA_MS"; fi
  fi
  [ -n "$PROPIA" ] && [ -d "$PROPIA" ] || return 1
  respuesta="$PROPIA/salud.json"
  puerto="$(puerto_app)"
  sistema systemctl "$accion" jarvis || return 1
  # 1) Esperar la PRIMERA respuesta del servidor (200 o 503).
  fin=$(($(ahora_ms) + espera_ms))
  while :; do
    sleep "$paso"
    codigo="$(pedir_salud "$puerto" "$respuesta")"
    if [ "$codigo" = "200" ] || [ "$codigo" = "503" ]; then break; fi
    activo="$(sistema systemctl is-active jarvis 2>/dev/null || true)"
    if [ "$activo" != "active" ] && [ "$activo" != "activating" ]; then return 1; fi
    if [ "$(ahora_ms)" -ge "$fin" ]; then return 1; fi
  done
  # 2) Ventana fija desde esa primera respuesta: dos respuestas buenas SEGUIDAS, recibidas dentro de la ventana.
  limite=$(($(ahora_ms) + ventana_ms))
  while :; do
    if [ "$(ahora_ms)" -gt "$limite" ]; then return 1; fi
    activo="$(sistema systemctl is-active jarvis 2>/dev/null || true)"
    if [ "$codigo" = "200" ] && [ "$activo" = "active" ] && salud_vale "$respuesta" "$esperada"; then
      buenas=$((buenas + 1))
      if [ "$buenas" -ge 2 ]; then return 0; fi
    else
      buenas=0
    fi
    sleep "$paso"
    codigo="$(pedir_salud "$puerto" "$respuesta")"
  done
}

# Para un servicio que NO se reinició: solo dice si contesta como OPORTIA. No prueba nada del trabajador y nunca se usa
# para decidir si una versión o una base quedó sana.
responde() {
  local segundos="${1:-15}" respuesta puerto codigo fin
  [ -n "$PROPIA" ] && [ -d "$PROPIA" ] || return 1
  respuesta="$PROPIA/responde.json"
  puerto="$(puerto_app)"
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then segundos=1; fi
  fin=$(($(ahora_ms) + segundos * 1000))
  while :; do
    codigo="$(pedir_salud "$puerto" "$respuesta")"
    if [ "$codigo" = "200" ] && salud_vale "$respuesta" "-"; then return 0; fi
    if [ "$(ahora_ms)" -ge "$fin" ]; then return 1; fi
    sleep 1
  done
}
# <<< salud

REPO_POR_DEFECTO="junior17281728jr-bot/Jarvis"
RAMA_POR_DEFECTO="main"
UNIDADES="$RAIZ/etc/systemd/system"

# Una carpeta temporal propia de esta corrida (se quita al salir).
carpeta_propia() {
  mkdir -p -- "$RAIZ/tmp"
  PROPIA="$(mktemp -d "$RAIZ/tmp/oportia-propia.XXXXXX")"
  trap al_salir EXIT
}

# Lo que se le pregunta a una persona se lee SIEMPRE de la terminal (nunca de la entrada del programa).
# preguntar <texto> [oculto] → deja la respuesta en RESPUESTA.
RESPUESTA=""
preguntar() {
  local texto="$1" oculto="${2:-}" terminal="/dev/tty"
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then terminal="${OPORTIA_TERMINAL:-}"; fi
  RESPUESTA=""
  printf '%s' "$texto"
  if [ -z "$terminal" ] || [ ! -e "$terminal" ]; then
    printf '\n'
    return 1
  fi
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then
    # En las pruebas las respuestas vienen de un archivo: se gasta una línea por pregunta.
    RESPUESTA="$(sed -n '1p' "$terminal")"
    sed -i '1d' "$terminal"
    printf '\n'
    return 0
  fi
  if [ "$oculto" = "oculto" ]; then
    IFS= read -rs RESPUESTA < "$terminal" || return 1
    printf '\n'
  else
    IFS= read -r RESPUESTA < "$terminal" || return 1
  fi
  return 0
}

megas_libres() {
  local n
  n="$(sistema df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}')" || n=""
  if [[ "$n" =~ ^[0-9]+$ ]]; then printf '%s' "$n"; else printf '0'; fi
}

leer_sha() {
  local texto=""
  if [ -f "$1" ] && [ ! -L "$1" ]; then texto="$(head -c 64 -- "$1" 2>/dev/null | head -n 1 | tr -d '[:space:]')" || texto=""; fi
  if [[ "$texto" =~ ^[0-9a-f]{40}$ ]]; then printf '%s' "$texto"; fi
}

# El sha7 de la carpeta desde donde corre este programa (…/oportia-instalador-<sha7>/deploy o …/v-<sha7>).
sha7_de_aqui() {
  local aqui="$1"
  if [[ "$aqui" =~ /oportia-instalador-([0-9a-f]{7})/deploy$ ]]; then printf '%s' "${BASH_REMATCH[1]}"; return 0; fi
  if [[ "$aqui" =~ /v-([0-9a-f]{7})$ ]]; then printf '%s' "${BASH_REMATCH[1]}"; return 0; fi
  return 1
}

# Toma los dos candados (el del actualizador nuevo y el de antes) y los mantiene hasta que el programa termine.
tomar_candados() {
  mkdir -p -- "$RAIZ/run"
  exec 9> "$RAIZ/run/oportia-actualizar.lock"
  exec 8> "$RAIZ/run/jarvis-actualizar.lock"
  if ! flock -n 9 || ! flock -n 8; then return 1; fi
  return 0
}

# Pone un archivo SOLO si falta. Si ya hay uno distinto: no lo toca y deja el nuevo como propuesta, fuera de la carpeta
# del sistema (el mismo contenido da el mismo nombre: repetirlo no crea nada). → HECHO = puesto | ya_estaba | propuesto
HECHO=""
poner_si_falta() {
  local origen="$1" destino="$2" modo="$3" huella propuesto
  if existe "$destino"; then
    if [ -f "$destino" ] && cmp -s -- "$origen" "$destino"; then
      HECHO="ya_estaba"
      return 0
    fi
    huella="$(sha256sum -- "$origen" | cut -c1-12)"
    mkdir -p -- "$EST/propuestos"
    chmod 700 "$EST/propuestos"
    propuesto="$EST/propuestos/${destino##*/}.nuevo-$huella"
    if [ ! -e "$propuesto" ]; then
      cp -- "$origen" "$propuesto"
      chmod 600 "$propuesto"
    fi
    HECHO="propuesto"
    decir "  ${destino##*/}: ya había uno distinto y NO lo toqué. El de esta versión quedó guardado en $propuesto"
    return 0
  fi
  cp -- "$origen" "$destino.oportia-nuevo"
  chmod "$modo" "$destino.oportia-nuevo"
  mover_sin_pisar "$destino.oportia-nuevo" "$destino" || fallar "No pude poner $destino"
  HECHO="puesto"
}

# Para los archivos fijos de 1f (el lanzador y la orden «oportia»): si cambia, el de antes queda como «.anterior».
poner_fijo() {
  local origen="$1" destino="$2" modo="$3"
  if [ -f "$destino" ] && [ ! -L "$destino" ] && cmp -s -- "$origen" "$destino"; then
    HECHO="ya_estaba"
    return 0
  fi
  cp -- "$origen" "$destino.oportia-nuevo"
  chmod "$modo" "$destino.oportia-nuevo"
  if existe "$destino"; then mv -fT -- "$destino" "$destino.anterior"; fi
  mv -fT -- "$destino.oportia-nuevo" "$destino"
  HECHO="puesto"
}

# Deja el actualizador listo en las carpetas de root: el juego de esta versión, el enlace «actual», el lanzador, la orden
# «oportia» y las dos unidades. No enciende el temporizador (eso lo decide quien llama). La usan install.sh y «pasar».
instalar_actualizador() {
  local origen="$1" sha7="$2" actual recargar=no
  mkdir -p -- "$LIB" "$EST/respaldo" "$EST/propuestos" "$RAIZ/usr/local/sbin" "$UNIDADES"
  chmod 755 "$LIB" "$EST"
  chmod 700 "$EST/respaldo" "$EST/propuestos"
  armar_juego "$origen" "$sha7" || fallar "No pude armar el actualizador de la versión $sha7 (no cambié el que había)"
  : > "$LIB/v-$sha7/.completa"
  actual="$(juego_de "$LIB/actual" || true)"
  if [ "$actual" != "v-$sha7" ]; then
    if existe "$LIB/actual" && [ ! -L "$LIB/actual" ]; then apartar "$LIB/actual"; fi
    if [ -n "$actual" ]; then cambiar_enlace "$actual" "$LIB/anterior"; fi
    cambiar_enlace "v-$sha7" "$LIB/actual"
  fi
  poner_fijo "$origen/oportia-lanzador.sh" "$LIB/oportia-lanzador.sh" 755
  poner_fijo "$origen/oportia-orden.sh" "$RAIZ/usr/local/sbin/oportia" 755
  poner_si_falta "$origen/oportia-actualizar.service" "$UNIDADES/oportia-actualizar.service" 644
  if [ "$HECHO" = "puesto" ]; then recargar=si; fi
  poner_si_falta "$origen/oportia-actualizar.timer" "$UNIDADES/oportia-actualizar.timer" 644
  if [ "$HECHO" = "puesto" ]; then recargar=si; fi
  if [ ! -e "$RAIZ/etc/oportia.conf" ]; then
    printf '%s\n' "# OPORTIA: de dónde baja las versiones el actualizador. Normalmente no se toca." "# REPO=$REPO_POR_DEFECTO" "# RAMA=$RAMA_POR_DEFECTO" > "$RAIZ/etc/oportia.conf"
    chmod 644 "$RAIZ/etc/oportia.conf"
  fi
  if [ "$recargar" = si ]; then sistema systemctl daemon-reload; fi
}

# ---------- Tailscale ----------

# Un dato del estado de Tailscale (BackendState, o el nombre DNS propio). Vacío si no hay Tailscale o no contesta.
dato_tailscale() {
  local cual="$1" nodo
  hay_orden tailscale || return 0
  nodo="$(carpeta_de_node)/node" || return 0
  sistema_con_tope 15 tailscale status --json 2>/dev/null | "$nodo" -e '
    let t = ""; process.stdin.on("data", d => { t += d; }).on("end", () => {
      try {
        const j = JSON.parse(t);
        const v = process.argv[1] === "estado" ? j.BackendState : String(j.Self?.DNSName ?? "").replace(/\.$/, "");
        if (typeof v === "string" && /^[A-Za-z0-9.-]{1,200}$/.test(v)) process.stdout.write(v);
      } catch { /* sin dato */ }
    });
  ' "$cual" 2>/dev/null || true
}

# Entra a la red privada con la clave que hay en <archivo> (la clave nunca va en la línea de la orden ni se imprime).
unir_tailscale() {
  local archivo="$1"
  sistema_con_tope 120 tailscale up "--auth-key=file:$archivo" --hostname=jarvis >/dev/null 2>&1 || return 1
  [ "$(dato_tailscale estado)" = "Running" ]
}

# El enlace https: primero el público (Funnel); si la red privada no lo permite, https solo para la red privada y queda
# la marca «enlace-pendiente» (cada corrida del actualizador lo vuelve a intentar). Nunca «funnel reset».
encender_enlace() {
  local puerto
  puerto="$(puerto_app)"
  sistema_con_tope 30 tailscale funnel --bg "$puerto" >/dev/null 2>&1 || true
  if sistema_con_tope 15 tailscale funnel status 2>/dev/null | grep -q 'Funnel on'; then
    if [ -f "$EST/enlace-pendiente" ]; then mv -fT -- "$EST/enlace-pendiente" "$EST/enlace-pendiente.ultima"; fi
    : > "$EST/enlace-encendido"
    return 0
  fi
  sistema_con_tope 30 tailscale serve --bg "$puerto" >/dev/null 2>&1 || true
  : > "$EST/enlace-pendiente"
  return 1
}

explicar_enlace_pendiente() {
  decir "  El enlace público todavía no se pudo encender. Por ahora OPORTIA abre solo desde tus equipos con Tailscale."
  decir "  Para encenderlo: en login.tailscale.com → DNS activa «HTTPS Certificates», y en Access controls permite «Funnel»."
  decir "  Después no hay que hacer nada: el servidor lo intenta solo cada media hora (o corre: sudo oportia tailscale)."
}
