# Nuevo proyecto de Junior: profesor de aviación (ENALAS, piloto privado) — 11 nov 2026

Junior cambia el rumbo: OPORTIA pasa a ser un profesor de aviación tipo Duolingo (pidió archivar/borrar lo de OPORTIA: CONFIRMAR antes; recomendación: archivar en rama oportia-archivo). La 1f quedó parada y guardada en fase-1f (cfd27d6).

## Lo que pidió (resumen fiel; su texto completo está en la conversación)
1. Fuentes SOLO sus 5 PDF: Jeppesen piloto privado (es), TEST GUIDE Jeppesen piloto privado avión, Private Pilot Handbook, 10 Factores Humanos, POH «Alarus 2» (en realidad ZENAIR CH 2000 Trainer: señalarlo). Nada inventado; cada explicación con libro, capítulo, sección y página; diferencias entre libros señaladas.
2. 11 materias en este orden: Factores Humanos y Toma de Decisiones; Sistemas, Motores e Instrumentos; Aerodinámica; Ambiente de Vuelo; Regulaciones Aeronáuticas Dominicanas; POH; Comunicación e Información de Vuelo; Meteorología; Rendimiento; Navegación; SMS.
3. Cada materia: (1) clase audiovisual general tipo película, narrada (ElevenLabs), escenarios, imágenes, 3D, animaciones; (2) explicación de temas; (3) animaciones/3D (motor por dentro, ala y flujo de aire, pérdida, instrumentos que se mueven, meteorología); (4) simulaciones de situaciones con decisión del alumno y consecuencia según el libro; (5) resumen; (6) preguntas originales del Test Guide; (7) ejercicios interactivos. Si falla: reexplicar de otra forma más sencilla. Antes pidió 90 % para pasar cada tema (confirmar).
4. TEST GUIDE = PRIORIDAD PRINCIPAL: enunciado, opciones, numeración, respuesta y explicación ORIGINALES sin cambios, con su imagen original; debajo «Explicación sencilla para entenderla» (qué pregunta, qué significa, por qué es la correcta, qué aprender). Organizadas por las 11 materias; practicar todas; detectar las que más le cuestan y repetirlas. Aclarar que es material FAA, no ley dominicana. Los demás libros = prioridad secundaria, para entender las preguntas.
5. Inglés aeronáutico: palabra, pronunciación aproximada, significado, ejemplo; aumentar poco a poco.
6. 30 días; clases de máx. 1 hora.
7. Examen final único de 200 preguntas de las 11 materias: nota, % por materia, explicar errores, práctica de lo débil, decir con honestidad si está listo. (Antes habló de 100 preguntas y tomarlo 3 veces: confirmar.)
8. Cuentas: ADMIN (usuarios, quién está conectado, última conexión, resultados, % aciertos/errores, materias difíciles por alumno, preguntas falladas, crear salas y cuestionarios grupales, elegir actividades disponibles, decidir si los resultados/respuestas/explicaciones se muestran a los alumnos) y ESTUDIANTE (entrar, estudiar, cuestionarios, salas, minijuegos, ver su progreso, ver sus errores si el admin lo permite; nunca ve datos de otros).
9. Salas multijugador en vivo: carrera de preguntas, el primero que responde bien avanza, con imagen; (detalle del punto 14 incompleto: «Cada sala debe tener: Nombre…»).
10. Diseño claro, visual, interactivo, gamificado según cómo aprende el cerebro (repaso espaciado, recordar activo, rachas, medallas).

## Reglas técnicas propias
- NUNCA subir libros, preguntas ni imágenes de los libros a GitHub (repo público): viven solo en el servidor privado.
- No prometer video real: animaciones/3D dentro de la app sincronizadas con voz.
- ElevenLabs y la API de Claude son de pago: avisar antes.

## Visión de Junior (11 nov 2026): academia de aviación con IA
- Un instructor personal por estudiante que OBSERVA cómo piensa, detecta POR QUÉ se equivoca, descubre qué no entiende y elige la mejor forma de enseñarlo (texto → animación 3D → simulación → ejemplo práctico, según lo que necesite).
- «Cerebro educativo» de cada estudiante que evoluciona con él (modelo del alumno: dominio por concepto, errores típicos/conceptos erróneos, qué formato le sirve, memoria y repaso).
- Aprender juntos: competir, resolver situaciones de vuelo en grupo, comparar conocimientos; el administrador observa a todos.
- Meta: no solo aprobar el examen, sino comprender, recordar y decidir como piloto.
Implementación propuesta: cada opción incorrecta del Test Guide se mapea a la idea equivocada que la explica (preparado al procesar los libros) → diagnóstico sin IA en vivo; con la API de Claude (opcional, con tope): preguntas de «¿por qué elegiste esa?», diálogo socrático y elección de formato. Simulaciones de decisión por materia; salas: carrera, «resolver juntos», duelos.

- 11 nov 2026: Junior aclara que el uso es PRIVADO, para él y estudiantes amigos suyos, NO para vender: usar todo el material de sus libros sin recortes. Aun así, el material nunca va a GitHub (repo público): solo en el servidor privado.

- 11 nov 2026: IA en la academia: debe funcionar TODO sin API, pero con la API de Claude o ChatGPT es mucho mejor (usar los adaptadores de la 1d con tope). Al entrar, cada usuario ve si tiene un instructor IA dándole seguimiento (con API: «Tu instructor IA te acompaña»; sin API: «Instructor automático»).
- 11 nov 2026: Junior pide sacar lo útil de OPORTIA y BORRAR lo demás. Hecho: copias locales quitadas. RESPALDO = las ramas en GitHub: main (54b9bb9, OPORTIA 0.5.1) y fase-1f (cfd27d6, 1f sin publicar). Las etiquetas NO se pudieron subir (403). No borrar ninguna rama remota. La academia nueva sale de main quitando proyectos/motor de clientes.

- 11 nov 2026: IA en la academia: debe funcionar TODO sin API, pero con la API de Claude o ChatGPT es mucho mejor (adaptadores de la 1d, con tope). Al entrar, cada usuario ve si tiene un instructor IA dándole seguimiento.
- 11 nov 2026: Junior pide sacar lo útil de OPORTIA y BORRAR lo demás. Copias locales quitadas. RESPALDO = las ramas en GitHub: main (54b9bb9, OPORTIA 0.5.1) y fase-1f (cfd27d6, 1f sin publicar). Las etiquetas NO se pudieron subir (403). No borrar ninguna rama remota.

- 11 nov 2026: hay libros en inglés y en español con el mismo contenido: usar los dos; si el español tiene mala traducción, guiarse por el inglés. LO ÚNICO QUE NO SE TOCA es el Test Guide: pregunta tal cual y su respuesta tal cual, como saldrá en el examen. Las explicaciones deben buscar la forma más fácil de explicar ESA pregunta con ESA respuesta.

## Documentos recibidos (11 nov 2026) — carpeta Drive de Junior, bajados a scratchpad/contenido-enalas/pdf (FUERA de git)
- TEST GUIDE JEPPESEN PILOTO PRIVADO AVION — 290 págs, con texto.
- Folleto de fig PP — 73 págs, ESCANEADO (sin texto): figuras del Test Guide.
- Jeppesen piloto Privado español — 470 págs, con texto.
- Jeppesen Private Pilot Manual (GFD, inglés) — 743 págs, con texto.
- Guion básico de RADs — 20 págs (Regulaciones Aeronáuticas Dominicanas).
- Lista de Chequeo Alarus — 3 págs.
- Calendario de Materia Privado G80 (ENLS-2-CMPP): orientación 6 oct; cada materia con sus horas y SU EXAMEN propio (01 a 11) y 12 Examen Final; examen oral individual antes del teórico del IDAC; repetir examen 2 veces = tutoría; ~2 h de clase por día. (Calendario 2025-2026.)
FALTAN: «10 FACTORES HUMANOS.pdf» (materia 1), «Private Pilot Handbook» completo (en su Drive personal solo hay págs. 451-500), «POH ALARUS 2» (el manual completo del avión).
- 11 nov 2026 (Junior): el «Private Pilot Handbook» es el Jeppesen de 470 págs (español), pero está incompleto: COMPLETARLO con el de inglés (743, completo). Las clases van en español.
- TODA la clase se basa en prepararse para el Test Guide.
- POH: el Test Guide no lo cubre: CREAR preguntas del POH «tal cual» el texto del POH, llenando lo más posible; el avión es el ALARUS CH 2000 (Zenair): hay que BUSCAR su POH (solo tenemos la lista de chequeo de 3 págs). Las preguntas creadas se marcan como «del POH», nunca como del Test Guide.
- Las preguntas del Test Guide son SIEMPRE las mismas en todo (práctica, exámenes por materia, final): solo cambia el orden, para comparar resultados.

- 11 nov 2026: Junior NO da la clave de ElevenLabs. Plan: Claude escribe el TEXTO de narración de cada clase; él lo pasa por ElevenLabs y sube el audio (mp3) desde el administrador cuando quiera. Mientras, la clase muestra subtítulos y puede leerse con la voz gratis del navegador (speechSynthesis). Publicar por etapas (1, 2, 3…) en su servidor para que vaya viendo las animaciones en la página.

- 11 nov 2026: audio ElevenLabs de Junior (6 min 18 s, resumido por el límite gratis) = el VIDEO RESUMEN de toda la materia que se ve ANTES de la clase; las preguntas van al inicio de cada una. Guardado en contenido-enalas/audios/materia-01-elevenlabs.mp3.
- 11 nov 2026 — PLANES DE ESTUDIO a elegir por cada estudiante: «1 mes» (RECOMENDADO), «2 meses», y «Repaso de 15 días» (lo más importante, cubriendo el Test Guide COMPLETO). El examen es siempre el mismo. Cada plan se adapta: según cómo vaya, puede terminar antes o después; la app muestra la fecha estimada de fin y la ajusta (si es bueno y dedica más, termina antes).
- 11 nov 2026 — Botones e interfaz se ven «muy simples»: pasada visual con las ideas de academia-inspiracion.md. Etiquetas claras: «TEST GUIDE · Pregunta N» (tal cual) vs «PRÁCTICA · Situación de vuelo» vs «POH»; los exámenes son solo del Test Guide (y POH cuando exista).
- 11 nov 2026 — PANEL DEL GRUPO visible para todos los estudiantes: en qué etapa/materia va cada uno (para motivarse). Solo muestra avance general (materia actual, % del camino, racha, medallas); NUNCA notas detalladas, errores ni conexión (eso sigue siendo solo del admin). El admin puede apagarlo y cada estudiante puede ocultarse.
- 11 nov 2026 — Junior: la página va LENTA al cambiar de apartado; optimizar velocidad y almacenamiento, borrar lo que no se use (código de proyectos/motor de clientes de OPORTIA), mejorar la interfaz. Hacerlo justo después del rediseño (mismos archivos): medir cambio de pantalla en iPhone, cargar por partes, caché en el navegador, menos pedidos, quitar código muerto.
- 11 nov 2026 — PREGUNTAS EN DOS MODOS (decisión de Junior): «Original» = las 3 opciones tal cual del Test Guide (simulacro del examen); «Modo reto» = enunciado y respuesta correcta TAL CUAL + 2 incorrectas NUEVAS escritas por Claude, más engañosas y plausibles (que no se pueda adivinar descartando). Etiquetar claro «Modo reto». Las dos se practican.
- 11 nov 2026 — Explicaciones: más claras, más visuales, más «Recuerda», TODO lo hablado (animaciones/3D por tarjeta, situaciones de vuelo, inglés con pronunciación, idea equivocada por opción, «¿Por qué elegiste esa?», repaso, juegos); y más ENTRETENIDO (gamificación, minijuegos, retos, sonidos opcionales, celebraciones).
- 11 nov 2026 — Junior pide:
  1. SONIDOS y efectos (acierto, error, racha, subir de nivel, botones), con interruptor para apagarlos.
  2. ADMIN «Modo estudiante»: desde Administrador poder jugar/estudiar como un usuario normal (su propio camino, sin mezclar con su vista de admin).
  3. ADMIN «Respuestas»: ver las respuestas correctas de cada materia/tema/pregunta (clave completa, con explicaciones).
  4. ESTUDIANTE al terminar cada examen: ver su resultado completo, lo que sacó bien y lo que sacó mal, con la respuesta correcta y la explicación.
  5. «MEMORIA DE ERRORES» permanente: lo que más falla cada estudiante se guarda PARA SIEMPRE (historial de errores por pregunta y por concepto/idea equivocada), el sistema lo entrena más (repaso dirigido) y en cada etapa le da retroalimentación de sus puntos débiles («Tu punto débil: …»).

## 12 nov 2026 — Video: cada frase con su imagen en 3D
Junior: «el video con el audio debe enseñar visualmente lo que se va hablando… si hablo de un ojo, enseñar en 3D un ojo, la córnea y todo eso, y cómo se vería en caso del fallo… si hablo de un hombre dentro de un carro, en primera persona dentro de un carro».
Plan: la palabra que suena es la que se ve; un plano por frase (60+ planos en 6:18), nada quieto más de 6–8 s; 3D estilizado (three.js, render fuera del repo), MP4 por Drive. Primero un piloto de 30–45 s de la parte del ojo para que Junior lo apruebe.

## 12 nov 2026 — Más pedidos (resumen)
- Admin: ficha por alumno, comparar, entradas/salidas (0.9.0 hecho); cambiar nombres/usuarios; bloquear cuenta; contraseñas de mínimo 4 que pone cada alumno; examen con reloj y cuadrícula; privacidad (solo el admin ve resultados; «Privado» oculta al alumno del grupo); reporte descargable (ranking, por alumno, grupo, comparación opcional; PDF y CSV).
- Instructor: fallas registradas (3 fallos → falla; nunca se borra; «superada»), «Tu plan de refuerzo» arriba en Inicio, «Lo que hicimos por ti», plan al reprobar (en qué falló, qué estudiar, YouTube curado o búsqueda, volver a tomar el examen). Todo orientado al Test Guide.
- IA: 20 min gratis por alumno (configurable), compra por transferencia Banco Popular con comprobante y aprobación en Admin → Pagos; guía para conectar Claude/ChatGPT con «Probar conexión»; «Ver cómo trabaja»; comparación Básico vs Con IA; «Profesor virtual» (chat de pago) que conoce sus fallas y recomienda videos (sin enlaces inventados).
- Video: más claro; la imagen se queda mientras habla la voz (voz a velocidad normal).
- Interfaz: foto real de avión de fondo, más profesional; clases más visuales e interactivas (sin minijuegos).
- Test Guide: auditoría completa de las 748 preguntas e imágenes.
- Futuro: «después otras preguntas porque quiero abarcar más» (preguntas fuera del Test Guide, marcadas aparte).
