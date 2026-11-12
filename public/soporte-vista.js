// Academia 0.9.2: «Ayuda / Soporte». La persona le escribe al administrador (categoría, mensaje, hasta 3 capturas) y
// conversan en un hilo; el administrador ve todos en Administrador → Ayuda. La app agrega sola el contexto (pantalla,
// versión, equipo, hora y, si viene de una pregunta, su número). Solo se carga en estas pantallas.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

export const CATEGORIAS = Object.freeze(['app', 'pregunta', 'cuenta', 'pagos', 'otro']);
const TEXTO_CATEGORIA = { app: 'soporte.cat.app', pregunta: 'soporte.cat.pregunta', cuenta: 'soporte.cat.cuenta', pagos: 'soporte.cat.pagos', otro: 'soporte.cat.otro' };
const TEXTO_ESTADO = { nuevo: 'soporte.estado.nuevo', revision: 'soporte.estado.revision', resuelto: 'soporte.estado.resuelto' };
const TONO_ESTADO = { nuevo: 'atencion', revision: 'info', resuelto: 'bien' };
export const IMAGEN_MAXIMA = 5 * 1024 * 1024;
export const TIPOS_IMAGEN = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

// ¿Sirven estas capturas? → null o la clave del error.
export function problemaCapturas(archivos) {
  if (archivos.length > 3) return 'soporte_imagenes';
  if (archivos.some(a => !TIPOS_IMAGEN.includes(a.type))) return 'soporte_imagen_tipo';
  if (archivos.some(a => a.size > IMAGEN_MAXIMA)) return 'demasiado_grande';
  return null;
}

function hilo(h, ticket, base) {
  const { el, t } = h;
  return el('ol', { class: 'soporte-hilo' }, ticket.mensajes.map(m => el('li', { class: `soporte-mensaje de-${m.de}` },
    el('p', { class: 'soporte-quien suave chica', texto: `${m.de === 'admin' ? t('soporte.admin') : ticket.nombreVisible ?? t('soporte.tu')} · ${h.fecha(m.en)}` }),
    h.talCual('p', m.texto, 'soporte-texto'),
    m.imagenes.length ? el('div', { class: 'soporte-imagenes' }, m.imagenes.map(i => {
      const src = `${base}/${ticket.id}/imagenes/${m.k}/${i}`;
      return el('a', { href: src, target: '_blank', rel: 'noopener', class: 'soporte-imagen', 'aria-label': t('soporte.ampliar') }, el('img', { src, alt: t('soporte.captura', { n: h.numero(i + 1) }), loading: 'lazy' }));
    })) : null)));
}
function contextoDe(h, c) {
  const { el, t } = h;
  if (!c) return null;
  return el('dl', { class: 'ficha-datos soporte-contexto' },
    el('dt', { texto: t('soporte.c.pantalla') }), el('dd', { texto: c.pantalla ?? '—' }),
    el('dt', { texto: t('soporte.c.pregunta') }), el('dd', { texto: c.pregunta ?? '—' }),
    el('dt', { texto: t('soporte.c.version') }), el('dd', { texto: c.version ?? '—' }),
    el('dt', { texto: t('soporte.c.equipo') }), el('dd', { texto: c.navegador ?? '—' }),
    el('dt', { texto: t('soporte.c.hora') }), el('dd', { texto: c.hora ? h.fecha(c.hora) : '—' }));
}
const insigniaEstado = (h, e) => h.insignia(TONO_ESTADO[e] ?? 'info', h.t(TEXTO_ESTADO[e] ?? 'soporte.estado.nuevo'));
function filaTicket(h, x, href) {
  const { el, t } = h;
  return el('li', {}, el('a', { class: 'ficha-intento', href },
    el('span', { class: 'ficha-nota', texto: `#${x.id}` }),
    el('span', { class: 'ficha-intento-texto' },
      el('strong', { texto: t(TEXTO_CATEGORIA[x.categoria] ?? 'soporte.cat.otro') }),
      el('span', { class: 'ficha-intento-lugar', texto: x.resumen }),
      el('span', { class: 'suave chica', texto: [x.usuario && href.startsWith('#soporte') ? `@${x.usuario}` : null, h.fecha(x.actualizado)].filter(Boolean).join(' · ') })),
    el('span', { class: 'ficha-intento-estado' }, insigniaEstado(h, x.estado), x.sinLeerAlumno && !href.startsWith('#soporte') ? h.insignia('bien', t('soporte.nueva_respuesta')) : null, h.icono('flecha', 'icono chico'))));
}

// ---------- La persona: escribir y ver los suyos ----------
export function vistaMisAyudas(datos, h, { pregunta = null } = {}) {
  const { el, t } = h;
  const categoria = el('select', { id: 'soporte-categoria' }, CATEGORIAS.map(c => el('option', { value: c, texto: t(TEXTO_CATEGORIA[c]), selected: (pregunta ? c === 'pregunta' : c === 'app') || null })));
  const texto = el('textarea', { id: 'soporte-texto', rows: 5, maxlength: 4000, placeholder: t(pregunta ? 'soporte.texto.muestra_pregunta' : 'soporte.texto.muestra') });
  const capturas = el('input', { id: 'soporte-capturas', type: 'file', accept: TIPOS_IMAGEN.join(','), multiple: true });
  const elegidas = el('p', { class: 'suave chica', texto: t('soporte.capturas.ayuda') });
  capturas.addEventListener('change', () => {
    const lista = [...capturas.files];
    const problema = problemaCapturas(lista);
    elegidas.textContent = problema ? h.textoError(problema) : lista.length ? lista.map(a => a.name).join(', ') : t('soporte.capturas.ayuda');
    elegidas.classList.toggle('tono-atencion', Boolean(problema));
  });
  const mensaje = h.caja();
  const enviar = h.botonAccion(t('soporte.enviar'), '', mensaje, async () => {
    const archivos = [...capturas.files];
    const problema = problemaCapturas(archivos);
    if (problema) throw new Error(h.textoError(problema));
    const contexto = { pantalla: h.pantallaAnterior ?? null, version: h.version ?? null, navegador: navigator.userAgent, pregunta };
    const r = await h.api('POST', '/api/soporte', { categoria: categoria.value, texto: texto.value, contexto });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    for (const archivo of archivos) {
      const x = await fetch(`/api/soporte/${r.datos.ticket.id}/imagenes`, { method: 'POST', headers: { 'X-Oportia': '1', 'Content-Type': archivo.type }, body: archivo });
      if (!x.ok) h.avisar(h.textoError((await x.json().catch(() => ({}))).error ?? 'desconocido'), 'mal');
    }
    h.avisar(t('soporte.enviado'));
    location.hash = `#mi-ayuda/${r.datos.ticket.id}`;
  }, 'flecha');
  return [
    el('h1', { class: 'titulo-pantalla', texto: t('soporte.titulo') }),
    el('section', { class: 'tarjeta soporte-nuevo' },
      el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('soporte.nuevo') })),
      el('p', { class: 'suave', texto: t('soporte.linea') }),
      pregunta ? el('p', { class: 'aviso', texto: t('soporte.de_pregunta', { id: pregunta }) }) : null,
      el('label', { for: 'soporte-categoria', texto: t('soporte.categoria') }), categoria,
      el('label', { for: 'soporte-texto', texto: t('soporte.mensaje') }), texto,
      el('label', { for: 'soporte-capturas', texto: t('soporte.capturas') }), capturas, elegidas,
      el('p', { class: 'ayuda', texto: t('soporte.contexto_auto') }),
      el('div', { class: 'botones' }, enviar), mensaje),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('fila'), el('span', { texto: t('soporte.mios') })),
      datos.tickets.length ? el('ul', { class: 'ficha-intentos' }, datos.tickets.map(x => filaTicket(h, x, `#mi-ayuda/${x.id}`))) : h.vacio('chispa', t('soporte.mios.vacio'))),
  ];
}

export function vistaMiTicket(datos, h) {
  const { el, t } = h;
  const x = datos.ticket;
  const texto = el('textarea', { id: 'soporte-respuesta', rows: 3, maxlength: 4000 });
  const mensaje = h.caja();
  const responder = h.botonAccion(t('soporte.responder'), '', mensaje, async () => {
    const r = await h.api('POST', `/api/soporte/${x.id}/mensajes`, { texto: texto.value });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    await h.recargar();
  }, 'flecha');
  return [
    el('a', { class: 'volver con-icono', href: '#mi-ayuda' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('soporte.titulo') })),
    el('section', { class: 'tarjeta' },
      el('div', { class: 'ficha-cuenta-cabeza' }, el('h1', { class: 'ficha-nombre', texto: `#${x.id} · ${t(TEXTO_CATEGORIA[x.categoria] ?? 'soporte.cat.otro')}` }), insigniaEstado(h, x.estado)),
      hilo(h, x, '/api/soporte'),
      el('label', { for: 'soporte-respuesta', texto: t('soporte.agregar') }), texto,
      el('div', { class: 'botones' }, responder), mensaje),
  ];
}

// ---------- El administrador ----------
export function vistaAdminSoporte(datos, h) {
  const { el, t } = h;
  const abiertos = datos.tickets.filter(x => x.estado !== 'resuelto');
  const resueltos = datos.tickets.filter(x => x.estado === 'resuelto');
  return [
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('soporte.admin.titulo', { n: h.numero(datos.pendientes) }) })),
      abiertos.length ? el('ul', { class: 'ficha-intentos' }, abiertos.map(x => filaTicket(h, x, `#soporte/${x.id}`))) : h.vacio('bien', t('soporte.admin.vacio'))),
    resueltos.length ? el('section', { class: 'tarjeta' },
      el('h2', { texto: t('soporte.estado.resuelto') }),
      el('ul', { class: 'ficha-intentos' }, resueltos.map(x => filaTicket(h, x, `#soporte/${x.id}`)))) : null,
  ];
}

export function vistaAdminTicket(datos, h) {
  const { el, t } = h;
  const x = datos.ticket;
  const texto = el('textarea', { id: 'soporte-admin-respuesta', rows: 4, maxlength: 4000 });
  const estado = el('select', { id: 'soporte-admin-estado' }, ['nuevo', 'revision', 'resuelto'].map(e => el('option', { value: e, texto: t(TEXTO_ESTADO[e]), selected: e === x.estado || null })));
  const mensaje = h.caja();
  const responder = h.botonAccion(t('soporte.admin.responder'), '', mensaje, async () => {
    const r = await h.api('POST', `/api/admin/soporte/${x.id}`, { texto: texto.value, estado: estado.value });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('soporte.admin.listo'));
    await h.recargar();
  }, 'flecha');
  return [
    el('a', { class: 'volver con-icono', href: '#soporte' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('admin.pestana.soporte') })),
    el('section', { class: 'tarjeta' },
      el('div', { class: 'ficha-cuenta-cabeza' },
        el('h1', { class: 'ficha-nombre', texto: `#${x.id} · ${t(TEXTO_CATEGORIA[x.categoria] ?? 'soporte.cat.otro')}` }), insigniaEstado(h, x.estado)),
      el('p', { class: 'suave' }, el('a', { href: `#alumno/${x.usuarioId}`, texto: `${x.nombreVisible ?? ''} (@${x.usuario ?? '—'})` })),
      contextoDe(h, x.contexto),
      hilo(h, x, '/api/admin/soporte'),
      el('label', { for: 'soporte-admin-respuesta', texto: t('soporte.admin.tu_respuesta') }), texto,
      el('label', { for: 'soporte-admin-estado', texto: t('soporte.admin.estado') }), estado,
      el('div', { class: 'botones' }, responder), mensaje),
  ];
}
