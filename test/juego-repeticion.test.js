// 0.14.103 (pedido del dueño): la repetición de «qué pasó» después de responder: de 6 a 12 s, 2 a 4 cámaras distintas,
// el momento clave con su frase (es y en); mal: el incidente (casi choque, motor parado y aterrizaje en un campo, la
// espiral en la nube, el límite del espacio aéreo cruzado); bien: la maniobra correcta. Siempre igual.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMARAS, REPETICION, ENCUENTROS, escenaDeRepeticion, crearRepeticion, estadoRepeticion, distanciaMinima, tiempoEscena, congelada, tomaEn, fundido,
  camaraRepeticion, primitivasRepeticion,
} from '../public/clase/juego-repeticion.js';

const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const inicio = { x: -2, z: -10, ft: 2500, rumbo: 20 };
const todas = () => [
  ...ENCUENTROS.flatMap(e => [false, true].map(a => crearRepeticion({ escena: 'trafico', encuentro: e, acierto: a, inicio }))),
  ...['motor', 'nube', 'espacio'].flatMap(x => [false, true].map(a => crearRepeticion({ escena: x, acierto: a, inicio }))),
];

test('qué escena va con cada respuesta', () => {
  assert.equal(escenaDeRepeticion('aceite'), 'motor');
  assert.equal(escenaDeRepeticion('nube'), 'nube'); assert.equal(escenaDeRepeticion('turbulencia'), 'nube');
  assert.equal(escenaDeRepeticion('atc'), 'espacio'); assert.equal(escenaDeRepeticion('desvio'), 'espacio');
  assert.equal(escenaDeRepeticion('bien', 'motor'), 'motor'); assert.equal(escenaDeRepeticion('bien', 'meteo'), 'nube');
  assert.equal(escenaDeRepeticion('bien', 'espacio'), 'espacio'); assert.equal(escenaDeRepeticion('bien', null), 'trafico');
});

test('cada repetición: 6 a 12 s, 2 a 4 cámaras distintas en orden, se detiene en el momento clave, con fundidos; su frase en es y en', () => {
  for (const r of todas()) {
    assert.ok(r.dur >= REPETICION.minS && r.dur <= REPETICION.maxS, `${r.escena} ${r.dur}`);
    const cams = r.tomas.map(x => x.camara);
    assert.ok(cams.length >= 2 && cams.length <= 4 && new Set(cams).size === cams.length && cams.every(c => CAMARAS.includes(c)), cams.join());
    assert.equal(r.tomas[0].desde, 0); assert.ok(Math.abs(r.tomas.at(-1).hasta - r.dur) < 1e-9);
    assert.ok(congelada(r, r.clave.t + 0.5) && !congelada(r, r.clave.t - 0.5));
    assert.equal(tiempoEscena(r, r.clave.t + 1), r.clave.t, 'quieto en el momento clave');
    assert.equal(fundido(r, r.tomas[1].desde), 1); assert.equal(fundido(r, 0.01), 0);
    assert.ok(r.clave.texto in es && r.clave.texto in en, r.clave.texto);
    for (const t of [0, r.dur / 2, r.dur]) { const c = camaraRepeticion(r, t, 2); assert.ok(c.cam.ojo.every(Number.isFinite), `${r.escena} ${c.toma}`); }
    assert.ok(primitivasRepeticion(r, r.dur / 2).length > 20);
  }
  // «Cambiar cámara»: empieza por otra.
  const a = crearRepeticion({ escena: 'trafico', inicio }), b = crearRepeticion({ escena: 'trafico', inicio, camara: 1 });
  assert.notEqual(a.tomas[0].camara, b.tomas[0].camara);
  assert.equal(tomaEn(a, 0).camara, a.tomas[0].camara);
  // Siempre igual.
  assert.deepEqual(crearRepeticion({ escena: 'nube', inicio }).propio, crearRepeticion({ escena: 'nube', inicio }).propio);
  for (const k of ['juego.rep.saltar', 'juego.rep.cambiar', ...CAMARAS.map(c => `juego.rep.cam.${c}`)]) assert.ok(k in es && k in en, k);
});

test('el tráfico: mal, casi choque en el momento clave; bien, pasan lejos (14 CFR 91.113)', () => {
  for (const e of ['de_frente', 'cruza_der_izq', 'cruza_izq_der', 'alcanzas']) {
    const mal = crearRepeticion({ escena: 'trafico', encuentro: e, acierto: false, inicio }), bien = crearRepeticion({ escena: 'trafico', encuentro: e, acierto: true, inicio });
    const dm = distanciaMinima(mal), db = distanciaMinima(bien);
    assert.ok(dm.d < 0.02, `${e}: casi choque (${dm.d.toFixed(3)})`);
    assert.ok(Math.abs(dm.t - mal.clave.t) < 0.5, `${e}: el momento clave es el más cerca`);
    assert.ok(db.d > 0.06, `${e}: bien, lejos (${db.d.toFixed(3)})`);
  }
  // De frente, bien: los dos viran a la derecha (el rumbo sube).
  const f = crearRepeticion({ escena: 'trafico', encuentro: 'de_frente', acierto: true, inicio });
  const fin = estadoRepeticion(f, f.dur);
  assert.ok(((fin.propio.rumbo - inicio.rumbo + 360) % 360) > 20);
  assert.ok(((fin.otro.rumbo - (inicio.rumbo + 180) + 360) % 360) > 20);
});

test('el motor, la nube y el espacio aéreo: mal, el incidente; bien, la maniobra', () => {
  const suelo = () => 0.1;
  const motor = crearRepeticion({ escena: 'motor', acierto: false, inicio, suelo });
  const fm = estadoRepeticion(motor, motor.dur).propio;
  assert.ok(fm.enSuelo && fm.rpm < 1 && Math.abs(fm.y - 0.1) < 1e-9, 'el motor se para y aterriza en el campo (sin choque)');
  assert.ok(estadoRepeticion(motor, 0.5).propio.rpm > 2000);
  assert.ok(estadoRepeticion(crearRepeticion({ escena: 'motor', acierto: true, inicio, suelo }), 11).propio.rpm > 2000);
  const nube = crearRepeticion({ escena: 'nube', acierto: false, inicio });
  const n = estadoRepeticion(nube, nube.clave.t + 0.5).propio;
  assert.ok(Math.abs(n.alabeo) > 45 && n.y < inicio.ft / 1000, 'la espiral: el ala abajo y bajando');
  const nb = crearRepeticion({ escena: 'nube', acierto: true, inicio });
  const giro = (estadoRepeticion(nb, nb.dur).propio.rumbo - inicio.rumbo + 360) % 360;
  assert.ok(giro > 170 && giro < 190, `180° (${giro.toFixed(0)})`);
  // El espacio aéreo: mal, cruza el límite; bien, no.
  const lado = (r, p) => { const [[ax, az], [bx, bz]] = r.limite; return Math.sign((bx - ax) * (p.z - az) - (bz - az) * (p.x - ax)); };
  const em = crearRepeticion({ escena: 'espacio', acierto: false, inicio }), eb = crearRepeticion({ escena: 'espacio', acierto: true, inicio });
  assert.notEqual(lado(em, em.propio[0]), lado(em, em.propio.at(-1)), 'mal: cruza');
  assert.equal(lado(eb, eb.propio[0]), lado(eb, eb.propio.at(-1)), 'bien: queda afuera');
});
