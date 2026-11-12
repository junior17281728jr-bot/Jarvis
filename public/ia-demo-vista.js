// Academia 0.12.4: la «Vista de prueba de la IA» (solo el administrador; solo se carga en #ia-demo). Muestra las pantallas
// de verdad del alumno (Explícamelo, Profesor virtual, mini-clase IA, plan de hoy, consejo después del examen) con
// respuestas de DEMOSTRACIÓN escritas aquí (marcadas como tales), sobre una pregunta y los datos del propio
// administrador. No llama a la IA, no cobra minutos, no guarda nada. Todo texto con textContent.
export function pantallaIaDemo(d, h) {
  const { el, t, icono, talCual, mostrar, marco, instructorUi } = h;
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
    el('div', { class: 'botones' }, salir())));
}
