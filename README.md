# OPORTIA (en construcción)

Plataforma de inteligencia de oportunidades comerciales y laborales. JARVIS fue retirado de este servidor el 3 de noviembre de 2026; su código completo está en la rama `jarvis-archivo`.

## Cómo se actualiza el servidor (léelo antes de cambiar algo)
- Un servidor de DigitalOcean revisa la rama `main` cada 30 minutos (`/usr/local/bin/jarvis-actualizar`, ver `deploy/cloud-init.sh`).
- Descarga `main`, corre `node --test test/*.test.js` (si una prueba falla, NO instala esa versión) y copia solo `src/`, `public/`, `deploy/` y `package.json` a `/opt/jarvis`.
- Reinicia el servicio `jarvis` (`node --no-warnings src/server.js`, usuario `jarvis`, solo puede escribir en `/var/lib/jarvis`).
- Después de reiniciar, `http://127.0.0.1:8080/api/setup` debe responder en el primer minuto; si no, vuelve sola a la versión anterior. Si falla más tarde, no vuelve sola.
- Desde la parte 1c, durante los primeros 90 segundos `/api/setup` responde 503 «arrancando» hasta que el trabajo automático
  avisa que está listo. Si una versión nueva trae un trabajador que no arranca, sigue en 503 y el actualizador vuelve solo a la
  versión anterior. Se vuelve atrás el CÓDIGO, nunca los datos.
- `/api/setup` muestra la versión de `package.json`: así se sabe qué versión quedó instalada.
- Las claves de API están en `/var/lib/jarvis/secrets.env` (nunca en GitHub: este repositorio es público).

## Reglas que no se rompen
- **Nunca revertir `main` a una versión anterior a la 0.0.2.** Las versiones anteriores borraban `/var/lib/jarvis` al arrancar.
- El programa nunca borra archivos de datos, solo usa módulos de Node (no hay `npm install` en el servidor) y no importa nada fuera de `src/`. `test/reglas.test.js` lo comprueba.
- Las pruebas corren en el servidor real, como root y con la app funcionando: no usan internet, no tocan `/var/lib/jarvis`, no usan el puerto 8080 y están todas en `test/` sin subcarpetas.
- Un cambio por cada ventana de 30 minutos.

## Ramas
- `main`: lo que instala el servidor. Solo se actualiza con autorización del dueño.
- `desarrollo`: donde se trabaja y se prueba. GitHub corre las pruebas en cada cambio (Node 22 y 24).
- `respaldo/antes-de-oportia`: copia exacta de `main` antes de empezar OPORTIA, solo para consultar. **NUNCA restaurarla en `main`**: esa versión borra `/var/lib/jarvis` al arrancar.
- `publicar/parte-1`: lo que se publicó en `main` en la fase 0, parte 1.
- `jarvis-archivo`: el código viejo de JARVIS. No se usa.

## Datos en el servidor
- OPORTIA usa solo su archivo `/var/lib/jarvis/oportia.db` y su carpeta `/var/lib/jarvis/oportia-copias/`.
- Nunca abre, cambia ni borra `jarvis.db`, `secrets.env`, `version.txt`, `update.log` ni ningún otro archivo.
- Antes de cada cambio de la base se guarda una copia completa en `oportia-copias/`.

## Recuperar el acceso de administrador
En la Consola de DigitalOcean (nunca como root, para no dañar los permisos de la base):

    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs

Muestra una contraseña temporal para el primer administrador (o crea uno si no existe), cierra sus sesiones y quita
cualquier bloqueo por intentos fallidos. Para un nombre concreto:
`sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs junior`.

Bloqueos por contraseñas malas: 5 fallos desde un mismo lugar bloquean ese lugar 15 minutos; 20 fallos desde internet
(sumando todos los lugares) frenan a internet 15 minutos. Quien entra por Tailscale nunca queda frenado por lo que
hagan otros, así que desde tus equipos con Tailscale siempre puedes entrar.

## Dos procesos, un servicio (fase 1, parte c)
El servicio `jarvis` sigue siendo uno solo (`node --no-warnings src/server.js`), pero adentro corren dos programas:
- **Las pantallas** (`src/server.js`): abren el puerto primero y, solo cuando lo tienen, encienden UN trabajador.
- **El trabajador** (`src/tareas/trabajador.js`): hace las tareas de la fila, día y noche, con menos prioridad
  (`nice 10` en todos sus hilos) y con poca memoria permitida (64 MB de heap). Si se traba o se cae, las pantallas siguen
  funcionando y `src/tareas/supervisor.js` lo vuelve a encender solo, esperando cada vez un poco más.
- Los dos usan la misma base (`oportia.db`, en modo WAL). Toda escritura del trabajador pasa por el «escritor», que hace
  una pausa después de cada una para que las pantallas nunca esperen.
- **Modo seguro**: si el trabajador se cae 5 veces en 15 minutos, si OPORTIA se apaga mal 3 veces en 30 minutos, si no
  puede abrir la base o si la revisión de la base encuentra un problema, el trabajo automático queda en pausa y lo dice en
  Administrador (y arriba en Inicio). Las pantallas siguen funcionando y no se borra nada: lo que está en la fila espera.
  Las causas que un código nuevo puede arreglar se quitan solas UNA vez al instalar código nuevo; el modo seguro puesto a
  mano y el de base dañada solo los quita una persona.
- **Nunca pongas `KillMode=process` en el servicio.** Con el valor normal (`control-group`) systemd apaga los dos procesos
  juntos; con `process` el trabajador podría quedar vivo y huérfano.
- Para ver los dos procesos en el servidor (solo mirar): `systemd-cgls -u jarvis.service`.

### Reglas para escribir trabajos nuevos (`src/tareas/manejadores.js`)
- Cada `ctx.escribir(fn)` es una escritura CORTA (lotes de 200 filas o menos, con `ctx.ceder()` entre lotes). Una
  escritura larga congela las pantallas mientras dura.
- Nunca `await` dentro de una transacción (el código lo rechaza).
- Respetar `ctx.senal`: cuando se pide parar, el paso termina pronto.
- Cada paso se puede repetir sin daño (idempotente): un corte de luz o un reinicio pueden hacer que corra dos veces.
- Todo lo que MANDA algo (correos, mensajes) va con `repetible: false`: si se interrumpe, se corta por tiempo o falla con
  un error cualquiera, queda «por revisar» y nunca se manda dos veces solo. Solo vuelve a la fila si el trabajo lanza un
  `ErrorTarea` (por ejemplo `sin_red`), que quiere decir «sé seguro que no salió nada».
- Lo que devuelve un paso (resultado o punto) tiene que ser JSON normal: un BigInt o un objeto que se contiene a sí mismo
  deja la tarea «fallida» con `respuesta_no_valida`.
- Un tipo nuevo se registra en `src/tareas/tipos.js` (solo datos) y su trabajo en `src/tareas/manejadores.js`; los tipos de
  prueba viven en `test/tareas-prueba.js`, nunca en `src/`.

### Modo seguro desde la consola (cuando las pantallas no abren)
En la Consola de DigitalOcean:

    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --modo-seguro=si
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --modo-seguro=no

El primero pone en pausa el trabajo automático; el segundo lo vuelve a encender. El servicio que está corriendo lo aplica
en menos de 30 segundos, sin reiniciar. Queda en la auditoría como «consola».

## Estado
- Fase 0 (completa): ya no se borra nada, base de datos propia, entrada solo por el enlace https de Tailscale o por la red Tailscale.
- Fase 1, parte a: cuentas. El primer administrador solo se crea desde Tailscale; contraseñas con scrypt; sesiones en galletas
  HttpOnly; candados contra intentos; protección contra pedidos falsos; español e inglés; administración de usuarios;
  herramienta de rescate del acceso.
- Fase 1, parte b (versión 0.2.0, cambio de base 3): proyectos. Cada cuenta escribe lo que necesita con sus palabras; el motor propio (`src/motor/`, sin IA)
  entiende sectores, las 32 provincias con sus municipios, distritos municipales conocidos y regiones (Cibao, Este, Sur…),
  producto o empleo, salario, exclusiones y negaciones («pero no», «ni», «que no sea»…), prioridades y frecuencia. Lo que no
  entiende lo pregunta (dudas), y mientras haya dudas no se puede aprobar. «Contactar» nunca se enciende solo. Nada trabaja hasta que se aprueba. Cada cambio crea una versión nueva que espera aprobación
  mientras la anterior sigue en uso. Estados, las 7 capacidades, historial y papelera (no se borra nada).
  - Cada versión guarda su nivel de autonomía (por defecto «todo lo que sale espera tu aprobación»; también «trabaja solo con
    la frecuencia aprobada y te avisa» y «solo cuando yo lo pida», que va con la frecuencia manual). Contactar a alguien
    siempre necesita el «sí» del dueño, en cualquier nivel. También guarda la IA: no permitida, tope US$0 y costo estimado
    US$0; la IA llega en la parte 1d, y encenderla será un cambio que espera aprobación.
  - Planes: una cuenta nueva («prueba») tiene 1 proyecto en uso; el administrador tiene 20 y puede darle a cada cuenta
    «pago» (5) o «empresarial» (20) con `POST /api/admin/usuarios/:id/plan` (queda en la auditoría y nunca baja de los
    proyectos que la cuenta ya tiene en uso).
  - Topes para cuidar el servidor, sin borrar nada: proyectos guardados por espacio (en uso + papelera: el triple del plan,
    mínimo 10), 100 versiones por proyecto, 24 KB por versión, y un tope de lecturas y de cambios por persona. El motor no
    trabaja si el pedido no se va a poder guardar. El detalle de un proyecto trae completas solo la versión en uso, la que
    espera y las 3 últimas; las demás se abren con `GET /api/proyectos/:id/versiones/:numero`.
  - Roles: el editor crea, cambia, aprueba, rechaza, pausa y reanuda; solo el dueño manda a la papelera, restaura, completa
    y reabre. Mandar a la papelera algo que trabaja lo pausa (queda en el historial) y al restaurarlo vuelve pausado.
  - Si el administrador reinicia la contraseña de alguien, esa persona lo ve al entrar («El administrador reinició tu
    contraseña el …») y la lista queda en Configuración (`GET /api/yo/reinicios`). Con la contraseña temporal el aviso no
    se puede marcar como visto, y cada aviso nuevo muestra también los reinicios de los últimos 90 días (vistos o no): quien
    entre con una contraseña reiniciada no puede esconderle el aviso a la dueña de la cuenta.
  - Contraseñas obvias: además de la lista, se rechazan con números o signos alrededor («password123», «Oportia2026»),
    series («123321», «102030»), filas del teclado («qwerty1», «1q2w3e»), repeticiones («abcabc», «111222») y palabras
    comunes en RD («teamo», «dominicana», «santiago»…). El mínimo sigue siendo 6.
  - El nombre que OPORTIA le pone a un proyecto se muestra en el idioma de cada persona cuando sale del catálogo, y se guarda
    en el idioma en que se creó (aprobar en otro idioma no lo mezcla). Lo que la persona escribe con sus palabras no se traduce.
  - Solo se buscan negocios: si se pide buscar personas («maestros», «turistas», «familias»), se pregunta a qué negocios venderles.
  - Un proyecto aprobado se ve como «Aprobado · espera la fase 2» (o la 6, si busca empleo) hasta que existan esas fases.
  - Buscar de verdad empieza en la fase 2 (clientes) y en la fase 6 (empleos); elegir fuentes y el tipo de análisis
    llegan en la fase 2.
  - Pantallas: «Lo que entendí» dice antes de aprobar que la búsqueda empieza en la fase 2 o 6; las dudas del motor se
    muestran y bloquean «Aprobar» hasta responderlas; «Volver a entender» avisa si reemplaza cambios hechos a mano y
    cualquier versión que no quedó en uso se puede volver a usar (`modo: 'version'`); si algo cambió en otro equipo, el
    proyecto se vuelve a cargar solo; si la sesión termina, al entrar otra vez vuelve al mismo lugar con lo escrito.
  - Tema claro (por defecto), oscuro o automático en Configuración, guardado en el navegador (`public/tema.js`).
  - Contraseñas: al menos 6 caracteres y nada obvio (123456, qwerty, contraseña, el nombre de la persona…).
  - Crear usuario: el administrador escribe el nombre completo y la pantalla propone el usuario (Juan Pérez → juan.perez,
    juan.perez2 si ya existe); el nombre completo queda como nombre visible.
  Toda consulta lleva el espacio de quien pregunta: una cuenta nunca ve proyectos de otra, ni siquiera el administrador
  (`test/proyectos.test.js`). Cada espacio numera sus proyectos desde 1, así nadie puede contar los de otras cuentas.

- Fase 1, parte c (versión 0.3.0, cambio de base 4): trabajo automático 24 horas en un proceso aparte (ver «Dos procesos,
  un servicio»). Fila de tareas con pasos que se pueden retomar, turnos justos por tiempo (primero entre cuentas y luego
  entre proyectos), reintentos a 1 y 4 minutos, frenos por tipo que se sueltan solos, modo seguro y puerta de arranque.
  - Lo que hace de verdad por ahora: revisa la fila cada hora (a las :07, hora de RD) y revisa y ordena la base cada
    madrugada (4:10). Las pantallas toman una muestra de salud por hora (memoria, disco, base, carga y lo que tardan),
    también en modo seguro.
  - Los proyectos todavía NO crean tareas: empiezan con la búsqueda de clientes (fase 2), y las pantallas lo dicen así.
    La pantalla «Tareas» para cada cuenta también llega en la fase 2 (hoy estaría vacía).
  - Administrador tiene arriba el «Estado del sistema»: tarjetas de colores (verde bien, amarillo mirar, rojo grave) para el
    trabajo automático, el servidor, los avisos y las tareas con error; se actualiza sola cada 30 s sin borrar lo que se
    está escribiendo. Debajo: los avisos con «Entendido», el trabajo automático (qué hace, contadores, próximas
    ejecuciones, errores recientes con «Reintentar» y «Cancelar», la fila completa y cómo terminó las últimas 5 veces), el
    botón del modo seguro (con confirmación) y la salud del servidor con las últimas 24 muestras.
  - Inicio muestra al administrador el estado en una línea, y una tarjeta roja si el modo seguro está activo o hay un aviso
    grave sin ver.
  - Los avisos solo se ven en Administrador; por Telegram llegan en la parte e (la tabla `avisos` ya guarda cuántas veces
    pasó, la primera y la última vez, el detalle y si ya se mandó).
  - API del administrador: `GET /api/admin/sistema`, `GET /api/admin/tareas`, `POST /api/admin/modo-seguro`,
    `POST /api/admin/tareas/:id/reintentar`, `POST /api/admin/tareas/:id/cancelar` y `POST /api/admin/avisos/:id/visto`
    (30 acciones cada 10 minutos). De las tareas de proyectos el administrador nunca ve datos ni resultados.

- Pase visual (versión 0.3.1, sin cambio de base ni del servidor): se ve más claro y se escribe menos.
  - «Nuevo proyecto» se arma tocando: qué quieres (vender o buscar empleo; comprar dice «Próximamente»), qué vendes o qué
    empleo (el único campo para escribir, con sugerencias para tocar), a qué negocios, dónde (todo el país, provincias o
    regiones), tamaño o salario mínimo, y cada cuánto. `public/creador.js` lo convierte en una frase sencilla que se ve
    antes de crear y va por el mismo camino que el texto libre (lo que entendí, dudas, aprobación, versiones, 4000 letras).
    «Escribirlo con mis palabras» sigue igual, y en cada proyecto está «Cambiar tocando». `test/motor.test.js` comprueba
    que cada toque y miles de combinaciones se entienden sin dudas, en español y en inglés.
  - El estado de cada proyecto se ve siempre en color y con ícono (borrador, pendiente, aprobado · espera la fase 2,
    pausado, completado, con errores, papelera) junto con el «Siguiente paso».
  - Menú de abajo con íconos en el iPhone (arriba en la Mac), logo nuevo (`icono.svg` e `icono-180.png`), colores para
    claro y oscuro, cuadros de texto grandes que crecen, y todo lo que se toca mide al menos 44 puntos.
- Pase visual 2 (versión 0.3.2, sin cambio de base): los proyectos con dibujos propios (`public/dibujos.js`: un ícono por negocio, mapa de casillas de las 32 provincias que también se toca en el creador, pista de pasos con la fase de cada uno) y poco texto; lo largo queda en «Ver en palabras». La lista de proyectos trae un `vistazo` corto (negocios y lugares).
- Rapidez (versión 0.3.3, sin cambio de base): por Funnel en el teléfono, volver a abrir OPORTIA pasa de unos 4 s a 1,1-1,2 s (de 6 s a 1,8 s con una red lenta; unos 0,6 s si la conexión sigue abierta) y la primera vez de 4 s a 1,7-2,2 s. Los archivos van comprimidos, con ETag y su huella `?v=` (index.html se revisa siempre: una actualización se ve al instante), y al abrir se pide a la vez lo que necesita la pantalla. Inicio ya no falla al abrir con proyectos esperando aprobación.

Plan completo: «OPORTIA: arquitectura y plan» y «OPORTIA: evaluación y plan ampliado».
