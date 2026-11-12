// Academia 0.9.2: «Términos de uso y aviso». Solo se carga cuando hace falta (al aceptar, al leerlos, en Contenido).
//  - Aceptar: primero Nombre y Apellido de verdad (si el administrador ya lo puso, se confirma), después el texto con
//    «Yo, <Nombre Apellido>, leí y acepto…» y el botón. Sin aceptar no se sigue (solo «Salir»).
//  - Leer: el texto en uso (también antes de entrar, desde el pie).
//  - Administrador: publicar una versión nueva (todos la aceptan otra vez).
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

const NOMBRE = /^[\p{L}](?:[\p{L}\p{M}' -]*[\p{L}\p{M}])?$/u;
export function parteValida(texto) {
  const limpio = String(texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return limpio.length >= 2 && limpio.length <= 60 && NOMBRE.test(limpio) ? limpio : null;
}

export function textoTerminos(h, terminos) {
  const { el, t } = h;
  return el('div', { class: 'terminos-texto', tabindex: '0', 'aria-label': t('terminos.titulo') },
    terminos.secciones.map(s => el('section', {}, el('h3', { texto: s.titulo }), h.talCual('p', s.texto))));
}

// 0.9.2: la firma dibujada con el dedo o el ratón. → { nodo, vacia(), png() }.
// «Vacía» = menos de 20 puntos o un trazo de menos de 60 × 15 (un toque suelto no es una firma).
export function padFirma(h) {
  const { el, t } = h;
  const ANCHO = 480;
  const ALTO = 160;
  const lienzo = el('canvas', { class: 'firma-lienzo', width: ANCHO, height: ALTO, 'aria-label': t('firma.lienzo'), role: 'img' });
  const ctx = lienzo.getContext('2d');
  let puntos = 0;
  let caja = null;
  let trazando = false;
  let alCambiar = () => {};
  const limpiar = () => {
    ctx.clearRect(0, 0, ANCHO, ALTO);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, ALTO - 34); ctx.lineTo(ANCHO - 20, ALTO - 34); ctx.stroke();
    puntos = 0;
    caja = null;
    alCambiar();
  };
  const punto = e => {
    const r = lienzo.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * ANCHO) / r.width, y: ((e.clientY - r.top) * ALTO) / r.height };
  };
  const anotar = p => {
    puntos += 1;
    caja = caja ? { x1: Math.min(caja.x1, p.x), y1: Math.min(caja.y1, p.y), x2: Math.max(caja.x2, p.x), y2: Math.max(caja.y2, p.y) } : { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  };
  lienzo.addEventListener('pointerdown', e => {
    e.preventDefault();
    lienzo.setPointerCapture?.(e.pointerId);
    trazando = true;
    const p = punto(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    anotar(p);
  });
  lienzo.addEventListener('pointermove', e => {
    if (!trazando) return;
    e.preventDefault();
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    anotar(p);
  });
  const soltar = () => { if (trazando) { trazando = false; alCambiar(); } };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('pointerleave', soltar);
  const borrar = el('button', { type: 'button', class: 'secundario chico', onclick: limpiar, texto: t('firma.borrar') });
  const vacia = () => puntos < 20 || !caja || caja.x2 - caja.x1 < 60 || caja.y2 - caja.y1 < 15;
  limpiar();
  return {
    nodo: el('div', { class: 'firma' }, el('p', { class: 'firma-titulo', texto: t('firma.titulo') }), lienzo, el('div', { class: 'firma-pie' }, el('span', { class: 'suave chica', texto: t('firma.ayuda') }), borrar)),
    vacia,
    png: () => lienzo.toDataURL('image/png'),
    alCambiar: fn => { alCambiar = fn; },
  };
}

// La pantalla para aceptar. datos = GET /api/yo/terminos. alListo(estado) cuando aceptó.
export function pantallaAceptar(datos, h, { alListo, salir }) {
  const { el, t } = h;
  const legal = datos.estado.nombreLegal;
  const fijo = legal?.confirmado === true;
  const campoNombre = el('input', { id: 'campo-legal-nombre', type: 'text', maxlength: 60, autocomplete: 'given-name', autocapitalize: 'words', value: legal?.nombre ?? '', readonly: fijo || null });
  const campoApellido = el('input', { id: 'campo-legal-apellido', type: 'text', maxlength: 60, autocomplete: 'family-name', autocapitalize: 'words', value: legal?.apellido ?? '', readonly: fijo || null });
  const mensaje = h.caja();
  const caja = el('section', { class: 'tarjeta centrada terminos-pantalla' });
  const paso1 = () => {
    const seguir = el('button', { type: 'submit', class: 'boton-3d grande', texto: t('terminos.seguir') });
    const formulario = el('form', { novalidate: true },
      el('label', { for: 'campo-legal-nombre', texto: t('terminos.nombre') }), campoNombre,
      el('label', { for: 'campo-legal-apellido', texto: t('terminos.apellido') }), campoApellido,
      el('p', { class: 'ayuda', texto: t(fijo ? 'terminos.nombre.fijo' : legal ? 'terminos.nombre.confirma' : 'terminos.nombre.ayuda') }),
      seguir, mensaje);
    formulario.addEventListener('submit', e => {
      e.preventDefault();
      const n = parteValida(campoNombre.value);
      const a = parteValida(campoApellido.value);
      if (!n || !a) return h.decir(mensaje, t('error.nombre_legal_no_valido'), 'error');
      paso2(n, a);
    });
    caja.replaceChildren(h.marcaConLogo(), el('h1', { texto: t('terminos.antes') }), el('p', { class: 'suave', texto: t('terminos.antes.linea') }), formulario,
      el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir }));
    campoNombre.focus();
  };
  const paso2 = (nombre, apellido) => {
    const acepto = el('input', { id: 'campo-acepto', type: 'checkbox' });
    const boton = el('button', { type: 'button', class: 'boton-3d grande', disabled: true, texto: t('terminos.aceptar') });
    // 0.9.2: la firma dibujada es obligatoria.
    const pad = padFirma(h);
    const pintarBoton = () => { boton.disabled = !acepto.checked || pad.vacia(); };
    pad.alCambiar(pintarBoton);
    acepto.addEventListener('change', pintarBoton);
    boton.addEventListener('click', async () => {
      if (pad.vacia()) return h.decir(mensaje, t('error.firma_falta'), 'error');
      boton.disabled = true;
      const r = await h.api('POST', '/api/yo/terminos', { version: datos.terminos.version, nombre, apellido, acepto: acepto.checked, firma: pad.png() });
      if (!r.ok) { boton.disabled = false; return h.decir(mensaje, h.textoError(r.datos.error), 'error'); }
      alListo(r.datos.estado);
    });
    caja.replaceChildren(h.marcaConLogo(),
      el('h1', { texto: t('terminos.titulo') }),
      el('p', { class: 'suave', texto: t('terminos.version', { n: h.numero(datos.terminos.version) }) }),
      textoTerminos(h, datos.terminos),
      el('p', { class: 'terminos-declaracion', texto: datos.declaracion ?? '' }),
      pad.nodo,
      el('label', { class: 'terminos-acepto', for: 'campo-acepto' }, acepto, el('span', { texto: t('terminos.yo_acepto', { nombre: `${nombre} ${apellido}`, n: h.numero(datos.terminos.version) }) })),
      el('div', { class: 'botones apilados' }, boton,
        el('button', { type: 'button', class: 'secundario', texto: t('terminos.cambiar_nombre'), onclick: paso1, hidden: fijo || null }),
        el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir })),
      mensaje);
  };
  paso1();
  return caja;
}

// Administrador → Contenido: los términos en uso y publicar una versión nueva. Cada parte: primera línea = título.
export function tarjetaAdminTerminos(datos, h, { alPublicar }) {
  const { el, t, numero } = h;
  const texto = datos.terminos.secciones.map(s => `${s.titulo}\n${s.texto}`).join('\n\n');
  const area = el('textarea', { id: 'campo-terminos', rows: 14, class: 'terminos-editor' });
  area.value = texto;
  const mensaje = h.caja();
  const publicar = h.botonAccion(t('terminos.admin.publicar', { n: numero(datos.terminos.version + 1) }), '', mensaje, async () => {
    const secciones = area.value.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
      const [titulo, ...resto] = b.split('\n');
      return { titulo: titulo.trim(), texto: resto.join('\n').trim() };
    });
    if (!secciones.length || secciones.some(s => !s.titulo || !s.texto)) throw new Error(t('error.terminos_no_validos'));
    if (!confirm(t('terminos.admin.confirmar', { n: numero(datos.terminos.version + 1) }))) return;
    const r = await h.api('POST', '/api/admin/terminos', { secciones });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('terminos.admin.listo', { n: numero(r.datos.terminos.version) }));
    await alPublicar();
  }, 'marca');
  return el('section', { class: 'tarjeta', 'aria-labelledby': 'terminos-admin-titulo' },
    el('h2', { id: 'terminos-admin-titulo', class: 'con-icono' }, h.icono('manual'), el('span', { texto: t('terminos.titulo') })),
    el('p', { class: 'suave', texto: t('terminos.admin.linea', { n: numero(datos.terminos.version), si: numero(datos.aceptaron), total: numero(datos.cuentas) }) }),
    el('details', {},
      el('summary', { texto: t('terminos.admin.editar') }),
      el('p', { class: 'ayuda', texto: t('terminos.admin.ayuda') }),
      el('label', { for: 'campo-terminos', texto: t('terminos.admin.texto') }), area,
      el('div', { class: 'botones' }, publicar), mensaje));
}
