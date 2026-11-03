# NEXUS (en construcción)

JARVIS fue retirado de este servidor el 3 de noviembre de 2026. Su código completo está en la rama `jarvis-archivo`.

## Cómo se actualiza el servidor (léelo antes de cambiar algo)
- Un servidor de DigitalOcean revisa la rama `main` cada 30 minutos (`/usr/local/bin/jarvis-actualizar`, ver `deploy/cloud-init.sh`).
- Descarga `main`, corre `node --test test/*.test.js` (si una prueba falla, NO instala esa versión) y copia `src/`, `public/` y `deploy/` a `/opt/jarvis`.
- Reinicia el servicio `jarvis` (`deploy/jarvis.service`: `node --no-warnings src/server.js`, usuario `jarvis`, solo puede escribir en `/var/lib/jarvis`).
- Después de reiniciar, `http://127.0.0.1:8080/api/setup` debe responder; si no, vuelve sola a la versión anterior.
- Variables en `/opt/jarvis/.env` (PORT=8080, HOST=0.0.0.0, DB_PATH=/var/lib/jarvis/...). Las claves de API están en `/var/lib/jarvis/secrets.env` (no están en GitHub).
- El enlace público es Tailscale Funnel al puerto 8080 (https://jarvis.taila693e9.ts.net).

## Estado actual
`src/server.js` es una página temporal "NEXUS en construcción". Al arrancar borró los datos de JARVIS de `/var/lib/jarvis` (se conservan `version.txt`, `update.log` y `secrets.env`).
