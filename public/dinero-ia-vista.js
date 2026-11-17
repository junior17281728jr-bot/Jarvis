// 0.14.31 (pedido del dueño: «no me especifica mucho»): la tarjeta «Dinero de la IA», arriba de Dinero e IA (entera) y en
// el Resumen (corta). Cada tope como una barra con palabras simples, el pronóstico del mes, la mejora profunda, el tope del
// mes en línea y, por alumno, lo que le queda con «Darle más IA» / «Quitarle IA». Los datos: GET /api/admin/ia/dinero
// (src/academia/dinero-ia.js). Sin librerías; todo texto con textContent y sin estilos en línea. Las piezas llegan en «h».

const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;
const usdRedondo = micro => { const v = (Number(micro) || 0) / 1_000_000; return v >= 10 ? `US$${Math.round(v)}` : `US$${v.toFixed(2)}`; };
const diaCorto = iso => (iso ? new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'es-DO', { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date(iso)) : '');
const paraFecha = iso => (iso ? new Date(Date.parse(iso) - 4 * 3_600_000).toISOString().slice(0, 10) : '');
const TOPES = Object.freeze(['general', 'todo', 'chat', 'mejora', 'alumnos']);

function lineaPronostico(p, t) {
  if (p.estado === 'sin_tope') return { tono: 'atencion', texto: t('dinero.pron.sin_tope') };
  if (p.estado === 'lleno') return { tono: 'mal', texto: t('dinero.pron.lleno') };
  if (p.estado === 'sin_ritmo') return { tono: 'bien', texto: t('dinero.pron.sin_ritmo', { sobra: usdRedondo(p.sobraMicro) }) };
  if (p.estado === 'alcanza') return { tono: p.dias <= 7 ? 'mal' : 'atencion', texto: t('dinero.pron.alcanza', { fecha: diaCorto(p.fecha), dias: p.dias, ritmo: usd(p.ritmoDiaMicro) }) };
  return { tono: 'bien', texto: t('dinero.pron.sobra', { sobra: usdRedondo(p.sobraMicro), ritmo: usd(p.ritmoDiaMicro) }) };
}

function barra(x, h) {
  const { el, t } = h;
  const conTope = x.topeMicro > 0;
  const tono = !conTope ? '' : x.pct >= 100 ? ' tono-mal' : x.pct >= 80 ? ' tono-atencion' : '';
  const texto = conTope ? t(`dinero.tope.${x.id}`, { usado: usd(x.usadoMicro), tope: usdRedondo(x.topeMicro), pct: x.pct })
    : t(`dinero.tope.${x.id}_sin`, { usado: usd(x.usadoMicro) });
  return el('li', { class: `dinero-tope${tono}` },
    el('span', { class: 'dinero-tope-texto', texto }),
    el('span', { class: 'suave chica', texto: ` ${t(`dinero.periodo.${x.periodo}`)}${x.activa === false ? ` · ${t('dinero.apagada')}` : ''}` }),
    el('progress', { class: 'dinero-barra', max: Math.max(1, x.topeMicro ?? 1), value: conTope ? Math.min(x.usadoMicro, x.topeMicro) : 0, 'aria-label': texto }));
}

// La tarjeta. corto: solo topes y pronósticos, con el enlace a Dinero e IA.
export function tarjetaDinero(d, h, { corto = false } = {}) {
  const { el, t } = h;
  const p = lineaPronostico(d.pronostico, t);
  const pr = d.profunda;
  const lineaProfunda = pr.quedanMicro > 0 && pr.temas != null
    ? t('dinero.profunda.temas', { quedan: usdRedondo(pr.quedanMicro), temas: pr.temas, dias: pr.dias })
    : pr.quedanMicro > 0 ? t('dinero.profunda.quedan', { quedan: usdRedondo(pr.quedanMicro) }) : t('dinero.profunda.nada');
  const c = d.conflicto;
  return el('section', { class: `tarjeta dinero-ia${corto ? ' corta' : ''}`, id: 'dinero-ia' },
    el('h2', { class: 'con-icono' }, h.icono('dinero'), el('span', { texto: t('dinero.titulo') })),
    el('p', { class: `dinero-pronostico tono-${p.tono}`, texto: p.texto }),
    c ? el('p', { class: 'aviso con-icono-arriba', role: 'note' }, h.icono('atencion', 'icono chico'),
      el('span', { texto: t('dinero.conflicto', { mejora: usdRedondo(c.profundaMicro), general: usdRedondo(c.generalMicro), para: usdRedondo(c.paraEnMicro), margen: c.margenPct }) })) : null,
    el('ul', { class: 'dinero-topes' }, d.topes.filter(x => TOPES.includes(x.id)).map(x => barra(x, h))),
    el('p', { class: 'dinero-profunda', texto: lineaProfunda }),
    corto ? el('a', { class: 'boton-enlace secundario con-icono', href: '#claves' }, h.icono('dinero', 'icono chico'), el('span', { texto: t('dinero.ver_todo') }))
      : [editarTope(d, h), alumnos(d, h)]);
}

function editarTope(d, h) {
  const { el, t } = h;
  const actual = d.topes.find(x => x.id === 'general')?.topeMicro ?? 0;
  const campo = el('input', { id: 'dinero-tope', type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'campo-corto', value: (actual / 1_000_000).toFixed(0), 'aria-describedby': 'dinero-tope-nota' });
  const guardar = async () => {
    const valor = campo.value.trim().replace(',', '.');
    const r = await h.api('POST', '/api/admin/ia/ajustes', { topeGeneralUsd: valor });
    if (!r.ok) return h.avisar(h.textoError(r.datos.error), 'mal');
    h.avisar(t('dinero.tope_listo', { tope: `US$${valor}` }), 'bien');
    await h.recargar();
  };
  return el('div', { class: 'dinero-editar' },
    el('label', { for: 'dinero-tope', texto: t('dinero.tope_editar') }),
    el('div', { class: 'campo-dinero' }, el('span', { class: 'campo-dinero-signo', 'aria-hidden': 'true', texto: 'US$' }), campo,
      el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: guardar }, el('span', { texto: t('dinero.guardar') }))),
    el('p', { class: 'ayuda', id: 'dinero-tope-nota', texto: t('dinero.tope_max', { max: usdRedondo(d.maxGeneralMicro) }) }));
}

// «Le quedan 120 usos (plan hasta el 30 nov) · 15 regalados, no vencen».
function lineaQueda(a, t) {
  if (a.pausada) return t('dinero.al.pausada');
  const partes = [t('dinero.al.quedan', { n: a.quedan })];
  if (a.plan) partes.push(t(a.plan.regalo ? 'dinero.al.plan_regalo' : 'dinero.al.plan', { n: a.plan.quedan, fecha: diaCorto(a.plan.hasta) }));
  if (a.prueba) partes.push(a.prueba.hasta ? t('dinero.al.prueba', { n: a.prueba.hoy, fecha: diaCorto(a.prueba.hasta) }) : t('dinero.al.prueba_sin', { n: a.prueba.hoy }));
  if (a.usosMinutos > 0) partes.push(t('dinero.al.regalados', { n: a.usosMinutos }));
  return partes.join(' · ');
}

function alumnos(d, h) {
  const { el, t } = h;
  if (!d.alumnos?.length) return el('p', { class: 'suave', texto: t('dinero.al.ninguno') });
  const enviar = async (a, datos, bien) => {
    const r = await h.api('POST', `/api/admin/academia/alumnos/${a.id}/ia-opcion`, datos);
    if (!r.ok) return h.avisar(h.textoError(r.datos.error), 'mal');
    h.avisar(bien, 'bien');
    await h.recargar();
  };
  const opcion = (a, o, accion) => {
    const signo = accion === 'dar' ? '+' : '−';
    const nombre = o.tipo === 'usos' ? t('dinero.op.usos', { signo, n: o.usos }) : t(o.dias === 7 ? 'dinero.op.semana' : 'dinero.op.mes', { signo });
    const costo = accion === 'dar' ? t('dinero.op.cuesta', { costo: usd(o.costoMicro) }) : t('dinero.op.ahorra', { costo: usd(o.costoMicro) });
    const datos = o.tipo === 'usos' ? { accion, tipo: 'usos', usos: o.usos } : { accion, tipo: 'tiempo', dias: o.dias };
    return el('button', { type: 'button', class: `boton-3d chico ${accion === 'dar' ? 'blanco' : 'rojo'}`, onclick: () => enviar(a, datos, t(`dinero.op.listo_${accion}`, { alumno: a.nombre })) },
      el('span', { texto: nombre }), el('span', { class: 'chica suave', texto: ` ${costo}` }));
  };
  const propio = (a, accion) => {
    const n = el('input', { type: 'number', min: 1, max: d.regaloMax, value: 20, class: 'campo-corto', 'aria-label': t('dinero.op.cuantos', { alumno: a.nombre }) });
    const que = el('select', { 'aria-label': t('dinero.op.que') },
      el('option', { value: 'usos', texto: t('dinero.op.unidad_usos') }), d.modo === 'planes' ? el('option', { value: 'dias', texto: t('dinero.op.unidad_dias') }) : null);
    const costo = el('span', { class: 'chica suave' });
    const calcular = () => { const v = Math.max(0, Number(n.value) || 0); costo.textContent = que.value === 'usos' ? t('dinero.op.aprox', { costo: usd(v * d.costoUsoMicro) }) : ''; };
    n.addEventListener('input', calcular); que.addEventListener('change', calcular); calcular();
    return el('span', { class: 'dinero-propio' }, n, que,
      el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => {
        const v = Number(n.value);
        const datos = que.value === 'usos' ? { accion, tipo: 'usos', usos: v } : { accion, tipo: 'tiempo', dias: v };
        enviar(a, datos, t(`dinero.op.listo_${accion}`, { alumno: a.nombre }));
      } }, el('span', { texto: t('dinero.op.aplicar') })), costo);
  };
  const fila = a => {
    const fecha = el('input', { type: 'date', value: paraFecha(a.tiempoRegalado?.hasta), min: paraFecha(a.tiempoRegalado?.base), 'aria-label': t('dinero.al.fecha_de', { alumno: a.nombre }) });
    return el('li', { class: 'dinero-alumno' },
      el('strong', { texto: a.nombre }),
      el('p', { class: 'chica', texto: lineaQueda(a, t) }),
      a.limitaDinero ? el('p', { class: 'chica tono-atencion', texto: t('dinero.al.limita', { tope: usd(a.topeMicro), n: a.porDinero }) }) : null,
      el('details', { class: 'dinero-dar' }, el('summary', { texto: t('dinero.dar') }),
        el('div', { class: 'botones' }, d.opciones.map(o => opcion(a, o, 'dar')), propio(a, 'dar'))),
      el('details', { class: 'dinero-quitar' }, el('summary', { texto: t('dinero.quitar') }),
        el('p', { class: 'ayuda', texto: t('dinero.quitar_nota') }),
        el('div', { class: 'botones' }, d.opciones.map(o => opcion(a, o, 'quitar')), propio(a, 'quitar'),
          el('button', { type: 'button', class: 'boton-3d rojo chico', onclick: async () => {
            if (!(await h.confirmar(t('dinero.quitar_todo_pregunta', { alumno: a.nombre }), { si: t('dinero.quitar_todo'), peligro: true }))) return;
            enviar(a, { accion: 'quitar', tipo: 'todo' }, t('dinero.op.listo_quitar', { alumno: a.nombre }));
          } }, el('span', { texto: t('dinero.quitar_todo') }))),
        a.tiempoRegalado ? el('p', { class: 'dinero-fecha' },
          el('span', { class: 'chica', texto: t('dinero.al.tiempo', { fecha: diaCorto(a.tiempoRegalado.hasta), base: diaCorto(a.tiempoRegalado.base) }) }), ' ', fecha,
          el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => enviar(a, { tipo: 'fecha', fecha: fecha.value }, t('dinero.al.fecha_lista', { alumno: a.nombre })) }, el('span', { texto: t('dinero.al.cambiar_fecha') }))) : null));
  };
  return el('div', { class: 'dinero-alumnos' },
    el('h3', { texto: t('dinero.al.titulo') }),
    el('p', { class: 'ayuda', texto: t('dinero.al.costo', { costo: usd(d.costoUsoMicro) }) }),
    el('ul', { class: 'dinero-alumnos-lista' }, d.alumnos.map(fila)));
}
