// 0.14.1 (pedido del dueño): Administrador → Sistema → «Pago del servidor» (#pago-servidor) y la línea del Resumen cuando
// el pago está cerca. Lo calcula el servidor (src/avisos/pago-servidor.js: la fecha, los días y el color); aquí solo se
// dibuja. Sin librerías; todo texto con textContent y sin estilos en línea. Las piezas llegan de app.js en «h».

const anexar = (nodo, ...hijos) => { nodo.append(...hijos.flat(Infinity).filter(x => x != null && x !== false)); return nodo; };
const cambiar = (nodo, ...hijos) => { nodo.replaceChildren(...hijos.flat(Infinity).filter(x => x != null && x !== false)); return nodo; };
const local = idioma => (idioma === 'en' ? 'en-US' : 'es-DO');

// «1 dic» (la fecha es un día de RD: se dibuja tal cual, sin zona horaria).
export function fechaCorta(fecha, idioma = 'es') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) return '?';
  return new Intl.DateTimeFormat(local(idioma), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));
}
// «noviembre de 2026»
export function nombreDelMes(mes, idioma = 'es') {
  if (!/^\d{4}-\d{2}$/.test(String(mes ?? ''))) return '?';
  return new Intl.DateTimeFormat(local(idioma), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-15T12:00:00Z`));
}
export const montoTexto = (usd, idioma = 'es') => new Intl.NumberFormat(local(idioma), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd);

// La frase del próximo pago: «Próximo pago: 1 dic (en 18 días)», «hoy», «mañana» o «venció».
export function textoProximo(proximo, t, idioma = 'es') {
  const fecha = fechaCorta(proximo?.fecha, idioma);
  const dias = Number(proximo?.dias);
  if (dias < 0) return t('pago_servidor.vencido', { fecha, dias: -dias });
  if (dias === 0) return t('pago_servidor.proximo.hoy', { fecha });
  if (dias === 1) return t('pago_servidor.proximo.manana', { fecha });
  return t('pago_servidor.proximo', { fecha, dias });
}

// El texto de un recordatorio en la lista de avisos (textoAviso de app.js).
const AVISOS = Object.freeze({ d7: 'aviso.servidor_pago.d7', d2: 'aviso.servidor_pago.d2', d0: 'aviso.servidor_pago.d0', auto: 'aviso.servidor_pago.auto', vencido: 'aviso.servidor_pago.vencido' });
export function textoAvisoPago(aviso, t, idioma = 'es') {
  const etapa = String(aviso?.clave ?? '').split(':')[2];
  const d = aviso?.detalle ?? {};
  const cual = etapa === 'd0' && Number(d.dias) < 0 ? 'vencido' : etapa;
  const monto = Number.isSafeInteger(d.montoCentavos) && d.montoCentavos > 0 ? ` (US$${montoTexto(d.montoCentavos / 100, idioma)})` : '';
  return t(AVISOS[cual] ?? 'aviso.servidor_pago.d7', { fecha: fechaCorta(d.fecha, idioma), dias: Math.abs(Number(d.dias) || 0), monto });
}

// La línea del Resumen de Administrador: solo con el pago guardado y a 7 días o menos (o vencido). Si no, null.
export function lineaResumenPago(datos, h, idioma = 'es') {
  if (!datos?.pago?.configurado || !datos.proximo || datos.proximo.tono === 'bien') return null;
  const { el, t, icono } = h;
  const tono = datos.proximo.tono === 'mal' ? 'mal' : 'atencion';
  return el('a', { class: `tarjeta ancha linea-pago-servidor tono-${tono}`, href: '#pago-servidor' },
    el('span', { class: 'con-icono' }, icono(tono, 'icono tono-color'),
      el('span', { texto: t('pago_servidor.resumen', { texto: textoProximo(datos.proximo, t, idioma) }) })));
}

// La pantalla. datos: lo de GET /api/admin/servidor-pago. h: { el, t, icono, api, textoError }.
export function vistaPagoServidor(datos, h, idioma = 'es') {
  const { el, t, icono } = h;
  let actual = datos;
  const tarjeta = el('section', { class: 'tarjeta pago-servidor' });
  const mensaje = el('p', { class: 'mensaje', role: 'status', hidden: true });
  const decir = (texto, tono = 'bien') => { mensaje.hidden = false; mensaje.className = `mensaje ${tono === 'mal' ? 'error' : 'bien'}`; mensaje.textContent = texto; };

  async function mandar(ruta, cuerpo, listo, boton) {
    if (boton) boton.disabled = true;
    const r = await h.api('POST', ruta, cuerpo);
    if (boton) boton.disabled = false;
    if (!r.ok) return decir(h.textoError(r.datos?.error), 'mal');
    actual = r.datos;
    dibujar();
    decir(listo);
  }

  // Los campos se crean una vez (así lo escrito no se pierde al volver a dibujar el estado).
  const p = datos.pago ?? {};
  const monto = el('input', { id: 'pago-monto', name: 'monto', type: 'text', inputmode: 'decimal', maxlength: 10, autocomplete: 'off', placeholder: '6.00' });
  monto.value = p.montoUsd != null ? Number(p.montoUsd).toFixed(2) : '';
  const dia = el('input', { id: 'pago-dia', name: 'dia', type: 'number', inputmode: 'numeric', min: 1, max: 31, step: 1, required: true });
  dia.value = String(p.dia ?? 1);
  const metodo = el('input', { id: 'pago-metodo', name: 'metodo', type: 'text', maxlength: 60, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  metodo.value = p.metodo ?? '';
  const auto = el('select', { id: 'pago-auto', name: 'automatico' },
    el('option', { value: 'no', texto: t('pago_servidor.auto.no') }),
    el('option', { value: 'si', texto: t('pago_servidor.auto.si') }));
  auto.value = p.automatico ? 'si' : 'no';
  const guardar = el('button', { type: 'submit', class: 'grande', texto: t('pago_servidor.guardar') });
  const formulario = el('form', { class: 'formulario-pago', novalidate: true, onsubmit: evento => {
    evento.preventDefault();
    mandar('/api/admin/servidor-pago', { montoUsd: monto.value.trim(), dia: Number(dia.value), metodo: metodo.value, automatico: auto.value === 'si' }, t('pago_servidor.guardado'), guardar);
  } },
  el('h3', { texto: t('pago_servidor.ajustes') }),
  el('label', { for: 'pago-monto', texto: t('pago_servidor.campo.monto') }), monto,
  el('p', { class: 'ayuda', texto: t('pago_servidor.campo.monto.ayuda') }),
  el('label', { for: 'pago-dia', texto: t('pago_servidor.campo.dia') }), dia,
  el('p', { class: 'ayuda', texto: t('pago_servidor.campo.dia.ayuda') }),
  el('label', { for: 'pago-metodo', texto: t('pago_servidor.campo.metodo') }), metodo,
  el('p', { class: 'aviso con-icono-arriba', role: 'note' }, icono('atencion', 'icono chico'), el('span', { texto: t('pago_servidor.campo.metodo.ayuda') })),
  el('label', { for: 'pago-auto', texto: t('pago_servidor.campo.auto') }), auto,
  el('div', { class: 'botones' }, guardar));

  const estado = el('div', { class: 'pago-estado' });
  function dibujar() {
    const a = actual;
    const pr = a.proximo ?? {};
    const pa = a.pago ?? {};
    const tono = pr.tono ?? 'bien';
    const marcar = el('button', { type: 'button', class: 'secundario con-icono', onclick: e => mandar('/api/admin/servidor-pago/pagado', {}, t('pago_servidor.marcado'), e.currentTarget) },
      icono('bien', 'icono chico'), el('span', { texto: t('pago_servidor.marcar') }));
    cambiar(estado,
      el('div', { class: `estado-grande tono-${tono}` }, icono(tono, 'icono estado'), el('span', { texto: textoProximo(pr, t, idioma) })),
      pa.montoUsd != null ? el('p', { class: 'fuerte', texto: t('pago_servidor.monto', { monto: montoTexto(pa.montoUsd, idioma) }) }) : null,
      pa.automatico ? el('p', { class: 'suave', texto: t('pago_servidor.cobro_solo') }) : null,
      pa.metodo ? el('p', { class: 'suave', texto: pa.metodo }) : null,
      !pa.configurado ? el('p', { class: 'ayuda', texto: t('pago_servidor.sin_configurar') }) : null,
      el('div', { class: 'botones-pago' },
        el('a', { class: 'boton-enlace grande con-icono', href: a.enlaces?.factura, target: '_blank', rel: 'noopener noreferrer' }, icono('dinero'), el('span', { texto: t('pago_servidor.ir_pagar') })),
        el('a', { class: 'enlace-fuerte con-icono', href: a.enlaces?.servidor, target: '_blank', rel: 'noopener noreferrer' }, icono('servidor', 'icono chico'), el('span', { texto: t('pago_servidor.ver_servidor') }))),
      el('p', { class: 'ayuda', texto: t('pago_servidor.abre_aparte') }),
      el('div', { class: 'botones' }, marcar),
      pa.pagadoMes ? el('p', { class: 'suave' }, el('span', { texto: `${t('pago_servidor.pagado', { mes: nombreDelMes(pa.pagadoMes, idioma) })} ` }),
        el('button', { type: 'button', class: 'secundario chico', texto: t('pago_servidor.deshacer'), onclick: e => mandar('/api/admin/servidor-pago/pagado', { deshacer: true }, t('pago_servidor.guardado'), e.currentTarget) })) : null,
      el('p', { class: 'ayuda con-icono-arriba' }, icono('campana', 'icono chico'), el('span', { texto: t(pa.automatico ? 'pago_servidor.recordatorios.auto' : 'pago_servidor.recordatorios') })));
  }
  dibujar();

  anexar(tarjeta,
    el('h2', { class: 'con-icono' }, icono('servidor'), el('span', { texto: t('pago_servidor.titulo') })),
    estado,
    mensaje,
    formulario,
    el('h3', { texto: t('pago_servidor.que_pasa') }),
    el('p', { texto: t('pago_servidor.explica') }),
    el('p', { class: 'con-icono-arriba' }, icono('escudo', 'icono chico'), el('span', {}, el('span', { texto: `${t('pago_servidor.copias')} ` }), el('a', { class: 'enlace-fuerte', href: '#copias', texto: t('pago_servidor.ir_copias') }))));
  return tarjeta;
}
