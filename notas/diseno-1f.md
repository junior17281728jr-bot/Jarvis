# OPORTIA — Diseño de la parte 1f (0.6.0): instalar, actualizar y recuperar el servidor

Base: `main` 54b9bb9 (0.5.1). Rama `fase-1f`. **Sin migración** (la base queda en la 6). `package.json` → 0.6.0.
Designed 10 nov 2026. English for the builders; every owner-facing text is given in simple Spanish.

---

## 0 Resumen de las decisiones

| Tema | Decisión |
|---|---|
| Instalar un servidor nuevo | `deploy/cloud-init.sh` (nuevo, ~50 líneas, se pega en «User data») baja el repositorio por SHA y corre `deploy/install.sh`. Toda la lógica vive en `install.sh`; el texto pegado casi nunca cambia. |
| Código de la app en la instalación | **No lo copia `install.sh`**: lo instala el MISMO actualizador (primera vez = una actualización sobre `/opt/jarvis` vacío). Un solo camino: pruebas primero → copiar → arrancar → revisar salud. |
| Node | Versión FIJA con su sha256 FIJO en el repositorio (`deploy/node.pin`), bajada de nodejs.org y comprobada con `sha256sum -c` antes de abrirla. |
| Actualizador | En el repositorio (`deploy/oportia-actualizar.sh`, un solo archivo), instalado como copia de root en `/usr/local/lib/oportia/`. Lo llama un **lanzador** mínimo y fijo (candado + vigilancia). Se actualiza a sí mismo solo DESPUÉS de una actualización sana, por cambio de nombre atómico, guardando el anterior; si el nuevo falla 3 veces, el lanzador vuelve al anterior. |
| Programador | `oportia-actualizar.timer` de systemd (cada 30 min) en vez de cron. |
| Compatibilidad con 1e | Las 3 líneas de `update.log`, `version.txt` y `version.bad` quedan **byte por byte** como hoy (una prueba pasa las líneas reales por `lineasDeActualizacion`). Lo nuevo va en líneas `… aviso: …` (que 1e ignora) y en un archivo de estado propio. |
| Recuperar | `sudo oportia recuperar`: envuelve `oportia-restaurar.mjs` (sin cambiar su contrato), aparta la base que haya (nunca la borra ni la pisa), pone la recuperada, arranca, revisa salud y deshace solo si no arranca. |
| Servidor de producción | **Pasar al actualizador nuevo, sí, pero en pasos que decide Junior**: `revisar` (no cambia nada) → `pasar` (copia primero, deshace solo si algo falla) → `volver` (una orden). No toca datos, red, cortafuegos, Tailscale ni Node. El archivo del servicio NO se cambia en `pasar` (orden aparte, opcional). «Dejarlo como está» sigue siendo válido: la 0.6.0 funciona con el actualizador viejo. |
| `deploy/cloud-init.sh` viejo (Oracle) | Se reemplaza en su misma ruta; queda en la historia (`git show 54b9bb9:deploy/cloud-init.sh`), anotado en `deploy/LEEME.md` y en el README. |
| Pantalla | Copias → «Si un día pierdes el servidor» pasa de 6 a 7 pasos reales con órdenes para copiar; Servidor → tarjeta «Actualizaciones» (estado real del actualizador). |

---

## 1 Lo que se leyó y los hechos en los que se apoya

### 1.1 Del código (verificado leyendo `wt-1f`)
- `src/nucleo/config.js`: datos = `OPORTIA_DATOS` o la carpeta de `DB_PATH`, por defecto `/var/lib/jarvis`. `PORT` (8080), `HOST` (127.0.0.1).
  OPORTIA no lee ninguna otra variable en producción (`SETUP_TAILNET_ONLY` del `.env` viejo ya no se usa).
- `src/nucleo/red.js`: solo atiende si la dirección LOCAL es 127.x/::1 o de Tailscale (100.64/10, fd7a:115c:a1e0::/48). El enlace
  https (Tailscale Serve/Funnel) llega por 127.0.0.1 con `Tailscale-User-Login` / `Tailscale-Funnel-Request`.
  **`NOMBRES_DEL_SERVIDOR = {'jarvis.taila693e9.ts.net', 'jarvis'}` está fijo en el código**: una conexión DIRECTA por la red
  privada con otro nombre recibe 421 (por https y por IP sí entra). → el servidor nuevo debe llamarse `jarvis` (§4.9).
- `/api/setup` (pública): 503 `arrancando` hasta 90 s; después 200 con `{app:'oportia', version:<package.json>, base, necesitaAdmin}`.
- `src/server.js`: el puerto es el candado; el trabajador es un hijo NO separado (mismo grupo de control). `deploy/jarvis.service`
  no fija `KillMode` (por defecto `control-group`, que es lo que la 1c necesita). `test/reglas.test.js` exige `^LimitCORE=0$` en la unidad.
- `src/copias/vigilar.js` (1e): lee SOLO LECTURA los últimos 64 KB de `<datos>/update.log` y `<datos>/version.bad`. Regex ancladas:
  `^(\S+) versión ([0-9a-f]{7}): alguna prueba falló, NO se instaló$` · `^(\S+) versión ([0-9a-f]{7}) no arrancó: volví a la anterior$` ·
  `^(\S+) actualizado a ([0-9a-f]{7})$`; la fecha se lee con `Date.parse` (`date -Is`); la última línea sin `\n` se ignora;
  cualquier otra línea se ignora. `version.bad` = 40 hex. El servicio (usuario `jarvis`) debe poder LEER los dos archivos.
- `deploy/oportia-restaurar.mjs` + `src/copias/restaurar.js`: contrato completo en diseno-1e §9. No corre como root; clave y token
  por la entrada (ocultos en una terminal); nunca pisa (`wx`, y rechaza si existe `destino` o `destino-wal`); la marca de OPORTIA se
  escribe al final; `ajustarTrasRestaurar` deja la marca `claves.restaurada` → la pantalla Claves deja pegar las claves otra vez SIN
  consola (crea una llave nueva; `permisoLlaveNueva` motivo `restaurada`). **1f ya no necesita llamar a `empezarLlaveNueva`.**
  Salidas: 0 · 2 uso · 3 clave · 4 copia · 5 destino existe · 6 Telegram/red · 7 formato nuevo · 8 cancelada.
- `test/copias-restaurar.test.js` 1.15/1.16 ya cubren copia → cifrar → restaurar → comparar TODO. Lo que falta (y pone 1f): que la
  base recuperada **arranque como servidor** en una carpeta nueva sin llave, y que «poner la base» nunca pise.
- `test/reglas.test.js`: busca secretos en `.sh`, `.service`, `.md`… con `/tskey-[A-Za-z0-9-]{10,}/` → **ningún archivo puede traer
  `tskey-` seguido de 10 letras/guiones** (el marcador es `PEGA_AQUI`; en los textos, «empieza con tskey-auth-» y nada pegado detrás).
  Las pruebas van todas en `test/` SIN subcarpetas (los comandos falsos se escriben al correr, en la carpeta temporal).
- La pantalla ya tiene Copias → «Si un día pierdes el servidor» (`PASOS_RESTAURAR` 1–6, `copias.restaurar.paso1…6`, la hoja impresa y
  el README con la misma cuenta; `test/pantallas.test.js` «revisión: los pasos para recuperar…» lo comprueba) y `copiarTexto()`.

### 1.2 Del actualizador de hoy (`/usr/local/bin/jarvis-actualizar`, texto en el `cloud-init.sh` viejo)
cron `/etc/cron.d/jarvis-actualizar` (`*/30`), candado `/run/jarvis-actualizar.lock`, SHA por `api.github.com/repos/$REPO/commits/main`
(`Accept: application/vnd.github.sha`), tarball por `codeload.github.com/$REPO/tar.gz/$SHA`, pruebas `timeout 900`, `rm -rf` + `cp -a`
de `/opt/jarvis.anterior`, copia EN SU SITIO `src public deploy package.json`, reinicia, 20 intentos de `/api/setup`, vuelve atrás el código.
Defectos que 1f corrige: (a) las pruebas dejan ~300 MB por corrida en `/tmp` y nadie los quita (disco de 10 GB); (b) el registro de la
prueba fallida se borra; (c) la copia en su sitio deja una ventana con el código a medias; (d) la salud no mira QUÉ versión contesta;
(e) no se puede arreglar a distancia; (f) nada dice si el actualizador sigue vivo (nunca se confirmó que producción instale versiones).

### 1.3 Hechos externos
| Hecho | Estado |
|---|---|
| `https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz` sha256 `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce`; `…-linux-arm64.tar.xz` sha256 `6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b`; `SHASUMS256.txt`, `.sig` y `.asc` existen | **VERIFICADO hoy** (bajado de nodejs.org; 22.23.4 es `latest-v22.x` y es el Node de las pruebas) |
| Tailscale: instalar con `curl -fsSL https://tailscale.com/install.sh \| sh` o el repositorio apt (`pkgs.tailscale.com/stable/ubuntu/<codename>.noarmor.gpg` → `/usr/share/keyrings/tailscale-archive-keyring.gpg`, y `<codename>.tailscale-keyring.list`) | Confirmado por búsqueda (página oficial «Install Tailscale on Ubuntu 24.04»); **no se pudo abrir tailscale.com desde esta sesión** (fuera de la red permitida) |
| `tailscale funnel --bg <puerto>`; puertos públicos 443 (por defecto), 8443, 10000; `tailscale funnel status`, `tailscale funnel reset`; al activarlo por la consola crea los certificados y pide activar Funnel en la política | Confirmado por búsqueda (referencia oficial del comando) |
| `tailscale up --auth-key=file:<ruta>` (la clave no queda en la lista de procesos); el Funnel `--bg` sigue tras reiniciar; `tailscale file get <carpeta>` (Taildrop); las claves de máquina vencen (180 días) si no se desactiva | **SIN VERIFICAR** (conocimiento previo). El instalador no depende de que sean ciertos: cada uno tiene salida (§4.9) y el simulacro los comprueba |
| DigitalOcean «User data»: lo usa cloud-init en el PRIMER arranque; no se puede cambiar después; el resultado queda en `/var/log/cloud-init-output.log` | Confirmado por búsqueda (docs oficiales); **no se pudo abrir docs.digitalocean.com** |
| DO: tope de tamaño del User data (≈64 KB), que el texto queda legible en el servicio de metadatos (169.254.169.254) y en `/var/lib/cloud/`, que la Consola web del Droplet necesita el puerto 22 abierto | **SIN VERIFICAR** → por eso: clave de Tailscale de UN solo uso, arrancador pequeño, y el cortafuegos deja el 22 (con límite) |
| Docker aquí | El cliente existe; **el demonio no corre y Docker Hub responde «toomanyrequests»** → hoy solo raíz falsa. `shellcheck` no está instalado (probar `pip install shellcheck-py`; si no, solo `bash -n` y decirlo) |
| Producción | **SIN VERIFICAR**: contenido real de `/opt/jarvis/.env` y de la unidad instalada (el `install.sh` viejo no está en el clon), dueño de `/opt/jarvis`, ruta de Node, swap, cuánto hay en `/tmp`. `oportia-servidor.sh revisar` lo dice sin cambiar nada (§7.1) |

---

## 2 Archivos y responsabilidades

```
deploy/
  cloud-init.sh              NUEVO contenido. Arrancador para «User data» de DigitalOcean (o una línea con curl). §4.1
  install.sh                 NUEVO. Instalador idempotente. §4
  node.pin                   NUEVO. NODE_VERSION, NODE_SHA256_X64, NODE_SHA256_ARM64 (3 líneas CLAVE=valor).
  oportia-comun.sh           NUEVO. Funciones compartidas (se carga con «source» desde su misma carpeta). §3
  oportia.sh                 NUEVO. La orden corta «oportia <palabra>» (se instala como /usr/local/sbin/oportia). §3.4
  oportia-actualizar.sh      NUEVO. El actualizador. UN solo archivo, no carga otros. §5
  oportia-lanzador.sh        NUEVO. Lanzador fijo: candados + vigilancia del actualizador. Un solo archivo. §5.2
  oportia-actualizar.service NUEVO. Unidad «oneshot» que corre el lanzador.
  oportia-actualizar.timer   NUEVO. Cada 30 minutos.
  oportia-servidor.sh        NUEVO. revisar | pasar | volver | servicio | tailscale | estado. §7
  oportia-recuperar.sh       NUEVO. recuperar | probar-copia | poner (interno). §6
  oportia-base.mjs           NUEVO. Ayuda de solo lectura: cuenta usuarios/proyectos de un archivo de base (como «jarvis»).
  oportia-admin.mjs          + «--copias=antes-de-cambio» (copia local completa con VACUUM INTO, archivo nuevo). §7.2
  oportia-restaurar.mjs      SIN cambios de contrato (solo la línea de comentario «La parte 1f pone…»).
  jarvis.service             + «KillMode=control-group» explícito y su comentario (nunca «process»). Nada más.
  LEEME.md                   NUEVO. Qué es cada archivo, y la nota del cloud-init viejo de Oracle (dónde quedó en la historia).
src/copias/vigilar.js        + leerEstadoDelActualizador(config) (solo lectura) y el aviso «actualizador_parado». §8.3
src/api/tareas.js            + actualizaciones.estado en lo que ya manda a Administrador → Servidor.
src/api/…                    + GET /api/servidor/instalacion (solo admin): el texto de deploy/cloud-init.sh para «Copiar». §8.2
public/app.js, estilos.css, i18n/es.json, i18n/en.json     §8
test/raiz-falsa.js           NUEVO. Arma una raíz falsa y los comandos falsos EN la carpeta temporal (no es .test.js).
test/actualizador.test.js    NUEVO (en la suite). §9.1
test/instalar.test.js        NUEVO (en la suite). §9.1
test/ensayo-instalar.mjs     NUEVO (fuera de la suite, como los otros ensayos). §9.2
.github/workflows/pruebas.yml + trabajo «instalador» (bash -n, shellcheck, ensayo en raíz falsa, y en un contenedor ubuntu:24.04). §9.3
README.md, package.json (0.6.0)
```
Nada en `src/` borra datos. Ningún archivo trae secretos. Ningún `.sh` imprime un secreto (`set +x` siempre; nunca `set -x`).

---

## 3 Reglas comunes de los scripts (`oportia-comun.sh` y, repetidas dentro, en el actualizador y el lanzador)

1. Cabecera: `#!/bin/bash`, `set -euo pipefail`, `IFS=$'\n\t'`, `umask 022`, `export LC_ALL=C.UTF-8`, `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`.
   Todo el cuerpo dentro de `principal() { … }; principal "$@"; exit $?` (bash lee el archivo entero antes de correr: cambiarlo a mitad no rompe nada).
2. **Rutas por un solo prefijo.** `RAIZ="${OPORTIA_RAIZ:-}"`; todas las rutas son `"$RAIZ/opt/jarvis"`, `"$RAIZ/var/lib/jarvis"`,
   `"$RAIZ/var/lib/oportia-actualizador"`, `"$RAIZ/usr/local/lib/oportia"`, `"$RAIZ/usr/local/sbin"`, `"$RAIZ/etc/systemd/system"`, `"$RAIZ/etc/cron.d"`, `"$RAIZ/run"`.
3. **Modo de prueba que falla cerrado** (igual que `config.js`): `OPORTIA_PRUEBA=1` exige `RAIZ` no vacía y DENTRO de `${TMPDIR:-/tmp}`
   (comparada con `realpath`), y exige `OPORTIA_FALSOS` (carpeta de comandos falsos). Sin `OPORTIA_PRUEBA=1`, `RAIZ` debe ser vacía.
   Los comandos que tocan el sistema van SIEMPRE por `sistema <orden> …`: en modo real corre la orden; en modo de prueba corre
   `"$OPORTIA_FALSOS/<orden>"` y **si no existe, falla** (nunca cae al comando real). Lista: `systemctl apt-get apt-key dpkg tailscale ufw
   useradd usermod id runuser swapon mkswap fallocate sysctl curl timedatectl hostnamectl crontab reboot`. `curl` va por ahí también: las
   pruebas nunca tocan la red. `cp mv ln mkdir mktemp tar sha256sum flock dd stat date` son los de verdad (dentro de la raíz falsa).
4. `decir "<texto>"` → pantalla y registro, con fecha. `fallar "<texto>"` → lo mismo y `exit 1`. Español sencillo. Nunca un secreto.
5. **Nunca pisar ni borrar**: `poner_si_falta <origen> <destino> <modo> <dueño>` (si el destino existe e iguala → «ya estaba»; si existe y
   difiere → NO lo toca, deja el nuevo al lado como `<destino>.nuevo-<AAAAMMDD-HHMMSS>` y lo dice). `apartar <ruta>` = `mv -nT` a
   `<ruta>.apartada-<fecha>` (nunca borra). El único borrado permitido es `borrar_lo_mio <ruta>`: exige que la ruta no esté vacía, no
   sea un enlace, y empiece por la carpeta temporal PROPIA creada con `mktemp -d` en esta corrida (o por `…/oportia-actualizador/tmp/corrida.`).
   Regla de la suite: en `deploy/*.sh` la palabra `rm` solo aparece dentro de `borrar_lo_mio` (§9.1).
   OJO con `mv -nT`: en coreutils 9.4 (Ubuntu 24.04, probado aquí) sale con 1 si el destino existe; en versiones anteriores
   (Ubuntu 22.04) sale con 0 SIN mover. Nunca fiarse del código de salida: después de cada `mv -n` se comprueba que el origen ya
   no existe y que el destino es el archivo esperado.
6. **Escribir como root dentro de `/var/lib/jarvis` (carpeta del usuario del servicio) nunca sigue enlaces**: reemplazar = archivo temporal
   en la carpeta de root + `mv -fT` (el cambio de nombre reemplaza el enlace, no su destino); agregar una línea =
   `printf '%s\n' "$linea" | dd of="$LOG" oflag=append,nofollow conv=notrunc status=none`; después `chmod 644` solo si el archivo es
   normal (`[ -f ] && [ ! -L ]`). Así un servicio comprometido no puede hacer que root escriba fuera.
   (Probado aquí con coreutils 9.4: `dd … oflag=append,nofollow` sobre un enlace falla con «Too many levels of symbolic links» y no
   toca el destino; `mv -fT` sobre un enlace reemplaza el enlace y deja intacto el archivo al que apuntaba.)
7. `salud <version-esperada|-> <segundos>`: cada 3 s, `curl -fsS -m 5 http://127.0.0.1:$PUERTO/api/setup`; vale cuando hay **2
   respuestas seguidas** 200 con `app=oportia` (y `version` igual a la esperada si se pasó) y `systemctl is-active jarvis` dice `active`.
   El JSON se lee con `node -e` (la entrada por stdin; nada de `grep` sobre JSON). `PUERTO` = `PORT` de `/opt/jarvis/.env` (solo
   dígitos; por defecto 8080). El bloque `# >>> salud` … `# <<< salud` es idéntico en `oportia-comun.sh` y en el actualizador (regla de la suite).
8. Un solo nombre del repositorio: `REPO_POR_DEFECTO="junior17281728jr-bot/Jarvis"` y `RAMA_POR_DEFECTO="main"`; se pueden cambiar en
   `/etc/oportia.conf` (`REPO=…`, `RAMA=…`; validados con `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` y `^[A-Za-z0-9._/-]+$`). Regla de la
   suite: el nombre por defecto es el mismo en todos los archivos (scripts, README, i18n).

### 3.4 La orden corta `oportia`
`/usr/local/sbin/oportia` es una COPIA de `deploy/oportia.sh` (root, 755). Solo reparte:
`oportia estado | revisar | pasar | volver | servicio | tailscale | recuperar | probar-copia | actualizar [--reintentar] | ayuda`
→ `exec bash /opt/jarvis/deploy/<script> <palabra>` (o el lanzador para `actualizar`). Exige root y que `/opt/jarvis/deploy` sea de
root y no escribible por otros (si no, se niega y lo explica). Sin palabra o con una desconocida: la lista, una línea por orden.
Todas las órdenes que la pantalla o el README muestran existen aquí (regla de la suite: «ningún botón muerto»).

---

## 4 Instalar un servidor nuevo

### 4.1 `deploy/cloud-init.sh` (lo que Junior pega en «User data»)
```
#!/bin/bash
# OPORTIA: instalación automática en un Droplet NUEVO de DigitalOcean (Ubuntu 24.04). Tarda unos 10 minutos.
# Antes de pegarlo: cambia PEGA_AQUI por tu clave de Tailscale (una «Auth key» de UN solo uso).
TS_AUTHKEY="PEGA_AQUI"
REPO="junior17281728jr-bot/Jarvis"
```
Después, sin nada que editar: `set -euo pipefail`; `umask 077`; `export HOME=/root DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a`;
registro en `/var/log/oportia-instalar.log` (600); si existe `/var/lib/oportia-actualizador/instalado` → `exit 0` (re-correrlo no hace nada).
1. La clave: si no es `PEGA_AQUI` y cumple `^tskey-[a-z]+-[A-Za-z0-9-]+$` (escrito así, no dispara la regla de secretos), se guarda con
   `printf '%s' "$TS_AUTHKEY" > /root/.oportia-clave-tailscale` (600) y se hace `unset TS_AUTHKEY`. Nunca `echo` ni `set -x`.
2. `apt-get -o DPkg::Lock::Timeout=300 update` y `install -y ca-certificates curl tar` (cloud-init puede tener el candado al arrancar).
3. SHA de `main` (6 intentos, 20 s) con la misma llamada que hoy; se valida `^[0-9a-f]{40}$`. Sin SHA no sigue (nada de «refs/heads/main»:
   el instalador y la app deben salir del MISMO cambio).
4. Baja `codeload.github.com/$REPO/tar.gz/$SHA` (6 intentos) a `/root/oportia-instalador-<sha7>/` (`tar --no-same-owner -xzf … --strip-components=1`).
5. `bash deploy/install.sh --sha="$SHA" --clave-tailscale=/root/.oportia-clave-tailscale` (una RUTA, nunca la clave).
También sirve como una línea en un servidor ya creado (sin clave de Tailscale, que se pone después con `sudo oportia tailscale`):
`curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/cloud-init.sh | sudo bash`
Confianza: GitHub por TLS (la misma que ya tiene el actualizador). El texto pegado no trae lógica: no envejece.

**La clave de Tailscale en «User data»** queda guardada por DigitalOcean (metadatos y `/var/lib/cloud/`, sin verificar hasta cuándo): por eso
los pasos piden una clave **de un solo uso, que venza en 1 día** (Reusable: no · Ephemeral: no). Usada una vez, ya no sirve para nada.

### 4.2 `install.sh`: reglas
Root; candado `flock -n /run/oportia-instalar.lock`; registro `/var/log/oportia-instalar.log` (600) + pantalla. Opciones:
`--sha=<40 hex>` · `--clave-tailscale=<archivo>` · `--sin-tailscale` · `--sin-cortafuegos` · `--solo-actualizador` · `--swap-mb=<n>` (por defecto 1024).
Modo **NUEVA** (no existen `/opt/jarvis/src` ni `/var/lib/jarvis/oportia.db`) o **EXISTENTE** (cualquiera existe). En EXISTENTE solo
AGREGA lo que falta; todo lo que ya está se deja y se dice («ya estaba: no lo toqué»). Cada paso: mirar → hacer → comprobar. Correrlo
otra vez no cambia nada (ensayo: segunda corrida = cero llamadas que cambian).

**Nunca se pisa, cambia de dueño ni borra:** `/var/lib/jarvis` y todo lo de adentro (`oportia.db*`, `oportia-copias/`,
`oportia-llave-secretos*`, `jarvis.db`, `secrets.env`, `update.log`, `version.txt`, `version.bad`…), `/opt/jarvis/.env`,
`/etc/systemd/system/jarvis.service`, `/usr/local/bin/jarvis-actualizar`, `/etc/cron.d/*`, la swap que exista, las reglas de `ufw` que
existan, la configuración de `sshd`, el estado de Tailscale (si ya está unido: ni `up`, ni nombre, ni Funnel).

### 4.3 Pasos (en orden)
0. **Revisión**: Ubuntu 22.04/24.04 (`/etc/os-release`; otro → se detiene y lo dice), `x86_64`/`aarch64`, PID 1 = systemd, ≥ 1500 MB
   libres en `/`, reloj razonable (año ≥ 2026).
1. **Paquetes**: `apt-get update`; `install -y -o Dpkg::Options::=--force-confold ca-certificates curl tar xz-utils util-linux coreutils unattended-upgrades ufw`.
2. **Swap** (512 MB de memoria): solo si `swapon --show --noheadings` está vacío y no existe `/swapfile`: `fallocate -l 1G` (si falla,
   `dd`), `chmod 600`, `mkswap`, `swapon`, una línea en `/etc/fstab` solo si ninguna nombra `/swapfile` (se agrega, nunca se reescribe);
   `/etc/sysctl.d/60-oportia.conf` con `vm.swappiness=10` solo si no existe.
3. **Node** (`deploy/node.pin`): si `/usr/bin/node` existe y su versión ≥ `engines.node` del `package.json` → se deja. Si existe y es
   más viejo → se detiene y lo explica (no reemplaza un Node que no puso). Si no existe: baja
   `https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-<x64|arm64>.tar.xz` a su carpeta temporal,
   `echo "$SHA  $archivo" | sha256sum -c -` contra el sha256 FIJO del repositorio (si no coincide: se detiene, no abre nada),
   `tar --no-same-owner -xJf` en `/opt/node-v$NODE_VERSION-linux-<arq>/`, `ln -sfn` de `/opt/node22` (solo si no existe o ya es un
   enlace) y `ln -s /opt/node22/bin/node /usr/bin/node`. Comprueba `node --version` y `node -e "require('node:sqlite')"`.
   (No se usa NodeSource ni `curl | bash`. No se comprueba la firma GPG de `SHASUMS256.txt`: el sha256 fijo, revisado en el
   repositorio, da lo mismo sin llavero. Subir Node = cambiar `node.pin` + correr `install.sh` otra vez, a mano.)
4. **Usuario**: si `id jarvis` falla → `useradd --system --home-dir /var/lib/jarvis --no-create-home --shell /usr/sbin/nologin jarvis`.
5. **Carpetas**: `/var/lib/jarvis` (solo si falta: `install -d -o jarvis -g jarvis -m 750`; si existe, ni `chmod` ni `chown`),
   `/opt/jarvis` (root, 755), `/var/lib/oportia-actualizador` (root, 755; adentro `tmp/` 700 y `respaldo/` 700), `/usr/local/lib/oportia` (root, 755).
6. **`/opt/jarvis/.env`** solo si falta (root:jarvis, 640): `PORT=8080` y `HOST=0.0.0.0` (como producción: así también se entra por la
   dirección 100.x; la app solo atiende 127.0.0.1 y Tailscale, y el cortafuegos cierra el resto). Sin `DB_PATH` (por defecto `/var/lib/jarvis`).
7. **Servicio**: `poner_si_falta deploy/jarvis.service /etc/systemd/system/jarvis.service`; `systemctl daemon-reload`; `systemctl enable jarvis` (sin arrancar todavía).
8. **Actualizador** (`instalar_actualizador`, la MISMA función que usa `pasar`, §7.2): copia el lanzador a `/usr/local/lib/oportia/oportia-lanzador.sh`,
   el actualizador a `/usr/local/lib/oportia/oportia-actualizar.sh`, `oportia.sh` a `/usr/local/sbin/oportia`, las dos unidades;
   `/etc/oportia.conf` solo si falta; `daemon-reload`. El temporizador se enciende en el paso 10.
9. **Primera instalación de la app = una corrida del actualizador**: `oportia-lanzador.sh --sha=$SHA` → baja ese SHA, corre TODAS las
   pruebas (2–3 min en 1 vCPU), copia el código a `/opt/jarvis`, `systemctl restart jarvis`, salud, escribe `version.txt`. Si las
   pruebas fallan o no arranca: el instalador se detiene con el motivo; nada queda a medias; se puede correr otra vez.
   En EXISTENTE con código ya puesto: este paso se salta.
10. `systemctl enable --now oportia-actualizar.timer`.
11. **Actualizaciones de seguridad del sistema**: `/etc/apt/apt.conf.d/20auto-upgrades` solo si falta (`Update-Package-Lists "1"`,
    `Unattended-Upgrade "1"`). Sin reinicio automático (decisión D4).
12. **Cortafuegos** (solo NUEVA, o con `ufw` inactivo; con `--sin-cortafuegos` se salta): si `ufw status` dice `inactive`:
    `ufw default deny incoming`, `ufw default allow outgoing`, `ufw allow in on tailscale0`, `ufw limit 22/tcp` (la Consola de
    DigitalOcean entra por ahí; «limit» frena a quien prueba contraseñas), `ufw allow 41641/udp` (conexión directa de Tailscale),
    `ufw --force enable`. **No se abren 8080, 80 ni 443**: el enlace público entra por la conexión SALIENTE de Tailscale. Si `ufw` ya
    estaba activo: no se toca y se muestran las reglas.
13. **Tailscale** (con `--sin-tailscale` se salta): repositorio apt oficial con `signed-by` (llavero y lista solo si faltan; el nombre
    de la versión sale de `VERSION_CODENAME`), `apt-get install -y tailscale`, `systemctl enable --now tailscaled`.
    - Si `tailscale status --json` ya dice `BackendState: Running` → no se hace `up`.
    - Si hay archivo de clave: `tailscale up --auth-key="file:<archivo>" --hostname=jarvis` (sin `--ssh`, decisión D3); después el
      archivo de la clave (temporal del instalador) se vacía y se quita con `borrar_lo_mio`. Si `up` falla: sigue y deja el paso pendiente.
    - Sin clave: paso pendiente → «sudo oportia tailscale» la pide oculta (`read -rs` de `/dev/tty`) o muestra el enlace de entrada.
    - Enlace https: solo si `tailscale serve status` está vacío: `timeout 30 tailscale funnel --bg 8080`; si `tailscale funnel status`
      no dice «Funnel on»: `timeout 30 tailscale serve --bg 8080` (enlace https solo para tu red) y explica cómo encender el público
      (en la consola web de Tailscale: DNS → HTTPS, y Funnel en la política). Nunca `funnel reset`.
    - Nombre: lee `Self.DNSName`. Si no empieza por `jarvis.` (quedó `jarvis-1…` porque la máquina vieja sigue en la lista) lo dice:
      «Quita el servidor viejo en Tailscale → Machines y ponle a este el nombre jarvis: así tu enlace de siempre vuelve a servir».
      No falla: el enlace https con el nombre nuevo funciona igual.
14. **Informe final** en pantalla y en `/var/lib/oportia-actualizador/instalacion.txt` (644, sin secretos): versión, enlace
    `https://<DNSName>`, cada paso «hecho / ya estaba / pendiente: <orden de una línea>», y lo que sigue:
    «Para traer tus datos: sudo oportia recuperar» · «Para empezar de cero: abre el enlace desde un equipo con Tailscale».
    Crea `/var/lib/oportia-actualizador/instalado` (fecha y SHA). Código de salida 0 aunque queden pasos PENDIENTES de Tailscale
    (se dicen); ≠ 0 solo si la app no quedó sana.

### 4.4 Unidades
`jarvis.service`: como hoy + `KillMode=control-group` explícito (comentario: «nunca process: el trabajador es otro proceso del mismo
servicio y debe apagarse con él»). Sin más endurecimiento en 1f (cada opción nueva puede romper `nice`/`prlimit`/SQLite; no se pidió).
```
# oportia-actualizar.service
[Unit]
Description=OPORTIA: buscar e instalar la versión nueva (pruebas primero)
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/lib/oportia/oportia-lanzador.sh
Nice=5
IOSchedulingClass=idle
TimeoutStartSec=1800
KillMode=control-group
# oportia-actualizar.timer
[Timer]
OnBootSec=3min
OnCalendar=*:07,37
RandomizedDelaySec=120
[Install]
WantedBy=timers.target
```
`Nice=5`: las pruebas ya no le quitan el procesador a las pantallas (las pantallas van en 0; el trabajador en 10).

---

## 5 El actualizador

### 5.1 Dónde vive y qué archivos son suyos
| Ruta | Qué |
|---|---|
| `/usr/local/lib/oportia/oportia-lanzador.sh` | lanzador fijo (solo lo cambia `install.sh`/`pasar`, guardando el anterior) |
| `/usr/local/lib/oportia/oportia-actualizar.sh` · `.anterior` · `.nuevo` | el actualizador en uso, el de antes, y el candidato |
| `/var/lib/oportia-actualizador/` (root 755) | `tmp/corrida.XXXXXX/` (700), `fallos` (contador), `ultima-prueba-fallida.log` (600, ≤ 200 KB), `respaldo/<fecha>/` (700), `pasos.log` |
| `/var/lib/jarvis/update.log` · `version.txt` · `version.bad` | los de hoy, mismo formato, 644 (el servicio los LEE) |
| `/var/lib/jarvis/actualizador.json` | NUEVO, 644, ≤ 1 KB, reemplazado entero en cada corrida (regla 3.6): `{"contrato":1,"revisado":"<ISO>","resultado":"…","version":"<sha40 instalado>","vista":"<sha40 de main>","actualizador":"<sha7 del que corre>"}` |
| `/opt/jarvis`, `/opt/jarvis.anterior`, `/opt/jarvis.nueva` | el código, el de antes, y el que se está armando |
`resultado`: `al_dia` · `actualizado` · `no_instalada` · `revertida` · `revertida_sin_arrancar` · `sin_red` · `sin_disco` · `mala_conocida`.

### 5.2 El lanzador (≈40 líneas, sin red, sin lógica de actualizar)
1. `exec 9>/run/oportia-actualizar.lock; flock -n 9 || exit 0`; y también `exec 8>/run/jarvis-actualizar.lock; flock -n 8 || exit 0`
   (el candado del actualizador VIEJO: mientras conviven, nunca corren a la vez).
2. Corre `bash /usr/local/lib/oportia/oportia-actualizar.sh --corrida "$@"` y mira su salida:
   0 → `fallos=0`. Otro número (error interno: el actualizador solo sale ≠ 0 por algo inesperado; sin red, sin disco, pruebas
   fallidas y vuelta atrás son salidas 0) → `fallos+1`.
3. Si `fallos ≥ 3` y existe `.anterior` distinto del actual: los intercambia (3 cambios de nombre), `fallos=0`, y agrega a `update.log`
   `<date -Is> aviso: el actualizador nuevo falló 3 veces; volví al actualizador de antes` (línea que 1e ignora; §8.3 la muestra).
4. Sale 0 siempre (un `oneshot` en rojo no ayuda a nadie; lo que pasó está en `update.log` y `actualizador.json`).

### 5.3 Una corrida (`--corrida`), paso a paso
0. **Reparar** lo que una corrida cortada dejó (se tiene el candado, nadie más corre):
   - `/opt/jarvis` no existe y `/opt/jarvis.nueva/.completa` existe → termina el cambio de nombre; si no, y existe `/opt/jarvis.anterior` → lo devuelve.
     Después `systemctl restart jarvis`.
   - `tmp/corrida.*` que quedaron → `borrar_lo_mio` (son suyas, dentro de su carpeta de root). **Nada más se limpia, nunca `/tmp`.**
   - `/opt/jarvis.nueva` sin `.completa` → `borrar_lo_mio` (es su propio armado a medias; la regla lo permite por el prefijo exacto).
1. `REPO`/`RAMA` (`/etc/oportia.conf` o los de por defecto). `NUEVA` = `--sha` o el SHA de la rama (`curl -fsS -m 20`, `Accept: application/vnd.github.sha`).
   Sin red o respuesta rara → estado `sin_red`, salida 0. Igual a `version.txt` → `al_dia`. Igual a `version.bad` → `mala_conocida`
   (salvo `--reintentar`, que primero APARTA `version.bad` → `version.bad.apartada-<fecha>`).
2. Disco: `df` de `/var/lib/oportia-actualizador` y de `/opt` ≥ 700 MB libres; si no → `aviso: no hay disco para probar la versión <sha7>`
   (una vez por SHA), estado `sin_disco`, salida 0, **sin marcarla mala**.
3. `T=$(mktemp -d …/tmp/corrida.XXXXXX)`; `trap` de salida → `borrar_lo_mio "$T"`. Baja el tarball (`-m 180`, ≤ 50 MB con
   `--max-filesize`), `tar --no-same-owner --no-same-permissions -xzf … -C "$T/src" --strip-components=1`. Exige `src/server.js`,
   `public/`, `deploy/oportia-actualizar.sh`, `package.json`, `test/`.
4. **Pruebas primero**, como se validan siempre:
   `cd "$T/src" && env -i PATH="$DIR_NODE:/usr/local/bin:/usr/bin:/bin" HOME="$T/casa" TMPDIR="$T/t" timeout 900 node --no-warnings --test test/*.test.js > "$T/prueba.log" 2>&1`
   (`DIR_NODE` = carpeta del `node` del `ExecStart` de la unidad instalada; si no se puede leer, la de `command -v node`). Antes: la versión de
   ese Node ≥ `engines.node` del `package.json` nuevo (si no, cuenta como prueba fallida y el motivo va a `ultima-prueba-fallida.log`).
   **`TMPDIR` dentro de `$T`: los ~300 MB que dejan las pruebas se van con `$T`.**
   Falla o vence → guarda la cola de `prueba.log` en `ultima-prueba-fallida.log`, línea
   `<date -Is> versión <sha7>: alguna prueba falló, NO se instaló`, `version.bad`, estado `no_instalada`, salida 0.
5. **Armar al lado y cambiar de nombre** (nunca se copia sobre el código vivo):
   `borrar_lo_mio /opt/jarvis.nueva` si quedó; `cp -a /opt/jarvis /opt/jarvis.nueva` (trae `.env` y lo que haya); dentro de la nueva,
   reemplaza `src public deploy package.json` por los nuevos (`chown -R root:root`, sin permisos de escritura para otros); `touch .completa`.
   `/opt/jarvis.anterior` de antes → se quita con `borrar_lo_mio` (es la copia del código de hace dos versiones, como hoy), luego
   `mv -T /opt/jarvis /opt/jarvis.anterior && mv -T /opt/jarvis.nueva /opt/jarvis`. (Primera instalación: no hay anterior; se arma desde vacío.)
6. `systemctl restart jarvis`; `salud <version del package.json nuevo> 150`.
7. **Sana** → `version.txt` = SHA (regla 3.6), línea `<date -Is> actualizado a <sha7>`, estado `actualizado`, y **paso 8**.
   **No sana** → `mv -T /opt/jarvis /opt/jarvis.mala && mv -T /opt/jarvis.anterior /opt/jarvis`, `systemctl restart jarvis`,
   `version.bad`, línea `<date -Is> versión <sha7> no arrancó: volví a la anterior`, `/opt/jarvis.mala` → `borrar_lo_mio`;
   `salud - 150` de la anterior: bien → `revertida`; mal → `revertida_sin_arrancar` + `aviso: la versión anterior tampoco arrancó`.
   Solo el CÓDIGO vuelve atrás, nunca los datos (1f no trae migración; en una versión futura con migración vale lo de siempre: la
   copia `oportia-antes-m…` queda hecha por `abrirBase`).
8. **Actualizarse a sí mismo** (solo tras una actualización sana y si `deploy/oportia-actualizar.sh` nuevo difiere del que corre):
   copia a `…/oportia-actualizar.sh.nuevo` (root, 755) → `bash -n` → debe traer `CONTRATO=1` (el número que este lanzador entiende) →
   `bash …nuevo --autoprueba` (solo mira: órdenes que necesita, carpetas, que puede leer la unidad y el `.env`; no cambia nada; ≤ 10 s)
   → `cp -p` del actual a `.anterior` (por nombre temporal + `mv -fT`) → `mv -fT .nuevo` sobre el actual. Cualquier fallo: se queda el
   de antes y agrega `aviso: el actualizador de la versión <sha7> no pasó su revisión; sigo con el de antes`. El que está corriendo
   no se toca (se cambia el nombre, no el archivo). `oportia.sh` → `/usr/local/sbin/oportia` igual (con `bash -n`).
   **No** se actualizan solos: el lanzador, las unidades de systemd ni `jarvis.service` (eso es `install.sh` / `oportia servicio`, a mano, con copia).
9. `actualizador.json` (siempre, también en `al_dia`), y sale 0.

Órdenes para una persona: `sudo oportia actualizar` (corre ahora y va diciendo en español lo que hace) · `--reintentar` · `sudo oportia estado`.
Una versión con el actualizador roto no llega a instalarse: sus propias pruebas (§9.1) corren antes, con el actualizador nuevo, en raíz falsa.

---

## 6 Recuperar en un servidor nuevo

### 6.1 Lo que hace Junior (lo que dice la pantalla y el README)
1. **Ten a mano** tu clave de recuperación y tu Telegram.
2. **Tailscale** (login.tailscale.com): en *Machines* quita el servidor viejo «jarvis»; en *Settings → Keys* crea una «Auth key»
   (de un solo uso, 1 día) y cópiala.
3. **DigitalOcean**: *Create → Droplet*, Ubuntu 24.04, el más barato; en *Advanced options → Add Initialization scripts* pega el
   **texto de instalación** y cambia `PEGA_AQUI` por la clave. Crea el Droplet y espera 10 minutos.
4. Abre la **Consola** del Droplet y pega: `sudo oportia recuperar` — te pide el token de tu bot (@BotFather → /mybots → tu bot →
   API Token) y tu clave; busca tu última copia, la comprueba y la pone.
5. **Enseguida revoca el token**: @BotFather → `/revoke` → tu bot → token NUEVO.
6. Entra con tu usuario y contraseña de siempre. Pega tus claves de IA y el token NUEVO en Claves; crea en Copias una clave de recuperación nueva.
7. No borres los mensajes del bot: son tus copias.

Si a los 10 minutos `oportia` «no existe»: `sudo tail -n 30 /var/log/oportia-instalar.log` (lo que salga se le manda a Claude).

### 6.2 `oportia-recuperar.sh recuperar` (root; baja a `jarvis` para descifrar)
Todo lo que pregunta se lee de `/dev/tty`. Registro en `/var/lib/oportia-actualizador/pasos.log` (sin secretos: la clave y el token solo
los ve `oportia-restaurar.mjs`, por su terminal).
1. **Revisión**: servicio instalado, Node, ≥ 1 GB libre en `/var/lib/jarvis`, y que no haya una actualización corriendo (toma el candado).
2. **Qué hay hoy**: si existe `/var/lib/jarvis/oportia.db`, `runuser -u jarvis -- node deploy/oportia-base.mjs <archivo>` (solo lectura)
   dice usuarios y proyectos.
   - 0 usuarios (el servidor recién instalado): «Este servidor está vacío. Sigo.»
   - Con datos: «⚠ Este servidor YA tiene datos (3 usuarios, 12 proyectos). Recuperar una copia los APARTA (no los borra) y pone los de
     la copia. Si solo quieres probar que tu copia sirve: sudo oportia probar-copia.» y exige escribir `APARTAR` para seguir.
3. **De dónde**: «1) De tu Telegram (lo normal)  2) De archivos». Para 2: «Desde tu Mac o iPhone: Compartir → Tailscale → jarvis; cuando
   termine, pulsa Enter» → `tailscale file get --conflict=rename <carpeta>` (sin verificar; si falla, dice la carpeta donde ponerlos).
4. Carpeta de trabajo NUEVA `/var/lib/jarvis/recuperar-<AAAAMMDD-HHMMSS>/` (jarvis, 750). Corre, unido a la terminal:
   `runuser -u jarvis -- /usr/bin/node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --destino=<carpeta>/recuperada.db --trabajo=<carpeta>/partes`
   (o `--archivos=<carpeta de archivos>`). El programa de 1e hace todo lo delicado (código al bot, «¿es tu chat?», segundo código,
   clave oculta, firmas, fechas, «¿es esa?»). Salidas: 0 sigue · 3 «Esa clave no abrió la copia. Probemos otra vez» (hasta 3 veces, carpeta
   nueva cada vez) · 6 «Telegram no contestó: prueba en unos minutos» · 4/7 el texto del programa + «mándale esto a Claude» · 8 «Cancelado: no se cambió nada» · 5 no puede pasar (carpeta nueva).
5. **Poner la base** (`poner`, la parte que 1e dejó para 1f; probada sola en la suite):
   a. `systemctl stop jarvis` y espera a `inactive`.
   b. Si existe `oportia.db`: `apartar` de `oportia.db`, `oportia.db-wal`, `oportia.db-shm` con el MISMO sufijo `.apartada-<fecha>` (se
      pueden volver a abrir devolviéndoles el nombre). Nunca se tocan `oportia-llave-secretos*`, `oportia-copias/` ni nada más.
   c. `mv -nT <carpeta>/recuperada.db /var/lib/jarvis/oportia.db` (y su `-wal` si quedó); comprueba que el destino es el archivo nuevo
      (mismo tamaño y `sha256sum` tomado antes de mover). Mismo disco → cambio de nombre atómico. Si el destino existiera: se detiene (5).
   d. `systemctl start jarvis`; `salud - 180` (si la copia es de una versión anterior, `abrirBase` hace su copia y aplica los cambios).
   e. **No sana** → deshace solo: detiene, `oportia.db` → `oportia.db.recuperada-no-arranco-<fecha>`, devuelve los apartados, arranca,
      `salud`; dice qué pasó y dónde quedó cada archivo. Nada se borra.
6. **Final**: «✔ Tus datos volvieron (copia del <fecha>). Abre https://<DNSName> y entra con tu usuario de siempre.» y los 3 pasos que el
   programa de 1e ya imprime (revocar el token, pegar las claves, clave de recuperación nueva). La app también lo dice sola (§8.4).
   Las partes cifradas quedan en la carpeta de trabajo (nada se borra; dice cuánto ocupan).

`oportia probar-copia` = lo mismo hasta el paso 4 con `--comprobar` (descifra y revisa todo, no escribe ninguna base, no detiene nada).
Sirve en el servidor de producción como simulacro gratis, y es lo que pide el recordatorio «Comprueba tu clave» cada 90 días.
`oportia recuperar --simulacro` (servidor de ensayo): al final NO dice «revoca el token»; dice «No pegues el token aquí ni hagas /revoke:
este es un ensayo» y deja ese servidor en modo seguro (`oportia-admin.mjs --modo-seguro=si`): sin token pegado no manda nada al chat.

---

## 7 El servidor de producción de hoy

### 7.1 Decisión
**Pasarlo al actualizador nuevo, cuando Junior quiera, con tres órdenes de una línea.** Motivos: (1) el viejo deja ~300 MB de las pruebas
en `/tmp` por cada versión y el disco es de 10 GB y nunca se borra nada; (2) no se puede arreglar a distancia y nada avisa si deja de
correr; (3) el servidor que se reconstruya tendrá el nuevo: dos actualizadores distintos es peor de mantener; (4) el cambio toca solo
el programador (cron → temporizador) y archivos de root nuevos: ni datos, ni red, ni cortafuegos, ni Tailscale, ni Node, ni el `.env`,
ni el servicio. **Dejarlo como está sigue valiendo**: la 0.6.0 se instala y funciona con el actualizador y la unidad viejos (el viejo
copia `deploy/` entero, así que los scripts nuevos llegan a `/opt/jarvis/deploy` por el camino de siempre, ya probados en ese servidor).
Orden recomendado: publicar 0.6.0 → comprobar que producción la instaló (versión abajo en la pantalla) → simulacro (§9.4) → `revisar` → `pasar`.

### 7.2 Las órdenes (Consola de DigitalOcean)
**① Mirar (no cambia nada):** `sudo bash /opt/jarvis/deploy/oportia-servidor.sh revisar`
Muestra, en una pantalla: versión instalada y la de `version.txt`; qué actualizador hay (cron viejo / temporizador nuevo) y su última
línea; la unidad `jarvis.service` frente a la del repositorio (`KillMode`, `User`, `ReadWritePaths`, `LimitCORE`, `ExecStart`); dueño y
permisos de `/opt/jarvis`; Node; swap; disco libre; cuánto ocupan en `/tmp` las carpetas de pruebas viejas; `ufw`; Tailscale y Funnel;
el `.env` (solo los NOMBRES de las variables). Termina con UNA línea: «✔ Listo para pasar al actualizador nuevo» o «✖ No lo pases
todavía: <motivo>» (p. ej. `KillMode=process`, `/opt/jarvis` escribible por `jarvis`, menos de 1 GB libre, Node viejo, no es la 0.6.0).

**② Pasar:** `sudo bash /opt/jarvis/deploy/oportia-servidor.sh pasar`
1. Las mismas revisiones (si alguna dice ✖, no hace nada). Toma los dos candados (si el viejo está corriendo: «prueba en 5 minutos»).
2. **Copia primero** en `/var/lib/oportia-actualizador/respaldo/<fecha>/` (700): `tar` de `/opt/jarvis` (código y `.env`), la unidad
   instalada, `/etc/cron.d/jarvis-*`, `/usr/local/bin/jarvis-actualizar`, `systemctl cat jarvis`. Y de los DATOS (aunque no se tocan):
   `runuser -u jarvis -- node deploy/oportia-admin.mjs --copias=antes-de-cambio` → `VACUUM INTO` a
   `/var/lib/jarvis/oportia-copias/oportia-antes-de-1f-<fecha>.db` (archivo nuevo; exige libre ≥ 2 × la base + 300 MB; se ve en
   Servidor → «Copias antes de cambios de la base»). Si Telegram ya está unido, además pide `--copias=ahora` (sin esperar).
   Si la copia falla → se detiene sin cambiar nada.
3. `instalar_actualizador` (§4.3 paso 8). `/usr/local/bin/jarvis-actualizar` **se queda donde está, intacto**.
4. `mv` de `/etc/cron.d/jarvis-actualizar` al respaldo (se mueve, no se borra) → `systemctl enable --now oportia-actualizar.timer`.
5. Corre una vez el lanzador: debe dejar `actualizador.json` con `al_dia` (o `actualizado`). `salud - 60` del servicio (que no se reinició).
6. «✔ Hecho. Mira en OPORTIA → Administrador → Servidor: debe decir “Actualizador nuevo · revisó hace un momento”. Para volver atrás: sudo oportia volver».
Cualquier fallo desde el paso 3 → hace `volver` solo y lo dice. No reinicia el servicio en ningún momento.

**③ Volver:** `sudo oportia volver` (o la forma larga) → apaga y deshabilita el temporizador, devuelve el archivo de cron desde el
respaldo más nuevo (idéntico byte por byte), y deja los archivos nuevos en su sitio, sin uso. Si se cambió la unidad con ④, la devuelve
con reinicio y salud.

**④ (aparte, opcional) El archivo del servicio:** `sudo oportia servicio` → muestra en palabras qué cambia; guarda la unidad de hoy
en el respaldo; pone la del repositorio; `daemon-reload`; `restart`; `salud - 150`; **si no queda sana devuelve la de antes, reinicia y
revisa otra vez**. Unos 10 segundos sin servicio, en el momento que Junior elija. Solo hace falta si `revisar` marca algo peligroso
(`KillMode=process`, corre como root) o para tener `LimitCORE=0` también en la unidad (la app ya se lo pone sola al arrancar).

**No entra en 1f (se dice en `revisar`, no se toca):** limpiar las carpetas viejas de pruebas en `/tmp` (decisión D6), subir el Node de
producción, cortafuegos y `sshd` de producción.

---

## 8 Pantallas, API y textos (paso 2)

### 8.1 Copias → «Si un día pierdes el servidor» (la misma tarjeta, la hoja impresa y el README)
`PASOS_RESTAURAR` pasa a `[1,2,3,4,5,6,7]` con los textos de §6.1 (`copias.restaurar.paso1…7`, es y en). Se mantiene lo que la prueba
exige: `/revoke` antes de «token NUEVO … Claves», «clave de recuperación nueva». Se quita `copias.restaurar.nota` («llega en la 1f»).
Nuevo en la tarjeta (no en la hoja impresa): junto al paso 3, botón **«Copiar el texto de instalación»** (pide
`/api/servidor/instalacion` y usa `copiarTexto`; mensaje «Copiado. Guárdalo también en Notas: si pierdes el servidor, esta pantalla no
estará») y una línea «También está siempre en GitHub: <enlace al README>»; junto al paso 4, la orden `sudo oportia recuperar` en letra
de máquina con **«Copiar»**. La hoja impresa lleva los 7 pasos y la orden escrita. Dirección propia `#copias/recuperar` (abre la tarjeta).
Regla: los botones solo copian texto real; nada queda deshabilitado «para después».

### 8.2 `GET /api/servidor/instalacion` (solo administrador)
Devuelve `text/plain` con `deploy/cloud-init.sh` leído del disco (≤ 16 KB; si falta → 404 `sin_instalador` y el botón muestra el enlace
a GitHub). No trae secretos (el archivo es público). Se lee con `readFileSync(new URL('../../deploy/cloud-init.sh', import.meta.url))`
(no es un `import`; la regla de «solo `src/`» es de los `import`).

### 8.3 Administrador → Servidor: tarjeta «Actualizaciones»
`actualizaciones.estado` = `leerEstadoDelActualizador(config)`: abre `<datos>/actualizador.json` solo lectura (≤ 4 KB, por `rutaSegura`),
`JSON.parse`, acepta solo los campos conocidos con su forma (`contrato` 1, fechas ISO, sha 40 hex, `resultado` de la lista); cualquier
otra cosa → `null`. Nunca escribe.
- Con archivo: «Actualizador nuevo · revisó {hace} · versión instalada {sha7}» + la frase del `resultado`
  (`servidor.actualizador.resultado.<clave>`) + (como hoy) «Última versión que no se instaló: {sha}».
- Sin archivo (servidor con el actualizador de antes): «Este servidor usa el actualizador de antes (funciona).» y un desplegable
  «Pasar al actualizador nuevo» con las tres órdenes de §7.2 y **«Copiar»** en cada una. Desaparece solo al pasar.
- Enlace «Si pierdo el servidor → ver los pasos» (`#copias/recuperar`).
Vigilancia (trabajador, cada hora, junto a `leerActualizaciones`): si hay archivo y `revisado` es de hace más de 3 h (y no del futuro
por más de 5 min) → `abrirAviso('actualizador_parado', 'atencion')`; fresco → se resuelve. Las líneas `… aviso: …` de `update.log`
(`^(\S+) aviso: (.+)$`) NO abren avisos en 1f: se muestran las 3 últimas en la tarjeta, como texto (≤ 200 caracteres cada una).
Textos nuevos en es/en: `aviso.actualizador_parado.*`, `telegram.aviso.actualizador_parado.*`, `servidor.actualizador.*`.

### 8.4 Después de recuperar, la app dice lo que falta
Con la marca `claves.restaurada` (ya existe) y mientras falte algo, «Primeros pasos» (`public/guia.js`, que ya sale de datos de
verdad) muestra primero el grupo **«Esta base se recuperó de una copia»**: ① revocar el token en @BotFather (`/revoke`) — sin estado,
solo texto; ② pegar el token NUEVO y las claves de IA en Claves (hecho cuando no queda ninguna clave «pégala otra vez»); ③ crear una
clave de recuperación nueva en Copias (hecho cuando Copias ya no dice «Tu clave ya no sirve en este servidor»). Usa los campos que las
rutas de Claves y Copias ya devuelven (el constructor los confirma leyendo `src/api/claves.js` y `src/api/copias.js`; si falta uno, se
agrega de solo lectura). Sin botones nuevos: cada paso es un enlace a su pantalla.

### 8.5 README
Reescribir «Cómo se actualiza el servidor» (lanzador, temporizador, archivos, las 3 líneas, `actualizador.json`, auto-actualización);
«Si un día pierdes el servidor» con los 7 pasos (misma cuenta que la pantalla) + lista de comprobación del simulacro + «si algo no
sale»; sección «Instalar un servidor nuevo» (qué hace cada paso, qué nunca pisa, opciones); «Pasar el servidor de hoy» (§7); tabla de
`sudo oportia …`; nota «El `cloud-init.sh` de Oracle (JARVIS) quedó en la historia: `git show 54b9bb9:deploy/cloud-init.sh`»; quitar
«La pantalla para recuperar llega en la 1f»; «Datos en el servidor» + `actualizador.json` (solo se LEE) y `/var/lib/oportia-actualizador/`.

---

## 9 Pruebas

### 9.1 En la suite (corren también en el servidor real, como root, con la app andando)
Regla de oro: **todo en raíz falsa dentro de la carpeta temporal, comandos del sistema solo falsos, sin red**. `test/raiz-falsa.js`
escribe los falsos (`systemctl`, `curl`, `runuser`, `tailscale`…) como scripts que anotan `orden argumentos` en `llamadas.log` y
responden según archivos de guion (p. ej. `curl` copia de una carpeta «github» local; la salud devuelve lo que diga `salud.json`).
Si faltan `bash`, `flock` o `tar` → la prueba se **salta** con su motivo (nunca falla por el entorno). Cada prueba < 10 s; el «proyecto»
que el actualizador baja en las pruebas es uno diminuto (un `test/x.test.js` que pasa o falla a pedido), nunca la suite real.

`test/actualizador.test.js`
1. Camino feliz: instala, `version.txt`, la línea `actualizado a <sha7>`, `actualizador.json`; el código vivo nunca estuvo a medias
   (el falso de `systemctl restart` comprueba que `/opt/jarvis/src/server.js` existe).
2. Pruebas que fallan → nada cambia en `/opt/jarvis` (huellas), línea exacta, `version.bad`, `ultima-prueba-fallida.log`; la segunda
   corrida no vuelve a bajar nada (`mala_conocida`); `--reintentar` aparta `version.bad` y prueba otra vez.
3. No arranca → vuelve el código anterior (huellas iguales a antes), línea exacta, `version.bad`, `revertida`; si la anterior tampoco: `revertida_sin_arrancar`.
4. **Las líneas reales pasan por `lineasDeActualizacion`** (import de `src/copias/vigilar.js`): 3 tipos reconocidos, fecha válida; las
   líneas `aviso:` se ignoran; `leerEstadoDelActualizador` entiende el `actualizador.json` real.
5. Auto-actualización: uno nuevo bueno queda en uso y el viejo en `.anterior`; uno con error de sintaxis, sin `CONTRATO=1` o que falla
   su `--autoprueba` NO se instala y queda la línea `aviso:`; el archivo en uso nunca se edita en su sitio (cambia el inodo).
6. Lanzador: 3 fallos internos seguidos → vuelve al `.anterior` y lo anota; candado ocupado (el nuevo o el VIEJO) → sale 0 sin hacer nada.
7. Corrida cortada: sin `/opt/jarvis` y con `.nueva/.completa` → termina; con solo `.anterior` → lo devuelve; `corrida.*` viejas se quitan
   y **un archivo testigo fuera de su carpeta (y otro en `$TMPDIR`) sigue ahí**.
8. `TMPDIR` de las pruebas queda dentro de la corrida y desaparece con ella; sin red → `sin_red` y nada más; poco disco → `sin_disco` sin `version.bad`.
9. Un enlace simbólico plantado en `update.log`, `version.txt`, `version.bad` y `actualizador.json` hacia un archivo testigo: el testigo no cambia.
10. Primera instalación (sin `/opt/jarvis/src`) con `--sha`.

`test/instalar.test.js`
1. **La base recuperada arranca**: copia de una base con usuario, proyecto y una clave guardada (ayudas de `test/copias-base.js`) →
   `restaurarCopia` desde archivos a una carpeta NUEVA sin archivo de llave → se enciende `src/server.js` de verdad sobre ella (por el
   programa de `test/` que carga `./ayuda.js`, como exige la regla) → `/api/setup` 200, la misma contraseña entra, Claves dice
   «recuperada» y deja guardar una clave nueva; no queda ningún trabajador (`matarSiVive` en `finally`).
2. `oportia-recuperar.sh poner` en raíz falsa: sin base → la pone; con base (+`-wal`, `-shm`) → los tres apartados con el mismo sufijo e
   idénticos (sha256), la nueva en su sitio; salud mala → todo vuelve EXACTAMENTE (huellas) y la recuperada queda con su nombre de
   «no arrancó»; el archivo `oportia-llave-secretos` y `oportia-copias/` no cambian nunca.
3. `oportia-servidor.sh pasar` y `volver` en raíz falsa: el cron vuelve byte por byte; `/usr/local/bin/jarvis-actualizar` intacto; con
   una revisión ✖ no cambia nada; fallo a mitad → vuelve solo.
4. Reglas de los scripts: cada `deploy/*.sh` pasa `bash -n`, empieza con `set -euo pipefail`, no trae `set -x`, `rm` solo dentro de
   `borrar_lo_mio`, ningún `curl … | bash` salvo la línea documentada de `cloud-init.sh`, el bloque `salud` idéntico en los dos sitios,
   el mismo REPO en todos lados, `node.pin` con versión `22.x.y` y dos sha256 de 64 hex, `jarvis.service` con
   `KillMode=control-group` y sin `KillMode=process`, cada `sudo oportia <palabra>` de `es.json`/`en.json`/README existe en
   `deploy/oportia.sh`, `cloud-init.sh` ≤ 8 KB y con `TS_AUTHKEY="PEGA_AQUI"`.
5. `oportia-admin.mjs --copias=antes-de-cambio`: crea el archivo nuevo, se abre como base de OPORTIA, y si el nombre existe no lo pisa.
+ `test/pantallas.test.js`: los 7 pasos (pantalla = hoja = README), los textos nuevos en los dos idiomas, los botones «Copiar» solo
donde hay texto que copiar, la tarjeta «Actualizaciones» en sus dos estados. `test/reglas.test.js`: lo de 9.1.4 puede vivir aquí.

### 9.2 Fuera de la suite: `test/ensayo-instalar.mjs` (lo corre el constructor antes de cada commit, y GitHub)
`install.sh` completo en raíz falsa: NUEVA (orden y argumentos de cada llamada; la clave de Tailscale nunca aparece en `llamadas.log`,
en el registro ni en la pantalla, solo `file:<ruta>`; modos y dueños de lo creado; el sha256 de Node malo → se detiene antes de `tar`);
**segunda corrida = cero llamadas que cambian**; EXISTENTE con una carpeta llena (`oportia.db`, llave, copias, `.env`, unidad vieja,
cron, `ufw` activo, Tailscale ya unido) → huellas idénticas de TODO lo que había; `--solo-actualizador`; sin clave → pasos pendientes y
salida 0; arm64. `shellcheck` de todos los `.sh` si se puede conseguir (si no, se dice claro en el informe del commit).

### 9.3 En Docker / GitHub
Aquí hoy **no se puede** (sin demonio y con el límite de Docker Hub): se deja escrito y corre en GitHub Actions (gratis, repositorio
público), trabajo nuevo `instalador`: `bash -n` + `shellcheck` + el ensayo; y un paso en un contenedor `ubuntu:24.04` con `apt-get` y
`useradd` de verdad, Node bajado y comprobado de verdad, y `systemctl`/`tailscale`/`ufw` falsos. **Su primera corrida real será después
de subir la rama**: mirarla antes de unir a `main` (no bloquea al servidor, que no depende de GitHub Actions).
Lo que NINGUNA prueba de aquí cubre de verdad: systemd real (temporizador, `KillMode`, `daemon-reload`), `ufw` real, Tailscale y Funnel
reales, cloud-init real, la Consola de DigitalOcean con el cortafuegos puesto. Eso es el simulacro.

### 9.4 El simulacro (lista de comprobación; Junior decide cuándo)
**Gratis, hoy mismo, en producción:** `sudo oportia probar-copia` (baja y abre su última copia sin tocar nada).
**Completo, en un Droplet de ensayo** (cuesta centavos: se paga por hora y se destruye al terminar → **pedir permiso**, D7):
☐ crear la clave de Tailscale de un solo uso ☐ crear el Droplet con el texto pegado (nombre de máquina de ensayo: el instalador avisará
que no se llama `jarvis`; es lo esperado) ☐ a los 10 min abre el enlace https ☐ `sudo oportia estado` todo en verde ☐ la Consola web
sigue entrando con el cortafuegos puesto ☐ `sudo oportia recuperar --simulacro` ☐ entra con su usuario y ve sus proyectos ☐ **no pega
el token ni hace /revoke** ☐ reiniciar el Droplet: vuelve solo, el enlace sigue ☐ `systemd-cgls -u jarvis.service` muestra 2 procesos
de node y `systemctl stop jarvis` no deja ninguno ☐ destruir el Droplet y quitar la máquina en Tailscale.
Lo que salga distinto de lo «sin verificar» de §1.3 se corrige antes de tocar producción.

---

## 10 Riesgos

| Riesgo | Qué se hace |
|---|---|
| La 0.6.0 llega a producción por el actualizador VIEJO, y sus pruebas nuevas (bash, raíz falsa) corren allí como root | falsos obligatorios y fallo cerrado (regla 3.3); se saltan si falta una herramienta; ninguna toca rutas reales (prueba 9.1.7 con testigos); 3 corridas con `taskset -c 0` antes de publicar |
| Una prueba inestable deja una versión buena en `version.bad` | sin tiempos ajustados en las pruebas nuevas; `oportia actualizar --reintentar`; el registro de la prueba fallida ahora se guarda |
| Actualizador nuevo defectuoso | sus pruebas corren antes de instalarlo; `--autoprueba`; `.anterior` + lanzador (3 fallos → vuelve); `actualizador_parado` avisa; último recurso, una línea: `curl … cloud-init.sh \| sudo bash` con `--solo-actualizador` (documentada) |
| Corte de luz entre los dos cambios de nombre de `/opt/jarvis` | el paso 0 de cada corrida lo repara (a los 3 min de arrancar y cada 30); ventana de milisegundos (hoy es de segundos, con el código a medias) |
| El servicio comprometido usa a root (enlaces en `/var/lib/jarvis`) | regla 3.6 + prueba 9.1.9; el actualizador corre desde copias de root, nunca desde una carpeta escribible por `jarvis` |
| Clave de Tailscale legible en los metadatos del Droplet | de un solo uso y 1 día; el archivo temporal se quita; nunca en registros ni argumentos |
| El cortafuegos deja a Junior sin Consola | el 22 queda abierto (con límite); `sshd` no se toca; el simulacro lo comprueba antes; la «Recovery Console» de DO no depende de la red |
| Funnel no se enciende solo (política del tailnet) | cae a `serve` (https solo en su red), lo dice con los pasos; en el mismo tailnet de hoy ya está permitido |
| El servidor nuevo queda como `jarvis-1` | paso 2 de la lista (quitar el viejo) + aviso del instalador; el enlace https nuevo funciona; el nombre fijo de `red.js` solo afecta al http directo |
| La clave de máquina de Tailscale vence (≈180 días) y el servidor «desaparece» | en la lista: «Disable key expiry» en esa máquina (sin verificar el plazo); `oportia estado` muestra el vencimiento si `tailscale status --json` lo da |
| Dos servidores con el mismo bot tras un simulacro | `--simulacro` no pide pegar el token y deja modo seguro; 1e ya avisa «Otro servidor manda copias» |
| Recuperar encima de datos buenos por error | aviso con los números, palabra `APARTAR`, nada se borra, deshacer automático si no arranca |
| Node de producción no se actualiza nunca | fuera de 1f; `revisar` lo muestra; anotado para después |
| Disco: `respaldo/`, bases apartadas y partes bajadas se quedan para siempre | es la regla del dueño; `revisar`/`estado` dicen cuánto ocupan; nada se limpia sin su «sí» |
| 512 MB: pruebas + app a la vez en el servidor nuevo | swap de 1 GB + `Nice=5`; el constructor mide el pico de memoria de la suite (muestreo de RSS) y, si pasa de 900 MB, el valor por defecto sube a 2 GB |

---

## 11 Construcción en 2 pasos

**Paso 1 — scripts, actualizador, recuperar, pruebas y raíz falsa** (delicado: datos y servidor → revisión completa)
`deploy/`: todos los archivos de §2 menos `LEEME.md`; `oportia-admin.mjs --copias=antes-de-cambio`; `jarvis.service` (`KillMode`);
`src/copias/vigilar.js` `leerEstadoDelActualizador` (sin el aviso ni la pantalla); `test/raiz-falsa.js`, `test/actualizador.test.js`,
`test/instalar.test.js` (1–5), `test/ensayo-instalar.mjs`; `.github/workflows/pruebas.yml`; `package.json` 0.6.0.
Hecho cuando: suite completa como el actualizador (y ×3 con `taskset -c 0`), sin trabajador vivo; ensayo en raíz falsa bien, segunda
corrida sin cambios; `bash -n` (y `shellcheck` si se consigue) limpio; se dice por escrito qué NO se pudo probar de verdad (§9.3).

**Paso 2 — pantalla, textos, README, lista de comprobación y corrida del simulacro en raíz falsa**
§8 completo (tarjeta de 7 pasos, `#copias/recuperar`, ruta del texto de instalación, tarjeta «Actualizaciones», aviso
`actualizador_parado`, grupo «Esta base se recuperó» en Primeros pasos), `es.json`/`en.json`, `test/pantallas.test.js`, README,
`deploy/LEEME.md`, la lista del simulacro; corrida final del ensayo y de la suite; revisión corta de pantallas (PC y celular).

---

## 12 Decisiones para Junior (todas con una opción segura por defecto; nada se le pregunta para construir)

| # | Pregunta en sencillo | Por defecto (seguro) |
|---|---|---|
| D1 | ¿Paso el servidor de hoy al actualizador nuevo? | **Todavía no.** 1f solo deja las órdenes listas; se hace cuando él lo diga, después del simulacro. Mientras, todo sigue igual. |
| D2 | ¿Cambio también el archivo del servicio en producción? | No, salvo que `revisar` encuentre algo peligroso. |
| D3 | ¿Entrada por «Tailscale SSH» en el servidor nuevo? | No (menos puertas). Se entra por la Consola de DigitalOcean. |
| D4 | ¿Que el servidor se reinicie solo de madrugada cuando una actualización de seguridad lo pida? | No. (Sin reinicio, algunos arreglos del sistema esperan al próximo reinicio a mano.) |
| D5 | ¿Cerrar la entrada por contraseña de `sshd` en el servidor nuevo? | No tocar `sshd`; usar una contraseña de root larga guardada en Contraseñas. Revisar tras el simulacro. |
| D6 | ¿Borro las carpetas viejas de las pruebas en `/tmp` de producción (pueden ser varios GB)? | No se borra nada; `revisar` dice cuánto ocupan. Un reinicio del servidor suele vaciar `/tmp` (sin verificar en esa máquina). |
| D7 | ¿Hacemos el simulacro completo en un Droplet de ensayo (centavos, se destruye al terminar)? | No sin su permiso. El simulacro gratis (`probar-copia`) sí se puede cuando quiera. |
| D8 | ¿Memoria de apoyo (swap) del servidor nuevo: 1 GB o 2 GB? | 1 GB (deja más disco para las copias); 2 GB si la medida del paso 1 lo pide. |
| D9 | ¿Que Tailscale se actualice solo en el servidor? | No (una versión nueva de Tailscale ya rompió Funnel a otros); se actualiza a mano cuando haga falta. |
