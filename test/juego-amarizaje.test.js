// 0.14.113: el amarizaje (pedido del dueño: «ver tu capacidad de aterrizar en el agua con poco combustible y vivos»): el
// lago del mundo, el toque en el agua (no rebota, se frena y flota), el juez del amarizaje, la mini-clase con sus fuentes
// y que el motor se para al quedarse sin combustible.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearAvion, pasoVuelo, juzgarAmarizaje, juzgarAterrizaje, juzgarToque, enAgua, LAGO, PISTAS, enPista, ATERRIZAJE, AMARIZAJE, consejo } from '../public/clase/vuelo-modelo.js';
import { alturaSuelo, construirMundo, aguaLago, enAgua as enAguaMundo } from '../public/clase/juego-mundo.js';
import { crearMotor } from '../public/clase/motor-piston.js';
import { MINICLASES, AMARIZAJE_INICIO } from '../public/clase/juego-miniclases.js';
import { PALETAS } from '../public/clase/e3d-base.js';
import { PALETA_NOCHE } from '../public/clase/juego-noche.js';
import { ZONAS_JUEGO, ZONAS_LEJOS, MAPA_JUEGO, MAPA_LAGO, ZONAS_LAGO, mandosDeTeclas } from '../public/juego-vista.js';
import { limitesMapa } from '../public/clase/e3d-minimapa.js';

const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const VIENTO = { viento: { desde: 360, kt: 10 } };

// Un piloto simple: sin motor, mantiene la nariz en «cab» grados; por debajo de «flare» ft, la sube a «cabFlare».
function planear(a, { cab = 3, flare = 60, cabFlare = 6, asistente = true, seg = 900 } = {}) {
  for (let i = 0; i < seg * 60; i++) {
    let yugo = 0;
    if (!(a.pist?.enMarcha ?? true)) { const e = (a.ft < flare ? cabFlare : cab) - a.cabeceo; yugo = Math.abs(e) < 0.5 ? 0 : Math.max(-0.5, Math.min(0.5, e * 0.15)); }
    a = pasoVuelo(a, { potencia: a.potencia, cabeceo: yugo, flaps: 0 }, 1 / 60, { asistente, ambiente: VIENTO });
    if (a.toque) return a;
  }
  return a;
}
const inicio = (extra = {}) => ({ ...crearAvion({ ...AMARIZAJE_INICIO, ...extra }), pist: crearMotor() });

test('el lago: grande, plano (altura 0), lejos de las dos pistas, en el mundo (de día y de noche) y en los mapas', () => {
  assert.equal(enAgua, enAguaMundo);
  assert.ok(enAgua(LAGO.x, LAGO.z) && enAgua(LAGO.x, LAGO.z + LAGO.az * 0.95) && !enAgua(LAGO.x + LAGO.ax * 1.05, LAGO.z));
  assert.ok((2 * LAGO.ax) / 6.076 > 2 && (2 * LAGO.az) / 6.076 > 5, 'unos 2.3 × 5.9 NM');
  for (let x = LAGO.x - LAGO.ax; x <= LAGO.x + LAGO.ax; x += 0.5) for (let z = LAGO.z - LAGO.az; z <= LAGO.z + LAGO.az; z += 0.5) if (enAgua(x, z)) assert.equal(alturaSuelo(x, z), 0, `plano en ${x},${z}`);
  // Ninguna pista toca el agua (ni sus cabeceras, con 1 NM de margen).
  for (const p of PISTAS) for (let k = -1; k <= 1; k += 0.25) {
    const h = (p.rumbo * Math.PI) / 180, d = (k * (p.largoFt / 2 + 6076)) / 1000;
    assert.ok(!enAgua(p.x + Math.sin(h) * d, p.z + Math.cos(h) * d), `pista ${p.id}`);
  }
  // El relieve sigue lejos del lago (no se aplanó todo).
  assert.ok(alturaSuelo(20, -20) > 0 || alturaSuelo(25, 10) > 0);
  for (const paleta of [PALETAS.claro, PALETA_NOCHE]) {
    const agua = construirMundo(paleta).filter(q => q.c === paleta.agua && q.capa === 'calco');
    assert.ok(agua.length >= 40, 'el agua en trozos chicos');
    for (const q of agua) { assert.ok(q.p.length >= 3 && q.p.every(v => Number.isFinite(v[0]) && v[1] > 0 && v[1] < 0.001 && enAgua(v[0] * 0.999 + LAGO.x * 0.001, v[2] * 0.999 + LAGO.z * 0.001))); }
  }
  assert.ok(aguaLago(PALETAS.claro).length > 0);
  for (const zonas of [ZONAS_JUEGO, ZONAS_LEJOS]) assert.ok(zonas.some(z => z.tipo === 'agua' && z.c[0] === LAGO.x && z.rz === LAGO.az));
  // (el agua no cambia lo que abarca el mapa de cerca)
  assert.deepEqual(limitesMapa(MAPA_JUEGO, ZONAS_JUEGO), limitesMapa(MAPA_JUEGO, ZONAS_JUEGO.filter(z => z.tipo !== 'agua')));
  // El mapa de la mini-clase abarca desde el comienzo hasta el final del lago.
  const L = limitesMapa(MAPA_LAGO, ZONAS_LAGO);
  assert.ok(L.z0 <= AMARIZAJE_INICIO.z && L.z1 >= LAGO.z + LAGO.az && L.x0 <= LAGO.x && L.x1 >= 0);
  assert.ok(Math.max(L.x1 - L.x0, L.z1 - L.z0) >= Math.max(LAGO.x + LAGO.ax, 0) - (LAGO.x - LAGO.ax), 'cabe todo el lago a lo ancho');
  const css = readFileSync(new URL('../public/clase/clase.css', import.meta.url), 'utf8');
  assert.match(css, /\.clase-sit-mapa-agua \{ fill: var\(--mapa-agua\)/);
});

test('sin combustible el motor se para (en un minuto, con 0.1 gal) y no hay empuje', () => {
  let a = inicio(), parado = null;
  for (let i = 0; i < 120 * 60 && parado == null; i++) { a = pasoVuelo(a, { potencia: 0.5 }, 1 / 60, { asistente: true, ambiente: VIENTO }); if (!a.pist.enMarcha) parado = a.t; }
  assert.ok(parado > 40 && parado < 80, `se para a los ${parado?.toFixed(0)} s`);
  assert.equal(a.combustible, 0); assert.equal(a.pist.motivo, 'combustible');
  // Ya parado: aun con toda la potencia pedida, las RPM son las del molinete y la nariz tiene que bajar para no perder velocidad.
  let b = a;
  for (let i = 0; i < 20 * 60; i++) b = pasoVuelo(b, { potencia: 1, cabeceo: 0 }, 1 / 60, { asistente: true, ambiente: VIENTO });
  assert.ok(!b.pist.enMarcha && b.rpm < 1000, `RPM ${b.rpm.toFixed(0)}`);
  assert.ok(b.vs < -200 && b.ft < a.ft - 50, `planea: ${b.vs.toFixed(0)} ft/min`);
  // Sin el motor de pistón (el de antes), igual: con 0 gal no hay potencia.
  let c = { ...crearAvion({ ft: 3000, kt: 85, potencia: 1, enSuelo: false, combustible: 0 }) };
  for (let i = 0; i < 20 * 60; i++) c = pasoVuelo(c, { potencia: 1 }, 1 / 60);
  assert.ok(c.ft < 3000 - 50 && c.rpm < 1000);
  assert.equal(crearAvion({ combustible: 0.3 }).combustible, 0.3);
  assert.equal(crearAvion().combustible, 40, 'sin decirlo, los tanques llenos');
});

test('el amarizaje bien hecho: planear, sobre el agua subir la nariz suave → con vida; el avión se frena y flota', () => {
  const a = planear(inicio());
  assert.ok(a.toque?.agua, 'toca en el lago');
  assert.equal(a.toque.rebote, undefined, 'en el agua no rebota');
  assert.equal(a.toque.dentro, false);
  const j = juzgarToque(a.toque, { choque: a.choque });
  assert.equal(j.nivel, 'amarizaje_vivos', JSON.stringify(a.toque));
  assert.ok(j.puntos > 0);
  // Se frena en pocos segundos y queda flotando (no despega otra vez, ni con toda la potencia).
  let b = a;
  for (let i = 0; i < 8 * 60; i++) b = pasoVuelo(b, { potencia: 1, cabeceo: 1 }, 1 / 60, { ambiente: VIENTO });
  assert.ok(b.enSuelo && b.agua && b.kt < 1 && b.ft === 0, `kt ${b.kt.toFixed(1)}`);
  assert.equal(consejo(b), 'flotando');
  // Los pasos 2 y 3 de la mini-clase también terminan en el agua.
  const mc = MINICLASES.find(m => m.id === 'amarizaje');
  for (const p of mc.pasos.filter(x => x.inicio)) {
    const c = planear(inicio(p.inicio));
    assert.ok(c.toque?.agua, `${p.id}: en el lago`);
    assert.equal(juzgarToque(c.toque).nivel, 'amarizaje_vivos', p.id);
  }
});

test('con el teclado (como en el navegador): mirando el estado 5 veces por segundo, cada paso termina con vida', () => {
  // El piloto de la demostración: lee el cabeceo y la altura redondeados cada 0.2 s y toca ↓ (tirar) o ↑ (empujar) 0.1 s
  // para mantener la nariz en +3°; por debajo de 60 ft la lleva a +6° (el «flare»). Sin tocar la potencia ni los flaps.
  const mc = MINICLASES.find(m => m.id === 'amarizaje');
  for (const p of mc.pasos) {
    let a = inicio(p.inicio ?? {});
    const mandos = { cabeceo: 0, alabeo: 0, potencia: a.potencia };
    let teclas = new Set(), reloj = 0, toque = 0;
    for (let i = 0; i < 900 * 60 && !a.toque; i++) {
      reloj += 1 / 60; toque -= 1 / 60;
      if (reloj >= 0.2) {
        reloj = 0; teclas = new Set(); toque = 0.1;
        const cab = Math.round(a.cabeceo * 10) / 10, ft = Math.round(a.ft * 10) / 10;
        const meta = ft < 60 ? 6 : 3;
        if (!a.pist.enMarcha) { if (cab < meta - 1) teclas.add('ArrowDown'); else if (cab > meta + 1) teclas.add('ArrowUp'); }
      }
      if (toque <= 0) teclas.clear();
      const k = mandosDeTeclas(teclas, mandos, 1 / 60); mandos.cabeceo = k.cabeceo; mandos.alabeo = k.alabeo;
      a = pasoVuelo(a, { ...mandos, flaps: 0 }, 1 / 60, { asistente: true, ambiente: { viento: mc.viento } });
    }
    assert.ok(a.toque?.agua, `${p.id}: en el lago`);
    assert.equal(juzgarToque(a.toque, { choque: a.choque }).nivel, 'amarizaje_vivos', `${p.id}: ${JSON.stringify(a.toque)}`);
    assert.ok(Math.abs(a.z - LAGO.z) < LAGO.az - 4, `${p.id}: lejos de la orilla (z ${a.z.toFixed(1)})`);
  }
});

test('el amarizaje mal hecho: en picada es choque; rápido y con la nariz abajo, duro', () => {
  const picada = planear(inicio(), { cab: -9, cabFlare: -9 });
  assert.ok(picada.toque?.agua && picada.choque);
  assert.equal(juzgarToque(picada.toque, { choque: picada.choque }).nivel, 'choque');
  assert.deepEqual(juzgarAmarizaje(picada.toque, { choque: true }).motivos, ['choque_agua']);
  // Sin subir la nariz al final: toca rápido.
  const sinFlare = planear(inicio(), { cab: -1, flare: 0 });
  const j = juzgarToque(sinFlare.toque, { choque: sinFlare.choque });
  assert.ok(sinFlare.toque.agua && j.nivel !== 'amarizaje_vivos', `${j.nivel} ${JSON.stringify(sinFlare.toque)}`);
  // El juez, con los mismos números del juez de la pista.
  const bien = { kt: 60, vs: -300, alabeo: 0, cabeceo: 4, agua: true };
  assert.equal(juzgarAmarizaje(bien).nivel, 'amarizaje_vivos');
  assert.deepEqual(juzgarAmarizaje({ ...bien, vs: -(ATERRIZAJE.vsDuroFpm + 1) }).motivos, ['descenso_agua']);
  assert.deepEqual(juzgarAmarizaje({ ...bien, alabeo: ATERRIZAJE.alabeoMax + 1 }).motivos, ['alas_agua']);
  assert.deepEqual(juzgarAmarizaje({ ...bien, cabeceo: -1 }).motivos, ['nariz']);
  assert.deepEqual(juzgarAmarizaje({ ...bien, kt: ATERRIZAJE.ktMax + 1 }).motivos, ['rapido_agua']);
  assert.equal(juzgarAmarizaje({ ...bien, vs: -ATERRIZAJE.vsDuroFpm, alabeo: -ATERRIZAJE.alabeoMax, cabeceo: 0, kt: ATERRIZAJE.ktMax }).nivel, 'amarizaje_vivos', 'en el límite, con vida');
  assert.equal(AMARIZAJE.vsMaxFpm, 600); assert.equal(AMARIZAJE.alabeoMax, 8); assert.equal(AMARIZAJE.ktMax, 75);
  assert.equal(juzgarAmarizaje(null), null);
});

test('en tierra, fuera de la pista, todo sigue como antes (el juez de la pista, el rebote del toque duro)', () => {
  // A 3 NM al este de la pista A, sobre el pasto.
  let a = { ...crearAvion({ x: 18, z: 0, ft: 40, kt: 62, potencia: 0, enSuelo: false }), gamma: -0.03 };
  for (let i = 0; i < 60 * 60 && !a.toque; i++) a = pasoVuelo(a, { potencia: 0 }, 1 / 60);
  assert.ok(a.toque && !a.toque.agua && !enAgua(a.x, a.z));
  assert.equal(juzgarToque(a.toque).nivel, 'fuera');
  assert.deepEqual(juzgarToque(a.toque), juzgarAterrizaje(a.toque));
  // En la pista, igual que antes.
  const t = { kt: 60, vs: -200, alabeo: 0, cabeceo: 4, costado: 3, dentro: true };
  assert.equal(juzgarToque(t).nivel, 'bueno');
  // Un toque duro en tierra rebota; en el agua no.
  let duro = { ...crearAvion({ x: 18, z: 0, ft: 15, kt: 65, enSuelo: false }), gamma: -0.12, vs: -800 };
  for (let i = 0; i < 10 * 60 && !duro.toque; i++) duro = pasoVuelo(duro, { potencia: 0 }, 1 / 60);
  assert.ok(duro.toque.rebote, 'en tierra rebota');
  let agua = { ...crearAvion({ x: LAGO.x, z: LAGO.z, ft: 15, kt: 65, enSuelo: false }), gamma: -0.12, vs: -800 };
  for (let i = 0; i < 10 * 60 && !agua.toque; i++) agua = pasoVuelo(agua, { potencia: 0 }, 1 / 60);
  assert.ok(agua.toque.agua && !agua.toque.rebote && agua.enSuelo);
  assert.ok(!enPista(LAGO.x, LAGO.z).dentro);
});

test('la mini-clase del amarizaje: 3 pasos con su texto (es y en), sus fuentes de la FAA y poco combustible', () => {
  const mc = MINICLASES.find(m => m.id === 'amarizaje');
  assert.ok(mc && !mc.congelar && mc.viento.desde === 360 && mc.viento.kt > 0);
  assert.equal(mc.fuente, 'AFH cap. 3 · cap. 18 · AIM 6-3-2 · 6-3-3');
  assert.ok(mc.inicio.ft >= 2500 && mc.inicio.ft <= 3000 && mc.inicio.kt >= 80 && mc.inicio.kt <= 90 && mc.inicio.combustible > 0 && mc.inicio.combustible < 0.5);
  assert.ok(!enAgua(mc.inicio.x, mc.inicio.z) && enAgua(mc.inicio.x, mc.inicio.z + 20), 'empieza al sur del lago, mirando al agua');
  assert.equal(mc.mapa, 'lago');
  assert.deepEqual(mc.pasos.map(p => p.id), ['planear', 'viento', 'tocar']);
  for (const p of mc.pasos) for (const k of [`juego.mc.amarizaje.${p.id}`, `juego.mc.amarizaje.${p.id}.clave`]) assert.ok(es[k] && en[k], k);
  for (const k of ['titulo', 'linea']) assert.ok(es[`juego.mc.amarizaje.${k}`] && en[`juego.mc.amarizaje.${k}`]);
  // Lo que dicen los textos sale de la FAA: AIM 6-3-2 (MAYDAY, 7700, ELT, cerca de un barco), AIM 6-3-3 (de frente al
  // viento), AFH cap. 18 (velocidad mínima, actitud normal, flota varios minutos) y AFH cap. 3 (mejor planeo).
  assert.match(es['juego.mc.amarizaje.planear'], /MAYDAY.*7700.*ELT.*barco/s);
  assert.match(es['juego.mc.amarizaje.planear'], /best glide/);
  assert.match(es['juego.mc.amarizaje.viento.clave'], /de frente al viento/);
  assert.match(es['juego.mc.amarizaje.tocar'], /velocidad mínima.*actitud normal de aterrizaje/s);
  assert.match(es['juego.mc.amarizaje.tocar.clave'], /varios minutos/);
  // El resultado y sus consejos, en los dos idiomas.
  for (const k of ['juego.res.amarizaje_vivos', 'juego.res.amarizaje_duro', 'juego.consejo.flotando', 'juego.clase.repetir',
    ...['amarizaje_vivos', 'descenso_agua', 'alas_agua', 'nariz', 'rapido_agua', 'choque_agua'].map(m => `juego.res.consejo.${m}`)]) assert.ok(es[k] && en[k], k);
});

test('la vista: el juez del toque (agua o pista), el choque en el agua, el paso con su combustible y el estado para leer', () => {
  const vista = readFileSync(new URL('../public/juego-vista.js', import.meta.url), 'utf8');
  assert.match(vista, /const juicio = juzgarToque\(avion\.toque/);
  assert.match(vista, /avion\.toque\?\.agua \? juzgarAmarizaje\(avion\.toque, \{ choque: true \}\)/);
  assert.match(vista, /const ini = \{ \.\.\.mc\.inicio, \.\.\.\(paso\.inicio \?\? \{\}\) \}/);
  assert.match(vista, /function pintarEstado\(L\)/);
  for (const k of ['kt', 'ft', 'vs', 'rumbo', 'cabeceo', 'alabeo', 'en-agua', 'motor', 'combustible']) assert.ok(vista.includes(`'${k}'`) || vista.includes(` ${k}:`), k);
  assert.ok(!/window\.\w+\s*=/.test(vista), 'sin globales');
});

test('con cuadros lentos (varios sub-pasos por cuadro) el toque no se pierde: el juez y el resultado salen igual', () => {
  let a = { ...crearAvion({ x: LAGO.x, z: LAGO.z, ft: 3, kt: 60, enSuelo: false }), gamma: -0.02, cabeceo: 3 };
  let toque = null;
  for (let i = 0; i < 40 && !toque; i++) { a = pasoVuelo(a, { potencia: 0 }, 0.25); toque = a.toque; }
  assert.ok(toque?.agua, 'el toque llega aunque haya pasado en un sub-paso del medio');
  assert.ok(a.enSuelo);
});
