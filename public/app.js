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
  const enlaces = [['inicio', 'menu.inicio'], ['proyectos', 'menu.proyectos'], ['configuracion', 'menu.configuracion']];
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

async function pantallaInicio() {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/proyectos');
  if (!vigente()) return;
  const lista = claves => el('ul', {}, claves.map(clave => el('li', { texto: t(clave) })));
  const pendientes = r.ok ? r.datos.proyectos.filter(p => !p.enPapelera && p.versionPendiente) : [];
  const aprobar = el('section', { class: 'tarjeta' },
    el('h2', { texto: t('inicio.aprobar.titulo') }),
    !r.ok ? el('p', { class: 'mensaje error', texto: textoError(r.datos.error) })
      : pendientes.length ? pendientes.map(p => el('a', { class: 'fila enlace', href: `#proyecto/${p.id}` },
        el('span', { class: 'nombre', texto: p.nombre }),
        el('span', { class: 'etiquetas' }, el('span', { class: 'etiqueta aviso-etiqueta', texto: t('inicio.aprobar.version', { numero: p.versionPendiente }) }))))
        : el('p', { class: 'suave', texto: t('inicio.aprobar.vacio') }),
    r.ok ? el('p', { class: 'suave' }, el('a', { href: '#proyectos', texto: t('inicio.ir_proyectos', { usados: r.datos.usados, limite: r.datos.limite }) })) : null);
  mostrar(marco('inicio',
    el('section', { class: 'tarjeta' },
      el('h1', { texto: t('inicio.hola', { nombre: estado.usuario.nombre }) }),
      el('p', { class: 'suave', texto: t('inicio.texto') })),
    aprobar,
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.funciona') }),
      lista(['inicio.funciona.1', 'inicio.funciona.4', 'inicio.funciona.2', 'inicio.funciona.3'])),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.viene') }),
      lista(['inicio.viene.tareas', 'inicio.viene.ia', 'inicio.viene.copias', 'inicio.viene.clientes']))));
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

// ---------- Proyectos ----------
let catalogo = null;
let avisoPendiente = null;

function ir(destino) {
  if (location.hash === destino) dibujar();
  else location.hash = destino;
}

async function cargarCatalogo() {
  if (catalogo) return catalogo;
  const r = await api('GET', '/api/catalogo');
  if (!r.ok) throw new Error(textoError(r.datos.error));
  catalogo = r.datos;
  return catalogo;
}

function unir(lista) {
  const limpia = lista.filter(Boolean);
  if (!limpia.length) return '';
  try { return new Intl.ListFormat(idioma, { type: 'conjunction' }).format(limpia); } catch { return limpia.join(', '); }
}
const enMinuscula = texto => (texto ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto);
const nombreSector = clave => { const s = catalogo.sectores.find(x => x.clave === clave); return s ? s[idioma] || s.es : clave; };
const nombreZona = clave => catalogo.zonas.find(x => x.clave === clave)?.nombre || clave;
const sectoresDe = c => [...c.sectores.map(nombreSector), ...c.sectoresLibres];
const zonasDe = c => [...c.zonas.map(nombreZona), ...c.zonasLibres];
const exclusionesDe = c => [...c.sectoresExcluidos.map(nombreSector), ...c.zonasExcluidas.map(nombreZona), ...c.exclusiones];
const dinero = (cantidad, moneda) => `${moneda === 'USD' ? 'US$' : 'RD$'}${Number(cantidad).toLocaleString('en-US')}`;
const faseDe = (clave, tipo) => catalogo.capacidades.find(x => x.clave === clave)?.desde?.[tipo];

// Una duda del motor en palabras: «No conozco el lugar «Stgo». ¿Quisiste decir Santiago?».
function textoDuda(d) {
  const valor = d.clave === 'conflicto_sector' ? nombreSector(d.texto)
    : d.clave === 'conflicto_zona' ? nombreZona(d.texto)
      : d.clave === 'conflicto_tamano' ? t(`tamano.${d.texto}`) : d.texto;
  const frase = t(`duda.${d.clave}`, { texto: valor });
  const sugerencias = Array.isArray(d.sugerencias) ? d.sugerencias : [];
  return sugerencias.length ? `${frase} ${t('duda.sugerencia', { lugares: unir(sugerencias.map(nombreZona)) })}` : frase;
}

function salarioDe(c) {
  if (c.salarioMinimo && c.salarioMaximo) return t('valor.salario.rango', { minimo: dinero(c.salarioMinimo, c.moneda), maximo: dinero(c.salarioMaximo, c.moneda) });
  if (c.salarioMinimo) return t('valor.salario.min', { cantidad: dinero(c.salarioMinimo, c.moneda) });
  if (c.salarioMaximo) return t('valor.salario.max', { cantidad: dinero(c.salarioMaximo, c.moneda) });
  return '';
}

// La frase «Entendí que…» se arma con la configuración, en el idioma que esté usando la persona.
function fraseEntendi(c) {
  const falta = t('valor.falta');
  const zonas = c.paisCompleto ? [t('valor.pais_frase'), ...zonasDe(c)] : zonasDe(c);
  if (c.tipo === 'laboral') return t('proyecto.entendi.laboral', { producto: c.producto || falta, zonas: unir(zonas) || falta });
  return t('proyecto.entendi.comercial', {
    sectores: unir(sectoresDe(c).map(enMinuscula)) || falta,
    zonas: unir(zonas) || falta,
    producto: c.producto || falta,
  });
}

function resumen(c) {
  const filas = [];
  const fila = (clave, valor) => { if (valor) filas.push(el('dt', { texto: t(clave) }), el('dd', { texto: valor })); };
  fila('campo.tipo', t(`tipo.${c.tipo}`));
  fila('campo.objetivo', c.objetivo);
  fila(`campo.producto.${c.tipo}`, c.producto);
  if (c.tipo === 'comercial') fila('campo.sectores', unir(sectoresDe(c)));
  fila('campo.zonas', unir(c.paisCompleto ? [t('valor.pais_completo'), ...zonasDe(c)] : zonasDe(c)));
  if (c.tipo === 'comercial') fila('campo.tamanos', unir(c.tamanos.map(x => t(`tamano.${x}`))));
  if (c.tipo === 'laboral') {
    fila('campo.salario', salarioDe(c));
    fila('campo.experiencia', c.experiencia ? t('valor.experiencia.no_requerida') : '');
  }
  fila('campo.exclusiones', unir(exclusionesDe(c)));
  fila('campo.prioridades', unir(c.prioridades));
  fila('campo.frecuencia', t(`frecuencia.${c.frecuencia}`));
  fila('campo.capacidades', unir(catalogo.capacidades.filter(x => c.capacidades[x.clave]).map(x => t(`capacidad.${x.clave}`))));
  fila('campo.fuentes', unir(c.fuentes.map(f => t(`fuente.${f}`))));
  fila('campo.costo', t('valor.costo'));
  return el('dl', { class: 'resumen' }, filas);
}

function etiquetaEstado(p) {
  const clase = { en_ejecucion: 'bien', con_errores: 'mal', pendiente: 'aviso-etiqueta' }[p.estado] || '';
  return el('span', { class: `etiqueta ${clase}`, texto: t(`estado.${p.estado}`) });
}

function tarjetaError(mensaje) {
  return el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: mensaje }));
}

// Botón que hace un pedido: se desactiva mientras espera y, si falla, explica por qué.
function botonAccion(texto, clase, cajaMensaje, accion) {
  const boton = el('button', {
    type: 'button',
    class: clase,
    texto,
    onclick: async () => {
      boton.disabled = true;
      cajaMensaje.hidden = true;
      try {
        await accion();
      } catch (error) {
        decir(cajaMensaje, error.message || t('error.desconocido'), 'error');
      } finally {
        boton.disabled = false;
      }
    },
  });
  return boton;
}

// Hace el pedido y, si salió bien, vuelve a dibujar el proyecto con un aviso arriba.
async function pedirYMostrar(metodo, ruta, datos, aviso) {
  const pantalla = turno;
  const r = await api(metodo, ruta, datos);
  if (!r.ok) throw new Error(textoError(r.datos.error));
  if (pantalla !== turno) return; // la persona ya se fue a otra pantalla
  dibujarProyecto(r.datos, typeof aviso === 'function' ? aviso(r.datos) : aviso);
}

async function pantallaProyectos() {
  const vigente = nuevoTurno();
  let r;
  try {
    await cargarCatalogo();
    r = await api('GET', '/api/proyectos');
    if (!r.ok) throw new Error(textoError(r.datos.error));
  } catch (error) {
    if (vigente()) mostrar(marco('proyectos', tarjetaError(error.message)));
    return;
  }
  if (!vigente()) return;
  const { proyectos, limite, usados, puedeEscribir } = r.datos;
  const activos = proyectos.filter(p => !p.enPapelera);
  const papelera = proyectos.filter(p => p.enPapelera);

  const fila = p => el('a', { class: 'fila enlace', href: `#proyecto/${p.id}` },
    el('span', { class: 'nombre', texto: p.nombre }),
    el('span', { class: 'etiquetas' },
      el('span', { class: 'etiqueta', texto: t(`tipo.${p.tipo}`) }),
      etiquetaEstado(p),
      p.versionPendiente && p.estado !== 'pendiente' ? el('span', { class: 'etiqueta aviso-etiqueta', texto: t('proyectos.cambios_pendientes') }) : null),
    el('span', { class: 'suave', texto: t('proyectos.actualizado', { fecha: fecha(p.actualizadoEn) }) }));

  let nuevo;
  if (!puedeEscribir) nuevo = el('p', { class: 'aviso', texto: t('proyectos.solo_lectura') });
  else if (usados >= limite) nuevo = el('p', { class: 'aviso', texto: t('error.limite_de_proyectos') });
  else {
    const mensaje = caja();
    const area = el('textarea', { id: 'campo-instrucciones', name: 'instrucciones', rows: 5, required: true, minlength: 10, maxlength: 4000 });
    const formulario = el('form', { novalidate: true },
      el('label', { for: 'campo-instrucciones', texto: t('proyectos.instrucciones') }),
      el('p', { class: 'ayuda', texto: t('proyectos.instrucciones.ayuda') }),
      area,
      el('details', { class: 'ejemplos' },
        el('summary', { texto: t('proyectos.ejemplos') }),
        ['proyectos.ejemplo.1', 'proyectos.ejemplo.2', 'proyectos.ejemplo.3'].map(clave => el('div', { class: 'ejemplo' },
          el('p', { texto: t(clave) }),
          el('button', { type: 'button', class: 'secundario', texto: t('proyectos.usar_ejemplo'), onclick: () => { area.value = t(clave); area.focus(); } })))),
      el('button', { type: 'submit', texto: t('proyectos.crear') }),
      mensaje);
    alEnviar(formulario, mensaje, async datos => {
      const creado = await api('POST', '/api/proyectos', { instrucciones: datos.get('instrucciones') });
      if (!creado.ok) throw new Error(textoError(creado.datos.error));
      avisoPendiente = t('proyecto.listo.creado');
      ir(`#proyecto/${creado.datos.proyecto.id}`);
    });
    nuevo = formulario;
  }

  mostrar(marco('proyectos',
    el('section', { class: 'tarjeta' },
      el('h1', { texto: t('proyectos.titulo') }),
      el('p', { class: 'suave', texto: t('proyectos.texto') }),
      el('p', { class: 'aviso', texto: t('proyectos.aviso_fase') })),
    el('section', { class: 'tarjeta' },
      el('h2', { texto: t('proyectos.usados', { usados, limite }) }),
      activos.length ? activos.map(fila) : el('p', { class: 'suave', texto: t('proyectos.vacio') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('proyectos.nuevo') }), nuevo),
    papelera.length ? el('section', { class: 'tarjeta' },
      el('details', {},
        el('summary', { texto: t('proyectos.papelera', { n: papelera.length }) }),
        el('p', { class: 'suave', texto: t('proyectos.papelera.texto') }),
        papelera.map(fila))) : null));
}

async function pantallaProyecto(id) {
  const vigente = nuevoTurno();
  let r;
  try {
    await cargarCatalogo();
    r = await api('GET', `/api/proyectos/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(textoError(r.datos.error));
  } catch (error) {
    if (vigente()) mostrar(marco('proyectos', el('p', {}, el('a', { href: '#proyectos', texto: t('proyecto.volver') })), tarjetaError(error.message)));
    return;
  }
  if (!vigente()) return;
  const aviso = avisoPendiente;
  avisoPendiente = null;
  dibujarProyecto(r.datos, aviso);
}

function formularioCampos(c, alGuardar) {
  const mensaje = caja();
  const id = nombre => `f-${nombre}`;
  const etiqueta = (nombre, texto) => el('label', { for: id(nombre), texto });
  const linea = (nombre, texto, valor, extra = {}) => [etiqueta(nombre, texto), el('input', { id: id(nombre), name: nombre, type: 'text', value: valor, autocomplete: 'off', ...extra })];
  const casilla = (nombre, texto, marcada, valor, ayuda) => el('label', { class: 'casilla' },
    el('input', { type: 'checkbox', name: nombre, value: valor, checked: marcada }),
    el('span', {}, texto, ayuda ? el('small', { class: 'ayuda', texto: ayuda }) : null));

  const tipo = el('select', { id: id('tipo'), name: 'tipo' }, catalogo.tipos.map(x => el('option', { value: x, selected: x === c.tipo, texto: t(`tipo.${x}`) })));
  const etiquetaProducto = etiqueta('producto', t(`campo.producto.${c.tipo}`));
  const comercial = el('div', { hidden: c.tipo !== 'comercial' },
    linea('sectores', t('formulario.sectores'), sectoresDe(c).join(', ')),
    el('fieldset', {}, el('legend', { texto: t('campo.tamanos') }),
      catalogo.tamanos.map(x => casilla('tamanos', t(`tamano.${x}`), c.tamanos.includes(x), x))));
  const laboral = el('div', { hidden: c.tipo !== 'laboral' },
    linea('salarioMinimo', t('formulario.salario_minimo', { moneda: c.moneda === 'USD' ? 'US$' : 'RD$' }), c.salarioMinimo ?? '', { type: 'number', inputmode: 'numeric', min: 0, step: 1 }),
    linea('salarioMaximo', t('formulario.salario_maximo', { moneda: c.moneda === 'USD' ? 'US$' : 'RD$' }), c.salarioMaximo ?? '', { type: 'number', inputmode: 'numeric', min: 0, step: 1 }),
    casilla('experiencia', t('formulario.experiencia'), c.experiencia === 'no_requerida', 'si'));
  tipo.addEventListener('change', () => {
    comercial.hidden = tipo.value !== 'comercial';
    laboral.hidden = tipo.value !== 'laboral';
    etiquetaProducto.textContent = t(`campo.producto.${tipo.value}`);
  });

  const casillasCapacidad = catalogo.capacidades.map(x => casilla('capacidades', t(`capacidad.${x.clave}`), c.capacidades[x.clave], x.clave,
    `${t(`capacidad.${x.clave}.ayuda`)} ${t('capacidad.desde', { fase: x.desde[c.tipo] })}`));
  const marcar = lista => casillasCapacidad.forEach(l => { const entrada = l.querySelector('input'); entrada.checked = lista.includes(entrada.value); });
  const contactar = casillasCapacidad.find(l => l.querySelector('input').value === 'contactar').querySelector('input');
  contactar.addEventListener('change', () => { if (contactar.checked) casillasCapacidad.find(l => l.querySelector('input').value === 'correos').querySelector('input').checked = true; });

  // Lo que el motor no entendió: la persona lo arregla arriba y lo marca, o lo marca porque no importa.
  const noEntendido = Array.isArray(c.noEntendido) ? c.noEntendido : [];
  const dudasDelFormulario = noEntendido.length ? el('fieldset', {}, el('legend', { texto: t('formulario.dudas') }),
    el('p', { class: 'ayuda', texto: t('formulario.dudas.ayuda') }),
    noEntendido.map((d, numero) => casilla('resueltas', textoDuda(d), false, String(numero), t('formulario.duda_resuelta')))) : null;

  const formulario = el('form', { novalidate: true },
    dudasDelFormulario,
    etiqueta('tipo', t('formulario.tipo')), tipo,
    linea('objetivo', t('campo.objetivo'), c.objetivo, { maxlength: 300 }),
    etiquetaProducto, el('input', { id: id('producto'), name: 'producto', type: 'text', value: c.producto, autocomplete: 'off', maxlength: 120 }),
    comercial,
    linea('zonas', t('formulario.zonas'), zonasDe(c).join(', ')),
    casilla('pais', t('valor.pais_completo'), c.paisCompleto, 'si'),
    laboral,
    linea('exclusiones', t('formulario.exclusiones'), exclusionesDe(c).join(', ')),
    etiqueta('prioridades', t('formulario.prioridades')),
    el('textarea', { id: id('prioridades'), name: 'prioridades', rows: 3, texto: c.prioridades.join('\n') }),
    etiqueta('frecuencia', t('campo.frecuencia')),
    el('select', { id: id('frecuencia'), name: 'frecuencia' }, catalogo.frecuencias.map(x => el('option', { value: x, selected: x === c.frecuencia, texto: t(`frecuencia.${x}`) }))),
    el('fieldset', {}, el('legend', { texto: t('campo.capacidades') }),
      el('div', { class: 'botones' }, Object.entries(catalogo.combinaciones).map(([clave, lista]) =>
        el('button', { type: 'button', class: 'secundario', texto: t(`combinacion.${clave}`), onclick: () => marcar(lista) }))),
      casillasCapacidad),
    el('p', { class: 'ayuda', texto: t('formulario.guardar.ayuda') }),
    el('button', { type: 'submit', texto: t('formulario.guardar') }),
    mensaje);

  alEnviar(formulario, mensaje, async datos => {
    const capacidades = datos.getAll('capacidades');
    await alGuardar({
      tipo: datos.get('tipo'),
      objetivo: datos.get('objetivo'),
      producto: datos.get('producto'),
      sectores: datos.get('sectores'),
      zonas: datos.get('zonas'),
      paisCompleto: datos.get('pais') === 'si',
      tamanos: datos.getAll('tamanos'),
      exclusiones: datos.get('exclusiones'),
      prioridades: datos.get('prioridades'),
      salarioMinimo: datos.get('salarioMinimo') || null,
      salarioMaximo: datos.get('salarioMaximo') || null,
      experienciaNoRequerida: datos.get('experiencia') === 'si',
      frecuencia: datos.get('frecuencia'),
      capacidades: Object.fromEntries(catalogo.capacidades.map(x => [x.clave, capacidades.includes(x.clave)])),
      resueltas: datos.getAll('resueltas').map(Number),
    });
  });
  return formulario;
}

function tarjetaVersion(v, { proyecto, activa, puedeEscribir }) {
  const c = v.configuracion;
  const mensaje = caja();
  const esCambio = Boolean(activa);
  const partes = [
    el('h2', { texto: t('proyecto.pendiente.titulo', { numero: v.numero }) }),
    el('p', { class: 'suave', texto: esCambio ? t('proyecto.pendiente.cambio', { numero: activa.numero }) : t('proyecto.pendiente.texto') }),
    el('p', { class: 'entendi', texto: fraseEntendi(c) }),
  ];
  // Lo que falta y lo que el motor no entendió se pregunta; mientras tanto no se puede aprobar.
  const preguntas = [
    ...v.faltantes.filter(f => f !== 'dudas').map(f => t(f === 'producto' ? `faltante.producto.${c.tipo}` : `faltante.${f}`)),
    ...(Array.isArray(v.dudas) ? v.dudas : []).map(textoDuda),
  ];
  if (v.faltantes.includes('dudas') && !(Array.isArray(v.dudas) && v.dudas.length)) preguntas.push(t('faltante.dudas'));
  if (preguntas.length) {
    partes.push(el('div', { class: 'aviso' },
      el('p', { texto: t('proyecto.preguntas') }),
      el('ul', {}, preguntas.map(p => el('li', { texto: p })))));
  }
  if (v.supuestos.length) {
    partes.push(el('div', { class: 'supuestos' },
      el('p', { class: 'suave', texto: t('proyecto.supuestos') }),
      el('ul', {}, v.supuestos.map(s => el('li', { class: 'suave', texto: t(`supuesto.${s}`) })))));
  }
  partes.push(resumen(c));
  if (puedeEscribir && !proyecto.enPapelera) {
    const motivo = el('textarea', { id: 'campo-motivo', rows: 2, maxlength: 300 });
    const aprobar = botonAccion(t(esCambio ? 'proyecto.aprobar.cambio' : 'proyecto.aprobar.primera'), '', mensaje, async () => {
      await pedirYMostrar('POST', `/api/proyectos/${proyecto.id}/versiones/${v.numero}/aprobar`, {}, t('proyecto.listo.aprobada', { numero: v.numero }));
    });
    // Mientras falte algo, el botón no se puede tocar y se explica por qué justo debajo.
    if (v.faltantes.length) aprobar.disabled = true;
    partes.push(
      el('div', { class: 'botones' }, aprobar),
      v.faltantes.length ? el('p', { class: 'ayuda', texto: t('proyecto.no_se_puede_aprobar') }) : null,
      el('details', { class: 'rechazar' },
        el('summary', { texto: t('proyecto.rechazar') }),
        el('label', { for: 'campo-motivo', texto: t('proyecto.motivo') }),
        motivo,
        botonAccion(t('proyecto.rechazar.boton', { numero: v.numero }), 'peligro', mensaje, async () => {
          await pedirYMostrar('POST', `/api/proyectos/${proyecto.id}/versiones/${v.numero}/rechazar`, { motivo: motivo.value }, t('proyecto.listo.rechazada', { numero: v.numero }));
        })),
      mensaje);
  }
  return el('section', { class: 'tarjeta pendiente' }, partes);
}

function dibujarProyecto(d, aviso = null) {
  const { proyecto: p, activa, pendiente, versiones, historial, puedeEscribir = true } = d;
  const mensaje = caja();
  const base = pendiente || activa || versiones[0];
  const escribe = puedeEscribir && !p.enPapelera;

  const avisoEstado = p.enPapelera ? t('proyecto.en_papelera')
    : p.estado === 'con_errores' ? t('proyecto.error', { motivo: p.motivoError || t('valor.falta') })
      : p.estado === 'en_ejecucion' ? t(`proyecto.aviso_espera.${p.tipo}`)
        : p.estado === 'borrador' ? t('proyecto.aviso_borrador') : null;

  const acciones = [];
  if (escribe) {
    const disponibles = { en_ejecucion: ['pausar', 'completar'], pausado: ['reanudar', 'completar'], completado: ['reabrir'], con_errores: ['reintentar', 'pausar'] }[p.estado] || [];
    for (const accion of disponibles) {
      acciones.push(botonAccion(t(`accion.${accion}`), 'secundario', mensaje, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/estado`, { accion }, x => t('proyecto.listo.estado', { estado: t(`estado.${x.proyecto.estado}`) }))));
    }
  }

  const nombre = el('input', { id: 'campo-nombre-proyecto', type: 'text', value: p.nombre, maxlength: 80, autocomplete: 'off' });
  const cabecera = el('section', { class: 'tarjeta' },
    el('p', {}, el('a', { href: '#proyectos', texto: t('proyecto.volver') })),
    aviso ? el('p', { class: 'mensaje bien', role: 'status', texto: aviso }) : null,
    el('h1', { texto: p.nombre }),
    el('p', { class: 'etiquetas' }, el('span', { class: 'etiqueta', texto: t(`tipo.${p.tipo}`) }), etiquetaEstado(p),
      p.versionActiva ? el('span', { class: 'etiqueta', texto: t('proyecto.version_en_uso', { numero: p.versionActiva }) }) : null),
    avisoEstado ? el('p', { class: 'aviso', texto: avisoEstado }) : null,
    !puedeEscribir ? el('p', { class: 'suave', texto: t('proyectos.solo_lectura') }) : null,
    acciones.length ? el('div', { class: 'botones' }, acciones) : null,
    escribe ? el('details', {},
      el('summary', { texto: t('proyecto.renombrar') }),
      el('label', { for: 'campo-nombre-proyecto', texto: t('proyecto.nombre') }),
      nombre,
      botonAccion(t('proyecto.guardar_nombre'), 'secundario', mensaje, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/nombre`, { nombre: nombre.value }, t('proyecto.listo.nombre')))) : null,
    mensaje);

  const enUso = activa ? el('section', { class: 'tarjeta' },
    el('details', { open: !pendiente },
      el('summary', { texto: t('proyecto.activa.titulo', { numero: activa.numero }) }),
      el('p', { class: 'entendi', texto: fraseEntendi(activa.configuracion) }),
      resumen(activa.configuracion))) : null;

  let modificar = null;
  if (escribe) {
    const mensajeModificar = caja();
    const area = el('textarea', { id: 'campo-reinterpretar', rows: 5, maxlength: 4000, texto: base.instrucciones });
    modificar = el('section', { class: 'tarjeta' },
      el('h2', { texto: t('proyecto.modificar') }),
      el('p', { class: 'suave', texto: t('formulario.guardar.ayuda') }),
      el('details', {},
        el('summary', { texto: t('proyecto.modificar.instrucciones') }),
        el('label', { for: 'campo-reinterpretar', texto: t('proyectos.instrucciones') }),
        area,
        botonAccion(t('formulario.reinterpretar'), '', mensajeModificar, () =>
          pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'instrucciones', instrucciones: area.value }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero })))),
      el('details', {},
        el('summary', { texto: t('proyecto.modificar.campos') }),
        formularioCampos(base.configuracion, async campos => {
          await pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'campos', campos }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero }));
        })),
      mensajeModificar);
  }

  const listaVersiones = el('section', { class: 'tarjeta' },
    el('h2', { texto: t('proyecto.versiones') }),
    versiones.map(v => el('details', { class: 'version' },
      el('summary', { texto: t('version.linea', { numero: v.numero, estado: t(`version.estado.${v.estado}`), fecha: fecha(v.creadaEn) }) }),
      el('p', { class: 'suave', texto: t(`version.origen.${v.origen}`) }),
      el('p', { class: 'instrucciones', texto: v.instrucciones }),
      v.motivo ? el('p', { class: 'suave', texto: t('version.motivo', { motivo: v.motivo }) }) : null,
      resumen(v.configuracion))));

  const listaHistorial = el('section', { class: 'tarjeta' },
    el('details', {},
      el('summary', { texto: t('proyecto.historial') }),
      el('ul', { class: 'historial' }, historial.map(h => el('li', {},
        el('span', { texto: t(`historial.${h.accion}`, h.detalle || {}) }),
        el('span', { class: 'suave', texto: ` · ${fecha(h.fecha)}` }))))));

  const mensajePapelera = caja();
  const papelera = puedeEscribir ? el('section', { class: 'tarjeta' },
    p.enPapelera
      ? botonAccion(t('proyectos.restaurar'), '', mensajePapelera, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/papelera`, { enPapelera: false }, t('proyecto.listo.restaurado')))
      : botonAccion(t('proyecto.papelera'), 'peligro', mensajePapelera, async () => {
        if (!confirm(t('proyecto.confirmar_papelera', { nombre: p.nombre }))) return;
        await pedirYMostrar('POST', `/api/proyectos/${p.id}/papelera`, { enPapelera: true }, t('proyecto.listo.papelera'));
      }),
    mensajePapelera) : null;

  mostrar(marco('proyectos',
    cabecera,
    pendiente ? tarjetaVersion(pendiente, { proyecto: p, activa, puedeEscribir }) : null,
    enUso,
    modificar,
    listaVersiones,
    listaHistorial,
    papelera));
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
  if (seccion === 'proyectos') return pantallaProyectos();
  const proyecto = seccion.match(/^proyecto\/(\d+)$/);
  if (proyecto) return pantallaProyecto(proyecto[1]);
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
