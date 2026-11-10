# Cómo continuar OPORTIA (nota de traspaso, 4 nov 2026)

El crédito se acabó a mitad de la fase 1. Nada se perdió: todo está en estas ramas de GitHub.

## Estado
- **10 nov 2026: claridad 0.5.1 PUBLICADA** (main = 54b9bb9): «Primeros pasos» (public/guia.js), «¿Qué es esto?» (queEs), pantalla #ayuda con 23 palabras, una línea por pantalla, listas vacías que enseñan. 543/543. Siguiente: 1f (install.sh, cloud-init, restauración) con intensidad alta. Pendiente menor: hueco bajo «Usuarios» en Resumen (PC); el paso «responder preguntas» de la guía no tiene estado propio.
- **10 nov 2026: parte 1e PUBLICADA (0.5.0)** (main = 5ef4c13): copias cifradas a Telegram, clave de recuperación, avisos por Telegram, restaurar (CLI deploy/oportia-restaurar.mjs para la 1f). 539/539 (46 s; 125 s con 1 CPU), ensayo de vuelta atrás a 0.4.1 OK. Falta que Junior cree el bot y su clave de recuperación (pasos en pantalla). En curso: mejora de claridad (rama fase-claro, 0.5.1). Siguiente: 1f (install.sh, cloud-init, restauración). OJO: las pruebas dejan ~300 MB por corrida en la carpeta temporal; en esta sesión usar TMPDIR propio y borrarlo. Pedir a Junior que diga qué versión ve abajo en la pantalla (nunca se confirmó que el servidor instale las versiones nuevas desde la 0.1.0).
- **7 nov 2026: pantallas 0.4.1 PUBLICADAS** (main = c6b0626): PC con menú al costado y columnas; pestañas en Administrador (#admin, #admin/usuarios, #admin/trabajo, #admin/servidor, #ia, #claves) y en cada proyecto (#proyecto/N, /entendi, /versiones, /historial). 378/378. Siguiente: parte 1e (copias cifradas por Telegram + avisos), intensidad alta + ultracode. Pendiente menor: huecos en la rejilla de IA y gastos en PC.
- **5 nov 2026: parte 1d PUBLICADA (0.4.0).** main = c5e4c8f (1d + rapidez 0.3.3), 378/378 pruebas, ensayo de vuelta atrás a 0.3.2 y 0.3.3 OK. IA APAGADA, tope US$0. 5 preguntas para Junior en notas/diseno-1d.md §18 (todas con opción segura por defecto; preguntar solo cuando quiera encender la IA). Siguiente: PASADA DE PANTALLAS (PC ancho + pestañas en celular), luego 1e.
- **5 nov 2026: rapidez 0.3.3 PUBLICADA** (main = 4d84adb): compresión, caché con huella (?v=), pedidos en paralelo; arregla «No se pudo cargar OPORTIA» al abrir en Inicio con proyectos pendientes. La 1d (fase-1d) debe UNIR main 4d84adb antes de publicarse (conflictos probables en public/app.js y src/app.js).
- **5 nov 2026: pasada visual PUBLICADA.** main = 54d5145 (0.3.1), 214/214. Siguiente: diseñar y construir 1d (IA con topes, 0.4.0). Pendiente menor: productos raros escritos a mano (p. ej. «servicios en Santiago») quedan como duda; no pasa nada mal.
- **5 nov 2026: parte 1c PUBLICADA.** main = desarrollo = fase-1c = 8cb58ac (0.3.0), 208/208 pruebas. Siguiente: PASADA VISUAL (ver abajo), luego 1d. Pendiente para fase 2: si alFallar siempre falla al marcar una tarea de proyecto «fallida», la tarea no se recupera (decidir antes de la fase 2); quick_check síncrono en bases muy grandes.
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

## Pedido de Junior (5 nov 2026): fotos de las empresas (fase 2 en adelante)
«Foto de empresas cuando haga investigación.» Cuando OPORTIA investigue empresas, cada ficha debe mostrar la imagen de la empresa: logo o foto de su web pública (og:image / favicon grande), guardada en el servidor con tamaño reducido, citando de dónde salió; si no hay, un icono del sector. Solo fuentes públicas y legales (no copiar fotos de Google Maps u otras con licencia cerrada). Fichas visuales: foto, nombre, sector con icono, ubicación en el mapa, puntuación en grande, poco texto.
Los 2 enfoques siguen en el plan: clientes para vender (fase 2+) y buscar empleo (fase 6). Ambos ya se pueden crear como proyecto.

## Pedido de Junior (5 nov 2026): también para PC, y nada escondido al fondo en el celular
«No solo es para cel, también para PC; y que no hagas apartados que tenga que bajar en el cel hasta lo último.»
Plan: PASADA DE DISEÑO DE PANTALLAS justo después de publicar la 1d (intensidad media):
- PC/Mac: diseño ancho de verdad (menú lateral o barra arriba, 2-3 columnas, tarjetas en rejilla, nada estirado ni perdido en el centro).
- Celular: ninguna pantalla larga. Administrador partido en pestañas/subpáginas (Resumen, Usuarios, Trabajo automático, Servidor, IA y gastos, Claves); proyecto con pestañas (Resumen, Lo que entendí, Versiones, Historial); acciones principales siempre arriba o fijas; lo largo plegado.
- Regla para todo lo nuevo: lo importante en la primera pantalla, sin bajar.

## Estado 10 nov 2026, 01:05 UTC
- Límite SEMANAL de Claude agotado; se reinicia el 10 nov a las 17:00 UTC. Recordatorio programado a las 17:15 UTC para retomar.
- 1e casi lista en fase-1e (5ef4c13 en GitHub): falta terminar «arreglar» (textos del modo seguro, memoria al subir directo, próxima copia, README, suite x3 + taskset, ensayo) y «revisar-de-nuevo». Retomar con resumeFromRunId wf_85321498-9bd.
- Pedido de Junior (10 nov): «Termina y dale una revisión visual y mejóralo: más claro, mejor de usar, sencillo y que se sepa más de las cosas». Después de publicar la 1e (0.5.0): pasada visual de TODAS las pantallas (una línea que diga qué es y qué hacer, «¿Qué es esto?» plegable, estados con iconos y colores, menos texto, PC y celular) → 0.5.1. Luego pedirle crear el bot de Telegram.

## Meta de Junior con la IA (10 nov 2026) — guía para las fases 3 a 5
Con la API de Claude o ChatGPT y SI ÉL LE DA LA OPCIÓN (autonomía alta por proyecto): que la IA se encargue de hablar con los clientes sin necesitar su ayuda — hacer el contacto, entender lo que responden, dar precios, dar seguimiento — y mantenerlo al tanto. Él solo se encarga de hacer el programa/la demo. Diseño: «vendedor automático» por proyecto con: lo que la IA puede decir (ficha del producto, lista de precios y descuentos máximos que él escribe, preguntas frecuentes), lo que NUNCA puede hacer sola (prometer fuera de la lista, cerrar contratos, cobrar), pase a Junior cuando el cliente pide demo/reunión o hay duda (aviso por Telegram con resumen), resumen diario, botón de pausa, tope de gasto, registro de toda conversación, respeto de «no me escriba» y de la Ley 310-14 (ver con abogado antes de escribir en frío).

## Más de la meta de Junior (10 nov 2026) — análisis profundo y vendedor inteligente
- ANÁLISIS a fondo de cada empresa, no solo una búsqueda: ubicación y distancia, todas las fuentes públicas, cómo habla en sus redes, qué puede necesitar; si no se sabe, PREGUNTARLE al cliente.
- CANALES: un correo propio para el vendedor, WhatsApp, y Facebook como opción (lo que sea posible y permitido: WhatsApp Business oficial se paga por conversación; Facebook/Instagram no permiten sacar datos con robots: usar lo público de su web y la API oficial de mensajes).
- INTELIGENTE y NATURAL: que se sienta como una persona que sabe vender software, que aprenda de cada conversación (qué mensajes funcionan) y mejore. Su meta es conseguir clientes y ventas; puede salirse del guion y buscar caminos propios para lograrlo.
- Límites que Claude le explicó: creativo sí, pero sin mentir (si le preguntan, dice que es el asistente de Junior), sin inventar precios, sin spam y dentro de la ley; lo que cueste dinero, con su permiso.

## Más de la meta (10 nov 2026) — el vendedor debe saber qué se puede hacer y cuánto cuesta
- Los programas que se venden los CONSTRUYE CLAUDE (no Junior ni el cliente). El vendedor debe saber por dentro si lo que pide un cliente SE PUEDE hacer, y no equivocarse ni prometer de más.
- «Catálogo de lo que se puede hacer» mantenido por Claude: cada función con si se puede, cuánto tarda y qué COSTO trae (ej.: WhatsApp oficial cuesta por conversación; IA por uso; servidor; correo), y qué no tiene costo. Si el vendedor no está seguro: «déjame confirmarlo» y consulta (a Claude/Junior), nunca inventa.
- MODELO DE COBRO: el cliente paga una MENSUALIDAD para que su programa funcione (servidor, mantenimiento, mejoras), por CONTRATO, y el precio sube o baja según su CONSUMO (usuarios, mensajes, IA, almacenamiento). El vendedor calcula la cotización con una tabla de precios que Junior aprueba; prepara el borrador de contrato; Junior firma.
