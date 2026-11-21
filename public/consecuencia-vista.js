// Academia 0.14.95 (pedido de Junior: «tú escoges la respuesta: si bien o mal, la situación pasará en acción ahí»): después
// de responder una pregunta que tiene CONSECUENCIA (src/academia/consecuencias.js; llega solo con la respuesta), el botón
// «▶ Ver qué pasaría» abre, a pantalla casi completa, la situación 3D justo en la consecuencia de la opción que eligió:
// una línea de contexto, la consecuencia (cabina o afuera, con el mini-mapa), «Por qué» y la regla, y «Ver la correcta».
// Si su letra no tiene consecuencia (o no respondió), el botón es «▶ Ver la correcta».
// Liviano: el 3D (public/clase/situacion3d.js) se carga recién al tocar el botón. Nunca durante el examen con reloj (ahí
// no hay respuesta todavía); en las revisiones, sí. Con h.el (nunca texto como código) y clases (nunca estilos escritos).

// La consecuencia que se abre: la de su letra o, si no tiene, la correcta. → { situacion, opcion, propia } o null.
export function consecuenciaElegida(resp) {
  const c = resp?.consecuencia;
  if (!c || typeof c.situacion !== 'string' || typeof c.correcta !== 'string') return null;
  const suya = typeof resp.elegida === 'string' && c.opciones && Object.hasOwn(c.opciones, resp.elegida) ? c.opciones[resp.elegida] : null;
  return { situacion: c.situacion, opcion: suya ?? c.correcta, propia: Boolean(suya), correcta: c.correcta };
}

// El botón (o null). h: { el, t, api?, cargar? } — cargar(): el módulo del 3D (en las pruebas, uno de mentira).
export function botonConsecuencia(resp, h, { examenEnCurso = false } = {}) {
  const x = examenEnCurso ? null : consecuenciaElegida(resp);
  if (!x) return null;
  const { el, t } = h;
  return el('div', { class: 'consecuencia-fila' },
    el('button', { type: 'button', class: 'boton-3d blanco boton-consecuencia', 'data-situacion': x.situacion, 'data-opcion': x.opcion,
      onclick: e => abrirConsecuencia(x, h, e.currentTarget) },
    el('span', { class: 'consecuencia-play', 'aria-hidden': 'true', texto: '▶' }),
    el('span', { texto: t(x.propia ? 'consec.ver' : 'consec.ver_correcta') })));
}

const cargar3d = () => import('./clase/situacion3d.js');

// La capa: un diálogo casi a pantalla completa, con «Cerrar» y Escape; al cambiar de pantalla se va. → { cerrar, listo }.
export function abrirConsecuencia({ situacion, opcion }, h, origen = null) {
  const { el, t } = h;
  const doc = h.documento ?? globalThis.document;
  const antes = origen ?? doc.activeElement ?? null;
  let montado = null, cerrada = false;
  const cerrar = () => {
    if (cerrada) return;
    cerrada = true;
    try { montado?.destruir?.(); } catch { /* ya no está */ }
    montado = null;
    capa.remove();
    globalThis.removeEventListener?.('hashchange', cerrar);
    try { antes?.focus?.({ preventScroll: true }); } catch { /* ya no está */ }
  };
  const botonCerrar = el('button', { type: 'button', class: 'boton-3d blanco cuadrado consecuencia-cerrar', 'aria-label': t('consec.cerrar'), onclick: cerrar }, el('span', { 'aria-hidden': 'true', texto: '✕' }));
  const cuerpo = el('div', { class: 'consecuencia-cuerpo' }, el('p', { class: 'consecuencia-cargando', texto: t('consec.cargando') }));
  const capa = el('div', { class: 'consecuencia-capa', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('consec.titulo'), 'data-situacion': situacion, 'data-opcion': opcion },
    el('div', { class: 'consecuencia-marco' },
      el('div', { class: 'consecuencia-barra' }, el('h2', { class: 'consecuencia-titulo', texto: t('consec.titulo') }), botonCerrar),
      cuerpo));
  capa.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation?.(); cerrar(); } });
  globalThis.addEventListener?.('hashchange', cerrar, { once: true });
  doc.body.append(capa);
  try { botonCerrar.focus?.(); } catch { /* sin foco */ }
  // Cuál se vio (un número por consecuencia; nunca la respuesta de nadie): sin esperar y sin avisar si falla.
  try { Promise.resolve(h.api?.('POST', '/api/academia/consecuencia', { situacion, opcion })).catch(() => {}); } catch { /* sin red */ }
  const listo = Promise.resolve().then(() => (h.cargar ?? cargar3d)()).then(m => {
    if (cerrada) return;
    while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild);
    montado = m.montarSituacion3d(cuerpo, { situacion }, { modo: 'interactivo', t, numero: h.numero, consecuencia: { opcion, alCerrar: cerrar } });
  }).catch(() => {
    if (cerrada) return;
    while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild);
    cuerpo.append(el('p', { class: 'mensaje error', texto: t('consec.error') }));
  });
  return { capa, cerrar, listo, get montado() { return montado; } };
}
