// Academia 0.9.0: las pantallas del «Instructor» (sin librerías; todo texto con textContent, nunca como código).
// app.js le pasa sus ayudas (el, t, icono, api…) y usa lo que devuelve en sus pantallas:
//  - insignia(estado): «Instructor: modo básico (sin IA)» / «Instructor con IA» / «Instructor IA en espera».
//  - enInicio(): la tarjeta «Tu instructor dice…» con UN siguiente paso (y el consejo de la semana con IA).
//  - cajaDuda(materia, tema): «¿Tienes una duda?» al final de un tema.
//  - explicar(intentoId, q): «Explícamelo de otra forma» (la pregunta y sus opciones quedan TAL CUAL arriba: esto
//    solo agrega una explicación aparte, del paquete o de la IA, marcada como tal).
//  - consejoExamen(intentoId): el consejo después de un examen.
//  - tarjetaAdmin(s, cambiar): encender el instructor con IA y elegir su modelo (Administrador → Inteligencia artificial).
// Lo que escribe la IA siempre va en su propia caja «Tu instructor IA», nunca mezclado con lo del Test Guide.

const ESPERA_MS = 2000;
const ESPERA_MAXIMA_MS = 120_000;

export function crearInstructor(h) {
  const { el, t, tn, icono, api, talCual, sonar, empezarIntento, numero, textoError } = h;
  const nombreMateria = id => (h.nombreMateria ? h.nombreMateria(id) : id);
  const tx = (clave, vars = {}) => t(clave, vars);
  // 0.12.2: append() escribe «null» si le llega un null (se veía «null» junto a «HACERLO AHORA»): solo lo que existe.
  const anexar = (nodo, ...hijos) => nodo.append(...hijos.filter(x => x != null && x !== false));

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
      el('p', { class: 'suave chica', texto: tx('instr.ia.firma') }));
  }

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
      else if (d?.estado === 'no' && d.motivo === 'sin_minutos') lugar.replaceChildren(sinMinutos());
      else if (d?.estado === 'no') lugar.replaceChildren(el('p', { class: 'suave chica con-icono' }, icono('info', 'icono chico'), el('span', { texto: tx('instr.ia.no', { motivo: motivoTexto(d.motivo) }) })));
      else lugar.replaceChildren();
    };
    if (ia?.estado === 'pendiente') {
      lugar.replaceChildren(escribiendo());
      esperarTarea(ia.tarea, lugar, poner);
    } else poner(ia);
    return lugar;
  }

  // 0.10.0: se acabó su tiempo con IA: sigue el básico (gratis) o pide más.
  function sinMinutos() {
    return el('div', { class: 'aviso-sin-minutos' },
      el('p', { class: 'con-icono' }, icono('reloj', 'icono chico'), el('span', { texto: tx('tiempo.agotado') })),
      el('a', { class: 'boton-3d naranja chico', href: '#tiempo-ia' }, el('span', { texto: tx('tiempo.pedir_mas') })));
  }
  // «Te quedan 12 min de instructor IA» (solo si el dueño encendió el instructor con IA).
  function medidorTiempo(tiempo, { conBoton = true } = {}) {
    if (!tiempo?.activo) return null;
    if (tiempo.ilimitado) return el('p', { class: 'medidor-tiempo ilimitado con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx('tiempo.ilimitado') }));
    const poco = tiempo.minutos < Math.max(3, tiempo.porUso * 3);
    return el('div', { class: `medidor-tiempo${poco ? ' poco' : ''}` },
      el('p', { class: 'con-icono' }, icono('reloj', 'icono chico'), el('strong', { texto: tx('tiempo.quedan', { n: numero(tiempo.minutos) }) })),
      conBoton ? el('a', { class: 'enlace-tiempo', href: '#tiempo-ia', texto: tx('tiempo.pedir_mas') }) : null);
  }

  // ---------- 0.10.0: el plan de refuerzo (sus fallas registradas) ----------
  const lugarDe = f => `${nombreMateria(f.materia)} → ${f.temaTitulo}`;
  // «Lo que hicimos por ti»: una falla en frases (lo que pasó, lo que hicimos, cómo va).
  // 0.12.2: un concepto (más de 2 errores en cosas de un mismo punto) va a «Mi repaso»; las de antes dicen lo de antes.
  // 0.12.2: lo principal, corto y para hacer: «Repasa: <punto> · Tema <n> <tema>» con su botón (la mini-clase en «Mi
  // repaso»). El porqué (las veces, la idea equivocada, lo que hicimos) va plegado en «¿Por qué me equivoqué?».
  const lineaRepasa = f => tx(f.temaNumero ? 'repasa.linea' : 'repasa.linea_sin_numero', { concepto: f.concepto || f.tarjeta || f.temaTitulo || '', n: numero(f.temaNumero ?? 0), tema: f.temaTitulo ?? '' });
  const aMiniClase = clave => (clave ? `#mi-repaso/clase/${String(clave).replace(/^c:/, '')}` : '#mi-repaso');
  function frasesFalla(f, { conBoton = true } = {}) {
    const concepto = f.origen === 'concepto';
    const hecho = concepto ? [tx('hicimos.miniclase'), tx('hicimos.seguimos_concepto', { aciertos: numero(f.meta.aciertos) })] : [
      f.tarjeta ? tx('hicimos.tarjeta', { tarjeta: f.tarjeta }) : null,
      f.extras ? tx('hicimos.extras', { n: numero(f.extras) }) : null,
      tx('hicimos.seguimos', { aciertos: numero(f.meta.aciertos), dias: numero(f.meta.dias) }),
    ].filter(Boolean);
    // (una de antes por debajo del umbral de ahora queda en el historial: sin botón, sin «para repasar»)
    const viva = f.estado !== 'superada' && f.cuenta !== false;
    return el('li', { class: `falla falla-${f.estado}` },
      el('p', { class: 'fuerte' }, talCual('span', viva ? lineaRepasa(f) : `${f.concepto || f.temaTitulo} · ${lugarDe(f)}`)),
      el('p', { class: `falla-estado chica tono-${viva ? 'atencion' : 'bien'}`, texto: viva
        ? tx('hicimos.vas', { n: numero(f.aciertos), meta: numero(f.meta.aciertos), estado: tx(`falla.estado.${f.estado}`) })
        : f.estado === 'superada' ? tx('hicimos.superada', { n: numero(f.fallos), meta: numero(f.meta.aciertos) }) : tx('hicimos.historial') }),
      conBoton && viva ? el('a', { class: 'boton-3d blanco chico', href: aMiniClase(f.conceptoClave) }, el('span', { texto: tx('mirepaso.repasar') })) : null,
      el('details', { class: 'falla-porque' },
        el('summary', { texto: tx('repasa.por_que') }),
        el('p', { texto: concepto ? tx('hicimos.linea_concepto', { n: numero(f.fallos), concepto: f.concepto ?? '', lugar: lugarDe(f) })
          : tx(f.origen === 'examen' ? 'hicimos.linea_examen' : 'hicimos.linea', { n: numero(f.fallos), lugar: lugarDe(f), numero: f.numero ?? '' }) }),
        f.idea ? el('p', { class: 'suave' }, el('span', { texto: `${tx('hicimos.idea')} ` }), talCual('span', f.idea)) : null,
        el('p', {}, el('span', { texto: `${tx('hicimos.por_eso')} ` }), el('span', { texto: hecho.join('; ') + '.' }))));
  }
  function loQueHicimos({ titulo = tx('hicimos.titulo'), url = '/api/academia/instructor/fallas' } = {}) {
    const lugar = el('section', { class: 'panel lo-que-hicimos', 'aria-label': titulo }, el('h2', { class: 'con-icono' }, icono('cerebro'), el('span', { texto: titulo })));
    api('GET', url).then(r => {
      if (!lugar.isConnected || !r.ok) return;
      // (el administrador mira las de un alumno: sin el botón de repasar, que es del alumno)
      const conBoton = url === '/api/academia/instructor/fallas';
      lugar.append(r.datos.fallas.length ? el('ul', { class: 'lista-fallas' }, r.datos.fallas.map(f => frasesFalla(f, { conBoton }))) : el('p', { class: 'suave', texto: tx('hicimos.vacio') }));
    });
    return lugar;
  }
  // «Plan para pasar la próxima vez» (al no aprobar un tema o un examen): en qué falló, qué releer, qué practicar (las
  // preguntas del Test Guide), videos y cuándo volver a tomarlo. Con IA, además el consejo del instructor IA.
  function planParaPasar(res) {
    const lugar = el('section', { class: 'panel plan-pasar', 'aria-label': tx('plan.titulo') });
    api('GET', `/api/academia/instructor/plan/${encodeURIComponent(res.id)}`).then(r => {
      if (!lugar.isConnected || !r.ok) return;
      const d = r.datos;
      const enlace = v => el('a', { class: 'con-icono', href: v.url, target: '_blank', rel: 'noopener noreferrer' }, icono('video', 'icono chico'), el('span', { texto: v.titulo ?? tx('profesor.buscar', { texto: v.texto }) }));
      const otraVez = d.intento.tipo === 'examen' ? { href: `#examen/${encodeURIComponent(d.intento.materia)}` } : { datos: { tipo: d.intento.tipo, materia: d.intento.materia, tema: d.intento.tema } };
      anexar(lugar,
        el('h2', { class: 'con-icono' }, icono('cerebro'), el('span', { texto: tx('plan.titulo') })),
        el('p', { class: 'suave', texto: tx('plan.animo') }),
        el('h3', { texto: tx('plan.fallaste') }),
        el('ul', { class: 'lista-fallas' }, d.temas.map(x => el('li', { class: 'falla' },
          // 0.12.2: corto y para hacer: «Repasa: <punto> · Tema <n> <tema>»; las ideas equivocadas, plegadas.
          el('p', { class: 'fuerte' }, talCual('span', lineaRepasa({ concepto: x.tarjeta?.titulo || x.titulo, temaNumero: x.temaNumero, temaTitulo: x.titulo }))),
          el('p', { class: 'suave chica', texto: `${nombreMateria(x.materia)} · ${tx('plan.n_fallos', { n: numero(x.fallos) })}` }),
          x.ideas.length ? el('details', { class: 'falla-porque' }, el('summary', { texto: tx('repasa.por_que') }),
            x.ideas.map(i => el('p', { class: 'suave' }, el('span', { texto: `${tx('hicimos.idea')} ` }), talCual('span', i)))) : null,
          el('p', { class: 'fuerte', texto: tx('plan.estudiar') }),
          el('div', { class: 'botones' },
            // 0.12.2: releer = la mini-clase de ese punto, en «Mi repaso» (la clase normal no cambia).
            el('a', { class: 'boton-3d naranja chico', href: x.concepto ? `#mi-repaso/clase/${String(x.concepto).replace(/^c:/, '')}` : '#mi-repaso' }, el('span', { texto: x.tarjeta ? tx('plan.releer', { tarjeta: x.tarjeta.titulo }) : tx('refuerzo.repasar') })),
            el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: e => empezarIntento({ tipo: 'instructor', materia: x.materia, tema: x.tema }, e.currentTarget) }, el('span', { texto: tx('plan.practicar', { n: numero(x.preguntas.length) }) }))),
          el('details', {}, el('summary', { texto: tx('plan.preguntas') }), el('ul', {}, x.preguntas.map(q => talCual('li', `${q.numero ? `${q.numero} · ` : ''}${q.enunciado}`)))),
          el('div', { class: 'videos' }, [...x.videos, ...x.buscar].map(enlace)),
          x.refuerzoHecho ? el('p', { class: 'tono-bien', texto: tx('plan.refuerzo_hecho') }) : null))),
        el('h3', { texto: tx('plan.otra_vez') }),
        el('p', { texto: d.otraVez.listo ? tx('plan.otra_vez.ya') : tx('plan.otra_vez.despues') }),
        otraVez.href ? el('a', { class: `boton-3d ${d.otraVez.listo ? '' : 'blanco'}`.trim(), href: otraVez.href }, el('span', { texto: tx('plan.tomar') }))
          : el('button', { type: 'button', class: `boton-3d ${d.otraVez.listo ? '' : 'blanco'}`.trim(), onclick: e => empezarIntento(otraVez.datos, e.currentTarget) }, el('span', { texto: tx('plan.tomar') })),
        consejoExamen(res.id));
    });
    return lugar;
  }
  // «¿Estás listo para el examen oficial?»: el veredicto, «Cómo lo pienso» (cada regla ✔/✘ con su número), el paso que
  // más importa, la probabilidad (una estimación), cada materia y los aprobados que conviene repetir.
  // 0.12.2: más visual y menos lectura: un medidor grande con la probabilidad y el veredicto; cada regla en una baldosa
  // (icono, nombre corto, valor → meta y una barrita; verde si se cumple); las explicaciones largas, plegadas en «¿Cómo lo
  // pienso?»; y UN botón con el paso que más importa (siempre lleva a algún lado: nunca un «null»).
  const ICONO_REGLA = { materias: 'libro', acierto: 'estrella', cobertura: 'ojo', constancia: 'trofeo', memoria: 'cerebro', fallas: 'actualizar', tiempo: 'calendario', clases: 'video' };
  function baldosa(x) {
    const n = v => numero(v ?? 0);
    const pctDe = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a * 100) / b))) : x.ok ? 100 : 0);
    const valores = {
      materias: [`${n(x.valor)}/${n(x.meta)}`, pctDe(x.valor, x.meta)],
      acierto: [tx('listo.tile.de_a', { valor: n(x.valor), meta: n(x.meta) }), pctDe(x.valor, x.meta)],
      cobertura: [tx('listo.tile.de_a', { valor: n(x.valor), meta: n(x.meta) }), pctDe(x.valor, x.meta)],
      constancia: [`${n(x.valor)}/${n(x.meta)}`, pctDe(x.valor, x.meta)],
      memoria: [tx('listo.tile.de_a', { valor: n(x.valor), meta: n(x.meta) }), pctDe(x.valor, x.meta)],
      fallas: [x.ok ? '0 ✔' : n(x.valor), x.ok ? 100 : 0],
      tiempo: [tx('listo.tile.tiempo', { dias: n(x.valor), meta: n(x.meta), estudio: n(x.n), metaEstudio: n(x.diasEstudio) }), Math.min(pctDe(x.valor, x.meta), pctDe(x.n, x.diasEstudio))],
      clases: [x.ok ? '0 ✔' : n(x.valor), x.ok ? 100 : 0],
    };
    const [valor, pct] = valores[x.id] ?? [x.ok ? '✔' : '✘', x.ok ? 100 : 0];
    const barra = el('span', { class: 'baldosa-relleno' });
    barra.style.width = `${pct}%`;
    return el('li', { class: `baldosa ${x.ok ? 'ok' : 'no'}` },
      el('span', { class: 'baldosa-cabeza' }, icono(ICONO_REGLA[x.id] ?? 'info', 'icono chico'), el('span', { class: 'baldosa-nombre', texto: tx(x.id === 'tiempo' ? 'listo.tile.tiempo.nombre' : `listo.tile.${x.id}`) })),
      el('strong', { class: 'baldosa-valor', texto: valor }),
      el('span', { class: 'baldosa-barra', 'aria-hidden': 'true' }, barra),
      el('span', { class: 'solo-lectores', texto: x.ok ? tx('listo.cumple') : tx('listo.no_cumple') }));
  }
  function preparado(url = '/api/academia/preparado', { alumno = false } = {}) {
    const lugar = el('section', { class: 'panel preparado', 'aria-label': tx('listo.titulo') });
    api('GET', url).then(r => {
      if (!lugar.isConnected || !r.ok) return;
      const v = r.datos;
      const linea = x => {
        const vars = { valor: numero(x.valor), meta: numero(x.meta), n: numero(x.n), materias: numero(x.materias ?? 0), de: numero(x.deMaterias ?? 0), dias: numero(x.diasEstudio ?? 0),
          donde: (x.donde ?? []).map(d => `${nombreMateria(d.materia)} (${d.n})`).join(', ') };
        return el('li', { class: `regla ${x.ok ? 'ok' : 'no'}` }, el('span', { class: 'regla-marca', 'aria-hidden': 'true', texto: x.ok ? '✔' : '✘' }),
          el('span', { class: 'solo-lectores', texto: x.ok ? tx('listo.cumple') : tx('listo.no_cumple') }), el('span', { texto: tx(`listo.regla.${x.id}`, vars) }));
      };
      const accion = v.siguiente?.accion;
      const clase = 'boton-3d naranja con-icono listo-cta';
      const texto = v.siguiente ? tx(`listo.cta.${v.siguiente.regla}`) : '';
      const contenido = [icono('flecha', 'icono chico'), el('span', { texto })];
      const boton = !v.siguiente || alumno ? null
        : accion?.tipo === 'intento' ? el('button', { type: 'button', class: clase, onclick: e => empezarIntento(accion.datos, e.currentTarget) }, contenido)
          : accion?.tipo === 'tema' ? el('a', { class: clase, href: `#tema/${encodeURIComponent(accion.materia)}/${encodeURIComponent(accion.tema)}` }, contenido)
            : el('a', { class: clase, href: accion?.tipo === 'refuerzo' ? '#mi-repaso' : '#inicio' }, contenido);
      const medidor = h.medidor && v.probabilidad != null ? h.medidor(v.probabilidad, { etiqueta: tx('listo.medidor') }) : null;
      anexar(lugar,
        el('h2', { class: 'con-icono' }, icono('trofeo'), el('span', { texto: tx('listo.titulo') })),
        el('div', { class: 'listo-cabeza' },
          medidor,
          el('div', { class: 'listo-veredicto' },
            el('p', { class: `veredicto veredicto-${v.nivel}`, texto: tx(`listo.nivel.${v.nivel}`) }),
            // (sin medidor, la probabilidad en texto)
            v.probabilidad != null && !medidor ? el('p', { class: 'chica', texto: tx('listo.probabilidad', { n: numero(v.probabilidad) }) }) : null,
            el('p', { class: 'suave chica', texto: tx('listo.aviso') }))),
        el('ul', { class: 'baldosas' }, v.reglas.map(baldosa)),
        boton ? el('div', { class: 'listo-siguiente' }, el('span', { class: 'suave chica', texto: tx('listo.siguiente') }), boton) : null,
        el('details', { class: 'listo-como' }, el('summary', { texto: tx('listo.como_pregunta') }), el('ul', { class: 'lista-reglas' }, v.reglas.map(linea))),
        v.suerte?.length ? el('div', { class: 'suerte' }, v.suerte.map(x => el('p', { class: 'aviso' },
          el('strong', { texto: `${tx('listo.suerte', { lugar: nombreMateria(x.materia), pct: numero(x.pct) })} ` }),
          el('span', { texto: x.razones.map(z => tx(`listo.suerte.${z.id}`, { n: numero(z.n ?? 0), de: numero(z.de ?? 0), pct: numero(z.pct ?? 0), umbral: numero(z.umbral ?? 0) })).join(' ') })))) : null,
        v.porMateria?.length ? el('details', {}, el('summary', { texto: tx('listo.por_materia') }),
          el('ul', { class: 'lista-simple' }, v.porMateria.map(m => el('li', {}, el('strong', { texto: `${nombreMateria(m.materia)}: ` }),
            el('span', { texto: `${tx(`listo.nivel.${m.nivel}`)} · ${tx('listo.materia', { pct: numero(m.pct), cob: numero(m.cobertura), fallas: numero(m.fallas), n: numero(m.n) })}` }))))) : null);
    });
    return lugar;
  }
  // Después de una práctica de refuerzo: «Bien: 2 de 3 — lo repasamos otra vez el jueves».
  function resultadoRefuerzo(res) {
    if (res.tipo !== 'instructor' || !res.tema) return null;
    const dia = new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-DO', { weekday: 'long', timeZone: 'America/Santo_Domingo' }).format(new Date(Date.now() + 2 * 86_400_000));
    return el('p', { class: 'resultado-refuerzo con-icono' }, icono('atencion', 'icono chico'),
      el('span', { texto: tx(res.aciertos === res.total ? 'refuerzo.resultado.bien' : 'refuerzo.resultado', { n: numero(res.aciertos), total: numero(res.total), dia }) }));
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
      medidorTiempo(d.tiempo),
      d.instructor?.motivo === 'sin_minutos' ? sinMinutos() : null,
      // 0.11.0: activó la academia sin IA.
      d.instructor?.motivo === 'sin_consentimiento' ? el('p', { class: 'suave chica con-icono' }, icono('info', 'icono chico'),
        el('span', { texto: `${tx('instr.motivo.sin_consentimiento')} ` }), el('a', { href: '#mis-datos', texto: tx('datos.titulo') })) : null,
      d.tiempo?.activo ? el('a', { class: 'boton-3d azul chico con-icono boton-profesor', href: '#profesor' }, icono('cerebro', 'icono chico'), el('span', { texto: tx('profesor.abrir') })) : null,
      zonaIa);
  }
  // Un pago aprobado o rechazado que todavía no vio.
  function avisoPagos(pagos) {
    if (!pagos?.length) return null;
    const caja = el('aside', { class: 'aviso-pagos', role: 'status' }, pagos.map(p => el('p', { class: `con-icono tono-${p.estado === 'aprobado' ? 'bien' : 'mal'}` },
      icono(p.estado === 'aprobado' ? 'bien' : 'mal', 'icono chico'),
      el('span', { texto: p.estado === 'aprobado' ? tx('pago.aprobado_aviso', { n: numero(p.minutos) }) : tx('pago.rechazado_aviso', { motivo: p.motivo ?? '' }) }))),
    el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: async () => { caja.remove(); await api('POST', '/api/academia/tiempo-ia/visto', {}); } }, el('span', { texto: tx('pago.entendido') })));
    return caja;
  }
  // Pone la tarjeta en su lugar cuando llega (Inicio ya se dibujó: no lo hace esperar). Arriba de todo, su plan de
  // refuerzo (si tiene fallas vivas); después el aviso de un pago y «Tu instructor dice…».
  function enInicio() {
    const lugar = el('div', { class: 'instructor-lugar' });
    api('GET', '/api/academia/instructor').then(r => {
      if (!lugar.isConnected || !r.ok) return;
      // 0.12.2: el plan de refuerzo ya no va en Inicio ni marca el Camino: es «Mi repaso» (con su número en la entrada).
      lugar.replaceChildren(...[avisoPagos(r.datos.pagos), tarjetaInicio(r.datos)].filter(Boolean));
      const cuenta = document.querySelector('.entrada-mi-repaso .mi-repaso-cuenta');
      const n = (r.datos.plan ?? []).length;
      if (cuenta && n) { cuenta.textContent = numero(n); cuenta.setAttribute('aria-label', tx('mirepaso.cuenta', { n: numero(n) })); cuenta.hidden = false; }
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
  function explicar(intentoId, q, { etiqueta = tx('instr.explicar') } = {}) {
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
    }, icono('cerebro', 'icono chico'), el('span', { texto: etiqueta }));
    lugar.append(boton);
    return lugar;
  }
  function vistaExplicacion(d) {
    const b = d.basica;
    const pasos = b.estilo === 'paso_a_paso';
    const partes = [
      el('div', { class: 'instructor-mini-cabeza' }, icono('cerebro', 'icono chico'), el('strong', { texto: tx('instr.explica.titulo') }), insignia(d.instructor, { compacta: true })),
      b.falla ? el('p', { class: 'aviso chica con-icono' }, icono('atencion', 'icono chico'), el('span', { texto: tx('refuerzo.explica', { n: numero(b.falla.fallos) }) }))
        : b.veces >= 2 ? el('p', { class: 'aviso chica', texto: tx('instr.explica.repetida', { n: numero(b.veces) }) }) : null,
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

  // El Profesor virtual de un alumno (en su ficha): darlo, quitarlo o «según su pago», y su historial.
  function profesorAdmin(id) {
    const lugar = el('section', { class: 'panel profesor-admin' }, el('h2', { class: 'con-icono' }, icono('cerebro'), el('span', { texto: tx('profesor.titulo') })));
    const pintar = async () => {
      const r = await api('GET', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/profesor`);
      if (!lugar.isConnected || !r.ok) return;
      const poner = async valor => {
        const x = await api('POST', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/profesor`, { permitido: valor });
        if (!x.ok) return h.avisar?.(textoError(x.datos.error), 'mal');
        lugar.replaceChildren(lugar.firstChild);
        pintar();
      };
      anexar(lugar,
        el('p', { texto: r.datos.permiso.permitido ? tx(`profesor.admin.si.${r.datos.permiso.por}`) : tx('profesor.admin.no') }),
        el('div', { class: 'botones' },
          el('button', { type: 'button', class: 'boton-3d chico', onclick: () => poner(true) }, el('span', { texto: tx('profesor.admin.dar') })),
          el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => poner(null) }, el('span', { texto: tx('profesor.admin.pago') })),
          el('button', { type: 'button', class: 'boton-3d rojo chico', onclick: () => poner(false) }, el('span', { texto: tx('profesor.admin.quitar') }))),
        r.datos.historial.length ? el('details', {}, el('summary', { texto: tx('profesor.admin.historial', { n: numero(r.datos.historial.length) }) }),
          el('ul', { class: 'lista-simple' }, r.datos.historial.map(m => el('li', {}, talCual('p', m.pregunta, 'fuerte'), m.respuesta ? talCual('p', m.respuesta.respuesta, 'suave') : null)))) : null);
    };
    pintar();
    return lugar;
  }

  // ---------- Administrador: «Ver cómo trabaja» (una pregunta y una opción mala: sin IA y con IA, lado a lado) ----------
  function demo() {
    const zona = el('div', { class: 'demo-zona' });
    const elegir = el('select', { 'aria-label': tx('demo.pregunta') });
    const opcion = el('select', { 'aria-label': tx('demo.opcion') });
    let preguntas = [];
    const pintarOpciones = () => {
      const q = preguntas.find(x => x.id === elegir.value);
      opcion.replaceChildren(...(q?.opciones ?? []).filter(o => o.letra !== q.correcta).map(o => el('option', { value: o.letra, texto: `${o.letra}. ${o.texto}` })));
    };
    elegir.addEventListener('change', pintarOpciones);
    const boton = el('button', {
      type: 'button', class: 'boton-3d azul chico',
      onclick: async () => {
        boton.disabled = true;
        const r = await api('POST', '/api/admin/academia/instructor/demo', { pregunta: elegir.value, opcion: opcion.value });
        boton.disabled = false;
        if (!r.ok) return zona.replaceChildren(el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }));
        const d = r.datos;
        const conIa = d.ia?.estado === 'ejemplo'
          ? el('section', { class: 'caja-hoja caja-ia ejemplo' }, el('h3', { texto: tx('demo.con_ia_ejemplo') }), el('p', { texto: tx('demo.ejemplo_texto') }), el('p', { class: 'suave chica', texto: tx('demo.ejemplo_nota') }))
          : lugarIa(d.ia, x => cajaIa(x, [talCual('p', x.explicacion), x.porQueNo ? talCual('p', x.porQueNo) : null, x.recuerda ? talCual('p', x.recuerda, 'recuerda-linea') : null]));
        zona.replaceChildren(
          el('article', { class: 'demo-pregunta' }, talCual('p', d.pregunta.enunciado, 'fuerte'), el('ul', {}, d.pregunta.opciones.map(o => talCual('li', `${o.letra}. ${o.texto}${o.letra === d.pregunta.correcta ? ' ✓' : ''}`)))),
          el('div', { class: 'demo-lados' },
            el('div', {}, el('h3', { texto: tx('demo.sin_ia') }), vistaExplicacion({ instructor: { modo: 'basico' }, basica: d.basica, ia: null })),
            el('div', {}, el('h3', { texto: tx('demo.con_ia') }), conIa)));
      },
    }, el('span', { texto: tx('demo.ver') }));
    const caja = el('details', { class: 'en-palabras demo' },
      el('summary', { class: 'con-icono' }, icono('ojo'), el('span', { texto: tx('demo.titulo') })),
      el('p', { class: 'suave', texto: tx('demo.linea') }), elegir, opcion, boton, zona);
    caja.addEventListener('toggle', async () => {
      if (!caja.open || preguntas.length) return;
      const r = await api('GET', '/api/admin/academia/respuestas');
      if (!r.ok) return;
      preguntas = r.datos.materias.flatMap(m => m.temas.flatMap(t => t.preguntas));
      elegir.replaceChildren(...preguntas.map(q => el('option', { value: q.id, texto: `${q.numero ?? q.id} · ${q.enunciado.slice(0, 70)}` })));
      pintarOpciones();
    });
    return caja;
  }
  // «Conectar la IA» paso a paso (para quien no es técnico). Las claves se pegan y se prueban gratis en Claves.
  function guiaConectar(s) {
    const proveedores = Array.isArray(s.proveedores) ? s.proveedores : [];
    const estado = id => {
      const p = proveedores.find(x => x.id === id);
      return p ? (p.usable ? tx('conectar.lista') : p.usar ? tx('conectar.falta') : tx('conectar.apagado')) : '—';
    };
    return el('details', { class: 'en-palabras conectar-ia', open: !s.encendida },
      el('summary', { class: 'con-icono' }, icono('llave'), el('span', { texto: tx('conectar.titulo') })),
      el('p', { class: 'fuerte', texto: tx('conectar.claude') }),
      el('ol', {}, [1, 2, 3, 4, 5].map(n => el('li', { texto: tx(`conectar.claude.${n}`) }))),
      el('p', { class: 'suave', texto: `Claude: ${estado('anthropic')}` }),
      el('p', { class: 'fuerte', texto: tx('conectar.openai') }),
      el('ol', {}, [1, 2, 3].map(n => el('li', { texto: tx(`conectar.openai.${n}`) }))),
      el('p', { class: 'suave', texto: `ChatGPT: ${estado('openai')}` }),
      el('p', { texto: tx('conectar.orden') }),
      el('a', { class: 'boton-3d azul chico', href: '#claves' }, el('span', { texto: tx('conectar.probar') })));
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
      guiaConectar(s),
      interruptor(tx('instr.admin.encender'), s.instructorIa === true, boton => cambiar(boton, mensaje, '/api/admin/ia/ajustes', { instructorIa: !s.instructorIa }, null)),
      !s.encendida ? el('p', { class: 'suave', texto: tx('instr.admin.ia_apagada') }) : null,
      el('fieldset', { class: 'modelos-instructor' },
        el('legend', { texto: tx('instr.admin.modelo') }),
        modelos.map(m => el('label', { class: 'opcion-radio' },
          el('input', { type: 'radio', name: 'instructor-modelo', value: m.modelo, checked: s.instructorModelo === m.modelo, disabled: !m.confirmado,
            onchange: evento => cambiar(evento.currentTarget, mensaje, '/api/admin/ia/ajustes', { instructorModelo: m.modelo }, null) }),
          el('span', { texto: tx(`instr.admin.modelo.${m.modelo === 'claude-sonnet-5-5' ? 'sonnet' : 'haiku'}`, { entrada: m.precio ? `US$${m.precio.entradaUsd}` : '—', salida: m.precio ? `US$${m.precio.salidaUsd}` : '—' }) })))),
      el('p', { class: 'suave', texto: tx('instr.admin.tipico', { monto: usd(s.tipicoInstructorMicro) }) }),
      el('p', { class: 'suave', texto: tx('instr.admin.minuto') }),
      el('a', { class: 'boton-enlace secundario', href: '#pagos', texto: tx('instr.admin.ir_pagos') }),
      demo(),
      el('details', { class: 'en-palabras' },
        el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: tx('instr.admin.como') })),
        el('p', { texto: tx('instr.admin.como.1') }), el('p', { texto: tx('instr.admin.como.2') }), el('p', { texto: tx('instr.admin.como.3') })),
      alumnos,
      mensaje);
  }

  return Object.freeze({ preparado, planParaPasar, profesorAdmin, medidorTiempo, sinMinutos, loQueHicimos, resultadoRefuerzo, frasesFalla, demo, insignia, enInicio, cajaDuda, explicar, consejoExamen, tarjetaAdmin, tarjetaInicio, vistaExplicacion });
}
