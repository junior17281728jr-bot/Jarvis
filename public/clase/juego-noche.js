// 0.14.100: la noche en el Juego: las luces del aeropuerto (bordes de pista, umbral y final, calles de rodaje, el faro y
// el PAPI/VASI), los otros aviones con sus luces de posición y el derecho de paso, y el cielo de día, al atardecer y de
// noche. Sin documento ni ventana (las pruebas lo usan tal cual). Los datos, de los textos de la FAA (tabla LUCES_FAA).
import { bola, primitivasAvion } from './motor3d.js';
import { PALETAS } from './e3d-base.js';
import { PISTA, VUELO, enPista, enAgua } from './vuelo-modelo.js';

// ---------- los datos (con su fuente) ----------
export const LUCES_FAA = Object.freeze({
  posicion: Object.freeze({ izquierda: 'rojo', derecha: 'verde', cola: 'blanco', fuente: 'AFH cap. 11 (Night Operations)' }),
  // «Si ves la roja a la izquierda y la verde a la derecha, va en tu misma dirección; si la roja está a la derecha y la
  // verde a la izquierda, podría venir de frente» (AFH cap. 11).
  bordePista: Object.freeze({ color: 'blanco', precaucion: 'amarillo', precaucionFt: 2000, fuente: 'AIM 2-1-4' }),
  extremos: Object.freeze({ haciaAfuera: 'verde', haciaLaPista: 'rojo', fuente: 'AIM 2-1-4' }),
  rodaje: Object.freeze({ borde: 'azul', fuente: 'AIM 2-1-10' }),
  faro: Object.freeze({ colores: Object.freeze(['blanco', 'verde']), destellosMin: 24, destellosMax: 30, fuente: 'AIM 2-1-9' }),
  // PAPI (FIG 2-1-5): más de 3.5° todo blanco; 3.2° tres blancas; 3° dos y dos; 2.8° una blanca; menos de 2.5° todo rojo.
  papi: Object.freeze({ unidades: 4, sendaGrados: 3, cortes: Object.freeze([2.5, 2.83, 3.17, 3.5]), lado: 'izquierda', fuente: 'AIM 2-1-2' }),
  // VASI de 2 barras (FIG 2-1-2): en la senda, la barra lejana roja y la cercana blanca («rojo sobre blanco»).
  vasi: Object.freeze({ sendaGrados: 3, cercana: 2.5, lejana: 3.5, fuente: 'AIM 2-1-2' }),
  derechoDePaso: Object.freeze({ converge: 'derecha', frente: 'ambos_derecha', alcance: 'derecha', fuente: '14 CFR 91.113' }),
});

const COLORES = { rojo: [255, 50, 40], verde: [60, 255, 120], blanco: [255, 250, 235], amarillo: [255, 200, 60], azul: [70, 120, 255] };
const rad = g => (g * Math.PI) / 180;
const norm180 = g => ((((g % 360) + 540) % 360) - 180);
const FT = VUELO.ftPorUnidad;

// ---------- el cielo: día, atardecer y noche ----------
export const HORAS = Object.freeze(['dia', 'atardecer', 'noche']);
export const PALETA_NOCHE = Object.freeze({
  ...PALETAS.oscuro,
  cieloAlto: [4, 8, 20], cieloBajo: [16, 24, 46], bruma: [20, 28, 48], sueloLejos: [8, 12, 20], niebla: [10, 14, 24],
  pasto: [18, 26, 20], pasto2: [22, 30, 22], bosque: [10, 16, 12], tierra: [26, 24, 20], agua: [10, 16, 30], asfalto: [16, 17, 20], marca: [52, 54, 58],
  pastoAeropuerto: [16, 24, 16], edificio: [34, 36, 42], techo: [26, 28, 34], ambiente: 0.22, oscuro: true, noche: true,
});
export const paletaDe = hora => (hora === 'noche' ? PALETA_NOCHE : hora === 'atardecer' ? PALETAS.oscuro : PALETAS.claro);
export const solDe = hora => (hora === 'noche' ? [0.3, -0.5, 0.2] : hora === 'atardecer' ? [-0.7, 0.18, -0.3] : [-0.4, 0.8, -0.45]);
export const conLuces = hora => hora !== 'dia';

// ---------- el aeropuerto de noche ----------
// Dónde está un punto de la pista: a lo largo (ft desde el centro, + hacia el norte de la 36) → al mundo.
// (0.14.102: para cualquier pista, con su rumbo: a lo largo hacia donde se aterriza, de costado a la derecha)
const enMundo = (largo, costado, ft = 3, pista = PISTA) => {
  const h = rad(pista.rumbo);
  return [pista.x + (Math.sin(h) * largo + Math.cos(h) * costado) / FT, ft / FT, pista.z + (Math.cos(h) * largo - Math.sin(h) * costado) / FT];
};
// El color de una luz de borde a «largo» ft del centro, para quien aterriza en la 36 (la precaución: los últimos 2,000 ft
// o la mitad de la pista, lo que sea menos; AIM 2-1-4).
export function colorBorde(largo, pista = PISTA) {
  const zona = Math.min(LUCES_FAA.bordePista.precaucionFt, pista.largoFt / 2);
  return largo > pista.largoFt / 2 - zona ? LUCES_FAA.bordePista.precaucion : LUCES_FAA.bordePista.color;
}
// Las luces de un extremo vistas desde un punto: verde hacia afuera (el umbral, para quien llega) y roja hacia la pista
// (el final, para quien despega). extremo: -1 = el umbral de la 36 (sur), +1 = el otro extremo (norte).
// obs: { x, z } de quien mira (o, como antes, solo su z para la 36).
export function colorExtremo(extremo, obs, pista = PISTA) {
  const o = typeof obs === 'number' ? { x: pista.x, z: obs } : obs;
  const largo = enPista(o.x, o.z, pista).largo, borde = (extremo * pista.largoFt) / 2;
  const afuera = extremo < 0 ? largo < borde : largo > borde;
  return afuera ? LUCES_FAA.extremos.haciaAfuera : LUCES_FAA.extremos.haciaLaPista;
}
// Las luces fijas (no dependen de quién mira): bordes de pista y de la calle de rodaje. → [{ p, color }]
export function lucesFijas(pista = PISTA) {
  const out = [], L = pista.largoFt / 2, W = pista.anchoFt / 2 + 5;
  for (let a = -L; a <= L + 1; a += 200) for (const s of [-1, 1]) out.push({ p: enMundo(a, s * W, 3, pista), color: colorBorde(a, pista), tipo: 'borde' });
  // La calle de rodaje paralela (al este, a la derecha de la 36, como la dibuja aeropuerto()): sus dos bordes, en azul.
  const t0 = pista.anchoFt / 2 * 3.4, t1 = pista.anchoFt / 2 * 4.2;
  for (let a = -L * 0.9; a <= L * 0.9 + 1; a += 150) for (const c of [t0, t1]) out.push({ p: enMundo(a, c, 3, pista), color: LUCES_FAA.rodaje.borde, tipo: 'rodaje' });
  return out;
}
// Las de los extremos, según dónde está quien mira.
export function lucesExtremos(obs, pista = PISTA) {
  const out = [], W = pista.anchoFt / 2;
  for (const e of [-1, 1]) for (let k = 0; k < 8; k++) out.push({ p: enMundo((e * pista.largoFt) / 2 + e * 3, -W + (k * pista.anchoFt) / 7, 3, pista), color: colorExtremo(e, obs, pista), tipo: 'extremo' });
  return out;
}
// El faro del aeropuerto: blanco y verde alternados, 26 destellos por minuto (dentro de 24 a 30). → 'blanco' | 'verde' | null
export const FARO_PERIODO = 60 / 26;
export function faro(t) {
  const n = Math.floor(t / FARO_PERIODO), fase = t / FARO_PERIODO - n;
  return fase < 0.18 ? LUCES_FAA.faro.colores[n % 2] : null;
}
export const destellosPorMinuto = () => 60 / FARO_PERIODO;

// ---------- PAPI y VASI ----------
// Las luces del PAPI (de afuera hacia la pista) para un ángulo de senda: cada una blanca si se ve por encima de su corte.
export function papi(angulo) {
  return LUCES_FAA.papi.cortes.map(c => (angulo > c ? 'blanco' : 'rojo'));
}
// La lectura del PAPI: 'alto' | 'algo_alto' | 'en_senda' | 'algo_bajo' | 'bajo'
export function lecturaPapi(angulo) {
  const blancas = papi(angulo).filter(c => c === 'blanco').length;
  return ['bajo', 'algo_bajo', 'en_senda', 'algo_alto', 'alto'][blancas];
}
// El VASI de 2 barras: { cercana, lejana } → en la senda, la lejana roja sobre la cercana blanca.
export function vasi(angulo) {
  return { cercana: angulo > LUCES_FAA.vasi.cercana ? 'blanco' : 'rojo', lejana: angulo > LUCES_FAA.vasi.lejana ? 'blanco' : 'rojo' };
}
// Dónde están (a 1,000 ft del umbral de la 36; el PAPI a la izquierda, el VASI a la derecha).
// (las unidades del PAPI, separadas 60 ft: en el juego se distinguen desde 1 NM)
export const SEPARACION_PAPI = 60;
export const SITIO_PAPI = Object.freeze({ largo: -PISTA.largoFt / 2 + 1000, costado: -(PISTA.anchoFt / 2 + 50) });
export const SITIO_VASI = Object.freeze({ largo: -PISTA.largoFt / 2 + 700, lejos: 700, costado: PISTA.anchoFt / 2 + 50 });
// El ángulo (grados) desde el avión hasta las luces: la altura sobre ellas y la distancia por el suelo.
export function anguloSenda(x, z, ft, sitio = SITIO_PAPI) {
  const p = enMundo(sitio.largo, sitio.costado);
  const d = Math.hypot((x - p[0]) * FT, (z - p[2]) * FT);
  return (Math.atan2(ft, Math.max(1, d)) * 180) / Math.PI;
}
export function lucesSenda(x, z, ft) {
  const out = [];
  const a = anguloSenda(x, z, ft, SITIO_PAPI), ps = papi(a);
  // Solo se ven desde la aproximación (al sur del umbral).
  const delante = z < enMundo(SITIO_PAPI.largo, 0)[2];
  ps.forEach((c, k) => out.push({ p: enMundo(SITIO_PAPI.largo, SITIO_PAPI.costado - (3 - k) * SEPARACION_PAPI), color: delante ? c : 'blanco', tipo: 'papi', apagada: !delante }));
  const v = vasi(anguloSenda(x, z, ft, SITIO_VASI));
  for (let k = 0; k < 2; k++) {
    out.push({ p: enMundo(SITIO_VASI.largo, SITIO_VASI.costado + k * 25), color: v.cercana, tipo: 'vasi', apagada: !delante });
    out.push({ p: enMundo(SITIO_VASI.largo + SITIO_VASI.lejos, SITIO_VASI.costado + k * 25), color: v.lejana, tipo: 'vasi', apagada: !delante });
  }
  return { luces: out, angulo: a, lectura: lecturaPapi(a) };
}
// Las luces como primitivas (bolas que brillan). min: tamaño mínimo en píxeles.
export const prima = (l, { r = 0.002, min = 1, a = 1 } = {}) => bola(l.p, r, COLORES[l.color] ?? COLORES.blanco, { tex: 'brillo', min, a });
// Un pueblo de noche (luces amarillas chicas en el suelo): el horizonte se adivina.
export function lucesPueblos() {
  const out = [];
  let s = 17;
  const azar = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (const [cx, cz, n] of [[-14, 10, 70], [16, -12, 60], [8, 22, 50], [-20, -20, 40]]) {
    // (0.14.113: ninguna luz en el lago)
    for (let i = 0; i < n; i++) { const x = cx + (azar() - 0.5) * 4, z = cz + (azar() - 0.5) * 4; if (!enAgua(x, z)) out.push(bola([x, 0.003, z], 0.004, [255, 205, 120], { tex: 'brillo', min: 0.8, a: 0.7 })); }
  }
  return out;
}

// ---------- los otros aviones ----------
export const TRAFICO_TIPOS = Object.freeze(['de_frente', 'cruza_der_izq', 'cruza_izq_der', 'se_aleja', 'alcanzas']);
// Un avión de tráfico según el encuentro, puesto respecto del propio (x, z en unidades; ft; rumbo).
export function crearTrafico(tipo, propio, { distancia = 6 } = {}) {
  const h = rad(propio.rumbo), F = [Math.sin(h), Math.cos(h)], R = [Math.cos(h), -Math.sin(h)];
  const en = (adelante, derecha) => ({ x: propio.x + F[0] * adelante + R[0] * derecha, z: propio.z + F[1] * adelante + R[1] * derecha });
  const base = { tipo, ft: propio.ft + 150, kt: 100 };
  if (tipo === 'de_frente') return { ...base, ...en(distancia, distancia * 0.04), rumbo: (propio.rumbo + 180) % 360 };
  if (tipo === 'cruza_der_izq') return { ...base, ...en(distancia * 0.85, distancia * 0.4), rumbo: (propio.rumbo + 270) % 360 };
  if (tipo === 'cruza_izq_der') return { ...base, ...en(distancia * 0.85, -distancia * 0.4), rumbo: (propio.rumbo + 90) % 360 };
  if (tipo === 'alcanzas') return { ...base, ...en(distancia * 0.35, distancia * 0.008), rumbo: propio.rumbo, kt: 70, ft: propio.ft + 60 };
  return { ...base, ...en(distancia * 0.45, distancia * 0.016), rumbo: propio.rumbo, kt: propio.kt ?? 100 };
}
export function moverTrafico(tr, dt) {
  const h = rad(tr.rumbo), v = (tr.kt * 1.68781 * dt) / FT;
  return { ...tr, x: tr.x + Math.sin(h) * v, z: tr.z + Math.cos(h) * v };
}
// Qué luces de posición se ven desde un punto: la roja cubre desde la nariz hasta 110° a la izquierda, la verde lo mismo a
// la derecha y la blanca de la cola el resto (atrás). Cerca de la nariz se ven las dos (SOLAPE: las alas están separadas
// y de frente se ven juntas). → { rojo, verde, blanco } (true/false)
export const SOLAPE = 10;
export function lucesVisibles(tr, ojo) {
  const rel = norm180((Math.atan2(ojo.x - tr.x, ojo.z - tr.z) * 180) / Math.PI - tr.rumbo);
  return { rojo: rel <= SOLAPE && rel >= -110, verde: rel >= -SOLAPE && rel <= 110, blanco: Math.abs(rel) >= 110 };
}
// Desde la cabina: ¿a dónde va el otro? → 'hacia_ti' | 'se_aleja' | 'der_a_izq' | 'izq_a_der'
export function direccionDe(tr, propio) {
  const dx = tr.x - propio.x, dz = tr.z - propio.z, d = Math.hypot(dx, dz) || 1;
  const vx = Math.sin(rad(tr.rumbo)), vz = Math.cos(rad(tr.rumbo));
  const acerca = -(vx * dx + vz * dz) / d; // + si viene hacia quien mira
  if (acerca > 0.8) return 'hacia_ti';
  if (acerca < -0.8) return 'se_aleja';
  // La derecha de quien mira (hacia el otro): (dz, -dx).
  return vx * dz - vz * dx > 0 ? 'izq_a_der' : 'der_a_izq';
}
// Las luces que se ven y su orden en la pantalla (cuál queda a la izquierda): lo que el alumno «lee».
export function queVes(tr, propio) {
  const v = lucesVisibles(tr, propio);
  const colores = ['rojo', 'verde', 'blanco'].filter(c => v[c]);
  let orden = null;
  if (v.rojo && v.verde) {
    // Las puntas de las alas en el mundo y su lado en la vista de quien mira.
    const h = rad(tr.rumbo), R = [Math.cos(h), -Math.sin(h)];
    const izq = { x: tr.x - R[0] * 0.018, z: tr.z - R[1] * 0.018 }, der = { x: tr.x + R[0] * 0.018, z: tr.z + R[1] * 0.018 };
    const dx = tr.x - propio.x, dz = tr.z - propio.z;
    const lado = p => (p.x - propio.x) * dz - (p.z - propio.z) * dx; // más grande: más a la derecha de la vista
    orden = lado(izq) > lado(der) ? 'rojo_derecha' : 'rojo_izquierda';
  }
  return { colores, orden, direccion: direccionDe(tr, propio) };
}
// El derecho de paso (14 CFR 91.113): → { encuentro: 'converge'|'de_frente'|'alcanzas'|'se_aleja', lado, tiene: 'el'|'tu'|'nadie', accion }
export function derechoDePaso(propio, tr) {
  const marc = norm180((Math.atan2(tr.x - propio.x, tr.z - propio.z) * 180) / Math.PI - propio.rumbo); // dónde está (+ derecha)
  const dif = Math.abs(norm180(tr.rumbo - propio.rumbo));
  if (dif > 150 && Math.abs(marc) < 30) return { encuentro: 'de_frente', lado: 'adelante', tiene: 'nadie', accion: 'ambos_derecha' };
  if (dif < 30 && Math.abs(marc) < 30) return (propio.kt ?? 100) > tr.kt ? { encuentro: 'alcanzas', lado: 'adelante', tiene: 'el', accion: 'pasar_derecha' } : { encuentro: 'se_aleja', lado: 'adelante', tiene: 'nadie', accion: 'mantener' };
  const lado = marc > 0 ? 'derecha' : 'izquierda';
  return { encuentro: 'converge', lado, tiene: lado === 'derecha' ? 'el' : 'tu', accion: lado === 'derecha' ? 'ceder' : 'mantener_atento' };
}
// El avión de tráfico dibujado: de día y al atardecer, el avión con sus luces; de noche, SOLO las luces que se ven desde
// quien mira (y el faro rojo y los destellos blancos, que se ven de todos lados).
export function primitivasTrafico(tr, ojo, { hora = 'dia', t = 0, escala = 0.0032 } = {}) {
  const pos = [tr.x, tr.ft / FT, tr.z];
  const out = hora === 'noche' ? [] : primitivasAvion({ pos, rumbo: tr.rumbo, escala, luces: false, helice: t * 40 }).filter(p => p.t !== 's' || p.tex === 'disco');
  const v = lucesVisibles(tr, ojo);
  const h = rad(tr.rumbo), F = [Math.sin(h), Math.cos(h)], R = [Math.cos(h), -Math.sin(h)];
  const L = (adelante, derecha, arriba) => [pos[0] + (F[0] * adelante + R[0] * derecha) * escala, pos[1] + arriba * escala, pos[2] + (F[1] * adelante + R[1] * derecha) * escala];
  const luz = (p, c, min, a = 1) => out.push(bola(p, 0.45 * escala, c, { tex: 'brillo', min, a }));
  const brillo = hora === 'dia' ? 0.6 : 1;
  if (v.rojo) luz(L(1.4, -5.55, 0.86), COLORES.rojo, 2.6, brillo);
  if (v.verde) luz(L(1.4, 5.55, 0.86), COLORES.verde, 2.6, brillo);
  if (v.blanco) luz(L(-4.45, 0, 1.0), COLORES.blanco, 2.4, brillo);
  // Anticolisión: el faro rojo (arriba) y los destellos blancos en las puntas.
  if ((t + (tr.fase ?? 0)) % 1 < 0.12) luz(L(-4.2, 0, 1.8), [255, 60, 40], 1.6, 1);
  if ((t + (tr.fase ?? 0)) % 1.3 < 0.07) { luz(L(1.4, -5.55, 0.86), COLORES.blanco, 2.2, 1); luz(L(1.4, 5.55, 0.86), COLORES.blanco, 2.2, 1); }
  return out;
}
export const colorLuz = c => COLORES[c] ?? COLORES.blanco;
