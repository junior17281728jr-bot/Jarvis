// Academia 0.13.1: «Preparándote para el examen oral» (solo se carga en #oral…). Una sección APARTE del Test Guide, con su
// propio Camino (los capítulos de la Guía del examen oral), sus clases en español con la misma cara que Factores Humanos
// (tarjetas, dibujos, fichas de inglés, «Recuerda»), cada pregunta del libro TAL CUAL en inglés con su respuesta TAL CUAL,
// la explicación en español y los puntos clave; práctica por tema con «¿De dónde salió?», el examen de cada capítulo, el
// examen final y «Listo para el oral». Todo con h.el (nunca texto como código); los textos, de public/i18n.

import { caminoConMapa, TOTAL_TEMAS_MAPA } from './oral-mapa.js';

const ruta = (...partes) => `#oral${partes.length ? `/${partes.map(encodeURIComponent).join('/')}` : ''}`;

// El Camino oral. 0.13.2: igual que el Camino principal: los capítulos 1 a 8 y «Escenarios», cada uno con su título en
// español grande y el inglés chico debajo, plegables; adentro TODOS los temas del libro en su orden («1A · Privilegios y
// limitaciones»), los que todavía no tienen clase en gris con «Pronto»; el examen de cada capítulo y, al final, el nodo
// del «Examen oral». Con su pestaña propia abajo («Oral»).
export function pantallaOral(d, h) {
  const { el, t, tn, numero, icono, mostrar, marco, nombreMateria, nodoCamino, barraLlena, anilloAvance, plegarCamino } = h;
  if (!d.hay) return mostrar(marco('oral', el('section', { class: 'tarjeta' }, el('p', { texto: t('oral.vacio') }))));
  const enEspanol = (document.documentElement.lang || 'es') !== 'en';
  const sig = d.siguiente;
  const capitulos = caminoConMapa(d.materias);
  // Lo que plegarCamino necesita de cada capítulo (estado, avance y sus temas).
  const resumen = capitulos.map(c => ({
    id: c.id, temas: c.temas, pct: c.m?.pct ?? 0,
    estado: !c.m ? 'vacia' : c.m.examen.aprobado ? 'aprobada' : 'abierta',
  }));
  const capitulo = (c, n) => {
    const m = c.m;
    const esc = c.id === 'oral_escenarios';
    let i = 0;
    const nodos = c.temas.map(tm => {
      const x = tm.x;
      const nombre = enEspanol ? tm.es : tm.en || tm.es;
      const titulo = tm.letra ? `${c.n}${tm.letra} · ${nombre}` : nombre;
      const ingles = enEspanol && tm.en && tm.en !== tm.es ? tm.en : null;
      if (!x) {
        return nodoCamino({ clase: 'bloqueado pronto', nombreIcono: 'reloj', titulo, en: ingles, detalle: t('acad.pronto'), etiqueta: t('oral.tema.pronto', { tema: titulo }), i: i++ });
      }
      const actual = sig?.materia === c.id && sig?.tema === x.id;
      const nivel = x.preguntas && x.bien >= x.preguntas ? 'dominado' : x.leido && x.vistas >= x.preguntas ? 'terminado' : x.leido || x.vistas ? 'empezado' : 'nuevo';
      return nodoCamino({
        clase: x.leido ? 'hecho' : 'abierto', href: ruta('tema', c.id, x.id), i: i++, nombreIcono: x.leido ? 'marca' : 'libro',
        titulo, en: ingles, detalle: tn('oral.n_preguntas_libro', { n: x.qa }), etiqueta: t('oral.tema.etiqueta', { tema: titulo }),
        actual, burbuja: actual ? t(sig.tipo === 'practica' ? 'oral.practicar' : 'acad.empezar') : null, avance: { nivel, pct: x.pct },
      });
    });
    if (m) {
      const ex = m.examen;
      const actualEx = sig?.tipo === 'examen' && sig.materia === c.id;
      nodos.push(nodoCamino({
        clase: `examen ${ex.aprobado ? 'hecho' : 'abierto'}`, href: ruta('examen', c.id), i: i++, nombreIcono: 'trofeo',
        titulo: t('oral.examen.nodo'), detalle: ex.mejor != null ? t('acad.mejor', { n: numero(ex.mejor) }) : tn('acad.n_preguntas', { n: Math.min(m.preguntas, d.examenCapitulo ?? 20) }),
        etiqueta: t('oral.examen.de', { capitulo: nombreMateria(c.id) }), actual: actualEx, burbuja: actualEx ? t('acad.empezar') : null,
      }));
    }
    const listos = c.temas.filter(x => x.x).length;
    return el('section', { class: `materia-bloque oral-capitulo ${m ? resumen[n].estado : 'vacia'}`, 'aria-labelledby': `materia-${c.id}` },
      el('header', { class: 'banner-materia' },
        el('span', { class: 'banner-icono', 'aria-hidden': 'true' }, m ? anilloAvance(m.pct ?? 0, 'anillo-materia') : null, icono(esc ? 'radio' : 'manual')),
        el('div', { class: 'banner-texto' },
          el('p', { class: 'banner-ante', texto: esc ? t('oral.escenarios.ante') : t('oral.capitulo_n', { n: numero(c.n) }) }),
          el('h2', { id: `materia-${c.id}`, class: 'banner-titulo', texto: nombreMateria(c.id) }),
          enEspanol && c.en ? el('p', { class: 'banner-en', lang: 'en', texto: c.en }) : null,
          m ? el('div', { class: 'banner-avance' }, el('span', { class: 'banner-barra' }, barraLlena(m.pct)),
            el('span', { texto: esc ? t('oral.bien_de', { n: numero(m.bien), total: numero(m.preguntas) }) : t('oral.temas_listos', { n: numero(listos), total: numero(c.temas.length) }) }))
            : el('p', { class: 'banner-linea', texto: tn('oral.pronto.linea', { n: c.temas.length }) }))),
      el('ol', { class: 'sendero', 'aria-label': nombreMateria(c.id) }, nodos));
  };
  const continuar = sig ? el('a', { class: 'boton-3d grande boton-continuar con-icono', href: sig.tipo === 'final' ? ruta('final') : sig.tipo === 'examen' ? ruta('examen', sig.materia) : sig.tipo === 'practica' ? ruta('practica', sig.materia, sig.tema) : ruta('tema', sig.materia, sig.tema) },
    icono('flecha', 'icono chico'), el('span', { texto: t(`oral.siguiente.${sig.tipo}`) })) : null;
  const f = d.final;
  const actualFinal = sig?.tipo === 'final';
  // El último nodo: el «Examen oral» (mezcla todos los capítulos y los escenarios).
  const nodoFinal = el('section', { class: 'oral-final-nodo', 'aria-labelledby': 'oral-final-titulo' },
    el('h2', { id: 'oral-final-titulo', class: 'solo-lectores', texto: t('oral.final.titulo') }),
    el('ol', { class: 'sendero' }, nodoCamino({
      clase: `examen final ${f.aprobado ? 'hecho' : f.disponible ? 'abierto' : 'bloqueado'}`, href: f.disponible ? ruta('final') : null, i: 0, nombreIcono: 'medalla',
      titulo: t('oral.final.titulo'), detalle: f.mejor != null ? t('acad.mejor', { n: numero(f.mejor) }) : tn('acad.n_preguntas', { n: f.preguntas }),
      etiqueta: t('oral.final.linea', { n: numero(f.preguntas) }), actual: actualFinal, burbuja: actualFinal ? t('acad.empezar') : null,
    })));
  mostrar(marco('oral',
    el('section', { class: 'oral-portada' },
      el('span', { class: 'oral-sello', texto: t('oral.sello') }),
      el('h1', { class: 'titulo-grande', texto: t('oral.titulo') }),
      el('p', { class: 'bajada', texto: t('oral.mapa.linea', { n: numero(TOTAL_TEMAS_MAPA), listos: numero(capitulos.reduce((k, c) => k + c.temas.filter(x => x.x && x.letra).length, 0)) }) }),
      d.siguientePaso ? el('p', { class: 'insignia tono-bien', texto: t('oral.siguiente_paso') }) : null,
      continuar),
    plegarCamino(el('div', { class: 'camino oral-camino' }, capitulos.map(capitulo)), resumen, sig?.materia ? { materia: sig.materia } : null),
    nodoFinal,
    // «¿Listo para el oral?», debajo del Camino (arriba, lo primero es el mapa).
    panelListo(d.listo, h),
    el('section', { class: 'panel oral-errores' },
      el('p', { class: 'suave chica', texto: t('oral.errores.linea') }),
      el('a', { class: 'boton-3d blanco chico', href: ruta('practica', 'errores') }, el('span', { texto: t('oral.errores.boton') }))),
    el('p', { class: 'suave chica oral-nota', texto: t('oral.nota') })));
}

// «Listo para el oral / Todavía no» con su % y de qué sale (sin IA). Lo usan el Camino oral y Progreso.
export function panelListo(x, h) {
  const { el, t, numero, icono, medidor, nombreMateria } = h;
  if (!x) return null;
  return el('section', { class: `panel oral-listo ${x.listo ? 'listo' : 'todavia'}`, 'aria-labelledby': 'oral-listo-titulo' },
    el('h2', { id: 'oral-listo-titulo', class: 'con-icono' }, icono(x.listo ? 'medalla' : 'bandera'), el('span', { texto: t('oral.listo.titulo') })),
    el('div', { class: 'oral-listo-cuerpo' },
      medidor(x.pct, { etiqueta: t('oral.listo.medidor') }),
      el('div', {},
        el('p', { class: `insignia grande tono-${x.listo ? 'bien' : 'atencion'}`, texto: x.listo ? t('oral.listo.si') : t('oral.listo.no') }),
        el('ul', { class: 'lista-simple chica' },
          el('li', { texto: t('oral.listo.dominio', { pct: numero(x.dominio) }) }),
          el('li', { texto: t('oral.listo.capitulos', { pct: numero(x.capitulos) }) }),
          el('li', { texto: t('oral.listo.final', { pct: numero(x.final) }) })))),
    x.faltan?.length ? el('p', { class: 'suave chica', texto: t('oral.listo.falta', { lista: x.faltan.map(f => (f.tipo === 'final' ? t('oral.final.titulo') : t('oral.examen.de', { capitulo: nombreMateria(f.materia) }))).join(' · ') }) }) : null,
    el('p', { class: 'suave chica', texto: t('oral.listo.como', { n: numero(x.umbral) }) }));
}

// La clase de un tema: portada → tarjetas → cada pregunta del libro (tal cual) → «Para practicar en voz alta» → fin.
export function pantallaLeccionOral(l, h) {
  const { el, t, tn, numero, icono, talCual, api, mostrar, marcoEstudio, combustible, botonGrande, partirLeccion, vistaTarjeta, nombreMateria, celebrar, tutorUi, alDeslizar } = h;
  const tarjetas = partirLeccion(l.secciones);
  const pantallas = [{ tipo: 'portada' }, ...tarjetas, ...l.libro_qa.map((x, i) => ({ tipo: 'libro', x, i })), ...(l.adicionales.length ? [{ tipo: 'adicionales' }] : []), { tipo: 'fin' }];
  let paso = 0;
  let actual = null;
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const cuerpo = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = marcoEstudio({ clase: 'leccion-tarjetas leccion-oral', barra: barra.nodo, cuenta, cuerpo, pie, salir: ruta() });
  const libro = l.libro ?? t('oral.libro');
  const pagina = p => t('oral.pagina', { libro, pagina: p });
  const ir = n => { if (n >= 0 && n < pantallas.length) { paso = n; pintar(); window.scrollTo(0, 0); } };
  const atras = () => (paso > 0 ? el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': t('acad.atras'), onclick: () => ir(paso - 1) }, icono('flecha', 'icono volver-icono')) : null);
  const tarjetaLibro = ({ x, i }) => el('article', { class: 'tarjeta-leccion oral-libro' },
    el('div', { class: 'tarjeta-sello' }, el('span', { class: 'sello ingles', texto: t('oral.del_libro') }), el('span', { class: 'sello-parte', texto: t('acad.de', { n: numero(i + 1), total: numero(l.libro_qa.length) }) })),
    el('p', { class: 'oral-pagina con-icono-chico' }, icono('libro', 'icono chico'), el('span', { texto: pagina(x.pagina) })),
    el('section', { class: 'oral-qa', lang: 'en' },
      el('p', { class: 'oral-qa-etiqueta', lang: 'es', texto: t('oral.pregunta_libro', { n: x.n ?? i + 1 }) }),
      talCual('p', x.pregunta_en, 'oral-qa-pregunta'),
      x.respuesta_en ? el('p', { class: 'oral-qa-etiqueta', lang: 'es', texto: t('oral.respuesta_libro') }) : null,
      x.respuesta_en ? talCual('p', x.respuesta_en, 'oral-qa-respuesta') : null),
    x.explicacion_es ? el('aside', { class: 'caja-ejemplo oral-es' }, el('p', { class: 'caja-ejemplo-titulo', texto: t('oral.en_espanol') }), talCual('p', x.explicacion_es)) : null,
    x.puntos_clave.length ? el('aside', { class: 'recuerda' }, el('p', { class: 'recuerda-titulo con-icono' }, icono('bombilla', 'icono'), el('span', { texto: t('oral.puntos_clave') })),
      el('ul', { class: 'tarjeta-puntos' }, x.puntos_clave.map(p => talCual('li', p)))) : null);
  const pintar = () => {
    actual?.destruir?.();
    actual = null;
    const p = pantallas[paso];
    barra.poner(paso, pantallas.length - 1);
    cuenta.textContent = paso > 0 && paso < pantallas.length - 1 ? t('acad.de', { n: numero(paso), total: numero(pantallas.length - 2) }) : '';
    let nodo;
    let botones = [atras(), botonGrande(t('acad.continuar'), () => ir(paso + 1))];
    if (p.tipo === 'portada') {
      nodo = el('article', { class: 'portada-tema' },
        el('span', { class: 'portada-icono', 'aria-hidden': 'true' }, icono('manual')),
        el('p', { class: 'antetitulo', texto: `${t('oral.corto')} · ${nombreMateria(l.materia)}` }),
        el('h1', { class: 'titulo-grande', texto: l.titulo }),
        l.titulo_en ? el('p', { class: 'tarjeta-en', lang: 'en', texto: l.titulo_en }) : null,
        el('ul', { class: 'portada-datos' },
          el('li', {}, icono('tarjetas', 'icono'), el('span', { texto: tn('acad.n_tarjetas', { n: tarjetas.length }) })),
          el('li', {}, icono('libro', 'icono'), el('span', { texto: tn('oral.n_preguntas_libro', { n: l.libro_qa.length }) }))),
        el('p', { class: 'bajada', texto: t('oral.portada.linea') }));
      botones = [botonGrande(t('acad.empezar'), () => ir(1))];
    } else if (p.tipo === 'libro') {
      nodo = tarjetaLibro(p);
    } else if (p.tipo === 'adicionales') {
      nodo = el('article', { class: 'tarjeta-leccion oral-adicionales' },
        el('div', { class: 'tarjeta-sello' }, el('span', { class: 'sello', texto: t('oral.adicionales.sello') })),
        el('h2', { class: 'tarjeta-titulo', texto: t('oral.adicionales.titulo') }),
        el('p', { class: 'suave', texto: t('oral.adicionales.linea') }),
        el('ol', { class: 'oral-adicionales-lista', lang: 'en' }, l.adicionales.map(x => el('li', {}, talCual('p', x.pregunta_en), el('p', { class: 'suave chica', lang: 'es', texto: pagina(x.pagina) })))));
    } else if (p.tipo === 'fin') {
      if (!l.leido) { l.leido = true; api('POST', `/api/academia/oral/temas/${encodeURIComponent(l.materia)}/${encodeURIComponent(l.tema)}/leido`, {}).catch(() => {}); }
      nodo = el('article', { class: 'fin-leccion' },
        el('h1', { class: 'titulo-grande', texto: t('oral.fin.titulo') }),
        el('p', { class: 'bajada', texto: l.preguntas ? tn('oral.fin.linea', { n: l.preguntas }) : t('oral.fin.sin') }));
      botones = [atras(), l.preguntas ? el('a', { class: 'boton-3d grande verde', href: ruta('practica', l.materia, l.tema) }, el('span', { texto: t('oral.practicar') }))
        : el('a', { class: 'boton-3d grande verde', href: ruta() }, el('span', { texto: t('oral.volver') }))];
      setTimeout(() => { if (cuerpo.isConnected) celebrar(cuerpo); }, 150);
    } else {
      const v = vistaTarjeta(p, { materia: l.materia });
      nodo = v.nodo;
      actual = v;
      // Con IA, «Explícamelo mejor» / «Profundizar» (el tutor); sin IA, lo gratis («Modo básico»).
      if (Number.isInteger(p.seccion) && (!p.parte || p.parte === p.partes) && tutorUi) nodo.append(tutorUi().entendiste(l.materia, l.tema, p.seccion + 1));
    }
    cuerpo.replaceChildren(nodo);
    pie.replaceChildren(...botones.filter(Boolean));
  };
  if (alDeslizar) alDeslizar(cuerpo, { izquierda: () => { if (pantallas[paso].tipo !== 'fin') ir(paso + 1); }, derecha: () => ir(paso - 1) });
  pintar();
  mostrar(raiz);
}

// «¿De dónde salió?»: la pregunta y la respuesta del libro TAL CUAL (inglés, con su página) y cómo se armó esta pregunta.
function deDondeSalio(o, h) {
  const { el, t, talCual, icono } = h;
  if (!o) return null;
  return el('details', { class: 'oral-origen', open: true },
    el('summary', { class: 'con-icono' }, icono('libro', 'icono chico'), el('span', { texto: t('oral.origen.titulo') })),
    el('p', { class: 'oral-pagina suave chica', texto: t('oral.pagina', { libro: o.libro ?? t('oral.libro'), pagina: o.pagina }) }),
    el('div', { class: 'oral-qa', lang: 'en' },
      el('p', { class: 'oral-qa-etiqueta', lang: 'es', texto: t('oral.origen.pregunta') }), talCual('p', o.pregunta_en, 'oral-qa-pregunta'),
      el('p', { class: 'oral-qa-etiqueta', lang: 'es', texto: t('oral.origen.respuesta') }), talCual('p', o.respuesta_en, 'oral-qa-respuesta')),
    el('p', { class: 'oral-como chica' }, el('strong', { texto: `${t('oral.origen.como')} ` }), talCual('span', o.como)));
}

// Practicar: una por una, con la respuesta al momento.
export function rondaOral(r, pedido, h) {
  const { el, t, numero, icono, talCual, api, mostrar, marcoEstudio, combustible, botonGrande, ponerHoja, quitarHojaDe, hojaRespuesta, sonar, celebrar, sacudir, avisar, textoError } = h;
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = marcoEstudio({ clase: 'practica-tg practica-oral', barra: barra.nodo, cuenta, cuerpo: zona, pie, salir: ruta() });
  const hechas = [];
  const avance = i => { barra.poner(i, r.preguntas.length); cuenta.textContent = t('acad.de', { n: numero(i), total: numero(r.preguntas.length) }); };
  const pintar = i => {
    quitarHojaDe(raiz);
    avance(i);
    const q = r.preguntas[i];
    let elegida = null;
    const botones = q.opciones.map(o => el('button', {
      type: 'button', class: 'opcion-carta', 'data-letra': o.letra, 'aria-pressed': 'false',
      onclick: () => { elegida = o.letra; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === elegida)); comprobar.disabled = false; },
    }, el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto')));
    const comprobar = botonGrande(t('acad.comprobar'), async () => {
      if (!elegida) return;
      comprobar.disabled = true;
      for (const b of botones) b.disabled = true;
      const x = await api('POST', '/api/academia/oral/responder', { pregunta: q.id, elegida });
      if (!zona.isConnected) return;
      if (!x.ok) { comprobar.disabled = false; for (const b of botones) b.disabled = false; return avisar(textoError(x.datos.error), 'mal'); }
      const res = x.datos;
      hechas.push(res);
      avance(i + 1);
      sonar(res.acierto ? 'bien' : 'mal');
      for (const b of botones) {
        if (b.dataset.letra === res.correcta) b.classList.add('es-correcta');
        if (b.dataset.letra === res.elegida && !res.acierto) b.classList.add('es-mala');
      }
      const final = i + 1 >= r.preguntas.length;
      const boton = botonGrande(final ? t('acad.ver_resultado') : t('acad.continuar'), () => (final ? resultado() : (pintar(i + 1), window.scrollTo(0, 0))), { tono: res.acierto ? 'verde' : 'rojo' });
      pie.replaceChildren();
      ponerHoja(raiz, hojaRespuesta({
        acierto: res.acierto,
        titulo: res.acierto ? t('acad.correcto') : t('acad.respuesta_correcta', { letra: res.correcta }),
        partes: [
          res.porque ? el('div', { class: 'retro-mia' }, el('strong', { texto: t('extra.porque') }), talCual('p', res.porque)) : null,
          el('div', { class: 'retro-sencilla' }, el('strong', { texto: t('extra.explicacion') }), talCual('p', res.explicacion)),
          deDondeSalio(res.origen, h),
        ],
        boton,
      }));
      if (res.acierto) celebrar(zona); else sacudir(zona.querySelector('.es-mala'));
    }, { deshabilitado: true, sonido: null });
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta' },
      el('div', { class: 'q-cabeza' }, el('div', { class: 'insignia-pregunta oral' }, icono('manual', 'icono chico'), el('span', { texto: t('oral.sello') })), talCual('span', q.temaTitulo, 'q-seccion')),
      talCual('p', q.enunciado, 'q-enunciado'),
      el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones)));
    pie.replaceChildren(comprobar);
  };
  const resultado = () => {
    quitarHojaDe(raiz);
    barra.poner(1, 1);
    cuenta.textContent = '';
    const bien = hechas.filter(x => x.acierto).length;
    zona.replaceChildren(el('section', { class: 'resultado-vuelo bien' },
      el('h1', { class: 'titulo-grande', texto: t('oral.ronda.hecha') }),
      el('p', { class: 'bajada', texto: t('extra.ronda.nota', { bien: numero(bien), total: numero(hechas.length) }) })));
    pie.classList.add('apilados');
    pie.replaceChildren(
      el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: async e => {
        e.currentTarget.disabled = true;
        const x = await api('POST', '/api/academia/oral/ronda', pedido);
        if (!x.ok) { e.currentTarget.disabled = false; return avisar(textoError(x.datos.error), 'mal'); }
        pie.classList.remove('apilados');
        rondaOral(x.datos, pedido, h);
      } }, el('span', { texto: t('extra.otra') })),
      el('a', { class: 'boton-3d blanco', href: ruta() }, el('span', { texto: t('oral.volver') })));
    if (bien) celebrar(zona);
    window.scrollTo(0, 0);
  };
  mostrar(raiz);
  pintar(0);
}

// La portada de un examen (de un capítulo, o el final: «Examen oral (práctica final)»).
export function portadaExamenOral(d, alcance, h) {
  const { el, t, tn, numero, icono, mostrar, marco, nombreMateria, api, avisar, textoError } = h;
  const final = alcance === 'final';
  const m = final ? null : d.materias.find(x => x.id === alcance);
  if (!final && !m) return mostrar(marco('oral', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError('no_existe') }))));
  const ex = final ? d.final : m.examen;
  const n = final ? d.final.preguntas : Math.min(m.preguntas, d.examenCapitulo ?? 20);
  const empezar = async e => {
    e.currentTarget.disabled = true;
    const r = await api('POST', '/api/academia/oral/examen', final ? {} : { materia: alcance });
    if (!r.ok) { e.currentTarget.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
    examenOral(r.datos, h);
  };
  mostrar(marco('oral', el('a', { class: 'volver con-icono', href: ruta() }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('oral.volver') })),
    el('section', { class: 'examen-portada oral-examen-portada' },
      el('span', { class: 'examen-trofeo', 'aria-hidden': 'true' }, icono(final ? 'medalla' : 'trofeo')),
      el('p', { class: 'antetitulo', texto: t('oral.sello') }),
      el('h1', { class: 'titulo-grande', texto: final ? t('oral.final.titulo') : t('oral.examen.de', { capitulo: nombreMateria(alcance) }) }),
      el('p', { class: 'bajada', texto: final ? t('oral.final.portada') : t('oral.examen.portada') }),
      el('p', { class: 'examen-no-oficial con-icono-chico' }, icono('info', 'icono chico'), el('span', { texto: t('oral.no_oficial') })),
      el('ul', { class: 'portada-datos' },
        el('li', {}, icono('fila', 'icono'), el('span', { texto: tn('acad.n_preguntas', { n }) })),
        el('li', {}, icono('bandera', 'icono'), el('span', { texto: t('acad.necesitas', { n: numero(d.umbral) }) })),
        final ? el('li', {}, icono('radio', 'icono'), el('span', { texto: t('oral.final.escenarios') })) : null,
        ex.mejor != null ? el('li', {}, icono('estrella', 'icono'), el('span', { texto: t('acad.mejor', { n: numero(ex.mejor) }) })) : null),
      el('section', { class: 'examen-reglas', 'aria-labelledby': 'oral-reglas-titulo' },
        el('h2', { id: 'oral-reglas-titulo', texto: t('examen.reglas.titulo') }),
        el('ol', {}, el('li', { texto: t('oral.reglas.1') }), el('li', { texto: t('oral.reglas.2') }), el('li', { texto: t('oral.reglas.3', { n: numero(d.umbral) }) }))),
      el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: empezar }, el('span', { texto: t('acad.empezar_examen') })))));
}

// El examen: todas las preguntas, una por una, sin ver la respuesta; al entregar, la nota y la revisión.
function examenOral(e, h) {
  const { el, t, numero, icono, talCual, api, mostrar, marcoEstudio, combustible, botonGrande, avisar, textoError, celebrar, sonar } = h;
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const raiz = marcoEstudio({ clase: 'practica-tg examen-oral', barra: barra.nodo, cuenta, cuerpo: zona, pie, salir: ruta() });
  const respuestas = {};
  const pintar = i => {
    barra.poner(i, e.preguntas.length);
    cuenta.textContent = t('acad.de', { n: numero(i + 1), total: numero(e.preguntas.length) });
    const q = e.preguntas[i];
    const botones = q.opciones.map(o => el('button', {
      type: 'button', class: 'opcion-carta', 'data-letra': o.letra, 'aria-pressed': String(respuestas[q.id] === o.letra),
      onclick: () => { respuestas[q.id] = o.letra; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === o.letra)); siguiente.disabled = false; },
    }, el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto')));
    const ultima = i + 1 >= e.preguntas.length;
    const siguiente = botonGrande(ultima ? t('oral.entregar') : t('acad.continuar'), () => (ultima ? entregar(siguiente) : (pintar(i + 1), window.scrollTo(0, 0))), { deshabilitado: !respuestas[q.id] });
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta' },
      el('div', { class: 'q-cabeza' }, el('div', { class: 'insignia-pregunta oral' }, icono('trofeo', 'icono chico'), el('span', { texto: e.alcance === 'final' ? t('oral.final.titulo') : t('oral.examen.nodo') })), talCual('span', q.temaTitulo, 'q-seccion')),
      talCual('p', q.enunciado, 'q-enunciado'),
      el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones)));
    pie.replaceChildren(...[i > 0 ? el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': t('acad.atras'), onclick: () => pintar(i - 1) }, icono('flecha', 'icono volver-icono')) : null, siguiente].filter(Boolean));
  };
  const entregar = async boton => {
    boton.disabled = true;
    const r = await api('POST', '/api/academia/oral/examen/entregar', { examen: e.examen, respuestas });
    if (!r.ok) { boton.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
    const x = r.datos;
    barra.poner(1, 1);
    cuenta.textContent = '';
    sonar(x.aprobado ? 'bien' : 'mal');
    zona.replaceChildren(el('section', { class: `resultado-vuelo ${x.aprobado ? 'bien' : 'mal'}` },
      el('h1', { class: 'titulo-grande', texto: x.aprobado ? t('oral.examen.aprobado') : t('oral.examen.no') }),
      el('p', { class: 'bajada', texto: t('oral.examen.nota', { pct: numero(x.pct), bien: numero(x.bien), total: numero(x.total), n: numero(x.umbral) }) })),
    el('section', { class: 'panel oral-revision' },
      el('h2', { texto: t('oral.revision') }),
      el('ol', { class: 'oral-revision-lista' }, x.revision.map(q => el('li', { class: q.acierto ? 'bien' : 'mal' },
        talCual('p', q.enunciado, 'fuerte'),
        el('p', { class: 'chica', texto: q.acierto ? t('acad.correcto') : q.elegida ? t('oral.elegiste', { tuya: q.elegida, letra: q.correcta }) : t('oral.sin_responder', { letra: q.correcta }) }),
        q.porque ? talCual('p', q.porque, 'chica') : null,
        talCual('p', q.explicacion, 'chica suave'),
        deDondeSalio(q.origen, h))))));
    for (const d of zona.querySelectorAll('.oral-origen')) d.open = false;
    pie.replaceChildren(el('a', { class: 'boton-3d grande naranja', href: ruta() }, el('span', { texto: t('oral.volver') })));
    if (x.aprobado) celebrar(zona);
    window.scrollTo(0, 0);
  };
  mostrar(raiz);
  pintar(0);
}
