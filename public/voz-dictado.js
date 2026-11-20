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

// ¿Se adelanta la carga del modelo apenas se abre la práctica? Solo en una computadora con memoria (en el teléfono, al
// tocar el micrófono por primera vez: así no gasta datos si no lo usa).
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

// El dictado Whisper de esta página (uno para toda la app: el modelo se carga una sola vez).
//  - pedirEstado(): GET /api/academia/voz/estado → { estado: 'lista'|'bajando'|'falta'|'no', pct, base, modelo, bytes }.
//  - crearTrabajador(): el Worker (en las pruebas, uno falso).
//  - preparar(alProgreso({ pct, mb })): espera al servidor y carga el modelo. Rechaza con un motivo si no se puede.
//  - transcribir(audio, idioma) → el texto (limpio).
export function crearWhisper({ pedirEstado, crearTrabajador, esperar = ms => new Promise(ok => setTimeout(ok, ms)), maxEsperaServidorMs = 15 * 60_000, maxSinAvanceMs = 90_000, reloj = () => Date.now(), guardia = crearGuardia(null) } = {}) {
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
    preparando ??= esperarServidor().then(cargarModelo).catch(err => {
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
let compartido = null;
export function whisperDeLaPagina(pedirEstado) {
  compartido ??= crearWhisper({
    pedirEstado,
    guardia: crearGuardia(typeof localStorage !== 'undefined' ? localStorage : null, {
      sesion: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
      alCerrar: f => window.addEventListener('pagehide', f),
      alVisibilidad: f => document.addEventListener('visibilitychange', () => f(document.visibilityState === 'hidden')),
    }),
    crearTrabajador: () => new Worker(new URL('./voz-trabajador.js', import.meta.url), { type: 'module' }),
  });
  return compartido;
}
