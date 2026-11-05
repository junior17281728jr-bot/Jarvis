// OPORTIA: pantallas (sin librerías). Todo texto se pone con textContent: nunca se interpreta como código.
import {
  SECTORES_CREADOR, SECTORES_A_LA_VISTA, ZONAS_CREADOR, ZONAS_A_LA_VISTA, ORDEN_TAMANOS, ORDEN_FRECUENCIAS, PRODUCTOS_SUGERIDOS,
  PRODUCTOS_CON_OTRAS_PALABRAS, PUESTOS_SUGERIDOS, SALARIOS_SUGERIDOS, MAXIMO_ELEGIDOS, MAXIMO_PRODUCTO, componer, normalizarEleccion,
  faltaEnEleccion, eleccionDesde,
} from './creador.js';
import { ICONOS_SECTOR, ICONOS_PROYECTO, MAPA_COLUMNAS, MAPA_FILAS, MAPA_PROVINCIAS, PROVINCIAS_DE_REGION, EDIFICIOS_POR_TAMANO } from './dibujos.js';

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
// Con n = 1, la frase en singular si existe (clave + «.uno»): «1 paso», no «1 pasos».
function tn(clave, variables = {}) {
  const uno = `${clave}.uno`;
  const hay = catalogos[idioma]?.[uno] != null || catalogos.es?.[uno] != null;
  return Number(variables.n) === 1 && hay ? t(uno, variables) : t(clave, variables);
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

// El pedido tal cual, sin mirar la respuesta (eso lo hace api). Nunca falla: sin red responde «sin_conexion».
async function pedirAlServidor(metodo, ruta, datos) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: { 'X-Oportia': '1' } };
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  }
  try {
    const r = await fetch(ruta, opciones);
    const cuerpo = await r.json().catch(() => ({}));
    return { ok: r.ok, codigo: r.status, datos: cuerpo };
  } catch {
    return { ok: false, codigo: 0, datos: { error: 'sin_conexion' } };
  }
}

// Pedidos GET que iniciar() hace por adelantado (ruta -> respuesta en camino): solo los usa la primera pantalla.
const adelantados = new Map();

async function api(metodo, ruta, datos) {
  const adelantado = metodo === 'GET' && datos === undefined ? adelantados.get(ruta) : undefined;
  if (adelantado) adelantados.delete(ruta);
  const respuesta = await (adelantado ?? pedirAlServidor(metodo, ruta, datos));
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
    marcaConLogo(), el('h1', { texto: t('setup.titulo') }), el('p', { class: 'suave', texto: t('setup.texto') }), formulario,
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
    recordarAdmin(estado.usuario);
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
    marcaConLogo(), el('p', { class: 'suave', texto: t('app.lema') }),
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

// La marca de OPORTIA: un círculo (el radar que encuentra oportunidades) con un punto en el centro.
function logo() {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [clave, valor] of Object.entries({ viewBox: '0 0 32 32', class: 'logo', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(clave, valor);
  const partes = [
    ['rect', { width: 32, height: 32, rx: 9, class: 'logo-fondo' }],
    ['circle', { cx: 16, cy: 16, r: 8.5, fill: 'none', class: 'logo-anillo', 'stroke-width': 3.2 }],
    ['path', { d: 'M16 7.5a8.5 8.5 0 0 1 8.5 8.5', fill: 'none', class: 'logo-arco', 'stroke-width': 3.2, 'stroke-linecap': 'round' }],
    ['circle', { cx: 16, cy: 16, r: 2.8, class: 'logo-punto' }],
  ];
  for (const [etiqueta, propias] of partes) {
    const parte = document.createElementNS(SVG, etiqueta);
    for (const [clave, valor] of Object.entries(propias)) parte.setAttribute(clave, String(valor));
    svg.append(parte);
  }
  return svg;
}
function marcaConLogo() {
  return el('div', { class: 'marca con-logo' }, logo(), el('span', { texto: t('app.nombre') }));
}

// Arriba: la marca y «Salir». Abajo (como las apps del iPhone): el menú con íconos, siempre a mano.
function marco(seccion, ...contenido) {
  const enlaces = [['inicio', 'menu.inicio', 'casa'], ['proyectos', 'menu.proyectos', 'carpeta'], ['configuracion', 'menu.configuracion', 'ajustes']];
  if (estado.usuario.rol === 'admin') enlaces.push(['admin', 'menu.admin', 'escudo']);
  return [
    el('header', { class: 'encabezado' },
      el('a', { href: '#inicio', class: 'marca-enlace', 'aria-label': t('menu.inicio') }, marcaConLogo()),
      el('button', { type: 'button', class: 'secundario chico con-icono', onclick: salir }, icono('salir'), el('span', { texto: t('menu.salir') }))),
    el('nav', { class: 'menu', 'aria-label': t('menu.titulo') },
      enlaces.map(([id, clave, nombreIcono]) => el('a', { href: `#${id}`, 'aria-current': id === seccion ? 'page' : null },
        icono(nombreIcono, 'icono menu-icono'), el('span', { texto: t(clave) })))),
    avisosDeCuenta(),
    ...contenido,
    pie(),
  ];
}

// Solo para el administrador, arriba de Inicio: cómo está el sistema de un vistazo y, si el trabajo automático
// está en pausa (modo seguro) o hay un aviso grave sin ver, una tarjeta roja que lleva a Administrador.
function estadoEnInicio(s) {
  if (!s) return null;
  const graves = (s.avisos?.abiertos ?? []).filter(a => a.nivel === 'grave' && !a.vistoEn).length;
  const alerta = s.modoSeguro?.activo ? t('inicio.alerta.modo_seguro') : graves ? t('inicio.alerta.grave', { n: graves }) : null;
  const tonoServidor = TONO_SEMAFORO[s.salud?.semaforo] ?? 'atencion';
  return el('section', { class: `tarjeta estado-inicio${alerta ? ' alerta tono-mal' : ''}` },
    alerta ? el('p', { class: 'alerta-texto con-icono' }, icono('mal', 'icono estado'), el('span', { texto: alerta })) : el('h2', { texto: t('inicio.estado') }),
    el('div', { class: 'etiquetas' },
      insignia(tonoTrabajo(s), t('inicio.estado.trabajo', { estado: nombreFase(s) })),
      insignia(tonoServidor, t('inicio.estado.servidor', { estado: t(`sistema.semaforo.${s.salud?.semaforo ?? 'amarillo'}`) }))),
    // Esta tarjeta no se actualiza sola: dice de cuándo son los datos.
    el('p', { class: 'ayuda', texto: t('inicio.estado.actualizado', { hora: cuando(new Date().toISOString()) }) }),
    el('a', { class: 'boton-enlace', href: '#admin', texto: t('inicio.alerta.ver') }));
}

async function pantallaInicio() {
  const vigente = nuevoTurno();
  const esAdmin = estado.usuario.rol === 'admin';
  // Las tarjetas de los proyectos que esperan aprobación usan el catálogo (los nombres de negocios y lugares):
  // se pide a la vez que lo demás. Sin él, abrir OPORTIA directo en Inicio fallaba («No se pudo cargar OPORTIA»).
  const [r, sistema, faltaCatalogo] = await Promise.all([api('GET', '/api/proyectos'), esAdmin ? api('GET', '/api/admin/sistema') : null,
    cargarCatalogo().then(() => null, error => error)]);
  if (!vigente()) return;
  const lista = (claves, nombreIcono, tono) => el('ul', { class: 'lista-iconos' }, claves.map(clave => el('li', { class: `tono-${tono}` }, icono(nombreIcono, 'icono chico tono-color'), el('span', { texto: t(clave) }))));
  const pendientes = r.ok ? r.datos.proyectos.filter(p => !p.enPapelera && p.versionPendiente) : [];
  // Quien solo puede ver (lector) no aprueba: se le dice que espera al dueño.
  const escribe = r.ok ? r.datos.puedeEscribir !== false : true;
  const puedeCrear = r.ok && escribe && r.datos.usados < r.datos.limite;
  const aprobar = el('section', { class: `tarjeta${pendientes.length ? ' tarjeta-atencion' : ''}` },
    el('h2', { class: 'con-icono' }, icono(pendientes.length ? 'reloj' : 'bien'), el('span', { texto: escribe ? t('inicio.aprobar.titulo') : t('inicio.aprobar.titulo_lector') })),
    !r.ok ? el('p', { class: 'mensaje error', texto: textoError(r.datos.error) })
      : pendientes.length && faltaCatalogo ? el('p', { class: 'mensaje error', texto: faltaCatalogo.message })
      : pendientes.length ? [
        el('div', { class: 'lista-proyectos' }, pendientes.map(p => filaProyecto(p, escribe))),
        // Antes de aprobar, sin rodeos: aprobar guarda el proyecto, pero todavía no busca.
        el('p', { class: 'suave', texto: t('inicio.aprobar.fase') }),
      ]
        : el('p', { class: 'suave', texto: t('inicio.aprobar.vacio') }));
  mostrar(marco('inicio',
    sistema?.ok ? estadoEnInicio(sistema.datos) : null,
    el('section', { class: 'tarjeta portada' },
      el('h1', { texto: t('inicio.hola', { nombre: estado.usuario.nombreVisible || estado.usuario.nombre }) }),
      el('p', { texto: t('inicio.texto') }),
      el('div', { class: 'portada-botones' },
        puedeCrear ? el('a', { class: 'boton-enlace claro con-icono', href: '#nuevo' }, icono('mas'), el('span', { texto: t('proyectos.nuevo') })) : null,
        r.ok ? el('a', { class: 'boton-enlace borde con-icono', href: '#proyectos' }, icono('carpeta'), el('span', { texto: t('inicio.ir_proyectos', { usados: r.datos.usados, limite: r.datos.limite }) })) : null)),
    aprobar,
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.funciona') }),
      lista(['inicio.funciona.1', 'inicio.funciona.4', 'inicio.funciona.5', 'inicio.funciona.2', 'inicio.funciona.3'], 'bien', 'bien')),
    el('section', { class: 'tarjeta' }, el('h2', { texto: t('inicio.viene') }),
      lista(['inicio.viene.ia', 'inicio.viene.copias', 'inicio.viene.clientes', 'inicio.viene.empleos'], 'reloj', 'apagado'))));
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

// ---------- Zona de sistema (Administrador, fase 1, parte c) ----------
// Lo importante se ve de un vistazo: tarjetas de colores con su ícono (verde = bien, amarillo = mirar,
// rojo = grave) y números grandes. Todo se maneja con botones: no hay que escribir nada.
// Se actualiza sola cada 30 s mientras Administrador está abierto. Solo se cambia esta zona: lo que se está
// escribiendo en «Crear un usuario» nunca se pierde.
const SVG = 'http://www.w3.org/2000/svg';
const ICONOS = {
  latido: [['polyline', { points: '3 12 7 12 10 5 14 19 17 12 21 12' }]],
  servidor: [['rect', { x: 3, y: 4, width: 18, height: 7, rx: 2 }], ['rect', { x: 3, y: 13, width: 18, height: 7, rx: 2 }], ['line', { x1: 7, y1: 7.5, x2: 7.01, y2: 7.5 }], ['line', { x1: 7, y1: 16.5, x2: 7.01, y2: 16.5 }]],
  campana: [['path', { d: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z' }], ['path', { d: 'M10 21h4' }]],
  escudo: [['path', { d: 'M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z' }]],
  bien: [['circle', { cx: 12, cy: 12, r: 9 }], ['polyline', { points: '8 12.5 11 15.5 16 9.5' }]],
  atencion: [['path', { d: 'M12 3.5 2.5 20h19z' }], ['line', { x1: 12, y1: 10, x2: 12, y2: 14 }], ['line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }]],
  mal: [['circle', { cx: 12, cy: 12, r: 9 }], ['line', { x1: 12, y1: 7, x2: 12, y2: 13 }], ['line', { x1: 12, y1: 16.5, x2: 12.01, y2: 16.5 }]],
  apagado: [['circle', { cx: 12, cy: 12, r: 9 }], ['line', { x1: 10, y1: 9, x2: 10, y2: 15 }], ['line', { x1: 14, y1: 9, x2: 14, y2: 15 }]],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], ['line', { x1: 12, y1: 11, x2: 12, y2: 16.5 }], ['line', { x1: 12, y1: 7.5, x2: 12.01, y2: 7.5 }]],
  personas: [['circle', { cx: 9, cy: 8, r: 3.5 }], ['path', { d: 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6' }], ['path', { d: 'M16 4.6a3.5 3.5 0 0 1 0 6.8' }], ['path', { d: 'M18 14.3c2.1.7 3.5 2.8 3.5 5.7' }]],
  mas: [['circle', { cx: 12, cy: 12, r: 9 }], ['line', { x1: 12, y1: 8, x2: 12, y2: 16 }], ['line', { x1: 8, y1: 12, x2: 16, y2: 12 }]],
  sin_conexion: [['path', { d: 'M2 8.5a15 15 0 0 1 20 0' }], ['path', { d: 'M5.5 12a10 10 0 0 1 13 0' }], ['path', { d: 'M9 15.5a5 5 0 0 1 6 0' }], ['line', { x1: 12, y1: 19, x2: 12.01, y2: 19 }], ['line', { x1: 3, y1: 3, x2: 21, y2: 21 }]],
  reloj: [['circle', { cx: 12, cy: 12, r: 9 }], ['polyline', { points: '12 7 12 12 15.5 14' }]],
  fila: [['line', { x1: 9, y1: 6, x2: 20, y2: 6 }], ['line', { x1: 9, y1: 12, x2: 20, y2: 12 }], ['line', { x1: 9, y1: 18, x2: 20, y2: 18 }], ['line', { x1: 4, y1: 6, x2: 4.01, y2: 6 }], ['line', { x1: 4, y1: 12, x2: 4.01, y2: 12 }], ['line', { x1: 4, y1: 18, x2: 4.01, y2: 18 }]],
  base: [['ellipse', { cx: 12, cy: 5, rx: 8, ry: 3 }], ['path', { d: 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5' }], ['path', { d: 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' }]],
  actualizar: [['path', { d: 'M20 12a8 8 0 1 1-2.4-5.7' }], ['polyline', { points: '20 4 20 9 15 9' }]],
  // Fase 1, pase visual: menú de abajo, estados de los proyectos y el creador con toques.
  casa: [['path', { d: 'M3 11 12 4l9 7' }], ['path', { d: 'M5 10v10h5v-6h4v6h5V10' }]],
  carpeta: [['path', { d: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z' }]],
  ajustes: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' }]],
  salir: [['path', { d: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4' }], ['polyline', { points: '10 8 6 12 10 16' }], ['line', { x1: 6, y1: 12, x2: 16, y2: 12 }]],
  lapiz: [['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }], ['line', { x1: 13.5, y1: 6.5, x2: 17.5, y2: 10.5 }]],
  pausa: [['circle', { cx: 12, cy: 12, r: 9 }], ['line', { x1: 10, y1: 9, x2: 10, y2: 15 }], ['line', { x1: 14, y1: 9, x2: 14, y2: 15 }]],
  bandera: [['path', { d: 'M5 21V4' }], ['path', { d: 'M5 4h11l-2 4 2 4H5' }]],
  papelera: [['polyline', { points: '4 7 20 7' }], ['path', { d: 'M9 7V4h6v3' }], ['path', { d: 'M6 7l1 13h10l1-13' }]],
  tienda: [['path', { d: 'M4 9l1.5-5h13L20 9' }], ['path', { d: 'M4 9h16v2a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 11z' }], ['path', { d: 'M5.5 13.5V20h13v-6.5' }]],
  maletin: [['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }], ['path', { d: 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }], ['line', { x1: 3, y1: 13, x2: 21, y2: 13 }]],
  carrito: [['circle', { cx: 9, cy: 20, r: 1.3 }], ['circle', { cx: 17, cy: 20, r: 1.3 }], ['path', { d: 'M3 4h2l2.4 11h10.8L21 8H6.3' }]],
  marca: [['polyline', { points: '5 12.5 10 17.5 19 7.5' }]],
  edificio: [['rect', { x: 4, y: 3, width: 11, height: 18, rx: 1 }], ['path', { d: 'M15 9h5v12h-5' }], ['path', { d: 'M8 7h3M8 11h3M8 15h3' }]],
  lugar: [['path', { d: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z' }], ['circle', { cx: 12, cy: 9.5, r: 2.5 }]],
  regla: [['rect', { x: 3, y: 8, width: 18, height: 8, rx: 1.5 }], ['path', { d: 'M7 8v3M11 8v4M15 8v3M19 8v4' }]],
  calendario: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }], ['line', { x1: 3, y1: 10, x2: 21, y2: 10 }], ['line', { x1: 8, y1: 3, x2: 8, y2: 7 }], ['line', { x1: 16, y1: 3, x2: 16, y2: 7 }]],
  etiqueta: [['path', { d: 'M3 12V4h8l10 10-8 8z' }], ['circle', { cx: 7.5, cy: 8.5, r: 1.5 }]],
  dinero: [['rect', { x: 2.5, y: 6, width: 19, height: 12, rx: 2 }], ['circle', { cx: 12, cy: 12, r: 2.5 }]],
  dedo: [['path', { d: 'M9 11V5a1.5 1.5 0 0 1 3 0v6' }], ['path', { d: 'M12 10.5a1.5 1.5 0 0 1 3 0V12a1.5 1.5 0 0 1 3 0v3a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.8-2.4L4 15a1.5 1.5 0 0 1 2.3-1.9L9 15' }]],
  flecha: [['line', { x1: 5, y1: 12, x2: 19, y2: 12 }], ['polyline', { points: '13 6 19 12 13 18' }]],
  chispa: [['path', { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' }], ['path', { d: 'M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z' }]],
  ojo: [['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }], ['circle', { cx: 12, cy: 12, r: 2.8 }]],
};
// Un elemento SVG con sus atributos (siempre con createElementNS: nunca se arma con texto).
function svgEl(etiqueta, atributos = {}) {
  const nodo = document.createElementNS(SVG, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) if (valor != null) nodo.setAttribute(clave, String(valor));
  return nodo;
}
// Los íconos: los de siempre, los de los proyectos (public/dibujos.js) y uno por negocio («s-hoteles»…).
const formaDeIcono = nombre => ICONOS[nombre] ?? ICONOS_PROYECTO[nombre] ?? (nombre.startsWith('s-') ? ICONOS_SECTOR[nombre.slice(2)] : null) ?? ICONOS.bien;
function icono(nombre, clase = 'icono') {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: clase, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const [etiqueta, propias] of formaDeIcono(nombre)) svg.append(svgEl(etiqueta, propias));
  return svg;
}
// El ícono de un negocio del motor («todas» y los que no tienen dibujo: el edificio).
const iconoSector = clave => (ICONOS_SECTOR[clave] ? `s-${clave}` : 'edificio');

// Una frase si existe en el idioma; si no (por ejemplo, un tipo de una versión más nueva), el respaldo tal cual.
function tSi(clave, respaldo, variables = {}) {
  return catalogos[idioma]?.[clave] != null || catalogos.es?.[clave] != null ? t(clave, variables) : String(respaldo ?? '');
}
const nombreTipo = tipo => tSi(`tareas.tipo.${tipo}`, tipo);
const nombreComo = como => tSi(`tareas.como.${como}`, como);
function textoMotivo(motivo) {
  if (!motivo) return '';
  const propio = tSi(`tareas.motivo.${motivo}`, null);
  if (propio) return propio;
  const como = String(motivo).match(/^trabajador_([a-z_]+)$/);
  if (como) return t('tareas.motivo.trabajador', { como: enMinuscula(nombreComo(como[1])) });
  return String(motivo);
}

const numero = (n, decimales = 0) => new Intl.NumberFormat(idioma === 'en' ? 'en-US' : 'es-DO', { maximumFractionDigits: decimales }).format(n);
// «142 MB» o «7.8 GB». Lo que no se pudo medir se muestra como «—» (nunca se inventa un número).
function tamano(mb) {
  if (mb == null || !Number.isFinite(Number(mb))) return '—';
  const n = Number(mb);
  if (n >= 1024) return `${numero(n / 1024, 1)} GB`;
  return `${numero(n, n >= 10 ? 0 : 1)} MB`;
}
function hace(iso, ahora = Date.now()) {
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return '';
  if (s < 60) return t('tiempo.hace_s', { n: s });
  if (s < 3600) return t('tiempo.hace_min', { n: Math.round(s / 60) });
  if (s < 86400) return t('tiempo.hace_h', { n: Math.round(s / 3600) });
  return tn('tiempo.hace_d', { n: Math.round(s / 86400) });
}
// «hoy 10:07 p. m.», «mañana 4:10 a. m.» (hora de República Dominicana, UTC−4 todo el año).
function cuando(iso, ahora = Date.now()) {
  if (!iso) return '';
  const dia = ms => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
  const ms = Date.parse(iso);
  const hora = new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-DO', { timeStyle: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date(ms));
  const diferencia = Math.round((Date.parse(dia(ms)) - Date.parse(dia(ahora))) / 86400000);
  if (diferencia === 0) return t('tiempo.hoy', { hora });
  if (diferencia === 1) return t('tiempo.manana', { hora });
  if (diferencia === -1) return t('tiempo.ayer', { hora });
  return fecha(iso);
}

// El color de cada cosa: 'bien' (verde), 'atencion' (amarillo), 'mal' (rojo), 'info' (azul: solo para que lo
// sepas, por ejemplo «alguien puso el modo seguro») o 'apagado' (gris: sin datos al día).
const TONO_FASE = { esperando: 'bien', trabajando: 'bien', arrancando: 'atencion', reiniciando: 'atencion', parando: 'atencion', sin_respuesta: 'mal', sin_supervisor: 'apagado' };
function tonoTrabajo(s) {
  if (s.modoSeguro?.activo) return s.modoSeguro.origen === 'automatico' ? 'mal' : 'atencion';
  return TONO_FASE[s.trabajador?.fase] ?? 'atencion';
}
const TONO_SEMAFORO = { verde: 'bien', amarillo: 'atencion', rojo: 'mal' };
// Un aviso nunca sale verde: verde es solo «todo bien». Un aviso de información sale azul.
const tonoAviso = nivel => (nivel === 'grave' ? 'mal' : nivel === 'atencion' ? 'atencion' : 'info');
function nombreFase(s) {
  const tr = s.trabajador ?? {};
  if (s.modoSeguro?.activo && !['parando'].includes(tr.fase)) return t('tareas.fase.modo_seguro');
  const segundos = tr.proximoIntento ? Math.max(1, Math.round((Date.parse(tr.proximoIntento) - Date.now()) / 1000)) : 1;
  return tSi(`tareas.fase.${tr.fase}`, tr.fase, { s: segundos });
}

// Las variables que usa el texto de cada aviso (las que falten salen como «?»).
function textoAviso(a) {
  const d = a.detalle ?? {};
  const v = x => (x == null ? '?' : x);
  if (String(a.clave).startsWith('freno:')) {
    return t('aviso.freno', { tipo: nombreTipo(String(a.clave).slice(6)), hora: d.hasta ? cuando(d.hasta) : '?' });
  }
  const mb = d.disponibleMb ?? d.libreMb ?? d.archivoMb ?? d.walMb;
  const n = v(d.reinicios24h ?? d.fallidas24h ?? d.revisar);
  const singular = n === 1 && (catalogos[idioma]?.[`aviso.${a.clave}.uno`] != null || catalogos.es?.[`aviso.${a.clave}.uno`] != null);
  return tSi(singular ? `aviso.${a.clave}.uno` : `aviso.${a.clave}`, a.clave, {
    mb: mb == null ? '?' : tamano(mb), ms: v(d.p99Ms), fecha: d.desde ? fecha(d.desde) : '?', n,
  });
}

function insignia(tono, texto) {
  return el('span', { class: `insignia tono-${tono}` }, icono(tono, 'icono chico'), el('span', { texto }));
}

// Una tarjeta del resumen de arriba. Al tocarla, baja a su parte.
function tarjetaResumen({ nombreIcono, titulo, valor, detalle, tono, destino, iconoTono = tono }) {
  return el('button', {
    type: 'button',
    class: `resumen-tarjeta tono-${tono}`,
    onclick: () => destino?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  },
  el('span', { class: 'resumen-cabeza' }, icono(nombreIcono), el('span', { class: 'resumen-titulo', texto: titulo }), el('span', { class: 'tono-color' }, icono(iconoTono))),
  el('span', { class: 'resumen-valor', texto: valor }),
  detalle ? el('span', { class: 'resumen-detalle', texto: detalle }) : null);
}

function numeroGrande(valor, etiqueta, tono = 'neutro') {
  return el('div', { class: `numero tono-${valor > 0 ? tono : 'neutro'}` },
    el('span', { class: 'numero-valor', texto: numero(valor ?? 0) }),
    el('span', { class: 'numero-etiqueta', texto: etiqueta }));
}

// Una barra que se llena (memoria y disco libres). El ancho se pone por código (sin estilos en el HTML).
function barra(libre, total, tono) {
  const lleno = el('span', { class: `barra-llena tono-${tono}` });
  const porcentaje = libre != null && total ? Math.max(2, Math.min(100, Math.round((libre / total) * 100))) : 0;
  lleno.style.width = `${porcentaje}%`;
  return el('span', { class: 'barra', 'aria-hidden': 'true' }, lleno);
}

function titulo(nombreIcono, texto, id) {
  return el('h2', { class: 'con-icono', id }, icono(nombreIcono), el('span', { texto }));
}

// Lo que dice el modo seguro, en palabras sencillas.
function explicacionModoSeguro(m) {
  if (!m.activo) {
    if (m.ultimo?.por === 'codigo_nuevo') return t('modo_seguro.quitado.codigo_nuevo', { fecha: fecha(m.ultimo.hasta) });
    if (m.ultimo?.por) return tSi(`modo_seguro.quitado.${m.ultimo.por}`, '', { fecha: fecha(m.ultimo.hasta) });
    return null;
  }
  return tSi(`modo_seguro.motivo.${m.motivo}`, m.motivo, { fecha: fecha(m.desde) });
}

// La zona entera. «acciones» trae lo que hacen los botones (ver crearZonaSistema).
// datosDe: cuándo llegaron estos datos. sinConexion: la última actualización falló (el servidor no contesta):
// lo de arriba se pone gris y lo dice, para que nadie crea que todo está bien con datos viejos.
function dibujarZonaSistema(s, { acciones, bloqueFila, mensajeZona, estadoVista, datosDe = Date.now(), sinConexion = false }) {
  const tr = s.trabajador ?? {};
  const fila = s.fila ?? {};
  const salud = s.salud ?? {};
  const abiertos = s.avisos?.abiertos ?? [];
  const tono = sinConexion ? 'apagado' : tonoTrabajo(s);
  const tonoServidor = sinConexion ? 'apagado' : TONO_SEMAFORO[salud.semaforo] ?? 'atencion';
  const horaDatos = cuando(new Date(datosDe).toISOString());
  const valorTrabajo = sinConexion ? t('sistema.sin_conexion.valor') : nombreFase(s);
  const peorAviso = abiertos.some(a => a.nivel === 'grave') ? 'mal' : abiertos.some(a => a.nivel === 'atencion') ? 'atencion' : abiertos.length ? 'info' : 'bien';
  const usaOportia = salud.oportiaMb ?? (salud.webMb != null ? salud.webMb + (salud.trabajadorMb ?? 0) : null);
  const conError = (fila.fallidas7d ?? 0) + (fila.revisar ?? 0);

  // Las partes de abajo (se crean antes para que el resumen pueda bajar hasta ellas).
  const anclaAvisos = el('span');
  const anclaTrabajo = el('span');
  const anclaServidor = el('span');
  const anclaErrores = el('span');

  // ---- Resumen de arriba ----
  const resumen = el('section', { class: 'tarjeta resumen-sistema', 'aria-label': t('sistema.resumen') },
    el('div', { class: 'resumen-encabezado' },
      el('h2', { texto: t('sistema.titulo') }),
      el('button', { type: 'button', class: 'secundario chico con-icono', onclick: acciones.actualizar }, icono('actualizar'), el('span', { texto: t('sistema.actualizar') }))),
    el('div', { class: 'resumen-rejilla' },
      tarjetaResumen({
        nombreIcono: 'latido', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.trabajo'), valor: valorTrabajo, tono, destino: anclaTrabajo,
        detalle: sinConexion ? t('sistema.sin_conexion.detalle', { hora: horaDatos })
          : s.modoSeguro?.activo ? t('sistema.resumen.en_pausa') : tr.ultimoLatido ? t('tareas.latido', { hace: hace(tr.ultimoLatido) }) : null,
      }),
      tarjetaResumen({
        nombreIcono: 'servidor', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.servidor'), valor: sinConexion ? t('sistema.sin_conexion.valor') : t(`sistema.semaforo.${salud.semaforo ?? 'amarillo'}`), tono: tonoServidor, destino: anclaServidor,
        detalle: sinConexion ? t('sistema.sin_conexion.detalle', { hora: horaDatos }) : t('sistema.resumen.memoria', { mb: tamano(salud.memoria?.disponibleMb) }),
      }),
      // Sin conexión, todo el resumen va en gris: son datos viejos, ni buenos ni malos.
      tarjetaResumen({
        nombreIcono: 'campana', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.avisos'), valor: abiertos.length ? numero(abiertos.length) : t('sistema.avisos.ninguno'), tono: sinConexion ? 'apagado' : peorAviso, destino: anclaAvisos,
        detalle: abiertos.length ? t('sistema.resumen.avisos_texto') : t('sistema.resumen.avisos_vacio'),
      }),
      tarjetaResumen({
        nombreIcono: 'fila', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.errores'), valor: numero(conError), tono: sinConexion ? 'apagado' : conError ? (fila.fallidas7d ? 'mal' : 'atencion') : 'bien', destino: anclaErrores,
        detalle: t('sistema.resumen.hechas', { n: numero(fila.hechas24h ?? 0) }),
      })),
    sinConexion ? el('p', { class: 'mensaje error con-icono', role: 'alert' }, icono('sin_conexion'), el('span', { texto: t('sistema.sin_conexion', { hora: horaDatos }) })) : null,
    el('p', { class: 'ayuda', texto: t('sistema.actualizado', { hora: horaDatos }) }),
    mensajeZona);

  // ---- Avisos (solo si hay abiertos) ----
  const avisos = abiertos.length ? el('section', { class: 'tarjeta' }, anclaAvisos,
    titulo('campana', t('sistema.avisos')),
    abiertos.map(a => el('div', { class: `aviso-sistema tono-${tonoAviso(a.nivel)}` },
      el('div', { class: 'aviso-cabeza' }, insignia(tonoAviso(a.nivel), t(`aviso.nivel.${a.nivel}`)), a.veces > 1 ? el('span', { class: 'suave', texto: t('aviso.veces', { n: a.veces }) }) : null),
      el('p', { class: 'aviso-texto', texto: textoAviso(a) }),
      el('p', { class: 'suave', texto: a.veces > 1 ? t('aviso.desde_ultima', { desde: fecha(a.creadoEn), ultima: hace(a.ultimaVez) }) : t('aviso.desde', { desde: fecha(a.creadoEn) }) }),
      a.vistoEn ? el('p', { class: 'suave', texto: t('aviso.visto', { fecha: fecha(a.vistoEn) }) })
        : el('button', { type: 'button', class: 'secundario', texto: t('aviso.entendido'), onclick: evento => acciones.visto(a, evento.currentTarget) }))),
    el('p', { class: 'ayuda', texto: t('sistema.avisos.telegram') })) : el('span', {}, anclaAvisos);

  // ---- Trabajo automático ----
  const linea = [
    tr.ultimoLatido ? t('tareas.latido', { hace: hace(tr.ultimoLatido) }) : null,
    tr.memoriaMb != null ? t('tareas.usa', { mb: tamano(tr.memoriaMb) }) : null,
    t('tareas.version', { version: s.version, codigo: s.codigo }),
  ].filter(Boolean).join(' · ');
  const enCurso = Array.isArray(tr.enCurso) ? tr.enCurso : [];
  const m = s.modoSeguro ?? {};
  const explicacion = explicacionModoSeguro(m);
  const bloqueModoSeguro = el('div', { class: `modo-seguro tono-${m.activo ? (m.origen === 'automatico' ? 'mal' : 'atencion') : 'bien'}` },
    el('div', { class: 'con-icono fuerte' }, icono('escudo'), el('span', { texto: t(m.activo ? 'modo_seguro.activo' : 'modo_seguro.apagado') })),
    el('p', { texto: t(m.activo ? 'modo_seguro.activo.texto' : 'modo_seguro.apagado.texto') }),
    explicacion ? el('p', { class: m.activo ? '' : 'suave', texto: explicacion }) : null,
    el('button', {
      type: 'button',
      class: m.activo ? 'grande' : 'peligro grande',
      texto: t(m.activo ? 'modo_seguro.quitar' : 'modo_seguro.activar'),
      onclick: evento => acciones.modoSeguro(!m.activo, m, evento.currentTarget),
    }));

  // Si una misma tarea sale varias veces en «Errores recientes», sus botones van solo en la más nueva.
  const conBotones = new Set();
  const errores = (s.errores ?? []).map(e => {
    const botones = !conBotones.has(e.tareaId) && (e.puedeReintentar || e.puedeCancelar);
    conBotones.add(e.tareaId);
    return el('div', { class: 'fila' },
      el('div', { class: 'etiquetas' }, insignia(e.estado === 'fallida' ? 'mal' : 'atencion', tSi(`tareas.estado.${e.estado}`, e.estado)), el('span', { class: 'nombre', texto: nombreTipo(e.tipo) })),
      el('p', { texto: [tSi(`tareas.evento.${e.evento}`, e.evento), textoMotivo(e.motivo)].filter(Boolean).join(': ') }),
      el('p', { class: 'suave', texto: [fecha(e.fecha), e.intento ? t('tareas.intento', { x: e.intento, y: e.maxFallos }) : null, e.proyecto ? t('tareas.de_proyecto', { proyecto: e.proyecto, cuenta: e.cuenta }) : null].filter(Boolean).join(' · ') }),
      botones ? el('div', { class: 'botones' },
        e.puedeReintentar ? el('button', { type: 'button', texto: t('tareas.reintentar'), onclick: evento => acciones.tarea(e.tareaId, 'reintentar', evento.currentTarget) }) : null,
        e.puedeCancelar ? el('button', { type: 'button', class: 'secundario', texto: t('tareas.cancelar'), onclick: evento => acciones.tarea(e.tareaId, 'cancelar', evento.currentTarget) }) : null) : null);
  });

  const trabajo = el('section', { class: 'tarjeta' }, anclaTrabajo,
    titulo('latido', t('sistema.trabajo')),
    el('div', { class: `estado-grande tono-${tono}` }, icono(sinConexion ? 'sin_conexion' : tono, 'icono estado'), el('span', { texto: valorTrabajo })),
    el('p', { class: 'suave', texto: linea }),
    el('p', { class: 'fuerte', texto: enCurso.length ? t('tareas.ahora', { que: enCurso.map(x => `${nombreTipo(x.tipo)} (${hace(x.desde)})`).join(', ') }) : t('tareas.ahora.nada') }),
    tr.freno ? el('p', { class: 'aviso', texto: tSi(`tareas.freno.${tr.freno}`, tr.freno) }) : null,
    (s.frenos ?? []).map(f => el('p', { class: 'aviso', texto: t('tareas.frenado', { tipo: nombreTipo(f.tipo), hora: cuando(f.hasta) }) })),
    el('div', { class: 'numeros' },
      numeroGrande(fila.listas, t('tareas.cuenta.listas')),
      numeroGrande(fila.esperando, t('tareas.cuenta.esperando')),
      numeroGrande(fila.enCurso, t('tareas.cuenta.en_curso'), 'bien'),
      numeroGrande(fila.revisar, t('tareas.cuenta.revisar'), 'atencion'),
      numeroGrande(fila.fallidas7d, t('tareas.cuenta.fallidas7d'), 'mal'),
      numeroGrande(fila.hechas24h, t('tareas.cuenta.hechas24h'), 'bien')),
    fila.esperanVersion > 0 ? el('p', { class: 'suave', texto: t('tareas.esperan_version', { n: fila.esperanVersion }) }) : null,
    fila.enPausa > 0 ? el('p', { class: 'suave', texto: t('tareas.en_pausa', { n: fila.enPausa }) }) : null,
    fila.atrasadaDesde ? el('p', { class: 'aviso', texto: t('tareas.atrasada', { hora: cuando(fila.atrasadaDesde) }) }) : null,
    bloqueModoSeguro,
    el('h3', { class: 'con-icono' }, icono('reloj'), el('span', { texto: t('tareas.proximas') })),
    el('ul', { class: 'lista-simple' }, (s.proximas ?? []).map(p => el('li', {
      texto: [nombreTipo(p.tipo), p.proximaEn ? cuando(p.proximaEn) : t('tareas.proxima.sin_hora')].join(' — ') + (m.activo ? ` ${t('tareas.proxima.en_pausa')}` : ''),
    }))),
    anclaErrores,
    el('h3', { class: 'con-icono' }, icono('atencion'), el('span', { texto: t('tareas.errores') })),
    errores.length ? errores : el('p', { class: 'con-icono tono-bien tono-color' }, icono('bien', 'icono chico'), el('span', { texto: t('tareas.errores.vacio') })),
    bloqueFila,
    el('h3', { texto: t('tareas.corridas') }),
    (s.corridas ?? []).length ? el('ul', { class: 'lista-simple' }, s.corridas.map(c => el('li', {},
      el('span', { class: 'suave', texto: `${fecha(c.terminoEn ?? c.empezoEn)} · ` }),
      el('span', { texto: c.terminoEn ? nombreComo(c.como) : t('tareas.corrida.viva') })))) : el('p', { class: 'suave', texto: t('tareas.corridas.vacio') }),
    el('p', { class: 'ayuda', texto: t('tareas.explicacion') }));

  // ---- Servidor ----
  const memoria = salud.memoria ?? {};
  const historial = Array.isArray(s.historial) ? s.historial : [];
  const detallesHistorial = el('details', { open: estadoVista.historialAbierto },
    el('summary', { texto: t('servidor.historial') }),
    historial.length ? el('ul', { class: 'lista-simple historial-salud' }, historial.map(h => el('li', {
      texto: t('servidor.muestra', { hora: cuando(h.fecha), memoria: tamano(h.memoriaDisponibleMb), disco: tamano(h.discoLibreMb), base: tamano(h.baseMb), ms: h.pantallasP99Ms == null ? '—' : numero(h.pantallasP99Ms, 1) }),
    }))) : el('p', { class: 'suave', texto: t('servidor.sin_muestras') }));
  detallesHistorial.addEventListener('toggle', () => { estadoVista.historialAbierto = detallesHistorial.open; });
  const servidor = el('section', { class: 'tarjeta' }, anclaServidor,
    titulo('servidor', t('sistema.servidor')),
    el('div', { class: `estado-grande tono-${tonoServidor}` }, icono(sinConexion ? 'sin_conexion' : tonoServidor, 'icono estado'), el('span', { texto: sinConexion ? t('sistema.sin_conexion.valor') : t(`servidor.semaforo.${salud.semaforo ?? 'amarillo'}`) })),
    (salud.problemas ?? []).map(p => el('p', { class: `aviso-linea tono-${tonoAviso(p.nivel)}`, texto: textoAviso({ clave: p.clave, detalle: p.detalle }) })),
    el('div', { class: 'medidor' },
      el('div', { class: 'medidor-texto' }, el('span', { texto: t('servidor.memoria') }), el('strong', { texto: t('servidor.de', { a: tamano(memoria.disponibleMb), b: tamano(memoria.totalMb) }) })),
      barra(memoria.disponibleMb, memoria.totalMb, memoria.disponibleMb != null && memoria.disponibleMb < 64 ? 'mal' : memoria.disponibleMb != null && memoria.disponibleMb < 128 ? 'atencion' : 'bien')),
    el('div', { class: 'medidor' },
      el('div', { class: 'medidor-texto' }, el('span', { texto: t('servidor.disco') }), el('strong', { texto: t('servidor.de', { a: tamano(salud.disco?.libreMb), b: tamano(salud.disco?.totalMb) }) })),
      barra(salud.disco?.libreMb, salud.disco?.totalMb, salud.disco?.libreMb != null && salud.disco.libreMb < 300 ? 'mal' : salud.disco?.libreMb != null && salud.disco.libreMb < 1024 ? 'atencion' : 'bien')),
    el('ul', { class: 'lista-simple datos-servidor' },
      memoria.swapTotalMb ? el('li', { texto: t('servidor.swap', { a: tamano(memoria.swapUsadaMb), b: tamano(memoria.swapTotalMb) }) }) : null,
      el('li', { texto: t('servidor.oportia', { mb: tamano(usaOportia), a: tamano(salud.webMb), b: tamano(salud.trabajadorMb) }) }),
      el('li', { texto: t('servidor.base', { mb: tamano(salud.base?.archivoMb), wal: tamano(salud.base?.walMb) }) }),
      el('li', { texto: tn('servidor.copias', { n: salud.copias?.archivos ?? 0, mb: tamano(salud.copias?.mb ?? 0) }) }),
      el('li', { texto: t('servidor.carga', { a: numero(salud.carga?.m1 ?? 0, 2), b: numero(salud.carga?.m5 ?? 0, 2), c: numero(salud.carga?.m15 ?? 0, 2) }) }),
      el('li', { texto: salud.pantallasP99Ms == null ? t('servidor.pantallas.sin_dato') : t('servidor.pantallas', { ms: numero(salud.pantallasP99Ms, 1) }) }),
      salud.encendidoDesde ? el('li', { texto: t('servidor.encendido', { fecha: fecha(salud.encendidoDesde) }) }) : null),
    detallesHistorial);

  return [resumen, avisos, trabajo, servidor];
}

// «Ver la fila»: las 25 tareas más nuevas, con un filtro de botones (sin escribir) y «Ver más».
// Se crea una vez por visita a Administrador: así sigue abierto (y con lo cargado) cuando la zona se actualiza.
function crearBloqueFila() {
  const FILTROS = [['', 'tareas.filtro.todas'], ['lista', 'tareas.estado.lista'], ['en_curso', 'tareas.estado.en_curso'], ['hecha', 'tareas.estado.hecha'], ['fallida', 'tareas.estado.fallida'], ['revisar', 'tareas.estado.revisar'], ['cancelada', 'tareas.estado.cancelada']];
  let filtro = '';
  let cargado = false;
  const lista = el('div', {});
  const mensaje = caja();
  const mas = el('button', { type: 'button', class: 'secundario', hidden: true, texto: t('tareas.ver_mas') });
  let siguiente = null;
  async function cargar(desde = null) {
    mensaje.hidden = true;
    const consulta = new URLSearchParams();
    if (filtro) consulta.set('estado', filtro);
    if (desde) consulta.set('antes', String(desde));
    mas.disabled = true;
    const texto = consulta.toString();
    const r = await api('GET', `/api/admin/tareas${texto ? `?${texto}` : ''}`);
    mas.disabled = false;
    if (!r.ok) return decir(mensaje, textoError(r.datos.error), 'error');
    if (!desde) lista.replaceChildren();
    for (const x of r.datos.tareas) {
      lista.append(el('div', { class: 'fila' },
        el('div', { class: 'etiquetas' },
          el('span', { class: 'etiqueta', texto: tSi(`tareas.estado.${x.estado}`, x.estado) }),
          el('span', { class: 'nombre', texto: `${nombreTipo(x.tipo)} · n.º ${x.id}` })),
        el('p', { class: 'suave', texto: [fecha(x.terminadaEn ?? x.creadaEn), x.pasos ? tn('tareas.pasos', { n: x.pasos }) : null, x.ultimoError ? textoMotivo(x.ultimoError) : null, x.proyecto ? t('tareas.de_proyecto', { proyecto: x.proyecto, cuenta: x.cuenta }) : null].filter(Boolean).join(' · ') })));
    }
    if (!lista.childElementCount) lista.append(el('p', { class: 'suave', texto: t('tareas.fila.vacia') }));
    siguiente = r.datos.siguiente;
    mas.hidden = !siguiente;
  }
  mas.addEventListener('click', () => cargar(siguiente));
  const filtros = grupoDeBotones(FILTROS.map(([valor, clave]) => [valor, t(clave)]), filtro, (valor, marcar) => {
    filtro = valor;
    marcar();
    cargar();
  });
  filtros.classList.add('filtros');
  const detalles = el('details', { class: 'ver-fila' }, el('summary', { texto: t('tareas.ver_fila') }), filtros, lista, mas, mensaje);
  detalles.addEventListener('toggle', () => { if (detalles.open && !cargado) { cargado = true; cargar(); } });
  return detalles;
}

// La zona de sistema de Administrador: se dibuja, se actualiza cada 30 s y maneja sus botones.
// vigente: la guarda de nuevoTurno de la pantalla (si la persona se fue a otra pantalla, se deja de actualizar).
function crearZonaSistema(vigente) {
  const zona = el('div', { class: 'zona-sistema' });
  const mensajeZona = caja();
  const bloqueFila = crearBloqueFila();
  const estadoVista = { historialAbierto: false };
  // Los últimos datos buenos y cuándo llegaron: si una actualización falla, se vuelven a dibujar en gris y con
  // «Sin conexión», en vez de dejar en verde algo que ya no se sabe.
  let ultimos = null;
  let ultimosEn = null;
  let ocupado = false;
  let reloj = null;
  let pronto = null;

  function decirZona(texto, clase) {
    decir(mensajeZona, texto, clase);
  }
  function dibujarCon(datos, { sinConexion = false } = {}) {
    // Si la zona ya se dibujó y salió de la pantalla (la persona se fue), no se vuelve a dibujar.
    if (!vigente() || (zona.dataset.dibujada && !zona.isConnected)) return;
    if (!sinConexion) {
      ultimos = datos;
      ultimosEn = Date.now();
    }
    zona.dataset.dibujada = '1';
    zona.replaceChildren(...dibujarZonaSistema(datos, { acciones, bloqueFila, mensajeZona, estadoVista, datosDe: ultimosEn ?? Date.now(), sinConexion }).filter(Boolean));
  }
  async function actualizar() {
    if (ocupado) return;
    const r = await api('GET', '/api/admin/sistema');
    if (!vigente()) return;
    if (!r.ok) {
      if (!ultimos) zona.replaceChildren(el('section', { class: 'tarjeta' }, el('h2', { texto: t('sistema.titulo') }), el('p', { class: 'mensaje error', texto: textoError(r.datos.error) })));
      else dibujarCon(ultimos, { sinConexion: true });
      return;
    }
    dibujarCon(r.datos);
  }
  // Un botón: se apaga mientras espera, y al terminar se actualiza la zona (y otra vez a los 3 s, porque el
  // trabajador tarda un momento en apagarse o encenderse).
  async function conBoton(boton, accion) {
    if (ocupado) return;
    ocupado = true;
    if (boton) boton.disabled = true;
    mensajeZona.hidden = true;
    try {
      const resultado = await accion();
      if (resultado?.datos) dibujarCon(resultado.datos);
      if (resultado?.texto) decirZona(resultado.texto, 'bien');
    } catch (error) {
      decirZona(error.message || t('error.desconocido'), 'error');
      if (boton) boton.disabled = false;
    } finally {
      ocupado = false;
    }
    await actualizar();
    clearTimeout(pronto);
    pronto = setTimeout(() => { if (vigente()) actualizar(); }, 3000);
  }
  const errorDeTarea = clave => (clave === 'accion_no_permitida_ahora' ? t('tareas.accion_ya_no') : textoError(clave));
  const acciones = {
    actualizar: () => conBoton(null, async () => null),
    visto: (a, boton) => conBoton(boton, async () => {
      const r = await api('POST', `/api/admin/avisos/${a.id}/visto`, {});
      if (!r.ok) throw new Error(textoError(r.datos.error));
      return { texto: t('aviso.entendido.listo') };
    }),
    modoSeguro: (activar, m, boton) => {
      const pregunta = activar ? t('modo_seguro.confirmar_activar') : m.motivo === 'base_danada' ? t('modo_seguro.confirmar_quitar_base') : t('modo_seguro.confirmar_quitar');
      if (!confirm(pregunta)) return;
      return conBoton(boton, async () => {
        const r = await api('POST', '/api/admin/modo-seguro', { activo: activar });
        if (!r.ok) throw new Error(textoError(r.datos.error));
        return { datos: r.datos, texto: t(activar ? 'modo_seguro.activado_listo' : 'modo_seguro.quitado_listo') };
      });
    },
    tarea: (id, accion, boton) => {
      if (accion === 'cancelar' && !confirm(t('tareas.confirmar_cancelar'))) return;
      return conBoton(boton, async () => {
        const r = await api('POST', `/api/admin/tareas/${id}/${accion}`, {});
        if (!r.ok) throw new Error(errorDeTarea(r.datos.error));
        return { texto: t(accion === 'reintentar' ? 'tareas.reintentada' : 'tareas.cancelada') };
      });
    },
  };
  function empezar(datosIniciales) {
    if (datosIniciales?.ok) dibujarCon(datosIniciales.datos);
    else if (datosIniciales) zona.replaceChildren(el('section', { class: 'tarjeta' }, el('h2', { texto: t('sistema.titulo') }), el('p', { class: 'mensaje error', texto: textoError(datosIniciales.datos?.error) })));
    reloj = setInterval(() => {
      if (!vigente() || location.hash !== '#admin') { clearInterval(reloj); clearTimeout(pronto); return; }
      if (document.hidden || ocupado) return;
      mensajeZona.hidden = true; // el mensaje de la última acción ya se leyó
      actualizar();
    }, 30000);
  }
  return { zona, empezar };
}

// «mantenerClave»: la pantalla se vuelve a dibujar sin salir de Administrador (la contraseña temporal sigue a la vista).
async function pantallaAdmin(avisoArriba = null, { mantenerClave = false } = {}) {
  if (!mantenerClave) claveTemporalVisible = null;
  const vigente = nuevoTurno();
  const sistema = crearZonaSistema(vigente);
  const [r, datosSistema] = await Promise.all([api('GET', '/api/admin/usuarios'), api('GET', '/api/admin/sistema')]);
  if (!vigente()) return;
  sistema.empezar(datosSistema);
  if (!r.ok) {
    mostrar(marco('admin', el('section', { class: 'tarjeta' }, el('h1', { texto: t('admin.titulo') })), sistema.zona,
      el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
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

  // La zona de sistema es larga: arriba van dos atajos grandes a lo de siempre (usuarios y crear uno).
  const tarjetaUsuarios = el('section', { class: 'tarjeta' }, el('h2', { texto: t('admin.usuarios') }), filas);
  const tarjetaNuevo = el('section', { class: 'tarjeta' }, el('h2', { texto: t('admin.nuevo') }), formulario);
  const atajo = (nombreIcono, texto, destino, despues) => el('button', {
    type: 'button',
    class: 'secundario con-icono atajo',
    onclick: () => { destino.scrollIntoView({ behavior: 'smooth', block: 'start' }); despues?.(); },
  }, icono(nombreIcono), el('span', { texto }));
  mostrar(marco('admin',
    el('section', { class: 'tarjeta' }, el('h1', { texto: t('admin.titulo') }),
      el('div', { class: 'atajos' },
        atajo('personas', t('admin.ir.usuarios', { n: numero(r.datos.usuarios.length) }), tarjetaUsuarios),
        atajo('mas', t('admin.ir.nuevo'), tarjetaNuevo, () => completo.focus({ preventScroll: true })))),
    avisoArriba ? el('section', { class: 'tarjeta' }, avisoArriba) : null,
    seccionClaveTemporal(),
    sistema.zona,
    tarjetaUsuarios,
    tarjetaNuevo));
}

// ---------- Proyectos ----------
let catalogo = null;
let pidiendoCatalogo = null; // si dos pantallas lo piden a la vez, se baja una sola vez

async function cargarCatalogo() {
  if (catalogo) return catalogo;
  pidiendoCatalogo ??= (async () => {
    const r = await api('GET', '/api/catalogo');
    if (!r.ok) throw new Error(textoError(r.datos.error));
    catalogo = r.datos;
    return catalogo;
  })().finally(() => { pidiendoCatalogo = null; });
  return pidiendoCatalogo;
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
function objetivoEsPropio(c) {
  const p = String(c.producto ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const sugeridos = c.tipo === 'laboral'
    ? (p ? [`Conseguir empleo de ${p}`, `Get a job as ${p}`] : ['Conseguir empleo', 'Get a job'])
    : (p ? [`Encontrar clientes que puedan necesitar ${p}`, `Find customers who may need ${p}`] : ['Encontrar clientes', 'Find customers']);
  return !sugeridos.some(x => comparable(x) === comparable(c.objetivo));
}
function objetivoDe(c) {
  if (objetivoEsPropio(c)) return c.objetivo;
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

// ---------- Pase visual 2 (0.3.2): los proyectos con dibujos y poco texto ----------
// Lo largo no se quita: queda detrás de «Ver en palabras».

// El mapa de casillas de las 32 provincias. «fuertes»: elegidas; «suaves»: dentro de algo elegido (una región en el
// creador, o un municipio o lugar de esa provincia). Con alTocar(clave) cada casilla es un botón (el creador).
function provinciaDeZona(clave) {
  const z = catalogo.zonas.find(x => x.clave === clave);
  if (!z) return null;
  return z.tipo === 'provincia' ? z.clave : z.provincia || null;
}
function provinciasDe(zonas = [], pais = false, { regionesSuaves = false } = {}) {
  const fuertes = new Set();
  const suaves = new Set();
  if (pais) for (const p of MAPA_PROVINCIAS) fuertes.add(p.clave);
  for (const zona of zonas) {
    if (PROVINCIAS_DE_REGION[zona]) for (const p of PROVINCIAS_DE_REGION[zona]) (regionesSuaves ? suaves : fuertes).add(p);
    else {
      const provincia = provinciaDeZona(zona);
      if (provincia === zona) fuertes.add(provincia);
      else if (provincia) suaves.add(provincia);
    }
  }
  for (const p of fuertes) suaves.delete(p);
  return { fuertes, suaves };
}
const LADO_CASILLA = 48;
function mapaRD({ alTocar = null, etiqueta }) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${MAPA_COLUMNAS * LADO_CASILLA} ${MAPA_FILAS * LADO_CASILLA}`, class: `mapa-rd${alTocar ? ' tocable' : ''}`,
    role: alTocar ? 'group' : 'img', 'aria-label': etiqueta, focusable: 'false',
  });
  for (const p of MAPA_PROVINCIAS) {
    const nombre = nombreZona(p.clave);
    const casilla = svgEl('g', { class: 'mapa-casilla', transform: `translate(${p.columna * LADO_CASILLA} ${p.fila * LADO_CASILLA})`, 'data-provincia': p.clave });
    const titulo = svgEl('title');
    titulo.textContent = nombre;
    // El fondo transparente hace que se pueda tocar toda la casilla (48×48), no solo el cuadrito.
    casilla.append(titulo, svgEl('rect', { class: 'mapa-toque', x: 0, y: 0, width: LADO_CASILLA, height: LADO_CASILLA }),
      svgEl('rect', { class: 'mapa-cuadro', x: 2.5, y: 2.5, width: LADO_CASILLA - 5, height: LADO_CASILLA - 5, rx: 10 }));
    const letras = svgEl('text', { class: 'mapa-letras', x: LADO_CASILLA / 2, y: LADO_CASILLA / 2 + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'aria-hidden': 'true' });
    letras.textContent = p.letras;
    casilla.append(letras);
    if (alTocar) {
      casilla.setAttribute('role', 'button');
      casilla.setAttribute('tabindex', '0');
      casilla.setAttribute('aria-label', nombre);
      casilla.setAttribute('aria-pressed', 'false');
      casilla.addEventListener('click', () => alTocar(p.clave));
      casilla.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alTocar(p.clave); } });
    }
    svg.append(casilla);
  }
  return svg;
}
function pintarMapa(svg, { fuertes, suaves }) {
  for (const casilla of svg.querySelectorAll('.mapa-casilla')) {
    const clave = casilla.getAttribute('data-provincia');
    casilla.classList.toggle('marcada', fuertes.has(clave));
    casilla.classList.toggle('suave', !fuertes.has(clave) && suaves.has(clave));
    if (casilla.hasAttribute('aria-pressed')) casilla.setAttribute('aria-pressed', fuertes.has(clave) ? 'true' : 'false');
  }
  return svg;
}

// Una pastilla de solo mirar (con su ícono) y una ficha de «Lo que entendí»: ícono, rótulo corto y lo elegido.
function pastilla(texto, nombreIcono = null, clase = '') {
  return el('span', { class: `pastilla ${clase}`.trim() }, nombreIcono ? icono(nombreIcono, 'icono chico') : null, el('span', { texto }));
}
function ficha(nombreIcono, rotulo, contenido, clase = '') {
  return el('div', { class: `ficha ${clase}`.trim() },
    el('div', { class: 'ficha-cabeza' }, el('span', { class: 'ficha-icono' }, icono(nombreIcono)), el('span', { class: 'ficha-rotulo', texto: rotulo })),
    contenido);
}
// 1, 2 o 3 edificios según el tamaño de las empresas.
function edificios(n, clase = '') {
  return el('span', { class: `edificios ${clase}`.trim(), 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => icono('casita', `icono casita casita-${i + 1}`)));
}
const nombreAutonomiaCorta = a => (a === 'frecuencia_aprobada' ? t('autonomia.corta.frecuencia_aprobada')
  : a === 'solo_cuando_pida' ? t('autonomia.corta.solo_cuando_pida') : t('autonomia.corta.aprobar_salidas'));

// «Lo que entendí» con dibujos: una ficha por cada cosa. La frase completa y todos los datos: «Ver en palabras».
function resumenVisual(c) {
  const falta = t('valor.falta');
  const laboral = c.tipo === 'laboral';
  const fichas = [];
  fichas.push(ficha(laboral ? 'maletin' : 'etiqueta', laboral ? t('visual.producto.laboral') : t('visual.producto.comercial'),
    el('div', { class: 'pastillas' }, pastilla(productoDe(c) || falta, null, productoDe(c) ? 'fuerte' : 'falta')), 'ancha'));
  if (!laboral) {
    const sectores = [
      ...c.sectores.map(s => pastilla(s === 'todas' ? t('creador.sectores.todas') : nombreSector(s), iconoSector(s))),
      ...c.sectoresLibres.map(s => pastilla(s, 'edificio')),
    ];
    fichas.push(ficha('edificio', t('visual.sectores'), el('div', { class: 'pastillas' }, sectores.length ? sectores : pastilla(falta, null, 'falta')), 'ancha'));
  }
  const lugares = [
    c.paisCompleto ? pastilla(t('valor.pais_completo'), 'mapa') : null,
    ...c.zonas.map(z => pastilla(nombreZona(z), 'lugar')),
    ...c.zonasLibres.map(z => pastilla(z, 'lugar')),
  ].filter(Boolean);
  const nombres = c.paisCompleto ? [t('valor.pais_completo'), ...zonasDe(c)] : zonasDe(c);
  fichas.push(ficha('lugar', t('visual.zonas'), [
    pintarMapa(mapaRD({ etiqueta: t('visual.mapa', { lugares: unir(nombres) || falta }) }), provinciasDe(c.zonas, c.paisCompleto)),
    el('div', { class: 'pastillas' }, lugares.length ? lugares : pastilla(falta, null, 'falta')),
  ], 'ancha'));
  if (!laboral) {
    const todos = !c.tamanos.length || c.tamanos.length >= 3;
    fichas.push(ficha('regla', t('visual.tamanos'), todos
      ? el('div', { class: 'tamanos-vista' }, el('span', { class: 'tamano-vista' }, edificios(3, 'todos'), el('span', { texto: t('valor.tamanos.todos') })))
      : el('div', { class: 'tamanos-vista' }, c.tamanos.map(x => el('span', { class: 'tamano-vista' }, edificios(EDIFICIOS_POR_TAMANO[x] || 1), el('span', { texto: t(`tamano.${x}`) }))))));
  } else {
    const salario = salarioDe(c);
    fichas.push(ficha('dinero', t('visual.salario'), el('p', { class: 'ficha-valor', texto: salario || t('creador.salario.no_importa') })));
  }
  fichas.push(ficha('calendario', t('visual.frecuencia'), el('p', { class: 'ficha-valor', texto: t(`frecuencia.${c.frecuencia}`) })));
  fichas.push(ficha('escudo', t('visual.autonomia'), el('p', { class: 'ficha-valor', texto: nombreAutonomiaCorta(c.autonomia || catalogo.autonomiaPorDefecto) })));
  if (laboral && c.experiencia) fichas.push(ficha('bien', t('campo.experiencia'), el('p', { class: 'ficha-valor', texto: t('visual.sin_experiencia') })));
  const capacidades = catalogo.capacidades.filter(x => c.capacidades[x.clave]);
  if (capacidades.length) {
    fichas.push(ficha('rayo', t('visual.capacidades'), el('div', { class: 'pastillas' }, capacidades.map(x => pastilla(t(`capacidad.${x.clave}`)))), 'ancha'));
  }
  const exclusiones = exclusionesDe(c);
  if (exclusiones.length) fichas.push(ficha('prohibido', t('visual.exclusiones'), el('div', { class: 'pastillas' }, exclusiones.map(x => pastilla(x))), 'ancha'));
  if (c.prioridades.length) fichas.push(ficha('estrella', t('visual.prioridades'), el('div', { class: 'pastillas' }, c.prioridades.map(x => pastilla(x))), 'ancha'));
  return el('div', { class: 'fichas' }, fichas);
}
// «Ver en palabras»: la frase de siempre y todos los datos (el resumen completo de antes, sin quitar nada).
function enPalabras(c, ...antes) {
  return el('details', { class: 'en-palabras' },
    el('summary', { class: 'con-icono' }, icono('libro'), el('span', { texto: t('proyecto.ver_palabras') })),
    antes,
    el('p', { class: 'entendi', texto: fraseEntendi(c) }),
    resumen(c));
}

// El dibujo de un proyecto: el tipo en grande (vender o empleo) con el sello de su negocio principal.
function sectorPrincipal(c) {
  if (!c || c.tipo === 'laboral') return null;
  const sectores = Array.isArray(c.sectores) ? c.sectores : [];
  return sectores.find(s => s !== 'todas') || (sectores.includes('todas') ? 'todas' : null);
}
function ilustracionProyecto(tipo, sector, clase = '') {
  return el('span', { class: `ilustracion ${clase}`.trim(), 'aria-hidden': 'true' },
    icono(iconoTipo(tipo), 'icono ilustracion-tipo'),
    sector ? el('span', { class: 'ilustracion-sello' }, icono(iconoSector(sector), 'icono')) : null);
}

// La pista de pasos: Creado → Aprobado → Buscar (fase 2) → Contactar (fase 3). Lo que todavía no existe va con candado
// y su fase: nada busca hasta que llegue esa fase.
function pistaProyecto(p) {
  const aprobado = p.versionActiva != null;
  const faseBuscar = faseDe('investigar', p.tipo) ?? (p.tipo === 'laboral' ? 6 : 2);
  const faseContactar = faseDe('contactar', p.tipo) ?? (p.tipo === 'laboral' ? 6 : 3);
  const pasos = [
    { nombreIcono: 'chispa', texto: t('pista.creado'), estado: 'hecho' },
    { nombreIcono: 'reloj', texto: aprobado ? t('pista.aprobado') : t('pista.aprobar'), estado: aprobado ? 'hecho' : 'ahora' },
    { nombreIcono: 'buscar', texto: p.tipo === 'laboral' ? t('pista.buscar.laboral') : t('pista.buscar.comercial'), fase: faseBuscar, estado: 'luego' },
    { nombreIcono: 'sobre', texto: t('pista.contactar'), fase: faseContactar, estado: 'luego' },
  ];
  const estadoEnPalabras = e => (e === 'hecho' ? t('pista.hecho') : e === 'ahora' ? t('pista.ahora') : t('pista.luego'));
  return el('ol', { class: 'pista', 'aria-label': t('pista.titulo') }, pasos.map(x => el('li', { class: `pista-paso ${x.estado}` },
    el('span', { class: 'pista-punto' }, icono(x.estado === 'hecho' ? 'marca' : x.nombreIcono, 'icono'),
      x.estado === 'luego' ? el('span', { class: 'pista-candado' }, icono('candado', 'icono')) : null),
    el('span', { class: 'pista-texto', texto: x.texto }),
    x.fase ? el('span', { class: 'pista-fase', texto: t('pista.fase', { fase: x.fase }) }) : null,
    el('span', { class: 'solo-lectores', texto: estadoEnPalabras(x.estado) }))));
}

// En la papelera no se muestra el estado (diría «En ejecución» de algo que no trabaja): se dice que está en la papelera.
// El nombre del estado. Mientras no existan las fases que buscan, un proyecto aprobado no trabaja todavía:
// no se le dice «En ejecución» (ni en verde), sino «Aprobado · espera la fase 2» (o la 6, si busca empleo).
function nombreDeEstado(p) {
  if (p.estado === 'en_ejecucion') return t(p.tipo === 'laboral' ? 'estado.en_ejecucion.laboral' : 'estado.en_ejecucion.comercial');
  return t(`estado.${p.estado}`);
}

// Cada estado con su color y su ícono, igual en la lista, en el proyecto y en Inicio:
// gris = borrador, pausado o en la papelera; amarillo = espera tu aprobación; azul = aprobado (espera la fase que
// busca); verde = completado; rojo = con errores.
const ESTADO_VISUAL = {
  borrador: ['apagado', 'lapiz'], pendiente: ['atencion', 'reloj'], en_ejecucion: ['info', 'marca'],
  pausado: ['apagado', 'pausa'], completado: ['bien', 'bandera'], con_errores: ['mal', 'mal'],
};
function visualDeEstado(p) {
  if (p.enPapelera) return { tono: 'apagado', nombreIcono: 'papelera', texto: t('proyecto.etiqueta_papelera') };
  const [tono, nombreIcono] = ESTADO_VISUAL[p.estado] ?? ['apagado', 'info'];
  return { tono, nombreIcono, texto: ESTADO_VISUAL[p.estado] ? nombreDeEstado(p) : String(p.estado) };
}
function etiquetaEstado(p) {
  const v = visualDeEstado(p);
  return el('span', { class: `insignia tono-${v.tono}` }, icono(v.nombreIcono, 'icono chico'), el('span', { texto: v.texto }));
}
const iconoTipo = tipo => (tipo === 'laboral' ? 'maletin' : 'tienda');
function etiquetaTipo(tipo) {
  return el('span', { class: 'etiqueta con-icono-chico' }, icono(iconoTipo(tipo), 'icono chico'), el('span', { texto: t(`tipo.${tipo}`) }));
}

// «Siguiente paso»: qué tiene que hacer la persona ahora, en una frase.
// pendiente: la versión que espera (en el proyecto) o solo su número (en la lista). escribe: puede cambiarlo.
function siguientePaso(p, { pendiente = p.versionPendiente, escribe = true } = {}) {
  if (!escribe && !p.enPapelera) return t(pendiente ? 'siguiente.lector_pendiente' : 'siguiente.lector');
  if (p.enPapelera) return t(escribe ? 'siguiente.papelera' : 'siguiente.papelera_lector');
  if (pendiente) {
    if (typeof pendiente === 'object' && pendiente.faltantes?.length) return t('siguiente.responder');
    if (p.versionActiva) return t('siguiente.aprobar_cambio');
    return t(typeof pendiente === 'object' ? 'siguiente.aprobar' : 'siguiente.revisar');
  }
  if (p.estado === 'borrador') return t('siguiente.borrador');
  if (p.estado === 'en_ejecucion') return t(p.tipo === 'laboral' ? 'siguiente.espera.laboral' : 'siguiente.espera.comercial');
  if (p.estado === 'pausado') return t('siguiente.pausado');
  if (p.estado === 'completado') return t('siguiente.completado');
  if (p.estado === 'con_errores') return t('siguiente.con_errores');
  return '';
}

// El estado del proyecto, de un vistazo: su color e ícono, la pista de pasos y el siguiente paso en una línea.
// destino: a dónde baja «Ir» (la versión que espera, los botones…), si hay algo que hacer.
function tarjetaEstado(p, { pendiente, escribe, destino }) {
  const v = visualDeEstado(p);
  const paso = siguientePaso(p, { pendiente, escribe });
  return el('div', { class: `estado-proyecto tono-${v.tono}` },
    el('div', { class: 'estado-proyecto-cabeza' },
      el('span', { class: 'estado-icono' }, icono(v.nombreIcono, 'icono estado')),
      el('span', { class: 'solo-lectores', texto: t('proyecto.estado') }),
      el('strong', { class: 'estado-nombre', texto: v.texto })),
    pistaProyecto(p),
    paso ? el('div', { class: 'siguiente' },
      el('span', { class: 'siguiente-icono' }, icono('flecha', 'icono')),
      el('p', { class: 'siguiente-texto' }, el('span', { class: 'solo-lectores', texto: `${t('siguiente.titulo')}: ` }), el('span', { texto: paso })),
      destino ? el('button', {
        type: 'button', class: 'chico con-icono',
        onclick: () => { destino.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      }, el('span', { texto: t('siguiente.ir') }), icono('flecha', 'icono chico')) : null) : null);
}

function tarjetaError(mensaje) {
  return el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', 'data-foco': true, texto: mensaje }));
}

// Antes de aprobar por primera vez, sin rodeos: aprobar guarda el proyecto, pero la búsqueda llega más adelante.
const avisoAntesDeAprobar = tipo => t(tipo === 'laboral' ? 'proyecto.aviso_antes.laboral' : 'proyecto.aviso_antes.comercial');
const avisoCortoAntesDeAprobar = tipo => t(tipo === 'laboral' ? 'proyecto.aviso_antes.corto.laboral' : 'proyecto.aviso_antes.corto.comercial');

// Botón que hace un pedido: se desactiva mientras espera y, si falla, explica por qué.
function botonAccion(texto, clase, cajaMensaje, accion, nombreIcono = null) {
  const boton = el('button', {
    type: 'button',
    class: nombreIcono ? `${clase} con-icono`.trim() : clase,
    texto: nombreIcono ? undefined : texto,
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
  }, nombreIcono ? [icono(nombreIcono), el('span', { texto })] : null);
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

// Un cuadro de texto que crece con lo que se escribe (sin barra de desplazamiento adentro).
function crecer(area) {
  const ajustar = () => {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight + 2, 640)}px`;
  };
  area.addEventListener('input', ajustar);
  requestAnimationFrame(ajustar);
  return area;
}

// Un botón de los que se marcan tocando (negocios, lugares, tamaños…). Marcado: lleno y con ✓; VoiceOver lo lee
// con aria-pressed.
function chip(texto, marcado, alTocar, { nombreIcono = null, clase = '', delante = null } = {}) {
  const boton = el('button', { type: 'button', class: `chip ${clase}`.trim(), 'aria-pressed': marcado ? 'true' : 'false', onclick: () => alTocar(boton) },
    el('span', { class: 'chip-marca' }, icono('marca', 'icono chico')),
    nombreIcono ? icono(nombreIcono, 'icono chip-icono') : null,
    delante,
    el('span', { texto }));
  return boton;
}
function marcarChip(boton, marcado) {
  boton.setAttribute('aria-pressed', marcado ? 'true' : 'false');
}

// Un paso del creador: número, ícono, título y lo que se toca.
function pasoCreador(numero, nombreIcono, titulo, ayuda, ...contenido) {
  return el('fieldset', { class: 'paso' },
    el('legend', { class: 'paso-titulo' }, el('span', { class: 'paso-numero', texto: String(numero) }), icono(nombreIcono, 'icono paso-icono'), el('span', { texto: titulo })),
    ayuda ? el('p', { class: 'ayuda', texto: ayuda }) : null,
    ...contenido);
}

const nombreProducto = clave => {
  const propio = PRODUCTOS_CON_OTRAS_PALABRAS[clave];
  if (propio) return propio[idioma] || propio.es;
  const x = catalogo.productos.find(p => p.clave === clave);
  return x ? x[idioma] || x.es : clave;
};
const dineroCorto = n => `RD$${numero(n)}`;

// El creador con toques. Todo se elige tocando; lo único que se escribe es qué vende (o qué empleo busca), y
// también eso tiene sugerencias para tocar. Lo elegido se convierte en una frase sencilla (se ve abajo, en «Así
// se lo voy a pedir a OPORTIA») que va por el mismo camino que el texto libre: el motor la entiende, se ve «Lo que
// entendí», las dudas, y nada trabaja hasta aprobarlo.
// inicial: la elección de partida. claveBorrador: dónde se guarda lo elegido si la sesión termina.
// alMandar(texto): crea el proyecto o la versión (devuelve MANTENER si ya se fue a otra pantalla). alEscribir(texto): pasa al texto libre con esta frase.
function crearCreador({ inicial = {}, claveBorrador, textoBoton, alMandar, alEscribir, antes = null }) {
  let guardada = null;
  try { guardada = JSON.parse(borrador(claveBorrador) || 'null'); } catch { guardada = null; }
  const partida = guardada && typeof guardada === 'object' ? guardada : inicial;
  const x = normalizarEleccion(partida);
  const st = {
    tipo: x.tipo,
    producto: typeof partida.producto === 'string' ? partida.producto.slice(0, MAXIMO_PRODUCTO) : '',
    sectores: new Set(x.sectores), pais: x.pais, zonas: new Set(x.zonas), tamanos: new Set(x.tamanos),
    frecuencia: x.frecuencia, salarioMinimo: x.salarioMinimo,
  };
  const eleccion = () => ({ ...st, sectores: [...st.sectores], zonas: [...st.zonas], tamanos: [...st.tamanos] });
  const mensaje = caja();

  // 1. ¿Qué quieres hacer?
  const opcionTipo = (valor, nombreIcono, titulo, texto) => el('button', {
    type: 'button', class: 'opcion-grande', 'aria-pressed': st.tipo === valor ? 'true' : 'false', 'data-tipo': valor,
    onclick: () => { st.tipo = valor; actualizar(); },
  }, el('span', { class: 'opcion-icono' }, icono(nombreIcono, 'icono grande')),
  el('span', { class: 'opcion-texto' }, el('strong', { texto: titulo }), el('span', { texto })),
  el('span', { class: 'opcion-marca' }, icono('marca', 'icono chico')));
  const vender = opcionTipo('comercial', 'tienda', t('creador.tipo.vender'), t('creador.tipo.vender.texto'));
  const empleo = opcionTipo('laboral', 'maletin', t('creador.tipo.empleo'), t('creador.tipo.empleo.texto'));
  // Comprar (buscar proveedores) todavía no existe: se dice claro, sin un botón que no hace nada.
  const comprar = el('div', { class: 'opcion-grande proxima', 'aria-disabled': 'true' },
    el('span', { class: 'opcion-icono' }, icono('carrito', 'icono grande')),
    el('span', { class: 'opcion-texto' }, el('strong', { texto: t('creador.tipo.comprar') }), el('span', { texto: t('creador.tipo.comprar.texto') })),
    el('span', { class: 'insignia tono-apagado', texto: t('creador.proximamente') }));

  // 2. ¿Qué vendes? / ¿Qué empleo buscas? (el único campo para escribir, con sugerencias para tocar)
  const producto = el('input', { id: 'creador-producto', type: 'text', maxlength: MAXIMO_PRODUCTO, autocomplete: 'off', value: st.producto, enterkeyhint: 'done' });
  const etiquetaProducto = el('label', { for: 'creador-producto' });
  const sugerencias = el('div', { class: 'chips' });
  const sugerenciasMas = el('div', { class: 'chips', hidden: true });
  const verMasSugerencias = el('button', { type: 'button', class: 'secundario chico ver-mas', 'aria-expanded': 'false', texto: t('creador.ver_mas_ideas'),
    onclick: () => { sugerenciasMas.hidden = false; verMasSugerencias.hidden = true; } });
  const dibujarSugerencias = () => {
    const lista = st.tipo === 'laboral' ? PUESTOS_SUGERIDOS.map(x => x[idioma] || x.es) : PRODUCTOS_SUGERIDOS.map(nombreProducto);
    const botones = lista.map(texto => chip(texto, comparable(texto) === comparable(st.producto), () => {
      st.producto = texto;
      producto.value = texto;
      actualizar();
    }));
    sugerencias.replaceChildren(...botones.slice(0, 8));
    sugerenciasMas.replaceChildren(...botones.slice(8));
    verMasSugerencias.hidden = botones.length <= 8 || !sugerenciasMas.hidden;
  };
  producto.addEventListener('input', () => { st.producto = producto.value; actualizar(); });
  producto.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); producto.blur(); } });

  // 3. ¿A qué negocios? (solo para vender)
  const avisoMaximo = el('p', { class: 'ayuda aviso-maximo', hidden: true, role: 'status' });
  const botonesSector = new Map();
  const todas = chip(t('creador.sectores.todas'), st.sectores.has('todas'), () => {
    if (st.sectores.has('todas')) st.sectores.delete('todas'); else { st.sectores.clear(); st.sectores.add('todas'); }
    actualizar();
  }, { nombreIcono: 'edificio', clase: 'chip-todo' });
  for (const s of SECTORES_CREADOR) {
    botonesSector.set(s.clave, chip(nombreSector(s.clave), st.sectores.has(s.clave), () => {
      st.sectores.delete('todas');
      if (st.sectores.has(s.clave)) st.sectores.delete(s.clave);
      else if (st.sectores.size >= MAXIMO_ELEGIDOS) return decir(avisoMaximo, t('creador.maximo.sectores', { n: MAXIMO_ELEGIDOS }), 'aviso-maximo');
      else st.sectores.add(s.clave);
      avisoMaximo.hidden = true;
      actualizar();
    }, { nombreIcono: iconoSector(s.clave), clase: 'chip-sector' }));
  }
  const listaConMas = (botones, aLaVista, claveMas) => {
    const vista = botones.slice(0, aLaVista);
    const resto = el('div', { class: 'chips', hidden: !botones.slice(aLaVista).some(b => b.getAttribute('aria-pressed') === 'true') }, botones.slice(aLaVista));
    const mas = el('button', { type: 'button', class: 'secundario chico ver-mas', 'aria-expanded': resto.hidden ? 'false' : 'true' });
    const ponerTexto = () => { mas.textContent = resto.hidden ? t(claveMas, { n: botones.length }) : t('creador.ver_menos'); mas.setAttribute('aria-expanded', resto.hidden ? 'false' : 'true'); };
    mas.addEventListener('click', () => { resto.hidden = !resto.hidden; ponerTexto(); });
    ponerTexto();
    return [el('div', { class: 'chips' }, vista), resto, mas];
  };
  const pasoSectores = pasoCreador(3, 'edificio', t('creador.sectores'), t('creador.sectores.ayuda'),
    el('div', { class: 'chips' }, todas),
    listaConMas([...botonesSector.values()], SECTORES_A_LA_VISTA, 'creador.ver_todos'),
    avisoMaximo);

  // 4. ¿Dónde?
  const avisoZonas = el('p', { class: 'ayuda aviso-maximo', hidden: true, role: 'status' });
  const pais = chip(t('creador.zonas.pais'), st.pais, () => { st.pais = !st.pais; if (st.pais) st.zonas.clear(); actualizar(); }, { nombreIcono: 'lugar', clase: 'chip-todo' });
  // Lo mismo al tocar un lugar en la lista o una provincia en el mapa.
  const alternarZona = clave => {
    st.pais = false;
    if (st.zonas.has(clave)) st.zonas.delete(clave);
    else if (st.zonas.size >= MAXIMO_ELEGIDOS) return decir(avisoZonas, t('creador.maximo.zonas', { n: MAXIMO_ELEGIDOS }), 'aviso-maximo');
    else st.zonas.add(clave);
    avisoZonas.hidden = true;
    actualizar();
    return null;
  };
  const botonesZona = new Map(ZONAS_CREADOR.map(z => [z.clave, chip(nombreZona(z.clave), st.zonas.has(z.clave), () => alternarZona(z.clave))]));
  // El mapa: tocar una provincia la marca o la quita (igual que su botón de la lista, que sigue abajo para VoiceOver).
  const mapa = mapaRD({ alTocar: alternarZona, etiqueta: t('creador.mapa') });
  const mapaCaja = el('div', { class: 'mapa-caja' }, mapa, el('p', { class: 'ayuda con-icono' }, icono('dedo', 'icono chico'), el('span', { texto: t('creador.mapa.ayuda') })));
  const regiones = ZONAS_CREADOR.filter(z => z.tipo === 'region').map(z => botonesZona.get(z.clave));
  const provincias = ZONAS_CREADOR.filter(z => z.tipo !== 'region').map(z => botonesZona.get(z.clave));
  const pasoZonas = pasoCreador(4, 'lugar', t('creador.zonas'), t('creador.zonas.ayuda'),
    el('div', { class: 'chips' }, pais),
    mapaCaja,
    el('p', { class: 'subtitulo', texto: t('creador.zonas.provincias') }),
    listaConMas(provincias, ZONAS_A_LA_VISTA, 'creador.ver_todas'),
    el('p', { class: 'subtitulo', texto: t('creador.zonas.regiones') }),
    listaConMas(regiones, 3, 'creador.ver_todas'),
    avisoZonas);

  // 5. Tamaño (vender) o salario (empleo)
  const botonesTamano = new Map(ORDEN_TAMANOS.map(x => [x, chip(t(`tamano.${x}`), st.tamanos.has(x), () => {
    if (st.tamanos.has(x)) st.tamanos.delete(x); else st.tamanos.add(x);
    actualizar();
  }, { delante: edificios(EDIFICIOS_POR_TAMANO[x] || 1), clase: 'chip-tamano' })]));
  const pasoTamano = pasoCreador(5, 'regla', t('creador.tamanos'), t('creador.tamanos.ayuda'), el('div', { class: 'chips' }, [...botonesTamano.values()]));
  const sinSalario = chip(t('creador.salario.no_importa'), !st.salarioMinimo, () => { st.salarioMinimo = null; actualizar(); });
  const botonesSalario = new Map(SALARIOS_SUGERIDOS.map(n => [n, chip(t('creador.salario.desde', { cantidad: dineroCorto(n) }), st.salarioMinimo === n, () => {
    st.salarioMinimo = st.salarioMinimo === n ? null : n;
    actualizar();
  })]));
  const pasoSalario = pasoCreador(4, 'dinero', t('creador.salario'), t('creador.salario.ayuda'), el('div', { class: 'chips' }, sinSalario, [...botonesSalario.values()]));

  // 6. ¿Cada cuánto?
  const botonesFrecuencia = new Map(ORDEN_FRECUENCIAS.map(f => [f, chip(t(`frecuencia.${f}`), st.frecuencia === f, () => { st.frecuencia = f; actualizar(); })]));
  const pasoFrecuencia = pasoCreador(6, 'calendario', t('creador.frecuencia'), t('creador.frecuencia.ayuda'), el('div', { class: 'chips' }, [...botonesFrecuencia.values()]));

  const pasoProducto = pasoCreador(2, 'etiqueta', '', null, etiquetaProducto, producto, el('p', { class: 'ayuda', texto: t('creador.sugerencias') }), sugerencias, sugerenciasMas, verMasSugerencias);
  const tituloProducto = pasoProducto.querySelector('legend span:last-child');

  // Lo que se va a pedir, siempre a la vista.
  const frase = el('p', { class: 'vista-previa-texto' });
  const faltan = el('ul', { class: 'faltan' });
  const crear = el('button', { type: 'button', class: 'grande con-icono' }, icono('chispa'), el('span', { texto: textoBoton }));
  const escribir = el('button', { type: 'button', class: 'secundario con-icono' }, icono('lapiz'), el('span', { texto: t('creador.cambiar_texto') }));
  escribir.addEventListener('click', () => alEscribir(componer(eleccion(), idioma)));
  crear.addEventListener('click', async () => {
    const falta = faltaEnEleccion(eleccion());
    if (falta.length) return decir(mensaje, t('creador.falta_algo'), 'error');
    crear.disabled = true;
    mensaje.hidden = true;
    let mantener = false;
    try {
      mantener = (await alMandar(componer(eleccion(), idioma))) === MANTENER;
      if (mantener) borrador(claveBorrador, '');
    } catch (error) {
      decir(mensaje, error.message || t('error.desconocido'), 'error');
    } finally {
      if (!mantener) crear.disabled = false;
    }
  });
  const vista = el('section', { class: 'vista-previa', 'aria-live': 'polite' },
    el('p', { class: 'vista-previa-titulo con-icono' }, icono('ojo', 'icono chico'), el('span', { texto: t('creador.vista') })),
    frase, faltan);

  let primera = true;
  function actualizar() {
    const comercial = st.tipo === 'comercial';
    vender.setAttribute('aria-pressed', comercial ? 'true' : 'false');
    empleo.setAttribute('aria-pressed', comercial ? 'false' : 'true');
    tituloProducto.textContent = t(comercial ? 'creador.producto.vender' : 'creador.producto.empleo');
    etiquetaProducto.textContent = t(comercial ? 'creador.producto.vender.etiqueta' : 'creador.producto.empleo.etiqueta');
    producto.placeholder = t(comercial ? 'creador.producto.vender.ejemplo' : 'creador.producto.empleo.ejemplo');
    pasoSectores.hidden = !comercial;
    pasoTamano.hidden = !comercial;
    pasoSalario.hidden = comercial;
    // Los números de los pasos siguen el orden que se ve.
    pasoZonas.querySelector('.paso-numero').textContent = comercial ? '4' : '3';
    pasoSalario.querySelector('.paso-numero').textContent = '4';
    pasoFrecuencia.querySelector('.paso-numero').textContent = comercial ? '6' : '5';
    marcarChip(todas, st.sectores.has('todas'));
    for (const [clave, b] of botonesSector) marcarChip(b, st.sectores.has(clave));
    marcarChip(pais, st.pais);
    for (const [clave, b] of botonesZona) marcarChip(b, st.zonas.has(clave));
    pintarMapa(mapa, provinciasDe([...st.zonas], st.pais, { regionesSuaves: true }));
    for (const [clave, b] of botonesTamano) marcarChip(b, st.tamanos.has(clave));
    marcarChip(sinSalario, !st.salarioMinimo);
    for (const [n, b] of botonesSalario) marcarChip(b, st.salarioMinimo === n);
    for (const [f, b] of botonesFrecuencia) marcarChip(b, st.frecuencia === f);
    dibujarSugerencias();
    const falta = faltaEnEleccion(eleccion());
    frase.textContent = componer(eleccion(), idioma, { huecos: true });
    faltan.replaceChildren(...falta.map(f => el('li', { class: 'con-icono' }, icono('atencion', 'icono chico'), el('span', { texto: t(`creador.falta.${f === 'producto' && !comercial ? 'empleo' : f}`) }))));
    crear.classList.toggle('bloqueado', falta.length > 0);
    crear.setAttribute('aria-disabled', falta.length ? 'true' : 'false');
    if (!primera) borrador(claveBorrador, JSON.stringify(eleccion()));
    primera = false;
  }
  actualizar();

  return el('div', { class: 'creador' },
    antes,
    pasoCreador(1, 'dedo', t('creador.tipo'), null, el('div', { class: 'opciones-grandes' }, vender, empleo, comprar)),
    pasoProducto,
    pasoSectores,
    pasoZonas,
    pasoTamano,
    pasoSalario,
    pasoFrecuencia,
    vista,
    el('div', { class: 'acciones-creador' }, crear, escribir),
    mensaje);
}

// Escribirlo con mis palabras: el cuadro grande de siempre (crece con lo escrito), con ejemplos para tocar.
function formularioTextoLibre({ id, clave, inicial = null, textoBoton, alMandar, conEjemplos = true }) {
  const mensaje = caja();
  const area = crecer(el('textarea', { id, name: 'instrucciones', rows: 6, required: true, minlength: 10, maxlength: 4000, placeholder: t('proyectos.instrucciones.ejemplo') }));
  if (inicial) { area.value = inicial; borrador(clave, inicial); } else recordarTexto(area, clave);
  if (inicial) area.addEventListener('input', () => borrador(clave, area.value));
  const contador = el('p', { class: 'contador', 'aria-live': 'off' });
  const contar = () => { contador.textContent = t('proyectos.contador', { n: numero(area.value.length), maximo: numero(4000) }); };
  area.addEventListener('input', contar);
  contar();
  const formulario = el('form', { novalidate: true, class: 'texto-libre' },
    el('label', { for: id, texto: t('proyectos.instrucciones') }),
    el('p', { class: 'ayuda', texto: t('proyectos.instrucciones.ayuda') }),
    area, contador,
    conEjemplos ? el('details', { class: 'ejemplos' },
      el('summary', { texto: t('proyectos.ejemplos') }),
      ['proyectos.ejemplo.1', 'proyectos.ejemplo.2', 'proyectos.ejemplo.3'].map(claveEjemplo => el('div', { class: 'ejemplo' },
        el('p', { texto: t(claveEjemplo) }),
        el('button', {
          type: 'button',
          class: 'secundario',
          texto: t('proyectos.usar_ejemplo'),
          onclick: () => {
            // Lo que la persona ya escribió no se pierde sin preguntarle.
            if (area.value.trim() && area.value.trim() !== t(claveEjemplo) && !confirm(t('proyectos.reemplazar_texto'))) return;
            area.value = t(claveEjemplo);
            borrador(clave, area.value);
            area.dispatchEvent(new Event('input'));
            area.focus();
          },
        })))) : null,
    el('button', { type: 'submit', class: 'grande con-icono' }, icono('chispa'), el('span', { texto: textoBoton })),
    mensaje);
  alEnviar(formulario, mensaje, async () => alMandar(area.value));
  return formulario;
}

// Cada proyecto, como una tarjeta: su dibujo grande, el nombre, el estado en color y 2 o 3 pastillas (a quién y dónde).
// Sin frases: el siguiente paso se ve al abrirlo (y VoiceOver lo lee aquí).
function filaProyecto(p, puedeEscribir) {
  const v = visualDeEstado(p);
  const x = p.vistazo || null;
  const pastillas = [];
  if (x) {
    if (p.tipo !== 'laboral') {
      for (const s of x.sectores.slice(0, 2)) pastillas.push(pastilla(s === 'todas' ? t('creador.sectores.todas') : nombreSector(s), iconoSector(s)));
      if (!pastillas.length && x.sectoresLibres[0]) pastillas.push(pastilla(x.sectoresLibres[0], 'edificio'));
    }
    const lugar = x.paisCompleto ? t('valor.pais_completo') : x.zonas[0] ? nombreZona(x.zonas[0]) : x.zonasLibres[0];
    if (lugar) pastillas.push(pastilla(lugar, x.paisCompleto ? 'mapa' : 'lugar'));
  }
  return el('a', { class: `proyecto-fila tono-${v.tono}`, href: `#proyecto/${p.id}` },
    ilustracionProyecto(p.tipo, x ? sectorPrincipal({ tipo: p.tipo, sectores: x.sectores }) : null, 'mediana'),
    el('span', { class: 'proyecto-fila-cuerpo' },
      el('span', { class: 'nombre', texto: p.nombre }),
      el('span', { class: 'etiquetas' }, etiquetaEstado(p),
        p.versionPendiente && p.estado !== 'pendiente' && !p.enPapelera ? el('span', { class: 'insignia tono-atencion' }, icono('reloj', 'icono chico'), el('span', { texto: t('proyectos.cambios_pendientes') })) : null),
      pastillas.length ? el('span', { class: 'pastillas' }, pastillas.slice(0, 3)) : null,
      el('span', { class: 'solo-lectores', texto: `${t(`tipo.${p.tipo}`)}. ${t('siguiente.titulo')}: ${siguientePaso(p, { escribe: puedeEscribir })}` })),
    icono('flecha', 'icono proyecto-fila-flecha'));
}

async function pantallaProyectos() {
  const vigente = nuevoTurno();
  let r;
  try {
    // El catálogo (solo la primera vez) y los datos, a la vez.
    [, r] = await Promise.all([cargarCatalogo(), api('GET', '/api/proyectos')]);
    if (!r.ok) throw new Error(textoError(r.datos.error));
  } catch (error) {
    if (vigente()) mostrar(marco('proyectos', tarjetaError(error.message)));
    return;
  }
  if (!vigente()) return;
  const { proyectos, limite, usados, puedeEscribir } = r.datos;
  const activos = proyectos.filter(p => !p.enPapelera);
  const papelera = proyectos.filter(p => p.enPapelera);

  const fila = p => filaProyecto(p, puedeEscribir);

  let nuevo;
  if (!puedeEscribir) nuevo = el('p', { class: 'aviso', texto: t('proyectos.solo_lectura') });
  else if (usados >= limite) nuevo = el('p', { class: 'aviso', texto: t('error.limite_de_proyectos') });
  else nuevo = el('a', { class: 'boton-enlace grande con-icono', href: '#nuevo' }, icono('mas'), el('span', { texto: t('proyectos.nuevo') }));

  // Cuántos hay en cada estado, de un vistazo (solo los que tienen alguno).
  const cuenta = new Map();
  for (const p of activos) {
    const llave = p.versionPendiente ? 'pendiente' : p.estado;
    cuenta.set(llave, (cuenta.get(llave) ?? 0) + 1);
  }
  const resumenEstados = activos.length ? el('div', { class: 'conteo-estados' },
    ['pendiente', 'en_ejecucion', 'borrador', 'pausado', 'completado', 'con_errores'].filter(e => cuenta.get(e)).map(e => {
      const v = visualDeEstado({ estado: e, tipo: 'comercial' });
      return el('span', { class: `insignia tono-${v.tono}` }, icono(v.nombreIcono, 'icono chico'),
        el('span', { texto: `${numero(cuenta.get(e))} · ${e === 'en_ejecucion' ? t('proyectos.conteo.aprobados') : t(`estado.${e}`)}` }));
    })) : null;

  mostrar(marco('proyectos',
    el('section', { class: 'tarjeta cabecera-pantalla' },
      el('h1', { texto: t('proyectos.titulo') }),
      el('p', { class: 'suave', texto: t('proyectos.usados', { usados, limite }) }),
      el('div', { class: 'medidor-proyectos' }, barra(usados, limite, usados >= limite ? 'atencion' : 'info')),
      resumenEstados,
      nuevo),
    el('section', { class: 'tarjeta' },
      el('h2', { texto: t('proyectos.lista') }),
      activos.length ? el('div', { class: 'lista-proyectos' }, activos.map(fila)) : el('p', { class: 'suave', texto: t('proyectos.vacio') })),
    el('section', { class: 'tarjeta nota' },
      el('p', { class: 'con-icono-arriba' }, icono('candado'), el('span', { texto: t('proyectos.aviso_fase.corto') })),
      el('details', { class: 'en-palabras' }, el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: t('proyecto.mas_info') })),
        el('p', { texto: t('proyectos.aviso_fase') }))),
    papelera.length ? el('section', { class: 'tarjeta' },
      el('details', {},
        el('summary', { class: 'con-icono' }, icono('papelera'), el('span', { texto: t('proyectos.papelera', { n: papelera.length }) })),
        el('p', { class: 'suave', texto: t('proyectos.papelera.texto') }),
        el('div', { class: 'lista-proyectos' }, papelera.map(fila)))) : null));
}

// Crear un proyecto: tocando (lo normal) o escribiéndolo con sus palabras.
let modoNuevo = 'toques';
async function pantallaNuevo(textoInicial = null) {
  const vigente = nuevoTurno();
  let r;
  try {
    // El catálogo (solo la primera vez) y los datos, a la vez.
    [, r] = await Promise.all([cargarCatalogo(), api('GET', '/api/proyectos')]);
    if (!r.ok) throw new Error(textoError(r.datos.error));
  } catch (error) {
    if (vigente()) mostrar(marco('proyectos', tarjetaError(error.message)));
    return;
  }
  if (!vigente()) return;
  const { limite, usados, puedeEscribir } = r.datos;
  const volver = el('p', {}, el('a', { href: '#proyectos', class: 'volver con-icono' }, el('span', { texto: t('proyecto.volver') })));
  if (!puedeEscribir || usados >= limite) {
    mostrar(marco('proyectos', el('section', { class: 'tarjeta' }, volver, el('h1', { texto: t('proyectos.nuevo') }),
      el('p', { class: 'aviso', texto: t(!puedeEscribir ? 'proyectos.solo_lectura' : 'error.limite_de_proyectos') }))));
    return;
  }
  // Lo que pasa al crear: igual por los dos caminos.
  const crearCon = async instrucciones => {
    const creado = await api('POST', '/api/proyectos', { instrucciones });
    if (!creado.ok) throw new Error(textoError(creado.datos.error));
    // Cada camino borra solo su borrador (el creador con toques borra el suyo al terminar): lo escrito a mano no se pierde
    // por crear tocando.
    if (modoNuevo === 'texto') borrador('nuevo', '');
    // El proyecto se dibuja con lo que respondió el servidor (sin pedirlo otra vez) y el botón queda apagado:
    // así un segundo toque no puede crear otro.
    if (!vigente()) return MANTENER;
    history.pushState(null, '', `#proyecto/${creado.datos.proyecto.id}`);
    turno++;
    dibujarProyecto(creado.datos, t(creado.datos.repetido ? 'proyecto.listo.repetido' : 'proyecto.listo.creado'));
    return MANTENER;
  };
  const lugar = el('div', {});
  const conmutador = grupoDeBotones([['toques', t('creador.modo.toques')], ['texto', t('creador.modo.texto')]], modoNuevo, (valor, marcar) => {
    modoNuevo = valor;
    marcar();
    dibujarModo();
  });
  conmutador.classList.add('conmutador');
  function dibujarModo(texto = null) {
    if (modoNuevo === 'toques') {
      lugar.replaceChildren(crearCreador({
        claveBorrador: 'nuevo-toques',
        textoBoton: t('creador.crear'),
        alMandar: crearCon,
        alEscribir: frase => {
          const escrito = borrador('nuevo');
          if (escrito && escrito.trim() && escrito.trim() !== frase && !confirm(t('creador.reemplazar_escrito'))) return;
          modoNuevo = 'texto';
          conmutador.querySelectorAll('button').forEach(b => {
            const marcado = b.textContent === t('creador.modo.texto');
            b.className = marcado ? '' : 'secundario';
            b.setAttribute('aria-pressed', marcado ? 'true' : 'false');
          });
          dibujarModo(frase);
          lugar.querySelector('textarea')?.focus();
        },
      }));
    } else {
      lugar.replaceChildren(formularioTextoLibre({ id: 'campo-instrucciones', clave: 'nuevo', inicial: texto, textoBoton: t('proyectos.crear'), alMandar: crearCon }));
    }
  }
  dibujarModo(textoInicial);
  mostrar(marco('proyectos',
    el('section', { class: 'tarjeta cabecera-pantalla' }, volver,
      el('h1', { texto: t('proyectos.nuevo') }),
      el('p', { class: 'suave', texto: t('creador.texto') }),
      conmutador),
    el('section', { class: 'tarjeta' }, lugar)));
}

async function pantallaProyecto(id) {
  const vigente = nuevoTurno();
  let r;
  try {
    [, r] = await Promise.all([cargarCatalogo(), api('GET', `/api/proyectos/${encodeURIComponent(id)}`)]);
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
    crecer(el('textarea', { id: id('prioridades'), name: 'prioridades', rows: 3, texto: c.prioridades.join('\n'), placeholder: t('formulario.prioridades.ejemplo') })),
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
    el('h2', { class: 'con-icono' }, icono('ojo'), el('span', { texto: t('proyecto.pendiente.titulo', { numero: v.numero }) })),
    el('p', { class: 'suave', texto: subtitulo }),
    // Antes de la primera aprobación se dice qué pasa al aprobar: queda guardado, pero todavía no busca (corto aquí;
    // la explicación completa, en «Ver en palabras»).
    !esCambio ? el('p', { class: 'linea-fase con-icono' }, icono('candado'), el('span', { texto: avisoCortoAntesDeAprobar(c.tipo) })) : null,
  ];
  // Lo que falta y lo que el motor no entendió se pregunta; mientras tanto no se puede aprobar.
  const dudasVersion = Array.isArray(v.dudas) ? v.dudas : [];
  const preguntas = v.faltantes.filter(f => f !== 'dudas').map(f => t(f === 'producto' ? `faltante.producto.${c.tipo}` : `faltante.${f}`));
  const noEntendi = dudasVersion.map(textoDuda);
  if (v.faltantes.includes('dudas') && !noEntendi.length) noEntendi.push(t('faltante.dudas'));
  const idExplicacion = `explicacion-${v.numero}`;
  if (preguntas.length || noEntendi.length) {
    partes.push(el('div', { class: 'aviso dudas', id: idExplicacion },
      el('p', { class: 'dudas-titulo con-icono' }, icono('atencion'), el('span', { texto: t('proyecto.dudas.titulo') })),
      lector ? el('p', { texto: t('proyecto.preguntas.lector', { n: preguntas.length + noEntendi.length }) }) : [
        preguntas.length ? [el('p', { texto: t('proyecto.preguntas') }), el('ul', {}, preguntas.map(p => el('li', { texto: p })))] : null,
        noEntendi.length ? [el('p', { texto: t('proyecto.no_entendi') }), el('ul', {}, noEntendi.map(p => el('li', { texto: p })))] : null,
        el('p', { texto: t('proyecto.no_se_puede_aprobar') }),
        abrirFormulario && escribe ? el('button', { type: 'button', class: 'secundario con-icono', onclick: abrirFormulario }, icono('lapiz'), el('span', { texto: t('proyecto.responder') })) : null,
      ]));
  }
  partes.push(resumenVisual(c));
  // Lo que OPORTIA decidió sola: a la vista cuántas cosas, y cuáles al tocar.
  if (v.supuestos.length) {
    partes.push(el('details', { class: 'supuestos' },
      el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: t('proyecto.supuestos.resumen', { n: v.supuestos.length }) })),
      el('p', { class: 'suave', texto: lector ? t('proyecto.supuestos.lector') : t('proyecto.supuestos') }),
      el('ul', {}, v.supuestos.map(s => el('li', { class: 'suave', texto: t(`supuesto.${s}`) })))));
  }
  partes.push(enPalabras(c, !esCambio ? el('p', { class: 'aviso', texto: avisoAntesDeAprobar(c.tipo) }) : null));
  if (escribe) {
    const motivo = crecer(el('textarea', { id: 'campo-motivo', rows: 2, maxlength: 300, placeholder: t('proyecto.motivo.ejemplo') }));
    const claveMotivo = `motivo|${proyecto.id}|${v.numero}`;
    const motivoRecuperado = recordarTexto(motivo, claveMotivo);
    const bloqueado = v.faltantes.length > 0;
    const aprobar = botonAccion(t(esCambio ? 'proyecto.aprobar.cambio' : 'proyecto.aprobar.primera'), bloqueado ? 'bloqueado grande' : 'grande', mensaje, async () => {
      await pedirYMostrar('POST', `/api/proyectos/${proyecto.id}/versiones/${v.numero}/aprobar`, {}, t(esCambio ? 'proyecto.listo.aprobada' : 'proyecto.listo.aprobada.primera', { numero: v.numero }));
    }, bloqueado ? 'candado' : 'marca');
    // Mientras falte algo, el botón no se puede tocar; VoiceOver lee por qué (las preguntas de arriba).
    if (bloqueado) {
      aprobar.disabled = true;
      aprobar.setAttribute('aria-describedby', idExplicacion);
    }
    partes.push(
      el('div', { class: 'botones' }, aprobar),
      el('details', { class: 'rechazar', open: motivoRecuperado },
        el('summary', { class: 'con-icono' }, icono('prohibido'), el('span', { texto: t('proyecto.rechazar') })),
        el('label', { for: 'campo-motivo', texto: t('proyecto.motivo') }),
        motivo,
        botonAccion(t('proyecto.rechazar.boton', { numero: v.numero }), 'peligro', mensaje, async () => {
          await pedirYMostrar('POST', `/api/proyectos/${proyecto.id}/versiones/${v.numero}/rechazar`, { motivo: motivo.value }, t('proyecto.listo.rechazada', { numero: v.numero }));
          borrador(claveMotivo, '');
        }, 'prohibido')),
      mensaje);
  }
  return el('section', { class: 'tarjeta pendiente' }, partes);
}

// Un aviso arriba del proyecto: texto (sale bien) o { texto, clase } (por ejemplo, «esto cambió en otro equipo»).
function avisoDeArriba(aviso) {
  if (!aviso) return null;
  const { texto, clase } = typeof aviso === 'string' ? { texto: aviso, clase: 'bien' } : aviso;
  return el('p', { class: `${clase === 'aviso' ? 'aviso' : 'mensaje bien'} aviso-arriba con-icono`, role: 'status', 'data-foco': true },
    icono(clase === 'aviso' ? 'atencion' : 'bien'), el('span', { texto }));
}

function dibujarProyecto(d, aviso = null) {
  const { proyecto: p, activa, pendiente, versiones, historial, puedeEscribir = true } = d;
  // Lo que solo el dueño puede hacer (papelera, completar, reabrir): a quien no puede, no se le muestra el botón.
  const permisos = d.permisos || { escribir: puedeEscribir, papelera: puedeEscribir, completar: puedeEscribir };
  const mensaje = caja();
  const base = pendiente || activa || versiones.find(v => v.completa !== false) || versiones[0];
  const escribe = puedeEscribir && !p.enPapelera;

  // La explicación larga del estado va en «Ver en palabras» (el estado ya se ve en color, con la pista de pasos).
  // Un error sí se ve siempre: dice qué pasó.
  const errorVisible = !p.enPapelera && p.estado === 'con_errores';
  const avisoEstado = p.enPapelera ? t('proyecto.en_papelera')
    : p.estado === 'con_errores' ? t('proyecto.error', { motivo: p.motivoError || t('valor.falta') })
      : p.estado === 'en_ejecucion' ? t(`proyecto.aviso_espera.${p.tipo}`)
        : p.estado === 'borrador' ? `${t('proyecto.aviso_borrador')} ${avisoAntesDeAprobar(p.tipo)}`
          : p.estado === 'pausado' ? t('proyecto.aviso_pausado')
            : pendiente && !activa ? avisoAntesDeAprobar(p.tipo) : null;
  const ICONO_ACCION = { pausar: 'pausa', completar: 'bandera', reanudar: 'play', reabrir: 'actualizar', reintentar: 'actualizar' };

  const acciones = [];
  if (escribe) {
    const disponibles = { en_ejecucion: ['pausar', 'completar'], pausado: ['reanudar', 'completar'], completado: ['reabrir'], con_errores: ['reintentar', 'pausar'] }[p.estado] || [];
    for (const accion of disponibles.filter(a => permisos.completar || (a !== 'completar' && a !== 'reabrir'))) {
      acciones.push(botonAccion(t(`accion.${accion}`), 'secundario', mensaje, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/estado`, { accion }, x => t('proyecto.listo.estado', { estado: nombreDeEstado(x.proyecto) })), ICONO_ACCION[accion] || 'flecha'));
    }
  }

  const nombre = el('input', { id: 'campo-nombre-proyecto', type: 'text', value: p.nombre, maxlength: 80, autocomplete: 'off' });
  // La versión que espera se arma antes, para que «Siguiente paso» pueda llevar hasta ella.
  const tarjetaPendiente = pendiente ? tarjetaVersion(pendiente, { proyecto: p, activa, puedeEscribir, abrirFormulario: () => abrirFormulario?.() }) : null;
  const botonesEstado = acciones.length ? el('div', { class: 'botones' }, acciones) : null;
  // Arriba, el dibujo del proyecto (su tipo y su negocio principal), el nombre y el estado de un vistazo.
  const configVista = (activa || pendiente || base)?.configuracion;
  const cabecera = el('section', { class: 'tarjeta proyecto-cabeza' },
    el('p', { class: 'volver-linea' }, el('a', { href: '#proyectos', class: 'volver', texto: t('proyecto.volver') })),
    avisoDeArriba(aviso),
    el('div', { class: 'proyecto-titulo' },
      ilustracionProyecto(p.tipo, sectorPrincipal(configVista), 'grande'),
      el('div', { class: 'proyecto-titulo-texto' },
        el('h1', { texto: p.nombre }),
        el('p', { class: 'etiquetas' }, etiquetaTipo(p.tipo),
          p.versionActiva ? el('span', { class: 'etiqueta', texto: t('proyecto.version_en_uso', { numero: p.versionActiva }) }) : null))),
    tarjetaEstado(p, { pendiente, escribe: puedeEscribir, destino: p.enPapelera ? null : tarjetaPendiente || botonesEstado }),
    errorVisible ? el('p', { class: 'aviso', texto: avisoEstado }) : null,
    !errorVisible && avisoEstado ? el('details', { class: 'en-palabras' },
      el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: t('proyecto.mas_info') })),
      el('p', { texto: avisoEstado })) : null,
    !puedeEscribir ? el('p', { class: 'suave con-icono' }, icono('ojo', 'icono chico'), el('span', { texto: t('proyectos.solo_lectura') })) : null,
    botonesEstado,
    escribe ? el('details', {},
      el('summary', { class: 'con-icono' }, icono('lapiz'), el('span', { texto: t('proyecto.renombrar') })),
      el('label', { for: 'campo-nombre-proyecto', texto: t('proyecto.nombre') }),
      nombre,
      botonAccion(t('proyecto.guardar_nombre'), 'secundario', mensaje, () =>
        pedirYMostrar('POST', `/api/proyectos/${p.id}/nombre`, { nombre: nombre.value }, t('proyecto.listo.nombre')), 'marca')) : null,
    mensaje);

  const enUso = activa ? el('section', { class: 'tarjeta' },
    el('details', { open: !pendiente },
      el('summary', { class: 'con-icono' }, icono('bien'), el('span', { texto: t('proyecto.activa.titulo', { numero: activa.numero }) })),
      resumenVisual(activa.configuracion),
      enPalabras(activa.configuracion))) : null;

  let modificar = null;
  let detallesCampos = null;
  let abrirFormulario = null;
  if (escribe) {
    const mensajeModificar = caja();
    const area = crecer(el('textarea', { id: 'campo-reinterpretar', rows: 5, maxlength: 4000, texto: base.instrucciones, placeholder: t('proyectos.instrucciones.ejemplo') }));
    const claveArea = `reescribir|${p.id}`;
    const recuperado = recordarTexto(area, claveArea);
    // Si lo que está ahora se cambió a mano, «Volver a entender» lo reemplaza: se avisa antes, y se pregunta al tocar.
    const conCambiosAMano = base.origen === 'campos';
    detallesCampos = el('details', {},
      el('summary', { class: 'con-icono' }, icono('ajustes'), el('span', { texto: t('proyecto.modificar.campos') })),
      formularioCampos(base.configuracion, base.dudas, async campos => {
        await pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'campos', campos }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero }));
      }));
    // «Cambiar con toques»: el mismo creador de «Nuevo proyecto», con lo que está ahora ya marcado.
    // Lo que no cabe en los toques (exclusiones, prioridades, lugares escritos a mano…) se avisa antes de reemplazarlo.
    const { eleccion, quedaFuera } = eleccionDesde(base.configuracion, productoDe(base.configuracion), catalogo.combinaciones?.investigar_y_preparar,
      { objetivoPropio: Boolean(base.configuracion.objetivo) && objetivoEsPropio(base.configuracion) });
    const claveToques = `toques|${p.id}`;
    const detallesToques = el('details', { open: Boolean(borrador(claveToques)) },
      el('summary', { class: 'con-icono' }, icono('dedo'), el('span', { texto: t('proyecto.modificar.toques') })));
    detallesToques.append(crearCreador({
      inicial: eleccion,
      claveBorrador: claveToques,
      textoBoton: t('creador.guardar_version'),
      antes: [
        conCambiosAMano ? el('p', { class: 'aviso', texto: t('proyecto.reescribir.aviso') }) : null,
        quedaFuera.length ? el('p', { class: 'aviso', texto: t('creador.queda_fuera', { lista: unir(quedaFuera.map(x => t(`creador.fuera.${x}`))) }) }) : null,
      ],
      alMandar: async instrucciones => {
        if ((conCambiosAMano || quedaFuera.length) && !confirm(t('creador.confirmar_reemplazo'))) return;
        await pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'instrucciones', instrucciones }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero }));
        borrador(claveToques, '');
        return MANTENER;
      },
      alEscribir: frase => {
        area.value = frase;
        borrador(claveArea, frase);
        detallesTexto.open = true;
        area.dispatchEvent(new Event('input'));
        detallesTexto.scrollIntoView({ behavior: 'smooth', block: 'start' });
        area.focus({ preventScroll: true });
      },
    }));
    const detallesTexto = el('details', { open: recuperado },
        el('summary', { texto: t('proyecto.modificar.instrucciones') }),
        conCambiosAMano ? el('p', { class: 'aviso', texto: t('proyecto.reescribir.aviso') }) : null,
        el('label', { for: 'campo-reinterpretar', texto: t('proyectos.instrucciones') }),
        area,
        botonAccion(t('formulario.reinterpretar'), '', mensajeModificar, async () => {
          if (conCambiosAMano && !confirm(t('proyecto.reescribir.confirmar'))) return;
          await pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'instrucciones', instrucciones: area.value }, x => t('proyecto.listo.guardada', { numero: x.pendiente.numero }));
          borrador(claveArea, '');
        }, 'chispa'));
    detallesTexto.querySelector('summary').classList.add('con-icono');
    detallesTexto.querySelector('summary').prepend(icono('lapiz'));
    modificar = el('section', { class: 'tarjeta' },
      el('h2', { class: 'con-icono' }, icono('lapiz'), el('span', { texto: t('proyecto.modificar') })),
      el('p', { class: 'suave', texto: t('proyecto.modificar.corto') }),
      detallesToques,
      detallesTexto,
      detallesCampos,
      mensajeModificar);
  }
  // «Responder estas preguntas» abre el formulario y lleva hasta él.
  abrirFormulario = detallesCampos ? () => {
    detallesCampos.open = true;
    detallesCampos.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const primero = detallesCampos.querySelector('legend, label');
    const destino = detallesCampos.querySelector('summary');
    (destino || primero)?.focus({ preventScroll: true });
  } : null;

  // Las versiones viejas llegan sin su contenido (así el proyecto abre rápido); se abren una por una.
  const contenidoVersion = v => [
    el('p', { class: 'instrucciones', texto: v.instrucciones }),
    resumenVisual(v.configuracion),
    enPalabras(v.configuracion),
  ];
  const contenidoBajoPedido = v => {
    const lugar = el('div', {});
    const mensajeVersion = caja();
    lugar.append(botonAccion(t('version.ver'), 'secundario', mensajeVersion, async () => {
      const r = await api('GET', `/api/proyectos/${p.id}/versiones/${v.numero}`);
      if (!r.ok) throw new Error(textoError(r.datos.error));
      lugar.replaceChildren(...contenidoVersion(r.datos.version));
    }, 'ojo'), mensajeVersion);
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
        pedirYMostrar('POST', `/api/proyectos/${p.id}/versiones`, { modo: 'version', numero: v.numero }, x => t('proyecto.listo.copiada', { numero: x.pendiente.numero, desde: v.numero })), 'actualizar'),
      mensajeReusar);
  };
  const listaVersiones = el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, icono('fila'), el('span', { texto: t('proyecto.versiones') })),
    versiones.map(v => el('details', { class: 'version' },
      el('summary', { texto: t('version.linea', { numero: v.numero, estado: t(`version.estado.${v.estado}`), fecha: fecha(v.creadaEn) }) }),
      el('p', { class: 'suave', texto: t(`version.origen.${v.origen}`) }),
      v.motivo ? el('p', { class: 'suave', texto: t('version.motivo', { motivo: v.motivo }) }) : null,
      v.completa === false ? contenidoBajoPedido(v) : contenidoVersion(v),
      reusar(v))));

  const listaHistorial = el('section', { class: 'tarjeta' },
    el('details', {},
      el('summary', { class: 'con-icono' }, icono('reloj'), el('span', { texto: t('proyecto.historial') })),
      el('ul', { class: 'historial' }, historial.map(h => el('li', {},
        el('span', { texto: t(`historial.${h.accion}`, h.detalle || {}) }),
        el('span', { class: 'suave', texto: ` · ${fecha(h.fecha)}` }))))));

  const mensajePapelera = caja();
  const papelera = puedeEscribir && permisos.papelera ? el('section', { class: 'tarjeta' },
    p.enPapelera
      ? [el('p', { class: 'suave', texto: t('proyecto.restaurar.texto') }),
        botonAccion(t('proyectos.restaurar'), '', mensajePapelera, () =>
          pedirYMostrar('POST', `/api/proyectos/${p.id}/papelera`, { enPapelera: false }, t('proyecto.listo.restaurado')), 'actualizar')]
      : botonAccion(t('proyecto.papelera'), 'peligro', mensajePapelera, async () => {
        if (!confirm(t('proyecto.confirmar_papelera', { nombre: p.nombre }))) return;
        await pedirYMostrar('POST', `/api/proyectos/${p.id}/papelera`, { enPapelera: true }, t('proyecto.listo.papelera'));
      }, 'papelera'),
    mensajePapelera) : null;

  mostrar(marco('proyectos',
    cabecera,
    tarjetaPendiente,
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
  if (seccion === 'nuevo') return pantallaNuevo();
  const proyecto = seccion.match(/^proyecto\/(\d+)$/);
  if (proyecto) return pantallaProyecto(proyecto[1]);
  return pantallaInicio();
}

// Lo que la primera pantalla va a pedir (los mismos caminos que dibujar), para pedirlo al abrir junto con la cuenta
// y no después: por la red del teléfono eso es un viaje de ida y vuelta menos (150-400 ms). Si una pantalla pide
// algo más al empezar, va aquí también (test/archivos.test.js lo revisa).
function pedidosAlAbrir(seccion, admin) {
  if (seccion === 'configuracion') return ['/api/yo/reinicios'];
  // Quien no es administrador ve Inicio en #admin, pero casi nunca llega ahí: no se adelanta nada.
  if (seccion === 'admin') return admin ? ['/api/admin/usuarios', '/api/admin/sistema'] : [];
  if (seccion === 'proyectos' || seccion === 'nuevo') return ['/api/catalogo', '/api/proyectos'];
  const proyecto = seccion.match(/^proyecto\/(\d+)$/);
  if (proyecto) return ['/api/catalogo', `/api/proyectos/${encodeURIComponent(proyecto[1])}`];
  return ['/api/proyectos', '/api/catalogo', ...(admin ? ['/api/admin/sistema'] : [])];
}

// Si la última cuenta que abrió OPORTIA en este navegador era de administrador: solo para saber qué pedir por
// adelantado. Si se equivoca no pasa nada (lo que sobra se descarta y lo que falta se pide después).
function eraAdmin() {
  try { return localStorage.getItem('op_admin') === '1'; } catch { return false; }
}
function recordarAdmin(usuario) {
  try { localStorage.setItem('op_admin', usuario?.rol === 'admin' ? '1' : '0'); } catch { /* sin almacenamiento: no pasa nada */ }
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
  // Los textos, el estado del servidor y la cuenta se piden a la vez, no uno tras otro: por la red del teléfono
  // cada viaje de ida y vuelta cuesta 150-400 ms.
  const pedidoSetup = api('GET', '/api/setup');
  const pedidoYo = api('GET', '/api/yo');
  // Y lo que va a pedir la primera pantalla. Se descarta si no hay sesión, si hubo que esperar al servidor o si la
  // persona cambió de pantalla mientras tanto; después de la primera pantalla no queda nada guardado.
  const direccionAlAbrir = location.hash;
  for (const ruta of pedidosAlAbrir(direccionAlAbrir.replace('#', '') || 'inicio', eraAdmin())) adelantados.set(ruta, pedirAlServidor('GET', ruta));
  try {
    await cargarIdioma(preferido === 'en' ? 'en' : 'es');
  } catch {
    adelantados.clear();
    return pantallaNoArranco();
  }
  mostrar(el('p', { class: 'cargando', texto: t('app.cargando') }));
  let setup = await pedidoSetup;
  // Justo después de un reinicio, el servidor dice «arrancando» por un momento: se espera (hasta 60 s) en vez
  // de mostrar un error.
  let intento = 0;
  for (; !setup.ok && setup.datos?.error === 'arrancando' && intento < 60; intento += 1) {
    mostrar(el('p', { class: 'cargando', texto: t('app.arrancando') }));
    await new Promise(listo => setTimeout(listo, 1000));
    setup = await api('GET', '/api/setup');
  }
  estado.setup = setup.datos;
  if (!setup.ok) {
    adelantados.clear();
    return pantallaNoArranco(textoError(setup.datos.error || 'error_interno'));
  }
  // Si hubo que esperar al servidor, la cuenta se vuelve a pedir (la primera respuesta puede ser vieja).
  const yo = intento ? await api('GET', '/api/yo') : await pedidoYo;
  if (yo.ok) {
    estado.usuario = yo.datos.usuario;
    recordarAdmin(estado.usuario);
    avisosCuenta = leerAvisos(yo.datos);
    if (estado.usuario.idioma !== idioma) await cargarIdioma(estado.usuario.idioma);
  }
  if (!yo.ok || intento || location.hash !== direccionAlAbrir) adelantados.clear();
  // La primera pantalla toma lo pedido por adelantado al empezar a dibujarse (sus pedidos salen enseguida, antes
  // de esperar nada); lo que no usó se descarta, así ninguna pantalla de después recibe datos viejos.
  const primera = dibujar();
  adelantados.clear();
  await primera;
}

window.addEventListener('hashchange', () => { if (estado.usuario) dibujar(); });
iniciar().catch(() => pantallaNoArranco());
