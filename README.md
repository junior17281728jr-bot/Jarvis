# OPORTIA (en construcción)

Plataforma de inteligencia de oportunidades comerciales y laborales. JARVIS fue retirado de este servidor el 3 de noviembre de 2026; su código completo está en la rama `jarvis-archivo`.

## Cómo se actualiza el servidor (léelo antes de cambiar algo)
- Un servidor de DigitalOcean revisa la rama `main` cada 30 minutos (`/usr/local/bin/jarvis-actualizar`, ver `deploy/cloud-init.sh`).
- Descarga `main`, corre `node --test test/*.test.js` (si una prueba falla, NO instala esa versión) y copia solo `src/`, `public/`, `deploy/` y `package.json` a `/opt/jarvis`.
- Reinicia el servicio `jarvis` (`node --no-warnings src/server.js`, usuario `jarvis`, solo puede escribir en `/var/lib/jarvis`).
- Después de reiniciar, `http://127.0.0.1:8080/api/setup` debe responder en el primer minuto; si no, vuelve sola a la versión anterior. Si falla más tarde, no vuelve sola.
- `/api/setup` muestra la versión de `package.json`: así se sabe qué versión quedó instalada.
- Las claves de API están en `/var/lib/jarvis/secrets.env` (nunca en GitHub: este repositorio es público).

## Reglas que no se rompen
- **Nunca revertir `main` a una versión anterior a la 0.0.2.** Las versiones anteriores borraban `/var/lib/jarvis` al arrancar.
- El programa nunca borra archivos de datos, solo usa módulos de Node (no hay `npm install` en el servidor) y no importa nada fuera de `src/`. `test/reglas.test.js` lo comprueba.
- Las pruebas corren en el servidor real, como root y con la app funcionando: no usan internet, no tocan `/var/lib/jarvis`, no usan el puerto 8080 y están todas en `test/` sin subcarpetas.
- Un cambio por cada ventana de 30 minutos.

## Ramas
- `main`: lo que instala el servidor. Solo se actualiza con autorización del dueño.
- `desarrollo`: donde se trabaja y se prueba. GitHub corre las pruebas en cada cambio (Node 22 y 24).
- `respaldo/antes-de-oportia`: copia exacta de `main` antes de empezar OPORTIA. No se borra.
- `jarvis-archivo`: el código viejo de JARVIS. No se usa.

## Datos en el servidor
- OPORTIA usa solo su archivo `/var/lib/jarvis/oportia.db` y su carpeta `/var/lib/jarvis/oportia-copias/`.
- Nunca abre, cambia ni borra `jarvis.db`, `secrets.env`, `version.txt`, `update.log` ni ningún otro archivo.
- Antes de cada cambio de la base se guarda una copia completa en `oportia-copias/`.

## Estado
Fase 0: página temporal "OPORTIA · En construcción" que ya no borra nada, base de datos propia y entrada protegida
(solo por el enlace https de Tailscale o por la red Tailscale). Plan completo: «OPORTIA: arquitectura y plan» y «OPORTIA: evaluación y plan ampliado».
