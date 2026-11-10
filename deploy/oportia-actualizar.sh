#!/bin/bash
# OPORTIA: el actualizador. Lo llama el lanzador (oportia-lanzador.sh) cada 30 minutos, o «sudo oportia actualizar».
# Baja la versión nueva, corre TODAS sus pruebas como «nobody», la instala al lado, cambia de nombre, mira la salud y,
# si no arranca bien, vuelve al código anterior. Solo cambia CÓDIGO: nunca toca los datos. Un solo archivo: no carga otros.
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

# El número que el lanzador entiende (lo busca con grep antes de aceptar un juego nuevo).
# shellcheck disable=SC2034
CONTRATO=1
REPO_POR_DEFECTO="junior17281728jr-bot/Jarvis"
RAMA_POR_DEFECTO="main"
PREVIA="$OPT.previa"
ANTERIOR="$OPT.anterior"
NUEVA="$OPT.nueva"
MALA="$OPT.mala"
TOPE_PRUEBAS=900
DISCO_MINIMO_MB=700

MODO="normal"       # normal | sha | reintentar | revisar
SHA_PEDIDO=""
ID_CORRIDA=""
REPO=""
RAMA=""
T=""
VISTA=""
RESULTADO=""

leer_ajustes() {
  local conf="$RAIZ/etc/oportia.conf" valor
  REPO="$REPO_POR_DEFECTO"
  RAMA="$RAMA_POR_DEFECTO"
  if [ -f "$conf" ] && [ ! -L "$conf" ]; then
    valor="$(sed -n 's/^REPO=\(.*\)$/\1/p' "$conf" | tail -n 1)"
    if [[ "$valor" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then REPO="$valor"; fi
    valor="$(sed -n 's/^RAMA=\(.*\)$/\1/p' "$conf" | tail -n 1)"
    if [[ "$valor" =~ ^[A-Za-z0-9._/-]+$ ]]; then RAMA="$valor"; fi
  fi
}

# Lee un archivo de una línea con un SHA de 40 letras (o nada). Nunca falla.
leer_sha() {
  local texto=""
  if [ -f "$1" ] && [ ! -L "$1" ]; then texto="$(head -c 64 -- "$1" 2>/dev/null | head -n 1 | tr -d '[:space:]')" || texto=""; fi
  if [[ "$texto" =~ ^[0-9a-f]{40}$ ]]; then printf '%s' "$texto"; fi
}

megas_libres() {
  local n
  n="$(sistema df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}')" || n=""
  if [[ "$n" =~ ^[0-9]+$ ]]; then printf '%s' "$n"; else printf '0'; fi
}

quitar_marca() {
  if [ -f "$EST/$1" ]; then mv -fT -- "$EST/$1" "$EST/$1.ultima"; fi
}

estado_del_enlace() {
  if [ -e "$EST/enlace-pendiente" ]; then printf 'pendiente'
  elif [ -e "$EST/enlace-encendido" ]; then printf 'encendido'
  else printf 'no_aplica'; fi
}

# Escribe el estado (copia de root) y lo publica para que la app lo LEA. Siempre, también cuando no hubo nada que hacer.
escribir_estado() {
  local resultado="$1" version vista ocupa libre actualizador json
  RESULTADO="$resultado"
  version="$(leer_sha "$DATOS/version.txt")"
  vista="$VISTA"
  libre="$(megas_libres "$DATOS")"
  ocupa="$(du -sm -- "$EST" 2>/dev/null | awk '{print $1}')" || ocupa=""
  [[ "$ocupa" =~ ^[0-9]+$ ]] || ocupa=0
  actualizador="$(juego_de "$LIB/actual" || true)"
  actualizador="${actualizador#v-}"
  json="{\"contrato\":1,\"revisado\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"resultado\":\"$resultado\""
  if [ -n "$version" ]; then json="$json,\"version\":\"$version\""; else json="$json,\"version\":null"; fi
  if [ -n "$vista" ]; then json="$json,\"vista\":\"$vista\""; else json="$json,\"vista\":null"; fi
  json="$json,\"actualizador\":\"$actualizador\",\"libre_mb\":$libre,\"ocupa_mb\":$ocupa,\"enlace\":\"$(estado_del_enlace)\"}"
  printf '%s\n' "$json" > "$EST/ultima-corrida.json.tmp"
  chmod 644 "$EST/ultima-corrida.json.tmp"
  mv -fT -- "$EST/ultima-corrida.json.tmp" "$EST/ultima-corrida.json"
  printf '%s\n' "$ID_CORRIDA" > "$EST/ultima-corrida.id"
  if [ -d "$DATOS" ]; then poner_texto "$DATOS/actualizador.json" "$json"; fi
}

terminar() {
  decir "$2"
  intentar_enlace
  escribir_estado "$1"
  exit 0
}

# Mientras el enlace público esté pendiente, cada corrida lo intenta una vez. Nunca «funnel reset».
intentar_enlace() {
  [ -e "$EST/enlace-pendiente" ] || return 0
  hay_orden tailscale || return 0
  sistema_con_tope 30 tailscale funnel --bg "$(puerto_app)" >/dev/null 2>&1 || true
  if sistema_con_tope 15 tailscale funnel status 2>/dev/null | grep -q 'Funnel on'; then
    quitar_marca enlace-pendiente
    : > "$EST/enlace-encendido"
    decir "El enlace público quedó encendido."
  fi
}

# ---------- Paso 0: reparar lo que una corrida cortada dejó ----------

carpeta_sobrante() {
  local ruta="$1"
  existe "$ruta" || return 0
  if [ -d "$ruta" ] && [ ! -L "$ruta" ] && [ -f "$ruta/.oportia-codigo" ]; then borrar_lo_mio "$ruta"; else apartar "$ruta"; fi
}

reparar() {
  local nuevo="" esperada="-" carpeta
  if [ -f "$EST/en-curso" ]; then
    nuevo="$(sed -n '1p' "$EST/en-curso")"
    esperada="$(sed -n '3p' "$EST/en-curso")"
    [[ "$nuevo" =~ ^[0-9a-f]{40}$ ]] || nuevo=""
    [[ "$esperada" =~ ^[0-9A-Za-z.+-]{1,40}$ ]] || esperada="-"
    if [ ! -d "$OPT" ] && [ -d "$PREVIA" ]; then
      decir "Una actualización se cortó a la mitad: devuelvo el código que estaba."
      mv -T -- "$PREVIA" "$OPT"
      sistema systemctl restart jarvis || true
      quitar_marca en-curso
    elif [ -d "$OPT" ] && [ -d "$PREVIA" ] && [ -n "$nuevo" ]; then
      decir "Una actualización se cortó antes de saber si quedó sana: reinicio y miro."
      if arrancar_y_salud restart "$esperada"; then quedo_sana "$nuevo"; else no_quedo_sana "$nuevo"; fi
    else
      quitar_marca en-curso
    fi
  elif [ ! -d "$OPT" ]; then
    if [ -d "$PREVIA" ]; then
      mv -T -- "$PREVIA" "$OPT"
      sistema systemctl restart jarvis || true
    elif [ -d "$ANTERIOR" ] && [ -f "$ANTERIOR/.oportia-codigo" ]; then
      mv -T -- "$ANTERIOR" "$OPT"
      sistema systemctl restart jarvis || true
    fi
  fi
  if existe "$PREVIA" && [ ! -f "$EST/en-curso" ] && [ -d "$OPT" ]; then apartar "$PREVIA"; fi
  carpeta_sobrante "$MALA"
  carpeta_sobrante "$NUEVA"
  # Solo las carpetas de corridas cortadas del propio actualizador (mías y con mi marca). Nada más de la carpeta temporal.
  for carpeta in "$RAIZ/tmp"/oportia-corrida.??????; do
    [ -d "$carpeta" ] && [ ! -L "$carpeta" ] || continue
    [ "$carpeta" != "$T" ] || continue
    if [ -O "$carpeta" ] && [ -f "$carpeta/.oportia-corrida" ] && [ -O "$carpeta/.oportia-corrida" ]; then borrar_lo_mio "$carpeta"; fi
  done
}

# ---------- Pasos 7 y 8 ----------

quedo_sana() {
  local sha="$1"
  poner_texto "$DATOS/version.txt" "$sha"
  agregar_linea "$(date -Is) actualizado a ${sha:0:7}"
  # Ahora sí rota: el código sano de antes pasa a «anterior».
  if existe "$ANTERIOR"; then
    if [ -d "$ANTERIOR" ] && [ ! -L "$ANTERIOR" ] && [ -f "$ANTERIOR/.oportia-codigo" ]; then borrar_lo_mio "$ANTERIOR"; else apartar "$ANTERIOR"; fi
  fi
  if [ -d "$PREVIA" ]; then mv -T -- "$PREVIA" "$ANTERIOR"; fi
  quitar_marca en-curso
  decir "✔ Quedó instalada y sana la versión ${sha:0:7}."
  actualizarme "$sha" || true
  RESULTADO="actualizado"
}

no_quedo_sana() {
  local sha="$1" habia_previa=no
  decir "La versión ${sha:0:7} no arrancó bien: vuelvo al código anterior (los datos no se tocan)."
  carpeta_sobrante "$MALA"
  mv -T -- "$OPT" "$MALA"
  if [ -d "$PREVIA" ]; then mv -T -- "$PREVIA" "$OPT"; fi
  # ¿Había de verdad una versión anterior? (en la primera instalación la carpeta solo traía el .env)
  if [ -f "$OPT/src/server.js" ]; then habia_previa=si; else sistema systemctl stop jarvis || true; fi
  if [ "$MODO" != "sha" ]; then poner_texto "$DATOS/version.bad" "$sha"; fi
  agregar_linea "$(date -Is) versión ${sha:0:7} no arrancó: volví a la anterior"
  quitar_marca en-curso
  carpeta_sobrante "$MALA"
  if [ "$habia_previa" = si ] && arrancar_y_salud restart -; then
    RESULTADO="revertida"
  else
    RESULTADO="revertida_sin_arrancar"
    if [ "$habia_previa" = si ]; then aviso "la versión anterior tampoco arrancó"; fi
  fi
}

# Paso 8: el actualizador se cambia a sí mismo SOLO después de una actualización sana, y solo si su juego nuevo pasa su
# propia revisión. El que está corriendo no se toca (ya está leído entero).
actualizarme() {
  local sha="$1" origen="$T/limpio/deploy" sha7="${1:0:7}" actual
  [ -d "$origen" ] || return 0
  actual="$(juego_de "$LIB/actual" || true)"
  if [ -n "$actual" ] && mismo_juego "$origen" "$LIB/$actual"; then return 0; fi
  if [ "$actual" = "v-$sha7" ]; then return 0; fi
  if ! armar_juego "$origen" "$sha7"; then
    aviso "el actualizador de la versión $sha7 no pasó su revisión; sigo con el de antes"
    return 0
  fi
  if ! timeout 30 bash "$LIB/v-$sha7/oportia-actualizar.sh" --autoprueba >/dev/null 2>&1; then
    aviso "el actualizador de la versión $sha7 no pasó su revisión; sigo con el de antes"
    return 0
  fi
  : > "$LIB/v-$sha7/.completa"
  if [ -n "$actual" ]; then cambiar_enlace "$actual" "$LIB/anterior"; fi
  cambiar_enlace "v-$sha7" "$LIB/actual"
  decir "El actualizador también se renovó (juego v-$sha7; el de antes queda guardado)."
}

# Solo mira (no cambia nada): lo que un juego nuevo necesita para trabajar en este servidor.
autoprueba() {
  local orden
  for orden in curl systemctl setpriv chown df; do
    hay_orden "$orden" || { printf 'falta %s\n' "$orden"; exit 1; }
  done
  for orden in tar flock timeout sha256sum dd stat mktemp realpath; do
    command -v "$orden" >/dev/null 2>&1 || { printf 'falta %s\n' "$orden"; exit 1; }
  done
  carpeta_de_node >/dev/null || { printf 'falta node\n'; exit 1; }
  [ -d "$EST" ] && [ -d "$LIB" ] || { printf 'faltan mis carpetas\n'; exit 1; }
  printf 'autoprueba bien\n'
  exit 0
}

# ---------- Pasos 1 a 6 ----------

bajar_y_abrir() {
  local sha="$1"
  if ! sistema curl -fsSL -m 180 --max-filesize 52428800 -o "$T/codigo.tgz" "https://codeload.github.com/$REPO/tar.gz/$sha" 2>/dev/null; then return 1; fi
  # «limpio»: la copia de root, que las pruebas nunca tocan. De AQUÍ se instala. (Las pruebas corren en otra copia.)
  abrir_en "$T/limpio"
}

abrir_en() {
  local carpeta="$1"
  mkdir -- "$carpeta"
  tar --no-same-owner --no-same-permissions -xzf "$T/codigo.tgz" -C "$carpeta" --strip-components=1 2>/dev/null || return 1
  [ -f "$carpeta/src/server.js" ] && [ -d "$carpeta/public" ] && [ -f "$carpeta/deploy/oportia-actualizar.sh" ] \
    && [ -f "$carpeta/package.json" ] && [ -d "$carpeta/test" ] || return 1
  return 0
}

# La versión de package.json nueva (y comprueba que el Node de este servidor le alcanza). Sin salida = no sirve.
version_nueva() {
  local nodo
  nodo="$(carpeta_de_node)/node" || return 1
  "$nodo" -e '
    const p = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const pide = /^>=\s*(\d+)(?:\.(\d+))?/.exec(String(p.engines?.node ?? ""));
    const [a, b] = process.versions.node.split(".").map(Number);
    if (pide && (a < Number(pide[1]) || (a === Number(pide[1]) && b < Number(pide[2] ?? 0)))) process.exit(3);
    if (!/^[0-9A-Za-z.+-]{1,40}$/.test(String(p.version))) process.exit(4);
    process.stdout.write(String(p.version));
  ' "$T/limpio/package.json"
}

# Las pruebas de la versión nueva, como «nobody» (nunca como root): 0 pasaron · 1 fallaron · 124 vencieron.
correr_pruebas() {
  local vuelta="$1" carpeta_node tope="$TOPE_PRUEBAS" codigo=0 p="$T/p$1"
  carpeta_node="$(carpeta_de_node)" || return 1
  if [ "${OPORTIA_PRUEBA:-}" = "1" ] && [ -n "${OPORTIA_TOPE_PRUEBAS:-}" ]; then tope="$OPORTIA_TOPE_PRUEBAS"; fi
  # Cada corrida de las pruebas tiene su carpeta ENTERA de «nobody»: una copia nueva del código (src), su carpeta
  # temporal (t) y su casa. Las pruebas de la app también escriben junto al código (…/oportia-pruebas): por eso la
  # carpeta de arriba es de «nobody» y no solo «src». Todo queda dentro de la corrida y se va con ella.
  mkdir -- "$p"
  abrir_en "$p/src" || return 1
  mkdir -- "$p/t" "$p/casa"
  sistema chown -R nobody:nogroup "$p"
  (
    cd "$p/src" || exit 1
    # shellcheck disable=SC2035
    sistema setpriv --reuid=nobody --regid=nogroup --clear-groups \
      env -i "PATH=$carpeta_node:/usr/local/bin:/usr/bin:/bin" "HOME=$p/casa" "TMPDIR=$p/t" \
      timeout "$tope" node --no-warnings --test test/*.test.js
  ) > "$T/prueba$vuelta.log" 2>&1 </dev/null || codigo=$?
  return "$codigo"
}

guardar_prueba_fallida() {
  local destino="$EST/ultima-prueba-fallida.log"
  {
    printf 'Versión %s, %s\n' "$1" "$(date -Is)"
    for vuelta in 1 2; do
      if [ -f "$T/prueba$vuelta.log" ]; then
        printf '\n===== corrida %s (el final) =====\n' "$vuelta"
        tail -c 95000 -- "$T/prueba$vuelta.log"
      fi
    done
  } > "$destino.tmp" 2>/dev/null || true
  chmod 600 "$destino.tmp"
  mv -fT -- "$destino.tmp" "$destino"
}

# Paso 5: armar al lado y cambiar de nombre. Nunca se copia sobre el código vivo.
armar_y_cambiar() {
  local sha="$1" anterior="$2" esperada="$3" cosa nombre
  mkdir -p -- "${OPT%/*}"
  mkdir -- "$NUEVA"
  : > "$NUEVA/.oportia-codigo"
  for cosa in src public deploy package.json; do
    cp -R --no-preserve=mode,ownership -- "$T/limpio/$cosa" "$NUEVA/$cosa"
  done
  # Lo demás que hubiera en la carpeta de la app (el .env y lo que sea) viaja tal cual, con su dueño.
  if [ -d "$OPT" ]; then
    for cosa in "$OPT"/* "$OPT"/.[!.]* "$OPT"/..?*; do
      existe "$cosa" || continue
      nombre="${cosa##*/}"
      case "$nombre" in
        src|public|deploy|package.json|.oportia-codigo|.completa) continue ;;
      esac
      cp -a -- "$cosa" "$NUEVA/$nombre"
    done
  fi
  chmod -R go-w -- "$NUEVA/src" "$NUEVA/public" "$NUEVA/deploy" "$NUEVA/package.json"
  chmod 755 "$NUEVA"
  : > "$NUEVA/.completa"
  printf '%s\n%s\n%s\n' "$sha" "$anterior" "$esperada" > "$EST/en-curso"
  if [ -d "$OPT" ]; then mv -T -- "$OPT" "$PREVIA"; fi
  mv -T -- "$NUEVA" "$OPT"
}

corrida() {
  local instalada mala libre_tmp libre_opt esperada codigo=0
  mkdir -p -- "$EST" "$RAIZ/tmp"
  REGISTRO="$EST/pasos.log"
  # La carpeta de ESTA corrida (se va entera al terminar, con los temporales de las pruebas adentro). Va en la carpeta
  # temporal del sistema a propósito: las pruebas de la app solo pasan si su carpeta temporal está ahí debajo.
  T="$(mktemp -d "$RAIZ/tmp/oportia-corrida.XXXXXX")"
  PROPIA="$T"
  : > "$T/.oportia-corrida"
  chmod 711 "$T"
  if [ "$MODO" != "revisar" ]; then reparar; fi
  if [ -n "$RESULTADO" ]; then
    # La reparación terminó una actualización que había quedado a medias: con eso basta por esta vez.
    intentar_enlace
    escribir_estado "$RESULTADO"
    exit 0
  fi
  leer_ajustes
  instalada="$(leer_sha "$DATOS/version.txt")"
  mala="$(leer_sha "$DATOS/version.bad")"

  # Paso 1: ¿qué versión hay?
  if [ "$MODO" = "sha" ]; then
    VISTA="$SHA_PEDIDO"
  else
    VISTA="$(sistema curl -fsS -m 20 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/$RAMA" 2>/dev/null)" || VISTA=""
    if ! [[ "$VISTA" =~ ^[0-9a-f]{40}$ ]]; then
      VISTA=""
      terminar sin_red "No pude preguntar a GitHub qué versión hay (sin internet, o contestó otra cosa). No cambié nada."
    fi
  fi
  if [ "$VISTA" = "$instalada" ] && [ -f "$OPT/src/server.js" ]; then terminar al_dia "Ya tienes la última versión (${VISTA:0:7})."; fi
  if [ "$MODO" = "revisar" ]; then terminar hay_nueva "Hay una versión nueva (${VISTA:0:7}). Solo miré: no instalé nada."; fi
  if [ "$VISTA" = "$mala" ]; then
    if [ "$MODO" = "reintentar" ]; then
      apartar "$DATOS/version.bad"
    elif [ "$MODO" != "sha" ]; then
      terminar mala_conocida "La versión ${VISTA:0:7} ya se probó y no sirvió: espero la siguiente. (Para probarla otra vez: sudo oportia actualizar --reintentar)"
    fi
  fi

  # Paso 2: disco.
  libre_tmp="$(megas_libres "$RAIZ/tmp")"
  libre_opt="$(megas_libres "${OPT%/*}")"
  if [ "$libre_tmp" -lt "$DISCO_MINIMO_MB" ] || [ "$libre_opt" -lt "$DISCO_MINIMO_MB" ]; then
    if [ "$(cat "$EST/sin-disco" 2>/dev/null || true)" != "$VISTA" ]; then
      aviso "no hay disco para probar la versión ${VISTA:0:7}"
      printf '%s\n' "$VISTA" > "$EST/sin-disco"
    fi
    terminar sin_disco "No hay disco libre para probar la versión nueva. No la marqué como mala: se probará cuando haya espacio."
  fi

  # Paso 3: bajar.
  decir "Bajo la versión ${VISTA:0:7}…"
  if ! bajar_y_abrir "$VISTA"; then terminar sin_red "No pude bajar la versión ${VISTA:0:7} (o vino incompleta). No cambié nada."; fi

  # Paso 4: pruebas primero, y nunca como root.
  if ! hay_orden setpriv; then
    aviso "falta setpriv: no corro las pruebas como root, la versión ${VISTA:0:7} no se instaló"
    terminar no_instalada "No se instaló."
  fi
  if ! esperada="$(version_nueva)" || [ -z "$esperada" ]; then
    codigo=1
    printf 'El Node de este servidor no alcanza para esta versión, o su package.json no se pudo leer.\n' > "$T/prueba1.log"
  else
    decir "Corro todas las pruebas de la versión nueva (puede tardar varios minutos)…"
    correr_pruebas 1 || codigo=$?
    if [ "$codigo" -ne 0 ] && [ "$codigo" -ne 124 ]; then
      decir "Alguna prueba falló. Las repito una vez antes de decidir…"
      codigo=0
      correr_pruebas 2 || codigo=$?
    fi
  fi
  if [ "$codigo" -ne 0 ]; then
    guardar_prueba_fallida "$VISTA"
    agregar_linea "$(date -Is) versión ${VISTA:0:7}: alguna prueba falló, NO se instaló"
    if [ "$MODO" != "sha" ]; then poner_texto "$DATOS/version.bad" "$VISTA"; fi
    terminar no_instalada "✖ La versión ${VISTA:0:7} no pasó sus pruebas: NO se instaló. Todo sigue como estaba."
  fi

  # Pasos 5 a 8.
  decir "Las pruebas pasaron. Instalo y reviso que arranque…"
  armar_y_cambiar "$VISTA" "$instalada" "$esperada"
  if arrancar_y_salud restart "$esperada"; then quedo_sana "$VISTA"; else no_quedo_sana "$VISTA"; fi
  intentar_enlace
  escribir_estado "$RESULTADO"
  exit 0
}

principal() {
  local argumento
  revisar_modo
  for argumento in "$@"; do
    case "$argumento" in
      --autoprueba) autoprueba ;;
    esac
  done
  local es_corrida=no
  for argumento in "$@"; do
    case "$argumento" in
      --corrida) es_corrida=si ;;
      --sha=*)
        SHA_PEDIDO="${argumento#--sha=}"
        [[ "$SHA_PEDIDO" =~ ^[0-9a-f]{40}$ ]] || fallar "--sha necesita las 40 letras de la versión"
        MODO="sha"
        ;;
      --reintentar) MODO="reintentar" ;;
      --solo-revisar) MODO="revisar" ;;
      --id=*) ID_CORRIDA="${argumento#--id=}" ;;
      *) fallar "No entiendo «$argumento». Esto lo llama el lanzador: usa «sudo oportia actualizar»." ;;
    esac
  done
  [ "$es_corrida" = si ] || fallar "Esto lo llama el lanzador: usa «sudo oportia actualizar»."
  [[ "$ID_CORRIDA" =~ ^[A-Za-z0-9-]{0,40}$ ]] || ID_CORRIDA=""
  trap al_salir EXIT
  corrida
}

principal "$@" </dev/null
exit $?
