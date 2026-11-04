// OPORTIA: pantallas (sin librerías). Todo texto se pone con textContent: nunca se interpreta como código.

// Quita la app vieja de JARVIS que algunos navegadores tenían guardada.
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});

const raiz = document.getElementById('app');
const catalogos = {};
let idioma = 'es';
let estado = { setup: null, usuario: null };
let avisoEntrar = null; // mensaje para la pantalla de entrar (por ejemplo, «tu sesión terminó»)
let idiomaElegidoAlEntrar = false; // la persona tocó Español/English antes de entrar
let turno = 0;

// Si la persona cambia de pantalla mientras otra todavía carga, la vieja no se dibuja encima.
function nuevoTurno() {
  const mio = ++turno;
  return () => mio === turno;
}

// ---------- Idioma ----------
function idiomaGuardado() {
  try { return localStorage.getItem('op_idioma'); } catch { return null; }
}
function guardarIdioma(valor) {
  try { localStorage.setItem('op_idioma', valor); } catch { /* el navegador no deja guardar: no pasa nada */ }
}
async function cargarIdioma(valor) {
  idioma = valor === 'en' ? 'en' : 'es';
  if (!catalogos[idioma]) {
    const r = await fetch(`/i18n/${idioma}.json`, { cache: 'no-cache' });
    catalogos[idioma] = await r.json();
  }
  document.documentElement.lang = idioma;
}
function t(clave, variables = {}) {
  const texto = catalogos[idioma]?.[clave] ?? catalogos.es?.[clave] ?? clave;
  return texto.replace(/\{(\w+)\}/g, (_, nombre) => (nombre in variables ? String(variables[nombre]) : `{${nombre}}`));
}
function textoError(clave) {
  const completa = `error.${clave}`;
  return catalogos[idioma]?.[completa] ? t(completa) : t('error.desconocido');
}
function fecha(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-DO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date(iso));
}

// ---------- Ayudas ----------
function el(etiqueta, propiedades = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(propiedades)) {
    if (valor == null || valor === false) continue;
    if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
    else if (clave === 'texto') nodo.textContent = valor;
    else nodo.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    nodo.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return nodo;
}

async function api(metodo, ruta, datos) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: { 'X-Oportia': '1' } };
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  let respuesta;
  try {
    const r = await fetch(ruta, opciones);
    const cuerpo = await r.json().catch(() => ({}));
    respuesta = { ok: r.ok, codigo: r.status, datos: cuerpo };
  } catch {
    return { ok: false, codigo: 0, datos: { error: 'sin_conexion' } };
  }
  // Si la sesión terminó (por ejemplo, se cambió la contraseña en otro equipo), se vuelve a la pantalla de entrar.
  const error = respuesta.datos?.error;
  if (estado.usuario && (error === 'no_has_entrado' || error === 'demasiados_intentos_clave') && ruta !== '/api/salir') {
    estado.usuario = null;
    avisoEntrar = textoError(error);
    setTimeout(dibujar);
  } else if (estado.usuario && error === 'debe_cambiar_clave') {
    estado.usuario.debeCambiarClave = true;
    setTimeout(dibujar);
  }
  return respuesta;
}

async function refrescarSetup() {
  const setup = await api('GET', '/api/setup');
  if (setup.ok) estado.setup = setup.datos;
}

function mostrar(...contenido) {
  // Las partes que no aplican llegan como null: no se muestran.
  raiz.replaceChildren(...contenido.flat().filter(parte => parte != null && parte !== false));
  window.scrollTo(0, 0);
}

function caja(clase = '') {
  return el('div', { class: `mensaje ${clase}`, role: 'status', hidden: true });
}
function decir(cajaMensaje, texto, clase) {
  cajaMensaje.className = `mensaje ${clase}`;
  cajaMensaje.textContent = texto;
  cajaMensaje.hidden = false;
}

// Envía un formulario: desactiva el botón mientras espera y muestra el error si lo hay.
function alEnviar(formulario, cajaMensaje, accion) {
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type="submit"]');
    boton.disabled = true;
    cajaMensaje.hidden = true;
    try {
      await accion(new FormData(formulario));
    } catch (error) {
      decir(cajaMensaje, error.message || t('error.desconocido'), 'error');
    } finally {
      boton.disabled = false;
    }
  });
}

function campo(nombre, etiqueta, tipo = 'text', extra = {}) {
  const id = `campo-${nombre}`;
  return [
    el('label', { for: id, texto: etiqueta }),
    el('input', { id, name: nombre, type: tipo, required: true, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', ...extra }),
  ];
}

function selectorIdioma(alCambiar) {
  return el('div', { class: 'idiomas' },
    ['es', 'en'].map(valor => el('button', {
      type: 'button',
      class: valor === idioma ? '' : 'secundario',
      'aria-pressed': valor === idioma ? 'true' : 'false',
      texto: t(`idioma.${valor}`),
      onclick: async () => {
        if (!estado.usuario) idiomaElegidoAlEntrar = true;
        guardarIdioma(valor);
        await cargarIdioma(valor);
        await alCambiar(valor);
      },
    })));
}

function pie() {
  return el('p', { class: 'pie', texto: estado.setup?.version ? t('app.version', { version: estado.setup.version }) : '' });
}

// ---------- Pantallas sin sesión ----------
function pantallaAbreTailscale() {
  mostrar(el('section', { class: 'tarjeta centrada' },
    el('h1', { texto: t('setup.tailscale.titulo') }),
    el('p', { texto: t('setup.tailscale.texto') }),
    el('ol', {}, el('li', { texto: t('setup.tailscale.paso1') }), el('li', { texto: t('setup.tailscale.paso2') }), el('li', { texto: t('setup.tailscale.paso3') })),
    el('button', { type: 'button', texto: t('setup.tailscale.recargar'), onclick: () => location.reload() }),
    selectorIdioma(() => pantallaAbreTailscale()),
  ), pie());
}

function pantallaCrearAdmin() {
  const mensaje = caja();
  const formulario = el('form', { novalidate: true },
    campo('nombre', t('setup.nombre'), 'text', { autocomplete: 'username', maxlength: 40 }),
    el('p', { class: 'ayuda', texto: t('setup.nombre.ayuda') }),
    campo('clave', t('setup.clave'), 'password', { autocomplete: 'new-password', minlength: 10 }),
    campo('clave2', t('setup.clave2'), 'password', { autocomplete: 'new-password', minlength: 10 }),
    el('p', { class: 'ayuda', texto: t('setup.clave.ayuda') }),
    el('button', { type: 'submit', texto: t('setup.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    // Se revisa aquí antes de enviar, para que un error al escribir no gaste intentos.
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/i.test(String(datos.get('nombre')).trim())) throw new Error(t('error.nombre_no_valido'));
    if (String(datos.get('clave')).length < 10) throw new Error(t('error.clave_corta'));
    if (datos.get('clave') !== datos.get('clave2')) throw new Error(t('setup.claves_distintas'));
    const r = await api('POST', '/api/primer-admin', { nombre: String(datos.get('nombre')).trim(), clave: datos.get('clave'), idioma });
    if (r.datos.error === 'ya_existe_admin') {
      // Alguien ya la creó (o la creaste en otra pestaña): se pasa a la pantalla de entrar.
      await refrescarSetup();
      avisoEntrar = textoError(r.datos.error);
      return dibujar();
    }
    if (!r.ok) throw new Error(textoError(r.datos.error));
    estado.setup = { ...estado.setup, necesitaAdmin: false, puedeCrearAdmin: false };
    estado.usuario = r.datos.usuario;
    location.hash = '#inicio';
    await dibujar();
  });
  mostrar(el('section', { class: 'tarjeta centrada' },
    el('h1', { texto: t('setup.titulo') }), el('p', { class: 'suave', texto: t('setup.texto') }), formulario,
    selectorIdioma(() => pantallaCrearAdmin())), pie());
}

function pantallaEntrar() {
  const mensaje = caja();
  const formulario = el('form', { novalidate: true },
    campo('nombre', t('entrar.nombre'), 'text', { autocomplete: 'username', maxlength: 40 }),
    campo('clave', t('entrar.clave'), 'password', { autocomplete: 'current-password' }),
    el('button', { type: 'submit', texto: t('entrar.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    const r = await api('POST', '/api/entrar', { nombre: datos.get('nombre'), clave: datos.get('clave') });
    if (!r.ok) throw new Error(textoError(r.datos.error));
    estado.usuario = r.datos.usuario;
    if (idiomaElegidoAlEntrar && estado.usuario.idioma !== idioma) {
      // Eligió un idioma en esta pantalla: se guarda en su cuenta.
      const cambio = await api('POST', '/api/yo/idioma', { idioma });
      if (cambio.ok) estado.usuario.idioma = idioma;
    } else if (estado.usuario.idioma !== idioma) {
      await cargarIdioma(estado.usuario.idioma);
      guardarIdioma(estado.usuario.idioma);
    }
    location.hash = '#inicio';
    await dibujar();
  });
  const aviso = avisoEntrar;
  avisoEntrar = null;
  mostrar(el('section', { class: 'tarjeta centrada' },
    el('div', { class: 'marca', texto: t('app.nombre') }), el('p', { class: 'suave', texto: t('app.lema') }),
    aviso ? el('p', { class: 'aviso', role: 'status', texto: aviso }) : null,
    el('h1', { texto: t('entrar.titulo') }), formulario, el('p', { class: 'ayuda', texto: t('entrar.olvide') }),
    selectorIdioma(() => pantallaEntrar())), pie());
}

function formularioClave({ alTerminar }) {
  const mensaje = caja();
  const formulario = el('form', { novalidate: true },
    campo('actual', t('clave.actual'), 'password', { autocomplete: 'current-password' }),
    campo('nueva', t('clave.nueva'), 'password', { autocomplete: 'new-password', minlength: 10 }),
    campo('nueva2', t('clave.nueva2'), 'password', { autocomplete: 'new-password', minlength: 10 }),
    el('p', { class: 'ayuda', texto: t('setup.clave.ayuda') }),
    el('button', { type: 'submit', texto: t('clave.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    if (datos.get('nueva') !== datos.get('nueva2')) throw new Error(t('setup.claves_distintas'));
    const r = await api('POST', '/api/yo/clave', { actual: datos.get('actual'), nueva: datos.get('nueva') });
    if (!r.ok) throw new Error(textoError(r.datos.error));
    formulario.reset();
    decir(mensaje, t('clave.lista'), 'bien');
    await alTerminar?.();
  });
  return formulario;
}

function pantallaClaveObligatoria() {
  mostrar(el('section', { class: 'tarjeta centrada' },
    el('h1', { texto: t('clave.titulo') }),
    el('p', { class: 'aviso', texto: t('clave.obligatoria') }),
    formularioClave({ alTerminar: async () => { estado.usuario.debeCambiarClave = false; location.hash = '#inicio'; await dibujar(); } }),
    el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir }),
    selectorIdioma(async valor => {
      const r = await api('POST', '/api/yo/idioma', { idioma: valor });
      if (r.ok && estado.usuario) estado.usuario.idioma = valor;
      if (estado.usuario) pantallaClaveObligatoria();
    })), pie());
}

async function salir() {
  const r = await api('POST', '/api/salir', {});
  // Si el servidor no pudo cerrar la sesión, no se finge que se cerró.
  if (!r.ok && r.codigo !== 401) return alert(textoError(r.datos.error));
  estado.usuario = null;
  await refrescarSetup();
  location.hash = '';
  await dibujar();
}

// ---------- Pantallas con sesión ----------
function marco(seccion, ...contenido) {
  const enlaces = [['inicio', 'menu.inicio'], ['configuracion', 'menu.configuracion']];
  if (estado.usuario.rol === 'admin') enlaces.push(['admin', 'menu.admin']);
  return [
    el('header', { class: 'encabezado' },
      el('div', { class: 'marca', texto: t('app.nombre') }),
      el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir })),
    el('nav', { class: 'menu', 'aria-label': t('menu.titulo') },
      enlaces.map(([id, clave]) => el('a', { href: `#${id}`, 'aria-current': id === seccion ? 'page' : null, texto: t(clave) }))),
    ...contenido,
    pie(),
  ];
}

function pantallaInicio() {
  const lista = claves => el('ul', {}, claves.map(clave => el('li', { texto: t(clave) })));
  mostrar(marco('inicio',
    el('section', { class: 'tarjeta' },
      el('h1', { texto: t('inicio.hola', { nombre: estado.usuario.nombre }) }),
      el('p', { class: 'suave', texto: t('inicio.texto') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.funciona') }),
      lista(['inicio.funciona.1', 'inicio.funciona.2', 'inicio.funciona.3'])),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.viene') }),
      lista(['inicio.viene.proyectos', 'inicio.viene.tareas', 'inicio.viene.ia', 'inicio.viene.copias', 'inicio.viene.clientes']))));
}

function pantallaConfiguracion() {
  const mensajeIdioma = caja();
  const botonesIdioma = el('div', { class: 'botones' }, ['es', 'en'].map(valor => el('button', {
    type: 'button',
    class: valor === idioma ? '' : 'secundario',
    texto: t(`idioma.${valor}`),
    onclick: async () => {
      const r = await api('POST', '/api/yo/idioma', { idioma: valor });
      if (!r.ok) return decir(mensajeIdioma, textoError(r.datos.error), 'error');
      estado.usuario.idioma = valor;
      guardarIdioma(valor);
      await cargarIdioma(valor);
      pantallaConfiguracion();
    },
  })));
  mostrar(marco('configuracion',
    el('section', { class: 'tarjeta' },
      el('h1', { texto: t('config.titulo') }),
      el('h2', { texto: t('config.cuenta') }),
      el('p', { texto: t('config.usuario', { nombre: estado.usuario.nombre }) }),
      el('p', { class: 'suave', texto: t(estado.usuario.rol === 'admin' ? 'config.rol.admin' : 'config.rol.usuario') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('idioma.titulo') }), botonesIdioma, mensajeIdioma),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('clave.titulo') }), formularioClave({}))));
}

function bloqueClaveTemporal(textoClave, nombre, temporal) {
  const clave = el('div', { class: 'clave-temporal', texto: temporal });
  const ayuda = el('p', { class: 'ayuda', hidden: true, texto: t('admin.copiar_a_mano') });
  const boton = el('button', {
    type: 'button',
    class: 'secundario',
    texto: t('admin.copiar'),
    onclick: async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles');
        await navigator.clipboard.writeText(temporal);
        boton.textContent = t('admin.copiado');
      } catch {
        // Sin permiso para copiar (por ejemplo, entrando por http): se deja la contraseña seleccionada.
        const rango = document.createRange();
        rango.selectNodeContents(clave);
        const seleccion = window.getSelection();
        seleccion.removeAllRanges();
        seleccion.addRange(rango);
        ayuda.hidden = false;
      }
    },
  });
  return el('div', { class: 'mensaje bien' }, el('p', { texto: t(textoClave, { nombre }) }), clave, boton, ayuda);
}

async function pantallaAdmin(avisoArriba = null) {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/admin/usuarios');
  if (!vigente()) return;
  if (!r.ok) {
    mostrar(marco('admin', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
    return;
  }
  const mensaje = caja();
  const formulario = el('form', { novalidate: true },
    campo('nombre', t('admin.nuevo.nombre'), 'text', { maxlength: 40 }),
    el('p', { class: 'ayuda', texto: t('setup.nombre.ayuda') }),
    el('label', { for: 'campo-rol', texto: t('admin.nuevo.rol') }),
    el('select', { id: 'campo-rol', name: 'rol' },
      el('option', { value: 'usuario', texto: t('admin.rol.usuario') }),
      el('option', { value: 'admin', texto: t('admin.rol.admin') })),
    el('label', { for: 'campo-idioma-nuevo', texto: t('admin.nuevo.idioma') }),
    el('select', { id: 'campo-idioma-nuevo', name: 'idioma' },
      el('option', { value: 'es', texto: t('idioma.es') }),
      el('option', { value: 'en', texto: t('idioma.en') })),
    el('button', { type: 'submit', texto: t('admin.nuevo.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    const creado = await api('POST', '/api/admin/usuarios', { nombre: datos.get('nombre'), rol: datos.get('rol'), idioma: datos.get('idioma') });
    if (!creado.ok) throw new Error(textoError(creado.datos.error));
    await pantallaAdmin(bloqueClaveTemporal('admin.creado', creado.datos.nombre, creado.datos.claveTemporal));
  });

  const filas = r.datos.usuarios.map(u => {
    const acciones = u.id === estado.usuario.id ? el('p', { class: 'suave', texto: t('admin.tu_cuenta') }) : el('div', { class: 'botones' },
      // A una cuenta desactivada no se le reinicia la contraseña: no podría entrar con ella.
      !u.activo ? null : el('button', {
        type: 'button',
        class: 'secundario',
        texto: t('admin.reiniciar'),
        onclick: async () => {
          if (!confirm(t('admin.confirmar_reiniciar', { nombre: u.nombre }))) return;
          const x = await api('POST', `/api/admin/usuarios/${u.id}/reiniciar-clave`, {});
          if (!x.ok) return alert(textoError(x.datos.error));
          await pantallaAdmin(bloqueClaveTemporal('admin.reiniciada', x.datos.nombre, x.datos.claveTemporal));
        },
      }),
      el('button', {
        type: 'button',
        class: u.activo ? 'peligro' : 'secundario',
        texto: t(u.activo ? 'admin.desactivar' : 'admin.activar'),
        onclick: async () => {
          if (u.activo && !confirm(t('admin.confirmar_desactivar', { nombre: u.nombre }))) return;
          const x = await api('POST', `/api/admin/usuarios/${u.id}/activo`, { activo: !u.activo });
          if (!x.ok) return alert(textoError(x.datos.error));
          await pantallaAdmin();
        },
      }));
    return el('div', { class: 'fila' },
      el('div', {},
        el('span', { class: 'nombre', texto: u.nombre }),
        el('span', { class: 'etiqueta', texto: t(u.rol === 'admin' ? 'admin.rol.admin' : 'admin.rol.usuario') }),
        el('span', { class: `etiqueta ${u.activo ? 'bien' : 'mal'}`, texto: t(u.activo ? 'admin.activo' : 'admin.inactivo') })),
      el('p', { class: 'suave', texto: u.ultimoAcceso ? t('admin.ultimo', { fecha: fecha(u.ultimoAcceso) }) : t('admin.nunca') }),
      u.debeCambiarClave ? el('p', { class: 'suave', texto: t('admin.cambiar_pendiente') }) : null,
      acciones);
  });

  mostrar(marco('admin',
    el('section', { class: 'tarjeta' }, el('h1', { texto: t('admin.titulo') })),
    avisoArriba ? el('section', { class: 'tarjeta' }, avisoArriba) : null,
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('admin.usuarios') }), filas),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('admin.nuevo') }), formulario)));
}

// ---------- Arranque ----------
async function dibujar() {
  turno++;
  if (!estado.usuario) {
    if (estado.setup?.necesitaAdmin) return estado.setup.puedeCrearAdmin ? pantallaCrearAdmin() : pantallaAbreTailscale();
    return pantallaEntrar();
  }
  if (estado.usuario.debeCambiarClave) return pantallaClaveObligatoria();
  const seccion = location.hash.replace('#', '') || 'inicio';
  if (seccion === 'configuracion') return pantallaConfiguracion();
  if (seccion === 'admin' && estado.usuario.rol === 'admin') return pantallaAdmin();
  return pantallaInicio();
}

// Si OPORTIA no pudo arrancar, se explica en los dos idiomas y se ofrece reintentar
// (en el iPhone, la app de la pantalla de inicio no tiene botón de recargar).
function pantallaNoArranco(detalle) {
  mostrar(el('section', { class: 'tarjeta centrada' },
    el('p', { class: 'mensaje error', texto: detalle || 'No se pudo cargar OPORTIA. / OPORTIA could not load.' }),
    el('button', { type: 'button', texto: 'Reintentar / Retry', onclick: () => location.reload() })));
}

async function iniciar() {
  const preferido = idiomaGuardado() || (navigator.language || '').slice(0, 2);
  try {
    await cargarIdioma(preferido === 'en' ? 'en' : 'es');
  } catch {
    return pantallaNoArranco();
  }
  mostrar(el('p', { class: 'cargando', texto: t('app.cargando') }));
  const setup = await api('GET', '/api/setup');
  estado.setup = setup.datos;
  if (!setup.ok) return pantallaNoArranco(textoError(setup.datos.error || 'error_interno'));
  const yo = await api('GET', '/api/yo');
  if (yo.ok) {
    estado.usuario = yo.datos.usuario;
    if (estado.usuario.idioma !== idioma) await cargarIdioma(estado.usuario.idioma);
  }
  await dibujar();
}

window.addEventListener('hashchange', () => { if (estado.usuario) dibujar(); });
iniciar().catch(() => pantallaNoArranco());
