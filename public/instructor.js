// Academia 0.9.0: las pantallas del «Instructor» (sin librerías; todo texto con textContent, nunca como código).
// app.js le pasa sus ayudas (el, t, icono, api…) y usa lo que devuelve en sus pantallas:
//  - insignia(estado): «Instructor: modo básico (sin IA)» / «Instructor con IA» / «Instructor IA en espera».
//  - enInicio(): la tarjeta «Tu instructor dice…» con UN siguiente paso (y el consejo de la semana con IA).
//  - alEmpezarTema(materia, tema): el consejo del tema y «¿Tienes una duda?».
//  - explicar(intentoId, q): «Explícamelo de otra forma» (la pregunta y sus opciones quedan TAL CUAL arriba: esto
//    solo agrega una explicación aparte, del paquete o de la IA, marcada como tal).
//  - consejoExamen(intentoId): el consejo después de un examen.
//  - tarjetaAdmin(s, cambiar): encender el instructor con IA y elegir su modelo (Administrador → Inteligencia artificial).
// Lo que escribe la IA siempre va en su propia caja «Tu instructor IA», nunca mezclado con lo del Test Guide.

const ESPERA_MS = 2000;
const ESPERA_MAXIMA_MS = 120_000;

export function crearInstructor(h) {
  const { el, t, tn, icono, api, talCual, sonar, empezarIntento, numero, textoError } = h;
  const tx = (clave, vars = {}) => t(clave, vars);

  // ---------- ¿Te sigue un instructor con IA? ----------
  function insignia(estado, { compacta = false } = {}) {
    const modo = estado?.modo === 'ia' ? 'ia' : estado?.modo === 'espera' ? 'espera' : 'basico';
    const nodo = el('span', { class: `insignia-instructor modo-${modo}`, title: tx(`instr.modo.${modo}.ayuda`) },
      icono(modo === 'ia' ? 'chispa' : 'cerebro', 'icono chico'), el('span', { texto: tx(`instr.modo.${modo}${compacta ? '.corto' : ''}`) }));
    return nodo;
  }
  function motivoTexto(motivo) {
    const clave = `instr.motivo.${motivo}`;
    const texto = t(clave);
    return texto === clave ? t('instr.motivo.no_disponible') : texto;
  }

  // El botón de una acción del consejo (empezar una práctica, abrir un tema o el examen).
  function botonAccion(accion, clase = 'boton-3d naranja chico') {
    if (!accion) return null;
    const etiqueta = accion.tipo === 'intento' ? tx(`instr.accion.${accion.datos?.tipo ?? 'instructor'}`) : tx(`instr.accion.${accion.tipo}`);
    if (accion.tipo === 'tema') return el('a', { class: clase, href: `#tema/${encodeURIComponent(accion.materia)}/${encodeURIComponent(accion.tema)}` }, el('span', { texto: etiqueta }));
    if (accion.tipo === 'examen') return el('a', { class: clase, href: `#examen/${encodeURIComponent(accion.materia)}` }, el('span', { texto: etiqueta }));
    return el('button', { type: 'button', class: clase, onclick: evento => { sonar?.('toque'); empezarIntento(accion.datos, evento.currentTarget); } }, el('span', { texto: etiqueta }));
  }
  const textoConsejo = c => (c ? tx(`instr.c.${c.clave}`, c.vars ?? {}) : '');

  // Lo que escribió la IA (consejo, explicación o duda): en su propia caja, con quién lo escribió.
  function cajaIa(r, partes) {
    return el('section', { class: 'caja-hoja caja-ia' },
      el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx('instr.ia.titulo') })),
      partes,
      Array.isArray(r.terminos) && r.terminos.length ? el('ul', { class: 'lista-terminos' }, r.terminos.map(x => el('li', {},
        el('strong', { lang: 'en', texto: x.ingles }), x.abreviatura ? el('span', { class: 'termino-abrev', texto: ` (${x.abreviatura})` }) : null,
        x.espanol ? el('span', { texto: ` · ${x.espanol}` }) : null))) : null,
      el('p', { class: 'suave chica', texto: tx('instr.ia.firma', { modelo: nombreModelo(r.modelo) }) }));
  }
  const nombreModelo = m => (m === 'claude-sonnet-5-5' ? 'Claude Sonnet 5.5' : m === 'claude-haiku-5-5' ? 'Claude Haiku 5.5' : m || 'IA');

  // Pregunta por una tarea de la IA hasta que llega (o se rinde). alListo(datos) con { estado: 'lista' | 'no', … }.
  function esperarTarea(id, nodo, alListo) {
    const inicio = Date.now();
    const vuelta = async () => {
      if (!nodo.isConnected) return;
      const r = await api('GET', `/api/academia/instructor/tareas/${encodeURIComponent(id)}`);
      if (!nodo.isConnected) return;
      if (r.ok && r.datos.estado === 'pendiente' && Date.now() - inicio < ESPERA_MAXIMA_MS) { setTimeout(vuelta, ESPERA_MS); return; }
      alListo(r.ok && r.datos.estado !== 'pendiente' ? r.datos : { estado: 'no', motivo: r.ok ? 'caducada' : r.datos.error });
    };
    setTimeout(vuelta, ESPERA_MS);
  }
  function escribiendo() {
    return el('p', { class: 'instructor-escribiendo con-icono', role: 'status' }, icono('chispa', 'icono chico'), el('span', { texto: tx('instr.ia.escribiendo') }));
  }
  // El lugar donde aparece lo de la IA: «escribiendo…», lo que escribió, o por qué no (y sigue lo básico).
  function lugarIa(ia, pintar) {
    const lugar = el('div', { class: 'lugar-ia', 'aria-live': 'polite' });
    const poner = d => {
      if (d?.estado === 'lista') lugar.replaceChildren(pintar(d));
      else if (d?.estado === 'no') lugar.replaceChildren(el('p', { class: 'suave chica con-icono' }, icono('info', 'icono chico'), el('span', { texto: tx('instr.ia.no', { motivo: motivoTexto(d.motivo) }) })));
      else lugar.replaceChildren();
    };
    if (ia?.estado === 'pendiente') {
      lugar.replaceChildren(escribiendo());
      esperarTarea(ia.tarea, lugar, poner);
    } else poner(ia);
    return lugar;
  }

  // ---------- Inicio: «Tu instructor dice…» ----------
  function tarjetaInicio(d) {
    const consejo = d.consejo;
    const ia = d.instructor?.modo === 'ia';
    const zonaIa = el('div', { class: 'instructor-ia' });
    const pintarConsejoIa = r => cajaIa(r, [
      r.titulo ? talCual('p', r.titulo, 'fuerte') : null, talCual('p', r.consejo),
      r.pasos?.length ? el('ol', { class: 'instructor-pasos' }, r.pasos.map(p => talCual('li', p))) : null]);
    if (d.consejoIa?.estado === 'lista') zonaIa.append(pintarConsejoIa(d.consejoIa));
    else if (ia) {
      zonaIa.append(el('button', {
        type: 'button', class: 'boton-3d blanco chico con-icono',
        onclick: async evento => {
          const boton = evento.currentTarget;
          boton.disabled = true;
          const r = await api('POST', '/api/academia/instructor/consejo', {});
          if (!r.ok) { boton.disabled = false; return h.avisar?.(textoError(r.datos.error), 'mal'); }
          boton.replaceWith(lugarIa(r.datos.ia, pintarConsejoIa));
        },
      }, icono('chispa', 'icono chico'), el('span', { texto: tx('instr.ia.pedir_consejo') })));
    }
    return el('section', { class: 'panel instructor-tarjeta', 'aria-labelledby': 'instructor-titulo' },
      el('div', { class: 'instructor-cabeza' },
        el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('cerebro')),
        el('div', {},
          el('h2', { id: 'instructor-titulo', texto: tx('instr.titulo') }),
          insignia(d.instructor))),
      consejo ? talCual('p', textoConsejo(consejo), 'instructor-consejo') : null,
      consejo?.accion ? el('div', { class: 'instructor-accion' }, botonAccion(consejo.accion)) : null,
      d.observaciones?.length ? el('ul', { class: 'instructor-notas' }, d.observaciones.map(o => el('li', { class: 'con-icono' },
        icono('ojo', 'icono chico'), talCual('span', tx(`instr.o.${o.clave}`, { ...o.vars, franja: o.vars?.franja ? tx(`instr.franja.${o.vars.franja}`) : '' }))))) : null,
      zonaIa);
  }
  // Pone la tarjeta en su lugar cuando llega (Inicio ya se dibujó: no lo hace esperar).
  function enInicio() {
    const lugar = el('div', { class: 'instructor-lugar' });
    api('GET', '/api/academia/instructor').then(r => {
      if (!lugar.isConnected || !r.ok) return;
      lugar.replaceChildren(tarjetaInicio(r.datos));
    });
    return lugar;
  }

  // ---------- Al empezar un tema: el consejo del tema y «¿Tienes una duda?» ----------
  function alEmpezarTema(materia, tema) {
    const lugar = el('div', { class: 'instructor-tema' });
    api('GET', `/api/academia/instructor?materia=${encodeURIComponent(materia)}&tema=${encodeURIComponent(tema)}`).then(r => {
      if (!lugar.isConnected || !r.ok) return;
      const c = r.datos.consejo;
      lugar.replaceChildren(el('aside', { class: 'instructor-mini' },
        el('div', { class: 'instructor-mini-cabeza' }, icono('cerebro', 'icono chico'), el('strong', { texto: tx('instr.titulo') }), insignia(r.datos.instructor, { compacta: true })),
        c ? talCual('p', textoConsejo(c)) : null,
        c?.accion ? botonAccion(c.accion, 'boton-3d blanco chico') : null));
    });
    return lugar;
  }
  function cajaDuda(materia, tema) {
    const area = el('textarea', { rows: 2, maxlength: 500, 'aria-label': tx('instr.duda.etiqueta'), placeholder: tx('instr.duda.ejemplo') });
    const salida = el('div', { class: 'duda-salida', 'aria-live': 'polite' });
    const boton = el('button', {
      type: 'button', class: 'boton-3d azul chico',
      onclick: async () => {
        const texto = area.value.trim();
        if (texto.length < 3) return area.focus();
        boton.disabled = true;
        const r = await api('POST', '/api/academia/instructor/duda', { materia, tema, texto });
        boton.disabled = false;
        if (!r.ok) return salida.replaceChildren(el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }));
        const b = r.datos.basica;
        salida.replaceChildren(
          b.tarjeta ? el('section', { class: 'caja-hoja' },
            el('h3', { class: 'con-icono' }, icono('tarjetas', 'icono chico'), el('span', { texto: tx('instr.duda.tarjeta', { titulo: b.tarjeta.titulo }) })),
            tarjetaCompleta(b.tarjeta)) : el('p', { class: 'suave', texto: tx('instr.duda.sin_tarjeta') }),
          lugarIa(r.datos.ia, x => cajaIa(x, [talCual('p', x.respuesta), x.enMaterial ? null : el('p', { class: 'suave chica', texto: tx('instr.duda.fuera') })])));
      },
    }, el('span', { texto: tx('instr.duda.boton') }));
    return el('details', { class: 'instructor-duda' },
      el('summary', { class: 'con-icono' }, icono('info', 'icono chico'), el('span', { texto: tx('instr.duda.titulo') })),
      el('p', { class: 'suave chica', texto: tx('instr.duda.linea') }), area, boton, salida);
  }
  function tarjetaCompleta(x) {
    return [
      x.texto ? talCual('p', x.texto) : null,
      x.puntos?.length ? el('ul', { class: 'lista-puntos' }, x.puntos.map(p => talCual('li', p))) : null,
      x.recuerda ? el('p', { class: 'recuerda-linea' }, el('strong', { texto: `${tx('acad.recuerda')}: ` }), talCual('span', x.recuerda)) : null,
    ];
  }

  // ---------- «Explícamelo de otra forma» ----------
  function explicar(intentoId, q) {
    const lugar = el('div', { class: 'instructor-explica' });
    const boton = el('button', {
      type: 'button', class: 'boton-3d blanco chico con-icono boton-explicar',
      onclick: async () => {
        boton.disabled = true;
        const r = await api('POST', '/api/academia/instructor/explicar', { intento: Number(intentoId), pregunta: q.id, ia: true });
        if (!r.ok) { boton.disabled = false; return h.avisar?.(textoError(r.datos.error), 'mal'); }
        sonar?.('toque');
        boton.remove();
        lugar.replaceChildren(vistaExplicacion(r.datos));
      },
    }, icono('cerebro', 'icono chico'), el('span', { texto: tx('instr.explicar') }));
    lugar.append(boton);
    return lugar;
  }
  function vistaExplicacion(d) {
    const b = d.basica;
    const pasos = b.estilo === 'paso_a_paso';
    const partes = [
      el('div', { class: 'instructor-mini-cabeza' }, icono('cerebro', 'icono chico'), el('strong', { texto: tx('instr.explica.titulo') }), insignia(d.instructor, { compacta: true })),
      b.veces >= 2 ? el('p', { class: 'aviso chica', texto: tx('instr.explica.repetida', { n: numero(b.veces) }) }) : null,
      el(pasos ? 'ol' : 'div', { class: pasos ? 'instructor-pasos' : 'instructor-bloques' },
        el(pasos ? 'li' : 'p', {}, el('strong', { texto: `${tx('instr.explica.correcta')} ` }), talCual('span', b.correcta)),
        !b.acierto && b.elegidaTexto ? el(pasos ? 'li' : 'p', {}, el('strong', { texto: `${tx('instr.explica.elegiste')} ` }), talCual('span', b.elegidaTexto)) : null,
        b.idea ? el(pasos ? 'li' : 'p', {}, el('strong', { texto: `${tx('instr.explica.idea')} ` }), talCual('span', b.idea)) : null,
        b.trampa ? el(pasos ? 'li' : 'p', {}, el('strong', { texto: `${tx('reto.trampa')}: ` }), talCual('span', b.trampa)) : null,
        el(pasos ? 'li' : 'p', {}, el('strong', { texto: `${tx(b.estilo === 'ejemplo' ? 'instr.explica.despacio' : 'instr.explica.facil')} ` }), talCual('span', b.sencilla))),
      b.tarjeta ? el('details', { class: 'instructor-tarjeta-lectura', open: !b.acierto },
        el('summary', { class: 'con-icono' }, icono('tarjetas', 'icono chico'), el('span', { texto: tx('instr.explica.tarjeta', { titulo: b.tarjeta.titulo }) })),
        tarjetaCompleta(b.tarjeta)) : null,
      lugarIa(d.ia, r => cajaIa(r, [
        talCual('p', r.explicacion),
        r.porQueNo ? el('p', {}, el('strong', { texto: `${tx(b.acierto ? 'instr.ia.trampas' : 'instr.ia.por_que_no')} ` }), talCual('span', r.porQueNo)) : null,
        r.recuerda ? el('p', { class: 'recuerda-linea' }, el('strong', { texto: `${tx('acad.recuerda')}: ` }), talCual('span', r.recuerda)) : null,
        el('p', { class: 'suave chica', texto: tx('instr.ia.test_guide') })])),
    ];
    return el('section', { class: 'caja-hoja caja-instructor' }, partes);
  }

  // ---------- El consejo después de un examen ----------
  function consejoExamen(intentoId) {
    const lugar = el('div', { class: 'instructor-examen' });
    const boton = el('button', {
      type: 'button', class: 'boton-3d blanco con-icono',
      onclick: async () => {
        boton.disabled = true;
        const r = await api('POST', '/api/academia/instructor/consejo', { examen: Number(intentoId) });
        if (!r.ok) { boton.disabled = false; return h.avisar?.(textoError(r.datos.error), 'mal'); }
        boton.remove();
        lugar.replaceChildren(el('section', { class: 'panel caja-instructor' },
          el('div', { class: 'instructor-mini-cabeza' }, icono('cerebro', 'icono chico'), el('strong', { texto: tx('instr.titulo') }), insignia(r.datos.instructor, { compacta: true })),
          r.datos.consejo ? talCual('p', textoConsejo(r.datos.consejo)) : null,
          r.datos.consejo?.accion ? botonAccion(r.datos.consejo.accion) : null,
          lugarIa(r.datos.ia, x => cajaIa(x, [x.titulo ? talCual('p', x.titulo, 'fuerte') : null, talCual('p', x.consejo),
            x.pasos?.length ? el('ol', { class: 'instructor-pasos' }, x.pasos.map(p => talCual('li', p))) : null]))));
      },
    }, icono('cerebro', 'icono chico'), el('span', { texto: tx('instr.examen.boton') }));
    lugar.append(boton);
    return lugar;
  }

  // ---------- Administrador: el instructor con IA ----------
  function tarjetaAdmin(s, { cambiar, caja, interruptor, usd }) {
    const mensaje = caja();
    const modelos = Array.isArray(s.modelosInstructor) ? s.modelosInstructor : [];
    const alumnos = el('div', { class: 'instructor-alumnos' });
    api('GET', '/api/admin/academia/instructor').then(r => {
      if (!alumnos.isConnected || !r.ok) return;
      const lista = r.datos.alumnos.filter(a => a.rol !== 'admin');
      const conIa = lista.filter(a => a.modo === 'ia').length;
      alumnos.replaceChildren(
        el('p', { class: 'fuerte', texto: tx('instr.admin.alumnos', { si: numero(conIa), total: numero(lista.length) }) }),
        el('ul', { class: 'lista-simple' }, lista.map(a => el('li', {}, el('span', { texto: `${a.nombre} · ` }), insignia(a, { compacta: true }),
          a.modo !== 'ia' && a.motivo && a.motivo !== 'ok' ? el('span', { class: 'suave chica', texto: ` ${motivoTexto(a.motivo)}` }) : null))));
    });
    return el('section', { class: 'tarjeta tarjeta-instructor-admin' },
      el('h2', { class: 'con-icono titulo-tarjeta' }, icono('cerebro', 'icono grande'), el('span', { texto: tx('instr.admin.titulo') })),
      el('p', { texto: tx('instr.admin.linea') }),
      interruptor(tx('instr.admin.encender'), s.instructorIa === true, boton => cambiar(boton, mensaje, '/api/admin/ia/ajustes', { instructorIa: !s.instructorIa }, null)),
      !s.encendida ? el('p', { class: 'suave', texto: tx('instr.admin.ia_apagada') }) : null,
      el('fieldset', { class: 'modelos-instructor' },
        el('legend', { texto: tx('instr.admin.modelo') }),
        modelos.map(m => el('label', { class: 'opcion-radio' },
          el('input', { type: 'radio', name: 'instructor-modelo', value: m.modelo, checked: s.instructorModelo === m.modelo, disabled: !m.confirmado,
            onchange: evento => cambiar(evento.currentTarget, mensaje, '/api/admin/ia/ajustes', { instructorModelo: m.modelo }, null) }),
          el('span', { texto: tx(`instr.admin.modelo.${m.modelo === 'claude-sonnet-5-5' ? 'sonnet' : 'haiku'}`, { entrada: m.precio ? `US$${m.precio.entradaUsd}` : '—', salida: m.precio ? `US$${m.precio.salidaUsd}` : '—' }) })))),
      el('p', { class: 'suave', texto: tx('instr.admin.tipico', { monto: usd(s.tipicoInstructorMicro) }) }),
      el('details', { class: 'en-palabras' },
        el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: tx('instr.admin.como') })),
        el('p', { texto: tx('instr.admin.como.1') }), el('p', { texto: tx('instr.admin.como.2') }), el('p', { texto: tx('instr.admin.como.3') })),
      alumnos,
      mensaje);
  }

  return Object.freeze({ insignia, enInicio, alEmpezarTema, cajaDuda, explicar, consejoExamen, tarjetaAdmin, tarjetaInicio, vistaExplicacion });
}
