# Investigación: fuentes públicas y legales para encontrar empresas en RD (fuentes-empresas)

Fecha: 2026-11-10. Solo lectura de diseño; no se tocó ningún repositorio.

## 0. Cómo leer este informe (y un límite honesto)

- VERIFIED = lo confirmó una búsqueda web con resultado en la URL citada, el 2026-11-10. UNVERIFIED = no se pudo leer la página oficial; es dato de terceros o de memoria y hay que comprobarlo desde el servidor antes de construir.
- LÍMITE: en esta sesión, WebFetch no pudo abrir ningún sitio oficial (dgii.gov.do, operations.osmfoundation.org, openstreetmap.org, developers.google.com no resuelven: están fuera de la red permitida). Solo funcionó WebSearch, que devuelve resúmenes. Por eso casi ninguna cláusula legal está leída en su texto original. Regla: ningún conector se activa hasta que alguien lea los términos oficiales y los guarde en `notas/` con fecha.
- Nada de esto contacta servicios con cuenta ni envía mensajes.

## 1. Tabla resumen

| Fuente | Qué da | Formato | Acceso automático | Fiabilidad | Estado |
|---|---|---|---|---|---|
| DGII (RNC) | RNC, razón social, nombre comercial, actividad, estado, régimen | ZIP con TXT (descarga) y consulta web | Descarga única permitida en la práctica; términos UNVERIFIED | Alta para existencia legal; sin teléfono ni web | Recomendada (con cuidado) |
| datos.gob.do | Catálogos de instituciones (MICM, DGCP, etc.) | CSV/XLS/API CKAN | Sí, es datos abiertos; licencia por dataset | Media-alta, desigual | Recomendada |
| DGCP proveedores del Estado | Proveedores registrados, inhabilitados, mujeres proveedoras, contratos | CSV, API, OCDS | Sí (portal de datos abiertos) | Alta, pero solo quien vende al Estado | Recomendada |
| MICM Mipymes certificadas | RNC, empresa, emisión, vencimiento, clasificación (micro/pequeña/mediana) | CSV | Sí (datos.gob.do) | Alta para tamaño | Recomendada |
| ONAPI | Nombres comerciales y marcas | Consulta web | No hay descarga abierta confirmada | Media | Solo consulta manual |
| Cámaras de Comercio (Registro Mercantil) | Registro de empresas; estadísticas agregadas | Web; certificaciones | Sin lista pública descargable confirmada | Alta pero cerrada | No automatizar |
| ProDominicana | Directorio de exportadores | HTML | UNVERIFIED | Media | Evaluar a mano |
| Asociaciones (ASONAHORES, etc.) | Listas de socios, a veces | HTML/PDF | Sin lista confirmada | Media | Pedir permiso |
| OpenStreetMap / Overpass | Negocios con nombre, coordenadas, a veces teléfono y web | JSON/XML por API o extracto | Sí, con límites | Media (cobertura desigual en RD) | Recomendada (ya prevista) |
| Nominatim | Convertir dirección a coordenadas | API JSON | Sí, 1 petición por segundo | Media | Solo uso suave |
| Wikidata | Empresas grandes con web, sede, sector | SPARQL / JSON | Sí, con User-Agent | Alta pero muy pocas empresas | Complemento |
| Overture (ya en OPORTIA) | ~90,600 lugares en RD | Descarga | Sí (según plan) | 60-85 % | Base actual |
| Google Places API (oficial) | Lugares, teléfono, web, horarios | API de pago | Sí, con llave y factura | Alta | Opcional, de pago |

## 2. Detalle por fuente

### 2.1 DGII, RNC (la lista de contribuyentes)
- URL de descarga: `https://dgii.gov.do/app/WebApps/Consultas/RNC/DGII_RNC.zip` — UNVERIFIED como activa (no se pudo abrir). Es el archivo que usan proyectos de terceros: un paquete PyPI `dgii-rnc` lo cita como fuente y un plugin de FacturaScripts lo descarga y descomprime a TXT. VERIFIED solo que esos proyectos lo citan (https://pypi.org/project/dgii-rnc , https://scrutinizer-ci.com/g/joenilson/fsRepublicaDominicana/ , 2026-11-10).
- Tamaño de ejemplo: unas 728,522 filas y 7 columnas (según el paquete PyPI; el dato es de terceros y viejo; hoy puede ser mayor) — UNVERIFIED.
- Qué contiene (de memoria, UNVERIFIED): RNC o cédula, razón social, nombre comercial, actividad económica, fecha de inicio, estado, régimen de pago. No trae teléfono, web ni correo.
- Actualización: se dice que se refresca cada pocos días — UNVERIFIED.
- Términos y robots.txt de dgii.gov.do: no leídos — UNVERIFIED. DGII tiene aviso de que el RNC se consulta con captcha en su web; la descarga ZIP es el camino que ellos mismos ofrecen. Hay también un proyecto de actualización y regularización del RNC (https://siemprealdia.co/republica-dominicana/impuestos/proyecto-de-actualizacion-y-regularizacion-del-rnc/ , VERIFIED que existe la noticia).
- RIESGO de privacidad: el archivo incluye personas físicas (nombre de una persona con cédula como RNC). Ley 172-13: según resúmenes, excluye a personas jurídicas y datos profesionales de contacto, pero no está claro que cubra a una persona física con negocio — VERIFIED parcial (https://pwc.com/ia/es/servicios/Regulacion-Legal/RD-Ley-172-13%20.pdf , https://phlaw.com/ley-172-13-sobre-proteccion-de-datos-personales/). Decisión prudente: guardar solo empresas (razón social con S.R.L., S.A., etc.) y para personas físicas guardar solo el nombre comercial, nunca cédulas.
- Uso en OPORTIA: no para "encontrar" empresas nuevas (no hay contacto), sino para confirmar que existe, ver si está activa y unir con otras listas por RNC.

### 2.2 datos.gob.do (portal nacional de datos abiertos)
- Es un CKAN. Ejemplo verificado: "Lista de Proveedores del Estado Inhabilitados", CSV, licencia Creative Commons Attribution, actualizada 2025-03-03 — VERIFIED (https://backoffice.datos.gob.do/fa_IR/dataset/proveedores-del-estado-inhabilitados/resource/ae079cd9-d480-4863-bf06-72ec2ae7a0d6 , 2026-11-10).
- Licencia: varía por conjunto; revisar cada uno. Límites de velocidad: no publicados — UNVERIFIED. Recomendado: una descarga por semana por conjunto.

### 2.3 DGCP, proveedores del Estado
- Portal de datos abiertos: https://www.dgcp.gob.do/datos-abiertos1/ y https://datosabiertos.dgcp.gob.do/ (incluye GeoComprasRD, Data Mercado RD y una API) — VERIFIED por búsqueda.
- Conjuntos: Registro de Proveedores del Estado, catálogo de mujeres proveedoras, inhabilitados — VERIFIED.
- Licencia: CONFLICTO. datos.gob.do muestra CC-BY; Open Contracting dice ODbL (https://data.open-contracting.org/en/publication/22) — VERIFIED que hay conflicto. Hay que leer el aviso en el portal de la DGCP antes de reutilizar; ambas licencias exigen atribución, y ODbL exige compartir bajo la misma licencia lo derivado (igual que OSM, tabla aparte).
- Utilidad: empresas que venden al Estado, con RNC. Buena señal de que tienen capacidad de pago.

### 2.4 MICM, Mipymes certificadas
- Existe el recurso "Mipymes certificadas, MICM, 2019-2025" en datos.gob.do, con un CSV; el de 2025 trae RNC, empresa, fecha de emisión, fecha de vencimiento y clasificación; certificado con vigencia de 12 meses — VERIFIED (https://backoffice.datos.gob.do/fa_IR/dataset/88d4c1a3-f5e8-439a-a23a-01e29bf23292/resource/b4b9fe3a-1164-48b9-97ef-a34dbeab2572).
- Más de 13,000 mipymes certificadas en el primer año de la gestión actual — VERIFIED (https://presidencia.gob.do/noticias/mas-de-13000-mipymes-certificadas-en-primer-ano-de-gestion-superan-las-emitidas-en-el).
- No se encontró un registro nacional público y completo de todas las mipymes — VERIFIED (ausencia en la búsqueda). No hay teléfono ni dirección en el CSV (según columnas citadas).
- Utilidad: tamaño (micro/pequeña/mediana) por RNC, útil para decidir a quién ofrecer qué.

### 2.5 ONAPI (nombres comerciales)
- Los registros de signos distintivos son públicos y gratuitos de consultar — VERIFIED por guía legal de tercero (https://phlaw.com/es/protege-tu-marca-propiedad-intelectual-en-republica-dominicana/). URL del buscador y condiciones: UNVERIFIED.
- Volumen: 64,680 solicitudes de nombres comerciales en 2024 (según memorias citadas, VERIFIED por búsqueda, no por la fuente primaria).
- Tiene nombre y titular, sin teléfono ni sector fiable. Descarga masiva: no confirmada. Conclusión: solo comprobar un nombre a mano; no raspar.

### 2.6 Cámaras de Comercio y Registro Mercantil
- Son 32 cámaras; 19 ya ofrecen servicios en línea (2026) — VERIFIED (https://acento.com.do/economia/el-60-de-las-camaras-de-comercio-del-pais-ya-ofrecen-servicios-en-linea-9543059.html). El Registro Mercantil se está digitalizando y unificando por el MICM (Ley 3-02) — VERIFIED.
- Estadísticas agregadas públicas (empresas creadas por sector y provincia) — VERIFIED por una nota de 2025 de la Cámara de Santo Domingo; sirve para el tablero "dónde hay empresas", no para listas de empresas.
- No se halló lista pública descargable de empresas ni consulta por nombre — VERIFIED (ausencia). Certificaciones individuales son trámite pagado. No automatizar.

### 2.7 ProDominicana y asociaciones
- ProDominicana (directorio de exportadores): no se verificó ninguna página ni términos — UNVERIFIED.
- ASONAHORES: es la asociación cúpula del turismo; más de 400 establecimientos y 90,000 habitaciones; la búsqueda no halló lista pública de socios — VERIFIED (https://eldinero.com.do/ ; resultados citados). Sitio sugerido: asonahores.com, no abierto.
- ADOCOSE, ANDECLIP, AIRD y otras: sin verificar listas ni términos — UNVERIFIED. Camino legal: pedir por escrito un convenio; si dan la lista, entra como fuente "solo con permiso" (regla de la visión 17/28).

### 2.8 OpenStreetMap, Overpass y Nominatim
- Licencia de los datos: ODbL (atribución "© colaboradores de OpenStreetMap"; lo derivado se comparte con la misma licencia) — conocido, página oficial no abierta: UNVERIFIED en esta sesión. Por eso OPORTIA la guarda en tabla aparte (visión 56).
- Overpass: guía de uso del manual oficial: unas 10,000 consultas al día y menos de 1 GB al día; la wiki sugiere dividir entre 100 para uso regular (menos de 100 consultas y 10 MB al día); límites por aplicación, no por usuario; hay "slots" y rechazo por 429 — VERIFIED por resumen (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html , https://wiki.openstreetmap.org/wiki/Overpass_API).
- Alternativa de bajo riesgo: descargar un extracto de RD (Geofabrik) una vez al mes y consultarlo local; así no se carga a nadie. Ya hay precedente de Overture. Tamaño del extracto de RD: UNVERIFIED (se espera pequeño, decenas de MB).
- Nominatim (servidor público): máximo absoluto 1 petición por segundo para toda la aplicación, User-Agent propio identificable, sin disfrazarse de navegador, la geocodificación masiva está desaconsejada — VERIFIED por resúmenes (https://operations.osmfoundation.org/policies/nominatim/ , 2026-11-10; texto íntegro no leído).
- Calidad en RD: direcciones por calle y número son escasas; sirve para sector/barrio y no para puerta exacta — UNVERIFIED (experiencia general).
- Datos que trae un negocio en OSM: name, amenity/shop, teléfono y web a veces, horario a veces. Cobertura de colmados y negocios pequeños: baja.

### 2.9 Wikidata
- Punto de acceso: `query.wikidata.org/sparql`; pide un buen User-Agent y respetar la política de robots; tope de 60 s de ejecución por consulta y por cliente; bloqueos por abuso o por UA vacío — VERIFIED por resumen (https://www.wikidata.org/wiki/Wikidata:Data_access).
- Licencia CC0 (dominio público) — UNVERIFIED en esta sesión (no confirmada por la búsqueda).
- Cubre muy pocas empresas dominicanas (bancos, hoteles grandes, cadenas): sirve para enriquecer (web oficial, sede), no para descubrir.

### 2.10 Lo que la visión PROHÍBE, confirmado
- Google Maps: los términos de Google Maps Platform prohíben extraer o raspar contenido (nombres, direcciones, reseñas) fuera de sus servicios, y limitan el almacenamiento (caché); el contenido de Places no puede usarse con un mapa de otro proveedor — VERIFIED por resúmenes de terceros y de los Service Specific Terms (https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20240522). Texto actual de la sección de caché de Places: no leído — UNVERIFIED. Se mantiene la prohibición: no raspar.
- Facebook/Instagram: los términos de Meta prohíben recolección automática sin permiso previo, con o sin sesión iniciada; la única vía permitida son sus APIs o permiso por escrito; los términos se actualizaron el 2026-07-29 — VERIFIED por resumen (https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/). Un fallo en California (Meta contra Bright Data) dijo que los términos no impedían leer datos públicos sin sesión, pero lo explicó por la redacción de entonces y no es garantía para OPORTIA — VERIFIED como noticia (https://www.zyte.com/blog/california-court-meta-ruling/). Decisión: se mantiene prohibido; solo enlace y lo que el dueño pegue.
- Páginas Amarillas (paginasamarillas.com.do): términos y robots.txt NO leídos — UNVERIFIED. Se mantiene la prohibición por regla del dueño; no hay API oficial conocida.

## 3. Alternativa legal de pago: Google Places API (oficial)
Precios VERIFIED por resumen de las tablas oficiales (https://developers.google.com/maps/billing-and-pricing/pricing , 2026-11-10; la tabla íntegra no se abrió; una fila contradictoria en los resultados sugiere confirmar):

| SKU (por 1,000 llamadas, primer escalón) | Precio USD | Gratis al mes |
|---|---|---|
| Text Search Pro | 32.00 | 5,000 |
| Nearby Search Pro | 32.00 | 5,000 |
| Text Search Enterprise (teléfono, web) | 35.00 | 1,000 |
| Text Search Enterprise + Atmosphere (reseñas) | 40.00 | 1,000 |

- Se cobra el SKU más alto entre los campos pedidos (máscara de campos): pedir teléfono sube toda la llamada a Enterprise — VERIFIED.
- Orden de magnitud: 1,000 búsquedas con teléfono ≈ US$35; una búsqueda devuelve hasta 20 lugares (UNVERIFIED), así que unos 20,000 lugares podrían costar ≈ US$35 si todo va bien (estimación mía, no de Google).
- Condiciones: solo se puede guardar el `place_id`; el resto se muestra en vivo, no se exporta a Excel (visión 56 y 20). Requiere tarjeta y llave en Claves, con tope de gasto del dueño.
- Hay que preguntar al dueño antes de activarlo (regla: servicio de pago).

## 4. Qué cubre cada fuente para un sector típico (clínica, hotel, colmado)
- Hotel: OSM + Overture + Wikidata (grandes) + DGII (razón social) + lista de ASONAHORES si dan permiso.
- Clínica: OSM + Overture + DGII (actividad) + (permiso) ANDECLIP.
- Colmado: casi solo OSM/Overture (cobertura ~2 %); DGII confirma existencia pero sin ubicación; aquí Google Places de pago sería lo único con cobertura real.
- Vende al Estado: DGCP.
- Tamaño: MICM mipymes.

## 5. Recomendación para OPORTIA
- Mantener Overture como base y añadir OSM (extracto mensual local) en tabla aparte por ODbL, con atribución visible; evitar Overpass en vivo salvo para pocas consultas.
- Añadir DGII RNC como fuente de "verificar y unir por RNC" (no de contacto): descarga semanal o mensual, solo empresas, sin cédulas de personas físicas, guardada en tabla propia; antes de activarla, leer los términos oficiales desde el servidor.
- Añadir DGCP (proveedores del Estado) y MICM (mipymes certificadas) como señales de tamaño y capacidad; el cruce por RNC es la llave común del catálogo.
- Usar datos.gob.do como puerta de entrada: cada conjunto con su licencia guardada junto a los datos (fuente, fecha, licencia).
- No automatizar ONAPI ni Cámaras; para asociaciones, preparar una carta modelo en español simple para pedir permiso.
- Google Places como complemento opcional y de pago, con tope mensual, solo "ver en vivo" y `place_id`; nunca raspar Google, Facebook ni Páginas Amarillas.
- Todo conector es una "fuente enchufable" con tres reglas: guardar, solo mostrar en vivo, solo enlazar; límite de ritmo y User-Agent propio ("OPORTIA", sin datos personales del dueño) por fuente; respetar robots.txt y términos.
- En 512 MB de RAM, procesar los archivos grandes (DGII) línea a línea (flujo), nunca cargarlos enteros, y guardar solo los campos usados; vigilar el disco (~10 GB).
- "Quitar mi negocio" se aplica a todas las fuentes: la lista de exclusión se consulta antes de volver a importar.
- Ley 172-13: guardar solo datos profesionales (nombre del negocio, correo general, teléfono comercial); si el negocio es una persona física, no guardar cédula ni datos privados; consultar a un abogado dominicano antes de contactar masivamente.

## 6. Decisiones del dueño (con valor seguro por defecto)

| # | Decisión | Por defecto seguro |
|---|---|---|
| 1 | ¿Activar DGII RNC como fuente de verificación? | Sí, solo empresas, tras leer los términos; sin cédulas |
| 2 | ¿Activar OSM (extracto mensual)? | Sí, en tabla aparte, con atribución |
| 3 | ¿Activar DGCP y MICM mipymes? | Sí, tras confirmar licencia (CC-BY u ODbL) |
| 4 | ¿Usar Google Places de pago? | No por ahora; si se activa, tope US$20 al mes y solo "ver en vivo" |
| 5 | ¿Pedir permiso por escrito a asociaciones (ASONAHORES, ANDECLIP, ADOCOSE, AIRD)? | Sí, preparar carta; no raspar sus webs |
| 6 | ¿Pagar un abogado dominicano para revisar la Ley 172-13 y contactos? | Sí, una consulta antes de la fase 3 (contacto) |
| 7 | ¿Permitir importar personas físicas con negocio? | No: solo su nombre comercial público |
| 8 | ¿Quién revisa los términos oficiales (hoy no se pudieron leer)? | Habilitar los dominios en la red del servidor y dejar que OPORTIA guarde copia fechada de los términos antes de activar cada fuente |
