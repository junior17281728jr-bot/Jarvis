// 0.14.53: el dictado EN EL EQUIPO del alumno (pedido del dueño: «el micrófono de la app tiene que escribir lo que
// digo»). Whisper (Transformers.js) corre en un trabajador de su navegador (public/voz-trabajador.js): graba, para, y el
// texto aparece en el cuadro. El audio nunca sale del equipo. La primera vez baja ~100 MB desde NUESTRO sitio (/voz/…,
// el servidor los tiene: src/academia/voz.js) y después quedan guardados en el navegador.
// El orden de los motores: (1) ChatGPT en el servidor, si el dueño lo tiene; (2) Whisper aquí; (3) el dictado del
// navegador, solo donde Whisper no puede; (4) si nada sirve, una línea corta para escribir.
// Todo lo que no es el trabajador se prueba sin navegador (test/voz-dictado.test.js).

// ¿El navegador puede con Whisper? Trabajadores con módulos, WebAssembly con SIMD (Safari 16.4+, Chrome 91+), audio y
// grabación. Un navegador viejo: false (y se usa el dictado del navegador o se escribe).
const SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
export function puedeWhisper(w = typeof window !== 'undefined' ? window : null) {
  try {
    if (!w || typeof w.Worker !== 'function' || typeof w.WebAssembly?.validate !== 'function') return false;
    if (!w.WebAssembly.validate(new Uint8Array(SIMD))) return false;
    if (typeof (w.AudioContext || w.webkitAudioContext) !== 'function') return false;
    return typeof w.MediaRecorder === 'function' && typeof w.navigator?.mediaDevices?.getUserMedia === 'function';
  } catch { return false; }
}

// Qué hace el micrófono: 'grabar' (ChatGPT en el servidor), 'whisper' (aquí), 'navegador' (Web Speech) o 'ninguno'.
export function elegirMotor({ servidor = false, whisper = false, navegador = false } = {}) {
  if (servidor) return 'grabar';
  if (whisper) return 'whisper';
  if (navegador) return 'navegador';
  return 'ninguno';
}

// ¿Se calienta el modelo (cargado en el trabajador) apenas entra el alumno, en cualquier pantalla? Solo en una computadora
// con memoria. En el teléfono los archivos se bajan igual al entrar (crearPrecarga), pero el modelo se carga al abrir el
// oral: así no ocupa ~200 MB de memoria mientras estudia otra cosa.
export function equipoCapaz(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false;
  const ua = String(nav.userAgent ?? '');
  if (/iPad|iPhone|iPod|Android|Mobi/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return false;
  return !(Number(nav.deviceMemory) > 0 && Number(nav.deviceMemory) < 4);
}

// Varios canales → uno (el promedio).
export function mezclarMono(canales) {
  const lista = (canales ?? []).filter(c => c?.length);
  if (!lista.length) return new Float32Array(0);
  if (lista.length === 1) return Float32Array.from(lista[0]);
  const n = Math.min(...lista.map(c => c.length));
  const sal = new Float32Array(n);
  for (const c of lista) for (let k = 0; k < n; k++) sal[k] += c[k] / lista.length;
  return sal;
}

// De deHz a aHz (16 000 para Whisper). Al bajar, cada muestra nueva es el promedio de las viejas que cubre (así no se
// cuelan agudos falsos); al subir, se interpola en línea recta.
export function remuestrear(datos, deHz, aHz = 16000) {
  const entrada = datos ?? new Float32Array(0);
  if (!entrada.length || !(deHz > 0) || !(aHz > 0)) return new Float32Array(0);
  if (deHz === aHz) return Float32Array.from(entrada);
  const razon = deHz / aHz;
  const n = Math.max(1, Math.floor(entrada.length / razon));
  const sal = new Float32Array(n);
  if (razon > 1) {
    for (let k = 0; k < n; k++) {
      const desde = Math.floor(k * razon);
      const hasta = Math.min(entrada.length, Math.max(desde + 1, Math.floor((k + 1) * razon)));
      let suma = 0;
      for (let j = desde; j < hasta; j++) suma += entrada[j];
      sal[k] = suma / (hasta - desde);
    }
  } else {
    for (let k = 0; k < n; k++) {
      const x = k * razon;
      const j = Math.floor(x);
      const f = x - j;
      const a = entrada[Math.min(j, entrada.length - 1)];
      const b = entrada[Math.min(j + 1, entrada.length - 1)];
      sal[k] = a + (b - a) * f;
    }
  }
  return sal;
}

// Lo que escribió Whisper, en limpio: sin espacios de más, sin las marcas que pone en el silencio («[Música]»,
// «(risas)»), sin un mismo pedazo repetido muchas veces seguidas (su «bucle»), y nada si solo dijo una de sus frases
// de relleno cuando no oye nada («Gracias por ver el video», «Subtítulos…»).
const RELLENO = [/^(?:¡?gracias(?: por (?:ver|su atención|escuchar)[^.!]*)?[.!]?)$/i, /^subt[ií]tulos? (?:realizados|por)\b.*$/i, /^thanks? (?:you )?for watching[.!]?$/i, /^you$/i, /^\.+$/];
export function limpiarTranscripcion(texto) {
  let t = String(texto ?? '').replace(/\[[^\]]{0,40}\]|\((?:m[uú]sica|music|risas|laughs?|aplausos|applause|silencio|silence)\)/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  // Lo mismo unido con guiones muchas veces («4-4-4-4-4») → una vez; un pedazo (1 a 6 palabras) repetido 3 veces o más
  // seguidas → una sola vez.
  t = t.replace(/(?<![\p{L}\p{N}])([\p{L}\p{N}]+)(?:[-‐]\1(?![\p{L}\p{N}])){3,}[-‐]?/gu, '$1');
  for (let largo = 6; largo >= 1; largo--) {
    const pedazo = `((?:[^\\s]+\\s+){${largo - 1}}[^\\s]+)`;
    t = t.replace(new RegExp(`${pedazo}(?:\\s+\\1){2,}`, 'gu'), '$1');
  }
  t = t.replace(/\s+/g, ' ').trim();
  if (RELLENO.some(re => re.test(t))) return '';
  return t;
}

// El avance de la preparación: el servidor (si todavía baja los archivos) y después el navegador. → 0 a 99.
export function porcentajePreparando({ servidorPct = null, cargado = 0, total = 0 } = {}) {
  const navegador = total > 0 ? Math.min(1, cargado / total) : 0;
  const pct = servidorPct == null ? navegador * 100 : servidorPct < 100 ? servidorPct / 2 : 50 + navegador * 50;
  return Math.max(0, Math.min(99, Math.floor(pct)));
}
// Los MB que dice el aviso de la primera vez.
export const megasDe = bytes => Math.max(1, Math.round((Number(bytes) || 0) / 1e6));

// La grabación (un Blob de MediaRecorder: WebM/Opus en Chrome, MP4/AAC en Safari) → Float32Array mono a 16 kHz.
export async function audioDeGrabacion(blob, w = window) {
  const C = w.AudioContext || w.webkitAudioContext;
  const ctx = new C();
  try {
    const datos = await blob.arrayBuffer();
    const buf = await new Promise((ok, mal) => {
      const p = ctx.decodeAudioData(datos, ok, mal);
      if (p && typeof p.then === 'function') p.then(ok, mal);
    });
    const canales = [];
    for (let k = 0; k < buf.numberOfChannels; k++) canales.push(buf.getChannelData(k));
    return remuestrear(mezclarMono(canales), buf.sampleRate, 16000);
  } finally {
    try { await ctx.close(); } catch { /* nada */ }
  }
}

// ¿Qué modelo usa? El grande (whisper-base, mejor en español) salvo que en este equipo ya se cayó la página con él (un
// teléfono sin memoria): entonces el chico (whisper-tiny). Si también se cayó con el chico: ninguno (null).
export function modeloPara(e, malos = new Set()) {
  if (e?.modelo && !malos.has(e.modelo)) return e.modelo;
  if (e?.modeloChico && !malos.has(e.modeloChico)) return e.modeloChico;
  return null;
}

// La guardia contra una página que se cae cargando el modelo (el iPhone cierra la pestaña si no le alcanza la memoria):
// mientras carga o transcribe, anota el modelo con el nombre de ESTA pestaña; al terminar lo borra. Si al abrir otra vez
// esta misma pestaña (sessionStorage sobrevive a la recarga) todavía está anotado, ese modelo no le sirve a este equipo
// por unos días. No cuenta como caída: otra pestaña (su anotación es suya), cerrar la página (pagehide) ni que el
// teléfono la mande al fondo (al ocultarse se borra la anotación; al volver se pone otra vez).
// almacen: localStorage; sesion: sessionStorage (si fallan, no recuerda nada y nunca se rompe).
export const DIAS_MODELO_MALO = 3;
export function crearGuardia(almacen, { sesion = null, alCerrar = null, alVisibilidad = null, reloj = () => Date.now() } = {}) {
  const leer = (a, k) => { try { return a?.getItem(k) ?? null; } catch { return null; } };
  const poner = (a, k, v) => { try { if (v == null) a?.removeItem(k); else a?.setItem(k, v); } catch { /* sin memoria del navegador */ } };
  const json = texto => { try { return JSON.parse(texto); } catch { return null; } };
  let pestana = leer(sesion, 'op_voz_pestana');
  if (!pestana) { pestana = Math.random().toString(36).slice(2, 12); poner(sesion, 'op_voz_pestana', pestana); }
  // También en memoria: sin localStorage, al menos en esta visita no se prueba otra vez el que no cargó.
  const enEstaVisita = new Set();
  const malos = () => {
    const x = new Set(enEstaVisita);
    const guardados = json(leer(almacen, 'op_voz_no'));
    if (Array.isArray(guardados)) for (const g of guardados) if (g && typeof g.modelo === 'string' && reloj() - Number(g.cuando) < DIAS_MODELO_MALO * 86_400_000) x.add(g.modelo);
    return x;
  };
  const agregarMalo = modelo => {
    enEstaVisita.add(modelo);
    const viejos = json(leer(almacen, 'op_voz_no'));
    const lista = (Array.isArray(viejos) ? viejos : []).filter(g => g && g.modelo !== modelo && reloj() - Number(g.cuando) < DIAS_MODELO_MALO * 86_400_000);
    poner(almacen, 'op_voz_no', JSON.stringify([...lista, { modelo, cuando: reloj() }].slice(-4)));
  };
  const marca = () => json(leer(almacen, 'op_voz_en_uso'));
  const quedo = marca();
  if (quedo && quedo.pestana === pestana && typeof quedo.modelo === 'string') { agregarMalo(quedo.modelo); poner(almacen, 'op_voz_en_uso', null); } else if (quedo && reloj() - Number(quedo.cuando) > 15 * 60_000) poner(almacen, 'op_voz_en_uso', null);
  let activo = null;
  const escribir = () => poner(almacen, 'op_voz_en_uso', JSON.stringify({ pestana, modelo: activo, cuando: reloj() }));
  const borrarSiEsMia = () => { if (marca()?.pestana === pestana) poner(almacen, 'op_voz_en_uso', null); };
  try { alCerrar?.(borrarSiEsMia); } catch { /* nada */ }
  try { alVisibilidad?.(oculta => { if (oculta) borrarSiEsMia(); else if (activo) escribir(); }); } catch { /* nada */ }
  return {
    malos, agregarMalo,
    marcar: modelo => { activo = modelo; escribir(); },
    quitar: () => { activo = null; borrarSiEsMia(); },
  };
}

// ---------- 0.14.106: el dictado listo al instante (lo pidió el dueño: «debe ya estar funcionando al instante») ----------
// Antes, la primera vez que tocaba el micrófono, el alumno veía «Preparando el dictado (solo la primera vez, ~102 MB)… N %».
// Ahora: (1) al entrar (con el oral en su curso) los archivos se bajan callados en segundo plano, con prioridad baja y
// cuando el navegador está libre; al abrir cualquier pantalla del oral, enseguida; (2) el micrófono graba al instante
// aunque el modelo no esté listo, y al parar solo dice «Escribiendo lo que dijiste…»; (3) donde hay dictado del navegador
// (Chrome en la computadora o en Android), mientras el modelo no está listo ese dictado escribe en vivo al mismo tiempo.

// ¿Cuándo se bajan los archivos? → 'no' (el alumno pidió ahorrar datos: nunca solos; se bajan al usar el micrófono),
// 'esperar' (red de celular lenta: hasta que abra el oral), 'ya' (abrió el oral) o 'tranquilo' (al entrar, cuando el
// navegador esté libre). Sin navigator.connection (el iPhone no lo tiene): como una red normal.
export function planPrecarga(nav = typeof navigator !== 'undefined' ? navigator : null, motivo = 'entrar') {
  const c = nav?.connection ?? null;
  if (c?.saveData === true) return 'no';
  if (motivo === 'oral') return 'ya';
  const lenta = ['slow-2g', '2g', '3g'].includes(String(c?.effectiveType ?? '')) || (Number(c?.downlink) > 0 && Number(c?.downlink) < 1.5);
  if (lenta && c?.type !== 'wifi' && c?.type !== 'ethernet') return 'esperar';
  return 'tranquilo';
}

// ¿Se usa el dictado del navegador EN VIVO mientras se graba (solo si Whisper todavía no está listo)? Donde existe y
// escribe bien: Chrome y Edge en la computadora y Chrome en Android. Nunca en el iPhone (no escribía nada) ni en Safari
// del Mac (tampoco: 0.14.53).
export function vivoEnParalelo(nav = typeof navigator !== 'undefined' ? navigator : null, hayReconocimiento = false) {
  if (!hayReconocimiento || !nav) return false;
  const ua = String(nav.userAgent ?? '');
  if (/iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return false;
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg|android/i.test(ua)) return false;
  return /chrome|chromium|edg/i.test(ua);
}

// Lo que se baja en segundo plano. Los archivos del modelo y el wasm van a la caja del Cache API ('oportia-voz') con la
// MISMA dirección que pide el trabajador (public/voz-trabajador.js: `${base}modelos/…` y `${base}ort/…wasm`): así, al
// cargar, no pide nada a la red. La librería (lib/…, ort/….mjs, se cargan con import()) queda en la caché normal del
// navegador (van «immutable» por un año). Nunca se lee un archivo grande entero en memoria: va de la red a la caja.
//  - pedirEstado(): GET /api/academia/voz/estado (si el servidor todavía los baja, se pregunta otra vez cada 20 s).
//  - abrirCaja(): la caja (o null si el navegador no deja: modo privado). pedir(url, { priority }): fetch.
//  - programar(f): cuando el navegador está libre (requestIdleCallback, o un rato después).
//  - persistir(motivo): pide que el navegador no borre la caja (navigator.storage.persist(); el iPhone la borra si no).
//  - whisper(): el de la página; se calienta (el modelo cargado en el trabajador) cuando los archivos ya están.
//  - malos(): los modelos que no cargaron en este equipo (crearGuardia): un teléfono que no aguanta el grande baja el chico.
export function crearPrecarga({ pedirEstado, abrirCaja = async () => null, pedir, nav = null, programar = f => setTimeout(f, 0), esperar = ms => new Promise(ok => setTimeout(ok, ms)), persistir = async () => false, whisper = null, malos = () => new Set(), resolver = x => x, calentarAlEntrar = () => false, esperaServidorMs = 20_000, maxVueltasServidor = 90, reloj = () => Date.now() } = {}) {
  let bajando = null;
  let enCaja = false;
  let calentar = false;
  let urgente = false;
  let programado = false;
  let pidioGuardar = false;
  let despertar = null;
  const info = { estado: 'nada', motivo: null, empezo: null, enCaja: null, listo: null, bajados: 0, fallo: null };
  const dormir = ms => new Promise(ok => { despertar = ok; esperar(ms).then(ok, ok); });
  // Un archivo que no va a la caja: se lee por pedazos y se tira (solo para dejarlo en la caché del navegador).
  const vaciar = async r => {
    try { const l = r.body?.getReader?.(); if (l) { for (;;) { const { done } = await l.read(); if (done) break; } } else await r.arrayBuffer?.(); } catch { /* nada */ }
  };
  const bajar = async () => {
    let e = null;
    for (let k = 0; ; k++) {
      try { e = await pedirEstado(); } catch { e = null; }
      if (!e) throw new Error('sin_red');
      if (e.estado === 'lista') break;
      if (e.estado === 'no') throw new Error('no_disponible');
      if (k >= maxVueltasServidor) throw new Error('tiempo');
      await dormir(urgente ? 1000 : esperaServidorMs);
    }
    const modelo = modeloPara(e, malos());
    if (!modelo) throw new Error('memoria');
    const rutas = e.archivosDe?.[modelo];
    if (!Array.isArray(rutas) || !rutas.length) throw new Error('sin_lista');
    let caja = null;
    try { caja = await abrirCaja(); } catch { caja = null; }
    for (const ruta of rutas) {
      const url = resolver(`${e.base}${ruta}`);
      const deLaCaja = ruta.startsWith('modelos/') || ruta.endsWith('.wasm');
      // Sin caja (modo privado): el modelo no se baja dos veces; lo baja el trabajador al cargar.
      if (deLaCaja && !caja) continue;
      const aLaCaja = deLaCaja;
      if (aLaCaja) {
        let ya = null;
        try { ya = await caja.match(url); } catch { ya = null; }
        if (ya) continue;
      }
      const r = await pedir(url, { priority: urgente ? 'high' : 'low' });
      if (!r?.ok) throw new Error('sin_red');
      if (aLaCaja) await caja.put(url, r); else await vaciar(r);
      info.bajados++;
    }
  };
  const calentarSiToca = () => {
    if (!enCaja || !calentar || !whisper) return Promise.resolve();
    let w = null;
    try { w = whisper(); } catch { return Promise.resolve(); }
    if (!w || w.listo || w.roto) return Promise.resolve();
    return w.preparar().then(() => { info.listo ??= reloj(); info.estado = 'listo'; }, () => {});
  };
  const correr = (motivo, { conCalor = false } = {}) => {
    if (conCalor) calentar = true;
    if (!pidioGuardar) { pidioGuardar = true; Promise.resolve().then(() => persistir(motivo)).catch(() => {}); }
    if (!bajando) {
      info.estado = 'bajando';
      info.motivo = motivo;
      info.empezo ??= reloj();
      info.fallo = null;
      bajando = bajar().then(() => { enCaja = true; info.enCaja ??= reloj(); info.estado = 'en_caja'; }, err => {
        // Un fallo aquí nunca apaga el dictado: el micrófono lo intenta otra vez (y el oral también, al abrirse).
        bajando = null;
        info.estado = 'fallo';
        info.fallo = err?.message ?? 'fallo';
        throw err;
      });
    }
    return bajando.then(calentarSiToca).catch(() => {});
  };
  return {
    // Entró (y tiene el oral en su curso): cuando el navegador esté libre. → el plan ('tranquilo' | 'esperar' | 'no').
    alEntrar() {
      const plan = planPrecarga(nav, 'entrar');
      if (plan !== 'tranquilo' || programado) return plan;
      programado = true;
      try { programar(() => { correr('entrar', { conCalor: Boolean(calentarAlEntrar()) }); }); } catch { /* nada */ }
      return plan;
    },
    // Abrió una pantalla del oral: ya mismo, y con el modelo caliente. → el plan ('ya' | 'no').
    alOral() {
      const plan = planPrecarga(nav, 'oral');
      if (plan === 'no') return plan;
      correr('oral', { conCalor: true });
      return plan;
    },
    // El alumno tocó el micrófono y el modelo no está listo: lo que falta va con prioridad y el trabajador espera a que
    // termine (no baja lo mismo dos veces). → la bajada en curso (o null).
    apurar() {
      if (!bajando) return null;
      urgente = true;
      try { despertar?.(); } catch { /* nada */ }
      return bajando.catch(() => {});
    },
    get enCaja() { return enCaja; },
    get info() { return { ...info }; },
  };
}

// Qué texto queda después de grabar. vivo: lo que escribió el dictado del navegador en vivo (una promesa del texto, o
// null si no hubo). Si el modelo está listo enseguida (esperaMs, unos segundos), se usa Whisper (escribe mejor); si no,
// se queda lo del navegador. Sin texto en vivo, se espera a Whisper (con un tope: nunca «Escribiendo…» para siempre).
// → { texto, fuente: 'whisper' | 'navegador' } | { fallo: 'sin_red' | 'equipo' | 'tiempo' }
export const ESPERA_WHISPER_MS = 4000;
export const MAX_ESPERA_WHISPER_MS = 4 * 60_000;
export async function textoDelTurno({ whisper, audio, idioma = 'es', vivo = null, esperar = null, esperaMs = ESPERA_WHISPER_MS, maxEsperaMs = MAX_ESPERA_WHISPER_MS, antes = null } = {}) {
  let dichoVivo = '';
  if (vivo) { try { dichoVivo = String((await vivo) ?? '').trim(); } catch { dichoVivo = ''; } }
  let tarde = false;
  const conWhisper = (async () => {
    if (!whisper.listo) { try { await antes?.(); } catch { /* nada */ } }
    await whisper.preparar();
    if (tarde) return null;
    const a = await audio();
    if (tarde) return null;
    if (!a?.length) return { texto: '' };
    return whisper.transcribir(a, idioma);
  })();
  let reloj = null;
  const plazo = esperar ? esperar(dichoVivo ? esperaMs : maxEsperaMs) : new Promise(ok => { reloj = setTimeout(ok, dichoVivo ? esperaMs : maxEsperaMs); });
  const r = await Promise.race([conWhisper.then(x => ({ x }), e => ({ e })), plazo.then(() => ({ tarde: true }))]);
  clearTimeout(reloj);
  if (r.tarde) tarde = true;
  if (r.x && (String(r.x.texto ?? '').trim() || !dichoVivo)) return { texto: String(r.x.texto ?? ''), fuente: 'whisper' };
  if (dichoVivo) return { texto: dichoVivo, fuente: 'navegador' };
  if (r.tarde) return { fallo: 'tiempo' };
  return { fallo: r.e?.message === 'sin_red' ? 'sin_red' : 'equipo' };
}

// El dictado Whisper de esta página (uno para toda la app: el modelo se carga una sola vez).
//  - pedirEstado(): GET /api/academia/voz/estado → { estado: 'lista'|'bajando'|'falta'|'no', pct, base, modelo, bytes }.
//  - crearTrabajador(): el Worker (en las pruebas, uno falso).
//  - preparar(alProgreso({ pct, mb })): espera al servidor y carga el modelo. Rechaza con un motivo si no se puede.
//  - transcribir(audio, idioma) → el texto (limpio).
// 0.14.106: antesDeCargar(): antes de crear el trabajador, espera la bajada en segundo plano si va (crearPrecarga.apurar):
// así no se baja lo mismo dos veces y el trabajador lo lee todo de la caja.
export function crearWhisper({ pedirEstado, crearTrabajador, esperar = ms => new Promise(ok => setTimeout(ok, ms)), maxEsperaServidorMs = 15 * 60_000, maxSinAvanceMs = 90_000, reloj = () => Date.now(), guardia = crearGuardia(null), antesDeCargar = null } = {}) {
  let trabajador = null;
  let preparando = null;
  let listo = false;
  let roto = null;
  let mb = 100;
  let modelo = null;
  let ultimoPct = 0;
  const oyentes = new Set();
  const pendientes = new Map();
  let siguiente = 1;
  const avisar = info => { ultimoPct = info.pct; for (const f of oyentes) { try { f(info); } catch { /* nada */ } } };
  const romper = motivo => {
    roto = motivo;
    listo = false;
    for (const { mal } of pendientes.values()) mal(new Error(motivo));
    pendientes.clear();
    try { trabajador?.terminate(); } catch { /* nada */ }
    trabajador = null;
  };

  const esperarServidor = async () => {
    const desde = reloj();
    let vioBajar = false;
    // 0.14.91: si el servidor dice «bajando» y no avanza en 90 s (el sitio de los archivos no responde), no se espera más:
    // se usa el otro dictado (antes: hasta 15 minutos con «Preparando 0 %»).
    let pctAntes = -1;
    let avanzo = desde;
    for (;;) {
      let e = null;
      try { e = await pedirEstado(); } catch { e = null; }
      if (!e) throw new Error('sin_red');
      if (e.bytes) mb = megasDe(e.bytesDe?.[modeloPara(e, guardia.malos())] ?? e.bytes);
      if (e.estado === 'lista') return { e, vioBajar };
      if (e.estado === 'no') throw new Error('no_disponible');
      vioBajar = true;
      if (Number(e.pct) > pctAntes) { pctAntes = Number(e.pct) || 0; avanzo = reloj(); } else if (reloj() - avanzo > maxSinAvanceMs) throw new Error('no_disponible');
      avisar({ pct: porcentajePreparando({ servidorPct: Number(e.pct) || 0 }), mb });
      if (reloj() - desde > maxEsperaServidorMs) throw new Error('tiempo');
      await esperar(2000);
    }
  };

  const cargarUno = ({ e, vioBajar }) => new Promise((ok, mal) => {
    try { trabajador = crearTrabajador(); } catch { mal(new Error('sin_trabajador')); return; }
    const total0 = Number(e.bytesDe?.[modelo] ?? e.bytes) || 0;
    mb = megasDe(total0);
    const avance = new Map();
    // Un error del trabajador mientras carga (sin memoria): se prueba el modelo chico; después de cargado: se rompe.
    trabajador.onerror = () => { if (!listo) mal(new Error('modelo')); else romper('trabajador'); };
    trabajador.onmessage = ev => {
      const d = ev.data ?? {};
      if (d.tipo === 'progreso') {
        avance.set(d.archivo, { cargado: d.cargado, total: d.total });
        let cargado = 0;
        let total = 0;
        for (const x of avance.values()) { cargado += x.cargado; total += x.total; }
        // El total del servidor (todos los archivos) si se sabe: así no llega al 99 % con el primer archivo chico.
        avisar({ pct: porcentajePreparando({ servidorPct: vioBajar ? 100 : null, cargado, total: Math.max(total, total0) }), mb });
      } else if (d.tipo === 'listo') { guardia.quitar(); listo = true; ok(); } else if (d.tipo === 'fallo' && d.id == null) { mal(new Error('modelo')); } else if (d.id != null && pendientes.has(d.id)) {
        const p = pendientes.get(d.id);
        pendientes.delete(d.id);
        if (d.tipo === 'texto') p.ok(d); else p.mal(new Error(d.motivo || 'transcribir'));
      }
    };
    guardia.marcar(modelo);
    trabajador.postMessage({ tipo: 'preparar', base: e.base, modelo });
  });
  // El modelo grande; si no carga en este equipo (sin memoria), el chico; si tampoco, se rinde.
  const cargarModelo = async x => {
    for (;;) {
      modelo = modeloPara(x.e, guardia.malos());
      if (!modelo) throw new Error('memoria');
      try { await cargarUno(x); return; } catch (err) {
        guardia.quitar();
        try { trabajador?.terminate(); } catch { /* nada */ }
        trabajador = null;
        if (err?.message !== 'modelo') throw err;
        guardia.agregarMalo(modelo);
      }
    }
  };

  const preparar = (alProgreso = null) => {
    if (alProgreso) oyentes.add(alProgreso);
    if (alProgreso && preparando && !listo) { try { alProgreso({ pct: ultimoPct, mb }); } catch { /* nada */ } }
    if (roto) return Promise.reject(new Error(roto));
    if (listo) return Promise.resolve();
    preparando ??= esperarServidor().then(async x => { try { await antesDeCargar?.(); } catch { /* sigue: el trabajador baja lo que falte */ } return x; }).then(cargarModelo).catch(err => {
      preparando = null;
      // Sin red o el servidor tardó: se puede probar otra vez; lo demás (no hay archivos, el modelo no carga): no.
      if (!['sin_red', 'tiempo'].includes(err?.message)) romper(err?.message || 'modelo');
      throw err;
    });
    return preparando.finally(() => { if (alProgreso) oyentes.delete(alProgreso); });
  };

  const transcribir = async (audio, idioma = 'es') => {
    await preparar();
    const id = siguiente++;
    guardia.marcar(modelo);
    const r = await new Promise((ok, mal) => {
      pendientes.set(id, { ok: x => { guardia.quitar(); ok(x); }, mal: x => { guardia.quitar(); mal(x); } });
      try { trabajador.postMessage({ tipo: 'transcribir', id, audio, idioma: idioma === 'en' ? 'en' : 'es' }, [audio.buffer]); } catch (e) { pendientes.delete(id); mal(e); }
    });
    return { texto: limpiarTranscripcion(r.texto), ms: r.ms };
  };

  return {
    preparar, transcribir,
    get listo() { return listo; },
    get roto() { return roto; },
    get megas() { return mb; },
    get modelo() { return modelo; },
  };
}

// El de esta página (se crea al primer uso, con el trabajador de verdad).
const estadoDeLaPagina = async () => {
  const r = await fetch('/api/academia/voz/estado', { credentials: 'same-origin', headers: { 'X-Oportia': '1' } });
  return r.ok ? r.json() : null;
};
let guardiaPagina = null;
const guardiaDeLaPagina = () => (guardiaPagina ??= crearGuardia(typeof localStorage !== 'undefined' ? localStorage : null, {
  sesion: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  alCerrar: f => window.addEventListener('pagehide', f),
  alVisibilidad: f => document.addEventListener('visibilitychange', () => f(document.visibilityState === 'hidden')),
}));
let compartido = null;
export function whisperDeLaPagina(pedirEstado = estadoDeLaPagina) {
  compartido ??= crearWhisper({
    pedirEstado,
    guardia: guardiaDeLaPagina(),
    antesDeCargar: () => precargaPagina?.apurar(),
    crearTrabajador: () => new Worker(new URL('./voz-trabajador.js', import.meta.url), { type: 'module' }),
  });
  return compartido;
}

// 0.14.106: la bajada en segundo plano de esta página (una sola). Si el navegador no puede con Whisper, no hace nada.
let precargaPagina = null;
const NADA = Object.freeze({ alEntrar: () => 'no', alOral: () => 'no', apurar: () => null, enCaja: false, info: { estado: 'nada' } });
export function precargaDeLaPagina() {
  if (precargaPagina) return precargaPagina;
  if (typeof window === 'undefined' || !puedeWhisper()) return NADA;
  const nav = window.navigator;
  // Cuando el navegador está libre (requestIdleCallback; el iPhone no lo tiene: unos segundos después de entrar).
  const programar = f => setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => f(), { timeout: 8000 }); else f();
  }, 2500);
  // Que el navegador no borre la caja (el iPhone borra lo que no es «persistente» si le falta espacio). Firefox lo
  // pregunta con un cartel: ahí solo al abrir el oral, nunca al entrar.
  const persistir = async motivo => {
    const s = nav.storage;
    if (typeof s?.persist !== 'function') return false;
    if (motivo !== 'oral' && /firefox/i.test(String(nav.userAgent ?? ''))) return false;
    try { if (typeof s.persisted === 'function' && await s.persisted()) return true; } catch { /* sigue */ }
    try { return await s.persist(); } catch { return false; }
  };
  precargaPagina = crearPrecarga({
    pedirEstado: estadoDeLaPagina,
    abrirCaja: () => (typeof caches === 'undefined' ? null : caches.open('oportia-voz')),
    pedir: (url, { priority }) => fetch(url, { credentials: 'same-origin', priority }),
    nav, programar, persistir,
    whisper: () => whisperDeLaPagina(),
    malos: () => guardiaDeLaPagina().malos(),
    resolver: ruta => new URL(ruta, window.location.href).href,
    calentarAlEntrar: () => equipoCapaz(nav),
  });
  return precargaPagina;
}
