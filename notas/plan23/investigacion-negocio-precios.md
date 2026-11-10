# Investigación: precios y contratos para vender software a medida (OPORTIA)

Fecha de consulta: 2026-11-10. Alcance: pymes de República Dominicana (RD) y Latinoamérica.

Limitaciones de esta investigación (leer primero):
- Solo se pudo usar WebSearch. WebFetch no alcanzó dgii.gov.do, stripe.com ni developers.facebook.com (host no permitido en la red de la sesión). Por eso casi todo dato externo queda UNVERIFIED (viene de blogs, comparadores o resúmenes de búsqueda, no de la página oficial).
- Para marcar VERIFIED haría falta abrir la página oficial. Aquí se marca VERIFIED solo lo que un buscador devolvió como texto de una página oficial o de documentación del propio proveedor, e igual se pide confirmar.
- Los precios de mercado de RD no aparecieron en cifras RD$; la tabla de precios propuesta es una PROPUESTA de diseño, no un dato de mercado.
- Tipo de cambio usado para convertir: RD$60 = US$1 (supuesto UNVERIFIED; el dueño debe ajustarlo).
- No se contactó ningún servicio ni se abrió cuenta alguna.

## 1. Precios de referencia del mercado

| Dato | Valor | Estado y fuente |
|---|---|---|
| Sitio web a medida, mínimo realista (guía dominicana) | desde unos US$3,000 | UNVERIFIED (blog Neolo, https://www.neolo.com/blog/?p=18412, 2026-11-10) |
| Sitio con plantilla/constructor | US$50-150 | UNVERIFIED (misma fuente) |
| Mantener un sitio pequeño/mediano | US$5-500/mes | UNVERIFIED (Hostinger, https://www.hostinger.com/es/tutoriales/?p=20607) |
| Plataforma de chatbot WhatsApp (Wati) | EUR 39 / 79 / 149 al mes | UNVERIFIED (comparativa de blog, abril 2026, https://www.javadex.es/blog/mejores-herramientas-ia-whatsapp-business-chatbot-ranking-2026) |
| Landbot | EUR 40 / 100 / 200+ al mes | UNVERIFIED (misma fuente) |
| Chatbot de reglas simple | US$15-50/mes | UNVERIFIED (https://www.upliora.es/blog/precio-chatbot-ia-web-whatsapp-empresa-2026) |
| CRM con 3 usuarios + 1 agente IA (México) | MXN 1,800 (~US$99)/mes | UNVERIFIED (tienda del propio proveedor, https://www.aurorainbox.com/en/?p=38965) |
| Precios por usuario de Zoho CRM / Kommo | no encontrados | UNVERIFIED (revisar sus páginas oficiales) |
| Cifras RD$ de agencias dominicanas (reservas, inventario, CRM) | no encontradas | UNVERIFIED: pedir 3 cotizaciones reales a agencias locales antes de fijar precios |

Lectura práctica: el mercado paga por software SaaS de WhatsApp/CRM entre US$40 y US$150 al mes por negocio, y por sitios a medida desde miles de dólares. Una mensualidad de US$30-150 con instalación baja es competitiva frente a alternativas, siempre que se explique bien qué incluye.

## 2. Componentes por consumo y cómo trasladar costos de terceros

| Componente | Cómo cobrarlo | Nota |
|---|---|---|
| Usuarios | incluidos N por plan; extra por usuario/mes | tabla de OPORTIA ya tiene planes y miembros (plan-vision 55) |
| Mensajes WhatsApp | Meta cobra por mensaje de plantilla entregado desde 2025-07-01; mensajes de servicio (respuesta dentro de la ventana de 24 h) gratis; utilidad dentro de ventana gratis | UNVERIFIED en tarifas; modelo confirmado por varios proveedores BSP (https://help.sleekflow.io/en_US/pricing, https://docs.gupshup.io/docs/pricing-updates-on-the-whatsapp-business-platform). Tarifa por país: consultar https://developers.facebook.com/docs/whatsapp/pricing (no accesible). Una fuente menciona otro posible cambio en oct 2026: UNVERIFIED |
| Uso de IA | pasar costo real + margen (por ejemplo costo x1.5) con bolsa mensual incluida y tope duro | OPORTIA ya tiene topes de gasto por usuario/proyecto |
| Almacenamiento | GB incluidos; extra por bloque de 5 GB | disco del servidor es ~10 GB: poner límite por cliente |
| Hosting / dominio | incluir hosting en la mensualidad; dominio anual aparte, a nombre del cliente | dominio a nombre del cliente evita disputas de propiedad |

Regla de transparencia: costos de terceros (WhatsApp/Meta, IA, SMS) se facturan "al costo + 15-30% de gestión", con factura/detalle mensual. El cliente ve su consumo en pantalla. Nunca cobrar un tercero sin tope acordado por escrito.

## 3. Esenciales de contrato (plantilla para que revise un abogado dominicano)

| Cláusula | Contenido mínimo sugerido |
|---|---|
| Alcance | qué módulos se construyen, qué queda fuera, número de rondas de cambios incluidas; cambios extra se cotizan aparte |
| Nivel de servicio (SLA) | disponibilidad objetivo realista, por ejemplo 99% mensual sin garantía de 24/7 (un solo servidor de 512 MB, sin redundancia); horario de soporte; tiempo de respuesta (ej. 1 día hábil) y de arreglo; copias cifradas diarias (ya existen) |
| Propiedad de los datos | los datos del cliente son del cliente; exportación completa (CSV/JSON) a petición y al terminar; el código base propio del vendedor queda del vendedor (licencia de uso mientras pague) |
| Datos personales | cumplimiento de Ley 172-13 (protección de datos); el cliente es responsable de los datos de sus propios clientes; el vendedor es encargado del tratamiento. UNVERIFIED: confirmar con abogado |
| Terminación | aviso de 30 días por cualquiera de las partes después de un periodo mínimo (ej. 3 o 6 meses); entrega de datos 30 días tras terminar; luego borrado a petición |
| Mora en el pago | gracia de 5-10 días, aviso, suspensión del servicio (no borrado de datos) a los 15-30 días; interés de mora acordado (pactar un porcentaje razonable, p. ej. 1.5%/mes; UNVERIFIED legalmente, revisar con abogado). Regla del dueño: nunca borrar datos |
| Responsabilidad | tope de responsabilidad igual a lo pagado en los últimos 3-12 meses; sin garantía de ventas; IA puede equivocarse, el cliente revisa |
| Precios variables | cómo se calcula el consumo, aviso de 30 días antes de subir tarifa, tope mensual acordado |
| Legal | firma digital simple o física; ley y tribunales de RD. UNVERIFIED: forma y validez, consultar abogado |

## 4. Facturación en RD (NCF / e-CF)

| Hecho | Estado y fuente |
|---|---|
| La Ley 32-23 de Facturación Electrónica crea el e-CF (comprobante fiscal electrónico) y lo implanta por grupos de contribuyentes | UNVERIFIED (resúmenes de blogs y PwC: https://pwc.com/ia/es/publicaciones/Noticias-Tax-Legal/Tax-and-Legal-2023/Ley-32-23.pdf) |
| Calendario: grandes nacionales mayo 2024; grandes locales y medianos nov 2025; micro, pequeñas y no clasificados 15 mayo 2026, con prórroga automática de 6 meses a 15 nov 2026 | UNVERIFIED: las fuentes difieren; la prórroga a nov 2026 viene de https://siemprealdia.co/republica-dominicana/impuestos/dgii-prorrogo-el-e-cf-para-pequenos-micros-y-no-clasificados/ y https://beancount.io/es/blog/2026/09/28/dominican-republic-e-cf-electronic-invoicing-november-2026-deadline-guide. Hoy (2026-11-10) faltarían 5 días: el contador debe confirmarlo en dgii.gov.do |
| La DGII ofrece un Facturador Gratuito para emitir/recibir e-CF; máximo unas 150 facturas al mes; sin moneda extranjera según un blog; se solicita en la Oficina Virtual | UNVERIFIED (texto de la página oficial vía buscador: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/facturador-gratuito.aspx) |
| Multas por incumplimiento: art. 257 Código Tributario por remisión de la Ley 32-23 (5 a 30 salarios mínimos) | UNVERIFIED (blog; otro blog dice RD$10,000 hasta 2% de ingresos) |
| Incentivos fiscales por implementar a tiempo (deducción en software de facturación, crédito fiscal) | UNVERIFIED (blogs Alegra / siemprealdia) |
| ITBIS general 18% | UNVERIFIED en esta ronda (no se abrió fuente); confirmar con contador |

Implicación para OPORTIA: Junior (o su empresa) tendrá que emitir e-CF a sus clientes por la mensualidad. Lo más seguro y barato: usar el Facturador Gratuito de la DGII o un facturador certificado externo (costo mensual, pedir cotización, no contratar sin permiso). OPORTIA no debe emitir e-CF por sí misma en fases iniciales: genera el borrador de factura/cotización y Junior lo emite en su facturador. Esto es coherente con plan-vision 55 (cobro por comprobante que él aprueba; e-CF pendiente de diseño con contador). El contador confirma si Junior es contribuyente y de qué grupo, y si los servicios llevan ITBIS.

## 5. Medios de pago para una pyme dominicana

| Medio | Disponibilidad | Estado y fuente |
|---|---|---|
| Transferencia bancaria (ACH/ LBTR) y depósito | disponible, sin comisión de pasarela, ideal para mensualidad B2B; se aprueba con comprobante (ya diseñado) | UNVERIFIED (práctica general) |
| AZUL (Banco Popular / Servicios Digitales Popular) | pasarela de e-commerce y enlace de pago por WhatsApp/correo; líder de adquirencia (~52%); plugin WooCommerce | UNVERIFIED (noticias: https://acento.com.do/economia/azul-lanza-click-to-pay-con-passkeys-para-transformar-el-comercio-electronico-en-la-republica-dominicana-9661436.html y https://www.azul.com.do/Pages/developer/documentos/plugins/Manual%20Plugin%20AZUL-%20WooCommerce.pdf). Comisión: estimada 3-5% por tarjeta (UNVERIFIED, eldinero.com.do); tarifa oficial no encontrada |
| CardNET | procesador dominicano de tarjetas | UNVERIFIED: no apareció en la búsqueda; preguntar directamente |
| PayPal | recibir pagos depende del país; un comparador dice 4.4% + RD$7 local y 5.4% + tarifa fija internacional | UNVERIFIED y contradictorio (https://comparalatam.com/do/card/paypal.html); confirmar en PayPal |
| Stripe | Stripe lista RD como país de DESTINO de pagos (DOP, Global Payouts), pero eso no equivale a poder abrir cuenta de comercio en RD; una consultora dice que sí hay soporte | UNVERIFIED: https://docs.stripe.com/global-payouts/recipient-countries (solo destinatario) y https://www.doola.com/stripe-guide/how-to-open-a-stripe-account-in-dominican-republic/ (tercero). Confirmar en stripe.com/global; opción alternativa: entidad en EE. UU. |

Recomendación de cobro: empezar por transferencia bancaria con comprobante (cero costo y cero integración); añadir enlace de pago AZUL cuando haya varios clientes. No integrar pasarelas en las primeras fases.

## 6. Tabla de precios inicial propuesta (ajustable por Junior)

Tipo de cambio supuesto RD$60 = US$1. Todos los montos son una propuesta para negociar; antes de usarlos comparar con 3 cotizaciones locales.

Instalación (pago único, 50% al firmar y 50% al entregar):

| | Básico | Profesional | Avanzado |
|---|---|---|---|
| Para quién | web sencilla + formulario de contacto o reservas simples | + inventario o CRM sencillo, hasta 3 usuarios | + varios módulos, WhatsApp, IA, hasta 10 usuarios |
| Instalación | RD$18,000 (US$300) | RD$54,000 (US$900) | RD$120,000 (US$2,000) y hacia arriba según cotización |
| Mensualidad base | RD$2,400 (US$40) | RD$5,400 (US$90) | RD$10,800 (US$180) |
| Usuarios incluidos | 1 | 3 | 10 |
| Mensajes WhatsApp incluidos | 0 (solo enlaces de wa.me) | 300 conversaciones de servicio | 1,000 (más plantillas al costo) |
| IA incluida (bolsa) | no | US$3/mes | US$10/mes |
| Almacenamiento incluido | 1 GB | 3 GB | 10 GB |
| Soporte | correo, respuesta 2 días hábiles | 1 día hábil | mismo día hábil, horario laboral |
| Cambios pequeños incluidos al mes | 1 | 3 | 8 |
| Permanencia mínima | 3 meses | 6 meses | 12 meses |

Extras (ajustables):

| Extra | Precio sugerido |
|---|---|
| Usuario adicional | RD$600 (US$10) / mes |
| Paquete de 500 mensajes WhatsApp (conversaciones de servicio) | al costo de Meta + 20% |
| Plantillas de WhatsApp (utilidad, marketing, aviso) | al costo de Meta + 20% |
| IA por encima de la bolsa | costo real + 30%, con tope mensual acordado |
| Almacenamiento extra 5 GB | RD$600 (US$10) / mes |
| Dominio (anual, a nombre del cliente) | costo + RD$600 de gestión |
| Hora de desarrollo extra o módulo nuevo | RD$1,800-3,000 (US$30-50) por hora, cotizado antes |
| Demo / maqueta previa | gratis en las fases de venta; si pasa de 2 rondas, se cobra |
| Reactivación tras suspensión por mora | RD$1,200 (US$20) |
| Emisión de factura electrónica (si el cliente quiere que Junior la gestione) | incluida; costo del facturador externo, si lo hay, aparte |

Descuento por pago anual: 2 meses gratis. ITBIS: indicar si los precios llevan o no ITBIS (confirmar con contador; mostrar precio final al cliente).

Referencia de costos reales de Junior: servidor DigitalOcean 512 MB, aproximadamente US$4-6/mes por droplet (UNVERIFIED; confirmar en la factura propia) y gasto de IA según uso. Un solo droplet de 512 MB alcanza para pocos clientes; el plan Avanzado exige vigilar consumo. Con margen del 60-80% la mensualidad cubre sobradamente el hosting; el trabajo grande es soporte y cambios.

## Recomendación para OPORTIA

- Guardar la tabla de precios como configuración editable por Junior (planes, extras, tipo de cambio, margen), nunca fija en el código, y que el vendedor automático solo cotice desde esa tabla (CONTINUAR.md: sin inventar precios).
- Calcular el consumo por cliente (usuarios, mensajes, IA, GB) y mostrar al cliente y a Junior el costo del mes, con topes duros antes de pasar el límite.
- Plantilla de contrato en borrador con las cláusulas de la sección 3; Junior firma y un abogado dominicano la revisa antes del primer cliente real (confirmar mora, firma digital y Ley 172-13).
- Empezar con transferencia bancaria y comprobante aprobado por Junior; dejar AZUL/CardNET/PayPal/Stripe para cuando haya clientes, tras confirmar disponibilidad real en sus páginas oficiales.
- Facturación: preparar borrador de factura, pero la emisión del e-CF la hace Junior en el Facturador Gratuito de la DGII o un facturador certificado; consultar al contador por el plazo del 15 nov 2026 y el ITBIS.
- Trasladar costos de terceros (WhatsApp/Meta, IA) al costo más un porcentaje, siempre con tope pactado y aviso previo; WhatsApp automático solo cuando haya ingresos (plan-vision 47).
- Dominio y cuentas de terceros (Meta, correo) a nombre del cliente; datos exportables siempre; en mora se suspende el servicio, no se borran datos.
- Prometer en el SLA solo lo que un servidor de 512 MB puede cumplir (99% mensual, sin 24/7 garantizado) y avisar al cliente de ventanas de mantenimiento.
- Validar los precios con 3 cotizaciones locales y con los primeros 2-3 clientes piloto antes de publicarlos.

## Decisiones del dueño

| Decisión | Valor por defecto seguro |
|---|---|
| ¿Qué precios usar para los 3 planes y extras? | La tabla de la sección 6, marcada como borrador; nada se envía a un cliente sin tu aprobación |
| ¿Moneda principal de cotización? | RD$ con equivalente en US$; tipo de cambio actualizable por ti |
| ¿Margen sobre costos de terceros? | Costo + 20% (WhatsApp) y costo + 30% (IA), con tope mensual acordado |
| ¿Permanencia mínima? | 3 / 6 / 12 meses según plan, con aviso de 30 días para salir después |
| ¿Cómo cobrar al empezar? | Transferencia bancaria con comprobante aprobado por ti; sin pasarelas |
| ¿Cómo emitir facturas? | Facturador Gratuito de la DGII o el que te indique el contador; OPORTIA solo prepara el borrador |
| ¿Interés de mora y suspensión? | Gracia 10 días, aviso, suspensión a los 15 días sin borrar datos; el interés lo fija el abogado |
| ¿Quién revisa el contrato? | Un abogado dominicano antes del primer cliente; mientras tanto no se firma ninguno |
| ¿Descuentos del vendedor automático? | Ninguno sin tu permiso; máximo permitido escrito por ti por proyecto |
| ¿ITBIS incluido en el precio? | Precio mostrado sin ITBIS más ITBIS aparte, hasta que el contador confirme |
