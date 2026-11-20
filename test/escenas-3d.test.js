// 0.14.78: las escenas 3D (tipo «escena-3d»): la revisión del paquete, la matemática del motor (proyección, recorte y
// orden del pintor), los pasos de cada escena contra sus textos (es y en), un dibujo completo con un lienzo de mentira
// (sin NaN, sin errores, en 1ª y 3ª persona) y los datos de cada escena contra la tabla de la norma.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revisarDiagrama, tarjetaConVisual, ESCENAS_3D, LIMITES_ESCENA_3D, TIPO_ESCENA_3D } from '../src/academia/diagramas.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { paqueteMuestra } from './academia-muestra.js';

// ---------- un documento y un lienzo de mentira ----------
const llamadas = { numeros: [], texto: [] };
function contexto() {
  const ctx = {
    canvas: null, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineDashOffset: 0, lineCap: '', lineJoin: '',
    createLinearGradient: (...a) => { llamadas.numeros.push(...a); return { addColorStop() {} }; },
    createRadialGradient: (...a) => { llamadas.numeros.push(...a); return { addColorStop() {} }; },
    measureText: s => ({ width: String(s).length * 6 }),
    fillText: (s, ...a) => { llamadas.texto.push(String(s)); llamadas.numeros.push(...a); },
  };
  return new Proxy(ctx, { get(o, k) { if (k in o) return o[k]; return (...a) => { for (const x of a) if (typeof x === 'number') llamadas.numeros.push(x); }; }, set(o, k, v) { o[k] = v; return true; } });
}
function nodo(etiqueta) {
  const n = {
    etiqueta, atributos: {}, hijos: [], textContent: '', padre: null, hidden: false, eventos: {}, width: 0, height: 0,
    get parentNode() { return this.padre; }, get firstChild() { return this.hijos[0] ?? null; },
    setAttribute(k, v) { this.atributos[k] = String(v); if (k === 'hidden') this.hidden = true; },
    getAttribute(k) { return this.atributos[k] ?? null; },
    appendChild(h) { if (h.padre) h.padre.hijos = h.padre.hijos.filter(x => x !== h); h.padre = this; this.hijos.push(h); return h; },
    insertBefore(h, ref) { if (h.padre) h.padre.hijos = h.padre.hijos.filter(x => x !== h); h.padre = this; const i = this.hijos.indexOf(ref); this.hijos.splice(i < 0 ? this.hijos.length : i, 0, h); return h; },
    removeChild(h) { this.hijos = this.hijos.filter(x => x !== h); h.padre = null; return h; },
    remove() { if (this.padre) this.padre.removeChild(this); },
    addEventListener(ev, f) { (this.eventos[ev] ??= []).push(f); },
    removeEventListener() {},
    classList: { toggle() {}, add() {}, remove() {} },
  };
  if (etiqueta === 'canvas') n.getContext = () => contexto();
  return n;
}
globalThis.document = { createElement: nodo, createElementNS: (_, e) => nodo(e), addEventListener() {}, removeEventListener() {}, visibilityState: 'visible', documentElement: nodo('html') };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const todos = n => [n, ...n.hijos.flatMap(todos)];
const textos = n => [n.textContent, ...n.hijos.flatMap(textos)].filter(Boolean);

const M = await import('../public/clase/motor3d.js');
const { ESCENAS, TEXTOS_E3D, TEXTOS_CONTROLES } = await import('../public/clase/escenas3d.js');
const { montarEscena3d, pasosDe } = await import('../public/clase/escena3d.js');
const { VISUALES } = await import('../public/clase/visuales.js');
const ESP = await import('../public/clase/e3d-espacio.js');
const MIN = await import('../public/clase/e3d-minimos.js');
const CIR = await import('../public/clase/e3d-circuito.js');
const FRE = await import('../public/clase/e3d-frentes.js');
const PER = await import('../public/clase/e3d-perdida.js');
const VOR = await import('../public/clase/e3d-vor.js');
const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ± ${tol}`);

test('escena-3d: la revisión acepta lo bien llenado y rechaza lo demás', () => {
  assert.equal(TIPO_ESCENA_3D, 'escena-3d');
  for (const escena of Object.keys(ESCENAS_3D)) assert.deepEqual(revisarDiagrama('escena-3d', { escena }), [], escena);
  assert.deepEqual(revisarDiagrama('escena-3d', { escena: 'espacio-aereo', titulo: 'Las clases', pasos: [{ id: 'c' }, { id: 'c1p', texto: 'La **pared**.', mas: 'Más.' }] }), []);
  const mal = [
    [null, 'sin_parametros'], [{}, 'escena'], [{ escena: 'agujero-negro' }, 'escena'], [{ escena: 'frentes', titulo: '' }, 'titulo'],
    [{ escena: 'frentes', pasos: [] }, 'pasos'], [{ escena: 'frentes', pasos: 'vista' }, 'pasos'],
    [{ escena: 'vor-3d', pasos: Array.from({ length: 6 }, () => ({ id: 'hacia' })) }, 'pasos'],
    [{ escena: 'frentes', pasos: [{ id: 'c' }] }, 'pasos[0].id'], [{ escena: 'frentes', pasos: [{ id: 'vista' }, { id: 'vista' }] }, 'pasos[1].repetido'],
    [{ escena: 'frentes', pasos: [{ id: 'vista', texto: 'x'.repeat(LIMITES_ESCENA_3D.texto + 1) }] }, 'pasos[0].texto'],
    [{ escena: 'frentes', pasos: [{ id: 'vista', mas: 'x'.repeat(LIMITES_ESCENA_3D.mas + 1) }] }, 'pasos[0].mas'],
    [{ escena: 'frentes', pasos: [{ id: 'vista', estilo: 'x' }] }, 'pasos[0].estilo'], [{ escena: 'frentes', color: 'rojo' }, 'color'],
  ];
  for (const [p, motivo] of mal) assert.ok(revisarDiagrama('escena-3d', p).includes(motivo), `${JSON.stringify(p)} → ${motivo} (${revisarDiagrama('escena-3d', p)})`);
  assert.equal(tarjetaConVisual({ visual: { tipo: 'escena-3d', parametros: { escena: 'perdida' } } }), true);
  assert.equal(tarjetaConVisual({ visual: { tipo: 'escena-3d', parametros: { escena: 'otra' } } }), false);
  const paquete = paqueteMuestra();
  const s0 = paquete.materias[0].temas[0].secciones[0];
  paquete.materias[0].temas[0].secciones[0] = { ...s0, tipo: 'tarjeta', puntos: ['x'], visual: { tipo: 'escena-3d', parametros: { escena: 'frentes', pasos: [{ id: 'nada' }] } } };
  assert.ok(revisarPaquete(paquete).errores.some(e => e.motivo === 'diagrama_no_valido' && /pasos\[0\]\.id/.test(e.ruta)));
  paquete.materias[0].temas[0].secciones[0].visual.parametros.pasos = [{ id: 'frio' }];
  assert.ok(!revisarPaquete(paquete).errores.some(e => e.motivo === 'diagrama_no_valido'));
});

test('motor 3D: un punto conocido se proyecta donde debe, lo de atrás no, y el recorte no deja nada detrás de la cámara', () => {
  const cam = M.crearCamara({ ojo: [0, 0, 0], mira: [0, 0, 10], fov: 90 });
  assert.deepEqual(cam.derecha.map(v => Math.round(v * 1e9) / 1e9 + 0), [1, 0, 0], 'mirando al norte, la derecha es el este');
  const c = M.proyectar(cam, [0, 0, 10], 200, 200);
  cerca(c.x, 100, 1e-9, 'x centro'); cerca(c.y, 100, 1e-9, 'y centro'); cerca(c.z, 10, 1e-9, 'z');
  // fov 90° y 200 px de alto: la focal es 100 px; (1, 2, 10) → (110, 80).
  const p = M.proyectar(cam, [1, 2, 10], 200, 200);
  cerca(p.x, 110, 1e-9, 'x'); cerca(p.y, 80, 1e-9, 'y (arriba es menos)');
  assert.equal(M.proyectar(cam, [0, 0, -5], 200, 200), null);
  // La órbita: giro 0 (mirando al norte), 30° arriba, a 10 → el ojo al sur y arriba.
  const o = M.ojoOrbita({ mira: [0, 0, 0], giro: 0, alto: 30, dist: 10 });
  cerca(o[0], 0, 1e-9, 'ojo x'); cerca(o[1], 5, 1e-9, 'ojo y'); cerca(o[2], -10 * Math.cos(Math.PI / 6), 1e-9, 'ojo z');
  // Recorte contra el plano cercano.
  const r = M.recortarCerca([[0, 0, -1], [1, 0, 2], [-1, 0, 2]], 0.5);
  assert.ok(r.length === 4 && r.every(v => v[2] >= 0.5 - 1e-12));
  // Rumbo 090 → adelante es el este; alabeo a la derecha baja el ala derecha.
  const b = M.baseAvion(90, 0, 30);
  cerca(b.F[0], 1, 1e-9, 'F este'); assert.ok(b.R[1] < 0, 'ala derecha abajo');
});

test('motor 3D: el pintor dibuja de lejos a cerca, el suelo primero y lo «calco» en su orden', () => {
  const cam = M.crearCamara({ ojo: [0, 1, -10], mira: [0, 1, 0], fov: 60 });
  const cuadro = z => M.poligono([[-1, 0, z], [1, 0, z], [1, 2, z], [-1, 2, z]], [200, 0, 0], { doble: true });
  const lejos = cuadro(20), medio = cuadro(5), cerca1 = cuadro(0);
  const suelo = { ...cuadro(1), capa: 'suelo' }, calcoA = { ...cuadro(-2), capa: 'calco', c: [1, 1, 1], luz: 0 }, calcoB = { ...cuadro(30), capa: 'calco', c: [2, 2, 2], luz: 0 };
  const lista = M.preparar([medio, cerca1, calcoA, lejos, suelo, calcoB], cam, 400, 300);
  assert.deepEqual(lista.map(x => x.capa), ['suelo', 'calco', 'calco', 'mundo', 'mundo', 'mundo']);
  assert.deepEqual(lista.filter(x => x.capa === 'calco').map(x => x.color[0]), [1, 2], 'calco en el orden de llegada');
  const z = lista.filter(x => x.capa === 'mundo').map(x => x.z);
  assert.deepEqual(z, [...z].sort((a, b) => b - a), 'de lejos a cerca');
  assert.deepEqual(M.ordenarPintor([{ z: 1, i: 0 }, { z: 5, i: 1 }, { z: 3, i: 2 }]).map(x => x.z), [5, 3, 1]);
  // Lo de espaldas y cerrado no se dibuja; lo «doble», sí.
  const espalda = M.poligono([[-1, 2, 0], [1, 2, 0], [1, 0, 0], [-1, 0, 0]], [0, 0, 0]);
  assert.equal(M.preparar([espalda], cam, 400, 300).length + M.preparar([{ ...espalda, n: M.normalDe([...espalda.p].reverse()) }], cam, 400, 300).length, 1);
});

test('cada escena: sus pasos son los de la revisión y cada paso tiene título, texto (corto) y «Ver más» en es y en', () => {
  assert.deepEqual(Object.keys(ESCENAS).sort(), Object.keys(ESCENAS_3D).sort());
  const palabras = s => s.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;
  for (const [id, e] of Object.entries(ESCENAS)) {
    assert.deepEqual(e.PASOS.map(p => p.id), [...ESCENAS_3D[id]], id);
    for (const k of ['titulo', 'recuerda']) assert.ok(e.TEXTOS[k], `${id}.${k}`);
    assert.ok(palabras(e.TEXTOS.recuerda) <= 28, `${id}.recuerda: una línea`);
    for (const p of e.PASOS) for (const k of ['titulo', 'texto', 'mas']) {
      const clave = `clase.e3d.${id}.${p.id}.${k}`;
      assert.equal(es[clave], e.TEXTOS[`${p.id}.${k}`], `es: ${clave}`);
      assert.ok(en[clave], `en: ${clave}`);
      if (k === 'texto') {
        for (const [idioma, t] of [['es', es[clave]], ['en', en[clave]]]) {
          assert.ok(palabras(t) <= 26, `${idioma} ${clave}: ${palabras(t)} palabras`);
          assert.equal((t.match(/\*\*/g) ?? []).length % 2, 0, `${idioma} ${clave}: negritas cerradas`);
        }
      }
    }
  }
  // Todas las claves del módulo están en los dos idiomas, con las mismas variables, y no sobra ninguna.
  for (const [k, v] of Object.entries(TEXTOS_E3D)) {
    assert.equal(es[`clase.e3d.${k}`], v, `es: ${k}`);
    const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(vars(en[`clase.e3d.${k}`] ?? ''), vars(v), `en: ${k}`);
  }
  assert.equal(Object.keys(es).filter(k => k.startsWith('clase.e3d.')).length, Object.keys(TEXTOS_E3D).length, 'ninguna clave de sobra');
  assert.ok(Object.keys(TEXTOS_CONTROLES).every(k => k.startsWith('ctl.')));
});

test('dibujo completo con un lienzo de mentira: cada paso en 1ª y 3ª persona, sin NaN ni errores, con su texto de verdad', async () => {
  const t = (clave, v = {}) => String(en[clave] ?? clave).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  for (const [id, e] of Object.entries(ESCENAS)) {
    for (const idioma of ['es', 'en']) {
      const raiz = nodo('div');
      const api = montarEscena3d(raiz, { escena: id }, idioma === 'en' ? { modo: 'interactivo', t } : {});
      const fig = raiz.hijos[0];
      assert.equal(fig.etiqueta, 'figure'); assert.ok(fig.atributos['aria-label']);
      const vivo = todos(fig).find(n => n.atributos['aria-live'] === 'polite');
      assert.ok(vivo, `${id}: aria-live`);
      for (let n = 0; n < e.PASOS.length; n++) {
        for (const vista of ['3p', '1p']) {
          llamadas.numeros.length = 0; llamadas.texto.length = 0;
          const r = api.fijar({ paso: n, vista, tiempo: n * 3.7 + 1.3 });
          assert.ok(r && r.lista.length > 2, `${id}/${e.PASOS[n].id}/${vista}: dibujó`);
          assert.ok(llamadas.numeros.every(Number.isFinite), `${id}/${e.PASOS[n].id}/${vista}: NaN o Infinity en el lienzo`);
          for (const x of r.lista) for (const q of x.pts ?? x.tramos?.flat() ?? [[x.x, x.y]]) assert.ok(q.every(Number.isFinite), `${id}/${e.PASOS[n].id}: punto`);
          assert.ok(api.estado.paso === n);
          // El subtítulo es texto de verdad (no solo en el lienzo).
          const dicho = textos(vivo).join(' ');
          const esperado = (idioma === 'en' ? en : es)[`clase.e3d.${id}.${e.PASOS[n].id}.titulo`];
          assert.ok(dicho.includes(esperado), `${id}: ${dicho}`);
          assert.doesNotMatch(dicho, /\*\*|clase\.e3d|\{[a-z]+\}/, `${id}: texto sin llenar`);
        }
      }
      // A mitad de los movimientos: entre 3ª y 1ª persona, y a mitad del viaje desde el paso anterior.
      for (let n = 1; n < e.PASOS.length; n++) {
        llamadas.numeros.length = 0;
        api.fijar({ paso: n - 1 });
        for (const r of [api.fijar({ paso: n, transicion: 0.5 }), api.fijar({ paso: n, vista: '1p', mezcla: 0.5 }), api.fijar({ paso: n, vista: '1p', mezcla: 0.7 })]) assert.ok(r && r.lista.length > 5, `${id}: a mitad`);
        assert.ok(llamadas.numeros.every(Number.isFinite), `${id}/${e.PASOS[n].id}: NaN a mitad de un movimiento`);
      }
      for (const n of todos(fig)) {
        assert.ok(!('style' in n.atributos), `${id}: style`);
        for (const [k, x] of Object.entries(n.atributos)) assert.doesNotMatch(String(x), /NaN|undefined|Infinity/, `${id}: ${k}=${x}`);
      }
      // Los botones (con texto) y el «Recuerda» en el último paso.
      const botones = todos(fig).filter(n => n.etiqueta === 'button' && /clase-boton/.test(n.atributos.class ?? ''));
      assert.equal(botones.length, 5, id);
      assert.ok(botones.every(b => b.textContent), id);
      assert.equal(todos(fig).find(n => n.etiqueta === 'aside').hidden, false, `${id}: Recuerda al final`);
      api.ir(0);
      assert.equal(todos(fig).find(n => n.etiqueta === 'aside').hidden, true);
      api.destruir();
      assert.equal(raiz.hijos.length, 0);
    }
  }
  // En las puntas de una ruta abierta y recta el avión va con las alas niveladas.
  const recta = M.crearRuta([[0, 1, 0], [5, 1, 0], [10, 1, 0]], false);
  for (const s of [0, recta.largo / 2, recta.largo]) cerca(M.estadoEnRuta(recta, s).alabeo, 0, 1e-6, `alabeo en s=${s}`);
  // Pasos elegidos por el paquete, con su texto.
  const elegidos = pasosDe(ESCENAS.frentes, [{ id: 'frio', texto: 'Mi **texto**' }, { id: 'vista' }, { id: 'nada' }, { id: 'frio' }]);
  assert.deepEqual(elegidos.map(p => p.def.id), ['frio', 'vista']);
  const raiz = nodo('div');
  const api = montarEscena3d(raiz, { escena: 'frentes', pasos: [{ id: 'frio', texto: 'Mi **texto**' }] }, {});
  assert.ok(todos(raiz).some(n => n.etiqueta === 'strong' && n.textContent === 'texto'));
  api.destruir();
  // El registro la carga recién cuando se usa: primero un hueco y después la escena; destruir() sirve antes de llegar.
  const r2 = nodo('div');
  const diferida = VISUALES['escena-3d'](r2, { escena: 'vor-3d' }, {});
  assert.equal(r2.hijos[0].atributos.class, 'clase-e3d-hueco');
  await new Promise(res => setTimeout(res, 50));
  assert.equal(r2.hijos.length, 1); assert.equal(r2.hijos[0].etiqueta, 'figure');
  diferida.destruir(); assert.equal(r2.hijos.length, 0);
  const r3 = nodo('div');
  VISUALES['escena-3d'](r3, { escena: 'vor-3d' }, {}).destruir();
  await new Promise(res => setTimeout(res, 50));
  assert.equal(r3.hijos.length, 0, 'destruido antes de cargar: no aparece después');
});

test('los datos de cada escena, contra la tabla de la norma', async () => {
  // Espacio aéreo (PHAK cap. 15; B, C y D típicos).
  assert.deepEqual(JSON.parse(JSON.stringify(ESP.ESPACIO_AEREO)), {
    A: { pisoMSL: 18000, techoFL: 600 },
    B: { techoMSL: 10000, pisos: [{ radioNM: 10, pisoMSL: 0 }, { radioNM: 20, pisoMSL: 3000 }, { radioNM: 30, pisoMSL: 6000 }], tipico: true },
    C: { nucleoNM: 5, anilloNM: 10, techoAGL: 4000, pisoAnilloAGL: 1200, tipico: true },
    D: { radioNM: 4, techoAGL: 2500, tipico: true },
    E: { pisoAGL: 1200, pisoCercaAGL: 700, techoMSL: 17999, radioCercaNM: 7 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ESP.REQUISITOS)), { A: ['ifr'], B: ['autorizacion', 'radio', 'transpondedor', 'adsb'], C: ['radio', 'transpondedor', 'adsb'], D: ['radio'], E: [], G: [] });
  const eC = ESP.elevacion('C') * 1000, eD = ESP.elevacion('D') * 1000;
  const casos = [
    [[0, 5000, 3], 'B'], [[0, 9900, 25], 'B'], [[0, 2500, 15], 'E'], [[0, 10500, 5], 'E'], [[0, 18000, 0], 'A'], [[0, 60000, 0], 'A'], [[0, 61000, 0], 'E'],
    [[48, eC + 3900, -14], 'C'], [[48 + 7, eC + 1500, -14], 'C'], [[48 + 7, eC + 1000, -14], ['E', 'G']], [[48 + 11, eC + 3000, -14], 'E'], [[48, eC + 4100, -14], 'E'],
    [[34, eD + 2400, 27 + 3], 'D'], [[34, eD + 2600, 27], 'E'], [[34 + 5, eD + 800, 27], 'E'], [[34 + 5, eD + 600, 27], 'G'], [[-15, ESP.alturaTerreno(-15, -40) * 1000 + 900, -40], 'G'],
  ];
  for (const [[x, ft, z], clase] of casos) assert.ok([clase].flat().includes(ESP.claseEn(x, ft, z)), `(${x}, ${ft}, ${z}) → ${ESP.claseEn(x, ft, z)}`);
  // La geometría usa la tabla: el techo de la C es su elevación + 4,000 ft y el de la B, 10,000 ft MSL.
  const T = k => k;
  const pasoC = ESP.PASOS.find(p => p.id === 'c');
  // (los polígonos dentro de las 10 NM de la C y por debajo de la A)
  const deLaC = ESP.armarPaso(pasoC, { oscuro: false }, T).prims.filter(q => q.t === 'p' && q.p.every(v => Math.hypot(v[0] - 48, v[2] + 14) <= 10.01 && v[1] < 15));
  const maxY = Math.max(...deLaC.flatMap(q => q.p.map(v => v[1])));
  cerca(maxY * 1000, eC + 4000, 1e-6, 'techo de la C');
  // Mínimos VFR (AIM TBL 3-1-1 / 14 CFR 91.155): «bajoLaNube» = el avión por debajo de la nube.
  assert.deepEqual(JSON.parse(JSON.stringify(MIN.MINIMOS_VFR)), {
    B: { visSM: 3, libreDeNubes: true },
    C: { visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }, D: { visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 },
    E_bajo: { visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }, E_alto: { visSM: 5, bajoLaNube: 1000, sobreLaNube: 1000, lateral: 5280 },
    G_bajo_dia: { visSM: 1, libreDeNubes: true }, G_bajo_noche: { visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 },
    G_medio_dia: { visSM: 1, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 }, G_medio_noche: { visSM: 3, bajoLaNube: 500, sobreLaNube: 1000, lateral: 2000 },
    G_alto: { visSM: 5, bajoLaNube: 1000, sobreLaNube: 1000, lateral: 5280 },
  });
  // El avión de cada paso cumple su regla con las nubes del paso (con un margen de 50 ft por las bolas de la nube).
  for (const paso of MIN.PASOS) {
    const R = MIN.MINIMOS_VFR[paso.regla], ruta = M.crearRuta(paso.vuelo.ruta, paso.vuelo.cerrada), nubes = MIN.nubesDe(paso.id);
    for (let s = 0; s <= ruta.largo; s += 0.25) {
      const [x, y, z] = ruta.en(s);
      for (const { caja } of nubes) {
        const lado = Math.max(0, Math.hypot(x - caja.x, z - caja.z) - caja.radio) * 1000;
        const debajo = (caja.base - y) * 1000, encima = (y - caja.techo) * 1000;
        if (R.libreDeNubes) assert.ok(lado > 0 || debajo > 0 || encima > 0, `${paso.id}: dentro de una nube`);
        else assert.ok(lado >= R.lateral - 50 || debajo >= R.bajoLaNube - 50 || encima >= R.sobreLaNube - 50, `${paso.id} en (${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(1)})`);
      }
    }
  }
  // Circuito (AIM 4-3-2/4-3-3, AFH cap. 8).
  assert.deepEqual({ ...CIR.CIRCUITO, pista: { ...CIR.CIRCUITO.pista } }, { alturaAGL: 1000, virajeDentroDe: 300, salidaMasAllaNM: 0.5, finalAntesDeSM: 0.25, entradaGrados: 45, pista: { numero: '36', rumbo: 360, largoFt: 5000 }, lado: 'izquierda' });
  const [, cola] = CIR.TRAMOS.find(([id]) => id === 'cola');
  assert.ok(cola.slice(0, 4).every(p => p[1] * 1000 === CIR.CIRCUITO.alturaAGL), 'viento en cola a 1,000 ft AGL');
  assert.ok(cola.every(p => p[0] < 0), 'circuito a la izquierda de la pista 36: el viento en cola al oeste');
  const [, cruzado] = CIR.TRAMOS.find(([id]) => id === 'cruzado'), [, salida] = CIR.TRAMOS.find(([id]) => id === 'salida');
  const finalPista = CIR.CIRCUITO.pista.largoFt / 2000, ultimoRecto = salida[salida.length - 1];
  assert.ok(ultimoRecto[2] >= finalPista + 0.5 * 6.076 - 0.05, 'derecho 1/2 milla después del final de la pista');
  assert.ok(ultimoRecto[1] * 1000 >= CIR.CIRCUITO.alturaAGL - CIR.CIRCUITO.virajeDentroDe, 'a 300 ft de la altura');
  assert.ok(cruzado.every(p => p[2] > finalPista), 'el viraje a viento cruzado, pasado el final de la pista');
  const [, final] = CIR.TRAMOS.find(([id]) => id === 'final');
  const alineado = final.find(p => Math.abs(p[0]) < 1e-9);
  assert.ok(-finalPista - alineado[2] >= 0.25 * 5.28, 'alineado en final a 1/4 de milla o más');
  // La entrada: a 45° del viento en cola (rumbo 180) y llega a la mitad de la pista.
  const ent = CIR.PASOS.find(p => p.id === 'entrada').vuelo.ruta;
  const rumboEntrada = ((Math.atan2(ent[1][0] - ent[0][0], ent[1][2] - ent[0][2]) * 180) / Math.PI + 360) % 360;
  cerca(Math.abs(rumboEntrada - 180), 45, 0.5, 'entrada a 45°');
  // Frentes (PHAK cap. 12): la presión baja hasta el frente frío y después sube; es pareja en el sector cálido.
  assert.equal(FRE.FRENTES.hemisferio, 'norte');
  const xs = Array.from({ length: 121 }, (_, i) => -45 + i);
  const pmin = xs.reduce((a, x) => (FRE.presionEn(x) < FRE.presionEn(a) ? x : a), xs[0]);
  assert.equal(pmin, FRE.CORTE.frioSuelo, 'la presión toca fondo al pasar el frente frío');
  assert.ok(FRE.presionEn(-30) > FRE.presionEn(-10) && FRE.presionEn(70) > FRE.presionEn(40), 'sube detrás del frío y baja hacia el cálido');
  assert.ok(Math.abs(FRE.presionEn(25) - FRE.presionEn(10)) < Math.abs(FRE.presionEn(60) - FRE.presionEn(45)), 'más pareja en el sector cálido');
  assert.deepEqual(['detras', 'frio', 'sector', 'calido', 'adelante'].map(z => xs.some(x => FRE.zonaEn(x) === z)), [true, true, true, true, true]);
  // Pérdida (PHAK cap. 5; AFH cap. 4): el ángulo crítico y el ejemplo 50/60/70 kt a 0/45/60°.
  assert.deepEqual([...PER.PERDIDA.aoaCritico], [16, 20]);
  assert.ok(PER.PERDIDA.ejemploCritico >= 16 && PER.PERDIDA.ejemploCritico <= 20);
  assert.deepEqual(PER.PERDIDA.viraje.map(v => [v.alabeo, v.carga, v.vs]), [[0, 1, 50], [45, 1.41, 60], [60, 2, 70]]);
  for (const v of PER.PERDIDA.viraje) {
    cerca(v.carga, 1 / Math.cos((v.alabeo * Math.PI) / 180), 0.01, `factor de carga a ${v.alabeo}°`);
    cerca(v.vs, 50 * Math.sqrt(v.carga), 1, `pérdida a ${v.alabeo}°`);
  }
  assert.ok(PER.cl(PER.PERDIDA.ejemploCritico) > PER.cl(10) && PER.cl(PER.PERDIDA.ejemploCritico + 4) < PER.cl(PER.PERDIDA.ejemploCritico), 'la sustentación cae después del crítico');
  // VOR: el radial es desde la estación; con OBS 360, al sur TO y al norte FROM.
  assert.equal(VOR.radialEn(0, -10), 180); assert.equal(VOR.radialEn(10, 0), 90); assert.equal(VOR.radialEn(0, 10), 360);
  const { lecturaVor } = await import('../public/clase/vor.js');
  assert.equal(lecturaVor(360, VOR.radialEn(0, -10)).bandera, 'TO'); assert.equal(lecturaVor(360, VOR.radialEn(0, 10)).bandera, 'FROM');
  assert.ok(lecturaVor(360, VOR.radialEn(1.6, -10)).puntos < 0, 'al este del curso 360 yendo TO: la aguja a la izquierda');
});

test('WebGL: las matrices proyectan igual que el motor 2D, y la textura de nube es suave', async () => {
  const GL = await import('../public/clase/motor3d-gl.js');
  const cam = M.crearCamara({ ojo: [3, 4, -12], mira: [1, 1, 5], fov: 50 });
  const VP = GL.multiplicar(GL.matrizPerspectiva(cam.fov, 640 / 400, 0.1, 500), GL.matrizVista(cam));
  for (const p of [[1, 1, 5], [-4, 2, 10], [6, 0, 30]]) {
    const c = [0, 1, 2, 3].map(r => VP[r] * p[0] + VP[4 + r] * p[1] + VP[8 + r] * p[2] + VP[12 + r]);
    const x = (c[0] / c[3] * 0.5 + 0.5) * 640, y = (0.5 - c[1] / c[3] * 0.5) * 400;
    const q = M.proyectar(cam, p, 640, 400);
    cerca(x, q.x, 1e-6, 'x'); cerca(y, q.y, 1e-6, 'y'); assert.ok(c[2] / c[3] > -1 && c[2] / c[3] < 1);
  }
  const I = GL.multiplicar(VP, GL.invertir(VP));
  I.forEach((v, k) => cerca(v, k % 5 === 0 ? 1 : 0, 1e-9, `identidad ${k}`));
  const t = GL.texturaNube(32);
  assert.equal(t.datos.length, 32 * 32 * 4);
  const alfa = (x, y) => t.datos[(y * 32 + x) * 4 + 3];
  assert.ok(alfa(16, 16) > 200 && alfa(0, 0) === 0, 'opaca en el centro, nada en la esquina');
  // Sin WebGL2 (el lienzo de mentira no lo tiene) no hay motor WebGL: se usa el 2D.
  assert.equal(GL.crearRenderGL(nodo('canvas')), null);
});

test('una escena hecha solo con datos (JSON): se arma, se dibuja en cada paso y usa sus textos y estados', async () => {
  const { escenaDesdeJson, estadoEnTiempo } = await import('../public/clase/e3d-json.js');
  const { EJEMPLO_JSON } = await import('../public/clase/demo-3d.js');
  const e = escenaDesdeJson(JSON.parse(JSON.stringify(EJEMPLO_JSON)));
  assert.deepEqual(e.PASOS.map(p => p.id), ['bien', 'mal', 'perdida']);
  const raiz = nodo('div');
  const api = montarEscena3d(raiz, {}, { escena: e });
  for (let n = 0; n < e.PASOS.length; n++) for (const vista of ['3p', '1p']) {
    llamadas.numeros.length = 0;
    const r = api.fijar({ paso: n, vista, tiempo: 4 });
    assert.ok(r.lista.length > 10 && llamadas.numeros.every(Number.isFinite), `${e.PASOS[n].id}/${vista}`);
    assert.ok(textos(raiz).join(' ').includes(EJEMPLO_JSON.pasos[n].titulo));
  }
  assert.ok(textos(raiz).join(' ').includes(EJEMPLO_JSON.recuerda));
  // El estado del paso pisa el de la ruta: en la pérdida, la nariz sube hasta 18° a los 4 s.
  const k = estadoEnTiempo(EJEMPLO_JSON.pasos[2].estados, 4);
  assert.equal(k.cabeceo, 18);
  cerca(estadoEnTiempo(EJEMPLO_JSON.pasos[2].estados, 5).cabeceo, 3, 0.01, 'a mitad de camino (suave)');
  assert.equal(api.estado.total, 3);
  api.destruir();
});
