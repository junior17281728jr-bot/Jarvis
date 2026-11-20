// 0.14.92: efectos de las situaciones 3D: la nube que crece (cúmulo → cúmulo en torre → cumulonimbo con yunque →
// disipación), la lluvia, el rayo y su destello, el granizo, la turbulencia que sacude el avión (y la cabina), el hielo
// en el parabrisas y la alarma de pérdida. Todo depende solo del tiempo (las capturas y las pruebas son repetibles).
import { bola, linea, aleatorio, mezclarColor, limitar, suave } from './motor3d.js';

// Una nube de tormenta según su etapa k: 0–0.4 cúmulo (crece), 0.4–0.75 cúmulo en torre, 0.75–1 madura (yunque arriba),
// 1–1.4 disipación (el yunque se abre, la torre se deshace). ancho y altoMax en unidades del mundo.
export function etapaNube(k) { return k < 0.4 ? 'cumulo' : k < 0.75 ? 'torre' : k <= 1 ? 'madura' : 'disipacion'; }
export function nubeTormenta({ x, z, base, ancho, altoMax, k, semilla = 7, gris = 0 }) {
  const azar = aleatorio(semilla), out = [];
  const crece = limitar(k / 1, 0.06, 1), alto = altoMax * (0.12 + 0.88 * suave(crece));
  const deshace = limitar((k - 1) / 0.4, 0, 1);
  const oscuro = limitar(0.15 + 0.5 * k, 0, 0.6) + gris;
  const puff = (p, r, g, luz, a = 0.97) => out.push(bola(p, r, mezclarColor([255, 255, 255], [70, 78, 96], limitar(g, 0, 0.85)), { a, tex: 'nube', sombra: luz }));
  // La base (más oscura con la madurez).
  const r0 = ancho * 0.24;
  for (let i = 0; i < 8; i++) { const a = azar(), b = azar(), c = azar(); puff([x + (a - 0.5) * ancho * 0.9, base + r0 * 0.7, z + (b - 0.5) * ancho * 0.7], r0 * (0.8 + c * 0.4) * (0.6 + 0.4 * crece), oscuro, 0.75, 0.97 * (1 - deshace * 0.4)); }
  // La torre: 12 capas fijas que se reparten en el alto de ahora (así crece sin saltos).
  for (let c = 1; c <= 12; c++) {
    const f = c / 12, y = base + r0 * 0.8 + f * (alto - r0 * 1.3), angosto = 1 - f * 0.3;
    for (let n = 0; n < 6; n++) {
      const a = azar(), b = azar(), d = azar();
      if (y > base + alto) continue;
      puff([x + (a - 0.5) * ancho * 0.75 * angosto, y, z + (b - 0.5) * ancho * 0.6 * angosto], r0 * (0.8 + d * 0.4) * (0.7 + 0.3 * crece) * (1 + 0.6 * f * crece), oscuro * (1 - f) * 0.7, 0.8 + 0.2 * f, 0.97 * (1 - deshace * 0.6 * (1 - f)));
    }
  }
  // El yunque (anvil): arriba, se abre hacia el este (el viento de altura).
  const yunque = limitar((k - 0.72) / 0.28, 0, 1) + deshace * 0.8;
  for (let n = 0; n < 26; n++) {
    const a = azar(), b = azar(), d = azar();
    if (yunque <= 0) continue;
    const dx = (a * 1.6 - 0.3) * ancho * 1.4 * yunque;
    puff([x + dx, base + alto - r0 * 0.4 + d * r0 * 0.4, z + (b - 0.5) * ancho * (0.8 + yunque * 0.8)], r0 * (0.8 + d * 0.4), 0.05, 1, 0.95 * Math.min(1, yunque * 1.5));
  }
  return out;
}
// La lluvia: rayas que caen (en un círculo de radio r bajo la base), según el tiempo.
export function lluvia({ x, z, r, arriba, abajo = 0, t, n = 36, semilla = 3, color = [140, 160, 200], a = 0.75 }) {
  const azar = aleatorio(semilla), out = [], alto = arriba - abajo, largo = alto * 0.12;
  for (let i = 0; i < n; i++) {
    const g = azar() * Math.PI * 2, d = Math.sqrt(azar()) * r, fase = azar();
    const y = arriba - ((t * 0.9 + fase) % 1) * alto, px = x + Math.cos(g) * d, pz = z + Math.sin(g) * d;
    out.push(linea([[px, y, pz], [px - largo * 0.15, Math.max(abajo, y - largo), pz]], color, { a, w: 1.8 }));
  }
  return out;
}
// El granizo: bolitas blancas que caen.
export function granizo({ x, z, r, arriba, abajo = 0, t, n = 18, semilla = 5, tam = 0.06 }) {
  const azar = aleatorio(semilla), out = [];
  for (let i = 0; i < n; i++) {
    const g = azar() * Math.PI * 2, d = Math.sqrt(azar()) * r, fase = azar();
    out.push(bola([x + Math.cos(g) * d, arriba - ((t * 1.4 + fase) % 1) * (arriba - abajo), z + Math.sin(g) * d], tam, [245, 248, 255], { a: 1, min: 2 }));
  }
  return out;
}
// ¿Hay un rayo ahora? (un destello corto cada «periodo» segundos, con su fase).
export const destello = (t, periodo = 3.1, fase = 0) => { const q = (t + fase) % periodo; return q < 0.09 ? 1 : q < 0.16 ? 0.35 : q < 0.24 ? 0.8 : 0; };
// El rayo: una línea quebrada de la nube al suelo.
export function rayo({ x, z, arriba, abajo = 0, semilla = 1, a = 1 }) {
  const azar = aleatorio(semilla), pts = [];
  let px = x, pz = z;
  for (let i = 0; i <= 8; i++) { pts.push([px, arriba - ((arriba - abajo) * i) / 8, pz]); px += (azar() - 0.5) * (arriba - abajo) * 0.12; pz += (azar() - 0.5) * (arriba - abajo) * 0.06; }
  return [linea(pts, [255, 255, 240], { a, w: 3 }), linea(pts, [190, 200, 255], { a: a * 0.45, w: 8 })];
}
// La turbulencia: el avión se sacude (alabeo, cabeceo y un poco de altura). f: 0 a 1.
export function sacudir(avion, t, f, escalaY = 0.02) {
  if (f <= 0) return avion;
  const n = (a, b) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.3) * 0.4;
  return { ...avion, alabeo: avion.alabeo + n(13.1, 21.7) * 22 * f, cabeceo: avion.cabeceo + n(17.3, 9.1) * 9 * f, pos: [avion.pos[0], avion.pos[1] + n(7.7, 15.9) * escalaY * f, avion.pos[2]], kt: avion.kt + n(5.3, 11.1) * 12 * f };
}
// Lo que se dibuja encima (2D): el destello del rayo, el borde rojo de la alarma y el hielo en el parabrisas.
export function pintarDestello(ctx, ancho, alto, a) {
  if (a <= 0) return;
  ctx.fillStyle = `rgba(235,240,255,${(0.55 * a).toFixed(3)})`; ctx.fillRect(0, 0, ancho, alto);
}
export function pintarAlarma(ctx, ancho, alto, a) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(ancho / 2, alto / 2, Math.min(ancho, alto) * 0.3, ancho / 2, alto / 2, Math.max(ancho, alto) * 0.7);
  g.addColorStop(0, 'rgba(255,40,40,0)'); g.addColorStop(1, `rgba(255,40,40,${(0.5 * a).toFixed(3)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, ancho, alto);
}
export function pintarHielo(ctx, ancho, alto, k) {
  if (k <= 0) return;
  const g = ctx.createRadialGradient(ancho / 2, alto * 0.4, Math.min(ancho, alto) * (0.55 - 0.3 * k), ancho / 2, alto * 0.4, Math.max(ancho, alto) * 0.65);
  g.addColorStop(0, 'rgba(225,240,255,0)'); g.addColorStop(1, `rgba(225,240,255,${(0.85 * k).toFixed(3)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, ancho, alto);
}
