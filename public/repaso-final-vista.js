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
// 0.14.84: después de responder y al terminar la vuelta, todas las opciones (correcta en verde, la suya en rojo, las demás sin color).
import { opcionesRevisadas, filtroFallas, aplicarFiltro } from './opciones-revision.js';
// 0.14.95: «▶ Ver qué pasaría» (la consecuencia 3D de la opción elegida; el 3D se carga al tocarlo).
import { botonConsecuencia } from './consecuencia-vista.js';
// 0.14.85: «⚑ Reportar un error» de cada pregunta ya respondida (public/reportar-vista.js).
import { enlaceReportar, puntoPregunta } from './reportar-vista.js';

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
      tg.enExamen ? el('div', { class: 'aviso rf-en-examen' },
        el('p', { class: 'con-icono' }, icono('atencion', 'icono chico'), el('span', { texto: t('rf.tg.en_examen') })),
        // 0.14.54: con su botón para volver al examen (antes el aviso no llevaba a ningún lado).
        tg.examen?.intento ? el('a', { class: 'boton-3d rojo chico', href: `#practica/${tg.examen.intento}` }, el('span', { texto: t('acad.examen_abierto.volver') })) : null) : null,
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
      h.entradaJuego?.() ?? null, // 0.14.98: el Juego de vuelo
      h.recoInstructor?.() ?? null, // 0.14.34: «Recomendación de tu instructor»
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
          opcionesRevisadas(q.opciones, resp, h, { clase: 'rf-hoja-opciones' }),
          botonConsecuencia(resp, h),
          resp.breve ? el('p', { class: 'rf-breve con-icono' }, icono('bombilla', 'icono chico'), talCual('span', resp.breve)) : null,
          !resp.acierto ? el('p', { class: 'suave chica', texto: t('rf.vuelve') }) : null,
          enlaceReportar(puntoPregunta(q, { respondida: true, elegida })),
        ].filter(Boolean),
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
    zona.replaceChildren(...[el('section', { class: `resultado-vuelo ${r.aciertos === r.total ? 'bien' : 'sigue'}`, 'data-foco': true },
      medidor(r.pct, { etiqueta: t('rf.nota') }),
      el('h1', { class: 'titulo-grande', texto: r.aciertos === r.total ? t('rf.fin.todo_bien') : t('rf.fin.titulo') }),
      el('p', { class: 'bajada', texto: t('rf.fin.primera', { n: numero(r.aciertos), total: numero(r.total) }) }),
      repetidas.size ? el('p', { class: 'chica con-icono' }, icono('actualizar', 'icono chico'), el('span', { texto: t('rf.fin.repetidas', { n: numero(repetidas.size) }) })) : null,
      el('p', { class: 'suave chica', texto: t('rf.no_cuenta') })),
    revisionVuelta(intento.preguntas, h)].filter(Boolean));
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

// 0.14.84: la revisión de la vuelta (la primera respuesta de cada pregunta, la que cuenta): cada una con TODAS sus
// opciones (la correcta en verde, la suya en rojo, las demás sin color) y su línea corta; «Solo las que fallé» primero.
export function revisionVuelta(preguntas, h) {
  const { el, t, numero, icono, talCual } = h;
  const lista = (preguntas ?? []).filter(q => q.respuesta);
  if (!lista.length) return null;
  const malas = lista.filter(q => !q.respuesta.acierto).length;
  const filas = lista.map((q, k) => el('li', { class: `rf-revision-fila ${q.respuesta.acierto ? 'bien' : 'mal'}`, 'data-bien': q.respuesta.acierto ? '1' : '0' },
    el('p', { class: 'rf-revision-cabeza' },
      el('span', { class: `revision-marca ${q.respuesta.acierto ? 'tono-bien' : 'tono-mal'}`, 'aria-label': t(q.respuesta.acierto ? 'acad.correcto' : 'revision.fallada') }, icono(q.respuesta.acierto ? 'marca' : 'cerrar', 'icono chico')),
      el('span', { class: 'q-numero' }, q.numero ? talCual('span', t('acad.pregunta_n', { n: q.numero })) : numero(k + 1))),
    talCual('p', q.enunciado, 'q-enunciado rf-revision-enunciado'),
    opcionesRevisadas(q.opciones, q.respuesta, h),
    botonConsecuencia(q.respuesta, h),
    q.respuesta.breve ? el('p', { class: 'rf-breve con-icono' }, icono('bombilla', 'icono chico'), talCual('span', q.respuesta.breve)) : null,
    enlaceReportar(puntoPregunta(q, { respondida: true, elegida: q.respuesta.elegida ?? null }))));
  const filtro = filtroFallas(h, { malas, total: lista.length, alCambiar: solo => aplicarFiltro(filas, solo) });
  aplicarFiltro(filas, filtro.solo());
  return el('section', { class: 'panel revision rf-revision', 'aria-labelledby': 'rf-revision-titulo' },
    el('h2', { id: 'rf-revision-titulo', class: 'con-icono' }, icono('lupa'), el('span', { texto: t('revision.titulo') })),
    el('p', { class: 'suave', texto: t('rf.revision.linea', { bien: numero(lista.length - malas), mal: numero(malas) }) }),
    filtro.nodo,
    el('ol', { class: 'rf-revision-lista' }, filas));
}

// ---------- B) El oral: tarjetas ----------
// El mazo: primero las que hoy no ha marcado; después las que hoy «no sabía». Las que «no sabía» vuelven al final.
export function mazoOral(tarjetas, marcas) {
  return [...tarjetas.filter(x => !Object.hasOwn(marcas, x.id)), ...tarjetas.filter(x => marcas[x.id] === 0)];
}

// 0.14.108: la voz del oral del Repaso final. Se lee el idioma que se VE (data-oral-idioma en <html>, el mismo que usa
// el CSS): con «Inglés original» o si aún no hay español, el inglés tal cual. Cada texto va solo y tal cual viene del
// paquete (así el servidor lo reconoce como contenido compartido y su grabación se guarda para todos).
const idiomaVisto = () => (globalThis.document?.documentElement?.dataset?.oralIdioma === 'en' ? 'en' : 'es');
export function piezasPregunta(x, idioma = idiomaVisto()) {
  if (idioma !== 'en' && x.pregunta_es) return [{ texto: x.pregunta_es, lang: 'es' }];
  return x.pregunta_en ? [{ texto: x.pregunta_en, lang: 'en' }] : x.pregunta_es ? [{ texto: x.pregunta_es, lang: 'es' }] : [];
}
export function piezasRespuesta(x, idioma = idiomaVisto(), sinRespuesta = '') {
  if (idioma !== 'en' && x.respuesta_es) return [{ texto: x.respuesta_es, lang: 'es' }];
  if (x.respuesta_en) return [{ texto: x.respuesta_en, lang: 'en' }];
  if (x.respuesta_es) return [{ texto: x.respuesta_es, lang: 'es' }];
  // Sin respuesta en el libro (las «para practicar en voz alta»): la línea que se ve en la tarjeta.
  return sinRespuesta ? [{ texto: sinRespuesta, lang: 'es' }] : [];
}
// Las pausas de «Manos libres».
export const PAUSA_PENSAR = 6;
export const PAUSA_SIGUIENTE = 2000;

export function rondaOralFinal(d, materia, h) {
  const { el, t, tn, numero, icono, talCual, api, avisar, textoError, mostrar, marcoEstudio, combustible, botonGrande, sonar, celebrar, nombreMateria, vistaVisual } = h;
  const tarjetas = d.tarjetas.filter(x => materia == null || x.materia === materia);
  const marcas = { ...d.marcas };
  const barra = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });

  // ---- 0.14.108: «Con voz / Sin voz» (la misma preferencia de Configuración), «Tú controlas / Manos libres» ----
  const voz = h.voz ?? null;
  const reloj = h.reloj ?? { poner: (f, ms) => setTimeout(f, ms), quitar: id => clearTimeout(id) };
  let vozSi = Boolean(voz?.encendida?.());
  let libres = false; // solo esta vez (empieza apagado)
  let gen = 0; // cada paso nuevo (otra tarjeta, voz apagada, salir…) invalida lo que estaba esperando
  const relojes = new Set();
  const esperar = (ms, f) => { const id = reloj.poner(() => { relojes.delete(id); f(); }, ms); relojes.add(id); };
  const parar = () => { gen += 1; for (const id of relojes) reloj.quitar(id); relojes.clear(); tocaFila.replaceChildren(); cuentaVoz.textContent = ''; cuentaVoz.hidden = true; };
  const callar = () => { parar(); try { voz?.lector?.callar(); } catch { /* nada */ } };
  let actual = null; // { x, atras }
  const tocaFila = el('div', { class: 'rf-voz-toca-fila', 'aria-live': 'polite' });
  const cuentaVoz = el('p', { class: 'rf-voz-cuenta', role: 'status', hidden: true });
  // Lee; al terminar, «despues». Si no pudo sonar (el iPhone sin un toque), «Toca para escuchar» en vez de callarse.
  const hablar = (piezas, despues = null) => {
    if (!vozSi || !voz?.lector || !zona.isConnected) return;
    const mio = gen;
    tocaFila.replaceChildren();
    if (!piezas.length) { despues?.(); return; }
    Promise.resolve(voz.lector.leer(piezas)).then(ok => {
      if (mio !== gen || !vozSi || !zona.isConnected) return;
      if (ok === false) {
        tocaFila.replaceChildren(el('button', { type: 'button', class: 'secundario chico con-icono rf-voz-toca', onclick: () => hablar(piezas, despues) },
          icono('altavoz', 'icono chico'), el('span', { texto: t('rf.voz.toca') })));
        return;
      }
      despues?.();
    }, () => {});
  };
  const sinRespuesta = () => t('rf.oral.sin_respuesta');
  // El paso de voz de lo que está en pantalla (el frente o la respuesta), con «Manos libres» si está encendido.
  const leerFrente = x => hablar(piezasPregunta(x), libres ? () => cuentaAtras(x) : null);
  const leerAtras = x => hablar(piezasRespuesta(x, idiomaVisto(), x.respuesta_en || x.respuesta_es ? '' : sinRespuesta()),
    libres ? () => esperar(PAUSA_SIGUIENTE, () => { if (zona.isConnected) siguiente(); }) : null);
  const cuentaAtras = x => {
    let n = PAUSA_PENSAR;
    const tic = () => {
      if (!zona.isConnected) return;
      if (n <= 0) { cuentaVoz.hidden = true; pintarAtras(x, { sonido: false }); return; }
      cuentaVoz.hidden = false;
      cuentaVoz.textContent = t('rf.voz.cuenta', { n: numero(n) });
      n -= 1;
      esperar(1000, tic);
    };
    tic();
  };
  const leerActual = () => { if (actual) (actual.atras ? leerAtras : leerFrente)(actual.x); };
  const segmento = (grupo, opciones, valor, alElegir, clase) => {
    const botones = opciones.map(([id, texto, ic]) => el('button', { type: 'button', class: 'rf-voz-boton con-icono', 'data-valor': id, 'aria-pressed': String(id === valor),
      onclick: () => { for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.valor === id)); alElegir(id); } },
    ic ? icono(ic, 'icono chico') : null, el('span', { texto }))).filter(Boolean);
    return { nodo: el('div', { class: `rf-voz-seg ${clase}`, role: 'group', 'aria-label': grupo }, botones), botones };
  };
  const lineaModo = el('p', { class: 'rf-voz-linea suave chica' });
  const otraVez = el('button', { type: 'button', class: 'secundario chico con-icono boton-escuchar rf-voz-otra', onclick: () => { parar(); leerActual(); } },
    icono('actualizar', 'icono chico'), el('span', { texto: t('rf.voz.otra_vez') }));
  const modo = segmento(t('rf.voz.modo.grupo'), [['tu', t('rf.voz.tu')], ['libres', t('rf.voz.libres')]], 'tu', id => {
    libres = id === 'libres';
    pintarModo();
    if (!actual) return;
    if (libres) {
      // Encendido con un toque: si la tarjeta ya mostró la respuesta, se lee y sigue sola; si no, desde la pregunta.
      callar();
      pintarPie(actual.x, actual.atras);
      leerActual();
    } else {
      // Apagado: se acaba la vuelta sola, ya (se calla y nada más sigue solo).
      callar();
      pintarPie(actual.x, actual.atras);
    }
  }, 'rf-voz-modo');
  const interruptor = segmento(t('rf.voz.grupo'), [['si', t('lectura.con_voz'), 'altavoz'], ['no', t('lectura.sin_voz'), 'silencio']], vozSi ? 'si' : 'no', id => cambiarVoz(id === 'si'), 'rf-voz-si');
  const pintarModo = () => {
    modo.nodo.hidden = !vozSi;
    lineaModo.hidden = !vozSi;
    otraVez.hidden = !vozSi;
    lineaModo.textContent = libres ? t('rf.voz.libres.linea') : t('rf.voz.tu.linea');
    for (const b of interruptor.botones) b.setAttribute('aria-pressed', String((b.dataset.valor === 'si') === vozSi));
    for (const b of modo.botones) b.setAttribute('aria-pressed', String((b.dataset.valor === 'libres') === libres));
  };
  const cambiarVoz = si => {
    if (si === vozSi) return;
    vozSi = si;
    // Lo que suena (o se calla) pasa AHORA, dentro del toque (el iPhone solo deja sonar dentro de un toque); la
    // preferencia se guarda después.
    callar();
    if (actual) pintarPie(actual.x, actual.atras);
    if (si) leerActual();
    pintarModo();
    Promise.resolve(voz?.poner?.(si)).then(r => {
      if (r && r.ok === false) {
        vozSi = !si;
        if (!vozSi) callar();
        pintarModo();
        avisar(textoError(r.datos?.error), 'mal');
      }
    }, () => {});
  };
  const barraVoz = voz ? el('section', { class: 'rf-voz', 'aria-label': t('rf.voz.grupo') },
    el('div', { class: 'rf-voz-fila' }, interruptor.nodo, otraVez),
    el('div', { class: 'rf-voz-fila' }, ...[modo.nodo, h.ayudaVozOral?.() ?? null].filter(Boolean)),
    lineaModo,
    tocaFila) : null;
  pintarModo();

  // Al salir de la pantalla, se calla y nada más sigue.
  const salir = () => {
    callar();
    globalThis.window?.removeEventListener?.('hashchange', salir);
    globalThis.window?.removeEventListener?.('pagehide', salir);
  };
  globalThis.window?.addEventListener?.('hashchange', salir);
  globalThis.window?.addEventListener?.('pagehide', salir);

  const raiz = marcoEstudio({ clase: 'leccion-tarjetas repaso-final-oral', barra: barra.nodo, cuenta, cuerpo: [barraVoz, zona].filter(Boolean), pie, salir: RUTA });
  let cola = mazoOral(tarjetas, marcas);
  const avance = () => {
    const sabidas = tarjetas.filter(x => marcas[x.id] === 1).length;
    barra.poner(sabidas, tarjetas.length);
    cuenta.textContent = t('rf.oral.cuenta', { n: numero(sabidas), total: numero(tarjetas.length) });
  };
  const pagina = x => t('oral.pagina', { libro: x.libro ?? t('oral.libro'), pagina: x.pagina });
  let marcando = false;
  const marcar = async (x, sabia, botones) => {
    if (marcando) return;
    marcando = true;
    // Lo que «Manos libres» iba a hacer (la cuenta, pasar sola) se cancela YA: si no, saltaría dos tarjetas.
    callar();
    for (const b of botones) b.disabled = true;
    const r = await api('POST', '/api/academia/repaso-final/oral/marcar', { tarjeta: x.id, sabia });
    marcando = false;
    if (!zona.isConnected) return;
    if (!r.ok) { for (const b of botones) b.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
    marcas[x.id] = sabia ? 1 : 0;
    sonar(sabia ? 'bien' : 'toque');
    if (!sabia) cola.push(x);
    siguiente();
  };
  const botonesSabia = x => {
    const botones = [];
    botones.push(el('button', { type: 'button', class: 'boton-3d grande rojo', onclick: () => marcar(x, false, botones) }, el('span', { texto: t('rf.oral.no_sabia') })));
    botones.push(el('button', { type: 'button', class: 'boton-3d grande verde', onclick: () => marcar(x, true, botones) }, el('span', { texto: t('rf.oral.sabia') })));
    return el('div', { class: 'rf-sabia' }, botones);
  };
  // El pie: atrás, «La sabía / No la sabía»; adelante, «Ver respuesta» (con «Manos libres», también las dos: se puede
  // marcar en cualquier momento).
  const pintarPie = (x, atras) => {
    pie.classList.toggle('apilados', !atras && vozSi && libres);
    if (atras) return pie.replaceChildren(cuentaVoz, botonesSabia(x));
    const ver = botonGrande(t('rf.oral.ver'), () => pintarAtras(x), { tono: 'azul' });
    pie.replaceChildren(...[cuentaVoz, ver, vozSi && libres ? botonesSabia(x) : null].filter(Boolean));
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
    parar();
    dibujo?.destruir?.();
    dibujo = null;
    avance();
    actual = { x, atras: false };
    zona.replaceChildren(el('article', { class: 'tarjeta-leccion oral-libro rf-tarjeta' }, ...frente(x),
      el('p', { class: 'suave chica con-icono' }, icono('microfono', 'icono chico'), el('span', { texto: t('rf.oral.piensa') }))));
    pintarPie(x, false);
    leerFrente(x);
  };
  const pintarAtras = (x, { sonido = true } = {}) => {
    parar();
    if (sonido) sonar('toque');
    actual = { x, atras: true };
    dibujo = x.visual && vistaVisual ? vistaVisual(x.visual) : null;
    zona.replaceChildren(el('article', { class: 'tarjeta-leccion oral-libro rf-tarjeta' }, ...frente(x),
      el('section', { class: 'oral-qa rf-oral-respuesta' },
        x.respuesta_en ? [rotulo(h, Boolean(x.respuesta_es), t('oral.respuesta_es'), t('oral.respuesta_libro')), bilingue(h, 'p', x.respuesta_es, x.respuesta_en, 'oral-qa-respuesta')]
          : [el('p', { class: 'oral-qa-etiqueta', texto: t('oral.respuesta_libro') }), el('p', { class: 'suave', texto: t('rf.oral.sin_respuesta') })]),
      el('p', { class: 'oral-pagina con-icono-chico' }, icono('libro', 'icono chico'), el('span', { texto: pagina(x) })),
      dibujo?.nodo ?? null,
      x.explicacion_es ? el('aside', { class: 'caja-ejemplo oral-es' }, el('p', { class: 'caja-ejemplo-titulo', texto: t('oral.explicacion') }), talCual('p', x.explicacion_es)) : null));
    pintarPie(x, true);
    leerAtras(x);
  };
  const siguiente = () => {
    const x = cola.shift();
    window.scrollTo(0, 0);
    if (x) return pintar(x);
    callar();
    actual = null;
    dibujo?.destruir?.();
    dibujo = null;
    avance();
    cuenta.textContent = '';
    // Con «Manos libres» pudo pasar tarjetas sin marcarlas: entonces no dice «¡Te las sabes todas!».
    const faltan = mazoOral(tarjetas, marcas).length;
    zona.replaceChildren(el('section', { class: `resultado-vuelo ${faltan ? 'sigue' : 'bien'}`, 'data-foco': true },
      el('span', { class: 'portada-icono', 'aria-hidden': 'true' }, icono('trofeo')),
      el('h1', { class: 'titulo-grande', texto: faltan ? t('rf.oral.fin.vuelta') : t('rf.oral.fin') }),
      el('p', { class: 'bajada', texto: faltan ? (tn ?? t)('rf.oral.fin.faltan', { n: numero(faltan) }) : t('rf.oral.fin.linea', { total: numero(tarjetas.length) }) })));
    pie.classList.add('apilados');
    pie.replaceChildren(...[
      faltan ? el('button', { type: 'button', class: 'boton-3d grande naranja rf-oral-faltan', onclick: () => {
        cola = mazoOral(tarjetas, marcas);
        pie.classList.remove('apilados');
        siguiente();
      } }, el('span', { texto: t('rf.oral.fin.seguir') })) : null,
      el('button', { type: 'button', class: `boton-3d grande ${faltan ? 'blanco' : 'naranja'}`, onclick: async e => {
        const boton = e.currentTarget;
        boton.disabled = true;
        const r = await api('POST', '/api/academia/repaso-final/oral/reiniciar', materia ? { materia } : {});
        if (!r.ok) { boton.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
        for (const x of tarjetas) delete marcas[x.id];
        cola = mazoOral(tarjetas, marcas);
        pie.classList.remove('apilados');
        siguiente();
      } }, el('span', { texto: t('rf.oral.de_nuevo') })),
      el('a', { class: 'boton-3d blanco', href: RUTA }, el('span', { texto: t('rf.volver') }))].filter(Boolean));
    if (!faltan) celebrar(zona);
  };
  mostrar(raiz);
  if (!tarjetas.length) {
    zona.replaceChildren(el('p', { class: 'suave', texto: t('rf.oral.vacio') }));
    pie.replaceChildren(el('a', { class: 'boton-3d blanco', href: RUTA }, el('span', { texto: t('rf.volver') })));
    return;
  }
  siguiente();
}
