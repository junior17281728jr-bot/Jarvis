# Investigación: correo saliente y entrante para el vendedor IA de OPORTIA

Fecha: 2026-11-10. Alcance: 20-50 correos/día de prospección B2B desde un VPS de 512 MB.

## 0. Aviso de método (leer primero)

- Las páginas oficiales NO se pudieron abrir con WebFetch (el entorno bloquea esos dominios: docs.digitalocean.com, aws.amazon.com, brevo.com, resend.com, mailgun.com, postmarkapp.com, support.google.com). Solo funcionó WebSearch.
- Regla usada: **VERIFIED** = el resultado de búsqueda cita o resume una página oficial del proveedor (se da la URL); **UNVERIFIED** = viene de blogs/comparadores o de memoria. Fecha de consulta de todo: 2026-11-10.
- Antes de pagar nada, el dueño (o Claude desde otra red) debe confirmar los precios en la página oficial del proveedor.
- Los precios que cambian rápido (planes gratis) llevan la etiqueta UNVERIFIED aunque varias fuentes coincidan.

## 1. Por qué NO enviar desde la IP del droplet

| Hecho | Estado | Fuente |
|---|---|---|
| DigitalOcean bloquea por defecto los puertos SMTP de salida 25, 465 y 587 en los Droplets (también por IP reservada) | VERIFIED | https://docs.digitalocean.com/support/why-is-smtp-blocked/ (vía búsqueda) |
| Un empleado de DO fechó la política el 22-jun-2022 para cuentas nuevas; respuestas del foro se contradicen sobre si soporte puede quitar el bloqueo | UNVERIFIED | foro community.digitalocean.com (vía búsqueda) |
| DO recomienda usar un proveedor de correo de terceros y desaconseja montar un servidor de correo propio | VERIFIED | misma página oficial |
| Algunos proveedores aceptan SMTP en el puerto 2525 (Mailgun, Mailjet), que normalmente no está bloqueado | UNVERIFIED | foros DO / Ghost |
| Las APIs HTTPS (puerto 443) no se bloquean: Gmail API, SES API, Brevo API, Resend API | UNVERIFIED (inferencia lógica: el bloqueo es solo de puertos SMTP) | — |

Razones técnicas adicionales (conocimiento general, UNVERIFIED): las IP de nubes baratas suelen estar en listas negras; una IP nueva no tiene reputación; no se controla el PTR/DNS inverso; mantener un servidor de correo con 512 MB y 1 vCPU es caro en tiempo. **Conclusión: enviar siempre por API HTTPS (443) de un proveedor; el droplet nunca habla SMTP con el mundo.**

## 2. Opciones de envío (gratis y precios)

| Opción | Gratis | Pago | Notas para OPORTIA | Estado |
|---|---|---|---|---|
| **Gmail API / Google Workspace** | Gmail personal: sí, pero sin dominio propio | Business Starter US$7/usuario/mes (anual) o US$8.40 mensual | Va por HTTPS. El correo sale como persona real, buen reconocimiento. Límite Workspace: 2,000 mensajes/día por usuario (500 en prueba), 500 destinatarios externos por mensaje | Límites: VERIFIED (https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace). Precio: UNVERIFIED (comparadores) |
| **Amazon SES** | 3,000 mensajes/mes gratis solo 12 meses para cuentas creadas antes del 15-jul-2025; después se paga | US$0.10 por 1,000 enviados; recibir tiene cargo aparte (~US$0.09 por 1,000 "chunks") | Barato (50/día = ~1,500/mes = ~US$0.15). Empieza en "sandbox" y hay que pedir acceso a producción; vigila rebotes y quejas | Tarifa y gratis: UNVERIFIED (https://aws.amazon.com/ses/pricing/ no abrió; coinciden varios resultados). Umbrales: ver §6 |
| **Brevo** | 300 correos/día, 100,000 contactos; los correos del plan gratis llevan el sello "Sent with Brevo" | Planes de pago desde ~US$9-25/mes (no verificado) | Cubre 20-50/día con holgura. Política antispam: tolerancia cero, exige consentimiento; la prospección en frío puede violar los términos | Límite gratis: VERIFIED (https://help.brevo.com/hc/en-us/articles/208580669). Política: UNVERIFIED (https://www.brevo.com/legal/antispampolicy/) |
| **Mailgun** | Plan gratis de 100/día (sin tarjeta solo a destinatarios autorizados); otras fuentes dicen que ya es solo prueba de 30 días | Basic US$15/mes (10,000), Foundation US$35, Scale US$90; IP dedicada ~US$60/mes | Tiene rutas entrantes (webhook). Fuentes se contradicen sobre si el gratis es permanente | UNVERIFIED (comparadores, nov-2026) |
| **Resend** | 3,000/mes con tope de 100/día | Pro US$20/mes (50,000) | Muy fácil de integrar; su política de uso aceptable prohibiría el envío en frío | Límite diario: UNVERIFIED (https://resend.com/pricing, blog resend.com/blog/new-free-tier); política en frío: UNVERIFIED |
| **Postmark** | 100 correos/mes (prueba de desarrollador) | US$15/mes por 10,000 | Pensado para transaccionales; reputación estricta; no se confirmó su política sobre frío | UNVERIFIED (https://postmarkapp.com/pricing) |
| **Zoho Mail** | Plan gratis con dominio propio: reportado 1 dominio, 5 usuarios, pero IMAP/SMTP externos quitados en cuentas nuevas | Mail Lite ~US$1/usuario/mes (anual) | La más barata como buzón real; dudas sobre acceso por programa (API/IMAP) | UNVERIFIED (blogs de terceros; Zoho solo confirma que mantiene "un nivel gratis para uso ligero": https://blog.zoho.com/workplace/honouring-the-commitment-we-made-ten-years-ago.html) |
| **Cloudflare Email Routing** (solo entrante) | Gratis, entrantes ilimitados; requiere dominio con DNS en Cloudflare | Enviar desde Workers requiere plan Paid | Reenvía a un buzón o a un Email Worker que llama a un webhook; no hay acción webhook directa | VERIFIED (https://developers.cloudflare.com/email-service/platform/pricing/) |

### Alcance de Google (OAuth) en la visión
- `gmail.send` es "sensible"; `gmail.readonly` es "restringido" (exige evaluación de seguridad anual). Pedir ambos clasifica la app como restringida. VERIFIED: https://developers.google.com/workspace/gmail/api/auth/scopes (vía búsqueda).
- Apps con menos de 100 cuentas o no compartidas pueden tener excepciones. VERIFIED (misma búsqueda, resumen de Google/Nylas).
- Vencimiento de 7 días del refresh token en modo "Testing": UNVERIFIED (coincide con la fila 31 de la visión: «reconexión semanal»).
- Si el buzón es del propio dueño en su propio Workspace, la app puede ser "interna" y evitar verificación: UNVERIFIED (conocimiento general; confirmar en la consola de Google Cloud).

## 3. Recibir respuestas (entrante)

| Método | Cómo | Pros | Contras | Estado |
|---|---|---|---|---|
| Gmail API (leer buzón) | OPORTIA consulta cada pocos minutos por HTTPS | Sin servidor propio; ya diseñado en la visión (fase 3, cuenta del dueño) | `gmail.readonly` es restringido; para clientes exige auditoría anual (US$540-4,500+ según la visión) | VERIFIED (alcance) |
| IMAP (puerto 993) | OPORTIA lee el buzón por IMAP | Funciona con cualquier proveedor; sin dependencias nuevas exige escribir un cliente IMAP sobre `node:tls` (trabajo extra) | DO bloquea SMTP; que 993 salga libre es probable pero no se pudo verificar | UNVERIFIED |
| Webhook entrante | Mailgun routes, Resend inbound, SES->SNS, Cloudflare Email Worker | Respuestas en tiempo real | Necesita URL pública (ya hay Funnel); proveedores y límites varían | Cloudflare: VERIFIED; resto UNVERIFIED |
| Reenvío | El dueño reenvía o clientes pegan la respuesta (ya en la visión) | Cero costo, cero riesgo | Manual | — |

## 4. Dominio propio: SPF, DKIM, DMARC, calentamiento

| Tema | Qué hacer | Estado / fuente |
|---|---|---|
| Dominio | Comprar un dominio **secundario** solo para ventas (ej. `oportia-ventas.com`), nunca el principal | UNVERIFIED (práctica estándar de la industria) |
| SPF | Registro TXT que autoriza al proveedor (ej. `include:_spf.google.com`) | UNVERIFIED (estándar) |
| DKIM | Clave que da el proveedor, publicada como TXT/CNAME | UNVERIFIED (estándar) |
| DMARC | TXT `_dmarc` mínimo `p=none` con correo de reportes; subir a `quarantine` cuando todo pase | VERIFIED: Gmail exige DMARC a remitentes masivos (https://support.google.com/a/answer/81126, vía búsqueda) |
| Quién es "remitente masivo" | 5,000+ mensajes/día a Gmail; OPORTIA (20-50) no lo es, pero conviene cumplir igual | VERIFIED (misma fuente) |
| Tasa de spam | Mantener bajo 0.1 %; nunca llegar a 0.3 %. Medir con Google Postmaster Tools | VERIFIED (https://support.google.com/a/answer/14229414) |
| Cabecera List-Unsubscribe | Añadir `List-Unsubscribe` y `List-Unsubscribe-Post: List-Unsubscribe=One-Click` aunque sea volumen bajo; además frase «Responda NO» (ya en la visión, función 30) | Obligatoria solo para masivos: VERIFIED; recomendable para todos: UNVERIFIED |
| Calentamiento | Dominio nuevo: 5-10/día la semana 1; subir poco a poco; 4-8 semanas hasta 40-50/día. Una fuente dice 0 en frío los primeros 30 días | Rangos: UNVERIFIED (blogs de ventas: namesilo, mailivery, ciela) |
| Rebotes | Parar para siempre tras un rebote duro; revisar la dirección antes de enviar | UNVERIFIED (práctica estándar) |
| Quejas | Si alguien marca spam o responde "NO": lista de bloqueados permanente, sin más contacto | UNVERIFIED (práctica estándar) |

## 5. Volumen seguro para frío B2B

| Dato | Estado |
|---|---|
| 30-50 correos/día por buzón ya calentado es el rango común y prudente; algunos llegan a 50-100 con direcciones verificadas | UNVERIFIED (blogs: fullenrich, salesforge, saleshandy, topo.io) |
| Para más volumen, añadir buzones/dominios, no empujar uno | UNVERIFIED (ciela.ai) |
| Los 20-50/día del dueño caben en UN buzón, pero solo después de 3-4 semanas de calentamiento | Deducción de lo anterior |

## 6. Cómo evitar el spam (reglas prácticas)

- Correos de texto simple, 1 enlace como máximo, sin imágenes pesadas ni adjuntos, sin acortadores de enlaces.
- Personalizar de verdad con datos públicos del negocio (ya está en el análisis de empresas); sin plantillas idénticas.
- Datos solo públicos y correos generales de la empresa (visión función 28); nada de listas compradas (prohibidas por proveedores, UNVERIFIED en Brevo).
- Todo correo pasa por aprobación del dueño (visión función 30) y lleva salida clara.
- Umbrales de SES: revisión con rebote duro > 5 %, pausa a > 10 %; quejas: pausa a ~0.1 % según algunas fuentes, 0.01 % según otra. UNVERIFIED (https://repost.aws/knowledge-center/ses-reputation-dashboard-bounce-rate; resultados de búsqueda contradictorios, confirmar en docs.aws.amazon.com/ses).
- AUP de SES sobre frío y acceso a producción: UNVERIFIED (no se encontró texto oficial).
- **Riesgo legal (visión función 59):** la Ley 310-14 de RD podría exigir permiso previo para correos comerciales; si el abogado lo confirma, el frío queda muy limitado. Esto pesa más que cualquier límite técnico.

## 7. Comparación para 20-50/día (~1,000-1,500/mes)

| Montaje | Costo mensual aprox. | Frío permitido | Dificultad | Veredicto |
|---|---|---|---|---|
| Gmail del dueño por API (ya diseñado) | US$0 | Sí (uso humano) | Baja, pero reconexión semanal en modo prueba | Ideal para la fase 3 |
| Dominio secundario + Google Workspace Starter + Gmail API | ~US$7 + dominio ~US$1 | Sí, mejor reputación | Media | **Recomendado para el vendedor IA** |
| Dominio + Zoho Mail Lite | ~US$1 + dominio | Probablemente | Media-alta (acceso por programa incierto) | Alternativa barata a probar |
| Dominio + SES | ~US$0.15 + dominio | Dudoso según su política | Media (sandbox, DNS, rebotes) | Solo si se enfoca en correos con consentimiento/transaccionales |
| Brevo/Resend gratis | US$0 | No recomendado (políticas de consentimiento) | Baja | Úsalo para avisos del sistema, no para frío |

## 8. Qué debe hacer el dueño (paso a paso)

1. Comprar un dominio secundario: `.com` ≈ US$10.5-11 al año (Cloudflare Registrar sin margen; Verisign sube el mayorista a ~US$10.97 desde el 1-nov-2026). UNVERIFIED (comparadores: costgoat, domaindetails). `.do` cuesta unos US$40-100/año y puede pedir presencia local: no lo necesita.
2. Poner el DNS en Cloudflare (gratis) para SPF, DKIM, DMARC y reenvío entrante.
3. Contratar un buzón Workspace Starter (≈ US$7/mes) o, para probar, usar su Gmail con el modo prueba.
4. Crear en Google Cloud el cliente OAuth con solo `gmail.send` (y `gmail.readonly` solo para su cuenta).
5. Calentar 3-4 semanas con envíos pocos y reales antes de usar 20-50/día.
6. Preguntar al abogado por la Ley 310-14 antes de activar el frío.

## Recomendación para OPORTIA

- Nunca enviar por SMTP desde el droplet: DO bloquea 25/465/587 (VERIFIED). Todo por API HTTPS.
- Fase 3 (ya diseñada): enviar desde el Gmail del dueño por API con aprobación por correo; costo US$0.
- Para el vendedor IA: dominio secundario (~US$11/año) + un buzón Workspace (~US$7/mes) + Gmail API con solo `gmail.send`; evita la auditoría restringida mientras solo use el buzón del dueño.
- Recibir respuestas: Gmail API de lectura solo en su cuenta; para clientes, pegar/reenviar hasta que haya ingresos (como dice la visión). Opcional: Cloudflare Email Routing (gratis) para un buzón de entrada propio.
- Dejar el envío tras un adaptador (como `src/canales`) con un solo método `enviar()` para cambiar de proveedor sin rehacer nada.
- Límites de OPORTIA: máximo 20/día las primeras 3-4 semanas, luego hasta 50/día, con freno automático si hay un rebote duro o una queja.
- Poner siempre List-Unsubscribe + «Responda NO»; lista de bloqueados permanente; no volver a escribir tras un NO.
- Brevo/Resend gratis solo para correos del sistema (avisos, recuperación de clave), no para frío.
- No empezar el frío hasta que el abogado opine sobre la Ley 310-14.
- Vigilar Postmaster Tools: spam < 0.1 %; si sube, OPORTIA se pausa y avisa por Telegram.
- Costo mensual total esperado: ~US$8 (Workspace + dominio prorrateado), con tope fijado por el dueño.

## Decisiones del dueño

| Decisión | Valor por defecto seguro |
|---|---|
| ¿Comprar un dominio para ventas? | Sí, `.com` secundario (~US$11/año); no usar el dominio principal |
| ¿Contratar Google Workspace (~US$7/mes)? | No todavía: usar primero su Gmail en fase 3; contratar al activar el vendedor IA |
| ¿Cuántos correos al día? | 10-20/día al inicio, máximo 50 tras 4 semanas |
| ¿Quién aprueba cada correo? | Siempre el dueño (sin envío automático) hasta nueva orden |
| ¿Enviar en frío a empresas dominicanas? | No hasta la opinión del abogado sobre la Ley 310-14; mientras, solo con relación previa o permiso |
| ¿Usar Brevo/Resend/SES? | Solo si Gmail/Workspace no sirve; antes de pagar, OPORTIA pregunta |
| ¿Recibir respuestas automáticamente? | Solo en su Gmail (gratis); clientes las pegan o reenvían |
| ¿Poner un tope mensual de gasto en correo? | US$10/mes, con aviso por Telegram al 80 % |
