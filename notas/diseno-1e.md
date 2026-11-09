# OPORTIA · Fase 1, parte e (0.5.0) — copias cifradas fuera del servidor por Telegram + avisos graves al Telegram

**Final design (judge's merge)** of the drafts `diseno-1e-borrador-simple.md` («simple») and
`diseno-1e-borrador-restaurar.md` («restaurar primero»). Base: branch `fase-1e` = published main `c6b0626` (0.4.1).
Target **0.5.0**, migration **6** only. Self-contained: a builder needs only this file, the repository and the saved
Telegram spec.

Checked by the judge against the real code in `wt-1e` (`src/ia/llamar.js`, `src/nucleo/{db,config,salud,migraciones}.js`,
`src/tareas/{tipos,cola,ejecutor,supervisor,trabajador,manejadores,tiempo}.js`, `src/avisos/avisos.js`,
`src/claves/{usos,almacen,probar}.js`, `src/api/claves.js`, `public/app.js` (`pestanas`, `pedidosAlAbrir`),
`test/reglas.test.js`, `test/archivos.test.js`, `test/ensayo-0.3.2.mjs`, `deploy/cloud-init.sh`), against
`telegram-bot-api.json` (Bot API 10.3, 24 Aug 2026), and with three small experiments in a private temp folder (Node
22.23.4): migration 6 text + fingerprint + apply/rollback; the merged record encryption; upload memory (§6.6).
**Revision 2** applies the review round recorded in §20 (changelog): migration 6 changed (fingerprint recomputed and
re-checked through the real `abrirBase`, §10), the low-disk path, retry caps, alert rules, «comprobada», stream
authentication, the recovery-key verifier and the restore contract were reworked.

---

## 0 En pocas palabras

**Para Junior (pantalla y aviso de publicación):**
> Cada madrugada (4:40 a. m., hora de RD) OPORTIA hace una copia de toda su base de datos, la cierra con candado y la
> manda en pedazos a tu chat privado con tu bot de Telegram. Después la baja otra vez para comprobar que llegó entera, y
> deja fijado arriba en el chat un «índice» con la lista de pedazos. El candado solo se abre con TU «clave de
> recuperación»: OPORTIA te la muestra UNA vez, tú la guardas (en papel y en Contraseñas del iPhone) y el servidor nunca
> la guarda. Si el servidor se pierde, con esa clave y tu Telegram se recupera todo en uno nuevo. El mismo bot te avisa
> al momento de lo grave (modo seguro, el trabajo automático se cae, poco disco o memoria, una copia que falló, una
> actualización que falló o se devolvió, la IA llegó a su tope o su proveedor falla). Telegram es gratis. Nada se borra.

**Technical summary — eight pieces:**
1. **Recovery key** (owner's only secret): 28 Crockford symbols in 7 groups, shown once, confirmed by re-typing. From it:
   an X25519 key pair (server keeps only the **public** key), an HMAC **sello** key (server keeps it; it cannot
   decrypt, it only signs índices and every encrypted stream so a copy forged with a leaked bot token is refused) and a
   **verificador** (the server keeps only its sha256). After the one «Crear» response the key never travels to the
   server again: confirming and «Comprobar mi clave» compute the verificador **in the page** (pure JS, §5.1).
2. **Snapshot = logical dump** inside ONE read transaction of a separate read-only connection (WAL snapshot):
   typed JSON lines → gzip → encrypted stream. **No plaintext file ever touches the disk** and no temp disk is needed.
   Independent `COUNT(*)` per table inside the same snapshot, and an in-step decrypt-and-parse check, prove each copy
   complete and decryptable (except the X25519 wrap, which «Comprobar mi clave»/CLI exercise).
3. **Encrypted stream** («flujo»): X25519 (ephemeral per copy) + HKDF-SHA256 + AES-256-GCM in 64 KiB records; the
   header hash and an explicit «last record» bit are authenticated in every record (truncation, reordering, splicing
   and header changes are detected); the last plaintext line is an HMAC(sello) **stream seal**, so parts alone prove
   origin (no unauthenticated restore path).
4. **Parts** of 4 MiB (+74 B self-describing header; Telegram: upload ≤ 50 MB, download ≤ 20 MB) written to
   `oportia-copias/cifradas/<AAAA-MM>/` (when the disk allows) and uploaded to the owner's private chat; **every part is
   downloaded back and its sha256 compared**; then a signed **índice** is uploaded, downloaded back, checked and
   **pinned**, so a new server with only the bot token finds the newest copy with `getChat`. When local copies are
   paused (low disk) parts are streamed to Telegram inside the snapshot under a strict **snapshot budget** (WAL growth,
   free disk, time), and below the 300 MB brake no copy runs at all.
5. **Restore** (`src/copias/restaurar.js` + `deploy/oportia-restaurar.mjs`): the exact contract 1f wraps; from files or
   from Telegram; never overwrites; writes the OPORTIA marker last; always reports the copy's date/age and never
   silently falls back to an older copy. Full round-trip test through a fake Telegram server.
6. **Telegram as a generic channel adapter** (`src/canales/`), through the SAME single network door `src/ia/llamar.js`
   (extended with a raw body and a streaming sink). Each copy is bound to ONE bot secret.
7. **Alert sender** in the **web** process (must work in safe mode / with the worker dead): routing table, dedup on the
   existing `avisos.enviado_en` + `reenviar`, 48 h freshness, flapping silence (never for graves: «Volvió a pasar»),
   rate limits on alert messages only, one «Ya se arregló» for graves; it also evaluates `copia_atrasada` itself (so a
   dead worker cannot hide stopped backups). Update failures/rollbacks are read **read-only** from `update.log` by the
   worker's hourly `sistema.vigilar`.
8. **Screens**: new Administrador tab **Copias** (`#copias`), a Telegram group in **Claves**, a Resumen tile.

What is deliberately NOT in 1e: the restore SCREEN and installing a restored base (1f); a permanent bot poller or
webhook; answering bot commands and client channels (phase 3+); re-verifying old copies; deleting anything, anywhere.

---

## 1 Judge's decisions (what was taken from which draft, and why)

| Topic | «simple» | «restaurar» | **Final** | Why |
|---|---|---|---|---|
| Snapshot | `VACUUM INTO` a work file that is truncated and refilled every night | logical dump in one read transaction | **logical dump** | The owner rule is «never delete or overwrite files»: «simple» needed a standing exception (two rewritten plaintext work files) and 1.5× base of free disk — exactly what is missing when the off-site copy matters most. The dump needs zero temp disk, never writes plaintext, yields to the loop (VACUUM INTO is synchronous: a big base risks the worker's heartbeat — latido every 15 s, the vigía cuts after 90 s), and restores into any newer SQLite. Its fidelity risk is covered by tests 1.6–1.9, a runtime refusal of unsupported table kinds and a frozen test vector. |
| Network door | extend `src/ia/llamar.js` (one `fetch`) | new `src/canales/red.js` (2nd `fetch`) | **extend `llamar.js`** | keeps the published rule «one `fetch` in src/» and its guards (manual redirects, no error text, byte cap, 127.0.0.1-only in tests) in ONE audited place. |
| Upload body | `openAsBlob().slice()` + FormData + `gc()` | hand-built multipart `Buffer.concat` | **hand-built multipart as a `Blob([cabeza, datos, cola])`** (`datos` = file-backed `openAsBlob` when the part is on disk) **+ `--expose-gc` and `gc()` after each part** | judge's measurement (§6.6): without gc RSS grows +53–72 MB over 12 parts; with gc +22–29 MB. Exact Content-Length, no FormData internals, fake server parses it. |
| Record format | 4-byte header with «last» bit, AAD = header | final flag in nonce, trial decryption | **explicit `H` (last bit + length), AAD = sha256(stream header) ‖ H, nonce = counter** | no trial decryption; header bound in every record; verified (§5.2). |
| Parts | byte ranges of one file, no headers | self-describing 74 B headers | **self-describing parts** | Telegram may rename files (`getFile` «may not preserve the original file name»); the manual path (files saved from Telegram Desktop) must work with any names/order. |
| Índice | plain JSON | signed (HMAC sello) + sealed summary | **signed + sealed; the stream itself also sealed (rev. 2)** | a leaked token lets anyone post and pin a forged copy encrypted to the (public) key; the HMAC stops it. The sealed summary is opened by the CLI/1f; «Comprobar mi clave» uses the verificador (rev. 2). |
| Key storage | table `copias_llaves` | `ajustes` keys | **table `copias_llaves`** (+ `sello`) | append-only history, no overwriting of settings; 0.4.1 ignores it. |
| Pipeline | resumable per part from a file | everything inside one step | **resumable when the parts are on disk; streaming only when local copies are paused, under a snapshot budget (rev. 2)** | network blips resume at part *n*; the read transaction is short in the normal case and bounded in the streaming case (§6.3). |
| Linking poll | background long-poll in the web | screen-driven `revisar` (short `getUpdates`) | **screen-driven** | no permanent poller → no `getUpdates` conflict with the 1f restore CLI, nothing to resume after a restart. |
| Code | 8 digits | 8 Crockford symbols | **8 digits** («4821 7730») | easier on the iPhone; 10 min, 5 tries, hashed. |
| update.log | web every 60 s | worker hourly (`sistema.vigilar`) | **worker hourly** | «everything periodic runs as worker tasks»; ≤ 1 h latency is fine for this news. |
| Copy time | 4:40 | 3:20 | **4:40 RD** | after `sistema.base` (4:10 `quick_check`): a damaged base turns on safe mode and is never copied over a good one. |
| Alert sound | «atención» silent only at night | only grave rings | **only grave rings, always** | simpler; matches «only the urgent should wake him». |
| Closing notice | yes | no | **yes, for graves only** | the 4 a.m. URGENT deserves a «Ya se arregló». |
| Low-disk brake | — | `frenosQueIgnora: ['poco_disco']` | **dropped (rev. 2): the 300 MB brake stops copies too** | a streamed copy holds the snapshot open during network calls, so the -wal grows exactly when the disk is nearly full (review). Between the brake and the local floor it streams under a budget. |
| Extras | — | printable sheet, «Comprobar mi clave», 90-day reminder, frozen vector, `getWebhookInfo` check | **kept** (check via verificador, rev. 2) | each protects the one thing that cannot be recovered: the owner's key. |
| `base_grande` | 40 → 1024 MB | comment only | **1024 MB** | the 50 MB Telegram reason is gone (parts); size still matters for copy time on 1 vCPU. |

---

## 2 Verified facts

### 2.1 Telegram (from `telegram-bot-api.json`, Bot API 10.3)
| Fact | Spec text | Consequence |
|---|---|---|
| Upload limit | sendDocument: «Bots can currently send files of any type of up to 50 MB in size, this limit may be changed in the future» | parts ≤ 4 MiB + 74 B |
| Download limit | getFile: «bots can download files of up to 20MB in size … link … valid for at least 1 hour … may not preserve the original file name and MIME type» | every part can be verified and restored by a bot; `getFile` right before each download; names/order come from part headers |
| Download URL | `https://api.telegram.org/file/bot<token>/<file_path>` | token in the path: never logged, never in an error |
| Ids | `file_id` «can be used to download or reuse»; `file_unique_id` «same over time and for different bots. Can't be used to download» | store both; the Telegram restore path uses the SAME bot |
| Pin | pinChatMessage: «In private chats … all non-service messages can be pinned … Notifications are always disabled in … private chats» | the bot pins each night's índice |
| Find the newest | ChatFullInfo `pinned_message`: «The most recent pinned message (by sending date)» (via `getChat`) | a new server with only the token finds the newest índice (bots cannot list history) |
| Flood | `ResponseParameters.retry_after`: «seconds left to wait before the request can be repeated» | 429 → wait exactly that (capped 1 h); never counts as a failure |
| Ids size | Chat.id / file_size: «at most 52 significant bits» | chat ids stored as TEXT and sent as strings (`chat_id` accepts Integer or String) |
| getUpdates | `offset` confirms; «The negative offset can be specified to retrieve updates starting from -offset update from the end of the updates queue. All previous updates will be forgotten»; `timeout` 0 = short polling; `allowed_updates` | linking: `offset=-1` when the code is created, then confirm that one, then polls (§8.4) |
| update_id | Update.update_id: «If there are no new updates for at least a week, then identifier of the next update will be chosen randomly instead of sequentially» | never keep an offset across sessions; the first poll after forgetting goes WITHOUT offset (§8.4) |
| file_size | Document.file_size and File.file_size are «Optional» | present and different → mismatch; missing → rely on the download hash |
| Unpin | unpinChatMessage: «In private chats … all messages can be unpinned» (no rights needed) | a leaked token can unpin newer índices: each night checks the pin (§6.3) and restore always shows the copy's age (§9) |
| Webhook | getWebhookInfo: «If the bot is using getUpdates, will return an object with the url field empty» | non-empty url → `bot_ocupado`; OPORTIA never calls `deleteWebhook` on the owner's bot |
| Text / caption | 1–4096 / 0–1024 characters | alerts ≤ 1000 chars, captions ≤ 300; never `parse_mode` |
| Silent | `disable_notification` | parts/índice/non-grave alerts silent |
| Never set | `protect_content` «Protects the contents … from forwarding and saving» | never sent: the owner must be able to save files for a manual restore |
| Message fields | `Message` has `document`, `forward_origin`, `pinned_message`, `date` | path B′ (forward the índice to the bot) and stale-message filtering work |

NOT in the saved spec (the fake server imitates them; the code never depends on their wording): the error envelope
`{ok:false, error_code, description, parameters}`, the descriptions «Unauthorized», «Forbidden: bot was blocked by the
user», «Bad Request: chat not found», «Bad Request: file is too big», 409 «Conflict», 413; the deep link
`https://t.me/<bot>?start=<payload>` (arrives as text `/start <payload>`); unread updates kept ~24 h; the «~1 message per
second per chat» guidance. Mapping is by HTTP status + method; a 400 is split only by two lowercase fragments
(`chat not found`, `too big`), never shown or stored. Linking also works by typing the code.

### 2.2 Code facts the design relies on (checked in `wt-1e`)
- `llamarProveedor` (src/ia/llamar.js) is the only `fetch`; `JSON.stringify(cuerpo)` always; `leerConTope` buffers;
  timeout capped at 120 s; `destinoPermitido` = official host only, or `http://127.0.0.1:<port>` in test mode.
- `tipos.js`: `CUPOS {normal:1, grande:1}`; `POR_DEFECTO.ignoraFrenos`; `sistema.base` daily 4:10, `sistema.vigilar`
  hourly :07; `tiempo.js` RD = UTC−4 all year. `ejecutor.js`: `rssMaxMb: 120`, `discoMinimoMb: 300`,
  `FRENOS_DE_RECURSOS ['poca_memoria','poco_disco']`; ctx has `db, senal, escribir, ceder, ia`.
- `supervisor.js` `BANDERAS_TRABAJADOR = ['--no-warnings','--max-old-space-size=64','--max-semi-space-size=2']`;
  `vigiaMs: 90000` (cut after 90 s without a heartbeat); the worker sends a `latido` every 15 s. The supervisor (and its
  periodic `medirSalud`) runs in the **web** process.
- `cola.js`: a `seguir` result (`{ punto }`) resets `fallos_seguidos` to 0; `noEsFallo` errors never count; the partial
  unique index `tareas_una_viva_por_programa` (estado `lista|en_curso|revisar`) + `ON CONFLICT DO NOTHING` makes
  `encolar` return `{ nueva: false }` for a second live task of the same programa — including from inside the running
  task. `programar` marks a busy slot `programa_saltado` and runs it «apenas termine la anterior».
- `db.js` `enTransaccion` refuses async work (`transaccion_asincrona`).
- `trabajador.js` `VERSION_DE_BASE_NECESARIA = 5`; `conectarBase` requires WAL.
- `db.js` already makes plaintext `VACUUM INTO` copies before migrations (`oportia-antes-m<N>-*.db`, never deleted);
  only db.js may BEGIN/COMMIT (rule test).
- `avisos.js`: `NIVELES ['info','atencion','grave']`; `abrirAviso({…, reenviar})` clears `enviado_en` on reenviar or
  on rising to grave; one open row per clave (partial unique index).
- `usos.js` already plans `telegram_bot: { grupo: 'avisos', formato: … }`; `almacen.validarValor` supports `formato`;
  `probar.js` `PROBADORES` map; unknown motivos become `error_proveedor`; `PRUEBAS_QUE_INUTILIZAN` = `clave_no_valida`,
  `sin_permiso`.
- `salud.js` `copias()` counts only top-level `oportia*` files; `baseAtencionMb: 40` (Telegram comment).
- `deploy/cloud-init.sh` updater lines (`date -Is`): `versión <sha7>: alguna prueba falló, NO se instaló`,
  `actualizado a <sha7>`, `versión <sha7> no arrancó: volví a la anterior`; `version.bad` = full SHA.
- Migrations 1–5 have no AUTOINCREMENT, WITHOUT ROWID, generated columns, virtual tables, triggers or views (grep).
- `node:sqlite` `StatementSync.iterate` and `setReadBigInts` exist (Node 22.23.4; engines `>=22.13`).
- Repo secret scan rejects `\d{8,10}:AA…` → test tokens are built at run time and never start with `AA` literally.

---

## 3 El día que se pierde el servidor (designed backwards)

Junior holds: **(1)** his recovery key (paper and/or Contraseñas), **(2)** his Telegram account (the private chat with
his bot holds every copy; @BotFather → /mybots → bot → API Token gives the token again). Nothing else: no file from the
old server, never the master key file (`oportia-llave-secretos*` is never copied anywhere), no secrets.

| Step (1f) | Needs | From |
|---|---|---|
| A. paste the bot token | token | @BotFather (free) |
| B. find the newest copy | chat id + índice | the CLI/screen shows an 8-digit one-time code; Junior sends it to the bot (private chat only, same rules as linking §8.4) → chat id; the chat name is shown for confirmation → `getChat(chat).pinned_message.document`; the copy's date and age are shown and an age > 30 h needs an explicit «sí, esa» |
| B′. pin missing/changed | an índice | Junior forwards the índice message to the bot → `getUpdates` → `message.document.file_id` |
| B″. no bot (token lost, bot deleted) | the files | Telegram Desktop on the Mac: save one night's `.opc` parts + `-indice.txt` → CLI `--archivos=` (1f: upload screen) |
| C. download the parts | file_ids, each ≤ 20 MB | índice; parts are 4 MiB |
| D. prove it is his and intact | sello + hashes | derived from the key; índice HMAC; part sha256; stream sha256; AEAD; last-record bit; the stream seal line (HMAC sello) |
| E. decrypt | X25519 private key | derived from the key |
| F. rebuild | the dump | a NEW file, marker written last |
| G. check | — | `integrity_check`, `foreign_key_check`, per-table counts and dump hash from the sealed summary |
| H. keys | — | restored secrets are unreadable (no master key): 1f calls 1d's `empezarLlaveNueva`; Claves says «pégala otra vez» |
| I. keep backing up | same recovery key | the restored base holds the public key, sello and canal: copies resume after the token is pasted again. `ajustarTrasRestaurar` (1e, §9) marks the in-flight copy row `interrumpida` (no alert), cancels its task and gives the server a new `servidor.id` (old one kept as origin) |

Consequences: self-describing parts; small signed pinned índice carrying the file_ids; a stream with no lookahead
beyond one record and no total size; a logical dump (no page format dependency, restores old → new, no plaintext temp
file); restore never overwrites (`wx`) and writes `application_id` last, so `abrirBase` refuses a half-built file.

---

## 4 Lo que ve Junior

Rules (unchanged from 1d): every text via `t()` in `es.json` AND `en.json`; `textContent` only, never `innerHTML`; icons
from constant tables via `createElementNS` (new entries in `public/dibujos.js` `ICONOS_SERVICIOS`, 24×24 line icons,
generic, never a brand logo: `copia` (stack + shield), `nube_candado`, `avion_papel` (= Telegram), `disco`,
`clave_recuperacion` (key + check), `imprimir`); dates in `America/Santo_Domingo`; sizes with `Intl.NumberFormat`
(«41 MB»); **a button appears only when its action can run now — otherwise a one-line reason**; details behind
`<details>`; the important thing on the first phone screen; PC uses columns, nothing stretched.

### 4.1 Administrador tabs and Resumen
Tabs become `[Resumen][Usuarios][Trabajo][Servidor][Copias][IA][Claves]`: `{ id: 'copias', href: '#copias',
texto: t('admin.pestana.copias'), nombreIcono: 'copia', tono: tonos.copias }` after Servidor (the row already scrolls
sideways on the phone; the tone dot shows when not «bien»).

Resumen gains a tile in the «Servicios» row (data inside `GET /api/admin/sistema` as `copias`, so
`pedidosAlAbrir('admin')` does not change):
```
┌ ☁ Copias ─────────── ✔ ┐  bien:     verified off-site ≤ 30 h       «Hoy, 4:41 a. m.»
│ Hoy, 4:41 a. m.         │  atención: only local / no Telegram / no key «Solo en el servidor» · «Falta tu clave»
│ Fuera del servidor      │  mal:      none verified in 30 h or last failed «Falló» · «Hace 3 días»
└─────────────────────────┘  → '#copias'        and [✈ Telegram ● Avisos activos · Chat de Junior] → '#claves'
```

### 4.2 `#copias` «Copias de seguridad»
**Phone (390 px), normal — all on the first screen:**
```
┌───────────────────────────────────┐
│  (nube_candado, big, verde)        │
│  COPIA FUERA DEL SERVIDOR      ✔   │
│  Hoy, 4:41 a. m.                   │
│  41 MB · 11 partes · comprobada    │
│  Próxima: mañana, 4:40 a. m.       │
│  [   Hacer una copia ahora   ]     │
└───────────────────────────────────┘
┌ 🔑 Clave A7F3 ─┐ ┌ ✈ Telegram ──┐
│ desde 9 nov    │ │ Chat de Junior│
│ ▸ Comprobarla  │ │ ✔ unido       │
└────────────────┘ └───────────────┘
┌ 💽 En este servidor ─────────────┐
│ 23 copias · 610 MB · 7,9 GB libres│
│ ▸ alcanza para unos 900 días      │  (runway: days until the local floor, §6.2)
└───────────────────────────────────┘
▸ Últimas copias (10)
▸ Si un día pierdes el servidor
```
**PC (≥ 1100 px)**: 3 columns — big status card + button | key card + Telegram card | disk card + «Últimas copias»
table open (fecha · tamaño · partes · dónde · estado icon). The restore disclosure spans the 3 columns.

Big-card states (one icon + one word + one line):
| State | Icon / tone | Line | Button / reason |
|---|---|---|---|
| no key | `clave_recuperacion`, rojo | «Tus copias necesitan tu clave de recuperación» | [Crear mi clave de recuperación] (owner on tailnet) / «Hazlo desde tu cuenta de Tailscale» |
| key, no Telegram | `disco`, amarillo | «Solo hay copias en este servidor. Si el servidor se pierde, se pierden.» | link «Unir Telegram» → `#claves` |
| working | `copia` + progress ring | «Haciendo la copia… parte 4 de 11» (local mode: total known) / «Haciendo la copia… parte 4» (streaming: total unknown, ring indeterminate) | none (poll `GET /api/admin/copias` every 3 s only while `enCurso`; the answer is built from DB rows only, never a folder scan) |
| verified ≤ 30 h | `nube_candado`, verde | as sketch | [Hacer una copia ahora] |
| failed / late | `nube_candado` + ✖, rojo | «La última copia no se pudo comprobar (Telegram no respondió)» | [Intentar otra vez] |
| safe mode | gris | «Copias en pausa: el trabajo automático está en pausa» | reason + link `#admin/trabajo` |
| local paused (disk) | disk card amarillo | «Disco casi lleno: dejé de guardar copias aquí. Las de Telegram siguen. Nada se borró.» | none |
| disk brake (< 300 MB free) | `disco`, rojo | «Disco lleno: las copias están en pausa hasta que haya espacio. Nada se borró.» | link `#admin/servidor` |
| pin changed | `nube_candado` + ⚠, amarillo | «El mensaje fijado en tu chat no es la última copia. Fíjala otra vez o revisa quién usa tu bot.» | link «Unir Telegram» → `#claves` |

«Hacer una copia ahora» appears only when the worker runs, no copy is live, a key exists and the disk brake is off;
otherwise the reason («Ya se está haciendo una», «El trabajo automático está en pausa», «Primero crea tu clave», «Disco
lleno»). The disk card's numbers come from `copias`/`copia_partes` rows (one `SUM`), never from listing `cifradas/`.

«Si un día pierdes el servidor» (simple words; same text in the README and on the printed sheet):
1. «Ten a mano tu clave de recuperación (la del papel o la de Contraseñas).»
2. «En Telegram abre @BotFather → /mybots → tu bot → API Token, y cópialo.»
3. «En el servidor nuevo, OPORTIA te pedirá ese token y tu clave. Busca sola tu última copia (la que está fijada arriba
   en el chat con tu bot), la comprueba y la abre.» (The screen arrives in part 1f; until then Claude does it with the
   server console.)
4. «Después pega otra vez tus claves de IA y el token del bot en Claves: por seguridad nunca viajan en las copias.»
5. «No borres los mensajes del bot: son tus copias. Si borras el chat, solo quedan las copias de este servidor.»

### 4.3 Crear la clave de recuperación (owner + tailnet only; a full-screen step inside `#copias`)
```
① Tu clave de recuperación                       Clave A7F3
┌───────────────────────────────────┐
│   7K2M   Q9TB   X4PE   8WZD         │  monospace 28 px; 2 rows on the phone, 1 on PC
│   M3CA   VN6R   J5KT                │
└───────────────────────────────────┘
 ✍  Escríbela en un papel y guárdalo bien, y guárdala en Contraseñas (iPhone/Mac) como nota segura.
 🔒  Es la única forma de abrir tus copias. OPORTIA no la guarda. Si la pierdes, nadie puede abrirlas, ni tú.
 🙊  No se la des a nadie (tampoco a quien diga ser de OPORTIA).
 [Copiar] [🖨 Imprimir la hoja] [Ya la guardé →]
② Escríbela otra vez, mirando tu papel:  [ ____-____-____-____-____-____-____ ]  [Comprobar]
   ✔ «Coincide. Tus copias quedan protegidas con la clave A7F3.»
   ✖ «El grupo 3 no coincide.»  (page compares group by group with the text it still holds, then computes the
                                verificador from the TYPED text and sends only that; the server compares hashes)
   ✖ «Esa no es una clave válida: revisa letra por letra (la O y el 0 valen igual).»
```
- The key text lives only in the page's memory until ② passes or the page is left (then overwritten). A reload loses
  it: the pending key expires in 30 min and «Crear» starts again. Nothing is active until ② passes.
- The page never sends the typed key: `public/clave-recuperacion.js` (pure JS, no WebCrypto — works on plain `http://`
  tailnet addresses too, which are not a secure context) normalises it, checks the 2 control symbols, and derives the
  32-byte **verificador** (§5.1); only its hex goes to `confirmar`/`comprobar`. The server stores `sha256(verificador)`
  in `copias_llaves.verificador`. A test proves the page module and `src/copias/clave.js` agree on 1 000 keys.
- «Imprimir la hoja»: a print-only sheet (`@media print`, built with `el()`): title, date, the 7 groups, «Clave A7F3»,
  the 5 restore steps, «Guárdala donde guardas tus documentos importantes».
- «Cambiar mi clave» (closed `<details>`, warning): «Las copias de antes siguen necesitando la clave de antes (A7F3).
  No la tires.» Old public keys stay listed (never deleted).
- «Comprobar mi clave» (any time): type it → «✔ Es tu clave A7F3: abre tus copias desde el 9 nov (la última: 41 MB,
  26 tablas)» (the page sends only the verificador; the server matches it against every key's stored hash and reads
  the numbers from the `copias` row) / «Es tu clave anterior 3KQ9: abre las copias hasta el 2 dic» / «✖ No es una de
  tus claves». Every 90 days a silent Telegram reminder invites this check (owner decision 8). Opening the sealed
  summary (a real decryption) is done by the restore CLI `--comprobar` and 1f, never by the live service.

### 4.4 Claves → new group «Avisos y copias por Telegram» (same owner-only/tailnet-only rules as the AI keys)
```
No token yet:
┌ ✈ Avisos y copias por Telegram ────────────────────┐
│ ① Crea tu bot (gratis, 2 minutos)                    │
│   ▸ Cómo: 1. En Telegram busca @BotFather (marca azul). 2. Escríbele /newbot.            │
│           3. Ponle un nombre y un usuario que termine en «bot». 4. Te da un texto largo  │
│           con dos puntos (números:letras). Cópialo y pégalo aquí.                        │
│   [pega el token aquí ··········]  [Guardar y probar (gratis)]                          │
Token OK, chat not linked:
│ ① Tu bot  @oportia_junior_bot ✔ (…a1B2)  Probado hace 1 min: funciona [Probar (gratis)] │
│ ② Une tu chat:  código  4821 7730   (vence en 9:58)  │
│   [Abrir mi bot en Telegram]   (t.me/<bot>?start=<código>)                             │
│   Toca «Iniciar». ¿No se abrió? Escríbele al bot: 4821 7730                             │
│   ◌ Esperando tu mensaje…                            │
Linked:
│ ① Tu bot  @oportia_junior_bot ✔ │ ② Tu chat  Junior ✔ unido el 9 nov                     │
│   [Mandar un mensaje de prueba]   ▸ Dejar de usar este chat · Último aviso: hoy 9:02 a. m. │
Broken: «✖ No llegan los mensajes: el bot está bloqueado en tu Telegram. Desbloquéalo.» / «…la clave del bot ya no
sirve: pégala otra vez» / «…el chat ya no existe: únelo otra vez» / «Otro programa usa este bot» + [Unir otra vez]
```
Paste field exactly as 1d (one-row textarea, masked by CSS, `autocomplete=off`, cleared after sending). Over Funnel or
from another Tailscale login: the 1d texts `claves.solo_tailnet` / `claves.solo_dueno`, nothing else.

### 4.5 What arrives in Telegram (plain text, no `parse_mode`, link previews off)
- Each part (silent): document `oportia-copia-20261109-0440-1a2b3c4d-p001.opc`, caption «Copia de OPORTIA · 9 nov
  4:40 a. m. · parte 1 de 11» (local mode, total known) or «… · parte 1» (streaming mode: the total is unknown when
  the part is sent).
- Índice (silent, pinned): `oportia-copia-20261109-0440-1a2b3c4d-indice.txt`, caption «Copia de OPORTIA del 9 nov
  2026, 4:41 a. m. — 41 MB, 11 partes. No borres estos mensajes: con tu clave de recuperación se recupera todo.» (no
  «comprobada» and no ✔: the caption is written before the índice itself is checked; the screen says «comprobada»).
- Alerts (≤ 4 lines; grave rings, the rest silent):
  «🔴 OPORTIA · URGENTE / El trabajo automático se reinició 5 veces y quedó en pausa. Tus datos están bien. / Míralo en
  Administrador → Trabajo. / 9 nov, 4:12 a. m.» — and later «✅ OPORTIA · Ya se arregló / Modo seguro: se quitó
  (9 nov, 7:30 a. m.).»
- Welcome after linking: «✅ Listo, Junior. Aquí te llegarán los avisos graves y las copias de cada noche. No borres
  estos mensajes. Tienes 2 avisos abiertos: míralos en Administrador.»

---

## 5 Formato de copia v1 (exact bytes; frozen — a change is a new `formato` number, never an edit)

Layers: **volcado** (plaintext JSON lines) → gzip → **flujo** (encrypted stream) → **partes**; plus one **índice**.

### 5.1 Recovery key (`src/copias/clave.js` — the only file that turns a semilla into a private key)
```
ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'           // Crockford base32
semilla  = randomBytes(16)                                // 128 bits
cuerpo   = base32(semilla) → 26 symbols (130 bits; last 2 bits 0)
control  = base32(first 10 bits of sha256('oportia-clave-v1' ‖ semilla)) → 2 symbols
texto    = cuerpo ‖ control = 28 symbols shown as 7 groups of 4 joined by '-'
leerClave(texto): uppercase; O→0, I→1, L→1; drop spaces, '-', '.', '_'; 28 symbols of ALFABETO; pad bits 0;
  control matches → semilla, else ErrorCopias('clave_formato' | 'clave_control')   (a typo is caught ≥ 1023/1024)
derivar(semilla):
  raiz    = hkdfSync('sha256', semilla, 'oportia-recuperacion-v1', '', 32)
  d       = hkdfSync('sha256', raiz, '', 'x25519', 32)
  privada = createPrivateKey({ key: concat([hex '302e020100300506032b656e04220420', d]), format: 'der', type: 'pkcs8' })
  publica = Buffer.from(createPublicKey(privada).export({ format: 'jwk' }).x, 'base64url')     // 32 bytes
  sello   = hkdfSync('sha256', raiz, '', 'sello-indice', 32)          // signs índices AND the stream seal line (§5.3)
  verificador = hkdfSync('sha256', raiz, '', 'verificar-v1', 32)       // page-side too; server keeps sha256(verificador)
  huella  = base32(first 20 bits of sha256('oportia-huella-v1' ‖ publica)) → 4 symbols («Clave A7F3»)
```
`hkdfSync` returns an ArrayBuffer: always `Buffer.from(…)`; every derived Buffer is `.fill(0)` in `finally`. 128 random
bits need no password stretching (nobody chooses this key). The text exists on the server only in memory while «Crear»
builds its response (`Cache-Control: no-store`); never logged, stored, audited, put in an aviso or a task row. The
`clave/*` routes wrap their whole body in a catch that logs only a short code (the generic `app.js` handler, which logs
full error objects, never sees them). **Page side** (`public/clave-recuperacion.js`, an ES module with a ~80-line pure-JS
SHA-256/HMAC/HKDF, no WebCrypto because a plain-`http` tailnet address is not a secure context): `leerClave` (same
normalisation and control check) → `raiz` → `verificador`; the page sends `verificador` as 64 hex and overwrites its
buffers. It cannot derive X25519 (not needed). Generating the key in the browser stays rejected (X25519 in pure JS is a
second crypto implementation of the part that must never be wrong); the cost is that the server sees the key once,
in memory, at creation. `confirmarClave` and `crearClavePendiente` refuse the TEST key's public key
(`PUBLICAS_DE_PRUEBA` in `clave.js`: public values, not secrets).

### 5.2 Flujo (encrypted stream; `src/copias/cifrar.js` — the only copias file that calls the cipher)
```
offset size  field
0      8     magia 'OPCFLUJO'
8      2     formato u16 BE = 1
10     4     L u32 BE = length of the JSON header (1 … 4096)
14     L     JSON: {"formato":1,"app":"oportia","copia":"<uuid>","creada":"<ISO>",
                    "cifrado":"x25519-hkdf-sha256-aes-256-gcm","efimera":"<b64url 32 B>","receptor":"<huella>",
                    "trozo":65536,"compresion":"gzip","contenido":"oportia-volcado-v1","servidor":"<servidor id>"}
14+L   …     records until the one with the «último» bit; nothing may follow it:
             H  u32 BE = (ultimo ? 0x80000000 : 0) + n     (n = plaintext length 1 … 65 536; < 65 536 only if último)
             n  ciphertext
             16 GCM tag
```
```js
const efimera = generateKeyPairSync('x25519');
const efPub = Buffer.from(efimera.publicKey.export({ format: 'jwk' }).x, 'base64url');
const receptor = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: publica.toString('base64url') }, format: 'jwk' });
const compartido = diffieHellman({ privateKey: efimera.privateKey, publicKey: receptor });   // all-zero → error
const llave = Buffer.from(hkdfSync('sha256', compartido, Buffer.concat([efPub, publica]), 'oportia-copia-v1/aes-256-gcm', 32));
const hashCabecera = sha256(bytes 0 … 14+L−1);
// record i = 0, 1, 2…: nonce = 4 zero bytes ‖ u64 BE i   (unique: one fresh key per copy)
const c = createCipheriv('aes-256-gcm', llave, nonce); c.setAAD(Buffer.concat([hashCabecera, H]));
out = H ‖ c.update(trozo) ‖ c.final() ‖ c.getAuthTag();
```
Verified (judge, Node 22.23.4): both sides derive equal secrets; flipping the «último» bit in H fails the tag. The
writer keeps one record of lookahead to know the last. The reader checks the header (`formato ≤ 1`, L ≤ 4096), derives
with `diffieHellman({ privateKey: privada, publicKey: <efimera> })`, verifies each tag BEFORE emitting plaintext, and
rejects n > 65 536, a short non-last record, bytes after the last (`copia_danada`), and end of data without a last
record (`copia_cortada`). A record encrypts exactly 65 536 bytes of gzip output except the last (the volcado is never
empty: its first line always exists).
`crearDescifrador` takes `{ privada }` (restore) or `{ llaveDeCopia, hashCabecera }` — the latter only for the in-step
check of §6.3 (the writer's record key, kept in memory during `generar` and zeroed in `finally`; never stored, never
leaves the worker). Both share the same record parser, so the nightly check exercises the restore code path except the
X25519 unwrap. `crearCifrador({ efimera })` exists only for the frozen vector: a rules test forbids `efimera` in any
`src/` call.

### 5.3 Volcado `oportia-volcado-v1` (`src/copias/volcado.js`; UTF-8, one JSON value per line, `\n` never inside a line)
```
{"t":"oportia-volcado","v":1,"app":"oportia","version":"0.5.0","codigo":"<12 hex>","migracion":6,
 "application_id":1330664020,"user_version":0,"copia":"<uuid>","creado":"<ISO>"}
{"t":"esquema","tipo":"table","nombre":"usuarios","sql":"CREATE TABLE …"}     ← exact sqlite_schema.sql
{"t":"filas","tabla":"usuarios","columnas":["rowid","id","nombre",…]}
[1,1,"junior",…]                                                              ← one row per line
{"t":"fin_filas","tabla":"usuarios","n":3}
… every table in sqlite_schema rowid order (sqlite_* internal tables skipped; sqlite_stat1 is rebuilt by optimize) …
{"t":"esquema","tipo":"index","nombre":"…","sql":"CREATE INDEX …"}           ← indexes (and any trigger/view) after all rows
{"t":"fin","tablas":28,"filas":12345}
{"t":"sello","v":1,"hmac":"<hex>"}                                            ← stream seal: ALWAYS the last line
```
Stream seal: `hmac = HMAC-SHA256(sello, 'oportia-sello-flujo-v1\n' ‖ copia ‖ '\n' ‖ hex(hashCabecera) ‖ '\n' ‖
hex(sha256(B)))` where **B = every volcado byte up to and including the `fin` line's `\n`** (`volcado.bytes/sha256` in
the resumen and the copias row are over B). Restore requires it as the last line and compares with `timingSafeEqual`
(else `copia_no_autentica`): a stream encrypted to the public key by anyone without the sello is refused even with no
índice. The writer emits it because the server holds the sello.
Values: NULL → `null`; INTEGER → JSON number if |n| ≤ 2^53−1 else `{"i":"<decimal>"}`; REAL → `{"r":<number>}`
(`{"r":"Infinity"}`/`"-Infinity"`; NaN never stored by SQLite); TEXT → string; BLOB → `{"b":"<base64>"}`. Read with
`stmt.setReadBigInts(true)` (INTEGER arrives as bigint, REAL as number: that tells them apart) and `stmt.iterate()`;
columns from `pragma_table_xinfo(?) WHERE hidden = 0`; `rowid` always first. Every `sqlite_schema` row whose name starts
with `sqlite_` (internal tables, `sqlite_autoindex_*` of UNIQUE columns) or whose `sql` is NULL is skipped (SQLite
rebuilds autoindexes from the table text). `LINEA_MAX = 8 MiB`: a row whose JSON line would exceed it ends the copy
`fallida` with `fila_muy_grande:<tabla>` (the 64 MB worker heap must not hold a giant line; today no column stores
large values); the restorer refuses longer lines (`volcado_danado`) and stops when the decompressed bytes exceed
`resumen.volcado.bytes` (known from the sealed summary) or, without one, 64 GiB. The dumper refuses WITHOUT ROWID tables,
generated columns and virtual tables with `volcado_no_soportado` (a future migration that adds one must bump the
format). Restore binds INTEGER as `BigInt`, REAL as number, BLOB as Buffer: exact. It yields (`await ctx.ceder()`) every
≈ 50 ms or 2 000 rows, and checks `ctx.senal`.

Snapshot (in `src/nucleo/db.js`, still the only file that opens transactions):
```js
export function abrirFotoDeLectura({ archivoBase }) {
  revisarModoPrueba(archivoBase);
  if (leerMarca(archivoBase) !== ID_APLICACION) throw codigo('base_ajena');
  const foto = new DatabaseSync(archivoBase, { readOnly: true });
  foto.exec('PRAGMA busy_timeout = 5000;');
  foto.exec('BEGIN');                                      // DEFERRED: the WAL snapshot starts at the first read
  foto.prepare('SELECT COUNT(*) FROM sqlite_schema').get();
  return { db: foto, cerrar() { try { foto.exec('COMMIT'); } catch {} try { foto.close(); } catch {} } };
}
```
Independent counts: right after `BEGIN`, inside the same snapshot, `contarFilas(foto)` runs `SELECT COUNT(*)` per dumped
table and counts the dumped `sqlite_schema` rows. They are stored apart from the dumper's numbers and must equal each
`fin_filas.n` and the in-step check's own parsed counts (§6.3), else the copy is `fallida` (`volcado_incompleto`).
The restorer does NOT need an async transaction: it collects decoded lines into a batch (≤ 5 000 lines or ≤ 8 MiB) and
applies each batch with the existing synchronous `enTransaccion(destinoDb, () => …)`; that is safe because the marker
is written last (a half-built file is never an OPORTIA base). `db.js` gains only `abrirFotoDeLectura`.
While open, checkpoints cannot pass the snapshot (the WAL grew 5.6 MB in the «restaurar» experiment; a TRUNCATE
checkpoint returns busy); `vigilar` checkpoints later. So the snapshot is open only while no network call happens
(local mode), or under the snapshot budget of §6.3 (streaming mode). Never copies the `-wal` file: the copy reads rows
through SQLite.

### 5.4 Parte (`…-pNNN.opc`, ≤ 4 MiB + 74 B; `src/copias/formato.js`)
```
0   8   magia 'OPCPARTE'
8   2   formato u16 BE = 1
10  16  copia (UUID, 16 raw bytes)
26  4   n u32 BE (1-based, contiguous)
30  8   desde u64 BE (offset of this payload inside the flujo)
38  4   largo u32 BE (1 … TAMANO_PARTE)
42  32  sha256(payload)
74  …   payload = flujo[desde … desde+largo)
```
`TAMANO_PARTE = 4 * 1024 * 1024` (a constant; tests pass a smaller value as a parameter, never via env). The format
allows any size ≤ 20 MB, so lowering it to 2 MiB later (if the worker measurement asks, §6.6) changes no reader. File
name: `oportia-copia-AAAAMMDD-HHMM-<copia 8 hex>-p001.opc` (RD time); local files go into `cifradas/<AAAA-MM>/` (one
folder per month, so no folder grows without limit; readers take any folder and any names).

### 5.5 Índice (`…-indice.txt`, ≤ 1 MB)
```
line 1: one-line JSON (its exact bytes are signed)
{"oportia":"indice-copia","formato":1,"copia":"<uuid>","creada":"<ISO>","servidor":"<id>","version":"0.5.0",
 "migracion":6,"receptor":"A7F3","publica":"<b64url>","bot":"<bot id or null>",
 "anterior":{"copia":"<uuid>","creada":"<ISO>"} | null,"flujo":{"bytes":45678901,"sha256":"<hex>"},
 "partes":[{"n":1,"nombre":"…-p001.opc","bytes":4194378,"sha256":"<hex of the whole part file>",
            "telegram":{"mensaje":123,"archivo":"<file_id>","unico":"<file_unique_id>"}}, …],
 "sellado":"<b64url of a flujo (§5.2) whose content is the resumen JSON>"}
line 2: OPORTIA-SELLO-1 <hex HMAC-SHA256(sello, line-1 bytes)>
```
`resumen` (readable only with the key): `{"copia","volcado":{"bytes","sha256"},"tablas","filas","porTabla":{…},
"version","migracion"}` (`porTabla` = the independent `COUNT(*)` values, already proven equal to the dump's). `bot` =
the bot id the parts were sent with (restore by Telegram refuses another bot: `otro_bot`); `anterior` = the previous
copy that reached `verificada` off-site (lets 1f say «antes de esta hubo otra del …» and check the chain when Junior
forwards several índices). Local copies write the same índice with `"telegram": null` for parts not uploaded. One code
path encrypts both the big flujo and the tiny sellado. The índice holds no user data (dates, sizes, hashes, ids).

### 5.6 Versioning and what the server can check
- `formato` is in parte, flujo, índice and volcado (`v`). Readers accept `≤` their own and refuse a higher one with
  `formato_nuevo` («Usa una versión más nueva de OPORTIA para abrir esta copia: no está dañada»).
- **Frozen vector** `test/copia-v1.json` (a tiny copy made once with a fixed TEST key and fixed ephemeral key, hex)
  must restore forever (test 1.12), like the migration fingerprints.
- «Comprobada» means all of: (1) every part and the índice came back from Telegram/disk byte-identical (sha256);
  (2) the produced stream was decrypted record by record with the copy's own key, gunzipped and every line parsed in
  the same step (§6.3), with per-table counts equal to independent `COUNT(*)` values from the same snapshot and the
  stream seal present. What only the owner's key can prove (the X25519 wrap) is exercised by the round-trip tests, the
  frozen vector and the restore CLI `--comprobar`; «Comprobar mi clave» proves he still holds the right key.

---

## 6 Cómo se hace una copia (worker task `copias.hacer`)

### 6.1 Type and programme (`src/tareas/tipos.js`)
```js
'copias.hacer': Object.freeze({ cupo: 'grande', maxFallos: 3, tiempoPorPasoMs: 1_800_000, repetible: true, prioridad: 8,
  reintentos: Object.freeze({ baseMs: 10 * 60_000, factor: 3, topeMs: 6 * 3_600_000 }) }),   // 10, 30, 90 min…
PROGRAMAS_DEL_SISTEMA += { programa: 'copias.hacer', tipo: 'copias.hacer', cada: 'diaria', hora: 4, minuto: 40 }
```
- **Both resource brakes apply** (`poca_memoria`, `poco_disco` at `discoMinimoMb` 300): below 300 MB free no copy is
  claimed at all (rev. 2; a streamed copy holds the snapshot open and would grow the -wal on a nearly full disk). 1c's
  `disco_bajo` grave already rings; the screen says «Disco lleno: las copias están en pausa»; `copia_atrasada` follows
  after 30 h. No new generic brake field, `cola.js` is unchanged.
- `tiempoPorPasoMs` 30 min: only the streaming `generar` can be long, and it closes itself at 25 min (snapshot budget);
  every other step returns within ≈ 60 s.
- 4:40 RD = 08:40 UTC, after `sistema.base` 4:10 (both «grande»: never together). A nightly task older than 20 h when it
  finally runs ends `{ saltada: 'caducada' }`. A nightly run that finds a copy `verificada` (or `solo_local` when there
  is no Telegram) in the last 6 h ends `{ saltada: 'reciente' }` (a manual copy at 4:30 must not cause a second full
  copy right after: `programar` runs a skipped slot «apenas termine la anterior»).
- `repetible: true` although it sends files out — a conscious, commented exception to «what sends is not repeated»:
  it sends only to the owner's own chat; a repeat adds at most duplicate silent documents and a new copy id, and the
  attempt caps of §6.3 bound how many.
- «Hacer una copia ahora» enqueues the same programme with `claveUnica = 'copias.hacer@manual-<ms>'`, `datos.origen
  'manual'`; the 1c partial unique index keeps **one live copy** → 409 `copia_en_marcha`. A retry of a failed copy is
  **never** enqueued from inside the running task (`encolar` would silently return `{ nueva: false }`): it is a restart
  inside the same task (§6.3).
- `trabajador.js` `VERSION_DE_BASE_NECESARIA = 6`; `supervisor.js` `BANDERAS_TRABAJADOR += '--expose-gc'` (§6.6).

### 6.2 Disk policy («nunca se borra nada») — `planDeDisco` in `src/copias/estado.js` (pure)
- `estimadoMb` = bytes of the last copy, or base size × 0.6. **Floor** `pisoMb = max(2048, 2 × baseMb + walMb + 256)`
  (room for a future migration's mandatory `VACUUM INTO` pre-copy, WAL bursts and a 1f restore check). `local = ajuste
  copias.local !== false AND libreMb − estimadoMb ≥ pisoMb`.
- Not local because of disk → aviso `copias_locales_pausadas` (atención, **sent to Telegram**): «El disco del servidor
  está casi lleno (1,8 GB libres). Dejé de guardar copias en el servidor; las de Telegram siguen todas las noches. Nada
  se borró.» Resolves by itself when space returns. Below the 300 MB brake there are no copies at all (§6.1).
- **Runway** (computed by `vigilar`): `dias = (libreMb − pisoMb) / mbPorNoche` (average of the last 7 local copies);
  `dias < 30` → aviso `copias_disco_pronto` (atención, Telegram, silent): «Al ritmo de hoy, en unos 25 días dejaré de
  guardar copias en el servidor (las de Telegram siguen). Si quieres, Claude puede ayudarte a hacer espacio.»
  Resolves above 45 days. The disk card shows «alcanza para unos N días».
- No other disk need: the dump writes no temp file. Local copies, interrupted parts and the 1c pre-migration copies
  are never deleted; the screen shows count, MB and free disk. Today's base (a few MB) → ≈ 1 MB/night → < 0.5 GB/year.
- Local files: `carpetaCopias/cifradas/<AAAA-MM>/` (0640, `openSync(ruta, 'wx')` + `fsyncSync`; never overwrites). They
  are the SAME encrypted bytes as in Telegram. Counts and MB come from `copia_partes` rows (`archivo_local IS NOT NULL`,
  one `SUM(bytes)`), never from listing the folder; `salud.js` `copias()` keeps counting only top-level files (the web
  process never scans `cifradas/`).

### 6.3 Steps (`punto.paso`; every write is one short `ctx.escribir`)
**Attempt caps (rev. 2).** A «restart» = the current copy row becomes `interrumpida` (or `fallida`) and the step
returns `{ punto: { paso: 'preparar' }, esperarMs }` (≥ 10 min): a new copy (new UUID) inside the SAME task, never a new
task. `preparar` counts, from `copias` rows: **≤ 3 copies per task** (`tarea_id`) and **≤ 3 copies with uploaded parts
per RD day**; over either → `throw new ErrorTarea('copia_sin_exito', { reintentable: false })` → task `fallida`, copy
row `fallida`, aviso `copia_fallida` (grave). Telegram waits are counted in the punto (`esperas`, total `esperadoMs`):
after 12 waits or 6 h waited in one copy → `ErrorTarea('telegram_limite_largo', { reintentable: false })`. (Needed
because a `seguir` result resets `fallos_seguidos` and `noEsFallo` never counts: without these caps a sustained 429, a
step timeout or a memory exit could re-upload whole copies forever.) The caps are derived from rows, so they also
survive a worker crash.

**Bound to one bot (rev. 2).** `preparar` stores the active `telegram_bot` `secreto_id` and the bot id from `getMe`
(`cuenta_id`) on the row. Every later step uses `conCredencial(db, config, { secretoId })` (refuses if that row is no
longer the active one: `credencial_cambiada`) and calls `getMe` once per step call; a changed secret or bot id →
restart (`interrumpida`, motivo `bot_cambiado`). So the file_ids of one copy always belong to one bot.

**Shared flood pause.** On a 429 the worker also writes `canales.pausa_hasta` (like the web sender), and every step
first honours it (returns `{ punto, esperarMs }` until then, counted as a wait).

1. **preparar** — caps (above). Nightly + a copy verified < 6 h ago → `saltada: 'reciente'`. `llaveActiva(db)` none →
   `listo { saltada: 'sin_clave' }` + aviso `copias_sin_clave`. `fuera` = an `activo` canal whose token is usable
   (`secretoUsable`), not paused and `getMe` ok; `local` = §6.2. Neither → `saltada: 'sin_destino'`. Only local → aviso
   `copias_sin_telegram` (panel). If fuera and the last verified copy has an `indice_mensaje_id`: `fijado(destino)` must
   still be that message, else aviso `copia_sin_fijar` (atención, Telegram: «El mensaje fijado en tu chat ya no es la
   última copia») — catches an unpin between nights; not fatal. Insert the `copias` row (`estado 'haciendo'`, random
   `copia` UUID, `llave_id`, `receptor`, `secreto_id`, `cuenta_id`, `servidor`, flags, `origen`, `tarea_id`) →
   `{ paso: 'generar', copiaId }`.
2. **generar** — if the row already has parts (re-run after an interruption) → restart (a copy never mixes two
   snapshots; it counts toward the caps). Then `foto = abrirFotoDeLectura(config)` → `contarFilas(foto)` (§5.3) →
   `volcar(foto)` → `createGzip({ level: 6 })` → `crearCifrador` → each encrypted record goes to BOTH
   (a) `crearPartidor` (ONE reused `Buffer.allocUnsafe(TAMANO_PARTE + 74)`) and (b) the **in-step check**:
   `crearDescifrador({ llaveDeCopia, hashCabecera })` → `createGunzip()` → line splitter → `JSON.parse` of every line,
   per-table row counts, sha256 of B, seal line present and correct. For each finished part:
   - **local** → write the part file (`wx`, fsync) and insert its `copia_partes` row (`archivo_local`); no network while
     the snapshot is open;
   - **fuera only** (local paused, streaming) → upload now (§6.4) and insert the row with the Telegram ids, under the
     **snapshot budget**, measured before every part: WAL grown ≤ 64 MB since `BEGIN`, free disk ≥ 500 MB
     (`discoMinimoMb` + 200), ≤ 25 min since `BEGIN`; a 429 is waited inside only if `retry_after` ≤ 10 s. A breach, a
     longer 429 or any network error → close the snapshot → restart (motivo `foto_larga` / `telegram_limite` /
     the error) with `esperarMs = max(retry_after, 10 min)`: the snapshot cannot resume.
   The read transaction is closed in `finally`; the record key is zeroed. At the end the three counts (dumper `n`,
   independent `COUNT(*)`, check's parsed rows) and the two volcado hashes must agree, else the copy is `fallida`
   (`volcado_incompleto`, grave, `reintentable: false`: a code bug does not fix itself). The row gets `bytes, sha256,
   partes, volcado_*, tablas, filas, sellado, migracion, version`, `estado 'escrita'` (local) or `'subida'`, and →
   `subir` (local and fuera), else → `verificar`.
3. **subir** (local and fuera; resumable at part `n`) — skip parts that have `archivo_id`; otherwise upload the part
   file (§6.4); a 429 ≤ 60 s is waited inside (abortable), a longer one returns `{ punto: { paso: 'subir', n, esperas +
   1 }, esperarMs }`. A returned `document.file_size` that is present and ≠ bytes sent counts as a mismatch (re-upload,
   ≤ 2 per part); missing → the download hash decides. Returns `{ punto: { paso: 'subir', n: n + 1 } }` until the last,
   then `verificar`. `estado 'subida'`.
4. **verificar** (resumable at `n`) — fuera: `getFile(file_id)` (`file_size` present and ≠ → mismatch; missing → ok)
   → download streamed into sha256 with a cap of `bytes + 1` → must equal the part's sha256; local: re-read the file
   into sha256. On a Telegram mismatch with a local file: clear `archivo_id` (old id kept in `ultimo_error`), `intentos +
   1`, back to `subir n` (at most 2 per part); otherwise the copy is `fallida` (`motivo 'parte_distinta:<n>'`) →
   restart after 10 min (subject to the caps; aviso `copia_fallida` only when the caps end the task). A local mismatch
   → `fallida`, grave, `reintentable: false` (disk problem). Up to ≈ 60 s per step call, then it returns the next `n`.
5. **indice** — build §5.5 (`bot`, `anterior`), sign, write locally (if local), upload (caption §4.5), download it back
   and compare sha256, `pinChatMessage`, then `fijado(destino)` must return our message, else aviso `copia_sin_fijar`
   (atención, Telegram) and `fijada = 0` (not fatal: path B′ exists). Row → `estado 'verificada'` (or `'solo_local'`
   when not fuera), `verificada_en`, `fijada`. Resolve `copia_fallida`, `copia_atrasada`, `copias_sin_clave`, (if fuera)
   `copias_sin_telegram`, (if pinned) `copia_sin_fijar`. `listo`.

Errors inside steps (channel `motivo`, §8.3): `limite` → as above; `sin_red`, `tiempo_agotado`, `error_servidor`,
`respuesta_no_valida` → retryable `ErrorTarea` in local mode (resumes at `n`), restart in streaming mode;
`clave_no_valida`, `bloqueado`, `chat_no_existe` → mark the channel (as in §7.3 step 6) and finish as `solo_local` if the parts are on
disk (a broken channel never loses the local copy), else `fallida`. `ctx.senal` is passed to every network call and to
`pipeline(…, { signal })`. The 3rd consecutive failure makes the task `fallida`; `vigilar` (hourly) then closes the
copy row as `fallida` and opens `copia_fallida` (grave).

Copy states (exported list, checked by a test): `haciendo · escrita · subida · verificada · solo_local · fallida ·
interrumpida · saltada`.

### 6.4 Upload and download (memory-bounded)
- Upload: `canal.enviarArchivo({ destino, nombre, datos, leyenda, silencioso: true })` builds the multipart body as
  `new Blob([cabeza, datos, cola])` with `Content-Type: multipart/form-data; boundary=oportia<16 hex>` set by us
  (fields `chat_id`, `caption`, `disable_notification`, `document` with its file name). `datos` is
  `await openAsBlob(ruta)` (file-backed: never read into memory) for parts on disk, or the reused part buffer when
  streaming. `fetch` sets the exact Content-Length (measured). A returned `document.file_size` must equal the bytes
  sent **when present** (optional in the spec). ≥ 1.1 s between documents. After each part: `globalThis.gc?.()`.
- Download: `canal.bajar({ ruta, topeBytes, alTrozo })` streams chunks to a sha256 (or to a file in the restorer); the
  body is never kept. `ruta` (`file_path` from `getFile`) must match `^[A-Za-z0-9_\-\/.]{1,256}$` with no `..` segment
  and no leading `/`, else `respuesta_no_valida`.

### 6.5 Monitoring
- **`copia_atrasada` (grave) is evaluated by the web sender** (§7.3 step 0), not by the worker: it must fire exactly
  when the worker is dead or in safe mode. Rule: key `activa` AND canal `activo` AND `now > base + 30 h`, where
  `base = max(key confirmada_en, canal vinculado_en, last off-site verificada_en)` — no false alarm right after setup.
  Resolves when one is verified. In safe mode its text says why («las copias están en pausa por el modo seguro»).
- `src/copias/vigilar.js` (called by `sistema.vigilar` hourly, each part one short write): copy rows
  `haciendo|escrita|subida` whose task is `fallida|cancelada|revisar` or that have no live task for > 2 h → `fallida`
  (motivo = the task's error clave) or `interrumpida`, + aviso `copia_fallida`; `copias_comprobar_clave` (atención,
  silent Telegram): 90 days since the key's `comprobada_en` (or `confirmada_en`); the runway aviso (§6.2);
  `leerActualizaciones` (§7.4).

### 6.6 Memory and time budget (512 MB, 1 vCPU)
| Measurement | Result |
|---|---|
| «restaurar» prototype, full dump+gzip+encrypt+parts, `--max-old-space-size=64` | 282 MB compressible base: 15.4 s, peak RSS 85 MB; 91 MB incompressible: 11.8 s, 16 parts, 83 MB (node alone 41 MB) |
| «simple», upload+verify one 4 MiB part with gc after it | 58 → 87 MB |
| **judge**, 12 uploads of 4 MiB, `Blob([cabeza, datos, cola])`, worker flags | file-backed: +53 MB without gc, **+22 MB with `gc()`**; buffer-backed: +72 / **+29 MB** |
Inside the worker (idle ≈ 46 MB, self-exit at 120 MB RSS) the estimate is ≈ 90–100 MB in the streaming case; the
in-step check adds one gunzip window and one line (normally < 1 KB, ≤ 8 MiB by `LINEA_MAX`) and ≈ 30–50 % CPU time.
**The precise measurement is NOT in the test suite** (the updater runs the suite on the live 512 MB server; a flaky
RSS bound would put a good version in `version.bad` forever). `test/medir-copia.mjs` (outside the suite, like the
ensayo) runs a real worker child on a 200 MB base in local and streaming mode and prints peak RSS and time; it must be
run before the step-2 commit, the numbers go into the README, and **if the peak passes 105 MB, `TAMANO_PARTE` becomes
2 MiB** (constant; format unchanged) — decided then, before publishing. The suite only has generous, load-independent
checks (§13: small bases, buffer reuse, a wide ceiling). CPU: gzip level 6 + JSON on 1 vCPU, niced: seconds to tens of
seconds; the step yields every ≈ 50 ms, so the 15 s heartbeat never stops (the vigía cuts after 90 s).

---

## 7 Avisos al Telegram (sender in the web process: `src/canales/avisador.js`)

### 7.1 Why the web process
The worker is off in safe mode and is the thing that crashes; 1c already decided «Telegram alerts for safe mode sent
from the WEB in 1e» (comment in `avisos.js`). The sender does only small async I/O: one `sendMessage` at a time, 10 s
timeout, `unref`'d timer, never awaited by a request, starts after `listen`, swallows its own errors (logs a short code).

### 7.2 Routing table (`RUTA_AVISOS`, pure `vaPorTelegram(aviso)`)
| Aviso | Sent? | Sound |
|---|---|---|
| any aviso at `grave` (modo_seguro automático, base_danada, memoria_baja/disco_bajo grave, ia_costo_mayor, ia_llave, copia_atrasada, copia_fallida, actualizacion_revertida:*, ia_tope at 100 %) | yes | **yes** |
| `trabajador_reinicios`, `disco_bajo`, `memoria_baja` (atención), `copias_locales_pausadas`, `copias_sin_clave`, `actualizacion_no_instalada:*` | yes | silent |
| `ia_tope:*` at 50/80 % (re-armed by 1d's `reenviar`), `ia_proveedor:*` (any level) | yes | silent |
| `copias_comprobar_clave` (every 90 days), `copias_disco_pronto`, `copia_sin_fijar` | yes | silent |
| everything else (manual safe mode `info`, `tareas_*`, `fila_atrasada`, `freno:*`, `pantallas_lentas`, `wal_grande`, `base_grande`, `ia_llamadas:*`, `copias_sin_telegram`, `telegram_falla`) | no (screen only) | — |

### 7.3 One pass every 15 s (at most ONE message per pass)
0. **Backup staleness** (at most once per 5 min; one `SELECT` on `copias`/`copias_llaves`/`canales`): the
   `copia_atrasada` rule of §6.5 → `abrirAviso`/`resolverAviso` from the web process. It works with the worker dead or
   in safe mode, which is exactly when backups silently stop.
1. No `activo` canal, token not usable, or `canales.pausa_hasta` in the future → nothing (the panel shows why).
2. Candidates: `SELECT … FROM avisos WHERE enviado_en IS NULL AND resuelto_en IS NULL AND nivel IN ('grave','atencion',
   'info') AND ultima_vez >= now − 48 h ORDER BY (grave first), ultima_vez LIMIT 20`, filtered by `vaPorTelegram`:
   - not routed → `enviado_en = now` + `canal_envios` `resultado 'no_va'` (1c/1d re-arm it on grave or `reenviar`);
   - **flapping** (non-grave only): another row of the same `clave` was `enviado` in the last 6 h at the same or higher
     level → `'silenciado'`, no message;
   - **a grave is never silenced**: if another row of the same `clave` was sent in the last 6 h (typically followed by
     its «Ya se arregló»), the message is titled «🔴 OPORTIA · Volvió a pasar» and still rings; when the same grave
     clave reopens ≥ 3 times in 6 h, the repeats are merged into one ringing message at most every 30 min («Volvió a
     pasar 3 veces desde las 2:00»), marked `agrupado`;
   - the same row re-armed (`reenviar`, or raised to grave) → sent again, not sooner than 30 min after its last send;
   - avisos that existed before the chat was linked → `'antes_de_conectar'` (the welcome message gives their count).
3. **Closing notice**: an aviso sent at `grave` and resolved in the last 24 h with no `cierre` row → «Ya se arregló».
4. **Limits per canal**: ≤ 10 per hour, ≤ 30 per day, counted ONLY over `canal_envios` rows with `resultado 'enviado'`
   and `clase IN ('aviso','cierre','resumen','bienvenida','prueba')` — never `copia_parte`/`copia_indice` (a 200 MB base
   uploads ≈ 50 parts a night). Graves are never dropped: they wait.
   If ≥ 3 routed candidates are due → ONE `resumen` message («3 avisos de OPORTIA: …», ≤ 5 lines + «y N más»), all
   marked `agrupado`.
5. **Send, then mark** (`UPDATE avisos SET enviado_en = ? WHERE id = ? AND enviado_en IS NULL` + `canal_envios` in one
   transaction): a crash in between may repeat one message, never lose one.
6. **Errors** (§8.3): `limite` → `canales.pausa_hasta = now + retry_after` (≤ 1 h; the worker writes and honours the
   same field, §6.3); `bloqueado` (403) → canal
   `bloqueado` + aviso `telegram_falla` («Desbloquea tu bot en Telegram»); `chat_no_existe` → `perdido` + `telegram_falla`
   («Une tu chat otra vez»); `clave_no_valida` (401) → `anotarPrueba(…, 'clave_no_valida')` on the secret (1d store) +
   `telegram_falla` («Pega otra vez el token»); `sin_red/tiempo_agotado/error_servidor` → `fallos_seguidos` backoff 1, 5,
   15, 60 min; a candidate failing for 24 h → `'fallido'` (stays on the screen). A later success → canal back to
   `activo`, `telegram_falla` resolved.
7. **Texts**: `src/canales/textos.js` reads `public/i18n/<idioma del dueño>.json` once (lazily) and uses
   `telegram.aviso.<clave or prefix>.{titulo,texto}`, unknown → `telegram.aviso.otro`. Plain text ≤ 1000 chars, only
   clave, level, time and safe numbers (MB free, %, version sha7) — never user data, project names, e-mails, keys, or the
   aviso `detalle` JSON.

### 7.4 Updates that failed or were rolled back (worker, hourly, read-only)
`leerActualizaciones(db, config, ahora)`: `statSync(join(carpetaDatos, 'update.log'))`; read at most the last 64 KB
(read-only fd); parse with anchored regexes (anything else ignored):
- `^(\S+) versión ([0-9a-f]{7}): alguna prueba falló, NO se instaló$` → `abrirAviso('actualizacion_no_instalada:<sha7>', 'atencion')`;
- `^(\S+) versión ([0-9a-f]{7}) no arrancó: volví a la anterior$` → `abrirAviso('actualizacion_revertida:<sha7>', 'grave')`;
- `^(\S+) actualizado a ([0-9a-f]{7})$` → resolve open `actualizacion_*` older than that line.
Dates come from `date -Is` (with an offset): they are compared as `Date.parse` values, never as strings. Only lines
with a date newer than `ajustes['avisos.actualizaciones'].hasta` count; the first run sets `hasta = now` (no
history flood). `version.bad` (40 hex) is read only to add the full SHA to `detalle` and to show «Última versión que no
se instaló» in `#admin/servidor`. Missing/unreadable files → nothing. Neither file is ever written (the arranque test
keeps proving the service never writes outside its files). README line «Nunca abre … update.log» becomes «solo LEE
update.log y version.bad, nunca los cambia».

---

## 8 Telegram como adaptador genérico de canal (`src/canales/`)

### 8.1 Interface (`src/canales/canal.js`: lists + registry; phase 3 adds an adapter file and nothing else)
```js
export const MOTIVOS_CANAL = Object.freeze(['ok', 'clave_no_valida', 'bloqueado', 'chat_no_existe', 'demasiado_grande',
  'limite', 'conflicto', 'bot_ocupado', 'pedido_no_valido', 'error_servidor', 'sin_red', 'tiempo_agotado',
  'respuesta_no_valida', 'rechazado']);
// Every method resolves (never throws for the network): { motivo, esperarMs?, ...datos }
// adaptador = { id, nombre, hostOficial, limites: { textoMax, leyendaMax, subirMaxBytes, bajarMaxBytes, pausaArchivosMs },
//   probar(cred)                                          → { motivo, cuenta: { id, usuario, nombre } }   // getMe + getWebhookInfo
//   enviarTexto(cred, { destino, texto, silencioso })     → { motivo, mensajeId }
//   enviarArchivo(cred, { destino, nombre, datos: Blob|Buffer, leyenda, silencioso }) → { motivo, mensajeId, archivo: { id, idUnico, bytes } }
//   fijar(cred, { destino, mensajeId })                   → { motivo }
//   archivo(cred, { archivoId })                          → { motivo, ruta, bytes }                       // getFile
//   bajar(cred, { ruta, topeBytes, alTrozo })             → { motivo, bytes }                             // streamed
//   recibir(cred, { desde, limite, esperaS = 0 })         → { motivo, mensajes: [{ updateId, fecha, chat: { id, tipo }, de: { id, esBot, nombre }, texto, documento }], siguiente }
//   fijado(cred, { destino })                             → { motivo, documento }                         // getChat.pinned_message
// }
export const ADAPTADORES = Object.freeze({ telegram: TELEGRAM });
export const TIPOS_CANAL = ['telegram'], PROPOSITOS = ['avisos_dueno'], ESTADOS_CANAL = ['pendiente', 'vencido', 'activo',
  'bloqueado', 'perdido', 'desvinculado'], CLASES_ENVIO = ['aviso', 'cierre', 'resumen', 'prueba', 'bienvenida',
  'copia_parte', 'copia_indice'], RESULTADOS_ENVIO = ['enviado', 'agrupado', 'silenciado', 'no_va', 'antes_de_conectar',
  'fallido'];
```
`cred` comes only from `src/canales/credencial.js` → `conCredencial(db, config, { uso, secretoId = null }, fn)`: reads the
active `telegram_bot` secret with `leerSecreto` (with `secretoId`: exactly that row, refused with `credencial_cambiada`
if it is no longer the active one — a copy stays bound to one bot, §6.3), calls `fn(token)`, drops it. The token never enters a result, log, error,
aviso or DB row.

### 8.2 Network (the existing door `src/ia/llamar.js`, two generic options, nothing else changes)
- `cuerpoCrudo` (a `Blob` or `Buffer`): sent as-is with the caller's `Content-Type`, no `JSON.stringify`.
- `alTrozo: async (Uint8Array) => void`: when given, the body is streamed to it with the same `topeBytes` cut and NOT
  parsed (`salida.bytes` = count).
- Header comment becomes «la ÚNICA llamada a la red de OPORTIA (IA y canales)». `permitido: 'api.telegram.org'`.
  Errors still keep only name + code — essential: a Telegram URL contains the token.

### 8.3 Telegram adapter (`src/canales/telegram.js` — the only file that names `api.telegram.org`)
- Base `config.canalesBases.telegram ?? 'https://api.telegram.org'`; `config.canalesBases = config.modoPrueba ?
  basesDeCanalDePrueba(env) : {}` (`OPORTIA_TELEGRAM_URL`, same `^http:\/\/127\.0\.0\.1:\d{2,5}$` guard as `iaBases`;
  frozen; never settable from the web UI). Plus `destinoPermitido` already refuses anything but 127.0.0.1 in test mode.
- JSON methods: `POST {base}/bot{token}/{metodo}`, `timeoutMs 15 000`, `topeBytes 262 144`; `sendDocument`: multipart
  (§6.4), `timeoutMs 120 000`; file download `GET {base}/file/bot{token}/{file_path}`, `alTrozo`, cap 20 000 000.
  Text messages always `link_preview_options: { is_disabled: true }`, never `parse_mode`, never `protect_content`.
- Mapping: 200 + `ok:true` + expected shape → `ok`; non-JSON / `ok` missing / wrong shape / too deep / too big →
  `respuesta_no_valida`; 401 (or 404 on `getMe`) → `clave_no_valida`; 403 → `bloqueado`; 400 with `chat not found` →
  `chat_no_existe`; 400 on `getFile` with `too big`, or 413 → `demasiado_grande` (never retried with the same bytes);
  other 400 → `pedido_no_valido`; 409 → `conflicto`; 429 → `limite`, `esperarMs = min(parameters.retry_after ||
  retry-after header, 3600) × 1000`; 5xx → `error_servidor`; 3xx (never followed) → `respuesta_no_valida`; network →
  `sin_red` / `tiempo_agotado`; `destinoPermitido` false → `rechazado`. `getFile` without `file_path`, or a
  `file_path` failing the §6.4 pattern → `respuesta_no_valida`; `file_size` is optional everywhere (compared only when
  present).
- `probar` = `getMe` then `getWebhookInfo` (non-empty `url` → `bot_ocupado`). Registered as `PROBADORES.telegram_bot`
  (1d map) mapping to 1d `MOTIVOS` (`propositos.js` gains `bot_ocupado`, `bloqueado`, `chat_no_existe`); on `ok` it
  stores `canales.cuenta_*` and, if the bot id changed, marks the active canal `desvinculado` (`motivo 'bot_cambiado'`).
- Token: `USOS.telegram_bot = { grupo: 'avisos', formato: /^\d{6,15}:[A-Za-z0-9_-]{30,80}$/ }` (1d's plan), `GRUPOS =
  ['ia', 'avisos']`.

### 8.4 Vincular (link the owner's chat) — `src/canales/canales.js` (web, on demand)
1. `POST /api/admin/telegram/vincular`: `probar` must be `ok` (gives `@usuario`); `recibir({ desde: -1 })` returns the
   newest pending update (possibly weeks old); if there is one, `recibir({ desde: u.updateId + 1, limite: 1 })` confirms it
   so the queue is empty; `novedades_desde = NULL` (never derived from an old update: after a week without updates
   Telegram picks the next `update_id` at random, possibly LOWER). Code = 8 digits (`randomInt(0, 1e8)`, zero-padded, shown «4821 7730»); a new `canales` row `estado
   'pendiente'` with `codigo_huella = sha256('oportia-vinculo-v1|' + code)`, `codigo_desde`, `codigo_hasta = +10 min`,
   `novedades_desde`; older `pendiente` rows → `vencido`. Returns `{ codigo, enlace: 'https://t.me/<usuario>?start=<code>',
   hasta }` (`no-store`).
2. While waiting, the screen calls `POST /api/admin/telegram/vincular/revisar` every 3 s; the server calls `getUpdates`
   at most once per 3 s (`timeout 0`, `limit 50`, `allowed_updates ['message']`): WITHOUT `offset` while
   `novedades_desde` is NULL (Telegram returns the earliest unconfirmed updates, whatever their ids), then with
   `offset = novedades_desde`, which is set to `max(update_id) + 1` of the batch just seen (fresh ids within the same
   10-minute window are sequential). A stored `novedades_desde` whose row is older than 6 days is ignored (NULL). The
   `date ≥ codigo_desde − 5 s` filter (step 3) is what rejects old messages.
   (On the iPhone the page sleeps while Junior is in Telegram; when he comes back it polls again and finds the message.)
3. A message links only if `chat.type === 'private'`, `!from.is_bot`, `date ≥ codigo_desde − 5 s`, and its text after
   removing a leading `/start`, spaces and dashes is exactly the 8 digits; hashes compared with `timingSafeEqual`. Wrong
   8-digit texts add `codigo_intentos`; at 5 the row is `vencido` («Pide un código nuevo»). Anything else is ignored; a
   stranger gets no answer at all.
4. Match → one transaction: row → `activo` (`destino = String(chat.id)`, `destino_nombre = first_name` ≤ 40 chars,
   `vinculado_en`); the previous `activo|bloqueado|perdido` row → `desvinculado`; open unsent avisos older than the link
   → `antes_de_conectar`; audit `telegram_vinculado`. Then the welcome message (§4.5).
5. «Dejar de usar este chat» → `desvinculado` (row kept); console `--telegram=desvincular` does the same.
6. A deactivated or replaced `telegram_bot` secret (`trasCambio` in `api/claves.js`) pauses sending until `probar`
   passes; a different bot id → `desvinculado` (link again).

---

## 9 Restaurar (the contract 1f wraps) — `src/copias/restaurar.js`

Imports only `node:` modules, `formato.js` (part/flujo headers and `armarIndice`/`leerIndice`), `clave.js`, `cifrar.js`,
`volcado.js`, `src/nucleo/db.js`,
`src/canales/telegram.js` and the pure `src/canales/vinculo.js` (the code-matching rules of §8.4, shared with
`canales.js`) for the Telegram source. Never imported by `server.js`'s or the worker's graph (rule test).
```js
export async function restaurarCopia({
  clave,              // the typed recovery key. Never stored, never logged; derived buffers zeroed.
  fuente,             // { tipo: 'archivos', archivos: [rutas] }                       (índice optional)
                      // | { tipo: 'telegram', token, chatId, indiceArchivoId = null }   (null → pinned índice)
  destino,            // path of a NEW file (opened 'wx'); never the live oportia.db; null = only check
  carpetaTrabajo,     // where downloaded (encrypted) parts are kept; nothing deleted
  alElegir = async (elegida) => true,  // called BEFORE any part is downloaded/applied with
                      // { copia, creada, edadHoras, antigua (> 30 h), hayMasNueva: { copia, creada } | null, servidor, anterior };
                      // false → ErrorCopias('cancelada_por_dueno'). The CLI asks «¿Es esa?» when antigua or hayMasNueva.
  aceptarAnterior = false,  // archivos: if the newest índice's parts are incomplete, use the newest complete copy (else falta_parte)
  ajustar = true,     // run ajustarTrasRestaurar before the marker (tests of exact equality pass false)
  senal = null, alAvanzar = () => {}, base = null /* tests only: fake Telegram on 127.0.0.1 */, tamanoMaximoParte = 20_000_000,
}) → { ok: true, copia, creada, edadHoras, antigua, hayMasNueva, servidor, anterior, version, migracion, receptor,
       autentica: 'indice+flujo' | 'flujo', copiaEnCurso /* the copias row of this very copy, as restored */,
       tablas, filas, bytes, archivo: destino, claves: { guardadas, deIa: [...usos], telegram: true|false } }
// throws ErrorCopias(clave): clave_formato | clave_control | clave_no_es_de_esta_copia {receptor} | sin_indice |
//   indice_no_autentico | indice_danado | otro_bot | falta_parte {n, copia} | parte_danada {n} | parte_de_otra_copia {n} |
//   copia_cortada | copia_danada | copia_no_autentica | volcado_danado | volcado_no_soportado | formato_nuevo {formato} |
//   destino_existe | base_no_valida {detalle} | cancelada_por_dueno | telegram {motivo} | sin_red
export function empezarBusquedaDeChat({ token, base = null }) → { codigo, esperar({ senal, hastaMs }) → { chatId, nombre } }
                      // one-time 8-digit code, same rules as linking (§8.4: private chat, not a bot, fresh, exact code,
                      // 5 wrong tries, no offset kept across runs); used by the CLI and 1f
export function ajustarTrasRestaurar(db, { ahora }) → { copiasInterrumpidas, tareasCanceladas, servidorNuevo }
```
Order (each line is a test):
1. `leerClave` → `derivar` (a typo fails fast; the checksum names it).
2. Índice: archivos → the files whose first line parses as `indice-copia`; the newest `creada` is chosen; if its parts
   are not all present → `falta_parte { n, copia }` unless `aceptarAnterior`, then the newest complete one with
   `hayMasNueva` set (never silently). Telegram → `fijado(chatId)` → `archivo` → `bajar` (≤ 1 MB); not an índice →
   `sin_indice` (1f then asks to forward it, path B′). The token's bot id (`getMe`) must equal `indice.bot`
   (`otro_bot`).
3. `OPORTIA-SELLO-1` = HMAC(sello, line 1) with `timingSafeEqual` (else `indice_no_autentico`); `publica` must be this
   key's (else `clave_no_es_de_esta_copia` naming «A7F3»: «esta copia se hizo con tu clave anterior»). No índice at all
   (manual path) is allowed: parts are ordered by their headers and the copy is accepted only if the stream seal
   (§5.3) verifies at the end: `autentica: 'flujo'`. There is no unauthenticated path.
4. `alElegir(…)` with the date and age (from the índice, or from the flujo header when there is none). A copy older
   than 30 h, or with a newer one known, is never opened without a «sí» from the owner.
5. Parts: download (`getFile` + `/file/…`, ≤ 20 MB, `file_path` checked as §6.4, into `carpetaTrabajo` with `wx`) or
   open; sha256 of each file = índice; header magic/formato/copia/n/desde/largo/sha256 agree; `n` and `desde`
   contiguous; a duplicate identical part is tolerated.
6. Stream payloads in order → flujo header → record key → decrypt (tags first) → `createGunzip()` → split on byte 0x0A
   and decode whole lines only (UTF-8 split across chunks broke 75 rows in the «restaurar» prototype; a line longer than
   `LINEA_MAX` or more decompressed bytes than `resumen.volcado.bytes` → `volcado_danado`) → `JSON.parse`.
7. Apply into `destino` (new connection, `PRAGMA foreign_keys = OFF`): lines are batched (≤ 5 000 lines / 8 MiB) and each
   batch is applied with the existing synchronous `enTransaccion` (no async transaction anywhere): tables → rows (one
   prepared INSERT per table) → `fin_filas.n` checked → indexes/triggers/views → `fin` checked → seal line checked.
8. Check: volcado (B) length+sha256 = sealed `resumen.volcado`; per-table counts = `resumen.porTabla`; seal line ok;
   `PRAGMA integrity_check` = ok; `PRAGMA foreign_key_check` empty; then `ajustarTrasRestaurar` (if `ajustar`): the
   copias rows of this copy and any other `haciendo|escrita|subida` → `interrumpida` (motivo `restaurada`, no aviso),
   live `copias.hacer` tasks → `cancelada` (+ event), `servidor.id` → a new UUID with the old one appended to
   `servidor.origenes`, an `auditoria` row `base_restaurada`; then, LAST, `PRAGMA application_id = 0x4F505254` and
   `PRAGMA journal_mode = WAL`. Until that line the file is not an OPORTIA base (`abrirBase` refuses it).
9. Count restored `secretos` by `uso` → `claves` (what the owner must paste again).
Memory: one part (normally 4 MiB) + gunzip window + one line (measured 67–80 MB RSS).

The new `servidor.id` means a resurrected old server and the new one never pin índices under the same id; every
índice and restore result carries `servidor`, so 1f can say «esta copia viene del servidor viejo».

CLI `deploy/oportia-restaurar.mjs` (1e ships it; 1f's installer and screen call the same functions):
```
sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --archivos=<carpeta> --destino=<archivo nuevo>
sudo -u jarvis node --no-warnings /opt/jarvis/deploy/oportia-restaurar.mjs --telegram --destino=<archivo nuevo>
     (asks the token, shows «Escríbele a tu bot este código: 4821 7730», then «Encontré el chat de Junior. ¿Es el
      tuyo? (sí/no)»; strangers writing to the bot are ignored)
   --comprobar   decrypt and check only (destino null: nothing written except downloaded encrypted parts)
   --anterior    allow the newest COMPLETE copy when the newest one is missing parts (still asks)
   --json        last line is the result as JSON
```
Key and token are read from **stdin** (hidden on a TTY), NEVER from argv (`ps` shows it) or the environment. Simple
Spanish lines («Copia del 9 nov, 4:41 a. m. (hace 6 horas)», «Partes: 11 de 11, todas bien», «La clave corresponde
(A7F3)», «Base recuperada: 41 MB, 26 tablas, revisada: bien», «Tienes que pegar otra vez: clave de Claude, token del
bot»). An old copy prints «⚠ Esta copia es de hace 7 días» and asks. Exit codes: 0 ok · 2 uso · 3 clave · 4 copia
incompleta, dañada o no auténtica · 5 destino existe · 6 Telegram/red · 7 formato nuevo · 8 cancelada por el dueño.
Refuses to run as root (like `oportia-admin.mjs`) and refuses a `--destino` that exists. In test mode
(`OPORTIA_TEST=1`) the Telegram base comes from `OPORTIA_TELEGRAM_URL` (127.0.0.1 only). It never touches a key file.

1f adds on top: the screen; placing the file as `oportia.db` on a server that has none (service stopped); calling
`empezarLlaveNueva` when the master key file is absent; then the normal `abrirBase` (migrations 7+ if any).

---

## 10 Esquema — migration 6 (exact text)

Append to `MIGRACIONES` in `src/nucleo/migraciones.js`; explanations in a JS comment OUTSIDE the template (as in 4 and 5).
The template text starts with its leading newline and ends with a newline before the closing backtick (same layout as
migration 5). **sha256 = `5443d09fac022e5aea609fec97efbad138e1657bb7e57358a97e82b9a1c7bdb2`** (3709 bytes, recomputed in
revision 2 after adding `copias_llaves.verificador` and `copias.secreto_id`, `cuenta_id`, `servidor`; the old
`29aabed7…` value is void). Add `6: '5443d09f…bdb2'` (full value) to `MIGRACIONES_PUBLICADAS` and `6: '0.5.0'` to
`VERSION_DE_CADA_MIGRACION` in `test/reglas.test.js`; `package.json` → `0.5.0`.

Re-checked in revision 2 (Node 22, the real `abrirBase` of `c6b0626` in a temp folder): the rules regex gives false;
**0 CHECK, 0 UNIQUE, 0 ADD COLUMN**; applies on top of 1–5 (the pre-migration copy `oportia-antes-m6-*.db` is made);
running the text twice changes nothing; the **0.4.1 `abrirBase` (migrations 1–5) opens the v6 base, applies nothing,
`foreign_key_check` empty**. This is the last chance to change the schema of 1e: after publishing it is frozen.
If a builder changes one byte, recompute the fingerprint and re-run these checks.

```js
  {
    id: 6,
    nombre: 'copias_y_canales',
    // Fase 1, parte e. Explicaciones FUERA del texto SQL (la huella no depende de ellas).
    //  - copias_llaves: las llaves PÚBLICAS de las copias (y el «sello», que firma los índices y no abre nada). La clave
    //    de recuperación del dueño nunca se guarda; «verificador» es el sha256 de un valor derivado de ella que la
    //    página calcula (sirve para comprobarla sin mandarla). Nunca se borran: las copias viejas necesitan su llave vieja.
    //  - canales: por dónde OPORTIA habla con alguien (hoy: el chat privado del dueño con su bot de Telegram). Genérico
    //    para la fase 3+ (tipo, propósito, espacio). Una fila 'pendiente' guarda solo la huella del código de un uso.
    //  - copias / copia_partes: cada copia cifrada (fuera y/o en el servidor), sus partes, hashes y dónde están. Cada
    //    copia guarda el secreto y el bot con que se mandó (una copia nunca mezcla dos bots) y el servidor que la hizo.
    //  - canal_envios: cada mensaje que salió (o no) por un canal: no repetir avisos y los topes por hora y por día.
    //  - Sin CHECK ni índices únicos: los valores se revisan en el código (un CHECK nunca se puede ampliar).
    sql: `
CREATE TABLE IF NOT EXISTS copias_llaves (
  id INTEGER PRIMARY KEY,
  formato INTEGER NOT NULL DEFAULT 1,
  publica TEXT NOT NULL,
  sello TEXT NOT NULL,
  huella TEXT NOT NULL,
  verificador TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  creada_por INTEGER REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  vence_en TEXT,
  confirmada_en TEXT,
  reemplazada_en TEXT,
  comprobada_en TEXT
);
CREATE INDEX IF NOT EXISTS copias_llaves_estado ON copias_llaves(estado, id);
CREATE TABLE IF NOT EXISTS canales (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  proposito TEXT NOT NULL DEFAULT 'avisos_dueno',
  espacio_id INTEGER REFERENCES espacios(id),
  estado TEXT NOT NULL DEFAULT 'pendiente',
  secreto_id INTEGER REFERENCES secretos(id),
  cuenta_id TEXT,
  cuenta_nombre TEXT,
  destino TEXT,
  destino_nombre TEXT,
  codigo_huella TEXT,
  codigo_desde TEXT,
  codigo_hasta TEXT,
  codigo_intentos INTEGER NOT NULL DEFAULT 0,
  novedades_desde INTEGER,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  vinculado_en TEXT,
  desvinculado_por INTEGER REFERENCES usuarios(id),
  desvinculado_en TEXT,
  motivo TEXT,
  ultimo_ok_en TEXT,
  ultimo_error TEXT,
  ultimo_error_en TEXT,
  fallos_seguidos INTEGER NOT NULL DEFAULT 0,
  pausa_hasta TEXT
);
CREATE INDEX IF NOT EXISTS canales_por_proposito ON canales(tipo, proposito, espacio_id, estado, id);
CREATE TABLE IF NOT EXISTS copias (
  id INTEGER PRIMARY KEY,
  copia TEXT NOT NULL,
  formato INTEGER NOT NULL DEFAULT 1,
  origen TEXT NOT NULL DEFAULT 'noche',
  tarea_id INTEGER REFERENCES tareas(id),
  estado TEXT NOT NULL DEFAULT 'haciendo',
  llave_id INTEGER REFERENCES copias_llaves(id),
  receptor TEXT NOT NULL DEFAULT '',
  local INTEGER NOT NULL DEFAULT 0,
  fuera INTEGER NOT NULL DEFAULT 0,
  canal_id INTEGER REFERENCES canales(id),
  secreto_id INTEGER REFERENCES secretos(id),
  cuenta_id TEXT,
  servidor TEXT,
  partes INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  volcado_bytes INTEGER,
  volcado_sha256 TEXT,
  tablas INTEGER,
  filas INTEGER,
  migracion INTEGER,
  version TEXT,
  sellado TEXT,
  indice_sha256 TEXT,
  indice_mensaje_id INTEGER,
  indice_archivo_id TEXT,
  fijada INTEGER NOT NULL DEFAULT 0,
  motivo TEXT,
  detalle TEXT,
  empezada_en TEXT NOT NULL,
  escrita_en TEXT,
  subida_en TEXT,
  verificada_en TEXT,
  terminada_en TEXT
);
CREATE INDEX IF NOT EXISTS copias_por_fecha ON copias(empezada_en);
CREATE INDEX IF NOT EXISTS copias_por_estado ON copias(estado, verificada_en);
CREATE INDEX IF NOT EXISTS copias_por_uuid ON copias(copia);
CREATE TABLE IF NOT EXISTS copia_partes (
  id INTEGER PRIMARY KEY,
  copia_id INTEGER NOT NULL REFERENCES copias(id),
  n INTEGER NOT NULL,
  desde INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  archivo_local TEXT,
  mensaje_id INTEGER,
  archivo_id TEXT,
  archivo_id_unico TEXT,
  subida_en TEXT,
  verificada_en TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT
);
CREATE INDEX IF NOT EXISTS copia_partes_copia ON copia_partes(copia_id, n);
CREATE TABLE IF NOT EXISTS canal_envios (
  id INTEGER PRIMARY KEY,
  canal_id INTEGER NOT NULL REFERENCES canales(id),
  clase TEXT NOT NULL,
  aviso_id INTEGER REFERENCES avisos(id),
  clave TEXT,
  nivel TEXT,
  copia_id INTEGER REFERENCES copias(id),
  resultado TEXT NOT NULL,
  motivo TEXT,
  mensaje_id INTEGER,
  bytes INTEGER,
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS canal_envios_fecha ON canal_envios(canal_id, creado_en);
CREATE INDEX IF NOT EXISTS canal_envios_aviso ON canal_envios(aviso_id, clase);
CREATE INDEX IF NOT EXISTS canal_envios_clave ON canal_envios(clave, creado_en);
`,
  },
```
Values checked in code (exported lists + a test that the base holds only them):
| Field | Values |
|---|---|
| `copias_llaves.estado` | `pendiente` (30 min, `vence_en`) · `activa` · `anterior` (a newer one was confirmed) · `caducada` (pending never confirmed) |
| `canales.*` | see `TIPOS_CANAL`, `PROPOSITOS`, `ESTADOS_CANAL` (§8.1) |
| `canal_envios.clase / resultado` | `CLASES_ENVIO` / `RESULTADOS_ENVIO` (§8.1) |
| `copias.estado` | §6.3 list; `copias.origen`: `noche` · `manual` |
| `secretos.uso` | + `telegram_bot` (grupo `avisos`) |
| `avisos.clave` | + `copias_sin_clave`, `copias_sin_telegram`, `copia_fallida`, `copia_atrasada`, `copias_locales_pausadas`, `copias_disco_pronto`, `copia_sin_fijar`, `copias_comprobar_clave`, `telegram_falla`, and regex `^actualizacion_(?:no_instalada|revertida):[0-9a-f]{7}$` |
Settings in `ajustes` (1c upsert pattern + an `auditoria` row; never returned raw): `copias.ajustes` `{ local: true }`;
`servidor.id` (random UUID made once; goes into every copy; replaced by `ajustarTrasRestaurar`, the old ones kept in
`servidor.origenes`); `avisos.actualizaciones` `{ hasta }`.
Growth: ~1 copy row + ~1–20 part rows + a few envio rows per night → < 2 MB/year.

---

## 11 Módulos e interfaces

### 11.1 New files
```
src/copias/formato.js     constants (magias, FORMATO=1, TROZO=65536, TAMANO_PARTE, CABECERA_MAX, límites), part/flujo-header
                          (de)serializers, nombres (RD time), armarIndice/leerIndice (with sello), ErrorCopias
src/copias/clave.js       crearClave() → { texto, semilla }; leerClave(texto) → semilla; derivar(semilla) → { privada, publica, sello, verificador, huella };
                          huellaDe(publica); hashVerificador(hex); PUBLICAS_DE_PRUEBA
src/copias/cifrar.js      crearCifrador({ publica, cabeceraExtra, efimera? /*frozen vector only*/ }) → { cabecera, hashCabecera, llaveDeCopia, trozo(buf, ultimo), cerrar() };
                          crearDescifrador({ privada } | { llaveDeCopia, hashCabecera }) → Transform; sellar(json, publica); abrirSellado(texto, privada)
src/copias/volcado.js     async *volcar(foto, { ceder, senal, copia, version, codigo, sello, hashCabecera }) (ends with the seal line);
                          contarFilas(foto); crearLector({ lineaMax, bytesMax }) (line splitter + counts + B hash + seal check, used by the
                          in-step check AND the restorer); crearAplicador(db) → { lote(lineas) /* one sync enTransaccion */, terminar() }
src/copias/estado.js      llaveActiva, crearClavePendiente, confirmarClave(verificadorHex), comprobarClave(verificadorHex), planDeDisco (pure), topesDeIntento, empezarCopia,
                          guardarParte, terminarCopia, estadoCopias (GET /api/admin/copias), resumenCopias (sistema), proximaCopia
src/copias/hacer.js       MANEJADOR_COPIAS (preparar/generar/subir/verificar/indice) + crearPartidor
src/copias/vigilar.js     vigilarCopias(db, config, ahora) (stuck rows, 90 days, runway); leerActualizaciones(db, config, ahora);
                          copiaAtrasada(db, ahora) (pure query, called by the WEB avisador)
src/copias/restaurar.js   restaurarCopia, empezarBusquedaDeChat, ajustarTrasRestaurar (§9)
src/canales/canal.js      MOTIVOS_CANAL, ADAPTADORES, lists (§8.1)
src/canales/telegram.js   TELEGRAM adapter (§8.3)
src/canales/credencial.js conCredencial(db, config, { uso, secretoId }, fn) — the only leerSecreto caller in src/canales
src/canales/vinculo.js    pure code rules: crearCodigo, huellaCodigo, mensajeConCodigo(m, { huella, desde }) (linking + restore CLI)
src/canales/canales.js    canalActivo, empezarVinculo, revisarVinculo, desvincular, anotarEnvio, anotarFallo, enviosRecientes
src/canales/avisador.js   crearAvisador({ db, config, reloj, adaptador }) → { iniciar, parar, pasada } ; RUTA_AVISOS, TOPES_ENVIO, vaPorTelegram
src/canales/textos.js     textoDeAviso(aviso, idioma), textoCopia(...) from public/i18n/*.json
src/api/copias.js         routes §12
src/api/canales.js        Telegram routes §12
deploy/oportia-restaurar.mjs   CLI §9
public/clave-recuperacion.js   page-side leerClave + pure-JS SHA-256/HMAC/HKDF → verificador (§5.1); imports nothing; imported by
                          app.js like `creador.js`/`dibujos.js` (the 0.3.3 server adds its `?v=` fingerprint and modulepreload
                          automatically); added to the compressed-files list in `test/archivos.test.js`
test/telegram-falso.js    fake Bot API server §13.1
test/copias-base.js       helpers (small bases with every type, fixed TEST key, fake canal)
test/copia-v1.json        frozen vector (made once by a scratch script; never edited)
test/copias.test.js, test/copias-restaurar.test.js, test/telegram.test.js, test/avisador.test.js, test/copias-api.test.js
test/ensayo-0.4.1.mjs     rollback rehearsal (outside the suite, like ensayo-0.3.2.mjs)
test/medir-copia.mjs      200 MB measurement in a real worker child, local + streaming (outside the suite; decides 4 vs 2 MiB)
```
### 11.2 Changed files
`src/nucleo/migraciones.js` (m6) · `src/nucleo/db.js` (`abrirFotoDeLectura` only) · `src/nucleo/config.js`
(`canalesBases`) · `src/nucleo/salud.js` (`baseAtencionMb: 1024` + comment; `copias()` unchanged: never scans `cifradas/`) ·
`src/ia/llamar.js` (`cuerpoCrudo`, `alTrozo`, comment) · `src/ia/propositos.js` (`MOTIVOS` + `bot_ocupado`, `bloqueado`,
`chat_no_existe`) · `src/tareas/tipos.js` (type, programme) · `src/tareas/manejadores.js` (`'copias.hacer'`; `vigilar` calls `vigilarCopias` + `leerActualizaciones`)
· `src/tareas/trabajador.js` (`VERSION_DE_BASE_NECESARIA = 6`) · `src/tareas/supervisor.js` (`--expose-gc`) ·
`src/avisos/avisos.js` (keys + regex) · `src/claves/usos.js` (`telegram_bot`, `GRUPOS`) · `src/claves/probar.js`
(`PROBADORES.telegram_bot` → `src/canales/telegram.js`) · `src/api/claves.js` (`trasCambio` for `telegram_bot`;
`GET /api/admin/claves` adds `telegram`) · `src/api/tareas.js` (`estadoDelSistema.copias` + `.telegram`) · `src/app.js`
(register routes) · `src/server.js` (start the avisador after `listen` when the db is open; `await avisador.parar()` in
`cerrar()` before `db.close()`) · `deploy/oportia-admin.mjs` (`--copias=estado`, `--copias=ahora`, `--telegram=desvincular`)
· `public/app.js`, `public/dibujos.js`, `public/estilos.css`, `public/i18n/{es,en}.json` · `README.md` ·
`test/reglas.test.js`, `test/archivos.test.js` (`pedidosAlAbrir('copias')` and `PANTALLAS`), `test/rescate.test.js` /
`trabajador.test.js` (flags).

### 11.3 Which process runs what
| Work | Process |
|---|---|
| nightly/manual copy, verification, índice, pin; `vigilarCopias`; `leerActualizaciones` | worker (niced child, cupo grande / vigilar) |
| alert sender (every 15 s) incl. `copia_atrasada` (every 5 min); linking (`getUpdates` on demand); test message; free token test | web (small async I/O) |
| create the recovery key (instant crypto, < 5 ms); confirm / check by verificador hash | web (the typed key stays in the page) |
| restore | CLI / 1f installer, never inside the running service |

---

## 12 API (JSON; POSTs need `X-Oportia` + same Origin as today; no DELETE route)
| Route | Access | Answer |
|---|---|---|
| `GET /api/admin/copias` | admin, any entrance (read-only) | `{ clave: { activa, huella, desde, comprobadaEn, pendiente, anteriores: [{ huella, desde, hasta }] }, telegram: { listo, motivo, chat, bot }, ultima, ultimaFuera: { fecha, bytes, partes, estado }, proxima, enCurso: { paso, n, de \| null } \| null, locales: { activas, pausadas, frenoDisco, archivos, mb, libreMb, pisoMb, diasRestantes } (from DB rows + one `statfs`, never a folder scan), fijada, recientes: [≤ 10 { fecha, origen, bytes, partes, local, fuera, estado, motivo }], modoSeguro, puede: { ahora, motivoNoAhora, crearClave } }` |
| `POST /api/admin/copias/ahora` | admin, limiter 6/h | `202 { tarea }`; `409 copia_en_marcha / falta_clave / sin_destino / trabajo_en_pausa / disco_lleno` |
| `POST /api/admin/copias/clave/nueva` | admin + soloDueno, limiter 10/10 min | `201 { clave, huella, expira }`, `Cache-Control: no-store` — the ONLY response that ever carries the key |
| `POST /api/admin/copias/clave/confirmar` `{ verificador }` (64 hex, computed in the page) | admin + soloDueno | `{ activa: { huella, desde } }`; `400 verificador_formato / clave_no_coincide`; `409 sin_pendiente` (format and control-symbol errors are shown by the page itself) |
| `POST /api/admin/copias/clave/comprobar` `{ verificador }` | admin + soloDueno, limiter 10/10 min | `{ resultado: 'actual'\|'anterior'\|'no_es', huella, desde, hasta, ultimaCopia: { bytes, tablas } }` |
| `POST /api/admin/telegram/vincular` | admin + soloDueno, limiter | `201 { codigo, enlace, hasta }`; `409 sin_token / clave_no_valida / bot_ocupado` |
| `POST /api/admin/telegram/vincular/revisar` | admin + soloDueno (≤ 1 Telegram call / 3 s) | `{ estado: 'esperando'\|'vinculado'\|'vencido', chat? }` |
| `POST /api/admin/telegram/prueba` | admin + soloDueno, limiter 5/10 min | `{ motivo }` |
| `POST /api/admin/telegram/desvincular` | admin + soloDueno | `{ chat: { estado: 'desvinculado' } }` |
| `GET /api/admin/claves` (1d) | unchanged guard | + `telegram: { bot, chat: { estado, nombre, vinculadoEn, problema }, vinculo: { pendiente, hasta }, envios: { ultimoOk, ultimoError, hoy } }` |
| `GET /api/admin/sistema` (1c) | unchanged | + `copias: { estado, ultimaFuera, proxima, tono }`, `telegram: { listo, chat }` |
The token itself goes through the existing `POST /api/admin/claves { uso: 'telegram_bot', valor }` (1d). Every
`clave/*` route catches its own errors and logs only a short code (no request body, no error object).
`pedidosAlAbrir` adds `if (seccion === 'copias') return admin ? ['/api/admin/copias'] : [];` and
`test/archivos.test.js` gets that exact case plus `['copias', 'pantallaCopias']` in `PANTALLAS`.

---

## 13 Pruebas (every `.test.js` imports `./ayuda.js`; never internet; never a real token — tokens are built at run
time, e.g. `[String(7e8 + n), 'Bx'.repeat(18)].join(':')`, so the repo scanner never sees one)

### 13.1 Fake Telegram Bot API (`test/telegram-falso.js`, `127.0.0.1:0`, tests only)
`crearTelegramFalso({ bots, chats }) → { url, cerrar(), escena(metodo|'*', nombre, { veces }), mandarUpdate(u),
pedidos, mensajes, documentos, fijados }`. Routes `POST|GET /bot<token>/<metodo>` (JSON and multipart/form-data with a
real boundary parser) and `GET /file/bot<token>/<file_path>`. State: bots (token → id, username, webhook url), chats,
messages, pins, files (bytes in a temp dir), an update queue honouring `offset` (incl. negative), `limit`, `timeout` (test
cap). Real shapes: `{"ok":true,"result":…}` / `{"ok":false,"error_code":N,"description":"…","parameters":{"retry_after":S}}`;
User, Message (`message_id`, `chat`, `date`, `document{file_name,mime_type,file_id,file_unique_id,file_size}`), File
(`file_path: 'documents/file_<n>'`), ChatFullInfo with `pinned_message`, WebhookInfo. Real limits: document > 50 MB → 413;
`getFile` of > 20 MB → 400 «Bad Request: file is too big». Scenes: 401 «Unauthorized»; 403 «Forbidden: bot was blocked by
the user»; 403 «Forbidden: bot was kicked from the group chat»; 400 «Bad Request: chat not found»; 413; 429 with
`retry_after`; 500/502 (HTML body); never answers (timeout); slow body; malformed JSON (`{"ok":tr`); too deep
(`[[[[…]]]]`); 409 «Conflict»; webhook set; `cambiar_bytes` (download flips one byte); `file_path` expired (404 once);
`sin_ruta` (no `file_path`); `sin_tamano` (Document/File without `file_size`); `ruta_rara` (`file_path` with `..`);
`ids_al_azar` (the next `update_id` jumps DOWN to a random value, as after a week idle); `desfijar` (someone unpins);
`otro_fijado` (pin succeeds but `getChat` shows another message); a stranger's private chat writing at the same time.
It records every request and never prints tokens.

### 13.2 Step 1 — core (`copias.test.js`, `copias-restaurar.test.js`, `telegram.test.js`)
1.1 Migration 6: fingerprint, version map, idempotent, rules regex, 0 CHECK, 0 UNIQUE, no ADD COLUMN.
1.2 Recovery key: 1 000 keys round-trip; every single-symbol typo caught except ≤ 1/1024; O/I/L/spaces/dashes
    normalised; pad bits; `derivar` deterministic; huella stable; **`public/clave-recuperacion.js` (imported in Node)
    gives the same normalisation, control errors and verificador as `src/copias/clave.js` for the same 1 000 keys and
    the frozen vector**; `confirmarClave` refuses `PUBLICAS_DE_PRUEBA`.
1.3 X25519 + HKDF + GCM: the exact calls of §5.2 match a fixed vector; all-zero shared secret refused.
1.4 Flujo: truncation at every record boundary → `copia_cortada`; a record after the last, a cleared «último» bit,
    swapped records, a changed header byte, a flipped ciphertext byte → refused; formato 2 → `formato_nuevo`; L > 4096.
    Stream seal: missing, wrong, or not the last line → `copia_no_autentica`; a valid stream built by a test «attacker»
    who has only the public key (fresh ephemeral, any volcado) → `copia_no_autentica`, with or without índice.
1.5 Partes: sizes, contiguous `desde`, header fields; part from another copy refused; missing part named; identical
    duplicate tolerated.
1.6 Volcado fidelity (UNIQUE columns present: their `sqlite_autoindex_*`/NULL-sql rows are skipped and rebuilt) on a
    base with every type: INTEGER near ±2^63, REAL (0.1, 1.0, −0.0, 1e308, ±Inf), TEXT with
    accents/emoji/newlines/quotes, BLOB incl. empty, NULL, composite-PK table (rowid kept), schema text with newlines →
    identical rows (`setReadBigInts` comparison), identical `sqlite_schema`, `application_id`.
1.7 Consistency: rows written by another connection during the dump are absent from the copy, present in the live base.
1.8 WITHOUT ROWID / generated column / virtual table → `volcado_no_soportado` (synthetic base); a row whose line
    exceeds `LINEA_MAX` (test passes a small limit) → `fila_muy_grande:<tabla>`; restorer: a too-long line and more
    decompressed bytes than `resumen.volcado.bytes` → `volcado_danado`.
1.9 UTF-8 split across gunzip chunks (forced tiny chunks): no corruption.
1.10 Índice: HMAC verified; one byte changed → `indice_no_autentico`; other key → `clave_no_es_de_esta_copia`.
1.11 Sellado opens with the key only; counts match.
1.12 Frozen vector `test/copia-v1.json` restores with the fixed TEST key.
1.13 Adapter vs fake: every scene → the right `motivo`/`esperarMs`; never throws; 3xx not followed; the token never
     appears in any returned value, thrown error or captured console output (scan everything for it).
1.14 `llamar.js`: `cuerpoCrudo` multipart parsed by the fake with exact Content-Length; `alTrozo` streams and cuts at
     `topeBytes`; real mode refuses any host but the `permitido` one; test mode only 127.0.0.1.
1.15 **Full round trip** (the scope's test): v6 base with rows in every table (incl. a `secretos` row and BLOBs) →
     dump → encrypt → parts of 64 KiB → fake-Telegram upload → `getFile` + download → verify hashes → índice uploaded,
     verified, pinned → `restaurarCopia` (telegram source, pinned índice, `ajustar: false`) → decrypt → open → EVERY table equal
     (`SELECT * ORDER BY rowid`), schema text, `application_id`, `integrity_check` ok.
1.16 Same from files only, parts shuffled and renamed; without the índice (`autentica: 'flujo'`); `--comprobar`; two
     copies in the folder with a part of the newest missing → `falta_parte {copia}`, with `aceptarAnterior` → the older
     one AND `hayMasNueva` set; `alElegir` receives the age and returning false → `cancelada_por_dueno`, nothing written;
     a token of another bot → `otro_bot`.
1.16b `ajustarTrasRestaurar`: a snapshot taken during `generar` restores with its own copy row `interrumpida`
     (no aviso), its task `cancelada`, a new `servidor.id`, the old one in `servidor.origenes`; `vigilarCopias` on it
     opens nothing.
1.17 Never overwrites: existing destino → `destino_existe`, untouched; abort in the middle → a file WITHOUT the OPRT
     marker that `abrirBase` refuses.
1.18 Master key never copied: a base with secrets and `oportia-llave-secretos` (+ `.nueva-…`) beside it → no part,
     índice or volcado line contains the key file's bytes or name; the copias code never opens a path for which
     `esArchivoDeLlave` is true.
1.19 Memory, load-independent (runs in the production updater): a 4 MB incompressible base, 64 KiB parts → the
     partidor allocates its part buffer exactly once (injected allocator counts calls); after the copy no part buffer
     is reachable (`WeakRef` + `gc()` in a child with the worker flags); the child's peak RSS stays under the worker's
     own 120 MB self-exit (wide margin). The precise 200 MB measurement lives in `test/medir-copia.mjs` (§6.6).
1.20 `file_path` validation: `../x`, `/x`, 300 chars, `a b` → `respuesta_no_valida`, no request made.

### 13.3 Step 2 — integration (`copias.test.js`, `avisador.test.js`, `copias-api.test.js`, worker tests)
2.1 `copias.hacer` in the real executor, local + fuera: preparar → generar → subir → verificar → indice; rows/states;
    one live copy only (409).
2.2 Interrupted in `generar` (signal) → row `interrumpida`, retry makes a NEW uuid in the SAME task; interrupted in
    `subir` after part 2 → the next run uploads only 3..n; a crash between upload and DB write → one duplicate document,
    still verified. Caps: a fourth copy in one task, or a fourth uploaded copy in one RD day → task `fallida` +
    `copia_fallida`; `encolar` is never called from the handler (spy).
2.3 `cambiar_bytes` → re-upload from the local file, ok; fuera-only mismatch → copy `fallida` + restart 10 min later in
    the same task; mismatch every time → stops at the cap with `copia_fallida`; 429 → waits `retry_after`, no failure
    counted; 429 forever (local mode) → after 12 waits `telegram_limite_largo`; 429 with `retry_after` 120 in streaming
    mode → restart, and repeated → capped; the worker's 429 writes `canales.pausa_hasta` and the web sender waits too;
    5xx ×3 → `fallida` + grave aviso via `vigilar`; `sin_tamano` → still verified by hash.
2.4 Disk policy (injected `discoLibreMb`, base and WAL sizes): floor = `max(2048, 2×base+WAL+256)`; below it → no local
    files, off-site streamed, `copias_locales_pausadas` sent; back above → resolved; below 300 MB the `poco_disco`
    brake stops `copias.hacer` (and the memory brake too); runway < 30 days → `copias_disco_pronto`. Streaming with a
    writer connection active: the injected WAL growth passes 64 MB (or free disk drops under 500 MB) → snapshot closed
    within one part, row `interrumpida` (`foto_larga`), restart; the live base never sees SQLITE_FULL.
2.5 No key → `saltada` + `copias_sin_clave`; no Telegram → `solo_local` + `copias_sin_telegram`; neither → `sin_destino`;
    `bloqueado` during a copy → channel `bloqueado`, copy `solo_local`.
2.6 Real worker child (`test/ia-trabajador.js` style) copies a 4 MB base: heartbeats continue (no `colgado`), no
    memory self-exit, RSS reported (not asserted tightly); the worker flags include `--expose-gc`.
2.7 Nightly slot 4:40 RD (UTC−4) via `ranura`; a slot older than 20 h → `caducada`.
2.8 `copia_atrasada` from the WEB avisador: worker in safe mode for 31 h (fake clock) → the grave reaches the fake chat;
    fresh setup (key + link at 15:00) → nothing until 30 h after linking; resolved after a good copy. `vigilarCopias`:
    stuck rows → `interrumpida`/`fallida`; 90-day `copias_comprobar_clave`.
2.8b In-step check: an injected dumper that drops one row (or one table) → copy `fallida` `volcado_incompleto`, never
    `verificada`; a corrupted record fed to the checker → `fallida`.
2.9 `leerActualizaciones`: the 3 line shapes → avisos/resolution; first run silent; partial last line; rotated file;
    unreadable file → nothing; both files byte-identical and same mtime after.
2.10 Sender: routing table; dedup (same aviso twice → one message); escalation to grave → sent again; `reenviar`
     (ia_tope 50→80) → sent again ≥ 30 min later; flapping silenced; resolved before sending → not sent; > 48 h → not
     sent; 10/h and 30/day counted over alert classes only (50 `copia_parte` rows today → an aviso is still sent); ≥ 3
     due → one resumen; closing notice once for graves; grave → «Ya se arregló» → same grave again → sent, ringing,
     «Volvió a pasar»; 3 reopenings in 6 h → merged, ≤ 1 per 30 min; only grave rings; send-then-mark;
     429 → canal pause; 403 → `bloqueado` + `telegram_falla`; 401 → secret marked `clave_no_valida`; backoff.
2.11 The sender works with the worker in safe mode: the safe-mode aviso reaches the fake chat.
2.12 Linking: code; `/start CODE` from a private chat links; typed code with spaces; group chat, bot sender, stale
     message (before the code), wrong code ×5 → `vencido`, expired code; `offset=-1` sent then confirmed, first poll
     without offset; `ids_al_azar` (Junior's `/start` gets a LOWER id than the old one) → still links; webhook →
     `bot_ocupado`;
     a second link replaces the first (`desvinculado`); new bot id → `desvinculado`.
2.13 Routes: access (admin / soloDueno / Funnel → 403 / other login → 403), limiters; the key appears ONLY in
     `clave/nueva` (scan every other response and the audit table); `no-store`; confirm/check flows; `ahora` 409s.
2.14 Console `--copias=estado|ahora`, `--telegram=desvincular`; `oportia-restaurar.mjs` end to end against the fake
     server (one-time code; a stranger writing at the same time is ignored; chat name confirmation) and from files
     (stdin key; a key in argv refused; an old copy asks and «no» → exit 8; exit codes; refuses root).
2.15 Restored base on a "new server": secrets unreadable → Claves says «pégala otra vez»; `empezarLlaveNueva` allowed;
     after pasting a token of the same bot, the canal keeps working and the next copy goes to the same chat.
2.16 Token changed (another bot) between `subir` part 2 and 3 → row `interrumpida` `bot_cambiado`, the new copy uses
     only the new bot; every file_id of a verified copy downloads with ONE token.
2.17 Pin: `desfijar` between nights → next `preparar` opens `copia_sin_fijar`; `otro_fijado` → `fijada = 0` +
     `copia_sin_fijar`; a good pin resolves it.
2.18 A manual copy verified at 4:30 → the 4:40 nightly ends `saltada: 'reciente'` (one copy that night).
2.19 The page never sends the key: confirm/check bodies carry only `verificador`; a body with a `clave` field is refused
     (400) and never logged; the server log of the whole suite run never contains a test key text.

### 13.4 Step 3 — screens (`pantallas.test.js`, `archivos.test.js`, Playwright review)
3.1 Every new key in es.json AND en.json; a `telegram.aviso.<clave>` for each routed clave/prefix; a check that every
    `textoDeAviso`/`textoCopia` literal in `src/` exists.
3.2 No `innerHTML`; icons from `ICONOS_SERVICIOS`; `pedidosAlAbrir('copias', true)` = `['/api/admin/copias']`.
3.3 Buttons only when they can act (safe mode → reason; Funnel → «desde tu cuenta de Tailscale»).
3.4 Playwright (scratch, not in the suite): 390×844 and 1440×900, light/dark — `#copias` every state of §4.2, key
    creation + confirmation + group mismatch, print sheet, Claves Telegram group (no token / waiting / linked / broken),
    Resumen tile; nothing important below the first phone screen; no horizontal scroll.

### 13.5 Rules (`test/reglas.test.js`, updated)
- Migration 6 fingerprint + `6: '0.5.0'`; no CHECK, no UNIQUE, no ADD COLUMN.
- `fetch(` still only in `src/ia/llamar.js` (one call, `redirect: 'manual'`, no `.message`, no `console.`);
  `api.telegram.org` only in `src/canales/telegram.js`; `config.canalesBases = config.modoPrueba ? …` with the
  127.0.0.1 regex; `src/canales/` and `src/copias/` never import `node:http|https|net|tls`.
- `createCipheriv/createDecipheriv` only in `src/claves/cifrado.js` and `src/copias/cifrar.js`; `diffieHellman`,
  `generateKeyPairSync('x25519')`, `hkdfSync` only in `src/copias/{clave,cifrar}.js`; `oportia-llave-secretos` still named
  only in `cifrado.js`; `src/copias/` and `src/canales/` never import `rutaLlave`, `leerLlave`, `asegurarLlave`.
- `leerSecreto` only in the 1d three + `src/canales/credencial.js`.
- No `protect_content`, `deleteWebhook`, `deleteMessage`, `parse_mode` in `src/`; no `console.` in `src/canales`, `src/copias`.
- `src/copias/restaurar.js` imported by neither the web nor the worker graph; the web graph never loads
  `src/copias/hacer.js`; the worker graph still never loads `node:http`, `src/app.js`, `src/api/`.
- Every `openSync|createReadStream|readFileSync|openAsBlob` in `src/copias` passes the `esArchivoDeLlave` guard.
- `copias.hacer` has its handler and ignores no resource brake; `src/copias/hacer.js` never calls `encolar`.
- `efimera` appears in `src/` only inside `src/copias/cifrar.js` (no `src/` call passes it); `PUBLICAS_DE_PRUEBA` is
  checked by `confirmarClave`.
- No new `BEGIN`/`COMMIT` outside `db.js` (the restorer batches with `enTransaccion`); `abrirFotoDeLectura` is imported
  only by `src/copias/hacer.js`.
- The web graph never calls `readdirSync` on `cifradas/` (no `cifradas` string in `src/nucleo/salud.js`,
  `src/api/`, `src/canales/`).
- `public/clave-recuperacion.js` imports nothing and has no `fetch`; the `clave/confirmar|comprobar` handlers never read
  a `clave` field.
- `deploy/oportia-restaurar.mjs` never reads the key/token from `process.argv`/`process.env`.
- (unchanged and still true: no `rmSync/unlinkSync/limpiar` — 1e deletes nothing.)

### 13.6 Before every commit (updater-like run; < 60 s added by 1e: small bases ≤ 4 MB, 64 KiB parts, in-process fake server, no tight RSS bounds — the updater runs this suite on the live 512 MB server)
```
D=$(mktemp -d) && git -C /tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/wt-1e archive HEAD | tar -x -C "$D" && cd "$D" && env -i PATH=/usr/local/bin:/usr/bin:/bin:/opt/node22/bin timeout 900 node --no-warnings --test test/*.test.js
ps -eo pid,args | grep '[t]rabajador.js'     # must print nothing
```

---

## 14 Seguridad y privacidad
- What leaves the server: only encrypted parts and índices (to the owner's own private chat) and alert texts with
  numbers and keys. Never user data in clear, never a secret in clear, never the master key file.
- A leaked bot token lets someone download ENCRYPTED copies (useless without the recovery key) or spam the chat; a
  forged copy is refused (índice HMAC and the stream seal, with or without índice). They can also unpin newer índices
  (no rights needed in private chats): the next copy notices (`copia_sin_fijar`) and every restore shows the copy's age
  and asks before opening an old one. Fix: @BotFather → revoke → paste the new token (same bot → same file_ids).
- A leaked recovery key + access to the chat = the base can be read. Fix: «Cambiar mi clave» (new copies safe); old
  copies stay readable to whoever has both — the owner may delete those Telegram messages himself (OPORTIA never deletes).
  Said plainly on the screen.
- Whoever steals the server has the live base anyway; the sello there could forge copies only for that server.
- The recovery key reaches the server exactly once (in memory, while «Crear» answers); confirming and checking send
  only the verificador (a one-way derivation that opens nothing). Its routes never log bodies or error objects.
- `efimera` (fixed ephemeral key) exists only for the frozen vector; a rules test keeps it out of `src/` calls, and the
  TEST key published in `test/` can never become an active key (`PUBLICAS_DE_PRUEBA`).
- The restored base keeps sessions; users stay logged in only if the cookie domain is the same (1f note).
- Restore never overwrites, never runs inside the service, never touches a key file.

## 15 Riesgos
| Risk | Mitigation |
|---|---|
| Owner loses the recovery key | re-typing confirmation, printable sheet, 90-day check reminder, old keys listed; the local base on the server still exists |
| Telegram changes the 20/50 MB limits or deletes files | 4 MiB parts (5× margin, constant); local encrypted copies; `copia_atrasada` within 30 h; restore from saved files |
| Owner pins something else / deletes the pin | paths B′ (forward the índice) and B″ (files) |
| Worker RSS near the 120 MB cap | gc after each part (measured); `test/medir-copia.mjs` before publishing; fallback 2 MiB parts; a memory exit costs one attempt (resumes at the same part in local mode, a capped restart in streaming mode) |
| A flaky test blocks a good version forever (`version.bad` is never retried) | the suite has no load-dependent bounds: small bases, buffer-reuse checks, wide ceilings; precise measurements outside the suite |
| Endless re-uploads (429 storms, timeouts, mismatches) | ≤ 3 copies per task, ≤ 3 uploaded copies per RD day, ≤ 12 waits / 6 h per copy, all derived from rows; restarts inside the same task, never `encolar` |
| A dump bug produces an incomplete copy that still «verifies» | independent `COUNT(*)` in the same snapshot + in-step decrypt/gunzip/parse check; test with a row-dropping dumper |
| Dump fidelity | typed JSON + bound parameters; tests 1.6–1.9; runtime refusal of unsupported table kinds; frozen vector |
| Long read transaction holds checkpoints | short in the normal case (no network inside it); streaming only above the 300 MB brake and under the snapshot budget (WAL +64 MB, free ≥ 500 MB, 25 min); `vigilar` checkpoints later |
| Duplicate uploads after interruptions | harmless, silent, own chat; the índice points only to verified parts |
| Alert flood | dedup per news, 48 h freshness, flapping silence (non-grave), 10/h, 30/day over alert classes, resumen, merged «Volvió a pasar» |
| A grave hidden after «Ya se arregló» | graves are never silenced; a reopening is sent as «Volvió a pasar» and rings |
| Backups stop silently while the worker is down | `copia_atrasada` is evaluated by the web sender |
| Token changed during a copy | copy bound to `secreto_id` + bot id; mismatch → restart |
| Restored base raises false alarms / shares the old server id | `ajustarTrasRestaurar` |
| Disk fills with never-deleted local copies | local paused below `max(2 GB, 2×base+WAL+256 MB)` (room for a migration's pre-copy), runway alert 30 days ahead, alert, off-site continues; below 300 MB no copies (owner decision 3) |
| Token leak through errors/logs | `llamar.js` keeps only error name/code; no `console.` in canales/copias; tests scan every result for the token |
| Another program uses the bot (webhook) | `bot_ocupado`, nothing changed automatically |
| The very first 0.5.0 install fails and rolls back | cannot be reported (0.4.1 has no sender); later failures are read by the stable older code. README gap |
| Whole server down → no alert | out of scope (needs something outside the server); noted for 1f/7 |

## 16 Seguridad al volver a 0.4.1 (the updater rolls back CODE only)
- Migration 6 is additive; 0.4.1's `abrirBase` knows 1–5 and applies nothing (verified by the judge); its worker needs
  ≥ 5 → connects.
- Tasks: 0.4.1 does not know `copias.hacer` → never claims it; one left `en_curso` by a dead 0.5.0 worker goes back to
  `lista` via 0.4.1's recovery (`repetible` stored on the row). Back on 0.5.0 it resumes from `punto`, or ends
  `caducada` if > 20 h old.
- Avisos with new keys render through 1c's raw-key fallback; their `enviado_en` stays NULL; back on 0.5.0 only fresh
  (≤ 48 h) unresolved ones are sent.
- `telegram_bot` secret: 0.4.1's `listarSecretos` iterates its own `USOS` → ignored; `estadoAlmacen` still counts it as a
  saved key (correct: the master key must not be recreated).
- New tables, `ajustes` keys and `cifradas/` files are ignored (0.4.1's `copias()` counts top-level files only).
- Expected and harmless on 0.4.1 (written into the rehearsal as expectations, not failures): a `lista` `copias.hacer`
  is never claimed, so 0.4.1's `vigilar` may open `fila_atrasada` (atención, screen only); a `telegram_bot` secret whose
  last test is `bot_ocupado`/`bloqueado`/`chat_no_existe` (new MOTIVOS) is shown with 0.4.1's raw fallback text.
- No alerts and no copies while on 0.4.1 (accepted; 0.5.0 shows the gap as `copia_atrasada` when it returns).
- 1e adds nothing at web start that can fail `/api/setup`: the avisador starts after `listen`, lazily, swallowing
  errors; a failed migration 6 rolls back inside its transaction (pre-migration copy kept).
- **Rehearsal `test/ensayo-0.4.1.mjs`** (manual, needs git history; run before the step-2 and step-3 commits): with the
  current code build a v6 base with 1e data (an active key, a verified copy, a copy `haciendo` with a `copias.hacer`
  `en_curso` of a dead run and one `lista`, a `telegram_bot` secret, an active canal, envios, avisos `copia_atrasada`,
  `actualizacion_revertida:abc1234`, `ia_tope:…` unsent); run 0.4.1's real code (`git archive c6b0626`): `abrirBase`,
  worker recovery, `elegir` per cupo, `listarSecretos`, `estadoAlmacen`, `estadoDelSistema`, `GET /api/admin/claves`,
  avisos listing → nothing throws, the copy task is never offered, `fila_atrasada` may open and the new motivos render
  raw (both expected); back on 0.5.0 the copy finishes `verificada` against the fake Telegram (as a restart in the same
  task when its row had parts), and only fresh avisos are sent.

---

## 17 Textos (every key in BOTH `es.json` and `en.json`; full list built in step 3)
Groups: `admin.pestana.copias`, `servicios.copias`, `servicios.telegram`, `copias.tono.{bien,atencion,mal}`;
`copias.{titulo,fuera.titulo,comprobada,ultima,proxima,partes,ahora,haciendo,haciendo_sin_total,sin_clave,solo_locales,
pausa_modo_seguro,disco_lleno,freno_disco,sin_fijar,fallo}`, `copias.no_ahora.{en_marcha,modo_seguro,sin_clave,
sin_trabajador,disco_lleno}`, `copias.aqui.dias`, `copias.estado.<each state>`,
`copias.motivo.<each motivo>`, `copias.aqui.{titulo,resumen,pausadas}`, `copias.restaurar.{titulo,paso1..paso5}`;
`copias.clave.{crear,guardala,unica,no_compartir,copiar,imprimir,ya_guarde,repite,comprobar,grupo_mal,no_valida,lista,
cambiar,cambiar_aviso,actual,anterior,no_es,hoja.titulo}`; `telegram.{grupo,crear_bot,como1..como4,pega,guardar_probar,
bot,unir,codigo,vence,abrir_bot,toca_iniciar,o_escribe,esperando,unido,prueba,prueba_ok,dejar,ultimo_aviso,
problema.{bloqueado,perdido,clave,sin_red,bot_ocupado}}`; Telegram messages `telegram.titulo.{grave,atencion,cierre,volvio}`,
`telegram.aviso.<every routed clave and prefix>.{titulo,texto}`, `telegram.aviso.otro`, `telegram.resumen`,
`telegram.bienvenida`, `telegram.prueba_mensaje`, `telegram.copia.{parte,parte_sin_total,leyenda}`, `telegram.recordar_clave`;
`avisos.clave.<each new clave>`; `error.{copia_en_marcha,falta_clave,sin_destino,trabajo_en_pausa,disco_lleno,
clave_formato,clave_control,clave_no_coincide,verificador_formato,sin_pendiente,sin_token,bot_ocupado}` (the CLI's
Spanish lines live in the CLI, like `oportia-admin.mjs`).

| Key | es | en |
|---|---|---|
| `admin.pestana.copias` | Copias | Backups |
| `copias.fuera.titulo` | Copia fuera del servidor | Off-server backup |
| `copias.ahora` | Hacer una copia ahora | Back up now |
| `copias.haciendo` | Haciendo la copia… parte {n} de {de} | Backing up… part {n} of {de} |
| `copias.haciendo_sin_total` | Haciendo la copia… parte {n} | Backing up… part {n} |
| `copias.freno_disco` | Disco lleno: las copias están en pausa hasta que haya espacio. Nada se borró. | Disk full: backups are paused until there is space. Nothing was deleted. |
| `copias.sin_fijar` | El mensaje fijado en tu chat no es la última copia. | The pinned message in your chat is not the latest backup. |
| `copias.aqui.dias` | Alcanza para unos {n} días | Enough for about {n} days |
| `telegram.titulo.volvio` | 🔴 OPORTIA · Volvió a pasar | 🔴 OPORTIA · It happened again |
| `copias.sin_clave` | Tus copias necesitan tu clave de recuperación | Your backups need your recovery key |
| `copias.solo_locales` | Solo hay copias en este servidor. Si el servidor se pierde, se pierden. | Backups are only on this server. If the server is lost, they are lost. |
| `copias.disco_lleno` | Disco casi lleno: dejé de guardar copias aquí. Las de Telegram siguen. Nada se borró. | Disk almost full: I stopped keeping backups here. Telegram backups continue. Nothing was deleted. |
| `copias.clave.unica` | Es la única forma de abrir tus copias. OPORTIA no la guarda. | It is the only way to open your backups. OPORTIA does not keep it. |
| `copias.clave.lista` | Coincide. Tus copias quedan protegidas con la clave {huella}. | It matches. Your backups are protected with key {huella}. |
| `telegram.grupo` | Avisos y copias por Telegram | Alerts and backups on Telegram |
| `telegram.esperando` | Esperando tu mensaje… | Waiting for your message… |
| `telegram.copia.leyenda` | Copia de OPORTIA del {fecha} — {mb}, {n} partes. No borres estos mensajes: con tu clave de recuperación se recupera todo. | OPORTIA backup of {fecha} — {mb}, {n} parts. Do not delete these messages: with your recovery key everything can be recovered. |
| `telegram.aviso.otro.titulo` | OPORTIA tiene un aviso: abre Administrador | OPORTIA has an alert: open Administrator |

---

## 18 Plan de construcción (3 steps; branch `fase-1e`, worktree `wt-1e`; each step green under §13.6 with no worker left)
Commit messages in Spanish, ending EXACTLY with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RVTxHvB4G1P1e1VpxsmTfM
```
Never push; never touch other branches or worktrees; stop every server you start.

**Step 1 — core (no worker task, no UI):** migration 6 + fingerprint + `VERSION_DE_CADA_MIGRACION[6]` + `package.json`
0.5.0 (fingerprint `5443d09f…bdb2`, §10); `db.js` (`abrirFotoDeLectura`); `config.js` (`canalesBases`); `llamar.js`
(`cuerpoCrudo`, `alTrozo`); `src/copias/{formato,clave,cifrar,volcado,restaurar}.js` + the partidor; `src/canales/{canal,
telegram,credencial,vinculo}.js`; `public/clave-recuperacion.js` (+ its line in `test/archivos.test.js`);
`test/telegram-falso.js`, `test/copias-base.js`, `test/copia-v1.json` (generated once by a scratch script, with the
stream seal, then frozen); tests 1.1–1.20 (+1.16b); the §13.5 rules that apply to these files.
Commit «Fase 1e (paso 1 de 3): migración 6, formato de copia cifrada, clave de recuperación, restaurar, adaptador de
Telegram y servidor falso».

**Step 2 — integration:** `src/copias/{estado,hacer,vigilar}.js`; `src/canales/{canales,avisador,textos}.js` (with the
`telegram.*` keys added to both i18n files); `tipos.js`/`manejadores.js`/`trabajador.js`/`supervisor.js` (`cola.js`
unchanged);
`avisos.js`; `usos.js`/`probar.js`/`propositos.js`; `src/api/{copias,canales}.js`, `api/claves.js`, `api/tareas.js`,
`app.js`, `server.js`; `salud.js`; `deploy/oportia-admin.mjs`, `deploy/oportia-restaurar.mjs`; tests 2.1–2.19 (+2.8b)
and the remaining rules; `test/medir-copia.mjs` run on a 200 MB base in local and streaming mode (numbers into the
commit message and the README draft; the 4 vs 2 MiB decision of §6.6 is made HERE, before anything is published);
`test/ensayo-0.4.1.mjs` run.
Commit «Fase 1e (paso 2 de 3): copias de cada noche en el trabajador, avisos al Telegram, unir el chat, rutas y consola».

**Step 3 — screens, texts, README:** `public/app.js` (`#copias`, key create/confirm/check/print, Claves Telegram group,
Resumen and Servicios tiles, `textoAviso` for new keys, tabs, `pedidosAlAbrir`), `public/dibujos.js` (icons),
`public/estilos.css` (3-column PC grid, phone first screen, print sheet, monospace key), `public/i18n/{es,en}.json`;
README «Copias y avisos por Telegram» (what is copied and what never is, the recovery key, how to create the bot, how
to restore in 5 steps, disk policy, the console and CLI commands, Telegram limits, what to do if the token or the key
leaks, known gaps, the update.log line); tests 3.1–3.3; Playwright review 3.4; `ensayo-0.4.1.mjs` again.
Commit «Fase 1e (paso 3 de 3): pantalla de Copias, clave de recuperación, Telegram en Claves, textos y README».

---

## 19 Decisiones para Junior (cada una tiene una opción segura si no contestas)
1. **Tu clave de recuperación.** Es lo único que abre tus copias. *Por defecto:* OPORTIA te la muestra una vez, te pide
   escribirla otra vez para comprobar, y te ofrece imprimir una hoja. Recomendado: en Contraseñas del iPhone y además en
   un papel en un lugar seguro. Si la pierdes, las copias no se pueden abrir (por eso son seguras).
2. **Dónde llegan avisos y copias.** *Por defecto: tu chat privado con tu bot* (las copias en silencio, el «índice» de
   la última fijado arriba; solo lo urgente suena). Otra opción para más adelante: un canal privado aparte para copias.
3. **⚠ Disco casi lleno (decisión importante).** *Por defecto: nunca se borra nada.* Cuando quedarían menos de 2 GB
   libres (o más, si la base crece: siempre dejo espacio para dos veces la base, que hace falta para mejorar OPORTIA
   sin riesgo), dejo de guardar copias nuevas en el servidor, sigo con las de Telegram cada noche y te aviso. Un mes
   antes te aviso «al ritmo de hoy, en unos 30 días…». Si el disco llega a casi nada (menos de 300 MB), también paro
   las de Telegram hasta que haya espacio, porque hacerlas en ese momento podría llenar el disco del todo; eso suena
   como urgente. Lo que cuesta no borrar: con el tiempo el disco del servidor se llena de copias viejas y alguien
   (tú, con ayuda de Claude) tendrá que decidir qué hacer. Otra opción (solo si tú la pides): guardar en el servidor
   solo las copias de los últimos N días.
4. **Sin clave de recuperación no hay copias nocturnas.** *Por defecto: ninguna copia hasta que crees tu clave* (una
   copia sin candado sería un archivo que nunca se puede borrar). Mientras falte, Administrador y Telegram te lo
   recuerdan. Siguen existiendo las copias automáticas de antes de cada cambio de base.
5. **Las copias del servidor también con candado.** *Por defecto: sí* (son iguales a las de Telegram). Copias del
   servidor sin candado serían más cómodas pero menos seguras: solo si tú lo pides.
6. **Hora de la copia.** *Por defecto: 4:40 a. m. (hora de RD), todas las noches*, después de la revisión de la base de
   las 4:10.
7. **Qué avisos te llegan al Telegram.** *Por defecto: la tabla del §7.2* — lo urgente con sonido; caídas del
   trabajador, disco, memoria, copias, actualizaciones y topes/proveedor de la IA en silencio; «Ya se arregló» cuando un
   urgente se resuelve, y «Volvió a pasar» (con sonido) si vuelve después; como mucho 10 avisos por hora y 30 por día
   (las copias no cuentan); lo urgente nunca se calla. Recordatorio diario de lo urgente que sigue abierto: *no*.
8. **Recordatorio para comprobar tu clave.** *Por defecto: cada 90 días, un mensaje en silencio.*
9. **Leer `update.log` y `version.bad` (solo leer, nunca cambiarlos)** para avisarte de una actualización que falló o se
   devolvió. *Por defecto: sí.*
10. **Copias en modo seguro.** *Por defecto: en pausa* (el modo seguro apaga el trabajo automático; el aviso urgente te
    llega igual porque lo manda la parte web).
11. **Cambiar la clave de recuperación.** *Por defecto: solo si tú lo pides* (por ejemplo, si crees que alguien la
    vio); las copias viejas siguen necesitando la clave vieja.

---

## 20 Changelog — revision 2 (review round on the judge's merge)
Each criticism was checked against `wt-1e` (`c6b0626`), the saved spec and a temp-folder experiment (migration 6 applied
through the real `abrirBase`). Accepted unless marked otherwise.

| # | Criticism | Verdict | What changed |
|---|---|---|---|
| 1 | Low disk: copy ignores the 300 MB brake and keeps the snapshot open during uploads → -wal grows on a full disk | **real** (`frenosQueIgnora`, §6.3 step 2) | `frenosQueIgnora` dropped (no generic field, `cola.js` unchanged): below 300 MB no copy. Streaming only between the brake and the floor, under a snapshot budget measured each part (WAL +64 MB, free ≥ 500 MB, 25 min; 429 waited inside only ≤ 10 s); a breach closes the snapshot and restarts. §6.1, §6.3, test 2.4 |
| 2 | Flapping silence hides a grave that comes back after «Ya se arregló» | **real** | flapping silence only for non-graves; graves send «Volvió a pasar» and ring; repeats merged ≤ 1/30 min. §7.3, test 2.10 |
| 3 | Retries loop forever; «fresh copy 10 min later» is a silent no-op | **real** (`seguir` resets `fallos_seguidos`; `noEsFallo` never counts; partial unique index + `ON CONFLICT DO NOTHING`) | restarts inside the same task (`{punto:{paso:'preparar'}, esperarMs}`), never `encolar`; caps derived from rows (≤ 3 copies/task, ≤ 3 uploaded copies/RD day) and waits counted in the punto (≤ 12 / 6 h) → non-retryable failure. §6.1, §6.3, tests 2.2, 2.3, rule |
| 4 | Tight RSS tests run in the production updater; one flake → `version.bad` forever | **real** (cloud-init skips a bad SHA) | 1.19 and 2.6 reduced to 4 MB bases, buffer-reuse/no-retention checks and a wide ceiling; the 200 MB measurement and the 4 vs 2 MiB decision moved to `test/medir-copia.mjs`, run before the step-2 commit. §6.6, §13, §18 |
| 5 | `copia_atrasada` only in the worker: silent when it is down; false grave right after setup | **real** | evaluated by the web avisador every 5 min with base = max(key confirmada_en, canal vinculado_en, last verificada_en) + 30 h. §6.5, §7.3 step 0, test 2.8 |
| 6 | Rate limits would count nightly part uploads | **real** (`CLASES_ENVIO` includes `copia_parte`) | limits count only `aviso`, `cierre`, `resumen`, `bienvenida`, `prueba` rows with `resultado 'enviado'`. §7.3, test 2.10 |
| 7 | «Comprobada» does not prove completeness or decryptability | **real** | independent `COUNT(*)` per table in the same snapshot + in-step decrypt/gunzip/parse with the copy's own key (tee); mismatch → `fallida volcado_incompleto`; «comprobada» redefined. §5.2, §5.3, §5.6, §6.3, test 2.8b |
| 8 | getUpdates ids restart at random after a week idle; stored offset can hide the linking message | **real** (spec Update.update_id) | after `offset=-1`, confirm it, poll WITHOUT offset, then offset only from ids seen in this window; stale (> 6 days) offsets ignored; fake scene `ids_al_azar`. §2.1, §8.4, test 2.12 |
| 9 | Token change mid-copy mixes file_ids of two bots | **real** | `copias.secreto_id` + `cuenta_id` (migration 6); `conCredencial({ secretoId })`; getMe per step; change → restart; `bot` in the índice, restore refuses another bot (`otro_bot`). §6.3, §8.1, §9, test 2.16 |
| 10 | Restore: chat from any sender, older copy opened silently, pin failures unnoticed, archivos fallback silent | **real**, (b) **partly** | one-time code for the CLI/1f (`empezarBusquedaDeChat`), chat name confirmed; `alElegir` with date/age, confirmation > 30 h; `anterior` in the índice; pin verified each night via `getChat` and before each copy → `copia_sin_fijar`; archivos mode fails `falta_parte` unless `aceptarAnterior`, then reports `hayMasNueva`. *Not adopted:* «confirm when a newer copy id is referenced» from an old índice — a bot cannot list chat history and an older índice cannot reference newer ones; the nightly pin check + age confirmation cover it. §3, §5.5, §6.3, §9, tests 1.16, 2.14, 2.17 |
| 11 | No-índice path accepts a forged copy encrypted to the public key | **real** (X25519 with an ephemeral key is not sender authentication) | stream seal line HMAC(sello, …, hashCabecera, sha256(B)) as the last plaintext line; no unauthenticated restore path (`autentica: 'indice+flujo' \| 'flujo'`, else `copia_no_autentica`); frozen vector includes it. §5.3, §9, test 1.4 |
| 12 | Recovery key repeatedly POSTed to the live server | **real** (`app.js` logs full error objects) | page-side verificador (`public/clave-recuperacion.js`, pure JS — not WebCrypto, because a plain-`http` tailnet address is not a secure context); `copias_llaves.verificador` in migration 6; routes take only `verificador`, catch-and-log-code. The server still sees the key once at creation (generation stays server-side: X25519 in the page would be a second implementation of the part that must never be wrong). §4.3, §5.1, §12, tests 1.2, 2.19 |
| 13 | Web process would scan an ever-growing `cifradas/` | **real** (`medirSalud` runs in the supervisor = web process) | numbers from `copia_partes` rows (one `SUM`); `salud.js` `copias()` unchanged; monthly subfolders. §6.2, §11.2, rule |
| 14 | Async restore transaction contradicts `enTransaccion` | **real** | `aplicarEnTransaccion` removed; the restorer batches ≤ 5 000 lines / 8 MiB per synchronous `enTransaccion` (safe: marker last). §5.3, §9 step 7 |
| 15 | Fixed 2 GB floor ignores base size | **real** (pre-migration `VACUUM INTO` needs ≈ base size) | floor = max(2048, 2×base+WAL+256) MB; runway aviso `copias_disco_pronto` < 30 days; decision 3 states the trade-off. §6.2, §19 |
| 16 | Restored base carries the in-flight copy row/task and the old `servidor.id` | **real** | `ajustarTrasRestaurar` (1e, called by the CLI and 1f): in-flight rows `interrumpida` without aviso, task `cancelada`, new `servidor.id` with `servidor.origenes`; `copias.servidor` column; result exposes `servidor`, `copiaEnCurso`. §3, §9, test 1.16b |
| 17 | Optional `file_size` treated as mandatory | **real** (spec: Optional) | compared only when present; fake scene `sin_tamano`. §2.1, §6.3, §6.4, test 2.3 |
| 18 | Format/UX inconsistencies | **real** (all six) | (a) captions/progress without a total in streaming; (b) índice caption without «comprobada»/✔; (c) `sqlite_`-named and NULL-sql schema rows skipped; (d) `LINEA_MAX` 8 MiB both sides + decompressed cap; (e) `file_path` pattern; (f) timing text fixed (latido 15 s, vigía 90 s). §1, §4.5, §5.3, §6.4, §9 |
| 19 | Test-only crypto parameters; rehearsal gaps; date parsing; shared flood pause | **real** | rules test for `efimera`, `PUBLICAS_DE_PRUEBA` refused; rehearsal expects `fila_atrasada` and raw new motivos on 0.4.1; `Date.parse` for update.log; the worker writes and honours `canales.pausa_hasta`. §5.1, §5.2, §6.3, §7.4, §13.5, §16 |
| 20 | Manual copy shortly before 4:40 → double copy | **real** (`programar` runs a skipped slot right after) | nightly `preparar` ends `saltada: 'reciente'` when a copy was verified < 6 h ago. §6.1, test 2.18 |

Migration 6 changed (`copias_llaves.verificador`, `copias.secreto_id`, `cuenta_id`, `servidor`): new fingerprint
`5443d09fac022e5aea609fec97efbad138e1657bb7e57358a97e82b9a1c7bdb2` (3709 bytes), re-checked: rules regex false, 0 CHECK,
0 UNIQUE, 0 ADD COLUMN, applies over 1–5 with the pre-migration copy, idempotent, 0.4.1's `abrirBase` opens it and
applies nothing, `foreign_key_check` empty. New avisos claves: `copias_disco_pronto`, `copia_sin_fijar`. New files:
`public/clave-recuperacion.js`, `src/canales/vinculo.js`. Removed from the plan: `POR_DEFECTO.frenosQueIgnora`,
`tiposPermitidos` change, `aplicarEnTransaccion`, `salud.js` scanning `cifradas/`, the RSS bounds inside the suite.
