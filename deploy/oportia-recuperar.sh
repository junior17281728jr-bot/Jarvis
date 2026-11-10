#!/bin/bash
# OPORTIA: recuperar los datos en un servidor (envuelve deploy/oportia-restaurar.mjs, sin cambiar su contrato).
# recuperar: trae la última copia (Telegram o archivos), la comprueba, APARTA lo que haya (base y, si era de esa base,
# la llave de las claves; nunca borra ni pisa), pone la recuperada, arranca y mira la salud; si no arranca, deshace solo.
# probar-copia: solo comprueba (no escribe ninguna base ni apaga nada).
# shellcheck disable=SC2034
set -euo pipefail
IFS=$'\n\t'
umask 022
export LC_ALL=C.UTF-8
# En las pruebas el PATH lo pone la prueba (solo trae lo que hace falta); en el servidor es siempre este.
if [ "${OPORTIA_PRUEBA:-}" != "1" ]; then PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
export PATH

AQUI=""
NODO=""
SIMULACRO=no
BASE=""

fecha_nombre() { date +%Y%m%d-%H%M%S; }

# Un nombre que todavía no existe (dos órdenes en el mismo segundo nunca chocan ni pisan).
nombre_libre() {
  local base="$1" nombre="$1" n=1
  while existe "$nombre"; do
    n=$((n + 1))
    nombre="$base-$n"
  done
  printf '%s' "$nombre"
}

# De dónde lee el programa de recuperar lo que escribe la persona: la terminal (en las pruebas, un archivo).
terminal_de_entrada() {
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then printf '%s' "${OPORTIA_TERMINAL:-/dev/null}"; else printf '%s' "/dev/tty"; fi
}

como_jarvis() {
  sistema runuser -u jarvis -- env "OPORTIA_ENV_FILE=$OPT/.env" "$NODO" --no-warnings "$@"
}

esperar_apagado() {
  local n=0 estado
  while [ "$n" -lt 30 ]; do
    estado="$(sistema systemctl is-active jarvis 2>/dev/null || true)"
    if [ "$estado" != "active" ] && [ "$estado" != "activating" ] && [ "$estado" != "deactivating" ]; then return 0; fi
    n=$((n + 1))
    sleep 1
  done
  return 1
}

huella_de() { sha256sum -- "$1" | cut -d' ' -f1; }

# ---------- poner: la base recuperada entra en su sitio. Lo que había se APARTA junto (nunca se borra ni se pisa). ----------
poner() {
  local recuperada="$1" veredicto="sin_llave" salida apartado="" marca huella tamano sufijo archivo nombre linea_llave n
  local -a llaves=() movidos=()
  [ -f "$recuperada" ] && [ ! -L "$recuperada" ] || fallar "No encuentro la base recuperada. No cambié nada."
  case "$recuperada" in
    "$DATOS"/recuperar-*/recuperada.db) ;;
    *) fallar "La base recuperada no está donde debe. No cambié nada." ;;
  esac
  decir "Apago OPORTIA un momento para poner la base recuperada…"
  sistema systemctl stop jarvis || true
  esperar_apagado || fallar "OPORTIA no terminó de apagarse. No cambié nada."

  # ¿De quién es la llave de las claves que hay en este servidor? (lo dice un programa de solo lectura)
  salida="$(como_jarvis "$OPT/deploy/oportia-base.mjs" --llave "$recuperada" 2>/dev/null || true)"
  veredicto="$(printf '%s\n' "$salida" | sed -n '1s/^llave \(sirve\|sin_claves\|ajena\|sin_llave\)$/\1/p')"
  if [ -z "$veredicto" ]; then
    sistema systemctl start jarvis || true
    fallar "No pude revisar la base recuperada. No cambié nada (OPORTIA quedó encendido como estaba)."
  fi
  while IFS= read -r linea_llave; do
    case "$linea_llave" in
      "archivo $DATOS/"*) llaves+=("${linea_llave#archivo }") ;;
    esac
  done <<< "$salida"

  marca="$(fecha_nombre)"
  n=1
  while existe "$DATOS/apartado-$marca" || existe "$DATOS/oportia.db.recuperada-no-arranco-$marca"; do
    n=$((n + 1))
    marca="$(fecha_nombre)-$n"
  done
  if existe "$BASE" || { [ "$veredicto" = "ajena" ] && [ "${#llaves[@]}" -gt 0 ]; }; then
    apartado="$DATOS/apartado-$marca"
    mkdir -- "$apartado" || fallar "No pude crear la carpeta para apartar. No cambié nada."
    chmod 700 "$apartado"
    for sufijo in "" "-wal" "-shm"; do
      if existe "$BASE$sufijo"; then
        mover_sin_pisar "$BASE$sufijo" "$apartado/oportia.db$sufijo" || fallar "No pude apartar la base que había."
        movidos+=("oportia.db$sufijo")
      fi
    done
    if [ "$veredicto" = "ajena" ]; then
      # La llave va con la base a la que pertenece: fuera de la carpeta de datos la app no la ve.
      for archivo in "${llaves[@]}"; do
        nombre="${archivo##*/}"
        if [ "$archivo" = "$DATOS/$nombre" ] && [ -f "$archivo" ] && [ ! -L "$archivo" ]; then
          mover_sin_pisar "$archivo" "$apartado/$nombre" || fallar "No pude apartar la llave de la base que había."
          movidos+=("$nombre")
        fi
      done
    fi
    printf '%s\n' "OPORTIA: lo que había en este servidor antes de recuperar una copia ($(date -Is))." \
      "Nada se borró. Para volver a esto: con OPORTIA apagado, devuelve estos archivos a la carpeta de datos con sus nombres." \
      "Archivos: ${movidos[*]}" > "$apartado/LEEME.txt"
    sistema chown jarvis:jarvis "$apartado"
    decir "Lo que había quedó APARTADO (no borrado) en $apartado"
  fi

  huella="$(huella_de "$recuperada")"
  tamano="$(stat -c '%s' -- "$recuperada")"
  mover_sin_pisar "$recuperada" "$BASE" || fallar "Ya hay una base en su sitio: no la pisé."
  if existe "$recuperada-wal"; then mover_sin_pisar "$recuperada-wal" "$BASE-wal" || true; fi
  if [ "$(stat -c '%s' -- "$BASE")" != "$tamano" ] || [ "$(huella_de "$BASE")" != "$huella" ]; then fallar "La base que quedó en su sitio no es la recuperada. Avísale a Claude."; fi

  decir "Enciendo OPORTIA con la base recuperada y miro que arranque (hasta unos minutos)…"
  if arrancar_y_salud start - 300; then
    case "$veredicto" in
      sirve) decir "Tus claves de IA siguen guardadas en este servidor; solo cambia el token del bot." ;;
      ajena) decir "La llave de las claves que había era de otra base: quedó apartada con ella. Pega otra vez tus claves en Administrador → Claves." ;;
      *) : ;;
    esac
    return 0
  fi

  # No arrancó: se deshace solo. Nada se borra.
  decir "OPORTIA no arrancó bien con la base recuperada: deshago el cambio."
  sistema systemctl stop jarvis || true
  esperar_apagado || true
  for sufijo in "" "-wal" "-shm"; do
    if existe "$BASE$sufijo"; then mover_sin_pisar "$BASE$sufijo" "$DATOS/oportia.db.recuperada-no-arranco-$marca$sufijo" || fallar "No pude apartar la base recuperada. Avísale a Claude."; fi
  done
  if [ -n "$apartado" ]; then
    for nombre in "${movidos[@]}"; do
      mover_sin_pisar "$apartado/$nombre" "$DATOS/$nombre" || fallar "No pude devolver $nombre desde $apartado. Avísale a Claude."
    done
  fi
  if existe "$BASE" || [ "${#movidos[@]}" -eq 0 ]; then
    if arrancar_y_salud start -; then decir "Todo volvió a como estaba y OPORTIA arrancó bien."; else decir "⚠ Todo volvió a su sitio, pero OPORTIA no contestó bien: avísale a Claude."; fi
  fi
  decir "La base recuperada (que no arrancó) quedó guardada como oportia.db.recuperada-no-arranco-$marca"
  return 1
}

# ---------- Traer la copia (lo delicado lo hace el programa de la parte 1e, como el usuario «jarvis») ----------
TRABAJO=""
LLEGADOS=""

# Los archivos llegan UNA vez a una carpeta de root (ahí se quedan: nada se borra).
recibir_archivos() {
  local llegados
  mkdir -p -- "$EST"
  llegados="$(mktemp -d "$EST/llegados.XXXXXX")"
  chmod 700 "$llegados"
  LLEGADOS="$llegados"
  printf '%s\n' "Desde tu Mac o tu iPhone: selecciona los archivos de la copia (las partes y el «…-indice.txt») →" "Compartir → Tailscale → jarvis. Cuando termine de mandarlos, vuelve aquí."
  preguntar "Pulsa Enter cuando ya los hayas mandado: " || true
  if hay_orden tailscale; then sistema_con_tope 120 tailscale file get --conflict=rename "$llegados" >/dev/null 2>&1 || true; fi
  if [ -z "$(ls -A -- "$llegados" 2>/dev/null)" ]; then
    printf '%s\n' "No llegó ningún archivo. Si los tienes de otra forma, ponlos en esta carpeta del servidor:" "  $llegados"
    preguntar "Pulsa Enter cuando estén ahí (o Enter para dejarlo): " || true
  fi
  [ -n "$(ls -A -- "$llegados" 2>/dev/null)" ] || fallar "No hay archivos de la copia. No cambié nada."
}

# Cada intento trabaja sobre una COPIA de esos archivos, a nombre de «jarvis» (los originales quedan donde llegaron).
copiar_archivos() {
  local archivo
  mkdir -- "$TRABAJO/archivos"
  for archivo in "$LLEGADOS"/*; do
    if [ -f "$archivo" ] && [ ! -L "$archivo" ]; then
      cp -- "$archivo" "$TRABAJO/archivos/${archivo##*/}"
      chmod 640 "$TRABAJO/archivos/${archivo##*/}"
    fi
  done
  [ -n "$(ls -A -- "$TRABAJO/archivos" 2>/dev/null)" ] || fallar "No hay archivos de la copia. No cambié nada."
}

# traer <recuperar|comprobar> → 0 con la copia lista (TRABAJO/recuperada.db si es recuperar)
traer() {
  local para="$1" de_donde codigo intento=1
  local -a opciones
  printf '%s\n' "" "¿De dónde traigo tu copia?" "  1) De tu Telegram (lo normal)" "  2) De archivos que tú mandas"
  preguntar "Escribe 1 o 2 y pulsa Enter: " || fallar "No hay terminal para preguntar. No cambié nada."
  de_donde="$RESPUESTA"
  if [ "$de_donde" != "1" ] && [ "$de_donde" != "2" ]; then fallar "No entendí. No cambié nada."; fi
  if [ "$de_donde" = "2" ]; then recibir_archivos; fi
  while :; do
    TRABAJO="$(nombre_libre "$DATOS/recuperar-$(fecha_nombre)")"
    mkdir -- "$TRABAJO" || fallar "No pude crear la carpeta de trabajo. No cambié nada."
    chmod 750 "$TRABAJO"
    opciones=()
    if [ "$de_donde" = "1" ]; then
      opciones+=("--telegram" "--trabajo=$TRABAJO/partes")
    else
      copiar_archivos
      opciones+=("--archivos=$TRABAJO/archivos")
    fi
    if [ "$para" = "comprobar" ]; then opciones+=("--comprobar"); else opciones+=("--destino=$TRABAJO/recuperada.db"); fi
    sistema chown -R jarvis:jarvis "$TRABAJO"
    printf '%s\n' "" "Lo que pegues ahora NO se verá en la pantalla. Es normal: pega y pulsa Enter." ""
    codigo=0
    como_jarvis "$OPT/deploy/oportia-restaurar.mjs" "${opciones[@]}" < "$(terminal_de_entrada)" | tee "$PROPIA/salida-del-programa" || codigo=$?
    case "$codigo" in
      0)
        # Que saliera «bien» no basta: tiene que haber dicho que comprobó la copia (o haber dejado la base).
        if [ "$para" = "comprobar" ] && ! grep -q 'Copia comprobada' "$PROPIA/salida-del-programa"; then fallar "El programa terminó sin comprobar la copia. No cambié nada. Avísale a Claude."; fi
        return 0
        ;;
      3)
        if [ "$intento" -ge 3 ]; then fallar "Esa clave no abrió la copia (3 intentos). No cambié nada."; fi
        printf '%s\n' "Esa clave no abrió la copia. Probemos otra vez."
        intento=$((intento + 1))
        sleep 1
        ;;
      6) fallar "Telegram no contestó: prueba en unos minutos. No cambié nada." ;;
      8) fallar "Cancelado: no se cambió nada." ;;
      *) fallar "No se pudo traer la copia (código $codigo). No cambié nada. Mándale a Claude lo que salió arriba." ;;
    esac
  done
}

revision() {
  [ -f "$UNIDADES/jarvis.service" ] || fallar "OPORTIA todavía no está instalado en este servidor."
  [ -n "$NODO" ] || fallar "No encuentro Node."
  [ -f "$OPT/deploy/oportia-restaurar.mjs" ] && [ -f "$OPT/deploy/oportia-base.mjs" ] || fallar "La app todavía no está instalada. Primero: sudo oportia actualizar"
  [ -d "$DATOS" ] || fallar "No encuentro la carpeta de datos."
}

recuperar() {
  local datos usuarios=0 proyectos=0 nombre
  revision
  [ "$(megas_libres "$DATOS")" -ge 1000 ] || fallar "Hay menos de 1 GB libre en el disco. No cambié nada."
  tomar_candados || fallar "Hay una actualización corriendo ahora mismo: prueba en 5 minutos. No cambié nada."
  mkdir -p -- "$EST"
  REGISTRO="$EST/pasos.log"
  if existe "$BASE"; then
    datos="$(como_jarvis "$OPT/deploy/oportia-base.mjs" "$BASE" 2>/dev/null | sed -n 's/^base \([0-9]*\) \([0-9]*\) \([0-9]*\)$/\1 \2/p' | head -n 1)" || datos=""
    if [ -n "$datos" ]; then
      usuarios="${datos%% *}"
      proyectos="${datos##* }"
    else
      usuarios="?"
    fi
    if [ "$usuarios" = "0" ]; then
      printf '%s\n' "Este servidor está vacío. Sigo."
    else
      printf '%s\n' "⚠ Este servidor YA tiene datos ($usuarios usuarios, $proyectos proyectos)." "Recuperar una copia los APARTA (no los borra) y pone los de la copia." "Si solo quieres probar que tu copia sirve: sudo oportia probar-copia"
      preguntar "Para seguir escribe APARTAR y pulsa Enter (cualquier otra cosa: no hago nada): " || fallar "No hay terminal para preguntar. No cambié nada."
      if [ "$RESPUESTA" != "APARTAR" ]; then
        printf '%s\n' "No cambié nada."
        exit 0
      fi
    fi
  fi
  traer recuperar
  [ -f "$TRABAJO/recuperada.db" ] || fallar "El programa terminó pero no dejó la base recuperada. No cambié nada."
  if ! poner "$TRABAJO/recuperada.db"; then exit 1; fi
  nombre="$(dato_tailscale nombre)"
  printf '\n'
  decir "✔ Tus datos volvieron. Abre ${nombre:+https://$nombre }OPORTIA y entra con tu usuario y contraseña de siempre."
  if [ "$SIMULACRO" = si ]; then
    como_jarvis "$OPT/deploy/oportia-admin.mjs" --modo-seguro=si >/dev/null 2>&1 || true
    decir "ESTO ES UN ENSAYO: no pegues el token aquí ni hagas /revoke. Este servidor quedó en modo seguro (no manda nada a tu chat)."
  else
    decir "Ahora: 1) en @BotFather escribe /revoke y elige tu bot (te da un token NUEVO); 2) pega ese token y tus claves de IA en"
    decir "Administrador → Claves; 3) crea en Administrador → Copias una clave de recuperación nueva. La app también te lo recuerda."
  fi
  decir "Las partes cifradas que se bajaron quedaron en $TRABAJO ($(du -sm -- "$TRABAJO" 2>/dev/null | awk '{print $1}') MB). Nada se borró."
}

probar_copia() {
  revision
  printf '%s\n' "Esto solo COMPRUEBA que tu copia y tu clave sirven. No cambia nada y no apaga OPORTIA."
  traer comprobar
  printf '%s\n' "" "✔ Tu copia y tu clave sirven. No se cambió nada."
}

principal() {
  local palabra="${1:-}" argumento
  AQUI="$(dirname -- "$(realpath -- "$0")")"
  # shellcheck source=deploy/oportia-comun.sh
  . "$AQUI/oportia-comun.sh"
  revisar_modo
  BASE="$DATOS/oportia.db"
  carpeta_propia
  NODO="$(carpeta_de_node 2>/dev/null || true)"
  if [ -n "$NODO" ]; then NODO="$NODO/node"; fi
  if [ "$#" -gt 0 ]; then shift; fi
  for argumento in "$@"; do
    case "$argumento" in
      --simulacro) SIMULACRO=si ;;
      *) if [ "$palabra" != "poner" ]; then fallar "No entiendo «$argumento»."; fi ;;
    esac
  done
  case "$palabra" in
    recuperar) recuperar ;;
    probar-copia) probar_copia ;;
    poner)
      # Interno (lo usan las pruebas y Claude): oportia-recuperar.sh poner <…/recuperar-…/recuperada.db>
      revision
      tomar_candados || fallar "Hay una actualización corriendo ahora mismo."
      mkdir -p -- "$EST"
      REGISTRO="$EST/pasos.log"
      poner "${1:-}"
      ;;
    *) fallar "Usa: sudo oportia recuperar | sudo oportia probar-copia" ;;
  esac
}

principal "$@" </dev/null
exit $?
