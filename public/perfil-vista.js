// Academia (0.9.0): Configuración → Mi perfil. Cada persona elige su nombre para mostrar, su avatar de aviación (figura
// y color) y una línea «Mi meta»; y puede cambiar su nombre de usuario (con su contraseña actual). Solo se carga en
// Configuración. Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).
//  - El avatar se ve en la barra de arriba, en el panel «Grupo» y en las listas del administrador.
//  - La meta solo la ven la persona y el administrador (nunca los compañeros).

export function tarjetasPerfil(perfil, h, { alGuardar } = {}) {
  const { el, t, numero } = h;
  const { formas, colores, metaMaxima, nombreVisibleMaximo } = perfil.opciones;
  const inicial = perfil.avatar ? perfil.avatar.split('-') : [null, null];
  let forma = inicial[0];
  let color = inicial[1] ?? colores[0];
  const vista = el('div', { class: 'perfil-vista', 'aria-live': 'polite' });
  const campoNombre = el('input', { id: 'campo-perfil-nombre', type: 'text', maxlength: nombreVisibleMaximo, value: perfil.nombreVisible, autocomplete: 'name', autocapitalize: 'words' });
  const campoMeta = el('input', { id: 'campo-perfil-meta', type: 'text', maxlength: metaMaxima, value: perfil.meta ?? '', autocomplete: 'off', placeholder: t('perfil.meta.muestra') });
  const cuenta = el('span', { class: 'suave chica perfil-cuenta' });
  const avatarActual = () => (forma ? `${forma}-${color}` : null);
  const pintarVista = () => {
    vista.replaceChildren(h.dibujarAvatar(avatarActual(), { nombre: campoNombre.value || perfil.nombre, tamano: 'grande' }),
      el('div', {}, el('strong', { texto: campoNombre.value.trim() || perfil.nombre }), el('span', { class: 'suave chica', texto: `@${perfil.nombre}` }),
        campoMeta.value.trim() ? el('span', { class: 'perfil-meta-vista', texto: campoMeta.value.trim() }) : null));
    cuenta.textContent = t('perfil.meta.cuenta', { n: numero(campoMeta.value.length), max: numero(metaMaxima) });
  };
  const botonesForma = [null, ...formas].map(f => el('button', {
    type: 'button', class: 'perfil-opcion', 'aria-pressed': String(f === forma), 'aria-label': t(f ? `perfil.forma.${f}` : 'perfil.forma.ninguna'), title: t(f ? `perfil.forma.${f}` : 'perfil.forma.ninguna'),
    onclick: () => { forma = f; pintarOpciones(); pintarVista(); },
  }));
  const botonesColor = colores.map(c => el('button', {
    type: 'button', class: 'perfil-color', 'aria-pressed': String(c === color), 'aria-label': t(`perfil.color.${c}`), title: t(`perfil.color.${c}`),
    onclick: () => { color = c; if (!forma) forma = formas[0]; pintarOpciones(); pintarVista(); },
  }));
  const pintarOpciones = () => {
    botonesForma.forEach((b, k) => {
      const f = k ? formas[k - 1] : null;
      b.setAttribute('aria-pressed', String(f === forma));
      b.replaceChildren(h.dibujarAvatar(f ? `${f}-${color}` : null, { nombre: campoNombre.value || perfil.nombre, tamano: 'medio' }));
    });
    botonesColor.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(colores[k] === color));
      b.replaceChildren(el('span', { class: `perfil-muestra av-${colores[k]}`, 'aria-hidden': 'true' }));
    });
  };
  campoNombre.addEventListener('input', () => { pintarVista(); pintarOpciones(); });
  campoMeta.addEventListener('input', pintarVista);
  pintarOpciones();
  pintarVista();
  const mensaje = h.caja();
  // 0.9.2: «Perfil privado» (el mismo de «ocultarme» del Grupo).
  const privado = el('input', { id: 'campo-perfil-privado', type: 'checkbox', checked: perfil.privado === true });
  const guardar = h.botonAccion(t('perfil.guardar'), '', mensaje, async () => {
    const r = await h.api('POST', '/api/yo/perfil', { nombreVisible: campoNombre.value, avatar: avatarActual(), meta: campoMeta.value, privado: privado.checked });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('perfil.listo'));
    alGuardar?.(r.datos.perfil);
  }, 'marca');

  // Cambiar el nombre de usuario (con el que se entra).
  const mensajeUsuario = h.caja();
  const campoUsuario = el('input', { id: 'campo-perfil-usuario', type: 'text', maxlength: 40, value: perfil.nombre, autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const campoClave = el('input', { id: 'campo-perfil-clave', type: 'password', autocomplete: 'current-password' });
  const cambiarUsuario = h.botonAccion(t('perfil.usuario.cambiar'), 'secundario', mensajeUsuario, async () => {
    const r = await h.api('POST', '/api/yo/usuario', { nombre: campoUsuario.value.trim(), clave: campoClave.value });
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    campoClave.value = '';
    h.avisar(t('perfil.usuario.listo', { nombre: r.datos.perfil.nombre }));
    alGuardar?.(r.datos.perfil);
  }, 'lapiz');

  return [
    el('section', { class: 'tarjeta tarjeta-perfil', 'aria-labelledby': 'titulo-perfil' },
      el('h2', { id: 'titulo-perfil', class: 'con-icono' }, h.icono('personas', 'icono chico'), el('span', { texto: t('perfil.titulo') })),
      el('p', { class: 'suave', texto: t('perfil.linea') }),
      vista,
      el('label', { for: 'campo-perfil-nombre', texto: t('perfil.nombre') }), campoNombre,
      el('label', { for: 'campo-perfil-meta', texto: t('perfil.meta') }), campoMeta, cuenta,
      el('p', { class: 'ayuda', texto: t('perfil.meta.ayuda') }),
      el('h3', { id: 'titulo-avatar', texto: t('perfil.avatar') }),
      el('div', { class: 'perfil-opciones', role: 'group', 'aria-labelledby': 'titulo-avatar' }, botonesForma),
      el('h3', { id: 'titulo-color', texto: t('perfil.color') }),
      el('div', { class: 'perfil-colores', role: 'group', 'aria-labelledby': 'titulo-color' }, botonesColor),
      el('label', { class: 'perfil-privado', for: 'campo-perfil-privado' }, privado,
        el('span', {}, el('strong', { texto: t('perfil.privado') }), el('span', { class: 'suave chica', texto: t('perfil.privado.ayuda') }))),
      el('div', { class: 'botones' }, guardar), mensaje),
    el('section', { class: 'tarjeta', 'aria-labelledby': 'titulo-usuario' },
      el('h2', { id: 'titulo-usuario', class: 'con-icono' }, h.icono('lapiz', 'icono chico'), el('span', { texto: t('perfil.usuario.titulo') })),
      el('p', { class: 'suave', texto: t('perfil.usuario.linea') }),
      el('label', { for: 'campo-perfil-usuario', texto: t('perfil.usuario.nuevo') }), campoUsuario,
      el('p', { class: 'ayuda', texto: t('perfil.usuario.reglas') }),
      el('label', { for: 'campo-perfil-clave', texto: t('perfil.usuario.clave') }), campoClave,
      el('div', { class: 'botones' }, cambiarUsuario), mensajeUsuario),
  ];
}
