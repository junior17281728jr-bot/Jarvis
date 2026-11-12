// 0.12.3: lo delicado del administrador (datos del banco y paquetes, claves de la IA, el token del bot y unir el chat de
// Telegram, la contraseña de otra persona, crear o tocar a otro administrador, la clave de recuperación) pide su contraseña
// otra vez. El servidor responde 403 «confirmar_clave» (o «clave_confirmar_incorrecta»); esta ventanita la pide y el mismo
// pedido se repite con la cabecera X-Confirmar-Clave (base64 de UTF-8). La contraseña nunca se guarda: vive solo en ese
// pedido. Sin librerías; todo texto con textContent.

export const ERRORES_CONFIRMAR = Object.freeze(['confirmar_clave', 'clave_confirmar_incorrecta']);

// La contraseña tal como va en la cabecera (los navegadores solo aceptan latin-1 en una cabecera: por eso base64).
export function cabeceraDeClave(clave) {
  const bytes = new TextEncoder().encode(String(clave));
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

// → Promise<string | null> (null: canceló). h: { el, t }. error: la clave del error anterior (para decir «no es esa»).
export function pedirClaveAdmin(h, { error = null } = {}) {
  const { el, t } = h;
  return new Promise(resolver => {
    const anterior = document.activeElement;
    const campo = el('input', { id: 'confirmar-clave-campo', type: 'password', autocomplete: 'current-password', maxlength: 200, required: true });
    const linea = el('p', { class: 'mensaje error', role: 'alert', id: 'confirmar-clave-error', hidden: !error });
    if (error) linea.textContent = error === 'clave_confirmar_incorrecta' ? t('confirmar.incorrecta') : t(`error.${error}`);
    let listo = false;
    const terminar = valor => {
      if (listo) return;
      listo = true;
      capa.remove();
      try { anterior?.focus?.(); } catch { /* ya no está */ }
      resolver(valor);
    };
    const formulario = el('form', { class: 'tarjeta confirmar-clave-caja', novalidate: true },
      el('h2', { id: 'confirmar-clave-titulo', class: 'con-icono' }, el('span', { texto: t('confirmar.titulo') })),
      el('p', { id: 'confirmar-clave-linea', texto: t('confirmar.linea') }),
      el('label', { for: 'confirmar-clave-campo', texto: t('confirmar.campo') }),
      campo,
      linea,
      el('div', { class: 'botones' },
        el('button', { type: 'button', class: 'secundario', texto: t('confirmar.cancelar'), onclick: () => terminar(null) }),
        el('button', { type: 'submit', texto: t('confirmar.boton') })));
    formulario.addEventListener('submit', evento => {
      evento.preventDefault();
      if (!campo.value) {
        linea.hidden = false;
        linea.textContent = t('confirmar.vacia');
        campo.focus();
        return;
      }
      terminar(campo.value);
    });
    const capa = el('div', { class: 'confirmar-clave', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'confirmar-clave-titulo', 'aria-describedby': 'confirmar-clave-linea' }, formulario);
    capa.addEventListener('keydown', e => { if (e.key === 'Escape') terminar(null); });
    capa.addEventListener('click', e => { if (e.target === capa) terminar(null); });
    document.body.append(capa);
    campo.focus();
  });
}
