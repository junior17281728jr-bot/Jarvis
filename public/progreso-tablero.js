// Academia 0.14.23 (pedido del dueño: «Progreso se ve feo: muchas cosas juntas, mucho texto»): «Mi progreso» como un
// tablero corto y visual (primero el teléfono: iPhone 13, 390 px; también 320 px y la PC):
//  1. Arriba: dos anillos grandes (Test Guide y oral), «Ahora en: M1 · La hipoxia» y «Vas 1.º de 2 · 🔥 3 días».
//  2. «La carrera» compacta (las pistas de carrera-vista.js con opciones) y debajo el top 3; la tabla entera en una hoja.
//  3. «Mis números»: 4 fichitas en una fila (ícono, número grande, una palabra).
//  4. «Materias»: 11 fichas con su anillo y un punto de estado (lista · en curso · sin empezar · te falla) y los capítulos
//     del oral; al tocar una, una hoja con sus temas como puntos, acierto y visto, «Te falla: …» y Estudiar/Reforzar/Examen.
//  5. «¿Tomo el examen final?» en UNA tarjeta: el veredicto, dos barras (acierto vs 90, visto vs 95) y «Te falta: …».
// Lo de antes (la tabla, «Mi avance», el examen por materia y los paneles de siempre) sigue en «Ver detalles».
// Datos: GET /api/academia/carrera (yo.avance, yo.datos, pilotos) y GET /api/academia/tutor/examen (puede faltar: las
// fichas se pintan con el avance y se completan cuando llega). Todo con h.el / h.svgEl (solo textContent y atributos).
// Lo puro (estadoMateria, estadoCapitulo, faltanCortos, tiempoCorto) no toca el DOM: test/progreso-tablero.test.js.

import { puestoDe, ordenTabla, vistaTabla } from './carrera-vista.js';

const META_ACIERTO = 90;
const META_VISTO = 95;
const acotar = v => Math.max(0, Math.min(100, Math.floor(Number(v) || 0)));

// El estado de una materia del Test Guide: 'pronto' (sin clases), 'lista', 'falla', 'curso' o 'sin'.
// b: un bloque de yo.avance.tg.bloques; ex: su fila de /api/academia/tutor/examen (o null mientras no llega).
// h.abierto(materia, tema) (si está): false para un tema cerrado — ningún botón ni enlace lleva a una clase cerrada.
export function estadoMateria(b, ex = null) {
  if (!b || b.pronto) return 'pronto';
  if (ex?.si) return 'lista';
  // «Te falla»: la materia va «todavía no» (acierto bajo 70 %); «casi» sigue «en curso» (qué tema falla: en su hoja).
  if (ex && ex.estado === 'todavia' && ex.iniciada !== false) return 'falla';
  const empezo = b.hechos > 0 || (b.temas ?? []).some(x => x.estado !== 'nuevo') || Boolean(ex?.iniciada) || Boolean(b.examen);
  return empezo ? 'curso' : 'sin';
}
// Un capítulo del oral (sin «acierto»: hecho entero o examen aprobado = lista; examen sin aprobar = te falla).
export function estadoCapitulo(b) {
  if (!b || b.pronto) return 'pronto';
  if (b.examen?.aprobado || (b.temas?.length && b.hechos === b.temas.length)) return 'lista';
  if (b.examen && !b.examen.aprobado) return 'falla';
  return b.hechos > 0 || (b.temas ?? []).some(x => x.estado !== 'nuevo') ? 'curso' : 'sin';
}

// «Te falta: …» (máx. 2, cortos): primero lo que no dicen las barras (exámenes, repaso, clases, días), después acierto/visto.
const ORDEN_FALTA = ['constancia', 'fallas', 'clases', 'memoria', 'tiempo', 'acierto', 'cobertura'];
export function faltanCortos(oficial, max = 2) {
  const malas = (oficial?.porques ?? []).map(x => ({ id: String(x.clave ?? '').replace(/\.(ok|no)$/, ''), no: /\.no$/.test(x.clave ?? ''), vars: x.vars ?? {} }))
    .filter(x => x.no && ORDEN_FALTA.includes(x.id));
  return malas.sort((a, b) => ORDEN_FALTA.indexOf(a.id) - ORDEN_FALTA.indexOf(b.id)).slice(0, max);
}

// El tiempo de la semana, corto para una ficha chica: «45 min», «2 h», «1 h 5».
export function tiempoCorto(minutos, t, numero) {
  const m = Math.max(0, Math.floor(Number(minutos) || 0));
  const horas = Math.floor(m / 60);
  if (!horas) return t('tablero.min', { m: numero(m) });
  return m % 60 ? t('tablero.h_min', { h: numero(horas), m: numero(m % 60) }) : t('tablero.h', { h: numero(horas) });
}

// Un anillo SVG (sin style en línea: el trazo va en atributos). pct 0–100.
function anillo(h, pct, clase, centro) {
  const v = acotar(pct);
  const s = h.svgEl('svg', { viewBox: '0 0 100 100', class: 'tb-anillo-svg', 'aria-hidden': 'true', focusable: 'false' });
  s.append(h.svgEl('circle', { cx: 50, cy: 50, r: 42, class: 'tb-anillo-pista' }));
  if (v > 0) s.append(h.svgEl('circle', { cx: 50, cy: 50, r: 42, class: 'tb-anillo-lleno', pathLength: 100, 'stroke-dasharray': `${v} 200`, transform: 'rotate(-90 50 50)' }));
  return h.el('span', { class: `tb-anillo ${clase}`.trim(), 'data-pct': String(v) }, s, centro);
}

const abierto = (h, materia, tema) => (h.abierto ? h.abierto(materia, tema) : true);
const nombreCorto = (h, titulo) => (h.partirTitulo ? h.partirTitulo(titulo ?? '').es : String(titulo ?? ''));

// 1. Arriba: los dos anillos, «Ahora en» y el puesto con la racha.
export function vistaHero(h, carrera) {
  const { el, t, tn, numero } = h;
  const yo = carrera?.yo;
  const av = yo?.avance;
  if (!av) return null;
  const grande = (pct, nombre, clase) => el('div', { class: `tb-hero-anillo ${clase}`, role: 'img', 'aria-label': `${nombre}: ${h.pctTexto(acotar(pct))}` },
    anillo(h, pct, 'grande', el('span', { class: 'tb-anillo-centro' }, el('strong', { class: 'tb-anillo-pct', texto: h.pctTexto(acotar(pct)) }))),
    el('span', { class: 'tb-hero-nombre', texto: nombre }));
  const ahora = av.tg?.terminado ? t('carrera.en_meta') : av.tg?.ahora
    ? t('tablero.ahora_en', { m: numero(av.tg.ahora.numero), titulo: nombreCorto(h, av.tg.ahora.titulo) }) : t('tablero.sin_despegar');
  const p = puestoDe(carrera.pilotos, 'tg');
  const racha = Number(yo.datos?.racha) || 0;
  const partes = [p && p.de > 1 ? t('tablero.vas', { n: numero(p.puesto), total: numero(p.de) }) : null,
    racha ? `🔥 ${tn('tablero.dias', { n: racha })}` : null].filter(Boolean);
  return el('section', { class: 'panel tb-hero', 'aria-label': t('tablero.resumen') },
    el('div', { class: 'tb-hero-anillos' },
      grande(av.tg?.pct ?? 0, t('carrera.tg'), 'tg'),
      av.oral ? grande(av.oral.pct ?? 0, t('carrera.oral'), 'oral') : null),
    el('a', { class: `tb-ahora${av.tg?.ahora ? '' : ' apagado'}`, href: av.tg?.ahora && abierto(h, av.tg.ahora.id, av.tg.ahora.tema) ? `#tema/${encodeURIComponent(av.tg.ahora.id)}/${encodeURIComponent(av.tg.ahora.tema)}` : '#inicio' },
      h.icono('avion', 'icono chico'), el('span', { class: 'tb-ahora-texto', texto: ahora })),
    partes.length ? el('p', { class: 'tb-hero-linea', texto: partes.join(' · ') }) : null);
}

// 2. Debajo de la carrera: los 3 primeros (inicial + %). La tabla entera: «Ver todos» (arriba a la derecha, en una hoja).
const nombreVisto = (h, p) => (p.esYo ? h.t('carrera.tu') : /^Piloto \d+$/.test(p.alias ?? '') ? h.t('carrera.piloto', { n: h.numero(Number(p.alias.slice(7))) }) : p.alias);
export function vistaTop3(h, pilotos) {
  const { el, t } = h;
  const lista = ordenTabla(pilotos);
  if (lista.length < 2) return null;
  const MEDALLAS = ['🥇', '🥈', '🥉'];
  return el('ol', { class: 'tb-top', 'aria-label': t('carrera.podio') }, lista.slice(0, 3).map((p, k) => el('li', { class: `tb-top-uno${p.esYo ? ' yo' : ''}` },
    // 0.14.24: con foto de perfil (solo viaja si se puede ver: src/academia/carrera.js), la foto en vez de la inicial.
    h.dibujarAvatar && p.foto
      ? el('span', { class: 'tb-top-avatar con-foto', 'aria-hidden': 'true' }, h.dibujarAvatar(null, { foto: p.foto, nombre: nombreVisto(h, p), tamano: 'chico' }),
        el('span', { class: 'tb-top-medalla', texto: MEDALLAS[k] }))
      : el('span', { class: 'tb-top-avatar', 'aria-hidden': 'true', texto: (nombreVisto(h, p).match(/\p{L}|\d/u)?.[0] ?? '?').toUpperCase() },
        el('span', { class: 'tb-top-medalla', texto: MEDALLAS[k] })),
    el('span', { class: 'tb-top-nombre', texto: nombreVisto(h, p) }),
    el('strong', { class: 'tb-top-pct', texto: h.pctTexto(acotar(p.tg)) }))));
}
// «Ver todos ›»: la tabla de siempre (podio y una fila por alumno) en una hoja. datos(): los pilotos de ahora.
export function botonVerTodos(h, datos) {
  return h.el('button', { type: 'button', class: 'tb-ver-todos', onclick: () => { const d = datos(); h.abrirHoja({ titulo: h.t('carrera.tabla'), cuerpo: vistaTabla(h, d?.pilotos ?? [], { oral: d?.oral }) }); } },
    h.el('span', { texto: h.t('tablero.ver_todos') }), h.icono('flecha', 'icono chico'));
}

// 3. «Mis números»: 4 fichitas en una fila.
export function vistaNumeros(h, d) {
  const { el, t, numero } = h;
  if (!d) return null;
  const ficha = (clase, iconoNombre, valor, rotulo, etiqueta) => el('li', { class: `tb-num ${clase}`, 'aria-label': `${etiqueta}: ${valor}` },
    el('span', { class: 'tb-num-icono', 'aria-hidden': 'true' }, h.icono(iconoNombre, 'icono')),
    el('strong', { class: 'tb-num-valor', texto: valor }),
    el('span', { class: 'tb-num-rotulo', texto: rotulo }));
  return el('section', { class: 'panel tb-numeros', 'aria-labelledby': 'tb-numeros-titulo' },
    el('h2', { id: 'tb-numeros-titulo', class: 'tb-titulo', texto: t('carrera.mis_numeros') }),
    el('ul', { class: 'tb-num-lista' },
      ficha('racha', 'fuego', numero(d.racha ?? 0), t('tablero.n.racha'), h.tn('carrera.dias_racha', { n: d.racha ?? 0 })),
      ficha('temas', 'libro', t('carrera.de', { n: numero(d.temas?.hechos ?? 0), total: numero(d.temas?.total ?? 0) }), t('tablero.n.temas'), t('carrera.temas_hechos')),
      ficha('nota', 'medalla', d.notaMedia == null ? '—' : h.pctTexto(d.notaMedia), t('tablero.n.nota'), t('carrera.nota_media')),
      ficha('tiempo', 'reloj', tiempoCorto(d.minutosSemana, t, numero), t('tablero.n.semana'), t('carrera.esta_semana'))));
}

// Una barra con su meta (una rayita en el 90 / 95).
function barraMeta(h, clave, valor, meta, clase) {
  const { el, t, numero } = h;
  const v = acotar(valor);
  const texto = t(clave, { valor: numero(v), meta: numero(meta) });
  // La rayita de la meta: su lugar lo pone el CSS (.tb-barra.acierto 90 %, .tb-barra.visto 95 %).
  const marca = el('span', { class: 'tb-barra-meta', 'aria-hidden': 'true' });
  return el('div', { class: `tb-barra ${clase}${v >= meta ? ' ok' : ''}` },
    el('span', { class: 'tb-barra-cabeza' }, el('span', { texto: t(`tablero.${clase}`) }), el('strong', { texto: `${numero(v)} / ${numero(meta)}` })),
    el('span', { class: 'tb-barra-pista' }, h.barraLlena(v), marca),
    el('progress', { class: 'tb-oculto', max: 100, value: v, 'aria-label': texto }));
}

// La hoja de una materia (o capítulo del oral): sus temas como puntos, acierto/visto, qué falla y los botones.
function hojaMateria(h, b, ex, oral) {
  const { el, t, numero } = h;
  const estado = oral ? estadoCapitulo(b) : estadoMateria(b, ex);
  const leyenda = el('p', { class: 'tb-hoja-leyenda suave chica' });
  const actual = b.temas.find(x => x.actual) ?? b.temas.find(x => x.estado !== 'hecho') ?? null;
  const decir = (x, k) => { leyenda.textContent = `${t('av.tema_n', { n: numero(k + 1) })} · ${nombreCorto(h, x.titulo)} · ${t(`av.estado.${x.estado}`)}`; };
  const puntos = el('div', { class: 'tb-puntos', role: 'list' }, b.temas.map((x, k) => el('button', {
    type: 'button', role: 'listitem', class: `tb-punto ${x.estado}${x === actual ? ' actual' : ''}`, 'aria-label': `${t('av.tema_n', { n: numero(k + 1) })} · ${nombreCorto(h, x.titulo)} · ${t(`av.estado.${x.estado}`)}`,
    texto: x.estado === 'hecho' ? '✓' : numero(k + 1), onclick: () => decir(x, k) })));
  if (actual) decir(actual, b.temas.indexOf(actual));
  const flojos = ex?.flojos ?? [];
  const href = tema => (oral ? `#oral/tema/${encodeURIComponent(b.id)}/${encodeURIComponent(tema)}` : `#tema/${encodeURIComponent(b.id)}/${encodeURIComponent(tema)}`);
  // Estudiar: el tema de ahora (o el primero sin hacer) si está abierto; si no, el primero que puede abrir (del servidor).
  const estudiar = oral ? (actual ? actual.id : null) : actual && abierto(h, b.id, actual.id) ? actual.id : ex?.empezar ?? null;
  const botones = [
    estudiar ? el('a', { class: 'boton-3d azul chico', href: href(estudiar) }, el('span', { texto: t('tablero.estudiar') })) : null,
    !oral && flojos[0] ? el('a', { class: 'boton-3d naranja chico', href: href(flojos[0].tema) }, el('span', { texto: t('listo2.reforzar') })) : null,
    el('a', { class: 'boton-3d blanco chico', href: oral ? `#oral/examen/${encodeURIComponent(b.id)}` : `#examen/${encodeURIComponent(b.id)}` }, el('span', { texto: t('tablero.examen') })),
  ].filter(Boolean);
  return el('div', { class: `tb-hoja-materia ${h.claseMateria?.(b.id) ?? ''}`.trim() },
    el('div', { class: 'tb-hoja-cabeza' },
      anillo(h, b.pct, 'mediano', el('span', { class: 'tb-anillo-centro' }, el('strong', { class: 'tb-anillo-pct chico', texto: h.pctTexto(b.pct) }))),
      el('div', { class: 'tb-hoja-nombre' },
        el('span', { class: 'suave chica', texto: oral ? t('tablero.capitulo_n', { n: numero(b.numero) }) : t('acad.materia_n', { n: numero(b.numero) }) }),
        el('span', { class: `tb-estado e-${estado}` }, el('span', { class: 'tb-punto-estado', 'aria-hidden': 'true' }), el('span', { texto: t(`tablero.estado.${estado}`) })))),
    el('p', { class: 'tb-hoja-sub', texto: t('av.temas', { n: numero(b.hechos), total: numero(b.temas.length) }) }),
    puntos, leyenda,
    !oral && ex && ex.iniciada !== false ? el('div', { class: 'tb-barras' }, barraMeta(h, 'listo2.acierto', ex.pct, META_ACIERTO, 'acierto'), barraMeta(h, 'listo2.visto', ex.cobertura, META_VISTO, 'visto')) : null,
    flojos.length ? el('p', { class: 'tb-falla' }, el('strong', { texto: t('tablero.te_falla') }), el('span', { texto: ` ${flojos.map(x => nombreCorto(h, x.titulo)).join(', ')}` })) : null,
    b.examen ? el('p', { class: 'suave chica', texto: b.examen.aprobado ? t('tablero.examen_ok', { pct: h.pctTexto(b.examen.mejor ?? 0) }) : t('tablero.examen_mejor', { pct: h.pctTexto(b.examen.mejor ?? 0) }) }) : null,
    el('div', { class: 'tb-botones' }, botones));
}

// 4. «Materias»: la cuadrícula. → { nodo, conExamen(datos), actualizar(avance) }
export function vistaMaterias(h, av) {
  const { el, t, numero } = h;
  let examen = null;
  const nodo = el('section', { class: 'panel tb-materias', 'aria-labelledby': 'tb-materias-titulo' });
  const ficha = (b, oral) => {
    const ex = oral ? null : (examen?.materias ?? []).find(x => x.materia === b.id) ?? null;
    const estado = oral ? estadoCapitulo(b) : estadoMateria(b, ex);
    const corto = oral ? t('av.tile.c', { n: numero(b.numero) }) : t('av.tile.m', { n: numero(b.numero) });
    const etiqueta = `${h.nombreMateria(b.id)} · ${b.pronto ? t('av.pronto') : `${h.pctTexto(b.pct)} · ${t(`tablero.estado.${estado}`)}`}`;
    const dentro = [
      anillo(h, b.pronto ? 0 : b.pct, oral ? 'chico' : 'mediano', el('span', { class: 'tb-anillo-centro' },
        !oral && h.iconoMateria ? h.icono(h.iconoMateria(b.id), 'icono') : el('strong', { class: 'tb-ficha-c', texto: corto }))),
      el('span', { class: 'tb-ficha-n', texto: oral ? (b.pronto ? '—' : h.pctTexto(b.pct)) : corto }),
      oral ? null : el('span', { class: 'tb-ficha-pct', texto: b.pronto ? '—' : h.pctTexto(b.pct) }),
      b.pronto ? null : el('span', { class: `tb-punto-estado e-${estado}`, 'aria-hidden': 'true' }),
    ];
    const clase = `tb-ficha e-${estado}${b.actual ? ' actual' : ''}${oral ? ' oral' : ` ${h.claseMateria?.(b.id) ?? ''}`}`;
    if (b.pronto) return el('li', {}, el('span', { class: clase, title: h.nombreMateria(b.id), 'aria-label': etiqueta }, dentro));
    return el('li', {}, el('button', { type: 'button', class: clase, title: h.nombreMateria(b.id), 'aria-label': etiqueta, 'data-materia': b.id,
      onclick: () => h.abrirHoja({ titulo: h.nombreMateria(b.id), cuerpo: hojaMateria(h, b, ex, oral) }) }, dentro));
  };
  const leyenda = () => el('ul', { class: 'tb-leyenda', 'aria-label': t('tablero.leyenda') }, ['lista', 'curso', 'sin', 'falla'].map(e =>
    el('li', { class: `tb-estado e-${e}` }, el('span', { class: 'tb-punto-estado', 'aria-hidden': 'true' }), el('span', { texto: t(`tablero.estado.${e}`) }))));
  const pintar = () => {
    if (!av) { nodo.hidden = true; return; }
    nodo.hidden = false;
    const partes = [
      el('h2', { id: 'tb-materias-titulo', class: 'tb-titulo', texto: t('av.materias') }),
      leyenda(),
      el('ul', { class: 'tb-rejilla' }, (av.tg?.bloques ?? []).map(b => ficha(b, false)))];
    if (av.oral) partes.push(el('h3', { class: 'tb-subtitulo', texto: t('tablero.oral_capitulos') }), el('ul', { class: 'tb-rejilla oral' }, (av.oral.bloques ?? []).map(b => ficha(b, true))));
    nodo.replaceChildren(...partes);
  };
  pintar();
  return {
    nodo,
    conExamen: d => { examen = d; pintar(); },
    actualizar: nuevo => { if (JSON.stringify(nuevo ?? null) === JSON.stringify(av ?? null)) return; av = nuevo; pintar(); },
  };
}

// «3 exámenes ≥ 90 %», «2 errores en Mi repaso», «subir el acierto»…
export function textoFalta(h, x) {
  const v = x.vars ?? {};
  const n = ['fallas', 'clases'].includes(x.id) ? Number(v.n) || 0 : Math.max(0, (Number(v.meta) || 0) - (Number(v.valor) || 0));
  return h.t(`tablero.falta.${x.id}`, { n: h.numero(n), meta: h.numero(v.meta ?? 0) });
}

// 5. «¿Tomo el examen final?» en UNA tarjeta. d: /api/academia/tutor/examen (null mientras no llega: no se ve).
export function vistaExamenResumen(h, d, { alVerMaterias } = {}) {
  const { el, t, numero } = h;
  const o = d?.oficial;
  if (!o) return null;
  const faltan = faltanCortos(o);
  return el('section', { class: `panel tb-examen ${o.si ? 'si' : 'no'}`, 'aria-labelledby': 'tb-examen-titulo' },
    el('div', { class: 'tb-examen-cabeza' },
      el('h2', { id: 'tb-examen-titulo', class: 'tb-titulo', texto: t('tutor.examen.titulo') }),
      el('strong', { class: `tb-veredicto ${o.si ? 'si' : 'no'}`, texto: t(o.si ? 'tablero.listo' : 'tablero.todavia') })),
    el('div', { class: 'tb-barras' }, barraMeta(h, 'listo2.acierto', o.acierto ?? 0, META_ACIERTO, 'acierto'), barraMeta(h, 'listo2.visto', o.cobertura ?? 0, META_VISTO, 'visto')),
    faltan.length ? el('p', { class: 'tb-falta' }, el('strong', { texto: t('tablero.te_falta') }),
      el('span', { texto: ` ${faltan.map(x => textoFalta(h, x)).join(' · ')}` })) : null,
    el('button', { type: 'button', class: 'boton-3d blanco chico tb-por-materia', onclick: () => alVerMaterias?.() }, el('span', { texto: t('tablero.por_materia') })));
}
