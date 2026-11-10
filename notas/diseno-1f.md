# OPORTIA — Diseño de la parte 1f (0.6.0): instalar, actualizar y recuperar el servidor

Base: `main` 54b9bb9 (0.5.1). Rama `fase-1f`. **Sin migración** (la base queda en la 6). `package.json` → 0.6.0.
Designed 10 nov 2026; **revisión 2** (misma fecha) tras la crítica: los cambios y lo rechazado están en §13.
English for the builders; every owner-facing text is given in simple Spanish.

---

## 0 Resumen de las decisiones

| Tema | Decisión |
|---|---|
| Instalar un servidor nuevo | `deploy/cloud-init.sh` (nuevo, ~70 líneas, se pega en «User data») baja el repositorio por SHA y corre `deploy/install.sh`. Toda la lógica vive en `install.sh`; el texto pegado casi nunca cambia. |
| Orden de la instalación | Primero lo que protege y da acceso (**swap → paquetes → Node → usuario → cortafuegos → Tailscale**), después el actualizador y la app. Si la app no queda puesta, el servidor igual queda protegido, alcanzable y con una línea para reintentar. |
| Código de la app en la instalación | **No lo copia `install.sh`**: lo instala el MISMO actualizador (primera vez = una actualización sobre `/opt/jarvis` vacío). Un solo camino: pruebas primero → copiar → arrancar → revisar salud. En la instalación (`--sha`) nunca se escribe ni se obedece `version.bad`. |
| Node | Versión FIJA con su sha256 FIJO en el repositorio (`deploy/node.pin`), bajada de nodejs.org y comprobada con `sha256sum -c` antes de abrirla. |
| Actualizador | En el repositorio (`deploy/`), instalado como **juego de copias de root por versión** en `/usr/local/lib/oportia/v-<sha7>/`, con los enlaces `actual` y `anterior`. Lo llama un **lanzador** mínimo y fijo (candados + tope de tiempo + vigilancia). Se actualiza a sí mismo solo DESPUÉS de una actualización sana, cambiando el enlace `actual` (atómico); si el nuevo falla, se cuelga o no deja rastro 3 veces, el lanzador vuelve a `anterior`. |
| Las pruebas en el servidor | El actualizador nuevo corre la suite bajada como el usuario **`nobody`**, no como root. Las pruebas de los scripts corren en raíz falsa y, si quien las corre es root, bajan a `nobody` con `setpriv`. Los scripts **se niegan a actuar de verdad** si no están en una carpeta de root conocida. |
| Salud | Nunca se acepta un 200 que llegue fuera de la puerta de arranque de 90 s de la app: 2 respuestas buenas dentro de **70 s contados desde la primera respuesta del servidor** (§3.7). |
| Programador | `oportia-actualizar.timer` de systemd (cada 30 min) en vez de cron. Nunca encendido mientras exista el cron viejo. |
| Compatibilidad con 1e | Las 3 líneas de `update.log`, `version.txt` y `version.bad` quedan **byte por byte** como hoy (una prueba pasa las líneas reales por `lineasDeActualizacion`). Lo nuevo va en líneas `… aviso: …` (que 1e ignora) y en un archivo de estado propio. |
| Recuperar | `sudo oportia recuperar`: envuelve `oportia-restaurar.mjs` (sin cambiar su contrato), aparta la base que haya **y la llave que era de esa base** (nunca borra ni pisa), pone la recuperada, arranca, revisa salud y deshace solo si no arranca. |
| Servidor de producción | **Pasar al actualizador nuevo, sí, pero en pasos que decide Junior**: `revisar` (no cambia nada) → `pasar` (copia primero, deshace solo si algo falla) → `volver` (una orden). Las dos primeras se corren con una línea que baja los scripts de GitHub a una carpeta de root (nunca se ejecuta como root nada de `/opt/jarvis`). No toca datos, red, cortafuegos, Tailscale ni Node. «Dejarlo como está» sigue siendo válido. |
| `deploy/cloud-init.sh` viejo (Oracle) | Se reemplaza en su misma ruta; queda en la historia (`git show 54b9bb9:deploy/cloud-init.sh`), anotado en `deploy/LEEME.md` y en el README. |
| Pantalla | Copias → «Si un día pierdes el servidor» pasa de 6 a 7 pasos reales con órdenes para copiar; Servidor → tarjeta «Actualizaciones» (estado real del actualizador). |
| Lo que se dice de las pruebas | El instalador **solo se ha probado en simulación** (raíz falsa). README, pantalla y mensaje del commit lo dicen así hasta que se haga el simulacro (D7). |

---

## 1 Lo que se leyó y los hechos en los que se apoya

### 1.1 Del código (verificado leyendo `wt-1f`)
- `src/nucleo/config.js`: datos = `OPORTIA_DATOS` o la carpeta de `DB_PATH`, por defecto `/var/lib/jarvis`. `PORT` (8080), `HOST` (127.0.0.1).
  OPORTIA no lee ninguna otra variable en producción (`SETUP_TAILNET_ONLY` del `.env` viejo ya no se usa).
- `src/nucleo/red.js`: solo atiende si la dirección LOCAL es 127.x/::1 o de Tailscale (100.64/10, fd7a:115c:a1e0::/48). El enlace
  https (Tailscale Serve/Funnel) llega por 127.0.0.1 con `Tailscale-User-Login` / `Tailscale-Funnel-Request`.
  **`NOMBRES_DEL_SERVIDOR = {'jarvis.taila693e9.ts.net', 'jarvis'}` está fijo en el código**: una conexión DIRECTA por la red
  privada con otro nombre recibe 421 (por https y por IP sí entra). → el servidor nuevo debe llamarse `jarvis` (§4.3 paso 8).
- **La puerta de arranque (clave para la salud)**: `src/server.js` hace `abrirBase` (migraciones) → `crearSupervisor` → `listen` →
  dentro del `listen`, `supervisor.iniciar()`. `/api/setup` (pública) contesta 503 `arrancando` mientras `estadoArranque()` es
  `arrancando` o `fallido`; `src/tareas/supervisor.js:39,146`: pasados **90 s desde `iniciar()`** devuelve `no_aplica` y `/api/setup`
  es 200 **aunque el trabajador haya fallado 3 veces**. → un 200 solo prueba que el trabajador arrancó si llega DENTRO de esos 90 s.
  El actualizador de hoy mira 60 s (20 × 3 s): por eso hoy una versión con el trabajador roto sí vuelve atrás. 200 trae
  `{app:'oportia', version:<package.json>, base, necesitaAdmin}`.
- `src/server.js`: el puerto es el candado; el trabajador es un hijo NO separado (mismo grupo de control). `deploy/jarvis.service`
  no fija `KillMode` (por defecto `control-group`, que es lo que la 1c necesita). `test/reglas.test.js` exige `^LimitCORE=0$` en la unidad.
- `src/copias/vigilar.js` (1e): lee SOLO LECTURA los últimos 64 KB de `<datos>/update.log` y `<datos>/version.bad`. Regex ancladas:
  `^(\S+) versión ([0-9a-f]{7}): alguna prueba falló, NO se instaló$` · `^(\S+) versión ([0-9a-f]{7}) no arrancó: volví a la anterior$` ·
  `^(\S+) actualizado a ([0-9a-f]{7})$`; la fecha se lee con `Date.parse` (`date -Is`); la última línea sin `\n` se ignora;
  cualquier otra línea se ignora. `version.bad` = 40 hex. El servicio (usuario `jarvis`) debe poder LEER los dos archivos.
- `deploy/oportia-restaurar.mjs` + `src/copias/restaurar.js`: contrato completo en diseno-1e §9. No corre como root; clave y token
  por la entrada (ocultos en una terminal); nunca pisa (`wx`, y rechaza si existe `destino` o `destino-wal`); la marca de OPORTIA se
  escribe al final; `ajustarTrasRestaurar` deja la marca `claves.restaurada` (con las huellas de las claves que traía la copia).
  Salidas: 0 · 2 uso · 3 clave · 4 copia · 5 destino existe · 6 Telegram/red · 7 formato nuevo · 8 cancelada.
- **La llave de las claves** (`src/claves/almacen.js:130-138`, `cifrado.js:162-173, 271`): el archivo `oportia-llave-secretos` no viaja
  en las copias. Si NO existe y la base trae la marca `restaurada` → `estadoAlmacen` = `{listo:true, motivo:'restaurada'}` y la
  pantalla Claves dice «pega otra vez tus claves» (la primera clave guardada crea una llave nueva). Si el archivo **SÍ existe**
  (aunque sea de otra base) → `{listo:true, motivo:null}`: la pantalla ya no avisa y las claves guardadas no se pueden leer.
  La app mira además los nombres `oportia-llave-secretos.nueva-…` y `.danada-…` de la carpeta de datos. → §6.2 paso 5 decide qué
  hacer con una llave que ya está.
- `test/copias-restaurar.test.js` 1.15/1.16 ya cubren copia → cifrar → restaurar → comparar TODO. Lo que falta (y pone 1f): que la
  base recuperada **arranque como servidor** en una carpeta nueva (sin llave y con una llave ajena), y que «poner la base» nunca pise.
- `test/reglas.test.js`: busca secretos en `.sh`, `.service`, `.md`… con `/tskey-[A-Za-z0-9-]{10,}/` → **ningún archivo puede traer
  `tskey-` seguido de 10 letras/guiones** (el marcador es `PEGA_AQUI`; en los textos, «empieza con tskey-auth-» y nada pegado detrás).
  Las pruebas van todas en `test/` SIN subcarpetas (los comandos falsos se escriben al correr, en la carpeta temporal).
- La pantalla ya tiene Copias → «Si un día pierdes el servidor» (`PASOS_RESTAURAR` 1–6, `copias.restaurar.paso1…6`, la hoja impresa y
  el README con la misma cuenta; `test/pantallas.test.js` «revisión: los pasos para recuperar…» lo comprueba) y `copiarTexto()`.
- **Modo de prueba y la carpeta temporal** (`src/nucleo/db.js:29-36`, `revisarModoPrueba`): con `OPORTIA_TEST=1` solo se escribe
  dentro de `os.tmpdir()`. Varias pruebas lanzan hijos (la consola, el servidor) con un entorno propio SIN `TMPDIR`
  (`test/rescate.test.js:26`…): para esos hijos `tmpdir()` es `/tmp`. → **si el `TMPDIR` de la suite no está debajo de `/tmp`, 15
  pruebas fallan y la corrida vence** (comprobado en la revisión 2, §1.3). Por eso la carpeta de cada corrida del actualizador va
  en `/tmp` (§5.3 paso 3), no en `/var/lib/oportia-actualizador`.
- `src/ia/llamar.js` hace `fetch` a direcciones de proveedores: el servicio sí sale a la red (motivo de `IPAddressDeny`, §4.4).

### 1.2 Del actualizador de hoy (`/usr/local/bin/jarvis-actualizar`, texto en el `cloud-init.sh` viejo)
cron `/etc/cron.d/jarvis-actualizar` (`*/30`), candado `/run/jarvis-actualizar.lock`, SHA por `api.github.com/repos/$REPO/commits/main`
(`Accept: application/vnd.github.sha`), tarball por `codeload.github.com/$REPO/tar.gz/$SHA`, pruebas `timeout 900` **como root**,
`rm -rf` + `cp -a` de `/opt/jarvis.anterior` (incluye una copia del `.env`), copia EN SU SITIO `src public deploy package.json`,
reinicia, 20 intentos de `/api/setup` (60 s), vuelve atrás el código.
Defectos que 1f corrige: (a) las pruebas dejan ~300 MB por corrida en `/tmp` y nadie los quita (disco de 10 GB); (b) el registro de la
prueba fallida se borra; (c) la copia en su sitio deja una ventana con el código a medias; (d) la salud no mira QUÉ versión contesta;
(e) no se puede arreglar a distancia; (f) nada dice si el actualizador sigue vivo (nunca se confirmó que producción instale versiones);
(g) la suite bajada de internet corre como root.

### 1.3 Hechos externos y medidas
| Hecho | Estado |
|---|---|
| `https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz` sha256 `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce`; `…-linux-arm64.tar.xz` sha256 `6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b`; `SHASUMS256.txt`, `.sig` y `.asc` existen | **VERIFICADO** dos veces (diseño y revisión) |
| La suite de hoy en UN núcleo rápido: 135 s, 543 pruebas, ~360 MB de pico de memoria de node, 302 MB de temporales | **MEDIDO** por la revisión. En el vCPU compartido de 512 MB con swap será varias veces más lento: **no se promete «2–3 min»**; el tope sigue en 900 s y el simulacro mide el tiempo y el pico reales |
| La suite de hoy corrida como `nobody` (`setpriv --reuid=65534 --regid=65534 --clear-groups`, `env -i`, carpeta propia) | **VERIFICADO aquí (revisión 2)**: con `TMPDIR` debajo de `/tmp` → 543 pruebas, 542 pasan, 1 se salta sola (la 447, «se niega a correr como root», que solo aplica a root), 0 fallan, sin trabajador vivo. Con `TMPDIR` en `/var/tmp` → 15 fallan y vence a los 900 s (no por `nobody`: por la carpeta, §1.1) |
| `flock`: un hijo que ABRE otra vez el archivo no puede tomar el candado que tiene su padre; un hijo que HEREDA el descriptor sí lo comparte. `mv -T a b` con `b` carpeta no vacía falla («Directory not empty») | **VERIFICADO aquí** (coreutils 9.4, util-linux) |
| Tailscale: instalar por el repositorio apt (`pkgs.tailscale.com/stable/ubuntu/<codename>.noarmor.gpg` → `/usr/share/keyrings/tailscale-archive-keyring.gpg`, y `<codename>.tailscale-keyring.list`) | Confirmado por búsqueda (página oficial); **no se pudo abrir tailscale.com desde esta sesión** |
| `tailscale funnel --bg <puerto>`; puertos públicos 443 (por defecto), 8443, 10000; `tailscale funnel status`, `tailscale funnel reset`; pide activar Funnel en la política | Confirmado por búsqueda (referencia oficial del comando) |
| `tailscale serve status` en un nodo SIN configuración imprime el texto «No serve config» (no una salida vacía); `--json` da `{}` | **SIN VERIFICAR** (conocimiento previo de la revisión). Por eso el instalador **no decide por esa salida** (§4.3 paso 8) y los falsos devuelven esas cadenas |
| `tailscale up --auth-key=file:<ruta>` (la clave no queda en la lista de procesos); el Funnel `--bg` sigue tras reiniciar; `tailscale file get <carpeta>` (Taildrop); las claves de máquina vencen (180 días) si no se desactiva | **SIN VERIFICAR**. Cada uno tiene salida (pasos «pendiente») y el simulacro los comprueba |
| DigitalOcean «User data»: lo usa cloud-init en el PRIMER arranque; no se puede cambiar después; el resultado queda en `/var/log/cloud-init-output.log` | Confirmado por búsqueda (docs oficiales); **no se pudo abrir docs.digitalocean.com** |
| DO: tope de tamaño del User data (≈64 KB); el texto queda legible en el servicio de metadatos (169.254.169.254, para CUALQUIER proceso del servidor) y en `/var/lib/cloud/`; la Consola web del Droplet necesita el puerto 22 y, quizá, entrada por contraseña; los nombres exactos del formulario de creación (región, «Basic → Regular», «Password») | **SIN VERIFICAR** → clave de Tailscale de UN solo uso que además se borra a mano, arrancador pequeño, el cortafuegos deja el 22 y se comprueba a sí mismo, y los textos del formulario se confirman en el simulacro |
| Docker aquí | El cliente existe; **el demonio no corre y Docker Hub responde «toomanyrequests»** → hoy solo raíz falsa. `shellcheck` no está instalado (probar `pip install shellcheck-py`; si no, solo `bash -n` y decirlo) |
| GitHub Actions | El trabajo `instalador` **nunca ha corrido** y hoy no se puede contactar a GitHub: no cuenta como prueba de este commit |
| Producción | **SIN VERIFICAR**: contenido real de `/opt/jarvis/.env` y de la unidad instalada, **dueño de `/opt/jarvis`** (el `install.sh` viejo pudo dejarlo a nombre de `jarvis`), si `ufw` está activo (lo probable: inactivo, el script de Oracle usaba `iptables`), ruta de Node, swap, cuánto hay en `/tmp`. `revisar` lo dice sin cambiar nada (§7.2) |

---

## 2 Archivos y responsabilidades

```
deploy/
  cloud-init.sh              NUEVO contenido. Arrancador para «User data» de DigitalOcean, y para las líneas con curl. §4.1
  install.sh                 NUEVO. Instalador idempotente. §4
  node.pin                   NUEVO. NODE_VERSION, NODE_SHA256_X64, NODE_SHA256_ARM64 (3 líneas CLAVE=valor).
  oportia-comun.sh           NUEVO. Funciones compartidas (se carga con «source» desde su misma carpeta). §3
  oportia-orden.sh           NUEVO. Fijo y mínimo (~25 líneas): se instala como /usr/local/sbin/oportia. §3.8
  oportia.sh                 NUEVO. Reparte «oportia <palabra>» (vive en el juego de la versión). §3.8
  oportia-actualizar.sh      NUEVO. El actualizador. UN solo archivo, no carga otros. §5
  oportia-lanzador.sh        NUEVO. Lanzador fijo: candados + tope de tiempo + vigilancia del actualizador. Un solo archivo. §5.2
  oportia-actualizar.service NUEVO. Unidad «oneshot» que corre el lanzador.
  oportia-actualizar.timer   NUEVO. Cada 30 minutos.
  oportia-servidor.sh        NUEVO. revisar | pasar | volver | servicio | tailscale | estado. §7
  oportia-recuperar.sh       NUEVO. recuperar | probar-copia | poner (interno). §6
  oportia-base.mjs           NUEVO. Ayuda de solo lectura (corre como «jarvis»): cuenta usuarios/proyectos de una base y dice
                             si un archivo de llave abre las claves guardadas en ella («sirve» / «ajena» / «sin claves»).
  oportia-admin.mjs          + «--copias=antes-de-cambio» (copia local completa con VACUUM INTO, archivo nuevo). §7.2
  oportia-restaurar.mjs      SIN cambios de contrato (solo la línea de comentario «La parte 1f pone…»).
  jarvis.service             + «KillMode=control-group» explícito y «IPAddressDeny=169.254.169.254». Nada más. §4.4
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

## 3 Reglas comunes de los scripts (`oportia-comun.sh` y, repetidas dentro, en el actualizador, el lanzador y `cloud-init.sh`)

### 3.1 Cabecera
`#!/bin/bash`, `set -euo pipefail`, `IFS=$'\n\t'`, `umask 022`, `export LC_ALL=C.UTF-8`, `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`.
**Todo** el cuerpo, en TODOS los scripts (también `cloud-init.sh`), dentro de `principal() { … }; principal "$@" </dev/null; exit $?`:
bash lee el archivo entero antes de correr (cambiarlo a mitad no rompe nada) y, cuando el script llega por `curl … | bash`, ningún
hijo (apt-get, tar, read) puede comerse el resto del script por la entrada. Lo que se le pregunta a una persona se lee SIEMPRE de
`/dev/tty`. **No se usa `$HOME`** ni ninguna variable que systemd no ponga (bajo `set -u`, un servicio de root no tiene `HOME`); lo
que un hijo necesite se le pasa explícito.

### 3.2 Rutas por un solo prefijo
`RAIZ="${OPORTIA_RAIZ:-}"`; todas las rutas son `"$RAIZ/opt/jarvis"`, `"$RAIZ/var/lib/jarvis"`, `"$RAIZ/var/lib/oportia-actualizador"`,
`"$RAIZ/usr/local/lib/oportia"`, `"$RAIZ/usr/local/sbin"`, `"$RAIZ/etc/systemd/system"`, `"$RAIZ/etc/cron.d"`, `"$RAIZ/run"`, `"$RAIZ/root"`, `"$RAIZ/tmp"`.
Los programas se llaman por NOMBRE (por el `PATH`), nunca por ruta absoluta.
**Regla estática de la suite** (`test/reglas.test.js`): en `deploy/*.sh`, todo literal que empiece por `/` seguido de un nombre de
carpeta del sistema (`/etc`, `/opt`, `/var`, `/usr`, `/run`, `/root`, `/tmp`, `/home`, `/swapfile`, `/boot`, `/lib`, `/sbin`, `/bin`)
debe ir precedido en la misma palabra por `"$RAIZ` o `$RAIZ`. Lista de permitidos, exacta: la línea `#!/bin/bash`, la línea `PATH=…`
de la cabecera, `/dev/tty`, `/dev/null`, `/proc/…`, las URL `https://…`, y el texto de los comentarios.

### 3.3 Modo real y modo de prueba: los dos fallan cerrado
- **Modo de prueba**: `OPORTIA_PRUEBA=1` exige `RAIZ` no vacía y DENTRO de `${TMPDIR:-/tmp}` (comparada con `realpath`) y exige
  `OPORTIA_FALSOS` (carpeta de comandos falsos). Con `OPORTIA_PRUEBA=1` nunca se comprueba ser root.
- **Modo real** (sin `OPORTIA_PRUEBA`): `RAIZ` debe ser vacía, el usuario debe ser root, **y además debe cumplirse una señal
  positiva**: la carpeta de `realpath "$0"` es una de `/usr/local/lib/oportia`, `/usr/local/lib/oportia/v-<7 hex>`,
  `/usr/local/sbin`, `/root/oportia-instalador-<7 hex>/deploy`, y el archivo y cada carpeta de esa cadena son de root, no
  escribibles por grupo ni por otros, y no son enlaces (salvo `actual`/`anterior`, que deben apuntar a un `v-<7 hex>` hermano).
  Si no → «Este programa solo corre instalado; no hice nada» y `exit 1` **antes de cualquier otra cosa**. Así un script corrido
  desde la carpeta temporal de una prueba (o desde `/opt/jarvis/deploy`) **no puede actuar de verdad** aunque pierda sus variables.
  `cloud-init.sh` (que llega por la entrada o por cloud-init, sin ruta propia) usa la señal contraria: se niega al modo real si
  `$0` es un archivo que tiene al lado `oportia-actualizar.sh` (es decir, si lo corren desde una copia del repositorio).
- Los comandos que tocan el sistema van SIEMPRE por `sistema <orden> …`: en modo real corre la orden; en modo de prueba corre
  `"$OPORTIA_FALSOS/<orden>"` y **si no existe, falla** (nunca cae al comando real). Lista exacta: `systemctl apt-get dpkg tailscale
  ufw useradd id runuser setpriv swapon mkswap fallocate curl hostnamectl ss chown chgrp df`. (Fuera `apt-key`, `crontab`, `reboot`,
  `sysctl`, `timedatectl`: nada los usa, y así una llamada perdida falla.) `curl` va por ahí: las pruebas nunca tocan la red.
  `chown`/`chgrp` van por ahí porque las pruebas no corren como root (abajo); nunca se usa `install -o`.
  `cp mv ln mkdir mktemp tar sha256sum flock dd stat date timeout` son los de verdad (dentro de la raíz falsa).
- **Las pruebas nunca ejercitan estos scripts como root.** `test/raiz-falsa.js`: si `process.getuid() === 0`, cada script se corre con
  `setpriv --reuid=nobody --regid=nogroup --clear-groups` (util-linux) y la raíz falsa es de `nobody`: una ruta sin prefijo falla con
  «Permission denied» en vez de escribir. Si es root y falta `setpriv`, o la carpeta temporal no se puede recorrer como `nobody`,
  esas pruebas **se saltan** con su motivo. Siempre con `env -i` y solo `PATH`, `TMPDIR`, `OPORTIA_PRUEBA`, `OPORTIA_RAIZ`,
  `OPORTIA_FALSOS` (sin `HOME`: imita a systemd).

### 3.4 Decir y fallar
`decir "<texto>"` → pantalla y registro, con fecha. `fallar "<texto>"` → lo mismo y `exit 1`. Español sencillo. Nunca un secreto.

### 3.5 Nunca pisar ni borrar
- `poner_si_falta <origen> <destino> <modo> <dueño>`: si el destino existe e iguala → «ya estaba»; si existe y difiere → NO lo toca
  y deja el nuevo en `"$RAIZ/var/lib/oportia-actualizador/propuestos/<nombre>.nuevo-<12 hex del sha256>` (fuera de
  `/etc/systemd/system`; el mismo contenido da el mismo nombre → **una segunda corrida no crea nada**) y lo dice.
- `apartar <ruta>` = `mv -nT` a `<ruta>.apartada-<AAAAMMDD-HHMMSS>` (nunca borra).
- **El único borrado permitido es `borrar_lo_mio <ruta>`**, que exige ruta no vacía, que no sea un enlace, y que sea EXACTAMENTE una de:
  1. la carpeta temporal PROPIA creada con `mktemp -d` en esta corrida, o algo dentro de ella;
  2. `"$RAIZ/tmp/oportia-corrida.<6 caracteres>"` y solo si es una carpeta **de root** (`stat`: mismo dueño que quien corre) que trae
     el archivo `.oportia-corrida` de root: las corridas cortadas del propio actualizador. Una carpeta con ese nombre plantada
     por otro usuario en `/tmp` no se toca;
  3. `"$RAIZ/opt/jarvis.nueva"`, `"$RAIZ/opt/jarvis.mala"`, `"$RAIZ/opt/jarvis.anterior"` — las tres rutas literales, y **solo si son
     carpetas que traen el archivo `.oportia-codigo`** (lo pone el actualizador nuevo en todo lo que arma). Una
     `/opt/jarvis.anterior` hecha por el actualizador VIEJO (sin esa marca, con su copia del `.env`) no se borra nunca: se `apartar`.
  Cualquier otra ruta → `fallar`. Corre `rm -rf --one-file-system --`. Una prueba le pasa `/`, `""`, `"$RAIZ/opt/jarvis"`,
  `"$RAIZ/var/lib/jarvis"`, un enlace a una carpeta permitida y una `.anterior` sin marca: todas se rechazan y nada cambia.
  Regla de la suite: en `deploy/*.sh` la palabra `rm` solo aparece dentro de `borrar_lo_mio`.
- Los archivos de estado PROPIOS (en `/var/lib/oportia-actualizador`) se reemplazan enteros con archivo temporal + `mv -fT`; una
  marca «se quita» cambiándole el nombre a `<marca>.ultima` (se pisa la `.ultima` anterior: es estado propio, no dato).
- OJO con `mv -nT`: en coreutils 9.4 (Ubuntu 24.04, probado aquí) sale con 1 si el destino existe; en versiones anteriores
  (Ubuntu 22.04) sale con 0 SIN mover. Nunca fiarse del código de salida: después de cada `mv -n` se comprueba que el origen ya
  no existe y que el destino es el archivo esperado.

### 3.6 Escribir como root dentro de `/var/lib/jarvis` nunca sigue enlaces
Reemplazar = archivo temporal en la carpeta de root + `mv -fT` (el cambio de nombre reemplaza el enlace, no su destino); agregar una
línea = `printf '%s\n' "$linea" | dd of="$LOG" oflag=append,nofollow conv=notrunc status=none`; después `chmod 644` solo si el archivo es
normal (`[ -f ] && [ ! -L ]`). **Si el destino existe y no es un archivo normal ni un enlace (p. ej. una carpeta plantada): no se
toca, se anota `aviso:` y la corrida sigue** (el estado propio de root, §5.1, no depende de esa carpeta).
(Probado aquí con coreutils 9.4: `dd … oflag=append,nofollow` sobre un enlace falla con «Too many levels of symbolic links» y no
toca el destino; `mv -fT` sobre un enlace reemplaza el enlace y deja intacto el archivo al que apuntaba.)

### 3.7 Salud: nunca más allá de la puerta de 90 s
Dos funciones distintas (el bloque `# >>> salud` … `# <<< salud` es idéntico en `oportia-comun.sh` y en el actualizador; regla de la suite):
- **`arrancar_y_salud <restart|start> <version-esperada|-> [espera_puerto]`** — la única que decide «sana»:
  1. `systemctl <restart|start> jarvis`.
  2. **Esperar el puerto**: cada 3 s `curl -sS -m 5 -o … -w '%{http_code}' http://127.0.0.1:$PUERTO/api/setup` hasta la PRIMERA
     respuesta HTTP (200 o 503), como mucho `espera_puerto` segundos (60 por defecto; 300 en `poner`, donde `abrirBase` puede estar
     aplicando cambios a una copia vieja antes de abrir el puerto). Sin respuesta → no sana. Si `systemctl is-active` deja de decir
     `active`/`activating` → no sana enseguida.
  3. **Ventana fija `SALUD_VENTANA=70`** contada desde esa primera respuesta: vale solo con **2 respuestas seguidas** 200 con
     `app=oportia` (y `version` igual a la esperada si se pasó) y `systemctl is-active jarvis` = `active`, **recibidas dentro de la
     ventana**. Un 503 que dura hasta el final = **no sana**. La función termina a los 70 s: un 200 posterior nunca se mira.
     Cuenta: la app llama `iniciar()` al abrir el puerto; la primera respuesta se ve como mucho ~8 s después (3 s de pausa + 5 s de
     `-m`); 8 + 70 = 78 s < 90 s. `SALUD_VENTANA` es una constante, no un parámetro; regla de la suite: su valor literal es ≤ 75 y
     ningún script espera salud de otra forma. Si un servidor lento necesitara más, se alarga la puerta EN LA APP en una versión
     futura, nunca esta ventana.
- **`responde [segundos]`** — para un servicio que NO se reinició (`pasar`, `estado`): solo dice si `/api/setup` contesta 200 con
  `app=oportia`. No prueba nada del trabajador y nunca se usa para decidir si una versión o una base quedó sana.
El JSON se lee con `node -e` (la entrada por stdin; nada de `grep` sobre JSON). `PUERTO` = `PORT` de `/opt/jarvis/.env` (solo dígitos;
por defecto 8080). En modo de prueba (y solo en él) `OPORTIA_SALUD_PASO`/`OPORTIA_SALUD_VENTANA` pueden ACORTAR los tiempos.

### 3.8 Un solo nombre del repositorio, y la orden corta `oportia`
`REPO_POR_DEFECTO="junior17281728jr-bot/Jarvis"` y `RAMA_POR_DEFECTO="main"`; se pueden cambiar en `/etc/oportia.conf` (`REPO=…`,
`RAMA=…`; validados con `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` y `^[A-Za-z0-9._/-]+$`). Regla de la suite: el nombre por defecto es el
mismo en todos los archivos (scripts, README, i18n).

`/usr/local/sbin/oportia` = copia de `deploy/oportia-orden.sh` (root, 755; fija: solo la cambian `install.sh`/`pasar`, guardando
`oportia.anterior`). Hace una sola cosa: exige root, comprueba la cadena `/usr/local/lib/oportia` → `actual` → `v-<sha7>` →
`oportia.sh` (todo de root, nada escribible por grupo/otros, `actual` apunta a un hermano `v-…`) y hace
`exec bash /usr/local/lib/oportia/actual/oportia.sh "$@"`. Si la cadena no cumple: se niega y dice la línea de arreglo (§10).
`oportia.sh` reparte: `oportia estado | revisar | pasar | volver | servicio | tailscale | recuperar | probar-copia | actualizar
[--reintentar] | ayuda` → el script de SU MISMA carpeta de root (o el lanzador para `actualizar`). **Nunca se ejecuta como root
nada de `/opt/jarvis`** (allí solo corren, como `jarvis`, los `.mjs`). Sin palabra o con una desconocida: la lista, una línea por
orden. Todas las órdenes que la pantalla o el README muestran existen aquí (regla de la suite: «ningún botón muerto»).

---

## 4 Instalar un servidor nuevo

### 4.1 `deploy/cloud-init.sh` (lo que Junior pega en «User data»)
```
#!/bin/bash
# OPORTIA: instalación automática en un Droplet NUEVO de DigitalOcean (Ubuntu 24.04). Tarda unos 15 minutos.
# Antes de pegarlo: cambia PEGA_AQUI por tu clave de Tailscale (una «Auth key» de UN solo uso).
TS_AUTHKEY="PEGA_AQUI"
REPO="junior17281728jr-bot/Jarvis"
```
Después, sin nada que editar, todo dentro de `principal() { … }; principal "$@" </dev/null`: `set -euo pipefail`; `umask 077`;
`export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a`; registro en `/var/log/oportia-instalar.log` (600).

**Formas de llamarlo** (las tres probadas en raíz falsa):
| Cómo | Qué hace |
|---|---|
| sin argumentos (cloud-init, primer arranque) | instalación completa. **Solo en este caso**: si existe `/var/lib/oportia-actualizador/instalado` → `exit 0` |
| `curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/cloud-init.sh \| sudo bash -s -- <opciones de install.sh>` | pasa las opciones tal cual a `install.sh` (p. ej. `--solo-actualizador`, la línea de arreglo de §10). Con argumentos **nunca** aplica el atajo «instalado» |
| `… \| sudo bash -s -- revisar` · `… \| sudo bash -s -- pasar` | baja el repositorio igual y corre `deploy/oportia-servidor.sh revisar\|pasar` desde la carpeta de root (§7.2) |
Argumentos aceptados: solo `revisar`, `pasar` o palabras que empiecen por `--` (lo demás → se detiene con la lista).

Pasos:
1. **La clave** (solo sin argumentos): a `TS_AUTHKEY` se le quitan espacios, saltos, retornos y comillas rectas o curvas de los
   extremos (el iPhone las cambia). Si quedó `PEGA_AQUI` → sin clave (paso pendiente, normal). Si cumple
   `^tskey-[a-z]+-[A-Za-z0-9-]+$` (escrito así, no dispara la regla de secretos) → `D=$(mktemp -d /root/oportia-clave.XXXXXX)` (700),
   `printf '%s' "$TS_AUTHKEY" > "$D/clave"` (600), `unset TS_AUTHKEY`. **Si se cambió pero no parece una clave** → sin clave, y un
   aviso bien visible en el registro y en el informe final: «⚠ La clave de Tailscale que pegaste no tiene la forma correcta (debe
   empezar con tskey-auth-). El servidor quedó instalado pero SIN Tailscale. Crea otra clave y corre: sudo oportia tailscale».
   Nunca `echo` de la clave ni `set -x`. `trap` de salida (pase lo que pase con la instalación): el archivo se vacía (`: > "$D/clave"`)
   y `$D` se quita con el `borrar_lo_mio` propio (caso 1 de §3.5: es SU `mktemp -d`). La clave nunca queda en disco al terminar.
2. `apt-get -o DPkg::Lock::Timeout=600 update` (3 intentos) y `install -y ca-certificates curl tar` (cloud-init y las actualizaciones
   automáticas pueden tener el candado al arrancar; todas las llamadas a `apt-get` de 1f llevan ese tope de espera).
3. SHA de `main` (6 intentos, 20 s) con la misma llamada que hoy; se valida `^[0-9a-f]{40}$`. Sin SHA no sigue (nada de «refs/heads/main»:
   el instalador y la app deben salir del MISMO cambio).
4. Baja `codeload.github.com/$REPO/tar.gz/$SHA` (6 intentos) a `/root/oportia-instalador-<sha7>/` (`tar --no-same-owner -xzf …
   --strip-components=1`; si la carpeta ya existe con `.completa`, se usa; si existe sin ella, se `apartar`). root, 700.
5. `bash /root/oportia-instalador-<sha7>/deploy/install.sh --sha="$SHA" [--clave-tailscale="$D/clave"] "$@"` (una RUTA, nunca la
   clave), o `deploy/oportia-servidor.sh revisar|pasar`.
Confianza: GitHub por TLS (la misma que ya tiene el actualizador). El arrancador en sí llega de `main` (no puede bajarse «por SHA»
antes de saber el SHA), por eso no trae lógica: todo lo demás sale del SHA que él mismo resuelve.

**La clave de Tailscale en «User data»** queda guardada por DigitalOcean (metadatos y `/var/lib/cloud/`, sin verificar hasta cuándo)
y la puede leer cualquier proceso del servidor. Por eso: (1) los pasos piden una clave **de un solo uso, que venza en 1 día**
(Reusable: no · Ephemeral: no); (2) el informe final y el paso 3 de la guía dicen **«Borra esa clave: Tailscale → Settings → Keys →
Revoke»** (si se usó ya no sirve; si no se usó, sigue viva un día en los metadatos); (3) la unidad nueva le cierra los metadatos al
servicio (`IPAddressDeny`, §4.4).

### 4.2 `install.sh`: reglas
Root; candado `flock -n /run/oportia-instalar.lock`; registro `/var/log/oportia-instalar.log` (600) + pantalla. Opciones:
`--sha=<40 hex>` · `--clave-tailscale=<archivo>` · `--sin-tailscale` · `--sin-cortafuegos` · `--con-cortafuegos` ·
`--solo-actualizador` · `--swap-mb=<n>` (por defecto 1024).
Modo **NUEVA** (no existen `/opt/jarvis/src` ni `/var/lib/jarvis/oportia.db`) o **EXISTENTE** (cualquiera existe). En EXISTENTE solo
AGREGA lo que falta; todo lo que ya está se deja y se dice («ya estaba: no lo toqué»). Cada paso: mirar → hacer → comprobar. Correrlo
otra vez no cambia nada (ensayo: segunda corrida = cero llamadas que cambian y cero archivos nuevos).

**En EXISTENTE, además, nunca:** se enciende ni se configura el cortafuegos (solo se muestra cómo está; únicamente con
`--con-cortafuegos` explícito); se enciende el temporizador nuevo **mientras exista `/etc/cron.d/jarvis-actualizar`** (dice «este
servidor usa el actualizador de antes; para cambiarlo: la orden pasar», §7.2); se hace `tailscale up`, se cambia el nombre ni se toca Funnel.

**Nunca se pisa, cambia de dueño ni borra:** `/var/lib/jarvis` y todo lo de adentro (`oportia.db*`, `oportia-copias/`,
`oportia-llave-secretos*`, `jarvis.db`, `secrets.env`, `update.log`, `version.txt`, `version.bad`…), `/opt/jarvis/.env`,
`/etc/systemd/system/jarvis.service`, `/usr/local/bin/jarvis-actualizar`, `/etc/cron.d/*`, la swap que exista, las reglas de `ufw` que
existan, la configuración de `sshd`, el estado de Tailscale (si ya está unido: ni `up`, ni nombre, ni Funnel).

### 4.3 Pasos (en orden: primero lo que protege y da acceso)
0. **Revisión**: Ubuntu 22.04/24.04 (`/etc/os-release`; otro → se detiene y lo dice), `x86_64`/`aarch64`, PID 1 = systemd, ≥ 2000 MB
   libres en `/`, reloj razonable (año ≥ 2026).
1. **Swap** (512 MB de memoria; va primero para que `apt` y las pruebas no se queden sin memoria): solo si `swapon --show
   --noheadings` está vacío y no existe `/swapfile`: `fallocate -l 1G` (si falla, `dd`), `chmod 600`, `mkswap`, `swapon`, una línea en
   `/etc/fstab` solo si ninguna nombra `/swapfile` (se agrega, nunca se reescribe). No se toca `sysctl`.
2. **Paquetes**: `apt-get update`; `install -y -o Dpkg::Options::=--force-confold ca-certificates curl tar xz-utils util-linux
   coreutils iproute2 unattended-upgrades ufw` (todas con `-o DPkg::Lock::Timeout=600`, 3 intentos).
3. **Node** (`deploy/node.pin`): si `/usr/bin/node` existe y su versión ≥ `engines.node` del `package.json` → se deja. Si existe y es
   más viejo → se detiene y lo explica (no reemplaza un Node que no puso). Si no existe: baja
   `https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-<x64|arm64>.tar.xz` a su carpeta temporal,
   `echo "$SHA  $archivo" | sha256sum -c -` contra el sha256 FIJO del repositorio (si no coincide: se detiene, no abre nada),
   `tar --no-same-owner -xJf` en `/opt/node-v$NODE_VERSION-linux-<arq>/`, `ln -sfn` de `/opt/node22` (solo si no existe o ya es un
   enlace) y `ln -s /opt/node22/bin/node /usr/bin/node`. Comprueba `node --version` y `node -e "require('node:sqlite')"`.
   (No se usa NodeSource ni `curl | bash`. No se comprueba la firma GPG de `SHASUMS256.txt`: el sha256 fijo, revisado en el
   repositorio, da lo mismo sin llavero. Subir Node = cambiar `node.pin` + correr `install.sh` otra vez, a mano.)
4. **Usuario**: si `id jarvis` falla → `useradd --system --home-dir /var/lib/jarvis --no-create-home --shell /usr/sbin/nologin jarvis`.
5. **Carpetas**: `/var/lib/jarvis` (solo si falta: `mkdir` + `chmod 750` + `chown jarvis:jarvis`; si existe, ni `chmod` ni `chown`),
   `/opt/jarvis` (root, 755), `/var/lib/oportia-actualizador` (root, 755; adentro `respaldo/` 700, `propuestos/` 700),
   `/usr/local/lib/oportia` (root, 755).
6. **`/opt/jarvis/.env`** solo si falta (root:jarvis, 640): `PORT=8080` y `HOST=0.0.0.0` (como producción: así también se entra por la
   dirección 100.x; la app solo atiende 127.0.0.1 y Tailscale, y el cortafuegos cierra el resto). Sin `DB_PATH` (por defecto `/var/lib/jarvis`).
   **Servicio**: `poner_si_falta deploy/jarvis.service /etc/systemd/system/jarvis.service`; `systemctl daemon-reload`; `systemctl enable jarvis` (sin arrancar todavía).
7. **Cortafuegos** (**solo en NUEVA**, o con `--con-cortafuegos`; con `--sin-cortafuegos` se salta; en EXISTENTE solo informa): si
   `ufw status` dice `inactive`: `ufw default deny incoming`, `ufw default allow outgoing`, `ufw allow in on tailscale0`,
   `ufw limit 22/tcp` (la Consola de DigitalOcean entra por ahí; «limit» frena a quien prueba contraseñas), `ufw allow 41641/udp`
   (conexión directa de Tailscale), `ufw --force enable`. **No se abren 8080, 80 ni 443**: el enlace público entra por la conexión
   SALIENTE de Tailscale. **Se comprueba a sí mismo**: después de encender, `ufw status` debe mostrar la regla del 22 y la de
   `tailscale0`, y `ss -ltn` debe seguir mostrando algo escuchando en el 22; si cualquiera falla → `ufw --force disable`, el paso
   queda «pendiente» con su motivo y la instalación sigue. Si `ufw` ya estaba activo: no se toca y se muestran las reglas.
   (Esto no prueba que la Consola web de DO siga entrando: eso solo lo prueba el simulacro; la «Recovery Console» no depende de la red.)
8. **Tailscale** (con `--sin-tailscale` se salta): repositorio apt oficial con `signed-by` (llavero y lista solo si faltan; el nombre
   de la versión sale de `VERSION_CODENAME`), `apt-get install -y tailscale`, `systemctl enable --now tailscaled`.
   - Si `tailscale status --json` ya dice `BackendState: Running` → **no se hace `up` ni se toca el enlace** (no es un nodo nuestro recién unido).
   - Si hay archivo de clave: `timeout 120 tailscale up --auth-key="file:<archivo>" --hostname=jarvis` (sin `--ssh`, decisión D3).
     El archivo lo quita siempre `cloud-init.sh` al salir (§4.1). Si `up` falla: sigue, paso pendiente: «No pude entrar a Tailscale
     con esa clave. Crea otra clave y corre: sudo oportia tailscale».
   - Sin clave: paso pendiente → `sudo oportia tailscale` la pide oculta (`read -rs` de `/dev/tty`; antes dice «No se ve mientras
     pegas: pega y pulsa Enter» y después «Recibí N caracteres») o muestra el enlace de entrada.
   - **Enlace https — solo si ESTA corrida unió el nodo** (un nodo recién unido no tiene configuración; no se decide por el texto de
     `tailscale serve status`, que en un nodo vacío dice «No serve config» y no una salida vacía): `timeout 30 tailscale funnel --bg
     8080`; se da por encendido solo si `tailscale funnel status` contiene «Funnel on». Si no: `timeout 30 tailscale serve --bg 8080`
     (https solo para tu red), explica cómo encender el público (consola web de Tailscale: DNS → HTTPS, y Funnel en la política) y
     deja la marca `/var/lib/oportia-actualizador/enlace-pendiente`. **Reintento**: mientras exista esa marca, cada corrida del
     actualizador (§5.3 paso 9) y `sudo oportia tailscale` prueban `funnel --bg 8080` una vez; al lograrlo, la marca pasa a
     `enlace-pendiente.ultima`. El informe final y `oportia estado` dicen «enlace público: encendido / pendiente». Nunca `funnel reset`.
     (La app todavía no está puesta en este paso: el enlace contesta error hasta el paso 10; es lo esperado.)
   - Nombre: lee `Self.DNSName`. Si no empieza por `jarvis.` (quedó `jarvis-1…` porque la máquina vieja sigue en la lista) lo dice:
     «Quita el servidor viejo en Tailscale → Machines y ponle a este el nombre jarvis: así tu enlace de siempre vuelve a servir».
     No falla: el enlace https con el nombre nuevo funciona igual.
9. **Actualizador** (`instalar_actualizador`, la MISMA función que usa `pasar`, §7.2): arma el juego `/usr/local/lib/oportia/v-<sha7>/`
   (§5.1), el enlace `actual`, el lanzador, `/usr/local/sbin/oportia`, las dos unidades (`poner_si_falta`); `/etc/oportia.conf` solo
   si falta; `daemon-reload`. Lo que reemplace de una instalación anterior de 1f queda como `.anterior`.
10. **Primera instalación de la app = una corrida del actualizador**: `oportia-lanzador.sh --sha=$SHA --persona` → baja ese SHA,
    corre TODAS las pruebas como `nobody` (tope 900 s; **si fallan, las repite una vez**), copia el código a `/opt/jarvis`,
    arranca, salud, escribe `version.txt`. Con `--sha` **no se escribe `version.bad` y se ignora el que haya** (§5.3).
    **Si no queda puesta: la instalación NO se detiene** — sigue con 11–13, sale con código ≠ 0 y el informe dice
    «✖ La app no quedó instalada (<motivo>). El servidor está protegido y conectado. Para probar otra vez: sudo oportia actualizar
    --reintentar». Además el temporizador (paso 11) lo intenta solo cada 30 min.
    En EXISTENTE con código ya puesto: este paso se salta.
11. `systemctl enable --now oportia-actualizar.timer` — **solo si no existe `/etc/cron.d/jarvis-actualizar`** (§4.2).
12. **Actualizaciones de seguridad del sistema**: `/etc/apt/apt.conf.d/20auto-upgrades` solo si falta (`Update-Package-Lists "1"`,
    `Unattended-Upgrade "1"`). Sin reinicio automático (decisión D4).
13. **Informe final** en pantalla y en `/var/lib/oportia-actualizador/instalacion.txt` (644, sin secretos): versión, enlace
    `https://<DNSName>`, cada paso «hecho / ya estaba / pendiente: <orden de una línea>», y lo que sigue:
    «Para traer tus datos: sudo oportia recuperar» · «Para empezar de cero: abre el enlace desde un equipo con Tailscale» ·
    «Borra la clave que usaste: Tailscale → Settings → Keys → Revoke».
    Crea `/var/lib/oportia-actualizador/instalado` (fecha y SHA) aunque queden pendientes. Código de salida 0 con pendientes de
    Tailscale/cortafuegos (se dicen); ≠ 0 solo si la app no quedó sana.

### 4.4 Unidades
`jarvis.service`: como hoy + `KillMode=control-group` explícito (comentario: «nunca process: el trabajador es otro proceso del mismo
servicio y debe apagarse con él») + `IPAddressDeny=169.254.169.254` (el servicio, que es lo que mira a internet, no puede leer los
metadatos del Droplet, donde queda el «User data»). Solo llega a un servidor NUEVO o con `oportia servicio`; producción no cambia
sola. Sin verificar en systemd real (si el núcleo no lo soporta, systemd lo ignora con un aviso): punto del simulacro. Sin más
endurecimiento en 1f (cada opción nueva puede romper `nice`/`prlimit`/SQLite; no se pidió).
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
TimeoutStartSec=2700
KillMode=control-group
# oportia-actualizar.timer
[Unit]
Description=OPORTIA: revisar si hay versión nueva cada 30 minutos
[Timer]
OnBootSec=3min
OnCalendar=*:07,37
RandomizedDelaySec=120
AccuracySec=1min
[Install]
WantedBy=timers.target
```
`Nice=5`: las pruebas no le quitan el procesador a las pantallas (las pantallas van en 0; el trabajador en 10). **Sin
`IOSchedulingClass=idle`**: frenar el disco de las pruebas las hace más lentas justo donde una prueba inestable marcaría mala una
versión buena. Una corrida larga (hasta 40 min en el peor caso) se solapa con el siguiente disparo: systemd no arranca otra vez un
`oneshot` que sigue activo, y el lanzador tiene además su candado. Sin `Persistent=`: `OnBootSec` ya cubre el arranque.

---

## 5 El actualizador

### 5.1 Dónde vive y qué archivos son suyos
| Ruta | Qué |
|---|---|
| `/usr/local/lib/oportia/oportia-lanzador.sh` | lanzador fijo (solo lo cambia `install.sh`/`pasar`, guardando `.anterior`) |
| `/usr/local/lib/oportia/v-<sha7>/` (root, 755) | **el juego de una versión**: `oportia-actualizar.sh`, `oportia-comun.sh`, `oportia.sh`, `oportia-servidor.sh`, `oportia-recuperar.sh`, `install.sh`, `node.pin`, `jarvis.service`, las dos unidades, y `.completa` (se escribe al final; un juego sin ella no vale y se `apartar`) |
| `/usr/local/lib/oportia/actual` · `anterior` | enlaces al juego en uso y al de antes (se cambian con `ln -s` a un nombre temporal + `mv -fT`: atómico). Los juegos viejos no se borran (≈100 KB cada uno; `estado` dice cuántos hay) |
| `/usr/local/sbin/oportia` | la orden fija (§3.8) |
| `/var/lib/oportia-actualizador/` (root 755) | `fallos` (contador), `corrida.empezo` / `corrida.termino` (marcas del lanzador), **`ultima-corrida.json`** (el estado, copia de root), `en-curso` (§5.3), `ultima-prueba-fallida.log` (600, ≤ 200 KB), `respaldo/<fecha>/` (700), `propuestos/`, `enlace-pendiente`, `pasos.log` |
| `/tmp/oportia-corrida.XXXXXX/` (root, 711) | la carpeta de UNA corrida: lo bajado (`src/`), y `t/` y `casa/` de `nobody` para las pruebas. Se quita al terminar; si la corrida se cortó, la quita la siguiente |
| `/var/lib/jarvis/update.log` · `version.txt` · `version.bad` | los de hoy, mismo formato, 644 (el servicio los LEE) |
| `/var/lib/jarvis/actualizador.json` | NUEVO, 644, ≤ 1 KB, copia publicada de `ultima-corrida.json` (regla 3.6): `{"contrato":1,"revisado":"<ISO>","resultado":"…","version":"<sha40 instalado>","vista":"<sha40 de main>","actualizador":"<sha7 del juego que corre>","libre_mb":<n>,"ocupa_mb":<n de /var/lib/oportia-actualizador>,"enlace":"encendido|pendiente|no_aplica"}` |
| `/opt/jarvis`, `/opt/jarvis.previa`, `/opt/jarvis.anterior`, `/opt/jarvis.nueva`, `/opt/jarvis.mala` | el código vivo; el que estaba vivo hasta que el nuevo pase la salud; el último SANO de antes; el que se está armando; el que no arrancó. Todo lo que arma el actualizador nuevo trae `.oportia-codigo` |
`resultado`: `al_dia` · `hay_nueva` (solo `--solo-revisar`) · `actualizado` · `no_instalada` · `revertida` · `revertida_sin_arrancar` · `sin_red` · `sin_disco` · `mala_conocida`.

### 5.2 El lanzador (≈70 líneas, sin red, sin lógica de actualizar)
1. **Candados**: `exec 9>/run/oportia-actualizar.lock; flock -n 9` y `exec 8>/run/jarvis-actualizar.lock; flock -n 8` (el del
   actualizador VIEJO: mientras conviven, nunca corren a la vez). Ocupado → con `--persona` (lo pasa `oportia actualizar` e
   `install.sh`) o con una terminal (`[ -t 1 ]`): «Ya hay una actualización corriendo; prueba en unos minutos» y sale 0; bajo
   systemd: sale 0 callado. Quien ya tiene los candados (`pasar`) **no llama al lanzador**: llama al actualizador directo (§7.2).
2. **Corrida anterior sin terminar**: si existe `corrida.empezo` y no hay `corrida.termino` más nueva (la mataron, se colgó, se fue
   la luz) → `fallos+1`.
3. Escribe `corrida.empezo`; corre **`timeout -k 30 2400 bash /usr/local/lib/oportia/actual/oportia-actualizar.sh --corrida "$@"`**
   (2400 s < `TimeoutStartSec=2700`: el lanzador siempre sobrevive al actualizador y puede contar). Escribe `corrida.termino`.
   Cuenta como **fallo**: salida ≠ 0 (el actualizador solo sale ≠ 0 por algo inesperado; sin red, sin disco, pruebas fallidas y
   vuelta atrás son salidas 0), 124/137 (vencido), **o que `ultima-corrida.json` no sea más nuevo que `corrida.empezo`** (salió 0
   sin hacer nada). Sin fallo → `fallos=0`.
4. Si `fallos ≥ 3` y `anterior` apunta a un juego completo distinto de `actual`: intercambia los dos enlaces, `fallos=0`, y agrega a
   `update.log` `<date -Is> aviso: el actualizador nuevo falló 3 veces; volví al actualizador de antes` (1e la ignora; §8.3 la muestra).
5. Sale 0 siempre (un `oneshot` en rojo no ayuda a nadie; lo que pasó está en `update.log` y `actualizador.json`).

### 5.3 Una corrida (`--corrida`), paso a paso
Modos: normal (temporizador) · `--sha=<40 hex>` (instalación o a mano: **no escribe `version.bad` ni obedece el que haya**) ·
`--reintentar` (APARTA `version.bad` → `version.bad.apartada-<fecha>` y sigue) · **`--solo-revisar`** (pasos 1 y 9 nada más: mira qué
hay en `main`, escribe el estado `al_dia`/`hay_nueva`/`sin_red`, **nunca baja, instala ni reinicia**; lo usa `pasar`).

0. **Reparar** lo que una corrida cortada dejó (se tiene el candado, nadie más corre). En este orden:
   - **Marca `en-curso`** (trae el SHA nuevo y el anterior):
     · falta `/opt/jarvis` y existe `/opt/jarvis.previa` → `mv -T` de vuelta, `systemctl restart jarvis`, se quita la marca (la
       versión nueva NO se marca mala: el corte no fue su culpa; se intentará otra vez).
     · existen `/opt/jarvis` y `/opt/jarvis.previa` (el cambio se hizo pero nunca se supo si quedó sana) → **antes de nada**:
       `arrancar_y_salud restart <version>` (reinicia a propósito: sin reinicio la puerta de 90 s ya pasó y un 200 no probaría
       nada). Sana → termina el paso 7 «sana». No sana → paso 7 «no sana». Nunca se toca `/opt/jarvis.anterior` aquí.
     · no existe `.previa` → si `version.txt` = SHA nuevo, solo falta quitar la marca; si no, el cambio nunca empezó: se quita y sigue.
   - Sin marca y falta `/opt/jarvis`: si existe `.previa` → se devuelve; si no y existe `.anterior` → se devuelve. `restart`.
   - `/opt/jarvis.mala` que quedó (corte en medio de una vuelta atrás) → `borrar_lo_mio` (caso 3 de §3.5; sin la marca
     `.oportia-codigo` → `apartar`). Así el próximo `mv -T … /opt/jarvis.mala` nunca choca con una carpeta llena.
   - `/opt/jarvis.nueva` que quedó → `borrar_lo_mio` (mismo caso). `/tmp/oportia-corrida.*` de root con su marca que quedaron →
     `borrar_lo_mio` (caso 2). **Nada más se limpia: ninguna otra cosa de `/tmp`** (tampoco las carpetas que dejó el actualizador viejo, D6).
1. `REPO`/`RAMA` (`/etc/oportia.conf` o los de por defecto). `NUEVA` = `--sha` o el SHA de la rama (`curl -fsS -m 20`, `Accept: application/vnd.github.sha`).
   Sin red o respuesta rara → estado `sin_red`, salida 0. Igual a `version.txt` → `al_dia`. Igual a `version.bad` → `mala_conocida`
   (salvo `--sha` y `--reintentar`).
2. Disco: `df` de `/tmp` y de `/opt` ≥ 700 MB libres; si no → `aviso: no hay disco para probar la versión <sha7>`
   (una vez por SHA), estado `sin_disco`, salida 0, **sin marcarla mala**.
3. `T=$(mktemp -d /tmp/oportia-corrida.XXXXXX)` (root, 711, con su marca `.oportia-corrida`); `trap` de salida → `borrar_lo_mio "$T"`.
   **Va en `/tmp` a propósito**: la suite de hoy solo pasa si su `TMPDIR` está debajo de `/tmp` (§1.1); `mktemp -d` la crea de forma
   segura aunque `/tmp` sea de todos. (En Ubuntu 22.04/24.04 `/tmp` está en el disco, no en memoria: el paso 2 mira también su espacio.) Baja el tarball (`-m 180`, ≤ 50 MB con
   `--max-filesize`), `tar --no-same-owner --no-same-permissions -xzf … -C "$T/src" --strip-components=1`. Exige `src/server.js`,
   `public/`, `deploy/oportia-actualizar.sh`, `package.json`, `test/`.
4. **Pruebas primero, y NO como root**: `"$T/src"`, `"$T/t"` y `"$T/casa"` pasan a `nobody:nogroup` (`chown -R`; `$T` es 711: se puede cruzar, no listar). Se corre
   `cd "$T/src" && setpriv --reuid=nobody --regid=nogroup --clear-groups env -i PATH="$DIR_NODE:/usr/local/bin:/usr/bin:/bin" HOME="$T/casa" TMPDIR="$T/t" timeout 900 node --no-warnings --test test/*.test.js > "$T/prueba.log" 2>&1`
   (`nobody` y no `jarvis`: `jarvis` puede leer los datos de verdad; `nobody` no puede leer `/var/lib/jarvis` ni escribir en ningún
   sitio del servidor. `DIR_NODE` = carpeta del `node` del `ExecStart` de la unidad instalada; si no se puede leer, la de
   `command -v node`.) Antes: la versión de ese Node ≥ `engines.node` del `package.json` nuevo (si no, cuenta como prueba fallida).
   **`TMPDIR` dentro de `$T`: los ~300 MB que dejan las pruebas se van con `$T`.**
   **Si fallan (no si vencen los 900 s) se repiten UNA vez** con `$T/t` nueva; solo si fallan las dos: cola de `prueba.log` (de las
   dos) a `ultima-prueba-fallida.log`, línea `<date -Is> versión <sha7>: alguna prueba falló, NO se instaló`, `version.bad` (**no con
   `--sha`**), estado `no_instalada`, salida 0. Peor caso de tiempo: 900 + 900 + bajar + salud < 2400 s.
   Si falta `setpriv` (no debería: util-linux): `aviso:` y estado `no_instalada` sin `version.bad` — nunca se corre la suite como root.
5. **Armar al lado y cambiar de nombre** (nunca se copia sobre el código vivo; **nunca se toca `/opt/jarvis.anterior` antes de la salud**):
   `cp -a /opt/jarvis /opt/jarvis.nueva` (trae `.env` y lo que haya); dentro de la nueva, reemplaza `src public deploy package.json`
   por los nuevos; la carpeta y esas cuatro quedan `root:root` sin escritura para grupo/otros (el `.env` conserva su dueño);
   `touch .oportia-codigo .completa`. Escribe la marca `en-curso` (SHA nuevo, SHA anterior). Luego
   `mv -T /opt/jarvis /opt/jarvis.previa && mv -T /opt/jarvis.nueva /opt/jarvis`. (Primera instalación: no hay previa; se arma desde vacío.)
6. `arrancar_y_salud restart <version del package.json nuevo>` (§3.7).
7. **Sana** → `version.txt` = SHA (regla 3.6), línea `<date -Is> actualizado a <sha7>`, estado `actualizado`; **ahora sí rota**:
   `/opt/jarvis.anterior` → `borrar_lo_mio` (o `apartar` si no trae `.oportia-codigo`: la del actualizador viejo, una sola vez),
   `mv -T /opt/jarvis.previa /opt/jarvis.anterior`; se quita `en-curso`; y **paso 8**.
   **No sana** → `mv -T /opt/jarvis /opt/jarvis.mala && mv -T /opt/jarvis.previa /opt/jarvis` (primera instalación sin previa: solo
   lo primero, y `systemctl stop jarvis`), `version.bad` (no con `--sha`), línea `<date -Is> versión <sha7> no arrancó: volví a la
   anterior`, se quita `en-curso`, `/opt/jarvis.mala` → `borrar_lo_mio`; `arrancar_y_salud restart -` de la anterior: bien →
   `revertida`; mal → `revertida_sin_arrancar` + `aviso: la versión anterior tampoco arrancó`. **`/opt/jarvis.anterior` (el último
   código sano de antes) sigue intacto** para arreglarlo a mano.
   Solo el CÓDIGO vuelve atrás, nunca los datos (1f no trae migración; en una versión futura con migración vale lo de siempre: la
   copia `oportia-antes-m…` queda hecha por `abrirBase`).
8. **Actualizarse a sí mismo** (solo tras una actualización sana y si el juego de `deploy/` nuevo difiere del de `actual`):
   arma `/usr/local/lib/oportia/v-<sha7>/` (si ya existe completo e igual, lo usa; si existe incompleto, `apartar`) → root, sin
   escritura para otros → `bash -n` de CADA `.sh` → el actualizador debe traer `CONTRATO=1` (el número que este lanzador entiende) →
   `bash v-<sha7>/oportia-actualizar.sh --autoprueba` (corre desde su carpeta de root; solo mira: órdenes que necesita, `setpriv`,
   carpetas, que puede leer la unidad y el `.env`; no cambia nada; ≤ 10 s) → `.completa` → `anterior` pasa a apuntar al juego de
   hoy y `actual` al nuevo (dos `mv -fT` de enlaces). Cualquier fallo: se queda el de antes y agrega `aviso: el actualizador de la
   versión <sha7> no pasó su revisión; sigo con el de antes`. El que está corriendo no se toca (ya está leído entero).
   **No** se actualizan solos: el lanzador, `/usr/local/sbin/oportia`, las unidades de systemd ni `jarvis.service` (eso es
   `install.sh` / `oportia servicio`, a mano, con copia).
9. Si existe `enlace-pendiente`: un intento de `tailscale funnel --bg 8080` (§4.3 paso 8). Escribe `ultima-corrida.json` (siempre,
   también en `al_dia`) y lo publica como `/var/lib/jarvis/actualizador.json` (si ese destino no es un archivo normal: `aviso:` y sigue). Sale 0.

Órdenes para una persona: `sudo oportia actualizar` (corre ahora y va diciendo en español lo que hace) · `--reintentar` · `sudo oportia estado`.
Una versión con el actualizador roto no llega a instalarse: sus propias pruebas (§9.1) corren antes, con el actualizador nuevo, en raíz falsa.

---

## 6 Recuperar en un servidor nuevo

### 6.1 Lo que hace Junior (lo que dice la pantalla y el README; 7 pasos)
Antes de todo, **hoy** (primer punto de la lista de comprobación, y lo dice la tarjeta): «Pulsa *Copiar el texto de instalación* y
guárdalo en Notas con el nombre “OPORTIA servidor nuevo”. Si un día el servidor no está, esta pantalla tampoco.»
1. **Ten a mano** tu clave de recuperación, tu Telegram y el texto de instalación (está en tus Notas; si no, arriba del todo en la
   página de OPORTIA en GitHub hay un enlace «Texto de instalación»: ábrelo, toca la pantalla → Seleccionar todo → Copiar).
2. **Tailscale** (login.tailscale.com): en *Machines* quita el servidor viejo «jarvis»; en *Settings → Keys → Generate auth key*
   deja todo apagado (Reusable: no, Ephemeral: no), vence en 1 día; cópiala. Empieza con tskey-auth-.
3. **DigitalOcean → Create → Droplets**, en este orden:
   · *Region*: la que ya viene marcada. · *Image*: Ubuntu 24.04 (LTS). · *Size*: Basic → Regular → el más barato (512 MB).
   · *Authentication*: **Password** → usa la contraseña fuerte que te propone el iPhone y guárdala en Contraseñas como «root servidor».
   · *Advanced options* → marca *Add Initialization scripts* → pega el **texto de instalación** y cambia `PEGA_AQUI` por tu clave
     (deja las comillas como están; si el iPhone las cambia, no importa). · *Hostname*: jarvis. · **Create Droplet**.
   Espera 15 minutos. Después, en Tailscale → Settings → Keys, **borra (Revoke) esa clave**.
4. Abre el Droplet → **Console** y pega: `sudo oportia recuperar` — te pide el token de tu bot (@BotFather → /mybots → tu bot →
   API Token) y tu clave (no se ven mientras pegas: pega y pulsa Enter); busca tu última copia, la comprueba y la pone.
5. **Enseguida revoca el token**: @BotFather → `/revoke` → tu bot → token NUEVO.
6. Entra con tu usuario y contraseña de siempre. Pega tus claves de IA y el token NUEVO en Claves; crea en Copias una clave de recuperación nueva.
7. No borres los mensajes del bot: son tus copias.

Si a los 15 minutos `oportia` «no existe»: `sudo tail -n 30 /var/log/oportia-instalar.log` (lo que salga se le manda a Claude).
Los nombres exactos del formulario de DigitalOcean (paso 3) están **sin verificar** (§1.3): se corrigen con lo que se vea en el
simulacro. Mientras no se haga, la tarjeta y el README llevan la línea: «Estos pasos se probaron en simulación, todavía no en un
servidor de verdad. El primer uso real será un ensayo contigo.»

### 6.2 `oportia-recuperar.sh recuperar` (root; baja a `jarvis` para descifrar)
Todo lo que pregunta se lee de `/dev/tty`. Registro en `/var/lib/oportia-actualizador/pasos.log` (sin secretos: la clave y el token solo
los ve `oportia-restaurar.mjs`, por su terminal). Antes de lanzarlo dice: «Lo que pegues ahora NO se verá en la pantalla. Es normal:
pega y pulsa Enter.»
1. **Revisión**: servicio instalado, Node, ≥ 1 GB libre en `/var/lib/jarvis`, y que no haya una actualización corriendo (toma los
   candados y los mantiene hasta el final; no llama al lanzador).
2. **Qué hay hoy**: si existe `/var/lib/jarvis/oportia.db`, `runuser -u jarvis -- node /opt/jarvis/deploy/oportia-base.mjs <archivo>`
   (solo lectura) dice usuarios y proyectos.
   - 0 usuarios (el servidor recién instalado): «Este servidor está vacío. Sigo.»
   - Con datos: «⚠ Este servidor YA tiene datos (3 usuarios, 12 proyectos). Recuperar una copia los APARTA (no los borra) y pone los de
     la copia. Si solo quieres probar que tu copia sirve: sudo oportia probar-copia.» y exige escribir `APARTAR` para seguir.
3. **De dónde**: «1) De tu Telegram (lo normal)  2) De archivos». Para 2: «Desde tu Mac o iPhone: Compartir → Tailscale → jarvis; cuando
   termine, pulsa Enter» → `tailscale file get --conflict=rename <carpeta de root recién creada, 700>` (sin verificar; si falla, dice
   la carpeta donde ponerlos). Los archivos llegan a nombre de root: cada archivo NORMAL (`[ -f ] && [ ! -L ]`) se copia a
   `<carpeta de trabajo>/archivos/` y esa copia pasa a `jarvis` (640); los originales quedan donde llegaron.
4. Carpeta de trabajo NUEVA `/var/lib/jarvis/recuperar-<AAAAMMDD-HHMMSS>/` (jarvis, 750). Corre, unido a la terminal:
   `runuser -u jarvis -- node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --destino=<carpeta>/recuperada.db --trabajo=<carpeta>/partes`
   (o `--archivos=<carpeta>/archivos`). El programa de 1e hace todo lo delicado (código al bot, «¿es tu chat?», segundo código,
   clave oculta, firmas, fechas, «¿es esa?»). Salidas: 0 sigue · 3 «Esa clave no abrió la copia. Probemos otra vez» (hasta 3 veces, carpeta
   nueva cada vez) · 6 «Telegram no contestó: prueba en unos minutos» · 4/7 el texto del programa + «mándale esto a Claude» · 8 «Cancelado: no se cambió nada» · 5 no puede pasar (carpeta nueva).
5. **Poner la base** (`poner`, la parte que 1e dejó para 1f; probada sola en la suite):
   a. `systemctl stop jarvis` y espera a `inactive`.
   b. **¿De quién es la llave que hay?** Si existe algún `oportia-llave-secretos*`:
      `runuser -u jarvis -- node /opt/jarvis/deploy/oportia-base.mjs --llave <recuperada.db>` (solo lectura) dice si la llave del
      servidor abre las claves guardadas EN LA BASE RECUPERADA: `sirve` (misma huella: recuperar en el mismo servidor de donde salió
      la copia) · `sin_claves` (la copia no trae claves guardadas) · `ajena` (es de otra base: la del servidor vacío donde ya se
      pegaron claves, la de un simulacro, la de una recuperación anterior).
   c. **Apartar lo que hay, junto**: carpeta nueva `/var/lib/jarvis/apartado-<AAAAMMDD-HHMMSS>/` (jarvis, 700). Si existe
      `oportia.db`: se mueven allí `oportia.db`, `oportia.db-wal`, `oportia.db-shm` (`mv -nT`, mismo disco, con sus nombres: se
      pueden volver a abrir devolviéndolos). **Si la llave es `ajena`: se mueven a esa MISMA carpeta todos los
      `oportia-llave-secretos*`** (la llave va con la base a la que pertenece; fuera de la carpeta de datos la app no la ve y la
      base recuperada queda en el estado conocido «restaurada → pega otra vez tus claves»). Si es `sirve` o `sin_claves`: la llave
      **no se toca** (las claves guardadas siguen sirviendo; lo dice al final). Nunca se tocan `oportia-copias/` ni nada más.
      Un archivo `LEEME.txt` en la carpeta dice qué es y de cuándo.
   d. `mv -nT <carpeta>/recuperada.db /var/lib/jarvis/oportia.db` (y su `-wal` si quedó); comprueba que el destino es el archivo nuevo
      (mismo tamaño y `sha256sum` tomado antes de mover). Mismo disco → cambio de nombre atómico. Si el destino existiera: se detiene (5).
   e. `arrancar_y_salud start - 300` (§3.7: espera hasta 300 s a que abra el puerto —si la copia es de una versión anterior,
      `abrirBase` hace su copia y aplica los cambios antes— y desde ahí la ventana fija de 70 s).
   f. **No sana** → deshace solo: detiene, `oportia.db` → `oportia.db.recuperada-no-arranco-<fecha>`, devuelve TODO lo de
      `apartado-<fecha>/` a su sitio (base y llave), `arrancar_y_salud start -`; dice qué pasó y dónde quedó cada archivo. Nada se borra.
6. **Final**: «✔ Tus datos volvieron (copia del <fecha>). Abre https://<DNSName> y entra con tu usuario de siempre.» y los 3 pasos que el
   programa de 1e ya imprime (revocar el token, pegar las claves, clave de recuperación nueva); con llave `sirve`: «Tus claves de IA
   siguen guardadas; solo cambia el token». La app también lo dice sola (§8.4).
   Las partes cifradas quedan en la carpeta de trabajo (nada se borra; dice cuánto ocupan y `estado` las suma).

`oportia probar-copia` = lo mismo hasta el paso 4 con `--comprobar` (descifra y revisa todo, no escribe ninguna base, no detiene nada).
Sirve en el servidor de producción como simulacro gratis, y es lo que pide el recordatorio «Comprueba tu clave» cada 90 días.
`oportia recuperar --simulacro` (servidor de ensayo): al final NO dice «revoca el token»; dice «No pegues el token aquí ni hagas /revoke:
este es un ensayo» y deja ese servidor en modo seguro (`oportia-admin.mjs --modo-seguro=si`): sin token pegado no manda nada al chat.

---

## 7 El servidor de producción de hoy

### 7.1 Decisión
**Pasarlo al actualizador nuevo, cuando Junior quiera, con tres órdenes de una línea.** Motivos: (1) el viejo deja ~300 MB de las pruebas
en `/tmp` por cada versión y el disco es de 10 GB y nunca se borra nada; (2) no se puede arreglar a distancia y nada avisa si deja de
correr; (3) corre como root una suite bajada de internet; (4) el servidor que se reconstruya tendrá el nuevo: dos actualizadores
distintos es peor de mantener; (5) el cambio toca solo el programador (cron → temporizador) y archivos de root nuevos: ni datos, ni
red, **ni cortafuegos**, ni Tailscale, ni Node, ni el `.env`, ni el servicio. **Dejarlo como está sigue valiendo**: la 0.6.0 se
instala y funciona con el actualizador y la unidad viejos.
Orden recomendado: publicar 0.6.0 → comprobar que producción la instaló (versión abajo en la pantalla) → simulacro (§9.4) → `revisar` → `pasar`.
**Nunca se corre `install.sh` completo en producción** (y si alguien lo hace, el modo EXISTENTE no toca cortafuegos ni temporizador, §4.2).

### 7.2 Las órdenes (Consola de DigitalOcean)
En producción todavía no existe `oportia`, y no se sabe de quién es `/opt/jarvis` (§1.3): por eso las dos primeras **no ejecutan nada
de `/opt/jarvis`**; bajan los scripts de GitHub a una carpeta de root (`/root/oportia-instalador-<sha7>/`, §4.1).

**① Mirar (no cambia nada):**
`curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/cloud-init.sh | sudo bash -s -- revisar`
Muestra, en una pantalla: versión instalada y la de `version.txt`; qué actualizador hay (cron viejo / temporizador nuevo) y su última
línea; la unidad `jarvis.service` frente a la del repositorio (`KillMode`, `User`, `ReadWritePaths`, `LimitCORE`, `ExecStart`); **dueño y
permisos de `/opt`, `/opt/jarvis` y `/opt/jarvis/deploy`**; Node; `setpriv`; swap; disco libre; cuánto ocupan en `/tmp` las carpetas
de pruebas viejas; `ufw` (solo informa); Tailscale y Funnel; el `.env` (solo los NOMBRES de las variables). Termina con UNA línea:
«✔ Listo para pasar al actualizador nuevo» o «✖ No lo pases todavía: <motivo>» (`KillMode=process`, el servicio corre como root,
menos de 1 GB libre, Node viejo, falta `setpriv`, no es la 0.6.0, la base no es de la 6).
`/opt/jarvis` a nombre de `jarvis` se muestra como «⚠ lo arregla sola la primera actualización del actualizador nuevo» (el paso 5 de
§5.3 deja el código de root): no bloquea, porque nada de 1f ejecuta como root archivos de esa carpeta.

**② Pasar:** la misma línea terminada en `pasar`.
1. Las mismas revisiones (si alguna dice ✖, no hace nada). Toma los dos candados (si el viejo está corriendo: «prueba en 5 minutos»)
   y **los mantiene hasta el final**.
2. **Copia primero** en `/var/lib/oportia-actualizador/respaldo/<fecha>/` (700): `tar` de `/opt/jarvis` (código y `.env`), la unidad
   instalada, `/etc/cron.d/jarvis-*`, `/usr/local/bin/jarvis-actualizar`, `systemctl cat jarvis`. Y de los DATOS (aunque no se tocan):
   `runuser -u jarvis -- node /opt/jarvis/deploy/oportia-admin.mjs --copias=antes-de-cambio` → `VACUUM INTO` a
   `/var/lib/jarvis/oportia-copias/oportia-antes-de-1f-<fecha>.db` (archivo nuevo; exige libre ≥ 2 × la base + 300 MB; se ve en
   Servidor → «Copias antes de cambios de la base»). Si Telegram ya está unido, además pide `--copias=ahora` (sin esperar).
   Si la copia falla → se detiene sin cambiar nada.
3. `instalar_actualizador` (§4.3 paso 9). `/usr/local/bin/jarvis-actualizar` **se queda donde está, intacto**.
4. **Prueba del actualizador nuevo sin instalar nada**: con los candados tomados, corre DIRECTO (no por el lanzador, que no podría
   tomar candados que ya tiene su padre) `bash /usr/local/lib/oportia/actual/oportia-actualizar.sh --corrida --solo-revisar`: debe
   dejar `ultima-corrida.json` y `actualizador.json` con `al_dia` o `hay_nueva`. `sin_red` → «No hay internet ahora; prueba luego» y deshace.
   `--solo-revisar` nunca baja, instala ni reinicia: **`pasar` no reinicia el servicio en ningún caso.**
5. `mv` de `/etc/cron.d/jarvis-actualizar` al respaldo (se mueve, no se borra) → `systemctl enable --now oportia-actualizar.timer`.
   `responde 30` del servicio (que no se reinició). Suelta los candados.
6. «✔ Hecho. Mira en OPORTIA → Administrador → Servidor: debe decir “Actualizador nuevo · revisó hace un momento”. Si hay una versión
   nueva, se instalará sola en la próxima media hora. Para volver atrás: sudo oportia volver».
Cualquier fallo desde el paso 3 → hace `volver` solo y lo dice.

**③ Volver:** `sudo oportia volver` → apaga y deshabilita el temporizador, devuelve el archivo de cron desde el respaldo más nuevo
(idéntico byte por byte), **`apartar` de `/var/lib/jarvis/actualizador.json`** (así la tarjeta vuelve a «actualizador de antes» y el
vigilante no abre un aviso falso de «parado»), y deja los archivos nuevos en su sitio, sin uso. Si se cambió la unidad con ④, la
devuelve con reinicio y salud. (Lo que el actualizador nuevo ya haya instalado mientras estuvo en uso se queda: es una versión
probada y sana; `volver` cambia quién actualiza, no la versión.)

**④ (aparte, opcional) El archivo del servicio:** `sudo oportia servicio` → muestra en palabras qué cambia; guarda la unidad de hoy
en el respaldo; pone la del repositorio (la del juego `actual`); `daemon-reload`; `arrancar_y_salud restart -`; **si no queda sana
devuelve la de antes, reinicia y revisa otra vez**. Unos 10 segundos sin servicio, en el momento que Junior elija. Solo hace falta si
`revisar` marca algo peligroso (`KillMode=process`, corre como root) o para tener `LimitCORE=0` e `IPAddressDeny` también en la unidad.

**No entra en 1f (se dice en `revisar`, no se toca):** limpiar las carpetas viejas de pruebas en `/tmp` (decisión D6), subir el Node de
producción, cortafuegos y `sshd` de producción.

---

## 8 Pantallas, API y textos (paso 2)

### 8.1 Copias → «Si un día pierdes el servidor» (la misma tarjeta, la hoja impresa y el README)
`PASOS_RESTAURAR` pasa a `[1,2,3,4,5,6,7]` con los textos de §6.1 (`copias.restaurar.paso1…7`, es y en; el paso 3 lleva sus
sub-líneas como lista dentro del mismo paso). Se mantiene lo que la prueba exige: `/revoke` antes de «token NUEVO … Claves», «clave de
recuperación nueva». Se quita `copias.restaurar.nota` («llega en la 1f») y entra `copias.restaurar.simulado` (la línea «probado en
simulación» de §6.1; se quitará en la versión que siga al simulacro).
Nuevo en la tarjeta (no en la hoja impresa): arriba, **«Hazlo hoy»** + botón **«Copiar el texto de instalación»** (pide
`/api/servidor/instalacion` y usa `copiarTexto`; mensaje «Copiado. Pégalo ahora en Notas: si pierdes el servidor, esta pantalla no
estará») y una línea «También está siempre en GitHub: <enlace directo al archivo en crudo>»; junto al paso 4, la orden `sudo oportia
recuperar` en letra de máquina con **«Copiar»**. La hoja impresa lleva los 7 pasos, la orden escrita y la dirección del texto en
GitHub. Dirección propia `#copias/recuperar` (abre la tarjeta).
Regla: los botones solo copian texto real; nada queda deshabilitado «para después».

### 8.2 `GET /api/servidor/instalacion` (solo administrador)
Devuelve `text/plain` con `deploy/cloud-init.sh` leído del disco (≤ 16 KB; si falta → 404 `sin_instalador` y el botón muestra el enlace
a GitHub). No trae secretos (el archivo es público). Se lee con `readFileSync(new URL('../../deploy/cloud-init.sh', import.meta.url))`
(no es un `import`; la regla de «solo `src/`» es de los `import`).

### 8.3 Administrador → Servidor: tarjeta «Actualizaciones»
`actualizaciones.estado` = `leerEstadoDelActualizador(config)`: abre `<datos>/actualizador.json` solo lectura (≤ 4 KB, por `rutaSegura`;
si no es un archivo normal → `null`), `JSON.parse`, acepta solo los campos conocidos con su forma (`contrato` 1, fechas ISO, sha 40
hex, `resultado` de la lista, números ≥ 0, `enlace` de la lista); cualquier otra cosa → `null`. Nunca escribe.
- Con archivo: «Actualizador nuevo · revisó {hace} · versión instalada {sha7}» + la frase del `resultado`
  (`servidor.actualizador.resultado.<clave>`) + (como hoy) «Última versión que no se instaló: {sha}» + «Disco: {libre} libres · lo
  guardado por el actualizador ocupa {ocupa}» + «Enlace público: pendiente» si aplica.
- Sin archivo (servidor con el actualizador de antes): «Este servidor usa el actualizador de antes (funciona).» y un desplegable
  «Pasar al actualizador nuevo» con las tres órdenes de §7.2 y **«Copiar»** en cada una. Desaparece solo al pasar (y vuelve con `volver`).
- Enlace «Si pierdo el servidor → ver los pasos» (`#copias/recuperar`).
Vigilancia (trabajador, cada hora, junto a `leerActualizaciones`): `abrirAviso('actualizador_parado', 'atencion')` solo si hay archivo,
`revisado` es de hace más de 3 h (y no del futuro por más de 5 min) **y el servicio lleva más de 45 min encendido** (tras un apagón
largo o un salto de reloj el temporizador corre a los 3 min y refresca el archivo antes de que se mire); fresco → se resuelve; sin
archivo → se resuelve.
Disco: si la app ya tiene un aviso de poco disco (`src/tareas/ejecutor.js` mide `discoMinimoMb`), el constructor confirma su umbral
y lo deja en ≥ 1500 MB para avisar; si solo frena tareas y no avisa, se agrega `poco_disco` como aviso `atencion` con ese umbral.
Las líneas `… aviso: …` de `update.log` (`^(\S+) aviso: (.+)$`) NO abren avisos en 1f: se muestran las 3 últimas en la tarjeta, como
texto (≤ 200 caracteres cada una).
Textos nuevos en es/en: `aviso.actualizador_parado.*`, `telegram.aviso.actualizador_parado.*`, `servidor.actualizador.*`.

### 8.4 Después de recuperar, la app dice lo que falta
Con la marca `claves.restaurada` (ya existe) y mientras falte algo, «Primeros pasos» (`public/guia.js`, que ya sale de datos de
verdad) muestra primero el grupo **«Esta base se recuperó de una copia»**: ① revocar el token en @BotFather (`/revoke`) — sin estado,
solo texto; ② pegar el token NUEVO y las claves de IA en Claves (hecho cuando no queda ninguna clave «pégala otra vez»); ③ crear una
clave de recuperación nueva en Copias (hecho cuando Copias ya no dice «Tu clave ya no sirve en este servidor»). Usa los campos que las
rutas de Claves y Copias ya devuelven (el constructor los confirma leyendo `src/api/claves.js` y `src/api/copias.js`; si falta uno, se
agrega de solo lectura). Sin botones nuevos: cada paso es un enlace a su pantalla.
Los dos estados posibles tras `poner` están definidos y probados (§9.1 instalar 1): **sin archivo de llave** (servidor nuevo, o llave
`ajena` apartada) → Claves dice «recuperada: pega otra vez»; **con la llave que sirve** → las claves se leen, el paso ② queda hecho
solo salvo el token. No existe el tercer estado «llave ajena presente»: `poner` lo evita.

### 8.5 README
Arriba del todo: enlace directo **«Texto de instalación»** al archivo en crudo. Reescribir «Cómo se actualiza el servidor» (lanzador,
temporizador, juegos por versión, las 3 líneas, `actualizador.json`, auto-actualización, pruebas como `nobody`); «Si un día pierdes
el servidor» con los 7 pasos (misma cuenta que la pantalla) + lista de comprobación del simulacro + «si algo no sale»; sección
«Instalar un servidor nuevo» (qué hace cada paso, qué nunca pisa, opciones) **encabezada por «Probado solo en simulación; el primer
uso real será el simulacro»**; «Pasar el servidor de hoy» (§7); tabla de `sudo oportia …`; la línea de arreglo de §10; nota «El
`cloud-init.sh` de Oracle (JARVIS) quedó en la historia: `git show 54b9bb9:deploy/cloud-init.sh`»; quitar «La pantalla para recuperar
llega en la 1f»; «Datos en el servidor» + `actualizador.json` (solo se LEE), `apartado-<fecha>/`, `recuperar-<fecha>/` y `/var/lib/oportia-actualizador/`.
En ningún texto (README, pantalla, commit) se escribe «probado» para el instalador, el cortafuegos, Tailscale o systemd sin «en simulación».

---

## 9 Pruebas

### 9.1 En la suite
Dónde corren: aquí (uid 0), en el servidor con el actualizador VIEJO (como root, la primera vez que llegue la 0.6.0) y con el nuevo
(como `nobody`). Regla de oro: **todo en raíz falsa dentro de la carpeta temporal, comandos del sistema solo falsos, sin red, y nunca
como root** (§3.3: `setpriv` a `nobody` si quien corre es root; `env -i` sin `HOME`; se saltan con motivo si no se puede). Además los
scripts, corridos desde la carpeta de la prueba, **se niegan al modo real** (§3.3): perder una variable = «no hice nada», no un cambio.
`test/raiz-falsa.js` escribe los falsos (`systemctl`, `curl`, `runuser`, `setpriv`, `tailscale`, `ufw`, `ss`, `chown`…) como scripts
que anotan `orden argumentos` en `llamadas.log` y responden según archivos de guion (p. ej. `curl` copia de una carpeta «github»
local; la salud devuelve lo que diga el guion, respuesta por respuesta). **Los falsos devuelven las cadenas REALES conocidas**
(`tailscale serve status` → «No serve config»; `funnel status` con y sin «Funnel on»; `ufw status` → `Status: inactive`).
Si faltan `bash`, `flock` o `tar` → la prueba se **salta** con su motivo (nunca falla por el entorno). Cada prueba < 10 s (los
tiempos de salud se acortan con las variables de prueba de §3.7); el «proyecto» que el actualizador baja en las pruebas es uno
diminuto (un `test/x.test.js` que pasa o falla a pedido), nunca la suite real.

`test/actualizador.test.js`
1. Camino feliz: instala, `version.txt`, la línea `actualizado a <sha7>`, `actualizador.json`; el código vivo nunca estuvo a medias
   (el falso de `systemctl restart` comprueba que `/opt/jarvis/src/server.js` existe); la suite se llamó por `setpriv … nobody`.
2. Pruebas que fallan dos veces → nada cambia en `/opt/jarvis` (huellas), línea exacta, `version.bad`, `ultima-prueba-fallida.log`;
   **falla una vez y pasa la segunda → se instala y no hay `version.bad`**; la corrida siguiente no baja nada (`mala_conocida`);
   `--reintentar` aparta `version.bad` y prueba otra vez; **con `--sha`: no escribe `version.bad` y no obedece uno que ya exista**.
3. No arranca → vuelve el código anterior (huellas iguales a antes), línea exacta, `version.bad`, `revertida`; si la anterior tampoco:
   `revertida_sin_arrancar` y **`/opt/jarvis.anterior` sigue intacta**.
4. **Salud y la puerta de 90 s**: `curl` falso que da 503 durante toda la ventana y 200 después → `revertida` (nunca `actualizado`);
   503 y luego dos 200 dentro de la ventana → `actualizado`; un solo 200 y otra vez 503 → no sana; versión distinta → no sana;
   puerto que nunca abre → no sana. Regla estática: `SALUD_VENTANA` literal ≤ 75.
5. **Las líneas reales pasan por `lineasDeActualizacion`** (import de `src/copias/vigilar.js`): 3 tipos reconocidos, fecha válida; las
   líneas `aviso:` se ignoran; `leerEstadoDelActualizador` entiende el `actualizador.json` real.
6. Auto-actualización: un juego nuevo bueno queda en `actual` y el de antes en `anterior`; uno con error de sintaxis en cualquier
   `.sh`, sin `CONTRATO=1` o que falla su `--autoprueba` NO se instala y queda la línea `aviso:`; un juego a medias (sin `.completa`) se aparta.
7. Lanzador: 3 fallos internos seguidos → vuelve a `anterior` y lo anota; **un actualizador que se cuelga (tope acortado en prueba)
   cuenta como fallo; uno que sale 0 sin refrescar `ultima-corrida.json` cuenta como fallo; `corrida.empezo` sin `corrida.termino`
   cuenta como fallo**; candado ocupado (el nuevo o el VIEJO) → sale 0 sin hacer nada, y con `--persona` dice la frase.
8. Corrida cortada: sin `/opt/jarvis` y con `.previa` → la devuelve; **marca `en-curso` con `/opt/jarvis` y `.previa`: reinicia y mira
   la salud; mala → vuelve a `.previa`, y `.anterior` no se toca**; **`/opt/jarvis.mala` que quedó no rompe la vuelta atrás siguiente**;
   `corrida.*` viejas se quitan y **un archivo testigo fuera de su carpeta (y otro en `$TMPDIR`) sigue ahí**.
9. **`borrar_lo_mio`** rechaza `/`, vacío, `/opt/jarvis`, `/var/lib/jarvis`, un enlace, y una `.anterior` sin `.oportia-codigo` (esa
   se aparta, con su `.env` dentro intacto).
10. `TMPDIR` de las pruebas queda dentro de la corrida y desaparece con ella; sin red → `sin_red` y nada más; poco disco → `sin_disco`
    sin `version.bad`; `--solo-revisar` no llama a `systemctl` ni baja el tarball.
11. Un enlace simbólico plantado en `update.log`, `version.txt`, `version.bad` y `actualizador.json` hacia un archivo testigo: el
    testigo no cambia. **Una CARPETA plantada en `actualizador.json`: aviso, la corrida termina bien y el lanzador no cuenta fallo.**
12. Primera instalación (sin `/opt/jarvis/src`) con `--sha`; y la misma con pruebas que fallan: nada instalado, sin `version.bad`,
    una corrida posterior del temporizador lo vuelve a intentar.
13. **Modo real negado**: cada `deploy/*.sh` corrido desde la carpeta de la prueba SIN `OPORTIA_PRUEBA` sale con 1, no llama a ningún
    comando (el `PATH` de la prueba solo tiene falsos que anotan) y no crea nada.

`test/instalar.test.js`
1. **La base recuperada arranca**, en los dos estados: (a) carpeta NUEVA sin archivo de llave; (b) **carpeta con una llave AJENA**
   pasada por `poner` (queda en `apartado-…/`) y (c) **con la llave que sirve** (queda en su sitio). Base con usuario, proyecto y una
   clave guardada (ayudas de `test/copias-base.js`) → `restaurarCopia` desde archivos → se enciende `src/server.js` de verdad (por el
   programa de `test/` que carga `./ayuda.js`, como exige la regla) → `/api/setup` 200, la misma contraseña entra; en (a) y (b)
   Claves dice «recuperada», deja guardar una clave nueva y Copias dice qué volver a crear; en (c) la clave guardada se lee. Nada se
   borra; no queda ningún trabajador (`matarSiVive` en `finally`). `oportia-base.mjs --llave` da `ajena`/`sirve`/`sin_claves` bien.
2. `oportia-recuperar.sh poner` en raíz falsa: sin base → la pone; con base (+`-wal`, `-shm`) → los tres en `apartado-…/` idénticos
   (sha256), la nueva en su sitio; salud mala → todo vuelve EXACTAMENTE (huellas, llave incluida) y la recuperada queda con su nombre
   de «no arrancó»; `oportia-copias/` no cambia nunca; con llave `sirve` el archivo de llave no se mueve.
3. `oportia-servidor.sh pasar` y `volver` en raíz falsa: el cron vuelve byte por byte; `/usr/local/bin/jarvis-actualizar` intacto; con
   una revisión ✖ no cambia nada; fallo a mitad → vuelve solo; **`pasar` termina bien con los candados tomados (no se deshace solo)
   y nunca llama a `systemctl restart|stop|start jarvis`**; **tras `volver`, `actualizador.json` quedó apartado y
   `leerEstadoDelActualizador` da `null`**; `ufw` nunca se llama con algo que cambie.
4. **`cloud-init.sh`** en raíz falsa: sin argumentos y con la marca `instalado` → no hace nada; **con la marca y
   `--solo-actualizador` → reinstala lanzador y juego, y lo reemplazado queda como `.anterior`**; `revisar` no cambia nada; clave con
   comillas curvas y espacios → se limpia; clave cambiada pero mal formada → aviso y sin Tailscale; la carpeta de la clave no existe
   al terminar, **también cuando `install.sh` falla**; el script entero pasa por la ENTRADA (`bash -s < cloud-init.sh`) con un
   falso de `apt-get` que lee su entrada: el script termina completo.
5. Reglas de los scripts (pueden vivir en `test/reglas.test.js`): cada `deploy/*.sh` pasa `bash -n`, empieza con `set -euo pipefail`,
   termina en `principal "$@" </dev/null`, no trae `set -x` ni `$HOME`, `rm` solo dentro de `borrar_lo_mio`, **la regla de rutas con
   `$RAIZ` de §3.2**, **`sistema` solo con órdenes de la lista de §3.3**, ningún `curl … | bash` salvo las líneas documentadas de
   `cloud-init.sh`, el bloque `salud` idéntico en los dos sitios, el mismo REPO en todos lados, `node.pin` con versión `22.x.y` y dos
   sha256 de 64 hex, `jarvis.service` con `KillMode=control-group` y sin `KillMode=process`, la unidad del actualizador sin
   `IOSchedulingClass`, cada `sudo oportia <palabra>` de `es.json`/`en.json`/README existe en `deploy/oportia.sh`, `cloud-init.sh`
   ≤ 8 KB y con `TS_AUTHKEY="PEGA_AQUI"`, y ningún texto de `es.json`/`en.json`/README dice que el instalador está «probado» sin «simulación».
6. `oportia-admin.mjs --copias=antes-de-cambio`: crea el archivo nuevo, se abre como base de OPORTIA, y si el nombre existe no lo pisa.
7. Vigilante: `actualizador_parado` no se abre con el archivo viejo si el servicio lleva < 45 min; sí después; se resuelve sin archivo.
+ `test/pantallas.test.js`: los 7 pasos (pantalla = hoja = README), los textos nuevos en los dos idiomas, los botones «Copiar» solo
donde hay texto que copiar, la tarjeta «Actualizaciones» en sus dos estados, la línea «probado en simulación».

### 9.2 Fuera de la suite: `test/ensayo-instalar.mjs` (lo corre el constructor antes de cada commit, y GitHub)
`install.sh` completo en raíz falsa (mismas reglas: `nobody`, `env -i`): NUEVA (orden y argumentos de cada llamada — **cortafuegos y
Tailscale ANTES del actualizador y de la app**; la clave de Tailscale nunca aparece en `llamadas.log`, en el registro ni en la
pantalla, solo `file:<ruta>`; modos y dueños pedidos; el sha256 de Node malo → se detiene antes de `tar`); **segunda corrida = cero
llamadas que cambian y cero archivos nuevos**; **NUEVA con la app que no pasa las pruebas → cortafuegos, Tailscale, temporizador e
informe hechos, salida ≠ 0, sin `version.bad`; una corrida más con las pruebas ya buenas la instala**; **`ufw` que tras encender no
muestra la regla del 22 → `ufw --force disable` y paso pendiente**; **`funnel status` sin «Funnel on» → `serve`, marca
`enlace-pendiente`, y la corrida siguiente del actualizador lo reintenta**; EXISTENTE con una carpeta llena (`oportia.db`, llave,
copias, `.env`, unidad vieja, cron, `ufw` INACTIVO, Tailscale ya unido) → huellas idénticas de TODO lo que había, **ninguna llamada a
`ufw` que cambie, el temporizador NO se enciende, un solo archivo en `propuestos/` aunque se corra tres veces**; `--solo-actualizador`;
sin clave → pasos pendientes y salida 0; arm64. `shellcheck` de todos los `.sh` si se puede conseguir (si no, se dice claro en el
informe del commit).

### 9.3 En Docker / GitHub
Aquí hoy **no se puede** (sin demonio y con el límite de Docker Hub): se deja escrito y corre en GitHub Actions (gratis, repositorio
público), trabajo nuevo `instalador`: `bash -n` + `shellcheck` + el ensayo; y un paso en un contenedor `ubuntu:24.04` con `apt-get` y
`useradd` de verdad, Node bajado y comprobado de verdad, y `systemctl`/`tailscale`/`ufw` falsos. **Nunca ha corrido** (las reglas de
este trabajo prohíben contactar a GitHub): **no se cuenta como prueba del commit**; su primera corrida será después de subir la rama
y hay que mirarla antes de unir a `main`.
Lo que NINGUNA prueba de aquí cubre de verdad: systemd real (temporizador, `oneshot`, `KillMode`, `IPAddressDeny`, `daemon-reload`),
`ufw` real, Tailscale y Funnel reales (y sus textos), cloud-init real y los candados de `apt` del primer arranque, la Consola de
DigitalOcean con el cortafuegos puesto, la memoria y el tiempo de la suite en 512 MB. Eso es el simulacro, y hasta entonces todo
texto dice «probado en simulación».

### 9.4 El simulacro (lista de comprobación; Junior decide cuándo)
**Hoy, sin costo:** ☐ copiar el texto de instalación y guardarlo en Notas ☐ `sudo oportia probar-copia` en producción (cuando exista
`oportia` allí; antes, no hay simulacro gratis que no instale nada).
**Completo, en un Droplet de ensayo** (cuesta centavos: se paga por hora y se destruye al terminar → **pedir permiso**, D7):
☐ crear la clave de Tailscale de un solo uso ☐ crear el Droplet siguiendo el paso 3 al pie de la letra **y anotar cada nombre del
formulario que no coincida** (nombre de máquina de ensayo: el instalador avisará que no se llama `jarvis`; es lo esperado) ☐ a los 15
min abre el enlace https ☐ `sudo oportia estado` todo en verde ☐ **la Consola web sigue entrando con el cortafuegos puesto** ☐
`tail /var/log/oportia-instalar.log`: cuánto tardó la suite y `free -m` (¿alcanzó 1 GB de swap?) ☐ **`sudo systemctl start
oportia-actualizar.service` y `journalctl -u oportia-actualizar -n 30`** (corre bien bajo systemd, sin `HOME`) ☐ **`tailscale serve
status` y `tailscale funnel status`: copiar el texto exacto** ☐ `systemctl show jarvis -p IPAddressDeny` y la app sigue hablando con
la IA ☐ borrar la clave en Tailscale → Keys ☐ `sudo oportia recuperar --simulacro` ☐ entra con su usuario y ve sus proyectos ☐ **no
pega el token ni hace /revoke** ☐ reiniciar el Droplet: vuelve solo, el enlace sigue ☐ `systemd-cgls -u jarvis.service` muestra 2
procesos de node y `systemctl stop jarvis` no deja ninguno ☐ ¿entra la Consola con `PasswordAuthentication no`? (para decidir D5) ☐
destruir el Droplet y quitar la máquina en Tailscale.
Lo que salga distinto de lo «sin verificar» de §1.3 se corrige antes de tocar producción o de reconstruir de verdad.

---

## 10 Riesgos

| Riesgo | Qué se hace |
|---|---|
| Una versión con el trabajador roto pasa por sana | salud dentro de la puerta de 90 s (§3.7), constante ≤ 75 con regla estática, prueba 9.1.4; nunca se alarga la espera del lado del actualizador |
| La 0.6.0 llega a producción por el actualizador VIEJO y sus pruebas nuevas corren allí como root | las pruebas bajan a `nobody` con `setpriv` (o se saltan); raíz falsa de `nobody`; los scripts se niegan al modo real fuera de las carpetas de root conocidas (prueba 9.1.13); regla estática de rutas con `$RAIZ`; falsos obligatorios; 3 corridas con `taskset -c 0` antes de publicar. Con el actualizador nuevo, toda la suite corre como `nobody` |
| Una prueba inestable deja una versión buena en `version.bad` | la suite se repite una vez antes de marcar; sin `IOSchedulingClass=idle`; `oportia actualizar --reintentar`; el registro de la prueba fallida se guarda; en la instalación nunca se marca |
| Primera instalación: la app no queda puesta | cortafuegos y Tailscale van ANTES; la instalación termina igual, dice una línea para reintentar y el temporizador reintenta solo; no hay `version.bad` que lo impida |
| Actualizador nuevo defectuoso, colgado o mudo | sus pruebas corren antes de instalarlo; `--autoprueba`; `anterior` + lanzador con tope de tiempo y marcas (3 fallos → vuelve); `actualizador_parado` avisa. **Línea de arreglo** (documentada y probada en raíz falsa, 9.1 instalar 4), que no depende del lanzador, del actualizador ni de `oportia`: `curl -fsSL https://raw.githubusercontent.com/junior17281728jr-bot/Jarvis/main/deploy/cloud-init.sh \| sudo bash -s -- --solo-actualizador` |
| Corte de luz en medio de un cambio de versión | marca `en-curso` + `.previa`; el paso 0 reinicia y mira la salud antes de nada; `.anterior` (último sano) no se toca hasta que el nuevo pasa la salud; una `.mala` que quedó se limpia antes |
| El servicio comprometido usa a root (enlaces o carpetas plantadas en `/var/lib/jarvis`, o cambios en `/opt/jarvis`) | regla 3.6 + pruebas 9.1.11; el estado del que depende el lanzador vive en la carpeta de root; **root nunca ejecuta nada de `/opt/jarvis`**: corre copias de root en `/usr/local/lib/oportia` con la cadena comprobada (§3.8) |
| Clave de Tailscale legible en los metadatos del Droplet | de un solo uso y 1 día; se revoca a mano (paso 3 de la guía e informe final); el archivo temporal se quita siempre; nunca en registros ni argumentos; `IPAddressDeny` para el servicio |
| El cortafuegos deja a Junior sin Consola | solo en servidor NUEVO; el 22 queda abierto (con límite); se comprueba a sí mismo y se apaga si no ve la regla o el 22 escuchando; `sshd` no se toca; el simulacro lo comprueba antes; la «Recovery Console» de DO no depende de la red. En producción 1f **nunca** enciende `ufw` |
| Funnel no se enciende (política del tailnet, o el texto de estado es otro) | no se decide por texto de `serve status`; cae a `serve`, deja `enlace-pendiente`, reintenta en cada corrida y lo muestra en la tarjeta; punto del simulacro |
| El servidor nuevo queda como `jarvis-1` | paso 2 de la lista (quitar el viejo) + aviso del instalador; el enlace https nuevo funciona; el nombre fijo de `red.js` solo afecta al http directo |
| La clave de máquina de Tailscale vence (≈180 días) y el servidor «desaparece» | en la lista: «Disable key expiry» en esa máquina (sin verificar el plazo); `oportia estado` muestra el vencimiento si `tailscale status --json` lo da |
| Dos servidores con el mismo bot tras un simulacro | `--simulacro` no pide pegar el token y deja modo seguro; 1e ya avisa «Otro servidor manda copias» |
| Recuperar encima de datos buenos por error | aviso con los números, palabra `APARTAR`, base y llave apartadas juntas, nada se borra, deshacer automático si no arranca |
| Una llave de otra base junto a la base recuperada | `poner` decide `sirve`/`ajena` y aparta la ajena con su base; probado en los tres estados |
| Contraseña de root con el 22 abierto a internet | contraseña fuerte del iPhone guardada en Contraseñas (paso 3); `ufw limit`; D5 se decide con el dato del simulacro |
| Node de producción no se actualiza nunca | fuera de 1f; `revisar` lo muestra; anotado para después |
| Disco: `respaldo/`, `apartado-*/`, `recuperar-*/`, juegos viejos y partes bajadas se quedan para siempre | es la regla del dueño; la tarjeta Servidor muestra libre y ocupado, aviso por debajo de 1,5 GB libres; `revisar`/`estado` dicen cuánto ocupa cada cosa; nada se limpia sin su «sí» |
| 512 MB: pruebas + app a la vez en el servidor nuevo | swap de 1 GB (primer paso) + `Nice=5`; medido aquí ~360 MB de pico; **sin medir en 512 MB reales**: el simulacro lo mide y, si no alcanza, el valor por defecto sube a 2 GB (D8) |

---

## 11 Construcción en 2 pasos

**Paso 1 — scripts, actualizador, recuperar, pruebas y raíz falsa** (delicado: datos y servidor → revisión completa)
`deploy/`: todos los archivos de §2 menos `LEEME.md`; `oportia-admin.mjs --copias=antes-de-cambio`; `jarvis.service` (`KillMode`,
`IPAddressDeny`); `src/copias/vigilar.js` `leerEstadoDelActualizador` (sin el aviso ni la pantalla); `test/raiz-falsa.js`,
`test/actualizador.test.js`, `test/instalar.test.js` (1–6), `test/ensayo-instalar.mjs`; `.github/workflows/pruebas.yml`; `package.json` 0.6.0.
Primero de todo: repetir la corrida de la suite completa como `nobody` con `TMPDIR` en `/tmp` (ya pasó en la revisión 2, §1.3); es condición del paso 4 de §5.3.
Hecho cuando: suite completa como el actualizador (como root y como `nobody`, y ×3 con `taskset -c 0`), sin trabajador vivo; ensayo
en raíz falsa bien, segunda corrida sin cambios; `bash -n` (y `shellcheck` si se consigue) limpio; se dice por escrito qué NO se pudo
probar de verdad (§9.3) y el mensaje del commit dice «instalador probado solo en simulación».

**Paso 2 — pantalla, textos, README, lista de comprobación y corrida del simulacro en raíz falsa**
§8 completo (tarjeta de 7 pasos, `#copias/recuperar`, ruta del texto de instalación, tarjeta «Actualizaciones», aviso
`actualizador_parado` con su condición de 45 min, disco, grupo «Esta base se recuperó» en Primeros pasos), `es.json`/`en.json`,
`test/pantallas.test.js`, `test/instalar.test.js` 7, README, `deploy/LEEME.md`, la lista del simulacro; corrida final del ensayo y de
la suite; revisión corta de pantallas (PC y celular).

---

## 12 Decisiones para Junior (todas con una opción segura por defecto; nada se le pregunta para construir)

| # | Pregunta en sencillo | Por defecto (seguro) |
|---|---|---|
| D1 | ¿Paso el servidor de hoy al actualizador nuevo? | **Todavía no.** 1f solo deja las órdenes listas; se hace cuando él lo diga, después del simulacro. Mientras, todo sigue igual. |
| D2 | ¿Cambio también el archivo del servicio en producción? | No, salvo que `revisar` encuentre algo peligroso. |
| D3 | ¿Entrada por «Tailscale SSH» en el servidor nuevo? | No (menos puertas). Se entra por la Consola de DigitalOcean. |
| D4 | ¿Que el servidor se reinicie solo de madrugada cuando una actualización de seguridad lo pida? | No. (Sin reinicio, algunos arreglos del sistema esperan al próximo reinicio a mano.) |
| D5 | ¿Cerrar la entrada por contraseña de `sshd` en el servidor nuevo? | Por ahora no tocar `sshd` (cerrarla sin saber si la Consola de DO la necesita puede dejarlo fuera); contraseña fuerte guardada en Contraseñas. El simulacro prueba si la Consola entra sin contraseña; si entra, se cierra por defecto en la versión siguiente. |
| D6 | ¿Borro las carpetas viejas de las pruebas en `/tmp` de producción (pueden ser varios GB)? | No se borra nada; `revisar` dice cuánto ocupan. Un reinicio del servidor suele vaciar `/tmp` (sin verificar en esa máquina). |
| D7 | ¿Hacemos el simulacro completo en un Droplet de ensayo (centavos, se destruye al terminar)? | No sin su permiso. **Hasta hacerlo, el instalador está probado solo en simulación** y así lo dicen la pantalla y el README. |
| D8 | ¿Memoria de apoyo (swap) del servidor nuevo: 1 GB o 2 GB? | 1 GB (deja más disco para las copias); 2 GB si la medida del simulacro lo pide. |
| D9 | ¿Que Tailscale se actualice solo en el servidor? | No (una versión nueva de Tailscale ya rompió Funnel a otros); se actualiza a mano cuando haga falta. |

---

## 13 Registro de cambios de la revisión 2 (crítica del 10 nov 2026)

Cada punto de la crítica se comprobó contra el código o con un experimento antes de aplicarlo.

| # | Crítica | Comprobación | Resultado |
|---|---|---|---|
| 1 | La salud de 150 s anula la puerta de 90 s (bloqueante) | Cierta: `supervisor.js:39,146`, `cuentas.js:84-89`, `server.js` (`iniciar()` dentro de `listen`) | **Aplicada**, con un ajuste: en vez de «75 s desde el `restart`» son 70 s desde la PRIMERA respuesta HTTP (la puerta se cuenta desde que abre el puerto), más una espera aparte del puerto. Es igual de seguro (78 s < 90 s) y no da falsos «no arrancó» cuando `abrirBase` tarda con una copia vieja. §3.7, §5.3, §6.2, §7.2, prueba 9.1.4 |
| 2 | Las pruebas ejercitan scripts de root como root; el modo real es el de por defecto | Cierta (aquí también uid 0; `setpriv` existe) | **Aplicada entera**: suite como `nobody` en el actualizador nuevo; `setpriv` en `raiz-falsa.js`; regla estática de rutas; señal positiva para el modo real. Se eligió `nobody` y no `jarvis` (puede leer los datos). §3.2, §3.3, §5.3 paso 4, §9.1 |
| 3 | Primera instalación: un fallo deja `version.bad` y un servidor a medias | Cierta por lectura del diseño; medida de la suite aceptada | **Aplicada**: orden nuevo, `--sha` sin `version.bad`, repetir la suite una vez, la instalación no se detiene, tope de espera de `apt` en todas las llamadas. *Rechazado en parte*: «parar/evitar apt-daily» — no se detiene un servicio del sistema; basta el tope de espera de 600 s y 3 intentos. La medida en 512 MB reales queda para el simulacro (no se puede hacer aquí). §4.3, §5.3 |
| 4 | `tailscale serve status` no sale vacío | No verificable aquí (sin `tailscaled`); se trata como cierta | **Aplicada** de forma más simple: no se decide por ese texto; Funnel solo si esta corrida unió el nodo; marca `enlace-pendiente` con reintento; falsos con cadenas reales; punto del simulacro. §4.3 paso 8, §5.3 paso 9 |
| 5 | El «último recurso» no funciona | Cierta | **Aplicada**: `principal … </dev/null`, argumentos, atajo «instalado» solo sin argumentos, línea probada. *Rechazado en parte*: «bajar el arrancador por el mismo SHA» — imposible antes de conocer el SHA; el arrancador no trae lógica y todo lo demás sí va por SHA. §4.1, §10 |
| 6 | `pasar` toma los candados y luego el lanzador no puede | Cierta (experimento de `flock` repetido aquí) | **Aplicada**: `pasar` llama al actualizador directo con `--solo-revisar`; mensaje cuando el candado está ocupado y hay una persona. §5.2, §5.3, §7.2 |
| 7 | Un actualizador colgado nunca se revierte | Cierta | **Aplicada**: `timeout -k 30 2400` < `TimeoutStartSec=2700`, marcas empezó/terminó, y el lanzador exige que el estado (copia de root) se haya refrescado. §4.4, §5.2 |
| 8 | La copia «anterior» se borra antes de saber si la nueva está sana; `.mala` rompe la vuelta atrás; la regla de borrado no cubría `/opt` | Cierta (`mv -T` sobre carpeta llena falla: repetido aquí) | **Aplicada**: `.previa` + marca `en-curso`; `.anterior` solo rota tras la salud; paso 0 limpia `.mala`; lista exacta de tres rutas con marca `.oportia-codigo`; la `.anterior` del actualizador viejo se aparta. §3.5, §5.3 |
| 9 | EXISTENTE enciende `ufw` en producción y deja dos actualizadores | Cierta por lectura | **Aplicada**: cortafuegos solo en NUEVA o `--con-cortafuegos`; temporizador nunca con el cron viejo; un solo archivo propuesto, fuera de `/etc/systemd/system`. §3.5, §4.2, §4.3 |
| 10 | La clave de Tailscale no se podía borrar con la regla y queda en metadatos | Cierta | **Aplicada**: `mktemp -d` propio en `/root`, se quita siempre al salir, limpieza de comillas, aviso fuerte si está mal formada, «Revoke» en guía e informe, `IPAddressDeny=169.254.169.254` (sin verificar en systemd real → simulacro). §4.1, §4.4 |
| 11 | Aviso falso de «parado» tras `volver` | Cierta | **Aplicada**: `volver` aparta `actualizador.json`; el vigilante exige 45 min de servicio encendido. §7.2, §8.3 |
| 12 | `oportia` ejecuta como root scripts de `/opt/jarvis/deploy` | Cierta (dueño de `/opt/jarvis` sin verificar) | **Aplicada con la opción preferida**: root corre solo copias de root (`/usr/local/lib/oportia/v-<sha7>/`), con cadena comprobada; `revisar`/`pasar` en producción llegan por la línea con curl. *Cambio respecto a la crítica*: el dueño de `/opt/jarvis` es ⚠ y no ✖ bloqueante, porque ya nada de root se ejecuta desde allí y el propio actualizador lo corrige. §3.8, §5.1, §7.2 |
| 13 | Recuperar con un archivo de llave ya presente no estaba probado | Cierta (`almacen.js:130-138`) | **Aplicada, decidiendo**: `poner` clasifica la llave (`sirve`/`sin_claves`/`ajena`) y aparta la ajena junto con su base en `apartado-<fecha>/` (fuera de los nombres que la app mira); tres estados probados. §6.2, §8.4, §9.1 |
| 14 | Los 7 pasos omiten decisiones de DigitalOcean | Cierta en lo esencial; los nombres exactos del formulario no se pueden verificar aquí | **Aplicada**: paso 3 campo por campo, «hazlo hoy» guardar el texto, enlace directo en el README, limpieza de comillas, aviso de «no se ve mientras pegas». *Rechazado en parte*: (a) contar los caracteres del token/clave de recuperación — esos los pide `oportia-restaurar.mjs`, cuyo contrato no se cambia; se cuenta solo en `oportia tailscale`; (b) cerrar la contraseña de `sshd` por defecto ya — sin saber si la Consola de DO la necesita podría dejarlo fuera; queda en D5 con comprobación en el simulacro. §6.1, §8.1, §12 |
| 15 | Cosas dadas por hechas que solo están simuladas | Cierta | **Aplicada**: «probado solo en simulación» en README, tarjeta y commit (con regla de la suite); `env -i` sin `HOME`; el cortafuegos se comprueba y se apaga solo; simulacro ampliado; GitHub Actions no cuenta como prueba. §3.1, §4.3, §8, §9 |
| — | (hallazgo propio de la revisión 2) `TMPDIR` de la suite fuera de `/tmp` | Corrida real de la suite como `nobody` con `TMPDIR` en `/var/tmp`: 15 pruebas fallan («Modo de prueba: no se permite escribir…») y la corrida vence a los 900 s; causa en `db.js:29-36` + hijos sin `TMPDIR` | **Corregido el diseño original**, que ponía la corrida en `/var/lib/oportia-actualizador/tmp`: ahora va en `/tmp/oportia-corrida.XXXXXX`, con regla de borrado propia. §1.1, §3.5, §5.1, §5.3 |
| 16 | Detalles menores (8) | Revisados uno a uno | **Aplicados**: (1) fuera `IOSchedulingClass` y repetición de la suite; (2) `Description` y `AccuracySec` en el temporizador (*sin `Persistent=`*: `OnBootSec` ya lo cubre); (3) `oportia` es fija y guarda `.anterior`; (4) disco en la tarjeta y aviso < 1,5 GB; (5) los archivos de Taildrop se copian para `jarvis`; (6) se quita el archivo de `sysctl`; (7) fuera `reboot`, `crontab`, `apt-key` (y `sysctl`, `timedatectl`); (8) destino que no es archivo normal → aviso y sigue. |
