// Academia 0.14.116 (lo pidió el dueño): «Responder con mis palabras» en el oral del Repaso final («Examen oral: todo lo
// que te pueden preguntar»). Además de «Ver respuesta» y «La sabía / No la sabía»: el alumno escribe (o dicta) su
// respuesta, la IA la compara con el libro (src/api/oral-vivo.js) y le dice cómo le fue; después marca él.
//  - El cuadro para responder, con el micrófono que GRABA y Whisper lo pasa a texto EN su equipo (public/voz-dictado.js,
//    el mismo de la «Práctica en vivo»; el audio no sale del navegador). Sin Whisper en ese navegador: solo se escribe
//    (el teclado del teléfono trae su propio dictado).
//  - Esperar lo de la IA tiene un tope (ESPERA_PALABRAS): nunca se queda «revisando» para siempre.
// Todo con h.el (nunca texto como código) y clases (nunca estilos escritos); los textos, de public/i18n.

export const ESPERA_PALABRAS = Object.freeze({ cadaMs: 1500, maxMs: 45_000 });
export const LETRAS_PALABRAS = 1200;
// ¿La corrección con IA está para él ahora? (GET /api/academia/repaso-final/oral/ia). Sin saberlo: no (desactivada).
export const iaDisponible = ia => ia?.disponible === true;
// Lo que se le sugiere marcar: «La sabía» solo si la IA dijo «bien» (él decide).
export const sugeridaDe = veredicto => veredicto === 'bien';
// Lo que se lee en voz alta de lo que dijo la IA (en «Tú controlas»): el veredicto con la idea clave, lo que dijo bien y lo
// que faltó. Es algo suyo: el servidor nunca lo graba (va con la voz del teléfono).
export function piezasDevolucion(dev, t) {
  if (!dev) return [];
  const p = [];
  const cabeza = [t(`rf.pal.veredicto.${dev.veredicto}`), dev.idea].filter(Boolean).join('. ');
  if (cabeza) p.push({ texto: cabeza, lang: 'es' });
  if (dev.bien) p.push({ texto: `${t('rf.pal.bien')}: ${dev.bien}`, lang: 'es' });
  if (dev.falto) p.push({ texto: `${t('rf.pal.falto')}: ${dev.falto}`, lang: 'es' });
  return p;
}

// Manda la respuesta y espera lo de la IA. → { estado: 'lista', … } | { estado: 'sin_ia', motivo } | null (se fue).
// vigente(): si ya pasó a otra tarjeta o salió de la pantalla, deja de preguntar. El tope es de reloj (reloj.poner): ni un
// pedido que no contesta (los POST no tienen el corte de 25 s de las lecturas) lo deja esperando más de unos 45 s.
const RELOJ = { poner: (f, ms) => setTimeout(f, ms), quitar: id => clearTimeout(id) };
export async function pedirDevolucion({ api, tarjeta, texto, vigente = () => true, reloj = RELOJ, esperar = ms => new Promise(ok => reloj.poner(ok, ms)), espera = ESPERA_PALABRAS }) {
  const sinIa = motivo => ({ estado: 'sin_ia', motivo });
  let fuera = false;
  const sigue = () => !fuera && vigente();
  const trabajo = (async () => {
    let r;
    try { r = await api('POST', '/api/academia/repaso-final/oral/palabras', { tarjeta, texto }); } catch { return sinIa('sin_red'); }
    if (!sigue()) return null;
    if (!r?.ok) return r?.datos?.error === 'demasiados_intentos' ? { estado: 'error', error: r.datos.error } : sinIa(r?.datos?.error ?? 'no_disponible');
    for (let pasado = 0; r.datos?.estado === 'pendiente'; pasado += espera.cadaMs) {
      if (pasado >= espera.maxMs) return sinIa('tiempo');
      await esperar(espera.cadaMs);
      if (!sigue()) return null;
      try { r = await api('POST', '/api/academia/repaso-final/oral/palabras/ver', { tarjeta, texto }); } catch { return sinIa('sin_red'); }
      if (!sigue()) return null;
      if (!r?.ok) return sinIa(r?.datos?.error ?? 'no_disponible');
    }
    return r.datos?.estado === 'lista' ? r.datos : sinIa(r.datos?.motivo ?? 'no_disponible');
  })();
  let id = null;
  const tope = new Promise(ok => { id = reloj.poner(() => ok(sinIa('tiempo')), espera.maxMs + espera.cadaMs); });
  const r = await Promise.race([trabajo, tope]);
  fuera = true;
  reloj.quitar(id);
  return vigente() ? r : null;
}

// Los módulos del dictado (se cargan al abrir el cuadro, no al tocar el micrófono: el iPhone pide el micrófono DENTRO del
// toque, sin esperar nada antes).
const cargarDictado = () => Promise.all([import('./voz-dictado.js'), import('./oral-vivo-vista.js')])
  .then(([d, v]) => ({ ...d, crearGrabacion: v.crearGrabacion, AUDIO_WHISPER: v.AUDIO_WHISPER, GRABAR: v.GRABAR, agregarTexto: v.agregarTexto, errorMicrofono: v.errorMicrofono, relojGrabacion: v.relojGrabacion }));

// El cuadro para responder: «Tu respuesta», el texto y (si Whisper puede en este navegador) el micrófono.
// → { nodo, valor(), enfocar(), bloquear(si), soltar() }.
export function cajaPalabras(h, { idioma = 'es', alCallar = null } = {}) {
  const { el, t, icono, api } = h;
  const caja = el('textarea', { class: 'rf-pal-texto', rows: 3, maxlength: LETRAS_PALABRAS, 'aria-label': t('rf.pal.tu_respuesta'), placeholder: t('rf.pal.placeholder') });
  const estado = el('p', { class: 'rf-pal-estado suave chica', role: 'status', 'aria-live': 'polite' });
  const mic = el('button', { type: 'button', class: 'rf-pal-mic', 'aria-pressed': 'false', 'aria-label': t('vivo.mic.grabar'), hidden: true }, icono('microfono', 'icono'));
  const decir = (clave, vars) => { estado.textContent = clave ? t(clave, vars) : ''; };
  let m = null; // los módulos del dictado
  let whisper = null;
  let grabacion = null;
  let ocupado = false;
  let relojVista = null;
  let vivo = true;
  const apagarVista = () => { clearInterval(relojVista); relojVista = null; mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('grabando'); };
  (h.cargarDictado ?? cargarDictado)().then(x => {
    if (!vivo || !x || typeof x.puedeWhisper !== 'function' || !x.puedeWhisper()) return;
    m = x;
    whisper = m.whisperDeLaPagina(async () => { const r = await api('GET', '/api/academia/voz/estado'); return r.ok ? r.datos : null; });
    if (!whisper.listo) { try { m.precargaDeLaPagina().alOral(); } catch { /* nada */ } }
    mic.hidden = false;
  }, () => {});
  const terminar = async () => {
    const g = grabacion;
    if (!g) return;
    grabacion = null;
    apagarVista();
    let x = null;
    try { x = await g.parar(); } catch { x = null; }
    if (!vivo) return;
    if (!x || x.ms < m.GRABAR.minMs || !x.blob.size) return decir('vivo.estado.muy_corto');
    ocupado = true;
    mic.disabled = true;
    decir('vivo.estado.escribiendo');
    const r = await m.textoDelTurno({ whisper, audio: () => m.audioDeGrabacion(x.blob), idioma, antes: () => m.precargaDeLaPagina().apurar() });
    ocupado = false;
    if (!vivo) return;
    mic.disabled = caja.disabled;
    if (r.fallo) return decir(r.fallo === 'sin_red' ? 'vivo.estado.sin_red_grabar' : r.fallo === 'equipo' ? 'vivo.estado.dictado_no' : 'vivo.estado.grabar_fallo');
    if (!String(r.texto ?? '').trim()) return decir('vivo.estado.grabar_vacio');
    caja.value = m.agregarTexto(caja.value, r.texto, LETRAS_PALABRAS);
    decir('rf.pal.escrito');
    try { caja.focus({ preventScroll: true }); } catch { /* nada */ }
  };
  mic.addEventListener('click', () => {
    if (!m || ocupado) return;
    if (grabacion) { terminar(); return; }
    try { alCallar?.(); } catch { /* nada */ } // nunca la voz y el micrófono a la vez
    let nueva;
    try { nueva = m.crearGrabacion({ medios: navigator.mediaDevices, Grabadora: window.MediaRecorder, audio: m.AUDIO_WHISPER, alTope: () => { if (grabacion === nueva) terminar(); } }); } catch { return decir('vivo.estado.grabar_fallo'); }
    decir('vivo.estado.pidiendo_permiso');
    const pedido = nueva.empezar(); // dentro del toque
    if (!whisper.listo) { try { m.precargaDeLaPagina().apurar(); } catch { /* nada */ } whisper.preparar().catch(() => {}); }
    pedido.then(() => {
      if (!vivo || caja.disabled || grabacion) { nueva.cancelar(); return; }
      grabacion = nueva;
      mic.setAttribute('aria-pressed', 'true');
      mic.classList.add('grabando');
      const pintar = () => decir('vivo.estado.grabando', { tiempo: m.relojGrabacion(Date.now() - nueva.desde) });
      pintar();
      relojVista = setInterval(() => { if (grabacion === nueva) pintar(); }, 250);
    }, err => { try { nueva.cancelar(); } catch { /* nada */ } decir(`vivo.estado.${m.errorMicrofono(err)}`); });
  });
  const nodo = el('section', { class: 'rf-pal', 'aria-label': t('rf.pal.boton') },
    el('p', { class: 'oral-qa-etiqueta rf-pal-etiqueta', texto: t('rf.pal.tu_respuesta') }),
    caja,
    el('div', { class: 'rf-pal-controles' }, mic, estado));
  return {
    nodo,
    valor: () => String(caja.value ?? '').trim(),
    // Si está grabando, para y escribe primero (→ true: todavía no se manda).
    grabando: () => { if (grabacion) { terminar(); return true; } return ocupado; },
    enfocar: () => { try { caja.focus({ preventScroll: true }); } catch { /* nada */ } },
    decir,
    bloquear: si => { caja.disabled = si; mic.disabled = si || ocupado; },
    // Al irse (otra tarjeta, salir): el micrófono se apaga y nada sigue.
    soltar: () => { vivo = false; apagarVista(); try { grabacion?.cancelar(); } catch { /* nada */ } grabacion = null; },
  };
}
