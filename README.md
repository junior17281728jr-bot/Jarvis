# Academia de Aviación (sobre OPORTIA)

Desde la versión 0.7.0 la app abre como **Academia de Aviación**: un profesor de aviación tipo Duolingo para el examen de piloto
privado (uso privado del dueño y sus amigos). Todo lo de OPORTIA sigue funcionando por debajo (cuentas, administrador,
servidor, copias, IA con topes, Telegram, ayuda). Desde la 0.8.0 los proyectos de OPORTIA ya no están (ver «Academia (etapa 1)»).

Antes: plataforma de inteligencia de oportunidades comerciales y laborales. JARVIS fue retirado de este servidor el 3 de noviembre de 2026; su código completo está en la rama `jarvis-archivo`.

## Cómo se actualiza el servidor (léelo antes de cambiar algo)
- Un servidor de DigitalOcean revisa la rama `main` cada 30 minutos (`/usr/local/bin/jarvis-actualizar`, ver `deploy/cloud-init.sh`).
- Descarga `main`, corre `node --test test/*.test.js` (si una prueba falla, NO instala esa versión) y copia solo `src/`, `public/`, `deploy/` y `package.json` a `/opt/jarvis`.
- Reinicia el servicio `jarvis` (`node --no-warnings src/server.js`, usuario `jarvis`, solo puede escribir en `/var/lib/jarvis`).
- Después de reiniciar, `http://127.0.0.1:8080/api/setup` debe responder en el primer minuto; si no, vuelve sola a la versión anterior. Si falla más tarde, no vuelve sola.
- Desde la parte 1c, durante los primeros 90 segundos `/api/setup` responde 503 «arrancando» hasta que el trabajo automático
  avisa que está listo. Si una versión nueva trae un trabajador que no arranca, sigue en 503 y el actualizador vuelve solo a la
  versión anterior. Se vuelve atrás el CÓDIGO, nunca los datos.
- `/api/setup` muestra la versión de `package.json`: así se sabe qué versión quedó instalada.
- JARVIS dejó sus claves de API en `/var/lib/jarvis/secrets.env` (nunca en GitHub: este repositorio es público). OPORTIA
  **nunca** abre ese archivo ni lee claves de variables de entorno: sus claves se pegan una vez en Administrador → Claves y
  se guardan cifradas (ver «IA opcional y claves»).

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
- Desde la parte 1d, también `/var/lib/jarvis/oportia-llave-secretos`: la llave que cifra las claves (permisos 600, dueño
  `jarvis`). Se crea sola al guardar la primera clave y **nunca** se cambia, se sobrescribe ni se borra. Al crearla queda
  también un nombre `oportia-llave-secretos.nueva-…`: es **otro nombre del mismo archivo** (es la llave, no un sobrante; solo
  si quedó vacío es un intento a medias). También puede haber `oportia-llave-secretos.danada-…` (una llave dañada apartada
  con la consola). Todos se guardan. **Nunca copies fuera del servidor ningún archivo cuyo nombre empiece con
  `oportia-llave`** (ni en copias de seguridad, ni por Telegram, ni a GitHub): con esa llave y una copia de la base se
  podrían leer las claves. La regla es por el comienzo del nombre, nunca por el nombre exacto (en el código:
  `esArchivoDeLlave` de `src/claves/cifrado.js`, que deben usar las copias de la parte e y el instalador de la parte f).
  Una base copiada a otro servidor necesita que se peguen las claves otra vez.
- Nunca abre, cambia ni borra `jarvis.db`, `secrets.env`, `version.txt`, `update.log` ni ningún otro archivo.
- Antes de cada cambio de la base se guarda una copia completa en `oportia-copias/`.
- Desde la parte 1e, las copias de cada noche (cifradas) en `oportia-copias/cifradas/AAAA-MM/`, también para siempre
  (ver «Copias y avisos por Telegram»).

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

## IA opcional y claves (fase 1, parte d)
OPORTIA funciona completo con su motor propio, sin IA y sin costo. La IA es una **ayuda opcional que cuesta dinero**:
- **Llega apagada** y con tope US$0 al mes. No gasta ni un centavo hasta que el dueño la enciende y pone un tope. Cada
  versión de un proyecto guarda `ia {permitida: false, topeMensualUsd: 0}`; permitirla en un proyecto (fase 2) será una
  versión nueva que hay que aprobar.
- **Se paga aparte.** La API de Claude se paga en la Consola de Claude (console.anthropic.com → Billing), con saldo que se
  compra por adelantado. **No** es la suscripción ni el saldo del chat de Claude. La de ChatGPT, en platform.openai.com.
- OPORTIA **aparta el dinero antes de cada uso** (así nunca se pasa del tope, aunque haya varios a la vez), anota cada uso
  con lo que costó (`ia_llamadas`) y avisa en Administrador al 50 %, 80 % y 100 % de cada tope (los avisos por Telegram
  llegan en la parte e: `avisos.enviado_en` ya está listo).
- Si el proveedor dice que no hay saldo, que la clave no sirve o que esperemos, OPORTIA **sigue con su motor propio**, nunca
  bloquea a la persona, **no reintenta solo** (esa clave queda en pausa y el próximo uso ni siquiera llama) y abre un aviso
  para el administrador enseguida. «Probar y reanudar» (gratis) en Claves la vuelve a usar. Mientras tanto la IA queda
  «En espera» (también en Inicio): cambiar el tope no la apaga. Si un cambio sí la apaga (el tope en US$0, apagar el
  último «Usar …» o cambiar la clave, que por seguridad pide un «Encender» nuevo), la pantalla dice por qué y ofrece
  volver a encenderla; si la reanudas con la IA apagada, también lo dice.
- El mes de la IA es el mismo con el que cobra el proveedor: empieza el día 1 a medianoche en hora universal (en RD, a las
  8:00 p. m. del último día del mes anterior). Las pantallas lo dicen así.

### Cómo encenderla sin sorpresas (unos 5 minutos)
1. En console.anthropic.com → Billing → «Buy credits», compra saldo (es prepago: vence al año y no se devuelve). Deja
   **apagada** la recarga automática (auto-reload).
2. Settings → Workspaces → crea un espacio «oportia» y ponle un **límite de gasto un poco más alto** que el tope que pondrás
   en OPORTIA (el tope + 20 %, al menos US$1 más; por ejemplo US$3 para un tope de US$2). Es un segundo candado; si fuera
   igual, el proveedor podría frenar a OPORTIA antes de tiempo. (El espacio «Default» no admite límite.)
3. API keys → Create key, dentro del espacio «oportia». Tiene que ser una clave normal de la API (empieza con `sk-ant-api`):
   OPORTIA rechaza, sin guardarlas, las claves de administrador de la cuenta y las de la suscripción de Claude.
4. Desde tu iPhone o Mac **con tu cuenta de Tailscale**, por el enlace https: Administrador → Claves → pegar → «Guardar y
   probar (gratis)». Luego Administrador → Inteligencia artificial → tope (por ejemplo US$2) → «Encender la IA» → confirmar.
   Si quieres la ayuda en los proyectos, enciende también «Ayuda en proyectos» (está apagada hasta que digas que sí).

### Qué hace por ahora y cuánto cuesta (US$)
- Una sola cosa, y solo con «Ayuda en proyectos» encendida: en un proyecto que espera aprobación, «Pedir ayuda a la IA».
  Sirve para cualquier versión que espera aprobación: un proyecto nuevo o un cambio a uno que ya funciona. No usa el
  permiso de IA de cada proyecto («IA en el trabajo automático: No permitida»): ese permiso es para el trabajo automático
  de las fases que vienen; la ayuda se paga con el tope general (o el de la cuenta) y cada vez se confirma el precio.
  La pantalla muestra el precio máximo y pide confirmar; la IA llena el formulario, el motor propio lo vuelve a leer y sale
  una versión nueva que una persona revisa y aprueba. La IA nunca aprueba, nunca quita las dudas del motor (solo deja una
  pista al lado), nunca cambia la autonomía, la frecuencia, las capacidades ni el permiso de IA, y «Volver a la versión sin
  IA» siempre está: vuelve a lo que entendió el motor propio (aunque se pida ayuda otra vez sobre la versión de la IA), y
  la ayuda solo se ofrece si al proyecto le quedan dos lugares de sus 100 versiones (el de la IA y el de volver).
- Una respuesta de la IA que no cumple el formato pedido nunca se usa ni crea nada (se cobra lo que costó). Tres respuestas
  seguidas que se pagan y no sirven (mal formadas, cortadas o rechazadas) ponen esa clave en pausa y avisan al momento,
  igual que tres errores. Lo que se lee de una respuesta tiene su tope (256 KB para la ayuda), para cuidar la memoria del
  trabajador. Un lugar de cobro (`inference_geo`) que la tabla de precios no conoce cuenta como un cobro desconocido: se
  cuenta al menos lo apartado, la clave queda en pausa y hay aviso grave.
- Una respuesta buena que no se pudo guardar (por ejemplo, ya no cabían más dudas) cuenta como pagada y que no sirvió
  (también para las tres seguidas). Si la versión ya tiene todas las dudas que caben, la ayuda no se ofrece. Si la IA
  entiende lo mismo que OPORTIA, no se crea otra versión (la pantalla lo dice). Una respuesta que trae la clave (o un
  pedazo) no se usa ni se guarda nada de ella: la clave queda en pausa y hay aviso grave.
- Las 30 llamadas de una hora se reparten: otra cuenta con presupuesto usa como mucho 10 (y pide ayuda como mucho 3 veces
  cada 10 minutos), y entre todas las otras cuentas nunca usan las 10 que quedan para el dueño. Hay aviso con el número de
  la cuenta.
- Modelo: Claude Haiku 5.5 (US$0.10 por millón de tokens que lee y US$0.50 por millón que escribe; ×1.1 si la cuenta usa
  solo servidores de EE. UU.). Un uso cuesta unos US$0.0005; el máximo que se muestra suele ser US$0.002 y el código nunca
  aparta más de US$0.005. Con un tope de US$2 caben unos 4,000 usos. Probar una clave es gratis (`count_tokens`).
- Instalar la 1d no cuesta nada: mismo servidor, mismos procesos. El trabajador usa unos 77 MB de sus 120 MB después de una
  llamada.
- ChatGPT (OpenAI): su clave se puede guardar y probar gratis, pero OPORTIA **no gasta** con ChatGPT mientras su precio en
  `src/ia/precios.json` diga `confirmado: false` (hoy es así: la página oficial no se pudo leer desde aquí) y el dueño no
  lo active en la pantalla.

### Cómo se guardan las claves
- Cifradas con AES-256-GCM en la base (`secretos`); la llave está en el archivo `oportia-llave-secretos` (ver «Datos en el
  servidor»). De una clave solo se ven sus últimos 4 caracteres; nunca sale en registros, errores, avisos, tareas,
  respuestas de la API ni copias.
- Solo se ven y se cambian desde la cuenta de Tailscale del dueño, por el enlace https (por el enlace público de Funnel solo
  se ve el gasto y se puede **apagar** la IA). El dueño es **una sola cuenta**: la primera de administrador. Otro
  administrador (un ayudante) nunca ve las claves ni cambia la IA, desde ningún equipo; solo el dueño, desde su cuenta de
  Tailscale, crea otro administrador o le reinicia la contraseña, lo desactiva o lo activa.
- Mientras alguna cuenta tenga presupuesto de IA (un tope de plan mayor que US$0), crear cuentas, cambiar planes,
  reiniciar contraseñas y volver a activar cuentas se hace desde un equipo con Tailscale: una contraseña de administrador
  robada, por el enlace público, no puede multiplicar las cuentas que gastan. Con los topes de plan en US$0 (lo que trae
  OPORTIA) todo sigue como antes.
- Además, una cuenta común gasta IA solo con **tu permiso**, y se revisa en el momento de gastar. Si alguien crea una cuenta
  o le cambia el plan, la contraseña o la vuelve a activar desde el enlace público (aunque los topes estuvieran en US$0),
  esa cuenta queda sin permiso hasta que tú, desde tu cuenta de Tailscale, toques «Permitir IA» en Administrador →
  Usuarios (ahí ves cuándo y desde dónde se tocó por última vez). Las cuentas que creas desde Tailscale ya lo tienen.
  Las que existían antes de esta versión lo esperan. Un cambio que no quedó anotado (por ejemplo, con la versión anterior
  del código) también quita el permiso. «Quitar IA» se puede desde cualquier entrada.
- El id de cada petición se guarda solo si tiene la forma de los proveedores (`req_…`, `msg_…`, `resp_…`) y nunca si trae
  la clave o un pedazo de ella. Cambiar una clave deja la anterior guardada como «reemplazada»; desactivar
  la deja «desactivada»: nunca se borran. Si alguien vio una clave, cámbiala aquí **y anúlala en la página del proveedor**.
- Lo que queda: quien sea root (o el usuario `jarvis`) en el servidor puede leer la llave y la base, y la memoria de
  intercambio (swap) podría guardar un trozo de memoria. El trabajador y el servidor web corren sin archivos de volcado
  (`prlimit --core=0`: el servidor se lo pone a sí mismo al arrancar, y el servicio nuevo trae `LimitCORE=0`). La llave
  nunca queda guardada en la memoria del proceso: solo su huella.
  Si un día dudas, anula la clave en el proveedor y pega una nueva.

### Desde la consola (cuando las pantallas no abren)

    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --ia=no
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=revisar
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=apartar-llave-danada
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=recuperar-llave
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --claves=empezar-de-nuevo
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --tailscale=reanotar

`--ia=no` apaga la IA (no hay `--ia=si`: encenderla necesita la pantalla y su aviso). `--claves=revisar` explica en palabras
simples cómo está el archivo de la llave y no cambia nada. `--claves=apartar-llave-danada` solo hace algo si ese archivo
está dañado: le cambia el nombre (no lo borra) para que la próxima clave pegada cree una llave nueva.
`--claves=recuperar-llave` solo hace algo si falta el archivo de la llave y queda otro nombre (`.nueva-…`) con la llave con
la que se guardaron tus claves: se lo vuelve a poner (no borra ni pisa nada; `--claves=revisar` dice si se puede).
Mientras falte ese archivo y ya haya claves guardadas, la pantalla Claves no deja pegar otra (así nunca se crea una llave
nueva encima de la que falta). Si no se puede recuperar, `--claves=empezar-de-nuevo` crea una llave nueva: las claves de
antes quedan guardadas sin poder leerse y se pegan otra vez. Una base **recuperada de una copia** (parte e) no necesita
ese paso: `oportia-restaurar.mjs` la marca como recuperada y, como la llave nunca viaja en una copia, Claves deja pegar
otra vez las claves que traía (crea una llave nueva). Una clave guardada después con esa llave nueva vuelve a la regla de
siempre.
`--tailscale=reanotar` olvida la cuenta de Tailscale guardada del dueño (el primer administrador; si cambiaste de cuenta);
la próxima entrada del dueño anota la nueva.

### Precios
`src/ia/precios.json` es solo datos: precio por millón de tokens, de dónde salió (`fuente`), cuándo se revisó
(`revisadoEl`) y si está `confirmado`. Para actualizarlo: revisar la página oficial de precios, cambiar solo ese archivo
(con su fecha y su fuente) y publicar como siempre. Un archivo mal escrito deja la tabla vacía: nada se puede gastar. Cada
uso guarda el precio con que se cobró.

### Cómo usarán la IA las fases 2 a 7
Siempre como tareas del trabajador, con `ctx.ia.pedir(...)`, que nunca lanza error por un problema del proveedor, del tope
o de la red: devuelve `{ usada: false, motivo }` y el trabajo sigue con el motor propio.

```js
async paso(ctx) {
  const base = conMotorPropio(datos);                                        // 1. el motor propio SIEMPRE primero
  const r = await ctx.ia.pedir({ proposito: 'investigar_empresa', paso: `empresa:${id}`, espacioId, proyectoId,
    versionNumero, sistema, texto, esquema });                               // 2. la IA es una ayuda opcional
  const final = r.usada && esValido(r.json) ? mezclar(base, r.json) : base; // 3. la IA solo puede mejorar
  await ctx.escribir(() => guardarResultado(ctx.db, { …, conIa: r.usada, llamadaId: r.llamadaId ?? null }));
  return { listo: true, resultado: { conIa: r.usada, motivo: r.motivo ?? null } };
}
```
Reglas: (1) cada uso se registra en `src/ia/propositos.js` (fase, cuánto puede costar una vez, tiempo máximo, interruptor
del dueño si hace falta); (2) todo lo que devuelve la IA se revisa contra catálogos y esquemas; la IA nunca pone
capacidades, autonomía, frecuencia ni aprobación, y nunca quita las dudas del motor; lo que escribió la IA y se guarda es
**dato**: si se manda otra vez a un modelo va dentro del mismo bloque de datos escapado que el texto de la persona;
(3) todo lo que MANDA algo a otra persona (fases 4 y 7) es una tarea aparte con `repetible: false`: la IA solo hace el
borrador; (4) la fase 2 trae el editor del permiso de IA de cada proyecto (cambiarlo es una versión nueva que se aprueba)
y el costo estimado; (5) la fase 6 trae claves propias por cuenta (`secretos.espacio_id`) y topes por cuenta editables.

## Copias y avisos por Telegram (fase 1, parte e)
Cada madrugada (4:40 a. m., hora de RD, después de la revisión de la base de las 4:10) OPORTIA hace una copia de toda su
base, la cierra con candado y la manda en partes a tu chat privado con tu bot de Telegram. Después la baja otra vez para
comprobar que llegó entera y deja fijado arriba en el chat un «índice» con la lista de partes. Telegram es gratis. El mismo
bot te avisa al momento de lo grave. Nada se borra. Todo lo lento lo hace el trabajo automático (la tarea
`copias.hacer`), nunca las pantallas.

### Qué se copia y qué nunca
- Se copia la base entera (`oportia.db`): una foto coherente tomada dentro de una sola lectura (nunca se copia el `-wal`
  a mano ni se escribe un archivo sin candado en el disco), con un conteo de filas por tabla que se comprueba en la misma
  copia.
- **Nunca** se copia la llave de las claves (`oportia-llave-secretos*`), ni ningún archivo que empiece con
  `oportia-llave`. Las claves de la IA y el token del bot viajan dentro de la base, pero cifradas con esa llave: en un
  servidor nuevo no se pueden leer y hay que pegarlas otra vez en Claves.
- En el servidor quedan las mismas partes cifradas en `/var/lib/jarvis/oportia-copias/cifradas/AAAA-MM/` (cuando el disco
  lo permite).

### Lo que tienes que guardar tú (solo dos cosas)
1. **Tu clave de recuperación**: 28 letras y números en 7 grupos («7K2M-Q9TB-…»). OPORTIA te la muestra **una sola vez**
   en Administrador → Copias, te pide escribirla otra vez para estar seguros, y te ofrece imprimir una hoja. Guárdala en
   un papel en un lugar seguro y en Contraseñas del iPhone o la Mac (como nota segura). El servidor guarda solo el
   candado (la parte pública), nunca la clave: si alguien se roba el servidor o tu Telegram, no puede abrir tus copias.
   Si la pierdes, nadie puede abrirlas, ni tú. Se crea y se comprueba solo desde tu cuenta de Tailscale; la página la
   revisa sola y manda al servidor solo un «verificador», nunca la clave.
2. **Tu cuenta de Telegram** (el chat con tu bot tiene todas las copias). No borres los mensajes del bot.

Cada 90 días te llega un recordatorio en silencio para «Comprobar mi clave» (tarda un minuto). «Cambiar mi clave» existe
por si alguien la vio: las copias de antes siguen necesitando la clave de antes (no la tires).

### Cómo crear el bot y unir tu chat (unos 5 minutos, gratis)
1. En Telegram busca **@BotFather** (marca azul) y escríbele `/newbot`.
2. Ponle un nombre y un usuario que termine en «bot». Te da un texto largo con dos puntos (`números:letras`): el token.
3. En OPORTIA, desde tu cuenta de Tailscale: Administrador → Claves → «Avisos y copias por Telegram» → paso ① → pega el
   token → «Guardar y probar (gratis)».
4. Paso ② → «Unir mi chat de Telegram»: sale un código de 8 cifras. Toca «Abrir mi bot en Telegram» y «Iniciar», o
   escríbele el código al bot. En segundos tu bot te manda **otro código de 6 cifras**: escríbelo en la pantalla y toca
   «Confirmar». La pantalla dice «quedó unido» y te llega un mensaje de bienvenida. Si el código de 6 cifras NO te llega a
   tu Telegram, otra persona tiene el token de tu bot: no escribas nada, toca «Cancelar» y cambia el token (abajo).
5. «Mandar un mensaje de prueba» cuando quieras comprobar que los avisos llegan.

Si alguien más le escribe a tu bot, nunca le contesta ni se une su chat: cada chat tiene 5 intentos para el código (los
de un extraño nunca gastan los tuyos) y el código vence a los 10 minutos.

### Si un día pierdes el servidor
1. Ten a mano tu clave de recuperación (la del papel o la de Contraseñas).
2. En Telegram abre @BotFather → /mybots → tu bot → API Token, y cópialo.
3. En el servidor nuevo, OPORTIA te pedirá ese token y tu clave. Busca sola tu última copia (la que está fijada arriba en el
   chat con tu bot), la comprueba y la abre. *(La pantalla llega en la parte 1f; hasta entonces Claude lo hace contigo por
   la consola, con la orden de abajo.)*
4. **Enseguida, revoca el token del bot**: en @BotFather escribe `/revoke`, elige tu bot y te da un token NUEVO. Así el
   servidor viejo, si sigue vivo (o vuelve de una foto del droplet), ya no puede mandar sus copias viejas a tu chat (si lo
   hiciera, el servidor nuevo te avisa urgente «Otro servidor manda copias»).
5. Después pega otra vez tus claves de IA y el token NUEVO del bot en Claves: por seguridad nunca viajan en las copias.
   En una base recuperada, Claves lo deja hacer enseguida (dice «Esta base se recuperó de una copia»: crea una llave
   nueva para tus claves, sin pasar por la consola). Luego crea en Copias una clave de recuperación **nueva** (Copias dice
   «Tu clave ya no sirve en este servidor» y deja crear otra) y guarda las dos: las copias viejas se siguen abriendo con
   la de antes.
6. No borres los mensajes del bot: son tus copias. Si borras el chat, solo quedan las copias de este servidor.

Estos 6 pasos son los mismos en la pantalla Copias («Si un día pierdes el servidor») y en la hoja que se imprime con la
clave (`copias.restaurar.paso1…6`; `test/pantallas.test.js` revisa que sean los mismos que aquí).

Sin bot (token perdido o bot borrado): en Telegram Desktop de la Mac guarda las partes `.opc` y el `-indice.txt` de una
noche y usa `--archivos=`. Una copia de más de 30 horas, si hay una más nueva, si su fecha es del futuro (el reloj del
servidor iba adelantado) o si hay otra copia que también parece la última (dos servidores con el mismo bot), nunca se abre
sin un «sí». En una base recuperada, Copias muestra aparte «del servidor anterior» las copias cuyos archivos se quedaron
en el servidor viejo.

### El disco («nunca se borra nada») — ⚠ decisión para Junior
- Las copias del servidor **nunca se borran**. Se guarda una copia aquí solo si después quedan libres al menos
  max(2 GB, 2 × la base + el `-wal` + 256 MB) (el espacio que hace falta para mejorar OPORTIA sin riesgo). Se mide el
  disco de la carpeta de las copias (`OPORTIA_COPIAS` puede estar en otro disco: entonces basta con 256 MB libres allí).
- Si el disco no deja escribir una copia (lleno a la mitad, sin espacio para archivos, un error del disco), esa copia
  sigue directo a Telegram esa misma noche y te aviso; lo que alcanzó a escribirse se queda (nada se borra).
- Si no queda ese espacio: **dejo de guardar copias nuevas aquí, sigo con las de Telegram cada noche y te aviso**. Un mes
  antes te aviso «al ritmo de hoy, en unos 30 días…».
- Con menos de 300 MB libres paro **todas** las copias (también las de Telegram) hasta que haya espacio, porque hacerlas
  podría llenar el disco del todo; eso suena como urgente.
- Lo que cuesta: con el tiempo el disco se llena de copias viejas y alguien (tú, con ayuda de Claude) tendrá que decidir
  qué hacer con ellas. Otra opción, solo si la pides: guardar aquí solo las copias de los últimos N días.

### Los avisos que llegan al Telegram
Solo lo urgente suena (modo seguro, base dañada, una copia que falló o ninguna copia comprobada en 30 horas, una
actualización devuelta). El resto llega en silencio: el trabajo automático que se reinicia, poco disco o memoria, las
copias que se quedaron solo en el servidor, el mensaje fijado que cambió, una actualización que no se instaló (leído solo
de `/var/lib/jarvis/update.log` y `version.bad`, sin cambiarlos), los topes y el proveedor de la IA. Un aviso igual no se
repite; como mucho 10 avisos por hora y 30 por día (las copias no cuentan); lo urgente nunca se calla y cuando se resuelve
llega «Ya se arregló». Los avisos los manda la parte web, así llegan aunque el trabajo automático esté caído.
Si Telegram no funciona por horas o días, lo urgente espera hasta 7 días y llega cuando vuelve; lo urgente que se arregló
solo sin llegar va en un mensaje «No te llegaron a tiempo». Si un mensaje no se acepta (un error raro de Telegram), se
reintenta con esperas (1, 5, 15 y 60 min) y Claves y Copias dicen «no llega». Si pegas un token nuevo del mismo bot y su
prueba falla por algo pasajero, se prueba otra vez solo; «Mandar un mensaje de prueba» también lo prueba primero, y si
es el token de OTRO bot, el chat queda para unirlo otra vez (nunca se manda nada por otro bot). Si Telegram no responde
mientras se hace una copia, la copia queda al menos en este servidor (comprobada) y te aviso. Un reloj que salta hacia
adelante no da por vencido ningún aviso. Si se pierde el chat y lo unes otra vez, lo urgente que esperaba llega.

Una copia siempre lleva la fecha de su FOTO (cuándo se tomaron los datos), nunca la de cuándo se comprobó: una copia que
se quedó a medias más de 20 horas (modo seguro, el servidor apagado) no se termina, se hace otra. Si dejas el chat (o unes
otro) mientras se hace una copia, nada más va al chat viejo. El índice de cada copia queda fijado arriba en el chat; si
no se pudo fijar, se reintenta, y si nunca se pudo, llega un aviso urgente.

### Pantallas
- **Administrador → Copias** (`#copias`): la tarjeta grande (verde: hay una copia comprobada fuera del servidor en las
  últimas 30 horas; amarillo: algo que mirar; rojo: falló, está atrasada o el disco está lleno), con «Hacer una copia
  ahora» solo cuando se puede (si no, una línea dice por qué), el avance «parte 4 de 11» mientras se hace, tu clave, tu
  Telegram, el disco de este servidor, las últimas 10 copias y «Si un día pierdes el servidor». En la PC, 3 columnas.
- **Administrador → Claves**: «Avisos y copias por Telegram» con los pasos ① tu bot y ② tu chat.
- **Resumen** de Administrador: azulejos «Copias» y «Telegram». **Inicio**: una insignia «Copias: hoy 4:41 a. m.».
  **Servidor**: «Última versión que no se instaló».

### Desde la consola (cuando las pantallas no abren)
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --copias=estado        # cómo están (no cambia nada)
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --copias=ahora         # pide una copia ahora
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --telegram=desvincular # deja de usar el chat (no borra nada)
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --destino=/var/lib/jarvis/recuperada.db
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --indice=<el …-indice.txt de tu chat> --destino=<archivo nuevo>
    sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --archivos=<carpeta> --destino=<archivo nuevo> [--comprobar] [--anterior]

Con `--telegram` se usa la copia FIJADA en el chat; si es de hace más de 26 horas, pregunta (quizás la de anoche no quedó
fijada: guarda su «…-indice.txt» y usa `--indice`). Si a esa copia le falta una parte o tiene una dañada, la salida es una
copia de antes: guarda de tu chat el «…-indice.txt» de una noche anterior y usa `--telegram --indice=<ese archivo>`, o
guarda los archivos de una noche y usa `--archivos` (`--anterior` va solo con `--archivos`). Al terminar dice los pasos que
siguen: revocar el token en @BotFather (`/revoke`), pegar otra vez las claves y crear una clave de recuperación nueva. Con
`--archivos`, una parte dañada o un archivo raro en la carpeta se saltan si hay otro bueno; `--anterior` usa la copia buena
de antes si la más nueva está dañada o cortada (siempre dice que hay una más nueva). Para la carpeta de copias del
servidor, usa la carpeta de un mes si son muchísimos archivos.

`oportia-restaurar.mjs` pide la clave y el token sin mostrarlos (nunca en la línea de la orden), nunca corre como root y
nunca pisa un archivo. Salidas: 0 bien · 2 uso · 3 clave · 4 copia incompleta, dañada o no auténtica · 5 el destino existe
· 6 Telegram o la red · 7 formato nuevo · 8 cancelada. La parte 1f pondrá la pantalla y el instalador encima.

### Límites de Telegram y medidas
- La Bot API deja subir documentos de hasta 50 MB y bajar (para comprobar) hasta 20 MB: cada parte mide **2 MiB** (+74 B
  de cabecera), así cada una se sube y se vuelve a bajar entera. Cada parte se describe sola (las copias se recuperan
  aunque Telegram cambie los nombres o el orden).
- Formato `oportia-copia` v1: X25519 + HKDF-SHA256 + AES-256-GCM en registros de 64 KiB con el último marcado, una línea de
  sello al final (HMAC) y un índice firmado. Un cambio de formato es un número nuevo, nunca una edición; `test/copia-v1.json`
  es el vector congelado.
- Medido en la máquina de pruebas (4 CPU) con una base de 208 MB: pico de unos 110 MB en el trabajador (unos 40 MB sobre lo
  que usa sin hacer nada), 38 partes, 41–48 s; con partes de 4 MiB el envío directo llegaba al tope de 120 MB del
  trabajador, por eso son de 2 MiB. En el servidor real (1 vCPU) el trabajador usa unos 46 MB sin hacer nada: una copia
  debería quedar en 85–90 MB.
- Directo a Telegram (cuando el disco no deja guardar copias aquí) la foto queda abierta mientras se sube: con partes de
  2 MiB, una base de 187 MB llegaba a 112–116 MB (el tope es 120 MB). Por eso, en ese modo cada parte mide **1 MiB** (el
  formato es el mismo; solo hay el doble de partes) y se limpia la memoria antes y después de cada parte. Medido en la
  máquina de pruebas (4 CPU) con 194 MB de base: pico de 114 MB con 2 MiB (36 partes, 39 s) → 108 MB con 1 MiB (71 partes,
  79 s; tarda más por la pausa de 1,1 s entre documentos). Después de publicar, mide en el servidor real con
  `node --no-warnings test/medir-copia.mjs 200 directo` y anota aquí el pico.

### Si se filtra el token o la clave
- **El token del bot**: en @BotFather → /mybots → tu bot → API Token → «Revoke current token», pega el nuevo en Claves
  **y une tu chat otra vez** (Claves te lo ofrece: «Unir otra vez»). Con el token alguien podría ver tus copias en el chat
  (pero no abrirlas sin tu clave), fijar un archivo o intentar unir SU chat: para unir un chat hace falta el segundo
  código, que el bot le manda al chat que escribió el primero, escrito en la pantalla de OPORTIA (solo desde Tailscale).
  OPORTIA revisa cada noche que el fijado sea el suyo, firma cada copia y al recuperar siempre muestra la fecha.
- **Qué quiere decir «copia auténtica»**: la hizo tu servidor (o alguien que tuvo tu servidor ENTERO: la base y el archivo
  de la llave de las claves, por ejemplo una foto del droplet). La base sola no alcanza: el sello que firma las copias va
  guardado con la llave de las claves, que nunca viaja en una copia. Si el servidor fue atacado, al recuperar elige una
  copia de ANTES de esa fecha (la consola siempre muestra la fecha y pregunta).
- **La clave de recuperación**: «Cambiar mi clave» en Copias. Las copias nuevas quedan con la clave nueva; las viejas
  siguen abriéndose con la vieja (quien la tenga y además tenga tu Telegram podría abrir esas copias viejas).

### Lo que falta (a propósito)
- La pantalla para recuperar y el instalador de una base recuperada: parte 1f (hoy, la consola).
- No se vuelven a comprobar copias viejas; el bot no contesta órdenes (eso llega con los canales de clientes, fase 3+).
- No hay un canal aparte para las copias (todo va a tu chat privado); se puede agregar si lo pides.

## Academia (etapa 1, versión 0.8.0; cambio de base 7 en la 0.7.0)

**Regla absoluta: este repositorio es PÚBLICO.** Ningún texto de un libro, ninguna pregunta del Test Guide y ninguna imagen de
un libro entra nunca a git. El contenido llega como un **paquete** que el administrador sube en Administrador → Contenido y que
vive solo en el servidor: `OPORTIA_DATOS/academia/paquetes/<versión>-<huella>/` (`paquete.json` y `figuras/`), o en
`OPORTIA_ACADEMIA` si se define. `test/reglas.test.js` falla si el repositorio tiene un `*.pdf` (u otro documento), un
`paquete*.json`, una imagen nueva o un archivo grande. Las pruebas usan solo `test/academia-muestra.js`: una muestra ORIGINAL,
escrita con palabras propias (2 temas, 10 preguntas, una figura dibujada por código), marcada `muestra: true`.

Para probar la muestra a mano: `node --input-type=module -e "import('./test/academia-muestra.js').then(m => m.escribirMuestra('/una/carpeta'))"`
deja `muestra-academia.json` y `figura-m1.png`; se eligen los dos juntos en Contenido → Subir, y después «Poner en uso».

### Qué hay
- **Camino**: las 11 materias de ENALAS en su orden fijo; cada tema es un círculo que se abre al aprobar el anterior (las
  materias sin contenido se saltan y dicen «Pronto»). Racha (días seguidos, hora de Santo Domingo) y puntos (10 por acierto).
- **Tema**: la lección por partes (cada parte dice libro, capítulo, sección y página) → las preguntas del tema. Cada pregunta
  se ve TAL CUAL (número, sección, enunciado, opciones en su orden, figura). Al responder: correcta/incorrecta, la
  **explicación original** (con su etiqueta) y debajo, aparte, la **explicación sencilla**; si eligió mal, la idea equivocada
  de esa opción; y las palabras de inglés aeronáutico. La nota la pone el servidor: la respuesta nunca viaja antes.
- **Aprobar** necesita el 90 % (Contenido → Ajustes, de 50 a 100). Si no llega: la lista de lo fallado con su idea equivocada,
  la explicación «más fácil» del tema y «Otra vez»: las MISMAS preguntas en otro orden (nunca el mismo orden seguido).
- **Repaso**: lo fallado entra en una fila de repaso espaciado (vuelve en 1, 2, 4, 8 y 16 días si se acierta; fallar la
  devuelve a hoy). **Examen de materia** (como en ENALAS): todas las preguntas de la materia, mezcladas; se abre al aprobar
  todos sus temas. **Progreso**: % por materia (preguntas cuya última respuesta fue correcta), y lo que más cuesta.
- **Administrador → Alumnos**: quién está en línea (actividad en los últimos 10 minutos), su última actividad, aciertos y
  errores por materia y las preguntas que falla. **Administrador → Contenido**: subir, versiones, poner una en uso, el nombre
  de la app (por defecto «Academia de Aviación») y el %.
- Un alumno nunca lee lo de otro: todas sus rutas usan la sesión (nunca un id que mande la pantalla); el intento de otro
  responde 404 y lo de Administrador 403 (`test/academia.test.js`).
- 0.8.0: se QUITARON los proyectos de OPORTIA (pantallas, creador, motor de clientes, sus rutas `/api/proyectos…` y
  `/api/catalogo`, y la ayuda de IA de los proyectos). Sus tablas siguen en la base (las migraciones solo agregan) y van en
  las copias; una tarea vieja `ia.interpretar` que quede en la fila termina sola sin llamar a la IA. Siguen las cuentas, el
  administrador, las copias, las claves de IA, Telegram y Drive. Todavía no hay: salas en vivo, examen final de 200,
  instructor con IA. Las copias cifradas guardan la base (el progreso); los paquetes no van en la copia: se vuelven a subir.

### Lo que ve el alumno (0.7.2): una app de aviación tipo Duolingo
- **Estilo** (`public/academia.css`, después de `estilos.css` y `clase/clase.css`): cielo de fondo, acentos de cabina oscura,
  naranja para lo que se toca, letra redonda, botones «3D» que se hunden, un color y un ícono por materia, claro y oscuro, y
  con «reducir movimiento» nada se anima. Las pantallas de estudio (lección, video, preguntas) ocupan toda la pantalla: arriba
  la X y la barra de «combustible» con la avioneta, abajo un botón grande (CONTINUAR / COMPROBAR / GIRAR).
- **Camino**: barra de cabina (plan, racha, puntos y el medidor de preparación), el banner de cada materia («Materia 1 ·
  Factores humanos»), un sendero de círculos que serpentea: el **Video resumen** primero, cada tema (dorado con estrellas al
  aprobarlo, gris con candado si está cerrado, el que toca late con «EMPEZAR» y la avioneta al lado) y el trofeo del
  **Examen de materia** al final.
- **Lección en tarjetas** (`public/tarjetas.js`, lógica pura y probada): una idea por pantalla. Las secciones de texto largo
  se parten solas por párrafos, viñetas y frases (3 frases o ~360 letras como máximo); la frase clave («evita», «siempre»,
  «por lo menos»…) va en el recuadro **Recuerda**; los términos en inglés entre paréntesis salen como fichas y las cifras
  resaltadas. «Si te preguntan: … Recuerda: …» → tarjetas para **girar**; «Escenario N: … A) … → …» → **PRÁCTICA · Situación de
  vuelo** (elegir, COMPROBAR, la consecuencia; no cuenta para la nota); «• Palabra (pronunciación): significado. Ejemplo: …» →
  tarjetas de vocabulario con «oír» (voz del navegador). Si un patrón no se reconoce, el texto sale como tarjeta normal:
  nunca se pierde nada. Un tema **sin preguntas** se aprueba al terminar de leer su lección
  (`POST /api/academia/temas/:materia/:tema/leido`; antes el camino quedaba trancado ahí).
- **Preguntas del Test Guide**: insignia «TEST GUIDE · Pregunta 10-5» (el número tal cual), enunciado y opciones TAL CUAL en
  tarjetas grandes, figura original con «tocar para ampliar», COMPROBAR y la hoja de abajo verde («¡Correcto!») o roja
  («Respuesta correcta: B») con la explicación ORIGINAL, aparte la «Explicación sencilla» y, si falló, «Por qué elegiste esa».
  Acertar: confeti y una avioneta que da una vuelta (sin sonido); fallar: la opción tiembla. El 90 %, «otra vez» en otro
  orden, la fila de repaso y el examen de materia siguen igual.
- **Video resumen** (`public/clase/reproductor.js`, de la rama `academia-visual`): la narración de la materia suena entera y
  las escenas cambian solas según su tiempo dentro del mp3. Una escena cuyo dibujo no sirve (o de un tipo que la app no
  conoce, o un escenario sin opciones) usa el **cartel** (`public/clase/cartel.js`: cielo, ícono según el tema y el título);
  un video nunca se queda esperando. Si la materia tiene audio pero no escenas: una sola escena con el título. Al terminar,
  el círculo del video sale dorado.
- **Plan de estudio** (la primera vez que entra): «1 mes» (recomendado), «2 meses» o «Repaso 15 días». La fecha estimada de fin
  mezcla el ritmo del plan con el ritmo real (temas y exámenes aprobados por día): si avanza más rápido, termina antes. Se ve
  en la barra del camino y en Progreso (meta de hoy, adelantado / a tiempo / atrasado, cambiar de plan).
- **Grupo** (camino y Progreso): cada compañero como una avioneta sobre la ruta de las 11 materias, con su materia actual, %
  del camino, racha y medallas (exámenes aprobados + temas al 100 %). NUNCA notas, errores, respuestas ni conexión. Cada
  alumno se puede ocultar; el administrador lo apaga en Contenido → Ajustes (`POST /api/admin/academia/grupo`).
- Rutas nuevas del alumno: `POST /api/academia/plan` `{ plan }`, `POST /api/academia/grupo` `{ oculto }`,
  `GET /api/academia/video/:materia`, `POST /api/academia/video/:materia/visto`. El plan, el grupo y la preparación llegan
  dentro de `GET /api/academia/camino` y `GET /api/academia/progreso` (ninguna pantalla pide nada más al abrir). Todo se
  guarda en `ajustes` (`academia.plan.<id>`, `academia.grupo_oculto.<id>`, `academia.grupo`, `academia.videos_vistos.<id>`,
  `academia.temas_leidos.<id>`): sin cambio de base.

### Lo nuevo de la 0.8.0
- **Dos modos de práctica.** «Original» = las 3 opciones TAL CUAL del Test Guide (es el que aprueba temas y el único de los
  exámenes). «Modo reto» (si la pregunta trae `reto`): el enunciado y la respuesta correcta tal cual + las 2 opciones nuevas
  del paquete, mezcladas (A, B, C) con un orden que sale del intento y la pregunta (al recargar se ve igual). Antes de
  responder no viaja nada que diga cuál es la original; en la base se guarda la opción de verdad (la letra original de la
  correcta, o `R1`/`R2`). Al responder: por qué es incorrecta cada opción del reto y la trampa que tiende. Se practica desde
  cada tema («Practicar ya»: Original o Modo reto) y desde cada materia abierta (Modo reto de sus temas abiertos). No aprueba
  nada (es práctica). `POST /api/academia/intentos { tipo: 'reto', materia, tema? }`.
- **Revisión completa** al terminar cualquier intento (`terminar` trae `revision`): cada pregunta con lo que eligió, la
  correcta, la explicación original y la sencilla; filtro «Solo las que fallé» y «Practicar mis errores»
  (`{ tipo: 'errores', intento }`: las falladas de ese intento, que tiene que ser suyo).
- **Memoria de errores** (`src/academia/memoria.js`): cada respuesta queda para siempre en `academia_respuestas` (pregunta,
  opción, acierto, fecha) y su intento dice el modo. De ahí se calcula, cada vez, lo que más falla: por pregunta («superada»
  con 2 aciertos seguidos), por idea equivocada (la del paquete para esa opción o la trampa del reto) y por tema. El repaso
  empieza por lo más fallado; cada materia y cada tema muestran «Tu punto débil» con un ejercicio rápido
  (`{ tipo: 'errores', materia, tema? }`); Progreso tiene «Mis puntos débiles»; el administrador ve lo mismo de cada alumno.
  Sin cambio de base.
- **Administrador → Respuestas** (`GET /api/admin/academia/respuestas`, solo administrador: 403 para los alumnos): la clave
  completa con buscador (número o texto). Su pantalla (`public/admin-respuestas.js`) solo se carga ahí.
- **Modo estudiante**: «Estudiar como estudiante» en Administrador muestra su propio camino como a un alumno (sus datos de
  estudio siempre fueron los de su cuenta); una banda arriba lleva de vuelta. Se recuerda en esa pestaña del navegador.
- **Sonidos** (`public/sonidos.js`, Web Audio, sin archivos): acierto, error, toque, tema terminado, racha y nivel. Se apagan en
  Configuración (por cuenta, en ese navegador). No se cambia `navigator.audioSession` (la narración sigue sonando); en el
  iPhone respetan el interruptor de silencio como todo Web Audio.
- **Velocidad**: lo ya cargado queda en memoria (solo en la pestaña) y la pantalla sale enseguida; se vuelve a pedir en el
  fondo y, si cambió, se redibuja sin moverse. Cualquier cambio (POST) lo vacía; al salir o cambiar de cuenta también. Se
  adelanta el próximo tema y el progreso. Medido en un iPhone 13 emulado (150 ms de red, CPU ×4): de ~200-290 ms a
  30-150 ms al volver a una pantalla ya vista.

### Lo nuevo de la 0.9.1: la interfaz más profesional, el camino plegable y la explicación más clara (sin cambio de base)
- **Foto de fondo real** (`public/fondos/`, créditos y licencias en `public/fondos/CREDITOS.md`): una Cessna 172 de día en el
  tema claro (dominio público) y el amanecer bajo el ala de un 172 en el oscuro (Don Ramey Logan, CC BY 4.0), ya desenfocadas,
  en WebP y JPEG, de 900 px (teléfono) y 1920 px (computadora). Un velo del color del fondo deja todo el texto en AA. Primero se
  ve una versión diminuta; la foto se pide cuando el navegador está libre (`public/tema.js`), nunca con «ahorro de datos», y se
  guarda un año: el servidor pone la huella también en los `url(/…)` de un `.css` (`src/nucleo/http.js`). El crédito sale en
  Configuración → Ayuda.
- **`public/interfaz.css`** (va al final, no cambia ninguna clase): vidrio en barras y tarjetas (sólido con «reducir
  transparencia» o sin `backdrop-filter`), escala de espacios, títulos, menú, pestañas, la línea de pista del camino, el Grupo a
  la derecha en pantallas anchas y botones de color con texto AA.
- **Las clases** (`public/clase/realce.js`): cada punto con un ícono según de qué habla y entrando uno tras otro, «Recuerda»
  destacado, fichas EN · ES (la abreviatura solo si viene en el paquete) y la figura a pantalla completa encaja y se acerca al tocarla.
- **El camino plegable** (`public/camino-plegable.js`): cada materia es una tarjeta (número, nombre, ícono, %, estado, video,
  punto débil, y `.materia-insignias` para más) que abre o cierra su sendero. Al entrar solo está abierta la actual; lo que se
  abre o cierra se recuerda por cuenta en el navegador; «Ver todas / Cerrar todas». Una materia bloqueada se abre para ver sus
  temas (con cuántas preguntas), pero siguen cerrados: el orden 1 → 11 no cambia.
- **Después de responder** (`public/respuesta-vista.js`): la opción correcta con su texto, la explicación sencilla primero (cada
  línea con rótulo, «✔», «Por qué:», «Piensa así:», «Truco para recordar:», en su fila con ícono), «Por qué tu opción no»
  resaltado y la explicación del Test Guide TAL CUAL en un bloque que se abre.

### Lo nuevo de la 0.9.0: cada alumno con más claridad, comparar y el perfil propio (sin cambio de base)
- **Administrador → Alumnos** (`public/admin-alumnos.js`, solo se carga ahí; estilos en `public/alumnos.css`): cada alumno con
  su avatar, `@usuario`, % y última actividad. Se marcan de 2 a 6 y «Comparar». Desde Administrador → Usuarios, «Ver su ficha».
- **La ficha de un alumno** (`#alumno/N`, por pestañas):
  - **Resumen**: plan y ritmo, preparación (preguntas con su última respuesta bien), nota promedio (de sus temas y exámenes
    terminados), % de acierto (todas sus respuestas), intentos, aprobados, temas y exámenes aprobados, preguntas
    respondidas, racha y tiempo de estudio aproximado (ratos de respuestas seguidas con pausas de menos de 10 minutos).
  - **Exámenes** (`#alumno/N/examenes`): cada intento (tema, examen de materia, Modo reto, repaso, errores) con fecha, nota y
    si aprobó. Al tocar uno (`#alumno/N/intento/M`), cada pregunta TAL CUAL con lo que eligió, la correcta, si acertó y las
    explicaciones; filtro «Solo las que falló».
  - **Por materia**: dominio de cada materia y, por tema y examen, la mejor nota, la última y cuántas veces.
  - **Puntos débiles**: la memoria de errores de la 0.8.0.
  - **Actividad**: última entrada (con contraseña), última salida, última actividad y cada sesión con su entrada, su última
    actividad y cuándo salió (y por qué: «Salir», contraseña cambiada o reiniciada, contraseñas malas). Sin «Salir», se ve
    su última actividad (o que venció).
- **Entradas y salidas sin cambio de base**: la sesión abierta ya guarda cuándo entró y su última actividad (cada 5 min).
  Antes de borrar una sesión (`cerrarSesion`/`cerrarTodas` en `src/cuentas/sesiones.js`) queda una fila `salida` en la
  auditoría con la entrada, la última actividad, el motivo y el equipo. `src/cuentas/historial.js` arma la lista.
- **Comparar** (`#comparar/2,5`): preparación, % de acierto, nota promedio, exámenes y temas aprobados, intentos, preguntas,
  racha, tiempo; % por materia; puntos débiles y última actividad. Con barras.
- **Mi perfil** (Configuración, `public/perfil-vista.js`): nombre para mostrar, un avatar de aviación (6 figuras × 6 colores,
  dibujado en SVG por `public/avatares.js`, sin archivos) y «Mi meta» (una línea). El avatar sale arriba, en el Grupo y en
  las listas del administrador; la meta solo la ven la persona y el administrador (el Grupo sigue sin notas, errores ni
  conexión). Se guardan en `ajustes` (`cuenta.perfil.<id>`). **El nombre de usuario** también se cambia ahí, con la
  contraseña actual: tiene que estar libre (sin importar mayúsculas); las sesiones siguen abiertas (van por el id). No se
  puede con la contraseña temporal. Queda en la auditoría (`nombre_usuario_cambiado`).
- Rutas nuevas: `GET/POST /api/yo/perfil`, `POST /api/yo/usuario { nombre, clave }` (la cuenta de la sesión, nunca otra);
  solo administrador (401 sin sesión, 403 alumnos): `GET /api/admin/academia/alumnos/:id/ficha`,
  `GET /api/admin/academia/alumnos/:id/intentos/:intento` (404 si el intento no es de ese alumno),
  `GET /api/admin/academia/comparar/:ids` (2 a 6 ids). `/api/yo`, el Grupo y las listas del administrador traen `avatar`.
  Pruebas: `test/admin-alumnos.test.js`.
- Volver a la 0.8.1 es seguro: no hay migración nueva; la 0.8.1 ignora las filas `salida` y `cuenta.perfil.*`.

### Lo nuevo de la 0.10.0: el Instructor (sin IA siempre; con IA si el dueño quiere) — cambio de base 8
**Sin IA (gratis, siempre funciona):** el «cerebro de la academia» (`src/academia/instructor.js`, `fallas.js`, `practica.js`)
sale de las respuestas que ya están en la base:
- **Modelo de cada alumno**: dominio por tema, la idea equivocada que más elige (la del paquete para esa opción), si repite
  la MISMA opción mala, si responde con prisa (malas en menos de 7 s), a qué hora estudia, Test Guide contra Modo reto, su
  ritmo contra el plan. De ahí su **estilo**: paso a paso, con un ejemplo de vuelo, claro o técnico.
- **«Tu instructor dice…»** en Inicio y al empezar cada tema: UN paso concreto con su botón (repasar lo que vence, la
  tarjeta que explica su error, el Modo reto, el tema que sigue, el examen). Cada alumno ve **«Instructor: modo básico (sin
  IA)»**, **«Instructor con IA: te da seguimiento»** o **«IA en espera»**.
- **Práctica del instructor** (`{ tipo: 'instructor' }`, con `materia` y `tema` = el refuerzo de ese tema): sus fallas
  primero, lo que vence hoy, lo débil, lo nuevo, mezclado (nunca dos seguidas del mismo tema). Siempre las 3 opciones
  originales; no aprueba nada. Los temas y los exámenes siguen igual (su orden y el 90 %).
- **«Explícamelo de otra forma»** en cada pregunta respondida: la respuesta del Test Guide, la que eligió, la idea exacta que
  la confundió (o la trampa del reto), la explicación sencilla y la tarjeta de la lección que mejor lo explica. Solo de una
  pregunta que respondió en SU intento (la opción sale de la base): nunca se puede sacar una respuesta antes.
- **Fallas registradas** (tabla `academia_fallas`): la misma pregunta fallada 3 veces (o 2 del mismo tema en un examen o
  en el examen de un tema; los dos números los pone el dueño en Administrador → Pagos) queda como falla: activa → en
  refuerzo → superada (3 aciertos seguidos en 2 días distintos). Nunca se borra. Al crearse, ella y las preguntas que más se
  le parecen del mismo tema van al repaso de hoy; al abrir el tema, la tarjeta que la explica sale primero («Refuerzo para
  ti»). Inicio muestra arriba **«Tu plan de refuerzo»** («Debes repasar: … (fallaste 4 veces)», «Repasar ahora»), el camino
  marca «Refuerzo» en esos temas, Progreso tiene **«Lo que hicimos por ti»** y la ficha del alumno (Débiles) sus fallas.
- **Plan para pasar la próxima vez** al no aprobar un tema o un examen: en qué falló (por tema, con la idea), qué releer, las
  preguntas del Test Guide para practicar, videos y cuándo volver a tomarlo (después del refuerzo).
- **Dudas** en cada tema: la tarjeta que más se parece a lo que escribió.

**Con IA (solo si el dueño lo enciende):** Administrador → Inteligencia artificial → «Instructor con IA para los alumnos»
(necesita la IA encendida) y su modelo: **Claude Sonnet 5.5** (recomendado) o **Haiku 5.5** (unas 20 veces más barato).
La IA explica de otra forma, responde dudas solo con las tarjetas del tema, da el consejo de la semana o del examen y es el
**Profesor virtual** (un chat, `#profesor`). Reglas: lo hace el trabajador (tarea `academia.instructor`; el servidor web arma el
pedido y nunca llama a la IA); la pregunta y sus opciones viajan TAL CUAL y la IA debe devolver cuál es la correcta: si no
coincide con el Test Guide, su respuesta no se usa ni se guarda; nunca se manda el nombre ni el usuario del alumno; las
explicaciones se guardan (en `ajustes`) por pregunta, opción, estilo y modelo, y otro alumno que elige lo mismo no se vuelve a
pagar; ante cualquier error o tope, sigue lo básico. Lo peor que cuesta un uso con Sonnet es ~US$0.045 (lo normal ~US$0.011);
con Haiku ~US$0.002 (~US$0.0006). Lo paga **la cuenta del alumno**: para que un alumno tenga IA hacen falta la IA encendida,
el instructor encendido, un **tope de plan mayor que US$0** y **«Permitir IA»** para esa cuenta (desde Tailscale). Si falta
algo, ese alumno ve «modo básico». La cuenta del administrador gasta solo desde Tailscale. «Ver cómo trabaja» (en la misma
pantalla) muestra una pregunta sin IA y con IA lado a lado; «Conectar la IA» explica paso a paso cómo poner las claves.

**Tiempo con IA y pagos** (tablas `academia_ia_minutos` y `academia_pagos`): un «minuto de instructor IA» = un uso (una
explicación, una duda, un consejo o un mensaje al Profesor virtual). Cada alumno empieza con 20 minutos de regalo (el dueño lo
cambia, y también el saldo de cada uno). Se cobra al pedir y se devuelve solo si la IA no respondió; nunca baja de 0; sin
minutos no se llama a la IA y sigue el básico. «Pedir más tiempo con IA» (`#tiempo-ia`) muestra los datos para transferir que
el dueño escribe en Administrador → Pagos (solo en la base; nunca en el repositorio), los paquetes y la espera («En revisión —
la verificación puede tardar hasta 24 horas», editable). El alumno sube la foto del comprobante (JPG, PNG o WEBP de verdad,
hasta 5 MB; queda en `OPORTIA_DATOS/academia/pagos/`, no va en las copias; la ven solo él y el administrador). Administrador →
Pagos (con el número de pendientes): aprobar (suma los minutos una vez) o rechazar con un motivo que el alumno ve. Ojo: los
minutos solos no encienden la IA de un alumno (también hacen falta su tope de plan y «Permitir IA»); Pagos lo dice al lado de
cada saldo y al aprobar. Cualquier administrador puede aprobar o rechazar; cambiar datos y saldos es solo del dueño. Cambiar los
datos de pago, el regalo, un saldo, los umbrales de fallas o dar el Profesor virtual es solo del dueño desde Tailscale. El
Profesor virtual es para quien tiene un pago aprobado o a quien el dueño se lo da; nunca muestra un enlace que escriba la IA:
solo los videos de YouTube que el dueño elige por tema (Administrador → Pagos → Videos) y un enlace a la búsqueda de YouTube.

**¿Estás listo para el examen oficial?** (Progreso, y la ficha de cada alumno): un veredicto estricto sobre el banco del Test
Guide —«Todavía no», «Casi» o «Listo para presentarte»— con «Cómo lo pienso» (cada regla ✔/✘ con su número: acierto ≥ 90 %,
cobertura ≥ 95 %, las 11 materias con contenido (con menos, nunca «Listo»), 3 exámenes recientes ≥ 90 %, memoria ≥ 80 % acertadas otra vez 2 días después, sin fallas activas, 7 días y 5
días de estudio), el paso que más importa, la probabilidad estimada (con el aviso de que no garantiza nada), cada materia, y
«Aprobaste, pero te recomiendo repetirlo porque…» cuando un aprobado tiene señales de suerte (`src/academia/preparado.js`).

**Administrador → Aprendizaje** (`src/academia/aprendizaje.js`, de todos o de un alumno): acierto la primera vez contra las
siguientes y por semana, retención a 2 y 7 días, de falladas a dominadas, cada tema con y sin el video visto, «Clases para
mejorar», fallas superadas (y en cuántos días), acierto antes y después del refuerzo, «Explícamelo» con IA y sin IA, las
preguntas más difíciles con la opción mala más elegida, minutos de estudio por día, rachas y plan. Cada número lleva su n;
con menos de 10, «aún sin datos suficientes».

**Modo reto más difícil:** al subir un paquete, las opciones del reto que parecen fáciles (largo muy distinto de la correcta,
«siempre/nunca», cifras o unidades distintas, fuera del tema, casi iguales) salen como avisos; repetir una opción original
(sin mirar mayúsculas, tildes ni signos) es un error. `node scripts/reto-faciles.mjs paquete.json [--md|--json]` las lista
para volver a escribirlas (no cambia nada; el enunciado, las opciones y la respuesta del Test Guide nunca se tocan).

Pruebas: `test/instructor.test.js`, `test/instructor-fallas.test.js` y `test/instructor-ia.test.js` (con el proveedor falso).

### Formato del paquete, versión 1
Un JSON (hasta 12 MB) y sus figuras (PNG, JPG o WEBP, hasta 8 MB cada una). Se revisa entero ANTES de escribir nada; los
errores salen con su ruta exacta (`materias[0].temas[1].preguntas[5]: pregunta_desconocida`). Los textos se guardan y se
muestran tal cual (sin recortar ni normalizar). Subir el mismo JSON otra vez sigue la misma versión (para completar figuras);
otro JSON es una versión nueva. Nunca se pisa ni se borra una versión; desde la 0.7.1 puede haber varias en uso (cada materia, de la última puesta en uso que la trae: ver «El contenido llega solo desde Google Drive»).
```
{
  "formato": "academia-enalas", "version": 1,
  "nombre": "…", "edicion": "…" (opcional), "muestra": false (opcional),
  "libros": [ { "id": "jeppesen-es", "titulo": "…", "idioma": "es" | "en" } ],
  "materias": [                       // de las 11, en este orden (pueden faltar): factores_humanos, sistemas, aerodinamica,
    { "id": "factores_humanos",       // ambiente_vuelo, rad, poh, comunicacion, meteorologia, rendimiento, navegacion, sms
      "temas": [ { "id": "hipoxia", "titulo": "…",
        "secciones": [ { "titulo": "…", "texto": "…", "nota": "diferencias entre libros (opcional)",
                         "fuentes": [ { "libro": "jeppesen-es", "capitulo": "…", "seccion": "…", "pagina": "…" } ] } ],
        // 0.7.2 (opcional): una sección ya partida en tarjeta. Las secciones de texto de siempre siguen sirviendo.
        //   { "tipo": "tarjeta", "titulo": "…", "puntos": ["…", …] (1 a 6), "recuerda": "…", "ejemplo": "…",
        //     "ingles": [ { "palabra": "…", "pronunciacion": "…", "significado": "…" } ],
        //     "visual": { "tipo": "ala" | "motor" | "instrumentos" | "meteo" | "escenario" | "titulo" | "cartel", "parametros": { … } },
        //     "fuentes": [ … ] }
        "reexplicacion": [ …secciones más sencillas, para cuando no aprueba (opcional)… ],
        "preguntas": [ "tg-0001", … ] } ],
      // 0.7.2 (opcional): el «Video resumen», lo primero del camino de la materia. El mp3 se sube y se baja de Drive como
      // los otros audios. Sin «escenas» (solo el audio): una escena con el título. Lo de más que traiga una escena se ignora.
      "video": { "titulo": "…" (opcional), "audio": { "archivo": "materia-01.mp3" },
                 "escenas": [ { "inicio_s": 0, "fin_s": 44.07, "subtitulo": "…", "texto_pantalla": "…",
                                "texto_narracion": "…" (opcional), "visual": { "tipo": "…", "parametros": { … } } } ] } } ],
  "preguntas": [
    { "id": "tg-0001", "origen": "test_guide" | "poh",
      "original": {                   // TAL CUAL del Test Guide (o del texto del POH)
        "numero": "…", "seccion": "…", "enunciado": "…",
        "opciones": [ { "letra": "A", "texto": "…" }, … ], "correcta": "B",
        "explicacion": "…", "figura": "12" | null, "pagina": "…" },
      "fuente": { "libro": "poh", "capitulo": "…", "seccion": "…", "pagina": "…" },   // obligatoria si origen = poh
      "sencilla": "Explicación sencilla (aparte, nunca mezclada con la original)",
      "errores": { "A": "idea equivocada de quien elige A", "C": "…" },              // solo opciones incorrectas
      "ingles": [ { "palabra": "…", "pronunciacion": "…", "significado": "…", "ejemplo": "…" } ],
      // 0.8.0 (opcional): el «Modo reto»: EXACTAMENTE 2 opciones incorrectas nuevas (más engañosas), distintas entre sí
      // y de las originales; «porque_es_incorrecta» obligatorio, «trampa» (la idea equivocada que tiende) opcional.
      "reto": { "opciones": [ { "texto": "…", "porque_es_incorrecta": "…", "trampa": "…" }, { "texto": "…", "porque_es_incorrecta": "…" } ] } } ],
  "figuras": [ { "numero": "12", "archivo": "figura-12.png", "titulo": "…" (opcional), "sha256": "…" (opcional) } ]
}
```
Cada pregunta está en un solo tema; su `id` no cambia entre versiones (el progreso se guarda por ese id). Las preguntas
creadas del POH llevan `origen: "poh"` y nunca se muestran como del Test Guide. Rutas: `POST /api/admin/academia/paquetes`
(el JSON), `POST /api/admin/academia/paquetes/:id/figuras/:archivo` (una figura, el cuerpo es la imagen), `POST
/api/admin/academia/paquetes/:id/activar`.

### El contenido llega solo desde Google Drive (0.7.1)
El dueño tiene una carpeta de Google Drive compartida como «cualquier persona con el enlace»; ahí (o en sus subcarpetas, hasta
dos niveles) se ponen los `paquete-*.json` con sus figuras y sus audios. En **Administrador → Contenido → Carpeta de Drive** se
pega el enlace UNA vez («Probar» dice qué encuentra; «Guardar»). El enlace no es secreto pero NUNCA va al repositorio: queda en
los ajustes de la base (`academia.drive.carpeta`, solo el id). Desde ahí, la tarea `academia.drive` del trabajador revisa la
carpeta cada hora (a los :23) y con «Buscar ahora» (`src/academia/sincronizar.js`):
- **Sin cuenta ni clave**: lista con `https://drive.google.com/embeddedfolderview?id=<carpeta>` (una página HTML de la que
  solo se sacan los enlaces `/file/d/<id>` y `/drive/folders/<id>` con su nombre) y baja con
  `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`, por la única puerta a la red
  (`src/ia/llamar.js`). Las redirecciones se siguen (hasta 3) SOLO dentro de esos dos servidores; a cualquier otro (por ejemplo,
  la página para entrar con una cuenta, si la carpeta dejó de ser pública) no. `src/academia/drive.js` es el único archivo que
  los nombra (`test/reglas.test.js`). Se probó contra un Drive falso con un HTML escrito para imitar al de Google: si Google
  cambia su página, «Probar» lo muestra (0 archivos) y la revisión lo anota; nada de lo que está en uso se quita.
- **Topes**: JSON 12 MB, imagen 8 MB, mp3 40 MB (cada uno se escribe por pedazos al disco, nunca entero en memoria salvo el JSON
  al revisarlo), 400 MB por revisión, 40 carpetas, 500 entradas por carpeta, 2 MB de página, 10 minutos por revisión. Lo que
  no alcanza sigue en la próxima: nada se repite.
- **Cada paquete** por su huella: si es nuevo se revisa con el mismo revisor y entra como **versión nueva** (nunca pisa otra);
  si la lista dice la misma fecha que la vez anterior ni se baja. Uno mal armado no entra y se informa (con sus errores) en
  cada revisión mientras siga en la carpeta, sin volver a revisarlo.
- **Quién revisa el JSON**: el trabajador lo baja y lo deja en `academia/drive/entrante.json`; lo revisa y lo guarda el
  servidor web (`src/academia/importador.js`, cada 5 s, una sola vez aunque se caiga a mitad), y la misma tarea sigue
  después (figuras, audios, ponerla en uso). Por qué: medido con un JSON de 12 MB con tildes, revisarlo sube la memoria
  del trabajador de ~70 a ~140 MB, y el trabajador sale solo a los 120 MB (eso cuenta para el modo seguro). Así el
  trabajador queda en ~96 MB como máximo mientras baja (y ~75 MB después). El trabajador solo lee el `manifiesto.json`
  de cada versión (qué figuras, audios y materias nombra; unos pocos KB), que el servidor web escribe.
  Las figuras y audios se buscan por nombre en el árbol (primero junto al paquete, después debajo de su carpeta, después en el
  resto; dos con el mismo nombre al mismo nivel solo se aceptan si el paquete trae su `sha256`). Una versión que queda
  «lista» se **pone en uso sola**, una vez (si después el administrador pone otra, se respeta).
- **Varias versiones en uso**: cada materia sale de la versión puesta en uso MÁS RECIENTEMENTE entre las que la traen (con un
  tema o más). Un paquete de la materia 1 y después otro de la materia 2 se suman; una versión nueva de la materia 1 tapa a la
  vieja. La lista va en `ajustes` (`academia.en_uso`), sin cambio de base; `academia.paquete_activo` sigue diciendo la última.
  Con varias, una figura se pide como `<versión>~<número>` (dos versiones pueden tener la figura «1»).
- **Lo que se ve**: Contenido muestra «Última revisión: hoy 3:10 p. m. · Factores humanos actualizada», las revisiones de antes
  (qué encontró, qué entró, qué falló) y qué materias da cada versión. Si la carpeta no se puede leer se abre el aviso
  `drive_sin_acceso` (solo en la pantalla) y se cierra solo al volver. Los alumnos no ven nada de esto.
- **Audio**: una materia o un tema puede traer `"audio": { "archivo": "resumen.mp3", "titulo": "…" (opcional), "sha256": "…"
  (opcional) }`. Es opcional: sin el archivo el contenido se usa igual y el reproductor no sale. Se sirve solo con la sesión
  abierta, por partes (`Range`, como lo pide el iPhone): `GET /api/academia/audio/<versión>~<archivo>`. A mano se sube con
  `POST /api/admin/academia/paquetes/:id/audio/:archivo` (o eligiéndolo junto con el JSON en Contenido → Subir).
- Las pruebas (`test/drive.test.js`) usan un Drive FALSO en 127.0.0.1 (`config.driveBases`, solo en modo de prueba).

### Vuelta atrás
La 0.10.0 agrega el cambio de base 8 (solo 3 tablas nuevas `academia_fallas`, `academia_ia_minutos`, `academia_pagos`, sin
CHECK ni UNIQUE). Una 0.9.0 abre esa base sin tocarlas (nunca las lee); sus fallas, minutos y pagos quedan ahí para cuando
vuelva la 0.10.0. El trabajador sigue pidiendo la base 6.
La 0.8.0 no cambia la base. Si se vuelve a la 0.7.2: los intentos «reto» y «errores» quedan en la base y la 0.7.2 los
ignora para aprobar (solo mira «tema» y «examen»); sus respuestas siguen contando para puntos y racha.
La 0.7.2 tampoco cambia la base (plan, grupo, videos vistos y temas leídos van en `ajustes`); una 0.7.1 con un paquete que
trae `video` o secciones `tarjeta` lo rechaza al revisarlo, pero sigue usando las versiones que ya tenía.
La 0.7.1 no cambia la base: todo lo nuevo va en `ajustes`. Si se vuelve a la 0.7.0, usa la última versión puesta en uso
(`academia.paquete_activo`) sola, y no revisa Drive; al volver a la 0.7.1, todo sigue.
El cambio de base 7 solo agrega 4 tablas `academia_*` (sin CHECK, sin UNIQUE). `test/ensayo-0.5.1.mjs` (a mano, necesita la
historia de git) comprueba que la 0.5.1 abre una base 7 sin tocarla, que su trabajador, su servidor y sus copias funcionan, que
restaura una copia de la 0.7.0 igual, y que al volver la 0.7.0 todo sigue. (`test/ensayo-0.4.1.mjs` ya no aplica: espera la base 6.)

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
  - Los avisos se ven en Administrador; desde la parte e, los graves también llegan por Telegram (la tabla `avisos`
    guarda cuántas veces pasó, la primera y la última vez, el detalle y si ya se mandó).
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
- Fase 1, parte d (versión 0.4.0, cambio de base 5): IA opcional con topes de gasto (ver «IA opcional y claves»).
  - Llega apagada y con tope US$0; el motor propio sigue haciendo todo. Base: tablas `secretos` (claves cifradas),
    `ia_llamadas` (cada uso pagado, con su precio) e `ia_bloqueos` (cuántas veces NO se usó y por qué), sin borrar nada.
  - Topes por mes de cobro: general, por cuenta según su plan (US$0 por defecto: solo la cuenta del administrador usa la IA,
    con el tope general), por proyecto (desde la versión aprobada, para la fase 2) y por uso; además un máximo de usos por
    hora. Se aparta el peor caso antes de cada uso y se ajusta con lo que informa el proveedor.
  - Proveedores: Claude (Anthropic) y ChatGPT (OpenAI, sin gastar hasta confirmar su precio), con la URL oficial fija; las
    pruebas usan un proveedor falso en 127.0.0.1 (nunca una API de verdad ni una clave de verdad).
  - Pantallas (con colores, íconos, números grandes y la barra de lo gastado contra el tope): Administrador → «Servicios»
    (Inteligencia artificial y Claves), Administrador → Inteligencia artificial (encender y apagar, tope del mes, topes de las
    otras cuentas, «Ayuda en proyectos», proveedores, detalle del gasto y «Se paga aparte»), Administrador → Claves (pegar,
    probar gratis, desactivar, activar una anterior, «Probar y reanudar»), «Pedir ayuda a la IA» en la versión que espera
    aprobación (solo aparece cuando se puede usar), la marca «Hecha con ayuda de IA» con lo que cambió y una línea en Inicio
    con lo gastado.
  - API: `GET /api/admin/ia`, `POST /api/admin/ia/apagar`, `POST /api/admin/ia/ajustes`, `GET /api/admin/ia/consumo`,
    `GET|POST /api/admin/claves`, `POST /api/admin/claves/:id/probar`, `POST /api/admin/claves/:id/activa`,
    `GET /api/proyectos/:id/ayuda-ia` y `POST /api/proyectos/:id/versiones/:numero/ayuda-ia`.
  - Arreglo de paso: abrir OPORTIA directo en Inicio con un proyecto pendiente ya no muestra «No se pudo cargar OPORTIA»
    (Inicio ahora carga los nombres de negocios y lugares antes de dibujar esa lista).
  - Preguntas para el dueño (cada una tiene su respuesta segura si no contesta): «Ayuda en proyectos» (apagada), leer
    `secrets.env` de JARVIS (no), modelo (Haiku 5.5), IA para las otras cuentas (US$0) y ChatGPT como segundo (no).
- Rapidez (versión 0.3.3, sin cambio de base): por Funnel en el teléfono, volver a abrir OPORTIA pasa de unos 4 s a 1,1-1,2 s (de 6 s a 1,8 s con una red lenta; unos 0,6 s si la conexión sigue abierta) y la primera vez de 4 s a 1,7-2,2 s. Los archivos van comprimidos, con ETag y su huella `?v=` (index.html se revisa siempre: una actualización se ve al instante), y al abrir se pide a la vez lo que necesita la pantalla. Inicio ya no falla al abrir con proyectos esperando aprobación.
- Pantallas para PC y teléfono (versión 0.4.1, sin cambio de base): en la PC el menú va a la izquierda y las tarjetas en 2 o 3 columnas; en el teléfono nada largo: Administrador va por pestañas (Resumen, Usuarios, Trabajo, Servidor, IA y gastos, Claves: `#admin`, `#admin/usuarios`, `#admin/trabajo`, `#admin/servidor`, `#ia`, `#claves`), cada proyecto también (Resumen con «Aprobar» a la vista, Lo que entendí, Versiones, Historial: `#proyecto/N`, `#proyecto/N/entendi`…), y las listas largas muestran las primeras con «Ver N más».
- Fase 1, parte e (versión 0.5.0, cambio de base 6): copias cifradas cada madrugada fuera del servidor, por Telegram, y
  avisos graves al Telegram (ver «Copias y avisos por Telegram»).
  - Base: tablas `copias`, `copia_partes`, `copias_llaves`, `canales` y `canal_envios` (solo se agregan filas; nada se
    borra). Una versión 0.4.1 abre esta base sin problema si el actualizador tuviera que volver atrás (`test/ensayo-0.4.1.mjs`).
  - Telegram es un «canal»: la forma de un adaptador (`src/canales/canal.js`) y la tabla `canales` (tipo, propósito,
    cuenta) son genéricas. Lo que hay hoy en `src/canales/canales.js` (unir el chat con el código, los avisos
    `telegram_falla`, el estado de la pantalla, el uso `telegram_bot`) es solo para el chat privado del dueño. Los canales
    de clientes de la fase 3 en adelante (Telegram, WhatsApp, Gmail) agregan su adaptador, su propósito, su uso de clave y
    su propia forma de unir el canal y de mostrarlo (por ejemplo, el permiso de Gmail o muchos chats por cuenta). Todo pasa
    por la única puerta a la red (`src/ia/llamar.js`); las pruebas usan un Telegram falso en 127.0.0.1
    (`test/telegram-falso.js`), nunca el de verdad ni un token de verdad.
  - Pantallas: Administrador → Copias (nueva pestaña), el Telegram en Claves (paso ① el bot, paso ② el chat con un
    código de 8 cifras), azulejos en el Resumen, una insignia en Inicio y «Última versión que no se instaló» en Servidor.
  - API: `GET /api/admin/copias`, `POST /api/admin/copias/ahora`, `POST /api/admin/copias/clave/{nueva,confirmar,comprobar}`,
    `POST /api/admin/telegram/{vincular,vincular/revisar,prueba,desvincular}`; el token va por `POST /api/admin/claves`.
  - Consola: `oportia-admin.mjs --copias=estado|ahora`, `--telegram=desvincular` y `deploy/oportia-restaurar.mjs`.
  - Preguntas para el dueño (cada una tiene su respuesta segura si no contesta; se pueden cambiar si las pides):
    1. Tu clave de recuperación: se muestra una vez, se escribe otra vez para comprobarla y se puede imprimir (guárdala en
       Contraseñas y en un papel).
    2. Dónde llegan avisos y copias: tu chat privado con tu bot (no un canal aparte).
    3. **⚠ Disco casi lleno: nunca se borra nada.** Con poco espacio dejo de guardar copias en el servidor, sigo con las de
       Telegram y te aviso; con menos de 300 MB paro todas (ver «El disco»).
    4. Sin clave de recuperación no hay ninguna copia de la noche (ni en el servidor ni en Telegram) hasta que la crees.
    5. Las copias del servidor también van con candado (iguales a las de Telegram).
    6. Hora de la copia: 4:40 a. m. de RD, todas las noches (después de la revisión de la base de las 4:10).
    7. Qué avisos van al Telegram: lo urgente con sonido, lo demás en silencio, «Ya se arregló» y «Volvió a pasar»; como
       mucho 10 por hora y 30 por día (lo urgente nunca se calla); sin recordatorio diario.
    8. Recordatorio para comprobar tu clave: cada 90 días, en silencio.
    9. Leer `update.log` y `version.bad` (solo leer) para avisarte de una actualización que falló o se devolvió: sí.
    10. Copias en modo seguro: en pausa (el aviso urgente llega igual).
    11. Cambiar la clave de recuperación: solo si tú lo pides (las copias viejas siguen necesitando la clave vieja).
- Claridad (versión 0.5.1, sin cambio de base): cada pantalla y pestaña empieza con una línea que dice para qué sirve; «Primeros pasos» en Inicio (y en una línea en Administrador → Resumen) con el avance sacado de datos de verdad; el botón (i) «¿Qué es esto?» junto a títulos y palabras, y la pantalla Ayuda (`#ayuda`, con buscador) que las lista todas; listas vacías con su dibujo y su botón; avisos cortos en vez de `alert()`; «IA y gastos» sin huecos en la PC. Solo pantallas (`public/guia.js` es nuevo); Administrador pide también `GET /api/proyectos`.

Plan completo: «OPORTIA: arquitectura y plan» y «OPORTIA: evaluación y plan ampliado».
