# OPORTIA — Diseño de la FASE 2: «buscar y analizar empresas de verdad»

Fecha: 2026-11-10. Solo diseño: no se tocó ningún repositorio, ni el servidor, ni ninguna cuenta.
Código leído (solo lectura): `wt-claro` = 0.5.1, base 6 (`src/tareas/*`, `src/proyectos/proyectos.js`, `src/motor/*`, `src/ia/*`, `src/nucleo/migraciones.js`, `src/copias/volcado.js`, `test/reglas.test.js`, `public/dibujos.js`).
Notas leídas: `plan-vision.md` (60 funciones), `CONTINUAR.md` (metas del 5 al 10 nov), `decisiones-dueno.md`, `diseno-1d.md` §13, §16 y §18, y los 8 informes de `plan23/`.

---

## 0. Para Junior, en corto (responde «¿afecta el servidor o qué pasará?»)

- **Hoy no pasa nada en tu servidor.** Esto es solo un plan escrito. No se instaló, no se cambió y no se borró nada.
- **Cuando se construya**, la fase 2 llega en 7 partes pequeñas (2a a 2g). Cada una se prueba antes y se instala sola, como las anteriores. Si una falla, el servidor vuelve a la versión anterior y tus datos quedan igual.
- **Qué cambia en el servidor con cada parte:**

| Parte | Qué verás | Qué hace en el servidor |
|---|---|---|
| 2a | Tus proyectos aprobados dejan de decir «espera la fase 2» y muestran empresas reales | Baja una vez una lista abierta de negocios de RD (unos 10 MB) y la guarda en un archivo aparte (unos 60 MB de disco) |
| 2b | Ficha visual de cada empresa y la pantalla «Tareas» | Nada nuevo: solo pantallas |
| 2c | OPORTIA visita la web de cada empresa, despacio | Una web por minuto, como mucho. Sin trucos ni disfraces |
| 2d | Logo o foto, mapa y distancia | Guarda una imagen pequeña por empresa (máximo 40 KB cada una) |
| 2e | Nota de 0 a 100 completa, necesidades y mensaje en borrador | Solo cálculo propio, gratis |
| 2f | Análisis con IA, si tú lo permites en el proyecto | Gasta de tu tope de IA. Hoy el tope es US$0: no gasta nada hasta que tú lo subas |
| 2g | Noticias, más fuentes y sugerencias | Lecturas suaves de fuentes abiertas |

- **Memoria y velocidad:** el servidor (512 MB, 1 procesador) aguanta. El trabajo pesado va por turnos, de noche si se puede, y las pantallas siempre tienen prioridad. Si falta memoria o disco, la búsqueda se pausa sola y te avisa.
- **Dinero:** la fase 2 funciona completa **sin pagar nada**. Lo único que puede costar es la IA (opcional, con tope) y, más adelante, servicios que solo se activan si tú dices que sí (Google de pago, servidor más grande).
- **Tus datos:** no se borra nada. La única excepción propuesta es «Quitar mi negocio», que la ley pide (ver «Conflictos»).
- **Lo que no hará:** no envía correos ni mensajes (eso es la fase 3). No copia Google Maps, Facebook, Instagram ni Páginas Amarillas.

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
| 19 | Noticias | Diario Libre primero; cada periódico es una fuente que se activa tras probarla | 6.8 | 2g |
| 20 | Opiniones y reseñas | Cuadro «Pegar reseñas»; el resto, solo enlace | 6.7 | 2e, 2f |
| 22 | Hecho, Opinión, Señal, Hipótesis | Cada dato con enlace, fecha, etiqueta y seguridad | 4.2 | 2a |
| 23 | Cruzar varias fuentes | La misma empresa suma evidencias de todas las fuentes | 4.3 | 2a–2g |
| 24 | Necesidades que no pidió | 40 reglas «señal → necesidad → oferta» | 6.4 | 2e |
| 25 | Qué ofrecer y propuesta | Propuesta con 6 respuestas; sin IA, plantillas; siempre «Hipótesis» | 6.6 | 2e, 2f |
| 26 | Estrategias | Sugerencias y frases de lo aprendido (el informe sigue sin fase) | 6.9 | 2g |
| 27 | Nota de 0 a 100 | 8 criterios, desglose y seguridad Alta, Media o Baja | 6.5 | 2a (parcial), 2e |
| 28 | Cómo contactar | Correo general de su web, teléfono y WhatsApp como botones que pulsas tú | 6.3 | 2c |
| 29 | Mensajes distintos | Borrador que nombra la señal concreta; sin señal no hay mensaje | 6.6 | 2e, 2f |
| 34 | Historial y seguimiento | Estado por empresa (nueva, guardada, descartada, contactada por ti) y apuntes. El envío es de la fase 3 | 8.3 | 2b |
| 35 | Ciclo «conseguir clientes» | Investiga, encuentra, detecta, recomienda y prepara. Contactar: fase 3 | todo | 2a–2g |
| 44 | Aprender de tus resultados | Marcas «interesado / no / vendido»; mueve la nota desde 20 marcas | 6.10 | 2e |
| 48 | Pantallas | «Empresas» dentro del proyecto, ficha, mapa y «Tareas» | 8 | 2a, 2b, 2d |
| 52 | Trabajo 24/7 y avisos | Cada corrida guarda su punto; aviso «hay empresas nuevas» | 5, 8.4 | 2a |
| 53 | Varios proyectos en servidor pequeño | Turnos justos, 1 tarea normal a la vez | 9 | 2a |
| 58 | Fuentes legales y «Quitar mi negocio» | Lista de exclusión que se revisa antes de importar, mostrar o visitar | 3.5 | 2a |
| 59 | Leyes 172-13 y 310-14 | Solo datos de negocio; nada de envío en frío; reglas en `paises/rd` | 10 | 2a, 2c |
| Meta 5 nov | Fotos y logos, fichas visuales | Logo de su propia web, máximo 40 KB; si no hay, inicial y color | 6.3, 8.2 | 2d |
| Meta 10 nov | Análisis profundo: ubicación, distancia, redes, qué necesita, preguntar si no se sabe | Distancia en línea recta, enlaces a redes, cuadro «Lo que vi en sus redes», «Preguntas para el cliente» | 6.3, 6.7 | 2d, 2e |

Quedan fuera, como dice la visión: F5 «Investiga esta empresa» (fase 4; con la parte 2c ya es casi gratis adelantarla: ver «Decisiones»), F17 fuentes de pago, F21 leer redes sociales, F54 webs con JavaScript, F56 Excel (pero cada dato guarda ya su fuente y su licencia).

---

## 2. Decisiones de base (lo que sostiene todo lo demás)

### 2.1 Cómo llegan los datos de Overture a un servidor sin dependencias

Problema real: Overture se publica en un formato (Parquet) que Node no lee sin librerías, y el servidor tiene cero dependencias, 512 MB y un trabajador con 64 MB de memoria (`BANDERAS_TRABAJADOR`). Nada en las notas lo resuelve.

**Camino principal: «paquetes de datos» preparados fuera del servidor.**

1. En una sesión de Claude en la nube (no en el servidor de Junior), un programa de `herramientas/` lee la edición oficial de Overture, se queda solo con República Dominicana y escribe un archivo propio y sencillo: `oportia-rd-overture-<edición>.ndjson.gz` (una línea JSON por negocio).
2. En ese mismo paso, fuera del servidor, se calcula lo pesado: provincia y municipio de cada punto (punto dentro del límite), sector de OPORTIA según la categoría, nombre normalizado, dominio y teléfono normalizados.
3. El archivo se publica como archivo adjunto de una «release» del repositorio público de OPORTIA. Son datos abiertos, no secretos. Lleva su licencia y su atribución en la primera línea.
4. El código guarda el nombre, el tamaño y el **sha256** de cada paquete en `src/fuentes/paquetes.json`. El servidor solo acepta un archivo que coincide con ese sha256.
5. El trabajador lo baja una vez, lo descomprime en disco y lo importa por partes (200 filas por escritura, punto guardado por posición en el archivo).

Por qué así:
- El servidor no necesita entender el formato de Overture. Si Overture cambia su esquema (ya cambió: ver 12.1), solo cambia el programa de `herramientas/`.
- El servidor ya llega a GitHub (de ahí instala las versiones). No hace falta permitir ningún host nuevo.
- Todo es repetible y verificable: mismo paquete, mismo resultado.

**Camino de respaldo** (si GitHub no sirve el adjunto o el entorno de Claude no llega a Overture): el paquete se parte en archivos de menos de 40 MB dentro de una rama `datos` del repositorio; el servidor los baja igual, con sha256. Segundo respaldo: el administrador sube el archivo desde la pantalla «Fuentes» (subida por trozos; mismo sha256).

Hosts necesarios y desde dónde:

| Host | Desde | Para qué | Estado |
|---|---|---|---|
| Almacenamiento oficial de Overture (S3 o Azure) | Entorno de Claude en la nube | Armar el paquete | Hay que permitirlo en ese entorno (gratis). No verificado en esta sesión |
| `github.com` y su host de descargas de «releases» | Servidor | Bajar el paquete | El servidor ya usa GitHub para actualizarse; confirmar el host exacto de los adjuntos en el paso 0 |
| Webs de las empresas | Servidor | Lector cortés (2c) | Salida abierta del servidor, con protección (6.2) |

### 2.2 Dos archivos de base: lo tuyo y lo de referencia

`src/copias/volcado.js` copia **todas** las tablas de `oportia.db` cada noche y las manda cifradas a Telegram. Si los 90,600 lugares de Overture vivieran ahí, cada copia crecería decenas de MB sin motivo: son datos que se pueden volver a bajar.

- **`oportia.db` (la de siempre, con copia cada noche):** lo que es tuyo o costó trabajo: empresas que algún proyecto encontró, evidencias, notas, apuntes, borradores, exclusiones, lo aprendido.
- **`oportia-referencia.db` (nuevo, sin copia):** las listas abiertas tal como llegan (Overture, luego OpenStreetMap y otras). Si se pierde, se vuelve a importar sola desde el paquete. Tiene su propio esquema mínimo (`PRAGMA user_version`) y lo abre `src/fuentes/referencia.js`.
- **`logos/` (carpeta, sin copia):** una imagen pequeña por empresa. Se puede volver a leer de la web de origen; en la base queda solo la dirección de origen.

Tras restaurar una copia en un servidor nuevo, `fuentes_estado` dice «importada» pero el archivo no existe: `sistema.vigilar` lo nota y encola de nuevo `fuentes.paquete`. Las empresas de los proyectos no se pierden (están en `oportia.db`).

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

### 3.4 Elegir fuentes por proyecto (F13)

- La configuración del proyecto pasa de `esquema: 3` a `esquema: 4`. Hoy `limpiarConfiguracion` pone fijo `fuentes: FUENTES[tipo]`. En el esquema 4, `fuentes` es una lista elegida por la persona entre las que el registro ofrece para ese tipo y que el administrador tiene activas.
- Las claves viejas (`datos_abiertos`, `webs`, `noticias`) se leen como grupos: `datos_abiertos` = `overture` (+ `osm`, `dgcp`, `micm` cuando existan), `webs` = `web_propia` + `mis_webs`, `noticias` = las de noticias. Así una versión aprobada con esquema 3 sigue valiendo **sin reescribirla**.
- Campo nuevo `misWebs`: hasta 30 direcciones `https://…` que el dueño añade. Se validan (6.2) y se investigan como una empresa más.
- Cambiar las fuentes crea una **versión nueva que espera aprobación**, como cualquier cambio (F15).
- El candado «Elegir y añadir fuentes: próximamente (fase 2)» desaparece en la 2c (cuando hay más de una fuente que elegir); en la 2a el texto dice la verdad: «Por ahora hay una sola fuente: datos abiertos de Overture».

### 3.5 «Quitar mi negocio» (F58): sale y no regresa

Tabla `exclusiones` (migración 7). Cada exclusión guarda una **huella** (sha256 del valor normalizado), no el dato: dominio, teléfono, RNC, identificador en la fuente y «nombre normalizado + municipio».

Qué pasa al quitar una empresa (un solo paso, en una transacción):
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
- El negocio: por ahora, escribiendo al contacto público de OPORTIA (página `/bot`, 6.2); el administrador lo aplica en un toque. Un formulario público queda para cuando haya dominio (ver «Decisiones»).

---

## 4. Esquema del catálogo (migraciones 7 a 10, solo agregan)

Reglas que se mantienen (`test/reglas.test.js`): nunca `DROP`, nunca `RENAME`, nunca editar una migración publicada; cada migración nueva sube la versión de `package.json`; las explicaciones van **fuera** del texto SQL; los valores permitidos se revisan en el código (sin `CHECK`). Igual que en las migraciones 5 y 6: **sin `CHECK`, sin `UNIQUE` y sin `ADD COLUMN`** (prueba nueva por cada migración). Los repetidos se evitan en el código, dentro de la misma transacción que escribe, con índices normales para buscar rápido.

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
  creada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS empresas_huella ON empresas(huella);
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

`empresas.huella` = sha256 de «nombre normalizado | municipio | (dominio o teléfono o punto redondeado a 3 decimales)». `empresas.hechos` es un JSON corto (máximo 4 KB): qué hace, hasta 15 productos o servicios, horario si lo publica, sucursales contadas. `redes` es un JSON `{ facebook: url, instagram: url, … }`: solo enlaces.

### 4.2 Procedencia de cada dato (F22)

- **Todo valor visible tiene al menos una fila en `evidencias`** con `fuente`, `url` (o el identificador en la fuente), `vista_en`, `etiqueta`, `confianza` y `licencia`. La fila de `empresas` guarda solo «el mejor valor de hoy» para listar rápido.
- Elegir el mejor valor: gana la evidencia vigente de mayor confianza; a igual confianza, la más reciente; la propia web de la empresa gana a una lista abierta para teléfono, correo y descripción.
- Cuando un dato cambia, la evidencia vieja pasa a `vigente = 0` (no se borra): así se **detectan cambios** (F6) y se puede mostrar «antes decía…».
- `etiqueta`: `hecho` = lo publica la fuente tal cual (teléfono, dirección); `opinion` = reseña pegada; `senal` = algo observado que sugiere algo («no encontramos reservas en las páginas leídas»); `hipotesis` = lo que OPORTIA deduce (necesidad, oferta, propuesta).
- Sin evidencia no hay recomendación: `puntuar` no asigna puntos de «necesidad» sin una fila `senal` vigente.

### 4.3 Juntar la misma empresa de varias fuentes (F23)

`src/catalogo/juntar.js`, función pura `mismaEmpresa(a, b)`:
1. Mismo `fuente` + `id_en_fuente` → es la misma (actualización).
2. Mismo dominio propio (no de red social ni de constructor gratis) → la misma.
3. Mismo teléfono normalizado **y** nombres parecidos (distancia ≤ 2 con `distancia()` de `src/motor/texto.js`, o uno contiene al otro) → la misma.
4. Mismo municipio, puntos a menos de 150 m y nombres parecidos → la misma.
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

`borradores.canal`: correo, whatsapp, llamada (guion). `borradores.estado`: borrador, editado, copiado, descartado. La fase 3 añadirá sus estados de envío (aprobado, enviado…) como valores nuevos: por eso no hay `CHECK`. `borradores.origen`: plantilla, ia, persona. `proyecto_pesos.clase`: sector, senal, zona, tamano.

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

Una edición nueva se importa a un archivo nuevo (`oportia-referencia.nueva.db`) y, cuando termina y pasa su `quick_check`, **reemplaza** al anterior con un cambio de nombre atómico. Las empresas ya promovidas a `oportia.db` no dependen de este archivo.

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
4. **Promover.** Cada lugar que pasa se busca en `empresas` (4.3). Si no está, se crea con sus evidencias `dato` (una por campo: nombre, teléfono, web, punto) y su fila en `empresa_fuentes`. Si está, se actualiza `ultima_vez`.
5. **Enlazar.** `proyecto_empresas`: si no existe el par, se crea como `nueva`.

Es un paso por cada 200 lugares; el cursor es el `id` de la referencia. Una corrida típica (un sector en una provincia: de 50 a 1,500 lugares) termina esta etapa en segundos.

**Antes de aprobar** (F15): la pantalla del proyecto pendiente muestra «Hay unas 312 empresas así en los datos abiertos». Es una cuenta de solo lectura sobre la referencia (`GET /api/proyectos/:n/estimado`), sin crear nada. Si la cuenta es 0, lo dice y sugiere ampliar la zona.

### 6.2 Visitar la web, con educación (2c)

**Una puerta nueva a la red: `src/web/salir.js`.** Hoy `src/ia/llamar.js` es la única llamada a la red: solo va a un host fijo por proveedor y nunca sigue redirecciones. El lector necesita otra cosa (cualquier host público, redirecciones revisadas, dirección fijada). Por eso es un archivo aparte, el **único** que puede abrir conexiones a la web abierta, y `test/reglas.test.js` pasa de «una puerta» a «dos puertas, cada una con sus reglas» (ver «Conflictos»).

Protección contra pedidos hacia adentro (SSRF). El servidor vive en una red privada de Tailscale, así que esto es obligatorio desde el primer día:
- Solo `http:` y `https:`, puertos 80 y 443, sin usuario ni contraseña en la dirección.
- Se resuelve el nombre **una vez**, se rechazan todas las direcciones privadas o especiales (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 incluido 169.254.169.254, 100.64/10 de Tailscale, 0/8, multidifusión, `::1`, `fc00::/7`, `fe80::/10`, `fd7a:115c:a1e0::/48`, IPv4 dentro de IPv6) y se conecta **a esa misma dirección** (opción `lookup` de `node:https`), para que el nombre no pueda cambiar entre la revisión y la conexión.
- Redirecciones a mano, máximo 5, revisando cada salto otra vez. Un salto a otro dominio se anota y solo se sigue si es el mismo sitio (con o sin `www`).
- Nunca manda cookies, claves ni cabeceras de identidad. Nunca hace `POST`.
- Corta a los 20 s por pedido y a los 400 KB por página (lee por trozos y aborta).
- En modo de prueba solo acepta `http://127.0.0.1:<puerto>` (el «sitio falso» de las pruebas), igual que `llamar.js`.

Identidad honesta: `User-Agent: OportiaBot/1.0 (+<dirección pública>/bot)`. La página `/bot` explica en español sencillo qué es, qué lee y cómo pedir que no se lea un sitio. Nunca se disfraza de navegador. Si un sitio responde 403 o pide un captcha, se anota «bloqueó la lectura automática» y **no se insiste**.

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
1. Candidatas en orden: JSON-LD `logo`, `apple-touch-icon`, `og:image`, `link rel=icon`, `/favicon.ico`.
2. Se baja **una** imagen por empresa, solo si pesa ≤ 40 KB (se corta al pasar). Si la primera es más grande, se prueba la siguiente.
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

### 6.5 Nota de 0 a 100 (2a parcial, 2e completa)

`src/comercial/puntuar.js`, función pura `puntuar(hechos, config, pesos) → { nota, desglose[8], seguridad, falta[] }`.

| # | Criterio | Máx. | Cómo se calcula | En 2a |
|---|---|---|---|---|
| 1 | Encaje con lo que vendes | 20 | El sector está entre los buenos para el producto (tabla producto × sector); sector pedido expresamente = máximo | sí |
| 2 | Necesidad detectada | 25 | Suma de `puntos` de las señales vigentes que apuntan al producto del proyecto, con tope; 0 si no hay evidencia | — |
| 3 | Actividad y señales de compra | 15 | Web viva y cambiada, vacantes, noticias de crecimiento; resta por cierre | — |
| 4 | Tamaño y capacidad | 10 | Tamaño (MICM), sucursales, vende al Estado; encaja con `tamanos` del proyecto | — |
| 5 | Se puede contactar | 10 | Correo general 5, teléfono 3, WhatsApp 2 | sí |
| 6 | Zona y distancia | 8 | Dentro de la zona pedida = 5; cercanía al origen hasta 3 | sí |
| 7 | Calidad de los datos | 7 | Número de fuentes que coinciden, frescura, confianza de la fuente | sí |
| 8 | Tus prioridades y lo aprendido | 5 | Coincide con `prioridades` del proyecto; ajuste de `proyecto_pesos` | — |
| | **Total** | **100** | | 45 posibles |

- En la 2a la pantalla dice **«Nota preliminar»** y muestra los criterios que faltan como «por analizar» (no como cero). La nota preliminar se escala a 100 para ordenar, y siempre lleva seguridad Baja o Media.
- **Seguridad:** Alta = 2 fuentes o más coinciden, la web se leyó completa y hay al menos una señal con evidencia de menos de 90 días. Media = una fuente más la web leída, o dos fuentes sin web. Baja = una sola fuente abierta sin web, web `parcial_js`, o datos de más de 12 meses.
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
- Tres salidas: texto para correo, texto para WhatsApp y guion de llamada.
- Botones: **Copiar**, **Llamar** (`tel:`), **WhatsApp** (abre `wa.me` con el texto, y lo envía el dueño desde su teléfono). OPORTIA no envía nada. El envío por correo con aprobación es de la fase 3.
- El borrador se puede editar; queda la versión editada (`estado = 'editado'`) y la fila original no se borra.

### 6.7 Lo que pegas tú y «preguntarle al cliente» (2e)

- **«Lo que vi en sus redes»** y **«Pegar reseñas»**: dos cuadros en la ficha. El texto se guarda como evidencia `pegado` (etiqueta `opinion`), **privada del proyecto**, marcada «dato pegado por ti». Antes de guardar, se quitan teléfonos, correos y lo que parezca nombre de persona seguido de dos puntos (firma de comentario).
- Sin IA: reglas de palabras sobre lo pegado (espera, demora, no contestan, reservar, precio) alimentan M03.
- Con IA (2f): resumen de 3 líneas: cómo habla la empresa, qué ofrece y qué puede necesitar.
- **Preguntas para el cliente** (`preguntas`): cuando una regla necesita un dato que no se puede saber desde fuera, la ficha lo muestra en una lista corta. El dueño puede escribir la respuesta después de hablar con el cliente; esa respuesta entra como evidencia `hecho` con origen `persona` y la nota se recalcula.
- Es la base del «vendedor» de la fase 3: sabrá qué preguntar en vez de inventar.

### 6.8 Noticias (2g)

- `noticias.leer` (cada 6 horas): lee los titulares recientes de cada fuente de noticias activa (por su RSS o su mapa de noticias, según lo que cada periódico publique y permita), con el mismo lector cortés y su robots.txt.
- De cada noticia: titular, enlace, fecha y resumen propio de 300 caracteres como máximo.
- Clasificación por palabras: apertura, sucursal, expansión, inversión, contrata, cierre, despidos.
- Enlace con empresas: el nombre normalizado de una empresa del catálogo (3 palabras o más, o nombre poco común) aparece en el titular o el resumen. Si hay duda, la evidencia es `baja` y dice «podría tratarse de esta empresa».
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
- Pestaña «Lo aprendido»: frases simples («Las ferreterías te han respondido mejor»), con un interruptor para apagar cada una y un botón «Empezar de cero» (pone `activo = 0`; no borra las marcas).
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
| `analizar_empresa` | 16,000 bytes | 700 tokens | US$0.003 | Lee el texto de la web (hasta 8 KB) y los hechos; devuelve qué hace, hasta 4 necesidades con **cita textual**, las 6 respuestas de la propuesta y hasta 3 preguntas |
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

### 8.1 Proyecto → pestaña nueva «Empresas» (2a)

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
- **Mensaje:** el borrador (correo, WhatsApp, guion de llamada), editable, con «Copiar». Dice arriba: «OPORTIA no envía nada: lo envías tú».
- **Mis apuntes:** nota libre del proyecto y el historial (encontrada, vista, guardada, marcada).
- Menú ⋯: «Leer su web de nuevo», «Ubicar mejor», «Descartar», **«Quitar»** (3.5).
- Pie pequeño: de dónde salen los datos y su licencia («Datos: Overture Maps · sitio web de la empresa»).
- En PC: la ficha ocupa la columna derecha; la lista queda visible a la izquierda.

### 8.3 Mapa (2a sencillo, 2d real)

- **2a:** el mapa de casillas de las 32 provincias que ya existe (`public/dibujos.js`), ahora con el número de empresas en cada casilla y color según cuántas hay. Tocar una casilla filtra la lista.
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

- **Inicio:** tarjeta «Empresas nuevas: 40» por proyecto; se quitan los textos «espera la fase 2» (lista exacta en 14, parte 2a).
- **Crear y editar proyecto:** en 2c, selector de **Fuentes** (tarjetas con interruptor y una línea de qué da cada una) y «Mis webs»; en 2d, **Origen** (para la distancia) en el mapa; en 2f, **Tipo de análisis**: «Básico (gratis)» o «Con IA», con el número de empresas y el costo estimado. Todo cambio crea versión que se aprueba.
- **Administrador → Fuentes** (2a): estado de cada fuente, edición, filas, cuándo se importó, licencia, interruptor; botón «Importar ahora».
- **Administrador → Exclusiones** (2a): cuántas hay y un cuadro para quitar un negocio por su web o teléfono (para atender un pedido de «Quitar mi negocio»).
- **Avisos y Telegram:** claves nuevas `proyecto_nuevas:p<id>` (info: «40 empresas nuevas en Hoteles»), `fuente_sin_importar`, `fuente_vieja` (más de 4 meses), `logos_lleno`, `proyecto_sin_marcar`. El aviso de empresas nuevas va por Telegram como mucho una vez al día por proyecto.
- **Ayuda:** palabras nuevas en el glosario: nota, seguridad, evidencia, hecho, señal, hipótesis, fuente, corrida, cortesía.

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
| Una imagen | 40 KB | Corte al pasar |
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
| `oportia.db`: ~5 KB por empresa investigada | 20,000 empresas ≈ 100 MB | aviso al pasar de 300 MB |
| Logos: ~12 KB de media, 40 KB máximo | 20,000 ≈ 250 MB | 300 MB |
| Copias de cada noche | crecen con `oportia.db` solamente | las de siempre |

Total esperado tras un año de uso propio: menos de 1 GB. El freno de disco de la 1c (menos de 300 MB libres) sigue protegiendo. Los números son estimados: se miden en la 2a con el paquete real y se corrigen en el README.

### 9.4 Red

- Web abierta: 1 pedido a la vez, como mucho unos 12 por minuto en total y normalmente 1 web por minuto.
- GitHub: un paquete de ~10 MB cada 1 a 3 meses.
- IA: las llamadas de la 1d (30 por hora por defecto, `llamadasPorHora`); una corrida con IA de 50 empresas tarda al menos 2 horas con ese límite, y es correcto así.

---

## 10. Leyes y límites honestos

### 10.1 Leyes (esto no es consejo legal; lo confirma un abogado dominicano)

- **Ley 172-13 (datos personales):** según los resúmenes leídos, no cubre datos de personas jurídicas ni datos profesionales de contacto; **no está claro** para una persona física con negocio (colmado, taller, profesional). Por eso OPORTIA guarda solo datos del **negocio**: nombre comercial, teléfono y correo generales que el propio negocio publica, dirección del local. Nunca cédulas, nombres de dueños, correos personales ni perfiles personales. «Quitar mi negocio» es el mecanismo de cancelación.
- **Ley 310-14 (correo comercial):** la fase 2 **no envía nada**. Los borradores son para que el dueño llame o escriba él. El envío con aprobación es de la fase 3 y sigue pendiente de la opinión del abogado (F59).
- **Ley 53-07 (acceso ilícito):** solo páginas públicas, sin sesión, sin saltar bloqueos, a ritmo bajo y respetando robots.txt.
- **Datos fuera de RD:** a la IA (servidores en el extranjero) solo va información pública de empresas.
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

---

## 11. Pruebas

Todas en `test/`, sin subcarpetas, sin internet y sin datos reales (reglas actuales). Sitio falso nuevo `test/sitio-falso.js` (como `proveedor-falso.js` y `telegram-falso.js`): sirve en 127.0.0.1 páginas, robots.txt, redirecciones, respuestas lentas, 429, cuerpos enormes e imágenes.

| Archivo | Qué prueba | Parte |
|---|---|---|
| `reglas.test.js` (ampliado) | Migraciones 7–10 sin CHECK, UNIQUE ni ADD COLUMN; dos puertas de red y nada más; nada lee hosts prohibidos; cada fuente y cada tipo bien definidos; el servidor web no carga `src/web/` ni `src/comercial/corrida.js`; única orden de borrado permitida = la imagen de una empresa quitada | todas |
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
| `logo.test.js` | Bytes reales contra tipo declarado; SVG rechazado; más de 40 KB rechazado; cabeceras al servir; tope de carpeta | 2d |
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

Límite de esta sesión: `WebFetch` no pudo abrir ninguna página oficial (`docs.overturemaps.org`, `operations.osmfoundation.org`, `www.rfc-editor.org` y `download.geofabrik.de` no se resuelven: hay que permitirlos en la red del entorno). Solo funcionó la búsqueda, que da extractos. Por eso «VERIFIED» aquí significa **«confirmado por un extracto de búsqueda de la página citada, el 2026-11-10; la página completa no se abrió»**, y todo lo demás es UNVERIFIED.

### 12.1 Tabla

| Hecho | Estado | Fuente |
|---|---|---|
| El tema «places» de Overture se publica con licencia CDLA Permissive 2.0 (y Apache 2.0), sin datos de OpenStreetMap ni obligación de compartir igual | VERIFIED (extracto) | https://docs.overturemaps.org/guides/places , 2026-11-10 |
| Overture retiró la propiedad `categories` a favor de `basic_category` y `taxonomy` en el esquema 2.0.0 (septiembre de 2026) | VERIFIED (extracto) | https://docs.overturemaps.org/blog/2026/08/19/release-notes/ , 2026-11-10 |
| La edición más reciente vista es 2026-10-21.0, con el esquema v2.0.0 | VERIFIED (extracto) | https://docs.overturemaps.org/blog , 2026-11-10 |
| Campos exactos de un lugar (web, redes, teléfonos, correos, estado de operación, confianza) | UNVERIFIED | Abrir https://docs.overturemaps.org/schema/reference/places/place/ |
| «Unos 90,600 lugares en RD» y «60–85 % útil» | UNVERIFIED (viene de la visión) | Se mide al armar el paquete |
| Texto exacto de la atribución que pide Overture | UNVERIFIED | https://docs.overturemaps.org/attribution/ |
| GitHub: cada archivo de una «release» debe pesar menos de 2 GiB; sin límite total ni de ancho de banda | VERIFIED (extracto) | https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases , 2026-11-10 |
| Host exacto desde el que GitHub sirve los adjuntos, y que el servidor llega a él | UNVERIFIED | Probar desde el servidor en el paso 0 |
| RFC 9309: robots.txt con error de servidor o de red = «inalcanzable», y se debe asumir prohibición total; hasta 5 redirecciones seguidas; caché de no más de 24 h | VERIFIED (extracto) | https://datatracker.ietf.org/doc/html/rfc9309 , 2026-11-10 |
| RFC 9309: 4xx = «no disponible», se puede leer; regla más larga gana; `*` y `$`; límite de lectura de 500 KiB | UNVERIFIED (4xx por fuente secundaria; el resto sin extracto) | Abrir el RFC, secciones 2.2 a 2.5 |
| Extracto «Haiti and Dominican Republic» de Geofabrik: ~80 MB en `.osm.pbf`, licencia ODbL 1.0 | VERIFIED (extracto) | https://download.geofabrik.de/central-america.html , 2026-11-10 |
| Nominatim público: máximo 1 pedido por segundo, identificación propia, sin geocodificación masiva | UNVERIFIED en esta sesión (el informe `investigacion-webs-y-senales.md` lo tiene por terceros) | https://operations.osmfoundation.org/policies/nominatim/ |
| Claude Haiku 5.5: US$0.10 y US$0.50 por millón de tokens (entrada y salida) | VERIFIED por el proyecto el 2026-11-05 y el 2026-11-10 (`src/ia/precios.json`, `investigacion-ia-vendedor.md`); no reabierto aquí | https://platform.claude.com/docs/en/about-claude/pricing |
| Términos y robots.txt de DGII, DGCP, MICM y Diario Libre | UNVERIFIED | Leer cada uno antes de activar su fuente |
| Leyes 172-13, 310-14 y 53-07 | UNVERIFIED (resúmenes; `investigacion-leyes-rd.md`) | Abogado |

### 12.2 Paso 0 de la 2a: comprobar antes de construir

1. Permitir en el entorno de Claude: `docs.overturemaps.org` y el almacenamiento oficial de Overture. Abrir la referencia del esquema y la página de atribución; guardar copia fechada en `notas/terminos/overture-<fecha>.md`.
2. Armar el paquete de RD y **medir**: filas, tamaño, cuántas traen teléfono, web y correo, cuántas por sector y por provincia. Corregir los números de la visión si hace falta (y decírselo al dueño en corto).
3. Desde el servidor (leyendo, sin cambiar nada): confirmar que baja un adjunto de «release» de GitHub y anotar el host.
4. Abrir el RFC 9309 y dejar el intérprete de robots fiel al texto.
5. Confirmar que las pruebas siguen sin tocar internet (el paquete de prueba es un archivo pequeño de `test/`).

---

## 13. Riesgos y cómo se evitan

| Riesgo | Cómo se evita |
|---|---|
| Pedidos hacia la red privada (SSRF) por una web maliciosa o una dirección escrita por un usuario | `salir.js` con dirección fijada, rangos privados rechazados, redirecciones revisadas, equipo rojo de 3 rondas |
| Una web enorme o lenta atasca al trabajador | Corte a 400 KB y 20 s; una página por paso; paso de 60 s; zombis ya previstos en la 1c |
| Expresiones regulares que se atascan | Patrones sin retroceso; entrada acotada; prueba de páginas tramposas |
| Texto de una web que intenta mandar a la IA | Bloque de datos escapado; esquema; cita obligatoria; la IA no decide nada |
| Imagen maliciosa | Tipo por bytes; sin SVG; 40 KB; `nosniff`; se sirve con tipo fijo |
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

