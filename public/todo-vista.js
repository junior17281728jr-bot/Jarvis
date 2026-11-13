// 0.14.7: «Mejorar todo con Claude (lo mejor)»: el panel «Qué está haciendo Claude ahora» (las 5 fases, cada una con su
// estado ✅ / 🔄 / ⏳, su % y lo que hace ahora en palabras simples), el gasto contra el tope y el único botón del dueño
// («Pausar» / «Seguir»). Si todavía no empezó: «Mejorar todo con Claude (lo mejor)» con el costo estimado ANTES de empezar
// (por etapa, contra el tope de US$90 que se puede cambiar) y, si falta algo, qué hacer en palabras simples.
// Se actualiza solo cada 5 segundos mientras se ve (y la pestaña está abierta). Sin librerías; todo texto con textContent
// y sin estilos en línea. Lo que se decide (filasFases, queHacer, lineasEstimado) es puro y se prueba sin navegador.
const EMOJI = Object.freeze({ hecha: '✅', ahora: '🔄', falta: '⏳', pronto: '🕒' });
export const CADA_MS = 5_000;
const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;

// Las 5 filas del panel, listas para dibujar. → [{ id, estado, emoji, pct, actual: { materia?, tema?, texto? } | null }]
export function filasFases(d) {
  return (d?.fases ?? []).map(f => ({ id: f.id, estado: f.estado, emoji: EMOJI[f.estado] ?? EMOJI.falta, pct: Math.max(0, Math.min(100, Number(f.pct) || 0)), actual: f.actual ?? null }));
}
// El nombre de una materia para la gente («Materia 3: …», «Oral, capítulo 2: …»).
export function nombreMateria(m, t, tSi) {
  if (!m) return '';
  const base = tSi(`acad.materia.${m.id}`, m.nombre ?? m.id);
  return m.oral ? t('todo.oral', { nombre: m.nombre ?? base }) : base;
}
// Lo que falta para empezar (de GET …/profunda: listo.motivo) → la frase que dice qué hacer.
export const queHacer = motivo => `todo.listo.${motivo ?? 'sin_clave'}`;
// Las líneas del estimado para confirmar (con Opus y con Sonnet, por etapa, y lo que queda fuera del tope).
export function lineasEstimado(e, t) {
  const o = e.porModo.opus;
  const s = e.porModo.sonnet;
  const horas = ms => Math.max(1, Math.round(ms / 3_600_000));
  const lineas = [
    t('todo.estimado.tope', { tope: usd(e.topeMicro), gastado: usd(e.gastoMicro) }),
    t('todo.estimado.a', { usd: usd(o.etapas.a) }),
    t('todo.estimado.b'),
    t('todo.estimado.c', { usd: usd(o.etapas.c) }),
    t('todo.estimado.total', { usd: usd(o.totalMicro), horas: horas(o.etaMs), quedan: usd(o.quedanMicro) }),
    t('todo.estimado.sonnet', { usd: usd(s.totalMicro) }),
  ];
  if (o.fuera.length) lineas.push(t('todo.estimado.fuera', { n: o.fuera.length, lista: o.fuera.slice(0, 6).map(x => x.nombre ?? x.id).join(', ') }));
  return lineas;
}

// El panel (se actualiza solo). d: lo de GET /api/admin/academia/profunda (o null: lo pide).
export function panelTodo(h, { d = null, compacto = false } = {}) {
  const { el, t } = h;
  const caja = el('section', { class: `tarjeta todo-panel${compacto ? ' todo-compacto' : ''}`, 'aria-labelledby': 'todo-titulo', 'aria-live': 'polite' });
  let timer = null;
  const pedir = async () => {
    const r = await h.api('GET', '/api/admin/academia/profunda');
    if (!caja.isConnected && timer !== null) return;
    if (r.ok) pintar(r.datos);
    else caja.replaceChildren(el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) }));
  };
  const seguir = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!caja.isConnected) return;
      if (document.hidden) { seguir(); return; }
      pedir().then(seguir, seguir);
    }, CADA_MS);
  };
  const accion = (texto, clase, fn) => el('button', { type: 'button', class: `boton-3d ${clase}`, onclick: async e => { e.currentTarget.disabled = true; await fn(); } }, el('span', { texto }));
  const empezar = async () => {
    const listo = await h.api('GET', '/api/admin/academia/profunda/estimado');
    if (!listo.ok) return h.avisar(h.textoError(listo.datos.error), 'mal');
    if (!listo.datos.listo.listo) { pedir(); return h.avisar(t(queHacer(listo.datos.listo.motivo)), 'mal'); }
    const prueba = await h.api('POST', '/api/admin/academia/profunda/probar', {});
    if (!prueba.ok || prueba.datos.motivo !== 'ok') return h.avisar(t('todo.prueba_mal', { motivo: h.tSi(`ia.motivo.${prueba.datos?.motivo}`, prueba.datos?.motivo ?? '') }), 'mal');
    const tope = await h.confirmar(lineasEstimado(listo.datos, t).join('\n'), { titulo: t('todo.boton'), si: t('todo.empezar'), campo: { etiqueta: t('todo.tope'), valor: (listo.datos.topeMicro / 1_000_000).toFixed(2) } });
    if (tope === false || tope == null) return pedir();
    const r = await h.api('POST', '/api/admin/academia/profunda/empezar', { modelo: 'opus', topeUsd: typeof tope === 'string' ? tope : (listo.datos.topeMicro / 1_000_000).toFixed(2) });
    h.avisar(r.ok ? t('todo.empezo') : r.datos.error && h.tSi(`todo.listo.${r.datos.error}`, '') ? t(`todo.listo.${r.datos.error}`) : h.textoError(r.datos.error), r.ok ? 'bien' : 'mal');
    pedir();
  };
  const pausa = pausada => async () => {
    const r = await h.api('POST', '/api/admin/academia/profunda/pausa', { pausada });
    if (!r.ok) h.avisar(h.textoError(r.datos.error), 'mal');
    pedir();
  };
  function pintar(x) {
    const filas = filasFases(x).map(f => el('li', { class: `todo-fase fase-${f.estado}` },
      el('span', { class: 'todo-emoji', 'aria-hidden': 'true', texto: f.emoji }),
      el('div', { class: 'todo-fase-cuerpo' },
        el('p', {}, el('strong', { texto: t(`todo.fase.${f.id}`) }), el('span', { class: 'suave chica', texto: ` · ${t(`todo.fase_estado.${f.estado}`)}${f.estado === 'pronto' ? '' : ` · ${f.pct} %`}` })),
        f.estado === 'pronto' ? null : el('progress', { max: 100, value: f.pct, 'aria-label': t('fabrica.hecho_pct', { pct: f.pct }) }),
        f.actual && f.estado === 'ahora' ? el('p', { class: 'suave chica', texto: f.actual.texto ?? [nombreMateria(f.actual.materia, t, h.tSi), f.actual.tema].filter(Boolean).join(' › ') }) : null)));
    const hasta = x.hasta ? [nombreMateria(x.hasta.materia, t, h.tSi), x.hasta.tema].filter(Boolean).join(' › ') : '—';
    const linea = x.estado === 'sin_saldo' ? t('todo.estado.sin_saldo', { hasta }) : t(`todo.estado.${x.estado}`, { hasta, modelo: x.modelo === 'opus' ? 'Claude Opus 5.5' : 'Claude Sonnet 5.5' });
    const botones = [];
    if (x.estado === 'apagada') botones.push(accion(t('todo.boton'), 'verde grande', empezar));
    else if (x.estado === 'pausada') botones.push(accion(t('todo.seguir'), 'verde', pausa(false)));
    else if (x.estado !== 'terminada') botones.push(accion(t('todo.pausar'), 'blanco', pausa(true)));
    botones.push(el('a', { class: 'boton-enlace secundario con-icono', href: '#contenido/ia-hizo' }, h.icono('manual'), el('span', { texto: t('admin.pestana.ia_hizo') })));
    if (compacto) botones.push(el('a', { class: 'boton-enlace secundario', href: '#contenido/fabrica' }, el('span', { texto: t('todo.detalle') })));
    caja.replaceChildren(...[
      el('h2', { class: 'con-icono', id: 'todo-titulo' }, h.icono('chispa'), el('span', { texto: t('todo.titulo') })),
      el('p', { class: x.estado === 'sin_saldo' ? 'aviso' : x.estado === 'terminada' ? 'bien' : '' }, el('strong', { texto: linea })),
      x.estado === 'apagada' && x.listo && !x.listo.listo ? el('p', { class: 'aviso chica', texto: t(queHacer(x.listo.motivo)) }) : null,
      el('ol', { class: 'todo-fases' }, filas),
      // Antes de empezar, el tope que trae el botón (US$90 para todo); después, el de la ronda.
      el('p', { class: 'suave chica', texto: x.estado === 'apagada' ? t('todo.tope_antes', { tope: usd(x.topeTodoMicro ?? x.topeMicro) }) : t('todo.gasto', { usado: usd(x.gastoMicro), tope: usd(x.topeMicro), quedan: usd(x.quedanMicro) }) }),
      x.fuera?.length ? el('p', { class: 'suave chica', texto: t('todo.fuera', { n: x.fuera.length, lista: x.fuera.slice(0, 6).map(m => nombreMateria(m, t, h.tSi)).join(', ') }) }) : null,
      el('div', { class: 'botones' }, botones),
    ].filter(Boolean));
  }
  if (d) pintar(d); else caja.append(el('p', { class: 'suave', texto: t('reporte.preparando') }));
  if (!d) pedir();
  timer = 0;
  seguir();
  return caja;
}
