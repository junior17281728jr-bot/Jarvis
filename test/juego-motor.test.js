// 0.14.103: el motor de pistón del Juego (la mezcla con la EGT, el flujo de combustible, el arranque y el apagado), el sonido
// (nunca antes de un toque del usuario) y el menú «Tiempo» (nubes, frente frío y frente cálido), con los datos de la FAA.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOTOR_FAA, combustion, crearMotor, pasoMotor, listaArranque, listaApagado, densidad, LAMBDA } from '../public/clase/motor-piston.js';
import { crearSonido } from '../public/clase/juego-sonido.js';
import { TIEMPOS, TIEMPO_FAA, GEOMETRIA, condiciones, cambioAltimetro, nubesDe } from '../public/clase/juego-tiempo.js';
import { crearAvion, pasoVuelo } from '../public/clase/vuelo-modelo.js';
import { MINICLASES } from '../public/clase/juego-miniclases.js';
import { inicioDe } from '../public/juego-vista.js';

const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const fuente = n => readFileSync(new URL(`../../verif-libros/datos/fuentes/faa/${n}`, import.meta.url), 'utf8');
let phak7 = null, phak11 = null, phak12 = null, afh = null;
try { phak7 = fuente('libro-faa-phak-cap09.txt'); phak11 = fuente('libro-faa-phak-cap13.txt'); phak12 = fuente('libro-faa-phak-cap14.txt'); afh = fuente('libro-faa-afh-cap01.txt'); } catch { /* sin los libros (en otra copia) */ }
const plano = s => s.replace(/\s+/g, ' ');

// El motor andando unos segundos con la mezcla y la potencia dadas.
function andar(m, { potencia = 0.65, ft = 0, seg = 3, combustible = 40 } = {}) {
  for (let i = 0; i < seg * 60; i++) m = pasoMotor(m, { potencia, ft, combustible, dt: 1 / 60 });
  return m;
}

test('la tabla MOTOR_FAA: magnetos, mejor potencia (100 °F del lado rico), corte, aceite en 30 s y el orden de arranque y apagado', () => {
  assert.deepEqual([...MOTOR_FAA.magnetos], ['OFF', 'R', 'L', 'BOTH', 'START']);
  assert.equal(MOTOR_FAA.mejorPotenciaRicoF, 100);
  assert.equal(MOTOR_FAA.mejorEconomia, 'pico');
  assert.equal(MOTOR_FAA.corte, 'IDLE CUTOFF');
  assert.equal(MOTOR_FAA.aceiteS, 30); assert.equal(MOTOR_FAA.arranqueMaxS, 30);
  assert.deepEqual([...MOTOR_FAA.arranque], ['master', 'combustible', 'mezcla', 'gases', 'magnetos']);
  assert.deepEqual([...MOTOR_FAA.apagado], ['gases', 'mezcla', 'magnetos', 'master']);
  if (!phak7) return;
  // Lo que dicen los libros (PHAK cap. 7 y 11, AFH cap. 2).
  const p7 = plano(phak7), p11 = plano(phak11), a = plano(afh);
  assert.match(p7, /progressively richer mixture that can result in engine roughness and an appreciable loss of power/);
  assert.match(p7, /rich mixture lowers the temperature inside the cylinder/);
  assert.match(p7, /overly lean mixture causes detonation, which may result in rough engine operation, overheating, and\/or a loss of power/);
  assert.match(p7, /move the mixture lever to the idle cutoff position/);
  assert.match(p11, /Mixture leaned to 100° rich of peak EGT/);
  assert.match(p11, /Best economy Mixture leaned to peak EGT/);
  assert.match(a, /oil pressure should rise to at least the lower limit within 30 seconds/);
  assert.match(a, /Avoid continuous starter operation for periods longer than 30 seconds/);
});

test('la curva de la EGT: sube al empobrecer hasta el pico (λ = 1) y baja si se sigue; rica en altura: menos EGT, menos potencia y más flujo', () => {
  const ft = 7500, mezclas = Array.from({ length: 41 }, (_, i) => 0.3 + i * 0.0175);
  const c = mezclas.map(m => combustion(m, ft, 0.65));
  const iPico = c.reduce((b, x, i) => (x.egt > c[b].egt ? i : b), 0);
  assert.ok(Math.abs(c[iPico].lambda - 1) < 0.05, `el pico, en λ ≈ 1 (${c[iPico].lambda.toFixed(2)})`);
  assert.ok(iPico > 0 && iPico < c.length - 1, 'el pico, en el medio');
  // Del lado rico (más mezcla que el pico) la EGT baja al enriquecer; del lado pobre, baja al empobrecer.
  for (let i = iPico; i < c.length - 1; i++) assert.ok(c[i + 1].egt <= c[i].egt + 1e-9, 'rica: más mezcla, menos EGT');
  for (let i = iPico; i > 0; i--) assert.ok(c[i - 1].egt <= c[i].egt + 1e-9, 'pobre: menos mezcla, menos EGT');
  // RICA en altura contra la mejor potencia: más fría, menos potencia y más gasolina.
  const rica = combustion(1, ft, 0.65), mejor = combustion(LAMBDA.mejorPotencia * densidad(ft) / 1.25, ft, 0.65);
  assert.ok(rica.egt < mejor.egt && rica.factor < mejor.factor && rica.flujoGph > mejor.flujoGph);
  // La mejor potencia: cerca de 100 °F del lado rico del pico (PHAK cap. 11).
  const bajoPico = mejor.pico - mejor.egt;
  assert.ok(Math.abs(bajoPico - MOTOR_FAA.mejorPotenciaRicoF) <= 25, `${bajoPico.toFixed(0)} °F del lado rico`);
  assert.equal(mejor.factor, 1);
  // Al empobrecer desde RICA, la potencia mejora un poco cerca del pico.
  assert.ok(mejor.factor - rica.factor > 0.02 && mejor.factor - rica.factor < 0.4);
  // A nivel del mar, RICA es una mezcla bien (no tose).
  assert.ok(combustion(1, 0, 0.65).aspereza < 0.05);
});

test('demasiado pobre: el motor tose; más pobre se para; con la mezcla en CORTE se para (IDLE CUTOFF)', () => {
  const ft = 7500;
  const pobre = andar(crearMotor({ mezcla: 0.45 }), { ft });
  assert.equal(pobre.enMarcha, true);
  assert.ok(pobre.aspereza > 0.3, `tose (${pobre.aspereza.toFixed(2)})`);
  assert.ok(pobre.egt < combustion(0.63, ft, 0.65).egt, 'la EGT bajó del pico');
  const muyPobre = andar(crearMotor({ mezcla: 0.3 }), { ft });
  assert.equal(muyPobre.enMarcha, false); assert.equal(muyPobre.motivo, 'pobre');
  const corte = andar(crearMotor({ mezcla: 0 }), { ft: 0 });
  assert.equal(corte.enMarcha, false); assert.equal(corte.motivo, 'corte');
  assert.equal(corte.flujoGph, 0); assert.equal(corte.factor, 0);
  // Los magnetos en OFF o el selector en OFF también lo paran.
  assert.equal(andar({ ...crearMotor(), magnetos: 'OFF' }).motivo, 'magnetos');
  assert.equal(andar({ ...crearMotor(), selector: 'OFF' }).motivo, 'combustible');
  // Un solo magneto: un poco menos de potencia (la caída de RPM de la prueba).
  assert.ok(andar({ ...crearMotor(), magnetos: 'L' }).factor < andar(crearMotor()).factor);
});

test('el arranque: solo con todo en orden (master, combustible, mezcla rica, gases un poco, START); el aceite sube en 30 s', () => {
  const frio = crearMotor({ enMarcha: false });
  assert.deepEqual(listaArranque(frio, 0).map(x => x.id), [...MOTOR_FAA.arranque]);
  assert.ok(listaArranque(frio, 0).every(x => !x.hecho));
  // START sin master: el motor de arranque no gira.
  assert.equal(andar({ ...frio, magnetos: 'START', selector: 'BOTH', mezcla: 1 }, { potencia: 0.15 }).girando, false);
  // Sin combustible (selector OFF) o con la mezcla en corte: gira, pero no arranca.
  for (const falta of [{ selector: 'OFF', mezcla: 1 }, { selector: 'BOTH', mezcla: 0 }]) {
    const m = andar({ ...frio, master: true, magnetos: 'START', ...falta }, { potencia: 0.15 });
    assert.equal(m.girando, true); assert.equal(m.enMarcha, false);
  }
  // Paso a paso, en el orden de la lista.
  let m = { ...frio }, pot = 0;
  const pasos = { master: () => { m = { ...m, master: true }; }, combustible: () => { m = { ...m, selector: 'BOTH' }; }, mezcla: () => { m = { ...m, mezcla: 1 }; }, gases: () => { pot = 0.15; }, magnetos: () => { m = { ...m, magnetos: 'START' }; } };
  for (const id of MOTOR_FAA.arranque) {
    pasos[id]();
    const hechos = listaArranque(m, pot);
    const k = MOTOR_FAA.arranque.indexOf(id);
    if (id !== 'magnetos') assert.ok(hechos.slice(0, k + 1).every(x => x.hecho), id);
  }
  m = andar(m, { potencia: pot, seg: 1 });
  assert.equal(m.enMarcha, false, 'todavía girando (prende en ~1.5 s)');
  m = andar(m, { potencia: pot, seg: 1 });
  assert.equal(m.enMarcha, true, 'arrancó');
  assert.ok(m.arranqueTotal < MOTOR_FAA.arranqueMaxS);
  m = andar({ ...m, magnetos: 'BOTH' }, { potencia: pot, seg: 1 });
  assert.ok(listaArranque(m, pot).every(x => x.hecho));
  // El avión entero: con el motor arrancado el aceite llega al verde (> 25 psi) antes de 30 s.
  let a = { ...inicioDe('libre', { enFrio: true }) };
  assert.equal(a.pist.enMarcha, false); assert.equal(a.rpm, 0);
  a = { ...a, potencia: 0.15, pist: { ...a.pist, master: true, selector: 'BOTH', mezcla: 1, magnetos: 'START' } };
  for (let i = 0; i < 2 * 60; i++) a = pasoVuelo(a, { potencia: 0.15 }, 1 / 60);
  a = { ...a, pist: { ...a.pist, magnetos: 'BOTH' } };
  assert.equal(a.pist.enMarcha, true);
  let psi30 = 0;
  for (let i = 0; i < MOTOR_FAA.aceiteS * 60; i++) { a = pasoVuelo(a, { potencia: 0.15 }, 1 / 60); psi30 = a.aceitePsi; }
  assert.ok(psi30 > 25, `aceite ${psi30.toFixed(0)} psi a los 30 s`);
  assert.ok(a.rpm > 500, 'en marcha (RPM)');
});

test('el apagado: gases en ralentí, mezcla en CORTE (se para), magnetos OFF y master OFF; el avión se queda sin RPM', () => {
  let a = { ...crearAvion({ potencia: 0 }), pist: crearMotor() };
  for (let i = 0; i < 60; i++) a = pasoVuelo(a, { potencia: 0 }, 1 / 60);
  assert.ok(a.rpm > 400);
  assert.deepEqual(listaApagado(a.pist, 0).map(x => x.id), [...MOTOR_FAA.apagado]);
  assert.deepEqual(listaApagado(a.pist, 0).map(x => x.hecho), [true, false, false, false]);
  a = { ...a, pist: { ...a.pist, mezcla: 0 } };
  for (let i = 0; i < 6 * 60; i++) a = pasoVuelo(a, { potencia: 0 }, 1 / 60);
  assert.equal(a.pist.enMarcha, false); assert.equal(a.pist.motivo, 'corte');
  assert.ok(a.rpm < 50, `RPM ${a.rpm.toFixed(0)}`);
  a = { ...a, pist: { ...a.pist, magnetos: 'OFF', master: false } };
  assert.ok(listaApagado(a.pist, 0).every(x => x.hecho));
});

test('el flujo de combustible y la gasolina que baja; empobrecida hasta la mejor potencia: menos flujo y más RPM', () => {
  let a = { ...crearAvion({ ft: 7500, kt: 100, potencia: 0.7, enSuelo: false }), pist: crearMotor({ mezcla: 1 }) };
  const g0 = a.combustible;
  for (let i = 0; i < 60 * 60; i++) a = pasoVuelo(a, { potencia: 0.7 }, 1 / 60);
  const quemadoRica = g0 - a.combustible;
  assert.ok(Math.abs(quemadoRica - a.pist.flujoGph / 60) < 0.05, 'un minuto a FF gal/h');
  assert.ok(a.pist.flujoGph > 5 && a.pist.flujoGph < 14, `FF ${a.pist.flujoGph.toFixed(1)} gal/h`);
  let b = { ...crearAvion({ ft: 7500, kt: 100, potencia: 0.7, enSuelo: false }), pist: crearMotor({ mezcla: 0.76 }) };
  for (let i = 0; i < 60 * 60; i++) b = pasoVuelo(b, { potencia: 0.7 }, 1 / 60);
  assert.ok(b.pist.flujoGph < a.pist.flujoGph, 'empobrecida: menos flujo');
  assert.ok(b.rpm > a.rpm, 'y más RPM (mejor potencia)');
});

// Un AudioContext de mentira: cuenta lo que se crea.
function contextoFalso() {
  const creados = [];
  const param = v => ({ value: v, setTargetAtTime(x) { this.value = x; }, setValueAtTime(x) { this.value = x; }, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} });
  const nodo = tipo => { const n = { tipo, connect() {}, start() { n.empezo = true; }, gain: param(1), frequency: param(440), Q: param(1), type: '' }; creados.push(n); return n; };
  const ctx = {
    creados, sampleRate: 8000, currentTime: 0, destination: {}, estado: 'running',
    createGain: () => nodo('gain'), createOscillator: () => nodo('osc'), createBiquadFilter: () => nodo('filtro'), createBufferSource: () => nodo('fuente'),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    resume: async () => { ctx.estado = 'running'; }, suspend: async () => { ctx.estado = 'suspended'; }, close: async () => { ctx.estado = 'closed'; },
  };
  return ctx;
}

test('el sonido: no se crea nada hasta encender() (un toque del usuario); después, los nodos se mueven con las RPM; apagar lo calla', async () => {
  let n = 0, ctx = null;
  const s = crearSonido({ crearContexto: () => { n++; ctx = contextoFalso(); return ctx; } });
  assert.equal(s.activo, false); assert.equal(s.contexto, null);
  s.actualizar({ rpm: 2400, kt: 100, aviso: true }); s.evento('trueno'); s.apagar();
  assert.equal(n, 0, 'sin un toque, ningún AudioContext');
  assert.equal(await s.encender(), true);
  assert.equal(n, 1); assert.equal(s.activo, true);
  assert.ok(ctx.creados.filter(x => x.tipo === 'osc').every(x => x.empezo));
  const osc = ctx.creados.filter(x => x.tipo === 'osc');
  s.actualizar({ rpm: 2400, enMarcha: true, kt: 100 });
  assert.equal(osc[0].frequency.value, (2400 / 60) * 2, 'el tono del motor: dos encendidos por vuelta');
  s.actualizar({ rpm: 1200, enMarcha: true, kt: 60 });
  assert.equal(osc[0].frequency.value, 40);
  // La bocina de pérdida (580 Hz) suena solo con el aviso.
  const bocina = osc.find(x => x.frequency.value === 580);
  assert.ok(bocina);
  s.apagar();
  assert.equal(s.activo, false); assert.equal(ctx.estado, 'suspended');
  await s.encender();
  assert.equal(n, 1, 'el mismo contexto otra vez');
  s.destruir();
  assert.equal(ctx.estado, 'closed'); assert.equal(s.contexto, null);
  // Sin Web Audio (un navegador viejo): encender() dice que no, sin errores.
  const sin = crearSonido({ crearContexto: () => null });
  assert.equal(await sin.encender(), false);
  sin.actualizar({ rpm: 2000 });
});

test('el tiempo: la tabla del PHAK cap. 12 (frentes) y del AFH (nubes); qué hay en cada lugar', () => {
  assert.deepEqual([...TIEMPOS], ['despejado', 'nubes', 'lluvia', 'niebla', 'tormenta', 'frio', 'calido']); // (0.14.118: lluvia y niebla; 0.14.119: tormenta)
  assert.equal(TIEMPO_FAA.frio.fuente, 'PHAK cap. 12'); assert.equal(TIEMPO_FAA.calido.fuente, 'PHAK cap. 12');
  assert.deepEqual({ ...TIEMPO_FAA.nubes }, { pierdeControlMin: 10, viraje180Min: 1, tasaEstandar: 3, fuente: 'AFH cap. 18' });
  if (phak12) {
    const p = plano(phak12), a = plano(afh);
    assert.match(p, /[Ss]tratiform/); assert.match(p, /[Dd]rizzle/); assert.match(p, /[Cc]umulonimbus/);
    assert.match(p, /[Ll]ightning/); assert.match(p, /[Gg]usty/);
    assert.match(a, /180° turn/);
  }
  // Nubes: debajo de la base se ve; dentro, todo gris (sin horizonte).
  const n = GEOMETRIA.nubes;
  assert.equal(condiciones('nubes', 0, 0, n.base - 500).dentro, false);
  assert.ok(condiciones('nubes', 0, 0, n.base - 500).visibilidad >= 30);
  assert.equal(condiciones('nubes', 0, 0, (n.base + n.tope) / 2).dentro, true);
  assert.ok(condiciones('nubes', 0, 0, (n.base + n.tope) / 2).visibilidad < 1);
  assert.equal(condiciones('nubes', 0, 0, n.tope + 500).dentro, false);
  // Frente frío: antes, viento del sur y la presión baja; en la línea, tormenta (lluvia, rayos, ráfagas, turbulencia);
  // después, viento del oeste-noroeste, más frío y la presión sube; despeja.
  const f = GEOMETRIA.frio;
  const lejos = condiciones('frio', 0, f.lineaZ - 28, 2000), cerca = condiciones('frio', 0, f.lineaZ - f.ancho - 1, 2000);
  const linea = condiciones('frio', 0, f.lineaZ, 2000), despues = condiciones('frio', 0, f.lineaZ + 30, 2000);
  assert.equal(lejos.zona, 'antes'); assert.ok(cerca.altimetro < lejos.altimetro, 'la presión baja al acercarse');
  assert.equal(linea.zona, 'paso'); assert.ok(linea.rayos && linea.lluvia > 0.5 && linea.turbulencia > 0.5 && linea.viento.rafagas > linea.viento.kt);
  assert.ok(linea.visibilidad < 15, 'mala visibilidad en los chubascos');
  assert.equal(despues.zona, 'despues'); assert.ok(despues.altimetro > linea.altimetro, 'la presión sube después');
  assert.ok(despues.temperatura < cerca.temperatura, 'más frío después');
  assert.ok(despues.viento.desde >= 270 && despues.viento.desde <= 315, 'oeste-noroeste');
  assert.ok(cerca.viento.desde >= 160 && cerca.viento.desde <= 200, 'del sur antes');
  assert.equal(despues.lluvia, 0); assert.ok(despues.visibilidad > 50, 'despeja');
  // Frente cálido: estratos bajos y llovizna en una zona ancha (techo bajo); la presión baja despacio; después, más calor.
  const c = GEOMETRIA.calido;
  const lejosC = condiciones('calido', 0, c.lineaZ + 50, 600), cercaC = condiciones('calido', 0, c.lineaZ + 5, 600), despuesC = condiciones('calido', 0, c.lineaZ - 10, 600);
  assert.ok(lejosC.lluvia > 0 && lejosC.techo <= 1000 && lejosC.visibilidad < 20, 'llovizna, techo bajo y poca visibilidad');
  assert.ok(condiciones('calido', 0, c.lineaZ + 50, 2000).dentro, 'en el estrato');
  assert.ok(cercaC.altimetro < lejosC.altimetro, 'la presión baja al acercarse');
  assert.ok(Math.abs(cercaC.altimetro - lejosC.altimetro) < 0.25, 'despacio');
  assert.ok(despuesC.temperatura > cercaC.temperatura, 'más calor después');
  // El aeropuerto A (0,0) queda bajo el estrato con el frente cálido (la zona ancha).
  assert.ok(condiciones('calido', 0, 0, 2000).dentro);
  // Despejado: nada.
  const d = condiciones('despejado', 0, 0, 3000);
  assert.ok(!d.dentro && !d.rayos && d.lluvia === 0 && d.altimetro === 29.92);
  // El control da el altímetro cuando cambia 0.05 o más.
  assert.equal(cambioAltimetro(null, 29.92), true);
  assert.equal(cambioAltimetro(29.92, 29.89), false);
  assert.equal(cambioAltimetro(29.92, 29.87), true);
  // Las nubes que se dibujan: siempre las mismas (sin azar suelto) y nada con despejado.
  assert.equal(nubesDe('despejado').length, 0);
  for (const id of ['nubes', 'frio', 'calido']) { assert.ok(nubesDe(id).length > 10); assert.deepEqual(nubesDe(id), nubesDe(id)); }
});

test('la mini-clase «La mezcla» (PHAK cap. 7 y 11): a 7,500 ft, con el motor; sus pasos van de rica a corte', () => {
  const m = MINICLASES.find(x => x.id === 'mezcla');
  assert.ok(m && m.motor && m.icono === 'motor');
  assert.equal(m.inicio.ft, 7500); assert.equal(m.fuente, 'PHAK cap. 7 · cap. 11');
  assert.deepEqual(m.pasos.map(p => p.id), ['rica', 'empobrecer', 'pobre', 'corte']);
  const c = m.pasos.map(p => combustion(p.mezcla, m.inicio.ft, m.inicio.potencia));
  assert.ok(c[0].lambda > 1.4, 'rica en altura: demasiado rica');
  assert.ok(Math.abs(c[1].lambda - LAMBDA.mejorPotencia) < 0.05, 'empobrecer: la mejor potencia');
  assert.ok(c[2].aspereza > 0.3 && !c[2].para, 'pobre: tose pero anda');
  assert.ok(c[3].para, 'corte: se para');
});

test('los textos del motor, del sonido y del tiempo están en es y en', () => {
  const claves = [
    'juego.motor', 'juego.motor.mezcla', 'juego.motor.magnetos', 'juego.motor.corte', 'juego.motor.rica', 'juego.motor.datos', 'juego.motor.guiado', 'juego.motor.manual', 'juego.motor.en_marcha',
    'juego.motor.arranco', 'juego.motor.se_paro', 'juego.sonido.si', 'juego.sonido.no', 'juego.tiempo', 'juego.tiempo.imc', 'juego.tiempo.imc.texto', 'juego.tiempo.imc.salir', 'juego.tiempo.oat',
    'juego.tiempo.altimetro.radio', 'juego.tiempo.altimetro.baja', 'juego.tiempo.altimetro.sube', 'juego.mc.mezcla.vivo',
    ...MOTOR_FAA.arranque.map(id => `juego.motor.arranque.${id}`), ...MOTOR_FAA.apagado.map(id => `juego.motor.apagado.${id}`),
    ...['magnetos', 'combustible', 'corte', 'pobre'].map(m => `juego.motor.paro.${m}`),
    ...TIEMPOS.map(id => `juego.tiempo.${id}`), ...['nubes', 'frio', 'calido'].map(id => `juego.tiempo.${id}.texto`), 'juego.tiempo.frio.paso', 'juego.tiempo.calido.paso',
  ];
  for (const k of claves) assert.ok(k in es && k in en, k);
  // El altímetro por radio, en inglés en los dos idiomas (así se dice en la radio).
  assert.equal(es['juego.tiempo.altimetro.radio'], en['juego.tiempo.altimetro.radio']);
});
