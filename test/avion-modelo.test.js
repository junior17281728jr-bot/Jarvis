// 0.14.114: el avión 3D (public/clase/avion-modelo.js y primitivasAvion de motor3d.js): proporciones de un entrenador de
// ala alta (Cessna 172), ruedas donde el juego lo apoya, caras convexas (WebGL las parte en abanico), normales hacia
// afuera, superficies que se mueven hacia el lado correcto, la sombra en piezas que no se pisan y un tope de caras.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirAvion, P, PIE, RUEDAS_Y, normalNewell } from '../public/clase/avion-modelo.js';
import { primitivasAvion, modeloAvion } from '../public/clase/motor3d.js';
import { ALTO_RUEDAS, ESCALA_AVION } from '../public/clase/juego-mundo.js';

const m = construirAvion();
const todas = () => [...m.caras, ...m.moviles.flatMap(x => x.caras), ...m.pala];
const extremos = () => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of todas()) for (const v of f.p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
  return { lo, hi };
};

test('el avión: medidas de un Cessna 172 (27 ft de largo, 36 ft de envergadura, 8.9 ft de alto) y las ruedas en el suelo del juego', () => {
  const { lo, hi } = extremos();
  const largo = (hi[0] - lo[0]) * PIE, env = (hi[2] - lo[2]) * PIE, alto = (hi[1] - lo[1]) * PIE;
  assert.ok(largo > 26 && largo < 28.5, `largo ${largo}`);
  assert.ok(env > 35 && env < 37.5, `envergadura ${env}`);
  assert.ok(alto > 8.3 && alto < 9.5, `alto ${alto}`);
  assert.ok(Math.abs(lo[1] - RUEDAS_Y) < 1e-9, 'lo más bajo son las ruedas');
  // El juego apoya el avión ALTO_RUEDAS sobre el suelo con la escala ESCALA_AVION: las ruedas tocan (±0.3 ft).
  assert.ok(Math.abs(ALTO_RUEDAS / ESCALA_AVION + RUEDAS_Y) * PIE < 0.3, 'ruedas apoyadas en el juego');
  assert.ok(hi[0] > 4.1 && hi[0] < 4.3, 'la nariz en x ≈ 4.2');
  // El ala alta: arriba de la cabina (más alta que el centro del fuselaje) y con diedro (las puntas más arriba).
  assert.ok(m.yAla(5) > m.yAla(0) && m.yAla(0) > P(9, 0, 4.8)[1]);
  assert.ok(m.caras.length + m.moviles.reduce((s, x) => s + x.caras.length, 0) + m.pala.length * 2 < 700, 'tope de caras (rendimiento)');
});

test('el avión: caras planas y convexas, normales hacia afuera y por vértice, sin NaN', () => {
  for (const f of todas()) {
    assert.ok(f.p.length >= 3 && f.p.every(v => v.every(Number.isFinite)));
    const n = normalNewell(f.p);
    // Convexa: todos los giros del borde hacia el mismo lado (vista desde su normal).
    let signo = 0;
    for (let i = 0; i < f.p.length; i++) {
      const a = f.p[i], b = f.p[(i + 1) % f.p.length], c = f.p[(i + 2) % f.p.length];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const x = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const d = x[0] * n[0] + x[1] * n[1] + x[2] * n[2];
      if (Math.abs(d) < 1e-9) continue;
      if (!signo) signo = Math.sign(d); else assert.equal(Math.sign(d), signo, 'cara no convexa');
    }
    if (f.ns) for (const v of f.ns) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
  }
  // Hacia afuera: la cara de arriba del ala mira arriba y la de abajo del fuselaje (la panza), abajo.
  const ala = m.caras.filter(f => f.p.every(v => v[2] > 0.5 && v[1] > 1.2));
  assert.ok(ala.some(f => f.n[1] > 0.9) && ala.some(f => f.n[1] < -0.9));
  const centro = f => [0, 1, 2].map(k => f.p.reduce((s, v) => s + v[k], 0) / f.p.length);
  const panza = m.caras.filter(f => { const c = centro(f); return c[0] > -1 && c[0] < 0.5 && Math.abs(c[2]) < 0.3 && c[1] < 0.35; });
  assert.ok(panza.length >= 2 && panza.every(f => f.n[1] < -0.5), 'la panza mira abajo');
});

test('el avión: alerones (el derecho baja con alerones +), profundidad (sube con +) y la hélice gira en la nariz', () => {
  const borde = (prims, filtro) => { let y = -Infinity; for (const q of prims) if (q.t === 'p' && q.grupo === 'avion') for (const v of q.p) if (filtro(v)) y = Math.max(y, -v[1]); return -y; };
  const quieto = primitivasAvion({ pos: [0, 0, 0], rumbo: 90, escala: 1 });
  const movido = primitivasAvion({ pos: [0, 0, 0], rumbo: 90, escala: 1, alerones: 15, profundidad: 12 });
  // Rumbo 90: adelante es +x del mundo; la derecha del piloto, −z. Lo más bajo del alerón derecho (punta de atrás).
  const aleronDer = v => v[0] < 0.45 && v[2] < -2.95 && v[2] > -5.2;
  const aleronIzq = v => v[0] < 0.45 && v[2] > 2.95 && v[2] < 5.2;
  assert.ok(borde(movido, aleronDer) < borde(quieto, aleronDer) - 0.05, 'el derecho baja');
  const alto = (prims, f) => Math.max(...prims.filter(q => q.t === 'p' && q.grupo === 'avion').flatMap(q => q.p.filter(f).map(v => v[1])));
  assert.ok(alto(movido, aleronIzq) > alto(quieto, aleronIzq) + 0.05, 'el izquierdo sube');
  const timon = v => v[0] < -4.0 && Math.abs(v[2]) > 0.6;
  assert.ok(alto(movido, timon) > alto(quieto, timon) + 0.05, 'la profundidad sube');
  // La hélice: dos palas que giran en el plano de la nariz.
  const palas = h => primitivasAvion({ pos: [0, 0, 0], rumbo: 0, escala: 1, helice: h }).filter(q => q.t === 'p' && q.doble && q.a === 1 && q.p.every(v => Math.abs(v[2] - m.nariz[0]) < 0.12));
  const p0 = palas(0), p1 = palas(Math.PI / 2);
  assert.equal(p0.length, 2 * m.pala.length);
  const maxY = ps => Math.max(...ps.flatMap(q => q.p.map(v => v[1])));
  assert.ok(maxY(p0) > maxY(p1) + 0.5, 'al girar 90° la pala ya no apunta arriba');
});

test('el avión: la sombra es la silueta (piezas convexas que no se pisan) y la API de siempre sigue igual', () => {
  const prims = primitivasAvion({ pos: [0, 5, 0], rumbo: 0, escala: 1, sombra: 0 });
  const sombra = prims.filter(q => q.capa === 'calco');
  assert.equal(sombra.length, m.sombra.length);
  assert.ok(sombra.every(q => q.p.every(v => Math.abs(v[1] - 0.001) < 1e-9) && q.a < 0.5));
  // Las piezas no se pisan: el centro de cada una cae fuera de las otras (en planta).
  const dentro = (pt, pol) => { let ok = true, s = 0; for (let i = 0; i < pol.length; i++) { const a = pol[i], b = pol[(i + 1) % pol.length]; const c = (b[0] - a[0]) * (pt[2] - a[2]) - (b[2] - a[2]) * (pt[0] - a[0]); if (Math.abs(c) < 1e-9) continue; if (!s) s = Math.sign(c); else if (Math.sign(c) !== s) ok = false; } return ok; };
  for (const a of sombra) { const c = [a.p.reduce((s, v) => s + v[0], 0) / a.p.length, 0, a.p.reduce((s, v) => s + v[2], 0) / a.p.length]; for (const b of sombra) if (b !== a) assert.ok(!dentro(c, b.p)); }
  // La envergadura de la sombra: la del ala.
  const xs = sombra.flatMap(q => q.p.map(v => v[0]));
  assert.ok(Math.max(...xs) - Math.min(...xs) > 10.5);
  // modeloAvion sigue con nariz, luces y yAla; las luces de navegación en las puntas del ala.
  const mm = modeloAvion();
  assert.ok(mm.nariz && mm.luces.izquierda[2] < -5.4 && mm.luces.derecha[2] > 5.4 && mm.luces.cola[0] < -4 && typeof mm.yAla === 'function');
  assert.ok(Math.abs(mm.luces.izquierda[1] - m.yAla(5.6)) < 0.1, 'la luz en la punta del ala');
  // Sin luces: ninguna bola.
  assert.equal(primitivasAvion({ pos: [0, 0, 0], luces: false }).filter(q => q.t === 's').length, 0);
});
