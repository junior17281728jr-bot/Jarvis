# Investigación: leer la web de cada empresa con educación, barato y en 512 MB (OPORTIA)

Fecha: 2026-11-10. Alcance: solo diseño. No se tocó ningún repositorio.

## 0. Cómo leer este documento (honestidad sobre las fuentes)

- En esta sesión la red solo dejó pasar la herramienta de búsqueda; los sitios oficiales (osmfoundation.org, rfc-editor.org, sitemaps.org, schema.org) NO se pudieron abrir (error de DNS/red permitida).
- Por eso cada dato lleva una etiqueta:
  - **VERIFIED** = confirmado el 2026-11-10 en una página oficial citada por la búsqueda (url indicada).
  - **VERIFIED-2ª** = confirmado solo por resúmenes de terceros que citan la fuente oficial; falta abrir la oficial.
  - **UNVERIFIED** = conocimiento general o del código; hay que confirmarlo antes de apoyarse en ello.
- Hechos del código de OPORTIA 0.5.1 leídos en `wt-claro` (marcados **CÓDIGO**): son verdad de hoy, no de internet.

### Hechos del propio OPORTIA que condicionan el diseño (CÓDIGO)

| Hecho | Consecuencia |
|---|---|
| `src/motor/lugares.js` (322 líneas) lista 31 provincias + Distrito Nacional, municipios, distritos municipales, sectores y regiones, **solo con nombres y a qué provincia pertenecen; no tiene latitud ni longitud** (búsqueda de `lat/lng/coordenadas` sin resultados útiles). | El «gazetteer offline» no sirve todavía para medir distancias. Hay que **añadir un archivo de coordenadas** (centroides). Es el cambio más importante de esta investigación. |
| `src/tareas/` ya tiene cola, ejecutor, supervisor, modo seguro y trabajador hijo 24/7. | El lector de webs debe ser un **tipo de tarea más**, de una sola en paralelo. |
| No hay ningún lector de webs ni `robots.txt` en el código (búsqueda sin resultados). | Se construye desde cero, sin dependencias. |
| Plan-vision (aprobado): fila 18 «Investigar la web oficial» (solo 1 de cada 3 negocios tiene web; 1-2 min por web; JavaScript puede salir incompleto), fila 28 (solo correos generales; nunca Gmail/Hotmail), fila 24 (≈40 reglas «señal → necesidad → oferta»), fila 54 (webs con JavaScript = servidor de 2 GB, fuera de plan), fila 58 («Quitar mi negocio»). | Este informe **no contradice** ninguna; detalla cómo cumplirlas. |

---

## 1. Ser un buen visitante: robots.txt, identidad y ritmo

### 1.1 Reglas de robots.txt

| Regla | Qué hacer en OPORTIA | Estado |
|---|---|---|
| Google trata cualquier error 4xx (menos 429) como «no existe robots.txt = no hay restricciones». | Igual: 404/403 en robots.txt → se puede leer, con el presupuesto normal. | VERIFIED (https://developers.google.com/search/reference/robots_txt) |
| Google limita robots.txt a 500 KiB y ignora lo que sobre. | Descargar máx. 500 KiB y analizar solo eso. | VERIFIED (misma url) |
| Google **no** admite `Crawl-delay`; solo `user-agent`, `allow`, `disallow`, `sitemap`. | Aun así, **respetarlo nosotros** si aparece (es una petición explícita del dueño del sitio). | VERIFIED (misma url) |
| El estándar RFC 9309 (2022): se busca el grupo del producto más específico, si no el `*`; 5xx = «no accesible», se debe tratar como si todo estuviera prohibido; se puede guardar en caché hasta 24 h. | Si robots.txt da 5xx o se corta la conexión: **no leer ese sitio hoy**, reintentar en 24 h. Caché 24 h. | UNVERIFIED (RFC 9309; sus resúmenes de terceros se contradicen sobre el 5xx, hay que abrir el RFC) |
| Una redirección de robots.txt dentro del mismo sitio se sigue (el RFC pide al menos 5 saltos). | Seguir hasta 5, mismo dominio. | UNVERIFIED |
| Comodines `*` y `$` en rutas, y la regla más larga gana (Allow vs Disallow). | Implementar un intérprete de ~60 líneas. | UNVERIFIED (RFC 9309) |
| Meta `robots` / cabecera `X-Robots-Tag` con `noindex` hablan de buscadores, no de lectura privada. | Registrar, pero **no** usarlas como motivo de no leer; sí respetar `nofollow` para no seguir enlaces de esa página. | UNVERIFIED (criterio propio, conservador) |

**Política OPORTIA propuesta:** si el `robots.txt` prohíbe todo (`Disallow: /`) para nuestro identificador o para `*`, se marca la empresa como «el sitio pidió no ser leído» y se usa solo lo público de otras fuentes (Overture, noticias). Nunca se «prueba» para ver si funciona igual.

### 1.2 Identificación (User-Agent)

- Enviar un nombre **honesto**, nunca uno falso de navegador. Ejemplo: `OportiaBot/1.0 (+https://<dominio-o-ficha>/bot)`.
- La página `/bot` debe decir en lenguaje simple qué es, qué lee, cómo pedir que se deje de leer. **Decisión del dueño**: qué contacto y dominio mostrar (no poner el correo personal de Junior ni secretos en el repositorio público).
- Consecuencia aceptada: algunos sitios con protección anti-robots devolverán 403; se registra «bloqueó la lectura automática» y NO se intenta saltar (sin cambiar de identidad, sin proxies, sin captchas).

### 1.3 Ritmo y presupuesto por sitio

| Parámetro | Valor propuesto | Por qué |
|---|---|---|
| Peticiones a la vez en todo el servidor | **1** | 1 vCPU/512 MB; además es lo más cortés. |
| Pausa entre peticiones al mismo sitio | **≥ 5 s** (o el `Crawl-delay` si es mayor; si pide > 30 s, se salta el sitio y se reintenta después) | Cortesía; encaja con «1-2 min por web» del plan. UNVERIFIED (criterio propio; no hay norma oficial). |
| Páginas por sitio | **máx. 8** (robots.txt + inicio + contacto + «nosotros» + servicios/productos + 1 de empleo/blog + sitemap + 1 libre) | El plan promete 1-2 min por web. |
| Tamaño por página | **máx. 400 KB** leídos en flujo; se corta al llegar | Memoria baja. |
| Tiempo total por sitio | **90 s** y un solo reintento tras 24 h | Evitar atascos en la cola. |
| Respuestas 429/503 o `Retry-After` | Parar ese sitio, esperar lo que diga (máx. 24 h), luego una sola vez más | Cortesía. |
| Frecuencia de relectura | **no antes de 30 días** salvo petición del dueño | Costo y cortesía. |
| Horario | Preferir noche local de RD (menos carga de ellos) | Opcional. UNVERIFIED. |
| Qué no hacer jamás | Iniciar sesión, enviar formularios, ejecutar JavaScript, pasar captchas, leer rutas `Disallow`, leer `/wp-admin`, `/admin`, carritos, buscadores internos | Regla del dueño: solo público y legal. |

Capacidad aproximada: ~8 peticiones con pausa de 5 s ≈ 40-70 s por sitio → **unas 1,000-1,500 webs al día** en un solo hilo (cálculo propio, UNVERIFIED hasta medirlo).

### 1.4 Lectura «sin dependencias» y segura (512 MB)

| Pieza | Cómo, sin npm | Estado |
|---|---|---|
| Descarga | `fetch` global de Node 22 o `node:https`; descompresión automática gzip/br; leer el cuerpo por trozos y abortar a 400 KB. | UNVERIFIED (Node 22 incluye fetch; ya usado por `src/ia`: revisar `src/nucleo/red.js`) |
| HTML | Sin árbol DOM: un tokenizador pequeño con expresiones regulares para `<title>`, `<meta>`, `<link>`, `<a href>`, `<script type="application/ld+json">`, texto visible (quitando `<script>/<style>`), cortado a 60 KB de texto. | UNVERIFIED (diseño propio) |
| Memoria | Nunca guardar el HTML; guardar solo los **hechos extraídos** (≈2-4 KB por empresa en JSON) y un hash por si luego se quiere detectar cambios. | Diseño propio |
| **Seguridad SSRF** (crítico en un servidor con Tailscale) | Antes de conectar: resolver el nombre y **rechazar** IP privadas, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254.0.0/16` (incluye el metadato de DigitalOcean 169.254.169.254), `100.64.0.0/10` (Tailscale) e IPv6 locales; conectar a la IP ya validada (opción `lookup` de `node:https`) para evitar «DNS rebinding»; solo `http`/`https`, puertos 80/443; redirecciones a mano (máx. 5) y revalidando cada salto. | UNVERIFIED (buena práctica estándar; rangos son los reservados conocidos) |
| Seguir solo el mismo sitio | Las páginas extra salen del mismo dominio (www y sin www cuentan igual). Los enlaces a otros dominios solo se **guardan** (redes sociales), no se visitan. | Diseño propio |
| Webs con JavaScript | Se leen incompletas (HTML inicial). Si el cuerpo visible es < 300 caracteres y hay `id="root"`/`__NEXT_DATA__`/`ng-app`, marcar «web hecha con JavaScript, lectura parcial», baja confianza. | Coincide con plan-vision fila 18/54 (CÓDIGO/plan). |

---

## 2. Qué extraer (y qué NO)

### 2.1 Tabla de extracción

| Dato | De dónde sale | Regla de calidad | Estado |
|---|---|---|---|
| Qué hace la empresa | `<title>`, `meta description`, `og:description`, `og:site_name`, JSON-LD (`name`, `description`, `@type`), encabezados H1/H2 de la portada | Texto corto (≤ 300 car.); guardar la URL fuente | UNVERIFIED (práctica estándar) |
| Productos/servicios | Menús y encabezados de páginas «servicios/productos/menú/catálogo»; JSON-LD `Product`, `Service`, `hasOfferCatalog`, `Menu` | Lista de ≤ 15 nombres, sin precios copiados masivamente | UNVERIFIED |
| Ubicaciones | JSON-LD `address`/`PostalAddress`, `geo`, `<address>`, página «contacto/sucursales», enlace a mapa | Texto de dirección + provincia/municipio reconocido con `lugares.js` | UNVERIFIED |
| Correos genéricos | `mailto:` y texto de la página de contacto | **Solo** prefijos permitidos (3.1) | Plan-vision fila 28 (CÓDIGO/plan) |
| Teléfonos | enlaces `tel:` y JSON-LD `telephone`; texto con formato dominicano (`809`, `829`, `849` +1) | Guardar tal cual y marcar si es celular o fijo solo si la web lo dice | UNVERIFIED (prefijos conocidos) |
| WhatsApp | enlaces `wa.me/…`, `api.whatsapp.com/send?phone=…`, `whatsapp://send` | Solo guardar el enlace; OPORTIA no envía nada sola (plan: botones que envía Junior) | UNVERIFIED |
| Redes sociales | enlaces a facebook.com, instagram.com, tiktok.com, x.com/twitter.com, linkedin.com, youtube.com, JSON-LD `sameAs` | Guardar el enlace (para analizar «cómo habla» más adelante **a mano o con permiso**; no leer Facebook/Instagram automáticamente) | `sameAs` en schema.org: UNVERIFIED |
| Logo / imagen | JSON-LD `logo`/`image`, `og:image`, `<link rel="apple-touch-icon">`, `<link rel="icon">`, `/favicon.ico` | Ver sección 5 | UNVERIFIED |
| Señales técnicas | Ver sección 6 | Siempre como **hipótesis con confianza**, no como hecho | Propio |
| Empleo = crecimiento | enlaces/palabras «trabaja con nosotros», «vacantes», «empleos», «careers», JSON-LD `JobPosting` | Alimenta también el módulo laboral (plan-vision fila 42) | `JobPosting` en schema.org: UNVERIFIED |

### 2.2 Datos estructurados (schema.org JSON-LD y OpenGraph)

- Tipos útiles a buscar: `Organization`, `LocalBusiness` y subtipos (`Restaurant`, `Hotel`, `Dentist`, `Store`…), `PostalAddress`, `GeoCoordinates`, `OpeningHoursSpecification`, `Product`, `Offer`, `Service`, `JobPosting`, `ContactPoint`, `sameAs`. UNVERIFIED (vocabulario de schema.org; confirmar en https://schema.org).
- El JSON-LD va en `<script type="application/ld+json">`; puede traer una lista o `@graph`; puede estar roto → analizar con `JSON.parse` dentro de `try/catch` y descartar si falla. UNVERIFIED.
- OpenGraph: etiquetas `og:title`, `og:description`, `og:image`, `og:site_name`, `og:type`, `og:locale`. UNVERIFIED (https://ogp.me).
- Regla: **lo que la propia empresa publica como dato estructurado vale más** que lo adivinado del texto (confianza Alta si coincide con otra fuente).

### 2.3 sitemap.xml

| Hecho | Uso | Estado |
|---|---|---|
| Máximo 50,000 URLs y 50 MB (sin comprimir) por archivo; un índice puede listar hasta 50,000 sitemaps. | Leer **como máximo los primeros 400 KB** del sitemap (o del índice) y **elegir hasta 3 URLs** de interés (contacto, nosotros, servicios, empleo) por palabras en la ruta. No recorrer el sitio entero. | VERIFIED (https://sitemaps.org/faq.php, vía búsqueda) |
| El sitemap suele anunciarse con `Sitemap:` en `robots.txt` o estar en `/sitemap.xml`. | Mirar primero robots.txt; probar `/sitemap.xml` solo si robots.txt no dice nada. | VERIFIED-2ª / UNVERIFIED |
| Archivos `.gz`. | Si es `.gz`, descomprimir con `node:zlib` limitando la salida a 2 MB. | UNVERIFIED |
| `<lastmod>` en las URLs. | Una web sin cambios hace años = «web abandonada/vieja» (señal débil). | UNVERIFIED |

---

## 3. Contactos: qué guardar y qué no

### 3.1 Correos

| Se guarda | No se guarda |
|---|---|
| Prefijos genéricos en el **dominio propio de la empresa**: `info`, `ventas`, `contacto`, `contact`, `hola`, `comercial`, `mercadeo`, `reservas`, `reservaciones`, `servicio`, `servicioalcliente`, `clientes`, `soporte`, `admin`, `gerencia`, `rrhh`/`empleos` (solo para empleo) | Cualquier correo en `gmail`, `hotmail`, `outlook`, `live`, `msn`, `yahoo`, `icloud`, `proton*`, `aol` (son personales) |
| | Correos con forma de nombre de persona (`juan.perez@…`, `jperez@…`) aunque sean del dominio de la empresa: son datos personales |
| | Cualquier correo que salga de otra página, foro, filtración o archivo; solo de la web oficial de esa empresa |

- Se guarda la **URL de la página donde se vio** (evidencia) y la fecha.
- Correos «ofuscados» (por ejemplo, la protección de Cloudflare codifica el correo con una clave sencilla): decodificarlo es técnicamente fácil, pero no lo vemos como obligatorio. **Decisión del dueño** (default: NO decodificar, tratarlo como «correo oculto por la empresa»). UNVERIFIED.
- Base legal (RD): la Ley 172-13 (protección de datos personales) se apoya en consentimiento, finalidad y seguridad; la Ley 310-14 regula el correo comercial no solicitado y exige consentimiento salvo excepciones, y una de ellas sería una relación comercial previa sin oposición. VERIFIED-2ª (DLA Piper https://www.dlapiperdataprotection.com/?c=DO&t=law ; Lex Mundi https://www.lexmundi.com/guides/data-privacy-guide/jurisdictions/caribbean/dominican-republic). **No se encontró** el texto exacto de requisitos y multas; el texto oficial está en https://wp.ogtic.gob.do/wp-content/uploads/2019/02/Ley-310-14.pdf. Esto no es consejo legal: coincide con el punto ya pendiente del plan (abogado antes de enviar correos fríos).
- Teléfonos y WhatsApp de un negocio publicados por el propio negocio para ser contactado: se guardan, pero **OPORTIA no escribe sola**; Junior pulsa «Llamar/WhatsApp» (plan-vision fila 28).

---

## 4. Geolocalización y distancia sin servicios de pago

### 4.1 Orden de preferencia para ubicar una empresa

| # | Fuente | Costo | Notas | Estado |
|---|---|---|---|---|
| 1 | Coordenadas que ya trae la fuente de datos abiertos del plan (Overture Maps) | 0 | El plan dice que casi todo sale de Overture; verificar que el campo de coordenadas se guarde al importar. | Plan-vision fila 13; que Overture incluya coordenadas: UNVERIFIED |
| 2 | JSON-LD `geo` (`latitude`/`longitude`) de la propia web | 0 | Dato publicado por la empresa. | UNVERIFIED |
| 3 | Enlace/iframe de mapa en la página de contacto con coordenadas en la URL | 0 (solo leer el texto, **sin abrir** el mapa) | Frágil; confianza media. | UNVERIFIED |
| 4 | **Centroide del municipio/sector** reconocido en la dirección con `lugares.js` + archivo de coordenadas nuevo | 0 | Siempre disponible, precisión «zona» (varios km). | CÓDIGO (nombres sí, coordenadas no) |
| 5 | Nominatim público para direcciones sueltas | 0 pero con límites | Ver 4.2. Solo bajo demanda. | VERIFIED-2ª |

### 4.2 Política de uso de Nominatim (servidor público de OpenStreetMap)

| Regla | Detalle | Estado |
|---|---|---|
| Máximo absoluto **1 petición por segundo** para toda la aplicación (no por usuario), sin «uso pesado». | Cola propia con ≥ 1.1 s entre llamadas. | VERIFIED-2ª (cita de la política en https://bugzilla.gnome.org/show_bug.cgi?id=706044 ; oficial: https://operations.osmfoundation.org/policies/nominatim/, no abierta) |
| Hay que enviar un User-Agent (o Referer) que identifique la aplicación; los de librerías por defecto no valen; suplantar un navegador viola la política. | `OportiaBot/1.0 (+contacto)`. | VERIFIED-2ª (resumen de https://jentic.com/apis/openstreetmap.org/openstreetmap y foro de OSM) |
| Peticiones sin User-Agent pueden dar 403. | — | VERIFIED-2ª (baja calidad) |
| Guardar en caché los resultados y no repetir consultas; la geocodificación masiva (miles de direcciones) no es bienvenida. | Guardar siempre el resultado (también «no encontrado»). Máx. ~200 consultas/día en total; **jamás** para recorrer todas las empresas. | UNVERIFIED (la política oficial lo pide; sin cifra oficial para el «máximo diario») |
| Atribución «© OpenStreetMap contributors» (licencia ODbL). | Mostrarla en la ficha cuando el dato viene de OSM. | UNVERIFIED (confirmar en https://www.openstreetmap.org/copyright) |
| Alternativas gratuitas con coordenadas: GeoNames (CC-BY 4.0), centroides propios. | GeoNames sirve para sembrar el archivo de centroides (una sola vez, con atribución). | UNVERIFIED |

### 4.3 Qué hacer en OPORTIA (propuesta)

1. **Archivo nuevo `lugares-coordenadas.json`** (~10-20 KB, dentro del código): una latitud/longitud aproximada por cada provincia, municipio y sector conocido de `lugares.js`. Se compila una vez y se revisa a mano; es público y legal. Las fuentes del dato (OSM/GeoNames) llevan atribución en la pantalla «Acerca de».
2. **Distancia** = fórmula de Haversine (10 líneas) en línea recta, mostrada como «a unos 12 km (en línea recta)». Nunca como minutos de manejo (eso necesita un servicio de rutas).
3. **Origen** = una ubicación base por proyecto (la zona del proyecto o la del propio Junior, que él elige en el mapa de provincias ya existente) → su centroide.
4. **Precisión visible**: cada ubicación lleva una etiqueta «exacta / de la web / de la zona». Si es «de la zona», la distancia dice «aprox.».
5. Nominatim solo si Junior abre una ficha y pulsa «Ubicar mejor», una a la vez (cola de 1 por segundo, caché permanente).

---

## 5. Logo/foto para la tarjeta de la empresa

| Tema | Propuesta | Estado |
|---|---|---|
| Orden de búsqueda | 1) JSON-LD `logo` 2) `apple-touch-icon` (suele ser 180×180) 3) `og:image` 4) `link rel=icon` 5) `/favicon.ico`. Si nada sirve: tarjeta con la inicial de la empresa y un color (sin imagen). | UNVERIFIED |
| Sin dependencias no hay redimensionado (no hay `sharp`) | **No se redimensiona.** Se descarga solo si pesa ≤ 40 KB; si pesa más, se prefiere otra candidata más pequeña; si ninguna cabe, no se guarda imagen (se muestra solo el enlace/inicial). | Diseño propio |
| Validar | Comprobar el tipo real con los primeros bytes (PNG, JPEG, WebP, GIF, ICO, SVG); rechazar lo demás; tamaño máx. 40 KB; una imagen por empresa. | Diseño propio |
| SVG | Puede traer scripts. **Nunca** incrustarlo en línea: servirlo como imagen (`<img>`) con `Content-Type: image/svg+xml` y `Content-Security-Policy: default-src 'none'`, o descartar el SVG (default). | UNVERIFIED (riesgo conocido de SVG) |
| Dónde guardar | Archivo en disco (`datos/logos/<id>.<ext>`) con ruta en la base; **no** dentro de SQLite. Cálculo: 20,000 empresas × 40 KB máx. = 0.8 GB, aceptable en ~10 GB; en la práctica la media rondará 10-15 KB. | Cálculo propio |
| Copias de seguridad | Las imágenes **no** van en la copia cifrada (son recuperables al releer); se guarda solo la URL de origen. Evita inflar las copias de Telegram. | Propuesta; decisión de diseño |
| Atribución y derechos | Cada tarjeta muestra «Imagen: sitio web de la empresa» con el enlace de origen. Los logos son marcas registradas del dueño: se usan **solo para identificar a la empresa dentro de OPORTIA**, nunca en mensajes salientes, anuncios ni propuestas sin permiso. | Criterio propio; no es consejo legal |
| Enlazar directo (hotlink) | **No** cargar la imagen de la web ajena en la pantalla de Junior (revela su IP y consume su ancho de banda). Se copia una vez, pequeña. | Criterio propio |
| Quitar | «Quitar mi negocio» (plan-vision fila 58) borra también la imagen. | Plan-vision |

---

## 6. Señales de necesidad → producto (con ejemplos)

Regla general: **una señal es una pista, no una prueba.** Se lee a lo sumo 8 páginas sin JavaScript; que algo «no aparezca» puede ser un fallo de lectura. Cada señal lleva confianza (Alta/Media/Baja) y la frase «lo que vimos / lo que falta» con su enlace. Esto es el detalle técnico de las «≈40 reglas» del plan (fila 24).

### 6.1 Señales técnicas de la web

| Señal detectada | Cómo se detecta sin dependencias | Confianza | Estado |
|---|---|---|---|
| Sin SSL / sitio solo `http://` o certificado vencido | Intentar `https://`; con `node:tls` leer fecha de vencimiento y si falla la validación | Alta | UNVERIFIED (técnica estándar) |
| Web antigua | `© 2016` o año del pie < año actual − 3; sin `<meta name="viewport">` (no pensada para teléfono); `<table>` para maquetar, `<font>`, `<marquee>`, Flash; `generator` con versión muy vieja; `lastmod` del sitemap viejo | Media | UNVERIFIED |
| Sin comercio electrónico | No hay carrito/«agregar al carrito»/`/cart`/`/checkout`, ni WooCommerce/Shopify/Magento en `generator`/scripts, ni JSON-LD `Offer` con precio, pero sí lista de productos | Media | UNVERIFIED |
| Sin reservas en línea | No hay enlaces a Calendly, Cal.com, Booksy, Fresha, OpenTable, Booking, «reservar»/«agendar cita»; solo teléfono/WhatsApp | Media | UNVERIFIED (nombres de plataformas conocidos; la lista se ajusta) |
| Contacto solo por teléfono/WhatsApp/redes | No hay formulario ni correo propio; el «sitio web» es una página de Facebook/Instagram | Alta (si el «sitio» es Facebook) | UNVERIFIED |
| Sin sitio web propio | Solo Overture/redes sin dominio propio (2 de cada 3 negocios, según plan-vision fila 18) | Alta | Plan-vision |
| Constructor básico/gratis (Wix, Weebly, Blogger, subdominio gratuito) | `generator`, dominios `wixsite.com`, `blogspot.com`… | Media | UNVERIFIED |
| Crecimiento | «Trabaja con nosotros», vacantes recientes, JSON-LD `JobPosting`, «nueva sucursal», «próximamente» | Media | UNVERIFIED |
| Muchas sucursales/ubicaciones | ≥ 3 direcciones distintas en la web | Media | UNVERIFIED |
| Catálogo grande sin control de existencias | Muchos productos y frases «consulte disponibilidad», «llame para precio/existencia» | Baja | UNVERIFIED |

### 6.2 Mapa señal → necesidad → producto

| Producto que vende Junior | Señales que lo sugieren | Ejemplo concreto (hipótesis que muestra la ficha) |
|---|---|---|
| **Página web nueva o renovada** | Sin web propia; solo redes; sin SSL; sin viewport; año viejo; constructor gratuito | «Peluquería en Moca: solo tiene Instagram y un número de WhatsApp. Propuesta: página con horarios, ubicación y botón de WhatsApp.» |
| **Sistema de reservas / citas** | Clínicas, salones, restaurantes, hoteles, gimnasios, talleres **y** sin plataforma de reservas **y** contacto solo por llamada/WhatsApp | «Clínica dental: pide cita «llamando». Propuesta: agenda en línea con recordatorios.» |
| **Software de inventario** | Ferreterías, colmados grandes, farmacias, almacenes, distribuidoras, tiendas con catálogo extenso; frases «consulte disponibilidad»; varias sucursales | «Ferretería con 3 sucursales y catálogo sin existencias: inventario compartido.» |
| **Tienda en línea / comercio electrónico** | Tiene productos con fotos y precios **y** no tiene carrito; vende por WhatsApp | «Joyería con catálogo en Instagram: tienda con pagos.» |
| **Software a medida / gestión (facturación, agenda, CRM)** | Muchas sucursales; ofertas de empleo para administrativos; procesos manuales visibles (formularios por papel, «descargue y envíe por correo») | «Constructora con formulario en PDF para cotizar: portal de solicitudes.» |
| **Paneles solares** | **Alto consumo de energía** por tipo de negocio: hoteles, supermercados, frigoríficos/cuartos fríos, panaderías, lavanderías, fábricas, granjas, escuelas, clínicas, gimnasios con piscina o aire; techo grande (nave/almacén); menciones de «eficiencia», «sostenible», «apagones», «planta eléctrica» o «generador» | «Supermercado con 2 sucursales y refrigeración: ahorro con paneles; confirmar techo y factura con el cliente.» |
| **Otros (catálogo de lo que Claude puede construir)** | Aplicación móvil, chatbot de atención, automatización de WhatsApp, panel de reportes | Se añade en el catálogo; regla nueva en la tabla señal→necesidad→oferta (plan-vision fila 24). |

Notas honestas:
- Los paneles solares dependen del **tipo de negocio** (se sabe por la categoría de Overture/el texto) más que de la web: la web casi nunca dice cuánta luz gastan. La ficha debe decir «Pregunta al cliente: ¿cuánto paga de luz al mes?». (Coincide con tu idea de «preguntar al cliente cuando no se sabe».)
- «No tiene reservas» se afirma como «no encontramos reservas en las páginas leídas» (nunca «no tiene»).
- Cada señal se guarda con: texto, URL, fecha, confianza y regla que la produjo, para que Junior vea la evidencia y para el aprendizaje (qué señales terminaron en venta).

---

## 7. Lo que NO es posible/no se recomienda con este servidor

| Tema | Motivo |
|---|---|
| Leer Facebook/Instagram/TikTok «cómo habla en redes» automáticamente | Requiere inicio de sesión, rompe sus condiciones de uso y el plan prohíbe copiarlas (plan-vision fila 58). Solo guardar el enlace; análisis manual o futuro con API oficial/permiso. |
| Webs con JavaScript | Lectura parcial; un navegador sin pantalla necesita ~2 GB (plan-vision fila 54). |
| Mapas de rutas y tiempos de manejo | Servicio de pago; solo línea recta. |
| Leer cientos de páginas por sitio | Rompe presupuesto de cortesía y de tiempo. |

---

## Recomendación para OPORTIA

- Construir **un solo lector** como tipo de tarea de la cola actual, con **1 petición a la vez, pausa ≥ 5 s por sitio, máx. 8 páginas y 400 KB por página**; no guarda HTML, solo hechos con su URL y fecha.
- Identificarse siempre como `OportiaBot/1.0` con una página `/bot` en español sencillo; respetar `robots.txt` (cache 24 h, `Crawl-delay`, `Disallow`, 5xx = hoy no) y no intentar saltar bloqueos (403/captcha).
- Incluir **protección SSRF** desde el primer día (rangos privados, 169.254.169.254 de DigitalOcean y Tailscale 100.64/10; redirecciones revalidadas).
- Guardar solo correos **genéricos del dominio propio** (info@, ventas@…); nunca Gmail/Hotmail ni nombres de personas; teléfonos y WhatsApp como enlace; OPORTIA nunca envía sola.
- Añadir `lugares-coordenadas.json` (centroides por provincia/municipio/sector) porque `lugares.js` hoy **no tiene coordenadas**; distancia por Haversine en línea recta con etiqueta de precisión; Nominatim solo bajo demanda, 1 por segundo, con caché permanente.
- Logo: una imagen por empresa ≤ 40 KB en disco (no en SQLite ni en la copia cifrada), validada por bytes, SVG descartado, atribución «Imagen: sitio web de la empresa»; sin imagen, tarjeta con inicial y color.
- Convertir las señales en **hipótesis con confianza y evidencia** (SSL, web vieja, sin carrito, sin reservas, empleo, tipo de negocio) mapeadas a web, reservas, inventario, tienda, software y paneles; para paneles y casos dudosos, la ficha pide el dato al cliente.
- Marcar «web con JavaScript: lectura parcial» en lugar de inventar datos; no leer redes sociales automáticamente.
- Antes de construir: abrir y confirmar en los sitios oficiales los puntos UNVERIFIED (RFC 9309, política de Nominatim, schema.org, texto de la Ley 310-14) cuando la red lo permita, y pedir revisión del abogado sobre el contacto en frío.
- Respetar «Quitar mi negocio»: borra ficha, imagen y contactos de esa empresa y evita volver a leerla.

## Decisiones del dueño (con valor seguro por defecto)

| # | Decisión | Default seguro |
|---|---|---|
| 1 | ¿Qué nombre/contacto público lleva el lector (`OportiaBot`) y dónde se explica? | Nombre `OportiaBot`, página `/bot` sin datos personales; el contacto es un correo genérico del proyecto, nunca el personal de Junior. |
| 2 | ¿Cuántas páginas por web y cada cuánto releer? | 8 páginas, relectura cada 30 días, solo una web a la vez. |
| 3 | ¿Si una web pide no ser leída o da 403? | Se respeta y se anota «no leída»; nunca se insiste ni se cambia de identidad. |
| 4 | ¿Guardar logos de las empresas en el servidor? | Sí, máx. 40 KB por empresa, solo para la tarjeta interna, con atribución; nada en mensajes a clientes. |
| 5 | ¿Aprobar el archivo de coordenadas (centroides) de lugares? | Sí, empezar por provincias y municipios; sectores después; mostrar «aprox.». |
| 6 | ¿Permitir «Ubicar mejor» con Nominatim (gratis, 1 por segundo)? | Sí, solo al pulsar el botón en una ficha, con caché; nunca en masa. |
| 7 | ¿Decodificar correos que la web oculta con protección anti-robots? | No; se anota «correo oculto por la empresa». |
| 8 | ¿Qué hacer con webs hechas con JavaScript (lectura parcial)? | Aceptar lectura parcial con confianza Baja; no contratar servidor de 2 GB sin preguntarte. |
| 9 | ¿Las señales de necesidad se muestran como hipótesis o como afirmaciones? | Siempre como hipótesis con evidencia («no encontramos reservas en las páginas leídas»). |
| 10 | ¿Contacto en frío por correo, mientras el abogado no confirme la Ley 310-14? | Solo preparar el texto; envío manual de Junior, uno a uno, y a correos genéricos de empresas; nada automático. |
