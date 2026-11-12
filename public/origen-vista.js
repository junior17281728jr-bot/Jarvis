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
  document.addEventListener('keydown', teclas, true);
  document.body.append(capa);
  try { hoja.focus({ preventScroll: true }); } catch { hoja.focus(); }
  return capa;
}
