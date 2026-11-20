// Academia 0.14.77: Administrador → Avanzado → «Para Claude» (src/academia/para-claude.js). Lo que necesita quien edita
// el contenido con la IA, en una página: el resumen por materia, lo que más cuesta, las preguntas que más fallan, las
// clases con dudas, lo que no se entendió (👎) y lo que funciona. Solo números de todos los alumnos juntos: ningún
// nombre. «Descargar para Claude» baja el Markdown (formato estable, con los ids del paquete) y «Copiar» lo copia.
// Sin librerías; todo texto con textContent y sin estilos en línea. h: { el, t, icono, avisar }.

const deN = (t, k, n) => t('pc.de', { k: String(k), n: String(n) });
const pocos = (t, ok) => (ok ? '' : ` · ${t('pc.pocos')}`);

export function razonesParaClaude(pt, t) {
  return [
    pt.fallo ? (pt.fallo.alumnosMal != null && pt.fallo.alumnos != null
      ? t('pc.fallo', { de: deN(t, pt.fallo.alumnosMal, pt.fallo.alumnos), pct: String(pt.fallo.pct), n: String(pt.fallo.n) })
      : t('cuesta.fallo', { pct: String(pt.fallo.pct), n: String(pt.fallo.n) })) + pocos(t, pt.fallo.ok) : null,
    pt.no ? t('pc.no', { de: deN(t, pt.no.no, pt.no.n), pct: String(pt.no.pct) }) + pocos(t, pt.no.ok) : null,
    pt.pide ? t('pc.pide', { de: deN(t, pt.pide.pidieron ?? 0, pt.pide.n), pct: String(pt.pide.pct) }) + pocos(t, pt.pide.ok) : null,
    pt.despues ? t('cuesta.despues', { pct: String(pt.despues.pct), n: String(pt.despues.n) }) + pocos(t, pt.despues.ok) : null,
  ].filter(Boolean);
}

export function pantallaParaClaude(datos, h) {
  const { el, t, icono } = h;
  const nombre = id => (typeof h.nombreMateria === 'function' ? h.nombreMateria(id) || id : id);
  const r = datos?.reporte ?? {};
  const md = String(datos?.markdown ?? '');
  const nombreArchivo = `para-claude-${String(r.en ?? '').slice(0, 10) || 'hoy'}.md`;
  const descargar = () => {
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = el('a', { href: url, download: nombreArchivo, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(md); h.avisar?.(t('pc.copiado'), 'bien'); } catch { h.avisar?.(t('pc.no_copiado'), 'mal'); }
  };
  const nota = x => (x ? t('pc.practica', { pct: String(x.pct), n: String(x.n), alumnos: String(x.alumnos) }) : '—');
  const examen = x => (x ? t('pc.examen', { pct: String(x.promedio), alumnos: String(x.alumnos), aprobados: String(x.aprobados) }) : '—');
  const tabla = (titulo, filas) => el('div', { class: 'pc-tabla' },
    el('h3', { texto: titulo }),
    filas.length ? el('ul', { class: 'lista-simple pc-materias' }, ...filas.map(m => el('li', {},
      el('strong', { texto: nombre(m.materia) }),
      el('span', { class: 'chica', texto: ` · ${t('pc.col.practica')}: ${nota(m.practica)}` }),
      el('span', { class: 'chica', texto: ` · ${t('pc.col.examen')}: ${examen(m.examen)}` }))))
      : el('p', { class: 'suave chica', texto: t('pc.sin') }));
  const seccion = (titulo, linea, hijos) => el('section', { class: 'tarjeta pc-seccion' }, ...[
    el('h2', { texto: titulo }),
    linea ? el('p', { class: 'ayuda', texto: linea }) : null,
    ...(hijos.length ? hijos : [el('p', { class: 'suave chica', texto: t('pc.sin') })]),
  ].filter(Boolean));
  const lista = items => el('ol', { class: 'pc-lista' }, ...items);
  const mejorar = (r.mejorar ?? []).map(x => el('li', { class: 'pc-fila' }, ...[
    el('strong', { texto: x.tipo === 'tarjeta' ? `«${x.titulo}» · ${x.temaTitulo}` : x.temaTitulo }),
    el('span', { class: 'suave chica', texto: ` · ${t('cuesta.puntaje', { n: String(x.puntaje) })}` }),
    el('p', { class: 'chica', texto: razonesParaClaude(x.partes ?? {}, t).join(' · ') }),
    x.antes ? el('p', { class: 'suave chica', texto: t(x.antes.textoNuevo ? 'pc.antes_nuevo' : 'pc.antes', { semana: x.antes.semana, n: String(x.antes.puntaje ?? '—') }) }) : null,
    el('p', { class: 'suave chica pc-id', texto: `${x.materia}/${x.tema}${x.indice != null ? `#${x.indice + 1}` : ''} · id ${x.id}` }),
  ].filter(Boolean)));
  const preguntas = (r.preguntas ?? []).map(q => el('li', { class: 'pc-fila' }, ...[
    el('strong', { texto: `${q.numero != null ? `n.º ${q.numero}` : q.id}` }),
    el('span', { class: 'chica', texto: ` · ${t('pc.fallo', { de: deN(t, q.alumnosMal, q.alumnos), pct: String(q.alumnos ? Math.round((q.alumnosMal * 100) / q.alumnos) : 0), n: String(q.n) })}` }),
    q.comun ? el('p', { class: 'suave chica', texto: t('pc.comun', { letra: q.comun.letra, pct: String(q.comun.pct) }) }) : null,
  ].filter(Boolean)));
  const clases = (r.clases ?? []).map(c => el('li', { class: 'pc-fila' },
    el('strong', { texto: c.titulo || nombre(c.materia) }),
    el('span', { class: 'chica', texto: ` · ${t('pc.clase', { de: deN(t, c.noClara, c.alumnos), pct: String(c.pct) })}${pocos(t, c.ok)}` })));
  const voto = (x, bien) => el('li', { class: 'pc-fila' },
    el('strong', { texto: x.titulo || x.ref }),
    el('span', { class: 'chica', texto: ` · ${t(bien ? 'pc.si' : 'pc.no', { de: deN(t, bien ? x.si : x.no, x.n), pct: String(bien ? 100 - x.pctNo : x.pctNo) })}` }));
  const promovidas = (r.promovidas ?? []).map(x => el('li', { class: 'pc-fila' },
    el('strong', { texto: `«${x.titulo}»` }),
    el('span', { class: 'chica', texto: ` · ${t('cuesta.promovida', { con: String(x.vieron?.pct ?? '—'), sin: String(x.sin?.pct ?? '—') })}` })));
  return el('div', { class: 'para-claude' },
    el('section', { class: 'tarjeta pc-cabeza' },
      el('h1', { class: 'con-icono' }, icono('grafica'), el('span', { texto: t('pc.titulo') })),
      el('p', { class: 'ayuda', texto: t('pc.linea') }),
      el('p', { class: 'suave chica', texto: t('pc.datos', { alumnos: String(r.alumnos ?? 0), semana: r.semana ?? '—', antes: r.comparadaCon ?? t('pc.ninguna') }) }),
      el('div', { class: 'botones' },
        el('button', { type: 'button', class: 'boton-3d azul con-icono pc-descargar', onclick: descargar }, icono('carpeta'), el('span', { texto: t('pc.descargar') })),
        el('button', { type: 'button', class: 'boton-3d blanco con-icono pc-copiar', onclick: copiar }, icono('tarjetas'), el('span', { texto: t('pc.copiar') })))),
    seccion(t('pc.s1'), null, [tabla(t('pc.test_guide'), r.materias ?? []), tabla(t('pc.oral'), r.oral ?? [])]),
    seccion(t('pc.s2'), t('pc.s2_linea'), mejorar.length ? [lista(mejorar)] : []),
    seccion(t('pc.s3'), null, preguntas.length ? [lista(preguntas)] : []),
    seccion(t('pc.s4'), null, clases.length ? [lista(clases)] : []),
    seccion(t('pc.s5'), null, (r.votosMalos ?? []).length ? [lista(r.votosMalos.map(x => voto(x, false)))] : []),
    seccion(t('pc.s6'), null, [...(promovidas.length ? [lista(promovidas)] : []), ...((r.votosBuenos ?? []).length ? [lista(r.votosBuenos.map(x => voto(x, true)))] : [])]),
    el('details', { class: 'tarjeta pc-markdown' },
      el('summary', { texto: t('pc.ver_texto') }),
      el('pre', { class: 'pc-pre', texto: md })));
}
