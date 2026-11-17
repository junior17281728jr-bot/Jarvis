// Academia 0.12.0: «¿De dónde salió?». Un botón chico en la esquina de cada pregunta (práctica, temas, revisión y
// resultados; nunca durante el examen con reloj) que abre una hoja con la fuente: Test Guide, capítulo y sección, número
// y página del PDF, y la PÁGINA REAL del libro (una imagen del paquete, que vive solo en el servidor). La imagen se pide
// solo DESPUÉS de responder (en esa página está la respuesta: el servidor tampoco la da antes). Sin imagen, la referencia.
// Se amplía con el mismo visor de las figuras. Todo se arma con h.el (nunca texto como código).

// q: la pregunta como la manda el servidor (numero, seccion, pagina, paginaLibro, respuesta).
// h: { el, t, icono, talCual, abrirImagenGrande }.
export function botonOrigen(q, h) {
  if (!q || q.origen === 'poh') return null;
  const { el, t, icono } = h;
  return el('button', {
    type: 'button', class: 'origen-boton', 'aria-haspopup': 'dialog', title: t('origen.boton'), 'aria-label': t('origen.boton'),
    onclick: evento => { evento.stopPropagation(); abrirOrigen(q, h, evento.currentTarget); },
  }, icono('libro', 'icono chico'), el('span', { class: 'origen-boton-texto', texto: t('origen.boton') }));
}

function fila(h, etiqueta, valor) {
  if (valor == null || valor === '') return null;
  return h.el('div', { class: 'origen-fila' }, h.el('dt', { texto: etiqueta }), h.talCual('dd', String(valor)));
}

export function abrirOrigen(q, h, desde = null) {
  const { el, t, icono } = h;
  const pg = q.paginaLibro ?? null;
  const respondida = Boolean(q.respuesta && !q.respuesta.sinResponder);
  const src = `/api/academia/paginas/${encodeURIComponent(q.id)}`;
  const alt = t('origen.pagina_alt', { pagina: pg?.pagina ?? q.pagina ?? '', libro: pg?.libro ?? t('origen.test_guide') });
  let cuerpoImagen;
  if (!pg?.imagen) {
    cuerpoImagen = el('p', { class: 'origen-nota', texto: t('origen.sin_imagen') });
  } else if (!respondida) {
    cuerpoImagen = el('p', { class: 'origen-nota con-icono-chico' }, icono('candado', 'icono chico'), el('span', { texto: t('origen.despues') }));
  } else {
    const img = el('img', { src, alt, class: 'origen-imagen', loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => img.replaceWith(el('p', { class: 'origen-nota', texto: t('origen.no_carga') })), { once: true });
    cuerpoImagen = el('figure', { class: 'origen-figura' },
      el('button', { type: 'button', class: 'origen-imagen-boton', 'aria-label': t('origen.tocar'), onclick: () => h.abrirImagenGrande({ src, nombre: alt, titulo: alt }) },
        img, el('span', { class: 'q-figura-lupa', 'aria-hidden': 'true' }, icono('lupa', 'icono chico'))),
      el('figcaption', { class: 'suave chica', texto: t('origen.tocar') }));
  }
  const cerrar = () => {
    capa.remove();
    document.removeEventListener('keydown', teclas, true);
    window.removeEventListener('hashchange', alNavegar);
    try { desde?.focus({ preventScroll: true }); } catch { /* ya no está */ }
  };
  const teclas = e => { if (e.key === 'Escape' && document.body.lastElementChild === capa) { e.stopPropagation(); cerrar(); } };
  const titulo = el('h2', { id: 'origen-titulo', class: 'con-icono' }, icono('libro'), el('span', { texto: t('origen.titulo') }));
  const hoja = el('div', { class: 'origen-hoja', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'origen-titulo', tabindex: '-1' },
    el('div', { class: 'origen-cabeza' }, titulo,
      el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': t('acad.cerrar'), onclick: cerrar }, icono('cerrar'))),
    el('dl', { class: 'origen-datos' },
      fila(h, t('origen.libro'), pg?.libro ?? t('origen.test_guide')),
      fila(h, t('origen.seccion'), q.seccion),
      fila(h, t('origen.numero'), q.numero),
      fila(h, t('origen.pagina'), pg?.pagina ?? q.pagina)),
    cuerpoImagen);
  const capa = el('div', { class: 'origen-capa', onclick: e => { if (e.target === capa) cerrar(); } }, hoja);
  // Al cambiar de pantalla la hoja se va (vive en <body>, fuera de la pantalla).
  const alNavegar = () => { capa.remove(); document.removeEventListener('keydown', teclas, true); window.removeEventListener('hashchange', alNavegar); };
  window.addEventListener('hashchange', alNavegar);
  document.addEventListener('keydown', teclas, true);
  document.body.append(capa);
  try { hoja.focus({ preventScroll: true }); } catch { hoja.focus(); }
  return capa;
}

// ---------- 0.14.20: «Ver en el Test Guide» ----------
// Un botón chico en toda pregunta del Test Guide (práctica, temas, Repaso final y TAMBIÉN el examen con reloj): abre una
// hoja con su número oficial («Pregunta 4-134 del Test Guide»), el capítulo, la referencia, la página y la figura, y la
// pregunta TAL CUAL (texto y opciones exactamente como en el Test Guide). La respuesta oficial la decide el servidor
// (GET /api/academia/test-guide/:pregunta): nunca antes de responder ni durante un examen abierto que la trae.
// h: { el, t, icono, talCual, api, abrirImagenGrande, textoError }.
export function botonTestGuide(q, h) {
  if (!q || q.origen !== 'test_guide' || !q.id) return null;
  const { el, t, icono } = h;
  return el('button', {
    type: 'button', class: 'origen-boton tg-boton', 'aria-haspopup': 'dialog', title: t('tgver.boton'), 'aria-label': t('tgver.boton'),
    onclick: evento => { evento.stopPropagation(); abrirTestGuide(q, h, evento.currentTarget); },
  }, icono('lupa', 'icono chico'), el('span', { class: 'origen-boton-texto', texto: t('tgver.boton') }));
}

// La hoja de abajo (la misma de «¿De dónde salió?»): se cierra con la X, tocando afuera, con Escape o al cambiar de pantalla.
function abrirHoja(h, idTitulo, titulo, cuerpo, desde) {
  const { el, t, icono } = h;
  const cerrar = () => {
    capa.remove();
    document.removeEventListener('keydown', teclas, true);
    window.removeEventListener('hashchange', alNavegar);
    try { desde?.focus({ preventScroll: true }); } catch { /* ya no está */ }
  };
  const teclas = e => { if (e.key === 'Escape' && document.body.lastElementChild === capa) { e.stopPropagation(); cerrar(); } };
  const hoja = el('div', { class: 'origen-hoja', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo, tabindex: '-1' },
    el('div', { class: 'origen-cabeza' }, el('h2', { id: idTitulo, class: 'con-icono' }, icono('libro'), el('span', { texto: titulo })),
      el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': t('acad.cerrar'), onclick: cerrar }, icono('cerrar'))),
    cuerpo);
  const capa = el('div', { class: 'origen-capa', onclick: e => { if (e.target === capa) cerrar(); } }, hoja);
  const alNavegar = () => { capa.remove(); document.removeEventListener('keydown', teclas, true); window.removeEventListener('hashchange', alNavegar); };
  window.addEventListener('hashchange', alNavegar);
  document.addEventListener('keydown', teclas, true);
  document.body.append(capa);
  try { hoja.focus({ preventScroll: true }); } catch { hoja.focus(); }
  return capa;
}

export async function abrirTestGuide(q, h, desde = null) {
  const { el, t } = h;
  const cuerpo = el('div', { class: 'tg-ficha', 'aria-live': 'polite' }, el('p', { class: 'origen-nota', texto: t('tgver.cargando') }));
  const capa = abrirHoja(h, 'tgver-titulo', t('tgver.titulo'), cuerpo, desde);
  const r = await h.api('GET', `/api/academia/test-guide/${encodeURIComponent(q.id)}`);
  if (!capa.isConnected) return capa;
  cuerpo.replaceChildren(...(r.ok ? fichaTestGuide(r.datos, h) : [el('p', { class: 'mensaje error', texto: h.textoError(r.datos?.error || 'no_existe') })]));
  return capa;
}

// Lo que se ve en la hoja (puro DOM con h.el; nada de texto como código).
export function fichaTestGuide(d, h) {
  const { el, t, icono, talCual } = h;
  const partes = [el('p', { class: 'tg-numero' }, el('span', { texto: t('tgver.pregunta') }), ' ', talCual('strong', d.numero), ' ', el('span', { texto: t('tgver.del_tg') }))];
  partes.push(el('dl', { class: 'origen-datos' },
    fila(h, t('tgver.capitulo'), d.capitulo),
    fila(h, t('tgver.referencia'), d.referencia),
    fila(h, t('origen.pagina'), d.pagina),
    fila(h, t('tgver.figura'), d.figura ? d.figura.numero : null)));
  if (d.figura) {
    const src = `/api/academia/figuras/${encodeURIComponent(d.figura.ref ?? d.figura.numero)}`;
    const nombre = t('acad.figura', { n: d.figura.numero });
    partes.push(el('figure', { class: 'origen-figura' },
      el('button', { type: 'button', class: 'origen-imagen-boton', 'aria-label': t('acad.figura.ampliar', { figura: nombre }), onclick: () => h.abrirImagenGrande({ src, nombre, titulo: d.figura.titulo || nombre }) },
        el('img', { src, alt: nombre, class: 'origen-imagen', loading: 'lazy', decoding: 'async' }),
        el('span', { class: 'q-figura-lupa', 'aria-hidden': 'true' }, icono('lupa', 'icono chico')))));
  }
  partes.push(el('h3', { class: 'tg-subtitulo', texto: t('tgver.tal_cual') }));
  partes.push(talCual('p', d.enunciado, 'tg-enunciado'));
  if (d.opcionesOcultas) partes.push(el('p', { class: 'origen-nota con-icono-chico' }, icono('candado', 'icono chico'), el('span', { texto: t('tgver.opciones_reto') })));
  else if (Array.isArray(d.opciones)) {
    partes.push(el('ol', { class: 'tg-opciones' }, d.opciones.map(op => el('li', { class: d.respuesta?.correcta === op.letra ? 'correcta' : null },
      el('strong', { class: 'tg-letra', texto: `${op.letra}.` }), ' ', talCual('span', op.texto),
      d.respuesta?.correcta === op.letra ? el('span', { class: 'tg-sello', texto: t('tgver.oficial') }) : null))));
  }
  if (d.difiere) partes.push(el('p', { class: 'origen-nota', texto: t('tgver.difiere') }));
  if (d.respuesta) {
    partes.push(el('div', { class: 'tg-respuesta' },
      el('p', {}, el('strong', { texto: t('tgver.respuesta') }), ' ', talCual('span', d.respuesta.correcta), d.respuesta.texto ? ' · ' : null, d.respuesta.texto ? talCual('span', d.respuesta.texto) : null),
      d.respuesta.explicacion ? talCual('p', d.respuesta.explicacion, 'tg-explicacion') : null));
  } else {
    partes.push(el('p', { class: 'origen-nota con-icono-chico' }, icono('candado', 'icono chico'), el('span', { texto: t(d.bloqueo === 'en_examen' ? 'tgver.en_examen' : 'tgver.despues') })));
  }
  return partes;
}
