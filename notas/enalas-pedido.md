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
