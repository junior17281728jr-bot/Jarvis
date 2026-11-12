// Academia 0.12.9: las pantallas del «tutor» del alumno (sin librerías; todo texto con textContent, nunca como código).
// app.js le pasa sus ayudas. Lo que devuelve:
//  - tarjetaTutor({ compacta }): «Tu tutor IA» con cosas que pasaron de verdad (cada una un botón), su meta (M), por dónde
//    empezar (S) y «¿Tomo el examen?» (U). SOLO si hay IA para él: si no, nada (N).
//  - ponerApertura(lista, mandar): el primer mensaje del Profesor («¡Hola, piloto Juan! Vi que fallaste…») con sus 4
//    botones (G). El nombre lo pone la pantalla: nunca va a la IA (Y).
//  - entendiste(materia, tema, n): «¿Lo entendiste?» 👍/🤔 en cada tarjeta de la clase (J); 🤔 → «Explícamelo mejor» y
//    «Profundizar» con IA, o lo gratis marcado «Modo básico».
//  - pista(intento, pregunta): después de un error en la práctica, una pista de una línea y «Ver en la clase» (H).
//  - examen(): «¿Tomo el examen final?» por materia y el oficial (U; sin IA; con IA, además el porqué a su estilo).
//  - pantallaMemoria(), pantallaExamen(), pantallaPersonalizadas(materia, tema).
export function crearTutor(h) {
  const { el, t, icono, api, talCual, numero, nombreMateria, empezarIntento, avisar, textoError, mostrar, marco } = h;
  const ui = () => h.instructorUi();
  const anexar = (nodo, ...hijos) => { nodo.append(...hijos.flat(Infinity).filter(x => x != null && x !== false)); return nodo; };
  // «IA»: una insignia pequeña donde de verdad se usó la IA.
  const insigniaIa = () => el('span', { class: 'insignia-ia', title: t('tutor.ia_usada'), 'aria-label': t('tutor.ia_usada'), texto: 'IA' });
  const modoBasico = () => el('span', { class: 'insignia-basico', texto: t('tutor.modo_basico') });
  // Lo del tutor, una vez por pantalla (varias partes lo usan).
  let pedido = null;
  let pedidoEn = 0;
  const datosTutor = () => {
    if (!pedido || Date.now() - pedidoEn > 15_000) { pedidoEn = Date.now(); pedido = api('GET', '/api/academia/tutor').then(r => (r.ok ? r.datos : { ia: false })).catch(() => ({ ia: false })); }
    return pedido;
  };
  const olvidar = () => { pedido = null; };
  // Y: «Hola, piloto Juan»: su primer nombre visible (lo pone la app alrededor del texto; nunca va a la IA).
  const primerNombre = () => String(h.nombre?.() ?? '').trim().split(/\s+/)[0] ?? '';
  const saludo = () => (primerNombre() ? t('tutor.hola', { nombre: primerNombre() }) : t('tutor.hola_sin'));
  const textoNovedad = n => t(`tutor.nov.${n.tipo}`, n.vars ?? {});
  const decision = si => t(si ? 'tutor.examen.si' : 'tutor.examen.todavia');
  const porque = x => t(`tutor.examen.porque.${x.clave}`, { ...x.vars, valor: numero(x.vars?.valor ?? 0), meta: numero(x.vars?.meta ?? 0), n: numero(x.vars?.n ?? 0) });

  // ---------- F: «Tu tutor IA» ----------
  function pintarTarjeta(d, { compacta = false } = {}) {
    const a = d.apertura;
    const ex = d.examen?.materia;
    return el('section', { class: `panel tutor-tarjeta${compacta ? ' compacta' : ''}`, 'aria-labelledby': 'tutor-titulo' },
      el('div', { class: 'tutor-cabeza' },
        el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('chispa')),
        el('div', {}, el('h2', { id: 'tutor-titulo', texto: t('tutor.titulo') }), insigniaIa())),
      // M: su meta, siempre la misma.
      !compacta && a?.preguntasMateria ? el('p', { class: 'tutor-meta', texto: t('tutor.meta', { n: numero(a.preguntasMateria), materia: nombreMateria(a.tema?.materia) }) }) : null,
      // S: por dónde empezar (lo que falla y más sale en el Test Guide).
      !compacta && a?.prioridad ? el('p', { class: 'tutor-prioridad con-icono' }, icono('flecha', 'icono chico'),
        el('span', { texto: t('tutor.prioridad', { concepto: a.prioridad.concepto, n: numero(a.prioridad.n) }) })) : null,
      !compacta && a?.prioridad ? el('p', { class: 'suave chica', texto: t('tutor.paciencia') }) : null,
      // Lo que pasó de verdad, cada cosa un botón.
      (d.novedades ?? []).length ? el('ul', { class: 'tutor-novedades' }, d.novedades.map(n => el('li', {},
        el('a', { class: 'boton-3d blanco chico con-icono', href: n.href }, icono(n.tipo === 'preparada' || n.tipo === 'preparando' ? 'calendario' : n.tipo === 'reforzamos' ? 'cerebro' : 'bombilla', 'icono chico'), el('span', { texto: textoNovedad(n) }))))) : null,
      // U: «¿Tomo el examen de esta materia?».
      ex ? el('a', { class: `tutor-examen-linea tono-${ex.si ? 'bien' : 'atencion'}`, href: '#tutor/examen' },
        el('strong', { texto: t('tutor.examen.linea', { materia: nombreMateria(ex.materia), decision: decision(ex.si), pct: numero(ex.pct ?? 0) }) })) : null,
      d.examenIa?.porque && !compacta ? el('p', { class: 'suave chica con-icono' }, icono('chispa', 'icono chico'), talCual('span', d.examenIa.porque)) : null,
      el('div', { class: 'tutor-enlaces' },
        el('a', { class: 'boton-3d azul chico con-icono', href: '#profesor' }, icono('cerebro', 'icono chico'), el('span', { texto: t('tutor.hablar') })),
        compacta ? null : el('a', { class: 'enlace-fuerte chica', href: '#tutor/memoria', texto: t('tutor.memoria.abrir') })));
  }
  function tarjetaTutor({ compacta = false } = {}) {
    const lugar = el('div', { class: 'tutor-lugar' });
    datosTutor().then(d => { if (lugar.isConnected !== false && d?.ia) lugar.replaceChildren(pintarTarjeta(d, { compacta })); });
    return lugar;
  }

  // ---------- G / M / Y: el primer mensaje del Profesor ----------
  function pintarApertura(d, mandar) {
    const a = d.apertura;
    if (!a) return null;
    const videos = el('div', { class: 'videos', hidden: true },
      ...(a.videos ?? []).map(v => el('a', { class: 'video-elegido', href: v.url, target: '_blank', rel: 'noopener noreferrer' }, icono('video', 'icono chico'), el('span', { texto: v.titulo }))),
      a.buscar?.url ? el('a', { class: 'video-buscar', href: a.buscar.url, target: '_blank', rel: 'noopener noreferrer' }, icono('video', 'icono chico'), el('span', { texto: t('profesor.buscar', { texto: a.buscar.texto }) })) : null);
    const tema = a.tema;
    const primera = a.fallaste?.length && tema
      ? t('tutor.abre.fallaste', { saludo: saludo(), que: a.fallaste.join(t('tutor.y')), n: numero(tema.numero ?? 0), tema: tema.titulo })
      : tema ? t('tutor.abre.sigue', { saludo: saludo(), tema: tema.titulo }) : t('tutor.abre.todo', { saludo: saludo() });
    const botones = el('div', { class: 'tutor-apertura-botones' },
      a.practicar ? el('button', { type: 'button', class: 'boton-3d naranja chico', onclick: e => empezarIntento(a.practicar, e.currentTarget) }, el('span', { texto: t('tutor.abre.practicar') })) : null,
      tema ? el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => mandar(t('tutor.abre.explica_mensaje', { tema: tema.titulo }), { materia: tema.materia, tema: tema.tema }) }, el('span', { texto: t('tutor.abre.explica', { tema: tema.titulo }) })) : null,
      tema ? el('a', { class: 'boton-3d blanco chico', href: `#tema/${encodeURIComponent(tema.materia)}/${encodeURIComponent(tema.tema)}` }, el('span', { texto: t('tutor.abre.clase') })) : null,
      tema ? el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => { videos.hidden = !videos.hidden; } }, el('span', { texto: t('tutor.abre.video') })) : null);
    return el('div', { class: 'burbuja profesor tutor-apertura' },
      el('p', { class: 'fuerte', texto: primera }),
      a.preguntasMateria ? el('p', { texto: t('tutor.meta', { n: numero(a.preguntasMateria), materia: nombreMateria(tema?.materia) }) }) : null,
      a.prioridad ? el('p', { class: 'chica', texto: `${t('tutor.prioridad', { concepto: a.prioridad.concepto, n: numero(a.prioridad.n) })} ${t('tutor.paciencia')}` }) : null,
      botones, videos);
  }
  function ponerApertura(lista, mandar) {
    datosTutor().then(d => {
      if (!d?.ia || !lista.isConnected) return;
      const b = pintarApertura(d, mandar);
      if (b) lista.prepend(b);
    });
  }

  // ---------- K: «Para el examen» (lo pone la app: citadas solo las que ya respondió) ----------
  function paraElExamen(x) {
    if (!x || (!x.respondidas?.length && !x.otras?.length)) return null;
    return el('div', { class: 'para-examen' },
      el('p', { class: 'fuerte chica con-icono' }, icono('libro', 'icono chico'), el('span', { texto: t('tutor.examen_pie.titulo') })),
      ...(x.respondidas ?? []).map(q => el('p', { class: 'cita-test-guide chica' }, talCual('span', t('tutor.examen_pie.cita', { n: q.numero, enunciado: q.enunciado, respuesta: q.respuesta })))),
      x.otras?.length ? el('p', { class: 'suave chica', texto: t('tutor.examen_pie.otras', { numeros: x.otras.join(', '), tema: x.tema }) }) : null);
  }

  // ---------- J: «¿Lo entendiste?» en cada tarjeta ----------
  function pintarTarjetaIa(r) {
    const partes = r.tipo === 'profundizar'
      ? [talCual('p', r.porQue), r.ejemplo ? el('p', {}, el('strong', { texto: `${t('tutor.j.ejemplo_vuelo')} ` }), talCual('span', r.ejemplo)) : null,
        r.trampa ? el('p', {}, el('strong', { texto: `${t('tutor.j.trampa')} ` }), talCual('span', r.trampa)) : null]
      : [talCual('p', r.explicacion), r.ejemplo ? el('p', {}, el('strong', { texto: `${t('mini.ia.ejemplo')} ` }), talCual('span', r.ejemplo)) : null];
    return ui().cajaIa(r, [...partes, r.recuerda ? el('p', { class: 'recuerda-linea' }, el('strong', { texto: `${t('acad.recuerda')}: ` }), talCual('span', r.recuerda)) : null, insigniaIa()].filter(Boolean));
  }
  function pintarBasica(b) {
    return el('section', { class: 'caja-hoja tutor-basica' },
      el('p', { class: 'con-icono' }, icono('cerebro', 'icono chico'), el('strong', { texto: `${t('tutor.j.basica')} ` }), modoBasico()),
      b.recuerda ? el('p', { class: 'recuerda-linea' }, el('strong', { texto: `${t('acad.recuerda')}: ` }), talCual('span', b.recuerda)) : null,
      ...(b.sencilla ?? []).map(x => talCual('p', x)),
      ...(b.reexplicacion ?? []).map(x => el('div', {}, x.titulo ? talCual('p', x.titulo, 'fuerte chica') : null, x.texto ? talCual('p', x.texto, 'chica') : null)),
      !(b.recuerda || b.sencilla?.length || b.reexplicacion?.length) ? el('p', { class: 'suave chica', texto: t('tutor.j.relee') }) : null);
  }
  function entendiste(materia, tema, n) {
    const salida = el('div', { class: 'entendiste-salida', 'aria-live': 'polite' });
    const senal = tipo => api('POST', '/api/academia/tutor/senal', { tipo }).catch(() => {});
    const pedir = async (tipo, boton) => {
      boton.disabled = true;
      const ia = (await datosTutor())?.ia === true;
      const r = await api('POST', '/api/academia/tutor/tarjeta', { materia, tema, tarjeta: n, tipo, ia });
      boton.disabled = false;
      if (!r.ok) return avisar(textoError(r.datos.error), 'mal');
      salida.replaceChildren(...[
        r.datos.ia ? ui().lugarIa(r.datos.ia, pintarTarjetaIa) : pintarBasica(r.datos.basica),
        paraElExamen(r.datos.examen)].filter(Boolean));
    };
    const duda = async () => {
      senal('duda');
      const ia = (await datosTutor())?.ia === true;
      if (!ia) {
        // Sin IA: lo gratis, enseguida (la «sencilla», la reexplicación), marcado «Modo básico».
        const r = await api('POST', '/api/academia/tutor/tarjeta', { materia, tema, tarjeta: n, tipo: 'mejor', ia: false });
        if (r.ok) salida.replaceChildren(...[pintarBasica(r.datos.basica), paraElExamen(r.datos.examen)].filter(Boolean));
        return;
      }
      salida.replaceChildren(el('div', { class: 'entendiste-botones' },
        el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', onclick: e => pedir('mejor', e.currentTarget) }, icono('chispa', 'icono chico'), el('span', { texto: t('tutor.j.mejor') })),
        el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', onclick: e => pedir('profundizar', e.currentTarget) }, icono('chispa', 'icono chico'), el('span', { texto: t('tutor.j.profundizar') }))));
    };
    return el('div', { class: 'entendiste' },
      el('div', { class: 'entendiste-fila' },
        el('span', { class: 'chica', texto: t('tutor.j.pregunta') }),
        el('button', { type: 'button', class: 'boton-emoji', 'aria-label': t('tutor.j.si'), onclick: () => { senal('entendi'); salida.replaceChildren(el('p', { class: 'suave chica', texto: t('tutor.j.bien') })); } }, el('span', { 'aria-hidden': 'true', texto: '👍' })),
        el('button', { type: 'button', class: 'boton-emoji', 'aria-label': t('tutor.j.no'), onclick: duda }, el('span', { 'aria-hidden': 'true', texto: '🤔' }))),
      salida);
  }

  // ---------- H: la pista después de un error en la práctica ----------
  function pista(intento, pregunta) {
    const lugar = el('div', { class: 'tutor-pista' });
    api('GET', `/api/academia/tutor/pista/${encodeURIComponent(intento)}/${encodeURIComponent(pregunta)}`).then(r => {
      if (!r.ok || !lugar.isConnected) return;
      const { pista: p, tarjeta } = r.datos;
      anexar(lugar,
        p ? el('p', { class: 'con-icono' }, icono('bombilla', 'icono chico'), talCual('span', p.texto), p.ia ? insigniaIa() : null) : null,
        tarjeta ? el('a', { class: 'enlace-fuerte chica', href: `#tema/${encodeURIComponent(tarjeta.materia)}/${encodeURIComponent(tarjeta.tema)}/${tarjeta.n}`, texto: t('tutor.h.ver_clase', { titulo: tarjeta.titulo }) }) : null);
    }).catch(() => {});
    return lugar;
  }

  // ---------- U: «¿Tomo el examen final?» ----------
  function pintarExamen(d, { completo = true } = {}) {
    const fila = (titulo, x) => el('li', { class: `tutor-examen tono-${x.si ? 'bien' : 'atencion'}` },
      el('p', {}, el('strong', { texto: `${titulo}: ` }), el('span', { class: `veredicto-corto ${x.si ? 'si' : 'no'}`, texto: decision(x.si) }), x.pct != null ? el('span', { class: 'suave', texto: ` · ${numero(x.pct)} %` }) : null),
      el('ul', { class: 'lista-simple chica' }, (x.porques ?? []).map(z => el('li', { texto: porque(z) }))));
    return el('section', { class: 'panel tutor-examenes', 'aria-labelledby': 'tomo-titulo' },
      el('h2', { id: 'tomo-titulo', class: 'con-icono' }, icono('trofeo', 'icono chico'), el('span', { texto: t('tutor.examen.titulo') })),
      el('ul', { class: 'lista-simple' },
        d.oficial ? fila(t('tutor.examen.oficial'), d.oficial) : null,
        ...(completo ? d.materias ?? [] : []).map(m => fila(nombreMateria(m.materia), m))),
      d.examenIa ? ui().cajaIa({}, [d.examenIa.porque ? talCual('p', d.examenIa.porque) : null,
        d.examenIa.pasos?.length ? el('div', {}, el('p', { class: 'fuerte chica', texto: t('tutor.examen.antes') }), el('ol', { class: 'instructor-pasos' }, d.examenIa.pasos.map(p => talCual('li', p)))) : null, insigniaIa()].filter(Boolean)) : null,
      el('p', { class: 'suave chica', texto: t('tutor.examen.aviso') }));
  }
  function examen({ completo = true } = {}) {
    const lugar = el('div', { class: 'tutor-examen-lugar' });
    api('GET', '/api/academia/tutor/examen').then(r => { if (r.ok && lugar.isConnected) lugar.replaceChildren(pintarExamen(r.datos, { completo })); }).catch(() => {});
    return lugar;
  }
  const volver = () => el('a', { class: 'volver con-icono', href: '#inicio' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.volver') }));
  async function pantallaExamen() {
    mostrar(marco('inicio', volver(), examen()));
  }

  // ---------- T: «Lo que tu tutor recuerda de ti» ----------
  function lineaMemoria(x) {
    const fecha = new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date(x.en));
    return el('li', { class: `memoria-entrada tipo-${x.tipo}` },
      el('p', { class: 'memoria-cabeza' }, el('span', { class: 'suave chica', texto: fecha }), el('strong', { texto: ` ${t(`tutor.memoria.tipo.${x.tipo}`)}` }), x.temaTitulo ? talCual('span', ` · ${x.temaTitulo}`) : null,
        x.pct != null ? el('span', { class: 'suave', texto: ` · ${numero(x.pct)} %` }) : null, x.minutos ? el('span', { class: 'suave chica', texto: ` · ${t('tutor.memoria.minutos', { n: numero(x.minutos) })}` }) : null),
      x.conclusion ? el('p', { texto: t(`tutor.memoria.${x.conclusion.clave}`, { ...x.conclusion.vars, pct: numero(x.conclusion.vars?.pct ?? 0) }) }) : null,
      x.bien?.length ? el('p', { class: 'chica tono-bien', texto: t('tutor.memoria.bien', { que: x.bien.join(', ') }) }) : null,
      x.mal?.length ? el('p', { class: 'chica tono-mal', texto: t('tutor.memoria.mal', { que: x.mal.join(', ') }) }) : null,
      x.tgMal?.length ? el('p', { class: 'suave chica', texto: t('tutor.memoria.tg', { numeros: x.tgMal.join(', ') }) }) : null);
  }
  const pintarMemoria = lista => (lista.length ? el('ol', { class: 'memoria-lista' }, lista.map(lineaMemoria)) : el('p', { class: 'suave', texto: t('tutor.memoria.vacia') }));
  async function pantallaMemoria() {
    const [r, d] = await Promise.all([api('GET', '/api/academia/tutor/memoria'), datosTutor()]);
    mostrar(marco('inicio', volver(), el('section', { class: 'panel' },
      el('h1', { class: 'titulo-grande', texto: t('tutor.memoria.titulo') }),
      el('p', { class: 'suave', texto: t('tutor.memoria.linea') }),
      d?.conclusion ? el('p', { class: 'con-icono' }, icono('chispa', 'icono chico'), talCual('span', d.conclusion), insigniaIa()) : null,
      r.ok ? pintarMemoria(r.datos.memoria) : el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  }

  // ---------- O: «Preguntas personalizadas» ----------
  function pintarPersonalizadas(x) {
    return el('div', { class: 'personalizadas' }, (x.preguntas ?? []).map(q => {
      const salida = el('div', { 'aria-live': 'polite' });
      const botones = q.opciones.map((o, i) => el('button', { type: 'button', class: 'opcion-personal', onclick: async () => {
        for (const b of botones) b.disabled = true;
        const r = await api('POST', '/api/academia/tutor/personalizadas/responder', { clave: x.clave, i: q.i, elegida: i });
        if (!r.ok) { for (const b of botones) b.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
        botones[r.datos.correcta]?.classList.add('es-correcta');
        if (!r.datos.acierto) botones[i].classList.add('es-mala');
        salida.replaceChildren(el('p', { class: r.datos.acierto ? 'tono-bien fuerte' : 'tono-mal fuerte', texto: t(r.datos.acierto ? 'acad.practica.bien' : 'tutor.o.mal') }), r.datos.explicacion ? talCual('p', r.datos.explicacion, 'chica') : null);
      } }, talCual('span', o)));
      return el('article', { class: 'pregunta-personal caja-hoja' },
        el('p', { class: 'sello-personal chica con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('tutor.o.sello') }), insigniaIa()),
        talCual('p', q.enunciado, 'fuerte'),
        el('div', { class: 'opciones-personal' }, botones),
        el('p', { class: 'suave chica', texto: t('tutor.o.entrena', { n: q.entrena }) }), salida);
    }));
  }
  async function pantallaPersonalizadas(materia, tema) {
    const d = await datosTutor();
    const cuerpo = el('div', {});
    mostrar(marco('inicio', volver(), el('section', { class: 'panel' },
      el('h1', { class: 'titulo-grande', texto: t('tutor.o.titulo') }), el('p', { class: 'suave', texto: t('tutor.o.linea') }), cuerpo)));
    if (!d?.ia) return cuerpo.replaceChildren(el('p', { class: 'suave', texto: t('tutor.o.sin') }));
    const r = await api('POST', '/api/academia/tutor/personalizadas', { materia, tema });
    if (!r.ok) return cuerpo.replaceChildren(el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }));
    if (!r.datos.ia) return cuerpo.replaceChildren(el('p', { class: 'suave', texto: t(r.datos.sinConfusion ? 'tutor.o.sin_confusion' : 'tutor.o.sin') }));
    const clave = r.datos.ia.clave;
    cuerpo.replaceChildren(ui().lugarIa(r.datos.ia, x => pintarPersonalizadas({ ...x, clave: x.clave ?? clave })));
  }
  // El botón al final de un tema practicado (solo con IA y si hubo errores).
  function botonPersonalizadas(materia, tema) {
    const lugar = el('div', {});
    datosTutor().then(d => {
      if (!d?.ia || !lugar.isConnected) return;
      lugar.replaceChildren(el('a', { class: 'boton-3d blanco chico con-icono', href: `#tutor/preguntas/${encodeURIComponent(materia)}/${encodeURIComponent(tema)}` }, icono('chispa', 'icono chico'), el('span', { texto: t('tutor.o.boton') })));
    });
    return lugar;
  }

  // El administrador, en la ficha de un alumno: su memoria del tutor y «¿Tomo el examen?» (sin IA).
  function adminAlumno(id) {
    const lugar = el('section', { class: 'panel tutor-admin' });
    api('GET', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/tutor`).then(r => {
      if (!r.ok || !lugar.isConnected) return;
      const d = r.datos;
      const pr = d.preferencias ?? {};
      anexar(lugar, el('h2', { class: 'con-icono' }, icono('cerebro', 'icono chico'), el('span', { texto: t('tutor.admin.titulo') })),
        d.examen ? pintarExamen(d.examen) : null,
        el('p', { class: 'suave chica', texto: t('tutor.admin.senales', { largo: pr.largo ?? '—', modo: pr.modo ?? '—', entiende: pr.entiende == null ? '—' : `${numero(pr.entiende)} %`, personal: `${numero(d.personal?.bien ?? 0)}/${numero(d.personal?.respondidas ?? 0)}` }) }),
        el('h3', { texto: t('tutor.memoria.titulo') }), pintarMemoria(d.memoria ?? []));
    }).catch(() => {});
    return lugar;
  }

  return Object.freeze({ adminAlumno, tarjetaTutor, ponerApertura, entendiste, pista, examen, pintarExamen, pantallaExamen, pantallaMemoria, pintarMemoria, pantallaPersonalizadas, botonPersonalizadas, olvidar, pintarTarjeta, pintarApertura, pintarPersonalizadas, paraElExamen, pintarTarjetaIa, pintarBasica, insigniaIa });
}
