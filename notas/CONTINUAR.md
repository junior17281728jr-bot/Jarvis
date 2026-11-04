# Cómo continuar OPORTIA (nota de traspaso, 4 nov 2026)

El crédito se acabó a mitad de la fase 1. Nada se perdió: todo está en estas ramas de GitHub.

## Estado
- `main` = 0.1.0 (parte 1a, cuentas). Está instalada en el servidor y funciona. El admin se llama Junior.
- `fase-1b` (d3c0bd2): proyectos + motor rehecho + ronda 1 del equipo rojo + PASO 1 (servidor y decisiones del dueño, 0.2.0) HECHO; verificar que cubre todo el punto 1. **NO publicar todavía.**
  Le falta (ver `notas/revision-1b.txt` y las decisiones en `notas/decisiones-dueno.md`):
  1. Servidor: decisiones del dueño (autonomía 3 niveles, por defecto `aprobar_salidas`; `ia {permitida:false, topeMensualUsd:0}` y `costoEstimadoUsd` por versión;
     plan prueba = 1 proyecto, admin 20, control "Proyectos permitidos"; aviso al usuario cuando el admin le cambia la clave);
     permisos editor/dueño; papelera pausa el proyecto; topes de almacenamiento sin borrar; detalle de versión acotado;
     entradas no texto → 400 (no 500); quitar listas CHECK de la migración 3 y recalcular su huella en test/reglas.test.js; package.json 0.2.0.
  2. Pantallas: lista completa en el paso «resto:pantallas» del script de arreglos (dudas del motor que bloquean aprobar, autonomía,
     línea de IA, «Próximamente (fase 2)» para fuentes y tipo de análisis, honestidad de fases, etc.).
  3. Revisión final independiente, arreglos y 3 corridas de pruebas como el actualizador
     (`git archive` + `env -i PATH=/usr/local/bin:/usr/bin:/bin timeout 900 node --no-warnings --test test/*.test.js` como root).
  4. Publicar: merge a `desarrollo` y luego a `main` (Junior dio permiso permanente para publicar cuando pase pruebas y revisión; avisarle después).
- `fase-1c` (a2fdbf3): parte 1c, paso 1 de 3 hecho (9b5ebc0) + trabajo a medias del paso 2. Diseño aprobado: `notas/diseno-1c.md`. Versión 0.3.0.
  Antes de seguir: unir la 1b final.
- `fase-1c-intento1`: intento viejo, no usar.
- Partes 1d (IA con topes), 1e (copias cifradas fuera del servidor por Telegram + alertas), 1f (install.sh, cloud-init, restauración): sin empezar.

## Reglas que nunca cambian
Las 10 condiciones de Junior; nunca secretos en GitHub (repo público); nunca volver `main` a antes de 0.0.2;
migraciones solo agregan; pedir permiso antes de pagos o de sus cuentas; explicar en español sencillo y corto.
