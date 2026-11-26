// 0.14.98: el «Juego» (en el menú): Vuelo libre en 3D, con la cabina por dentro (los instrumentos vivos), la vista de
// afuera, el mini-mapa, el despegue y el aterrizaje (con su juez). Se carga solo aquí (import() desde app.js).
// Reusa el motor de las escenas 3D (clase/motor3d.js y motor3d-gl.js), el modelo de vuelo (clase/vuelo-modelo.js), la
// cabina (clase/cabina.js) y el mundo (clase/juego-mundo.js). Sin IA y sin pedir nada al servidor.
// Mandos: en la PC, el teclado; en el teléfono, un yugo para arrastrar y la palanca de potencia. «?» los muestra otra vez.
import { crearBucle, prefiereMenosMovimiento } from './clase/comun.js';
import { crearCamara, ojoOrbita, baseAvion, suma, por, render, crearTexturas, mezclarAngulo, proyectar } from './clase/motor3d.js';
import { crearRenderGL } from './clase/motor3d-gl.js';
import { PALETAS } from './clase/e3d-base.js';
import { dibujarCabina, dibujarLadoCabina, dibujarRelojesAfuera, geometriaCabina, FLAPS_GRADOS, flapsAGrados } from './clase/cabina.js';
import { activarToques, bloquearZoom } from './clase/juego-tactil.js';
import { crearAvion, pasoVuelo, juzgarToque, juzgarAmarizaje, lecturas, consejo, indicar, PISTA, PISTA_B, VUELO, LAGO, enAgua, LIMITES } from './clase/vuelo-modelo.js';
import { construirMundo, avionPropio, posicionAvion, alturaSuelo, luzAterrizaje, nubesConLuz, ESCALA_AVION, ALTO_RUEDAS } from './clase/juego-mundo.js';
import { sombraAvion, luzDeSombra, alturaSobreSuelo } from './clase/juego-suelo.js';
import { clasificarImpacto, listaDanos, danoAve, DANOS, AVES, PARTES_AVE } from './clase/juego-danos.js';
import { montarMinimapa } from './clase/e3d-minimapa.js';
import { cumulo } from './clase/e3d-base.js';
import { nubeTormenta } from './clase/e3d-efectos.js';
import { HECHOS_SITUACIONES } from './clase/e3d-situaciones.js';
import { fallaAceite } from './clase/vuelo-modelo.js';
import {
  FLUJO, crearFlujo, responderFlujo, tickFlujo, seguirFlujo, camaraDeAccion,
  JUEGO, poolDePreguntas, elegirPregunta, pedidoRespuesta, adaptarRespuesta, lineaPorque, consecuenciaDe, rafagaTurbulencia, azarSembrado,
  crearAgenda, siguienteEvento, vientoNuevo, vientoCruzado, puntuar, puntajeInicial,
} from './clase/juego-eventos.js';
import { GUIADO, RUTA_GUIADA, INICIO_GUIADO, crearGuiado, responderGuiado, maniobraDe, llego, piloto, pilotoFinal, enFinal, rumboHacia } from './clase/juego-guiado.js';
import { opcionesRevisadas } from './opciones-revision.js';
import { partesNegrita } from './clase/e3d-base.js';
import {
  paletaDe, solDe, conLuces, HORAS, lucesFijas, lucesExtremos, lucesSenda, faro, prima, lucesPueblos, crearTrafico, moverTrafico, primitivasTrafico,
  queVes, derechoDePaso, colorLuz,
} from './clase/juego-noche.js';
import { MINICLASES, miniclase, preguntaDePaso, AMARIZAJE_INICIO } from './clase/juego-miniclases.js';
import { traficoInicial, moverCualquiera, alertaTrafico, etiquetaAltura } from './clase/juego-trafico.js';
import { crearMotor, listaArranque, listaApagado, MOTOR_FAA, encenderMotor, apagarMotor, encenderTodo, mezclaAuto, lucesActivas, medirRunup, listaRunup, PASOS_RUNUP } from './clase/motor-piston.js';
import { crearPanelMotor, crearPalanca } from './clase/juego-panel-motor.js';
import { crearSonido } from './clase/juego-sonido.js';
import { TIEMPOS, TIEMPO_FAA, condiciones, cambioAltimetro, nubesDe, nivelTurbulencia, mangaDeViento, corrienteVertical, rafagaDe, vientoTexto } from './clase/juego-tiempo.js';
import { pintarDestello } from './clase/e3d-efectos.js';
import { crearRepeticion, escenaDeRepeticion, estadoRepeticion, camaraRepeticion, primitivasRepeticion, tomaEn, fundido, congelada, ENCUENTROS, CAMARAS } from './clase/juego-repeticion.js';
export { MINICLASES };
import { bola } from './clase/motor3d.js';

const RUTA = '#juego';
const CLAVE_AYUDA = 'academia.juego.ayuda-vista';
const NM = 6.076; // unidades por milla náutica
// El mini-mapa del juego (el de las consecuencias 3D): de cerca, la pista 36 con la línea de la aproximación (3 NM,
// discontinua) y el punto de tocar (TD, a 1,000 ft del umbral); de lejos, los dos aeropuertos y la línea de A a B.
const umbral = p => [p.x - Math.sin((p.rumbo * Math.PI) / 180) * p.largoFt / 2000, p.z - Math.cos((p.rumbo * Math.PI) / 180) * p.largoFt / 2000];
const haciaAtras = (p, d) => { const [x, z] = umbral(p), h = (p.rumbo * Math.PI) / 180; return [x - Math.sin(h) * d, z - Math.cos(h) * d]; };
const zonasPista = (p, conTexto) => [
  { tipo: 'aeropuerto', c: [p.x, p.z], rumbo: p.rumbo % 360, largo: p.largoFt / 1000 },
  { tipo: 'linea', puntos: [haciaAtras(p, 3 * NM), umbral(p)], clase: 'clase-sit-mapa-aproximacion' },
  { tipo: 'td', c: haciaAtras(p, -1), rumbo: p.rumbo % 360 },
  ...(conTexto ? [{ tipo: 'texto', c: [p.x + (p.rumbo % 360 ? 0 : 1.6), p.z + (p.rumbo % 360 ? 1.6 : 0)], texto: `${p.id} · ${p.nombre}`, clase: 'clase-sit-mapa-nombre' }] : []),
];
// 0.14.113: el lago (para el amarizaje), en azul en los dos mapas (no cambia lo que abarca el mapa).
const ZONA_LAGO = Object.freeze({ tipo: 'agua', c: [LAGO.x, LAGO.z], rx: LAGO.ax, rz: LAGO.az });
export const ZONAS_JUEGO = Object.freeze([ZONA_LAGO, ...zonasPista(PISTA, true)]);
export const MAPA_JUEGO = Object.freeze({ id: 'juego', unidades: { ftH: 1000 }, opciones: [], intro: { vuelo: { ruta: [[0, 0.3, -2 - 4 * NM], [0, 0.3, 2 + 2.5 * NM]] } } });
export const ZONAS_LAGO = Object.freeze([ZONA_LAGO, ...zonasPista(PISTA, true)]);
export const MAPA_LAGO = Object.freeze({ id: 'juego-lago', unidades: { ftH: 1000 }, opciones: [], intro: { vuelo: { ruta: [[LAGO.x, 1, AMARIZAJE_INICIO.z], [LAGO.x, 1, LAGO.z + LAGO.az]] } } });
export const ZONAS_LEJOS = Object.freeze([ZONA_LAGO, ...zonasPista(PISTA, true), ...zonasPista(PISTA_B, true)]);
export const MAPA_LEJOS = Object.freeze({ id: 'juego-lejos', unidades: { ftH: 1000 }, opciones: [], intro: { vuelo: { ruta: [[PISTA.x, 1, PISTA.z - 6], [PISTA.x, 1, PISTA.z], [PISTA_B.x, 1, PISTA_B.z], [PISTA_B.x + 6, 1, PISTA_B.z]] } } });
// La distancia (NM) y el rumbo (°) de un punto a un aeropuerto: «Aeropuerto B · 12 NM · 045°».
export function haciaAeropuerto(a, p) {
  const dx = p.x - a.x, dz = p.z - a.z;
  return { nm: Math.hypot(dx, dz) / NM, rumbo: Math.round(((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360) || 360 };
}
// Vertical u horizontal: en Android/Chrome se puede bloquear (con pantalla completa); en el iPhone no: un consejo.
export function planOrientacion(quiere, { puedeBloquear = false } = {}) {
  if (quiere === 'horizontal') return puedeBloquear ? ['completa', 'bloquear'] : ['consejo'];
  return ['desbloquear', 'salir_completa'];
}

// Las teclas (en la PC). → qué mando mueve cada una.
export const TECLAS = Object.freeze({
  ArrowUp: ['cabeceo', -1], KeyW: ['cabeceo', -1], ArrowDown: ['cabeceo', 1], KeyS: ['cabeceo', 1],
  ArrowLeft: ['alabeo', -1], KeyA: ['alabeo', -1], ArrowRight: ['alabeo', 1], KeyD: ['alabeo', 1],
  ShiftLeft: ['potencia', 1], ShiftRight: ['potencia', 1], Equal: ['potencia', 1], NumpadAdd: ['potencia', 1],
  ControlLeft: ['potencia', -1], ControlRight: ['potencia', -1], Minus: ['potencia', -1], NumpadSubtract: ['potencia', -1],
});
// 0.14.117: el yugo en la pantalla (el teléfono): dónde quedó el dedo respecto de donde tocó primero (−1..1 en cada eje) →
// el mando, con una zona muerta chica en el centro (el pulso no mueve el avión) y una curva suave: cerca del centro, fino
// (para corregir un poco); hacia el borde, a fondo.
export const YUGO_TACTIL = Object.freeze({ zona: 0.06, expo: 0.5, suaveS: 0.08 });
export function curvaYugo(v, { zona = YUGO_TACTIL.zona, expo = YUGO_TACTIL.expo } = {}) {
  const a = Math.min(1, Math.abs(v));
  if (a <= zona) return 0;
  const x = (a - zona) / (1 - zona);
  return Math.sign(v) * ((1 - expo) * x + expo * x * x * x);
}
export const yugoDeToque = (dx, dy) => ({ alabeo: curvaYugo(dx), cabeceo: curvaYugo(dy) });
// El mando sigue al dedo con un poquito de inercia (sin saltos aunque el dedo salte entre cuadros).
export function suavizarYugo(antes, meta, dt, tau = YUGO_TACTIL.suaveS) {
  const k = Math.min(1, dt / tau);
  return { alabeo: antes.alabeo + (meta.alabeo - antes.alabeo) * k, cabeceo: antes.cabeceo + (meta.cabeceo - antes.cabeceo) * k };
}
// 0.14.117: la cámara de afuera (detrás del avión), como la de un video: sigue el rumbo con un poco de retraso, se
// inclina un tercio de lo que se inclina el avión (se siente el viraje sin marear), baja un poco al subir y sube al bajar
// (se ve la trayectoria) y en el suelo va más baja. Todo por segundos, no por cuadro (igual a 30 o a 60 cuadros por s).
export const CAMARA_AFUERA = Object.freeze({ giroS: 0.45, alturaS: 0.8, alabeoS: 0.5, alabeo: 0.33, alto: 9, altoSuelo: 6, porGamma: 0.6, dist: 0.075 });
export function seguirCamara(antes, a, dt, { reducir = false } = {}) {
  const C = CAMARA_AFUERA, k = s => (reducir ? 1 : 1 - Math.exp(-Math.max(0, dt) / s));
  const gammaG = ((a.gamma ?? 0) * 180) / Math.PI;
  const altoMeta = a.enSuelo ? C.altoSuelo : Math.max(3, Math.min(16, C.alto - gammaG * C.porGamma));
  // (0.14.119: sin el Asistente se puede alabear hasta dar la vuelta: la cámara se inclina a lo sumo como con 60°)
  const alabeoMeta = reducir ? 0 : (a.enSuelo ? 0 : Math.max(-60, Math.min(60, a.alabeo ?? 0))) * C.alabeo;
  const p = antes ?? { giro: a.rumbo, alto: altoMeta, alabeo: alabeoMeta };
  return { giro: mezclarAngulo(p.giro, a.rumbo, k(C.giroS)), alto: p.alto + (altoMeta - p.alto) * k(C.alturaS), alabeo: p.alabeo + (alabeoMeta - p.alabeo) * k(C.alabeoS) };
}
// El «arriba» de la cámara inclinada: el vertical girado hacia la derecha de la cámara.
export function arribaInclinado(giro, alabeo) {
  const g = (giro * Math.PI) / 180, b = (alabeo * Math.PI) / 180;
  return [Math.cos(g) * Math.sin(b), Math.cos(b), -Math.sin(g) * Math.sin(b)];
}
// 0.14.117: la vista de la cabina: cuánto mira hacia abajo (grados) para que el horizonte quede a unos 3/5 del parabrisas
// (arriba del tablero se ve el suelo delante: la pista en la final). fov: el vertical; tablero: la parte de abajo que tapa.
// 0.14.118: techo: la parte de arriba que tapa el techo tapizado (fracción): el horizonte, a 3/5 de lo que queda a la vista.
export function miradaCabina(fov, tablero, techo = 0) {
  const y = techo + 0.6 * (1 - tablero - techo); // dónde queda el horizonte (desde arriba, en fracción del alto)
  return (Math.atan((0.5 - y) * 2 * Math.tan((fov * Math.PI) / 360)) * 180) / Math.PI;
}
// 0.14.119 (el dueño: «que me deje mover la cámara fuera del avión… así puedo ver todo el avión cuando quiera»): la
// cámara libre. Afuera, arrastrar gira alrededor del avión (giro y altura que se suman a la de persecución) y el pellizco o
// la rueda acercan o alejan (zoom: un factor de la distancia); en la cabina, arrastrar gira la cabeza. Con límites: nunca
// debajo del suelo (además del control del suelo en camara()), nunca dentro del avión, la cabeza hasta donde gira una persona.
export const ORBITA = Object.freeze({ gradosPorPx: 0.35, altoPorPx: 0.25, altoMin: -4, altoMax: 75, zoomMin: 0.45, zoomMax: 3.5, distMin: 0.03,
  cabezaYaw: 150, cabezaPitchMin: -35, cabezaPitchMax: 60, cabezaPorPx: 0.25, vuelveS: 4, vuelveTau: 0.6 });
export const orbitaInicial = () => ({ giro: 0, alto: 0, zoom: 1, cabYaw: 0, cabPitch: 0 });
export const orbitaCentrada = o => Math.abs(o.giro) < 0.5 && Math.abs(o.alto) < 0.5 && Math.abs(o.zoom - 1) < 0.01 && Math.abs(o.cabYaw) < 0.5 && Math.abs(o.cabPitch) < 0.5;
const limO = (x, a, b) => Math.min(b, Math.max(a, x));
const n180o = g => ((((g % 360) + 540) % 360) - 180);
// Un arrastre (px) → la órbita nueva. cabina: gira la cabeza en lugar de la cámara de afuera.
export function arrastrarOrbita(o, dx, dy, { cabina = false } = {}) {
  if (cabina) return { ...o, cabYaw: limO(o.cabYaw - dx * ORBITA.cabezaPorPx, -ORBITA.cabezaYaw, ORBITA.cabezaYaw), cabPitch: limO(o.cabPitch + dy * ORBITA.cabezaPorPx, ORBITA.cabezaPitchMin, ORBITA.cabezaPitchMax) };
  return { ...o, giro: n180o(o.giro - dx * ORBITA.gradosPorPx), alto: limO(o.alto + dy * ORBITA.altoPorPx, -90, 90) };
}
export const zoomOrbita = (o, factor) => ({ ...o, zoom: limO(o.zoom * (Number.isFinite(factor) && factor > 0 ? factor : 1), ORBITA.zoomMin, ORBITA.zoomMax) });
// La cámara de persecución { giro, alto, dist } con la órbita encima (y sus límites).
export function aplicarOrbita(base, o) {
  return { giro: base.giro + o.giro, alto: limO(base.alto + o.alto, ORBITA.altoMin, ORBITA.altoMax), dist: Math.max(ORBITA.distMin, base.dist * o.zoom) };
}
// Una cámara cualquiera (de la repetición) que mira a «mira»: su ojo, girado alrededor de «mira» con la órbita.
export function orbitarOjo(ojo, mira, o) {
  const v = [ojo[0] - mira[0], ojo[1] - mira[1], ojo[2] - mira[2]], d = Math.hypot(...v) || ORBITA.distMin;
  const alto = (Math.asin(limO(v[1] / d, -1, 1)) * 180) / Math.PI, giro = (Math.atan2(-v[0], -v[2]) * 180) / Math.PI;
  const r = aplicarOrbita({ giro, alto, dist: d }, o), g = (r.giro * Math.PI) / 180, a = (r.alto * Math.PI) / 180;
  return [mira[0] - Math.sin(g) * Math.cos(a) * r.dist, mira[1] + Math.sin(a) * r.dist, mira[2] - Math.cos(g) * Math.cos(a) * r.dist];
}
// Vuelve sola al centro (si se eligió en «Menú»): después de unos segundos sin tocar, suave (o de una vez, con menos movimiento).
export function volverOrbita(o, dt, { reducir = false } = {}) {
  const k = reducir ? 1 : 1 - Math.exp(-Math.max(0, dt) / ORBITA.vuelveTau);
  return { giro: o.giro * (1 - k), alto: o.alto * (1 - k), zoom: 1 + (o.zoom - 1) * (1 - k), cabYaw: o.cabYaw * (1 - k), cabPitch: o.cabPitch * (1 - k) };
}

// 0.14.118: el viento a mano (en «Menú»): de dónde (8 rumbos) y cuánto; y los flaps de a una muesca (UP → 10 → 20 → 30 → UP).
export const VIENTO_RUMBOS = Object.freeze([[360, 'n'], [45, 'ne'], [90, 'e'], [135, 'se'], [180, 's'], [225, 'so'], [270, 'o'], [315, 'no']]);
export const VIENTO_KT = Object.freeze([0, 5, 10, 15, 20, 25]);
export const siguienteFlaps = f => { const g = flapsAGrados(f); return g >= 30 ? 0 : (g + 10) / 20; };
export const anteriorFlaps = f => { const g = flapsAGrados(f); return g <= 0 ? 0 : (g - 10) / 20; };
// El viento parejo con sus ráfagas (hasta «rafagaKt», que suben y bajan sin ritmo fijo; nunca por debajo del parejo).
// 0.14.119: las ráfagas son un interruptor aparte (rafagaDe en juego-tiempo.js), con cualquier viento y cualquier tiempo.
export function vientoConRafagas(v, rafagaKt, t) {
  if (!v) return { desde: 360, kt: 0 };
  const g = Math.max(v.kt, Number.isFinite(rafagaKt) ? rafagaKt : v.kt);
  return { desde: v.desde, kt: v.kt + (g - v.kt) * Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 1.9 + 0.4)) };
}

// Los mandos con las teclas apretadas: el yugo va hacia ±1 (y vuelve al centro al soltar), la potencia sube o baja.
export function mandosDeTeclas(apretadas, antes, dt) {
  const meta = { cabeceo: 0, alabeo: 0 };
  let potencia = 0;
  for (const k of apretadas) { const m = TECLAS[k]; if (!m) continue; if (m[0] === 'potencia') potencia += m[1]; else meta[m[0]] = Math.max(-1, Math.min(1, meta[m[0]] + m[1])); }
  const ir = (a, b) => (Math.abs(b - a) <= dt * 4 ? b : a + Math.sign(b - a) * dt * 4);
  return { cabeceo: ir(antes.cabeceo, meta.cabeceo), alabeo: ir(antes.alabeo, meta.alabeo), potencia: Math.max(0, Math.min(1, antes.potencia + potencia * dt * 0.6)) };
}

// Cómo empieza cada vuelo: 'libre' en la cabecera de la 36 (motor en ralentí) o 'final' a 3 NM, alineado, a 950 ft.
// 0.14.103: { enFrio: true } empieza con el motor apagado y todo en OFF (para arrancarlo); si no, en marcha.
export const PARQUEO = Object.freeze({ x: 0.22, z: -1.35, rumbo: 360, ft: 0, enSuelo: true });
export function inicioDe(modo, { enFrio = false } = {}) {
  if (modo === 'preguntas') return { ...crearAvion({ ...INICIO_GUIADO, enSuelo: false, potencia: 0.65 }), pist: crearMotor() };
  if (modo === 'final') {
    const a = crearAvion({ x: 0, z: -PISTA.largoFt / 2000 - 3 * NM, ft: 950, kt: 68, potencia: 0.2, enSuelo: false, flaps: 1 });
    return { ...a, gamma: -0.052, cabeceo: -1, rpm: 1700, pist: crearMotor() };
  }
  // 0.14.105: el «Panel del motor (practicar)»: estacionado junto a la pista, con todo apagado.
  if (modo === 'motor') return { ...crearAvion(PARQUEO), rpm: 0, aceitePsi: 0, pist: crearMotor({ enMarcha: false }) };
  const a = crearAvion({ x: 0, z: -PISTA.largoFt / 2000 + 0.15 });
  return enFrio ? { ...a, rpm: 0, aceitePsi: 0, pist: crearMotor({ enMarcha: false }) } : { ...a, pist: crearMotor() };
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
        opcion(`${RUTA}/final`, 'flecha', t('juego.final'), t('juego.final.detalle')),
        opcion(`${RUTA}/clases`, 'bombilla', t('juego.clases'), t('juego.clases.detalle')),
        opcion(`${RUTA}/motor`, 'motor', t('juego.motor.practica'), t('juego.motor.practica.detalle'))),
      el('p', { class: 'suave chica', texto: t('juego.libre.nota') }))));
}

// ---------- 0.14.100: las mini-clases (#juego/clases) ----------
export function pantallaMiniclases(h) {
  const { el, t, icono, mostrar, marco } = h;
  mostrar(marco('juego',
    el('a', { class: 'boton-enlace secundario con-icono', href: RUTA }, icono('flecha', 'icono chico volver-flecha'), el('span', { texto: t('juego.volver') })),
    el('section', { class: 'juego-portada' },
      el('h1', { class: 'titulo-grande con-icono' }, icono('bombilla'), el('span', { texto: t('juego.clases') })),
      el('p', { class: 'bajada', texto: t('juego.clases.linea') }),
      el('div', { class: 'juego-opciones' }, MINICLASES.map(m => el('a', { class: 'juego-opcion', href: m.escena ? `${RUTA}/escena/${m.escena}` : `${RUTA}/clase/${m.id}` },
        el('span', { class: 'juego-opcion-icono', 'aria-hidden': 'true' }, icono(m.icono)),
        el('span', { class: 'juego-opcion-texto' }, el('strong', { texto: t(`juego.mc.${m.id}.titulo`) }), el('span', { texto: t(`juego.mc.${m.id}.linea`) }))))))));
}
// Una escena 3D de las clases, tal cual (espacio aéreo, mínimos VFR, frentes), con «Volver a las mini-clases».
export async function pantallaEscenaJuego(h, id) {
  const { el, t, icono, mostrar, marco } = h;
  const lugar = el('div', { class: 'juego-escena' });
  mostrar(marco('juego',
    el('a', { class: 'boton-enlace secundario con-icono', href: `${RUTA}/clases` }, icono('flecha', 'icono chico volver-flecha'), el('span', { texto: t('juego.clases.volver') })),
    lugar));
  const { montarEscena3d } = await import('./clase/escena3d.js');
  if (lugar.isConnected) montarEscena3d(lugar, { escena: id }, { t });
}

// ---------- el vuelo ----------
export function montarVuelo(h, { modo = 'libre', clase = null } = {}) {
  const { el, t, icono, mostrar } = h;
  const guiado0 = modo === 'preguntas';
  const mc = modo === 'clase' ? miniclase(clase) : null;
  const reducir = prefiereMenosMovimiento();
  const tactil = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  const boton = (clase, texto, alPulsar, extra = {}) => el('button', { type: 'button', class: `juego-boton ${clase}`, onclick: alPulsar, ...extra }, texto);

  // ---- la página ----
  const lienzo = el('canvas', { class: 'juego-lienzo', role: 'img', 'aria-label': t('juego.lienzo') });
  const capa = el('canvas', { class: 'juego-capa', 'aria-hidden': 'true' });
  const chip = el('p', { class: 'juego-chip', role: 'status', 'aria-live': 'polite' });
  // 0.14.118: los datos del vuelo en la vista de afuera: un panel chico (abajo a la izquierda), no una línea suelta.
  const hudCeldas = ['kt', 'ft', 'rumbo', 'vs'].map(k => el('span', { class: 'juego-hud-dato', 'data-dato': k }));
  // 0.14.121: y los relojes (el velocímetro con sus arcos, la actitud, el altímetro y el variómetro), del mismo dibujo que la cabina.
  const hudLienzo = el('canvas', { class: 'juego-hud-lienzo', role: 'img', 'aria-label': t('juego.instrumentos') });
  const hud = el('div', { class: 'juego-hud', 'aria-hidden': 'true' }, hudLienzo, el('div', { class: 'juego-hud-texto' }, hudCeldas));
  // 0.14.118 (pedido del dueño: «mejora estos botones… a veces no abren»): botones sólidos, con relieve, la lucecita verde
  // en los que se prenden y que responden al primer toque (también con el otro dedo en el yugo: clase/juego-tactil.js).
  // La cámara («Cabina 1/2») arriba a la izquierda; arriba a la derecha, la pausa y «Menú» (la hora, el tráfico, el sonido,
  // el tiempo y el viento, en una hoja que se desplaza y se cierra).
  const bVista = boton('juego-vista juego-camara', '', () => cambiarVista());
  // 0.14.119: «Centrar» (aparece con la cámara girada) y, en el Menú, que la cámara vuelva sola (apagado al empezar).
  const bCentrar = boton('juego-centrar', t('juego.camara.centrar'), () => centrarCamara());
  const bVuelve = boton('juego-vuelve juego-luz', t('juego.camara.vuelve'), () => { orbitaVuelve = !orbitaVuelve; pintarBotones(); }, { 'aria-pressed': 'false' });
  const bPanelGrande = boton('juego-panel-grande juego-luz', t('juego.panel_grande'), () => { panelGrande = !panelGrande; pintarBotones(); }, { 'aria-pressed': 'false' });
  const bAgl = boton('juego-agl-boton juego-luz', t('juego.agl.boton'), () => { aglModo = !aglVisible(); pintarBotones(); }, { 'aria-pressed': 'false' });
  const bTenues = boton('juego-tenues juego-luz', t('juego.mandos_tenues'), () => { mandosTenues = !mandosTenues; pintarBotones(); }, { 'aria-pressed': 'false' });
  const botonesInstr = ['chicos', 'grandes', 'texto'].map(id => boton('juego-instr juego-luz', t(`juego.instrumentos.${id}`), () => { instrumentosAfuera = id; pintarBotones(); }, { 'data-instr': id, 'aria-pressed': 'false' }));
  const bAsistente = boton('juego-asistente juego-luz', t('juego.asistente'), () => { asistente = !asistente; pintarBotones(); }, { 'aria-pressed': 'true' });
  const bFlaps = boton('juego-flaps', t('juego.flaps'), () => ponerFlaps(siguienteFlaps(mandos.flaps)), { 'aria-pressed': 'false' });
  const bPausa = boton('juego-pausa', '', () => pausar(!pausado), { 'aria-pressed': 'false', 'aria-label': t('juego.pausa') });
  const bAyuda = boton('juego-ayuda-boton', '?', () => abrirAyuda(), { 'aria-label': t('juego.ayuda.abrir') });
  const botonesHora = HORAS.map(id => boton('juego-hora-opcion juego-luz', t(`juego.hora.${id}`), () => ponerHora(id), { 'data-hora': id, 'aria-pressed': 'false' }));
  const salir = el('a', { class: 'juego-boton juego-salir', href: RUTA, 'aria-label': t('juego.salir') }, icono('cerrar'));
  const marcador = el('p', { class: 'juego-marcador', 'aria-live': 'polite' });
  const bMas = boton('juego-mas', t('juego.menu'), () => abrirMenu(menuMas.hidden), { 'aria-label': t('juego.mas'), 'aria-expanded': 'false', 'aria-haspopup': 'dialog' });
  const bTrafico = boton('juego-trafico-boton juego-luz', '', () => { conTrafico = !conTrafico; pintarBotones(); }, { 'aria-pressed': 'true' });
  const bSonido = boton('juego-sonido-boton juego-luz', '', () => cambiarSonido(), { 'aria-pressed': 'false' });
  const botonesTiempo = TIEMPOS.map(id => boton('juego-tiempo-opcion juego-luz', t(`juego.tiempo.${id}`), () => ponerTiempo(id), { 'data-tiempo': id, 'aria-pressed': 'false' }));
  // El viento a mano: de dónde (8 rumbos), cuánto (0 a 25 kt) y con ráfagas; «Según el tiempo» vuelve al del tiempo elegido.
  const bVientoAuto = boton('juego-viento-auto juego-luz', t('juego.viento.auto'), () => ponerViento(null), { 'aria-pressed': 'true' });
  const botonesVientoDir = VIENTO_RUMBOS.map(([d, k]) => boton('juego-viento-dir juego-luz', t(`juego.viento.${k}`), () => ponerViento({ desde: d }), { 'data-desde': String(d), 'aria-pressed': 'false', 'aria-label': t('juego.viento.desde', { d: String(d).padStart(3, '0') }) }));
  const botonesVientoKt = VIENTO_KT.map(kt => boton('juego-viento-kt juego-luz', `${kt} kt`, () => ponerViento({ kt }), { 'data-kt': String(kt), 'aria-pressed': 'false' }));
  const bRafagas = boton('juego-rafagas juego-luz', t('juego.viento.rafagas'), () => { rafagasOn = !rafagasOn; tiempoPaso(); pintarViento(); }, { 'aria-pressed': 'false' });
  const vientoAhora = el('p', { class: 'juego-hoja-nota', 'aria-live': 'polite' });
  const bAyuda2 = boton('juego-ayuda2', `? ${t('juego.ayuda.abrir')}`, () => { abrirMenu(false); abrirAyuda(); });
  // (vertical u horizontal: en el teléfono, en la hoja)
  const bOrientacion = boton('juego-orientacion', '', () => { abrirMenu(false); cambiarOrientacion(); });
  const bCerrarMenu = boton('juego-hoja-cerrar', t('juego.menu.cerrar'), () => abrirMenu(false));
  // 0.14.123: los daños del avión (la lista) y los pájaros (apagados al empezar).
  const danosMenu = el('p', { class: 'juego-hoja-nota juego-danos-lista', 'aria-live': 'polite' });
  const bPajaros = boton('juego-pajaros juego-luz', t('juego.pajaros'), () => { pajarosOn = !pajarosOn; proximaBandada = tiempo + 8; pintarBotones(); }, { 'aria-pressed': 'false' });
  const tituloHoja = k => el('h3', { class: 'juego-menu-titulo', texto: t(k) });
  const menuMas = el('div', { class: 'juego-hoja-capa', hidden: true },
    el('div', { class: 'juego-hoja-fondo', 'aria-hidden': 'true', onclick: () => abrirMenu(false) }),
    el('section', { class: 'juego-hoja', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-hoja-titulo' },
      el('div', { class: 'juego-hoja-cabeza' }, el('h2', { id: 'juego-hoja-titulo', texto: t('juego.mas') }), bCerrarMenu),
      el('div', { class: 'juego-hoja-cuerpo juego-se-desplaza' },
        el('div', { class: 'juego-hoja-fila' }, bAyuda2, tactil ? bOrientacion : null, bTrafico, bPajaros, bSonido, bVuelve),
        el('div', { class: 'juego-hoja-fila' }, tactil ? bPanelGrande : null, tactil ? bTenues : null, bAgl),
        tituloHoja('juego.dano.titulo'), danosMenu,
        tituloHoja('juego.instrumentos'), el('div', { class: 'juego-hoja-fila' }, botonesInstr),
        tituloHoja('juego.menu.hora'), el('div', { class: 'juego-hoja-fila' }, botonesHora),
        tituloHoja('juego.tiempo'), el('div', { class: 'juego-hoja-fila' }, botonesTiempo),
        tituloHoja('juego.viento'), vientoAhora,
        el('div', { class: 'juego-hoja-fila' }, bVientoAuto, bRafagas),
        el('div', { class: 'juego-hoja-fila juego-rosa', role: 'group', 'aria-label': t('juego.viento.de_donde') }, botonesVientoDir),
        el('div', { class: 'juego-hoja-fila', role: 'group', 'aria-label': t('juego.viento.cuanto') }, botonesVientoKt))));
  // 0.14.103: el motor: master, magnetos, selector de combustible, mezcla, sus relojes y la lista del arranque o el apagado.
  // 0.14.118: «Componentes ⇧»: la pestaña abajo al centro abre el cajón (los interruptores con su luz).
  const bMotor = boton('juego-motor-boton juego-componentes', [icono('motor', 'icono'), el('span', { class: 'juego-motor-boton-texto', texto: t('juego.componentes') }), el('span', { class: 'juego-flecha', 'aria-hidden': 'true', texto: '⇧' })], () => abrirMotor(panelMotor.hidden), { 'aria-expanded': 'false', 'aria-label': t('juego.componentes') });
  const barra = el('div', { class: 'juego-barra' }, el('div', { class: 'juego-barra-izq' }, salir, bVista, bCentrar, marcador),
    el('div', { class: 'juego-barra-botones' }, bFlaps, bAsistente, bPausa, bMas, bAyuda));
  // La oferta («¿la tomas?») y el aviso (la respuesta, la falla, la radio): abajo de la escena, sin tapar la cabina entera.
  const oferta = el('section', { class: 'juego-oferta', hidden: true, role: 'alertdialog', 'aria-labelledby': 'juego-oferta-titulo' });
  const aviso = el('section', { class: 'juego-aviso', hidden: true, role: 'status', 'aria-live': 'polite' });
  // La mini-clase: su panel (arriba), con el paso, la idea clave, la fuente, la pregunta y los ajustes en vivo.
  const panelClase = el('section', { class: 'juego-clase', hidden: true, 'aria-live': 'polite' });
  // El subtítulo chico de la acción (nunca un panel grande; arriba a la izquierda, no sobre el horizonte artificial).
  const subtitulo = el('p', { class: 'juego-subtitulo', hidden: true, role: 'status', 'aria-live': 'polite' });
  const pildoraClase = el('button', { type: 'button', class: 'juego-boton juego-clase-pildora', hidden: true, onclick: () => { panelOculto = false; pintarClase(); } });
  // 0.14.103: la repetición («qué pasó», desde varias cámaras): la cámara, la frase del momento clave y «Saltar».
  const repeCamara = el('p', { class: 'juego-repe-camara', 'aria-live': 'off' });
  const repeLlamada = el('p', { class: 'juego-repe-llamada', role: 'status', 'aria-live': 'polite', hidden: true });
  const bSaltar = el('button', { type: 'button', class: 'juego-boton juego-repe-saltar', onclick: () => saltarRepeticion() }, t('juego.rep.saltar'));
  const capaRepe = el('div', { class: 'juego-repe', hidden: true }, repeCamara, repeLlamada, bSaltar);
  // 0.14.118: la segunda fila (debajo de los botones, sobre el techo de la cabina): el consejo, corto, a la izquierda; a la
  // derecha el panel de información (tiempo de vuelo, distancia, combustible y el aeropuerto al que se va).
  const infoTiempo = el('span', { class: 'juego-info-dato' }), infoDist = el('span', { class: 'juego-info-dato' });
  const infoComb = el('span', { class: 'juego-info-comb' }, el('span', { class: 'juego-info-barra' }, el('span', { class: 'juego-info-lleno' })), el('span', { class: 'juego-info-gal' }));
  const destino = el('p', { class: 'juego-destino', 'aria-live': 'off' });
  const infoViento = el('p', { class: 'juego-destino juego-info-viento' });
  const infoDanos = el('p', { class: 'juego-info-danos', hidden: true });
  const info = el('div', { class: 'juego-info', 'aria-hidden': 'true' }, el('div', { class: 'juego-info-fila' }, infoTiempo, infoDist, infoComb), destino, infoViento, infoDanos);
  const fila2 = el('div', { class: 'juego-fila2' }, el('div', { class: 'juego-fila2-izq' }, subtitulo, chip), info);
  // 0.14.122: la altura sobre el suelo (como un radioaltímetro) por debajo de 500 ft: distinta de la altitud del altímetro.
  const agl = el('p', { class: 'juego-agl', hidden: true, 'aria-live': 'off' });
  const escenario = el('div', { class: 'juego-escenario' }, lienzo, capa, barra, fila2, hud, agl, oferta, aviso, panelClase, pildoraClase, capaRepe, bMotor);

  // Los mandos en pantalla (teléfono y tableta), en dos paneles en los bordes: a la izquierda la palanca de potencia, la de
  // los flaps (UP · 10 · 20 · 30), el freno (mantener) y el freno de mano; a la derecha los atajos y el yugo con la rueda de
  // compensación. El centro queda libre para el avión y el horizonte.
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
  const muescas = FLAPS_GRADOS.map((g, k) => boton('juego-muesca', g ? `${g}°` : 'UP', () => ponerFlaps(k * 0.5), { 'data-f': String(k * 0.5), 'aria-pressed': 'false', 'aria-label': t('juego.flaps.a', { g: g ? `${g}°` : 'UP' }) }));
  const bFreno = el('button', { type: 'button', class: 'juego-boton juego-freno', 'data-propio': '1', 'aria-pressed': 'false' }, t('juego.freno'));
  const bFrenoMano = boton('juego-freno-mano juego-luz', t('juego.freno.mano'), () => { mandos.frenoMano = !mandos.frenoMano; pintarBotones(); }, { 'aria-pressed': 'false' });
  const bAsistente2 = boton('juego-asistente2 juego-luz', t('juego.asistente'), () => { asistente = !asistente; pintarBotones(); }, { 'aria-pressed': 'true' });
  const bMapa = boton('juego-mapa-boton juego-luz', t('juego.mapa'), () => { verMapa = !verMapa; pintarBotones(); dibujarMapa(); }, { 'aria-pressed': 'false' });
  const trimMarca = el('span', { class: 'juego-trim-marca', 'aria-hidden': 'true' });
  const bTrimAbajo = boton('juego-trim-b', '▲', () => moverTrim(-1), { 'aria-label': t('juego.trim.abajo') });
  const bTrimArriba = boton('juego-trim-b', '▼', () => moverTrim(1), { 'aria-label': t('juego.trim.arriba') });
  const mandosTactiles = el('div', { class: 'juego-mandos' },
    el('div', { class: 'juego-panel juego-panel-izq' },
      el('div', { class: 'juego-palancas' },
        el('div', { class: 'juego-potencia-caja' }, el('span', { class: 'juego-mando-nombre', texto: t('juego.potencia') }), potencia, textoPotencia),
        el('div', { class: 'juego-flaps-caja', role: 'group', 'aria-label': t('juego.flaps.nombre') }, el('span', { class: 'juego-mando-nombre', texto: t('juego.flaps.nombre') }), el('div', { class: 'juego-flaps-riel' }, muescas))),
      el('div', { class: 'juego-frenos' }, bFreno, bFrenoMano)),
    el('div', { class: 'juego-panel juego-panel-der' },
      el('div', { class: 'juego-atajos', role: 'group', 'aria-label': t('juego.atajos') }, bAsistente2, bMapa),
      el('div', { class: 'juego-yugo-marco' },
        el('div', { class: 'juego-yugo-caja' }, el('span', { class: 'juego-mando-nombre', texto: t('juego.yugo') }), yugo),
        el('div', { class: 'juego-trim-caja', role: 'group', 'aria-label': t('juego.trim') }, el('span', { class: 'juego-mando-nombre', texto: 'TRIM' }), bTrimAbajo,
          el('span', { class: 'juego-trim-escala', 'aria-hidden': 'true' }, el('span', { class: 'juego-trim-rueda' }), trimMarca), bTrimArriba))));

  // Cómo se vuela (la primera vez y con «?»).
  const ayuda = el('div', { class: 'juego-capa-dialogo', hidden: true },
    el('section', { class: 'juego-dialogo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-ayuda-titulo' },
      el('h2', { id: 'juego-ayuda-titulo', texto: t('juego.ayuda.titulo') }),
      el('p', { class: 'juego-meta', texto: t(modo === 'final' ? 'juego.ayuda.meta_final' : 'juego.ayuda.meta') }),
      tactil ? el('div', { class: 'juego-ayuda-dibujo', 'aria-hidden': 'true' },
        el('figure', { class: 'juego-mini' }, el('span', { class: 'juego-mini-potencia' }, el('span', { class: 'juego-mini-manija' })), el('figcaption', { texto: t('juego.ayuda.mini_potencia') })),
        el('figure', { class: 'juego-mini' }, el('span', { class: 'juego-mini-yugo' }, el('span', { class: 'juego-mini-perilla' })), el('figcaption', { texto: t('juego.ayuda.mini_yugo') }))) : null,
      el('ul', { class: 'juego-teclas' },
        (tactil ? ['yugo', 'tirar', 'potencia_tactil', 'flaps_tactil', 'freno_tactil', 'vista_tactil', 'camara_tactil'] : ['flechas', 'tirar_teclas', 'potencia_teclas', 'flaps_teclas', 'freno_teclas', 'vista_teclas', 'camara_teclas', 'pausa_teclas'])
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
        // 0.14.113: en una mini-clase, repetir el paso (el mismo vuelo, desde el principio).
        mc ? el('button', { type: 'button', class: 'boton-3d naranja juego-clase-repetir', onclick: () => repetirPasoClase() }, el('span', { texto: t('juego.clase.repetir') })) : null,
        el('button', { type: 'button', class: `boton-3d ${guiado0 ? 'blanco' : 'naranja'}`, onclick: () => reiniciar('final') }, el('span', { texto: t('juego.otra_final') })),
        el('button', { type: 'button', class: 'boton-3d blanco', onclick: () => reiniciar('libre') }, el('span', { texto: t('juego.otra_despegue') })),
        el('button', { type: 'button', class: 'boton-texto juego-seguir', onclick: () => { resultado.hidden = true; pausar(false); } }, el('span', { texto: t('juego.seguir') })))));

  // La pregunta (en el centro; el vuelo se detiene mientras se lee y se elige).
  const pregunta = el('div', { class: 'juego-capa-dialogo juego-capa-pregunta', hidden: true });
  const explicacion = el('div', { class: 'juego-capa-dialogo juego-capa-pregunta', hidden: true });
  const raiz = el('div', { class: 'juego-vuelo', 'data-vista': 'cabina', 'data-tactil': tactil ? '1' : '0', 'data-modo': modo }, escenario, mandosTactiles, menuMas, ayuda, resultado, pregunta, explicacion);
  mostrar(raiz);
  document.body.classList.add('juego-activo');
  // 0.14.118: los botones al primer toque (también con otro dedo en el yugo) y sin zoom mientras se vuela.
  const toques = activarToques(raiz);
  const sinZoom = bloquearZoom(document, raiz);

  // ---- el estado ----
  let avion = inicioDe(modo);
  const mandos = { cabeceo: 0, alabeo: 0, potencia: avion.potencia, flaps: avion.flaps, freno: 0, frenoMano: false };
  // 0.14.118: el viento elegido a mano (null: el del tiempo), el mapa a la vista (en el teléfono se abre con «Mapa»), la
  // turbulencia de ahora (0..1) y lo recorrido.
  let vientoManual = null, verMapa = !tactil, turbLeve = 0, recorridoNm = 0;
  // 0.14.119: la cámara libre (afuera, alrededor del avión; en la cabina, la cabeza) y si vuelve sola al centro.
  let orbita = orbitaInicial(), orbitaTocada = -1e9, orbitaVuelve = false;
  // 0.14.121: el tablero grande (en el teléfono de lado, si se quiere), los mandos tenues (hasta tocarlos) y cómo se ven los
  // datos del vuelo afuera ('chicos' | 'grandes' | 'texto').
  let panelGrande = false, mandosTenues = false, instrumentosAfuera = 'chicos', aglModo = null;
  // 0.14.123: los pájaros (bandadas cerca de los aeropuertos, bajo; más al atardecer).
  let pajarosOn = false, bandadas = [], proximaBandada = 30, nBandadas = 0;
  const aglVisible = () => (aglModo ?? asistente);
  // 0.14.119: las ráfagas (interruptor aparte), el viento de este momento (con ráfagas), las corrientes de la tormenta y los
  // avisos de los límites (G y VNE) y del motor que tose boca abajo.
  let rafagasOn = false, rafagaKt = 0, vientoActual = { desde: 360, kt: 0 }, corriente = 0, avisoG = -99, avisoVne = -99, vneS = 0, avisoTose = -99;
  // (0.14.117: el yugo táctil: donde tocó primero es el centro; cabeceo/alabeo, lo que pide el dedo; suave, lo que llega)
  const toque = { activo: false, cabeceo: 0, alabeo: 0, x0: 0, y0: 0, suave: { cabeceo: 0, alabeo: 0 } };
  const apretadas = new Set();
  let vista = 'cabina', asistente = true, pausado = false, tiempo = 0, volo = modo === 'final' || modo === 'preguntas', ultimoToque = -10, camAfuera = null, dtCuadro = 1 / 60;
  let hora = mc?.hora ?? (leerPaleta() === PALETAS.oscuro ? 'atardecer' : 'dia');
  let paleta = paletaDe(hora), mundo = construirMundo(paleta, { sol: solDe(hora) }), mundoLuces = lucesDelMundo(hora), ultimoConsejo = '', ultimoHud = '', relojHud = 0;
  // Las preguntas y los eventos (0.14.99).
  const azar = azarSembrado(Date.now() % 100000);
  let pool = [], usadas = new Set(), cargando = null, puntaje = puntajeInicial(), agenda = crearAgenda(azar);
  let ambiente = { viento: { desde: 360, kt: 0 } }, rafagaHasta = -1, rafaga = null, fallaDesde = null, decision = null;
  let extras = [], nubeFalla = null, desvioHasta = -1, abierta = false, ofertaReloj = 0, avisoReloj = 0;
  let guiado = guiado0 ? crearGuiado() : null, objetivo = null, enAproximacion = false, esperando = guiado0, retener = null, tormenta = null, modoActual = modo;
  if (guiado0) asistente = true;
  // El tráfico (los otros aviones) y la mini-clase.
  let trafico = mc || modo === 'motor' ? [] : traficoInicial(), conTrafico = true, proximoTrafico = 45, nTrafico = 0, pasoClase = 0, respondidaClase = null, panelOculto = false;
  // 0.14.102: el flujo de una pregunta (pregunta → acción → explicación), la mini-clase en acción y lo que marcan los relojes (con su retraso).
  let flujo = null, vistaAntes = null, accionClase = false, faseClase = 'leer', indicado = null, cabeza = { y: 0, x: 0 };
  // 0.14.103: el sonido, el tiempo y el arranque.
  const sonido = crearSonido();
  let dentroAvisado = false, ultimoDentro = -99, motorAndaba = true, cajonListo = false;
  // La repetición en curso (y con qué se armó, para «Ver otra vez» y «Cambiar cámara»); «sostener»: el piloto automático
  // que mantiene el rumbo y la altitud mientras se lee una pregunta o se mira la repetición (el mundo sigue, despacio).
  let repe = null, repeDatos = null, repeNube = [], sostener = null;
  let conSonido = false, tiempoMet = 'despejado', nubesTiempo = [], cond = condiciones('despejado', 0, 0, 0), ajuste = 29.92, ajusteDicho = null, relampago = 0, proximoRayo = 0, zonaAvisada = null, listaModo = 'arranque', guiaArranque = false;

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
  // 0.14.118: lo fijo de la cabina se guarda en lienzos aparte (se dibuja una vez); y hasta dónde baja el techo tapizado:
  // debajo de los botones y del consejo (que nunca tapan el parabrisas). Se mide cada tanto (no en cada cuadro).
  const crearLienzo = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  let techoMedido = 0;
  const FILA2_RESERVA = 50; // px: dos líneas del consejo (o el panel de información)
  const techoUI = () => techoMedido * escalaPx;
  function medirTecho() {
    const base = escenario.getBoundingClientRect().top;
    // (el lugar del consejo queda reservado para dos líneas: el techo no sube y baja con cada consejo ni con el que se esconde)
    let b = 0;
    for (const n of escenario.querySelectorAll(':scope > .juego-barra, :scope > .juego-fila2')) {
      if (!n.getClientRects().length) continue;
      const r = n.getBoundingClientRect();
      b = Math.max(b, r.bottom - base, n.classList.contains('juego-fila2') ? r.top - base + FILA2_RESERVA : 0);
    }
    techoMedido = Math.round(b + 6);
    medirReserva(base);
  }
  // 0.14.119: lo que tapan los mandos que flotan sobre la escena (en el teléfono): de lado, los dos costados; de pie, abajo.
  // La cabina acomoda sus relojes en lo que queda libre (el tablero sigue detrás de los mandos) y los paneles de vidrio
  // (datos, «Componentes») se ponen por encima.
  let reserva = { izq: 0, der: 0, abajo: 0 };
  function medirReserva(base0) {
    let r = { izq: 0, der: 0, abajo: 0 };
    if (tactil) {
      const e = escenario.getBoundingClientRect();
      const cajas = [...mandosTactiles.querySelectorAll(':scope > .juego-panel, :scope > .juego-runup')].filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect()).filter(q => q.width > 0 && q.height > 0);
      const lado = horizontal() && e.height <= 500;
      for (const q of cajas) {
        if (lado) { if (q.left - e.left < e.width / 2) r.izq = Math.max(r.izq, q.right - e.left + 4); else r.der = Math.max(r.der, e.right - q.left + 4); }
        else r.abajo = Math.max(r.abajo, e.bottom - q.top + 4);
      }
      r = { izq: Math.round(r.izq), der: Math.round(r.der), abajo: Math.round(r.abajo) };
    }
    void base0;
    if (r.izq !== reserva.izq || r.der !== reserva.der || r.abajo !== reserva.abajo) {
      reserva = r;
      raiz.style.setProperty('--reserva-abajo', `${r.abajo}px`); raiz.style.setProperty('--reserva-izq', `${r.izq}px`); raiz.style.setProperty('--reserva-der', `${r.der}px`);
    }
  }
  const reservaPx = () => ({ izq: reserva.izq * escalaPx, der: reserva.der * escalaPx, abajo: reserva.abajo * escalaPx });
  // 0.14.121 (el dueño: «mejora esa vista en primera persona, ya que no se ve tanto»): en el teléfono de lado, el ojo más bajo:
  // el tablero compacto (una fila de relojes; «Panel grande» en el Menú lo vuelve al de dos filas) y un campo un poco más ancho.
  const deLado = () => tactil && horizontal() && alto / Math.max(1, escalaPx) <= 500;
  const cabinaCompacta = () => deLado() && !panelGrande;
  const fovCabina = () => (ancho < alto ? 74 : deLado() ? 62 : 56);
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
      // (en las mini-clases para mirar, una vista acercada: la pista, el PAPI y las luces de lejos se distinguen)
      // (en las mini-clases, mc.fov es el campo horizontal: de pie, el vertical se agranda para mirar lo mismo)
      const fov = mc?.fov ? (ancho < alto ? (2 * Math.atan(Math.tan((mc.fov * Math.PI) / 360) * (alto / ancho)) * 180) / Math.PI : mc.fov) : fovCabina();
      const geo = geometriaCabina(ancho, alto, { escala: escalaPx, techo: techoUI(), reserva: reservaPx(), compacto: cabinaCompacta() });
      const tablero = Math.min(0.8, (alto - geo.yp) / Math.max(1, alto)), techoF = geo.techo / Math.max(1, alto);
      const b = baseAvion(avion.rumbo, avion.cabeceo - (mc?.fov ? 7 * (fov / 74) : miradaCabina(fov, tablero, techoF)), avion.alabeo);
      // La cabeza se mueve con los g (baja al tirar) y con la turbulencia (suave, sin marear).
      // (0.14.118: la turbulencia de siempre también sacude, suave; en la carrera, el traqueteo de las ruedas)
      const turb = tiempo < rafagaHasta ? 1 : Math.min(1, turbLeve * 2.5);
      const rueda = avion.enSuelo && avion.kt > 1 && !avion.agua ? Math.min(1, avion.kt / 45) * (Math.sin(tiempo * 23.3) * 0.6 + Math.sin(tiempo * 37.1) * 0.4) * 0.00003 : 0;
      const metaY = reducir ? 0 : -Math.max(-0.5, Math.min(2, (avion.g ?? 1) - 1)) * 0.00025 + turb * Math.sin(tiempo * 9.1) * 0.00012 + rueda;
      const metaX = reducir ? 0 : turb * Math.sin(tiempo * 6.3 + 1) * 0.00012;
      cabeza = { y: cabeza.y + (metaY - cabeza.y) * 0.15, x: cabeza.x + (metaX - cabeza.x) * 0.15 };
      const ojo = suma(suma(suma(pos, por(b.U, 0.0017 + cabeza.y)), por(b.F, 0.0016)), por(b.R, cabeza.x));
      // (0.14.119: la cabeza girada con la cámara libre: a un lado se ve la ventana del costado)
      const yw = (orbita.cabYaw * Math.PI) / 180, pt = (orbita.cabPitch * Math.PI) / 180;
      const dir = suma(suma(por(b.F, Math.cos(yw) * Math.cos(pt)), por(b.R, Math.sin(yw) * Math.cos(pt))), por(b.U, Math.sin(pt)));
      return crearCamara({ ojo, mira: suma(ojo, dir), arriba: b.U, fov, cerca: 0.0006 });
    }
    camAfuera = seguirCamara(camAfuera, avion, dtCuadro, { reducir });
    const o = aplicarOrbita({ giro: camAfuera.giro, alto: camAfuera.alto, dist: CAMARA_AFUERA.dist }, orbita), libre = !orbitaCentrada(orbita);
    const ojo = ojoOrbita({ mira: pos, ...o });
    if (ojo[1] < alturaSuelo(ojo[0], ojo[2]) + 0.003) ojo[1] = alturaSuelo(ojo[0], ojo[2]) + 0.003;
    return crearCamara({ ojo, mira: pos, arriba: arribaInclinado(o.giro, libre ? 0 : camAfuera.alabeo), fov: ancho < alto ? 62 : 50, cerca: 0.002 });
  }
  // 0.14.103: el cielo gris (con nubes, frentes o dentro de la capa).
  const mezclar = (a, b, k) => a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * Math.max(0, Math.min(1, k))));
  let paletaGris = null, claveGris = '';
  function paletaTiempo() {
    const k = cond.dentro ? 1 : cond.gris;
    if (!k) return paleta;
    const clave = `${hora}|${k.toFixed(2)}|${paleta.oscuro}|${tiempoMet}`;
    if (clave !== claveGris) {
      // (0.14.119: la tormenta, mucho más oscura)
      const g = paleta.oscuro ? [70, 76, 86] : tiempoMet === 'tormenta' ? [88, 94, 106] : [168, 174, 184];
      paletaGris = { ...paleta, cieloAlto: mezclar(paleta.cieloAlto, g, k), cieloBajo: mezclar(paleta.cieloBajo, g, k), bruma: mezclar(paleta.bruma, g, k), sueloLejos: mezclar(paleta.sueloLejos, g, k) };
      claveGris = clave;
    }
    return paletaGris;
  }
  const dentroSuelo = () => avion.enSuelo && avion.kt < 1 && cond.lluvia < 0.3;
  // La lluvia en el parabrisas: rayas cortas que bajan en diagonal (más con más velocidad).
  function pintarLluvia(k) {
    const n = Math.round(40 * k * Math.min(1.6, 0.5 + avion.kt / 100)), largo = (8 + avion.kt * 0.12) * escalaPx;
    ctx.save(); ctx.strokeStyle = 'rgba(210,220,235,0.45)'; ctx.lineWidth = 1.2 * escalaPx; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sx = ((i * 97.13 + tiempo * 310 * (1 + (i % 3))) % ancho + ancho) % ancho, sy = ((i * 53.7 + tiempo * 640) % (alto * 0.6) + alto * 0.6) % (alto * 0.6);
      ctx.moveTo(sx, sy); ctx.lineTo(sx - largo * 0.3, sy + largo);
    }
    ctx.stroke(); ctx.restore();
  }
  // Las luces del avión propio: las que están encendidas (con el MASTER).
  // (de noche, en la final, la luz de aterrizaje encendida: ilumina la pista)
  const conAterrizaje = (m, si) => (si ? { ...m, luces: { ...m.luces, aterrizaje: true } } : m);
  const lucesDe = a => (a.pist ? lucesActivas(a.pist) : { nav: true, baliza: true, estrobo: true });
  // La repetición se dibuja con el mismo dibujo: el avión de la escena en lugar del de verdad y la cámara de la toma.
  const tiempoRepe = () => (mc ? tAccion : flujo?.t ?? 0);
  function dibujar() {
    if (!repe) return dibujarMundo(null);
    const tr = Math.min(tiempoRepe(), repe.dur), { propio: p } = estadoRepeticion(repe, tr);
    const real = avion, vistaReal = vista, indicadoReal = indicado;
    avion = { ...real, x: p.x, z: p.z, ft: p.y * 1000, rumbo: p.rumbo, alabeo: p.alabeo, cabeceo: p.cabeceo, rpm: p.rpm, enSuelo: p.enSuelo, vs: 0, aviso: false, g: 1 };
    let cr = camaraRepeticion(repe, tr, ancho / Math.max(1, alto));
    // (0.14.119: la cámara libre también en la repetición: gira alrededor del avión propio)
    if (cr.toma !== 'cabina' && cr.toma !== 'arriba' && !orbitaCentrada(orbita)) {
      const mira = [p.x, p.y + 0.0027, p.z], ojo = orbitarOjo(cr.cam.ojo, mira, orbita);
      if (ojo[1] < alturaSuelo(ojo[0], ojo[2]) + 0.003) ojo[1] = alturaSuelo(ojo[0], ojo[2]) + 0.003;
      cr = { ...cr, cam: crearCamara({ ojo, mira, fov: cr.cam.fov, cerca: cr.cam.cerca }) };
    }
    vista = cr.toma === 'cabina' ? 'cabina' : 'afuera'; indicado = null;
    try { dibujarMundo({ t: tr, ...cr }); } finally { avion = real; vista = vistaReal; indicado = indicadoReal; }
    if (!ctx) return;
    // El corte entre tomas: un fundido corto a negro.
    const f = reducir ? 0 : fundido(repe, tr);
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${(0.85 * f).toFixed(3)})`; ctx.fillRect(0, 0, ancho, alto); }
  }
  function dibujarMundo(r) {
    medir();
    const cam = r ? r.cam : camara();
    const prims = r ? [...primitivasRepeticion(repe, r.t, { conPropio: r.toma !== 'cabina', conCaminos: r.toma !== 'cabina', toma: r.toma }), ...repeNube]
      : vista === 'afuera' ? avionPropio(avion, { t: tiempo, yugo: mandosAhora(), luces: lucesDe(avion), reducir }) : [];
    // 0.14.105: la luz de aterrizaje y la de rodaje (de noche se ve la pista iluminada), también desde la cabina.
    if (!r) { const la = lucesActivas(avion.pist ?? { master: true }); prims.push(...luzAterrizaje(avion, { aterrizaje: la.aterrizaje, rodaje: la.rodaje, suelo: alturaSuelo(avion.x, avion.z) }).filter(q => vista === 'afuera' || q.t !== 's')); }
    if (!r) prims.push(...lucesDinamicas(cam.ojo));
    // 0.14.122: la sombra del avión, en todas las cámaras (también desde la cabina, cerca del suelo).
    if (!r) prims.push(...sombraAvion(avion, { suelo: alturaSuelo, sol: solDe(hora), luz: luzDeSombra(hora, cond.gris, cond.dentro), escala: ESCALA_AVION, altoRuedas: ALTO_RUEDAS }));
    // Dentro de la nube (la falla «nube»): todo gris.
    // 0.14.103: dentro de la capa del menú «Tiempo», también (sin horizonte).
    const dentro = r ? Boolean(repe.nube && Math.hypot(avion.x - repe.nube.x, avion.ft / 1000 - repe.nube.y, avion.z - repe.nube.z) < repe.nube.r)
      : (nubeFalla && Math.hypot(avion.x - nubeFalla.x, avion.ft / 1000 - nubeFalla.y, avion.z - nubeFalla.z) < nubeFalla.r) || cond.dentro;
    const p = paletaTiempo();
    const gris = mezclar(p.niebla, tiempoMet === 'tormenta' ? [84, 90, 102] : [150, 156, 166], cond.gris);
    // (0.14.122: la bruma empieza más cerca y sube despacio: el suelo cercano nítido, el lejano más claro y apagado)
    const niebla = dentro ? { color: [200, 204, 212], inicio: 0, fin: 0.35 } : { color: gris, inicio: Math.min(6, cond.visibilidad * 0.12), fin: Math.min(62, cond.visibilidad) };
    const sol = solDe(hora);
    if (gl3) gl3.render({ paleta: p, fijas: [mundo, mundoLuces, extras, nubesTiempo], prims, niebla, sol, lejos: 300, texturaEscala: 0.35 }, cam, ancho, alto, { escala: escalaPx });
    else if (ctx2d) render(ctx2d, { paleta: p, prims: [...mundo, ...mundoLuces, ...extras, ...nubesTiempo, ...prims], etiquetas: [], niebla, sol, ambiente: p.ambiente }, cam, ancho, alto, { escala: escalaPx, texturas });
    if (!ctx) return;
    ctx.clearRect(0, 0, ancho, alto);
    if (cond.lluvia > 0.05 && !dentroSuelo()) pintarLluvia(cond.lluvia);
    let techo = alto;
    if (vista === 'cabina') {
      // Los relojes con su retraso de verdad (el variómetro sigue la tendencia).
      const L = lecturas({ ...avion, vs: indicado?.vs ?? avion.vs, ft: indicado?.ft ?? avion.ft });
      // La vibración del motor (muy poca) y la de la turbulencia.
      const vib = reducir ? 0 : ((avion.rpm ?? 0) / 2700) * 0.5 * escalaPx + (tiempo < rafagaHasta ? 1.5 * escalaPx : Math.min(1, turbLeve * 2) * 0.8 * escalaPx) + (avion.aviso ? 1.2 * escalaPx : 0) + (avion.enSuelo && avion.kt > 3 ? Math.min(1, avion.kt / 50) * 0.7 * escalaPx : 0);
      ctx.save();
      if (vib) ctx.translate(Math.sin(tiempo * 83) * vib, Math.cos(tiempo * 71) * vib);
      // (0.14.119: con la cabeza girada, la cabina dibujada se corre al otro lado: el tablero sale de la vista)
      if (!r && (orbita.cabYaw || orbita.cabPitch)) {
        const k = alto / fovCabina(); ctx.translate(-orbita.cabYaw * k, orbita.cabPitch * k);
        dibujarLadoCabina(ctx, ancho, alto, { escala: escalaPx, hora, techo: techoUI(), reserva: reservaPx(), lado: Math.abs(orbita.cabYaw) > 3 ? Math.sign(orbita.cabYaw) : 0 });
      }
      efectosVentana(ctx);
      const pm = avion.pist;
      techo = alto - dibujarCabina(ctx, ancho, alto, L, { escala: escalaPx, completo: true, yugo: mandosAhora(), textos: TEXTOS_PANEL(t), hora, techo: techoUI(), reserva: reservaPx(), compacto: cabinaCompacta(), crearLienzo,
        extras: { trim: Math.max(-1, Math.min(1, ((avion.trim ?? 4) - 4) / 7)), flaps: avion.flapsPos ?? avion.flaps, flapsMando: mandos.flaps, potencia: mandos.potencia, g: avion.enSuelo ? null : avion.g,
          grieta: avion.danos?.parabrisas ?? 0, egt: pm ? pm.egt ?? 100 : null, ff: pm?.flujoGph ?? 0, ajuste, mezcla: pm?.mezcla ?? 1, calor: Boolean(pm?.calor), magnetos: pm?.magnetos ?? 'BOTH', master: pm ? Boolean(pm.master) : true, luces: lucesDe(avion) } });
      ctx.restore();
    }
    // El rayo: un destello que se apaga solo.
    // (0.14.119: con «menos movimiento», sin destello: una claridad suave que se apaga despacio; los rayos, uno cada 3 s o más)
    if (relampago > 0) {
      if (reducir) { ctx.fillStyle = `rgba(230,236,255,${(0.12 * relampago).toFixed(3)})`; ctx.fillRect(0, 0, ancho, alto); relampago = Math.max(0, relampago - 0.02); }
      else { pintarDestello(ctx, ancho, alto, relampago); relampago = Math.max(0, relampago - 0.08); }
    }
    if (!r) marcasTrafico(cam, techo);
    if (vista === 'afuera' && !r && instrumentosAfuera !== 'texto') pintarRelojesAfuera();
    // La bocina de pérdida, vista: un borde rojo que late.
    if (avion.aviso && !avion.enSuelo) {
      const k = reducir ? 0.5 : 0.5 + 0.5 * Math.sin(tiempo * 12);
      const g = ctx.createRadialGradient(ancho / 2, alto / 2, Math.min(ancho, alto) * 0.35, ancho / 2, alto / 2, Math.max(ancho, alto) * 0.75);
      g.addColorStop(0, 'rgba(229,72,62,0)'); g.addColorStop(1, `rgba(229,72,62,${(0.35 * k).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, ancho, alto);
    }
  }
  // El brillo en el parabrisas (de día), el disco de la hélice y las gotas: muy sutil.
  function efectosVentana(c) {
    // 0.14.105: de noche y al atardecer, el brillo de las luces de las puntas de las alas a los costados del parabrisas
    // (ala alta: se ven a los lados), suave para no tapar al otro tráfico; y el destello de las estroboscópicas.
    const la = lucesDe(avion);
    if (conLuces(hora) && (la.nav || la.estrobo)) {
      const k = (mc && /luces/.test(mc.id) ? 0.6 : 1) * (hora === 'noche' ? 1 : 0.6);
      const brillo = (x, color, a) => {
        const g = c.createRadialGradient(x, alto * 0.3, 0, x, alto * 0.3, Math.min(ancho, alto) * 0.42);
        g.addColorStop(0, `rgba(${color},${(a * k).toFixed(3)})`); g.addColorStop(1, `rgba(${color},0)`);
        c.fillStyle = g; c.fillRect(0, 0, ancho, alto * 0.62);
      };
      if (la.nav) { brillo(0, '255,50,40', 0.38); brillo(ancho, '40,255,110', 0.34); }
      if (la.estrobo && tiempo % 1.3 < 0.08 && !reducir) { brillo(0, '255,255,255', 0.25); brillo(ancho, '255,255,255', 0.25); }
    }
    if (hora !== 'noche') {
      const g = c.createLinearGradient(ancho * 0.15, 0, ancho * 0.55, alto * 0.5);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, ancho, alto * 0.55);
    }
    if ((avion.rpm ?? 0) > 300) {
      // El disco de la hélice: un arco tenue abajo en el centro del parabrisas (con dos aspas borrosas que giran).
      const cx = ancho / 2, cy = alto * 0.56, R = Math.min(ancho, alto) * 0.42;
      c.save(); c.globalAlpha = Math.min(0.1, (avion.rpm / 2700) * 0.09);
      c.fillStyle = '#d8dde6'; c.beginPath(); c.ellipse?.(cx, cy, R, R * 0.28, 0, Math.PI, 2 * Math.PI); c.fill();
      c.restore();
    }
  }

  // ---- el mini-mapa: el de las consecuencias 3D (clase/e3d-minimapa.js), con la pista 36 y su eje extendido ----
  const cajaMapa = el('div', { class: 'juego-mapas' });
  // (el aeropuerto de destino va en el panel de información; aquí, el zoom)
  escenario.append(cajaMapa);
  const Tm = (k, v) => t(`clase.e3d.sit.ctl.${k}`, v);
  // (0.14.113: en la mini-clase del amarizaje, el mapa de cerca abarca desde el comienzo hasta el lago)
  const mapaCerca = mc?.mapa === 'lago' ? [MAPA_LAGO, ZONAS_LAGO] : [MAPA_JUEGO, ZONAS_JUEGO];
  const mapas = { cerca: montarMinimapa(cajaMapa, mapaCerca[0], { T: Tm, zonas: mapaCerca[1], decision: false }), lejos: montarMinimapa(cajaMapa, MAPA_LEJOS, { T: Tm, zonas: ZONAS_LEJOS, decision: false }) };
  let mapaLejos = false;
  const bZoom = el('button', { type: 'button', class: 'juego-boton juego-mapa-zoom', 'aria-label': t('juego.mapa.zoom'), onclick: () => { mapaLejos = !mapaLejos; pintarMapas(); } }, '±');
  cajaMapa.append(el('div', { class: 'juego-mapa-fila' }, bZoom));
  function pintarMapas() {
    mapas.cerca.nodo.hidden = mapaLejos; mapas.lejos.nodo.hidden = !mapaLejos;
    bZoom.setAttribute('aria-pressed', String(mapaLejos));
  }
  pintarMapas();
  function dibujarMapa() {
    const m = mapaLejos ? mapas.lejos : mapas.cerca;
    m.mover(avion.x, avion.z, avion.rumbo);
    m.marcas(conTrafico ? trafico.map(tr => ({ x: tr.x, z: tr.z, rumbo: tr.rumbo, texto: etiquetaAltura(avion, tr) })) : []);
    // El otro aeropuerto (o B, si se está en A): nombre, distancia y rumbo.
    const otro = Math.hypot(avion.x - PISTA.x, avion.z - PISTA.z) < Math.hypot(avion.x - PISTA_B.x, avion.z - PISTA_B.z) ? PISTA_B : PISTA;
    const d = haciaAeropuerto(avion, otro);
    const s = t('juego.destino', { id: otro.id, nm: d.nm < 10 ? d.nm.toFixed(1) : Math.round(d.nm), rumbo: String(d.rumbo).padStart(3, '0') });
    const s2 = tiempoMet === 'despejado' ? s : `${s} · ${t('juego.tiempo.oat', { c: Math.round(cond.temperatura) })}`;
    if (destino.textContent !== s2) destino.textContent = s2;
  }

  // ---- cada cuadro ----
  const yugoTocado = () => toque.activo || Math.abs(toque.suave.cabeceo) > 0.002 || Math.abs(toque.suave.alabeo) > 0.002;
  const mandosAhora = () => (yugoTocado() ? { ...toque.suave } : { cabeceo: mandos.cabeceo, alabeo: mandos.alabeo });
  function paso(dt) {
    toque.suave = suavizarYugo(toque.suave, toque.activo ? toque : { cabeceo: 0, alabeo: 0 }, dt);
    const k = mandosDeTeclas(apretadas, mandos, dt);
    mandos.cabeceo = k.cabeceo; mandos.alabeo = k.alabeo;
    if (apretadas.size && [...apretadas].some(x => TECLAS[x]?.[0] === 'potencia')) mandos.potencia = k.potencia;
    let m = { ...mandosAhora(), potencia: mandos.potencia, flaps: mandos.flaps, freno: mandos.freno || mandos.frenoMano ? 1 : 0 };
    if (guiado) m = mandosGuiados();
    if (sostener) m = { ...piloto(avion, sostener), flaps: mandos.flaps };
    // En una mini-clase «quieta» el avión propio no se mueve (para mirar); el reloj sigue (el faro, las luces) y, en la
    // acción, el otro avión sigue su camino (en el derecho de paso, el propio vira a la derecha).
    if (mc?.congelar) {
      traficoPaso(dt);
      if (!(accionClase && mc.id === 'derecho-paso')) return;
      m = piloto(avion, { rumbo: (mc.inicio.rumbo + 35) % 360, ft: mc.inicio.ft });
    }
    // La falla del aceite: la presión baja, la temperatura sube y el motor tose.
    if (fallaDesde != null) avion = { ...avion, ...fallaAceite(tiempo - fallaDesde) };
    tiempoPaso();
    // El motor: avisa cuando arranca y cuando se para (y por qué).
    const anda = avion.pist?.enMarcha ?? true;
    if (anda !== motorAndaba) {
      motorAndaba = anda;
      const tono = anda ? 'bien' : avion.enSuelo ? 'info' : 'mal';
      const titulo = t(anda ? 'juego.motor.arranco' : 'juego.motor.se_paro');
      const texto = anda ? t('juego.motor.arranco.aceite', { s: MOTOR_FAA.aceiteS }) : avion.pist?.motivo ? t(`juego.motor.paro.${avion.pist.motivo}`) : '';
      // Con el panel abierto, lo dice el panel (el aviso lo taparía); si no, el aviso.
      if (!panelMotor.hidden) cajon.decir(`${titulo} ${texto}`, tono);
      else if (anda || avion.pist?.motivo) mostrarAviso({ tono, titulo, partes: [texto], corto: anda || avion.enSuelo });
    }
    mezclaDelAsistente();
    // (0.14.118: entre ráfaga y ráfaga, la turbulencia de siempre: suave con buen tiempo, más con viento, nubes o tormenta)
    const amb = { viento: vientoActual, vertical: corriente, rafaga: tiempo < rafagaHasta ? rafaga : !mc && turbLeve > 0.005 ? rafagaLeve : null };
    const antes = avion;
    avion = pasoVuelo(avion, m, dt, { asistente: asistente || Boolean(sostener), ambiente: amb });
    recorridoNm += ((avion.velSuelo ?? 0) * dt) / 3600;
    if (limitesPaso(dt)) return;
    pajarosPaso(dt);
    // La práctica del motor: con el freno de estacionamiento (no se mueve) y midiendo las caídas de RPM de la prueba.
    if (modoActual === 'motor') {
      avion = { ...avion, x: PARQUEO.x, z: PARQUEO.z, rumbo: PARQUEO.rumbo, kt: 0, cabeceo: 0, alabeo: 0 };
      runup = medirRunup(runup, { rpm: avion.rpm, magnetos: avion.pist?.magnetos, calor: avion.pist?.calor, dt });
    }
    indicado = indicar(indicado, avion, dt);
    if (nubeFalla && tiempo > nubeFalla.hasta) { nubeFalla = null; extras = []; }
    if (!guiado) eventos();
    if (!mc?.congelar) traficoPaso(dt);
    if (!avion.enSuelo && avion.ft > 30) volo = true;
    // El relieve (lejos del aeropuerto): tocarlo es chocar.
    if (!avion.enSuelo && avion.ft / VUELO.ftPorUnidad < alturaSuelo(avion.x, avion.z)) avion = { ...avion, choque: true, kt: 0 };
    // (en el agua, el choque tiene su consejo: el del amarizaje)
    // 0.14.123: cada toque se clasifica: los daños parciales siguen (con sus consecuencias); solo lo imposible de
    // sobrevivir termina el vuelo.
    if (avion.toque && !avion.toque.agua) {
      const imp = clasificarImpacto(avion.toque, avion.danos);
      if (avion.choque && !antes.choque && !imp.fatal) avion = { ...avion, choque: false, kt: Math.max(0, avion.toque.kt * 0.5) };
      if (!avion.choque) { avion = { ...avion, danos: imp.danos }; if (imp.nuevos.length) avisarDanos(imp.nuevos); }
    }
    if (avion.choque && !antes.choque) return terminarVuelo(avion.toque?.agua ? juzgarAmarizaje(avion.toque, { choque: true }) : { nivel: 'choque', motivos: ['choque'], puntos: 0 }, avion.toque ?? null);
    if (avion.toque) sonido.evento('toque');
    if (avion.toque && volo && tiempo - ultimoToque > 3) {
      ultimoToque = tiempo;
      // 0.14.113: en el lago, el juez del amarizaje (nunca «fuera de la pista»).
      const juicio = juzgarToque(avion.toque, { choque: avion.choque });
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
    // Dentro de la nube, el consejo es salir (mientras se esté dentro).
    if (cond.dentro && !avion.enSuelo) {
      if (ultimoConsejo !== 'imc') { chip.textContent = t('juego.tiempo.imc.salir', { min: TIEMPO_FAA.nubes.viraje180Min, g: TIEMPO_FAA.nubes.tasaEstandar }); chip.setAttribute('data-tono', 'mal'); ultimoConsejo = 'imc'; }
    } else if (clave !== ultimoConsejo) {
      // (0.14.117: en el teléfono, el consejo que habla del yugo en lugar de las flechas, si lo hay)
      const tac = `juego.consejo.${clave}_tactil`, texto = tactil && t(tac) !== tac ? t(tac) : t(`juego.consejo.${clave}`);
      chip.textContent = texto; chip.setAttribute('data-tono', clave === 'perdida' || clave === 'choque' ? 'mal' : 'bien'); ultimoConsejo = clave; }
    const L = lecturas(avion);
    const linea = t('juego.hud', { kt: Math.round(L.kt), ft: Math.round(L.ft).toLocaleString('en-US'), rumbo: String(Math.round(L.rumbo) % 360 || 360).padStart(3, '0'), vs: Math.round(L.vs / 50) * 50 });
    if (linea !== ultimoHud) {
      ultimoHud = linea;
      // (0.14.118: en cuatro celdas: velocidad, altitud, rumbo y variómetro)
      linea.split(' · ').forEach((x, i) => { if (hudCeldas[i] && hudCeldas[i].textContent !== x) hudCeldas[i].textContent = x; });
    }
    pintarEstado(L);
    pintarMarcador();
    pintarClaseVivo();
  }
  // 0.14.113: el estado del vuelo, solo para leer (las pruebas en el navegador y la demostración): atributos
  // data-vuelo-* de la raíz, al ritmo del HUD (5 veces por segundo). Nada global; no cambia nada del vuelo.
  function pintarEstado(L) {
    const r1 = v => String(Math.round(v * 10) / 10);
    const d = { kt: r1(L.kt), ft: r1(L.ft), vs: String(Math.round(L.vs)), rumbo: r1(L.rumbo), cabeceo: r1(L.cabeceo), alabeo: r1(L.alabeo), x: String(Math.round(avion.x * 1000) / 1000), z: String(Math.round(avion.z * 1000) / 1000),
      'en-agua': enAgua(avion.x, avion.z) ? '1' : '0', flotando: avion.agua ? '1' : '0', 'en-suelo': avion.enSuelo ? '1' : '0', motor: (avion.pist?.enMarcha ?? avion.combustible > 0) ? '1' : '0',
      combustible: String(Math.round(avion.combustible * 1000) / 1000), potencia: r1(mandos.potencia * 100), flaps: String(mandos.flaps), asistente: asistente ? '1' : '0', choque: avion.choque ? '1' : '0', pausado: pausado ? '1' : '0' };
    for (const [k, v] of Object.entries(d)) if (raiz.getAttribute(`data-vuelo-${k}`) !== v) raiz.setAttribute(`data-vuelo-${k}`, v);
  }
  const bucle = crearBucle(raiz, dt => {
    dtCuadro = dt;
    if (orbitaVuelve && !dedosEscena.size && !orbitaCentrada(orbita) && performance.now() - orbitaTocada > ORBITA.vuelveS * 1000) { orbita = volverOrbita(orbita, dt, { reducir }); if (orbitaCentrada(orbita)) { orbita = orbitaInicial(); pintarBotones(); } }
    // En el vuelo con preguntas el piloto automático va 3 veces más rápido entre preguntas (no en la aproximación).
    const veces = guiado && !enAproximacion && !abierta && !flujo ? GUIADO.velocidadReloj : 1;
    if (!pausado && !abierta && !repe) for (let k = 0; k < veces; k++) { tiempo += dt; paso(dt); }
    // Con una pregunta abierta o la repetición: el avión sigue con el piloto automático, despacio (no se congela de golpe).
    else if (!pausado && sostener && !avion.enSuelo && !mc?.congelar) { tiempo += dt * 0.35; paso(dt * 0.35); }
    pintarRepe();
    relojes(dt);
    // La acción de una respuesta: dura unos segundos y después sale la explicación.
    if (flujo?.fase === 'accion' && !pausado) { flujo = tickFlujo(flujo, dt); if (flujo.fase === 'explicacion') mostrarExplicacion(); }
    if (mc && accionClase && !pausado) relojClase(dt);
    const t0 = typeof performance === 'object' ? performance.now() : 0;
    dibujar();
    if (conSonido) sonido.actualizar({ rpm: avion.rpm, enMarcha: avion.pist?.enMarcha ?? true, kt: avion.kt, aviso: avion.aviso && !avion.enSuelo,
      aspereza: Math.max(avion.rugido ?? 0, avion.pist?.aspereza ?? 0), girando: avion.pist?.girando, turbulencia: cond.turbulencia + (tiempo < rafagaHasta ? 0.5 : 0), lluvia: cond.lluvia });
    relojHud += dt;
    if (relojHud > 0.2) { relojHud = 0; pintarTextos(); dibujarMapa(); pintarMotor(); pintarRunup(); pintarInfo(); pintarDanos(); medirTecho(); envejecerConsejo(); colocarComponentes(); if (!menuMas.hidden) pintarViento(); }
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
    // Con mal tiempo, las preguntas son de meteorología.
    if (tiempoMet !== 'despejado' && e.tipo === 'pregunta') e.tema = 'meteo';
    if (e.tipo === 'cruzado') {
      vientoManual = null; ambiente = { ...ambiente, viento: vientoCruzado(azar) };
      mostrarAviso({ tono: 'info', titulo: t('juego.ev.cruzado.titulo'), partes: [t('juego.ev.cruzado', { desde: tresDigitos(ambiente.viento.desde), kt: ambiente.viento.kt })] });
      return;
    }
    if (e.tipo === 'tormenta') ponerTormenta();
    if (e.tipo === 'viento') { vientoManual = null; ambiente = { ...ambiente, viento: vientoNuevo(azar, ambiente.viento) }; }
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
    const contexto = e.contexto ? e.contexto : e.tipo === 'tormenta' ? t('juego.ev.tormenta', { nm: HECHOS_SITUACIONES.tormentas.evitarNM, fuente: 'AIM 7-1-27' })
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
  // 0.14.102 (pedido del dueño): 1) la pregunta, grande y sola (el vuelo quieto); 2) la tarjeta desaparece y el avión hace lo
  // que pide la respuesta (la maniobra o la falla), con la cámara mirándolo y solo un subtítulo chico; 3) la explicación.
  function abrirPregunta(item, e = null) {
    flujo = crearFlujo(item, e);
    sostener = avion.enSuelo ? null : { rumbo: avion.rumbo, ft: avion.ft };
    abierta = true; aviso.hidden = true; oferta.hidden = true; menuMas.hidden = true; bMas.setAttribute('aria-expanded', 'false'); raiz.setAttribute('data-menu', '0');
    while (pregunta.firstChild) pregunta.removeChild(pregunta.firstChild);
    const q = item.q;
    const botones = q.opciones.map(o => el('button', { type: 'button', class: 'juego-opcion-respuesta', 'data-letra': o.letra, onclick: () => responder(item, o.letra, botones) },
      el('span', { class: 'opcion-letra', texto: o.letra }), h.talCual ? h.talCual('span', o.texto, 'opcion-texto') : el('span', { texto: o.texto })));
    const quien = e?.quien ?? 'instructor';
    pregunta.append(el('section', { class: 'juego-dialogo juego-pregunta', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-q-titulo', 'data-fase': 'pregunta' },
      el('div', { class: 'juego-q-texto' },
        el('p', { class: 'juego-q-quien', id: 'juego-q-titulo', texto: guiado ? t('juego.q.tramo', { n: guiado.i + 1, total: guiado.total }) : t(`juego.oferta.${quien}`) }),
        h.talCual ? h.talCual('p', q.enunciado, 'juego-q-enunciado') : el('p', { class: 'juego-q-enunciado', texto: q.enunciado })),
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
    if (!res) { flujo = null; mostrarAviso({ tono: 'info', titulo: t('juego.q.sin_red'), partes: [t('juego.q.sin_red.texto')] }); if (guiado) saltarTramo(); return; }
    puntaje = puntuar(puntaje, res.acierto);
    const { consecuencia, subtitulo: texto } = aplicarConsecuencia(item, res);
    flujo = responderFlujo(flujo, res, consecuencia);
    // La acción: la repetición de lo que pasa por la respuesta, desde varias cámaras (y la frase del momento clave).
    empezarRepeticion({ escena: escenaDeRepeticion(consecuencia, item.categoria), encuentro: ENCUENTROS[puntaje.aceptadas % 4], acierto: res.acierto, inicio: { ...avion } });
    subtitulo.textContent = texto; subtitulo.hidden = true;
    if (pool.filter(p => !usadas.has(p.q.id)).length < 3) cargarPreguntas();
    if (reducir) saltarRepeticion();
  }
  function revisada(item, res) {
    return opcionesRevisadas(item.q.opciones, { correcta: res.correcta, elegida: res.elegida }, { el, t, talCual: h.talCual ?? ((tag, texto, clase) => el(tag, { class: clase, texto })) }, { clase: 'juego-revisadas' });
  }
  // Lo que hace la respuesta en el vuelo (sin tarjetas): → { consecuencia, subtitulo }
  function aplicarConsecuencia(item, res) {
    if (guiado) {
      guiado = responderGuiado(guiado, res.acierto);
      objetivo = guiado.fin === 'sin_vidas' ? RUTA_GUIADA.length - 1 : Math.min(guiado.i - 1, RUTA_GUIADA.length - 1);
      retener = null;
      if (res.acierto) {
        const mv = maniobraDe(avion, RUTA_GUIADA[objetivo]);
        return { consecuencia: 'bien', subtitulo: `${t('juego.q.bien', { n: JUEGO.puntosBien })} ${t('juego.maniobra', { que: mv.tipos.map(x => t(`juego.maniobra.${x}`)).join(t('juego.maniobra.y')) })}` };
      }
      const falla = guiado.falla;
      if (falla === 'nube') {
        const h0 = (avion.rumbo * Math.PI) / 180, x = avion.x + Math.sin(h0) * 1.1, z = avion.z + Math.cos(h0) * 1.1, y = avion.ft / 1000;
        nubeFalla = { x, y: y + 0.1, z, r: 0.75, hasta: tiempo + 14 };
        extras = cumulo({ x, z, base: y - 0.35, ancho: 1.6, alto: 0.9, semilla: 31 + guiado.fallas }).prims;
      } else if (falla === 'turbulencia') { rafaga = rafagaTurbulencia(1.3, guiado.fallas); rafagaHasta = tiempo + 9; }
      else desvioHasta = tiempo + 9;
      return { consecuencia: falla, subtitulo: t(`juego.falla.${falla}`) };
    }
    const cons = consecuenciaDe(item.categoria, res.acierto);
    if (cons === 'bien') return { consecuencia: 'bien', subtitulo: t('juego.q.bien', { n: JUEGO.puntosBien }) };
    if (cons === 'aceite') { if (fallaDesde == null) fallaDesde = tiempo - 12; return { consecuencia: 'aceite', subtitulo: t('juego.falla.aceite') }; }
    if (cons === 'turbulencia') {
      rafaga = rafagaTurbulencia(1, 2); rafagaHasta = tiempo + JUEGO.turbulenciaS;
      vientoManual = null; ambiente = { ...ambiente, viento: vientoNuevo(azar, ambiente.viento) };
      return { consecuencia: 'turbulencia', subtitulo: t('juego.falla.turbulencia') };
    }
    return { consecuencia: 'atc', subtitulo: t('juego.falla.atc.radio') };
  }
  // 4) La explicación: bien o mal, las opciones (la correcta en verde, la suya en rojo), «Por qué» (qué pasó y por qué) y la
  // fuente; «Seguir volando». El vuelo queda quieto mientras se lee.
  function mostrarExplicacion() {
    const f = flujo, item = f.item, res = f.res, cons = f.consecuencia;
    subtitulo.hidden = true; terminarRepeticion();
    if (vistaAntes && vistaAntes !== vista) cambiarVista();
    abierta = true;
    while (explicacion.firstChild) explicacion.removeChild(explicacion.firstChild);
    const porque = lineaPorque(res.sencilla);
    const paso = cons === 'bien' ? (guiado ? t('juego.exp.maniobra') : t('juego.exp.bien')) : t(`juego.exp.${cons}`, { desde: tresDigitos(ambiente.viento.desde), kt: ambiente.viento.kt });
    const botones = cons === 'aceite'
      ? [['juego.decide.aterrizar', () => { decision = 'aterrizar'; puntaje = { ...puntaje, decisiones: puntaje.decisiones + 1 }; seguirVolando(); }], ['juego.decide.seguir', () => { decision = 'seguir'; seguirVolando(); }]]
      : [['juego.exp.seguir', () => seguirVolando()]];
    explicacion.append(el('section', { class: `juego-dialogo juego-explicacion ${res.acierto ? 'bien' : 'mal'}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'juego-exp-titulo', 'data-fase': 'explicacion' },
      el('h2', { id: 'juego-exp-titulo', texto: res.acierto ? t('juego.q.bien', { n: JUEGO.puntosBien }) : t('juego.exp.mal') }),
      el('p', { class: 'juego-exp-paso', texto: paso }),
      revisada(item, res),
      el('div', { class: 'juego-exp-porque' }, el('strong', { texto: t('juego.exp.porque') }), el('span', { texto: ` ${porque || t('juego.exp.sin_porque')}` })),
      guiado && !res.acierto ? el('p', { class: 'juego-exp-vida', texto: t(guiado.fin === 'sin_vidas' ? 'juego.q.sin_vidas' : 'juego.q.vida', { n: guiado.vidas }) }) : null,
      el('p', { class: 'juego-exp-fuente', texto: t(item.fuente === 'oral' ? 'juego.exp.fuente_oral' : 'juego.exp.fuente_tg') }),
      el('div', { class: 'juego-exp-botones' }, botones.map(([clave, fn], k) => el('button', { type: 'button', class: `boton-3d ${k === 0 ? 'naranja' : 'blanco'}`, onclick: fn }, el('span', { texto: t(clave) })))),
      el('div', { class: 'juego-exp-repe' },
        el('button', { type: 'button', class: 'juego-boton juego-otra-vez', onclick: () => verOtraVez(0) }, t('juego.clase.otra_vez')),
        el('button', { type: 'button', class: 'juego-boton juego-cambiar-camara', onclick: () => verOtraVez(1) }, t('juego.rep.cambiar')))));
    explicacion.hidden = false;
    explicacion.querySelector('button')?.focus();
  }
  function seguirVolando() {
    flujo = seguirFlujo(flujo); flujo = null; sostener = null;
    explicacion.hidden = true; abierta = false; vistaAntes = null;
  }
  // El aviso (abajo de la escena): la respuesta, la falla o la radio. Con botones (una decisión) no se va solo.
  function mostrarAviso({ tono = 'info', titulo, partes = [], botones = null, radio = null, corto = false }) {
    // Con el panel del motor abierto, lo corto (el tráfico, el altímetro) lo dice el panel: el aviso lo taparía.
    if (corto && !botones && cajonListo && !panelMotor.hidden) {
      cajon.decir([radio ? `«${radio}»` : '', titulo, ...partes.filter(x => typeof x === 'string')].filter(Boolean).join(' '), tono); return;
    }
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
    avisoReloj = botones ? Infinity : corto ? 6 : tono === 'mal' ? 18 : 10;
    aviso.classList.toggle('juego-aviso-corto', corto);
  }
  // Los relojes de la pantalla (en tiempo real, también en pausa): la oferta se retira sola; el aviso se va solo.
  function relojes(dt) {
    if (!oferta.hidden && !pausado) { ofertaReloj -= dt; if (ofertaReloj <= 0) oferta.hidden = true; }
    if (!aviso.hidden && !pausado && !abierta) { avisoReloj -= dt; if (avisoReloj <= 0) aviso.hidden = true; }
    if (guiado && esperando && !abierta && !flujo && !pausado && resultado.hidden && !guiado.fin) {
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
  // 0.14.123: los daños: el aviso (qué pasó y qué hace un piloto de verdad), la lista del Menú y el indicador.
  // Las bandadas: aparecen adelante (a ~0.5 NM, a la altura del avión) cerca de los aeropuertos, por debajo de 3,000 ft AGL
  // (AIM 7-5-1: allí son más del 90 % de los choques); cruzan despacio. Si el avión pasa por el medio, un pájaro pega en el
  // parabrisas, en el borde de ataque de un ala o en el motor.
  function pajarosPaso(dt) {
    bandadas = bandadas.map(b => ({ ...b, x: b.x + b.vx * dt, z: b.z + b.vz * dt })).filter(b => Math.hypot(b.x - avion.x, b.z - avion.z) < 8);
    const agl = alturaSobreSuelo(avion, alturaSuelo), cerca = [PISTA, PISTA_B].some(p => Math.hypot(avion.x - p.x, avion.z - p.z) < 10);
    if (pajarosOn && modoActual === 'libre' && !mc && !avion.enSuelo && agl < AVES.bajoFt && cerca && tiempo > proximaBandada && bandadas.length < 3) {
      const h = (avion.rumbo * Math.PI) / 180, d = 3 + azar() * 0.6, lat = (azar() - 0.5) * 0.08;
      nBandadas++;
      bandadas.push({ id: nBandadas, x: avion.x + Math.sin(h) * d + Math.cos(h) * lat, z: avion.z + Math.cos(h) * d - Math.sin(h) * lat, y: avion.ft / 1000 + (azar() - 0.4) * 0.03,
        vx: Math.cos(h) * 0.03 * (azar() < 0.5 ? 1 : -1), vz: -Math.sin(h) * 0.03, n: 10 + Math.floor(azar() * 6), golpe: false, avisada: false });
      proximaBandada = tiempo + (hora === 'atardecer' ? 35 : 60) + azar() * 20;
    }
    for (const b of bandadas) {
      const dx = b.x - avion.x, dz = b.z - avion.z, dy = b.y - avion.ft / 1000, dist = Math.hypot(dx, dz);
      if (!b.avisada && dist < 1.6) { b.avisada = true; mostrarAviso({ tono: 'info', titulo: t('juego.pajaros.adelante'), partes: [], corto: true }); }
      if (!b.golpe && dist < 0.045 && Math.abs(dy) < 0.03) {
        b.golpe = true;
        const parte = PARTES_AVE[Math.floor(azar() * 3)], h = (avion.rumbo * Math.PI) / 180, lado = (dx * Math.cos(h) - dz * Math.sin(h)) >= 0 ? 1 : -1;
        avion = { ...avion, danos: danoAve(avion.danos, parte, lado) };
        avisarAve(parte);
      }
    }
  }
  function avisarAve(parte) {
    sonido.evento('toque');
    mostrarAviso({ tono: 'mal', titulo: t('juego.ave.titulo'), partes: [el('strong', { texto: t(`juego.ave.${parte}`) }), t('juego.ave.que'), t('juego.fuente', { f: AVES.fuente })] });
    pintarDanos();
  }
  function avisarDanos(ids) {
    sonido.evento('toque');
    mostrarAviso({ tono: 'mal', titulo: t('juego.dano.titulo'), partes: [el('strong', { texto: ids.map(id => t(`juego.dano.${id}`)).join(' · ') }), ...ids.map(id => t(`juego.dano.${id}.que`)), t('juego.fuente', { f: DANOS.fuente })] });
    pintarDanos();
  }
  function pintarDanos() {
    const l = listaDanos(avion.danos);
    const s1 = l.length ? l.map(id => t(`juego.dano.${id}`)).join(' · ') : t('juego.dano.ninguno');
    if (danosMenu.textContent !== s1) danosMenu.textContent = s1;
    const s2 = l.length ? t('juego.dano.cuantos', { n: l.length }) : '';
    if (infoDanos.textContent !== s2) { infoDanos.textContent = s2; infoDanos.hidden = !s2; }
    raiz.setAttribute('data-parabrisas', avion.danos?.parabrisas ? '1' : '0');
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

  // ---- 0.14.100: las luces (aeropuerto, PAPI/VASI, faro) y el tráfico ----
  function lucesDinamicas(ojo) {
    const out = [];
    if (conLuces(hora)) {
      for (const p of [PISTA, PISTA_B]) for (const l of lucesExtremos({ x: ojo[0], z: ojo[2] }, p)) out.push(prima(l, { r: 0.002, min: 1.1 }));
      const c = faro(tiempo);
      if (c) out.push(bola(FARO_SITIO, 0.008, colorLuz(c), { tex: 'brillo', min: 2.6, a: 1 }));
    }
    // El PAPI y el VASI (también de día), solo desde la aproximación.
    for (const l of lucesSenda(avion.x, avion.z, avion.ft).luces) if (!l.apagada) out.push(prima(l, { r: 0.003, min: hora === 'dia' ? 1.8 : 1.6 }));
    if (conTrafico) for (const tr of trafico) out.push(...primitivasTrafico(tr, { x: ojo[0], z: ojo[2] }, { hora, t: tiempo }));
    // 0.14.123: las bandadas (pájaros oscuros que aletean).
    for (const b of bandadas) for (let i = 0; i < b.n; i++) {
      const fx = Math.sin(i * 2.3) * 0.02 + Math.sin(tiempo * 0.7 + i) * 0.004, fz = Math.cos(i * 1.7) * 0.02, fy = -(i % 4) * 0.004 + (reducir ? 0 : Math.sin(tiempo * 9 + i) * 0.0006);
      out.push(bola([b.x + fx, b.y + fy, b.z + fz], 0.0012, [40, 36, 34], { min: 1.6 }));
    }
    // 0.14.118: la manga de viento junto a la cabecera (se ve desde la pista y en la final).
    if (Math.hypot(ojo[0], ojo[2] + 1.55) < 4) out.push(...mangaDeViento(vientoActual, tiempo));
    return out;
  }
  function ponerHora(nueva) {
    hora = nueva; paleta = paletaDe(hora); mundo = construirMundo(paleta, { conNubes: tiempoMet === 'despejado', sol: solDe(hora) }); mundoLuces = lucesDelMundo(hora);
    nubesTiempo = nubesConLuz(nubesDe(tiempoMet), paleta);
    raiz.setAttribute('data-hora', hora);
    pintarBotones();
    if (mc) pintarClase();
  }
  // En Vuelo libre, cada tanto otro avión (cruza, de frente o lo alcanzas) con su aviso del derecho de paso.
  // 0.14.102: el tráfico: uno en el circuito de cada aeropuerto (siempre) y, en Vuelo libre, cada tanto uno que cruza, viene
  // de frente o al que alcanzas (con su aviso del derecho de paso). Y el aviso «Tráfico a las 2, 2 millas, misma altitud».
  const avisados = new Map();
  function traficoPaso(dt) {
    if (mc) { if (accionClase) trafico = trafico.map(tr => moverTrafico(tr, dt * 1.5)); return; }
    trafico = trafico.map(tr => moverCualquiera(tr, dt)).filter(tr => tr.tipo === 'circuito' || Math.hypot(tr.x - avion.x, tr.z - avion.z) < 14);
    if (!conTrafico) return;
    for (const tr of trafico) {
      const al = alertaTrafico(avion, tr), clave = tr.id ?? tr.tipo + tr.pista;
      if (al && tiempo - (avisados.get(clave) ?? -999) > 45 && !abierta) {
        avisados.set(clave, tiempo);
        sonido.evento('pitido');
        mostrarAviso({ tono: 'info', titulo: t('juego.trafico.alerta', { horas: al.horas, nm: al.nm, altura: t(`juego.trafico.altura.${al.altura}`, { n: Math.abs(al.dif) }) }), partes: [], corto: true });
      }
    }
    if (modoActual !== 'libre' || trafico.some(tr => tr.tipo !== 'circuito') || abierta || avion.enSuelo || avion.ft < 500 || tiempo < proximoTrafico) return;
    const tipo = ['cruza_der_izq', 'de_frente', 'cruza_izq_der', 'alcanzas'][nTrafico % 4];
    nTrafico += 1; proximoTrafico = tiempo + 70;
    const tr = { ...crearTrafico(tipo, avion), fase: (nTrafico * 0.37) % 1, id: `c${nTrafico}` };
    trafico = [...trafico, tr];
    avisados.set(tr.id, tiempo);
    avisoTrafico(tr);
  }
  // Una marca sobre cada avión cercano (para encontrarlo): un recuadro y «+5 · 1.2 NM». Nunca sobre el tablero.
  let hudCtx = null, hudAviso = '';
  function pintarRelojesAfuera() {
    const w = hudLienzo.clientWidth, hh = hudLienzo.clientHeight;
    if (!w || !hh) return;
    const W = Math.round(w * escalaPx), H = Math.round(hh * escalaPx);
    if (hudLienzo.width !== W) hudLienzo.width = W;
    if (hudLienzo.height !== H) hudLienzo.height = H;
    try { hudCtx ??= hudLienzo.getContext('2d'); } catch { hudCtx = null; }
    if (!hudCtx) return;
    hudCtx.clearRect(0, 0, W, H);
    const L = lecturas({ ...avion, vs: indicado?.vs ?? avion.vs, ft: indicado?.ft ?? avion.ft });
    const z = dibujarRelojesAfuera(hudCtx, W, H, { ...L, ajuste }, { escala: escalaPx, hora, textos: TEXTOS_PANEL(t) });
    // (en el arco amarillo, el borde del panel se pone ámbar; pasada la raya roja, rojo: el aviso de la VNE ya habla)
    const a = z.rojo ? 'rojo' : z.amarillo ? 'amarillo' : '';
    if (a !== hudAviso) { hudAviso = a; if (a) hud.setAttribute('data-arco', a); else hud.removeAttribute('data-arco'); }
  }
  function marcasTrafico(cam, techo) {
    if (!conTrafico || !ctx) return;
    for (const tr of trafico) {
      const nm = Math.hypot(tr.x - avion.x, tr.z - avion.z) / NM;
      if (nm > 6) continue;
      const q = proyectar(cam, [tr.x, tr.ft / 1000 + 0.004, tr.z], ancho, alto);
      // (0.14.121: nunca debajo de los mandos que flotan: allí quedaba un pedazo de la marca, «NM»)
      const rp = reservaPx();
      if (!q || q.x < rp.izq || q.x > ancho - rp.der - 140 * escalaPx || q.y < 0 || q.y > Math.min(techo, alto - rp.abajo) - 10 * escalaPx) continue;
      const r = 15 * escalaPx;
      ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.lineWidth = 2 * escalaPx;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
      const s = `${etiquetaAltura(avion, tr)} · ${nm < 0.1 ? '< 0.1' : nm.toFixed(1)} NM`; // (0.14.117: muy cerca, «< 0.1 NM», no «0.0»)
      ctx.font = `700 ${12 * escalaPx}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(s).width + 8 * escalaPx;
      ctx.fillStyle = 'rgba(8,14,26,0.78)'; ctx.fillRect(q.x + r + 3 * escalaPx, q.y - 9 * escalaPx, w, 18 * escalaPx);
      ctx.fillStyle = '#ffe08a'; ctx.fillText(s, q.x + r + 7 * escalaPx, q.y);
    }
  }
  function avisoTrafico(tr) {
    sonido.evento('pitido');
    const v = queVes(tr, avion), d = derechoDePaso(avion, tr);
    const luces = v.colores.map(c => t(`juego.luz.${c}`)).join(t('juego.maniobra.y'));
    mostrarAviso({ tono: 'info', titulo: t(`juego.trafico.${d.encuentro}`), partes: [
      hora === 'noche' ? t('juego.trafico.ves', { luces }) + (v.orden ? ` ${t(`juego.trafico.${v.orden}`)}` : '') : null,
      t(`juego.dir.${v.direccion}`) + '.',
      t(`juego.accion.${d.accion}.texto`),
      t('juego.fuente', { f: '14 CFR 91.113' })] });
  }

  // ---- la mini-clase (0.14.100; 0.14.102: el mismo orden que las preguntas) ----
  // Un paso con pregunta: 1) la pregunta con sus opciones (abajo, compacta: la escena queda a la vista para mirar las
  // luces); 2) se esconde y se ve lo que pasa (el otro avión sigue su camino; en el derecho de paso, los dos viran a la
  // derecha); 3) la explicación (bien o mal, la idea clave, por qué y la fuente) con «Ver otra vez» y «Siguiente».
  // Un paso sin pregunta: el texto, la idea clave y la fuente. «Ocultar» lo deja en una píldora que lo vuelve a abrir.
  let preguntaClase = null, tAccion = 0, rumboTrafico0 = 0;
  function pasoActual() { return mc?.pasos[pasoClase] ?? null; }
  function ponerPaso(i, { repetir = false } = {}) {
    terminarRepeticion(); repeDatos = null;
    pasoClase = Math.max(0, Math.min(mc.pasos.length - 1, i));
    const paso = pasoActual();
    // 0.14.113: un paso puede empezar en otro lugar (paso.inicio: lo que cambia; también el combustible).
    const ini = { ...mc.inicio, ...(paso.inicio ?? {}) };
    avion = { ...crearAvion(ini), ...(ini.flaps ? { gamma: -0.052, cabeceo: -1, rpm: 1700 } : {}), ...(paso.arriba != null ? { ft: ini.ft + paso.arriba } : {}), pist: conAterrizaje(crearMotor({ mezcla: paso.mezcla ?? 1 }), mc.hora === 'noche' && ini.flaps) };
    if (ini.combustible != null) ponerMandosDe(avion);
    // 0.14.123: la mini-clase de los pájaros: el paso empieza con el golpe ya dado (el parabrisas; después, también el motor).
    if (paso.ave) { let d = null; for (const parte of paso.ave) d = danoAve(d, parte, 1); avion = { ...avion, danos: d }; pintarDanos(); }
    motorAndaba = avion.pist.enMarcha && (paso.mezcla ?? 1) > 0;
    preguntaClase = preguntaDePaso(paso, avion);
    trafico = preguntaClase ? [{ ...preguntaClase.trafico, fase: 0.3 }] : paso.trafico ? [crearTrafico(paso.trafico, avion, { distancia: 2 })] : [];
    rumboTrafico0 = trafico[0]?.rumbo ?? 0;
    accionClase = false; tAccion = 0;
    if (!repetir) { respondidaClase = null; faseClase = preguntaClase ? 'pregunta' : 'leer'; }
    else { faseClase = 'accion'; accionClase = true; }
    pintarClase();
  }
  // Después del resultado (el amarizaje o el choque): otra vez el mismo paso.
  function repetirPasoClase() {
    resultado.hidden = true; ultimoToque = -10; volo = true;
    ponerPaso(pasoClase); ponerMandosDe(avion); pausar(false);
  }
  function ponerMandosDe(a) { mandos.potencia = a.potencia; mandos.flaps = a.flaps; mandos.cabeceo = 0; mandos.alabeo = 0; pintarPotencia(); pintarBotones(); }
  function responderClase(o) {
    respondidaClase = { elegida: o, bien: o === preguntaClase.correcta, correcta: preguntaClase.correcta };
    faseClase = 'accion'; accionClase = true; tAccion = 0;
    empezarRepeticion({ escena: 'trafico', encuentro: pasoActual().trafico, acierto: respondidaClase.bien, inicio: { ...avion } });
    pintarClase();
  }
  // La acción de la mini-clase: unos segundos para mirar; después, la explicación.
  function relojClase(dt) {
    tAccion += dt;
    const paso = pasoActual();
    if (mc.id === 'derecho-paso' && paso?.trafico === 'de_frente' && trafico[0]) {
      // De frente: el otro también vira a la derecha (14 CFR 91.113).
      trafico = [{ ...trafico[0], rumbo: rumboTrafico0 + Math.min(35, tAccion * 8) }];
    }
    if (tAccion >= (repe?.dur ?? FLUJO.accionS.leccion)) { accionClase = false; faseClase = 'explicacion'; terminarRepeticion(); pintarClase(); }
  }
  let vivoClase = null;
  function pintarClase() {
    if (!mc) return;
    const paso = pasoActual(), id = mc.id;
    while (panelClase.firstChild) panelClase.removeChild(panelClase.firstChild);
    const negrita = (etq, texto, clase = '') => el(etq, { class: clase }, partesNegrita(texto).map(p => el(p.negrita ? 'strong' : 'span', { texto: p.texto })));
    const etiqueta = o => t(paso.pregunta === 'direccion' ? `juego.dir.${o}` : `juego.accion.${o}`);
    vivoClase = el('p', { class: 'juego-clase-vivo', 'aria-live': 'off' });
    raiz.setAttribute('data-fase-clase', faseClase);
    // La acción: nada delante (solo un subtítulo chico).
    if (faseClase === 'accion') {
      panelClase.hidden = true; pildoraClase.hidden = true;
      subtitulo.textContent = t('juego.mc.mira'); subtitulo.hidden = false; subtitulo.setAttribute('data-tono', 'info');
      return;
    }
    subtitulo.hidden = true;
    if (panelOculto) {
      panelClase.hidden = true; pildoraClase.hidden = false;
      pildoraClase.textContent = t('juego.clase.pildora', { n: pasoClase + 1, total: mc.pasos.length });
      return;
    }
    pildoraClase.hidden = true;
    const ajustes = el('div', { class: 'juego-clase-ajustes', role: 'group', 'aria-label': t('juego.clase.ajustes') },
      el('button', { type: 'button', class: 'juego-boton', 'aria-pressed': String(ambiente.viento.kt > 0), onclick: () => { ambiente = { ...ambiente, viento: ambiente.viento.kt > 0 ? { desde: 360, kt: 0 } : { ...(mc.viento ?? { desde: 90, kt: 10 }) } }; pintarClase(); } },
        ambiente.viento.kt > 0 ? t('juego.clase.viento', { desde: String(ambiente.viento.desde).padStart(3, '0'), kt: ambiente.viento.kt }) : t('juego.clase.sin_viento')),
      mc.pasos.some(x => x.trafico) ? el('button', { type: 'button', class: 'juego-boton', 'aria-pressed': String(conTrafico), onclick: () => { conTrafico = !conTrafico; pintarClase(); } }, t(conTrafico ? 'juego.clase.trafico_si' : 'juego.clase.trafico_no')) : null);
    let cuerpo;
    if (faseClase === 'pregunta') {
      cuerpo = [
        negrita('p', t(`juego.mc.${id}.${paso.id}`), 'juego-clase-texto'),
        el('div', { class: 'juego-clase-opciones', role: 'group', 'aria-label': t(`juego.mc.pregunta.${paso.pregunta}`) },
          preguntaClase.opciones.map(o => el('button', { type: 'button', class: 'juego-opcion-respuesta', 'data-opcion': o, onclick: () => responderClase(o) }, el('span', { texto: etiqueta(o) })))),
      ];
    } else {
      cuerpo = [
        respondidaClase ? el('p', { class: `juego-clase-resultado ${respondidaClase.bien ? 'bien' : 'mal'}`, texto: respondidaClase.bien ? t('juego.clase.bien') : t('juego.clase.mal', { era: etiqueta(respondidaClase.correcta) }) }) : negrita('p', t(`juego.mc.${id}.${paso.id}`), 'juego-clase-texto'),
        negrita('p', `**${t(`juego.mc.${id}.${paso.id}.clave`)}**`, 'juego-clase-clave'),
        respondidaClase ? el('p', { class: 'juego-clase-porque' }, el('strong', { texto: `${t('juego.exp.porque')} ` }), el('span', { texto: t(`juego.mc.${id}.${paso.id}.porque`) })) : null,
        mc.motor ? null : vivoClase,
        el('p', { class: 'juego-clase-fuente', texto: t('juego.fuente', { f: mc.fuente }) }),
        ajustes,
      ];
    }
    panelClase.append(...[
      el('div', { class: 'juego-clase-cabeza' },
        el('h2', { texto: t(`juego.mc.${id}.titulo`) }),
        el('span', { class: 'juego-clase-paso', texto: t('juego.clase.paso', { n: pasoClase + 1, total: mc.pasos.length }) }),
        el('button', { type: 'button', class: 'juego-boton juego-clase-ocultar', 'aria-expanded': 'true', onclick: () => { panelOculto = true; pintarClase(); } }, t('juego.clase.ocultar'))),
      // (la mezcla: lo que marca el motor y la palanca, fijos arriba, fuera de lo que se desplaza)
      mc.motor && faseClase !== 'pregunta' ? el('div', { class: 'juego-clase-motor' }, vivoClase, mezclaDeClase()) : null,
      el('div', { class: 'juego-clase-cuerpo' }, cuerpo),
      faseClase === 'pregunta' ? null : el('div', { class: 'juego-clase-nav' },
        respondidaClase ? el('button', { type: 'button', class: 'boton-3d blanco chico juego-clase-otra', onclick: () => verOtraVez(0) }, el('span', { texto: t('juego.clase.otra_vez') })) : null,
        respondidaClase ? el('button', { type: 'button', class: 'boton-3d blanco chico juego-cambiar-camara', onclick: () => verOtraVez(1) }, el('span', { texto: t('juego.rep.cambiar') })) : null,
        el('button', { type: 'button', class: 'boton-3d blanco chico', disabled: pasoClase === 0, onclick: () => ponerPaso(pasoClase - 1) }, el('span', { texto: t('juego.clase.anterior') })),
        pasoClase < mc.pasos.length - 1
          ? el('button', { type: 'button', class: 'boton-3d naranja chico juego-clase-siguiente', onclick: () => ponerPaso(pasoClase + 1) }, el('span', { texto: t('juego.clase.siguiente') }))
          : el('a', { class: 'boton-3d naranja chico', href: `${RUTA}/clases` }, el('span', { texto: t('juego.clase.terminar') }))),
    ].filter(Boolean));
    panelClase.hidden = false;
    pintarClaseVivo();
  }
  // Lo que cambia mientras se mira: lo que dice el PAPI (en las clases de la aproximación) y las luces del otro avión.
  // La mezcla, en la tarjeta de la mini-clase «La mezcla» (para moverla y ver la EGT al momento).
  let mezclaClase = null;
  function mezclaDeClase() {
    // (0.14.105: la misma palanca del cajón, no el control del navegador: se mueve con el dedo en el teléfono)
    mezclaClase = crearPalanca({ el, etiqueta: t('juego.motor.mezcla'), valor: avion.pist?.mezcla ?? 1, alCambiar: v => { mezclaTocada = Date.now(); ponerPist({ mezcla: Math.round(v * 100) / 100 }); } });
    return el('div', { class: 'juego-clase-mezcla' }, el('span', { class: 'juego-mezcla-fin', texto: t('juego.motor.corte') }), mezclaClase.nodo, el('span', { class: 'juego-mezcla-fin', texto: t('juego.motor.rica') }));
  }
  function pintarClaseVivo() {
    if (!mc || !vivoClase) return;
    let s = '';
    if (['papi', 'luces-aeropuerto', 'noche-aterrizar', 'cruzado'].includes(mc.id) && avion.z < PISTA.z - PISTA.largoFt / 2000) {
      const r = lucesSenda(avion.x, avion.z, avion.ft);
      s = t('juego.papi.lectura', { lectura: t(`juego.papi.${r.lectura}`), grados: r.angulo.toFixed(1) });
    }
    if (mc.motor && avion.pist) {
      const m = avion.pist;
      mezclaClase?.fijar(m.mezcla);
      s = t('juego.mc.mezcla.vivo', { egt: Math.round(m.egt ?? 0).toLocaleString('en-US'), dif: Math.round((m.pico ?? 0) - (m.egt ?? 0)), ff: (m.flujoGph ?? 0).toFixed(1), rpm: Math.round(avion.rpm / 10) * 10 })
        + (m.enMarcha ? '' : ` ${t('juego.motor.parado')}`);
    }
    if (vivoClase.textContent !== s) vivoClase.textContent = s;
  }

  // ---- 0.14.103: la repetición de «qué pasó» (pedido del dueño) ----
  function empezarRepeticion(datos) {
    repeDatos = { ...datos, camara: datos.camara ?? 0 };
    repe = crearRepeticion({ ...repeDatos, suelo: (x, z) => alturaSuelo(x, z) });
    repeNube = repe.nube ? cumulo({ x: repe.nube.x, z: repe.nube.z, base: repe.nube.y - 0.12, ancho: 0.42, alto: 0.26, semilla: 7 }).prims : [];
    if (!mc) flujo = { ...flujo, fase: 'accion', t: 0, dur: repe.dur };
    else { tAccion = 0; accionClase = true; faseClase = 'accion'; }
    if (!mc && !avion.enSuelo) sostener ??= { rumbo: avion.rumbo, ft: avion.ft };
    capaRepe.hidden = false; raiz.setAttribute('data-repe', '1');
    pintarRepe();
  }
  function terminarRepeticion() {
    repe = null; repeNube = []; capaRepe.hidden = true; repeLlamada.hidden = true; raiz.removeAttribute('data-repe');
  }
  function saltarRepeticion() {
    if (!repe) return;
    if (mc) tAccion = repe.dur; else if (flujo?.fase === 'accion') flujo = { ...flujo, t: flujo.dur };
  }
  // «Ver otra vez» (la misma) o «Cambiar cámara» (empieza por otra cámara).
  function verOtraVez(otraCamara) {
    if (!repeDatos) return;
    const camara = (repeDatos.camara + otraCamara) % CAMARAS.length;
    if (mc) { faseClase = 'accion'; empezarRepeticion({ ...repeDatos, camara }); pintarClase(); return; }
    explicacion.hidden = true; abierta = false;
    empezarRepeticion({ ...repeDatos, camara });
  }
  // Lo de encima de la repetición: qué cámara es y, en el momento clave, la frase (que queda hasta el final).
  let ultimaToma = '', ultimaLlamada = false;
  function pintarRepe() {
    if (!repe) return;
    const tr = tiempoRepe(), toma = tomaEn(repe, tr).camara;
    if (toma !== ultimaToma) { repeCamara.textContent = `🎥 ${t(`juego.rep.cam.${toma}`)}`; ultimaToma = toma; }
    const llamada = tr >= repe.clave.t;
    if (llamada !== ultimaLlamada || repeLlamada.hidden === llamada) {
      repeLlamada.textContent = t(repe.clave.texto); repeLlamada.hidden = !llamada; ultimaLlamada = llamada;
      repeLlamada.setAttribute('data-tono', repe.acierto ? 'bien' : 'mal');
    }
    capaRepe.setAttribute('data-congelada', congelada(repe, tr) ? '1' : '0');
  }

  // ---- 0.14.105: el motor (el cajón chico: encender y apagar cuando se quiera, la mezcla, las luces) ----
  const pist = () => avion.pist ?? crearMotor();
  const ponerPist = cambio => { avion = { ...avion, pist: { ...pist(), ...cambio } }; pintarMotor(); };
  let mezclaTocada = 0;
  const cajon = crearPanelMotor({
    el, t, temporizador: window,
    estado: () => ({ pist: pist(), enSuelo: avion.enSuelo, potencia: mandos.potencia, rpm: avion.rpm, aceitePsi: avion.aceitePsi, combustible: avion.combustible,
      guiado: guiaArranque, modoLista: listaModo, lista: guiaArranque ? (listaModo === 'arranque' ? listaArranque(pist(), mandos.potencia) : listaApagado(pist(), mandos.potencia)) : null }),
    acciones: {
      poner: cambio => { if ('mezcla' in cambio) mezclaTocada = Date.now(); ponerPist(cambio); },
      encender: () => { ponerPist(encenderMotor(pist(), { enSuelo: avion.enSuelo })); if (avion.enSuelo && mandos.potencia > 0.3) { mandos.potencia = 0.15; pintarPotencia(); } },
      apagar: () => { if (avion.enSuelo) { mandos.potencia = 0; pintarPotencia(); } ponerPist(apagarMotor(pist(), { enSuelo: avion.enSuelo })); },
      todo: () => { avion = { ...avion, pist: encenderTodo(pist(), avion.ft), rpm: Math.max(avion.rpm, VUELO.rpmRalenti), aceitePsi: VUELO.aceitePsiNormal, aceiteTemp: VUELO.aceiteTempNormal }; guiaArranque = false; pintarMotor(); },
      guiado: () => enFrio(true), manual: () => enFrio(false), cerrar: () => abrirMotor(false),
    },
  });
  const panelMotor = cajon.nodo;
  escenario.append(panelMotor); cajonListo = true;
  // «Arranque guiado / manual» (en tierra): todo apagado para arrancar paso a paso.
  function enFrio(guiado) {
    if (!avion.enSuelo) return;
    avion = { ...avion, pist: crearMotor({ enMarcha: false }), rpm: 0, aceitePsi: 0 }; mandos.potencia = 0; pintarPotencia();
    motorAndaba = false; guiaArranque = guiado; listaModo = 'arranque'; pintarMotor();
  }
  function abrirMotor(si) {
    panelMotor.hidden = !si; bMotor.setAttribute('aria-expanded', String(Boolean(si)));
    raiz.setAttribute('data-cajon', si ? '1' : '0');
    if (si) pintarMotor();
  }
  function pintarMotor() {
    if (panelMotor.hidden) return;
    // Arrancado en el guiado: la lista pasa a la del apagado.
    if (guiaArranque && listaModo === 'arranque' && pist().enMarcha && listaArranque(pist(), mandos.potencia).every(x => x.hecho)) {
      // (en la práctica del motor sigue la prueba de motor; en vuelo, la lista del apagado)
      if (modoActual === 'motor') guiaArranque = false; else listaModo = 'apagado';
    }
    cajon.pintar();
  }
  // Con el Asistente, la mezcla va sola (la de mejor potencia arriba de 3,000 ft) si no se tocó hace poco y el cajón está cerrado.
  function mezclaDelAsistente() {
    const m = avion.pist;
    if (!asistente || !m?.enMarcha || !panelMotor.hidden || mc?.motor || modoActual === 'motor' || Date.now() - mezclaTocada < 20000) return;
    const meta = mezclaAuto(avion.ft);
    if (Math.abs(meta - m.mezcla) > 0.005) avion = { ...avion, pist: { ...m, mezcla: m.mezcla + Math.sign(meta - m.mezcla) * Math.min(0.004, Math.abs(meta - m.mezcla)) } };
  }

  // ---- 0.14.103: el sonido ----
  async function cambiarSonido() {
    conSonido = !conSonido;
    if (conSonido) { const ok = await sonido.encender(); if (!ok) conSonido = false; } else sonido.apagar();
    pintarBotones();
  }
  const alVisibilidad = () => { if (document.visibilityState === 'hidden') sonido.apagar(); else if (conSonido && !pausado) sonido.encender(); };
  document.addEventListener('visibilitychange', alVisibilidad);

  // ---- 0.14.103: el tiempo ----
  function ponerTiempo(id, { callado = false } = {}) {
    tiempoMet = id; nubesTiempo = nubesConLuz(nubesDe(id), paleta); mundo = construirMundo(paleta, { conNubes: id === 'despejado', sol: solDe(hora) });
    zonaAvisada = null; ajusteDicho = null; dentroAvisado = false; oferta.hidden = true;
    cond = condiciones(id, avion.x, avion.z, avion.ft);
    if (id === 'despejado') { if (!vientoManual) ambiente = { ...ambiente, viento: { desde: 360, kt: 0 } }; ajuste = 29.92; }
    else ajuste = cond.altimetro;
    raiz.setAttribute('data-tiempo', id);
    for (const b of botonesTiempo) b.setAttribute('aria-pressed', String(b.dataset.tiempo === id));
    tiempoPaso(); pintarViento(); pintarInfo();
    if (callado) return;
    if (id === 'despejado') { mostrarAviso({ tono: 'info', titulo: t('juego.tiempo.despejado'), partes: [], corto: true }); return; }
    const f = id === 'nubes' ? TIEMPO_FAA.nubes : TIEMPO_FAA[id];
    mostrarAviso({ tono: 'info', titulo: t(`juego.tiempo.${id}`), partes: [t(`juego.tiempo.${id}.texto`), t('juego.fuente', { f: f.fuente })] });
  }
  // Lo del tiempo en cada paso: el viento (con ráfagas), la turbulencia, el altímetro que da el control y los rayos.
  const baseLeve = rafagaTurbulencia(1, 7);
  const rafagaLeve = tt => { const r = baseLeve(tt); r.cabeceo *= turbLeve; r.alabeo *= turbLeve; return r; };
  function tiempoPaso() {
    cond = condiciones(tiempoMet, avion.x, avion.z, avion.ft);
    // 0.14.118: el viento elegido a mano manda; si no, el del tiempo (o el de los eventos, con tiempo despejado).
    // 0.14.119: ambiente.viento es el viento parejo; vientoActual, con las ráfagas (las del tiempo o las del interruptor).
    if (vientoManual) ambiente = { ...ambiente, viento: { desde: vientoManual.desde, kt: vientoManual.kt } };
    else if (tiempoMet !== 'despejado') ambiente = { ...ambiente, viento: { desde: cond.viento.desde, kt: cond.viento.kt } };
    const base = ambiente.viento ?? { desde: 360, kt: 0 };
    rafagaKt = rafagasOn ? rafagaDe(base.kt, true) : !vientoManual && tiempoMet !== 'despejado' && cond.viento.rafagas > base.kt ? cond.viento.rafagas : base.kt;
    vientoActual = vientoConRafagas(base, rafagaKt, tiempo);
    corriente = avion.enSuelo ? 0 : corrienteVertical(tiempoMet, tiempo, avion.x, avion.z) * Math.min(1, avion.ft / 800);
    turbLeve = nivelTurbulencia(cond, { ft: avion.ft, enSuelo: avion.enSuelo, hora, viento: { kt: base.kt, rafagas: rafagaKt } });
    if (tiempoMet === 'despejado') return;
    if (cond.turbulencia > 0.05) { rafaga = rafagaTurbulencia(Math.min(1.6, cond.turbulencia * 1.3), 4); rafagaHasta = tiempo + 0.5; }
    if (cambioAltimetro(ajusteDicho, cond.altimetro)) {
      const primera = ajusteDicho == null;
      ajusteDicho = cond.altimetro; ajuste = cond.altimetro;
      if (!primera) mostrarAviso({ tono: 'info', titulo: t('juego.falla.atc'), radio: t('juego.tiempo.altimetro.radio', { a: ajuste.toFixed(2) }), partes: [t(`juego.tiempo.altimetro.${cond.zona === 'despues' ? 'sube' : 'baja'}`, { a: ajuste.toFixed(2) })], corto: true });
    }
    // Dentro de la nube: sin horizonte. El aviso de la desorientación (AFH cap. 18) y cómo salir.
    if (cond.dentro && !dentroAvisado && !abierta) {
      dentroAvisado = true;
      mostrarAviso({ tono: 'mal', titulo: t('juego.tiempo.imc'), partes: [el('strong', { texto: t('juego.tiempo.imc.salir', { min: TIEMPO_FAA.nubes.viraje180Min, g: TIEMPO_FAA.nubes.tasaEstandar }) }), t('juego.tiempo.imc.texto', { min: TIEMPO_FAA.nubes.pierdeControlMin }), t('juego.fuente', { f: TIEMPO_FAA.nubes.fuente })] });
    } else if (!cond.dentro && dentroAvisado && tiempo > ultimoDentro + 20) dentroAvisado = false;
    if (cond.dentro) ultimoDentro = tiempo;
    if (cond.rayos && tiempo > proximoRayo) {
      relampago = 1; proximoRayo = tiempo + 3 + ((tiempo * 7.31) % 4);
      setTimeout(() => sonido.evento('trueno'), 1200);
    }
    // Al entrar en el frente: el control lo avisa y ofrece una pregunta de meteorología.
    if (cond.zona && cond.zona !== zonaAvisada && cond.zona === 'paso' && !abierta && !flujo) {
      zonaAvisada = cond.zona;
      if (modoActual === 'libre') ofrecer({ tipo: 'frente', quien: 'control', tema: 'meteo', contexto: t(`juego.tiempo.${tiempoMet}.paso`) });
    }
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
    const ld = listaDanos(avion.danos);
    if (ld.length) resDatos.append(el('li', { class: 'juego-res-danos', texto: `${t('juego.dano.titulo')}: ${ld.map(id => t(`juego.dano.${id}`)).join(', ')}` }));
    resConsejo.textContent = t(`juego.res.consejo.${juicio.motivos[0] ?? 'bueno'}`);
    if (guiado) resTitulo.textContent = t(guiado.fin === 'sin_vidas' ? 'juego.res.base' : 'juego.res.destino');
    errores.hidden = !(puntaje.aceptadas > puntaje.bien || (guiado && guiado.respondidas > guiado.bien));
    resultado.hidden = false;
    resultado.querySelector('button')?.focus();
  }
  function reiniciar(m) {
    avion = inicioDe(m);
    mandos.potencia = avion.potencia; mandos.flaps = avion.flaps; mandos.cabeceo = 0; mandos.alabeo = 0; mandos.frenoMano = false; mandos.freno = 0; recorridoNm = 0; bandadas = [];
    volo = m === 'final' || m === 'preguntas'; ultimoToque = -10; tiempo = 0; camAfuera = null;
    puntaje = puntajeInicial(); agenda = crearAgenda(azar); ambiente = { viento: { desde: 360, kt: 0 } }; rafagaHasta = -1; fallaDesde = null; decision = null;
    extras = []; nubeFalla = null; desvioHasta = -1; oferta.hidden = true; aviso.hidden = true; pregunta.hidden = true; explicacion.hidden = true; subtitulo.hidden = true; abierta = false;
    flujo = null; vistaAntes = null; indicado = null; trafico = traficoInicial(); avisados.clear(); terminarRepeticion(); repeDatos = null; sostener = null;
    guiado = m === 'preguntas' ? crearGuiado() : null; objetivo = null; enAproximacion = false; esperando = Boolean(guiado);
    raiz.setAttribute('data-modo', m); modoActual = m; retener = null; tormenta = null;
    resultado.hidden = true; pintarBotones(); pintarPotencia(); pausar(false);
    ajuste = 29.92; ajusteDicho = null; relampago = 0; proximoRayo = 0; zonaAvisada = null; dentroAvisado = false; listaModo = 'arranque'; motorAndaba = true;
    guiaArranque = false; abrirMotor(false);
  }

  // ---- botones ----
  function cambiarVista() { vista = vista === 'cabina' ? 'afuera' : 'cabina'; raiz.setAttribute('data-vista', vista); orbita = orbitaInicial(); pintarBotones(); }
  function pintarBotones() {
    // La cámara: «Cabina 1/2» o «Afuera 2/2» (un toque pasa a la otra).
    const cab = vista === 'cabina';
    bVista.textContent = `${t(cab ? 'juego.camara.cabina' : 'juego.camara.afuera')} ${cab ? 1 : 2}/2`;
    bVista.setAttribute('aria-label', t('juego.camara.cambiar', { vista: t(cab ? 'juego.camara.cabina' : 'juego.camara.afuera'), n: cab ? 1 : 2 }));
    for (const b of [bAsistente, bAsistente2]) b.setAttribute('aria-pressed', String(asistente));
    const g = flapsAGrados(mandos.flaps);
    bFlaps.setAttribute('aria-pressed', String(g > 0)); bFlaps.textContent = g ? t('juego.flaps.grados', { g }) : t('juego.flaps');
    for (const b of muescas) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.f) - mandos.flaps) < 0.01));
    bFrenoMano.setAttribute('aria-pressed', String(Boolean(mandos.frenoMano)));
    bVuelve.setAttribute('aria-pressed', String(orbitaVuelve));
    bAgl.setAttribute('aria-pressed', String(aglVisible()));
    bPajaros.setAttribute('aria-pressed', String(pajarosOn));
    bPanelGrande.setAttribute('aria-pressed', String(panelGrande)); bTenues.setAttribute('aria-pressed', String(mandosTenues));
    raiz.setAttribute('data-tenues', mandosTenues ? '1' : '0');
    for (const b of botonesInstr) b.setAttribute('aria-pressed', String(b.dataset.instr === instrumentosAfuera));
    raiz.setAttribute('data-instr', instrumentosAfuera);
    const libre = !orbitaCentrada(orbita);
    if (bCentrar.hidden === libre) bCentrar.hidden = !libre;
    raiz.setAttribute('data-orbita', libre ? '1' : '0');
    bMapa.setAttribute('aria-pressed', String(verMapa)); raiz.setAttribute('data-mapa', verMapa ? '1' : '0');
    for (const b of botonesHora) b.setAttribute('aria-pressed', String(b.dataset.hora === hora));
    bTrafico.textContent = t(conTrafico ? 'juego.clase.trafico_si' : 'juego.clase.trafico_no');
    bTrafico.setAttribute('aria-pressed', String(conTrafico));
    bOrientacion.textContent = t(horizontal() ? 'juego.orientacion.vertical' : 'juego.orientacion.horizontal');
    bSonido.textContent = t(conSonido ? 'juego.sonido.si' : 'juego.sonido.no'); bSonido.setAttribute('aria-pressed', String(conSonido));
    bPausa.setAttribute('aria-pressed', String(pausado));
    // (el ícono de la pausa se cambia solo si cambió: cambiarlo mientras el dedo está encima hacía perder el toque)
    if (bPausa.dataset.estado !== String(pausado)) { bPausa.dataset.estado = String(pausado); bPausa.replaceChildren(pausado ? el('span', { texto: '▶' }) : icono('pausa', 'icono')); }
    bPausa.setAttribute('aria-label', t(pausado ? 'juego.seguir_vuelo' : 'juego.pausa'));
  }
  // 0.14.118: los flaps de a una muesca, el menú (la hoja), el viento a mano y la compensación.
  function ponerFlaps(f) { mandos.flaps = Math.max(0, Math.min(1.5, f)); pintarBotones(); }
  function abrirMenu(si) {
    menuMas.hidden = !si; bMas.setAttribute('aria-expanded', String(Boolean(si)));
    raiz.setAttribute('data-menu', si ? '1' : '0');
    if (si) { pintarBotones(); pintarViento(); bCerrarMenu.focus?.(); } else if (raiz.contains(document.activeElement) || document.activeElement === document.body) bMas.focus?.({ preventScroll: true });
  }
  function ponerViento(cambio) {
    if (cambio == null) vientoManual = null;
    else {
      const v = vientoManual ?? { desde: Math.round((ambiente.viento?.desde ?? 360) / 45) * 45 || 360, kt: Math.round((ambiente.viento?.kt ?? 0) / 5) * 5 };
      vientoManual = { ...v, ...cambio };
      if (cambio.desde != null && !vientoManual.kt) vientoManual.kt = 10;
    }
    if (!vientoManual && tiempoMet === 'despejado') ambiente = { ...ambiente, viento: { desde: 360, kt: 0 } };
    tiempoPaso(); pintarViento();
  }
  function pintarViento() {
    const v = vientoManual;
    bVientoAuto.setAttribute('aria-pressed', String(!v));
    for (const b of botonesVientoDir) b.setAttribute('aria-pressed', String(Boolean(v) && Number(b.dataset.desde) === v.desde));
    for (const b of botonesVientoKt) b.setAttribute('aria-pressed', String(Boolean(v) && Number(b.dataset.kt) === v.kt));
    bRafagas.setAttribute('aria-pressed', String(rafagasOn));
    const w = ambiente.viento ?? { desde: 360, kt: 0 };
    const s = w.kt < 1 && rafagaKt < 1 ? t('juego.viento.calma') : t('juego.viento.ahora_texto', { v: vientoTexto(w.desde, w.kt, rafagaKt) });
    if (vientoAhora.textContent !== s) vientoAhora.textContent = s;
    for (const b of botonesTiempo) b.setAttribute('aria-pressed', String(b.dataset.tiempo === tiempoMet));
  }
  function moverTrim(dir) {
    // (▲ = nariz abajo, ▼ = nariz arriba, como la rueda de verdad: hacia atrás sube la nariz)
    avion = { ...avion, trim: Math.max(-3, Math.min(13, (avion.trim ?? 4) + dir * 0.6)) };
    pintarTrim();
  }
  function pintarTrim() { trimMarca.style.transform = `translateY(${(Math.max(-1, Math.min(1, ((avion.trim ?? 4) - 4) / 7)) * 38).toFixed(1)}px)`; }
  // El panel de información: el tiempo de vuelo, lo recorrido y el combustible.
  function pintarInfo() {
    const mm = Math.floor(tiempo / 60), ss = Math.floor(tiempo % 60);
    const a = `⏱ ${mm}:${String(ss).padStart(2, '0')}`, b = `${recorridoNm < 10 ? recorridoNm.toFixed(1) : Math.round(recorridoNm)} NM`;
    if (infoTiempo.textContent !== a) infoTiempo.textContent = a;
    if (infoDist.textContent !== b) infoDist.textContent = b;
    const k = Math.max(0, Math.min(1, avion.combustible / VUELO.combustibleGal)), gal = `${Math.round(avion.combustible)} gal`;
    infoComb.style.setProperty('--k', k.toFixed(3));
    infoComb.setAttribute('data-bajo', k < 0.2 ? '1' : '0');
    const gs = infoComb.lastChild; if (gs.textContent !== gal) gs.textContent = gal;
    // La altura sobre el suelo, por debajo de 500 ft (en vuelo).
    const h = alturaSobreSuelo(avion, alturaSuelo), verAgl = aglVisible() && !avion.enSuelo && h < 500 && !repe;
    if (agl.hidden === verAgl) agl.hidden = !verAgl;
    if (verAgl) { const s1 = t('juego.agl', { ft: Math.round(h / 5) * 5 }); if (agl.textContent !== s1) agl.textContent = s1; agl.setAttribute('data-bajo', h < 50 ? '1' : '0'); }
    // (0.14.119: el viento, como en el METAR: «270° 12G20 kt»)
    const w = ambiente.viento ?? { desde: 360, kt: 0 }, vt = w.kt < 1 && rafagaKt < 1 ? t('juego.viento.calma_corta') : t('juego.viento.corto', { v: vientoTexto(w.desde, w.kt, rafagaKt) });
    if (infoViento.textContent !== vt) infoViento.textContent = vt;
    pintarTrim();
  }
  function pausar(si) {
    pausado = Boolean(si); pintarBotones();
    if (pausado) sonido.apagar(); else if (conSonido) sonido.encender();
  }
  // ---- vertical u horizontal (0.14.102) ----
  const CLAVE_ORIENTACION = 'academia.juego.orientacion';
  function horizontal() { try { return matchMedia('(orientation: landscape)').matches; } catch { return false; } }
  async function cambiarOrientacion() {
    const quiere = horizontal() ? 'vertical' : 'horizontal';
    try { localStorage.setItem(CLAVE_ORIENTACION, quiere); } catch { /* sin almacenamiento */ }
    const puede = typeof screen === 'object' && typeof screen.orientation?.lock === 'function' && typeof raiz.requestFullscreen === 'function';
    let hecho = false;
    for (const accion of planOrientacion(quiere, { puedeBloquear: puede })) {
      try {
        if (accion === 'completa' && !document.fullscreenElement) await raiz.requestFullscreen();
        else if (accion === 'bloquear') { await screen.orientation.lock('landscape'); hecho = true; }
        else if (accion === 'desbloquear') screen.orientation?.unlock?.();
        else if (accion === 'salir_completa' && document.fullscreenElement) await document.exitFullscreen();
      } catch { hecho = false; }
    }
    if (quiere === 'horizontal' && !hecho) mostrarAviso({ tono: 'info', titulo: `⟲ ${t('juego.orientacion.girar')}`, partes: [], corto: true });
    pintarBotones();
  }
  // 0.14.118: el panel de información: en el teléfono de lado va arriba del panel de la derecha (en la fila de arriba no
  // cabe junto al consejo y bajaba sobre el parabrisas); si no, a la derecha del consejo.
  function colocarInfo() {
    const lado = tactil && horizontal() && typeof matchMedia === 'function' && matchMedia('(max-height: 500px)').matches;
    const donde = lado ? mandosTactiles.querySelector('.juego-panel-der') : fila2;
    if (donde && info.parentNode !== donde) { if (lado) donde.prepend(info); else donde.append(info); }
  }
  colocarInfo();
  let mqOrientacion = null;
  try { mqOrientacion = matchMedia('(orientation: landscape)'); mqOrientacion.addEventListener?.('change', () => { colocarInfo(); pintarBotones(); }); } catch { mqOrientacion = null; }
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
    if (!menuMas.hidden) { if (e.key === 'Escape') { e.preventDefault(); abrirMenu(false); } return; }
    if (e.target?.closest?.('.juego-potencia') && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) return;
    if (TECLAS[e.code]) { apretadas.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); if (TECLAS[e.code][0] === 'potencia') setTimeout(pintarPotencia, 0); return; }
    // (0.14.118: F baja los flaps una muesca y R los sube; B, mantenida, frena)
    if (e.code === 'KeyF') ponerFlaps(e.shiftKey ? anteriorFlaps(mandos.flaps) : siguienteFlaps(mandos.flaps));
    else if (e.code === 'KeyR') ponerFlaps(anteriorFlaps(mandos.flaps));
    else if (e.code === 'KeyB') { mandos.freno = 1; bFreno.setAttribute('aria-pressed', 'true'); }
    else if (e.code === 'KeyC') cambiarVista();
    else if (e.code === 'KeyP') pausar(!pausado);
    else if (e.code === 'KeyE') abrirMotor(panelMotor.hidden);
    else if (e.code === 'BracketLeft' || e.code === 'BracketRight') { mezclaTocada = Date.now(); ponerPist({ mezcla: Math.max(0, Math.min(1, Math.round((pist().mezcla + (e.code === 'BracketLeft' ? -0.02 : 0.02)) * 100) / 100)) }); }
    else if (e.key === '?' || e.code === 'KeyH') abrirAyuda();
  };
  const alSoltar = e => { apretadas.delete(e.code); if (TECLAS[e.code]?.[0] === 'potencia') pintarPotencia(); if (e.code === 'KeyB') soltarFreno(); };
  const alPerderFoco = () => { apretadas.clear(); soltarFreno(); };
  // ---- 0.14.118: el freno (mantener apretado) ----
  function soltarFreno() { mandos.freno = 0; bFreno.setAttribute('aria-pressed', 'false'); }
  bFreno.addEventListener('pointerdown', e => { mandos.freno = 1; bFreno.setAttribute('aria-pressed', 'true'); try { bFreno.setPointerCapture(e.pointerId); } catch { /* sin captura */ } e.preventDefault(); });
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) bFreno.addEventListener(tipo, soltarFreno);
  bFreno.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); mandos.freno = 1; bFreno.setAttribute('aria-pressed', 'true'); } });
  bFreno.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') soltarFreno(); });
  bFreno.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', alApretar);
  window.addEventListener('keyup', alSoltar);
  window.addEventListener('blur', alPerderFoco);
  let relojPotencia = 0;
  // Mientras se aprieta Shift o Ctrl, la palanca en pantalla se repinta.
  relojPotencia = setInterval(() => { if ([...apretadas].some(x => TECLAS[x]?.[0] === 'potencia')) pintarPotencia(); }, 120);

  // ---- el yugo en pantalla (arrastrar) ----
  // 0.14.117: el centro es donde tocó primero (tocar fuera del centro ya no mueve el avión de golpe); el mando sigue una
  // curva (fino cerca del centro) y la perilla muestra cuánto se pidió.
  const mover = e => {
    const r = yugo.getBoundingClientRect(), radio = r.width / 2;
    const dx = Math.max(-1, Math.min(1, (e.clientX - toque.x0) / (radio * 0.7)));
    const dy = Math.max(-1, Math.min(1, (e.clientY - toque.y0) / (radio * 0.7)));
    Object.assign(toque, yugoDeToque(dx, dy));
    perilla.style.transform = `translate(${(dx * radio * 0.62).toFixed(1)}px, ${(dy * radio * 0.62).toFixed(1)}px)`;
  };
  yugo.addEventListener('pointerdown', e => {
    toque.activo = true; toque.x0 = e.clientX; toque.y0 = e.clientY; yugo.setAttribute('data-activo', '1');
    try { yugo.setPointerCapture(e.pointerId); } catch { /* sin captura */ } mover(e); e.preventDefault();
  });
  yugo.addEventListener('pointermove', e => { if (toque.activo) mover(e); });
  const soltarYugo = () => { toque.activo = false; toque.alabeo = 0; toque.cabeceo = 0; perilla.style.transform = ''; yugo.removeAttribute('data-activo'); };
  yugo.addEventListener('pointerup', soltarYugo);
  yugo.addEventListener('pointercancel', soltarYugo);
  yugo.addEventListener('lostpointercapture', () => { if (toque.activo) soltarYugo(); });
  // ---- 0.14.119: la cámara libre: arrastrar el paisaje (un dedo o el ratón), pellizcar o la rueda; doble toque, centrar ----
  // (solo sobre el paisaje: los mandos y los botones están encima y se quedan sus toques; el yugo sigue andando a la vez)
  const dedosEscena = new Map();
  let pellizco0 = null, ultimoToqueEscena = { t: -1e9, x: 0, y: 0 };
  const cabinaLibre = () => (repe ? false : vista === 'cabina');
  // 0.14.119: los límites del avión (sin el Asistente se puede volar como el de verdad, y también pasarse): el factor de carga
  // (+3.8 / −1.52 G: aviso; con 1.5 veces eso se rompe) y la VNE (163 kt: aviso; a 180 o 8 s seguidos, se rompe). Con el
  // Asistente solo avisan (para empezar tranquilo). Boca abajo, el motor tose (el aviso dice por qué).
  function limitesPaso(dt) {
    if (mc || guiado || avion.enSuelo || avion.choque) { vneS = 0; return false; }
    const g = avion.g ?? 1, L = LIMITES;
    const roto = (motivo, datos) => { terminarVuelo({ nivel: 'estructura', motivos: [motivo], puntos: 0 }, datos); volo = false; return true; };
    if (!asistente && (g > L.gMax * L.seguridad || g < L.gMin * L.seguridad)) return roto('sobrecarga', { kt: avion.kt });
    if ((g > L.gMax || g < L.gMin) && tiempo - avisoG > 4) {
      avisoG = tiempo; sonido.evento('pitido');
      mostrarAviso({ tono: 'mal', titulo: t('juego.limite.g', { g: g.toFixed(1), max: L.gMax, min: L.gMin }), partes: [], corto: true });
    }
    if (avion.kt > L.vneKt) {
      vneS += dt;
      if (!asistente && (avion.kt > L.vneRompeKt || vneS > L.vneSeg)) return roto('vne', { kt: avion.kt });
      if (tiempo - avisoVne > 4) { avisoVne = tiempo; sonido.evento('pitido'); mostrarAviso({ tono: 'mal', titulo: t('juego.limite.vne', { vne: L.vneKt }), partes: [], corto: true }); }
    } else vneS = 0;
    if (avion.tose && tiempo - avisoTose > 12) { avisoTose = tiempo; mostrarAviso({ tono: 'info', titulo: t('juego.limite.tose'), partes: [], corto: true }); }
    return false;
  }
  // 0.14.121: el consejo se apaga solo a los 8 s (vuelve con el próximo) en el teléfono de lado (va en la fila de los botones).
  let chipTexto = '', chipDesde = 0;
  function envejecerConsejo() {
    if (chip.textContent !== chipTexto) { chipTexto = chip.textContent; chipDesde = performance.now(); chip.removeAttribute('data-viejo'); }
    else if (performance.now() - chipDesde > 8000 && !chip.hasAttribute('data-viejo')) chip.setAttribute('data-viejo', '1');
  }
  // «Componentes»: de lado va arriba del panel de la izquierda (en una esquina, no sobre el parabrisas); si no, en la escena.
  function colocarComponentes() {
    const lado = deLado(), donde = lado ? mandosTactiles.querySelector('.juego-panel-izq') : escenario;
    if (donde && bMotor.parentNode !== donde) { if (lado) donde.prepend(bMotor); else donde.append(bMotor); }
  }
  // Los mandos tenues: al tocarlos se ven enteros unos segundos.
  let tenuesReloj = 0;
  mandosTactiles.addEventListener('pointerdown', () => { raiz.setAttribute('data-tocando', '1'); clearTimeout(tenuesReloj); tenuesReloj = setTimeout(() => raiz.removeAttribute('data-tocando'), 4000); });
  function centrarCamara() { orbita = orbitaInicial(); pintarBotones(); }
  function tocarOrbita(nueva) { const antes = orbitaCentrada(orbita); orbita = nueva; orbitaTocada = performance.now(); if (antes !== orbitaCentrada(orbita)) pintarBotones(); }
  lienzo.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dedosEscena.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    try { lienzo.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    if (dedosEscena.size === 2) { const [a, b] = [...dedosEscena.values()]; pellizco0 = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: orbita.zoom }; }
  });
  lienzo.addEventListener('pointermove', e => {
    const d = dedosEscena.get(e.pointerId); if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
    if (dedosEscena.size === 1) tocarOrbita(arrastrarOrbita(orbita, dx, dy, { cabina: cabinaLibre() }));
    else if (dedosEscena.size === 2 && pellizco0 && !cabinaLibre()) { const [a, b] = [...dedosEscena.values()]; tocarOrbita(zoomOrbita({ ...orbita, zoom: pellizco0.zoom }, pellizco0.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1))); }
  });
  const soltarEscena = e => {
    const d = dedosEscena.get(e.pointerId); if (!d) return;
    dedosEscena.delete(e.pointerId); if (dedosEscena.size < 2) pellizco0 = null;
    if (e.type !== 'pointerup' || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10 || performance.now() - d.t0 > 300) return;
    // Doble toque en el paisaje: centrar.
    const ahora = performance.now();
    if (ahora - ultimoToqueEscena.t < 350 && Math.hypot(e.clientX - ultimoToqueEscena.x, e.clientY - ultimoToqueEscena.y) < 40) { centrarCamara(); ultimoToqueEscena = { t: -1e9, x: 0, y: 0 }; }
    else ultimoToqueEscena = { t: ahora, x: e.clientX, y: e.clientY };
  };
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) lienzo.addEventListener(tipo, soltarEscena);
  lienzo.addEventListener('wheel', e => { if (cabinaLibre()) return; e.preventDefault(); tocarOrbita(zoomOrbita(orbita, Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * 0.0015))); }, { passive: false });
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
  potencia.addEventListener('lostpointercapture', () => { enPotencia = false; });
  potencia.addEventListener('keydown', e => {
    const paso1 = e.code === 'ArrowUp' || e.code === 'PageUp' ? 0.1 : e.code === 'ArrowDown' || e.code === 'PageDown' ? -0.1 : e.code === 'Home' ? -1 : e.code === 'End' ? 1 : 0;
    if (!paso1) return;
    e.preventDefault(); e.stopPropagation();
    mandos.potencia = Math.max(0, Math.min(1, mandos.potencia + paso1)); pintarPotencia();
  });
  // El dedo sobre el juego no hace zoom ni mueve la página.
  // (0.14.117: también entre los mandos: un dedo que se resbala del yugo no desplaza ni agranda la página)
  // (la lista de la prueba de motor, que va entre los mandos en el teléfono, sí se desplaza con el dedo)
  // (0.14.118: también el cajón de los componentes, la mini-clase y los avisos largos: se desplazan con el dedo)
  for (const n of [yugo, potencia, escenario, mandosTactiles]) n.addEventListener('touchmove', e => { if (!e.target?.closest?.('.juego-runup, .juego-se-desplaza, .juego-motor, .juego-clase-cuerpo, .juego-aviso')) e.preventDefault(); }, { passive: false });

  // ---- tema ----
  let temaObs = null;
  try { temaObs = new MutationObserver(() => { if (mc || hora === 'noche') return; const h2 = leerPaleta() === PALETAS.oscuro ? 'atardecer' : 'dia'; if (h2 !== hora) ponerHora(h2); }); temaObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] }); } catch { temaObs = null; }

  // ---- salir ----
  function destruir() {
    bucle.destruir(); gl3?.liberar?.(); temaObs?.disconnect(); clearInterval(relojPotencia); toques.destruir(); sinZoom.destruir();
    sonido.destruir(); document.removeEventListener('visibilitychange', alVisibilidad);
    window.removeEventListener('keydown', alApretar); window.removeEventListener('keyup', alSoltar); window.removeEventListener('blur', alPerderFoco);
    window.removeEventListener('hashchange', alCambiarRuta);
    document.body.classList.remove('juego-activo');
  }
  // (cualquier cambio de dirección: otra pantalla u otro vuelo, que se arma de nuevo)
  const alCambiarRuta = () => destruir();
  window.addEventListener('hashchange', alCambiarRuta);

  pintarBotones(); pintarPotencia(); pintarViento(); pintarInfo();
  globalThis.requestAnimationFrame?.(() => medirTecho());
  if (modo === 'libre' || modo === 'preguntas') cargarPreguntas();
  raiz.setAttribute('data-hora', hora);
  if (mc) {
    raiz.setAttribute('data-congelar', mc.congelar ? '1' : '0');
    avion = { ...crearAvion(mc.inicio), ...(mc.inicio.flaps ? { gamma: -0.052, cabeceo: -1, rpm: 1700 } : {}), pist: crearMotor() };
    mandos.potencia = avion.potencia; mandos.flaps = avion.flaps; volo = !avion.enSuelo;
    asistente = mc.asistente ?? true;
    if (mc.viento) ambiente = { ...ambiente, viento: { ...mc.viento } };
    ponerPaso(0); pintarBotones(); pintarPotencia();
  }
  // ---- 0.14.105: la práctica del motor (#juego/motor): arrancar, la prueba de motor, empobrecer y apagar, sin volar ----
  let runup = {}, runupGuiado = true, runupNodo = null;
  function pintarRunup() {
    if (modoActual !== 'motor' || !runupNodo) return;
    const m = pist(), lista = listaRunup(runup, { rpm: avion.rpm, aceitePsi: avion.aceitePsi, aceiteTemp: avion.aceiteTemp, enMarcha: m.enMarcha, magnetos: m.magnetos, calor: m.calor });
    const poh = MOTOR_FAA.poh, sig = lista.findIndex(x => !x.hecho);
    const vals = { rpm: poh.runupRpm.toLocaleString('en-US'), max: poh.caidaMaxRpm, dif: poh.diferenciaMaxRpm, a: poh.aceitePsiVerde[0], b: poh.aceitePsiVerde[1] };
    const textos = lista.map((x, k) => `${x.hecho ? '✓' : k === sig ? '▶' : '○'} ${t(`juego.runup.${x.id}`, vals)}`);
    const ol = runupNodo.querySelector('ol'), caidas = runupNodo.querySelector('.juego-runup-caidas');
    ol.hidden = !runupGuiado;
    if (runupGuiado && [...ol.children].map(li => li.textContent).join('|') !== textos.join('|')) ol.replaceChildren(...lista.map((x, k) => el('li', { 'data-hecho': x.hecho ? '1' : '0', 'data-siguiente': k === sig ? '1' : '0', texto: textos[k] })));
    const c = t('juego.runup.caidas', { l: runup.caidaL ?? '—', r: runup.caidaR ?? '—', c: runup.caidaCalor ?? '—', ...vals });
    if (caidas.textContent !== c) caidas.textContent = c;
    for (const b of runupNodo.querySelectorAll('.juego-runup-modo .juego-boton')) b.setAttribute('aria-pressed', String((b.dataset.modo === 'guiado') === runupGuiado));
  }
  if (modo === 'motor') {
    const modoBoton = (id, txt) => el('button', { type: 'button', class: 'juego-boton', 'data-modo': id, onclick: () => { runupGuiado = id === 'guiado'; guiaArranque = runupGuiado; pintarRunup(); pintarMotor(); } }, txt);
    runupNodo = el('section', { class: 'juego-runup', 'aria-label': t('juego.runup.titulo') },
      el('h2', { texto: t('juego.runup.titulo') }),
      el('div', { class: 'juego-runup-modo', role: 'group' }, modoBoton('guiado', t('juego.runup.guiado')), modoBoton('libre', t('juego.runup.libre'))),
      el('ol', {}), el('p', { class: 'juego-runup-caidas', 'aria-live': 'polite' }),
      el('p', { class: 'juego-runup-fuente', texto: t('juego.fuente', { f: `PHAK cap. 7 · AFH cap. 2 · ${MOTOR_FAA.poh.fuente}` }) }));
    (tactil ? mandosTactiles : escenario).append(runupNodo);
    guiaArranque = true; asistente = false; abrirMotor(true); pintarBotones(); pintarRunup();
  }
  let vista1 = false;
  try { vista1 = localStorage.getItem(CLAVE_AYUDA) === '1'; } catch { vista1 = false; }
  if (!vista1) abrirAyuda();
  // La orientación elegida (se recuerda en este equipo): si pidió horizontal y el teléfono está de pie, el consejo.
  try { if (tactil && localStorage.getItem(CLAVE_ORIENTACION) === 'horizontal' && !horizontal()) mostrarAviso({ tono: 'info', titulo: `⟲ ${t('juego.orientacion.girar')}`, partes: [], corto: true }); } catch { /* sin almacenamiento */ }
  bucle.iniciar();

  // Para las capturas y las pruebas: poner el avión en un estado y dibujar ya (también en raiz.juego, para las capturas).
  const control = {
    raiz, destruir, reiniciar, get orbita() { return orbita; }, ponerPajaros(si) { pajarosOn = Boolean(si); proximaBandada = tiempo; pintarBotones(); }, get bandadas() { return bandadas; }, ponerRelampago(k) { relampago = k; }, get asistente() { return asistente; }, ponerAsistente(si) { asistente = Boolean(si); pintarBotones(); }, ponerOrbita(o) { orbita = { ...orbitaInicial(), ...o }; pintarBotones(); }, centrarCamara, abrirAyuda, abrirMotor, saltarRepeticion, verOtraVez, get repe() { return repe; }, irRepe(t) { if (!repe) return; if (mc) tAccion = t; else flujo = { ...flujo, t }; pintarRepe(); dibujar(); return { t: tiempoRepe(), toma: tomaEn(repe, tiempoRepe()).camara, cam: camaraRepeticion(repe, tiempoRepe(), 2).toma, fase: flujo?.fase }; }, ponerTiempo, cambiarSonido, ponerPist, enFrio, cajon, get runup() { return runup; }, cerrarAyuda, cambiarVista, ofrecer, abrirPregunta, aplicarConsecuencia, cargarPreguntas, ponerTormenta, pausar, ponerHora, ponerPaso, avisoTrafico,
    ponerTrafico(tipo) { trafico = [{ ...crearTrafico(tipo, avion), fase: 0.3 }]; return trafico[0]; },
    get guiado() { return guiado; }, get puntaje() { return puntaje; }, get pool() { return pool; }, get flujo() { return flujo; }, get faseClase() { return faseClase; }, responderClase,
    get trafico() { return trafico; }, ponerMandos(m) { Object.assign(mandos, m); pintarPotencia(); }, verMapa(lejos) { mapaLejos = Boolean(lejos); pintarMapas(); dibujarMapa(); },
    fijar(estado = {}) { avion = { ...avion, ...estado }; cond = condiciones(tiempoMet, avion.x, avion.z, avion.ft); indicado = null; pintarMotor(); if (estado.vista && estado.vista !== vista) cambiarVista(); if (estado.potencia != null) { mandos.potencia = estado.potencia; pintarPotencia(); } pintarTextos(); dibujar(); dibujarMapa(); },
    terminarVuelo,
    get avion() { return avion; }, get tiempoMet() { return tiempoMet; }, get cond() { return cond; }, get sonido() { return sonido; }, get ajuste() { return ajuste; },
  };
  raiz.juego = control;
  return control;
}

// Las luces que no cambian (bordes de pista y de rodaje; de noche, también los pueblos): una lista por hora (WebGL la sube una vez).
const LUCES_CACHE = new Map();
function lucesDelMundo(hora) {
  if (!conLuces(hora)) return [];
  if (!LUCES_CACHE.has(hora)) LUCES_CACHE.set(hora, [...[PISTA, PISTA_B].flatMap(p => lucesFijas(p)).map(l => prima(l, { r: 0.0015, min: hora === 'noche' ? 0.9 : 0.8 })), ...(hora === 'noche' ? lucesPueblos() : [])]);
  return LUCES_CACHE.get(hora);
}
// El faro, arriba de la torre (donde la dibuja aeropuerto() de e3d-base.js).
const FARO_SITIO = [PISTA.anchoFt / 2000 * 10, (PISTA.largoFt / 1000) * 0.035 * 2.7 + 0.02, (PISTA.largoFt / 1000) * 0.5 * 0.3];

// La paleta del cielo según el tema (de día, en claro; en oscuro, al atardecer, como las escenas 3D).
function leerPaleta() {
  try { return document.documentElement.getAttribute('data-tema') === 'oscuro' ? PALETAS.oscuro : PALETAS.claro; } catch { return PALETAS.claro; }
}
const TEXTOS_PANEL = t => ({ kt: t('juego.panel.kt'), ft: t('juego.panel.ft'), vsi: t('juego.panel.vsi'), rpm: t('juego.panel.rpm'), psi: t('juego.panel.psi'), temp: t('juego.panel.temp'), fuel: t('juego.panel.fuel'), giro: t('juego.panel.giro'), min: t('juego.panel.min'), stall: t('juego.panel.stall'), arriba: t('juego.panel.arriba'), abajo: t('juego.panel.abajo') });

