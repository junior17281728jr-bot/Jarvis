// Academia 0.14.85 (pedido del dueño: «todo debe tener un punto de soporte… abajo, si tiene un error algo, le da y
// automático se manda qué sección tiene el error, y el alumno podrá decir cuál es y por qué»): «⚑ Reportar un error».
// Un enlace chiquito y siempre igual debajo de todo lo que el alumno lee o responde, y uno general al pie de cada pantalla
// («algo no funciona en esta pantalla»). Al tocarlo se abre una hoja (no se sale de la pantalla: el alumno no pierde dónde
// iba) con «¿Qué está mal?» (botones), «¿Por qué?» y Enviar; al final, «¡Gracias! El administrador lo va a revisar.».
//
// Lo que se manda SOLO (el alumno no escribe nada de esto): la pantalla, la versión de la app, el equipo (navegador y
// tamaño), claro u oscuro, el idioma, los últimos errores de la página (hasta 5, en memoria: nada sale a la red hasta que
// se manda un reporte) y DÓNDE está lo reportado (materia, tema y tarjeta; la pregunta con sus opciones y la letra que
// eligió, SOLO después de responderla y nunca durante un examen con reloj; el tipo de dibujo). El servidor saca del
// paquete el texto tal cual, su huella y sus fuentes, y la letra elegida de SUS respuestas guardadas.
// Sin librerías; todo texto con textContent y sin estilos en línea. No toca la página al cargarse (las pruebas lo importan).

export const QUE = Object.freeze(['respuesta', 'explicacion', 'traduccion', 'imagen', 'no_carga', 'otro']);
export const QUE_CONTENIDO = Object.freeze(['respuesta', 'explicacion', 'traduccion', 'imagen']);
export const PORQUE = Object.freeze({ minimo: 10, maximo: 1000 });
export const ERRORES_MAXIMOS = 5;
const TIPOS = Object.freeze(['tarjeta', 'otra', 'oral', 'ia', 'pregunta', 'escena', 'situacion', 'figura', 'video', 'clip', 'biblioteca', 'voz', 'app']);
const ID = /^[a-z0-9_-]{1,60}$/;

// ¿Sirve lo que eligió y escribió? → null o la clave del error (lo mismo que revisa el servidor).
export function problemaReporte({ que, porque }) {
  if (!QUE.includes(que)) return 'reporte_que';
  const p = String(porque ?? '').trim();
  if (p.length > PORQUE.maximo) return 'reporte_porque';
  if (QUE_CONTENIDO.includes(que) && p.length < PORQUE.minimo) return 'reporte_porque';
  return null;
}
// Lo que se elige primero según lo que es (un dibujo: «Imagen o animación mal»; la app: «No carga»).
export function queInicial(tipo) {
  if (['escena', 'figura', 'clip', 'video'].includes(tipo)) return 'imagen';
  if (['app', 'voz'].includes(tipo)) return 'no_carga';
  if (tipo === 'pregunta') return 'respuesta';
  return null;
}
// 0.14.93: el punto de la calificación de una respuesta de la práctica en vivo (después de calificada).
export const puntoVivo = (sesion, i, titulo = null) => ({ tipo: 'oral', vivo: { sesion: String(sesion ?? ''), i: Number(i) }, ...(titulo ? { titulo } : {}) });

// Los últimos errores de la página: una lista nueva con el error agregado (los 5 más nuevos). Solo el mensaje (una
// línea, 200 letras) y dónde (el archivo, sin lo que va después de ? o #); nunca la pila entera.
export function anotarError(lista, { mensaje, donde = null, en = null } = {}, tope = ERRORES_MAXIMOS) {
  const m = String(mensaje ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!m) return lista.slice(-tope);
  const d = donde ? String(donde).split(/[?#]/)[0].slice(0, 160) : null;
  return [...lista, { mensaje: m, donde: d, en: en ?? null }].slice(-tope);
}

// El contexto que se agrega solo. Solo estos campos; de la dirección queda la pantalla (sin lo que va después de ? o &).
export function contextoAuto({ ruta = null, version = null, navegador = null, ancho = null, alto = null, oscuro = false, idioma = 'es', errores = [] } = {}) {
  return {
    pantalla: String(ruta ?? '').split(/[?&]/)[0].slice(0, 120) || null,
    version: version ? String(version).slice(0, 20) : null,
    navegador: navegador ? String(navegador).slice(0, 300) : null,
    tamano: Number.isFinite(ancho) && Number.isFinite(alto) ? `${Math.round(ancho)}x${Math.round(alto)}` : null,
    idioma: idioma === 'en' ? 'en' : 'es',
    tema: oscuro ? 'oscuro' : 'claro',
    errores: (Array.isArray(errores) ? errores : []).slice(-ERRORES_MAXIMOS),
  };
}

// El punto de una pregunta: SOLO después de responderla y nunca en un examen con reloj (null: no hay enlace). Lleva su id,
// sus opciones (letra y texto, tal cual se vieron) y la letra que eligió.
export function puntoPregunta(q, { respondida = false, enExamen = false, elegida = null, intento = null } = {}) {
  if (!q?.id || !respondida || enExamen) return null;
  return {
    tipo: 'pregunta', pregunta: String(q.id), ...(Number.isSafeInteger(Number(intento)) && Number(intento) > 0 ? { intento: Number(intento) } : {}),
    opciones: (Array.isArray(q.opciones) ? q.opciones : []).map(o => ({ letra: String(o?.letra ?? '').slice(0, 2), texto: String(o?.texto ?? '').slice(0, 300) })),
    elegida: elegida ? String(elegida).slice(0, 2) : null,
  };
}

// Lo que se manda del punto: solo dónde está (ids cortos), nunca un texto largo. Un punto que no sirve → { tipo: 'app' }.
export function puntoParaMandar(item) {
  const x = item && typeof item === 'object' ? item : {};
  const tipo = TIPOS.includes(x.tipo) ? x.tipo : 'app';
  const out = { tipo };
  for (const k of ['materia', 'tema']) if (ID.test(String(x[k] ?? ''))) out[k] = x[k];
  if (Number.isSafeInteger(Number(x.n)) && Number(x.n) > 0) out.n = Number(x.n);
  if (typeof x.clave === 'string' && /^academia\.ia\.[a-z]+\.[a-f0-9]{32}$/.test(x.clave)) out.clave = x.clave;
  if (tipo === 'pregunta') {
    if (typeof x.pregunta === 'string' && x.pregunta.length <= 120) out.pregunta = x.pregunta;
    if (Number.isSafeInteger(x.intento)) out.intento = x.intento;
    if (Array.isArray(x.opciones)) out.opciones = x.opciones.slice(0, 6);
    if (typeof x.elegida === 'string') out.elegida = x.elegida.slice(0, 2);
  }
  // 0.14.93: la calificación de una respuesta de la «Práctica en vivo» del oral: solo cuál (la práctica y el número); el
  // servidor saca de SU práctica guardada de qué pregunta es, lo que dijo y lo que le dijo el calificador.
  if (tipo === 'oral' && x.vivo && typeof x.vivo.sesion === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x.vivo.sesion) && Number.isSafeInteger(x.vivo.i) && x.vivo.i >= 0) out.vivo = { sesion: x.vivo.sesion, i: x.vivo.i };
  if (typeof x.id === 'string' && /^[A-Za-z0-9_./:#-]{1,120}$/.test(x.id)) out.id = x.id;
  if (typeof x.visual === 'string' && /^[a-z0-9_-]{1,40}$/.test(x.visual)) out.visual = x.visual;
  if (typeof x.titulo === 'string' && x.titulo.trim()) out.titulo = x.titulo.replace(/\s+/g, ' ').trim().slice(0, 160);
  return out;
}

// ---------- En la página ----------
let piezas = null;
let errores = [];
export const ultimosErrores = () => errores.slice();
// app.js lo llama una vez: { el, t, api, icono, avisar, version(), idioma(), hayUsuario() }.
export function configurarReportar(h) { piezas = h; }
// El que atrapa los errores de la página (solo en memoria; nada sale a la red hasta que se manda un reporte).
export function vigilarErrores(w = typeof window !== 'undefined' ? window : null) {
  if (!w?.addEventListener) return;
  const ahora = () => { try { return new Date().toISOString(); } catch { return null; } };
  w.addEventListener('error', e => { errores = anotarError(errores, { mensaje: e?.message ?? e?.error?.message, donde: e?.filename ? `${e.filename}:${e.lineno ?? ''}` : null, en: ahora() }); });
  w.addEventListener('unhandledrejection', e => { const r = e?.reason; errores = anotarError(errores, { mensaje: r?.message ?? String(r ?? ''), donde: null, en: ahora() }); });
}

function contextoDeAhora() {
  const h = piezas;
  let oscuro = false;
  try {
    const tema = document.documentElement.dataset.tema;
    oscuro = tema === 'oscuro' || (tema !== 'claro' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  } catch { oscuro = false; }
  return contextoAuto({ ruta: location.hash, version: h.version?.() ?? null, navegador: navigator.userAgent, ancho: window.innerWidth, alto: window.innerHeight, oscuro, idioma: h.idioma?.() ?? 'es', errores });
}

// El enlace «⚑ Reportar un error». item: el punto (o una función que lo da al tocar). general: el del pie («algo no
// funciona en esta pantalla»). Sin sesión, o sin configurar: nada (null).
export function enlaceReportar(item, { general = false, clase = '' } = {}) {
  const h = piezas;
  if (item === null || item === undefined) return null; // sin punto (una pregunta sin responder): sin enlace
  if (!h || (typeof h.hayUsuario === 'function' && !h.hayUsuario())) return null;
  const texto = h.t(general ? 'reportar.enlace.pantalla' : 'reportar.enlace');
  return h.el('button', { type: 'button', class: `reportar-punto${general ? ' general' : ''}${clase ? ` ${clase}` : ''}`, 'aria-haspopup': 'dialog',
    onclick: e => { e.stopPropagation(); abrirReportar(typeof item === 'function' ? item() : item, e.currentTarget); } },
  h.el('span', { class: 'reportar-bandera', 'aria-hidden': 'true', texto: '⚑' }), h.el('span', { texto }));
}

const TEXTO_ERROR = { reporte_repetido: 'reportar.ya', reporte_muchos: 'reportar.muchos', soporte_muchos: 'reportar.muchos', reporte_en_examen: 'reportar.en_examen', reporte_porque: 'reportar.porque.corto' };
export function abrirReportar(item, desde = null) {
  const h = piezas;
  if (!h) return;
  const { el, t } = h;
  const punto = puntoParaMandar(item);
  const contexto = contextoDeAhora();
  let que = punto.vivo ? 'respuesta' : queInicial(punto.tipo);
  const hoja = el('dialog', { class: 'hoja-ayuda hoja-reportar', 'aria-labelledby': 'reportar-hoja-titulo' });
  const chips = QUE.map(q => el('button', { type: 'button', class: 'reportar-chip', 'data-que': q, 'aria-pressed': String(q === que), onclick: () => { que = q; pintarChips(); revisar(); } }, el('span', { texto: t(`reportar.que.${q}`) })));
  const pintarChips = () => { for (const b of chips) b.setAttribute('aria-pressed', String(b.dataset.que === que)); };
  const porque = el('textarea', { id: 'reportar-porque', rows: 4, maxlength: PORQUE.maximo, placeholder: t('reportar.porque.muestra') });
  const cuenta = el('p', { class: 'suave chica reportar-cuenta', 'aria-live': 'polite' });
  const mensaje = el('p', { class: 'mensaje error', role: 'alert', hidden: true });
  const enviar = el('button', { type: 'button', class: 'grande', disabled: true }, el('span', { texto: t('reportar.enviar_punto') }));
  const revisar = () => {
    const n = porque.value.trim().length;
    const obligatorio = QUE_CONTENIDO.includes(que);
    cuenta.textContent = obligatorio && n < PORQUE.minimo ? t('reportar.porque.falta', { n: String(PORQUE.minimo - n) }) : t('reportar.porque.cuantas', { n: String(n), max: String(PORQUE.maximo) });
    enviar.disabled = Boolean(problemaReporte({ que, porque: porque.value }));
  };
  porque.addEventListener('input', revisar);
  const sobre = t(punto.vivo ? 'reportar.sobre.oral_nota' : `reportar.sobre.${punto.tipo}`);
  const lista = [[t('soporte.c.pantalla'), contexto.pantalla ?? '—'], [t('soporte.c.version'), contexto.version ?? '—'], [t('reportar.c.tamano'), contexto.tamano ?? '—'],
    [t('reportar.c.tema'), t(`reportar.c.tema.${contexto.tema}`)], [t('reportar.c.errores'), contexto.errores.length ? String(contexto.errores.length) : '0']];
  const dentro = el('div', { class: 'hoja-ayuda-dentro' },
    el('div', { class: 'hoja-ayuda-cabeza' }, el('span', { class: 'hoja-ayuda-icono', 'aria-hidden': 'true', texto: '⚑' }), el('h2', { id: 'reportar-hoja-titulo', texto: t('reportar.titulo_punto') })),
    el('p', { class: 'suave reportar-sobre', texto: sobre }),
    el('p', { class: 'reportar-pregunta', texto: t('reportar.que') }),
    el('div', { class: 'reportar-chips', role: 'group', 'aria-label': t('reportar.que') }, chips),
    el('label', { for: 'reportar-porque', texto: t('reportar.porque') }), porque, cuenta,
    el('details', { class: 'soporte-contexto-detalle' }, el('summary', { texto: t('reportar.se_manda') }),
      el('dl', { class: 'ficha-datos soporte-contexto' }, lista.flatMap(([a, b]) => [el('dt', { texto: a }), el('dd', { texto: b })])),
      el('p', { class: 'suave chica', texto: t('reportar.privado_punto') })),
    mensaje,
    el('div', { class: 'hoja-ayuda-botones' }, enviar, el('button', { type: 'button', class: 'secundario', onclick: () => hoja.close() }, el('span', { texto: t('reportar.cancelar') }))));
  enviar.addEventListener('click', async () => {
    if (problemaReporte({ que, porque: porque.value })) return;
    enviar.disabled = true;
    mensaje.hidden = true;
    let r;
    try { r = await h.api('POST', '/api/soporte/reporte', { que, porque: porque.value.trim(), item: punto, contexto }); } catch { r = { ok: false, datos: { error: 'sin_red' } }; }
    if (!r.ok) {
      const clave = TEXTO_ERROR[r.datos?.error];
      mensaje.textContent = clave ? t(clave) : (h.textoError?.(r.datos?.error) ?? t('reportar.no_se_pudo'));
      mensaje.hidden = false;
      enviar.disabled = r.datos?.error === 'reporte_repetido';
      if (r.datos?.error !== 'reporte_repetido') revisar();
      return;
    }
    dentro.replaceChildren(...[
      el('div', { class: 'hoja-ayuda-cabeza' }, el('span', { class: 'hoja-ayuda-icono tono-bien', 'aria-hidden': 'true', texto: '✓' }), el('h2', { id: 'reportar-hoja-titulo', texto: t('reportar.gracias') })),
      el('p', { class: 'hoja-ayuda-texto', texto: t('reportar.gracias_linea') }),
      el('div', { class: 'hoja-ayuda-botones' }, el('button', { type: 'button', class: 'grande', autofocus: true, onclick: () => hoja.close() }, el('span', { texto: t('reportar.cerrar') }))),
    ]);
  });
  hoja.append(dentro);
  hoja.addEventListener('click', e => { if (e.target === hoja) hoja.close(); });
  hoja.addEventListener('close', () => { hoja.remove(); if (desde?.isConnected) { try { desde.focus({ preventScroll: true }); } catch { desde.focus(); } } });
  document.body.append(hoja);
  pintarChips();
  revisar();
  if (typeof hoja.showModal === 'function') hoja.showModal();
  else { hoja.close = () => hoja.dispatchEvent(new Event('close')); hoja.setAttribute('open', ''); }
}
