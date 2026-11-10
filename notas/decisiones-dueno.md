# Decisiones de Junior (dueño) — guardar siempre

- 2026-11-04 12:30 UTC: "Sí, publica tú (Recomendado)". Autorización permanente para publicar a main cada parte (1b, 1c, 1d, 1e, 1f)
  SOLO cuando pase todas las pruebas y la revisión. Avisarle DESPUÉS de cada publicación (resumen corto).
  Pagos, servicios de pago y acceso a sus cuentas: preguntar SIEMPRE antes.
- 2026-11-04: "hazme todo tú, sin depender tanto en mí, mantienes todo el plan, solo dime lo muy necesario".
  Mensajes cortos. Nada de tareas opcionales para él.
- Su cuenta de administrador se llama Junior (entró y funciona). Servidor con 0.1.0 instalada (base versión 2).
- Parte 1b: autonomía 3 niveles (por defecto el más seguro); IA guardada por versión "no permitida, tope US$0";
  fuentes y tipo de análisis "Próximamente (fase 2)"; cuentas nuevas 1 proyecto.
- Parte 1c: la pantalla de Tareas para el usuario pasa a la fase 2.

## Rol y revisión diaria (pedido de Junior, 4 nov 2026)
Claude es su programador experto y quien mantiene y revisa el software, CON TODO EL PERMISO para revisar, corregir, mejorar y publicar (si pasan pruebas y revisión; pagos y sus cuentas: preguntar siempre).
Quiere un lugar de ERRORES que se revise TODOS LOS DÍAS. Plan:
1. OPORTIA guarda cada error en su base (tabla de avisos/errores de la 1c) y lo muestra en Administrador.
2. Un informe diario de errores solo para el mantenimiento: un enlace solo de admin por el enlace https con una clave larga guardada como secreto del entorno de la nube (nunca en GitHub), sin datos privados de usuarios.
3. Una tarea programada diaria (sesión en la nube) que lee el informe, revisa el código, corrige, prueba y publica, y le manda un resumen corto.
NO activarla todavía: Junior dice que se habla cuando TODO el proyecto esté listo (solo lo dejó anotado para no olvidarlo). Cada día gasta crédito de Claude: decirle antes cuánto.
Idea de Junior para la revisión: apartado «Errores» SOLO para el admin; cada error con qué pasó, cuántas veces, la propuesta de arreglo de Claude y su estado (pendiente / arreglado en versión X / descartado). Los errores se juntan y Claude los revisa TODOS JUNTOS una vez al día (los que lleguen después esperan al día siguiente) para gastar poco crédito. Recomendado: el mismo error repetido cuenta como uno con contador; si no hay errores nuevos la revisión termina enseguida (casi sin gasto); los graves (servidor caído, riesgo de datos) avisan al momento por Telegram; cuando todo esté estable, pasar a una vez por semana.
Más pedidos de Junior: cada revisión diaria le deja un RESUMEN del día en sencillo: por qué pasó cada error, si se corrigió y qué se hizo. Y DETECTAR FALTA DE CRÉDITO: si la clave de IA se queda sin saldo (la API responde que no hay crédito), OPORTIA sigue con su motor propio y le avisa al momento (Administrador + Telegram); si un día no llega la revisión diaria de Claude, también avisa. Avisos al 50/80/100% de cada tope. Recordarle: la API de Claude se paga aparte (console.anthropic.com), no es el mismo crédito de este chat.
Cambios de cuentas pedidos por Junior (para la próxima versión): contraseña mínima de 6 caracteres (no más), bloqueando las obvias (123456, 111111, abcdef, su propio nombre…); usuarios con nombre y apellido: el admin escribe «Juan Pérez» y el sistema propone el usuario «juan.perez» (si ya existe, «juan.perez2»); el nombre visible guarda acentos. El restablecer clave del admin ya existe (clave temporal + cambio obligatorio al entrar): explicárselo en la pantalla. Si la IA se apaga o se queda sin saldo, todo sigue con el motor propio.
Pantallas (pedido de Junior): que se vean simples pero tecnológicas y todo claro; empezar en CLARO (blanco) por defecto y en Configuración un selector de tema Claro / Oscuro / Automático guardado por usuario. Hacer una pasada de diseño (logo, colores, tipografía, iconos) sin perder claridad.
- 2026-11-05: "Sí" a ir más rápido: revisión COMPLETA (ataques + 2 revisores, intensidad alta + ultracode) solo en lo delicado (datos, seguridad, motor, servidor); en pantallas, UNA revisión corta (intensidad media, sin ultracode). Aplicado primero a la pasada visual 0.3.1.
- 2026-11-10: "Puedes ir mejorando según lo que creas, no debes seguir al pie de la letra; tú eres el experto, puedes ver qué cambiar o qué sería mejor en el transcurso." Permiso permanente para MEJORAR, AÑADIR y REORDENAR por criterio propio sin preguntar (y pensar las cosas antes que él). Siguen en pie: no QUITAR ni simplificar funciones de su visión sin consultarle, preguntar antes de pagos/servicios de pago y de tocar sus cuentas o el servidor a mano, no borrar datos, probar antes de publicar, avisarle después de cada publicación en corto.
- 2026-11-10: sus metas para las fases 2-5 (análisis profundo, vendedor con IA, catálogo de lo posible, cobro mensual por consumo, tono claro y humano) están en notas/CONTINUAR.md.
- 2026-11-10: "Usa todos los agentes que necesites en cada fase, sin límite y sin preguntarme." Permiso permanente (con ultracode encendido) para trabajos con muchos agentes en paralelo. Modo «director»: el modelo fuerte en lo difícil/delicado (diseño, seguridad, datos, dinero, revisión final); modelos sencillos (haiku/sonnet) en lo simple (textos, traducciones, pantallas, capturas, pruebas, búsquedas). Consejero (advisor) Fable 5.2 activo: consultarlo antes de planes grandes y antes de dar algo por terminado.
