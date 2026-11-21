// Academia 0.14.95: la CONSECUENCIA de una pregunta en 3D (situacion3d.js con opciones.consecuencia) y su MINI-MAPA
// (e3d-minimapa.js): sin introducción ni decisión, en la consecuencia de la opción elegida; contexto de una línea; al
// final «Por qué», la regla, «Ver la correcta» (si no lo era) y «Cerrar»; no avisa «clase-decision»; el mini-mapa con la
// ruta, el avión que se mueve con la escena, las zonas, la decisión y la escala; todo sin NaN y sin estilos escritos.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
    dispatchEvent(e) { for (let x = this; x; x = x.padre) for (const f of x.eventos[e.type] ?? []) f(e); return true; },
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


const { SITUACIONES } = await import('../public/clase/e3d-situaciones.js');
const { montarSituacion3d, PAUSA_CLAVE } = await import('../public/clase/situacion3d.js');
const { montarMinimapa, proyeccionMapa, escalaMapa, limitesMapa } = await import('../public/clase/e3d-minimapa.js');
const { MAPAS_SITUACIONES } = await import('../public/clase/e3d-situaciones.js');
const clases = n => n.atributos.class ?? '';
const conClase = (n, c) => todos(n).filter(x => clases(x).split(/\s+/).includes(c));
const T = (k, v = {}) => `${k}${Object.values(v).join(',')}`;

test('consecuencia directa: abre en la opción elegida, sin decisión ni aviso; al final «Ver la correcta» y «Cerrar»', () => {
  for (const [id, s] of Object.entries(SITUACIONES)) {
    for (const o of s.opciones) {
      const raiz = nodo('div');
      const avisos = [];
      raiz.addEventListener('clase-decision', e => avisos.push(e.detail));
      let cerrado = 0;
      const api = montarSituacion3d(raiz, { situacion: id }, { consecuencia: { opcion: o.id, alCerrar: () => { cerrado += 1; } } });
      const fig = raiz.hijos[0];
      assert.match(clases(fig), /clase-sit-directa/);
      assert.equal(api.estado.fase, 'resultado', `${id}/${o.id}: directo en la consecuencia`);
      assert.equal(api.estado.opcion, o.id);
      assert.ok(conClase(fig, 'clase-sit-opciones').every(n => n.hidden), 'sin la decisión');
      assert.ok(textos(conClase(fig, 'clase-sit-contexto')[0]).join(' ').length > 10, 'la línea de contexto');
      assert.ok(api.mapa, `${id}: con mini-mapa`);
      // Al terminar: el cierre (por qué, regla, fuente) y sus botones.
      llamadas.numeros.length = 0;
      api.fijar({ opcion: o.id, tiempo: o.vuelo.seg + PAUSA_CLAVE + 0.5, vista: '1p' });
      assert.ok(llamadas.numeros.every(Number.isFinite), `${id}/${o.id}: NaN`);
      assert.equal(api.estado.fase, 'cierre');
      const dichos = textos(fig).join(' | ');
      assert.ok(dichos.includes(o.fuente), `${id}/${o.id}: la fuente`);
      assert.doesNotMatch(dichos, /\*\*|clase\.e3d|\{[a-z]+\}/);
      const verCorrecta = conClase(fig, 'clase-sit-ver-correcta');
      assert.equal(verCorrecta.length, o.nivel === 'correcto' ? 0 : 1, `${id}/${o.id}: «Ver la correcta» solo si no lo era`);
      assert.equal(conClase(fig, 'clase-sit-otra').length + conClase(fig, 'clase-sit-siguiente').length, 0, 'sin «Intentar otra» ni «Siguiente»');
      if (verCorrecta.length) {
        for (const f of verCorrecta[0].eventos.click) f();
        assert.equal(api.estado.opcion, s.opciones.find(x => x.nivel === 'correcto').id, 'juega la correcta');
      }
      const c = conClase(fig, 'clase-sit-cerrar');
      if (c.length) for (const f of c.at(-1).eventos.click) f();
      assert.equal(avisos.length, 0, 'no avisa «clase-decision»: la pregunta ya se respondió');
      for (const n of todos(fig)) assert.ok(!('style' in n.atributos), `${id}: style`);
      api.destruir();
      if (o.nivel === 'correcto') assert.equal(cerrado, 1);
    }
  }
  // Una opción que no existe: la situación de siempre (con su decisión).
  const raiz = nodo('div');
  const api = montarSituacion3d(raiz, { situacion: 'clase-c' }, { consecuencia: { opcion: 'volar' } });
  assert.equal(api.estado.fase, 'intro');
  assert.equal(api.mapa, null);
  api.destruir();
});

test('el mini-mapa: la ruta, el avión que avanza con la escena, las zonas de cada situación, la decisión y la escala', () => {
  for (const [id, s] of Object.entries(SITUACIONES)) {
    const raiz = nodo('div');
    const m = montarMinimapa(raiz, s, { T });
    const svgs = todos(m.nodo);
    const todosNumeros = svgs.flatMap(n => Object.entries(n.atributos).filter(([k]) => ['x', 'y', 'cx', 'cy', 'r', 'width', 'height', 'x1', 'y1', 'x2', 'y2'].includes(k)).map(([, v]) => Number(v)));
    assert.ok(todosNumeros.length > 5 && todosNumeros.every(Number.isFinite), `${id}: sin NaN`);
    // Todo dentro del cuadro de 200.
    const L = limitesMapa(s), P = proyeccionMapa(s);
    for (const [x, z] of [[L.x0, L.z0], [L.x1, L.z1]]) for (const v of P.a(x, z)) assert.ok(v >= 0 && v <= 200, `${id}: dentro del mapa`);
    const zonas = MAPAS_SITUACIONES[id];
    assert.ok(zonas.length >= 1, id);
    const de = c => svgs.filter(n => clases(n).split(/\s+/).includes(c)).length;
    assert.equal(de('clase-sit-mapa-pared'), zonas.filter(z => z.tipo === 'pared').length, `${id}: paredes`);
    assert.equal(de('clase-sit-mapa-anillo'), zonas.filter(z => z.tipo === 'celda').length, `${id}: un anillo de 20 NM por tormenta`);
    assert.equal(de('clase-sit-mapa-pista'), zonas.filter(z => z.tipo === 'aeropuerto').length, `${id}: pista`);
    assert.equal(de('clase-sit-mapa-decision'), 1, `${id}: la decisión`);
    assert.ok(de('clase-sit-mapa-escala') === 1 && svgs.some(n => /mapa\.(nm|ft)/.test(n.textContent)), `${id}: la escala`);
    // La ruta de cada opción y el avión que se mueve.
    for (const o of s.opciones) {
      m.poner(o.id);
      const ruta = svgs.find(n => clases(n).startsWith('clase-sit-mapa-ruta'));
      assert.match(ruta.atributos.d, /^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+){10,}$/, `${id}/${o.id}: la ruta`);
      assert.match(clases(ruta), new RegExp(`clase-sit-mapa-${o.nivel}`));
      const [x0, , z0] = o.vuelo.ruta[0], [x1, , z1] = o.vuelo.ruta.at(-1);
      m.mover(x0, z0, 10); const a = m.posicion;
      m.mover(x1, z1, 10); const b = m.posicion;
      assert.notEqual(a, b, `${id}/${o.id}: el avión avanza`);
      assert.match(b, /^translate\([\d.-]+ [\d.-]+\) rotate\(10\)$/);
    }
    m.mover(NaN, 0); assert.ok(!/NaN/.test(m.posicion));
    // Tocar agranda (y otra vez achica).
    assert.equal(m.nodo.atributos['aria-pressed'], 'false');
    for (const f of m.nodo.eventos.click) f();
    assert.equal(m.nodo.atributos['aria-pressed'], 'true');
    assert.ok(m.grande);
    for (const f of m.nodo.eventos.click) f();
    assert.equal(m.nodo.atributos['aria-pressed'], 'false');
    for (const n of svgs) assert.ok(!('style' in n.atributos), `${id}: style`);
  }
  // La escala: NM en el espacio aéreo y las tormentas; ft (o NM chicas) en el despegue.
  assert.equal(escalaMapa(SITUACIONES['clase-b']).unidad, 'nm');
  assert.equal(escalaMapa(SITUACIONES['frente-frio']).unidad, 'nm');
  assert.ok(['ft', 'nm'].includes(escalaMapa(SITUACIONES.densidad).unidad));
  for (const s of Object.values(SITUACIONES)) { const e = escalaMapa(s); assert.ok(e.largo > 8 && e.largo < 120, `${s.id}: escala de ${e.largo}`); }
  // En la escena: el avión del mapa se mueve con el cuadro (el mismo reloj que el 3D).
  const raiz = nodo('div');
  const api = montarSituacion3d(raiz, { situacion: 'clase-c' }, { consecuencia: { opcion: 'entrar' } });
  api.fijar({ opcion: 'entrar', tiempo: 1, vista: '3p' }); const p1 = api.mapa.posicion;
  api.fijar({ opcion: 'entrar', tiempo: 10, vista: '1p' }); const p2 = api.mapa.posicion;
  assert.ok(p1 && p2 && p1 !== p2, 'avanza con la escena, también en la cabina');
  api.destruir();
});
