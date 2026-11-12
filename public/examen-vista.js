// Academia 0.9.2: el examen de materia como el de ENALAS (src/academia/examen.js). Solo se carga al hacer un examen.
//  - Reloj a la vista (cuenta atrás). Sale de los milisegundos que manda el servidor, contados con performance.now():
//    nunca con la hora del teléfono. Al volver a la pestaña (iPhone) se vuelve a pedir. Aviso a los 5 min y a 1 min;
//    en 0 se entrega solo (las sin responder cuentan como malas).
//  - No se ve si acertó hasta entregar. Se puede cambiar la respuesta, marcar «revisar después» y saltar a cualquier
//    pregunta con la rejilla. Antes de entregar, cuántas quedan sin responder y cuántas marcadas.
//  - Se anotan los segundos en cada pregunta (se mandan al elegir y al salir de ella).
//  - El resultado: la nota, el tiempo usado, el tiempo de cada pregunta y la revisión completa.
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).

export const AVISOS_SEGUNDOS = Object.freeze([300, 60]);

export function relojTexto(ms) {
  const n = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = String(n % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
// Los avisos que tocan: solo los que caben en el examen (un examen de 4 min no avisa «quedan 5 min»).
export function avisosDe(limiteSegundos) {
  return AVISOS_SEGUNDOS.filter(s => limiteSegundos > s + 30);
}

export function examenConReloj(intento, h) {
  const { el, t, numero } = h;
  const preguntas = intento.preguntas;
  const respuestas = new Map(Object.entries(intento.examen.respuestas ?? {}));
  const marcadas = new Set(intento.examen.marcadas ?? []);
  let actual = Math.max(0, preguntas.findIndex(q => !respuestas.has(q.id)));
  let fin = performance.now() + (intento.examen.restanteMs ?? 0);
  let entregando = false;
  let enPregunta = performance.now();
  const avisos = new Set(avisosDe(intento.examen.limiteSegundos).filter(s => (intento.examen.restanteMs ?? 0) / 1000 > s));
  const sigue = () => h.vigente() && raiz.isConnected;

  // Guardar en orden (una cosa tras otra), sin bloquear la pantalla.
  let cola = Promise.resolve();
  const guardar = datos => {
    cola = cola.then(async () => {
      const r = await h.api('POST', `/api/academia/intentos/${intento.id}/examen`, datos);
      if (!r.ok && sigue()) {
        // Fuera de la cola: entregar espera a la cola, y esto corre dentro de ella.
        if (r.datos.error === 'tiempo_agotado' || r.datos.error === 'intento_terminado') { setTimeout(() => entregar({ solo: true }), 0); return; }
        h.avisar(h.textoError(r.datos.error), 'mal');
      }
      if (r.ok && Number.isFinite(r.datos.restanteMs)) fin = performance.now() + r.datos.restanteMs;
    }).catch(() => {});
    return cola;
  };
  // Los segundos en la pregunta que se está dejando (o donde se elige).
  const segundosAqui = () => {
    const ahora = performance.now();
    const s = Math.max(0, (ahora - enPregunta) / 1000);
    enPregunta = ahora;
    return Math.round(s * 10) / 10;
  };

  const reloj = el('span', { class: 'examen-reloj', role: 'timer', 'aria-live': 'off' }, h.icono('reloj', 'icono chico'), el('strong', { texto: '' }));
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta examen-zona' });
  const pie = el('div', { class: 'estudio-botones examen-pie' });
  const raiz = h.marcoEstudio({ clase: `practica-tg examen-con-reloj ${h.claseMateria(intento.materia)}`, barra: reloj, cuenta, cuerpo: zona, pie });

  const pintarCuenta = () => { cuenta.textContent = t('examen.respondidas', { n: numero(respuestas.size), total: numero(preguntas.length) }); };
  const tic = () => {
    if (!sigue()) return clearInterval(intervalo);
    const resta = fin - performance.now();
    reloj.lastChild.textContent = relojTexto(resta);
    reloj.classList.toggle('poco', resta <= 5 * 60 * 1000);
    reloj.classList.toggle('muy-poco', resta <= 60 * 1000);
    for (const s of [...avisos]) {
      if (resta <= s * 1000) {
        avisos.delete(s);
        h.avisar(t(s > 60 ? 'examen.aviso_min' : 'examen.aviso_seg', { n: numero(Math.round(s / 60)) }), 'mal');
        h.sonar('mal');
      }
    }
    if (resta <= 0 && !entregando) entregar({ solo: true });
  };
  const intervalo = setInterval(tic, 500);
  // Al volver a la pestaña: el tiempo de verdad lo dice el servidor.
  const alVolver = async () => {
    if (document.visibilityState !== 'visible' || !sigue()) return;
    const r = await h.api('GET', `/api/academia/intentos/${intento.id}`, undefined, { fresco: true });
    if (!sigue()) return;
    if (r.ok && r.datos.examen && !r.datos.terminado) fin = performance.now() + r.datos.examen.restanteMs;
    else if (r.ok && r.datos.terminado) entregar({ solo: true });
    tic();
  };
  document.addEventListener('visibilitychange', alVolver);
  const soltar = () => { clearInterval(intervalo); document.removeEventListener('visibilitychange', alVolver); };

  const rejilla = () => el('div', { class: 'examen-rejilla', role: 'group', 'aria-label': t('examen.todas') },
    preguntas.map((q, k) => el('button', {
      type: 'button',
      class: ['examen-celda', respuestas.has(q.id) ? 'respondida' : null, marcadas.has(q.id) ? 'marcada' : null, k === actual ? 'actual' : null].filter(Boolean).join(' '),
      'aria-current': k === actual ? 'true' : null,
      'aria-label': t('examen.celda', { n: numero(k + 1), estado: t(respuestas.has(q.id) ? 'examen.celda.respondida' : 'examen.celda.sin'), marca: marcadas.has(q.id) ? t('examen.celda.marcada') : '' }),
      onclick: () => ir(k),
    }, el('span', { texto: numero(k + 1) }), marcadas.has(q.id) ? h.icono('bandera', 'icono examen-celda-marca') : null)));

  const ir = k => {
    const q = preguntas[actual];
    const s = segundosAqui();
    if (q && s >= 1) guardar({ pregunta: q.id, segundos: s });
    actual = Math.max(0, Math.min(preguntas.length - 1, k));
    pintar();
    window.scrollTo(0, 0);
  };

  const pintar = () => {
    pintarCuenta();
    const q = preguntas[actual];
    const elegida = respuestas.get(q.id) ?? null;
    const botones = q.opciones.map(o => el('button', {
      type: 'button', class: 'opcion-carta', 'data-letra': o.letra, 'aria-pressed': String(o.letra === elegida),
      onclick: () => {
        respuestas.set(q.id, o.letra);
        for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === o.letra));
        guardar({ pregunta: q.id, elegida: o.letra, segundos: segundosAqui() });
        h.sonar('toque');
        pintarCuenta();
        abiertas.replaceChildren(rejilla());
        resumen.textContent = t('examen.todas_n', { n: numero(respuestas.size), total: numero(preguntas.length) });
      },
    }, el('span', { class: 'opcion-letra', texto: o.letra }), h.talCual('span', o.texto, 'opcion-texto')));
    const marcar = el('button', {
      type: 'button', class: 'examen-marcar con-icono', 'aria-pressed': String(marcadas.has(q.id)),
      onclick: () => {
        const si = !marcadas.has(q.id);
        if (si) marcadas.add(q.id); else marcadas.delete(q.id);
        marcar.setAttribute('aria-pressed', String(si));
        marcar.lastChild.textContent = t(si ? 'examen.marcada' : 'examen.marcar');
        guardar({ pregunta: q.id, marcada: si });
        abiertas.replaceChildren(rejilla());
      },
    }, h.icono('bandera', 'icono chico'), el('span', { texto: t(marcadas.has(q.id) ? 'examen.marcada' : 'examen.marcar') }));
    const resumen = el('span', { texto: t('examen.todas_n', { n: numero(respuestas.size), total: numero(preguntas.length) }) });
    const abiertas = el('div', {}, rejilla());
    const navegador = el('details', { class: 'examen-navegador', open: window.matchMedia?.('(min-width: 1024px)').matches || null },
      el('summary', { class: 'con-icono' }, h.icono('tarjetas', 'icono chico'), resumen),
      abiertas,
      el('p', { class: 'examen-leyenda suave chica' },
        el('span', { class: 'examen-celda respondida mini', 'aria-hidden': 'true' }), el('span', { texto: t('examen.celda.respondida') }),
        el('span', { class: 'examen-celda mini', 'aria-hidden': 'true' }), el('span', { texto: t('examen.celda.sin') }),
        el('span', { class: 'examen-celda marcada mini', 'aria-hidden': 'true' }), el('span', { texto: t('examen.celda.marcada') })));
    zona.replaceChildren(
      navegador,
      el('article', { class: 'tarjeta-pregunta' },
        el('div', { class: 'examen-cabeza' },
          el('p', { class: 'pregunta-de', texto: t('examen.pregunta_de', { n: numero(actual + 1), total: numero(preguntas.length) }) }),
          marcar),
        h.tarjetaPregunta(q),
        el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones)));
    const anterior = el('button', { type: 'button', class: 'boton-3d blanco', disabled: actual === 0, onclick: () => ir(actual - 1) }, el('span', { texto: t('examen.anterior') }));
    const siguiente = actual < preguntas.length - 1
      ? el('button', { type: 'button', class: 'boton-3d grande', onclick: () => ir(actual + 1) }, el('span', { texto: t('examen.siguiente') }))
      : el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: confirmar }, el('span', { texto: t('examen.entregar') }));
    const entregarYa = actual < preguntas.length - 1 ? el('button', { type: 'button', class: 'boton-texto examen-entregar-chico', onclick: confirmar }, el('span', { texto: t('examen.entregar') })) : null;
    pie.replaceChildren(el('div', { class: 'examen-nav' }, anterior, siguiente), entregarYa);
  };

  function confirmar() {
    const sin = preguntas.filter(q => !respuestas.has(q.id)).length;
    const marc = preguntas.filter(q => marcadas.has(q.id)).length;
    const cerrar = () => capa.remove();
    const primeraSin = preguntas.findIndex(q => !respuestas.has(q.id));
    const capa = el('div', { class: 'examen-confirmar', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'examen-confirmar-titulo' },
      el('section', { class: 'tarjeta' },
        el('h2', { id: 'examen-confirmar-titulo', texto: t('examen.confirmar.titulo') }),
        el('p', { texto: t('examen.confirmar.linea', { n: numero(respuestas.size), total: numero(preguntas.length) }) }),
        sin ? el('p', { class: 'aviso', texto: h.tn('examen.confirmar.sin', { n: sin }) }) : null,
        marc ? el('p', { class: 'suave', texto: h.tn('examen.confirmar.marcadas', { n: marc }) }) : null,
        el('p', { class: 'suave chica', texto: t('examen.confirmar.tiempo', { tiempo: relojTexto(fin - performance.now()) }) }),
        el('div', { class: 'botones' },
          el('button', { type: 'button', class: 'boton-3d blanco', onclick: () => { cerrar(); if (primeraSin >= 0) ir(primeraSin); } }, el('span', { texto: t(sin ? 'examen.confirmar.ir_sin' : 'examen.confirmar.seguir') })),
          el('button', { type: 'button', class: 'boton-3d naranja', onclick: () => { cerrar(); entregar({ solo: false }); } }, el('span', { texto: t('examen.entregar') })))));
    capa.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    document.body.append(capa);
    capa.querySelector('button').focus();
  }

  async function entregar({ solo }) {
    if (entregando) return;
    entregando = true;
    const q = preguntas[actual];
    const s = segundosAqui();
    if (q && s >= 1 && !solo) guardar({ pregunta: q.id, segundos: s });
    await cola;
    if (!sigue()) return soltar();
    zona.replaceChildren(el('p', { class: 'cargando', texto: t(solo ? 'examen.se_acabo' : 'examen.entregando') }));
    pie.replaceChildren();
    const r = await h.api('POST', `/api/academia/intentos/${intento.id}/terminar`, {});
    soltar();
    if (!sigue()) return;
    if (!r.ok) { entregando = false; return h.avisar(h.textoError(r.datos.error), 'mal'); }
    resultado(r.datos, { solo });
  }

  function resultado(res, { solo = false } = {}) {
    reloj.remove();
    cuenta.textContent = '';
    const ex = res.examen ?? {};
    const titulo = res.aprobado ? t('acad.examen_aprobado') : t('acad.no_aprobado');
    const tiempos = res.revision.map((q, k) => ({ q, k, s: q.segundos ?? 0 }));
    const maximo = Math.max(1, ...tiempos.map(x => x.s));
    zona.replaceChildren(...[
      el('section', { class: `resultado-vuelo ${res.aprobado ? 'bien' : 'falta'}`, 'data-foco': true },
        h.medidor(res.pct, { etiqueta: t('acad.resultado.nota') }),
        el('h1', { class: 'titulo-grande', texto: titulo }),
        el('p', { class: 'bajada', texto: t('acad.resultado.de', { n: numero(res.aciertos), total: numero(res.total) }) }),
        solo && ex.vencido ? el('p', { class: 'aviso', texto: t('examen.se_acabo_linea') }) : null,
        res.aprobado ? null : el('p', { class: 'resultado-necesitas', texto: t('acad.necesitas', { n: numero(res.umbral) }) }),
        el('ul', { class: 'examen-datos' },
          el('li', {}, h.icono('reloj', 'icono'), el('span', { texto: t('examen.tiempo_usado', { usado: relojTexto((ex.tiempoUsado ?? 0) * 1000), limite: relojTexto((ex.limiteSegundos ?? 0) * 1000) }) })),
          el('li', {}, h.icono('fila', 'icono'), el('span', { texto: t('examen.promedio', { s: numero(Math.round((ex.tiempoUsado ?? 0) / Math.max(1, res.total))) }) })),
          ex.sinResponder ? el('li', {}, h.icono('atencion', 'icono'), el('span', { texto: h.tn('examen.sin_responder', { n: ex.sinResponder }) })) : null)),
      el('section', { class: 'panel examen-tiempos', 'aria-labelledby': 'examen-tiempos-titulo' },
        el('h2', { id: 'examen-tiempos-titulo', class: 'con-icono' }, h.icono('reloj'), el('span', { texto: t('examen.tiempos') })),
        el('p', { class: 'suave chica', texto: t('examen.tiempos.linea') }),
        el('ol', { class: 'examen-tiempos-lista' }, tiempos.map(({ q, k, s }) => {
          const estado = q.respuesta?.sinResponder ? 'sin' : q.respuesta?.acierto ? 'bien' : 'mal';
          const barra = el('span', { class: 'examen-tiempo-barra' }, el('span', { class: `examen-tiempo-relleno ${estado}` }));
          barra.firstChild.style.width = `${Math.round((s * 100) / maximo)}%`;
          return el('li', { class: `examen-tiempo ${estado}` },
            el('span', { class: 'examen-tiempo-n', texto: numero(k + 1) }),
            el('span', { class: 'examen-tiempo-texto' },
              q.numero ? h.talCual('span', t('acad.pregunta_n', { n: q.numero }), 'examen-tiempo-numero') : null,
              el('span', { class: 'suave chica', texto: t(estado === 'sin' ? 'examen.celda.sin' : estado === 'bien' ? 'acad.correcto' : 'revision.fallada') })),
            barra,
            el('strong', { class: 'examen-tiempo-s', texto: relojTexto(s * 1000) }));
        })),
        el('p', { class: 'examen-tiempo-total' }, el('span', { texto: t('examen.total') }), el('strong', { texto: relojTexto((ex.tiempoUsado ?? 0) * 1000) }))),
      h.revisionCompleta(res)].filter(Boolean));
    const errores = res.falladas.length ? el('button', { type: 'button', class: 'boton-3d naranja con-icono',
      onclick: evento => h.empezarIntento({ tipo: 'errores', intento: res.id }, evento.currentTarget) }, h.icono('actualizar', 'icono chico'), el('span', { texto: h.tn('errores.practicar', { n: res.falladas.length }) })) : null;
    pie.classList.add('apilados');
    pie.replaceChildren(...[el('a', { class: 'boton-3d grande', href: '#inicio' }, el('span', { texto: t('acad.seguir') })), errores].filter(Boolean));
    if (res.aprobado) h.celebrar(zona);
    h.sonar(res.aprobado ? 'nivel' : 'mal');
    window.scrollTo(0, 0);
  }

  h.mostrar(raiz);
  if (intento.terminado) {
    // Ya entregado (o se acabó el tiempo mientras no estaba): el resultado.
    entregando = true;
    soltar();
    h.api('POST', `/api/academia/intentos/${intento.id}/terminar`, {}).then(r => { if (sigue() && r.ok) resultado(r.datos); });
    return;
  }
  pintar();
  tic();
}
