// Academia 0.12.0: «¿Quieres estudiar algo extra?» de una materia (solo se carga en #extra/<materia>). Todo marcado
// «Extra — no es del Test Guide»: tarjetas «profundiza» por tema y rondas de preguntas por nivel (básico, intermedio,
// avanzado). Al responder: por qué su opción no, la explicación y la fuente (libro, página y la cita). Nada de esto
// cuenta para la preparación ni para los exámenes del Test Guide (el servidor lo guarda aparte). Todo se arma con h.el (nunca texto como código).

const NIVELES = ['basico', 'intermedio', 'avanzado'];

export function pantallaExtra(datos, h, { tema = null } = {}) {
  const { el, t, tn, numero, icono, mostrar, marco, volverAlCamino, nombreMateria, claseMateria } = h;
  const materia = datos.materia;
  if (!datos.hay) {
    return mostrar(marco('inicio', volverAlCamino(), el('section', { class: 'tarjeta' }, el('p', { texto: t('extra.vacio') }))));
  }
  const sello = () => el('span', { class: 'extra-sello grande con-icono-chico' }, icono('chispa', 'icono chico'), el('span', { texto: t('extra.sello') }));
  const nivelCaja = n => {
    const barra = el('span', { class: 'barra-relleno' });
    barra.style.width = `${n.pct}%`;
    return el('li', { class: `extra-nivel nivel-${n.nivel}` },
      el('div', { class: 'extra-nivel-cabeza' }, el('strong', { texto: t(`extra.nivel.${n.nivel}`) }), el('span', { class: 'suave chica', texto: tn('acad.n_preguntas', { n: n.preguntas }) })),
      el('span', { class: 'banner-barra' }, barra),
      el('p', { class: 'suave chica', texto: t('extra.nivel.linea', { bien: numero(n.bien), n: numero(n.preguntas) }) }),
      n.preguntas ? el('button', { type: 'button', class: 'boton-3d naranja chico', onclick: e => empezarRonda({ nivel: n.nivel }, e.currentTarget) }, el('span', { texto: t('extra.practicar') })) : null);
  };
  const empezarRonda = async (pedido, boton) => {
    if (boton) boton.disabled = true;
    const r = await h.api('POST', `/api/academia/extra/${encodeURIComponent(materia)}/ronda`, pedido);
    if (boton) boton.disabled = false;
    if (!r.ok) return h.avisar(h.textoError(r.datos.error), 'mal');
    ronda(r.datos, pedido, h);
  };
  const tarjeta = c => el('article', { class: 'extra-tarjeta' },
    el('p', { class: 'extra-tarjeta-sello' }, el('span', { class: 'sello', texto: t('extra.profundiza') })),
    el('h4', { texto: c.titulo }),
    c.clip?.url && h.vistaClip ? h.vistaClip(c.clip).nodo : null, // 0.12.1: el ejemplo en video corto
    c.imagen?.url && h.vistaFoto ? h.vistaFoto(c.imagen, { mini: Boolean(c.clip?.url && h.vistaClip) }) : null, // 0.12.5: la foto del libro
    c.puntos?.length ? el('ul', {}, c.puntos.map(p => el('li', { texto: p }))) : null,
    c.recuerda ? el('p', { class: 'extra-recuerda' }, el('strong', { texto: `${t('acad.recuerda')}: ` }), el('span', { texto: c.recuerda })) : null,
    c.ejemplo ? el('p', { class: 'suave', texto: c.ejemplo }) : null,
    c.ingles?.length ? el('p', { class: 'extra-ingles' }, c.ingles.map(w => el('span', { class: 'ficha-ingles-mini', texto: `${w.palabra} · ${w.significado ?? ''}` }))) : null,
    (c.fuentes ?? []).filter(Boolean).map(f => el('p', { class: 'extra-fuente suave chica', texto: t('extra.fuente', { libro: f.libro, pagina: f.pagina ?? '' }) })));
  // 0.12.12: desde «Profundizar en este tema» se abre (y se muestra) el de ese tema; si no, el primero.
  const conTarjetas = datos.temas.filter(x => x.tarjetas.length);
  const abrir = conTarjetas.some(x => x.id === tema) ? tema : conTarjetas[0]?.id;
  const temas = conTarjetas.map(x => el('details', { class: 'extra-tema', open: x.id === abrir, 'data-tema': x.id },
    el('summary', {}, el('span', { texto: x.titulo }), el('span', { class: 'suave chica', texto: tn('extra.n_tarjetas', { n: x.tarjetas.length }) })),
    el('div', { class: 'extra-tarjetas' }, x.tarjetas.map(tarjeta))));
  mostrar(marco('inicio', volverAlCamino(),
    el('section', { class: `extra-portada ${claseMateria(materia)}` },
      sello(),
      el('p', { class: 'antetitulo', texto: t('extra.de', { materia: nombreMateria(materia) }) }),
      el('h1', { class: 'titulo-grande', texto: t('extra.titulo') }),
      el('p', { class: 'bajada', texto: t('extra.linea') }),
      el('p', { class: `insignia tono-${datos.recomendado ? 'bien' : 'info'}` }, el('span', { texto: datos.recomendado ? t('extra.recomendado') : t('extra.opcional') }))),
    el('section', { class: 'panel extra-niveles', 'aria-labelledby': 'extra-niveles-titulo' },
      el('h2', { id: 'extra-niveles-titulo', class: 'con-icono' }, icono('fila'), el('span', { texto: t('extra.preguntas') })),
      el('ul', { class: 'extra-niveles-lista' }, datos.niveles.map(nivelCaja)),
      el('button', { type: 'button', class: 'boton-3d blanco', onclick: e => empezarRonda({}, e.currentTarget) }, el('span', { texto: t('extra.todas') }))),
    temas.length ? el('section', { class: 'panel extra-profundiza', 'aria-labelledby': 'extra-tarjetas-titulo' },
      el('h2', { id: 'extra-tarjetas-titulo', class: 'con-icono' }, icono('libro'), el('span', { texto: t('extra.tarjetas') })),
      temas) : null));
  if (tema && abrir === tema) temas.find(x => x.dataset.tema === tema)?.scrollIntoView({ block: 'start' });
}

function ronda(r, pedido, h) {
  const { el, t, numero, icono, talCual } = h;
  const materia = r.materia;
  const barra = h.combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = h.marcoEstudio({ clase: `practica-tg practica-extra ${h.claseMateria(materia)}`, barra: barra.nodo, cuenta, cuerpo: zona, pie, salir: `#extra/${encodeURIComponent(materia)}` });
  const hechas = [];
  const sigue = () => zona.isConnected;
  const avance = i => { barra.poner(i, r.preguntas.length); cuenta.textContent = t('acad.de', { n: numero(i), total: numero(r.preguntas.length) }); };
  const cabeza = q => el('div', { class: 'q-cabeza' },
    el('div', { class: 'insignia-pregunta extra' }, icono('chispa', 'icono chico'), el('span', { texto: t('extra.sello') })),
    el('span', { class: 'insignia-nivel', texto: t(`extra.nivel.${q.nivel}`) }),
    talCual('span', q.temaTitulo, 'q-seccion'));
  const pintar = i => {
    h.quitarHojaDe(raiz);
    avance(i);
    const q = r.preguntas[i];
    let elegida = null;
    const botones = q.opciones.map(o => el('button', {
      type: 'button', class: 'opcion-carta', 'data-letra': o.letra, 'aria-pressed': 'false',
      onclick: () => { elegida = o.letra; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === elegida)); comprobar.disabled = false; },
    }, el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto')));
    const comprobar = h.botonGrande(t('acad.comprobar'), async () => {
      if (!elegida) return;
      comprobar.disabled = true;
      for (const b of botones) b.disabled = true;
      const x = await h.api('POST', `/api/academia/extra/${encodeURIComponent(materia)}/responder`, { pregunta: q.id, elegida });
      if (!sigue()) return;
      if (!x.ok) { comprobar.disabled = false; for (const b of botones) b.disabled = false; return h.avisar(h.textoError(x.datos.error), 'mal'); }
      const res = x.datos;
      hechas.push(res);
      avance(i + 1);
      h.sonar(res.acierto ? 'bien' : 'mal');
      for (const b of botones) {
        if (b.dataset.letra === res.correcta) b.classList.add('es-correcta');
        if (b.dataset.letra === res.elegida && !res.acierto) b.classList.add('es-mala');
      }
      const final = i + 1 >= r.preguntas.length;
      const boton = h.botonGrande(final ? t('acad.ver_resultado') : t('acad.continuar'), () => (final ? resultado() : (pintar(i + 1), window.scrollTo(0, 0))), { tono: res.acierto ? 'verde' : 'rojo' });
      pie.replaceChildren();
      h.ponerHoja(raiz, h.hojaRespuesta({
        acierto: res.acierto,
        titulo: res.acierto ? t('acad.correcto') : t('acad.respuesta_correcta', { letra: res.correcta }),
        partes: [
          res.porque ? el('div', { class: 'retro-mia' }, el('strong', { texto: t('extra.porque') }), talCual('p', res.porque)) : null,
          el('div', { class: 'retro-sencilla' }, el('strong', { texto: t('extra.explicacion') }), talCual('p', res.explicacion)),
          res.fuente ? el('p', { class: 'extra-fuente' }, el('span', { texto: t('extra.fuente', { libro: res.fuente.libro, pagina: res.fuente.pagina ?? '' }) }),
            res.fuente.cita ? el('q', { class: 'extra-cita', texto: res.fuente.cita }) : null) : null,
          el('p', { class: 'extra-sello', texto: t('extra.sello') }),
        ],
        boton,
      }));
      if (res.acierto) h.celebrar(zona); else h.sacudir(zona.querySelector('.es-mala'));
    }, { deshabilitado: true, sonido: null });
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta' }, cabeza(q), talCual('p', q.enunciado, 'q-enunciado'),
      el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones)));
    pie.replaceChildren(comprobar);
  };
  const resultado = () => {
    h.quitarHojaDe(raiz);
    barra.poner(1, 1);
    cuenta.textContent = '';
    const bien = hechas.filter(x => x.acierto).length;
    zona.replaceChildren(el('section', { class: 'resultado-vuelo bien' },
      el('p', { class: 'extra-sello grande', texto: t('extra.sello') }),
      el('h1', { class: 'titulo-grande', texto: t('extra.ronda.hecha') }),
      el('p', { class: 'bajada', texto: t('extra.ronda.nota', { bien: numero(bien), total: numero(hechas.length) }) }),
      el('p', { class: 'suave chica', texto: t('extra.progreso.nota') })));
    pie.classList.add('apilados');
    pie.replaceChildren(
      el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: async e => {
        e.currentTarget.disabled = true;
        const x = await h.api('POST', `/api/academia/extra/${encodeURIComponent(materia)}/ronda`, pedido);
        if (!x.ok) { e.currentTarget.disabled = false; return h.avisar(h.textoError(x.datos.error), 'mal'); }
        pie.classList.remove('apilados');
        ronda(x.datos, pedido, h);
      } }, el('span', { texto: t('extra.otra') })),
      el('a', { class: 'boton-3d blanco', href: `#extra/${encodeURIComponent(materia)}`, onclick: () => { if (location.hash === `#extra/${materia}`) window.dispatchEvent(new HashChangeEvent('hashchange')); } }, el('span', { texto: t('extra.volver') })));
    if (bien) h.celebrar(zona);
    window.scrollTo(0, 0);
  };
  h.mostrar(raiz);
  pintar(0);
}
export { NIVELES };
