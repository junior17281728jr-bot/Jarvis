#!/bin/bash
# OPORTIA: órdenes del servidor. estado y revisar solo miran. pasar cambia el servidor de hoy al actualizador nuevo
# (copia primero; si algo falla, vuelve solo). volver deshace. servicio cambia el archivo del servicio (con copia y
# vuelta atrás). tailscale une el servidor a la red privada. Ninguna toca datos, cortafuegos ni Node.
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
BLOQUEO=""
RESP=""
CRON=""

linea() { printf '  %-26s %s\n' "$1" "$2"; }

bloquear() {
  if [ -z "$BLOQUEO" ]; then BLOQUEO="$1"; fi
  linea "✖" "$1"
}

dato_unidad() {
  local unidad="$UNIDADES/jarvis.service"
  if [ -f "$unidad" ]; then sed -n "s/^$1=//p" "$unidad" | tail -n 1; fi
}

ultima_linea() {
  if [ -f "$1" ] && [ ! -L "$1" ]; then tail -n 1 -- "$1" 2>/dev/null | cut -c1-160; fi
}

# Lo que dice la base (lo cuenta un programa de solo lectura, como el usuario «jarvis»): usuarios|proyectos|migracion
datos_de_base() {
  [ -f "$OPT/deploy/oportia-base.mjs" ] && [ -f "$1" ] || return 1
  sistema runuser -u jarvis -- "$NODO" --no-warnings "$OPT/deploy/oportia-base.mjs" "$1" 2>/dev/null | sed -n 's/^base \([0-9]*\) \([0-9]*\) \([0-9]*\)$/\1|\2|\3/p' | head -n 1
}

usa_el_nuevo() {
  ! existe "$CRON" && sistema systemctl is-enabled oportia-actualizar.timer >/dev/null 2>&1
}

# Todo lo que se mira antes de «pasar». No cambia nada. Deja en BLOQUEO el primer motivo para no pasar (o vacío).
revisiones() {
  local version paquete valor libre base
  BLOQUEO=""
  printf '%s\n' "OPORTIA: revisión del servidor (no cambia nada)" ""
  version="$(leer_sha "$DATOS/version.txt")"
  linea "Versión instalada:" "${version:0:7}"
  paquete=""
  if [ -f "$OPT/package.json" ] && [ -n "$NODO" ]; then
    paquete="$("$NODO" -e 'try { const v = String(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).version); if (/^[0-9A-Za-z.+-]{1,40}$/.test(v)) process.stdout.write(v); } catch { /* sin dato */ }' "$OPT/package.json" 2>/dev/null || true)"
  fi
  linea "Versión de la app:" "${paquete:-no la pude leer}"
  if existe "$CRON"; then linea "Actualizador:" "el de antes (cron cada 30 minutos)"
  elif usa_el_nuevo; then linea "Actualizador:" "el nuevo (temporizador)"
  else linea "Actualizador:" "ninguno encendido"; fi
  linea "Última línea del registro:" "$(ultima_linea "$DATOS/update.log")"
  printf '\n%s\n' "El servicio:"
  for valor in User KillMode ReadWritePaths LimitCORE ExecStart; do linea "  $valor" "$(dato_unidad "$valor")"; done
  if [ ! -f "$UNIDADES/jarvis.service" ]; then bloquear "No encuentro el archivo del servicio"; fi
  if [ "$(dato_unidad KillMode)" = "process" ]; then bloquear "El servicio usa KillMode=process (dejaría vivo al trabajador). Primero: sudo oportia servicio"; fi
  valor="$(dato_unidad User)"
  if [ -z "$valor" ] || [ "$valor" = "root" ]; then bloquear "El servicio corre como root. Primero: sudo oportia servicio"; fi
  printf '\n%s\n' "Carpetas del código (dueño y permisos):"
  for valor in "$RAIZ/opt" "$OPT" "$OPT/deploy"; do
    linea "  ${valor#"$RAIZ"}" "$(stat -c '%U:%G %a' -- "$valor" 2>/dev/null || printf 'no existe')"
  done
  if [ -d "$OPT" ] && [ "$(stat -c '%u' -- "$OPT" 2>/dev/null)" != "$(stat -c '%u' -- "$RAIZ/opt" 2>/dev/null)" ]; then
    linea "  ⚠" "la carpeta de la app no es de root: lo arregla sola la primera actualización del actualizador nuevo"
  fi
  printf '\n'
  if [ -n "$NODO" ]; then
    linea "Node:" "$("$NODO" --version 2>/dev/null || true)"
    if ! "$NODO" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1)' 2>/dev/null; then bloquear "El Node de este servidor es más viejo de lo que hace falta (22.13)"; fi
  else
    bloquear "No encuentro Node"
  fi
  if hay_orden setpriv; then linea "setpriv:" "está"; else bloquear "Falta setpriv (las pruebas no deben correr como root)"; fi
  linea "Memoria de apoyo (swap):" "$(sistema swapon --show --noheadings 2>/dev/null | head -n 1 || true)"
  libre="$(megas_libres "$DATOS")"
  linea "Disco libre:" "$libre MB"
  if [ "$libre" -lt 1000 ]; then bloquear "Hay menos de 1 GB libre en el disco"; fi
  linea "La carpeta temporal ocupa:" "$(du -sm -- "$RAIZ/tmp" 2>/dev/null | awk '{print $1}') MB (no se limpia nada; un reinicio del servidor suele vaciarla)"
  if hay_orden ufw; then linea "Cortafuegos (ufw):" "$(sistema ufw status 2>/dev/null | head -n 1 || true) (no lo toco)"; else linea "Cortafuegos (ufw):" "no está instalado (no lo toco)"; fi
  linea "Tailscale:" "$(dato_tailscale estado) $(dato_tailscale nombre)"
  if hay_orden tailscale; then linea "Enlace público:" "$(sistema_con_tope 15 tailscale funnel status 2>/dev/null | head -n 1 || true)"; fi
  if [ -f "$OPT/.env" ]; then linea "Ajustes (.env), solo nombres:" "$(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$OPT/.env" | tr '\n' ' ')"; fi
  if [ ! -f "$OPT/deploy/oportia-base.mjs" ]; then
    bloquear "Este servidor todavía no tiene la versión 0.6.0 (espera a que se actualice solo y prueba otra vez)"
  elif [ -f "$DATOS/oportia.db" ]; then
    base="$(datos_de_base "$DATOS/oportia.db" || true)"
    if [ -z "$base" ]; then bloquear "No pude leer la base"
    else
      linea "La base:" "${base%%|*} usuarios, cambio de base número ${base##*|}"
      if [ "${base##*|}" -lt 6 ]; then bloquear "La base todavía no está al día (cambio ${base##*|} de 6)"; fi
    fi
  fi
  printf '\n'
}

revisar() {
  revisiones
  if usa_el_nuevo; then
    printf '%s\n' "✔ Este servidor ya usa el actualizador nuevo. No hay nada que pasar."
  elif [ -n "$BLOQUEO" ]; then
    printf '%s\n' "✖ No lo pases todavía: $BLOQUEO"
  else
    printf '%s\n' "✔ Listo para pasar al actualizador nuevo"
  fi
}

respaldo_nuevo() {
  local n=1
  RESP="$EST/respaldo/$(date +%Y%m%d-%H%M%S)"
  mkdir -p -- "$EST/respaldo"
  chmod 700 "$EST/respaldo"
  while existe "$RESP"; do
    n=$((n + 1))
    RESP="$EST/respaldo/$(date +%Y%m%d-%H%M%S)-$n"
  done
  mkdir -- "$RESP"
  chmod 700 "$RESP"
}

# Devuelve el archivo de cron de antes (idéntico) desde el respaldo más nuevo que lo tenga. 1 si no hay ninguno.
devolver_cron() {
  local carpeta guardado=""
  if existe "$CRON"; then return 0; fi
  for carpeta in "$EST/respaldo"/*/; do
    if [ -f "${carpeta}jarvis-actualizar.cron" ]; then guardado="${carpeta}jarvis-actualizar.cron"; fi
  done
  [ -n "$guardado" ] || return 1
  cp -p -- "$guardado" "$CRON.oportia-nuevo"
  mover_sin_pisar "$CRON.oportia-nuevo" "$CRON" || return 1
  cmp -s -- "$guardado" "$CRON"
}

volver_por_dentro() {
  sistema systemctl disable --now oportia-actualizar.timer >/dev/null 2>&1 || true
  devolver_cron || decir "⚠ No pude devolver el archivo del actualizador de antes: avísale a Claude."
  if existe "$DATOS/actualizador.json"; then apartar "$DATOS/actualizador.json"; fi
}

pasos_de_pasar() {
  local sha7 resultado=""
  sha7="$(sha7_de_aqui "$AQUI")" || fallar "No sé de qué versión son estos programas."
  instalar_actualizador "$AQUI" "$sha7"
  if ! juego_de "$LIB/actual" >/dev/null || [ ! -f "$LIB/oportia-lanzador.sh" ] || [ ! -f "$UNIDADES/oportia-actualizar.timer" ]; then fallar "El actualizador nuevo no quedó bien puesto."; fi
  decir "Pruebo el actualizador nuevo sin instalar nada…"
  if [ -f "$EST/ultima-corrida.id" ]; then mv -fT -- "$EST/ultima-corrida.id" "$EST/ultima-corrida.id.ultima"; fi
  bash "$LIB/actual/oportia-actualizar.sh" --corrida --solo-revisar --id=pasar >/dev/null 2>&1 || fallar "El actualizador nuevo no pudo correr."
  if [ "$(cat "$EST/ultima-corrida.id" 2>/dev/null || true)" = "pasar" ] && [ -f "$EST/ultima-corrida.json" ]; then resultado="$(sed -n 's/.*"resultado":"\([a-z_]*\)".*/\1/p' "$EST/ultima-corrida.json")"; fi
  if [ "$resultado" = "sin_red" ]; then fallar "No hay internet ahora; prueba luego."; fi
  if [ "$resultado" != "al_dia" ] && [ "$resultado" != "hay_nueva" ]; then fallar "El actualizador nuevo no dejó su estado."; fi
  # El archivo del actualizador de antes se MUEVE al respaldo (no se borra); el programa de antes se queda en su sitio.
  mover_sin_pisar "$CRON" "$RESP/jarvis-actualizar.cron" || fallar "No pude mover el archivo del actualizador de antes."
  sistema systemctl enable --now oportia-actualizar.timer >/dev/null 2>&1 || fallar "No pude encender el temporizador nuevo."
  responde 30 || fallar "La app no contesta ahora mismo (yo no la reinicié)."
}

pasar() {
  local archivo
  revisiones
  if usa_el_nuevo; then
    printf '%s\n' "✔ Este servidor ya usa el actualizador nuevo. No cambié nada."
    exit 0
  fi
  if [ -n "$BLOQUEO" ]; then
    printf '%s\n' "✖ No lo pasé: $BLOQUEO. No cambié nada."
    exit 1
  fi
  existe "$CRON" || fallar "No encuentro el actualizador de antes. No cambié nada."
  tomar_candados || fallar "Hay una actualización corriendo ahora mismo: prueba en 5 minutos. No cambié nada."
  mkdir -p -- "$EST"
  REGISTRO="$EST/pasos.log"
  # Copia primero: del código, de los archivos del sistema que se tocan, y de los DATOS (aunque no se tocan).
  decir "Hago una copia antes de cambiar nada…"
  respaldo_nuevo
  tar -czf "$RESP/opt-jarvis.tgz" -C "$RAIZ/opt" jarvis 2>/dev/null || fallar "No pude copiar el código. No cambié nada."
  cp -p -- "$UNIDADES/jarvis.service" "$RESP/jarvis.service"
  mkdir -- "$RESP/cron.d"
  for archivo in "$RAIZ/etc/cron.d"/jarvis-*; do
    if [ -f "$archivo" ]; then cp -p -- "$archivo" "$RESP/cron.d/"; fi
  done
  if [ -f "$RAIZ/usr/local/bin/jarvis-actualizar" ]; then cp -p -- "$RAIZ/usr/local/bin/jarvis-actualizar" "$RESP/jarvis-actualizar"; fi
  sistema systemctl cat jarvis > "$RESP/systemctl-cat.txt" 2>/dev/null || true
  if ! sistema runuser -u jarvis -- env "OPORTIA_ENV_FILE=$OPT/.env" "$NODO" --no-warnings "$OPT/deploy/oportia-admin.mjs" --copias=antes-de-cambio; then
    fallar "No pude hacer la copia de la base. No cambié nada."
  fi
  sistema runuser -u jarvis -- env "OPORTIA_ENV_FILE=$OPT/.env" "$NODO" --no-warnings "$OPT/deploy/oportia-admin.mjs" --copias=ahora >/dev/null 2>&1 || true
  decir "Copia hecha en $RESP"
  if ! (pasos_de_pasar); then
    decir "Algo falló: vuelvo a dejar el actualizador de antes."
    volver_por_dentro
    fallar "No se pasó. Todo quedó como estaba (los programas nuevos quedaron guardados, sin uso)."
  fi
  decir "✔ Hecho. Mira en OPORTIA → Administrador → Servidor: debe decir «Actualizador nuevo · revisó hace un momento»."
  decir "  Si hay una versión nueva, se instalará sola en la próxima media hora. Para volver atrás: sudo oportia volver"
}

volver() {
  local carpeta hay=no marca="$EST/servicio-cambiado" guardada
  tomar_candados || fallar "Hay una actualización corriendo ahora mismo: prueba en 5 minutos. No cambié nada."
  mkdir -p -- "$EST"
  REGISTRO="$EST/pasos.log"
  for carpeta in "$EST/respaldo"/*/; do
    if [ -f "${carpeta}jarvis-actualizar.cron" ]; then hay=si; fi
  done
  if ! existe "$CRON" && [ "$hay" = no ]; then
    printf '%s\n' "Este servidor nació con el actualizador nuevo: no hay uno de antes al que volver. No cambié nada."
    exit 0
  fi
  volver_por_dentro
  decir "✔ El servidor volvió al actualizador de antes. Los programas nuevos quedaron guardados, sin uso."
  if [ -f "$marca" ]; then
    guardada="$(sed -n '1p' "$marca")"
    if [ -f "$guardada" ] && [[ "$guardada" == "$EST/respaldo/"* ]]; then
      decir "También devuelvo el archivo del servicio que había (unos 10 segundos sin servicio)…"
      cp -p -- "$guardada" "$UNIDADES/jarvis.service.oportia-nuevo"
      mv -fT -- "$UNIDADES/jarvis.service.oportia-nuevo" "$UNIDADES/jarvis.service"
      sistema systemctl daemon-reload
      if arrancar_y_salud restart -; then decir "✔ El servicio arrancó bien con su archivo de antes."; else decir "⚠ El servicio no contestó bien después de devolver su archivo: avísale a Claude."; fi
    fi
    mv -fT -- "$marca" "$marca.ultima"
  fi
}

servicio() {
  local unidad="$UNIDADES/jarvis.service" nueva="$AQUI/jarvis.service"
  [ -f "$unidad" ] || fallar "No encuentro el archivo del servicio. No cambié nada."
  if cmp -s -- "$nueva" "$unidad"; then
    printf '%s\n' "✔ El archivo del servicio ya es el de esta versión. No cambié nada."
    exit 0
  fi
  printf '%s\n' "Esto cambia el archivo del servicio de OPORTIA por el de esta versión." "Las líneas que cambian (- sale, + entra):"
  diff -- "$unidad" "$nueva" | sed -n 's/^< /  - /p; s/^> /  + /p' || true
  printf '%s\n' "" "Guardo una copia del de hoy. La app se reinicia (unos 10 segundos sin servicio)." "Si no arranca bien, devuelvo el de antes yo solo."
  preguntar "Escribe SI y pulsa Enter para seguir (cualquier otra cosa: no hago nada): " || fallar "No hay terminal para preguntar. No cambié nada."
  if [ "$RESPUESTA" != "SI" ]; then
    printf '%s\n' "No cambié nada."
    exit 0
  fi
  tomar_candados || fallar "Hay una actualización corriendo ahora mismo: prueba en 5 minutos. No cambié nada."
  mkdir -p -- "$EST"
  REGISTRO="$EST/pasos.log"
  respaldo_nuevo
  cp -p -- "$unidad" "$RESP/jarvis.service"
  if [ ! -f "$EST/servicio-cambiado" ]; then printf '%s\n' "$RESP/jarvis.service" > "$EST/servicio-cambiado"; fi
  cp -- "$nueva" "$unidad.oportia-nuevo"
  chmod 644 "$unidad.oportia-nuevo"
  mv -fT -- "$unidad.oportia-nuevo" "$unidad"
  sistema systemctl daemon-reload
  if arrancar_y_salud restart -; then
    decir "✔ Listo: el servicio arrancó bien con el archivo nuevo. (Para devolver el de antes: sudo oportia volver)"
    exit 0
  fi
  decir "El servicio no arrancó bien con el archivo nuevo: devuelvo el de antes."
  cp -p -- "$RESP/jarvis.service" "$unidad.oportia-nuevo"
  mv -fT -- "$unidad.oportia-nuevo" "$unidad"
  sistema systemctl daemon-reload
  if arrancar_y_salud restart -; then fallar "Quedó el archivo de antes y el servicio arrancó bien. No se cambió nada."; fi
  fallar "Quedó el archivo de antes, pero el servicio no contestó bien: avísale a Claude."
}

tailscale_orden() {
  local clave nombre
  hay_orden tailscale || fallar "Este servidor no tiene Tailscale instalado."
  mkdir -p -- "$EST"
  REGISTRO="$EST/pasos.log"
  if [ "$(dato_tailscale estado)" != "Running" ]; then
    printf '%s\n' "Este servidor todavía no está en tu red privada." "Crea una clave en login.tailscale.com → Settings → Keys → Generate auth key (empieza con tskey-auth-)." "Lo que pegues ahora NO se verá en la pantalla. Es normal: pega y pulsa Enter."
    preguntar "Clave de Tailscale: " oculto || fallar "No hay terminal para preguntar. No cambié nada."
    clave="${RESPUESTA//[$' \t\r\n']/}"
    RESPUESTA=""
    printf '%s\n' "Recibí ${#clave} caracteres."
    if ! [[ "$clave" =~ ^tskey-[a-z]+-[A-Za-z0-9-]+$ ]]; then fallar "Eso no parece una clave de Tailscale (debe empezar con tskey-auth-). No cambié nada."; fi
    printf '%s' "$clave" > "$PROPIA/clave"
    chmod 600 "$PROPIA/clave"
    clave=""
    if ! unir_tailscale "$PROPIA/clave"; then
      : > "$PROPIA/clave"
      fallar "No pude entrar a Tailscale con esa clave. Crea otra clave y prueba de nuevo."
    fi
    : > "$PROPIA/clave"
    decir "✔ El servidor entró a tu red privada."
    if encender_enlace; then decir "✔ Enlace público (https): encendido"; else explicar_enlace_pendiente; fi
    decir "Borra la clave que usaste: Tailscale → Settings → Keys → Revoke"
  elif [ -e "$EST/enlace-pendiente" ]; then
    if encender_enlace; then decir "✔ Enlace público (https): encendido"; else explicar_enlace_pendiente; fi
  else
    decir "✔ El servidor ya está en tu red privada. No cambié nada."
  fi
  nombre="$(dato_tailscale nombre)"
  if [ -n "$nombre" ]; then decir "Tu enlace: https://$nombre"; fi
  if [ -n "$nombre" ] && [[ "$nombre" != jarvis.* ]]; then
    decir "⚠ El servidor quedó con el nombre «${nombre%%.*}». Quita el servidor viejo en Tailscale → Machines y ponle a este el nombre jarvis."
  fi
}

estado() {
  local version activo n=0 carpeta
  version="$(leer_sha "$DATOS/version.txt")"
  activo="$(sistema systemctl is-active jarvis 2>/dev/null || true)"
  printf '%s\n' "OPORTIA: estado del servidor (no cambia nada)" ""
  linea "Versión instalada:" "${version:0:7}"
  linea "El servicio:" "${activo:-?}"
  if responde 5; then linea "La app contesta:" "sí"; else linea "La app contesta:" "NO"; fi
  if usa_el_nuevo; then linea "Actualizador:" "el nuevo (cada 30 minutos)"
  elif existe "$CRON"; then linea "Actualizador:" "el de antes (cada 30 minutos)"
  else linea "Actualizador:" "ninguno encendido (para encenderlo: avísale a Claude)"; fi
  if [ -f "$EST/ultima-corrida.json" ]; then linea "Última revisión:" "$(sed -n 's/.*"revisado":"\([0-9TZ:-]*\)".*"resultado":"\([a-z_]*\)".*/\1 \2/p' "$EST/ultima-corrida.json")"; fi
  linea "Última línea del registro:" "$(ultima_linea "$DATOS/update.log")"
  if [ -n "$(leer_sha "$DATOS/version.bad")" ]; then linea "Última versión que no sirvió:" "$(leer_sha "$DATOS/version.bad" | cut -c1-7)"; fi
  linea "Disco libre:" "$(megas_libres "$DATOS") MB"
  for carpeta in "$LIB"/v-*/; do
    if [ -d "$carpeta" ]; then n=$((n + 1)); fi
  done
  linea "Lo que guarda el actualizador:" "$(du -sm -- "$EST" 2>/dev/null | awk '{print $1}') MB · $n juegos de programas"
  linea "Tailscale:" "$(dato_tailscale estado) $(dato_tailscale nombre)"
  if [ -e "$EST/enlace-pendiente" ]; then linea "Enlace público:" "pendiente (sudo oportia tailscale)"
  elif [ -e "$EST/enlace-encendido" ]; then linea "Enlace público:" "encendido"; fi
}

principal() {
  local palabra="${1:-}"
  AQUI="$(dirname -- "$(realpath -- "$0")")"
  # shellcheck source=deploy/oportia-comun.sh
  . "$AQUI/oportia-comun.sh"
  revisar_modo
  CRON="$RAIZ/etc/cron.d/jarvis-actualizar"
  carpeta_propia
  NODO="$(carpeta_de_node 2>/dev/null || true)"
  if [ -n "$NODO" ]; then NODO="$NODO/node"; fi
  case "$palabra" in
    revisar) revisar ;;
    pasar) pasar ;;
    volver) volver ;;
    servicio) servicio ;;
    tailscale) tailscale_orden ;;
    estado) estado ;;
    *) fallar "Usa: sudo oportia estado | revisar | pasar | volver | servicio | tailscale" ;;
  esac
}

principal "$@" </dev/null
exit $?
