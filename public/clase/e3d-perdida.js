// 0.14.78: escena 3D «perdida»: el ángulo de ataque y la pérdida (PHAK cap. 5: el ángulo crítico de unos 16° a 20°, el
// mismo a cualquier velocidad) con el aire que pasa por el ala, y el factor de carga en un viraje nivelado con la
// velocidad de pérdida que sube (el ejemplo del AFH cap. 4: 50 kt a 0°, 60 kt a 45° y 70 kt a 60°; 1, 1.41 y 2 G).
// Unidades: las del modelo del avión (unos 3 ft cada una).
import { poligono, linea, rad, limitar, suave } from './motor3d.js';
import { campo, flechaFuerza, panel2d, fuente } from './e3d-base.js';

export const PERDIDA = Object.freeze({
  aoaCritico: Object.freeze([16, 20]), // PHAK cap. 5: entre unos 16° y 20°, según el diseño del avión
  ejemploCritico: 18, // el de este dibujo
  viraje: Object.freeze([
    Object.freeze({ alabeo: 0, carga: 1, vs: 50 }),
    Object.freeze({ alabeo: 45, carga: 1.41, vs: 60 }),
    Object.freeze({ alabeo: 60, carga: 2, vs: 70 }),
  ]),
});
// El coeficiente de sustentación (esquema): sube con el ángulo hasta el crítico y después cae.
export function cl(a) {
  const c = PERDIDA.ejemploCritico;
  return a <= c ? 0.2 + 0.08 * a : Math.max(0.6, 0.2 + 0.08 * c - (a - c) * 0.14);
}

export const TEXTOS = {
  titulo: 'La pérdida y el factor de carga en 3D',
  recuerda: 'La pérdida depende del ángulo de ataque (16° a 20°), no de la velocidad. En viraje sube: 50, 60 y 70 kt a 0°, 45° y 60°.',
  'aoa.titulo': 'El ángulo de ataque',
  'aoa.texto': 'El ángulo de ataque (angle of attack, **AOA**) es el que forman la **cuerda** del ala y el **viento relativo**.',
  'aoa.mas': 'El viento relativo (relative wind) es el aire que le llega al ala, contrario a la trayectoria; la cuerda (chord) une el borde de ataque con el de salida. No es la actitud.',
  'masAoa.titulo': 'Más ángulo, más sustentación',
  'masAoa.texto': 'Más ángulo de ataque da más sustentación… **hasta un límite**. El aire sigue pegado a la parte de arriba del ala.',
  'masAoa.mas': 'La sustentación (lift) crece con el ángulo. Más lento necesitas más ángulo de ataque para sostener el mismo peso. Por eso, al bajar la velocidad, la nariz va más arriba.',
  'critico.titulo': 'El ángulo crítico',
  'critico.texto': 'Pasado el **ángulo crítico** (unos **16° a 20°**), el aire se despega de arriba del ala: **pérdida** (stall) y cae la sustentación.',
  'critico.mas': 'Cada avión entra en pérdida siempre al mismo ángulo de ataque, a cualquier velocidad, peso o actitud. Avisan la bocina de pérdida y la sacudida (buffet).',
  'recuperar.titulo': 'Cómo se sale',
  'recuperar.texto': 'Para salir: **baja la nariz** (menos ángulo de ataque). El aire se vuelve a pegar al ala y vuelve la sustentación.',
  'recuperar.mas': 'Primero el ángulo de ataque; después alas niveladas y potencia. Tirar de los mandos para «no caer» agranda la pérdida.',
  'g0.titulo': 'Vuelo nivelado: 1 G',
  'g0.texto': 'Recto y nivelado, la sustentación es igual al peso: **1 G**. Este avión entra en pérdida a **50 kt**.',
  'g0.mas': 'Son los números del ejemplo del Airplane Flying Handbook (AFH): un avión que entra en pérdida a 50 kt en vuelo nivelado.',
  'g45.titulo': 'Viraje de 45°',
  'g45.texto': 'En un viraje nivelado de **45°** el ala debe levantar más: **1.41 G**. La pérdida sube a **60 kt**.',
  'g45.mas': 'Parte de la sustentación se inclina para hacer girar al avión; para no bajar, el ala tiene que dar más. La velocidad de pérdida crece con la raíz cuadrada del factor de carga (load factor).',
  'g60.titulo': 'Viraje de 60°',
  'g60.texto': 'A **60°**: **2 G** y la pérdida sube a **70 kt**. En un viraje cerrado, el avión entra en pérdida con más velocidad.',
  'g60.mas': 'Por eso es peligroso apretar el viraje a final con poca velocidad. Un avión de categoría normal está diseñado para 3.8 G; pasado 60° el factor de carga crece muy rápido.',
  'l.viento': 'Viento relativo', 'l.cuerda': 'Cuerda', 'l.aoa': 'AOA {v}°', 'l.sust': 'Sustentación', 'l.despegado': 'Aire despegado',
  'l.peso': 'Peso', 'l.sustG': 'Sustentación {v} G', 'l.giro': 'Lo que hace girar', 'l.grafico': 'Sustentación', 'l.critico': 'Crítico',
  'estado.aoa': 'Ángulo de ataque {v}° — {e}', 'e.normal': 'el aire va pegado', 'e.perdida': 'PÉRDIDA', 'e.aviso': 'cerca del crítico',
  'estado.giro': 'Alabeo {b}° · {n} G · pérdida a {vs} kt',
};

// ---------- el perfil del ala (NACA 2412) ----------
const CUERDA = 6, BORDE = -3, PIVOTE = -1.5, ENV = 3.2, ZC = -ENV - 0.05; // ZC: el lado del ala que mira a la cámara
export function perfil(n = 16) {
  const m = 0.02, p = 0.4, t = 0.12, arriba = [], abajo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
    const yc = x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x);
    arriba.push([BORDE + x * CUERDA, (yc + yt) * CUERDA]);
    abajo.push([BORDE + x * CUERDA, (yc - yt) * CUERDA]);
  }
  return [...arriba, ...abajo.reverse().slice(1, -1)];
}
const PERFIL = perfil();
const girar = ([x, y], a) => { const s = Math.sin(-rad(a)), c = Math.cos(-rad(a)), dx = x - PIVOTE; return [PIVOTE + dx * c - y * s, dx * s + y * c]; };
// El ángulo de ataque de cada paso en el tiempo (sube, se queda y vuelve a empezar).
export function aoaEn(id, t) {
  const tramo = (a, b, dur, quieto = 2.5) => { const T = dur + quieto * 2, k = t % T; return k < quieto ? a : k < quieto + dur ? a + (b - a) * suave((k - quieto) / dur) : b; };
  if (id === 'aoa') return 5 + Math.sin(t * 0.8) * 0.6;
  if (id === 'masAoa') return tramo(5, 14, 5);
  if (id === 'critico') return tramo(14, 22, 5);
  if (id === 'recuperar') return tramo(22, 6, 3.5);
  return 4;
}

export const PASOS = [
  { id: 'aoa', sinAvion: true, camara: { mira: [-1, 0.5, 0], giro: 22, alto: 3, dist: 17, fov: 48 }, tQuieto: 1 },
  { id: 'masAoa', sinAvion: true, camara: { mira: [-1, 0.8, 0], giro: 22, alto: 4, dist: 17, fov: 48 }, tQuieto: 9 },
  { id: 'critico', sinAvion: true, camara: { mira: [-0.5, 1, 0], giro: 24, alto: 6, dist: 17, fov: 48 }, tQuieto: 9.5 },
  { id: 'recuperar', sinAvion: true, camara: { mira: [-1, 0.8, 0], giro: 22, alto: 4, dist: 17, fov: 48 }, tQuieto: 7 },
  { id: 'g0', giro: 0, camara: { seguir: 1, mira: [0, 0, 0], giroRel: 35, alto: 12, dist: 26, fov: 48 }, tQuieto: 3 },
  { id: 'g45', giro: 45, camara: { seguir: 1, mira: [0, 0, 0], giroRel: 20, alto: 8, dist: 26, fov: 48 }, tQuieto: 3 },
  { id: 'g60', giro: 60, camara: { seguir: 1, mira: [0, 0, 0], giroRel: 20, alto: 8, dist: 26, fov: 48 }, tQuieto: 3 },
];

// El avión en cada paso: en los del ala, quieto (no se dibuja); en los virajes, en un círculo con su alabeo fijo.
export function avion(paso, t) {
  if (paso.sinAvion) return { pos: [0, 0, 0], rumbo: 90, cabeceo: 0, alabeo: 0, kt: 90 };
  const v = PERDIDA.viraje.find(x => x.alabeo === paso.giro);
  if (!v.alabeo) return { pos: [-60 + ((t * 10) % 120), 0, 0], rumbo: 90, cabeceo: 2, alabeo: 0, kt: 95 };
  const R = v.alabeo === 45 ? 34 : 22, w = 0.3, th = t * w;
  return { pos: [Math.sin(th) * R, 0, Math.cos(th) * R], rumbo: ((th * 180) / Math.PI + 90) % 360, cabeceo: 2, alabeo: v.alabeo, kt: 95 };
}

export function construir(paleta) {
  return { prims: campo({ x0: -3000, z0: -3000, x1: 3000, z1: 3000, n: 6, altura: () => -120, paleta, semilla: 41, liso: true }) };
}

const VERDE = [60, 210, 110], NARANJA = [255, 150, 40], ROJO = [240, 80, 70], CELESTE = [140, 210, 255], BLANCO = [255, 255, 255];
export function armarPaso() { return { prims: [], etiquetas: [] }; }

export function cuadro({ paso, t, avion: a, T }) {
  const prims = [], etiquetas = [];
  if (paso.sinAvion) {
    const alfa = aoaEn(paso.id, t), crit = PERDIDA.ejemploCritico, perdida = alfa > crit;
    // El ala: el perfil girado, estirado en z.
    const p2 = PERFIL.map(q => girar(q, alfa));
    for (let i = 0; i < p2.length; i++) {
      const [ax, ay] = p2[i], [bx, by] = p2[(i + 1) % p2.length];
      prims.push(poligono([[ax, ay, -ENV], [bx, by, -ENV], [bx, by, ENV], [ax, ay, ENV]], [226, 232, 242], { luz: 1 }));
    }
    prims.push(poligono(p2.map(([x, y]) => [x, y, ENV]), [190, 198, 212], { luz: 1, doble: true }));
    prims.push(poligono(p2.map(([x, y]) => [x, y, -ENV]).reverse(), [176, 186, 204], { luz: 0.3, doble: true, borde: [90, 100, 120, 0.9] }));
    // La cuerda (extendida hacia adelante) y el viento relativo.
    const le = girar([BORDE - 3.5, 0], alfa), te = girar([BORDE + CUERDA + 1, 0], alfa);
    prims.push(linea([[le[0], le[1], ZC], [te[0], te[1], ZC]], BLANCO, { a: 0.95, w: 1.6, guion: [6, 4] }));
    prims.push(linea([[BORDE - 7, 0, ZC], [BORDE, 0, ZC]], CELESTE, { a: 0.9, w: 1.4, guion: [3, 4] }));
    prims.push(...flechaFuerza([-13, -2.4, ZC], [-8, -2.4, ZC], CELESTE, { w: 4 }));
    etiquetas.push({ p: [-11, -2.4, ZC], texto: T('l.viento'), color: CELESTE, prioridad: 8 });
    etiquetas.push({ p: [le[0], le[1], ZC], texto: T('l.cuerda'), prioridad: 7, negrita: false });
    // El arco del ángulo de ataque, en el borde de ataque.
    const arco = [];
    for (let k = 0; k <= 12; k++) { const g = rad(180 - (alfa * k) / 12); arco.push([PIVOTE + Math.cos(g) * 5.4, Math.sin(g) * 5.4, ZC]); }
    prims.push(linea(arco, NARANJA, { w: 3 }));
    etiquetas.push({ p: arco[6], texto: T('l.aoa', { v: Math.round(alfa) }), color: NARANJA, prioridad: 10, resaltada: true });
    // La sustentación: una flecha verde que crece con el ángulo y se achica en la pérdida.
    const L = cl(alfa) * 2.2;
    prims.push(...flechaFuerza([-1.2, 0.6, 0], [-1.2, 0.6 + L, 0], perdida ? ROJO : VERDE, { w: 5 }));
    etiquetas.push({ p: [-1.2, 0.6 + L, 0], texto: T('l.sust'), color: perdida ? ROJO : VERDE, prioridad: 9 });
    // Las líneas de corriente: pegadas al ala, o despegadas y revueltas arriba en la pérdida.
    const sep = limitar((alfa - crit) / 3, 0, 1), avance = t * 70;
    const ext = x => { const c = xx => -(xx - PIVOTE) * Math.sin(rad(alfa)); return x < BORDE ? c(BORDE) * Math.exp((x - BORDE) / 2.5) : x > BORDE + CUERDA ? c(BORDE + CUERDA) * Math.exp(-(x - BORDE - CUERDA) / 5) : c(x); };
    const bump = x => Math.exp(-(((x + 1.2) / 2.2) ** 2));
    for (const y0 of [0.9, 1.8, 2.8, 3.9, -0.9, -1.8, -2.8, -3.9]) {
      const arriba = y0 > 0, k = Math.exp(-(Math.abs(y0) - 0.8) / 2.4);
      for (const z of [ZC - 0.25]) {
        const pts = [];
        for (let x = -12; x <= 12.01; x += 0.5) {
          let y = y0 + (ext(x) + (arriba ? 0.45 : -0.15) * bump(x)) * k;
          if (arriba && sep > 0 && x > BORDE && Math.abs(y0) < 2) {
            // Despegado: sigue derecho desde el borde de ataque y ondula (aire revuelto).
            const yLE = y0 + (ext(BORDE) + 0.45 * bump(BORDE)) * k;
            y = y + (yLE + (x - BORDE) * 0.08 - y) * sep + Math.sin(x * 2.3 + t * 7 + y0 * 3) * 0.28 * sep * limitar((x - BORDE) / 3, 0, 1);
          }
          pts.push([x, y, z]);
        }
        prims.push(linea(pts, perdida && arriba && Math.abs(y0) < 2 ? [255, 190, 120] : [200, 235, 255], { a: 0.9, w: 1.8, guion: [10, 9], avance }));
      }
    }
    // Remolinos encima del ala en la pérdida.
    if (sep > 0) {
      for (const [cx, cy, r] of [[-0.5, 1.4, 0.55], [1.6, 1.0, 0.7], [3.6, 0.6, 0.8]]) {
        const yc = cy + girar([cx, 0], alfa)[1];
        const espiral = Array.from({ length: 26 }, (_, i) => { const g = i * 0.5 - t * 5, rr = r * (0.3 + i / 30); return [cx + Math.cos(g) * rr, yc + Math.sin(g) * rr, 0]; });
        prims.push(linea(espiral, [255, 190, 120], { a: 0.85 * sep, w: 2 }));
      }
      etiquetas.push({ p: [1.6, 2.2 + girar([1.6, 0], alfa)[1], 0], texto: T('l.despegado'), color: [255, 190, 120], prioridad: 8 });
    }
    const e = perdida ? 'e.perdida' : alfa > crit - 3 ? 'e.aviso' : 'e.normal';
    const dibujar = (ctx, ancho, alto, s) => grafico(ctx, ancho, alto, s, alfa, T);
    return { prims, etiquetas, estado: T('estado.aoa', { v: Math.round(alfa), e: T(e) }), clase: perdida ? 'mal' : 'ok', dibujar };
  }
  // Los virajes: las fuerzas desde el centro del avión.
  const v = PERDIDA.viraje.find(x => x.alabeo === paso.giro);
  const h = rad(a.rumbo), b = rad(a.alabeo), L0 = 7;
  const F = [Math.sin(h), 0, Math.cos(h)], R0 = [Math.cos(h), 0, -Math.sin(h)];
  const U = [R0[0] * Math.sin(b), Math.cos(b), R0[2] * Math.sin(b)];
  const c = [a.pos[0], a.pos[1] + 0.6, a.pos[2]];
  const mas = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
  prims.push(...flechaFuerza(c, mas(c, U, L0 * v.carga), VERDE, { w: 5 }));
  prims.push(...flechaFuerza(c, mas(c, [0, -1, 0], L0), ROJO, { w: 5 }));
  etiquetas.push({ p: mas(c, U, L0 * v.carga), texto: T('l.sustG', { v: String(v.carga) }), color: VERDE, prioridad: 10, resaltada: true });
  etiquetas.push({ p: mas(c, [0, -1, 0], L0), texto: T('l.peso'), color: ROJO, prioridad: 9 });
  if (v.alabeo) {
    prims.push(linea([c, [c[0], c[1] + L0, c[2]]], VERDE, { a: 0.8, w: 2, guion: [5, 4] }));
    const lado = [R0[0], 0, R0[2]], k = L0 * v.carga * Math.sin(b);
    prims.push(...flechaFuerza(c, mas(c, lado, k), NARANJA, { w: 3, guion: [6, 4] }));
    etiquetas.push({ p: mas(c, lado, k), texto: T('l.giro'), color: NARANJA, prioridad: 8, negrita: false });
  }
  return { prims, etiquetas, estado: T('estado.giro', { b: v.alabeo, n: String(v.carga), vs: v.vs }), clase: v.alabeo >= 60 ? 'mal' : 'ok', ft: 3000 };
}

// La curva de sustentación con el punto del ángulo de ahora y la raya del ángulo crítico.
function grafico(ctx, ancho, alto, e, alfa, T) {
  const w = Math.min(ancho * 0.36, 190 * e), h = 84 * e, x = ancho - w - 10 * e, y = alto - h - 10 * e;
  panel2d(ctx, x, y, w, h, e);
  ctx.fillStyle = '#ffffff'; ctx.font = fuente(11 * e); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(T('l.grafico'), x + 8 * e, y + 6 * e);
  const gx = x + 10 * e, gw = w - 20 * e, gy = y + 24 * e, gh = h - 34 * e;
  const X = a => gx + (a / 24) * gw, Y = c => gy + gh - (c / 1.8) * gh;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash?.([3 * e, 3 * e]); ctx.lineWidth = 1 * e;
  ctx.beginPath(); ctx.moveTo(X(PERDIDA.ejemploCritico), gy); ctx.lineTo(X(PERDIDA.ejemploCritico), gy + gh); ctx.stroke(); ctx.setLineDash?.([]);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = fuente(9 * e, 500); ctx.textAlign = 'right'; ctx.fillText(T('l.critico'), X(PERDIDA.ejemploCritico) - 3 * e, gy);
  ctx.strokeStyle = '#7bdc9b'; ctx.lineWidth = 2.2 * e; ctx.beginPath();
  for (let a = 0; a <= 24; a += 0.5) { if (a === 0) ctx.moveTo(X(a), Y(cl(a))); else ctx.lineTo(X(a), Y(cl(a))); }
  ctx.stroke();
  ctx.fillStyle = alfa > PERDIDA.ejemploCritico ? '#ff6b5b' : '#ffffff';
  ctx.beginPath(); ctx.arc(X(alfa), Y(cl(alfa)), 4 * e, 0, Math.PI * 2); ctx.fill();
  return { x, y, w, h };
}

export const ESCENA = { id: 'perdida', unidades: { ftH: 3, ftV: 3 }, TEXTOS, PASOS, construir, armarPaso, cuadro, avion, escalaFija: 1, texturaEscala: 0.05, sombra: null, niebla1: { inicio: 80, fin: 600 }, niebla3: [3, 14], ojo1: 0.8, cerca1: 0.3, fov1: 70 };
