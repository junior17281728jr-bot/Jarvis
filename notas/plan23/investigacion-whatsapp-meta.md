# Investigación: WhatsApp Business (Cloud API) y mensajería de Meta para OPORTIA

Fecha de la investigación: 2026-11-10. Solo lectura; no se contactó ningún servicio con cuenta ni se envió nada.

## Aviso de honestidad sobre las fuentes (leer primero)

Desde esta sesión NO se pudieron abrir las páginas oficiales (developers.facebook.com, whatsapp.com, business.whatsapp.com): el host no resuelve (está fuera de los dominios permitidos de la sesión). Lo que sí funcionó fue la búsqueda web, cuyos extractos citan a veces el texto de Meta. Por eso uso estas etiquetas:

- **VERIFIED-extracto**: el buscador devolvió el texto de una página oficial (Meta o Tailscale) con su URL; no abrí la página completa. Fecha de consulta 2026-11-10.
- **UNVERIFIED**: viene de blogs/proveedores (segunda mano), de memoria, o las fuentes se contradicen. Hay que confirmarlo en la página oficial antes de gastar dinero.

Pendiente para el dueño o la próxima sesión: permitir `developers.facebook.com` y `www.whatsapp.com` en la red de la sesión y volver a abrir las páginas citadas.

## 1. Precios (Cloud API, República Dominicana)

República Dominicana está en el grupo «Rest of Latin America» de la tarjeta de tarifas de Meta (UNVERIFIED: lo dice un extracto de búsqueda de la página de precios de Meta, no abrí la tabla). Meta cobra por mensaje entregado desde 2025-07-01, no por conversación.

| Categoría | Qué es | Cobro (resumen) | Fuente / estado |
|---|---|---|---|
| Marketing | Promoción, ofertas, primer contacto comercial en frío | Tarifa más alta; solo con plantilla aprobada | VERIFIED-extracto (categorías y cobro por mensaje desde 2025-07-01): https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview |
| Utility | Avisos esperados por el cliente (cita, pedido, alerta suscrita) | Tarifa media-baja | idem |
| Authentication | Códigos de verificación | Igual a utility en la práctica | idem |
| Service | Respuestas libres dentro de la ventana de 24 h tras escribir el cliente | Gratis hasta 2026-09-30; **desde 2026-10-01 se cobra por mensaje** | VERIFIED-extracto: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages (dice: desde 2026-10-01 Meta cobra por mensaje todos los mensajes de servicio y los utility enviados dentro de la ventana; sin cobro desde 2024-11-01 y 2025-07-01 respectivamente) |

**Cambio importante de octubre 2026:** la «ventana de 24 h gratis» ya no es totalmente gratis. Mensajes de servicio y utility en ventana se cobran desde 2026-10-01 (VERIFIED-extracto, URL arriba). Sin método de pago registrado, Meta puede dejar de entregar esos mensajes (UNVERIFIED, blogs). Varios proveedores dicen que cada número recibe 1.000 mensajes de servicio gratis al mes (UNVERIFIED: no aparece en el extracto de Meta; fuentes: https://www.wati.io/en/blog/whatsapp-service-message-pricing/ , https://www.messangi.com/whatsapp-business-whatsapp-business-pricing-updates-2026/). Hay contradicción: un proveedor vio páginas de Meta aún diciendo «gratis» el 2026-10-13, así que el estado exacto es incierto.

**Tarifas en USD por mensaje para República Dominicana (todas UNVERIFIED, de terceros):**

| Categoría | USD/mensaje | Fuente |
|---|---|---|
| Marketing | 0,0740 | guía de terceros, tabla «May 2026» (extracto de búsqueda); https://docs.sent.dm/docs/guides/whatsapp-pricing muestra las mismas cifras sin fecha |
| Utility | 0,0113 | idem |
| Authentication | 0,0113 | idem |
| Service (desde 2026-10-01) | igual a utility, 0,0113 (sin descuentos por volumen) | https://www.wati.io/en/blog/whatsapp-service-message-pricing/ (UNVERIFIED) |

Referencias cruzadas de la región (UNVERIFIED): julio 2025 «Rest of LatAm» marketing 0,0888 y utility 0,01356 según https://chatalog.ai/en/pricing-whatsapp-conversation-fees-2025/ , pero 0,08288 / 0,01266 según SleekFlow; hasta 2026-09-30 SleekFlow lista 0,0851 / 0,0130. Las cifras se contradicen y cambian cada trimestre. Meta dice que solo cambia tarifas el día 1 de cada trimestre y avisa con al menos un mes (UNVERIFIED, extracto de la página de precios). Hubo una actualización el 2026-10-01 (https://www.ycloud.com/ru/blog/whatsapp-api-message-pricing-update-effective-october-1-2026 , UNVERIFIED). **Tomar 0,074 y 0,0113 solo como orden de magnitud y confirmar en la tarjeta de tarifas oficial (descarga CSV en WhatsApp Manager).**

Los proveedores intermediarios (Twilio, 360dialog, etc.) añaden recargo propio; la Cloud API directa de Meta no lo tiene (UNVERIFIED, de memoria).

**Chequeo con el plan de visión (función 47):** 500 alertas diarias × 30 días como utility = 15.000 mensajes × 0,0113 = unos US$170; como marketing = 15.000 × 0,074 = US$1.110. Coincide con lo ya escrito en el plan (US$170-195 y US$1.100-1.280). Se mantiene.

**Costos de ejemplo del vendedor de OPORTIA (con tarifas UNVERIFIED):**

| Escenario mensual | Cuenta | USD |
|---|---|---|
| 100 empresas reciben primera plantilla de marketing | 100 × 0,074 | 7,40 |
| 30 responden y se conversa (service, dentro de 1.000 gratis si aplica; si no, 10 msgs c/u) | 300 × 0,0113 | 0 a 3,39 |
| Seguimientos fuera de ventana (utility, solo si encajan como utility) | 50 × 0,0113 | 0,57 |
| Total aproximado | | unos 8 a 12 |

Esto es la parte de Meta; la IA (Claude Haiku) y el servidor se cuentan aparte con los topes que ya existen en `src/ia`.

**Meta Business Agent** (agente de IA de Meta dentro de WhatsApp): cobro por tokens desde 2026-08-01, unos US$2 por millón de tokens, alrededor de 4-5 centavos por mensaje (UNVERIFIED: https://www.messangi.com/whatsapp-business-whatsapp-business-pricing-updates-2026/ , https://sleekflow.io/blog/meta-business-agent-pricing-changes). No es necesario para OPORTIA: usa su propia IA.

## 2. Requisitos para abrir la cuenta

| Requisito | Qué se sabe | Estado |
|---|---|---|
| Cuenta de Meta Business (portafolio) y una app de desarrollador | Necesario para obtener el token y el número de la Cloud API | UNVERIFIED (de memoria) |
| Verificación del negocio (Business verification) | Sin verificar, el límite inicial es 250 contactos únicos cada 24 h. Verificar sube el límite (fuentes discrepan: 2.000, o incluso 100.000 si Meta eliminó los escalones 2K y 10K). Hay informes de verificaciones atascadas más de 15 días | UNVERIFIED (blogs: https://chatarmin.com/en/blog/whats-app-messaging-limits , https://help-center.qontak.com/hc/en-us/articles/54386710521369 , https://developers.facebook.com/documentation/business-messaging/whatsapp/upcoming-messaging-limits-changes/ página oficial apareció solo como título; no se vio su texto) |
| Documentos del negocio para verificar | Normalmente papeles legales de una empresa registrada (en RD, registro mercantil/RNC) y sitio web o dominio propio. Si Junior no tiene empresa registrada, la verificación puede ser un obstáculo | UNVERIFIED (de memoria; confirmar) |
| Número de teléfono | Un número que pueda recibir SMS o llamada y que no esté ya en la app de WhatsApp normal (hay un modo de coexistencia con la app Business) | UNVERIFIED (de memoria) |
| Nombre para mostrar (display name) | Debe corresponder al negocio real; Meta lo revisa y rechaza nombres sin relación con la entidad | UNVERIFIED (un blog lo menciona; sin detalle del proceso) |
| Plantillas aprobadas | Meta revisa cada plantilla, puede pausarla o recategorizarla (con cobro mayor) en cualquier momento; las apelaciones se resuelven en unas 24 h | VERIFIED-extracto: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview y https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/ |
| Método de pago en WhatsApp Manager | Necesario desde 2026-10-01 para que se entreguen mensajes cobrados | UNVERIFIED (blogs) |

## 3. Opt-in y reglas de contacto

| Regla | Detalle | Estado |
|---|---|---|
| Iniciar conversación | Fuera de la ventana de 24 h, el negocio solo puede enviar plantillas aprobadas | VERIFIED-extracto (páginas de plantillas de Meta, URLs arriba) |
| Opt-in | Meta pide escribir solo a quien espera el mensaje y haya dado su permiso (opt-in) con claridad y con opción de salir (opt-out). El texto exacto de la política no se pudo abrir | VERIFIED-extracto parcial: https://developers.facebook.com/documentation/business-messaging/whatsapp/direct-send/integrity-and-content-guidelines/ ; resto UNVERIFIED |
| Consecuencia | Quejas, bloqueos y baja calidad bajan la calificación y pueden restringir o bloquear la cuenta | UNVERIFIED (https://chakrahq.com/article/whatsapp-api-account-restricted-or-blocked-find-out-why-and-how-to-resolve/) |
| Ventana de atención al cliente | Se abre por 24 h cada vez que el cliente escribe; dentro se puede responder libre | VERIFIED-extracto (páginas de plantillas/precios de Meta) |
| Anuncios Click-to-WhatsApp | Tienen ventana gratuita de entrada (72 h, mensajes libres sin cobro) | UNVERIFIED (de memoria; la búsqueda no lo confirmó) |

**Consecuencia directa para OPORTIA:** una empresa encontrada en su web pública NO ha dado opt-in. Escribirle por WhatsApp Business API con plantilla de marketing como primer contacto en frío choca con la política de opt-in y arriesga el número. WhatsApp Business solo es seguro para (a) quien escribe primero, (b) quien dio su número en un formulario o enlace de OPORTIA/Junior con aceptación explícita.

## 4. Límites y niveles

| Tema | Dato | Estado |
|---|---|---|
| Inicio sin verificar | 250 contactos únicos por 24 h | UNVERIFIED (blogs; un blog cita a Meta: «newly created business portfolios have a messaging limit of 250») |
| Por portafolio, no por número | Desde octubre 2025 el límite se comparte entre los números del portafolio | UNVERIFIED (blogs; consistente con página oficial citada, solo título) |
| Subida de nivel | Se evalúa cada unas 6 horas (antes 24-48); bajar la calidad ya no baja automáticamente el nivel | UNVERIFIED (Aisensy y otros; la página oficial «upcoming messaging limits changes», actualizada 2026-06-17 según el buscador, no se pudo leer) |
| Escalones posteriores | 1K, 10K, 100K o sin límite; fuentes se contradicen | UNVERIFIED |
| Mensajes de marketing por persona | Meta limita cuántas plantillas de marketing recibe cada persona | UNVERIFIED (https://support.chatarchitect.com/books/meta-whatsapp/page/per-user-marketing-template-message-limits-developer-documentation) |

Para OPORTIA, 250 contactos nuevos por día sobra: el vendedor trabajará con decenas.

## 5. Webhooks y Tailscale Funnel

| Hecho | Estado y fuente |
|---|---|
| El webhook debe ser una URL pública HTTPS con certificado TLS válido; los certificados autofirmados no están soportados | VERIFIED-extracto: https://developers.facebook.com/docs/graph-api/webhooks/getting-started |
| Verificación inicial: Meta envía GET con `hub.mode`, `hub.challenge` y `hub.verify_token`; el servidor debe validar el token y devolver el challenge | VERIFIED-extracto: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint |
| Los POST traen la cabecera `X-Hub-Signature-256` (`sha256=<hash>`), se valida con el secreto de la app sobre el cuerpo sin tocar | VERIFIED-extracto (cabecera); procedimiento de validación UNVERIFIED (blogs) |
| Responder rápido con 200; Meta reintenta si falla | UNVERIFIED (de memoria y blogs) |
| Funnel solo escucha en los puertos 443, 8443 y 10000; solo con nombre `*.ts.net` de la tailnet; solo TLS (certificado automático) | VERIFIED-extracto: https://tailscale.com/docs/features/tailscale-funnel |
| Funnel tiene límites de ancho de banda no configurables y no publicados | VERIFIED-extracto (misma URL); cifras desconocidas |
| Repetir muchas solicitudes de certificado puede chocar con límites de Let's Encrypt | UNVERIFIED (blog SSD Nodes) |

**¿Funnel sirve?** Sí en principio: da HTTPS público con certificado válido, que es lo que Meta exige, y OPORTIA ya lo usa. Conviene exponer solo una ruta (por ejemplo `/webhooks/meta`) y no toda la app, con `tailscale funnel --set-path` (UNVERIFIED, blog). Riesgos: el límite de ancho de banda no publicado (el tráfico de webhooks de un negocio pequeño es minúsculo), y que la caída de Tailscale deja sin recibir mensajes (Meta reintenta, UNVERIFIED). Se recomienda prueba real con el modo de prueba de Meta (número de prueba gratuito, UNVERIFIED de memoria) antes de pagar nada.

## 6. Política de Meta sobre IA y bots

| Hecho | Estado y fuente |
|---|---|
| Desde 2026-01-15 los Términos de la Solución de WhatsApp Business tienen una cláusula «AI Providers»: prohíbe a proveedores de IA/LLM/asistentes generales usar la plataforma cuando la IA es la funcionalidad **principal** (no incidental), a juicio exclusivo de Meta. Nuevos usuarios desde 2025-10-15 | UNVERIFIED: texto de la cláusula visto solo en prensa y blogs: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform , https://9to5mac.com/2025/10/20/whatsapp-bans-ai-chatbots-from-using-its-business-api/ . Términos oficiales: https://www.whatsapp.com/legal/business-solution-terms (no se pudo abrir) |
| Meta dijo a TechCrunch que apunta a proveedores de modelos que reparten asistentes, no a negocios que usan IA para atender clientes | UNVERIFIED (reporte de prensa) |
| Siguen permitidos los bots con IA de soporte, ventas, reservas y avisos del propio negocio | UNVERIFIED (blogs como https://respond.io/blog/whatsapp-chatbot-policy-2026) |
| OpenAI, Perplexity, Luzia y Poke dejaron WhatsApp por esta regla | UNVERIFIED (prensa) |

**Lectura para OPORTIA:** un vendedor que vende el software de Junior a sus propios prospectos es IA «incidental» al servicio de un negocio, no un asistente general abierto. Riesgo bajo pero no cero, porque Meta decide a su criterio. Reglas de prudencia: que el bot hable solo de la oferta de Junior, que no actúe como chatbot de preguntas libres, que identifique que es un asistente automático si preguntan, y que siempre ofrezca pasar con una persona (Junior). Revisar el texto oficial de los Términos antes de activar.

**Atajos que NO se deben usar:** librerías que simulan WhatsApp Web o la app (Baileys, whatsapp-web.js) violan los términos y arriesgan el número personal de Junior (UNVERIFIED, de memoria). Programas que se saltan la API oficial no entran en OPORTIA.

## 7. Messenger e Instagram (API oficial)

| Regla | Detalle | Estado y fuente |
|---|---|---|
| Quien empieza | La persona debe iniciar la conversación escribiendo a la Página o cuenta profesional de Instagram | VERIFIED-extracto: https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages (actualizada 2026-05-05 según el buscador) |
| Ventana estándar | 24 h desde el último mensaje de la persona; dentro, se responde libre (también automático) | VERIFIED-extracto (misma URL) |
| Etiqueta Human Agent | Permite que una persona (no un bot) responda hasta 7 días después, para escalar casos; no para promociones | VERIFIED-extracto (misma URL: «representante manual, 7 días»); «bots no pueden usarla» UNVERIFIED (https://www.chatwoot.com/hc/user-guide/articles/1745225158-what-is-human-agent-tag-in-instagram-messenger-channel) |
| Otras etiquetas | CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE y POST_PURCHASE_UPDATE dejaron de estar disponibles el 2026-02-10 | VERIFIED-extracto (misma URL) |
| Chats que nacen de anuncios Click-to-Messenger / Direct | Posible ventana de hasta 7 días desde 2026-09-28 | UNVERIFIED (un solo proveedor: https://www.spurnow.com/en/blogs/instagram-messenger-ads-7-day-messaging-window) |
| Responder comentarios por mensaje privado | Existe «Private Reply» (una respuesta por comentario, plazo de unos 7 días) | UNVERIFIED (de memoria) |
| Acceso y revisión | Para usar la API de mensajes de Página/Instagram con usuarios que no son de tu equipo, la app necesita permisos con revisión de Meta (app review); la verificación de negocio suele pedirse | UNVERIFIED (de memoria; los blogs hablan de apps de automatización rechazadas) |
| Costo | La API de Messenger e Instagram no tiene cobro por mensaje | UNVERIFIED (de memoria; confirmar) |
| Leer publicaciones/comentarios públicos de Facebook e Instagram | Exige revisión especial (Page Public Content Access); no hay raspado permitido | Ya figura en plan-vision (funciones 20 y 21) |

**Consecuencia:** por Facebook/Instagram OPORTIA solo puede **responder** a quien escribe primero (por ejemplo, desde el anuncio, el botón de la Página o un comentario). No hay mensaje en frío por la API. Un «vendedor» por Messenger/IG es posible solo como respondedor de entrada.

## 8. El enlace wa.me (gratis, sin API)

| Hecho | Estado y fuente |
|---|---|
| Formato: `https://wa.me/<número con código de país, sin + ni espacios>` y, para texto prellenado, `?text=<mensaje codificado en URL>`. República Dominicana: `18095551234` (código 1 + 809/829/849) | UNVERIFIED (varios generadores/guías: https://www.tyntec.com/helpcenter/docs/internal/create-click-to-chat-links-wa-me-links/ , https://bird.com/explained/whatsapp/what-is-a-whatsapp-click-to-chat-link ) |
| Es gratis, sin tope, funciona con WhatsApp normal o WhatsApp Business app | UNVERIFIED (guías de terceros) |
| No envía nada: solo abre el chat con el texto escrito; la persona (Junior) debe pulsar «Enviar» | UNVERIFIED (de memoria; consistente con guías) |
| Una vez la persona escribe, se abre la ventana de 24 h (si el número está en la API) | VERIFIED-extracto (páginas de plantillas) |

**Uso para Junior sin pagar nada:** el botón «WhatsApp» de cada empresa en OPORTIA ya puede ser un `wa.me` con un mensaje preparado por el vendedor, y Junior lo envía con su propio teléfono (iPhone). También un enlace/QR `wa.me` en su web o tarjeta para que los clientes le escriban primero. Esto cumple la regla del dueño de «botones Llamar y WhatsApp que envías tú» (plan-vision función 28).

## 9. Qué cuesta y qué no (resumen)

| Canal | Costo | Quién envía | Opt-in |
|---|---|---|---|
| `wa.me` desde el teléfono de Junior | 0 | Junior a mano | No aplica a conversación 1 a 1 normal entre personas, pero no es envío masivo |
| WhatsApp Cloud API: respuestas a quien escribe | desde 2026-10-01 pagas por mensaje (unos US$0,011 en RD, UNVERIFIED), quizá 1.000 gratis al mes | OPORTIA | El cliente escribió primero |
| WhatsApp Cloud API: plantillas de marketing | unos US$0,074 en RD (UNVERIFIED) | OPORTIA | Sí, obligatorio |
| Messenger/Instagram API | sin cobro (UNVERIFIED) | OPORTIA, solo dentro de 24 h; humano hasta 7 días | La persona escribió primero |
| Telegram (ya hecho) | 0 | OPORTIA | Solo avisos a Junior |
| Correo propio | costo de dominio y envío (otra investigación) | OPORTIA | Reglas de correo comercial |

## Recomendación para OPORTIA

- Primero lo gratis: poner en cada empresa un botón WhatsApp con enlace `wa.me` y mensaje preparado por el vendedor, que Junior envía a mano. Cero costo, cero riesgo, cumple la política.
- No usar WhatsApp Business API para primer contacto en frío con empresas sacadas de la web: no hay opt-in y se arriesga el número. Los primeros contactos salen por correo general de la empresa (regla ya existente), `wa.me` manual o publicidad Click-to-WhatsApp.
- Cuando se active la API oficial, usarla como canal de **entrada**: el cliente escribe primero (enlace/QR/anuncio/formulario con aceptación), el vendedor con IA responde dentro de la ventana de 24 h, cotiza, da seguimiento y avisa a Junior por Telegram.
- Ese canal entra por el adaptador de canales que ya existe (`src/canales`), como el siguiente canal después de Telegram, con webhook en una sola ruta por Funnel. Antes de pagar, probar con el número de prueba de Meta.
- Contar el costo en pantalla: cada mensaje cobrado se suma al consumo del proyecto, con tope mensual y aviso antes de pasarse, igual que la IA. Usar US$0,011 (respuesta) y US$0,074 (marketing) como estimado hasta confirmar la tarjeta oficial.
- Guardar prueba de opt-in (fecha, texto aceptado, origen) por contacto y respetar «parar» al instante: también sirve para la regla del dueño de solo datos legales.
- Mantener al vendedor dentro de su oferta (software de Junior), decir que es un asistente automático si preguntan y ofrecer siempre pasar a Junior; así se mantiene dentro de la cláusula de IA.
- Messenger e Instagram: solo como respondedor de entrada; la etiqueta de agente humano (7 días) es solo para Junior, no para el bot.
- Antes de empezar: abrir los documentos oficiales (términos, tarjeta de tarifas, límites) y confirmar si Junior necesita empresa registrada para la verificación de negocio.
- Alertas por WhatsApp a muchas personas (función 47) siguen en «cuando haya ingresos»; las cifras del plan se mantienen.

## Decisiones del dueño

| Decisión | Valor seguro por defecto |
|---|---|
| ¿Activar WhatsApp oficial (API de Meta)? Cuesta por mensaje y exige verificar el negocio | No por ahora; usar `wa.me` gratis. Activar solo cuando él lo apruebe y haya un primer cliente |
| ¿Tiene o tendrá empresa registrada (RNC) para la verificación de Meta? | No asumir que sí; el vendedor de WhatsApp queda «pendiente de verificación» |
| ¿Qué número de teléfono se usará para la API? (no su WhatsApp personal) | Un número aparte, nunca el personal |
| Tope mensual de gasto en Meta | US$10 al mes, con aviso al llegar al 80 % y corte automático al 100 % |
| ¿Mensajes en frío por WhatsApp a empresas? | No. Solo `wa.me` manual o a quien escribió primero o dio permiso |
| ¿El vendedor puede responder solo en WhatsApp sin que Junior apruebe? | Primero «borrador y aprobar» por Telegram; modo automático solo si lo activa por proyecto y con tope diario de mensajes |
| ¿Activar Messenger e Instagram? | No por ahora; solo después de WhatsApp y solo como respondedor |
| ¿Permitir `developers.facebook.com` y `www.whatsapp.com` en la red de esta sesión para confirmar las cifras oficiales? | Sí, para una pasada de verificación antes de construir nada de pago |
| ¿Aceptar que las tarifas pueden cambiar cada trimestre? | Sí; la pantalla muestra «estimado» y se revisa la tarjeta oficial cada trimestre |
