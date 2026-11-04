export const meta = {
  name: 'oportia-fase1b-arreglos',
  description: 'Fix OPORTIA phase 1b after its review: rebuild the interpretation engine, red-team it until dry, apply backend/screen fixes and owner decisions, final adversarial review',
  phases: [
    { title: 'Motor', detail: 'rebuild the own interpretation engine' },
    { title: 'Ataque', detail: 'red-team rounds until no new wrong interpretations' },
    { title: 'Resto', detail: 'backend/data fixes and owner decisions, then screens' },
    { title: 'Revisión', detail: 'final review with 2-vote verification' },
    { title: 'Cierre', detail: 'fix confirmed findings, final test runs' },
  ],
}

const WT = '/tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/wt-1b'
const HALLAZGOS = '/tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/revision-1b.txt'
const SP = '/tmp/claude-0/-home-user/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad'
const REGLAS = `WORKSPACE RULES (strict):
- Write ONLY inside the git worktree ${WT} (branch fase-1b). Never cd into or modify /home/user/jarvis or ${SP}/wt-1c. Never push. Never touch branches main, desarrollo, fase-1c-intento1. Never run 'git worktree remove'.
- Commit in ${WT} with a Spanish message ending exactly with:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RVTxHvB4G1P1e1VpxsmTfM
- Repo style: Spanish identifiers/comments with plain explanations, ESM, zero npm dependencies (node: modules only), no rmSync/unlink or the word 'limpiar' as a whole word in src, nothing deletes data, UI text only via textContent and every key in BOTH public/i18n/es.json and en.json (same keys and same {variables}), no innerHTML. Migration 3 ('proyectos') is NOT published yet, so it may still be edited, but its sha256 in test/reglas.test.js MIGRACIONES_PUBLICADAS must be updated to match; migrations 1 and 2 are published and must never change.
- Before each commit run the suite like the server updater: D=$(mktemp -d) && git -C ${WT} archive HEAD | tar -x -C "$D" && cd "$D" && env -i PATH=/usr/local/bin:/usr/bin:/bin:/opt/node22/bin timeout 900 node --no-warnings --test test/*.test.js  (all must pass).
- Owner: Junior, non-technical, Dominican Republic, iPhone, Spanish. Binding rules: never delete or overwrite data; no incomplete features shown as working and no buttons that do nothing; never simplify his vision without asking; be honest that searching starts in phase 2 (customers) and phase 6 (jobs). Server: 512 MB RAM, 1 slow vCPU.
- The full review of phase 1b with reproduced cases is in ${HALLAZGOS}. Read the parts relevant to your task.`

const DECISIONES = `OWNER DECISIONS (already taken, implement them):
1) Autonomy level per project, added now, part of the approved configuration: 'aprobar_salidas' (DEFAULT, safest: everything that goes outside, like emails, proposals sent and contacts, waits for his approval), 'frecuencia_aprobada' (works alone at the approved frequency and notifies him), 'solo_cuando_pida' (only works when he asks; implies frecuencia 'manual'). Contacting anyone ALWAYS needs his yes at every level; the screens must say so.
2) AI per project stored in every version from now: ia { permitida: false, topeMensualUsd: 0 } and costoEstimadoUsd 0, shown from the version (not from a fixed text). AI arrives in part 1d; enabling it later must create a new version that needs approval. No AI control in the form now (it would do nothing): show a line 'IA: no permitida · llega en la parte 1d'.
3) Choosing sources and the analysis type (básico/avanzado/profundo): show 'Próximamente (fase 2)' lines in the summary and in the form, no controls.
4) New accounts (plan 'prueba') get 1 project; the admin keeps 20. Because Junior was told he can give an account more later, add to the Administrador screen a per-user control 'Proyectos permitidos' with plans prueba=1, pago=5, empresarial=20 (admin-only API, audited, never lowers below the projects the account already has active: answer a clear error instead).
DEFAULTS chosen for him (safe, reversible):
- When the admin resets a user's password, the user sees on next sign-in 'El administrador reinició tu contraseña el <fecha>' and Configuración shows the list of such resets for his account.
- Editor role: may create, change, approve/reject, pause/resume; only the dueño may send to the trash, restore or complete.
- Sending a running project to the trash pauses it (recorded in history); restoring brings it back paused so he chooses Reanudar.`

const INFORME = { type: 'object', properties: { commit: { type: 'string' }, hecho: { type: 'string' }, pruebas: { type: 'string' }, pendiente: { type: 'string' } }, required: ['commit', 'hecho', 'pruebas', 'pendiente'] }

phase('Motor')
const motor = await agent(`${REGLAS}\n\nTASK: rebuild the own interpretation engine (src/motor/diccionarios.js, texto.js, interpretar.js and test/motor.test.js; you may add src/motor/*.js files and a data helper test/motor-casos.js that is NOT a *.test.js file) so that the 'Lo que entendí' screen NEVER states something wrong: when unsure it must ask. Fix EVERY engine finding in ${HALLAZGOS} (sections 'motor', the engine items of 'privacidad', 'datos', 'pantallas' and 'vision'), including:
- clause and role aware parsing: what the user sells ('vendo/ofrezco/mi negocio de X' = product or own business, never a target), who the targets are ('a/para Y'), places, conditions; products found inside priority/exclusion/'sin' spans are not products;
- negation scopes: 'no', 'ni', 'pero no', 'que no sea(n)/son', 'no me interesa(n)', 'sin incluir/sin contar', 'excepto/salvo/menos' (with guards for 'al menos', 'por lo menos', 'a menos que', 'más o menos', 'menos de N'), English 'not', 'but not', "don't", 'except', 'without'; apply them to sectors, zones, sizes, capabilities; a category both included and excluded becomes a question; never exclude the general 'todas'; keep qualifiers ('del gobierno', 'todo incluido') as free exclusions;
- capabilities only from explicit requests about what the project should do, honoring negation and 'solo investigar'; 'contactar' NEVER switched on from free text (leave it off and add a supuesto);
- salary: ranges 'entre A y B', 'A a B', 'A-B', 'between/from A and/to B' with mil/k carried back, 'no menos de / no inferior a' = minimum, numbers only next to salary words or currency, reject phones, years, addresses; currency per amount; conflicting amounts become a question;
- frequency only from phrases about how often to review ('cada', 'todos los', 'una vez por', 'revisa/busca + adverb'), not from 'pago mensual', 'horas diarias', 'Diario Libre'; negation honored; several frequencies = question; keep the supuesto when defaulting;
- type (sales vs job) with strong signals first; ties or mixed signals add the 'tipo' supuesto/question; unsupported goals (competidores, proveedores, 'no sé qué vender', 'investiga esta empresa') become a clear question saying it arrives later, never forced;
- job titles and products: stop at commas/semicolons/colons (look them up in the original text), keep 'ingeniero en sistemas', 'licenciada en enfermería', 'técnico en refrigeración'; English 'a job as a driver' works; never accept filler-only titles; keep the user's own product wording and store dictionary keys separately;
- places: ALL 158 municipalities of the Dominican Republic mapped to their 32 provinces (verify the list against a public source if network access works, e.g. curl through the proxy to es.wikipedia.org 'Anexo:Municipios de la República Dominicana'; otherwise use your knowledge and mark any uncertain entries in your report), the main distritos municipales people use (Verón, Bávaro, etc.), regions (Gran Santo Domingo, Cibao, Norte, Sur, Este, Noroeste/Línea Noroeste), abbreviations (SD, SDE, SDN, SDO, Sto. Dgo., Stgo, RD), 'avenida/calle/av. Duarte' is not the province, bare 'capital' only as 'la capital'; 'Ciudad, RD' or 'República Dominicana' as an address suffix never switches on the whole country (only explicit 'todo el país', 'a nivel nacional', or the country alone with no other place); unknown place-like phrases and places outside the country become questions (zonasLibres plus a question), with close-match suggestions when easy;
- a new result field noEntendido: meaningful parts nothing consumed, shown as questions; approval stays blocked until each is answered by editing (design this cleanly in faltantes or a new function, and keep the API/screen contract working: the screen code is in public/app.js and must keep working; you may make the minimal screen changes needed to show the new questions);
- English multi-word plurals ('coffee shops', 'law firms', 'call centers', 'free zones'); 'empresas de <unknown>' stays as a free sector, not 'todas';
- edit form round-trip: interpreting then saving the hand-edit form unchanged must give the identical configuration (labels with commas or ' y ', priorities up to 160 characters, product keys);
- performance: any 4000-character input, including adversarial ones ('sin aa sin ab ...', 'without q0 ...', 'excepto x excepto y ...', many numbers), interpreted in under 150 ms on this machine (test it in test/motor.test.js with a generous bound like 1500 ms so it is stable on the slow server, and report the real time).
Turn EVERY sentence reported in ${HALLAZGOS} into a regression case with the expected result, plus at least 150 more varied realistic Dominican instructions (sales and jobs, slang, typos, ALL CAPS, emojis, English). Keep the existing exported API (interpretar, faltantes, limpiarConfiguracion, configuracionDesdeCampos, catalogo, nombreSugerido, objetivoSugerido, LIMITES, TIPOS, capacidadesDesdeLista) compatible or update its callers. Commit when done.`, { label: 'motor', phase: 'Motor', schema: INFORME })

phase('Ataque')
const HALLADO = { type: 'object', properties: { errores: { type: 'array', items: { type: 'object', properties: { frase: { type: 'string' }, salida: { type: 'string' }, esperado: { type: 'string' }, gravedad: { type: 'string', enum: ['dice_algo_falso', 'deberia_preguntar', 'lento_o_falla'] } }, required: ['frase', 'salida', 'esperado', 'gravedad'] } }, resumen: { type: 'string' } }, required: ['errores', 'resumen'] }
const TEMAS = [
  'sales projects from Dominican business owners: negations, exclusions, who sells vs who buys, own business mentions, several products, priorities',
  'job searches from Dominican workers: salaries in every format, job titles with commas and "en", experience, schedules, remote work, several zones',
  'places: municipalities, distritos municipales, neighborhoods of Santo Domingo and Santiago, avenues and streets with province names, abbreviations, regions, places abroad, typos in place names',
  'English and Spanglish instructions, plus mixed-language ones',
  'messy real-world writing: no accents, ALL CAPS, typos, WhatsApp style, emojis, very long run-on sentences, very short vague ones, and goals the platform does not support yet',
]
const vistos = new Set()
const todosErrores = []
let secos = 0
for (let ronda = 1; ronda <= 3 && secos < 1; ronda++) {
  const rondas = await parallel(TEMAS.map((tema, i) => () => agent(`${REGLAS}\n\nYou are a red-team tester (round ${ronda}). Do NOT edit or commit anything. Get the current engine with D=$(mktemp -d) && git -C ${WT} archive fase-1b | tar -x -C "$D" and call interpretar() and faltantes() (read src/motor/interpretar.js for the exact exports, including how unanswered questions block approval). Write at least 50 NEW realistic instructions on this theme: ${tema}. Avoid sentences already in test/motor.test.js or test/motor-casos.js. Judge each result like Junior would on the approval screen: report a case ONLY if the screen would state something false (dice_algo_falso), or silently drops/guesses something important instead of asking (deberia_preguntar), or the engine is slow (>150 ms) or throws (lento_o_falla). Incomplete results that are shown as questions are FINE. Give the exact sentence, the relevant output, and what correct behaviour is.`, { label: `ataque:r${ronda}:${i + 1}`, phase: 'Ataque', schema: HALLADO })))
  const nuevos = rondas.filter(Boolean).flatMap(r => r.errores).filter(e => { const k = e.frase.trim().toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true })
  log(`Ronda ${ronda}: ${nuevos.length} interpretaciones equivocadas nuevas`)
  if (nuevos.length < 3) { secos++; todosErrores.push(...nuevos); if (!nuevos.length) break }
  todosErrores.push(...nuevos)
  await agent(`${REGLAS}\n\nRed-team round ${ronda} found these wrong interpretations in the rebuilt engine. Fix the engine so each one behaves correctly WITHOUT breaking existing cases (fix the general cause, not just the sentence). Add every sentence as a regression case in test/motor-casos.js / test/motor.test.js. Keep the performance bound. Commit.\n\n${JSON.stringify(nuevos, null, 1)}`, { label: `ataque:arreglo:r${ronda}`, phase: 'Ataque', schema: INFORME })
}

phase('Resto')
const backend = await agent(`${REGLAS}\n\n${DECISIONES}\n\nTASK (backend and data; the engine was already rebuilt and committed, read git log first): implement the owner decisions on the server side and fix every NON-engine finding about the server in ${HALLAZGOS} (sections 'privacidad', 'datos', 'vision' and server parts of 'pantallas'):
- input type validation at the API boundary (non-string or object values give 400 datos_no_validos, never 500);
- check the plan limit and the trash BEFORE running the engine;
- project detail returns full content only for the active, pending and last 3 versions, metadata for the rest, plus GET /api/proyectos/:id/versiones/:numero; POST /versiones reads only the base version; a per-user GET limiter for project routes;
- storage limits without deleting anything: cap total stored projects per space (active + trash), lower MAXIMO_VERSIONES to a sensible number, cap bytes per version; clear errors in es/en;
- remove the CHECK lists from migration 3 (validate in code against exported lists, add a test that values in the DB are always valid) and update its fingerprint; keep migrations 1 and 2 untouched;
- configuration fields autonomia, ia, costoEstimadoUsd (decisions 1-2) in the engine's limpiarConfiguracion (keep it small and compatible), interpretation of 'solo cuando yo lo pida' -> autonomía solo_cuando_pida + frecuencia manual;
- plan 'prueba' = 1 project, admin 20, admin API to change an account's plan (decision 4), audited, never below the active count;
- admin password reset notice (stored so the user sees it once on next sign-in, and listed in Configuración via an API the user can call);
- editor vs dueño permissions; trash pauses and restore returns paused, recorded in history;
- names: suggested name includes the first sector or zone; recomputed when a new version is approved if the user never renamed the project;
- package.json version 0.2.0; README phase 1b status updated (one-account-never-sees-another remains);
- tests for all of the above in test/proyectos.test.js (and others as needed). Commit.`, { label: 'resto:servidor', phase: 'Resto', schema: INFORME })

const pantallas = await agent(`${REGLAS}\n\n${DECISIONES}\n\nTASK (screens; engine and backend already committed, read git log and the diff first): update public/app.js, public/estilos.css and both i18n files so the screens use everything new and fix every screen finding in ${HALLAZGOS} ('pantallas' section and screen items elsewhere): new questions from the engine (noEntendido and conflicts) shown clearly and blocking approval until answered; autonomy select in the form and in the summary (with the always-ask-before-contact sentence); IA line from the version; 'Próximamente (fase 2)' lines for sources and analysis type; phase honesty BEFORE approving (pending card and home page; home 'Próximamente' also lists job search phase 6); capacity phase texts update when the type changes; double tap cannot create two projects; priorities kept intact on save; currency select and min<=max salary check; 'correos' disabled with a note when 'contactar' is on; trash badge instead of state; session end keeps the place and unsent text; warning before 'Volver a entender' replaces hand edits and a way to reuse a discarded version; automatic reload with a friendly note on 409 version_no_pendiente/accion_no_permitida_ahora (no 'Recarga la página' texts); restore-at-limit message; example does not overwrite typed text without asking; lector wording; product label in the current language when it matches catalog keys; overflow-wrap for long words/links; focus moved to the message or h1 after redraws and aria-describedby on the disabled approve button; admin screen control 'Proyectos permitidos' per user; Configuración list of admin password resets and the one-time notice after sign-in. Then run the app locally (OPORTIA_DATOS=<tmp> PORT=<free> HOST=127.0.0.1 node --no-warnings src/server.js; first admin needs header Tailscale-User-Login) and walk all flows with Playwright (require('playwright'), devices['iPhone 13']) in Spanish and English, light and dark; save screenshots in ${SP}/capturas-1b-v2/ and list them. Commit.`, { label: 'resto:pantallas', phase: 'Resto', schema: INFORME })

phase('Revisión')
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] }, scenario: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'scenario', 'fix'] } }, summary: { type: 'string' } }, required: ['findings', 'summary'] }
const VERDICT = { type: 'object', properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } }, required: ['refuted', 'reason'] }
const CTX = `${REGLAS}\n\nPhase 1b was fixed on branch fase-1b in ${WT}. Review a fresh copy (D=$(mktemp -d) && git -C ${WT} archive fase-1b | tar -x -C "$D"); never edit the worktree. Diff since the first review: git -C ${WT} diff 77cdfde fase-1b. Reports so far: ${JSON.stringify({ motor, errores: todosErrores.length, backend, pantallas }).slice(0, 6000)}`
const LENTES = [
  'security, privacy (one account never sees another, admin included; new admin plan API; password-reset notice), input validation, resource limits on the 1-vCPU 512 MB server (CPU per request, response sizes, memory with slow readers), and data safety (simulate updating a real 0.1.0 database to this code and rolling back to 0.1.0, migration 3 copy, no deletions)',
  'the screens on iPhone 13 with Playwright in es/en light/dark: every new flow and every fix listed above, honesty about phases, no dead buttons, wording a non-technical owner understands',
  'the engine against the owner decisions and the vision docs (/tmp/claude-0/-home-user-junior-2026/3844f319-6552-52e5-ac47-cb93f37f0012/scratchpad/OPORTIA-vision.md sections 3, 4, 19): 40 fresh realistic instructions judged end to end through the API, and whether anything of his vision was dropped or simplified without asking',
]
const revisado = await pipeline(LENTES,
  (lente, _, i) => agent(`${CTX}\n\nLENS: ${lente}. Report only real problems with concrete reproduced scenarios.`, { label: `revision:${i + 1}`, phase: 'Revisión', schema: FINDINGS }),
  (r, lente, i) => r ? parallel(r.findings.filter(f => f.severity !== 'low').map(f => () => parallel([1, 2].map(n => () => agent(`${CTX}\n\nTry to REFUTE this finding (angle ${n === 1 ? 'reproduce it in a fresh copy' : 'read the code and docs; is it real and important?'}). Default to refuted=true if you cannot confirm.\n${JSON.stringify(f)}`, { label: `verificar:${i + 1}`, phase: 'Revisión', schema: VERDICT }))).then(v => ({ ...f, sobrevive: v.filter(Boolean).filter(x => !x.refuted).length >= 1 && v.filter(Boolean).filter(x => !x.refuted).length >= v.filter(Boolean).length / 2 })))).then(c => ({ resumen: r.summary, confirmados: c.filter(x => x.sobrevive), bajos: r.findings.filter(f => f.severity === 'low') })) : null)

phase('Cierre')
const confirmados = revisado.filter(Boolean).flatMap(r => r.confirmados)
const bajos = revisado.filter(Boolean).flatMap(r => r.bajos)
const cierre = await agent(`${REGLAS}\n\n${DECISIONES}\n\nFinal review of fase-1b found these. Fix every confirmed one and the cheap safe low ones, with tests. Then run the updater-like suite 3 times in a row (one of them with taskset -c 0), confirm all pass, and commit.\n\nCONFIRMED:\n${JSON.stringify(confirmados, null, 1)}\n\nLOW:\n${JSON.stringify(bajos, null, 1)}`, { label: 'cierre', phase: 'Cierre', schema: INFORME })

return { motor, erroresAtaque: todosErrores.length, backend, pantallas, revision: revisado.filter(Boolean).map(r => ({ resumen: r.resumen, confirmados: r.confirmados.map(c => c.title), bajos: r.bajos.map(b => b.title) })), cierre }
