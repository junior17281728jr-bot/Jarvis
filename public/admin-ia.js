// 0.12.8 (pedido del dueño): Administrador → Dinero e IA: «IA por alumno» (#ia-alumnos), «Registro de la IA»
// (#ia-registro, #ia-registro/<alumno>), el formulario de los planes (dentro de Pagos), «Enviar a mi Telegram» (contratos
// y ficha del alumno) y «Probar el bot» (Claves y Telegram). Sin librerías; todo texto con textContent (nunca como código)
// y sin estilos en línea. Las piezas llegan de app.js en «h» (este módulo no importa nada).

const usd = micro => `US$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;
const anexar = (nodo, ...hijos) => { nodo.append(...hijos.flat(Infinity).filter(x => x != null && x !== false)); return nodo; };
const cambiar = (nodo, ...hijos) => { nodo.replaceChildren(...hijos.flat(Infinity).filter(x => x != null && x !== false)); return nodo; };
export const COMANDOS_BOT = Object.freeze(['resumen', 'gastos', 'pagos', 'alumno', 'contratos', 'ayuda']);
const MOTIVOS_TELEGRAM = Object.freeze(['sin_chat', 'perdido', 'sin_token', 'clave_no_valida', 'sin_probar', 'pausa', 'bloqueado', 'tope_archivos', 'no_existe']);

// ---------- «Enviar a mi Telegram» ----------
// Un botón que manda (POST ruta datos) y dice al lado «Enviado ✔» o un error claro con el enlace a Claves y Telegram.
// Se puede tocar las veces que quiera (el servidor pide 3 s entre uno y otro: «Espera N s»).
export function botonTelegram(h, { ruta, datos = {}, texto, chico = true }) {
  const { el, t } = h;
  const estado = el('span', { class: 'telegram-estado chica', role: 'status' });
  const boton = el('button', { type: 'button', class: `boton-3d blanco${chico ? ' chico' : ''} con-icono`, onclick: async () => {
    boton.disabled = true;
    cambiar(estado, el('span', { class: 'suave', texto: t('ia3.telegram.enviando') }));
    const r = await h.api('POST', ruta, datos);
    boton.disabled = false;
    if (r.ok && r.datos.motivo === 'ok') {
      const n = r.datos.enviados ?? 1;
      return cambiar(estado, el('span', { class: 'tono-bien', texto: n > 1 ? t('ia3.telegram.enviados', { n: h.numero(n) }) : t('ia3.telegram.enviado') }));
    }
    if (!r.ok && r.datos.error === 'espera_telegram') return cambiar(estado, el('span', { class: 'tono-atencion', texto: t('error.espera_telegram', { segundos: r.datos.segundos ?? 3 }) }));
    const motivo = r.ok ? r.datos.motivo : r.datos.error;
    const texto = r.ok ? t(MOTIVOS_TELEGRAM.includes(motivo) ? `ia3.telegram.no.${motivo}` : 'ia3.telegram.no.otro') : h.textoError(motivo);
    cambiar(estado, el('span', { class: 'tono-mal', texto }), ' ', el('a', { class: 'enlace-fuerte', href: '#claves', texto: t('ia3.telegram.ir_claves') }));
  } }, h.icono('avion_papel', 'icono chico'), el('span', { texto: texto ?? t('ia3.telegram.enviar') }));
  return el('span', { class: 'telegram-envio' }, boton, estado);
}

// «Probar el bot» y los comandos para registrar en @BotFather (/setcommands), para copiar.
export function tarjetaBot(h) {
  const { el, t } = h;
  const lista = COMANDOS_BOT.map(c => `${c} - ${t(`bot.botfather.${c}`)}`).join('\n');
  const bloque = el('pre', { class: 'bot-comandos', texto: lista });
  const copiado = el('span', { class: 'suave chica', role: 'status' });
  return el('section', { class: 'tarjeta tarjeta-bot' },
    el('h2', { class: 'con-icono' }, h.icono('avion_papel'), el('span', { texto: t('ia3.bot.titulo') })),
    el('p', { class: 'suave', texto: t('ia3.bot.linea') }),
    el('ul', { class: 'lista-simple chica' }, COMANDOS_BOT.map(c => el('li', { texto: t(`bot.ayuda.${c}`) }))),
    el('div', { class: 'botones' }, botonTelegram(h, { ruta: '/api/admin/telegram/probar-bot', texto: t('ia3.bot.probar'), chico: false })),
    el('details', {}, el('summary', { texto: t('ia3.bot.botfather') }),
      el('p', { class: 'ayuda', texto: t('ia3.bot.botfather_linea') }), bloque,
      el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: async () => {
        try { await navigator.clipboard.writeText(lista); copiado.textContent = t('ia3.bot.copiado'); } catch { copiado.textContent = t('ia3.bot.copia_a_mano'); }
      } }, el('span', { texto: t('ia3.bot.copiar') })), copiado));
}

// ---------- La ficha del alumno: sus contratos (a Telegram) y su IA ----------
export function fichaIa(id, h) {
  const { el, t } = h;
  const lista = el('div', { class: 'ficha-ia-contratos' }, el('p', { class: 'suave', texto: t('reporte.preparando') }));
  const tarjeta = el('section', { class: 'tarjeta ficha-ia' },
    el('h2', { class: 'con-icono' }, h.icono('manual'), el('span', { texto: t('ia3.ficha.titulo') })),
    lista,
    el('div', { class: 'botones' },
      el('a', { class: 'boton-enlace secundario con-icono', href: '#ia-alumnos' }, h.icono('dinero', 'icono chico'), el('span', { texto: t('admin.pestana.ia_alumnos') })),
      el('a', { class: 'boton-enlace secundario con-icono', href: `#ia-registro/${encodeURIComponent(id)}` }, h.icono('chispa', 'icono chico'), el('span', { texto: t('admin.pestana.ia_registro') }))));
  h.api('GET', '/api/admin/contratos').then(r => {
    if (!r.ok) return cambiar(lista, el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) }));
    const suyos = r.datos.contratos.filter(c => String(c.usuarioId) === String(id));
    if (!suyos.length) return cambiar(lista, el('p', { class: 'suave', texto: t('ia3.ficha.sin_firmas') }));
    cambiar(lista,
      el('ul', { class: 'lista-simple' }, suyos.map(c => el('li', { class: 'ficha-ia-firma' },
        el('a', { class: 'enlace-fuerte', href: `#contrato/${c.usuarioId}/${c.n}`, texto: t('ia3.ficha.firma', { v: h.numero(c.version), fecha: h.fecha(c.en) }) }),
        botonTelegram(h, { ruta: `/api/admin/telegram/contratos/${c.usuarioId}/${c.n}` })))),
      suyos.length > 1 ? el('div', { class: 'botones' }, botonTelegram(h, { ruta: '/api/admin/telegram/contratos', datos: { usuario: Number(id) }, texto: t('ia3.telegram.todos'), chico: false })) : null);
  });
  return tarjeta;
}

// ---------- IA por alumno ----------
function estadoIa(f, t, h) {
  if (f.pausada) return h.insignia('mal', t('ia3.estado.pausada'));
  if (f.plan && !f.plan.vencido) return h.insignia('bien', t('ia3.estado.plan', { nombre: f.plan.nombre ?? f.plan.id, quedan: h.numero(f.plan.quedan), usos: h.numero(f.plan.usos) }));
  if (f.prueba && !f.prueba.terminada) return h.insignia('info', f.prueba.empezada ? t('ia3.estado.prueba', { dias: h.numero(f.prueba.quedanDias) }) : t('ia3.estado.prueba_sin_empezar'));
  if (f.fuente === 'minutos') return h.insignia('info', t('ia3.estado.minutos', { n: h.numero(f.minutos) }));
  return h.insignia('apagado', t('ia3.estado.basico'));
}
const ORDENES = Object.freeze({
  gasto: (a, b) => b.usdMesMicro - a.usdMesMicro || b.usosMes - a.usosMes,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre),
  vence: (a, b) => String(a.vence ?? '9999').localeCompare(String(b.vence ?? '9999')),
});

export function pantallaIaAlumnos(d, h) {
  const { el, t } = h;
  let orden = 'gasto';
  const lista = el('div', { class: 'ia-alumnos-lista' });
  const accion = async (ruta, datos, bien) => {
    const r = await h.api('POST', ruta, datos);
    if (!r.ok) return h.avisar(h.textoError(r.datos.error), 'mal');
    h.avisar(bien, 'bien');
    await h.recargar();
  };
  const fila = f => {
    const tope = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'campo-corto', id: `ia-tope-${f.id}`,
      value: f.topePersonalMicro != null ? (f.topePersonalMicro / 1_000_000).toFixed(2) : '', placeholder: t('ia3.tope.del_plan'), 'aria-label': t('ia3.tope.de', { alumno: f.nombre }) });
    const usos = el('input', { type: 'number', min: 1, max: 1000, value: 10, class: 'campo-corto', 'aria-label': t('ia3.regalo.de', { alumno: f.nombre }) });
    const pago = f.pago?.esteMes ? t('ia3.pago.si', { fecha: h.fecha(f.pago.fecha), precio: f.pago.precio ?? '' })
      : f.pago ? t('ia3.pago.no_mes', { fecha: h.fecha(f.pago.fecha), precio: f.pago.precio ?? '' }) : t('ia3.pago.nunca');
    return el('article', { class: `ia-alumno${f.pausada ? ' pausada' : ''}` },
      el('header', { class: 'ia-alumno-cabeza' },
        el('div', {}, el('strong', { texto: f.nombre }), el('span', { class: 'suave chica', texto: ` @${f.usuario}` })), estadoIa(f, t, h)),
      el('p', { class: 'ia-alumno-mes' }, el('span', { texto: t('ia3.mes', { usos: h.numero(f.usosMes), usado: usd(f.usdMesMicro), tope: usd(f.topeMicro) }) }),
        el('span', { class: 'suave chica', texto: ` · ${t(`ia3.tope.fuente.${['plan', 'prueba', 'personal', 'pausa', 'minutos'].includes(f.topeFuente) ? f.topeFuente : 'cuenta'}`)}` })),
      el('progress', { class: 'ia-alumno-barra', max: Math.max(1, f.topeMicro), value: Math.min(f.usdMesMicro, Math.max(1, f.topeMicro)), 'aria-label': t('ia3.mes_barra') }),
      el('p', { class: `chica ${f.pago?.esteMes ? 'tono-bien' : 'suave'}`, texto: pago }),
      f.vence ? el('p', { class: 'suave chica', texto: t('ia3.vence', { fecha: h.fecha(f.vence) }) }) : null,
      el('div', { class: 'ia-alumno-tope' },
        el('label', { for: `ia-tope-${f.id}`, class: 'chica', texto: t('ia3.tope.etiqueta') }), tope,
        el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => accion(`/api/admin/academia/alumnos/${f.id}/tope`, { usd: tope.value.trim() || null }, t('ia3.tope.listo', { alumno: f.nombre })) }, el('span', { texto: t('ia3.guardar') }))),
      el('div', { class: 'botones ia-alumno-acciones' },
        d.modo === 'planes' ? el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => accion(`/api/admin/academia/alumnos/${f.id}/prueba`, {}, t('plan.admin.prueba_lista', { alumno: f.nombre })) }, el('span', { texto: t('plan.admin.dar_prueba') })) : null,
        el('span', { class: 'ia-alumno-regalo' }, usos,
          el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => accion(`/api/admin/academia/alumnos/${f.id}/regalo`, { usos: Number(usos.value) }, t('ia3.regalo.listo', { n: h.numero(Number(usos.value)), alumno: f.nombre })) }, el('span', { texto: t('ia3.regalo.boton') }))),
        el('button', { type: 'button', class: `boton-3d chico ${f.pausada ? '' : 'rojo'}`, onclick: async () => {
          if (!f.pausada && !(await h.confirmar(t('ia3.pausa.pregunta', { alumno: f.nombre }), { si: t('ia3.pausa.boton'), peligro: true }))) return;
          accion(`/api/admin/academia/alumnos/${f.id}/pausa`, { pausada: !f.pausada }, t(f.pausada ? 'ia3.pausa.reanudada' : 'ia3.pausa.lista', { alumno: f.nombre }));
        } }, el('span', { texto: t(f.pausada ? 'ia3.pausa.reanudar' : 'ia3.pausa.boton') }))),
      el('a', { class: 'enlace-fuerte chica', href: `#ia-registro/${f.id}`, texto: t('ia3.ver_registro') }));
  };
  const pintar = () => cambiar(lista, ...(d.filas.length ? [...d.filas].sort(ORDENES[orden]).map(fila) : [h.vacio('personas', t('ia3.sin_alumnos'))]));
  const ordenar = el('select', { id: 'ia-alumnos-orden', onchange: e => { orden = e.currentTarget.value; pintar(); } },
    Object.keys(ORDENES).map(k => el('option', { value: k, texto: t(`ia3.orden.${k}`) })));
  pintar();
  const tt = d.totales;
  return [
    el('section', { class: 'tarjeta ia-alumnos' },
      el('h2', { class: 'con-icono' }, h.icono('dinero'), el('span', { texto: t('admin.pestana.ia_alumnos') })),
      el('p', { class: 'suave', texto: t('ia3.linea') }),
      el('div', { class: 'ia-alumnos-barra' }, el('label', { for: 'ia-alumnos-orden', texto: t('ia3.orden') }), ordenar),
      lista,
      el('div', { class: 'ia-alumnos-totales', role: 'status' },
        el('strong', { texto: t('ia3.totales') }),
        el('span', { texto: t('ia3.totales.linea', { n: h.numero(tt.alumnos), usos: h.numero(tt.usosMes), usado: usd(tt.usdMesMicro), pagaron: h.numero(tt.pagaronMes), plan: h.numero(tt.conPlan) }) }),
        el('span', { class: 'suave chica', texto: t('ia3.totales.general', { usado: usd(tt.generalMicro), tope: usd(tt.topeGeneralMicro) }) }))),
  ];
}

// ---------- Registro de la IA ----------
export function pantallaRegistroIa(d, h) {
  const { el, t } = h;
  const elegir = el('select', { id: 'ia-registro-alumno', onchange: e => { location.hash = e.currentTarget.value ? `#ia-registro/${e.currentTarget.value}` : '#ia-registro'; } },
    el('option', { value: '', texto: t('ia3.registro.elige') }),
    d.alumnos.map(a => el('option', { value: a.id, selected: d.registro?.alumno.id === a.id, texto: `${a.nombre} (@${a.usuario})` })));
  const g = d.registro;
  const conclusion = c => (c?.clave ? h.tSi(`tutor.memoria.${c.clave}`, '', c.vars ?? {}) : '');
  const alumno = g ? el('section', { class: 'tarjeta registro-alumno' },
    el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('ia3.registro.de', { alumno: g.alumno.nombre }) })),
    el('dl', { class: 'registro-datos' },
      el('dt', { texto: t('ia3.registro.meta') }), el('dd', { texto: h.tSi(g.meta, t('tutor.meta.texto')) }),
      el('dt', { texto: t('ia3.registro.foco') }), el('dd', { texto: g.foco ? t('ia3.registro.foco_concepto', { concepto: g.foco.concepto, tema: g.foco.temaTitulo ?? '', n: h.numero(g.foco.n ?? 1) }) : t('ia3.registro.sin_foco') }),
      el('dt', { texto: t('ia3.registro.proxima') }), el('dd', { texto: g.proximaClase ? t(g.proximaClase.preparada ? 'ia3.registro.proxima_lista' : 'ia3.registro.proxima_sin', { tema: g.proximaClase.titulo ?? '—', dia: g.proximaClase.preparada?.dia ?? '' }) : t('ia3.registro.sin_proxima') }),
      el('dt', { texto: t('ia3.registro.costo') }), el('dd', { texto: t('ia3.registro.costo_linea', { n: h.numero(g.llamadas), costo: usd(g.costoMicro) }) })),
    el('h3', { texto: t('ia3.registro.generado', { n: h.numero(g.generado.length) }) }),
    g.generado.length ? el('ul', { class: 'registro-llamadas' }, g.generado.map(x => el('li', {},
      el('p', {}, el('strong', { texto: h.tSi(`ia3.tipo.${x.tipo}`, x.tipo ?? '') }), el('span', { class: 'suave chica', texto: ` · ${h.fecha(x.fecha)}${x.costoMicro != null ? ` · ${usd(x.costoMicro)}` : ''}` }),
        x.oculto ? h.insignia('mal', t('ia3.biblioteca.oculta')) : null),
      x.texto ? h.talCual('p', x.texto, 'suave chica') : null))) : el('p', { class: 'suave', texto: t('ia3.registro.nada') }),
    g.memoria?.length ? el('details', {}, el('summary', { texto: t('tutor.memoria.titulo') }),
      el('ul', { class: 'registro-llamadas' }, g.memoria.map(x => el('li', {},
        el('p', {}, el('strong', { texto: x.temaTitulo ?? x.tema ?? '' }), el('span', { class: 'suave chica', texto: ` · ${h.fecha(x.en)}${x.pct != null ? ` · ${x.pct} %` : ''}` })),
        conclusion(x.conclusion) ? el('p', { class: 'suave chica', texto: conclusion(x.conclusion) }) : null)))) : null) : null;
  // La biblioteca: se pide al abrir (y al buscar).
  const caja = el('div', { class: 'biblioteca-lista' }, el('p', { class: 'suave', texto: t('reporte.preparando') }));
  const resumen = el('p', { class: 'suave', role: 'status' });
  const buscar = el('input', { type: 'search', id: 'biblioteca-buscar', placeholder: t('ia3.biblioteca.buscar_ejemplo'), autocomplete: 'off' });
  const cargar = async () => {
    const r = await h.api('GET', `/api/admin/academia/ia-biblioteca?buscar=${encodeURIComponent(buscar.value.trim())}`);
    if (!r.ok) return cambiar(caja, el('p', { class: 'mensaje error', texto: h.textoError(r.datos.error) }));
    const b = r.datos;
    resumen.textContent = t('ia3.biblioteca.resumen', { n: h.numero(b.total), veces: h.numero(b.vecesReusado), ahorro: usd(b.ahorroMicro) });
    cambiar(caja, ...(b.lista.length ? b.lista.map(x => el('details', { class: `biblioteca-item${x.oculto ? ' oculta' : ''}` },
      el('summary', {},
        el('strong', { texto: h.tSi(`ia3.tipo.${x.tipo}`, x.tipo) }),
        el('span', { class: 'suave chica', texto: ` · ${h.fecha(x.en)} · ${t('ia3.biblioteca.veces', { n: h.numero(x.veces) })}${x.ahorroMicro != null ? ` · ${t('ia3.biblioteca.ahorro', { usd: usd(x.ahorroMicro) })}` : ''}` }),
        x.oculto ? h.insignia('mal', t('ia3.biblioteca.oculta')) : null,
        h.talCual('p', x.corto, 'suave chica biblioteca-corto')),
      h.talCual('p', x.completo, 'biblioteca-texto'),
      el('p', { class: 'suave chica', texto: t('ia3.biblioteca.costo', { costo: x.costoMicro != null ? usd(x.costoMicro) : '—', modelo: x.modelo ?? '—' }) }),
      el('button', { type: 'button', class: `boton-3d chico ${x.oculto ? 'blanco' : 'rojo'}`, onclick: async e => {
        e.currentTarget.disabled = true;
        const o = await h.api('POST', '/api/admin/academia/ia-biblioteca/ocultar', { clave: x.clave, oculto: !x.oculto });
        h.avisar(o.ok ? t(x.oculto ? 'ia3.biblioteca.mostrada' : 'ia3.biblioteca.ocultada') : h.textoError(o.datos.error), o.ok ? 'bien' : 'mal');
        cargar();
      } }, el('span', { texto: t(x.oculto ? 'ia3.biblioteca.mostrar' : 'ia3.biblioteca.ocultar') })))) : [el('p', { class: 'suave', texto: t('ia3.biblioteca.vacia') })]));
  };
  cargar();
  return [
    el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, h.icono('manual'), el('span', { texto: t('admin.pestana.ia_registro') })),
      el('p', { class: 'suave', texto: t('ia3.registro.linea') }),
      el('label', { for: 'ia-registro-alumno', texto: t('ia3.registro.alumno') }), elegir),
    alumno,
    el('section', { class: 'tarjeta biblioteca' },
      el('h2', { class: 'con-icono' }, h.icono('libro'), el('span', { texto: t('ia3.biblioteca.titulo') })),
      el('p', { class: 'suave', texto: t('ia3.biblioteca.linea') }),
      el('form', { class: 'biblioteca-buscar', role: 'search', onsubmit: e => { e.preventDefault(); cargar(); } },
        el('label', { for: 'biblioteca-buscar', class: 'chica', texto: t('ia3.biblioteca.buscar') }), buscar,
        el('button', { type: 'submit', class: 'boton-3d blanco chico' }, el('span', { texto: t('ia3.biblioteca.buscar') }))),
      resumen, caja),
  ];
}

// ---------- Los planes (dentro de Pagos) ----------
// c: la configuración de pagos; estimado: { porUsoMicro, llamadas } (lo que de verdad costó un uso en 30 días).
export function formularioPlanes(c, estimado, h) {
  const { el, t } = h;
  const campo = (id, valor, { tipo = 'text', modo = null, max = 40 } = {}) => el('input', { id: `planes-${id}`, type: tipo, value: valor ?? '', maxlength: tipo === 'text' ? max : null, inputmode: modo, autocomplete: 'off' });
  const etiqueta = (id, clave, nodo, ayuda = null) => el('div', { class: 'campo-planes' }, el('label', { for: `planes-${id}`, texto: t(clave) }), nodo, ayuda ? el('p', { class: 'ayuda', texto: ayuda }) : null);
  const modo = el('select', { id: 'planes-modo' }, ['planes', 'minutos'].map(m => el('option', { value: m, selected: c.modo === m, texto: t(`ia3.planes.modo.${m}`) })));
  const planes = c.planes.map(p => ({ p, nombre: campo(`${p.id}-nombre`, p.nombre), precio: campo(`${p.id}-precio`, p.precioUsd, { modo: 'decimal', max: 7 }), usos: campo(`${p.id}-usos`, p.usos, { tipo: 'number' }) }));
  const prueba = { dias: campo('prueba-dias', c.pruebaDias, { tipo: 'number' }), porDia: campo('prueba-dia', c.pruebaUsosDia, { tipo: 'number' }) };
  const tasa = campo('tasa', c.tasaRd, { modo: 'decimal', max: 7 });
  const presupuestos = Object.fromEntries(['estandar', 'plus', 'prueba'].map(k => [k, campo(`presupuesto-${k}`, c.presupuestos?.[k] ?? '', { modo: 'decimal', max: 5 })]));
  const porUso = estimado?.porUsoMicro;
  const cuenta = el('p', { class: 'suave chica', role: 'status' });
  const recalcular = () => {
    if (!porUso) { cuenta.textContent = t('ia3.planes.estimado_sin'); return; }
    const corto = planes.some(x => porUso * (Number(x.usos.value) || 0) > Number(String(presupuestos[x.p.id]?.value ?? '0').replace(',', '.')) * 1_000_000);
    cuenta.className = `chica ${corto ? 'tono-atencion' : 'suave'}`;
    cuenta.textContent = [planes.map(x => t('ia3.planes.estimado_plan', { nombre: x.nombre.value, usos: h.numero(Number(x.usos.value) || 0), costo: usd(porUso * (Number(x.usos.value) || 0)), presupuesto: `US$${presupuestos[x.p.id]?.value || '0'}` })).join(' · '),
      corto ? t('ia3.planes.no_alcanza') : null].filter(Boolean).join(' ');
  };
  for (const x of [...planes.map(p => p.usos), presupuestos.estandar, presupuestos.plus]) x.addEventListener('input', recalcular);
  recalcular();
  const guardar = el('button', { type: 'button', class: 'boton-3d', onclick: async () => {
    const datos = {
      modo: modo.value,
      planes: planes.map(x => ({ id: x.p.id, nombre: x.nombre.value.trim(), precioUsd: x.precio.value.trim().replace(',', '.'), usos: Number(x.usos.value) })),
      pruebaDias: Number(prueba.dias.value), pruebaUsosDia: Number(prueba.porDia.value), tasaRd: tasa.value.trim().replace(',', '.'),
      presupuestos: Object.fromEntries(Object.entries(presupuestos).map(([k, n]) => [k, n.value.trim().replace(',', '.')])),
    };
    guardar.disabled = true;
    const r = await h.api('POST', '/api/admin/academia/pagos/ajustes', datos);
    guardar.disabled = false;
    if (!r.ok) return r.datos.error === 'confirmar_cancelado' ? null : h.avisar(h.textoError(r.datos.error), 'mal');
    h.avisar(t('pagos.guardado'), 'bien');
    h.recargar?.();
  } }, el('span', { texto: t('ia3.planes.guardar') }));
  return el('section', { class: 'tarjeta planes-form' },
    el('h2', { class: 'con-icono' }, h.icono('chispa'), el('span', { texto: t('ia3.planes.titulo') })),
    el('p', { class: 'suave', texto: t('ia3.planes.linea') }),
    etiqueta('modo', 'ia3.planes.modo', modo, t('ia3.planes.modo_ayuda')),
    planes.map(x => el('fieldset', { class: 'planes-plan' }, el('legend', { texto: x.p.nombre }),
      etiqueta(`${x.p.id}-nombre`, 'ia3.planes.nombre', x.nombre), etiqueta(`${x.p.id}-precio`, 'ia3.planes.precio', x.precio), etiqueta(`${x.p.id}-usos`, 'ia3.planes.usos', x.usos),
      etiqueta(`presupuesto-${x.p.id}`, 'ia3.planes.presupuesto', presupuestos[x.p.id]))),
    el('fieldset', { class: 'planes-plan' }, el('legend', { texto: t('ia3.planes.prueba') }),
      etiqueta('prueba-dias', 'ia3.planes.prueba_dias', prueba.dias), etiqueta('prueba-dia', 'ia3.planes.prueba_dia', prueba.porDia),
      etiqueta('presupuesto-prueba', 'ia3.planes.presupuesto_prueba', presupuestos.prueba)),
    etiqueta('tasa', 'ia3.planes.tasa', tasa, t('ia3.planes.tasa_ayuda')),
    el('p', { class: 'ayuda', texto: t('ia3.planes.presupuesto_ayuda') }), cuenta,
    el('p', { class: 'suave chica con-icono' }, h.icono('candado', 'icono chico'), el('span', { texto: t('pagos.solo_dueno') })), guardar);
}

// ---------- Un solo dispositivo a la vez (Usuarios) ----------
export function tarjetaUnDispositivo(h) {
  const { el, t } = h;
  const casilla = el('input', { type: 'checkbox', id: 'un-dispositivo', disabled: true });
  const estado = el('p', { class: 'suave chica', role: 'status' });
  h.api('GET', '/api/admin/cuentas/un-dispositivo').then(r => { if (r.ok) { casilla.checked = r.datos.activo; casilla.disabled = false; } });
  casilla.addEventListener('change', async () => {
    casilla.disabled = true;
    const r = await h.api('POST', '/api/admin/cuentas/un-dispositivo', { activo: casilla.checked });
    casilla.disabled = false;
    if (!r.ok) { casilla.checked = !casilla.checked; estado.textContent = r.datos.error === 'confirmar_cancelado' ? '' : h.textoError(r.datos.error); return; }
    estado.textContent = t(r.datos.activo ? 'otro_equipo.admin.si' : 'otro_equipo.admin.no');
  });
  return el('section', { class: 'tarjeta tarjeta-un-dispositivo' },
    el('h2', { class: 'con-icono' }, h.icono('candado'), el('span', { texto: t('otro_equipo.admin.titulo') })),
    el('label', { class: 'opcion-casilla', for: 'un-dispositivo' }, casilla, el('span', { texto: t('otro_equipo.admin.casilla') })),
    el('p', { class: 'ayuda', texto: t('otro_equipo.admin.linea') }), estado);
}

export { anexar };
