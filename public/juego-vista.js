// 0.14.98: el «Juego» (en el menú): Vuelo libre en 3D, con la cabina por dentro (los instrumentos vivos), la vista de
// afuera, el mini-mapa, el despegue y el aterrizaje (con su juez). Se carga solo aquí (import() desde app.js).
// Reusa el motor de las escenas 3D (clase/motor3d.js y motor3d-gl.js), el modelo de vuelo (clase/vuelo-modelo.js), la
// cabina (clase/cabina.js) y el mundo (clase/juego-mundo.js). Sin IA y sin pedir nada al servidor.
// Mandos: en la PC, el teclado; en el teléfono, un yugo para arrastrar y la palanca de potencia. «?» los muestra otra vez.
import { crearBucle, prefiereMenosMovimiento } from './clase/comun.js';
import { crearCamara, ojoOrbita, baseAvion, suma, por, render, crearTexturas, mezclarAngulo } from './clase/motor3d.js';
import { crearRenderGL } from './clase/motor3d-gl.js';
import { PALETAS } from './clase/e3d-base.js';
import { dibujarCabina } from './clase/cabina.js';
import { crearAvion, pasoVuelo, juzgarAterrizaje, lecturas, consejo, PISTA, VUELO } from './clase/vuelo-modelo.js';
import { construirMundo, avionPropio, posicionAvion, alturaSuelo } from './clase/juego-mundo.js';
import { montarMinimapa } from './clase/e3d-minimapa.js';
import { cumulo } from './clase/e3d-base.js';
import { nubeTormenta } from './clase/e3d-efectos.js';
import { HECHOS_SITUACIONES } from './clase/e3d-situaciones.js';
import { fallaAceite } from './clase/vuelo-modelo.js';
import {
  JUEGO, poolDePreguntas, elegirPregunta, pedidoRespuesta, adaptarRespuesta, lineaPorque, consecuenciaDe, rafagaTurbulencia, azarSembrado,
  crearAgenda, siguienteEvento, vientoNuevo, vientoCruzado, puntuar, puntajeInicial,
} from './clase/juego-eventos.js';
import { GUIADO, RUTA_GUIADA, INICIO_GUIADO, crearGuiado, responderGuiado, maniobraDe, llego, piloto, pilotoFinal, enFinal, rumboHacia } from './clase/juego-guiado.js';
import { opcionesRevisadas } from './opciones-revision.js';

const RUTA = '#juego';
const CLAVE_AYUDA = 'academia.juego.ayuda-vista';
const NM = 6.076; // unidades por milla náutica
// El mini-mapa del juego: la pista 36 y su eje extendido (3 NM al sur, el final; y hacia el norte, la salida).
export const ZONAS_JUEGO = Object.freeze([{ tipo: 'aeropuerto', c: [PISTA.x, PISTA.z], rumbo: 0, largo: PISTA.largoFt / 1000 }]);
export const MAPA_JUEGO = Object.freeze({ id: 'juego', unidades: { ftH: 1000 }, opciones: [], intro: { vuelo: { ruta: [[0, 0.95, -2 - 3 * NM], [0, 0.3, -8], [0, 0, -2], [0, 0.3, 4], [0, 1, 2 + 2 * NM]] } } });

// Las teclas (en la PC). → qué mando mueve cada una.
export const TECLAS = Object.freeze({
  ArrowUp: ['cabeceo', -1], KeyW: ['cabeceo', -1], ArrowDown: ['cabeceo', 1], KeyS: ['cabeceo', 1],
  ArrowLeft: ['alabeo', -1], KeyA: ['alabeo', -1], ArrowRight: ['alabeo', 1], KeyD: ['alabeo', 1],
  ShiftLeft: ['potencia', 1], ShiftRight: ['potencia', 1], Equal: ['potencia', 1], NumpadAdd: ['potencia', 1],
  ControlLeft: ['potencia', -1], ControlRight: ['potencia', -1], Minus: ['potencia', -1], NumpadSubtract: ['potencia', -1],
});
// Los mandos con las teclas apretadas: el yugo va hacia ±1 (y vuelve al centro al soltar), la potencia sube o baja.
export function mandosDeTeclas(apretadas, antes, dt) {
  const meta = { cabeceo: 0, alabeo: 0 };
  let potencia = 0;
  for (const k of apretadas) { const m = TECLAS[k]; if (!m) continue; if (m[0] === 'potencia') potencia += m[1]; else meta[m[0]] = Math.max(-1, Math.min(1, meta[m[0]] + m[1])); }
  const ir = (a, b) => (Math.abs(b - a) <= dt * 4 ? b : a + Math.sign(b - a) * dt * 4);
  return { cabeceo: ir(antes.cabeceo, meta.cabeceo), alabeo: ir(antes.alabeo, meta.alabeo), potencia: Math.max(0, Math.min(1, antes.potencia + potencia * dt * 0.6)) };
}

// Cómo empieza cada vuelo: 'libre' en la cabecera de la 36 (motor en ralentí) o 'final' a 3 NM, alineado, a 950 ft.
export function inicioDe(modo) {
  if (modo === 'preguntas') return crearAvion({ ...INICIO_GUIADO, enSuelo: false, potencia: 0.65 });
  if (modo === 'final') {
    const a = crearAvion({ x: 0, z: -PISTA.largoFt / 2000 - 3 * NM, ft: 950, kt: 68, potencia: 0.2, enSuelo: false, flaps: 1 });
    return { ...a, gamma: -0.052, cabeceo: -1, rpm: 1700 };
  }
  return crearAvion({ x: 0, z: -PISTA.largoFt / 2000 + 0.15 });
}

// ---------- la pantalla de entrada (#juego) ----------
export function pantallaJuego(h) {
  const { el, t, icono, mostrar, marco } = h;
  const opcion = (href, nombreIcono, titulo, detalle) => el('a', { class: 'juego-opcion', href },
    el('span', { class: 'juego-opcion-icono', 'aria-hidden': 'true' }, icono(nombreIcono)),
    el('span', { class: 'juego-opcion-texto' }, el('strong', { texto: titulo }), el('span', { texto: detalle })));
  mostrar(marco('juego',
    el('section', { class: 'juego-portada' },
      el('h1', { class: 'titulo-grande con-icono' }, icono('mando'), el('span', { texto: t('juego.titulo') })),
      el('p', { class: 'bajada', texto: t('juego.linea') }),
      el('div', { class: 'juego-opciones' },
        opcion(`${RUTA}/libre`, 'avion', t('juego.libre'), t('juego.libre.detalle')),
        opcion(`${RUTA}/preguntas`, 'trofeo', t('juego.preguntas'), t('juego.preguntas.detalle')),
        opcion(`${RUTA}/final`, 'flecha', t('juego.final'), t('juego.final.detalle'))),
      el('p', { class: 'suave chica', texto: t('juego.libre.nota') }),
      el('p', { class: 'suave chica', texto: t('juego.pronto') }))));
}

// ---------- el vuelo ----------
export function montarVuelo(h, { modo = 'libre' } = {}) {
  const { el, t, icono, mostrar } = h;
  const guiado0 = modo === 'preguntas';
  const reducir = prefiereMenosMovimiento();
  const tactil = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  const boton = (clase, texto, alPulsar, extra = {}) => el('button', { type: 'button', class: `juego-boton ${clase}`, onclick: alPulsar, ...extra }, texto);

  // ---- la página ----
  const lienzo = el('canvas', { class: 'juego-lienzo', role: 'img', 'aria-label': t('juego.lienzo') });
  const capa = el('canvas', { class: 'juego-capa', 'aria-hidden': 'true' });
  const chip = el('p', { class: 'juego-chip', role: 'status', 'aria-live': 'polite' });
  const hud = el('p', { class: 'juego-hud', 'aria-hidden': 'true' });
  const bVista = boton('juego-vista', t('juego.vista.afuera'), () => cambiarVista());
  const bAsistente = boton('juego-asistente', t('juego.asistente'), () => { asistente = !asistente; pintarBotones(); }, { 'aria-pressed': 'true' });
  const bFlaps = boton('juego-flaps', t('juego.flaps'), () => { mandos.flaps = mandos.flaps ? 0 : 1; pintarBotones(); }, { 'aria-pressed': 'false' });
  const bPausa = boton('juego-pausa', t('juego.pausa'), () => pausar(!pausado), { 'aria-pressed': 'false' });
  const bAyuda = boton('juego-ayuda-boton', '?', () => abrirAyuda(), { 'aria-label': t('juego.ayuda.abrir') });
  const salir = el('a', { class: 'juego-boton juego-salir', href: RUTA, 'aria-label': t('juego.salir') }, icono('cerrar'));
  const marcador = el('p', { class: 'juego-marcador', 'aria-live': 'polite' });
  const barra = el('div', { class: 'juego-barra' }, el('div', { class: 'juego-barra-izq' }, salir, marcador), el('div', { class: 'juego-barra-botones' }, bVista, bFlaps, bAsistente, bPausa, bAyuda));
  // La oferta («¿la tomas?») y el aviso (la respuesta, la falla, la radio): abajo de la escena, sin tapar la cabina entera.
  const oferta = el('section', { class: 'juego-oferta', hidden: true, role: 'alertdialog', 'aria-labelledby': 'juego-oferta-titulo' });
  const aviso = el('section', { class: 'juego-aviso', hidden: true, role: 'status', 'aria-live': 'polite' });
  const escenario = el('div', { class: 'juego-escenario' }, lienzo, capa, barra, chip, hud, oferta, aviso);

  // El yugo (arrastrar) y la palanca de potencia (en el teléfono; en la PC también se pueden usar con el ratón).
  const perilla = el('span', { class: 'juego-yugo-perilla', 'aria-hidden': 'true' });
  const yugo = el('div', { class: 'juego-yugo', role: 'application', 'aria-label': t('juego.yugo') },
    el('span', { class: 'juego-yugo-rotulo juego-arriba', 'aria-hidden': 'true', texto: t('juego.yugo.empujar') }),
    el('span', { class: 'juego-yugo-rotulo juego-abajo', 'aria-hidden': 'true', texto: t('juego.yugo.tirar') }),
    perilla);
  const manija = el('span', { class: 'juego-potencia-manija', 'aria-hidden': 'true' });
  const relleno = el('span', { class: 'juego-potencia-relleno', 'aria-hidden': 'true' });
  const potencia = el('div', { class: 'juego-potencia', role: 'slider', tabindex: 0, 'aria-label': t('juego.potencia'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-orientation': 'vertical' },
    el('span', { class: 'juego-potencia-pista' }, relleno, manija));
  const textoPotencia = el('span', { class: 'juego-potencia-valor', texto: '0 %' });
  const mandosTactiles = el('div', { class: 'juego-mandos' },
    el('div', { class: 'juego-potencia-caja' }, el('span', { class: 'juego-mando-nombre', texto: t('juego.potencia') }), potencia, textoPotencia),
    el('div', { class: 'juego-mandos-medio' }, boton('juego-flaps2', t('juego.flaps'), () => { mandos.flaps = mandos.flaps ? 0 : 1; pintarBotones(); }, { 'aria-pressed': 'false' }), boton('juego-vista2', t('juego.vista.afuera'), () => cambiarVista())),
    el('div', { class: 'juego-yugo-caja' }, el('span', { class: 'juego-mando-nombre', texto: t('juego.yugo') }), yugo));

  // Cómo se vuela (la primera vez y con «?»).
  const ayuda = el('div', { class: 'juego-capa-dialogo', hidden: true },
    el('section', { class: 'juego-dialogo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-ayuda-titulo' },
      el('h2', { id: 'juego-ayuda-titulo', texto: t('juego.ayuda.titulo') }),
      el('p', { class: 'juego-meta', texto: t(modo === 'final' ? 'juego.ayuda.meta_final' : 'juego.ayuda.meta') }),
      tactil ? el('div', { class: 'juego-ayuda-dibujo', 'aria-hidden': 'true' },
        el('figure', { class: 'juego-mini' }, el('span', { class: 'juego-mini-potencia' }, el('span', { class: 'juego-mini-manija' })), el('figcaption', { texto: t('juego.ayuda.mini_potencia') })),
        el('figure', { class: 'juego-mini' }, el('span', { class: 'juego-mini-yugo' }, el('span', { class: 'juego-mini-perilla' })), el('figcaption', { texto: t('juego.ayuda.mini_yugo') }))) : null,
      el('ul', { class: 'juego-teclas' },
        (tactil ? ['yugo', 'tirar', 'potencia_tactil', 'flaps_tactil', 'vista_tactil'] : ['flechas', 'tirar_teclas', 'potencia_teclas', 'flaps_teclas', 'vista_teclas', 'pausa_teclas'])
          .map(k => { const [tecla, que] = t(`juego.ayuda.${k}`).split(' — '); return el('li', {}, el('kbd', { texto: tecla }), el('span', { texto: que ?? '' })); })),
      el('p', { class: 'juego-nota', texto: t('juego.ayuda.asistente') }),
      el('p', { class: 'juego-nota', texto: t('juego.ayuda.aterrizar') }),
      el('button', { type: 'button', class: 'boton-3d naranja grande juego-a-volar', onclick: () => cerrarAyuda() }, el('span', { texto: t('juego.ayuda.listo') }))));
  // El resultado del aterrizaje (y el resumen del vuelo).
  const errores = el('a', { class: 'boton-enlace secundario juego-mis-errores', href: '#mi-repaso', hidden: true }, el('span', { texto: t('juego.res.errores') }));
  const resTitulo = el('h2', { id: 'juego-res-titulo' });
  const resDatos = el('ul', { class: 'juego-res-datos' });
  const resConsejo = el('p', { class: 'juego-nota' });
  const resultado = el('div', { class: 'juego-capa-dialogo', hidden: true },
    el('section', { class: 'juego-dialogo juego-resultado', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-res-titulo' },
      resTitulo, resDatos, resConsejo, errores,
      el('div', { class: 'juego-res-botones' },
        guiado0 ? el('button', { type: 'button', class: 'boton-3d naranja', onclick: () => reiniciar('preguntas') }, el('span', { texto: t('juego.otra_ruta') })) : null,
        el('button', { type: 'button', class: `boton-3d ${guiado0 ? 'blanco' : 'naranja'}`, onclick: () => reiniciar('final') }, el('span', { texto: t('juego.otra_final') })),
        el('button', { type: 'button', class: 'boton-3d blanco', onclick: () => reiniciar('libre') }, el('span', { texto: t('juego.otra_despegue') })),
        el('button', { type: 'button', class: 'boton-texto juego-seguir', onclick: () => { resultado.hidden = true; pausar(false); } }, el('span', { texto: t('juego.seguir') })))));

  // La pregunta (en el centro; el vuelo se detiene mientras se lee y se elige).
  const pregunta = el('div', { class: 'juego-capa-dialogo', hidden: true });
  const raiz = el('div', { class: 'juego-vuelo', 'data-vista': 'cabina', 'data-tactil': tactil ? '1' : '0', 'data-modo': modo }, escenario, mandosTactiles, ayuda, resultado, pregunta);
  mostrar(raiz);
  document.body.classList.add('juego-activo');

  // ---- el estado ----
  let avion = inicioDe(modo);
  const mandos = { cabeceo: 0, alabeo: 0, potencia: avion.potencia, flaps: avion.flaps };
  const toque = { activo: false, cabeceo: 0, alabeo: 0 };
  const apretadas = new Set();
  let vista = 'cabina', asistente = true, pausado = false, tiempo = 0, volo = modo === 'final' || modo === 'preguntas', ultimoToque = -10, girCam = avion.rumbo;
  let paleta = leerPaleta(), mundo = construirMundo(paleta), ultimoConsejo = '', ultimoHud = '', relojHud = 0;
  // Las preguntas y los eventos (0.14.99).
  const azar = azarSembrado(Date.now() % 100000);
  let pool = [], usadas = new Set(), cargando = null, puntaje = puntajeInicial(), agenda = crearAgenda(azar);
  let ambiente = { viento: { desde: 360, kt: 0 } }, rafagaHasta = -1, rafaga = null, fallaDesde = null, decision = null;
  let extras = [], nubeFalla = null, desvioHasta = -1, abierta = false, ofertaReloj = 0, avisoReloj = 0;
  let guiado = guiado0 ? crearGuiado() : null, objetivo = null, enAproximacion = false, esperando = guiado0, retener = null, tormenta = null, modoActual = modo;
  if (guiado0) asistente = true;

  // ---- dibujo ----
  let gl3 = crearRenderGL(lienzo), ctx2d = null, ctx = null, texturas = {};
  if (gl3) { try { ctx = capa.getContext('2d'); } catch { ctx = null; } }
  else { try { ctx2d = lienzo.getContext('2d'); ctx = capa.getContext('2d'); } catch { ctx2d = null; } }
  try { texturas = crearTexturas((w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; }); } catch { texturas = {}; }
  if (gl3) {
    lienzo.addEventListener('webglcontextlost', e => { e.preventDefault(); gl3 = null; });
    lienzo.addEventListener('webglcontextrestored', () => { gl3 = crearRenderGL(lienzo); });
  }
  let ancho = 640, alto = 400, escalaPx = 1, calidad = 1, lentos = 0, cuadros = 0;
  function medir() {
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, tactil ? 1.6 : 2) * calidad;
    const w = lienzo.clientWidth || 640, hh = lienzo.clientHeight || 400;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(hh * dpr));
    for (const c of [lienzo, capa]) { if (c.width !== W) c.width = W; if (c.height !== H) c.height = H; }
    ancho = W; alto = H; escalaPx = dpr;
  }
  function camara() {
    const pos = posicionAvion(avion);
    if (vista === 'cabina') {
      // Desde el asiento: un poco arriba del centro, mirando por la nariz (algo hacia abajo, para ver el horizonte sobre el tablero).
      const b = baseAvion(avion.rumbo, avion.cabeceo - 7, avion.alabeo);
      const ojo = suma(suma(pos, por(b.U, 0.0017)), por(b.F, 0.0016));
      return crearCamara({ ojo, mira: suma(ojo, b.F), arriba: b.U, fov: ancho < alto ? 74 : 56, cerca: 0.0006 });
    }
    girCam = reducir ? avion.rumbo : mezclarAngulo(girCam, avion.rumbo, 0.06);
    const ojo = ojoOrbita({ mira: pos, giro: girCam, alto: 9, dist: 0.075 });
    if (ojo[1] < alturaSuelo(ojo[0], ojo[2]) + 0.003) ojo[1] = alturaSuelo(ojo[0], ojo[2]) + 0.003;
    return crearCamara({ ojo, mira: pos, fov: ancho < alto ? 62 : 50, cerca: 0.002 });
  }
  function dibujar() {
    medir();
    const cam = camara();
    const prims = vista === 'afuera' ? avionPropio(avion, { t: tiempo, yugo: mandosAhora() }) : [];
    // Dentro de la nube (la falla «nube»): todo gris.
    const dentro = nubeFalla && Math.hypot(avion.x - nubeFalla.x, avion.ft / 1000 - nubeFalla.y, avion.z - nubeFalla.z) < nubeFalla.r;
    const niebla = dentro ? { color: [200, 204, 212], inicio: 0, fin: 0.35 } : { color: paleta.niebla, inicio: 10, fin: 70 };
    if (gl3) gl3.render({ paleta, fijas: [mundo, extras], prims, niebla, lejos: 300, texturaEscala: 0.35 }, cam, ancho, alto, { escala: escalaPx });
    else if (ctx2d) render(ctx2d, { paleta, prims: [...mundo, ...extras, ...prims], etiquetas: [], niebla, ambiente: paleta.ambiente }, cam, ancho, alto, { escala: escalaPx, texturas });
    if (!ctx) return;
    ctx.clearRect(0, 0, ancho, alto);
    if (vista === 'cabina') {
      const L = lecturas(avion);
      dibujarCabina(ctx, ancho, alto, L, { escala: escalaPx, completo: true, yugo: mandosAhora(), textos: TEXTOS_PANEL(t) });
    }
  }

  // ---- el mini-mapa: el de las consecuencias 3D (clase/e3d-minimapa.js), con la pista 36 y su eje extendido ----
  const mapa = montarMinimapa(escenario, MAPA_JUEGO, { T: (k, v) => t(`clase.e3d.sit.ctl.${k}`, v), zonas: ZONAS_JUEGO, decision: false });
  const dibujarMapa = () => mapa.mover(avion.x, avion.z, avion.rumbo);

  // ---- cada cuadro ----
  const mandosAhora = () => (toque.activo ? { cabeceo: toque.cabeceo, alabeo: toque.alabeo } : { cabeceo: mandos.cabeceo, alabeo: mandos.alabeo });
  function paso(dt) {
    const k = mandosDeTeclas(apretadas, mandos, dt);
    mandos.cabeceo = k.cabeceo; mandos.alabeo = k.alabeo;
    if (apretadas.size && [...apretadas].some(x => TECLAS[x]?.[0] === 'potencia')) mandos.potencia = k.potencia;
    let m = { ...mandosAhora(), potencia: mandos.potencia, flaps: mandos.flaps };
    if (guiado) m = mandosGuiados();
    // La falla del aceite: la presión baja, la temperatura sube y el motor tose.
    if (fallaDesde != null) avion = { ...avion, ...fallaAceite(tiempo - fallaDesde) };
    const amb = { viento: ambiente.viento, rafaga: tiempo < rafagaHasta ? rafaga : null };
    const antes = avion;
    avion = pasoVuelo(avion, m, dt, { asistente, ambiente: amb });
    if (nubeFalla && tiempo > nubeFalla.hasta) { nubeFalla = null; extras = []; }
    if (!guiado) eventos();
    if (!avion.enSuelo && avion.ft > 30) volo = true;
    // El relieve (lejos del aeropuerto): tocarlo es chocar.
    if (!avion.enSuelo && avion.ft / VUELO.ftPorUnidad < alturaSuelo(avion.x, avion.z)) avion = { ...avion, choque: true, kt: 0 };
    if (avion.choque && !antes.choque) return terminarVuelo({ nivel: 'choque', motivos: ['choque'], puntos: 0 }, avion.toque ?? null);
    if (avion.toque && volo && tiempo - ultimoToque > 3) {
      ultimoToque = tiempo;
      const juicio = juzgarAterrizaje(avion.toque, { choque: avion.choque });
      // Con buen aterrizaje la potencia queda en ralentí (para frenar); el resultado sale al ir despacio.
      mandos.potencia = 0; pintarPotencia();
      const datosToque = avion.toque;
      setTimeout(() => terminarVuelo(juicio, datosToque), reducir ? 0 : 1400);
      volo = false;
    }
  }
  function pintarTextos() {
    let clave = consejo(avion, { vuelo: tiempo - ultimoToque < 60 && ultimoToque > 0 });
    if (fallaDesde != null && !avion.enSuelo && clave !== 'perdida') clave = avion.motor <= 0 ? 'motor_parado' : 'aceite';
    if (guiado && clave !== 'choque') clave = guiado.fin === 'sin_vidas' ? 'base' : enAproximacion ? 'auto_final' : 'auto';
    if (clave !== ultimoConsejo) { chip.textContent = t(`juego.consejo.${clave}`); chip.setAttribute('data-tono', clave === 'perdida' || clave === 'choque' ? 'mal' : 'bien'); ultimoConsejo = clave; }
    const L = lecturas(avion);
    const linea = t('juego.hud', { kt: Math.round(L.kt), ft: Math.round(L.ft).toLocaleString('en-US'), rumbo: String(Math.round(L.rumbo) % 360 || 360).padStart(3, '0'), vs: Math.round(L.vs / 50) * 50 });
    if (linea !== ultimoHud) { hud.textContent = linea; ultimoHud = linea; }
    pintarMarcador();
  }
  const bucle = crearBucle(raiz, dt => {
    // En el vuelo con preguntas el piloto automático va 3 veces más rápido entre preguntas (no en la aproximación).
    const veces = guiado && !enAproximacion && !abierta ? GUIADO.velocidadReloj : 1;
    if (!pausado && !abierta) for (let k = 0; k < veces; k++) { tiempo += dt; paso(dt); }
    relojes(dt);
    const t0 = typeof performance === 'object' ? performance.now() : 0;
    dibujar();
    relojHud += dt;
    if (relojHud > 0.2) { relojHud = 0; pintarTextos(); dibujarMapa(); }
    if (t0) { cuadros++; if (dt > 1 / 24) lentos++; if (cuadros >= 60) { if (lentos > 35 && calidad > 0.7) calidad = Math.max(0.7, calidad - 0.15); cuadros = 0; lentos = 0; } }
  });

  // ---- el vuelo con preguntas: el piloto automático (0.14.99) ----
  function mandosGuiados() {
    const a = avion, ultimo = RUTA_GUIADA.length - 1;
    if (enAproximacion) return pilotoFinal(a);
    if (objetivo === ultimo && (llego(a, RUTA_GUIADA[ultimo]) || enFinal(a))) { enAproximacion = true; return pilotoFinal(a); }
    if (objetivo == null) { retener ??= { rumbo: a.rumbo, ft: a.ft }; return piloto(a, retener); }
    const wp = RUTA_GUIADA[objetivo];
    if (objetivo < ultimo && llego(a, wp)) { objetivo = null; esperando = true; retener = { rumbo: a.rumbo, ft: a.ft }; return piloto(a, retener); }
    return piloto(a, { rumbo: rumboHacia(a.x, a.z, wp), ft: wp.ft }, { desvio: tiempo < desvioHasta ? 45 : 0 });
  }
  // Un tramo sin pregunta (no quedan): avanza igual, sin puntos ni vidas.
  function saltarTramo() {
    const i = guiado.i + 1;
    guiado = { ...guiado, i, fin: i >= guiado.total ? 'destino' : null };
    objetivo = Math.min(i - 1, RUTA_GUIADA.length - 1); retener = null;
  }

  // ---- los eventos del Vuelo libre ----
  function eventos() {
    if (modoActual !== 'libre') return;
    const c = consejo(avion);
    const r = siguienteEvento(agenda, tiempo, { ft: avion.ft, enSuelo: avion.enSuelo, enFinal: c === 'final' || c === 'final_rapido', ocupado: abierta || !oferta.hidden || avion.choque });
    agenda = r.agenda;
    // Cerca de la tormenta: turbulencia fuerte.
    if (tormenta && Math.hypot(avion.x - tormenta.x, avion.z - tormenta.z) < 3.5 && avion.ft < 22000) { rafaga = rafagaTurbulencia(1.6, 3); rafagaHasta = tiempo + 0.5; }
    if (!r.evento) return;
    const e = r.evento;
    if (e.tipo === 'cruzado') {
      ambiente = { ...ambiente, viento: vientoCruzado(azar) };
      mostrarAviso({ tono: 'info', titulo: t('juego.ev.cruzado.titulo'), partes: [t('juego.ev.cruzado', { desde: tresDigitos(ambiente.viento.desde), kt: ambiente.viento.kt })] });
      return;
    }
    if (e.tipo === 'tormenta') ponerTormenta();
    if (e.tipo === 'viento') ambiente = { ...ambiente, viento: vientoNuevo(azar, ambiente.viento) };
    ofrecer(e);
  }
  function ponerTormenta() {
    const h = (avion.rumbo * Math.PI) / 180, lejos = 4 * NM;
    const x = Math.max(-30, Math.min(30, avion.x + Math.sin(h) * lejos)), z = Math.max(-30, Math.min(30, avion.z + Math.cos(h) * lejos));
    tormenta = { x, z };
    extras = nubeTormenta({ x, z, base: 3.5, ancho: 3.4, altoMax: 24, k: 0.92, semilla: 9 });
  }
  const tresDigitos = g => String(Math.round(g) % 360 || 360).padStart(3, '0');
  // «Pregunta del instructor / del control: ¿la tomas?»
  function ofrecer(e) {
    const item = elegirPregunta(pool, usadas, e.tema);
    const contexto = e.tipo === 'tormenta' ? t('juego.ev.tormenta', { nm: HECHOS_SITUACIONES.tormentas.evitarNM, fuente: 'AIM 7-1-27' })
      : e.tipo === 'viento' ? t('juego.ev.viento', { desde: tresDigitos(ambiente.viento.desde), kt: ambiente.viento.kt }) : null;
    if (!item) { if (contexto) mostrarAviso({ tono: 'info', titulo: t(`juego.oferta.${e.quien}`), partes: [contexto] }); return; }
    puntaje = { ...puntaje, ofrecidas: puntaje.ofrecidas + 1 };
    while (oferta.firstChild) oferta.removeChild(oferta.firstChild);
    oferta.append(
      el('h2', { id: 'juego-oferta-titulo', class: 'juego-oferta-titulo', texto: t(`juego.oferta.${e.quien}`) }),
      ...[contexto ? el('p', { class: 'juego-oferta-contexto', texto: contexto }) : null].filter(Boolean),
      el('p', { class: 'juego-oferta-pregunta', texto: t('juego.oferta.tomas') }),
      el('div', { class: 'juego-oferta-botones' },
        el('button', { type: 'button', class: 'boton-3d naranja juego-aceptar', onclick: () => { oferta.hidden = true; abrirPregunta(item, e); } }, el('span', { texto: t('juego.oferta.aceptar') })),
        el('button', { type: 'button', class: 'boton-3d blanco juego-ahora-no', onclick: () => { oferta.hidden = true; } }, el('span', { texto: t('juego.oferta.no') }))));
    oferta.hidden = false;
    ofertaReloj = JUEGO.ofertaS;
  }

  // ---- la pregunta: de su material, sin la respuesta (llega solo al responder, por la práctica de siempre) ----
  function abrirPregunta(item, e = null) {
    abierta = true;
    while (pregunta.firstChild) pregunta.removeChild(pregunta.firstChild);
    const q = item.q;
    const botones = q.opciones.map(o => el('button', { type: 'button', class: 'juego-opcion-respuesta', 'data-letra': o.letra, onclick: () => responder(item, o.letra, botones) },
      el('span', { class: 'opcion-letra', texto: o.letra }), h.talCual ? h.talCual('span', o.texto, 'opcion-texto') : el('span', { texto: o.texto })));
    const quien = e?.quien ?? (guiado ? 'ruta' : 'instructor');
    pregunta.append(el('section', { class: 'juego-dialogo juego-pregunta', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-q-titulo' },
      el('p', { class: 'juego-q-quien', id: 'juego-q-titulo', texto: guiado ? t('juego.q.tramo', { n: guiado.i + 1, total: guiado.total }) : t(`juego.oferta.${quien}`) }),
      h.talCual ? h.talCual('p', q.enunciado, 'juego-q-enunciado') : el('p', { class: 'juego-q-enunciado', texto: q.enunciado }),
      el('div', { class: 'juego-q-opciones', role: 'group', 'aria-label': t('juego.q.opciones') }, botones)));
    pregunta.hidden = false;
    botones[0]?.focus();
  }
  async function responder(item, letra, botones) {
    for (const b of botones) b.disabled = true;
    botones.find(b => b.dataset.letra === letra)?.setAttribute('aria-pressed', 'true');
    const { ruta, datos } = pedidoRespuesta(item, letra);
    const r = await h.api('POST', ruta, datos).catch(() => null);
    const res = r?.ok ? adaptarRespuesta(item.fuente, r.datos) : null;
    usadas.add(item.q.id);
    pregunta.hidden = true; abierta = false;
    // Sin conexión: sin castigo ni falla (y la pregunta puede volver otro día).
    if (!res) { mostrarAviso({ tono: 'info', titulo: t('juego.q.sin_red'), partes: [t('juego.q.sin_red.texto')] }); if (guiado) saltarTramo(); return; }
    puntaje = puntuar(puntaje, res.acierto);
    aplicarConsecuencia(item, res);
    if (pool.filter(p => !usadas.has(p.q.id)).length < 3) cargarPreguntas();
  }
  function revisada(item, res) {
    return opcionesRevisadas(item.q.opciones, { correcta: res.correcta, elegida: res.elegida }, { el, t, talCual: h.talCual ?? ((tag, texto, clase) => el(tag, { class: clase, texto })) }, { clase: 'juego-revisadas' });
  }
  function aplicarConsecuencia(item, res) {
    const porque = lineaPorque(res.sencilla);
    const correcta = item.q.opciones.find(o => o.letra === res.correcta);
    if (guiado) {
      guiado = responderGuiado(guiado, res.acierto);
      objetivo = guiado.fin === 'sin_vidas' ? RUTA_GUIADA.length - 1 : Math.min(guiado.i - 1, RUTA_GUIADA.length - 1);
      retener = null;
      if (res.acierto) {
        const mv = maniobraDe(avion, RUTA_GUIADA[objetivo]);
        mostrarAviso({ tono: 'bien', titulo: t('juego.q.bien', { n: JUEGO.puntosBien }), partes: [correcta ? t('juego.q.correcta', { letra: correcta.letra, texto: correcta.texto }) : null, t('juego.maniobra', { que: mv.tipos.map(x => t(`juego.maniobra.${x}`)).join(t('juego.maniobra.y')) })] });
        return;
      }
      const falla = guiado.falla;
      if (falla === 'nube') {
        const h0 = (avion.rumbo * Math.PI) / 180, x = avion.x + Math.sin(h0) * 1.1, z = avion.z + Math.cos(h0) * 1.1, y = avion.ft / 1000;
        nubeFalla = { x, y: y + 0.1, z, r: 0.75, hasta: tiempo + 14 };
        extras = cumulo({ x, z, base: y - 0.35, ancho: 1.6, alto: 0.9, semilla: 31 + guiado.fallas }).prims;
      } else if (falla === 'turbulencia') { rafaga = rafagaTurbulencia(1.3, guiado.fallas); rafagaHasta = tiempo + 9; }
      else desvioHasta = tiempo + 9;
      mostrarAviso({ tono: 'mal', titulo: t(`juego.falla.${falla}`), partes: [revisada(item, res), porque || null, t(guiado.fin === 'sin_vidas' ? 'juego.q.sin_vidas' : 'juego.q.vida', { n: guiado.vidas })] });
      return;
    }
    const cons = consecuenciaDe(item.categoria, res.acierto);
    if (cons === 'bien') {
      mostrarAviso({ tono: 'bien', titulo: t('juego.q.bien', { n: JUEGO.puntosBien }), partes: [correcta ? t('juego.q.correcta', { letra: correcta.letra, texto: correcta.texto }) : null, porque || null] });
      return;
    }
    const base = [revisada(item, res), porque || null];
    if (cons === 'aceite') {
      if (fallaDesde == null) fallaDesde = tiempo;
      mostrarAviso({ tono: 'mal', titulo: t('juego.falla.aceite'), partes: [...base, t('juego.falla.aceite.texto')], botones: [
        ['juego.decide.aterrizar', () => { decision = 'aterrizar'; puntaje = { ...puntaje, decisiones: puntaje.decisiones + 1 }; mostrarAviso({ tono: 'info', titulo: t('juego.decide.aterrizar'), partes: [t('juego.decide.aterrizar.texto')] }); }],
        ['juego.decide.seguir', () => { decision = 'seguir'; mostrarAviso({ tono: 'mal', titulo: t('juego.decide.seguir'), partes: [t('juego.decide.seguir.texto')] }); }]] });
    } else if (cons === 'turbulencia') {
      rafaga = rafagaTurbulencia(1, 2); rafagaHasta = tiempo + JUEGO.turbulenciaS;
      ambiente = { ...ambiente, viento: vientoNuevo(azar, ambiente.viento) };
      mostrarAviso({ tono: 'mal', titulo: t('juego.falla.turbulencia'), partes: [...base, t('juego.falla.turbulencia.texto', { desde: tresDigitos(ambiente.viento.desde), kt: ambiente.viento.kt })] });
    } else {
      mostrarAviso({ tono: 'mal', titulo: t('juego.falla.atc'), radio: t('juego.falla.atc.radio'), partes: [t('juego.falla.atc.texto'), ...base] });
    }
  }
  // El aviso (abajo de la escena): la respuesta, la falla o la radio. Con botones (una decisión) no se va solo.
  function mostrarAviso({ tono = 'info', titulo, partes = [], botones = null, radio = null }) {
    while (aviso.firstChild) aviso.removeChild(aviso.firstChild);
    aviso.setAttribute('data-tono', tono);
    aviso.append(...[
      el('h2', { class: 'juego-aviso-titulo', texto: titulo }),
      radio ? el('p', { class: 'juego-radio', lang: 'en', texto: radio }) : null,
      ...partes.filter(Boolean).map(x => (typeof x === 'string' ? el('p', { texto: x }) : x)),
      el('div', { class: 'juego-aviso-botones' },
        ...(botones ?? []).map(([clave, f]) => el('button', { type: 'button', class: 'boton-3d naranja chico', onclick: f }, el('span', { texto: t(clave) }))),
        el('button', { type: 'button', class: 'juego-boton juego-aviso-cerrar', onclick: () => { aviso.hidden = true; } }, t('juego.aviso.cerrar'))),
    ].filter(Boolean));
    aviso.hidden = false;
    avisoReloj = botones ? Infinity : tono === 'mal' ? 18 : 10;
  }
  // Los relojes de la pantalla (en tiempo real, también en pausa): la oferta se retira sola; el aviso se va solo.
  function relojes(dt) {
    if (!oferta.hidden && !pausado) { ofertaReloj -= dt; if (ofertaReloj <= 0) oferta.hidden = true; }
    if (!aviso.hidden && !pausado && !abierta) { avisoReloj -= dt; if (avisoReloj <= 0) aviso.hidden = true; }
    if (guiado && esperando && !abierta && !pausado && resultado.hidden && !guiado.fin) {
      const item = elegirPregunta(pool, usadas);
      if (item) { esperando = false; abrirPregunta(item); }
      else if (!cargando) { esperando = false; saltarTramo(); }
    }
  }
  // Las preguntas de este vuelo: la Práctica del instructor (las falladas y las nuevas primero) y la ronda del oral.
  function cargarPreguntas() {
    if (cargando) return cargando;
    cargando = (async () => {
      const [tg, oral] = await Promise.all([
        h.api ? h.api('POST', '/api/academia/intentos', { tipo: 'instructor', cuantas: 10 }).catch(() => null) : null,
        // (el oral, solo si el curso lo tiene: si no, el servidor contesta «no hay» y no hace falta preguntar)
        h.api && h.oral ? h.api('POST', '/api/academia/oral/ronda', {}).catch(() => null) : null,
      ]);
      const nuevas = poolDePreguntas(tg?.ok ? tg.datos : null, oral?.ok ? oral.datos : null).filter(p => !usadas.has(p.q.id) && !pool.some(x => x.q.id === p.q.id));
      pool = [...pool, ...nuevas];
      cargando = null;
      return pool;
    })();
    return cargando;
  }
  function lineasResumen(juicio) {
    if (guiado) return [t('juego.res.respuestas', { bien: guiado.bien, total: guiado.respondidas }), t('juego.res.racha', { n: guiado.mejor }), t('juego.res.total', { n: puntaje.puntos + juicio.puntos })];
    const out = [];
    if (puntaje.ofrecidas || puntaje.aceptadas) out.push(t('juego.res.preguntas', { aceptadas: puntaje.aceptadas, ofrecidas: puntaje.ofrecidas, bien: puntaje.bien }));
    const conMotor = fallaDesde != null && ['bueno', 'firme', 'duro'].includes(juicio.nivel);
    if (conMotor) { puntaje = { ...puntaje, puntos: puntaje.puntos + JUEGO.puntosDecision }; out.push(t('juego.res.decision', { n: JUEGO.puntosDecision })); }
    out.push(t('juego.res.total', { n: puntaje.puntos + juicio.puntos }));
    return out;
  }
  function pintarMarcador() {
    const s = guiado ? t('juego.marcador.guiado', { vidas: guiado.vidas, total: GUIADO.vidas, i: Math.min(guiado.i + (esperando || abierta ? 1 : 0), guiado.total), n: guiado.total, puntos: puntaje.puntos })
      : puntaje.ofrecidas ? t('juego.marcador', { puntos: puntaje.puntos }) : '';
    if (marcador.textContent !== s) { marcador.textContent = s; marcador.hidden = !s; }
  }

  // ---- el resultado ----
  function terminarVuelo(juicio, toqueDatos) {
    if (!juicio) return;
    pausar(true);
    while (resDatos.firstChild) resDatos.removeChild(resDatos.firstChild);
    resTitulo.textContent = t(`juego.res.${juicio.nivel}`);
    resultado.firstChild.setAttribute('data-nivel', juicio.nivel);
    const d = toqueDatos ?? {};
    const filas = [
      d.kt != null ? t('juego.res.velocidad', { kt: Math.round(d.kt) }) : null,
      d.vs != null ? t('juego.res.descenso', { fpm: Math.round(-Math.min(0, d.vs) / 10) * 10 }) : null,
      d.costado != null && d.dentro ? t('juego.res.eje', { ft: Math.round(Math.abs(d.costado)) }) : null,
      t('juego.res.puntos', { n: juicio.puntos }),
      ...lineasResumen(juicio),
    ].filter(Boolean);
    for (const f of filas) resDatos.append(el('li', { texto: f }));
    resConsejo.textContent = t(`juego.res.consejo.${juicio.motivos[0] ?? 'bueno'}`);
    if (guiado) resTitulo.textContent = t(guiado.fin === 'sin_vidas' ? 'juego.res.base' : 'juego.res.destino');
    errores.hidden = !(puntaje.aceptadas > puntaje.bien || (guiado && guiado.respondidas > guiado.bien));
    resultado.hidden = false;
    resultado.querySelector('button')?.focus();
  }
  function reiniciar(m) {
    avion = inicioDe(m);
    mandos.potencia = avion.potencia; mandos.flaps = avion.flaps; mandos.cabeceo = 0; mandos.alabeo = 0;
    volo = m === 'final' || m === 'preguntas'; ultimoToque = -10; tiempo = 0; girCam = avion.rumbo;
    puntaje = puntajeInicial(); agenda = crearAgenda(azar); ambiente = { viento: { desde: 360, kt: 0 } }; rafagaHasta = -1; fallaDesde = null; decision = null;
    extras = []; nubeFalla = null; desvioHasta = -1; oferta.hidden = true; aviso.hidden = true; pregunta.hidden = true; abierta = false;
    guiado = m === 'preguntas' ? crearGuiado() : null; objetivo = null; enAproximacion = false; esperando = Boolean(guiado);
    raiz.setAttribute('data-modo', m); modoActual = m; retener = null; tormenta = null;
    resultado.hidden = true; pintarBotones(); pintarPotencia(); pausar(false);
  }

  // ---- botones ----
  function cambiarVista() { vista = vista === 'cabina' ? 'afuera' : 'cabina'; raiz.setAttribute('data-vista', vista); pintarBotones(); }
  function pintarBotones() {
    for (const b of [bVista, raiz.querySelector('.juego-vista2')]) if (b) b.textContent = t(vista === 'cabina' ? 'juego.vista.afuera' : 'juego.vista.cabina');
    bAsistente.setAttribute('aria-pressed', String(asistente));
    for (const b of [bFlaps, raiz.querySelector('.juego-flaps2')]) if (b) { b.setAttribute('aria-pressed', String(Boolean(mandos.flaps))); b.textContent = t(mandos.flaps ? 'juego.flaps.abajo' : 'juego.flaps'); }
    bPausa.setAttribute('aria-pressed', String(pausado));
    bPausa.textContent = t(pausado ? 'juego.seguir_vuelo' : 'juego.pausa');
  }
  function pausar(si) { pausado = Boolean(si); pintarBotones(); }
  function abrirAyuda() { pausar(true); ayuda.hidden = false; ayuda.querySelector('.juego-a-volar')?.focus(); }
  function cerrarAyuda() {
    ayuda.hidden = true; pausar(false);
    try { localStorage.setItem(CLAVE_AYUDA, '1'); } catch { /* sin almacenamiento */ }
    lienzo.focus?.();
  }
  function pintarPotencia() {
    const p = Math.round(mandos.potencia * 100);
    relleno.style.height = `${p}%`;
    manija.style.bottom = `${p}%`;
    potencia.setAttribute('aria-valuenow', String(p));
    potencia.setAttribute('aria-valuetext', `${p} %`);
    textoPotencia.textContent = `${p} %`;
  }

  // ---- el teclado ----
  const alApretar = e => {
    if (!ayuda.hidden || !resultado.hidden || abierta) { if (e.key === 'Escape' && !ayuda.hidden) cerrarAyuda(); return; }
    if (e.target?.closest?.('.juego-potencia') && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;
    if (TECLAS[e.code]) { apretadas.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); if (TECLAS[e.code][0] === 'potencia') setTimeout(pintarPotencia, 0); return; }
    if (e.code === 'KeyF') { mandos.flaps = mandos.flaps ? 0 : 1; pintarBotones(); }
    else if (e.code === 'KeyC') cambiarVista();
    else if (e.code === 'KeyP') pausar(!pausado);
    else if (e.key === '?' || e.code === 'KeyH') abrirAyuda();
  };
  const alSoltar = e => { apretadas.delete(e.code); if (TECLAS[e.code]?.[0] === 'potencia') pintarPotencia(); };
  const alPerderFoco = () => apretadas.clear();
  window.addEventListener('keydown', alApretar);
  window.addEventListener('keyup', alSoltar);
  window.addEventListener('blur', alPerderFoco);
  let relojPotencia = 0;
  // Mientras se aprieta Shift o Ctrl, la palanca en pantalla se repinta.
  relojPotencia = setInterval(() => { if ([...apretadas].some(x => TECLAS[x]?.[0] === 'potencia')) pintarPotencia(); }, 120);

  // ---- el yugo en pantalla (arrastrar) ----
  const mover = e => {
    const r = yugo.getBoundingClientRect(), radio = r.width / 2;
    const dx = Math.max(-1, Math.min(1, (e.clientX - r.left - radio) / (radio * 0.8)));
    const dy = Math.max(-1, Math.min(1, (e.clientY - r.top - radio) / (radio * 0.8)));
    toque.alabeo = dx; toque.cabeceo = dy;
    perilla.style.transform = `translate(${(dx * radio * 0.62).toFixed(1)}px, ${(dy * radio * 0.62).toFixed(1)}px)`;
  };
  yugo.addEventListener('pointerdown', e => { toque.activo = true; try { yugo.setPointerCapture(e.pointerId); } catch { /* sin captura */ } mover(e); e.preventDefault(); });
  yugo.addEventListener('pointermove', e => { if (toque.activo) mover(e); });
  const soltarYugo = () => { toque.activo = false; toque.alabeo = 0; toque.cabeceo = 0; perilla.style.transform = ''; };
  yugo.addEventListener('pointerup', soltarYugo);
  yugo.addEventListener('pointercancel', soltarYugo);
  // ---- la palanca de potencia ----
  const ponerPotencia = e => {
    const r = potencia.getBoundingClientRect();
    mandos.potencia = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    pintarPotencia();
  };
  let enPotencia = false;
  potencia.addEventListener('pointerdown', e => { enPotencia = true; try { potencia.setPointerCapture(e.pointerId); } catch { /* sin captura */ } ponerPotencia(e); e.preventDefault(); });
  potencia.addEventListener('pointermove', e => { if (enPotencia) ponerPotencia(e); });
  potencia.addEventListener('pointerup', () => { enPotencia = false; });
  potencia.addEventListener('pointercancel', () => { enPotencia = false; });
  potencia.addEventListener('keydown', e => {
    const paso1 = e.code === 'ArrowUp' || e.code === 'PageUp' ? 0.1 : e.code === 'ArrowDown' || e.code === 'PageDown' ? -0.1 : e.code === 'Home' ? -1 : e.code === 'End' ? 1 : 0;
    if (!paso1) return;
    e.preventDefault(); e.stopPropagation();
    mandos.potencia = Math.max(0, Math.min(1, mandos.potencia + paso1)); pintarPotencia();
  });
  // El dedo sobre el juego no hace zoom ni mueve la página.
  for (const n of [yugo, potencia, escenario]) n.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // ---- tema ----
  let temaObs = null;
  try { temaObs = new MutationObserver(() => { const p = leerPaleta(); if (p !== paleta) { paleta = p; mundo = construirMundo(paleta); } }); temaObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] }); } catch { temaObs = null; }

  // ---- salir ----
  function destruir() {
    bucle.destruir(); gl3?.liberar?.(); temaObs?.disconnect(); clearInterval(relojPotencia);
    window.removeEventListener('keydown', alApretar); window.removeEventListener('keyup', alSoltar); window.removeEventListener('blur', alPerderFoco);
    window.removeEventListener('hashchange', alCambiarRuta);
    document.body.classList.remove('juego-activo');
  }
  const alCambiarRuta = () => { if (!location.hash.startsWith(`${RUTA}/`)) destruir(); };
  window.addEventListener('hashchange', alCambiarRuta);

  pintarBotones(); pintarPotencia();
  if (modo !== 'final') cargarPreguntas();
  let vista1 = false;
  try { vista1 = localStorage.getItem(CLAVE_AYUDA) === '1'; } catch { vista1 = false; }
  if (!vista1) abrirAyuda();
  bucle.iniciar();

  // Para las capturas y las pruebas: poner el avión en un estado y dibujar ya (también en raiz.juego, para las capturas).
  const control = {
    raiz, destruir, reiniciar, abrirAyuda, cerrarAyuda, cambiarVista, ofrecer, abrirPregunta, aplicarConsecuencia, cargarPreguntas, ponerTormenta, pausar,
    get guiado() { return guiado; }, get puntaje() { return puntaje; }, get pool() { return pool; },
    fijar(estado = {}) { avion = { ...avion, ...estado }; if (estado.vista && estado.vista !== vista) cambiarVista(); if (estado.potencia != null) { mandos.potencia = estado.potencia; pintarPotencia(); } pintarTextos(); dibujar(); dibujarMapa(); },
    terminarVuelo,
    get avion() { return avion; },
  };
  raiz.juego = control;
  return control;
}

// La paleta del cielo según el tema (de día, en claro; en oscuro, al atardecer, como las escenas 3D).
function leerPaleta() {
  try { return document.documentElement.getAttribute('data-tema') === 'oscuro' ? PALETAS.oscuro : PALETAS.claro; } catch { return PALETAS.claro; }
}
const TEXTOS_PANEL = t => ({ kt: t('juego.panel.kt'), ft: t('juego.panel.ft'), vsi: t('juego.panel.vsi'), rpm: t('juego.panel.rpm'), psi: t('juego.panel.psi'), temp: t('juego.panel.temp'), fuel: t('juego.panel.fuel'), giro: t('juego.panel.giro'), min: t('juego.panel.min'), stall: t('juego.panel.stall'), arriba: t('juego.panel.arriba'), abajo: t('juego.panel.abajo') });

