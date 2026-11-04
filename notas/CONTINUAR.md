# Cómo continuar OPORTIA (nota de traspaso, 4 nov 2026)

El crédito se acabó a mitad de la fase 1. Nada se perdió: todo está en estas ramas de GitHub.

## Estado
- **4 nov 2026, 22:40 UTC: parte 1b PUBLICADA.** main = desarrollo = fase-1b = 92c277c (0.2.0), 133/133 pruebas como el actualizador. Siguiente: unir 92c277c a fase-1c y seguir la 1c (pasos 2 y 3, revisión, 0.3.0).
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

## Pedido de Junior al retomar
Al volver, revisar dónde quedamos y seguir solo. Volver a poner las pruebas completas: hasta 3 rondas de ataque al motor (equipo rojo) y 2 revisores por cada problema (se recortaron solo para ahorrar crédito).

## Rol y revisión diaria (pedido de Junior, 4 nov 2026)
Claude es su programador experto y quien mantiene y revisa el software, CON TODO EL PERMISO para revisar, corregir, mejorar y publicar (si pasan pruebas y revisión; pagos y sus cuentas: preguntar siempre).
Quiere un lugar de ERRORES que se revise TODOS LOS DÍAS. Plan:
1. OPORTIA guarda cada error en su base (tabla de avisos/errores de la 1c) y lo muestra en Administrador.
2. Un informe diario de errores solo para el mantenimiento: un enlace solo de admin por el enlace https con una clave larga guardada como secreto del entorno de la nube (nunca en GitHub), sin datos privados de usuarios.
3. Una tarea programada diaria (sesión en la nube) que lee el informe, revisa el código, corrige, prueba y publica, y le manda un resumen corto.
NO activarla todavía: Junior dice que se habla cuando TODO el proyecto esté listo (solo lo dejó anotado para no olvidarlo). Cada día gasta crédito de Claude: decirle antes cuánto.
Idea de Junior para la revisión: apartado «Errores» SOLO para el admin; cada error con qué pasó, cuántas veces, la propuesta de arreglo de Claude y su estado (pendiente / arreglado en versión X / descartado). Los errores se juntan y Claude los revisa TODOS JUNTOS una vez al día (los que lleguen después esperan al día siguiente) para gastar poco crédito. Recomendado: el mismo error repetido cuenta como uno con contador; si no hay errores nuevos la revisión termina enseguida (casi sin gasto); los graves (servidor caído, riesgo de datos) avisan al momento por Telegram; cuando todo esté estable, pasar a una vez por semana.
Más pedidos de Junior: cada revisión diaria le deja un RESUMEN del día en sencillo: por qué pasó cada error, si se corrigió y qué se hizo. Y DETECTAR FALTA DE CRÉDITO: si la clave de IA se queda sin saldo (la API responde que no hay crédito), OPORTIA sigue con su motor propio y le avisa al momento (Administrador + Telegram); si un día no llega la revisión diaria de Claude, también avisa. Avisos al 50/80/100% de cada tope. Recordarle: la API de Claude se paga aparte (console.anthropic.com), no es el mismo crédito de este chat.
Cambios de cuentas pedidos por Junior (para la próxima versión): contraseña mínima de 6 caracteres (no más), bloqueando las obvias (123456, 111111, abcdef, su propio nombre…); usuarios con nombre y apellido: el admin escribe «Juan Pérez» y el sistema propone el usuario «juan.perez» (si ya existe, «juan.perez2»); el nombre visible guarda acentos. El restablecer clave del admin ya existe (clave temporal + cambio obligatorio al entrar): explicárselo en la pantalla. Si la IA se apaga o se queda sin saldo, todo sigue con el motor propio.
Pantallas (pedido de Junior): que se vean simples pero tecnológicas y todo claro; empezar en CLARO (blanco) por defecto y en Configuración un selector de tema Claro / Oscuro / Automático guardado por usuario. Hacer una pasada de diseño (logo, colores, tipografía, iconos) sin perder claridad.

## Pedido de Junior (4 nov 2026, 22:30 UTC): pantallas más visuales
Texto suyo: «Que necesita ser visual, debe verse siempre y sin tener que escribir tanto, y donde escriba se vea más. O sea, no tan básico.»
Plan: una PASADA VISUAL propia (después de la 1c, antes de la 1d; intensidad media, ultracode apagado salvo la revisión final):
- Crear proyectos tocando en vez de escribir: tarjetas/botones para tipo (vender, comprar, empleo…), negocios, lugares (provincias), tamaño, frecuencia; el texto libre queda como opción.
- La caja de texto grande y cómoda (crece con lo escrito, letra más grande).
- Lo importante siempre a la vista (estado del proyecto, qué falta, siguiente paso).
- Diseño menos básico: logo, colores, iconos, tarjetas; claro por defecto + oscuro. Sin perder claridad ni funciones.
