// Academia (0.9.0): Configuración → Mi perfil. Cada persona elige su nombre para mostrar, su avatar de aviación (figura
// y color) y una línea «Mi meta»; y puede cambiar su nombre de usuario (con su contraseña actual). Solo se carga en
// Configuración. Las piezas de dibujo llegan de app.js en «h» (este módulo no importa nada).
//  - El avatar se ve en la barra de arriba, en el panel «Grupo» y en las listas del administrador.
//  - La meta solo la ven la persona y el administrador (nunca los compañeros).
//  - 0.14.24: «Mi foto»: una foto de la galería o de la cámara (editorFoto, abajo), en vez del avatar.

export function tarjetasPerfil(perfil, h, { alGuardar } = {}) {
  const { el, t, numero } = h;
  const { formas, colores, metaMaxima, nombreVisibleMaximo } = perfil.opciones;
  const inicial = perfil.avatar ? perfil.avatar.split('-') : [null, null];
  let forma = inicial[0];
  let color = inicial[1] ?? colores[0];
  const vista = el('div', { class: 'perfil-vista', 'aria-live': 'polite' });
  // 0.12.3: un alumno que ya confirmó su Nombre y Apellido no lo cambia aquí (lo cambia el administrador).
  const nombreFijo = perfil.nombreFijo === true;
  const campoNombre = el('input', { id: 'campo-perfil-nombre', type: 'text', maxlength: nombreVisibleMaximo, value: perfil.nombreVisible, autocomplete: 'name', autocapitalize: 'words', readonly: nombreFijo || null, 'aria-describedby': nombreFijo ? 'perfil-nombre-fijo' : null });
  const campoMeta = el('input', { id: 'campo-perfil-meta', type: 'text', maxlength: metaMaxima, value: perfil.meta ?? '', autocomplete: 'off', placeholder: t('perfil.meta.muestra') });
  const cuenta = el('span', { class: 'suave chica perfil-cuenta' });
  const avatarActual = () => (forma ? `${forma}-${color}` : null);
  const pintarVista = () => {
    vista.replaceChildren(h.dibujarAvatar(avatarActual(), { foto: perfil.foto ?? null, nombre: campoNombre.value || perfil.nombre, tamano: 'grande' }),
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
    const r = await h.api('POST', '/api/yo/perfil', { ...(nombreFijo ? {} : { nombreVisible: campoNombre.value }), avatar: avatarActual(), meta: campoMeta.value, privado: privado.checked });
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
      editorFoto(h, perfil, { alGuardar }),
      el('label', { for: 'campo-perfil-nombre', texto: t('perfil.nombre') }), campoNombre,
      nombreFijo ? el('p', { id: 'perfil-nombre-fijo', class: 'ayuda con-icono-arriba' }, h.icono('candado', 'icono chico'), el('span', { texto: t('perfil.nombre.fijo') })) : null,
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

// ---------- 0.14.24: «Mi foto» ----------
// Elegir (galería o cámara: input accept="image/*"), recortar cuadrada (centrada; se arrastra y se acerca), achicar a
// 256 × 256 en un lienzo y guardar como JPEG de hasta unos 60 KB. El lienzo no copia los datos de la cámara (EXIF: lugar,
// fecha). La vista previa es el mismo lienzo (la seguridad de la página no deja mostrar imágenes «blob:»).
export const LADO_FOTO = 256;
export const FOTO_OBJETIVO_BYTES = 60 * 1024;
const CALIDADES = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4];

// El recorte cuadrado: ancho, alto de la imagen; zoom ≥ 1; centro (cx, cy) en px de la imagen. → { sx, sy, lado, cx, cy }
// (el centro, corregido para que el cuadrado nunca salga de la imagen).
export function recorteCuadrado(ancho, alto, zoom = 1, cx = ancho / 2, cy = alto / 2) {
  const lado = Math.min(ancho, alto) / Math.max(1, zoom);
  const x = Math.min(Math.max(cx, lado / 2), ancho - lado / 2);
  const y = Math.min(Math.max(cy, lado / 2), alto - lado / 2);
  return { sx: x - lado / 2, sy: y - lado / 2, lado, cx: x, cy: y };
}

async function abrirImagen(archivo) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch { /* abajo, de la otra forma */ }
  }
  const datos = await new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);
    lector.onerror = () => mal(new Error('no_abre'));
    lector.readAsDataURL(archivo);
  });
  const img = new Image();
  img.src = datos;
  await img.decode();
  return img;
}

const aBlob = (lienzo, calidad) => new Promise(ok => lienzo.toBlob(ok, 'image/jpeg', calidad));
async function codificar(lienzo) {
  let ultimo = null;
  for (const q of CALIDADES) {
    ultimo = await aBlob(lienzo, q);
    if (ultimo && ultimo.size <= FOTO_OBJETIVO_BYTES) return ultimo;
  }
  return ultimo;
}

function editorFoto(h, perfil, { alGuardar } = {}) {
  const { el, t } = h;
  const mensaje = h.caja();
  const tiene = Boolean(perfil.foto);
  const entrada = el('input', { id: 'campo-perfil-foto', type: 'file', accept: 'image/*', class: 'solo-lectores' });
  const lienzo = el('canvas', { class: 'foto-lienzo', width: LADO_FOTO, height: LADO_FOTO, 'aria-label': t('fotoperfil.vista'), role: 'img' });
  const zoom = el('input', { id: 'campo-perfil-foto-zoom', type: 'range', min: '1', max: '4', step: '0.01', value: '1' });
  let imagen = null;
  let estado = null; // { zoom, cx, cy }
  const pintar = () => {
    if (!imagen) return;
    const ancho = imagen.width;
    const alto = imagen.height;
    const r = recorteCuadrado(ancho, alto, estado.zoom, estado.cx, estado.cy);
    estado.cx = r.cx;
    estado.cy = r.cy;
    const ctx = lienzo.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
    ctx.drawImage(imagen, r.sx, r.sy, r.lado, r.lado, 0, 0, LADO_FOTO, LADO_FOTO);
  };
  // Arrastrar (dedo o ratón): mueve el centro del recorte.
  let tocando = null;
  lienzo.addEventListener('pointerdown', e => { if (!imagen) return; tocando = { x: e.clientX, y: e.clientY }; lienzo.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  lienzo.addEventListener('pointermove', e => {
    if (!tocando || !imagen) return;
    const r = recorteCuadrado(imagen.width, imagen.height, estado.zoom, estado.cx, estado.cy);
    const porPx = r.lado / (lienzo.clientWidth || LADO_FOTO);
    estado.cx -= (e.clientX - tocando.x) * porPx;
    estado.cy -= (e.clientY - tocando.y) * porPx;
    tocando = { x: e.clientX, y: e.clientY };
    pintar();
  });
  const soltar = () => { tocando = null; };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  zoom.addEventListener('input', () => { if (estado) { estado.zoom = Number(zoom.value) || 1; pintar(); } });

  const editor = el('div', { class: 'foto-editor', hidden: true },
    el('div', { class: 'foto-marco' }, lienzo),
    el('p', { class: 'ayuda', texto: t('fotoperfil.arrastra') }),
    el('label', { class: 'foto-zoom', for: 'campo-perfil-foto-zoom' }, el('span', { texto: t('fotoperfil.zoom') }), zoom));
  const cerrar = () => { editor.hidden = true; botonesEditor.hidden = true; botonesInicio.hidden = false; imagen = null; entrada.value = ''; };
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    mensaje.replaceChildren();
    if (archivo.type && !archivo.type.startsWith('image/')) { mensaje.replaceChildren(el('p', { class: 'mensaje error', texto: t('fotoperfil.no_imagen') })); entrada.value = ''; return; }
    try {
      imagen = await abrirImagen(archivo);
    } catch {
      mensaje.replaceChildren(el('p', { class: 'mensaje error', texto: t('fotoperfil.no_abre') }));
      entrada.value = '';
      return;
    }
    estado = { zoom: 1, cx: imagen.width / 2, cy: imagen.height / 2 };
    zoom.value = '1';
    editor.hidden = false;
    botonesEditor.hidden = false;
    botonesInicio.hidden = true;
    pintar();
  });
  const guardar = h.botonAccion(t('fotoperfil.guardar'), 'marca', mensaje, async () => {
    if (!imagen) return;
    const blob = await codificar(lienzo);
    if (!blob) throw new Error(t('fotoperfil.no_abre'));
    const r = await h.subirFoto(blob);
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    cerrar();
    h.avisar(t('fotoperfil.listo'));
    alGuardar?.(r.datos.perfil);
  }, 'marca');
  const cancelar = el('button', { type: 'button', class: 'secundario', onclick: cerrar, texto: t('fotoperfil.cancelar') });
  const quitar = tiene ? h.botonAccion(t('fotoperfil.quitar'), 'secundario', mensaje, async () => {
    const r = await h.api('POST', '/api/yo/foto/quitar', {});
    if (!r.ok) throw new Error(h.textoError(r.datos.error));
    h.avisar(t('fotoperfil.quitada'));
    alGuardar?.(r.datos.perfil);
  }, 'papelera') : null;
  // «Elegir foto» es la etiqueta del campo de archivo: en el iPhone abre «Fototeca / Tomar foto / Elegir archivo».
  const elegir = el('label', { for: 'campo-perfil-foto', class: 'boton-enlace con-icono foto-elegir', role: 'button', tabindex: '0' },
    h.icono('subir', 'icono chico'), el('span', { texto: t(tiene ? 'fotoperfil.cambiar' : 'fotoperfil.elegir') }));
  elegir.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } });
  const botonesInicio = el('div', { class: 'botones' }, elegir, quitar);
  const botonesEditor = el('div', { class: 'botones', hidden: true }, guardar, cancelar);
  return el('div', { class: 'perfil-foto', role: 'group', 'aria-labelledby': 'titulo-foto' },
    el('h3', { id: 'titulo-foto', texto: t('fotoperfil.titulo') }),
    el('p', { class: 'ayuda', texto: t('fotoperfil.linea') }),
    entrada, editor, botonesInicio, botonesEditor,
    perfil.privado ? el('p', { class: 'ayuda', texto: t('fotoperfil.privado') }) : null,
    mensaje);
}
