// Academia 0.9.2: «Ayuda / Soporte». La persona le escribe al administrador (categoría, mensaje, hasta 3 capturas) y
// conversan en un hilo; el administrador ve todos en Administrador → Ayuda. La app agrega sola el contexto (pantalla,
// versión, equipo, hora y, si viene de una pregunta, su número). Solo se carga en estas pantallas.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

export const CATEGORIAS = Object.freeze(['app', 'pregunta', 'cuenta', 'pagos', 'otro']);
const TEXTO_CATEGORIA = { datos: 'soporte.cat.datos', app: 'soporte.cat.app', pregunta: 'soporte.cat.pregunta', cuenta: 'soporte.cat.cuenta', pagos: 'soporte.cat.pagos', otro: 'soporte.cat.otro', error: 'soporte.cat.error' };
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
    c.tamano ? [el('dt', { texto: t('reportar.c.tamano') }), el('dd', { texto: c.tamano })] : null,
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
    el('span', { class: 'ficha-intento-estado' }, insigniaEstado(h, x.estado), x.vence && x.estado !== 'resuelto' ? h.insignia('atencion', t('soporte.vence', { fecha: x.vence })) : null, x.sinLeerAlumno && !href.startsWith('#soporte') ? h.insignia('bien', t('soporte.nueva_respuesta')) : null, h.icono('flecha', 'icono chico'))));
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
    // 0.14.26: «Reportar un problema» (con captura y el contexto que se agrega solo).
    el('section', { class: 'tarjeta' },
      el('p', { class: 'suave', texto: t('reportar.config.linea') }),
      el('a', { class: 'boton-enlace secundario con-icono', href: '#ayuda-mia/reportar' }, h.icono('atencion'), el('span', { texto: t('reportar.boton') }))),
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
      x.vence ? el('p', { class: 'aviso', texto: t('soporte.vence', { fecha: x.vence }) }) : null,
      el('p', { class: 'suave' }, el('a', { href: `#alumno/${x.usuarioId}`, texto: `${x.nombreVisible ?? ''} (@${x.usuario ?? '—'})` })),
      contextoDe(h, x.contexto),
      hilo(h, x, '/api/admin/soporte'),
      el('label', { for: 'soporte-admin-respuesta', texto: t('soporte.admin.tu_respuesta') }), texto,
      el('label', { for: 'soporte-admin-estado', texto: t('soporte.admin.estado') }), estado,
      el('div', { class: 'botones' }, responder), mensaje),
  ];
}

// ---------- 0.14.26: «Reportar un problema» ----------
// Un texto, una captura opcional (de la galería: el navegador no puede sacar una foto de la pantalla solo) y lo que la
// app agrega sola. La captura se achica aquí a 1600 px o menos y se manda como JPG de 500 KB o menos.
export const CAPTURA_LADO = 1600;
export const CAPTURA_MAXIMA = 500 * 1024;
export const ESTADOS_REPORTE = Object.freeze(['nuevo', 'visto', 'arreglado', 'no_error']);
const TONO_REPORTE = { nuevo: 'atencion', visto: 'info', arreglado: 'bien', no_error: 'info' };

// El tamaño nuevo (sin agrandar nunca), con el lado más largo en «maximo» o menos.
export function medidasCaptura(ancho, alto, maximo = CAPTURA_LADO) {
  const a = Math.max(1, Math.round(Number(ancho) || 1));
  const b = Math.max(1, Math.round(Number(alto) || 1));
  const f = Math.min(1, maximo / Math.max(a, b));
  return { ancho: Math.max(1, Math.round(a * f)), alto: Math.max(1, Math.round(b * f)) };
}

// Lo que la app agrega sola: SOLO estos campos (nunca lo escrito en una casilla, nunca una contraseña). De la
// dirección se queda solo la pantalla (lo que va después de «?» se quita).
export function contextoReporte({ pantalla, version, navegador, ancho, alto, idioma }) {
  return {
    pantalla: String(pantalla ?? '').split(/[?&]/)[0].slice(0, 120) || null,
    version: version ? String(version).slice(0, 20) : null,
    navegador: navegador ? String(navegador).slice(0, 300) : null,
    tamano: Number.isFinite(ancho) && Number.isFinite(alto) ? `${Math.round(ancho)}x${Math.round(alto)}` : null,
    idioma: idioma === 'en' ? 'en' : 'es',
  };
}

// El reporte como texto para pegárselo al programador.
export function textoParaProgramador(r, { fecha = x => x } = {}) {
  const c = r.contexto ?? {};
  const lineas = [
    `Reporte #${r.id} · ${r.reporte?.estado ?? 'nuevo'}`,
    `Quién: ${r.nombreVisible ?? '—'} (@${r.usuario ?? '—'})`,
    `Cuándo: ${c.hora ? fecha(c.hora) : r.creado ?? '—'}`,
    `Pantalla: ${c.pantalla ?? '—'}`,
    `Versión de la app: ${c.version ?? '—'}`,
    `Equipo / navegador: ${c.navegador ?? '—'}`,
    `Tamaño de pantalla: ${c.tamano ?? '—'} · Idioma: ${c.idioma ?? '—'}`,
    `Captura: ${r.reporte?.captura ? 'sí (en Administrador → Reportes)' : 'no'}`,
    '',
    'Lo que pasó:',
    r.mensajes?.[0]?.texto ?? r.resumen ?? '',
  ];
  const resto = (r.mensajes ?? []).slice(1);
  if (resto.length) lineas.push('', 'Mensajes después:', ...resto.map(m => `- ${m.de === 'admin' ? 'Administrador' : 'Alumno'}: ${m.texto}`));
  if (r.reporte?.notas) lineas.push('', 'Notas del administrador:', r.reporte.notas);
  return lineas.join('\n');
}

// Un archivo de imagen → un canvas achicado (sin «blob:»: la página solo deja cargar imágenes «data:»).
async function lienzoDe(archivo) {
  let fuente;
  try { fuente = await createImageBitmap(archivo); } catch {
    const url = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); });
    fuente = new Image();
    await new Promise((ok, mal) => { fuente.onload = ok; fuente.onerror = mal; fuente.src = url; });
  }
  const m = medidasCaptura(fuente.width, fuente.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = m.ancho;
  lienzo.height = m.alto;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, m.ancho, m.alto);
  ctx.drawImage(fuente, 0, 0, m.ancho, m.alto);
  return lienzo;
}
// JPG de 500 KB o menos: baja la calidad y, si hace falta, el tamaño.
async function jpegDe(lienzo) {
  let actual = lienzo;
  for (let intento = 0; intento < 6; intento++) {
    for (const calidad of [0.85, 0.72, 0.6, 0.5]) {
      const b = await new Promise(ok => actual.toBlob(ok, 'image/jpeg', calidad));
      if (b && b.size <= CAPTURA_MAXIMA) return b;
    }
    const otro = document.createElement('canvas');
    otro.width = Math.max(1, Math.round(actual.width * 0.75));
    otro.height = Math.max(1, Math.round(actual.height * 0.75));
    otro.getContext('2d').drawImage(actual, 0, 0, otro.width, otro.height);
    actual = otro;
  }
  throw new Error('captura');
}

export function vistaReportar(h) {
  const { el, t } = h;
  const contexto = contextoReporte({ pantalla: h.pantallaAnterior ? `#${h.pantallaAnterior}` : null, version: h.version, navegador: navigator.userAgent, ancho: window.innerWidth, alto: window.innerHeight, idioma: h.idioma });
  const texto = el('textarea', { id: 'reportar-texto', rows: 6, maxlength: 4000, placeholder: t('reportar.texto.muestra') });
  const archivo = el('input', { id: 'reportar-captura', type: 'file', accept: 'image/*' });
  const previa = el('canvas', { class: 'reportar-vista-previa', hidden: true, 'aria-label': t('reportar.captura.previa') });
  const nota = el('p', { class: 'suave chica', texto: t('reportar.captura.ayuda') });
  let lienzo = null;
  archivo.addEventListener('change', async () => {
    lienzo = null;
    previa.hidden = true;
    const f = archivo.files?.[0];
    if (!f) { nota.textContent = t('reportar.captura.ayuda'); return; }
    if (!/^image\//.test(f.type)) { nota.textContent = t('reportar.captura.tipo'); archivo.value = ''; return; }
    try {
      lienzo = await lienzoDe(f);
      previa.width = lienzo.width;
      previa.height = lienzo.height;
      previa.getContext('2d').drawImage(lienzo, 0, 0);
      previa.hidden = false;
      nota.textContent = t('reportar.captura.lista', { ancho: h.numero(lienzo.width), alto: h.numero(lienzo.height) });
    } catch { nota.textContent = t('reportar.captura.tipo'); archivo.value = ''; }
  });
  const mensaje = h.caja();
  const enviar = h.botonAccion(t('reportar.enviar'), '', mensaje, async () => {
    const jpg = lienzo ? await jpegDe(lienzo).catch(() => { throw new Error(t('reportar.captura.grande')); }) : null;
    const r = await h.api('POST', '/api/soporte/reporte', { texto: texto.value, contexto });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    if (jpg) {
      const x = await fetch(`/api/soporte/${r.datos.ticket.id}/captura`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Oportia': '1', 'Content-Type': 'image/jpeg' }, body: jpg });
      if (!x.ok) h.avisar(h.textoError((await x.json().catch(() => ({}))).error ?? 'desconocido'), 'mal');
    }
    h.avisar(t('reportar.enviado'));
    location.hash = `#ayuda-mia/${r.datos.ticket.id}`;
  }, 'flecha');
  const lista = [
    [t('soporte.c.pantalla'), contexto.pantalla ?? '—'], [t('soporte.c.version'), contexto.version ?? '—'],
    [t('soporte.c.equipo'), contexto.navegador ?? '—'], [t('reportar.c.tamano'), contexto.tamano ?? '—'], [t('soporte.c.hora'), t('reportar.c.hora_al_enviar')],
  ];
  return [
    el('a', { class: 'volver con-icono', href: '#ayuda-mia' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('soporte.titulo') })),
    el('h1', { class: 'titulo-pantalla', texto: t('reportar.titulo') }),
    el('section', { class: 'tarjeta' },
      el('p', { class: 'suave', texto: t('reportar.linea') }),
      el('label', { for: 'reportar-texto', texto: t('reportar.que_paso') }), texto,
      el('label', { for: 'reportar-captura', texto: t('reportar.captura') }), archivo, nota, previa,
      el('details', { class: 'soporte-contexto-detalle' }, el('summary', { texto: t('reportar.contexto') }),
        el('dl', { class: 'ficha-datos soporte-contexto' }, lista.flatMap(([a, b]) => [el('dt', { texto: a }), el('dd', { texto: b })])),
        el('p', { class: 'suave chica', texto: t('reportar.privado') })),
      el('div', { class: 'botones' }, enviar), mensaje),
  ];
}

const insigniaReporte = (h, e) => h.insignia(TONO_REPORTE[e] ?? 'info', h.t(`reportar.estado.${ESTADOS_REPORTE.includes(e) ? e : 'nuevo'}`));

export function vistaAdminReportes(datos, h) {
  const { el, t } = h;
  const fila = r => el('li', {}, el('a', { class: 'ficha-intento', href: `#reportes/${r.id}` },
    el('span', { class: 'ficha-nota', texto: `#${r.id}` }),
    el('span', { class: 'ficha-intento-texto' },
      el('strong', { texto: r.resumen }),
      el('span', { class: 'ficha-intento-lugar', texto: r.contexto?.pantalla ?? '—' }),
      el('span', { class: 'suave chica', texto: [`@${r.usuario ?? '—'}`, h.fecha(r.creado), r.reporte.captura ? t('reportar.con_captura') : null].filter(Boolean).join(' · ') })),
    el('span', { class: 'ficha-intento-estado' }, insigniaReporte(h, r.reporte.estado), h.icono('flecha', 'icono chico'))));
  const abiertos = datos.reportes.filter(r => ['nuevo', 'visto'].includes(r.reporte.estado));
  const cerrados = datos.reportes.filter(r => !['nuevo', 'visto'].includes(r.reporte.estado));
  return [
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('atencion'), el('span', { texto: h.tn('reportar.admin.titulo', { n: h.numero(datos.nuevos) }) })),
      abiertos.length ? el('ul', { class: 'ficha-intentos' }, abiertos.map(fila)) : h.vacio('bien', t('reportar.admin.vacio'))),
    cerrados.length ? el('section', { class: 'tarjeta' }, el('h2', { texto: t('reportar.admin.cerrados') }), el('ul', { class: 'ficha-intentos' }, cerrados.map(fila))) : null,
  ];
}

export function vistaAdminReporte(datos, h) {
  const { el, t } = h;
  const r = datos.reporte;
  const estado = el('select', { id: 'reporte-estado' }, ESTADOS_REPORTE.map(e => el('option', { value: e, texto: t(`reportar.estado.${e}`), selected: e === r.reporte.estado || null })));
  const notas = el('textarea', { id: 'reporte-notas', rows: 4, maxlength: 4000 });
  notas.value = r.reporte.notas ?? '';
  const mensaje = h.caja();
  const guardar = h.botonAccion(t('reportar.admin.guardar'), '', mensaje, async () => {
    const x = await h.api('POST', `/api/admin/reportes/${r.id}`, { estado: estado.value, notas: notas.value });
    if (!x.ok) throw new Error(h.textoError(x.datos.error));
    h.avisar(t('reportar.admin.guardado'));
    await h.recargar();
  }, 'bien');
  const paraCopiar = textoParaProgramador(r, { fecha: h.fecha });
  const copia = el('textarea', { class: 'reporte-texto-programador', rows: 10, readonly: true, 'aria-label': t('reportar.admin.copiar') });
  copia.value = paraCopiar;
  const copiar = el('button', { type: 'button', class: 'secundario con-icono', onclick: async () => {
    try { await navigator.clipboard.writeText(paraCopiar); h.avisar(t('reportar.admin.copiado')); } catch { copia.select(); h.avisar(t('reportar.admin.copiar_a_mano'), 'info'); }
  } }, h.icono('marca'), el('span', { texto: t('reportar.admin.copiar') }));
  const src = `/api/admin/reportes/${r.id}/captura`;
  return [
    el('a', { class: 'volver con-icono', href: '#reportes' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('admin.pestana.reportes') })),
    el('section', { class: 'tarjeta' },
      el('div', { class: 'ficha-cuenta-cabeza' }, el('h1', { class: 'ficha-nombre', texto: t('reportar.admin.uno', { n: r.id }) }), insigniaReporte(h, r.reporte.estado)),
      el('p', { class: 'suave' }, el('a', { href: `#alumno/${r.usuarioId}`, texto: `${r.nombreVisible ?? ''} (@${r.usuario ?? '—'})` }), ' · ', el('a', { href: `#soporte/${r.id}`, texto: t('reportar.admin.hilo') })),
      h.talCual('p', r.mensajes?.[0]?.texto ?? '', 'soporte-texto'),
      r.reporte.captura ? el('a', { href: src, target: '_blank', rel: 'noopener', 'aria-label': t('soporte.ampliar') }, el('img', { src, class: 'reportar-captura', alt: t('reportar.captura'), loading: 'lazy' })) : el('p', { class: 'suave', texto: t('reportar.sin_captura') }),
      contextoDe(h, r.contexto),
      el('label', { for: 'reporte-estado', texto: t('soporte.admin.estado') }), estado,
      el('label', { for: 'reporte-notas', texto: t('reportar.admin.notas') }), notas,
      el('div', { class: 'botones' }, guardar), mensaje),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('manual'), el('span', { texto: t('reportar.admin.programador') })),
      el('p', { class: 'suave', texto: t('reportar.admin.programador.linea') }),
      copia, el('div', { class: 'botones' }, copiar)),
  ];
}
