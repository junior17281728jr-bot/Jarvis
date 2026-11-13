// Academia 0.13.7: «Repaso final» (solo se carga en #repaso…). Para el día antes del examen: practicar todo sin volver a
// leer las clases (src/academia/repaso-final.js).
//  - #repaso: las dos opciones grandes. A) «Test Guide completo» (Todo · Por materia · Solo las que fallé, y «Seguir donde
//    quedaste» si hoy dejó una vuelta a medias). B) «Examen oral: todo lo que te pueden preguntar» (Todo o un capítulo).
//  - #repaso/test-guide/<intento>: cada pregunta TAL CUAL (enunciado, opciones y correcta del paquete); al responder,
//    ✅/❌ y UNA línea corta de la explicación del paquete. Las que falla vuelven al final hasta acertarlas (la primera
//    respuesta es la que cuenta: esas vueltas se revisan aquí, con la correcta que ya llegó).
//  - #repaso/oral[/<capítulo>]: tarjetas con la pregunta del libro (inglés, tal cual) → «Ver respuesta» (la del libro tal
//    cual, con su página) → «La sabía» / «No la sabía». Las que no sabía vuelven al final.
// Todo con h.el (nunca texto como código) y clases (nunca estilos escritos); los textos, de public/i18n.

// 0.14.3: el oral en español (si ya está traducido), con «Español | Inglés original» (public/oral-idioma.js).
import { selectorIdioma, bilingue, rotulo } from './oral-idioma.js';

const RUTA = '#repaso';

export function pantallaRepasoFinal(d, h) {
  const { el, t, tn, numero, icono, mostrar, marco, nombreMateria, api, avisar, textoError, sonar } = h;
  const empezar = async (pedido, boton) => {
    sonar?.('toque');
    if (boton) boton.disabled = true;
    const r = await api('POST', '/api/academia/repaso-final/ronda', pedido);
    if (boton) boton.disabled = false;
    if (!r.ok) return avisar(textoError(r.datos.error), 'mal');
    location.hash = `${RUTA}/test-guide/${r.datos.id}`;
  };
  const tg = d.tg;
  const opcion = (texto, detalle, alPulsar, { deshabilitado = false, clase = 'blanco' } = {}) => el('button', { type: 'button', class: `boton-3d ${clase} rf-opcion`, disabled: deshabilitado, onclick: e => alPulsar(e.currentTarget) },
    el('span', { class: 'rf-opcion-texto' }, el('strong', { texto }), detalle ? el('span', { class: 'rf-opcion-detalle', texto: detalle }) : null));
  const listaMaterias = el('div', { class: 'rf-materias', hidden: true },
    tg.materias.map(m => opcion(nombreMateria(m.id), tn('rf.n_preguntas', { n: m.total }), b => empezar({ materia: m.id }, b))));
  const partA = el('section', { class: 'panel rf-parte rf-tg', 'aria-labelledby': 'rf-tg-titulo' },
    el('h2', { id: 'rf-tg-titulo', class: 'con-icono' }, icono('libro'), el('span', { texto: t('rf.tg.titulo') })),
    tg.total ? [
      el('p', { class: 'suave', texto: tn('rf.tg.linea', { n: tg.total }) }),
      tg.enExamen ? el('p', { class: 'aviso con-icono' }, icono('atencion', 'icono chico'), el('span', { texto: t('rf.tg.en_examen') })) : null,
      tg.abierta ? opcion(t('rf.seguir'), t('rf.seguir.detalle', { n: numero(tg.abierta.respondidas), total: numero(tg.abierta.total) }),
        () => { sonar?.('toque'); location.hash = `${RUTA}/test-guide/${tg.abierta.id}`; }, { clase: 'naranja', deshabilitado: tg.enExamen }) : null,
      el('div', { class: 'rf-opciones' },
        opcion(t('rf.todo'), tn('rf.n_preguntas', { n: tg.total }), b => empezar({}, b), { clase: tg.abierta ? 'blanco' : 'naranja', deshabilitado: tg.enExamen }),
        tg.materias.length > 1 ? opcion(t('rf.por_materia'), tn('rf.n_materias', { n: tg.materias.length }), b => {
          listaMaterias.hidden = !listaMaterias.hidden;
          b.setAttribute('aria-expanded', String(!listaMaterias.hidden));
        }, { deshabilitado: tg.enExamen }) : null,
        opcion(t('rf.falladas'), tg.falladas ? tn('rf.n_preguntas', { n: tg.falladas }) : t('rf.falladas.ninguna'), b => empezar({ falladas: true }, b), { deshabilitado: !tg.falladas || tg.enExamen })),
      tg.materias.length > 1 ? listaMaterias : null]
      : el('p', { class: 'suave', texto: t('rf.tg.vacio') }));
  const o = d.oral;
  const partB = el('section', { class: 'panel rf-parte rf-oral', 'aria-labelledby': 'rf-oral-titulo' },
    el('h2', { id: 'rf-oral-titulo', class: 'con-icono' }, icono('microfono'), el('span', { texto: t('rf.oral.titulo') })),
    o.hay ? [
      el('p', { class: 'suave', texto: tn('rf.oral.linea', { n: o.total }) }),
      o.marcadas ? el('p', { class: 'chica con-icono' }, icono('marca', 'icono chico'), el('span', { texto: t('rf.oral.hoy', { n: numero(o.marcadas), total: numero(o.total), bien: numero(o.sabidas) }) })) : null,
      el('div', { class: 'rf-opciones' },
        el('a', { class: 'boton-3d naranja rf-opcion', href: `${RUTA}/oral` }, el('span', { class: 'rf-opcion-texto' }, el('strong', { texto: o.marcadas ? t('rf.oral.seguir') : t('rf.todo') }), el('span', { class: 'rf-opcion-detalle', texto: tn('rf.n_preguntas', { n: o.total }) }))),
        ...(o.capitulos.length > 1 ? o.capitulos.map(c => el('a', { class: 'boton-3d blanco rf-opcion', href: `${RUTA}/oral/${encodeURIComponent(c.id)}` },
          el('span', { class: 'rf-opcion-texto' }, el('strong', { texto: t('rf.oral.capitulo', { n: numero(c.numero), nombre: nombreMateria(c.id) }) }), el('span', { class: 'rf-opcion-detalle', texto: tn('rf.n_preguntas', { n: c.total }) })))) : []))]
      : el('p', { class: 'suave', texto: t('rf.oral.vacio') }));
  mostrar(marco('repaso',
    el('section', { class: 'repaso-final' },
      el('h1', { class: 'titulo-grande con-icono' }, icono('trofeo'), el('span', { texto: t('rf.titulo') })),
      el('p', { class: 'bajada', texto: t('rf.linea') }),
      el('p', { class: 'suave chica', texto: t('rf.no_cuenta') }),
      partA, partB)));
}

// ---------- A) Una vuelta del Test Guide ----------
export function rondaTestGuide(intento, h) {
  const { el, t, numero, icono, talCual, api, avisar, textoError, mostrar, marcoEstudio, combustible, botonGrande, ponerHoja, quitarHojaDe, hojaRespuesta,
    sonar, celebrar, sacudir, tarjetaPregunta, medidor, anotarRespuestaDelDia, claseMateria, nombreMateria } = h;
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = marcoEstudio({ clase: `practica-tg repaso-final-ronda ${intento.materia ? claseMateria(intento.materia) : ''}`, barra: barra.nodo, cuenta, cuerpo: zona, pie, salir: RUTA });
  const titulo = intento.materia ? t('rf.ronda.de', { materia: nombreMateria(intento.materia) }) : t('rf.tg.titulo');
  // Primero las que faltan (en su orden); después, otra vez, las que ya falló (al volver a una vuelta de hoy).
  const cola = [...intento.preguntas.filter(q => !q.respuesta).map(q => ({ q, otra: false })), ...intento.preguntas.filter(q => q.respuesta && !q.respuesta.acierto).map(q => ({ q, otra: true }))];
  const repetidas = new Set(cola.filter(x => x.otra).map(x => x.q.id));
  // «12 de 32» mientras va la primera vuelta (la que está en pantalla cuenta); en las que vuelven, «Quedan 3».
  const avance = (enPantalla, otra) => {
    const hechas = intento.preguntas.filter(q => q.respuesta).length;
    barra.poner(hechas, intento.total);
    cuenta.textContent = otra ? t('rf.ronda.quedan', { n: numero(cola.filter(x => x.otra).length + (enPantalla ? 1 : 0)) })
      : t('acad.de', { n: numero(Math.min(intento.total, hechas + (enPantalla ? 1 : 0))), total: numero(intento.total) });
  };
  const siguiente = () => {
    quitarHojaDe(raiz);
    const x = cola.shift();
    if (!x) return terminarVuelta();
    pintar(x);
    window.scrollTo(0, 0);
  };
  const pintar = ({ q, otra }) => {
    avance(true, otra);
    let elegida = null;
    const botones = q.opciones.map(o => el('button', {
      type: 'button', class: 'opcion-carta', 'data-letra': o.letra, 'aria-pressed': 'false',
      onclick: () => { elegida = o.letra; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === elegida)); comprobar.disabled = false; },
    }, el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto')));
    const comprobar = botonGrande(t('acad.comprobar'), async () => {
      if (!elegida) return;
      comprobar.disabled = true;
      for (const b of botones) b.disabled = true;
      let resp;
      if (otra) {
        // Otra vez una que ya falló: la correcta ya llegó (la primera respuesta es la que cuenta).
        resp = { ...q.respuesta, elegida, acierto: elegida === q.respuesta.correcta };
      } else {
        const x = await api('POST', `/api/academia/repaso-final/ronda/${intento.id}/responder`, { pregunta: q.id, elegida });
        if (!zona.isConnected) return;
        if (!x.ok) { comprobar.disabled = false; for (const b of botones) b.disabled = false; return avisar(textoError(x.datos.error), 'mal'); }
        resp = x.datos.respuesta;
        q.respuesta = resp;
        anotarRespuestaDelDia?.();
      }
      sonar(resp.acierto ? 'bien' : 'mal');
      for (const b of botones) {
        if (b.dataset.letra === resp.correcta) b.classList.add('es-correcta');
        if (b.dataset.letra === elegida && !resp.acierto) b.classList.add('es-mala');
      }
      if (!resp.acierto) { cola.push({ q, otra: true }); repetidas.add(q.id); }
      avance(false, otra);
      pie.replaceChildren();
      ponerHoja(raiz, hojaRespuesta({
        acierto: resp.acierto,
        titulo: resp.acierto ? t('rf.bien') : t('rf.mal', { letra: resp.correcta }),
        partes: [
          resp.breve ? el('p', { class: 'rf-breve con-icono' }, icono('bombilla', 'icono chico'), talCual('span', resp.breve)) : null,
          !resp.acierto ? el('p', { class: 'suave chica', texto: t('rf.vuelve') }) : null,
        ],
        boton: botonGrande(t('acad.continuar'), siguiente, { tono: resp.acierto ? 'verde' : 'rojo' }),
      }));
      if (resp.acierto) celebrar(zona); else sacudir(zona.querySelector('.es-mala'));
    }, { deshabilitado: true, sonido: null });
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta' },
      el('p', { class: 'pregunta-de', texto: otra ? t('rf.ronda.otra_vez') : titulo }),
      tarjetaPregunta(q), el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones)));
    pie.replaceChildren(comprobar);
  };
  const terminarVuelta = async () => {
    barra.poner(1, 1);
    cuenta.textContent = '';
    const x = intento.terminado ? { ok: true, datos: { total: intento.total, aciertos: intento.aciertos, pct: intento.total ? Math.floor((intento.aciertos * 100) / intento.total) : 0, falladas: intento.preguntas.filter(q => q.respuesta && !q.respuesta.acierto).map(q => q.id) } }
      : await api('POST', `/api/academia/repaso-final/ronda/${intento.id}/terminar`, {});
    if (!zona.isConnected) return;
    if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
    intento.terminado = true;
    const r = x.datos;
    zona.replaceChildren(el('section', { class: `resultado-vuelo ${r.aciertos === r.total ? 'bien' : 'sigue'}`, 'data-foco': true },
      medidor(r.pct, { etiqueta: t('rf.nota') }),
      el('h1', { class: 'titulo-grande', texto: r.aciertos === r.total ? t('rf.fin.todo_bien') : t('rf.fin.titulo') }),
      el('p', { class: 'bajada', texto: t('rf.fin.primera', { n: numero(r.aciertos), total: numero(r.total) }) }),
      repetidas.size ? el('p', { class: 'chica con-icono' }, icono('actualizar', 'icono chico'), el('span', { texto: t('rf.fin.repetidas', { n: numero(repetidas.size) }) })) : null,
      el('p', { class: 'suave chica', texto: t('rf.no_cuenta') })));
    pie.classList.add('apilados');
    pie.replaceChildren(...[
      r.falladas.length ? el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: async e => {
        const boton = e.currentTarget;
        boton.disabled = true;
        const n = await api('POST', '/api/academia/repaso-final/ronda', { falladas: true, ...(intento.materia ? { materia: intento.materia } : {}) });
        if (!n.ok) { boton.disabled = false; return avisar(textoError(n.datos.error), 'mal'); }
        location.hash = `${RUTA}/test-guide/${n.datos.id}`;
      } }, el('span', { texto: t('rf.fin.falladas') })) : null,
      el('a', { class: 'boton-3d blanco', href: RUTA }, el('span', { texto: t('rf.volver') }))].filter(Boolean));
    if (r.aciertos) celebrar(zona);
    window.scrollTo(0, 0);
  };
  mostrar(raiz);
  siguiente();
}

// ---------- B) El oral: tarjetas ----------
// El mazo: primero las que hoy no ha marcado; después las que hoy «no sabía». Las que «no sabía» vuelven al final.
export function mazoOral(tarjetas, marcas) {
  return [...tarjetas.filter(x => !Object.hasOwn(marcas, x.id)), ...tarjetas.filter(x => marcas[x.id] === 0)];
}
export function rondaOralFinal(d, materia, h) {
  const { el, t, numero, icono, talCual, api, avisar, textoError, mostrar, marcoEstudio, combustible, botonGrande, sonar, celebrar, nombreMateria, vistaVisual } = h;
  const tarjetas = d.tarjetas.filter(x => materia == null || x.materia === materia);
  const marcas = { ...d.marcas };
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = marcoEstudio({ clase: 'leccion-tarjetas repaso-final-oral', barra: barra.nodo, cuenta, cuerpo: zona, pie, salir: RUTA });
  let cola = mazoOral(tarjetas, marcas);
  const avance = () => {
    const sabidas = tarjetas.filter(x => marcas[x.id] === 1).length;
    barra.poner(sabidas, tarjetas.length);
    cuenta.textContent = t('rf.oral.cuenta', { n: numero(sabidas), total: numero(tarjetas.length) });
  };
  const pagina = x => t('oral.pagina', { libro: x.libro ?? t('oral.libro'), pagina: x.pagina });
  const marcar = async (x, sabia, botones) => {
    for (const b of botones) b.disabled = true;
    const r = await api('POST', '/api/academia/repaso-final/oral/marcar', { tarjeta: x.id, sabia });
    if (!zona.isConnected) return;
    if (!r.ok) { for (const b of botones) b.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
    marcas[x.id] = sabia ? 1 : 0;
    sonar(sabia ? 'bien' : 'toque');
    if (!sabia) cola.push(x);
    siguiente();
  };
  // 0.14.3: la pregunta en español (si ya está traducida) con «Español | Inglés original»; la respuesta igual, y su dibujo.
  const frente = x => [
    el('div', { class: 'tarjeta-sello' },
      el('span', { class: `sello${x.adicional ? '' : ' ingles'}`, texto: x.adicional ? t('rf.oral.adicional') : t('oral.del_libro') }),
      el('span', { class: 'sello-parte', texto: t('rf.oral.capitulo', { n: numero(x.capitulo), nombre: nombreMateria(x.materia) }) })),
    selectorIdioma(h),
    el('p', { class: 'rf-oral-tema' }, talCual('span', x.temaTitulo, 'fuerte'), x.temaTituloEn ? el('span', { class: 'suave chica', lang: 'en' }, ' · ', talCual('span', x.temaTituloEn)) : null),
    el('section', { class: 'oral-qa' },
      x.n != null ? rotulo(h, Boolean(x.pregunta_es), t('oral.pregunta_es', { n: x.n }), t('oral.pregunta_libro', { n: x.n })) : el('p', { class: 'oral-qa-etiqueta', texto: t('rf.oral.pregunta') }),
      bilingue(h, 'p', x.pregunta_es, x.pregunta_en, 'oral-qa-pregunta')),
  ];
  let dibujo = null;
  const pintar = x => {
    dibujo?.destruir?.();
    dibujo = null;
    avance();
    const ver = botonGrande(t('rf.oral.ver'), () => pintarAtras(x), { tono: 'azul' });
    zona.replaceChildren(el('article', { class: 'tarjeta-leccion oral-libro rf-tarjeta' }, ...frente(x),
      el('p', { class: 'suave chica con-icono' }, icono('microfono', 'icono chico'), el('span', { texto: t('rf.oral.piensa') }))));
    pie.replaceChildren(ver);
  };
  const pintarAtras = x => {
    sonar('toque');
    dibujo = x.visual && vistaVisual ? vistaVisual(x.visual) : null;
    zona.replaceChildren(el('article', { class: 'tarjeta-leccion oral-libro rf-tarjeta' }, ...frente(x),
      el('section', { class: 'oral-qa rf-oral-respuesta' },
        x.respuesta_en ? [rotulo(h, Boolean(x.respuesta_es), t('oral.respuesta_es'), t('oral.respuesta_libro')), bilingue(h, 'p', x.respuesta_es, x.respuesta_en, 'oral-qa-respuesta')]
          : [el('p', { class: 'oral-qa-etiqueta', texto: t('oral.respuesta_libro') }), el('p', { class: 'suave', texto: t('rf.oral.sin_respuesta') })]),
      el('p', { class: 'oral-pagina con-icono-chico' }, icono('libro', 'icono chico'), el('span', { texto: pagina(x) })),
      dibujo?.nodo ?? null,
      x.explicacion_es ? el('aside', { class: 'caja-ejemplo oral-es' }, el('p', { class: 'caja-ejemplo-titulo', texto: t('oral.explicacion') }), talCual('p', x.explicacion_es)) : null));
    const botones = [];
    botones.push(el('button', { type: 'button', class: 'boton-3d grande rojo', onclick: () => marcar(x, false, botones) }, el('span', { texto: t('rf.oral.no_sabia') })));
    botones.push(el('button', { type: 'button', class: 'boton-3d grande verde', onclick: () => marcar(x, true, botones) }, el('span', { texto: t('rf.oral.sabia') })));
    pie.replaceChildren(el('div', { class: 'rf-sabia' }, botones));
  };
  const siguiente = () => {
    const x = cola.shift();
    window.scrollTo(0, 0);
    if (x) return pintar(x);
    dibujo?.destruir?.();
    dibujo = null;
    avance();
    cuenta.textContent = '';
    zona.replaceChildren(el('section', { class: 'resultado-vuelo bien', 'data-foco': true },
      el('span', { class: 'portada-icono', 'aria-hidden': 'true' }, icono('trofeo')),
      el('h1', { class: 'titulo-grande', texto: t('rf.oral.fin') }),
      el('p', { class: 'bajada', texto: t('rf.oral.fin.linea', { total: numero(tarjetas.length) }) })));
    pie.classList.add('apilados');
    pie.replaceChildren(
      el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: async e => {
        const boton = e.currentTarget;
        boton.disabled = true;
        const r = await api('POST', '/api/academia/repaso-final/oral/reiniciar', materia ? { materia } : {});
        if (!r.ok) { boton.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
        for (const x of tarjetas) delete marcas[x.id];
        cola = mazoOral(tarjetas, marcas);
        pie.classList.remove('apilados');
        siguiente();
      } }, el('span', { texto: t('rf.oral.de_nuevo') })),
      el('a', { class: 'boton-3d blanco', href: RUTA }, el('span', { texto: t('rf.volver') })));
    celebrar(zona);
  };
  mostrar(raiz);
  if (!tarjetas.length) {
    zona.replaceChildren(el('p', { class: 'suave', texto: t('rf.oral.vacio') }));
    pie.replaceChildren(el('a', { class: 'boton-3d blanco', href: RUTA }, el('span', { texto: t('rf.volver') })));
    return;
  }
  siguiente();
}
