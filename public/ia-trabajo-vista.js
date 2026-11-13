// 0.14.2: Administrador → Contenido → «Lo que hizo la IA» (#contenido/ia-hizo) y «Pídele a la IA» (#contenido/pidele).
// Sin librerías; todo texto con textContent y sin estilos en línea. Las piezas llegan de app.js en «h» (este módulo no
// importa nada). Lo que se decide está en el servidor (src/academia/ia-hizo.js y src/academia/pidele.js).
const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(micro > 0 && micro < 10_000 ? 3 : 2)}`;
const horas = ms => (ms <= 0 ? '—' : ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 172_800_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 86_400_000)} días`);
const NOMBRE_PROVEEDOR = { anthropic: 'Claude', openai: 'ChatGPT', propia: 'API propia' };
export const nombreProveedor = id => NOMBRE_PROVEEDOR[id] ?? id ?? '—';

// 0.14.8: el estado de un cambio de la app, en la frase del chat.
const CHAT_APP = { instalado: 'listo', no_paso: 'no_paso', rechazado: 'no_paso', fallido: 'no_paso', esperando_token: 'token', esperando_aprobar: 'aprobar', conflicto: 'conflicto', idea: 'idea', deshecho: 'deshecho', no_instalado: 'deshecho', deshacer: 'deshecho', nada: 'nada', subido: 'subido' };
const nombreMateria = (h, id) => (id ? h.tSi(`acad.materia.${id}`, id) : '');

// El botón grande de «Pausar / Reanudar» TODO el trabajo de la IA (fábrica + chat).
function botonPausa(h, pausada) {
  const { el, t } = h;
  return el('button', {
    type: 'button', class: `boton-3d ${pausada ? 'verde' : 'blanco'} con-icono`,
    onclick: async e => {
      e.currentTarget.disabled = true;
      const r = await h.api('POST', '/api/admin/academia/fabrica/pausa', { pausada: !pausada });
      h.avisar(r.ok ? t(pausada ? 'iahizo.reanudada' : 'iahizo.pausada') : h.textoError(r.datos.error), r.ok ? 'bien' : 'mal');
      h.recargar();
    },
  }, h.icono(pausada ? 'play' : 'pausa'), el('span', { texto: t(pausada ? 'iahizo.reanudar' : 'iahizo.pausar') }));
}

function cifra(h, valor, etiqueta, detalle = null) {
  const { el } = h;
  return el('div', { class: 'iahizo-cifra' }, el('strong', { class: 'iahizo-numero', texto: valor }), el('span', { class: 'iahizo-etiqueta', texto: etiqueta }), detalle ? el('span', { class: 'suave chica', texto: detalle }) : null);
}

// «Antes → después» de una entrada, en palabras simples.
function antesDespues(h, c) {
  const { t } = h;
  const d = c.despues ?? {};
  const a = c.antes ?? {};
  if (c.que === 'materia_publicada' || c.que === 'materia_en_revision') return t('iahizo.ad.materia', { antes: a.version ? t('iahizo.ad.version', { n: a.version }) : t('iahizo.ad.sin_publicar'), temas: d.temas ?? 0, preguntas: d.preguntas ?? 0, dudas: d.dudas ?? 0 });
  if (c.que === 'clase_reescrita' || c.que === 'pedido_hecho') return t('iahizo.ad.clase', { antes: a.version ? t('iahizo.ad.version', { n: a.version }) : '—', temas: d.temas ?? 0, dudas: d.dudas ?? 0 });
  if (c.que === 'correccion') return t('iahizo.ad.correccion', { que: a.que ?? '—', porque: d.porque ?? '—' });
  if (c.que === 'revision_errores') return t('iahizo.ad.revision', { temas: d.temas ?? 0, dudas: d.dudas ?? 0, errores: d.errores ?? 0 });
  return '';
}

export function pantallaLoQueHizo(d, h) {
  const { el, t } = h;
  const n = d.numeros;
  const cabeza = el('section', { class: 'tarjeta iahizo-cabeza' },
    el('h2', { class: 'con-icono' }, h.icono('chispa', 'icono grande'), el('span', { texto: t('admin.pestana.ia_hizo') })),
    el('p', { class: 'suave', texto: t('iahizo.linea') }),
    el('p', {}, el('strong', { texto: n.pausada ? t('iahizo.estado.pausada') : n.proveedor ? t('iahizo.estado.trabaja', { proveedor: nombreProveedor(n.proveedor), modelo: n.modelo ?? '' }) : t('iahizo.estado.sin_ia') })),
    el('div', { class: 'botones' }, botonPausa(h, n.pausada), el('a', { class: 'boton-enlace secundario con-icono', href: '#contenido/pidele' }, h.icono('chispa'), el('span', { texto: t('admin.pestana.pidele') }))));
  const dn = n.dinero;
  const cifras = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('iahizo.numeros') }),
    el('div', { class: 'iahizo-cifras' },
      cifra(h, `${n.tg.hechas}/${n.tg.total}`, t('iahizo.cifra.tg'), t('iahizo.cifra.detalle', { curso: n.tg.enCurso, revision: n.tg.revision, pendientes: n.tg.pendientes })),
      cifra(h, `${n.oral.hechas}/${n.oral.total}`, t('iahizo.cifra.oral'), t('iahizo.cifra.detalle', { curso: n.oral.enCurso, revision: n.oral.revision, pendientes: n.oral.pendientes })),
      cifra(h, h.numero(n.temasMejorados), t('iahizo.cifra.temas')),
      cifra(h, `${h.numero(n.preguntas.conExplicacion)}/${h.numero(n.preguntas.tg)}`, t('iahizo.cifra.preguntas')),
      cifra(h, h.numero(n.dudasEsperando), t('iahizo.cifra.dudas')),
      cifra(h, horas(n.etaMs), t('iahizo.cifra.eta'), n.faltaMicro ? t('iahizo.cifra.falta_dinero', { usd: usd(n.faltaMicro) }) : null)),
    el('h4', { texto: t('iahizo.dinero') }),
    el('ul', { class: 'lista-simple chica' },
      el('li', { texto: t('iahizo.dinero.mes', { usado: usd(dn.mesMicro), tope: usd(dn.topeMesMicro) }) }),
      el('li', { texto: t('iahizo.dinero.fabrica', { usado: usd(dn.fabricaMicro), tope: usd(dn.fabricaTopeMicro) }) }),
      el('li', { texto: t('iahizo.dinero.profunda', { usado: usd(dn.profundaMicro), tope: usd(dn.profundaTopeMicro) }) }),
      el('li', { texto: t('iahizo.dinero.chat', { usado: usd(dn.chatMicro), tope: usd(dn.chatTopeMicro) }) }),
      el('li', { texto: t('iahizo.dinero.dibujos', { usado: usd(dn.dibujosMicro), tope: usd(dn.dibujosTopeMicro) }) }),
      el('li', { texto: t('iahizo.dinero.mejora', { usado: usd(dn.mejoraMesMicro), tope: usd(dn.mejoraTopeMicro) }) })));
  const textoFalta = x => h.tSi(`iahizo.falta.${x.clave}`, x.clave)
    .replace('{nombre}', x.nombre ?? nombreMateria(h, x.materia)).replace('{materia}', nombreMateria(h, x.materia)).replace('{num}', x.num ?? '')
    .replace('{n}', h.numero(x.n ?? x.temas ?? 0)).replace('{pct}', x.pct ?? 0).replace('{tema}', x.tema ?? '').replace('{archivo}', x.archivo ?? '')
    .replace('{motivo}', x.motivo ? h.tSi(`ia.motivo.${x.motivo}`, x.motivo) : '');
  const falta = el('section', { class: 'tarjeta' },
    el('h3', { texto: t('iahizo.falta') }),
    d.falta.length ? el('ul', { class: 'iahizo-falta' }, d.falta.map(x => el('li', { texto: textoFalta(x) }))) : el('p', { class: 'bien', texto: t('iahizo.falta.nada') }));
  const fila = c => el('li', { class: 'iahizo-cambio' },
    el('p', { class: 'iahizo-cambio-cabeza' },
      el('strong', { texto: h.tSi(`iahizo.que.${c.que}`, c.que) }),
      el('span', { class: 'suave chica', texto: ` · ${h.fecha(c.en)}` })),
    el('p', { texto: [nombreMateria(h, c.materia), c.tema].filter(Boolean).join(' › ') }),
    antesDespues(h, c) ? el('p', { class: 'suave chica', texto: antesDespues(h, c) }) : null,
    c.detalle ? el('p', { class: 'suave chica', texto: `«${c.detalle}»` }) : null,
    el('p', { class: 'chica' },
      el('span', { texto: t('iahizo.costo', { usd: usd(c.costoMicro ?? 0) }) }),
      c.proveedor ? el('span', { texto: ` · ${nombreProveedor(c.proveedor)}${c.modelo ? ` (${c.modelo})` : ''}` }) : null,
      c.revisadoPor === 'anthropic' && c.proveedor && c.proveedor !== 'anthropic' ? el('span', { class: 'insignia tono-bien iahizo-revisado', texto: t('iahizo.revisado_claude') }) : null),
    c.materia ? el('a', { class: 'enlace-claude', href: c.tema ? `#tema/${encodeURIComponent(c.materia)}/${encodeURIComponent(c.tema)}` : '#contenido', texto: t('iahizo.ver_clase') }) : null);
  const registro = el('section', { class: 'tarjeta ancha' },
    el('h3', { texto: t('iahizo.registro') }),
    d.cambios.length ? el('ul', { class: 'iahizo-cambios' }, d.cambios.map(fila)) : h.vacio('manual', t('iahizo.registro.vacio')));
  const materiales = d.materiales.length ? el('section', { class: 'tarjeta' },
    el('h3', { texto: t('iahizo.materiales') }), el('p', { class: 'suave chica', texto: t('iahizo.materiales.explica') }),
    el('ul', { class: 'chica' }, d.materiales.map(x => el('li', { texto: textoFalta({ ...x, clave: `material_${x.clave}` }) })))) : null;
  return el('div', { class: 'rejilla dos' }, cabeza, cifras, falta, materiales, registro);
}

// ---------- «Pídele a la IA» ----------
const ESTADOS_ACTIVOS = new Set(['en_cola', 'trabajando']);
export function pantallaPidele(d, h, { alCambiar } = {}) {
  const { el, t } = h;
  const recargarCon = r => { if (r.ok) alCambiar?.(r.datos); else h.avisar(h.textoError(r.datos.error), 'mal'); };
  const trabajos = new Map(d.trabajos.map(j => [j.id, j]));
  const cajaTrabajo = j => {
    const progreso = j.pasosEstimados ? Math.min(100, Math.round(((j.hechos ?? 0) * 100) / (j.pasosEstimados + 1))) : 0;
    const botones = [];
    if (j.estado === 'propuesto') {
      botones.push(el('button', { type: 'button', class: 'boton-3d verde chico con-icono', disabled: d.pausada,
        onclick: async e => { e.currentTarget.disabled = true; recargarCon(await h.api('POST', `/api/admin/academia/chat/trabajos/${j.id}/hazlo`, {})); } }, h.icono('play'), el('span', { texto: t('pidele.hazlo') })));
    }
    if (['propuesto', 'en_cola', 'trabajando'].includes(j.estado)) {
      botones.push(el('button', { type: 'button', class: 'boton-3d blanco chico',
        onclick: async e => { e.currentTarget.disabled = true; recargarCon(await h.api('POST', `/api/admin/academia/chat/trabajos/${j.id}/cancelar`, {})); } }, el('span', { texto: t('pidele.cancelar') })));
    }
    if (j.estado === 'revision' && j.version) {
      botones.push(el('button', { type: 'button', class: 'boton-3d verde chico',
        onclick: async e => { if (!(await h.confirmar(t('fabrica.publicar_confirmar')))) return; e.currentTarget.disabled = true; recargarCon(await h.api('POST', `/api/admin/academia/chat/trabajos/${j.id}/publicar`, {})); } }, el('span', { texto: t('fabrica.publicar') })));
    }
    const dudas = (j.informe ?? []).flatMap(x => (x.dudas ?? []).map(u => ({ ...u, tema: x.titulo })));
    return el('div', { class: `pidele-trabajo estado-${j.estado}` },
      el('p', {}, el('strong', { texto: t(`pidele.tipo.${j.tipo}`, { materia: j.materiaNombre ?? nombreMateria(h, j.materia), tema: j.temaTitulo ?? '' }) })),
      j.pasos?.length ? el('ol', { class: 'chica' }, j.pasos.map(p => el('li', { texto: p }))) : null,
      el('p', { class: 'suave chica', texto: t('pidele.estimado', { usd: usd(j.estimadoMicro), pasos: j.pasosEstimados ?? '—' }) }),
      el('p', {}, h.insignia(j.estado === 'hecho' ? 'bien' : j.estado === 'fallido' ? 'mal' : 'neutro', h.tSi(`pidele.estado.${j.estado}`, j.estado)),
        j.espera ? el('span', { class: 'suave chica', texto: ` · ${h.tSi(`ia.motivo.${j.espera}`, j.espera)}` }) : null),
      ESTADOS_ACTIVOS.has(j.estado) ? el('progress', { max: 100, value: progreso, 'aria-label': t('fabrica.hecho_pct', { pct: progreso }) }) : null,
      dudas.length ? el('details', { open: true }, el('summary', { texto: t('pidele.informe', { n: dudas.length }) }),
        el('ul', { class: 'chica' }, dudas.map(u => el('li', { texto: `${u.gravedad === 'error' ? '⚠️' : '•'} ${u.tema} › ${u.donde}: ${u.problema}` })))) : null,
      j.estado === 'hecho' && j.tipo === 'revisar_errores' && !dudas.length ? el('p', { class: 'bien chica', texto: t('pidele.sin_errores') }) : null,
      botones.length ? el('div', { class: 'botones' }, botones) : null);
  };
  const burbuja = m => {
    if (m.de === 'dueno') return el('div', { class: 'pidele-msg pidele-dueno' }, el('p', { texto: m.texto }), el('span', { class: 'suave chica', texto: h.fecha(m.en) }));
    // 0.14.8: lo que se pidió de la app va a «Mejorar la app con Claude»: la burbuja dice cómo va.
    const ap = m.appMejora ? d.app?.[m.appMejora] : null;
    const texto = m.appMejora ? t(`appm.chat.${CHAT_APP[ap?.estado] ?? 'haciendo'}`, { titulo: ap?.titulo ?? '' }) : m.avisoTrabajo ? t(`pidele.aviso_trabajo.${m.avisoTrabajo}`) : m.rechazo ? t(`pidele.rechazo.${m.rechazo}`) : m.error ? t('pidele.error', { motivo: h.tSi(`ia.motivo.${m.error}`, m.error) }) : m.texto;
    return el('div', { class: `pidele-msg pidele-ia${m.rechazo ? ' pidele-rechazo' : ''}` },
      el('p', { texto }),
      m.rechazo && m.texto ? el('p', { class: 'suave chica', texto: m.texto }) : null,
      m.planNoValido ? el('p', { class: 'aviso chica', texto: t('pidele.plan_no_valido') }) : null,
      m.trabajo && !m.avisoTrabajo && trabajos.has(m.trabajo) ? cajaTrabajo(trabajos.get(m.trabajo)) : null,
      el('span', { class: 'suave chica', texto: [h.fecha(m.en), m.costoMicro ? usd(m.costoMicro) : null, m.proveedor ? nombreProveedor(m.proveedor) : null].filter(Boolean).join(' · ') }));
  };
  const mensajes = el('div', { class: 'pidele-mensajes', role: 'log', 'aria-live': 'polite' },
    d.mensajes.length ? d.mensajes.map(burbuja) : el('p', { class: 'suave', texto: t('pidele.vacio') }));
  const campo = el('textarea', { id: 'pidele-texto', rows: 3, maxlength: 1000, placeholder: t('pidele.ejemplo'), 'aria-describedby': 'pidele-costo' });
  const enviar = el('button', {
    type: 'button', class: 'boton-3d grande con-icono', disabled: d.pausada,
    onclick: async () => {
      const texto = campo.value.trim();
      if (!texto) return;
      enviar.disabled = true;
      const r = await h.api('POST', '/api/admin/academia/chat', { texto });
      enviar.disabled = false;
      if (r.ok) campo.value = '';
      recargarCon(r);
    },
  }, h.icono('avion_papel'), el('span', { texto: t('pidele.enviar') }));
  const est = d.estimado ?? {};
  const escribir = el('div', { class: 'pidele-escribir' },
    el('label', { for: 'pidele-texto', texto: t('pidele.escribe') }),
    campo,
    el('p', { class: 'suave chica', id: 'pidele-costo', texto: est.proveedor ? t('pidele.costo_mensaje', { usd: usd(est.micro), proveedor: nombreProveedor(est.proveedor) }) : t('pidele.sin_ia', { motivo: h.tSi(`ia.motivo.${est.motivo}`, est.motivo ?? '') }) }),
    d.pausada ? el('p', { class: 'aviso', texto: t('pidele.en_pausa') }) : null,
    el('div', { class: 'botones' }, enviar));
  const otros = d.trabajos.filter(j => !d.mensajes.some(m => m.trabajo === j.id));
  // 0.14.7: «Lo hago solo» (sin «Hazlo») y las «Ideas para cambiar la app» (con «Copiar»).
  const solo = el('input', { type: 'checkbox', id: 'pidele-solo', checked: d.chat?.auto !== false,
    onchange: async e => { const r = await h.api('POST', '/api/admin/academia/fabrica/config', { chat: { auto: e.currentTarget.checked } }); if (!r.ok) h.avisar(h.textoError(r.datos.error), 'mal'); } });
  const copiar = async (texto, boton) => {
    try { await navigator.clipboard.writeText(texto); boton.querySelector('span').textContent = t('pidele.ideas.copiado'); } catch { h.avisar(texto, 'bien'); }
  };
  const botonCopiar = (texto, clave) => el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: e => copiar(texto, e.currentTarget) }, el('span', { texto: t(clave) }));
  const ideas = el('section', { class: 'tarjeta pidele-ideas' },
    el('h3', { texto: t('pidele.ideas.titulo') }),
    el('p', { class: 'suave chica', texto: t('pidele.ideas.linea') }),
    (d.ideas ?? []).length ? el('ul', {}, d.ideas.map(x => el('li', {}, el('span', { texto: `${h.fecha(x.en)} · ${x.texto}` }), botonCopiar(x.texto, 'pidele.ideas.copiar')))) : el('p', { class: 'suave', texto: t('pidele.ideas.vacio') }),
    (d.ideas ?? []).length ? el('div', { class: 'botones' }, botonCopiar(d.ideas.map(x => `- ${x.texto}`).join('\n'), 'pidele.ideas.copiar_todas')) : null);
  return el('div', { class: 'rejilla dos' },
    el('section', { class: 'tarjeta ancha pidele' },
      el('h2', { class: 'con-icono' }, h.icono('chispa', 'icono grande'), el('span', { texto: t('admin.pestana.pidele') })),
      el('p', { class: 'suave', texto: t('pidele.linea') }),
      el('ul', { class: 'chica suave' }, ['ejemplo1', 'ejemplo2', 'ejemplo3'].map(k => el('li', { texto: t(`pidele.${k}`) }))),
      el('div', { class: 'botones' }, botonPausa(h, d.pausada), el('a', { class: 'boton-enlace secundario con-icono', href: '#contenido/ia-hizo' }, h.icono('manual'), el('span', { texto: t('admin.pestana.ia_hizo') }))),
      el('label', { class: 'con-casilla' }, solo, el('span', { texto: t('pidele.solo') })),
      el('p', { class: 'suave chica', texto: t('pidele.solo_linea', { tope: usd(d.chat?.topeMicro ?? 0) }) }),
      mensajes, escribir,
      el('p', { class: 'suave chica', texto: t('pidele.gasto', { usd: usd(d.gastoMicro) }) })),
    otros.length ? el('section', { class: 'tarjeta' }, el('h3', { texto: t('pidele.trabajos') }), otros.map(cajaTrabajo)) : null,
    ideas);
}
