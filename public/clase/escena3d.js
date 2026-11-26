// 0.14.78: el dibujo «escena-3d»: una animación 3D guiada, por pasos, para los temas más difíciles (espacio aéreo,
// mínimos VFR, circuito, frentes, pérdida y VOR). El alumno toca «Siguiente»; cada paso tiene su subtítulo (texto de
// verdad, con aria-live), su «Ver más» y la cámara va a lo que el paso explica. Botones: reproducir/pausa, vista en 1ª o
// 3ª persona y repetir. Se gira arrastrando (o con las flechas) y se acerca pellizcando, con la rueda o con + y −.
// Se pausa fuera de la pantalla y con la pestaña oculta; con «reducir movimiento» empieza quieta (pero dibujada).
// parametros: { escena: 'espacio-aereo'|'minimos-vfr'|'circuito-3d'|'frentes'|'perdida'|'vor-3d', titulo?,
//   pasos?: [{ id, texto?, mas? }] } (los pasos elegidos y en ese orden; texto y «Ver más» propios si se dan).
import { el, crearBucle, prefiereMenosMovimiento } from './comun.js';
import {
  crearCamara, ojoOrbita, render, dibujarCabina, dibujarEtiquetas, crearTexturas, crearRuta, estadoEnRuta, primitivasAvion, baseAvion,
  mezclar3, unitario, resta, suma, por, largo, limitar, suave3, mezclarAngulo, linea, proyectar, focal, mezclarColor,
} from './motor3d.js';
import { traductor3d, partesNegrita, sinMarcas, PALETAS } from './e3d-base.js';
import { crearRenderGL } from './motor3d-gl.js';
import { ESCENAS, TEXTOS_E3D } from './escenas3d.js';

// Los pasos que se muestran: todos, o los que pide el paquete (en su orden), con su texto propio si lo trae.
export function pasosDe(escena, pedidos) {
  if (!Array.isArray(pedidos) || !pedidos.length) return escena.PASOS.map(def => ({ def }));
  const porId = new Map(escena.PASOS.map(p => [p.id, p]));
  const vistos = new Set(), out = [];
  for (const x of pedidos) {
    const def = porId.get(x?.id);
    if (!def || vistos.has(def.id)) continue;
    vistos.add(def.id);
    out.push({ def, texto: typeof x.texto === 'string' && x.texto.trim() ? x.texto : null, mas: typeof x.mas === 'string' && x.mas.trim() ? x.mas : null });
  }
  return out.length ? out : escena.PASOS.map(def => ({ def }));
}

const leerPaleta = raiz => {
  try {
    const v = getComputedStyle(raiz).getPropertyValue('--cl-e3d-modo').trim();
    return v === 'oscuro' ? PALETAS.oscuro : PALETAS.claro;
  } catch { return PALETAS.claro; }
};
// La cámara mezclada entre dos (tercera ↔ primera persona): el ojo, hacia dónde mira, el «arriba» y el campo de visión.
function mezclarCamaras(a, b, k) {
  if (k <= 0) return a; if (k >= 1) return b;
  const ojo = mezclar3(a.ojo, b.ojo, k);
  const dir = unitario(mezclar3(a.adelante, b.adelante, k));
  const arriba = unitario(mezclar3(a.sube, b.sube, k));
  return crearCamara({ ojo, mira: suma(ojo, dir), arriba, fov: a.fov + (b.fov - a.fov) * k, cerca: Math.min(a.cerca, b.cerca) });
}

export function montarEscena3d(contenedor, parametros = {}, opciones = {}) {
  // opciones.escena: una escena propia (por ejemplo, armada con escenaDesdeJson de e3d-json.js).
  const escena = opciones.escena?.PASOS ? opciones.escena : ESCENAS[parametros.escena] ?? ESCENAS['espacio-aereo'];
  // Los textos: los del catálogo; una escena propia trae los suyos (escena.TEXTOS).
  const T0 = traductor3d(opciones, ESCENAS[escena.id] === escena ? TEXTOS_E3D : { ...TEXTOS_E3D, ...Object.fromEntries(Object.entries(escena.TEXTOS ?? {}).map(([k, v]) => [`${escena.id}.${k}`, v])) });
  const T = (k, v) => T0(`${escena.id}.${k}`, v);
  const pasos = pasosDe(escena, parametros.pasos);
  const titulo = typeof parametros.titulo === 'string' && parametros.titulo.trim() ? parametros.titulo : T('titulo');
  const reducir = prefiereMenosMovimiento();

  // ---------- la página ----------
  // opciones.ui = 'situacion': solo el lienzo y Reproducir / Vista / Repetir (situacion3d.js pone el resto).
  const raiz = el('figure', { class: `clase-visual clase-e3d clase-e3d-${escena.id}${opciones.ui === 'situacion' ? ' clase-e3d-sit' : ''}`, role: 'group', 'aria-label': titulo }, contenedor);
  el('figcaption', { class: 'clase-e3d-titulo' }, raiz, titulo);
  const caja = el('div', { class: 'clase-e3d-caja' }, raiz);
  const lienzo = el('canvas', { class: 'clase-e3d-lienzo', width: 640, height: 400, tabindex: 0, role: 'img', 'aria-label': titulo }, caja);
  const chip = el('p', { class: 'clase-e3d-estado' }, caja);
  const ayuda = el('p', { class: 'clase-e3d-ayuda', 'aria-hidden': 'true' }, caja, T0('ctl.ayuda'));
  el('p', { class: 'clase-e3d-oculto' }, raiz, T0('ctl.teclado'));
  const barra = el('div', { class: 'clase-e3d-puntos', role: 'group', 'aria-label': T0('ctl.pasos') }, raiz);
  const vivo = el('div', { class: 'clase-e3d-vivo', 'aria-live': 'polite', 'aria-atomic': 'true' }, raiz);
  const contador = el('p', { class: 'clase-e3d-contador' }, vivo);
  const tituloPaso = el('p', { class: 'clase-e3d-paso' }, vivo);
  const texto = el('p', { class: 'clase-e3d-texto' }, vivo);
  const detalles = el('details', { class: 'clase-e3d-mas' }, raiz);
  el('summary', {}, detalles, T0('ctl.verMas'));
  const masTexto = el('p', {}, detalles);
  const recuerda = el('aside', { class: 'clase-e3d-recuerda', hidden: true }, raiz);
  el('strong', { class: 'clase-e3d-recuerda-titulo' }, recuerda, T0('ctl.recuerda'));
  el('span', {}, recuerda, T('recuerda'));
  const controles = el('div', { class: 'clase-e3d-controles', role: 'group', 'aria-label': T0('ctl.controles') }, raiz);
  const boton = (clase, alPulsar) => { const b = el('button', { type: 'button', class: `clase-boton ${clase}` }, controles); b.addEventListener('click', alPulsar); return b; };
  const bAnterior = boton('clase-e3d-anterior', () => ir(i - 1));
  const bPlay = boton('clase-e3d-play', () => { jugando = !jugando; ponerBotones(); pedir(); });
  const bVista = boton('clase-e3d-vista', () => { mezclaMeta = mezclaMeta > 0.5 ? 0 : 1; vistaElegida = mezclaMeta; ponerBotones(); pedir(); });
  const bRepetir = boton('clase-e3d-repetir', () => repetir());
  const bSiguiente = boton('clase-e3d-siguiente clase-boton-principal', () => ir(i + 1 >= pasos.length ? 0 : i + 1));
  const puntos = pasos.map((p, n) => {
    const b = el('button', { type: 'button', class: 'clase-e3d-punto', 'aria-label': T0('ctl.irA', { n: n + 1, titulo: T(`${p.def.id}.titulo`) }) }, barra);
    b.addEventListener('click', () => ir(n));
    return b;
  });

  // ---------- el estado ----------
  let i = 0, t = 0, jugando = !reducir, vistaElegida = null;
  let mezcla = 0, mezclaMeta = 0;
  let orbita = null, orbitaDesde = null, kOrbita = 1;
  const usuario = { giro: 0, alto: 0, zoom: 1, mirar: 0 };
  let paleta = leerPaleta(raiz), paletaLeida = false, cacheFijo = null, cachePaso = new Map(), rutas = new Map();
  // calidad: si los cuadros van lentos (un teléfono viejo), el lienzo usa menos píxeles (hasta el 75 %).
  let calidad = 1, lentos = 0, cuadros = 0, sAnterior = 0, tAnterior = 0, alabeoAnterior = 0;
  let cajasDom = null, ultimaVista = '', ultimoPanel = '';
  let ancho = 640, alto = 400, escalaPx = 1, ajustePx = 1, ultimoChip = '', ultimoClase = '';
  let texturas = {};
  try { texturas = crearTexturas((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }); } catch { texturas = {}; }
  // Con WebGL2: luz de verdad (motor3d-gl.js) y una capa 2D encima para las etiquetas y la cabina. Sin WebGL2 (o con
  // opciones.motor = '2d'), todo en el lienzo 2D (motor3d.js): la misma escena, más simple.
  let ctx = null, gl3 = null, capa = null;
  if (opciones.motor !== '2d') gl3 = crearRenderGL(lienzo);
  // iOS suelta el contexto WebGL al ir a segundo plano o con poca memoria: al volver se arma todo otra vez y se dibuja.
  let glPerdido = false;
  if (gl3) {
    lienzo.addEventListener('webglcontextlost', e => { e.preventDefault(); glPerdido = true; });
    lienzo.addEventListener('webglcontextrestored', () => { gl3 = crearRenderGL(lienzo) ?? gl3; glPerdido = false; pedir(); });
  }
  if (gl3) { capa = el('canvas', { class: 'clase-e3d-capa', 'aria-hidden': 'true', width: 640, height: 400 }, caja); try { ctx = capa.getContext('2d'); } catch { ctx = null; } }
  else { try { ctx = lienzo.getContext?.('2d') ?? null; } catch { ctx = null; } }
  if (!ctx) el('p', { class: 'clase-e3d-sin' }, caja, T0('ctl.sinLienzo'));

  const paso = () => pasos[i].def;
  // La altura puede ir exagerada (escena.exagerar): la escena piensa en sus unidades y aquí se estira el eje y.
  const vy = escena.exagerar ?? 1;
  const Y = q => (vy === 1 ? q : [q[0], q[1] * vy, q[2]]);
  const estirar = lista => (vy === 1 ? lista : lista.map(q => (q.t === 'p' ? { ...q, p: q.p.map(Y), n: undefined } : q.t === 'l' ? { ...q, p: q.p.map(Y) } : q.t === 's' ? { ...q, p: Y(q.p) } : q)));
  const estirarE = lista => (vy === 1 ? lista : lista.map(e => ({ ...e, p: Y(e.p) })));
  const rutaDe = p => {
    if (!p.vuelo) return null;
    if (!rutas.has(p.id)) rutas.set(p.id, crearRuta(p.vuelo.ruta.map(Y), p.vuelo.cerrada));
    return rutas.get(p.id);
  };
  const tQuieto = p => p.tQuieto ?? (p.vuelo?.seg ?? 10) * 0.4;
  const fijo = () => { if (cacheFijo?.paleta !== paleta) { const v = escena.construir(paleta, T); cacheFijo = { paleta, v: { prims: estirar(v.prims ?? []), etiquetas: estirarE(v.etiquetas ?? []) } }; } return cacheFijo.v; };
  const delPaso = p => {
    const k = `${p.id}|${paleta.oscuro ? 1 : 0}`;
    if (!cachePaso.has(k)) { const v = escena.armarPaso(p, paleta, T); cachePaso.set(k, { prims: estirar(v.prims ?? []), etiquetas: estirarE(v.etiquetas ?? []) }); }
    return cachePaso.get(k);
  };
  const avionDe = (p, tiempo) => {
    if (escena.avion) { const propio = escena.avion(p, tiempo); if (propio) return { ...propio, pos: [propio.pos[0], propio.pos[1] * vy, propio.pos[2]] }; }
    const ruta = rutaDe(p);
    const v = p.vuelo, seg = v.seg;
    // Un tramo de la ruta (desde/hasta, en fracciones): se recorre y vuelve a empezar, con una pausa corta al final.
    // unaVez: se recorre una sola vez y el avión queda al final (las consecuencias de una situación).
    const s = v.unaVez ? (limitar(tiempo / seg, 0, 1)) * ruta.largo : v.desde != null ? (v.desde + (Math.min(tiempo % (seg * (v.hasta - v.desde) + 1.5), seg * (v.hasta - v.desde)) / seg)) * ruta.largo
      : v.cerrada ? (tiempo / seg) * ruta.largo : (Math.min(tiempo % (seg + 2), seg) / seg) * ruta.largo;
    // Al volver a empezar una ruta abierta, la cámara no salta: va despacio al nuevo lugar.
    if (!v.cerrada && s < sAnterior - ruta.largo * 0.2 && orbita && p.camara.seguir && jugando) { orbitaDesde = { ...orbita }; kOrbita = reducir ? 1 : 0; }
    sAnterior = s;
    return estadoEnRuta(ruta, s, { kt: v.kt, ftH: escena.unidades.ftH, ftV: escena.unidades.ftV / vy, maxAlabeo: v.maxAlabeo ?? 35 });
  };
  const metaOrbita = (p, avion) => {
    const c = p.camara;
    const mira = c.seguir ? mezclar3(Y(c.mira), avion.pos, c.seguir) : Y(c.mira);
    return { mira, giro: c.giroRel != null ? avion.rumbo + c.giroRel : c.giro, alto: c.alto, dist: c.dist, fov: c.fov ?? 46 };
  };

  // ---------- el texto de cada paso ----------
  function ponerTexto() {
    const p = pasos[i];
    contador.textContent = T0('ctl.paso', { n: i + 1, total: pasos.length });
    tituloPaso.textContent = T(`${p.def.id}.titulo`);
    while (texto.firstChild) texto.removeChild(texto.firstChild);
    const dicho = p.texto ?? T(`${p.def.id}.texto`);
    for (const parte of partesNegrita(dicho)) el(parte.negrita ? 'strong' : 'span', {}, texto, parte.texto);
    masTexto.textContent = p.mas ?? T(`${p.def.id}.mas`);
    detalles.open = false;
    recuerda.hidden = i !== pasos.length - 1;
    lienzo.setAttribute('aria-label', `${titulo}. ${tituloPaso.textContent}: ${sinMarcas(dicho)}`);
    puntos.forEach((b, n) => { b.setAttribute('aria-current', n === i ? 'step' : 'false'); b.classList?.toggle?.('clase-e3d-punto-hecho', n < i); });
    ponerBotones();
  }
  function ponerBotones() {
    bAnterior.textContent = T0('ctl.anterior');
    bAnterior.disabled = i === 0;
    bSiguiente.textContent = T0(i + 1 >= pasos.length ? 'ctl.empezar' : 'ctl.siguiente');
    bPlay.textContent = T0(jugando ? 'ctl.pausa' : 'ctl.seguir');
    bVista.textContent = T0(mezclaMeta > 0.5 ? 'ctl.vista3' : 'ctl.vista1');
    bVista.setAttribute('aria-pressed', String(mezclaMeta > 0.5));
    bVista.disabled = Boolean(paso().sinAvion);
    bRepetir.textContent = T0('ctl.repetir');
  }
  function ir(n) {
    if (n < 0 || n >= pasos.length) return;
    const antes = orbita;
    i = n;
    t = jugando ? 0 : tQuieto(paso());
    // En una situación se queda la vista que eligió el alumno (cabina o afuera) al pasar a la consecuencia.
    if (!(opciones.ui === 'situacion' && vistaElegida != null)) { vistaElegida = null; mezclaMeta = paso().vista === '1p' && !paso().sinAvion ? 1 : 0; }
    orbitaDesde = antes ? { ...antes } : null;
    usuario.giro = 0; usuario.alto = 0; usuario.zoom = 1; usuario.mirar = 0;
    kOrbita = reducir || !orbitaDesde ? 1 : 0;
    if (reducir) mezcla = mezclaMeta;
    ponerTexto();
    pedir();
  }
  function repetir() {
    t = 0;
    if (!reducir && orbita) { orbitaDesde = { ...orbita, dist: orbita.dist * 1.35, alto: orbita.alto + 8 }; kOrbita = 0; }
    jugando = true;
    ponerBotones();
    pedir();
  }

  // ---------- cada cuadro ----------
  function medir() {
    const dpr = Math.max(1, (typeof devicePixelRatio === 'number' ? Math.min(2, Math.max(1, devicePixelRatio)) : 1) * calidad);
    const w = lienzo.clientWidth || 640, h = lienzo.clientHeight || Math.round(w * 0.62);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (W !== lienzo.width) { lienzo.width = W; cajasDom = null; }
    if (capa && capa.width !== W) capa.width = W;
    if (capa && capa.height !== H) capa.height = H;
    if (H !== lienzo.height) lienzo.height = H;
    ajustePx = Math.max(0.85, Math.min(1.15, w / 560));
    ancho = W; alto = H; escalaPx = dpr * ajustePx;
  }
  function camaras(p, avion) {
    const meta = metaOrbita(p, avion);
    let o = meta;
    if (kOrbita < 1 && orbitaDesde) {
      const e = suave3(kOrbita);
      o = { mira: mezclar3(orbitaDesde.mira, meta.mira, e), giro: mezclarAngulo(orbitaDesde.giro, meta.giro, e), alto: orbitaDesde.alto + (meta.alto - orbitaDesde.alto) * e,
        dist: orbitaDesde.dist * Math.pow(meta.dist / orbitaDesde.dist, e), fov: orbitaDesde.fov + (meta.fov - orbitaDesde.fov) * e };
    }
    orbita = { ...o, giro: o.giro + usuario.giro, alto: limitar(o.alto + usuario.alto, -5, 85), dist: o.dist * usuario.zoom };
    const ojo3 = ojoOrbita(orbita);
    const cam3 = crearCamara({ ojo: ojo3, mira: orbita.mira, fov: orbita.fov, cerca: orbita.dist * 0.004 });
    // Primera persona: desde el asiento, mirando por la nariz (con el alabeo); arrastrar mira a los lados.
    const b = baseAvion(avion.rumbo + usuario.mirar + (p.mirar ?? 0), avion.cabeceo * 0.6 + (p.inclinar ?? -3), avion.alabeo);
    const ojo1 = suma(avion.pos, por(b.U, escena.ojo1 ?? 0.002));
    const cam1 = crearCamara({ ojo: ojo1, mira: suma(ojo1, b.F), arriba: b.U, fov: escena.fov1 ?? 64, cerca: escena.cerca1 ?? 0.001 });
    return { cam3, cam1, cam: mezclarCamaras(cam3, cam1, suave3(mezcla)) };
  }
  function dibujar() {
    if (!ctx) return null;
    // El tema se lee al primer cuadro (al montar, la figura puede no estar todavía en la página).
    if (!paletaLeida && raiz.isConnected !== false) { paletaLeida = true; paleta = leerPaleta(raiz); }
    medir();
    const p = paso();
    // escena.tiempo: el reloj de la escena (una situación se detiene un momento en lo importante).
    const te = escena.tiempo ? escena.tiempo(p, t) : t;
    const avion = escena.ajustarAvion ? escena.ajustarAvion(p, avionDe(p, te), te) : avionDe(p, te);
    const { cam3, cam } = camaras(p, avion);
    const enEscena = vy === 1 ? avion : { ...avion, pos: [avion.pos[0], avion.pos[1] / vy, avion.pos[2]] };
    const extra0 = escena.cuadro({ paso: p, t: te, real: t, avion: enEscena, paleta, T, mezcla });
    const extra = { ...extra0, prims: estirar(extra0.prims ?? []), etiquetas: estirarE(extra0.etiquetas ?? []) };
    const prims = [...extra.prims]; // lo que cambia en cada cuadro (lo fijo va aparte: con WebGL se sube una sola vez)
    const ruta = rutaDe(p);
    if (ruta && mezcla < 0.9 && p.verRuta !== false) prims.push(linea(ruta.muestras.filter((_, n) => n % 3 === 0).map(m => m.p).concat(ruta.cerrada ? [ruta.muestras[0].p] : []), [255, 255, 255], { a: 0.45, w: 1.4, guion: [6, 6] }));
    // Las etiquetas no van debajo de la etiqueta de arriba ni de la ayuda.
    const evitar = [];
    // (se miden solo cuando cambian: leer el tamaño en cada cuadro obliga al navegador a rehacer la página)
    // 0.14.115: también el mini-mapa de una consecuencia (situacion3d.js lo pone en la caja): las etiquetas no van debajo.
    if (!cajasDom) cajasDom = [chip, ayuda, caja.querySelector?.('.clase-sit-mapa')].map(n => (n && !n.hidden && n.offsetWidth ? { n, x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight } : null)).filter(Boolean);
    for (const c of cajasDom) if (!(c.n === ayuda && (mezcla > 0.5 || ayuda.hidden))) evitar.push({ x: c.x * escalaPx / ajustePx, y: c.y * escalaPx / ajustePx, w: c.w * escalaPx / ajustePx, h: c.h * escalaPx / ajustePx });
    if (mezcla < 0.6 && escena.conAvion !== false && !p.sinAvion) {
      const d = largo(resta(cam3.ojo, avion.pos));
      const escala = escena.escalaFija ?? Math.max(p.escalaMin ?? 0, d * (escena.escalaAvion ?? 0.012));
      // Los alerones siguen al cambio de alabeo y el timón de profundidad al viraje y al cabeceo.
      const dt = t - tAnterior, alerones = dt > 0 && dt < 0.5 ? limitar(((avion.alabeo - alabeoAnterior) / dt) * 0.6, -18, 18) : 0;
      tAnterior = t; alabeoAnterior = avion.alabeo;
      const profundidad = limitar(Math.abs(avion.alabeo) / 6 + avion.cabeceo * 0.4, -15, 15);
      prims.push(...primitivasAvion({ ...avion, escala, helice: t * 140, t: te, alerones, profundidad, sombra: escena.sombra ? escena.sombra(avion.pos[0], avion.pos[2]) * vy : null }));
      // Las etiquetas no tapan el avión.
      const c = proyectar(cam, avion.pos, ancho, alto);
      if (c) { const r = (focal(cam, alto) * 5.5 * escala) / c.z; evitar.push({ x: c.x - r, y: c.y - r * 0.8, w: r * 2, h: r * 1.6 }); }
    }
    // En primera persona, solo lo importante (lo resaltado y lo del cuadro).
    const etiquetas = [...(delPaso(p).etiquetas ?? []).filter(e => mezcla < 0.6 || e.resaltada || e.cabina), ...extra.etiquetas];
    const d3 = orbita?.dist ?? 50;
    const n3 = { inicio: d3 * (escena.niebla3?.[0] ?? 0.7), fin: d3 * (escena.niebla3?.[1] ?? 2.8) };
    const n1 = escena.niebla1 ?? { inicio: 12, fin: 90 };
    const k = suave3(mezcla);
    const niebla = extra.niebla ? { ...extra.niebla, inicio: extra.niebla.inicio + d3 * (1 - k), fin: extra.niebla.fin + d3 * (1 - k) } : { color: paleta.niebla, inicio: n3.inicio + (n1.inicio - n3.inicio) * k, fin: n3.fin + (n1.fin - n3.fin) * k };
    if (!niebla.color) niebla.color = paleta.niebla;
    // Dentro de una nube (en la cabina) el cielo también es gris: no hay horizonte.
    const nub = (extra.nublado ?? 0) * k;
    const palR = nub > 0 ? { ...paleta, ...Object.fromEntries(['cieloAlto', 'cieloBajo', 'bruma', 'sueloLejos'].map(c => [c, mezclarColor(paleta[c], niebla.color, nub)])) } : paleta;
    const antes = extra.dibujar ? c => extra.dibujar(c, ancho, alto, escalaPx) : null;
    let r;
    if (gl3 && glPerdido) { r = { lista: [], etiquetas: [] }; }
    else if (gl3) {
      gl3.render({ paleta: palR, fijas: [fijo().prims, delPaso(p).prims], prims, niebla, sol: escena.sol, lejos: escena.lejos, texturaEscala: escena.texturaEscala }, cam, ancho, alto, { escala: escalaPx });
      ctx.clearRect(0, 0, ancho, alto);
      const panel = antes ? antes(ctx) : null;
      r = { lista: [], etiquetas: dibujarEtiquetas(ctx, etiquetas, cam, ancho, alto, { escala: escalaPx, paleta, evitar: panel ? [...evitar, panel] : evitar, niebla }) };
    } else r = render(ctx, { paleta: palR, prims: [...fijo().prims, ...delPaso(p).prims, ...prims], etiquetas, niebla, ambiente: paleta.ambiente, sol: escena.sol }, cam, ancho, alto, { escala: escalaPx, texturas, evitar, antes });
    const vistaAhora = mezcla > 0.5 ? '1p' : '3p', panelAhora = extra.dibujar ? '1' : '0';
    if (vistaAhora !== ultimaVista) { caja.setAttribute('data-vista', vistaAhora); ultimaVista = vistaAhora; }
    if (panelAhora !== ultimoPanel) { caja.setAttribute('data-panel', panelAhora); ultimoPanel = panelAhora; }
    if (mezcla > 0.55) {
      ctx.globalAlpha = limitar((mezcla - 0.55) / 0.4, 0, 1);
      dibujarCabina(ctx, ancho, alto, { kt: avion.kt, ft: extra.ft ?? (avion.pos[1] / vy) * escena.unidades.ftV, rumbo: avion.rumbo, alabeo: avion.alabeo, cabeceo: avion.cabeceo, vs: avion.subida ?? 0, aviso: Boolean(extra.aviso) }, { escala: escalaPx, textos: { kt: T0('ctl.cabina.kt'), ft: T0('ctl.cabina.ft') } });
      ctx.globalAlpha = 1;
      // El gráfico de la escena (el CDI) va encima de la cabina.
      if (extra.dibujar) extra.dibujar(ctx, ancho, alto, escalaPx);
    }
    // Lo que cubre toda la imagen (el destello de un rayo, la alarma, el hielo): al final, encima de todo.
    if (extra.encima) extra.encima(ctx, ancho, alto, escalaPx, mezcla);
    const chipTexto = extra.estado ?? '';
    if (chipTexto !== ultimoChip) { if (chipTexto.length !== ultimoChip.length) cajasDom = null; chip.textContent = chipTexto; chip.hidden = !chipTexto; ultimoChip = chipTexto; }
    const clase = extra.clase ?? '';
    if (clase !== ultimoClase) { chip.setAttribute('data-clase', clase); ultimoClase = clase; }
    return { ...r, avion, cam };
  }

  // Se dibuja solo mientras el lienzo se ve (no basta con que se vea el texto de abajo).
  const bucle = crearBucle(caja, dt => {
    if (jugando) t += dt;
    if (kOrbita < 1) kOrbita = Math.min(1, kOrbita + dt / 2.2);
    if (mezcla !== mezclaMeta) { const paso1 = dt / 1.3; mezcla = Math.abs(mezclaMeta - mezcla) <= paso1 ? mezclaMeta : mezcla + Math.sign(mezclaMeta - mezcla) * paso1; }
    const t0 = typeof performance === 'object' ? performance.now() : 0;
    dibujar();
    // Si dibujar tarda (un teléfono lento), menos píxeles; por la pantalla (30 Hz, ahorro de batería) no se baja.
    if (jugando && t0) {
      // (con WebGL lo que tarda es la GPU: también cuenta un cuadro que llega tarde)
      cuadros++; if (performance.now() - t0 > 12 || (gl3 && dt > 1 / 25)) lentos++;
      if (cuadros >= 45) { if (lentos > 30 && calidad > 0.75) calidad = 0.75; cuadros = 0; lentos = 0; }
    }
    if (!jugando && kOrbita >= 1 && mezcla === mezclaMeta && !arrastre) bucle.detener();
  });
  const pedir = () => bucle.iniciar();
  // Al agrandar o achicar el mini-mapa (se toca), se vuelve a medir lo que las etiquetas esquivan.
  caja.addEventListener?.('transitionend', () => { cajasDom = null; pedir(); });
  caja.addEventListener?.('click', () => { cajasDom = null; pedir(); });

  // ---------- el dedo, el ratón y el teclado ----------
  const toques = new Map();
  let arrastre = false, pellizco = 0;
  const tocar = () => { if (!ayuda.hidden) { ayuda.hidden = true; cajasDom = null; } };
  lienzo.addEventListener('pointerdown', e => {
    toques.set(e.pointerId, [e.clientX, e.clientY]);
    arrastre = true; tocar();
    try { lienzo.setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
    if (toques.size === 2) { const [a, b] = [...toques.values()]; pellizco = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    pedir();
  });
  lienzo.addEventListener('pointermove', e => {
    const antes = toques.get(e.pointerId);
    if (!antes) return;
    toques.set(e.pointerId, [e.clientX, e.clientY]);
    if (toques.size === 2) {
      const [a, b] = [...toques.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pellizco > 0) usuario.zoom = limitar(usuario.zoom * (pellizco / d), 0.35, 2.6);
      pellizco = d;
    } else {
      const dx = e.clientX - antes[0], dy = e.clientY - antes[1];
      if (mezcla > 0.5) usuario.mirar = limitar(usuario.mirar - dx * 0.25, -100, 100);
      else { usuario.giro -= dx * 0.35; usuario.alto += dy * 0.25; }
    }
  });
  const soltar = e => { toques.delete(e.pointerId); if (toques.size < 2) pellizco = 0; if (!toques.size) arrastre = false; pedir(); };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('wheel', e => { e.preventDefault(); tocar(); usuario.zoom = limitar(usuario.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 2.6); pedir(); }, { passive: false });
  // El dedo sobre el lienzo gira la escena: que no lo tome la tarjeta como «deslizar a la siguiente».
  for (const ev of ['touchstart', 'touchmove', 'touchend']) lienzo.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  lienzo.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'ArrowLeft') usuario.giro += 10; else if (k === 'ArrowRight') usuario.giro -= 10;
    else if (k === 'ArrowUp') usuario.alto += 5; else if (k === 'ArrowDown') usuario.alto -= 5;
    else if (k === '+' || k === '=') usuario.zoom = limitar(usuario.zoom * 0.85, 0.35, 2.6);
    else if (k === '-' || k === '_') usuario.zoom = limitar(usuario.zoom / 0.85, 0.35, 2.6);
    else return;
    e.preventDefault(); tocar(); pedir();
  });

  // ---------- tamaño y tema ----------
  let medidor = null, temaObs = null, temaMq = null;
  const alTema = () => { const nueva = leerPaleta(raiz); if (nueva !== paleta) { paleta = nueva; pedir(); } };
  if (typeof ResizeObserver === 'function') { medidor = new ResizeObserver(() => pedir()); medidor.observe(caja); }
  try {
    if (typeof MutationObserver === 'function' && document.documentElement) { temaObs = new MutationObserver(alTema); temaObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema', 'class'] }); }
    if (typeof matchMedia === 'function') { temaMq = matchMedia('(prefers-color-scheme: dark)'); temaMq.addEventListener?.('change', alTema); }
  } catch { /* sin tema en vivo */ }

  ponerTexto();
  if (reducir) { t = tQuieto(paso()); mezcla = mezclaMeta = paso().vista === '1p' ? 1 : 0; }
  else mezcla = mezclaMeta = paso().vista === '1p' ? 1 : 0;
  pedir();

  return {
    raiz,
    tiempo() {}, modo() {}, poner() {},
    pausar() { jugando = false; ponerBotones(); },
    reproducir() { jugando = true; ponerBotones(); pedir(); },
    ir, repetir,
    // Para las pruebas y la galería: ir a un paso y a un tiempo, en una vista, y dibujar ya (sin animación).
    // «mezcla» (0 a 1) deja la cámara a mitad de camino entre 3ª y 1ª persona; «transicion» (0 a 1), a mitad del viaje
    // desde la cámara del paso anterior (para probar los movimientos en una imagen quieta).
    fijar({ paso: n = i, tiempo = null, vista = null, mezcla: m = null, transicion = null } = {}) {
      const antes = orbita ? { ...orbita } : null;
      if (n !== i) { i = limitar(n, 0, pasos.length - 1); ponerTexto(); }
      jugando = false; kOrbita = 1; orbitaDesde = null;
      if (transicion != null && antes) { orbitaDesde = antes; kOrbita = limitar(transicion, 0, 1); }
      t = tiempo ?? tQuieto(paso());
      mezclaMeta = vista === '1p' ? 1 : vista === '3p' ? 0 : paso().vista === '1p' ? 1 : 0;
      mezcla = m != null ? limitar(m, 0, 1) : mezclaMeta;
      if (m != null) mezclaMeta = mezcla; // quieta a mitad de camino (para las capturas)
      ponerBotones();
      return dibujar();
    },
    dibujar,
    get estado() { return { paso: i, id: paso().id, t, jugando, vista: mezclaMeta > 0.5 ? '1p' : '3p', total: pasos.length }; },
    destruir() {
      bucle.destruir(); gl3?.liberar(); medidor?.disconnect(); temaObs?.disconnect(); temaMq?.removeEventListener?.('change', alTema);
      raiz.remove();
    },
  };
}
