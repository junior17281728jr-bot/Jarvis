// 0.13.0: Administrador → Contenido → «Fábrica de materias» (#contenido/fabrica). Por materia: estado, % hecho, gasto,
// tiempo estimado, lo que falta y el informe de verificación; el plan de trabajo por pista; pausar, reanudar, reiniciar,
// publicar lo revisado, los topes y la «Mejora continua». Sin librerías; todo texto con textContent y sin estilos en línea.
// Las piezas llegan de app.js en «h» (este módulo no importa nada).
const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;
const horas = ms => (ms <= 0 ? '—' : ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${Math.round(ms / 3_600_000)} h`);
const LISTAS = ['publicada', 'ya_publicada'];

export function pantallaFabrica(d, h) {
  const { el, t } = h;
  const accion = (texto, ruta, datos = {}, { clase = 'blanco', confirmar = null } = {}) => el('button', {
    type: 'button', class: `boton-3d chico ${clase}`, onclick: async e => {
      if (confirmar && !(await h.confirmar(confirmar))) return;
      e.currentTarget.disabled = true;
      const r = await h.api('POST', ruta, datos);
      h.avisar(r.ok ? t('fabrica.hecho') : h.textoError(r.datos.error), r.ok ? 'bien' : 'mal');
      h.recargar();
    },
  }, el('span', { texto }));
  const motivo = d.general?.espera?.motivo ?? null;
  const espera = motivo ? h.tSi(`fabrica.espera.${motivo}`, h.tSi(`ia.motivo.${motivo}`, motivo)) : null;
  const cabeza = el('section', { class: 'tarjeta fabrica-cabeza' },
    el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('admin.pestana.fabrica') })),
    el('p', { class: 'suave', texto: t('fabrica.linea') }),
    el('p', {}, el('strong', { texto: h.tSi(`fabrica.estado.${d.estado}`, d.estado) }), espera ? el('span', { class: 'suave', texto: ` · ${espera}` }) : null),
    el('p', { class: 'suave chica', texto: t('fabrica.resumen', { gasto: usd(d.gastoMicro), tope: usd(d.config.topeMicro), falta: usd(d.faltaMicro), eta: horas(d.etaMs), cuota: h.numero(d.cuota.propia) }) }),
    el('div', { class: 'botones' },
      d.config.pausada ? accion(t('fabrica.reanudar'), '/api/admin/academia/fabrica/pausa', { pausada: false }, { clase: 'verde' }) : accion(t('fabrica.pausar'), '/api/admin/academia/fabrica/pausa', { pausada: true }),
      accion(t('fabrica.ahora'), '/api/admin/academia/fabrica/ahora')));
  const f = d.fuentes;
  const fuentes = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('fabrica.fuentes.titulo') }),
    el('p', { class: f?.ok ? 'suave' : 'mensaje error', texto: !f ? t('fabrica.fuentes.nunca') : f.ok ? t('fabrica.fuentes.bien', { en: f.en ? h.fecha(f.en) : '—' }) : t('fabrica.fuentes.mal') }),
    f?.errores?.length ? el('ul', { class: 'chica' }, f.errores.map(e => el('li', { texto: `${e.ruta}: ${e.motivo}` }))) : null,
    f?.faltan?.length ? el('p', { class: 'suave chica', texto: t('fabrica.fuentes.faltan', { lista: f.faltan.slice(0, 8).join(', ') }) }) : null);
  const informe = m => el('details', {
    ontoggle: async e => {
      const caja = e.currentTarget.querySelector('.fabrica-informe');
      if (!e.currentTarget.open || caja.dataset.cargado) return;
      caja.dataset.cargado = '1';
      const r = await h.api('GET', `/api/admin/academia/fabrica/${encodeURIComponent(m.id)}/informe`);
      if (!r.ok) { caja.replaceChildren(el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) })); return; }
      const x = r.datos;
      const errores = [...x.errores, ...x.tgAlterado.map(id => ({ ruta: id, motivo: 'tg_alterado' }))];
      caja.replaceChildren(...[
        x.problema ? el('p', { class: 'mensaje error', texto: h.tSi(`fabrica.problema.${x.problema}`, x.problema) }) : null,
        el('h4', { texto: t('fabrica.informe.dudas', { n: x.dudas.length }) }),
        el('ul', { class: 'chica' }, x.dudas.map(u => el('li', {},
          el('strong', { texto: `${u.gravedad === 'error' ? '⚠️' : '•'} ${u.donde}` }),
          el('span', { texto: ` — ${h.tSi(`fabrica.duda.${String(u.problema).split(':')[0]}`, u.problema)}` })))),
        x.corregidos.length ? el('p', { class: 'suave chica', texto: t('fabrica.informe.corregidos', { n: x.corregidos.length }) }) : null,
        ...errores.map(e2 => el('p', { class: 'mensaje error chica', texto: `${e2.ruta}: ${e2.motivo}` })),
      ].filter(Boolean));
    },
  }, el('summary', { texto: t('fabrica.ver_informe') }), el('div', { class: 'fabrica-informe' }, el('p', { class: 'suave', texto: t('reporte.preparando') })));
  const fila = (m, { oral = false } = {}) => el('article', { class: `fabrica-materia estado-${m.estado}` },
    el('h3', { texto: oral ? t(m.num === 9 ? 'fabrica.oral.escenarios' : 'fabrica.oral.capitulo', { num: m.num, nombre: m.nombre }) : t('fabrica.materia', { num: m.num, nombre: m.nombre }) }),
    // 0.13.1: los temas que ya están publicados (por ejemplo, hechos a mano) se saltan, tema por tema.
    oral && m.yaPublicados ? el('p', { class: 'suave chica', texto: t('fabrica.oral.saltados', { n: m.yaPublicados, de: m.temas }) }) : null,
    el('p', {}, h.insignia(LISTAS.includes(m.estado) ? 'bien' : m.estado === 'revision' ? 'mal' : 'neutro', h.tSi(`fabrica.estado.${m.estado}`, m.estado)),
      m.temaN ? el('span', { class: 'suave chica', texto: ` ${t('fabrica.tema_de', { n: m.temaN, total: m.temas })}` }) : null),
    el('progress', { max: 100, value: m.pct, 'aria-label': t('fabrica.hecho_pct', { pct: m.pct }) }),
    el('p', { class: 'suave chica', texto: t('fabrica.materia_linea', { pct: m.pct, gasto: usd(m.gastoMicro), eta: horas(m.etaMs), falta: usd(m.faltaMicro) }) }),
    m.faltan.length ? el('details', {}, el('summary', { texto: t('fabrica.que_falta', { n: m.faltan.length }) }),
      el('ul', { class: 'chica' }, m.faltan.map(x => el('li', { texto: t('fabrica.falta_tema', { tema: x.titulo, pasos: x.pasos }) })))) : null,
    m.dudas || m.corregidos || m.problema ? informe(m) : null,
    el('div', { class: 'botones' },
      m.estado === 'revision' && m.version ? accion(t('fabrica.publicar'), `/api/admin/academia/fabrica/${encodeURIComponent(m.id)}/publicar`, {}, { clase: 'verde', confirmar: t('fabrica.publicar_confirmar') }) : null,
      LISTAS.includes(m.estado) ? null : accion(t('fabrica.reiniciar'), `/api/admin/academia/fabrica/${encodeURIComponent(m.id)}/reiniciar`, {}, { confirmar: t('fabrica.reiniciar_confirmar') })));
  const filas = d.materias.map(m => fila(m));
  const o = d.oral ?? {};
  const capitulos = (o.capitulos ?? []).map(m => fila(m, { oral: true }));
  const plan = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('fabrica.plan.titulo') }),
    el('p', { class: 'suave chica', texto: t('fabrica.plan.principal', { n: d.materias.length, faltan: d.materias.filter(m => !LISTAS.includes(m.estado)).length }) }),
    filas.length ? el('div', { class: 'fabrica-materias' }, filas) : el('p', { class: 'suave', texto: t('fabrica.plan.vacio') }),
    // 0.13.1: la pista «Preparándote para el examen oral»: sus capítulos (después del Test Guide), con lo que falta.
    el('h3', { texto: t('fabrica.oral.titulo') }),
    el('p', { class: 'suave chica', texto: !o.hay ? t('fabrica.plan.oral_sin') : !o.ok ? t('fabrica.plan.oral_mal') : o.activa ? t('fabrica.plan.oral_activa') : t('fabrica.plan.oral_apagada') }),
    o.errores?.length ? el('ul', { class: 'chica' }, o.errores.map(e => el('li', { texto: `${e.ruta}: ${e.motivo}` }))) : null,
    capitulos.length ? el('p', { class: 'suave chica', texto: t('fabrica.oral.resumen', { n: capitulos.length, faltan: o.capitulos.filter(m => !LISTAS.includes(m.estado)).length }) }) : null,
    capitulos.length ? el('div', { class: 'fabrica-materias' }, capitulos) : null,
    o.hay && o.ok ? (o.activa ? accion(t('fabrica.oral.apagar'), '/api/admin/academia/fabrica/config', { oral: false })
      : accion(t('fabrica.oral.encender'), '/api/admin/academia/fabrica/config', { oral: true }, { clase: 'verde', confirmar: t('fabrica.oral.encender_confirmar') })) : null);
  const tope = el('input', { type: 'text', inputmode: 'decimal', id: 'fabrica-tope', value: ((d.config.topeMicro ?? 0) / 1e6).toFixed(2) });
  const topeMejora = el('input', { type: 'text', inputmode: 'decimal', id: 'fabrica-tope-mejora', value: ((d.config.mejora.topeMesMicro ?? 0) / 1e6).toFixed(2) });
  const mejoraSi = el('input', { type: 'checkbox', id: 'fabrica-mejora', checked: d.config.mejora.activa });
  const ultima = d.mejora;
  const ajustes = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('fabrica.mejora.titulo') }),
    el('p', { class: 'suave chica', texto: t('fabrica.mejora.linea') }),
    el('p', { class: 'chica', texto: ultima?.en ? t('fabrica.mejora.ultima', { en: h.fecha(ultima.en), que: h.tSi(`fabrica.mejora.motivo.${ultima.motivo}`, ultima.motivo ?? ''), gasto: usd(d.mejoraGastoMicro) }) : t('fabrica.mejora.nunca') }),
    ultima?.mejorados?.length ? el('ul', { class: 'chica' }, ultima.mejorados.map(x => el('li', { texto: t('fabrica.mejora.item', { que: x.titulo ?? x.pregunta, porque: x.porque ?? '' }) }))) : null,
    el('form', {
      class: 'fabrica-ajustes', onsubmit: async e => {
        e.preventDefault();
        const r = await h.api('POST', '/api/admin/academia/fabrica/config', { topeUsd: tope.value.trim(), mejora: { activa: mejoraSi.checked, topeUsd: topeMejora.value.trim() } });
        h.avisar(r.ok ? t('fabrica.hecho') : h.textoError(r.datos.error), r.ok ? 'bien' : 'mal');
        if (r.ok) h.recargar();
      },
    },
    el('label', { for: 'fabrica-tope', texto: t('fabrica.tope') }), tope,
    el('label', { class: 'con-casilla' }, mejoraSi, el('span', { texto: t('fabrica.mejora.activa') })),
    el('label', { for: 'fabrica-tope-mejora', texto: t('fabrica.mejora.tope') }), topeMejora,
    el('button', { type: 'submit', class: 'boton-3d chico' }, el('span', { texto: t('fabrica.guardar') }))));
  return [cabeza, seccionProfunda(d, h, { accion }), fuentes, plan, ajustes];
}

// 0.13.9: «Mejora profunda de las clases»: apagada por defecto; antes de encenderla se ve cuánto cuesta y cuánto tarda.
// Por materia: estado, % hecho, gasto e informe (con «Publicar» si espera revisión).
const MOSTRAR_PROFUNDA = new Set(['pendiente', 'mejorando', 'verificando', 'revision', 'publicada', 'saltada']);
function seccionProfunda(d, h, { accion }) {
  const { el, t } = h;
  const p = d.profunda;
  if (!p) return null;
  const f = p.falta ?? { temas: 0, pasos: 0, micro: 0, etaMs: 0 };
  const estimado = t('fabrica.profunda.estimado', { temas: h.numero(f.temas), pasos: h.numero(f.pasos), costo: usd(f.micro), eta: horas(f.etaMs) });
  const motivo = p.espera?.motivo ?? null;
  const filas = (p.materias ?? []).filter(m => MOSTRAR_PROFUNDA.has(m.estado)).map(m => el('article', { class: `fabrica-materia estado-${m.estado}` },
    el('h4', { texto: m.oral ? t('fabrica.profunda.oral', { nombre: m.nombre ?? m.id }) : h.tSi(`acad.materia.${m.id}`, m.nombre ?? m.id) }),
    el('p', {}, h.insignia(m.estado === 'publicada' ? 'bien' : m.estado === 'revision' ? 'mal' : 'neutro', h.tSi(`fabrica.profunda.estado.${m.estado}`, m.estado))),
    el('progress', { max: 100, value: m.pct, 'aria-label': t('fabrica.hecho_pct', { pct: m.pct }) }),
    el('p', { class: 'suave chica', texto: t('fabrica.profunda.materia_linea', { pct: m.pct, gasto: usd(m.gastoMicro), temas: h.numero(m.temas), saltados: h.numero(m.saltados) }) }),
    m.estado === 'revision' ? informeProfunda(m, h) : null,
    m.estado === 'revision' && m.version ? el('div', { class: 'botones' }, accion(t('fabrica.publicar'), `/api/admin/academia/fabrica/${encodeURIComponent(m.id)}/profunda/publicar`, {}, { clase: 'verde', confirmar: t('fabrica.publicar_confirmar') })) : null));
  const tope = el('input', { type: 'text', inputmode: 'decimal', id: 'fabrica-tope-profunda', value: ((p.topeMicro ?? 0) / 1e6).toFixed(2) });
  return el('section', { class: 'tarjeta fabrica-profunda' },
    el('h3', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('fabrica.profunda.titulo') })),
    el('p', { class: 'suave', texto: t('fabrica.profunda.linea') }),
    el('p', {}, h.insignia(p.activa ? 'bien' : 'apagado', p.activa ? t('fabrica.profunda.encendida') : t('fabrica.profunda.apagada')),
      motivo && p.activa ? el('span', { class: 'suave', texto: ` · ${h.tSi(`fabrica.espera.${motivo}`, h.tSi(`ia.motivo.${motivo}`, motivo))}` }) : null),
    el('p', { class: 'fuerte', texto: f.temas ? estimado : t('fabrica.profunda.nada') }),
    el('p', { class: 'suave chica', texto: t('fabrica.profunda.gasto', { gasto: usd(p.gastoMicro), tope: usd(p.topeMicro) }) }),
    el('p', { class: 'suave chica', texto: t('fabrica.profunda.orden') }),
    el('div', { class: 'botones' }, p.activa
      ? accion(t('fabrica.profunda.apagar'), '/api/admin/academia/fabrica/config', { profunda: { activa: false } })
      : accion(t('fabrica.profunda.encender'), '/api/admin/academia/fabrica/config', { profunda: { activa: true } }, { clase: 'verde', confirmar: t('fabrica.profunda.encender_confirmar', { estimado: f.temas ? estimado : t('fabrica.profunda.nada'), tope: usd(p.topeMicro) }) })),
    el('form', {
      class: 'fabrica-ajustes', onsubmit: async e => {
        e.preventDefault();
        const r = await h.api('POST', '/api/admin/academia/fabrica/config', { profunda: { topeUsd: tope.value.trim() } });
        h.avisar(r.ok ? t('fabrica.hecho') : h.textoError(r.datos.error), r.ok ? 'bien' : 'mal');
        if (r.ok) h.recargar();
      },
    }, el('label', { for: 'fabrica-tope-profunda', texto: t('fabrica.profunda.tope') }), tope, el('button', { type: 'submit', class: 'boton-3d chico' }, el('span', { texto: t('fabrica.guardar') }))),
    filas.length ? el('div', { class: 'fabrica-materias' }, filas) : null);
}
function informeProfunda(m, h) {
  const { el, t } = h;
  return el('details', {
    ontoggle: async e => {
      const caja = e.currentTarget.querySelector('.fabrica-informe');
      if (!e.currentTarget.open || caja.dataset.cargado) return;
      caja.dataset.cargado = '1';
      const r = await h.api('GET', `/api/admin/academia/fabrica/${encodeURIComponent(m.id)}/profunda/informe`);
      if (!r.ok) { caja.replaceChildren(el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) })); return; }
      const x = r.datos;
      caja.replaceChildren(...[
        x.problema ? el('p', { class: 'mensaje error', texto: h.tSi(`fabrica.problema.${x.problema}`, x.problema) }) : null,
        el('h4', { texto: t('fabrica.informe.dudas', { n: x.dudas.length }) }),
        el('ul', { class: 'chica' }, x.dudas.map(u => el('li', {},
          el('strong', { texto: `${u.gravedad === 'error' ? '⚠️' : '•'} ${u.donde}` }),
          el('span', { texto: ` — ${h.tSi(`fabrica.duda.${String(u.problema).split(':')[0]}`, u.problema)}` })))),
        ...(x.errores ?? []).map(e2 => el('p', { class: 'mensaje error chica', texto: `${e2.ruta}: ${e2.motivo}` })),
      ].filter(Boolean));
    },
  }, el('summary', { texto: t('fabrica.ver_informe') }), el('div', { class: 'fabrica-informe' }, el('p', { class: 'suave', texto: t('reporte.preparando') })));
}
