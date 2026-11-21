// 0.14.98: la cabina por dentro, dibujada en un lienzo 2D: el marco del parabrisas (techo, montantes, poste), la visera,
// el tablero y sus instrumentos de verdad, vivos con los datos de vuelo:
//  - los seis básicos: velocidad (kt, con sus arcos), actitud (cabeceo con escalera y alabeo con su escala), altímetro (agujas
//    de los 100 y de los 1,000 ft, y la de los 10,000), coordinador de giro (con la marca del giro estándar), indicador de
//    rumbo (la tarjeta gira) y variómetro (ft/min);
//  - en el modo completo (el Juego), también el tacómetro (RPM), presión y temperatura del aceite, combustible y el yugo.
// Las agujas usan la misma matemática que el panel de las clases (instrumentos.js): las pruebas la revisan.
// Nada toca document ni window: el contexto llega de afuera.
import { agujaAnemometro, agujasAltimetro, agujaVariometro, tasaDeGiro, inclinacionCoordinador } from './instrumentos.js';

const rad = g => (g * Math.PI) / 180;
const lim = (x, a, b) => Math.min(b, Math.max(a, x));
const n360 = g => ((g % 360) + 360) % 360;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Los arcos del anemómetro (kt) de una avioneta tipo Cessna 172 (los del manual de ese avión).
export const ARCOS_KT = Object.freeze({ blancoDesde: 33, blancoHasta: 85, verdeDesde: 44, verdeHasta: 129, amarilloHasta: 163, vne: 163 });
export const ARCOS_RPM = Object.freeze({ verdeDesde: 2100, verdeHasta: 2700, roja: 2700 });
// Tacómetro: 0 a 3,500 en 270°; relojes chicos del motor: 120°.
export const anguloRpm = rpm => -135 + (lim(num(rpm), 0, 3500) / 3500) * 270;
export const anguloArco = (v, min, max) => -60 + lim((num(v) - min) / (max - min), 0, 1) * 120;

// Los colores (de día y con la luz de los instrumentos de noche).
function colores(noche) {
  return noche ? { cara: '#05070a', marca: '#ffd9b0', texto: '#ffe3c4', aguja: '#fff1e0', aro: '#2a2420', rotulo: '#d9a77a', panel: ['#16130f', '#0d0b09'], visera: '#0b0a09', marco: '#050506', marco2: '#0e0f12' }
    : { cara: '#0b0d11', marca: '#f2f4f8', texto: '#ffffff', aguja: '#ffffff', aro: '#59606c', rotulo: '#aab3c2', panel: ['#3a3f48', '#262a31'], visera: '#1b1e24', marco: '#1c2029', marco2: '#2b313d' };
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

// La cabina. datos: kt, ft, rumbo, alabeo, cabeceo, vs (o subida), tasaGiro, rpm, aceitePsi, aceiteTemp, combustible, aviso.
// opciones: escala (px por px CSS), textos, completo (el Juego: dos filas, motor y yugo), yugo { alabeo, cabeceo } (-1..1),
// noche (la luz de los instrumentos). → el alto (px) que tapa el tablero.
export function dibujarCabina(ctx, ancho, alto, datos, { escala = 1, textos = {}, completo = false, yugo = null, noche = false, extras = null } = {}) {
  const D = datosPanel(datos), C = colores(noche), T = k => textos[k] ?? TEXTOS_CABINA[k];
  // 0.14.102: el tablero del Juego, más alto: dos filas de relojes, el motor a la derecha y, abajo, la compensación, los
  // flaps, el selector de combustible, la palanca de potencia y el yugo (en el centro, debajo de los relojes: no los tapa).
  const panel = completo ? Math.max(alto * (ancho > alto ? 0.5 : 0.46), 170 * escala) : Math.max(alto * 0.27, 62 * escala), yp = alto - panel;
  marco(ctx, ancho, alto, yp, escala, C);
  if (completo) {
    const r = Math.min(ancho / 4.6 * 0.42, panel * 0.165, 92 * escala), ancho1 = r * 2.42;
    const fila1 = yp + panel * 0.22, fila2 = yp + panel * 0.57;
    const x0 = ancho * 0.5 - ancho1 * 0.55;
    const xs = [x0 - ancho1, x0, x0 + ancho1];
    anemometro(ctx, xs[0], fila1, r, D, C, escala, T);
    actitud(ctx, xs[1], fila1, r, D, C, escala);
    altimetro(ctx, xs[2], fila1, r, { ...D, ajuste: extras?.ajuste }, C, escala, T);
    coordinador(ctx, xs[0], fila2, r, D, C, escala, T);
    rumboTarjeta(ctx, xs[1], fila2, r, D, C, escala);
    variometro(ctx, xs[2], fila2, r, D, C, escala, T);
    const xm = xs[2] + ancho1 * 1.1;
    tacometro(ctx, xm, fila1, r * 0.92, D, C, escala, T);
    const rc = r * 0.44;
    chico(ctx, xm - rc * 1.15, fila2 - rc * 0.55, rc, D.agujas.aceitePsi, T('psi'), C, escala, [[0.25, 0.85, '#2fbf5b'], [0, 0.08, '#e5483e']]);
    chico(ctx, xm + rc * 1.15, fila2 - rc * 0.55, rc, D.agujas.aceiteTemp, T('temp'), C, escala, [[0.4, 0.85, '#2fbf5b'], [0.94, 1, '#e5483e']]);
    const ex = extras ?? {};
    // 0.14.103: el combustible y la EGT (temperatura de los gases de escape: 1,000 a 1,600 °F) con el flujo (gal/h).
    if (ex.egt != null) {
      chico(ctx, xm - rc * 1.15, fila2 + rc * 0.95, rc, D.agujas.combustible, T('fuel'), C, escala, [[0, 0.12, '#e5c33e']], ['E', 'F']);
      chico(ctx, xm + rc * 1.15, fila2 + rc * 0.95, rc, anguloArco(ex.egt, 1000, 1600), T('egt'), C, escala, []);
    } else chico(ctx, xm, fila2 + rc * 0.95, rc, D.agujas.combustible, T('fuel'), C, escala, [[0, 0.12, '#e5c33e']], ['E', 'F']);
    const tira = yp + panel * 0.85, alto1 = panel * 0.17;
    // Abajo a la izquierda: la compensación (rueda con su marca) y los flaps (UP · 10 · 20 · 30).
    indicadorTrim(ctx, xs[0] - r * 0.55, tira, alto1, num(ex.trim, 0), C, escala, T);
    indicadorFlaps(ctx, xs[0] + r * 0.45, tira, alto1, num(ex.flaps, 0), C, escala, T);
    // Abajo a la derecha: la palanca de potencia (sale o entra) y el selector de combustible (BOTH).
    palancaPotencia(ctx, xs[2] + r * 0.15, tira, alto1, num(ex.potencia, 0), C, escala, T);
    selectorCombustible(ctx, xm, tira, alto1 * 0.42, C, escala, T);
    // El flujo de combustible (gal/h), a la izquierda del selector (no tapa ningún rótulo).
    if (ex.egt != null) texto(ctx, `${T('ff')} ${num(ex.ff, 0).toFixed(1)}`, xm - alto1 * 0.42 * 2.9, tira, Math.max(8, rc * 0.34), C.texto, 700);
    // El factor de carga (G), chiquito, arriba del tablero a la izquierda.
    if (ex.g != null) {
      const g = num(ex.g, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; redondo(ctx, xs[0] - r, yp - 26 * escala, 62 * escala, 20 * escala, 5 * escala); ctx.fill();
      texto(ctx, `G ${g.toFixed(1)}`, xs[0] - r + 31 * escala, yp - 16 * escala, 13 * escala, g > 2.5 || g < 0 ? '#ff8278' : '#ffffff', 800);
    }
    // (el yugo nunca tapa los relojes: se dibuja solo debajo de la segunda fila)
    if (yugo) { ctx.save(); ctx.beginPath(); ctx.rect(0, fila2 + r * 1.12, ancho, alto); ctx.clip(); dibujarYugo(ctx, ancho, alto, yp, panel, yugo, escala, C, xs[1], tira, r); ctx.restore(); }
  } else {
    const r = Math.min(panel * 0.36, ancho * 0.053), cy = yp + panel * 0.56;
    const xs = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8].map(k => ancho * k);
    anemometro(ctx, xs[0], cy, r, D, C, escala, T);
    actitud(ctx, xs[1], cy, r, D, C, escala);
    altimetro(ctx, xs[2], cy, r, D, C, escala, T);
    coordinador(ctx, xs[3], cy, r, D, C, escala, T);
    rumboTarjeta(ctx, xs[4], cy, r, D, C, escala);
    variometro(ctx, xs[5], cy, r, D, C, escala, T);
  }
  if (D.aviso) {
    // La luz del aviso de pérdida (STALL), arriba del tablero.
    const w = 64 * escala, h = 18 * escala, x = ancho * 0.5 - w / 2, y = yp + 2 * escala;
    ctx.fillStyle = '#e5483e'; redondo(ctx, x, y, w, h, 4 * escala); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = `800 ${11 * escala}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(T('stall'), x + w / 2, y + h / 2 + 0.5);
  }
  return panel;
}

export const TEXTOS_CABINA = { egt: 'EGT', ff: 'FF', trim: 'TRIM', flaps: 'FLAPS', gases: 'THROTTLE', combustible: 'FUEL SEL', kt: 'KNOTS', ft: 'ALT', vsi: 'VERT SPEED', rpm: 'RPM ×100', psi: 'OIL P', temp: 'OIL T', fuel: 'FUEL', giro: 'TURN COORD', min: '2 MIN', stall: 'STALL', arriba: 'UP', abajo: 'DN' };

// ---------- el marco, la visera y el tablero ----------
function marco(ctx, ancho, alto, yp, e, C) {
  // El techo (la raíz del ala alta) con el borde redondeado.
  ctx.fillStyle = C.marco;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ancho, 0); ctx.lineTo(ancho, alto * 0.1);
  ctx.quadraticCurveTo(ancho / 2, alto * 0.025, 0, alto * 0.1); ctx.closePath(); ctx.fill();
  // Los montantes (gruesos abajo, finos arriba), con un brillo en el borde de adentro.
  for (const lado of [0, 1]) {
    const X = v => (lado ? ancho - v : v);
    ctx.fillStyle = C.marco;
    ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(ancho * 0.07), 0); ctx.lineTo(X(ancho * 0.15), yp); ctx.lineTo(X(0), yp); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.marco2; ctx.lineWidth = 3 * e;
    ctx.beginPath(); ctx.moveTo(X(ancho * 0.07), 0); ctx.lineTo(X(ancho * 0.15), yp); ctx.stroke();
  }
  // El poste del medio, finito, solo arriba.
  ctx.fillStyle = C.marco2; ctx.fillRect(ancho / 2 - 2 * e, 0, 4 * e, alto * 0.11);
  // La visera (glareshield): curva, oscura, con su sombra sobre el tablero.
  const vis = 14 * e;
  ctx.fillStyle = C.visera;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 0.6); ctx.quadraticCurveTo(ancho / 2, yp - vis * 1.6, ancho, yp + vis * 0.6);
  ctx.lineTo(ancho, yp + vis * 1.4); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.5, 0, yp + vis * 1.4); ctx.closePath(); ctx.fill();
  // El tablero.
  const g = ctx.createLinearGradient(0, yp, 0, alto);
  g.addColorStop(0, C.panel[0]); g.addColorStop(1, C.panel[1]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, yp + vis * 1.4); ctx.quadraticCurveTo(ancho / 2, yp - vis * 0.5, ancho, yp + vis * 1.4);
  ctx.lineTo(ancho, alto); ctx.lineTo(0, alto); ctx.closePath(); ctx.fill();
}

// ---------- piezas de un reloj ----------
function esfera(ctx, x, y, r, C, e) {
  // El aro (bisel) con un degradé y la cara negra.
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.12);
  g.addColorStop(0, '#7a828f'); g.addColorStop(1, '#1b1e24');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();
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
function texto(ctx, s, x, y, px, color, peso = 700) {
  ctx.fillStyle = color; ctx.font = `${peso} ${Math.max(7, px)}px system-ui, -apple-system, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

// ---------- los instrumentos ----------
function anemometro(ctx, x, y, r, D, C, e, T) {
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
  aguja(ctx, x, y, r, D.agujas.kt, 0.86, r * 0.1, C.aguja);
  eje(ctx, x, y, r);
}
function actitud(ctx, x, y, r, D, C, e) {
  ctx.fillStyle = '#7a828f'; ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y); ctx.rotate(rad(-D.alabeo));
  const pg = r / 28; // px por grado de cabeceo
  const dy = lim(D.cabeceo, -30, 30) * pg;
  ctx.fillStyle = '#2f7fd6'; ctx.fillRect(-r * 2, -r * 3 + dy, r * 4, r * 3);
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-r * 2, dy, r * 4, r * 3);
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
  ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(x, y, r * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.aro; ctx.lineWidth = 1 * e; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function altimetro(ctx, x, y, r, D, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  marcas(ctx, x, y, r, 0, 352.8, 7.2, 0.08, C, Math.max(1, r * 0.025));
  marcas(ctx, x, y, r, 0, 324, 36, 0.16, C, Math.max(1.4, r * 0.04));
  for (let k = 0; k < 10; k++) numeroEn(ctx, x, y, r * 0.66, k * 36, String(k), r * 0.2, C);
  // La ventanita de la presión (29.92).
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + r * 0.3, y - r * 0.08, r * 0.38, r * 0.17);
  texto(ctx, (Number.isFinite(D.ajuste) ? D.ajuste : 29.92).toFixed(2), x + r * 0.49, y + 0.5, r * 0.12, '#111111', 700);
  texto(ctx, T('ft'), x, y - r * 0.3, r * 0.12, C.rotulo, 600);
  texto(ctx, Math.round(D.ft).toLocaleString('en-US'), x, y + r * 0.36, r * 0.15, C.texto, 700);
  aguja(ctx, x, y, r, D.agujas.diezmil, 0.95, r * 0.035, '#cfd6e2', 0);
  aguja(ctx, x, y, r, D.agujas.mil, 0.55, r * 0.16, C.aguja);
  aguja(ctx, x, y, r, D.agujas.cien, 0.88, r * 0.09, C.aguja);
  eje(ctx, x, y, r);
}
function coordinador(ctx, x, y, r, D, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  // Marcas: nivelado y el giro estándar (3°/s) a cada lado (L y R).
  for (const g of [-20, 20]) marcas(ctx, x, y, r, 270 + g, 270 + g, 1, 0.16, C, Math.max(1.4, r * 0.05));
  for (const g of [-20, 20]) marcas(ctx, x, y, r, 90 + g, 90 + g, 1, 0.16, C, Math.max(1.4, r * 0.05));
  marcas(ctx, x, y, r, 90, 90, 1, 0.12, C, Math.max(1, r * 0.03)); marcas(ctx, x, y, r, 270, 270, 1, 0.12, C, Math.max(1, r * 0.03));
  texto(ctx, 'L', x - r * 0.72, y + r * 0.42, r * 0.16, C.texto); texto(ctx, 'R', x + r * 0.72, y + r * 0.42, r * 0.16, C.texto);
  texto(ctx, T('min'), x, y + r * 0.64, r * 0.11, C.rotulo, 600);
  texto(ctx, T('giro'), x, y - r * 0.46, r * 0.1, C.rotulo, 600);
  // El avioncito, inclinado por la tasa de giro.
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(D.agujas.coordinador));
  ctx.strokeStyle = C.aguja; ctx.fillStyle = C.aguja; ctx.lineWidth = Math.max(2, r * 0.08); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.68, 0); ctx.lineTo(r * 0.68, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.beginPath(); ctx.moveTo(0, -r * 0.1); ctx.lineTo(0, -r * 0.24); ctx.stroke();
  ctx.restore();
  // La bola (en el centro: viraje coordinado).
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, r * 0.025);
  const by = y + r * 0.32;
  ctx.beginPath(); ctx.moveTo(x - r * 0.42, by - r * 0.04); ctx.quadraticCurveTo(x, by + r * 0.14, x + r * 0.42, by - r * 0.04); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, by + r * 0.04, r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.marca; ctx.stroke();
}
function rumboTarjeta(ctx, x, y, r, D, C, e) {
  esfera(ctx, x, y, r, C, e);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rad(D.agujas.rumbo));
  ctx.strokeStyle = C.marca;
  for (let g = 0; g < 360; g += 5) {
    const largo = g % 30 === 0 ? 0.17 : g % 10 === 0 ? 0.11 : 0.07;
    ctx.lineWidth = g % 10 === 0 ? Math.max(1.2, r * 0.03) : Math.max(1, r * 0.018);
    const s = Math.sin(rad(g)), c = Math.cos(rad(g));
    ctx.beginPath(); ctx.moveTo(s * r * 0.94, -c * r * 0.94); ctx.lineTo(s * r * (0.94 - largo), -c * r * (0.94 - largo)); ctx.stroke();
  }
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
  // El rumbo en número (para leerlo rápido en el teléfono).
  const h = Math.round(D.rumbo) % 360;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - r * 0.24, y + r * 0.36, r * 0.48, r * 0.22);
  texto(ctx, String(h || 360).padStart(3, '0'), x, y + r * 0.475, r * 0.17, C.texto, 800);
}
function variometro(ctx, x, y, r, D, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  const A = agujaVariometro;
  for (let v = -2000; v <= 2000; v += 100) marcas(ctx, x, y, r, A(v), A(v), 1, v % 500 ? 0.07 : 0.15, C, Math.max(1, r * (v % 500 ? 0.02 : 0.035)));
  for (const v of [0, 500, 1000, 1500, 2000]) { numeroEn(ctx, x, y, r * 0.64, A(v), String(v / 100), r * 0.17, C); if (v && v < 2000) numeroEn(ctx, x, y, r * 0.64, A(-v), String(v / 100), r * 0.17, C); }
  texto(ctx, T('arriba'), x - r * 0.02, y - r * 0.32, r * 0.11, C.rotulo, 600); texto(ctx, T('abajo'), x - r * 0.02, y + r * 0.32, r * 0.11, C.rotulo, 600);
  texto(ctx, T('vsi'), x + r * 0.36, y - r * 0.12, r * 0.085, C.rotulo, 600);
  aguja(ctx, x, y, r, A(D.vs) + 0, 0.86, r * 0.1, C.aguja);
  eje(ctx, x, y, r);
}
function tacometro(ctx, x, y, r, D, C, e, T) {
  esfera(ctx, x, y, r, C, e);
  arco(ctx, x, y, r * 0.86, anguloRpm(ARCOS_RPM.verdeDesde), anguloRpm(ARCOS_RPM.verdeHasta), '#2fbf5b', r * 0.1);
  for (let v = 0; v <= 3500; v += 100) marcas(ctx, x, y, r, anguloRpm(v), anguloRpm(v), 1, v % 500 ? 0.07 : 0.16, C, Math.max(1, r * (v % 500 ? 0.02 : 0.035)));
  ctx.strokeStyle = '#e5483e'; ctx.lineWidth = r * 0.05;
  const a = rad(anguloRpm(ARCOS_RPM.roja)); ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * r * 0.96, y - Math.cos(a) * r * 0.96); ctx.lineTo(x + Math.sin(a) * r * 0.72, y - Math.cos(a) * r * 0.72); ctx.stroke();
  for (let v = 0; v <= 35; v += 5) numeroEn(ctx, x, y, r * 0.6, anguloRpm(v * 100), String(v), r * 0.17, C);
  texto(ctx, T('rpm'), x, y + r * 0.3, r * 0.11, C.rotulo, 600);
  texto(ctx, String(Math.round(D.rpm / 10) * 10), x, y + r * 0.55, r * 0.15, C.texto, 700);
  aguja(ctx, x, y, r, D.agujas.rpm, 0.86, r * 0.1, C.aguja);
  eje(ctx, x, y, r);
}
// Un reloj chico (aceite, combustible): un arco de 120° arriba, con zonas de color y su aguja.
function chico(ctx, x, y, r, ang, rotulo, C, e, zonas = [], puntas = null) {
  esfera(ctx, x, y, r, C, e);
  for (const [a, b, c] of zonas) arco(ctx, x, y + r * 0.35, r * 0.95, -60 + a * 120, -60 + b * 120, c, r * 0.14);
  ctx.strokeStyle = C.marca; ctx.lineWidth = Math.max(1, r * 0.05);
  for (let k = 0; k <= 4; k++) { const g = rad(-60 + k * 30), s = Math.sin(g), c = Math.cos(g); ctx.beginPath(); ctx.moveTo(x + s * r * 1.02, y + r * 0.35 - c * r * 1.02); ctx.lineTo(x + s * r * 0.86, y + r * 0.35 - c * r * 0.86); ctx.stroke(); }
  if (puntas) { texto(ctx, puntas[0], x - r * 0.62, y + r * 0.05, r * 0.3, C.texto); texto(ctx, puntas[1], x + r * 0.62, y + r * 0.05, r * 0.3, C.texto); }
  texto(ctx, rotulo, x, y + r * 0.62, r * 0.27, C.rotulo, 700);
  aguja(ctx, x, y + r * 0.35, r, ang, 0.95, r * 0.14, C.aguja, 0.05);
}
// El yugo (el «timón» o volante de una avioneta): la columna sale del tablero y el volante, con sus dos empuñaduras, gira con
// el alabeo pedido y entra o sale con el cabeceo (tirar = sale hacia el piloto, se ve más grande y más abajo).
function dibujarYugo(ctx, ancho, alto, yp, panel, yugo, e, C, cx, tira, rReloj = 60) {
  const tirar = lim(num(yugo.cabeceo), -1, 1), giro = lim(num(yugo.alabeo), -1, 1);
  const k = 1 + tirar * 0.12; // más cerca al tirar
  const w = Math.min(ancho * 0.36, panel * 1.05, rReloj * 3.4) * k, h = Math.min(panel * 0.2, rReloj * 0.75) * k;
  const yc = tira + panel * 0.04 + tirar * panel * 0.04;
  ctx.save();
  // La columna (sale del tablero; más larga al tirar).
  const g = ctx.createLinearGradient(cx - w * 0.04, 0, cx + w * 0.04, 0);
  g.addColorStop(0, '#2a2e36'); g.addColorStop(0.5, '#59606c'); g.addColorStop(1, '#1d2026');
  ctx.fillStyle = g; ctx.fillRect(cx - w * 0.035, yc, w * 0.07, alto - yc);
  ctx.translate(cx, yc); ctx.rotate(rad(giro * 40));
  // El volante: un arco con dos cuernos (empuñaduras) y el centro con su placa.
  const gy = ctx.createLinearGradient(0, -h * 0.6, 0, h * 0.5);
  gy.addColorStop(0, '#4a505c'); gy.addColorStop(1, '#1e2128');
  ctx.fillStyle = gy; ctx.strokeStyle = '#8a93a3'; ctx.lineWidth = 2.2 * e;
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -h * 0.55);
  ctx.quadraticCurveTo(-w * 0.56, h * 0.25, -w * 0.4, h * 0.42);
  ctx.lineTo(-w * 0.16, h * 0.2); ctx.quadraticCurveTo(0, h * 0.3, w * 0.16, h * 0.2);
  ctx.lineTo(w * 0.4, h * 0.42); ctx.quadraticCurveTo(w * 0.56, h * 0.25, w * 0.5, -h * 0.55);
  ctx.lineTo(w * 0.38, -h * 0.55); ctx.quadraticCurveTo(w * 0.4, h * 0.05, w * 0.3, h * 0.05);
  ctx.lineTo(-w * 0.3, h * 0.05); ctx.quadraticCurveTo(-w * 0.4, h * 0.05, -w * 0.38, -h * 0.55);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Las empuñaduras (más claras) y el botón del micrófono.
  ctx.fillStyle = '#5a616e';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse?.(s * w * 0.45, -h * 0.2, w * 0.05, h * 0.38, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#e5483e'; ctx.beginPath(); ctx.arc(-w * 0.45, -h * 0.5, Math.max(2, w * 0.012), 0, Math.PI * 2); ctx.fill();
  // El centro con la placa (y su marca naranja arriba: se ve cuánto gira).
  ctx.fillStyle = '#3a3f48'; redondo(ctx, -w * 0.11, -h * 0.05, w * 0.22, h * 0.26, 4 * e); ctx.fill();
  ctx.fillStyle = '#ffb020'; ctx.fillRect(-w * 0.012, -h * 0.05, w * 0.024, h * 0.1);
  ctx.restore();
}
// La compensación: una rueda vertical con la marca (NOSE DN arriba, NOSE UP abajo). v: -1 (nariz abajo) … 1 (nariz arriba).
function indicadorTrim(ctx, x, y, h, v, C, e, T) {
  const w = h * 0.28;
  ctx.fillStyle = '#0d0f13'; redondo(ctx, x - w / 2, y - h / 2, w, h, 3 * e); ctx.fill();
  ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 1 * e;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(x - w * 0.35, y + (k * h) / 8); ctx.lineTo(x + w * 0.35, y + (k * h) / 8); ctx.stroke(); }
  const my = y + lim(v, -1, 1) * h * 0.4;
  ctx.fillStyle = '#ffb020'; ctx.fillRect(x - w * 0.7, my - 2 * e, w * 1.4, 4 * e);
  texto(ctx, T('trim'), x, y - h / 2 - 6 * e, Math.max(8, 9 * e), C.rotulo, 700);
}
// Los flaps: la escala UP · 10 · 20 · 30 y la marca donde están (0..1).
function indicadorFlaps(ctx, x, y, h, v, C, e, T) {
  const w = h * 0.28;
  ctx.fillStyle = '#0d0f13'; redondo(ctx, x - w / 2, y - h / 2, w, h, 3 * e); ctx.fill();
  const marcas = ['UP', '10', '20', '30'];
  marcas.forEach((m, k) => texto(ctx, m, x + w * 1.1, y - h * 0.4 + (k * h * 0.8) / 3, Math.max(7, 8 * e), C.rotulo, 600));
  const my = y - h * 0.4 + lim(v, 0, 1) * h * 0.8 * (2 / 3); // el Juego baja 20°
  ctx.fillStyle = C.aguja; ctx.fillRect(x - w * 0.6, my - 2 * e, w * 1.2, 4 * e);
  texto(ctx, T('flaps'), x, y - h / 2 - 6 * e, Math.max(8, 9 * e), C.rotulo, 700);
}
// La palanca de potencia (el botón negro): sale con poca potencia, entra con mucha.
function palancaPotencia(ctx, x, y, h, v, C, e, T) {
  const sale = (1 - lim(v, 0, 1)) * h * 0.35;
  ctx.fillStyle = '#5a606b'; ctx.fillRect(x - 2 * e, y - h * 0.3, 4 * e, h * 0.3 + sale);
  ctx.fillStyle = '#111317'; ctx.beginPath(); ctx.arc(x, y + sale, h * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#59606c'; ctx.lineWidth = 1.5 * e; ctx.stroke();
  texto(ctx, T('gases'), x, y - h / 2 - 6 * e, Math.max(8, 9 * e), C.rotulo, 700);
}
// El selector de combustible (en BOTH).
function selectorCombustible(ctx, x, y, r, C, e, T) {
  ctx.fillStyle = '#0d0f13'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#59606c'; ctx.lineWidth = 1.5 * e; ctx.stroke();
  ctx.fillStyle = '#c9ced8'; ctx.fillRect(x - r * 0.12, y - r * 0.9, r * 0.24, r * 1.1);
  texto(ctx, 'BOTH', x, y + r * 1.35, Math.max(7, 8 * e), C.rotulo, 700);
  texto(ctx, T('combustible'), x, y - r * 1.4, Math.max(7, 8 * e), C.rotulo, 700);
}
function redondo(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
