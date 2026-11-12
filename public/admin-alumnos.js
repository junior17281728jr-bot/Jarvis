// Academia (0.9.0): Administrador → Alumnos, más claro. Solo se carga en esas pantallas (los alumnos nunca bajan este
// archivo). Las piezas de dibujo (el, t, icono…) llegan de app.js en «h», así este módulo no importa nada (sin ciclos).
//  - La lista: cada alumno con su avatar, % y última actividad; se marcan 2 a 6 y «Comparar».
//  - La ficha de un alumno (#alumno/N/…), por pestañas: Resumen, Exámenes (cada intento → cada pregunta con lo que
//    eligió y la correcta), Por materia (nota de cada materia y tema: la mejor y la última), Puntos débiles y Actividad
//    (última entrada, última salida, cada sesión con su entrada y su salida).
//  - Comparar (#comparar/2,5): lado a lado, con barras.
// Todo texto se pone con textContent (h.el / h.talCual): nunca se interpreta como código.

export const PESTANAS_FICHA = Object.freeze(['resumen', 'examenes', 'materias', 'debiles', 'actividad']);
export const MAXIMO_COMPARAR = 6;
const TEXTO_PESTANA = { resumen: 'ficha.pestana.resumen', examenes: 'ficha.pestana.examenes', materias: 'ficha.pestana.materias', debiles: 'ficha.pestana.debiles', actividad: 'ficha.pestana.actividad' };
const ICONO_PESTANA = { resumen: 'grafica', examenes: 'libro', materias: 'bandera', debiles: 'atencion', actividad: 'reloj' };
const TEXTO_TIPO = { tema: 'ficha.tipo.tema', examen: 'ficha.tipo.examen', reto: 'ficha.tipo.reto', repaso: 'ficha.tipo.repaso', errores: 'ficha.tipo.errores' };
const TEXTO_ESTADO = { en_linea: 'ficha.sesion.en_linea', abierta: 'ficha.sesion.abierta', vencida: 'ficha.sesion.vencida', cerrada: 'ficha.sesion.cerrada' };
const TEXTO_MOTIVO = { salir: 'ficha.motivo.salir', cerrada: 'ficha.motivo.cerrada', bloqueo: 'ficha.motivo.bloqueo' };
const TEXTO_RITMO = { adelantado: 'ficha.ritmo.adelantado', a_tiempo: 'ficha.ritmo.a_tiempo', atrasado: 'ficha.ritmo.atrasado', terminado: 'ficha.ritmo.terminado' };
const TEXTO_PLAN = { un_mes: 'acad.plan.un_mes', dos_meses: 'acad.plan.dos_meses', repaso_15: 'acad.plan.repaso_15' };

// ---------- Piezas ----------
const nombreDe = a => a.nombreVisible || a.nombre;
function horas(h, minutos) {
  if (minutos == null) return '—';
  if (minutos < 60) return h.t('ficha.min', { n: h.numero(minutos) });
  return h.t('ficha.horas', { h: h.numero(Math.floor(minutos / 60)), min: h.numero(minutos % 60) });
}
function barra(h, pct, tono = '') {
  return h.el('span', { class: `ficha-barra ${tono}`.trim() }, h.barraLlena(pct ?? 0));
}
function tonoNota(pct) {
  if (pct == null) return 'apagado';
  return pct >= 90 ? 'bien' : pct >= 70 ? 'info' : 'mal';
}
function cifra(h, nombreIcono, valor, texto, extra = null) {
  return h.el('div', { class: 'ficha-cifra' },
    h.el('span', { class: 'ficha-cifra-icono', 'aria-hidden': 'true' }, h.icono(nombreIcono, 'icono')),
    h.el('strong', { class: 'ficha-cifra-valor', texto: valor }),
    h.el('span', { class: 'ficha-cifra-texto', texto }),
    extra ? h.el('span', { class: 'suave chica', texto: extra }) : null);
}
export function nombreIntento(h, x) {
  const tipo = h.t(TEXTO_TIPO[x.tipo] ?? 'ficha.tipo.tema');
  const lugar = [x.materia ? h.nombreMateria(x.materia) : null, x.temaTitulo ? h.partirTitulo(x.temaTitulo).es : x.tema].filter(Boolean).join(' · ');
  return { tipo, lugar };
}
function cabezaAlumno(h, a, act) {
  return h.el('section', { class: 'tarjeta ficha-cabeza' },
    h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'grande' }),
    h.el('div', { class: 'ficha-cabeza-texto' },
      h.el('h1', { class: 'ficha-nombre con-icono' }, h.el('span', { class: `punto-linea${act?.enLinea ? ' en-linea' : ''}`, 'aria-hidden': 'true' }), h.el('span', { texto: nombreDe(a) })),
      h.el('p', { class: 'suave', texto: [`@${a.nombre}`, a.rol === 'admin' ? h.t('admin.rol.admin') : h.t('admin.rol.usuario'), a.activo ? null : h.t('admin.inactivo')].filter(Boolean).join(' · ') }),
      a.meta ? h.el('p', { class: 'ficha-meta con-icono-chico' }, h.icono('bandera', 'icono chico'), h.el('span', { texto: a.meta })) : null,
      h.el('p', { class: 'suave chica', texto: act?.enLinea ? h.t('acad.en_linea') : act?.ultimaActividad ? h.t('acad.ultima', { cuando: h.hace(act.ultimaActividad) }) : h.t('admin.nunca') })));
}

// ---------- La lista de alumnos (con «Comparar») ----------
export function vistaListaAlumnos(datos, h) {
  const { el, t, tn, numero } = h;
  const lista = datos.alumnos;
  const marcados = new Set();
  const enLinea = lista.filter(a => a.enLinea).length;
  const boton = el('a', { class: 'boton-enlace con-icono ficha-comparar-boton', href: '#alumnos', 'aria-disabled': 'true' }, h.icono('grafica', 'icono chico'), el('span', { texto: t('ficha.comparar.boton', { n: numero(0) }) }));
  const ayuda = el('p', { class: 'suave chica', role: 'status', texto: t('ficha.comparar.ayuda', { max: numero(MAXIMO_COMPARAR) }) });
  const pintarBoton = () => {
    const n = marcados.size;
    boton.lastChild.textContent = t('ficha.comparar.boton', { n: numero(n) });
    const listo = n >= 2 && n <= MAXIMO_COMPARAR;
    boton.setAttribute('aria-disabled', listo ? 'false' : 'true');
    boton.href = listo ? `#comparar/${[...marcados].join(',')}` : '#alumnos';
    ayuda.textContent = n > MAXIMO_COMPARAR ? t('ficha.comparar.demasiados', { max: numero(MAXIMO_COMPARAR) }) : t('ficha.comparar.ayuda', { max: numero(MAXIMO_COMPARAR) });
  };
  boton.addEventListener('click', e => { if (boton.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
  const fila = a => {
    const casilla = el('input', { type: 'checkbox', class: 'ficha-marcar', 'aria-label': t('ficha.comparar.marcar', { nombre: nombreDe(a) }) });
    casilla.addEventListener('change', () => { if (casilla.checked) marcados.add(a.id); else marcados.delete(a.id); pintarBoton(); });
    return el('div', { class: 'fila alumno ficha-fila' },
      el('label', { class: 'ficha-marcar-caja' }, casilla),
      el('a', { class: 'ficha-fila-enlace', href: `#alumno/${a.id}` },
        h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'medio' }),
        el('div', { class: 'ficha-fila-texto' },
          el('div', { class: 'alumno-cabeza' },
            el('span', { class: `punto-linea${a.enLinea ? ' en-linea' : ''}`, 'aria-hidden': 'true' }),
            el('span', { class: 'nombre', texto: nombreDe(a) }),
            a.rol === 'admin' ? el('span', { class: 'etiqueta', texto: t('admin.rol.admin') }) : null,
            el('span', { class: 'alumno-pct', texto: a.respuestas ? h.pctTexto(a.pct) : '—' })),
          el('p', { class: 'suave chica', texto: `@${a.nombre} · ${a.enLinea ? t('acad.en_linea') : a.ultimaActividad ? t('acad.ultima', { cuando: h.hace(a.ultimaActividad) }) : t('admin.nunca')}` }),
          el('div', { class: 'etiquetas' },
            h.insignia('bien', t('acad.bien', { n: numero(a.aciertos) })),
            h.insignia('mal', t('acad.mal', { n: numero(a.errores) })),
            h.insignia('info', t('acad.temas_de', { n: numero(a.temasAprobados), total: numero(a.temas) }))))));
  };
  return el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, h.icono('personas'), el('span', { texto: tn('acad.alumnos.n', { n: lista.length }) }), el('span', { class: 'insignia tono-bien', texto: tn('acad.alumnos.en_linea', { n: enLinea }) })),
    lista.length > 1 ? el('div', { class: 'ficha-comparar-barra' }, boton, ayuda) : null,
    lista.length ? h.verMas(el('div', { class: 'lista-usuarios' }), lista.map(fila), 12) : h.vacio('personas', t('admin.usuarios.solo_tu')));
}

// ---------- La ficha de un alumno ----------
export function vistaFicha(d, pestana, h) {
  const { el, t } = h;
  const a = d.alumno;
  const actual = PESTANAS_FICHA.includes(pestana) ? pestana : 'resumen';
  const fila = h.pestanas(PESTANAS_FICHA.map(id => ({ id, href: id === 'resumen' ? `#alumno/${a.id}` : `#alumno/${a.id}/${id}`, texto: t(TEXTO_PESTANA[id]), nombreIcono: ICONO_PESTANA[id] })), actual, t('ficha.pestanas'));
  const cuerpo = actual === 'examenes' ? pestanaExamenes(d, h) : actual === 'materias' ? pestanaMaterias(d, h)
    : actual === 'debiles' ? pestanaDebiles(d, h) : actual === 'actividad' ? pestanaActividad(d, h) : pestanaResumen(d, h);
  return [
    el('div', { class: 'ficha-arriba' },
      el('a', { class: 'volver con-icono', href: '#alumnos' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.alumnos.volver') }))),
    cabezaAlumno(h, a, d.actividad),
    fila,
    el('div', { class: 'ficha-cuerpo', 'data-pestana': actual }, cuerpo),
  ];
}

function pestanaResumen(d, h) {
  const { el, t, numero } = h;
  const r = d.resumen;
  const act = d.actividad;
  const plan = r.plan;
  return [
    el('section', { class: 'tarjeta ficha-resumen' },
      el('div', { class: 'ficha-resumen-medidor' }, h.medidor(r.preparacion.pct, { etiqueta: t('ficha.preparacion') }),
        el('p', { class: 'suave chica', texto: t('ficha.preparacion.linea', { bien: numero(r.preparacion.bien), total: numero(r.preparacion.total) }) })),
      el('div', { class: 'ficha-cifras' },
        cifra(h, 'trofeo', r.notaPromedio == null ? '—' : h.pctTexto(r.notaPromedio), t('ficha.nota_promedio'), t('ficha.nota_promedio.linea', { n: numero(r.calificados) })),
        cifra(h, 'bien', h.pctTexto(r.pctAcierto), t('ficha.acierto'), t('ficha.acierto.linea', { bien: numero(r.aciertos), n: numero(r.respuestas) })),
        cifra(h, 'libro', numero(r.intentos), t('ficha.intentos'), r.enCurso ? t('ficha.en_curso', { n: numero(r.enCurso) }) : null),
        cifra(h, 'medalla', numero(r.aprobados), t('ficha.aprobados'), t('ficha.reprobados', { n: numero(r.reprobados) })),
        cifra(h, 'bandera', t('acad.temas_de', { n: numero(r.temasAprobados), total: numero(r.temas) }), t('ficha.temas'), t('ficha.examenes_de', { n: numero(r.examenesAprobados), total: numero(r.examenes) })),
        cifra(h, 'tarjetas', numero(r.respuestas), t('ficha.respondidas'), t('ficha.distintas', { n: numero(r.preguntasDistintas) })),
        cifra(h, 'fuego', numero(r.racha), t('acad.racha'), r.estudioHoy ? t('ficha.estudio_hoy') : null),
        cifra(h, 'reloj', horas(h, r.minutosEstudio), t('ficha.tiempo'), t('ficha.tiempo.linea', { n: numero(r.diasEstudio) })))),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('calendario'), el('span', { texto: t('ficha.plan') })),
      plan ? [
        el('p', { texto: t(TEXTO_PLAN[plan.elegido] ?? 'acad.plan.un_mes') }),
        el('div', { class: 'ficha-linea-barra' }, barra(h, plan.pct), el('span', { texto: h.pctTexto(plan.pct) })),
        el('p', { class: 'suave', texto: t('ficha.plan.fin', { fin: h.fechaCortaDia(plan.fin), plan: h.fechaCortaDia(plan.finPlan) }) }),
        el('p', { class: 'etiquetas' }, h.insignia(plan.ritmo === 'atrasado' ? 'mal' : 'bien', t(TEXTO_RITMO[plan.ritmo] ?? 'ficha.ritmo.a_tiempo'))),
      ] : el('p', { class: 'suave', texto: t('ficha.plan.sin') })),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('reloj'), el('span', { texto: t('ficha.pestana.actividad') })),
      el('dl', { class: 'ficha-datos' },
        el('dt', { texto: t('ficha.ultima_entrada') }), el('dd', { texto: act.ultimaEntrada ? h.fecha(act.ultimaEntrada) : t('admin.nunca') }),
        el('dt', { texto: t('ficha.ultima_salida') }), el('dd', { texto: act.ultimaSalida ? h.fecha(act.ultimaSalida) : t('ficha.sin_salida') }),
        el('dt', { texto: t('ficha.ultima_actividad') }), el('dd', { texto: act.ultimaActividad ? h.fecha(act.ultimaActividad) : t('admin.nunca') })),
      el('a', { class: 'enlace-fuerte', href: `#alumno/${d.alumno.id}/actividad`, texto: t('ficha.ver_sesiones') })),
    ultimosIntentos(d, h),
  ];
}
function ultimosIntentos(d, h) {
  const lista = d.intentos.filter(x => x.terminadoSi).slice(0, 5);
  if (!lista.length) return null;
  return h.el('section', { class: 'tarjeta' },
    h.el('h2', { class: 'con-icono' }, h.icono('libro'), h.el('span', { texto: h.t('ficha.ultimos') })),
    h.el('ul', { class: 'ficha-intentos' }, lista.map(x => filaIntento(h, d.alumno.id, x))),
    h.el('a', { class: 'enlace-fuerte', href: `#alumno/${d.alumno.id}/examenes`, texto: h.t('ficha.ver_todos', { n: h.numero(d.intentosTotal ?? d.intentos.length) }) }));
}
function filaIntento(h, alumnoId, x) {
  const { el, t } = h;
  const { tipo, lugar } = nombreIntento(h, x);
  const nota = x.terminadoSi || x.respondidas ? h.pctTexto(x.pct) : '—';
  return el('li', {},
    el('a', { class: 'ficha-intento', href: `#alumno/${alumnoId}/intento/${x.id}` },
      el('span', { class: `ficha-nota tono-${x.terminadoSi ? tonoNota(x.pct) : 'apagado'}`, texto: nota }),
      el('span', { class: 'ficha-intento-texto' },
        el('strong', { texto: tipo }),
        lugar ? el('span', { class: 'ficha-intento-lugar', texto: lugar }) : null,
        el('span', { class: 'suave chica', texto: [h.fecha(x.terminado ?? x.empezado), t('ficha.de', { bien: h.numero(x.aciertos), total: h.numero(x.total) })].join(' · ') })),
      el('span', { class: 'ficha-intento-estado' },
        !x.terminadoSi ? h.insignia('apagado', t('ficha.sin_terminar'))
          : x.aprobado === true ? h.insignia('bien', t('ficha.aprobado'))
            : x.aprobado === false ? h.insignia('mal', t('ficha.no_aprobado')) : h.insignia('info', t('ficha.practica')),
        h.icono('flecha', 'icono chico'))));
}

function pestanaExamenes(d, h) {
  const { el, t } = h;
  if (!d.intentos.length) return el('section', { class: 'tarjeta' }, h.vacio('libro', t('ficha.intentos.vacio')));
  const tipos = ['todos', 'tema', 'examen', 'reto', 'repaso', 'errores'].filter(x => x === 'todos' || d.intentos.some(i => i.tipo === x));
  const lista = el('ul', { class: 'ficha-intentos' });
  let filtro = 'todos';
  const botones = tipos.map(x => el('button', { type: 'button', class: 'ficha-filtro', 'aria-pressed': String(x === filtro), texto: x === 'todos' ? t('ficha.filtro.todos') : t(TEXTO_TIPO[x]), onclick: () => { filtro = x; pintar(); } }));
  const pintar = () => {
    botones.forEach((b, k) => b.setAttribute('aria-pressed', String(tipos[k] === filtro)));
    const elegidos = d.intentos.filter(x => filtro === 'todos' || x.tipo === filtro);
    lista.replaceChildren(...elegidos.map(x => filaIntento(h, d.alumno.id, x)));
  };
  pintar();
  return el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: h.tn('ficha.intentos.n', { n: d.intentosTotal ?? d.intentos.length }) })),
    el('p', { class: 'suave', texto: t('ficha.intentos.linea') }),
    el('div', { class: 'ficha-filtros', role: 'group', 'aria-label': t('ficha.filtro') }, botones),
    lista);
}

function pestanaMaterias(d, h) {
  const { el, t, numero } = h;
  if (!d.materias.length) return el('section', { class: 'tarjeta' }, h.vacio('libro', t('ficha.materias.vacio')));
  const notaTexto = n => (n == null ? '—' : h.pctTexto(n));
  return d.materias.map(m => el('section', { class: `panel materia-progreso ficha-materia ${h.claseMateria(m.id)}` },
    el('div', { class: 'materia-cabeza' },
      el('span', { class: 'banner-icono chico', 'aria-hidden': 'true' }, h.icono(h.ICONO_MATERIA[m.id] ?? 'avion')),
      el('h2', { texto: h.nombreMateria(m.id) }), el('span', { class: 'materia-pct', texto: h.pctTexto(m.pct) })),
    el('div', { class: 'plan-barra' }, h.barraLlena(m.pct)),
    el('p', { class: 'suave chica', texto: t('ficha.materia.linea', { bien: numero(m.bien), mal: numero(m.mal), sin: numero(m.sinVer), acierto: h.pctTexto(m.pctRespuestas), n: numero(m.respuestas) }) }),
    el('div', { class: 'ficha-tabla-envoltura' },
      el('table', { class: 'ficha-tabla' },
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col', texto: t('ficha.col.tema') }), el('th', { scope: 'col', texto: t('ficha.col.mejor') }),
          el('th', { scope: 'col', texto: t('ficha.col.ultima') }), el('th', { scope: 'col', texto: t('ficha.col.veces') }))),
        el('tbody', {},
          m.temas.map(x => el('tr', { class: x.aprobado ? 'aprobado' : null },
            el('th', { scope: 'row' }, el('span', { texto: h.partirTitulo(x.titulo).es }), x.aprobado ? el('span', { class: 'ficha-sello', texto: t('ficha.aprobado') }) : null),
            el('td', { class: `tono-${tonoNota(x.mejor)}`, texto: notaTexto(x.mejor) }),
            el('td', { texto: notaTexto(x.ultima) }),
            el('td', { texto: numero(x.veces) }))),
          el('tr', { class: `ficha-fila-examen${m.examen.aprobado ? ' aprobado' : ''}` },
            el('th', { scope: 'row' }, el('span', { texto: t('ficha.examen_materia') }), m.examen.aprobado ? el('span', { class: 'ficha-sello', texto: t('ficha.aprobado') }) : null),
            el('td', { class: `tono-${tonoNota(m.examen.mejor)}`, texto: notaTexto(m.examen.mejor) }),
            el('td', { texto: notaTexto(m.examen.ultima) }),
            el('td', { texto: numero(m.examen.veces) })))))));
}

function pestanaDebiles(d, h) {
  // 0.10.0: además, sus fallas registradas (activas, en refuerzo y superadas) y su Profesor virtual.
  return [h.preparadoAlumno?.(d.alumno.id) ?? null, h.panelPuntosDebiles(d.puntosDebiles, { titulo: h.t('debil.panel_alumno') }), h.fallasAlumno?.(d.alumno.id) ?? null, h.profesorAlumno?.(d.alumno.id) ?? null];
}

function pestanaActividad(d, h) {
  const { el, t, numero } = h;
  const act = d.actividad;
  return [
    el('section', { class: 'tarjeta' },
      el('div', { class: 'ficha-cifras tres' },
        cifra(h, 'flecha', act.ultimaEntrada ? h.cuando(act.ultimaEntrada) : t('admin.nunca'), t('ficha.ultima_entrada')),
        cifra(h, 'salir', act.ultimaSalida ? h.cuando(act.ultimaSalida) : t('ficha.sin_salida'), t('ficha.ultima_salida')),
        cifra(h, 'reloj', act.ultimaActividad ? h.cuando(act.ultimaActividad) : t('admin.nunca'), t('ficha.ultima_actividad'), act.enLinea ? t('acad.en_linea') : null)),
      el('p', { class: 'suave chica', texto: h.tn('ficha.actividad.linea', { n: act.entradas, abiertas: numero(act.abiertas) }) })),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('reloj'), el('span', { texto: t('ficha.sesiones') })),
      el('p', { class: 'suave', texto: t('ficha.sesiones.linea') }),
      act.sesiones.length ? el('ol', { class: 'ficha-sesiones' }, act.sesiones.map(s => el('li', { class: `ficha-sesion estado-${s.estado}` },
        el('div', { class: 'ficha-sesion-cabeza' },
          h.insignia(s.estado === 'en_linea' ? 'bien' : s.estado === 'cerrada' ? 'apagado' : s.estado === 'vencida' ? 'atencion' : 'info', t(TEXTO_ESTADO[s.estado] ?? 'ficha.sesion.abierta')),
          s.equipo ? el('span', { class: 'suave chica', texto: s.equipo }) : null),
        el('dl', { class: 'ficha-datos' },
          el('dt', { texto: t('ficha.entro') }), el('dd', { texto: s.entrada ? h.fecha(s.entrada) : '—' }),
          el('dt', { texto: t('ficha.ultima_actividad') }), el('dd', { texto: s.ultimaActividad ? h.fecha(s.ultimaActividad) : '—' }),
          el('dt', { texto: t('ficha.salio') }), el('dd', { texto: s.salida ? `${h.fecha(s.salida)} · ${t(TEXTO_MOTIVO[s.motivo] ?? 'ficha.motivo.salir')}` : s.estado === 'vencida' ? t('ficha.salida.vencida') : t('ficha.salida.no') }))))) : h.vacio('reloj', t('ficha.sesiones.vacio'))),
  ];
}

// ---------- Un intento, pregunta por pregunta ----------
export function vistaIntento(v, h) {
  const { el, t, numero } = h;
  const { tipo, lugar } = nombreIntento(h, { ...v, temaTitulo: v.temaTitulo });
  const respondidas = v.preguntas.filter(q => q.respuesta);
  const malas = respondidas.filter(q => !q.respuesta.acierto).length;
  let soloMalas = false;
  const lista = el('ol', { class: 'ficha-preguntas' });
  const filtro = el('button', { type: 'button', class: 'ficha-filtro', 'aria-pressed': 'false', texto: t('ficha.solo_malas', { n: numero(malas) }), onclick: () => { soloMalas = !soloMalas; filtro.setAttribute('aria-pressed', String(soloMalas)); pintar(); } });
  const pregunta = (q, k) => {
    const r = q.respuesta;
    const estado = !r ? 'sin' : r.acierto ? 'bien' : 'mal';
    return el('li', { class: `ficha-pregunta estado-${estado}` },
      el('div', { class: 'ficha-pregunta-cabeza' },
        el('span', { class: 'ficha-pregunta-n', texto: numero(k + 1) }),
        h.insignia(estado === 'bien' ? 'bien' : estado === 'mal' ? 'mal' : 'apagado', t(estado === 'bien' ? 'ficha.p.bien' : estado === 'mal' ? 'ficha.p.mal' : 'ficha.p.sin'))),
      q.falta ? el('p', { class: 'aviso', texto: t('ficha.p.falta', { id: q.id }) }) : h.tarjetaPregunta(q),
      q.falta ? null : el('ul', { class: 'ficha-opciones' }, q.opciones.map(o => {
        const elegida = r && r.elegida === o.letra;
        const correcta = r ? r.correcta === o.letra : false;
        return el('li', { class: [correcta ? 'es-correcta' : null, elegida ? 'es-elegida' : null, elegida && !correcta ? 'es-mala' : null].filter(Boolean).join(' ') || null },
          el('span', { class: 'opcion-letra', texto: o.letra }), h.talCual('span', o.texto, 'opcion-texto'),
          el('span', { class: 'ficha-opcion-sellos' },
            elegida ? el('span', { class: 'ficha-sello elegida', texto: t('ficha.p.eligio') }) : null,
            correcta ? el('span', { class: 'ficha-sello correcta', texto: t('ficha.p.correcta') }) : null));
      })),
      r && r.sinContenido ? el('p', { class: 'suave', texto: t('ficha.p.eligio_letra', { letra: r.elegida }) }) : null,
      r && !r.acierto && r.idea ? el('p', { class: 'ficha-idea con-icono-chico' }, h.icono('atencion', 'icono chico'), h.talCual('span', r.idea)) : null,
      r && (r.explicacion || r.sencilla) ? el('details', { class: 'ficha-explicacion' },
        el('summary', { texto: t('ficha.p.explicacion') }),
        r.explicacion ? el('section', { class: 'caja-hoja caja-original' }, el('h3', { texto: q.origen === 'poh' ? t('acad.explicacion_poh') : t('acad.explicacion_original') }), h.talCual('p', r.explicacion)) : null,
        r.sencilla ? el('section', { class: 'caja-hoja caja-sencilla' }, el('h3', { texto: t('acad.explicacion_sencilla') }), h.talCual('p', r.sencilla)) : null) : null,
      q.respondidaEn ? el('p', { class: 'suave chica', texto: t('ficha.p.cuando', { cuando: h.fecha(q.respondidaEn) }) }) : null);
  };
  const pintar = () => lista.replaceChildren(...v.preguntas.map((q, k) => (soloMalas && !(q.respuesta && !q.respuesta.acierto) ? null : pregunta(q, k))).filter(Boolean));
  pintar();
  return [
    el('a', { class: 'volver con-icono', href: `#alumno/${v.alumno.id}/examenes` }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('ficha.volver_intentos', { nombre: nombreDe(v.alumno) }) })),
    el('section', { class: 'tarjeta ficha-intento-cabeza' },
      el('div', {},
        el('p', { class: 'suave chica', texto: nombreDe(v.alumno) }),
        el('h1', { class: 'ficha-nombre', texto: tipo }),
        lugar ? el('p', { texto: lugar }) : null,
        el('p', { class: 'suave chica', texto: [v.empezado ? t('ficha.empezo', { cuando: h.fecha(v.empezado) }) : null, v.terminadoEn ? t('ficha.termino', { cuando: h.fecha(v.terminadoEn) }) : t('ficha.sin_terminar')].filter(Boolean).join(' · ') })),
      el('div', { class: 'ficha-intento-nota' },
        el('strong', { class: `ficha-nota grande tono-${v.terminado ? tonoNota(v.pct) : 'apagado'}`, texto: h.pctTexto(v.pct) }),
        el('span', { class: 'suave chica', texto: t('ficha.de', { bien: numero(v.aciertos), total: numero(v.total) }) }),
        v.aprobado === true ? h.insignia('bien', t('ficha.aprobado')) : v.aprobado === false ? h.insignia('mal', t('ficha.no_aprobado', { umbral: numero(v.umbral ?? 90) })) : h.insignia('info', t('ficha.practica')))),
    el('section', { class: 'tarjeta' },
      el('div', { class: 'ficha-filtros' }, filtro, el('span', { class: 'suave chica', texto: t('ficha.p.resumen', { n: numero(respondidas.length), total: numero(v.total), mal: numero(malas) }) })),
      lista),
  ];
}

// ---------- Comparar ----------
export function vistaComparar(datos, h) {
  const { el, t, numero } = h;
  const lista = datos.alumnos;
  const filasCifra = [
    { clave: 'ficha.preparacion', valor: a => a.preparacion, pct: true },
    { clave: 'ficha.acierto', valor: a => a.pctAcierto, pct: true },
    { clave: 'ficha.nota_promedio', valor: a => a.notaPromedio, pct: true },
    { clave: 'ficha.examenes', valor: a => a.examenesAprobados, maximo: a => a.examenes, frase: 'ficha.examenes_de' },
    { clave: 'ficha.temas', valor: a => a.temasAprobados, maximo: a => a.temas, frase: 'acad.temas_de' },
    { clave: 'ficha.intentos', valor: a => a.intentos },
    { clave: 'ficha.respondidas', valor: a => a.respuestas },
    { clave: 'acad.racha', valor: a => a.racha },
    { clave: 'ficha.tiempo', valor: a => a.minutosEstudio, texto: a => horas(h, a.minutosEstudio) },
  ];
  // Cada cifra: una barra por alumno (el mejor de la fila resaltado).
  const bloque = f => {
    const valores = lista.map(f.valor);
    const tope = f.pct ? 100 : Math.max(1, ...valores.map(v => v ?? 0), ...(f.maximo ? lista.map(f.maximo) : [0]));
    const mejor = Math.max(...valores.map(v => v ?? -1));
    return el('section', { class: 'comparar-bloque' },
      el('h3', { texto: t(f.clave) }),
      el('ul', { class: 'comparar-barras' }, lista.map((a, k) => {
        const v = valores[k];
        const ancho = v == null ? 0 : Math.round((v * 100) / tope);
        const texto = f.texto ? f.texto(a) : v == null ? '—' : f.pct ? h.pctTexto(v) : f.maximo ? t(f.frase, { n: numero(v), total: numero(f.maximo(a)) }) : numero(v);
        return el('li', { class: `comparar-fila color-${k % 6}${v != null && v > 0 && v === mejor && valores.some(x => (x ?? -1) !== mejor) ? ' mejor' : ''}` },
          el('span', { class: 'comparar-quien' }, h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'chico' }), el('span', { texto: nombreDe(a) })),
          el('span', { class: 'comparar-barra' }, h.barraLlena(ancho)),
          el('strong', { class: 'comparar-valor', texto }));
      })));
  };
  const materias = datos.materias.length ? el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, h.icono('bandera'), el('span', { texto: t('ficha.comparar.materias') })),
    el('p', { class: 'suave', texto: t('ficha.comparar.materias.linea') }),
    datos.materias.map(id => el('section', { class: `comparar-bloque ${h.claseMateria(id)}` },
      el('h3', { texto: h.nombreMateria(id) }),
      el('ul', { class: 'comparar-barras' }, lista.map((a, k) => {
        const m = a.materias.find(x => x.id === id);
        return el('li', { class: `comparar-fila color-${k % 6}` },
          el('span', { class: 'comparar-quien' }, h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'chico' }), el('span', { texto: nombreDe(a) })),
          el('span', { class: 'comparar-barra' }, h.barraLlena(m?.pct ?? 0)),
          el('strong', { class: 'comparar-valor', texto: h.pctTexto(m?.pct ?? 0) }));
      }))))) : null;
  return [
    el('a', { class: 'volver con-icono', href: '#alumnos' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.alumnos.volver') })),
    el('h1', { class: 'titulo-pantalla', texto: t('ficha.comparar.titulo') }),
    el('div', { class: 'comparar-cabezas' }, lista.map((a, k) => el('a', { class: `tarjeta comparar-cabeza color-${k % 6}`, href: `#alumno/${a.id}` },
      h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'grande' }),
      el('strong', { texto: nombreDe(a) }),
      el('span', { class: 'suave chica', texto: `@${a.nombre}` }),
      el('span', { class: 'suave chica', texto: a.enLinea ? t('acad.en_linea') : a.ultimaActividad ? t('acad.ultima', { cuando: h.hace(a.ultimaActividad) }) : t('admin.nunca') }),
      el('span', { class: 'comparar-pct', texto: h.pctTexto(a.preparacion) })))),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('grafica'), el('span', { texto: t('ficha.comparar.cifras') })),
      el('p', { class: 'suave chica', texto: t('ficha.comparar.cifras.linea') }),
      filasCifra.map(bloque)),
    materias,
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('atencion'), el('span', { texto: t('ficha.comparar.debiles') })),
      el('div', { class: 'comparar-debiles' }, lista.map(a => el('div', { class: 'comparar-debil' },
        el('h3', { class: 'con-icono' }, h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'chico' }), el('span', { texto: nombreDe(a) })),
        a.debiles.temas.length || a.debiles.ideas.length ? el('ul', {},
          a.debiles.temas.map(x => el('li', { texto: t('ficha.comparar.tema_debil', { tema: h.partirTitulo(x.titulo).es, pct: h.pctTexto(x.pct) }) })),
          a.debiles.ideas.map(x => el('li', {}, h.talCual('span', x.idea)))) : el('p', { class: 'suave', texto: t('ficha.comparar.sin_debiles') }))))),
  ];
}
