## nombre

Phase 1c final («C+»): one worker process supervised by src/server.js, niced on every thread, with fenced leases, resumable steps, time-fair turns, paced writes, safe mode and a non-blocking startup gate

## resumen

BASE CHOSEN. Combined judge scores: C 23.0 (7.6 + 7.5 + 7.9), B 22.7, A 20.6. The final design starts from C, cuts C down to fit one phase part, fixes every flaw the judges found, and takes the ideas they praised in A and B.

HOW IT WORKS (no unit change; systemd still runs exactly `node --no-warnings src/server.js` as jarvis):
- The web process opens the port first. Only after it holds the port does it start ONE worker process, src/tareas/trabajador.js. It starts it through /usr/bin/nice -n 10, so all 7 threads run at low priority (checked in this session: 10,10,10,10,10,10,10).
- The worker has V8 caps (--max-old-space-size=64 --max-semi-space-size=2; the heap limit measured 70 MB) and sets oom_score_adj 500 on itself.
- The screens never wait on the worker. The two processes share oportia.db in WAL mode. IPC is used only for 'listo', 'latido' and 'saliendo' (worker to web) and 'despertar' (web to worker).
- Every write the worker makes goes through one «escritor» queue. It uses short BEGIN IMMEDIATE transactions and pauses max(10 ms, 2× the write's duration) before the next write, so the web always gets the lock.

THE QUEUE:
- A task is a job made of short, resumable steps; its checkpoint is saved in `punto`.
- Turns are fair by time used: first between accounts, then between projects inside an account, with a 60 s credit cap.
- 1c runs at most 1 normal and 1 large ("grande") task at a time.
- Leases are fenced by dueno + tomas and renewed with each heartbeat.
- Retries back off at 1 min and about 4 min; the task fails on the 3rd consecutive failure, and the project is marked con_errores in the SAME transaction.
- Waits for an AI spending cap or for politeness to a website are not counted as failures.
- A type that keeps failing trips its own breaker, which lifts by itself.
- Low memory or low disk stops new work, except the monitoring task.
- Recovery after a crash or a restart is immediate. A worker crash costs the task one attempt; a power cut costs nothing. Tasks that must not repeat go to 'revisar'.

SAFE MODE:
- Manual: from the screen, or from the console with no restart needed.
- Automatic: 5 abnormal worker exits in 15 min, 3 unclean service ends in 30 min, a database the worker cannot open, or a failed quick_check.
- Causes that new code can fix lift ONCE by themselves when the code fingerprint changes. Manual safe mode and a damaged database never lift by themselves.

STARTUP GATE: for the first 90 s after a restart, /api/setup answers 503 'arrancando' at once, without waiting. It does so until the worker reports 'listo', or for the rest of the window after 3 failed boots. The updater therefore rolls back a version whose worker cannot start against the real data. The code is rolled back, never the data.

WHAT 1c REALLY DOES:
- sistema.vigilar, hourly at :07 RD: raises or clears queue avisos and checkpoints the WAL when it grows.
- sistema.base, nightly at 04:10 RD, 2 steps: quick_check, then optimize plus a PASSIVE checkpoint.
- The web takes one health sample per hour, so samples continue in safe mode.
- Projects get NO tasks until phase 2, and the screens say so.

FIXES TO C'S FLAWS:
- A failed quick_check now turns on safe mode ('base_danada').
- There is no silent 'detenido' state. Exit 3 means respawn plus a count; exit 4 means safe mode with a 'grave' aviso.
- The gate never blocks and reveals nothing about the queue. arranque.test polls for 20 s. Signals from outside, such as the OOM killer, do not count toward the gate.
- Test task types moved to test/tareas-prueba.js.
- enTransaccion nests with SAVEPOINTs.
- One CHECK remains (tareas.estado, all 6 states); the 13 others are gone.
- Auto-lift happens only for code-fixable causes and only on a new code fingerprint. Crash counts include only runs of the same code, so a rollback is never punished for the broken version's crashes.
- `repetible` is stored on each row, so a code rollback can never resend an email.
- The supervisor polls the safe-mode flag every 30 s.
- Cut: tarea_programas (replaced by B's slot keys), 'creada'/'hecha' events, the manual buttons «Pausar tipo» and «Revisar ahora», the 7 test env knobs (now 1 JSON knob), and the 3rd concurrent slot.

GRAFTS:
- From A: the listen-first lock, plus exit(1) only on a listen error; the escritor; SAVEPOINT nesting; exiting with code 75 before V8 aborts on memory; 'senal' exits not counted as crashes; the parent recovers a dead child's tasks at once; the rescue CLI; the event-loop p99 shown on screen; the rules «transactions only in db.js» and «the worker's import graph has no http».
- From B: `repetible` per row; slot keys instead of a schedule table; one fence per run created in the same transaction as recovery; ON CONFLICT DO NOTHING instead of INSERT OR IGNORE; the 4 KB result cap; Telegram alerts for safe mode sent from the WEB in 1e; one commit.

VERIFIED IN THIS SESSION (repository untouched):
- In a scratch copy of fase-1b (/tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/final-emga) I made 3 changes: nested enTransaccion plus conectarBase, usuarios.js using the shared enTransaccion, and the new «transactions only in db.js» rule. The suite passes 92/92 under env -i, so A's rule no longer breaks.
- Experiments are in /tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/final-exp. They confirm:
  - the migration 4 hash, and that it passes the rules regex;
  - ON CONFLICT DO NOTHING covers both the UNIQUE column and the partial unique index, and does NOT hide CHECK violations;
  - the partial-index upsert for avisos;
  - SAVEPOINT rollback;
  - spawning through nice keeps IPC and the main-module check working;
  - the RD time-slot cases;
  - the claim query uses the tareas_por_tomar index.
- Not built end to end. C's prototype, which this design builds on, passed 112/112 on 1 CPU.

## proceso

START (src/server.js; the unit is unchanged)
```js
process.umask(0o027);
const config = leerConfig();
let db = null;
try { db = abrirBase(config); } catch (e) { console.error('Base de datos no disponible:', e.message); }
const supervisor = db ? crearSupervisor({ db, config, version: VERSION, codigo: HUELLA }) : null;
const servidor = crearServidor({ db, supervisor });
let arranque = null;
const alFallarPuerto = e => { console.error('No se pudo abrir el puerto:', e.message); process.exit(1); };
servidor.once('error', alFallarPuerto);
servidor.listen(config.puerto, config.host, () => {
  servidor.off('error', alFallarPuerto);
  servidor.on('error', e => console.error('Error del servidor (sigue):', e));
  console.log(`OPORTIA ${VERSION} escuchando en ${config.host}:${servidor.address().port}`); // arranque.test reads this line
  if (!db) return;
  try { arranque = registrarArranque(db, { version: VERSION, codigo: HUELLA, pid: process.pid }); } catch (e) { console.error(e); }
  supervisor.iniciar();
});
```
- Holding the port is the lock: a second copy that loses the port never starts a worker. On EADDRINUSE the process exits(1) BEFORE writing anything to the database; today it stays alive without listening. systemd retries every 5 s, and at 2 starts per 10 s it never reaches StartLimitBurst.
- An exit after listen keeps the existing «log and continue» handlers.
- HUELLA is computed in src/app.js: the first 12 hex characters of a sha256 over the sorted paths and contents of src/**/*.js plus package.json. It takes about 5 ms at import. It is the «same code» identity used by safe mode, so auto-lift works even if nobody bumps the version.

supervisor.iniciar()
1. `m = revisarAlArrancar(db, { codigo: HUELLA, version })`. If safe mode is automatic, its motivo can be fixed by new code, and m.codigo !== HUELLA, it is lifted once, with an audit row.
2. Timers, all unref'd:
   - watchdog every 10 s;
   - safe-mode flag poll every 30 s;
   - health check every 60 s, which takes at most one sample per UTC hour.
3. If safe mode is on: fase 'modo_seguro' and the gate is 'no_aplica'. Otherwise encender().

encender(), in src/tareas/supervisor.js, the ONLY file that imports node:child_process:
- `corrida = nuevaCorrida(db, { version, codigo })` inserts the run row BEFORE the spawn, so even a boot that dies at import is recorded.
- The spawn:
  `spawn(NICE ?? process.execPath, NICE ? ['-n','10', process.execPath, ...BANDERAS, ruta] : [...BANDERAS, ruta], { stdio: ['ignore','pipe','pipe','ipc'], serialization: 'json', env: { ...process.env, ...entorno, OPORTIA_DB: config.archivoBase, OPORTIA_COPIAS: config.carpetaCopias, OPORTIA_DATOS: config.carpetaDatos ?? dirname(config.archivoBase), OPORTIA_PROCESO: 'tareas', OPORTIA_CORRIDA: corrida, ...(tiemposTrabajador ? { OPORTIA_TAREAS_TIEMPOS: JSON.stringify(tiemposTrabajador) } : {}) } })`.
- NICE = the first of /usr/bin/nice and /bin/nice that exists; every path is absolute, so it works under env -i.
- BANDERAS = ['--no-warnings', '--max-old-space-size=64', '--max-semi-space-size=2'].
- The child is never detached, so it stays in the same cgroup and process group.
- stdout and stderr are re-emitted line by line as '[tareas] …' into the journal, so an orphan can never hold a test's pipe.
- A spawn that throws (ENOMEM or EAGAIN) counts as an exit with como 'no_arranco'.

WORKER BOOT (trabajador.js principal(); it runs only when `import.meta.url === pathToFileURL(process.argv[1]).href`, checked under nice)
1. Writes '500' to /proc/self/oom_score_adj (try). If os.getPriority() < 10, calls os.setPriority(10); this is the fallback when nice is missing.
2. Checks that every entry in the type registry has a handler; otherwise it exits 1.
3. `db = conectarBase(config, { versionMinima: 4 })`, which:
   - calls revisarModoPrueba;
   - requires the OPRT marker and WAL mode;
   - never creates the file, migrates or copies;
   - sets busy_timeout 5000, foreign_keys and synchronous NORMAL.
   Any failure means exit 4.
4. It requires OPORTIA_CORRIDA (missing means exit 1: only the supervisor starts it). `escritor = crearEscritor(db)`.
5. `await escritor.escribir(() => empezarCorrida(db, { corrida, pid, alFallar: marcarConErrores }))`. In ONE transaction (B), this:
   - records its pid;
   - marks other open runs 'perdida' if their pid is dead, their heartbeat is older than 45 s, or they never got ready within 60 s;
   - recovers their tasks.
6. If safe mode is on: sends {tipo:'saliendo', motivo:'modo_seguro'} and exits 0.
7. Runs the first `programar`, writes listo_en, sends {tipo:'listo', corrida, pid, version} and logs `trabajador 0.2.0 listo (pid N)`. Then:
   - heartbeat every 15 s;
   - ciclo every 5 s, or on 'despertar'.
8. Handlers:
   - SIGTERM and SIGINT → parar('senal');
   - 'disconnect' → parar('sin_padre');
   - uncaughtException or unhandledRejection → terminarCorrida('caida', message) and exit 1 (fail fast: a stray promise from a timed-out step is already handled by Promise.race).

SUPERVISION. FASES_TRABAJADOR = arrancando | esperando | trabajando | reiniciando | sin_respuesta | modo_seguro | parando. There is no silent 'detenido'.
- Watchdog: no 'listo' within 30 s → SIGKILL, como 'no_arranco'. No heartbeat for 90 s → SIGKILL, como 'colgado'.
- On 'exit' (code, signal), the supervisor uses the last {tipo:'saliendo', motivo} message and its own flags:

| Situation | como | Counts as abnormal | Then |
|---|---|---|---|
| s.parando (cerrar) | normal | no | nothing |
| saliendo modo_seguro | modo_seguro | no | stay off |
| saliendo senal, while the parent is not stopping (systemd hit the cgroup first) | senal | no | respawn in 2 s; cerrar() cancels it |
| code 76 | zombis | no | respawn in 2 s (each zombie step was already a tiempo_agotado failure) |
| code 75 | memoria | yes | backoff |
| code 3 (its heartbeat was fenced) | reemplazada | yes | backoff |
| code 4 | base_no_compatible | yes | outside the gate window: safe mode 'base_no_compatible' plus a 'grave' aviso |
| our watchdog kill | colgado / no_arranco | yes | backoff |
| anything else (code 1, SIGABRT, a SIGKILL from outside) | caida / no_arranco | yes | backoff |

- Then, in short transactions in the web process:
  1. `terminarCorrida(...)` with WHERE termino_en IS NULL, so the worker's own, more precise reason wins.
  2. `recuperarAbandonadas(db, { corridas: [corrida], conFallo: ANORMALES.includes(como), alFallar: marcarConErrores })`. No task is left falsely 'en_curso', even when no new worker starts.
- Backoff: inside the gate window and before any 'listo', retries come at 0.5, 1 and 1.5 s. Otherwise min(300 s, 1 s × 2^(n−1)); n resets if the child lived more than 10 min.
- Safe mode 'trabajador_inestable' (only outside the gate window, checked after each exit and once when the window closes) turns on when this query returns 5 or more:
  `SELECT COUNT(*) FROM trabajador_corridas WHERE codigo = :HUELLA AND termino_en >= :hace15min AND como_termino IN ('caida','colgado','no_arranco','memoria','reemplazada','base_no_compatible')`.
  The count includes earlier service lives of the SAME code.
- Every 30 s the supervisor reads 'tareas.modo_seguro', in case the console tool changed it:
  - if it turned on and the child lives: SIGTERM (the worker also sees the flag in its own 5 s ciclo and exits with 'modo_seguro');
  - if it turned off and the fase is 'modo_seguro': clear the counters and encender().

STARTUP GATE. supervisor.estadoArranque() returns 'arrancando' | 'listo' | 'fallido' | 'no_aplica'.
- 'no_aplica' when:
  - 90 s have passed since iniciar();
  - safe mode was on at iniciar();
  - the admin changed safe mode during the window.
- 'listo' is permanent once the first 'listo' arrives.
- 'fallido' comes after 3 boot failures in the window: exits before 'listo' with a numeric code, or our own watchdog kill. A SIGKILL from outside (OOM killer) does not count, so a transient memory spike cannot mark a good commit bad.
- /api/setup returns 503 `{app:'oportia', estado:'arrancando', version, error:'arrancando'}` for both 'arrancando' and 'fallido'. It answers synchronously, never waits, and reveals no queue details. It returns 200 in every other case.
- The worker boots in 0.2–1.4 s (C's measurement), and the updater's first curl comes 3 s after `systemctl restart`. So a healthy version shows 200 on the first check. A worker that cannot boot keeps returning 503 through the updater's 60 s loop, so the updater rolls the code back.
- public/app.js retries 'arrancando' every 1 s, for up to 60 s, behind «OPORTIA está arrancando…», so users never see the error page.

STOP (systemctl stop/restart, the updater). KillMode stays at its default, control-group, so systemd sends SIGTERM to both processes.
- Worker, parar(motivo):
  1. sends 'saliendo' FIRST;
  2. stops claiming;
  3. waits up to 3 s for the steps in progress;
  4. aborts the rest through their AbortSignal;
  5. `devolverLasMias` (back to 'lista' with no failure; 'revisar' if not repeatable);
  6. terminarCorrida(como), db.close(), exit. Hard exit after 5 s.
- Web, cerrar(), which runs once:
  1. registrarCierre(arranque.id) FIRST;
  2. servidor.close() and closeIdleConnections();
  3. `await supervisor.parar()` (SIGTERM, wait up to 5 s, then SIGKILL; it also clears every timer);
  4. db.close(), exit(0). Hard exit after 8 s, far below TimeoutStopSec=90 s.
- The updater's rm/cp of src/ while the service runs is harmless: the worker loads its modules at boot, and a respawn during the copy just fails and backs off until the restart.

PARENT DEATH (OOM of the web, a native crash, SIGKILL)
- The child gets 'disconnect' and runs parar('sin_padre').
- Under systemd, the cgroup is torn down before Restart=always.
- The next boot marks the open run 'perdida' and returns its tasks WITHOUT spending an attempt, because the whole service died. A repeat is caught by the 3-unclean-ends rule.
- Residual: outside systemd (only in tests), a worker whose thread is blocked AND whose parent died stays alive until the test's finally block SIGKILLs it.

MEMORY (512 MB). Figures measured in C; nice+flags measured here.
| Item | Size |
|---|---|
| Web | about 65 MB RSS, 15 MB private |
| Worker | about 19 MB private idle, 28 MB after load; a minimal niced child is 46 MB RSS, mostly the shared node binary |
| Heap cap | 70 MB |
| Steady OPORTIA total | about 90–110 MB RSS, with the binary counted once |

Ceilings:
- The worker exits 75 by itself when heap use is above 85 % of the limit or RSS is above 120 MB. This runs before V8's SIGABRT, so there are no core dumps.
- Below 80 MB MemAvailable it claims no normal task; below 100 MB, no large one.
- oom_score_adj 500 makes the kernel kill the worker, not the web.
- Worst case is about 65 + 120 MB RSS. The plan's 1 GB upgrade comes with phase 2, and CUPOS.normal rises to 2 then.

CPU: nice 10 is applied through exec, so the GC and libuv threads are niced too, unlike os.setPriority, which changes only the main thread. C measured the web's p99 at 7.0 ms with the worker burning the CPU, against 7.7 ms with no worker.

## esquema

Migration 4: append to MIGRACIONES in src/nucleo/migraciones.js. Put any explanation in a JS comment OUTSIDE the template. The text below includes the template's leading newline; its sha256 is 46758487c7db33997048188be268fea4420332e1b08bcc431d82114607529860. Add `4: '46758487c7db33997048188be268fea4420332e1b08bcc431d82114607529860'` to MIGRACIONES_PUBLICADAS in test/reglas.test.js.

What I checked:
- the hash, computed from /tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/final-exp/m4.js;
- the rules regex gives false (no DROP, RENAME, DELETE FROM, leading UPDATE/REPLACE, or INSERT OR REPLACE);
- running it twice changes nothing;
- it applies cleanly on top of migrations 1–3 in SQLite 3.53.4.

```js
  {
    id: 4,
    nombre: 'tareas',
    sql: `
CREATE TABLE IF NOT EXISTS tareas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  espacio_id INTEGER REFERENCES espacios(id),
  proyecto_id INTEGER REFERENCES proyectos(id),
  programa TEXT,
  clave_unica TEXT UNIQUE,
  carril_espacio TEXT NOT NULL DEFAULT 'sistema',
  carril_proyecto TEXT NOT NULL DEFAULT 'sistema',
  cupo TEXT NOT NULL DEFAULT 'normal',
  prioridad INTEGER NOT NULL DEFAULT 0,
  repetible INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'lista'
    CHECK (estado IN ('lista', 'en_curso', 'hecha', 'fallida', 'cancelada', 'revisar')),
  datos TEXT NOT NULL DEFAULT '{}',
  punto TEXT,
  resultado TEXT,
  pasos INTEGER NOT NULL DEFAULT 0,
  tomas INTEGER NOT NULL DEFAULT 0,
  fallos_seguidos INTEGER NOT NULL DEFAULT 0,
  max_fallos INTEGER NOT NULL DEFAULT 3,
  disponible_en TEXT NOT NULL,
  motivo_espera TEXT,
  dueno TEXT,
  arriendo_hasta TEXT,
  ultimo_error TEXT,
  ms_usados INTEGER NOT NULL DEFAULT 0,
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  empezada_en TEXT,
  terminada_en TEXT,
  actualizada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tareas_por_tomar ON tareas(estado, cupo, disponible_en);
CREATE INDEX IF NOT EXISTS tareas_terminadas ON tareas(estado, terminada_en);
CREATE INDEX IF NOT EXISTS tareas_por_espacio ON tareas(espacio_id, id);
CREATE INDEX IF NOT EXISTS tareas_por_proyecto ON tareas(proyecto_id, estado);
CREATE INDEX IF NOT EXISTS tareas_por_dueno ON tareas(dueno, estado);
CREATE UNIQUE INDEX IF NOT EXISTS tareas_una_viva_por_programa ON tareas(programa)
  WHERE programa IS NOT NULL AND estado IN ('lista', 'en_curso', 'revisar');
CREATE TABLE IF NOT EXISTS tarea_eventos (
  id INTEGER PRIMARY KEY,
  tarea_id INTEGER NOT NULL REFERENCES tareas(id),
  fecha TEXT NOT NULL,
  evento TEXT NOT NULL,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS tarea_eventos_tarea ON tarea_eventos(tarea_id, id);
CREATE INDEX IF NOT EXISTS tarea_eventos_fecha ON tarea_eventos(fecha);
CREATE TABLE IF NOT EXISTS tarea_carriles (
  carril TEXT PRIMARY KEY,
  virtual_ms REAL NOT NULL DEFAULT 0,
  peso REAL NOT NULL DEFAULT 1,
  usado_ms INTEGER NOT NULL DEFAULT 0,
  turnos INTEGER NOT NULL DEFAULT 0,
  actualizado_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trabajador_corridas (
  id INTEGER PRIMARY KEY,
  corrida TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  pid INTEGER,
  empezo_en TEXT NOT NULL,
  listo_en TEXT,
  latido_en TEXT,
  termino_en TEXT,
  como_termino TEXT,
  codigo_salida INTEGER,
  senal TEXT,
  memoria_mb REAL,
  pasos_hechos INTEGER NOT NULL DEFAULT 0,
  pasos_con_error INTEGER NOT NULL DEFAULT 0,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS trabajador_corridas_fin ON trabajador_corridas(termino_en);
CREATE TABLE IF NOT EXISTS servidor_arranques (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL,
  codigo TEXT NOT NULL DEFAULT '',
  pid INTEGER,
  empezo_en TEXT NOT NULL,
  termino_en TEXT,
  como_termino TEXT
);
CREATE INDEX IF NOT EXISTS servidor_arranques_inicio ON servidor_arranques(empezo_en);
CREATE TABLE IF NOT EXISTS salud_muestras (
  id INTEGER PRIMARY KEY,
  hora TEXT NOT NULL UNIQUE,
  fecha TEXT NOT NULL,
  memoria_total_mb REAL,
  memoria_disponible_mb REAL,
  swap_usada_mb REAL,
  web_mb REAL,
  trabajador_mb REAL,
  disco_libre_mb REAL,
  disco_total_mb REAL,
  base_mb REAL,
  wal_mb REAL,
  copias_mb REAL,
  carga_1m REAL,
  pantallas_p99_ms REAL,
  fila_lista INTEGER,
  fila_en_curso INTEGER,
  fila_fallida INTEGER
);
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY,
  clave TEXT NOT NULL,
  nivel TEXT NOT NULL DEFAULT 'atencion',
  para TEXT NOT NULL DEFAULT 'admin',
  detalle TEXT,
  veces INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  ultima_vez TEXT NOT NULL,
  resuelto_en TEXT,
  visto_en TEXT,
  visto_por INTEGER REFERENCES usuarios(id),
  enviado_en TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS avisos_abierto_por_clave ON avisos(clave) WHERE resuelto_en IS NULL;
CREATE INDEX IF NOT EXISTS avisos_fecha ON avisos(creado_en);
`,
  },
```

WHY IT LOOKS LIKE THIS:
- ONE CHECK, on tareas.estado, listing all 6 states the plan needs ('revisar' for emails, 'cancelada'). A CHECK can never be widened, because rebuilding a table is forbidden, so every other value is validated in code against exported lists, and a test compares the values found in the database with those lists. If a 7th state is ever needed, it gets a new column, never a rebuild.
- `programa` plus the partial unique index enforce at most ONE live task per programme. `clave_unica` (slot key 'sistema.vigilar@2026-11-04T06') makes scheduling idempotent. A single `INSERT … ON CONFLICT DO NOTHING` covers both constraints. Tested: the same key gives 0 rows; a new key while the previous task is live gives 0; a new key after the previous one is 'hecha' gives 1; and a bad estado still fails the CHECK, unlike INSERT OR IGNORE.
- `repetible` is copied from the type when the task is created, so recovery stays correct even after a rollback to code that does not know the type.
- `dueno` (the run UUID) plus `tomas` form the fence.
- `codigo` on trabajador_corridas and servidor_arranques is the code fingerprint, so crash counts compare only runs of the same code.
- salud_muestras.hora is 'YYYY-MM-DDTHH' (UTC) and UNIQUE, so there is at most one sample per hour however many restarts happen.
- avisos.enviado_en is the outbox column for 1e.
- No schedule table: system schedules live in code, and phase-2 project schedules are derived from proyectos plus the approved version.

RUNTIME STATE IN THE EXISTING `ajustes` TABLE (written by code, never by the migration, as `INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en`; every change also writes an auditoria row):

| Key | Value |
|---|---|
| 'tareas.modo_seguro' | `{activo, origen:'admin'\|'consola'\|'automatico', motivo, desde, codigo, version, usuarioId, ultimo:{hasta, por:'admin'\|'consola'\|'codigo_nuevo', motivo}\|null}` |
| 'tareas.frenos' | `{[tipo]: {motivo:'muchos_fallos', desde, hasta, veces}}`, automatic only |

VALUES CHECKED IN CODE AND TESTS:
| Field | Values |
|---|---|
| cupo | normal \| grande |
| tarea_eventos.evento | error \| espera \| fallida \| revisar \| abandonada \| interrumpida \| cancelada \| reintentada \| programa_saltado. There are no 'creada' or 'hecha' events (creada_en and terminada_en already say so), which keeps growth near zero. |
| trabajador_corridas.como_termino | normal \| senal \| sin_padre \| modo_seguro \| zombis \| caida \| colgado \| no_arranco \| memoria \| reemplazada \| base_no_compatible \| perdida |
| servidor_arranques.como_termino | normal |
| avisos.nivel | info \| atencion \| grave |
| avisos.clave | memoria_baja, disco_bajo, base_grande, wal_grande, pantallas_lentas, trabajador_reinicios, modo_seguro, base_danada, tareas_fallidas, tareas_revisar, fila_atrasada, freno:<tipo> |
| carriles | 'sistema' \| 'e:<espacio>' \| 'p:<proyecto>' \| 'e:<espacio>:sin_proyecto' |

GROWTH (nothing is ever deleted):
- Phase 1: about 25 tasks a day (24 vigilar + 1 base), 24 samples a day, one run row per worker life, events only on non-success. Roughly 3 MB a year.
- Phase 2 keeps tasks coarse: one task per project run, with the business cursor in `punto` and results in their own tables, never in `resultado`, which is capped at 4000 characters.

Rollback safety: the 1b code ignores migration 4 (abrirBase only applies the ids it knows), so rolling back the code keeps every row.

## modulos

NEW FILES (estimated about 1,300 lines of src plus about 800 of tests; all imports are node: or relative inside src; nothing uses rm/unlink/'limpiar'; nothing calls listen)

src/tareas/tipos.js: data only, imported by both processes.
- `FASE_ACTUAL = 1`.
- `CUPOS = { normal: 1, grande: 1 }`. Phase 2, with 1 GB, sets normal to 2.
- `POR_DEFECTO = { fase: 1, cupo: 'normal', maxFallos: 3, tiempoPorPasoMs: 60_000, repetible: true, ignoraFrenos: false, prioridad: 0, reintentos: { baseMs: 60_000, factor: 4, topeMs: 21_600_000 }, frenoTrasFallos: 6 }`.
- `TIPOS = { 'sistema.vigilar': { cupo: 'normal', maxFallos: 2, tiempoPorPasoMs: 30_000, ignoraFrenos: true, prioridad: 10 }, 'sistema.base': { cupo: 'grande', maxFallos: 2, tiempoPorPasoMs: 300_000, prioridad: 10 } }`.
- `definicion(tipo, registro = TIPOS) → merged definition | null`.
- `tiposEjecutables(registro = TIPOS, fase = FASE_ACTUAL) → string[]`.
- `PROGRAMAS_DEL_SISTEMA = [{ programa: 'sistema.vigilar', tipo: 'sistema.vigilar', cada: 'hora', minuto: 7 }, { programa: 'sistema.base', tipo: 'sistema.base', cada: 'diaria', hora: 4, minuto: 10 }]`.
- `class ErrorTarea extends Error { constructor(clave, { reintentable = true, esperarMs = null, noEsFallo = false, revisar = false } = {}) }`.
- `esperar(ms, clave)` → ErrorTarea with noEsFallo, for the 1d spending cap and phase-2 politeness.

src/tareas/tiempo.js: pure functions, RD time (UTC−4 all year).
- `ranura({ programa, cada: 'hora'|'diaria'|'semanal'|'mensual'|'manual', hora = 0, minuto = 0 }, ahoraMs) → { clave, inicio, siguiente } | null`. Monday for weekly, day 1 for monthly.
- `horarioRepartido(proyectoId) → { hora, minuto }`: m = 60 + (id·37 mod 300), which spreads projects over 01:00–05:59 RD.

src/tareas/escritor.js
- `crearEscritor(db, { pausaMinMs = 10, factor = 2, lentaMs = 20, dormir, reloj = performance.now, registro = console }) → { escribir(fn, { transaccion = true } = {}): Promise<T>, estadisticas(): { escrituras, maxMs, lentas } }`.
- One write at a time, in order. Each write runs inside enTransaccion (or bare, for PRAGMAs). After it, the queue pauses max(10 ms, 2 × its duration) before the next write. A write slower than 20 ms is logged. A write that throws does not block the queue.
- EVERY worker write goes through it, including handlers' ctx.escribir.

src/tareas/cola.js: the queue core; synchronous, short transactions, `ahora` injectable.
- Constants: `ESTADOS_TAREA`, `VIVAS = ['lista','en_curso','revisar']`, `EVENTOS`, `MAXIMO_RESULTADO = 4000`.
- `carrilesDe(espacioId, proyectoId)`.
- `esperaDeReintento(fallos, politica, azar = Math.random)`.
- `encolar(db, { tipo, espacioId, proyectoId, programa, datos, claveUnica, prioridad, disponibleEn, creadaPor }, { registro = TIPOS, ahora = Date.now() } = {}) → { id, nueva }`. An unknown type or a future-phase type throws.
- `elegir(db, { cupo, tipos, ocupados, ahora })`: a read, outside any lock. Returns a candidate with v_espacio, v_proyecto and the minimum virtual time of other lanes.
- `marcarTomada(db, { candidata, corrida, arriendoMs, ahora }) → tarea | null`: a fenced UPDATE plus the credit-cap upsert.
- `guardarPaso(db, { tarea, corrida, salida, duracionMs, ahora, azar, alFallar }) → { aceptado, estado, fallida, motivo }`.
- `devolverLasMias(db, { corrida, conFallo = false, motivo = 'apagado', ahora })`.
- `recuperarAbandonadas(db, { yo = null, corridas = null, ahora, azar, alFallar })` → [{ id, estado, proyectoId }]. conFallo comes from como_termino of the owner's run.
- `recuperarVencidas(db, { yo, ahora, alFallar })`: expired leases.
- `programar(db, { programas, tipos, ahora, recordadas: Map, saltos: Map }) → { creadas, saltadas }`.
- `programasDeProyectos(db, { registro, fase }) → programa[]`. It is [] in phase 1; tested with an injected registry.
- `proximasEjecuciones(db, { programas, ahora })`.
- `reintentar(db, { id, usuarioId, ahora })` and `cancelar(db, { id, usuarioId, ahora })`. Both throw `new ErrorHttp(404,'no_existe')` or `new ErrorHttp(409,'accion_no_permitida_ahora')`; reintentar can also throw `new ErrorHttp(409,'ya_hay_otra_en_marcha')`. Both write an event and an auditoria row.
- `resumenFila(db, { tipos, ahora })`.
- `erroresRecientes(db, { limite = 20, espacioAdmin })`.
- `listarTareas(db, { estado, antesDe, limite = 25, espacioAdmin })`.
- `tareasDelEspacio(db, espacioId, { limite = 50, antesDe })`: always `WHERE espacio_id = ?`, ready for the phase-2 user screen and tested for privacy now.

src/tareas/corridas.js
- `COMO_TERMINA`, `ANORMALES = ['caida','colgado','no_arranco','memoria','reemplazada','base_no_compatible']`.
- `nuevaCorrida(db, { version, codigo, ahora }) → uuid`, called by the web before the spawn.
- `empezarCorrida(db, { corrida, pid, ahora, latidoMaxMs = 45_000, vivo = procesoVivo, alFallar })`: one transaction, as described in proceso.
- `marcarListo(db, corrida, ahora)`.
- `latir(db, { corrida, memoriaMb, arriendoMs, ahora }) → boolean`.
- `contarPaso(db, corrida, conError)`.
- `terminarCorrida(db, { corrida, como, codigo, senal, detalle, ahora }) → boolean`.
- `salidasAnormales(db, { codigo, desde }) → n`.
- `ultimasCorridas(db, n = 5)`.
- `procesoVivo(pid)`: process.kill(pid, 0); EPERM counts as alive.

src/tareas/modo-seguro.js
- `CLAVE_MODO_SEGURO`, `CLAVE_FRENOS`, `MOTIVOS_MODO_SEGURO = ['admin','consola','trabajador_inestable','servicio_inestable','base_no_compatible','base_danada']`, `SE_LEVANTAN_CON_CODIGO_NUEVO = ['trabajador_inestable','servicio_inestable','base_no_compatible']`.
- `leerModoSeguro(db)`.
- `ponerModoSeguro(db, { activo, origen, motivo, codigo, version, usuarioId, ahora })`: writes the ajustes key, an auditoria row, and opens or resolves the 'modo_seguro' aviso (grave if automatic, info if manual). Turning off a 'base_danada' safe mode also enqueues an immediate sistema.base.
- `revisarAlArrancar(db, { codigo, version, ahora })`.
- `leerFrenos(db, ahora)`, `frenarTipo(db, { tipo, ms, ahora })`, `soltarFreno(db, { tipo, ahora })`.
- `registrarArranque(db, { version, codigo, pid, ahora }) → { id, caidasRecientes }`: counts unclean ends of the SAME code in the last 30 min; 3 or more → safe mode 'servicio_inestable'.
- `registrarCierre(db, id, ahora)`.

src/avisos/avisos.js (the plan's `avisos/` folder)
- `NIVELES`, `CLAVES_AVISO`.
- `abrirAviso(db, { clave, nivel, detalle, ahora }) → id`: an upsert on the partial index. It adds to veces, can raise the level but never lowers it, and raising it to grave clears enviado_en so that 1e resends.
- `resolverAviso(db, clave, ahora)`.
- `marcarVisto(db, { id, usuarioId, ahora })`.
- `avisosAbiertos(db)`, `avisosRecientes(db, { dias = 7, limite = 20 })`.

src/nucleo/salud.js: reads only, apart from guardarMuestra.
- `UMBRALES = { memoriaAtencionMb: 64, memoriaGraveMb: 32, discoAtencionMb: 1024, discoGraveMb: 300, baseAtencionMb: 40, walAtencionMb: 64, pantallasAtencionMs: 200, reiniciosAtencion24h: 3 }`.
- `medirSalud({ carpetaDatos, archivoBase, carpetaCopias, pids: { web, trabajador }, pantallasP99Ms })` → { memoria{totalMb, disponibleMb (os.freemem() = MemAvailable), swapTotalMb, swapUsadaMb}, oportiaMb (cgroup memory.current, may be null), webMb, trabajadorMb (smaps_rollup Private_*), disco{libreMb, totalMb} (statfsSync), base{archivoMb, walMb}, copias{archivos, mb}, carga{m1, m5, m15}, encendidoDesde }.
- `memoriaPropiaMb(pid)`.
- `evaluarSalud(medidas, { reinicios24h }, umbrales = UMBRALES) → [{ clave, nivel, activo, detalle }]`: pure.
- `semaforo(lista)`.
- `guardarMuestra(db, medidas, fila, ahora) → boolean`: one row per hour.
- `historialSalud(db, { horas = 24 })`.

src/tareas/manejadores.js (loaded only by the worker): `MANEJADORES = { 'sistema.vigilar': { paso }, 'sistema.base': { paso } }`. The handler contract:
- `async paso(ctx)` returns `{ listo: true, resultado }` or `{ punto, esperarMs?, motivo? }`, or throws.
- `ctx = { tarea: { id, tipo, datos, punto, pasos, espacioId, proyectoId, intento }, senal, db (reads only), config, escribir(fn) (fenced and paced; throws 'ya_no_es_mia' when the task is no longer this worker's), quedaMs(), ceder() (setImmediate; call it every ~50 ms of CPU) }`.
- Steps must be idempotent. Any step that sends something must be `repetible: false`.

src/tareas/ejecutor.js
- `crearEjecutor({ db, config, corrida, escritor, registro = TIPOS, manejadores = MANEJADORES, cupos = CUPOS, tiempos, alFallar, memoriaDisponibleMb, discoLibreMb, pedirSalida, log }) → { ciclo(), parar({ esperaMs, conFallo, motivo }), estado() }`.
- estado() returns { enCurso, freno, zombis }.
- It runs in-process in tests; trabajador.js wraps it in its own process.

src/tareas/trabajador.js
- `TIEMPOS_TRABAJADOR = { cicloMs: 5000, latidoMs: 15000, arriendoMs: 120000, recuperarCadaMs: 60000, programarCadaMs: 30000, graciaParadaMs: 3000, graciaAbortoMs: 5000, maxZombis: 2, heapMaxFraccion: 0.85, rssMaxMb: 120, memoriaMinimaMb: { normal: 80, grande: 100 }, discoMinimoMb: 300 }`.
- `SALIDA = { normal: 0, caida: 1, reemplazada: 3, base_no_compatible: 4, memoria: 75, zombis: 76 }`, `VERSION_DE_BASE_NECESARIA = 4`.
- `export async function principal({ registro = TIPOS, manejadores = MANEJADORES, env = process.env } = {})`. OPORTIA_TAREAS_TIEMPOS is read only when OPORTIA_TEST=1.

src/tareas/supervisor.js
- `RUTA_TRABAJADOR`, `BANDERAS_TRABAJADOR`, `TIEMPOS_SUPERVISOR = { listoMaxMs: 30000, vigiaMs: 90000, revisarCadaMs: 10000, modoSeguroCadaMs: 30000, ventanaArranqueMs: 90000, fallosArranque: 3, reinicioBaseMs: 1000, reinicioMaxMs: 300000, vidaEstableMs: 600000, ventanaCaidasMs: 900000, caidasParaModoSeguro: 5, paradaMs: 5000, reintentoSenalMs: 2000, saludCadaMs: 60000 }`, `FASES_TRABAJADOR`.
- `lanzarTrabajador({ ruta, env })`.
- `crearSupervisor({ db, config, version, codigo, ruta = RUTA_TRABAJADOR, lanzar = lanzarTrabajador, tiempos = {}, tiemposTrabajador = null, entorno = {}, registro = console }) → { iniciar(), parar(): Promise, despertar(), estado(), estadoArranque(), ponerModoSeguro({ activo, usuarioId }), medirAhora(), pantallasP99Ms() }`.
- It also holds the web-side vigía:
  - monitorEventLoopDelay({ resolution: 20 }), reset every hour;
  - the hourly sample;
  - evaluarSalud → abrirAviso/resolverAviso.

src/api/tareas.js
- `crearLimitesTareas()`: a Limitador allowing 30 admin actions per 10 min.
- `registrarRutasTareas(rutas, { supervisor = null, limites = crearLimitesTareas() })`. The routes are listed in interfaz.

test/tareas-prueba.js: a test helper, not a *.test.js file.
- `import './ayuda.js'`; it merges the test types into the real ones and calls `principal({ registro, manejadores })`.
- The test types are prueba.eco, prueba.pasos (2 steps), prueba.fallar, prueba.colgar (a synchronous loop), prueba.terca (ignores abort), prueba.correo (repetible:false), and prueba.lenta (honors senal).
- With OPORTIA_PRUEBA_ROMPER=1 it exits 1 before boot.

CHANGED FILES:
- src/nucleo/db.js:
  - enTransaccion nests: a WeakMap counter, BEGIN IMMEDIATE at the outer level, SAVEPOINT oportia_spN / RELEASE / ROLLBACK TO inside, and rejection of an AsyncFunction or a returned promise.
  - New `conectarBase({ archivoBase }, { versionMinima })`, which throws an Error with codigo 'base_no_existe'|'base_ajena'|'base_sin_wal'|'base_vieja'.
  - Both were prototyped in the scratch copy.
- src/cuentas/usuarios.js: delete the local enTransaccion and `import { enTransaccion } from '../nucleo/db.js'`. Behavior is identical at depth 0; the existing suite passes 92/92.
- src/nucleo/migraciones.js: migration 4.
- src/app.js: exports VERSION and HUELLA. `crearServidor({ db, limites, supervisor = null })` passes `supervisor` to registrarRutasCuentas and calls registrarRutasTareas.
- src/api/cuentas.js: `registrarRutasCuentas(rutas, { version, limites, supervisor = null })`. Only /api/setup changes (the gate).
- src/server.js: as described in proceso.
- src/proyectos/proyectos.js: no change. marcarConErrores is used as alFallar and now nests through a SAVEPOINT.
- deploy/oportia-admin.mjs: `--modo-seguro=si|no` (a leading '-' can never collide with NOMBRE_VALIDO). It calls ponerModoSeguro with origen 'consola'.
- public/app.js and public/i18n/{es,en}.json: the screens.
- package.json: version 0.2.0.
- README.md:
  - the phase-1c status;
  - «dos procesos, un servicio»;
  - the handler rules (short ctx.escribir, honor senal, idempotent steps, repetible:false for anything that sends);
  - the console command;
  - a note never to set KillMode=process.
- test/ayuda.js:
  - `esperarHasta(condicion, { ms = 20000, cada = 50, que })`;
  - `huellas(carpeta)`, moved from arranque.test.js;
  - `matarSiVive(pid)`;
  - `procesoTerminado(pid)` (ESRCH, or state 'Z' in /proc/<pid>/stat).
- test/arranque.test.js, test/reglas.test.js, test/pantallas.test.js and test/rescate.test.js: see pruebas.

The worker's import graph is config, db, migraciones, tipos, tiempo, escritor, cola, corridas, modo-seguro, avisos, manejadores, ejecutor, and proyectos (for marcarConErrores; this pulls in nucleo/http.js for ErrorHttp and the motor dictionaries). It never reaches node:http, app.js or src/api.

## algoritmos

1) TRANSACTION DISCIPLINE (all three designs measured that SQLite's busy handler is unfair and that a waiting web call blocks its whole event loop)
- Every multi-statement write uses enTransaccion, which means BEGIN IMMEDIATE (a deferred BEGIN that reads then writes fails at once under contention).
- There is never an await inside a transaction (enforced).
- All worker writes go through the escritor: after each one it waits max(10 ms, 2 × duration) (A measured web waits of 12–31 ms with this, against 1.3–2.5 s without).
- Searches and quick_check run OUTSIDE write transactions; in WAL, readers never block writers.
- Phase-2 bulk writes go in batches of 200 rows or fewer per ctx.escribir, with ceder() between batches.
- A write slower than 20 ms is logged, and the web's hourly p99 above 200 ms raises the aviso 'pantallas_lentas'.

2) CLAIM (optimistic, C)
elegir() is a read:
```sql
SELECT t.*, COALESCE(ce.virtual_ms,0) AS v_espacio, COALESCE(cp.virtual_ms,0) AS v_proyecto
FROM tareas t
LEFT JOIN tarea_carriles ce ON ce.carril = t.carril_espacio
LEFT JOIN tarea_carriles cp ON cp.carril = t.carril_proyecto
LEFT JOIN proyectos p ON p.id = t.proyecto_id
WHERE t.estado='lista' AND t.cupo=:cupo AND t.disponible_en <= :ahora
  AND t.tipo IN (SELECT value FROM json_each(:tipos))
  AND (t.proyecto_id IS NULL OR (p.estado='en_ejecucion' AND p.en_papelera=0))
ORDER BY (t.carril_proyecto IN (SELECT value FROM json_each(:ocupados))) ASC,
  v_espacio, v_proyecto, t.prioridad DESC, t.disponible_en, t.id
LIMIT 1
```
- EXPLAIN shows it searches through the tareas_por_tomar index.
- :tipos = the types this code knows, minus braked types, minus non-ignoraFrenos types while a resource brake is on. Tasks of unknown types wait and are shown as 'esperanVersion', which keeps a rollback safe.
- Tasks of paused, completed or binned projects wait, and continue on reanudar.

minOtros = the MIN virtual_ms over the lanes of OTHER ready tasks: first among accounts, then among projects within the same account.

marcarTomada(), through the escritor:
```sql
UPDATE tareas SET estado='en_curso', dueno=:corrida, tomas=tomas+1, arriendo_hasta=:ahoraMas120s, motivo_espera=NULL,
  empezada_en=COALESCE(empezada_en,:ahora), actualizada_en=:ahora
WHERE id=:id AND estado='lista' AND tomas=:tomas
```
- 0 rows means someone else won: try again, up to 3 times.
- Credit cap, in the same transaction: if v < minOtros − 60000, then
```sql
INSERT INTO tarea_carriles (carril, virtual_ms, actualizado_en) VALUES (?,?,?)
ON CONFLICT(carril) DO UPDATE SET virtual_ms = MAX(virtual_ms, excluded.virtual_ms), actualizado_en = excluded.actualizado_en
```

3) FAIRNESS
- After each step, both lanes are charged in guardarPaso:
  `virtual_ms += duracionMs / peso, usado_ms += duracionMs, turnos += 1` (upsert).
- Because it is time-based, a project with 1 s steps cannot beat one with 0.1 s steps.
- A lane that was idle is at most 60 s ahead.
- A project already holding a slot goes behind the others.
- prioridad only reorders tasks inside a lane: 10 for system tasks, 1 for the phase-2 «Ejecutar ahora».
- `peso` (for example 2 for the empresarial plan) can be set in phase 6.

4) EXECUTOR LOOP (ciclo every 5 s or on 'despertar'; one loop runs at a time)
- Each ciclo:
  - reads the safe-mode flag; if on → pedirSalida('modo_seguro');
  - memory check: `v8.getHeapStatistics().used_heap_size > 0.85·heap_size_limit || process.memoryUsage.rss() > 120 MB` → pedirSalida('memoria');
  - every 60 s: marks lost runs and calls recuperarAbandonadas + recuperarVencidas;
  - every 30 s: programar;
  - for cupo in ['grande','normal']: while a slot is free, compute the brake (MemAvailable < 80/100 MB, or disk < 300 MB cached for 60 s), elegir, and `await escritor.escribir(marcarTomada)`, then launch the step without awaiting it.
- Step:
  - an AbortController with setTimeout(tiempoPorPasoMs);
  - `salida = normalizar(await Promise.race([manejador.paso(ctx), abortado]))`; anything other than listo/punto becomes the error 'respuesta_no_valida', not retryable;
  - errors are classified: ErrorTarea keeps its flags; AbortError or TimeoutError → 'tiempo_agotado', retryable; anything else is retryable, with the message cut to 120 characters;
  - if the handler has not settled 5 s after the abort → zombis++; at 2 → pedirSalida('zombis');
  - finally `await escritor.escribir(() => guardarPaso(...))`, then the type breaker update, then setImmediate(ciclo).

5) guardarPaso (fenced: `estado='en_curso' AND dueno=:corrida AND tomas=:tomas` is checked inside the transaction; on a mismatch it returns aceptado:false and changes nothing)

| Outcome | Result |
|---|---|
| listo | 'hecha', resultado (a JSON over 4000 characters becomes the non-retryable error 'resultado_muy_grande'), pasos+1, fallos_seguidos=0, terminada_en |
| seguir | 'lista', punto, pasos+1, fallos_seguidos=0, disponible_en = now + esperarMs |
| noEsFallo | 'lista', disponible_en = now + max(1 s, esperarMs), motivo_espera = clave, event 'espera'; no failure counted |
| error | fallos = fallos_seguidos+1; revisar → 'revisar'; not retryable or fallos ≥ max_fallos → 'fallida' and `alFallar(db, proyecto_id, motivo)` (marcarConErrores, nested by SAVEPOINT in the SAME transaction); otherwise 'lista' with backoff |

- Backoff = min(topeMs, baseMs·factor^(fallos−1))·(0.75 + 0.5·azar). With azar 0.5 that is exactly 60 000 and then 240 000 ms; the 3rd consecutive failure means 'fallida'. A successful step resets the count.
- Every transition except listo and seguir writes ONE tarea_eventos row.

6) TYPE BREAKER (automatic only; no buttons)
- In memory: 6 consecutive failed steps of one type, spread over at least 2 tasks → frenarTipo for min(1 h, 5 min·2^veces), plus the aviso 'freno:<tipo>' (atención).
- The type leaves :tipos until `hasta` passes.
- One successful step resets the count, sets veces to 0 and resolves the aviso.
- This replaces A's global 'muchos_fallos' safe mode, which a normal internet outage in phase 2 would have tripped.

7) LEASES, HEARTBEAT, RECOVERY
- Heartbeat every 15 s, through the escritor, in one transaction:
  `UPDATE trabajador_corridas SET latido_en=:ahora, memoria_mb=:mb WHERE corrida=:yo AND termino_en IS NULL` (0 rows → exit 3 'reemplazada')
  plus `UPDATE tareas SET arriendo_hasta=:ahoraMas120s WHERE dueno=:yo AND estado='en_curso'`.
  Then the IPC 'latido' {memoriaMb, heapPct, enCurso, freno}.
- A run is lost when termino_en IS NULL AND (pid dead OR latido_en older than 45 s OR (listo_en IS NULL AND empezo_en older than 60 s)). It is marked 'perdida'. PID reuse can only delay this until the 45 s heartbeat rule.
- A task en_curso is abandoned when its dueno is not an open run, or `arriendo_hasta < ahora − 30 s` and dueno ≠ me. Each one is handled in its own fenced transaction:
```sql
UPDATE tareas SET estado=:estado, fallos_seguidos=:fallos, ultimo_error=:motivo, dueno=NULL, arriendo_hasta=NULL,
  disponible_en=:disp, motivo_espera=:espera, terminada_en=CASE WHEN :estado IN ('fallida','revisar') THEN :ahora ELSE terminada_en END, actualizada_en=:ahora
WHERE id=:id AND estado='en_curso' AND dueno IS :dueno AND tomas=:tomas
```
  - estado = 'revisar' if repetible=0;
  - otherwise, with a failure counted, 'fallida' if fallos+1 ≥ max_fallos (alFallar is called in the same transaction);
  - otherwise 'lista'.
  - A failure is counted when the owner's run ended in ANORMALES (the worker crashed, so the task is suspect) or the lease expired. It is NOT counted for 'perdida' (power cut or the whole service dying), 'normal', 'senal' or 'sin_padre'. So two unrelated power cuts can never quarantine an innocent task.
- A poison task that crashes the worker is 'fallida' after 3 lives, before the 5-exit safe-mode threshold.
- devolverLasMias (on a stop): 'lista' with no failure and the event 'interrumpida'; 'revisar' if repetible=0. With conFallo (memory exit 75): +1 failure, error 'memoria'.

8) SCHEDULES (slot keys from B, plus one live task per programme)
- programar() every 30 s goes through PROGRAMAS_DEL_SISTEMA plus programasDeProyectos() (empty in phase 1), keeping only known types:
  1. r = ranura(plan, ahora); if recordadas.get(programa) === r.clave → skip, with no database work.
  2. If `SELECT 1 FROM tareas WHERE clave_unica=:clave` finds a row → recordadas.set and skip.
  3. If a live task of the programme exists → write the event 'programa_saltado' once per slot and try again in 30 s; the slot runs as soon as the previous task finishes.
  4. Otherwise, through the escritor:
     `INSERT INTO tareas (tipo, espacio_id, proyecto_id, programa, clave_unica, carril_espacio, carril_proyecto, cupo, prioridad, repetible, estado, datos, max_fallos, disponible_en, creada_en, actualizada_en) VALUES (…,'lista',…) ON CONFLICT DO NOTHING`.
- Because only the CURRENT slot is ever enqueued, 3 days of downtime give ONE task. No overlap is possible (the partial unique index).
- Checked cases:
| Schedule | Time (UTC) | Slot |
|---|---|---|
| vigilar :07 | 10:05Z | starts 09:07Z, key '@2026-11-04T05' |
| base 04:10 | 2026-11-04T08:09:59Z | 2026-11-03 |
| base 04:10 | 08:10:00Z | 2026-11-04 |
| weekly | 2026-11-09T05:59Z | 'S2026-11-02' |
| monthly | 2026-12-31T23:00Z | 'M2026-12', next 2027-01-01T06:00Z |
| manual | any | null |
- Project hook (phase 2): projects that are en_ejecucion, not binned, with version_activa, frecuencia ≠ manual, and an enabled capability whose `desde[tipo] ≤ FASE_ACTUAL` with a registered 'proyecto.<capacidad>' type → { programa: 'proyecto:N', cada: frecuencia, ...horarioRepartido(N) }. «Ejecutar ahora» will use clave 'manual:proyecto:N:<minute>' with the same `programa`.

9) SAFE MODE
- Turns on:
  - admin (screen) or consola (CLI), manual;
  - 'trabajador_inestable': 5 abnormal exits of the same code in 15 min, outside the gate window;
  - 'servicio_inestable': 3 unclean servidor_arranques of the same code in 30 min, after listen;
  - 'base_no_compatible': exit 4;
  - 'base_danada': quick_check not ok.
- Effects:
  - no worker, so nothing is claimed or scheduled; queued tasks just wait;
  - the screens and the web's health samples keep working;
  - the aviso 'modo_seguro' (grave when automatic) and the banner on Inicio.
- Lifting: only a person lifts admin, consola and base_danada. The 3 code-fixable causes lift ONCE when HUELLA changes (audited and shown as «Se quitó solo el {fecha} al instalar código nuevo»). If the new code crashes again, safe mode comes back, tagged with the new code. This fixes the «broken deploy, then the rollback stays stuck in safe mode» trap.
- The flag is read by the supervisor every 30 s and by the worker every 5 s.

10) WORK DONE IN 1c
- sistema.vigilar (1 step), with:
  - 'tareas_fallidas' (fallidas in the last 24 h > 0), atención;
  - 'tareas_revisar' (> 0);
  - 'fila_atrasada' (the oldest ready task has waited more than 2 h), each resolved when its condition clears;
  - a PRAGMA wal_checkpoint(PASSIVE) through the escritor (without a transaction) when the WAL is over 64 MB;
  - the result is {fila, walMb}.
- sistema.base, step 1 'revisar': `PRAGMA quick_check(20)`, a read.
  - not ['ok'] → through ctx.escribir: abrirAviso('base_danada','grave') plus ponerModoSeguro(automatico, 'base_danada'); finish with that result;
  - ok → resolverAviso('base_danada') and `{ punto: { paso: 'mantener' } }`.
- sistema.base, step 2 'mantener': `PRAGMA analysis_limit=400; PRAGMA optimize;` and `PRAGMA wal_checkpoint(PASSIVE)` through the escritor (without a transaction), then page_count and freelist_count → listo.
- Web vigía (every 60 s, at most one sample per UTC hour): medirSalud plus resumenFila → guardarMuestra. Then evaluarSalud opens or resolves:
  - memoria_baja (< 64 MB atención, < 32 MB grave);
  - disco_bajo (< 1 GB atención, < 300 MB grave);
  - base_grande (> 40 MB, the Telegram 50 MB limit for 1e);
  - wal_grande (> 64 MB);
  - pantallas_lentas (p99 > 200 ms);
  - trabajador_reinicios (3 or more abnormal exits in 24 h).

11) STARTUP GATE: the state machine in proceso; it is evaluated synchronously in /api/setup.

## interfaz

ADMIN API (src/api/tareas.js)
- Every route is `{ admin: true }`.
- POSTs need X-Oportia and the same origin, as today, and pass through the Limitador (30 per 10 min per admin, otherwise 429 'demasiados_intentos').
- Errors are literal ErrorHttp keys, so pantallas.test checks them.

GET /api/admin/sistema returns:
```
{ fase: 1, version, codigo: HUELLA,
  trabajador: { fase, pid, corrida, desde, ultimoLatido, segundosDesdeLatido, memoriaMb, enCurso:[{id,tipo,cupo,desde}], freno: null|'poca_memoria'|'poco_disco', proximoIntento, ultimaSalida:{en,como,codigo,senal}, reinicios24h },
  modoSeguro: { activo, origen, motivo, desde, ultimo },
  fila: { listas, esperando, enCurso, revisar, fallidas7d, hechas24h, fallidas24h, canceladas24h, esperanVersion, atrasadaDesde },
  frenos: [{ tipo, hasta }],
  proximas: [{ programa, tipo, proximaEn, ultimaEn, ultimoEstado }],
  errores: [{ tareaId, tipo, estado, evento, fecha, motivo, intento, maxFallos, proyecto, cuenta, ajena }] (20),
  corridas: [{ empezoEn, terminoEn, como, codigoSalida, senal, version, pasosHechos }] (5),
  avisos: { abiertos, recientes },
  salud: { ...medirSalud(), semaforo, problemas },
  historial: [ the last 24 samples ] }
```
- Without a supervisor (tests), trabajador = { fase: 'sin_supervisor' }.

Other routes:
| Route | Answers |
|---|---|
| GET /api/admin/tareas?estado=&antes= | { tareas (25), siguiente } |
| POST /api/admin/modo-seguro {activo:boolean} | 200 with the same payload as GET /api/admin/sistema; 400 'datos_no_validos'. The supervisor acts at once. |
| POST /api/admin/tareas/:id/reintentar (from fallida, revisar or cancelada) | 200; 404 'no_existe'; 409 'accion_no_permitida_ahora'; 409 'ya_hay_otra_en_marcha'. It also sends 'despertar'. |
| POST /api/admin/tareas/:id/cancelar (from lista or revisar only) | 200; 404; 409 |
| POST /api/admin/avisos/:id/visto | 200 or 404 |

PUBLIC: /api/setup is unchanged except for the 90 s gate: 503 `{ app, estado:'arrancando', version, error:'arrancando' }`. It reveals no queue state, and nothing about safe mode.

PRIVACY (not even the admin sees other accounts' projects):
- Project tasks show only the tipo, estado, counters, «Proyecto n.º 12 · cuenta n.º 3», and an error key that matches /^[a-z_]{1,60}$/ (anything else shows 'error_interno').
- datos, punto and resultado are returned only for 'sistema.*' types.
- Every action writes an auditoria row with the admin's id.
- In 1c no project tasks exist.

SCREENS (public/app.js uses el() and textContent; never innerHTML; every string exists in es and en)

1) Administrador gets a «zona de sistema» ABOVE the existing users cards.
- It refreshes every 30 s while #admin is open, with the nuevoTurno guard.
- Only that zone is replaced (replaceChildren), so text being typed in «Crear un usuario» is never lost.
- An «Actualizar» button.

1a) «Avisos» card, only if there are open avisos:
- level, text, time and veces, with an «Entendido» button (visto);
- the note «Por ahora los avisos se ven aquí. Por Telegram llegarán en la fase 1, parte e.» / «For now notices show here. Telegram notices arrive in phase 1, part e.»

1b) «Trabajo automático» / «Automatic work» card:
- The status line, for example «Trabajando · último latido hace 8 s · usa 21 MB · versión 0.2.0 (código 3f9a12c0a1b2)». The labels are tareas.fase.*: Arrancando · Esperando trabajo · Trabajando · Reiniciando en {s} s · Sin respuesta: se reinicia solo · Pausado: modo seguro · Apagándose.
- «Ahora hace: Revisar la base (desde hace 2 s)» or «Nada en este momento».
- A brake line when one is on: «En pausa por poca memoria: solo vigila hasta que se libere».
- Counters: Esperando turno · Esperando reintento · Trabajando · Por revisar · Con error (7 días) · Hechas (24 h). Also «Esperan una versión más nueva: {n}» when n > 0, and «Atrasada desde {hora}».
- «Próximas ejecuciones», with times in America/Santo_Domingo (toLocaleString): «Revisar la fila — hoy 10:07 p. m.», «Revisar y ordenar la base — mañana 4:10 a. m.», plus «(en pausa: modo seguro)» when it applies.
- «Errores recientes»: date · type in words · reason (tareas.motivo.* with a fallback to the raw key) · «intento x de y». Each row shows «Reintentar» only when that action is allowed, and «Cancelar» only when that one is.
- «Ver la fila» (<details>): a state filter and the 25 latest tasks, with «Ver más».
- «Cómo terminó las últimas 5 veces», for example «Se reinició por una actualización» or «Se quedó sin memoria y se reinició».
- The fixed text: «El trabajo automático corre aparte de las pantallas y con menos prioridad: si se traba o se cae, las pantallas siguen funcionando y se vuelve a encender solo. Por ahora hace el trabajo del sistema: revisa la fila cada hora y revisa y ordena la base de datos cada madrugada. Tus proyectos lo empiezan a usar con la búsqueda de clientes (fase 2).» (and the same in English).

1c) «Modo seguro» block (in the same card):
- One real button, «Activar el modo seguro» or «Quitar el modo seguro».
- The confirmation: «¿Activar el modo seguro? Se detiene todo el trabajo automático; las pantallas siguen funcionando y no se pierde nada: lo que está en la fila espera y sigue cuando lo quites.»
- The reason in plain words:
  - trabajador_inestable: «Se activó solo: el trabajo automático se cayó 5 veces en 15 minutos.»
  - servicio_inestable: «Se activó solo: OPORTIA se apagó mal 3 veces en 30 minutos.»
  - base_no_compatible: «Se activó solo: el trabajo automático no pudo abrir la base de datos.»
  - base_danada: «Se activó solo: la revisión de la base encontró un problema. No se borró nada. Pide ayuda antes de quitarlo.»
  - admin: «Lo activaste tú el {fecha}.»
  - consola: «Se activó desde la consola el {fecha}.»
- Plus «Se quitó solo el {fecha} al instalar código nuevo; si vuelve a fallar, se activa otra vez.»

1d) «Servidor» / «Server» card, with a green, yellow or red light:
- «Memoria libre: 142 MB de 512 MB», with swap when it exists;
- «OPORTIA usa {mb} MB (pantallas {a} MB · trabajo automático {b} MB)»;
- «Disco libre: 7,8 GB de 9,6 GB»;
- «Base de datos: 1,2 MB (+0,1 MB por guardar)»;
- «Copias antes de cambios de la base: 3 archivos, 3,4 MB»;
- «Carga del procesador: 0,12 · 0,08 · 0,05»;
- «Las pantallas respondieron en 6 ms (el peor 1 % de la última hora)»;
- «Encendido desde {fecha}»;
- the last 24 hourly samples as compact text rows, or «Todavía no hay muestras: se toma una cada hora».
- The plan's public-link status is NOT shown: the README forbids reading public-url.txt. That needs an owner decision.

2) Inicio:
- Everyone: «Ya funciona» gains inicio.funciona.5: «Trabajo automático 24 horas, aparte de las pantallas. Por ahora cuida el servidor; tus proyectos lo usarán cuando llegue la búsqueda (fase 2).» 'inicio.viene.tareas' leaves «Próximamente».
- Admin only: a top card when safe mode is on or a grave aviso is unseen, for example «Atención: el trabajo automático está en pausa (modo seguro). Ver Administrador», linking to #admin.

3) Project screen: unchanged. Its existing text («Aprobado. Todavía no busca: la búsqueda de clientes llega en la fase 2…») is already honest.

4) Startup: iniciar() shows «OPORTIA está arrancando…» and retries every 1 s, for up to 60 s, while /api/setup answers 503 'arrancando'. After that comes the existing «Reintentar» screen.

OWNER DECISION, stated plainly: the plan puts a user «Tareas» screen in phase 1. In 1c no project creates tasks, so that screen would be empty: the «botón que no hace nada» the owner forbids. It ships in phase 2, on top of tareasDelEspacio(), which is already built and tested for privacy.

New i18n:
- Prefixes registered in pantallas.test: 'tareas.fase.', 'tareas.estado.', 'tareas.tipo.', 'tareas.motivo.', 'tareas.evento.', 'tareas.como.', 'tareas.freno.', 'modo_seguro.motivo.', 'aviso.'.
- Error keys: error.ya_hay_otra_en_marcha and error.arrancando. Existing keys reused: no_existe, accion_no_permitida_ahora, datos_no_validos, demasiados_intentos.

CONSOLE RESCUE (when the screens do not open): `sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-admin.mjs --modo-seguro=si` (or `=no`). It prints the new state. The running service applies it within 30 s, with no restart.

PLAIN EXPLANATION FOR THE OWNER: «OPORTIA ahora son dos programas dentro del mismo servicio: las pantallas y un "trabajador" que hace las tareas solo, día y noche, con menos prioridad, para que las pantallas nunca se pongan lentas. Si el trabajador falla, se vuelve a encender solo. Si falla muchas veces seguidas, OPORTIA lo pone en pausa (modo seguro) y te lo dice en Administrador; las pantallas siguen funcionando y no se borra nada. Si una versión nueva trae un trabajador que no arranca, el servidor vuelve solo a la versión anterior. Por ahora el trabajador cuida el servidor y la base de datos; tus proyectos lo empiezan a usar en la fase 2.»

## pruebas

GROUND RULES (they match the updater: root, env -i, run from /tmp, Node 22):
- Every *.test.js file imports ./ayuda.js.
- Temporary folders come from tmpdir(): configDePrueba, or a carpetaTemporal folder for the server-start test (arranque.test.js). Both go through revisarModoPrueba, and conectarBase calls it too.
- PORT=0, never 8080. No network and nothing under /var/lib.
- nice and node are resolved by absolute path.
- No test compares wall-clock time against a tight limit. Every wait is `esperarHasta(cond, { ms: 20000, cada: 50 })`, and fairness is tested with injected durations.
- Tests with real processes run one after another inside their file, and their `finally` calls matarSiVive on every pid they saw.
- Target: the whole suite in under 60 s on 1 slow CPU (the plan allows 2 min; the updater's timeout is 900 s).

test/tareas.test.js (in-process, fixed clock, injected test registry, about 3 s):
1. Migration 4: the tables and indexes exist; reopening repeats nothing; upgrading a v3 base makes the copy oportia-antes-m4-*.db.
2. encolar: the same claveUnica gives nueva:false; one live task per programa, and a new one is allowed after 'hecha'; an unknown or future-phase type throws; a direct INSERT with a bad estado fails the CHECK even with ON CONFLICT DO NOTHING.
3. enTransaccion: an inner failure, if caught, rolls back only the inner part; an outer failure rolls back everything; an AsyncFunction and a returned promise are rejected and leave no transaction open. (Prototyped and passing in the scratch copy.)
4. elegir/marcarTomada:
   - respect disponible_en, cupo and the allowed types;
   - skip paused and binned projects, and claim them again after reanudar;
   - leave types unknown to this code waiting (esperanVersion);
   - a stale tomas gives null.
5. Fairness: account A (1 project, 1 s steps) against account B (2 projects, 0.1 s steps) over 300 steps. A gets 45–55 % of the time, and B's two projects are within 10 % of each other.
6. Credit cap: a lane 10 h behind gets at most 8 consecutive 10 s turns, then the lanes alternate.
7. Steps:
   - 'seguir' saves punto and pasos with no failure;
   - 'listo' gives 'hecha';
   - a result over 4000 characters gives 'fallida resultado_muy_grande'.
8. Retries:
   - with azar 0.5, exactly 60000 and then 240000 ms; not claimable before then;
   - the 3rd failure gives 'fallida', and the project becomes con_errores with motivo_error and the history row 'con_errores';
   - if alFallar throws, the WHOLE guardarPaso rolls back (the task is still en_curso).
9. ErrorTarea({reintentable:false}) fails at once; esperar(ms,'tope_ia') gives 'lista' with motivo_espera 'tope_ia' and fallos unchanged.
10. Fence: guardarPaso with the wrong dueno or tomas returns aceptado:false and changes nothing; ctx.escribir throws 'ya_no_es_mia'.
11. Recovery:
   - an owner run that ended 'caida' gives fallos+1 and the event 'abandonada';
   - the 3rd time gives 'fallida' plus marcarConErrores;
   - an owner run 'perdida' gives no failure and the event 'interrumpida';
   - repetible=0 gives 'revisar' in both cases;
   - an expired lease of another owner gives +1;
   - nothing is touched while my lease is valid.
12. devolverLasMias: no failure; repetible 0 → 'revisar'; conFallo (memory) → +1.
13. tiempo.js: the table of slot cases from algoritmos, plus horarioRepartido always inside 01:00–05:59.
14. programar:
   - 3 days down give 1 task;
   - two calls in the same slot give 1 task;
   - while the previous task is live: no new task, exactly one 'programa_saltado' per slot, and the task is created once the previous one is 'hecha';
   - unknown types are not scheduled;
   - programasDeProyectos returns [] in phase 1;
   - with an injected phase-2 registry: en_ejecucion is included; pausado, papelera and manual are excluded.
15. Safe mode:
   - manual on and off write auditoria and the aviso;
   - 3 unclean registrarArranque of the SAME code within 30 min turn on 'servicio_inestable';
   - unclean ends of another code do not count;
   - registrarCierre resets it;
   - revisarAlArrancar lifts once on a new code only for the 3 fixable causes, never for admin, consola or base_danada;
   - turning off a 'base_danada' safe mode enqueues sistema.base.
16. Breaker: 6 failed steps over 2 tasks brake the type for 5 min and open the aviso freno:x; elegir skips that type; after `hasta` it is claimed again; a success resolves the aviso.
17. Avisos: veces adds up; raising atención to grave clears enviado_en; resolving then reopening creates a new row (history kept); marcarVisto works.
18. salud:
   - medirSalud returns numbers and changes no file (huellas before and after);
   - evaluarSalud follows the thresholds;
   - guardarMuestra writes one row per hour, even when called twice.
19. Escritor (fake clock and dormir): the pause is max(10, 2×d); the order is kept; a write that throws does not block the next one.
20. In-process crearEjecutor (test registry, short tiempos):
   - a 2-step task finishes;
   - at most 1 normal and 1 large task at a time;
   - with memoriaDisponibleMb 20 only an ignoraFrenos type runs, and freno = 'poca_memoria';
   - parar() in the middle of a step returns the task with no failure;
   - prueba.terca (ignores the abort) gives 'tiempo_agotado' and a zombie; a 2nd zombie calls pedirSalida('zombis').
21. Privacy:
   - tareasDelEspacio returns only that space's tasks;
   - the admin list never contains datos, punto or resultado for project tasks;
   - an error text that is not a key shows as 'error_interno'.
22. Admin API, with crearServidor({ db, supervisor: a fake }):
   - GET /api/admin/sistema: 200 for an admin, 403 for a user;
   - POST /api/admin/modo-seguro toggles with an audit row;
   - reintentar and cancelar give 404/409, and 'ya_hay_otra_en_marcha';
   - the 31st action gives 429.
23. /api/setup gate with a fake supervisor: 'arrancando' and 'fallido' give 503 error:'arrancando'; 'listo' and 'no_aplica' give 200; no supervisor gives 200 (as servidor.test expects today).

test/trabajador.test.js (real processes, 7 scenarios, about 10–20 s on 1 slow CPU):
1. crearSupervisor({ ruta: test/tareas-prueba.js, tiemposTrabajador: { latidoMs: 200, cicloMs: 100 } }):
   - the worker reaches 'listo', and the corrida has pid and listo_en;
   - if /usr/bin/nice exists, every /proc/<pid>/task/*/stat nice field is ≥ 10;
   - /proc/<pid>/oom_score_adj is 500 where it is readable;
   - prueba.eco and the real sistema.vigilar end 'hecha';
   - parar() ends the run 'normal', and the pid is gone (ESRCH, or state Z).
2. SIGKILL of the worker during prueba.pasos:
   - a new corrida appears and the old one is 'caida';
   - the task is back in 'lista' with fallos 1, and prueba.correo goes to 'revisar';
   - this recovery is done by the PARENT, before the new worker is listo.
3. prueba.colgar with vigiaMs 1500: the watchdog SIGKILLs the worker (como 'colgado'), the task gets fallos 1, and a new prueba.eco finishes.
4. Boot failure, with entorno OPORTIA_PRUEBA_ROMPER=1 and a lanzar wrapper that counts calls:
   - inside the window: estadoArranque() is 'fallido' after 3 spawns;
   - with ventanaArranqueMs 0 and caidasParaModoSeguro 5: safe mode 'trabajador_inestable', the grave aviso, and no 6th spawn.
5. Safe mode:
   - supervisor.ponerModoSeguro({activo:true}) makes the worker exit with 'modo_seguro' and nothing respawns;
   - writing the flag OFF straight into the base (as the console tool does), with modoSeguroCadaMs 300, starts a new worker.
6. systemd simulation: spawn src/server.js with detached:true (its own process group), OPORTIA_TEST=1, PORT=0 and DB_PATH in a temporary folder. Then:
   - poll /api/setup until 200;
   - read the worker pid from the log line '[tareas] trabajador … listo (pid N)';
   - `process.kill(-pgid, 'SIGTERM')` (both processes at once);
   - the server exits within 15 s and the worker is gone;
   - the last corrida is 'senal' or 'normal' (never counted as abnormal), and servidor_arranques.termino_en is set.
7. SIGKILL to the server only: the worker leaves by 'disconnect' within 20 s, with como 'sin_padre'.

test/arranque.test.js, strengthened (same file rules):
- poll /api/setup until 200 (up to 20 s) instead of a single request;
- wait for the 'listo' line;
- SIGTERM, then wait for the exit up to 15 s (it is 5 s today);
- the worker pid is gone;
- the last corrida is 'normal' or 'senal';
- no existing file changed or disappeared, and every new file starts with 'oportia'.

test/reglas.test.js, additions:
- MIGRACIONES_PUBLICADAS[4] = '46758487c7db33997048188be268fea4420332e1b08bcc431d82114607529860'.
- Only src/tareas/supervisor.js matches /['"]node:child_process['"]/. A literal regex, because `\bexec\(` would wrongly match db.exec.
- «Las transacciones solo se abren en src/nucleo/db.js»: /\b(?:exec|prepare)\(\s*['"`]\s*(?:BEGIN|SAVEPOINT|COMMIT|ROLLBACK|RELEASE|END)\b/i, outside db.js. It already passes with the usuarios.js refactor (92/92 in the scratch copy).
- The import graph from src/tareas/trabajador.js never contains node:http, src/app.js or src/api/, and no file in it calls `abrirBase(`.
- Every TIPOS entry has a handler in MANEJADORES, a cupo in CUPOS, maxFallos ≥ 1 and tiempoPorPasoMs ≤ 600000, and no type in src starts with 'prueba.'.
- Migration 4 has exactly one CHECK.

test/pantallas.test.js: adds the generated key lists (FASES_TRABAJADOR, ESTADOS_TAREA, Object.keys(TIPOS), EVENTOS, COMO_TERMINA, MOTIVOS_MODO_SEGURO, CLAVES_AVISO, the freno reasons) and their prefixes, plus the 2 new error keys. The existing «sin innerHTML» check covers the new screens.

test/rescate.test.js: `--modo-seguro=si` writes the flag plus an auditoria row with origen 'consola'; `--modo-seguro=no` clears it.

HOW TO VALIDATE BEFORE PUSHING (in a copy, never in /home/user/jarvis):
- as root, 3 runs in a row: `env -i PATH=/usr/bin:/bin taskset -c 0 node --no-warnings --test test/*.test.js` from /tmp;
- once more with `taskset -c 0 node -e 'for(;;){}'` burning the same CPU;
- `pgrep -f trabajador.js` must be empty after every run.

## riesgos

1. THE WEB FREEZING ON THE DATABASE LOCK (all three designs measured that SQLite's busy handler is unfair and that a waiting web call blocks its event loop).
   - Mitigation:
     - the escritor enforces a pause after every worker write (the pause is in code, not left to convention);
     - async work inside transactions is rejected;
     - claims are optimistic;
     - reads happen outside locks;
     - slow writes are logged, and an hourly aviso watches the screens' p99.
   - Remaining: a phase-2 handler that does one long write inside ctx.escribir would still freeze the screens for that long. Code review must check that rule (it is in the README).

2. THE STARTUP GATE TIES DEPLOYS TO THE WORKER.
   - It never waits and reveals nothing. Outside signals (the OOM killer) do not count. After 90 s it is always 200.
   - Remaining: if a worker-only environment problem gets a good commit marked version.bad, only that exact SHA is blocked; pushing any new commit retries.
   - Users only see «arrancando» for about 1 s after a restart, and the app retries by itself.

3. SAFE MODE CAN LAST UNNOTICED UNTIL 1e (Telegram).
   - The Inicio banner and the auto-lift on new code reduce this.
   - Safe-mode and grave alerts must be SENT FROM THE WEB PROCESS in 1e, because the worker is off in safe mode (B's point). The avisos.enviado_en outbox is ready for that.

4. 512 MB.
   - Steady about 90–110 MB RSS for OPORTIA. Worst case about 185 MB before the worker restarts itself.
   - During the updater's test run, one extra server and worker exist for a few seconds.
   - Swap on the droplet is unknown. Optional read-only checks: `free -m`, `systemctl show jarvis -p LimitCORE`.
   - The web itself has no heap cap; adding one would need NODE_OPTIONS in /opt/jarvis/.env, which means a console session.
   - Phase 2 comes with the planned 1 GB droplet and CUPOS.normal = 2.

5. GROWTH UNDER «NEVER DELETE».
   - About 3 MB a year in phase 1.
   - Phase 2 must keep tasks coarse, or the base passes the 40 MB aviso and Telegram's 50 MB limit.
   - Two owner decisions belong to 1e:
     - Nightly local copies cannot rotate without deleting. The choice is one reusable transport file overwritten each night, or streaming from memory.
     - Backups pause while safe mode is on. The choice is whether to accept that.

6. CLOCK JUMPS (NTP) can expire a lease early. The fence stops double writes, but a step may run twice, so steps must be idempotent (in the contract). Anything that sends must be repetible:false and goes to 'revisar'.

7. NOT TESTED ON REAL SYSTEMD here (PID 1 in the sandbox is not systemd). The control-group stop is simulated with a process-group SIGTERM; the worker also leaves by itself on 'disconnect'. Optional read-only check once after the deploy: `systemd-cgls -u jarvis.service` should show two node processes. Never set KillMode=process.

8. ORPHAN WORKER, outside systemd only: if the parent dies while the worker's thread is blocked, the worker stays alive. Tests SIGKILL every pid in finally. In production the cgroup kill covers it.

9. THE CHECK ON tareas.estado IS FINAL, which is why all 6 states are included. A 7th state would need a new column.

10. A PORT CONFLICT now makes the process exit(1), so systemd restarts it every 5 s (journal noise only; nothing is written to the database before listen). Today the same conflict leaves a process that serves nothing.

11. ONE WORKER BY DESIGN. Starting a second copy of src/server.js by hand on another port, against the same base, would start a second worker. Leases and the fence keep the data safe, and the 45 s rule stops them from stealing each other's runs.

12. NODE AND SQLITE VERSIONS.
   - Everything used exists in Node 22.13: no db.isTransaction; spawn with 'ipc'; statfsSync; monitorEventLoopDelay; v8.getHeapStatistics.
   - The SQLite features (partial-index upsert, ON CONFLICT DO NOTHING, json_each, SAVEPOINT) were checked on 3.53.4.
   - The Node 24 upgrade is still due by April 2027.

13. SIZE: about 1,300 lines of src plus 800 of tests, in ONE commit and one 30-minute window (the worker never ships without its safe-mode switch).
   - Suggested build order:
     1. db.js nesting, conectarBase and the usuarios.js refactor (already prototyped: 92/92);
     2. migration 4 with its hash;
     3. tipos, tiempo, escritor, cola, corridas, modo-seguro, avisos, salud, with tareas.test.js;
     4. ejecutor, manejadores, trabajador, supervisor, with trabajador.test.js;
     5. server, app and the gate in cuentas, with arranque.test.js;
     6. the API, screens, i18n and pantallas.test.js;
     7. the CLI, the README and package.json 0.2.0.
   - Then validate as described in pruebas.

14. HONESTY: in 1c the queue does real but small work. The screens say clearly that projects start in phase 2. The user «Tareas» screen and the public-link status wait for owner decisions; neither is faked.

15. VERIFIED VS. NOT:
   - Verified here: the migration hash and rules; the upsert and CHECK behavior; SAVEPOINTs; nice on all threads plus IPC; the RD time slots; the query plan; the suite with nested transactions (92/92).
   - Verified by C's prototype, which this design is built from: 112/112 on 1 CPU and no orphans.
   - Not verified: the merged design built end to end, and behavior on the droplet itself.
   - Scratch work stayed under /tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/final-emga and /tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/final-exp. /home/user/jarvis and the fase-1b branch were never touched.

## jueces

[
 {
  "puntajes": [
   {
    "nombre": "Enfoque A: trabajador hijo con fork() supervisado por src/server.js (fila de tareas 24/7, fase 1c)",
    "seguridad_datos": 8,
    "estabilidad_512mb": 7,
    "simplicidad": 3,
    "cumple_reglas_dueno": 8,
    "preparado_futuro": 9,
    "total": 7,
    "fallas": "Checked against fase-1b, extracted to /tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/judge1-97DQ.\n(1) The proposed rule 'transactions only open in src/nucleo/db.js' (regex /exec\\(\\s*['\"`]\\s*(BEGIN|SAVEPOINT|COMMIT|ROLLBACK)/i) fails on code that already exists: src/cuentas/usuarios.js:24-30 has its own local enTransaccion that calls db.exec('BEGIN IMMEDIATE'). That file is not in the list of files to change. Shipped as written, the suite fails and the commit lands in version.bad.\n(2) This is the largest design: an 8-state supervisor, a JSON IPC protocol with about 7 message types, the escritor queue, exclusive tasks, zombie counting, 7 new tables, about 30 tests including 7 with real processes. Only about 370 lines of loose experiments exist (scratchpad/cola-fork); nothing was run inside the repo under the updater's conditions. That makes a flaky test, and a permanently bad version, the most likely of the three.\n(3) os.setPriority(0,10) renices only the main thread. Verified on Node 22.23.4: the other 6 threads stayed at nice 0.\n(4) abrirBaseExistente does not say it calls revisarModoPrueba (B and C do). The only test-mode guard left is leerConfig's /var/lib check.\n(5) recuperarAbandonadas can mark a task 'fallida' (2 crashes, or fallos >= max), but the design never says it calls marcarConErrores, so the project can stay en_ejecucion. Two unrelated power cuts also make an innocent task 'venenosa'.\n(6) For 1e it suggests VACUUM INTO for the nightly copies. That writes a new file every night that can never be deleted, and it does not address this conflict with never-delete (B and C both raise it).\n(7) It has the highest memory ceiling: 96 MB heap and a self-restart only at 160 MB RSS, so about 225 MB for OPORTIA in the worst case on 512 MB.\n(8) It bans CHECK in new migrations, so the database never protects estados or tipos.\n(9) Minor: if another process holds port 8080, exit(1) plus registrarArranqueServicio means a restart every 5 s forever and about 17,000 servicio_arranques rows a day that can never be deleted.",
    "mejores_ideas": "- Verified: the migration 4 hash b9daad12... matches scratchpad/cola-fork/migracion4.sql (with the leading newline), and the text passes the rules regex.\n- Listen first as the lock that guarantees a single worker.\n- An escritor that enforces a pause of max(10 ms, 2×duration) after EVERY worker write (measured: web waits dropped from 1.3–2.5 s to 12–31 ms).\n- enTransaccion nested with SAVEPOINT, so marcarConErrores is atomic and an inner failure rolls back only its own part.\n- A self-restart (exit 75) before V8 aborts on the heap limit, so no core dumps fill the disk.\n- Safe mode on a failed quick_check (base_danada) and with less than 300 MB of disk: the worker stops writing to a damaged or full database.\n- liberarPorParada, so 48 deploys a day spend no attempts.\n- The parent recovers a dead child's tasks at once.\n- The fork waits 5 s so it does not compete with the updater's first /api/setup.\n- The screens' event-loop p99 shown as proof the screens do not freeze.\n- tarea_errores append-only, so the history of errors is kept.\n- A rescue command for the console; the puedeEjecutar hook for 1d spend caps; listarTareas(espacioId) ready for phase 2."
   },
   {
    "nombre": "Phase 1c, approach B: one forked worker process, with the database as the only channel",
    "seguridad_datos": 7,
    "estabilidad_512mb": 8,
    "simplicidad": 9,
    "cumple_reglas_dueno": 8.5,
    "preparado_futuro": 5,
    "total": 7.4,
    "fallas": "Prototype verified: a copy of scratchpad/proto1c ran under env -i, as root, pinned to 1 CPU: 107/107 tests passed in 13 s and no trabajador.js process was left.\n(1) Error history is overwritten. tareas.error is one column: fallar rewrites it, soltar sets 'interrumpida' and recuperarAbandonadas sets 'abandonada', replacing the real failure message from the previous attempt. The crash log keeps only the last 10 timestamps (sumarCaida uses slice(-10)), and desactivarModoSeguro empties it. There is no errors or events table. This is the weakest audit trail, for an owner whose rule is never overwrite.\n(2) fila.fallar() updates the task in autocommit, then calls marcarConErrores() in a separate transaction (verified in src/tareas/fila.js). A crash in between leaves the task 'fallida' and the project 'en_ejecucion', and recovery never repairs it.\n(3) No quick_check and no stop when the disk is full. Health only lists avisos inside the stored JSON result.\n(4) Pacing of writes inside handlers is only a convention ('optional guardar(fn)'). A phase-2 handler that writes back-to-back reproduces B's own 3,034 ms freeze of the web.\n(5) The supervisor forks immediately in the listen callback: volverAEncenderEn starts at 0, and esperaInicialMs only scales the backoff. On the slow vCPU this competes with the updater's first health check.\n(6) os.setPriority(pid,19) renices only the main thread (verified).\n(7) The planned memory stop is V8's heap-limit abort (SIGABRT), which can leave core dumps.\n(8) Future gaps:\n- every project is scheduled at 06:00 RD, during the day and all at once;\n- concurrency 1 and no lane for big jobs (the plan says at most 2 heavy tasks, with big jobs apart);\n- no avisos table for 1e;\n- 'revisar' tasks have no screen or retry path;\n- fairness is single-level, by last start;\n- the estado CHECK can never be widened.",
    "mejores_ideas": "- The smallest design, and it really is validated (I reran it).\n- repetible is stored on each row, so recovery is pure SQL and stays safe after a code rollback.\n- Tasks of unknown types wait instead of failing, and the panel counts them (esperanVersion).\n- The generation fence is created in the same transaction that recovers abandoned tasks.\n- ON CONFLICT DO NOTHING instead of INSERT OR IGNORE (OR IGNORE silently swallows CHECK and NOT NULL violations).\n- Schedule slots with unique keys, so no schedule table: one catch-up run, never duplicates.\n- Follow-up steps are saved in the same transaction as terminar.\n- The health history comes from task results, with no new table.\n- resultado is capped at 4 KB, with the reason given.\n- Safe mode and heartbeat live in the existing ajustes table, with audit.\n- No new i18n error keys; a literal 'node:child_process' regex rule.\n- It flags that rotating local copies in 1e would require deletions the rules forbid.\n- The fewest buttons, all real; a plain Spanish explanation for the owner."
   },
   {
    "nombre": "Fila 24/7 «C»: a separate niced worker process with time-fair turns across accounts and then projects, fenced leases, step checkpoints, and safe mode that rolls itself back on a new version",
    "seguridad_datos": 8,
    "estabilidad_512mb": 8,
    "simplicidad": 4,
    "cumple_reglas_dueno": 8,
    "preparado_futuro": 9,
    "total": 7.6,
    "fallas": "Prototype verified: a copy of scratchpad/fila24-cG9Q ran under env -i, as root, pinned to 1 CPU: 112/112 tests passed in 21 s, no orphan processes, and the reglas hash matched.\n(1) A failed quick_check only opens the aviso 'base_danada' (src/tareas/manejadores.js:48-52). The worker keeps writing to a damaged database; A switches to safe mode instead.\n(2) Exit codes 3 and 4 put the supervisor in 'detenido', with no respawn and no aviso (supervisor.js:83-84). The 24/7 queue can stop silently until the next restart, and sistema.vigilar, which raises avisos, runs inside the stopped worker.\n(3) Gating /api/setup:\n- for 120 s every call can wait up to 4 s, and the updater's curl -m 5 leaves about 1 s of margin on the slow vCPU;\n- a transient environment problem that only blocks the worker rolls back a good version and puts it in version.bad forever;\n- the route is public through Funnel and now discloses queue state ('modo_seguro', 'no_arranca').\n(4) Test-only task types (prueba.morir, prueba.colgar, prueba.correo) ship in production src/tareas/tipos.js, gated only by OPORTIA_TEST.\n(5) The re-entrant enTransaccion joins the outer transaction without a SAVEPOINT, so an inner failure that the caller catches cannot be rolled back on its own.\n(6) Automatic safe mode lifts itself on every new version (up to 48 a day). That can hide a recurring cause such as memory or disk, against the owner's preference for visible causes.\n(7) 14 CHECKs are frozen forever, because rebuilding tables is forbidden (cupo IN normal/grande, cada, dia BETWEEN 0 AND 28, nivel). Future values will need workaround columns.\n(8) The largest surface: about 2,000 lines, 8 tables, virtual-time lanes with credit caps, per-type breakers and resource brakes. It is hard for a non-technical owner to reason about. 2 normal slots plus 1 'grande' allow 3 concurrent tasks on 512 MB.\n(9) Process: it reset another agent's 'proto' scratch folder; it disclosed this, but it shows the 'never overwrite' care slipping.",
    "mejores_ideas": "- Spawning through /usr/bin/nice so ALL threads are niced. Verified: os.setPriority only renices the main thread, which A and B rely on.\n- The worker's stdout and stderr are piped through the web, so an orphan can never hold a test's pipe open.\n- The most complete prototype that is actually validated.\n- alFallar (marcarConErrores) runs inside the same transaction in guardarPaso and in recovery.\n- Append-only tarea_eventos.\n- Leases fenced by dueno+tomas, renewed with the heartbeat.\n- conectarBase also requires WAL mode and calls revisarModoPrueba.\n- noEsFallo waits (tope_ia, cortesia) fit 1d spend caps without burning attempts.\n- Startup gating, so a worker that cannot boot triggers a code-only rollback, never data.\n- Resource brakes on memory and disk that still let sistema.vigilar run so the alert fires.\n- The 1e backup rotation vs never-delete conflict is raised explicitly for the owner to decide.\n- The public-link status is not faked when it cannot be read.\n- Time-based fairness, across accounts and then projects, with a credit cap.\n- horarioRepartido spreads projects across 01:00–05:59 RD.\n- avisos.enviado_en is ready for Telegram in 1e."
   }
  ],
  "ganador": "Fila 24/7 «C»: a separate niced worker process with time-fair turns across accounts and then projects, fenced leases, step checkpoints, and safe mode that rolls itself back on a new version"
 },
 {
  "puntajes": [
   {
    "nombre": "Enfoque A: trabajador hijo con fork() supervisado por src/server.js (fila de tareas 24/7, fase 1c)",
    "seguridad_datos": 8,
    "estabilidad_512mb": 6.5,
    "simplicidad": 4,
    "cumple_reglas_dueno": 7,
    "preparado_futuro": 8.5,
    "total": 6.6,
    "fallas": "1) La prioridad baja queda a medias. El hijo se pone nice 10 a sí mismo con os.setPriority(0, 10), y en Linux eso solo cambia el hilo principal. Lo medí con Node 22.23.4, también fijado a 1 CPU: los hilos quedan 10,0,0,0,0,0,0. Los hilos del recolector de V8 y de libuv siguen en nice 0 y compiten de igual a igual con la web; el Diseño 3 midió que eso sube el p99 de la web de 7,0 a 11,4 ms. Se arregla bajando la prioridad desde el padre justo después del fork (medido: los 7 hilos quedan en 19) o lanzando con /usr/bin/nice.\n2) Una regla de prueba nueva rompe la suite. La regla «las transacciones solo se abren en src/nucleo/db.js» choca con src/cuentas/usuarios.js, que ya tiene su propio enTransaccion con db.exec('BEGIN IMMEDIATE' / 'COMMIT' / 'ROLLBACK') en las líneas 24–30. Ese archivo no está en la lista de cambios. Tal como está escrita, la prueba falla y la versión no se instala.\n3) Margen de memoria demasiado amplio para 512 MB. El heap llega a 96 MB, el trabajador se reinicia solo con RSS de 160 MB y el padre lo para a los 200 MB. En el peor caso OPORTIA ocupa 225 MB, sin contar las pruebas del actualizador. Los otros dos diseños se quedan en unos 110 MB.\n4) Es el más complejo y no tiene prototipo completo. Suma 7 tablas, un protocolo IPC, una máquina de 8 estados, turnos de 20 s, tareas exclusivas con drenaje y un escritor con cola. Solo hay experimentos sueltos en cola-fork/, así que nada pasó por la suite real en 1 CPU.\n5) El reclamo busca la tarea DENTRO de BEGIN IMMEDIATE (con LEFT JOIN, NOT EXISTS y json_each). Con miles de tareas listas en la fase 2 retiene el candado de escritura más tiempo: el Diseño 3 midió 18 ms contra 0,24 ms del reclamo optimista.\n6) Si una versión trae el trabajador roto, no vuelve sola a la anterior (es una decisión explícita). Queda en modo seguro, y el dueño solo se entera si abre la pantalla: Telegram llega en 1e.\n7) Después de volver a código viejo, una tarea de un tipo que ese código no conoce se trata como reintentable, porque la lista de no reintentables sale del registro de tipos. Un correo de la fase 3 podría volver a 'pendiente'.\n8) No queda claro si las instancias cerradas como 'servicio_caido' cuentan para las 4 caídas en 15 min. Si cuentan, se mezclan las caídas de la web con las del trabajador.",
    "mejores_ideas": "- El trabajador arranca solo después de ganar el puerto, y servidor.on('error') sale con exit(1). Hoy, si el puerto está ocupado (EADDRINUSE), el proceso sigue vivo sin escuchar.\n- Espera 5 s antes del fork, para no competir con la primera revisión de /api/setup del actualizador.\n- Cuando systemd manda SIGTERM a los dos procesos a la vez y el hijo sale primero, esa salida se marca 'externo' y no cuenta como caída.\n- Cuando el hijo sale, el padre recupera sus tareas, así ninguna queda «en curso» de mentira.\n- Escritor con pausa de al menos 10 ms o el doble de lo que tardó la escritura, porque se midió que la espera de SQLite es injusta con la web.\n- La bandera de modo seguro se lee de la base cada 30 s, así el rescate por consola funciona sin reiniciar.\n- Distingue caída de parada limpia: las actualizaciones no gastan intentos. Una tarea venenosa queda fallida en la 2.ª caída, antes del umbral del modo seguro.\n- Se limita la memoria solo (sale con código 75), deja de tomar tareas con menos de 64 MB libres y mide el retraso del bucle de eventos de las pantallas.\n- enTransaccion anidable con SAVEPOINT, para que marcarConErrores quede en la misma transacción que el fallo."
   },
   {
    "nombre": "Phase 1c, approach B: one forked worker process, with the database as the only channel",
    "seguridad_datos": 8,
    "estabilidad_512mb": 8.5,
    "simplicidad": 9,
    "cumple_reglas_dueno": 8.5,
    "preparado_futuro": 6,
    "total": 7.9,
    "fallas": "1) No vuelve sola a la versión anterior si el trabajador nuevo no arranca. /api/setup sigue respondiendo 200, la versión se queda instalada y el modo seguro llega en unos 2,5 min sin que nadie se entere: Telegram llega en 1e.\n2) Hace el fork apenas abre el puerto, sin esperar. esperaInicialMs es solo la base de la espera entre reinicios, no una demora al arrancar, así que compite un poco con la primera revisión de /api/setup. El efecto es chico porque corre en nice 19.\n3) No trata la carrera de systemd. Systemd manda SIGTERM a los dos procesos a la vez; si el padre procesa la salida del hijo antes que su propio SIGTERM, guarda una caída falsa en ajustes, que sobrevive al reinicio. Es poco probable, pero ensucia el conteo de 5 caídas en 30 min.\n4) marcarConErrores corre en una transacción aparte, después de fallar(). Una caída justo entre las dos deja la tarea 'fallida' y el proyecto 'en_ejecucion'.\n5) Si el trabajador se cae y no vuelve a arrancar (modo seguro), sus tareas quedan 'en_curso' hasta el próximo arranque. Mientras tanto, la pantalla muestra algo «en curso» que no está corriendo.\n6) El trabajador no tiene un temporizador propio que lo obligue a salir. Si una tarea traba el hilo y el padre ya murió, solo lo salva el cgroup de systemd; en las pruebas, que corren sin systemd, podría quedar un huérfano.\n7) El historial de salud sale solo de la tarea de cada hora, así que en modo seguro (trabajador apagado) no hay muestras. Tampoco hay tabla de avisos para 1e.\n8) Poco preparado para lo que viene. Hace 1 tarea a la vez y no tiene carril aparte para trabajos grandes; el plan pide como máximo dos pesadas a la vez y los grandes aparte. Los turnos son solo por proyecto, no por cuenta, y la CHECK de estado no se podrá ampliar nunca.",
    "mejores_ideas": "- Es el diseño más chico que cumple todo: 1 tabla nueva y unas filas en ajustes. Lo verifiqué: 107/107 pruebas en 13,3 s fijado a 1 CPU con env -i, y sin procesos huérfanos.\n- Baja la prioridad desde el padre con os.setPriority(hijo.pid, 19) justo después del fork. Comprobé que los 7 hilos quedan en 19.\n- Heap de 64 MB y oom_score_adj 500, para que el sistema corte al trabajador antes que a la web.\n- Cada tarea guarda en su fila si se puede repetir ('repetible'). La recuperación es SQL puro y no reenvía nada aunque se vuelva a código viejo.\n- Los tipos que esta versión no conoce esperan en la fila y se ven en la pantalla ('esperanVersion').\n- El intento se cuenta al tomar la tarea: una tarea venenosa queda fallida antes de que se active el modo seguro.\n- Si una tarea se pasa de tiempo, el trabajador sale con código 3 y corta el trabajo que quedó colgado.\n- Programación por ranuras con clave única, sin tabla de programaciones: idempotente y con una sola recuperación tras estar apagado.\n- Las pruebas esperan condiciones hasta 15–20 s y cuentan los zombis como procesos terminados.\n- Se publica todo en un solo cambio, para que nunca llegue un trabajador sin su interruptor.\n- Nota para 1e: el aviso de modo seguro tiene que salir del proceso web."
   },
   {
    "nombre": "Fila 24/7 «C»: a separate niced worker process with time-fair turns across accounts and then projects, fenced leases, step checkpoints, and safe mode that rolls itself back on a new version",
    "seguridad_datos": 8,
    "estabilidad_512mb": 7.5,
    "simplicidad": 5,
    "cumple_reglas_dueno": 7.5,
    "preparado_futuro": 9,
    "total": 7.5,
    "fallas": "1) La prueba de arranque reforzada puede fallar sola. Exige setup.tareas === 'ok' con UNA sola consulta, y /api/setup espera al trabajador como máximo 4 s. Medí cuánto tarda en estar listo: 0,19 s sin carga y 1,35 s con otro proceso ocupando la misma CPU en nice 0. En la vCPU compartida del droplet, 2–3 veces más lenta, y con unattended-upgrades o tráfico al mismo tiempo, puede pasar de 4 s. Entonces la prueba falla y la versión queda en version.bad para siempre. Debería repetir la consulta hasta 20 s.\n2) /api/setup se vuelve asíncrona. Durante los primeros 2 min tras CUALQUIER reinicio, incluidos los que hace systemd tras una caída, puede tardar hasta 4 s y responde 503 si el trabajador no arranca. Eso ata las pantallas al trabajador, como el propio diseño reconoce. Además, el actualizador deja de revisar con el primer 200, así que solo atrapa los fallos que ocurren antes de esa primera respuesta.\n3) Si el trabajador sale con código 3 ('reemplazada') o 4 ('base_vieja'), queda 'detenido' para siempre, sin modo seguro y sin aviso. La fila se para en silencio hasta el próximo reinicio.\n4) Después de volver a código viejo, una tarea de un tipo desconocido se trata como reintentable (cola.js línea 213: definicion() da null y la tarea queda 'lista'). Un correo podría reenviarse cuando regrese la versión nueva. El Diseño 2 lo evita guardando 'repetible' en cada fila.\n5) El supervisor solo lee el modo seguro al arrancar. Lo que se cambie desde la consola vale recién en el próximo reinicio.\n6) Es grande: unas 1.780 líneas, 8 tablas, frenos por tipo, tiempo virtual y 3 ranuras. Mucha superficie de errores para un cambio por cada 30 minutos.\n7) Varias pruebas esperan poco para una vCPU lenta: 2–3 s.\n8) Los tipos de prueba viven en src y solo se activan con OPORTIA_TEST=1. Si esa variable llegara a producción, falla cerrado (no abre la base y vuelve a la versión anterior), pero es código de prueba dentro del programa.",
    "mejores_ideas": "- Lanza el trabajador con /usr/bin/nice -n 10 y rutas absolutas: todos sus hilos nacen con prioridad baja.\n- Pone dos topes de memoria a V8 (--max-old-space-size=64 y --max-semi-space-size=2). Medido: el pico baja de 323 a 112 MB.\n- La salida del trabajador pasa por la web, así un huérfano nunca retiene la salida de una prueba.\n- Si el trabajador de una versión nueva no arranca, /api/setup responde 503 y el actualizador vuelve solo a la versión anterior. Vale la pena conservarlo, con una prueba que repita la consulta en vez de una sola. Dentro de esa ventana no se activa el modo seguro, para no tapar el 503.\n- El modo seguro automático guarda la versión que lo causó y se quita solo una vez cuando se instala una versión nueva.\n- Frena las tareas nuevas si queda poca memoria (menos de 80 MB) o poco disco (menos de 300 MB), pero nunca la de vigilar.\n- La web toma una muestra de salud cada hora, así sigue funcionando en modo seguro, e incluye el p99 del bucle de eventos.\n- Reclamo optimista: busca la tarea fuera del candado, que se retiene solo 0,24 ms.\n- Las esperas por el tope de IA o por cortesía no cuentan como fallo.\n- Tabla de avisos con 'enviado_en', lista para Telegram en 1e.\n- Turnos justos por tiempo usado, primero entre cuentas y luego entre proyectos, con tope de crédito.\n- Prototipo verificado: 112/112 pruebas en 20,4 s fijado a 1 CPU, sin procesos huérfanos."
   }
  ],
  "ganador": "Phase 1c, approach B: one forked worker process, with the database as the only channel"
 },
 {
  "puntajes": [
   {
    "nombre": "Enfoque A: trabajador hijo con fork() supervisado por src/server.js (fila de tareas 24/7, fase 1c)",
    "seguridad_datos": 9,
    "estabilidad_512mb": 7.5,
    "simplicidad": 4,
    "cumple_reglas_dueno": 8,
    "preparado_futuro": 8,
    "total": 7,
    "fallas": "(1) Not built. /scratchpad/cola-fork holds about 490 lines of experiments, while the design itself is the largest of the three: 7 tables, a 6-message IPC protocol, an 8-state supervisor, about 35 timing constants, leases + ficha + zombies + exclusivas + 20 s ceder + escritor + SAVEPOINTs + two-level turns, a 5-card Sistema screen and about 30 planned tests over 3 deploy windows. None of it has run under the updater (root, env -i, /tmp, 1 CPU), so its testability claims are plans, not results. (2) It lowers priority with os.setPriority(0,10), which renices only the main thread. I checked it: nice per thread after os.setPriority(10) was 10,0,0,0,0,0,0, while `nice -n 10` gave 10 on all 7. GC and libuv threads stay at normal priority, so the claim of 'la web recibe 9 de cada 10 partes' holds only for the main thread. (3) The automatic 'muchos_fallos' safe mode (10 errors from 3 tasks in 30 min) will trip during an ordinary internet outage in phase 2, and only manual action ends it. There is no breaker that lifts by itself. (4) Telegram for 1e is planned through the queue (an avisos.enviado_en outbox), but safe mode stops the worker, so the alert the plan cares about most ('modo seguro… te avisa por Telegram') could never be sent. (5) Code 75 lumps zombie restarts in with memory restarts, so a hanging handler can trigger safe mode under the misleading reason 'memoria'. (6) reclamarSiguiente scans and sorts every ready row inside BEGIN IMMEDIATE, holding the write lock during the search. Design C measured 18 ms for that search versus 0.24 ms for an optimistic claim at 10k ready tasks. (7) registrarArranqueServicio runs before listen() and the new on('error') handler calls exit(1). A port conflict therefore produces an unclean start every 5 s (RestartSec), and about 20 s later 'servicio_inestable' turns safe mode on, which stays on after the port frees. The same mechanism means a broken deploy that crash-loops the web leaves the rolled-back version stuck in safe mode until the owner clicks.",
    "mejores_ideas": "- A central `escritor` that every worker write goes through, pausing max(10 ms, 2× the write's duration) after each one. It is backed by its measurement: without pauses the web waited 1.3–2.5 s; with them, 12–31 ms. This enforces the 'no back-to-back writes' rule in code instead of by convention.\n- enTransaccion that nests with SAVEPOINTs and rejects async work, so fallar() and marcarConErrores land atomically.\n- Fork the worker only after winning the port, and exit(1) when listen() fails. Today an EADDRINUSE leaves a live process that listens on nothing, because of the uncaughtException handler; I verified this from the code.\n- A clean stop (liberarPorParada) spends no attempt; a crash does. A 'poison' task is quarantined at its 2nd crash, before the safe-mode threshold.\n- The worker restarts itself before V8's heap abort (RSS > 160 MB or heap > 85 %), which avoids core dumps filling the disk.\n- New rules tests: transactions only in db.js; the worker's import graph never loads http or app.js; no CHECK in new migrations.\n- The console safe-mode flag is polled every 30 s.\n- The event-loop p99 is shown as visible proof that the screens never freeze.\n- Project runs spread over 02:00–03:59 by id.\n- listarTareas is espacio-scoped from day one."
   },
   {
    "nombre": "Phase 1c, approach B: one forked worker process, with the database as the only channel",
    "seguridad_datos": 7.5,
    "estabilidad_512mb": 7,
    "simplicidad": 9,
    "cumple_reglas_dueno": 8.5,
    "preparado_futuro": 5.5,
    "total": 7.4,
    "fallas": "(1) Phase 2 readiness is overstated ('Phase 2 just registers handlers; the queue does not change'). It runs one task at a time, while the plan wants 2 heavy tasks and 2 websites at once. It has no large or exclusive slot for the 1e backups and no lease renewal. Fairness is turn-based and single-level, so a project with long steps takes more CPU. Each task runs to completion under a 120 s cap, so long research must chain new rows through ctx.siguiente, and those rows are never deleted. All projects become ready at 06:00 RD (HORA_DE_PROYECTOS=6), just as the owner's day starts. (2) Any deadline overrun sets `contaminado` and the worker exits with code 3. The supervisor's alSalir counts every unrequested exit, codes 3 and 4 included, through anotarCaidaTrabajador. 5 such exits in 30 min mean safe mode, which only the admin can lift. In phase 2, a couple of hanging websites (3 attempts each) could stop the whole queue. (3) Priority: os.setPriority(19) in the child, plus os.setPriority(hijo.pid, 19) from the parent (which races the child's thread creation), renices only the main thread. I verified this: 10,0,0,0,0,0,0. (4) fallar() writes 'fallida' and then calls marcarConErrores in a separate BEGIN IMMEDIATE. A crash between the two leaves the task failed while its project stays en_ejecucion. (5) Crash and start history is kept only as the last 10 timestamps inside an overwritten ajustes JSON (sumarCaida slices to 10), so diagnostic history is lost. That sits poorly with 'never overwrite data', and there is no avisos table to serve as 1e's Telegram outbox. (6) It relies on V8's heap abort (SIGABRT) instead of exiting cleanly before the cap, so core dumps are possible. (7) Write pacing is a convention: the 'guardar(fn)' helper is only listed as 'optional hardening'. (8) cancelarVencidas cancels a pending project run (for example one waiting out a retry backoff) once its slot ends. (9) A crash-looping deploy triggers 'caidas_servicio', and that safe mode persists into the rolled-back version.",
    "mejores_ideas": "- By far the simplest design: about 630 lines of new src, 1 new table, the database as the only channel, and the IPC pipe used only for 'disconnect', which is enough to prevent orphans. It is fully prototyped and verified by me: 107/107 tests passed as root with env -i from /tmp, pinned to 1 CPU, in 25 s, with no leftover trabajador.js.\n- Scheduling by computed slot keys plus a unique index: enqueuing is idempotent, needs no schedule table, and after downtime there is exactly one catch-up run.\n- ON CONFLICT DO NOTHING instead of INSERT OR IGNORE, which would silently swallow CHECK and NOT NULL violations.\n- `repetible` stored per row, so recovery is pure SQL even after a code rollback. Tasks of unknown types wait and show as `esperanVersion` (rollback-safe).\n- Recovery runs in the same transaction that creates the new generation.\n- The key insight the others missed: in safe mode the worker is off, so the 1e safe-mode Telegram alert must be sent from the web process.\n- Ship 1c as one commit, so the worker never ships without its safe-mode switch.\n- The regex trap: a `\\bexec\\(` rule wrongly matches db.exec(."
   },
   {
    "nombre": "Fila 24/7 «C»: a separate niced worker process with time-fair turns across accounts and then projects, fenced leases, step checkpoints, and safe mode that rolls itself back on a new version",
    "seguridad_datos": 8.5,
    "estabilidad_512mb": 8.5,
    "simplicidad": 5,
    "cumple_reglas_dueno": 8,
    "preparado_futuro": 9,
    "total": 7.9,
    "fallas": "(1) Complexity: 8 new tables, 12 modules in src/tareas, about 1,780 lines. It brings virtual-time lanes with a credit cap, per-type circuit breakers, resource brakes, cupos, startup gating, 7 test-tuning env variables and many admin buttons ('Pausar este tipo', 'Revisar ahora' per type). That is more machinery and surface than a non-technical owner needs in 1c. (2) Test-only task types (prueba.morir, prueba.colgar…) ship in production src/tareas/tipos.js and are merged by `if (process.env.OPORTIA_TEST === '1') Object.assign(TIPOS, …)` at import. It fails closed, but test scaffolding belongs in an injected registry, as Design A proposes. (3) /api/setup gating ties deploy health to the worker. In the first 120 s it can wait up to 4 s, and any worker-only environment failure (OOM at boot, a WAL only the worker sees) causes a rollback plus version.bad for a good commit. arranque.test.js gains a new assertion, tareas==='ok'. I stress-tested that assertion 5 times with 2 busy loops on the same core and it passed in about 3 s each, so the flakiness risk is low but real. (4) The re-entrant enTransaccion just joins the outer transaction, with no SAVEPOINT. If an inner call throws and the caller catches it, partial writes survive. (5) CHECK constraints on cada, cupo, avisos.nivel and estado can never be widened, because table rebuilds are forbidden (for example a future 15-minute cadence or a third slot). (6) 1e Telegram is planned as an 'avisos.telegram' queue type, so it is silent in safe mode, exactly when the plan wants an alert. Nightly backups would also stop while safe mode lasts. (7) The rescue CLI 'modo-seguro off' takes effect only at the next restart, because the supervisor reads the flag only at start. (8) tarea_eventos adds about 2 rows per task, which is extra growth under the never-delete rule.",
    "mejores_ideas": "- Spawn through /usr/bin/nice -n 10 so ALL threads are niced. This is verified: os.setPriority renices 1 of 7 threads, `nice` renices all 7.\n- --max-semi-space-size=2 together with the heap cap (measured peak 112 MB instead of 323).\n- An optimistic claim, with the search outside the lock and a 0.24 ms locked UPDATE.\n- Time-based two-level fair queueing (account, then project) with a credit cap and per-lane weights, ready for the phase-6 plans.\n- 2 normal slots plus 1 'grande' slot for backups and imports.\n- noEsFallo waits for AI caps (1d) and per-host politeness (phase 2), which neither burn attempts nor hold a slot.\n- Per-type breakers that lift by themselves, instead of a global safe mode for transient storms.\n- A memory brake that exempts the monitoring task, so the alert can still fire.\n- Automatic safe mode tagged with the version that caused it and lifted once when a new version is installed, which fixes the 'broken deploy, then rollback stuck in safe mode' trap that A and B share.\n- /api/setup startup gating restores automatic rollback for a worker that cannot start.\n- Hourly health samples taken by the web, so they keep working in safe mode.\n- avisos.enviado_en, with re-send when the level escalates.\n- Worker stdout and stderr piped and prefixed, so an orphan can never hold a test's pipe.\n- The full prototype is verified by me: 112/112 tests passed as root with env -i from /tmp, pinned to 1 CPU, in 45 s (under load from other agents), with no leftover workers.\n- Recommended merge: keep C's core; take A's escritor and SAVEPOINT nesting and B's 'Telegram alert from the web process'; move the test types out of src."
   }
  ],
  "ganador": "Fila 24/7 «C»: a separate niced worker process with time-fair turns across accounts and then projects, fenced leases, step checkpoints, and safe mode that rolls itself back on a new version"
 }
]
