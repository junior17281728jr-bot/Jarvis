// Academia 0.9.2: el Reporte del administrador (#reporte). Solo se carga ahí (los alumnos nunca bajan este archivo).
// Arriba se eligen las partes (Ranking, Por alumno, Resumen del grupo, Comparación), las fechas, si van los bloqueados
// y a quiénes comparar; se recuerda la última elección (en el servidor, por administrador). Abajo, la hoja: se ve bien
// en el teléfono y en papel A4 («Descargar PDF» = imprimir → Guardar como PDF). «Descargar CSV» baja los números de las
// mismas partes. Los gráficos son SVG hechos aquí (sin librerías); todo texto va con textContent.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

const SVG = 'http://www.w3.org/2000/svg';
const SECCIONES = ['ranking', 'alumnos', 'grupo', 'comparar'];
const TEXTO_SECCION = { ranking: 'reporte.seccion.ranking', alumnos: 'reporte.seccion.alumnos', grupo: 'reporte.seccion.grupo', comparar: 'reporte.seccion.comparar' };
const COLORES = ['#1c8fe0', '#ff8a1f', '#8b5cf6', '#0e9f7e', '#e5484d', '#d39e00'];
const MEDALLA = ['#d4a017', '#9aa4b2', '#b8733d'];

function svg(etiqueta, atributos = {}, texto = null) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v != null) n.setAttribute(k, String(v));
  if (texto != null) n.textContent = texto;
  return n;
}
const recortar = (texto, n) => (String(texto).length > n ? `${String(texto).slice(0, n - 1)}…` : String(texto));

// Barras horizontales: [{ etiqueta, valor (0-100), texto, color?, lugar? }]. Escala fija de 0 a 100.
export function barrasSvg(items, { titulo = '', ancho = 640, etiqueta = 190 } = {}) {
  const fila = 30;
  const alto = items.length * fila + 26;
  const pista = ancho - etiqueta - 70;
  const s = svg('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'reporte-grafico', role: 'img', 'aria-label': titulo, preserveAspectRatio: 'xMinYMin meet' });
  for (const marca of [0, 25, 50, 75, 100]) {
    const x = etiqueta + (pista * marca) / 100;
    s.append(svg('line', { x1: x, y1: 4, x2: x, y2: alto - 20, class: 'rg-guia' }));
    s.append(svg('text', { x, y: alto - 6, class: 'rg-escala', 'text-anchor': 'middle' }, `${marca}`));
  }
  items.forEach((it, k) => {
    const y = 6 + k * fila;
    let dx = 0;
    if (it.lugar && it.lugar <= 3) {
      s.append(svg('circle', { cx: 11, cy: y + 11, r: 10, fill: MEDALLA[it.lugar - 1] }));
      s.append(svg('text', { x: 11, y: y + 15, class: 'rg-medalla', 'text-anchor': 'middle' }, String(it.lugar)));
      dx = 26;
    } else if (it.lugar) {
      s.append(svg('text', { x: 11, y: y + 15, class: 'rg-lugar', 'text-anchor': 'middle' }, String(it.lugar)));
      dx = 26;
    }
    s.append(svg('text', { x: dx, y: y + 15, class: 'rg-etiqueta' }, recortar(it.etiqueta, Math.floor((etiqueta - dx) / 7.4))));
    s.append(svg('rect', { x: etiqueta, y: y + 3, width: pista, height: 16, rx: 8, class: 'rg-pista' }));
    const v = Math.max(0, Math.min(100, Number(it.valor) || 0));
    if (v > 0) s.append(svg('rect', { x: etiqueta, y: y + 3, width: Math.max(8, (pista * v) / 100), height: 16, rx: 8, fill: it.color ?? COLORES[0] }));
    s.append(svg('text', { x: etiqueta + pista + 8, y: y + 15, class: 'rg-valor' }, it.texto ?? `${v} %`));
  });
  return s;
}

// ---------- El formulario de arriba ----------
export function pantallaReporte({ opciones, alumnos }, h) {
  const { el, t } = h;
  let o = { ...opciones };
  const hoja = el('div', { class: 'reporte-hoja', 'aria-live': 'polite' });
  const casillas = SECCIONES.map(id => {
    const c = el('input', { type: 'checkbox', id: `rep-${id}`, checked: o.secciones.includes(id) || null });
    return { id, c, nodo: el('label', { class: 'reporte-casilla', for: `rep-${id}` }, c, el('span', { texto: t(TEXTO_SECCION[id]) })) };
  });
  const desde = el('input', { id: 'rep-desde', type: 'date', value: o.desde ?? '' });
  const hasta = el('input', { id: 'rep-hasta', type: 'date', value: o.hasta ?? '' });
  const bloqueados = el('input', { id: 'rep-bloqueados', type: 'checkbox', checked: o.bloqueados || null });
  const estudiantes = alumnos.filter(a => a.rol === 'usuario');
  const todos = el('input', { id: 'rep-comparar-todos', type: 'checkbox', checked: o.comparar === 'todos' || null });
  const elegir = estudiantes.map(a => {
    const c = el('input', { type: 'checkbox', id: `rep-c-${a.id}`, value: String(a.id), checked: (o.comparar !== 'todos' && o.comparar.includes(a.id)) || null });
    return { a, c, nodo: el('label', { class: 'reporte-casilla chica', for: `rep-c-${a.id}` }, c, el('span', { texto: a.nombreVisible || a.nombre })) };
  });
  const listaComparar = el('div', { class: 'reporte-comparar-lista', hidden: o.comparar === 'todos' || null }, elegir.map(x => x.nodo));
  todos.addEventListener('change', () => { listaComparar.hidden = todos.checked; });
  const mensaje = h.caja();
  let ultimo = null;
  const leerForm = () => ({
    secciones: casillas.filter(x => x.c.checked).map(x => x.id),
    desde: desde.value || null, hasta: hasta.value || null, bloqueados: bloqueados.checked,
    comparar: todos.checked ? 'todos' : elegir.filter(x => x.c.checked).map(x => x.a.id),
  });
  const generar = async ({ guardar }) => {
    const pedido = leerForm();
    if (!pedido.secciones.length) throw new Error(t('reporte.elige_algo'));
    if (guardar) {
      const g = await h.api('POST', '/api/admin/academia/reporte/opciones', pedido);
      if (!g.ok) throw new Error(h.textoError(g.datos.error));
      o = g.datos.opciones;
    }
    const q = new URLSearchParams({ secciones: pedido.secciones.join(','), bloqueados: pedido.bloqueados ? '1' : '0', comparar: pedido.comparar === 'todos' ? 'todos' : pedido.comparar.join(',') || '0' });
    if (pedido.desde) q.set('desde', pedido.desde);
    if (pedido.hasta) q.set('hasta', pedido.hasta);
    hoja.replaceChildren(el('p', { class: 'cargando', texto: t('reporte.preparando') }));
    const r = await h.api('GET', `/api/admin/academia/reporte?${q}`);
    if (!r.ok) { hoja.replaceChildren(); throw new Error(h.textoError(r.datos.error)); }
    ultimo = r.datos;
    hoja.replaceChildren(...dibujarReporte(r.datos, h));
  };
  const ver = h.botonAccion(t('reporte.ver'), '', mensaje, () => generar({ guardar: true }), 'grafica');
  const pdf = el('button', { type: 'button', class: 'secundario con-icono', onclick: () => window.print() }, h.icono('manual'), el('span', { texto: t('reporte.pdf') }));
  const csv = el('button', { type: 'button', class: 'secundario con-icono', onclick: () => { if (ultimo) descargarCsv(ultimo, h); } }, h.icono('fila'), el('span', { texto: t('reporte.csv') }));
  const formulario = el('section', { class: 'tarjeta reporte-opciones' },
    el('a', { class: 'volver con-icono', href: '#alumnos' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.alumnos.volver') })),
    el('h1', { class: 'titulo-pantalla', texto: t('reporte.titulo') }),
    el('p', { class: 'suave', texto: t('reporte.linea') }),
    el('fieldset', { class: 'reporte-grupo' }, el('legend', { texto: t('reporte.incluir') }), casillas.map(x => x.nodo)),
    el('div', { class: 'reporte-fechas' },
      el('label', { for: 'rep-desde' }, el('span', { texto: t('reporte.desde') }), desde),
      el('label', { for: 'rep-hasta' }, el('span', { texto: t('reporte.hasta') }), hasta)),
    el('label', { class: 'reporte-casilla', for: 'rep-bloqueados' }, bloqueados, el('span', { texto: t('reporte.bloqueados') })),
    el('fieldset', { class: 'reporte-grupo' }, el('legend', { texto: t('reporte.a_quienes') }),
      el('label', { class: 'reporte-casilla', for: 'rep-comparar-todos' }, todos, el('span', { texto: t('reporte.todos') })), listaComparar),
    el('div', { class: 'botones reporte-acciones' }, ver, pdf, csv),
    mensaje);
  generar({ guardar: false }).catch(e => h.decir(mensaje, e.message, 'error'));
  return [formulario, hoja];
}

// ---------- La hoja ----------
export function dibujarReporte(d, h) {
  const { el, t, numero } = h;
  const porId = new Map((d.alumnos ?? []).map(a => [a.id, a]));
  const nombre = a => a.nombreLegal || a.nombreVisible || a.nombre;
  const periodo = d.opciones.desde || d.opciones.hasta
    ? t('reporte.periodo', { desde: d.opciones.desde ? h.fechaDia(d.opciones.desde) : '…', hasta: d.opciones.hasta ? h.fechaDia(d.opciones.hasta) : '…' }) : t('reporte.periodo.todo');
  const partes = [
    el('header', { class: 'reporte-cabeza' },
      el('div', {}, el('p', { class: 'reporte-app', texto: d.nombreApp }), el('h1', { texto: t('reporte.titulo') })),
      el('div', { class: 'reporte-cabeza-datos' },
        el('p', { texto: t('reporte.generado', { fecha: h.fecha(d.generado) }) }),
        el('p', { texto: periodo }),
        el('p', { texto: d.opciones.bloqueados ? t('reporte.con_bloqueados') : t('reporte.sin_bloqueados') }))),
  ];
  if (!(d.alumnos ?? []).length && !d.grupo) partes.push(el('p', { class: 'suave', texto: t('reporte.vacio') }));
  if (d.ranking) {
    const items = d.ranking.map(x => ({ lugar: x.lugar, etiqueta: nombre(porId.get(x.id)), valor: x.puntaje, texto: numero(x.puntaje), color: x.lugar <= 3 ? MEDALLA[x.lugar - 1] : COLORES[0] }));
    partes.push(el('section', { class: 'reporte-seccion' },
      el('h2', { texto: t('reporte.seccion.ranking') }),
      el('p', { class: 'reporte-formula', texto: t('reporte.formula', { p: numero(d.puntaje.preparacion * 100), n: numero(d.puntaje.nota * 100), a: numero(d.puntaje.acierto * 100) }) }),
      items.length ? barrasSvg(items, { titulo: t('reporte.seccion.ranking') }) : el('p', { class: 'suave', texto: t('reporte.vacio') }),
      el('ol', { class: 'reporte-podio' }, d.ranking.slice(0, 3).map(x => {
        const a = porId.get(x.id);
        return el('li', { class: `lugar-${x.lugar}` },
          el('span', { class: 'reporte-medalla', texto: String(x.lugar) }),
          h.dibujarAvatar(a.avatar, { nombre: a.nombreVisible, tamano: 'medio' }),
          el('strong', { texto: nombre(a) }),
          el('span', { class: 'suave chica', texto: t('reporte.puntaje', { n: numero(x.puntaje) }) }));
      }))));
  }
  if (d.opciones.secciones.includes('alumnos') && d.alumnos) {
    const orden = [...d.alumnos].sort((a, b) => a.lugar - b.lugar);
    partes.push(el('section', { class: 'reporte-seccion' },
      el('h2', { texto: t('reporte.seccion.alumnos') }),
      orden.length ? orden.map(a => el('article', { class: 'reporte-alumno' },
        el('div', { class: 'reporte-alumno-cabeza' },
          h.dibujarAvatar(a.avatar, { nombre: a.nombreVisible, tamano: 'medio' }),
          el('div', {},
            el('h3', { texto: `${a.lugar}. ${nombre(a)}` }),
            el('p', { class: 'suave chica', texto: [`@${a.nombre}`, a.bloqueado ? t('admin.inactivo') : null, a.ultimaActividad ? t('reporte.ultima', { fecha: h.fecha(a.ultimaActividad) }) : t('admin.nunca')].filter(Boolean).join(' · ') })),
          el('strong', { class: 'reporte-puntaje', texto: numero(a.puntaje) })),
        el('ul', { class: 'reporte-cifras' },
          el('li', { texto: t('reporte.c.preparacion', { n: numero(a.preparacion) }) }),
          el('li', { texto: a.notaPromedio == null ? t('reporte.c.sin_nota') : t('reporte.c.nota', { n: numero(a.notaPromedio) }) }),
          el('li', { texto: t('reporte.c.acierto', { n: numero(a.pctAcierto), r: numero(a.respuestas) }) }),
          el('li', { texto: t('ficha.examenes_de', { n: numero(a.examenesAprobados), total: numero(a.examenes) }) }),
          el('li', { texto: t('acad.temas_de', { n: numero(a.temasAprobados), total: numero(a.temas) }) }),
          el('li', { texto: a.terminos ? t('reporte.c.terminos', { n: numero(a.terminos.version), fecha: h.fecha(a.terminos.en) }) : t('ficha.terminos.no') })),
        a.materias.length ? barrasSvg(a.materias.map((m, k) => ({ etiqueta: h.nombreMateria(m.id), valor: m.pct, color: COLORES[k % COLORES.length] })), { titulo: t('reporte.por_materia'), etiqueta: 230 }) : null,
        el('div', { class: 'reporte-reforzar' },
          el('h4', { texto: t('reporte.reforzar') }),
          a.reforzar.temas.length || a.reforzar.ideas.length ? el('ul', {},
            a.reforzar.temas.map(x => el('li', { texto: t('reporte.tema_fallos', { tema: h.partirTitulo(x.titulo).es, pct: numero(x.pct), n: numero(x.fallos) }) })),
            a.reforzar.ideas.map(x => el('li', {}, h.talCual('span', x.idea)))) : el('p', { class: 'suave chica', texto: t('reporte.nada') })))) : el('p', { class: 'suave', texto: t('reporte.vacio') })));
  }
  if (d.grupo) {
    partes.push(el('section', { class: 'reporte-seccion' },
      el('h2', { texto: t('reporte.seccion.grupo') }),
      el('p', { class: 'suave', texto: t('reporte.grupo.linea', { n: numero(d.grupo.alumnos), p: numero(d.grupo.preparacion) }) }),
      d.grupo.materias.length ? barrasSvg(d.grupo.materias.map((m, k) => ({ etiqueta: h.nombreMateria(m.id), valor: m.promedio, color: COLORES[k % COLORES.length] })), { titulo: t('reporte.grupo.materias'), etiqueta: 230 }) : null,
      el('h3', { texto: t('reporte.dificiles') }),
      d.grupo.dificiles.length ? barrasSvg(d.grupo.dificiles.map(x => ({ etiqueta: h.partirTitulo(x.titulo).es, valor: x.pct, texto: t('reporte.dificil_valor', { pct: numero(x.pct), n: numero(x.fallos) }), color: '#e5484d' })), { titulo: t('reporte.dificiles'), etiqueta: 260 })
        : el('p', { class: 'suave', texto: t('reporte.nada') })));
  }
  if (d.comparar && d.alumnos) {
    const lista = d.comparar.map(id => porId.get(id)).filter(Boolean);
    const fila = (titulo, valor) => el('tr', {}, el('th', { scope: 'row', texto: titulo }), lista.map(a => el('td', { texto: valor(a) })));
    partes.push(el('section', { class: 'reporte-seccion reporte-comparar' },
      el('h2', { texto: t('reporte.seccion.comparar') }),
      lista.length ? el('div', { class: 'ficha-tabla-envoltura' }, el('table', { class: 'ficha-tabla reporte-tabla' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col', texto: '' }), lista.map(a => el('th', { scope: 'col', texto: nombre(a) })))),
        el('tbody', {},
          fila(t('reporte.ranking'), a => `${a.lugar}.º`),
          fila(t('reporte.puntaje_col'), a => numero(a.puntaje)),
          fila(t('ficha.preparacion'), a => h.pctTexto(a.preparacion)),
          fila(t('ficha.nota_promedio'), a => (a.notaPromedio == null ? '—' : h.pctTexto(a.notaPromedio))),
          fila(t('ficha.acierto'), a => h.pctTexto(a.pctAcierto)),
          fila(t('ficha.examenes'), a => `${numero(a.examenesAprobados)}/${numero(a.examenes)}`),
          fila(t('ficha.temas'), a => `${numero(a.temasAprobados)}/${numero(a.temas)}`),
          d.materias.map(id => fila(h.nombreMateria(id), a => h.pctTexto(a.materias.find(m => m.id === id)?.pct ?? 0))),
          fila(t('reporte.reforzar'), a => a.reforzar.temas.map(x => h.partirTitulo(x.titulo).es).join(' · ') || '—')))) : el('p', { class: 'suave', texto: t('reporte.vacio') })));
  }
  partes.push(el('p', { class: 'reporte-pie suave chica', texto: t('reporte.pie') }));
  return partes;
}

// ---------- CSV (las mismas partes) ----------
const celda = v => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function csvDe(d, t, nombreMateria) {
  const lineas = [];
  const fila = valores => lineas.push(valores.map(celda).join(';'));
  const nombre = a => a.nombreLegal || a.nombreVisible || a.nombre;
  fila([d.nombreApp, t('reporte.titulo'), d.generado, d.opciones.desde ?? '', d.opciones.hasta ?? '']);
  const porId = new Map((d.alumnos ?? []).map(a => [a.id, a]));
  if (d.ranking) {
    lineas.push('');
    fila([t('reporte.seccion.ranking')]);
    fila([t('reporte.ranking'), t('reporte.csv.nombre'), t('reporte.csv.usuario'), t('reporte.puntaje_col')]);
    for (const x of d.ranking) { const a = porId.get(x.id); fila([x.lugar, nombre(a), a.nombre, x.puntaje]); }
  }
  if (d.opciones.secciones.includes('alumnos') && d.alumnos) {
    lineas.push('');
    fila([t('reporte.seccion.alumnos')]);
    fila([t('reporte.ranking'), t('reporte.csv.nombre'), t('reporte.csv.usuario'), t('reporte.puntaje_col'), t('ficha.preparacion'), t('ficha.nota_promedio'), t('ficha.acierto'),
      t('ficha.respondidas'), t('ficha.examenes'), t('ficha.temas'), t('acad.racha'), t('ficha.ultima_actividad'), t('admin.inactivo'), ...d.materias.map(nombreMateria), t('reporte.reforzar')]);
    for (const a of [...d.alumnos].sort((x, y) => x.lugar - y.lugar)) {
      fila([a.lugar, nombre(a), a.nombre, a.puntaje, a.preparacion, a.notaPromedio ?? '', a.pctAcierto, a.respuestas, a.examenesAprobados, a.temasAprobados, a.racha, a.ultimaActividad ?? '',
        a.bloqueado ? 1 : 0, ...d.materias.map(id => a.materias.find(m => m.id === id)?.pct ?? 0), a.reforzar.temas.map(x => x.titulo).join(' | ')]);
    }
  }
  if (d.grupo) {
    lineas.push('');
    fila([t('reporte.seccion.grupo')]);
    fila([t('reporte.csv.materia'), t('reporte.csv.promedio')]);
    for (const m of d.grupo.materias) fila([nombreMateria(m.id), m.promedio]);
    fila([t('reporte.dificiles'), t('reporte.csv.fallos'), t('reporte.csv.respuestas'), t('reporte.csv.pct_fallos'), t('reporte.csv.alumnos')]);
    for (const x of d.grupo.dificiles) fila([x.titulo, x.fallos, x.respuestas, x.pct, x.alumnos]);
  }
  if (d.comparar && d.alumnos) {
    lineas.push('');
    fila([t('reporte.seccion.comparar')]);
    const lista = d.comparar.map(id => porId.get(id)).filter(Boolean);
    fila(['', ...lista.map(nombre)]);
    fila([t('reporte.puntaje_col'), ...lista.map(a => a.puntaje)]);
    fila([t('ficha.preparacion'), ...lista.map(a => a.preparacion)]);
    fila([t('ficha.nota_promedio'), ...lista.map(a => a.notaPromedio ?? '')]);
    fila([t('ficha.acierto'), ...lista.map(a => a.pctAcierto)]);
    fila([t('ficha.examenes'), ...lista.map(a => a.examenesAprobados)]);
    for (const id of d.materias) fila([nombreMateria(id), ...lista.map(a => a.materias.find(m => m.id === id)?.pct ?? 0)]);
  }
  return `\ufeff${lineas.join('\r\n')}\r\n`;
}
function descargarCsv(d, h) {
  const blob = new Blob([csvDe(d, h.t, h.nombreMateria)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h.el('a', { href: url, download: `reporte-academia-${d.generado.slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
