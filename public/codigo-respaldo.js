// 0.12.6: Configuración → «Código de acceso de respaldo» (solo administradores; src/cuentas/respaldo.js). Lo pone él
// mismo (8 o más), con su contraseña otra vez (la ventanita de siempre: api() la pide sola ante «confirmar_clave»).
// Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).
export function tarjetaCodigoRespaldo(h) {
  const { el, t, api, caja, decir, textoError, fecha } = h;
  const estadoLinea = el('p', { class: 'suave', texto: '…' });
  const mensaje = caja();
  const id = 'campo-codigo-respaldo';
  const campoCodigo = el('input', { id, type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 200, required: true, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const campoOtra = el('input', { id: `${id}2`, type: 'password', autocomplete: 'new-password', minlength: 8, maxlength: 200, required: true, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const quitar = el('button', { type: 'button', class: 'secundario', hidden: true, texto: t('respaldo.quitar') });
  const pintar = datos => {
    estadoLinea.textContent = datos?.puesto ? t('respaldo.puesto', { fecha: fecha(datos.puestoEn) }) : t('respaldo.ninguno');
    quitar.hidden = !datos?.puesto;
  };
  const formulario = el('form', { novalidate: true },
    el('label', { for: id, texto: t('respaldo.nuevo') }), campoCodigo,
    el('label', { for: `${id}2`, texto: t('respaldo.nuevo2') }), campoOtra,
    el('button', { type: 'submit', texto: t('respaldo.guardar') }));
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    mensaje.hidden = true;
    if (campoCodigo.value.length < 8) return decir(mensaje, textoError('codigo_corto'), 'error');
    if (campoCodigo.value !== campoOtra.value) return decir(mensaje, t('respaldo.distintos'), 'error');
    const r = await api('POST', '/api/yo/codigo-respaldo', { codigo: campoCodigo.value });
    if (!r.ok) return decir(mensaje, textoError(r.datos.error), 'error');
    formulario.reset();
    pintar(r.datos);
    decir(mensaje, t('respaldo.listo'), 'bien');
  });
  quitar.addEventListener('click', async () => {
    mensaje.hidden = true;
    const r = await api('POST', '/api/yo/codigo-respaldo/quitar', {});
    if (!r.ok) return decir(mensaje, textoError(r.datos.error), 'error');
    pintar(r.datos);
    decir(mensaje, t('respaldo.quitado'), 'bien');
  });
  api('GET', '/api/yo/codigo-respaldo').then(r => (r.ok ? pintar(r.datos) : decir(mensaje, textoError(r.datos.error), 'error')));
  return el('section', { class: 'tarjeta' },
    el('h2', { texto: t('respaldo.titulo') }),
    el('p', { class: 'ayuda', texto: t('respaldo.ayuda') }),
    estadoLinea, formulario, quitar, mensaje);
}
