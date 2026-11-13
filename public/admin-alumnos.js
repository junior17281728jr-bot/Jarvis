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
const TEXTO_TIPO = { tema: 'ficha.tipo.tema', examen: 'ficha.tipo.examen', reto: 'ficha.tipo.reto', repaso: 'ficha.tipo.repaso', errores: 'ficha.tipo.errores', final: 'ficha.tipo.final' };
const TEXTO_ESTADO = { en_linea: 'ficha.sesion.en_linea', abierta: 'ficha.sesion.abierta', vencida: 'ficha.sesion.vencida', cerrada: 'ficha.sesion.cerrada' };
const TEXTO_MOTIVO = { salir: 'ficha.motivo.salir', cerrada: 'ficha.motivo.cerrada', bloqueo: 'ficha.motivo.bloqueo', otro_equipo: 'ficha.motivo.otro_equipo' };
const TEXTO_RITMO = { adelantado: 'ficha.ritmo.adelantado', a_tiempo: 'ficha.ritmo.a_tiempo', atrasado: 'ficha.ritmo.atrasado', terminado: 'ficha.ritmo.terminado' };
const TEXTO_PLAN = { un_mes: 'acad.plan.un_mes', dos_meses: 'acad.plan.dos_meses', repaso_15: 'acad.plan.repaso_15' };

// ---------- Piezas ----------
// «1:05» (minutos:segundos) o «1 h 02:05».
export function reloj(segundos) {
  const n = Math.max(0, Math.round(Number(segundos) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = String(n % 60).padStart(2, '0');
  return h ? `${h} h ${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
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
      a.nombreLegal ? h.el('p', { class: 'ficha-legal', texto: h.t('admin.nombre_legal', { nombre: a.nombreLegal.completo }) }) : null,
      a.terminos ? h.el('p', { class: `suave chica ${a.terminos.pendiente ? 'tono-atencion' : ''}`.trim(), texto: a.terminos.ultima
        ? h.t(a.terminos.pendiente ? 'ficha.terminos.vieja' : 'ficha.terminos.si', { n: h.numero(a.terminos.ultima.version), cuando: h.fecha(a.terminos.ultima.en), nombre: a.terminos.ultima.firmado, actual: h.numero(a.terminos.version) })
        : h.t('ficha.terminos.no') }) : null,
      a.meta ? h.el('p', { class: 'ficha-meta con-icono-chico' }, h.icono('bandera', 'icono chico'), h.el('span', { texto: a.meta })) : null,
      h.el('p', { class: 'suave chica', texto: act?.enLinea ? h.t('acad.en_linea') : act?.ultimaActividad ? h.t('acad.ultima', { cuando: h.hace(act.ultimaActividad) }) : h.t('admin.nunca') })));
}

// 0.9.2: la cuenta: bloquear / desbloquear (sin borrar nada), cambiar su nombre y su usuario, ponerle una contraseña.
function cuentaAlumno(h, a) {
  const { el, t } = h;
  const yo = a.id === h.yoId;
  const mensaje = h.caja();
  // 0.13.8: «Bloquear» / «Desbloquear» y «Eliminar» (o «Recuperar», si ya se eliminó), con el nombre en la pregunta.
  const bloquear = yo ? null : accionesCuenta(h, a, mensaje);
  const mensajeNombre = h.caja();
  const campoVisible = el('input', { id: 'campo-ficha-visible', type: 'text', maxlength: 80, value: nombreDe(a), autocomplete: 'off' });
  const campoUsuario = el('input', { id: 'campo-ficha-usuario', type: 'text', maxlength: 40, value: a.nombre, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const guardarNombre = h.botonAccion(t('cuenta.nombre.guardar'), '', mensajeNombre, async () => {
    const datos = {};
    if (campoVisible.value.trim() !== nombreDe(a)) datos.nombreVisible = campoVisible.value;
    if (campoUsuario.value.trim().toLowerCase() !== a.nombre.toLowerCase()) datos.nombre = campoUsuario.value.trim();
    if (!Object.keys(datos).length) throw new Error(t('error.nombre_igual'));
    const r = await h.api('POST', `/api/admin/usuarios/${a.id}/nombre`, datos);
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(datos.nombre ? t('cuenta.nombre.listo_usuario', { usuario: r.datos.nombre }) : t('cuenta.nombre.listo'));
    await h.recargar();
  }, 'lapiz');
  const mensajeLegal = h.caja();
  const campoLegalN = el('input', { id: 'campo-ficha-legal-n', type: 'text', maxlength: 60, value: a.nombreLegal?.nombre ?? '', autocomplete: 'off' });
  const campoLegalA = el('input', { id: 'campo-ficha-legal-a', type: 'text', maxlength: 60, value: a.nombreLegal?.apellido ?? '', autocomplete: 'off' });
  const guardarLegal = h.botonAccion(t('cuenta.nombre.guardar'), 'secundario', mensajeLegal, async () => {
    const r = await h.api('POST', `/api/admin/usuarios/${a.id}/nombre-legal`, { nombre: campoLegalN.value, apellido: campoLegalA.value });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('cuenta.legal.listo'));
    await h.recargar();
  }, 'lapiz');
  const mensajeVerificacion = h.caja();
  const campoVerificacion = el('input', { id: 'campo-ficha-verificacion', type: 'text', maxlength: 300, value: a.verificacion?.nota ?? '', placeholder: t('cuenta.verificacion.muestra'), autocomplete: 'off' });
  const guardarVerificacion = h.botonAccion(t('cuenta.nombre.guardar'), 'secundario', mensajeVerificacion, async () => {
    const r = await h.api('POST', `/api/admin/usuarios/${a.id}/verificacion`, { nota: campoVerificacion.value });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('cuenta.verificacion.listo'));
    await h.recargar();
  }, 'marca');
  const mensajeTutor = h.caja();
  const botonTutorPagos = h.botonAccion(t(a.tutorPagos ? 'cuenta.tutor_pagos.quitar' : 'cuenta.tutor_pagos.dar'), 'secundario', mensajeTutor, async () => {
    const r = await h.api('POST', `/api/admin/usuarios/${a.id}/tutor-pagos`, { autorizado: !a.tutorPagos });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    await h.recargar();
  });
  const mensajeClave = h.caja();
  const campoClave = el('input', { id: 'campo-ficha-clave', type: 'text', minlength: 4, maxlength: 200, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const ponerClave = yo ? null : h.botonAccion(t('cuenta.clave.poner'), 'secundario', mensajeClave, async () => {
    if (campoClave.value.length < 4) throw new Error(t('error.clave_corta'));
    const r = await h.api('POST', `/api/admin/usuarios/${a.id}/clave`, { clave: campoClave.value });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    campoClave.value = '';
    h.avisar(t('cuenta.clave.lista', { nombre: nombreDe(a) }));
    await h.recargar();
  }, 'candado');
  return el('section', { class: 'tarjeta ficha-cuenta', 'aria-labelledby': 'ficha-cuenta-titulo' },
    el('div', { class: 'ficha-cuenta-cabeza' },
      el('h2', { id: 'ficha-cuenta-titulo', class: 'con-icono' }, h.icono('ajustes'), el('span', { texto: t('cuenta.titulo') })),
      el('span', { class: 'etiquetas' },
        a.eliminado ? h.insignia('mal', t('cuenta.eliminada')) : a.activo ? h.insignia('bien', t('admin.activo')) : h.insignia('mal', t('admin.inactivo')),
        a.pendiente ? h.insignia('atencion', t('admin.pendiente')) : null,
        a.terminos?.menor ? h.insignia('atencion', t('contratos.menor')) : null,
        a.terminos && !a.terminos.aceptoIa ? h.insignia('apagado', t('cuenta.sin_ia')) : null)),
    a.eliminado ? el('p', { class: 'aviso', texto: t('cuenta.eliminada.linea', { fecha: h.fecha(a.eliminado.en) }) })
      : a.activo ? null : el('p', { class: 'aviso', texto: t('cuenta.bloqueada.linea') }),
    bloquear ? el('div', { class: 'botones' }, bloquear) : el('p', { class: 'suave chica', texto: t('admin.tu_cuenta') }),
    bloquear && !a.eliminado ? el('p', { class: 'ayuda', texto: t('cuenta.eliminar.ayuda') }) : null,
    mensaje,
    el('details', { class: 'ficha-cuenta-mas' },
      el('summary', { texto: t('cuenta.nombre.titulo') }),
      el('label', { for: 'campo-ficha-visible', texto: t('perfil.nombre') }), campoVisible,
      el('label', { for: 'campo-ficha-usuario', texto: t('cuenta.nombre.usuario') }), campoUsuario,
      el('p', { class: 'ayuda', texto: t('cuenta.nombre.ayuda') }),
      el('div', { class: 'botones' }, guardarNombre), mensajeNombre),
    // 0.9.2: «Cómo verifiqué su identidad» (sale en el contrato) y, si es menor, si el tutor autorizó pagos.
    el('details', { class: 'ficha-cuenta-mas' },
      el('summary', { texto: t('cuenta.verificacion.titulo') }),
      a.verificacion ? el('p', { class: 'suave chica', texto: t('cuenta.verificacion.actual', { nota: a.verificacion.nota, fecha: h.fecha(a.verificacion.en) }) }) : null,
      el('label', { for: 'campo-ficha-verificacion', texto: t('cuenta.verificacion.nota') }), campoVerificacion,
      el('div', { class: 'botones' }, guardarVerificacion), mensajeVerificacion),
    a.terminos?.menor ? el('div', { class: 'ficha-cuenta-menor' },
      el('p', { texto: t(a.tutorPagos ? 'cuenta.tutor_pagos.si' : 'cuenta.tutor_pagos.no') }),
      el('div', { class: 'botones' }, botonTutorPagos), mensajeTutor) : null,
    el('details', { class: 'ficha-cuenta-mas' },
      el('summary', { texto: t('cuenta.legal.titulo') }),
      el('label', { for: 'campo-ficha-legal-n', texto: t('terminos.nombre') }), campoLegalN,
      el('label', { for: 'campo-ficha-legal-a', texto: t('terminos.apellido') }), campoLegalA,
      el('p', { class: 'ayuda', texto: t('cuenta.legal.ayuda') }),
      el('div', { class: 'botones' }, guardarLegal), mensajeLegal),
    ponerClave ? el('details', { class: 'ficha-cuenta-mas' },
      el('summary', { texto: t('cuenta.clave.titulo') }),
      el('label', { for: 'campo-ficha-clave', texto: t('cuenta.clave.nueva') }), campoClave,
      el('p', { class: 'ayuda', texto: t('cuenta.clave.ayuda') }),
      el('div', { class: 'botones' }, ponerClave), mensajeClave) : null);
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
          a.nombreLegal ? el('p', { class: 'suave chica', texto: a.nombreLegal }) : null,
          el('p', { class: 'suave chica', texto: `@${a.nombre} · ${a.enLinea ? t('acad.en_linea') : a.ultimaActividad ? t('acad.ultima', { cuando: h.hace(a.ultimaActividad) }) : t('admin.nunca')}` }),
          el('div', { class: 'etiquetas' },
            h.insignia('bien', t('acad.bien', { n: numero(a.aciertos) })),
            h.insignia('mal', t('acad.mal', { n: numero(a.errores) })),
            h.insignia('info', t('acad.temas_de', { n: numero(a.temasAprobados), total: numero(a.temas) }))))));
  };
  return el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, h.icono('personas'), el('span', { texto: tn('acad.alumnos.n', { n: lista.length }) }), el('span', { class: 'insignia tono-bien', texto: tn('acad.alumnos.en_linea', { n: enLinea }) })),
    lista.length > 1 ? el('div', { class: 'ficha-comparar-barra' }, boton, ayuda) : null,
    // 0.9.2: el Reporte (ranking, por alumno, grupo, comparar; PDF y CSV).
    el('div', { class: 'botones ficha-reporte' },
      el('a', { class: 'boton-enlace secundario con-icono', href: '#reporte' }, h.icono('grafica', 'icono chico'), el('span', { texto: t('reporte.boton') })),
      // 0.9.2: los contratos firmados (términos aceptados con la firma dibujada).
      el('a', { class: 'boton-enlace secundario con-icono', href: '#contratos' }, h.icono('manual', 'icono chico'), el('span', { texto: t('contratos.titulo') }))),
    lista.length ? h.verMas(el('div', { class: 'lista-usuarios' }), lista.map(fila), 12) : h.vacio('personas', t('admin.usuarios.solo_tu')),
    // 0.13.8: los eliminados (plegado), para recuperarlos.
    listaEliminados(h));
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
    cuentaAlumno(h, a),
    fila,
    el('div', { class: 'ficha-cuerpo', 'data-pestana': actual }, cuerpo),
  ];
}

function pestanaResumen(d, h) {
  const { el, t, numero } = h;
  const r = d.resumen;
  const act = d.actividad;
  const plan = r.plan;
  // 0.13.5: más fácil de leer: Avance (con su plan), Exámenes, Clases y Actividad, cada uno con números grandes y barras.
  const avance = r.avance ?? { pct: plan?.pct ?? 0 };
  const examenes = [...d.materias.filter(m => m.examen.veces).map(m => ({ id: m.id, mejor: m.examen.mejor, ultima: m.examen.ultima, aprobado: m.examen.aprobado })), ...(d.examenesOral ?? [])];
  const clases = d.materias.map(m => {
    const temasAprob = m.temas.filter(x => x.aprobado).length;
    return { id: m.id, temasAprobados: temasAprob, temas: m.temas.length, pct: m.temas.length ? Math.floor((temasAprob * 100) / m.temas.length) : 0, respuestas: m.respuestas, pctAcierto: m.pctRespuestas };
  }).filter(m => m.respuestas || m.temasAprobados);
  return [
    el('section', { class: 'tarjeta ficha-bloque ficha-bloque-avance' },
      el('h2', { class: 'con-icono' }, h.icono('calendario'), el('span', { texto: t('cv.avance_titulo') })),
      bloqueAvance(h, avance, plan),
      plan ? el('p', { class: 'suave chica', texto: t('cv.plan.estimado', { fin: h.fechaCortaDia(plan.fin), plan: h.fechaCortaDia(plan.finPlan) }) }) : null,
      el('div', { class: 'ficha-resumen-medidor' }, el('strong', { texto: t('ficha.preparacion') }), h.medidor(r.preparacion.pct, { etiqueta: t('ficha.preparacion'), chico: true }),
        el('p', { class: 'suave chica', texto: t('ficha.preparacion.linea', { bien: numero(r.preparacion.bien), total: numero(r.preparacion.total) }) })),
      // 0.13.8: el % de cada una de las 11 materias (y del oral, si hizo algo ahí).
      bloqueCadaMateria(h, d.cadaMateria, d.cadaOral, d.detalles)),
    el('section', { class: 'tarjeta ficha-bloque' },
      el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: t('cv.examenes') })),
      bloqueNotaGeneral(h, { pct: r.notaGeneral ?? 0, aprobados: r.examenesAprobados, total: r.examenes }),
      examenes.length ? el('ul', { class: 'cv-examenes' }, examenes.map(x => chipExamen(h, x))) : el('p', { class: 'suave', texto: t('cv.examenes.vacio') }),
      el('div', { class: 'ficha-cifras' },
        cifra(h, 'trofeo', r.notaPromedio == null ? '—' : h.pctTexto(r.notaPromedio), t('ficha.nota_promedio'), t('ficha.nota_promedio.linea', { n: numero(r.calificados) }))),
      el('a', { class: 'enlace-fuerte', href: `#alumno/${d.alumno.id}/examenes`, texto: t('cv.ver_examenes') })),
    el('section', { class: 'tarjeta ficha-bloque' },
      el('h2', { class: 'con-icono' }, h.icono('bandera'), el('span', { texto: t('cv.clases') })),
      el('div', { class: 'ficha-cifras' },
        cifra(h, 'bandera', `${numero(r.temasAprobados)}/${numero(r.temas)}`, t('ficha.temas')),
        cifra(h, 'bien', h.pctTexto(r.pctAcierto), t('ficha.acierto'), t('ficha.acierto.linea', { bien: numero(r.aciertos), n: numero(r.respuestas) })),
        cifra(h, 'libro', numero(r.intentos), t('ficha.intentos'), r.enCurso ? t('ficha.en_curso', { n: numero(r.enCurso) }) : null),
        cifra(h, 'medalla', numero(r.aprobados), t('ficha.aprobados'), t('ficha.reprobados', { n: numero(r.reprobados) })),
        cifra(h, 'tarjetas', numero(r.respuestas), t('ficha.respondidas'), t('ficha.distintas', { n: numero(r.preguntasDistintas) }))),
      clases.length ? el('ul', { class: 'cv-clases' }, clases.map(m => filaClase(h, m))) : el('p', { class: 'suave', texto: t('cv.clases.vacio') }),
      el('a', { class: 'enlace-fuerte', href: `#alumno/${d.alumno.id}/materias`, texto: t('cv.ver_materias') })),
    el('section', { class: 'tarjeta ficha-bloque' },
      el('h2', { class: 'con-icono' }, h.icono('reloj'), el('span', { texto: t('ficha.pestana.actividad') })),
      el('p', { class: 'cv-estado grande' }, el('span', { class: `punto-linea${act.enLinea ? ' en-linea' : ''}`, 'aria-hidden': 'true' }), el('span', { texto: estadoLinea(h, act) })),
      lineasDeActividad(h, d.detalles && { ...d.detalles, racha: 0 }), // la racha ya va abajo, con su número grande
      el('div', { class: 'ficha-cifras' },
        cifra(h, 'reloj', horas(h, r.minutosEstudio), t('cv.tiempo.total'), t('ficha.tiempo.linea', { n: numero(r.diasEstudio) })),
        cifra(h, 'calendario', horas(h, r.minutosSemana ?? 0), t('cv.tiempo.semana')),
        cifra(h, 'fuego', numero(r.racha), t('acad.racha'), r.estudioHoy ? t('ficha.estudio_hoy') : null)),
      el('dl', { class: 'ficha-datos' },
        el('dt', { texto: t('ficha.ultima_entrada') }), el('dd', { texto: act.ultimaEntrada ? h.fecha(act.ultimaEntrada) : t('admin.nunca') }),
        el('dt', { texto: t('ficha.ultima_salida') }), el('dd', { texto: textoSalida(h, act, h.fecha) }),
        el('dt', { texto: t('ficha.ultima_actividad') }), el('dd', { texto: act.ultimaActividad ? h.fecha(act.ultimaActividad) : t('admin.nunca') })),
      el('p', { class: 'suave chica', texto: t('cv.tiempo.nota') }),
      el('a', { class: 'enlace-fuerte', href: `#alumno/${d.alumno.id}/actividad`, texto: t('ficha.ver_sesiones') })),
    ultimosIntentos(d, h),
    saltosAlumno(d, h),
    h.panelExtra ? h.panelExtra(d.extra, { titulo: t('alumnos.extra.titulo'), enlaces: false }) : null,
  ];
}
// 0.12.0: «Saltó las clases»: cada vez que fue directo al examen (con cuántos temas sin hacer y cómo le fue) y el orden
// de cada materia (examen antes o después de los temas).
function saltosAlumno(d, h) {
  const { el, t, numero } = h;
  const s = d.saltos;
  if (!s) return null;
  const ordenes = Object.entries(s.orden ?? {});
  return el('section', { class: 'tarjeta ficha-saltos' },
    el('h2', { class: 'con-icono' }, h.icono('atencion'), el('span', { texto: t('alumnos.saltos.titulo') })),
    ordenes.length ? el('p', { class: 'etiquetas' }, ordenes.map(([m, o]) => h.insignia(o === 'examen_antes' ? 'atencion' : 'bien', `${h.nombreMateria(m)}: ${t(`alumnos.orden.${o}`)}`))) : null,
    s.eventos?.length ? el('ul', { class: 'ficha-saltos-lista' }, s.eventos.map(e => el('li', {},
      el('a', { href: `#alumno/${d.alumno.id}/intento/${e.intento}`, texto: t('alumnos.saltos.linea', { fecha: h.fecha(e.en), materia: h.nombreMateria(e.materia), n: numero(e.pendientes), total: numero(e.total) }) }),
      ' ',
      !e.terminado ? h.insignia('apagado', t('alumnos.saltos.abierto'))
        : e.aprobado ? h.insignia('bien', t('alumnos.saltos.aprobo', { pct: numero(e.pct ?? 0) })) : h.insignia('mal', t('alumnos.saltos.quemado', { pct: numero(e.pct ?? 0) })))))
      : el('p', { class: 'suave', texto: t('alumnos.saltos.vacio') }));
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
        el('span', { class: 'suave chica', texto: [h.fecha(x.terminado ?? x.empezado), t('ficha.de', { bien: h.numero(x.aciertos), total: h.numero(x.total) }),
          x.segundos != null ? (x.limiteSegundos ? t('ficha.tiempo_de', { usado: reloj(x.segundos), limite: reloj(x.limiteSegundos) }) : t('ficha.tiempo_usado', { usado: reloj(x.segundos) })) : null].filter(Boolean).join(' · ') })),
      el('span', { class: 'ficha-intento-estado' },
        !x.terminadoSi ? h.insignia('apagado', t('ficha.sin_terminar'))
          : x.aprobado === true ? h.insignia('bien', t('ficha.aprobado'))
            : x.aprobado === false ? h.insignia('mal', t('ficha.no_aprobado')) : h.insignia('info', t('ficha.practica')),
        h.icono('flecha', 'icono chico'))));
}

// 0.12.3: «Exámenes del Test Guide» (el examen de cada materia, lo que le interesa al administrador): agrupados por materia,
// con cuántos intentos, la mejor y la última nota y cuántos aprobaron; cada fila: alumno · fecha · nota · aprobó · tiempo
// · «directo». Los temas y las prácticas van aparte, plegados («Prácticas y temas»), sin los sin terminar salvo que se pida.
// Lógica pura (test/admin3.test.js): el resumen de un grupo después de filtrar por alumno.
export function resumenExamenes(filas) {
  const n = filas.length;
  const aprobados = filas.filter(x => x.aprobado).length;
  return { intentos: n, mejor: n ? Math.max(...filas.map(x => x.pct)) : null, ultima: n ? filas[0].pct : null, aprobados, tasa: n ? Math.round((aprobados * 100) / n) : null };
}
export function vistaExamenesTG(datos, h, { conAlumno = true } = {}) {
  const { el, t, numero } = h;
  const zona = el('div', { class: 'examenes-tg' });
  let alumno = '';
  const elegir = conAlumno && datos.alumnos.length > 1 ? el('select', { id: 'examenes-alumno', 'aria-label': t('examenes.filtro_alumno'), onchange: e => { alumno = e.currentTarget.value; pintar(); } },
    el('option', { value: '', texto: t('examenes.todos_alumnos') }), datos.alumnos.map(a => el('option', { value: String(a.id), texto: a.nombre }))) : null;
  const fila = x => el('li', {},
    el('a', { class: 'ficha-intento', href: `#alumno/${x.alumno.id}/intento/${x.intento}` },
      el('span', { class: `ficha-nota tono-${tonoNota(x.pct)}`, texto: h.pctTexto(x.pct) }),
      el('span', { class: 'ficha-intento-texto' },
        conAlumno ? el('strong', { texto: x.alumno.nombre }) : el('strong', { texto: h.fecha(x.fecha) }),
        el('span', { class: 'suave chica', texto: [conAlumno ? h.fecha(x.fecha) : null, t('ficha.de', { bien: numero(x.aciertos), total: numero(x.total) }), t('ficha.tiempo_usado', { usado: reloj(x.segundos) })].filter(Boolean).join(' · ') })),
      el('span', { class: 'ficha-intento-estado' },
        x.directo ? h.insignia('atencion', t('examenes.directo')) : null,
        x.aprobado ? h.insignia('bien', t('ficha.aprobado')) : h.insignia('mal', t('ficha.no_aprobado')),
        h.icono('flecha', 'icono chico'))));
  const pintar = () => {
    // Solo las materias con exámenes, cada una con lo suyo; las demás, en una línea al final («más ordenada»).
    const deCada = datos.materias.map(m => ({ m, filas: alumno ? m.filas.filter(x => String(x.alumno.id) === alumno) : m.filas }));
    const sinIntentos = deCada.filter(x => !x.filas.length).map(x => h.nombreMateria(x.m.id));
    const grupos = deCada.filter(x => x.filas.length).map(({ m, filas }) => {
      const r = resumenExamenes(filas);
      return el('section', { class: `panel examenes-materia ${h.claseMateria(m.id)}` },
        el('div', { class: 'materia-cabeza' },
          el('span', { class: 'banner-icono chico', 'aria-hidden': 'true' }, h.icono(h.ICONO_MATERIA?.[m.id] ?? 'avion')),
          el('h3', { texto: h.nombreMateria(m.id) }),
          el('a', { class: 'cv-comparar-enlace', href: `#comparar-examen/${encodeURIComponent(m.id)}`, texto: t('cv.comparar_alumnos') })),
        el('p', { class: 'suave chica', texto: r.intentos ? t('examenes.materia.linea', { n: numero(r.intentos), mejor: h.pctTexto(r.mejor), ultima: h.pctTexto(r.ultima), aprobados: numero(r.aprobados), tasa: h.pctTexto(r.tasa) }) : t('examenes.sin_intentos') }),
        filas.length ? h.verMas(el('ul', { class: 'ficha-intentos' }), filas.map(fila), 5) : null);
    });
    zona.replaceChildren(...grupos, ...(sinIntentos.length ? [el('p', { class: 'suave chica', texto: t('examenes.sin_intentos_lista', { lista: sinIntentos.join(' · ') }) })] : []));
  };
  pintar();
  if (!datos.materias.some(m => m.filas.length)) return el('div', {}, h.vacio('libro', t('examenes.vacio'), null, 'en-linea'));
  return el('div', {},
    elegir ? el('label', { for: 'examenes-alumno', class: 'suave', texto: t('examenes.filtro_alumno') }) : null, elegir,
    datos.enCurso ? el('p', { class: 'suave chica', texto: t('examenes.en_curso', { n: numero(datos.enCurso) }) }) : null,
    zona);
}

function pestanaExamenes(d, h) {
  const { el, t } = h;
  if (!d.intentos.length) return el('section', { class: 'tarjeta' }, h.vacio('libro', t('ficha.intentos.vacio')));
  // Los exámenes del Test Guide (lo de siempre primero).
  const zonaTG = el('div', {}, el('p', { class: 'cargando', texto: t('examenes.cargando') }));
  h.api('GET', `/api/admin/academia/examenes?alumno=${encodeURIComponent(d.alumno.id)}`).then(r => {
    zonaTG.replaceChildren(r.ok ? vistaExamenesTG(r.datos, h, { conAlumno: false }) : el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) }));
  });
  // Prácticas y temas: plegadas, sin los sin terminar salvo que se pida.
  const otros = d.intentos.filter(x => x.tipo !== 'examen');
  const tipos = ['todos', 'tema', 'reto', 'repaso', 'errores', 'final'].filter(x => x === 'todos' || otros.some(i => i.tipo === x));
  const lista = el('ul', { class: 'ficha-intentos' });
  let filtro = 'todos';
  let conSinTerminar = false;
  const sinTerminar = otros.filter(x => !x.terminadoSi).length;
  const botones = tipos.map(x => el('button', { type: 'button', class: 'ficha-filtro', 'aria-pressed': String(x === filtro), texto: x === 'todos' ? t('ficha.filtro.todos') : t(TEXTO_TIPO[x]), onclick: () => { filtro = x; pintar(); } }));
  const verSin = sinTerminar ? el('button', { type: 'button', class: 'ficha-filtro', 'aria-pressed': 'false', texto: t('examenes.mostrar_sin_terminar', { n: h.numero(sinTerminar) }), onclick: () => { conSinTerminar = !conSinTerminar; pintar(); } }) : null;
  const pintar = () => {
    botones.forEach((b, k) => b.setAttribute('aria-pressed', String(tipos[k] === filtro)));
    verSin?.setAttribute('aria-pressed', String(conSinTerminar));
    const elegidos = otros.filter(x => (filtro === 'todos' || x.tipo === filtro) && (conSinTerminar || x.terminadoSi));
    lista.replaceChildren(...(elegidos.length ? elegidos.map(x => filaIntento(h, d.alumno.id, x)) : [el('li', { class: 'suave', texto: t('examenes.otros.vacio') })]));
  };
  pintar();
  return [
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: t('examenes.titulo') })),
      el('p', { class: 'suave', texto: t('examenes.linea') }),
      zonaTG),
    otros.length ? el('section', { class: 'tarjeta' },
      el('details', { class: 'plegable-chico' },
        el('summary', { texto: h.tn('examenes.otros', { n: otros.filter(x => x.terminadoSi).length }) }),
        el('p', { class: 'suave', texto: t('ficha.intentos.linea') }),
        el('div', { class: 'ficha-filtros', role: 'group', 'aria-label': t('ficha.filtro') }, botones, verSin),
        lista)) : null,
  ];
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

// 0.12.4: «Última salida» (el fin de su visita anterior, o de esta si ya no está) y cómo terminó.
function textoSalida(h, act, formato) {
  if (!act.ultimaSalida) return act.visitas != null ? h.t('admin.nunca') : h.t('ficha.sin_salida');
  return act.salidaComo ? `${formato(act.ultimaSalida)} (${h.t(`ficha.salida_como.${act.salidaComo}`)})` : formato(act.ultimaSalida);
}
function pestanaActividad(d, h) {
  const { el, t, numero } = h;
  const act = d.actividad;
  return [
    el('section', { class: 'tarjeta' },
      el('div', { class: 'ficha-cifras tres' },
        cifra(h, 'flecha', act.ultimaEntrada ? h.cuando(act.ultimaEntrada) : t('admin.nunca'), t('ficha.ultima_entrada')),
        cifra(h, 'salir', textoSalida(h, act, h.cuando), t('ficha.ultima_salida')),
        cifra(h, 'reloj', act.ultimaActividad ? h.cuando(act.ultimaActividad) : t('admin.nunca'), t('ficha.ultima_actividad'), act.enLinea ? t('acad.en_linea') : null)),
      // 0.12.4: las veces que abrió la app (visitas); las entradas con contraseña, aparte.
      act.visitas != null ? el('p', { class: 'suave chica', texto: `${h.tn('ficha.visitas.linea', { n: act.visitas })} · ${h.tn('ficha.actividad.linea', { n: act.entradas, abiertas: numero(act.abiertas) })}` })
        : el('p', { class: 'suave chica', texto: h.tn('ficha.actividad.linea', { n: act.entradas, abiertas: numero(act.abiertas) }) })),
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
      q.respondidaEn || q.segundos != null ? el('p', { class: 'suave chica', texto: [q.respondidaEn ? t('ficha.p.cuando', { cuando: h.fecha(q.respondidaEn) }) : null,
        q.segundos != null ? t('ficha.p.segundos', { tiempo: reloj(q.segundos) }) : null].filter(Boolean).join(' · ') }) : null);
  };
  // 0.13.5: agrupadas por tema (cuando el intento tiene más de uno, como el examen de una materia), cada pregunta con su
  // número de siempre; los temas en el orden en que aparece su primera pregunta.
  const numerada = v.preguntas.map((q, k) => ({ q, k }));
  const grupos = [];
  for (const x of numerada) {
    const clave = x.q.tema ?? '';
    let g = grupos.find(y => y.clave === clave);
    if (!g) { g = { clave, titulo: x.q.temaTitulo, lista: [] }; grupos.push(g); }
    g.lista.push(x);
  }
  const pintar = () => {
    const nodos = [];
    for (const g of grupos) {
      const visibles = g.lista.filter(({ q }) => !soloMalas || (q.respuesta && !q.respuesta.acierto));
      if (!visibles.length) continue;
      if (grupos.length > 1) {
        const respondidasTema = g.lista.filter(({ q }) => q.respuesta);
        const bien = respondidasTema.filter(({ q }) => q.respuesta.acierto).length;
        nodos.push(el('li', { class: 'ficha-pregunta-tema' }, el('h3', { texto: g.titulo ? h.partirTitulo(g.titulo).es : t('cv.sin_tema') }),
          el('span', { class: 'suave chica', texto: t('ficha.tema_bien', { bien: numero(bien), n: numero(respondidasTema.length) }) })));
      }
      for (const { q, k } of visibles) nodos.push(pregunta(q, k));
    }
    lista.replaceChildren(...nodos);
  };
  pintar();
  const fallas = fallasPorTema(v.preguntas);
  const resumenFallas = fallas.length ? el('p', { class: 'ficha-fallo-en' }, el('strong', { texto: t('ficha.fallo_en') }), ' ',
    el('span', { texto: fallas.map(x => `${x.titulo ? h.partirTitulo(x.titulo).es : t('cv.sin_tema')} (${numero(x.fallos)})`).join(', ') }))
    : respondidas.length ? el('p', { class: 'mensaje bien', texto: t('ficha.sin_fallos') }) : null;
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
        v.segundos != null ? el('span', { class: 'suave chica con-icono-chico' }, h.icono('reloj', 'icono chico'),
          el('span', { texto: v.examen ? t('ficha.tiempo_de', { usado: reloj(v.segundos), limite: reloj(v.examen.limiteSegundos) }) : t('ficha.tiempo_usado', { usado: reloj(v.segundos) }) })) : null,
        v.aprobado === true ? h.insignia('bien', t('ficha.aprobado')) : v.aprobado === false ? h.insignia('mal', t('ficha.no_aprobado', { umbral: numero(v.umbral ?? 90) })) : h.insignia('info', t('ficha.practica')))),
    el('section', { class: 'tarjeta' },
      resumenFallas,
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

// ---------- 0.13.5: piezas comunes de «Cómo van todos» y de la ficha ----------
// El color de una nota de examen: verde si aprobó, naranja si la mejor llegó a 70 %, rojo si no.
export function tonoExamen(x) {
  if (!x || x.mejor == null) return 'apagado';
  return x.aprobado ? 'bien' : x.mejor >= 70 ? 'atencion' : 'mal';
}
// El nombre de un examen: la materia, un capítulo del oral o el examen oral final.
function nombreExamen(h, id) {
  return id === 'final' ? h.t('cv.oral_final') : h.nombreMateria(id);
}
// Una nota de examen: «Factores humanos · Mejor 85 % · Última 70 % · ✔ Aprobado».
function chipExamen(h, x) {
  const { el, t } = h;
  const tono = tonoExamen(x);
  return el('li', { class: `cv-examen cv-${tono}` },
    el('span', { class: 'cv-examen-nombre', texto: nombreExamen(h, x.id) }),
    el('span', { class: 'cv-examen-notas' },
      el('strong', { class: 'cv-examen-mejor', texto: h.pctTexto(x.mejor) }),
      el('span', { class: 'cv-examen-ultima', texto: t('cv.ultima', { pct: h.pctTexto(x.ultima) }) })),
    el('span', { class: 'cv-examen-estado', texto: t(x.aprobado ? 'cv.aprobado' : 'cv.no_aprobado') }));
}
// Una materia de las clases: el nombre, la barra de temas aprobados y «3 de 5 temas · 80 % aciertos».
function filaClase(h, m) {
  const { el, t } = h;
  return el('li', { class: `cv-clase ${h.claseMateria(m.id)}` },
    el('span', { class: 'cv-clase-nombre', texto: h.nombreMateria(m.id) }),
    el('span', { class: 'cv-barra' }, h.barraLlena(m.pct)),
    el('span', { class: 'cv-clase-cifras', texto: m.respuestas ? t('cv.clase.linea', { n: h.numero(m.temasAprobados), total: h.numero(m.temas), pct: h.pctTexto(m.pctAcierto) })
      : t('cv.clase.linea_sin', { n: h.numero(m.temasAprobados), total: h.numero(m.temas) }) }));
}
function textoPlan(h, plan) {
  const { t } = h;
  if (!plan) return t('cv.plan.sin');
  return t('cv.plan.linea', { plan: t(TEXTO_PLAN[plan.elegido] ?? 'acad.plan.un_mes'), fin: h.fechaCortaDia(plan.fin) });
}
const TONO_RITMO = { adelantado: 'bien', a_tiempo: 'bien', terminado: 'bien', atrasado: 'atencion' };
function estadoLinea(h, a) {
  return a.enLinea ? h.t('cv.en_linea') : a.ultimaActividad ? h.t('cv.visto', { cuando: h.hace(a.ultimaActividad) }) : h.t('cv.nunca');
}
// El avance del curso entero: el número grande y la barra.
function bloqueAvance(h, avance, plan) {
  const { el, t } = h;
  return el('div', { class: 'cv-avance' },
    el('div', { class: 'cv-avance-cifra' },
      el('strong', { class: 'cv-grande', texto: h.pctTexto(avance.pct) }),
      el('span', { class: 'cv-rotulo', texto: t('cv.avance_curso') })),
    el('span', { class: 'cv-barra grande' }, h.barraLlena(avance.pct)),
    el('p', { class: 'cv-plan' },
      el('span', { texto: textoPlan(h, plan) }),
      plan ? h.insignia(TONO_RITMO[plan.ritmo] ?? 'info', t(TEXTO_RITMO[plan.ritmo] ?? 'ficha.ritmo.a_tiempo')) : null));
}
// 0.13.6: la nota general del curso (las 11 materias; sin examen cuenta 0), grande con su barra, y los exámenes aprobados.
function bloqueNotaGeneral(h, general) {
  const { el, t, numero } = h;
  if (!general) return null;
  return el('div', { class: 'cv-avance cv-general' },
    el('div', { class: 'cv-avance-cifra' },
      el('strong', { class: 'cv-grande', texto: h.pctTexto(general.pct ?? 0) }),
      el('span', { class: 'cv-rotulo', texto: t('cv.general') })),
    el('span', { class: 'cv-barra grande' }, h.barraLlena(general.pct ?? 0)),
    el('p', { class: 'cv-general-aprobados', texto: t('cv.general.aprobados', { n: numero(general.aprobados ?? 0), total: numero(general.total ?? 11) }) }),
    el('p', { class: 'suave chica', texto: t('cv.general.linea') }));
}
function minutos(h, n) {
  return horas(h, n ?? 0);
}

// ---------- 0.13.8: «Ver cada materia», lo útil de su actividad y la cuenta (bloquear, eliminar, recuperar) ----------
// Lógica pura (test/admin-materias.test.js): «Hace 7 días que no entra» sale desde DIAS_SIN_ENTRAR_AVISO días.
export const DIAS_SIN_ENTRAR_AVISO = 7;
export const avisarSinEntrar = dias => Number.isFinite(dias) && dias >= DIAS_SIN_ENTRAR_AVISO;
const notaOGuion = (h, n) => (n == null ? '—' : h.pctTexto(n));
// Una materia: el nombre, su % (o «Pronto», en gris), la barra y «3/5 temas · examen 85 %».
function filaCadaMateria(h, m, oral = false) {
  const { el, t, numero } = h;
  if (m.pronto) {
    return el('li', { class: 'cv-cada pronto' },
      el('span', { class: 'cv-cada-nombre', texto: h.nombreMateria(m.id) }),
      el('span', { class: 'cv-cada-pct', texto: t('cv.cada.pronto') }));
  }
  const linea = oral ? t('cv.cada.oral_linea', { n: numero(m.leidos), total: numero(m.temas), examen: notaOGuion(h, m.examen.mejor) })
    : t('cv.cada.linea', { n: numero(m.temasHechos), total: numero(m.temas), examen: notaOGuion(h, m.examen.mejor) });
  return el('li', { class: `cv-cada ${h.claseMateria(m.id)}${m.pct >= 100 ? ' completa' : ''}` },
    el('span', { class: 'cv-cada-nombre', texto: h.nombreMateria(m.id) }),
    el('strong', { class: 'cv-cada-pct', texto: h.pctTexto(m.pct) }),
    el('span', { class: 'cv-barra' }, h.barraLlena(m.pct)),
    el('span', { class: `cv-cada-linea${m.examen.aprobado ? ' aprobado' : ''}`, texto: linea }));
}
// El desplegable «Ver cada materia»: dónde va y lo que más le cuesta, las 11 materias y, si hizo algo del oral, sus capítulos.
function bloqueCadaMateria(h, materias, oral, detalles) {
  const { el, t } = h;
  if (!materias?.length) return null;
  return el('details', { class: 'cv-cada-materia' },
    el('summary', { class: 'con-icono' }, h.icono('bandera', 'icono chico'), el('span', { texto: t('cv.cada.titulo') })),
    lineasDeMateria(h, detalles),
    el('ul', { class: 'cv-cada-lista' }, materias.map(m => filaCadaMateria(h, m))),
    oral?.length ? [el('h4', { class: 'cv-cada-oral', texto: t('cv.cada.oral') }), el('ul', { class: 'cv-cada-lista' }, oral.map(m => filaCadaMateria(h, m, true)))] : null,
    el('p', { class: 'suave chica', texto: t('cv.cada.nota') }));
}
function textoDondeVa(h, d) {
  const { t } = h;
  if (d.dondeVa === null) return t('cv.va_en.listo');
  const v = d.dondeVa;
  const lugar = v.examen ? t('cv.va_en.examen', { materia: h.nombreMateria(v.materia) }) : `${h.nombreMateria(v.materia)} · ${h.partirTitulo(v.titulo).es}`;
  return t('cv.va_en', { lugar });
}
function lineasDeMateria(h, d) {
  const { el, t } = h;
  if (!d) return null;
  return el('ul', { class: 'cv-detalles' },
    el('li', { texto: textoDondeVa(h, d) }),
    d.masDebil ? el('li', { texto: t('cv.le_cuesta', { materia: h.nombreMateria(d.masDebil.id), pct: h.pctTexto(d.masDebil.pctAcierto) }) }) : null);
}
// Lo útil de su actividad (en «Actividad»): «Hace 9 días que no entra» (naranja), el último examen, los días de esta semana y la racha.
function lineasDeActividad(h, d) {
  const { el, t, numero } = h;
  if (!d) return null;
  return el('ul', { class: 'cv-detalles' },
    avisarSinEntrar(d.diasSinEntrar) ? el('li', { class: 'cv-sin-entrar', texto: t('cv.sin_entrar', { n: numero(d.diasSinEntrar) }) }) : null,
    el('li', { texto: d.ultimoExamen ? t('cv.ultimo_examen', { cuando: h.fechaCortaDia(d.ultimoExamen.slice(0, 10)) }) : t('cv.ultimo_examen.no') }),
    el('li', { texto: t('cv.dias_semana', { n: numero(d.diasSemana ?? 0) }) }),
    d.racha ? el('li', { texto: t('cv.racha_linea', { n: numero(d.racha) }) }) : null);
}

// Los botones de la cuenta: «Bloquear» / «Desbloquear» y «Eliminar»; si ya se eliminó, solo «Recuperar». Cada uno pregunta
// antes, con su nombre (la hoja de la app); eliminar pide además la contraseña del administrador (lo hace h.api).
function accionesCuenta(h, a, mensaje) {
  const { t } = h;
  const nombre = nombreDe(a);
  const hacer = async (ruta, datos, aviso) => {
    const r = await h.api('POST', `/api/admin/usuarios/${a.id}/${ruta}`, datos);
    if (!r.ok) {
      if (r.datos?.error === 'confirmar_cancelado') return;
      throw new Error(h.textoError(r.datos.error));
    }
    h.avisar(aviso);
    await h.recargar();
  };
  if (a.eliminado) {
    return [h.botonAccion(t('cuenta.recuperar'), '', mensaje, async () => {
      if (!(await h.confirmar(t('cuenta.recuperar.confirmar'), { titulo: t('cuenta.recuperar.titulo', { nombre }), si: t('cuenta.recuperar') }))) return;
      await hacer('recuperar', {}, t('cuenta.recuperar.listo', { nombre }));
    }, 'actualizar')];
  }
  const bloquear = h.botonAccion(t(a.activo ? 'cuenta.bloquear' : 'cuenta.desbloquear'), 'secundario', mensaje, async () => {
    // 0.12.4: con la hoja propia de la app (no la confirmación del navegador).
    if (!(await h.confirmar(t(a.activo ? 'admin.confirmar_desactivar' : 'admin.confirmar_activar', { nombre }), { titulo: a.activo ? t('cuenta.bloquear.titulo', { nombre }) : undefined, si: t(a.activo ? 'cuenta.bloquear' : 'cuenta.desbloquear'), peligro: a.activo }))) return;
    await hacer('activo', { activo: !a.activo }, t(a.activo ? 'admin.listo.desactivada' : 'admin.listo.activada', { nombre }));
  }, a.activo ? 'candado' : 'ojo');
  const eliminar = h.botonAccion(t('cuenta.eliminar'), 'peligro', mensaje, async () => {
    if (!(await h.confirmar(t('cuenta.eliminar.confirmar', { usuario: a.nombre }), { titulo: t('cuenta.eliminar.titulo', { nombre }), si: t('cuenta.eliminar'), peligro: true }))) return;
    await hacer('eliminar', {}, t('cuenta.eliminar.listo', { nombre }));
  }, 'papelera');
  return [bloquear, eliminar];
}
// El menú chico de cada tarjeta de «Cómo van todos» (plegado: nada se toca sin querer).
function menuCuenta(h, a) {
  const { el, t } = h;
  if (a.id === h.yoId) return null;
  const mensaje = h.caja();
  return el('details', { class: 'cv-menu' },
    el('summary', { class: 'con-icono' }, h.icono('ajustes', 'icono chico'), el('span', { texto: t('cuenta.acciones') })),
    el('div', { class: 'botones' }, accionesCuenta(h, a, mensaje)),
    el('p', { class: 'ayuda', texto: t('cuenta.eliminar.ayuda') }),
    mensaje);
}
// «Alumnos eliminados» (plegado): se pide al abrirlo. Cada uno con «Recuperar» y su ficha (sus datos siguen ahí).
export function listaEliminados(h, { tarjeta = false } = {}) {
  const { el, t } = h;
  const zona = el('div', { class: 'cv-eliminados-zona' }, el('p', { class: 'suave', texto: t('cv.eliminados.cargando') }));
  let pedido = false;
  const nodo = el('details', { class: tarjeta ? 'tarjeta cv-eliminados' : 'cv-eliminados' },
    el('summary', { class: 'con-icono' }, h.icono('papelera', 'icono chico'), el('span', { texto: t('cv.eliminados.titulo') })),
    el('p', { class: 'suave chica', texto: t('cv.eliminados.ayuda') }),
    zona);
  nodo.addEventListener('toggle', async () => {
    if (!nodo.open || pedido) return;
    pedido = true;
    const r = await h.api('GET', '/api/admin/usuarios/eliminados');
    if (!r.ok) { pedido = false; zona.replaceChildren(el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) })); return; }
    const cuentas = r.datos.cuentas ?? [];
    zona.replaceChildren(cuentas.length ? el('ul', { class: 'cv-eliminados-lista' }, cuentas.map(c => {
      const mensaje = h.caja();
      return el('li', { class: 'cv-eliminado' },
        el('a', { class: 'cv-eliminado-nombre', href: `#alumno/${c.id}` }, el('strong', { texto: c.nombreVisible }), el('span', { class: 'suave chica', texto: `@${c.nombre}` })),
        el('span', { class: 'suave chica', texto: c.por ? t('cv.eliminados.por', { fecha: h.fecha(c.eliminadoEn), por: c.por }) : t('cv.eliminados.linea', { fecha: h.fecha(c.eliminadoEn) }) }),
        el('div', { class: 'botones' }, accionesCuenta(h, { id: c.id, nombre: c.nombre, nombreVisible: c.nombreVisible, eliminado: { en: c.eliminadoEn } }, mensaje)),
        mensaje);
    })) : el('p', { class: 'suave', texto: t('cv.eliminados.vacio') }));
  });
  return nodo;
}

// ---------- 0.13.5: «Cómo van todos» ----------
// Lógica pura (test/como-van.test.js): el orden de la lista (igual que en el servidor).
export const ORDENES_COMO_VAN = Object.freeze(['en_linea', 'nota', 'avance']);
export function ordenarComoVan(lista, orden = 'en_linea') {
  const nombre = a => String(a.nombreVisible || a.nombre || '').toLocaleLowerCase('es');
  const porNombre = (a, b) => nombre(a).localeCompare(nombre(b), 'es') || a.id - b.id;
  const comparar = {
    en_linea: (a, b) => Number(b.enLinea) - Number(a.enLinea) || String(b.ultimaActividad ?? '').localeCompare(String(a.ultimaActividad ?? '')) || porNombre(a, b),
    nota: (a, b) => (b.examenes.general?.pct ?? 0) - (a.examenes.general?.pct ?? 0) || (b.examenes.promedio ?? -1) - (a.examenes.promedio ?? -1) || porNombre(a, b),
    avance: (a, b) => b.avance.pct - a.avance.pct || b.clases.pctAcierto - a.clases.pctAcierto || porNombre(a, b),
  }[ORDENES_COMO_VAN.includes(orden) ? orden : 'en_linea'];
  return [...lista].sort(comparar);
}

// → { nodo, actualizar(enLinea) }: actualizar pinta solo quién está en línea (lo que se pide cada 30 s), sin redibujar.
export function vistaComoVan(datos, h, { orden: ordenInicial = 'en_linea', alOrdenar = null } = {}) {
  const { el, t, tn, numero } = h;
  let orden = ORDENES_COMO_VAN.includes(ordenInicial) ? ordenInicial : 'en_linea';
  const lista = datos.alumnos.map(a => ({ ...a }));
  const tarjetas = new Map();
  const estados = new Map();
  const tarjeta = a => {
    const estado = el('span', { class: 'cv-estado-texto', texto: estadoLinea(h, a) });
    const punto = el('span', { class: `punto-linea${a.enLinea ? ' en-linea' : ''}`, 'aria-hidden': 'true' });
    estados.set(a.id, { estado, punto });
    const examenes = [...a.examenes.materias, ...a.examenes.oral];
    const clases = a.clases.materias.filter(m => m.respuestas || m.temasAprobados);
    // 0.13.8: la tarjeta ya no es un enlace entero (adentro van «Ver cada materia» y el menú de la cuenta): el nombre lleva a su ficha.
    const nodo = el('article', { class: `cv-alumno${a.enLinea ? ' en-linea' : ''}`, 'data-alumno': String(a.id) },
      el('a', { class: 'cv-quien', href: `#alumno/${a.id}`, 'aria-label': `${nombreDe(a)} · ${t('cv.ver_ficha')}` },
        h.dibujarAvatar(a.avatar, { nombre: nombreDe(a), tamano: 'medio' }),
        el('div', { class: 'cv-quien-texto' },
          el('strong', { class: 'cv-nombre', texto: nombreDe(a) }),
          el('span', { class: 'cv-estado' }, punto, estado),
          el('span', { class: 'cv-ver-ficha con-icono-chico' }, el('span', { texto: t('cv.ver_ficha') }), h.icono('flecha', 'icono chico')),
          a.activo ? null : h.insignia('mal', t('admin.inactivo')))),
      el('div', { class: 'cv-col cv-col-avance' }, bloqueAvance(h, a.avance, a.plan)),
      el('div', { class: 'cv-col cv-col-examenes' },
        el('h3', { class: 'cv-titulo', texto: t('cv.examenes') }),
        bloqueNotaGeneral(h, a.examenes.general),
        examenes.length ? el('ul', { class: 'cv-examenes' }, examenes.map(x => chipExamen(h, x))) : el('p', { class: 'suave', texto: t('cv.examenes.vacio') })),
      el('div', { class: 'cv-col cv-col-clases' },
        el('h3', { class: 'cv-titulo', texto: t('cv.clases') }),
        el('p', { class: 'cv-clases-total' },
          el('strong', { texto: t('cv.temas', { n: numero(a.clases.temasAprobados), total: numero(a.clases.temas) }) }),
          el('span', { texto: a.clases.respuestas ? t('cv.aciertos', { pct: h.pctTexto(a.clases.pctAcierto) }) : t('cv.clases.vacio') })),
        clases.length ? el('ul', { class: 'cv-clases' }, clases.map(m => filaClase(h, m))) : null),
      el('div', { class: 'cv-col cv-col-tiempo' },
        el('h3', { class: 'cv-titulo', texto: t('cv.tiempo') }),
        el('p', { class: 'cv-tiempo' }, el('strong', { texto: minutos(h, a.tiempo.minutos) }), el('span', { class: 'suave chica', texto: t('cv.tiempo.total') })),
        el('p', { class: 'cv-tiempo' }, el('strong', { texto: minutos(h, a.tiempo.semana) }), el('span', { class: 'suave chica', texto: t('cv.tiempo.semana') })),
        lineasDeActividad(h, a.detalles)),
      el('div', { class: 'cv-pie' },
        bloqueCadaMateria(h, a.cadaMateria, a.cadaOral, a.detalles),
        menuCuenta(h, a)));
    tarjetas.set(a.id, nodo);
    return nodo;
  };
  lista.forEach(tarjeta);
  const zona = el('div', { class: 'cv-lista' });
  const cuenta = el('p', { class: 'cv-resumen', role: 'status' });
  const pintarCuenta = () => {
    const n = lista.filter(a => a.enLinea).length;
    cuenta.replaceChildren(el('strong', { texto: tn('cv.resumen.alumnos', { n: lista.length }) }), el('span', { texto: ' · ' }),
      el('span', { class: `punto-linea${n ? ' en-linea' : ''}`, 'aria-hidden': 'true' }), el('span', { texto: ` ${t('cv.resumen.en_linea', { n: numero(n) })}` }));
  };
  const pintar = () => zona.replaceChildren(...ordenarComoVan(lista, orden).map(a => tarjetas.get(a.id)));
  const botones = ORDENES_COMO_VAN.map(id => el('button', { type: 'button', class: 'ficha-filtro', 'data-orden': id, 'aria-pressed': String(id === orden), texto: t(`cv.orden.${id}`),
    onclick: () => { orden = id; botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.orden === orden))); pintar(); alOrdenar?.(orden); } }));
  pintarCuenta();
  pintar();
  // Los exámenes que alguien ya hizo: «Comparar» (quién sacó cuánto y qué pregunta falló cada uno).
  const conExamen = datos.materias.filter(id => lista.some(a => a.examenes.materias.some(x => x.id === id)));
  const nodo = el('section', { class: 'tarjeta como-van' },
    el('h2', { class: 'con-icono' }, h.icono('grafica'), el('span', { texto: t('cv.titulo') })),
    cuenta,
    lista.length ? el('div', { class: 'ficha-filtros', role: 'group', 'aria-label': t('cv.orden') }, el('span', { class: 'suave chica', texto: t('cv.orden') }), botones) : null,
    conExamen.length ? el('div', { class: 'cv-comparar' }, el('span', { class: 'suave chica', texto: t('cv.comparar_examen') }),
      conExamen.map(id => el('a', { class: 'cv-comparar-enlace', href: `#comparar-examen/${encodeURIComponent(id)}`, texto: h.nombreMateria(id) }))) : null,
    lista.length ? el('div', { class: 'cv-cabeza-tabla', 'aria-hidden': 'true' },
      el('span', { texto: t('cv.col.alumno') }), el('span', { texto: t('cv.avance') }), el('span', { texto: t('cv.examenes') }), el('span', { texto: t('cv.clases') }), el('span', { texto: t('cv.tiempo') })) : null,
    lista.length ? zona : h.vacio('personas', t('cv.vacio')),
    el('p', { class: 'suave chica', texto: t('cv.nota') }),
    // 0.13.8: los eliminados (plegado), para recuperarlos.
    listaEliminados(h));
  const actualizar = d => {
    for (const x of d?.alumnos ?? []) {
      const a = lista.find(y => y.id === x.id);
      if (!a) continue;
      a.enLinea = x.enLinea;
      a.ultimaActividad = x.ultimaActividad;
      const e = estados.get(a.id);
      e.estado.textContent = estadoLinea(h, a);
      e.punto.classList.toggle('en-linea', Boolean(a.enLinea));
      tarjetas.get(a.id).classList.toggle('en-linea', Boolean(a.enLinea));
    }
    pintarCuenta();
    if (orden === 'en_linea') pintar();
  };
  return { nodo, actualizar };
}

// ---------- 0.13.5: «Comparar un examen» (el de una materia) ----------
export function vistaCompararExamen(d, h) {
  const { el, t, tn, numero } = h;
  const nombre = h.nombreMateria(d.materia);
  const total = d.alumnos.length;
  const alumnos = d.alumnos.length ? el('ul', { class: 'cv-notas' }, d.alumnos.map(a => el('li', {},
    el('a', { class: `cv-nota-fila cv-${tonoExamen(a)}`, href: `#alumno/${a.id}/intento/${a.ultimoIntento}` },
      el('span', { class: 'cv-nombre', texto: a.nombre }),
      el('strong', { class: 'cv-examen-mejor', texto: h.pctTexto(a.mejor) }),
      el('span', { class: 'cv-examen-ultima', texto: t('cv.ultima', { pct: h.pctTexto(a.ultima) }) }),
      el('span', { class: 'cv-examen-estado', texto: `${t(a.aprobado ? 'cv.aprobado' : 'cv.no_aprobado')} · ${tn('cv.veces', { n: a.intentos })}` }))))) : h.vacio('libro', t('examenes.sin_intentos'));
  const tonoFallas = (n, de) => (!n ? 'bien' : n * 2 >= de ? 'mal' : 'atencion');
  const temas = d.temas.length ? el('ul', { class: 'cv-temas-fallas' }, d.temas.map(x => el('li', { class: `cv-${tonoFallas(x.alumnos, total)}` },
    el('span', { class: 'cv-clase-nombre', texto: h.partirTitulo(x.titulo).es }),
    el('strong', { texto: tn('cv.fallas', { n: x.fallos }) }),
    el('span', { class: 'suave chica', texto: t('cv.fallas.alumnos', { n: numero(x.alumnos), total: numero(total) }) })))) : null;
  const pregunta = q => {
    const letra = op => el('span', { class: 'opcion-letra', texto: op.letra });
    return el('li', { class: `cv-pregunta cv-${tonoFallas(q.fallaron.length, q.respondieron)}` },
      el('details', {},
        el('summary', {},
          el('span', { class: 'cv-pregunta-n', texto: q.numero ? t('acad.pregunta_n', { n: q.numero }) : t('cv.pregunta') }),
          el('strong', { class: 'cv-pregunta-fallas', texto: q.fallaron.length ? t('cv.fallaron', { n: numero(q.fallaron.length), total: numero(q.respondieron) }) : t('cv.nadie_fallo') }),
          q.temaTitulo ? el('span', { class: 'suave chica cv-pregunta-tema', texto: h.partirTitulo(q.temaTitulo).es }) : null),
        q.falta ? el('p', { class: 'aviso', texto: t('ficha.p.falta', { id: q.id }) }) : [
          h.talCual('p', q.enunciado, 'cv-enunciado'),
          el('ul', { class: 'ficha-opciones' }, q.opciones.map(op => el('li', { class: op.letra === q.correcta ? 'es-correcta' : null },
            letra(op), h.talCual('span', op.texto, 'opcion-texto'),
            op.letra === q.correcta ? el('span', { class: 'ficha-opcion-sellos' }, el('span', { class: 'ficha-sello correcta', texto: t('ficha.p.correcta') })) : null))),
        ],
        q.fallaron.length ? el('div', { class: 'cv-quienes' },
          el('h4', { texto: t('cv.quienes') }),
          el('ul', {}, q.fallaron.map(f => el('li', {},
            el('a', { href: `#alumno/${f.id}/intento/${f.intento}`, texto: f.nombre }),
            el('span', { class: 'suave', texto: ` ${t('cv.eligio', { letra: f.elegida })}` })))))
          : el('p', { class: 'mensaje bien', texto: t('cv.nadie_fallo') })));
  };
  return [
    el('a', { class: 'volver con-icono', href: '#como-van' }, h.icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('cv.volver') })),
    el('h1', { class: 'titulo-pantalla', texto: t('cv.examen.titulo', { materia: nombre }) }),
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('trofeo'), el('span', { texto: t('cv.examen.notas') })),
      el('p', { class: 'suave chica', texto: t('cv.examen.notas.linea') }),
      alumnos),
    temas ? el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('bandera'), el('span', { texto: t('cv.examen.temas') })),
      temas) : null,
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('atencion'), el('span', { texto: t('cv.examen.preguntas') })),
      el('p', { class: 'suave chica', texto: t('cv.examen.preguntas.linea') }),
      d.preguntas.length ? h.verMas(el('ol', { class: 'cv-preguntas' }), d.preguntas.map(pregunta), 15) : el('p', { class: 'suave', texto: t('examenes.sin_intentos') })),
  ];
}

// «Falló en: Hipoxia (3), Ilusiones (1)»: los temas donde se equivocó en un intento, de más a menos.
export function fallasPorTema(preguntas) {
  const m = new Map();
  for (const q of preguntas) {
    if (!q.respuesta || q.respuesta.acierto) continue;
    const clave = q.tema ?? '';
    if (!m.has(clave)) m.set(clave, { tema: q.tema ?? null, titulo: q.temaTitulo ?? null, fallos: 0 });
    m.get(clave).fallos += 1;
  }
  return [...m.values()].sort((a, b) => b.fallos - a.fallos || String(a.titulo ?? '').localeCompare(String(b.titulo ?? ''), 'es'));
}
