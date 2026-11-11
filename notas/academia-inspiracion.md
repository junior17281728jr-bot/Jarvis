# Academia de estudio de aviación privada: inspiración y plan de mejora de diseño

Fecha: 2026-11-11. Documento de investigación y plan para la app (español, móvil primero, camino de 11 materias, examen escrito Private Pilot).

## 0. Cómo leer este documento y límites de la investigación

- Solo se pudo usar WebSearch (resúmenes). WebFetch falló: los sitios `rotatepilot.com`, `uxplanet.org` y `appshunter.io` no están permitidos en la red de esta sesión (hay que permitirlos si se quiere profundizar).
- Marco cada afirmación como **[Fuente]** (respaldada por una fuente enlazada), **[Conocimiento]** (patrón de diseño conocido, no verificado en esta sesión; confirmar en una pasada con la app abierta) o **[Anecdótico]** (reseñas/blogs, muchos con afiliación comercial).
- Casi no hubo datos fiables sobre Dauntless, FlyingAce, Rod Machado y Sheppard Air. No invento detalles: se indican como "sin datos".
- Solo se extraen PATRONES. Nada de marcas, mascotas, ilustraciones ni textos de terceros.

## 1. Hallazgos por producto

### 1.1 Duolingo (camino, rachas, energía/corazones, ligas)
- **Camino lineal de nodos** que el alumno recorre hacia abajo; un solo "siguiente paso" evidente. Crítica: sacrifica elección por previsibilidad y se siente rígido. [Fuente: [Android Authority](https://www.androidauthority.com/duolingo-changes-i-want-to-see-3671847/), [resumen 2026](https://www.myengineeringbuddy.com/blog/duolingo-reviews-pricing-alternatives-2026/)]
- **Corazones -> energía (jul. 2025):** los usuarios gratuitos pasaron de perder vidas solo al fallar a gastar energía en cada ejercicio; generó quejas porque cambió la psicología del progreso gratuito. Lección: penalizar el fallo motiva; penalizar el intento frustra. [Fuente: [Android Authority](https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/)]
- **Racha, XP y ligas:** un ex suscriptor dice que se obsesionó con mantener la racha y ganar XP más que con aprender; otro dice que las ligas le ascendían a grupos más activos y dejó de importarle. Riesgo: gamificación que sustituye al aprendizaje. [Fuente: [PCWorld](https://www.pcworld.com/article/2924235/duolingo-got-easier-when-i-paid-for-it-that-was-the-problem.html), [Geekchamp](https://geekchamp.com/?p=244717)]
- **Repaso:** incluso las lecciones de repaso traen palabras/conceptos de unidades nuevas en vez de centrarse en lo actual (queja de desajuste). [Fuente: resumen de búsqueda]
- **Sugerencia de UX:** que los corazones se rellenen a medianoche igual que la racha se reinicia (consistencia de reglas). [Fuente: [UX Planet](https://uxplanet.org/duolingo-ux-breakdown-1-year-of-daily-use-a290f461de2d) (resumen)]
- Patrones conocidos [Conocimiento]: tarjeta de feedback que sube desde abajo con color verde/rojo y sonido breve; barra de progreso superior; celebración de fin de lección con XP; "repasar errores" para ganar corazones; ejercicios cortos (5-10 por lección); un único botón grande y de color fuerte "Comprobar/Continuar".

### 1.2 Brilliant (lecciones interactivas)
- Lecciones **sin vídeo**: el alumno manipula elementos en pantalla (deslizadores, arrastrar) antes de ver la regla; los usuarios afirman que así el concepto "se queda". Limitación: no hay editor de código real en CS. [Fuente: [Headway](https://makeheadway.com/blog/brilliant-review/), [Nibble](https://nibble-app.com/blog/is-brilliant-worth-it), [ustwo](https://ustwo.com/work/brilliant)]
- La cifra "6x más efectivo" es afirmación de la propia empresa, no verificada. [Fuente: [brilliant.org](https://brilliant.org/llms.txt)]
- Patrón [Conocimiento]: predecir -> manipular -> ver consecuencia -> nombrar el concepto; pantalla oscura con elementos de color de alto contraste.

### 1.3 Khan Academy
- **Niveles de dominio por habilidad:** Intentado, Familiar, Competente, Dominado; cada uno con icono propio, visible en el camino, el panel y la pantalla de resultados; **pueden subir y bajar** según el rendimiento. El porcentaje de dominio del curso cuenta solo Competente + Dominado. [Fuente: [Khan soporte](https://support.khanacademy.org/hc/bg/articles/5548760867853), [porcentaje](https://support.khanacademy.org/hc/en-us/articles/48411237993357-How-is-my-mastery-percentage-calculated), [blog "skills to proficient"](https://blog.khanacademy.org/?p=13201)]
- Patrón útil: "dominio" es más honesto que "completado".

### 1.4 Quizlet
- Modo **Aprender** adaptativo: empieza con formatos fáciles (opción múltiple) y pasa a respuestas escritas según familiaridad; está tras suscripción; mecanismo no documentado públicamente; un solo test de práctica gratis por set. [Fuente: [Quizlet ayuda](https://help.quizlet.com/hc/articles/360030986971), [MacMyths](https://macmyths.com/quizlet-for-studying-how-free-modes-build-active-recall/)]
- Patrón: escalera de dificultad dentro de una misma sesión (reconocer -> recordar).

### 1.5 Anki (repetición espaciada)
- FSRS permite menos repasos para la misma retención; el usuario fija "retención deseada". [Fuente: [FAQ Anki](https://faqs.ankiweb.net/what-spaced-repetition-algorithm)]
- Quejas: interfaz anticuada y poco intuitiva; mal uso del botón "Difícil" (~10% de usuarios FSRS); mucha gente cree que intervalos extremos son "una rareza" por no entender el parámetro; FSRS deja cada tarjeta "difícil pero posible", y algunos sienten que no progresan. [Fuente: [Nibble](https://nibble-app.com/blog/anki-review), [foro Anki](https://forums.ankiweb.net/t/how-to-prevent-users-from-misusing-hard-ideas-are-welcome/49092?page=8), [HN](https://hn.svelte.dev/item/44790422)]
- Lección: oculta el algoritmo; ofrece 2 botones claros (lo sabía / no lo sabía) y muestra progreso visible para que la dificultad "justa" no se sienta como estancamiento.

### 1.6 Kahoot / Quizizz / Blooket
- La **variedad de modos** sostiene el interés; repetir el mismo estilo lo mata. Blooket destaca por variedad; Quizizz criticado por poca variedad y por pedir cuenta (fricción); Kahoot, interfaz limpia pero modos más tipo "timbre". Estudios: puntos/insignias/clasificaciones aumentan engagement, pero la evidencia por modo es escasa. Fuentes sobre todo comerciales. [Anecdótico: [Nibble Blooket vs Quizizz](https://nibble-app.com/blog/blooket-vs-quizizz), [TriviaMaker](https://triviamaker.com/blooket-vs-gimkit-vs-kahoot/), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9946286), [Mission.io](https://mission.io/blog/kahoot-alternatives)]
- Patrones conocidos [Conocimiento]: unirse con código/PIN sin registro, lobby con nombres que van apareciendo, cuenta atrás, puntos por rapidez, podio final, clasificación entre preguntas.

### 1.7 Apps de aviación (King, Sporty's, Gleim, ASA Prepware, Pilot Institute, Sheppard, etc.)
- **Sporty's Test Prep:** tarjetas + exámenes de práctica; explicaciones firmadas por instructores; un usuario critica que guardar una pregunta lo devolvía al inicio del examen (pérdida de flujo). [Anecdótico: [App Store](https://apps.apple.com/us/app/id414141811), [reseñas](https://appshunter.io/ios/app/414141811/reviews/3)]
- **ASA Prepware:** afirma que figuras, leyendas y cartas a color coinciden con las del centro de examen; una reseña se queja de no poder crear un banco de "preguntas difíciles". [Fuente: [ASA](https://asa2fly.com/2025-2026-private-pilot-test-prep-with-prepware-software), [App Store](https://apps.apple.com/app/id334278376)]
- **King Schools:** vídeo con estilo propio de los presentadores; algunos lo ven anticuado; app compañera gratuita muy bien valorada. [Anecdótico: [Flying Mag](https://www.flyingmag.com/top-online-private-pilot-ground-schools/)]
- **Pilot Institute:** vídeos cortos, se vende por "comprensión, no memorización" y **garantía de aprobado** (reembolso + 175 USD si no se aprueba a la primera). [Anecdótico: [comparativa](https://studentpilotresource.pages.dev/ground-school-comparison.html)]
- **Gleim:** libro + banco de preguntas, vídeo poco desarrollado, precio bajo. [Anecdótico, misma comparativa]
- **Sheppard Air:** señalada como enfoque de memorización de patrones. Sin datos de UX. [Anecdótico]
- **Rod Machado, Dauntless, FlyingAce:** sin datos fiables recuperados. **No afirmo nada.**
- Conclusión transversal: el hueco del mercado es unir **banco de preguntas fiel** (lo que se examina) con **comprensión** (lo que evita el "memorizar y olvidar"), y dar una **señal honesta de preparación**. Reseñas indican que muchos combinan una app de preguntas con otro recurso para entender. [Anecdótico]

## 2. Patrones transversales que importan

1. Un único "siguiente paso" evidente (camino) + libertad para practicar fuera de él.
2. Feedback inmediato, corto y emocionalmente claro (color, sonido, movimiento sobrio).
3. Dominio medible y reversible (Khan) en vez de "completado".
4. Interactuar antes de leer la regla (Brilliant).
5. Escalera de dificultad dentro de la sesión (Quizlet).
6. Espaciado invisible: el algoritmo no se explica, el beneficio sí (Anki).
7. Variedad de modos sociales; entrada sin fricción (Kahoot/Blooket/Quizizz).
8. Riesgos: castigar el intento (energía), gamificar sobre aprender (racha/XP/ligas), paywall que rompe el flujo, interfaz de examen que pierde el progreso.

## 3. Identidad propia: dirección visual

- **Paleta:** azul cielo (`#38A9E8` aprox.) para acciones y camino; fondos "cabina" oscuros (`#0F1720`-`#16222E`) para exámenes, simulacros y modo cabina; acento naranja (`#FF8A1F`) para llamada a la acción, rachas y alertas suaves; verde "aprobado" y ámbar/rojo "cautela/alerta" como luces de panel. Modo claro y oscuro.
- **Metáfora:** vuelo y cabina: materias = "tramos" o "etapas" de un plan de vuelo; nodos = waypoints; racha = "horas de vuelo seguidas"; puntos = "horas/millas"; fallos = "desviación de ruta", no "error".
- **Tipografía:** sans redondeada legible para texto; monoespaciada/segmentada solo para instrumentos (readiness, contadores).
- **Tono en español:** cercano, sin tecnicismos; siempre dar la palabra técnica junto a su explicación sencilla (p. ej. "pérdida de sustentación (stall)").

## 4. Plan de mejora priorizado (22 cambios)

Leyenda: Prioridad P1 (hacer ya) / P2 / P3. Esfuerzo S (días) / M (1-2 semanas) / L (varias semanas).

### P1: núcleo pedagógico y de confianza

**1. Medidor de preparación por materia basado en el Test Guide ("Altímetro de dominio")** (M)
- Qué: cada materia muestra un indicador 0-100% calculado por tema del Test Guide (peso del tema x aciertos recientes x antigüedad). Se agrega en un medidor global "Listo para el examen".
- Por qué: Khan (niveles reversibles, solo cuenta Competente+) y el hueco del mercado: señal honesta de preparación; Pilot Institute vende confianza con garantía, lo que demuestra que esa es la ansiedad principal.
- Móvil: arco semicircular tipo altímetro en la cabecera de cada materia; PC: panel de 11 altímetros pequeños en rejilla. Bajo el 70% naranja, 70-89% azul, 90%+ verde. Texto: "Faltan 3 temas para estar listo".
- Matiz: etiquetar como "estimación", no promesa de aprobar.

**2. Cuatro niveles de dominio por tema con iconos propios, que suben y bajan** (S)
- Por qué: Khan (Intentado/Familiar/Competente/Dominado).
- Qué: "En tierra -> Rodando -> En el aire -> Crucero". Iconos de avión simples en los nodos del camino.
- Móvil y PC: el nodo cambia de forma/color; el repaso espaciado puede bajar un nivel (con aviso amable).

**3. Repaso por concepto errado ("Repaso por malentendidos")** (L)
- Qué: etiquetar cada distractor (respuesta incorrecta) del Test Guide con el malentendido que representa (p. ej. "confunde velocidad indicada con velocidad verdadera"). Al fallar, el repaso trae preguntas distintas que atacan ese malentendido, no la misma pregunta.
- Por qué: ningún competidor lo hace; Duolingo se critica por repasos poco enfocados; Sheppard se critica por memorización de patrones.
- Móvil: tarjeta tras el error: "Parece que confundiste X con Y" + mini-explicación + 2 preguntas gemelas. PC: panel lateral con el mapa de malentendidos del alumno.
- Nota: la etiquetación se puede hacer con ayuda de IA y revisión humana; mantener el texto oficial de la pregunta verbatim.

**4. Retroalimentación en 3 capas ante un error** (S)
- Qué: (1) por qué tu respuesta era tentadora, (2) por qué la correcta es correcta, en una frase, (3) "Ver explicación sencilla / ver figura animada". Botón "No lo entendí" que cambia de ángulo (otra explicación, no la misma repetida).
- Por qué: reseñas de Sporty's valoran explicaciones de instructores; tu requisito de re-explicación al fallar el 90%.
- Móvil: hoja inferior que sube; PC: panel derecho fijo con la pregunta a la izquierda.

**5. Simulador de pantalla de examen real con figuras fieles y zoom** (M)
- Por qué: ASA destaca figuras idénticas al centro de examen. Un alumno no técnico se bloquea con figuras diminutas en el móvil.
- Móvil: figura ancha con pellizcar para zoom y botón "ver a pantalla completa" en horizontal; PC: figura fija a la izquierda, pregunta a la derecha. Reglas/transportador virtual para figuras de cartas (opcional, L).

**6. Guardado fluido y "marcar para después" sin perder el sitio** (S)
- Por qué: queja de Sporty's (guardar te devolvía al inicio); ASA (no hay banco de difíciles).
- Qué: marcar pregunta con bandera sin salir; "Mis difíciles" se llena solo con las falladas 2+ veces.

**7. Espaciado invisible con dos botones y progreso visible** (M)
- Por qué: Anki: el UI complejo y el mal uso de "Difícil"; sensación de estancamiento con FSRS.
- Qué: tras responder, solo "Lo sabía / No lo sabía"; el sistema decide. Panel "Hoy: 12 repasos (~5 min)" y gráfico "Lo que ya dominas" que crece para evitar la sensación de estancamiento. No mostrar parámetros.

### P1/P2: motivación sana

**8. Racha con "perdón de vuelo" (días de gracia) en lugar de castigo** (S)
- Por qué: Duolingo, quejas por obsesión con la racha y por energía; regla coherente (reinicio a medianoche).
- Qué: 1-2 "días de viento en contra" al mes que protegen la racha; la racha cuenta "minutos con intención" (3 min) y no solo abrir la app.
- Móvil: llama/estela naranja en cabecera; PC: calendario mensual tipo bitácora de vuelo.

**9. Sin castigos por intentar: "combustible" solo como motivación, nunca como muro** (S)
- Por qué: la migración corazones->energía generó rechazo. Para un examen de pago único, no bloquear la práctica.
- Qué: no limitar intentos; el fallo solo cuenta para repaso. Si se quiere sistema de vidas, usar "margen de error" visible en simulacros, sin bloquear.

**10. Puntos = "horas de vuelo" ligados a conductas de aprendizaje** (S)
- Por qué: gamificación puede sustituir al aprendizaje (reseñas Duolingo).
- Qué: más puntos por repasar errores y subir de nivel un tema que por repetir lo fácil; tope diario para que "grindear" no pague.

**11. Ligas solo opcionales, por cohorte y a la medida** (M)
- Por qué: ascensos a grupos más activos desmotivan (Duolingo).
- Qué: ligas semanales por grupo pequeño de similar actividad o del mismo curso/profesor; opción de ocultar clasificación; se premia constancia, no solo volumen.

**12. Pantalla de cierre de lección con "resumen de vuelo"** (S)
- Qué: puntos, temas subidos de nivel, 1 malentendido corregido, siguiente paso sugerido. Animación breve de despegue/estela, sin confeti excesivo. 
- Móvil: tarjeta a pantalla completa con botón naranja "Seguir"; PC: modal central.

### P2: lecciones y escenarios

**13. Lecciones "primero toca, luego aprende" (estilo Brilliant) para ala/pérdida, motor e instrumentos** (L)
- Por qué: Brilliant (sin vídeo, manipular -> entender); tus lecciones narradas ya existen: añadir interacción.
- Qué: el alumno arrastra el ángulo de ataque y ve cómo cambia el flujo y se acerca la pérdida; la narración se activa al soltar; cada 30-45 s hay una micro-predicción ("¿qué pasará con la velocidad?").
- Móvil: animación arriba, control deslizante grande abajo, subtítulos siempre visibles (muchos estudian sin sonido); PC: animación grande + panel de datos.

**14. "Modo cabina" para simulacros** (M)
- Qué: pantalla oscura tipo panel con marcador de tiempo, contador de preguntas, "luces" de estado (verde/ámbar/rojo) y sin ayudas; al terminar, "debriefing" con mapa de errores.
- Por qué: reproduce la presión del examen; identidad visual propia; ningún competidor lo ofrece.
- Móvil: horizontal recomendado; PC: tres "instrumentos" (tiempo, avance, aciertos).

**15. Escenarios de decisión con consecuencias ramificadas y "revisión de la ruta"** (M)
- Qué: situaciones (meteorología, combustible, espacio aéreo); cada decisión ramifica; al final, se muestra la ruta tomada vs. la óptima y se enlazan los temas del Test Guide implicados.
- Por qué: unir comprensión con preguntas; contrarresta la etiqueta de "memorización".
- Móvil: tarjetas con 2-3 opciones grandes; PC: mapa de ruta lateral.

**16. Escenarios de tripulación en grupo ("Crew")** (L)
- Qué: 2-4 alumnos con roles (piloto al mando, copiloto, ATC, meteorología) que reciben información distinta y deben decidir juntos en tiempo real; puntuación por comunicación y decisión.
- Por qué: nadie en aviación-prep lo hace; refleja CRM real; extiende la carrera en vivo.
- Móvil: cada uno ve su "tarjeta de rol"; PC (profesor): vista de la cabina compartida.

### P2: social y administración

**17. Carrera de preguntas en vivo con entrada por código y varios modos** (M)
- Por qué: Kahoot/Blooket/Quizizz: variedad de modos mantiene interés; entrar sin registro baja fricción; Quizizz criticado por pedir cuenta.
- Qué: modos "Carrera" (puntos por rapidez), "Equipos" (suma de grupo), "Supervivencia" (el último en pie), "Sin prisa" (solo aciertos). Lobby con aviones que se alinean en la pista; podio final.
- Móvil: botones de respuesta de colores grandes; PC (proyector del profesor): pista con aviones avanzando.
- Cuidado: el modo rápido premia la velocidad; ofrecer variante "Sin prisa" para no favorecer la memorización por reflejo.

**18. Panel del administrador con "semáforo por alumno" y alertas accionables** (M)
- Qué: lista de alumnos con readiness, racha, tiempo, malentendidos principales; alertas ("lleva 6 días sin entrar", "estancado en Meteorología"); botón de "enviar ánimo/recordatorio".
- PC: tabla ordenable + vista de detalle; móvil: tarjetas.

### P3: pulido y diferenciadores

**19. Escalera de dificultad dentro de cada sesión** (S)
- Por qué: Quizlet Learn.
- Qué: la misma pregunta pasa de reconocer (opciones) -> completar -> explicar con palabras propias (autoevaluación). Mantener las preguntas del Test Guide verbatim en el tramo de examen.

**20. Barra de progreso y "siguiente paso" universal, con camino libre** (S)
- Por qué: Duolingo: el camino lineal es claro pero rígido.
- Qué: botón "Continuar" siempre visible; además "Práctica libre" por tema y "Salta si ya sabes" con mini-prueba de 5 preguntas.

**21. "Práctica inteligente" (hub) con 4 tarjetas** (S)
- Qué: Repasar errores · Preguntas difíciles · Repaso del día · Mini-simulacro de 10. Cada tarjeta indica duración estimada.
- Móvil: lista vertical; PC: 2x2. Evita decidir: una sugerencia destacada en naranja.

**22. Accesibilidad, bajo ancho de banda y modo sin conexión** (M)
- Qué: subtítulos por defecto en lecciones narradas, alto contraste, tamaño de texto ajustable, animaciones ligeras con opción "reducir movimiento", caché sin conexión de lecciones y cola de preguntas.
- Por qué: estudiantes en móvil y a ratos sueltos; el aprendizaje se interrumpe sin red.

## 5. Orden de ejecución sugerido

1. Sprint 1 (S): 2, 4, 6, 8, 9, 10, 12, 20, 21 (mejoras rápidas de retención y confianza).
2. Sprint 2-3 (M): 1, 5, 7, 14, 17, 18.
3. Sprint 4+ (L): 3, 13, 15, 16, 11, 19, 22.

## 6. Cómo medir si funcionan

- Retención D7/D30, sesiones por semana, % de repasos completados, tiempo hasta primera sesión.
- Calibración del medidor: correlación entre readiness y resultado en el examen final de 200 preguntas (y, cuando haya datos, el examen real); ajustar pesos.
- Prueba con 5-8 alumnos no técnicos en móvil: tarea "encuentra tu siguiente paso", "entiende por qué fallaste".

## 7. Fuentes consultadas (resúmenes de búsqueda)

- Duolingo: https://www.androidauthority.com/duolingo-changes-i-want-to-see-3671847/ · https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/ · https://www.pcworld.com/article/2924235/duolingo-got-easier-when-i-paid-for-it-that-was-the-problem.html · https://geekchamp.com/?p=244717 · https://www.myengineeringbuddy.com/blog/duolingo-reviews-pricing-alternatives-2026/ · https://uxplanet.org/duolingo-ux-breakdown-1-year-of-daily-use-a290f461de2d
- Brilliant: https://makeheadway.com/blog/brilliant-review/ · https://nibble-app.com/blog/is-brilliant-worth-it · https://ustwo.com/work/brilliant · https://brilliant.org/llms.txt
- Khan: https://support.khanacademy.org/hc/bg/articles/5548760867853 · https://support.khanacademy.org/hc/en-us/articles/48411237993357-How-is-my-mastery-percentage-calculated · https://blog.khanacademy.org/?p=13201
- Quizlet: https://help.quizlet.com/hc/articles/360030986971 · https://macmyths.com/quizlet-for-studying-how-free-modes-build-active-recall/
- Anki: https://faqs.ankiweb.net/what-spaced-repetition-algorithm · https://nibble-app.com/blog/anki-review · https://forums.ankiweb.net/t/how-to-prevent-users-from-misusing-hard-ideas-are-welcome/49092?page=8 · https://hn.svelte.dev/item/44790422
- Juegos de aula: https://nibble-app.com/blog/blooket-vs-quizizz · https://triviamaker.com/blooket-vs-gimkit-vs-kahoot/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC9946286 · https://mission.io/blog/kahoot-alternatives
- Aviación: https://apps.apple.com/us/app/id414141811 · https://apps.apple.com/app/id334278376 · https://asa2fly.com/2025-2026-private-pilot-test-prep-with-prepware-software · https://www.flyingmag.com/top-online-private-pilot-ground-schools/ · https://studentpilotresource.pages.dev/ground-school-comparison.html · https://rotatepilot.com/aviation-exam-prep-comparison (no accesible por red)

Nota: varias fuentes son de afiliación o competidores; verifique precios, garantías y cifras antes de citarlas externamente.
