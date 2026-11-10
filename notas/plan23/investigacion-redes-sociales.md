# Investigación: qué se puede saber de las redes sociales de una empresa (sin scraping)

Fecha: 2026-11-10. Solo diseño; no se contactó ningún servicio con cuenta ni se envió nada.

## 0. Cómo leer los sellos (importante, honestidad primero)

En esta sesión `WebFetch` NO pudo abrir las páginas oficiales (developers.facebook.com, developers.google.com, facebook.com: el host no está permitido en la red de la sesión). Solo funcionó `WebSearch`, que devuelve extractos de páginas oficiales y también blogs.

- **VERIFIED**: el hecho aparece en un extracto de la página oficial citada (visto en WebSearch el 2026-11-10). No pude abrir la página completa.
- **UNVERIFIED**: viene de blogs, terceros o de mi memoria; hay que confirmarlo en la página oficial antes de construir.
- Para marcar lo contrario: si un hecho sale solo de un tercero, NUNCA es VERIFIED.

Acción pendiente: permitir developers.facebook.com, developers.google.com, linkedin.com, developer.x.com y developers.tiktok.com en la red de la sesión y re-verificar la tabla 2.

## 1. Respuesta corta

Sin API aprobada, OPORTIA puede aprender de las redes de una empresa solo tres cosas: (a) el **enlace** que la propia empresa publica en su web (la URL ya dice la red y el usuario), (b) lo que el **dueño pega o importa** a mano, (c) en YouTube, datos públicos por la **API oficial gratuita** con cuota. Leer publicaciones, comentarios o seguidores de Facebook/Instagram/LinkedIn/X/TikTok automáticamente exige aprobación o está prohibido.

## 2. Tabla por plataforma

Leyenda: PERMITIDO = sin aprobación; APROBACIÓN = API oficial con revisión/contrato; PROHIBIDO = viola términos.

| Plataforma | Qué | Estado | Hecho y fuente | Sello |
|---|---|---|---|---|
| Meta (Facebook/Instagram) | Recolectar datos con medios automáticos (bots, scrapers) sin permiso previo | PROHIBIDO | Los Términos de Meta prohíben recolectar datos con medios automatizados sin permiso previo, con o sin sesión iniciada; la recolección permitida sigue sus «Automated Data Collection Terms». Citado por conductatlas.com y socialmediatoday.com (terceros); texto oficial no abierto. | UNVERIFIED (fuente: https://www.facebook.com/terms.php, no accesible) |
| Meta | Fallo Meta v. Bright Data (N.D. Cal., ene 2024): raspar datos públicos sin sesión no incumplió los términos en ese caso | Contexto legal, NO permiso | Fenwick & West: https://www.fbm.com/business-litigation/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/ . Es de un caso concreto; no autoriza a OPORTIA y Meta puede bloquear o demandar por otras vías. Regla del dueño: no hacerlo. | UNVERIFIED (resumen jurídico de tercero) |
| Facebook Pages (Graph API) | Leer datos públicos de páginas que NO administras | APROBACIÓN | La función «Page Public Content Access» da acceso a datos públicos de páginas sin los permisos pages_read_engagement / pages_read_user_content; hay que enviarla a App Review; sin ella, en modo live no se ve contenido público de otras páginas. https://developers.facebook.com/docs/features-reference/page-public-content-access | VERIFIED (extracto vía búsqueda) |
| Facebook Pages | «Page Public Metadata Access» (versión ligera: nombre, about, etc.) | APROBACIÓN, y ya reemplazada | Requiere App Review y está superada por Page Public Content Access. https://developers.facebook.com/docs/features-reference/page-public-metadata-access | VERIFIED (extracto vía búsqueda) |
| Facebook Pages | Sin aprobación, la llamada a campos como `about`,`fan_count` de otra página devuelve error pidiendo pages_read_engagement o PPCA/PPMA | Bloqueado | Hilo del foro de desarrolladores de Meta (https://developers.secure.facebook.com/community/threads/564610036517552) | VERIFIED (extracto, comunidad oficial) |
| Facebook Pages | `fan_count` / `followers_count` significado (me gusta vs seguidores) | Solo con aprobación | Definiciones de conectores de terceros (Fivetran, Supermetrics); no abrí la referencia de Meta | UNVERIFIED |
| Instagram (Graph API) | Business Discovery: seguidores y nº de publicaciones de otras cuentas Business/Creator | APROBACIÓN (requiere tu propia cuenta profesional de IG enlazada a página de Facebook y app con permisos) | Consulta de ejemplo oficial con `followers_count` y `media_count` de otra cuenta profesional; no devuelve cuentas con restricción de edad. https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery . Lista exacta de permisos: no confirmada (un blog dice instagram_basic, pages_show_list, pages_read_engagement). Un hilo reporta `followers_count` vacío a veces. | VERIFIED en lo funcional; permisos exactos UNVERIFIED |
| Meta oEmbed | Incrustar (embed) una publicación o página pública con su HTML oficial | Antes APROBACIÓN; desde 15 jun 2026 sin token ni revisión | Blog de Meta del 2026-06-15: las API oEmbed de Meta se pueden llamar sin token y ya no requieren App Review para incrustar contenido público; con token y revisión puede haber límites más altos. https://developers.facebook.com/blog/post/2026/06/15/tokenless-access-to-meta-oembed-apis/ . Docs anteriores exigían la función «oEmbed Read», reemplazada por «Meta oEmbed Read» (abr 2025). OJO: oEmbed es para MOSTRAR la publicación, no para analizar su texto en bloque. | VERIFIED (extracto vía búsqueda); alcance exacto de lo que devuelve: UNVERIFIED |
| LinkedIn | Raspar perfiles/páginas con software, bots o extensiones | PROHIBIDO | Sección 8.2 del Acuerdo de Usuario y página de ayuda «Prohibited software and extensions». https://www.linkedin.com/help/linkedin/answer/a1341387 | VERIFIED (extracto vía búsqueda) |
| LinkedIn | Página de empresa por API (Marketing Developer Platform / Community Management) | APROBACIÓN (manual, lenta) y pensada para gestionar TUS páginas, no investigar las de otros | Portal oficial: crear app, añadir producto y completar formulario de acceso (https://developer.linkedin.com/product-catalog/marketing/page-management). Plazos de «4 semanas a 4 meses» son de blogs. | Proceso VERIFIED; plazos UNVERIFIED |
| X (Twitter) | API oficial: desde 6 feb 2026 el modelo por defecto es pago por uso; reportado ~0,005 USD por publicación leída, tope mensual de lecturas, sin plan gratis para nuevos | APROBACIÓN + COSTO (requiere preguntar al dueño) | Solo blogs y prensa (gigazine.net, opentermsarchive.org, etc.); no abrí docs.x.com. Cifras cambian seguido. | UNVERIFIED |
| X | Raspar la web | PROHIBIDO (según términos de X, no confirmado aquí) | No hallé el texto de los términos | UNVERIFIED |
| TikTok | API de Investigación | PROHIBIDO para uso comercial; solo académicos sin fines de lucro con aprobación por proyecto | Fuentes de terceros que citan el FAQ de TikTok; no abrí developers.tiktok.com | UNVERIFIED |
| TikTok | Raspar la web | PROHIBIDO por los términos (según terceros) | Blogs de proveedores de scraping (poco neutrales) | UNVERIFIED |
| TikTok | API de Display (cuentas que autorizan su propio acceso) | No sirve para investigar a terceros | Un tercero la describe como para funciones del propio negocio; casi no hay datos | UNVERIFIED |
| YouTube | YouTube Data API v3: datos públicos de canales y videos (suscriptores si el canal no los oculta, títulos, descripciones, fechas) | PERMITIDO con clave de API y cuota gratis | Cuota por defecto 10.000 unidades/día por proyecto de Google Cloud; `channels.list` cuesta 1; `search.list` cuesta 100; la cuota se reinicia a medianoche hora del Pacífico. https://developers.google.com/youtube/v3/determine_quota_cost . Una clave de API es gratis pero requiere cuenta de Google Cloud del dueño. | VERIFIED (extracto vía búsqueda); aceptación de los Términos de Servicios de API de YouTube: UNVERIFIED (revisar) |

## 3. Lo que da el enlace de la propia web de la empresa

Estos datos NO necesitan API ni scraping de redes: salen de la web de la empresa, que OPORTIA ya puede leer si el sitio lo permite (robots.txt, términos de cada web: regla del dueño).

| Dato | Se obtiene | Sello |
|---|---|---|
| URL del perfil (facebook.com/…, instagram.com/…, linkedin.com/company/…, etc.) | Sí: del HTML (enlaces en cabecera/pie, `sameAs` en JSON-LD, etiquetas `og:`) | VERIFIED por diseño (es leer la web propia); estándar schema.org `sameAs`: UNVERIFIED sin abrir fuente |
| Qué redes usa la empresa y cuáles enlaza primero | Sí, solo por los enlaces | igual |
| Nombre de usuario / identificador | Sí, está en la URL | igual |
| Si la red parece activa o abandonada | NO, sin leerla | n/a |
| Seguidores, publicaciones, tono, comentarios | NO sin API aprobada o pegado manual | ver tabla 2 |
| Imagen y título de vista previa (og:image, og:title) | Solo de la web propia de la empresa, no de la página de Facebook | UNVERIFIED |

## 4. Opciones realistas ordenadas por riesgo

1. **Solo el enlace** (hoy, sin riesgo): guardar la URL de cada red que la empresa publica en su web y mostrarla como botón «Ver en Facebook». Ya está en la visión (función 21 y 58).
2. **El dueño pega o importa** (sin riesgo legal): campo «Pega aquí lo que viste en su Facebook/Instagram» (texto, número de seguidores, últimas publicaciones, captura). La IA analiza el texto pegado (tono, qué ofrece, qué podría necesitar). Es lo que ya dice el plan: «puedes pegar lo que leas».
3. **YouTube por API oficial** (gratis, bajo riesgo): útil solo para empresas con canal; barato en cuota (channels.list = 1 unidad).
4. **oEmbed de Meta** (gratis desde jun 2026 según Meta, verificar): para MOSTRAR una publicación elegida en la tarjeta de la empresa; no para minería de datos.
5. **Meta con App Review** (Page Public Content Access / Business Discovery): posible pero tarda, exige explicar el caso de uso y, para el dueño, cuenta de desarrollador, empresa verificada probable y política de privacidad. Riesgo de rechazo alto para «analizar empresas de terceros para venderles». Dejar para fase posterior.
6. **LinkedIn, X, TikTok API**: no recomendado ahora (aprobación, costo o prohibido para este uso).
7. **Scraping / servicios de scraping de terceros**: NO. Choca con la regla del dueño («respeta las reglas de cada web»).

## 5. Datos personales

Aunque algo sea público, comentarios y perfiles de personas son datos personales (UNVERIFIED: no investigué la ley dominicana de protección de datos, Ley 172-13). OPORTIA debe analizar a la EMPRESA, no a sus clientes: no guardar nombres ni comentarios de terceros; si el dueño pega comentarios, quitar nombres antes de guardar.

## Recomendación para OPORTIA

- Mantener la regla actual: de las redes solo se guarda y muestra el ENLACE que la empresa publica en su propia web (ya está en la visión, no se cambia nada).
- Añadir en cada empresa un campo «Lo que vi en sus redes» donde el dueño pega texto o números; la IA lo resume (tono, qué ofrece, posible necesidad) y lo marca «dato pegado por ti».
- Extraer de la web de la empresa los enlaces a redes (HTML y datos `sameAs`) y mostrar iconos Facebook/Instagram/YouTube/etc. como botones que abren la red en el teléfono del dueño.
- No raspar ninguna red social ni contratar servicios de raspado; documentarlo en las reglas del código.
- YouTube Data API como primer conector opcional (fuente enchufable, modo «solo mostrar en vivo»), apagado por defecto, con tope de cuota propio (por ejemplo 2.000 unidades/día) y clave cifrada en `src/claves`.
- oEmbed de Meta solo para mostrar una publicación elegida por el dueño, y solo después de verificar en la página oficial que ya no pide token ni revisión.
- Dejar Meta Graph API (Page Public Content Access / Business Discovery) como fase posterior sin fecha, tal como ya dice la visión (función 20-21); no empezar el trámite de App Review sin preguntar al dueño.
- Para el vendedor de IA y el análisis «cómo habla en redes»: usar solo lo pegado, lo publicado en la propia web de la empresa y, si no hay nada, preguntar al dueño en lugar de inventar.
- No guardar datos personales de seguidores ni comentaristas; guardar solo resúmenes de la empresa.
- Antes de implementar cualquier conector, abrir y citar la página oficial (esta investigación no pudo abrirlas).

## Decisiones del dueño

| Decisión | Pregunta simple | Valor por defecto seguro |
|---|---|---|
| ¿Pegar tú lo que ves en sus redes? | ¿Quieres un cuadro para pegar lo que ves en el Facebook/Instagram de la empresa? | Sí, activado; es gratis y sin riesgo |
| ¿YouTube automático? | ¿Activamos leer datos públicos de canales de YouTube (gratis, necesita una clave de Google que tú crearías)? | No hasta que lo pidas; si lo activas, tope de 2.000 unidades al día |
| ¿Mostrar publicaciones de Facebook/Instagram dentro de la tarjeta? | ¿Quieres ver una publicación elegida dentro de OPORTIA? | No por ahora; solo botón que abre la red |
| ¿Pedir permiso especial a Meta? | ¿Hacemos el trámite de revisión de Meta (tarda semanas y puede ser rechazado)? | No; fase posterior, preguntar de nuevo |
| ¿X (Twitter) de pago? | ¿Pagar por leer X? | No; nunca sin preguntarte el costo |
| ¿Servicios de raspado de terceros? | ¿Usar programas que copian redes por ti? | No, nunca |
| ¿Guardar comentarios de personas? | ¿Guardamos comentarios de clientes de la empresa? | No; solo resúmenes de la empresa, sin nombres |
| ¿Cuando no se sabe algo de redes? | ¿Preguntarte a ti? | Sí, OPORTIA te pregunta en vez de adivinar |
