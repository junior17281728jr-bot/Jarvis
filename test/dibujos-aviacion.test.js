// 0.14.62: los dibujos de aviación (src/academia/diagramas.js revisa; public/clase/aviacion.js dibuja): la revisión acepta
// y rechaza, las cuentas del triángulo de viento (contra la computadora de vuelo y el ejemplo del PHAK), la lógica del VOR,
// el lado del circuito, los colores de los letreros y la carta, el dibujo con un documento de mentira y los textos i18n.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revisarDiagrama, tarjetaConVisual, TIPOS_DIBUJO, TIPOS_DIAGRAMA, SIMBOLOS_CARTA, TIPOS_LETRERO, MARCAS_PISTA } from '../src/academia/diagramas.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { paqueteMuestra } from './academia-muestra.js';

function nodo(etiqueta) {
  return {
    etiqueta, atributos: {}, hijos: [], textContent: '', padre: null,
    setAttribute(k, v) { this.atributos[k] = v; },
    getAttribute(k) { return this.atributos[k] ?? null; },
    appendChild(h) { h.padre = this; this.hijos.push(h); return h; },
    remove() { if (this.padre) this.padre.hijos = this.padre.hijos.filter(x => x !== this); },
  };
}
globalThis.document = { createElement: nodo, createElementNS: (_, e) => nodo(e) };
const textos = n => [n.textContent, ...n.hijos.flatMap(textos)].filter(Boolean);
const todos = n => [n, ...n.hijos.flatMap(todos)];
const { VISUALES_AVIACION } = await import('../public/clase/aviacion.js');
const { VISUALES } = await import('../public/clase/visuales.js');
const { trianguloViento } = await import('../public/clase/viento.js');
const { lecturaVor } = await import('../public/clase/vor.js');
const { geometriaCircuito, componentesViento } = await import('../public/clase/circuito.js');
const { MARCAS_POR_CLASE, RAYAS_UMBRAL, MARCAS } = await import('../public/clase/pista-marcas.js');
const { COLORES, TIPOS } = await import('../public/clase/letreros.js');
const { COLOR_SIMBOLO, SIMBOLOS } = await import('../public/clase/carta.js');
const { EJEMPLOS } = await import('../public/clase/demo-dibujos.js');

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ± ${tol}`);

test('triángulo de viento: el ejemplo del PHAK y los casos de la computadora de vuelo (E6B)', () => {
  // PHAK cap. 16 (fig. 16-21 a 16-23): TC 090, viento 045/40, TAS 120 → WCA 14° izquierda, TH 076, GS 88.
  const phak = trianguloViento({ curso: 90, tas: 120, viento: { direccion: 45, velocidad: 40 } });
  cerca(phak.wca, -13.63, 0.01, 'WCA'); cerca(phak.rumbo, 76.37, 0.01, 'TH'); cerca(phak.gs, 88.33, 0.01, 'GS');
  assert.equal(Math.round(phak.rumbo), 76); assert.equal(Math.round(phak.gs), 88);
  const casos = [
    // [curso, tas, dir, vel] → [wca, rumbo, gs]
    [[360, 100, 360, 20], [0, 360, 80]], // de frente
    [[360, 100, 180, 20], [0, 360, 120]], // de cola
    [[360, 100, 270, 20], [-11.54, 348.46, 97.98]], // cruzado puro desde la izquierda
    [[90, 100, 180, 20], [11.54, 101.54, 97.98]], // cruzado puro desde la derecha
    [[350, 120, 20, 30], [7.18, 357.18, 93.08]], // pasa por el norte (350 + 7 = 357)
    [[10, 120, 320, 30], [-11.04, 358.96, 98.5]], // y al revés (10 − 11 = 359)
    [[225, 140, 60, 25], [-2.65, 222.35, 164.0]],
  ];
  for (const [[curso, tas, direccion, velocidad], [wca, rumbo, gs]] of casos) {
    const r = trianguloViento({ curso, tas, viento: { direccion, velocidad } });
    const msg = `${curso}/${tas} con ${direccion}/${velocidad}`;
    cerca(r.wca, wca, 0.01, `${msg} WCA`); cerca(r.rumbo === 0 ? 360 : r.rumbo, rumbo, 0.01, `${msg} TH`); cerca(r.gs, gs, 0.01, `${msg} GS`);
    // El dibujo cierra: W→P es la TAS con el rumbo, E→P la GS con el curso.
    const ax = r.P[0] - r.W[0], ay = r.P[1] - r.W[1];
    cerca(Math.hypot(ax, ay), tas, 1e-9, `${msg} |TAS|`);
    cerca(((Math.atan2(ax, -ay) * 180) / Math.PI + 360) % 360, r.rumbo, 1e-6, `${msg} dirección TAS`);
    cerca(Math.hypot(...r.P), r.gs, 1e-9, `${msg} |GS|`);
  }
  assert.equal(trianguloViento({ curso: 90, tas: 50, viento: { direccion: 0, velocidad: 60 } }), null, 'sin solución');
});

test('VOR: la bandera y la aguja dependen del OBS y del radial (2° por punto, a fondo a los 10°)', () => {
  const casos = [
    [360, 10, 'FROM', -10], [360, 184, 'TO', 4], [10, 350, 'FROM', 20], [90, 360, 'OFF', 90],
    [360, 0, 'FROM', 0], [360, 180, 'TO', 0], [60, 56, 'FROM', 4], [180, 4, 'TO', 4], [270, 95, 'TO', 5], [45, 30, 'FROM', 15],
  ];
  for (const [curso, radial, bandera, desvio] of casos) {
    const l = lecturaVor(curso, radial);
    assert.equal(l.bandera, bandera, `OBS ${curso} radial ${radial}`);
    cerca(l.desvio, desvio, 1e-9, `OBS ${curso} radial ${radial}`);
    assert.equal(l.puntos, Math.max(-5, Math.min(5, desvio / 2)));
  }
  // El curso recíproco invierte la bandera y la aguja (sentido normal en los dos).
  for (const [c, r] of [[30, 40], [200, 190], [300, 120]]) {
    const a = lecturaVor(c, r), b = lecturaVor(c + 180, r);
    assert.notEqual(a.bandera, b.bandera); cerca(a.desvio, -b.desvio, 1e-9, 'recíproco');
  }
  // El rumbo no cambia el CDI.
  const raiz = nodo('div');
  VISUALES.vor(raiz, { curso: 360, radial: 184, rumbo: 90 }, {});
  const raiz2 = nodo('div');
  VISUALES.vor(raiz2, { curso: 360, radial: 184, rumbo: 270 }, {});
  const cdi = r => JSON.stringify(todos(todos(r).find(n => /clase-dib-vor-cdi/.test(n.atributos.class ?? ''))).map(n => [n.etiqueta, n.atributos, n.textContent]));
  assert.equal(cdi(raiz), cdi(raiz2));
});

test('circuito: a la izquierda por defecto, los rumbos de cada tramo y el viento sobre la pista', () => {
  const izq = geometriaCircuito({ pista: '36' });
  assert.equal(izq.lado, 'izquierda');
  assert.equal(izq.ladoDelCircuito, 270, 'pista 36 a la izquierda: el circuito al oeste');
  assert.deepEqual(izq.rumbos, { upwind: 360, crosswind: 270, downwind: 180, base: 90, final: 360, entrada: 135, salida: 315 });
  const der = geometriaCircuito({ pista: '09', lado: 'derecha' });
  assert.equal(der.ladoDelCircuito, 180, 'pista 9 a la derecha: el circuito al sur');
  assert.deepEqual(der.rumbos, { upwind: 90, crosswind: 180, downwind: 270, base: 360, final: 90, entrada: 315, salida: 135 });
  assert.equal(geometriaCircuito({ pista: '27L' }).pista.opuesta, '9R');
  assert.equal(geometriaCircuito({ pista: '18C' }).pista.opuesta, '36C');
  const k = componentesViento(270, 300, 12);
  cerca(k.frente, 10.39, 0.01, 'frente'); cerca(k.cruzado, 6, 1e-9, 'cruzado desde la derecha');
  // Dibujado: a la izquierda el tramo de viento en cola queda arriba de la pista; a la derecha, abajo.
  const yDownwind = p => { const r = nodo('div'); VISUALES.circuito(r, p, {}); const d = todos(r).find(n => n.etiqueta === 'path' && /L90 /.test(n.atributos.d ?? '')); return Number(/L90 ([\d.]+)/.exec(d.atributos.d)[1]); };
  assert.ok(yDownwind({ pista: '27' }) < 150 && yDownwind({ pista: '27', lado: 'derecha' }) > 150);
});

test('marcas de pista, letreros y carta: lo que manda la FAA', () => {
  assert.deepEqual(MARCAS_POR_CLASE.visual, ['designador', 'eje']);
  assert.equal(MARCAS_POR_CLASE.no_precision.length, 4);
  assert.equal(MARCAS_POR_CLASE.precision.length, 6);
  assert.deepEqual(RAYAS_UMBRAL, { 60: 4, 75: 6, 100: 8, 150: 12, 200: 16 });
  assert.deepEqual(MARCAS, [...MARCAS_PISTA]);
  assert.deepEqual(TIPOS, [...TIPOS_LETRERO]);
  assert.deepEqual(SIMBOLOS, [...SIMBOLOS_CARTA]);
  assert.deepEqual(COLORES.obligatorio, ['rojo', 'blanco']);
  assert.deepEqual(COLORES.ubicacion, ['negro', 'amarillo', 'amarillo']);
  for (const t of ['direccion', 'destino', 'informacion']) assert.deepEqual(COLORES[t], ['amarillo', 'negro']);
  assert.deepEqual(COLORES.distancia, ['negro', 'blanco']);
  for (const s of ['aeropuerto_torre', 'clase_b', 'clase_d', 'clase_e_1200', 'restringida', 'prohibida', 'vor', 'vor_dme', 'vortac', 'mef']) assert.equal(COLOR_SIMBOLO[s], 'azul', s);
  for (const s of ['aeropuerto_sin_torre', 'clase_c', 'clase_e_superficie', 'clase_e_700', 'moa', 'ndb']) assert.equal(COLOR_SIMBOLO[s], 'magenta', s);
  // El dibujo usa esas clases de color.
  const raiz = nodo('div');
  VISUALES.letreros(raiz, { letreros: [{ tipo: 'obligatorio', texto: '15-33' }, { tipo: 'ubicacion', texto: 'A', pegado: true }] }, {});
  const clases = todos(raiz).map(n => n.atributos.class ?? '').join(' ');
  assert.match(clases, /clase-dib-color-rojo/); assert.match(clases, /clase-dib-letras-blanco/); assert.match(clases, /clase-dib-color-negro/); assert.match(clases, /clase-dib-marco-amarillo/);
  assert.equal(todos(raiz).filter(n => n.etiqueta === 'svg').length, 1, 'pegados: un solo conjunto');
});

test('la revisión acepta los ejemplos y rechaza lo mal llenado', () => {
  for (const [tipo, lista] of Object.entries(EJEMPLOS)) for (const p of lista) assert.deepEqual(revisarDiagrama(tipo, p), [], `${tipo}: ${p.titulo}`);
  const mal = [
    ['circuito', { pista: '37' }, 'pista'], ['circuito', { lado: 'arriba' }, 'lado'], ['circuito', { altitud: 99999 }, 'altitud'],
    ['circuito', { resaltar: 'tramo' }, 'resaltar'], ['circuito', { viento: { direccion: 400, velocidad: 10 } }, 'viento.direccion'],
    ['circuito', { viento: { direccion: 90, velocidad: 99 } }, 'viento.velocidad'], ['circuito', { entrada: 'sí' }, 'entrada'],
    ['pista-marcas', { clase: 'militar' }, 'clase'], ['pista-marcas', { ancho: 80 }, 'ancho'], ['pista-marcas', { mostrar: ['eje', 'eje'] }, 'mostrar'],
    ['pista-marcas', { mostrar: [] }, 'mostrar'], ['pista-marcas', { resaltar: ['luces'] }, 'resaltar'], ['pista-marcas', { numero: '0' }, 'numero'],
    ['letreros', { letreros: [] }, 'letreros'], ['letreros', { letreros: Array.from({ length: 9 }, () => ({ tipo: 'informacion', texto: 'x' })) }, 'letreros'],
    ['letreros', { letreros: [{ tipo: 'neon', texto: 'x' }] }, 'letreros[0].tipo'], ['letreros', { letreros: [{ tipo: 'obligatorio' }] }, 'letreros[0].texto'],
    ['letreros', { letreros: [{ tipo: 'ubicacion', texto: 'x'.repeat(25) }] }, 'letreros[0].texto'], ['letreros', { letreros: [{ tipo: 'distancia', texto: 'tres' }] }, 'letreros[0].texto'],
    ['letreros', { letreros: [{ tipo: 'ubicacion', texto: 'A', flecha: 'izquierda' }] }, 'letreros[0].flecha'], ['letreros', { letreros: [{ tipo: 'direccion', texto: 'A', flecha: 'norte' }] }, 'letreros[0].flecha'],
    ['letreros', { letreros: [{ tipo: 'ubicacion', texto: 'A', pegado: true }] }, 'letreros[0].pegado'],
    ['vor', { radial: 10 }, 'curso'], ['vor', { curso: 361, radial: 10 }, 'curso'], ['vor', { curso: 90, radial: -1 }, 'radial'], ['vor', { curso: 90, radial: 1, rumbo: '90' }, 'rumbo'],
    ['triangulo-viento', { curso: 90, tas: 120 }, 'viento'], ['triangulo-viento', { curso: 90, tas: 10, viento: { direccion: 0, velocidad: 5 } }, 'tas'],
    ['triangulo-viento', { curso: 90, tas: 100, viento: { direccion: 0, velocidad: 100 } }, 'viento_mayor_que_tas'],
    ['carta-simbolos', { simbolos: ['ovni'] }, 'simbolos'], ['carta-simbolos', { resaltar: ['vor', 'vor'] }, 'resaltar'],
  ];
  for (const [tipo, p, motivo] of mal) assert.ok(revisarDiagrama(tipo, p).includes(motivo), `${tipo} ${JSON.stringify(p)} → ${motivo} (${revisarDiagrama(tipo, p)})`);
  for (const tipo of TIPOS_DIBUJO) { assert.deepEqual(revisarDiagrama(tipo, null), ['sin_parametros']); assert.ok(revisarDiagrama(tipo, { titulo: '' }).includes('titulo')); }
  assert.deepEqual(revisarDiagrama('carta-simbolos', {}), [], 'sin lista: todos');
  // No se mezclan con los de la fábrica (su esquema no los tiene).
  for (const tipo of TIPOS_DIBUJO) assert.ok(!TIPOS_DIAGRAMA.includes(tipo));
  assert.equal(tarjetaConVisual({ visual: { tipo: 'vor', parametros: { curso: 90, radial: 270 } } }), true);
  assert.equal(tarjetaConVisual({ visual: { tipo: 'vor', parametros: { curso: 90 } } }), false);
  // La revisión del paquete los rechaza mal llenados y los acepta bien llenados.
  const p = paqueteMuestra();
  const s0 = p.materias[0].temas[0].secciones[0];
  p.materias[0].temas[0].secciones[0] = { ...s0, tipo: 'tarjeta', puntos: ['x'], visual: { tipo: 'triangulo-viento', parametros: { curso: 90, tas: 100, viento: { direccion: 0, velocidad: 150 } } } };
  const r = revisarPaquete(p);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some(e => e.motivo === 'diagrama_no_valido' && /viento_mayor_que_tas/.test(e.ruta)));
  p.materias[0].temas[0].secciones[0].visual.parametros.viento.velocidad = 30;
  assert.ok(!revisarPaquete(p).errores.some(e => e.motivo === 'diagrama_no_valido'));
});

test('cada dibujo se dibuja con sus textos, sin estilos incrustados, con su nombre accesible, y se quita', () => {
  assert.deepEqual(Object.keys(VISUALES_AVIACION).sort(), [...TIPOS_DIBUJO].sort());
  for (const [tipo, lista] of Object.entries(EJEMPLOS)) for (const p of lista) {
    assert.equal(typeof VISUALES[tipo], 'function', tipo);
    const raiz = nodo('div');
    const v = VISUALES[tipo](raiz, p, { modo: 'interactivo' });
    const fig = raiz.hijos[0];
    assert.equal(fig.etiqueta, 'figure'); assert.ok(fig.atributos['aria-label'], `${tipo}: aria-label`);
    for (const n of todos(raiz)) {
      assert.ok(!('style' in n.atributos), `${tipo}: style`);
      if (n.etiqueta === 'svg' && n.atributos.role === 'img') assert.ok(n.atributos['aria-label'], `${tipo}: svg sin nombre`);
      for (const [k, x] of Object.entries(n.atributos)) assert.doesNotMatch(String(x), /NaN|undefined|Infinity/, `${tipo}: ${k}=${x}`);
    }
    const dichos = textos(raiz).join(' | ');
    if (p.titulo) assert.ok(dichos.includes(p.titulo));
    for (const l of p.letreros ?? []) if (l.texto) assert.ok(dichos.includes(l.texto.toUpperCase()) || dichos.includes(l.texto), `${tipo}: ${l.texto}`);
    assert.doesNotMatch(dichos, /\{[a-z]+\}|clase\.dib\./, `${tipo}: texto sin llenar`);
    v.destruir();
    assert.equal(raiz.hijos.length, 0);
  }
  // Sin parámetros no se rompe (lo que llegue mal ya lo rechazó la revisión del paquete).
  for (const tipo of TIPOS_DIBUJO) { const raiz = nodo('div'); VISUALES[tipo](raiz, {}, {}); assert.equal(raiz.hijos.length, 1, tipo); }
});

test('los textos: los de la app (opciones.t) en los dos idiomas, y por defecto el español de es.json', async () => {
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  const tablas = { viento: 'TEXTOS_VIENTO', vor: 'TEXTOS_VOR', circuito: 'TEXTOS_CIRCUITO', pista: 'TEXTOS_PISTA', letreros: 'TEXTOS_LETREROS', carta: 'TEXTOS_CARTA' };
  const archivos = { viento: 'viento', vor: 'vor', circuito: 'circuito', pista: 'pista-marcas', letreros: 'letreros', carta: 'carta' };
  let n = 0;
  for (const [d, nombre] of Object.entries(tablas)) {
    const base = (await import(`../public/clase/${archivos[d]}.js`))[nombre];
    for (const [k, v] of Object.entries(base)) {
      n++;
      assert.equal(es[`clase.dib.${d}.${k}`], v, `es: clase.dib.${d}.${k}`);
      assert.ok(typeof en[`clase.dib.${d}.${k}`] === 'string' && en[`clase.dib.${d}.${k}`], `en: clase.dib.${d}.${k}`);
      assert.deepEqual([...en[`clase.dib.${d}.${k}`].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `variables de clase.dib.${d}.${k}`);
    }
  }
  assert.equal(Object.keys(es).filter(k => k.startsWith('clase.dib.')).length, n, 'ninguna clave de sobra');
  // Con el t() de la app en inglés salen los textos en inglés.
  const t = (clave, v = {}) => String(en[clave] ?? clave).replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, x, a, b) => (Number(v[x]) === 1 ? a : b)).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  const raiz = nodo('div');
  VISUALES.circuito(raiz, { pista: '27', viento: { direccion: 300, velocidad: 12 } }, { modo: 'interactivo', t });
  const dichos = textos(raiz).join(' | ');
  assert.match(dichos, /Downwind/); assert.match(dichos, /All turns to the left\./); assert.match(dichos, /10 kt headwind and 6 kt crosswind from the right/);
  // public/app.js pasa su t() a los dibujos de las tarjetas.
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.equal([...app.matchAll(/\{ modo: 'interactivo', t \}/g)].length, 2);
});
