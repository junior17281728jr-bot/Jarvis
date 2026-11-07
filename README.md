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
antes quedan guardadas sin poder leerse y se pegan otra vez.
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

Plan completo: «OPORTIA: arquitectura y plan» y «OPORTIA: evaluación y plan ampliado».
