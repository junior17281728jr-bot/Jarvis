# Investigación: leyes de República Dominicana para OPORTIA (prospección B2B automática e IA que contacta empresas)

Fecha: 2026-11-10. **Esto NO es asesoría legal.** Es un mapa de riesgos para preparar la consulta con un abogado dominicano.

## 0. Aviso de método (leer primero)
- Los **textos oficiales completos no se pudieron abrir**: en esta sesión WebFetch no resuelve ningún dominio (ogtic.gob.do, dgii.gov.do, indotel.gob.do, phlaw.com, etc. dan ENOTFOUND; habría que permitirlos en la red de la sesión). Solo funcionó WebSearch, que devuelve resúmenes.
- Por eso **ningún hecho está VERIFIED** según la regla estricta (leer la página primaria). Cada dato lleva **UNVERIFIED** más la fuente que lo mostró y su nivel: **[ofic]** = el resumen cita texto de un PDF oficial (el PDF existe, no lo leí entero) o **[sec]** = despacho de abogados, prensa o blog.
- Las citas entre comillas son fragmentos que aparecieron en los resultados de búsqueda, no transcripciones de los artículos completos. Los números de artículo y las cifras de multas deben confirmarse en el texto oficial.
- Tarea pendiente cuando se permita la red: abrir los PDF oficiales de la tabla de fuentes (sección 9) y pasar cada fila a VERIFIED.

## 1. Resumen en una tabla

| Tema | Qué dice (resumen) | Efecto en OPORTIA | Certeza |
|---|---|---|---|
| Ley 172-13 datos personales | Su art. 3 excluiría los datos de personas jurídicas y los archivos que solo tengan datos profesionales de empleados (nombre, cargo, correo, teléfono profesionales) | Una empresa y su correo/teléfono corporativo quedarían fuera. NO quedan fuera: dueño de negocio persona física (colmado, taller, profesional), datos personales extra, redes sociales personales | Media |
| Ley 310-14 spam | Correo comercial no solicitado prohibido; excepción: relación comercial previa sin rechazo; asunto con la palabra "publicidad"; identificación del remitente; baja funcional | Aplica al correo, parece no distinguir B2B de B2C. Frío a empresas = riesgo alto | Media (texto), Baja (B2B) |
| Ley 53-07 alta tecnología | Acceso ilícito = entrar a un sistema sin autorización o excediéndola | Leer páginas públicas es distinto de entrar a sistemas; evitar saltar logins, captchas, bloqueos | Media |
| Ley 126-02 comercio electrónico | Reconoce mensajes de datos, contratos y firmas digitales | Un contrato/aceptación por vía electrónica puede valer; firma "avanzada" requiere certificado | Media |
| Ley 32-23 factura electrónica | Calendario por grupos; micro/pequeñas y no clasificados: prórroga hasta 15-nov-2026 | Si Junior cobra, probablemente debe emitir e-CF desde ya o muy pronto | Media |
| Ley 358-05 consumidor | Contratos de adhesión claros y legibles; protege consumidores | Una empresa que contrata una suscripción es "proveedor", no consumidor, salvo micro-negocio persona física: dudoso | Baja |
| Aviso de IA | No se encontró ley vigente que obligue a decir "soy una IA" | Hacerlo igual (honestidad, riesgo de engaño, reglas de WhatsApp/Meta) | Media |

## 2. Ley 172-13 (protección integral de datos personales)
Gaceta Oficial 10737, 15-dic-2013; promulgada 13-dic-2013. UNVERIFIED [sec] (kiteworks / vLex / DLA Piper en la búsqueda).

| Punto | Hallazgo | Estado |
|---|---|---|
| ¿Aplica a personas jurídicas? | Art. 3 (ámbito): no aplica "a los tratamientos de datos referidos a personas jurídicas, ni a los archivos de datos personales que se limiten a incorporar los datos de las personas físicas que presten sus servicios en aquellas", con la lista: nombre, funciones o puesto, dirección postal o electrónica, teléfono y fax profesionales. Fuente: PDF de la ONE (one.gob.do/media/u5ohmfyp/ley-172-13.pdf) y resumen de Pellerano & Herrera. | UNVERIFIED [ofic parcial] |
| Datos personales | Información sobre personas físicas identificadas o identificables | UNVERIFIED [sec] |
| Qué queda protegido en B2B | Si el archivo guarda más que lo profesional (WhatsApp personal, perfil personal de redes, dirección de casa, historial de conducta del dueño, foto), la exclusión no cubriría esa parte. Empresario individual (persona física con negocio): no aclarado | Dudoso, lo debe confirmar el abogado |
| Consentimiento, derechos (acceso, rectificación, cancelación), registro de bancos de datos, sanciones | Son centrales en la ley según análisis; no se obtuvo el texto de los artículos ni cifras | UNVERIFIED, sin cita |
| Transferencia fuera de RD | Requiere consentimiento o base legal prevista (relevante: IA de Anthropic/OpenAI en el extranjero y Telegram) | UNVERIFIED [sec] |
| Reforma | Hay proyecto de modificar la 172-13 en discusión en el Congreso (octubre 2026, blog consultor) | UNVERIFIED [sec]; vigilar |

Ciertos: la ley existe y su objeto es la protección de datos personales en archivos y bancos de datos. Dudoso: alcance exacto sobre contactos profesionales y empresarios individuales. Debe confirmar abogado: si hay que inscribir el banco de datos de prospectos, base legal de "fuentes públicas", y el derecho "Quitar mi negocio" (ya contemplado en la visión, función 58) como mecanismo de cancelación.

## 3. Ley 310-14 (correos electrónicos comerciales no solicitados)
Promulgada 8-ago-2014 (DLA Piper). Texto oficial: indotel.gob.do/wp-content/uploads/2022/10/ley-310-14-2.pdf y ogtic.gob.do. UNVERIFIED (no leída entera).

| Punto | Hallazgo | Estado |
|---|---|---|
| Objeto (art. 1) | "regular el envío de comunicaciones comerciales, publicitarias o promocionales no solicitadas, realizadas vía correos electrónicos" | UNVERIFIED [ofic parcial] |
| Regla (art. 7 según Acento) | Prohíbe remitir mensajes comerciales no solicitados; el envío sin consentimiento es ilegal | UNVERIFIED [sec] |
| Excepción | Relación comercial previa con el destinatario que no haya expresado rechazo | UNVERIFIED [sec] (OGTIC, SACO) |
| ¿Opt-in u opt-out? | Se lee como **consentimiento previo (opt-in)** con excepción de relación previa. No se halló un régimen opt-out al estilo CAN-SPAM | UNVERIFIED, inferencia |
| ¿Cubre B2B y correos corporativos? | **No se encontró excepción para B2B ni para direcciones corporativas.** Los resúmenes hablan de "destinatario" sin distinguir. Asumir que cubre. Doctrina o criterio de INDOTEL: no hallado | **Dudoso: lo confirma el abogado** |
| Asunto | Debe incluir la palabra "publicidad" (para adultos, "publicidad para adultos") | UNVERIFIED [sec] (Pellerano & Herrera) |
| Identificación | Razón social, domicilio completo y teléfono o correo de contacto | UNVERIFIED [sec] |
| Baja | Medio válido y activo para pedir no recibir más (correo o mecanismo web); plazo citado: 2 días hábiles (ecomm365) o 5 días (SACO): fuentes en conflicto | UNVERIFIED, conflicto |
| Dirección física | Se exige "domicilio completo"; no se halló otra exigencia | UNVERIFIED |
| Sanciones | Resúmenes dicen prisión de 6 meses a 5 años y multa de 1 a 200 salarios mínimos, conductas: falsear el asunto, seguir enviando tras la baja; además demanda civil por daños. Esas cifras podrían ser las de la ley de delitos electrónicos, no confirmadas | UNVERIFIED, conflicto |
| Alcance de canales | El título y objeto hablan de **correo electrónico**. WhatsApp, SMS, Facebook y llamadas: la ley no los cubre expresamente según los resúmenes; otras normas (172-13 si hay persona física, términos de WhatsApp/Meta, Pro Consumidor) pueden aplicar. INDOTEL tiene resolución 010-16 que cita la ley (mensajes de recordatorio) | Dudoso |

Ciertos: hay ley, hay etiqueta "publicidad", identificación y baja. Dudoso: B2B, canales no-correo, penas. La visión de OPORTIA (función 59) ya anticipa esto; el borrador "para que llames" es el camino seguro.

## 4. Ley 53-07 (crímenes y delitos de alta tecnología)
Texto: dgii.gov.do (.../53-07.pdf), mip.gob.do. UNVERIFIED.

| Punto | Hallazgo | Estado |
|---|---|---|
| Art. 4 | Acceso ilícito = ingresar o intentar ingresar sin autorización, o por acceso de un tercero, a un sistema de información | UNVERIFIED [sec] |
| Art. 6 | Acceso a un sistema "utilizando o no una identidad ajena, o excediendo una autorización": prisión de 3 meses a 1 año y multa de 1 a 200 salarios mínimos (versión del Consejo de Europa; modificada luego, con agravantes si hay supresión o modificación de datos) | UNVERIFIED [sec]; reforma sin texto completo |
| Aplicación a scraping | Leer páginas web públicas sin credenciales no es "ingresar a un sistema" en la lectura natural, pero no hay jurisprudencia dominicana hallada. Riesgos: saltarse login, captcha, límites de uso, términos de servicio, cuentas falsas, altas tasas de peticiones que dañen un servicio (daño o sabotaje) | Dudoso |

Regla práctica ya alineada con las reglas del dueño: solo datos públicos y legales, respetar robots.txt y términos, tasa baja de peticiones, jamás usar cuentas ajenas ni evadir bloqueos.

## 5. Ley 126-02 (comercio electrónico, documentos y firmas digitales)
Promulgada 4-sep-2002; reglamento Decreto 335-03; regulador INDOTEL (art. 56). UNVERIFIED [sec] (aduanas.gob.do y dgii.gov.do alojan el PDF; no se pudo abrir).

- Reconoce mensajes de datos y documentos electrónicos y fija criterios de fiabilidad de la firma digital equivalente a la manuscrita. UNVERIFIED [sec].
- Para OPORTIA: un contrato o aceptación de una cotización por correo/WhatsApp podría ser válido como mensaje de datos, pero para prueba fuerte conviene aceptación explícita (casilla + registro con fecha, IP y texto) o firma con certificado. Qué nivel de prueba aceptan los tribunales: lo confirma el abogado.
- Nota: una búsqueda que mencionó "Ley 153-05" no devolvió nada; no se usa.

## 6. Ley 32-23 (facturación electrónica) y reglamento
Promulgada 16-may-2023 (según siemprealdia.co); reglamento Decreto 587-24. UNVERIFIED [sec].

| Grupo | Plazo hallado | Estado |
|---|---|---|
| Grandes contribuyentes nacionales | 12 meses desde la vigencia | UNVERIFIED [sec] |
| Grandes locales y medianos | Plazo original venció; una fuente dice 1-nov-2026, otra que la prórroga no los beneficia: **fuentes en conflicto** | UNVERIFIED, conflicto |
| Micro, pequeñas y no clasificados | Prórroga administrativa general de 6 meses desde 15-may-2026, hasta **15-nov-2026** (Aviso 06-26 / 6-may-2026, noticiassin.com, sj.com.do). Hoy son 5 días | UNVERIFIED [sec] |
| Sanciones | Art. 26: dieciséis infracciones; multas citadas 5 a 30 o 5 a 50 salarios mínimos (conflicto) | UNVERIFIED, conflicto |

Para OPORTIA: si Junior (o su empresa) cobra suscripciones, lo normal es que sea un contribuyente obligado a emitir e-CF según su categoría. La plataforma de cobro debe poder emitir o enlazar a un facturador autorizado por DGII. Esto confirma el aviso de la visión (función 55): **diseñarlo antes de cobrar**. Qué grupo es él y desde qué fecha: lo confirma el contador (consultar listados oficiales de DGII).

## 7. Consumo y suscripciones
Ley 358-05 (Pro Consumidor), Decreto 236-08. UNVERIFIED [sec].
- Art. 81: contrato de adhesión = redactado previa y unilateralmente por el proveedor; art. 83: debe ser legible a simple vista, en términos claros. UNVERIFIED [sec].
- Renovación automática: la práctica descrita por prensa exige que el cliente cancele expresamente; **no se halló** regla específica para suscripciones en línea. UNVERIFIED.
- Pro Consumidor puede sancionar e incautar (TC confirmó). UNVERIFIED [sec].
- Duda clave: ¿las empresas compradoras son "consumidores"? Normalmente la ley protege al destinatario final; un micro-negocio o un profesional persona física podría alegar protección. Dudoso: abogado.
- Buenas prácticas seguras: precio final en pesos y con impuestos, fecha de renovación visible, botón de cancelar que funcione en cualquier momento, aviso previo de cobro y de subida de precio, factura/comprobante, contrato en español sencillo. Esto no sale de una norma verificada: es prudencia.
- La cuota mensual "variable por consumo" debe estar en el contrato con la fórmula y un tope, para no ser cláusula abusiva (criterio de prudencia, UNVERIFIED).

## 8. Aviso cuando una IA habla con una persona
- Búsqueda: **no se halló ley dominicana vigente que obligue a identificar un chatbot como IA.** Hay proyectos en el Senado y la Cámara (transparencia, uso ético; estado en septiembre 2026 por blog consultor), una comisión permanente de IA y un código de ética para servicios públicos (Decreto 787-26 según un resumen). UNVERIFIED [sec].
- No obstante: engaño sobre la identidad en una venta puede ser publicidad engañosa (358-05, dudoso) y las plataformas (WhatsApp Business, Meta, Telegram) tienen sus reglas. Estas reglas de plataforma NO se verificaron aquí.
- Si el destinatario es una persona física, la 172-13 podría exigir informar de qué se hace con sus datos (dudoso).

## 9. Fuentes (URLs; todas UNVERIFIED en esta sesión porque no se abrieron)
- Ley 310-14: https://indotel.gob.do/wp-content/uploads/2022/10/ley-310-14-2.pdf ; https://wp.ogtic.gob.do/wp-content/uploads/2019/02/Ley-310-14.pdf ; https://ogtic.gob.do/nueva-ley-310-14-regula-envio-de-correos-electronicos-comerciales-no-deseados/ ; Pellerano & Herrera: http://www.phlaw.com/es/publicacion/348/ley-310-14-que-prohibe-envio-mensajes-comerciales-no-solicitados
- Ley 172-13: https://www.one.gob.do/media/u5ohmfyp/ley-172-13.pdf ; https://migracion.gob.do/wp-content/uploads/2019/10/Ley-172-13-sobre-proteccion-de-datos-personales-de-fecha-13-de-diciembre-de-2013.pdf ; https://dpej.rae.es/eli/do/l/2013/12/13/172
- Ley 53-07: https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/53-07.pdf ; https://rm.coe.int/16803042f3
- Ley 126-02: https://www.aduanas.gob.do/media/uwkfqq5x/126-02_sobre_comercio_electronico_y_firmas_digitales.pdf
- Ley 32-23: https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/Listados-contribuyentes-obligados-implementar-facturacion-electronica.aspx ; https://noticiassin.com/economia/mundial/2026/05/06/dgii-extiende-6-meses-plazo-de-facturacion-electronica-1991684/ ; https://www.sj.com.do/prorroga-facturacion-electronica-rd-2026-dgii/
- Ley 358-05: https://www.wipo.int/wipolex/en/details.jsp?id=11048
- IA en RD: https://www.diegoceredi.com/blog/regulacion-ia-republica-dominicana-2026 (blog, baja fiabilidad)

## 10. Qué es cierto, qué es dudoso, qué debe confirmar el abogado

| Cierto (con respaldo razonable) | Dudoso | Lo debe confirmar un abogado o el contador |
|---|---|---|
| 310-14 existe, exige "publicidad" en el asunto, identificación y baja | Si cubre B2B y correos corporativos | Respuesta formal: ¿el frío a empresas necesita consentimiento? ¿Aplica a WhatsApp/SMS/redes? |
| 172-13 existe y excluye (art. 3) personas jurídicas y datos profesionales de sus empleados | Empresario individual, datos mixtos | Si hay que registrar el banco de datos; base legal de fuentes públicas; transferencia a IA extranjera |
| 53-07 sanciona el acceso sin autorización | Aplicación al scraping público | Límites aceptables de lectura automática |
| Factura electrónica en calendario; MIPYMES hasta 15-nov-2026 | Grupo de Junior, multas | Contador: categoría, fecha, facturador |
| No hay ley de IA aprobada (según blog) | Proyectos en trámite | Revisar antes de lanzar el vendedor IA |

## Recomendación para OPORTIA
- **Correo en frío: apagado por defecto.** Enviar solo a empresas con consentimiento o relación comercial previa; para el resto, preparar borrador y que el dueño llame (coincide con función 59). Encender el envío frío solo con opinión escrita del abogado.
- Todo correo comercial lleva: "publicidad" en el asunto, razón social, domicilio, teléfono/correo de contacto y enlace de baja que funcione de inmediato (plazo interno: 24 h y siempre antes de 2 días hábiles). Lista de supresión global: quien se baja no vuelve (ya existe «Quitar mi negocio», función 58).
- Separar en la base "dato de empresa" (razón social, correo/teléfono corporativo) de "dato de persona" (dueño, redes personales, WhatsApp personal); guardar de este último lo mínimo, con fuente y fecha, y tratarlo bajo 172-13.
- Scraping prudente: solo páginas públicas, respetar robots.txt y términos, tasa baja, nunca login, cuentas falsas ni captcha; registrar la fuente de cada dato.
- Vendedor IA: se identifica como asistente automático en el primer mensaje (por prudencia, aunque la ley dominicana no lo exija hoy), ofrece hablar con una persona, nunca inventa precios ni promete lo que no está en el catálogo, y deja todo registrado para Junior.
- WhatsApp/Facebook/SMS/llamadas: tratar como "mismo riesgo que correo o mayor" y solo bajo consentimiento hasta que el abogado opine; respetar además las políticas de cada plataforma (sin verificar aquí).
- Cobro: antes de cobrar, definir con el contador la factura electrónica (e-CF) y el facturador; contrato en español simple con precio, fórmula del cargo variable con tope, renovación y cancelación visibles.
- Aceptación de contrato en línea: casilla explícita, guardar texto, fecha, IP y versión (base de prueba bajo 126-02); firma con certificado solo si el abogado lo pide.
- Vigilar el cambio de leyes (reforma 172-13, proyectos de IA) como tarea periódica, y guardar las reglas legales en `paises/rd` como ya prevé el plan.
- Pedir al abogado una sola consulta con 5 preguntas (las de "Decisiones del dueño") y guardar su respuesta por escrito en notas.

## Decisiones del dueño (cada una con valor seguro por defecto)

| # | Decisión | Por defecto seguro |
|---|---|---|
| 1 | ¿Contratar un abogado para una consulta única sobre 310-14, 172-13 y vendedor IA? | **Sí**, consulta corta antes de enviar el primer mensaje real (costo: preguntar antes) |
| 2 | ¿Permitir correo en frío a empresas hasta tener opinión legal? | **No**; solo borrador para llamar y envíos a quien dio permiso o ya es cliente |
| 3 | ¿El vendedor IA se presenta como IA? | **Sí**, siempre en el primer mensaje, con opción "hablar con una persona" |
| 4 | ¿Usar WhatsApp, SMS o Facebook para contacto en frío? | **No** hasta la opinión del abogado y revisar políticas de la plataforma |
| 5 | ¿Guardar datos personales de dueños (WhatsApp, perfil personal)? | **Solo lo mínimo y público**, con fuente y fecha; borrar a pedido de inmediato |
| 6 | ¿Cuándo definir la factura electrónica? | **Antes del primer cobro**, con el contador (preguntarle si Junior ya es obligado y su fecha) |
| 7 | ¿Contrato de suscripción? | Texto simple en español, cancelación en un toque, aviso previo de cada cobro y de cambios de precio |
| 8 | ¿Permitir lecturas automáticas de sitios? | **Sí, solo páginas públicas**, respetando robots.txt y términos, tasa baja |
