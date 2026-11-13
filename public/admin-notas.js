// Academia 0.14.6: «Notas» (Administrador → Alumnos → Notas). Solo se carga en esas pantallas (los alumnos nunca bajan este
// archivo). Las piezas de dibujo (el, t, icono…) llegan de app.js en «h», así este módulo no importa nada (sin ciclos).
//  - #notas: una tabla, una fila por alumno y una columna por materia (las 11) y el oral; abajo el promedio del grupo.
//  - #notas/<materia>: cada tema de esa materia (o cada capítulo del oral con #notas/oral, o los temas de un capítulo).
//  - #notas/alumno/<n.º>: todas sus notas, materia por materia y tema por tema.
//  - #notas/comparar/<n.º,n.º>: 2 a 6 alumnos lado a lado, con el tema más débil de cada uno marcado.
// La tabla se desliza de lado DENTRO de su caja (la página nunca), con la primera columna fija. Todo texto va con textContent.
// Los datos salen de GET /api/admin/academia/notas (src/academia/notas.js), una sola vez para todas estas pantallas.

export const UMBRALES_NOTA = Object.freeze({ bien: 70, regular: 50 });
export const MAXIMO_COMPARAR_NOTAS = 6;
// Igual que en el servidor (test/notas.test.js revisa que coincidan): verde ≥ 70, ámbar 50–69, rojo < 50, gris sin empezar.
export function tonoNota(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return 'nada';
  const n = Number(pct);
  return n >= UMBRALES_NOTA.bien ? 'bien' : n >= UMBRALES_NOTA.regular ? 'regular' : 'mal';
}
// La dirección → qué pantalla. null: no es de Notas.
export function rutaNotas(seccion) {
  if (seccion === 'notas') return { vista: 'todas' };
  const alumno = /^notas\/alumno\/(\d{1,9})$/.exec(seccion);
  if (alumno) return { vista: 'alumno', id: Number(alumno[1]) };
  const comparar = /^notas\/comparar\/(\d{1,9}(?:,\d{1,9}){1,9})$/.exec(seccion);
  if (comparar) return { vista: 'comparar', ids: [...new Set(comparar[1].split(',').map(Number))] };
  const materia = /^notas\/([a-z0-9_-]+)$/.exec(seccion);
  if (materia) return { vista: 'materia', id: materia[1] };
  return null;
}
// El orden de la tabla: «nombre» o «general» (la nota general, de mayor a menor; sin examen al final). Empate: por nombre.
export const ORDENES_NOTAS = Object.freeze(['nombre', 'general']);
const nombreDe = a => a.nombreVisible || a.nombre;
export function ordenarNotas(lista, orden = 'nombre') {
  const nombre = a => String(nombreDe(a) ?? '').toLocaleLowerCase('es');
  const porNombre = (a, b) => nombre(a).localeCompare(nombre(b), 'es') || a.id - b.id;
  const general = a => (a.general?.conExamen ? a.general.pct : -1);
  return [...lista].sort(orden === 'general' ? (a, b) => general(b) - general(a) || porNombre(a, b) : porNombre);
}

// ---------- Piezas ----------
const tituloTema = (h, t) => h.partirTitulo(t.titulo).es || t.id;
function nombreColumna(h, d, id) {
  if (id === 'oral') return h.t('notas.col.oral');
  const c = d.oral.capitulos.find(x => x.id === id);
  return c ? h.t('notas.capitulo', { n: h.numero(c.numero), nombre: h.nombreMateria(id) }) : h.nombreMateria(id);
}
// Una nota: «85 %» con su color y una letra chica que dice de dónde sale (E examen, P práctica); sin nota, «—».
function nota(h, c, { etiqueta = 'span', clase = '', debil = false, sinFuente = false } = {}) {
  const tono = tonoNota(c?.pct);
  const fuente = c && !sinFuente ? h.t(c.fuente === 'examen' ? 'notas.fuente.examen.largo' : 'notas.fuente.practica.largo') : null;
  return h.el(etiqueta, { class: `nt nt-${tono}${debil ? ' nt-debil' : ''} ${clase}`.trim(), title: fuente ?? (c ? null : h.t('notas.sin_empezar')) },
    h.el('strong', { class: 'nt-pct', texto: c ? h.pctTexto(c.pct) : '—' }),
    fuente ? h.el('span', { class: 'nt-fuente', 'aria-label': fuente, texto: h.t(c.fuente === 'examen' ? 'notas.fuente.examen' : 'notas.fuente.practica') }) : null,
    debil ? h.el('span', { class: 'nt-debil-marca', texto: h.t('notas.debil.marca') }) : null);
}
const celda = (h, c, opciones = {}) => nota(h, c, { ...opciones, etiqueta: 'td', clase: 'nt-celda' });
const promedio = (h, pct) => celda(h, pct == null ? null : { pct, fuente: null }, { sinFuente: true });
function leyenda(h) {
  const { el, t } = h;
  return el('div', { class: 'notas-leyenda' },
    ['bien', 'regular', 'mal', 'nada'].map(tono => el('span', { class: `nt nt-${tono} notas-leyenda-item`, texto: t(`notas.leyenda.${tono}`) })),
    el('span', { class: 'suave chica', texto: t('notas.leyenda.fuente') }));
}
function volver(h, href, clave) {
  return h.el('a', { class: 'volver con-icono', href }, h.icono('flecha', 'icono chico volver-icono'), h.el('span', { texto: h.t(clave) }));
}
// La tabla con la primera columna fija, dentro de una caja que se desliza de lado.
function tabla(h, { cabeza, filas, pie = null, etiqueta }) {
  const { el } = h;
  return el('div', { class: 'notas-caja', role: 'region', 'aria-label': etiqueta, tabindex: '0' },
    el('table', { class: 'notas-tabla' },
      el('thead', {}, el('tr', {}, cabeza)),
      el('tbody', {}, filas),
      pie ? el('tfoot', {}, el('tr', {}, pie)) : null));
}
const th = (h, contenido, clase = '') => h.el('th', { scope: 'col', class: `notas-th ${clase}`.trim() }, contenido);
function quien(h, a, { marcar = null } = {}) {
  const { el } = h;
  return el('th', { scope: 'row', class: 'notas-quien' },
    el('span', { class: 'notas-quien-caja' },
      marcar,
      el('a', { class: 'notas-quien-enlace', href: `#notas/alumno/${a.id}` },
        h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'chico' }),
        el('span', { class: 'notas-nombre', texto: nombreDe(a) }))));
}
function textoDebil(h, d, debil) {
  if (!debil) return h.t('notas.debil.ninguno');
  const m = d.materias.find(x => x.id === debil.materia) ?? d.oral.capitulos.find(x => x.id === debil.materia);
  const t = m?.temas.find(x => x.id === debil.tema);
  return h.t('notas.debil', { tema: t ? tituloTema(h, t) : debil.tema, materia: nombreColumna(h, d, debil.materia), pct: h.pctTexto(debil.pct) });
}

// ---------- #notas ----------
function vistaTodas(d, h, { orden: ordenInicial = 'nombre', alOrdenar = null } = {}) {
  const { el, t, numero } = h;
  let orden = ORDENES_NOTAS.includes(ordenInicial) ? ordenInicial : 'nombre';
  const marcados = new Set();
  const boton = el('a', { class: 'boton-enlace con-icono notas-comparar-boton', href: '#notas', 'aria-disabled': 'true' }, h.icono('grafica', 'icono chico'), el('span', { texto: t('notas.comparar.boton', { n: numero(0) }) }));
  const ayuda = el('p', { class: 'suave chica', role: 'status', texto: t('notas.comparar.ayuda', { max: numero(MAXIMO_COMPARAR_NOTAS) }) });
  const pintarBoton = () => {
    const n = marcados.size;
    const listo = n >= 2 && n <= MAXIMO_COMPARAR_NOTAS;
    boton.lastChild.textContent = t('notas.comparar.boton', { n: numero(n) });
    boton.setAttribute('aria-disabled', listo ? 'false' : 'true');
    boton.href = listo ? `#notas/comparar/${[...marcados].join(',')}` : '#notas';
    ayuda.textContent = n > MAXIMO_COMPARAR_NOTAS ? t('notas.comparar.demasiados', { max: numero(MAXIMO_COMPARAR_NOTAS) }) : t('notas.comparar.ayuda', { max: numero(MAXIMO_COMPARAR_NOTAS) });
  };
  boton.addEventListener('click', e => { if (boton.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
  const columnas = [...d.materias.map(m => m.id), ...(d.oral.hay ? ['oral'] : [])];
  const filas = new Map(d.alumnos.map(a => {
    const casilla = el('input', { type: 'checkbox', class: 'ficha-marcar notas-marcar', 'aria-label': t('notas.comparar.marcar', { nombre: nombreDe(a) }) });
    casilla.addEventListener('change', () => { if (casilla.checked) marcados.add(a.id); else marcados.delete(a.id); pintarBoton(); });
    return [a.id, el('tr', { 'data-alumno': String(a.id) },
      quien(h, a, { marcar: d.alumnos.length > 1 ? casilla : null }),
      celda(h, a.general.conExamen ? { pct: a.general.pct, fuente: 'examen' } : null, { clase: 'notas-general', sinFuente: true }),
      columnas.map(id => celda(h, id === 'oral' ? a.oral : a.materias[id])))];
  }));
  const cuerpo = [];
  const caja = tabla(h, {
    etiqueta: t('notas.titulo'),
    cabeza: [th(h, t('notas.col.alumno'), 'notas-quien'), th(h, t('notas.col.general'), 'notas-general'),
      columnas.map(id => th(h, el('a', { class: 'notas-col-enlace', href: `#notas/${id}` }, el('span', { texto: id === 'oral' ? t('notas.col.oral') : h.nombreMateria(id) }))))],
    filas: cuerpo,
    pie: [el('th', { scope: 'row', class: 'notas-quien', texto: t('notas.promedio') }), promedio(h, d.promedios.general),
      columnas.map(id => promedio(h, id === 'oral' ? d.promedios.oral : d.promedios.materias[id]))],
  });
  const tbody = caja.querySelector('tbody');
  const pintar = () => tbody.replaceChildren(...ordenarNotas(d.alumnos, orden).map(a => filas.get(a.id)));
  const botones = ORDENES_NOTAS.map(id => el('button', { type: 'button', class: 'ficha-filtro', 'data-orden': id, 'aria-pressed': String(id === orden), texto: t(`notas.orden.${id}`),
    onclick: () => { orden = id; botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.orden === orden))); pintar(); alOrdenar?.(orden); } }));
  pintar();
  return el('section', { class: 'tarjeta notas' },
    el('h1', { class: 'titulo-pantalla con-icono' }, h.icono('medalla'), el('span', { texto: t('notas.titulo') })),
    el('p', { class: 'suave', texto: t('notas.linea') }),
    el('div', { class: 'botones notas-enlaces' },
      el('a', { class: 'boton-enlace secundario con-icono', href: '#como-van' }, h.icono('grafica', 'icono chico'), el('span', { texto: t('notas.como_van') })),
      el('a', { class: 'boton-enlace secundario con-icono', href: '#alumnos' }, h.icono('personas', 'icono chico'), el('span', { texto: t('notas.alumnos') }))),
    d.alumnos.length ? [
      leyenda(h),
      d.alumnos.length > 1 ? el('div', { class: 'ficha-filtros', role: 'group', 'aria-label': t('notas.orden') }, el('span', { class: 'suave chica', texto: t('notas.orden') }), botones) : null,
      d.alumnos.length > 1 ? el('div', { class: 'ficha-comparar-barra notas-comparar-barra' }, boton, ayuda) : null,
      el('p', { class: 'suave chica notas-deslizar', texto: t('notas.deslizar') }),
      caja,
      el('p', { class: 'suave chica', texto: t('notas.general.nota') }),
    ] : h.vacio('personas', t('notas.vacio')));
}

// ---------- #notas/<materia>, #notas/oral y #notas/<capítulo del oral> ----------
function vistaMateria(d, h, id) {
  const { el, t } = h;
  const materia = d.materias.find(m => m.id === id);
  const capitulo = d.oral.capitulos.find(c => c.id === id);
  const esOral = id === 'oral' && d.oral.hay;
  if (!materia && !capitulo && !esOral) return el('section', { class: 'tarjeta notas' }, volver(h, '#notas', 'notas.volver'), h.vacio('atencion', t('notas.no_existe')));
  // Las columnas: los temas (o, en el oral, el oral entero y cada capítulo).
  const columnas = esOral
    ? d.oral.capitulos.map(c => ({ clave: c.id, nombre: nombreColumna(h, d, c.id), href: `#notas/${c.id}`, de: a => a.capitulos[c.id], prom: d.promedios.capitulos[c.id] }))
    : (materia ?? capitulo).temas.map((tm, i) => ({ clave: `${id}/${tm.id}`, nombre: `${i + 1}. ${tituloTema(h, tm)}`, href: null, de: a => a.temas[`${id}/${tm.id}`], prom: d.promedios.temas[`${id}/${tm.id}`] }));
  const total = esOral ? { de: a => a.oral, prom: d.promedios.oral, nombre: t('notas.oral.final') }
    : materia ? { de: a => a.materias[id], prom: d.promedios.materias[id], nombre: t('notas.total_materia') }
      : { de: a => a.capitulos[id], prom: d.promedios.capitulos[id], nombre: t('notas.total_capitulo') };
  const titulo = esOral ? t('notas.oral.titulo') : t('notas.materia.titulo', { materia: nombreColumna(h, d, id) });
  const otras = [...d.materias.filter(m => !m.pronto).map(m => ({ id: m.id, nombre: h.nombreMateria(m.id) })), ...(d.oral.hay ? [{ id: 'oral', nombre: t('notas.col.oral') }] : []),
    ...(capitulo || esOral ? d.oral.capitulos.map(c => ({ id: c.id, nombre: nombreColumna(h, d, c.id) })) : [])];
  const vacia = materia?.pronto;
  return el('section', { class: `tarjeta notas${materia ? ` ${h.claseMateria(id)}` : ''}` },
    volver(h, capitulo ? '#notas/oral' : '#notas', capitulo ? 'notas.volver_oral' : 'notas.volver'),
    el('h1', { class: 'titulo-pantalla', texto: titulo }),
    el('p', { class: 'suave', texto: esOral ? t('notas.oral.linea') : t('notas.materia.linea') }),
    otras.length > 1 ? el('nav', { class: 'notas-otras', 'aria-label': t('notas.otras') }, el('span', { class: 'suave chica', texto: t('notas.otras') }),
      otras.map(x => el('a', { class: 'cv-comparar-enlace', href: `#notas/${x.id}`, 'aria-current': x.id === id ? 'page' : null, texto: x.nombre }))) : null,
    vacia ? h.vacio('libro', t('notas.materia.pronto')) : !d.alumnos.length ? h.vacio('personas', t('notas.vacio')) : [
      leyenda(h),
      el('p', { class: 'suave chica notas-deslizar', texto: t('notas.deslizar') }),
      tabla(h, {
        etiqueta: titulo,
        cabeza: [th(h, t('notas.col.alumno'), 'notas-quien'), th(h, total.nombre, 'notas-general'),
          columnas.map(c => th(h, c.href ? el('a', { class: 'notas-col-enlace', href: c.href }, el('span', { texto: c.nombre })) : el('span', { class: 'notas-col-tema', texto: c.nombre })))],
        filas: ordenarNotas(d.alumnos, 'nombre').map(a => el('tr', {}, quien(h, a), celda(h, total.de(a), { clase: 'notas-general' }), columnas.map(c => celda(h, c.de(a))))),
        pie: [el('th', { scope: 'row', class: 'notas-quien', texto: t('notas.promedio') }), promedio(h, total.prom), columnas.map(c => promedio(h, c.prom))],
      }),
    ]);
}

// ---------- #notas/alumno/<n.º> ----------
function listaDeTemas(h, a, materiaId, temas, debil) {
  const { el } = h;
  return el('ul', { class: 'notas-lista' }, temas.map((tm, i) => {
    const clave = `${materiaId}/${tm.id}`;
    return el('li', { class: 'notas-lista-fila' },
      el('span', { class: 'notas-lista-nombre', texto: `${i + 1}. ${tituloTema(h, tm)}` }),
      nota(h, a.temas[clave], { debil: debil?.clave === clave }));
  }));
}
function bloqueMateria(h, a, { id, nombre, total, temas, debil, href }) {
  const { el } = h;
  const algo = total || temas.some(tm => a.temas[`${id}/${tm.id}`]);
  return el('details', { class: 'notas-bloque', open: algo ? true : null },
    el('summary', { class: 'notas-bloque-cabeza' },
      el('span', { class: 'notas-bloque-nombre', texto: nombre }),
      nota(h, total)),
    temas.length ? listaDeTemas(h, a, id, temas, debil) : el('p', { class: 'suave chica', texto: h.t('notas.materia.pronto') }),
    href ? el('a', { class: 'notas-ver-materia', href, texto: h.t('notas.ver_todos') }) : null);
}
function vistaAlumno(d, h, id) {
  const { el, t } = h;
  const a = d.alumnos.find(x => x.id === id);
  if (!a) return el('section', { class: 'tarjeta notas' }, volver(h, '#notas', 'notas.volver'), h.vacio('personas', t('notas.alumno.no_existe')));
  return el('section', { class: 'tarjeta notas' },
    volver(h, '#notas', 'notas.volver'),
    el('div', { class: 'notas-alumno-cabeza' },
      h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'grande' }),
      el('div', {},
        el('h1', { class: 'titulo-pantalla', texto: t('notas.alumno.titulo', { nombre: nombreDe(a) }) }),
        el('p', { class: 'notas-alumno-general' }, el('span', { texto: t('notas.col.general') }),
          nota(h, a.general.conExamen ? { pct: a.general.pct, fuente: 'examen' } : null, { sinFuente: true }),
          el('span', { class: 'suave chica', texto: t('notas.aprobados', { n: h.numero(a.general.aprobados), total: h.numero(a.general.total) }) })),
        el('p', { class: `notas-alumno-debil${a.debil ? ' hay' : ''}`, texto: textoDebil(h, d, a.debil) }),
        el('a', { class: 'notas-ver-materia', href: `#alumno/${a.id}`, texto: t('notas.alumno.ficha') }))),
    leyenda(h),
    el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: t('notas.test_guide') })),
    d.materias.map(m => bloqueMateria(h, a, { id: m.id, nombre: h.nombreMateria(m.id), total: a.materias[m.id], temas: m.temas, debil: a.debil, href: m.pronto ? null : `#notas/${m.id}` })),
    d.oral.hay ? [
      el('h2', { class: 'con-icono' }, h.icono('radio'), el('span', { texto: t('notas.oral.titulo') })),
      el('p', { class: 'notas-alumno-general' }, el('span', { texto: t('notas.oral.final') }), nota(h, a.oral)),
      d.oral.capitulos.map(c => bloqueMateria(h, a, { id: c.id, nombre: nombreColumna(h, d, c.id), total: a.capitulos[c.id], temas: c.temas, debil: a.debil, href: `#notas/${c.id}` })),
    ] : null);
}

// ---------- #notas/comparar/<n.º,n.º> ----------
function vistaComparar(d, h, ids) {
  const { el, t } = h;
  const lista = ids.map(id => d.alumnos.find(a => a.id === id)).filter(Boolean).slice(0, MAXIMO_COMPARAR_NOTAS);
  if (lista.length < 2) return el('section', { class: 'tarjeta notas' }, volver(h, '#notas', 'notas.volver'), h.vacio('personas', t('notas.comparar.faltan')));
  const cabezas = lista.map(a => th(h, el('a', { class: 'notas-col-enlace', href: `#notas/alumno/${a.id}` }, el('span', { texto: nombreDe(a) }))));
  const bloque = ({ id, nombre, total, temas }) => {
    const algo = lista.some(a => total(a) || temas.some(tm => a.temas[`${id}/${tm.id}`]));
    return el('details', { class: 'notas-bloque', open: algo ? true : null },
      el('summary', { class: 'notas-bloque-cabeza' }, el('span', { class: 'notas-bloque-nombre', texto: nombre })),
      tabla(h, {
        etiqueta: nombre,
        cabeza: [th(h, t('notas.col.tema'), 'notas-quien'), cabezas.map(x => x.cloneNode(true))],
        filas: [
          el('tr', { class: 'notas-fila-total' }, el('th', { scope: 'row', class: 'notas-quien', texto: t('notas.total_materia') }), lista.map(a => celda(h, total(a)))),
          ...temas.map((tm, i) => el('tr', {}, el('th', { scope: 'row', class: 'notas-quien notas-quien-tema', texto: `${i + 1}. ${tituloTema(h, tm)}` }),
            lista.map(a => celda(h, a.temas[`${id}/${tm.id}`], { debil: a.debil?.clave === `${id}/${tm.id}` })))),
        ],
      }));
  };
  return el('section', { class: 'tarjeta notas' },
    volver(h, '#notas', 'notas.volver'),
    el('h1', { class: 'titulo-pantalla', texto: t('notas.comparar.titulo') }),
    el('p', { class: 'suave', texto: t('notas.comparar.linea') }),
    el('ul', { class: 'notas-comparar-cabezas' }, lista.map(a => el('li', { class: 'notas-comparar-cabeza' },
      el('a', { class: 'notas-quien-enlace', href: `#notas/alumno/${a.id}` }, h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'medio' }), el('strong', { texto: nombreDe(a) })),
      el('p', { class: 'notas-alumno-general' }, el('span', { texto: t('notas.col.general') }), nota(h, a.general.conExamen ? { pct: a.general.pct, fuente: 'examen' } : null, { sinFuente: true })),
      el('p', { class: `notas-alumno-debil${a.debil ? ' hay' : ''}`, texto: textoDebil(h, d, a.debil) })))),
    leyenda(h),
    el('p', { class: 'suave chica notas-deslizar', texto: t('notas.deslizar') }),
    el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: t('notas.test_guide') })),
    d.materias.filter(m => !m.pronto).map(m => bloque({ id: m.id, nombre: h.nombreMateria(m.id), total: a => a.materias[m.id], temas: m.temas })),
    d.oral.hay ? [
      el('h2', { class: 'con-icono' }, h.icono('radio'), el('span', { texto: t('notas.oral.titulo') })),
      d.oral.capitulos.map(c => bloque({ id: c.id, nombre: nombreColumna(h, d, c.id), total: a => a.capitulos[c.id], temas: c.temas })),
    ] : null);
}

// La pantalla que toca. ruta: lo de rutaNotas(). opciones: el orden elegido de #notas (se recuerda mientras la app sigue abierta).
export function vistaNotas(d, h, ruta, opciones = {}) {
  if (ruta?.vista === 'materia') return vistaMateria(d, h, ruta.id);
  if (ruta?.vista === 'alumno') return vistaAlumno(d, h, ruta.id);
  if (ruta?.vista === 'comparar') return vistaComparar(d, h, ruta.ids);
  return vistaTodas(d, h, opciones);
}
