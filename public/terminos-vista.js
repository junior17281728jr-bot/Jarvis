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
export function padFirma(h, { id = 'propia' } = {}) {
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
    nodo: el('div', { class: 'firma' }, el('p', { class: 'firma-titulo', texto: t(id === 'tutor' ? 'firma.titulo_tutor' : 'firma.titulo') }), lienzo, el('div', { class: 'firma-pie' }, el('span', { class: 'suave chica', texto: t('firma.ayuda') }), borrar)),
    vacia,
    png: () => lienzo.toDataURL('image/png'),
    alCambiar: fn => { alCambiar = fn; },
  };
}

// Edad cumplida en una fecha (AAAA-MM-DD).
export function edad(nacimiento, hoy = new Date().toISOString().slice(0, 10)) {
  const [a, m, d] = String(nacimiento).split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  if (!a || !m || !d) return null;
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
function casilla(h, id, texto, { requerida = true, nota = null } = {}) {
  const c = h.el('input', { id, type: 'checkbox' });
  return { c, nodo: h.el('label', { class: `terminos-acepto${requerida ? '' : ' opcional'}`, for: id }, c, h.el('span', {}, h.el('span', { texto }), nota ? h.el('span', { class: 'suave chica', texto: nota }) : null)) };
}

// La pantalla para firmar (una sola, por pasos). Paso 1: nombre, apellido y fecha de nacimiento. Paso 2: los textos,
// la declaración, la firma y las casillas (sin marcar): términos, privacidad y (opcional) el envío a la IA. Si es menor
// de 18: la parte del padre, madre o tutor (nombre, relación, contacto, su firma y su casilla).
export function pantallaAceptar(datos, h, { alListo, salir }) {
  const { el, t, numero } = h;
  const legal = datos.estado.nombreLegal;
  const fijo = legal?.confirmado === true;
  const campoNombre = el('input', { id: 'campo-legal-nombre', type: 'text', maxlength: 60, autocomplete: 'given-name', autocapitalize: 'words', value: legal?.nombre ?? '', readonly: fijo || null });
  const campoApellido = el('input', { id: 'campo-legal-apellido', type: 'text', maxlength: 60, autocomplete: 'family-name', autocapitalize: 'words', value: legal?.apellido ?? '', readonly: fijo || null });
  const campoNacimiento = el('input', { id: 'campo-nacimiento', type: 'date', value: datos.estado.nacimiento ?? '', max: new Date().toISOString().slice(0, 10), autocomplete: 'bday' });
  const mensaje = h.caja();
  const caja = el('section', { class: 'tarjeta centrada terminos-pantalla' });
  const pasos = n => el('ol', { class: 'terminos-pasos', 'aria-label': t('terminos.pasos') },
    [t('terminos.paso1'), t('terminos.paso2')].map((x, k) => el('li', { class: k + 1 === n ? 'actual' : k + 1 < n ? 'hecho' : null, texto: x })));
  const paso1 = () => {
    const formulario = el('form', { novalidate: true },
      el('label', { for: 'campo-legal-nombre', texto: t('terminos.nombre') }), campoNombre,
      el('label', { for: 'campo-legal-apellido', texto: t('terminos.apellido') }), campoApellido,
      el('p', { class: 'ayuda', texto: t(fijo ? 'terminos.nombre.fijo' : legal ? 'terminos.nombre.confirma' : 'terminos.nombre.ayuda') }),
      el('label', { for: 'campo-nacimiento', texto: t('terminos.nacimiento') }), campoNacimiento,
      el('p', { class: 'ayuda', texto: t('terminos.nacimiento.ayuda') }),
      el('button', { type: 'submit', class: 'boton-3d grande', texto: t('terminos.seguir') }), mensaje);
    formulario.addEventListener('submit', e => {
      e.preventDefault();
      const n = parteValida(campoNombre.value);
      const a = parteValida(campoApellido.value);
      if (!n || !a) return h.decir(mensaje, t('error.nombre_legal_no_valido'), 'error');
      const anos = edad(campoNacimiento.value);
      if (anos == null || anos < 5 || anos > 110) return h.decir(mensaje, t('error.nacimiento_no_valido'), 'error');
      paso2(n, a, campoNacimiento.value, anos < 18);
    });
    caja.replaceChildren(h.marcaConLogo(), pasos(1), el('h1', { texto: t('terminos.antes') }), el('p', { class: 'suave', texto: t('terminos.antes.linea') }), formulario,
      el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir }));
    campoNombre.focus();
  };
  const paso2 = (nombre, apellido, nacimiento, menor) => {
    const boton = el('button', { type: 'button', class: 'boton-3d grande', disabled: true, texto: t('terminos.aceptar') });
    const pad = padFirma(h);
    const c1 = casilla(h, 'campo-acepto', t('terminos.yo_acepto', { nombre: `${nombre} ${apellido}`, n: numero(datos.terminos.version) }));
    const c2 = casilla(h, 'campo-acepto-privacidad', t('terminos.acepto_privacidad', { n: numero(datos.privacidad.version) }));
    const c3 = casilla(h, 'campo-acepto-ia', t('terminos.acepto_ia'), { requerida: false, nota: t('terminos.acepto_ia.nota') });
    // El padre, madre o tutor (solo si es menor).
    const tutorNombre = el('input', { id: 'campo-tutor-nombre', type: 'text', maxlength: 120, autocomplete: 'off' });
    const tutorRelacion = el('select', { id: 'campo-tutor-relacion' }, ['madre', 'padre', 'tutor'].map(r => el('option', { value: t(`terminos.tutor.rel.${r}`), texto: t(`terminos.tutor.rel.${r}`) })));
    const tutorContacto = el('input', { id: 'campo-tutor-contacto', type: 'text', maxlength: 120, autocomplete: 'off', inputmode: 'email' });
    const padTutor = menor ? padFirma(h, { id: 'tutor' }) : null;
    const c4 = menor ? casilla(h, 'campo-tutor-acepto', t('terminos.tutor.acepto')) : null;
    const listo = () => c1.c.checked && c2.c.checked && !pad.vacia() && (!menor || (parteValida(tutorNombre.value) && tutorContacto.value.trim().length >= 5 && !padTutor.vacia() && c4.c.checked));
    const pintarBoton = () => { boton.disabled = !listo(); };
    pad.alCambiar(pintarBoton);
    padTutor?.alCambiar(pintarBoton);
    for (const x of [c1, c2, c3, c4].filter(Boolean)) x.c.addEventListener('change', pintarBoton);
    for (const x of [tutorNombre, tutorContacto]) x.addEventListener('input', pintarBoton);
    boton.addEventListener('click', async () => {
      if (!listo()) return h.decir(mensaje, t('error.firma_falta'), 'error');
      boton.disabled = true;
      const r = await h.api('POST', '/api/yo/terminos', {
        version: datos.terminos.version, versionPrivacidad: datos.privacidad.version, nombre, apellido, nacimiento,
        acepto: c1.c.checked, aceptoPrivacidad: c2.c.checked, aceptoIa: c3.c.checked, firma: pad.png(),
        ...(menor ? { tutor: { nombre: tutorNombre.value, relacion: tutorRelacion.value, contacto: tutorContacto.value, acepto: c4.c.checked, firma: padTutor.png() } } : {}),
      });
      if (!r.ok) { boton.disabled = false; return h.decir(mensaje, h.textoError(r.datos.error), 'error'); }
      alListo(r.datos.estado);
    });
    caja.replaceChildren(h.marcaConLogo(), pasos(2),
      el('h1', { texto: t('terminos.titulo') }),
      el('p', { class: 'suave', texto: t('terminos.version', { n: numero(datos.terminos.version) }) }),
      textoTerminos(h, datos.terminos),
      el('h2', { class: 'terminos-subtitulo', texto: t('privacidad.titulo') }),
      el('p', { class: 'suave', texto: t('terminos.version', { n: numero(datos.privacidad.version) }) }),
      textoTerminos(h, datos.privacidad),
      el('p', { class: 'terminos-declaracion', texto: datos.declaracion ?? '' }),
      pad.nodo,
      c1.nodo, c2.nodo, c3.nodo,
      menor ? el('fieldset', { class: 'terminos-tutor' },
        el('legend', { texto: t('terminos.tutor.titulo') }),
        el('p', { class: 'suave', texto: t('terminos.tutor.linea') }),
        el('label', { for: 'campo-tutor-nombre', texto: t('terminos.tutor.nombre') }), tutorNombre,
        el('label', { for: 'campo-tutor-relacion', texto: t('terminos.tutor.relacion') }), tutorRelacion,
        el('label', { for: 'campo-tutor-contacto', texto: t('terminos.tutor.contacto') }), tutorContacto,
        padTutor.nodo, c4.nodo) : null,
      el('div', { class: 'botones apilados' }, boton,
        el('button', { type: 'button', class: 'secundario', texto: t('terminos.cambiar_nombre'), onclick: paso1 }),
        el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir })),
      mensaje);
  };
  paso1();
  return caja;
}

const TEXTO_REVISA = {
  reembolso: 'terminos.admin.revisa.reembolso', devolucion: 'terminos.admin.revisa.devolucion', activacion: 'terminos.admin.revisa.activacion',
  chat: 'terminos.admin.revisa.chat', alojamiento: 'terminos.admin.revisa.alojamiento', contacto: 'terminos.admin.revisa.contacto', retencion: 'terminos.admin.revisa.retencion',
};
// Administrador → Contenido: los textos en uso (términos y privacidad) y publicar una versión nueva.
// Cada parte: primera línea = título; las partes van separadas por una línea en blanco.
export function tarjetaAdminTerminos(datos, h, { alPublicar }) {
  const { el, t, numero } = h;
  const editor = doc => {
    const actual = datos[doc];
    const area = el('textarea', { id: `campo-${doc}`, rows: 14, class: 'terminos-editor' });
    area.value = actual.secciones.map(x => `${x.titulo}\n${x.texto}`).join('\n\n');
    const mensaje = h.caja();
    const publicar = h.botonAccion(t('terminos.admin.publicar', { n: numero(actual.version + 1) }), '', mensaje, async () => {
      const secciones = area.value.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
        const [titulo, ...resto] = b.split('\n');
        return { titulo: titulo.trim(), texto: resto.join('\n').trim() };
      });
      if (!secciones.length || secciones.some(x => !x.titulo || !x.texto)) throw new Error(t('error.terminos_no_validos'));
      if (!confirm(t('terminos.admin.confirmar', { n: numero(actual.version + 1) }))) return;
      const r = await h.api('POST', '/api/admin/terminos', { doc, secciones });
      if (!r.ok) throw new Error(h.textoError(r.datos.error));
      h.avisar(t('terminos.admin.listo', { n: numero(r.datos[doc].version) }));
      await alPublicar();
    }, 'marca');
    return el('details', {},
      el('summary', { texto: t(doc === 'terminos' ? 'terminos.admin.editar' : 'terminos.admin.editar_privacidad', { n: numero(actual.version) }) }),
      el('p', { class: 'ayuda', texto: t('terminos.admin.ayuda') }),
      el('label', { for: `campo-${doc}`, texto: t('terminos.admin.texto') }), area,
      el('div', { class: 'botones' }, publicar), mensaje);
  };
  // 0.11.0: lo que se llenó por Junior en los textos del informe legal: que lo confirme o lo cambie.
  const revisar = el('div', { class: 'aviso terminos-revisa', role: 'note' },
    el('strong', { texto: t('terminos.admin.revisa') }),
    el('ul', {}, ['reembolso', 'devolucion', 'activacion', 'chat', 'alojamiento', 'contacto', 'retencion'].map(k => el('li', { texto: t(TEXTO_REVISA[k]) }))),
    el('p', { class: 'chica', texto: t('terminos.admin.revisa.linea') }));
  return el('section', { class: 'tarjeta', 'aria-labelledby': 'terminos-admin-titulo' },
    el('h2', { id: 'terminos-admin-titulo', class: 'con-icono' }, h.icono('manual'), el('span', { texto: t('terminos.admin.titulo') })),
    revisar,
    el('p', { class: 'suave', texto: t('terminos.admin.linea2', { t: numero(datos.terminos.version), p: numero(datos.privacidad.version), si: numero(datos.aceptaron), total: numero(datos.cuentas) }) }),
    editor('terminos'), editor('privacidad'));
}
