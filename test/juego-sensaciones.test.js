// 0.14.117: el Juego de vuelo más real (pedido del dueño: «mejora la animación, más real… el avión y los comandos»): el
// efecto suelo (PHAK cap. 5 · AFH cap. 6), el ala que cae en la pérdida sin el Asistente, el viento cruzado en el suelo
// (la veleta), el consejo del redondeo, el yugo del teléfono (zona muerta, curva y suavizado), la
// cámara de afuera, la vista de la cabina, las nubes con la luz de la hora y el lago que se funde con el campo.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearAvion, pasoVuelo, efectoSuelo, EFECTO_SUELO, consejo, PISTA, LAGO, enAgua } from '../public/clase/vuelo-modelo.js';
import { curvaYugo, yugoDeToque, suavizarYugo, YUGO_TACTIL, seguirCamara, arribaInclinado, miradaCabina, CAMARA_AFUERA } from '../public/juego-vista.js';
import { construirMundo, orillaLago, aguaLago, nubesConLuz } from '../public/clase/juego-mundo.js';
import { cumulo, PALETAS } from '../public/clase/e3d-base.js';
import { PALETA_NOCHE } from '../public/clase/juego-noche.js';

const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const volar = (a, mandos, seg, opciones = {}) => { for (let i = 0; i < seg * 60; i++) a = pasoVuelo(a, typeof mandos === 'function' ? mandos(a) : mandos, 1 / 60, opciones); return a; };

test('el efecto suelo: los números de la FAA (envergadura, ¼ y 1/10) y el avión flota cerca del suelo', () => {
  // La resistencia inducida baja 1.4 % con el ala a una envergadura, 23.5 % a un cuarto y 47.6 % a un décimo (PHAK cap. 5).
  const altura = r => r * EFECTO_SUELO.envergaduraFt - EFECTO_SUELO.alaFt; // las ruedas, con el ala a r envergaduras
  assert.ok(Math.abs(efectoSuelo(altura(1)) - 0.014) < 1e-9);
  assert.ok(Math.abs(efectoSuelo(altura(0.25)) - 0.235) < 1e-9);
  assert.ok(Math.abs(efectoSuelo(altura(0.1)) - 0.476) < 1e-9 || altura(0.1) < 0, 'a un décimo (si las ruedas no están bajo el suelo)');
  assert.equal(efectoSuelo(500), 0, 'lejos del suelo, nada');
  for (let ft = 0; ft < 60; ft += 2) assert.ok(efectoSuelo(ft) >= efectoSuelo(ft + 2), `baja con la altura (${ft} ft)`);
  // Igual actitud y velocidad, sin potencia: cerca del suelo pierde menos velocidad (flota) que arriba.
  const base = { ...crearAvion({ ft: 8, kt: 62, enSuelo: false, flaps: 1 }), cabeceo: 4 };
  const bajo = volar(base, { potencia: 0, cabeceo: 0, flaps: 1 }, 1);
  const alto = volar({ ...base, ft: 1500 }, { potencia: 0, cabeceo: 0, flaps: 1 }, 1);
  assert.ok(bajo.kt > alto.kt, `flota: ${bajo.kt.toFixed(2)} kt cerca del suelo, ${alto.kt.toFixed(2)} kt arriba`);
  assert.equal(EFECTO_SUELO.envergaduraFt, 36, 'la envergadura del avión del juego (como un Cessna 172)');
});

test('la pérdida sin el Asistente: la nariz cae y un ala también; con el Asistente, no', () => {
  const tirar = asistente => {
    let a = crearAvion({ ft: 3500, kt: 80, enSuelo: false, potencia: 0.2 }), max = 0, entro = false;
    for (let i = 0; i < 20 * 60; i++) { a = pasoVuelo(a, { potencia: 0.2, cabeceo: a.t < 12 ? 0.7 : 0 }, 1 / 60, { asistente }); if (a.perdida) entro = true; max = Math.max(max, Math.abs(a.alabeo)); }
    return { max, entro };
  };
  const sin = tirar(false), con = tirar(true);
  assert.ok(sin.entro && sin.max > 10, `sin Asistente, un ala cae (${sin.max.toFixed(1)}°)`);
  assert.ok(!con.entro && con.max < 1, 'con el Asistente no hay pérdida ni ala que caiga');
  assert.match(es['juego.mc.perdida.recuperar'], /nivélala/);
  assert.match(en['juego.mc.perdida.recuperar'], /level it/);
});

test('el viento cruzado en el suelo: la nariz se va hacia el viento (la veleta) y con el yugo se corrige', () => {
  const rodando = { ...crearAvion({ x: 0, z: -1.5, kt: 35 }), potencia: 0.6 };
  const viento = { viento: { desde: 90, kt: 10 } };
  const calma = volar(rodando, { potencia: 0.6 }, 2);
  const cruzado = volar(rodando, { potencia: 0.6 }, 2, { ambiente: viento });
  assert.ok(Math.abs(((calma.rumbo + 180) % 360) - 180) < 0.01, 'sin viento sigue derecho');
  assert.ok(cruzado.rumbo > 1 && cruzado.rumbo < 10, `con viento de la derecha, la nariz va a la derecha (${cruzado.rumbo.toFixed(1)}°)`);
  const corregido = volar(rodando, a => ({ potencia: 0.6, alabeo: -((((a.rumbo + 180) % 360) - 180)) / 3 }), 2, { ambiente: viento });
  assert.ok(Math.abs(((corregido.rumbo + 180) % 360) - 180) < 1, 'con el yugo de costado (los pedales) se mantiene');
  // En vuelo, el viento lleva al avión (deriva), no lo gira.
  const vuelo = volar(crearAvion({ ft: 2000, kt: 90, enSuelo: false, potencia: 0.6 }), { potencia: 0.6 }, 3, { ambiente: viento, asistente: true });
  assert.ok(Math.abs(((vuelo.rumbo + 180) % 360) - 180) < 0.5 && vuelo.x < 0, 'en el aire deriva con el viento');
});

test('el consejo del redondeo: cerca de la pista, bajando y a menos de una envergadura; nunca en el lago ni al subir', () => {
  const sobre = { ...crearAvion({ x: 0, z: -PISTA.largoFt / 2000 + 0.2, ft: 20, kt: 60, enSuelo: false }), vs: -200 };
  assert.equal(consejo(sobre), 'redondeo');
  assert.equal(consejo({ ...sobre, vs: 300 }), 'subir', 'después de despegar sigue «subir»');
  assert.notEqual(consejo({ ...sobre, ft: 80 }), 'redondeo');
  assert.notEqual(consejo({ ...sobre, x: 3 }), 'redondeo', 'lejos del eje, no');
  assert.notEqual(consejo({ ...sobre, x: LAGO.x, z: LAGO.z }), 'redondeo', 'en el lago, no');
  for (const k of ['juego.consejo.redondeo', 'juego.consejo.acelera_tactil']) assert.ok(es[k] && en[k], k);
  assert.match(es['juego.consejo.redondeo'], /efecto suelo/);
  assert.doesNotMatch(es['juego.consejo.acelera_tactil'], /←|→/, 'en el teléfono no habla de flechas');
});

test('el yugo del teléfono: zona muerta, curva fina en el centro, a fondo en el borde y suavizado', () => {
  assert.equal(curvaYugo(YUGO_TACTIL.zona * 0.9), 0, 'el pulso no mueve el avión');
  assert.equal(curvaYugo(1), 1); assert.equal(curvaYugo(-1), -1); assert.equal(curvaYugo(3), 1, 'nunca más de 1');
  assert.ok(curvaYugo(0.5) < 0.5 && curvaYugo(0.5) > 0.2, `fino en el centro (${curvaYugo(0.5).toFixed(2)})`);
  for (let v = 0; v < 1; v += 0.05) assert.ok(curvaYugo(v + 0.05) >= curvaYugo(v), 'siempre crece');
  assert.equal(curvaYugo(-0.4), -curvaYugo(0.4), 'igual a los dos lados');
  assert.deepEqual(yugoDeToque(1, -1), { alabeo: 1, cabeceo: -1 });
  // El suavizado llega a lo pedido en unos décimos de segundo (sin saltos de un cuadro a otro).
  let s = { alabeo: 0, cabeceo: 0 };
  s = suavizarYugo(s, { alabeo: 1, cabeceo: -1 }, 1 / 60);
  assert.ok(s.alabeo > 0 && s.alabeo < 0.3, 'no salta');
  for (let i = 0; i < 30; i++) s = suavizarYugo(s, { alabeo: 1, cabeceo: -1 }, 1 / 60);
  assert.ok(s.alabeo > 0.99 && s.cabeceo < -0.99, 'en medio segundo llega');
});

test('la cámara de afuera: sigue el rumbo con retraso, se inclina un tercio del alabeo y en el suelo va más baja', () => {
  const a = { rumbo: 90, alabeo: 30, gamma: 0, enSuelo: false };
  let c = seguirCamara(null, a, 1 / 60);
  assert.equal(c.giro, 90); assert.ok(Math.abs(c.alabeo - 30 * CAMARA_AFUERA.alabeo) < 1e-9);
  c = seguirCamara(c, { ...a, rumbo: 120 }, 1 / 60);
  assert.ok(c.giro > 90 && c.giro < 95, 'gira despacio');
  for (let i = 0; i < 300; i++) c = seguirCamara(c, { ...a, rumbo: 120 }, 1 / 60);
  assert.ok(Math.abs(c.giro - 120) < 0.1, 'y llega');
  // Igual a 30 que a 60 cuadros por segundo.
  let c30 = seguirCamara(null, a, 1 / 30), c60 = seguirCamara(null, a, 1 / 60);
  for (let i = 0; i < 15; i++) c30 = seguirCamara(c30, { ...a, rumbo: 120 }, 1 / 30);
  for (let i = 0; i < 30; i++) c60 = seguirCamara(c60, { ...a, rumbo: 120 }, 1 / 60);
  assert.ok(Math.abs(c30.giro - c60.giro) < 0.01);
  const suelo = seguirCamara(null, { ...a, enSuelo: true }, 1 / 60);
  assert.equal(suelo.alto, CAMARA_AFUERA.altoSuelo); assert.equal(suelo.alabeo, 0);
  assert.equal(seguirCamara(null, a, 1 / 60, { reducir: true }).alabeo, 0, 'con «menos movimiento», sin inclinar');
  // El «arriba» inclinado: largo 1; sin alabeo, el vertical; con alabeo a la derecha, hacia la derecha de la cámara.
  const u = arribaInclinado(90, 20);
  assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-9);
  assert.ok(Math.hypot(...arribaInclinado(0, 0).map((v, i) => v - [0, 1, 0][i])) < 1e-12);
  assert.ok(arribaInclinado(0, 20)[0] > 0, 'mirando al norte, la derecha es el este');
});

test('la vista de la cabina: el horizonte a unos 3/5 del parabrisas (se ve el suelo delante, también en el teléfono)', () => {
  for (const [fov, tablero] of [[56, 0.5], [74, 0.46]]) {
    const g = miradaCabina(fov, tablero), f = 0.5 / Math.tan((fov * Math.PI) / 360);
    const y = 0.5 - Math.tan((g * Math.PI) / 180) * f; // dónde queda el horizonte (fracción desde arriba)
    assert.ok(Math.abs(y - 0.6 * (1 - tablero)) < 1e-9, `fov ${fov}`);
    assert.ok(g > 7 && g < 20);
  }
});

test('las nubes con la luz de la hora y el lago que se funde con el campo (sin halo ni disco)', () => {
  const nube = cumulo({ x: 0, z: 0, base: 4, ancho: 2, alto: 1, semilla: 3 }).prims;
  const brillo = ps => ps.filter(q => q.tex === 'nube').reduce((s, q) => s + q.c[0] + q.c[1] + q.c[2], 0);
  assert.equal(nubesConLuz(nube, PALETAS.claro), nube, 'de día, igual');
  assert.ok(brillo(nubesConLuz(nube, PALETA_NOCHE)) < brillo(nube) * 0.3, 'de noche, oscuras');
  assert.ok(brillo(nubesConLuz(nube, PALETAS.oscuro)) < brillo(nube) * 0.8, 'al atardecer, apagadas');
  assert.ok(brillo(construirMundo(PALETA_NOCHE)) < brillo(construirMundo(PALETAS.claro)) * 0.3, 'las del mundo también');
  for (const paleta of [PALETAS.claro, PALETA_NOCHE]) {
    const mundo = construirMundo(paleta);
    // El agua solo la pone el lago (pegada al suelo, hasta la orilla): el terreno de abajo ya no se pinta de agua.
    assert.ok(!mundo.some(q => q.capa !== 'calco' && q.c === paleta.agua), 'ningún cuadro del terreno de color agua');
    const agua = aguaLago(paleta);
    assert.ok(agua.every(q => q.refleja > 0.5 && q.luz === 1), 'el agua refleja el cielo (de lejos se funde con la bruma)');
    const orilla = orillaLago(paleta);
    assert.ok(orilla.length >= 48 && orilla.every(q => q.capa === 'calco' && q.a < 1 && q.p.length === 4), 'la orilla: una franja suave');
    // La franja empieza bajo el agua y termina fuera del lago (no queda rendija).
    for (const q of orilla) { assert.ok(enAgua(q.p[0][0], q.p[0][2])); assert.ok(!enAgua(q.p[1][0], q.p[1][2])); }
    const iOrilla = mundo.findIndex(q => q.capa === 'calco' && q.a === 0.5 && q.p.length === 4 && !enAgua(q.p[1][0], q.p[1][2]) && enAgua(q.p[0][0], q.p[0][2]));
    const iAgua = mundo.findIndex(q => q.capa === 'calco' && q.c === paleta.agua);
    assert.ok(iOrilla >= 0 && iAgua >= 0 && iOrilla < iAgua, 'la orilla primero, el agua encima');
  }
});
