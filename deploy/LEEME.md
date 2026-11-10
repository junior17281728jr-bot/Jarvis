# deploy/ — los programas del servidor de OPORTIA

Todo lo que hay aquí sirve para **instalar, actualizar y recuperar** el servidor. Nada de esta carpeta borra datos.
El instalador, el cortafuegos, Tailscale y systemd están probados **solo en simulación** (una raíz falsa con comandos
falsos, y un contenedor de Ubuntu desechable con `test/ensayo-contenedor.sh`, donde systemd, el cortafuegos, Tailscale y
GitHub siguen siendo de mentira): el primer uso en un servidor de verdad será un ensayo con Junior.

| Archivo | Para qué |
|---|---|
| `cloud-init.sh` | El **texto de instalación**: se pega en «User data» al crear un Droplet nuevo de DigitalOcean (cambiando `PEGA_AQUI` por una clave de Tailscale de un solo uso). Baja OPORTIA de GitHub por su versión exacta a una carpeta de root y corre `install.sh`. También es la línea con `curl … \| sudo bash -s -- revisar\|pasar\|--solo-actualizador`. |
| `install.sh` | El instalador. Idempotente: correrlo otra vez no cambia nada. Nunca pisa, cambia de dueño ni borra datos o configuración que ya existan. Orden: swap → paquetes → Node (versión y huella fijas de `node.pin`) → usuario `jarvis` → carpetas y servicio → cortafuegos → Tailscale y enlace → actualizador → la app (la instala el mismo actualizador, pruebas primero) → temporizador → actualizaciones de seguridad → informe. |
| `node.pin` | La versión de Node y sus huellas sha256 (x64 y arm64). Solo vale para un servidor nuevo: en uno que ya tiene Node (el del servicio, o el de la ruta de siempre) el instalador no lo toca ni mueve su enlace; subirlo ahí se hace a mano, con Claude. |
| `oportia-actualizar.sh` | El actualizador: baja la versión nueva, corre **todas** sus pruebas como `nobody`, la arma al lado, cambia de nombre, mira la salud dentro de la ventana de arranque y, si no queda sana, vuelve al código anterior. Solo cambia código; nunca datos. Se actualiza a sí mismo después de una actualización sana. |
| `oportia-lanzador.sh` | Fijo y pequeño: candados, tope de tiempo y vigilancia del actualizador (3 fallos seguidos → vuelve al juego de antes). |
| `oportia-actualizar.service` · `.timer` | Lo que corre el lanzador cada 30 minutos. |
| `oportia-orden.sh` | Se instala como `/usr/local/sbin/oportia`: la orden corta. Comprueba la cadena de carpetas de root y reparte. |
| `oportia.sh` | Reparte `sudo oportia estado \| actualizar \| recuperar \| probar-copia \| tailscale \| revisar \| pasar \| volver \| servicio \| ayuda`. |
| `oportia-servidor.sh` | `estado` y `revisar` (solo miran), `pasar` (el servidor de hoy pasa al actualizador nuevo: copia primero, vuelve solo si algo falla), `volver`, `servicio` (cambia el archivo del servicio con copia y vuelta atrás) y `tailscale`. |
| `oportia-recuperar.sh` | `recuperar` (trae la última copia con `oportia-restaurar.mjs`, aparta lo que haya —nunca borra ni pisa—, pone la recuperada, arranca y mira la salud; si no arranca, deshace solo) y `probar-copia` (solo comprueba). |
| `oportia-comun.sh` | Funciones compartidas (rutas por un solo prefijo, modo real y de prueba que fallan cerrado, el único borrado permitido, la salud). |
| `oportia-base.mjs` | Mirada de solo lectura a una base (cuántos usuarios y proyectos; de quién es la llave de las claves). Corre como `jarvis`. |
| `oportia-restaurar.mjs` | El programa de la parte 1e que descifra y comprueba una copia en un archivo nuevo. |
| `oportia-admin.mjs` | La consola de rescate (contraseña temporal, modo seguro, claves, copias…). |
| `jarvis.service` | La unidad del servicio (el nombre «jarvis» se conserva). `KillMode=control-group`: el trabajador se apaga con el servicio. |

Reglas que cumplen todos los `.sh` (las comprueba `test/reglas.test.js`): `set -euo pipefail`; todo dentro de
`principal "$@" </dev/null`; las rutas salen de un solo prefijo (`$RAIZ`, vacío en el servidor); los comandos del sistema
pasan por `sistema` (en las pruebas solo existen los falsos); el único borrado es `borrar_lo_mio` (su carpeta temporal
propia y las carpetas de código que él mismo armó, con su marca); nunca `set -x`; nunca un secreto en un registro.
Root nunca ejecuta nada de `/opt/jarvis`: usa su copia en `/usr/local/lib/oportia/v-<versión>/`.

## El `cloud-init.sh` de antes (Oracle, JARVIS)

Hasta la versión 0.5.1 este archivo era el script de la época de Oracle Cloud y JARVIS. Ya no servía (llamaba a un
`deploy/install.sh` que había dejado de existir) y traía dentro el actualizador viejo (`/usr/local/bin/jarvis-actualizar`).
No se perdió: está en la historia del repositorio.

    git show 54b9bb9:deploy/cloud-init.sh

El servidor de producción sigue usando aquel actualizador hasta que Junior decida pasarlo (`revisar` → `pasar`; se
deshace con `sudo oportia volver`). La versión 0.6.0 funciona igual con el actualizador de antes.
