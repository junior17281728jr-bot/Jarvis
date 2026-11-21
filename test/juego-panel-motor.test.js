// 0.14.105 (pedido del dueño: «no me deja mover la mezcla… que ya todo se encienda… lo más resumido»; «no me deja
// apagar y encender el motor cuando yo quiera»): el cajón del motor con un DOM de mentira. La palanca de la mezcla se
// arrastra con el dedo (touch), con el ratón y con el teclado; la perilla de los magnetos (toque, mantener = START);
// MASTER y combustible; apagar y volver a encender en tierra y en vuelo (con el molinete); «Encender todo»; las luces
// (con el MASTER, sus colores y lugares, de noche y en la repetición); y la prueba de motor (run-up) con el PHAK cap. 7.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearPanelMotor, crearPalanca, crearPerilla } from '../public/clase/juego-panel-motor.js';
import { MOTOR_FAA, crearMotor, encenderTodo, mezclaAuto, lucesActivas, LUCES, LUCES_PROPIAS, medirRunup, listaRunup, PASOS_RUNUP, densidad, LAMBDA, combustion } from '../public/clase/motor-piston.js';
import { crearAvion, pasoVuelo, VUELO } from '../public/clase/vuelo-modelo.js';
import { primitivasAvion } from '../public/clase/motor3d.js';
import { avionPropio, luzAterrizaje } from '../public/clase/juego-mundo.js';
import { crearRepeticion, primitivasRepeticion, CAMARAS, tomaEn } from '../public/clase/juego-repeticion.js';
import { MINICLASES } from '../public/clase/juego-miniclases.js';

const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
let phak7 = null, afh = null, aim = null;
try {
  const f = n => readFileSync(new URL(`../../verif-libros/datos/fuentes/faa/${n}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  phak7 = f('libro-faa-phak-cap09.txt'); afh = f('libro-faa-afh-cap01.txt'); aim = f('libro-faa-aim-cap01.txt');
} catch { /* sin los libros (en otra copia) */ }

// ---------- un DOM de mentira ----------
class Nodo {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.hidden = false; this._texto = ''; this.vars = {}; this.capturado = null; this.style = { setProperty: (k, v) => { this.vars[k] = v; } }; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  get textContent() { return this._texto || this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._texto = String(v); this.children = []; }
  append(...c) { this.children.push(...c); }
  addEventListener(tipo, f) { (this.listeners[tipo] ??= []).push(f); }
  setPointerCapture(id) { this.capturado = id; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 10 }; }
  enviar(tipo, ev = {}) { const e = { type: tipo, preventDefault() { this.prevenido = true; }, stopPropagation() {}, cancelable: true, ...ev }; for (const f of this.listeners[tipo] ?? []) f(e); return e; }
  buscar(pred) { if (pred(this)) return this; for (const c of this.children) { if (c instanceof Nodo) { const r = c.buscar(pred); if (r) return r; } } return null; }
}
function el(tag, attrs = {}, ...hijos) {
  const n = new Nodo(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'onclick') n.addEventListener('click', v);
    else if (k === 'texto') n._texto = v;
    else if (k === 'hidden') n.hidden = Boolean(v);
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat(3)) if (h != null && h !== false) n.children.push(typeof h === 'string' ? Object.assign(new Nodo('#text'), { _texto: h }) : h);
  return n;
}
const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
function reloj() {
  let ahora = 0, sig = 1; const tareas = new Map();
  return {
    setTimeout(f, ms) { const id = sig++; tareas.set(id, { f, en: ahora + ms }); return id; },
    clearTimeout(id) { tareas.delete(id); },
    avanzar(ms) { ahora += ms; for (const [id, x] of [...tareas]) if (x.en <= ahora) { tareas.delete(id); x.f(); } },
  };
}
// Un arrastre con puntero (dedo o ratón): abajo en x0, mueve a x1, suelta.
function arrastrar(nodo, x0, x1, tipo) {
  nodo.enviar('pointerdown', { pointerId: 7, pointerType: tipo, clientX: x0 });
  for (let i = 1; i <= 5; i++) nodo.enviar('pointermove', { pointerId: 7, pointerType: tipo, clientX: x0 + ((x1 - x0) * i) / 5 });
  nodo.enviar('pointerup', { pointerId: 7, pointerType: tipo, clientX: x1 });
}

test('la palanca de la mezcla: se arrastra con el dedo y con el ratón (con captura), se toca en el riel y anda con el teclado', () => {
  for (const tipo of ['touch', 'mouse', 'pen']) {
    const valores = [];
    const p = crearPalanca({ el, etiqueta: 'Mezcla', valor: 1, alCambiar: v => valores.push(v) });
    arrastrar(p.nodo, 95, 40, tipo);
    assert.equal(p.nodo.capturado, 7, `${tipo}: captura el puntero (la escena de atrás no se lo lleva)`);
    assert.ok(Math.abs(p.valor - 0.4) < 1e-9, `${tipo}: ${p.valor}`);
    assert.ok(valores.length >= 5 && valores.at(-1) === p.valor);
    assert.equal(p.nodo.getAttribute('aria-valuenow'), '40');
    assert.equal(p.nodo.vars['--v'], '0.400');
    // Un movimiento de otro dedo no la mueve; soltar termina el arrastre.
    p.nodo.enviar('pointermove', { pointerId: 9, clientX: 10 });
    assert.ok(Math.abs(p.valor - 0.4) < 1e-9);
  }
  // El «touchmove» se frena aquí (no llega a la escena) y se cancela el desplazamiento de la página.
  const p = crearPalanca({ el, etiqueta: 'Mezcla', valor: 0.5, alCambiar: () => {} });
  const ev = p.nodo.enviar('touchmove');
  assert.equal(ev.prevenido, true);
  // El teclado: ←/→, Inicio, Fin.
  p.nodo.enviar('keydown', { key: 'ArrowLeft' }); assert.ok(Math.abs(p.valor - 0.48) < 1e-9);
  p.nodo.enviar('keydown', { key: 'Home' }); assert.equal(p.valor, 0); assert.equal(p.nodo.getAttribute('aria-valuetext'), 'CUTOFF');
  p.nodo.enviar('keydown', { key: 'End' }); assert.equal(p.valor, 1);
  assert.equal(p.nodo.getAttribute('role'), 'slider'); assert.equal(p.nodo.getAttribute('tabindex'), '0');
  // Mientras se arrastra, el avión no la pisa (fijar espera a que se suelte).
  p.nodo.enviar('pointerdown', { pointerId: 3, clientX: 20 }); p.fijar(0.9); assert.ok(Math.abs(p.valor - 0.2) < 1e-9);
  p.nodo.enviar('pointerup', { pointerId: 3 }); p.fijar(0.9); assert.equal(p.valor, 0.9);
});

test('la perilla de los magnetos: un toque pasa a la siguiente, mantener da START y al soltar vuelve a BOTH; con el teclado también', () => {
  const r = reloj(), pos = [];
  const k = crearPerilla({ el, etiqueta: 'Magnetos', posicion: 'OFF', alCambiar: p => pos.push(p), temporizador: r });
  for (const tipo of ['touch', 'mouse']) {
    if (k.posicion !== 'OFF') { while (k.posicion !== 'OFF') { k.nodo.enviar('pointerdown', { pointerId: 1, pointerType: tipo }); k.nodo.enviar('pointerup', { pointerId: 1 }); k.nodo.enviar('click', { detail: 1 }); } }
    for (const esperado of ['R', 'L', 'BOTH']) { k.nodo.enviar('pointerdown', { pointerId: 1, pointerType: tipo }); r.avanzar(100); k.nodo.enviar('pointerup', { pointerId: 1 }); k.nodo.enviar('click', { detail: 1 }); assert.equal(k.posicion, esperado, tipo); }
    k.nodo.enviar('pointerdown', { pointerId: 1, pointerType: tipo }); r.avanzar(600);
    assert.equal(k.posicion, 'START', `${tipo}: mantener = START`);
    k.nodo.enviar('pointerup', { pointerId: 1 }); k.nodo.enviar('click', { detail: 1 });
    assert.equal(k.posicion, 'BOTH', `${tipo}: al soltar, BOTH`);
  }
  k.nodo.enviar('keydown', { key: 'ArrowLeft' }); assert.equal(k.posicion, 'L');
  k.nodo.enviar('keydown', { key: 'ArrowRight' }); assert.equal(k.posicion, 'BOTH');
  k.nodo.enviar('keydown', { key: 's' }); assert.equal(k.posicion, 'START'); r.avanzar(2600); assert.equal(k.posicion, 'BOTH');
  assert.ok(pos.includes('START') && pos.at(-1) === 'BOTH');
});

// El cajón con un avión de verdad (el modelo de vuelo): lo que tocan los dedos cambia el motor.
function cajonConAvion(inicio) {
  const r = reloj();
  const s = { avion: inicio, potencia: inicio.potencia ?? 0 };
  const poner = c => { s.avion = { ...s.avion, pist: { ...s.avion.pist, ...c } }; };
  const cajon = crearPanelMotor({
    el, t, temporizador: r,
    estado: () => ({ pist: s.avion.pist, enSuelo: s.avion.enSuelo, rpm: s.avion.rpm, aceitePsi: s.avion.aceitePsi, combustible: s.avion.combustible, guiado: false }),
    acciones: {
      poner,
      encender: () => { const { encenderMotor } = MOD; poner(encenderMotor(s.avion.pist, { enSuelo: s.avion.enSuelo })); if (s.avion.enSuelo) s.potencia = 0.15; },
      apagar: () => { const { apagarMotor } = MOD; if (s.avion.enSuelo) s.potencia = 0; poner(apagarMotor(s.avion.pist, { enSuelo: s.avion.enSuelo })); },
      todo: () => { s.avion = { ...s.avion, pist: encenderTodo(s.avion.pist, s.avion.ft), aceitePsi: VUELO.aceitePsiNormal }; },
      guiado: () => {}, manual: () => {}, cerrar: () => {},
    },
  });
  const volar = seg => { for (let i = 0; i < seg * 60; i++) { s.avion = pasoVuelo(s.avion, { potencia: s.potencia }, 1 / 60, { asistente: true }); r.avanzar(1000 / 60); } cajon.pintar(); };
  return { s, cajon, volar, r };
}
const MOD = await import('../public/clase/motor-piston.js');
const tocar = n => { n.enviar('pointerdown', { pointerId: 2, pointerType: 'touch' }); n.enviar('pointerup', { pointerId: 2, pointerType: 'touch' }); n.enviar('click', { detail: 1 }); };

test('MASTER y combustible con el dedo; la mezcla arrastrada cambia la EGT (antes y después)', () => {
  const { s, cajon, volar } = cajonConAvion({ ...crearAvion({ ft: 7500, kt: 100, potencia: 0.7, enSuelo: false }), pist: crearMotor({ mezcla: 1 }) });
  s.potencia = 0.7;
  volar(3);
  const egtRica = s.avion.pist.egt;
  arrastrar(cajon.palanca.nodo, 100, 64, 'touch');
  volar(3);
  assert.ok(Math.abs(s.avion.pist.mezcla - 0.64) < 0.011);
  assert.ok(s.avion.pist.egt > egtRica + 100, `EGT ${egtRica.toFixed(0)} → ${s.avion.pist.egt.toFixed(0)}`);
  const b = cajon.botones;
  tocar(b.bFuel); assert.equal(s.avion.pist.selector, 'OFF');
  tocar(b.bFuel); assert.equal(s.avion.pist.selector, 'BOTH');
  tocar(b.bMaster); assert.equal(s.avion.pist.master, false);
  cajon.pintar(); assert.equal(b.bMaster.getAttribute('aria-pressed'), 'false');
  tocar(b.bMaster); assert.equal(s.avion.pist.master, true);
});

test('apagar y volver a encender cuando se quiera: en vuelo (la hélice en molinete) y en tierra (el arranque), con el dedo', () => {
  // En vuelo.
  const v = cajonConAvion({ ...crearAvion({ ft: 3000, kt: 100, potencia: 0.65, enSuelo: false }), pist: crearMotor() });
  v.s.potencia = 0.65; v.volar(2); v.cajon.pintar();
  assert.equal(v.cajon.botones.bOnOff.textContent, 'juego.motor.apagar');
  tocar(v.cajon.botones.bOnOff); v.volar(3);
  assert.equal(v.s.avion.pist.enMarcha, false, 'se paró');
  assert.ok(v.s.avion.rpm > 300, 'la hélice sigue en molinete');
  assert.equal(v.cajon.botones.bOnOff.textContent, 'juego.motor.encender');
  tocar(v.cajon.botones.bOnOff); v.volar(3);
  assert.equal(v.s.avion.pist.enMarcha, true, 'arrancó con el molinete');
  assert.equal(v.s.avion.pist.magnetos, 'BOTH'); assert.ok(v.s.avion.pist.mezcla >= 0.95);
  // En tierra.
  const g = cajonConAvion({ ...crearAvion({ potencia: 0 }), pist: crearMotor() });
  g.volar(2);
  tocar(g.cajon.botones.bOnOff); g.volar(3);
  assert.equal(g.s.avion.pist.enMarcha, false); assert.equal(g.s.avion.pist.master, false, 'en tierra también el MASTER');
  assert.ok(g.s.avion.rpm < 50);
  tocar(g.cajon.botones.bOnOff); g.volar(1);
  assert.equal(g.s.avion.pist.magnetos, 'START', 'el arranque gira');
  g.volar(3);
  assert.equal(g.s.avion.pist.enMarcha, true); assert.equal(g.s.avion.pist.magnetos, 'BOTH', 'vuelve solo a BOTH');
  // A mano: la perilla en OFF lo para y en BOTH con molinete (en vuelo) vuelve.
  for (const p of ['L', 'R', 'OFF']) v.cajon.perilla.nodo.enviar('keydown', { key: 'ArrowLeft' });
  v.volar(1); assert.equal(v.s.avion.pist.enMarcha, false);
  for (let i = 0; i < 3; i++) v.cajon.perilla.nodo.enviar('keydown', { key: 'ArrowRight' });
  v.volar(2); assert.equal(v.s.avion.pist.enMarcha, true);
  // «Encender todo»: todo listo, en marcha y con el aceite en verde.
  const f = cajonConAvion({ ...crearAvion({ potencia: 0 }), rpm: 0, aceitePsi: 0, pist: crearMotor({ enMarcha: false }) });
  tocar(f.cajon.botones.bTodo);
  const m = f.s.avion.pist;
  assert.ok(m.master && m.selector === 'BOTH' && m.magnetos === 'BOTH' && m.enMarcha && m.mezcla === 1 && f.s.avion.aceitePsi === VUELO.aceitePsiNormal);
});

test('la mezcla del Asistente: RICA abajo de 3,000 ft; arriba, la de mejor potencia', () => {
  assert.equal(mezclaAuto(1000), 1);
  for (const ft of [5000, 8000, 11000]) {
    const c = combustion(mezclaAuto(ft), ft, 0.65);
    assert.ok(Math.abs(c.lambda - LAMBDA.mejorPotencia) < 0.01, `${ft}`);
    assert.ok(c.aspereza < 0.05 && c.factor > 0.99);
  }
  assert.ok(mezclaAuto(8000) < mezclaAuto(5000));
  assert.ok(Math.abs(mezclaAuto(8000) - (LAMBDA.mejorPotencia * densidad(8000)) / 1.25) < 1e-9);
});

test('las luces del avión: roja a la izquierda, verde a la derecha, blanca en la cola; con el MASTER; de noche se ven', () => {
  assert.deepEqual({ ...LUCES_PROPIAS }, { izquierda: 'rojo', derecha: 'verde', cola: 'blanco', baliza: 'rojo', estrobo: 'blanco', fuente: 'AFH cap. 11 · AIM 4-3-24' });
  // Mirando al norte (rumbo 360): la izquierda es el oeste (x menor), la cola queda al sur (z menor).
  const p = primitivasAvion({ pos: [0, 0, 0], rumbo: 360, escala: 1, luces: { nav: true } });
  const de = q => p.find(x => x.luzAvion === q);
  assert.ok(de('izquierda').c[0] > 200 && de('izquierda').c[1] < 80, 'roja');
  assert.ok(de('derecha').c[1] > 200 && de('derecha').c[0] < 80, 'verde');
  assert.deepEqual(de('cola').c, [255, 255, 255]);
  assert.ok(de('izquierda').p[0] < -4 && de('derecha').p[0] > 4 && de('cola').p[2] < -4);
  // Con rumbo 90 (al este), la izquierda queda al norte.
  const e = primitivasAvion({ pos: [0, 0, 0], rumbo: 90, escala: 1, luces: { nav: true } });
  assert.ok(e.find(x => x.luzAvion === 'izquierda').p[2] > 4);
  // De noche se ven siempre (un tamaño mínimo en pantalla y el halo «brillo»).
  for (const q of p.filter(x => x.luzAvion)) { assert.equal(q.tex, 'brillo'); assert.ok(q.min >= 2); }
  // Afuera: el avión propio lleva las luces encendidas (las de la puesta a la salida del sol, AIM 4-3-24).
  const a = { ...crearAvion({ ft: 2000, enSuelo: false }), pist: crearMotor() };
  const pr = avionPropio(a, { luces: lucesActivas(a.pist), t: 0.55 });
  assert.equal(pr.filter(x => ['izquierda', 'derecha', 'cola'].includes(x.luzAvion)).length, 3);
  assert.ok(pr.some(x => x.luzAvion === 'baliza'), 'la baliza destella');
  // Dependen del MASTER: sin MASTER, ninguna.
  assert.deepEqual(Object.values(lucesActivas({ ...a.pist, master: false })), LUCES.map(() => false));
  assert.equal(avionPropio(a, { luces: lucesActivas({ ...a.pist, master: false }) }).filter(x => x.luzAvion).length, 0);
  assert.equal(lucesActivas(a.pist).nav, true); assert.equal(lucesActivas(a.pist).aterrizaje, false);
  // La luz de aterrizaje ilumina el suelo adelante (cerca del suelo) y no depende del sol.
  const bajo = { ...crearAvion({ ft: 100, enSuelo: false }), rumbo: 360 };
  const l = luzAterrizaje(bajo, { aterrizaje: true, suelo: 0 });
  const piso = l.filter(x => x.t === 'p');
  assert.ok(piso.length >= 1 && piso.every(x => x.luz === 0 && x.p.every(q => q[2] >= bajo.z - 0.01)));
  assert.equal(luzAterrizaje({ ...bajo, ft: 3000 }, { aterrizaje: true }).filter(x => x.t === 'p').length, 0, 'alto: no llega al suelo');
  assert.equal(luzAterrizaje(bajo, {}).length, 0);
  for (const k of LUCES) assert.ok(`juego.luces.${k}` in es && `juego.luces.${k}` in en);
  if (afh) {
    assert.match(afh, /A red light is positioned on the left wingtip, a green light on the right wingtip, and a white light on the tail/);
    assert.match(aim, /Aircraft position lights are required to be lighted on aircraft operated on the surface and in flight from sunset to sunrise/);
    assert.match(aim, /required to operate that light system during all types of operations \(day and night\)/);
  }
  // La mini-clase de aterrizar de noche: el paso de las luces propias.
  const nc = MINICLASES.find(m => m.id === 'noche-aterrizar');
  assert.equal(nc.pasos[0].id, 'propias');
  assert.match(es['juego.mc.noche-aterrizar.propias.clave'], /91\.209/);
});

test('la repetición de noche: los dos aviones con sus luces en cada cámara; desde arriba, más grandes', () => {
  const inicio = { x: -2, z: -10, ft: 2500, rumbo: 20 };
  for (const e of ['de_frente', 'cruza_der_izq']) for (const acierto of [false, true]) {
    for (let k = 0; k < CAMARAS.length; k++) {
      const r = crearRepeticion({ escena: 'trafico', encuentro: e, acierto, inicio, camara: k });
      for (const tm of r.tomas) {
        const t0 = (tm.desde + tm.hasta) / 2;
        const p = primitivasRepeticion(r, t0, { conPropio: tm.camara !== 'cabina', conCaminos: tm.camara !== 'cabina', toma: tm.camara });
        const rojas = p.filter(q => q.luzAvion === 'izquierda'), verdes = p.filter(q => q.luzAvion === 'derecha'), colas = p.filter(q => q.luzAvion === 'cola');
        assert.equal(rojas.length, 2, `${e} ${tm.camara}: las rojas de los dos`);
        assert.equal(verdes.length, 2); assert.equal(colas.length, 2);
        if (tm.camara === 'arriba') assert.ok(rojas.every(q => q.min >= 5), 'desde arriba, más grandes');
      }
    }
  }
  // Las otras repeticiones (motor, nube, espacio aéreo) también llevan las luces del propio.
  for (const escena of ['motor', 'nube', 'espacio']) {
    const r = crearRepeticion({ escena, inicio });
    assert.equal(primitivasRepeticion(r, 2, { toma: tomaEn(r, 2).camara }).filter(q => ['izquierda', 'derecha', 'cola'].includes(q.luzAvion)).length, 3, escena);
  }
});

test('la prueba de motor (run-up): 1,700 RPM, la caída con L y con R (pequeña), el calor al carburador baja la RPM, y a ralentí (PHAK cap. 7)', () => {
  const poh = MOTOR_FAA.poh;
  assert.deepEqual({ ...poh, aceitePsiVerde: [...poh.aceitePsiVerde], aceiteTempVerde: [...poh.aceiteTempVerde] },
    { runupRpm: 1700, caidaMaxRpm: 125, diferenciaMaxRpm: 50, aceitePsiVerde: [25, 100], aceiteTempVerde: [100, 245], fuente: 'POH del avión del juego (ejemplo)' });
  assert.equal(MOTOR_FAA.calorPerdidaMax, 0.15);
  assert.ok(1 - MOTOR_FAA.calorFactor <= MOTOR_FAA.calorPerdidaMax);
  if (phak7) {
    assert.match(phak7, /A small decrease in engine rpm is normal during this check\. The permissible decrease is listed in the AFM or POH/);
    assert.match(phak7, /The use of carburetor heat causes a decrease in engine power, sometimes up to 15 percent/);
    assert.match(afh, /if equipped, carburetor heat is functioning/);
  }
  // En el avión estacionado (freno): la prueba completa, paso a paso.
  let a = { ...crearAvion({ potencia: 0 }), pist: crearMotor() }, r = {};
  const correr = (seg, pot, cambio = {}) => {
    a = { ...a, pist: { ...a.pist, ...cambio } };
    for (let i = 0; i < seg * 60; i++) { a = { ...pasoVuelo(a, { potencia: pot }, 1 / 60), x: 0, z: -1.85, kt: 0 }; r = medirRunup(r, { rpm: a.rpm, magnetos: a.pist.magnetos, calor: a.pist.calor }); }
  };
  correr(3, 0.556);
  assert.ok(Math.abs(a.rpm - poh.runupRpm) < 30, `${a.rpm.toFixed(0)} RPM`);
  correr(3, 0.556, { magnetos: 'L' }); correr(2, 0.556, { magnetos: 'BOTH' }); correr(3, 0.556, { magnetos: 'R' }); correr(2, 0.556, { magnetos: 'BOTH' });
  correr(3, 0.556, { calor: true }); correr(2, 0.556, { calor: false });
  assert.ok(r.caidaL > 20 && r.caidaL <= poh.caidaMaxRpm, `L ${r.caidaL}`);
  assert.ok(r.caidaR > 20 && r.caidaR <= poh.caidaMaxRpm && Math.abs(r.caidaL - r.caidaR) <= poh.diferenciaMaxRpm);
  assert.ok(r.caidaCalor > 20, `calor ${r.caidaCalor}`);
  correr(4, 0);
  const lista = listaRunup(r, { rpm: a.rpm, aceitePsi: a.aceitePsi, aceiteTemp: a.aceiteTemp, enMarcha: a.pist.enMarcha, magnetos: a.pist.magnetos, calor: a.pist.calor });
  assert.deepEqual(lista.map(x => x.id), [...PASOS_RUNUP]);
  assert.ok(lista.every(x => x.hecho), JSON.stringify(lista));
  // Sin hacer nada, nada está hecho (salvo el aceite si anda).
  assert.deepEqual(listaRunup({}, {}).map(x => x.hecho), PASOS_RUNUP.map(() => false));
  for (const id of PASOS_RUNUP) assert.ok(`juego.runup.${id}` in es && `juego.runup.${id}` in en, id);
  for (const k of ['juego.motor.todo', 'juego.motor.apagar', 'juego.motor.encender', 'juego.motor.calor', 'juego.motor.datos2', 'juego.motor.practica', 'juego.runup.caidas']) assert.ok(k in es && k in en, k);
});
