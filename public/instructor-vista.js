// Academia 0.14.34: «Tu instructor» (#instructor; se carga solo al abrirlo, desde public/app.js). UN solo instructor para
// TODO: el Test Guide (Camino), el oral (con la práctica en vivo) y el repaso. Arriba, su tarjeta (lo que más te cuesta,
// lo que cambió desde el último día y qué hacer ahora: «Estudiar por mi cuenta» o «Guíame»); abajo, el chat del Profesor
// virtual (el mismo de #profesor). La tarjeta se vuelve a pedir al volver a la pantalla y cada ~30 s mientras se ve.
//  - Sin el instructor con IA (o sin su permiso): la tarjeta y sus botones, sin caja para escribir. «Guíame» usa las
//    tarjetas «Otra vez, más fácil» del tema y preguntas rápidas.
//  - Las preguntas rápidas (de «Guíame» y de «Repaso con tu instructor») son una práctica de verdad (POST
//    /api/academia/intentos con «cuantas»): quedan guardadas como práctica y el repaso queda al día con su lógica de siempre.
// Todo con h.el y textContent (nunca HTML, nunca estilos sueltos). Lo que llega del servidor no trae ids ni nombres.

export const REFRESCO_MS = 30_000;
export const PREGUNTAS_GUIA = 3;
export const PREGUNTAS_REPASO = 5;

// El texto de un cambio: «Hipoxia: 2/6 → 5/6 ✅ mejoraste» o «Sigues flojo en Espacio aéreo». Puro (se prueba sin navegador).
export function textoCambio(c, t) {
  if (c.tipo === 'sigue_flojo') return t('tuinstr.cambio.sigue_flojo', { tema: c.titulo });
  if (c.origen === 'vivo') return t(`tuinstr.cambio.${c.tipo}.vivo`, { tema: c.titulo, a: c.antes?.pct ?? 0, c: c.ahora?.pct ?? 0 });
  return t(`tuinstr.cambio.${c.tipo}.tg`, { tema: c.titulo, a: c.antes?.bien ?? 0, b: c.antes?.de ?? 0, c: c.ahora?.bien ?? 0, d: c.ahora?.de ?? 0 });
}
export function textoDebil(x, t) {
  if (x.origen === 'tg') return t('tuinstr.debil.tg', { tema: x.titulo, pct: x.pct });
  if (x.origen === 'vivo') return t('tuinstr.debil.vivo', { tema: x.titulo, pct: x.pct });
  return t('tuinstr.debil.oral', { tema: x.titulo });
}
const cuantasRepaso = n => Math.max(2, Math.min(PREGUNTAS_REPASO, Number(n) || 0));

export function crearVistaInstructor(h) {
  const { el, t, tn, icono, api, talCual, numero, avisar, textoError } = h;
  const ui = () => h.instructorUi();
  const lineasDe = lista => (lista ?? []).map(l => (Number(l.vars?.n) === 1 ? tn(l.clave, l.vars) : t(l.clave, l.vars ?? {})));

  // ---- Las preguntas rápidas en la conversación ----
  // zona: donde van (la lista del chat o la zona de la guía). pedido: { tipo: 'instructor', materia, tema } o { tipo: 'repaso' }.
  async function preguntasRapidas(zona, pedido) {
    const r = await api('POST', '/api/academia/intentos', pedido);
    if (!r.ok) {
      zona.append(burbuja(el('p', { texto: ['sin_preguntas', 'repaso_vacio', 'sin_errores'].includes(r.datos?.error) ? t('tuinstr.quiz.no') : textoError(r.datos?.error) })));
      return null;
    }
    const intento = r.datos;
    const preguntas = (intento.preguntas ?? []).filter(q => !q.falta && !q.respuesta);
    zona.append(burbuja(el('p', { texto: tn('tuinstr.quiz.intro', { n: preguntas.length }) })));
    let aciertos = 0;
    for (const [i, q] of preguntas.entries()) {
      // Una a la vez: la siguiente sale al tocar «Siguiente» (o sola, si acertó).
      const r2 = await unaPregunta(zona, intento.id, q, i + 1, preguntas.length);
      if (r2 == null) return null;
      if (r2) aciertos += 1;
    }
    const fin = await api('POST', `/api/academia/intentos/${encodeURIComponent(intento.id)}/terminar`, {});
    const total = fin.ok ? fin.datos.total : preguntas.length;
    const bien = fin.ok ? fin.datos.aciertos : aciertos;
    zona.append(burbuja(el('p', { class: 'fuerte', texto: t(pedido.tipo === 'repaso' ? 'tuinstr.quiz.fin_repaso' : 'tuinstr.quiz.fin', { n: numero(bien), total: numero(total) }) })));
    h.alTerminar?.();
    return { bien, total };
  }
  function unaPregunta(zona, intentoId, q, n, total) {
    return new Promise(resolver => {
      const salida = el('div', { class: 'tuinstr-salida', 'aria-live': 'polite' });
      const botones = (q.opciones ?? []).map(o => el('button', { type: 'button', class: 'boton-3d blanco chico tuinstr-opcion', onclick: () => elegir(o.letra) },
        el('strong', { texto: `${o.letra}. ` }), el('span', { texto: o.texto })));
      const nodo = burbuja(
        el('p', { class: 'suave chica', texto: t('tuinstr.quiz.n', { n: numero(n), total: numero(total) }) }),
        talCual('p', q.enunciado, 'fuerte'),
        el('div', { class: 'tuinstr-opciones' }, botones),
        salida);
      zona.append(nodo);
      nodo.scrollIntoView?.({ block: 'nearest' });
      async function elegir(letra) {
        for (const b of botones) b.disabled = true;
        const r = await api('POST', `/api/academia/intentos/${encodeURIComponent(intentoId)}/responder`, { pregunta: q.id, elegida: letra });
        if (!r.ok) { for (const b of botones) b.disabled = false; return avisar(textoError(r.datos?.error), 'mal'); }
        const x = r.datos.respuesta;
        const correcta = (q.opciones ?? []).find(o => o.letra === x.correcta);
        h.sonar?.(x.acierto ? 'bien' : 'mal');
        if (x.acierto) {
          salida.append(el('p', { class: 'tono-bien con-icono' }, icono('bien', 'icono chico'), el('span', { texto: t('tuinstr.quiz.bien') })));
          return resolver(true);
        }
        salida.append(el('p', { class: 'tono-mal con-icono' }, icono('mal', 'icono chico'), el('span', { texto: t('tuinstr.quiz.mal', { letra: x.correcta, texto: correcta?.texto ?? '' }) })),
          // «Explícamelo con otras palabras»: la explicación del instructor (con IA, dicha de otra forma; sin IA, la del Test Guide).
          ui().explicar(intentoId, q, { etiqueta: t('tuinstr.quiz.explicar') }),
          el('button', { type: 'button', class: 'boton-3d azul chico', onclick: e => { e.currentTarget.disabled = true; resolver(false); } }, el('span', { texto: t('tuinstr.quiz.siguiente') })));
      }
    });
  }
  const burbuja = (...partes) => el('div', { class: 'burbuja profesor tuinstr-burbuja' }, ...partes);
  const burbujaAlumno = texto => el('div', { class: 'burbuja alumno' }, talCual('p', texto));

  // ---- «Guíame» ----
  // chat: { mandar, lista } cuando hay chat con IA; si no, zona (la de la guía, debajo de la tarjeta).
  async function guiar(foco, { chat = null, zona, ia = false }) {
    const pedido = t('tuinstr.guia.pedido', { tema: foco.titulo });
    const lugar = chat?.lista ?? zona;
    if (chat && ia) {
      // La IA lo explica con OTRAS palabras que la clase (guia: true); después, las preguntas rápidas.
      await chat.mandar(pedido, { materia: foco.materia, tema: foco.tema, guia: true });
    } else {
      lugar.append(burbujaAlumno(pedido));
      const g = await api('GET', `/api/academia/instructor/guia/${encodeURIComponent(foco.materia)}/${encodeURIComponent(foco.tema)}`);
      if (!g.ok) { lugar.append(burbuja(el('p', { texto: textoError(g.datos?.error) }))); return; }
      lugar.append(burbuja(el('p', { class: 'fuerte', texto: t('tuinstr.guia.facil') }),
        (g.datos.facil ?? []).map(x => el('div', { class: 'tuinstr-facil' }, x.titulo ? el('h3', { texto: x.titulo }) : null, talCual('p', x.texto ?? '')))));
    }
    await preguntasRapidas(lugar, { tipo: 'instructor', materia: foco.materia, tema: foco.tema, cuantas: PREGUNTAS_GUIA });
  }
  async function repasoGuiado({ chat = null, zona, n }) {
    const lugar = chat?.lista ?? zona;
    lugar.append(burbujaAlumno(t('tuinstr.repaso.pedido')));
    await preguntasRapidas(lugar, { tipo: 'repaso', cuantas: cuantasRepaso(n) });
  }

  // ---- La tarjeta de arriba ----
  // acciones: { guiar(foco), repaso(n) } (null en la vista del administrador: solo leer).
  function tarjeta(d, acciones = null) {
    const charla = lineasDe(d.charla);
    const lineas = charla.length ? charla : lineasDe(d.lineas).slice(0, 2);
    const cambios = d.cambios ?? [];
    const debiles = d.debiles ?? [];
    const eleccion = d.foco && acciones ? (() => {
      const propios = el('div', { class: 'profe-botones', hidden: true }, ui().pintarProfe({ botones: [
        { tipo: 'clase', materia: d.foco.materia, tema: d.foco.tema, titulo: d.foco.titulo },
        { tipo: 'practicar', materia: d.foco.materia, tema: d.foco.tema, titulo: d.foco.titulo }] }));
      return el('div', { class: 'tuinstr-elige' },
        el('p', { class: 'fuerte', texto: t('tuinstr.elige', { tema: d.foco.titulo }) }),
        el('div', { class: 'tuinstr-elige-botones' },
          el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', 'aria-expanded': 'false', onclick: e => { propios.hidden = !propios.hidden; e.currentTarget.setAttribute('aria-expanded', String(!propios.hidden)); } },
            icono('libro', 'icono chico'), el('span', { texto: t('tuinstr.solo') })),
          el('button', { type: 'button', class: 'boton-3d naranja chico con-icono', onclick: async e => { const b = e.currentTarget; b.disabled = true; await acciones.guiar(d.foco); b.disabled = false; } },
            icono('cerebro', 'icono chico'), el('span', { texto: t('tuinstr.guiame') }))),
        propios);
    })() : null;
    const repaso = d.repaso?.n > 0 && acciones ? el('button', { type: 'button', class: 'boton-3d azul chico con-icono tuinstr-repaso', onclick: async e => { const b = e.currentTarget; b.disabled = true; await acciones.repaso(d.repaso.n); b.disabled = false; } },
      icono('calendario', 'icono chico'), el('span', { texto: tn('tuinstr.repaso', { n: numero(d.repaso.n) }) })) : null;
    const otros = (d.botones ?? []).filter(b => !(d.foco && b.materia === d.foco.materia && b.tema === d.foco.tema && ['clase', 'practicar'].includes(b.tipo)) && b.tipo !== 'repaso');
    return el('section', { class: 'panel tuinstr-tarjeta', 'aria-labelledby': 'tuinstr-tarjeta-titulo' },
      el('div', { class: 'tuinstr-cabeza' },
        el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('cerebro')),
        el('div', {}, el('h2', { id: 'tuinstr-tarjeta-titulo', texto: t(acciones ? 'tuinstr.dice' : 'tuinstr.admin.titulo') }), el('p', { class: 'suave chica', texto: t(acciones ? 'tuinstr.actualizado' : 'tuinstr.admin.nota') }))),
      lineas.length ? el('div', { class: 'tuinstr-charla' }, lineas.map(x => talCual('p', x))) : null,
      cambios.length ? el('div', { class: 'tuinstr-cambios' },
        el('p', { class: 'fuerte chica', texto: d.desdeDias > 1 ? t('tuinstr.desde_dias', { n: numero(d.desdeDias) }) : t('tuinstr.desde') }),
        el('ul', { class: 'lista-simple' }, cambios.map(c => el('li', { class: `tuinstr-cambio cambio-${c.tipo}`, texto: textoCambio(c, t) })))) : null,
      el('div', { class: 'tuinstr-debiles' },
        el('p', { class: 'fuerte chica', texto: t('tuinstr.debiles') }),
        debiles.length ? el('ul', { class: 'lista-simple' }, debiles.map(x => el('li', { texto: textoDebil(x, t) }))) : el('p', { class: 'suave', texto: t('tuinstr.nada') })),
      d.vivo ? el('p', { class: 'chica con-icono' }, icono('microfono', 'icono chico'), el('span', { texto: `${t('tuinstr.vivo', { u: numero(d.vivo.ultima ?? 0), m: numero(d.vivo.mejor ?? 0) })}${d.vivo.listo ? ` · ${t('tuinstr.listo_real')}` : ''}` })) : null,
      d.repasoFinal?.tg?.total ? el('p', { class: 'chica con-icono' }, icono('trofeo', 'icono chico'), el('span', { texto: t('tuinstr.rf', { f: numero(d.repasoFinal.tg.falladas), total: numero(d.repasoFinal.tg.total) }) })) : null,
      eleccion,
      repaso,
      acciones && otros.length ? ui().pintarProfe({ botones: otros }) : null);
  }

  // ---- La pantalla ----
  // r: GET /api/academia/instructor/resumen; prof: GET /api/academia/profesor (los pide public/app.js).
  function pantalla(r, prof) {
    if (!r.ok) return h.mostrar(h.marco('instructor', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos?.error) }))));
    h.anotarAlgo?.(r.datos.algo === true);
    const lugarTarjeta = el('div', { class: 'tuinstr-lugar' });
    const zona = el('div', { class: 'tuinstr-guia chat-lista', 'aria-live': 'polite' });
    let chat = null;
    let datos = r.datos;
    const acciones = {
      guiar: foco => guiar(foco, { chat, zona, ia: datos.chat && datos.ia }),
      repaso: n => repasoGuiado({ chat, zona, n }),
    };
    const pintar = () => lugarTarjeta.replaceChildren(datos.hay ? tarjeta(datos, acciones) : el('p', { class: 'suave', texto: t('profe.sin_datos') }));
    pintar();
    // Al día: al volver a la pantalla, cada ~30 s mientras se ve y después de las preguntas rápidas.
    const refrescar = async () => {
      if (!lugarTarjeta.isConnected || globalThis.document?.visibilityState === 'hidden') return;
      const x = await api('GET', '/api/academia/instructor/resumen', undefined, { fresco: true });
      if (!x.ok || !lugarTarjeta.isConnected) return;
      datos = x.datos;
      h.anotarAlgo?.(datos.algo === true);
      pintar();
    };
    h.alTerminar = () => { setTimeout(refrescar, 300); };
    const programar = h.programar ?? setInterval;
    const parar = h.parar ?? clearInterval;
    const alVolver = () => { if (globalThis.document?.visibilityState === 'visible') refrescar(); };
    const reloj = programar(() => { if (!lugarTarjeta.isConnected) { parar(reloj); globalThis.document?.removeEventListener('visibilitychange', alVolver); return; } refrescar(); }, REFRESCO_MS);
    globalThis.document?.addEventListener('visibilitychange', alVolver);
    const cabeza = el('header', { class: 'tuinstr-titulo' },
      el('h1', { class: 'titulo-grande con-icono' }, icono('cerebro'), el('span', { texto: t('tuinstr.titulo') })),
      el('p', { class: 'bajada', texto: t('tuinstr.linea') }));
    // Con chat (IA y su permiso; el administrador siempre tiene permiso): el chat de siempre, con la tarjeta arriba.
    if (datos.chat && prof.ok && prof.datos.permiso?.permitido) {
      prof.datos.historial = ui().historialParaChat(prof.datos.historial);
      return h.pagosUi().pantallaProfesor(prof, { seccion: 'instructor', arriba: [cabeza, lugarTarjeta], alListo: c => { chat = c; } });
    }
    // Sin chat: la tarjeta, sus botones y la guía (sin caja para escribir).
    return h.mostrar(h.marco('instructor', cabeza, lugarTarjeta, zona,
      el('p', { class: 'suave chica con-icono tuinstr-sin-chat' }, icono('info', 'icono chico'), el('span', { texto: t('tuinstr.sin_chat') }))));
  }

  // ---- El administrador: lo que le recomienda a un alumno (solo leer) ----
  function resumenAdmin(id) {
    const lugar = el('div', { class: 'tuinstr-admin' });
    api('GET', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/instructor`).then(r => {
      lugar.replaceChildren(r.ok ? tarjeta(r.datos, null) : el('p', { class: 'mensaje error', texto: textoError(r.datos?.error) }));
    }).catch(() => {});
    return lugar;
  }

  // ---- «Recomendación de tu instructor» (arriba de Repaso) ----
  function recomendacionRepaso() {
    const lugar = el('div', { class: 'tuinstr-reco-lugar' });
    api('GET', '/api/academia/instructor/recomendacion').then(r => {
      if (!r.ok || !(r.datos.lineas ?? []).length) return;
      lugar.replaceChildren(el('section', { class: 'panel tuinstr-reco', 'aria-label': t('tuinstr.reco.titulo') },
        el('p', { class: 'fuerte chica con-icono' }, icono('cerebro', 'icono chico'), el('span', { texto: t('tuinstr.reco.titulo') })),
        lineasDe(r.datos.lineas).map(x => talCual('p', x)),
        (r.datos.botones ?? []).length ? ui().pintarProfe({ botones: r.datos.botones }) : null,
        el('a', { class: 'enlace-fuerte chica', href: '#instructor', texto: t('tuinstr.reco.hablar') })));
    }).catch(() => {});
    return lugar;
  }

  return Object.freeze({ pantalla, tarjeta, resumenAdmin, recomendacionRepaso, preguntasRapidas, guiar });
}
