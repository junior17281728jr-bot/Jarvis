# OPORTIA — Diseño de la FASE 2: «buscar y analizar empresas de verdad»

Fecha: 2026-11-10. Solo diseño: no se tocó ningún repositorio, ni el servidor, ni ninguna cuenta.
Código leído (solo lectura): `wt-claro` = 0.5.1, base 6 (`src/tareas/*`, `src/proyectos/proyectos.js`, `src/motor/*`, `src/ia/*`, `src/nucleo/migraciones.js`, `src/copias/volcado.js`, `test/reglas.test.js`, `public/dibujos.js`).
Notas leídas: `plan-vision.md` (60 funciones), `CONTINUAR.md` (metas del 5 al 10 nov), `decisiones-dueno.md`, `diseno-1d.md` §13, §16 y §18, y los 8 informes de `plan23/`.

---

## 0. Para Junior, en corto (responde «¿afecta el servidor o qué pasará?»)

- **Hoy no pasa nada en tu servidor.** Esto es solo un plan escrito. No se instaló, no se cambió y no se borró nada.
- **Cuando se construya**, la fase 2 llega en 7 partes (2a a 2g), y las tres más grandes van partidas en trozos más pequeños (0.5.2, 2a-1, 2a-2, 2c-1, 2c-2, 2c-3; el detalle está en la sección 14). Primero se termina la parte 1f (instalación y restauración). *(rev. 1)* Cada una se prueba antes y se instala sola, como las anteriores. Si una falla, el servidor vuelve a la versión anterior y tus datos quedan igual.
- **Qué cambia en el servidor con cada parte:**

| Parte | Qué verás | Qué hace en el servidor |
|---|---|---|
| 2a | Tus proyectos aprobados dejan de decir «espera la fase 2» y muestran una lista de empresas reales, con nota preliminar | Baja una vez una lista abierta de negocios de RD (unos 10 MB) y la guarda en un archivo aparte (unos 60 MB de disco) |
| 2b | Ficha visual de cada empresa, filtros, mapa de casillas con números y la pantalla «Tareas» | Nada nuevo: solo pantallas |
| 2c | OPORTIA visita la web de cada empresa, despacio | Una web por minuto, como mucho. Sin trucos ni disfraces |
| 2d | Logo, mapa y distancia | Guarda una imagen pequeña por empresa (máximo 80 KB). Muchas tarjetas llevarán inicial y color: no toda web tiene un logo que sirva *(rev. 1)* |
| 2e | Nota de 0 a 100 completa, necesidades y mensaje en borrador | Solo cálculo propio, gratis |
| 2f | Análisis con IA, si tú lo permites en el proyecto | Gasta de tu tope de IA. Hoy el tope es US$0: no gasta nada hasta que tú lo subas |
| 2g | Noticias, más fuentes y sugerencias | Lecturas suaves de fuentes abiertas |

- **Memoria y velocidad:** el servidor (512 MB, 1 procesador) aguanta. El trabajo pesado va por turnos, de noche si se puede, y las pantallas siempre tienen prioridad. Si falta memoria o disco, la búsqueda se pausa sola y te avisa.
- **Dinero:** la fase 2 funciona completa **sin pagar nada**. Lo único que puede costar es la IA (opcional, con tope) y, más adelante, servicios que solo se activan si tú dices que sí (Google de pago, servidor más grande).
- **Tus datos:** no se borra nada. La única excepción propuesta es «Quitar mi negocio», que la ley pide (ver «Conflictos»).
- **Lo que no hará:** no envía correos ni mensajes (eso es la fase 3). No copia Google Maps, Facebook, Instagram ni Páginas Amarillas.
- **Contactar a una empresa que no te conoce** *(rev. 1)*: mientras un abogado dominicano no lo confirme, la ficha te da solo el **guion para llamar** y el botón Llamar. Los textos listos para correo y WhatsApp aparecen solo cuando esa empresa te escribió primero, te dio permiso o ya es cliente tuya. La ley obliga a quien envía, aunque lo envíes tú a mano (ver C16 y D19).
- **Límites honestos con las opciones seguras** *(rev. 1)*: sin que tú actives nada más, la seguridad de una ficha llega como mucho a «Media», no hay noticias, y «cómo habla la empresa» sale de su propia web (y de lo que tú pegues de sus redes, que OPORTIA no puede leer).

---

## 1. Qué cubre (cada función de la visión con su parte)

«F» = número de fila en `plan-vision.md`. Ninguna función se quita ni se contradice; las diferencias están en «Conflictos».

| F | Función | Qué entrega la fase 2 | Sección | Parte |
|---|---|---|---|---|
| 1 | Pedir un objetivo con tus palabras | El motor ya entiende; ahora además **ejecuta**. Productos fuera de la tabla usan la regla general | 6.5 | 2a, 2e |
| 3 | Oportunidades que no pediste | Sugerencias de sectores y zonas parecidos; tú decides | 6.9 | 2g |
| 6 | Motor propio sin IA | Buscar, quitar repetidos, clasificar, filtrar, puntuar, guardar, programar, detectar cambios, avisar | 5, 6 | 2a–2e |
| 8 | Análisis más profundo con IA | La IA lee el texto de la web y lo pegado. Opcional, con topes | 7 | 2f |
| 10 | Varios proyectos, cada uno con su configuración | Cada proyecto investiga con su versión aprobada | 5.3 | 2a |
| 11 | 7 capacidades | Se encienden investigar, analizar y recomendar; propuestas y mensajes como **borrador** | 5.3 | 2a, 2e |
| 13 | Elegir fuentes y añadir las tuyas | Selector de fuentes por proyecto y «Mis webs» (hasta 30 direcciones) | 3.4 | 2c, 2g |
| 16 | Encontrar empresas en RD | Overture como base; OpenStreetMap después | 3, 4 | 2a, 2g |
| 18 | Web oficial de cada empresa | Lector cortés: 8 páginas, 1 web por minuto | 6.2 | 2c |
| 19 | Noticias (**con límite** *(rev. 1)*) | Diario Libre primero; cada periódico es una fuente que se activa tras probarla y leer sus términos. **Con las opciones seguras nace apagada: no entrega nada hasta D14** | 6.8 | 2g |
| 20 | Opiniones y reseñas | Cuadro «Pegar reseñas»; el resto, solo enlace | 6.7 | 2e, 2f |
| 22 | Hecho, Opinión, Señal, Hipótesis | Cada dato con enlace, fecha, etiqueta y seguridad | 4.2 | 2a (se guarda), 2b (se ve en la ficha) |
| 23 | Cruzar varias fuentes (**con límite** *(rev. 1)*) | La misma empresa suma evidencias de todas las fuentes. Con las opciones seguras solo hay dos (lista abierta + su propia web): la seguridad «Alta» pide además una señal reciente (6.5) | 4.3 | 2a–2g |
| 24 | Necesidades que no pidió | 40 reglas «señal → necesidad → oferta» | 6.4 | 2e |
| 25 | Qué ofrecer y propuesta | Propuesta con 6 respuestas; sin IA, plantillas; siempre «Hipótesis» | 6.6 | 2e, 2f |
| 26 | Estrategias | Sugerencias y frases de lo aprendido (el informe sigue sin fase) | 6.9 | 2g |
| 27 | Nota de 0 a 100 | 8 criterios, desglose y seguridad Alta, Media o Baja | 6.5 | 2a (parcial), 2e |
| 28 | Cómo contactar (**con límite** *(rev. 1)*) | Correo general de su web y teléfono. Botón Llamar siempre. El botón WhatsApp con texto listo solo con base legal (C16, D19); sin ella, el número se ve y se puede copiar, sin texto preparado | 6.3, 6.6 | 2c, 2e |
| 29 | Mensajes distintos | Borrador que nombra la señal concreta; sin señal no hay mensaje | 6.6 | 2e, 2f |
| 34 | Historial y seguimiento | Estado por empresa (nueva, guardada, descartada, contactada por ti) y apuntes. El envío es de la fase 3 | 8.2 | 2b |
| 35 | Ciclo «conseguir clientes» | Investiga, encuentra, detecta, recomienda y prepara. Contactar: fase 3 | todo | 2a–2g |
| 44 | Aprender de tus resultados | Marcas «interesado / no / vendido»; mueve la nota desde 20 marcas; cada frase aprendida se puede **corregir** (subir o bajar), apagar o copiar *(rev. 1)* | 6.10 | 2e |
| 48 | Pantallas | «Empresas» dentro del proyecto (2a), ficha, filtros, mapa de casillas y «Tareas» (2b), mapa real (2d) | 8 | 2a, 2b, 2d |
| 52 | Trabajo 24/7 y avisos | Cada corrida guarda su punto; aviso «hay empresas nuevas» | 5, 8.4 | 2a (corridas y aviso), 2b (pantalla «Tareas») |
| 53 | Varios proyectos en servidor pequeño | Turnos justos, 1 tarea normal a la vez | 9 | 2a |
| 58 | Fuentes legales y «Quitar mi negocio» (**con límite hasta la 2c-1** *(rev. 1)*) | Lista de exclusión que se revisa antes de importar, mostrar o visitar (2a). El camino para que **el propio negocio** lo pida (página pública con «Abrir un pedido») llega en la 2c-1, antes de leer la primera web. Las copias de seguridad cifradas ya hechas lo conservan sin usarlo (3.5) | 3.5 | 2a, 2c-1 |
| 59 | Leyes 172-13 y 310-14 | Solo datos de negocio; nada de envío en frío **ni por el servidor ni preparado para enviar a mano**: sin permiso, solo guion de llamada (como dice la línea añadida de la visión); reglas en `paises/rd` *(rev. 1)* | 10, 6.6 | 2a, 2c, 2e |
| Meta 5 nov (**con límite** *(rev. 1)*) | Fotos y logos, fichas visuales | Logo de su propia web (icono grande, máximo 80 KB). **No se puede reducir el tamaño de una imagen en el servidor** (no hay librería): las fotos grandes quedan fuera y muchas tarjetas llevan inicial y color. Se mide en la 2d cuántas quedan con logo real (C17, D20) | 6.3, 8.2 | 2d |
| Meta 10 nov (**con límites** *(rev. 1)*) | Análisis profundo: ubicación, distancia, redes, qué necesita, preguntar si no se sabe | Distancia en línea recta, «Preguntas para el cliente», «cómo habla» **sacado del texto de su propia web** (sin IA: 3 rasgos simples; con IA: una línea con cita). **De sus redes sociales solo hay enlace y lo que tú pegues**: leerlas con programas está prohibido (F21). «Todas las fuentes públicas» = las legales y gratis; YouTube, Wikidata y datos.gob.do quedan como candidatas apagadas (3.3, D21) | 6.3, 6.7, 7.3 | 2d, 2e, 2f |

Quedan fuera, como dice la visión: F5 «Investiga esta empresa» (fase 4; con la parte 2c ya es casi gratis adelantarla: ver «Decisiones»), F17 fuentes de pago, F21 leer redes sociales, F54 webs con JavaScript, F56 Excel (pero cada dato guarda ya su fuente y su licencia).

---

## 2. Decisiones de base (lo que sostiene todo lo demás)

### 2.1 Cómo llegan los datos de Overture a un servidor sin dependencias

Problema real: Overture se publica en un formato (Parquet) que Node no lee sin librerías, y el servidor tiene cero dependencias, 512 MB y un trabajador con 64 MB de memoria (`BANDERAS_TRABAJADOR`). Nada en las notas lo resuelve.

**Camino principal: «paquetes de datos» preparados fuera del servidor.**

1. En una sesión de Claude en la nube (no en el servidor de Junior), un programa de `herramientas/` lee la edición oficial de Overture, se queda solo con República Dominicana y escribe un archivo propio y sencillo: `oportia-rd-overture-<edición>.ndjson.gz` (una línea JSON por negocio).
2. En ese mismo paso, fuera del servidor, se calcula lo pesado: provincia y municipio de cada punto (punto dentro del límite), sector de OPORTIA según la categoría, nombre normalizado, dominio y teléfono normalizados.
3. *(rev. 1)* El archivo se publica **partido en trozos de 20 MB como máximo** dentro de una rama aparte `datos` del repositorio público de OPORTIA (aparte para no engordar lo que baja el actualizador desde `main`). El servidor los pide a `raw.githubusercontent.com/<repo>/<etiqueta>/datos/…`, que responde directo, **sin redirección**. Son datos abiertos, no secretos. Cada trozo lleva su sha256 y el primero trae la licencia y la atribución. **Solo se publican así paquetes cuya licencia permite volver a publicar y ya fue leída (hoy: Overture, por confirmar en el paso 0).** Los paquetes de DGII, DGCP y MICM **no** se publican en el repositorio público mientras sus términos no estén leídos; OpenStreetMap, cuando llegue, se publica con su atribución ODbL en el propio paquete.
4. El código guarda el nombre, el tamaño y el **sha256** de cada trozo y del paquete entero en `src/fuentes/paquetes.json`. El servidor solo acepta lo que coincide. La descarga es reanudable trozo a trozo.
5. El trabajador lo baja una vez, lo descomprime en disco y lo importa por partes (200 filas por escritura, punto guardado por posición en el archivo).

Por qué así:
- El servidor no necesita entender el formato de Overture. Si Overture cambia su esquema (ya cambió: ver 12.1), solo cambia el programa de `herramientas/`.
- El servidor ya llega a GitHub (de ahí instala las versiones). *(rev. 1)* Sí hace falta **un host nuevo y fijo en la puerta de red del programa**: `raw.githubusercontent.com` (el actualizador usa otros dos hosts de GitHub). No hay que cambiar nada en el servidor a mano.
- Todo es repetible y verificable: mismo paquete, mismo resultado.

**Por qué no un adjunto de «release»** *(rev. 1; comprobado en el CÓDIGO)*: la puerta de red que existe (`src/ia/llamar.js`, líneas 58-59 y 131) acepta un solo host exacto y usa `redirect: 'manual'`: nunca sigue redirecciones; su tiempo máximo es 120 s (línea 127). Los adjuntos de una «release» responden con una redirección a otro host (comportamiento conocido; UNVERIFIED hoy porque `docs.github.com` no abre desde la sesión). El actualizador real (`deploy/cloud-init.sh`) solo usa `api.github.com` y `codeload.github.com`. Por eso el camino principal es el de arriba, sin redirección, con una entrada nueva de host fijo `raw.githubusercontent.com` en la lista de la puerta (sin clave, solo `GET`, tope de bytes por trozo) y su prueba. **Respaldo** si `raw` no sirve desde el servidor: permitir UNA redirección manual a una lista fija de hosts de descargas de GitHub, sin cabeceras, con sha256 al final y prueba en `reglas.test.js`. Se prueba desde el servidor en el paso 0, antes de escribir código. Segundo respaldo (solo desde la 2b, cuando existe esa pantalla): el administrador sube el archivo desde la pantalla «Fuentes» (subida por trozos; mismo sha256).

Hosts necesarios y desde dónde:

| Host | Desde | Para qué | Estado |
|---|---|---|---|
| Almacenamiento oficial de Overture (S3 o Azure) | Entorno de Claude en la nube | Armar el paquete | Hay que permitirlo en ese entorno (gratis). No verificado en esta sesión |
| `raw.githubusercontent.com` | Servidor | Bajar los trozos del paquete | Host nuevo y fijo en la puerta de red (rev. 1). El servidor ya llega a GitHub para actualizarse, pero por otros hosts: probarlo en el paso 0 |
| Webs de las empresas | Servidor | Lector cortés (2c) | Salida abierta del servidor, con protección (6.2) |

### 2.2 Dos archivos de base: lo tuyo y lo de referencia

`src/copias/volcado.js` copia **todas** las tablas de `oportia.db` cada noche y las manda cifradas a Telegram. Si los 90,600 lugares de Overture vivieran ahí, cada copia crecería decenas de MB sin motivo: son datos que se pueden volver a bajar.

- **`oportia.db` (la de siempre, con copia cada noche):** lo que es tuyo o costó trabajo: empresas que algún proyecto encontró, evidencias, notas, apuntes, borradores, exclusiones, lo aprendido.
- **`oportia-referencia.db` (nuevo, sin copia):** las listas abiertas tal como llegan (Overture, luego OpenStreetMap y otras). Si se pierde, se vuelve a importar sola desde el paquete. Tiene su propio esquema mínimo (`PRAGMA user_version`) y lo abre `src/fuentes/referencia.js`.
- **`logos/` (carpeta, sin copia):** una imagen pequeña por empresa. Se puede volver a leer de la web de origen; en la base queda solo la dirección de origen.

Tras restaurar una copia en un servidor nuevo, `fuentes_estado` dice «importada» pero el archivo no existe: `sistema.vigilar` lo nota y encola de nuevo `fuentes.paquete`. Las empresas de los proyectos no se pierden (están en `oportia.db`). *(rev. 1)* Igual para `logos/`: `sistema.vigilar` marca las empresas guardadas cuyo logo falta y las pone en cola para leerlo de nuevo, sin esperar 30 días. Las **exclusiones** se guardan además en un archivo aparte `exclusiones.ndjson` (en la carpeta de datos y junto a cada copia): al restaurar se **fusiona** con lo restaurado, nunca lo reemplaza, para que un negocio que pidió salir no reaparezca por restaurar una copia vieja.

### 2.3 Catálogo común y datos privados

Como dice la visión (F4 PREP y F14): lo que es **público de la empresa** (nombre, web, teléfono del negocio, lo leído en su web, noticias) vive en un catálogo común, con su fuente. Lo que es **del proyecto** (nota, desglose, estado, apuntes, borradores, reseñas pegadas, lo que vio el dueño en redes, resultados marcados, pesos aprendidos) lleva `proyecto_id` y solo lo ve ese espacio. Toda consulta de pantallas sigue la regla de `proyectos.js`: siempre `WHERE espacio_id = ?` a través del proyecto.

### 2.4 Se sigue con 512 MB

El comentario de `src/tareas/tipos.js` dice «En la fase 2, con 1 GB, "normal" sube a 2». La tarea de hoy es diseñar para 512 MB. Este diseño **deja `CUPOS = { normal: 1, grande: 1 }`** y cabe en 512 MB (sección 9). Subir a 1 GB (US$6 al mes) es una decisión de pago del dueño; no hace falta para la fase 2.

### 2.5 Dos pendientes de la 1c que se cierran aquí (`CONTINUAR.md`, línea del 5 nov)

- **`alFallar` que siempre falla:** hoy, si `marcarConErrores` lanza al marcar «fallida» una tarea de proyecto, la tarea no se recupera. Decisión: `guardarPaso` llama a `alFallar` dentro de su propio `SAVEPOINT`; si lanza, la tarea **igual** queda «fallida», se anota el evento `error` con `alfallar_fallo` y se abre el aviso `proyecto_sin_marcar` (nivel atención). Prueba nueva en `test/tareas.test.js`.
- **`quick_check` síncrono en bases grandes:** con la referencia fuera de `oportia.db`, la base principal crece despacio (unos 5 KB por empresa investigada). Se añade una medida: si `oportia.db` pasa de 300 MB, `sistema.base` cambia a `PRAGMA quick_check` por tabla, una tabla por paso. `oportia-referencia.db` se revisa solo al terminar cada importación.

---

## 3. Marco de fuentes (adaptadores)

### 3.1 Qué es una fuente

Un archivo en `src/fuentes/<clave>.js` que exporta **solo datos y funciones puras** más un registro común en `src/fuentes/registro.js`. Añadir una fuente = un archivo + una entrada en el registro + sus textos en `es.json` y `en.json` + su prueba.

```js
// src/fuentes/registro.js (forma de cada entrada; solo DATOS, lo cargan los dos procesos)
{
  clave: 'overture',                 // [a-z_]{2,30}
  fase: 2, parte: '2a',
  clase: 'paquete',                  // 'paquete' | 'web_propia' | 'api' | 'rss' | 'pegado'
  modo: 'guardar',                   // 'guardar' | 'solo_en_vivo' | 'solo_enlace'   (visión F17 y F20)
  tipos: ['comercial'],              // en qué tipo de proyecto se ofrece
  porDefecto: true,                  // viene marcada en un proyecto nuevo
  licencia: 'CDLA-Permissive-2.0',   // se copia a cada evidencia
  atribucion: 'Overture Maps Foundation',
  terminosUrl: 'https://docs.overturemaps.org/attribution/',
  exportable: true,                  // ¿puede salir en un Excel (fase 6)?
  tablaAparte: false,                // true para ODbL (OpenStreetMap)
  ritmo: { pedidosPorMinuto: 0, pausaMs: 0, porDia: 0 },   // 0 = no hace pedidos en vivo
  necesitaClave: null,               // uso en src/claves (p. ej. 'google_places'); null = ninguna
  costo: 'gratis',                   // 'gratis' | 'de_pago'  → de_pago nunca se enciende sin el dueño
  requiereTerminosVistos: true,      // no se activa hasta guardar fecha de lectura de los términos
}
```

Reglas que revisa `test/reglas.test.js` (nuevas):
- Una fuente `de_pago` nunca tiene `porDefecto: true`.
- Una fuente con `modo` distinto de `guardar` nunca escribe en `empresas` ni en `evidencias.valor`.
- Ningún archivo de `src/` contiene los nombres de host de Google Maps, Facebook, Instagram ni Páginas Amarillas como destino de lectura (solo se permiten como **enlace** que abre el usuario).
- Cada fuente del registro tiene su fila de textos y su prueba.

### 3.2 Estado de cada fuente en el servidor

Tabla `fuentes_estado` (migración 7): apagada, activa, importando, pausada; edición importada, filas, sha256, cuándo se leyeron los términos, pausa y motivo. La pantalla Administrador → «Fuentes» la muestra con un interruptor por fuente y el texto simple de su licencia.

**Términos vistos:** una fuente con `requiereTerminosVistos` solo se activa cuando existe `terminos_vistos_en`. Lo pone Claude al publicar la parte (tras leer la página oficial y guardar copia fechada en `notas/terminos/`), nunca el servidor por su cuenta.

### 3.3 Las fuentes de la fase 2

| Clave | Parte | Clase y modo | Qué da | Ritmo | Estado legal |
|---|---|---|---|---|---|
| `overture` | 2a | paquete, guardar | Negocios con nombre, categoría, punto, a veces teléfono y web | Sin pedidos en vivo; paquete cada 1–3 meses | Licencia permisiva (12.1); confirmar página oficial en el paso 0 |
| `web_propia` | 2c | web_propia, guardar | Lo que la empresa publica en su web | 1 pedido a la vez; ≥ 5 s por sitio; 8 páginas; relectura ≥ 30 días | robots.txt de cada sitio (6.2) |
| `mis_webs` | 2c | web_propia, guardar | Direcciones que escribe el dueño en el proyecto (F13) | Igual que `web_propia` | Igual |
| `pegado` | 2e | pegado, guardar (privado del proyecto) | Reseñas y «lo que vi en sus redes» que pega el dueño | — | Sin nombres de personas (10) |
| `osm` | 2g | paquete, guardar, tabla aparte | Segunda lista de negocios | Paquete mensual | ODbL: atribución visible y tabla aparte |
| `noticias_diariolibre` | 2g | rss, guardar titular + enlace + resumen corto | Aperturas, expansiones, cierres | 1 lectura por hora como mucho | Probar desde el servidor y leer términos antes de activar |
| `dgcp`, `micm` | 2g | paquete, guardar | Vende al Estado; tamaño (micro, pequeña, mediana) por RNC | Paquete mensual | Licencia en conflicto CC-BY / ODbL: confirmar |
| `dgii_rnc` | 2g (apagada) | paquete, guardar | Existe y está activa (por RNC); solo empresas, sin cédulas | Mensual | Términos no leídos: no se activa hasta leerlos |
| `nominatim` | 2d (apagada) | api, guardar con caché | «Ubicar mejor» una dirección, al pulsar | 1 por 1.1 s; máximo 200 al día | Política de OSM: confirmar texto oficial |
| `google_places` | sin fecha | api, solo_en_vivo, de_pago | — | — | Solo si el dueño lo pide y paga; guarda solo `place_id` |
| `facebook`, `instagram`, `linkedin`, `tiktok`, `x` | 2c | solo_enlace | Botón que abre la red | Nunca se leen | Prohibido leerlas con programas |
| `youtube` *(rev. 1, candidata)* | 2g (apagada) | api, guardar título y descripción del canal de la empresa | Cómo se presenta y habla en sus vídeos | Dentro del cupo gratis oficial; solo canales enlazados desde la web de la empresa | API oficial de YouTube: gratis con una clave del dueño (UNVERIFIED hoy; `investigacion-redes-sociales.md`). No se construye hasta D21 |
| `wikidata`, `datos_gob_do` *(rev. 1, candidatas)* | 2g (apagadas) | paquete o api, guardar | Datos básicos de empresas grandes; listas públicas del Estado | Bajo | Licencias abiertas según `investigacion-fuentes-empresas.md` (UNVERIFIED): leer términos antes de activar (D21) |
| `asociaciones` *(rev. 1, candidata)* | sin fecha | pegado o paquete con permiso | Listas de socios de cámaras y asociaciones | — | Solo con permiso escrito. Claude deja lista la carta modelo; la envía el dueño si quiere (D21) |

### 3.4 Elegir fuentes por proyecto (F13)

- La configuración del proyecto pasa de `esquema: 3` a `esquema: 4`. Hoy `limpiarConfiguracion` pone fijo `fuentes: FUENTES[tipo]`. En el esquema 4, `fuentes` es una lista elegida por la persona entre las que el registro ofrece para ese tipo y que el administrador tiene activas.
- Las claves viejas (`datos_abiertos`, `webs`, `noticias`) se leen como grupos: `datos_abiertos` = `overture` (+ `osm`, `dgcp`, `micm` cuando existan), `webs` = `web_propia` + `mis_webs`, `noticias` = las de noticias. Así una versión aprobada con esquema 3 sigue valiendo **sin reescribirla**.
- Campo nuevo `misWebs`: hasta 30 direcciones `https://…` que el dueño añade. Se validan (6.2) y se investigan como una empresa más.
- Cambiar las fuentes crea una **versión nueva que espera aprobación**, como cualquier cambio (F15).
- *(rev. 1)* **«Leer antes de escribir»:** la parte anterior a la que empieza a escribir un esquema nuevo ya lo **entiende y lo conserva** sin ofrecerlo. La 2b lee y conserva el esquema 4; la 2c-3 empieza a escribirlo. La 2e conserva `ia.permitida: true`; la 2f la escribe. Así, si el actualizador devuelve el código una versión atrás, ese código no pierde `misWebs`, las fuentes elegidas ni el permiso de IA al mostrar, editar o volver a aprobar. El ensayo de vuelta atrás incluye un proyecto con una versión de esquema 4 aprobada y otra pendiente.
- El candado «Elegir y añadir fuentes: próximamente (fase 2)» desaparece en la 2c (cuando hay más de una fuente que elegir); en la 2a el texto dice la verdad: «Por ahora hay una sola fuente: datos abiertos de Overture».

### 3.5 «Quitar mi negocio» (F58): sale y no regresa

Tabla `exclusiones` (migración 7). Cada exclusión guarda una **huella** (sha256 del valor normalizado), no el dato *(rev. 1: la huella sirve para reconocer, **no es anonimato**: la de un teléfono dominicano se puede revertir probando números; por eso la lista de exclusiones es solo del administrador y nunca se publica)*: dominio, teléfono, RNC, identificador en la fuente y «nombre normalizado + municipio».

Qué pasa al quitar una empresa (un solo paso, en una transacción). Los pasos 2 y 3 **vacían** datos: son la única excepción propuesta a «nunca borrar» y dependen de la decisión D2; mientras el dueño no responda, se aplica la opción segura (solo ocultar: los pasos 1 y 4, sin vaciar nada):
1. Se crean sus huellas en `exclusiones` (alcance `todo`).
2. `empresas.estado = 'quitada'`, `quitada_en = ahora`; se vacían sus campos de contacto y descripción; sus `evidencias` pasan a `vigente = 0` con `valor` y `detalle` vacíos; sus `borradores` pasan a «descartado» con el cuerpo vacío.
3. Su imagen se quita del disco.
4. En cada proyecto, su fila pasa a `estado = 'quitada'` (deja de verse; se conserva la cuenta).

Dónde se consulta la lista, siempre antes de actuar:
- al **importar** un paquete a la referencia (la fila se salta);
- al **promover** un lugar al catálogo (6.1);
- al **visitar** una web (el dominio excluido no se lee);
- al **mostrar** (las consultas de pantallas filtran `estado <> 'quitada'`).

Quién puede pedirlo:
- El dueño o un usuario, con el botón «Quitar» de la ficha: «Solo para mí» (alcance `espacio`: deja de salir en sus proyectos) o, si es administrador, «De todo OPORTIA» (alcance `todo`).
- El negocio *(rev. 1)*: desde la parte 2c-1 (antes de leer la primera web), con el botón **«Abrir un pedido»** de la página pública del lector, que vive en el repositorio público de GitHub (los «issues»: gratis, sin correo personal y sin la dirección del servidor). Claude lo revisa en cada mantenimiento y el administrador lo aplica en un toque. Entre la 2a y la 2c-1 no hay lectura de webs y el negocio todavía no tiene cómo pedirlo: por eso F58 figura «con límite» en §1. Un correo genérico o un formulario propio quedan como mejora (D3, D18).

**Lo que «Quitar» no alcanza, dicho sin adornos** *(rev. 1)*: las copias de seguridad cifradas ya enviadas a Telegram y las guardadas en el servidor siguen conteniendo ese negocio (nunca se borran y no se usan para nada más); el paquete público de datos abiertos lo sigue trayendo, porque viene de Overture (la lista de exclusión lo salta al importar). El texto para el negocio dice: «Sale de OPORTIA y no vuelve. Queda en copias de seguridad cifradas que no se usan». Va entre las preguntas para el abogado.

---

## 4. Esquema del catálogo (migraciones 7 a 10, solo agregan)

Reglas que se mantienen (`test/reglas.test.js`): nunca `DROP`, nunca `RENAME`, nunca editar una migración publicada; cada migración nueva sube la versión de `package.json`; las explicaciones van **fuera** del texto SQL; los valores permitidos se revisan en el código (sin `CHECK`). Igual que en las migraciones 5 y 6: **sin `CHECK`, sin `UNIQUE` y sin `ADD COLUMN`** (prueba nueva por cada migración). Los repetidos se evitan en el código, dentro de la misma transacción que escribe, con índices normales para buscar rápido.

*(rev. 1)* **Una sola regla para las tres capas (fase 2, fase 3 y negocio): sin `ADD COLUMN`.** Lo que falte después va en la columna de reserva `extra TEXT NOT NULL DEFAULT '{}'` (un JSON corto, validado en el código) que llevan desde el primer día `empresas`, `proyecto_empresas` y `evidencias`, o en una tabla lateral nueva. `diseno-negocio.md` §3.2 y `diseno-fase3.md` quedan alineados con esto.

`VERSION_DE_BASE_NECESARIA` del trabajador sube a 7 en la 2a, a 8 en la 2c, a 9 en la 2e y a 10 en la 2g.

### 4.1 Migración 7 «catalogo» (parte 2a, versión 0.6.0)

```sql
CREATE TABLE IF NOT EXISTS fuentes_estado (
  fuente TEXT PRIMARY KEY,
  estado TEXT NOT NULL DEFAULT 'apagada',
  edicion TEXT,
  licencia TEXT,
  terminos_url TEXT,
  terminos_vistos_en TEXT,
  filas INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  importada_en TEXT,
  revisada_en TEXT,
  pausa_hasta TEXT,
  pausa_motivo TEXT,
  ultimo_error TEXT,
  cambiado_por INTEGER REFERENCES usuarios(id),
  actualizado_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY,
  huella TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activa',
  nombre TEXT NOT NULL,
  nombre_normal TEXT NOT NULL,
  sector TEXT,
  categoria_origen TEXT,
  provincia TEXT,
  municipio TEXT,
  zona TEXT,
  direccion TEXT,
  lat REAL,
  lon REAL,
  ubicacion_precision TEXT,
  dominio TEXT,
  web_url TEXT,
  telefono TEXT,
  whatsapp TEXT,
  correo_general TEXT,
  redes TEXT NOT NULL DEFAULT '{}',
  rnc TEXT,
  tamano TEXT,
  titular TEXT,
  descripcion TEXT,
  hechos TEXT NOT NULL DEFAULT '{}',
  logo_archivo TEXT,
  logo_origen TEXT,
  logo_bytes INTEGER,
  fuentes_n INTEGER NOT NULL DEFAULT 1,
  web_estado TEXT,
  web_leida_en TEXT,
  fusionada_en INTEGER REFERENCES empresas(id),
  quitada_en TEXT,
  celda TEXT,
  grupo TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  creada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS empresas_huella ON empresas(huella);
CREATE INDEX IF NOT EXISTS empresas_celda ON empresas(celda);
CREATE INDEX IF NOT EXISTS empresas_grupo ON empresas(grupo);
CREATE INDEX IF NOT EXISTS empresas_dominio ON empresas(dominio);
CREATE INDEX IF NOT EXISTS empresas_telefono ON empresas(telefono);
CREATE INDEX IF NOT EXISTS empresas_lugar ON empresas(sector, provincia, municipio);
CREATE INDEX IF NOT EXISTS empresas_estado ON empresas(estado, id);
CREATE TABLE IF NOT EXISTS empresa_fuentes (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  fuente TEXT NOT NULL,
  id_en_fuente TEXT NOT NULL,
  edicion TEXT,
  licencia TEXT,
  confianza_fuente REAL,
  primera_vez TEXT NOT NULL,
  ultima_vez TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS empresa_fuentes_origen ON empresa_fuentes(fuente, id_en_fuente);
CREATE INDEX IF NOT EXISTS empresa_fuentes_empresa ON empresa_fuentes(empresa_id);
CREATE TABLE IF NOT EXISTS evidencias (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  proyecto_id INTEGER REFERENCES proyectos(id),
  clase TEXT NOT NULL,
  etiqueta TEXT NOT NULL,
  campo TEXT,
  valor TEXT,
  detalle TEXT,
  confianza TEXT NOT NULL DEFAULT 'media',
  fuente TEXT NOT NULL,
  url TEXT,
  licencia TEXT,
  regla TEXT,
  origen TEXT NOT NULL DEFAULT 'motor',
  llamada_id INTEGER REFERENCES ia_llamadas(id),
  vigente INTEGER NOT NULL DEFAULT 1,
  vista_en TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '{}',
  creada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evidencias_empresa ON evidencias(empresa_id, vigente, clase);
CREATE INDEX IF NOT EXISTS evidencias_proyecto ON evidencias(proyecto_id, empresa_id);
CREATE TABLE IF NOT EXISTS exclusiones (
  id INTEGER PRIMARY KEY,
  clase TEXT NOT NULL,
  huella TEXT NOT NULL,
  alcance TEXT NOT NULL DEFAULT 'todo',
  espacio_id INTEGER REFERENCES espacios(id),
  empresa_id INTEGER REFERENCES empresas(id),
  motivo TEXT,
  pedida_por TEXT NOT NULL DEFAULT 'dueno',
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS exclusiones_huella ON exclusiones(clase, huella);
CREATE TABLE IF NOT EXISTS proyecto_empresas (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  estado TEXT NOT NULL DEFAULT 'nueva',
  etapa TEXT NOT NULL DEFAULT 'encontrada',
  nota INTEGER,
  seguridad TEXT,
  desglose TEXT NOT NULL DEFAULT '{}',
  necesidad TEXT,
  oferta TEXT,
  propuesta TEXT,
  distancia_km REAL,
  con_ia INTEGER NOT NULL DEFAULT 0,
  version_numero INTEGER,
  corrida_id INTEGER,
  favorita INTEGER NOT NULL DEFAULT 0,
  apunte TEXT,
  resultado TEXT,
  resultado_en TEXT,
  motivo TEXT,
  vista_en TEXT,
  encontrada_en TEXT NOT NULL,
  extra TEXT NOT NULL DEFAULT '{}',
  actualizada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proyecto_empresas_lista ON proyecto_empresas(proyecto_id, estado, nota);
CREATE INDEX IF NOT EXISTS proyecto_empresas_par ON proyecto_empresas(proyecto_id, empresa_id);
CREATE INDEX IF NOT EXISTS proyecto_empresas_empresa ON proyecto_empresas(empresa_id);
CREATE TABLE IF NOT EXISTS proyecto_corridas (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  tarea_id INTEGER REFERENCES tareas(id),
  version_numero INTEGER,
  origen TEXT NOT NULL DEFAULT 'programa',
  estado TEXT NOT NULL DEFAULT 'en_curso',
  etapa TEXT,
  encontradas INTEGER NOT NULL DEFAULT 0,
  nuevas INTEGER NOT NULL DEFAULT 0,
  webs_leidas INTEGER NOT NULL DEFAULT 0,
  con_ia INTEGER NOT NULL DEFAULT 0,
  costo_micro INTEGER NOT NULL DEFAULT 0,
  detalle TEXT,
  empezo_en TEXT NOT NULL,
  termino_en TEXT
);
CREATE INDEX IF NOT EXISTS proyecto_corridas_proyecto ON proyecto_corridas(proyecto_id, id);
```

Valores que revisa el código (listas exportadas + prueba de que la base solo tiene esos):

| Columna | Valores |
|---|---|
| `fuentes_estado.estado` | apagada, activa, importando, pausada |
| `empresas.estado` | activa, quitada, cerrada, fusionada |
| `empresas.ubicacion_precision` | exacta (la fuente trae el punto), web (la empresa la publicó), zona (centro del municipio o sector), null |
| `empresas.web_estado` | sin_web, por_leer, leida, parcial_js, no_quiere (robots), bloqueo, caida, solo_red_social |
| `empresas.tamano` | micro, pequena, mediana, grande, null |
| `empresas.titular` | empresa (tiene forma societaria: SRL, SA, EIRL… o RNC de empresa), persona_fisica (parece negocio de una persona: colmado, profesional), desconocido. Lo usa la fase 3 para ser más prudente al escribir |
| *(rev. 1)* nota sobre `titular` | En la práctica casi todo saldrá «desconocido» (pocas empresas llevan «SRL» en el nombre y el registro RNC nace apagado). La fase 3 trata «desconocido» como persona física: es prudente, pero significa que su nivel más libre casi nunca aplicará hasta tener más datos. Se dice en la pantalla «Libertad» |
| `evidencias.clase` | dato, senal, noticia, opinion, pegado, pregunta |
| `evidencias.etiqueta` | hecho, opinion, senal, hipotesis (visión F22) |
| `evidencias.confianza` | alta, media, baja |
| `evidencias.origen` | motor, ia, persona |
| `exclusiones.clase` | dominio, telefono, rnc, id_fuente, nombre_lugar |
| `exclusiones.alcance` | todo, espacio |
| `exclusiones.pedida_por` | dueno, negocio, administrador |
| `proyecto_empresas.estado` | nueva, vista, guardada, descartada, contactada, quitada |
| `proyecto_empresas.etapa` | encontrada, web_leida, analizada, con_borrador |
| `proyecto_empresas.seguridad` | alta, media, baja |
| `proyecto_empresas.resultado` | interesado, no_interesado, sin_respuesta, vendido, null |
| `proyecto_corridas.origen` | programa, aprobacion, a_mano, arranque_fase2 |
| `proyecto_corridas.estado` | en_curso, hecha, a_medias, fallida, cancelada |

*(rev. 1)* `empresas.huella` = sha256 de «nombre normalizado | municipio | celda», **sin dominio ni teléfono**: así no cambia cuando más tarde se descubre su web. `celda` = latitud y longitud redondeadas a 3 decimales (unos 100 m), con índice, para comparar solo contra su celda y las 8 vecinas. `grupo` = dominio compartido por varias sucursales (4.3). `extra` = reserva (ver la regla de arriba). `empresas.hechos` es un JSON corto (máximo 4 KB): qué hace, hasta 15 productos o servicios, horario si lo publica, sucursales contadas. `redes` es un JSON `{ facebook: url, instagram: url, … }`: solo enlaces.

### 4.2 Procedencia de cada dato (F22)

- **Todo valor visible tiene al menos una fila en `evidencias`** con `fuente`, `url` (o el identificador en la fuente), `vista_en`, `etiqueta`, `confianza` y `licencia`. La fila de `empresas` guarda solo «el mejor valor de hoy» para listar rápido.
- *(rev. 1)* **Compacto para no inflar las copias:** lo que llega de una lista abierta se guarda en **una sola fila** `dato` por empresa y fuente, con los campos dentro de `valor` como JSON (nombre, teléfono, web, punto), no una fila por campo. Las señales y las hipótesis tienen clave estable (empresa, proyecto, regla): una corrida nueva **actualiza** `vista_en`; solo se crea otra fila si el contenido cambió.
- Elegir el mejor valor: gana la evidencia vigente de mayor confianza; a igual confianza, la más reciente; la propia web de la empresa gana a una lista abierta para teléfono, correo y descripción.
- Cuando un dato cambia, la evidencia vieja pasa a `vigente = 0` (no se borra): así se **detectan cambios** (F6) y se puede mostrar «antes decía…».
- `etiqueta`: `hecho` = lo publica la fuente tal cual (teléfono, dirección); `opinion` = reseña pegada; `senal` = algo observado que sugiere algo («no encontramos reservas en las páginas leídas»); `hipotesis` = lo que OPORTIA deduce (necesidad, oferta, propuesta).
- Sin evidencia no hay recomendación: `puntuar` no asigna puntos de «necesidad» sin una fila `senal` vigente.

### 4.3 Juntar la misma empresa de varias fuentes (F23)

`src/catalogo/juntar.js`, función pura `mismaEmpresa(a, b)`:
1. Mismo `fuente` + `id_en_fuente` → es la misma (actualización).
2. *(rev. 1)* Mismo dominio propio (no de red social ni de constructor gratis) **y** puntos a menos de 300 m (o alguno sin punto) → la misma. Mismo dominio y puntos a **más de 300 m → sucursales**: fichas distintas, unidas por `grupo` (el dominio). El número de sucursales de las reglas G01 y G03 sale de contar el grupo. Así una cadena de farmacias no queda en una sola ficha.
3. Mismo teléfono normalizado **y** nombres parecidos (distancia ≤ 2 con `distancia()` de `src/motor/texto.js`, o uno contiene al otro) → la misma.
4. Mismo municipio, puntos a menos de 150 m y nombres parecidos → la misma. *(rev. 1)* Se compara solo contra la `celda` de la empresa y sus 8 vecinas (índice), no contra todo el municipio.
5. Si no, distinta. Ante la duda, **no se juntan** (dos fichas es mejor que mezclar dos negocios).

Al juntar: se suma una fila en `empresa_fuentes`, `fuentes_n` sube, las evidencias se añaden a la empresa que ya existía. Si más tarde se descubre que dos empresas guardadas son la misma, la más nueva pasa a `estado = 'fusionada'` con `fusionada_en` apuntando a la otra (nunca se borra) y sus filas de proyecto se mueven.

### 4.4 Migración 8 «web» (parte 2c, versión 0.7.0)

```sql
CREATE TABLE IF NOT EXISTS web_sitios (
  id INTEGER PRIMARY KEY,
  dominio TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'por_leer',
  robots_estado TEXT,
  robots_reglas TEXT,
  robots_leido_en TEXT,
  espera_seg INTEGER NOT NULL DEFAULT 5,
  proxima_en TEXT,
  paginas INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  http_ultimo INTEGER,
  https_ok INTEGER,
  certificado_vence_en TEXT,
  generador TEXT,
  js_parcial INTEGER NOT NULL DEFAULT 0,
  huella TEXT,
  cambio_en TEXT,
  leido_en TEXT,
  fallos_seguidos INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS web_sitios_dominio ON web_sitios(dominio);
CREATE INDEX IF NOT EXISTS web_sitios_proxima ON web_sitios(estado, proxima_en);
CREATE TABLE IF NOT EXISTS web_paginas (
  id INTEGER PRIMARY KEY,
  sitio_id INTEGER NOT NULL REFERENCES web_sitios(id),
  ruta TEXT NOT NULL,
  clase TEXT,
  http INTEGER,
  bytes INTEGER,
  huella TEXT,
  cambio_en TEXT,
  leida_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS web_paginas_sitio ON web_paginas(sitio_id, ruta);
CREATE TABLE IF NOT EXISTS geocodigos (
  id INTEGER PRIMARY KEY,
  huella TEXT NOT NULL,
  consulta TEXT NOT NULL,
  resultado TEXT NOT NULL DEFAULT 'sin_resultado',
  lat REAL,
  lon REAL,
  precision TEXT,
  fuente TEXT NOT NULL,
  licencia TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS geocodigos_huella ON geocodigos(huella);
```

Nunca se guarda el HTML: de cada página queda su ruta, su tamaño y una huella (para saber si cambió). `web_sitios.estado`: por_leer, leyendo, leido, parcial_js, no_quiere, bloqueo, caida, en_pausa. `web_paginas.clase`: inicio, contacto, nosotros, servicios, empleo, mapa_del_sitio, otra.

### 4.5 Migración 9 «propuestas_y_aprendizaje» (parte 2e, versión 0.8.0)

```sql
CREATE TABLE IF NOT EXISTS borradores (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  version_numero INTEGER,
  canal TEXT NOT NULL DEFAULT 'correo',
  asunto TEXT,
  cuerpo TEXT NOT NULL,
  evidencia_id INTEGER REFERENCES evidencias(id),
  origen TEXT NOT NULL DEFAULT 'plantilla',
  llamada_id INTEGER REFERENCES ia_llamadas(id),
  estado TEXT NOT NULL DEFAULT 'borrador',
  editado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS borradores_proyecto ON borradores(proyecto_id, empresa_id, id);
CREATE TABLE IF NOT EXISTS proyecto_pesos (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  clase TEXT NOT NULL,
  clave TEXT NOT NULL,
  peso REAL NOT NULL DEFAULT 0,
  muestras INTEGER NOT NULL DEFAULT 0,
  buenas INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  cambiado_por INTEGER REFERENCES usuarios(id),
  actualizado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proyecto_pesos_clave ON proyecto_pesos(proyecto_id, clase, clave);
CREATE TABLE IF NOT EXISTS preguntas (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  empresa_id INTEGER REFERENCES empresas(id),
  clave TEXT NOT NULL,
  texto TEXT,
  respuesta TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta',
  creada_en TEXT NOT NULL,
  respondida_por INTEGER REFERENCES usuarios(id),
  respondida_en TEXT
);
CREATE INDEX IF NOT EXISTS preguntas_proyecto ON preguntas(proyecto_id, estado, empresa_id);
```

*(rev. 1)* La migración 9 trae además la lista **«no contactar»**, con la misma forma que usará la fase 3 (que la reutiliza, no la duplica):

```sql
CREATE TABLE IF NOT EXISTS no_contactar (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER REFERENCES espacios(id),
  tipo TEXT NOT NULL,
  valor_huella TEXT NOT NULL,
  valor TEXT,
  motivo TEXT NOT NULL,
  conversacion_id INTEGER,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS no_contactar_huella ON no_contactar(valor_huella, tipo);
```

Son las mismas columnas de `diseno-fase3.md` M-A (allí esa tabla ya no se crea: se usa esta). `conversacion_id` va sin `REFERENCES` porque la tabla `conversaciones` nace en la fase 3. `espacio_id` vacío = vale para todo OPORTIA. `tipo`: correo, dominio, telefono, empresa. `motivo`: lo_pidio, lo_marque_yo, respondio_no (fase 3). En la ficha, botón **«No quiere que le escriban»**: desde ese momento no se prepara ningún mensaje para esa empresa en ese espacio y el botón Llamar pide confirmar. Nunca se quita sola.

`borradores.canal`: correo, whatsapp, llamada (guion). `borradores.estado`: borrador, editado, copiado, descartado. *(rev. 1)* La fase 3 **no** añade estados de envío aquí (aprobado, enviado…): lo enviado vive en su tabla `mensajes` (regla C19 de `diseno-fase3.md`). Solo añade **un** valor: `pasado_al_vendedor`, que marca el borrador que el vendedor tomó. `borradores.origen`: plantilla, ia, persona. `proyecto_pesos.clase`: sector, senal, zona, tamano.

### 4.6 Migración 10 «noticias_y_sugerencias» (parte 2g, versión 0.9.0)

```sql
CREATE TABLE IF NOT EXISTS noticias (
  id INTEGER PRIMARY KEY,
  fuente TEXT NOT NULL,
  url TEXT NOT NULL,
  huella TEXT NOT NULL,
  titulo TEXT NOT NULL,
  resumen TEXT,
  clase TEXT,
  publicada_en TEXT,
  licencia TEXT,
  leida_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS noticias_huella ON noticias(huella);
CREATE INDEX IF NOT EXISTS noticias_fecha ON noticias(publicada_en);
CREATE TABLE IF NOT EXISTS noticia_empresas (
  id INTEGER PRIMARY KEY,
  noticia_id INTEGER NOT NULL REFERENCES noticias(id),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  coincidencia TEXT NOT NULL DEFAULT 'nombre',
  creada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS noticia_empresas_empresa ON noticia_empresas(empresa_id, noticia_id);
CREATE TABLE IF NOT EXISTS proyecto_sugerencias (
  id INTEGER PRIMARY KEY,
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  clase TEXT NOT NULL,
  clave TEXT NOT NULL,
  cuantas INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  estado TEXT NOT NULL DEFAULT 'nueva',
  creada_en TEXT NOT NULL,
  decidida_por INTEGER REFERENCES usuarios(id),
  decidida_en TEXT
);
CREATE INDEX IF NOT EXISTS proyecto_sugerencias_proyecto ON proyecto_sugerencias(proyecto_id, estado);
```

De una noticia se guarda el titular, el enlace, la fecha y un resumen propio de 300 caracteres como máximo; nunca el texto completo. `noticias.clase`: apertura, expansion, inversion, contratacion, cierre, despidos, otra.

### 4.7 La base de referencia (`oportia-referencia.db`, fuera de las migraciones y de las copias)

```sql
-- PRAGMA user_version = 1
CREATE TABLE IF NOT EXISTS lugares (
  id INTEGER PRIMARY KEY,
  fuente TEXT NOT NULL, id_en_fuente TEXT NOT NULL, edicion TEXT NOT NULL,
  nombre TEXT NOT NULL, nombre_normal TEXT NOT NULL,
  sector TEXT, categoria TEXT,
  provincia TEXT, municipio TEXT, lat REAL, lon REAL, direccion TEXT,
  telefono TEXT, web TEXT, dominio TEXT, correo TEXT, redes TEXT,
  confianza REAL
);
CREATE INDEX IF NOT EXISTS lugares_busqueda ON lugares(sector, provincia, municipio);
CREATE INDEX IF NOT EXISTS lugares_origen ON lugares(fuente, id_en_fuente);
CREATE INDEX IF NOT EXISTS lugares_dominio ON lugares(dominio);
-- 2g: CREATE TABLE lugares_osm (… mismas columnas …)   -- aparte por su licencia ODbL
-- 2g: CREATE TABLE registro_rnc (rnc, razon_social, nombre_comercial, actividad, estado)  -- solo empresas, sin cédulas
```

*(rev. 1)* Una edición nueva se importa a un archivo con **nombre por edición** (`referencia-2026-10-21.db`). Cuando termina y pasa su `quick_check`, el nombre vigente se cambia en `fuentes_estado.edicion`; **no se renombra un archivo encima de otro**. La referencia va en `journal_mode=DELETE` (sin archivos `-wal` que se puedan mezclar) y cada consulta la abre en solo lectura, lee y cierra. La edición vieja se retira solo cuando la nueva está vigente y ninguna conexión la tiene abierta (es un archivo que se puede volver a bajar, no un dato del dueño). Prueba: importar mientras una pantalla consulta. Durante el cambio hay unos 120 MB dobles en disco. Las empresas ya promovidas a `oportia.db` no dependen de este archivo.

### 4.8 Volver atrás (el actualizador devuelve solo el CÓDIGO)

- Las migraciones 7 a 10 solo agregan: el código 0.5.1 abre una base 7+ sin problema (igual que 0.3.2 con la base 5, `diseno-1d.md` §16).
- 0.5.1 no conoce los tipos `proyecto.investigar` ni `fuentes.paquete`: `elegir` nunca los ofrece y esperan en «lista». Al volver la versión nueva, siguen desde su punto.
- 0.5.1 muestra los proyectos como «Aprobado · espera la fase 2»: cierto para ese código. No se pierde ninguna empresa guardada.
- `oportia-referencia.db` y `logos/` son archivos que el código viejo no abre.
- Ensayo obligatorio antes de publicar cada parte con migración: código de la versión anterior contra la base nueva, y de vuelta (como los ensayos `test/ensayo-0.3.2.mjs` y `0.4.1`).

---

## 5. El trabajo como tareas de la 1c

### 5.1 Tipos nuevos (`src/tareas/tipos.js`, `FASE_ACTUAL = 2`)

| Tipo | Cupo | Paso máx. | Repetible | Fallos | Para qué | Parte |
|---|---|---|---|---|---|---|
| `fuentes.paquete` | grande | 120 s | sí | 3 | Bajar, comprobar e importar un paquete a la referencia | 2a |
| `proyecto.investigar` | normal | 60 s | sí | 3 | La corrida de un proyecto: todas las etapas, paso a paso | 2a |
| `empresa.ubicar` | normal | 30 s | sí | 2 | «Ubicar mejor» una empresa al pulsar el botón (Nominatim) | 2d |
| `noticias.leer` | normal | 60 s | sí | 3 | Leer los titulares de las fuentes de noticias activas | 2g |

- Todos son `repetible: true`: **ninguno manda nada a un tercero**. Leer una página pública dos veces no hace daño (y el ritmo por sitio lo impide: 6.2). Todo lo que envía sigue siendo de la fase 3, con `repetible: false`.
- `fuentes.paquete` va en «grande» para no coincidir con `sistema.base` (4:10) ni `copias.hacer` (4:40): se programa a las 2:30 (hora de RD), el día 3 de cada mes, y solo trabaja si `paquetes.json` trae una edición que no está importada.
- `proyecto.investigar` usa el carril del proyecto y de la cuenta (`carrilesDe`): los turnos justos de la 1c reparten el tiempo entre proyectos y cuentas sin tocar nada.
- Una espera de cortesía (pausa entre páginas, tope de IA, fuente en pausa) se devuelve con `esperar(ms, clave)`: no cuenta como fallo y **suelta el turno**, así otro proyecto avanza mientras tanto.
- *(rev. 1; comprobado en el CÓDIGO)* `src/tareas/tiempo.js` línea 17 solo conoce `hora, diaria, semanal, mensual (día 1), manual`. Los horarios «día 3 de cada mes» y «cada 6 horas» de este diseño **no existen todavía**: la 2a-1 añade a `tiempo.js` la cadencia `cada_n_horas` y `mensual` con día, con sus pruebas de ranura (pieza delicada: revisión completa). La fase 3 no necesita otra cadencia: su lectura del buzón es una sola tarea por día que espera 5 minutos entre vueltas (`diseno-fase3.md` §11.1).
- *(rev. 1)* **La fila de tareas no debe crecer sin fin** (no hay ningún borrado de `tareas` ni de `tarea_eventos`, y todo entra en la copia de cada noche): `visitar` no anota un evento por cada paso de cortesía (se comprueba qué escribe `guardarPaso` y se deja un evento por web, no por página); `sistema.vigilar` avisa cuando `tareas` + `tarea_eventos` pasan de un tamaño; y se le pregunta al dueño si la bitácora técnica de tareas hechas hace más de 90 días puede resumirse (D23). Hasta su respuesta, no se quita nada.

### 5.2 Cuándo corre un proyecto

1. **Al aprobar una versión** (y el proyecto queda «en ejecución»): se encola una corrida con `claveUnica = proyecto:<id>@v<versión>` y origen `aprobacion`. Hoy `aprobarVersion` no encola nada: se añade dentro de su misma transacción.
2. **Por su frecuencia** (diaria, semanal, mensual): ya existe `programasDeProyectos`; empieza a devolver programas en cuanto `proyecto.investigar` está registrado y `FASE_ACTUAL` es 2.
3. **«Buscar ahora»** (botón): `POST /api/proyectos/:n/buscar` encola una corrida `a_mano`. Es la única vía para proyectos con frecuencia «manual» (hoy `programasDeProyectos` los salta, y está bien). Límite: 1 corrida viva por proyecto (ya lo garantiza `programa`) y 3 corridas a mano por día.
4. **Al instalar la 2a**: los proyectos comerciales que ya están «en ejecución» reciben **una** corrida (`arranque_fase2`), repartida con `horarioRepartido`. La pantalla les prometió «Cuando llegue, empezará sola con esta configuración»: se cumple. Va sin IA (sus versiones dicen `ia.permitida: false`).

Pausar el proyecto, mandarlo a la papelera o activar el modo seguro detiene la corrida en su siguiente paso (`ctx.senal` y una lectura del estado del proyecto al empezar cada paso). «Reanudar» sigue desde el punto guardado.

### 5.3 La corrida: etapas y punto guardado

`src/comercial/corrida.js` (manejador de `proyecto.investigar`). El punto es pequeño (≤ 16 KB, `MAXIMO_PUNTO`):

```js
{ corrida: 41, version: 3, etapa: 'visitar', cursor: 1207, lote: 0, contadores: { encontradas: 312, nuevas: 40, webs: 12 } }
```

| # | Etapa | Qué hace en cada paso | Necesita | Parte |
|---|---|---|---|---|
| 0 | `preparar` | Lee la versión aprobada, crea la fila en `proyecto_corridas`, revisa que las fuentes elegidas estén activas | — | 2a |
| 1 | `descubrir` | Consulta la referencia por sector y zona, 200 lugares por paso; quita excluidos y repetidos; promueve a `empresas`; enlaza en `proyecto_empresas` | referencia | 2a |
| 2 | `puntuar_rapido` | Nota preliminar con lo que ya se sabe (4 de los 8 criterios), 200 por paso | — | 2a |
| 3 | `visitar` | Para las N mejores con web (N = profundidad): una página por paso, con las pausas de cortesía | red | 2c |
| 4 | `extraer` | Convierte lo leído en hechos, contactos, redes y logo (va unido al paso de `visitar`: nunca queda HTML guardado) | — | 2c, 2d |
| 5 | `ubicar` | Punto, precisión y distancia al origen del proyecto | — | 2d |
| 6 | `senales` | Aplica las 40 reglas; crea evidencias `senal` e `hipotesis`; crea preguntas para el cliente | — | 2e |
| 7 | `puntuar` | Nota completa de 0 a 100 con desglose y seguridad | — | 2e |
| 8 | `con_ia` | Solo si la versión lo permite y hay tope: análisis y propuesta con IA para las M mejores | IA | 2f |
| 9 | `redactar` | Borrador de mensaje (plantilla, o IA si está permitida) para las que tienen una señal propia | — | 2e, 2f |
| 10 | `cerrar` | Cuenta, guarda el resumen, abre el aviso «N empresas nuevas», calcula sugerencias | — | 2a, 2g |

Reglas del manejador (las mismas de `manejadores.js`):
- Cada paso es corto y se puede repetir: si se va la luz, ese paso se rehace y no duplica nada (todo se escribe con «si no existe, crear; si existe, actualizar»).
- Lee con `ctx.db`; escribe solo con `ctx.escribir(() => …)`, sin esperas dentro, 200 filas como mucho.
- Entre escrituras largas, `await ctx.ceder()`.
- Una etapa que todavía no existe en la versión instalada se salta: la 2a hace 0, 1, 2 y 10; cada parte añade etapas **sin rehacer las anteriores**.
- Una etapa que falla para una empresa (su web no responde) anota el motivo en esa empresa y **sigue con la siguiente**: una empresa mala nunca tumba la corrida.

### 5.4 Límites por corrida y por proyecto (protegen el servidor y el plan de cada cuenta)

| Límite | prueba | pago | empresarial y administrador |
|---|---|---|---|
| Empresas guardadas por proyecto | 500 | 2,000 | 5,000 |
| Webs visitadas por corrida («profundidad») | 30 | 150 | 400 |
| Empresas con IA por corrida (si se permite) | 0 | 50 | 200 |
| Corridas «Buscar ahora» por día | 3 | 3 | 5 |

Viven en `src/cuentas/planes.js` junto a `LIMITE_POR_PLAN`. Al llegar a un tope, la corrida termina como `a_medias` con un texto claro: «Encontré 2,430 empresas; guardé las 2,000 con mejor nota. Estrecha la zona o el sector para ver el resto». Nunca se borra lo guardado.

Tiempos honestos (1 procesador, 1 web por minuto): 30 webs ≈ 30–40 minutos; 150 ≈ 3 horas; 400 ≈ 4–7 horas (lo que ya dice la visión, F53).

---

## 6. Las etapas, una por una (todo esto funciona SIN IA)

### 6.1 Descubrir (2a)

Entrada: la configuración aprobada (`sectores`, `sectoresLibres`, `sectoresExcluidos`, `zonas`, `zonasExcluidas`, `paisCompleto`, `tamanos`, `exclusiones`, `prioridades`).

1. **Sector → lugares.** El paquete ya trae la columna `sector` con una de las 37 claves de `SECTORES` (calculada fuera del servidor con la tabla `herramientas/overture-a-sector.json`, que se guarda también en el repositorio para poder revisarla). Los `sectoresLibres` (texto que el motor no reconoció) se buscan por palabras en `nombre_normal` y `categoria`. El sector `todas` consulta todo, con el tope de empresas del plan.
2. **Zona → lugares.** `zonas` trae claves de provincia, municipio, distrito o sector de ciudad. Provincia y municipio se consultan directo por columna. Para distritos y sectores de ciudad se usa su municipio y luego la distancia al centro del sector (archivo de coordenadas, 6.3) con un radio de 3 km. Las regiones se abren a sus provincias.
3. **Filtros.** Se saltan: excluidos (3.5), `sectoresExcluidos`, `zonasExcluidas`, lugares con confianza de existencia de la fuente menor de 0.5 (umbral ajustable), nombres vacíos, y los que el dueño descartó antes en este proyecto.
4. *(rev. 1)* **Puntuar sin promover.** La nota preliminar (criterios 1, 5, 6 y 7) se calcula leyendo la referencia, **sin crear nada** en `oportia.db`. El punto guardado lleva solo un montón acotado con los N mejores ids (N = tope de empresas del plan, 5.4).
4b. **Promover solo esos N.** Cada uno se busca en `empresas` (4.3). Si no está, se crea con **una** evidencia `dato` (4.2) y su fila en `empresa_fuentes`. Si está, se actualiza `ultima_vez`. Así un proyecto de «todo el país» no mete 90,000 fichas en la base que se copia cada noche.
5. **Enlazar.** `proyecto_empresas`: si no existe el par, se crea como `nueva`.

Es un paso por cada 200 lugares; el cursor es el `id` de la referencia. Una corrida típica (un sector en una provincia: de 50 a 1,500 lugares) termina esta etapa en segundos.

**Antes de aprobar** (F15, llega en la 2b): la pantalla del proyecto pendiente muestra «Hay unas 312 empresas así en los datos abiertos». Es una cuenta de solo lectura sobre la referencia (`GET /api/proyectos/:n/estimado`), sin crear nada. Si la cuenta es 0, lo dice y sugiere ampliar la zona.

*(rev. 1)* **Qué tan a menudo hay novedades, dicho con verdad.** La lista abierta de negocios cambia cada 1 a 3 meses y las webs se releen cada 30 días: una corrida diaria casi nunca trae «empresas nuevas». `descubrir` se salta sola si no cambió ni la edición de la referencia ni la versión del proyecto. La pantalla lo dice: «La lista de negocios se renueva cada 1 a 3 meses; entre medias OPORTIA vigila cambios en sus webs». En la fase 2, la pantalla recomienda **semanal o mensual** para proyectos de clientes; «diaria» no se quita (sirve con noticias, 2g) pero se explica.

### 6.2 Visitar la web, con educación (2c)

**Una puerta nueva a la red: `src/web/salir.js`.** Hoy `src/ia/llamar.js` es la única llamada a la red: solo va a un host fijo por proveedor y nunca sigue redirecciones. El lector necesita otra cosa (cualquier host público, redirecciones revisadas, dirección fijada). Por eso es un archivo aparte, el **único** que puede abrir conexiones a la web abierta, y `test/reglas.test.js` pasa de «una puerta» a «dos puertas, cada una con sus reglas» (ver «Conflictos»).

Protección contra pedidos hacia adentro (SSRF). El servidor vive en una red privada de Tailscale, así que esto es obligatorio desde el primer día:
- Solo `http:` y `https:`, puertos 80 y 443, sin usuario ni contraseña en la dirección.
- Se resuelve el nombre **una vez**, se rechazan todas las direcciones privadas o especiales (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 incluido 169.254.169.254, 100.64/10 de Tailscale, 0/8, multidifusión, `::1`, `fc00::/7`, `fe80::/10`, `fd7a:115c:a1e0::/48`, IPv4 dentro de IPv6) y se conecta **a esa misma dirección** (opción `lookup` de `node:https`), para que el nombre no pueda cambiar entre la revisión y la conexión. *(rev. 1; comprobado en el CÓDIGO)* Hoy `test/reglas.test.js` (líneas 205-210) prohíbe que el trabajador cargue `node:http`, `node:https` o `node:net`. La prueba cambia a: «el trabajador solo carga `node:https` **a través de `src/web/salir.js`**» (excepción única en el grafo de imports) y sigue sin cargar `node:http` como servidor ni `src/api/`. Con `fetch` no se puede fijar la dirección sin dependencias: por eso `node:https`.
- Redirecciones a mano, máximo 5, revisando cada salto otra vez. Un salto a otro dominio se anota y solo se sigue si es el mismo sitio (con o sin `www`).
- Nunca manda cookies, claves ni cabeceras de identidad. Nunca hace `POST`.
- Corta a los 20 s por pedido y a los 400 KB por página (lee por trozos y aborta).
- En modo de prueba solo acepta `http://127.0.0.1:<puerto>` (el «sitio falso» de las pruebas), igual que `llamar.js`.
- *(rev. 1)* **Cuatro defensas que faltaban**, cada una con su caso en `salir.test.js`: (a) **compresión**: se pide `Accept-Encoding: identity`; si aun así llega comprimido, se descomprime con `node:zlib` en flujo y el corte de 400 KB se aplica a los bytes **ya descomprimidos** (una página bomba no puede llenar los 64 MB del trabajador); (b) **letras**: se decodifica con `TextDecoder` según la cabecera o el `<meta>` (utf-8 por defecto; windows-1252 o ISO-8859-1 si se declara), para que «Peña» no llegue rota a una ficha ni a un mensaje; (c) **certificado vencido o inválido**: se anota la señal (regla W04) y **no se lee** el contenido; nunca se apaga la verificación; (d) **IPv6**: `dns.lookup` con `all: true`, se validan **todas** las direcciones y se prefiere IPv4 (el servidor puede no tener salida IPv6).
- *(rev. 1)* **Freno global del lector:** si en 24 horas más de N sitios distintos responden 403 o 429 (N inicial: 10), el lector se pausa solo y avisa. Una queja al proveedor del servidor podría tumbar todo OPORTIA: mejor parar antes. Las dos primeras semanas de la 2c-2 la profundidad es 30 webs por corrida para todos los planes, y se mide.

Identidad honesta: `User-Agent: OportiaBot/1.0 (+<dirección de la página del lector>)`. *(rev. 1)* Esa dirección es **siempre** la página del repositorio público de GitHub; **nunca** la dirección `ts.net` del servidor (revelaría la puerta de entrada de la app a cada web visitada; prueba en `reglas.test.js`). La página explica en español sencillo qué es, qué lee, cómo pedir que no se lea un sitio y trae el botón «Abrir un pedido» como contacto real (obligatorio antes de leer la primera web). Nunca se disfraza de navegador. Si un sitio responde 403 o pide un captcha, se anota «bloqueó la lectura automática» y **no se insiste**.

robots.txt (`src/web/robots.js`, intérprete propio de unas 80 líneas):

| Caso | Qué hace OPORTIA |
|---|---|
| 200 | Aplica el grupo `oportiabot`; si no hay, el de `*`. Gana la regla más larga. Entiende `*` y `$`. Lee como máximo 500 KB |
| 4xx (menos 429) | No hay reglas: se puede leer, con el presupuesto normal |
| 5xx, 429 o no se pudo conectar | Hoy **no** se lee ese sitio; reintento en 24 h (un solo reintento) |
| `Disallow: /` | `web_estado = 'no_quiere'`; nunca se prueba «a ver si igual funciona» |
| `Crawl-delay` | Se respeta si es mayor que 5 s; si pide más de 30 s, el sitio se deja para otro día |
| Redirección de robots.txt | Hasta 5 saltos |
| Caché | 24 horas en `web_sitios.robots_reglas` |

Presupuesto por sitio:

| Parámetro | Valor |
|---|---|
| Pedidos a la vez en todo el servidor | 1 |
| Pausa entre pedidos al mismo sitio | ≥ 5 s (o su `Crawl-delay`) |
| Páginas por sitio | máximo 8: robots.txt, inicio, mapa del sitio (solo los primeros 400 KB), contacto, nosotros, servicios o productos, empleo, 1 libre |
| Tiempo total por sitio | 90 s de trabajo real |
| Relectura | no antes de 30 días, salvo «Leer de nuevo» en la ficha (máximo 1 vez por día por empresa) |
| 429, 503 o `Retry-After` | Parar ese sitio y esperar lo que diga (máximo 24 h); luego una sola vez más |
| Nunca | iniciar sesión, enviar formularios, ejecutar JavaScript, pasar captchas, leer rutas prohibidas, `/admin`, `/wp-admin`, carritos, buscadores internos |

Cómo encaja con los pasos de la tarea: **cada paso de `visitar` pide una sola página** y devuelve `{ punto, esperarMs: 5000, motivo: 'cortesia_web' }`. Así un paso nunca pasa de 60 s, el turno se suelta entre páginas y, si hay dos proyectos, se alternan. El ritmo por sitio vive en `web_sitios.proxima_en` (en la base, no en memoria): aunque dos proyectos quieran el mismo dominio o el trabajador se reinicie, la pausa se respeta. Si el sitio se leyó hace menos de 30 días para otro proyecto, **se reutiliza** lo leído (los hechos públicos son del catálogo común) y no se visita.

Qué páginas elegir: de los enlaces del inicio y del mapa del sitio, por palabras en la ruta o en el texto del enlace (`contact`, `contacto`, `nosotros`, `about`, `quienes-somos`, `servicios`, `productos`, `menu`, `catalogo`, `empleo`, `vacantes`, `trabaja`, `sucursales`).

Webs hechas con JavaScript: si el texto visible tiene menos de 300 caracteres y aparecen marcas conocidas (`id="root"`, `__NEXT_DATA__`, `ng-app`, `data-reactroot`), se marca `parcial_js`, seguridad Baja, y la ficha lo dice: «Esta web se lee incompleta».

### 6.3 Extraer, contactos, logo y ubicación (2c y 2d)

`src/web/extraer.js`: funciones puras sobre el texto de **una** página. Sin árbol DOM: un tokenizador pequeño para `<title>`, `<meta>`, `<link>`, `<a href>`, `<script type="application/ld+json">` y el texto visible (sin `<script>` ni `<style>`), cortado a 60 KB. El HTML se suelta al terminar el paso.

| Dato | De dónde | Regla |
|---|---|---|
| Qué hace | título, descripción, `og:description`, JSON-LD, H1 y H2 del inicio | ≤ 300 caracteres; evidencia `hecho` con su dirección |
| Productos o servicios | menús y encabezados de «servicios» o «productos»; JSON-LD | ≤ 15 nombres; sin copiar listas de precios |
| Correo | `mailto:` y texto de la página de contacto | **Solo** prefijos generales (`info`, `ventas`, `contacto`, `hola`, `comercial`, `reservas`, `servicio`, `clientes`, `soporte`, `gerencia`, `administracion`) en el dominio propio. Nunca Gmail, Hotmail, Outlook, Yahoo, iCloud ni correos con forma de nombre de persona. Un correo ocultado por la web no se descifra |
| Teléfono | `tel:`, JSON-LD, texto con 809, 829 u 849 | Normalizado a `+1809…`; solo los de la propia web |
| WhatsApp | enlaces `wa.me/…` y `api.whatsapp.com/send` | Solo el enlace, como botón que pulsa el dueño |
| Redes | enlaces a Facebook, Instagram, TikTok, X, LinkedIn y YouTube; JSON-LD `sameAs` | Solo el enlace. Nunca se visitan |
| Dirección y punto | JSON-LD `address` y `geo`; `<address>`; coordenadas escritas en un enlace de mapa (sin abrir el mapa) | La provincia y el municipio se reconocen con `lugaresDeTexto()` del motor |
| Señales técnicas | https, certificado, `viewport`, año del pie, `generator`, maquetado viejo, carrito, plataformas de reservas, formularios, PDF | Alimentan las reglas (6.4) |
| Empleo | «trabaja con nosotros», «vacantes», JSON-LD `JobPosting` | Señal de crecimiento |

Solo se toma el teléfono o el correo que la **empresa** publica para que la contacten. No se guardan nombres de personas, cargos ni fotos de personas.

**Logo o foto (2d).** `src/web/logo.js`:
1. *(rev. 1)* Candidatas en orden: `link rel=icon` con `sizes` de 128 o más, iconos del `manifest.json` de la web (192 px, casi siempre de 5 a 30 KB), `apple-touch-icon`, JSON-LD `logo`, `/favicon.ico`. **`og:image` no se usa por defecto**: suele ser una foto grande y muchas veces con personas (no se guardan fotos de personas); queda como «foto del sitio», apagada (D20).
2. Se baja **una** imagen por empresa, solo si pesa ≤ 80 KB (se corta al pasar). Si la primera es más grande, se prueba la siguiente. **No se reduce de tamaño**: el servidor no tiene librería de imágenes; se muestra reducida por la pantalla. Solo se bajan logos de empresas guardadas o entre las 200 mejores del proyecto. Se sirve con `Cache-Control: private` de larga duración.
3. Se valida por sus primeros bytes: PNG, JPEG, WebP, GIF o ICO. **SVG se descarta** (puede traer programas dentro).
4. Se guarda en `<carpetaDatos>/logos/<id>.<ext>`; en la base quedan `logo_archivo`, `logo_origen` (la dirección) y `logo_bytes`.
5. Se sirve desde OPORTIA (`GET /api/empresas/:id/logo`, con sesión, `Content-Type` fijo por tipo validado, `X-Content-Type-Options: nosniff`). La política actual `img-src 'self' data:` ya lo permite y **no se abre a ningún host de fuera**: el teléfono de Junior nunca pide nada a la web de la empresa.
6. Sin imagen: tarjeta con la inicial, un color estable por empresa y el icono del sector.
7. La ficha dice «Imagen: sitio web de la empresa», con su enlace. El logo se usa solo para reconocer a la empresa dentro de OPORTIA; nunca en mensajes ni propuestas.
8. Tope total de la carpeta: 300 MB. Al llegar, no se bajan más y se abre un aviso (no se borra ninguna).

**Ubicación y distancia (2d).** `src/motor/lugares.js` tiene nombres pero no coordenadas. Se añade `src/motor/lugares-coordenadas.json` (unos 20 KB): un punto central por provincia, municipio, distrito y sector de ciudad, armado fuera del servidor con datos abiertos y revisado a mano (con su atribución en «Acerca de»).

| Orden | De dónde sale el punto | Precisión que se muestra |
|---|---|---|
| 1 | El punto de la fuente abierta | «exacta» |
| 2 | `geo` de la propia web, o coordenadas en su enlace de mapa | «de su web» |
| 3 | Centro del sector o municipio reconocido en su dirección | «de la zona (aprox.)» |
| 4 | Botón «Ubicar mejor» (Nominatim, apagado por defecto) | «buscada» |

- **Origen del proyecto:** campo nuevo `origen` en la configuración (esquema 4): una zona elegida en el mapa. Si no se elige, es la primera zona del proyecto.
- **Distancia:** fórmula de Haversine, en línea recta: «a unos 12 km (en línea recta)». Nunca minutos de manejo.
- **«Cómo llegar»:** un enlace `geo:` y uno a OpenStreetMap que abre el teléfono del dueño. OPORTIA no pide nada a ningún servicio de mapas.

### 6.4 Señales → necesidad → oferta: las 40 reglas (2e)

`src/comercial/reglas.js`: una lista de datos. Cada regla:

```js
{ id: 'R01', grupo: 'reservas', sectores: ['clinicas', 'odontologia', 'belleza', 'restaurantes', 'hoteles', 'gimnasios', 'talleres', 'veterinarias'],
  si: h => h.web.leida && !h.web.reservas && (h.contacto.telefono || h.contacto.whatsapp),   // función pura sobre los hechos
  productos: ['reservas', 'citas'], confianza: 'media', necesita: ['web_leida'],
  frase: 'regla.R01.frase',        // «No encontramos reservas en línea en las páginas leídas; piden cita por teléfono.»
  pregunta: 'regla.R01.pregunta',  // «¿Cómo agendan hoy las citas?»
  puntos: 14 }
```

Las frases siempre dicen «no encontramos…» o «en las páginas leídas…», nunca «no tiene». Cada señal crea una evidencia `senal` (lo observado, con su dirección) y una `hipotesis` (necesidad y oferta), y, si la regla trae pregunta, una fila en `preguntas`.

| Id | Señal observada | Sugiere |
|---|---|---|
| W01 | Sin web propia en ninguna fuente | Página web |
| W02 | Su «web» es una página de Facebook o Instagram | Página web |
| W03 | Constructor gratis o subdominio gratuito | Página web |
| W04 | Sin https o certificado vencido | Página web, seguridad |
| W05 | No se adapta al teléfono (sin `viewport`) | Página web |
| W06 | Año del pie con 3 años o más de atraso | Página web |
| W07 | Maquetado antiguo (tablas, `<font>`, Flash) | Página web |
| W08 | Sistema de la web muy viejo (`generator`) | Página web, seguridad |
| W09 | El dominio no responde o está vencido | Página web |
| W10 | La web no muestra un correo del propio dominio | Correo de empresa, página web |
| R01 | Sector de citas sin reservas en línea | Reservas, citas |
| R02 | «Llame para reservar» o «cita por WhatsApp» | Reservas, citas |
| R03 | Hotel sin reservas propias (solo enlaces a terceros) | Reservas |
| R04 | Restaurante sin menú ni pedidos en línea | Página web, reservas |
| C01 | Catálogo de productos sin carrito | Tienda en línea |
| C02 | Vende por WhatsApp o Instagram | Tienda en línea |
| C03 | «Llame para precio» o «consulte precio» | Tienda en línea, inventario |
| C04 | Catálogo solo en PDF | Tienda en línea, software |
| G01 | Sector con existencias y 2 sucursales o más | Inventario |
| G02 | «Consulte disponibilidad» | Inventario |
| G03 | 3 sucursales o más | Software, inventario, facturación |
| G04 | Formularios en PDF: «descargue y envíe» | Software, automatización |
| G05 | Vende al Estado (lista de proveedores) | Facturación, software |
| G06 | Cotización solo por teléfono o correo | Software, automatización |
| A01 | Página «trabaja con nosotros» o vacantes | Está creciendo |
| A02 | Busca personal administrativo | Software, automatización |
| A03 | Noticia de apertura, sucursal o inversión | Está creciendo |
| A04 | «Próximamente» o «nueva sucursal» en su web | Está creciendo |
| A05 | Su web cambió desde la última lectura | Empresa activa |
| A06 | Noticia de cierre o despidos | Resta puntos |
| E01 | Sector de alto consumo de luz (hotel, supermercado, frío, panadería, lavandería, fábrica, clínica) | Paneles solares |
| E02 | Menciona planta eléctrica, generador o apagones | Paneles, plantas e inversores |
| E03 | Menciona ahorro de energía o sostenibilidad | Paneles solares |
| E04 | Varias sucursales con refrigeración o aire | Paneles, climatización |
| M01 | No enlaza ninguna red social | Marketing |
| M02 | Solo teléfono: sin WhatsApp ni formulario | Automatización |
| M03 | Reseñas pegadas hablan de esperas o mala atención | Reservas, automatización |
| M04 | Sector turismo con web en un solo idioma | Página web, marketing |
| X01 | Regla general: el sector y el tamaño encajan con el producto | El producto del proyecto (seguridad Baja) |
| X02 | Varias sedes sin https o sin correo propio | Seguridad, redes |

Honestidad (lo que ya advierte la visión, F24): sin IA, casi todo sale de estas reglas. Para paneles solares y para productos que no están en la tabla, la web casi nunca da la respuesta: la ficha muestra la **pregunta para el cliente** («¿Cuánto pagan de luz al mes?») en lugar de inventar.

Las reglas son datos: añadir o afinar una es cambiar una línea y su prueba. Cada proyecto puede apagar una regla desde «Lo aprendido» (6.10).

**Reglas de «no encontramos X»** *(rev. 1)*. Varias reglas (R01, R04, C01, W10, M01…) se disparan por **no** encontrar algo en un máximo de 8 páginas. Para no mostrar ni escribir un dato falso como hecho:
- Una regla de ausencia solo vale como **señal** si la web quedó `leida` completa y se leyó la página que toca (por ejemplo, la de contacto o servicios). Con web `parcial_js`, bloqueada, caída o leída a medias, genera una **pregunta para el cliente**, no una señal, y no suma puntos.
- Todo mensaje basado en una ausencia se redacta **como pregunta** («¿Sus clientes pueden reservar en línea?»), nunca como afirmación («vi que no tienen…»). Prueba en `mensajes.test.js`.
- El **sector** sale de una tabla de unas 2,000 categorías armada fuera del servidor: la ficha muestra la categoría de origen y un botón «Sector equivocado» que lo corrige en ese proyecto y alimenta la tabla para la próxima edición.

### 6.5 Nota de 0 a 100 (2a parcial, 2e completa)

`src/comercial/puntuar.js`, función pura `puntuar(hechos, config, pesos) → { nota, desglose[8], seguridad, falta[] }`.

| # | Criterio | Máx. | Cómo se calcula | En 2a |
|---|---|---|---|---|
| 1 | Encaje con lo que vendes | 20 | El sector está entre los buenos para el producto (tabla producto × sector); sector pedido expresamente = máximo | sí |
| 2 | Necesidad detectada | 25 | Suma de `puntos` de las señales vigentes que apuntan al producto del proyecto, con tope; 0 si no hay evidencia | — |
| 3 | Actividad y señales de compra | 15 | Web viva y cambiada, vacantes, noticias de crecimiento; resta por cierre | — |
| 4 | Tamaño y capacidad | 10 | Sucursales contadas (`grupo`), lo que diga su web; **si se activan** (D15): tamaño (MICM) y vende al Estado; encaja con `tamanos` del proyecto. *(rev. 1)* Con las fuentes del Estado apagadas, el máximo real de este criterio es unos 5 puntos y se muestra «por confirmar», no como cero | — |
| 5 | Se puede contactar | 10 | Correo general 5, teléfono 3, WhatsApp 2 | sí |
| 6 | Zona y distancia | 8 | Dentro de la zona pedida = 5; cercanía al origen hasta 3 | sí |
| 7 | Calidad de los datos | 7 | Número de fuentes que coinciden, frescura, confianza de la fuente | sí |
| 8 | Tus prioridades y lo aprendido | 5 | Coincide con `prioridades` del proyecto; ajuste de `proyecto_pesos` | — |
| | **Total** | **100** | | 45 posibles |

- En la 2a la pantalla dice **«Nota preliminar»** y muestra los criterios que faltan como «por analizar» (no como cero). La nota preliminar se escala a 100 para ordenar, y siempre lleva seguridad Baja o Media.
- **Seguridad** *(rev. 1: definición que no depende de fuentes que quizá nunca se enciendan)*: Alta = la web propia se leyó completa, coincide con la lista abierta en nombre y en teléfono o lugar (eso son 2 fuentes), hay al menos una señal con evidencia de menos de 90 días **y** el dueño confirmó un dato (respondió una pregunta o marcó un resultado) o hay una tercera fuente activa. Con las opciones seguras y sin que el dueño confirme nada, el tope real es **Media**, y la pantalla lo dice. Media = una fuente más la web leída, o dos fuentes sin web. Baja = una sola fuente abierta sin web, web `parcial_js`, o datos de más de 12 meses.
- `desglose` guarda, por criterio: puntos, máximo y hasta 3 motivos con el `id` de su evidencia. La ficha lo muestra como 8 barras; al tocar una, se ven los motivos con su enlace.
- `falta[]`: lo que subiría la seguridad («leer su web», «saber cuántas sucursales tiene»). Sale en la ficha como «Qué falta confirmar».
- Productos fuera de la tabla (F1): criterio 1 usa una tabla general por tipo de producto (para empresas, para negocios con local, para todos) con seguridad Baja, y lo dice.

### 6.6 Propuesta y mensaje en borrador (2e; con IA en 2f)

**Propuesta** (`proyecto_empresas.propuesta`, JSON): responde seis preguntas, siempre con la etiqueta «Hipótesis»:
1. ¿Qué vimos? (las señales, con sus enlaces)
2. ¿Qué puede necesitar?
3. ¿Qué ofrecerle? (el producto del proyecto que encaja)
4. ¿Por qué ahora? (crecimiento, noticia, cambio)
5. ¿Qué falta confirmar? (las preguntas para el cliente)
6. ¿Cómo empezar la conversación? (primera frase)

Sin IA sale de plantillas por familia de producto (web, reservas, tienda, inventario, software, energía, general), rellenadas con los hechos. Las seis preguntas son una propuesta de este diseño (ver «Conflictos»).

**Mensaje** (`borradores`):
- Solo se prepara si hay **una señal propia de esa empresa** (regla de la visión, F29). Sin señal: «Todavía no hay nada concreto que decirle: mejor llama y pregunta», con el guion de llamada.
- Plantillas en español sencillo, cortas (máximo 90 palabras), sin jerga, que nombran la señal: «Vi que en su página las citas se piden por teléfono…».
- *(rev. 1)* **Qué salida se prepara depende de la base legal de esa empresa** (función pura en `src/paises/rd/reglas.js`, con prueba):

| Situación de la empresa | Qué se prepara | Botones |
|---|---|---|
| **Sin base** (no te conoce): el caso normal de una empresa encontrada | Solo **guion de llamada** | **Llamar** (`tel:`), Copiar el guion. El teléfono, el WhatsApp y el correo se ven como dato, con su etiqueta «sin confirmar», pero sin texto preparado |
| **Con base**: te escribió primero, te dio permiso (lo anotas con un toque y una nota de cómo), o ya es cliente | Guion, texto para correo y texto para WhatsApp | Llamar, Copiar, **WhatsApp** (abre `wa.me` con el texto; lo envías tú) |
| En «no contactar» (4.5) o excluida | Nada | Ninguno |

- El texto para correo, cuando existe, ya trae lo que la fase 3 exige: asunto que empieza por «Publicidad» si es comercial, quién escribe y de parte de quién, y «Responda NO y no le escribo más». Las reglas viven en `src/paises/rd`.
- **Interruptor «Un abogado lo confirmó»** (Administrador, apagado; D19): solo al encenderlo aparecen los textos de correo y WhatsApp para empresas **sin base**, con tope visible de primeros contactos por WhatsApp («3 de 5 hoy»), un primer mensaje corto que **pide permiso** («¿Le puedo enviar una idea para…?») y el aviso: «WhatsApp puede restringir tu número si varias personas te reportan. Mejor un segundo número con WhatsApp Business» (D22).
- Esto **debilita** el añadido de la visión F28 («botones Llamar y WhatsApp que envías tú») mientras el interruptor esté apagado: está declarado en C16 y se le pregunta al dueño (D19). No se aplica en silencio.
- OPORTIA no envía nada en la fase 2; **lo que envíes tú es tu responsabilidad** y la pantalla lo dice así.
- El borrador se puede editar; queda la versión editada (`estado = 'editado'`) y la fila original no se borra.

### 6.7 Lo que pegas tú y «preguntarle al cliente» (2e)

- **«Lo que vi en sus redes»** y **«Pegar reseñas»**: dos cuadros en la ficha. El texto se guarda como evidencia `pegado` (etiqueta `opinion`), **privada del proyecto**, marcada «dato pegado por ti». Antes de guardar, se quitan teléfonos, correos y lo que parezca nombre de persona seguido de dos puntos (firma de comentario).
- Sin IA: reglas de palabras sobre lo pegado (espera, demora, no contestan, reservar, precio) alimentan M03.
- Con IA (2f): resumen de 3 líneas: cómo habla la empresa, qué ofrece y qué puede necesitar.
- *(rev. 1)* **«Cómo habla» sin pegar nada:** del texto de su **propia web** se sacan, sin IA, tres rasgos simples (trata de «tú» o de «usted»; frases cortas o largas; palabras técnicas o sencillas) y se muestran como una línea con la etiqueta Señal. Con IA (2f), `analizar_empresa` devuelve además `como_habla`: una frase con su cita. Lo de sus **redes sociales** sigue dependiendo de lo que el dueño pegue: OPORTIA no las lee.
- *(rev. 1)* Lo pegado se limpia siempre antes de guardar y antes de ir a la IA (nombres, teléfonos, correos personales); la fase 3 usa la misma función para lo que pega el dueño en una conversación.
- **Preguntas para el cliente** (`preguntas`): cuando una regla necesita un dato que no se puede saber desde fuera, la ficha lo muestra en una lista corta. El dueño puede escribir la respuesta después de hablar con el cliente; esa respuesta entra como evidencia `hecho` con origen `persona` y la nota se recalcula.
- Es la base del «vendedor» de la fase 3: sabrá qué preguntar en vez de inventar.

### 6.8 Noticias (2g)

- `noticias.leer` (cada 6 horas; cadencia nueva `cada_n_horas`, ver 5.1): lee los titulares recientes de cada fuente de noticias activa (por su RSS o su mapa de noticias, según lo que cada periódico publique y permita), con el mismo lector cortés y su robots.txt.
- De cada noticia: titular, enlace, fecha y resumen propio de 300 caracteres como máximo.
- Clasificación por palabras: apertura, sucursal, expansión, inversión, contrata, cierre, despidos.
- Enlace con empresas: el nombre normalizado de una empresa del catálogo (3 palabras o más, o nombre poco común) aparece en el titular o el resumen. Si hay duda, la evidencia es `baja` y dice «podría tratarse de esta empresa». *(rev. 1)* Una noticia con confianza baja **nunca mueve la nota ni entra en un mensaje** hasta que el dueño toque «Sí, es esta empresa» (un cierre o unos despidos atribuidos al negocio equivocado harían daño). Las noticias **no pasan por la IA** en la fase 2: queda solo titular, enlace y resumen propio (límite frente a F8, declarado en C20).
- Solo Diario Libre figura como confirmado en la visión (F19). Cada periódico entra como fuente aparte, apagada hasta probarla desde el servidor y leer sus términos.
- Honesto: la mayoría de los negocios pequeños nunca sale en la prensa.

### 6.9 Sugerencias: oportunidades que no pediste (2g)

Al cerrar cada corrida, `src/comercial/sugerir.js` cuenta en la referencia:
- **Sectores parecidos:** otros sectores con buen encaje para el mismo producto (tabla producto × sector) que tienen 20 lugares o más en las zonas del proyecto.
- **Zonas vecinas:** provincias o municipios que limitan con los elegidos y tienen 20 lugares o más del mismo sector.
- **Con lo aprendido:** «Las clínicas te responden más que los hoteles (7 de 12 contra 1 de 9)».

Salen como tarjetas en el proyecto: «Hay 86 consultorios dentales en Santiago. ¿Los añado?». **Añadir** crea una versión nueva que espera aprobación; **No, gracias** la guarda como descartada y no vuelve a salir. El informe de estrategia completo sigue sin fase, como dice la visión (F26).

### 6.10 Aprender de tus resultados (2e)

- En cada ficha, tres botones: **Interesado**, **No le interesa**, **Vendido** (y «Sin respuesta»). Se guardan en `proyecto_empresas.resultado`.
- `src/comercial/aprender.js`: por proyecto, para cada sector, señal, zona y tamaño, cuenta marcas buenas y totales. El peso es la diferencia con la media del proyecto, suavizada (como si hubiera 10 marcas neutras) y limitada a ±5 puntos (criterio 8).
- **No mueve nada con menos de 20 marcas** en el proyecto. Con menos de 10 marcas en una clave, la pantalla dice «todavía es poco para estar seguro».
- Pestaña «Lo aprendido»: frases simples («Las ferreterías te han respondido mejor»), con un interruptor para apagar cada una, *(rev. 1)* dos botones **«Pesa más» / «Pesa menos»** para corregirla a mano (queda anotado quién y cuándo en `cambiado_por`; se mantiene dentro de ±5 puntos) y un botón «Empezar de cero» (pone `activo = 0`; no borra las marcas).
- Copiar lo aprendido a otro proyecto: botón con confirmación (F14: nada pasa entre proyectos si no lo copias).

---

## 7. Qué añade la IA (2f) y cómo se controla

### 7.1 Regla de siempre

El motor propio corre **primero y completo**. La IA solo mejora, nunca es necesaria, y si no está (apagada, sin tope, sin saldo, caída) la corrida termina igual. Es el contrato de `diseno-1d.md` §13, sin cambios.

### 7.2 Los cinco candados (todos deben estar abiertos)

1. El dueño encendió la IA y puso un tope general mayor que cero (`ajustes['ia.config']`).
2. Interruptor nuevo del dueño: «IA en el trabajo de los proyectos» (`analisisProyectos`, apagado por defecto), igual que existe `ayudaProyectos`.
3. La cuenta tiene tope de plan mayor que cero y es de confianza (`cuentas_confianza`).
4. **La versión aprobada del proyecto** dice `ia: { permitida: true, topeMensualUsd: X }` (`iaDeVersionActiva`). Hoy `limpiarConfiguracion` pone fijo «no permitida, tope 0»: en el esquema 4 la persona puede pedirlo, y eso crea una versión nueva que **hay que aprobar** viendo el costo estimado.
5. Queda dinero en los tres topes (general, cuenta, proyecto) para la reserva de esa llamada.

### 7.3 Propósitos nuevos (`src/ia/propositos.js`, todos `fase: 2`, `ambito: 'proyecto'`, `cuentaProyecto: true`, `alFaltar: 'motor_propio'`, `ajuste: 'analisisProyectos'`)

| Propósito | Entrada máx. | Salida máx. | Tope por llamada | Qué hace |
|---|---|---|---|---|
| `analizar_empresa` | 16,000 bytes | 700 tokens | US$0.003 | Lee el texto de la web (hasta 8 KB) y los hechos; devuelve qué hace, `como_habla` (una frase con cita; rev. 1), hasta 4 necesidades con **cita textual**, las 6 respuestas de la propuesta y hasta 3 preguntas |
| `redactar_mensaje` | 8,000 bytes | 500 tokens | US$0.002 | Mensaje a la medida a partir de la señal y la propuesta, en el tono pedido |
| `resumir_pegado` | 12,000 bytes | 400 tokens | US$0.002 | Resume lo pegado de redes o reseñas: cómo habla, qué ofrece, qué puede necesitar |

Costo estimado con Claude Haiku 5.5 (US$0.10 por millón de tokens de entrada y US$0.50 de salida, según `src/ia/precios.json`, revisado el 2026-11-05): unos 4,000 tokens de entrada y 600 de salida por empresa ≈ US$0.0007; con el 30 % de margen por el español, **cerca de US$0.001 por empresa**. Con mensaje incluido: **entre US$1.50 y US$2 por cada 1,000 empresas**, que coincide con la visión (F8). El tope inicial de US$5 al mes alcanza para unas 2,500 empresas entre todos.

Antes de aprobar, la pantalla muestra el costo estimado de esa versión: «Hasta 50 empresas con IA por corrida, semanal: unos US$0.40 al mes».

### 7.4 Seguridad de lo que entra y sale

- El texto de una web es **dato**, no instrucción: va dentro del bloque JSON escapado (regla de la 1d). Una web que diga «ignora tus instrucciones» no cambia nada.
- La respuesta se valida contra un esquema y contra los catálogos (productos, sectores, claves de regla).
- **Cada necesidad que diga la IA debe traer una cita que exista de verdad** en el texto enviado (se comprueba por búsqueda de texto). Sin cita real, se descarta. Así la IA no inventa señales.
- Lo que aporta la IA entra como evidencia con `origen = 'ia'`, etiqueta `hipotesis`, confianza máxima `media`, y con su `llamada_id`. La nota se recalcula con las **mismas** reglas: la IA nunca escribe la nota.
- La IA no decide capacidades, autonomía, frecuencia ni aprobaciones, y no envía nada.
- A la IA se le manda solo información pública de la empresa. De lo pegado por el dueño se quitan antes nombres, teléfonos y correos.
- Una llamada por empresa y por paso: `paso: 'empresa:<id>'`. Repetir el paso tras un reinicio no paga dos veces (ya lo garantiza `src/ia/cliente.js`).
- *(rev. 1)* **No pagar dos veces entre corridas:** clave de memoria = empresa + huella de su web + versión del proyecto + versión de las instrucciones. Si nada de eso cambió, se reutiliza la evidencia guardada y **no se llama** a la IA. Un proyecto semanal de 50 empresas paga una vez, no cuatro al mes.
- *(rev. 1)* **Una cita que existe no prueba que sea verdad.** Una web puede contener justo el texto que quiere que se repita. Por eso: (1) todo lo que escribe la IA se guarda con `origen = 'ia'`, sin direcciones web, correos ni teléfonos (se quitan), cortado a 300 caracteres, y **nunca se convierte en enlace pulsable**; (2) en pantalla lleva «lo dijo la IA leyendo su web»; (3) **regla dura para la fase 3, con prueba**: a los «hechos permitidos» de un mensaje que sale sin toque del dueño solo entran ids de reglas del motor con su frase de plantilla y datos tipados (nombre, sector, municipio); ningún texto libre de IA ni cita de web. (4) En pantallas, `web_url` y `redes` se validan como `http`/`https` antes de ponerse en un enlace.
- *(rev. 1)* **Reparto de las llamadas por hora:** el tope de 30 llamadas por hora es de todo OPORTIA (`src/ia/config.js` línea 46). La 2f usa como mucho 20 por hora y de noche si puede; el resto queda reservado (la fase 3 lo necesita para responder a clientes reales).
- Sin tope a mitad de corrida: la etapa `con_ia` se salta para lo que falta, la corrida termina como «hecha sin IA en 12 empresas» y el aviso de tope de la 1d sale como siempre.

### 7.5 Diferencia que verá el dueño

| | Sin IA | Con IA |
|---|---|---|
| Qué hace la empresa | Su propia descripción, recortada | Una línea clara en español sencillo |
| Necesidades | Las 40 reglas | Las reglas, más lo que diga el texto (con cita) |
| Propuesta | Plantilla con los hechos | Escrita para esa empresa |
| Mensaje | Plantilla que nombra la señal | A la medida y con el tono pedido |
| Lo pegado de redes | Palabras clave | Resumen de cómo habla y qué ofrece |
| Costo | Nada | Unos US$2 por cada 1,000 empresas, dentro del tope |

---

## 8. Pantallas (visuales, poco texto, teléfono primero y buenas en PC)

Reglas de siempre: lo importante en la primera pantalla; nada largo en el teléfono (pestañas y hojas que suben desde abajo); en PC, lista a la izquierda y ficha a la derecha; una línea que dice qué es cada pantalla; «¿Qué es esto?» plegable; ningún botón muerto (lo que no existe todavía no se dibuja o dice «Próximamente (parte X)»). Todo texto nuevo va en `es.json` y `en.json`.

### 8.1 Proyecto → pestaña nueva «Empresas» (2a lista sencilla; 2b filtros, deslizar y rejilla)

Rutas: `#proyecto/N/empresas`, `#proyecto/N/empresas/ID`, `#proyecto/N/mapa`. La pestaña «Empresas» pasa a ser la primera cuando el proyecto ya tiene resultados.

```
┌──────────────────────────────────────────┐
│ Hoteles en Puerto Plata          ● Buscando 120/312 │
│ [Empresas 312] [Mapa] [Resumen] [Más ▾]             │
├──────────────────────────────────────────┤
│ (Todas) (Nuevas 40) (Guardadas 6) (Descartadas)     │
│ [Filtros ⚙]  Orden: Mejor nota ▾                    │
├──────────────────────────────────────────┤
│ ┌──┐ Hotel Brisa del Mar            82  Alta        │
│ │🏨│ Hoteles · Sosúa · 12 km                        │
│ └──┘ Sin reservas en línea        ☎  ✉  🌐   ☆     │
│ ┌──┐ Villa Taína                    64  Media       │
│ │VT│ Hoteles · Cabarete · 21 km                     │
│ └──┘ Web sin https                ☎      🌐   ☆     │
└──────────────────────────────────────────┘
```

- Tarjeta: logo (o inicial con color), nombre, sector con icono, lugar, distancia, **nota grande** con color y su seguridad, **una** frase (la necesidad principal), iconos de lo que se sabe (teléfono, correo, web, WhatsApp) y la estrella de «Guardar».
- Deslizar en el teléfono: a la derecha guarda, a la izquierda descarta (con «Deshacer»). En PC, botones al pasar el ratón.
- **Filtros** (hoja en teléfono, columna en PC): nota mínima, seguridad, zona, sector, «con teléfono», «con correo», «con web», «con borrador», necesidad (reservas, web, tienda…), «solo nuevas desde la última búsqueda».
- Lista de 30 en 30 (`antesDe`), nunca todo de golpe: el teléfono y el servidor lo agradecen.
- En PC ancho: rejilla de tarjetas de 2 o 3 columnas, o lista más ficha.
- Vacía: dibujo y texto que enseña («Todavía no hay empresas. La primera búsqueda empieza sola al aprobar»), como las listas vacías de la 0.5.1.
- Cabecera del proyecto: un chip con el estado de la corrida en palabras simples («Buscando», «Leyendo webs 12 de 30», «En pausa: poca memoria», «Lista hace 2 h») y el botón **Buscar ahora**.

### 8.2 Ficha de la empresa (2b, crece en 2c–2f)

Una pantalla, sin bajar para lo importante:

```
┌──────────────────────────────────────────┐
│ ‹  [logo]  Hotel Brisa del Mar        ☆  ⋯          │
│     Hoteles · Sosúa, Puerto Plata · 12 km           │
│        ╭────╮                                       │
│        │ 82 │  Seguridad: Alta                      │
│        ╰────╯  ▮▮▮▮▮▮▮▯ 8 barras (toca para ver)    │
│ [☎ Llamar] [WhatsApp] [✉ Copiar correo] [🌐 Web]    │
├──────────────────────────────────────────┤
│ [Resumen] [Evidencias] [Mensaje] [Mis apuntes]      │
│ Qué puede necesitar   (Hipótesis)                   │
│  • Reservas en línea — «piden reservar por teléfono»│
│ Qué falta confirmar                                 │
│  • ¿Cómo agendan hoy las reservas?   [Responder]    │
│ ¿Cómo te fue?  (Interesado) (No) (Vendido)          │
└──────────────────────────────────────────┘
```

- **Resumen:** qué hace (1 línea), necesidad y oferta, «Por qué ahora», preguntas para el cliente, mini mapa con su punto y la precisión («exacta», «de su web», «de la zona»), redes como botones que abren la red.
- **Evidencias:** cada dato en una fila con su etiqueta de color (**Hecho**, **Opinión**, **Señal**, **Hipótesis**), su fuente, la fecha y el enlace. Aquí están también «Pegar reseñas» y «Lo que vi en sus redes».
- **Mensaje** *(rev. 1)*: para una empresa que no te conoce, el **guion de llamada** con «Llamar» y «Copiar»; los textos de correo y WhatsApp solo con base legal (6.6). Dice arriba: «OPORTIA no envía nada. Lo que envíes tú es tu responsabilidad». Botón «No quiere que le escriban».
- **Mis apuntes:** nota libre del proyecto y el historial (encontrada, vista, guardada, marcada).
- Menú ⋯: «Leer su web de nuevo», «Ubicar mejor», «Descartar», **«Quitar»** (3.5).
- Pie pequeño: de dónde salen los datos y su licencia («Datos: Overture Maps · sitio web de la empresa»).
- En PC: la ficha ocupa la columna derecha; la lista queda visible a la izquierda.

### 8.3 Mapa (2b sencillo, 2d real)

- **2b:** el mapa de casillas de las 32 provincias que ya existe (`public/dibujos.js`), ahora con el número de empresas en cada casilla y color según cuántas hay. Tocar una casilla filtra la lista.
- **2d:** mapa de verdad, propio: un dibujo SVG de RD con el contorno de las provincias (unos 60 KB, hecho fuera del servidor con datos abiertos y guardado en `public/`). Los puntos se pintan por latitud y longitud con una proyección simple. Color del punto = nota. Los puntos cercanos se juntan en un círculo con su número; tocarlo acerca. Tocar un punto abre una mini tarjeta.
- No se usan mapas de terceros (ni Google ni teselas de OpenStreetMap): la política de seguridad de la página no permite imágenes de fuera, no cuesta nada y el teléfono del dueño no contacta a nadie. Para ver calles: botón «Abrir en mapas» (abre la aplicación de mapas del teléfono).
- Se pintan como máximo 500 puntos a la vez (los de mejor nota del filtro); el resto, agrupado.

### 8.4 «Tareas» para el usuario (2b) — decisión pendiente de la 1c

Ruta `#tareas`, visible para todas las cuentas (hoy solo existe la del administrador). Responde tres preguntas: **qué está haciendo, qué sigue y qué necesita de mí**.

```
┌──────────────────────────────────────────┐
│ Tareas   Lo que OPORTIA hace por ti, día y noche    │
├──────────────────────────────────────────┤
│ AHORA                                               │
│ ● Hoteles en Puerto Plata                           │
│   Leyendo webs · 12 de 30   ▓▓▓▓▓░░░░░   ~20 min    │
│                                   [Pausar]          │
│ EN FILA                                             │
│ ○ Clínicas en Santiago · espera su turno            │
│ PRÓXIMAS                                            │
│ ◷ Hoteles en Puerto Plata · lunes 6:10 a. m.        │
│ TERMINADAS                                          │
│ ✓ Ayer · 312 empresas, 40 nuevas, 28 webs leídas    │
│ ! Hace 3 días · a medias: 5 webs no respondieron [Ver]│
└──────────────────────────────────────────┘
```

- Solo tareas del espacio de la persona (`tareasDelEspacio`, que ya existe en `cola.js` y hoy no tiene ruta). Nunca muestra tipos internos, identificadores ni errores crudos.
- Cada estado en palabras simples con su motivo: «espera su turno», «pausa corta entre páginas (cortesía)», «en pausa: el servidor tiene poca memoria», «esperando el próximo mes: se alcanzó el tope de IA», «en pausa por ti».
- Botones que funcionan: **Pausar / Reanudar** el proyecto, **Buscar ahora**, **Ver resultado**. Reintentar una corrida fallida: el dueño o el editor del proyecto.
- En la barra de abajo del teléfono, «Tareas» lleva un punto cuando algo trabaja o pide atención.
- API: `GET /api/tareas` (resumen por proyecto: ahora, en fila, próximas, últimas 10), `POST /api/proyectos/:n/buscar`. Sin rutas `DELETE`.
- La pantalla del administrador (#admin/trabajo) no cambia; gana una fila por tipo nuevo.

### 8.5 Otras pantallas tocadas

- **Inicio:** tarjeta «Empresas nuevas: 40» por proyecto; se quitan los textos «espera la fase 2» (lista exacta en 14.3).
- **Crear y editar proyecto:** en 2c, selector de **Fuentes** (tarjetas con interruptor y una línea de qué da cada una) y «Mis webs»; en 2d, **Origen** (para la distancia) en el mapa; en 2f, **Tipo de análisis**: «Básico (gratis)» o «Con IA», con el número de empresas y el costo estimado. Todo cambio crea versión que se aprueba.
- **Administrador → Fuentes** (2b; en la 2a la importación arranca sola y su estado se ve en #admin/trabajo): estado de cada fuente, edición, filas, cuándo se importó, licencia, interruptor; botón «Importar ahora».
- **Administrador → Exclusiones** (2b; en la 2a ya funciona «Quitar» desde la tarjeta): cuántas hay y un cuadro para quitar un negocio por su web o teléfono (para atender un pedido de «Quitar mi negocio»).
- **Avisos y Telegram:** claves nuevas `proyecto_nuevas:p<id>` (info: «40 empresas nuevas en Hoteles»), `fuente_sin_importar`, `fuente_vieja` (más de 4 meses), `logos_lleno`, `proyecto_sin_marcar`. El aviso de empresas nuevas va por Telegram como mucho una vez al día por proyecto.
- **Ayuda:** palabras nuevas en el glosario: nota, seguridad, evidencia, hecho, señal, hipótesis, fuente, corrida, cortesía.

---

### 8.6 Un solo menú para las tres capas y mapa «pantalla de la visión → pantalla real» *(rev. 1)*

La visión (F48) nombra: Inicio, Proyectos, Tareas, Configuración, Clientes, Correo, Empleos y Administrador. Para que el menú no crezca sin plan con la fase 3 y la capa de negocio:

- **Celular (barra de abajo, 5 lugares fijos):** Inicio · Proyectos · Vendedor · Tareas · Más. «Más» abre una hoja con Negocio, Configuración, Ayuda y Administrador. Hasta que exista «Vendedor» (fase 3), ese lugar no se dibuja (nada de botones muertos).
- **PC (menú al costado):** los mismos, todos a la vista.

| Pantalla de la visión | Pantalla real | Llega |
|---|---|---|
| Inicio, Proyectos, Configuración, Administrador | Las de hoy | ya |
| Tareas | `#tareas` | 2b |
| **Clientes** | **«Empresas»**, pestaña de cada proyecto (empresas a las que vender) | 2a-2 |
| **Correo** | **«Vendedor»**: bandeja de conversaciones, por correo y otros canales | fase 3 |
| Empleos | Proyectos de empleo | según D24 |
| (nueva) | «Negocio»: quienes ya contrataron | capa de negocio |

**Palabras:** «empresas» = a las que quieres vender; «clientes» = solo quienes ya te contrataron (pantalla Negocio). Se revisa en los textos de las tres capas.

---

## 9. Presupuesto de memoria, procesador y disco (512 MB, 1 vCPU, ~10 GB)

Lo que ya existe y se respeta: trabajador con 64 MB de memoria de Node (`--max-old-space-size=64`), salida limpia si pasa de 120 MB reales, prioridad baja (`nice 10`), frenos si quedan menos de 80 MB libres (cupo normal) o 100 MB (grande) o menos de 300 MB de disco, pasos de 60 s, escrituras de 200 filas.

### 9.1 Memoria

| Pieza | Máximo | Cómo se garantiza |
|---|---|---|
| Importar un paquete | ~10 MB | Se lee del disco por trozos de 64 KB; línea a línea; 200 filas por escritura |
| Bajar el paquete | ~1 MB | `alTrozo` directo a un archivo (ya existe en `llamar.js`); nunca entero en memoria |
| Conexión a la referencia | 2 MB | `PRAGMA cache_size = -2000`, sin `mmap`; el trabajador la abre solo en la etapa que la usa y la cierra |
| Una página web | 0.4 MB de bytes + ~1 MB como texto | Corte a 400 KB; un pedido a la vez; el texto se suelta al terminar el paso |
| Una imagen | 80 KB (rev. 1) | Corte al pasar |
| Reglas y nota | despreciable | Funciones puras sobre un objeto de hechos de ≤ 4 KB |
| Pantallas (proceso web) | sin cambio apreciable | Listas de 30; consultas con índice; nunca se carga un proyecto entero en memoria |

Dos tareas a la vez como máximo (1 normal + 1 grande). `fuentes.paquete` (grande) y una corrida (normal) pueden coincidir: suman unos 15 MB sobre lo de hoy. Prueba obligatoria con un programa aparte (como `test/copia-memoria-hijo.mjs`): importar 100,000 filas y leer 50 webs del sitio falso con el trabajador real a `--max-old-space-size=64`, midiendo que la memoria real no pase de 110 MB.

### 9.2 Procesador

- Un solo núcleo: todo va por turnos. `ctx.ceder()` cada ~50 ms en los bucles de importar, juntar y puntuar.
- Lo caro de verdad se hizo fuera del servidor (provincia de cada punto, sector, normalización).
- Las expresiones regulares del extractor trabajan sobre un máximo de 400 KB y están escritas sin retroceso explosivo (prueba con páginas hechas para atascar: 400 KB de `<a <a <a…` debe tardar menos de 200 ms).
- Las pantallas no esperan al trabajador: el escritor de la 1c ya da paso a las pantallas.

### 9.3 Disco (de unos 10 GB)

| Qué | Tamaño estimado | Tope |
|---|---|---|
| Paquete Overture comprimido + descomprimido (se sobrescribe en cada edición) | ~10 MB + ~35 MB | — |
| `oportia-referencia.db` (90,600 lugares con índices) | ~60 MB; ~120 MB durante un reemplazo | — |
| OpenStreetMap (2g) | +15 a 30 MB | — |
| Registro RNC (2g, si se activa; solo empresas) | +60 a 120 MB | — |
| `oportia.db`: *(rev. 1)* de 10 a 15 KB por empresa investigada (con web leída, 40 reglas, hipótesis por proyecto y versiones no vigentes) | 20,000 empresas ≈ 200 a 300 MB | aviso al pasar de 300 MB |
| Logos: ~15 KB de media, 80 KB máximo; solo guardadas o 200 mejores por proyecto | unos miles ≈ 50 a 150 MB | 300 MB |
| **Copias locales de cada noche** *(rev. 1; comprobado en el CÓDIGO: `src/copias/estado.js` línea 33, «nunca se borra nada», piso de 2,048 MB libres)* | Con una base de 100 MB (comprimida 25 a 40 MB): **cerca de 1 GB al mes** | Hoy no tienen tope: es la fila que llena el disco |
| Bitácora de tareas (`tareas`, `tarea_eventos`) | crece siempre (5.1) | aviso por tamaño |

*(rev. 1)* Total esperado: **sin contar las copias locales**, menos de 1 GB tras un año. **Contándolas, un disco de 10 GB puede llegar al freno en pocos meses** una vez que la base pase de unos 100 MB. Por eso: (1) la 2a-1 mide bytes por empresa y tamaño real de la copia y muestra los «días de disco» que ya calcula la 1e; (2) ese número es **condición para publicar la 2c**; (3) se le hace al dueño una sola pregunta (D23): «¿las copias guardadas en el servidor de más de 30 días pueden quitarse si la de Telegram está comprobada?». Hasta su respuesta no se borra ninguna (regla suya) y, si el disco se acerca al freno, la investigación se pausa sola y avisa. El freno de disco de la 1c (menos de 300 MB libres) sigue protegiendo. Los números son estimados: se miden en la 2a con el paquete real y se corrigen en el README.

### 9.4 Red

- Web abierta: 1 pedido a la vez, como mucho unos 12 por minuto en total y normalmente 1 web por minuto.
- GitHub: un paquete de ~10 MB cada 1 a 3 meses.
- IA: las llamadas de la 1d (30 por hora por defecto, `llamadasPorHora`); una corrida con IA de 50 empresas tarda al menos 2 horas con ese límite, y es correcto así.

---

## 10. Leyes y límites honestos

### 10.1 Leyes (esto no es consejo legal; lo confirma un abogado dominicano)

- **Ley 172-13 (datos personales):** según los resúmenes leídos, no cubre datos de personas jurídicas ni datos profesionales de contacto; **no está claro** para una persona física con negocio (colmado, taller, profesional). Por eso OPORTIA guarda solo datos del **negocio**: nombre comercial, teléfono y correo generales que el propio negocio publica, dirección del local. Nunca cédulas, nombres de dueños, correos personales ni perfiles personales. «Quitar mi negocio» es el mecanismo de cancelación.
- **Ley 310-14 (correo comercial)** *(rev. 1)*: OPORTIA no envía nada en la fase 2, pero **la ley obliga a quien envía, no a la herramienta**: un correo comercial no pedido que el dueño manda desde su propio correo sigue siendo suyo. Por eso, para empresas sin permiso, relación previa ni mensaje entrante, la fase 2 prepara **solo el guion de llamada** (como dice la línea añadida de la visión: «preparará el borrador para que llames»). Los textos de correo y WhatsApp en frío quedan detrás del interruptor «Un abogado lo confirmó» (6.6, C16, D19). La consulta al abogado pasa a ser **requisito de esos botones en la 2e**, no solo de la fase 3 (D17).
- **Ley 53-07 (acceso ilícito):** solo páginas públicas, sin sesión, sin saltar bloqueos, a ritmo bajo y respetando robots.txt.
- **Datos fuera de RD:** a la IA (servidores en el extranjero) solo va información pública de empresas, y lo pegado por el dueño va ya limpio de nombres, teléfonos y correos de personas (6.7). Es una de las preguntas para el abogado.
- Las reglas viven en `src/paises/rd/reglas.js` (prefijos de correo permitidos, dominios personales, prefijos de teléfono, formas societarias), para ajustarlas cuando opine el abogado sin tocar el motor.

### 10.2 Lo que la pantalla dirá sin adornos

| Límite | Dónde se dice |
|---|---|
| Los datos abiertos sirven para 60–85 % de cada lista; colmados y negocios muy pequeños, cerca del 2 % | «¿Qué es esto?» de Empresas y al estimar antes de aprobar |
| Entre 10 y 30 % de los teléfonos pueden estar viejos | Junto al teléfono: «de datos abiertos, sin confirmar» hasta que la web lo confirme |
| Solo 1 de cada 3 negocios tiene web: muchas fichas quedan con seguridad Baja | En la ficha: «Sin web propia: sabemos poco» |
| Las webs con JavaScript se leen incompletas | En la ficha |
| «No encontramos X» no es «no tiene X» | En cada señal |
| La distancia es en línea recta | Junto a la distancia |
| Las redes sociales no se leen: solo el enlace y lo que tú pegues | En la ficha |
| Lo aprendido con pocas marcas es débil | En «Lo aprendido» |
| La nota de la 2a es preliminar | En la lista y la ficha hasta la 2e |
| Un solo servidor: 400 webs tardan de 4 a 7 horas | En «Tareas» (tiempo estimado) |
| Las reseñas de Google no se leen ni se guardan | En «Pegar reseñas» |
| *(rev. 1)* Muchas tarjetas no tendrán logo: llevan inicial y color | «¿Qué es esto?» de Empresas; en la 2d se mide y se dice cuántas tienen logo real |
| *(rev. 1)* Con las fuentes extra apagadas, la seguridad llega como mucho a «Media» | En la ficha, junto a la seguridad |
| *(rev. 1)* La lista de negocios se renueva cada 1 a 3 meses, no cada día | En la frecuencia del proyecto y en «Tareas» |
| *(rev. 1)* A una empresa que no te conoce: solo llamar, hasta que un abogado confirme | En la pestaña «Mensaje» |
| *(rev. 1)* El sector puede estar mal (sale de una tabla automática) | Botón «Sector equivocado» en la ficha |
| *(rev. 1)* «Quitar» no alcanza las copias de seguridad cifradas ya hechas | En el texto para el negocio y en Administrador → Exclusiones |

---

## 11. Pruebas

Todas en `test/`, sin subcarpetas, sin internet y sin datos reales (reglas actuales). Sitio falso nuevo `test/sitio-falso.js` (como `proveedor-falso.js` y `telegram-falso.js`): sirve en 127.0.0.1 páginas, robots.txt, redirecciones, respuestas lentas, 429, cuerpos enormes e imágenes.

| Archivo | Qué prueba | Parte |
|---|---|---|
| `reglas.test.js` (ampliado) | Migraciones 7–10 sin CHECK, UNIQUE ni ADD COLUMN; dos puertas de red y nada más; nada lee hosts prohibidos; cada fuente y cada tipo bien definidos; el servidor web no carga `src/web/` ni `src/comercial/corrida.js`; única orden de borrado de datos permitida = vaciar una empresa quitada y su imagen, y solo si D2 = «vaciar» (con la opción segura no hay ninguna); el paquete y la base de referencia se sobrescriben porque son datos abiertos que se vuelven a bajar, no datos del dueño | todas |
| `fuentes.test.js` | Registro; términos vistos; paquete con sha256 malo se rechaza; importar 5,000 filas en pasos, cortar a mitad y seguir sin repetir; reemplazo atómico de la referencia; la exclusión salta filas | 2a |
| `catalogo.test.js` | Huella; juntar (los 5 casos y los «ante la duda, no»); procedencia: todo valor visible tiene evidencia; mejor valor; evidencias viejas pasan a no vigentes | 2a |
| `exclusiones.test.js` | Quitar vacía los datos, borra la imagen y deja la huella; **no regresa** al reimportar, al promover, al visitar ni al listar; alcance «solo para mí» | 2a |
| `corrida.test.js` | Etapas en orden; punto guardado; pausa, papelera y modo seguro la detienen; reanudar sigue; topes por plan; una empresa mala no tumba la corrida; proyecto manual solo con «Buscar ahora»; arranque de proyectos ya aprobados; datos de una cuenta nunca salen en otra | 2a |
| `empresas-api.test.js` | Lista con filtros y páginas; ficha; permisos lector, editor y dueño; estimado antes de aprobar; entradas no texto → 400 | 2a, 2b |
| `tareas-usuario.test.js` | `GET /api/tareas` solo muestra lo del espacio; textos de motivo; sin identificadores internos | 2b |
| `salir.test.js` | Rechaza cada rango privado (IPv4, IPv6, IPv4 en IPv6, decimal y octal), nombres que resuelven a direcciones privadas, cambio de dirección entre revisión y conexión, redirección a privado, más de 5 saltos, cuerpo de más de 400 KB, respuesta lenta, puertos raros, usuario en la dirección | 2c |
| `robots.test.js` | Grupos, regla más larga, `*` y `$`, 4xx, 5xx, `Crawl-delay`, archivo de más de 500 KB, caché de 24 h | 2c |
| `lector.test.js` | 8 páginas como máximo; pausa por sitio guardada en la base (sobrevive a un reinicio y a dos proyectos); 429 con `Retry-After`; reutiliza lo leído hace menos de 30 días; nunca `POST`; nunca rutas prohibidas | 2c |
| `extraer.test.js` | 40 páginas de ejemplo (WordPress, Wix, a mano, rotas, con JavaScript); correos: solo generales del dominio propio; teléfonos dominicanos; JSON-LD roto; páginas hechas para atascar las expresiones | 2c |
| `logo.test.js` | Bytes reales contra tipo declarado; SVG rechazado; más de 80 KB rechazado; cabeceras al servir; tope de carpeta | 2d |
| `distancia.test.js` | Haversine con casos conocidos; precisión; todas las zonas de `lugares.js` tienen coordenadas dentro de RD | 2d |
| `senales.test.js` | Las 40 reglas: un caso que la dispara y uno que no; toda señal tiene evidencia; frases en los dos idiomas | 2e |
| `puntuar.test.js` | Los 8 máximos suman 100; nunca pasa de 100 ni baja de 0; sin evidencia no hay puntos de necesidad; seguridad; misma entrada, misma nota | 2e |
| `mensajes.test.js` | Sin señal propia no hay borrador; plantillas en los dos idiomas; máximo de palabras; editar no borra el original | 2e |
| `aprender.test.js` | Menos de 20 marcas no mueve nada; límite ±5; apagar; «empezar de cero» conserva las marcas | 2e |
| `ia-empresas.test.js` | Los cinco candados; sin IA la corrida termina; cita inventada se descarta; texto de web con «ignora tus instrucciones» no cambia la salida; no paga dos veces tras un reinicio; tope a mitad de corrida | 2f |
| `noticias.test.js` | Clasificación; enlace con empresa; duda → baja; resumen ≤ 300; duplicados | 2g |
| `pantallas.test.js` (ampliado) | Cada botón nuevo hace algo; textos en es y en; sin desbordes a 360 px; listas vacías | 2a–2g |
| Fuera de la suite | Ensayo de vuelta atrás por cada migración; memoria con el trabajador real a 64 MB; 3 corridas de la suite como el actualizador (`env -i … node --test`) y con `taskset` a 1 CPU; Playwright en teléfono y PC | cada parte |

Revisión según lo delicado (decisión del dueño del 5 nov): **completa** (equipo rojo de hasta 3 rondas + 2 revisores) en `salir.js`, el lector, exclusiones, migraciones, corrida e IA; **corta** en pantallas.

---

## 12. Hechos comprobados y por comprobar

Límite de esta sesión: `WebFetch` no pudo abrir ninguna página oficial (`docs.overturemaps.org`, `operations.osmfoundation.org`, `www.rfc-editor.org` y `download.geofabrik.de` no se resuelven: hay que permitirlos en la red del entorno). Solo funcionó la búsqueda, que da extractos. Al retomar el trabajo ese mismo día se probó otra vez: `www.rfc-editor.org`, `docs.overturemaps.org` y `operations.osmfoundation.org` seguían sin resolverse; hay que permitirlos en la red del entorno antes del paso 0. *(rev. 1)* **Corrección de etiquetas:** el encargo pide verificar en la página oficial. Un extracto de buscador no es eso. En la tabla, **«EXTRACTO» = visto solo como extracto de búsqueda el 2026-11-10; para este plan cuenta como UNVERIFIED** hasta abrir la página. VERIFIED queda solo para lo comprobado en el código o en páginas abiertas. En la revisión del 2026-11-10 (22:50 UTC) se intentó otra vez `docs.github.com`, `developers.google.com` y `docs.overturemaps.org`: ninguno resuelve desde la sesión. Todo dato externo de este documento sigue UNVERIFIED.

### 12.1 Tabla

| Hecho | Estado | Fuente |
|---|---|---|
| El tema «places» de Overture se publica con licencia CDLA Permissive 2.0 (y Apache 2.0), sin datos de OpenStreetMap ni obligación de compartir igual | EXTRACTO (cuenta como UNVERIFIED) | https://docs.overturemaps.org/guides/places , 2026-11-10 |
| Overture retiró la propiedad `categories` a favor de `basic_category` y `taxonomy` en el esquema 2.0.0 (septiembre de 2026) | EXTRACTO (cuenta como UNVERIFIED) | https://docs.overturemaps.org/blog/2026/08/19/release-notes/ , 2026-11-10 |
| La edición más reciente vista es 2026-10-21.0, con el esquema v2.0.0 | EXTRACTO (cuenta como UNVERIFIED) | https://docs.overturemaps.org/blog , 2026-11-10 |
| Campos exactos de un lugar (web, redes, teléfonos, correos, estado de operación, confianza) | UNVERIFIED | Abrir https://docs.overturemaps.org/schema/reference/places/place/ |
| «Unos 90,600 lugares en RD» y «60–85 % útil» | UNVERIFIED (viene de la visión) | Se mide al armar el paquete |
| Texto exacto de la atribución que pide Overture | UNVERIFIED | https://docs.overturemaps.org/attribution/ |
| GitHub: cada archivo de una «release» debe pesar menos de 2 GiB; sin límite total ni de ancho de banda | EXTRACTO (cuenta como UNVERIFIED) | https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases , 2026-11-10 |
| Que el servidor baja un archivo de `raw.githubusercontent.com` sin redirección; que los adjuntos de «release» sí redirigen a otro host | UNVERIFIED (`docs.github.com` no abre) | Probar desde el servidor en el paso 0 |
| La puerta de red actual acepta un solo host y no sigue redirecciones; tope 120 s | VERIFIED (CÓDIGO: `src/ia/llamar.js` líneas 58-59, 127, 131) | 2026-11-10 |
| El trabajador tiene prohibido `node:https` | VERIFIED (CÓDIGO: `test/reglas.test.js` líneas 205-210) | 2026-11-10 |
| Cadencias existentes: hora, diaria, semanal, mensual, manual | VERIFIED (CÓDIGO: `src/tareas/tiempo.js` línea 17) | 2026-11-10 |
| Las copias locales nunca se borran; piso de 2,048 MB | VERIFIED (CÓDIGO: `src/copias/estado.js` línea 33) | 2026-11-10 |
| RFC 9309: robots.txt con error de servidor o de red = «inalcanzable», y se debe asumir prohibición total; hasta 5 redirecciones seguidas; caché de no más de 24 h | EXTRACTO (cuenta como UNVERIFIED) | https://datatracker.ietf.org/doc/html/rfc9309 , 2026-11-10 |
| RFC 9309: 4xx = «no disponible», se puede leer; regla más larga gana; `*` y `$`; límite de lectura de 500 KiB | UNVERIFIED (4xx por fuente secundaria; el resto sin extracto) | Abrir el RFC, secciones 2.2 a 2.5 |
| Extracto «Haiti and Dominican Republic» de Geofabrik: ~80 MB en `.osm.pbf`, licencia ODbL 1.0 | EXTRACTO (cuenta como UNVERIFIED) | https://download.geofabrik.de/central-america.html , 2026-11-10 |
| Nominatim público: máximo 1 pedido por segundo, identificación propia, sin geocodificación masiva | UNVERIFIED en esta sesión (el informe `investigacion-webs-y-senales.md` lo tiene por terceros) | https://operations.osmfoundation.org/policies/nominatim/ |
| Claude Haiku 5.5: US$0.10 y US$0.50 por millón de tokens (entrada y salida) | VERIFIED por el proyecto el 2026-11-05 y el 2026-11-10 (`src/ia/precios.json`, `investigacion-ia-vendedor.md`); no reabierto aquí | https://platform.claude.com/docs/en/about-claude/pricing |
| Términos y robots.txt de DGII, DGCP, MICM y Diario Libre | UNVERIFIED | Leer cada uno antes de activar su fuente |
| Leyes 172-13, 310-14 y 53-07 | UNVERIFIED (resúmenes; `investigacion-leyes-rd.md`) | Abogado |

### 12.2 Paso 0 de la 2a: comprobar antes de construir

1. Permitir en el entorno de Claude: `docs.overturemaps.org` y el almacenamiento oficial de Overture. Abrir la referencia del esquema y la página de atribución; guardar copia fechada en `notas/terminos/overture-<fecha>.md`.
2. Armar el paquete de RD y **medir**: filas, tamaño, cuántas traen teléfono, web y correo, cuántas por sector y por provincia. Corregir los números de la visión si hace falta (y decírselo al dueño en corto).
3. *(rev. 1)* Desde el servidor (leyendo, sin cambiar nada): confirmar que baja un trozo de prueba por el camino principal (ver el punto 6). El adjunto de «release» es solo el respaldo.
4. Abrir el RFC 9309 y dejar el intérprete de robots fiel al texto.
5. Confirmar que las pruebas siguen sin tocar internet (el paquete de prueba es un archivo pequeño de `test/`).
6. *(rev. 1)* Probar desde el servidor, solo leyendo, que baja un archivo de prueba de `raw.githubusercontent.com` (camino principal) y qué responde un adjunto de «release» (respaldo).
7. *(rev. 1)* Leer y guardar con fecha en `notas/terminos/` los términos y el `robots.txt` de **Diario Libre, MICM, DGCP, DGII, datos.gob.do, OpenStreetMap/Geofabrik, Nominatim, Wikidata y la API de YouTube** (pide permitir esos sitios en la red de la sesión: D1 ampliada). Lo que no se pueda leer nace apagado y la pantalla lo dice. Este punto no frena la 2a: frena la 2g y la activación de cada fuente.
8. *(rev. 1)* Orden: la **parte 1f** (instalación y restauración) va **antes** de la 2a, porque 2.2 se apoya en restaurar.

---

## 13. Riesgos y cómo se evitan

| Riesgo | Cómo se evita |
|---|---|
| Pedidos hacia la red privada (SSRF) por una web maliciosa o una dirección escrita por un usuario | `salir.js` con dirección fijada, rangos privados rechazados, redirecciones revisadas, equipo rojo de 3 rondas |
| Una web enorme o lenta atasca al trabajador | Corte a 400 KB y 20 s; una página por paso; paso de 60 s; zombis ya previstos en la 1c |
| Expresiones regulares que se atascan | Patrones sin retroceso; entrada acotada; prueba de páginas tramposas |
| Texto de una web que intenta mandar a la IA | Bloque de datos escapado; esquema; cita obligatoria; la IA no decide nada |
| Imagen maliciosa | Tipo por bytes; sin SVG; 80 KB; `nosniff`; se sirve con tipo fijo |
| Molestar a un sitio pequeño | 1 web por minuto, 8 páginas, relectura a 30 días, robots.txt, identidad honesta, página `/bot` |
| Overture cambia su formato | El servidor solo conoce el paquete propio; cambia el programa de `herramientas/` |
| El paquete publicado se altera | sha256 fijado en el código; paquete que no coincide se rechaza |
| Datos viejos o negocios cerrados | Confianza de la fuente, fecha visible, «de datos abiertos, sin confirmar», la web confirma |
| Dos negocios mezclados en una ficha | «Ante la duda, no juntar»; fusión reversible (nada se borra) |
| La base crece y las copias de Telegram se vuelven pesadas | Referencia y logos fuera de la copia; topes por plan; aviso a 300 MB |
| Falta de memoria con 512 MB | Presupuesto de la sección 9; frenos de la 1c; prueba con el trabajador real a 64 MB |
| Una cuenta ve empresas de un proyecto ajeno | Toda ruta entra por el proyecto y su espacio; prueba de aislamiento; lo privado lleva `proyecto_id` |
| Un negocio pide salir y vuelve en la siguiente importación | Lista de huellas consultada en los 4 puntos (3.5) y su prueba |
| El dueño cree que «82» es una certeza | Seguridad al lado de la nota, 8 barras, «Hipótesis», «qué falta confirmar» |
| Gasto de IA inesperado | Cinco candados; tope por llamada, por proyecto, por cuenta y general; costo estimado antes de aprobar |
| Volver a una versión anterior | Migraciones que solo agregan; ensayo por cada una; tipos desconocidos esperan en la fila |
| El trabajo de la fase 2 retrasa las copias o la revisión de la base | Cupos separados (normal y grande) y horarios distintos |
| Un periódico o fuente prohíbe la lectura | Cada fuente apagada hasta leer sus términos; se respeta su robots.txt |


---

## 14. Construcción por partes pequeñas (2a a 2g)

Cada parte se publica sola, con sus pruebas, su revisión y, si trae migración, su ensayo de vuelta atrás. Ninguna deja botones muertos: lo que todavía no existe no se dibuja, o dice «Próximamente (parte X)».

### 14.1 Resumen

| Parte | Versión | Migración | Qué ve Junior al instalarla | Trabajo estimado | Revisión |
|---|---|---|---|---|---|
| Paso 0 | — | — | Nada (se arma y se mide el paquete de datos fuera del servidor) | medio día | — |
| **2a** | 0.6.0 | 7 | **Empresas reales** en sus proyectos aprobados: lista con nombre, sector, lugar, teléfono, web y nota preliminar; «Buscar ahora»; «Quitar» | 1 a 2 días | Completa |
| 2b | 0.6.1 | — | Ficha visual, filtros, mapa de casillas con números, pantalla «Tareas», estimado antes de aprobar, Administrador → Fuentes y Exclusiones | 1 a 2 días | Corta (pantallas) |
| 2c | 0.7.0 | 8 | OPORTIA lee la web de cada empresa: qué hace, contactos, redes; selector de fuentes y «Mis webs» | 2 a 3 días | Completa (es la parte más delicada) |
| 2d | 0.7.1 | — | Logo o foto, mapa real, distancia, origen del proyecto | 1 a 2 días | Completa en imágenes; corta en mapa |
| 2e | 0.8.0 | 9 | Nota completa con 8 barras, necesidades, preguntas para el cliente, propuesta, mensaje en borrador, «¿Cómo te fue?», «Lo aprendido» | 2 a 3 días | Completa en reglas y nota; corta en pantallas |
| 2f | 0.8.1 | — | «Tipo de análisis: Con IA» por proyecto, con costo estimado | 1 a 2 días | Completa (dinero) |
| 2g | 0.9.0 | 10 | Noticias, sugerencias, OpenStreetMap y registros públicos (cada uno apagado hasta leer sus términos) | 2 a 3 días | Completa en fuentes; corta en pantallas |

Total: de 10 a 17 días de trabajo. Son estimados honestos, no promesas: la 1d y la 1e tardaron más de lo previsto por las rondas de revisión.

**División final de las partes grandes** *(rev. 1; esta división manda sobre la tabla de arriba cuando difieren)*. La 2a, la 2c y la 2e eran demasiado grandes para publicarse con seguridad:

| Trozo | Versión | Qué trae | Qué ve Junior | Estimado |
|---|---|---|---|---|
| 1f | — | Instalación y restauración (pendiente de la fase 1) | Nada nuevo en pantalla | ya planificada |
| 0.5.2 | 0.5.2 | Solo los dos arreglos de la 1c (2.5) | Nada | medio día |
| 2a-1 | 0.6.0 | Migración 7, puerta de red con `raw.githubusercontent.com`, importar la referencia, cadencias nuevas, medición de disco | En Administrador: «Lista de negocios de RD: importada, N lugares» y los días de disco | 1 a 2 días |
| 2a-2 | 0.6.1 | Corrida (puntuar sin promover), lista, «Quitar». El arranque de los proyectos ya aprobados va **detrás de un botón** del administrador («Empezar a buscar en mis proyectos»), no solo al instalar | Empresas reales en sus proyectos | 1 a 2 días |
| 2b | 0.6.2 | Ficha, filtros, mapa de casillas, «Tareas», menú nuevo (8.6); lee y conserva el esquema 4 | Ficha visual | 1 a 2 días |
| 2c-1 | 0.7.0 | Migración 8, `salir.js` + robots + página pública del lector con «Abrir un pedido», equipo rojo. Solo el botón «Leer esta web» en **una** ficha | Lee una web al pulsar | 1 a 2 días |
| 2c-2 | 0.7.1 | Etapa `visitar` en las corridas, con freno global y profundidad 30 las dos primeras semanas | Lee webs sola, despacio | 1 día |
| 2c-3 | 0.7.2 | Esquema 4: selector de fuentes y «Mis webs» | Elige fuentes | 1 día |
| 2d | 0.7.3 | Logo, mapa real, distancia | Tarjetas con logo (las que lo tengan) | 1 a 2 días |
| 2e-1 | 0.8.0 | Migración 9 (con `no_contactar`), reglas, señales, nota completa, preguntas | Nota con 8 barras y necesidades | 1 a 2 días |
| 2e-2 | 0.8.1 | Propuesta, guion de llamada, textos con base legal, «¿Cómo te fue?», «Lo aprendido» con corregir | Pestaña «Mensaje» | 1 a 2 días |
| 2f | 0.8.2 | IA opcional con memoria entre corridas | «Con IA» por proyecto | 1 a 2 días |
| 2g | 0.9.0 | Migración 10: noticias, sugerencias y fuentes extra, cada una apagada hasta leer sus términos | Sugerencias siempre; noticias y más fuentes solo las que se activen | 2 a 3 días |

Total revisado: de 13 a 22 días de trabajo, más las rondas de revisión.

**Sobre «1 a 2 días» para la 2a:** es tiempo de **construcción y pruebas**; la revisión completa (equipo rojo y dos revisores) puede sumar hasta un día más antes de publicar. Se cumple solo con el alcance recortado de abajo (sin ficha, sin filtros, sin mapa, sin pantallas de administrador) y **después** del paso 0. El paso 0 depende de una decisión del dueño (D1: permitir el host de datos de Overture en el entorno de Claude). Si ese permiso tarda, la 2a-2 no puede mostrar empresas reales. *(rev. 1)* La 2a-1 se construye igual con un paquete de prueba, y hay una salida sin tocar el entorno: Junior baja el archivo oficial en su PC y lo sube (más trabajo para él). No hay otro camino legal y gratis que no pase por una lista abierta.

### 14.2 Qué trae cada parte

**Paso 0 (fuera del servidor, sin publicar nada en la aplicación)**
- Lo de 12.2: abrir las páginas oficiales, guardar copia fechada de los términos, armar el paquete de RD, medirlo, publicarlo **en trozos en la rama `datos`** (rev. 1; ver 2.1) y probar que el servidor lo baja.
- Archivos: `herramientas/armar-paquete-overture.mjs` (puede usar programas del entorno de Claude, como DuckDB o Python, para leer Parquet: **no** son dependencias del servidor ni entran en `package.json`), `herramientas/overture-a-sector.json`, `notas/terminos/overture-<fecha>.md`.
- Si los números reales difieren de la visión (90,600 lugares; 60–85 % útil), se corrigen en el README y se le dice al dueño en dos líneas.

**2a — «ya veo empresas» (0.6.0, migración 7)**
- Servidor: migración 7 completa (las 7 tablas: crear tablas vacías no cuesta y evita otra migración en la 2b); `src/fuentes/registro.js`, `paquetes.json`, `referencia.js`, `importar.js`; `src/catalogo/{empresas,juntar,exclusiones,evidencias}.js`; `src/comercial/corrida.js` con las etapas `preparar`, `descubrir`, `puntuar_rapido` y `cerrar`; `src/comercial/puntuar.js` con los 4 criterios de la 2a; `src/paises/rd/reglas.js` (teléfonos y formas societarias); tipos `fuentes.paquete` y `proyecto.investigar`; `FASE_ACTUAL = 2`; `aprobarVersion` encola la corrida; corrida de arranque para los proyectos ya aprobados, *(rev. 1)* **detrás del botón del administrador «Empezar a buscar en mis proyectos»**, no automática al instalar; los dos pendientes de la 1c (2.5).
- API: `GET /api/proyectos/:n/empresas` (30 por página, orden por nota), `POST /api/proyectos/:n/buscar`, `POST /api/proyectos/:n/empresas/:id/estado` (guardar, descartar), `POST /api/proyectos/:n/empresas/:id/quitar`.
- Pantallas: pestaña «Empresas» con lista sencilla (inicial con color, nombre, sector con icono, lugar, **nota preliminar** y seguridad, botones Llamar / Web si existen, estrella, menú con «Descartar» y «Quitar»); chip de estado de la corrida; «Buscar ahora»; textos de 14.3; aviso «N empresas nuevas».
- Lo que la 2a **no** trae y lo dice: sin ficha (la tarjeta de la 2a **no se dibuja como algo que se pulsa**: sin flecha y sin efecto al tocar; solo sus botones Llamar, Web, estrella y menú hacen algo), sin lectura de webs, sin necesidades. La nota dice «preliminar».
- Pruebas: `fuentes`, `catalogo`, `exclusiones`, `corrida`, `empresas-api` (lista), reglas ampliadas, pantallas; ensayo 0.5.1 ↔ base 7; memoria con 100,000 filas.

**2b — ficha, filtros y «Tareas» (0.6.1, sin migración)**
- Ficha (pestañas Resumen, Evidencias y Mis apuntes; «Mensaje» aparece en la 2e), estados y apuntes, filtros, deslizar, rejilla en PC, mapa de casillas con números, estimado antes de aprobar (`GET /api/proyectos/:n/estimado`), `#tareas` con `GET /api/tareas`, Administrador → Fuentes y Exclusiones, palabras nuevas en Ayuda.
- Pruebas: `empresas-api` (ficha, permisos, estimado), `tareas-usuario`, pantallas, Playwright en teléfono y PC.

**2c — leer webs (0.7.0, migración 8)**
- `src/web/{salir,robots,lector,extraer}.js`; etapas `visitar` y `extraer`; página pública `/bot` (o su equivalente, D3); configuración esquema 4 con `fuentes` elegibles y `misWebs`; selector de fuentes; redes como botones; `empresas.titular` se afina con lo leído (en la 2a sale solo de la forma societaria del nombre).
- Pruebas: `salir`, `robots`, `lector`, `extraer`; equipo rojo de 3 rondas sobre `salir.js` y el lector; ensayo 0.6.1 ↔ base 8.
- Antes de publicar: abrir el RFC 9309 completo (hoy solo hay extractos).

**2d — imagen, mapa y distancia (0.7.1, sin migración)**
- `src/web/logo.js`, `GET /api/empresas/:id/logo`, `src/motor/lugares-coordenadas.json`, etapa `ubicar`, campo `origen`, mapa SVG de RD, `empresa.ubicar` (apagado mientras `nominatim` esté apagada: el botón «Ubicar mejor» no se dibuja).
- Pruebas: `logo`, `distancia`, pantallas.

**2e — entender y proponer (0.8.0, migración 9)**
- `src/comercial/{reglas,senales,puntuar,proponer,mensajes,aprender}.js`; etapas `senales`, `puntuar`, `redactar`; `preguntas`; cuadros «Pegar reseñas» y «Lo que vi en sus redes»; pestañas «Mensaje» y «Lo aprendido»; la nota deja de decir «preliminar».
- Pruebas: `senales`, `puntuar`, `mensajes`, `aprender`; ensayo 0.7.1 ↔ base 9.

**2f — IA opcional (0.8.1, sin migración)**
- Tres propósitos nuevos, interruptor `analisisProyectos`, `limpiarConfiguracion` deja pedir `ia.permitida` (esquema 4), costo estimado antes de aprobar, etapa `con_ia`.
- Pruebas: `ia-empresas`; revisión completa por ser dinero.

**2g — más fuentes, noticias y sugerencias (0.9.0, migración 10)**
- `noticias.leer`, `noticias_diariolibre` (y GDELT como fuente candidata: la visión lo menciona; sus términos no se han leído, así que nace apagada), `osm` en tabla aparte, `dgcp`, `micm`, `dgii_rnc` (apagadas hasta leer términos), `src/comercial/sugerir.js`, tarjetas de sugerencias.
- Pruebas: `noticias`, fuentes nuevas; ensayo 0.8.1 ↔ base 10.

### 14.3 Los textos «espera la fase 2»: lista exacta

Claves de `public/i18n/es.json` (cada una tiene su gemela en `en.json`; se cambian las dos):

| Clave | Cambia en | Texto nuevo (idea) |
|---|---|---|
| `estado.en_ejecucion.comercial` | 2a | «Buscando clientes» / «Al día» (según la corrida) |
| `proyecto.aviso_espera.comercial` | 2a | Se quita; lo reemplaza el chip de la corrida |
| `siguiente.espera.comercial` | 2a | «Revisar las empresas nuevas» |
| `proyectos.aviso_fase`, `proyectos.aviso_fase.corto` | 2a | Solo queda la parte de empleos, **sin número de fase: «más adelante»** hasta que el dueño responda D24 (rev. 1) |
| `inicio.aprobar.fase`, `proyecto.aviso_antes.comercial`, `proyecto.aviso_antes.corto.comercial` | 2a | «Al aprobarlo empieza a buscar empresas» (empleos: no se toca el texto hasta D24; rev. 1) |
| `inicio.viene.clientes` | 2a | Pasa de «lo que viene» a «lo que ya funciona» |
| `inicio.funciona.5`, `tareas.explicacion` | 2a | «…y busca empresas para tus proyectos» |
| `ayuda.aprobar.texto`, `ayuda.fase.texto` | 2a | Buscar clientes ya funciona; contactar llega en la fase 3; empleos «más adelante» hasta D24 (rev. 1) |
| `proximamente.fuentes` | 2a (texto veraz: «Por ahora hay una sola fuente…»); se quita en 2c | — |
| `proximamente.analisis` | 2a: «…próximamente (parte 2f)»; se quita en 2f | — |
| `ia.que_es.texto` | 2f | Añade el análisis de empresas y su costo |

En `public/app.js`: la pista de pasos (comentario «Creado → Aprobado → Buscar (fase 2) → Contactar (fase 3)»: «Buscar» pierde el candado en la 2a), el estado «Aprobado · espera la fase 2» y el bloque «Qué hará el proyecto». Los textos de proyectos de **empleo** no se tocan. *(rev. 1)* Hay un choque sin resolver: el plan aprobado de la visión pone empleo en la **fase 4** (F36 a F43) y la app publicada dice «fase 6» en 8 textos (`es.json` líneas 92, 114, 123, 392, 395, 425, 684 y 787) igual que `CONTINUAR.md` (5 nov). Este diseño no escribe ningún número nuevo: los textos que hay que reescribir usan «más adelante» hasta que el dueño responda (C18, D24). Prueba nueva en `pantallas.test.js`: ninguna clave visible para un proyecto comercial contiene «fase 2» después de la 2a.

Visto de paso (no es de esta fase): un texto de `es.json` dice que «Investigar una empresa en particular» llega en la fase 3 y la visión dice fase 4 (F5). Se corrige el texto a lo que diga el dueño (D10).

### 14.4 Lo que la fase 3 recibe de la fase 2

`diseno-fase3.md` §1.2 supone seis cosas. Así quedan:

| Supuesto de la fase 3 | Qué entrega este diseño |
|---|---|
| S1 `empresas` con imagen y «persona física o empresa» | `empresas` (4.1), `logo_archivo`, columna `titular` |
| S2 contactos con fuente, fecha y tipo | Filas de `evidencias` con `clase = 'dato'`, `campo` (telefono, correo_general, whatsapp), `fuente`, `url`, `vista_en`, `origen` |
| S3 señales cortas y limpias, «cómo habla» | `evidencias` `senal` e `hipotesis`; resumen de lo pegado (privado del proyecto); `proyecto_empresas.propuesta` |
| S4 `estaExcluida(empresa)` | `src/catalogo/exclusiones.js` exporta `estaExcluida(db, { empresaId, espacioId })` |
| S5 IA por versión aprobada | Parte 2f (esquema 4 de la configuración) |
| S6 `FASE_ACTUAL` | 2 en la 2a; la fase 3 lo sube a 3 |

Las migraciones de la fase 3 empiezan en la 11. *(rev. 1)* La fase 3 añade a `borradores` solo el valor `pasado_al_vendedor` (lo enviado vive en su tabla `mensajes`) y **reutiliza** `no_contactar` de la migración 9. Para «persona física» usa `empresas.titular` (no «sin RNC + micro»).

### 14.5 Modo «director»: qué modelo conviene en cada pieza al construir

Regla del dueño (10 nov): el modelo fuerte en lo difícil o delicado; modelos sencillos en lo simple. «Fuerte» = diseño fino, código y revisión final; «sencillo» = puede hacerlo un modelo más simple con una instrucción clara y las pruebas ya escritas.

| Pieza | Modelo | Por qué |
|---|---|---|
| Migraciones 7 a 10 y sus ensayos de vuelta atrás | Fuerte | Datos; un error no se puede deshacer |
| `salir.js` (protección de red), lector y robots | Fuerte + equipo rojo | Seguridad |
| Exclusiones («no regresa») | Fuerte | Ley y confianza |
| Corrida (etapas, punto guardado, topes) | Fuerte | Motor y servidor |
| Juntar empresas y procedencia | Fuerte | Datos |
| Paquete de datos y medición (paso 0) | Fuerte dirige; sencillo arma la tabla categoría → sector (unas 2,000 filas, con revisión por muestra) | Mucho volumen, poco riesgo |
| Extractor: funciones puras con 40 páginas de ejemplo | Sencillo escribe ejemplos y casos; fuerte revisa los patrones (atascos) | Repetitivo |
| Las 40 reglas: frases, preguntas y un caso de prueba por regla | Sencillo, con la tabla de 6.4 como guía; fuerte revisa la lógica `si` | Textos |
| Plantillas de propuesta y de mensajes (es y en) | Sencillo, con las reglas de tono de `CONTINUAR.md` | Textos |
| Nota (`puntuar.js`) y aprendizaje | Fuerte | Motor; afecta decisiones |
| IA: propósitos, candados, cita obligatoria | Fuerte | Dinero y seguridad |
| Pantallas (lista, ficha, mapa, Tareas, administrador) | Sencillo construye; una revisión corta | Decisión del 5 nov |
| Textos `es.json` / `en.json`, glosario, README | Sencillo | Textos |
| Coordenadas de zonas y contorno SVG de RD | Sencillo arma; prueba automática comprueba que todo cae dentro de RD | Datos abiertos, verificable |
| Capturas con Playwright y búsquedas de términos | Sencillo | Mecánico |
| Revisión final de cada parte | Fuerte (y consejero antes de dar por terminado) | Regla del dueño |

---

## 15. Conflictos con decisiones anteriores

Nada de esto se aplica en silencio. Cada fila dice qué se había decidido, qué propone este diseño y cuál es la opción segura si el dueño no responde.

| # | Lo decidido antes | Lo que propone este diseño | Por qué | Opción segura (si no hay respuesta) |
|---|---|---|---|---|
| C1 | «Nunca borrar datos» (regla del dueño) | «Quitar mi negocio» **vacía** los datos públicos de esa empresa y borra su imagen; queda solo su huella | La visión (F58) y la Ley 172-13 piden que un negocio pueda salir; guardar sus datos «escondidos» no es salir | Solo ocultar (estado «quitada»), sin vaciar nada, hasta que el dueño decida (D2) |
| C2 | `test/reglas.test.js`: una «única puerta a la red» (`src/ia/llamar.js`) | Dos puertas: `llamar.js` (hosts fijos) y `src/web/salir.js` (web abierta, con protección) | Leer webs necesita seguir redirecciones y cualquier host público; mezclarlo con la puerta de la IA la haría menos segura | No hay alternativa para la 2c; hasta entonces la regla sigue igual. La prueba cambia a «exactamente dos puertas» |
| C3 | Visión F25: la propuesta responde «tus seis preguntas» | El documento de la visión no las enumera; este diseño propone seis (6.6) | Hace falta una lista concreta para construir | Usar las seis de 6.6; son datos y se cambian sin migración (D11) |
| C4 | Comentario en `src/tareas/tipos.js`: «En la fase 2, con 1 GB, normal sube a 2» | Se queda en 512 MB y `normal: 1` | El encargo es 512 MB; cabe (sección 9); 1 GB cuesta dinero | 512 MB. Se corrige el comentario (D4) |
| C5 | Visión F16: OpenStreetMap «después de la fase 2»; nota de `plan-vision.md`: propuesta fase 3 | Lo incluye en la 2g, apagable | El marco de fuentes ya queda hecho; sube la cobertura | Dejarlo para la fase 3, como dice la visión (D9) |
| C6 | Nota de `plan-vision.md`: reseñas de Google «opcionales desde la fase 2, si activas Google con tu tarjeta» | `google_places` queda definida en el registro pero **no se construye** en la fase 2 | Es un servicio de pago y con reglas estrictas (solo mostrar en vivo); no aporta necesidades | No construir; se construye cuando el dueño lo pida y acepte el costo (D8) |
| C7 | Visión F44: los pesos aprendidos se pueden «borrar» | «Empezar de cero» los **apaga** (`activo = 0`) y conserva las marcas | Regla «nunca borrar datos»; el efecto para el dueño es el mismo | Apagar sin borrar (D12) |
| C8 | Visión F18: Brave para encontrar webs que faltan (1,000 búsquedas gratis, con tarjeta) | No se usa en la fase 2 | Pide tarjeta: es una decisión de pago | No usar (D7) |
| C9 | El servidor solo se alcanza por Tailscale + Funnel; nunca se pensó en páginas sin sesión | La identidad del lector necesita una página pública «/bot» y un contacto | Leer webs con educación exige decir quién eres y cómo pedir que no te lean | Página en el repositorio público de GitHub, sin mostrar la dirección del servidor (D3) |
| C10 | Parte 1b: «IA guardada por versión: no permitida, tope US$0», fija en `limpiarConfiguracion` | En la 2f la persona puede **pedir** IA en una versión, que hay que aprobar | Es la función F8 de la visión | Sigue fija en «no permitida» hasta la 2f; después, apagada por defecto (D5) |
| C11 | Texto actual `proximamente.analisis`: «básico, avanzado o profundo» (tres niveles) | Dos opciones («Básico» o «Con IA») más un número: cuántas empresas se investigan a fondo | Es lo que dice el añadido de la visión («Tipo de análisis: Básico o Con IA, y cuántas…»); tres nombres sin diferencia clara confunden | Dos opciones más profundidad; se corrige el texto |
| C12 | Parte 1b: `fuentes` fijo por tipo (`datos_abiertos`, `webs`, `noticias`) en el esquema 3 | Esquema 4 con fuentes elegibles; las claves viejas se leen como grupos | F13 | Las versiones ya aprobadas valen sin reescribirse (3.4) |
| C13 | Visión F5 «Investiga esta empresa»: fase 4 | «Mis webs» (F13, fase 2) ya investiga una dirección que escribe el dueño dentro de un proyecto | Son la misma pieza | F5 completa sigue en la fase 4; no se adelanta sin permiso (D10) |
| C14 | Visión F19: «solo Diario Libre está confirmado»; las notas de `plan-vision.md` también nombran GDELT (últimos 3 meses) | Solo Diario Libre nace probada; GDELT queda como fuente candidata, apagada | Sus términos no se han podido leer en esta sesión | Apagada hasta leerlos (D14) |
| C15 | 1c: la pantalla «Tareas» del usuario «pasa a la fase 2» | Llega en la 2b, no en la 2a | Para que la 2a sea pequeña; en la 2a el chip del proyecto ya dice qué hace | 2b |
| **C16** *(rev. 1)* | Visión F28: «sin correo, botones Llamar y WhatsApp que envías tú»; F29: mensajes distintos por empresa; versión anterior de este diseño: texto de correo y de WhatsApp para toda empresa con señal | Para empresas **sin base legal** (no te conocen): solo guion de llamada y botón Llamar. Textos de correo y WhatsApp solo con base, o tras encender «Un abogado lo confirmó» | La Ley 310-14 obliga a quien envía, aunque sea a mano; el informe legal dice «sin correo ni WhatsApp en frío hasta el abogado»; la línea añadida de la visión (F59) dice «preparará el borrador para que llames». Además WhatsApp puede restringir su número personal | **Solo llamar** hasta que el dueño responda D19. Es un debilitamiento de F28: se le pregunta, no se aplica callado |
| **C17** *(rev. 1)* | Pedido del 5 nov: «logo o foto de su web (og:image / favicon grande), guardada con tamaño reducido» | No se reduce (no hay librería y cero dependencias); se guardan iconos de hasta 80 KB; `og:image` apagada | El servidor no puede cambiar el tamaño de una imagen; las fotos `og:image` pesan de 100 a 500 KB y a menudo muestran personas | (a) Aceptar iconos pequeños e inicial con color (seguro); opciones: (b) permitir una foto de hasta 300 KB mostrada reducida, midiendo disco; (c) reducirlas fuera del servidor solo para empresas guardadas. D20 |
| **C18** *(rev. 1)* | Plan aprobado de la visión: empleo en la fase 4 (F36–F43) | La app publicada y `CONTINUAR.md` dicen «fase 6» | Dos documentos del propio proyecto se contradicen | No escribir ningún número: «más adelante» en los textos que se toquen, hasta D24 |
| **C19** *(rev. 1)* | Regla «nunca borrar»; copias locales sin tope (1e) | Preguntar si las copias **locales** de más de 30 días pueden quitarse cuando la de Telegram está comprobada, y si la bitácora técnica de tareas viejas puede resumirse | Con la fase 2 la base crece y un disco de 10 GB se llena en meses (9.3) | No borrar nada; pausar la investigación y avisar si el disco se acerca al freno (D23) |
| **C20** *(rev. 1)* | Visión F8: la IA «lee webs y noticias completas» | La IA lee solo el texto de la web (8 KB); de las noticias queda titular, enlace y resumen propio, sin IA | Guardar o mandar a la IA noticias completas choca con los derechos del periódico y con términos sin leer | Así; revisar al leer los términos de cada periódico (D14) |
| **C21** *(rev. 1)* | Visión F6: «detecta cambios y avisa» | Se guarda «antes decía…» y la regla A05; se añade un aviso opcional «cambió la web de una empresa guardada» (como mucho uno al día, junto al de empresas nuevas) | Faltaba el aviso | Aviso encendido solo para empresas guardadas con estrella (D16) |
| **C22** *(rev. 1)* | Visión F34: aviso a los 7 días sin respuesta (fase 2-3) | La fase 2 guarda «contactada por ti» y la fecha; el aviso de 7 días llega con la fase 3 | El seguimiento es parte del vendedor | En la 2e-2: un recordatorio simple en pantalla («hace 7 días que la llamaste»), sin mensaje nuevo |
| **C23** *(rev. 1)* | Meta del 10 nov: «todas las fuentes públicas, cómo habla en sus redes» | Redes: solo enlace y lo pegado (leerlas está prohibido, F21). YouTube oficial, Wikidata, datos.gob.do y listas de asociaciones con permiso: candidatas apagadas | Lo legal y gratis sí se puede sumar, pero cada una pide leer términos y, YouTube, una clave del dueño | Apagadas; «cómo habla» sale de su propia web (D21) |

---

## 16. Decisiones del dueño

Ninguna frena el diseño. Solo **D1** hace falta para empezar la 2a (y tiene salida: ver su fila). Las demás tienen una opción segura que se aplica sola si no hay respuesta. *(rev. 1)* La lista única y numerada para el dueño, con las tres capas juntas, está en `plan-fases-2-3.md` («Decisiones del dueño»); ahí se le pregunta solo lo que frena la parte siguiente. **D2, D3 y D19 sí se le preguntan** (no se dejan en silencio).

| # | Pregunta en sencillo | Opción segura (por defecto) | Recomendación | ¿Cuesta dinero? |
|---|---|---|---|---|
| **D1** | ¿Permites que el entorno de Claude en la nube baje la lista abierta de negocios de Overture (y abra las páginas oficiales `docs.overturemaps.org`, `www.rfc-editor.org`, `operations.osmfoundation.org`)? | No permitir: la 2a-1 (preparar todo) se construye igual con un paquete de prueba; la 2a-2 (empresas reales) espera. Salida sin tocar el entorno: Junior baja el archivo oficial en su PC siguiendo 4 pasos y lo sube (es más trabajo para él) | **Sí.** Es gratis, no toca tu servidor ni tus cuentas, y es lo único que la 2a necesita de ti | No |
| **D2** (se pregunta) | Cuando un negocio pide salir, ¿se vacían sus datos (queda solo una huella para que no regrese) o solo se esconden? En los dos casos queda en las copias cifradas ya hechas, que no se usan | Solo esconder (la tabla C1 reconoce que eso no es «salir» del todo) | **Vaciar.** Es la única excepción a «nunca borrar», y es lo que pide la ley y tu función «Quitar mi negocio» | No |
| **D3** (se pregunta antes de la 2c-1) | El lector de webs debe decir quién es y dar un contacto real. ¿Cuál? | Página en el repositorio público de GitHub con el botón «Abrir un pedido» (gratis, sin tu correo y sin la dirección de tu servidor). **Sin un contacto real no se lee ninguna web** | Eso ahora; opción: un correo genérico gratis creado con tu permiso; cuando tengas el correo propio del vendedor (fase 3) o un dominio, se pone ahí. Nunca tu correo personal | No (un dominio propio sí cuesta; precio UNVERIFIED, se consulta y se pregunta antes) |
| D4 | ¿Subir el servidor a 1 GB (US$6 al mes)? | No: 512 MB | **No por ahora.** Se mide en la 2c; si los frenos de memoria saltan a menudo, te lo propongo con números | Sí, si se hace |
| D5 | ¿Encender «IA en el trabajo de los proyectos» y con qué tope? | Apagada, tope US$0 | Encenderla al llegar la 2f con US$5 al mes (unas 2,500 empresas) y solo en los proyectos donde tú lo apruebes | Sí (uso de la API, dentro del tope) |
| D6 | ¿Activar «Ubicar mejor» (Nominatim, gratis, 1 por segundo)? | Apagado | Apagado hasta abrir su política oficial; después, solo al pulsar el botón | No |
| D7 | ¿Usar Brave para encontrar webs que faltan (1,000 búsquedas gratis al mes, pide tarjeta)? | No | **No en la fase 2.** Primero medir cuántas empresas salen sin web; decidir con ese número | Tarjeta; puede costar |
| D8 | ¿Google Places (ficha y reseñas en vivo)? | No se construye | No por ahora: es de pago, no deja guardar y no ayuda a detectar necesidades. «Pegar reseñas» cubre lo útil | Sí |
| D9 | ¿OpenStreetMap en la 2g o en la fase 3? | Fase 3 (como dice la visión) | **2g**: ya estará hecho el marco y suma negocios que Overture no trae. Va en tabla aparte por su licencia | No |
| D10 | ¿Adelantar «Investiga esta empresa» (fase 4)? | No: queda en la fase 4; «Mis webs» ya da lo básico dentro de un proyecto | Dejarlo así y corregir el texto que dice «fase 3» | No |
| D11 | ¿Valen estas seis preguntas para la propuesta (qué vimos, qué puede necesitar, qué ofrecerle, por qué ahora, qué falta confirmar, cómo empezar)? | Sí, esas | Usarlas; si tienes las tuyas, se cambian en minutos | No |
| D12 | «Empezar de cero» en lo aprendido: ¿apagar o borrar? | Apagar (las marcas se conservan) | Apagar | No |
| D13 | Topes por plan: 500 / 2,000 / 5,000 empresas por proyecto; 30 / 150 / 400 webs por corrida | Esos | Esos; se ajustan con datos reales después de la 2c | No |
| D14 | ¿Qué periódicos y fuentes de noticias se activan? | Ninguna hasta probar cada una y leer sus términos | Diario Libre primero; GDELT y otros, uno por uno | No |
| D15 | ¿Registros públicos (DGII, compras del Estado, MICM)? | Apagados | Activar cada uno solo tras leer sus términos; siempre sin cédulas ni personas | No |
| D16 | ¿Avisar por Telegram cuando haya empresas nuevas? | Sí, como mucho una vez al día por proyecto, apagable | Así | No |
| D17 | ¿Consultar a un abogado dominicano (leyes 172-13 y 310-14)? | Sin consulta: la fase 2 funciona entera con «solo llamar»; los textos de correo y WhatsApp en frío quedan apagados | Hacerlo **antes de la 2e-2** si quieres esos textos, y en todo caso antes de la fase 3; una sola consulta junto con el contador, con las preguntas ya escritas (incluye copias de seguridad y datos fuera del país) | Sí (honorarios; se te pregunta antes) |
| D18 | ¿Formulario público propio «Quitar mi negocio»? | No: el negocio lo pide con «Abrir un pedido» (D3) y el administrador lo aplica en un toque | Añadirlo cuando haya dominio o correo propio | No |
| **D19** *(rev. 1; se pregunta)* | ¿Quieres los textos listos de correo y WhatsApp para empresas que no te conocen **antes** de hablar con el abogado? | **No**: solo guion de llamada y botón Llamar | No. Encenderlo cuando el abogado diga que sí y cómo | No |
| D20 *(rev. 1)* | Logos: ¿iconos pequeños (seguro), una foto de hasta 300 KB mostrada reducida, o reducirlas fuera del servidor? | Iconos de hasta 80 KB; inicial y color si no hay | Medir en la 2d cuántas quedan con logo real y decidir con ese número | No |
| D21 *(rev. 1)* | ¿Sumar fuentes extra legales y gratis: YouTube oficial (pide una clave tuya de Google, gratis), Wikidata, datos.gob.do, y enviar la carta modelo a asociaciones? | Apagadas; la carta queda escrita y no se envía | Decidir en la 2g, una por una, tras leer sus términos | No (la clave de YouTube es gratis; UNVERIFIED) |
| D22 *(rev. 1)* | Cuando se pueda usar WhatsApp a mano: ¿con tu número personal o con un segundo número con WhatsApp Business (aplicación gratis)? | No usarlo a diario desde el personal; tope de 5 primeros contactos al día | Segundo número | La línea puede costar: se te pregunta antes |
| D23 *(rev. 1)* | ¿Las copias guardadas **en el servidor** de más de 30 días pueden quitarse si la de Telegram está comprobada? ¿Y resumir la bitácora técnica de tareas de más de 90 días? | No: no se borra nada; si el disco se acerca al freno, la investigación se pausa y avisa | Sí a las dos: las copias de Telegram quedan y la bitácora no es un dato tuyo. Decidir con el número medido en la 2a-1 | No |
| D24 *(rev. 1)* | ¿Empleo va en la fase 4 (plan aprobado) o en la 6 (lo que dice hoy la app)? | No escribir número: «más adelante» | Fase 4, como el plan aprobado, después del vendedor | No |

---

## 17. Registro de cambios

### Revisión 1 — 2026-11-10 (tras las dos críticas; cada punto se comprobó antes de aplicarlo)

Comprobado en el código 0.5.1 y **cierto**: la puerta de red acepta un solo host y no sigue redirecciones (`src/ia/llamar.js` 58-59, 127, 131); el trabajador tiene prohibido `node:https` (`test/reglas.test.js` 205-210); solo existen las cadencias hora, diaria, semanal, mensual y manual (`src/tareas/tiempo.js` 17); tope global de 30 llamadas de IA por hora (`src/ia/config.js` 46); las copias locales no se borran (`src/copias/estado.js` 33); la app dice «fase 6» para empleo en 8 textos. No se pudo comprobar nada en la web (los sitios oficiales no resuelven desde la sesión): todo dato externo sigue UNVERIFIED.

| # | Crítica | Cambio | Dónde |
|---|---|---|---|
| 1 | Contacto en frío «a mano» por correo y WhatsApp (bloqueante, las dos críticas) | Sin base legal: solo guion de llamada y Llamar. Textos de correo y WhatsApp solo con base o tras «Un abogado lo confirmó». Tabla `no_contactar` adelantada a la migración 9. El texto de correo ya trae «Publicidad», identidad y «responda NO». Declarado como debilitamiento de F28 | §0, §1 (F28, F59), 4.5, 6.6, 8.2, 10.1, C16, D17, D19 |
| 2 | La descarga del paquete no funciona con la puerta actual (bloqueante) | Camino principal sin redirección: trozos de 20 MB en la rama `datos`, por `raw.githubusercontent.com`; la «release» pasa a respaldo con una redirección manual a lista fija | 2.1, 12.1, 12.2 |
| 3 | «Quitar mi negocio» sin camino real | Contacto «Abrir un pedido» obligatorio antes de leer la primera web (2c-1); F58 «con límite»; D2 y D3 se preguntan; honestidad sobre copias y paquete público; huella no es anonimato; `exclusiones.ndjson` se fusiona al restaurar | §1, 2.2, 3.5, 6.2, D2, D3, D18 |
| 4 | «Cómo habla» y «todas las fuentes» dependían de lo pegado | «Cómo habla» sale de su propia web (sin IA y con IA); YouTube, Wikidata, datos.gob.do y carta a asociaciones como candidatas apagadas; fila de la meta «con límites» | §1, 3.3, 6.7, 7.3, C23, D21 |
| 5 | Fotos: 40 KB y sin reducir | Orden nuevo de candidatas, tope 80 KB, `og:image` apagada, declarado y medido | §0, §1, 6.3, 9.3, 10.2, C17, D20 |
| 6 | Nota y seguridad dependían de fuentes apagadas | Definición nueva de «Alta»; criterio 4 honesto; F19 y F23 «con límite»; paso 0 lee los términos de todas las fuentes | §0, §1, 6.5, 10.2, 12.2 |
| 7 | «VERIFIED» sobre extractos; paquetes del Estado en repositorio público | Etiqueta «EXTRACTO (cuenta como UNVERIFIED)»; DGII, DGCP y MICM no se publican hasta leer sus términos | 2.1, 12 |
| 8 | Empleo: fase 4 contra fase 6 | Conflicto declarado; ningún número nuevo; decisión del dueño | 14.3, C18, D24 |
| 9 | Diseños que no encajaban | Una sola regla: sin `ADD COLUMN`, con columna `extra`; `borradores` no recibe estados de envío; la fase 3 usa `titular` y reutiliza `no_contactar`; orden 1f → 2a | §4, 4.5, 14.4, 12.2 |
| 10 | «Descubrir» inflaba la base y las copias | Puntuar sin promover; promover solo los N mejores; una evidencia por empresa y fuente; señales con clave estable | 4.2, 6.1 |
| 11 | Segunda puerta de red: choque con reglas y cuatro defensas | Excepción única en la prueba; compresión, letras, certificado, IPv6; freno global; nunca `ts.net` en la identidad | 6.2 |
| 12 | Horarios inexistentes y fila de tareas sin fin | Cadencias nuevas en la 2a-1; menos eventos; aviso por tamaño; pregunta al dueño | 5.1, 6.8, D23 |
| 13 | Datos equivocados como hecho | Reglas de ausencia → pregunta; mensajes en forma de pregunta; noticias dudosas no mueven nada; «Sector equivocado»; nota sobre `titular` | 4.1, 6.4, 6.8, 10.2 |
| 14 | Texto de webs hacia los mensajes | Salida de IA limpia, marcada y nunca enlace; regla dura para la fase 3 | 7.4 |
| 15 | wa.me desde el número personal | Tope diario visible, primer mensaje que pide permiso, aviso y segundo número; todo detrás del interruptor | 6.6, D22 |
| 16 | Reemplazo de la referencia | Nombre por edición, sin WAL, abrir-leer-cerrar | 4.7 |
| 17 | Juntar empresas | Sucursales por `grupo`; huella estable; `celda` con índice | 4.1, 4.3 |
| 18 | IA repetida y frecuencia diaria | Memoria entre corridas; `descubrir` se salta; verdad sobre la frecuencia; reparto de llamadas por hora | 6.1, 7.4 |
| 19 | Partes demasiado grandes | 0.5.2, 2a-1, 2a-2, 2c-1, 2c-2, 2c-3, 2e-1, 2e-2; arranque detrás de un botón | §0, 14.1 |
| 20 | Esquema 4 y vuelta atrás | Regla «leer antes de escribir» y ensayo ampliado | 3.4 |
| 21 | Disco frente a «nunca se borra» | Fila de copias locales con el cálculo; medir en 2a-1; condición para la 2c; pregunta al dueño | 9.3, C19, D23 |
| 22 | Pantallas: nombres de la visión y menú | Mapa «visión → real», un solo menú de 5 lugares, «clientes» solo para quien contrató | 8.6 |
| 23 | Huecos pequeños (F44, F8, F6, F34) | «Corregir» lo aprendido; noticias sin IA declarado; aviso de cambio de web; recordatorio de 7 días | 6.10, C20, C21, C22 |

**No aplicado, y por qué:** (a) corregir «cero riesgo» en `investigacion-whatsapp-meta.md`: el encargo permite editar solo los tres diseños; queda anotado en el plan unificado. (b) Actualizar la copia vieja de `notas/plan23` en el repositorio de notas: no se toca ningún repositorio en esta tarea; queda pendiente y condicionado a la decisión sobre precios y costos fuera del repositorio público. (c) Quitar la frecuencia «diaria»: no se quita (sería recortar); se explica.
