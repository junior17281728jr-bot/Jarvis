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
        opcion(`${RUTA}/final`, 'flecha', t('juego.final'), t('juego.final.detalle'))),
      el('p', { class: 'suave chica', texto: t('juego.pronto') }))));
}

// ---------- el vuelo ----------
export function montarVuelo(h, { modo = 'libre' } = {}) {
  const { el, t, icono, mostrar } = h;
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
  const barra = el('div', { class: 'juego-barra' }, salir, el('div', { class: 'juego-barra-botones' }, bVista, bFlaps, bAsistente, bPausa, bAyuda));
  const escenario = el('div', { class: 'juego-escenario' }, lienzo, capa, barra, chip, hud);

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
  // El resultado del aterrizaje.
  const resTitulo = el('h2', { id: 'juego-res-titulo' });
  const resDatos = el('ul', { class: 'juego-res-datos' });
  const resConsejo = el('p', { class: 'juego-nota' });
  const resultado = el('div', { class: 'juego-capa-dialogo', hidden: true },
    el('section', { class: 'juego-dialogo juego-resultado', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-res-titulo' },
      resTitulo, resDatos, resConsejo,
      el('div', { class: 'juego-res-botones' },
        el('button', { type: 'button', class: 'boton-3d naranja', onclick: () => reiniciar('final') }, el('span', { texto: t('juego.otra_final') })),
        el('button', { type: 'button', class: 'boton-3d blanco', onclick: () => reiniciar('libre') }, el('span', { texto: t('juego.otra_despegue') })),
        el('button', { type: 'button', class: 'boton-texto juego-seguir', onclick: () => { resultado.hidden = true; pausar(false); } }, el('span', { texto: t('juego.seguir') })))));

  const raiz = el('div', { class: 'juego-vuelo', 'data-vista': 'cabina', 'data-tactil': tactil ? '1' : '0' }, escenario, mandosTactiles, ayuda, resultado);
  mostrar(raiz);
  document.body.classList.add('juego-activo');

  // ---- el estado ----
  let avion = inicioDe(modo);
  const mandos = { cabeceo: 0, alabeo: 0, potencia: avion.potencia, flaps: avion.flaps };
  const toque = { activo: false, cabeceo: 0, alabeo: 0 };
  const apretadas = new Set();
  let vista = 'cabina', asistente = true, pausado = false, tiempo = 0, volo = modo === 'final', ultimoToque = -10, girCam = avion.rumbo;
  let paleta = leerPaleta(), mundo = construirMundo(paleta), ultimoConsejo = '', ultimoHud = '', relojHud = 0;

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
    const niebla = { color: paleta.niebla, inicio: 10, fin: 70 };
    if (gl3) gl3.render({ paleta, fijas: [mundo], prims, niebla, lejos: 300, texturaEscala: 0.35 }, cam, ancho, alto, { escala: escalaPx });
    else if (ctx2d) render(ctx2d, { paleta, prims: [...mundo, ...prims], etiquetas: [], niebla, ambiente: paleta.ambiente }, cam, ancho, alto, { escala: escalaPx, texturas });
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
    const m = { ...mandosAhora(), potencia: mandos.potencia, flaps: mandos.flaps };
    const antes = avion;
    avion = pasoVuelo(avion, m, dt, { asistente });
    if (!avion.enSuelo && avion.ft > 30) volo = true;
    // El relieve (lejos del aeropuerto): tocarlo es chocar.
    if (!avion.enSuelo && avion.ft / VUELO.ftPorUnidad < alturaSuelo(avion.x, avion.z)) avion = { ...avion, choque: true, kt: 0 };
    if (avion.choque && !antes.choque) return terminarVuelo({ nivel: 'choque', motivos: ['choque'], puntos: 0 }, avion.toque ?? null);
    if (avion.toque && volo && tiempo - ultimoToque > 3) {
      ultimoToque = tiempo;
      const juicio = juzgarAterrizaje(avion.toque, { choque: avion.choque });
      // Con buen aterrizaje la potencia queda en ralentí (para frenar); el resultado sale al ir despacio.
      mandos.potencia = 0; pintarPotencia();
      setTimeout(() => terminarVuelo(juicio, avion.toque ?? juicio), reducir ? 0 : 1400);
      volo = false;
    }
  }
  function pintarTextos() {
    const clave = consejo(avion, { vuelo: tiempo - ultimoToque < 60 && ultimoToque > 0 });
    if (clave !== ultimoConsejo) { chip.textContent = t(`juego.consejo.${clave}`); chip.setAttribute('data-tono', clave === 'perdida' || clave === 'choque' ? 'mal' : 'bien'); ultimoConsejo = clave; }
    const L = lecturas(avion);
    const linea = t('juego.hud', { kt: Math.round(L.kt), ft: Math.round(L.ft).toLocaleString('en-US'), rumbo: String(Math.round(L.rumbo) % 360 || 360).padStart(3, '0'), vs: Math.round(L.vs / 50) * 50 });
    if (linea !== ultimoHud) { hud.textContent = linea; ultimoHud = linea; }
  }
  const bucle = crearBucle(raiz, dt => {
    if (!pausado) { tiempo += dt; paso(dt); }
    const t0 = typeof performance === 'object' ? performance.now() : 0;
    dibujar();
    relojHud += dt;
    if (relojHud > 0.2) { relojHud = 0; pintarTextos(); dibujarMapa(); }
    if (t0) { cuadros++; if (dt > 1 / 24) lentos++; if (cuadros >= 60) { if (lentos > 35 && calidad > 0.7) calidad = Math.max(0.7, calidad - 0.15); cuadros = 0; lentos = 0; } }
  });

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
    ].filter(Boolean);
    for (const f of filas) resDatos.append(el('li', { texto: f }));
    resConsejo.textContent = t(`juego.res.consejo.${juicio.motivos[0] ?? 'bueno'}`);
    resultado.hidden = false;
    resultado.querySelector('button')?.focus();
  }
  function reiniciar(m) {
    avion = inicioDe(m);
    mandos.potencia = avion.potencia; mandos.flaps = avion.flaps; mandos.cabeceo = 0; mandos.alabeo = 0;
    volo = m === 'final'; ultimoToque = -10; tiempo = 0; girCam = avion.rumbo;
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
    if (!ayuda.hidden || !resultado.hidden) { if (e.key === 'Escape' && !ayuda.hidden) cerrarAyuda(); return; }
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
  let vista1 = false;
  try { vista1 = localStorage.getItem(CLAVE_AYUDA) === '1'; } catch { vista1 = false; }
  if (!vista1) abrirAyuda();
  bucle.iniciar();

  // Para las capturas y las pruebas: poner el avión en un estado y dibujar ya (también en raiz.juego, para las capturas).
  const api = {
    raiz, destruir, reiniciar, abrirAyuda, cerrarAyuda, cambiarVista,
    fijar(estado = {}) { avion = { ...avion, ...estado }; if (estado.vista && estado.vista !== vista) cambiarVista(); if (estado.potencia != null) { mandos.potencia = estado.potencia; pintarPotencia(); } pintarTextos(); dibujar(); dibujarMapa(); },
    terminarVuelo,
    get avion() { return avion; },
  };
  raiz.juego = api;
  return api;
}

// La paleta del cielo según el tema (de día, en claro; en oscuro, al atardecer, como las escenas 3D).
function leerPaleta() {
  try { return document.documentElement.getAttribute('data-tema') === 'oscuro' ? PALETAS.oscuro : PALETAS.claro; } catch { return PALETAS.claro; }
}
const TEXTOS_PANEL = t => ({ kt: t('juego.panel.kt'), ft: t('juego.panel.ft'), vsi: t('juego.panel.vsi'), rpm: t('juego.panel.rpm'), psi: t('juego.panel.psi'), temp: t('juego.panel.temp'), fuel: t('juego.panel.fuel'), giro: t('juego.panel.giro'), min: t('juego.panel.min'), stall: t('juego.panel.stall'), arriba: t('juego.panel.arriba'), abajo: t('juego.panel.abajo') });

