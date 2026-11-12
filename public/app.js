// OPORTIA: pantallas (sin librerías). Todo texto se pone con textContent: nunca se interpreta como código.
import { ICONOS_PROYECTO, ICONOS_SERVICIOS } from './dibujos.js';
import {
  ATRIBUTOS_CAMPO_CLAVE, MARCAS_GASTO, partesBarraGasto, controlesProveedores, estadoDeClave, nombreModelo, leerDolares,
  textoUsd, cosasParaEncender, apagarProveedorApagaIa,
} from './ia-vista.js';
import {
  vistaCopias, vistaDisco, motivoBase, razonNoClave, TONO_COPIA, ICONO_TONO, vistaAzulejoCopias, vistaAzulejoTelegram, vistaTelegram,
  codigoLegible, cuentaAtras, enlaceSeguro, fraseMotivoTareaCopia,
} from './copias-vista.js';
import { leerClave, verificadorDe, grupoDistinto, gruposDeClave, sobraNombreCorto } from './clave-recuperacion.js';
import { TEMAS_AYUDA, TEMAS_CON_EJEMPLO, pasosAdmin, pasosAcademia, resumenGuia, buscarTemas } from './guia.js';
import { partirLeccion, resaltar, pareceIngles } from './tarjetas.js';
import { leccionDeVideo } from './academia-video.js';
import { sonar, sonidosEncendidos, encenderSonidos, prepararSonidos, ponerUsuario as ponerUsuarioSonidos } from './sonidos.js';
import { dibujarAvatar } from './avatares.js';

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
const MANTENER = Symbol('mantener');
// Academia (0.7.0): los proyectos de OPORTIA quedan escondidos (sin enlaces ni botones); su código sigue para después.
const TEMAS_DE_PROYECTOS = ['proyecto', 'entendi', 'duda', 'aprobar', 'version', 'autonomia', 'papelera', 'fase', 'plan']; // un formulario que devuelve esto deja su botón apagado (ya se fue a otra pantalla)

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

// 0.8.0: lo ya cargado queda en memoria (solo en esta pestaña, nunca en el disco) y la pantalla se dibuja enseguida con
// eso; a la vez se pide de nuevo y, si cambió, la pantalla se vuelve a dibujar sola (sin moverse de donde estaba).
// Solo las lecturas de la academia y de Administrador; nunca un intento (las preguntas que se responden). Cualquier
// cambio (POST) lo vacía y vuelve a pedir el camino, y se vacía al salir o al cambiar de cuenta.
const EN_MEMORIA = /^\/api\/(?:academia\/(?:camino|progreso|temas\/[^/]+\/[^/]+|video\/[^/]+)|admin\/(?:academia(?:\/alumnos(?:\/\d+(?:\/ficha|\/intentos\/\d+)?)?|\/respuestas|\/comparar\/[\d,]+)?|sistema|usuarios|ia|copias|claves)|yo\/(?:reinicios|perfil))$/;
const FRESCO_MS = 2500;
const memoria = new Map(); // ruta -> { respuesta, en, usuario }
const enCamino = new Map(); // ruta -> pedido que ya salió (no se pide dos veces lo mismo)
let repintarEnFondo = false;
function vaciarMemoria() { memoria.clear(); }
function pedirYGuardar(ruta) {
  if (enCamino.has(ruta)) return enCamino.get(ruta);
  const de = estado.usuario?.id ?? null;
  const p = pedirAlServidor('GET', ruta).then(r => {
    enCamino.delete(ruta);
    if (r.ok && de != null && de === estado.usuario?.id) memoria.set(ruta, { respuesta: r, en: Date.now(), usuario: de });
    return r;
  });
  enCamino.set(ruta, p);
  return p;
}
// Adelantar algo que la persona seguramente abre después (el próximo tema, el progreso): sin esperar, sin dibujar.
function adelantar(ruta) {
  if (!EN_MEMORIA.test(ruta) || !estado.usuario) return;
  const g = memoria.get(ruta);
  if (!g || Date.now() - g.en > FRESCO_MS) pedirYGuardar(ruta);
}
function deMemoria(ruta) {
  const g = memoria.get(ruta);
  if (!g || g.usuario !== estado.usuario?.id) return null;
  // Recién llegado (es el redibujo que pidió este mismo refresco, o un pedido de hace un instante): no se vuelve a preguntar.
  if (!repintarEnFondo && Date.now() - g.en > 300) {
    // Se dibuja con lo guardado y se pregunta al servidor; si cambió y la persona sigue en la misma pantalla (que no sea
    // una de estudio, donde no se interrumpe), se vuelve a dibujar.
    const direccion = location.hash;
    const vez = turno;
    pedirYGuardar(ruta).then(r => {
      // Si ya no se puede (la sesión terminó, la cuenta se apagó…), se olvida lo guardado y se hace lo mismo que api().
      if (!r.ok) { memoria.delete(ruta); revisarSesion(r, ruta); return; }
      // El estado del sistema cambia a cada rato (horas, latidos): se guarda, pero no redibuja la pantalla por sí solo.
      if (ruta === '/api/admin/sistema' || JSON.stringify(r.datos) === JSON.stringify(g.respuesta.datos)) return;
      if (location.hash !== direccion || turno !== vez || document.body.classList.contains('modo-estudio') || formularioEnUso()) return;
      repintarEnFondo = true;
      dibujar();
    });
  }
  return structuredClone(g.respuesta);
}

// ¿Hay algo a medio hacer en la pantalla (escribiendo, archivos elegidos, una ventana abierta)? Entonces no se redibuja.
function formularioEnUso() {
  const activo = document.activeElement;
  if (activo && raiz.contains(activo) && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)) return true;
  if (document.querySelector('dialog[open]')) return true;
  return [...raiz.querySelectorAll('input, textarea')].some(x => (x.type === 'file' ? x.files?.length > 0 : x.value !== x.defaultValue));
}

// fresco: true para lo que se pregunta cada tanto (la zona del sistema, una copia en marcha): nunca de la memoria.
async function api(metodo, ruta, datos, { fresco = false } = {}) {
  const adelantado = metodo === 'GET' && datos === undefined ? adelantados.get(ruta) : undefined;
  if (adelantado) adelantados.delete(ruta);
  const guardable = metodo === 'GET' && datos === undefined && EN_MEMORIA.test(ruta) && !fresco;
  if (!guardable && metodo !== 'GET') vaciarMemoria();
  const guardada = guardable && !adelantado ? deMemoria(ruta) : null;
  if (guardada) return guardada;
  const respuesta = await (adelantado ?? (guardable ? pedirYGuardar(ruta) : pedirAlServidor(metodo, ruta, datos)));
  if ((fresco || (adelantado && guardable)) && respuesta.ok && estado.usuario && EN_MEMORIA.test(ruta)) memoria.set(ruta, { respuesta, en: Date.now(), usuario: estado.usuario.id });
  if (metodo !== 'GET' && /^\/api\/academia\//.test(ruta) && /\/(?:terminar|plan|visto|leido|grupo)$/.test(ruta)) adelantar('/api/academia/camino');
  revisarSesion(respuesta, ruta);
  return respuesta;
}

// Si la sesión terminó (por ejemplo, se cambió la contraseña en otro equipo), se vuelve a la pantalla de entrar.
function revisarSesion(respuesta, ruta) {
  const error = respuesta.datos?.error;
  if (error === 'no_has_entrado' || error === 'demasiados_intentos_clave') vaciarMemoria();
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
  // 0.8.0: al volver a dibujar en el fondo (llegó algo nuevo del servidor) no se mueve la página ni el foco.
  const enFondo = repintarEnFondo;
  repintarEnFondo = false;
  const y = window.scrollY;
  // Las partes que no aplican llegan como null: no se muestran.
  raiz.replaceChildren(...contenido.flat(Infinity).filter(parte => parte != null && parte !== false));
  if (enFondo) {
    document.body.classList.toggle('modo-estudio', Boolean(raiz.querySelector(':scope > .inmersivo')));
    window.scrollTo(0, y);
    return true;
  }
  // 0.7.2: las pantallas de estudio (lección, video, preguntas) ocupan toda la pantalla, sin el menú de abajo.
  document.body.classList.toggle('modo-estudio', Boolean(raiz.querySelector(':scope > .inmersivo')));
  document.querySelectorAll('body > .figura-grande').forEach(x => x.remove());
  document.body.style.paddingBottom = '';
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

// ---------- Claridad (0.5.1): la línea de cada pantalla, «¿Qué es esto?», listas vacías que enseñan y avisos cortos ----------
// Debajo del título de cada pantalla o pestaña: para qué sirve, en una línea corta.
function entrada(texto) {
  return el('p', { class: 'entrada', texto });
}

// «¿Qué es esto?»: un botón (i) junto a un título o una palabra. Al tocarlo se abre una hoja con la explicación en
// palabras sencillas (abajo en el teléfono, al centro en la PC). «Entendido», Escape o tocar fuera la cierran, y el
// foco vuelve al botón. Los textos están en ayuda.<tema>.* y todos se ven juntos en la pantalla Ayuda (#ayuda).
let hojaAyuda = null;
function cerrarAyuda() {
  if (hojaAyuda) hojaAyuda.close();
}
function ejemploDeAyuda(tema) {
  return TEMAS_CON_EJEMPLO.includes(tema) ? el('p', { class: 'ayuda-ejemplo' }, el('strong', { texto: `${t('ayuda.ejemplo')} ` }), el('span', { texto: t(`ayuda.${tema}.ejemplo`) })) : null;
}
function abrirAyuda(tema, boton = null) {
  cerrarAyuda();
  const hoja = el('dialog', { class: 'hoja-ayuda', 'aria-labelledby': 'hoja-ayuda-titulo' });
  hoja.append(el('div', { class: 'hoja-ayuda-dentro' },
    el('div', { class: 'hoja-ayuda-cabeza' }, el('span', { class: 'hoja-ayuda-icono' }, icono('info')), el('h2', { id: 'hoja-ayuda-titulo', texto: t(`ayuda.${tema}.titulo`) })),
    el('p', { class: 'hoja-ayuda-texto', texto: t(`ayuda.${tema}.texto`) }),
    ejemploDeAyuda(tema),
    el('div', { class: 'hoja-ayuda-botones' },
      el('button', { type: 'button', class: 'grande', autofocus: true, texto: t('ayuda.entendido'), onclick: () => hoja.close() }),
      location.hash === '#ayuda' ? null : el('a', { class: 'boton-enlace secundario con-icono', href: '#ayuda', onclick: () => hoja.close() }, icono('info'), el('span', { texto: t('ayuda.ver_toda') })))));
  // Tocar fuera de la hoja (el fondo oscuro) también la cierra.
  hoja.addEventListener('click', evento => { if (evento.target === hoja) hoja.close(); });
  hoja.addEventListener('close', () => {
    hoja.remove();
    if (hojaAyuda === hoja) hojaAyuda = null;
    if (boton) boton.setAttribute('aria-expanded', 'false');
    // El botón pudo volver a dibujarse mientras tanto (la zona de sistema se actualiza sola): se busca el de ahora.
    const vuelve = boton?.isConnected ? boton : raiz.querySelector(`button.que-es[data-ayuda="${tema}"]`);
    if (vuelve) { try { vuelve.focus({ preventScroll: true }); } catch { vuelve.focus(); } }
  });
  document.body.append(hoja);
  hojaAyuda = hoja;
  if (boton) boton.setAttribute('aria-expanded', 'true');
  if (typeof hoja.showModal === 'function') hoja.showModal();
  else {
    // Un navegador muy viejo, sin <dialog>: la hoja se ve igual y «Entendido» la cierra.
    hoja.close = () => hoja.dispatchEvent(new Event('close'));
    hoja.setAttribute('open', '');
  }
}
// conTexto: el botón lleva también el nombre de la palabra («(i) Clave de recuperación»), para la fila de palabras.
function queEs(tema, { conTexto = false } = {}) {
  const nombre = t(`ayuda.${tema}.titulo`);
  const boton = el('button', {
    type: 'button', class: conTexto ? 'que-es con-texto' : 'que-es', 'data-ayuda': tema, 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    'aria-label': t('ayuda.que_es', { que: nombre }),
    onclick: evento => { evento.preventDefault(); evento.stopPropagation(); abrirAyuda(tema, boton); },
  }, icono('info'), conTexto ? el('span', { texto: nombre }) : null);
  return boton;
}
// Las palabras de una pantalla que se pueden tocar para leer qué significan (una fila que se desliza de lado).
function palabras(temas) {
  return el('div', { class: 'palabras', role: 'group', 'aria-label': t('ayuda.palabras') }, temas.map(tema => queEs(tema, { conTexto: true })));
}

// Una lista vacía que enseña: un dibujo, una línea y (si se puede) el botón para empezar.
function vacio(nombreIcono, texto, accion = null, clase = '') {
  return el('div', { class: `vacio ${clase}`.trim() }, el('span', { class: 'vacio-icono' }, icono(nombreIcono)), el('p', { class: 'vacio-texto', texto }), accion);
}

// Un aviso corto que se ve abajo unos segundos (y lo lee VoiceOver): qué pasó después de una acción, o qué hacer si falló.
let cajaAvisos = null;
function avisar(texto, tono = 'bien') {
  if (!cajaAvisos?.isConnected) {
    cajaAvisos = el('div', { class: 'avisos-flotantes', role: 'status', 'aria-live': 'polite' });
    document.body.append(cajaAvisos);
  }
  const aviso = el('div', { class: `aviso-flotante tono-${tono}`, role: tono === 'mal' ? 'alert' : null },
    icono(tono === 'mal' ? 'mal' : tono === 'bien' ? 'bien' : 'info'),
    el('span', { class: 'aviso-flotante-texto', texto }),
    el('button', { type: 'button', class: 'aviso-flotante-cerrar', 'aria-label': t('aviso.cerrar'), texto: '×', onclick: () => aviso.remove() }));
  cajaAvisos.replaceChildren(aviso);
  setTimeout(() => aviso.remove(), tono === 'mal' ? 12000 : 6000);
}

// ---- Pase de pantallas (0.4.1): pestañas, listas cortas y lo que se ve en la PC ----
// En la PC (pantalla ancha) algunas partes que en el teléfono van cerradas se abren solas.
const pantallaAncha = () => { try { return window.matchMedia('(min-width: 1024px)').matches; } catch { return false; } };

// Pestañas (Administrador, un proyecto): una fila de enlaces que siempre se ve arriba; en el teléfono se desliza de lado.
// Cada una es una dirección propia (#admin/usuarios, #proyecto/4/versiones…): «Atrás» vuelve a la pestaña de antes.
// items: [{ id, href, texto, nombreIcono?, tono? }] (tono: un punto de color, por ejemplo el del trabajo automático).
function pestanas(items, actual, etiqueta) {
  const fila = el('nav', { class: 'pestanas', 'aria-label': etiqueta },
    items.map(x => el('a', { href: x.href, class: 'pestana', 'data-pestana': x.id, 'aria-current': x.id === actual ? 'page' : null },
      x.nombreIcono ? icono(x.nombreIcono, 'icono chico') : null,
      el('span', { texto: x.texto }),
      x.tono ? el('span', { class: `punto tono-${x.tono}`, 'aria-hidden': 'true' }) : null)));
  // La pestaña abierta queda a la vista (al medio, con un poco de las vecinas: así se nota que la fila se desliza)
  // aunque la fila no quepa, sin mover la página.
  requestAnimationFrame(() => {
    const abierta = fila.querySelector('[aria-current="page"]');
    if (abierta && fila.scrollWidth > fila.clientWidth) fila.scrollLeft = Math.max(0, abierta.offsetLeft - (fila.clientWidth - abierta.offsetWidth) / 2);
  });
  return fila;
}

// Una lista larga muestra las primeras «cuantas» y un botón «Ver N más» (no se quita nada: el resto aparece al tocarlo).
// recordar: un objeto { abierta } para que siga abierta aunque esa parte se vuelva a dibujar (la zona de sistema).
// Devuelve [contenedor, botón] (el botón solo si hace falta).
function verMas(contenedor, nodos, cuantas, recordar = null) {
  const lista = nodos.flat(Infinity).filter(Boolean);
  if (lista.length <= cuantas + 1 || recordar?.abierta) {
    contenedor.append(...lista);
    return [contenedor];
  }
  contenedor.append(...lista.slice(0, cuantas));
  const resto = lista.slice(cuantas);
  const boton = el('button', {
    type: 'button',
    class: 'secundario ver-mas con-icono',
    onclick: () => {
      if (recordar) recordar.abierta = true;
      contenedor.append(...resto);
      boton.remove();
      // El foco pasa al primero que apareció (para VoiceOver y el teclado).
      const primero = resto[0];
      const destino = primero.matches('a, button, summary') ? primero : primero.querySelector('a, button, summary') ?? primero;
      if (destino === primero && !primero.matches('a, button, summary')) primero.setAttribute('tabindex', '-1');
      try { destino.focus({ preventScroll: true }); } catch { destino.focus(); }
    },
  }, icono('mas', 'icono chico'), el('span', { texto: t('lista.ver_mas', { n: numero(resto.length) }) }));
  return [contenedor, boton];
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
    campo('clave', t('setup.clave'), 'password', { autocomplete: 'new-password', minlength: 4 }),
    campo('clave2', t('setup.clave2'), 'password', { autocomplete: 'new-password', minlength: 4 }),
    el('p', { class: 'ayuda', texto: t('setup.clave.ayuda') }),
    el('button', { type: 'submit', texto: t('setup.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    // Se revisa aquí antes de enviar, para que un error al escribir no gaste intentos.
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/i.test(String(datos.get('nombre')).trim())) throw new Error(t('error.nombre_no_valido'));
    if (String(datos.get('clave')).length < 4) throw new Error(t('error.clave_corta'));
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
    vaciarMemoria();
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
    // 0.9.2: una cuenta creada sin contraseña: la persona crea la suya aquí mismo.
    if (!r.ok && r.datos.error === 'crear_clave') return pantallaCrearClave(String(datos.get('nombre')).trim());
    if (!r.ok) throw new Error(textoError(r.datos.error));
    await entrarCon(r);
  });
  const aviso = avisoEntrar;
  avisoEntrar = null;
  mostrar(el('section', { class: 'tarjeta centrada' },
    marcaConLogo(), el('p', { class: 'suave', texto: t('app.lema') }),
    aviso ? el('p', { class: 'aviso', role: 'status', texto: aviso }) : null,
    el('h1', { texto: t('entrar.titulo') }), entrada(t('entrar.linea')), formulario, el('p', { class: 'ayuda', texto: t('entrar.olvide') }),
    selectorIdioma(() => pantallaEntrar())), pie());
}
// 0.9.2: «Crea tu contraseña» (la primera vez de una cuenta que el administrador creó solo con el nombre).
function pantallaCrearClave(nombre) {
  const mensaje = caja();
  const formulario = el('form', { novalidate: true },
    campo('nueva', t('clave.nueva'), 'password', { autocomplete: 'new-password', minlength: 4 }),
    campo('nueva2', t('clave.nueva2'), 'password', { autocomplete: 'new-password', minlength: 4 }),
    el('p', { class: 'ayuda', texto: t('setup.clave.ayuda') }),
    el('button', { type: 'submit', texto: t('crear_clave.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    if (String(datos.get('nueva')).length < 4) throw new Error(t('error.clave_corta'));
    if (datos.get('nueva') !== datos.get('nueva2')) throw new Error(t('setup.claves_distintas'));
    const r = await api('POST', '/api/crear-clave', { nombre, nueva: datos.get('nueva') });
    if (!r.ok) throw new Error(textoError(r.datos.error));
    await entrarCon(r);
  });
  mostrar(el('section', { class: 'tarjeta centrada' },
    marcaConLogo(),
    el('h1', { texto: t('crear_clave.titulo') }),
    el('p', { texto: t('crear_clave.linea', { nombre }) }),
    formulario,
    el('button', { type: 'button', class: 'secundario', texto: t('crear_clave.otro'), onclick: () => pantallaEntrar() })), pie());
  formulario.querySelector('input')?.focus();
}
async function entrarCon(r) {
  estado.usuario = r.datos.usuario;
  vaciarMemoria();
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
}

function formularioClave({ alTerminar }) {
  const mensaje = caja();
  const formulario = el('form', { novalidate: true },
    campo('actual', t('clave.actual'), 'password', { autocomplete: 'current-password' }),
    campo('nueva', t('clave.nueva'), 'password', { autocomplete: 'new-password', minlength: 4 }),
    campo('nueva2', t('clave.nueva2'), 'password', { autocomplete: 'new-password', minlength: 4 }),
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
  if (!r.ok && r.codigo !== 401) return avisar(textoError(r.datos.error), 'mal');
  estado.usuario = null;
  vaciarMemoria();
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
  // 0.9.2: también «el administrador cambió tu usuario» y «… tu nombre» (se muestra el de ahora).
  const avisos = (Array.isArray(datos?.avisos) ? datos.avisos : []).filter(a => a && ['clave_reiniciada', 'usuario_cambiado', 'nombre_cambiado'].includes(a.tipo) && Number.isSafeInteger(a.id));
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
  const reinicios = avisos.filter(a => a.tipo === 'clave_reiniciada');
  const nombres = avisos.filter(a => a.tipo !== 'clave_reiniciada');
  const fechas = !reinicios.length ? [] : recientes.length ? recientes.map(x => x.fecha) : reinicios.map(a => a.fecha).reverse();
  return el('section', { class: 'tarjeta', role: 'alert' },
    nombres.map(a => el('p', { class: 'aviso', texto: a.tipo === 'usuario_cambiado'
      ? t('aviso.usuario_cambiado', { nombre: estado.usuario?.nombre ?? '', fecha: fecha(a.fecha) })
      : t('aviso.nombre_cambiado', { nombre: estado.usuario?.nombreVisible ?? '', fecha: fecha(a.fecha) }) })),
    fechas.length > 1 ? el('p', { class: 'suave', texto: t('aviso.clave_reiniciada.recientes', { dias: 90 }) }) : null,
    fechas.map(f => el('p', { class: 'aviso', texto: t('aviso.clave_reiniciada', { fecha: fecha(f) }) })),
    fechas.length ? el('p', { class: 'suave', texto: t(fechas.length > 1 ? 'aviso.clave_reiniciada.que_hacer_varios' : 'aviso.clave_reiniciada.que_hacer') }) : null);
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
  return el('div', { class: 'marca con-logo' }, logo(), el('span', { texto: nombreApp() }));
}

// 0.8.0: «Modo estudiante» del administrador: ve SU camino, su progreso y sus exámenes igual que un alumno (sus datos de
// estudio son los de su propia cuenta: siempre lo fueron). Es solo cómo se ve: se recuerda en esta pestaña del navegador.
const claveEstudiante = () => `op_estudiante.${estado.usuario?.id ?? 'x'}`;
function enModoEstudiante() {
  if (estado.usuario?.rol !== 'admin') return false;
  try { return sessionStorage.getItem(claveEstudiante()) === '1'; } catch { return modoEstudianteSinAlmacen; }
}
let modoEstudianteSinAlmacen = false;
function ponerModoEstudiante(si) {
  modoEstudianteSinAlmacen = si;
  try { if (si) sessionStorage.setItem(claveEstudiante(), '1'); else sessionStorage.removeItem(claveEstudiante()); } catch { /* sin almacenamiento: solo en memoria */ }
}
// ¿Se ve como administrador? (no en Modo estudiante)
const verComoAdmin = () => estado.usuario?.rol === 'admin' && !enModoEstudiante();
function bandaEstudiante() {
  if (!enModoEstudiante()) return null;
  return el('div', { class: 'banda-estudiante', role: 'status' },
    icono('personas', 'icono chico'),
    el('span', { texto: t('estudiante.banda') }),
    el('button', { type: 'button', class: 'boton-3d blanco chico', onclick: () => { ponerModoEstudiante(false); location.hash = '#admin'; } }, el('span', { texto: t('estudiante.volver') })));
}

// En el teléfono: arriba la marca y «Salir»; abajo (como las apps del iPhone) el menú con íconos, siempre a mano.
// En la PC (pantalla ancha) el mismo menú va a la izquierda, con sus nombres, y el contenido al lado (estilos.css).
function marco(seccion, ...contenido) {
  // Academia (0.7.0): «Proyectos» queda escondido (su código sigue, para más adelante).
  const enlaces = [['inicio', 'menu.camino', 'avion'], ['progreso', 'menu.progreso', 'grafica'], ['configuracion', 'menu.configuracion', 'ajustes']];
  if (verComoAdmin()) enlaces.push(['admin', 'menu.admin', 'escudo']);
  return el('div', { class: 'marco' },
    el('div', { class: 'lateral' },
      el('header', { class: 'encabezado' },
        el('a', { href: '#inicio', class: 'marca-enlace', 'aria-label': t('menu.inicio') }, marcaConLogo()),
        el('a', { href: '#ayuda', class: 'ayuda-enlace', 'aria-current': seccion === 'ayuda' ? 'page' : null }, icono('info', 'icono menu-icono'), el('span', { texto: t('menu.ayuda') })),
        // 0.9.0: el avatar que eligió (Configuración → Mi perfil); lleva a Configuración.
        el('a', { href: '#configuracion', class: 'avatar-enlace', title: estado.usuario?.nombreVisible || estado.usuario?.nombre || '' },
          dibujarAvatar(estado.usuario?.avatar ?? null, { nombre: estado.usuario?.nombreVisible || estado.usuario?.nombre || '', tamano: 'chico', etiqueta: t('perfil.ir', { nombre: estado.usuario?.nombreVisible || estado.usuario?.nombre || '' }) })),
        el('button', { type: 'button', class: 'secundario chico con-icono salir', onclick: salir }, icono('salir'), el('span', { texto: t('menu.salir') }))),
      el('nav', { class: 'menu', 'aria-label': t('menu.titulo') },
        enlaces.map(([id, clave, nombreIcono]) => el('a', { href: `#${id}`, 'aria-current': id === seccion ? 'page' : null },
          icono(nombreIcono, 'icono menu-icono'), el('span', { texto: t(clave) }))))),
    el('main', { class: 'contenido' },
      bandaEstudiante(),
      avisosDeCuenta(),
      ...contenido,
      pie()));
}

// La misma guía en una línea, arriba de Administrador → Resumen: cuántos pasos van y el botón del que sigue.
function guiaCompacta(pasos) {
  const g = resumenGuia(pasos);
  if (!g.total) return null;
  if (g.completa) return el('p', { class: 'guia-compacta completa con-icono' }, icono('bien'), el('span', { texto: t('guia.listo') }));
  return el('section', { class: 'tarjeta guia-compacta', 'aria-label': t('guia.titulo') },
    el('div', { class: 'guia-compacta-texto' },
      el('strong', { class: 'con-icono' }, icono('bandera'), el('span', { texto: t('guia.compacta', { hechos: numero(g.hechos), total: numero(g.total) }) })),
      el('div', { class: 'guia-barra' }, barra(g.hechos, g.total, 'bien')),
      el('span', { class: 'suave', texto: t('guia.sigue', { paso: t(`guia.paso.${g.siguiente.id}`) }) })),
    el('a', { class: 'boton-enlace con-icono', href: g.siguiente.destino }, el('span', { texto: t('guia.continuar') }), icono('flecha')),
    el('a', { class: 'enlace-fuerte guia-ver', href: '#inicio', texto: t('guia.ver_pasos') }));
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
  // 0.9.0: «Mi perfil» (public/perfil-vista.js solo se carga aquí).
  const [reinicios, perfil, vistaPerfil] = await Promise.all([api('GET', '/api/yo/reinicios'), api('GET', '/api/yo/perfil'), import('./perfil-vista.js')]);
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
  // 0.8.0: los sonidos de la academia (encendidos por defecto; uno por cuenta, en este navegador).
  const botonesSonidos = grupoDeBotones([['si', t('sonidos.encendidos')], ['no', t('sonidos.apagados')]], sonidosEncendidos() ? 'si' : 'no', (valor, marcar) => {
    encenderSonidos(valor === 'si');
    marcar();
    sonar('bien');
  });
  const lista = reinicios.ok ? reinicios.datos.reinicios : null;
  const alGuardarPerfil = p => {
    Object.assign(estado.usuario, { nombre: p.nombre, nombreVisible: p.nombreVisible, avatar: p.avatar });
    pantallaConfiguracion();
  };
  mostrar(marco('configuracion',
    el('h1', { class: 'titulo-pantalla', texto: t('config.titulo') }),
    entrada(t('config.linea')),
    el('div', { class: 'rejilla dos' },
      perfil.ok ? vistaPerfil.tarjetasPerfil(perfil.datos.perfil, { el, t, numero, icono, caja, botonAccion, api, avisar, textoError, dibujarAvatar }, { alGuardar: alGuardarPerfil })
        : el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(perfil.datos.error) })),
      el('section', { class: 'tarjeta' },
        el('h2', { texto: t('config.cuenta') }),
        estado.usuario.nombreVisible && estado.usuario.nombreVisible !== estado.usuario.nombre
          ? el('p', { texto: t('config.nombre', { nombre: estado.usuario.nombreVisible }) }) : null,
        el('p', { texto: t('config.usuario', { nombre: estado.usuario.nombre }) }),
        el('p', { class: 'suave', texto: t(estado.usuario.rol === 'admin' ? 'config.rol.admin' : 'config.rol.usuario') })),
      el('section', { class: 'tarjeta' },
        el('h2', { texto: t('idioma.titulo') }), botonesIdioma, mensajeIdioma,
        el('h2', { class: 'separado', texto: t('tema.titulo') }), botonesTema, el('p', { class: 'ayuda', texto: t('tema.ayuda') }),
        el('h2', { class: 'separado con-icono', id: 'titulo-sonidos' }, icono('altavoz', 'icono chico'), el('span', { texto: t('sonidos.titulo') })),
        el('div', { class: 'ajuste-sonidos', role: 'group', 'aria-labelledby': 'titulo-sonidos' }, botonesSonidos),
        el('p', { class: 'ayuda', texto: t('sonidos.ayuda') })),
      el('section', { class: 'tarjeta' }, el('h2', { texto: t('clave.titulo') }), formularioClave({})),
      el('section', { class: 'tarjeta' },
        el('h2', { texto: t('config.reinicios') }),
        !lista ? el('p', { class: 'mensaje error', texto: textoError(reinicios.datos.error) })
          : lista.length ? [
            el('p', { class: 'suave', texto: t('config.reinicios.texto') }),
            verMas(el('ul', {}), lista.map(x => el('li', { texto: t('config.reinicios.linea', { fecha: fecha(x.fecha) }) })), 5),
          ] : vacio('candado', t('config.reinicios.vacio'), null, 'en-linea')),
      el('section', { class: 'tarjeta' },
        titulo('info', t('ayuda.titulo')),
        el('p', { class: 'suave', texto: t('config.ayuda.texto') }),
        el('a', { class: 'boton-enlace secundario con-icono', href: '#ayuda' }, icono('info'), el('span', { texto: t('config.ayuda.abrir') }))))));
}

// ---------- Ayuda (0.5.1): todas las explicaciones de «¿Qué es esto?», con un buscador ----------
// No pide nada al servidor: los textos ya están cargados. Se filtra mientras se escribe (sin tildes ni mayúsculas).
function pantallaAyuda() {
  nuevoTurno();
  const temas = TEMAS_AYUDA.filter(id => !TEMAS_DE_PROYECTOS.includes(id)).map(id => ({ id, titulo: t(`ayuda.${id}.titulo`), texto: t(`ayuda.${id}.texto`), ejemplo: TEMAS_CON_EJEMPLO.includes(id) ? t(`ayuda.${id}.ejemplo`) : '' }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, idioma));
  const lista = el('div', { class: 'glosario' });
  const cuenta = el('p', { class: 'suave glosario-cuenta', role: 'status' });
  const buscador = el('input', { id: 'campo-buscar-ayuda', type: 'search', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search', placeholder: t('ayuda.buscar.muestra') });
  const pintar = () => {
    const escrito = buscador.value.trim();
    const hallados = buscarTemas(temas, escrito);
    lista.replaceChildren(...hallados.map(x => el('article', { class: 'tarjeta termino', 'data-tema': x.id },
      el('h2', { class: 'con-icono' }, icono('info'), el('span', { texto: x.titulo })),
      el('p', { texto: x.texto }),
      ejemploDeAyuda(x.id))));
    if (!hallados.length) {
      lista.append(vacio('buscar', t('ayuda.buscar.vacio', { texto: escrito }),
        el('button', { type: 'button', class: 'secundario', texto: t('ayuda.buscar.borrar'), onclick: () => { buscador.value = ''; pintar(); buscador.focus(); } })));
    }
    cuenta.textContent = escrito ? tn('ayuda.buscar.cuenta', { n: hallados.length }) : t('ayuda.todas', { n: temas.length });
  };
  buscador.addEventListener('input', pintar);
  pintar();
  mostrar(marco('ayuda',
    el('h1', { class: 'titulo-pantalla', texto: t('ayuda.titulo') }),
    entrada(t('ayuda.linea')),
    el('section', { class: 'tarjeta buscador-ayuda' },
      el('label', { for: 'campo-buscar-ayuda', class: 'con-icono' }, icono('buscar'), el('span', { texto: t('ayuda.buscar') })),
      buscador, cuenta),
    lista));
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
  const { textoClave, nombre, temporal, usuario, pendiente } = claveTemporalVisible;
  // 0.9.2: sin contraseña (la crea la persona al entrar) o con la que puso el administrador: no hay nada que copiar.
  const seccion = el('section', { class: 'tarjeta' }, temporal ? bloqueClaveTemporal(textoClave, nombre, temporal, usuario)
    : el('div', { class: 'aviso con-icono-arriba', role: 'status', 'data-foco': true }, icono(pendiente ? 'atencion' : 'bien'),
      el('span', { texto: pendiente ? t('admin.creado_sin_clave', { nombre, usuario }) : t('admin.creado_con_clave', { nombre, usuario }) })));
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
  // Academia (0.7.0).
  avion: [['path', { d: 'M21 15.5v-2l-8-5V4a1.5 1.5 0 0 0-3 0v4.5l-8 5v2l8-2.5V18l-2.5 1.8V21l4-1 4 1v-1.2L13 18v-5z' }]],
  fuego: [['path', { d: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.8 2.3-5 .3 1.6 1 2.6 2 3 0-3 .2-5.6.7-8z' }]],
  trofeo: [['path', { d: 'M8 4h8v5a4 4 0 0 1-8 0z' }], ['path', { d: 'M8 6H5a3 3 0 0 0 3 4' }], ['path', { d: 'M16 6h3a3 3 0 0 1-3 4' }], ['line', { x1: 12, y1: 13, x2: 12, y2: 17 }], ['path', { d: 'M8 20h8l-1-3H9z' }]],
  subir: [['path', { d: 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3' }], ['polyline', { points: '7 9 12 4 17 9' }], ['line', { x1: 12, y1: 4, x2: 12, y2: 16 }]],
  cerrar: [['line', { x1: 6, y1: 6, x2: 18, y2: 18 }], ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }]],
  // Academia 0.7.2: un ícono por materia y los de las tarjetas.
  cerebro: [['path', { d: 'M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 18 3 3 0 0 0 12 19V5.5A3 3 0 0 0 9 4.5z' }], ['path', { d: 'M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 5.3A3 3 0 0 1 12 19' }], ['path', { d: 'M8 10h2M14 13h2' }]],
  motor: [['rect', { x: 5, y: 9, width: 10, height: 8, rx: 1 }], ['path', { d: 'M15 11h3l2-2v8l-2-2h-3' }], ['path', { d: 'M8 9V6h4v3' }], ['path', { d: 'M2.5 11v4' }]],
  ala: [['path', { d: 'M2.5 14c4-4.5 11-6 19-5-5 1.5-8.5 3.5-10.5 7-3 .2-6-.6-8.5-2z' }], ['path', { d: 'M4 18h9M7 21h9' }]],
  torre: [['path', { d: 'M8 21l1.5-10h5L16 21' }], ['path', { d: 'M6.5 11h11l-1.5-4h-8z' }], ['path', { d: 'M12 7V3M9.5 4.5 12 3l2.5 1.5' }]],
  manual: [['path', { d: 'M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z' }], ['path', { d: 'M5 18a2 2 0 0 1 2-2h11' }], ['path', { d: 'M9 8h5M9 11h3' }]],
  radio: [['rect', { x: 4, y: 9, width: 16, height: 11, rx: 2 }], ['path', { d: 'M8 9l8-5' }], ['circle', { cx: 9, cy: 14.5, r: 2 }], ['path', { d: 'M14 13h3M14 16h3' }]],
  nube: [['path', { d: 'M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z' }]],
  velocimetro: [['path', { d: 'M4 17a8 8 0 1 1 16 0' }], ['path', { d: 'M12 17l4-5' }], ['circle', { cx: 12, cy: 17, r: 1.3 }], ['path', { d: 'M6.5 11.5l1.2.8M12 7.5V9M17.5 11.5l-1.2.8' }]],
  brujula: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M15.5 8.5l-2 5-5 2 2-5z' }]],
  video: [['rect', { x: 3, y: 6, width: 13, height: 12, rx: 2.5 }], ['path', { d: 'M16 10.5l5-3v9l-5-3z' }], ['path', { d: 'M8.5 9.5v5l4-2.5z' }]],
  medalla: [['circle', { cx: 12, cy: 15, r: 5.5 }], ['path', { d: 'M8.5 10.5 6 3h4l2 4 2-4h4l-2.5 7.5' }], ['path', { d: 'M12 12.5l.8 1.7 1.8.2-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.2z' }]],
  bombilla: [['path', { d: 'M9 18h6M10 21h4' }], ['path', { d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z' }]],
  altavoz: [['path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z' }], ['path', { d: 'M15.5 9a4 4 0 0 1 0 6' }], ['path', { d: 'M18 6.5a7.5 7.5 0 0 1 0 11' }]],
  tarjetas: [['rect', { x: 6, y: 3, width: 12, height: 15, rx: 2 }], ['path', { d: 'M4 7v12a2 2 0 0 0 2 2h9' }]],
  lupa: [['circle', { cx: 10.5, cy: 10.5, r: 6 }], ['path', { d: 'M15 15l5.5 5.5M8 10.5h5M10.5 8v5' }]],
};
// Un elemento SVG con sus atributos (siempre con createElementNS: nunca se arma con texto).
function svgEl(etiqueta, atributos = {}) {
  const nodo = document.createElementNS(SVG, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) if (valor != null) nodo.setAttribute(clave, String(valor));
  return nodo;
}
// Los íconos: los de siempre, los de los proyectos y de los servicios (public/dibujos.js) y uno por negocio («s-hoteles»…).
const formaDeIcono = nombre => ICONOS[nombre] ?? ICONOS_PROYECTO[nombre] ?? ICONOS_SERVICIOS[nombre] ?? ICONOS.bien;
function icono(nombre, clase = 'icono') {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: clase, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const [etiqueta, propias] of formaDeIcono(nombre)) svg.append(svgEl(etiqueta, propias));
  return svg;
}

// Una frase si existe en el idioma; si no (por ejemplo, un tipo de una versión más nueva), el respaldo tal cual.
function tSi(clave, respaldo, variables = {}) {
  return catalogos[idioma]?.[clave] != null || catalogos.es?.[clave] != null ? t(clave, variables) : String(respaldo ?? '');
}
const nombreTipo = tipo => tSi(`tareas.tipo.${tipo}`, tipo);
const nombreComo = como => tSi(`tareas.como.${como}`, como);
// tipo: el de la tarea. Revisión final: los motivos de la tarea de copias (copias.hacer) se dicen con palabras (los de la
// copia, los de Telegram), nunca con el código tal cual (public/copias-vista.js, fraseMotivoTareaCopia).
const existeFrase = clave => catalogos[idioma]?.[clave] != null || catalogos.es?.[clave] != null;
function textoMotivo(motivo, tipo = null) {
  if (!motivo) return '';
  const propio = tSi(`tareas.motivo.${motivo}`, null);
  if (propio) return propio;
  const como = String(motivo).match(/^trabajador_([a-z_]+)$/);
  if (como) return t('tareas.motivo.trabajador', { como: enMinuscula(nombreComo(como[1])) });
  if (tipo === 'copias.hacer') return t(fraseMotivoTareaCopia(motivo, existeFrase));
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
// telegram_falla: qué frase va según su motivo (src/canales/canales.js anotarProblema, src/canales/avisador.js).
const PROBLEMA_DE_FALLA = Object.freeze({
  bloqueado: 'telegram.problema.bloqueado', perdido: 'telegram.problema.perdido', clave: 'telegram.problema.clave_no_valida',
  pedido: 'telegram.problema.pedido', sin_respuesta: 'telegram.problema.sin_respuesta', sin_probar: 'telegram.problema.sin_probar',
  bot_cambiado: 'telegram.problema.bot_cambiado', limite: 'telegram.problema.limite',
});

function textoAviso(a) {
  const d = a.detalle ?? {};
  const v = x => (x == null ? '?' : x);
  if (String(a.clave).startsWith('freno:')) {
    return t('aviso.freno', { tipo: nombreTipo(String(a.clave).slice(6)), hora: d.hasta ? cuando(d.hasta) : '?' });
  }
  // Fase 1, parte d: los avisos de la IA (topes al 50, 80 y 100 %, un proveedor con problemas, un uso que costó más).
  if (String(a.clave).startsWith('ia_tope:')) {
    const ambito = textoAmbito(d.ambito ?? String(a.clave).split(':')[1]);
    const mes = d.mes ? nombreMes(d.mes, true) : '?';
    if (Number(d.umbral) >= 100) return t('aviso.ia_tope.lleno', { ambito, mes, fecha: d.vuelveEl ? fechaHora(d.vuelveEl) : '?' });
    return t('aviso.ia_tope', { pct: v(d.pct), ambito, mes, usado: usd(d.usadoMicro), tope: usd(d.topeMicro) });
  }
  if (String(a.clave).startsWith('ia_proveedor:')) {
    const proveedor = nombreProveedor(d.proveedor ?? String(a.clave).slice('ia_proveedor:'.length));
    return t(d.pausa === 'admin' ? 'aviso.ia_proveedor.admin' : 'aviso.ia_proveedor', { proveedor, motivo: d.motivo ? textoMotivoIa(d.motivo) : '?' });
  }
  if (String(a.clave).startsWith('ia_llamadas:')) {
    const id = /^e(\d+)$/.exec(String(d.ambito ?? String(a.clave).slice('ia_llamadas:'.length)))?.[1] ?? '?';
    return t('aviso.ia_llamadas', { id, usadas: v(d.usadas), parte: v(d.parte) });
  }
  if (a.clave === 'ia_costo_mayor') {
    return t('aviso.ia_costo_mayor', { real: usd(d.realMicro), reservado: usd(d.reservadoMicro), proveedor: nombreProveedor(d.proveedor) });
  }
  // Fase 1, parte e: una actualización que no se instaló o que se devolvió (con los 7 primeros caracteres de su versión),
  // las copias y el Telegram.
  const actualizacion = /^actualizacion_(no_instalada|revertida):([0-9a-f]{7})$/.exec(String(a.clave));
  if (actualizacion) return t(actualizacion[1] === 'revertida' ? 'aviso.actualizacion_revertida' : 'aviso.actualizacion_no_instalada', { sha: actualizacion[2] });
  if (a.clave === 'copias_disco_pronto') return t('aviso.copias_disco_pronto', { dias: v(d.dias) });
  if (a.clave === 'copias_locales_pausadas' && d.motivo === 'escribir') return t('aviso.copias_locales_pausadas.escribir');
  if (a.clave === 'copia_fallida' && d.motivo) return `${t('aviso.copia_fallida')} ${t('copias.por', { motivo: textoMotivoCopia(d.motivo) })}`;
  if (a.clave === 'telegram_falla' && Object.hasOwn(PROBLEMA_DE_FALLA, d.motivo)) return `${t('aviso.telegram_falla')} ${t(PROBLEMA_DE_FALLA[d.motivo])}`;
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

// Una tarjeta del resumen de arriba. Al tocarla, baja a su parte (o, si destino es una dirección como '#ia', va a
// esa pantalla; con «ancla», al llegar baja hasta esa parte, por ejemplo los errores en la pestaña Trabajo).
// extra: algo más que se dibuja abajo (por ejemplo, la barra del gasto de la IA).
let bajarA = null; // la parte a la que se baja al dibujar la próxima pantalla (data-ancla)
function tarjetaResumen({ nombreIcono, titulo, valor, detalle, tono, destino, ancla = null, iconoTono = tono, extra = null }) {
  return el('button', {
    type: 'button',
    class: `resumen-tarjeta tono-${tono}`,
    onclick: () => {
      if (typeof destino === 'string') {
        bajarA = ancla;
        location.hash = destino;
      } else destino?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  },
  el('span', { class: 'resumen-cabeza' }, icono(nombreIcono), el('span', { class: 'resumen-titulo', texto: titulo }), el('span', { class: 'tono-color' }, icono(iconoTono))),
  el('span', { class: 'resumen-valor', texto: valor }),
  detalle ? el('span', { class: 'resumen-detalle', texto: detalle }) : null,
  extra);
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

// tema: la palabra que explica el botón (i) de al lado (ver queEs).
function titulo(nombreIcono, texto, id, tema = null) {
  return el('h2', { class: 'con-icono', id }, icono(nombreIcono), el('span', { texto }), tema ? queEs(tema) : null);
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

// La zona, una parte por pestaña de Administrador: «resumen» (las 4 tarjetas de arriba y los avisos), «trabajo»
// (el trabajo automático, la fila y el modo seguro) o «servidor». «acciones» trae lo que hacen los botones (ver crearZonaSistema).
// datosDe: cuándo llegaron estos datos. sinConexion: la última actualización falló (el servidor no contesta):
// lo de arriba se pone gris y lo dice, para que nadie crea que todo está bien con datos viejos.
function dibujarZonaSistema(s, { parte = 'resumen', acciones, bloqueFila, mensajeZona, estadoVista, datosDe = Date.now(), sinConexion = false }) {
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
  // Sin conexión, lo de arriba lo dice en cada pestaña (en el Resumen va dentro de su tarjeta).
  const lineaSinConexion = sinConexion ? el('p', { class: 'mensaje error con-icono', role: 'alert' }, icono('sin_conexion'), el('span', { texto: t('sistema.sin_conexion', { hora: horaDatos }) })) : null;
  const actualizado = el('p', { class: 'ayuda', texto: t('sistema.actualizado', { hora: horaDatos }) });
  const botonActualizar = () => el('button', { type: 'button', class: 'secundario chico con-icono', onclick: acciones.actualizar }, icono('actualizar'), el('span', { texto: t('sistema.actualizar') }));

  if (parte === 'resumen') {
    // Los avisos van en esta misma pestaña (la tarjeta «Avisos» baja hasta ellos).
    const anclaAvisos = el('span');
    // ---- Resumen de arriba ----
    const resumen = el('section', { class: 'tarjeta resumen-sistema ancha', 'aria-label': t('sistema.resumen') },
      el('div', { class: 'resumen-encabezado' },
        el('h2', { texto: t('sistema.titulo') }),
        botonActualizar()),
      el('div', { class: 'resumen-rejilla' },
        tarjetaResumen({
          nombreIcono: 'latido', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.trabajo'), valor: valorTrabajo, tono, destino: '#admin/trabajo',
          detalle: sinConexion ? t('sistema.sin_conexion.detalle', { hora: horaDatos })
            : s.modoSeguro?.activo ? t('sistema.resumen.en_pausa') : tr.ultimoLatido ? t('tareas.latido', { hace: hace(tr.ultimoLatido) }) : null,
        }),
        tarjetaResumen({
          nombreIcono: 'servidor', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.servidor'), valor: sinConexion ? t('sistema.sin_conexion.valor') : t(`sistema.semaforo.${salud.semaforo ?? 'amarillo'}`), tono: tonoServidor, destino: '#admin/servidor',
          detalle: sinConexion ? t('sistema.sin_conexion.detalle', { hora: horaDatos }) : t('sistema.resumen.memoria', { mb: tamano(salud.memoria?.disponibleMb) }),
        }),
        // Sin conexión, todo el resumen va en gris: son datos viejos, ni buenos ni malos.
        tarjetaResumen({
          nombreIcono: 'campana', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.avisos'), valor: abiertos.length ? numero(abiertos.length) : t('sistema.avisos.ninguno'), tono: sinConexion ? 'apagado' : peorAviso, destino: anclaAvisos,
          detalle: abiertos.length ? t('sistema.resumen.avisos_texto') : t('sistema.resumen.avisos_vacio'),
        }),
        tarjetaResumen({
          nombreIcono: 'fila', iconoTono: sinConexion ? 'sin_conexion' : undefined, titulo: t('sistema.errores'), valor: numero(conError), tono: sinConexion ? 'apagado' : conError ? (fila.fallidas7d ? 'mal' : 'atencion') : 'bien', destino: '#admin/trabajo', ancla: 'errores',
          detalle: t('sistema.resumen.hechas', { n: numero(fila.hechas24h ?? 0) }),
        })),
      lineaSinConexion,
      actualizado,
      mensajeZona);

    // ---- Avisos (solo si hay abiertos): los primeros a la vista y «Ver N más» ----
    const avisos = abiertos.length ? el('section', { class: 'tarjeta ancha tarjeta-avisos', 'data-ancla': 'avisos' }, anclaAvisos,
      titulo('campana', t('sistema.avisos'), undefined, 'aviso'),
      verMas(el('div', {}), abiertos.map(a => el('div', { class: `aviso-sistema tono-${tonoAviso(a.nivel)}` },
        el('div', { class: 'aviso-cabeza' }, insignia(tonoAviso(a.nivel), t(`aviso.nivel.${a.nivel}`)), a.veces > 1 ? el('span', { class: 'suave', texto: t('aviso.veces', { n: a.veces }) }) : null),
        el('p', { class: 'aviso-texto', texto: textoAviso(a) }),
        el('p', { class: 'suave', texto: a.veces > 1 ? t('aviso.desde_ultima', { desde: fecha(a.creadoEn), ultima: hace(a.ultimaVez) }) : t('aviso.desde', { desde: fecha(a.creadoEn) }) }),
        a.vistoEn ? el('p', { class: 'suave', texto: t('aviso.visto', { fecha: fecha(a.vistoEn) }) })
          : el('button', { type: 'button', class: 'secundario', texto: t('aviso.entendido'), onclick: evento => acciones.visto(a, evento.currentTarget) }))), 3, estadoVista.avisos),
      el('p', { class: 'ayuda', texto: s.telegram?.listo ? t('sistema.avisos.telegram_si') : t('sistema.avisos.telegram') }))
      // Sin avisos: se dice (con su dibujo) en vez de no mostrar nada.
      : el('section', { class: 'tarjeta ancha tarjeta-avisos', 'data-ancla': 'avisos' }, anclaAvisos,
        titulo('campana', t('sistema.avisos'), undefined, 'aviso'),
        vacio('bien', t('sistema.avisos.vacio'), null, 'en-linea'));
    return [resumen, avisos];
  }

  if (parte === 'trabajo') {
    // ---- Trabajo automático: lo de ahora y el modo seguro arriba; la fila, los errores y lo que viene después ----
    const linea = [
      tr.ultimoLatido ? t('tareas.latido', { hace: hace(tr.ultimoLatido) }) : null,
      tr.memoriaMb != null ? t('tareas.usa', { mb: tamano(tr.memoriaMb) }) : null,
      t('tareas.version', { version: s.version, codigo: s.codigo }),
    ].filter(Boolean).join(' · ');
    const enCurso = Array.isArray(tr.enCurso) ? tr.enCurso : [];
    const m = s.modoSeguro ?? {};
    const explicacion = explicacionModoSeguro(m);
    const bloqueModoSeguro = el('div', { class: `modo-seguro tono-${m.activo ? (m.origen === 'automatico' ? 'mal' : 'atencion') : 'bien'}` },
      el('div', { class: 'con-icono fuerte' }, icono('escudo'), el('span', { texto: t(m.activo ? 'modo_seguro.activo' : 'modo_seguro.apagado') }), queEs('modo_seguro')),
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
        el('p', { texto: [tSi(`tareas.evento.${e.evento}`, e.evento), textoMotivo(e.motivo, e.tipo)].filter(Boolean).join(': ') }),
        el('p', { class: 'suave', texto: [fecha(e.fecha), e.intento ? t('tareas.intento', { x: e.intento, y: e.maxFallos }) : null, e.proyecto ? t('tareas.de_proyecto', { proyecto: e.proyecto, cuenta: e.cuenta }) : null].filter(Boolean).join(' · ') }),
        botones ? el('div', { class: 'botones' },
          e.puedeReintentar ? el('button', { type: 'button', texto: t('tareas.reintentar'), onclick: evento => acciones.tarea(e.tareaId, 'reintentar', evento.currentTarget) }) : null,
          e.puedeCancelar ? el('button', { type: 'button', class: 'secundario', texto: t('tareas.cancelar'), onclick: evento => acciones.tarea(e.tareaId, 'cancelar', evento.currentTarget) }) : null) : null);
    });

    const ahora = el('section', { class: 'tarjeta area-ahora' },
      el('div', { class: 'resumen-encabezado' }, titulo('latido', t('sistema.trabajo'), undefined, 'trabajo_automatico'), botonActualizar()),
      lineaSinConexion,
      el('div', { class: `estado-grande tono-${tono}` }, icono(sinConexion ? 'sin_conexion' : tono, 'icono estado'), el('span', { texto: valorTrabajo })),
      el('p', { class: 'fuerte', texto: enCurso.length ? t('tareas.ahora', { que: enCurso.map(x => `${nombreTipo(x.tipo)} (${hace(x.desde)})`).join(', ') }) : t('tareas.ahora.nada') }),
      tr.freno ? el('p', { class: 'aviso', texto: tSi(`tareas.freno.${tr.freno}`, tr.freno) }) : null,
      (s.frenos ?? []).map(f => el('p', { class: 'aviso', texto: t('tareas.frenado', { tipo: nombreTipo(f.tipo), hora: cuando(f.hasta) }) })),
      bloqueModoSeguro,
      el('p', { class: 'suave', texto: linea }),
      actualizado,
      mensajeZona);
    const cola = el('section', { class: 'tarjeta area-cola' },
      titulo('fila', t('tareas.cola')),
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
      bloqueFila);
    const tarjetaErrores = el('section', { class: 'tarjeta area-errores', 'data-ancla': 'errores' },
      titulo('atencion', t('tareas.errores')),
      errores.length ? verMas(el('div', {}), errores, 3, estadoVista.errores)
        : vacio('bien', t('tareas.errores.vacio'), null, 'en-linea'));
    const despues = el('section', { class: 'tarjeta area-despues' },
      titulo('reloj', t('tareas.proximas')),
      verMas(el('ul', { class: 'lista-simple' }), (s.proximas ?? []).map(p => el('li', {
        texto: [nombreTipo(p.tipo), p.proximaEn ? cuando(p.proximaEn) : t('tareas.proxima.sin_hora')].join(' — ') + (m.activo ? ` ${t('tareas.proxima.en_pausa')}` : ''),
      })), 5, estadoVista.proximas),
      el('h3', { texto: t('tareas.corridas') }),
      (s.corridas ?? []).length ? verMas(el('ul', { class: 'lista-simple' }), s.corridas.map(c => el('li', {},
        el('span', { class: 'suave', texto: `${fecha(c.terminoEn ?? c.empezoEn)} · ` }),
        el('span', { texto: c.terminoEn ? nombreComo(c.como) : t('tareas.corrida.viva') }))), 3, estadoVista.corridas) : el('p', { class: 'suave', texto: t('tareas.corridas.vacio') }),
      el('p', { class: 'ayuda', texto: t('tareas.explicacion') }));
    return [ahora, tarjetaErrores, cola, despues];
  }

  // ---- Servidor ----
  const memoria = salud.memoria ?? {};
  const historial = Array.isArray(s.historial) ? s.historial : [];
  const detallesHistorial = el('details', { open: estadoVista.historialAbierto },
    el('summary', { texto: t('servidor.historial') }),
    historial.length ? el('ul', { class: 'lista-simple historial-salud' }, historial.map(h => el('li', {
      texto: t('servidor.muestra', { hora: cuando(h.fecha), memoria: tamano(h.memoriaDisponibleMb), disco: tamano(h.discoLibreMb), base: tamano(h.baseMb), ms: h.pantallasP99Ms == null ? '—' : numero(h.pantallasP99Ms, 1) }),
    }))) : el('p', { class: 'suave', texto: t('servidor.sin_muestras') }));
  detallesHistorial.addEventListener('toggle', () => { estadoVista.historialAbierto = detallesHistorial.open; });
  const servidor = el('section', { class: 'tarjeta' },
    el('div', { class: 'resumen-encabezado' }, titulo('servidor', t('sistema.servidor'), undefined, 'servidor'), botonActualizar()),
    lineaSinConexion,
    el('div', { class: `estado-grande tono-${tonoServidor}` }, icono(sinConexion ? 'sin_conexion' : tonoServidor, 'icono estado'), el('span', { texto: sinConexion ? t('sistema.sin_conexion.valor') : t(`servidor.semaforo.${salud.semaforo ?? 'amarillo'}`) })),
    (salud.problemas ?? []).map(p => el('p', { class: `aviso-linea tono-${tonoAviso(p.nivel)}`, texto: textoAviso({ clave: p.clave, detalle: p.detalle }) })),
    el('div', { class: 'medidor' },
      el('div', { class: 'medidor-texto' }, el('span', { texto: t('servidor.memoria') }), el('strong', { texto: t('servidor.de', { a: tamano(memoria.disponibleMb), b: tamano(memoria.totalMb) }) })),
      barra(memoria.disponibleMb, memoria.totalMb, memoria.disponibleMb != null && memoria.disponibleMb < 64 ? 'mal' : memoria.disponibleMb != null && memoria.disponibleMb < 128 ? 'atencion' : 'bien')),
    el('div', { class: 'medidor' },
      el('div', { class: 'medidor-texto' }, el('span', { texto: t('servidor.disco') }), el('strong', { texto: t('servidor.de', { a: tamano(salud.disco?.libreMb), b: tamano(salud.disco?.totalMb) }) })),
      barra(salud.disco?.libreMb, salud.disco?.totalMb, salud.disco?.libreMb != null && salud.disco.libreMb < 300 ? 'mal' : salud.disco?.libreMb != null && salud.disco.libreMb < 1024 ? 'atencion' : 'bien')),
    actualizado,
    mensajeZona);
  const datosServidor = el('section', { class: 'tarjeta' },
    titulo('base', t('servidor.datos')),
    el('ul', { class: 'lista-simple datos-servidor' },
      memoria.swapTotalMb ? el('li', { texto: t('servidor.swap', { a: tamano(memoria.swapUsadaMb), b: tamano(memoria.swapTotalMb) }) }) : null,
      el('li', { texto: t('servidor.oportia', { mb: tamano(usaOportia), a: tamano(salud.webMb), b: tamano(salud.trabajadorMb) }) }),
      el('li', { texto: t('servidor.base', { mb: tamano(salud.base?.archivoMb), wal: tamano(salud.base?.walMb) }) }),
      el('li', { texto: tn('servidor.copias', { n: salud.copias?.archivos ?? 0, mb: tamano(salud.copias?.mb ?? 0) }) }),
      el('li', { texto: t('servidor.carga', { a: numero(salud.carga?.m1 ?? 0, 2), b: numero(salud.carga?.m5 ?? 0, 2), c: numero(salud.carga?.m15 ?? 0, 2) }) }),
      el('li', { texto: salud.pantallasP99Ms == null ? t('servidor.pantallas.sin_dato') : t('servidor.pantallas', { ms: numero(salud.pantallasP99Ms, 1) }) }),
      salud.encendidoDesde ? el('li', { texto: t('servidor.encendido', { fecha: fecha(salud.encendidoDesde) }) }) : null,
      // Fase 1, parte e: la última versión que el actualizador no instaló (o devolvió), leída de version.bad.
      s.actualizaciones?.versionMala ? el('li', { class: 'tono-atencion' }, el('span', { class: 'con-icono' }, icono('atencion', 'icono chico tono-color'),
        el('span', { texto: t('servidor.version_mala', { sha: String(s.actualizaciones.versionMala).slice(0, 7) }) }))) : null),
    detallesHistorial);
  return [servidor, datosServidor];
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
        el('p', { class: 'suave', texto: [fecha(x.terminadaEn ?? x.creadaEn), x.pasos ? tn('tareas.pasos', { n: x.pasos }) : null, x.ultimoError ? textoMotivo(x.ultimoError, x.tipo) : null, x.proyecto ? t('tareas.de_proyecto', { proyecto: x.proyecto, cuenta: x.cuenta }) : null].filter(Boolean).join(' · ') })));
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

// El color del punto de las pestañas Trabajo, Servidor y Copias (el mismo de sus tarjetas del resumen). El de Copias
// solo se ve cuando algo no está bien (verde no se marca: así el punto llama la atención solo cuando hace falta).
function tonosDePestanas(s, sinConexion = false) {
  if (!s) return {};
  if (sinConexion) return { trabajo: 'apagado', servidor: 'apagado' };
  const copias = vistaAzulejoCopias(s.copias, { modoSeguro: s.modoSeguro?.activo }).tono;
  return { trabajo: tonoTrabajo(s), servidor: TONO_SEMAFORO[s.salud?.semaforo] ?? 'atencion', copias: ['mal', 'atencion'].includes(copias) ? copias : undefined };
}

// La zona de sistema de Administrador: se dibuja, se actualiza cada 30 s y maneja sus botones.
// vigente: la guarda de nuevoTurno de la pantalla (si la persona se fue a otra pantalla, se deja de actualizar).
// parte: la pestaña que se ve («resumen», «trabajo» o «servidor»). Solo se cambia esta zona (y el punto de color de
// las pestañas): lo que se está escribiendo en otra parte de la pantalla nunca se pierde.
function crearZonaSistema(vigente, parte = 'resumen') {
  const zona = el('div', { class: 'zona-sistema' });
  const mensajeZona = caja();
  const bloqueFila = crearBloqueFila();
  // Lo abierto (el historial, «Ver N más») sigue abierto cuando la zona se actualiza.
  const estadoVista = { historialAbierto: false, avisos: {}, errores: {}, proximas: {}, corridas: {} };
  const ruta = location.hash;
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
    zona.replaceChildren(...dibujarZonaSistema(datos, { parte, acciones, bloqueFila, mensajeZona, estadoVista, datosDe: ultimosEn ?? Date.now(), sinConexion }).filter(Boolean));
    for (const [id, tono] of Object.entries(tonosDePestanas(datos, sinConexion))) {
      const punto = document.querySelector(`.pestanas [data-pestana="${id}"] .punto`);
      if (punto && tono) punto.setAttribute('class', `punto tono-${tono}`);
    }
  }
  async function actualizar() {
    if (ocupado) return;
    const r = await api('GET', '/api/admin/sistema', undefined, { fresco: true });
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
      if (!vigente() || location.hash !== ruta) { clearInterval(reloj); clearTimeout(pronto); return; }
      if (document.hidden || ocupado) return;
      mensajeZona.hidden = true; // el mensaje de la última acción ya se leyó
      actualizar();
    }, 30000);
  }
  return { zona, empezar };
}

// Administrador va por pestañas, cada una con su dirección: Resumen (#admin), Usuarios (#admin/usuarios),
// Trabajo (#admin/trabajo), Servidor (#admin/servidor), y las pantallas de la IA (#ia) y de las Claves (#claves).
// Arriba de todas, el título y la fila de pestañas (siempre a la vista); debajo, la contraseña temporal recién creada
// (sigue a la vista en todas las pestañas hasta «Ya se la di» o hasta salir de Administrador).
const PESTANAS_ADMIN = ['resumen', 'usuarios', 'trabajo', 'servidor'];
// Debajo de las pestañas: para qué sirve cada una, en una línea, y las palabras que conviene conocer ahí.
const LINEA_ADMIN = {
  resumen: () => t('admin.linea.resumen'), usuarios: () => t('admin.linea.usuarios'), trabajo: () => t('admin.linea.trabajo'), servidor: () => t('admin.linea.servidor'),
  copias: () => t('admin.linea.copias'), ia: () => t('admin.linea.ia'), claves: () => t('admin.linea.claves'),
  alumnos: () => t('admin.linea.alumnos'), contenido: () => t('admin.linea.contenido'), respuestas: () => t('admin.linea.respuestas'),
};
const PALABRAS_ADMIN = { usuarios: ['plan', 'clave_temporal'], copias: ['copia', 'copia_comprobada', 'clave_recuperacion'], claves: ['token', 'tailscale'] };
function cabeceraAdmin(actual, tonos = {}) {
  return [
    el('div', { class: 'admin-arriba' },
      el('h1', { class: 'titulo-pantalla', texto: t('admin.titulo') }),
      // 0.8.0: estudiar como un alumno (su propio camino) y volver.
      el('button', { type: 'button', class: 'boton-3d blanco chico con-icono boton-estudiante', onclick: () => { ponerModoEstudiante(true); location.hash = '#inicio'; } },
        icono('avion', 'icono chico'), el('span', { texto: t('estudiante.entrar') }))),
    pestanas([
      { id: 'resumen', href: '#admin', texto: t('admin.pestana.resumen'), nombreIcono: 'escudo' },
      // Academia (0.7.0): lo de la academia va primero.
      { id: 'alumnos', href: '#alumnos', texto: t('admin.pestana.alumnos'), nombreIcono: 'grafica' },
      { id: 'contenido', href: '#contenido', texto: t('admin.pestana.contenido'), nombreIcono: 'libro' },
      // 0.8.0: la clave completa (cada pregunta con su respuesta y sus explicaciones).
      { id: 'respuestas', href: '#respuestas', texto: t('admin.pestana.respuestas'), nombreIcono: 'marca' },
      { id: 'usuarios', href: '#admin/usuarios', texto: t('admin.pestana.usuarios'), nombreIcono: 'personas' },
      { id: 'trabajo', href: '#admin/trabajo', texto: t('admin.pestana.trabajo'), nombreIcono: 'latido', tono: tonos.trabajo },
      { id: 'servidor', href: '#admin/servidor', texto: t('admin.pestana.servidor'), nombreIcono: 'servidor', tono: tonos.servidor },
      { id: 'copias', href: '#copias', texto: t('admin.pestana.copias'), nombreIcono: 'copia', tono: tonos.copias },
      { id: 'ia', href: '#ia', texto: t('admin.pestana.ia'), nombreIcono: 'chispa' },
      { id: 'claves', href: '#claves', texto: t('admin.pestana.claves'), nombreIcono: 'llave' },
    ], actual, t('admin.pestanas')),
    LINEA_ADMIN[actual] ? entrada(LINEA_ADMIN[actual]()) : null,
    // Academia (0.7.0): «plan» es de los proyectos (escondidos).
    PALABRAS_ADMIN[actual] ? palabras(PALABRAS_ADMIN[actual].filter(x => !TEMAS_DE_PROYECTOS.includes(x))) : null,
    seccionClaveTemporal(),
  ];
}
// «Crear un usuario» desde el Resumen: la pestaña Usuarios abre el formulario y pone el cursor en el nombre.
let abrirCrearUsuario = false;

// pestana: 'resumen', 'usuarios', 'trabajo' o 'servidor'. avisoArriba: un mensaje (por ejemplo, «plan cambiado»).
// Todas piden lo mismo al empezar (así cada pestaña muestra el color del trabajo y del servidor en la fila de arriba).
async function pantallaAdmin(pestana = 'resumen', avisoArriba = null) {
  const vigente = nuevoTurno();
  const conZona = pestana !== 'usuarios';
  const sistema = crearZonaSistema(vigente, pestana);
  // El contenido de la academia, solo para «Primeros pasos».
  const [r, datosSistema, ia, contenido] = await Promise.all([api('GET', '/api/admin/usuarios'), api('GET', '/api/admin/sistema'), api('GET', '/api/admin/ia'), api('GET', '/api/admin/academia')]);
  // Las claves solo se piden desde la cuenta de Tailscale del dueño (por el enlace público ni se preguntan).
  const claves = ia.ok && ia.datos.esDueno ? await api('GET', '/api/admin/claves') : null;
  if (!vigente()) return;
  // La zona se actualiza sola cada 30 s en Resumen, Trabajo y Servidor (en Usuarios no hay nada que actualizar).
  if (conZona) sistema.empezar(datosSistema);
  const cabecera = cabeceraAdmin(pestana, tonosDePestanas(datosSistema.ok ? datosSistema.datos : null));
  const aviso = avisoArriba ? el('section', { class: 'tarjeta' }, avisoArriba) : null;
  if (pestana === 'trabajo' || pestana === 'servidor') {
    mostrar(marco('admin', cabecera, aviso, el('div', { class: `rejilla dos zona-${pestana}` }, sistema.zona)));
    bajarAlAncla();
    return;
  }
  if (pestana === 'resumen') {
    const usuarios = r.ok ? r.datos.usuarios : [];
    // Dos atajos grandes a lo de siempre: ver los usuarios y crear uno.
    const atajos = el('section', { class: 'tarjeta atajos-tarjeta' },
      titulo('personas', t('admin.usuarios')),
      !r.ok ? el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }) : null,
      el('div', { class: 'atajos' },
        el('a', { class: 'boton-enlace secundario con-icono atajo', href: '#admin/usuarios' }, icono('personas'), el('span', { texto: t('admin.ir.usuarios', { n: numero(usuarios.length) }) })),
        el('button', {
          type: 'button',
          class: 'secundario con-icono atajo',
          onclick: () => { abrirCrearUsuario = true; location.hash = '#admin/usuarios'; },
        }, icono('mas'), el('span', { texto: t('admin.ir.nuevo') }))));
    // Academia (0.7.0): los pasos de los proyectos se cambian por los de la academia (subir el contenido, crear alumnos).
    const guia = datosSistema.ok && contenido.ok
      ? guiaCompacta(pasosAcademia(pasosAdmin({ sistema: datosSistema.datos, ia: ia.ok ? ia.datos : null, proyectos: [] }), { contenido: contenido.datos, usuarios })) : null;
    mostrar(marco('admin', cabecera, aviso, guia,
      el('div', { class: 'rejilla dos admin-resumen' }, sistema.zona, atajos, tarjetaServicios(ia, claves, datosSistema))));
    bajarAlAncla();
    return;
  }
  if (!r.ok) {
    mostrar(marco('admin', cabecera, aviso, el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
    return;
  }
  // Qué se puede hacer desde esta entrada (fase 1, parte d). cuentas: crear, cambiar planes, reiniciar y volver a activar
  // (por el enlace público no, mientras alguna cuenta pueda gastar IA). admins: tocar a otro administrador (solo el dueño,
  // desde su cuenta de Tailscale). Un botón que no serviría no se muestra; una línea corta dice por qué.
  const permisos = { cuentas: r.datos.permisos?.cuentas !== false, admins: r.datos.permisos?.admins === true };
  const ocupados = new Set(r.datos.usuarios.map(u => String(u.nombre).toLowerCase()));
  const mensaje = caja();
  const completo = el('input', { id: 'campo-nombre-completo', name: 'nombreVisible', type: 'text', maxlength: 80, autocomplete: 'off', autocapitalize: 'words' });
  const usuario = el('input', { id: 'campo-nombre', name: 'nombre', type: 'text', maxlength: 40, required: true, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' });
  // Mientras el administrador no escriba el usuario a mano, se va proponiendo solo.
  let usuarioAMano = false;
  completo.addEventListener('input', () => { if (!usuarioAMano) usuario.value = usuarioLibre(usuarioPropuesto(completo.value), ocupados); });
  usuario.addEventListener('input', () => { usuarioAMano = usuario.value.trim() !== ''; });
  const modoClave = el('select', { id: 'campo-clave-modo', name: 'modoClave' },
    el('option', { value: 'alumno', texto: t('admin.nuevo.clave.alumno') }),
    el('option', { value: 'temporal', texto: t('admin.nuevo.clave.temporal') }),
    el('option', { value: 'admin', texto: t('admin.nuevo.clave.admin') }));
  const claveAdmin = el('div', { hidden: true },
    el('label', { for: 'campo-clave-nueva-admin', texto: t('admin.nuevo.clave.escribe') }),
    el('input', { id: 'campo-clave-nueva-admin', name: 'claveAdmin', type: 'text', minlength: 4, maxlength: 200, autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' }));
  const ayudaModo = el('p', { class: 'ayuda con-icono-arriba' }, icono('atencion', 'icono chico'), el('span', { texto: t('admin.nuevo.clave.alumno.ayuda') }));
  modoClave.addEventListener('change', () => {
    claveAdmin.hidden = modoClave.value !== 'admin';
    ayudaModo.hidden = modoClave.value !== 'alumno';
  });
  const formulario = el('form', { novalidate: true },
    el('label', { for: 'campo-nombre-completo', texto: t('admin.nuevo.nombre_completo') }),
    completo,
    el('label', { for: 'campo-nombre', texto: t('admin.nuevo.nombre') }),
    usuario,
    el('p', { class: 'ayuda', texto: t('admin.nuevo.nombre.ayuda') }),
    el('label', { for: 'campo-rol', texto: t('admin.nuevo.rol') }),
    el('select', { id: 'campo-rol', name: 'rol' },
      el('option', { value: 'usuario', texto: t('admin.rol.usuario') }),
      permisos.admins ? el('option', { value: 'admin', texto: t('admin.rol.admin') }) : null),
    permisos.admins ? null : el('p', { class: 'ayuda con-icono-arriba' }, icono('candado', 'icono chico'), el('span', { texto: t('admin.nuevo.rol.solo_dueno') })),
    el('label', { for: 'campo-idioma-nuevo', texto: t('admin.nuevo.idioma') }),
    el('select', { id: 'campo-idioma-nuevo', name: 'idioma' },
      el('option', { value: 'es', texto: t('idioma.es') }),
      el('option', { value: 'en', texto: t('idioma.en') })),
    // 0.9.2: la contraseña: temporal (como siempre), que la cree el alumno al entrar, o la pone el administrador.
    el('label', { for: 'campo-clave-modo', texto: t('admin.nuevo.clave') }),
    modoClave,
    claveAdmin,
    ayudaModo,
    el('button', { type: 'submit', texto: t('admin.nuevo.boton') }),
    mensaje);
  alEnviar(formulario, mensaje, async datos => {
    const nombre = String(datos.get('nombre')).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(nombre)) throw new Error(t('error.nombre_no_valido'));
    const modo = datos.get('modoClave');
    const clave = String(datos.get('claveAdmin') ?? '');
    if (modo === 'admin' && clave.length < 4) throw new Error(t('error.clave_corta'));
    const creado = await api('POST', '/api/admin/usuarios', { nombre, nombreVisible: String(datos.get('nombreVisible')).trim(), rol: datos.get('rol'), idioma: datos.get('idioma'),
      ...(modo === 'alumno' ? { sinClave: true } : modo === 'admin' ? { clave } : {}) });
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
    claveTemporalVisible = { textoClave: 'admin.creado', nombre: creado.datos.nombreVisible || creado.datos.nombre, temporal: creado.datos.claveTemporal, usuario: creado.datos.nombre, pendiente: creado.datos.pendiente === true };
    await pantallaAdmin('usuarios');
    return MANTENER;
  });



  // Ronda 5 de revisión: el permiso de IA de cada cuenta común. Una cuenta creada o tocada (plan, contraseña, activar)
  // desde el enlace público no gasta IA hasta que el dueño, desde su cuenta de Tailscale, se lo da aquí. Antes de darlo
  // se ve cuándo y desde dónde se tocó la cuenta por última vez. Quitarlo se puede desde cualquier entrada.
  const controlIa = u => {
    if (u.rol === 'admin' || !u.ia) return null;
    const permitida = u.ia.permitida === true;
    const ultimo = u.ia.ultimo;
    const mensajeIa = caja();
    const origen = !ultimo ? t('admin.ia.sin_historia')
      : ultimo.vigente === false ? t('admin.ia.cambio_sin_anotar')
        : t('admin.ia.ultimo', { accion: tSi(`admin.ia.accion.${ultimo.accion}`, ultimo.accion), desde: tSi(`admin.ia.desde.${ultimo.desde}`, ultimo.desde), fecha: fecha(ultimo.fecha) });
    const cambiarPermiso = permitir => async () => {
      if (permitir && !confirm(t('admin.ia.confirmar', { nombre: u.nombreVisible || u.nombre, origen }))) return;
      const x = await api('POST', `/api/admin/usuarios/${u.id}/ia`, { permitida: permitir });
      if (!x.ok) throw new Error(textoError(x.datos.error));
      await pantallaAdmin('usuarios', el('p', { class: 'mensaje bien', 'data-foco': true, texto: t(permitir ? 'admin.ia.listo_permitida' : 'admin.ia.listo_retirada', { nombre: u.nombreVisible || u.nombre }) }));
    };
    const boton = permitida ? botonAccion(t('admin.ia.quitar'), 'secundario', mensajeIa, cambiarPermiso(false), 'prohibido')
      : u.activo && permisos.admins ? botonAccion(t('admin.ia.permitir'), 'secundario', mensajeIa, cambiarPermiso(true), 'chispa')
        : null;
    return el('div', { class: 'ia-cuenta' },
      el('p', { class: 'etiquetas' }, insignia(permitida ? 'bien' : 'apagado', t(permitida ? 'admin.ia.permitida' : 'admin.ia.sin_permiso'))),
      el('details', {},
        el('summary', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('admin.ia.detalle') })),
        el('p', { class: 'ayuda', texto: t('admin.ia.explica') }),
        el('p', { class: 'suave', texto: origen }),
        !permitida && u.activo && !permisos.admins ? el('p', { class: 'suave con-icono-arriba' }, icono('candado', 'icono chico'), el('span', { texto: t('admin.ia.solo_dueno') })) : null),
      boton ? el('div', { class: 'botones' }, boton) : null,
      mensajeIa);
  };

  const filas = r.datos.usuarios.map(u => {
    // A otro administrador solo lo toca el dueño; a una cuenta común, reiniciar y activar necesitan «cuentas».
    const esOtroAdmin = u.rol === 'admin' && u.id !== estado.usuario.id;
    const puedeEntrarle = esOtroAdmin ? permisos.admins : permisos.cuentas;
    const puedeApagarla = esOtroAdmin ? permisos.admins : true;
    const puedeActivarla = esOtroAdmin ? permisos.admins : permisos.cuentas;
    const acciones = u.id === estado.usuario.id ? el('p', { class: 'suave', texto: t('admin.tu_cuenta') })
      : esOtroAdmin && !permisos.admins ? el('p', { class: 'suave con-icono-arriba' }, icono('candado', 'icono chico'), el('span', { texto: t('admin.otro_admin') }))
        : el('div', { class: 'botones' },
      // A una cuenta desactivada no se le reinicia la contraseña: no podría entrar con ella.
      !u.activo || !puedeEntrarle ? null : el('button', {
        type: 'button',
        class: 'secundario',
        texto: t('admin.reiniciar'),
        onclick: async () => {
          if (!confirm(t('admin.confirmar_reiniciar', { nombre: u.nombre }))) return;
          const x = await api('POST', `/api/admin/usuarios/${u.id}/reiniciar-clave`, {});
          if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
          claveTemporalVisible = { textoClave: 'admin.reiniciada', nombre: u.nombreVisible || x.datos.nombre, temporal: x.datos.claveTemporal, usuario: x.datos.nombre };
          await pantallaAdmin('usuarios');
        },
      }),
      (u.activo ? !puedeApagarla : !puedeActivarla) ? null : el('button', {
        type: 'button',
        class: u.activo ? 'peligro' : 'secundario',
        texto: t(u.activo ? 'admin.desactivar' : 'admin.activar'),
        onclick: async () => {
          if (!confirm(t(u.activo ? 'admin.confirmar_desactivar' : 'admin.confirmar_activar', { nombre: u.nombreVisible || u.nombre }))) return;
          const x = await api('POST', `/api/admin/usuarios/${u.id}/activo`, { activo: !u.activo });
          if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
          avisar(u.activo ? t('admin.listo.desactivada', { nombre: u.nombreVisible || u.nombre }) : t('admin.listo.activada', { nombre: u.nombreVisible || u.nombre }));
          await pantallaAdmin('usuarios');
        },
      }));
    return el('div', { class: 'fila' },
      el('div', { class: 'fila-cuenta' },
        // 0.9.0: su avatar y su ficha (exámenes, notas, actividad).
        dibujarAvatar(u.avatar ?? null, { nombre: u.nombreVisible || u.nombre, tamano: 'chico' }),
        el('span', { class: 'nombre', texto: u.nombreVisible || u.nombre }),
        el('span', { class: 'etiqueta', texto: t(u.rol === 'admin' ? 'admin.rol.admin' : 'admin.rol.usuario') }),
        insignia(u.activo ? 'bien' : 'mal', t(u.activo ? 'admin.activo' : 'admin.inactivo')),
        u.pendiente ? insignia('atencion', t('admin.pendiente')) : null),
      u.nombreVisible && u.nombreVisible !== u.nombre ? el('p', { class: 'suave', texto: t('admin.usuario_linea', { nombre: u.nombre }) }) : null,
      el('p', { class: 'suave', texto: u.ultimoAcceso ? t('admin.ultimo', { fecha: fecha(u.ultimoAcceso) }) : t('admin.nunca') }),
      el('a', { class: 'enlace-fuerte con-icono-chico ficha-enlace', href: `#alumno/${u.id}` }, icono('grafica', 'icono chico'), el('span', { texto: t('ficha.ver') })),
      u.debeCambiarClave ? el('p', { class: 'suave', texto: t('admin.cambiar_pendiente') }) : null,
      controlIa(u),
      acciones);
  });

  // Pestaña Usuarios: «Crear un usuario» arriba (en el teléfono, cerrado hasta tocarlo; en la PC, abierto a la derecha)
  // y la lista de cuentas (las primeras a la vista y «Ver N más»).
  const soloTailnet = permisos.cuentas ? null : el('p', { class: 'aviso con-icono-arriba' }, icono('candado'), el('span', { texto: t('admin.cuentas_solo_tailnet') }));
  const tarjetaUsuarios = el('section', { class: 'tarjeta tarjeta-usuarios' },
    el('h2', { class: 'con-icono' }, icono('personas'), el('span', { texto: t('admin.usuarios.n', { n: numero(r.datos.usuarios.length) }) })),
    soloTailnet,
    verMas(el('div', { class: 'lista-usuarios' }), filas, 4),
    // Solo está el administrador: se enseña para qué sirve crear otra cuenta, con el botón que abre el formulario.
    r.datos.usuarios.length <= 1 ? vacio('personas', t('admin.usuarios.solo_tu'), permisos.cuentas ? el('button', {
      type: 'button', class: 'secundario con-icono',
      onclick: () => { plegable.open = true; tarjetaNuevo.scrollIntoView({ block: 'start' }); completo.focus({ preventScroll: true }); },
    }, icono('mas'), el('span', { texto: t('admin.ir.nuevo') })) : null) : null);
  const abrir = abrirCrearUsuario;
  abrirCrearUsuario = false;
  const plegable = el('details', { class: 'plegable', open: abrir || pantallaAncha() },
    el('summary', { class: 'con-icono' }, icono('mas'), el('h2', { texto: t('admin.nuevo') })));
  const tarjetaNuevo = el('section', { class: 'tarjeta tarjeta-nuevo' }, plegable);
  plegable.append(permisos.cuentas ? formulario : el('p', { class: 'aviso con-icono-arriba' }, icono('candado'), el('span', { texto: t('admin.cuentas_solo_tailnet') })));
  mostrar(marco('admin', cabecera, aviso,
    el('div', { class: 'rejilla admin-usuarios' }, tarjetaNuevo, tarjetaUsuarios)));
  if (abrir && permisos.cuentas) {
    tarjetaNuevo.scrollIntoView({ block: 'start' });
    completo.focus({ preventScroll: true });
  }
}

// Al llegar a una pestaña desde una tarjeta del resumen con «ancla» (por ejemplo, los errores): baja hasta esa parte.
function bajarAlAncla() {
  const ancla = bajarA;
  bajarA = null;
  if (ancla) raiz.querySelector(`[data-ancla="${ancla}"]`)?.scrollIntoView({ block: 'start' });
}

// ---------- Copias de seguridad (fase 1, parte e) ----------
// #copias: cómo están las copias de un vistazo (una tarjeta grande con su color, su ícono, una palabra y una línea), la
// clave de recuperación, el Telegram y el disco en tarjetas chicas, y lo largo dentro de «Ver…»: las últimas copias y
// «Si un día pierdes el servidor». En el teléfono, lo importante en la primera pantalla; en la PC, 3 columnas.
// Mientras se hace una copia se actualiza cada 3 s (el servidor responde solo con filas de la base: nunca mira la carpeta).
// La clave de recuperación recién creada vive SOLO en la memoria de esta pantalla hasta que se confirma (o hasta salir de
// Copias): nunca se guarda en el navegador ni vuelve al servidor. Al confirmarla y al comprobarla, la página calcula su
// «verificador» (public/clave-recuperacion.js) y manda solo eso.
let claveNueva = null; // { clave, huella, expira, paso: 1 | 2, antes } mientras se crea una clave

const textoMotivoCopia = motivo => {
  const base = motivoBase(motivo);
  return base ? tSi(`copias.motivo.${base}`, t('copias.motivo.otro')) : '';
};
// Un día en la hora de RD: «9 nov 2026».
const diaRd = iso => (iso && Number.isFinite(Date.parse(iso)) ? new Intl.DateTimeFormat(formatoLocal(), { dateStyle: 'medium', timeZone: 'America/Santo_Domingo' }).format(new Date(iso)) : '—');
// Un día corto (sin el año, si es de este año): «9 nov».
const diaCorto = iso => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '—';
  const opciones = { day: 'numeric', month: 'short', timeZone: 'America/Santo_Domingo' };
  if (new Date(iso).getUTCFullYear() !== new Date().getUTCFullYear()) opciones.year = 'numeric';
  return new Intl.DateTimeFormat(formatoLocal(), opciones).format(new Date(iso));
};
// «41 MB» (o «380 KB» para lo que no llega a 1 MB: una copia chica nunca dice «0 MB»).
const tamanoChico = mb => (mb != null && Number(mb) > 0 && Number(mb) < 1 ? `${numero(Math.max(1, Math.round(Number(mb) * 1024)))} KB` : tamano(mb));
const tamanoBytes = bytes => (bytes == null ? '—' : tamanoChico(Number(bytes) / (1024 * 1024)));
// Más de 10 años de disco: no se dice un número enorme.
const DIAS_MUCHOS = 3650;

// El dibujo grande de la tarjeta: el ícono en un círculo de color, con una marca chica (✔, ! o ✖) o el anillo del avance.
function dibujoCopia(v) {
  const caja = el('span', { class: `copias-dibujo tono-${v.tono}`, 'aria-hidden': 'true' }, icono(v.icono, 'icono copias-dibujo-icono'));
  if (v.progreso) {
    const anillo = svgEl('svg', { viewBox: '0 0 64 64', class: `copias-anillo${v.progreso.de ? '' : ' girando'}`, 'aria-hidden': 'true', focusable: 'false' });
    const largo = 2 * Math.PI * 29;
    const parte = v.progreso.de ? Math.max(0.04, Math.min(1, (v.progreso.n ?? 0) / v.progreso.de)) : 0.25;
    anillo.append(svgEl('circle', { cx: 32, cy: 32, r: 29, class: 'copias-anillo-fondo' }),
      svgEl('circle', { cx: 32, cy: 32, r: 29, class: 'copias-anillo-lleno', 'stroke-dasharray': `${(largo * parte).toFixed(1)} ${largo.toFixed(1)}`, transform: 'rotate(-90 32 32)' }));
    caja.append(anillo);
  } else if (v.marca) caja.append(el('span', { class: `copias-marca tono-${v.marca}` }, icono(v.marca === 'bien' ? 'marca' : v.marca === 'mal' ? 'mal' : 'atencion', 'icono chico')));
  return caja;
}

async function pantallaCopias(aviso = null) {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/admin/copias');
  if (!vigente()) return;
  if (!r.ok) {
    mostrar(marco('admin', cabeceraAdmin('copias'), el('section', { class: 'tarjeta' }, titulo('copia', t('copias.titulo')), el('p', { class: 'mensaje error', 'data-foco': true, texto: textoError(r.datos.error) }))));
    return;
  }
  if (claveNueva && r.datos.puede?.crearClave) return dibujarClaveNueva(r.datos, vigente);
  claveNueva = null;
  dibujarCopias(r.datos, aviso, vigente);
}

function dibujarCopias(datos, aviso, vigente) {
  const zona = el('div', { class: 'copias-rejilla' });
  const arriba = el('div', {}, avisoDeArriba(aviso));
  const mensaje = caja();
  const ruta = location.hash;
  // Lo abierto sigue abierto cuando la pantalla se actualiza sola.
  const abierto = { recientes: pantallaAncha(), restaurar: false, clave: false, cambiar: false };
  let reloj = null;
  let anterior = null;
  const sigue = () => vigente() && location.hash === ruta && zona.isConnected;

  async function actualizar() {
    const x = await api('GET', '/api/admin/copias', undefined, { fresco: true });
    if (!sigue()) return;
    if (x.ok) pintar(x.datos);
    else programar(anterior);
  }
  function programar(d) {
    clearTimeout(reloj);
    if (!d?.enCurso) return;
    reloj = setTimeout(() => {
      if (!sigue()) return;
      if (document.hidden) return programar(d);
      actualizar();
    }, 3000);
  }
  function pintar(d) {
    // Al terminar la copia que se estaba haciendo, se dice cómo terminó.
    if (anterior?.enCurso && !d.enCurso && d.ultima) {
      const bien = ['verificada', 'solo_local'].includes(d.ultima.estado);
      decir(mensaje, bien ? t(d.ultima.estado === 'verificada' ? 'copias.lista' : 'copias.lista_local') : t('copias.no_salio', { motivo: textoMotivoCopia(d.ultima.motivo) || t('copias.motivo.otro') }), bien ? 'bien' : 'error');
    }
    anterior = d;
    zona.replaceChildren(...partesDeCopias(d, { abierto, mensaje, actualizar }).filter(Boolean));
    const v = vistaCopias(d);
    const punto = document.querySelector('.pestanas [data-pestana="copias"]');
    if (punto) {
      punto.querySelector('.punto')?.remove();
      if (['mal', 'atencion'].includes(v.tono)) punto.append(el('span', { class: `punto tono-${v.tono}`, 'aria-hidden': 'true' }));
    }
    programar(d);
  }
  mostrar(marco('admin', cabeceraAdmin('copias'), arriba, zona));
  pintar(datos);
}

// Las tarjetas de #copias (se vuelven a dibujar cada 3 s mientras se hace una copia).
function partesDeCopias(d, { abierto, mensaje, actualizar }) {
  const v = vistaCopias(d);
  const ahora = Date.now();
  const f = d.ultimaFuera;
  // ---- La tarjeta grande ----
  const lineaPrincipal = v.linea === 'copias.fallo' ? t('copias.fallo', { motivo: textoMotivoCopia(v.variables.motivo) || t('copias.motivo.otro') })
    : v.linea === 'copias.reintentando' ? t('copias.reintentando', { motivo: t(fraseMotivoTareaCopia(v.variables.motivo, existeFrase)), cuando: cuando(v.variables.cuando, ahora) })
      : v.linea === 'copias.atrasada' ? t('copias.atrasada', { hace: f ? hace(f.fecha, ahora) : '—' })
        : v.linea === 'copias.comprobada' ? null : t(v.linea, { n: numero(v.variables.n ?? 0), de: numero(v.variables.de ?? 0) });
  const botonAhora = el('button', {
    type: 'button', class: 'grande con-icono centrado',
    onclick: async evento => {
      const boton = evento.currentTarget;
      boton.disabled = true;
      mensaje.hidden = true;
      const x = await api('POST', '/api/admin/copias/ahora', {});
      if (!x.ok) {
        boton.disabled = false;
        return decir(mensaje, textoError(x.datos.error), 'error');
      }
      decir(mensaje, t('copias.pedida'), 'bien');
      await actualizar();
    },
  }, icono(v.accion === 'otra_vez' ? 'actualizar' : 'copia'), el('span', { texto: t(v.accion === 'otra_vez' ? 'copias.otra_vez' : 'copias.ahora') }));
  const botonCrear = el('button', {
    type: 'button', class: 'grande con-icono centrado',
    onclick: evento => crearClaveNueva(evento.currentTarget, mensaje, null),
  }, icono('clave_recuperacion'), el('span', { texto: t('copias.clave.crear') }));
  // Revisión final: mientras una copia espera, se hace o se reintenta, la última buena fuera del servidor (cuándo, cuánto
  // mide, comprobada) sigue a la vista: nunca desaparece «lo que ya está a salvo».
  const mientras = ['en_fila', 'haciendo', 'reintentando', 'revisar'].includes(v.estado);
  const conUltima = f && (['bien', 'sin_fijar', 'telegram_problema', 'atrasada', 'fallo'].includes(v.estado) || mientras);
  const ultimaChica = ['atrasada', 'fallo'].includes(v.estado) || mientras;
  const datosUltima = conUltima ? el('p', { class: 'copias-datos' },
    el('span', { texto: tn('copias.partes', { n: f.partes ?? 0, mb: tamanoBytes(f.bytes) }) }),
    v.estado === 'bien' || mientras ? el('span', { class: 'insignia tono-bien' }, icono('marca', 'icono chico'), el('span', { texto: t('copias.comprobada') })) : null) : null;
  const estado = el('section', { class: `tarjeta copias-estado tono-${v.tono}`, 'aria-live': 'polite' },
    el('div', { class: 'copias-estado-cabeza' },
      dibujoCopia(v),
      el('div', { class: 'copias-estado-texto' },
        el('h2', { class: 'copias-titulo', texto: t(v.titulo) }),
        conUltima
          ? el('p', { class: ultimaChica ? 'copias-cuando chico' : 'copias-cuando', texto: ultimaChica ? t('copias.ultima_fuera', { cuando: cuando(f.fecha, ahora) }) : cuando(f.fecha, ahora) })
          : null)),
    lineaPrincipal ? el('p', { class: 'copias-linea fuerte', texto: lineaPrincipal }) : null,
    datosUltima,
    d.clave?.activa && !d.enCurso && !d.modoSeguro && !d.locales?.frenoDisco && d.proxima ? el('p', { class: 'copias-proxima con-icono' }, icono('reloj', 'icono chico'), el('span', { texto: t('copias.proxima', { cuando: cuando(d.proxima, ahora) }) })) : null,
    d.clave?.pendiente && !d.clave.activa ? el('p', { class: 'ayuda', texto: t('copias.clave.pendiente_perdida') }) : null,
    d.clave?.ilegible && !d.clave.activa ? el('p', { class: 'aviso con-icono-arriba' }, icono('atencion', 'icono chico'), el('span', { texto: t('copias.clave.ilegible', { huella: d.clave.ilegible.huella }) })) : null,
    v.accion === 'crear_clave' ? botonCrear : v.accion ? botonAhora : null,
    v.razon ? el('p', { class: 'aviso con-icono-arriba copias-razon' }, icono('info', 'icono chico'), el('span', { texto: t(v.razon) })) : null,
    v.enlace ? el('a', { class: 'boton-enlace secundario con-icono', href: v.enlace.href }, icono('flecha'), el('span', { texto: t(v.enlace.texto) })) : null,
    mensaje);

  // ---- La clave (tarjeta chica) ----
  const c = d.clave ?? {};
  const tarjetaClave = el('section', { class: `tarjeta copias-mini tono-${c.activa ? 'bien' : 'mal'}` },
    el('p', { class: 'copias-mini-titulo con-icono' }, icono('clave_recuperacion', 'icono'), el('span', { texto: c.activa ? t('copias.clave.mini', { huella: c.huella }) : t('copias.clave.mini_falta') })),
    el('p', { class: 'copias-mini-valor', texto: c.activa ? t('copias.clave.desde', { fecha: diaCorto(c.desde) }) : t('copias.clave.mini_falta_texto') }),
    c.activa ? el('p', { class: 'suave', texto: c.comprobadaEn ? t('copias.clave.comprobada_el', { fecha: diaCorto(c.comprobadaEn) }) : t('copias.clave.nunca_comprobada') }) : null,
    c.activa && d.puede?.crearClave ? el('button', {
      type: 'button', class: 'secundario chico con-icono',
      onclick: () => {
        const destino = document.querySelector('[data-ancla="clave"]');
        if (destino) { destino.open = true; abierto.clave = true; destino.scrollIntoView({ behavior: 'smooth', block: 'start' }); destino.querySelector('textarea, input')?.focus({ preventScroll: true }); }
      },
    }, icono('marca', 'icono chico'), el('span', { texto: t('copias.clave.comprobar') })) : null);

  // ---- El Telegram (tarjeta chica, lleva a Claves) ----
  const tg = d.telegram ?? null;
  const vt = vistaAzulejoTelegram(tg);
  const tarjetaTelegram = el('a', { class: `tarjeta copias-mini enlace-mini tono-${vt.tono}`, href: '#claves' },
    el('span', { class: 'copias-mini-titulo con-icono' }, icono('avion_papel', 'icono'), el('span', { texto: t('servicios.telegram') })),
    el('span', { class: 'copias-mini-valor', texto: tg?.chat?.nombre ? t('telegram.azulejo.chat', { nombre: tg.chat.nombre }) : t(vt.valor) }),
    insignia(vt.tono === 'apagado' ? 'apagado' : vt.tono, vt.valor === 'telegram.azulejo.activo' ? t('telegram.unido') : vt.detalle && vt.detalle !== 'telegram.azulejo.chat' ? t(vt.detalle) : t(vt.valor)));

  // ---- El disco de este servidor ----
  const l = d.locales ?? {};
  const vd = vistaDisco(l);
  const tarjetaDisco = el('section', { class: `tarjeta copias-disco tono-${vd.tono}` },
    el('p', { class: 'copias-mini-titulo con-icono' }, icono('disco', 'icono'), el('span', { texto: t('copias.aqui.titulo') })),
    el('div', { class: 'copias-numeros' },
      cifraGrande(numero(l.copias ?? 0), tn('copias.aqui.copias', { n: l.copias ?? 0 })),
      cifraGrande(l.bytes != null ? tamanoBytes(l.bytes) : tamanoChico(l.mb ?? 0), t('copias.aqui.ocupan')),
      cifraGrande(tamano(l.libreMb), t('copias.aqui.libres'), vd.tono === 'bien' ? 'neutro' : vd.tono)),
    vd.linea ? el('p', { class: `aviso-linea tono-${vd.tono}`, texto: t(vd.linea, { n: numero(l.diasRestantes ?? 0) }) }) : null,
    l.diasRestantes != null && !l.pausadas && !l.frenoDisco && l.activas !== false
      ? el('p', { class: 'suave', texto: l.diasRestantes > DIAS_MUCHOS ? t('copias.aqui.dias_muchos') : t('copias.aqui.dias', { n: numero(l.diasRestantes) }) }) : null,
    // Una base restaurada trae las filas de las copias del servidor de antes: sus archivos NO están aquí (ronda 2).
    l.anterior?.copias ? el('p', { class: 'suave con-icono' }, icono('info', 'icono chico'), el('span', { texto: t('copias.aqui.anterior', { n: numero(l.anterior.copias), mb: l.anterior.bytes != null ? tamanoBytes(l.anterior.bytes) : tamanoChico(l.anterior.mb ?? 0) }) })) : null,
    el('details', {},
      el('summary', { class: 'con-icono' }, icono('info', 'icono chico'), el('span', { texto: t('copias.aqui.regla') })),
      el('p', { class: 'ayuda', texto: t('copias.aqui.regla.texto', { piso: tamano(l.pisoMb) }) })));

  // ---- Las últimas copias ----
  const recientes = Array.isArray(d.recientes) ? d.recientes : [];
  const lista = el('ul', { class: 'lista-simple lista-copias' }, recientes.map((x, i) => {
    // La copia que espera otro intento se llama igual que en la tarjeta grande («Reintentando»), no «En curso».
    const reintento = i === 0 && ['reintentando', 'revisar'].includes(v.estado) && ['haciendo', 'escrita', 'subida'].includes(x.estado);
    const tono = reintento ? 'atencion' : TONO_COPIA[x.estado] ?? 'apagado';
    return el('li', { class: `copia-fila tono-${tono}` },
      el('span', { class: 'tono-color copia-fila-icono' }, icono(ICONO_TONO[tono] ?? 'info', 'icono')),
      el('span', { class: 'copia-fila-cuerpo' },
        el('span', { class: 'fuerte', texto: cuando(x.fecha, ahora) }),
        el('span', { class: 'suave', texto: [x.bytes ? tamanoBytes(x.bytes) : null, x.partes ? tn('copias.n_partes', { n: x.partes }) : null, x.origen === 'manual' ? t('copias.origen.manual') : null].filter(Boolean).join(' · ') }),
        el('span', { class: 'copia-fila-donde' },
          x.fuera ? el('span', { class: 'etiqueta con-icono-chico' }, icono('avion_papel', 'icono chico'), el('span', { texto: t('copias.donde.telegram') })) : null,
          x.local ? el('span', { class: 'etiqueta con-icono-chico' }, icono('disco', 'icono chico'), el('span', { texto: t('copias.donde.servidor') })) : null)),
      el('span', { class: 'copia-fila-estado' },
        el('span', { class: `insignia tono-${tono}`, texto: reintento ? t(v.titulo) : tSi(`copias.estado_fila.${x.estado}`, x.estado) }),
        x.motivo && ['fallida', 'interrumpida', 'saltada'].includes(x.estado) ? el('span', { class: 'suave chico', texto: textoMotivoCopia(x.motivo) }) : null));
  }));
  const detallesRecientes = el('details', { class: 'tarjeta copias-recientes', open: abierto.recientes },
    el('summary', { class: 'con-icono' }, icono('fila', 'icono'), el('span', { texto: t('copias.recientes', { n: numero(recientes.length) }) })),
    recientes.length ? lista : vacio('copia', t('copias.recientes.vacio'), null, 'en-linea'));
  detallesRecientes.addEventListener('toggle', () => { abierto.recientes = detallesRecientes.open; });

  // ---- La clave: comprobarla, cambiarla, las de antes (solo el dueño desde Tailscale puede comprobar y cambiar) ----
  const detallesClave = c.activa ? el('details', { class: 'tarjeta copias-gestion', 'data-ancla': 'clave', open: abierto.clave },
    el('summary', { class: 'con-icono' }, icono('clave_recuperacion', 'icono'), el('span', { texto: t('copias.clave.titulo_gestion', { huella: c.huella }) })),
    d.puede?.crearClave ? [formularioComprobarClave([c.huella, ...(c.anteriores ?? []).map(x => x.huella)].filter(Boolean)), bloqueCambiarClave(c, abierto, mensaje)]
      : el('p', { class: 'aviso con-icono-arriba' }, icono('candado'), el('span', { texto: t(razonNoClave(d)) })),
    (c.anteriores ?? []).length ? [
      el('h3', { texto: t('copias.clave.anteriores') }),
      el('ul', { class: 'lista-simple' }, c.anteriores.map(x => el('li', { texto: t('copias.clave.anterior_linea', { huella: x.huella, desde: diaRd(x.desde), hasta: diaRd(x.hasta) }) }))),
      el('p', { class: 'ayuda', texto: t('copias.clave.anteriores_ayuda') }),
    ] : null) : null;
  detallesClave?.addEventListener('toggle', () => { abierto.clave = detallesClave.open; });

  // ---- Si un día pierdes el servidor ----
  const detallesRestaurar = el('details', { class: 'tarjeta copias-restaurar', open: abierto.restaurar },
    el('summary', { class: 'con-icono' }, icono('escudo', 'icono'), el('span', { texto: t('copias.restaurar.titulo') })),
    pasosRestaurar(),
    el('p', { class: 'ayuda', texto: t('copias.restaurar.nota') }));
  detallesRestaurar.addEventListener('toggle', () => { abierto.restaurar = detallesRestaurar.open; });

  // Tres columnas en la PC (cada una con su alto, sin huecos); en el teléfono las columnas no existen (display: contents)
  // y el orden lo pone estilos.css: la tarjeta grande, la clave y el Telegram, el disco, las últimas copias, la clave.
  return [
    el('div', { class: 'copias-col copias-col-1' }, estado, detallesClave),
    el('div', { class: 'copias-col copias-col-2' }, tarjetaClave, tarjetaTelegram, tarjetaDisco),
    el('div', { class: 'copias-col copias-col-3' }, detallesRecientes),
    detallesRestaurar,
  ];
}

// Los pasos para recuperar todo en un servidor nuevo: UNA lista para la pantalla y la hoja impresa, con los mismos
// pasos que el README («Si un día pierdes el servidor»; test/pantallas.test.js compara la cuenta y que esté /revoke).
const PASOS_RESTAURAR = Object.freeze([1, 2, 3, 4, 5, 6]);
function pasosRestaurar() {
  return el('ol', { class: 'pasos-numerados' }, PASOS_RESTAURAR.map(n => el('li', {},
    el('span', { class: 'paso-numero', 'aria-hidden': 'true', texto: String(n) }),
    el('span', { texto: t(`copias.restaurar.paso${n}`) }))));
}

// «Comprobar mi clave»: se escribe; la página la revisa y manda solo su verificador.
function formularioComprobarClave(huellas = []) {
  const id = 'campo-comprobar-clave';
  const campoClave = el('input', { ...ATRIBUTOS_CAMPO_RECUPERACION, id });
  const mensajeComprobar = caja();
  const formulario = el('form', { class: 'form-clave', novalidate: true },
    el('h3', { texto: t('copias.clave.comprobar_titulo') }),
    el('p', { class: 'ayuda', texto: t('copias.clave.comprobar_ayuda') }),
    el('label', { for: id, texto: t('copias.clave.escribela') }),
    campoClave,
    el('button', { type: 'submit', class: 'con-icono' }, icono('marca'), el('span', { texto: t('copias.clave.comprobar_boton') })),
    mensajeComprobar);
  alEnviar(formulario, mensajeComprobar, async () => {
    const escrita = campoClave.value;
    const sobra = huellas.find(h => sobraNombreCorto(escrita, h));
    if (sobra) throw new Error(t('copias.clave.sobra_nombre', { huella: sobra }));
    const calculado = verificadorDe(escrita);
    if (!calculado.ok) throw new Error(textoError(calculado.error));
    const x = await api('POST', '/api/admin/copias/clave/comprobar', { verificador: calculado.verificador });
    if (!x.ok) throw new Error(textoError(x.datos.error));
    campoClave.value = '';
    const r = x.datos;
    if (r.resultado === 'actual') {
      const u = r.ultimaCopia;
      decir(mensajeComprobar, u ? t('copias.clave.actual', { huella: r.huella, desde: diaRd(r.desde), mb: tamanoBytes(u.bytes), tablas: numero(u.tablas ?? 0) }) : t('copias.clave.actual_sin_copia', { huella: r.huella, desde: diaRd(r.desde) }), 'bien');
    } else if (r.resultado === 'anterior') {
      decir(mensajeComprobar, t('copias.clave.anterior', { huella: r.huella, hasta: diaRd(r.hasta) }), 'bien');
    } else decir(mensajeComprobar, t('copias.clave.no_es'), 'error');
  });
  return formulario;
}

// «Cambiar mi clave» (cerrado, con su advertencia): las copias de antes siguen necesitando la clave de antes.
function bloqueCambiarClave(c, abierto, mensaje) {
  const cambiar = el('details', { class: 'cambiar-clave', open: abierto.cambiar },
    el('summary', { class: 'con-icono' }, icono('lapiz', 'icono chico'), el('span', { texto: t('copias.clave.cambiar') })),
    el('p', { class: 'aviso', texto: t('copias.clave.cambiar_aviso', { huella: c.huella }) }),
    el('button', { type: 'button', class: 'secundario con-icono', onclick: evento => crearClaveNueva(evento.currentTarget, mensaje, c.huella) },
      icono('clave_recuperacion'), el('span', { texto: t('copias.clave.crear_otra') })));
  cambiar.addEventListener('toggle', () => { abierto.cambiar = cambiar.open; });
  return cambiar;
}

// El cuadro donde se escribe la clave de recuperación: una línea, sin autocompletar, sin corrector, en mayúsculas.
const ATRIBUTOS_CAMPO_RECUPERACION = Object.freeze({
  type: 'text', class: 'campo-recuperacion', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'characters', spellcheck: 'false',
  'data-1p-ignore': 'true', 'data-lpignore': 'true', 'data-form-type': 'other', enterkeyhint: 'done', maxlength: 48, placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
});

// «Crear mi clave de recuperación» (o una nueva, al cambiarla): el servidor la crea y la muestra UNA vez.
async function crearClaveNueva(boton, mensaje, antes) {
  if (antes && !confirm(t('copias.clave.cambiar_confirmar', { huella: antes }))) return;
  boton.disabled = true;
  mensaje.hidden = true;
  const x = await api('POST', '/api/admin/copias/clave/nueva', {});
  if (!x.ok) {
    boton.disabled = false;
    return decir(mensaje, textoError(x.datos.error), 'error');
  }
  claveNueva = { clave: x.datos.clave, huella: x.datos.huella, expira: x.datos.expira, paso: 1, antes };
  await pantallaCopias();
}

// Copiar al portapapeles (en una dirección http:// de Tailscale el navegador no deja usar navigator.clipboard: se
// copia con el método de antes). → true si se copió.
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch { /* se prueba de la otra forma */ }
  const area = el('textarea', { class: 'solo-lectores', readonly: true, 'aria-hidden': 'true', tabindex: '-1' });
  area.value = texto;
  document.body.append(area);
  area.select();
  let copiado = false;
  try { copiado = document.execCommand('copy'); } catch { copiado = false; }
  area.value = '';
  area.remove();
  return copiado;
}

// La hoja para imprimir (solo se ve al imprimir: estilos.css, @media print). Se quita sola después.
function hojaDeLaClave(clave, huella) {
  return el('section', { class: 'hoja-clave' },
    el('h1', { texto: t('copias.clave.hoja.titulo') }),
    el('p', { texto: t('copias.clave.hoja.fecha', { fecha: fecha(new Date().toISOString()), huella }) }),
    el('p', { class: 'hoja-clave-grupos' }, gruposDeClave(clave).map(g => el('span', { texto: g }))),
    el('p', { class: 'fuerte', texto: t('copias.clave.unica') }),
    el('p', { texto: t('copias.clave.no_compartir') }),
    el('h2', { texto: t('copias.restaurar.titulo') }),
    pasosRestaurar(),
    el('p', { class: 'fuerte', texto: t('copias.clave.hoja.guardala') }));
}

// El paso a paso de la clave nueva: ① verla y guardarla, ② escribirla otra vez mirando el papel.
function dibujarClaveNueva(datos, vigente) {
  const n = claveNueva;
  const mensaje = caja();
  const cancelar = el('button', {
    type: 'button', class: 'secundario',
    texto: t('copias.clave.cancelar'),
    onclick: () => {
      if (!confirm(n.antes ? t('copias.clave.cancelar_confirmar_cambio', { huella: n.antes }) : t('copias.clave.cancelar_confirmar'))) return;
      claveNueva = null;
      pantallaCopias({ texto: n.antes ? t('copias.clave.cancelada_cambio', { huella: n.antes }) : t('copias.clave.cancelada'), clase: 'aviso' });
    },
  });
  const vence = el('p', { class: 'ayuda con-icono' }, icono('reloj', 'icono chico'), el('span', { texto: t('copias.clave.vence', { hora: cuando(n.expira) }) }));
  const cabeza = (numeroPaso, texto) => el('h2', { class: 'paso-titulo' }, el('span', { class: 'paso-numero', texto: String(numeroPaso) }), el('span', { texto }));
  let tarjeta;
  if (n.paso === 1) {
    const grupos = gruposDeClave(n.clave);
    const botonCopiar = el('button', {
      type: 'button', class: 'secundario con-icono',
      onclick: async () => {
        const copiado = await copiarTexto(grupos.join('-'));
        decir(mensaje, t(copiado ? 'copias.clave.copiada' : 'copias.clave.no_copiada'), copiado ? 'bien' : 'error');
      },
    }, icono('copiar'), el('span', { texto: t('copias.clave.copiar') }));
    const botonImprimir = el('button', {
      type: 'button', class: 'secundario con-icono',
      onclick: () => {
        const hoja = hojaDeLaClave(n.clave, n.huella);
        document.body.append(hoja);
        const quitar = () => hoja.remove();
        window.addEventListener('afterprint', quitar, { once: true });
        try { window.print(); } catch { quitar(); }
        setTimeout(() => { if (!window.matchMedia?.('print').matches) quitar(); }, 60_000);
      },
    }, icono('imprimir'), el('span', { texto: t('copias.clave.imprimir') }));
    tarjeta = el('section', { class: 'tarjeta clave-nueva' },
      el('div', { class: 'clave-nueva-cabeza' }, cabeza(1, t('copias.clave.tu_clave'))),
      el('p', { class: 'clave-recuperacion', 'aria-label': t('copias.clave.tu_clave') }, grupos.map(g => el('span', { class: 'clave-grupo', texto: g }))),
      // Revisión final: el nombre corto va DEBAJO de la clave y dice que no es parte de ella (antes estaba justo encima,
      // con el mismo formato que los grupos, y se copiaba al papel como si fuera el primero).
      el('p', { class: 'suave con-icono' }, icono('info', 'icono chico'), el('span', { texto: t('copias.clave.nombre_corto', { huella: n.huella }) })),
      el('ul', { class: 'lista-iconos clave-consejos' },
        el('li', {}, icono('lapiz', 'icono'), el('span', { texto: t('copias.clave.guardala') })),
        el('li', { class: 'fuerte' }, icono('candado', 'icono'), el('span', { texto: t('copias.clave.unica') })),
        el('li', {}, icono('prohibido', 'icono'), el('span', { texto: t('copias.clave.no_compartir') }))),
      el('div', { class: 'botones clave-botones' },
        botonCopiar, botonImprimir,
        el('button', { type: 'button', class: 'con-icono', onclick: () => { claveNueva.paso = 2; dibujarClaveNueva(datos, vigente); } },
          el('span', { texto: t('copias.clave.ya_guarde') }), icono('flecha'))),
      mensaje, vence, cancelar);
  } else {
    const id = 'campo-clave-repite';
    const campoClave = el('input', { ...ATRIBUTOS_CAMPO_RECUPERACION, id, 'aria-describedby': `${id}-ayuda` });
    const formulario = el('form', { class: 'form-clave', novalidate: true },
      el('label', { for: id, texto: t('copias.clave.repite') }),
      el('p', { class: 'ayuda', id: `${id}-ayuda`, texto: t('copias.clave.repite_ayuda') }),
      campoClave,
      el('button', { type: 'submit', class: 'grande con-icono centrado' }, icono('marca'), el('span', { texto: t('copias.clave.comprobar_boton') })),
      mensaje);
    alEnviar(formulario, mensaje, async () => {
      const escrita = campoClave.value;
      if (sobraNombreCorto(escrita, n.huella)) throw new Error(t('copias.clave.sobra_nombre', { huella: n.huella }));
      // Primero, grupo por grupo contra la que se mostró (sigue en la memoria de esta pantalla).
      const leida = leerClave(escrita);
      if (!leida.ok && leida.error === 'clave_formato') throw new Error(textoError('clave_formato'));
      if (leida.ok) leida.semilla.fill(0);
      const grupo = grupoDistinto(n.clave, escrita);
      if (grupo) throw new Error(t('copias.clave.grupo_mal', { n: grupo }));
      // Coincide: el verificador de lo ESCRITO es lo único que viaja.
      const calculado = verificadorDe(escrita);
      if (!calculado.ok) throw new Error(textoError(calculado.error));
      const x = await api('POST', '/api/admin/copias/clave/confirmar', { verificador: calculado.verificador });
      if (!x.ok) {
        if (x.datos.error === 'sin_pendiente') {
          claveNueva = null;
          await pantallaCopias({ texto: textoError('sin_pendiente'), clase: 'aviso' });
          return MANTENER;
        }
        throw new Error(textoError(x.datos.error));
      }
      campoClave.value = '';
      claveNueva = null;
      await pantallaCopias({ texto: t('copias.clave.lista', { huella: x.datos.activa.huella }), clase: 'bien' });
      return MANTENER;
    });
    tarjeta = el('section', { class: 'tarjeta clave-nueva' },
      el('div', { class: 'clave-nueva-cabeza' }, cabeza(2, t('copias.clave.repite_titulo')), el('span', { class: 'insignia tono-info', texto: t('copias.clave.mini', { huella: n.huella }) })),
      formulario,
      el('div', { class: 'botones' },
        el('button', { type: 'button', class: 'secundario con-icono', onclick: () => { claveNueva.paso = 1; dibujarClaveNueva(datos, vigente); } },
          icono('ojo'), el('span', { texto: t('copias.clave.ver_otra_vez') })),
        cancelar),
      vence);
  }
  const porQue = el('section', { class: 'tarjeta nota clave-por-que' },
    el('p', { class: 'con-icono-arriba' }, icono('info'), el('span', { texto: t(n.antes ? 'copias.clave.por_que_cambio' : 'copias.clave.por_que', { huella: n.antes ?? '' }) })));
  mostrar(marco('admin', cabeceraAdmin('copias'), el('div', { class: 'rejilla clave-pasos' }, tarjeta, porQue)));
  if (n.paso === 2) document.getElementById('campo-clave-repite')?.focus({ preventScroll: true });
}

// ---------- IA opcional y Claves (fase 1, parte d) ----------
// La IA es una ayuda que cuesta dinero: llega APAGADA y con tope US$0, y OPORTIA funciona completo sin ella. Estas
// pantallas la muestran de un vistazo (tarjetas de color, números grandes, la barra de lo gastado contra el tope) y dejan
// los detalles dentro de «Ver…». Por el enlace público solo se ve el gasto y se puede APAGAR. Las claves y todo lo que
// gasta solo se cambian desde la cuenta de Tailscale del dueño, y de una clave solo se ven sus últimos 4 caracteres.
// Las decisiones (qué botón aparece, qué se ve en cada caso) están en public/ia-vista.js, que también se prueba solo.
const formatoLocal = () => (idioma === 'en' ? 'en-US' : 'es-DO');

// Dinero de la IA: llega en millonésimas de dólar. «US$0.12» desde un centavo; debajo, hasta 4 decimales («US$0.0022»).
// usdMaximo: lo MÁXIMO que puede costar (redondeado hacia arriba: nunca se muestra menos de lo que se aparta).
const usd = micro => textoUsd(micro, formatoLocal());
// «2.00»: el tope como se escribe en su cuadro.
const dolaresParaEscribir = micro => (Number(micro || 0) / 1_000_000).toFixed(2);
// El día y la hora en RD: «30 de noviembre a las 8:00 p. m.» (el mes de la IA empieza a esa hora en RD).
function fechaHora(iso) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  return new Intl.DateTimeFormat(formatoLocal(), { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Santo_Domingo' }).format(new Date(iso));
}
// Un mes de cobro 'AAAA-MM' en palabras: «noviembre» (o «noviembre de 2026»).
function nombreMes(mes, conAnio = false) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ''));
  if (!m) return String(mes ?? '');
  return new Intl.DateTimeFormat(formatoLocal(), { month: 'long', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)));
}
// Un día 'AAAA-MM-DD' (cuándo se revisó un precio).
function fechaDia(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? ''));
  if (!m) return String(texto ?? '');
  return new Intl.DateTimeFormat(formatoLocal(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}
const nombreProveedor = id => tSi(`ia.proveedor.${id}`, id ?? '?');
const textoMotivoIa = motivo => (motivo ? tSi(`ia.motivo.${motivo}`, motivo) : '');
function textoAmbito(ambito) {
  const m = /^([ep])(\d+)$/.exec(String(ambito ?? ''));
  if (!m) return t('ia.ambito.general');
  return m[1] === 'e' ? t('ia.ambito.e', { id: m[2] }) : t('ia.ambito.p', { id: m[2] });
}
// Por qué un cambio apagó la IA (ronda 4 de revisión): «La IA se apagó porque …».
function textoApagadaPor(f) {
  if (f === 'proveedor') return t('ia.apagada_por.proveedor');
  if (f === 'tope') return t('ia.apagada_por.tope');
  if (f === 'precio') return t('ia.apagada_por.precio');
  return t('ia.apagada_por.clave');
}
function textoFalta(f) {
  if (f === 'proveedor') return t('ia.falta.proveedor');
  if (f === 'clave') return t('ia.falta.clave');
  if (f === 'tope') return t('ia.falta.tope');
  if (f === 'precio') return t('ia.falta.precio');
  if (f === 'encendida') return t('ia.falta.encendida');
  return String(f);
}

// La barra de lo gastado contra el tope: lo real (verde, amarillo desde el 80 %, rojo al llegar), lo apartado para
// usos en curso (rayado) y dos rayitas en el 50 y el 80 %, donde salen los avisos.
function barraGasto(datos, { conMarcas = true } = {}) {
  const p = partesBarraGasto(datos);
  const real = el('span', { class: `barra-gasto-real tono-${p.tono}` });
  real.style.width = `${p.realPct}%`;
  const apartado = el('span', { class: 'barra-gasto-apartado' });
  apartado.style.left = `${p.realPct}%`;
  apartado.style.width = `${p.apartadoPct}%`;
  apartado.hidden = !p.apartadoPct;
  const rayitas = conMarcas ? MARCAS_GASTO.map(m => { const x = el('span', { class: 'barra-gasto-marca' }); x.style.left = `${m}%`; return x; }) : [];
  const barra = el('span', { class: 'barra-gasto', 'aria-hidden': 'true' }, real, apartado, rayitas);
  if (!conMarcas) return barra;
  return el('span', { class: 'barra-gasto-caja', 'aria-hidden': 'true' }, barra,
    el('span', { class: 'barra-gasto-textos' }, MARCAS_GASTO.map(m => { const x = el('span', { texto: t('ia.gasto.marca', { pct: m }) }); x.style.left = `${m}%`; return x; })));
}

// Un interruptor (como los del iPhone): VoiceOver lo lee como «interruptor, activado».
function interruptor(texto, encendido, alTocar) {
  const boton = el('button', { type: 'button', role: 'switch', class: 'interruptor', 'aria-checked': encendido ? 'true' : 'false', onclick: () => alTocar(boton) },
    el('span', { class: 'interruptor-texto', texto }),
    el('span', { class: 'interruptor-riel', 'aria-hidden': 'true' }, el('span', { class: 'interruptor-bola' })));
  return boton;
}

// Un número grande que es un texto ya armado (por ejemplo, dinero).
function cifraGrande(texto, etiqueta, tono = 'neutro') {
  return el('div', { class: `numero tono-${tono}` },
    el('span', { class: 'numero-valor numero-texto', texto }),
    el('span', { class: 'numero-etiqueta', texto: etiqueta }));
}


// ---- Administrador → «Servicios»: dos tarjetas que llevan a la IA y a las Claves ----
function azulejoIa(r) {
  const base = { nombreIcono: 'chispa', titulo: t('servicios.ia'), destino: '#ia' };
  if (!r?.ok) return tarjetaResumen({ ...base, valor: '—', detalle: textoError(r?.datos?.error), tono: 'apagado' });
  const s = r.datos;
  if (!s.encendida) return tarjetaResumen({ ...base, valor: t('servicios.ia.apagada'), detalle: t('servicios.ia.apagada.detalle'), tono: 'apagado' });
  const partes = partesBarraGasto({ usadoMicro: s.usadoMicro, apartadoMicro: s.apartadoMicro, topeMicro: s.topeGeneralMicro });
  const tono = s.estado === 'tope_lleno' ? 'mal' : s.estado === 'sin_uso' ? 'atencion' : partes.tono;
  const detalle = s.estado === 'sin_uso' ? textoMotivoIa(s.motivo) : s.estado === 'tope_lleno' ? t('ia.estado.tope_lleno.corto') : t('servicios.ia.mes', { mes: nombreMes(s.mes) });
  return tarjetaResumen({
    ...base, tono, detalle,
    valor: t('servicios.ia.uso', { usado: usd(s.usadoMicro), tope: usd(s.topeGeneralMicro) }),
    extra: barraGasto({ usadoMicro: s.usadoMicro, apartadoMicro: s.apartadoMicro, topeMicro: s.topeGeneralMicro, lleno: s.estado === 'tope_lleno' }, { conMarcas: false }),
  });
}
function azulejoClaves(ia, claves) {
  const base = { nombreIcono: 'llave', titulo: t('servicios.claves'), destino: '#claves' };
  if (!ia?.ok || !ia.datos.esDueno || !claves?.ok) {
    const valor = ia?.ok && ia.datos.motivoDueno === 'solo_el_dueno' ? t('servicios.claves.solo_el_dueno') : t('servicios.claves.tailnet');
    return tarjetaResumen({ ...base, valor, tono: 'apagado', iconoTono: 'candado' });
  }
  const activas = (claves.datos.grupos ?? []).flatMap(g => g.usos ?? []).filter(u => u.activa);
  const tonos = activas.map(u => estadoDeClave(u.activa).tono);
  const tono = !activas.length ? 'apagado' : tonos.includes('mal') ? 'mal' : tonos.includes('atencion') ? 'atencion' : 'bien';
  return tarjetaResumen({
    ...base, tono,
    valor: activas.length ? tn('servicios.claves.n', { n: activas.length }) : t('servicios.claves.ninguna'),
    detalle: activas.length ? activas.map(u => t('servicios.claves.una', { nombre: tSi(`claves.corto.${u.uso}`, u.uso), final: u.activa.final })).join(' · ') : t('claves.agregar'),
  });
}
// Fase 1, parte e: las copias fuera del servidor y el Telegram (de GET /api/admin/sistema: no se pide nada más).
function azulejoCopias(sistema) {
  const s = sistema?.ok ? sistema.datos : null;
  const v = vistaAzulejoCopias(s?.copias, { modoSeguro: s?.modoSeguro?.activo });
  const valor = v.valor.fecha ? (v.valor.clave === 'copias.azulejo.hace' ? hace(v.valor.fecha) : cuando(v.valor.fecha)) : t(v.valor.clave);
  return tarjetaResumen({ nombreIcono: 'nube_candado', titulo: t('servicios.copias'), valor, detalle: v.detalle ? t(v.detalle) : null, tono: v.tono, destino: '#copias' });
}
function azulejoTelegram(sistema) {
  const tg = sistema?.ok ? sistema.datos.telegram : null;
  const v = vistaAzulejoTelegram(tg);
  return tarjetaResumen({
    nombreIcono: 'avion_papel', titulo: t('servicios.telegram'), valor: t(v.valor), tono: v.tono, destino: '#claves',
    detalle: v.detalle === 'telegram.azulejo.chat' ? t('telegram.azulejo.chat', { nombre: tg.chat.nombre }) : v.detalle ? t(v.detalle) : null,
  });
}
function tarjetaServicios(ia, claves, sistema = null) {
  return el('section', { class: 'tarjeta servicios' },
    el('h2', { texto: t('servicios.titulo') }),
    el('div', { class: 'resumen-rejilla rejilla-2' }, azulejoIa(ia), azulejoClaves(ia, claves), azulejoCopias(sistema), azulejoTelegram(sistema)));
}

// ---- #ia: Administrador → Inteligencia artificial ----
async function pantallaIa(aviso = null) {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/admin/ia');
  if (!vigente()) return;
  if (!r.ok) {
    mostrar(marco('admin', cabeceraAdmin('ia'), el('section', { class: 'tarjeta' }, el('h2', { texto: t('ia.titulo') }), el('p', { class: 'mensaje error', 'data-foco': true, texto: textoError(r.datos.error) }))));
    return;
  }
  dibujarIa(r.datos, aviso, vigente);
}

function dibujarIa(s, aviso, vigente) {
  const dueno = s.esDueno === true;
  const proveedores = Array.isArray(s.proveedores) ? s.proveedores : [];
  const elegido = proveedores.find(p => p.usable) ?? proveedores.find(p => p.usar) ?? null;
  const modelo = elegido?.precio?.nombre || nombreModelo(s.modelo);
  const proveedor = nombreProveedor(elegido?.id ?? 'anthropic');
  const tope = usd(s.topeGeneralMicro);

  // Un cambio: el botón se apaga mientras espera; al terminar se dibuja todo con lo que respondió el servidor.
  async function cambiar(boton, cajaMensaje, ruta, datos, listo) {
    boton.disabled = true;
    cajaMensaje.hidden = true;
    const x = await api('POST', ruta, datos);
    if (!vigente()) return;
    if (!x.ok) {
      boton.disabled = false;
      const faltan = Array.isArray(x.datos.faltan) ? x.datos.faltan : [];
      decir(cajaMensaje, faltan.length ? `${textoError(x.datos.error)} ${unir(faltan.map(textoFalta))}.` : textoError(x.datos.error), 'error');
      return;
    }
    const hecho = typeof listo === 'function' ? listo(x.datos) : listo;
    // Ronda 4 de revisión: si el cambio apagó la IA (sin pedirlo), se dice por qué, nunca en silencio.
    const apagadaPor = Array.isArray(x.datos.apagadaPor) ? x.datos.apagadaPor : [];
    const textoHecho = hecho && typeof hecho === 'object' ? hecho.texto : hecho;
    dibujarIa(x.datos, apagadaPor.length
      ? { texto: [textoHecho, t('ia.apagada_por', { motivo: unir(apagadaPor.map(textoApagadaPor)) })].filter(Boolean).join(' '), clase: 'aviso' }
      : hecho, vigente);
  }

  // ---- 1. El estado: apagada, encendida, encendida pero sin uso, o tope lleno ----
  const mensajeEstado = caja();
  const tono = { encendida: 'bien', sin_uso: 'atencion', tope_lleno: 'mal' }[s.estado] ?? 'apagado';
  const nombreEstado = s.estado === 'tope_lleno' ? t('ia.estado.tope_lleno.corto') : s.estado === 'sin_uso' ? t('ia.estado.sin_uso.corto')
    : s.encendida ? t('ia.estado.encendida') : t('ia.estado.apagada');
  const textoEstado = s.estado === 'tope_lleno' ? t('ia.estado.tope_lleno', { fecha: fechaHora(s.vuelveEl) })
    : s.estado === 'sin_uso' ? t('ia.estado.sin_uso', { motivo: textoMotivoIa(s.motivo) })
      : s.encendida ? t('ia.estado.encendida.texto', { modelo, tope }) : t('ia.estado.apagada.texto');
  const faltan = Array.isArray(s.faltan) ? s.faltan : [];
  const listaParaEncender = dueno && !s.encendida ? [
    el('p', { class: 'fuerte', texto: t('ia.para_encender') }),
    el('ul', { class: 'lista-falta' }, cosasParaEncender(faltan).map(f => {
      const listo = !faltan.includes(f);
      return el('li', { class: `tono-${listo ? 'bien' : 'atencion'}` }, icono(listo ? 'bien' : 'mal', 'icono'),
        el('span', { texto: textoFalta(f) }), el('span', { class: 'solo-lectores', texto: listo ? t('ia.falta.listo') : t('ia.falta.pendiente') }));
    })),
    faltan.includes('clave') ? el('a', { class: 'boton-enlace secundario con-icono', href: '#claves' }, icono('llave'), el('span', { texto: t('ia.ir_claves') })) : null,
  ] : null;
  const encender = dueno && !s.encendida && !faltan.length ? el('button', {
    type: 'button', class: 'grande con-icono centrado',
    onclick: evento => {
      if (!confirm(t('ia.encender.confirmar', { proveedor, tope }))) return;
      cambiar(evento.currentTarget, mensajeEstado, '/api/admin/ia/ajustes', { encendida: true }, x => t('ia.encender.listo', { tope: usd(x.topeGeneralMicro) }));
    },
  }, icono('encendido'), el('span', { texto: t('ia.encender') })) : null;
  // Apagar se puede siempre, también por el enlace público: nunca gasta.
  const apagar = s.encendida ? el('button', {
    type: 'button', class: 'peligro grande con-icono centrado',
    onclick: evento => {
      if (!confirm(t('ia.apagar.confirmar'))) return;
      cambiar(evento.currentTarget, mensajeEstado, '/api/admin/ia/apagar', {}, t('ia.apagar.listo'));
    },
  }, icono('encendido'), el('span', { texto: t('ia.apagar') })) : null;
  const tarjetaEstadoIa = el('section', { class: 'tarjeta' },
    avisoDeArriba(aviso),
    el('h2', { class: 'con-icono titulo-tarjeta' }, icono('chispa', 'icono grande'), el('span', { texto: t('ia.titulo') }), queEs('ia')),
    el('div', { class: `estado-grande tono-${tono}` }, icono('encendido', 'icono estado'), el('span', { texto: nombreEstado })),
    el('p', { class: 'fuerte', texto: textoEstado }),
    s.estado === 'sin_uso' && dueno ? el('a', { class: 'boton-enlace secundario con-icono', href: '#claves' }, icono('llave'), el('span', { texto: t('ia.ir_claves') })) : null,
    s.encendida && s.modoSeguro ? el('p', { class: 'aviso', texto: t('ayuda_ia.pausa') }) : null,
    listaParaEncender,
    encender,
    apagar,
    !s.enTailnet ? el('p', { class: 'suave con-icono-arriba' }, icono('candado'), el('span', { texto: t('ia.solo_tailnet') }))
      : !dueno ? el('p', { class: 'suave con-icono-arriba' }, icono('candado'), el('span', { texto: t(s.motivoDueno === 'solo_el_dueno' ? 'ia.solo_el_dueno' : 'ia.solo_dueno') })) : null,
    el('details', { class: 'en-palabras' },
      el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: t('ia.que_es') })),
      el('p', { texto: t('ia.explica') }),
      el('p', { texto: t('ia.que_es.texto') })),
    mensajeEstado);

  // ---- 2. El gasto del mes: el número grande, la barra contra el tope y, para el dueño, los detalles ----
  const lleno = s.estado === 'tope_lleno';
  const partes = partesBarraGasto({ usadoMicro: s.usadoMicro, apartadoMicro: s.apartadoMicro, topeMicro: s.topeGeneralMicro, lleno });
  const sinNada = !s.usadoMicro && !(s.llamadasMes > 0);
  const tarjetaGasto = el('section', { class: 'tarjeta' },
    titulo('grafica', t('ia.gasto.titulo', { mes: nombreMes(s.mes) })),
    el('div', { class: 'gasto-cifras' },
      el('span', { class: `gasto-grande tono-${s.usadoMicro > 0 ? partes.tono : 'neutro'}`, texto: usd(s.usadoMicro) }),
      el('span', { class: 'gasto-de', texto: t('ia.gasto.de', { tope }) })),
    barraGasto({ usadoMicro: s.usadoMicro, apartadoMicro: s.apartadoMicro, topeMicro: s.topeGeneralMicro, lleno }),
    s.apartadoMicro > 0 ? el('p', { class: 'ayuda', texto: t('ia.gasto.apartado', { monto: usd(s.apartadoMicro) }) }) : null,
    el('p', { class: 'suave con-icono' }, icono('calendario', 'icono chico'), el('span', { texto: t('ia.gasto.reinicia', { fecha: fechaHora(s.vuelveEl) }) })),
    dueno ? el('div', { class: 'numeros' },
      numeroGrande(s.llamadasMes ?? 0, t('ia.gasto.usos'), 'info'),
      numeroGrande(s.bloqueosMes ?? 0, t('ia.gasto.sin_ia'), 'atencion'),
      cifraGrande(usd(s.tipicoMicro), t('ia.gasto.tipico'))) : null,
    dueno && sinNada ? el('p', { class: 'suave', texto: t('ia.gasto.vacio') }) : null,
    dueno && s.enTailnet ? detalleDelGasto(s.mes) : null);
  if (!dueno) {
    mostrar(marco('admin', cabeceraAdmin('ia'), el('div', { class: 'rejilla dos' }, tarjetaEstadoIa, tarjetaGasto)));
    return;
  }

  // ---- 3. El tope del mes (y los de las otras cuentas) ----
  const mensajeTope = caja();
  const campoTope = el('input', { id: 'ia-tope', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: dolaresParaEscribir(s.topeGeneralMicro), 'aria-describedby': 'ia-tope-ayuda' });
  const planes = Object.keys(s.topesPlanMicro ?? {});
  const camposPlan = planes.map(plan => el('input', { id: `ia-tope-${plan}`, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: dolaresParaEscribir(s.topesPlanMicro[plan]) }));
  const tarjetaTope = el('section', { class: 'tarjeta' },
    titulo('dinero', t('ia.tope.titulo'), undefined, 'tope'),
    el('label', { for: 'ia-tope', texto: t('ia.tope.etiqueta') }),
    el('div', { class: 'campo-dinero' }, el('span', { class: 'campo-dinero-signo', 'aria-hidden': 'true', texto: 'US$' }), campoTope),
    el('p', { class: 'ayuda', id: 'ia-tope-ayuda', texto: t('ia.tope.ayuda') }),
    el('button', {
      type: 'button', class: 'con-icono',
      onclick: evento => {
        const valor = leerDolares(campoTope.value);
        if (valor == null) return decir(mensajeTope, textoError('tope_no_valido'), 'error');
        cambiar(evento.currentTarget, mensajeTope, '/api/admin/ia/ajustes', { topeGeneralUsd: valor }, t('ia.tope.listo'));
      },
    }, icono('marca'), el('span', { texto: t('ia.tope.guardar') })),
    mensajeTope,
    planes.length ? el('details', {},
      el('summary', { class: 'con-icono' }, icono('personas'), el('span', { texto: t('ia.planes.titulo') })),
      el('p', { class: 'ayuda', texto: t('ia.planes.ayuda') }),
      // Ronda 5 de revisión: un tope de plan solo lo usan las cuentas con el permiso de IA del dueño (Administrador → Usuarios).
      s.cuentas ? el('p', { class: 'suave con-icono' }, icono('personas', 'icono chico'),
        el('span', { texto: t('ia.planes.cuentas', { si: numero(s.cuentas.permitidas ?? 0), no: numero(s.cuentas.sinPermiso ?? 0) }) })) : null,
      s.cuentas?.sinPermiso > 0 ? el('p', {}, el('a', { href: '#admin/usuarios', texto: t('ia.planes.ir_permisos') })) : null,
      planes.map((plan, i) => [el('label', { for: `ia-tope-${plan}`, texto: t(`ia.plan.${plan}`) }),
        el('div', { class: 'campo-dinero' }, el('span', { class: 'campo-dinero-signo', 'aria-hidden': 'true', texto: 'US$' }), camposPlan[i])]),
      el('button', {
        type: 'button', class: 'secundario con-icono',
        onclick: evento => {
          const valores = {};
          for (const [i, plan] of planes.entries()) {
            const valor = leerDolares(camposPlan[i].value);
            if (valor == null) return decir(mensajeTope, textoError('tope_no_valido'), 'error');
            valores[plan] = valor;
          }
          cambiar(evento.currentTarget, mensajeTope, '/api/admin/ia/ajustes', { topesPlanUsd: valores }, t('ia.tope.listo'));
        },
      }, icono('marca'), el('span', { texto: t('ia.planes.guardar') }))) : null,
    el('details', {},
      el('summary', { class: 'con-icono' }, icono('calendario'), el('span', { texto: t('ia.mes.titulo') })),
      el('p', { texto: t('ia.mes.texto') })));

  // ---- 4. (0.8.0: «Ayuda en proyectos» se quitó con los proyectos de OPORTIA) ----

  // ---- 5. Los proveedores (el interruptor «Usar …» solo existe si su precio oficial está confirmado) ----
  const mensajeProveedores = caja();
  const tarjetaProveedores = el('section', { class: 'tarjeta' },
    titulo('ajustes', t('ia.proveedores.titulo'), undefined, 'token'),
    controlesProveedores(proveedores).map(c => {
      const p = proveedores.find(x => x.id === c.id);
      const nombre = nombreProveedor(c.id);
      const [tonoP, textoP] = c.estado === 'lista' ? ['bien', t('ia.proveedor.lista')]
        : c.estado === 'sin_precio' ? ['apagado', t('ia.proveedor.sin_precio.corto')]
          : c.estado === 'apagado' ? ['apagado', t('ia.proveedor.apagado')] : ['atencion', textoMotivoIa(c.motivo)];
      return el('div', { class: 'proveedor' },
        el('div', { class: 'proveedor-cabeza' }, el('strong', { texto: nombre }), insignia(tonoP, textoP)),
        c.confirmado ? el('p', { class: 'suave', texto: t('ia.precio', { modelo: p.precio.nombre || nombreModelo(p.modelo), entrada: `US$${p.precio.entradaUsd}`, salida: `US$${p.precio.salidaUsd}`, fecha: fechaDia(p.precio.revisadoEl) }) })
          : el('p', { class: 'suave', texto: t('ia.proveedor.sin_precio', { proveedor: nombre }) }),
        c.conInterruptor ? interruptor(c.etiqueta === 'ia.proveedor.segundo' ? t('ia.proveedor.segundo') : t('ia.proveedor.usar', { proveedor: nombre }), c.usar,
          boton => {
            // Apagar el último proveedor apaga la IA: se pregunta antes (y, si sigue, la pantalla dice por qué se apagó).
            if (apagarProveedorApagaIa(s, c.id) && !confirm(t('ia.proveedor.apagar_ia.confirmar', { proveedor: nombre }))) return;
            cambiar(boton, mensajeProveedores, '/api/admin/ia/ajustes', { usar: { [c.id]: !c.usar } }, null);
          }) : null);
    }),
    mensajeProveedores,
    el('a', { class: 'boton-enlace secundario con-icono', href: '#claves' }, icono('llave'), el('span', { texto: t('ia.ir_claves') })));

  // ---- 6. Se paga aparte: la IA de Claude NO es la suscripción del chat ----
  const tarjetaPago = el('section', { class: 'tarjeta nota-pago' },
    titulo('recibo', t('ia.pago.titulo')),
    el('p', { class: 'fuerte', texto: t('ia.pago.claude') }),
    el('details', { class: 'en-palabras' },
      el('summary', { class: 'con-icono' }, icono('info'), el('span', { texto: t('ia.pago.consejos') })),
      el('p', { texto: t('ia.pago.limite') }),
      el('p', { class: 'suave', texto: t('ia.pago.limite.por_que') }),
      el('p', { texto: t('ia.pago.openai') })));

  // En la PC, dos columnas, cada una con su alto (sin huecos entre tarjetas); en el teléfono las columnas no existen
  // (display: contents) y el orden de siempre lo pone estilos.css.
  mostrar(marco('admin', cabeceraAdmin('ia'), el('div', { class: 'rejilla dos columnas-libres' },
    el('div', { class: 'columna' }, tarjetaEstadoIa, tarjetaTope, tarjetaProveedores),
    el('div', { class: 'columna' }, tarjetaGasto, tarjetaPago))));
}

// «Ver el detalle» del gasto (desde Tailscale): por cuenta, por proyecto y por uso, las veces sin IA, los últimos usos y
// los meses anteriores. Solo números: nunca el nombre de un proyecto ni lo que alguien escribió. Se carga al abrirlo.
function detalleDelGasto(mes) {
  const cuerpo = el('div', { class: 'detalle-gasto-cuerpo' });
  const mensajeDetalle = caja();
  let cargado = false;
  const lista = filas => el('ul', { class: 'lista-simple' }, filas.map(texto => el('li', { texto })));
  const parte = (nombreIcono, texto, contenido) => [el('h3', { class: 'con-icono' }, icono(nombreIcono), el('span', { texto })), contenido];
  const lineaLlamada = f => t('ia.gasto.llamada', {
    fecha: fecha(f.fecha), uso: tSi(`ia.proposito.${f.proposito}`, f.proposito), modelo: nombreModelo(f.modelo),
    reservado: usd(f.reservadoMicro), real: f.costoMicro == null ? '—' : usd(f.costoMicro),
    resultado: [tSi(`ia.estado_llamada.${f.estado}`, f.estado), f.resultado && f.resultado !== 'ok' ? textoMotivoIa(f.resultado) : null].filter(Boolean).join(': '),
  });
  async function cargar() {
    const r = await api('GET', `/api/admin/ia/consumo?mes=${encodeURIComponent(mes)}`);
    if (!r.ok) return decir(mensajeDetalle, textoError(r.datos.error), 'error');
    const c = r.datos;
    const ultimas = el('ul', { class: 'lista-simple llamadas' }, (c.ultimas ?? []).map(f => el('li', { texto: lineaLlamada(f) })));
    const mas = el('button', { type: 'button', class: 'secundario', hidden: !c.siguiente, texto: t('ia.gasto.ver_mas') });
    let siguiente = c.siguiente;
    mas.addEventListener('click', async () => {
      mas.disabled = true;
      const x = await api('GET', `/api/admin/ia/consumo?mes=${encodeURIComponent(mes)}&antes=${encodeURIComponent(siguiente)}`);
      mas.disabled = false;
      if (!x.ok) return decir(mensajeDetalle, textoError(x.datos.error), 'error');
      for (const f of x.datos.ultimas ?? []) ultimas.append(el('li', { texto: lineaLlamada(f) }));
      siguiente = x.datos.siguiente;
      mas.hidden = !siguiente;
    });
    cuerpo.replaceChildren(...[
      c.porCuenta?.length ? parte('personas', t('ia.gasto.por_cuenta'), lista(c.porCuenta.map(x => (x.propia
        ? tn('ia.gasto.cuenta_propia', { monto: usd(x.usadoMicro), n: x.n })
        : tn('ia.gasto.cuenta', { cuenta: x.cuenta, monto: usd(x.usadoMicro), tope: x.topeMicro == null ? '—' : usd(x.topeMicro), n: x.n }))))) : null,
      c.porProyecto?.length ? parte('carpeta', t('ia.gasto.por_proyecto'), lista(c.porProyecto.map(x => tn('ia.gasto.proyecto', { proyecto: x.proyecto, cuenta: x.cuenta, monto: usd(x.usadoMicro), n: x.n })))) : null,
      c.porUso?.length ? parte('chispa', t('ia.gasto.por_uso'), lista(c.porUso.map(x => tn('ia.gasto.uso', { uso: tSi(`ia.proposito.${x.proposito}`, x.proposito), monto: usd(x.usadoMicro), n: x.n })))) : null,
      c.bloqueos?.length ? parte('pausa', t('ia.gasto.bloqueos'), lista(c.bloqueos.map(x => t('ia.gasto.bloqueo', { motivo: textoMotivoIa(x.motivo), veces: numero(x.veces) })))) : null,
      c.ultimas?.length ? parte('recibo', t('ia.gasto.ultimas'), [ultimas, mas]) : el('p', { class: 'suave', texto: t('ia.gasto.vacio') }),
      c.meses?.length > 1 ? parte('calendario', t('ia.gasto.meses'), lista(c.meses.map(x => t('ia.gasto.mes', { mes: nombreMes(x.mes, true), monto: usd(x.usadoMicro) })))) : null,
      el('p', { class: 'ayuda', texto: t('ia.gasto.nota') })].flat(Infinity).filter(Boolean));
  }
  const detalles = el('details', { class: 'detalle-gasto' },
    el('summary', { class: 'con-icono' }, icono('recibo'), el('span', { texto: t('ia.gasto.detalle') })),
    cuerpo, mensajeDetalle);
  detalles.addEventListener('toggle', () => { if (detalles.open && !cargado) { cargado = true; cargar(); } });
  return detalles;
}

// ---- #claves: Administrador → Claves (solo desde la cuenta de Tailscale del dueño) ----
const ICONO_GRUPO_CLAVES = { ia: 'chispa', avisos: 'avion_papel' };
const ICONO_ESTADO_CLAVE = { activa: 'bien', pausada: 'pausa', no_pasa: 'mal', ilegible: 'mal', ninguna: 'apagado' };
function textoEstadoClave(estadoClave) {
  if (estadoClave === 'activa') return t('claves.estado.activa');
  if (estadoClave === 'pausada') return t('claves.estado.pausada');
  if (estadoClave === 'no_pasa') return t('claves.estado.no_pasa');
  if (estadoClave === 'ilegible') return t('claves.estado.ilegible');
  return t('claves.estado.ninguna');
}

async function pantallaClaves(aviso = null) {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/admin/claves');
  if (!vigente()) return;
  const cabeza = (...hijos) => el('section', { class: 'tarjeta' },
    avisoDeArriba(aviso),
    el('h2', { class: 'con-icono titulo-tarjeta' }, icono('llave', 'icono grande'), el('span', { texto: t('claves.titulo') }), queEs('clave_api')),
    ...hijos);
  if (!r.ok) {
    // Por el enlace público, desde otro equipo o por la conexión directa: ni se ven ni se cambian (lo dice y nada más).
    const e = r.datos.error;
    const texto = e === 'solo_desde_tailnet' ? t('claves.solo_tailnet') : e === 'solo_dueno_tailscale' ? t('claves.solo_dueno')
      : e === 'solo_el_dueno' ? t('claves.solo_el_dueno') : textoError(e);
    mostrar(marco('admin', cabeceraAdmin('claves'), cabeza(el('p', { class: 'aviso con-icono-arriba', 'data-foco': true }, icono('candado'), el('span', { texto })))));
    return;
  }
  const d = r.datos;
  const listo = d.almacen?.listo !== false;
  const recargar = siguiente => pantallaClaves(siguiente);
  mostrar(marco('admin', cabeceraAdmin('claves'), el('div', { class: 'rejilla dos' },
    cabeza(
      el('p', { class: 'suave', texto: t('claves.explica') }),
      d.duenoTailscale ? el('p', { class: 'suave con-icono' }, icono('escudo', 'icono chico'), el('span', { texto: t('claves.dueno', { login: d.duenoTailscale }) })) : null,
      !listo ? el('p', { class: 'aviso', role: 'alert', texto: t(d.almacen?.motivo === 'llave_falta' ? 'claves.llave_falta' : 'claves.llave_danada') }) : null,
      // Revisión final: una base recuperada de una copia nunca trae la llave de las claves: se pegan otra vez aquí.
      listo && d.almacen?.motivo === 'restaurada' ? el('p', { class: 'aviso con-icono-arriba' }, icono('info', 'icono chico'), el('span', { texto: t('claves.restaurada') })) : null),
    // El Telegram primero: es gratis y las copias fuera del servidor lo necesitan (la IA es opcional).
    [...(d.grupos ?? [])].sort((a, b) => (b.grupo === 'avisos') - (a.grupo === 'avisos')).map(g => (g.grupo === 'avisos' ? grupoTelegram(g, d, { listo, recargar, vigente }) : el('section', { class: 'tarjeta' },
      titulo(ICONO_GRUPO_CLAVES[g.grupo] ?? 'llave', tSi(`claves.grupo.${g.grupo}`, g.grupo)),
      (g.usos ?? []).map((u, i) => cajaDeClave(u, { listo, recargar, abrirPegar: i === 0 && !u.activa }))))))));
}

// ayuda: lo que se muestra al pegar en vez de «dónde se crea» (el Telegram lleva los pasos de @BotFather);
// nombre: otro nombre arriba (el @usuario del bot).
function cajaDeClave(u, { listo, recargar, abrirPegar, ayuda = null, nombre: otroNombre = null }) {
  const a = u.activa;
  const { estado: estadoClave, tono } = estadoDeClave(a);
  const mensajeClave = caja();
  const nombre = otroNombre ?? tSi(`claves.uso.${u.uso}`, u.uso);
  const conIaApagada = (texto, x) => [texto, x.datos.iaApagada ? t('claves.ia_apagada') : null].filter(Boolean).join(' ');
  // Cuando la IA se apagó, un atajo para volver a encenderla (ronda 4 de revisión).
  const abrirIa = { href: '#ia', texto: t('ia.abrir') };
  const partes = [el('div', { class: 'clave-cabeza' },
    el('strong', { class: 'clave-nombre', texto: nombre }),
    el('span', { class: `insignia tono-${tono}` }, icono(ICONO_ESTADO_CLAVE[estadoClave] ?? 'info', 'icono chico'), el('span', { texto: textoEstadoClave(estadoClave) })))];
  if (a) {
    partes.push(el('p', { class: 'clave-final', texto: t('claves.termina', { final: a.final }) }));
    partes.push(el('p', { class: 'suave', texto: [
      a.probadoEn ? t('claves.probada', { cuando: hace(a.probadoEn), resultado: textoMotivoIa(a.prueba) }) : t('claves.sin_probar'),
      a.usadoEn ? t('claves.usada', { cuando: hace(a.usadoEn) }) : t('claves.nunca_usada'),
    ].join(' · ') }));
    if (estadoClave === 'ilegible') partes.push(el('p', { class: 'aviso', texto: textoMotivoIa('clave_ilegible') }));
    const pausa = estadoClave === 'pausada' ? a.pausa : null;
    if (pausa) {
      partes.push(el('div', { class: 'aviso-sistema tono-atencion' },
        el('p', { class: 'fuerte con-icono' }, icono('pausa'), el('span', { texto: t('claves.pausa', { motivo: textoMotivoIa(pausa.motivo) }) })),
        el('p', { texto: pausa.hasta ? t('claves.pausa.hasta', { cuando: cuando(pausa.hasta) }) : t('claves.pausa.admin') })));
    }
    const botones = [];
    if (a.legible !== false) {
      // La prueba es gratis (no escribe nada con la IA). Si está en pausa, la misma prueba la reanuda si pasa.
      const reanudar = Boolean(pausa);
      const textoBoton = el('span', { texto: reanudar ? t('claves.probar_reanudar') : t('claves.probar') });
      const probar = el('button', {
        type: 'button', class: reanudar ? 'con-icono' : 'secundario con-icono',
        onclick: async () => {
          probar.disabled = true;
          mensajeClave.hidden = true;
          textoBoton.textContent = t('claves.probando');
          const x = await api('POST', `/api/admin/claves/${a.id}/probar`, { reanudar });
          if (!x.ok) {
            probar.disabled = false;
            textoBoton.textContent = reanudar ? t('claves.probar_reanudar') : t('claves.probar');
            return decir(mensajeClave, textoError(x.datos.error), 'error');
          }
          const m = x.datos.prueba?.motivo;
          // Ronda 4 de revisión: reanudada pero con la IA apagada → se dice, con el atajo para encenderla.
          if (m === 'ok' && x.datos.reanudada && x.datos.iaEncendida === false) return recargar({ texto: t('claves.reanudada_ia_apagada'), clase: 'aviso', enlace: abrirIa });
          recargar({ texto: m === 'ok' ? (x.datos.reanudada ? t('claves.reanudada') : t('claves.prueba.ok')) : t('claves.prueba.mal', { motivo: textoMotivoIa(m) }), clase: m === 'ok' ? 'bien' : 'aviso' });
        },
      }, icono(reanudar ? 'play' : 'actualizar'), textoBoton);
      botones.push(probar);
    }
    botones.push(botonAccion(t('claves.desactivar'), 'peligro', mensajeClave, async () => {
      if (!confirm(t('claves.desactivar.confirmar'))) return;
      const x = await api('POST', `/api/admin/claves/${a.id}/activa`, { activa: false });
      if (!x.ok) throw new Error(textoError(x.datos.error));
      recargar({ texto: conIaApagada(t('claves.desactivada_listo'), x), clase: x.datos.iaApagada ? 'aviso' : 'bien', enlace: x.datos.iaApagada ? abrirIa : null });
    }, 'prohibido'));
    partes.push(el('div', { class: 'botones' }, botones));
  }
  if (listo) {
    // Pegar una clave: una línea tapada con puntos que se vacía apenas se manda. Nunca se vuelve a mostrar.
    const id = `clave-${u.uso}`;
    const area = crecer(el('textarea', { ...ATRIBUTOS_CAMPO_CLAVE, id, 'aria-describedby': `${id}-donde` }));
    const guardar = el('button', {
      type: 'button', class: 'con-icono',
      onclick: async () => {
        const valor = area.value;
        area.value = '';
        area.dispatchEvent(new Event('input'));
        if (!valor.trim()) return decir(mensajeClave, textoError('clave_formato'), 'error');
        guardar.disabled = true;
        mensajeClave.hidden = true;
        const x = await api('POST', '/api/admin/claves', { uso: u.uso, valor });
        if (!x.ok) {
          guardar.disabled = false;
          return decir(mensajeClave, textoError(x.datos.error), 'error');
        }
        const m = x.datos.prueba?.motivo;
        const guardadaTexto = t('claves.guardada', { resultado: textoMotivoIa(m) });
        // Ronda 4 de revisión: la clave nueva funciona, pero por seguridad cambiarla apagó la IA: se dice así (no «ya no
        // queda una clave que funcione») y se ofrece volver a encenderla.
        if (x.datos.iaApagada && m === 'ok') return recargar({ texto: `${guardadaTexto} ${t('claves.ia_apagada_cambio')}`, clase: 'aviso', enlace: abrirIa });
        recargar({ texto: conIaApagada(guardadaTexto, x), clase: m === 'ok' && !x.datos.iaApagada ? 'bien' : 'aviso', enlace: x.datos.iaApagada ? abrirIa : null });
      },
    }, icono('llave'), el('span', { texto: t('claves.guardar') }));
    partes.push(el('details', { class: 'clave-pegar', open: abrirPegar },
      el('summary', { class: 'con-icono' }, icono(a ? 'lapiz' : 'mas'), el('span', { texto: a ? t('claves.cambiar') : t('claves.agregar') })),
      ayuda ? el('div', { id: `${id}-donde` }, ayuda) : el('p', { class: 'ayuda', id: `${id}-donde`, texto: tSi(`claves.donde.${u.uso}`, '') }),
      a ? el('p', { class: 'suave', texto: t('claves.reemplazo') }) : null,
      el('label', { for: id, texto: t('claves.pegar') }),
      area,
      guardar));
  }
  const anteriores = Array.isArray(u.anteriores) ? u.anteriores : [];
  if (anteriores.length) {
    partes.push(el('details', {},
      el('summary', { class: 'con-icono' }, icono('reloj'), el('span', { texto: tn('claves.anteriores', { n: anteriores.length }) })),
      el('ul', { class: 'lista-simple' }, anteriores.map(x => el('li', { class: 'clave-anterior' },
        el('span', { texto: t('claves.anterior', { final: x.final, estado: x.legible === false ? t('claves.estado.ilegible') : tSi(`claves.estado.${x.estado}`, x.estado), fecha: fecha(x.cambiadoEn || x.creadoEn) }) }),
        x.legible !== false && x.estado !== 'activa' ? botonAccion(t('claves.activar'), 'secundario chico', mensajeClave, async () => {
          const y = await api('POST', `/api/admin/claves/${x.id}/activa`, { activa: true });
          if (!y.ok) throw new Error(textoError(y.datos.error));
          recargar({ texto: conIaApagada(t('claves.activada'), y), clase: y.datos.iaApagada ? 'aviso' : 'bien', enlace: y.datos.iaApagada ? abrirIa : null });
        }) : null)))));
  }
  partes.push(mensajeClave);
  return el('div', { class: `clave-caja tono-${tono}` }, partes);
}

// ---- Claves → «Avisos y copias por Telegram» (fase 1, parte e) ----
// Dos pasos con número: ① tu bot (se crea gratis con @BotFather y su token se pega aquí, como las claves de la IA) y
// ② tu chat (un código de 8 cifras que se le manda al bot desde tu chat privado). Unido, un mensaje de prueba y
// «Dejar de usar este chat». Si algo no deja mandar, una línea roja dice qué pasa y qué hacer.
// El código vive solo en la memoria de esta pantalla (el servidor guarda solo su huella): al salir de Claves se suelta.
let vinculoEnPantalla = null; // { codigo, paraMostrar, enlace, hasta, bot } mientras se espera el mensaje
const ICONO_PROBLEMA_TELEGRAM = { pausa: 'reloj', sin_probar: 'atencion', sin_respuesta: 'reloj', limite: 'reloj' };

// Los pasos para crear el bot, con número (lo que se hace en Telegram, en palabras sencillas).
function pasosBotFather() {
  return el('ol', { class: 'pasos-numerados' }, [1, 2, 3, 4].map(n => el('li', {},
    el('span', { class: 'paso-numero', 'aria-hidden': 'true', texto: String(n) }),
    el('span', { texto: t(`telegram.como${n}`) }))));
}

function grupoTelegram(g, d, { listo, recargar, vigente }) {
  const u = (g.usos ?? []).find(x => x.uso === 'telegram_bot') ?? { uso: 'telegram_bot', activa: null, anteriores: [] };
  const tg = d.telegram ?? {};
  const v = vistaTelegram(tg, u);
  const mensaje = caja();
  const nombreBot = tg.bot?.usuario ? `@${tg.bot.usuario}` : null;
  const lineaProblema = clave => el('p', { class: `aviso-linea con-icono-arriba tono-${clave === 'pausa' ? 'atencion' : 'mal'}`, role: 'status' },
    icono(ICONO_PROBLEMA_TELEGRAM[clave] ?? 'mal', 'icono'), el('span', { texto: t(`telegram.problema.${clave}`) }));

  // ① Tu bot: la caja de siempre de una clave (pegar, probar gratis, desactivar), con los pasos de @BotFather.
  const ayudaBot = u.activa ? el('div', { class: 'ayuda-bot' },
    el('p', { class: 'fuerte', texto: t('telegram.otra_vez_token') }),
    el('p', { class: 'ayuda', texto: t('telegram.token_otra_vez_pasos') }),
    v.tokenBien ? null : pasosBotFather()) : el('div', { class: 'ayuda-bot' }, pasosBotFather());
  const paso1 = el('div', { class: 'paso-telegram' },
    el('h3', { class: 'paso-titulo' }, el('span', { class: 'paso-numero', texto: '1' }), el('span', { texto: t('telegram.paso.bot') })),
    !u.activa ? [el('p', { class: 'suave', texto: t('telegram.paso.bot.explica') }), ayudaBot] : null,
    cajaDeClave(u, { listo, recargar, abrirPegar: !u.activa, ayuda: u.activa ? ayudaBot : el('span'), nombre: nombreBot }),
    v.paso === 'bot' && v.problema ? lineaProblema(v.problema) : null);

  // ② Tu chat
  let paso2;
  const cabeza2 = el('h3', { class: 'paso-titulo' }, el('span', { class: `paso-numero${v.tokenBien ? '' : ' apagado'}`, texto: '2' }), el('span', { texto: t('telegram.paso.chat') }));
  if (!v.tokenBien) {
    const unido = v.chat && v.chat.estado !== 'perdido';
    paso2 = el('div', { class: 'paso-telegram apagado' }, cabeza2, el('p', { class: 'suave con-icono-arriba' }, icono(unido ? 'pausa' : 'candado', 'icono chico'),
      el('span', { texto: unido ? t('telegram.paso.chat.en_espera', { nombre: v.chat.nombre || t('telegram.tu_chat') }) : t('telegram.paso.chat.antes') })));
  } else if (v.paso === 'unir' || vinculoEnPantalla || tg.vinculo?.porConfirmar || tg.vinculo?.pendiente) {
    paso2 = el('div', { class: 'paso-telegram' }, cabeza2, v.problema ? lineaProblema(v.problema) : null, bloqueUnirChat(tg, { recargar, vigente, mensaje }));
  } else {
    const chat = v.chat;
    const envios = tg.envios ?? {};
    const desvincular = el('details', { class: 'desvincular' },
      el('summary', { class: 'con-icono' }, icono('prohibido', 'icono chico'), el('span', { texto: t('telegram.dejar') })),
      el('p', { class: 'ayuda', texto: t('telegram.dejar.explica') }),
      botonAccion(t('telegram.dejar.boton'), 'peligro', mensaje, async () => {
        if (!confirm(t('telegram.dejar.confirmar'))) return;
        const x = await api('POST', '/api/admin/telegram/desvincular', {});
        if (!x.ok) throw new Error(textoError(x.datos.error));
        recargar({ texto: t('telegram.dejar.listo'), clase: 'aviso' });
      }, 'prohibido'));
    paso2 = el('div', { class: 'paso-telegram' }, cabeza2,
      el('div', { class: `clave-caja tono-${v.problema ? (v.problema === 'pausa' ? 'atencion' : 'mal') : 'bien'}` },
        el('div', { class: 'clave-cabeza' },
          el('strong', { class: 'clave-nombre', texto: chat?.nombre ? t('telegram.chat_de', { nombre: chat.nombre }) : t('telegram.tu_chat') }),
          insignia(v.problema ? (v.problema === 'pausa' ? 'atencion' : 'mal') : 'bien', v.problema ? t('telegram.no_llegan') : t('telegram.unido'))),
        chat?.vinculadoEn ? el('p', { class: 'suave', texto: t('telegram.unido_el', { fecha: diaCorto(chat.vinculadoEn) }) }) : null,
        chat?.tokenNuevo && !v.problema ? el('p', { class: 'aviso con-icono-arriba' }, icono('info', 'icono chico'),
          el('span', { texto: t('telegram.chat_sigue', { nombre: chat.nombre || t('telegram.tu_chat'), fecha: diaCorto(chat.vinculadoEn) }) })) : null,
        v.problema ? lineaProblema(v.problema) : null,
        el('p', { class: 'suave', texto: [envios.ultimoOk ? t('telegram.ultimo_aviso', { cuando: cuando(envios.ultimoOk) }) : t('telegram.sin_mensajes'), envios.hoy ? tn('telegram.hoy', { n: envios.hoy }) : null].filter(Boolean).join(' · ') }),
        el('div', { class: 'botones' },
          botonAccion(t('telegram.prueba'), v.problema ? '' : 'secundario', mensaje, async () => {
            const x = await api('POST', '/api/admin/telegram/prueba', {});
            if (!x.ok) throw new Error(textoError(x.datos.error));
            const m = x.datos.motivo;
            recargar(m === 'ok' ? { texto: t('telegram.prueba_ok'), clase: 'bien' } : { texto: t('telegram.prueba_mal', { motivo: textoMotivoIa(m) }), clase: 'aviso' });
          }, 'avion_papel'),
          ['perdido', 'bloqueado', 'clave_no_valida', 'sin_probar', 'pedido', 'bot_cambiado'].includes(v.problema) || chat?.tokenNuevo ? el('button', {
            type: 'button', class: 'secundario con-icono',
            onclick: evento => empezarAUnir(evento.currentTarget, mensaje, recargar),
          }, icono('actualizar'), el('span', { texto: t('telegram.unir_otra_vez') })) : null),
        desvincular,
        mensaje));
  }
  return el('section', { class: 'tarjeta grupo-telegram ancha' },
    titulo('avion_papel', t('claves.grupo.avisos'), undefined, 'telegram'),
    el('p', { class: 'suave', texto: t('telegram.explica') }),
    el('div', { class: 'pasos-telegram' }, paso1, paso2));
}

// «Unir mi chat»: pide un código de 8 cifras y espera el mensaje (la pantalla pregunta cada 3 s).
async function empezarAUnir(boton, mensaje, recargar) {
  if (boton) boton.disabled = true;
  mensaje.hidden = true;
  const x = await api('POST', '/api/admin/telegram/vincular', {});
  if (!x.ok) {
    if (boton) boton.disabled = false;
    return decir(mensaje, textoError(x.datos.error), 'error');
  }
  vinculoEnPantalla = { codigo: x.datos.codigo, paraMostrar: x.datos.paraMostrar, enlace: enlaceSeguro(x.datos.enlace), hasta: x.datos.hasta, bot: x.datos.bot };
  recargar(null);
}

// Ronda 3: el segundo paso. El bot le mandó un código de 6 cifras al chat que escribió el primero; el dueño lo escribe
// aquí. Si a SU Telegram no le llegó nada, otra persona tiene el token: no escribe nada y cambia el token.
function formularioConfirmarChat(nombre, { recargar, mensaje }) {
  const id = 'campo-confirmar-chat';
  const campo = el('input', { id, name: 'codigo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 9, required: true, class: 'codigo-campo' });
  const formulario = el('form', { class: 'unir-chat confirmar-chat' },
    el('h4', { class: 'con-icono' }, icono('candado', 'icono'), el('span', { texto: t('telegram.confirmar.titulo') })),
    el('p', { texto: t('telegram.confirmar.explica', { nombre: nombre || t('telegram.tu_chat') }) }),
    el('label', { for: id, texto: t('telegram.confirmar.campo') }),
    campo,
    el('button', { type: 'submit', class: 'grande con-icono centrado' }, icono('bien'), el('span', { texto: t('telegram.confirmar.boton') })),
    el('p', { class: 'aviso con-icono-arriba' }, icono('atencion', 'icono chico'), el('span', { texto: t('telegram.confirmar.cuidado') })),
    el('button', { type: 'button', class: 'secundario', texto: t('telegram.unir.cancelar'), onclick: async () => {
      await api('POST', '/api/admin/telegram/vincular/cancelar', {});
      vinculoEnPantalla = null;
      recargar(null);
    } }),
    mensaje);
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type="submit"]');
    boton.disabled = true;
    mensaje.hidden = true;
    const x = await api('POST', '/api/admin/telegram/vincular/confirmar', { codigo: campo.value });
    boton.disabled = false;
    if (x.ok && x.datos.estado === 'vinculado') {
      vinculoEnPantalla = null;
      recargar({ texto: t('telegram.unido_listo', { nombre: x.datos.chat?.nombre || t('telegram.tu_chat') }), clase: 'bien' });
      return;
    }
    if (x.datos?.error === 'codigo_vencido' || x.datos?.error === 'codigo_intentos') {
      vinculoEnPantalla = null;
      recargar({ texto: textoError(x.datos.error), clase: 'aviso' });
      return;
    }
    campo.value = '';
    decir(mensaje, textoError(x.datos?.error), 'error');
  });
  return formulario;
}

function bloqueUnirChat(tg, { recargar, vigente, mensaje }) {
  if (vinculoEnPantalla?.confirmar || (!vinculoEnPantalla && tg.vinculo?.porConfirmar)) {
    return formularioConfirmarChat(vinculoEnPantalla?.confirmar?.nombre ?? tg.vinculo.porConfirmar.nombre, { recargar, mensaje });
  }
  // Revisión final: la página se recargó (en el iPhone, la app de la pantalla de inicio suele recargarse al volver de
  // Telegram) y el servidor todavía espera el código que se pidió. El código no se puede mostrar otra vez (el servidor
  // guarda solo su huella), pero se sigue esperando el mensaje que el dueño ya mandó; «Pedir otro código» queda aparte.
  if (!vinculoEnPantalla && tg.vinculo?.pendiente && cuentaAtras(tg.vinculo.hasta)) {
    vinculoEnPantalla = { codigo: null, paraMostrar: null, enlace: null, hasta: tg.vinculo.hasta, bot: tg.bot?.usuario ?? null, retomado: true };
  }
  const vinculo = vinculoEnPantalla;
  if (!vinculo) {
    return el('div', {},
      el('p', { texto: t('telegram.unir.explica') }),
      el('button', { type: 'button', class: 'grande con-icono centrado', onclick: evento => empezarAUnir(evento.currentTarget, mensaje, recargar) },
        icono('avion_papel'), el('span', { texto: t('telegram.unir') })),
      mensaje);
  }
  // «Cancelar» le dice al servidor que ya no espere ese código (si no, al volver a la pantalla se retomaría).
  const cancelar = async () => {
    await api('POST', '/api/admin/telegram/vincular/cancelar', {});
    vinculoEnPantalla = null;
    recargar(null);
  };
  if (vinculo.retomado) return bloqueEsperandoRetomado(vinculo, { recargar, vigente, mensaje, cancelar });
  const codigo = codigoLegible(vinculo.codigo || vinculo.paraMostrar);
  const resto = el('span', { class: 'fuerte', texto: cuentaAtras(vinculo.hasta) ?? '0:00' });
  const estadoEspera = el('p', { class: 'esperando con-icono', role: 'status' }, el('span', { class: 'girando' }, icono('actualizar', 'icono')), el('span', { texto: t('telegram.esperando') }));
  const bloque = el('div', { class: 'unir-chat' },
    el('p', { class: 'ayuda', texto: t('telegram.codigo') }),
    el('p', { class: 'codigo-grande', 'aria-label': t('telegram.codigo_para_leer', { codigo: String(vinculo.codigo).split('').join(' ') }) }, el('span', { texto: codigo })),
    el('p', { class: 'suave con-icono' }, icono('reloj', 'icono chico'), el('span', { texto: t('telegram.vence') }), resto),
    vinculo.enlace ? el('a', { class: 'boton-enlace grande con-icono', href: vinculo.enlace, target: '_blank', rel: 'noopener noreferrer' },
      icono('avion_papel'), el('span', { texto: t('telegram.abrir_bot') })) : null,
    el('ol', { class: 'pasos-numerados' },
      el('li', {}, el('span', { class: 'paso-numero', 'aria-hidden': 'true', texto: '1' }), el('span', { texto: vinculo.enlace ? t('telegram.toca_iniciar') : t('telegram.busca_bot', { bot: vinculo.bot ? `@${vinculo.bot}` : t('telegram.tu_bot') }) })),
      el('li', {}, el('span', { class: 'paso-numero', 'aria-hidden': 'true', texto: '2' }), el('span', { texto: t('telegram.o_escribe', { codigo }) }))),
    estadoEspera,
    el('button', {
      type: 'button', class: 'secundario',
      texto: t('telegram.unir.cancelar'),
      onclick: cancelar,
    }),
    mensaje);
  esperarMensajeDelChat(bloque, vinculo, { recargar, vigente, mensaje, resto });
  return bloque;
}

// Lo que se ve al volver a Claves con un código que el servidor todavía espera (ver bloqueUnirChat).
function bloqueEsperandoRetomado(vinculo, { recargar, vigente, mensaje, cancelar }) {
  const resto = el('span', { class: 'fuerte', texto: cuentaAtras(vinculo.hasta) ?? '0:00' });
  const bloque = el('div', { class: 'unir-chat' },
    el('p', { class: 'esperando con-icono fuerte', role: 'status' }, el('span', { class: 'girando' }, icono('actualizar', 'icono')), el('span', { texto: t('telegram.esperando') })),
    el('p', { texto: t('telegram.unir.retomado', { bot: vinculo.bot ? `@${vinculo.bot}` : t('telegram.tu_bot') }) }),
    el('p', { class: 'suave con-icono' }, icono('reloj', 'icono chico'), el('span', { texto: t('telegram.vence') }), resto),
    el('div', { class: 'botones' },
      el('button', { type: 'button', class: 'secundario con-icono', onclick: evento => empezarAUnir(evento.currentTarget, mensaje, recargar) },
        icono('actualizar', 'icono chico'), el('span', { texto: t('telegram.unir.pedir_otro') })),
      el('button', { type: 'button', class: 'secundario', texto: t('telegram.unir.cancelar'), onclick: cancelar })),
    mensaje);
  esperarMensajeDelChat(bloque, vinculo, { recargar, vigente, mensaje, resto });
  return bloque;
}

// Cada segundo, lo que falta; cada 3 s, si ya llegó el mensaje (mientras se vea esta pantalla y este código).
function esperarMensajeDelChat(bloque, vinculo, { recargar, vigente, mensaje, resto }) {
  let preguntando = false;
  let ultimaPregunta = 0;
  const reloj = setInterval(async () => {
    if (!vigente() || !bloque.isConnected || vinculoEnPantalla !== vinculo) { clearInterval(reloj); return; }
    const falta = cuentaAtras(vinculo.hasta);
    resto.textContent = falta ?? '0:00';
    if (document.hidden || preguntando || Date.now() - ultimaPregunta < 3000) return;
    preguntando = true;
    ultimaPregunta = Date.now();
    const x = await api('POST', '/api/admin/telegram/vincular/revisar', {});
    preguntando = false;
    if (!vigente() || vinculoEnPantalla !== vinculo) return;
    if (!x.ok) return;
    const e = x.datos.estado;
    if (e === 'confirmar') {
      clearInterval(reloj);
      vinculoEnPantalla = { ...vinculo, confirmar: { nombre: x.datos.chat?.nombre ?? null } };
      recargar(null);
    } else if (e === 'vinculado') {
      clearInterval(reloj);
      vinculoEnPantalla = null;
      recargar({ texto: t('telegram.unido_listo', { nombre: x.datos.chat?.nombre || t('telegram.tu_chat') }), clase: 'bien' });
    } else if (e === 'vencido') {
      clearInterval(reloj);
      vinculoEnPantalla = null;
      recargar({ texto: x.datos.motivo === 'intentos' ? t('telegram.codigo_intentos') : t('telegram.codigo_vencido'), clase: 'aviso' });
    } else if (x.datos.problema) {
      decir(mensaje, t(x.datos.problema === 'clave_no_valida' ? 'telegram.problema.clave_no_valida' : x.datos.problema === 'bot_ocupado' ? 'telegram.problema.bot_ocupado' : 'telegram.problema.sin_red'), 'error');
    }
  }, 1000);
}

// ---------- Piezas comunes (antes junto a los proyectos de OPORTIA, que se quitaron en la 0.8.0) ----------
function unir(lista) {
  const limpia = lista.filter(Boolean);
  if (!limpia.length) return '';
  try { return new Intl.ListFormat(idioma, { type: 'conjunction' }).format(limpia); } catch { return limpia.join(', '); }
}
const enMinuscula = texto => (texto ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto);
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
// Un aviso arriba de una pantalla: texto (sale bien) o { texto, clase: 'bien' | 'aviso', enlace?: { href, texto } }.
function avisoDeArriba(aviso) {
  if (!aviso) return null;
  const { texto, clase, enlace = null } = typeof aviso === 'string' ? { texto: aviso, clase: 'bien' } : aviso;
  const linea = el('p', { class: `${clase === 'aviso' ? 'aviso' : 'mensaje bien'} aviso-arriba con-icono`, role: 'status', 'data-foco': true },
    icono(clase === 'aviso' ? 'atencion' : 'bien'), el('span', { texto }));
  if (!enlace?.href) return linea;
  return [linea, el('a', { class: 'boton-enlace secundario con-icono', href: enlace.href }, icono('chispa'), el('span', { texto: enlace.texto }))];
}

// ---------- Academia (0.7.2): una app de aviación tipo Duolingo ----------
// El camino: cada materia con su color y su ícono, un círculo por tema en un sendero que serpentea, el «Video resumen»
// al empezar cada materia y el trofeo del examen al final. La lección va en TARJETAS (una idea por pantalla, con
// «CONTINUAR» abajo). Las preguntas del Test Guide se muestran TAL CUAL (textContent, con sus saltos de línea): solo
// cambia el orden de las preguntas. Lo agregado para entender (explicación sencilla, idea equivocada, inglés) va
// siempre aparte. Las pantallas de estudio (lección, video, preguntas) ocupan toda la pantalla, sin el menú de abajo.
const nombreMateria = id => tSi(`acad.materia.${id}`, id);
const pctTexto = n => t('acad.pct', { n: numero(n ?? 0) });
// El color y el ícono de cada materia (estilos: .mc-0 … .mc-10).
const ICONO_MATERIA = {
  factores_humanos: 'cerebro', sistemas: 'motor', aerodinamica: 'ala', ambiente_vuelo: 'torre', rad: 'libro', poh: 'manual',
  comunicacion: 'radio', meteorologia: 'nube', rendimiento: 'velocimetro', navegacion: 'brujula', sms: 'escudo',
};
const ORDEN_MATERIAS = Object.keys(ICONO_MATERIA);
const claseMateria = id => `mc-${Math.max(0, ORDEN_MATERIAS.indexOf(id))}`;
// Los textos de cada plan de estudio y de cada ritmo (claves enteras: test/pantallas.test.js las revisa).
const TEXTOS_PLAN = {
  un_mes: { nombre: 'acad.plan.un_mes', linea: 'acad.plan.un_mes.linea', corto: 'acad.plan.corto.un_mes', icono: 'avion' },
  dos_meses: { nombre: 'acad.plan.dos_meses', linea: 'acad.plan.dos_meses.linea', corto: 'acad.plan.corto.dos_meses', icono: 'nube' },
  repaso_15: { nombre: 'acad.plan.repaso_15', linea: 'acad.plan.repaso_15.linea', corto: 'acad.plan.corto.repaso_15', icono: 'rayo' },
};
const TEXTO_RITMO = { adelantado: 'acad.plan.ritmo.adelantado', a_tiempo: 'acad.plan.ritmo.a_tiempo', atrasado: 'acad.plan.ritmo.atrasado', terminado: 'acad.plan.ritmo.terminado' };
const textoPlan = (id, cual) => tSi(TEXTOS_PLAN[id]?.[cual] ?? '', id);
// «Visión en vuelo y visión nocturna (vision in flight / night vision)» → título y el inglés aparte.
function partirTitulo(titulo) {
  const m = /^(.*\S)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/.exec(String(titulo ?? ''));
  if (m && pareceIngles(m[2], { titulo: true })) return { es: m[1], en: m[2] };
  return { es: String(titulo ?? ''), en: null };
}

// Un texto del paquete tal cual (respeta saltos de línea y espacios: estilos.css .tal-cual).
function talCual(etiqueta, texto, clase = '') {
  return el(etiqueta, { class: `tal-cual ${clase}`.trim(), texto: texto ?? '' });
}
function lineaFuente(f) {
  const partes = [f.libro, f.capitulo, f.seccion, f.pagina ? t('acad.pagina', { n: f.pagina }) : null].filter(Boolean);
  return el('p', { class: 'fuente con-icono-chico' }, icono('libro', 'icono chico'), el('span', { texto: partes.join(' · ') }));
}
// Un texto con los términos en inglés como fichas y las cifras resaltadas (public/tarjetas.js: los trozos juntos dicen
// exactamente el texto).
function textoRico(etiqueta, texto, clase = '') {
  return el(etiqueta, { class: clase || null }, resaltar(texto).map(x => x.ingles
    ? el('span', { class: 'termino-en', lang: 'en', texto: x.texto.slice(1, -1) })
    : x.cifra ? el('strong', { class: 'cifra', texto: x.texto }) : x.texto));
}
function cifras(c) {
  return el('div', { class: 'acad-cifras' },
    chipCifra(`fuego${c.racha ? '' : ' cero'}`, 'fuego', numero(c.racha ?? 0), t('acad.racha')),
    chipCifra('estrella', 'estrella', numero(c.puntos ?? 0), t('acad.puntos')),
    queEs('racha'));
}
function avisoMuestra(paquete) {
  return paquete?.muestra ? el('p', { class: 'aviso con-icono-arriba acad-muestra' }, icono('info'), el('span', { texto: t('acad.muestra') })) : null;
}
async function empezarIntento(datos, boton = null) {
  if (boton) boton.disabled = true;
  const r = await api('POST', '/api/academia/intentos', datos);
  if (boton) boton.disabled = false;
  if (!r.ok) return avisar(textoError(r.datos.error), 'mal');
  location.hash = `#practica/${r.datos.id}`;
}
function botonRepaso(n, clase = '') {
  if (!n) return null;
  return el('button', { type: 'button', class: `boton-3d naranja con-icono ${clase}`.trim(), onclick: evento => empezarIntento({ tipo: 'repaso' }, evento.currentTarget) },
    icono('actualizar'), el('span', { texto: tn('acad.repasar', { n }) }));
}

// ---- Piezas que se repiten ----
// El medidor de preparación (un altímetro de media luna): 0-69 naranja, 70-89 azul, 90+ verde.
function medidor(pct, { chico = false, etiqueta = t('acad.preparacion') } = {}) {
  const valor = Math.max(0, Math.min(100, Number(pct) || 0));
  const tono = valor >= 90 ? 'verde' : valor >= 70 ? 'azul' : 'naranja';
  const s = svgEl('svg', { viewBox: '0 0 120 70', class: `medidor-arco tono-${tono}`, 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('path', { d: 'M12 62a48 48 0 0 1 96 0', class: 'medidor-pista' }));
  const lleno = svgEl('path', { d: 'M12 62a48 48 0 0 1 96 0', class: 'medidor-lleno', pathLength: 100 });
  // El hueco más largo que el arco: el trazo no se repite al final (con 0 no se ve nada).
  lleno.style.strokeDasharray = `${valor} 200`;
  if (!valor) lleno.style.opacity = '0';
  s.append(lleno);
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI - (k / 10) * Math.PI;
    const r1 = k % 5 ? 40 : 36;
    s.append(svgEl('line', { x1: (60 + Math.cos(a) * r1).toFixed(1), y1: (62 - Math.sin(a) * r1).toFixed(1), x2: (60 + Math.cos(a) * 43).toFixed(1), y2: (62 - Math.sin(a) * 43).toFixed(1), class: 'medidor-marca' }));
  }
  const ang = Math.PI - (valor / 100) * Math.PI;
  s.append(svgEl('line', { x1: 60, y1: 62, x2: (60 + Math.cos(ang) * 34).toFixed(1), y2: (62 - Math.sin(ang) * 34).toFixed(1), class: 'medidor-aguja' }));
  s.append(svgEl('circle', { cx: 60, cy: 62, r: 5, class: 'medidor-eje' }));
  return el('div', { class: `medidor${chico ? ' chico' : ''}`, role: 'img', 'aria-label': `${etiqueta}: ${pctTexto(valor)}` },
    s, el('strong', { class: 'medidor-valor', texto: pctTexto(valor) }), chico ? null : el('span', { class: 'medidor-etiqueta', texto: etiqueta }));
}
function chipCifra(clase, nombreIcono, valor, titulo) {
  return el('span', { class: `chip-cifra ${clase}`, title: titulo, 'aria-label': `${titulo}: ${valor}` }, icono(nombreIcono, 'icono'), el('strong', { texto: valor }));
}
// «2026-12-11» → «11 dic» (sin año: la fecha está cerca).
function fechaCortaDia(dia) {
  try { return new Intl.DateTimeFormat(formatoLocal(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${dia}T12:00:00Z`)).replace('.', ''); } catch { return dia; }
}
// La barra de arriba del camino: el plan, la racha, los puntos y la preparación.
function barraCabina(c) {
  const plan = c.plan?.elegido ? el('a', { class: 'chip-plan', href: '#progreso', 'aria-label': `${textoPlan(c.plan.elegido, 'corto')} · ${t('acad.plan.fin_estimado')}: ${diaRd(`${c.plan.fin}T12:00:00Z`)}` },
    icono('calendario', 'icono'),
    el('span', { class: 'chip-plan-texto', 'aria-hidden': 'true' }, el('span', { class: 'chip-plan-nombre', texto: textoPlan(c.plan.elegido, 'corto') }),
      el('strong', { texto: t('acad.plan.fin_corto', { fecha: fechaCortaDia(c.plan.fin) }) }))) : null;
  return el('header', { class: 'cabina' },
    el('div', { class: 'cabina-izq' }, plan),
    el('div', { class: 'cabina-der' },
      chipCifra(`fuego${c.racha ? '' : ' cero'}`, 'fuego', numero(c.racha ?? 0), t('acad.racha')),
      chipCifra('estrella', 'estrella', numero(c.puntos ?? 0), t('acad.puntos')),
      el('a', { class: 'cabina-medidor', href: '#progreso', 'aria-label': t('acad.preparacion') }, medidor(c.preparacion?.pct ?? 0, { chico: true }))));
}

// ---- Elegir el plan de estudio (la primera vez) ----
function elegirPlanVista(plan, { alListo, cancelar = null } = {}) {
  let elegido = plan.elegido ?? 'un_mes';
  const tarjetas = plan.opciones.map(o => {
    const b = el('button', {
      type: 'button', class: `plan-opcion${o.recomendado ? ' recomendado' : ''}`, 'aria-pressed': String(o.id === elegido),
      onclick: () => { elegido = o.id; for (const x of tarjetas) x.setAttribute('aria-pressed', String(x.dataset.plan === elegido)); },
      'data-plan': o.id,
    },
    el('span', { class: 'plan-icono' }, icono(TEXTOS_PLAN[o.id]?.icono ?? 'avion')),
    el('span', { class: 'plan-texto' },
      el('strong', { texto: textoPlan(o.id, 'nombre') }),
      el('span', { texto: textoPlan(o.id, 'linea') }),
      el('span', { class: 'plan-fecha', texto: t('acad.plan.terminas', { fecha: diaRd(`${o.fin}T12:00:00Z`) }) })),
    o.recomendado ? el('span', { class: 'plan-sello', texto: t('acad.plan.recomendado') }) : null);
    return b;
  });
  const boton = el('button', {
    type: 'button', class: 'boton-3d grande',
    onclick: async evento => {
      const yo = evento.currentTarget; // después del await, currentTarget ya es null
      yo.disabled = true;
      const r = await api('POST', '/api/academia/plan', { plan: elegido });
      yo.disabled = false;
      if (!r.ok) return avisar(textoError(r.datos.error), 'mal');
      alListo(r.datos.plan);
    },
  }, el('span', { texto: t('acad.continuar') }));
  return el('section', { class: 'plan-elegir', 'aria-labelledby': 'plan-titulo' },
    el('div', { class: 'plan-cielo', 'aria-hidden': 'true' }, avionSvg('plan-avion')),
    el('p', { class: 'antetitulo', texto: t('acad.plan.ante') }),
    el('h1', { id: 'plan-titulo', class: 'titulo-grande', texto: t('acad.plan.titulo') }),
    el('p', { class: 'bajada', texto: t('acad.plan.linea') }),
    el('div', { class: 'plan-opciones', role: 'group', 'aria-label': t('acad.plan.titulo') }, tarjetas),
    el('div', { class: 'botones-pie' }, cancelar ? el('button', { type: 'button', class: 'boton-3d blanco', onclick: cancelar, texto: t('acad.cancelar') }) : null, boton));
}
// Una avioneta de lado (para las celebraciones y los marcadores).
function avionSvg(clase = '') {
  // Mira a la derecha: cola con su timón a la izquierda, ala alta, cabina y hélice adelante.
  const s = svgEl('svg', { viewBox: '0 0 64 32', class: `avioneta ${clase}`.trim(), 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('path', { d: 'M5 6h6l7 8H8z', class: 'avioneta-ala' }));
  s.append(svgEl('path', { d: 'M6 14h40c6 0 12 1.6 12 4.5S52 23 46 23H14c-5 0-8-2.5-8-5z', class: 'avioneta-cuerpo' }));
  s.append(svgEl('path', { d: 'M24 12.5h17l-2 3H26z', class: 'avioneta-ala' }));
  s.append(svgEl('path', { d: 'M44 16.5h6.5', class: 'avioneta-ventana' }));
  s.append(svgEl('path', { d: 'M27 23l-3 6h5l5-6', class: 'avioneta-rueda' }));
  s.append(svgEl('path', { d: 'M61 11v15', class: 'avioneta-helice' }));
  return s;
}

// ---- El camino ----
// Las estrellas de un tema aprobado según su mejor nota: 1 (aprobado), 2 (95 % o más), 3 (100 %).
const estrellasDe = mejor => (mejor >= 100 ? 3 : mejor >= 95 ? 2 : 1);
const DESVIOS = 8; // el sendero serpentea: .desvio-0 … .desvio-7 (estilos)
function nodoCamino({ clase, href = null, nombreIcono, titulo, detalle = null, etiqueta, actual = false, estrellas = 0, burbuja = null, i }) {
  const circulo = el('span', { class: 'nodo-boton' }, icono(nombreIcono, 'icono nodo-icono'));
  const partes = [
    burbuja ? el('span', { class: 'nodo-burbuja', 'aria-hidden': 'true', texto: burbuja }) : null,
    el('span', { class: 'nodo-aro' }, circulo, actual ? el('span', { class: 'nodo-avion', 'aria-hidden': 'true' }, avionSvg()) : null),
    estrellas ? el('span', { class: 'nodo-estrellas', 'aria-hidden': 'true' }, [1, 2, 3].map(k => icono('estrella', `icono estrella-${k <= estrellas ? 'llena' : 'vacia'}`))) : null,
    el('span', { class: 'nodo-nombre', texto: titulo }),
    detalle ? el('span', { class: 'nodo-detalle', texto: detalle }) : null,
  ];
  const dentro = href
    ? el('a', { class: 'nodo-dentro', href, 'aria-label': etiqueta, 'aria-current': actual ? 'step' : null }, partes)
    : el('div', { class: 'nodo-dentro', 'aria-label': etiqueta, role: 'img' }, partes);
  return el('li', { class: `nodo ${clase} desvio-${i % DESVIOS}${actual ? ' actual' : ''}` }, dentro);
}

function senderoMateria(m, n, siguiente) {
  const nodos = [];
  let i = 0;
  // El «Video resumen», lo primero de cada materia.
  if (m.video) {
    const visto = m.video.visto;
    const actualVideo = !visto && siguiente?.tipo === 'video' && siguiente.materia === m.id;
    nodos.push(nodoCamino({
      clase: `video ${visto ? 'hecho' : 'abierto'}`, href: `#video/${encodeURIComponent(m.id)}`, nombreIcono: 'video', i: i++,
      titulo: t('acad.video.nodo'), detalle: m.video.duracion ? t('acad.video.minutos', { n: numero(Math.max(1, Math.round(m.video.duracion / 60))) }) : null,
      etiqueta: t('acad.video.de', { materia: nombreMateria(m.id) }), actual: actualVideo, burbuja: actualVideo ? t('acad.ver') : null,
    }));
  }
  m.temas.forEach(tema => {
    const actual = siguiente?.tipo === 'tema' && siguiente.materia === m.id && siguiente.tema === tema.id;
    const { es } = partirTitulo(tema.titulo);
    if (tema.estado === 'bloqueado') {
      nodos.push(nodoCamino({ clase: 'bloqueado', nombreIcono: 'candado', titulo: es, etiqueta: t('acad.tema_cerrado', { tema: es }), i: i++ }));
    } else {
      const hecho = tema.estado === 'aprobado';
      nodos.push(nodoCamino({
        clase: hecho ? 'hecho' : 'abierto', href: `#tema/${encodeURIComponent(m.id)}/${encodeURIComponent(tema.id)}`, i: i++,
        nombreIcono: hecho ? 'marca' : 'estrella', titulo: es, etiqueta: hecho ? t('acad.tema_hecho', { tema: es, n: numero(tema.mejor ?? 0) }) : t('acad.tema_abierto', { tema: es }),
        actual, estrellas: hecho ? estrellasDe(tema.mejor ?? 0) : 0, burbuja: actual ? t('acad.empezar') : null,
      }));
    }
  });
  const ex = m.examen;
  const actualEx = siguiente?.tipo === 'examen' && siguiente.materia === m.id;
  nodos.push(nodoCamino({
    clase: `examen ${ex.aprobado ? 'hecho' : ex.disponible ? 'abierto' : 'bloqueado'}`, href: ex.disponible ? `#examen/${encodeURIComponent(m.id)}` : null, i: i++,
    nombreIcono: 'trofeo', titulo: t('acad.examen.nodo'), detalle: ex.mejor != null ? t('acad.mejor', { n: numero(ex.mejor) }) : tn('acad.n_preguntas', { n: ex.preguntas }),
    etiqueta: ex.disponible ? t('acad.examen_de', { materia: nombreMateria(m.id) }) : t('acad.examen_cerrado'), actual: actualEx, burbuja: actualEx ? t('acad.empezar') : null,
  }));
  return el('ol', { class: 'sendero', 'aria-label': nombreMateria(m.id) }, nodos);
}

function bannerMateria(m, n, { vacia = false } = {}) {
  const hechos = m.temas.filter(x => x.estado === 'aprobado').length;
  return el('header', { class: 'banner-materia' },
    el('span', { class: 'banner-icono', 'aria-hidden': 'true' }, icono(ICONO_MATERIA[m.id] ?? 'avion')),
    el('div', { class: 'banner-texto' },
      el('p', { class: 'banner-ante', texto: t('acad.materia_n', { n: numero(n + 1) }) }),
      el('h2', { id: `materia-${m.id}`, class: 'banner-titulo', texto: nombreMateria(m.id) }),
      vacia ? el('p', { class: 'banner-linea', texto: t('acad.pronto.linea') })
        : el('div', { class: 'banner-avance' }, el('span', { class: 'banner-barra' }, barraLlena(m.pct)), el('span', { texto: t('acad.temas_de', { n: numero(hechos), total: numero(m.temas.length) }) }))),
    vacia ? el('span', { class: 'banner-pronto', texto: t('acad.pronto') }) : null);
}
function barraLlena(pct) {
  const lleno = el('span', { class: 'barra-relleno' });
  lleno.style.width = `${Math.max(0, Math.min(100, Number(pct) || 0))}%`;
  return lleno;
}

// Lo que toca ahora: el primer video sin ver de una materia abierta, el primer tema abierto o el examen disponible.
function pasoQueToca(c) {
  for (const m of c.materias) {
    if (!m.temas.length) continue;
    if (m.estado === 'bloqueada') return null;
    if (m.video && !m.video.visto && m.temas.every(x => x.estado !== 'aprobado')) return { tipo: 'video', materia: m.id };
    const abierto = m.temas.find(x => x.estado === 'abierto');
    if (abierto) return { tipo: 'tema', materia: m.id, tema: abierto.id };
    if (m.examen.disponible && !m.examen.aprobado) return { tipo: 'examen', materia: m.id };
  }
  return null;
}

// Una avioneta sobre cada materia donde hay pilotos (con cuántos son); la tuya, en verde.
function porMateriaDeRuta(lista) {
  const grupos = new Map();
  for (const x of lista) {
    const k = Math.min(x.lugar, ORDEN_MATERIAS.length - 1);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(x);
  }
  return [...grupos].map(([k, pilotos]) => ({ lugar: (k / (ORDEN_MATERIAS.length - 1)) * 100, pilotos }));
}
const colorDe = nombre => [...String(nombre ?? '')].reduce((n, c) => n + c.codePointAt(0), 0) % 6;
// El grupo en una franja: las 11 materias como puntos de una ruta y cada compañero como una avioneta.
function rutaGrupo(g, { compacta = false } = {}) {
  const lista = g.companeros;
  const ruta = el('div', { class: 'ruta-grupo', role: 'img', 'aria-label': t('acad.grupo.ruta', { n: numero(lista.length) }) },
    el('span', { class: 'ruta-linea' }),
    Array.from({ length: g.materias }, (_, k) => {
      const p = el('span', { class: 'ruta-punto', texto: numero(k + 1) });
      p.style.left = `${(k / (g.materias - 1)) * 100}%`;
      return p;
    }),
    porMateriaDeRuta(lista).map(({ lugar, pilotos }) => {
      const conmigo = pilotos.some(x => x.tu);
      const nombres = pilotos.map(x => x.nombre).join(', ');
      const a = el('span', { class: `ruta-avion${conmigo ? ' tu' : ''}`, title: nombres }, avionSvg(),
        el('span', { class: 'ruta-inicial', texto: pilotos.length > 1 ? numero(pilotos.length) : (pilotos[0].nombre || '?').trim().charAt(0).toUpperCase() }));
      a.style.left = `${lugar}%`;
      return a;
    }));
  if (compacta) return ruta;
  return ruta;
}
function filaCompanero(x) {
  return el('li', { class: `companero${x.tu ? ' tu' : ''}` },
    // 0.9.0: el avatar que eligió; sin avatar, la avioneta con su inicial de siempre.
    x.avatar ? el('span', { class: 'companero-avatar con-avatar', 'aria-hidden': 'true' }, dibujarAvatar(x.avatar, { nombre: x.nombre, tamano: 'medio' }))
      : el('span', { class: `companero-avatar color-${colorDe(x.nombre)}`, 'aria-hidden': 'true' }, avionSvg(), el('span', { texto: (x.nombre || '?').trim().charAt(0).toUpperCase() })),
    el('span', { class: 'companero-texto' },
      el('strong', { texto: x.tu ? t('acad.grupo.tu', { nombre: x.nombre }) : x.nombre }),
      el('span', { class: 'suave', texto: x.lugar >= ORDEN_MATERIAS.length ? t('acad.grupo.terminado') : t('acad.grupo.en_materia', { n: numero(x.lugar + 1), materia: nombreMateria(x.materia) }) }),
      el('span', { class: 'companero-chips' },
        chipCifra(`fuego mini${x.racha ? '' : ' cero'}`, 'fuego', numero(x.racha), t('acad.racha')),
        chipCifra('medalla mini', 'medalla', numero(x.medallas), t('acad.grupo.medallas')))),
    el('span', { class: 'companero-pct', texto: pctTexto(x.pct) }));
}
// El panel «Grupo» (en Progreso entero; en el camino, la franja y un enlace).
function panelGrupo(g, { compacto = false, alCambiar = null } = {}) {
  if (!g?.activo) return null;
  const cabeza = el('div', { class: 'panel-cabeza' },
    el('span', { class: 'panel-icono' }, icono('personas')),
    el('div', {}, el('h2', { texto: t('acad.grupo.titulo') }), el('p', { class: 'suave', texto: tn('acad.grupo.n_pilotos', { n: g.companeros.length }) })),
    el('span', { class: 'panel-ver-flecha', 'aria-hidden': 'true' }, icono('flecha', 'icono')));
  if (compacto) {
    return el('a', { class: 'panel panel-grupo compacto', href: '#progreso', 'aria-label': t('acad.grupo.ver') }, cabeza, rutaGrupo(g, { compacta: true }));
  }
  const ocultar = el('button', {
    type: 'button', class: 'boton-texto con-icono', 'aria-pressed': String(g.oculto),
    onclick: async evento => {
      const yo = evento.currentTarget;
      yo.disabled = true;
      const r = await api('POST', '/api/academia/grupo', { oculto: !g.oculto });
      if (!r.ok) { yo.disabled = false; return avisar(textoError(r.datos.error), 'mal'); }
      alCambiar?.(r.datos.grupo);
    },
  }, icono(g.oculto ? 'ojo' : 'candado', 'icono chico'), el('span', { texto: t(g.oculto ? 'acad.grupo.mostrarme' : 'acad.grupo.ocultarme') }));
  return el('section', { class: 'panel panel-grupo', 'aria-labelledby': 'grupo-titulo' },
    el('div', { class: 'panel-cabeza' },
      el('span', { class: 'panel-icono' }, icono('personas')),
      el('div', {}, el('h2', { id: 'grupo-titulo', texto: t('acad.grupo.titulo') }), el('p', { class: 'suave', texto: t('acad.grupo.linea') }))),
    rutaGrupo(g),
    el('ul', { class: 'lista-companeros' }, g.companeros.map(filaCompanero)),
    el('p', { class: 'suave chica', texto: g.oculto ? t('acad.grupo.estas_oculto') : t('acad.grupo.privado') }),
    ocultar);
}

// 0.8.0: debajo del banner de una materia abierta: «Tu punto débil» (con un ejercicio rápido) y el Modo reto de la materia.
function cajaDebil(debil, datosIntento) {
  if (!debil) return null;
  return el('aside', { class: 'caja-debil', 'aria-label': t('debil.titulo') },
    el('span', { class: 'caja-debil-icono', 'aria-hidden': 'true' }, icono('atencion')),
    el('div', { class: 'caja-debil-texto' },
      el('p', { class: 'caja-debil-ante', texto: t('debil.titulo') }),
      talCual('p', debil.idea || debil.enunciado, 'caja-debil-idea'),
      el('p', { class: 'suave chica', texto: [debil.numero ? t('acad.pregunta_n', { n: debil.numero }) : null, tn('debil.fallos', { n: debil.fallos })].filter(Boolean).join(' · ') })),
    el('button', { type: 'button', class: 'boton-3d naranja chico', onclick: evento => { sonar('toque'); empezarIntento(datosIntento, evento.currentTarget); } }, el('span', { texto: t('debil.practicar') })));
}
function botonReto(n, datosIntento, clase = '') {
  if (!n) return null;
  return el('button', { type: 'button', class: `boton-3d morado chico con-icono boton-reto ${clase}`.trim(), onclick: evento => { sonar('toque'); empezarIntento({ tipo: 'reto', ...datosIntento }, evento.currentTarget); } },
    icono('rayo', 'icono chico'), el('span', { texto: tn('reto.practicar', { n }) }));
}
function extrasMateria(m) {
  const debil = cajaDebil(m.debil, { tipo: 'errores', materia: m.id });
  const reto = botonReto(m.reto, { materia: m.id });
  if (!debil && !reto) return null;
  return el('div', { class: 'materia-extras' }, debil, reto ? el('div', { class: 'materia-reto' }, el('p', { class: 'suave chica', texto: t('reto.linea_materia') }), reto) : null);
}

async function pantallaInicio() {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/academia/camino');
  if (!vigente()) return;
  const esAdmin = verComoAdmin();
  if (!r.ok) return mostrar(marco('inicio', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  const c = r.datos;
  estudioHoy = c.hoy ?? null;
  if (!c.paquete) {
    return mostrar(marco('inicio', barraCabina(c),
      el('section', { class: 'panel bienvenida' },
        el('h1', { class: 'titulo-grande', texto: t('acad.hola', { nombre: estado.usuario.nombreVisible || estado.usuario.nombre }) }),
        vacio('libro', t(esAdmin ? 'acad.sin_paquete.admin' : 'acad.sin_paquete'),
          esAdmin ? el('a', { class: 'boton-enlace con-icono', href: '#contenido' }, icono('subir'), el('span', { texto: t('acad.subir_paquete') })) : null))));
  }
  // La primera vez: elegir el plan de estudio (1 mes recomendado, 2 meses o repaso de 15 días).
  if (!c.plan?.elegido) {
    return mostrar(marco('inicio', elegirPlanVista(c.plan, { alListo: () => pantallaInicio() })));
  }
  const siguiente = pasoQueToca(c);
  const materias = c.materias.map((m, n) => {
    const vacia = !m.temas.length;
    return el('section', { class: `materia-bloque ${claseMateria(m.id)} ${vacia ? 'vacia' : m.estado}`, 'aria-labelledby': `materia-${m.id}` },
      bannerMateria(m, n, { vacia }),
      vacia || m.estado === 'bloqueada' ? null : extrasMateria(m),
      vacia ? null : senderoMateria(m, n, siguiente));
  });
  const hola = el('div', { class: 'saludo' },
    el('h1', { class: 'titulo-grande', texto: t('acad.hola', { nombre: estado.usuario.nombreVisible || estado.usuario.nombre }) }),
    el('p', { class: 'bajada', texto: c.plan.ritmo === 'terminado' ? t('acad.plan.ritmo.terminado') : t('acad.saludo.linea', { n: numero(c.plan.metaHoy) }) }),
    c.repaso ? botonRepaso(c.repaso, 'chico') : null);
  const enFondo = mostrar(marco('inicio', barraCabina(c), hola, avisoMuestra(c.paquete), panelGrupo(c.grupo, { compacto: true }), el('div', { class: 'camino' }, materias)));
  // 0.8.0: el próximo tema y el progreso se piden ya (sin esperar): al tocarlos se abren enseguida.
  if (siguiente?.tipo === 'tema') adelantar(`/api/academia/temas/${encodeURIComponent(siguiente.materia)}/${encodeURIComponent(siguiente.tema)}`);
  adelantar('/api/academia/progreso');
  // Baja hasta el paso que toca (si está más abajo).
  const actual = enFondo ? null : raiz.querySelector('.nodo.actual');
  if (actual && actual.getBoundingClientRect().top > window.innerHeight * 0.75) actual.scrollIntoView({ block: 'center' });
}

// ---- Pantallas de estudio (lección, video, preguntas): arriba la X y la barra de combustible; abajo un botón grande ----
function combustible() {
  const relleno = el('span', { class: 'combustible-relleno' });
  const avion = el('span', { class: 'combustible-avion', 'aria-hidden': 'true' }, avionSvg());
  const nodo = el('div', { class: 'combustible', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': t('acad.avance') },
    el('span', { class: 'combustible-pista' }, relleno), avion);
  return {
    nodo,
    poner(hechos, total) {
      const pct = total ? Math.max(0, Math.min(100, (hechos / total) * 100)) : 0;
      relleno.style.width = `${pct}%`;
      avion.style.left = `${pct}%`;
      nodo.setAttribute('aria-valuenow', String(Math.round(pct)));
    },
  };
}
function marcoEstudio({ clase = '', barra = null, cuenta = null, cuerpo, pie, salir = '#inicio' }) {
  return el('div', { class: `inmersivo ${clase}`.trim() },
    el('header', { class: 'estudio-arriba' },
      el('a', { class: 'estudio-salir', href: salir, 'aria-label': t('acad.salir_practica') }, icono('cerrar')),
      barra, cuenta),
    el('main', { class: 'estudio-cuerpo' }, cuerpo),
    el('footer', { class: 'estudio-pie' }, pie));
}
// El botón grande de abajo (CONTINUAR / COMPROBAR / GIRAR), con su color.
// 0.8.0: con un «toque» suave (sonido = null para COMPROBAR: ahí suena el acierto o el error).
function botonGrande(texto, alPulsar, { tono = 'verde', deshabilitado = false, sonido = 'toque' } = {}) {
  return el('button', { type: 'button', class: `boton-3d grande ${tono}`, disabled: deshabilitado, onclick: evento => { if (sonido) sonar(sonido); return alPulsar(evento); } }, el('span', { texto }));
}
// 0.8.0: la racha sube con la primera respuesta del día (el camino dice si hoy ya estudió).
let estudioHoy = null;
function anotarRespuestaDelDia() {
  if (estudioHoy === false) setTimeout(() => sonar('racha'), 650);
  estudioHoy = true;
}
// La hoja que sube desde abajo con la respuesta (verde o roja).
function hojaRespuesta({ acierto, titulo, partes, boton }) {
  return el('section', { class: `hoja-respuesta ${acierto ? 'bien' : 'mal'}`, role: 'status', 'aria-live': 'polite', 'data-foco': true },
    el('div', { class: 'hoja-cabeza' },
      el('span', { class: 'hoja-icono' }, icono(acierto ? 'marca' : 'cerrar')),
      el('h2', { class: 'hoja-titulo', texto: titulo })),
    el('div', { class: 'hoja-cuerpo' }, partes),
    el('div', { class: 'hoja-pie' }, boton));
}
// Poner la hoja y dejar a la vista, justo arriba de ella, las opciones (con la correcta y la elegida marcadas).
function ponerHoja(raizEstudio, hoja) {
  quitarHojaDe(raizEstudio);
  raizEstudio.append(hoja);
  requestAnimationFrame(() => {
    const alto = hoja.offsetHeight;
    document.body.style.paddingBottom = `${alto + 16}px`;
    const opciones = raizEstudio.querySelector('.opciones-cartas');
    if (opciones) {
      const r = opciones.getBoundingClientRect();
      const libre = window.innerHeight - alto;
      if (r.bottom > libre - 8) window.scrollBy({ top: r.bottom - libre + 16, behavior: prefiereQuieto() ? 'auto' : 'smooth' });
    }
  });
}
function quitarHojaDe(raizEstudio) {
  raizEstudio.querySelector('.hoja-respuesta')?.remove();
  document.body.style.paddingBottom = '';
}
// La celebración al acertar: una explosión de colores y una avioneta que da una vuelta (sin sonido).
function celebrar(contenedor) {
  if (prefiereQuieto()) return;
  const capa = el('div', { class: 'celebracion', 'aria-hidden': 'true' },
    Array.from({ length: 18 }, (_, k) => {
      const p = el('span', { class: `confeti c${k % 6}` });
      p.style.setProperty('--ang', `${(k / 18) * 360}deg`);
      p.style.setProperty('--dist', `${90 + (k % 4) * 28}px`);
      return p;
    }),
    el('span', { class: 'celebracion-avion' }, avionSvg()));
  contenedor.append(capa);
  setTimeout(() => capa.remove(), 1800);
}
function sacudir(nodo) {
  if (!nodo || prefiereQuieto()) return;
  nodo.classList.remove('sacudir');
  void nodo.offsetWidth;
  nodo.classList.add('sacudir');
}
const prefiereQuieto = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// Deslizar a la izquierda = seguir; a la derecha = volver.
function alDeslizar(nodo, { izquierda, derecha }) {
  let x0 = null;
  let y0 = null;
  nodo.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  nodo.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    if (dx < 0) izquierda?.(); else derecha?.();
  }, { passive: true });
}
// Pronunciar una palabra en inglés con la voz del navegador (si tiene).
function pronunciar(texto) {
  try {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'en-US';
    u.rate = 0.85;
    speechSynthesis.speak(u);
  } catch { /* sin voz */ }
}
const hayVoz = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function';
function fichaIngles(w, { conBoton = true } = {}) {
  return el('span', { class: 'ficha-ingles', lang: 'en' },
    el('strong', { texto: w.palabra }),
    w.pronunciacion ? el('span', { class: 'ficha-pron', lang: 'es', texto: w.pronunciacion }) : null,
    conBoton && hayVoz() ? el('button', { type: 'button', class: 'ficha-oir', 'aria-label': t('acad.oir', { palabra: w.palabra }), onclick: () => pronunciar(w.palabra) }, icono('altavoz', 'icono chico')) : null);
}

// ---- La lección de un tema, en tarjetas ----
// Los dibujos de las clases (public/clase) se cargan solo cuando una tarjeta los usa.
let visualesClase = null;
const cargarVisuales = () => (visualesClase ??= import('./clase/visuales.js').then(m => m.VISUALES).catch(() => ({})));
// De dónde sale la tarjeta, abajo y en chico: la primera fuente; las demás, al tocar «y N fuentes más».
function fuentesDe(lista) {
  if (!lista?.length) return null;
  if (lista.length === 1) return el('footer', { class: 'tarjeta-fuentes' }, lineaFuente(lista[0]));
  return el('footer', { class: 'tarjeta-fuentes' }, lineaFuente(lista[0]),
    el('details', { class: 'mas-fuentes' }, el('summary', { texto: tn('acad.mas_fuentes', { n: lista.length - 1 }) }), lista.slice(1).map(lineaFuente)));
}
const ETIQUETA_ESTILO = { normal: 'acad.tarjeta.concepto', analogia: 'acad.tarjeta.analogia', resumen: 'acad.tarjeta.resumen' };

function vistaTarjeta(p, { materia }) {
  const { es, en } = partirTitulo(p.titulo);
  const visual = p.visual ? el('div', { class: 'tarjeta-visual' }) : null;
  let montado = null;
  if (visual) {
    cargarVisuales().then(V => {
      if (!visual.isConnected) return;
      const montar = V[p.visual.tipo] ?? V.cartel;
      try { montado = montar?.(visual, p.visual.parametros ?? {}, { modo: 'interactivo' }); } catch { visual.remove(); }
    });
  }
  const nodo = el('article', { class: `tarjeta-leccion estilo-${p.estilo ?? 'normal'} ${claseMateria(materia)}` },
    el('div', { class: 'tarjeta-sello' },
      el('span', { class: 'sello', texto: t(ETIQUETA_ESTILO[p.estilo] ?? ETIQUETA_ESTILO.normal) }),
      p.parte ? el('span', { class: 'sello-parte', texto: t('acad.de', { n: numero(p.parte), total: numero(p.partes) }) }) : null),
    el('h2', { class: 'tarjeta-titulo', texto: es }),
    en ? el('p', { class: 'tarjeta-en', lang: 'en', texto: en }) : null,
    visual,
    p.texto ? textoRico('p', p.texto, 'tarjeta-texto') : null,
    p.puntos?.length ? el('ul', { class: 'tarjeta-puntos' }, p.puntos.map(x => textoRico('li', x))) : null,
    p.recuerda ? el('aside', { class: 'recuerda' }, el('p', { class: 'recuerda-titulo con-icono' }, icono('bombilla', 'icono'), el('span', { texto: t('acad.recuerda') })), textoRico('p', p.recuerda)) : null,
    p.ejemplo ? el('aside', { class: 'caja-ejemplo' }, el('p', { class: 'caja-ejemplo-titulo', texto: t('acad.ejemplo') }), textoRico('p', p.ejemplo)) : null,
    p.ingles?.length ? el('div', { class: 'tarjeta-fichas', 'aria-label': t('acad.ingles') }, p.ingles.map(w => fichaIngles(w))) : null,
    p.nota ? el('p', { class: 'nota-tarjeta con-icono-arriba' }, icono('info', 'icono chico'), talCual('span', p.nota)) : null,
    fuentesDe(p.fuentes));
  return { nodo, destruir: () => montado?.destruir?.() };
}

function vistaGirar(p, alGirar) {
  let girada = false;
  const carta = el('button', { type: 'button', class: 'carta', 'aria-pressed': 'false', 'aria-label': t('acad.girar.ayuda') },
    el('span', { class: 'carta-cara frente' },
      el('span', { class: 'carta-etiqueta', texto: t('acad.girar.si_te_preguntan') }),
      el('span', { class: 'carta-texto', texto: p.pregunta }),
      el('span', { class: 'carta-toca con-icono' }, icono('actualizar', 'icono chico'), el('span', { texto: t('acad.girar.toca') }))),
    el('span', { class: 'carta-cara atras' },
      el('span', { class: 'carta-etiqueta', texto: t('acad.recuerda') }),
      textoRico('span', p.respuesta, 'carta-texto')));
  const girar = () => { girada = !girada; carta.classList.toggle('girada', girada); carta.setAttribute('aria-pressed', String(girada)); if (girada) alGirar(); };
  carta.addEventListener('click', girar);
  const nodo = el('article', { class: 'tarjeta-girar' },
    el('div', { class: 'tarjeta-sello' }, el('span', { class: 'sello tg', texto: t('acad.girar.sello') }), el('span', { class: 'sello-parte', texto: t('acad.de', { n: numero(p.indice), total: numero(p.total) }) })),
    el('h2', { class: 'tarjeta-titulo chica', texto: t('acad.girar.titulo') }),
    el('div', { class: 'carta-marco' }, carta),
    fuentesDe(p.fuentes));
  return { nodo, girar };
}

function vistaVocabulario(p) {
  return el('article', { class: 'tarjeta-leccion estilo-ingles' },
    el('div', { class: 'tarjeta-sello' }, el('span', { class: 'sello ingles', texto: t('acad.ingles') }), p.parte ? el('span', { class: 'sello-parte', texto: t('acad.de', { n: numero(p.parte), total: numero(p.partes) }) }) : null),
    el('h2', { class: 'tarjeta-titulo', texto: t('acad.vocabulario.titulo') }),
    el('ul', { class: 'lista-vocabulario' }, p.palabras.map(w => el('li', { class: 'palabra' },
      el('div', { class: 'palabra-cabeza' }, fichaIngles(w)),
      el('p', { class: 'palabra-significado', texto: w.significado }),
      w.ejemplo ? el('p', { class: 'palabra-ejemplo', lang: 'en', texto: w.ejemplo }) : null))),
    fuentesDe(p.fuentes));
}

// Una situación de vuelo (PRÁCTICA: no cuenta para la nota): elegir, COMPROBAR y ver la consecuencia.
function vistaSituacion(p, { alElegir }) {
  let elegida = null;
  const botones = p.opciones.map(o => el('button', {
    type: 'button', class: 'opcion-carta', 'aria-pressed': 'false', 'data-letra': o.letra,
    onclick: () => { elegida = o.letra; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === elegida)); alElegir(elegida); },
  }, el('span', { class: 'opcion-letra', texto: o.letra }), el('span', { class: 'opcion-texto', texto: o.texto })));
  const nodo = el('article', { class: 'tarjeta-pregunta practica-vuelo' },
    el('div', { class: 'insignia-pregunta practica' }, icono('avion', 'icono chico'), el('span', { texto: t('acad.practica.sello') })),
    el('p', { class: 'situacion-texto', texto: p.situacion }),
    el('p', { class: 'pregunta-ayuda', texto: t('acad.practica.que_haces') }),
    el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones),
    fuentesDe(p.fuentes));
  return { nodo, botones, elegida: () => elegida };
}

async function pantallaTema(materia, tema) {
  const vigente = nuevoTurno();
  const r = await api('GET', `/api/academia/temas/${encodeURIComponent(materia)}/${encodeURIComponent(tema)}`);
  if (!vigente()) return;
  if (!r.ok) return mostrar(marco('inicio', volverAlCamino(), el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  const l = r.datos;
  const { es, en } = partirTitulo(l.titulo);
  const pantallas = [{ tipo: 'portada' }, ...partirLeccion(l.secciones), { tipo: 'fin' }];
  let paso = 0;
  let actual = null; // { destruir }
  const barraAvance = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const cuerpo = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  // La narración del tema (si el paquete la trae): arriba de las tarjetas, sigue sonando al pasar de una a otra.
  const audioTema = l.audio?.ref ? el('div', { class: 'audio-tema' },
    el('p', { class: 'con-icono' }, icono('altavoz', 'icono chico'), el('span', { texto: l.audio.titulo || t('acad.audio.escuchar') })),
    el('audio', { controls: true, preload: 'none', src: `/api/academia/audio/${encodeURIComponent(l.audio.ref)}`, 'aria-label': l.audio.titulo || t('acad.audio.escuchar') })) : null;
  const raizEstudio = marcoEstudio({ clase: `leccion-tarjetas ${claseMateria(materia)}`, barra: barraAvance.nodo, cuenta, cuerpo: [audioTema, cuerpo], pie });
  const sigue = () => vigente() && cuerpo.isConnected;
  const ir = n => {
    if (n < 0 || n >= pantallas.length) return;
    paso = n;
    pintar();
    window.scrollTo(0, 0);
  };
  const atras = () => (paso > 0 ? el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': t('acad.atras'), onclick: () => ir(paso - 1) }, icono('flecha', 'icono volver-icono')) : null);
  const pintar = () => {
    actual?.destruir?.();
    actual = null;
    quitarHojaDe(raizEstudio);
    const p = pantallas[paso];
    barraAvance.poner(paso, pantallas.length - 1);
    cuenta.textContent = paso > 0 && paso < pantallas.length - 1 ? t('acad.de', { n: numero(paso), total: numero(pantallas.length - 2) }) : '';
    let nodo;
    let botones = [];
    if (p.tipo === 'portada') {
      nodo = el('article', { class: 'portada-tema' },
        el('span', { class: 'portada-icono', 'aria-hidden': 'true' }, icono(ICONO_MATERIA[materia] ?? 'avion')),
        el('p', { class: 'antetitulo', texto: nombreMateria(materia) }),
        el('h1', { class: 'titulo-grande', texto: es }),
        en ? el('p', { class: 'tarjeta-en', lang: 'en', texto: en }) : null,
        el('ul', { class: 'portada-datos' },
          el('li', {}, icono('tarjetas', 'icono'), el('span', { texto: tn('acad.n_tarjetas', { n: pantallas.length - 2 }) })),
          el('li', {}, icono('trofeo', 'icono'), el('span', { texto: tn('acad.n_preguntas_tg', { n: l.preguntas }) }))),
        el('p', { class: 'bajada', texto: t('acad.portada.linea') }),
        // 0.8.0: el punto débil del alumno en este tema (con un ejercicio rápido) y practicar ya, en los dos modos.
        cajaDebil(l.debil, { tipo: 'errores', materia, tema }),
        l.preguntas ? el('div', { class: 'practicar-ya' },
          el('p', { class: 'suave chica', texto: t('reto.practicar_ya') }),
          el('div', { class: 'practicar-ya-botones' },
            el('button', { type: 'button', class: 'boton-3d blanco chico con-icono', onclick: evento => { sonar('toque'); empezarIntento({ tipo: 'tema', materia, tema }, evento.currentTarget); } },
              icono('libro', 'icono chico'), el('span', { texto: t('reto.original') })),
            botonReto(l.reto, { materia, tema }))) : null);
      botones = [botonGrande(t('acad.empezar'), () => ir(1))];
    } else if (p.tipo === 'fin') {
      nodo = el('article', { class: 'fin-leccion' },
        el('div', { class: 'fin-cielo', 'aria-hidden': 'true' }, avionSvg('fin-avion')),
        el('h1', { class: 'titulo-grande', texto: t('acad.fin.titulo') }),
        el('p', { class: 'bajada', texto: l.preguntas ? tn('acad.fin.linea', { n: l.preguntas }) : t('acad.fin.sin_preguntas') }));
      botones = [atras(), l.preguntas
        ? botonGrande(t('acad.empezar_preguntas_corto'), evento => empezarIntento({ tipo: 'tema', materia, tema }, evento.currentTarget))
        : botonGrande(t('acad.seguir'), async evento => {
          evento.currentTarget.disabled = true;
          await api('POST', `/api/academia/temas/${encodeURIComponent(materia)}/${encodeURIComponent(tema)}/leido`, {});
          sonar('tema');
          location.hash = '#inicio';
        })];
      // 0.8.0: además del examen del tema (Original, el que aprueba), el Modo reto.
      if (l.preguntas && l.reto) nodo.append(el('div', { class: 'fin-reto' }, el('p', { class: 'suave chica', texto: t('reto.linea_tema') }), botonReto(l.reto, { materia, tema })));
      setTimeout(() => { if (sigue()) celebrar(cuerpo); }, 150);
    } else if (p.tipo === 'girar') {
      const v = vistaGirar(p, () => { boton.replaceWith(continuar); });
      nodo = v.nodo;
      const continuar = botonGrande(t('acad.continuar'), () => ir(paso + 1));
      const boton = botonGrande(t('acad.girar.boton'), () => v.girar(), { tono: 'azul' });
      botones = [atras(), boton];
    } else if (p.tipo === 'situacion') {
      const comprobar = botonGrande(t('acad.comprobar'), () => {
        const letra = v.elegida();
        if (!letra) return;
        const o = p.opciones.find(x => x.letra === letra);
        const correcta = p.opciones.find(x => x.correcta);
        for (const b of v.botones) {
          b.disabled = true;
          b.classList.toggle('es-correcta', b.dataset.letra === correcta.letra);
          b.classList.toggle('es-mala', b.dataset.letra === letra && !o.correcta);
        }
        sonar(o.correcta ? 'bien' : 'mal');
        if (o.correcta) celebrar(cuerpo); else sacudir(v.nodo.querySelector(`[data-letra="${letra}"]`));
        pie.replaceChildren();
        ponerHoja(raizEstudio, hojaRespuesta({
          acierto: o.correcta,
          titulo: o.correcta ? t('acad.practica.bien') : t('acad.practica.mejor', { letra: correcta.letra }),
          partes: [
            o.consecuencia ? el('section', { class: 'caja-hoja' }, el('h3', { texto: t('acad.practica.consecuencia') }), el('p', { texto: o.consecuencia })) : null,
            !o.correcta && correcta.consecuencia ? el('section', { class: 'caja-hoja' }, el('h3', { texto: t('acad.practica.la_mejor', { letra: correcta.letra }) }), el('p', { texto: `${correcta.texto} — ${correcta.consecuencia}` })) : null,
            p.recuerda ? el('section', { class: 'caja-hoja recuerda-hoja' }, el('h3', { class: 'con-icono' }, icono('bombilla', 'icono chico'), el('span', { texto: t('acad.recuerda') })), textoRico('p', p.recuerda)) : null,
          ],
          boton: botonGrande(t('acad.continuar'), () => ir(paso + 1), { tono: o.correcta ? 'verde' : 'rojo' }),
        }));
      }, { deshabilitado: true, sonido: null });
      const v = vistaSituacion(p, { alElegir: () => { comprobar.disabled = false; } });
      nodo = v.nodo;
      botones = [atras(), comprobar];
    } else if (p.tipo === 'vocabulario') {
      nodo = vistaVocabulario(p);
      botones = [atras(), botonGrande(t('acad.continuar'), () => ir(paso + 1))];
    } else {
      const v = vistaTarjeta(p, { materia });
      nodo = v.nodo;
      actual = v;
      botones = [atras(), botonGrande(t('acad.continuar'), () => ir(paso + 1))];
    }
    cuerpo.replaceChildren(nodo);
    pie.replaceChildren(...botones.filter(Boolean));
  };
  alDeslizar(cuerpo, {
    izquierda: () => { if (['tarjeta', 'vocabulario', 'portada'].includes(pantallas[paso].tipo) || (pantallas[paso].tipo === 'girar' && cuerpo.querySelector('.carta.girada'))) ir(paso + 1); },
    derecha: () => { if (!raizEstudio.querySelector('.hoja-respuesta')) ir(paso - 1); },
  });
  pintar();
  mostrar(raizEstudio);
}
function volverAlCamino() {
  return el('a', { class: 'volver con-icono', href: '#inicio' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.volver') }));
}

// ---- El «Video resumen» de una materia (lo primero de su camino) ----
// La narración (mp3) suena entera y las escenas se cambian solas según su tiempo (public/clase/reproductor.js). Antes
// de empezar se ve el cartel con el botón grande: el iPhone solo deja sonar el audio después de un toque.
const TEXTOS_REPRODUCTOR = {
  reproducir: 'clase.rep.reproducir', pausar: 'clase.rep.pausar', anterior: 'clase.rep.anterior', siguiente: 'clase.rep.siguiente', velocidad: 'clase.rep.velocidad',
  voz: 'clase.rep.voz', escena: 'clase.rep.escena', de: 'clase.rep.de', probar: 'clase.rep.probar', volver: 'clase.rep.volver', fin: 'clase.rep.fin',
  repetir: 'clase.rep.repetir', responde: 'clase.rep.responde', continuar: 'clase.rep.continuar', sinVoz: 'clase.rep.sinVoz', irA: 'clase.rep.irA', etiqueta: 'clase.rep.etiqueta',
};
const textosReproductor = () => Object.fromEntries(Object.entries(TEXTOS_REPRODUCTOR).map(([k, clave]) => [k, t(clave)]));
async function duracionDe(url) {
  return new Promise(listo => {
    const a = new Audio();
    const fin = valor => { a.removeAttribute('src'); listo(valor); };
    const espera = setTimeout(() => fin(null), 6000);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => { clearTimeout(espera); fin(Number.isFinite(a.duration) ? a.duration : null); });
    a.addEventListener('error', () => { clearTimeout(espera); fin(null); });
    a.src = url;
  });
}
function triangulo() {
  const s = svgEl('svg', { viewBox: '0 0 24 24', class: 'icono-play', 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('path', { d: 'M8 5.2v13.6c0 .8.9 1.3 1.6.8l10.2-6.8a1 1 0 0 0 0-1.6L9.6 4.4c-.7-.5-1.6 0-1.6.8z' }));
  return s;
}
async function pantallaVideo(materia) {
  const vigente = nuevoTurno();
  const r = await api('GET', `/api/academia/video/${encodeURIComponent(materia)}`);
  if (!vigente()) return;
  if (!r.ok) return mostrar(marco('inicio', volverAlCamino(), el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  const v = r.datos;
  const audioUrl = v.audio?.ref ? `/api/academia/audio/${encodeURIComponent(v.audio.ref)}` : null;
  const titulo = v.titulo || t('acad.video.titulo', { materia: nombreMateria(materia) });
  const total = v.escenas.length ? Math.max(...v.escenas.map(e => e.fin_s)) : null;
  const barraAvance = combustible();
  const lugar = el('div', { class: 'video-lugar' });
  const pie = el('div', { class: 'estudio-botones' });
  const raizEstudio = marcoEstudio({ clase: `video-materia ${claseMateria(materia)}${audioUrl ? ' con-audio' : ''}`, barra: barraAvance.nodo, cuerpo: lugar, pie });
  // El reproductor se pide ya (no al tocar): así el toque llega al audio sin esperar la red.
  const moduloReproductor = import('./clase/reproductor.js');
  let reproductor = null;
  let reloj = null;
  const marcarVisto = () => api('POST', `/api/academia/video/${encodeURIComponent(materia)}/visto`, {});
  const seguir = botonGrande(t('acad.video.ir_temas'), async evento => { evento.currentTarget.disabled = true; await marcarVisto(); location.hash = '#inicio'; });
  const empezar = async () => {
      poster.disabled = true;
      ver.disabled = true;
      // El iPhone solo deja sonar un audio que empezó DENTRO del toque: se crea y se le da «play» aquí, antes de esperar nada,
      // y el reproductor usa este mismo audio.
      const audioDelToque = audioUrl ? new Audio(audioUrl) : null;
      if (audioDelToque) { audioDelToque.preload = 'auto'; audioDelToque.play().catch(() => {}); }
      const [{ montarReproductor }, duracion] = await Promise.all([moduloReproductor, !v.escenas.length && audioUrl ? duracionDe(audioUrl) : null]);
      if (!lugar.isConnected) return;
      const leccion = leccionDeVideo(v, { titulo, antetitulo: nombreMateria(materia), audioUrl, duracionAudio: duracion });
      lugar.replaceChildren();
      raizEstudio.classList.add('reproduciendo');
      pie.replaceChildren();
      reproductor = montarReproductor(lugar, leccion, {
        textos: textosReproductor(), audio: audioDelToque,
        onProgreso: p => barraAvance.poner(p.porcentaje, 100),
        // Al terminar: queda visto (el círculo sale dorado) y abajo, «IR A LOS TEMAS».
        onFin: () => { marcarVisto(); celebrar(lugar); raizEstudio.classList.remove('reproduciendo'); pie.replaceChildren(seguir); },
      });
      reproductor.reproducir();
      // La barra de arriba avanza con el video.
      reloj = setInterval(() => { if (!lugar.isConnected) return clearInterval(reloj); barraAvance.poner(reproductor.estado.porcentaje, 100); }, 500);
      raizEstudio.reproductor = reproductor; // para las pruebas en el navegador (no es global)
  };
  const ver = botonGrande(t('acad.video.ver'), () => empezar(), { tono: 'naranja' });
  const poster = el('button', {
    type: 'button', class: 'video-poster', onclick: () => empezar(),
  },
  el('span', { class: 'video-poster-cielo', 'aria-hidden': 'true' }, avionSvg('video-poster-avion')),
  el('span', { class: 'video-poster-ante', texto: t('acad.video.ante', { n: numero(ORDEN_MATERIAS.indexOf(materia) + 1) }) }),
  el('span', { class: 'video-poster-titulo', texto: titulo }),
  el('span', { class: 'video-poster-play', 'aria-hidden': 'true' }, triangulo()),
  el('span', { class: 'video-poster-datos', texto: [total ? t('acad.video.minutos', { n: numero(Math.max(1, Math.round(total / 60))) }) : null, v.escenas.length ? tn('acad.video.escenas', { n: v.escenas.length }) : null, audioUrl ? t('acad.video.con_voz') : t('acad.video.sin_voz')].filter(Boolean).join(' · ') }));
  lugar.append(poster, el('p', { class: 'video-nota suave', texto: audioUrl ? t('acad.video.nota') : t('acad.video.nota_sin_audio') }),
    v.visto ? el('button', { type: 'button', class: 'boton-texto', onclick: () => { location.hash = '#inicio'; }, texto: t('acad.video.ya_lo_vi') }) : null);
  pie.append(ver);
  barraAvance.poner(0, 100);
  mostrar(raizEstudio);
  // Al salir de la pantalla, el audio se apaga.
  const alSalir = () => setTimeout(() => { if (!lugar.isConnected) { reproductor?.destruir(); window.removeEventListener('hashchange', alSalir); } });
  window.addEventListener('hashchange', alSalir);
}

// ---- El examen de una materia (como en ENALAS: todas sus preguntas, mezcladas) ----
async function pantallaExamen(materia) {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/academia/camino');
  if (!vigente()) return;
  const m = r.ok ? r.datos.materias.find(x => x.id === materia) : null;
  if (!m) return mostrar(marco('inicio', volverAlCamino(), el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos?.error || 'no_existe') }))));
  mostrar(marco('inicio', volverAlCamino(),
    el('section', { class: `examen-portada ${claseMateria(materia)}` },
      el('span', { class: 'examen-trofeo', 'aria-hidden': 'true' }, icono('trofeo')),
      el('p', { class: 'antetitulo', texto: t('acad.examen.ante') }),
      el('h1', { class: 'titulo-grande', texto: nombreMateria(materia) }),
      el('p', { class: 'bajada', texto: t('acad.examen.linea') }),
      el('ul', { class: 'portada-datos' },
        el('li', {}, icono('fila', 'icono'), el('span', { texto: tn('acad.n_preguntas', { n: m.examen.preguntas }) })),
        // 0.9.2: el tiempo del examen (preguntas × segundos por pregunta, de los ajustes).
        el('li', {}, icono('reloj', 'icono'), el('span', { texto: t('examen.portada.tiempo', { min: numero(Math.ceil((m.examen.preguntas * (r.datos.examenSegundos ?? 90)) / 60)) }) })),
        el('li', {}, icono('bandera', 'icono'), el('span', { texto: t('acad.necesitas', { n: numero(r.datos.umbral) }) })),
        m.examen.mejor != null ? el('li', {}, icono('estrella', 'icono'), el('span', { texto: t('acad.mejor', { n: numero(m.examen.mejor) }) })) : null),
      el('section', { class: 'examen-reglas', 'aria-labelledby': 'examen-reglas-titulo' },
        el('h2', { id: 'examen-reglas-titulo', texto: t('examen.reglas.titulo') }),
        el('ol', {},
          el('li', { texto: t('examen.reglas.1', { min: numero(Math.ceil((m.examen.preguntas * (r.datos.examenSegundos ?? 90)) / 60)), seg: numero(r.datos.examenSegundos ?? 90) }) }),
          el('li', { texto: t('examen.reglas.2') }),
          el('li', { texto: t('examen.reglas.3') }),
          el('li', { texto: t('examen.reglas.4') }),
          el('li', { texto: t('examen.reglas.5', { n: numero(r.datos.umbral) }) }))),
      m.examen.disponible
        ? el('button', { type: 'button', class: 'boton-3d grande naranja', onclick: evento => empezarIntento({ tipo: 'examen', materia }, evento.currentTarget) }, el('span', { texto: t('acad.empezar_examen') }))
        : el('p', { class: 'aviso', texto: t('acad.examen_cerrado') }))));
}

// ---- Las preguntas: una por pantalla, como un ejercicio de Duolingo ----
// La figura original, con «tocar para ampliar» (a pantalla completa, se puede mover y acercar con dos dedos).
function figuraPregunta(q) {
  if (!q.figura) return null;
  const src = `/api/academia/figuras/${encodeURIComponent(q.figura.ref ?? q.figura.numero)}`;
  const nombre = t('acad.figura', { n: q.figura.numero });
  const abrir = () => {
    const cerrar = () => capa.remove();
    const capa = el('div', { class: 'figura-grande', role: 'dialog', 'aria-modal': 'true', 'aria-label': nombre },
      el('div', { class: 'figura-grande-barra' }, el('span', { texto: q.figura.titulo || nombre }),
        el('button', { type: 'button', class: 'boton-3d blanco cuadrado', 'aria-label': t('acad.cerrar'), onclick: cerrar }, icono('cerrar'))),
      el('div', { class: 'figura-grande-lienzo' }, el('img', { src, alt: nombre })));
    capa.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    document.body.append(capa);
    capa.querySelector('button').focus();
  };
  return el('figure', { class: 'q-figura' },
    el('button', { type: 'button', class: 'q-figura-boton', 'aria-label': t('acad.figura.ampliar', { figura: nombre }), onclick: abrir },
      el('img', { src, alt: nombre, loading: 'lazy' }),
      el('span', { class: 'q-figura-lupa', 'aria-hidden': 'true' }, icono('lupa', 'icono chico'))),
    el('figcaption', { texto: q.figura.titulo || nombre }));
}
// La insignia de arriba: «TEST GUIDE · Pregunta 10-5» (el número tal cual) o «POH».
function insigniaPregunta(q) {
  if (q.origen === 'poh') return el('div', { class: 'insignia-pregunta poh' }, icono('manual', 'icono chico'), el('span', { texto: t('acad.origen.poh_corto') }));
  return el('div', { class: 'insignia-pregunta tg' }, icono('libro', 'icono chico'),
    el('span', { texto: t('acad.origen.test_guide_sello') }), q.numero ? el('span', { class: 'insignia-numero' }, `${t('acad.pregunta')} `, talCual('span', q.numero)) : null);
}
// 0.8.0: en Modo reto, arriba la insignia «MODO RETO» (las opciones no son las del Test Guide; el enunciado sí).
function tarjetaPregunta(q) {
  return [
    el('div', { class: 'q-cabeza' }, insigniaPregunta(q), q.modo === 'reto' ? el('span', { class: 'insignia-reto con-icono' }, icono('rayo', 'icono chico'), el('span', { texto: t('reto.sello') })) : null,
      q.seccion ? talCual('span', q.seccion, 'q-seccion') : null),
    q.origen === 'poh' && q.fuente ? lineaFuente(q.fuente) : null,
    talCual('p', q.enunciado, 'q-enunciado'),
    figuraPregunta(q),
  ];
}
// Lo que se ve después de responder (en la hoja de abajo y en la lista de falladas).
function partesRespuesta(q, resp) {
  const opcion = letra => q.opciones.find(o => o.letra === letra)?.texto ?? '';
  return [
    // 0.8.0: en Modo reto las letras cambian; las explicaciones hablan de la letra del Test Guide.
    resp.modo === 'reto' && resp.letraOriginal && resp.letraOriginal !== resp.correcta
      ? el('p', { class: 'nota-letras con-icono' }, icono('info', 'icono chico'), el('span', { texto: t('reto.letras', { aqui: resp.correcta, original: resp.letraOriginal }) })) : null,
    resp.explicacion ? el('section', { class: 'caja-hoja caja-original' },
      el('h3', { class: 'con-icono' }, icono('libro', 'icono chico'), el('span', { texto: q.origen === 'poh' ? t('acad.explicacion_poh') : t('acad.explicacion_original') })),
      talCual('p', resp.explicacion)) : null,
    el('section', { class: 'caja-hoja caja-sencilla' },
      el('h3', { class: 'con-icono' }, icono('chispa', 'icono chico'), el('span', { texto: t('acad.explicacion_sencilla') })),
      talCual('p', resp.sencilla)),
    resp.idea ? el('section', { class: 'caja-hoja caja-idea' },
      el('h3', { class: 'con-icono' }, icono('atencion', 'icono chico'), el('span', { texto: t('acad.por_que_elegiste') })),
      el('p', { class: 'suave' }, el('strong', { texto: `${resp.elegida}. ` }), talCual('span', opcion(resp.elegida))),
      talCual('p', resp.idea),
      resp.trampa ? el('p', { class: 'suave chica' }, el('strong', { texto: `${t('reto.trampa')}: ` }), talCual('span', resp.trampa)) : null) : null,
    // 0.8.0: en Modo reto, por qué es incorrecta CADA opción nueva (y la trampa que tiende).
    resp.modo === 'reto' && resp.reto?.length ? el('section', { class: 'caja-hoja caja-reto' },
      el('h3', { class: 'con-icono' }, icono('rayo', 'icono chico'), el('span', { texto: t('reto.por_que') })),
      el('ul', { class: 'lista-reto' }, resp.reto.map(o => el('li', {},
        el('p', {}, el('strong', { texto: `${o.letra}. ` }), talCual('span', o.texto)),
        o.porque ? talCual('p', o.porque, 'reto-porque') : null,
        o.trampa ? el('p', { class: 'suave chica' }, el('strong', { texto: `${t('reto.trampa')}: ` }), talCual('span', o.trampa)) : null)))) : null,
    resp.ingles?.length ? el('section', { class: 'caja-hoja caja-ingles' },
      el('h3', { class: 'con-icono' }, icono('avion', 'icono chico'), el('span', { texto: t('acad.ingles') })),
      el('ul', { class: 'lista-ingles' }, resp.ingles.map(w => el('li', {},
        fichaIngles(w), el('span', { class: 'ingles-significado', texto: w.significado }), w.ejemplo ? el('em', { class: 'ingles-ejemplo', lang: 'en', texto: w.ejemplo }) : null)))) : null,
  ];
}
function bloqueRespuesta(q, resp) {
  return el('div', { class: 'retro' },
    el('p', { class: `retro-titulo con-icono ${resp.acierto ? 'tono-bien' : 'tono-mal'}` },
      icono(resp.acierto ? 'bien' : 'mal'), el('span', { texto: resp.acierto ? t('acad.correcto') : t('acad.respuesta_correcta', { letra: resp.correcta }) })),
    partesRespuesta(q, resp));
}
function opcionesFijas(q, resp) {
  return el('div', { class: 'opciones-cartas' }, q.opciones.map(o => el('div', { class: `opcion-carta fija${o.letra === resp.correcta ? ' es-correcta' : ''}${o.letra === resp.elegida && !resp.acierto ? ' es-mala' : ''}` },
    el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto'),
    o.letra === resp.correcta ? icono('marca', 'icono opcion-marca') : o.letra === resp.elegida ? icono('cerrar', 'icono opcion-marca') : null)));
}

// 0.8.0: la revisión completa al terminar (examen, tema, reto, repaso): cada pregunta con lo que eligió, la correcta, la
// explicación original y la sencilla; arriba el filtro «Solo las que fallé».
function revisionCompleta(res) {
  const lista = res.revision ?? res.falladas ?? [];
  if (!lista.length) return null;
  const malas = lista.filter(q => !q.respuesta?.acierto).length;
  let soloMalas = malas > 0 && lista.length > 6;
  const filas = lista.map((q, k) => {
    const bien = q.respuesta?.acierto;
    const d = el('details', { class: `revision-fila ${bien ? 'bien' : 'mal'}`, 'data-bien': bien ? '1' : '0' },
      el('summary', {},
        el('span', { class: `revision-marca ${bien ? 'tono-bien' : 'tono-mal'}`, 'aria-label': t(bien ? 'acad.correcto' : 'revision.fallada') }, icono(bien ? 'marca' : 'cerrar', 'icono chico')),
        el('span', { class: 'q-numero' }, q.numero ? talCual('span', t('acad.pregunta_n', { n: q.numero })) : q.origen === 'poh' ? t('acad.origen.poh_corto') : numero(k + 1)),
        talCual('span', q.enunciado, 'revision-enunciado'),
        el('span', { class: 'revision-letras suave chica', texto: bien ? t('revision.tu_respuesta', { letra: q.respuesta.elegida }) : t('revision.tu_y_correcta', { letra: q.respuesta?.elegida ?? '—', correcta: q.respuesta?.correcta ?? '—' }) })),
      el('div', { class: 'revision-dentro' }, tarjetaPregunta(q).slice(3), opcionesFijas(q, q.respuesta), bloqueRespuesta(q, q.respuesta)));
    return d;
  });
  const cajaLista = el('div', { class: 'revision-lista' }, filas);
  const pintarFiltro = () => {
    for (const f of filas) f.hidden = soloMalas && f.dataset.bien === '1';
    todas.setAttribute('aria-pressed', String(!soloMalas));
    fallas.setAttribute('aria-pressed', String(soloMalas));
  };
  const todas = el('button', { type: 'button', class: 'filtro', onclick: () => { soloMalas = false; pintarFiltro(); } }, el('span', { texto: t('revision.todas', { n: numero(lista.length) }) }));
  const fallas = el('button', { type: 'button', class: 'filtro', disabled: !malas, onclick: () => { soloMalas = true; pintarFiltro(); } }, el('span', { texto: t('revision.solo_falle', { n: numero(malas) }) }));
  pintarFiltro();
  return el('section', { class: 'panel revision', 'aria-labelledby': 'revision-titulo' },
    el('h2', { id: 'revision-titulo', class: 'con-icono' }, icono('lupa'), el('span', { texto: t('revision.titulo') })),
    el('p', { class: 'suave', texto: t('revision.linea', { bien: numero(lista.length - malas), mal: numero(malas) }) }),
    el('div', { class: 'filtros', role: 'group', 'aria-label': t('revision.filtro') }, todas, fallas),
    cajaLista);
}

async function pantallaPractica(id) {
  const vigente = nuevoTurno();
  const r = await api('GET', `/api/academia/intentos/${encodeURIComponent(id)}`);
  if (!vigente()) return;
  if (!r.ok) return mostrar(marco('inicio', volverAlCamino(), el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  const intento = r.datos;
  // 0.9.2: el examen de materia con reloj va aparte (public/examen-vista.js, solo se carga para un examen).
  if (intento.examen?.reloj) {
    const vista = await import('./examen-vista.js');
    if (!vigente()) return;
    return vista.examenConReloj(intento, {
      el, t, tn, numero, icono, talCual, api, avisar, textoError, mostrar, sonar, medidor, celebrar, marcoEstudio, tarjetaPregunta,
      revisionCompleta, claseMateria, empezarIntento, vigente,
    });
  }
  const barraAvance = combustible();
  const cuenta = el('span', { class: 'estudio-cuenta' });
  const zona = el('div', { class: 'estudio-tarjeta' });
  const pie = el('div', { class: 'estudio-botones' });
  const tituloIntento = intento.tipo === 'repaso' ? t('acad.repaso') : intento.tipo === 'examen' ? t('acad.examen_de', { materia: nombreMateria(intento.materia) })
    : intento.tipo === 'reto' ? t('reto.de', { materia: nombreMateria(intento.materia) }) : intento.tipo === 'errores' ? t('errores.titulo') : nombreMateria(intento.materia);
  const raizEstudio = marcoEstudio({ clase: `practica-tg ${intento.materia ? claseMateria(intento.materia) : ''}`, barra: barraAvance.nodo, cuenta, cuerpo: zona, pie });
  const avance = () => {
    const hechas = intento.preguntas.filter(q => q.respuesta).length;
    barraAvance.poner(hechas, intento.total);
    cuenta.textContent = t('acad.de', { n: numero(hechas), total: numero(intento.total) });
  };
  const sigue = () => vigente() && zona.isConnected;
  const quitarHoja = () => quitarHojaDe(raizEstudio);
  const pintarPregunta = i => {
    quitarHoja();
    const q = intento.preguntas[i];
    avance();
    let elegida = null;
    const botones = q.opciones.map(o => el('button', {
      type: 'button', class: 'opcion-carta', 'data-letra': o.letra, 'aria-pressed': 'false',
      onclick: () => { elegida = o.letra; for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.letra === elegida)); comprobar.disabled = false; },
    }, el('span', { class: 'opcion-letra', texto: o.letra }), talCual('span', o.texto, 'opcion-texto')));
    const comprobar = botonGrande(t('acad.comprobar'), async () => {
      if (!elegida) return;
      comprobar.disabled = true;
      for (const b of botones) b.disabled = true;
      const x = await api('POST', `/api/academia/intentos/${intento.id}/responder`, { pregunta: q.id, elegida });
      if (!sigue()) return;
      if (!x.ok) { comprobar.disabled = false; for (const b of botones) b.disabled = false; return avisar(textoError(x.datos.error), 'mal'); }
      q.respuesta = x.datos.respuesta;
      sonar(q.respuesta.acierto ? 'bien' : 'mal');
      anotarRespuestaDelDia();
      pintarRespondida(i, true);
    }, { deshabilitado: true, sonido: null });
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta' },
      el('p', { class: 'pregunta-de', texto: tituloIntento }),
      tarjetaPregunta(q), el('div', { class: 'opciones-cartas', role: 'group', 'aria-label': t('acad.elige') }, botones)));
    pie.replaceChildren(comprobar);
  };
  const pintarRespondida = (i, recien = false) => {
    quitarHoja();
    const q = intento.preguntas[i];
    avance();
    const resp = q.respuesta;
    const siguiente = intento.preguntas.findIndex(x => !x.respuesta);
    zona.replaceChildren(el('article', { class: 'tarjeta-pregunta' },
      el('p', { class: 'pregunta-de', texto: tituloIntento }),
      tarjetaPregunta(q), opcionesFijas(q, resp)));
    pie.replaceChildren();
    const boton = siguiente >= 0
      ? botonGrande(t('acad.continuar'), () => { pintarPregunta(siguiente); window.scrollTo(0, 0); }, { tono: resp.acierto ? 'verde' : 'rojo' })
      : botonGrande(t('acad.ver_resultado'), evento => terminarYMostrar(evento.currentTarget), { tono: resp.acierto ? 'verde' : 'rojo' });
    ponerHoja(raizEstudio, hojaRespuesta({
      acierto: resp.acierto,
      titulo: resp.acierto ? t('acad.correcto') : t('acad.respuesta_correcta', { letra: resp.correcta }),
      partes: partesRespuesta(q, resp),
      boton,
    }));
    if (recien) {
      if (resp.acierto) celebrar(zona);
      else sacudir(zona.querySelector('.es-mala'));
    }
    const hoja = raizEstudio.querySelector('.hoja-respuesta');
    if (hoja) { hoja.setAttribute('tabindex', '-1'); try { hoja.focus({ preventScroll: true }); } catch { hoja.focus(); } }
  };
  const terminarYMostrar = async boton => {
    if (boton) boton.disabled = true;
    const x = await api('POST', `/api/academia/intentos/${intento.id}/terminar`, {});
    if (!sigue()) return;
    if (boton) boton.disabled = false;
    if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
    pintarResultado(x.datos);
  };
  const pintarResultado = res => {
    quitarHoja();
    barraAvance.poner(1, 1);
    cuenta.textContent = '';
    const otraVez = res.tipo === 'repaso' ? null : el('button', { type: 'button', class: `boton-3d ${res.aprobado ? 'blanco' : 'grande naranja'}`,
      onclick: evento => empezarIntento({ tipo: res.tipo, materia: res.materia, tema: res.tema }, evento.currentTarget) }, el('span', { texto: t('acad.otra_vez') }));
    const titulo = res.tipo === 'reto' ? t('reto.hecho') : res.tipo === 'errores' ? t('errores.hecho') : res.aprobado == null ? t('acad.repaso_hecho') : res.aprobado ? (res.tipo === 'examen' ? t('acad.examen_aprobado') : t('acad.tema_aprobado')) : t('acad.no_aprobado');
    zona.replaceChildren(...[
      el('section', { class: `resultado-vuelo ${res.aprobado === false ? 'falta' : 'bien'}`, 'data-foco': true },
        medidor(res.pct, { etiqueta: t('acad.resultado.nota') }),
        el('h1', { class: 'titulo-grande', texto: titulo }),
        el('p', { class: 'bajada', texto: t('acad.resultado.de', { n: numero(res.aciertos), total: numero(res.total) }) }),
        res.aprobado === false ? el('p', { class: 'resultado-necesitas', texto: t('acad.necesitas', { n: numero(res.umbral) }) })
          : el('p', { class: 'resultado-puntos con-icono' }, icono('estrella'), el('span', { texto: t('acad.ganaste', { n: numero(res.puntos) }) }))),
      res.reexplicacion?.length ? el('section', { class: 'panel caja-sencilla reexplicacion' },
        el('h2', { class: 'con-icono' }, icono('chispa'), el('span', { texto: t('acad.mas_facil') })),
        res.reexplicacion.map(s => el('div', { class: 'reexplicacion-parte' }, el('h3', { texto: s.titulo }), talCual('p', s.texto ?? (s.puntos ?? []).join('\n')), s.fuentes.map(lineaFuente)))) : null,
      revisionCompleta(res)].filter(Boolean));
    // 0.8.0: «Practicar mis errores»: las que falló en este intento, otra vez (Original).
    const errores = res.falladas.length ? el('button', { type: 'button', class: 'boton-3d naranja con-icono',
      onclick: evento => { sonar('toque'); empezarIntento({ tipo: 'errores', intento: res.id }, evento.currentTarget); } }, icono('actualizar', 'icono chico'), el('span', { texto: tn('errores.practicar', { n: res.falladas.length }) })) : null;
    pie.classList.add('apilados');
    pie.replaceChildren(...[res.aprobado === false ? otraVez : el('a', { class: 'boton-3d grande', href: '#inicio' }, el('span', { texto: t('acad.seguir') })),
      errores,
      res.aprobado === false ? el('a', { class: 'boton-3d blanco', href: '#inicio', texto: t('acad.volver') }) : otraVez].filter(Boolean));
    if (res.aprobado !== false) celebrar(zona);
    sonar(res.aprobado && res.tipo === 'examen' ? 'nivel' : res.aprobado ? 'tema' : res.aprobado === false ? 'mal' : 'bien');
    window.scrollTo(0, 0);
  };
  mostrar(raizEstudio);
  // Al volver a un intento a medias (por ejemplo, después de recargar): sigue en la primera sin responder.
  const pendiente = intento.preguntas.findIndex(q => !q.respuesta);
  if (pendiente >= 0) pintarPregunta(pendiente);
  else await terminarYMostrar(null);
}

// ---- Mi progreso: el plan de estudio, la preparación, el grupo y cada materia ----
function panelPlan(plan, { alCambiar }) {
  if (!plan?.elegido) return null;
  const tono = { adelantado: 'bien', a_tiempo: 'info', atrasado: 'atencion', terminado: 'bien' }[plan.ritmo] ?? 'info';
  const caja = el('section', { class: 'panel panel-plan', 'aria-labelledby': 'plan-panel-titulo' });
  const dibujarPanel = () => caja.replaceChildren(
    el('div', { class: 'panel-cabeza' },
      el('span', { class: 'panel-icono naranja' }, icono('calendario')),
      el('div', {}, el('h2', { id: 'plan-panel-titulo', texto: t('acad.plan.tu_plan', { plan: textoPlan(plan.elegido, 'nombre') }) }),
        el('p', { class: 'suave', texto: t('acad.plan.desde', { fecha: diaRd(`${plan.desde}T12:00:00Z`) }) }))),
    el('div', { class: 'plan-fechas' },
      el('div', { class: 'plan-fecha-caja' }, el('span', { class: 'suave', texto: t('acad.plan.fin_estimado') }), el('strong', { texto: diaRd(`${plan.fin}T12:00:00Z`) })),
      el('div', { class: 'plan-fecha-caja' }, el('span', { class: 'suave', texto: t('acad.plan.meta_hoy') }), el('strong', { texto: tn('acad.plan.pasos', { n: plan.metaHoy }) }))),
    el('div', { class: 'plan-barra' }, barraLlena(plan.pct)),
    el('p', { class: 'suave chica', texto: t('acad.plan.hechos', { n: numero(plan.hechos), total: numero(plan.total) }) }),
    insignia(tono, tSi(TEXTO_RITMO[plan.ritmo] ?? '', plan.ritmo)),
    el('p', { class: 'suave chica', texto: t('acad.plan.se_adapta') }),
    el('button', { type: 'button', class: 'boton-texto con-icono', onclick: () => caja.replaceChildren(elegirPlanVista(plan, { alListo: nuevo => alCambiar(nuevo), cancelar: dibujarPanel })) },
      icono('lapiz', 'icono chico'), el('span', { texto: t('acad.plan.cambiar') })));
  dibujarPanel();
  return caja;
}

async function pantallaProgreso() {
  const vigente = nuevoTurno();
  const r = await api('GET', '/api/academia/progreso');
  if (!vigente()) return;
  if (!r.ok) return mostrar(marco('progreso', el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  const p = r.datos;
  estudioHoy = p.hoy ?? estudioHoy;
  const materias = p.materias.length
    ? el('div', { class: 'rejilla dos' }, p.materias.map(m => tarjetaMateria(m)))
    : el('section', { class: 'panel' }, vacio('grafica', t('acad.progreso.vacio')));
  let grupo = null;
  const alCambiarGrupo = g => { const nuevo = panelGrupo(g, { alCambiar: alCambiarGrupo }); if (nuevo && grupo) grupo.replaceWith(nuevo); grupo = nuevo; };
  grupo = panelGrupo(p.grupo, { alCambiar: alCambiarGrupo });
  mostrar(marco('progreso', barraCabina(p),
    el('h1', { class: 'titulo-grande', texto: t('acad.progreso') }),
    el('p', { class: 'bajada', texto: t('acad.progreso.linea') }),
    el('section', { class: 'panel panel-preparacion' },
      medidor(p.preparacion?.pct ?? 0),
      el('div', {},
        el('h2', { texto: t('acad.preparacion.titulo') }),
        el('p', { class: 'suave', texto: t('acad.preparacion.linea', { n: numero(p.preparacion?.bien ?? 0), total: numero(p.preparacion?.total ?? 0) }) }),
        el('p', { class: 'suave chica', texto: t('acad.preparacion.estimacion') }),
        botonRepaso(p.repaso))),
    panelPlan(p.plan, { alCambiar: () => pantallaProgreso() }),
    grupo,
    p.grupo && !p.grupo.activo ? el('p', { class: 'suave chica', texto: t('acad.grupo.apagado') }) : null,
    panelPuntosDebiles(p.puntosDebiles, { conBoton: true }),
    materias,
    listaDebiles(p.debiles, t('acad.debiles'), 'acad.debiles.vacio')));
}
// 0.8.0: «Mis puntos débiles» (la memoria de errores: para siempre). Las ideas equivocadas que más elige, los temas donde
// más falla y las preguntas que más falla; con «Practicar mis errores». El administrador ve lo mismo de cada alumno.
function panelPuntosDebiles(pd, { conBoton = false, titulo = t('debil.panel') } = {}) {
  if (!pd) return null;
  const cabeza = el('div', { class: 'panel-cabeza' },
    el('span', { class: 'panel-icono naranja' }, icono('atencion')),
    el('div', {}, el('h2', { id: 'debiles-titulo', texto: titulo }),
      el('p', { class: 'suave', texto: pd.total ? t('debil.memoria', { n: numero(pd.total), mal: numero(pd.fallos) }) : t('debil.vacio') })));
  if (!pd.preguntas.length) return el('section', { class: 'panel panel-debiles', 'aria-labelledby': 'debiles-titulo' }, cabeza, pd.total ? vacio('bien', t('debil.nada')) : null);
  const ideas = pd.ideas.filter(x => !x.superada).slice(0, 3);
  const temas = pd.temas.slice(0, 4);
  return el('section', { class: 'panel panel-debiles', 'aria-labelledby': 'debiles-titulo' },
    cabeza,
    ideas.length ? el('div', { class: 'debiles-ideas' },
      el('h3', { texto: t('debil.ideas') }),
      el('ul', {}, ideas.map(x => el('li', { class: 'debil-idea' },
        talCual('p', x.idea),
        el('p', { class: 'suave chica', texto: [x.numero ? t('acad.pregunta_n', { n: x.numero }) : null, nombreMateria(x.materia), x.modo === 'reto' ? t('reto.sello') : null, tn('debil.fallos', { n: x.fallos })].filter(Boolean).join(' · ') }))))) : null,
    temas.length ? el('div', { class: 'debiles-temas' },
      el('h3', { texto: t('debil.temas') }),
      el('ul', {}, temas.map(x => el('li', {},
        el('span', { class: 'debil-tema-nombre', texto: partirTitulo(x.titulo).es }),
        el('span', { class: 'plan-barra chica' }, barraLlena(x.pct)),
        el('span', { class: 'suave chica', texto: t('debil.tema_fallos', { mal: numero(x.fallos), n: numero(x.respuestas) }) }))))) : null,
    el('div', { class: 'debiles-preguntas' },
      el('h3', { texto: t('debil.preguntas') }),
      verMas(el('ul', { class: 'lista-debiles' }), pd.preguntas.map(q => el('li', { class: q.superada ? 'superada' : null },
        el('span', { class: 'q-numero' }, q.numero ? talCual('span', t('acad.pregunta_n', { n: q.numero })) : t('acad.origen.poh_corto')),
        q.superada ? insignia('bien', t('debil.superada')) : el('span', { class: 'insignia tono-apagado', texto: nombreMateria(q.materia) }),
        talCual('span', q.enunciado, 'debil-enunciado'),
        el('span', { class: 'suave', texto: tn('acad.fallos_de', { n: q.fallos, veces: q.veces }) }))), 4)),
    conBoton ? el('button', { type: 'button', class: 'boton-3d naranja con-icono', onclick: evento => { sonar('toque'); empezarIntento({ tipo: 'errores' }, evento.currentTarget); } },
      icono('actualizar', 'icono chico'), el('span', { texto: t('debil.practicar_todo') })) : null);
}
function tarjetaMateria(m, { conExamen = true } = {}) {
  return el('section', { class: `panel materia-progreso ${claseMateria(m.id)}` },
    el('div', { class: 'materia-cabeza' },
      el('span', { class: 'banner-icono chico', 'aria-hidden': 'true' }, icono(ICONO_MATERIA[m.id] ?? 'avion')),
      el('h2', { texto: nombreMateria(m.id) }), el('span', { class: 'materia-pct', texto: pctTexto(m.pct) })),
    el('div', { class: 'plan-barra' }, barraLlena(m.pct)),
    el('div', { class: 'etiquetas' },
      insignia('bien', t('acad.bien', { n: numero(m.bien) })),
      insignia('mal', t('acad.mal', { n: numero(m.mal) })),
      insignia('apagado', t('acad.sin_ver', { n: numero(m.sinVer) }))),
    conExamen && m.examen?.mejor != null ? el('p', { class: 'suave con-icono-chico' }, icono('trofeo', 'icono chico'), el('span', { texto: t('acad.examen_mejor', { n: numero(m.examen.mejor) }) })) : null);
}
function listaDebiles(lista, tituloTexto, claveVacio, { conFallos = false } = {}) {
  return el('section', { class: 'panel debiles' },
    el('h2', { class: 'con-icono' }, icono('atencion'), el('span', { texto: tituloTexto }), queEs('repaso')),
    lista.length ? verMas(el('ul', { class: 'lista-debiles' }), lista.map(q => el('li', {},
      el('span', { class: 'q-numero' }, q.numero ? talCual('span', t('acad.pregunta_n', { n: q.numero })) : t('acad.origen.poh_corto')),
      el('span', { class: 'insignia tono-apagado', texto: nombreMateria(q.materia) }),
      talCual('span', q.enunciado, 'debil-enunciado'),
      el('span', { class: 'suave', texto: conFallos ? tn('acad.fallos_de', { n: q.fallos, veces: q.veces }) : tn('acad.fallos', { n: q.fallos }) }))), 5)
      : vacio('bien', t(claveVacio)));
}

// ---- Administrador: alumnos (0.9.0: public/admin-alumnos.js, que solo se carga aquí) ----
// La lista (con «Comparar»), la ficha de cada alumno por pestañas (#alumno/N, #alumno/N/examenes…), cada intento pregunta
// por pregunta (#alumno/N/intento/M) y la comparación lado a lado (#comparar/2,5).
const piezasAlumnos = () => ({
  el, t, tn, icono, insignia, numero, pctTexto, fecha, hace, cuando, fechaCortaDia, nombreMateria, claseMateria, talCual, tarjetaPregunta,
  panelPuntosDebiles, pestanas, vacio, verMas, barraLlena, partirTitulo, dibujarAvatar, medidor, ICONO_MATERIA,
  // 0.9.2: la cuenta del alumno desde su ficha (bloquear, nombre, contraseña) y los tiempos del examen.
  api, avisar, caja, botonAccion, textoError, yoId: estado.usuario?.id, recargar: () => dibujar(),
});
// Lo común: la cabecera de Administrador y, si el pedido falló, el error con «Todos los alumnos».
function dibujarDeAlumnos(r, s, dibujarCon) {
  const cabecera = cabeceraAdmin('alumnos', tonosDePestanas(s.ok ? s.datos : null));
  if (!r.ok) {
    return mostrar(marco('admin', cabecera,
      el('a', { class: 'volver con-icono', href: '#alumnos' }, icono('flecha', 'icono chico volver-icono'), el('span', { texto: t('acad.alumnos.volver') })),
      el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  }
  mostrar(marco('admin', cabecera, dibujarCon(r.datos, piezasAlumnos())));
}
async function pantallaAlumnos() {
  const vigente = nuevoTurno();
  const [r, s, vista] = await Promise.all([api('GET', '/api/admin/academia/alumnos'), api('GET', '/api/admin/sistema'), import('./admin-alumnos.js')]);
  if (vigente()) dibujarDeAlumnos(r, s, (d, h) => vista.vistaListaAlumnos(d, h));
}
async function pantallaAlumno(id, pestana = 'resumen') {
  const vigente = nuevoTurno();
  const [r, s, vista] = await Promise.all([api('GET', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/ficha`), api('GET', '/api/admin/sistema'), import('./admin-alumnos.js')]);
  if (vigente()) dibujarDeAlumnos(r, s, (d, h) => vista.vistaFicha(d, pestana, h));
}
async function pantallaIntentoAlumno(id, intento) {
  const vigente = nuevoTurno();
  const [r, s, vista] = await Promise.all([api('GET', `/api/admin/academia/alumnos/${encodeURIComponent(id)}/intentos/${encodeURIComponent(intento)}`), api('GET', '/api/admin/sistema'), import('./admin-alumnos.js')]);
  if (vigente()) dibujarDeAlumnos(r, s, (d, h) => vista.vistaIntento(d, h));
}
async function pantallaComparar(ids) {
  const vigente = nuevoTurno();
  const [r, s, vista] = await Promise.all([api('GET', `/api/admin/academia/comparar/${ids}`), api('GET', '/api/admin/sistema'), import('./admin-alumnos.js')]);
  if (vigente()) dibujarDeAlumnos(r, s, (d, h) => vista.vistaComparar(d, h));
}

// ---- 0.8.0: Administrador → Respuestas: la clave completa (se dibuja en public/admin-respuestas.js, que solo se carga aquí) ----
async function pantallaRespuestas() {
  const vigente = nuevoTurno();
  const [r, s, vista] = await Promise.all([api('GET', '/api/admin/academia/respuestas'), api('GET', '/api/admin/sistema'), import('./admin-respuestas.js')]);
  if (!vigente()) return;
  const cabecera = cabeceraAdmin('respuestas', tonosDePestanas(s.ok ? s.datos : null));
  if (!r.ok) return mostrar(marco('admin', cabecera, el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  mostrar(marco('admin', cabecera, vista.vistaRespuestas(r.datos, { el, t, tn, icono, talCual, numero, nombreMateria, partirTitulo, insignia, vacio, figuraPregunta, claseMateria })));
}

// ---- Administrador: el contenido (subir un paquete, ponerlo en uso, el nombre de la app y el % para aprobar) ----
async function pantallaContenido() {
  const vigente = nuevoTurno();
  const [r, s] = await Promise.all([api('GET', '/api/admin/academia'), api('GET', '/api/admin/sistema')]);
  if (!vigente()) return;
  const cabecera = cabeceraAdmin('contenido', tonosDePestanas(s.ok ? s.datos : null));
  if (!r.ok) return mostrar(marco('admin', cabecera, el('section', { class: 'tarjeta' }, el('p', { class: 'mensaje error', texto: textoError(r.datos.error) }))));
  const { ajustes, paquetes, limites } = r.datos;
  // Ajustes.
  const mensajeAjustes = caja();
  const campoNombre = el('input', { id: 'campo-nombre-app', type: 'text', maxlength: 60, value: ajustes.nombre, autocomplete: 'off' });
  const campoUmbral = el('input', { id: 'campo-umbral', type: 'number', min: 50, max: 100, step: 1, value: ajustes.umbral, inputmode: 'numeric' });
  // 0.9.2: el reloj del examen de materia (segundos por pregunta).
  const campoSegundos = el('input', { id: 'campo-examen-segundos', type: 'number', min: 20, max: 600, step: 5, value: ajustes.examenSegundos ?? 90, inputmode: 'numeric' });
  const tarjetaAjustes = el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, icono('ajustes'), el('span', { texto: t('acad.ajustes') })),
    el('label', { for: 'campo-nombre-app', texto: t('acad.ajustes.nombre') }), campoNombre,
    el('label', { for: 'campo-umbral', texto: t('acad.ajustes.umbral') }), campoUmbral,
    el('label', { for: 'campo-examen-segundos', texto: t('acad.ajustes.examen_segundos') }), campoSegundos,
    el('p', { class: 'ayuda', texto: t('acad.ajustes.examen_segundos.ayuda') }),
    el('div', { class: 'botones' }, botonAccion(t('acad.ajustes.guardar'), '', mensajeAjustes, async () => {
      const x = await api('POST', '/api/admin/academia/ajustes', { nombre: campoNombre.value, umbral: Number(campoUmbral.value), examenSegundos: Number(campoSegundos.value) });
      if (!x.ok) throw new Error(textoError(x.datos.error));
      if (estado.setup) estado.setup.nombreApp = x.datos.ajustes.nombre;
      ponerTitulo();
      avisar(t('acad.ajustes.listo'));
      await pantallaContenido();
    }, 'marca')),
    mensajeAjustes,
    // 0.7.2: el panel «Grupo» que ven los alumnos (se puede apagar).
    el('div', { class: 'ajuste-grupo' },
      el('p', { class: 'etiqueta-campo', texto: t('acad.grupo.admin') }),
      grupoDeBotones([['si', t('acad.grupo.admin.encendido')], ['no', t('acad.grupo.admin.apagado')]], r.datos.grupo !== false ? 'si' : 'no', async (valor, marcar) => {
        const x = await api('POST', '/api/admin/academia/grupo', { encendido: valor === 'si' });
        if (!x.ok) return avisar(textoError(x.datos.error), 'mal');
        marcar();
        avisar(t(x.datos.grupo ? 'acad.grupo.admin.encendido' : 'acad.grupo.admin.apagado'));
      }),
      el('p', { class: 'suave chica', texto: t('acad.grupo.admin.linea') })));
  // Subir.
  const mensajeSubir = caja();
  const progresoSubida = el('p', { class: 'suave', role: 'status' });
  const archivos = el('input', { id: 'campo-paquete', type: 'file', multiple: true, accept: '.json,application/json,image/png,image/jpeg,image/webp,.mp3,audio/mpeg' });
  archivos.addEventListener('change', () => { progresoSubida.textContent = tn('acad.subir.elegidos', { n: archivos.files.length }); });
  const tarjetaSubir = el('section', { class: 'tarjeta subir-paquete' },
    el('h2', { class: 'con-icono' }, icono('subir'), el('span', { texto: t('acad.subir_paquete') }), queEs('paquete')),
    el('p', { class: 'ayuda', texto: t('acad.subir.ayuda', { mb: numero(Math.round(limites.jsonBytes / 1048576)), mbf: numero(Math.round(limites.figuraBytes / 1048576)) }) }),
    el('label', { for: 'campo-paquete', class: 'boton-enlace secundario con-icono elegir-archivos' }, icono('carpeta'), el('span', { texto: t('acad.subir.elegir') })),
    archivos,
    progresoSubida,
    el('div', { class: 'botones' }, botonAccion(t('acad.subir.boton'), '', mensajeSubir, async () => {
      const lista = [...archivos.files];
      const jsons = lista.filter(f => /\.json$/i.test(f.name));
      if (jsons.length !== 1) throw new Error(t('acad.subir.un_json'));
      progresoSubida.textContent = t('acad.subir.json');
      const j = await subirArchivo('/api/admin/academia/paquetes', jsons[0], 'application/json');
      if (!j.ok) {
        const lineas = (j.datos.errores ?? []).slice(0, 8).map(e => `${e.ruta || '—'}: ${tSi(`acad.motivo.${e.motivo}`, e.motivo)}`);
        progresoSubida.textContent = '';
        throw new Error([textoError(j.datos.error), ...lineas].join('\n'));
      }
      const faltan = j.datos.faltan ?? [];
      const porNombre = new Map(lista.map(f => [f.name, f]));
      let hechas = 0;
      const sinArchivo = [];
      for (const nombre of faltan) {
        const f = porNombre.get(nombre);
        if (!f) { sinArchivo.push(nombre); continue; }
        progresoSubida.textContent = t('acad.subir.figuras', { n: numero(hechas + 1), total: numero(faltan.length) });
        const x = await subirArchivo(`/api/admin/academia/paquetes/${j.datos.paquete.id}/figuras/${encodeURIComponent(nombre)}`, f, f.type || 'application/octet-stream');
        if (!x.ok) throw new Error(`${nombre}: ${textoError(x.datos.error)}`);
        hechas += 1;
      }
      // 0.7.1: la narración (mp3), si el paquete la nombra y se eligió.
      for (const nombre of j.datos.faltanAudio ?? []) {
        const f = porNombre.get(nombre);
        if (!f) continue;
        progresoSubida.textContent = t('acad.subir.audio', { nombre });
        const x = await subirArchivo(`/api/admin/academia/paquetes/${j.datos.paquete.id}/audio/${encodeURIComponent(nombre)}`, f, 'audio/mpeg');
        if (!x.ok) throw new Error(`${nombre}: ${textoError(x.datos.error)}`);
      }
      progresoSubida.textContent = '';
      avisar(sinArchivo.length ? tn('acad.subir.faltan', { n: sinArchivo.length }) : t('acad.subir.listo'), sinArchivo.length ? 'info' : 'bien');
      await pantallaContenido();
    }, 'subir')),
    mensajeSubir);
  // Versiones.
  const filaPaquete = p => {
    const mensaje = caja();
    return el('div', { class: 'fila paquete' },
      el('div', {},
        el('span', { class: 'nombre', texto: p.nombre }),
        p.activo ? insignia('bien', t('acad.paquete.en_uso')) : insignia(p.estado === 'listo' ? 'info' : 'atencion', tSi(`acad.paquete.estado.${p.estado}`, p.estado)),
        p.muestra ? el('span', { class: 'etiqueta', texto: t('acad.paquete.muestra') }) : null),
      p.enUso?.length ? el('p', { class: 'suave', texto: t('acad.paquete.da', { materias: p.enUso.map(nombreMateria).join(', ') }) }) : null,
      el('p', { class: 'suave', texto: t('acad.paquete.cuenta', { version: p.id, edicion: p.edicion || '—', temas: numero(p.temas), preguntas: numero(p.preguntas), figuras: numero(p.figuras) }) }),
      el('p', { class: 'suave', texto: t('acad.paquete.subido', { fecha: fecha(p.subidoEn) }) }),
      p.faltan?.length ? el('p', { class: 'aviso', texto: tn('acad.subir.faltan', { n: p.faltan.length }) }) : null,
      p.faltanAudio?.length ? el('p', { class: 'suave', texto: tn('acad.subir.faltan_audio', { n: p.faltanAudio.length }) }) : null,
      p.estado === 'listo' && !p.activo ? el('div', { class: 'botones' }, botonAccion(t('acad.paquete.usar'), 'secundario', mensaje, async () => {
        const x = await api('POST', `/api/admin/academia/paquetes/${p.id}/activar`, {});
        if (!x.ok) throw new Error(textoError(x.datos.error));
        avisar(t('acad.paquete.listo_uso'));
        await pantallaContenido();
      }, 'play')) : null,
      mensaje);
  };
  const tarjetaVersiones = el('section', { class: 'tarjeta' },
    el('h2', { class: 'con-icono' }, icono('libro'), el('span', { texto: t('acad.versiones') })),
    paquetes.length ? verMas(el('div', { class: 'lista-usuarios' }), paquetes.map(filaPaquete), 4) : vacio('libro', t('acad.versiones.vacio')));
  mostrar(marco('admin', cabecera, el('div', { class: 'rejilla dos' }, tarjetaDrive(r.datos.drive), tarjetaSubir, tarjetaVersiones, tarjetaAjustes)));
}

// ---- 0.7.1: la carpeta de Google Drive (el contenido llega solo, cada hora) ----
// Lo que dice una revisión en una línea: «Factores humanos actualizada», «Sin cambios», «2 problemas».
function resumenRevision(r) {
  if (!r.ok) return tSi(`acad.drive.motivo.${r.motivo}`, t('acad.drive.motivo.no_responde'));
  const partes = [];
  const materias = [...new Set(r.activados.flatMap(a => a.materias ?? []))];
  if (materias.length) partes.push(tn('acad.drive.actualizadas', { n: materias.length, materias: materias.map(nombreMateria).join(', ') }));
  else if (r.nuevos.length) partes.push(tn('acad.drive.nuevos', { n: r.nuevos.length }));
  if (r.completados && !materias.length) partes.push(tn('acad.drive.completados', { n: r.completados }));
  if (r.rechazados.length) partes.push(tn('acad.drive.rechazados', { n: r.rechazados.length }));
  if (r.errores.length) partes.push(tn('acad.drive.errores', { n: r.errores.length }));
  if (r.parcial) partes.push(t('acad.drive.parcial'));
  if (!partes.length) partes.push(r.paquetes ? t('acad.drive.sin_cambios') : t('acad.drive.sin_paquetes'));
  return partes.join(' · ');
}
const tonoRevision = r => (!r.ok ? 'mal' : r.rechazados.length || r.errores.length ? 'atencion' : 'bien');
function detalleRevision(r) {
  const lineas = [];
  if (r.ok) lineas.push(t('acad.drive.encontrado', { carpetas: numero(r.carpetas), archivos: numero(r.archivos), paquetes: numero(r.paquetes) }));
  for (const n of r.nuevos) lineas.push(t('acad.drive.nuevo', { archivo: n.archivo, version: n.version }));
  for (const x of r.rechazados) {
    lineas.push(t('acad.drive.rechazado', { archivo: x.archivo }));
    for (const e of x.errores ?? []) lineas.push(`  ${e.ruta || '—'}: ${tSi(`acad.motivo.${e.motivo}`, e.motivo)}`);
  }
  for (const e of r.errores) lineas.push(`${e.archivo}: ${tSi(`acad.drive.motivo.${e.motivo}`, tSi(`error.${e.motivo}`, e.motivo))}`);
  return lineas;
}
function tarjetaDrive(d) {
  const mensaje = caja();
  const prueba = el('div', { class: 'drive-prueba', role: 'status' });
  const campo = el('input', { id: 'campo-drive', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://drive.google.com/drive/folders/…', value: d?.carpeta?.enlace ?? '' });
  const u = d?.ultima;
  const estadoLinea = d?.carpeta
    ? el('div', { class: `drive-estado tono-${u ? tonoRevision(u) : 'apagado'}` },
      icono(u ? tonoRevision(u) : 'reloj'),
      el('div', {},
        el('p', { class: 'drive-ultima', texto: u ? t('acad.drive.ultima', { cuando: cuando(u.en) }) : t('acad.drive.nunca') }),
        u ? el('p', { class: 'drive-resumen', texto: resumenRevision(u) }) : null,
        d.enMarcha ? el('p', { class: 'suave', texto: t('acad.drive.en_marcha') }) : null))
    : el('p', { class: 'ayuda', texto: t('acad.drive.ayuda') });
  const historial = d?.revisiones?.length
    ? el('details', { class: 'plegable drive-historial' },
      el('summary', { texto: t('acad.drive.historial') }),
      el('ul', { class: 'lista-drive' }, d.revisiones.map(r => el('li', {},
        el('div', { class: 'drive-fila' }, insignia(tonoRevision(r), cuando(r.en)), el('span', { texto: resumenRevision(r) })),
        detalleRevision(r).map(linea => el('p', { class: 'suave drive-linea', texto: linea }))))))
    : null;
  return el('section', { class: 'tarjeta drive' },
    el('h2', { class: 'con-icono' }, icono('carpeta'), el('span', { texto: t('acad.drive.titulo') })),
    estadoLinea,
    el('label', { for: 'campo-drive', texto: t('acad.drive.enlace') }), campo,
    prueba,
    el('div', { class: 'botones' },
      botonAccion(t('acad.drive.probar'), 'secundario', mensaje, async () => {
        prueba.replaceChildren(el('p', { class: 'suave', texto: t('acad.drive.probando') }));
        const x = await api('POST', '/api/admin/academia/drive/probar', { enlace: campo.value });
        if (!x.ok) { prueba.replaceChildren(); throw new Error(textoError(x.datos.error)); }
        if (!x.datos.ok) {
          prueba.replaceChildren(el('p', { class: 'mensaje error', texto: tSi(`acad.drive.motivo.${x.datos.motivo}`, t('acad.drive.motivo.no_responde')) }));
          return;
        }
        prueba.replaceChildren(
          el('p', { class: 'mensaje bien', texto: t('acad.drive.probar_bien', { carpetas: numero(x.datos.carpetas), archivos: numero(x.datos.archivos), paquetes: numero(x.datos.paquetes.length) }) }),
          x.datos.paquetes.length ? el('ul', { class: 'lista-drive' }, x.datos.paquetes.map(n => el('li', { class: 'suave', texto: n }))) : null);
      }, 'buscar'),
      botonAccion(t('acad.drive.guardar'), '', mensaje, async () => {
        const x = await api('POST', '/api/admin/academia/drive', { enlace: campo.value });
        if (!x.ok) throw new Error(textoError(x.datos.error));
        avisar(x.datos.drive.carpeta ? t('acad.drive.guardado') : t('acad.drive.quitado'));
        await pantallaContenido();
      }, 'marca'),
      d?.carpeta ? botonAccion(t('acad.drive.buscar'), 'secundario', mensaje, async () => {
        const x = await api('POST', '/api/admin/academia/drive/buscar', {});
        if (!x.ok) throw new Error(textoError(x.datos.error));
        avisar(t('acad.drive.buscando'), 'info');
        await pantallaContenido();
      }, 'actualizar') : null),
    mensaje,
    historial);
}
// Un archivo tal cual en el cuerpo del pedido (el navegador lo manda por partes; nunca se lee entero aquí).
async function subirArchivo(ruta, archivo, tipo) {
  try {
    const r = await fetch(ruta, { method: 'POST', credentials: 'same-origin', headers: { 'X-Oportia': '1', 'Content-Type': tipo }, body: archivo });
    const cuerpo = await r.json().catch(() => ({}));
    return { ok: r.ok, codigo: r.status, datos: cuerpo };
  } catch {
    return { ok: false, codigo: 0, datos: { error: 'sin_conexion' } };
  }
}
// El nombre de la app (lo elige el administrador) en la pestaña del navegador.
function ponerTitulo() {
  document.title = nombreApp();
}
function nombreApp() {
  return estado.setup?.nombreApp || t('app.nombre');
}

// ---------- Arranque ----------
async function dibujar() {
  turno++;
  // Una explicación abierta («¿Qué es esto?») no sigue a la persona a otra pantalla.
  cerrarAyuda();
  if (!estado.usuario) {
    if (estado.setup?.necesitaAdmin) return estado.setup.puedeCrearAdmin ? pantallaCrearAdmin() : pantallaAbreTailscale();
    return pantallaEntrar();
  }
  if (estado.usuario.debeCambiarClave) return pantallaClaveObligatoria();
  ponerUsuarioSonidos(estado.usuario.id);
  const seccion = location.hash.replace('#', '') || 'inicio';
  const esAdmin = estado.usuario.rol === 'admin';
  // Las pestañas de Administrador (#admin, #admin/usuarios, #admin/trabajo, #admin/servidor, #copias, #ia, #claves).
  const pestanaAdmin = seccion.match(/^admin(?:\/([a-z]*))?$/);
  // 0.8.0: ir a una pantalla de Administrador termina el Modo estudiante.
  if (esAdmin && (pestanaAdmin || ['copias', 'ia', 'claves', 'alumnos', 'contenido', 'respuestas'].includes(seccion) || /^(?:alumno|comparar)\//.test(seccion))) ponerModoEstudiante(false);
  // La contraseña temporal recién creada se deja de mostrar al salir de Administrador (no al cambiar de pestaña).
  if (!esAdmin || !(pestanaAdmin || ['copias', 'ia', 'claves'].includes(seccion))) claveTemporalVisible = null;
  // La clave de recuperación recién creada vive solo en esta pantalla: al irse de Copias se suelta (fase 1, parte e).
  if (seccion !== 'copias') claveNueva = null;
  if (seccion !== 'claves') vinculoEnPantalla = null;
  if (seccion === 'configuracion') return pantallaConfiguracion();
  if (seccion === 'ayuda') return pantallaAyuda();
  if (pestanaAdmin && esAdmin) return pantallaAdmin(PESTANAS_ADMIN.includes(pestanaAdmin[1]) ? pestanaAdmin[1] : 'resumen');
  if (seccion === 'copias' && esAdmin) return pantallaCopias();
  if (seccion === 'ia' && esAdmin) return pantallaIa();
  if (seccion === 'claves' && esAdmin) return pantallaClaves();
  // Academia (0.7.0): el camino (Inicio), un tema, practicar, el examen de una materia y el progreso; lo del administrador.
  if (seccion === 'progreso') return pantallaProgreso();
  const tema = seccion.match(/^tema\/([a-z0-9_-]+)\/([a-z0-9_-]+)$/);
  if (tema) return pantallaTema(tema[1], tema[2]);
  const practica = seccion.match(/^practica\/(\d+)$/);
  if (practica) return pantallaPractica(practica[1]);
  const examen = seccion.match(/^examen\/([a-z0-9_-]+)$/);
  if (examen) return pantallaExamen(examen[1]);
  // 0.7.2: el «Video resumen» de una materia.
  const video = seccion.match(/^video\/([a-z0-9_-]+)$/);
  if (video) return pantallaVideo(video[1]);
  if (seccion === 'alumnos' && esAdmin) return pantallaAlumnos();
  const alumno = seccion.match(/^alumno\/(\d+)(?:\/(examenes|materias|debiles|actividad))?$/);
  if (alumno && esAdmin) return pantallaAlumno(alumno[1], alumno[2] ?? 'resumen');
  const intentoAlumno = seccion.match(/^alumno\/(\d+)\/intento\/(\d+)$/);
  if (intentoAlumno && esAdmin) return pantallaIntentoAlumno(intentoAlumno[1], intentoAlumno[2]);
  const comparar = seccion.match(/^comparar\/(\d+(?:,\d+){1,9})$/);
  if (comparar && esAdmin) return pantallaComparar(comparar[1]);
  if (seccion === 'contenido' && esAdmin) return pantallaContenido();
  if (seccion === 'respuestas' && esAdmin) return pantallaRespuestas();
  // 0.8.0: los proyectos de OPORTIA ya no existen; sus direcciones viejas (#proyectos, #proyecto/4…) llevan al camino.
  return pantallaInicio();
}

// Lo que la primera pantalla va a pedir (los mismos caminos que dibujar), para pedirlo al abrir junto con la cuenta
// y no después: por la red del teléfono eso es un viaje de ida y vuelta menos (150-400 ms). Si una pantalla pide
// algo más al empezar, va aquí también (test/archivos.test.js lo revisa).
function pedidosAlAbrir(seccion, admin) {
  if (seccion === 'configuracion') return ['/api/yo/reinicios', '/api/yo/perfil'];
  // La Ayuda no pide nada: sus textos llegan con el idioma.
  if (seccion === 'ayuda') return [];
  // Quien no es administrador ve Inicio en #admin, pero casi nunca llega ahí: no se adelanta nada.
  // Las pestañas de Administrador (#admin/usuarios, #admin/trabajo, #admin/servidor) piden lo mismo que #admin.
  if (/^admin(\/[a-z]*)?$/.test(seccion)) return admin ? ['/api/admin/usuarios', '/api/admin/sistema', '/api/admin/ia', '/api/admin/academia'] : [];
  // Copias de seguridad (parte 1e), Inteligencia artificial y Claves (parte 1d): solo el administrador las ve.
  if (seccion === 'copias') return admin ? ['/api/admin/copias'] : [];
  if (seccion === 'ia') return admin ? ['/api/admin/ia'] : [];
  if (seccion === 'claves') return admin ? ['/api/admin/claves'] : [];
  // Academia (0.7.0).
  if (seccion === 'progreso') return ['/api/academia/progreso'];
  const tema = seccion.match(/^tema\/([a-z0-9_-]+)\/([a-z0-9_-]+)$/);
  if (tema) return [`/api/academia/temas/${encodeURIComponent(tema[1])}/${encodeURIComponent(tema[2])}`];
  const practica = seccion.match(/^practica\/(\d+)$/);
  if (practica) return [`/api/academia/intentos/${encodeURIComponent(practica[1])}`];
  if (/^examen\/[a-z0-9_-]+$/.test(seccion)) return ['/api/academia/camino'];
  const video = seccion.match(/^video\/([a-z0-9_-]+)$/);
  if (video) return [`/api/academia/video/${encodeURIComponent(video[1])}`];
  if (seccion === 'alumnos') return admin ? ['/api/admin/academia/alumnos', '/api/admin/sistema'] : [];
  const alumno = seccion.match(/^alumno\/(\d+)(?:\/(?:examenes|materias|debiles|actividad))?$/);
  if (alumno) return admin ? [`/api/admin/academia/alumnos/${encodeURIComponent(alumno[1])}/ficha`, '/api/admin/sistema'] : [];
  const intentoAlumno = seccion.match(/^alumno\/(\d+)\/intento\/(\d+)$/);
  if (intentoAlumno) return admin ? [`/api/admin/academia/alumnos/${encodeURIComponent(intentoAlumno[1])}/intentos/${encodeURIComponent(intentoAlumno[2])}`, '/api/admin/sistema'] : [];
  const comparar = seccion.match(/^comparar\/(\d+(?:,\d+){1,9})$/);
  if (comparar) return admin ? [`/api/admin/academia/comparar/${comparar[1]}`, '/api/admin/sistema'] : [];
  if (seccion === 'contenido') return admin ? ['/api/admin/academia', '/api/admin/sistema'] : [];
  if (seccion === 'respuestas') return admin ? ['/api/admin/academia/respuestas', '/api/admin/sistema'] : [];
  // Los proyectos están escondidos (#proyectos, #nuevo y #proyecto/N muestran el camino): no se adelanta lo suyo.
  return ['/api/academia/camino'];
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
    el('p', { class: 'mensaje error', texto: detalle || 'No se pudo cargar la academia. / The academy could not load.' }),
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
  ponerTitulo();
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

window.addEventListener('hashchange', () => { repintarEnFondo = false; if (estado.usuario) dibujar(); });
// 0.8.0: el audio de los sonidos se despierta con el primer toque (el iPhone no deja sonar si se crea después de esperar).
prepararSonidos();
iniciar().catch(() => pantallaNoArranco());
