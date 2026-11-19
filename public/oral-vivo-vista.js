// Academia 0.14.29 (pedido del dueño): la «Práctica en vivo» del examen oral (solo se carga en #oral/vivo). Como el
// checkride: el examinador hace UNA pregunta a la vez (se puede leer en voz alta con la voz del navegador), el alumno
// responde hablando (el dictado del navegador) o escribiendo, y al momento solo ve «Bien / Casi / Mal» con una línea. Al
// final, el repaso como en el examen final: «Aprobado / No aprobado», tema por tema con la comparación con las veces
// anteriores, qué reforzar, «¿Listo para el examen real?», el mensaje del instructor y cada pregunta con la respuesta del
// libro.
//  - Privacidad: con el dictado del navegador, el audio nunca sale del navegador; al servidor va solo el TEXTO.
//    0.14.50: con ChatGPT (si el dueño lo tiene), el micrófono GRABA la respuesta (MediaRecorder) y la manda a la app, que
//    la pasa a texto con ChatGPT y no la guarda nunca; el texto se agrega al cuadro (se puede corregir antes de «Enviar»).
//  - Las dos voces son opcionales y se recuerdan por alumno en este navegador: «Leer las preguntas en voz alta» y
//    «Responder con la voz». Sin dictado en el navegador: se escribe.
//  - Todo con h.el / h.talCual (nunca texto como código) y clases (nunca estilos escritos); los textos, de public/i18n.
import { selectorIdioma, bilingue, idiomaOral } from './oral-idioma.js';
import { crearExaminador } from './oral-examinador.js';

// Pone los hijos sin los que faltan (un null nunca se ve como texto).
const poner = (nodo, ...hijos) => nodo.replaceChildren(...hijos.flat(Infinity).filter(x => x != null && x !== false));
const ruta = (...p) => `#oral/vivo${p.length ? `/${p.map(encodeURIComponent).join('/')}` : ''}`;
const claveAjuste = (usuario, que) => `op_vivo_${que}.${Number(usuario) || 0}`;
function leerAjuste(usuario, que, porDefecto) {
  try { const v = localStorage.getItem(claveAjuste(usuario, que)); return v == null ? porDefecto : v === '1'; } catch { return porDefecto; }
}
function guardarAjuste(usuario, que, valor) { try { localStorage.setItem(claveAjuste(usuario, que), valor ? '1' : '0'); } catch { /* vale solo ahora */ } }

// La voz del navegador (leer) y su dictado (escuchar): solo si existen.
const Reconocimiento = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null);
export const puedeLeer = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
export const puedeDictar = () => Boolean(Reconocimiento());
// 0.14.48: lo dictado, en limpio (sin navegador: se prueba solo). El iPhone a veces termina una frase SIN resultado
// «final» (solo el provisional) y el dictado vuelve a empezar: antes ese pedazo se perdía al llegar la frase siguiente.
// Ahora, al terminar cada tramo, lo provisional queda fijo. Las partes se juntan con un espacio (nunca al principio).
const juntar = (...partes) => partes.map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
export function crearDictado(base = '', maximo = 1200) {
  let fijo = '';
  let provisional = '';
  const texto = () => juntar(base, fijo, provisional).slice(0, maximo);
  return {
    texto,
    // Un «onresult» del navegador: los finales se suman; el provisional reemplaza al anterior.
    resultado(ev) {
      let nuevoFijo = '';
      let nuevoProvisional = '';
      const lista = ev?.results ?? [];
      for (let k = ev?.resultIndex ?? 0; k < lista.length; k++) {
        const x = lista[k];
        const dicho = x?.[0]?.transcript ?? '';
        if (x?.isFinal) nuevoFijo = juntar(nuevoFijo, dicho); else nuevoProvisional = juntar(nuevoProvisional, dicho);
      }
      fijo = juntar(fijo, nuevoFijo);
      provisional = nuevoProvisional;
      return texto();
    },
    // Terminó un tramo (onend): lo provisional que quedó se guarda.
    fin() { fijo = juntar(fijo, provisional); provisional = ''; return texto(); },
  };
}
// ---------- 0.14.50: el dictado con grabación (ChatGPT pasa a texto lo que dijo) ----------
// El dictado del navegador (Web Speech) no escribía nada en el Mac ni en el iPhone del dueño. Ahora, si la app tiene
// ChatGPT, el micrófono graba (MediaRecorder) y la app lo pasa a texto. Todo lo de aquí se prueba sin navegador.
export const GRABAR = Object.freeze({ maxMs: 90_000, minMs: 700 });
export const puedeGrabar = () => typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
// En el iPhone TODO es Safari por dentro (también Chrome y la app de la pantalla de inicio).
export const esIosNavegador = (nav = typeof navigator !== 'undefined' ? navigator : null) => Boolean(nav) && (/iPad|iPhone|iPod/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1));
// 0.14.50: sin ChatGPT (lo normal), lo que de verdad funciona es el dictado del TECLADO (el 🎤 del teclado del iPhone o de
// Android; en el Mac, dos veces Fn; en Windows, Windows+H). ¿Teléfono o tableta? → la pista de ese teclado.
export const esMovilNavegador = (nav = typeof navigator !== 'undefined' ? navigator : null) => esIosNavegador(nav) || (Boolean(nav) && /Android|Mobi/i.test(nav.userAgent ?? ''));
export const pistaTecladoDe = nav => (esMovilNavegador(nav) ? 'vivo.pista.movil' : 'vivo.pista.pc');
// Qué hace el micrófono de la app: 'grabar' (con ChatGPT), 'teclado' (en el iPhone nunca el dictado del navegador: solo abre
// el teclado y muestra la pista; igual sin dictado en el navegador) o 'navegador' (lo intenta; si en 6 s no llega texto,
// lo para y muestra la pista del teclado).
export function modoDictado({ grabar = false, hayReconocimiento = false, nav = typeof navigator !== 'undefined' ? navigator : null } = {}) {
  if (grabar) return 'grabar';
  if (esIosNavegador(nav) || !hayReconocimiento) return 'teclado';
  return 'navegador';
}
export const ESPERA_TEXTO_MS = 6000;
// ¿Un «onresult» del navegador trae texto de verdad?
export const hayTexto = ev => { const l = ev?.results ?? []; for (let k = 0; k < (l.length ?? 0); k++) if (String(l[k]?.[0]?.transcript ?? '').trim()) return true; return false; };
// El formato de la grabación: Chrome graba WebM (Opus); Safari (iPhone y Mac), MP4 (AAC). '' = el que elija el navegador.
export const TIPOS_GRABACION = Object.freeze(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']);
export function tipoGrabacion(admite) {
  for (const tipo of TIPOS_GRABACION) { try { if (admite(tipo)) return tipo; } catch { /* sigue */ } }
  return '';
}
// Lo que se manda como Content-Type (sin «;codecs=…»): audio/webm, audio/mp4…
export const tipoParaEnviar = tipo => (String(tipo ?? '').split(';')[0].trim().toLowerCase() || 'audio/webm');
// El reloj de la grabación: «0:07», «1:30».
export const relojGrabacion = ms => { const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Lo que dijo se AGREGA a lo que ya está en el cuadro (con un espacio), sin pasar del máximo.
export const agregarTexto = (actual, nuevo, maximo = 1200) => juntar(actual, nuevo).slice(0, maximo);
// Cuánto suena (para las barritas): 0 a 4, de las muestras del micrófono (bytes 0–255, 128 = silencio).
export function nivelDe(muestras) {
  if (!muestras?.length) return 0;
  let suma = 0;
  for (let k = 0; k < muestras.length; k++) { const v = (muestras[k] - 128) / 128; suma += v * v; }
  const rms = Math.sqrt(suma / muestras.length);
  return rms < 0.02 ? 0 : rms < 0.06 ? 1 : rms < 0.12 ? 2 : rms < 0.22 ? 3 : 4;
}
// Por qué no se pudo usar el micrófono → la clave del estado (vivo.estado.*).
export const errorMicrofono = err => { const n = err?.name; return n === 'NotAllowedError' || n === 'SecurityError' ? 'sin_permiso' : n === 'NotFoundError' || n === 'NotReadableError' || n === 'OverconstrainedError' ? 'sin_micro' : 'no_oyo'; };
// Una grabación. empezar() pide el micrófono (llamarla DENTRO del toque: el iPhone lo exige) y graba; parar() →
// { blob, tipo, ms }; cancelar() la tira. Siempre apaga el micrófono al terminar. alTope: a los 90 s para sola.
export function crearGrabacion({ medios, Grabadora, maxMs = GRABAR.maxMs, reloj = () => Date.now(), alTope = null, temporizador = setTimeout, quitarTemporizador = clearTimeout } = {}) {
  let flujo = null;
  let rec = null;
  let partes = [];
  let desde = 0;
  let tope = null;
  let alParar = null;
  let tipo = '';
  const soltar = () => { quitarTemporizador(tope); tope = null; try { flujo?.getTracks().forEach(p => p.stop()); } catch { /* ya apagado */ } };
  return {
    get flujo() { return flujo; },
    get desde() { return desde; },
    empezar() {
      // getUserMedia se llama aquí mismo (sin esperar nada antes): así cuenta como parte del toque.
      return medios.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(f => {
        flujo = f;
        tipo = tipoGrabacion(x => typeof Grabadora.isTypeSupported === 'function' && Grabadora.isTypeSupported(x));
        try { rec = tipo ? new Grabadora(f, { mimeType: tipo }) : new Grabadora(f); } catch (e) { soltar(); throw e; }
        partes = [];
        rec.ondataavailable = e => { if (e?.data?.size) partes.push(e.data); };
        alParar = new Promise(ok => { rec.onstop = () => ok(); });
        try { rec.start(); } catch (e) { soltar(); throw e; }
        desde = reloj();
        tope = temporizador(() => { try { alTope?.(); } catch { /* nada */ } }, maxMs);
      });
    },
    async parar() {
      if (!rec) { soltar(); return null; }
      const ms = reloj() - desde;
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* ya parada */ }
      await Promise.race([alParar, new Promise(ok => temporizador(ok, 3000))]);
      soltar();
      const t = rec.mimeType || tipo || 'audio/webm';
      rec = null;
      return { blob: new Blob(partes, { type: tipoParaEnviar(t) }), tipo: tipoParaEnviar(t), ms };
    },
    cancelar() {
      try { if (rec && rec.state !== 'inactive') { rec.ondataavailable = null; rec.stop(); } } catch { /* nada */ }
      rec = null;
      partes = [];
      soltar();
    },
  };
}

// 0.14.29: la voz natural (ChatGPT): un solo <audio> para toda la práctica. alHablar(true/false): el examinador mueve la
// boca mientras suena una voz (la del teléfono o la natural).
let reproductor = null;
let alHablar = null;
const hablar = si => { try { alHablar?.(si); } catch { /* nada */ } };
function callar() {
  try { if (puedeLeer()) window.speechSynthesis.cancel(); } catch { /* nada */ }
  try { reproductor?.pause(); } catch { /* nada */ }
}
function sonarArchivo(url) {
  try {
    callar();
    if (!reproductor) {
      reproductor = new Audio();
      reproductor.addEventListener('playing', () => hablar(true));
      for (const e of ['ended', 'pause', 'error']) reproductor.addEventListener(e, () => hablar(false));
    }
    reproductor.src = url;
    return reproductor.play().then(() => true, () => false);
  } catch { return Promise.resolve(false); }
}
function leer(texto, lang) {
  if (!puedeLeer() || !texto) return;
  try {
    callar();
    const u = new window.SpeechSynthesisUtterance(texto);
    u.lang = lang;
    const voz = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voz) u.voice = voz;
    u.rate = 0.95;
    u.onstart = () => hablar(true);
    u.onend = () => hablar(false);
    u.onerror = () => hablar(false);
    window.speechSynthesis.speak(u);
  } catch { /* sin voz: se lee en pantalla */ }
}
// iOS: la voz se «despierta» dentro de un toque; después ya puede hablar sola.
function despertarVoz() { try { if (puedeLeer()) window.speechSynthesis.speak(new window.SpeechSynthesisUtterance('')); } catch { /* nada */ } }

// ---------- La portada ----------
export function portadaVivo(d, materiaPre, h) {
  const { el, t, numero, icono, mostrar, marco, nombreMateria, api, avisar, textoError, usuario } = h;
  const volver = el('a', { class: 'volver con-icono', href: '#oral' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('oral.volver') }));
  if (!d.hay) return mostrar(marco('oral', volver, el('section', { class: 'tarjeta' }, el('p', { texto: t('vivo.vacio') }))));
  let voz = leerAjuste(usuario, 'voz', true) && puedeLeer();
  // 0.14.50: con ChatGPT, el micrófono graba (y la app lo pasa a texto); si no, el dictado del navegador.
  const hayGrabar = d.ia?.dictado === true && puedeGrabar();
  const puedeVoz = true; // el teclado siempre puede dictar
  const modoPortada = modoDictado({ grabar: hayGrabar, hayReconocimiento: puedeDictar() });
  let dictar = leerAjuste(usuario, 'dictar', true) && puedeVoz;
  // 0.14.29: la voz natural (ChatGPT, si el dueño lo tiene) o la del teléfono. Claude no tiene voz.
  const hayNatural = d.ia?.vozNatural === true;
  let natural = leerAjuste(usuario, 'natural', true) && hayNatural;
  const interruptor = (texto, valor, disponible, alCambiar, nota) => {
    const caja = el('input', { type: 'checkbox', class: 'vivo-interruptor-caja', role: 'switch', disabled: !disponible });
    caja.checked = valor;
    caja.addEventListener('change', () => alCambiar(caja.checked));
    return el('label', { class: 'vivo-interruptor' }, caja, el('span', { class: 'vivo-interruptor-texto' }, el('strong', { texto }), nota ? el('span', { class: 'suave chica', texto: nota }) : null));
  };
  const capitulo = el('select', { class: 'vivo-select', 'aria-label': t('vivo.capitulo') },
    el('option', { value: '', texto: t('vivo.capitulo.todos') }),
    d.materias.map(m => el('option', { value: m.id, texto: `${nombreMateria(m.id)} (${numero(m.preguntas)})` })));
  if (materiaPre && d.materias.some(m => m.id === materiaPre)) capitulo.value = materiaPre;
  const opcionesN = [5, 7, 10, 15].filter(n => n <= d.maximo);
  if (!opcionesN.includes(d.maximo) && d.maximo < 15) opcionesN.push(d.maximo); // todas, si son pocas
  let n = opcionesN.includes(d.n) ? d.n : opcionesN.at(-1);
  const chips = opcionesN.map(k => el('button', { type: 'button', class: 'vivo-chip', 'aria-pressed': String(k === n), onclick: () => { n = k; for (const c of chips) c.setAttribute('aria-pressed', String(Number(c.dataset.n) === n)); }, 'data-n': k }, el('span', { texto: numero(k) })));
  const conIa = d.ia?.modo === 'ia';
  const empezar = async e => {
    despertarVoz();
    const b = e.currentTarget;
    b.disabled = true;
    const r = await api('POST', '/api/academia/oral/vivo', { materia: capitulo.value || null, n });
    if (!r.ok) { b.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
    practica(r.datos, { voz, dictar, natural, grabar: hayGrabar, umbral: d.umbral, guardarVoz: v => guardarAjuste(usuario, 'voz', v) }, h, 0);
  };
  const seguir = d.abierta ? el('button', { type: 'button', class: 'boton-3d blanco', onclick: async e => {
    despertarVoz();
    const b = e.currentTarget;
    b.disabled = true;
    const r = await api('GET', `/api/academia/oral/vivo/${encodeURIComponent(d.abierta.sesion)}`);
    if (!r.ok) { b.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
    const hechas = new Set(r.datos.respondidas);
    // Terminada (falta calificarse): directo al repaso del final.
    const desde = r.datos.terminada ? -1 : r.datos.preguntas.findIndex(q => !hechas.has(q.i));
    practica(r.datos, { voz, dictar, natural, grabar: hayGrabar, umbral: d.umbral, guardarVoz: v => guardarAjuste(usuario, 'voz', v) }, h, desde < 0 ? r.datos.preguntas.length : desde);
  } }, el('span', { texto: t('vivo.seguir', { n: numero(d.abierta.respondidas), total: numero(d.abierta.total) }) })) : null;
  mostrar(marco('oral', volver,
    el('section', { class: 'examen-portada vivo-portada' },
      el('span', { class: 'examen-trofeo vivo-icono', 'aria-hidden': 'true' }, icono('microfono')),
      el('p', { class: 'antetitulo', texto: t('oral.sello') }),
      el('h1', { class: 'titulo-grande', texto: t('vivo.titulo') }),
      el('p', { class: 'bajada', texto: t('vivo.portada') }),
      el('ul', { class: 'portada-datos' },
        el('li', {}, icono('bandera', 'icono'), el('span', { texto: t('acad.necesitas', { n: numero(d.umbral) }) })),
        el('li', {}, icono(conIa ? 'chispa' : 'lapiz', 'icono'), el('span', { texto: conIa ? (d.ia.ilimitado ? t('vivo.ia.si_admin') : t('vivo.ia.si')) : t('vivo.ia.no') })),
        d.antes ? el('li', {}, icono('estrella', 'icono'), el('span', { texto: t('vivo.antes', { veces: numero(d.antes.veces), mejor: numero(d.antes.mejor ?? 0), ultima: numero(d.antes.ultima?.pct ?? 0) }) })) : null),
      el('section', { class: 'panel vivo-ajustes', 'aria-label': t('vivo.ajustes') },
        interruptor(t('vivo.voz'), voz, puedeLeer(), v => { voz = v; guardarAjuste(usuario, 'voz', v); }, puedeLeer() ? t('vivo.voz.nota') : t('vivo.voz.no_hay')),
        el('div', { class: 'vivo-campo', role: 'radiogroup', 'aria-label': t('vivo.voz.cual') }, el('strong', { texto: t('vivo.voz.cual') }),
          [['natural', t('vivo.voz.natural'), hayNatural], ['telefono', t('vivo.voz.telefono'), puedeLeer()]].map(([v, texto, ok]) => {
            const r = el('input', { type: 'radio', name: 'vivo-voz-cual', value: v, class: 'vivo-interruptor-caja', disabled: !ok });
            r.checked = v === 'natural' ? natural : !natural;
            r.addEventListener('change', () => { natural = v === 'natural'; guardarAjuste(usuario, 'natural', natural); });
            return el('label', { class: 'vivo-interruptor' }, r, el('span', { class: 'vivo-interruptor-texto' }, el('strong', { texto })));
          }),
          el('span', { class: 'suave chica', texto: hayNatural ? t('vivo.voz.natural_nota') : t('vivo.voz.natural_no') })),
        interruptor(t('vivo.dictar'), dictar, puedeVoz, v => { dictar = v; guardarAjuste(usuario, 'dictar', v); }, modoPortada === 'grabar' ? t('vivo.dictar.nota_grabar') : modoPortada === 'navegador' ? t('vivo.dictar.nota') : t('vivo.dictar.nota_teclado')),
        el('label', { class: 'vivo-campo' }, el('strong', { texto: t('vivo.capitulo') }), capitulo),
        el('div', { class: 'vivo-campo' }, el('strong', { texto: t('vivo.cuantas') }), el('div', { class: 'vivo-chips', role: 'group', 'aria-label': t('vivo.cuantas') }, chips))),
      el('p', { class: 'suave chica vivo-privacidad con-icono-chico' }, icono('escudo', 'icono chico'), el('span', { texto: t(hayGrabar ? 'vivo.privacidad_grabar' : 'vivo.privacidad') })),
      el('div', { class: 'vivo-portada-botones' },
        el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: empezar }, el('span', { texto: t('vivo.empezar') })),
        seguir))));
}

// ---------- La práctica: una pregunta a la vez ----------
function practica(s, prefs, h, desde = 0) {
  const { el, t, numero, icono, talCual, api, mostrar, marcoEstudio, combustible, botonGrande, avisar, textoError, sonar, usuario } = h;
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta vivo-zona' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = marcoEstudio({ clase: 'practica-tg vivo-practica', barra: barra.nodo, cuenta, cuerpo: zona, pie, salir: ruta() });
  let escucha = null;
  let actualI = -1;
  // 0.14.50: la grabación en curso (una a la vez); al irse o pasar de pregunta, se tira y se apaga el micrófono.
  let grabacion = null;
  // El examinador (uno para toda la práctica): habla, escucha y reacciona.
  const ex = crearExaminador({ etiqueta: t('vivo.examinador') });
  const escenario = el('div', { class: 'vivo-escenario' }, ex.nodo);
  alHablar = si => ex.poner(si ? 'hablando' : 'quieto');
  const parar = () => { try { escucha?.stop(); } catch { /* nada */ } escucha = null; try { grabacion?.alSoltar?.(); grabacion?.cancelar(); } catch { /* nada */ } grabacion = null; callar(); };
  // Al irse de la pantalla: nada sigue hablando ni escuchando.
  const alCambio = () => setTimeout(() => { if (!zona.isConnected) { parar(); window.removeEventListener('hashchange', alCambio); } }, 0);
  window.addEventListener('hashchange', alCambio);
  const textoPregunta = q => (idiomaOral(usuario) === 'en' || !q.pregunta_es ? { texto: q.pregunta_en, lang: 'en-US' } : { texto: q.pregunta_es, lang: 'es-ES' });

  // Leer una pregunta del libro: con la voz natural si está (la pide y espera unos segundos); si no, la del teléfono.
  const leerPregunta = async (i, decir) => {
    // Sin voz: señala la pregunta y asiente (para que la lea).
    if (!prefs.voz) { ex.poner('leyendo', 2400); return; }
    if (prefs.natural) {
      const idioma = idiomaOral(usuario) === 'en' ? 'en' : 'es';
      for (let k = 0; k < 7 && zona.isConnected; k++) {
        const r = await api('POST', '/api/academia/oral/vivo/voz', { sesion: s.sesion, i, idioma });
        if (!r.ok || r.datos.estado === 'no') break;
        // Ya habla él (o pasó a otra pregunta): no se le encima la voz.
        if (escucha || actualI !== i) return;
        if (r.datos.estado === 'lista') { if (await sonarArchivo(`/api/academia/oral/vivo/voz/${encodeURIComponent(r.datos.archivo)}`)) return; break; }
        await new Promise(z => setTimeout(z, 1200));
      }
      if (!zona.isConnected || escucha || actualI !== i) return;
    }
    if (!puedeLeer()) { ex.poner('leyendo', 2400); return; }
    leer(decir().texto, decir().lang);
  };
  // 0.14.34: silenciar o activar la voz AHÍ MISMO, en medio de la práctica (lo pidió el dueño); se recuerda para la próxima.
  const botonVoz = (repetir, decir, alRepetir) => {
    const b = el('button', { type: 'button', class: 'vivo-repetir con-icono-chico', 'aria-pressed': prefs.voz ? 'false' : 'true' });
    const pintar = () => {
      b.replaceChildren(icono(prefs.voz ? 'silencio' : 'altavoz', 'icono chico'), el('span', { texto: prefs.voz ? t('vivo.silenciar') : t('vivo.activar_voz') }));
      b.setAttribute('aria-pressed', prefs.voz ? 'false' : 'true');
      repetir.hidden = !prefs.voz;
    };
    b.addEventListener('click', () => {
      prefs.voz = !prefs.voz;
      try { prefs.guardarVoz?.(prefs.voz); } catch { /* vale solo ahora */ }
      if (!prefs.voz) { callar(); hablar(false); } else if (alRepetir) alRepetir(); else if (decir) leer(decir().texto, decir().lang);
      pintar();
    });
    pintar();
    return b;
  };
  const burbujaExaminador = (contenido, decir, alRepetir = null) => {
    const repetir = decir ? el('button', { type: 'button', class: 'vivo-repetir con-icono-chico', onclick: () => (alRepetir ? alRepetir() : leer(decir().texto, decir().lang)) }, icono('altavoz', 'icono chico'), el('span', { texto: t('vivo.repetir') })) : null;
    if (repetir) repetir.hidden = !prefs.voz;
    return el('div', { class: 'vivo-fila examinador' },
      el('span', { class: 'vivo-avatar', 'aria-hidden': 'true' }, icono('radio', 'icono')),
      el('div', { class: 'vivo-burbuja' },
        el('p', { class: 'vivo-quien', texto: t('vivo.examinador') }), contenido,
        repetir && puedeLeer() ? el('div', { class: 'botones' }, repetir, botonVoz(repetir, decir, alRepetir)) : null));
  };

  // 0.14.50: el micrófono que GRABA (con ChatGPT). Toca → «Grabando… 0:05» (con las barritas) → toca otra vez (o a los
  // 90 s) → «Escribiendo lo que dijiste…» → el texto se agrega al cuadro, que se puede corregir antes de «Enviar». Si algo
  // falla, lo dice claro y el cuadro sigue para escribir. Si la app dice que ahora no hay dictado, el resto de la
  // práctica usa el del navegador (y el del teclado).
  const crearGrabador = ({ caja, mic, nivel, estado, ponerEstado, i }) => {
    let enviando = false;
    let reloj = null;
    let medidor = null;
    const ponerNivel = n => { if (nivel) nivel.dataset.nivel = String(n); };
    const apagarVista = () => { clearInterval(reloj); reloj = null; try { medidor?.close(); } catch { /* nada */ } medidor = null; ponerNivel(0); mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('grabando'); };
    const escribirEstado = que => { estado.textContent = que; };
    const mostrarReloj = g => escribirEstado(t('vivo.estado.grabando', { tiempo: relojGrabacion(Date.now() - g.desde) }));
    // Las barritas: lo que suena en el micrófono (si el navegador no deja, solo late el botón).
    const medir = flujo => {
      try {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C || !nivel) return;
        medidor = new C();
        medidor.resume?.().catch?.(() => {});
        const a = medidor.createAnalyser();
        a.fftSize = 512;
        medidor.createMediaStreamSource(flujo).connect(a);
        const muestras = new Uint8Array(a.fftSize);
        const leerNivel = () => { if (!medidor) return; a.getByteTimeDomainData(muestras); ponerNivel(nivelDe(muestras)); };
        const k = setInterval(() => { if (!medidor) { clearInterval(k); return; } leerNivel(); }, 120);
      } catch { medidor = null; }
    };
    // Manda la grabación y espera el texto. → { texto } | { no: true } | { fallo } | null (se fue de la pantalla).
    const pasarATexto = async x => {
      const idioma = idiomaOral(usuario) === 'en' ? 'en' : 'es';
      let d;
      try {
        const r = await fetch(`/api/academia/oral/vivo/${encodeURIComponent(s.sesion)}/dictar?i=${encodeURIComponent(String(i))}&idioma=${idioma}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Oportia': '1', 'Content-Type': x.tipo }, body: x.blob });
        d = await r.json().catch(() => ({}));
        if (!r.ok) return { fallo: d?.error || 'desconocido', http: true };
      } catch { return { fallo: 'sin_red' }; }
      if (d.estado === 'no') return { no: true };
      if (d.estado !== 'pendiente' || typeof d.id !== 'string') return { fallo: 'desconocido' };
      for (let k = 0; k < 60; k++) { // ~50 s
        await new Promise(z => setTimeout(z, k < 4 ? 600 : 900));
        if (!caja.isConnected) return null;
        const g = await api('GET', `/api/academia/oral/vivo/${encodeURIComponent(s.sesion)}/dictar/${encodeURIComponent(d.id)}`);
        if (!g.ok) return { fallo: g.datos?.error || 'desconocido' };
        if (g.datos.estado === 'lista') return { texto: String(g.datos.texto ?? '') };
        if (g.datos.estado === 'no') return { fallo: g.datos.motivo || 'no' };
      }
      return { fallo: 'tiempo' };
    };
    const terminar = async () => {
      const g = grabacion;
      if (!g) return;
      grabacion = null;
      apagarVista();
      let x = null;
      try { x = await g.parar(); } catch { x = null; }
      if (!caja.isConnected) return;
      if (!x || x.ms < GRABAR.minMs || !x.blob.size) return ponerEstado('muy_corto');
      enviando = true;
      mic.disabled = true;
      ponerEstado('escribiendo');
      ex.poner('quieto');
      const r = await pasarATexto(x);
      enviando = false;
      if (!caja.isConnected || r == null) return;
      mic.disabled = caja.disabled;
      if (r.no) { prefs.grabar = false; return ponerEstado('grabar_no'); }
      if (r.fallo) {
        if (r.http && r.fallo === 'demasiados_intentos') { ponerEstado(null); return avisar(textoError(r.fallo), 'mal'); }
        return ponerEstado(r.fallo === 'sin_red' ? 'sin_red_grabar' : 'grabar_fallo');
      }
      if (!r.texto.trim()) return ponerEstado('grabar_vacio');
      caja.value = agregarTexto(caja.value, r.texto, 1200);
      ponerEstado('escrito');
      try { caja.focus({ preventScroll: true }); } catch { /* nada */ }
    };
    mic.addEventListener('click', () => {
      if (enviando) return;
      if (grabacion) { terminar(); return; }
      callar(); // nunca la voz del examinador y el micrófono a la vez
      let nueva = null;
      try {
        nueva = crearGrabacion({ medios: navigator.mediaDevices, Grabadora: window.MediaRecorder, alTope: () => { if (grabacion === nueva) terminar(); } });
      } catch { return ponerEstado('grabar_fallo'); }
      ponerEstado('pidiendo_permiso');
      // Dentro del toque: el iPhone solo da el micrófono así.
      nueva.empezar().then(() => {
        if (!caja.isConnected || caja.disabled || grabacion) { nueva.cancelar(); return; }
        grabacion = nueva;
        nueva.alSoltar = apagarVista; // al irse, pasar de pregunta o «No sé»: el reloj y las barritas también se apagan
        ponerEstado(null);
        mic.setAttribute('aria-pressed', 'true');
        mic.classList.add('grabando');
        estado.dataset.estado = 'grabando';
        ex.poner('escuchando');
        mostrarReloj(nueva);
        reloj = setInterval(() => { if (grabacion === nueva) mostrarReloj(nueva); }, 250);
        medir(nueva.flujo);
      }, err => { try { nueva.cancelar(); } catch { /* nada */ } ponerEstado(errorMicrofono(err)); });
    });
    return { ocupado: () => Boolean(grabacion) && !enviando, enviando: () => enviando, terminar };
  };
  // El cuadro de su respuesta: el dictado en vivo (que puede corregir) o lo que escribe.
  const respuesta = (alListo, i) => {
    const modo = modoDictado({ grabar: prefs.grabar, hayReconocimiento: puedeDictar() });
    const conVoz = prefs.dictar;
    const caja = el('textarea', { class: 'vivo-texto', rows: 4, maxlength: 1200, 'aria-label': t('vivo.tu_respuesta'), placeholder: conVoz ? t(modo === 'grabar' ? 'vivo.placeholder.grabar' : modo === 'teclado' ? 'vivo.placeholder.teclado' : 'vivo.placeholder.voz') : t('vivo.placeholder') });
    const estado = el('p', { class: 'vivo-estado', role: 'status', 'aria-live': 'polite' });
    const mic = conVoz ? el('button', { type: 'button', class: 'vivo-mic', 'aria-pressed': 'false', 'aria-label': t(prefs.grabar ? 'vivo.mic.grabar' : 'vivo.mic') }, icono('microfono', 'icono')) : null;
    // 0.14.50: las barritas de cuánto suena mientras graba (con data-nivel 0–4; el dibujo es del CSS).
    const nivel = prefs.grabar && mic ? el('span', { class: 'vivo-nivel', 'aria-hidden': 'true', 'data-nivel': '0' }, el('i'), el('i'), el('i'), el('i')) : null;
    // 0.14.50: sin ChatGPT, desde el principio y debajo del cuadro: cómo dictar con el teclado (lo que sí funciona).
    const pistaTeclado = modo !== 'grabar' ? el('p', { class: 'vivo-pista-teclado con-icono-chico' }, icono('microfono', 'icono chico'), el('span', { texto: t(pistaTecladoDe()) })) : null;
    // Abre el teclado (el cuadro) y resalta la pista: nunca «Escuchando…» sin texto.
    const usarTeclado = () => { try { caja.focus(); } catch { /* nada */ } pistaTeclado?.classList.add('resaltada'); ponerEstado(esMovilNavegador() ? 'teclado_movil' : 'teclado'); };
    caja.addEventListener('input', () => { if (!escucha) ex.poner('escuchando', 2500); });
    const ponerEstado = que => { if (que === 'escuchando') ex.poner('escuchando'); else if (que === 'pensando' || (!que && ex.estado() === 'escuchando')) ex.poner('quieto');
      estado.textContent = que ? t(`vivo.estado.${que}`) : ''; estado.dataset.estado = que || ''; mic?.setAttribute('aria-pressed', String(que === 'escuchando')); };
    // 0.14.50: con ChatGPT: grabar → parar → la app lo pasa a texto y se AGREGA al cuadro.
    const grabador = mic && prefs.grabar ? crearGrabador({ caja, mic, nivel, estado, ponerEstado, i }) : null;
    // 0.14.50: en el iPhone (y sin dictado en el navegador), el micrófono solo abre el teclado y muestra su 🎤.
    if (mic && modo === 'teclado') mic.addEventListener('click', () => { callar(); usarTeclado(); });
    if (mic && modo === 'navegador') {
      mic.addEventListener('click', () => {
        // 0.14.50: si lo paró sin que se escribiera nada, se le dice que use el micrófono del teclado.
        if (escucha) { const nada = !caja.value.trim(); parar(); if (nada) usarTeclado(); else ponerEstado(null); return; }
        callar(); // nunca la voz del examinador y el micrófono a la vez
        const R = Reconocimiento();
        // 0.14.34: el dictado no escribía en algunos navegadores. Safari (iPhone y Mac) se porta mejor con «continuous»
        // apagado y volviendo a empezar solo; Chrome corta tras un silencio: también se vuelve a empezar mientras el
        // botón siga encendido. Cada error dice su causa y qué hacer.
        const esSafari = typeof navigator !== 'undefined' && /safari/i.test(navigator.userAgent) && !/chrome|crios|android/i.test(navigator.userAgent);
        // 0.14.48: en el iPhone TODO es Safari por dentro (también Chrome y la app de la pantalla de inicio, que no dicen
        // «Safari»): igual que Safari.
        const esIos = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
        const dictado = crearDictado(caja.value, 1200);
        let reintentos = 0;
        let tramos = 0;
        // 0.14.36: si en ~6 s el navegador no recibió NADA de audio (sin permiso del sistema, micrófono equivocado), no se
        // queda «Escuchando…» para siempre: lo dice y para.
        let oyoAlgo = false;
        let huboTexto = false;
        let vigia = null;
        const empezar = () => {
          const r = new R();
          r.lang = idiomaOral(usuario) === 'en' ? 'en-US' : 'es-ES';
          r.continuous = !(esSafari || esIos);
          r.interimResults = true;
          r.maxAlternatives = 1;
          r.onaudiostart = () => { oyoAlgo = true; };
          r.onspeechstart = () => { oyoAlgo = true; };
          r.onsoundstart = () => { oyoAlgo = true; };
          r.onresult = ev => {
            // 0.14.48: al parar, el navegador todavía manda lo último que oyó: se escribe si el cuadro sigue abierto (no si
            // ya se mandó o si otro dictado empezó); sin cambiar el estado.
            if (escucha !== r) { if (!escucha && !caja.disabled && caja.isConnected) caja.value = dictado.resultado(ev); return; }
            oyoAlgo = true;
            reintentos = 0;
            caja.value = dictado.resultado(ev);
            // 0.14.50: «Escuchando…» solo cuando de verdad llega texto.
            if (hayTexto(ev)) { huboTexto = true; clearTimeout(vigia); if (estado.dataset.estado !== 'escuchando') ponerEstado('escuchando'); }
          };
          r.onerror = ev => {
            const e = ev?.error;
            if (e === 'no-speech' || e === 'aborted') return; // sigue escuchando (onend lo vuelve a empezar)
            if (escucha !== r) return;
            escucha = null;
            clearTimeout(vigia);
            dictado.fin();
            // 0.14.48: si el navegador no deja volver a empezar solo (fuera del toque), no es «sin permiso»: ya dictó;
            // se queda lo dicho y se toca el micrófono otra vez para seguir.
            if (tramos > 1 && (e === 'not-allowed' || e === 'service-not-allowed')) return ponerEstado(null);
            // 0.14.50: cualquier otro error: el dictado del teclado (lo que sí funciona).
            usarTeclado();
          };
          r.onend = () => {
            if (escucha !== r) return;
            dictado.fin(); // lo provisional queda (el texto a la vista no cambia)
            if (reintentos++ < 20) { try { empezar(); return; } catch { /* abajo */ } }
            escucha = null;
            if (!caja.value.trim()) usarTeclado(); else ponerEstado(null);
          };
          escucha = r;
          tramos++;
          r.start();
        };
        // Primero se pide el micrófono de verdad (así el navegador muestra su permiso y se sabe si el sistema lo bloquea);
        // después empieza el dictado.
        // 0.14.50: «Habla ahora» (no «Escuchando…»: eso solo cuando llega texto). Si en 6 s no llegó NADA de texto, se para
        // y se pasa al dictado del teclado (antes se quedaba «Escuchando…» sin escribir nada en el Mac).
        const arrancar = () => { try { empezar(); ponerEstado('habla'); vigia = setTimeout(() => { if (escucha && !huboTexto) { const r0 = escucha; escucha = null; try { r0.stop(); } catch { /* nada */ } dictado.fin(); usarTeclado(); } }, ESPERA_TEXTO_MS); } catch { clearTimeout(vigia); escucha = null; usarTeclado(); } };
        // 0.14.47: en el iPhone (Safari) el dictado SOLO arranca si empieza en el mismo toque (no después de pedir el
        // micrófono aparte): ahí se arranca directo y el propio dictado pide el permiso. En los demás, igual que antes.
        const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
        if (esSafari || esIos) arrancar();
        else if (md?.getUserMedia) {
          ponerEstado('pidiendo_permiso');
          md.getUserMedia({ audio: true }).then(flujo => {
            try { flujo.getTracks().forEach(p => p.stop()); } catch { /* nada */ }
            arrancar();
          }, () => {
            clearTimeout(vigia);
            usarTeclado(); // 0.14.50: sin micrófono para el navegador: el del teclado
          });
        } else arrancar();
      });
    }
    // 0.14.40: nunca se manda vacío por error (antes salía «Mal» sin decir nada); para no saber está «No sé».
    const listo = botonGrande(t('vivo.listo'), () => { if (grabador?.ocupado()) { grabador.terminar(); return; } parar(); if (!caja.value.trim()) { ponerEstado('vacio'); caja.focus(); return; } alListo(caja.value.trim(), ponerEstado); }, { sonido: null });
    // Un solo botón claro abajo («Enviar»); «No sé» es un enlace chico dentro de su burbuja.
    const noSe = el('button', { type: 'button', class: 'vivo-no-se', onclick: () => { if (grabador?.enviando()) return; parar(); alListo('', ponerEstado); } }, el('span', { texto: t('vivo.no_se') }));
    const nodo = el('div', { class: 'vivo-fila alumno' },
      el('div', { class: 'vivo-burbuja tuya' }, el('p', { class: 'vivo-quien', texto: t('vivo.tu') }), caja, pistaTeclado,
        el('div', { class: 'vivo-controles' }, mic, nivel, estado, noSe)));
    // 0.14.48: si el envío falla (sin red en el teléfono, «Demasiados intentos»…), todo vuelve a funcionar: antes solo el
    // cuadro, y «Enviar», «No sé» y el micrófono quedaban apagados (no se podía seguir a la otra pregunta).
    const habilitar = si => { caja.disabled = !si; if (mic) mic.disabled = !si || Boolean(grabador?.enviando()); listo.disabled = !si; noSe.disabled = !si; };
    return { nodo, botones: [listo], caja, desactivar: () => habilitar(false), activar: () => habilitar(true) };
  };
  const chipVeredicto = (v, linea) => el('div', { class: `vivo-veredicto tono-${v}` },
    el('span', { class: 'vivo-veredicto-icono', 'aria-hidden': 'true' }, icono(v === 'bien' ? 'bien' : v === 'casi' ? 'atencion' : 'mal', 'icono')),
    el('strong', { texto: t(`vivo.v.${v}`) }), linea ? talCual('span', linea, 'vivo-linea') : null);

  // Espera el veredicto (la IA). → { estado, veredicto, linea, repregunta } o { estado: 'sin_ia' }.
  const esperar = async i => {
    for (let k = 0; k < 120; k++) { // 0.14.35: hasta ~4 min (el trabajador puede estar en un paso largo de la mejora con Claude)
      await new Promise(r => setTimeout(r, k < 3 ? 1200 : 2000));
      if (!zona.isConnected) return null;
      const r = await api('GET', `/api/academia/oral/vivo/${encodeURIComponent(s.sesion)}/${i}`);
      if (!r.ok) return { estado: 'sin_ia' };
      if (r.datos.estado !== 'pendiente') return r.datos;
    }
    return { estado: 'sin_ia' };
  };
  const mandar = async (i, texto, seguimiento, ponerEstado) => {
    ponerEstado('pensando');
    const r = await api('POST', '/api/academia/oral/vivo/responder', { sesion: s.sesion, i, texto, seguimiento });
    if (!r.ok) { ponerEstado(null); avisar(textoError(r.datos.error), 'mal'); return null; }
    const x = r.datos.estado === 'pendiente' ? await esperar(i) : r.datos;
    ponerEstado(null);
    return x;
  };

  const pintar = i => {
    parar();
    barra.poner(i, s.preguntas.length);
    actualI = i;
    if (i >= s.preguntas.length) return terminar();
    cuenta.textContent = t('acad.de', { n: numero(i + 1), total: numero(s.preguntas.length) });
    const q = s.preguntas[i];
    const chat = el('div', { class: 'vivo-chat', 'aria-live': 'polite' });
    const siguiente = () => botonGrande(i + 1 >= s.preguntas.length ? t('vivo.terminar') : t('vivo.siguiente'), () => { pintar(i + 1); window.scrollTo(0, 0); }, { tono: 'azul' });
    const turno = seguimiento => {
      const r = respuesta(async (texto, ponerEstado) => {
        r.desactivar();
        const x = await mandar(i, texto, seguimiento, ponerEstado);
        if (!x) { r.activar(); return; }
        if (x.estado === 'lista') {
          sonar(x.veredicto === 'bien' ? 'bien' : x.veredicto === 'mal' ? 'mal' : 'toque');
          // 0.14.40: lo que dijo (corto) y el porqué en una línea, aunque la IA no haya mandado línea.
          const dijo = r.caja.value.trim();
          if (dijo) chat.append(el('p', { class: 'vivo-dijiste suave chica' }, el('strong', { texto: t('vivo.dijiste') }), el('span', { texto: ' «' + (dijo.length > 160 ? dijo.slice(0, 157) + '…' : dijo) + '»' })));
          chat.append(chipVeredicto(x.veredicto, x.linea || t(dijo ? 'vivo.sin_linea.' + x.veredicto : 'vivo.sin_linea.vacio')));
          // 0.14.42: sin IA, lo calificó la app con las ideas clave del libro.
          // 0.14.51: … o con lo que aprendió de la IA (las respuestas que ya calificó la IA).
          if (x.sistema) chat.append(el('p', { class: 'suave chica', texto: t(x.aprendido ? 'vivo.califico_aprendido' : 'vivo.califico_sistema') }));
          ex.poner(x.veredicto, 3200);
          if (x.repregunta && !seguimiento) {
            const decir = () => ({ texto: x.repregunta, lang: 'es-ES' });
            chat.append(burbujaExaminador(talCual('p', x.repregunta, 'vivo-pregunta'), decir));
            if (prefs.voz) leer(x.repregunta, 'es-ES');
            return turno(true);
          }
        } else chat.append(el('div', { class: 'vivo-veredicto tono-anotado' }, icono('lapiz', 'icono'), el('span', { texto: t('vivo.anotado') + ' ' + t('vivo.anotado_porque') })));
        // 0.14.43: «¿Por qué?»: lo que dijo bien, lo que faltó y la respuesta del libro (solo ya calificada).
        if (x.estado === 'lista') {
          const caja = el('div', { class: 'vivo-porque' });
          const btn = el('button', { type: 'button', class: 'vivo-repetir con-icono-chico' }, icono('bombilla', 'icono chico'), el('span', { texto: t('vivo.porque') }));
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            const p = await api('GET', `/api/academia/oral/vivo/${encodeURIComponent(s.sesion)}/${i}/porque`);
            if (!p.ok) { btn.disabled = false; return avisar(textoError(p.datos.error), 'mal'); }
            const d = p.datos;
            btn.remove();
            const partes = [
              d.bienDicho ? el('p', {}, el('strong', { texto: t('vivo.porque.bien') + ' ' }), talCual('span', d.bienDicho)) : null,
              d.falto ? el('p', {}, el('strong', { texto: t('vivo.porque.falto') + ' ' }), talCual('span', d.falto)) : null,
              (d.respuesta_es || d.respuesta_en) ? el('p', {}, el('strong', { texto: t('vivo.porque.libro') + ' ' }), talCual('span', d.respuesta_es || d.respuesta_en)) : null,
              d.pagina ? el('p', { class: 'suave chica', texto: t('vivo.porque.pagina', { n: String(d.pagina) }) }) : null];
            caja.append(...partes.filter(Boolean));
          });
          caja.append(btn);
          chat.append(caja);
        }
        pie.replaceChildren(siguiente());
      }, i);
      chat.append(r.nodo);
      pie.replaceChildren(...r.botones);
      r.caja.focus({ preventScroll: true });
    };
    const decir = () => textoPregunta(q);
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta vivo-tarjeta' },
      el('div', { class: 'q-cabeza' }, el('div', { class: 'insignia-pregunta oral' }, icono('microfono', 'icono chico'), el('span', { texto: t('vivo.titulo') })), talCual('span', q.temaTitulo, 'q-seccion')),
      selectorIdioma(h),
      escenario,
      chat));
    ex.poner('quieto');
    chat.append(burbujaExaminador(el('div', {}, bilingue(h, 'p', q.pregunta_es, q.pregunta_en, 'vivo-pregunta')), decir, () => leerPregunta(i, decir)));
    leerPregunta(i, decir);
    turno(false);
  };

  // ---------- El final ----------
  const terminar = async (auto = undefined) => {
    parar();
    cuenta.textContent = '';
    zona.replaceChildren(el('p', { class: 'vivo-estado', 'data-estado': 'pensando', texto: t('vivo.estado.calculando') }));
    pie.replaceChildren();
    const r = await api('POST', '/api/academia/oral/vivo/terminar', { sesion: s.sesion, ...(auto ? { auto } : {}) });
    // 0.14.48: si falla (sin red en el teléfono…), no se queda en «Calculando…» sin botones: se puede volver a intentar.
    if (!r.ok) {
      avisar(textoError(r.datos.error), 'mal');
      zona.replaceChildren(el('p', { class: 'vivo-estado', role: 'status', texto: textoError(r.datos.error) }));
      return pie.replaceChildren(botonGrande(t('vivo.reintentar'), () => terminar(auto), { tono: 'azul' }));
    }
    if (!r.datos.cerrada) return calificarse(r.datos);
    repaso(r.datos, prefs, h, { zona, pie, sesion: s.sesion, materia: s.materia });
  };
  // Sin la IA: el repaso de las que faltan con la respuesta del libro; él se califica (con la sugerencia de la app).
  const calificarse = x => {
    const notas = {};
    const items = x.revision.filter(q => x.pendientes.includes(q.i));
    const ver = el('button', { type: 'button', class: 'boton-3d grande naranja', disabled: true, onclick: () => terminar(notas) }, el('span', { texto: t('vivo.ver_resultado') }));
    const revisar = () => { ver.disabled = items.some(q => !notas[q.i]); };
    zona.replaceChildren(el('section', { class: 'panel vivo-auto' },
      el('h1', { class: 'titulo-grande', texto: t('vivo.auto.titulo') }),
      el('p', { class: 'bajada', texto: t('vivo.auto.linea') }),
      selectorIdioma(h),
      el('ol', { class: 'vivo-revision-lista' }, items.map(q => {
        const botones = ['bien', 'casi', 'mal'].map(v => el('button', { type: 'button', class: `vivo-chip tono-${v}`, 'aria-pressed': 'false', 'data-v': v,
          onclick: () => { notas[q.i] = v; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.v === v)); revisar(); } }, el('span', { texto: t(`vivo.v.${v}`) })));
        if (q.sugerida) { notas[q.i] = q.sugerida.veredicto; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.v === q.sugerida.veredicto)); }
        return el('li', { class: 'vivo-item' },
          bilingue(h, 'p', q.pregunta_es, q.pregunta_en, 'fuerte'),
          el('p', { class: 'oral-qa-etiqueta', texto: t('vivo.dijiste') }), q.dijo ? talCual('p', q.dijo, 'vivo-dijo') : el('p', { class: 'suave', texto: t('vivo.en_blanco') }),
          el('p', { class: 'oral-qa-etiqueta', texto: t('vivo.respuesta_libro') }), bilingue(h, 'p', q.respuesta_es, q.respuesta_en, 'oral-qa-respuesta'),
          q.sugerida ? el('p', { class: 'suave chica', texto: t('vivo.sugerida', { v: t(`vivo.v.${q.sugerida.veredicto}`), faltan: q.sugerida.faltan.join(', ') || '—' }) }) : null,
          el('div', { class: 'vivo-chips', role: 'group', 'aria-label': t('vivo.auto.como') }, botones));
      }))));
    revisar();
    pie.replaceChildren(ver);
    window.scrollTo(0, 0);
  };
  mostrar(raiz);
  pintar(desde);
}

// El repaso del final: como el examen final.
export function repaso(x, prefs, h, { zona, pie, sesion, materia }) {
  const { el, t, numero, icono, talCual, api, sonar, celebrar, avisar, textoError } = h;
  const r = x.resumen;
  sonar(r.aprobado ? 'bien' : 'mal');
  const comparacion = c => el('span', { class: `insignia chica tono-${c === 'mejoro' || c === 'sigue_bien' ? 'bien' : c === 'nuevo' ? 'info' : 'atencion'}`, texto: t(`vivo.comp.${c}`) });
  const reforzar = r.reforzar.length ? r.reforzar.map(x => x.titulo).join(', ') : null;
  const recomendacion = r.aprobado
    ? (reforzar ? t('vivo.rec.listo_pero', { temas: reforzar }) : t('vivo.rec.listo'))
    : t('vivo.rec.estudia', { temas: reforzar ?? '—' });
  const instructor = el('section', { class: 'panel vivo-instructor', 'aria-live': 'polite' });
  const pintarCierre = c => {
    if (!c || c.estado === 'no') return instructor.remove();
    if (c.estado === 'pendiente') return instructor.replaceChildren(el('p', { class: 'vivo-estado', 'data-estado': 'pensando', texto: t('vivo.estado.instructor') }));
    const titulo = id => r.temas.find(x => x.id === id)?.titulo ?? '';
    poner(instructor,
      el('h2', { class: 'con-icono' }, icono('radio'), el('span', { texto: t('vivo.instructor') })),
      talCual('p', c.mensaje, 'vivo-mensaje'),
      c.temas?.length ? el('ul', { class: 'lista-simple' }, c.temas.map(x => el('li', {}, el('strong', { texto: `${titulo(x.id)}: ` }), talCual('span', x.comentario)))) : null,
      c.listoPorque ? talCual('p', c.listoPorque, 'suave chica') : null);
  };
  poner(zona,
    el('section', { class: `resultado-vuelo ${r.aprobado ? 'bien' : 'mal'}` },
      el('h1', { class: 'titulo-grande', texto: r.aprobado ? t('vivo.aprobado') : t('vivo.no_aprobado') }),
      el('p', { class: 'bajada', texto: t('vivo.nota', { pct: numero(r.pct), n: numero(r.umbral), bien: numero(r.bien), casi: numero(r.casi), mal: numero(r.mal) }) }),
      r.antes ? el('p', { class: 'suave chica', texto: t('vivo.nota_antes', { ultima: numero(r.antes.ultima ?? 0), mejor: numero(r.antes.mejor ?? 0) }) }) : null),
    el('section', { class: `panel vivo-listo ${r.listo ? 'listo' : 'todavia'}` },
      el('h2', { texto: t('vivo.listo.titulo') }),
      el('p', { class: `insignia grande tono-${r.listo ? 'bien' : 'atencion'}`, texto: r.listo ? t('vivo.listo.si') : t('vivo.listo.no') }),
      el('p', { texto: t(`vivo.razon.${r.listoRazon}`) }),
      el('p', { class: 'vivo-recomendacion', texto: recomendacion })),
    instructor,
    el('section', { class: 'panel vivo-temas' },
      el('h2', { texto: t('vivo.por_tema') }),
      el('ul', { class: 'vivo-temas-lista' }, r.temas.map(x => el('li', { class: x.pct >= r.umbral ? 'bien' : 'mal' },
        el('span', { class: 'vivo-tema-nombre', texto: x.titulo }),
        el('span', { class: 'suave chica', texto: t('vivo.tema.linea', { pct: numero(x.pct), bien: numero(x.bien), casi: numero(x.casi), mal: numero(x.mal) }) }),
        comparacion(x.comparacion))))),
    r.reforzar.length ? el('section', { class: 'panel vivo-reforzar' },
      el('h2', { texto: t('vivo.reforzar') }),
      el('p', { class: 'suave chica', texto: t('vivo.reforzar.linea') }),
      el('div', { class: 'vivo-botones-temas' }, r.reforzar.map(x => el('a', { class: 'boton-3d blanco chico con-icono', href: `#oral/tema/${encodeURIComponent(x.materia)}/${encodeURIComponent(x.tema)}` }, icono('libro', 'icono chico'), el('span', { texto: x.titulo }))))) : null,
    el('section', { class: 'panel vivo-revision' },
      el('h2', { texto: t('oral.revision') }),
      selectorIdioma(h),
      el('ol', { class: 'vivo-revision-lista' }, x.revision.map(q => el('li', { class: `vivo-item ${q.veredicto ?? 'mal'}` },
        el('p', { class: 'vivo-item-cabeza' }, el('span', { class: `insignia chica tono-${q.veredicto ?? 'mal'}`, texto: t(`vivo.v.${q.veredicto ?? 'mal'}`) }), talCual('span', q.temaTitulo, 'suave chica')),
        bilingue(h, 'p', q.pregunta_es, q.pregunta_en, 'fuerte'),
        el('p', { class: 'oral-qa-etiqueta', texto: t('vivo.dijiste') }), q.dijo ? talCual('p', q.dijo, 'vivo-dijo') : el('p', { class: 'suave', texto: t('vivo.en_blanco') }),
        q.repregunta ? el('p', { class: 'chica' }, el('strong', { texto: `${t('vivo.repregunta')} ` }), talCual('span', q.repregunta)) : null,
        q.dijoSeguimiento ? talCual('p', q.dijoSeguimiento, 'vivo-dijo') : null,
        q.bienDicho ? el('p', { class: 'chica' }, el('strong', { texto: `${t('vivo.bien_dicho')} ` }), talCual('span', q.bienDicho)) : null,
        q.falto ? el('p', { class: 'chica' }, el('strong', { texto: `${t('vivo.falto')} ` }), talCual('span', q.falto)) : null,
        el('details', { class: 'oral-origen' },
          el('summary', { class: 'con-icono' }, icono('libro', 'icono chico'), el('span', { texto: t('vivo.respuesta_libro') })),
          bilingue(h, 'p', q.respuesta_es, q.respuesta_en, 'oral-qa-respuesta')))))));
  pintarCierre(r.cierre);
  if (r.cierre?.estado === 'pendiente') {
    (async () => {
      for (let k = 0; k < 40 && zona.isConnected; k++) {
        await new Promise(z => setTimeout(z, 2000));
        const c = await api('GET', `/api/academia/oral/vivo/${encodeURIComponent(sesion)}/cierre`);
        if (!c.ok || c.datos.estado !== 'pendiente') { pintarCierre(c.ok ? c.datos : null); return; }
      }
      pintarCierre(null);
    })();
  }
  pie.classList.add('apilados');
  pie.replaceChildren(
    el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: async e => {
      despertarVoz();
      // 0.14.48: el botón se guarda ANTES de esperar (después del await, e.currentTarget ya es null y fallaba).
      const b = e.currentTarget;
      b.disabled = true;
      const n = await api('POST', '/api/academia/oral/vivo', { materia: materia ?? null, n: r.total });
      if (!n.ok) { b.disabled = false; return avisar(textoError(n.datos.error), 'mal'); }
      pie.classList.remove('apilados');
      practica(n.datos, { ...prefs }, h, 0);
    } }, el('span', { texto: t('vivo.repetir_practica') })),
    el('a', { class: 'boton-3d blanco', href: '#oral' }, el('span', { texto: t('oral.volver') })));
  if (r.aprobado) celebrar(zona);
  window.scrollTo(0, 0);
}
