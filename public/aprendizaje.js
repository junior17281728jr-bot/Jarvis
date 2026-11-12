// Academia 0.10.0: Administrador → «Aprendizaje» (¿aprenden de verdad? ¿funcionan las clases y la adaptación?). Gráficas
// en SVG hechas aquí (sin librerías); todo texto con textContent. Cada número lleva su «n»; con pocos datos se dice.
const SVG = 'http://www.w3.org/2000/svg';
function svg(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v != null) n.setAttribute(k, String(v));
  for (const h of hijos) if (h) n.append(h);
  return n;
}

export function vistaAprendizaje(d, h) {
  const { el, t, numero } = h;
  const cifra = (m, etiqueta) => el('div', { class: `cifra-aprendizaje${m.pocos ? ' pocos' : ''}` },
    el('strong', { texto: m.pct == null ? '—' : `${numero(m.pct)} %` }), el('span', { texto: etiqueta }),
    el('span', { class: 'suave chica', texto: m.pocos ? t('aprendizaje.pocos', { n: numero(m.n) }) : t('aprendizaje.n', { n: numero(m.n) }) }));
  // Barras verticales: [{ etiqueta, pct, n }].
  const barras = (lista, titulo) => {
    const ancho = Math.max(240, lista.length * 36);
    const g = svg('svg', { viewBox: `0 0 ${ancho} 140`, role: 'img', 'aria-label': titulo, class: 'grafica-barras' });
    lista.forEach((x, i) => {
      const alto = Math.round(((x.pct ?? 0) / 100) * 100);
      const r = svg('rect', { x: i * 36 + 6, y: 110 - alto, width: 24, height: alto, rx: 4, class: x.pocos ? 'barra pocos' : 'barra' });
      r.append(svg('title', {}, document.createTextNode(`${x.etiqueta}: ${x.pct ?? '—'} % (n=${x.n})`)));
      g.append(r, svg('text', { x: i * 36 + 18, y: 128, 'text-anchor': 'middle', class: 'barra-etiqueta' }, document.createTextNode(x.etiqueta)));
    });
    return el('figure', { class: 'grafica' }, g, el('figcaption', { class: 'suave chica', texto: titulo }));
  };
  const a = d.aprendizaje;
  const ad = d.adaptacion;
  return [
    el('p', { class: 'suave', texto: t('aprendizaje.linea', { alumnos: numero(d.alumnos), n: numero(d.respuestas), minimo: numero(d.minimo) }) }),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('aprendizaje.real') }),
      el('div', { class: 'cifras-aprendizaje' }, cifra(a.primera, t('aprendizaje.primera')), cifra(a.despues, t('aprendizaje.despues')),
        cifra(a.retencion2, t('aprendizaje.ret2')), cifra(a.retencion7, t('aprendizaje.ret7')), cifra(a.dominadas, t('aprendizaje.dominadas'))),
      a.curva.length ? barras(a.curva.map(x => ({ etiqueta: `S${x.semana}`, pct: x.pct, n: x.n, pocos: x.pocos })), t('aprendizaje.curva')) : null),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('aprendizaje.clases') }),
      el('p', { class: 'suave chica', texto: t('aprendizaje.clases.linea') }),
      el('ul', { class: 'lista-simple' }, d.clases.temas.map(c => el('li', {}, el('strong', { texto: `${c.titulo}: ` }),
        el('span', { texto: t('aprendizaje.tema', { total: c.total.pct ?? '—', n: numero(c.total.n), con: c.conVideo.pct ?? '—', nc: numero(c.conVideo.n), sin: c.sinVideo.pct ?? '—', ns: numero(c.sinVideo.n) }) })))),
      el('h3', { texto: t('aprendizaje.mejorar') }),
      d.clases.paraMejorar.length ? el('ul', {}, d.clases.paraMejorar.map(c => el('li', { texto: `${c.titulo} (${c.total.pct} %, n=${c.total.n})` }))) : el('p', { class: 'suave', texto: t('aprendizaje.mejorar.ninguna') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('aprendizaje.adaptacion') }),
      el('div', { class: 'cifras-aprendizaje' }, cifra(ad.superadas, t('aprendizaje.superadas', { n: numero(ad.fallas) })),
        cifra(ad.antes, t('aprendizaje.antes')), cifra(ad.despues, t('aprendizaje.tras')),
        cifra(ad.reexplicacionBasica, t('aprendizaje.reexp_basica')), cifra(ad.reexplicacionIa, t('aprendizaje.reexp_ia'))),
      el('p', { class: 'suave', texto: ad.medianaDias == null ? t('aprendizaje.mediana.sin') : t('aprendizaje.mediana', { n: numero(ad.medianaDias, 1) }) })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('aprendizaje.dificiles') }),
      d.dificiles.length ? el('ol', { class: 'lista-dificiles' }, d.dificiles.map(q => el('li', {},
        el('a', { href: '#respuestas', texto: `${q.numero ?? q.pregunta} · ${q.enunciado.slice(0, 90)}` }),
        el('p', { class: 'suave chica', texto: t('aprendizaje.dificil', { pct: q.fallos.pct, n: numero(q.fallos.n), opcion: q.opcion, veces: numero(q.veces) }) }),
        q.idea ? el('p', { class: 'chica', texto: `${t('hicimos.idea')} ${q.idea}` }) : null))) : el('p', { class: 'suave', texto: t('aprendizaje.sin_datos') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('aprendizaje.actividad') }),
      d.actividad.porDia.length ? barras(d.actividad.porDia.map(x => ({ etiqueta: x.dia.slice(8), pct: Math.min(100, Math.round((x.minutos / 120) * 100)), n: x.minutos })), t('aprendizaje.minutos')) : null,
      el('p', { texto: t('aprendizaje.racha', { n: numero(d.actividad.rachaPromedio, 1) }) }),
      el('p', { texto: t('aprendizaje.plan', { a: numero(d.actividad.plan.adelantado + d.actividad.plan.a_tiempo + d.actividad.plan.terminado), b: numero(d.actividad.plan.atrasado), s: numero(d.actividad.plan.sin_plan) }) })),
  ];
}
