// Academia 0.14.6: «Notas» (Administrador → Alumnos → Notas). Solo se carga en esas pantallas (los alumnos nunca bajan este
// archivo). Las piezas de dibujo (el, t, icono…) llegan de app.js en «h», así este módulo no importa nada (sin ciclos).
//  - #notas: una tabla, una fila por alumno y una columna por materia (las 11) y el oral; abajo el promedio del grupo.
//  - #notas/<materia>: cada tema de esa materia (o cada capítulo del oral con #notas/oral, o los temas de un capítulo).
//  - #notas/alumno/<n.º>: todas sus notas, materia por materia y tema por tema.
//  - #notas/comparar/<n.º,n.º>: 2 a 6 alumnos lado a lado, con el tema más débil de cada uno marcado.
// La tabla se desliza de lado DENTRO de su caja (la página nunca), con la primera columna fija. Todo texto va con textContent.
// Los datos salen de GET /api/admin/academia/notas (src/academia/notas.js), una sola vez para todas estas pantallas.
// 0.14.25 (pedido del dueño: «la tabla no se entiende»): columnas cortas (M1…M11 y Oral, el nombre al pasar el dedo o el
// ratón y en la lista de abajo), las materias que nadie empezó se esconden («+8 sin empezar»), cada casilla dice el ESTADO
// del examen (✅/❌ con su mejor nota, «A medias» si lo dejó sin terminar, «P» si solo practicó, «—» sin empezar) y «×3»
// cuando lo intentó varias veces. Tocar la casilla abre cada intento en orden («1.ª vez 57 % ❌ · 2.ª vez A medias…»).
// En el teléfono, una tarjeta por alumno en vez de la tabla ancha.

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

// ---------- 0.14.25: el estado de cada examen (sin DOM: test/notas-claras.test.js) ----------
// La casilla de un alumno en una columna (una materia, 'oral' = el examen final del oral, o un capítulo del oral).
// → { tipo: 'examen', pct, aprobado, intentos } | { tipo: 'a_medias', intentos } | { tipo: 'practica', pct } | { tipo: 'nada' }
//  'examen': terminó el examen al menos una vez (su mejor nota y si lo aprobó); 'a_medias': lo empezó y nunca lo terminó
//  (sin número ni %: aunque haya practicado); 'practica': nunca empezó el examen pero practicó; 'nada': sin empezar.
export function estadoCelda(a, id) {
  const ex = a?.examenes?.[id] ?? null;
  const c = id === 'oral' ? a?.oral : (a?.materias && Object.hasOwn(a.materias, id) ? a.materias[id] : a?.capitulos?.[id]) ?? null;
  if (ex?.estado === 'hecho') return { tipo: 'examen', pct: ex.mejor, aprobado: ex.aprobado === true, intentos: ex.intentos };
  if (ex?.estado === 'a_medias') return { tipo: 'a_medias', intentos: ex.intentos };
  if (c?.fuente === 'examen') return { tipo: 'examen', pct: c.pct, aprobado: c.aprobado === true, intentos: c.veces ?? 1 };
  if (c) return { tipo: 'practica', pct: c.pct };
  return { tipo: 'nada' };
}
// Las columnas de #notas: las materias (en el orden de la escuela) y el oral. Las que NADIE empezó (o sin clases) van
// aparte, escondidas detrás de «+N sin empezar». → { visibles: [id], vacias: [id] }
export function columnasNotas(d) {
  const todas = [...d.materias.map(m => m.id), ...(d.oral?.hay ? ['oral'] : [])];
  const visibles = [];
  const vacias = [];
  for (const id of todas) {
    const pronto = d.materias.find(m => m.id === id)?.pronto === true;
    const alguien = !pronto && d.alumnos.some(a => estadoCelda(a, id).tipo !== 'nada');
    (alguien ? visibles : vacias).push(id);
  }
  return { visibles, vacias };
}
// El código corto de una columna: «M1»…«M11» por su lugar en la escuela (no cambia al esconder columnas); el oral, «Oral».
export function codigoColumna(d, id) {
  const i = d.materias.findIndex(m => m.id === id);
  return i >= 0 ? `M${i + 1}` : 'Oral';
}
// Los intentos de un examen, en orden y numerados. → [{ n, estado: 'aprobado' | 'reprobado' | 'a_medias', pct, en }]
// Uno a medias no lleva nota (pct null).
export function lineasIntentos(examen) {
  return (examen?.lista ?? []).map(x => ({
    n: x.n, en: x.en ?? null,
    estado: !x.completo ? 'a_medias' : x.aprobado === true ? 'aprobado' : 'reprobado',
    pct: x.completo ? x.pct : null,
  }));
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

// ---------- 0.14.25: la casilla del examen y la hoja con cada intento ----------
// El nombre completo de una columna (para el «title», la lista de abajo y la hoja de intentos).
function nombreLargo(h, d, id) {
  return id === 'oral' ? h.t('notas.oral.final.largo') : nombreColumna(h, d, id);
}
// El título de la hoja de intentos: «M1 · Factores humanos…»; del oral, solo su nombre.
const tituloHoja = (h, d, id) => (d.materias.some(m => m.id === id) ? `${codigoColumna(d, id)} · ${nombreLargo(h, d, id)}` : nombreLargo(h, d, id));
// Lo que dice una casilla, en palabras (el «title» al pasar el ratón y lo que lee el lector de pantalla).
function describir(h, est) {
  const { t, numero } = h;
  if (est.tipo === 'examen') return t('notas.celda.examen', { pct: h.pctTexto(est.pct), estado: t(est.aprobado ? 'notas.aprobo' : 'notas.no_aprobo'), n: numero(est.intentos) });
  if (est.tipo === 'a_medias') return t('notas.celda.medias', { n: numero(est.intentos) });
  if (est.tipo === 'practica') return t('notas.celda.practica', { pct: h.pctTexto(est.pct) });
  return t('notas.sin_empezar');
}
// La casilla: ✅/❌ con la mejor nota del examen, «A medias», «P 45 %» (solo práctica) o «—». «×3»: las veces que lo
// intentó. alAbrir: con examen (terminado o a medias) es un botón que abre cada intento. codigo: «M1» delante.
function chip(h, est, { codigo = null, nombre = null, alAbrir = null } = {}) {
  const { el, t } = h;
  const conExamen = est.tipo === 'examen' || est.tipo === 'a_medias';
  const clase = est.tipo === 'examen' ? (est.aprobado ? 'cn-si' : 'cn-no') : est.tipo === 'a_medias' ? 'cn-medias' : est.tipo === 'practica' ? 'cn-practica' : 'cn-nada';
  const partes = [
    codigo ? el('span', { class: 'cn-cod', texto: codigo }) : null,
    est.tipo === 'practica' ? el('span', { class: 'cn-p', texto: t('notas.fuente.practica') }) : null,
    el(est.tipo === 'nada' ? 'span' : 'strong', { class: 'cn-pct', texto: est.tipo === 'examen' || est.tipo === 'practica' ? h.pctTexto(est.pct) : est.tipo === 'a_medias' ? t('notas.medias') : '—' }),
    est.tipo === 'examen' ? el('span', { class: 'cn-marca', 'aria-hidden': 'true', texto: est.aprobado ? '✅' : '❌' }) : null,
    conExamen && est.intentos > 1 ? el('span', { class: 'cn-veces', texto: t('notas.veces', { n: h.numero(est.intentos) }) }) : null,
  ];
  const texto = nombre ? `${nombre}: ${describir(h, est)}` : describir(h, est);
  if (alAbrir && conExamen) {
    return el('button', { type: 'button', class: `cn ${clase} cn-boton`, 'aria-haspopup': 'dialog', title: `${texto}. ${t('notas.celda.toca')}`, 'aria-label': `${texto}. ${t('notas.celda.toca')}`, onclick: alAbrir }, partes);
  }
  return el('span', { class: `cn ${clase}`, title: texto }, el('span', { class: 'solo-lectores', texto }), el('span', { 'aria-hidden': 'true' }, partes));
}
// Los intentos de un examen en una lista: «1.ª vez  57 % ❌  10 nov 2026».
function listaIntentos(h, ex) {
  const { el, t } = h;
  if (!ex) return el('p', { class: 'suave', texto: t('notas.intentos.ninguno') });
  if (ex.oral) {
    return el('div', { class: 'notas-intentos-oral' },
      ex.terminados ? el('p', { texto: t('notas.intentos.oral', { n: h.numero(ex.terminados), mejor: h.pctTexto(ex.mejor), final: h.pctTexto(ex.ultimo ?? ex.mejor) }) }) : null,
      ex.abierto ? el('p', { class: 'notas-intentos-medias', texto: t('notas.intentos.oral_abierto') }) : null,
      el('p', { class: 'suave chica', texto: t('notas.intentos.oral_nota') }));
  }
  return el('ol', { class: 'notas-intentos' }, lineasIntentos(ex).map(x => el('li', { class: `notas-intento notas-intento-${x.estado}` },
    el('strong', { class: 'notas-intento-n', texto: t('notas.intento.n', { n: h.numero(x.n) }) }),
    x.estado === 'a_medias'
      ? el('span', { class: 'cn cn-medias' }, el('strong', { class: 'cn-pct', texto: t('notas.medias') }))
      : chip(h, { tipo: 'examen', pct: x.pct, aprobado: x.estado === 'aprobado', intentos: 1 }),
    x.en ? el('span', { class: 'suave chica notas-intento-fecha', texto: h.fecha(x.en) }) : null)));
}
// La hoja (ventana) con cada intento de un alumno en una columna. Escape, «Cerrar» o tocar fuera la cierran.
function abrirIntentos(h, d, a, id, { conEnlace = true } = {}) {
  const { el, t } = h;
  const ex = a.examenes?.[id] ?? null;
  const umbral = ex?.lista?.find(x => x.umbral != null)?.umbral ?? null;
  const hoja = el('dialog', { class: 'hoja-ayuda notas-hoja', 'aria-labelledby': 'notas-hoja-titulo' });
  const cerrar = () => { if (typeof hoja.close === 'function' && hoja.open) hoja.close(); else hoja.remove(); };
  hoja.append(el('div', { class: 'hoja-ayuda-dentro' },
    el('p', { class: 'notas-hoja-quien' }, h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'chico' }), el('strong', { texto: nombreDe(a) })),
    el('h2', { id: 'notas-hoja-titulo', class: 'notas-hoja-titulo', texto: tituloHoja(h, d, id) }),
    el('p', { class: 'suave chica', texto: ex?.oral ? t('notas.intentos.linea_oral') : umbral != null ? t('notas.intentos.linea', { umbral: h.numero(umbral) }) : t('notas.intentos.linea_sin') }),
    listaIntentos(h, ex),
    el('div', { class: 'hoja-ayuda-botones' },
      el('button', { type: 'button', class: 'grande', autofocus: true, texto: t('notas.intentos.cerrar'), onclick: cerrar }),
      conEnlace ? el('a', { class: 'boton-enlace secundario', href: `#notas/alumno/${a.id}`, onclick: cerrar, texto: t('notas.intentos.ver_alumno') }) : null)));
  hoja.addEventListener('click', e => { if (e.target === hoja) cerrar(); });
  hoja.addEventListener('close', () => hoja.remove());
  document.body.append(hoja);
  if (typeof hoja.showModal === 'function') hoja.showModal();
  else hoja.setAttribute('open', '');
  return hoja;
}
// La leyenda de los estados (lo primero que se lee).
function leyendaEstados(h) {
  const { el, t } = h;
  const muestra = (est, clave) => el('li', { class: 'notas-leyenda-fila' }, chip(h, est), el('span', { texto: t(clave) }));
  return el('ul', { class: 'notas-leyenda-estados', 'aria-label': t('notas.leyenda.titulo') },
    muestra({ tipo: 'examen', pct: 94, aprobado: true, intentos: 1 }, 'notas.leyenda.aprobo'),
    muestra({ tipo: 'examen', pct: 57, aprobado: false, intentos: 3 }, 'notas.leyenda.no_aprobo'),
    muestra({ tipo: 'a_medias', intentos: 1 }, 'notas.leyenda.medias'),
    muestra({ tipo: 'practica', pct: 45 }, 'notas.leyenda.practica'),
    muestra({ tipo: 'nada' }, 'notas.leyenda.sin'));
}
// Una casilla de la tabla con el estado.
const celdaEstado = (h, d, a, id, abrir) => h.el('td', { class: 'nt-celda notas-celda-estado' }, chip(h, estadoCelda(a, id), { nombre: nombreLargo(h, d, id), alAbrir: abrir ? () => abrir(a, id) : null }));

// ---------- #notas ----------
function vistaTodas(d, h, { orden: ordenInicial = 'nombre', alOrdenar = null } = {}) {
  const { el, t, numero } = h;
  let orden = ORDENES_NOTAS.includes(ordenInicial) ? ordenInicial : 'nombre';
  let conVacias = false;
  const marcados = new Set();
  const abrir = (a, id) => abrirIntentos(h, d, a, id);
  const boton = el('a', { class: 'boton-enlace con-icono notas-comparar-boton', href: '#notas', 'aria-disabled': 'true' }, h.icono('grafica', 'icono chico'), el('span', { texto: t('notas.comparar.boton', { n: numero(0) }) }));
  const ayuda = el('p', { class: 'suave chica', role: 'status', texto: t('notas.comparar.ayuda', { max: numero(MAXIMO_COMPARAR_NOTAS) }) });
  // Cada alumno tiene su casilla de «Comparar» en la tabla y en su tarjeta (teléfono): las dos dicen lo mismo.
  const casillas = new Map(d.alumnos.map(a => [a.id, []]));
  const pintarBoton = () => {
    const n = marcados.size;
    const listo = n >= 2 && n <= MAXIMO_COMPARAR_NOTAS;
    boton.lastChild.textContent = t('notas.comparar.boton', { n: numero(n) });
    boton.setAttribute('aria-disabled', listo ? 'false' : 'true');
    boton.href = listo ? `#notas/comparar/${[...marcados].join(',')}` : '#notas';
    ayuda.textContent = n > MAXIMO_COMPARAR_NOTAS ? t('notas.comparar.demasiados', { max: numero(MAXIMO_COMPARAR_NOTAS) }) : t('notas.comparar.ayuda', { max: numero(MAXIMO_COMPARAR_NOTAS) });
  };
  const casillaDe = a => {
    if (d.alumnos.length < 2) return null;
    const c = el('input', { type: 'checkbox', class: 'ficha-marcar notas-marcar', 'aria-label': t('notas.comparar.marcar', { nombre: nombreDe(a) }) });
    c.checked = marcados.has(a.id);
    c.addEventListener('change', () => {
      if (c.checked) marcados.add(a.id); else marcados.delete(a.id);
      for (const otra of casillas.get(a.id)) otra.checked = c.checked;
      pintarBoton();
    });
    casillas.get(a.id).push(c);
    return c;
  };
  boton.addEventListener('click', e => { if (boton.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
  const { visibles, vacias } = columnasNotas(d);
  const generalDe = a => (a.general.conExamen ? { pct: a.general.pct, fuente: 'examen' } : null);

  // La tabla (PC y tableta).
  const caja = el('div', { class: 'notas-caja notas-caja-todas', role: 'region', 'aria-label': t('notas.titulo'), tabindex: '0' });
  const filas = new Map();
  // Con «+N sin empezar» abierto, todas en el orden de la escuela (M1…M11, Oral).
  const enOrden = () => (conVacias ? [...d.materias.map(m => m.id), ...(d.oral.hay ? ['oral'] : [])] : visibles);
  const pintarTabla = () => {
    const columnas = enOrden();
    for (const lista of casillas.values()) lista.length = 0;
    for (const a of d.alumnos) {
      filas.set(a.id, el('tr', { 'data-alumno': String(a.id) },
        quien(h, a, { marcar: casillaDe(a) }),
        celda(h, generalDe(a), { clase: 'notas-general', sinFuente: true }),
        columnas.map(id => celdaEstado(h, d, a, id, abrir))));
    }
    // Abajo: cuántos aprobaron el examen de cada columna (más claro que un promedio que mezcla examen y práctica).
    const aprobaron = id => d.alumnos.filter(a => { const e = estadoCelda(a, id); return e.tipo === 'examen' && e.aprobado; }).length;
    caja.replaceChildren(el('table', { class: 'notas-tabla notas-tabla-estados' },
      el('thead', {}, el('tr', {},
        th(h, t('notas.col.alumno'), 'notas-quien'), th(h, t('notas.col.general'), 'notas-general'),
        columnas.map(id => th(h, el('a', { class: 'notas-col-enlace notas-col-cod', href: `#notas/${id}`, title: nombreLargo(h, d, id), 'aria-label': nombreLargo(h, d, id) },
          el('span', { texto: codigoColumna(d, id) })), vacias.includes(id) ? 'notas-th-vacia' : '')))),
      el('tbody', {}, ordenarNotas(d.alumnos, orden).map(a => filas.get(a.id))),
      el('tfoot', {}, el('tr', {},
        el('th', { scope: 'row', class: 'notas-quien', texto: t('notas.aprobaron') }),
        el('td', { class: 'notas-aprobaron' }),
        columnas.map(id => el('td', { class: 'notas-aprobaron', texto: t('notas.aprobaron.n', { n: numero(aprobaron(id)), total: numero(d.alumnos.length) }) }))))));
  };
  // Las tarjetas (teléfono): una por alumno, solo con lo que empezó.
  const tarjetas = el('ul', { class: 'notas-tarjetas', 'aria-label': t('notas.titulo') });
  const pintarTarjetas = () => {
    const todas = [...visibles, ...vacias].filter(id => !d.materias.find(m => m.id === id)?.pronto);
    tarjetas.replaceChildren(...ordenarNotas(d.alumnos, orden).map(a => {
      const empezadas = todas.filter(id => estadoCelda(a, id).tipo !== 'nada');
      const resto = todas.length - empezadas.length;
      return el('li', { class: 'notas-tarjeta', 'data-alumno': String(a.id) },
        el('div', { class: 'notas-tarjeta-cabeza' },
          casillaDe(a),
          el('a', { class: 'notas-quien-enlace', href: `#notas/alumno/${a.id}` },
            h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'chico' }), el('span', { class: 'notas-nombre', texto: nombreDe(a) })),
          el('span', { class: 'notas-tarjeta-general' }, el('span', { class: 'suave chica', texto: t('notas.col.general') }), nota(h, generalDe(a), { sinFuente: true }))),
        empezadas.length
          ? el('div', { class: 'notas-tarjeta-chips' }, empezadas.map(id => chip(h, estadoCelda(a, id), { codigo: codigoColumna(d, id), nombre: nombreLargo(h, d, id), alAbrir: () => abrir(a, id) })))
          : el('p', { class: 'suave chica', texto: t('notas.tarjeta.nada') }),
        empezadas.length && resto ? el('p', { class: 'suave chica notas-tarjeta-resto', texto: t('notas.tarjeta.resto', { n: numero(resto) }) }) : null);
    }));
  };
  const pintar = () => { pintarTabla(); pintarTarjetas(); };
  // Qué es cada columna (M1 = …): las que se ven; las sin empezar, detrás del botón.
  const codigos = el('ul', { class: 'notas-codigos', 'aria-label': t('notas.codigos') });
  const botonVacias = vacias.length ? el('button', { type: 'button', class: 'ficha-filtro notas-vacias-boton', 'aria-expanded': 'false', texto: t('notas.sin_empezar.mas', { n: numero(vacias.length) }) }) : null;
  const pintarCodigos = () => {
    const lista = enOrden();
    codigos.replaceChildren(...lista.map(id => el('li', { class: `notas-codigo${vacias.includes(id) ? ' vacia' : ''}` },
      el('strong', { texto: codigoColumna(d, id) }), el('span', { texto: nombreLargo(h, d, id) }))));
    if (botonVacias) {
      botonVacias.textContent = conVacias ? t('notas.sin_empezar.menos') : t('notas.sin_empezar.mas', { n: numero(vacias.length) });
      botonVacias.setAttribute('aria-expanded', String(conVacias));
      botonVacias.title = conVacias ? '' : t('notas.sin_empezar.cuales', { lista: vacias.map(id => `${codigoColumna(d, id)} ${nombreLargo(h, d, id)}`).join(' · ') });
    }
  };
  if (botonVacias) botonVacias.addEventListener('click', () => { conVacias = !conVacias; pintarTabla(); pintarCodigos(); });
  const botones = ORDENES_NOTAS.map(id => el('button', { type: 'button', class: 'ficha-filtro', 'data-orden': id, 'aria-pressed': String(id === orden), texto: t(`notas.orden.${id}`),
    onclick: () => { orden = id; botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.orden === orden))); pintar(); alOrdenar?.(orden); } }));
  pintar();
  pintarCodigos();
  return el('section', { class: 'tarjeta notas notas-todas' },
    el('h1', { class: 'titulo-pantalla con-icono' }, h.icono('medalla'), el('span', { texto: t('notas.titulo') })),
    el('p', { class: 'suave', texto: t('notas.linea') }),
    el('div', { class: 'botones notas-enlaces' },
      el('a', { class: 'boton-enlace secundario con-icono', href: '#como-van' }, h.icono('grafica', 'icono chico'), el('span', { texto: t('notas.como_van') })),
      el('a', { class: 'boton-enlace secundario con-icono', href: '#alumnos' }, h.icono('personas', 'icono chico'), el('span', { texto: t('notas.alumnos') }))),
    d.alumnos.length ? [
      leyendaEstados(h),
      d.alumnos.length > 1 ? el('div', { class: 'ficha-filtros', role: 'group', 'aria-label': t('notas.orden') }, el('span', { class: 'suave chica', texto: t('notas.orden') }), botones) : null,
      d.alumnos.length > 1 ? el('div', { class: 'ficha-comparar-barra notas-comparar-barra' }, boton, ayuda) : null,
      el('div', { class: 'notas-columnas-barra' }, el('span', { class: 'suave chica', texto: t('notas.toca') }), botonVacias),
      caja,
      tarjetas,
      el('div', { class: 'notas-codigos-caja' }, el('p', { class: 'suave chica', texto: t('notas.codigos') }), codigos),
      el('p', { class: 'suave chica', texto: t('notas.general.nota_corta') }),
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
    ? d.oral.capitulos.map(c => ({ clave: c.id, nombre: nombreColumna(h, d, c.id), href: `#notas/${c.id}`, de: a => a.capitulos[c.id], prom: d.promedios.capitulos[c.id], estado: c.id }))
    : (materia ?? capitulo).temas.map((tm, i) => ({ clave: `${id}/${tm.id}`, nombre: `${i + 1}. ${tituloTema(h, tm)}`, href: null, de: a => a.temas[`${id}/${tm.id}`], prom: d.promedios.temas[`${id}/${tm.id}`] }));
  const total = esOral ? { de: a => a.oral, prom: d.promedios.oral, nombre: t('notas.oral.final') }
    : materia ? { de: a => a.materias[id], prom: d.promedios.materias[id], nombre: t('notas.total_materia') }
      : { de: a => a.capitulos[id], prom: d.promedios.capitulos[id], nombre: t('notas.total_capitulo') };
  // 0.14.25: la casilla de la materia (o del capítulo, o del examen final del oral) dice el estado del examen y abre cada intento.
  const idTotal = esOral ? 'oral' : id;
  const abrir = (a, x) => abrirIntentos(h, d, a, x);
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
      leyendaEstados(h),
      leyenda(h),
      el('p', { class: 'suave chica notas-deslizar', texto: t('notas.deslizar') }),
      tabla(h, {
        etiqueta: titulo,
        cabeza: [th(h, t('notas.col.alumno'), 'notas-quien'), th(h, total.nombre, 'notas-general'),
          columnas.map(c => th(h, c.href ? el('a', { class: 'notas-col-enlace', href: c.href }, el('span', { texto: c.nombre })) : el('span', { class: 'notas-col-tema', texto: c.nombre })))],
        filas: ordenarNotas(d.alumnos, 'nombre').map(a => el('tr', {}, quien(h, a), celdaEstado(h, d, a, idTotal, abrir), columnas.map(c => (c.estado ? celdaEstado(h, d, a, c.estado, abrir) : celda(h, c.de(a)))))),
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
function bloqueMateria(h, a, { id, nombre, temas, debil, href }) {
  const { el } = h;
  const est = estadoCelda(a, id);
  const ex = a.examenes?.[id] ?? null;
  const algo = est.tipo !== 'nada' || temas.some(tm => a.temas[`${id}/${tm.id}`]);
  return el('details', { class: 'notas-bloque', open: algo ? true : null },
    el('summary', { class: 'notas-bloque-cabeza' },
      el('span', { class: 'notas-bloque-nombre', texto: nombre }),
      chip(h, est)),
    // 0.14.25: cada intento del examen, en orden (también los que dejó a medias).
    ex ? el('div', { class: 'notas-bloque-intentos' }, el('h3', { class: 'notas-intentos-titulo', texto: h.t('notas.intentos.lista') }), listaIntentos(h, ex)) : null,
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
    leyendaEstados(h),
    leyenda(h),
    el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: t('notas.test_guide') })),
    d.materias.map(m => bloqueMateria(h, a, { id: m.id, nombre: `${codigoColumna(d, m.id)} · ${h.nombreMateria(m.id)}`, temas: m.temas, debil: a.debil, href: m.pronto ? null : `#notas/${m.id}` })),
    d.oral.hay ? [
      el('h2', { class: 'con-icono' }, h.icono('radio'), el('span', { texto: t('notas.oral.titulo') })),
      el('div', { class: 'notas-bloque notas-bloque-final' },
        el('p', { class: 'notas-alumno-general' }, el('span', { texto: t('notas.oral.final') }), chip(h, estadoCelda(a, 'oral'))),
        a.examenes?.oral ? listaIntentos(h, a.examenes.oral) : null),
      d.oral.capitulos.map(c => bloqueMateria(h, a, { id: c.id, nombre: nombreColumna(h, d, c.id), temas: c.temas, debil: a.debil, href: `#notas/${c.id}` })),
    ] : null);
}

// ---------- #notas/comparar/<n.º,n.º> ----------
function vistaComparar(d, h, ids) {
  const { el, t } = h;
  const lista = ids.map(id => d.alumnos.find(a => a.id === id)).filter(Boolean).slice(0, MAXIMO_COMPARAR_NOTAS);
  if (lista.length < 2) return el('section', { class: 'tarjeta notas' }, volver(h, '#notas', 'notas.volver'), h.vacio('personas', t('notas.comparar.faltan')));
  const abrir = (a, x) => abrirIntentos(h, d, a, x);
  const cabezas = lista.map(a => th(h, el('a', { class: 'notas-col-enlace', href: `#notas/alumno/${a.id}` }, el('span', { texto: nombreDe(a) }))));
  const bloque = ({ id, nombre, total, temas }) => {
    const algo = lista.some(a => total(a) || estadoCelda(a, id).tipo !== 'nada' || temas.some(tm => a.temas[`${id}/${tm.id}`]));
    return el('details', { class: 'notas-bloque', open: algo ? true : null },
      el('summary', { class: 'notas-bloque-cabeza' }, el('span', { class: 'notas-bloque-nombre', texto: nombre })),
      tabla(h, {
        etiqueta: nombre,
        cabeza: [th(h, t('notas.col.tema'), 'notas-quien'), cabezas.map(x => x.cloneNode(true))],
        filas: [
          el('tr', { class: 'notas-fila-total' }, el('th', { scope: 'row', class: 'notas-quien', texto: t('notas.total_materia') }), lista.map(a => celdaEstado(h, d, a, id, abrir))),
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
    leyendaEstados(h),
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
