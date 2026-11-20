// 0.14.78: piezas comunes de las escenas 3D (escena3d.js): los textos (i18n «clase.e3d.*»), los colores del cielo y
// del suelo en claro y oscuro, los colores de cada clase de espacio aéreo, el aeropuerto y el terreno.
// Nada toca document al importar.
import { poligono, linea, caja, terreno, ruido, mezclarColor, bola, aleatorio } from './motor3d.js';

// Textos: opciones.t es el t() de la app; sin él, la tabla en español del módulo. Clave: «clase.e3d.<clave>».
export function traductor3d(opciones, base) {
  const t = typeof opciones?.t === 'function' ? opciones.t : null;
  return (clave, variables = {}) => {
    const completa = `clase.e3d.${clave}`;
    let r = null;
    if (t) { try { r = t(completa, variables); } catch { r = null; } }
    if (typeof r === 'string' && r && r !== completa) return r;
    return String(base[clave] ?? clave).replace(/\{(\w+)\}/g, (_, n) => (n in variables ? String(variables[n]) : `{${n}}`));
  };
}
// «**3 SM**» → partes [{ texto, negrita }]: el subtítulo se arma con <strong> (nunca HTML desde texto).
export function partesNegrita(texto) {
  const out = [];
  String(texto ?? '').split(/\*\*(.+?)\*\*/g).forEach((x, i) => { if (x) out.push({ texto: x, negrita: i % 2 === 1 }); });
  return out;
}
export const sinMarcas = texto => String(texto ?? '').replace(/\*\*(.+?)\*\*/g, '$1');
export const miles = n => Math.round(n).toLocaleString('en-US');

// El cielo y el suelo (claro = de día; oscuro = al atardecer, más apagado para no encandilar).
export const PALETAS = Object.freeze({
  claro: {
    cieloAlto: [46, 112, 200], cieloBajo: [178, 212, 242], bruma: [222, 234, 247], sueloLejos: [200, 216, 228], niebla: [200, 216, 228],
    pasto: [116, 160, 92], pasto2: [150, 182, 104], bosque: [62, 110, 64], tierra: [182, 168, 120], agua: [84, 146, 198], asfalto: [64, 68, 76], marca: [246, 246, 246],
    pastoAeropuerto: [136, 178, 108], edificio: [214, 218, 226], techo: [150, 158, 172], grilla: [255, 255, 255, 0.05],
    etiquetaFondo: [14, 22, 38], etiquetaTexto: [255, 255, 255], ambiente: 0.55, oscuro: false,
  },
  oscuro: {
    cieloAlto: [12, 24, 52], cieloBajo: [58, 82, 124], bruma: [74, 94, 128], sueloLejos: [42, 58, 82], niebla: [42, 58, 82],
    pasto: [60, 96, 62], pasto2: [76, 110, 70], bosque: [38, 68, 44], tierra: [86, 80, 62], agua: [36, 70, 108], asfalto: [40, 43, 50], marca: [214, 218, 226],
    pastoAeropuerto: [58, 92, 58], edificio: [150, 156, 168], techo: [96, 104, 118], grilla: [200, 220, 255, 0.06],
    etiquetaFondo: [6, 10, 20], etiquetaTexto: [240, 244, 250], ambiente: 0.6, oscuro: true,
  },
});
// Los colores de la carta seccional, iguales en claro y oscuro: B azul, C magenta, D azul (discontinua), E magenta suave.
export const COLOR_CLASE = Object.freeze({
  A: [160, 172, 192], B: [52, 120, 246], C: [214, 51, 196], D: [40, 168, 240], E: [176, 96, 214], G: [70, 178, 98],
});

// Un aeropuerto en el suelo: el pasto, la pista con sus marcas (umbral, eje, bordes), la calle de rodaje, la plataforma,
// el hangar y la torre. Unidades del mundo; «m» es cuánto mide un pie en la escena (para el ancho y las marcas).
export function aeropuerto({ x, z, y = 0, rumbo = 0, largo, ancho, paleta, torre = true, detalle = true }) {
  const out = [];
  const h = (rumbo * Math.PI) / 180, F = [Math.sin(h), Math.cos(h)], R = [Math.cos(h), -Math.sin(h)];
  const P = (a, b, alto = y) => [x + F[0] * a + R[0] * b, alto, z + F[1] * a + R[1] * b];
  const rect = (a0, a1, b0, b1, c, alto = y, extra = {}) => poligono([P(a0, b0, alto), P(a0, b1, alto), P(a1, b1, alto), P(a1, b0, alto)], c, { luz: 0, doble: true, capa: 'calco', ...extra });
  const L = largo / 2, W = ancho / 2, e = largo * 0.0004;
  out.push(rect(-L * 1.18, L * 1.18, -W * 9, W * 14, paleta.pastoAeropuerto, y + e * 0.2));
  out.push(rect(-L, L, -W, W, paleta.asfalto, y + e));
  if (detalle) {
    // Umbral (rayas), eje discontinuo y bordes.
    for (const s of [-1, 1]) {
      const a0 = s * (L - largo * 0.012), a1 = s * (L - largo * 0.05);
      for (let k = 0; k < 8; k++) { const b = -W * 0.85 + (k + 0.5) * (W * 1.7) / 8; out.push(rect(Math.min(a0, a1), Math.max(a0, a1), b - W * 0.06, b + W * 0.06, paleta.marca, y + e * 2)); }
      out.push(rect(s > 0 ? L * 0.62 : -L * 0.7, s > 0 ? L * 0.7 : -L * 0.62, -W * 0.5, -W * 0.25, paleta.marca, y + e * 2));
      out.push(rect(s > 0 ? L * 0.62 : -L * 0.7, s > 0 ? L * 0.7 : -L * 0.62, W * 0.25, W * 0.5, paleta.marca, y + e * 2));
    }
    for (let a = -L * 0.82; a < L * 0.8; a += largo * 0.06) out.push(rect(a, a + largo * 0.03, -W * 0.04, W * 0.04, paleta.marca, y + e * 2));
    out.push(linea([P(-L, -W * 0.94, y + e * 2), P(L, -W * 0.94, y + e * 2)], paleta.marca, { a: 0.8, w: 1, capa: 'calco' }));
    out.push(linea([P(-L, W * 0.94, y + e * 2), P(L, W * 0.94, y + e * 2)], paleta.marca, { a: 0.8, w: 1, capa: 'calco' }));
    // Calle de rodaje paralela y plataforma.
    out.push(rect(-L * 0.9, L * 0.9, W * 3.4, W * 4.2, paleta.asfalto, y + e));
    out.push(rect(-L * 0.25, L * 0.15, W * 4.2, W * 9, paleta.asfalto, y + e));
    for (const a of [-L * 0.85, 0, L * 0.85]) out.push(rect(a - W * 0.4, a + W * 0.4, W, W * 3.4, paleta.asfalto, y + e));
  }
  if (torre) {
    // Hangares y la torre (cajas; en el mundo, no en el suelo).
    const q = largo * 0.035;
    const c1 = P(-L * 0.15, W * 11), c2 = P(L * 0.05, W * 11.2), tw = P(L * 0.3, W * 10);
    out.push(...caja(c1[0] - q, y, c1[2] - q * 0.8, c1[0] + q, y + q * 0.7, c1[2] + q * 0.8, paleta.edificio));
    out.push(...caja(c2[0] - q * 0.8, y, c2[2] - q * 0.7, c2[0] + q * 0.8, y + q * 0.6, c2[2] + q * 0.7, paleta.techo));
    out.push(...caja(tw[0] - q * 0.18, y, tw[2] - q * 0.18, tw[0] + q * 0.18, y + q * 2.2, tw[2] + q * 0.18, paleta.edificio));
    out.push(...caja(tw[0] - q * 0.32, y + q * 2.2, tw[2] - q * 0.32, tw[0] + q * 0.32, y + q * 2.7, tw[2] + q * 0.32, [70, 110, 150]));
  }
  return out;
}

// El campo: parcelas de colores (pasto, cultivo, tierra), sin texturas, con una grilla suave que da la escala.
export function campo({ x0, z0, x1, z1, n, altura, paleta, semilla = 3, agua = null, falda = 0, liso = false }) {
  const color = (x, z) => {
    if (agua && agua(x, z)) return paleta.agua;
    // La falda, de un solo color (si no, sus cuadros grandes se ven como franjas).
    return mezclarColor(paleta.pasto, paleta.pasto2, 0.3);
  };
  // La falda: cuadros grandes y planos alrededor, hasta donde la niebla los borra (el suelo llega al horizonte).
  const afuera = [];
  if (falda > 0) {
    // Dos anillos: uno cerca, en cuadros chicos (la niebla se calcula por cuadro), y otro hasta lejos.
    const m = Math.max(x1 - x0, z1 - z0) * 0.4;
    const anillo = (ax0, az0, ax1, az1, bx0, bz0, bx1, bz1, paso) => [[bx0, bz0, ax0, bz1, paso], [ax1, bz0, bx1, bz1, paso], [ax0, bz0, ax1, az0, paso], [ax0, az1, ax1, bz1, paso]];
    const franjas = [...anillo(x0, z0, x1, z1, x0 - m, z0 - m, x1 + m, z1 + m, m / 3), ...anillo(x0 - m, z0 - m, x1 + m, z1 + m, -falda, -falda, falda, falda, falda / 4)];
    for (const [a0, b0, a1, b1, paso] of franjas) {
      const na = Math.max(1, Math.round((a1 - a0) / paso)), nb = Math.max(1, Math.round((b1 - b0) / paso));
      for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
        const A0 = a0 + ((a1 - a0) * i) / na, A1 = a0 + ((a1 - a0) * (i + 1)) / na, B0 = b0 + ((b1 - b0) * j) / nb, B1 = b0 + ((b1 - b0) * (j + 1)) / nb;
        afuera.push(poligono([[A0, 0, B0], [A0, 0, B1], [A1, 0, B1], [A1, 0, B0]], color((A0 + A1) / 2, (B0 + B1) / 2), { luz: 1, capa: 'suelo', terreno: !(agua && agua((A0 + A1) / 2, (B0 + B1) / 2)) }));
      }
    }
  }
  // Con falda, el borde del terreno baja a 0 (si no, entre el terreno y la falda queda una rendija).
  const borde = (x, z) => Math.min(1, (x - x0) / ((x1 - x0) * 0.08), (x1 - x) / ((x1 - x0) * 0.08), (z - z0) / ((z1 - z0) * 0.08), (z1 - z) / ((z1 - z0) * 0.08));
  const alturaBorde = falda > 0 ? (x, z) => altura(x, z) * Math.max(0, borde(x, z)) : altura;
  return afuera.concat(terreno({
    x0, z0, x1, z1, n, altura: alturaBorde, grilla: null,
    color: (x, z) => {
      if (liso) return mezclarColor(paleta.pasto, paleta.pasto2, 0.3);
      if (agua && agua(x, z)) return paleta.agua;
      const k = ruido(x * 0.18, z * 0.18, semilla), k2 = ruido(x * 0.05 + 9, z * 0.05 - 3, semilla + 1);
      const base = mezclarColor(paleta.pasto, paleta.pasto2, k);
      if (k2 > 0.72) return mezclarColor(base, paleta.tierra, 0.4);
      return k < 0.22 ? mezclarColor(base, paleta.bosque, 0.45) : base;
    },
  }).map(p => ({ ...p, capa: 'suelo', terreno: p.c !== paleta.agua })));
}

// Un cúmulo con la base plana a la altura «base»: bolas abajo en fila y más chicas hacia arriba. → { prims, caja }
// (caja: lo que ocupa, para revisar los mínimos VFR en las pruebas).
export function cumulo({ x, z, base, ancho, alto, semilla = 1, gris = 0, plana = false }) {
  const azar = aleatorio(semilla), prims = [];
  const r0 = ancho * 0.24, n = plana ? 9 : 6;
  let techo = base;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * ancho * 0.75, b = (azar() - 0.5) * ancho * 0.5;
    const rr = r0 * (0.8 + azar() * 0.35) * (plana ? 0.8 : 1);
    prims.push(bolaNube([x + a, base + rr * 0.92, z + b], rr, 0.82 + 0.06 * azar(), gris));
    techo = Math.max(techo, base + rr * 1.9);
  }
  if (!plana) {
    const capas = Math.max(1, Math.round(alto / (r0 * 0.9)));
    for (let c = 1; c <= capas; c++) for (let k = 0; k < 4; k++) {
      const f = 1 - c / (capas + 1.4);
      const rr = r0 * (0.65 + azar() * 0.35) * (0.6 + 0.4 * f);
      const y = base + r0 * 0.9 + (c / capas) * (alto - r0 * 1.6);
      prims.push(bolaNube([x + (azar() - 0.5) * ancho * 0.55 * f, y, z + (azar() - 0.5) * ancho * 0.4 * f], rr, 0.9 + 0.1 * (c / capas), gris));
      techo = Math.max(techo, y + rr);
    }
  }
  return { prims, caja: { x, z, base, techo, radio: ancho / 2 + r0 } };
}
const bolaNube = (p, r, luz, gris) => bola(p, r, mezclarColor([255, 255, 255], [96, 104, 120], gris), { a: 0.97, tex: 'nube', sombra: luz });

// Una flecha plana en el suelo (o en el aire): de «desde» hacia «hasta», con su ancho.
export function flechaPlana(desde, hasta, ancho, c, extra = {}) {
  const d = [hasta[0] - desde[0], hasta[1] - desde[1], hasta[2] - desde[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1, u = [d[0] / L, d[1] / L, d[2] / L];
  // De costado: horizontal y perpendicular (si la flecha es vertical, de lado en x).
  let s = [-u[2], 0, u[0]];
  if (Math.hypot(s[0], s[2]) < 1e-6) s = [1, 0, 0];
  const sl = Math.hypot(...s); s = s.map(v => v / sl);
  const w = ancho / 2, cabeza = Math.min(L * 0.45, ancho * 2.2), b = [hasta[0] - u[0] * cabeza, hasta[1] - u[1] * cabeza, hasta[2] - u[2] * cabeza];
  const P = (p, k) => [p[0] + s[0] * k, p[1] + s[1] * k, p[2] + s[2] * k];
  return [
    poligono([P(desde, -w), P(desde, w), P(b, w), P(b, -w)], c, { luz: 0, doble: true, ...extra }),
    poligono([P(b, -w * 2.3), P(b, w * 2.3), hasta], c, { luz: 0, doble: true, ...extra }),
  ];
}
// Una flecha «de verdad» (para fuerzas): una línea gruesa y su punta, que se ven de cualquier lado.
export function flechaFuerza(desde, hasta, c, { w = 3, a = 1, guion = null } = {}) {
  const d = [hasta[0] - desde[0], hasta[1] - desde[1], hasta[2] - desde[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1, u = d.map(v => v / L), k = Math.min(L * 0.3, 0.9);
  const b = [hasta[0] - u[0] * k, hasta[1] - u[1] * k, hasta[2] - u[2] * k];
  let s = [-u[2], 0, u[0]];
  if (Math.hypot(s[0], s[2]) < 1e-6) s = [1, 0, 0];
  const t = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
  const P = (p, v, m) => [p[0] + v[0] * m, p[1] + v[1] * m, p[2] + v[2] * m];
  return [
    linea([desde, b], c, { w, a, guion, sesgo: -0.5 }),
    poligono([P(b, s, -k * 0.42), P(b, s, k * 0.42), hasta], c, { luz: 0, doble: true, a, sesgo: -0.5 }),
    poligono([P(b, t, -k * 0.42), P(b, t, k * 0.42), hasta], c, { luz: 0, doble: true, a, sesgo: -0.5 }),
  ];
}

// Un panel chico dibujado sobre el lienzo (2D): fondo redondeado. Devuelve el rectángulo.
export function panel2d(ctx, x, y, w, h, escala, oscuro = true) {
  const r = 8 * escala;
  ctx.fillStyle = oscuro ? 'rgba(10,16,30,0.82)' : 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fill();
  return { x, y, w, h };
}
export const fuente = (px, peso = 650) => `${peso} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
