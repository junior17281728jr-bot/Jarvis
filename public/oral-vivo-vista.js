// Academia 0.14.29 (pedido del dueño): la «Práctica en vivo» del examen oral (solo se carga en #oral/vivo). Como el
// checkride: el examinador hace UNA pregunta a la vez (se puede leer en voz alta con la voz del navegador), el alumno
// responde hablando (el dictado del navegador) o escribiendo, y al momento solo ve «Bien / Casi / Mal» con una línea. Al
// final, el repaso como en el examen final: «Aprobado / No aprobado», tema por tema con la comparación con las veces
// anteriores, qué reforzar, «¿Listo para el examen real?», el mensaje del instructor y cada pregunta con la respuesta del
// libro.
//  - Privacidad: el audio nunca sale del navegador (solo lo que haga el servicio de voz del propio navegador); al
//    servidor va solo el TEXTO.
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
  let dictar = leerAjuste(usuario, 'dictar', true) && puedeDictar();
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
    practica(r.datos, { voz, dictar, natural, umbral: d.umbral, guardarVoz: v => guardarAjuste(usuario, 'voz', v) }, h, 0);
  };
  const seguir = d.abierta ? el('button', { type: 'button', class: 'boton-3d blanco', onclick: async e => {
    despertarVoz();
    e.currentTarget.disabled = true;
    const r = await api('GET', `/api/academia/oral/vivo/${encodeURIComponent(d.abierta.sesion)}`);
    if (!r.ok) return avisar(textoError(r.datos.error), 'mal');
    const hechas = new Set(r.datos.respondidas);
    // Terminada (falta calificarse): directo al repaso del final.
    const desde = r.datos.terminada ? -1 : r.datos.preguntas.findIndex(q => !hechas.has(q.i));
    practica(r.datos, { voz, dictar, natural, umbral: d.umbral, guardarVoz: v => guardarAjuste(usuario, 'voz', v) }, h, desde < 0 ? r.datos.preguntas.length : desde);
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
        interruptor(t('vivo.dictar'), dictar, puedeDictar(), v => { dictar = v; guardarAjuste(usuario, 'dictar', v); }, puedeDictar() ? t('vivo.dictar.nota') : t('vivo.dictar.no_hay')),
        el('label', { class: 'vivo-campo' }, el('strong', { texto: t('vivo.capitulo') }), capitulo),
        el('div', { class: 'vivo-campo' }, el('strong', { texto: t('vivo.cuantas') }), el('div', { class: 'vivo-chips', role: 'group', 'aria-label': t('vivo.cuantas') }, chips))),
      el('p', { class: 'suave chica vivo-privacidad con-icono-chico' }, icono('escudo', 'icono chico'), el('span', { texto: t('vivo.privacidad') })),
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
  // El examinador (uno para toda la práctica): habla, escucha y reacciona.
  const ex = crearExaminador({ etiqueta: t('vivo.examinador') });
  const escenario = el('div', { class: 'vivo-escenario' }, ex.nodo);
  alHablar = si => ex.poner(si ? 'hablando' : 'quieto');
  const parar = () => { try { escucha?.stop(); } catch { /* nada */ } escucha = null; callar(); };
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

  // El cuadro de su respuesta: el dictado en vivo (que puede corregir) o lo que escribe.
  const respuesta = alListo => {
    const caja = el('textarea', { class: 'vivo-texto', rows: 4, maxlength: 1200, 'aria-label': t('vivo.tu_respuesta'), placeholder: prefs.dictar ? t('vivo.placeholder.voz') : t('vivo.placeholder') });
    const estado = el('p', { class: 'vivo-estado', role: 'status', 'aria-live': 'polite' });
    const mic = prefs.dictar ? el('button', { type: 'button', class: 'vivo-mic', 'aria-pressed': 'false', 'aria-label': t('vivo.mic') }, icono('microfono', 'icono')) : null;
    let base = '';
    caja.addEventListener('input', () => { if (!escucha) ex.poner('escuchando', 2500); });
    const ponerEstado = que => { if (que === 'escuchando') ex.poner('escuchando'); else if (que === 'pensando' || (!que && ex.estado() === 'escuchando')) ex.poner('quieto');
      estado.textContent = que ? t(`vivo.estado.${que}`) : ''; estado.dataset.estado = que || ''; mic?.setAttribute('aria-pressed', String(que === 'escuchando')); };
    if (mic) {
      mic.addEventListener('click', () => {
        if (escucha) { parar(); ponerEstado(null); return; }
        callar(); // nunca la voz del examinador y el micrófono a la vez
        const R = Reconocimiento();
        // 0.14.34: el dictado no escribía en algunos navegadores. Safari (iPhone y Mac) se porta mejor con «continuous»
        // apagado y volviendo a empezar solo; Chrome corta tras un silencio: también se vuelve a empezar mientras el
        // botón siga encendido. Cada error dice su causa y qué hacer.
        const esSafari = typeof navigator !== 'undefined' && /safari/i.test(navigator.userAgent) && !/chrome|crios|android/i.test(navigator.userAgent);
        base = caja.value ? `${caja.value.trim()} ` : '';
        let fijoTotal = '';
        let reintentos = 0;
        const empezar = () => {
          const r = new R();
          r.lang = idiomaOral(usuario) === 'en' ? 'en-US' : 'es-ES';
          r.continuous = !esSafari;
          r.interimResults = true;
          r.maxAlternatives = 1;
          r.onresult = ev => {
            reintentos = 0;
            let fijo = '';
            let provisional = '';
            for (let k = ev.resultIndex ?? 0; k < ev.results.length; k++) { const x = ev.results[k]; if (x.isFinal) fijo += x[0].transcript; else provisional += x[0].transcript; }
            if (fijo) fijoTotal = `${fijoTotal}${fijoTotal && !/\s$/.test(fijoTotal) ? ' ' : ''}${fijo.trim()}`;
            caja.value = `${base}${fijoTotal}${provisional ? ` ${provisional}` : ''}`.slice(0, 1200);
          };
          r.onerror = ev => {
            const e = ev?.error;
            if (e === 'no-speech' || e === 'aborted') return; // sigue escuchando (onend lo vuelve a empezar)
            escucha = null;
            ponerEstado(e === 'not-allowed' || e === 'service-not-allowed' ? 'sin_permiso'
              : e === 'audio-capture' ? 'sin_micro' : e === 'network' ? 'sin_red' : e === 'language-not-supported' ? 'sin_idioma' : 'no_oyo');
          };
          r.onend = () => {
            if (escucha !== r) return;
            if (reintentos++ < 20) { try { empezar(); return; } catch { /* abajo */ } }
            escucha = null; ponerEstado(null);
          };
          escucha = r;
          r.start();
        };
        try { empezar(); ponerEstado('escuchando'); } catch { escucha = null; ponerEstado('no_oyo'); }
      });
    }
    const listo = botonGrande(t('vivo.listo'), () => { parar(); alListo(caja.value.trim(), ponerEstado); }, { sonido: null });
    // Un solo botón claro abajo («Enviar»); «No sé» es un enlace chico dentro de su burbuja.
    const noSe = el('button', { type: 'button', class: 'vivo-no-se', onclick: () => { parar(); alListo('', ponerEstado); } }, el('span', { texto: t('vivo.no_se') }));
    const nodo = el('div', { class: 'vivo-fila alumno' },
      el('div', { class: 'vivo-burbuja tuya' }, el('p', { class: 'vivo-quien', texto: t('vivo.tu') }), caja,
        el('div', { class: 'vivo-controles' }, mic, estado, noSe)));
    return { nodo, botones: [listo], caja, desactivar: () => { caja.disabled = true; if (mic) mic.disabled = true; listo.disabled = true; noSe.disabled = true; } };
  };
  const chipVeredicto = (v, linea) => el('div', { class: `vivo-veredicto tono-${v}` },
    el('span', { class: 'vivo-veredicto-icono', 'aria-hidden': 'true' }, icono(v === 'bien' ? 'bien' : v === 'casi' ? 'atencion' : 'mal', 'icono')),
    el('strong', { texto: t(`vivo.v.${v}`) }), linea ? talCual('span', linea, 'vivo-linea') : null);

  // Espera el veredicto (la IA). → { estado, veredicto, linea, repregunta } o { estado: 'sin_ia' }.
  const esperar = async i => {
    for (let k = 0; k < 45; k++) {
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
        if (!x) { r.caja.disabled = false; return; }
        if (x.estado === 'lista') {
          sonar(x.veredicto === 'bien' ? 'bien' : x.veredicto === 'mal' ? 'mal' : 'toque');
          chat.append(chipVeredicto(x.veredicto, x.linea));
          ex.poner(x.veredicto, 3200);
          if (x.repregunta && !seguimiento) {
            const decir = () => ({ texto: x.repregunta, lang: 'es-ES' });
            chat.append(burbujaExaminador(talCual('p', x.repregunta, 'vivo-pregunta'), decir));
            if (prefs.voz) leer(x.repregunta, 'es-ES');
            return turno(true);
          }
        } else chat.append(el('div', { class: 'vivo-veredicto tono-anotado' }, icono('lapiz', 'icono'), el('span', { texto: t('vivo.anotado') })));
        pie.replaceChildren(siguiente());
      });
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
    if (!r.ok) return avisar(textoError(r.datos.error), 'mal');
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
      e.currentTarget.disabled = true;
      const n = await api('POST', '/api/academia/oral/vivo', { materia: materia ?? null, n: r.total });
      if (!n.ok) { e.currentTarget.disabled = false; return avisar(textoError(n.datos.error), 'mal'); }
      pie.classList.remove('apilados');
      practica(n.datos, { ...prefs }, h, 0);
    } }, el('span', { texto: t('vivo.repetir_practica') })),
    el('a', { class: 'boton-3d blanco', href: '#oral' }, el('span', { texto: t('oral.volver') })));
  if (r.aprobado) celebrar(zona);
  window.scrollTo(0, 0);
}
