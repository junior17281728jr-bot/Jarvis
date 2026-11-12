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
// 0.12.1: el documento, más claro (en pantalla y en el PDF): la cabecera, el cuadro de quién firmó qué, el índice, los
// textos en partes numeradas, lo que aceptó, el recuadro de la firma y los datos de la firma en una tabla.
export function documentoContrato(c, h, { firma = firmaAdmin } = {}) {
  const { el, t, numero } = h;
  const huella = (x, ok) => (x ? `${x} ${ok ? '✓' : '✗'}` : '—');
  const texto = (d, doc) => el('div', { class: 'contrato-texto' }, d.secciones.map((x, i) => el('section', { id: `doc-${c.n}-${doc}-${i + 1}` },
    el('h3', {}, /^\d+[.)]/.test(x.titulo) ? null : el('span', { class: 'contrato-n', texto: `${i + 1}.` }), el('span', { texto: x.titulo })), h.talCual('p', x.texto))));
  const fila = (nombre, valor, clase = null) => el('tr', {}, el('th', { scope: 'row', texto: nombre }), el('td', { class: clase, texto: valor }));
  const cajaFirma = (src, nombre, alt) => el('figure', { class: 'contrato-firma' },
    el('div', { class: 'contrato-firma-caja' }, src ? el('img', { src, alt }) : el('p', { class: 'suave', texto: t('contratos.sin_dibujo') })),
    el('figcaption', {}, el('span', { class: 'contrato-nombre', texto: nombre }), el('span', { class: 'suave chica', texto: h.fecha(c.en) })));
  const docs = [['terminos', 'terminos.titulo', c.terminos], ...(c.privacidad ? [['privacidad', 'privacidad.titulo', c.privacidad]] : [])];
  return el('article', { class: 'reporte-hoja contrato-hoja' },
    el('header', { class: 'reporte-cabeza contrato-cabeza' },
      el('div', {}, el('p', { class: 'reporte-app', texto: h.nombreApp }), el('h1', { texto: t('contratos.documento') }),
        el('p', { class: 'contrato-estado', texto: t('contratos.estado_firmado', { fecha: h.fecha(c.en) }) })),
      el('div', { class: 'reporte-cabeza-datos' },
        el('p', { texto: t('contratos.versiones', { t: numero(c.version), p: c.versionPrivacidad ? numero(c.versionPrivacidad) : '—' }) }),
        el('p', { texto: `@${c.usuario ?? '—'} · ${t('contratos.firma_n', { n: numero(c.n) })}` }))),
    // De un vistazo: quién, cuándo y qué aceptó.
    el('table', { class: 'contrato-tabla contrato-resumen' },
      el('caption', { texto: t('contratos.resumen') }),
      el('tbody', {},
        fila(t('contratos.firmado_por'), c.firmado),
        fila(t('contratos.fecha'), h.fecha(c.en)),
        fila(t('terminos.titulo'), t('terminos.version', { n: numero(c.version) })),
        c.versionPrivacidad ? fila(t('privacidad.titulo'), t('terminos.version', { n: numero(c.versionPrivacidad) })) : null,
        c.aceptoIa != null ? fila(t('contratos.ia'), t(c.aceptoIa ? 'firma.listo.ia.si' : 'firma.listo.ia.no')) : null,
        c.tutor ? fila(t('terminos.tutor.titulo'), `${c.tutor.nombre} (${c.tutor.relacion})`) : null)),
    el('nav', { class: 'contrato-indice', 'aria-label': t('lee.indice') },
      el('p', { class: 'contrato-indice-titulo', texto: t('lee.indice') }),
      el('ol', {}, docs.map(([doc, titulo, d]) => el('li', {}, el('span', { texto: t(titulo) }),
        el('ul', {}, d.secciones.map((x, i) => el('li', {}, el('a', { href: `#doc-${c.n}-${doc}-${i + 1}`, onclick: e => { e.preventDefault(); document.getElementById(`doc-${c.n}-${doc}-${i + 1}`)?.scrollIntoView({ block: 'start' }); }, texto: x.titulo })))))))),
    docs.map(([doc, titulo, d]) => el('section', { class: 'contrato-doc' }, el('h2', { class: 'contrato-titulo', texto: t(titulo) }), texto(d, doc))),
    el('section', { class: 'contrato-acepto-bloque' },
      el('h2', { class: 'contrato-titulo', texto: t('contratos.lo_que_acepto') }),
      el('p', { class: 'terminos-declaracion', texto: c.declaracion }),
      el('ul', { class: 'contrato-casillas' },
        el('li', { texto: `${marca(true)} ${t('terminos.yo_acepto', { nombre: c.firmado, n: numero(c.version) })}` }),
        c.versionPrivacidad ? el('li', { texto: `${marca(true)} ${t('terminos.acepto_privacidad', { n: numero(c.versionPrivacidad) })}` }) : null,
        c.aceptoIa != null ? el('li', { texto: `${marca(c.aceptoIa)} ${t('terminos.acepto_ia')}` }) : null),
      el('div', { class: 'contrato-firmas' },
        cajaFirma(c.firmaSha256 ? firma(c, false) : null, c.firmado, t('contratos.firma_de', { nombre: c.firmado })),
        c.tutor ? cajaFirma(firma(c, true), c.tutor.nombre, t('contratos.firma_de', { nombre: c.tutor.nombre })) : null),
      c.tutor ? el('div', { class: 'contrato-tutor' },
        el('p', { texto: `${marca(true)} ${t('terminos.tutor.acepto')}` }),
        el('p', { texto: t('contratos.tutor', { nombre: c.tutor.nombre, relacion: c.tutor.relacion, contacto: c.tutor.contacto }) })) : null),
    el('table', { class: 'contrato-tabla contrato-datos' },
      el('caption', { texto: t('contratos.datos_firma') }),
      el('tbody', {},
        fila(t('contratos.fecha'), `${h.fecha(c.en)} (${c.en})`),
        fila(t('contratos.usuario'), `@${c.usuario ?? '—'} (id ${c.usuarioId})`),
        fila(t('terminos.nacimiento'), c.nacimiento ? `${c.nacimiento}${c.menor ? ` · ${t('contratos.menor')}` : ''}` : '—'),
        fila('IP', c.ip ?? '—'),
        fila(t('contratos.navegador'), c.navegador ?? '—'),
        c.verificacion !== undefined ? fila(t('contratos.verificacion'), c.verificacion ? `${c.verificacion.nota} (${h.fecha(c.verificacion.en)})` : t('contratos.sin_verificar')) : null,
        fila(t('contratos.huella_texto'), huella(c.textoSha256, c.textoVerificado), 'contrato-huella'),
        fila(t('contratos.huella_privacidad'), huella(c.privacidadSha256, c.privacidadVerificada), 'contrato-huella'),
        fila(t('contratos.huella_firma'), huella(c.firmaSha256, c.firmaVerificada), 'contrato-huella'),
        c.tutor ? fila(t('contratos.huella_tutor'), huella(c.tutor.firmaSha256, c.tutor.firmaVerificada), 'contrato-huella') : null)),
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
