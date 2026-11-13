// Academia 0.12.2: la parte de arriba de «Mi progreso»: el curso ENTERO (las 11 materias del programa; las que todavía no
// tienen clases, «pronto»), con cada número diciendo qué cuenta; después cada materia (se abre) con sus temas; y «Mi
// repaso» en corto (lo que hay que repasar, con su botón: la lista entera vive en #mi-repaso). Todo con h.el.

import { tituloSinIngles } from './tarjetas.js';

const ESTADO_TEMA = { aprobado: 'progreso.tema.aprobado', abierto: 'progreso.tema.abierto', bloqueado: 'progreso.tema.bloqueado' };

export function panelCurso(curso, h) {
  const { el, t, numero, icono, medidor, nombreMateria, barraLlena } = h;
  if (!curso) return null;
  const dato = (nombreIcono, valor, texto) => el('li', { class: 'curso-dato' }, el('span', { class: 'curso-dato-icono', 'aria-hidden': 'true' }, icono(nombreIcono, 'icono chico')),
    el('strong', { class: 'curso-dato-valor', texto: valor }), el('span', { class: 'curso-dato-texto', texto }));
  const materia = m => {
    if (m.estado === 'pronto') {
      return el('li', { class: 'curso-materia pronto' },
        el('div', { class: 'curso-materia-cabeza' }, el('span', { class: 'suave chica', texto: t('acad.materia_n', { n: numero(m.numero) }) }),
          el('strong', { texto: nombreMateria(m.id) }), el('span', { class: 'banner-pronto', texto: t('acad.pronto') })));
    }
    return el('li', { class: 'curso-materia' }, el('details', {},
      el('summary', { class: 'curso-materia-cabeza' },
        el('span', { class: 'suave chica', texto: t('acad.materia_n', { n: numero(m.numero) }) }),
        el('strong', { texto: nombreMateria(m.id) }),
        el('span', { class: 'chica', texto: t('progreso.materia.resumen', { temas: numero(m.temasAprobados), de: numero(m.temas.length), pct: numero(m.pct) }) })),
      el('ul', { class: 'curso-materia-datos lista-simple' },
        el('li', { texto: t('progreso.materia.temas', { n: numero(m.temasAprobados), de: numero(m.temas.length) }) }),
        el('li', { texto: m.examen?.aprobado ? t('progreso.materia.examen_si', { pct: numero(m.examen.mejor ?? 0) })
          : m.examen?.veces ? t('progreso.materia.examen_intentos', { pct: numero(m.examen.mejor ?? 0) }) : t('progreso.materia.examen_no') }),
        el('li', { texto: t('progreso.materia.tg', { n: numero(m.bien), de: numero(m.preguntas), materia: numero(m.numero) }) })),
      el('div', { class: 'plan-barra' }, barraLlena(m.pct)),
      el('ol', { class: 'curso-temas' }, m.temas.map(x => el('li', { class: `curso-tema ${x.estado}` },
        el('span', { texto: t('progreso.tema.n', { n: numero(x.numero), titulo: x.titulo }) }),
        el('span', { class: 'suave chica', texto: [t(ESTADO_TEMA[x.estado] ?? 'progreso.tema.abierto'), x.mejor != null ? t('progreso.tema.mejor', { pct: numero(x.mejor) }) : null].filter(Boolean).join(' · ') }))))));
  };
  return el('section', { class: 'panel panel-curso', 'aria-labelledby': 'curso-titulo' },
    el('h2', { id: 'curso-titulo', class: 'con-icono' }, icono('avion'), el('span', { texto: t('progreso.curso.titulo') })),
    el('p', { class: 'suave', texto: t('progreso.curso.linea', { n: numero(curso.programa) }) }),
    el('div', { class: 'curso-resumen' },
      medidor(curso.pct, { etiqueta: t('progreso.curso.medidor') }),
      el('ul', { class: 'curso-datos' },
        dato('libro', t('progreso.de', { n: numero(curso.temasAprobados), de: numero(curso.temas) }), t('progreso.curso.temas', { materias: numero(curso.conClases) })),
        dato('trofeo', t('progreso.de', { n: numero(curso.examenesAprobados), de: numero(curso.examenes) }), t('progreso.curso.examenes', { n: numero(curso.programa) })),
        dato('estrella', t('progreso.de', { n: numero(curso.bien), de: numero(curso.preguntas) }), t('progreso.curso.tg', { pct: numero(curso.pct) })),
        dato('calendario', t('progreso.de', { n: numero(curso.conClases), de: numero(curso.programa) }), t('progreso.curso.materias')))),
    el('p', { class: 'suave chica', texto: t('acad.preparacion.estimacion') }),
    el('h3', { texto: t('progreso.curso.por_materia') }),
    el('ul', { class: 'curso-materias' }, curso.materias.map(materia)));
}

// «Repasa: <punto> · Tema <n> <tema>»: la línea corta de cada error (lo largo, la idea equivocada, va en la mini-clase).
export const lineaRepasa = (x, t, numero) => t(x.temaNumero ? 'repasa.linea' : 'repasa.linea_sin_numero', { concepto: tituloSinIngles(x.concepto), n: numero(x.temaNumero ?? 0), tema: tituloSinIngles(x.temaTitulo ?? '') });
export const enlaceMiniClase = clave => (clave ? `#mi-repaso/clase/${String(clave).replace(/^c:/, '')}` : '#mi-repaso');

export function panelRepasoResumen(r, h) {
  const { el, t, numero, icono, talCual } = h;
  if (!r) return null;
  return el('section', { class: 'panel panel-repaso-resumen', 'aria-labelledby': 'repaso-resumen-titulo' },
    el('h2', { id: 'repaso-resumen-titulo', class: 'con-icono' }, icono('actualizar'), el('span', { texto: t('mirepaso.titulo') })),
    el('p', { class: 'suave', texto: r.paraRepasar || r.pendientes ? t('progreso.repaso.linea', { n: numero(r.paraRepasar), m: numero(r.pendientes) }) : t('progreso.repaso.vacio') }),
    r.puntos.length ? el('ul', { class: 'lista-repaso' }, r.puntos.map(x => el('li', { class: 'repasa-fila' },
      talCual('span', lineaRepasa(x, t, numero), 'fuerte'),
      el('a', { class: 'boton-3d blanco chico', href: enlaceMiniClase(x.clave) }, el('span', { texto: t('mirepaso.repasar') }))))) : null,
    el('a', { class: 'boton-3d naranja con-icono', href: '#mi-repaso' }, icono('actualizar', 'icono chico'), el('span', { texto: t('animo.ir') })));
}

// 0.13.1: «Preparándote para el examen oral» en Progreso, aparte (nunca se suma al Test Guide). 0.13.2: el oral tiene su
// propia pestaña abajo («Oral», con su Camino, «Listo para el oral» y cada capítulo): aquí queda solo un enlace corto.
export function panelOral(o, h) {
  const { el, t, numero, icono } = h;
  if (!o?.listo) return null;
  const x = o.listo;
  return el('a', { class: 'entrada-oral con-icono', href: '#oral' }, icono('microfono', 'icono'),
    el('span', { class: 'entrada-oral-texto' }, el('strong', { texto: t('oral.corto') })),
    el('span', { class: `insignia tono-${x.listo ? 'bien' : 'info'}`, texto: x.listo ? t('oral.listo.si_corto', { pct: numero(x.pct ?? 0) }) : t('oral.listo.no_corto', { pct: numero(x.pct ?? 0) }) }));
}
