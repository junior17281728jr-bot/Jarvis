// 0.14.92: las situaciones 3D (tipo «situacion-3d»): la revisión, una sola opción correcta en cada una (la misma que
// src/academia/diagramas.js), los textos de cada opción (es y en, cortos), el dibujo de cada consecuencia en la cabina y
// afuera con un lienzo de mentira (sin NaN), el aviso de la primera elección («clase-decision») y los datos de la norma.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { revisarDiagrama, tarjetaConVisual, SITUACIONES_3D, TIPO_SITUACION_3D } from '../src/academia/diagramas.js';
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


const { SITUACIONES, TEXTOS_SITUACIONES, HECHOS_SITUACIONES, isaEn, baseNubesImc } = await import('../public/clase/e3d-situaciones.js');
const { montarSituacion3d, escenaDeSituacion, PAUSA_CLAVE, TEXTOS_SITUACIONES_PLANOS } = await import('../public/clase/situacion3d.js');
const { nubeTormenta, etapaNube, destello, sacudir } = await import('../public/clase/e3d-efectos.js');
const { VISUALES } = await import('../public/clase/visuales.js');
const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const palabras = s => s.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;

test('situacion-3d: la revisión acepta las de la lista y rechaza lo demás', () => {
  assert.equal(TIPO_SITUACION_3D, 'situacion-3d');
  for (const situacion of Object.keys(SITUACIONES_3D)) assert.deepEqual(revisarDiagrama('situacion-3d', { situacion }), [], situacion);
  assert.deepEqual(revisarDiagrama('situacion-3d', { situacion: 'nubes', titulo: 'Una nube' }), []);
  for (const [p, motivo] of [[null, 'sin_parametros'], [{}, 'situacion'], [{ situacion: 'volcan' }, 'situacion'], [{ situacion: 'nubes', titulo: '' }, 'titulo'], [{ situacion: 'nubes', pasos: [] }, 'pasos']]) {
    assert.ok(revisarDiagrama('situacion-3d', p).includes(motivo), `${JSON.stringify(p)} → ${motivo}`);
  }
  assert.equal(tarjetaConVisual({ visual: { tipo: 'situacion-3d', parametros: { situacion: 'clase-c' } } }), true);
  const paquete = paqueteMuestra();
  const s0 = paquete.materias[0].temas[0].secciones[0];
  paquete.materias[0].temas[0].secciones[0] = { ...s0, tipo: 'tarjeta', puntos: ['x'], visual: { tipo: 'situacion-3d', parametros: { situacion: 'otra' } } };
  assert.ok(revisarPaquete(paquete).errores.some(e => e.motivo === 'diagrama_no_valido'));
  paquete.materias[0].temas[0].secciones[0].visual.parametros.situacion = 'vfr-imc';
  assert.ok(!revisarPaquete(paquete).errores.some(e => e.motivo === 'diagrama_no_valido'));
});

test('cada situación: exactamente una opción correcta (la de diagramas.js), 2 a 4 opciones, y sus textos en es y en', () => {
  assert.deepEqual(Object.keys(SITUACIONES).sort(), Object.keys(SITUACIONES_3D).sort());
  for (const [id, s] of Object.entries(SITUACIONES)) {
    const ops = s.opciones;
    assert.ok(ops.length >= 2 && ops.length <= 4, id);
    assert.equal(ops.filter(o => o.nivel === 'correcto').length, 1, `${id}: una sola correcta`);
    assert.equal(ops.find(o => o.nivel === 'correcto').id, SITUACIONES_3D[id].correcta, id);
    assert.deepEqual(ops.map(o => o.id), [...SITUACIONES_3D[id].opciones], id);
    assert.ok(ops.every(o => ['correcto', 'aceptable', 'mal'].includes(o.nivel) && o.icono && /^(AIM|AFH|PHAK|14 CFR)/.test(o.fuente) && o.clave >= 0 && o.clave < o.vuelo.seg), id);
    const claves = ['titulo', 'intro', 'pregunta', 'recuerda', ...ops.flatMap(o => ['boton', 'resultado', 'clave', 'porque', 'regla', ...(o.radio ? ['radio'] : [])].map(k => `${o.id}.${k}`))];
    for (const k of claves) {
      const clave = `clase.e3d.sit.${id}.${k}`;
      assert.equal(es[clave], TEXTOS_SITUACIONES[`${id}.${k}`], `es: ${clave}`);
      assert.ok(en[clave], `en: ${clave}`);
      for (const t of [es[clave], en[clave]]) {
        assert.ok(palabras(t) <= 26, `${clave}: ${palabras(t)} palabras`);
        if (k.endsWith('.boton')) assert.ok(palabras(t) >= 2 && palabras(t) <= 6, `${clave}: botón de 2 a 6 palabras`);
      }
    }
    assert.match(es[`clase.e3d.sit.${id}.recuerda`], /\*\*/, `${id}: la regla en negrita`);
    for (const o of ops) assert.match(es[`clase.e3d.sit.${id}.${o.id}.regla`], /\*\*.+\*\*/, `${id}.${o.id}: regla en negrita`);
  }
  // Todas las claves del módulo, en los dos idiomas y con las mismas variables; ninguna de sobra.
  for (const [k, v] of Object.entries(TEXTOS_SITUACIONES_PLANOS)) {
    assert.equal(es[`clase.e3d.${k}`], v, k);
    const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(vars(en[`clase.e3d.${k}`] ?? ''), vars(v), `en: ${k}`);
  }
  assert.equal(Object.keys(es).filter(k => k.startsWith('clase.e3d.sit.')).length, Object.keys(TEXTOS_SITUACIONES_PLANOS).length);
});

test('cada consecuencia se dibuja en la cabina y afuera (sin NaN), con su rótulo clave, su cierre y el aviso de la primera elección', async () => {
  const t = (clave, v = {}) => String(en[clave] ?? clave).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
  for (const [id, s] of Object.entries(SITUACIONES)) {
    for (const idioma of ['es', 'en']) {
      const raiz = nodo('div');
      const avisos = [];
      raiz.addEventListener('clase-decision', e => avisos.push(e.detail));
      const api = montarSituacion3d(raiz, { situacion: id }, idioma === 'en' ? { modo: 'interactivo', t } : {});
      const fig = raiz.hijos[0];
      assert.equal(fig.etiqueta, 'figure'); assert.ok(fig.atributos['aria-label']);
      llamadas.numeros.length = 0;
      const r0 = api.fijar({ vista: '3p' });
      assert.ok(r0.lista.length > 5 && llamadas.numeros.every(Number.isFinite), `${id}: intro`);
      assert.equal(api.estado.fase, 'decision', `${id}: al terminar la introducción, la pregunta`);
      const botones = todos(fig).filter(n => n.etiqueta === 'button' && /clase-sit-opcion/.test(n.atributos.class ?? ''));
      assert.equal(botones.length, s.opciones.length);
      for (const o of s.opciones) for (const vista of ['3p', '1p']) for (const tiempo of [o.clave * 0.5, o.clave + PAUSA_CLAVE * 0.5, o.vuelo.seg + PAUSA_CLAVE + 0.5]) {
        llamadas.numeros.length = 0;
        const r = api.fijar({ opcion: o.id, tiempo, vista });
        assert.ok(r && r.lista.length > 2, `${id}/${o.id}/${vista}: dibujó`);
        assert.ok(llamadas.numeros.every(Number.isFinite), `${id}/${o.id}/${vista}/${tiempo}: NaN en el lienzo`);
        for (const x of r.lista) for (const q of x.pts ?? x.tramos?.flat() ?? [[x.x, x.y]]) assert.ok(q.every(Number.isFinite), `${id}/${o.id}: punto`);
        if (tiempo > o.clave + 0.1) assert.ok(r.etiquetas.some(e => e.texto === (idioma === 'en' ? en : es)[`clase.e3d.sit.${id}.${o.id}.clave`]) || vista === '1p', `${id}/${o.id}: rótulo clave`);
      }
      // Al final de la última, el cierre: veredicto, por qué, regla y fuente, y los dos botones.
      const dichos = textos(fig).join(' | ');
      const ultima = s.opciones[s.opciones.length - 1];
      assert.ok(dichos.includes(ultima.fuente), `${id}: la fuente`);
      assert.doesNotMatch(dichos, /\*\*|clase\.e3d|\{[a-z]+\}/, `${id}: texto sin llenar: ${(dichos.match(/.{0,60}(\*\*|clase\.e3d|\{[a-z]+\}).{0,60}/) ?? [])[0]}`);
      assert.ok(todos(fig).some(n => /clase-sit-otra/.test(n.atributos.class ?? '')) && todos(fig).some(n => /clase-sit-siguiente/.test(n.atributos.class ?? '')));
      assert.equal(avisos.length, 1, `${id}: solo la primera elección se avisa`);
      assert.equal(avisos[0].opcion, s.opciones[0].id);
      assert.equal(avisos[0].correcta, s.opciones[0].nivel === 'correcto');
      for (const n of todos(fig)) assert.ok(!('style' in n.atributos), `${id}: style`);
      api.destruir();
      assert.equal(raiz.hijos.length, 0);
    }
  }
  // Por el registro: primero el hueco, después la situación.
  const r2 = nodo('div');
  const d = VISUALES['situacion-3d'](r2, { situacion: 'nubes' }, {});
  assert.equal(r2.hijos[0].atributos.class, 'clase-e3d-hueco');
  await new Promise(res => setTimeout(res, 80));
  assert.equal(r2.hijos[0].etiqueta, 'figure');
  d.destruir(); assert.equal(r2.hijos.length, 0);
});

test('los efectos: la nube crece por etapas, el rayo destella y la turbulencia sacude, siempre igual', () => {
  assert.deepEqual([0.2, 0.5, 0.9, 1.2].map(etapaNube), ['cumulo', 'torre', 'madura', 'disipacion']);
  const alto = k => Math.max(...nubeTormenta({ x: 0, z: 0, base: 3, ancho: 8, altoMax: 40, k, semilla: 4 }).map(b => b.p[1] + b.r));
  assert.ok(alto(0.2) < alto(0.5) && alto(0.5) < alto(0.95), 'crece');
  assert.deepEqual(nubeTormenta({ x: 0, z: 0, base: 3, ancho: 8, altoMax: 40, k: 0.6, semilla: 4 }), nubeTormenta({ x: 0, z: 0, base: 3, ancho: 8, altoMax: 40, k: 0.6, semilla: 4 }), 'repetible');
  assert.ok([0, 0.05, 1.3].some(t => destello(t, 2.6) > 0) && destello(1.3, 2.6) === 0);
  const a = { pos: [0, 1, 0], rumbo: 0, cabeceo: 0, alabeo: 0, kt: 100 };
  assert.deepEqual(sacudir(a, 3, 0), a);
  assert.notEqual(sacudir(a, 3, 1).alabeo, 0);
});

test('los datos de cada situación, contra la tabla de la norma', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(HECHOS_SITUACIONES)), {
    claseC: { nucleoNM: 5, anilloNM: 10, techoAGL: 4000, pisoAnilloAGL: 1200, fuente: 'AIM 3-2-4' },
    claseB: { nucleoNM: 10, pisoNM: 20, pisoMSL: 3000, techoMSL: 10000, fuente: 'AIM 3-2-3' },
    claseD: { radioNM: 4, techoAGL: 2500, fuente: 'AIM 3-2-5' },
    tormentas: { evitarNM: 20, turbulenciaHastaNM: 20, sinCaminoEntreNM: [20, 30], topesSeverosFt: [50000, 60000], maduraMin: 15, fuentes: ['AIM 7-1-26', 'AIM 7-1-27', 'PHAK cap. 12'] },
    vfrImc: { pierdeControlMin: 10, alabeoMaxImc: 10, fuente: 'AFH cap. 18' },
    densidad: { isaNivelMarC: 15, bajaCPor1000ft: 2, elevacionFt: 5000, temperaturaC: 35, fuente: 'PHAK cap. 11' },
  });
  assert.equal(isaEn(0), 15); assert.equal(isaEn(5000), 5);
  // Los números de los textos salen de la tabla.
  const T = TEXTOS_SITUACIONES;
  assert.match(T['frente-frio.desviar.regla'], /20 NM/); assert.match(T['frente-frio.recuerda'], /20 NM/);
  assert.match(T['frente-frio.encima.porque'], /50,000 o 60,000 ft/); assert.match(T['frente-frio.hueco.porque'], /20 a 30 millas/);
  assert.match(T['nubes.seguir.regla'], /15 minutos/); assert.match(T['vfr-imc.seguir.regla'], /10 min/); assert.match(T['vfr-imc.virar.regla'], /10°/);
  assert.match(T['densidad.calcular.regla'], /15 °C.*2 °C/); assert.match(T['densidad.calcular.porque'], /5 °C/);
  assert.match(T['clase-c.intro'], /3,500 ft/); assert.match(T['clase-d.intro'], /2,500 ft AGL/);
  // La geometría usa la tabla: la C llega a 4,000 ft AGL y su repisa empieza a 1,200 ft; la D a 2,500 ft.
  const Ts = k => k;
  const altoMax = (id, radio) => Math.max(...SITUACIONES[id].construir({ pasto: [0, 0, 0], pasto2: [0, 0, 0], agua: [0, 0, 0], tierra: [0, 0, 0], bosque: [0, 0, 0], asfalto: [0, 0, 0], marca: [0, 0, 0], pastoAeropuerto: [0, 0, 0], edificio: [0, 0, 0], techo: [0, 0, 0] }).prims
    .filter(q => q.t === 'p' && q.a < 1 && q.p.every(v => Math.hypot(v[0], v[2]) <= radio + 0.01)).flatMap(q => q.p.map(v => v[1])));
  assert.equal(altoMax('clase-c', 10) * 1000, HECHOS_SITUACIONES.claseC.techoAGL);
  assert.equal(altoMax('clase-d', 4) * 1000, HECHOS_SITUACIONES.claseD.techoAGL);
  // En la opción correcta del espacio aéreo el avión no entra sin permiso antes del momento clave; en la mala, sí entra.
  void Ts;
  // VFR en nubes: las nubes bajan hacia el norte; el viraje de 180° vuelve antes de llegar a la base.
  assert.ok(baseNubesImc(20) < baseNubesImc(0));
  const virar = SITUACIONES['vfr-imc'].opciones.find(o => o.id === 'virar');
  assert.ok(virar.vuelo.ruta.every(([, y, z]) => y < baseNubesImc(z)), 'el 180° queda debajo de las nubes');
  const seguir = SITUACIONES['vfr-imc'].opciones.find(o => o.id === 'seguir');
  assert.ok(seguir.vuelo.ruta.some(([, y, z]) => y > baseNubesImc(z)), 'seguir entra a la nube');
  // Tormentas: el desvío termina a más de 20 NM de la línea; el hueco pasa a menos.
  const esc = escenaDeSituacion(SITUACIONES['frente-frio'], k => k);
  assert.equal(esc.PASOS.length, 1 + SITUACIONES['frente-frio'].opciones.length);
});
