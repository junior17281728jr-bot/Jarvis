# Diseño de la capa de NEGOCIO: catálogo, precios, contrato y después de la venta

Fecha: 2026-11-10. Solo diseño: no se tocó ningún repositorio, ni el servidor, ni ninguna cuenta, y no se contactó ningún servicio. Código leído: OPORTIA 0.5.1 (`wt-claro`, base en la migración 6). Se apoya en `plan23/diseno-fase3.md` (el vendedor) y `plan23/diseno-fase2.md` (empresas), que también son solo planes.

Etiquetas: **VERIFIED** (url, 2026-11-10) = leído hoy en la página oficial. **UNVERIFIED** = no se pudo abrir la página oficial desde esta sesión. **INFORME** = viene de un informe de `plan23/` (con su etiqueta allí). **CÓDIGO** = leído en `wt-claro`. **PROPUESTA** = número de diseño, no un dato del mercado.

Red de esta sesión: solo respondió `platform.claude.com`. No resolvieron `www.digitalocean.com`, `dgii.gov.do` ni `www.bancentral.gov.do` (hay que permitirlos en la red de la sesión, junto con `developers.facebook.com`, para pasar a VERIFIED los precios de servidor, la factura electrónica, la tasa del dólar y las tarifas de WhatsApp).

---

## 0. Para Junior, en simple

**¿Esto afecta el servidor?** Hoy no: es un plan. Cuando se construya, casi nada: son listas pequeñas (clientes, cobros, pedidos), una revisión al día que tarda menos de un segundo, sin IA obligatoria y sin puertas nuevas a internet.

| Pregunta | Respuesta |
|---|---|
| ¿Qué es esta capa? | Lo que hace falta para que vender programas sea un negocio ordenado: saber qué se puede prometer, cuánto cobrar, preparar el contrato, recordar los cobros, atender pedidos y pasarle a Claude el encargo de construir. |
| ¿Qué queda DENTRO de OPORTIA? | El catálogo, la tabla de precios, la cotización, el borrador de contrato, la lista de clientes, los cobros y sus recordatorios, los pedidos de soporte y el «encargo» para Claude. Todo son papeles y recordatorios. |
| ¿Qué queda FUERA? | Construir, alojar, cuidar y medir el programa de cada cliente. Eso es una **línea nueva** («la Fábrica») que tu plan aprobado no tiene en ninguna fase. Es una decisión tuya (DN1). |
| ¿Cabe el programa de un cliente en tu servidor? | No. Tu servidor de 512 MB es para OPORTIA. Cada cliente necesita su propio servidor pequeño, y la mensualidad lo paga. |
| ¿Sale algún cobro o mensaje solo? | No. OPORTIA prepara el aviso; tú lo apruebas y lo envías. OPORTIA nunca cobra, nunca firma y nunca suspende un servicio sola. |
| ¿Se borra algo? | Nunca. Un cliente que no paga queda «suspendido», con sus datos guardados. |
| ¿Cuesta dinero? | Esta capa, US$0. Lo que sí cuesta es de la Fábrica (un servidor por cliente) y se te pregunta antes. |
| ¿Lo puede llevar una sola persona? | Sí: un mensaje al día por Telegram con «qué toca hoy» y botones de un toque. |
| ¿Qué falta de afuera? | Un abogado (plantilla de contrato) y un contador (factura electrónica e ITBIS). Sin ellos no se firma ni se factura. |
| *(rev. 1)* ¿Puede el vendedor vender ya? | **No hasta que decidas DN1** (quién construye y dónde vive el programa de un cliente) y apruebes el catálogo (DN14). Mientras, el vendedor no envía cotizaciones: no se promete lo que nadie puede entregar. Es la primera pregunta de todo el plan de las fases 2 y 3. |
| *(rev. 1)* ¿Hay algo con fecha? | Las fuentes citan el **15-nov-2026** como plazo de la factura electrónica (sin verificar). Si vas a cobrar a clientes, pregúntale a un contador esta semana. |

La idea en una línea: **el vendedor solo promete lo que está en el catálogo, solo cotiza con tu tabla, y cada venta firmada se convierte sola en tres cosas: un cliente con sus cobros, un encargo para Claude y un lugar donde anotar sus pedidos.**

---

## 1. Qué existe ya y qué supone este diseño

### 1.1 En el código publicado (CÓDIGO)

| Pieza | Dónde | Para qué sirve aquí |
|---|---|---|
| Espacios, miembros y plan | `src/nucleo/migraciones.js` (migración 2), `src/cuentas/planes.js` | Todo lo del negocio cuelga del espacio del dueño. **Ojo:** solo existen `espacios.plan` y `miembros`; **no hay tablas de planes ni de pagos** (ver conflicto N2). |
| Versiones con aprobación | `proyecto_versiones` (migración 3) | Mismo patrón para catálogo, precios y plantilla de contrato: cambiar crea una versión que tú apruebas. |
| Fila de tareas 24/7 | `src/tareas/tipos.js`, `PROGRAMAS_DEL_SISTEMA` | La revisión diaria de cobros es un tipo nuevo, un paso corto, cupo `normal`. |
| Avisos del administrador | `src/avisos/avisos.js` (`CLAVES_AVISO`, un aviso abierto por clave, suma «veces») | Claves nuevas del negocio: una por tema, no una por cliente. |
| Telegram | `src/canales/avisador.js` (tope 10 por hora y 30 por día) | Un solo resumen diario, para no gastar el tope de los avisos graves. |
| IA con topes | `src/ia/` (dinero en millonésimas de dólar, precios en `precios.json` con fuente oficial) | Opcional: solo para redactar bonito un aviso. Sin IA, plantillas. |
| Copias cifradas | `src/copias/` | Todo lo nuevo va en la base y entra en la copia de cada noche. |
| Reglas de migración | `test/reglas.test.js` | Solo agregar; sin `CHECK`; sin reglas únicas de negocio; `NOT NULL` con `DEFAULT`. |

### 1.2 En el diseño de la fase 3 (plan, sin construir) — se EXTIENDE, no se repite

| Ya diseñado en la fase 3 | Lo que esta capa le añade |
|---|---|
| `catalogo_funciones` (clave, versión, nombre, estado, explicación, días mín-máx, costos de terceros, nota interna) | Categoría, talla, impacto mensual, lo que NO incluye, preguntas de alcance, cómo se prueba, madurez y fecha de revisión (§3.2). |
| Tabla de precios dentro de `vendedor_paquetes.precios` (por proyecto, con versión) | La forma exacta de la tabla: base, tallas, mínimo mensual, tramos de consumo, terceros, techo de descuento, piso (§4). |
| `cotizar()` sin IA y tabla `cotizaciones` | Solo la fórmula (§4.3). Nada más cambia. |
| Borrador de contrato en la parte 3.8, apagado hasta el abogado (C10, D18) | El flujo completo cotización → contrato → firma y sus tablas (§5). |
| `ventas` (la llenas tú con «Se vendió») | Al tocar «Firmado» se crea sola, junto con sus cobros y el encargo (§5.4). «Se vendió» sigue existiendo para ventas sin contrato de OPORTIA (conflicto N16). |
| «Déjeme confirmarlo» te pregunta a ti (C8) | Lo que se pregunta y no está en el catálogo se junta en una lista para la próxima revisión de Claude (§3.5). |

### 1.3 Funciones de la visión que toca (ninguna se quita ni se cambia)

4 («No sé qué vender»: la lista de «lo que piden y no tenemos» le da datos reales) · 7 y 8 (IA con tope) · 15 (nada empieza sin tu sí) · 25 y 29 (propuestas y mensajes) · 30 y 33 (aprobar antes de enviar; nunca negocia sin permiso) · 34 (historial y seguimiento) · 45 y 47 (Telegram para ti; WhatsApp automático cuando haya ingresos) · 50 y 51 (copias; sin botones falsos) · 55 (planes y cobros de OPORTIA: **se mantienen aparte**, §8) · 59 (leyes).

---

## 2. La raya: qué es de OPORTIA y qué es una línea nueva

```
        OPORTIA (tu servidor de 512 MB)                     LA FÁBRICA (línea nueva, sin fase aprobada)
 ┌──────────────────────────────────────────────┐        ┌───────────────────────────────────────────┐
 │ Catálogo ─► Precios ─► Cotización ─► Contrato│        │ Claude construye el programa del cliente  │
 │                                   (tú firmas)│        │ Un servidor pequeño por cliente           │
 │ Cliente ─► Cobros y recordatorios ─► Mora    │ encargo│ Copias, vigilancia y arreglos             │
 │ Soporte (pedidos anotados)                   │───────►│ Medidor de consumo dentro del programa    │
 │ Encargo para Claude (texto con el alcance)   │◄───────│ Informe de entrega y de consumo del mes   │
 └──────────────────────────────────────────────┘ informe└───────────────────────────────────────────┘
        papeles, números y recordatorios                    programas reales con datos de otros negocios
```

| Tema | Dentro de OPORTIA | Fuera (la Fábrica) | Por qué |
|---|---|---|---|
| Saber qué se puede hacer | Sí | — | Es conocimiento del vendedor. |
| Cotizar y preparar contrato | Sí | — | Son cuentas y texto. |
| Recordar cobros y mora | Sí | — | Es un calendario. |
| Anotar pedidos de soporte | Sí | — | Es una lista. |
| Escribir el encargo | Sí | — | Sale de la cotización y la conversación. |
| Construir el programa | No | Sí | Lo hace Claude en una sesión de trabajo, no el servidor. |
| Alojar el programa | No | Sí | 512 MB y ~10 GB no alcanzan; y los datos de un cliente no deben vivir junto a OPORTIA. |
| Medir el consumo | Solo anota lo que tú confirmas | Sí | OPORTIA no puede ver dentro del programa de otro. |
| Suspender por mora | Solo lo propone y lo anota | Sí (lo haces tú o Claude, a mano) | Decisión delicada: nunca automática. |
| Emitir la factura fiscal | No (prepara los datos) | No (tu facturador de la DGII) | Ver §6.4. |

Recomendación: aprobar la Fábrica como **línea aparte** con UN cliente piloto, y darle número de fase («fase 7») después de la 6. Detalle en §8 y decisión DN1.

---

## 3. El catálogo de lo que se puede hacer

### 3.1 Para qué sirve

Es la única lista de la que el vendedor puede prometer. Cada cosa dice, en palabras sencillas: **si se puede, qué no incluye, cuánto tarda, qué le cuesta al cliente aparte y cuánto sube su mensualidad**. Lo que no está en la lista o está «en revisión» nunca recibe precio: el vendedor dice «déjeme confirmarlo» y te pregunta (regla ya diseñada en la fase 3, §7.2).

### 3.2 Qué guarda cada cosa del catálogo

| Dato | Ejemplo | Lo ve el cliente | Nota |
|---|---|---|---|
| Clave y nombre sencillo | `citas` · «Citas en línea» | Sí | Ya en la fase 3 |
| Estado | Se puede · Con límites · En revisión · No se puede | Sí (en palabras) | Ya en la fase 3 |
| Explicación | «Sus clientes eligen día y hora desde el celular.» | Sí | Ya en la fase 3 |
| Tiempo | 4 a 8 días de trabajo | Sí, como rango | Ya en la fase 3 (`dias_min`, `dias_max`) |
| Costos de terceros | Quién cobra, cuánto aprox., a nombre de quién va la cuenta, fecha en que se revisó | Sí | Ya en la fase 3 (`costos_terceros`); se le añade «a nombre de» y «revisado el» |
| **Categoría** | Vender · Atender · Controlar · Avisar · Con IA · Conexiones · No se hace | Sí | NUEVO |
| **Talla** | S · M · L · XL | No (se convierte en precio) | NUEVO. XL nunca se cotiza solo: pasa a ti |
| **Impacto mensual** | Ninguno · Bajo · Medio · Alto, y por qué («más copias», «más soporte») | Sí, como monto | NUEVO |
| **Lo que NO incluye** | «No cobra con tarjeta.» | Sí | NUEVO. Evita prometer de más |
| **Preguntas de alcance** | «¿Cuántas personas atienden?» (máx. 3) | Sí (las hace el vendedor) | NUEVO. Sin respuesta no hay cotización firme |
| **Cómo se prueba** | «Reservar, cambiar y cancelar una cita desde un celular.» | En el contrato | NUEVO. Es la lista de aceptación de la entrega |
| **Madurez** | Probado (ya hecho en OPORTIA) · Parecido · Nuevo | No | NUEVO. «Nuevo» suma 50 % al tiempo |
| **Depende de** | `citas` necesita `base` | No | NUEVO |
| Nota interna | Costos, riesgos, trucos | **Nunca** (ni a la IA) | Ya en la fase 3 |

*(rev. 1)* Cómo se guarda: la fase 3 todavía no está construida, así que estos diez datos **entran directamente en su migración M-A** (`diseno-fase3.md` §10 ya los trae: `categoria`, `talla`, `impacto_mensual`, `impacto_motivo`, `no_incluye`, `preguntas`, `como_se_prueba`, `madurez`, `depende_de`, `revisado_el`). **No se usa `ALTER TABLE … ADD COLUMN`**: la regla única de las tres capas es «sin `ADD COLUMN`» (`diseno-fase2.md` §4). Si algún día M-A ya estuviera publicada sin ellos, irían en la columna de reserva `extra` o en una tabla lateral nueva, nunca con `ADD COLUMN`.

Los valores por defecto son los prudentes: una fila sin llenar es talla XL (no se cotiza sola) y «nuevo».

### 3.3 Quién lo mantiene y cómo (sin secretos en GitHub)

| Quién | Qué hace | Cómo |
|---|---|---|
| **Claude** | Propone y actualiza el catálogo: qué se puede, tiempos, costos de terceros | En una sesión de trabajo prepara un **texto de catálogo** (un archivo de datos, sin secretos). No hay un Claude dentro del servidor (fase 3, C8). |
| **Tú** | Lo recibes y lo apruebas | Pantalla `#admin/catalogo` → **«Traer catálogo»**: pegas el texto o eliges el archivo. OPORTIA muestra «3 nuevas · 2 cambian · 0 se quitan» en tarjetas, y nada entra hasta tu «Aprobar». Crea versión nueva; la anterior queda guardada. |
| **Tú** | Corriges una cosa a mano | Tocar la tarjeta → editar → versión nueva. |
| **OPORTIA** | Avisa cuando un costo está viejo | Si una cosa con costo de terceros lleva más de 90 días sin revisar, aviso `catalogo_por_revisar` y el vendedor la trata como «precio por confirmar» (da rango, no cifra fija). Meta cambia tarifas cada trimestre (INFORME, UNVERIFIED). |

Reglas:
- Una cosa nunca se borra: se marca «No se hace» o «retirada», con su historia.
- El catálogo de lo que se puede **no es secreto** (se le dice a los clientes). Los **precios, costos y márgenes sí**: viven en la base, nunca en GitHub (fase 3, D17). En el código solo va un ejemplo inventado para las pruebas.
- Capacidad de construcción (se guarda como ajuste, lo cambias tú): **1 programa en construcción a la vez y hasta 2 en espera**. La fecha que da el vendedor = próxima fecha libre + días máximos del catálogo. Motivo: la construcción depende del crédito semanal de Claude y de tu tiempo para revisar; prometer más sería prometer de más.

### 3.4 Catálogo inicial (28 cosas para pymes dominicanas)

Honestidad primero: hasta hoy Claude ha construido y probado aquí programas web con Node y SQLite, sin dependencias: cuentas y permisos, pantallas para celular y PC, tareas 24/7, avisos por Telegram, IA con tope de gasto y copias cifradas (CÓDIGO). Lo que se parece a eso va como «Se puede». Lo que depende de bancos, de la DGII, de Meta o de las tiendas de aplicaciones va «Con límites», «En revisión» o «No se hace», aunque venda menos.

Tallas: S = 1-3 días · M = 4-8 días · L = 9-15 días · XL = se estudia aparte. Impacto mensual: ninguno, bajo, medio, alto (montos en §4.2). Costos de terceros: todos UNVERIFIED salvo donde dice otra cosa.

*(rev. 1)* **Lectura corregida de la columna «Estado».** Solo cuenta como **«Se puede (probado)»** lo que ya existe y funciona en OPORTIA: el programa base (cuentas y permisos, celular y PC, copias, avisos por Telegram, tareas 24/7, IA con tope). Todo lo demás marcado «Se puede» en la tabla (citas, inventario, pedidos con QR, alquileres y el resto) **nunca se ha construido**: vale como **«Parecido»** o **«Nuevo»**, con el rango de días **el doble de ancho** (S = 1-6, M = 4-16, L = 9-30) hasta que el piloto dé tiempos reales. Reglas para el vendedor: (1) sin toque del dueño solo cotiza lo «probado»; «parecido» y «nuevo» pasan al dueño; (2) todo plazo va como rango más «estimado; se confirma en el contrato», y nunca en un mensaje automático de nivel 2 o 3 si la cosa no está probada; (3) el plazo depende del crédito semanal de Claude y del tiempo del dueño: el contrato lo dice.

| # | Cosa (nombre para el cliente) | Estado | Talla | Mensual | Costo de terceros (quién lo cobra) | Lo que NO incluye |
|---|---|---|---|---|---|---|
| 0 | **Programa base** (siempre va): cuentas y permisos, celular y PC, copias diarias, servidor propio | Se puede (probado) | base | mínimo | Servidor pequeño: incluido en la mensualidad | Aplicación en tiendas |
| 1 | Página del negocio con formulario de contacto | Se puede | S | ninguno | Dominio ~US$11 al año, a nombre del cliente (INFORME) | Tienda con pagos |
| 2 | Catálogo de productos con fotos y botón «Pedir por WhatsApp» | Se puede | M | bajo | Ninguno (usa el WhatsApp normal del negocio) | Cobro en línea |
| 3 | Citas y reservas en línea (clínicas, salones, talleres) | Se puede | M | bajo | Ninguno | Recordatorios automáticos por WhatsApp (ver 18) |
| 4 | Recordatorio de citas con un toque (abre WhatsApp con el mensaje listo) | Se puede | S | ninguno | Ninguno | Envío sin que nadie toque |
| 5 | Inventario: entradas, salidas, mínimos y alerta de «se acaba» | Se puede | L | medio | Ninguno | Lector de códigos especial; balanzas |
| 6 | Registro de ventas y cuadre de caja del día | Con límites | L | medio | Ninguno | **No emite comprobante fiscal**; imprime recibo sencillo |
| 7 | Cotizaciones y facturas en borrador para imprimir o enviar | Con límites | M | bajo | Ninguno | No es factura electrónica (ver 22) |
| 8 | Clientes y seguimiento (quién es, qué compró, a quién llamar hoy) | Se puede | M | bajo | Ninguno | Envíos masivos |
| 9 | Fiado y cuentas por cobrar, con recordatorios | Se puede | M | bajo | Ninguno | Cobro automático |
| 10 | Panel con los números del negocio (ventas, citas, inventario) | Se puede | S | ninguno | Ninguno | Contabilidad formal |
| 11 | Empleados con permisos distintos (cajero, encargado, dueño) | Se puede (probado) | S | por usuarios | Ninguno | — |
| 12 | Pedidos desde un menú con código QR (restaurantes, colmados) | Se puede | L | medio | Ninguno | Pago con tarjeta; repartidores con mapa en vivo |
| 13 | Órdenes de trabajo para talleres y servicios técnicos, con fotos | Se puede | M | medio (fotos) | Ninguno | — |
| 14 | Asistencia y turnos de empleados | Con límites | M | bajo | Ninguno | Nómina, TSS e impuestos |
| 15 | Avisos al dueño por Telegram (venta grande, se acaba algo, cita nueva) | Se puede (probado) | S | ninguno | Gratis | Avisos a los clientes del negocio |
| 16 | Asistente con IA que responde preguntas en la página | Con límites | L | medio | IA por uso: Claude Haiku 5.5 US$0.10 y US$0.50 por millón de «tokens», que son trozos de palabra (VERIFIED) → centavos al mes, con tope | Puede equivocarse; no cierra ventas ni cobra |
| 17 | Resumen semanal del negocio escrito por IA | Se puede (probado) | S | bajo | IA: centavos al mes, con tope | — |
| 18 | WhatsApp oficial: responder y recordar automático | **En revisión** | L | alto | Meta cobra por mensaje (~US$0.011 aviso, ~US$0.074 promoción en RD, INFORME, UNVERIFIED); pide verificar el negocio y un número aparte | Escribir en frío; aún no construido aquí |
| 19 | Correos desde el programa (confirmaciones, recibos) | Con límites | M | bajo | Proveedor de correo: hay planes gratis de ~300 al día (INFORME) o buzón de ~US$7 al mes (UNVERIFIED) | Publicidad a quien no la pidió (Ley 310-14) |
| 20 | Traer datos desde Excel y sacar listas a Excel | Se puede | S | ninguno | Ninguno | Formatos con macros |
| 21 | Pago por transferencia con foto del comprobante que el negocio aprueba | Se puede | S | bajo (fotos) | Ninguno | — |
| 22 | Cobro con tarjeta (AZUL, CardNET) | **En revisión** | XL | alto | El banco cobra comisión (3-5 % estimado, INFORME, UNVERIFIED) y pide contrato del cliente con el banco | — |
| 23 | Factura electrónica (e-CF) conectada con la DGII | **En revisión** | XL | alto | Certificado y proceso de la DGII | Mientras: el cliente la emite en el Facturador Gratuito de la DGII (UNVERIFIED) |
| 24 | Socios y mensualidades (gimnasios, academias, colegios pequeños) | Se puede | M | bajo | Ninguno | Cobro automático |
| 25 | Alquileres con calendario (casas, vehículos, equipos) | Se puede | M | bajo | Ninguno | Pago en línea |
| 26 | Varias sucursales en un mismo programa | Con límites | L | medio | Quizá servidor mediano | Trabajar sin internet |
| 27 | Pasar los datos del sistema viejo | Con límites | M | ninguno | Ninguno | Solo si el sistema viejo deja sacar sus datos |
| 28 | Expedientes con datos delicados (salud, menores) | **En revisión** | L | medio | — | Pasa a ti siempre: Ley 172-13, ver con abogado |
| — | Aplicación en App Store / Google Play | **No se hace** | — | — | — | Alternativa incluida: icono en la pantalla de inicio del teléfono |
| — | Programa que funciona sin internet | **No se hace** | — | — | — | Alternativa: funciona con datos del celular |

Cada fila lleva además sus 1 a 3 preguntas de alcance y su «cómo se prueba» (se escriben al llenar el catálogo en la parte 3.1; ejemplo para `citas`: «¿Cuántas personas atienden?», «¿Cuánto dura una cita?»; prueba: «reservar, cambiar y cancelar desde un celular; dos personas no pueden tomar la misma hora»).

### 3.5 El catálogo aprende de lo que piden

Cada vez que un cliente pide algo que no está o está «en revisión», OPORTIA lo anota (el `no_se[]` que ya devuelve el redactor de la fase 3). Pantalla «Lo que piden y no tenemos»: una tarjeta por tema con cuántas veces y de qué sectores. Botón **«Copiar para Claude»**: en la siguiente sesión, Claude dice si se puede, cuánto tarda y qué cuesta, y devuelve el texto de catálogo actualizado. Es la primera pieza real de la función 4 de tu visión («No sé qué vender»), sin adelantarla.

---

## 4. La tabla de precios

### 4.1 Reglas

- Vive en `vendedor_paquetes.precios` (fase 3): por proyecto, con versión, **sin usar hasta que la apruebes**. El vendedor solo cotiza con la versión aprobada.
- Dinero en centavos enteros, en **pesos**. El dólar es solo referencia: el Facturador Gratuito de la DGII, según el informe, solo trabaja en pesos (UNVERIFIED).
- Tasa del dólar: un ajuste que tú escribes («1 US$ = RD$ …»). Aquí se usa **RD$60** como supuesto (UNVERIFIED: no se pudo abrir el Banco Central). Cada cotización guarda la tasa del día en que se hizo.
- ITBIS aparte («más ITBIS»), hasta que el contador confirme (18 % general, UNVERIFIED).
- Pocos números: 1 base + 3 tallas + 1 mínimo + 4 impactos + 3 tramos. Así la puedes revisar entera en un minuto.

### 4.2 Propuesta inicial (PROPUESTA: validar con 3 cotizaciones de agencias locales y con el primer cliente piloto)

**A. Instalación (un solo pago: 50 % al firmar, 50 % al entregar)**

| Pieza | RD$ | US$ (a 60) |
|---|---|---|
| Programa base (siempre) | 12,000 | 200 |
| Cada cosa talla S | 3,000 | 50 |
| Cada cosa talla M | 9,000 | 150 |
| Cada cosa talla L | 21,000 | 350 |
| Talla XL o «en revisión» | no se cotiza sola: pasa a ti | — |
| Hora extra de trabajo (cambios fuera del contrato) | 1,800 | 30 |

**B. Mensualidad (por contrato; se paga por adelantado)**

| Pieza | RD$ al mes | US$ |
|---|---|---|
| **Mínimo mensual**: servidor propio pequeño, copias diarias, vigilancia, arreglo de errores, mejoras de seguridad, 1 cambio pequeño al mes, respuesta en 2 días hábiles | 2,400 | 40 |
| Impacto bajo, por cada cosa | + 300 | 5 |
| Impacto medio, por cada cosa | + 900 | 15 |
| Impacto alto, por cada cosa | + 1,800 | 30 |
| Atención el mismo día hábil | + 1,800 | 30 |
| 3 cambios pequeños más al mes | + 1,800 | 30 |

**C. Consumo (por tramos; sube o baja el mes siguiente, con aviso)**

| Qué se mide | Incluido | Tramo 2 | Tramo 3 | Más |
|---|---|---|---|---|
| Personas que usan el programa | hasta 3 | 4 a 10: + RD$900 (US$15) | 11 a 25: + RD$2,400 (US$40) | pasa a ti |
| Espacio para fotos y archivos | hasta 2 GB | hasta 10 GB: + RD$600 (US$10) | hasta 25 GB: + RD$1,500 (US$25) | pasa a ti |
| Tamaño del servidor | pequeño | mediano: + RD$900 (US$15) | grande: + RD$2,400 (US$40) | pasa a ti |

Por qué tramos y no «por cada unidad»: son fáciles de explicar a alguien no técnico, la factura no cambia todos los meses por centavos, y tú los confirmas con un toque (§6.1).

**D. Costos de terceros (WhatsApp de Meta, IA, correo, dominio)**

| Modo | Cómo | Recargo | Cuándo |
|---|---|---|---|
| **1. A nombre del cliente (recomendado)** | La cuenta (dominio, Meta, correo) es del cliente y él le paga directo al tercero. Tú solo la configuras. | Ninguno | Siempre que el tercero lo permita. Evita que financies gastos ajenos y deja claro de quién es cada cosa. |
| 2. Lo pagas tú y lo trasladas | Se cobra a mes vencido, con detalle, y con **tope mensual escrito en el contrato**. | Costo + 20 % (WhatsApp, correo) · costo + 30 % (IA) (INFORME) | Solo para la IA de uso pequeño, o si el cliente no puede abrir la cuenta. |

Nunca se cobra un tercero sin tope pactado. Al llegar al 80 % del tope, aviso; al 100 %, esa función se pausa hasta el mes siguiente o hasta que el cliente suba el tope por escrito.

**E. Descuentos (techos)**

| Quién | Qué puede dar | Techo |
|---|---|---|
| El vendedor (IA) | Solo «pago anual por adelantado» | **0 % por defecto**; recomendado 10 % (fase 3, D9). Más que eso → pasa a ti. |
| Tú, a mano | Clientes piloto (los 3 primeros) | Hasta 30 % de la instalación, a cambio de permiso para mostrar su caso. Nunca sobre la mensualidad. |
| Nadie | Descuento sobre costos de terceros | 0 % siempre. |
| **Piso** | La mensualidad con descuento nunca baja de RD$1,800 (US$30), ni de 3 veces lo que te cuesta ese cliente | Lo aplica el cotizador: bajo el piso → `no_confirmado` y pasa a ti. |

**F. Otros**

| Concepto | Propuesta |
|---|---|
| Permanencia mínima | 6 meses; después, salida con aviso de 30 días |
| Volver a activar tras una suspensión | RD$1,200 (US$20) |
| Validez de una cotización | 15 días (fase 3) |
| Cambio de tarifas | Aviso de 30 días; nunca dentro de la permanencia mínima |
| Garantía de la entrega | 30 días de arreglos sin contar como «cambios» |

### 4.3 La fórmula (para `cotizar()` de la fase 3; sin IA)

```
Instalación = base + suma(talla de cada cosa elegida)
Mensualidad = mínimo + suma(impacto de cada cosa) + tramo de personas + tramo de espacio + tramo de servidor + extras
Terceros    = rango mínimo-máximo estimado, con su tope (no entra en la mensualidad fija)
Descuento   = solo si está permitido y sin pasar el techo ni el piso
```

Si alguna cosa es XL, «en revisión», «no se hace», falta una respuesta de alcance o su costo de terceros está vencido → no hay cifra firme: «déjeme confirmarlo».

Tres ejemplos con la propuesta (sin ITBIS):

| Caso | Cosas | Instalación | Mensualidad |
|---|---|---|---|
| Salón de belleza | base + página (S) + citas (M) + recordatorio con un toque (S) | RD$27,000 (US$450) | RD$2,700 (US$45) |
| Ferretería pequeña, 3 personas | base + inventario (L) + ventas y caja (L) + panel (S) + avisos por Telegram (S) | RD$60,000 (US$1,000) | RD$4,200 (US$70) |
| Clínica, 8 personas | base + citas (M) + clientes (M) + correos (M) + asistente con IA (L) + permisos (S) | RD$63,000 (US$1,050) | RD$5,100 (US$85) + IA con tope de RD$600 |

Comparación: el informe de precios encontró programas de WhatsApp y de clientes entre US$40 y US$150 al mes, y webs a medida «desde miles de dólares» (INFORME, UNVERIFIED). La propuesta queda en la parte baja: sirve para entrar; se sube con los primeros resultados.

### 4.4 Lo que te cuesta a ti cada cliente (va solo en la nota interna; nunca a la IA ni a GitHub)

| Gasto | Estimado al mes | Estado |
|---|---|---|
| Servidor pequeño del cliente | US$4 a US$6 | UNVERIFIED (`www.digitalocean.com` no abrió; INFORME) |
| Copias del servidor | ~US$1 | UNVERIFIED |
| IA de mantenimiento | Tu plan de Claude, no por cliente | Depende de tu crédito semanal |
| Tu tiempo | 1 a 2 horas al mes por cliente sano | PROPUESTA |

Con el mínimo de RD$2,400 (US$40), el gasto directo ronda US$7: queda margen para tu tiempo y para los meses malos. El cuello de botella no es el dinero: es **cuántos programas se pueden construir y cuidar a la vez** (§3.3).

---

## 5. De la cotización a la firma

### 5.1 El camino

```
Cotización (vendedor, con tu tabla) ─► «Quiero contratar» ─► PASA A TI (siempre)
        │
        ▼
Tú tocas «Preparar contrato» ─► se crea el CLIENTE como «prospecto» ─► formulario corto «Datos para el contrato»
        │
        ▼
Borrador = plantilla aprobada + datos del cliente + cotización + Anexo 1 (alcance) + Anexo 2 (precios y consumo)
        │
        ▼
Lo lees, cambias lo que haga falta, «Aprobar» ─► lo envías tú (o el canal, con tu toque)
        │
        ▼
Firma FUERA de OPORTIA (papel o como diga el abogado) ─► tocas «Firmado» y pones la fecha
        │
        ▼
De una vez: el cliente pasa a «activo» + Venta + Cobros + Encargo para Claude (borrador)
```

### 5.2 Reglas

| Regla | Cómo se cumple |
|---|---|
| El vendedor nunca cierra, firma ni cobra | Ya es regla dura de la fase 3 (R5). «Quiero contratar» siempre pasa a ti. |
| Sin abogado no hay contrato | El botón «Preparar contrato» existe, pero mientras la plantilla no esté marcada «revisada por abogado» muestra por qué no y ofrece lo que sí se puede: **«Resumen de la propuesta»** (la cotización con el alcance, sin firmas y con la frase «no es un contrato»). No es un botón muerto. |
| El contrato dice exactamente lo cotizado | El borrador se arma con código a partir de la cotización guardada (misma huella). La IA no escribe cifras ni cláusulas. |
| Cambiar algo exige volver a aprobar | El contrato guarda la huella del texto; si cambia una letra, vuelve a «por aprobar». |
| Cláusulas especiales | Caja de texto aparte, marcada «Especial: revisar con el abogado». Nunca las propone el vendedor. |
| Dónde queda el papel firmado | Por defecto OPORTIA guarda solo la fecha, la huella del texto y una nota de dónde lo tienes. No guarda el PDF (disco pequeño y copias por Telegram). Decisión DN11. |

### 5.3 Qué lleva la plantilla (para el abogado; nada de esto es consejo legal)

Partes y representante · objeto · **Anexo 1: alcance** (cada cosa del catálogo con su explicación, su «no incluye» y su «cómo se prueba») · **Anexo 2: precios** (instalación, mensualidad, tramos, terceros con tope, cómo y cuándo cambia) · plazos y entrega (la entrega se acepta con la lista de pruebas) · nivel de servicio realista (un servidor sin repuesto: meta 99 % al mes, sin 24/7 garantizado; copias diarias) · soporte (horario, tiempos, cambios incluidos) · datos (son del cliente; se le entregan cuando los pida y al terminar; Ley 172-13) · propiedad (el programa base es tuyo; el cliente tiene licencia mientras paga) · mora (gracia, avisos, suspensión sin borrar) · permanencia y salida · límite de responsabilidad · IA (puede equivocarse; el cliente revisa) · ley y tribunales de RD · firmas. Fuente de la lista: INFORME de precios §3 e INFORME de leyes (Ley 358-05: lenguaje claro y fórmula con tope para la cuota variable; Ley 126-02 sobre firma digital; todo UNVERIFIED).

El contrato se muestra como una página lista para imprimir o guardar como PDF desde el navegador. No hace falta instalar nada.

### 5.4 Tablas (migración N-A «negocio_contratos»)

La fase 3 usa una migración por parte publicable y su parte 3.8 ya tiene la M-E (aprender). Por eso el contrato sale como **parte propia, «3.8b Contrato y cliente»**, con su migración N-A: se puede publicar o devolver sola.

Mismas costumbres que el resto: solo agrega, sin `CHECK`, sin reglas únicas de negocio, dinero en `_centavos`, fechas en texto ISO, estados revisados en el código. El número de migración se pone al publicar.

```sql
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  numero INTEGER NOT NULL,
  empresa_id INTEGER,
  nombre TEXT NOT NULL,
  razon_social TEXT NOT NULL DEFAULT '',
  rnc TEXT NOT NULL DEFAULT '',
  representante TEXT NOT NULL DEFAULT '',
  domicilio TEXT NOT NULL DEFAULT '',
  correo_cobros TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'prospecto',
  nota TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clientes_espacio ON clientes(espacio_id, estado);
CREATE TABLE IF NOT EXISTS contrato_plantillas (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  numero INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador',
  texto TEXT NOT NULL,
  revisada_por_abogado INTEGER NOT NULL DEFAULT 0,
  revisada_nota TEXT,
  huella TEXT NOT NULL DEFAULT '',
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  decidida_en TEXT
);
CREATE TABLE IF NOT EXISTS contratos (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  proyecto_id INTEGER REFERENCES proyectos(id),
  cotizacion_id INTEGER,
  venta_id INTEGER,
  plantilla_numero INTEGER NOT NULL,
  numero INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador',
  datos TEXT NOT NULL DEFAULT '{}',
  clausulas_especiales TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL DEFAULT '',
  huella TEXT NOT NULL DEFAULT '',
  moneda TEXT NOT NULL DEFAULT 'DOP',
  instalacion_centavos INTEGER NOT NULL DEFAULT 0,
  mensualidad_centavos INTEGER NOT NULL DEFAULT 0,
  tope_terceros_centavos INTEGER NOT NULL DEFAULT 0,
  dia_de_cobro INTEGER NOT NULL DEFAULT 5,
  permanencia_meses INTEGER NOT NULL DEFAULT 6,
  firmado_el TEXT,
  empieza_el TEXT,
  termina_el TEXT,
  donde_esta_el_original TEXT,
  aprobado_por INTEGER REFERENCES usuarios(id),
  aprobado_en TEXT,
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contratos_cliente ON contratos(cliente_id, estado);
```

Notas (fuera del SQL): `clientes.empresa_id`, `contratos.cotizacion_id` y `contratos.venta_id` apuntan a tablas de las fases 2 y 3 y ganan su `REFERENCES` al construir si los nombres quedaron iguales. Estados del contrato: borrador, por_aprobar, aprobado, enviado, firmado, terminado, anulado. Estados del cliente: prospecto (se creó al preparar el contrato), activo, suspendido, terminado. Camino corto **«Registrar cliente»** (a mano, sin contrato de OPORTIA): para un piloto o un contrato hecho por fuera; crea el cliente «activo» y su venta, y con eso ya tiene cobros, soporte y encargos. Un contrato firmado nunca se edita: un cambio es un contrato nuevo («anexo») enlazado al mismo cliente. `clientes` guarda datos del NEGOCIO y de su representante para el contrato (base legal: el propio contrato); nada de datos personales de sus empleados.

---

## 6. Después de la venta

### 6.1 Cobros de cada mes

Qué pasa solo (tarea diaria `negocio.revisar`, 8:10 a. m. hora de RD, un paso, sin red, sin IA):

| Cuándo | Qué hace OPORTIA | Qué haces tú |
|---|---|---|
| Al firmar | Crea el cobro «Instalación 1 de 2» | «Pagado» cuando llegue la transferencia |
| Al marcar «Entregado» el encargo | Crea «Instalación 2 de 2» y fija el primer mes | — |
| 5 días antes del día de cobro | Prepara el cobro del mes y te pregunta: **«¿El consumo sigue igual?»** (tramos del mes pasado ya marcados) | Un toque: «Igual» o cambiar un tramo. Si no contestas en 2 días, usa lo del mes pasado: **nunca sube sola**. |
| 3 días antes | Deja listo el **aviso de cobro** (borrador para el cliente) y los **datos para la factura** | «Aprobar» → lo envías tú o el canal con tu toque; emites la factura en tu facturador y anotas su número |
| Cuando paga | — | «Pagado» + fecha (y, si quieres, una nota del comprobante) |

El aviso de cobro sale de una plantilla con código (cliente, mes, monto, cuenta, fecha límite). Con IA encendida solo se suaviza el saludo; las cifras nunca pasan por la IA (misma regla R3 de la fase 3).

Subir un tramo: si al confirmar cambias un tramo hacia arriba, el nuevo precio vale desde el mes siguiente y OPORTIA prepara el aviso al cliente con 30 días (como dice el contrato). Bajar un tramo vale de una vez.

### 6.2 Atrasos (mora)

| Día (desde la fecha límite) | Estado | Qué prepara OPORTIA | Decide |
|---|---|---|---|
| +1 | Atrasado | Nada al cliente; aparece en tu resumen | — |
| +3 | Atrasado | Recordatorio amable (borrador) | Tú apruebas |
| +10 (fin de la gracia) | En mora | Segundo aviso, con la fecha de posible suspensión | Tú apruebas |
| +15 | En mora | **Propuesta de suspensión** para ti, con botones: «Dar más plazo» · «Acordar pagos» · «Suspender» | Solo tú |
| Suspendido | Suspendido | Anota la fecha; el cobro de reactivación; la suspensión real se hace a mano en el servidor del cliente (Fábrica) | Tú o Claude |
| +60 | Suspendido | Propuesta de terminar el contrato y ofrecer al cliente sus datos | Solo tú |

Reglas: nunca se suspende sola; nunca se borran datos; un cliente suspendido que paga vuelve con un toque; el interés por mora no se calcula hasta que el abogado diga cuánto y cómo (hoy 0). Si el cliente pide que se eliminen sus datos al terminar, es una decisión aparte (conflicto N8).

### 6.3 Soporte: cómo entran los pedidos (sin abrir puertas nuevas)

| Entrada | Desde cuándo | Cómo |
|---|---|---|
| **Tú lo anotas con toques** | Primera versión | Botón «+ Pedido» en la ficha del cliente: tipo (Error · Duda · Cambio pequeño · Cambio grande · Cobro), urgencia, y pegas lo que te escribieron por WhatsApp o correo. 20 segundos. |
| El cliente responde un correo | Con la parte 3.4 de la fase 3 (solo tu cuenta) | El clasificador gana una intención nueva, `soporte`: siempre pasa a ti y abre el pedido. El vendedor nunca promete un arreglo ni una fecha. |
| Botón «Ayuda» dentro del programa del cliente | Fábrica | El programa manda el pedido a tu Telegram con su propio bot. No toca el servidor de OPORTIA. |

Qué hace OPORTIA con cada pedido:

| Tipo | Regla (código, no IA) |
|---|---|
| Error | Siempre incluido. Se convierte en encargo de «arreglo» con un toque. |
| Duda | Te sugiere la respuesta si está en las preguntas frecuentes; si la respondes, la puedes guardar. |
| Cambio pequeño | Cuenta contra los incluidos del mes («1 de 1 usados»). Si se pasan → cotización de extra. |
| Cambio grande | Va al catálogo: cotización nueva y anexo al contrato. |
| Cobro | Abre la ficha de cobros del cliente. |

Reloj de respuesta: cada pedido muestra «responder antes de …» según su contrato (2 días hábiles o mismo día). Si queda menos de medio día, entra en tu resumen como urgente.

### 6.4 Factura: OPORTIA prepara, tú emites

OPORTIA no emite comprobantes fiscales. Prepara una tarjeta «Datos para la factura» (cliente, RNC, concepto, monto, ITBIS aparte) para copiarla en tu facturador, y guarda el número que tú escribas. Datos del informe y de la búsqueda de hoy, todos UNVERIFIED (blogs; `dgii.gov.do` no abrió): el plazo de factura electrónica para micro y pequeñas empresas vence el **15 de noviembre de 2026** y habría sido anunciado como final; el Facturador Gratuito de la DGII permite unas 150 facturas al mes y solo en pesos. **Faltan 5 días: es lo primero que debes ver con un contador si vas a facturar.**

### 6.5 Un solo mensaje al día

A la hora que elijas, un resumen por Telegram (dentro del resumen diario que ya trae la parte 3.2 de la fase 3, con su propio cupo, para no gastar el de los avisos graves):

```
Negocio hoy
 • 2 cobros para aprobar (RD$7,200)
 • 1 atrasado: Salón Lili, 4 días
 • 1 pedido de soporte urgente
 • Encargo «Ferretería Paco»: esperando tu revisión
 → Abrir Negocio
```

Nombres de negocios sí; montos totales sí; nunca textos de conversaciones ni datos personales (misma regla D13 de la fase 3). Si no hay nada, no hay mensaje.

Avisos nuevos en la pantalla de Administrador (una clave por tema; el detalle dice cuántos): `negocio_cobros_atrasados`, `negocio_soporte_urgente`, `negocio_encargo_detenido`, `negocio_contrato_por_vencer`, `catalogo_por_revisar`. Se cierran solos cuando el número vuelve a cero.

### 6.6 De la venta al encargo para Claude

El «encargo» es un texto que OPORTIA arma solo y que tú le pasas a Claude. Es la pieza que une las dos líneas.

| Sección del encargo | De dónde sale |
|---|---|
| 1. Resumen en 5 líneas | Código: cliente, sector, qué se vendió, fecha prometida |
| 2. El cliente | Ficha de la empresa (fase 2): sector, tamaño, zona; cómo habla (formal o cercano) |
| 3. Alcance | Las cosas del catálogo **con su versión**, y las respuestas a las preguntas de alcance |
| 4. Lo que NO incluye | Los «no incluye» del catálogo + lo que el cliente pidió y se le dijo que no |
| 5. Personas y permisos | Cuántas, qué puede hacer cada una |
| 6. Terceros | Qué cuentas hacen falta, a nombre de quién, con qué tope |
| 7. Límites de consumo | Tramos contratados: el programa debe respetarlos y avisar |
| 8. Lista de aceptación | Los «cómo se prueba» de cada cosa: es lo que el cliente revisará |
| 9. Fechas | Firma, entrega prometida, garantía |
| 10. Dudas abiertas | Lo que quedó sin responder; Claude pregunta antes de construir |

Lo que el encargo **nunca** lleva: claves, contraseñas, precios internos, márgenes, ni datos personales más allá del nombre del negocio y su representante.

Cómo viaja:

| Paso | Hoy (recomendado) | Más adelante |
|---|---|---|
| OPORTIA → Claude | Botón **«Copiar encargo»**; lo pegas en una sesión nueva de Claude | Cuando actives la revisión diaria que dejaste anotada (`CONTINUAR.md`), esa misma sesión lee «encargos listos» por el enlace solo de administrador. Sin puertas nuevas. |
| Claude → OPORTIA | Claude te da un **informe de entrega** corto; lo pegas en el encargo y tocas el estado | Igual |

Estados del encargo: borrador → listo (lo aprobaste) → en construcción → en prueba (el cliente revisa con la lista de aceptación) → entregado → en garantía → cerrado. Si pasa 5 días sin moverse: aviso `negocio_encargo_detenido`. Tipos: programa nuevo, cambio, arreglo.

### 6.7 Tablas (migración N-B «negocio_posventa»)

```sql
CREATE TABLE IF NOT EXISTS cobros (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  contrato_id INTEGER REFERENCES contratos(id),
  linea TEXT NOT NULL DEFAULT 'programa_cliente',
  tipo TEXT NOT NULL,
  periodo TEXT,
  concepto TEXT NOT NULL DEFAULT '',
  moneda TEXT NOT NULL DEFAULT 'DOP',
  monto_centavos INTEGER NOT NULL DEFAULT 0,
  terceros_centavos INTEGER NOT NULL DEFAULT 0,
  itbis_centavos INTEGER NOT NULL DEFAULT 0,
  detalle TEXT NOT NULL DEFAULT '{}',
  vence_el TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'por_confirmar',
  pagado_el TEXT,
  pago_nota TEXT,
  factura_numero TEXT,
  plazo_hasta TEXT,
  clave_periodo TEXT NOT NULL DEFAULT '',
  creado_en TEXT NOT NULL,
  cambiado_por INTEGER REFERENCES usuarios(id),
  cambiado_en TEXT
);
CREATE INDEX IF NOT EXISTS cobros_estado ON cobros(espacio_id, estado, vence_el);
CREATE INDEX IF NOT EXISTS cobros_periodo ON cobros(contrato_id, clave_periodo);
CREATE TABLE IF NOT EXISTS cobro_eventos (
  id INTEGER PRIMARY KEY,
  cobro_id INTEGER NOT NULL REFERENCES cobros(id),
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  detalle TEXT,
  usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS cobro_eventos_cobro ON cobro_eventos(cobro_id, id);
CREATE TABLE IF NOT EXISTS consumo_mensual (
  id INTEGER PRIMARY KEY,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id),
  mes TEXT NOT NULL,
  tramo_personas INTEGER NOT NULL DEFAULT 1,
  tramo_espacio INTEGER NOT NULL DEFAULT 1,
  tramo_servidor INTEGER NOT NULL DEFAULT 1,
  terceros_centavos INTEGER NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'igual_al_anterior',
  confirmado_por INTEGER REFERENCES usuarios(id),
  confirmado_en TEXT
);
CREATE INDEX IF NOT EXISTS consumo_mensual_contrato ON consumo_mensual(contrato_id, mes);
CREATE TABLE IF NOT EXISTS soporte_pedidos (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  numero INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'duda',
  urgencia TEXT NOT NULL DEFAULT 'normal',
  origen TEXT NOT NULL DEFAULT 'a_mano',
  texto TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'nuevo',
  responder_antes_de TEXT,
  respondido_en TEXT,
  resuelto_en TEXT,
  cuenta_como_cambio INTEGER NOT NULL DEFAULT 0,
  encargo_id INTEGER,
  conversacion_id INTEGER,
  nota TEXT,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS soporte_pedidos_estado ON soporte_pedidos(espacio_id, estado, responder_antes_de);
CREATE TABLE IF NOT EXISTS encargos (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  contrato_id INTEGER REFERENCES contratos(id),
  numero INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nuevo',
  estado TEXT NOT NULL DEFAULT 'borrador',
  texto TEXT NOT NULL DEFAULT '',
  huella TEXT NOT NULL DEFAULT '',
  catalogo_version INTEGER NOT NULL DEFAULT 0,
  entrega_prometida TEXT,
  informe_entrega TEXT,
  aprobado_por INTEGER REFERENCES usuarios(id),
  aprobado_en TEXT,
  entregado_en TEXT,
  creado_en TEXT NOT NULL,
  movido_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS encargos_estado ON encargos(espacio_id, estado, movido_en);
```

Y una tabla suelta para «Lo que piden y no tenemos» (§3.5), que sale antes, con la parte 3.2 de la fase 3: va dentro de la migración M-B de esa fase si aún no se publicó, o como migración propia N-C:

```sql
CREATE TABLE IF NOT EXISTS pedidos_fuera_de_catalogo (
  id INTEGER PRIMARY KEY,
  espacio_id INTEGER NOT NULL REFERENCES espacios(id),
  tema TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT '',
  veces INTEGER NOT NULL DEFAULT 1,
  ejemplo TEXT,
  estado TEXT NOT NULL DEFAULT 'abierto',
  primera_vez TEXT NOT NULL,
  ultima_vez TEXT NOT NULL
);
```

Notas (fuera del SQL):
- `cobros.tipo`: instalacion_1, instalacion_2, mensualidad, terceros, extra, reactivacion. `estado`: por_confirmar, por_avisar, avisado, pagado, atrasado, en_mora, con_plazo, anulado (un cobro nunca se borra: se anula con su motivo en `cobro_eventos`).
- **Sin duplicados sin `UNIQUE`:** `clave_periodo` = contrato + tipo + mes. La tarea diaria busca esa clave dentro de la misma escritura antes de crear; repetir la tarea no crea dos cobros del mismo mes. Por eso el tipo de tarea es `repetible: true` (no envía nada a nadie; solo prepara).
- `cobros.linea` separa «programa_cliente» de un futuro «plan_oportia» (función 55, fase 6): mismas piezas, listas y sumas aparte (§8).
- `cobro_eventos.tipo`: creado, consumo_confirmado, aviso_preparado, aviso_aprobado, aviso_enviado, pagado, plazo, suspension_propuesta, suspendido, reactivado, anulado. De aquí sale el historial del cliente.
- Enviar un aviso al cliente por el servidor usa las tablas `mensajes` y `salidas` de la fase 3 con dos clases nuevas, `cobro_aviso` y `soporte_respuesta`, **siempre con tu toque, en cualquier nivel de libertad** (nunca entran en los permisos de los niveles 2 a 4). Mientras la fase 3 no tenga envío, el botón es «Copiar» y «Ya lo envié».

### 6.8 Tarea y permisos

| Pieza | Diseño |
|---|---|
| Tipo de tarea | `negocio.revisar`: `fase` = la de su parte, cupo `normal`, `maxFallos: 2`, `tiempoPorPasoMs: 30_000`, `repetible: true`, `prioridad: 6`. Programa diario 8:10 (hora de RD) en `PROGRAMAS_DEL_SISTEMA`. |
| Qué hace | Crea cobros del mes, mueve estados por fecha, prepara borradores, cuenta lo atrasado, abre o cierra los 5 avisos, arma el bloque «Negocio hoy». |
| Quién ve «Negocio» | Solo el dueño del espacio y el administrador. Editores y lectores de un proyecto no ven cobros ni contratos. |
| Rutas | `src/api/negocio.js`: `GET /api/negocio/resumen`, `GET/POST /api/negocio/clientes`, `GET/POST /api/negocio/cobros/:id/(confirmar|pagado|plazo|anular)`, `GET/POST /api/negocio/soporte`, `GET/POST /api/negocio/encargos/:id/(aprobar|estado|informe)`, `POST /api/negocio/contratos/:id/(preparar|aprobar|firmado)`. Todas con sesión, permiso del espacio y registro en `auditoria`. |
| Sin IA | Todo funciona con plantillas. La IA solo es un adorno opcional del saludo, dentro del tope del proyecto. |

---

## 7. Pantallas (celular primero, sin bajar; PC con columnas)

*(rev. 1)* El menú es uno solo para las tres capas (`diseno-fase2.md` §8.6): en el celular, «Negocio» vive dentro de «Más»; en PC, en el menú del costado. «Clientes» significa aquí **solo quien ya contrató**; las empresas a las que se quiere vender se llaman «empresas». Entrada: **Negocio** (`#negocio`), visible solo cuando existe al menos un cliente (aunque sea prospecto); antes, una tarjeta en «El vendedor» explica qué aparecerá y cuándo.

| Pantalla | Celular (lo que se ve sin bajar) | PC |
|---|---|---|
| `#negocio` | 4 fichas grandes: **Por cobrar este mes · Atrasados · Soporte abierto · Encargos**. Debajo, «Qué toca hoy» (máximo 5 tarjetas con un botón cada una). | Fichas arriba; «Qué toca hoy» a la izquierda y calendario de cobros del mes a la derecha |
| `#negocio/clientes` | Tarjetas: logo (fase 2), nombre, semáforo de pago (verde, amarillo, rojo), mensualidad, próximo cobro | Rejilla de 3 columnas |
| `#negocio/cliente/N` | Pestañas: Resumen · Cobros · Soporte · Contrato · Encargos | Dos columnas: resumen fijo y pestaña |
| Tarjeta de cobro | Monto grande, fecha, estado en color. Botones: **Pagado** · **Aprobar aviso** · **Dar plazo**. Plegado: «Cómo salió el monto», línea por línea | Igual, en panel lateral |
| «¿El consumo sigue igual?» | Tres filas con botones de tramo ya marcados; **«Igual que el mes pasado»** en grande | Igual |
| Encargo | Barra de pasos con iconos; **Copiar encargo**; caja para pegar el informe de entrega | Texto del encargo a la izquierda, pasos a la derecha |
| `#admin/catalogo` (fase 3, ampliada) | Tarjetas por categoría con color de estado, talla y «+ RD$ al mes»; **Traer catálogo**; «Lo que piden y no tenemos» | Tabla con filtros |
| Precios (pestaña de la fase 3) | Una tarjeta por bloque (Instalación · Mensualidad · Consumo · Terceros · Descuentos) y **Probar una cotización** | Dos columnas: tabla y simulador en vivo |

Sin botones muertos: lo que dependa del abogado, del contador o de la Fábrica dice por qué no está y qué sí se puede hacer hoy. Ayuda: palabras nuevas con ejemplo (catálogo, talla, instalación, mensualidad, tramo, tercero, tope, mora, suspensión, encargo, lista de aceptación).

---

## 8. Fases: dónde entra cada cosa

### 8.1 Lo que es de OPORTIA (se suma a fases ya aprobadas)

| Parte | Qué trae | Va con | Migración | Necesita de ti |
|---|---|---|---|---|
| N1 Catálogo y precios completos | Columnas nuevas, «Traer catálogo», tallas, tramos, piso y techo en el cotizador | Parte 3.1 de la fase 3 | Dentro de M-A (rev. 1: fijado; sin `ADD COLUMN`) | Aprobar catálogo y tabla |
| N2 Lo que piden y no tenemos | Lista y «Copiar para Claude» | Parte 3.2 | Dentro de M-B de la fase 3, o N-C propia | — |
| N3 Contrato y cliente | Plantilla, borrador, «Firmado», cliente y venta; «Registrar cliente» a mano | Parte nueva **3.8b**, después de la 3.8 | N-A | **Abogado** (solo para el contrato; «Registrar cliente» no lo necesita) |
| N4 Cobros, mora, soporte y encargos | §6 entera | Parte nueva **3.12 «Después de la venta»** | N-B | **Contador** (factura); decidir día de cobro y cuenta bancaria que se muestra |

Cuándo construir N4: cuando haya un primer contrato en conversación, no antes. Es pequeña (una migración, una tarea, sin red). Hasta entonces no hace falta nada.

*(rev. 1)* **Lo que la fase 3 ya recogió de N16** (`diseno-fase3.md` §15.3): «Firmado» crea la venta; intención `soporte`; clases `cobro_aviso` y `soporte_respuesta` siempre con toque; «Negocio hoy» dentro del único mensaje diario; `no_se[]` alimenta «Lo que piden y no tenemos»; parte 3.8b. Los avisos de negocio usan el grupo `negocio` del avisador (cambio explícito en `src/canales/avisador.js`, con prueba de que los avisos graves nunca se ven afectados).

### 8.2 Lo que NO tiene fase aprobada: «la Fábrica» (decisión tuya, DN1)

Tu plan aprobado (fases 0 a 6, 60 funciones) describe OPORTIA: encontrar oportunidades, contactar, empleo, planes de OPORTIA. **No dice en ningún lado que se construyan, alojen y cuiden programas para otros negocios.** Tu nota del 10 nov sí lo dice. Es una línea de producto nueva, con sus propias preguntas:

| Pregunta de la Fábrica | Opción prudente |
|---|---|
| ¿Dónde vive el programa de cada cliente? | Un servidor pequeño por cliente (aislado, con sus copias). Nunca en el servidor de OPORTIA. |
| ¿De quién es la cuenta del servidor? | Tuya (para poder cuidarlo); dominio y cuentas de Meta o correo, del cliente. |
| ¿Dónde vive el código? | En un repositorio **privado** por cliente. El de OPORTIA es público: ahí nunca. |
| ¿De qué se parte? | De un «programa base» común sacado de las piezas ya probadas de OPORTIA (cuentas, copias, avisos, IA con tope). Ese base es el corazón de la Fábrica y hay que diseñarlo aparte. |
| ¿Cómo se mide el consumo? | El base trae un medidor que una vez al mes te manda por Telegram: personas, espacio y gasto de terceros. Tú lo confirmas en OPORTIA con un toque. |
| ¿Quién atiende una caída a las 2 a. m.? | Nadie garantizado: por eso el contrato promete 99 % al mes y no 24/7. |
| ¿Cuántos clientes aguanta una persona? | PROPUESTA: empezar con 1 piloto; revisar al llegar a 5. |

Dónde encaja en las fases 4 a 7:

| Fase | Qué es en el plan aprobado | Relación con la Fábrica |
|---|---|---|
| 4 | Empleo e «Investiga esta empresa» | Ninguna. No se toca. |
| 5 | Canales (Telegram, WhatsApp de empleos) | Lo que se aprenda de WhatsApp oficial permite pasar la cosa 18 del catálogo de «En revisión» a «Se puede». |
| 6 | Planes y cobros **de OPORTIA**, registro abierto, Excel, factura electrónica | Comparte las piezas de cobros (§6.7, columna `linea`) y lo que diga el contador. Listas y sumas siempre aparte. |
| **7 (no existe hoy)** | — | **Recomendación: crearla como «Fábrica»**: programa base, servidor por cliente, medidor, botón de ayuda, suspensión. |

Recomendación en una frase: **no esperar a la fase 7 para vender, pero sí para prometer en grande**. Con la fase 3 hasta el nivel 3 y las partes N1 a N4, hacer UN cliente piloto construido a mano por Claude contigo (precio piloto), aprender, y con eso diseñar la fase 7 después de la 6. Lo seguro si no decides: OPORTIA prepara cotizaciones y encargos, y nada se construye para terceros.

*(rev. 1)* **Corrección: lo seguro si no decides es más estricto.** Si nada se construye para terceros, el vendedor tampoco puede **enviar** cotizaciones a empresas (sería prometer un programa que no tiene dónde construirse ni vivir). Con DN1 y DN14 en su valor seguro: el vendedor investiga, prepara borradores de primer contacto y responde «déjeme confirmarlo»; el simulador de cotización funciona solo para ti. No se ofrece mensualidad con servidor propio ni contrato con 99 % de disponibilidad hasta tener el «programa base» diseñado y un piloto: una sola persona tendría que cuidar parches, copias y caídas de cada servidor.

---

## 9. Servidor, riesgos y pruebas

### 9.1 Servidor (512 MB, 1 procesador, ~10 GB)

| Recurso | Efecto |
|---|---|
| Memoria | Ninguno apreciable: sin procesos nuevos; una tarea de menos de un segundo al día. |
| Disco | 100 clientes durante 3 años ≈ 3,600 cobros + eventos + contratos de texto ≈ menos de 30 MB. Sin archivos adjuntos por defecto. |
| Red | Ninguna conexión nueva. El resumen usa el Telegram que ya existe. |
| IA | US$0 por defecto. |
| Copias | Crecen lo mismo que la base (poco). |

### 9.2 Riesgos

| Riesgo | Gravedad | Cómo se evita |
|---|---|---|
| Prometer algo que no se puede construir | Alta | Catálogo cerrado; «en revisión» y XL nunca se cotizan solos; madurez «nuevo» suma tiempo; lista de aceptación en el contrato. |
| Vender más de lo que se puede construir | Alta | Capacidad como ajuste (1 en construcción, 2 en espera); la fecha sale de ahí. |
| Cobrar mal (monto equivocado) | Alta | Cifras solo con código; «cómo salió el monto» visible; consumo nunca sube solo; todo aviso pasa por ti. |
| Cobro doble del mismo mes | Media | `clave_periodo` revisada en la misma escritura; prueba de repetir la tarea 3 veces. |
| Mensualidad que no cubre los gastos | Media | Piso en el cotizador; nota interna de costos; revisar precios cada trimestre. |
| Financiar gastos de terceros de un cliente que no paga | Media | Cuentas a nombre del cliente (modo 1); tope escrito; pausa al 100 %. |
| Contrato sin revisar | Alta | Apagado hasta el abogado; mientras, solo «Resumen de la propuesta». |
| Factura fuera de regla | Alta | OPORTIA no emite; contador antes del primer cobro. |
| Precios o márgenes en el repositorio público | Media | Viven en la base; las pruebas usan datos inventados; decisión DN12 sobre este documento. |
| Datos de un cliente mezclados con OPORTIA | Alta | Sus programas nunca viven aquí; OPORTIA solo guarda el nombre del negocio, su representante y sus cobros. |
| Una sola persona no da abasto | Media | Un resumen al día; tramos en vez de medir; empezar con un piloto. |

### 9.3 Pruebas

| Qué | Casos |
|---|---|
| Cotizador | Los 3 ejemplos de §4.3 exactos al centavo; XL y «en revisión» → `no_confirmado`; falta una respuesta de alcance → no hay cifra; descuento sobre el techo → pase; bajo el piso → pase; costo de terceros vencido → rango. |
| Catálogo | «Traer catálogo» muestra bien nuevas, cambiadas y retiradas; nada entra sin aprobar; la nota interna nunca aparece en el paquete que va a la IA. |
| Contrato | Mismo contenido → misma huella; un cambio → vuelve a «por aprobar»; plantilla sin abogado → no se prepara; «Preparar contrato» crea el cliente como prospecto; «Firmado» lo pasa a activo y crea venta, cobros y encargo en una sola escritura (o nada); «Registrar cliente» a mano funciona sin contrato. |
| Cobros | Repetir la tarea no duplica; cambio de mes y de año; día 31 en meses cortos; hora de RD; consumo sin confirmar usa el anterior; subir tramo vale el mes siguiente; nunca se suspende sola. |
| Soporte | Contador de cambios incluidos; reloj en días hábiles; la intención `soporte` siempre pasa al dueño. |
| Encargo | Nunca contiene claves, precios internos ni la nota interna; lleva la versión del catálogo; 5 días sin moverse → aviso. |
| Permisos | Un editor o lector no ve `#negocio`; otra cuenta no ve nada de este espacio. |
| Reglas | `test/reglas.test.js`: las migraciones nuevas solo agregan, sin `CHECK` ni `UNIQUE`. |

### 9.4 Datos externos usados y su estado

| Dato | Estado |
|---|---|
| Claude Haiku 5.5: US$0.10 entrada y US$0.50 salida por millón (hasta 100,000 de entrada); Sonnet 5.5: US$2 y US$10; proceso por lotes con 50 % menos | **VERIFIED** (https://platform.claude.com/docs/en/about-claude/pricing, 2026-11-10) |
| Servidor pequeño US$4 a US$6 al mes | UNVERIFIED (`www.digitalocean.com` no abrió; INFORME) |
| Tasa RD$60 por US$1 | UNVERIFIED (supuesto; `www.bancentral.gov.do` no abrió) |
| Plazo de factura electrónica 15-nov-2026 para micro y pequeñas; Facturador Gratuito con ~150 facturas al mes y solo en pesos | UNVERIFIED (búsqueda de hoy: blogs siemprealdia.co y alegra.com; `dgii.gov.do` no abrió) |
| ITBIS 18 % | UNVERIFIED (INFORME) |
| WhatsApp oficial ~US$0.011 (aviso) y ~US$0.074 (promoción) por mensaje en RD | UNVERIFIED (INFORME; cambia cada trimestre) |
| Dominio `.com` ~US$11 al año; buzón de correo ~US$7 al mes; planes gratis de ~300 correos al día | UNVERIFIED (INFORME; el límite gratis de Brevo figura como verificado allí) |
| Comisión de tarjeta 3 a 5 % | UNVERIFIED (INFORME) |
| Precios del mercado: US$40 a US$150 al mes por programas parecidos | UNVERIFIED (INFORME) |
| Leyes 172-13, 310-14, 126-02, 358-05 y 32-23 | UNVERIFIED (INFORME de leyes: ninguna leída en su texto oficial) |

---

## Conflictos con decisiones anteriores

Ninguno se resuelve en silencio. La columna «Seguro» es lo que vale si no dices nada.

| # | Lo aprobado, publicado o diseñado | Lo nuevo | Propuesta | Seguro |
|---|---|---|---|---|
| N1 | Plan aprobado (fases 0 a 6, 60 funciones): no incluye construir ni alojar programas de terceros. | Tu nota del 10 nov: «los programas que se venden los construye Claude» y el cliente paga una mensualidad. | Línea nueva «Fábrica», fuera de OPORTIA, con un piloto y luego fase 7 (§8.2). | OPORTIA solo cotiza y prepara encargos; nada se construye para terceros hasta tu sí. |
| N2 | Visión 55, «preparado»: «la base ya tiene tablas de planes, pagos y miembros». | CÓDIGO: solo existen `espacios.plan` y `miembros`. No hay tablas de planes ni de pagos. | Corregir esa frase del plan. Las tablas de cobros nacen aquí (N-B) y la fase 6 las reutiliza con `linea='plan_oportia'`. | No tocar nada; solo queda avisado. |
| N3 | Visión 55 y fase 3 §7.1: las mensualidades de tus clientes «no se mezclan con los planes de OPORTIA». | Una sola pieza de cobros para las dos cosas ahorra trabajo. | Mismas tablas y código, separadas por `linea`; pantallas y sumas aparte; nunca un total que las junte sin decirlo. | Solo `programa_cliente`; la fase 6 decide lo suyo. |
| N4 | Fase 3, D9: descuento 0 % por defecto; recomendado 10 % por pago anual. | Informe de precios: «pago anual = 2 meses gratis» (≈ 16.7 %). | Quedarse con 10 % como techo del vendedor; lo demás solo tú, a mano. | 0 %. |
| N5 | Informe de precios: tres planes fijos (Básico, Profesional, Avanzado). Fase 3: «planes» en la tabla. | Aquí: base + tallas + tramos (el precio sale de lo que se elige del catálogo). | Usar tallas y tramos; los tres «planes» quedan como paquetes de ejemplo. El campo `precios` de la fase 3 ya admite ambas formas. | Ninguna tabla en uso hasta que apruebes una. |
| N6 | Fase 3, R5: el vendedor «nunca cobra». | Avisos de cobro y de mora a clientes. | No los escribe ni decide el vendedor: salen de plantillas con código y **siempre con tu toque**, fuera de los niveles 2 a 4. | Solo «Copiar» y los envías tú. |
| N7 | Fase 3, M-A: `catalogo_funciones` con 8 datos por cosa. | Hacen falta 10 más (§3.2). | *(rev. 1)* Van dentro de M-A (ya está así en `diseno-fase3.md`). Sin `ADD COLUMN` en ningún caso. | Dentro de M-A. |
| N8 | Tu regla: nunca borrar datos. | Un cliente que termina puede pedir que se eliminen sus datos (Ley 172-13, UNVERIFIED), y el informe sugiere «borrado a petición». | En OPORTIA: nunca se borra; se vacían textos si lo pide, quedan fechas, montos y huellas (igual que la fase 3, C25). En el servidor del cliente (Fábrica): lo decide el abogado. | No borrar nada; preguntar al abogado. |
| N9 | Tu nota: el catálogo «lo mantiene Claude». Fase 3, C8: en el servidor no hay un Claude. | — | Claude prepara el texto de catálogo en sesión; tú lo traes y apruebas en pantalla (§3.3). | Igual. |
| N10 | Tu nota: el precio «sube o baja según su consumo (usuarios, mensajes, IA, almacenamiento)». | OPORTIA no puede medir dentro del programa de un cliente. | Tramos que tú confirmas cada mes; mensajes e IA como «terceros» con tope; medidor automático cuando exista la Fábrica. No se quita nada: se hace por pasos. | Consumo igual al mes anterior; nunca sube solo. |
| N11 | La tarea de hoy habla de «fases 4 a 7». | El plan aprobado llega a la fase 6. | Proponer la fase 7 como «Fábrica» (DN1). | No crear fases nuevas sin tu sí. |
| N12 | `CONTINUAR.md` (5 nov): «buscar empleo (fase 6)». Plan aprobado: empleo en la fase 4. `diseno-fase2.md` también dice «empleos (fase 6)». | No es de esta capa, pero los papeles no coinciden. | Avisado para quien ordene las fases; aquí se usó el plan aprobado (empleo en la 4). *(rev. 1)* La fase 2 ya lo declara (su C18) y lo pregunta (su D24); no escribe ningún número nuevo. | Sin cambio. |
| N13 | Regla: nunca secretos en GitHub (repositorio público). | Este documento trae una propuesta de precios y una nota de costos (§4.4). | Los precios de lista no son secretos (se les dicen a los clientes); los costos y márgenes sí. Si este documento se guarda en `notas/`, quitar antes §4.4. Decisión DN12. *(rev. 1)* La copia que ya hay en `notas/plan23` del repositorio de notas es una versión vieja de las fases 2 y 3 y no incluye este documento: se actualiza solo después de DN12, sin §4.4, y con una prueba nueva en `reglas.test.js` que busca «margen» y «costo interno» en `notas/`. | No subir este documento al repositorio. |
| N14 | Visión 47: WhatsApp automático «cuando haya ingresos». Fase 3, D15: WhatsApp oficial apagado. | Clientes pedirán WhatsApp automático en su programa. | En el catálogo queda «En revisión»: el vendedor no lo cotiza solo. | Igual. |
| N15 | Informe de precios: suspensión «a los 15-30 días». | Aquí: propuesta de suspensión el día +15, decidida solo por ti. | Nunca automática. | Igual. |
| N16 | Diseño de la fase 3 (aún sin construir): `ventas` la llenas tú con «Se vendió»; 15 intenciones; clases de mensaje fijas; resumen diario de ventas; una migración por parte. | **Pedidos a la fase 3:** (a) «Firmado» también crea la venta, y «Se vendió» sigue valiendo para ventas sin contrato de OPORTIA (ofrece «Registrar cliente»); (b) intención nueva `soporte`, que siempre pasa a ti; (c) clases nuevas `cobro_aviso` y `soporte_respuesta`, siempre con tu toque; (d) bloque «Negocio hoy» dentro del resumen diario de la parte 3.2; (e) el `no_se[]` del redactor alimenta «Lo que piden y no tenemos»; (f) parte nueva 3.8b y tabla suelta en M-B. | Revisarlos con quien construya la fase 3, antes de la parte 3.1. | La fase 3 queda como está diseñada y Negocio funciona a mano: «Registrar cliente», «+ Pedido» y «Copiar». |

---

## Decisiones del dueño

*(rev. 1)* **DN1 es la primera pregunta de todo el plan de las fases 2 y 3**: es tu modelo de negocio. La lista única para el dueño está en `plan-fases-2-3.md`. Si no contestas, vale «Seguro por defecto». Ninguna te obliga a pagar. Van como DN1 a DN19 para no confundirlas con las D1 a D22 de la fase 3.

| # | Decisión | Seguro por defecto | Recomendación |
|---|---|---|---|
| DN1 | ¿Apruebas la línea nueva «Fábrica» (Claude construye y tú alojas y cuidas programas de clientes)? ¿Con qué fase? | No todavía: nada se construye para terceros y, *(rev. 1)* por eso mismo, **el vendedor no envía cotizaciones ni pasa del nivel 1**. Costo por cliente si dices que sí: un servidor de US$4 a US$6 al mes (sin verificar), que paga su mensualidad; se te pregunta antes de crear cada uno. | Sí, con UN cliente piloto después del nivel 3 del vendedor; y crear la «fase 7 = Fábrica» después de la 6. |
| DN2 | ¿Dónde vive el programa de cada cliente? | En ningún lado hasta DN1. Nunca en el servidor de OPORTIA. | Un servidor pequeño por cliente en tu cuenta (US$4 a US$6 al mes, UNVERIFIED): se te pregunta antes de crear cada uno. |
| DN3 | Tabla de precios inicial (§4.2) | Guardada como borrador **sin usar**; el vendedor no cotiza. | Aprobarla como «precios piloto» después de comparar con 3 cotizaciones locales; revisarla tras el primer cliente. |
| DN4 | Moneda y tasa | Pesos; dólar solo de referencia; tasa que tú escribes (supuesto RD$60, UNVERIFIED). | Igual; revisar la tasa el día 1 de cada mes. |
| DN5 | Descuentos | Vendedor 0 %. Piso RD$1,800 al mes. | Vendedor hasta 10 % por pago anual; tú hasta 30 % de la instalación a los 3 primeros clientes, a cambio de mostrar su caso. |
| DN6 | Costos de terceros | Cuentas a nombre del cliente; tú no pagas nada por él. | Igual; solo la IA pequeña la pagas tú y la trasladas con 30 % y tope escrito. |
| DN7 | Permanencia y mora | 6 meses; gracia 10 días; propuesta de suspensión el día 15; nunca automática; interés 0 hasta que opine el abogado. | Igual. |
| DN8 | ¿Consulta con abogado dominicano (plantilla de contrato, mora, firma, datos al terminar)? Tiene costo: se te dice antes. | Sin abogado no se prepara ningún contrato; solo «Resumen de la propuesta». | Sí; es la misma consulta de la fase 3 (D3): pedir todo junto. |
| DN9 | ¿Consulta con contador (factura electrónica, ITBIS, si debes registrarte)? Tiene costo. | OPORTIA no emite ni prepara facturas; precios «más ITBIS». | Sí, y **esta semana** si piensas cobrar pronto: el plazo que citan las fuentes es el 15-nov-2026 (UNVERIFIED; no se afirma como hecho). Una sola cita junto con el abogado. |
| DN10 | Cómo cobrar | Transferencia; tú marcas «Pagado». Sin pasarelas ni tarjetas. | Igual hasta tener 5 clientes. |
| DN11 | ¿Guardar en OPORTIA el PDF del contrato firmado? | No: solo fecha, huella del texto y dónde lo tienes. | No. Si lo quieres después: máximo 2 MB por contrato. |
| DN12 | ¿Este documento (con precios y costos) puede ir al repositorio público? | No se sube. | Subirlo sin la sección 4.4 (costos y margen). |
| DN13 | Capacidad de construcción | 1 programa a la vez y 2 en espera; la fecha que da el vendedor sale de ahí. | Igual; revisar tras el piloto. |
| DN14 | Catálogo inicial (§3.4) | Todo «En revisión» hasta que lo apruebes cosa por cosa (el vendedor no cotiza nada). | *(rev. 1)* Aprobar el programa base como «probado» y las demás como «parecido» o «nuevo» (el vendedor te las pasa a ti; rangos de días más anchos); dejar 18, 22, 23 y 28 en revisión. Volver a clasificar tras el piloto. |
| DN15 | ¿Cuándo construir «Después de la venta» (cobros, soporte, encargos)? | No se construye hasta que exista un primer contrato en conversación. | Igual: es pequeña y se hace en una parte. |
| DN16 | ¿Cómo le llega el encargo a Claude? | Tú tocas «Copiar encargo» y lo pegas en una sesión. | Igual; pasar a la lectura automática solo cuando actives la revisión diaria. |
| DN17 | Código de los programas de clientes | No existe hasta DN1. Nunca en el repositorio público de OPORTIA. | Un repositorio privado por cliente (confirmar antes si tiene costo). |
| DN18 | ¿Permitir en la red de la sesión `www.digitalocean.com`, `dgii.gov.do`, `www.bancentral.gov.do` y `developers.facebook.com` para verificar los datos UNVERIFIED? | No se usa ningún precio de terceros como cifra firme: el vendedor da rangos o «déjeme confirmarlo». | Sí, antes de aprobar la tabla de precios. |
| DN19 | Nombre y datos de tu empresa para contratos y avisos (razón social, RNC si lo tienes, domicilio, cuenta para transferencias) | Sin esos datos no se prepara contrato ni aviso de cobro. | Dárselos al contador y al abogado en la misma consulta. |

---

## Registro de cambios

### Revisión 1 — 2026-11-10 (tras las dos críticas; cada punto se comprobó antes de aplicarlo)

No se pudo abrir ninguna página oficial desde la sesión: precios de servidores, tasa, DGII, plazo de la factura electrónica y tarifas de Meta siguen UNVERIFIED.

| # | Crítica | Cambio | Dónde |
|---|---|---|---|
| 1 | Se podía vender algo que nadie puede entregar | Con DN1 y DN14 en su valor seguro el vendedor no envía cotizaciones ni pasa del nivel 1; DN1 es la primera pregunta del plan, con su costo por cliente | §0, §8.2, DN1, DN14 |
| 2 | 20 cosas «Se puede» nunca construidas; plazos en mensajes automáticos | Solo el programa base es «probado»; lo demás «parecido» o «nuevo» con rangos más anchos; sin toque solo se cotiza lo probado; plazos como rango | §3.4, DN14 |
| 3 | `ALTER TABLE … ADD COLUMN` contra la regla de la fase 2 | Regla única: sin `ADD COLUMN`; los diez datos van dentro de M-A | §3.2, §8.1, N7 |
| 4 | Los pedidos N16 no estaban en la fase 3 | Recogidos en `diseno-fase3.md` §15.3 y anotados aquí | §8.1 |
| 5 | Empleo fase 4 contra fase 6 | Remite al conflicto y la decisión de la fase 2 | N12 |
| 6 | Costos y márgenes cerca del repositorio público; copia vieja en `notas/plan23` | No se sube sin quitar §4.4; la copia de notas se actualiza solo tras DN12; prueba nueva en reglas | N13 |
| 7 | Plazo de factura electrónica en 5 días, sin verificar | Dicho como «pregunta a tu contador esta semana», no como hecho | §0, DN9 |
| 8 | Menú y palabra «clientes» | Menú único de la fase 2 §8.6; «clientes» solo para quien contrató | §7 |
| 9 | Telegram: presupuesto propio toca el avisador | Grupo `negocio` con prueba; un solo mensaje diario | §8.1 |
| 10 | Demasiado para una sola persona (un servidor por cliente con 99 %) | No ofrecer mensualidad con servidor propio hasta tener programa base y piloto | §8.2 |

**No aplicado:** nada de las críticas a esta capa quedó sin aplicar. La sección 4.4 (costos y margen) no se tocó y sigue siendo solo interna.
