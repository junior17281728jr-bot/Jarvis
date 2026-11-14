// Academia 0.14.11: el AVANCE de un alumno, visual y con pocas palabras («Cómo van todos» y su ficha; solo el administrador).
// Dos barras grandes (Test Guide y oral, el % de TODOS los temas), «Ahora en» y una cuadrícula: 11 materias (M1–M11) y los
// capítulos del oral (C1–C9), cada una con su % y su barrita; la actual, resaltada. Al tocar una, sus temas como puntos
// (✓ hecho, • empezado, vacío sin empezar); al tocar un punto, su nombre. Los datos: src/academia/avance-alumno.js.
// Todo con h.el (solo textContent; nada de HTML armado con texto).

// «M3 · T2/6» (corto, para la lista) o «Materia 3 · Tema 2 de 6: Nombre» (largo, para la ficha).
export function textoAhora(h, ahora, { oral = false, largo = false, capitulos = 9 } = {}) {
  const { t, numero } = h;
  if (!ahora) return null;
  const datos = { m: numero(ahora.numero), c: numero(ahora.numero), total: numero(capitulos), t: numero(ahora.temaNumero), n: numero(ahora.temas), titulo: h.partirTitulo ? h.partirTitulo(ahora.titulo).es : ahora.titulo };
  return t(`av.ahora.${oral ? 'oral' : 'tg'}_${largo ? 'largo' : 'corto'}`, datos);
}

const tonoPct = p => (p >= 100 ? 'completa' : p >= 50 ? 'media' : p > 0 ? 'poca' : 'cero');

function barraGrande(h, nombre, parte, clase) {
  const { el, t, numero } = h;
  return el('div', { class: `av-total ${clase}` },
    el('div', { class: 'av-total-cabeza' },
      el('span', { class: 'av-total-nombre', texto: nombre }),
      el('strong', { class: 'av-total-pct', texto: h.pctTexto(parte.pct) })),
    el('span', { class: 'cv-barra grande av-barra' }, h.barraLlena(parte.pct)),
    el('span', { class: 'av-total-temas suave chica', texto: t('av.temas', { n: numero(parte.hechos), total: numero(parte.total) }) }));
}

function chipAhora(h, parte, oral, largo) {
  const { el, t } = h;
  if (!parte) return null;
  const texto = parte.terminado ? t('av.terminado') : parte.ahora ? textoAhora(h, parte.ahora, { oral, largo, capitulos: parte.bloques.length }) : t('av.sin_empezar');
  return el('span', { class: `av-chip${oral ? ' oral' : ''}${parte.ahora ? '' : ' apagado'}` },
    el('span', { class: 'av-chip-quien', texto: oral ? t('av.oral') : t('av.tg') }), el('span', { class: 'av-chip-donde', texto }));
}

// Un tema como punto: ✓ hecho, • empezado, vacío sin empezar. Al tocarlo, su nombre abajo.
function punto(h, b, k, x, leyenda, oral) {
  const { el, t, numero } = h;
  const estado = t(`av.estado.${x.estado}`);
  const nombre = `${t('av.tema_n', { n: numero(k + 1) })} · ${h.partirTitulo ? h.partirTitulo(x.titulo).es : x.titulo}`;
  return el('button', { type: 'button', class: `av-punto ${x.estado}${x.actual ? ' actual' : ''}`, 'aria-label': `${nombre} · ${estado}`, title: nombre,
    texto: x.estado === 'hecho' ? '✓' : x.estado === 'empezado' ? '•' : numero(k + 1),
    onclick: () => { leyenda.textContent = `${oral ? t('av.tile.c', { n: numero(b.numero) }) : t('av.tile.m', { n: numero(b.numero) })} · ${nombre} · ${estado}`; } });
}

function cuadricula(h, parte, oral, abierto) {
  const { el, t, numero } = h;
  const panel = el('div', { class: 'av-panel', hidden: true });
  const fichas = [];
  const abrir = (b, boton) => {
    const ya = boton.getAttribute('aria-expanded') === 'true';
    fichas.forEach(f => f.setAttribute('aria-expanded', 'false'));
    if (ya) { panel.hidden = true; abierto.id = null; return; }
    boton.setAttribute('aria-expanded', 'true');
    abierto.id = b.id;
    const leyenda = el('p', { class: 'av-leyenda suave chica', texto: t('av.toca_punto') });
    panel.replaceChildren(
      el('p', { class: 'av-panel-titulo' }, el('strong', { texto: h.nombreMateria(b.id) }), el('span', { class: 'suave chica', texto: ` · ${t('av.temas', { n: numero(b.hechos), total: numero(b.temas.length) })}` }),
        b.examen ? h.insignia(b.examen.aprobado ? 'bien' : 'atencion', b.examen.aprobado ? t('av.examen_ok') : t('av.examen_no', { pct: h.pctTexto(b.examen.mejor ?? 0) })) : null),
      el('div', { class: 'av-puntos' }, b.temas.map((x, k) => punto(h, b, k, x, leyenda, oral))),
      leyenda);
    panel.hidden = false;
  };
  const lista = el('div', { class: `av-rejilla${oral ? ' oral' : ''}`, role: 'list' }, parte.bloques.map(b => {
    const corto = oral ? t('av.tile.c', { n: numero(b.numero) }) : t('av.tile.m', { n: numero(b.numero) });
    if (b.pronto) {
      return el('span', { role: 'listitem', class: 'av-celda' }, el('span', { class: 'av-ficha pronto', title: h.nombreMateria(b.id), 'aria-label': `${h.nombreMateria(b.id)} · ${t('av.pronto')}` },
        el('span', { class: 'av-ficha-n', texto: corto }), el('span', { class: 'av-ficha-pct', texto: '—' })));
    }
    const boton = el('button', { type: 'button', class: `av-ficha ${tonoPct(b.pct)}${b.actual ? ' actual' : ''}`, 'aria-expanded': 'false', title: h.nombreMateria(b.id),
      'aria-label': `${h.nombreMateria(b.id)} · ${h.pctTexto(b.pct)}${b.actual ? ` · ${t('av.ahora')}` : ''}` },
    el('span', { class: 'av-ficha-n', texto: corto }),
    el('strong', { class: 'av-ficha-pct', texto: h.pctTexto(b.pct) }),
    el('span', { class: 'av-mini' }, h.barraLlena(b.pct)),
    b.examen?.aprobado ? el('span', { class: 'av-ficha-ex', 'aria-hidden': 'true', texto: '★' }) : null);
    boton.addEventListener('click', () => abrir(b, boton));
    fichas.push(boton);
    if (abierto.id === b.id) queueMicrotask(() => abrir(b, boton));
    return el('span', { role: 'listitem', class: 'av-celda' }, boton);
  }));
  return [lista, panel];
}

// El bloque entero. av: { tg, oral, ultima } (o null). completo: la ficha (el «Ahora en» largo).
function contenido(h, av, completo, estado) {
  const { el, t } = h;
  if (!av) return [el('p', { class: 'suave', texto: t('av.sin_empezar') })];
  return [
    el('div', { class: 'av-ahora' }, el('span', { class: 'av-ahora-rotulo', texto: t('av.ahora') }), chipAhora(h, av.tg, false, completo), av.oral ? chipAhora(h, av.oral, true, completo) : null),
    el('div', { class: 'av-totales' }, barraGrande(h, t('av.curso_tg'), av.tg, 'tg'), av.oral ? barraGrande(h, t('av.curso_oral'), av.oral, 'oral') : null),
    el('h4', { class: 'av-sub', texto: t('av.materias') }),
    ...cuadricula(h, av.tg, false, estado.tg),
    av.oral ? [el('h4', { class: 'av-sub', texto: t('av.capitulos') }), ...cuadricula(h, av.oral, true, estado.oral)] : null,
    completo ? el('p', { class: 'suave chica', texto: t('av.nota') }) : null,
  ];
}

// → el nodo (div.av-caja). repintarAvance(nodo, avNuevo, h) lo cambia sin perder la materia abierta.
export function vistaAvanceAlumno(h, av, { completo = false, alumno = null } = {}) {
  const estado = { tg: { id: null }, oral: { id: null } };
  const caja = h.el('div', { class: `av-caja${completo ? ' completo' : ''}`, ...(alumno != null ? { 'data-avance-alumno': String(alumno) } : {}) }, contenido(h, av, completo, estado));
  estados.set(caja, { estado, completo, json: JSON.stringify(av ?? null) });
  return caja;
}
const estados = new WeakMap();
export function repintarAvance(caja, av, h) {
  const e = estados.get(caja);
  if (!e) return false;
  const nuevo = JSON.stringify(av ?? null);
  if (nuevo === e.json) return false;
  e.json = nuevo;
  caja.replaceChildren(...contenido(h, av, e.completo, e.estado).flat(Infinity).filter(Boolean));
  return true;
}
// Para ordenar por avance: el % de todos los temas del Test Guide (si no viene, el avance de antes).
export const pctTg = a => a?.avanceAlumno?.tg?.pct ?? a?.avance?.pct ?? 0;
