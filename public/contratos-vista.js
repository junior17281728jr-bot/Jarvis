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
        el('a', { class: 'ficha-intento', href: `#contrato/${c.usuarioId}/${c.version}` },
          el('span', { class: 'ficha-nota', texto: `v${c.version}` }),
          el('span', { class: 'ficha-intento-texto' },
            el('strong', { texto: c.firmado }),
            el('span', { class: 'suave chica', texto: [`@${c.usuario ?? '—'}`, h.fecha(c.en), c.bloqueado ? t('admin.inactivo') : null, c.conFirma ? null : t('contratos.sin_dibujo')].filter(Boolean).join(' · ') })),
          h.icono('flecha', 'icono chico'))))) : h.vacio('manual', t('contratos.vacio'))),
  ];
}

// Un contrato como documento (para ver e imprimir).
export function documentoContrato(c, h) {
  const { el, t, numero } = h;
  return el('article', { class: 'reporte-hoja contrato-hoja' },
    el('header', { class: 'reporte-cabeza' },
      el('div', {}, el('p', { class: 'reporte-app', texto: h.nombreApp }), el('h1', { texto: t('terminos.titulo') })),
      el('div', { class: 'reporte-cabeza-datos' }, el('p', { texto: t('terminos.version', { n: numero(c.version) }) }), el('p', { texto: `@${c.usuario ?? '—'}` }))),
    el('div', { class: 'contrato-texto' }, c.terminos.secciones.map(s => el('section', {}, el('h3', { texto: s.titulo }), h.talCual('p', s.texto)))),
    el('p', { class: 'terminos-declaracion', texto: c.declaracion }),
    el('p', { class: 'contrato-acepto', texto: t('terminos.yo_acepto', { nombre: c.firmado, n: numero(c.version) }) }),
    el('div', { class: 'contrato-firma' },
      c.firmaSha256 ? el('img', { src: `/api/admin/contratos/${c.usuarioId}/${c.version}/firma`, alt: t('contratos.firma_de', { nombre: c.firmado }) }) : el('p', { class: 'suave', texto: t('contratos.sin_dibujo') }),
      el('p', { class: 'contrato-nombre', texto: c.firmado })),
    el('dl', { class: 'ficha-datos contrato-datos' },
      el('dt', { texto: t('contratos.fecha') }), el('dd', { texto: `${h.fecha(c.en)} (${c.en})` }),
      el('dt', { texto: t('contratos.usuario') }), el('dd', { texto: `@${c.usuario ?? '—'} (id ${c.usuarioId})` }),
      el('dt', { texto: 'IP' }), el('dd', { texto: c.ip ?? '—' }),
      el('dt', { texto: t('contratos.navegador') }), el('dd', { texto: c.navegador ?? '—' }),
      el('dt', { texto: t('contratos.huella_texto') }), el('dd', { class: 'contrato-huella', texto: c.textoSha256 ? `${c.textoSha256} ${c.textoVerificado ? '✓' : '✗'}` : '—' }),
      el('dt', { texto: t('contratos.huella_firma') }), el('dd', { class: 'contrato-huella', texto: c.firmaSha256 ? `${c.firmaSha256} ${c.firmaVerificada ? '✓' : '✗'}` : '—' })),
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
      const r = await h.api('GET', `/api/admin/contratos/${c.usuarioId}/${c.version}`);
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
