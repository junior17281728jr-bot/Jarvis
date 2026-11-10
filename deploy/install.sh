#!/bin/bash
# OPORTIA: el instalador de un servidor. Idempotente: correrlo otra vez no cambia nada. Nunca borra, pisa ni cambia de
# dueño datos ni configuración que ya existan. Lo llama deploy/cloud-init.sh desde una carpeta de root.
# Orden: primero lo que protege y da acceso (swap, paquetes, Node, usuario, cortafuegos, Tailscale); después el
# actualizador, y la app la instala el MISMO actualizador (pruebas primero).
set -euo pipefail
IFS=$'\n\t'
umask 022
export LC_ALL=C.UTF-8
# En las pruebas el PATH lo pone la prueba (solo trae lo que hace falta); en el servidor es siempre este.
if [ "${OPORTIA_PRUEBA:-}" != "1" ]; then PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi
export PATH

SHA=""
ARCHIVO_CLAVE=""
CON_TAILSCALE=si
CORTAFUEGOS=auto        # auto (solo en un servidor nuevo) | si | no
SOLO_ACTUALIZADOR=no
SWAP_MB=1024
MODO_SERVIDOR=""        # NUEVA | EXISTENTE
APP_BIEN=si
MOTIVO_APP=""
UNI_EL_NODO=no
declare -a INFORME=()
PAQUETES="ca-certificates curl tar xz-utils util-linux coreutils iproute2 unattended-upgrades"

anotar() { INFORME+=("$1"); decir "$1"; }

apt_get() {
  local n=1 pausa=20
  if [ "${OPORTIA_PRUEBA:-}" = "1" ]; then pausa=0; fi
  # (7>&-: lo que apt encienda no hereda el candado de esta instalación)
  until sistema apt-get -o DPkg::Lock::Timeout=600 "$@" 7>&-; do
    if [ "$n" -ge 3 ]; then return 1; fi
    n=$((n + 1))
    sleep "$pausa"
  done
}

paso_revision() {
  local id="" version="" arq anio libre
  if [ -f "$RAIZ/etc/os-release" ]; then
    id="$(sed -n 's/^ID=//p' "$RAIZ/etc/os-release" | tr -d '"')"
    version="$(sed -n 's/^VERSION_ID=//p' "$RAIZ/etc/os-release" | tr -d '"')"
  fi
  if [ "$id" != "ubuntu" ] || { [ "$version" != "22.04" ] && [ "$version" != "24.04" ]; }; then
    fallar "Este instalador es para Ubuntu 22.04 o 24.04 (aquí hay: ${id:-?} ${version:-?}). No cambié nada."
  fi
  arq="$(sistema uname -m)"
  case "$arq" in
    x86_64) ARQ="x64" ;;
    aarch64) ARQ="arm64" ;;
    *) fallar "No conozco este tipo de máquina ($arq). No cambié nada." ;;
  esac
  [ -d "$RAIZ/run/systemd/system" ] || fallar "Este servidor no usa systemd. No cambié nada."
  anio="$(date +%Y)"
  [ "$anio" -ge 2026 ] || fallar "El reloj del servidor está mal (año $anio). No cambié nada."
  if [ "$SOLO_ACTUALIZADOR" = no ]; then
    libre="$(megas_libres "$RAIZ/")"
    [ "$libre" -ge 2000 ] || fallar "Hay muy poco disco libre ($libre MB; hacen falta 2000). No cambié nada."
  fi
  if [ -d "$OPT/src" ] || [ -e "$DATOS/oportia.db" ]; then MODO_SERVIDOR="EXISTENTE"; else MODO_SERVIDOR="NUEVA"; fi
  if [ "$MODO_SERVIDOR" = "EXISTENTE" ]; then
    decir "Este servidor YA tiene OPORTIA: solo agrego lo que falte. Lo que ya está no se toca."
  else
    decir "Servidor nuevo: instalación completa."
  fi
}

paso_swap() {
  local archivo="$RAIZ/swapfile"
  if [ -n "$(sistema swapon --show --noheadings 2>/dev/null || true)" ] || existe "$archivo"; then
    anotar "✔ Memoria de apoyo (swap): ya estaba, no la toqué"
    return 0
  fi
  if ! sistema fallocate -l "${SWAP_MB}M" "$archivo" 2>/dev/null; then
    dd if=/dev/zero of="$archivo" bs=1M count="$SWAP_MB" status=none 2>/dev/null || true
  fi
  if [ -f "$archivo" ] && chmod 600 "$archivo" && sistema mkswap "$archivo" >/dev/null 2>&1 && sistema swapon "$archivo" 2>/dev/null; then
    if ! grep -qs "swapfile" "$RAIZ/etc/fstab"; then printf '%s\n' "$archivo none swap sw 0 0" >> "$RAIZ/etc/fstab"; fi
    anotar "✔ Memoria de apoyo (swap) de $SWAP_MB MB: hecha"
  else
    anotar "⚠ Memoria de apoyo (swap): pendiente (este servidor no la dejó encender; el archivo quedó en $archivo, sin uso)"
  fi
}

paso_paquetes() {
  local paquete falta=no
  local IFS=' '
  # ufw solo en un servidor NUEVO: en uno que ya tiene otras reglas, instalarlo podría quitarle las suyas.
  if [ "$MODO_SERVIDOR" = "NUEVA" ] && [ "$CORTAFUEGOS" != no ]; then PAQUETES="$PAQUETES ufw"; fi
  for paquete in $PAQUETES; do
    if ! sistema dpkg -s "$paquete" >/dev/null 2>&1; then falta=si; fi
  done
  if [ "$falta" = no ]; then
    anotar "✔ Paquetes del sistema: ya estaban"
    return 0
  fi
  apt_get update >/dev/null || fallar "No pude actualizar la lista de paquetes (¿sin internet?)."
  # shellcheck disable=SC2086
  apt_get install -y -o Dpkg::Options::=--force-confold $PAQUETES >/dev/null || fallar "No pude instalar los paquetes del sistema."
  anotar "✔ Paquetes del sistema: instalados"
}

# ¿Ese node alcanza para lo que pide package.json? (si no encuentro package.json: 22.13)
node_alcanza() {
  "$1" -e '
    const fs = require("node:fs");
    let pide = ">=22.13";
    try { pide = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).engines.node; } catch { /* el mínimo conocido */ }
    const m = /^>=\s*(\d+)(?:\.(\d+))?/.exec(String(pide)) || [0, 22, 13];
    const [a, b] = process.versions.node.split(".").map(Number);
    process.exit(a > Number(m[1]) || (a === Number(m[1]) && b >= Number(m[2] ?? 0)) ? 0 : 1);
  ' "$AQUI/../package.json" 2>/dev/null
}

# El node que usa el servicio que YA hay en este servidor (el de su ExecStart), si existe. Sin salida = no hay.
node_del_servicio() {
  local unidad="$UNIDADES/jarvis.service" ruta=""
  [ -f "$unidad" ] || return 1
  ruta="$(sed -n 's/^ExecStart=\([^[:space:]]*\/node\)[[:space:]].*$/\1/p' "$unidad" | head -n 1)"
  if [ -z "$ruta" ] || [ ! -x "$RAIZ$ruta" ]; then return 1; fi
  printf '%s' "$RAIZ$ruta"
}

paso_node() {
  local version sha_x64 sha_arm64 sha nombre destino enlace="$RAIZ/opt/node22" n=1 del_servicio=""
  # Un servidor cuyo servicio ya corre con SU Node (aunque no esté en la ruta de siempre): ese Node no se toca.
  del_servicio="$(node_del_servicio || true)"
  if [ -n "$del_servicio" ] && [ "$del_servicio" != "$RAIZ/usr/bin/node" ]; then
    if node_alcanza "$del_servicio"; then
      anotar "✔ Node: ya estaba (el que usa el servicio, $("$del_servicio" --version 2>/dev/null || true)), no lo toqué"
      return 0
    fi
    fallar "El servicio de este servidor usa un Node más viejo del que OPORTIA necesita, y yo no lo puse: no lo reemplazo. Avísale a Claude."
  fi
  if [ -x "$RAIZ/usr/bin/node" ]; then
    if node_alcanza "$RAIZ/usr/bin/node"; then
      anotar "✔ Node: ya estaba ($("$RAIZ/usr/bin/node" --version 2>/dev/null || true)), no lo toqué"
      return 0
    fi
    fallar "Este servidor tiene un Node más viejo del que OPORTIA necesita, y yo no lo puse: no lo reemplazo. Avísale a Claude."
  fi
  if existe "$RAIZ/usr/bin/node"; then fallar "Donde va el programa node hay algo que no es un programa: no lo toco. Avísale a Claude."; fi
  version="$(sed -n 's/^NODE_VERSION=//p' "$AQUI/node.pin")"
  sha_x64="$(sed -n 's/^NODE_SHA256_X64=//p' "$AQUI/node.pin")"
  sha_arm64="$(sed -n 's/^NODE_SHA256_ARM64=//p' "$AQUI/node.pin")"
  [[ "$version" =~ ^22\.[0-9]+\.[0-9]+$ ]] || fallar "node.pin no trae una versión válida de Node."
  if [ "$ARQ" = "x64" ]; then sha="$sha_x64"; else sha="$sha_arm64"; fi
  [[ "$sha" =~ ^[0-9a-f]{64}$ ]] || fallar "node.pin no trae la huella de Node."
  nombre="node-v$version-linux-$ARQ"
  destino="$RAIZ/opt/$nombre"
  mkdir -p -- "$RAIZ/opt"
  if [ ! -x "$destino/bin/node" ]; then
    if existe "$destino"; then apartar "$destino"; fi
    until sistema curl -fsSL -m 600 -o "$PROPIA/$nombre.tar.xz" "https://nodejs.org/dist/v$version/$nombre.tar.xz"; do
      if [ "$n" -ge 3 ]; then fallar "No pude bajar Node de nodejs.org."; fi
      n=$((n + 1))
    done
    # La huella FIJA del repositorio: si no coincide, no se abre nada.
    if ! (cd "$PROPIA" && printf '%s  %s\n' "$sha" "$nombre.tar.xz" | sha256sum -c - >/dev/null 2>&1); then
      fallar "El Node que bajé NO es el esperado (su huella no coincide). No lo abrí ni instalé nada de él."
    fi
    mkdir -- "$PROPIA/node"
    tar --no-same-owner -xJf "$PROPIA/$nombre.tar.xz" -C "$PROPIA/node"
    [ -x "$PROPIA/node/$nombre/bin/node" ] || fallar "El paquete de Node no trae el programa."
    mover_sin_pisar "$PROPIA/node/$nombre" "$destino" || fallar "No pude poner Node en $destino"
  fi
  # El enlace corto solo se crea si falta: uno que ya exista (de quien sea) nunca se cambia de sitio.
  if ! existe "$enlace"; then ln -s -- "$destino" "$enlace"; fi
  mkdir -p -- "$RAIZ/usr/bin"
  if [ "$(realpath -- "$enlace" 2>/dev/null || true)" = "$(realpath -- "$destino")" ]; then
    ln -s -- "$enlace/bin/node" "$RAIZ/usr/bin/node"
  else
    decir "  Ya había algo en ${enlace#"$RAIZ"} y no lo toqué: el programa node apunta directo a ${destino#"$RAIZ"}"
    ln -s -- "$destino/bin/node" "$RAIZ/usr/bin/node"
  fi
  "$RAIZ/usr/bin/node" -e 'require("node:sqlite")' 2>/dev/null || fallar "El Node instalado no arranca bien."
  anotar "✔ Node $version: instalado (huella comprobada)"
}

paso_usuario() {
  if sistema id jarvis >/dev/null 2>&1; then
    anotar "✔ Usuario jarvis: ya estaba"
  else
    sistema useradd --system --home-dir "$RAIZ/var/lib/jarvis" --no-create-home --shell "$RAIZ/usr/sbin/nologin" jarvis
    anotar "✔ Usuario jarvis: creado"
  fi
}

paso_carpetas() {
  if [ ! -e "$DATOS" ]; then
    mkdir -p -- "$DATOS"
    chmod 750 "$DATOS"
    sistema chown jarvis:jarvis "$DATOS"
  fi
  if [ ! -e "$OPT" ] && [ "$SOLO_ACTUALIZADOR" = no ]; then
    mkdir -p -- "$OPT"
    chmod 755 "$OPT"
  fi
  mkdir -p -- "$EST/respaldo" "$EST/propuestos" "$LIB"
  chmod 755 "$EST" "$LIB"
  chmod 700 "$EST/respaldo" "$EST/propuestos"
}

paso_servicio() {
  if [ ! -e "$OPT/.env" ]; then
    # Como en producción: escucha en todas las direcciones, pero la app solo atiende a 127.0.0.1 y a Tailscale, y el
    # cortafuegos cierra el resto.
    printf 'PORT=8080\nHOST=0.0.0.0\n' > "$OPT/.env.oportia-nuevo"
    chmod 640 "$OPT/.env.oportia-nuevo"
    sistema chown root:jarvis "$OPT/.env.oportia-nuevo"
    mover_sin_pisar "$OPT/.env.oportia-nuevo" "$OPT/.env" || fallar "No pude poner el archivo de ajustes de la app"
  fi
  poner_si_falta "$AQUI/jarvis.service" "$UNIDADES/jarvis.service" 644
  case "$HECHO" in
    puesto)
      sistema systemctl daemon-reload
      anotar "✔ Servicio de OPORTIA: puesto"
      ;;
    ya_estaba) anotar "✔ Servicio de OPORTIA: ya estaba" ;;
    *) anotar "✔ Servicio de OPORTIA: ya había uno distinto, no lo toqué (para cambiarlo: sudo oportia servicio)" ;;
  esac
  if ! sistema systemctl is-enabled jarvis >/dev/null 2>&1; then sistema systemctl enable jarvis >/dev/null 2>&1 || true; fi
}

paso_cortafuegos() {
  local estado
  if [ "$CORTAFUEGOS" = no ]; then
    anotar "• Cortafuegos: no lo toqué (así se pidió)"
    return 0
  fi
  if ! hay_orden ufw; then
    anotar "⚠ Cortafuegos: pendiente (no encuentro ufw)"
    return 0
  fi
  estado="$(sistema ufw status 2>/dev/null || true)"
  if [ "$MODO_SERVIDOR" = "EXISTENTE" ] && [ "$CORTAFUEGOS" != si ]; then
    anotar "• Cortafuegos: en un servidor que ya tiene OPORTIA no lo toco. Hoy dice: $(printf '%s' "$estado" | head -n 1)"
    return 0
  fi
  if ! printf '%s\n' "$estado" | grep -q '^Status: inactive'; then
    anotar "✔ Cortafuegos: ya estaba encendido, no lo toqué"
    return 0
  fi
  # No se abren 8080, 80 ni 443: el enlace público entra por la conexión SALIENTE de Tailscale.
  sistema ufw default deny incoming >/dev/null
  sistema ufw default allow outgoing >/dev/null
  sistema ufw allow in on tailscale0 >/dev/null
  sistema ufw limit 22/tcp >/dev/null
  sistema ufw allow 41641/udp >/dev/null
  sistema ufw --force enable >/dev/null
  # Se comprueba a sí mismo: la regla del 22, la de Tailscale, y que el 22 sigue escuchando. Si no, se apaga.
  estado="$(sistema ufw status 2>/dev/null || true)"
  if printf '%s\n' "$estado" | grep -q '^22/tcp' && printf '%s\n' "$estado" | grep -q 'tailscale0' && sistema ss -ltn 2>/dev/null | grep -q ':22 '; then
    anotar "✔ Cortafuegos: encendido (entra solo Tailscale y la consola; el 8080 queda cerrado a internet)"
  else
    sistema ufw --force disable >/dev/null 2>&1 || true
    anotar "⚠ Cortafuegos: pendiente. Lo encendí pero no vi la regla de la consola, así que lo APAGUÉ para no dejarte fuera. Avísale a Claude."
  fi
}

paso_tailscale() {
  local nombre codigo llavero lista
  if [ "$CON_TAILSCALE" = no ]; then
    anotar "• Tailscale: no lo toqué (así se pidió)"
    return 0
  fi
  if ! hay_orden tailscale; then
    if [ "$MODO_SERVIDOR" = "EXISTENTE" ]; then
      anotar "• Tailscale: este servidor no lo tiene y, como ya tiene OPORTIA, no lo instalo yo"
      return 0
    fi
    codigo="$(sed -n 's/^VERSION_CODENAME=//p' "$RAIZ/etc/os-release" | tr -d '"')"
    [[ "$codigo" =~ ^[a-z]+$ ]] || fallar "No sé qué versión de Ubuntu es esta."
    llavero="$RAIZ/usr/share/keyrings/tailscale-archive-keyring.gpg"
    lista="$RAIZ/etc/apt/sources.list.d/tailscale.list"
    mkdir -p -- "${llavero%/*}" "${lista%/*}"
    if [ ! -e "$llavero" ]; then
      sistema curl -fsSL -m 60 -o "$PROPIA/tailscale.gpg" "https://pkgs.tailscale.com/stable/ubuntu/$codigo.noarmor.gpg" || fallar "No pude bajar la firma de Tailscale."
      chmod 644 "$PROPIA/tailscale.gpg"
      mover_sin_pisar "$PROPIA/tailscale.gpg" "$llavero" || fallar "No pude poner la firma de Tailscale"
    fi
    if [ ! -e "$lista" ]; then
      sistema curl -fsSL -m 60 -o "$PROPIA/tailscale.list" "https://pkgs.tailscale.com/stable/ubuntu/$codigo.tailscale-keyring.list" || fallar "No pude bajar la lista de Tailscale."
      chmod 644 "$PROPIA/tailscale.list"
      mover_sin_pisar "$PROPIA/tailscale.list" "$lista" || fallar "No pude poner la lista de Tailscale"
    fi
    apt_get update >/dev/null || fallar "No pude actualizar la lista de paquetes."
    apt_get install -y tailscale >/dev/null || fallar "No pude instalar Tailscale."
    sistema systemctl enable --now tailscaled >/dev/null 2>&1 || true
  fi
  if [ "$(dato_tailscale estado)" = "Running" ]; then
    anotar "✔ Tailscale: ya estaba unido a tu red, no lo toqué (ni el enlace)"
    return 0
  fi
  if [ "$MODO_SERVIDOR" = "EXISTENTE" ]; then
    anotar "• Tailscale: no está unido; en un servidor que ya tiene OPORTIA no lo uno yo (si quieres: sudo oportia tailscale)"
    return 0
  fi
  if [ -z "$ARCHIVO_CLAVE" ]; then
    anotar "⚠ Tailscale: pendiente. Falta unir el servidor a tu red privada: sudo oportia tailscale"
    return 0
  fi
  if ! unir_tailscale "$ARCHIVO_CLAVE"; then
    anotar "⚠ Tailscale: pendiente. No pude entrar a Tailscale con esa clave. Crea otra clave y corre: sudo oportia tailscale"
    return 0
  fi
  UNI_EL_NODO=si
  anotar "✔ Tailscale: el servidor entró a tu red privada"
  # El enlace https, solo porque ESTA corrida unió el nodo (un nodo recién unido no tiene nada configurado).
  if encender_enlace; then
    anotar "✔ Enlace público (https): encendido"
  else
    anotar "⚠ Enlace público: pendiente (por ahora abre solo desde tus equipos con Tailscale)"
    explicar_enlace_pendiente
  fi
  nombre="$(dato_tailscale nombre)"
  if [ -n "$nombre" ] && [[ "$nombre" != jarvis.* ]]; then
    anotar "⚠ El servidor quedó con el nombre «${nombre%%.*}». Quita el servidor viejo en Tailscale → Machines y ponle a este el nombre jarvis: así tu enlace de siempre vuelve a servir."
  fi
}

paso_actualizador() {
  local sha7
  sha7="$(sha7_de_aqui "$AQUI")" || fallar "No sé de qué versión es este instalador (debe correr desde su carpeta de root)."
  instalar_actualizador "$AQUI" "$sha7"
  anotar "✔ Actualizador (juego v-$sha7): listo"
}

# La primera instalación de la app ES una corrida del actualizador: pruebas primero, copiar, arrancar y mirar la salud.
paso_app() {
  local resultado="" antes despues
  if [ "$MODO_SERVIDOR" = "EXISTENTE" ] && [ -f "$OPT/src/server.js" ]; then
    anotar "✔ La app: ya estaba instalada, no la toqué (se actualiza sola)"
    return 0
  fi
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { APP_BIEN=no; MOTIVO_APP="falta saber qué versión instalar"; return 0; }
  decir "Instalo la app (versión ${SHA:0:7}). Antes corren todas sus pruebas: puede tardar varios minutos…"
  antes="$(cat "$EST/ultima-corrida.id" 2>/dev/null || true)"
  bash "$LIB/oportia-lanzador.sh" --persona "--sha=$SHA" || true
  despues="$(cat "$EST/ultima-corrida.id" 2>/dev/null || true)"
  # Solo vale el estado que dejó ESTA corrida (si el candado estaba ocupado o el actualizador murió, no hay uno nuevo).
  if [ -n "$despues" ] && [ "$despues" != "$antes" ] && [ -f "$EST/ultima-corrida.json" ]; then resultado="$(sed -n 's/.*"resultado":"\([a-z_]*\)".*/\1/p' "$EST/ultima-corrida.json")"; fi
  if [ "$resultado" = "actualizado" ] || [ "$resultado" = "al_dia" ]; then
    anotar "✔ La app: instalada y sana (versión ${SHA:0:7})"
  else
    APP_BIEN=no
    case "$resultado" in
      no_instalada) MOTIVO_APP="no pasó sus pruebas" ;;
      revertida|revertida_sin_arrancar) MOTIVO_APP="no arrancó bien" ;;
      sin_red) MOTIVO_APP="no se pudo bajar" ;;
      sin_disco) MOTIVO_APP="no hay disco libre" ;;
      *) MOTIVO_APP="el actualizador no terminó" ;;
    esac
  fi
}

paso_temporizador() {
  if existe "$RAIZ/etc/cron.d/jarvis-actualizar"; then
    anotar "• Actualizaciones automáticas: este servidor usa el actualizador de antes (funciona). Para cambiarlo: sudo oportia pasar"
    return 0
  fi
  if sistema systemctl is-enabled oportia-actualizar.timer >/dev/null 2>&1 && sistema systemctl is-active oportia-actualizar.timer >/dev/null 2>&1; then
    anotar "✔ Actualizaciones automáticas (cada 30 minutos): ya estaban encendidas"
  else
    sistema systemctl enable --now oportia-actualizar.timer >/dev/null 2>&1 || { anotar "⚠ Actualizaciones automáticas: pendiente (no pude encender el temporizador)"; return 0; }
    anotar "✔ Actualizaciones automáticas (cada 30 minutos): encendidas"
  fi
}

paso_seguridad() {
  local archivo="$RAIZ/etc/apt/apt.conf.d/20auto-upgrades"
  if existe "$archivo"; then
    anotar "✔ Actualizaciones de seguridad del sistema: ya estaban"
    return 0
  fi
  mkdir -p -- "${archivo%/*}"
  printf '%s\n' 'APT::Periodic::Update-Package-Lists "1";' 'APT::Periodic::Unattended-Upgrade "1";' > "$archivo"
  chmod 644 "$archivo"
  anotar "✔ Actualizaciones de seguridad del sistema: encendidas (sin reinicios automáticos)"
}

informe() {
  local nombre linea destino="$EST/instalacion.txt"
  nombre="$(dato_tailscale nombre)"
  {
    printf 'OPORTIA: informe de la instalación (%s)\n' "$(date -Is)"
    if [ -n "$SHA" ]; then printf 'Versión: %s\n' "${SHA:0:7}"; fi
    if [ -n "$nombre" ]; then printf 'Enlace: https://%s\n' "$nombre"; fi
    printf '\n'
    for linea in "${INFORME[@]}"; do printf '%s\n' "$linea"; done
    printf '\n'
    if [ "$APP_BIEN" = no ]; then
      printf '%s\n' "✖ La app no quedó instalada ($MOTIVO_APP). El servidor está protegido y conectado. Para probar otra vez: sudo oportia actualizar --reintentar"
      printf '%s\n' "  (El servidor también lo intenta solo cada 30 minutos.)"
    elif [ "$SOLO_ACTUALIZADOR" = no ]; then
      printf '%s\n' "Lo que sigue:"
      printf '%s\n' "  Para traer tus datos: sudo oportia recuperar"
      printf '%s\n' "  Para empezar de cero: abre el enlace desde un equipo con Tailscale"
    fi
    if [ "$UNI_EL_NODO" = si ] || [ -n "$ARCHIVO_CLAVE" ]; then printf '%s\n' "  Borra la clave que usaste: Tailscale → Settings → Keys → Revoke"; fi
  } > "$destino.tmp"
  chmod 644 "$destino.tmp"
  mv -fT -- "$destino.tmp" "$destino"
  printf '\n==================== OPORTIA ====================\n'
  cat -- "$destino"
  if [ ! -e "$EST/instalado" ]; then printf '%s %s\n' "$(date -Is)" "$SHA" > "$EST/instalado"; fi
}

principal() {
  local argumento
  AQUI="$(dirname -- "$(realpath -- "$0")")"
  # shellcheck source=deploy/oportia-comun.sh
  . "$AQUI/oportia-comun.sh"
  revisar_modo
  for argumento in "$@"; do
    case "$argumento" in
      --sha=*)
        SHA="${argumento#--sha=}"
        [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fallar "--sha necesita las 40 letras de la versión"
        ;;
      --clave-tailscale=*)
        ARCHIVO_CLAVE="${argumento#--clave-tailscale=}"
        if [ ! -f "$ARCHIVO_CLAVE" ] || [ -L "$ARCHIVO_CLAVE" ]; then fallar "No encuentro el archivo de la clave de Tailscale"; fi
        ;;
      --sin-tailscale) CON_TAILSCALE=no ;;
      --sin-cortafuegos) CORTAFUEGOS=no ;;
      --con-cortafuegos) CORTAFUEGOS=si ;;
      --solo-actualizador) SOLO_ACTUALIZADOR=si ;;
      --swap-mb=*)
        SWAP_MB="${argumento#--swap-mb=}"
        if ! [[ "$SWAP_MB" =~ ^[0-9]{3,5}$ ]]; then fallar "--swap-mb necesita un número de megas (por ejemplo 1024)"; fi
        ;;
      *) fallar "No entiendo «$argumento». Opciones: --sha= --clave-tailscale= --sin-tailscale --sin-cortafuegos --con-cortafuegos --solo-actualizador --swap-mb=" ;;
    esac
  done
  mkdir -p -- "$RAIZ/var/log"
  REGISTRO="$RAIZ/var/log/oportia-instalar.log"
  touch -- "$REGISTRO"
  chmod 600 "$REGISTRO"
  mkdir -p -- "$RAIZ/run"
  exec 7> "$RAIZ/run/oportia-instalar.lock"
  flock -n 7 || fallar "Ya hay una instalación corriendo. Espera a que termine."
  carpeta_propia
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

  paso_revision
  if [ "$SOLO_ACTUALIZADOR" = si ]; then
    # La línea de arreglo: solo vuelve a poner el lanzador, la orden «oportia» y el juego de esta versión.
    paso_carpetas
    paso_actualizador
    informe
    exit 0
  fi
  # Primero lo que protege y da acceso; después el actualizador y la app.
  paso_swap
  paso_paquetes
  paso_node
  paso_usuario
  paso_carpetas
  paso_servicio
  paso_cortafuegos
  paso_tailscale
  paso_actualizador
  paso_app
  paso_temporizador
  paso_seguridad
  informe
  if [ "$APP_BIEN" = no ]; then exit 1; fi
  exit 0
}

principal "$@" </dev/null
exit $?
