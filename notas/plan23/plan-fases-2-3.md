# OPORTIA — Plan unificado de las fases 2 y 3

Fecha: 2026-11-10. Es un plan: no se tocó ningún repositorio, ni el servidor, ni ninguna cuenta.
Sale de tres diseños ya corregidos tras dos críticas: `diseno-fase2.md` (buscar y analizar empresas), `diseno-fase3.md` (el vendedor con IA) y `diseno-negocio.md` (catálogo, precios, contrato y después de la venta). Cada uno trae al final su registro de cambios. Cuando este plan y un diseño difieran, manda el diseño.

**Lo que se comprobó y lo que no.** En el código publicado 0.5.1 se comprobaron, con archivo y línea, todos los puntos técnicos de las críticas (lista en §8). En la web **no se pudo comprobar nada**: el 2026-11-10 los sitios oficiales (`docs.github.com`, `developers.google.com`, `docs.overturemaps.org`) no resuelven desde la sesión; hay que permitirlos en la red del entorno. Por eso **todo dato externo de este plan (licencias, precios de terceros, reglas de Google y Meta, leyes, plazos) está UNVERIFIED** salvo donde diga VERIFIED.

---

## 1. Metas

| Fase | Meta | Con qué se mide |
|---|---|---|
| **2** | Que cada proyecto aprobado encuentre empresas reales de RD, las analice a fondo (web, ubicación, distancia, cómo habla, qué puede necesitar, qué falta preguntar) y deje una ficha visual con nota explicada. Todo funciona sin pagar; la IA es opcional y con tope | Empresas reales en pantalla; nota de 0 a 100 con sus motivos; cuántas fichas tienen logo, web leída y seguridad Media o más |
| **3** | Un vendedor por proyecto que prepara el contacto, entiende las respuestas, cotiza con la tabla del dueño, da seguimiento, avisa por Telegram y le pasa la conversación cuando piden demo. Empieza con borradores que el dueño aprueba; cuando él lo enciende, responde solo dentro de límites | Borradores aprobados sin cambios; respuestas; demos; cero reglas duras rotas |
| **Negocio** | Que vender sea ordenado: catálogo de lo que se puede construir con su costo, tabla de precios, contrato que firma el dueño, cobros y pedidos | Cotizaciones que salen solo de la tabla; ninguna promesa fuera del catálogo |

Las 60 funciones de la visión aprobada siguen todas en pie. Las que quedan **con límite** en estas fases, y por qué, están en §7.

---

## 2. Orden y lo que Junior verá después de cada parte

Antes de la fase 2 se termina la **parte 1f** (instalación y restauración): la fase 2 se apoya en restaurar.

### Fase 2

| # | Parte | Versión | Lo que Junior ve al instalarla | Depende de | Días (estimado) |
|---|---|---|---|---|---|
| 0 | Paso 0 (fuera del servidor) | — | Nada. Se arma y se mide la lista de negocios de RD; se leen y guardan los términos de cada fuente; se prueba la descarga desde el servidor | Decisión 1 | 0.5 a 1 |
| 1 | 0.5.2 | 0.5.2 | Nada (dos arreglos internos pendientes de la 1c) | 1f | 0.5 |
| 2 | **2a-1** | 0.6.0 | En Administrador: «Lista de negocios de RD: importada, N lugares» y cuántos días de disco quedan | Paso 0 | 1 a 2 |
| 3 | **2a-2** | 0.6.1 | **Empresas reales** en sus proyectos: lista con nombre, sector, lugar, nota preliminar, botón Llamar y «Quitar». Empieza con un botón «Empezar a buscar en mis proyectos» | 2a-1 | 1 a 2 |
| 4 | 2b | 0.6.2 | Ficha visual de cada empresa, filtros, mapa de casillas, pantalla «Tareas», menú nuevo | 2a-2 | 1 a 2 |
| 5 | 2c-1 | 0.7.0 | Botón «Leer esta web» en una ficha: qué hace la empresa, contactos, redes como enlaces. Página pública que explica el lector, con «Abrir un pedido» | 2b, decisión 7 | 1 a 2 |
| 6 | 2c-2 | 0.7.1 | OPORTIA lee las webs sola, despacio (una por minuto) | 2c-1, disco medido | 1 |
| 7 | 2c-3 | 0.7.2 | Elegir fuentes por proyecto y añadir «Mis webs» | 2c-2 | 1 |
| 8 | 2d | 0.7.3 | Logo en las tarjetas (las que lo tengan), mapa real y distancia | 2c-2 | 1 a 2 |
| 9 | 2e-1 | 0.8.0 | Nota completa con 8 barras, «qué puede necesitar», «cómo habla», preguntas para el cliente | 2c-2 | 1 a 2 |
| 10 | 2e-2 | 0.8.1 | Pestaña «Mensaje»: guion para llamar; «¿Cómo te fue?»; «Lo aprendido» | 2e-1 | 1 a 2 |
| 11 | 2f | 0.8.2 | «Con IA» por proyecto, con costo antes de aprobar | 2e-1, decisión 10 | 1 a 2 |
| 12 | 2g | 0.9.0 | Sugerencias de sectores y zonas. Noticias y más fuentes, solo las que se activen | 2e-1, decisión 12 | 2 a 3 |

Total fase 2: de 13 a 22 días de trabajo, más las rondas de revisión (la 1d y la 1e tardaron más de lo previsto por eso).

### Fase 3 y capa de negocio

| # | Parte | Lo que Junior ve | Envía el servidor | Depende de | Días (estimado propio) |
|---|---|---|---|---|---|
| 13 | **3.1a** | «El vendedor» del proyecto: ficha, precios, catálogo, preguntas, tono; «Probar una cotización» | No | 2e-1 | 1 a 2 |
| 14 | **3.1b** | Bandeja «Vendedor» y conversación: borradores que aprueba uno por uno y envía él; guion y «Llamar» para quien no lo conoce | No | 3.1a | 2 a 3 |
| 15 | 3.2 | Avisos al momento y un resumen diario por Telegram; seguimiento a los 7 días; agenda de demos; «lo que piden y no tenemos» | Solo a él | 3.1b | 1 a 2 |
| 16 | 3.1c | «Pegar respuesta»: la clasifica y propone el siguiente paso (por palabras clave; con IA tras el abogado) | No | 3.1b, decisión 5 | 1 a 2 |
| 17 | 3.5 | Pantalla «Pruebas»: clientes simulados, con costo y duración a la vista | No | 3.1c | 2 |
| 18 | 3.3 | «Aprobar y enviar» por correo, desde una cuenta solo del vendedor | Sí, uno por uno | Decisiones 5 y 15; datos de Google verificados | 2 a 3 |
| 19 | 3.4 | Las respuestas llegan solas a la bandeja | — | 3.3 | 2 |
| 20 | **3.6** | Nivel 2 «Responde lo sencillo» (plantillas; espera de 15 minutos con aviso para frenar) | Sí | 3.3, 3.5, decisiones 2, 16 y 19 | 2 |
| 21 | **3.7** | Nivel 3 «Conversa solo»: cotiza, responde dudas, propone demo | Sí | 3.6, decisiones 2 y 19 | 2 |
| 22 | 3.8 y 3.8b | «Lo que funciona»; borrador de contrato (apagado hasta el abogado); «Firmado» crea cliente y venta | — | 3.7, decisión 5 | 3 a 4 |
| 23 | 3.12 | «Negocio»: cobros, atrasos, pedidos y encargos para Claude | — | Primer contrato en conversación | 2 |
| 24 | 3.9 | Nivel 4 «Contacta solo» | Sí | Abogado + 4 semanas en nivel 3 | 1 |
| — | 3.10, 3.11 | WhatsApp oficial; Messenger e Instagram. **Opcionales: solo si los pide (tienen costo o revisión de Meta)** | Sí | Decisiones 20 y 21 | 3 a 4 y 2 a 3 |

Total fase 3 hasta el nivel 3: de 15 a 20 días de trabajo, más revisiones. **Tiempo de calendario** hasta que el vendedor converse solo: además de construir, unas 4 semanas de uso (30 borradores y 2 semanas en nivel 1, 2 semanas en nivel 2), la cuenta de correo del vendedor y la consulta al abogado.

### Qué se puede construir en paralelo

Solo se **publica** una parte a la vez (las migraciones van numeradas y cada una tiene su ensayo de vuelta atrás), pero se puede **preparar** en paralelo:

| En paralelo | Por qué no se pisan |
|---|---|
| Paso 0: armar el paquete ∥ leer términos de cada fuente ∥ carta modelo a asociaciones | Tareas de lectura, fuera del servidor |
| 2b (pantallas) ∥ 2c-1 (puerta de red y robots) | Una es pantallas; la otra, `src/web/` |
| 2d (logo, mapa) ∥ 2e-1 (reglas y nota) | Archivos distintos; solo comparten la ficha |
| Las 40 reglas con sus casos ∥ plantillas de mensajes ∥ textos es/en | Datos y textos |
| 3.1a (paquete y cotizador, sin IA) ∥ 2f y 2g | 3.1a solo necesita proyectos y la migración 9 |
| Banco de casos de la 3.5 ∥ 3.2 | El banco es un archivo de pruebas |
| Preguntas para abogado y contador ∥ todo | Es un documento |

### Qué modelo en cada pieza (modo «director»)

| Modelo fuerte (y equipo rojo donde se indica) | Modelos sencillos, con una revisión corta |
|---|---|
| Migraciones y ensayos de vuelta atrás | Pantallas (lista, ficha, mapa, bandeja, administrador) |
| Las dos puertas de red, robots y lector (**equipo rojo, 3 rondas**) | Textos `es.json` / `en.json`, glosario, README |
| Exclusiones y «no contactar» | Tabla categoría → sector (unas 2,000 filas, con revisión por muestra y botón «Sector equivocado») |
| Corrida, topes, cadencias nuevas en `tiempo.js` | Frases y un caso de prueba por cada una de las 40 reglas |
| Juntar empresas, procedencia, nota y aprendizaje | Plantillas de propuesta, guion de llamada y mensajes |
| Todo lo de dinero: `presupuesto.js`, `config.js`, topes, cotizador | Coordenadas de zonas y contorno del mapa (con prueba automática) |
| Verificador, compuerta de envío, envío sin duplicados (**equipo rojo**) | Banco de casos simulados (el fuerte revisa los ataques) |
| `avisador.js` (topes por grupo) | Capturas de pantalla y búsquedas de términos |
| Revisión final de cada parte, con consejero | Lectura y resumen de términos de cada fuente (el fuerte decide) |

---

## 3. Costos

| Qué | Costo | Estado | Cuándo se pregunta |
|---|---|---|---|
| **Toda la fase 2 sin IA** (lista abierta, leer webs, nota, guion de llamada, mapa) | US$0 | — | — |
| Fase 3, nivel 1 a mano, sin IA | US$0 | — | — |
| IA en proyectos (Claude Haiku): unos US$2 por cada 1,000 empresas analizadas | Tope propuesto US$5 al mes; hoy US$0 | Precio VERIFIED por el proyecto (`src/ia/precios.json`, 2026-11-10) | Decisión 10 |
| IA del vendedor | Dentro del tope del proyecto; US$0.10 por conversación como máximo | Estimado | Decisión 10 |
| Prueba con clientes simulados | US$0.20 la corta, US$0.60 la completa | Estimado propio | Cada vez, en pantalla |
| Abogado y contador (una sola cita) | Honorarios: no se conocen | — | Decisión 5 |
| Cuenta de Gmail nueva para el vendedor | US$0 | Reglas de Google UNVERIFIED | Decisión 15 |
| Correo con dominio propio | ~US$8 al mes | UNVERIFIED | Decisión 15 |
| Servidor de 1 GB | US$6 al mes | UNVERIFIED | Decisión 13 (no hace falta hoy) |
| WhatsApp oficial | ~US$0.011 por respuesta, ~US$0.074 por plantilla | UNVERIFIED | Decisión 20 |
| Segundo número de teléfono para WhatsApp | Lo que cueste la línea | — | Decisión 20 |
| Servidor por cada cliente (línea «Fábrica») | US$4 a US$6 al mes, que paga su mensualidad | UNVERIFIED | Decisión 2 y antes de crear cada uno |
| Brave, Google Places | Piden tarjeta | — | Decisión 14 (hoy: no) |

Los costos internos y márgenes de la capa de negocio no se copian aquí: este archivo puede acabar en el repositorio público.

---

## 4. Riesgos principales y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| **Contacto en frío, aunque sea a mano** (Ley 310-14; la ley obliga a quien envía) | Sin permiso, relación previa o mensaje entrante: solo guion de llamada y «Llamar». Textos de correo y WhatsApp tras «un abogado lo confirmó». Lista «no contactar» desde la fase 2 |
| **Correo personal del dueño expuesto** | Nunca su Gmail personal: cuenta nueva solo del vendedor; 3.3 no se construye con datos de Google sin verificar |
| **La descarga de datos no funciona con la puerta de red actual** (no sigue redirecciones) | Trozos de 20 MB por un host fijo sin redirección; se prueba desde el servidor en el paso 0 |
| **El disco se llena** (copias locales que nunca se borran + base más grande) | Puntuar antes de guardar; guardar solo los N mejores; medir en 2a-1; ese número es condición para leer webs; decisión 8 |
| **Leer webs desde el servidor** (ataques hacia adentro, páginas bomba, quejas al proveedor) | Puerta propia con dirección fijada, compresión y letras controladas, certificados, freno global, identidad honesta con contacto real, equipo rojo |
| **Datos falsos mostrados como hecho** («no tiene reservas», noticia de otro negocio, sector mal puesto) | «No encontramos» solo con web leída completa; si no, se vuelve pregunta; mensajes en forma de pregunta; noticias dudosas no mueven nada; «Sector equivocado» |
| **El vendedor promete de más** | Precios solo de la calculadora; ningún número ni palabra de cantidad fuera de marcadores; nivel 2 solo plantillas; espera de 15 minutos con aviso para frenar; primeros 20 envíos revisados. Baja mucho el riesgo, no a cero |
| **Vender lo que nadie puede entregar** | El vendedor no envía cotizaciones hasta decidir quién construye (decisión 2) y aprobar el catálogo (decisión 19); sin toque solo cotiza lo ya probado |
| **Texto de una web que acaba en un mensaje** | En mensajes automáticos solo entran frases de reglas del motor y datos tipados; nada de texto libre de IA |
| **La IA se queda sin cupo cuando llega un cliente real** | Reserva fija de llamadas por hora para respuestas reales; pruebas de noche |
| **WhatsApp restringe su número personal** | Tope de 5 primeros contactos al día, primer mensaje que pide permiso, segundo número recomendado |
| **Demasiado para una sola persona** | Solo se le pregunta lo que frena la parte siguiente; abogado y contador en una cita; sin «un servidor por cliente» hasta un piloto |
| **Volver atrás tras una instalación** | Migraciones que solo agregan; regla «leer antes de escribir» para el esquema nuevo; ensayo de vuelta atrás en cada parte |

---

## 5. Decisiones del dueño (lista única)

Cada una se responde con una palabra. Si no hay respuesta, vale la opción segura. **Solo la 1 frena el arranque**, y a medias: la parte 2a-1 se construye igual; lo que espera es ver empresas reales (2a-2).

### Ahora

| # | Pregunta | Opción segura (si no responde) | Recomendación | Frena |
|---|---|---|---|---|
| **1** | ¿Permites que el entorno de Claude en la nube baje la lista abierta de negocios de RD y abra las páginas oficiales para comprobar datos? Es gratis y no toca tu servidor ni tus cuentas | No. Sin lista no hay empresas reales (salida: la bajas tú en tu PC con 4 pasos y la subes) | **Sí** | **2a-2** |
| 2 | ¿Los programas que venda el vendedor los construye Claude y viven en un servidor pequeño por cliente (US$4 a 6 al mes, sin verificar, que paga su mensualidad), empezando con un solo cliente piloto? | No todavía: el vendedor no envía cotizaciones ni pasa de «borradores» | **Sí, con un piloto** | Fase 3: enviar cotizaciones y los niveles 2 y 3 (3.6, 3.7) |
| 3 | ¿Tienes empresa registrada (nombre legal, RNC, domicilio que se pueda mostrar)? | No se asume: sin esos datos no hay envío por correo ni contrato | Decirlo: Sí o No | 3.3, contrato |
| 4 | ¿Quieres textos listos de correo y WhatsApp para empresas que no te conocen **antes** de hablar con un abogado? | **No**: solo guion para llamar | **No** | — |
| 5 | ¿Hago las preguntas escritas para una sola cita con abogado y contador? (Tú pagas sus honorarios; te digo el costo antes de seguir) | Sin cita: solo llamar; sin contrato; sin factura; sin IA sobre respuestas de clientes | **Sí**; el contador, esta semana si piensas cobrar pronto | 2e-2 (textos), 3.1c, 3.3 |
| 6 | Cuando un negocio pide salir de OPORTIA: ¿vaciar sus datos (queda solo una marca para que no regrese) o solo esconderlos? | Esconder | **Vaciar** (única excepción a «nunca borrar») | — |
| 7 | ¿El contacto público del lector de webs es el botón «Abrir un pedido» de GitHub (gratis, sin tu correo ni la dirección de tu servidor)? | Sí, ese. Sin contacto no se lee ninguna web | **Sí** | 2c-1 |
| 8 | ¿Se pueden quitar las copias guardadas **en el servidor** de más de 30 días cuando la de Telegram está comprobada, y resumir la bitácora técnica de más de 90 días? | No: nada se borra; si el disco se acerca al límite, la búsqueda se pausa y avisa | **Sí**, con el número medido en la 2a-1 | 2c-2 |
| 9 | Empleo: ¿fase 4 (plan aprobado) o fase 6 (lo que dice hoy la app)? | No escribir número: «más adelante» | **4** | — |

### Cuando llegue cada parte

| # | Pregunta | Opción segura | Recomendación |
|---|---|---|---|
| 10 | IA para analizar empresas (2f) y para el vendedor: ¿encender y con qué tope? | Apagada, US$0 | US$5 al mes, solo en proyectos que apruebes |
| 11 | Logos: ¿iconos pequeños, o permitir una foto mayor mostrada reducida? | Iconos de hasta 80 KB; inicial y color si no hay | Decidir con lo medido en la 2d |
| 12 | Fuentes extra, una por una tras leer sus términos: OpenStreetMap, Diario Libre, registros públicos, YouTube oficial, Wikidata, carta a asociaciones | Apagadas; OpenStreetMap en la fase 3 | OpenStreetMap y Diario Libre en la 2g; el resto, según términos |
| 13 | ¿Subir el servidor a 1 GB (US$6 al mes)? | No | No por ahora; se mide en la 2c |
| 14 | ¿Brave o Google Places (piden tarjeta)? | No | No en la fase 2 |
| 15 | Correo del vendedor: cuenta de Gmail nueva (gratis), dominio propio (~US$8 al mes) o ninguno | Ninguno: solo a mano | Cuenta nueva; la creas tú con una guía. Nunca tu correo personal |
| 16 | Al llegar a la 3.6: ¿enciendo el modo en que el vendedor responde solo lo sencillo? | Apagado | Sí, tras ver la prueba simulada y tus borradores |
| 17 | ¿Nivel 4, «contacta solo»? | No | Solo si el abogado lo confirma |
| 18 | Cada prueba con clientes simulados (US$0.20 a 0.60) | No se hace sin tu toque | Una corta al terminar tu ficha y precios |
| 19 | Tabla de precios, catálogo y descuento | Borrador sin usar; descuento 0 % | Aprobar tras comparar con 3 cotizaciones locales; 10 % máximo por pago anual |
| 20 | WhatsApp: ¿segundo número?, ¿WhatsApp oficial de pago? | Sin oficial; a mano con tope de 5 al día | Segundo número; oficial tras el primer cliente |
| 21 | ¿Messenger e Instagram? | No | Solo si te escriben por ahí |
| 22 | ¿El documento de precios puede ir al repositorio público? | No se sube | Subirlo sin costos ni márgenes |

**Ya aplicadas con su opción segura, sin preguntar** (se cambian cuando quiera; detalle en cada diseño): seis preguntas de la propuesta; topes por plan; «Empezar de cero» apaga y no borra; aviso de empresas nuevas una vez al día; usted por defecto; 10 primeros contactos y 30 mensajes al día; un solo seguimiento a los 7 días; a Telegram solo nombre, una línea y enlace; demos que él confirma; espera de 15 minutos antes de un envío automático; firma «Asistente virtual de…» en todos los mensajes; transferencia y «Pagado» a mano; permanencia de 6 meses y nunca suspender solo.

---

## 6. Lo que Claude añadió por criterio propio (más allá de lo pedido)

- Lista «no contactar» y botón «No quiere que le escriban» desde la fase 2.
- Puntuar antes de guardar, para que la base y las copias no crezcan sin motivo.
- Sucursales de una cadena como fichas separadas pero unidas.
- «Cómo habla» sacado de su propia web, sin pegar nada.
- Preguntas en vez de afirmaciones cuando solo se sabe que «no se encontró».
- Freno global del lector y contacto real, para proteger el único servidor.
- Memoria de la IA entre búsquedas: no se paga dos veces por la misma web.
- Espera de 15 minutos con botón «frenar» y revisión de los primeros 20 envíos automáticos.
- Reserva de IA para clientes reales.
- Un solo menú para las tres capas, y un solo mensaje diario por Telegram.
- Madurez en el catálogo (probado, parecido, nuevo) para no prometer plazos de cosas nunca hechas.
- Una sola cita con abogado y contador, con las preguntas escritas.

---

## 7. Funciones de la visión que quedan con límite (ninguna se quita)

| Función | Límite en estas fases | Qué lo levanta |
|---|---|---|
| 28 Cómo contactar (botón WhatsApp que envías tú) | Sin base legal: solo «Llamar» y el número a la vista | Abogado, o permiso de la empresa (decisión 4) |
| 12 y 30 Nada sale sin tu sí | Tu «sí» puede ser un permiso que enciendes (lo pediste el 10 nov) | Confirmación corta en la 3.6 |
| 31 Conectar Gmail | Cuenta nueva del vendedor, no la personal; probadores fuera | Decisión 15; fase 6 |
| 11 Contactar para otras cuentas | Envío por el servidor solo para la cuenta del dueño | Fase 6 |
| 19 y 23 Noticias y cruce de fuentes | Nacen apagadas; seguridad hasta «Media» | Leer términos (decisión 12) |
| 8 IA lee webs y noticias | Noticias: solo titular y resumen, sin IA | Términos de cada periódico |
| 58 Quitar mi negocio | El negocio puede pedirlo desde la 2c-1; las copias cifradas ya hechas lo conservan sin usarlo | Decisiones 6 y 7 |
| Fotos (5 nov) | Iconos; muchas tarjetas con inicial y color | Decisión 11 |
| Redes sociales (10 nov) | Solo enlace y lo que él pegue | Prohibido leerlas (función 21) |
| Programas construidos por Claude con mensualidad (10 nov) | No se cotiza hasta decidir la «Fábrica» | Decisión 2 |
| 36 a 43 Empleo | Fuera de estas fases; número de fase en duda | Decisión 9 |

---

## 8. Comprobado en el código 0.5.1 (VERIFIED, 2026-11-10)

| Hecho | Dónde |
|---|---|
| La puerta de red acepta un solo host, no sigue redirecciones y corta a 120 s | `src/ia/llamar.js` líneas 58-59, 127, 131 |
| El actualizador solo usa `api.github.com` y `codeload.github.com` | `deploy/cloud-init.sh` líneas 25-27, 84-89 |
| El trabajador tiene prohibido `node:http`, `node:https` y `node:net` | `test/reglas.test.js` líneas 205-210 |
| Cadencias existentes: hora, diaria, semanal, mensual, manual | `src/tareas/tiempo.js` línea 17 |
| Tope de IA: 30 llamadas por hora para todo | `src/ia/config.js` línea 46 |
| Avisos por Telegram: tope común de 10 por hora y 30 por día | `src/canales/avisador.js` línea 41 |
| Las copias locales nunca se borran; piso de 2,048 MB libres | `src/copias/estado.js` línea 33 |
| `FASE_ACTUAL = 1`; cupos `normal: 1, grande: 1` | `src/tareas/tipos.js` líneas 6 y 10 |
| La app dice «fase 6» para empleo en 8 textos | `public/i18n/es.json` líneas 92, 114, 123, 392, 395, 425, 684, 787 |

## 9. Pendientes que este plan no pudo cerrar

1. **Verificar en páginas oficiales** todo lo marcado UNVERIFIED (licencia y atribución de Overture, descarga desde GitHub, reglas de Google para Gmail, tarifas de Meta, bloqueo de correo saliente del proveedor, política de WhatsApp, leyes 172-13 y 310-14, plazo de la factura electrónica del 15-nov-2026). Necesita la decisión 1.
2. **Informe `investigacion-whatsapp-meta.md`**: dice «cero riesgo» para WhatsApp a mano. No lo es; no se corrigió porque esta tarea solo edita los tres diseños.
3. **Copia de `notas/plan23` en el repositorio de notas**: es una versión vieja de las fases 2 y 3 y no trae la capa de negocio. Se actualiza después de la decisión 22, sin costos ni márgenes.
4. **Tiempos de la fase 3**: son estimados propios de este plan; el diseño no traía días por parte.
