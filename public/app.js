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
let avisosCuenta = { avisos: [], recientes: [] }; // avisos de la cuenta (por ejemplo, «el administrador reinició tu contraseña»)
let sesionTerminada = null; // de quién era la sesión que terminó: al entrar otra vez, la misma persona vuelve a donde estaba
const MANTENER = Symbol('mantener'); // un formulario que devuelve esto deja su botón apagado (ya se fue a otra pantalla)

// Si la persona cambia de pantalla mientras otra todavía carga, la vieja no se dibuja encima.
function nuevoTurno() {
  const mio = ++turno;
  return () => mio === turno;
}

// ---------- Tema (claro, oscuro o automático) ----------
// tema.js ya lo puso antes de dibujar la página; aquí se cambia desde Configuración. Se guarda solo en este navegador.
const TEMAS = ['claro', 'oscuro', 'auto'];
function temaGuardado() {
  try {
    const valor = localStorage.getItem('op_tema');
    return TEMAS.includes(valor) ? valor : 'claro';
  } catch { return 'claro'; }
}
function colorDeLaBarra() {
  // El color de la barra de arriba del iPhone sigue al fondo de la página.
  const meta = document.querySelector('meta[name="theme-color"]');
  const fondo = getComputedStyle(document.body || document.documentElement).backgroundColor;
  if (meta && fondo) meta.setAttribute('content', fondo);
}
function ponerTema(valor) {
  const tema = TEMAS.includes(valor) ? valor : 'claro';
  document.documentElement.setAttribute('data-tema', tema);
  try { localStorage.setItem('op_tema', tema); } catch { /* el navegador no deja guardar: vale solo por ahora */ }
  colorDeLaBarra();
}
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', colorDeLaBarra); } catch { /* navegador viejo */ }

// ---------- Lo escrito sin enviar ----------
// Si la sesión termina mientras la persona escribe, lo escrito no se pierde: queda en memoria (y en esta pestaña)
// y vuelve a su lugar cuando entra otra vez. Cada borrador lleva el número de la cuenta: otra persona no lo ve.
const borradores = new Map();
function guardarBorradores() {
  try { sessionStorage.setItem('op_borradores', JSON.stringify([...borradores])); } catch { /* sin almacenamiento: queda en memoria */ }
}
function leerBorradores() {
  try {
    const lista = JSON.parse(sessionStorage.getItem('op_borradores') || '[]');
    if (Array.isArray(lista)) for (const par of lista) if (Array.isArray(par) && typeof par[0] === 'string' && typeof par[1] === 'string') borradores.set(par[0], par[1]);
  } catch { /* nada guardado */ }
}
function borrador(clave, valor) {
  const llave = `${estado.usuario?.id ?? '-'}|${clave}`;
  if (valor === undefined) return borradores.get(llave);
  if (valor) borradores.set(llave, valor); else borradores.delete(llave);
  guardarBorradores();
  return valor;
}
// Un cuadro de texto que recuerda lo escrito. Devuelve true si trajo de vuelta algo escrito antes.
function recordarTexto(area, clave) {
  const guardado = borrador(clave);
  area.addEventListener('input', () => borrador(clave, area.value));
  if (guardado && guardado !== area.value) {
    area.value = guardado;
    return true;
  }
  return false;
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
  for (const hijo of hijos.flat(Infinity)) {
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
    // Se recuerda de quién era: si entra la misma persona, vuelve a la misma pantalla (la dirección no cambia).
    sesionTerminada = estado.usuario.id;
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
  raiz.replaceChildren(...contenido.flat(Infinity).filter(parte => parte != null && parte !== false));
  window.scrollTo(0, 0);
  // Para quien usa VoiceOver: después de dibujar, el foco va al mensaje nuevo (si hay) o al título de la pantalla.
  const foco = raiz.querySelector('[data-foco]') || raiz.querySelector('h1');
  if (foco) {
    if (!foco.hasAttribute('tabindex')) foco.setAttribute('tabindex', '-1');
    try { foco.focus({ preventScroll: true }); } catch { foco.focus(); }
  }
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
    let mantener = false;
    try {
      mantener = (await accion(new FormData(formulario))) === MANTENER;
    } catch (error) {
      decir(cajaMensaje, error.message || t('error.desconocido'), 'error');
    } finally {
      if (!mantener) boton.disabled = false;
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
    campo('clave', t('setup.clave'), 'password', { autocomplete: 'new-password', minlength: 6 }),
    campo('clave2', t('setup.clave2'), 'password', { autocomplete: 'new-password', minlength: 6 }),
    el('p', { class: 'ayuda', texto: t('setup.clave.ayuda') }),
    el('button', { type: 'submit', texto: t('setup.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    // Se revisa aquí antes de enviar, para que un error al escribir no gaste intentos.
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/i.test(String(datos.get('nombre')).trim())) throw new Error(t('error.nombre_no_valido'));
    if (String(datos.get('clave')).length < 6) throw new Error(t('error.clave_corta'));
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
    avisosCuenta = leerAvisos(r.datos);
    if (idiomaElegidoAlEntrar && estado.usuario.idioma !== idioma) {
      // Eligió un idioma en esta pantalla: se guarda en su cuenta.
      const cambio = await api('POST', '/api/yo/idioma', { idioma });
      if (cambio.ok) estado.usuario.idioma = idioma;
    } else if (estado.usuario.idioma !== idioma) {
      await cargarIdioma(estado.usuario.idioma);
      guardarIdioma(estado.usuario.idioma);
    }
    // La misma persona vuelve a donde estaba (y a lo que estaba escribiendo); otra persona empieza en Inicio.
    const otraPersona = sesionTerminada != null && sesionTerminada !== estado.usuario.id;
    sesionTerminada = null;
    if (otraPersona || !location.hash) history.replaceState(null, '', '#inicio');
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
    campo('nueva', t('clave.nueva'), 'password', { autocomplete: 'new-password', minlength: 6 }),
    campo('nueva2', t('clave.nueva2'), 'password', { autocomplete: 'new-password', minlength: 6 }),
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
    avisosDeCuenta({ marcar: false }),
    formularioClave({ alTerminar: async () => { estado.usuario.debeCambiarClave = false; if (!location.hash) history.replaceState(null, '', '#inicio'); await dibujar(); } }),
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
  sesionTerminada = null;
  avisosCuenta = { avisos: [], recientes: [] };
  borradores.clear();
  guardarBorradores();
  await refrescarSetup();
  history.replaceState(null, '', location.pathname);
  await dibujar();
}

// ---------- Pantallas con sesión ----------
// Los avisos de la cuenta se muestran arriba hasta que la dueña los ve con su propia contraseña (no se borran: siguen en
// Configuración). Con la contraseña temporal se muestran pero NO se marcan como vistos: quien entra con ella puede ser
// otra persona. Y cada vez que hay uno nuevo se listan todos los reinicios recientes, también los ya vistos: así la
// dueña ve la fecha de un reinicio que no pidió aunque otro lo haya «visto» antes.
function leerAvisos(datos) {
  const avisos = (Array.isArray(datos?.avisos) ? datos.avisos : []).filter(a => a && a.tipo === 'clave_reiniciada' && Number.isSafeInteger(a.id));
  const recientes = (Array.isArray(datos?.reiniciosRecientes) ? datos.reiniciosRecientes : []).filter(x => x && typeof x.fecha === 'string');
  return { avisos, recientes };
}

function avisosDeCuenta({ marcar = true } = {}) {
  const { avisos, recientes } = avisosCuenta;
  if (!avisos.length) return null;
  if (marcar) {
    avisosCuenta = { avisos: [], recientes: [] };
    api('POST', '/api/yo/avisos/vistos', { hasta: Math.max(...avisos.map(a => a.id)) });
  }
  const fechas = recientes.length ? recientes.map(x => x.fecha) : avisos.map(a => a.fecha).reverse();
  return el('section', { class: 'tarjeta', role: 'alert' },
    fechas.length > 1 ? el('p', { class: 'suave', texto: t('aviso.clave_reiniciada.recientes', { dias: 90 }) }) : null,
    fechas.map(f => el('p', { class: 'aviso', texto: t('aviso.clave_reiniciada', { fecha: fecha(f) }) })),
    el('p', { class: 'suave', texto: t(fechas.length > 1 ? 'aviso.clave_reiniciada.que_hacer_varios' : 'aviso.clave_reiniciada.que_hacer') }));
}

function marco(seccion, ...contenido) {
  const enlaces = [['inicio', 'menu.inicio'], ['proyectos', 'menu.proyectos'], ['configuracion', 'menu.configuracion']];
  if (estado.usuario.rol === 'admin') enlaces.push(['admin', 'menu.admin']);
  return [
    el('header', { class: 'encabezado' },
      el('div', { class: 'marca', texto: t('app.nombre') }),
      el('button', { type: 'button', class: 'secundario', texto: t('menu.salir'), onclick: salir })),
    el('nav', { class: 'menu', 'aria-label': t('menu.titulo') },
      enlaces.map(([id, clave]) => el('a', { href: `#${id}`, 'aria-current': id === seccion ? 'page' : null, texto: t(clave) }))),
    avisosDeCuenta(),
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
  // Quien solo puede ver (lector) no aprueba: se le dice que espera al dueño.
  const escribe = r.ok ? r.datos.puedeEscribir !== false : true;
  const aprobar = el('section', { class: 'tarjeta' },
    el('h2', { texto: escribe ? t('inicio.aprobar.titulo') : t('inicio.aprobar.titulo_lector') }),
    !r.ok ? el('p', { class: 'mensaje error', texto: textoError(r.datos.error) })
      : pendientes.length ? [
        pendientes.map(p => el('a', { class: 'fila enlace', href: `#proyecto/${p.id}` },
          el('span', { class: 'nombre', texto: p.nombre }),
          el('span', { class: 'etiquetas' },
            el('span', { class: 'etiqueta', texto: t(`tipo.${p.tipo}`) }),
            el('span', { class: 'etiqueta aviso-etiqueta', texto: t(escribe ? 'inicio.aprobar.version' : 'inicio.aprobar.version_lector', { numero: p.versionPendiente }) })))),
        // Antes de aprobar, sin rodeos: aprobar guarda el proyecto, pero todavía no busca.
        el('p', { class: 'suave', texto: t('inicio.aprobar.fase') }),
      ]
        : el('p', { class: 'suave', texto: t('inicio.aprobar.vacio') }),
    r.ok ? el('p', { class: 'suave' }, el('a', { href: '#proyectos', texto: t('inicio.ir_proyectos', { usados: r.datos.usados, limite: r.datos.limite }) })) : null);
  mostrar(marco('inicio',
    el('section', { class: 'tarjeta' },
      el('h1', { texto: t('inicio.hola', { nombre: estado.usuario.nombreVisible || estado.usuario.nombre }) }),
      el('p', { class: 'suave', texto: t('inicio.texto') })),
    aprobar,
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.funciona') }),
      lista(['inicio.funciona.1', 'inicio.funciona.4', 'inicio.funciona.2', 'inicio.funciona.3'])),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.viene') }),
      lista(['inicio.viene.tareas', 'inicio.viene.ia', 'inicio.viene.copias', 'inicio.viene.clientes', 'inicio.viene.empleos']))));
}

// Botones de los que se elige uno (idioma, tema): el elegido se ve lleno y lo dice a VoiceOver (aria-pressed).
function grupoDeBotones(opciones, elegido, alElegir) {
  const botones = opciones.map(([valor, texto]) => el('button', {
    type: 'button',
    class: valor === elegido ? '' : 'secundario',
    'aria-pressed': valor === elegido ? 'true' : 'false',
    texto,
    onclick: () => alElegir(valor, () => botones.forEach((b, i) => {
      const marcado = opciones[i][0] === valor;
      b.className = marcado ? '' : 'secundario';
      b.setAttribute('aria-pressed', marcado ? 'true' : 'false');
    })),
  }));
  return el('div', { class: 'botones' }, botones);
}

async function pantallaConfiguracion() {
  const vigente = nuevoTurno();
  const reinicios = await api('GET', '/api/yo/reinicios');
  if (!vigente()) return;
  const mensajeIdioma = caja();
  const botonesIdioma = grupoDeBotones(['es', 'en'].map(v => [v, t(`idioma.${v}`)]), idioma, async valor => {
    const r = await api('POST', '/api/yo/idioma', { idioma: valor });
    if (!r.ok) return decir(mensajeIdioma, textoError(r.datos.error), 'error');
    estado.usuario.idioma = valor;
    guardarIdioma(valor);
    await cargarIdioma(valor);
    pantallaConfiguracion();
  });
  const botonesTema = grupoDeBotones([['claro', t('tema.claro')], ['oscuro', t('tema.oscuro')], ['auto', t('tema.auto')]], temaGuardado(), (valor, marcar) => {
    ponerTema(valor);
    marcar();
  });
  const lista = reinicios.ok ? reinicios.datos.reinicios : null;
  mostrar(marco('configuracion',
    el('section', { class: 'tarjeta' },
      el('h1', { texto: t('config.titulo') }),
      el('h2', { texto: t('config.cuenta') }),
      estado.usuario.nombreVisible && estado.usuario.nombreVisible !== estado.usuario.nombre
        ? el('p', { texto: t('config.nombre', { nombre: estado.usuario.nombreVisible }) }) : null,
      el('p', { texto: t('config.usuario', { nombre: estado.usuario.nombre }) }),
      el('p', { class: 'suave', texto: t(estado.usuario.rol === 'admin' ? 'config.rol.admin' : 'config.rol.usuario') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('idioma.titulo') }), botonesIdioma, mensajeIdioma),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('tema.titulo') }), botonesTema, el('p', { class: 'ayuda', texto: t('tema.ayuda') })),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('clave.titulo') }), formularioClave({})),
    el('section', { class: 'tarjeta' },
      el('h2', { texto: t('config.reinicios') }),
      !lista ? el('p', { class: 'mensaje error', texto: textoError(reinicios.datos.error) })
        : lista.length ? [
          el('p', { class: 'suave', texto: t('config.reinicios.texto') }),
          el('ul', {}, lista.map(x => el('li', { texto: t('config.reinicios.linea', { fecha: fecha(x.fecha) }) }))),
        ] : el('p', { class: 'suave', texto: t('config.reinicios.vacio') }))));
}

function bloqueClaveTemporal(textoClave, nombre, temporal, usuario = nombre) {
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
  return el('div', { class: 'mensaje bien', 'data-foco': true },
    el('p', { texto: t(textoClave, { nombre }) }),
    el('p', { texto: t('admin.entra_con', { usuario }) }),
    clave, boton, ayuda);
}

// El nombre de usuario que se propone a partir del nombre completo: «Juan Pérez» → «juan.perez».
// Minúsculas, sin tildes (ñ → n), solo letras, números y un punto entre el primer nombre y el primer apellido.
// Con 4 palabras o más («Ana María Pérez Gómez») el primer apellido es la tercera; «de», «del», «la»… no cuentan.
const PARTICULAS_DE_NOMBRE = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'di', 'van', 'von', 'mc']);
function usuarioPropuesto(nombreCompleto) {
  const palabras = String(nombreCompleto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(p => p && !PARTICULAS_DE_NOMBRE.has(p));
  if (!palabras.length) return '';
  const partes = palabras.length === 1 ? [palabras[0]] : [palabras[0], palabras[palabras.length >= 4 ? 2 : 1]];
  let base = partes.map(p => p.slice(0, 18)).join('.');
  while (base.length < 3) base += '1';
  return base;
}
// El primero libre: juan.perez, juan.perez2, juan.perez3…
function usuarioLibre(base, ocupados) {
  if (!base) return '';
  if (!ocupados.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!ocupados.has(`${base}${n}`)) return `${base}${n}`;
  return base;
}

// La última contraseña temporal que se creó (cuenta nueva o reinicio). Se sigue mostrando aunque la pantalla se vuelva
// a dibujar (por ejemplo, al cambiarle el plan a esa cuenta enseguida), hasta que el administrador toque «Ya se la di»
// o se vaya de Administrador: si se perdiera, habría que reiniciarla y la persona vería un reinicio que no pidió.
let claveTemporalVisible = null;

function seccionClaveTemporal() {
  if (!claveTemporalVisible) return null;
  const { textoClave, nombre, temporal, usuario } = claveTemporalVisible;
  const seccion = el('section', { class: 'tarjeta' }, bloqueClaveTemporal(textoClave, nombre, temporal, usuario));
  seccion.append(el('button', {
    type: 'button',
    class: 'secundario',
    texto: t('admin.clave.ya_la_di'),
    onclick: () => { claveTemporalVisible = null; seccion.remove(); },
  }));
  return seccion;
}

// «mantenerClave»: la pantalla se vuelve a dibujar sin salir de Administrador (la contraseña temporal sigue a la vista).
async function pantallaAdmin(avisoArriba = null, { mantenerClave = false } = {}) {
  if (!mantenerClave) claveTemporalVisible = null;
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/admin/usuarios');
  if (!vigente()) return;
  if (!r.ok) {
    mostrar(marco('admin', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
    return;
  }
  const planes = Array.isArray(r.datos.planes) ? r.datos.planes : [];
  const ocupados = new Set(r.datos.usuarios.map(u => String(u.nombre).toLowerCase()));
  const mensaje = caja();
  const completo = el('input', { id: 'campo-nombre-completo', name: 'nombreVisible', type: 'text', maxlength: 80, autocomplete: 'off', autocapitalize: 'words' });
  const usuario = el('input', { id: 'campo-nombre', name: 'nombre', type: 'text', maxlength: 40, required: true, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' });
  // Mientras el administrador no escriba el usuario a mano, se va proponiendo solo.
  let usuarioAMano = false;
  completo.addEventListener('input', () => { if (!usuarioAMano) usuario.value = usuarioLibre(usuarioPropuesto(completo.value), ocupados); });
  usuario.addEventListener('input', () => { usuarioAMano = usuario.value.trim() !== ''; });
  const formulario = el('form', { novalidate: true },
    el('label', { for: 'campo-nombre-completo', texto: t('admin.nuevo.nombre_completo') }),
    completo,
    el('label', { for: 'campo-nombre', texto: t('admin.nuevo.nombre') }),
    usuario,
    el('p', { class: 'ayuda', texto: t('admin.nuevo.nombre.ayuda') }),
    el('label', { for: 'campo-rol', texto: t('admin.nuevo.rol') }),
    el('select', { id: 'campo-rol', name: 'rol' },
      el('option', { value: 'usuario', texto: t('admin.rol.usuario') }),
      el('option', { value: 'admin', texto: t('admin.rol.admin') })),
    el('label', { for: 'campo-idioma-nuevo', texto: t('admin.nuevo.idioma') }),
    el('select', { id: 'campo-idioma-nuevo', name: 'idioma' },
      el('option', { value: 'es', texto: t('idioma.es') }),
      el('option', { value: 'en', texto: t('idioma.en') })),
    el('p', { class: 'ayuda', texto: t('admin.nuevo.plan') }),
    el('button', { type: 'submit', texto: t('admin.nuevo.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    const nombre = String(datos.get('nombre')).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(nombre)) throw new Error(t('error.nombre_no_valido'));
    const creado = await api('POST', '/api/admin/usuarios', { nombre, nombreVisible: String(datos.get('nombreVisible')).trim(), rol: datos.get('rol'), idioma: datos.get('idioma') });
    if (creado.datos.error === 'nombre_ocupado') {
      // Ya existe: se propone el siguiente libre (juan.perez2…) y el administrador decide.
      ocupados.add(nombre);
      const otro = usuarioLibre(nombre.replace(/\d+$/, '') || nombre, ocupados);
      usuario.value = otro;
      usuarioAMano = false;
      usuario.focus();
      throw new Error(t('admin.nombre_ocupado_propuesta', { nombre: otro }));
    }
    if (!creado.ok) throw new Error(textoError(creado.datos.error));
    claveTemporalVisible = { textoClave: 'admin.creado', nombre: creado.datos.nombreVisible || creado.datos.nombre, temporal: creado.datos.claveTemporal, usuario: creado.datos.nombre };
    await pantallaAdmin(null, { mantenerClave: true });
    return MANTENER;
  });

  // «Proyectos permitidos» de cada cuenta. Si tiene más proyectos en uso de los que permite el plan, el servidor no cambia nada y lo explica.
  // Un administrador siempre tiene al menos 20: a él no se le muestra un plan que no cambia nada.
  const controlPlan = u => {
    if (u.rol === 'admin' && u.proyectosPermitidos) return el('p', { class: 'suave', texto: t('admin.plan.es_admin', { n: u.proyectosPermitidos }) });
    if (!u.plan || !planes.length) return null;
    const id = `plan-${u.id}`;
    const mensajePlan = caja();
    const selector = el('select', { id }, planes.map(x => el('option', { value: x.clave, selected: x.clave === u.plan, texto: t(`plan.${x.clave}`) })));
    return el('div', {},
      el('div', { class: 'plan' },
        el('label', { for: id, texto: t('admin.plan', { n: u.proyectosPermitidos }) }),
        selector,
        botonAccion(t('admin.plan.guardar'), 'secundario', mensajePlan, async () => {
          if (selector.value === u.plan) return decir(mensajePlan, t('admin.plan.igual'), 'bien');
          const x = await api('POST', `/api/admin/usuarios/${u.id}/plan`, { plan: selector.value });
          if (!x.ok) throw new Error(textoError(x.datos.error));
          await pantallaAdmin(el('p', { class: 'mensaje bien', 'data-foco': true, texto: t('admin.plan.listo', { nombre: u.nombreVisible || u.nombre, n: x.datos.proyectosPermitidos }) }), { mantenerClave: true });
        })),
      mensajePlan);
  };

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
          claveTemporalVisible = { textoClave: 'admin.reiniciada', nombre: u.nombreVisible || x.datos.nombre, temporal: x.datos.claveTemporal, usuario: x.datos.nombre };
          await pantallaAdmin(null, { mantenerClave: true });
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
          await pantallaAdmin(null, { mantenerClave: true });
        },
      }));
    return el('div', { class: 'fila' },
      el('div', {},
        el('span', { class: 'nombre', texto: u.nombreVisible || u.nombre }),
        el('span', { class: 'etiqueta', texto: t(u.rol === 'admin' ? 'admin.rol.admin' : 'admin.rol.usuario') }),
        el('span', { class: `etiqueta ${u.activo ? 'bien' : 'mal'}`, texto: t(u.activo ? 'admin.activo' : 'admin.inactivo') })),
      u.nombreVisible && u.nombreVisible !== u.nombre ? el('p', { class: 'suave', texto: t('admin.usuario_linea', { nombre: u.nombre }) }) : null,
      el('p', { class: 'suave', texto: u.ultimoAcceso ? t('admin.ultimo', { fecha: fecha(u.ultimoAcceso) }) : t('admin.nunca') }),
      u.debeCambiarClave ? el('p', { class: 'suave', texto: t('admin.cambiar_pendiente') }) : null,
      controlPlan(u),
      acciones);
  });

  mostrar(marco('admin',
    el('section', { class: 'tarjeta' }, el('h1', { texto: t('admin.titulo') })),
    avisoArriba ? el('section', { class: 'tarjeta' }, avisoArriba) : null,
    seccionClaveTemporal(),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('admin.usuarios') }), filas),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('admin.nuevo') }), formulario)));
}

// ---------- Proyectos ----------
let catalogo = null;

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

// Para comparar textos sin fijarse en mayúsculas, tildes ni espacios de más.
const comparable = texto => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Lo que vende, en el idioma que usa la persona ahora: si lo guardado es exactamente el nombre de productos
// del catálogo («paneles solares»), se muestra con el nombre del catálogo en este idioma («solar panels»).
// Si la persona lo escribió con sus palabras, se muestra tal cual.
function productoDe(c) {
  if (!c.producto || c.tipo !== 'comercial' || !Array.isArray(c.productos) || !c.productos.length) return c.producto;
  const items = c.productos.map(clave => catalogo.productos.find(x => x.clave === clave));
  if (!items.every(x => x && x.es && x.en)) return c.producto;
  const formas = new Set();
  for (const lengua of ['es', 'en']) {
    const nombres = items.map(x => x[lengua]);
    formas.add(comparable(nombres.join(', ')));
    try { formas.add(comparable(new Intl.ListFormat(lengua, { type: 'conjunction' }).format(nombres))); } catch { /* navegador viejo */ }
  }
  return formas.has(comparable(c.producto)) ? unir(items.map(x => x[idioma] || x.es)) : c.producto;
}

// El objetivo que OPORTIA sugirió al crear el proyecto se muestra en el idioma de ahora;
// si la persona lo escribió a mano, se muestra tal cual.
function objetivoDe(c) {
  const p = String(c.producto ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const sugeridos = c.tipo === 'laboral'
    ? (p ? [`Conseguir empleo de ${p}`, `Get a job as ${p}`] : ['Conseguir empleo', 'Get a job'])
    : (p ? [`Encontrar clientes que puedan necesitar ${p}`, `Find customers who may need ${p}`] : ['Encontrar clientes', 'Find customers']);
  if (!sugeridos.some(x => comparable(x) === comparable(c.objetivo))) return c.objetivo;
  const producto = productoDe(c);
  if (c.tipo === 'laboral') return producto ? t('objetivo.laboral', { producto }) : t('objetivo.laboral.sin_producto');
  return producto ? t('objetivo.comercial', { producto }) : t('objetivo.comercial.sin_producto');
}

// La frase «Entendí que…» se arma con la configuración, en el idioma que esté usando la persona.
function fraseEntendi(c) {
  const falta = t('valor.falta');
  const zonas = c.paisCompleto ? [t('valor.pais_frase'), ...zonasDe(c)] : zonasDe(c);
  if (c.tipo === 'laboral') return t('proyecto.entendi.laboral', { producto: productoDe(c) || falta, zonas: unir(zonas) || falta });
  return t('proyecto.entendi.comercial', {
    sectores: unir(sectoresDe(c).map(enMinuscula)) || falta,
    zonas: unir(zonas) || falta,
    producto: productoDe(c) || falta,
  });
}

// Lo que todavía no se puede elegir, dicho claramente (sin botones que no hacen nada).
function proximamente() {
  return el('div', { class: 'proximamente' },
    el('p', { texto: t('proximamente.fuentes') }),
    el('p', { texto: t('proximamente.analisis') }));
}

function textoIa(c) {
  return c.ia?.permitida ? t('valor.ia.permitida', { tope: `US$${Number(c.ia.topeMensualUsd) || 0}` }) : t('valor.ia.no_permitida');
}

function resumen(c) {
  const filas = [];
  const fila = (clave, valor) => { if (valor) filas.push(el('dt', { texto: t(clave) }), el('dd', { texto: valor })); };
  fila('campo.tipo', t(`tipo.${c.tipo}`));
  fila('campo.objetivo', objetivoDe(c));
  fila(`campo.producto.${c.tipo}`, productoDe(c));
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
  fila('campo.autonomia', `${t(`autonomia.${c.autonomia || catalogo.autonomiaPorDefecto}`)}. ${t('autonomia.contactar_siempre')}`);
  fila('campo.capacidades', unir(catalogo.capacidades.filter(x => c.capacidades[x.clave]).map(x => t(`capacidad.${x.clave}`))));
  fila('campo.fuentes', unir(c.fuentes.map(f => t(`fuente.${f}`))));
  fila('campo.ia', textoIa(c));
  const costo = Number(c.costoEstimadoUsd) || 0;
  fila('campo.costo', costo ? t('valor.costo.mes', { cantidad: `US$${costo}` }) : t('valor.costo'));
  return el('div', {}, el('dl', { class: 'resumen' }, filas), proximamente());
}

// En la papelera no se muestra el estado (diría «En ejecución» de algo que no trabaja): se dice que está en la papelera.
// El nombre del estado. Mientras no existan las fases que buscan, un proyecto aprobado no trabaja todavía:
// no se le dice «En ejecución» (ni en verde), sino «Aprobado · espera la fase 2» (o la 6, si busca empleo).
function nombreDeEstado(p) {
  if (p.estado === 'en_ejecucion') return t(p.tipo === 'laboral' ? 'estado.en_ejecucion.laboral' : 'estado.en_ejecucion.comercial');
  return t(`estado.${p.estado}`);
}

function etiquetaEstado(p) {
  if (p.enPapelera) return el('span', { class: 'etiqueta mal', texto: t('proyecto.etiqueta_papelera') });
  const clase = { con_errores: 'mal', pendiente: 'aviso-etiqueta' }[p.estado] || '';
  return el('span', { class: `etiqueta ${clase}`, texto: nombreDeEstado(p) });
}

function tarjetaError(mensaje) {
  return el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', 'data-foco': true, texto: mensaje }));
}

// Antes de aprobar por primera vez, sin rodeos: aprobar guarda el proyecto, pero la búsqueda llega más adelante.
const avisoAntesDeAprobar = tipo => t(tipo === 'laboral' ? 'proyecto.aviso_antes.laboral' : 'proyecto.aviso_antes.comercial');

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

// Errores que quieren decir «esto cambió en otro equipo»: el proyecto se vuelve a cargar solo y se avisa.
const CAMBIO_EN_OTRO_LADO = new Set(['version_no_pendiente', 'accion_no_permitida_ahora', 'en_papelera']);

// Hace el pedido y, si salió bien, vuelve a dibujar el proyecto con un aviso arriba.
async function pedirYMostrar(metodo, ruta, datos, aviso) {
  const pantalla = turno;
  const r = await api(metodo, ruta, datos);
  if (!r.ok) {
    const numero = ruta.match(/^\/api\/proyectos\/(\d+)/)?.[1];
    if (numero && CAMBIO_EN_OTRO_LADO.has(r.datos.error)) {
      const ahora = await api('GET', `/api/proyectos/${numero}`);
      if (ahora.ok && pantalla === turno) {
        dibujarProyecto(ahora.datos, { texto: t('proyecto.cambio_en_otro_lado'), clase: 'aviso' });
        return;
      }
    }
    throw new Error(textoError(r.datos.error));
  }
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
      p.versionPendiente && p.estado !== 'pendiente' && !p.enPapelera ? el('span', { class: 'etiqueta aviso-etiqueta', texto: t('proyectos.cambios_pendientes') }) : null),
    el('span', { class: 'suave', texto: t('proyectos.actualizado', { fecha: fecha(p.actualizadoEn) }) }));

  let nuevo;
  if (!puedeEscribir) nuevo = el('p', { class: 'aviso', texto: t('proyectos.solo_lectura') });
  else if (usados >= limite) nuevo = el('p', { class: 'aviso', texto: t('error.limite_de_proyectos') });
  else {
    const mensaje = caja();
    const area = el('textarea', { id: 'campo-instrucciones', name: 'instrucciones', rows: 5, required: true, minlength: 10, maxlength: 4000 });
    recordarTexto(area, 'nuevo');
    const formulario = el('form', { novalidate: true },
      el('label', { for: 'campo-instrucciones', texto: t('proyectos.instrucciones') }),
      el('p', { class: 'ayuda', texto: t('proyectos.instrucciones.ayuda') }),
      area,
      el('details', { class: 'ejemplos' },
        el('summary', { texto: t('proyectos.ejemplos') }),
        ['proyectos.ejemplo.1', 'proyectos.ejemplo.2', 'proyectos.ejemplo.3'].map(clave => el('div', { class: 'ejemplo' },
          el('p', { texto: t(clave) }),
          el('button', {
            type: 'button',
            class: 'secundario',
            texto: t('proyectos.usar_ejemplo'),
            onclick: () => {
              // Lo que la persona ya escribió no se pierde sin preguntarle.
              if (area.value.trim() && area.value.trim() !== t(clave) && !confirm(t('proyectos.reemplazar_texto'))) return;
              area.value = t(clave);
              borrador('nuevo', area.value);
              area.focus();
            },
          })))),
      el('button', { type: 'submit', texto: t('proyectos.crear') }),
      mensaje);
    alEnviar(formulario, mensaje, async datos => {
      const creado = await api('POST', '/api/proyectos', { instrucciones: datos.get('instrucciones') });
      if (!creado.ok) throw new Error(textoError(creado.datos.error));
      borrador('nuevo', '');
      // El proyecto se dibuja con lo que respondió el servidor (sin pedirlo otra vez) y el botón queda apagado:
      // así un segundo toque no puede crear otro.
      if (!vigente()) return MANTENER;
      history.pushState(null, '', `#proyecto/${creado.datos.proyecto.id}`);
      turno++;
      dibujarProyecto(creado.datos, t(creado.datos.repetido ? 'proyecto.listo.repetido' : 'proyecto.listo.creado'));
      return MANTENER;
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
  dibujarProyecto(r.datos);
}

// «Cambiar los datos a mano». «dudasTodas»: lo que el motor no entendió y lo que choca (lo mismo para buscar y excluir).
function formularioCampos(c, dudasTodas, alGuardar) {
  const mensaje = caja();
  const id = nombre => `f-${nombre}`;
  const etiqueta = (nombre, texto) => el('label', { for: id(nombre), texto });
  const linea = (nombre, texto, valor, extra = {}) => [etiqueta(nombre, texto), el('input', { id: id(nombre), name: nombre, type: 'text', value: valor, autocomplete: 'off', ...extra })];
  const casilla = (nombre, texto, marcada, valor, ayuda) => el('label', { class: 'casilla' },
    el('input', { type: 'checkbox', name: nombre, value: valor, checked: marcada }),
    el('span', {}, texto, ayuda ? el('small', { class: 'ayuda', texto: ayuda }) : null));
  const simbolo = moneda => (moneda === 'USD' ? 'US$' : 'RD$');

  const tipo = el('select', { id: id('tipo'), name: 'tipo' }, catalogo.tipos.map(x => el('option', { value: x, selected: x === c.tipo, texto: t(`tipo.${x}`) })));
  const etiquetaProducto = etiqueta('producto', t(`campo.producto.${c.tipo}`));
  const comercial = el('div', { hidden: c.tipo !== 'comercial' },
    linea('sectores', t('formulario.sectores'), sectoresDe(c).join(', ')),
    el('fieldset', {}, el('legend', { texto: t('campo.tamanos') }),
      catalogo.tamanos.map(x => casilla('tamanos', t(`tamano.${x}`), c.tamanos.includes(x), x))));

  // Salario: con su moneda (RD$ o US$) y el mínimo nunca mayor que el máximo.
  const moneda = el('select', { id: id('moneda'), name: 'moneda' },
    el('option', { value: 'DOP', selected: c.moneda !== 'USD', texto: t('moneda.DOP') }),
    el('option', { value: 'USD', selected: c.moneda === 'USD', texto: t('moneda.USD') }));
  const [etiquetaMinimo, salarioMinimo] = linea('salarioMinimo', t('formulario.salario_minimo', { moneda: simbolo(c.moneda) }), c.salarioMinimo ?? '', { type: 'number', inputmode: 'numeric', min: 0, step: 1 });
  const [etiquetaMaximo, salarioMaximo] = linea('salarioMaximo', t('formulario.salario_maximo', { moneda: simbolo(c.moneda) }), c.salarioMaximo ?? '', { type: 'number', inputmode: 'numeric', min: 0, step: 1 });
  moneda.addEventListener('change', () => {
    etiquetaMinimo.textContent = t('formulario.salario_minimo', { moneda: simbolo(moneda.value) });
    etiquetaMaximo.textContent = t('formulario.salario_maximo', { moneda: simbolo(moneda.value) });
  });
  const laboral = el('div', { hidden: c.tipo !== 'laboral' },
    etiqueta('moneda', t('formulario.moneda')), moneda,
    etiquetaMinimo, salarioMinimo, etiquetaMaximo, salarioMaximo,
    casilla('experiencia', t('formulario.experiencia'), c.experiencia === 'no_requerida', 'si'));

  // Qué hará el proyecto. La fase en que empieza cada cosa depende del tipo (clientes: fase 2 o 3; empleos: fase 6).
  const casillasCapacidad = catalogo.capacidades.map(x => {
    const ayuda = el('small', { class: 'ayuda' });
    const entrada = el('input', { type: 'checkbox', name: 'capacidades', value: x.clave, checked: c.capacidades[x.clave] });
    return { clave: x.clave, entrada, ayuda, nodo: el('label', { class: 'casilla' }, entrada, el('span', {}, t(`capacidad.${x.clave}`), ayuda)) };
  });
  const capacidad = clave => casillasCapacidad.find(x => x.clave === clave);
  const ponerFases = valorTipo => casillasCapacidad.forEach(x => {
    const fase = faseDe(x.clave, valorTipo);
    x.ayuda.textContent = fase ? `${t(`capacidad.${x.clave}.ayuda`)} ${t('capacidad.desde', { fase })}` : t(`capacidad.${x.clave}.ayuda`);
  });
  ponerFases(c.tipo);
  // «Contactar» necesita los correos: mientras esté marcado, «Preparar correos» queda marcado y no se puede quitar.
  const contactar = capacidad('contactar').entrada;
  const correos = capacidad('correos');
  const notaCorreos = el('small', { class: 'ayuda', texto: t('formulario.correos_por_contactar') });
  correos.nodo.querySelector('span').append(notaCorreos);
  const ajustarCorreos = () => {
    if (contactar.checked) correos.entrada.checked = true;
    correos.entrada.disabled = contactar.checked;
    notaCorreos.hidden = !contactar.checked;
  };
  contactar.addEventListener('change', ajustarCorreos);
  const marcar = lista => { casillasCapacidad.forEach(x => { x.entrada.checked = lista.includes(x.clave); }); ajustarCorreos(); };
  ajustarCorreos();

  tipo.addEventListener('change', () => {
    comercial.hidden = tipo.value !== 'comercial';
    laboral.hidden = tipo.value !== 'laboral';
    etiquetaProducto.textContent = t(`campo.producto.${tipo.value}`);
    ponerFases(tipo.value);
  });

  // Cada cuánto y cuánta libertad tiene. «Solo cuando yo lo pida» siempre va con la frecuencia manual.
  const frecuencia = el('select', { id: id('frecuencia'), name: 'frecuencia' }, catalogo.frecuencias.map(x => el('option', { value: x, selected: x === c.frecuencia, texto: t(`frecuencia.${x}`) })));
  const autonomia = el('select', { id: id('autonomia'), name: 'autonomia' },
    catalogo.autonomias.map(x => el('option', { value: x, selected: x === (c.autonomia || catalogo.autonomiaPorDefecto), texto: t(`autonomia.${x}`) })));
  autonomia.addEventListener('change', () => { if (autonomia.value === 'solo_cuando_pida') frecuencia.value = 'manual'; });
  frecuencia.addEventListener('change', () => { if (frecuencia.value !== 'manual' && autonomia.value === 'solo_cuando_pida') autonomia.value = catalogo.autonomiaPorDefecto; });

  // Lo que el motor no entendió: la persona lo arregla abajo y lo marca, o lo marca porque no importa.
  // Lo que choca (lo mismo en «Dónde» y en «Excluir», un lugar de fuera) se arregla solo al corregir el dato.
  const noEntendido = Array.isArray(c.noEntendido) ? c.noEntendido : [];
  const calculadas = (Array.isArray(dudasTodas) ? dudasTodas : []).filter(d => !noEntendido.some(x => x.clave === d.clave && x.texto === d.texto));
  const dudasDelFormulario = noEntendido.length || calculadas.length ? el('fieldset', { class: 'dudas' }, el('legend', { texto: t('formulario.dudas') }),
    noEntendido.length ? [
      el('p', { class: 'ayuda', texto: t('formulario.dudas.ayuda') }),
      noEntendido.map((d, numero) => casilla('resueltas', textoDuda(d), false, String(numero), t('formulario.duda_resuelta'))),
    ] : null,
    calculadas.length ? [
      el('p', { class: 'ayuda', texto: t('formulario.dudas.calculadas') }),
      el('ul', {}, calculadas.map(d => el('li', { texto: textoDuda(d) }))),
    ] : null) : null;

  const formulario = el('form', { novalidate: true },
    dudasDelFormulario,
    etiqueta('tipo', t('formulario.tipo')), tipo,
    linea('objetivo', t('campo.objetivo'), objetivoDe(c), { maxlength: 300 }),
    etiquetaProducto, el('input', { id: id('producto'), name: 'producto', type: 'text', value: productoDe(c), autocomplete: 'off', maxlength: 120 }),
    comercial,
    linea('zonas', t('formulario.zonas'), zonasDe(c).join(', ')),
    casilla('pais', t('valor.pais_completo'), c.paisCompleto, 'si'),
    laboral,
    linea('exclusiones', t('formulario.exclusiones'), exclusionesDe(c).join(', ')),
    etiqueta('prioridades', t('formulario.prioridades')),
    el('textarea', { id: id('prioridades'), name: 'prioridades', rows: 3, texto: c.prioridades.join('\n') }),
    etiqueta('frecuencia', t('campo.frecuencia')), frecuencia,
    etiqueta('autonomia', t('campo.autonomia')), autonomia,
    el('p', { class: 'ayuda', texto: t('autonomia.contactar_siempre') }),
    el('fieldset', {}, el('legend', { texto: t('campo.capacidades') }),
      el('div', { class: 'botones' }, Object.entries(catalogo.combinaciones).map(([clave, lista]) =>
        el('button', { type: 'button', class: 'secundario', texto: t(`combinacion.${clave}`), onclick: () => marcar(lista) }))),
      casillasCapacidad.map(x => x.nodo)),
    el('p', { class: 'nota-ia', texto: `${t('campo.ia')}: ${textoIa(c)}` }),
    proximamente(),
    el('p', { class: 'ayuda', texto: t('formulario.guardar.ayuda') }),
    el('button', { type: 'submit', texto: t('formulario.guardar') }),
    mensaje);

  alEnviar(formulario, mensaje, async datos => {
    const capacidades = datos.getAll('capacidades');
    const minimo = datos.get('salarioMinimo');
    const maximo = datos.get('salarioMaximo');
    if (tipo.value === 'laboral' && minimo && maximo && Number(minimo) > Number(maximo)) throw new Error(t('error.salario_al_reves'));
    const producto = String(datos.get('producto'));
    const objetivo = String(datos.get('objetivo'));
    await alGuardar({
      tipo: datos.get('tipo'),
      // Si no los cambió, se guarda lo que había (no la traducción que se mostró).
      objetivo: objetivo === objetivoDe(c) ? c.objetivo : objetivo,
      producto: producto === productoDe(c) ? c.producto : producto,
      sectores: datos.get('sectores'),
      zonas: datos.get('zonas'),
      paisCompleto: datos.get('pais') === 'si',
      tamanos: datos.getAll('tamanos'),
      exclusiones: datos.get('exclusiones'),
      prioridades: datos.get('prioridades'),
      // El salario solo cuenta para buscar empleo: si es para vender, no se envía (aunque quedara escrito).
      salarioMinimo: tipo.value === 'laboral' ? minimo || null : null,
      salarioMaximo: tipo.value === 'laboral' ? maximo || null : null,
      moneda: datos.get('moneda'),
      experienciaNoRequerida: datos.get('experiencia') === 'si',
      frecuencia: datos.get('frecuencia'),
      autonomia: datos.get('autonomia'),
      // «Preparar correos» apagado no se envía en el formulario: con «Contactar» va siempre encendido.
      capacidades: Object.fromEntries(catalogo.capacidades.map(x => [x.clave, capacidades.includes(x.clave) || (x.clave === 'correos' && capacidades.includes('contactar'))])),
      resueltas: datos.getAll('resueltas').map(Number),
    });
  });
  return formulario;
}

function tarjetaVersion(v, { proyecto, activa, puedeEscribir, abrirFormulario }) {
  const c = v.configuracion;
  const mensaje = caja();
  const esCambio = Boolean(activa);
  // «escribe»: se muestran los botones (no en la papelera). «lector»: quien solo puede leer (los textos le hablan del dueño).
  const escribe = puedeEscribir && !proyecto.enPapelera;
  const lector = !puedeEscribir;
  const subtitulo = lector ? t('proyecto.pendiente.lector')
    : proyecto.enPapelera ? t('proyecto.pendiente.papelera')
      : esCambio ? t('proyecto.pendiente.cambio', { numero: activa.numero }) : t('proyecto.pendiente.texto');
  const partes = [
    el('h2', { texto: t('proyecto.pendiente.titulo', { numero: v.numero }) }),
    el('p', { class: 'suave', texto: subtitulo }),
    // Antes de la primera aprobación se dice qué pasa al aprobar: queda guardado, pero todavía no busca.
    !esCambio ? el('p', { class: 'aviso', texto: avisoAntesDeAprobar(c.tipo) }) : null,
    el('p', { class: 'entendi', texto: fraseEntendi(c) }),
  ];
  // Lo que falta y lo que el motor no entendió se pregunta; mientras tanto no se puede aprobar.
  const dudasVersion = Array.isArray(v.dudas) ? v.dudas : [];
  const preguntas = v.faltantes.filter(f => f !== 'dudas').map(f => t(f === 'producto' ? `faltante.producto.${c.tipo}` : `faltante.${f}`));
  const noEntendi = dudasVersion.map(textoDuda);
  if (v.faltantes.includes('dudas') && !noEntendi.length) noEntendi.push(t('faltante.dudas'));
  const idExplicacion = `explicacion-${v.numero}`;
  if (preguntas.length || noEntendi.length) {
    partes.push(el('div', { class: 'aviso dudas', id: idExplicacion },
      lector ? el('p', { texto: t('proyecto.preguntas.lector', { n: preguntas.length + noEntendi.length }) }) : [
        preguntas.length ? [el('p', { texto: t('proyecto.preguntas') }), el('ul', {}, preguntas.map(p => el('li', { texto: p })))] : null,
        noEntendi.length ? [el('p', { texto: t('proyecto.no_entendi') }), el('ul', {}, noEntendi.map(p => el('li', { texto: p })))] : null,
        el('p', { texto: t('proyecto.no_se_puede_aprobar') }),
        abrirFormulario && escribe ? el('button', { type: 'button', class: 'secundario', texto: t('proyecto.responder'), onclick: abrirFormulario }) : null,
      ]));
  }
  if (v.supuestos.length) {
    partes.push(el('div', { class: 'supuestos' },
      el('p', { class: 'suave', texto: lector ? t('proyecto.supuestos.lector') : t('proyecto.supuestos') }),
      el('ul', {}, v.supuestos.map(s => el('li', { class: 'suave', texto: t(`supuesto.${s}`) })))));
  }
  partes.push(resumen(c));
  if (escribe) {
    const motivo = el('textarea', { id: 'campo-motivo', rows: 2, maxlength: 300 });
    const claveMotivo = `motivo|${proyecto.id}|${v.numero}`;
    const motivoRecuperado = recordarTexto(motivo, claveMotivo);
    const bloqueado = v.faltantes.length > 0;
    const aprobar = botonAccion(t(esCambio ? 'proyecto.aprobar.cambio' : 'proyecto.aprobar.primera'), bloqueado ? 'bloqueado' : '', mensaje, async () => {
      await pedirYMostrar('POST', `/api/proyectos/${proyecto.id}/versiones/${v.numero}/aprobar`, {}, t(esCambio ? 'proyecto.listo.aprobada' : 'proyecto.listo.aprobada.primera', { numero: v.numero }));
    });
    // Mientras falte algo, el botón no se puede tocar; VoiceOver lee por qué (las preguntas de arriba).
    if (bloqueado) {
      aprobar.disabled = true;
      aprobar.setAttribute('aria-describedby', idExplicacion);
    }
    partes.push(
      el('div', { class: 'botones' }, aprobar),
      el('details', { class: 'rechazar', open: motivoRecuperado },
        el('summary', { texto: t('proyecto.rechazar') }),
        el('label', { for: 'campo-motivo', texto: t('proyecto.motivo') }),
        motivo,
        botonAccion(t('proyecto.rechazar.boton', { numero: v.numero }), 'peligro', mensaje, async () => {
          await pedirYMostrar('POST', `/api/proyectos/${proyecto.id}/versiones/${v.numero}/rechazar`, { motivo: motivo.value }, t('proyecto.listo.rechazada', { numero: v.numero }));
          borrador(claveMotivo, '');
        })),
      mensaje);
  }
  return el('section', { class: 'tarjeta pendiente' }, partes);
}

// Un aviso arriba del proyecto: texto (sale bien) o { texto, clase } (por ejemplo, «esto cambió en otro equipo»).
function avisoDeArriba(aviso) {
  if (!aviso) return null;
  const { texto, clase } = typeof aviso === 'string' ? { texto: aviso, clase: 'bien' } : aviso;
  return el('p', { class: clase === 'aviso' ? 'aviso' : 'mensaje bien', role: 'status', 'data-foco': true, texto });
}

function dibujarProyecto(d, aviso = null) {
  const { proyecto: p, activa, pendiente, versiones, historial, puedeEscribir = true } = d;
  // Lo que solo el dueño puede hacer (papelera, completar, reabrir): a quien no puede, no se le muestra el botón.
  const permisos = d.permisos || { escribir: puedeEscribir, papelera: puedeEscribir, completar: puedeEscribir };
  const mensaje = caja();
  const base = pendiente || activa || versiones.find(v => v.completa !== false) || versiones[0];
  const escribe = puedeEscribir && !p.enPapelera;

  const avisoEstado = p.enPapelera ? t('proyecto.en_papelera')
    : p.estado === 'con_errores' ? t('proyecto.error', { motivo: p.motivoError || t('valor.falta') })
      : p.estado === 'en_ejecucion' ? t(`proyecto.aviso_espera.${p.tipo}`)
        : p.estado === 'borrador' ? `${t('proyecto.aviso_borrador')} ${avisoAntesDeAprobar(p.tipo)}`
          : p.estado === 'pausado' ? t('proyecto.aviso_pausado') : null;

  const acciones = [];
  if (escribe) {
    const disponibles = { en_ejecucion: ['pausar', 'completar'], pausado: ['reanudar', 'completar'], completado: ['reabrir'], con_errores: ['reintentar', 'pausar'] }[p.estado] || [];
    for (const accion of disponibles.filter(a => permisos.completar || (a !== 'completar' && a !== 'reabrir'))) {
      acciones.push(botonAccion(t(`accion.${accion}`), 'secundario', mensaje, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/estado`, { accion }, x => t('proyecto.listo.estado', { estado: nombreDeEstado(x.proyecto) }))));
    }
  }

  const nombre = el('input', { id: 'campo-nombre-proyecto', type: 'text', value: p.nombre, maxlength: 80, autocomplete: 'off' });
  const cabecera = el('section', { class: 'tarjeta' },
    el('p', {}, el('a', { href: '#proyectos', texto: t('proyecto.volver') })),
    avisoDeArriba(aviso),
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
  let detallesCampos = null;
  if (escribe) {
    const mensajeModificar = caja();
    const area = el('textarea', { id: 'campo-reinterpretar', rows: 5, maxlength: 4000, texto: base.instrucciones });
    const claveArea = `reescribir|${p.id}`;
    const recuperado = recordarTexto(area, claveArea);
    // Si lo que está ahora se cambió a mano, «Volver a entender» lo reemplaza: se avisa antes, y se pregunta al tocar.
    const conCambiosAMano = base.origen === 'campos';
    detallesCampos = el('details', {},
      el('summary', { texto: t('proyecto.modificar.campos') }),
      formularioCampos(base.configuracion, base.dudas, async campos => {
        await pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'campos', campos }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero }));
      }));
    modificar = el('section', { class: 'tarjeta' },
      el('h2', { texto: t('proyecto.modificar') }),
      el('p', { class: 'suave', texto: t('formulario.guardar.ayuda') }),
      el('details', { open: recuperado },
        el('summary', { texto: t('proyecto.modificar.instrucciones') }),
        conCambiosAMano ? el('p', { class: 'aviso', texto: t('proyecto.reescribir.aviso') }) : null,
        el('label', { for: 'campo-reinterpretar', texto: t('proyectos.instrucciones') }),
        area,
        botonAccion(t('formulario.reinterpretar'), '', mensajeModificar, async () => {
          if (conCambiosAMano && !confirm(t('proyecto.reescribir.confirmar'))) return;
          await pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'instrucciones', instrucciones: area.value }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero }));
          borrador(claveArea, '');
        })),
      detallesCampos,
      mensajeModificar);
  }
  // «Responder estas preguntas» abre el formulario y lleva hasta él.
  const abrirFormulario = detallesCampos ? () => {
    detallesCampos.open = true;
    detallesCampos.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const primero = detallesCampos.querySelector('legend, label');
    const destino = detallesCampos.querySelector('summary');
    (destino || primero)?.focus({ preventScroll: true });
  } : null;

  // Las versiones viejas llegan sin su contenido (así el proyecto abre rápido); se abren una por una.
  const contenidoVersion = v => [
    el('p', { class: 'instrucciones', texto: v.instrucciones }),
    resumen(v.configuracion),
  ];
  const contenidoBajoPedido = v => {
    const lugar = el('div', {});
    const mensajeVersion = caja();
    lugar.append(botonAccion(t('version.ver'), 'secundario', mensajeVersion, async () => {
      const r = await api('GET', `/api/proyectos/${p.id}/versiones/${v.numero}`);
      if (!r.ok) throw new Error(textoError(r.datos.error));
      lugar.replaceChildren(...contenidoVersion(r.datos.version));
    }), mensajeVersion);
    return lugar;
  };
  // Una versión que no quedó en uso (cambiada antes de aprobar, rechazada o usada antes) se puede volver a usar:
  // se copia como versión nueva que espera aprobación. No se borra nada.
  const reusar = v => {
    if (!escribe || !['descartada', 'rechazada', 'reemplazada'].includes(v.estado)) return null;
    const mensajeReusar = caja();
    return el('div', {},
      el('p', { class: 'ayuda', texto: t('version.usar_otra_vez.ayuda') }),
      botonAccion(t('version.usar_otra_vez', { numero: v.numero }), 'secundario', mensajeReusar, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'version', numero: v.numero }, x => t('proyecto.listo.copiada', { numero: x.pendiente.numero, desde: v.numero }))),
      mensajeReusar);
  };
  const listaVersiones = el('section', { class: 'tarjeta' },
    el('h2', { texto: t('proyecto.versiones') }),
    versiones.map(v => el('details', { class: 'version' },
      el('summary', { texto: t('version.linea', { numero: v.numero, estado: t(`version.estado.${v.estado}`), fecha: fecha(v.creadaEn) }) }),
      el('p', { class: 'suave', texto: t(`version.origen.${v.origen}`) }),
      v.motivo ? el('p', { class: 'suave', texto: t('version.motivo', { motivo: v.motivo }) }) : null,
      v.completa === false ? contenidoBajoPedido(v) : contenidoVersion(v),
      reusar(v))));

  const listaHistorial = el('section', { class: 'tarjeta' },
    el('details', {},
      el('summary', { texto: t('proyecto.historial') }),
      el('ul', { class: 'historial' }, historial.map(h => el('li', {},
        el('span', { texto: t(`historial.${h.accion}`, h.detalle || {}) }),
        el('span', { class: 'suave', texto: ` · ${fecha(h.fecha)}` }))))));

  const mensajePapelera = caja();
  const papelera = puedeEscribir && permisos.papelera ? el('section', { class: 'tarjeta' },
    p.enPapelera
      ? [el('p', { class: 'suave', texto: t('proyecto.restaurar.texto') }),
        botonAccion(t('proyectos.restaurar'), '', mensajePapelera, () =>
          pedirYMostrar('POST', `/api/proyectos/${p.id}/papelera`, { enPapelera: false }, t('proyecto.listo.restaurado')))]
      : botonAccion(t('proyecto.papelera'), 'peligro', mensajePapelera, async () => {
        if (!confirm(t('proyecto.confirmar_papelera', { nombre: p.nombre }))) return;
        await pedirYMostrar('POST', `/api/proyectos/${p.id}/papelera`, { enPapelera: true }, t('proyecto.listo.papelera'));
      }),
    mensajePapelera) : null;

  mostrar(marco('proyectos',
    cabecera,
    pendiente ? tarjetaVersion(pendiente, { proyecto: p, activa, puedeEscribir, abrirFormulario }) : null,
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
  leerBorradores();
  colorDeLaBarra();
  const preferido = idiomaGuardado() || (navigator.language || '').slice(0, 2);
  try {
    await cargarIdioma(preferido === 'en' ? 'en' : 'es');
  } catch {
    return pantallaNoArranco();
  }
  mostrar(el('p', { class: 'cargando', texto: t('app.cargando') }));
  let setup = await api('GET', '/api/setup');
  // Justo después de un reinicio, el servidor dice «arrancando» por un momento: se espera (hasta 60 s) en vez
  // de mostrar un error.
  for (let intento = 0; !setup.ok && setup.datos?.error === 'arrancando' && intento < 60; intento += 1) {
    mostrar(el('p', { class: 'cargando', texto: t('app.arrancando') }));
    await new Promise(listo => setTimeout(listo, 1000));
    setup = await api('GET', '/api/setup');
  }
  estado.setup = setup.datos;
  if (!setup.ok) return pantallaNoArranco(textoError(setup.datos.error || 'error_interno'));
  const yo = await api('GET', '/api/yo');
  if (yo.ok) {
    estado.usuario = yo.datos.usuario;
    avisosCuenta = leerAvisos(yo.datos);
    if (estado.usuario.idioma !== idioma) await cargarIdioma(estado.usuario.idioma);
  }
  await dibujar();
}

window.addEventListener('hashchange', () => { if (estado.usuario) dibujar(); });
iniciar().catch(() => pantallaNoArranco());
