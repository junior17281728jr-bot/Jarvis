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
// 0.12.12: por qué un alumno tiene el Profesor (src/academia/profesor.js); otro valor → «Lo tiene.» (nunca una clave a la vista).
export const PERMISOS_PROFESOR = Object.freeze(['admin', 'regalo', 'pago', 'plan', 'prueba']);
const ESPERA_MAXIMA_MS = 120_000;

export function crearInstructor(h) {
  const { el, t, tn, icono, api, talCual, sonar, empezarIntento, numero, textoError } = h;
  const nombreMateria = id => (h.nombreMateria ? h.nombreMateria(id) : id);
  const tx = (clave, vars = {}) => t(clave, vars);
  // 0.12.2: append() escribe «null» si le llega un null (se veía «null» junto a «HACERLO AHORA»): solo lo que existe.
  const anexar = (nodo, ...hijos) => nodo.append(...hijos.filter(x => x != null && x !== false));
  // 0.12.4: el último modo que dijo el servidor ('ia' | 'espera' | 'basico'): sin IA para él, ni se le pide.
  let estadoConocido = null;
  const anotarModo = instructor => { if (instructor?.modo) estadoConocido = instructor; };
  const pedirleIa = () => !estadoConocido || estadoConocido.modo !== 'basico' || estadoConocido.motivo === 'sin_minutos';
  // Sin IA por algo que no se pasa solo: nunca se pinta como un fallo (solo lo básico).
  const PERMANENTES = new Set(['sin_consentimiento', 'ia_apagada', 'sin_presupuesto', 'cuenta_sin_permiso', 'solo_tailnet', 'ayuda_no_activada', 'sin_clave']);

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
  // 0.13.2: en los resúmenes (Inicio, «Tu plan de hoy») el título sin el inglés entre paréntesis (el inglés queda en la
  // clase) y corto: «Visión en vuelo y visión nocturna (vision in flight / night vision)» → «Visión en vuelo».
  const sinIngles = titulo => (h.partirTitulo ? h.partirTitulo(titulo).es : String(titulo ?? '')).trim();
  function tituloCorto(titulo, max = 26) {
    const s = sinIngles(titulo);
    if (s.length <= max) return s;
    const corte = s.search(/\s+(?:y|e|o|[—–-])\s+|[,:;(]/);
    if (corte >= 6 && corte <= max) return s.slice(0, corte).trim();
    let r = '';
    for (const p of s.split(/\s+/)) { if (`${r} ${p}`.trim().length > max - 1) break; r = `${r} ${p}`.trim(); }
    return `${r || s.slice(0, max - 1)}…`;
  }
  const conTitulos = (vars = {}, corto = tituloCorto) => ({ ...vars, ...(vars.tema ? { tema: corto(vars.tema) } : {}), ...(vars.concepto ? { concepto: corto(vars.concepto) } : {}) });
  // El consejo en una línea (≤ ~90 letras) y entero (con el título sin inglés) para «Ver por qué».
  const consejoCorto = c => tx(`instr.corto.${c.clave}`, { ...conTitulos(c.vars), n: numero(c.vars?.n ?? 0), pct: numero(c.vars?.pct ?? 0), faltan: numero(c.vars?.faltan ?? 0), reto: numero(c.vars?.reto ?? 0) });
  const consejoEntero = c => tx(`instr.c.${c.clave}`, conTitulos(c.vars, sinIngles));
  // Una fila entera que se toca (sin botones aparte): el mismo destino que botonAccion.
  function filaAccion(accion, clase, ...partes) {
    if (accion?.tipo === 'tema') return el('a', { class: clase, href: `#tema/${encodeURIComponent(accion.materia)}/${encodeURIComponent(accion.tema)}` }, ...partes);
    if (accion?.tipo === 'examen') return el('a', { class: clase, href: `#examen/${encodeURIComponent(accion.materia)}` }, ...partes);
    if (accion?.tipo === 'intento') return el('button', { type: 'button', class: clase, onclick: evento => { sonar?.('toque'); empezarIntento(accion.datos, evento.currentTarget); } }, ...partes);
    return el('div', { class: clase }, ...partes);
  }

  // Lo que escribió la IA (consejo, explicación o duda): en su propia caja, con quién lo escribió.
  function cajaIa(r, partes) {
    // 0.12.4: en la «Vista de prueba de la IA» (administrador) todo dice que es una demostración.
    return el('section', { class: `caja-hoja caja-ia${r.demo ? ' demo' : ''}` },
      el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx(r.demo ? 'demo.ia.titulo' : 'instr.ia.titulo') })),
      partes,
      Array.isArray(r.terminos) && r.terminos.length ? el('ul', { class: 'lista-terminos' }, r.terminos.map(x => el('li', {},
        el('strong', { lang: 'en', texto: x.ingles }), x.abreviatura ? el('span', { class: 'termino-abrev', texto: ` (${x.abreviatura})` }) : null,
        x.espanol ? el('span', { texto: ` · ${x.espanol}` }) : null))) : null,
      el('p', { class: 'suave chica', texto: tx(r.demo ? 'demo.ia.firma' : 'instr.ia.firma') }));
  }

  // ---------- 0.12.7: «Preparado para ti» en la portada de una clase ----------
  // ia: lo que preparó la IA para ESTE tema ({ intro, tarjetas: [{ numero, titulo, porque }], analogias, plan, citas }) o
  // null; basico: la versión gratis (cuántas tarjetas, falladas y nuevas, sus conceptos y 3 pasos que existen en la app).
  function pintarParaTi({ ia = null, basico = null } = {}) {
    if (ia) {
      return el('section', { class: `para-ti caja-hoja caja-ia${ia.demo ? ' demo' : ''}` },
        el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx(ia.demo ? 'para_ti.titulo_demo' : 'para_ti.titulo') })),
        talCual('p', ia.intro ?? ''),
        (ia.tarjetas ?? []).length ? el('div', {}, el('p', { class: 'fuerte chica', texto: tx('para_ti.fijate') }),
          el('ul', { class: 'para-ti-tarjetas' }, ia.tarjetas.map(x => el('li', {}, el('strong', { texto: tx('para_ti.tarjeta', { n: numero(x.numero ?? 0), titulo: x.titulo ?? '' }) }), talCual('span', x.porque ? ` · ${x.porque}` : ''))))) : null,
        (ia.analogias ?? []).map(a => el('p', { class: 'para-ti-analogia con-icono' }, icono('bombilla', 'icono chico'), talCual('span', a.analogia))),
        (ia.plan ?? []).length ? el('div', {}, el('p', { class: 'fuerte chica', texto: tx('para_ti.plan') }), el('ol', { class: 'instructor-pasos' }, ia.plan.map(x => talCual('li', x)))) : null,
        citasTg(ia),
        el('p', { class: 'suave chica', texto: tx(ia.demo ? 'demo.ia.firma' : 'para_ti.firma') }));
    }
    if (!basico) return null;
    const pasos = (basico.plan ?? []).map(k => tx(`para_ti.basico.${k}`, { n: numero(basico.tarjetas ?? 0), p: numero(basico.preguntas ?? 0) }));
    return el('section', { class: 'para-ti caja-hoja' },
      el('h3', { class: 'con-icono' }, icono('cerebro', 'icono chico'), el('span', { texto: tx('para_ti.titulo') })),
      el('p', { texto: basico.falladas ? tn('para_ti.basico.falladas', { n: basico.falladas, nuevas: basico.nuevas }) : tn('para_ti.basico.nuevas', { n: basico.nuevas }) }),
      (basico.conceptos ?? []).length ? el('p', { class: 'chica' }, el('span', { texto: `${tx('para_ti.basico.conceptos')} ` }), talCual('span', basico.conceptos.join(' · '))) : null,
      el('ol', { class: 'instructor-pasos' }, pasos.map(x => el('li', { texto: x }))),
      el('p', { class: 'suave chica', texto: tx('para_ti.basico.firma') }));
  }
  // Un lugar en la portada que se llena solo (sin esperar): si algo falla, queda vacío (la clase sigue igual).
  function paraTi(materia, tema) {
    const nodo = el('div', { class: 'para-ti-lugar' });
    api('GET', `/api/academia/instructor/preparado/${encodeURIComponent(materia)}/${encodeURIComponent(tema)}`).then(r => {
      if (!r?.ok) return;
      const caja = pintarParaTi(r.datos);
      if (caja) nodo.append(caja);
    }).catch(() => {});
    return nodo;
  }

  // 0.12.4: «Test Guide n.º 12: <respuesta tal cual>» (solo citas revisadas contra la clave).
  const citasTg = r => (r?.citas ?? []).map(c => el('p', { class: 'cita-test-guide chica con-icono' }, icono('libro', 'icono chico'), talCual('span', tx('instr.ia.cita', { n: c.numero, respuesta: c.respuesta }))));
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
      else if (d?.estado === 'no' && d.motivo === 'sin_fallas') lugar.replaceChildren(el('p', { class: 'chica con-icono' }, icono('bien', 'icono chico'), el('span', { texto: tx('consejo.sin_fallas') })));
      else if (d?.estado === 'no' && PERMANENTES.has(d.motivo)) lugar.replaceChildren();
      else if (d?.estado === 'no' && d.espera) lugar.replaceChildren(el('p', { class: 'suave chica con-icono' }, icono('reloj', 'icono chico'), el('span', { texto: tx('instr.ia.espera') })));
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
  // 0.12.7: con planes, su estado: el plan (usos y días), la prueba gratis (días y usos de hoy) o los usos de antes.
  // 0.12.12: { admin: true } = lo mismo en tercera persona, para la lista de Pagos del administrador («Tiene…», no «Tienes…»).
  function textoPlan(tiempo, { admin = false } = {}) {
    const k = clave => (admin ? clave.replace(/^plan\./, 'plan.admin.') : clave);
    if (tiempo.fuente === 'plan' || (tiempo.plan && !tiempo.plan.vencido)) {
      return [tx(k('plan.estado.plan'), { nombre: tiempo.plan.nombre, n: numero(tiempo.plan.quedan ?? 0), dias: numero(tiempo.plan.dias ?? 0) }), tiempo.plan.renovar ? tx(k('plan.renovar'), { dias: numero(tiempo.plan.dias ?? 0) }) : null];
    }
    if (tiempo.fuente === 'prueba' || (tiempo.prueba && !tiempo.prueba.terminada && tiempo.motivo === 'limite_diario')) {
      const p = tiempo.prueba;
      return [p.empezada ? tx(k('plan.estado.prueba'), { dias: numero(p.quedanDias), hoy: numero(p.hoy), por_dia: numero(p.porDia) }) : tx(k('plan.estado.prueba_nueva'), { dias: numero(p.dias), por_dia: numero(p.porDia) }),
        tiempo.motivo === 'limite_diario' ? tx(k('plan.limite_diario')) : null];
    }
    if (tiempo.fuente === 'minutos') return [tx(k('plan.estado.minutos'), { n: numero(tiempo.minutos) })];
    return [tx(k(tiempo.motivo === 'prueba_terminada' ? 'plan.estado.prueba_terminada' : 'plan.estado.sin_plan'))];
  }
  function medidorTiempo(tiempo, { conBoton = true } = {}) {
    if (!tiempo?.activo) return null;
    if (tiempo.ilimitado) return el('p', { class: 'medidor-tiempo ilimitado con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx('tiempo.ilimitado') }));
    if (tiempo.modo === 'planes') {
      const [linea, extra] = textoPlan(tiempo);
      return el('div', { class: `medidor-tiempo${!tiempo.puede || tiempo.plan?.renovar ? ' poco' : ''}` },
        el('p', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('strong', { texto: linea })),
        extra ? el('p', { class: 'chica', texto: extra }) : null,
        conBoton ? el('a', { class: 'enlace-tiempo', href: '#tiempo-ia', texto: tx('plan.ver') }) : null);
    }
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
  const lineaRepasa = f => tx(f.temaNumero ? 'repasa.linea' : 'repasa.linea_sin_numero', { concepto: sinIngles(f.concepto || f.tarjeta || f.temaTitulo || ''), n: numero(f.temaNumero ?? 0), tema: sinIngles(f.temaTitulo ?? '') });
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
            v.probabilidad != null && !medidor ? el('p', { class: 'chica', texto: tx('listo.probabilidad', { n: numero(v.probabilidad) }) }) : null)),
        el('ul', { class: 'baldosas' }, v.reglas.map(baldosa)),
        boton ? el('div', { class: 'listo-siguiente' }, el('span', { class: 'suave chica', texto: tx('listo.siguiente') }), boton) : null,
        // 0.13.2: «es una estimación…» va con el «¿Cómo lo pienso?» (la tarjeta, más corta).
        el('details', { class: 'listo-como' }, el('summary', { texto: tx('listo.como_pregunta') }), el('p', { class: 'suave chica', texto: tx('listo.aviso') }), el('ul', { class: 'lista-reglas' }, v.reglas.map(linea))),
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

  // ---------- 0.14.15: el consejo del instructor IA, corto y con botones ----------
  // Lo nuevo (forma 2): una línea de saludo, UN video que existe, los temas que falló (nombre corto, «2/6», barrita y la
  // confusión en pocas palabras), los botones Estudiar · Practicar · Te guío, los repasos de hoy y, plegado, «Por qué».
  // Todo destino sale del servidor (ids revisados); lo que escribió la IA va siempre como texto (talCual).
  const rutaTema = (materia, tema, tarjeta = null) => `#tema/${encodeURIComponent(materia)}/${encodeURIComponent(tema)}${tarjeta ? `/${Number(tarjeta)}` : ''}`;
  // Practicar lo que falló de ESE tema; si ya no le queda nada fallado, la práctica del instructor de ese tema.
  async function practicarTema(materia, tema, boton) {
    if (boton) boton.disabled = true;
    let r = await api('POST', '/api/academia/intentos', { tipo: 'errores', materia, tema });
    if (!r.ok && r.datos?.error === 'sin_errores') r = await api('POST', '/api/academia/intentos', { tipo: 'instructor', materia, tema });
    if (boton) boton.disabled = false;
    if (!r.ok) return h.avisar?.(textoError(r.datos.error), 'mal');
    location.hash = `#practica/${r.datos.id}`;
  }
  function hrefVideo(v) {
    if (v.tipo === 'youtube') return v.url;
    if (v.tipo === 'materia') return v.tema ? `#video/${encodeURIComponent(v.materia)}/tema/${encodeURIComponent(v.tema)}` : `#video/${encodeURIComponent(v.materia)}`;
    return rutaTema(v.materia, v.tema, v.tarjeta);
  }
  function porqueConsejo(r) {
    const e = r.evidencia ?? {};
    if (r.alcance === 'materia') return tx('consejo.porque.materia', { n: numero(e.n ?? 0), materia: nombreMateria(e.materia) });
    if (r.alcance === 'tema') return tx(e.bien_otros ? 'consejo.porque.tema' : 'consejo.porque.tema_solo', { fallos: numero(e.fallos ?? 0), de: numero(e.de ?? 0), tema: sinIngles(e.tema), materia: nombreMateria(e.materia) });
    if (r.alcance === 'varias') return tx('consejo.porque.varias', { n: numero(e.materias ?? 0), temas: (e.temas ?? []).map(x => tituloCorto(x, 22)).join(' · ') });
    return '';
  }
  function pintarConsejo(r) {
    if (r.forma !== 2) {
      // El de antes (titulo, consejo, pasos): tal cual.
      return cajaIa(r, [r.titulo ? talCual('p', r.titulo, 'fuerte') : null, talCual('p', r.consejo ?? ''),
        r.pasos?.length ? el('ol', { class: 'instructor-pasos' }, r.pasos.map(p => talCual('li', p))) : null]);
    }
    const repaso = r.repaso?.n > 0 ? el('button', { type: 'button', class: 'consejo-repaso con-icono', onclick: evento => { sonar?.('toque'); empezarIntento({ tipo: 'repaso' }, evento.currentTarget); } },
      icono('calendario', 'icono chico'), el('span', { texto: tn('consejo.repaso', { n: r.repaso.n }) })) : null;
    // Ya superó lo que el consejo señalaba: «vas bien» (y sus repasos), nunca un consejo vacío.
    if (r.superado) {
      return el('section', { class: 'caja-hoja caja-ia consejo-ia' },
        el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx('instr.ia.titulo') })),
        el('p', { class: 'consejo-saludo', texto: tx('consejo.sin_fallas') }), repaso);
    }
    const temas = r.temas ?? [];
    const guia = r.guia ?? temas[0] ?? null;
    const v = r.video;
    const caja = el('section', { class: `caja-hoja caja-ia consejo-ia${r.demo ? ' demo' : ''}` },
      el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: tx(r.demo ? 'demo.ia.titulo' : 'instr.ia.titulo') })),
      talCual('p', r.saludo || tx('consejo.saludo_base', { tema: temas[0] ? tituloCorto(temas[0].titulo) : '' }), 'consejo-saludo'),
      v ? el('a', { class: 'consejo-video', href: hrefVideo(v), ...(v.tipo === 'youtube' ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
        icono('video', 'icono chico'),
        el('span', { class: 'consejo-video-texto' },
          el('strong', { texto: tx('consejo.video') }),
          el('span', { class: 'chica', texto: v.titulo ? sinIngles(v.titulo) : tx('consejo.video_de', { materia: nombreMateria(v.materia) }) }),
          v.porque ? talCual('span', v.porque, 'suave chica') : null),
        icono('flecha', 'icono chico')) : null,
      temas.length ? el('p', { class: 'fuerte chica consejo-etiqueta', texto: tx('consejo.fallaste') }) : null,
      temas.length ? el('ul', { class: 'consejo-temas' }, temas.map(t => el('li', {},
        el('a', { class: 'consejo-chip', href: rutaTema(t.materia, t.tema) },
          el('span', { class: 'consejo-chip-nombre', texto: tituloCorto(t.titulo, 18) }),
          el('span', { class: 'consejo-chip-cifra', texto: tx('consejo.cifra', { bien: numero(t.bien), de: numero(t.de) }) }),
          el('progress', { class: 'consejo-barra', max: Math.max(1, t.de), value: Math.min(t.bien, Math.max(1, t.de)), 'aria-label': tx('consejo.barra', { bien: numero(t.bien), de: numero(t.de) }) })),
        t.confusion ? talCual('span', t.confusion, 'consejo-confusion suave chica') : null))) : null,
      guia ? el('div', { class: 'consejo-botones' },
        el('a', { class: 'boton-3d blanco chico con-icono', href: rutaTema(guia.materia, guia.tema, guia.tarjeta) }, icono('libro', 'icono chico'), el('span', { texto: tx('consejo.estudiar') })),
        el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', onclick: evento => { sonar?.('toque'); practicarTema(guia.materia, guia.tema, evento.currentTarget); } },
          icono('cerebro', 'icono chico'), el('span', { texto: tx('consejo.practicar') })),
        el('button', { type: 'button', class: 'boton-3d naranja chico con-icono', onclick: () => { sonar?.('toque'); if (h.guiar) h.guiar(guia); else location.hash = rutaTema(guia.materia, guia.tema, guia.tarjeta); } },
          icono('dedo', 'icono chico'), el('span', { texto: tx('consejo.guiar') }))) : null,
      repaso,
      el('details', { class: 'instructor-porque' }, el('summary', { texto: tx('consejo.por_que') }),
        porqueConsejo(r) ? el('p', { class: 'chica', texto: porqueConsejo(r) }) : null,
        r.porque ? talCual('p', r.porque, 'chica') : null,
        el('p', { class: 'suave chica', texto: tx(r.demo ? 'demo.ia.firma' : 'instr.ia.firma') })));
    return caja;
  }

  // ---------- Inicio: «Tu instructor dice…» ----------
  function tarjetaInicio(d) {
    const consejo = d.consejo;
    const ia = d.instructor?.modo === 'ia';
    const zonaIa = el('div', { class: 'instructor-ia' });
    const pintarConsejoIa = pintarConsejo;
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
      // 0.13.2: una línea corta y UN botón; el consejo entero y lo que nota, detrás de «Ver por qué».
      consejo ? el('div', { class: 'instructor-fila' },
        talCual('p', consejoCorto(consejo), 'instructor-consejo'),
        consejo.accion ? botonAccion(consejo.accion) : null) : null,
      consejo ? el('details', { class: 'instructor-porque' }, el('summary', { texto: tx('instr.ver_porque') }),
        talCual('p', consejoEntero(consejo), 'chica'),
        d.observaciones?.length ? el('ul', { class: 'instructor-notas' }, d.observaciones.map(o => el('li', { class: 'con-icono' },
          icono('ojo', 'icono chico'), talCual('span', tx(`instr.o.${o.clave}`, { ...o.vars, franja: o.vars?.franja ? tx(`instr.franja.${o.vars.franja}`) : '' }))))) : null) : null,
      // 0.12.4: los minutos y el Profesor virtual solo si la IA sirve de verdad para él (nunca un botón muerto).
      ia || d.instructor?.modo === 'espera' ? medidorTiempo(d.tiempo) : null,
      d.instructor?.motivo === 'sin_minutos' ? sinMinutos() : null,
      // 0.11.0: activó la academia sin IA.
      d.instructor?.motivo === 'sin_consentimiento' ? el('p', { class: 'suave chica con-icono' }, icono('info', 'icono chico'),
        el('span', { texto: `${tx('instr.motivo.sin_consentimiento')} ` }), el('a', { href: '#mis-datos', texto: tx('datos.titulo') })) : null,
      planDeHoy({ sinAccion: consejo?.accion ?? null }),
      // 0.12.4: el administrador (también «como estudiante») puede ver cómo se vería todo con IA, sin clave.
      d.demoIa ? el('a', { class: 'enlace-fuerte chica con-icono', href: '#ia-demo' }, icono('ojo', 'icono chico'), el('span', { texto: tx('demo.vista.abrir') })) : null,
      ia && d.tiempo?.activo ? el('a', { class: 'boton-3d azul chico con-icono boton-profesor', href: '#profesor' }, icono('cerebro', 'icono chico'), el('span', { texto: tx('profesor.abrir') })) : null,
      zonaIa);
  }
  // 0.12.4: «Tu plan de hoy»: sin IA, las primeras cosas que puede hacer hoy (cada una con su botón de verdad); con IA,
  // «Armar mi plan con IA» (la IA solo elige y ordena entre esas mismas). Se pinta cuando llega (no hace esperar a Inicio).
  // 0.13.2: cada paso es UNA fila que se toca: ícono + 2 a 4 palabras («Repasar: Mirar al lado de noche», «Clase: Visión
  // en vuelo», «Modo reto»); el «porque» de la IA, chico debajo.
  const ICONO_PASO = { repaso: 'actualizar', tema: 'libro', reto: 'rayo', examen: 'trofeo', practica: 'cerebro', practica_vence: 'cerebro', consejo: 'flecha' };
  const textoAccion = a => (a.clave === 'consejo' ? botonTexto(a.accion) : tx(`instr.hoy.${a.clave}`, { ...conTitulos(a.vars), n: numero(a.vars?.n ?? 0) }));
  const botonTexto = accion => (accion?.tipo === 'intento' ? tx(`instr.accion.${accion.datos?.tipo ?? 'instructor'}`) : accion ? tx(`instr.accion.${accion.tipo}`) : '');
  const mismaAccion = (a, b) => a != null && b != null && JSON.stringify(a) === JSON.stringify(b);
  function pasosPlan(pasos, { botones = true } = {}) {
    return el('ul', { class: 'plan-hoy-pasos' }, pasos.map(a => el('li', {},
      filaAccion(botones ? a.accion : null, `plan-hoy-fila${botones && a.accion ? ' tocable' : ''}`,
        el('span', { class: 'plan-hoy-icono', 'aria-hidden': 'true' }, icono(ICONO_PASO[a.clave] ?? 'flecha', 'icono chico')),
        el('span', { class: 'plan-hoy-texto' }, el('span', { class: 'plan-hoy-etiqueta', texto: textoAccion(a) }),
          a.porque ? talCual('span', a.porque, 'plan-hoy-porque suave chica') : null),
        botones && a.accion ? el('span', { class: 'plan-hoy-ir', 'aria-hidden': 'true' }, icono('flecha', 'icono chico')) : null))));
  }
  function planDeHoy({ url = '/api/academia/instructor/plan-hoy', sinAccion = null } = {}) {
    const lugar = el('section', { class: 'plan-hoy', 'aria-label': tx('instr.hoy.titulo') });
    api('GET', url).then(r => {
      if (!lugar.isConnected || !r.ok || !(r.datos.basico ?? []).length) return;
      const d = r.datos;
      // Lo mismo que ya ofrece el botón de arriba no se repite.
      const basico = d.basico.filter(a => !mismaAccion(a.accion, sinAccion));
      if (!basico.length && d.ia?.estado !== 'lista' && d.instructor?.modo !== 'ia') return;
      const zona = el('div', { class: 'plan-hoy-ia' });
      const pintarIa = x => cajaIa(x, [x.titulo ? talCual('p', x.titulo, 'fuerte') : null, pasosPlan(x.pasos ?? [])]);
      if (d.ia?.estado === 'lista') zona.append(pintarIa(d.ia));
      else if (d.instructor?.modo === 'ia') {
        zona.append(el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', onclick: async evento => {
          const boton = evento.currentTarget;
          boton.disabled = true;
          const x = await api('POST', url, {});
          if (!x.ok) { boton.disabled = false; return h.avisar?.(textoError(x.datos.error), 'mal'); }
          if (x.datos.ia?.estado === 'lista') return boton.replaceWith(pintarIa(x.datos.ia));
          boton.replaceWith(lugarIa(x.datos.ia, () => el('span')));
          if (x.datos.ia?.estado !== 'pendiente') return;
          // Cuando llega, se vuelve a leer el plan (las acciones con su botón las pone el servidor).
          const vuelta = async (n = 0) => {
            if (!zona.isConnected) return;
            const y = await api('GET', url);
            if (y.ok && y.datos.ia?.estado === 'lista') return zona.replaceChildren(pintarIa(y.datos.ia));
            if (n < 60) setTimeout(() => vuelta(n + 1), 2000);
          };
          setTimeout(vuelta, 2000);
        } }, icono('chispa', 'icono chico'), el('span', { texto: tx('instr.hoy.con_ia') })));
      }
      lugar.replaceChildren(el('h3', { class: 'con-icono' }, icono('calendario', 'icono chico'), el('span', { texto: tx('instr.hoy.titulo') })),
        d.ia?.estado === 'lista' ? zona : el('div', {}, basico.length ? pasosPlan(basico) : null, zona));
    });
    return lugar;
  }
  // 0.12.4: «Mini-clase con IA» de un concepto de «Mi repaso» (solo si de verdad hay IA para él: si no, no hay botón).
  function miniClaseIa(clave) {
    const lugar = el('div', { class: 'mini-clase-ia' });
    const boton = el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', onclick: async () => {
      boton.disabled = true;
      const r = await api('POST', '/api/academia/mi-repaso/clase/ia', { concepto: clave });
      if (!r.ok) { boton.disabled = false; return h.avisar?.(textoError(r.datos.error), 'mal'); }
      boton.remove();
      lugar.replaceChildren(lugarIa(r.datos.ia, pintarMiniClase));
    } }, icono('chispa', 'icono chico'), el('span', { texto: tx('mini.ia_clase') }));
    lugar.append(boton);
    return lugar;
  }
  const pintarMiniClase = x => cajaIa(x, [
    talCual('p', x.concepto),
    x.ejemplo ? el('p', {}, el('strong', { texto: `${tx('mini.ia.ejemplo')} ` }), talCual('span', x.ejemplo)) : null,
    x.trampa ? el('p', {}, el('strong', { texto: `${tx('mini.ia.trampa')} ` }), talCual('span', x.trampa)) : null,
    x.recuerda ? el('p', { class: 'recuerda-linea' }, el('strong', { texto: `${tx('acad.recuerda')}: ` }), talCual('span', x.recuerda)) : null,
    el('p', { class: 'suave chica', texto: tx('instr.ia.test_guide') })]);
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
      anotarModo(r.datos.instructor);
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
          lugarIa(r.datos.ia, x => cajaIa(x, [talCual('p', x.respuesta), ...citasTg(x), x.enMaterial ? null : el('p', { class: 'suave chica', texto: tx('instr.duda.fuera') })])));
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
        const r = await api('POST', '/api/academia/instructor/explicar', { intento: Number(intentoId), pregunta: q.id, ia: pedirleIa() });
        if (!r.ok) { boton.disabled = false; return h.avisar?.(textoError(r.datos.error), 'mal'); }
        anotarModo(r.datos.instructor);
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
      // 0.12.4: la nota para ti (su historia con este concepto), encima de la explicación (con o sin IA).
      b.nota ? el('p', { class: 'nota-para-ti chica con-icono' }, icono('ojo', 'icono chico'), talCual('span', [
        b.nota.concepto ? tn('instr.nota.concepto', { n: b.nota.fallos, concepto: b.nota.concepto, dias: numero(b.nota.dias) }) : tn('instr.nota.fallos', { n: b.nota.fallos }),
        b.nota.idea ? tx('instr.nota.idea', { idea: b.nota.idea }) : null].filter(Boolean).join(' '))) : null,
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
          lugarIa(r.datos.ia, pintarConsejo)));
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
        el('p', { texto: r.datos.permiso.permitido ? tx(PERMISOS_PROFESOR.includes(r.datos.permiso.por) ? `profesor.admin.si.${r.datos.permiso.por}` : 'profesor.admin.si.otro') : tx('profesor.admin.no') }),
        el('div', { class: 'botones' },
          el('button', { type: 'button', class: 'boton-3d chico', onclick: () => poner(true) }, el('span', { texto: tx('profesor.admin.dar') })),
          el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => poner(null) }, el('span', { texto: tx('profesor.admin.pago') })),
          el('button', { type: 'button', class: 'boton-3d rojo chico', onclick: () => poner(false) }, el('span', { texto: tx('profesor.admin.quitar') }))),
        r.datos.historial.length ? el('details', {}, el('summary', { texto: tx('profesor.admin.historial', { n: numero(r.datos.historial.length) }) }),
          el('ul', { class: 'lista-simple' }, r.datos.historial.map(m => el('li', {}, talCual('p', m.pregunta, 'fuerte'), m.respuesta ? talCual('p', m.respuesta.respuesta, 'suave') : m.basica ? talCual('p', `${tx('profesor.basico')} ${textoConsejo(m.basica)}`, 'suave') : null)))) : null);
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
  // 0.12.4: sin la IA encendida (sin clave, por ejemplo) el interruptor no se puede tocar (antes respondía 409): se ve
  // apagado, con la explicación al lado. Apagarlo siempre se puede.
  function interruptorInstructor(s, hacer) {
    const boton = hacer();
    if (!s.encendida && s.instructorIa !== true) {
      boton.disabled = true;
      boton.setAttribute('aria-disabled', 'true');
      boton.setAttribute('aria-describedby', 'instructor-sin-ia');
    }
    return boton;
  }
  // 0.12.7: «Gasto de hoy / este mes», las llamadas por tipo, la caché del proveedor y «0 llamadas cuando nadie estudia».
  function usoIa(u, usd) {
    if (!u) return null;
    const nombre = p => { const k = `ia.proposito.${p}`; const x = t(k); return x === k ? String(p ?? '?') : x; };
    const lista = filas => (filas.length ? el('ul', { class: 'lista-simple chica' }, filas.map(f => el('li', { texto: tx('uso.tipo', { tipo: nombre(f.proposito), n: numero(f.n), monto: usd(f.usadoMicro) }) })))
      : el('p', { class: 'suave chica', texto: tx('uso.ninguna') }));
    return el('div', { class: 'uso-ia' },
      el('h3', { texto: tx('uso.titulo') }),
      el('p', { class: 'fuerte', texto: tx('uso.hoy', { monto: usd(u.hoy.usadoMicro), n: numero(u.hoy.n) }) }), lista(u.hoy.porTipo),
      el('p', { class: 'fuerte', texto: tx('uso.mes', { monto: usd(u.mes.usadoMicro), n: numero(u.mes.n) }) }), lista(u.mes.porTipo),
      el('p', { class: 'chica', texto: u.cache.pct == null ? tx('uso.cache.sin') : tx('uso.cache', { pct: numero(u.cache.pct), leidos: numero(u.cache.lectura), escritos: numero(u.cache.escritura) }) }),
      el('p', { class: `chica con-icono ${u.sinPersona === 0 ? 'tono-bien' : 'tono-atencion'}` }, icono(u.sinPersona === 0 ? 'bien' : 'atencion', 'icono chico'),
        el('span', { texto: u.sinPersona === 0 ? tx('uso.reposo.bien') : tx('uso.reposo.mal', { n: numero(u.sinPersona) }) })),
      el('p', { class: 'suave chica', texto: tx('uso.cache.nota') }));
  }

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
      interruptorInstructor(s, () => interruptor(tx('instr.admin.encender'), s.instructorIa === true, boton => cambiar(boton, mensaje, '/api/admin/ia/ajustes', { instructorIa: !s.instructorIa }, null))),
      !s.encendida ? el('p', { id: 'instructor-sin-ia', class: 'suave', texto: tx('instr.admin.ia_apagada') }) : null,
      // 0.12.7: «Preparar la próxima clase con IA» (encendido por defecto; solo trabaja con la IA y el instructor encendidos).
      s.encendida && s.instructorIa ? interruptor(tx('para_ti.admin.interruptor'), s.prepararClase !== false, boton => cambiar(boton, mensaje, '/api/admin/ia/ajustes', { prepararClase: s.prepararClase === false }, null)) : null,
      el('p', { class: 'suave chica', texto: tx('para_ti.admin.linea') }),
      usoIa(s.uso, usd),
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
      el('a', { class: 'boton-enlace secundario con-icono', href: '#ia-demo' }, icono('ojo', 'icono chico'), el('span', { texto: tx('demo.vista.abrir') })),
      el('details', { class: 'en-palabras' },
        el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: tx('instr.admin.como') })),
        el('p', { texto: tx('instr.admin.como.1') }), el('p', { texto: tx('instr.admin.como.2') }), el('p', { texto: tx('instr.admin.como.3') })),
      alumnos,
      mensaje);
  }

  // ---------- 0.12.4: el Profesor virtual cuando no hay IA para él ----------
  // Lo que respondió el instructor básico se ve como una respuesta más (nunca «no pudo» ni «escribiendo…»).
  // 0.12.4: lo que citó del Test Guide (ya revisado contra la clave) va al final de su respuesta.
  const conCitas = r => (r?.citas?.length ? { ...r, respuesta: [r.respuesta, ...r.citas.map(c => tx('instr.ia.cita', { n: c.numero, respuesta: c.respuesta }))].join('\n') } : r);
  const historialParaChat = historial => (historial ?? []).map(m => (m.estado === 'basico'
    ? { ...m, estado: 'lista', respuesta: { respuesta: m.basica ? `${tx('profesor.basico')} ${textoConsejo(m.basica)}` : tx('profesor.basico_sin') } }
    : m.respuesta ? { ...m, respuesta: conCitas(m.respuesta) } : m));
  // Sin IA para él (sin clave, apagada, sin su permiso…): el Profesor virtual no se ofrece; si llega aquí, una nota
  // tranquila («Modo básico»), lo que ya habló y el paso de su instructor automático. Nada para escribir.
  function profesorSinIa(d) {
    const historial = historialParaChat(d?.historial);
    return el('section', { class: 'panel chat profesor-sin-ia' },
      el('div', { class: 'chat-cabeza' }, el('span', { class: 'instructor-avatar', 'aria-hidden': 'true' }, icono('cerebro')),
        el('div', {}, el('h1', { texto: tx('profesor.titulo') }), insignia(d?.instructor))),
      el('p', { class: 'con-icono' }, icono('info', 'icono chico'), el('span', { texto: tx('profesor.sin_ia') })),
      d?.instructor?.motivo === 'sin_consentimiento' ? el('p', { class: 'suave chica' }, el('a', { href: '#mis-datos', texto: tx('datos.titulo') })) : null,
      historial.length ? el('details', { class: 'profesor-historial' }, el('summary', { texto: tx('profesor.anteriores', { n: numero(historial.length) }) }),
        el('ul', { class: 'lista-simple' }, historial.map(m => el('li', {}, talCual('p', m.pregunta, 'fuerte'), m.respuesta ? talCual('p', m.respuesta.respuesta, 'suave') : null)))) : null,
      el('a', { class: 'boton-3d', href: '#inicio' }, el('span', { texto: tx('profesor.ir_inicio') })));
  }

  return Object.freeze({ lugarIa, textoPlan, paraTi, pintarParaTi, historialParaChat, profesorSinIa, planDeHoy, miniClaseIa, pintarMiniClase, pasosPlan, citasTg, cajaIa, preparado, planParaPasar, profesorAdmin, medidorTiempo, sinMinutos, loQueHicimos, resultadoRefuerzo, frasesFalla, demo, insignia, enInicio, cajaDuda, explicar, consejoExamen, tarjetaAdmin, tarjetaInicio, vistaExplicacion, pintarConsejo, practicarTema });
}
