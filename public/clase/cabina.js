// 0.14.98: la cabina por dentro, dibujada en un lienzo 2D: el marco del parabrisas, la visera, el tablero y sus
// instrumentos de verdad, vivos con los datos de vuelo:
//  - los seis básicos: velocidad (kt, con sus arcos), actitud (cabeceo con escalera y alabeo con su escala), altímetro (agujas
//    de los 100 y de los 1,000 ft, y la de los 10,000), coordinador de giro (con la marca del giro estándar), indicador de
//    rumbo (la tarjeta gira) y variómetro (ft/min);
//  - en el modo completo (el Juego), también el tacómetro (RPM), presión y temperatura del aceite, combustible y el yugo.
// Las agujas usan la misma matemática que el panel de las clases (instrumentos.js): las pruebas la revisan.
// Nada toca document ni window: el contexto llega de afuera.
//
// 0.14.118 (pedido del dueño: «la cabina por dentro hazlo más real… del mismo avión»): la cabina del Juego es la de un
// entrenador de ala alta de cuatro plazas, dibujada aquí a mano (sin modelos ni imágenes de afuera; ninguna marca):
//  - el techo tapizado con los parasoles, el marco del parabrisas, la brújula colgada arriba en el centro (con su tarjeta
//    viva), el termómetro del aire exterior y, en la PC, las ventanas de los costados con el montante del ala y el ala vista
//    desde abajo;
//  - la visera con su sombra sobre el tablero (de día), el tablero gris con textura, cada reloj en su caja con tornillos y
//    el vidrio con un reflejo; a la derecha (en pantallas anchas) el VOR, las radios, el transpondedor y el lado del copiloto;
//  - abajo: el MASTER (BAT/ALT), la llave de los magnetos, la fila de interruptores de las luces (en la posición real), el
//    calor al carburador, la palanca de potencia (negra: entra con más potencia), la mezcla (roja), el interruptor de los
//    flaps con su indicador (UP · 10 · 20 · 30), la rueda de compensación y los dos yugos (se mueven con el alabeo y el
//    cabeceo, como los de verdad: tirar los acerca);
//  - la luz: de día la del sol desde arriba; al atardecer, más tenue y cálida; de noche, el tablero oscuro con la luz roja
//    de la visera y las lucecitas de los relojes.
// Para que ande liviano (60 cuadros en el teléfono), lo que no se mueve (marco, tablero, cajas, caras con sus números y el
// vidrio) se dibuja una sola vez en lienzos aparte (opciones.crearLienzo) y cada cuadro solo se pintan las agujas, los
// mandos y los números vivos. Sin crearLienzo (las pruebas), todo se dibuja directo en el mismo orden.
import { agujaAnemometro, agujasAltimetro, agujaVariometro, tasaDeGiro, inclinacionCoordinador } from './instrumentos.js';

const rad = g => (g * Math.PI) / 180;
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const n360 = g => ((g % 360) + 360) % 360;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Los arcos del anemómetro (kt) de un entrenador de ala alta de cuatro plazas (los del manual de ese avión).
export const ARCOS_KT = Object.freeze({ blancoDesde: 33, blancoHasta: 85, verdeDesde: 44, verdeHasta: 129, amarilloHasta: 163, vne: 163 });
export const ARCOS_RPM = Object.freeze({ verdeDesde: 2100, verdeHasta: 2700, roja: 2700 });
// Tacómetro: 0 a 3,500 en 270°; relojes chicos del motor: 120°.
export const anguloRpm = rpm => -135 + (lim(num(rpm), 0, 3500) / 3500) * 270;
export const anguloArco = (v, min, max) => -60 + lim((num(v) - min) / (max - min), 0, 1) * 120;
// 0.14.118: los flaps del Juego: UP · 10 · 20 · 30 (el mando va de 0 a 1.5: 1 = 20°, como antes).
export const FLAPS_GRADOS = Object.freeze([0, 10, 20, 30]);
export const flapsAGrados = f => Math.round(lim(num(f), 0, 1.5) * 20);

// Los colores (de día, al atardecer y con la luz de los instrumentos de noche).
function colores(luz) {
  if (luz === 'noche') return { luz, cara: '#05070a', marca: '#ffd9b0', texto: '#ffe3c4', aguja: '#fff1e0', aro: '#2a2420', rotulo: '#d9a77a', panel: ['#191612', '#0e0c0a'], visera: '#080707', marco: '#050506', marco2: '#0e0f12', techo: ['#0d0d0f', '#060607'], caja: '#050505', tornillo: '#2a2622', bajo: '#0a0908', sombra: 0.1, puerta: '#0c0b0a' };
  if (luz === 'atardecer') return { luz, cara: '#0a0c10', marca: '#eceff4', texto: '#f6f2ea', aguja: '#ffffff', aro: '#4a4f58', rotulo: '#b7ad9e', panel: ['#2e2d31', '#1c1b1f'], visera: '#141417', marco: '#17181d', marco2: '#25262d', techo: ['#5d5850', '#3e3a35'], caja: '#141518', tornillo: '#6b6a68', bajo: '#18181b', sombra: 0.45, puerta: '#2a2724' };
  return { luz: 'dia', cara: '#0b0d11', marca: '#f2f4f8', texto: '#ffffff', aguja: '#ffffff', aro: '#59606c', rotulo: '#c3c9d2', panel: ['#45484f', '#2b2d33'], visera: '#1d1f24', marco: '#23262d', marco2: '#353943', techo: ['#b9b3a6', '#8f897d'], caja: '#18191c', tornillo: '#8d9096', bajo: '#232429', sombra: 0.5, puerta: '#4b4741' };
}

// Lo que el panel necesita (lo que falte, con un valor razonable). Devuelve todo listo para dibujar.
export function datosPanel(d = {}) {
  const kt = Math.max(0, num(d.kt)), ft = Math.max(0, num(d.ft)), alabeo = num(d.alabeo), cabeceo = num(d.cabeceo), rumbo = n360(num(d.rumbo));
  const vs = num(d.vs ?? d.subida), giro = d.tasaGiro != null ? num(d.tasaGiro) : kt > 1 ? tasaDeGiro(alabeo, kt) : 0;
  const alt = agujasAltimetro(ft);
  return {
    kt, ft, alabeo, cabeceo, rumbo, vs, tasaGiro: giro, rpm: num(d.rpm, 2350), aceitePsi: num(d.aceitePsi, 60), aceiteTemp: num(d.aceiteTemp, 185),
    combustible: num(d.combustible, 32), aviso: Boolean(d.aviso),
    agujas: { kt: agujaAnemometro(kt), cien: alt.cien, mil: alt.mil, diezmil: alt.diezmil, vs: agujaVariometro(vs), coordinador: inclinacionCoordinador(giro), rumbo: -rumbo,
      rpm: anguloRpm(d.rpm ?? 2350), aceitePsi: anguloArco(d.aceitePsi ?? 60, 0, 115), aceiteTemp: anguloArco(d.aceiteTemp ?? 185, 75, 250), combustible: anguloArco(d.combustible ?? 32, 0, 40) },
  };
}

// 0.14.118: dónde va cada cosa de la cabina del Juego (la cámara y las marcas del tráfico usan lo mismo).
// techo: hasta dónde baja el techo tapizado (px; allí van los botones y el consejo, nunca sobre el parabrisas).
// → { panel (alto del tablero), yp (dónde empieza), techo, ancha (PC: con radios y ventanas laterales), r (radio de un reloj),
//     xs (las tres columnas de los seis básicos), fila1, fila2, xm (la columna del motor), tira (la fila de abajo), alto1 }
// reserva { izq, der, abajo } (px): lo que tapan los mandos que flotan encima (0.14.119, el teléfono): los relojes van en lo
// que queda libre; el tablero, el marco y las ventanas siguen ocupando toda la pantalla (detrás de los mandos).
// compacto (0.14.121, el teléfono de lado; el dueño: «mejora esa vista en primera persona, ya que no se ve tanto»): el ojo más
// bajo: el tablero más bajito, con los seis básicos y el tacómetro en una sola fila (el parabrisas queda con más de la mitad).
export function geometriaCabina(ancho, alto, { escala = 1, techo = 0, reserva = null, compacto = false } = {}) {
  const izq = lim(num(reserva?.izq), 0, ancho * 0.45), der = lim(num(reserva?.der), 0, ancho * 0.45), abajo = lim(num(reserva?.abajo), 0, alto * 0.45);
  const W = ancho - izq - der, H = alto - abajo;
  if (compacto) {
    const panel = Math.max(H * 0.3, 110 * escala), yp = H - panel;
    const r = Math.min(W / (7 * 2.35) , panel * 0.29, 60 * escala), ancho1 = r * 2.35;
    const fila = yp + panel * 0.4, x0 = izq + W / 2 - ancho1 * 3;
    const xs = [x0, x0 + ancho1, x0 + ancho1 * 2], tira = yp + panel * 0.86, alto1 = panel * 0.2;
    const techoPx = lim(Math.max(num(techo), alto * 0.05), 0, Math.max(0, yp - alto * 0.12));
    return { panel, yp, techo: techoPx, ancha: false, compacto: true, r, ancho1, xs, fila1: fila, fila2: fila, xm: x0 + ancho1 * 6, tira, alto1, ancho, alto, izq, der, abajo, anchoUtil: W };
  }
  const panel = Math.max(H * (W > H * 1.3 ? 0.5 : 0.46), 170 * escala), yp = H - panel;
  const ancha = W >= H * 1.3 && W > 700 * escala;
  const r = Math.min((W / 4.6) * 0.42, panel * 0.165, 92 * escala), ancho1 = r * 2.42;
  const fila1 = yp + panel * 0.22, fila2 = yp + panel * 0.57, tira = yp + panel * 0.85, alto1 = panel * 0.17;
  const x0 = izq + (ancha ? W * 0.36 : W * 0.5 - ancho1 * 0.55);
  const xs = [x0 - ancho1, x0, x0 + ancho1];
  const xm = xs[2] + ancho1 * (ancha ? 1.02 : 1.1);
  const techoPx = lim(Math.max(num(techo), alto * 0.05), 0, Math.max(0, yp - alto * 0.12));
  return { panel, yp, techo: techoPx, ancha, r, ancho1, xs, fila1, fila2, xm, tira, alto1, ancho, alto, izq, der, abajo, anchoUtil: W };
}

// La cabina. datos: kt, ft, rumbo, alabeo, cabeceo, vs (o subida), tasaGiro, rpm, aceitePsi, aceiteTemp, combustible, aviso.
// opciones: escala (px por px CSS), textos, completo (el Juego: dos filas, motor y yugo), yugo { alabeo, cabeceo } (-1..1),
// noche (la luz de los instrumentos) u hora ('dia' | 'atardecer' | 'noche'), techo (px), crearLienzo (w, h) → lienzo
// (para guardar lo que no se mueve), extras (lo del Juego). → el alto (px) que tapa el tablero.
export function dibujarCabina(ctx, ancho, alto, datos, { escala = 1, textos = {}, completo = false, yugo = null, noche = false, hora = null, extras = null, techo = 0, reserva = null, compacto = false, crearLienzo = null } = {}) {
  const D = datosPanel(datos), luz = hora === 'noche' || hora === 'atardecer' || hora === 'dia' ? hora : noche ? 'noche' : 'dia';
  const C = colores(luz), T = k => textos[k] ?? TEXTOS_CABINA[k];
  if (!completo) return cabinaSimple(ctx, ancho, alto, D, C, escala, T);
  const G = geometriaCabina(ancho, alto, { escala, techo, reserva, compacto });
  const ex = extras ?? {};
  const conEgt = ex.egt != null;
  // Lo fijo: en un lienzo guardado (si se puede) o directo.
  const clave = `${ancho}x${alto}|${escala}|${luz}|${Math.round(G.techo)}|${Math.round(G.izq)},${Math.round(G.der)},${Math.round(G.abajo)}|${G.compacto ? 'c' : ''}|${conEgt ? 1 : 0}|${T('kt')}|${T('rpm')}`;
  const capas = crearLienzo ? capasFijas(crearLienzo, clave, ancho, alto, G, C, escala, T, conEgt) : null;
  if (capas) ctx.drawImage(capas.fondo, 0, 0);
  else fondoFijo(ctx, ancho, alto, G, C, escala, T, conEgt);
  // Lo que se mueve: las agujas y los números vivos (la primera, la del anemómetro), la brújula y los interruptores.
  agujasVivas(ctx, G, D, C, escala, T, ex);
  if (capas) ctx.drawImage(capas.vidrio, 0, Math.floor(G.yp));
  else vidrioFijo(ctx, G, C, escala, 0, conEgt);
  brujula(ctx, ancho / 2, G.techo, G, D.rumbo, C, escala);
  if (ex.grieta) grieta(ctx, G, escala, ex.grieta);
  mandosVivos(ctx, G, C, escala, T, ex, yugo);
  if (ex.g != null) {
    const g = num(ex.g, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; redondo(ctx, G.xs[0] - G.r, G.yp - 26 * escala, 62 * escala, 20 * escala, 5 * escala); ctx.fill();
    texto(ctx, `G ${g.toFixed(1)}`, G.xs[0] - G.r + 31 * escala, G.yp - 16 * escala, 13 * escala, g > 2.5 || g < 0 ? '#ff8278' : '#ffffff', 800);
  }
  if (D.aviso) luzPerdida(ctx, ancho, G.yp, escala, T);
  return alto - G.yp; // (lo que tapa el tablero, con lo de abajo)
}

// 0.14.119: con la cabeza girada (la cámara libre), lo que hay al costado: la puerta con su ventana, el ala vista desde
// abajo y el montante que baja hacia el fuselaje, el techo que sigue y el parante de atrás. Se dibuja a la izquierda (lado
// −1: de x = −ancho·1.2 a 0) o a la derecha (lado 1: de ancho a ancho·2.2), en las mismas coordenadas de la cabina.
export function dibujarLadoCabina(ctx, ancho, alto, { escala = 1, hora = 'dia', techo = 0, reserva = null, lado = -1 } = {}) {
  const C = colores(hora === 'noche' || hora === 'atardecer' ? hora : 'dia'), G = geometriaCabina(ancho, alto, { escala, techo, reserva });
  const W = ancho * 1.2, X = f => (lado < 0 ? -f * W : ancho + f * W), y0 = G.techo, sill = G.yp + 6 * escala;
  const noche = C.luz === 'noche';
  // Arriba y abajo de lo dibujado (al mirar arriba o abajo): más techo y más tablero.
  ctx.fillStyle = C.techo[1]; ctx.fillRect(-W * 2, -alto, ancho + W * 4, alto);
  ctx.fillStyle = C.bajo; ctx.fillRect(-W * 2, alto, ancho + W * 4, alto);
  if (!lado) return;
  // El techo que sigue.
  const gt = ctx.createLinearGradient(0, 0, 0, y0);
  gt.addColorStop(0, C.techo[1]); gt.addColorStop(1, C.techo[0]);
  ctx.fillStyle = gt; ctx.fillRect(Math.min(X(0), X(1)), -alto, W, alto + y0 + 4 * escala);
  // El ala desde abajo (arriba de la ventana: se ve casi toda) y su borde de ataque.
  const ga = ctx.createLinearGradient(0, y0, 0, y0 + alto * 0.2);
  ga.addColorStop(0, noche ? '#0c0d0f' : '#bfc4cb'); ga.addColorStop(1, noche ? '#16171a' : '#eceef1');
  ctx.fillStyle = ga;
  ctx.beginPath(); ctx.moveTo(X(0.02), y0); ctx.lineTo(X(1), y0); ctx.lineTo(X(1), y0 + alto * 0.06); ctx.lineTo(X(0.02), y0 + alto * 0.2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2 * escala; ctx.beginPath(); ctx.moveTo(X(1), y0 + alto * 0.06); ctx.lineTo(X(0.02), y0 + alto * 0.2); ctx.stroke();
  // El montante: desde abajo, junto a la puerta, sube hacia afuera hasta el ala.
  const gm = ctx.createLinearGradient(X(0.2), 0, X(0.3), 0);
  gm.addColorStop(0, noche ? '#111214' : '#a3a8b0'); gm.addColorStop(1, noche ? '#1b1c1f' : '#e4e7eb');
  ctx.fillStyle = gm;
  ctx.beginPath(); ctx.moveTo(X(0.3), sill); ctx.lineTo(X(0.36), sill); ctx.lineTo(X(0.86), y0 + alto * 0.09); ctx.lineTo(X(0.8), y0 + alto * 0.09); ctx.closePath(); ctx.fill();
  // El marco de la ventana (abajo la puerta, a los lados los parantes) y la puerta con su apoyabrazos.
  ctx.fillStyle = C.marco; ctx.fillRect(Math.min(X(0), X(0.03)), y0, W * 0.03, alto); ctx.fillRect(Math.min(X(0.97), X(1)), y0, W * 0.03, alto);
  ctx.fillStyle = C.puerta; ctx.fillRect(Math.min(X(0), X(1)), sill, W, alto - sill);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.min(X(0.1), X(0.7)), sill + (alto - sill) * 0.35, W * 0.6, Math.max(6, (alto - sill) * 0.08));
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(Math.min(X(0), X(1)), sill, W, 2 * escala);
}

// 0.14.121 (el dueño: «en vez de ver la velocidad así, ver el velocímetro… así veo bien la raya roja, blanca y amarilla»): los
// relojes de la vista de afuera, con el mismo dibujo que la cabina (los mismos arcos): velocidad (con los kt en número), actitud,
// altímetro y variómetro, en una fila. → { amarillo, rojo } (para avisar con el borde del panel).
export function dibujarRelojesAfuera(ctx, w, h, datos, { escala = 1, hora = 'dia', textos = {} } = {}) {
  const D = datosPanel(datos), C = colores(hora === 'noche' ? 'noche' : 'dia'), T = k => textos[k] ?? TEXTOS_CABINA[k];
  const n = 4, r = Math.min(h / 2.3, w / (n * 2.3)), paso = w / n, y = h / 2;
  const x = k => paso * (k + 0.5);
  for (let k = 0; k < n; k++) { ctx.fillStyle = '#5a606b'; ctx.beginPath(); ctx.arc(x(k), y, r * 1.07, 0, Math.PI * 2); ctx.fill(); }
  caraAnemometro(ctx, x(0), y, r, C, escala, T); agujaSimple(ctx, x(0), y, r, D.agujas.kt, C);
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(x(0) - r * 0.32, y + r * 0.1, r * 0.64, r * 0.26);
  texto(ctx, String(Math.round(D.kt)), x(0), y + r * 0.23, r * 0.22, '#ffffff', 800);
  actitud(ctx, x(1), y, r, D, C, escala);
  caraAltimetro(ctx, x(2), y, r, C, escala, T); vivoAltimetro(ctx, x(2), y, r, { ...D, ajuste: datos.ajuste }, C);
  caraVariometro(ctx, x(3), y, r, C, escala, T); agujaSimple(ctx, x(3), y, r, agujaVariometro(D.vs), C);
  return { amarillo: D.kt > ARCOS_KT.verdeHasta && D.kt <= ARCOS_KT.vne, rojo: D.kt > ARCOS_KT.vne };
}

// 0.14.124: un reloj suelto, con su caja, la cara, lo vivo y el vidrio (para la cabina 3D: se dibuja donde cae el tablero
// de verdad en la pantalla). id: 'kt' | 'actitud' | 'alt' | 'giro' | 'rumbo' | 'vs' | 'rpm' | 'fuel'.
export function relojVivo(ctx, id, x, y, r, datos, { escala = 1, hora = 'dia', textos = {}, extras = {}, caja = true } = {}) {
  const D = datosPanel(datos), C = colores(hora === 'noche' || hora === 'atardecer' ? hora : 'dia'), T = k => textos[k] ?? TEXTOS_CABINA[k], e = escala;
  if (caja) cajaReloj(ctx, x, y, r, C, e);
  if (C.luz === 'noche') lucecita(ctx, x, y, r);
  if (id === 'kt') { caraAnemometro(ctx, x, y, r, C, e, T); agujaSimple(ctx, x, y, r, D.agujas.kt, C); }
  else if (id === 'actitud') actitud(ctx, x, y, r, D, C, e);
  else if (id === 'alt') { caraAltimetro(ctx, x, y, r, C, e, T); vivoAltimetro(ctx, x, y, r, { ...D, ajuste: extras.ajuste }, C); }
  else if (id === 'giro') { caraCoordinador(ctx, x, y, r, C, e, T); vivoCoordinador(ctx, x, y, r, D, C); }
  else if (id === 'rumbo') rumboTarjeta(ctx, x, y, r, D, C, e);
  else if (id === 'vs') { caraVariometro(ctx, x, y, r, C, e, T); agujaSimple(ctx, x, y, r, agujaVariometro(D.vs), C); }
  else if (id === 'rpm') { caraTacometro(ctx, x, y, r, C, e, T); texto(ctx, String(Math.round(D.rpm / 10) * 10), x, y + r * 0.55, r * 0.15, C.texto, 700); agujaSimple(ctx, x, y, r, D.agujas.rpm, C); }
  else if (id === 'fuel') { caraChico(ctx, x, y, r, T('fuel'), C, e, [[0, 0.12, '#e5c33e']], ['E', 'F']); agujaChica(ctx, x, y, r, D.agujas.combustible, C); }
  // El vidrio: un reflejo suave arriba a la izquierda.
  const g = ctx.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.1);
  g.addColorStop(0, `rgba(255,255,255,${C.luz === 'noche' ? 0.04 : 0.12})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 1.9); ctx.closePath(); ctx.fill();
}

export const TEXTOS_CABINA = { egt: 'EGT', ff: 'FF', trim: 'TRIM', flaps: 'FLAPS', gases: 'THROTTLE', combustible: 'FUEL SEL', kt: 'KNOTS', ft: 'ALT', vsi: 'VERT SPEED', rpm: 'RPM ×100', psi: 'OIL P', temp: 'OIL T', fuel: 'FUEL', giro: 'TURN COORD', min: '2 MIN', stall: 'STALL', arriba: 'UP', abajo: 'DN', mezcla: 'MIXTURE', calor: 'CARB HEAT' };

// ---------- la cabina de las clases (más baja: solo los seis básicos) ----------
function cabinaSimple(ctx, ancho, alto, D, C, escala, T) {
  const panel = Math.max(alto * 0.27, 62 * escala), yp = alto - panel;
  marco(ctx, ancho, alto, yp, escala, C);
  const r = Math.min(panel * 0.36, ancho * 0.053), cy = yp + panel * 0.56;
  const xs = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8].map(k => ancho * k);
  // (el aro de cada reloj: en el Juego lo pone su caja; aquí, como siempre)
  for (const x of [xs[0], xs[2], xs[3], xs[4], xs[5]]) aroSimple(ctx, x, cy, r);
  caraAnemometro(ctx, xs[0], cy, r, C, escala, T); agujaSimple(ctx, xs[0], cy, r, D.agujas.kt, C);
  actitud(ctx, xs[1], cy, r, D, C, escala);
  caraAltimetro(ctx, xs[2], cy, r, C, escala, T); vivoAltimetro(ctx, xs[2], cy, r, D, C);
  caraCoordinador(ctx, xs[3], cy, r, C, escala, T); vivoCoordinador(ctx, xs[3], cy, r, D, C);
  rumboTarjeta(ctx, xs[4], cy, r, D, C, escala);
  caraVariometro(ctx, xs[5], cy, r, C, escala, T); agujaSimple(ctx, xs[5], cy, r, agujaVariometro(D.vs), C);
  if (D.aviso) luzPerdida(ctx, ancho, yp, escala, T);
  return panel;
}
function aroSimple(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.12);
  g.addColorStop(0, '#7a828f'); g.addColorStop(1, '#1b1e24');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();
}
function luzPerdida(ctx, ancho, yp, escala, T) {
  // La luz del aviso de pérdida (STALL), arriba del tablero.
  const w = 64 * escala, h = 18 * escala, x = ancho * 0.5 - w / 2, y = yp + 2 * escala;
  ctx.fillStyle = '#e5483e'; redondo(ctx, x, y, w, h, 4 * escala); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = `800 ${11 * escala}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(T('stall'), x + w / 2, y + h / 2 + 0.5);
}

// ---------- el marco de las clases (simple) ----------
function marco(ctx, ancho, alto, yp, e, C) {
  ctx.fillStyle = C.marco;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ancho, 0); ctx.lineTo(ancho, alto * 0.1);
  ctx.quadraticCurveTo(ancho / 2, alto * 0.025, 0, alto * 0.1); ctx.closePath(); ctx.fill();
  for (const lado of [0, 1]) {
    const X = v => (lado ? ancho - v : v);
    ctx.fillStyle = C.marco;
    ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(ancho * 0.07), 0); ctx.lineTo(X(ancho * 0.15), yp); ctx.lineTo(X(0), yp); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.marco2; ctx.lineWidth = 3 * e;
    ctx.beginPath(); ctx.moveTo(X(ancho * 0.07), 0); ctx.lineTo(X(ancho * 0.15), yp); ctx.stroke();
  }
  ctx.fillStyle = C.marco2; ctx.fillRect(ancho / 2 - 2 * e, 0, 4 * e, alto * 0.11);
  const vis = 14 * e;
  ctx.fillStyle = C.visera;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 0.6); ctx.quadraticCurveTo(ancho / 2, yp - vis * 1.6, ancho, yp + vis * 0.6);
  ctx.lineTo(ancho, yp + vis * 1.4); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.5, 0, yp + vis * 1.4); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(0, yp, 0, alto);
  g.addColorStop(0, C.panel[0]); g.addColorStop(1, C.panel[1]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 1.4); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.5, ancho, yp + vis * 1.4);
  ctx.lineTo(ancho, alto); ctx.lineTo(0, alto); ctx.closePath(); ctx.fill();
}

// ---------- lo fijo del Juego (en sus lienzos) ----------
let guardadas = null;
function capasFijas(crearLienzo, clave, ancho, alto, G, C, e, T, conEgt) {
  if (guardadas?.clave === clave) return guardadas;
  let fondo, vidrio;
  try {
    fondo = crearLienzo(ancho, alto); vidrio = crearLienzo(ancho, Math.max(1, Math.ceil(alto - Math.floor(G.yp))));
    const f = fondo?.getContext?.('2d'), v = vidrio?.getContext?.('2d');
    if (!f || !v) return null;
    fondoFijo(f, ancho, alto, G, C, e, T, conEgt);
    vidrioFijo(v, G, C, e, Math.floor(G.yp), conEgt);
  } catch { return null; }
  guardadas = { clave, fondo, vidrio };
  return guardadas;
}
// Dónde está cada reloj (y su radio) en el Juego.
function relojes(G, conEgt) {
  const { xs, fila1, fila2, r, xm, ancha, ancho1 } = G;
  if (G.compacto) {
    // Una fila: velocidad, actitud, altímetro, coordinador, rumbo, variómetro y el tacómetro (los del motor, en «Componentes»).
    const y = fila1, x = k => xs[0] + ancho1 * k;
    return [{ id: 'kt', x: x(0), y, r }, { id: 'actitud', x: x(1), y, r }, { id: 'alt', x: x(2), y, r }, { id: 'giro', x: x(3), y, r }, { id: 'rumbo', x: x(4), y, r }, { id: 'vs', x: x(5), y, r }, { id: 'rpm', x: x(6), y, r: r * 0.92 }];
  }
  const rc = r * 0.44;
  const lista = [
    { id: 'kt', x: xs[0], y: fila1, r }, { id: 'actitud', x: xs[1], y: fila1, r }, { id: 'alt', x: xs[2], y: fila1, r },
    { id: 'giro', x: xs[0], y: fila2, r }, { id: 'rumbo', x: xs[1], y: fila2, r }, { id: 'vs', x: xs[2], y: fila2, r },
    { id: 'rpm', x: xm, y: ancha ? fila2 : fila1, r: r * 0.92 },
  ];
  // Los relojes chicos del motor: a la izquierda de los seis en la PC; a la derecha, debajo del tacómetro, en el teléfono.
  const cx = ancha ? xs[0] - ancho1 * 0.98 : xm, cy = ancha ? (fila1 + fila2) / 2 : fila2;
  lista.push({ id: 'psi', x: cx - rc * 1.15, y: cy - rc * 0.55 - (ancha ? rc * 0.9 : 0), r: rc }, { id: 'temp', x: cx + rc * 1.15, y: cy - rc * 0.55 - (ancha ? rc * 0.9 : 0), r: rc });
  if (conEgt) lista.push({ id: 'fuel', x: cx - rc * 1.15, y: cy + rc * 0.95 + (ancha ? rc * 0.4 : 0), r: rc }, { id: 'egt', x: cx + rc * 1.15, y: cy + rc * 0.95 + (ancha ? rc * 0.4 : 0), r: rc });
  else lista.push({ id: 'fuel', x: cx, y: cy + rc * 0.95, r: rc });
  if (ancha) lista.push({ id: 'vor', x: xm, y: fila1, r: r * 0.92 });
  return lista;
}

function fondoFijo(ctx, ancho, alto, G, C, e, T, conEgt) {
  cabinaMarco(ctx, ancho, alto, G, C, e);
  tablero(ctx, ancho, alto, G, C, e);
  const lista = relojes(G, conEgt);
  for (const q of lista) cajaReloj(ctx, q.x, q.y, q.r, C, e);
  if (C.luz === 'noche') for (const q of lista) lucecita(ctx, q.x, q.y, q.r);
  for (const q of lista) {
    if (q.id === 'kt') caraAnemometro(ctx, q.x, q.y, q.r, C, e, T);
    else if (q.id === 'alt') caraAltimetro(ctx, q.x, q.y, q.r, C, e, T);
    else if (q.id === 'giro') caraCoordinador(ctx, q.x, q.y, q.r, C, e, T);
    else if (q.id === 'vs') caraVariometro(ctx, q.x, q.y, q.r, C, e, T);
    else if (q.id === 'rpm') caraTacometro(ctx, q.x, q.y, q.r, C, e, T);
    else if (q.id === 'vor') caraVor(ctx, q.x, q.y, q.r, C, e);
    else if (q.id === 'psi') caraChico(ctx, q.x, q.y, q.r, T('psi'), C, e, [[0.25, 0.85, '#2fbf5b'], [0, 0.08, '#e5483e']]);
    else if (q.id === 'temp') caraChico(ctx, q.x, q.y, q.r, T('temp'), C, e, [[0.4, 0.85, '#2fbf5b'], [0.94, 1, '#e5483e']]);
    else if (q.id === 'fuel') caraChico(ctx, q.x, q.y, q.r, T('fuel'), C, e, [[0, 0.12, '#e5c33e']], ['E', 'F']);
    else if (q.id === 'egt') caraChico(ctx, q.x, q.y, q.r, T('egt'), C, e, []);
  }
  if (G.ancha) radios(ctx, G, C, e);
  rotulosAbajo(ctx, G, C, e, T);
}

// El techo tapizado, los parasoles, el marco del parabrisas, los parantes, las ventanas de los costados (en la PC: el
// montante del ala y el ala vista desde abajo), la visera y su sombra.
function cabinaMarco(ctx, ancho, alto, G, C, e) {
  const { yp, techo } = G;
  // Las ventanas de los costados (solo en la PC: en el teléfono de pie no entran en la vista).
  const pil = G.ancha ? ancho * 0.105 : ancho * 0.07; // dónde termina el parante (abajo, junto a la visera)
  const pilArriba = G.ancha ? ancho * 0.055 : ancho * 0.035;
  if (G.ancha) for (const lado of [0, 1]) {
    const X = v => (lado ? ancho - v : v);
    // El ala vista desde abajo (arriba de la ventana) y el montante que baja hacia afuera.
    const g = ctx.createLinearGradient(0, techo, 0, techo + alto * 0.12);
    g.addColorStop(0, C.luz === 'noche' ? '#0b0c0e' : C.luz === 'atardecer' ? '#6d6a68' : '#c9cdd3'); g.addColorStop(1, C.luz === 'noche' ? '#141518' : C.luz === 'atardecer' ? '#8a8682' : '#e7e9ec');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(X(0), techo); ctx.lineTo(X(pilArriba + 2 * e), techo); ctx.lineTo(X(pilArriba * 0.5), techo + alto * 0.11); ctx.lineTo(X(0), techo + alto * 0.14); ctx.closePath(); ctx.fill();
    // (el borde de ataque del ala, un poco más oscuro)
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2 * e;
    ctx.beginPath(); ctx.moveTo(X(pilArriba * 0.5), techo + alto * 0.11); ctx.lineTo(X(0), techo + alto * 0.14); ctx.stroke();
    // El montante (perfilado): desde abajo, cerca del parante, hasta el ala, afuera.
    const sm = ctx.createLinearGradient(X(pil * 0.2), 0, X(pil * 0.5), 0);
    sm.addColorStop(0, C.luz === 'noche' ? '#111214' : '#a9adb4'); sm.addColorStop(1, C.luz === 'noche' ? '#1a1b1e' : '#e2e5ea');
    ctx.fillStyle = sm;
    ctx.beginPath(); ctx.moveTo(X(pil * 0.92), yp + 6 * e); ctx.lineTo(X(pil * 0.78), yp + 6 * e); ctx.lineTo(X(0), techo + alto * 0.16); ctx.lineTo(X(0), techo + alto * 0.13); ctx.closePath(); ctx.fill();
  }
  // El techo (tapizado claro, con costuras) que llega hasta el borde de arriba del parabrisas.
  const gt = ctx.createLinearGradient(0, 0, 0, techo + 10 * e);
  gt.addColorStop(0, C.techo[1]); gt.addColorStop(1, C.techo[0]);
  ctx.fillStyle = gt;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ancho, 0); ctx.lineTo(ancho, techo + 4 * e);
  ctx.quadraticCurveTo(ancho / 2, techo - 12 * e, 0, techo + 4 * e); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1.5 * e;
  ctx.beginPath();
  for (const k of [0.25, 0.5, 0.75]) { ctx.moveTo(ancho * k, 0); ctx.lineTo(ancho * k, techo - 6 * e); }
  ctx.stroke();
  // Los parasoles (levantados), a la izquierda y a la derecha.
  for (const lado of [0, 1]) {
    const w = ancho * (G.ancha ? 0.2 : 0.3), h = Math.min(techo * 0.55, 34 * e), x = lado ? ancho * 0.97 - w : ancho * 0.03, y = Math.max(0, techo - h - 6 * e);
    if (h < 8 * e) continue;
    ctx.fillStyle = C.luz === 'noche' ? '#0a0a0b' : C.luz === 'atardecer' ? '#4b4741' : '#7f796d';
    redondo(ctx, x, y, w, h, 6 * e); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1 * e; ctx.stroke();
  }
  // El borde del parabrisas (la junta negra) bajo el techo.
  ctx.strokeStyle = C.marco; ctx.lineWidth = 7 * e;
  ctx.beginPath(); ctx.moveTo(pilArriba, techo + 4 * e); ctx.quadraticCurveTo(ancho / 2, techo - 12 * e, ancho - pilArriba, techo + 4 * e); ctx.stroke();
  // Los parantes (anchos abajo, finos arriba), con el brillo en el borde de adentro y la sombra hacia afuera.
  for (const lado of [0, 1]) {
    const X = v => (lado ? ancho - v : v);
    const g = ctx.createLinearGradient(X(0), 0, X(pil), 0);
    g.addColorStop(0, C.marco); g.addColorStop(0.75, C.marco2); g.addColorStop(1, C.marco);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (G.ancha) { ctx.moveTo(X(pilArriba - ancho * 0.028), 0); ctx.lineTo(X(pilArriba + ancho * 0.004), 0); ctx.lineTo(X(pil), yp + 8 * e); ctx.lineTo(X(pil - ancho * 0.04), yp + 8 * e); }
    else { ctx.moveTo(X(0), 0); ctx.lineTo(X(pilArriba), 0); ctx.lineTo(X(pil), yp + 8 * e); ctx.lineTo(X(0), yp + 8 * e); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2 * e;
    ctx.beginPath(); ctx.moveTo(X(pilArriba + (G.ancha ? ancho * 0.004 : 0)), 0); ctx.lineTo(X(pil), yp); ctx.stroke();
    // En la PC: la puerta debajo de la ventana (el marco de abajo).
    if (G.ancha) { ctx.fillStyle = C.puerta; ctx.beginPath(); ctx.moveTo(X(0), yp + 4 * e); ctx.lineTo(X(pil - ancho * 0.04), yp + 4 * e); ctx.lineTo(X(pil - ancho * 0.04), alto); ctx.lineTo(X(0), alto); ctx.closePath(); ctx.fill(); }
  }
  // El termómetro del aire exterior (arriba a la izquierda del parabrisas).
  const ro = Math.max(5 * e, G.r * 0.16), xo = G.ancha ? ancho * 0.2 : ancho * 0.16, yo = techo + ro * 1.6;
  ctx.fillStyle = '#0d0e10'; ctx.beginPath(); ctx.arc(xo, yo, ro, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6d7079'; ctx.lineWidth = 1 * e; ctx.stroke();
  ctx.strokeStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(xo, yo); ctx.lineTo(xo + ro * 0.6, yo - ro * 0.5); ctx.stroke();
}

// El tablero: la visera con su sombra, la chapa gris con textura (rayitas muy suaves), la tira de abajo y, de noche, la
// luz roja que baja de la visera.
function tablero(ctx, ancho, alto, G, C, e) {
  const { yp } = G, vis = 16 * e;
  const g = ctx.createLinearGradient(0, yp, 0, alto);
  g.addColorStop(0, C.panel[0]); g.addColorStop(1, C.panel[1]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 1.2); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.6, ancho, yp + vis * 1.2); ctx.lineTo(ancho, alto); ctx.lineTo(0, alto); ctx.closePath(); ctx.fill();
  // La textura: rayitas horizontales casi invisibles (una sola vez: está guardado).
  ctx.save(); ctx.globalAlpha = C.luz === 'noche' ? 0.03 : 0.05; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = Math.round(yp + vis); y < alto; y += Math.max(3, Math.round(3 * e))) { ctx.moveTo(0, y); ctx.lineTo(ancho, y + ((y * 7) % 3) - 1); }
  ctx.stroke(); ctx.restore();
  // La tira de abajo (interruptores y mandos), un poco más oscura, con su borde.
  const yb = G.tira - G.alto1 * 0.62;
  ctx.fillStyle = C.bajo; ctx.fillRect(0, yb, ancho, alto - yb);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5 * e; ctx.beginPath(); ctx.moveTo(0, yb); ctx.lineTo(ancho, yb); ctx.stroke();
  // La sombra de la visera sobre el tablero (de día, fuerte; de noche, nada).
  if (C.sombra) {
    const s = ctx.createLinearGradient(0, yp, 0, yp + G.panel * 0.3);
    s.addColorStop(0, `rgba(0,0,0,${C.sombra})`); s.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = s; ctx.fillRect(0, yp, ancho, G.panel * 0.3);
  } else {
    // La luz roja de la visera: un brillo que baja.
    const s = ctx.createLinearGradient(0, yp, 0, yp + G.panel * 0.45);
    s.addColorStop(0, 'rgba(255,60,40,0.22)'); s.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = s; ctx.fillRect(0, yp, ancho, G.panel * 0.45);
  }
  // La visera (curva, acolchada, con el borde de abajo que brilla un poco).
  const gv = ctx.createLinearGradient(0, yp - vis * 1.5, 0, yp + vis * 1.3);
  gv.addColorStop(0, C.visera); gv.addColorStop(0.8, C.visera); gv.addColorStop(1, '#000000');
  ctx.fillStyle = gv;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 0.4); ctx.quadraticCurveTo(ancho / 2, yp - vis * 2.2, ancho, yp + vis * 0.4);
  ctx.lineTo(ancho, yp + vis * 1.3); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.5, 0, yp + vis * 1.3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.luz === 'noche' ? 'rgba(255,80,60,0.35)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5 * e;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 1.3); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.5, ancho, yp + vis * 1.3); ctx.stroke();
}
// La caja de un reloj: cuadrada con las puntas redondeadas, cuatro tornillos y el aro.
function cajaReloj(ctx, x, y, r, C, e) {
  const s = r * 1.16;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; redondo(ctx, x - s + 2 * e, y - s + 3 * e, s * 2, s * 2, r * 0.28); ctx.fill();
  ctx.fillStyle = C.caja; redondo(ctx, x - s, y - s, s * 2, s * 2, r * 0.28); ctx.fill();
  ctx.fillStyle = C.tornillo;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x + dx * s * 0.8, y + dy * s * 0.8, Math.max(1.5, r * 0.05), 0, Math.PI * 2); ctx.fill(); }
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.12);
  g.addColorStop(0, C.luz === 'noche' ? '#2a2622' : '#7a828f'); g.addColorStop(1, C.luz === 'noche' ? '#080706' : '#15171b');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.fill();
}
// De noche: la lucecita de cada reloj (cálida, arriba) que ilumina la cara.
function lucecita(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y - r * 0.9, 0, x, y - r * 0.9, r * 1.6);
  g.addColorStop(0, 'rgba(255,170,110,0.35)'); g.addColorStop(1, 'rgba(255,170,110,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r * 1.6, y - r * 2.4, r * 3.2, r * 3.2);
}
// El vidrio de los relojes: un reflejo suave arriba a la izquierda (encima de las agujas).
function vidrioFijo(ctx, G, C, e, dy, conEgt) {
  for (const q of relojes(G, conEgt)) {
    const x = q.x, y = q.y - dy, r = q.r;
    const g = ctx.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.1);
    const a = C.luz === 'noche' ? 0.04 : 0.13;
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 1.9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(1, r * 0.04); ctx.beginPath(); ctx.arc(x, y, r * 1.01, 0, Math.PI * 2); ctx.stroke();
  }
}
// Las radios (en la PC): el panel de audio, dos NAV/COM, el transpondedor; y el lado del copiloto con la guantera.
function radios(ctx, G, C, e) {
  const { r, xm, fila1, yp, panel, ancho } = G;
  const x0 = xm + r * 1.25, w = Math.min(r * 3.7, ancho * 0.2), y0 = yp + panel * 0.06, h = panel * 0.66;
  ctx.fillStyle = '#0c0d0f'; redondo(ctx, x0, y0, w, h, 6 * e); ctx.fill();
  const filas = [['AUDIO', null], ['COM1 118.300', 'NAV1 110.50'], ['COM2 121.900', 'NAV2 113.90'], ['XPDR 1200', 'ALT']];
  const fh = h / filas.length;
  filas.forEach(([a, b], k) => {
    const y = y0 + fh * k + fh * 0.12, hh = fh * 0.76;
    ctx.fillStyle = '#1b1d21'; redondo(ctx, x0 + w * 0.04, y, w * 0.92, hh, 4 * e); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1 * e; ctx.stroke();
    if (b == null) {
      // El panel de audio: una fila de botoncitos con sus luces.
      for (let i = 0; i < 8; i++) { const bx = x0 + w * (0.1 + i * 0.105); ctx.fillStyle = '#3a3d44'; redondo(ctx, bx, y + hh * 0.3, w * 0.07, hh * 0.4, 2 * e); ctx.fill(); ctx.fillStyle = i === 1 || i === 4 ? (C.luz === 'noche' ? '#7dff9a' : '#59d97a') : '#26282c'; ctx.fillRect(bx + w * 0.02, y + hh * 0.18, w * 0.03, hh * 0.08); }
      return;
    }
    // Las pantallas: verdes (COM/NAV) o ámbar (transpondedor), con las perillas.
    ctx.fillStyle = '#050605'; ctx.fillRect(x0 + w * 0.1, y + hh * 0.22, w * 0.62, hh * 0.56);
    const col = k === 3 ? '#ffb347' : '#79f29a';
    texto(ctx, a, x0 + w * 0.41, y + hh * 0.5, hh * 0.26, col, 700, 'ui-monospace, Menlo, monospace');
    texto(ctx, b, x0 + w * 0.86, y + hh * 0.2, hh * 0.16, C.rotulo, 700);
    for (const kk of [0, 1]) { ctx.fillStyle = '#2c2f35'; ctx.beginPath(); ctx.arc(x0 + w * 0.86, y + hh * (0.5 + kk * 0.2), hh * (0.2 - kk * 0.07), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke(); }
  });
  // El lado del copiloto: la guantera y el horómetro.
  const xg = x0 + w + r * 0.4, wg = Math.max(0, ancho * 0.94 - xg);
  if (wg > r) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2 * e; redondo(ctx, xg, fila1 + r * 0.2, wg, panel * 0.33, 10 * e); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(xg + wg * 0.42, fila1 + r * 0.32, wg * 0.16, 4 * e);
    ctx.fillStyle = '#0b0c0e'; ctx.fillRect(xg + wg * 0.1, yp + panel * 0.08, wg * 0.24, panel * 0.07);
    texto(ctx, '1234.5', xg + wg * 0.22, yp + panel * 0.115, panel * 0.04, '#e9e9e9', 700, 'ui-monospace, Menlo, monospace');
  }
}
// Los rótulos de la tira de abajo (los mandos se dibujan vivos).
function rotulosAbajo(ctx, G, C, e, T) {
  const P = posicionesAbajo(G), px = G.ancha ? Math.max(6, Math.min(8.5 * e, G.r * 0.12)) : Math.max(6, Math.min(7 * e, G.r * 0.17));
  texto(ctx, T('gases'), P.gases, P.yRotulo, px, C.rotulo, 700);
  texto(ctx, T('mezcla'), P.mezcla, P.yRotulo, px, C.rotulo, 700);
  if (P.calor != null) texto(ctx, T('calor'), P.calor, P.yRotulo, px, C.rotulo, 700);
  texto(ctx, T('flaps'), P.flaps - G.alto1 * 0.22, P.yRotulo, px, C.rotulo, 700);
  texto(ctx, T('trim'), P.trim, P.yRotulo, px, C.rotulo, 700);
  if (P.llave != null) { texto(ctx, 'MAGNETOS', P.llave, P.yRotulo, px, C.rotulo, 700); }
  if (P.master != null) texto(ctx, 'MASTER', P.master, P.yRotulo, px, C.rotulo, 700);
  if (P.luces) P.luces.forEach(([x, k]) => texto(ctx, k, x, P.yRotulo, Math.max(6, Math.min(7 * e, G.r * 0.095)), C.rotulo, 700));
}
// Dónde va cada mando de abajo (PC o teléfono).
export function posicionesAbajo(G) {
  const { xs, r, xm, tira, alto1, ancha, ancho1, ancho } = G;
  const yRotulo = tira - alto1 * 0.48;
  if (ancha) {
    const xr = xm + r * 1.25, w = Math.min(r * 3.7, ancho * 0.2);
    const luces = ['BCN', 'LAND', 'TAXI', 'NAV', 'STROBE'].map((k, i) => [xs[0] - ancho1 * 0.15 + i * r * 0.5, k]);
    return { yRotulo, master: xs[0] - ancho1 * 1.2, llave: xs[0] - ancho1 * 0.68, luces, calor: xr + w * 0.06, gases: xr + w * 0.3, mezcla: xr + w * 0.54, flaps: xr + w * 0.86, trim: xs[2] + r * 0.62, trimY: tira + alto1 * 0.05 };
  }
  return { yRotulo, master: null, llave: xm, luces: null, calor: null, gases: xs[2] - r * 0.4, mezcla: xs[2] + r * 0.6, flaps: xs[0] + r * 0.45, trim: xs[0] - r * 0.55, trimY: tira + alto1 * 0.05 };
}

// ---------- lo vivo ----------
function agujasVivas(ctx, G, D, C, e, T, ex) {
  const L = relojes(G, ex.egt != null), q = id => L.find(o => o.id === id);
  let o = q('kt'); agujaSimple(ctx, o.x, o.y, o.r, D.agujas.kt, C);
  o = q('actitud'); actitud(ctx, o.x, o.y, o.r, D, C, e);
  o = q('alt'); vivoAltimetro(ctx, o.x, o.y, o.r, { ...D, ajuste: ex.ajuste }, C);
  o = q('giro'); vivoCoordinador(ctx, o.x, o.y, o.r, D, C);
  o = q('rumbo'); rumboTarjeta(ctx, o.x, o.y, o.r, D, C, e);
  o = q('vs'); agujaSimple(ctx, o.x, o.y, o.r, agujaVariometro(D.vs), C);
  o = q('rpm'); texto(ctx, String(Math.round(D.rpm / 10) * 10), o.x, o.y + o.r * 0.55, o.r * 0.15, C.texto, 700); agujaSimple(ctx, o.x, o.y, o.r, D.agujas.rpm, C);
  o = q('psi'); if (o) agujaChica(ctx, o.x, o.y, o.r, D.agujas.aceitePsi, C);
  o = q('temp'); if (o) agujaChica(ctx, o.x, o.y, o.r, D.agujas.aceiteTemp, C);
  o = q('fuel'); if (o) agujaChica(ctx, o.x, o.y, o.r, D.agujas.combustible, C);
  o = q('egt'); if (o) agujaChica(ctx, o.x, o.y, o.r, anguloArco(ex.egt, 1000, 1600), C);
  o = q('vor'); if (o) vivoVor(ctx, o.x, o.y, o.r, D, C);
  // El flujo de combustible (gal/h), debajo del reloj de la EGT.
  if (ex.egt != null && G.ancha && q('egt')) { const eg = q('egt'); texto(ctx, `${T('ff')} ${num(ex.ff, 0).toFixed(1)}`, eg.x, eg.y + eg.r * 1.45, Math.max(8, eg.r * 0.34), C.texto, 700); }
}

// 0.14.123: el parabrisas rajado por un pájaro: el golpe (blanco, opaco), las grietas en estrella y un velo alrededor.
function grieta(ctx, G, e, k) {
  dibujarGrieta(ctx, G.izq + G.anchoUtil * 0.62, G.techo + (G.yp - G.techo) * 0.38, Math.min(G.anchoUtil, G.yp - G.techo) * 0.42 * Math.min(1, k), e);
}
export function dibujarGrieta(ctx, x, y, R, e = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, 'rgba(235,240,245,0.55)'); g.addColorStop(0.35, 'rgba(220,226,232,0.22)'); g.addColorStop(1, 'rgba(220,226,232,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, 1.2 * e); ctx.beginPath();
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + Math.sin(i * 7.3) * 0.25, px = x, py = y;
    const largo = R * (0.55 + 0.45 * Math.abs(Math.sin(i * 3.1)));
    ctx.moveTo(px, py);
    for (let j = 1; j <= 4; j++) { a += Math.sin(i * 5.7 + j) * 0.18; px = x + Math.cos(a) * largo * (j / 4); py = y + Math.sin(a) * largo * (j / 4); ctx.lineTo(px, py); }
  }
  for (const f of [0.25, 0.5]) { ctx.moveTo(x + R * f, y); ctx.arc(x, y, R * f, 0, Math.PI * 2); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(250,250,250,0.8)'; ctx.beginPath(); ctx.arc(x, y, R * 0.06, 0, Math.PI * 2); ctx.fill();
}

// La brújula: colgada arriba en el centro del parabrisas; la tarjeta (con N, 3, 6, E…) corre con el rumbo.
function brujula(ctx, x, techo, G, rumbo, C, e) {
  const w = Math.max(46 * e, G.r * 1.25), h = w * 0.62, y = techo + 4 * e;
  // El soporte y la caja negra.
  ctx.fillStyle = '#101113'; ctx.fillRect(x - w * 0.08, techo - 6 * e, w * 0.16, 10 * e);
  ctx.fillStyle = '#16171a'; redondo(ctx, x - w / 2, y, w, h, h * 0.3); ctx.fill();
  ctx.strokeStyle = '#3d4048'; ctx.lineWidth = 1 * e; ctx.stroke();
  // La ventana con la tarjeta (fondo negro, números blancos).
  const vx = x - w * 0.38, vy = y + h * 0.18, vw = w * 0.76, vh = h * 0.6;
  ctx.save();
  ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip();
  ctx.fillStyle = C.luz === 'noche' ? '#120d08' : '#050505'; ctx.fillRect(vx, vy, vw, vh);
  const pxg = vw / 70; // 70° a la vista
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, e);
  ctx.beginPath();
  const desde = Math.floor((rumbo - 40) / 5) * 5;
  for (let g = desde; g <= rumbo + 40; g += 5) {
    const xx = x + (g - rumbo) * pxg, largo = g % 30 === 0 ? 0.32 : g % 10 === 0 ? 0.22 : 0.12;
    ctx.moveTo(xx, vy + vh); ctx.lineTo(xx, vy + vh * (1 - largo));
  }
  ctx.stroke();
  const nombres = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let g = Math.ceil((rumbo - 40) / 30) * 30; g <= rumbo + 40; g += 30) {
    const k = n360(g), s = nombres[k] ?? String(k / 10);
    texto(ctx, s, x + (g - rumbo) * pxg, vy + vh * 0.38, vh * 0.42, nombres[k] ? '#ffb020' : C.texto, 800);
  }
  ctx.restore();
  // La línea de fe (roja) en el centro.
  ctx.strokeStyle = '#e5483e'; ctx.lineWidth = Math.max(1.5, 1.6 * e); ctx.beginPath(); ctx.moveTo(x, vy - 1); ctx.lineTo(x, vy + vh + 1); ctx.stroke();
}

// Los mandos de abajo: interruptores, llave, calor, potencia, mezcla, flaps, compensación y los yugos.
function mandosVivos(ctx, G, C, e, T, ex, yugo) {
  const P = posicionesAbajo(G), { tira, alto1, r } = G;
  const luces = ex.luces ?? {};
  // El MASTER (BAT/ALT rojo) y los interruptores de las luces (arriba = ON).
  if (P.master != null) { interruptor(ctx, P.master - r * 0.14, tira, r * 0.22, ex.master !== false, '#c5392f', e); interruptor(ctx, P.master + r * 0.14, tira, r * 0.22, ex.master !== false, '#c5392f', e); }
  if (P.luces) { const llaves = { BCN: 'baliza', LAND: 'aterrizaje', TAXI: 'rodaje', NAV: 'nav', STROBE: 'estrobo' }; for (const [x, k] of P.luces) interruptor(ctx, x, tira, r * 0.2, Boolean(luces[llaves[k]]), '#d8dbe0', e); }
  if (P.llave != null) llave(ctx, P.llave, tira + alto1 * 0.05, alto1 * 0.32, ex.magnetos ?? 'BOTH', C, e);
  // Los tiradores: más afuera = menos (potencia y mezcla); el calor al carburador, afuera = encendido.
  const L = alto1 * 0.55;
  if (P.calor != null) tirador(ctx, P.calor, tira, L, ex.calor ? 1 : 0, '#7d828b', alto1 * 0.17, e, false);
  tirador(ctx, P.gases, tira, L, 1 - lim(num(ex.potencia, 0), 0, 1), '#121315', alto1 * 0.2, e, false);
  tirador(ctx, P.mezcla, tira, L, 1 - lim(num(ex.mezcla, 1), 0, 1), '#c1271e', alto1 * 0.19, e, true);
  // Los flaps: la palanca (donde se pidió) y el indicador (donde están).
  palancaFlaps(ctx, P.flaps, tira, alto1, num(ex.flapsMando, ex.flaps ?? 0), num(ex.flaps, 0), C, e);
  // La compensación (la rueda negra entre los asientos, con su marca).
  ruedaTrim(ctx, P.trim, P.trimY, alto1, num(ex.trim, 0), C, e);
  // Los yugos: el del piloto bajo los seis básicos; en la PC, también el del copiloto (se mueven juntos).
  if (yugo) {
    const w = Math.min(G.anchoUtil * 0.36, G.panel * 1.05, r * 3.4);
    dibujarYugo(ctx, G, G.xs[1], w, yugo, e, C);
    if (G.ancha) dibujarYugo(ctx, G, G.ancho * 0.9, w * 0.92, yugo, e, C);
  }
}
function interruptor(ctx, x, y, h, on, color, e) {
  const w = h * 0.55;
  ctx.fillStyle = '#0a0a0b'; redondo(ctx, x - w / 2, y - h / 2, w, h, 2 * e); ctx.fill();
  ctx.fillStyle = color; redondo(ctx, x - w * 0.36, on ? y - h * 0.46 : y - h * 0.02, w * 0.72, h * 0.48, 2 * e); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - w * 0.3, on ? y - h * 0.44 : y + h * 0.36, w * 0.6, h * 0.08);
}
function llave(ctx, x, y, r, pos, C, e) {
  const ANG = { OFF: -60, R: -20, L: 20, BOTH: 60, START: 95 };
  ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a5e66'; ctx.lineWidth = 1.5 * e; ctx.stroke();
  for (const [k, a] of Object.entries(ANG)) { const s = Math.sin(rad(a)), c = Math.cos(rad(a)); texto(ctx, k === 'START' ? 'S' : k === 'BOTH' ? 'B' : k, x + s * r * 1.35, y - c * r * 1.35, Math.max(6, r * 0.38), pos === k ? '#ffb020' : C.rotulo, 700); }
  // La llave (plateada) en la posición.
  const a = rad(ANG[pos] ?? 60), s = Math.sin(a), c = Math.cos(a);
  ctx.strokeStyle = '#c9ccd2'; ctx.lineWidth = r * 0.32; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * r * 0.55, y + c * r * 0.55); ctx.lineTo(x + s * r * 0.75, y - c * r * 0.75); ctx.stroke();
  ctx.lineCap = 'butt';
}
// Un tirador (palanca de empujar y tirar): el eje cromado y la perilla; afuera (0..1) cuánto sale.
function tirador(ctx, x, y, largo, afuera, color, r, e, estriado) {
  const sale = lim(afuera, 0, 1) * largo, k = 1 + sale / largo * 0.25;
  // El agujero en el tablero.
  ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.ellipse(x, y - largo * 0.15, r * 0.4, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  // El eje (sale hacia el piloto: hacia abajo en la pantalla).
  const g = ctx.createLinearGradient(x - r * 0.2, 0, x + r * 0.2, 0);
  g.addColorStop(0, '#6e737b'); g.addColorStop(0.5, '#e8ebef'); g.addColorStop(1, '#5d6168');
  ctx.fillStyle = g; ctx.fillRect(x - r * 0.16, y - largo * 0.15, r * 0.32, sale + r * 0.1);
  // La perilla (más grande cuanto más afuera: más cerca).
  const py = y - largo * 0.15 + sale, rr = r * k;
  const gp = ctx.createRadialGradient(x - rr * 0.35, py - rr * 0.4, rr * 0.1, x, py, rr);
  gp.addColorStop(0, estriado ? '#ff6a5c' : color === '#121315' ? '#5a5e66' : '#c9ccd2'); gp.addColorStop(1, color);
  ctx.fillStyle = gp; ctx.beginPath(); ctx.ellipse(x, py, rr, rr * 0.86, 0, 0, Math.PI * 2); ctx.fill();
  if (estriado) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, rr * 0.08); ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(x + i * rr * 0.3, py - rr * 0.7); ctx.lineTo(x + i * rr * 0.3, py + rr * 0.7); } ctx.stroke(); }
}
// El interruptor de los flaps (la palanca con forma de flap) y el indicador al lado (UP · 10 · 20 · 30).
function palancaFlaps(ctx, x, y, h, mando, real, C, e) {
  const top = y - h * 0.42, alto = h * 0.84, pos = f => top + (lim(f, 0, 1.5) / 1.5) * alto;
  ctx.fillStyle = '#060607'; redondo(ctx, x - h * 0.07, top, h * 0.14, alto, 3 * e); ctx.fill();
  FLAPS_GRADOS.forEach((g, k) => {
    const yy = top + (k / 3) * alto;
    ctx.strokeStyle = C.rotulo; ctx.lineWidth = 1 * e; ctx.beginPath(); ctx.moveTo(x + h * 0.1, yy); ctx.lineTo(x + h * 0.18, yy); ctx.stroke();
    texto(ctx, g ? String(g) : 'UP', x + h * 0.34, yy, Math.max(7, h * 0.11), C.rotulo, 700);
  });
  // El indicador (dónde están): una flechita blanca.
  const yr = pos(real);
  ctx.fillStyle = C.aguja; ctx.beginPath(); ctx.moveTo(x + h * 0.08, yr); ctx.lineTo(x + h * 0.0, yr - h * 0.05); ctx.lineTo(x + h * 0.0, yr + h * 0.05); ctx.closePath(); ctx.fill();
  // La palanca (blanca, con forma de flap).
  const ym = pos(mando), w = h * 0.3;
  ctx.fillStyle = '#e9ebee'; ctx.beginPath(); ctx.moveTo(x - w * 0.9, ym - h * 0.05); ctx.lineTo(x + w * 0.2, ym - h * 0.07); ctx.lineTo(x + w * 0.2, ym + h * 0.07); ctx.lineTo(x - w * 0.9, ym + h * 0.03); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1 * e; ctx.stroke();
}
// La rueda de compensación vista de canto (las estrías se corren al girarla) y su marca (NOSE DN arriba … NOSE UP abajo).
function ruedaTrim(ctx, x, y, h, v, C, e) {
  const w = h * 0.26, hh = h * 0.9;
  ctx.fillStyle = '#0a0a0b'; redondo(ctx, x - w * 0.75, y - hh / 2, w * 1.5, hh, 4 * e); ctx.fill();
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, '#111214'); g.addColorStop(0.5, '#3b3e45'); g.addColorStop(1, '#111214');
  ctx.fillStyle = g; redondo(ctx, x - w / 2, y - hh * 0.46, w, hh * 0.92, w * 0.4); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, y - hh * 0.46, w, hh * 0.92); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = Math.max(1, h * 0.02);
  const paso = hh / 10, corr = ((lim(v, -1, 1) * hh * 1.5) % paso + paso) % paso;
  ctx.beginPath(); for (let k = -1; k < 12; k++) { const yy = y - hh / 2 + k * paso + corr; ctx.moveTo(x - w / 2, yy); ctx.lineTo(x + w / 2, yy); } ctx.stroke();
  ctx.restore();
  const my = y + lim(v, -1, 1) * hh * 0.4;
  ctx.fillStyle = '#ffb020'; ctx.fillRect(x + w * 0.55, my - 2 * e, w * 0.5, 4 * e);
}
// El yugo («cuernos de carnero»): la columna cromada sale del tablero; el volante gira con el alabeo y se acerca (más
// grande, más abajo y con más columna a la vista) al tirar.
function dibujarYugo(ctx, G, cx, w0, yugo, e, C) {
  const tirar = lim(num(yugo.cabeceo), -1, 1), giro = lim(num(yugo.alabeo), -1, 1);
  const k = 1 + tirar * 0.12, w = w0 * k, h = Math.min(G.panel * 0.2, G.r * 0.75) * k;
  const yAgujero = G.fila2 + G.r * 1.18, yc = G.tira - G.panel * 0.01 + tirar * G.panel * 0.06;
  ctx.save();
  // El agujero de la columna y la columna (cromada, con un brillo).
  ctx.fillStyle = '#030303'; ctx.beginPath(); ctx.ellipse(cx, yAgujero, w * 0.07, w * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  const gc = ctx.createLinearGradient(cx - w * 0.05, 0, cx + w * 0.05, 0);
  gc.addColorStop(0, '#4a4e56'); gc.addColorStop(0.45, '#eef1f4'); gc.addColorStop(1, '#3a3d44');
  ctx.fillStyle = gc; ctx.beginPath(); ctx.moveTo(cx - w * 0.035, yAgujero); ctx.lineTo(cx + w * 0.035, yAgujero); ctx.lineTo(cx + w * 0.05, yc); ctx.lineTo(cx - w * 0.05, yc); ctx.closePath(); ctx.fill();
  // La sombra del volante sobre el tablero.
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(cx, yc - h * 0.4, w * 0.48, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(cx, yc); ctx.rotate(rad(giro * 40));
  // El volante: la barra con los dos cuernos.
  const gy = ctx.createLinearGradient(0, -h * 0.7, 0, h * 0.5);
  gy.addColorStop(0, C.luz === 'noche' ? '#2a2c31' : '#575d68'); gy.addColorStop(0.55, C.luz === 'noche' ? '#141518' : '#2b2f36'); gy.addColorStop(1, '#0e0f12');
  ctx.fillStyle = gy; ctx.strokeStyle = C.luz === 'noche' ? '#3a3d44' : '#9aa2b1'; ctx.lineWidth = 1.8 * e;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.62);
  ctx.quadraticCurveTo(-w * 0.57, h * 0.25, -w * 0.41, h * 0.44);
  ctx.lineTo(-w * 0.16, h * 0.22); ctx.quadraticCurveTo(0, h * 0.32, w * 0.16, h * 0.22);
  ctx.lineTo(w * 0.41, h * 0.44); ctx.quadraticCurveTo(w * 0.57, h * 0.25, w * 0.5, -h * 0.62);
  ctx.lineTo(w * 0.38, -h * 0.62); ctx.quadraticCurveTo(w * 0.4, h * 0.06, w * 0.3, h * 0.06);
  ctx.lineTo(-w * 0.3, h * 0.06); ctx.quadraticCurveTo(-w * 0.4, h * 0.06, -w * 0.38, -h * 0.62);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Las empuñaduras (goma con estrías) y el botón del micrófono (izquierda) y el de la compensación eléctrica.
  for (const s of [-1, 1]) {
    const ge = ctx.createLinearGradient(s * w * 0.4, 0, s * w * 0.5, 0);
    ge.addColorStop(0, '#2b2d31'); ge.addColorStop(1, '#4b4f57');
    ctx.fillStyle = ge; ctx.beginPath(); ctx.ellipse(s * w * 0.445, -h * 0.2, w * 0.05, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.beginPath(); for (let i = -3; i <= 3; i++) { ctx.moveTo(s * w * 0.405, -h * 0.2 + i * h * 0.09); ctx.lineTo(s * w * 0.485, -h * 0.2 + i * h * 0.09); } ctx.stroke();
  }
  ctx.fillStyle = '#e5483e'; ctx.beginPath(); ctx.arc(-w * 0.445, -h * 0.58, Math.max(2, w * 0.012), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9aa2b1'; ctx.beginPath(); ctx.arc(-w * 0.44, -h * 0.66, Math.max(1.5, w * 0.008), 0, Math.PI * 2); ctx.fill();
  // El centro con la placa (y su marca naranja arriba: se ve cuánto gira).
  const gm = ctx.createLinearGradient(0, -h * 0.05, 0, h * 0.25);
  gm.addColorStop(0, '#4a4f58'); gm.addColorStop(1, '#25282e');
  ctx.fillStyle = gm; redondo(ctx, -w * 0.11, -h * 0.07, w * 0.22, h * 0.3, 4 * e); ctx.fill();
  ctx.fillStyle = '#c9ccd2'; redondo(ctx, -w * 0.07, -h * 0.01, w * 0.14, h * 0.12, 2 * e); ctx.fill();
  ctx.fillStyle = '#ffb020'; ctx.fillRect(-w * 0.012, -h * 0.07, w * 0.024, h * 0.06);
  ctx.restore();
}

// ---------- piezas de un reloj ----------
function esfera(ctx, x, y, r, C, e) {
  ctx.fillStyle = C.cara; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.aro; ctx.lineWidth = 1 * e; ctx.stroke();
}
// Marcas en un arco: desde/hasta en grados de aguja (0 = arriba, horario), cada, largo (fracción del radio).
function marcas(ctx, x, y, r, desde, hasta, cada, largo, C, w) {
  ctx.strokeStyle = C.marca; ctx.lineWidth = w; ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let a = desde; a <= hasta + 1e-6; a += cada) {
    const s = Math.sin(rad(a)), c = Math.cos(rad(a));
    ctx.moveTo(x + s * r * 0.95, y - c * r * 0.95); ctx.lineTo(x + s * r * (0.95 - largo), y - c * r * (0.95 - largo));
  }
  ctx.stroke();
}
function arco(ctx, x, y, r, a0, a1, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(x, y, r, rad(a0) - Math.PI / 2, rad(a1) - Math.PI / 2); ctx.stroke();
}
function texto(ctx, s, x, y, px, color, peso = 700, familia = 'system-ui, -apple-system, sans-serif') {
  ctx.fillStyle = color; ctx.font = `${peso} ${Math.max(7, px)}px ${familia}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function numeroEn(ctx, x, y, r, ang, s, px, C) {
  texto(ctx, s, x + Math.sin(rad(ang)) * r, y - Math.cos(rad(ang)) * r, px, C.texto);
}
// (la cola, cortita y oscura: que nunca se lea como la punta)
function aguja(ctx, x, y, r, ang, largo, ancho, color, cola = 0.12) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(ang));
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.moveTo(-ancho / 2 + 1, r * cola + 1); ctx.lineTo(1, -r * largo + 1); ctx.lineTo(ancho / 2 + 1, r * cola + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a3f48';
  ctx.beginPath(); ctx.moveTo(-ancho / 2, r * cola); ctx.lineTo(ancho / 2, r * cola); ctx.lineTo(ancho / 2, 0); ctx.lineTo(-ancho / 2, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-ancho / 2, 0); ctx.lineTo(-ancho * 0.18, -r * largo * 0.92); ctx.lineTo(0, -r * largo); ctx.lineTo(ancho * 0.18, -r * largo * 0.92); ctx.lineTo(ancho / 2, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}
const eje = (ctx, x, y, r) => { ctx.fillStyle = '#3a3f48'; ctx.beginPath(); ctx.arc(x, y, r * 0.08, 0, Math.PI * 2); ctx.fill(); };
function agujaSimple(ctx, x, y, r, ang, C) { aguja(ctx, x, y, r, ang, 0.86, r * 0.1, C.aguja); eje(ctx, x, y, r); }

// ---------- los instrumentos (cara: lo fijo; vivo: lo que se mueve) ----------
function caraAnemometro(ctx, x, y, r, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  const A = agujaAnemometro;
  arco(ctx, x, y, r * 0.86, A(ARCOS_KT.verdeDesde), A(ARCOS_KT.verdeHasta), '#2fbf5b', r * 0.09);
  arco(ctx, x, y, r * 0.86, A(ARCOS_KT.verdeHasta), A(ARCOS_KT.amarilloHasta), '#e5c33e', r * 0.09);
  arco(ctx, x, y, r * 0.75, A(ARCOS_KT.blancoDesde), A(ARCOS_KT.blancoHasta), '#f2f2f2', r * 0.07);
  ctx.strokeStyle = '#e5483e'; ctx.lineWidth = r * 0.05;
  const vne = rad(A(ARCOS_KT.vne)); ctx.beginPath(); ctx.moveTo(x + Math.sin(vne) * r * 0.96, y - Math.cos(vne) * r * 0.96); ctx.lineTo(x + Math.sin(vne) * r * 0.74, y - Math.cos(vne) * r * 0.74); ctx.stroke();
  for (let v = 40; v <= 200; v += 10) marcas(ctx, x, y, r, A(v), A(v), 1, v % 20 ? 0.1 : 0.16, C, Math.max(1, r * 0.03));
  for (const v of [40, 60, 80, 100, 120, 140, 160, 180]) numeroEn(ctx, x, y, r * 0.58, A(v), String(v), r * 0.17, C);
  texto(ctx, T('kt'), x, y + r * 0.32, r * 0.13, C.rotulo, 600);
}
function actitud(ctx, x, y, r, D, C, e) {
  ctx.fillStyle = C.luz === 'noche' ? '#3a332c' : '#7a828f'; ctx.beginPath(); ctx.arc(x, y, r * 1.06, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y); ctx.rotate(rad(-D.alabeo));
  const pg = r / 28; // px por grado de cabeceo
  const dy = lim(D.cabeceo, -30, 30) * pg;
  const noche = C.luz === 'noche';
  ctx.fillStyle = noche ? '#1d4a7c' : '#2f7fd6'; ctx.fillRect(-r * 2, -r * 3 + dy, r * 4, r * 3);
  ctx.fillStyle = noche ? '#5a3a1c' : '#8a5a2b'; ctx.fillRect(-r * 2, dy, r * 4, r * 3);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.beginPath(); ctx.moveTo(-r * 1.5, dy); ctx.lineTo(r * 1.5, dy);
  // La escalera de cabeceo: cada 5° (cortas) y cada 10° (largas, con número).
  for (let g = -20; g <= 20; g += 5) {
    if (!g) continue;
    const w = g % 10 ? r * 0.14 : r * 0.28, yy = dy - g * pg;
    ctx.moveTo(-w, yy); ctx.lineTo(w, yy);
  }
  ctx.stroke();
  for (const g of [-20, -10, 10, 20]) texto(ctx, String(Math.abs(g)), r * 0.42, dy - g * pg, r * 0.13, '#ffffff', 600);
  ctx.restore();
  // La escala de alabeo (10, 20, 30, 45, 60) arriba y el triángulo que la sigue.
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.beginPath();
  for (const g of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const s = Math.sin(rad(g)), c = Math.cos(rad(g)), k = Math.abs(g) === 30 || Math.abs(g) === 60 ? 0.82 : 0.88;
    ctx.moveTo(x + s * r * 0.98, y - c * r * 0.98); ctx.lineTo(x + s * r * k, y - c * r * k);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - r * 0.84); ctx.lineTo(x - r * 0.07, y - r * 0.98); ctx.lineTo(x + r * 0.07, y - r * 0.98); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(-D.alabeo));
  ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.moveTo(0, -r * 0.84); ctx.lineTo(-r * 0.07, -r * 0.72); ctx.lineTo(r * 0.07, -r * 0.72); ctx.closePath(); ctx.fill();
  ctx.restore();
  // El avioncito fijo (naranja) en el centro.
  ctx.strokeStyle = '#ffb020'; ctx.lineWidth = Math.max(2, r * 0.07); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x - r * 0.2, y); ctx.lineTo(x, y + r * 0.12); ctx.lineTo(x + r * 0.2, y); ctx.lineTo(x + r * 0.55, y); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(x, y, r * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.aro; ctx.lineWidth = 1 * e; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function caraAltimetro(ctx, x, y, r, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  marcas(ctx, x, y, r, 0, 352.8, 7.2, 0.08, C, Math.max(1, r * 0.025));
  marcas(ctx, x, y, r, 0, 324, 36, 0.16, C, Math.max(1.4, r * 0.04));
  for (let k = 0; k < 10; k++) numeroEn(ctx, x, y, r * 0.66, k * 36, String(k), r * 0.2, C);
  texto(ctx, T('ft'), x, y - r * 0.3, r * 0.12, C.rotulo, 600);
}
function vivoAltimetro(ctx, x, y, r, D, C) {
  // La ventanita de la presión (29.92) y la altitud en número (para leerla rápido en el teléfono).
  ctx.fillStyle = C.luz === 'noche' ? '#e8d7c0' : '#ffffff'; ctx.fillRect(x + r * 0.3, y - r * 0.08, r * 0.38, r * 0.17);
  texto(ctx, (Number.isFinite(D.ajuste) ? D.ajuste : 29.92).toFixed(2), x + r * 0.49, y + 0.5, r * 0.12, '#111111', 700);
  texto(ctx, Math.round(D.ft).toLocaleString('en-US'), x, y + r * 0.36, r * 0.15, C.texto, 700);
  aguja(ctx, x, y, r, D.agujas.diezmil, 0.95, r * 0.035, '#cfd6e2', 0);
  aguja(ctx, x, y, r, D.agujas.mil, 0.55, r * 0.16, C.aguja);
  aguja(ctx, x, y, r, D.agujas.cien, 0.88, r * 0.09, C.aguja);
  eje(ctx, x, y, r);
}
function caraCoordinador(ctx, x, y, r, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  // Marcas: nivelado y el giro estándar (3°/s) a cada lado (L y R).
  for (const g of [-20, 20]) marcas(ctx, x, y, r, 270 + g, 270 + g, 1, 0.16, C, Math.max(1.4, r * 0.05));
  for (const g of [-20, 20]) marcas(ctx, x, y, r, 90 + g, 90 + g, 1, 0.16, C, Math.max(1.4, r * 0.05));
  marcas(ctx, x, y, r, 90, 90, 1, 0.12, C, Math.max(1, r * 0.03)); marcas(ctx, x, y, r, 270, 270, 1, 0.12, C, Math.max(1, r * 0.03));
  texto(ctx, 'L', x - r * 0.72, y + r * 0.42, r * 0.16, C.texto); texto(ctx, 'R', x + r * 0.72, y + r * 0.42, r * 0.16, C.texto);
  texto(ctx, T('min'), x, y + r * 0.64, r * 0.11, C.rotulo, 600);
  texto(ctx, T('giro'), x, y - r * 0.46, r * 0.1, C.rotulo, 600);
  // El tubo de la bola.
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, r * 0.025);
  const by = y + r * 0.32;
  ctx.beginPath(); ctx.moveTo(x - r * 0.42, by - r * 0.04); ctx.quadraticCurveTo(x, by + r * 0.14, x + r * 0.42, by - r * 0.04); ctx.stroke();
}
function vivoCoordinador(ctx, x, y, r, D, C) {
  // El avioncito, inclinado por la tasa de giro.
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(D.agujas.coordinador));
  ctx.strokeStyle = C.aguja; ctx.fillStyle = C.aguja; ctx.lineWidth = Math.max(2, r * 0.08); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.68, 0); ctx.lineTo(r * 0.68, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.beginPath(); ctx.moveTo(0, -r * 0.1); ctx.lineTo(0, -r * 0.24); ctx.stroke();
  ctx.restore();
  ctx.lineCap = 'butt';
  // La bola (en el centro: viraje coordinado).
  const by = y + r * 0.32;
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, by + r * 0.04, r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, r * 0.025); ctx.stroke();
}
function rumboTarjeta(ctx, x, y, r, D, C, e) {
  esfera(ctx, x, y, r, C, e);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(D.agujas.rumbo));
  ctx.strokeStyle = C.marca;
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.beginPath();
  for (let g = 0; g < 360; g += 5) {
    const largo = g % 30 === 0 ? 0.17 : g % 10 === 0 ? 0.11 : 0.07;
    const s = Math.sin(rad(g)), c = Math.cos(rad(g));
    ctx.moveTo(s * r * 0.94, -c * r * 0.94); ctx.lineTo(s * r * (0.94 - largo), -c * r * (0.94 - largo));
  }
  ctx.stroke();
  const rotulos = { 0: 'N', 30: '3', 60: '6', 90: 'E', 120: '12', 150: '15', 180: 'S', 210: '21', 240: '24', 270: 'W', 300: '30', 330: '33' };
  for (const [g, s] of Object.entries(rotulos)) {
    ctx.save(); ctx.rotate(rad(Number(g)));
    texto(ctx, s, 0, -r * 0.6, r * (s.length > 1 && s !== 'N' ? 0.17 : 0.2), Number(g) % 90 ? C.texto : '#ffb020', 700);
    ctx.restore();
  }
  ctx.restore();
  // La línea de fe (arriba) y el avioncito fijo.
  ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.moveTo(x, y - r * 0.98); ctx.lineTo(x - r * 0.09, y - r * 0.82); ctx.lineTo(x + r * 0.09, y - r * 0.82); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffb020'; ctx.lineWidth = Math.max(1.6, r * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - r * 0.3); ctx.lineTo(x, y + r * 0.3); ctx.moveTo(x - r * 0.26, y - r * 0.02); ctx.lineTo(x + r * 0.26, y - r * 0.02); ctx.moveTo(x - r * 0.1, y + r * 0.26); ctx.lineTo(x + r * 0.1, y + r * 0.26); ctx.stroke();
  ctx.lineCap = 'butt';
  // El rumbo en número (para leerlo rápido en el teléfono).
  const h = Math.round(D.rumbo) % 360;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - r * 0.24, y + r * 0.36, r * 0.48, r * 0.22);
  texto(ctx, String(h || 360).padStart(3, '0'), x, y + r * 0.475, r * 0.17, C.texto, 800);
}
function caraVariometro(ctx, x, y, r, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  const A = agujaVariometro;
  for (let v = -2000; v <= 2000; v += 100) marcas(ctx, x, y, r, A(v), A(v), 1, v % 500 ? 0.07 : 0.15, C, Math.max(1, r * (v % 500 ? 0.02 : 0.035)));
  for (const v of [0, 500, 1000, 1500, 2000]) { numeroEn(ctx, x, y, r * 0.64, A(v), String(v / 100), r * 0.17, C); if (v && v < 2000) numeroEn(ctx, x, y, r * 0.64, A(-v), String(v / 100), r * 0.17, C); }
  texto(ctx, T('arriba'), x - r * 0.02, y - r * 0.32, r * 0.11, C.rotulo, 600); texto(ctx, T('abajo'), x - r * 0.02, y + r * 0.32, r * 0.11, C.rotulo, 600);
  texto(ctx, T('vsi'), x + r * 0.3, y - r * 0.12, r * 0.085, C.rotulo, 600);
}
function caraTacometro(ctx, x, y, r, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  arco(ctx, x, y, r * 0.86, anguloRpm(ARCOS_RPM.verdeDesde), anguloRpm(ARCOS_RPM.verdeHasta), '#2fbf5b', r * 0.1);
  for (let v = 0; v <= 3500; v += 100) marcas(ctx, x, y, r, anguloRpm(v), anguloRpm(v), 1, v % 500 ? 0.07 : 0.16, C, Math.max(1, r * (v % 500 ? 0.02 : 0.035)));
  ctx.strokeStyle = '#e5483e'; ctx.lineWidth = r * 0.05;
  const a = rad(anguloRpm(ARCOS_RPM.roja)); ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * r * 0.96, y - Math.cos(a) * r * 0.96); ctx.lineTo(x + Math.sin(a) * r * 0.72, y - Math.cos(a) * r * 0.72); ctx.stroke();
  for (let v = 0; v <= 35; v += 5) numeroEn(ctx, x, y, r * 0.6, anguloRpm(v * 100), String(v), r * 0.17, C);
  texto(ctx, T('rpm'), x, y + r * 0.3, r * 0.11, C.rotulo, 600);
}
// El VOR (en la PC, a la derecha de los seis): la tarjeta OBS, la aguja (CDI) y la banderita TO.
function caraVor(ctx, x, y, r, C, e) {
  esfera(ctx, x, y, r, C, e);
  marcas(ctx, x, y, r, 0, 350, 10, 0.1, C, Math.max(1, r * 0.025));
  for (const [g, s] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) numeroEn(ctx, x, y, r * 0.72, g, s, r * 0.16, C);
  ctx.fillStyle = C.marca;
  for (let k = -5; k <= 5; k++) if (k) { ctx.beginPath(); ctx.arc(x + k * r * 0.11, y + r * 0.05, Math.max(1, r * 0.025), 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#2a2d33'; ctx.beginPath(); ctx.arc(x - r * 0.78, y + r * 0.78, r * 0.18, 0, Math.PI * 2); ctx.fill();
  texto(ctx, 'OBS', x - r * 0.78, y + r * 0.78, r * 0.09, C.rotulo, 700);
}
function vivoVor(ctx, x, y, r, D, C) {
  // La aguja vertical (centrada: en el radial) y la banderita.
  const dx = lim(Math.sin(rad(D.rumbo * 3)) * 0.15, -0.5, 0.5) * r;
  ctx.strokeStyle = C.aguja; ctx.lineWidth = Math.max(1.5, r * 0.04);
  ctx.beginPath(); ctx.moveTo(x + dx, y - r * 0.55); ctx.lineTo(x + dx, y + r * 0.6); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + r * 0.22, y - r * 0.38, r * 0.26, r * 0.14);
  texto(ctx, 'TO', x + r * 0.35, y - r * 0.31, r * 0.1, '#111111', 800);
}
// Un reloj chico (aceite, combustible): un arco de 120° arriba, con zonas de color y su aguja.
function caraChico(ctx, x, y, r, rotulo, C, e, zonas = [], puntas = null) {
  esfera(ctx, x, y, r, C, e);
  for (const [a, b, c] of zonas) arco(ctx, x, y + r * 0.35, r * 0.95, -60 + a * 120, -60 + b * 120, c, r * 0.14);
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, r * 0.05);
  for (let k = 0; k <= 4; k++) { const g = rad(-60 + k * 30), s = Math.sin(g), c = Math.cos(g); ctx.beginPath(); ctx.moveTo(x + s * r * 1.02, y + r * 0.35 - c * r * 1.02); ctx.lineTo(x + s * r * 0.86, y + r * 0.35 - c * r * 0.86); ctx.stroke(); }
  if (puntas) { texto(ctx, puntas[0], x - r * 0.62, y + r * 0.05, r * 0.3, C.texto); texto(ctx, puntas[1], x + r * 0.62, y + r * 0.05, r * 0.3, C.texto); }
  texto(ctx, rotulo, x, y + r * 0.62, r * 0.27, C.rotulo, 700);
}
function agujaChica(ctx, x, y, r, ang, C) { aguja(ctx, x, y + r * 0.35, r, ang, 0.95, r * 0.14, C.aguja, 0.05); }

function redondo(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
