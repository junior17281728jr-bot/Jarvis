// Academia 0.12.2: «Mi repaso» (solo se carga en #mi-repaso y en su mini-clase). Todo lo de los errores vive aquí, aparte
// de la clase normal (el Camino no cambia):
//  - «Para repasar»: los puntos (conceptos) de un tema que falló más de 2 veces, con la razón en una línea, su avance y
//    «Repasar» (sus preguntas del Test Guide, tal cual). Si falló en el repaso, primero la mini-clase.
//  - «Tus errores»: cada pregunta que falló, por tema → punto, lo más nuevo primero; se practica cualquiera.
//  - La mini-clase de un punto: su tarjeta (con su clip o dibujo), la pregunta que falló con su explicación y, solo si
//    tiene instructor con IA de verdad, «Explícamelo de otra forma (IA)». Después, «Intentar otra vez».
// Todo con h.el (nunca texto como código); los textos, de public/i18n.

import { lineaRepasa, enlaceMiniClase as enlaceClase } from './progreso-vista.js';
// (la clave es c:<materia>/<tema>/<punto>, solo letras, números, _ y -: la dirección lleva lo de después de «c:»)

export function pantallaMiRepaso(d, h) {
  const { el, t, tn, numero, icono, talCual, mostrar, marco, volverAlCamino, nombreMateria, empezarIntento, sonar, vacio, insignia } = h;
  const mas = Math.max(1, (d.umbral ?? 3) - 1);
  const boton = (texto, datos, clase = 'boton-3d naranja chico') => el('button', { type: 'button', class: clase, onclick: e => { sonar?.('toque'); empezarIntento(datos, e.currentTarget); } }, el('span', { texto }));
  // Lo principal, corto: «Repasa: <punto> · Tema <n> <tema>»; debajo, por qué está aquí y cómo va.
  // 0.12.9 (S): primero lo que falla y más sale en el Test Guide; el primero dice por qué.
  const fila = (x, i) => el('li', { class: 'repaso-punto' },
    el('p', { class: 'antetitulo', texto: nombreMateria(x.materia) }),
    el('h3', { class: 'repaso-punto-titulo' }, talCual('span', lineaRepasa(x, t, numero))),
    i === 0 && x.peso > 1 ? el('p', { class: 'repaso-peso fuerte chica', texto: t('mirepaso.empieza', { n: numero(x.peso) }) }) : null,
    el('p', { class: 'chica', texto: t('mirepaso.porque', { n: numero(x.fallos), concepto: x.concepto }) }),
    x.peso > 1 ? el('p', { class: 'suave chica', texto: t('mirepaso.peso', { n: numero(x.peso) }) }) : null,
    el('p', { class: 'suave chica', texto: t('mirepaso.vas', { n: numero(x.aciertos), meta: numero(x.meta.aciertos) }) }),
    x.miniclase && x.clave ? el('p', { class: 'aviso chica con-icono' }, icono('bombilla', 'icono chico'), el('span', { texto: t('mirepaso.miniclase_primero') })) : null,
    el('div', { class: 'botones' },
      x.miniclase && x.clave ? el('a', { class: 'boton-3d naranja chico', href: enlaceClase(x.clave) }, el('span', { texto: t('mirepaso.ver_miniclase') })) : boton(t('mirepaso.repasar'), x.practicar),
      x.clave && !x.miniclase ? el('a', { class: 'boton-3d blanco chico', href: enlaceClase(x.clave) }, el('span', { texto: t('mirepaso.miniclase') })) : null));
  const paraRepasar = el('section', { class: 'panel repaso-para', 'aria-labelledby': 'repaso-para-titulo' },
    el('h2', { id: 'repaso-para-titulo', class: 'con-icono' }, icono('actualizar'), el('span', { texto: t('mirepaso.para_repasar') })),
    d.paraRepasar.length
      ? [el('p', { class: 'suave', texto: t('mirepaso.para_repasar.linea', { n: numero(mas) }) }), el('ul', { class: 'lista-repaso' }, d.paraRepasar.map(fila))]
      : el('p', { class: 'suave', texto: t('mirepaso.para_repasar.vacio', { n: numero(mas) }) }),
    d.superadas ? el('p', { class: 'suave chica', texto: t('mirepaso.historial', { n: numero(d.superadas) }) }) : null);
  const pregunta = q => el('li', { class: q.superada ? 'superada' : null },
    el('span', { class: 'q-numero' }, q.numero ? talCual('span', t('acad.pregunta_n', { n: q.numero })) : t('acad.origen.poh_corto')),
    q.superada ? insignia('bien', t('mirepaso.ya_bien')) : null,
    talCual('span', q.enunciado, 'debil-enunciado'),
    el('span', { class: 'suave chica', texto: tn('acad.fallos_de', { n: q.fallos, veces: q.veces }) }));
  const errores = el('section', { class: 'panel repaso-errores', 'aria-labelledby': 'repaso-errores-titulo' },
    el('h2', { id: 'repaso-errores-titulo', class: 'con-icono' }, icono('atencion'), el('span', { texto: t('mirepaso.tus_errores') })),
    d.errores.length ? [
      el('p', { class: 'suave', texto: t('mirepaso.tus_errores.linea') }),
      d.pendientes ? boton(t('mirepaso.practicar_todo'), { tipo: 'errores' }, 'boton-3d naranja con-icono') : null,
      ...d.errores.map(tm => el('div', { class: 'repaso-tema' },
        el('p', { class: 'antetitulo', texto: nombreMateria(tm.materia) }),
        el('h3', { texto: tm.temaNumero ? t('progreso.tema.n', { n: numero(tm.temaNumero), titulo: tm.temaTitulo }) : tm.temaTitulo }),
        el('ul', { class: 'lista-repaso' }, tm.conceptos.map(c => el('li', { class: 'repaso-concepto' },
          el('p', { class: 'fuerte' }, talCual('span', t('repasa.solo', { concepto: c.concepto })), c.enRepaso ? el('span', { class: 'insignia tono-atencion insignia-repaso', texto: t('mirepaso.en_repaso') }) : null),
          el('ul', { class: 'lista-debiles' }, c.preguntas.map(pregunta)),
          el('div', { class: 'botones' },
            boton(t('mirepaso.practicar'), { tipo: 'errores', concepto: c.clave }, 'boton-3d blanco chico'),
            el('a', { class: 'boton-3d blanco chico', href: enlaceClase(c.clave) }, el('span', { texto: t('mirepaso.miniclase') }))))))))]
      : vacio('bien', t('mirepaso.sin_errores')));
  mostrar(marco('inicio', volverAlCamino(),
    el('section', { class: 'mi-repaso' },
      el('h1', { class: 'titulo-grande', texto: t('mirepaso.titulo') }),
      el('p', { class: 'bajada', texto: t('mirepaso.linea') }),
      // 0.12.9 (O): las preguntas personalizadas cuentan aquí (nunca en el % del Test Guide).
      d.personal?.respondidas ? el('p', { class: 'chica con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('mirepaso.personal', { n: numero(d.personal.bien), de: numero(d.personal.respondidas) }) })) : null,
      paraRepasar, errores,
      // 0.13.1: lo del examen oral, aparte (sus errores por tema, para practicarlos otra vez).
      seccionOral(d.oral, h))));
}

function seccionOral(o, h) {
  const { el, t, tn, icono, talCual, nombreMateria } = h;
  if (!o) return null;
  return el('section', { class: 'panel repaso-oral', 'aria-labelledby': 'repaso-oral-titulo' },
    el('h2', { id: 'repaso-oral-titulo', class: 'con-icono' }, icono('manual'), el('span', { texto: t('oral.repaso.titulo') })),
    el('p', { class: 'oral-sello', texto: t('oral.sello') }),
    o.errores ? [
      el('p', { class: 'suave', texto: tn('oral.repaso.linea', { n: o.errores }) }),
      el('a', { class: 'boton-3d naranja con-icono', href: '#oral/practica/errores' }, icono('actualizar', 'icono chico'), el('span', { texto: t('oral.errores.boton') })),
      el('ul', { class: 'lista-repaso' }, o.temas.map(x => el('li', { class: 'repasa-fila' },
        el('span', {}, el('span', { class: 'antetitulo', texto: nombreMateria(x.materia) }), talCual('span', x.titulo, 'fuerte')),
        el('span', { class: 'suave chica', texto: tn('oral.repaso.errores', { n: x.errores }) }),
        el('a', { class: 'boton-3d blanco chico', href: `#oral/practica/${encodeURIComponent(x.materia)}/${encodeURIComponent(x.tema)}` }, el('span', { texto: t('oral.practicar') })))))]
      : el('p', { class: 'suave', texto: t('oral.repaso.vacio') }),
    el('p', { class: 'suave chica', texto: t('oral.repaso.nota') }));
}

export function pantallaMiniClase(d, h) {
  const { el, t, numero, icono, talCual, mostrar, marco, nombreMateria, empezarIntento, partirLeccion, vistaTarjeta, botonGrande, instructorUi } = h;
  const tarjetas = partirLeccion(d.secciones ?? []).map(p => vistaTarjeta(p, { materia: d.materia }).nodo);
  const masFacil = (d.masFacil ?? []).length ? el('section', { class: 'panel caja-sencilla reexplicacion' },
    el('h2', { class: 'con-icono' }, icono('chispa'), el('span', { texto: t('acad.mas_facil') })),
    partirLeccion(d.masFacil).map(p => vistaTarjeta(p, { materia: d.materia }).nodo)) : null;
  const q = d.pregunta;
  const linea = (etiqueta, texto) => (texto ? el('p', {}, el('strong', { texto: `${etiqueta} ` }), talCual('span', texto)) : null);
  const caja = q ? el('section', { class: 'panel mini-pregunta', 'aria-labelledby': 'mini-pregunta-titulo' },
    el('h2', { id: 'mini-pregunta-titulo', texto: t('mini.la_que_fallaste') }),
    talCual('p', `${q.numero ? `${q.numero} · ` : ''}${q.enunciado}`, 'fuerte'),
    q.elegida && q.correcta && q.elegida.letra !== q.correcta.letra ? linea(t('mini.elegiste'), `${q.elegida.letra}. ${q.elegida.texto}`) : null,
    q.correcta ? linea(t('mini.correcta'), `${q.correcta.letra}. ${q.correcta.texto}`) : null,
    linea(t('mini.por_que_no'), q.idea),
    linea(t('mini.sencilla'), q.sencilla),
    linea(t('mini.original'), q.explicacion),
    // Solo con instructor IA de verdad (minutos, permiso y clave): si no, no hay botón.
    d.ia && q.intento ? instructorUi().explicar(q.intento, { id: q.id }, { etiqueta: t('mini.ia') }) : null,
    // 0.12.4: la mini-clase entera, de otra forma, con IA (guardada para todos los que se equivocan igual).
    d.ia ? instructorUi().miniClaseIa(d.clave) : null) : null;
  mostrar(marco('inicio',
    el('a', { class: 'boton-texto con-icono', href: '#mi-repaso' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('mini.volver') })),
    el('section', { class: 'mi-repaso mini-clase' },
      el('span', { class: 'sello-refuerzo', texto: t('mini.sello') }),
      el('p', { class: 'antetitulo', texto: `${nombreMateria(d.materia)} · ${d.temaNumero ? t('progreso.tema.n', { n: numero(d.temaNumero), titulo: d.temaTitulo }) : d.temaTitulo}` }),
      el('h1', { class: 'titulo-grande' }, talCual('span', d.concepto)),
      el('p', { class: 'bajada', texto: d.ronda >= 2 ? t('mini.ronda') : t('mini.linea') }),
      tarjetas.length ? el('div', { class: 'mini-tarjetas' }, tarjetas) : el('p', { class: 'suave', texto: t('mini.sin_tarjeta') }),
      masFacil, caja,
      el('div', { class: 'mini-pie botones' },
        botonGrande(t('mini.otra_vez'), e => empezarIntento({ tipo: 'errores', concepto: d.clave }, e.currentTarget), { tono: 'naranja' }),
        d.enRepaso ? el('p', { class: 'suave chica', texto: t('mirepaso.vas', { n: numero(d.aciertos), meta: numero(d.meta) }) }) : null))));
}

// En el resultado de un intento: lo que pasó con «Mi repaso» (arriba de la revisión).
export function panelesRepaso(res, h) {
  const { el, t, numero, icono, talCual } = h;
  const lista = [];
  for (const x of res.nuevosEnRepaso ?? []) {
    lista.push(el('p', { class: 'aviso-repaso con-icono', role: 'note' }, icono('actualizar', 'icono chico'),
      el('span', { texto: t('mirepaso.entro', { n: numero(x.fallos), concepto: x.concepto, d: numero(x.dias) }) })));
  }
  const r = res.repaso;
  if (r) {
    const texto = r.superada ? t('repaso.res.superado', { concepto: r.concepto }) : r.falladas && r.enRepaso ? t('repaso.res.miniclase')
      : r.enRepaso ? t('repaso.res.vas', { n: numero(r.aciertos), meta: numero(r.meta), concepto: r.concepto }) : null;
    if (texto) lista.push(el('section', { class: `panel panel-repaso ${r.superada ? 'bien' : ''}`.trim() }, talCual('p', texto, 'fuerte')));
  } else if (res.animo && !(res.nuevosEnRepaso ?? []).length) {
    lista.push(el('p', { class: 'animo-linea con-icono', role: 'note' }, icono('chispa', 'icono chico'), el('span', { texto: t('animo.normal') }),
      el('a', { class: 'enlace-animo', href: '#mi-repaso', texto: ` ${t('animo.ir')}` })));
  }
  return lista;
}

// Los botones de abajo del resultado de un repaso de «Mi repaso»: la mini-clase si falló, o repasar otra vez.
export function botonesRepaso(res, h) {
  const { el, t, empezarIntento } = h;
  const r = res.repaso;
  if (!r) return null;
  if (r.falladas && r.enRepaso) return [el('a', { class: 'boton-3d grande naranja', href: enlaceClase(r.clave) }, el('span', { texto: t('mirepaso.ver_miniclase') }))];
  return [
    r.enRepaso ? el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: e => empezarIntento({ tipo: 'errores', concepto: r.clave }, e.currentTarget) }, el('span', { texto: t('repaso.res.otra') })) : null,
    el('a', { class: `boton-3d ${r.enRepaso ? 'blanco' : 'grande'}`, href: '#mi-repaso' }, el('span', { texto: t('mini.volver') })),
  ].filter(Boolean);
}
