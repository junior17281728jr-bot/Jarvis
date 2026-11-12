// Academia 0.9.2: Administrador → Alumnos → «Contratos firmados». Cada aceptación de los términos (cada versión, de
// cada persona) queda para siempre: la lista, cada contrato como un documento (el texto de esa versión, la declaración,
// el nombre como firmó, la firma dibujada, fecha y hora, IP, navegador y las huellas) y «Descargar PDF» (imprimir) de
// uno o de todos juntos. Solo se carga aquí. Las piezas llegan de app.js en «h» (este módulo no importa nada).

export function vistaListaContratos(datos, h) {
  const { el, t, numero } = h;
  const lista = datos.contratos;
  return [
    el('a', { class: 'volver con-icono', href: '#alumnos' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.alumnos.volver') })),
    el('section', { class: 'tarjeta' },
      el('h1', { class: 'titulo-pantalla', texto: t('contratos.titulo') }),
      el('p', { class: 'suave', texto: t('contratos.linea') }),
      lista.length ? el('a', { class: 'boton-enlace secundario con-icono', href: '#contratos/todos' }, h.icono('manual', 'icono chico'), el('span', { texto: t('contratos.todos', { n: numero(lista.length) }) })) : null,
      lista.length ? el('ul', { class: 'contratos-lista' }, lista.map(c => el('li', {},
        el('a', { class: 'ficha-intento', href: `#contrato/${c.usuarioId}/${c.n}` },
          el('span', { class: 'ficha-nota', texto: `v${c.version}` }),
          el('span', { class: 'ficha-intento-texto' },
            el('strong', { texto: c.firmado }),
            el('span', { class: 'suave chica', texto: [`@${c.usuario ?? '—'}`, h.fecha(c.en), c.bloqueado ? t('admin.inactivo') : null, c.menor ? t('contratos.menor') : null, c.conFirma ? null : t('contratos.sin_dibujo')].filter(Boolean).join(' · ') })),
          h.icono('flecha', 'icono chico'))))) : h.vacio('manual', t('contratos.vacio'))),
  ];
}

// Un contrato como documento (para ver e imprimir). firma(c, tutor) → la dirección de la imagen de la firma.
const firmaAdmin = (c, tutor) => `/api/admin/contratos/${c.usuarioId}/${c.n}/${tutor ? 'firma-tutor' : 'firma'}`;
const marca = (si, h) => (si === true ? '☑' : si === false ? '☐' : '—');
export function documentoContrato(c, h, { firma = firmaAdmin } = {}) {
  const { el, t, numero } = h;
  const huella = (x, ok) => (x ? `${x} ${ok ? '✓' : '✗'}` : '—');
  const texto = d => el('div', { class: 'contrato-texto' }, d.secciones.map(x => el('section', {}, el('h3', { texto: x.titulo }), h.talCual('p', x.texto))));
  return el('article', { class: 'reporte-hoja contrato-hoja' },
    el('header', { class: 'reporte-cabeza' },
      el('div', {}, el('p', { class: 'reporte-app', texto: h.nombreApp }), el('h1', { texto: t('contratos.documento') })),
      el('div', { class: 'reporte-cabeza-datos' },
        el('p', { texto: t('contratos.versiones', { t: numero(c.version), p: c.versionPrivacidad ? numero(c.versionPrivacidad) : '—' }) }),
        el('p', { texto: `@${c.usuario ?? '—'} · ${t('contratos.firma_n', { n: numero(c.n) })}` }))),
    el('h2', { class: 'contrato-titulo', texto: t('terminos.titulo') }), texto(c.terminos),
    c.privacidad ? [el('h2', { class: 'contrato-titulo', texto: t('privacidad.titulo') }), texto(c.privacidad)] : null,
    el('p', { class: 'terminos-declaracion', texto: c.declaracion }),
    el('ul', { class: 'contrato-casillas' },
      el('li', { texto: `${marca(true)} ${t('terminos.yo_acepto', { nombre: c.firmado, n: numero(c.version) })}` }),
      c.versionPrivacidad ? el('li', { texto: `${marca(true)} ${t('terminos.acepto_privacidad', { n: numero(c.versionPrivacidad) })}` }) : null,
      c.aceptoIa != null ? el('li', { texto: `${marca(c.aceptoIa)} ${t('terminos.acepto_ia')}` }) : null),
    el('div', { class: 'contrato-firma' },
      c.firmaSha256 ? el('img', { src: firma(c, false), alt: t('contratos.firma_de', { nombre: c.firmado }) }) : el('p', { class: 'suave', texto: t('contratos.sin_dibujo') }),
      el('p', { class: 'contrato-nombre', texto: c.firmado })),
    c.tutor ? el('section', { class: 'contrato-tutor' },
      el('h3', { texto: t('terminos.tutor.titulo') }),
      el('p', { texto: `${marca(true)} ${t('terminos.tutor.acepto')}` }),
      el('p', { texto: t('contratos.tutor', { nombre: c.tutor.nombre, relacion: c.tutor.relacion, contacto: c.tutor.contacto }) }),
      el('div', { class: 'contrato-firma' }, el('img', { src: firma(c, true), alt: t('contratos.firma_de', { nombre: c.tutor.nombre }) }), el('p', { class: 'contrato-nombre', texto: c.tutor.nombre }))) : null,
    el('dl', { class: 'ficha-datos contrato-datos' },
      el('dt', { texto: t('contratos.fecha') }), el('dd', { texto: `${h.fecha(c.en)} (${c.en})` }),
      el('dt', { texto: t('contratos.usuario') }), el('dd', { texto: `@${c.usuario ?? '—'} (id ${c.usuarioId})` }),
      el('dt', { texto: t('terminos.nacimiento') }), el('dd', { texto: c.nacimiento ? `${c.nacimiento}${c.menor ? ` · ${t('contratos.menor')}` : ''}` : '—' }),
      el('dt', { texto: 'IP' }), el('dd', { texto: c.ip ?? '—' }),
      el('dt', { texto: t('contratos.navegador') }), el('dd', { texto: c.navegador ?? '—' }),
      c.verificacion !== undefined ? [el('dt', { texto: t('contratos.verificacion') }), el('dd', { texto: c.verificacion ? `${c.verificacion.nota} (${h.fecha(c.verificacion.en)})` : t('contratos.sin_verificar') })] : null,
      el('dt', { texto: t('contratos.huella_texto') }), el('dd', { class: 'contrato-huella', texto: huella(c.textoSha256, c.textoVerificado) }),
      el('dt', { texto: t('contratos.huella_privacidad') }), el('dd', { class: 'contrato-huella', texto: huella(c.privacidadSha256, c.privacidadVerificada) }),
      el('dt', { texto: t('contratos.huella_firma') }), el('dd', { class: 'contrato-huella', texto: huella(c.firmaSha256, c.firmaVerificada) }),
      c.tutor ? [el('dt', { texto: t('contratos.huella_tutor') }), el('dd', { class: 'contrato-huella', texto: huella(c.tutor.firmaSha256, c.tutor.firmaVerificada) })] : null),
    el('p', { class: 'reporte-pie suave chica', texto: t('contratos.pie') }));
}

export function vistaContrato(datos, h) {
  const { el, t } = h;
  return [
    el('div', { class: 'botones reporte-acciones' },
      el('a', { class: 'volver con-icono', href: '#contratos' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('contratos.titulo') })),
      el('button', { type: 'button', class: 'secundario con-icono', onclick: () => window.print() }, h.icono('manual'), el('span', { texto: t('reporte.pdf') }))),
    documentoContrato(datos.contrato, h),
  ];
}

// Todos juntos (una página para imprimir): se piden uno por uno.
export function vistaTodos(datos, h) {
  const { el, t } = h;
  const hoja = el('div', { class: 'reporte-hoja contratos-todos' }, el('p', { class: 'cargando', texto: t('reporte.preparando') }));
  (async () => {
    const docs = [];
    for (const c of datos.contratos) {
      const r = await h.api('GET', `/api/admin/contratos/${c.usuarioId}/${c.n}`);
      if (r.ok) docs.push(documentoContrato(r.datos.contrato, h));
    }
    hoja.replaceChildren(...(docs.length ? docs : [el('p', { class: 'suave', texto: t('contratos.vacio') })]));
  })();
  return [
    el('div', { class: 'botones reporte-acciones' },
      el('a', { class: 'volver con-icono', href: '#contratos' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('contratos.titulo') })),
      el('button', { type: 'button', class: 'secundario con-icono', onclick: () => window.print() }, h.icono('manual'), el('span', { texto: t('contratos.pdf_todos') }))),
    hoja,
  ];
}
