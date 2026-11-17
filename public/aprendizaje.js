// Academia 0.10.0: Administrador → «Aprendizaje» (¿aprenden de verdad? ¿funcionan las clases y la adaptación?). Gráficas
// en SVG hechas aquí (sin librerías); todo texto con textContent. Cada número lleva de cuántos sale; con pocos datos se dice.
// 0.14.25 (pedido del dueño: «no entiendo nada»): arriba, lo más importante en frases grandes y sencillas (lo que más
// fallan, el tema más difícil, la pregunta más fallada, quién necesita ayuda y si están aprendiendo), cada una con su botón
// a los detalles. Los números completos van debajo, cerrados («Ver detalles»), cada bloque con una línea que lo explica.
const SVG = 'http://www.w3.org/2000/svg';
function svg(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v != null) n.setAttribute(k, String(v));
  for (const h of hijos) if (h) n.append(h);
  return n;
}
const titulo = x => String(x ?? '').split(/\s+\(/)[0];

export function vistaAprendizaje(d, h) {
  const { el, t, numero } = h;
  const nombreMateria = id => (typeof h.nombreMateria === 'function' ? h.nombreMateria(id) : id);
  const cifra = (m, etiqueta) => el('div', { class: `cifra-aprendizaje${m.pocos ? ' pocos' : ''}` },
    el('strong', { texto: m.pct == null ? '—' : `${numero(m.pct)} %` }), el('span', { texto: etiqueta }),
    el('span', { class: 'suave chica', texto: m.pocos ? t('aprendizaje.pocos', { n: numero(m.n) }) : t('aprendizaje.n', { n: numero(m.n) }) }));
  // Barras verticales: [{ etiqueta, pct, n }].
  const barras = (lista, tituloGrafica) => {
    const ancho = Math.max(240, lista.length * 36);
    const g = svg('svg', { viewBox: `0 0 ${ancho} 140`, role: 'img', 'aria-label': tituloGrafica, class: 'grafica-barras' });
    lista.forEach((x, i) => {
      const alto = Math.round(((x.pct ?? 0) / 100) * 100);
      const r = svg('rect', { x: i * 36 + 6, y: 110 - alto, width: 24, height: alto, rx: 4, class: x.pocos ? 'barra pocos' : 'barra' });
      r.append(svg('title', {}, document.createTextNode(`${x.etiqueta}: ${x.pct ?? '—'} % (${x.n})`)));
      g.append(r, svg('text', { x: i * 36 + 18, y: 128, 'text-anchor': 'middle', class: 'barra-etiqueta' }, document.createTextNode(x.etiqueta)));
    });
    return el('figure', { class: 'grafica' }, g, el('figcaption', { class: 'suave chica', texto: tituloGrafica }));
  };
  // Un bloque de detalles: cerrado, con su título y una línea que dice qué es.
  const detalles = {};
  const bloque = (clave, tituloBloque, linea, ...contenido) => {
    detalles[clave] = el('details', { class: 'tarjeta ap-detalle', 'data-detalle': clave },
      el('summary', { class: 'ap-detalle-cabeza' }, el('span', { texto: tituloBloque }), el('span', { class: 'ap-detalle-ver', texto: t('aprendizaje.detalles') })),
      el('p', { class: 'suave ap-detalle-linea', texto: linea }),
      ...contenido);
    return detalles[clave];
  };
  const abrirDetalle = clave => {
    const caja = detalles[clave];
    if (!caja) return;
    caja.open = true;
    try { caja.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { caja.scrollIntoView(); }
  };
  const botonDetalle = clave => el('button', { type: 'button', class: 'secundario chico ap-clave-boton', onclick: () => abrirDetalle(clave), texto: t('aprendizaje.detalles') });
  // Una tarjeta grande de arriba.
  const clave = ({ tono = 'neutro', icono, tituloClave, grande, texto, extra = null, detalle = null }) => el('article', { class: `ap-clave ap-clave-${tono}` },
    el('p', { class: 'ap-clave-titulo' }, el('span', { class: 'ap-clave-icono', 'aria-hidden': 'true', texto: icono }), el('span', { texto: tituloClave })),
    grande ? el('p', { class: 'ap-clave-grande', texto: grande }) : null,
    texto ? el('p', { class: 'ap-clave-texto', texto }) : null,
    extra,
    detalle ? botonDetalle(detalle) : null);
  const pocos = t('aprendizaje.i.pocos');

  const r = d.resumen ?? {};
  const tarjetas = [];
  const f = r.temaMasFallado;
  tarjetas.push(clave({ tono: f ? 'mal' : 'neutro', icono: '⚠️', tituloClave: t('aprendizaje.i.fallan.titulo'),
    grande: f ? titulo(f.titulo) : null,
    texto: f ? t('aprendizaje.i.fallan.texto', { pct: numero(f.errores), mal: numero(f.mal), n: numero(f.n), materia: nombreMateria(f.materia) }) : pocos,
    detalle: f ? 'temas' : null }));
  const dt = r.temaMasDificil;
  tarjetas.push(clave({ tono: dt ? 'atencion' : 'neutro', icono: '🧗', tituloClave: t('aprendizaje.i.dificil.titulo'),
    grande: dt ? titulo(dt.titulo) : null,
    texto: dt ? t('aprendizaje.i.dificil.texto', { pct: numero(dt.primera), materia: nombreMateria(dt.materia) }) : pocos,
    detalle: dt ? 'clases' : null }));
  const q = r.pregunta;
  tarjetas.push(clave({ tono: q ? 'mal' : 'neutro', icono: '❓', tituloClave: t('aprendizaje.i.pregunta.titulo'),
    grande: q ? t('aprendizaje.i.pregunta.numero', { n: q.numero ?? q.pregunta }) : null,
    texto: q ? t('aprendizaje.i.pregunta.texto', { pct: numero(q.fallos), opcion: q.opcion }) : pocos,
    extra: q ? el('p', { class: 'suave chica ap-clave-enunciado', texto: q.enunciado.length > 110 ? `${q.enunciado.slice(0, 110)}…` : q.enunciado }) : null,
    detalle: q ? 'dificiles' : null }));
  if (r.ayuda) {
    const lista = r.ayuda.lista;
    tarjetas.push(clave({ tono: lista.length ? 'atencion' : 'bien', icono: lista.length ? '🙋' : '👍', tituloClave: t('aprendizaje.i.ayuda.titulo'),
      texto: lista.length ? null : t('aprendizaje.i.ayuda.nadie'),
      extra: lista.length ? el('ul', { class: 'ap-ayuda' },
        lista.map(x => el('li', {},
          el('a', { href: `#alumno/${encodeURIComponent(x.id)}`, texto: x.nombre }),
          el('span', { class: 'suave', texto: ` — ${[x.bajo ? t('aprendizaje.i.ayuda.bajo', { pct: numero(x.acierto) }) : null, x.atrasado ? t('aprendizaje.i.ayuda.atrasado') : null].filter(Boolean).join(' · ')}` }))),
        r.ayuda.total > lista.length ? el('li', { class: 'suave', texto: t('aprendizaje.i.ayuda.mas', { n: numero(r.ayuda.total - lista.length) }) }) : null) : null }));
  }
  const m = r.mejoran;
  tarjetas.push(clave({ tono: m ? (m.si ? 'bien' : 'atencion') : 'neutro', icono: m?.si ? '📈' : '📊', tituloClave: t('aprendizaje.i.mejoran.titulo'),
    grande: m ? t(m.si ? 'aprendizaje.i.mejoran.si.corto' : 'aprendizaje.i.mejoran.no.corto') : null,
    texto: m ? t('aprendizaje.i.mejoran.texto', { primera: numero(m.primera), despues: numero(m.despues) }) : pocos,
    detalle: m ? 'real' : null }));

  const a = d.aprendizaje;
  const ad = d.adaptacion;
  return [
    el('p', { class: 'suave', texto: t('aprendizaje.linea.corta', { alumnos: numero(d.alumnos), n: numero(d.respuestas) }) }),
    el('section', { class: 'ap-claves', 'aria-label': t('aprendizaje.clave.titulo') }, tarjetas),
    el('h2', { class: 'ap-mas-titulo', texto: t('aprendizaje.mas_detalles') }),
    bloque('temas', t('aprendizaje.temas.titulo'), t('aprendizaje.temas.linea', { minimo: numero(d.minimo) }),
      (r.temas ?? []).length ? el('ul', { class: 'ap-temas' }, r.temas.map(x => el('li', { class: 'ap-tema' },
        el('span', { class: 'ap-tema-nombre' }, el('strong', { texto: titulo(x.titulo) }), el('span', { class: 'suave chica', texto: ` · ${nombreMateria(x.materia)}` })),
        el('span', { class: 'ap-tema-barra', 'aria-hidden': 'true' }, el('meter', { min: '0', max: '100', value: String(x.errores), class: 'ap-tema-medidor' })),
        el('span', { class: 'ap-tema-pct', texto: t('aprendizaje.temas.fila', { pct: numero(x.errores), mal: numero(x.mal), n: numero(x.n) }) })))) : el('p', { class: 'suave', texto: t('aprendizaje.sin_datos') })),
    bloque('real', t('aprendizaje.real'), t('aprendizaje.real.linea'),
      el('div', { class: 'cifras-aprendizaje' }, cifra(a.primera, t('aprendizaje.primera')), cifra(a.despues, t('aprendizaje.despues')),
        cifra(a.retencion2, t('aprendizaje.ret2')), cifra(a.retencion7, t('aprendizaje.ret7')), cifra(a.dominadas, t('aprendizaje.dominadas'))),
      a.curva.length ? barras(a.curva.map(x => ({ etiqueta: `S${x.semana}`, pct: x.pct, n: x.n, pocos: x.pocos })), t('aprendizaje.curva')) : null),
    bloque('clases', t('aprendizaje.clases'), t('aprendizaje.clases.linea'),
      el('h3', { texto: t('aprendizaje.mejorar') }),
      d.clases.paraMejorar.length ? el('ul', {}, d.clases.paraMejorar.map(c => el('li', { texto: t('aprendizaje.mejorar.fila', { tema: titulo(c.titulo), pct: numero(c.total.pct) }) }))) : el('p', { class: 'suave', texto: t('aprendizaje.mejorar.ninguna') }),
      el('h3', { texto: t('aprendizaje.clases.todos') }),
      el('ul', { class: 'lista-simple' }, d.clases.temas.map(c => el('li', {}, el('strong', { texto: `${titulo(c.titulo)}: ` }),
        el('span', { texto: t('aprendizaje.tema', { total: c.total.pct ?? '—', n: numero(c.total.n), con: c.conVideo.pct ?? '—', nc: numero(c.conVideo.n), sin: c.sinVideo.pct ?? '—', ns: numero(c.sinVideo.n) }) }))))),
    bloque('dificiles', t('aprendizaje.dificiles'), t('aprendizaje.dificiles.linea'),
      d.dificiles.length ? el('ol', { class: 'lista-dificiles' }, d.dificiles.map(x => el('li', {},
        el('a', { href: '#respuestas', texto: `${x.numero ?? x.pregunta} · ${x.enunciado.slice(0, 90)}` }),
        el('p', { class: 'suave chica', texto: t('aprendizaje.dificil', { pct: x.fallos.pct, n: numero(x.fallos.n), opcion: x.opcion, veces: numero(x.veces) }) }),
        x.idea ? el('p', { class: 'chica', texto: `${t('hicimos.idea')} ${x.idea}` }) : null))) : el('p', { class: 'suave', texto: t('aprendizaje.sin_datos') })),
    bloque('adaptacion', t('aprendizaje.adaptacion'), t('aprendizaje.adaptacion.linea'),
      el('div', { class: 'cifras-aprendizaje' }, cifra(ad.superadas, t('aprendizaje.superadas', { n: numero(ad.fallas) })),
        cifra(ad.antes, t('aprendizaje.antes')), cifra(ad.despues, t('aprendizaje.tras')),
        cifra(ad.reexplicacionBasica, t('aprendizaje.reexp_basica')), cifra(ad.reexplicacionIa, t('aprendizaje.reexp_ia'))),
      el('p', { class: 'suave', texto: ad.medianaDias == null ? t('aprendizaje.mediana.sin') : t('aprendizaje.mediana', { n: numero(ad.medianaDias, 1) }) })),
    bloque('actividad', t('aprendizaje.actividad'), t('aprendizaje.actividad.linea'),
      d.actividad.porDia.length ? barras(d.actividad.porDia.map(x => ({ etiqueta: x.dia.slice(8), pct: Math.min(100, Math.round((x.minutos / 120) * 100)), n: x.minutos })), t('aprendizaje.minutos')) : null,
      el('p', { texto: t('aprendizaje.racha', { n: numero(d.actividad.rachaPromedio, 1) }) }),
      el('p', { texto: t('aprendizaje.plan', { a: numero(d.actividad.plan.adelantado + d.actividad.plan.a_tiempo + d.actividad.plan.terminado), b: numero(d.actividad.plan.atrasado), s: numero(d.actividad.plan.sin_plan) }) })),
  ];
}
