// Academia 0.12.4: la «Vista de prueba de la IA» (solo el administrador; solo se carga en #ia-demo). Muestra las pantallas
// de verdad del alumno (Explícamelo, Profesor virtual, mini-clase IA, plan de hoy, consejo después del examen) con
// respuestas de DEMOSTRACIÓN escritas aquí (marcadas como tales), sobre una pregunta y los datos del propio
// administrador. No llama a la IA, no cobra minutos, no guarda nada. Todo texto con textContent.
export function pantallaIaDemo(d, h) {
  const { el, t, icono, talCual, mostrar, marco, instructorUi } = h;
  const tu = h.tutorUi?.();
  const ui = instructorUi();
  const demo = extra => ({ estado: 'lista', demo: true, terminos: [], ...extra });
  const q = d.pregunta;
  const salir = () => el('a', { class: 'boton-3d blanco chico', href: '#ia' }, el('span', { texto: t('demo.salir') }));
  const banner = el('aside', { class: 'banner-demo', role: 'note' },
    el('p', { class: 'con-icono fuerte' }, icono('ojo', 'icono chico'), el('span', { texto: t('demo.banner') })),
    el('p', { class: 'chica', texto: t('demo.banner_linea') }), salir());
  const seccion = (titulo, ...partes) => el('section', { class: 'panel demo-seccion' }, el('h2', { texto: titulo }), ...partes);

  const pregunta = el('article', { class: 'demo-pregunta' }, talCual('p', `${q.numero ? `${q.numero} · ` : ''}${q.enunciado}`, 'fuerte'),
    el('ul', {}, q.opciones.map(o => talCual('li', `${o.letra}. ${o.texto}${o.letra === q.correcta ? ' ✓' : ''}`))));
  const explica = ui.vistaExplicacion({
    instructor: { modo: 'ia' }, basica: d.basica,
    ia: demo({ explicacion: t('demo.r.explica', { correcta: q.correctaTexto }), porQueNo: d.basica.idea ? t('demo.r.por_que_no', { idea: d.basica.idea }) : '', recuerda: t('demo.r.recuerda', { correcta: q.correctaTexto }) }),
  });
  const respuestaChat = [t('demo.r.chat', { tema: d.tema }), q.numero ? t('instr.ia.cita', { n: q.numero, respuesta: q.correctaTexto }) : null].filter(Boolean).join('\n');
  const chat = el('div', { class: 'chat-lista' },
    el('div', { class: 'burbuja alumno' }, el('p', { texto: t('demo.r.chat_pregunta') })),
    el('div', { class: 'burbuja profesor' }, talCual('p', respuestaChat), el('p', { class: 'pregunta-control' }, el('strong', { texto: `${t('profesor.comprueba')} ` }), el('span', { texto: t('demo.r.chat_control') }))));
  const mini = ui.pintarMiniClase(demo({ concepto: t('demo.r.mini', { concepto: d.concepto }), ejemplo: t('demo.r.mini_ejemplo'), trampa: t('demo.r.mini_trampa'), recuerda: t('demo.r.recuerda', { correcta: q.correctaTexto }) }));
  const plan = ui.cajaIa(demo({}), [talCual('p', t('demo.r.plan_titulo'), 'fuerte'),
    d.acciones.length ? ui.pasosPlan(d.acciones.slice(0, 3).map((a, i) => ({ ...a, porque: t(`demo.r.plan_${i + 1}`) })), { botones: false }) : el('p', { class: 'suave', texto: t('demo.r.plan_vacio') })]);
  const consejo = ui.cajaIa(demo({}), [talCual('p', t('demo.r.consejo_titulo'), 'fuerte'), talCual('p', t('demo.r.consejo', { tema: d.tema })),
    el('ol', { class: 'instructor-pasos' }, [t('demo.r.consejo_1'), t('demo.r.consejo_2'), t('demo.r.consejo_3')].map(p => talCual('li', p)))]);

  // 0.12.7: «Preparado para ti» (lo que vería al abrir su próxima clase), con datos de demostración.
  const paraTi = ui.pintarParaTi({ ia: demo({
    intro: t('demo.r.para_ti_intro', { tema: d.tema }),
    tarjetas: (d.tarjetas ?? []).map(x => ({ ...x, porque: t('demo.r.para_ti_porque') })),
    analogias: [{ idea: d.basica.idea ?? '', analogia: t('demo.r.para_ti_analogia') }],
    plan: [t('demo.r.para_ti_1'), t('demo.r.para_ti_2'), t('demo.r.para_ti_3')],
  }) });
  // 0.12.9: el tutor del alumno (F–J, M, O, T, U) y la página de planes (X), con datos de DEMOSTRACIÓN.
  const temaDemo = { materia: d.materia ?? 'factores_humanos', tema: d.temaId ?? '', titulo: d.tema, numero: 1 };
  const tutorDemo = tu ? {
    ia: true,
    apertura: { fallaste: [d.concepto], tema: temaDemo, preguntasMateria: d.preguntasMateria ?? 0, prioridad: { concepto: d.concepto, n: 3 }, practicar: null, videos: [], buscar: null },
    novedades: [{ tipo: 'reforzamos', vars: { que: d.concepto }, href: '#ia-demo' }, { tipo: 'preparada', vars: { tema: d.tema }, href: '#ia-demo' }, { tipo: 'profundizamos', vars: { que: d.tarjetas?.[0]?.titulo ?? d.concepto }, href: '#ia-demo' }],
    examen: { oficial: { si: false, pct: 64, porques: [{ clave: 'acierto.no', vars: { valor: 64, meta: 90 } }, { clave: 'fallas.no', vars: { n: 2 } }] }, materia: { materia: temaDemo.materia, si: false, pct: 72, porques: [{ clave: 'acierto.no', vars: { valor: 72, meta: 90 } }, { clave: 'memoria.mal', vars: { mal: d.concepto } }] } },
    examenIa: { porque: t('demo.r.tutor_examen'), pasos: [t('demo.r.para_ti_1'), t('demo.r.para_ti_2'), t('demo.r.para_ti_3')] },
  } : null;
  const ahoraIso = new Date().toISOString();
  const partesTutor = tu ? [
    seccion(t('tutor.titulo'), el('p', { class: 'suave chica', texto: t('demo.tutor.linea') }), tu.pintarTarjeta(tutorDemo)),
    seccion(t('profesor.titulo'), el('div', { class: 'chat-lista' }, tu.pintarApertura(tutorDemo, () => {}))),
    seccion(t('tutor.j.pregunta'), el('p', { class: 'suave chica', texto: t('demo.tutor.j') }),
      tu.pintarTarjetaIa({ demo: true, terminos: [], tipo: 'mejor', explicacion: t('demo.r.mini', { concepto: d.concepto }), ejemplo: t('demo.r.mini_ejemplo'), recuerda: t('demo.r.recuerda', { correcta: q.correctaTexto }) }),
      tu.pintarTarjetaIa({ demo: true, terminos: [], tipo: 'profundizar', porQue: t('demo.r.tutor_profundo'), ejemplo: t('demo.r.mini_ejemplo'), trampa: t('demo.r.mini_trampa'), recuerda: t('demo.r.recuerda', { correcta: q.correctaTexto }) }),
      tu.paraElExamen({ respondidas: q.numero ? [{ numero: q.numero, enunciado: q.enunciado, respuesta: q.correctaTexto }] : [], otras: ['2', '3'], tema: d.tema }),
      tu.pintarBasica({ recuerda: d.basica.tarjeta?.recuerda ?? null, sencilla: d.basica.sencilla ? [d.basica.sencilla] : [], reexplicacion: [] })),
    // H: la pista después de un error en la práctica y «Ver en la clase».
    seccion(t('demo.tutor.h_titulo'), el('p', { class: 'suave chica', texto: t('demo.tutor.h') }),
      el('div', { class: 'tutor-pista' }, el('p', { class: 'con-icono' }, icono('bombilla', 'icono chico'), talCual('span', t('demo.r.recuerda', { correcta: q.correctaTexto })), tu.insigniaIa()),
        el('a', { class: 'enlace-fuerte chica', href: '#ia-demo', texto: t('tutor.h.ver_clase', { titulo: d.tarjetas?.[0]?.titulo ?? d.tema }) }))),
    seccion(t('tutor.o.titulo'), el('p', { class: 'suave chica', texto: t('tutor.o.linea') }),
      tu.pintarPersonalizadas({ clave: 'demo', preguntas: [{ i: 0, enunciado: t('demo.r.personal'), opciones: [q.correctaTexto, t('demo.r.personal_mala1'), t('demo.r.personal_mala2')], entrena: q.numero ?? '1' }] })),
    seccion(t('tutor.memoria.titulo'), tu.pintarMemoria([
      { tipo: 'tema', temaTitulo: d.tema, pct: 60, minutos: 12, mal: [d.concepto], bien: [], tgMal: [q.numero ?? '1'], conclusion: { clave: 'reforzar', vars: { mal: d.concepto, pct: 60 } }, en: ahoraIso },
      { tipo: 'clase', temaTitulo: d.tema, conclusion: { clave: 'clase', vars: { tema: d.tema } }, en: ahoraIso }])),
    tu.pintarExamen({ oficial: tutorDemo.examen.oficial, materias: [tutorDemo.examen.materia], examenIa: tutorDemo.examenIa }),
  ] : [];
  const planesDemo = h.vistaPlanes ? seccion(t('planes.titulo'), h.vistaPlanes({
    pagar: { planes: [{ id: 'estandar', nombre: 'IA Estándar', precioUsd: '12', precioRd: null, usos: 300 }, { id: 'plus', nombre: 'IA Plus', precioUsd: '20', precioRd: null, usos: 800 }], planDias: 30, pruebaDias: 5, pruebaUsosDia: 20 },
    tiempo: { prueba: { empezada: true, quedanDias: 3, porDia: 20 } },
  }, h)) : null;
  mostrar(marco('admin', banner,
    el('h1', { class: 'titulo-pantalla', texto: t('demo.vista.titulo') }),
    el('p', { class: 'suave', texto: t('demo.vista.linea') }),
    // 0.12.7: cómo ve el alumno su prueba gratis y su plan (con números de demostración).
    seccion(t('tiempo.titulo'), el('p', { class: 'suave chica', texto: t('demo.planes.linea') }),
      ui.medidorTiempo({ activo: true, modo: 'planes', fuente: 'prueba', puede: true, prueba: { empezada: true, quedanDias: 3, hoy: 2, porDia: 20 } }, { conBoton: false }),
      ui.medidorTiempo({ activo: true, modo: 'planes', fuente: 'plan', puede: true, plan: { nombre: 'IA Estándar', quedan: 240, dias: 2, renovar: true } }, { conBoton: false }),
      ui.medidorTiempo({ activo: true, modo: 'planes', fuente: null, puede: false, motivo: 'prueba_terminada' }, { conBoton: false })),
    seccion(t('para_ti.titulo'), el('p', { class: 'suave chica', texto: t('demo.para_ti.linea') }), paraTi),
    seccion(t('instr.explicar'), pregunta, explica),
    seccion(t('profesor.titulo'), chat),
    seccion(t('mini.ia_clase'), mini),
    seccion(t('instr.hoy.titulo'), plan),
    seccion(t('instr.examen.boton'), consejo),
    ...partesTutor, planesDemo,
    el('div', { class: 'botones' }, salir())));
}
