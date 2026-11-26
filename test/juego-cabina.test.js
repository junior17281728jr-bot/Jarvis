// 0.14.118: la cabina más real (pedido del dueño: «la cabina por dentro hazlo más real… del mismo avión»), los botones que
// responden al primer toque, la página sin zoom, el menú (la hoja), el tiempo y el viento a mano, la turbulencia, los
// flaps de a una muesca y los frenos.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dibujarCabina, dibujarLadoCabina, geometriaCabina, posicionesAbajo, FLAPS_GRADOS, flapsAGrados } from '../public/clase/cabina.js';
import { crearAvion, pasoVuelo, sustentacion, lecturas, VUELO, alfaNivel } from '../public/clase/vuelo-modelo.js';
import { TIEMPOS, TIEMPO_FAA, condiciones, nivelTurbulencia, mangaDeViento, nubesDe, MANGA } from '../public/clase/juego-tiempo.js';
import { contenidoSinZoom, bloquearZoom, activarToques, SELECTOR_TOQUE } from '../public/clase/juego-tactil.js';
import { siguienteFlaps, anteriorFlaps, vientoConRafagas, VIENTO_RUMBOS, VIENTO_KT, miradaCabina, ORBITA, orbitaInicial, orbitaCentrada, arrastrarOrbita, zoomOrbita, aplicarOrbita, orbitarOjo, volverOrbita } from '../public/juego-vista.js';
import { ojoOrbita } from '../public/clase/motor3d.js';

const leer = r => readFileSync(new URL(`../public/${r}`, import.meta.url), 'utf8');
// Un lienzo de mentira que guarda cada llamada.
function contexto() {
  const ops = [];
  const base = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '',
    createLinearGradient: (...a) => { ops.push(['grad', ...a]); return { addColorStop() {} }; },
    createRadialGradient: (...a) => { ops.push(['grad', ...a]); return { addColorStop() {} }; } };
  const ctx = new Proxy(base, { get(o, k) { if (k in o) return o[k]; return (...a) => { ops.push([k, ...a]); }; }, set(o, k, v) { o[k] = v; return true; } });
  return { ctx, ops, numeros: () => ops.flatMap(o => o.slice(1).filter(x => typeof x === 'number')) };
}
const datos = (extra = {}) => lecturas({ ...crearAvion({ ft: 1650, kt: 95, enSuelo: false }), rumbo: 95, ...extra });
const EX = { potencia: 0.5, mezcla: 1, flaps: 0, flapsMando: 0, trim: 0, egt: 1300, ff: 8, luces: { nav: true, baliza: true, estrobo: false, aterrizaje: false, rodaje: false }, magnetos: 'BOTH', master: true };

test('la geometría de la cabina: el tablero, el techo (debajo de los botones) y la PC con radios', () => {
  const pc = geometriaCabina(2560, 1440, { escala: 2, techo: 200 });
  assert.ok(pc.ancha, 'la PC es ancha: radios, VOR, ventanas y el yugo del copiloto');
  assert.equal(pc.yp + pc.panel, 1440);
  assert.equal(pc.techo, 200, 'el techo baja hasta donde se le pide');
  const tel = geometriaCabina(624, 900, { escala: 1.6, techo: 5000 });
  assert.ok(!tel.ancha);
  assert.ok(tel.techo < tel.yp - 900 * 0.1, 'el techo nunca se come el parabrisas entero');
  assert.ok(geometriaCabina(624, 900, { escala: 1.6 }).techo >= 900 * 0.05, 'siempre hay un poco de techo');
  // El horizonte en 3/5 de lo que queda a la vista entre el techo y el tablero.
  const fov = 74, tablero = tel.panel / 900, t = tel.techo / 900, g = miradaCabina(fov, tablero, t), f = 0.5 / Math.tan((fov * Math.PI) / 360);
  const y = 0.5 - Math.tan((g * Math.PI) / 180) * f;
  assert.ok(Math.abs(y - (t + 0.6 * (1 - tablero - t))) < 1e-9);
});

test('la cabina: sin NaN en todas las pantallas y horas; los mandos dibujados se mueven con los de verdad', () => {
  for (const [w, h] of [[2560, 1440], [624, 900], [760, 624], [320, 360]]) for (const hora of ['dia', 'atardecer', 'noche']) {
    const { ctx, numeros, ops } = contexto();
    const panel = dibujarCabina(ctx, w, h, datos({ aviso: true }), { escala: 1.6, completo: true, hora, yugo: { alabeo: 0.5, cabeceo: 0.3 }, techo: 90, extras: EX });
    assert.ok(panel > 0 && panel < h);
    assert.ok(numeros().every(Number.isFinite), `${w}x${h} ${hora}: sin NaN`);
    assert.ok(ops.some(o => o[0] === 'fillText' && o[1] === 'STALL'));
  }
  // El yugo gira con el alabeo (40° a fondo) y baja (se acerca) al tirar.
  const giro = al => { const { ctx, ops } = contexto(); dibujarCabina(ctx, 2560, 1440, datos(), { escala: 2, completo: true, yugo: { alabeo: al, cabeceo: 0 }, extras: EX }); return ops.filter(o => o[0] === 'rotate').map(o => o[1]); };
  assert.ok(giro(0.5).some(r => Math.abs(r - (20 * Math.PI) / 180) < 1e-9), 'medio alabeo: el volante gira 20°');
  assert.ok(giro(-1).some(r => Math.abs(r + (40 * Math.PI) / 180) < 1e-9), 'a fondo a la izquierda: −40°');
  const yYugo = cab => { const { ctx, ops } = contexto(); dibujarCabina(ctx, 2560, 1440, datos(), { escala: 2, completo: true, yugo: { alabeo: 0, cabeceo: cab }, extras: EX }); return ops.filter(o => o[0] === 'translate').at(-1)[2]; };
  assert.ok(yYugo(1) > yYugo(0) && yYugo(0) > yYugo(-1), 'tirar acerca el volante (más abajo); empujar lo aleja');
  // La palanca de potencia: con más potencia entra (la perilla queda más arriba, más cerca del tablero).
  const G = geometriaCabina(2560, 1440, { escala: 2 }), P = posicionesAbajo(G);
  const perilla = pot => { const { ctx, ops } = contexto(); dibujarCabina(ctx, 2560, 1440, datos(), { escala: 2, completo: true, extras: { ...EX, potencia: pot } }); return ops.filter(o => o[0] === 'ellipse' && Math.abs(o[1] - P.gases) < 1e-6).at(-1)[2]; };
  assert.ok(perilla(1) < perilla(0), 'a fondo, la palanca entra');
  // Los interruptores de las luces en su posición real (arriba = ON) y la llave en BOTH.
  const { ctx, ops } = contexto();
  dibujarCabina(ctx, 2560, 1440, datos(), { escala: 2, completo: true, extras: EX });
  for (const k of ['MASTER', 'MAGNETOS', 'BCN', 'NAV', 'STROBE', 'THROTTLE', 'MIXTURE', 'CARB HEAT', 'FLAPS', 'TRIM', 'COM1 118.300', 'XPDR 1200']) assert.ok(ops.some(o => o[0] === 'fillText' && o[1] === k), k);
  // La brújula: la tarjeta muestra los rumbos alrededor del de ahora (95°: el 6, la E y el 12).
  const textos = ops.filter(o => o[0] === 'fillText').map(o => o[1]);
  for (const s of ['6', 'E', '12', '095']) assert.ok(textos.includes(s), s);
});

test('la cabina guarda lo fijo en lienzos aparte (una vez) y cada cuadro solo pinta lo que se mueve', () => {
  let creados = 0;
  const crearLienzo = (w, h) => { creados++; const c = contexto(); return { width: w, height: h, getContext: () => c.ctx }; };
  const pinta = (hora = 'dia', w = 1000) => { const { ctx, ops } = contexto(); dibujarCabina(ctx, w, 600, datos(), { escala: 1, completo: true, hora, crearLienzo, extras: EX, yugo: { alabeo: 0, cabeceo: 0 } }); return ops; };
  const a = pinta();
  assert.equal(creados, 2, 'el fondo y el vidrio');
  assert.equal(a.filter(o => o[0] === 'drawImage').length, 2);
  const directo = contexto(); dibujarCabina(directo.ctx, 1000, 600, datos(), { escala: 1, completo: true, extras: EX, yugo: { alabeo: 0, cabeceo: 0 } });
  assert.ok(a.length < directo.ops.length * 0.6, `con lo fijo guardado, mucho menos trabajo por cuadro (${a.length} de ${directo.ops.length})`);
  pinta();
  assert.equal(creados, 2, 'el mismo tamaño y la misma hora: no se rehace');
  pinta('noche');
  assert.equal(creados, 4, 'de noche se rehace (la luz cambia)');
});

test('los flaps de a una muesca (UP · 10 · 20 · 30): el modelo los usa (más sustentación y más resistencia)', () => {
  assert.deepEqual([...FLAPS_GRADOS], [0, 10, 20, 30]);
  assert.deepEqual([0, 0.5, 1, 1.5].map(flapsAGrados), [0, 10, 20, 30]);
  assert.equal(siguienteFlaps(0), 0.5); assert.equal(siguienteFlaps(1), 1.5); assert.equal(siguienteFlaps(1.5), 0);
  assert.equal(anteriorFlaps(1.5), 1); assert.equal(anteriorFlaps(0), 0);
  // 20° (1) es lo de siempre; true, también.
  assert.equal(sustentacion(VUELO.alfaPerdida, true), sustentacion(VUELO.alfaPerdida, 1));
  const cl = [0, 0.5, 1, 1.5].map(f => sustentacion(VUELO.alfaPerdida, f));
  for (let i = 1; i < 4; i++) assert.ok(cl[i] > cl[i - 1], 'cada muesca da algo más de sustentación máxima');
  assert.ok(cl[3] - cl[2] < cl[2] - cl[1], 'los últimos 10° dan poca (sobre todo resistencia)');
  assert.ok(alfaNivel(65, 1.5) < alfaNivel(65, 0));
  // Planeando sin potencia, con 30° cae más rápido que sin flaps (más resistencia).
  const vuela = f => { let a = { ...crearAvion({ ft: 3000, kt: 70, enSuelo: false, flaps: f }) }; for (let i = 0; i < 30 * 60; i++) a = pasoVuelo(a, { potencia: 0, flaps: f }, 1 / 60, { asistente: true }); return a; };
  assert.ok(vuela(1.5).ft < vuela(0).ft, 'con 30° baja más');
});

test('los frenos: frenan en la pista; con el freno de mano y potencia a fondo, el avión no se mueve', () => {
  const rodar = freno => { let a = { ...crearAvion({}), kt: 40 }; for (let i = 0; i < 3 * 60; i++) a = pasoVuelo(a, { potencia: 0, freno }, 1 / 60); return a.kt; };
  assert.ok(rodar(1) < rodar(0) - 10, `frena (${rodar(1).toFixed(1)} contra ${rodar(0).toFixed(1)} kt)`);
  let a = crearAvion({});
  for (let i = 0; i < 10 * 60; i++) a = pasoVuelo(a, { potencia: 1, freno: 1 }, 1 / 60);
  assert.ok(a.kt < 0.5 && a.enSuelo, 'quieto');
});

test('el tiempo: Lluvia y Niebla (PHAK cap. 12), con sus nubes; la turbulencia según el tiempo, el viento y la hora', () => {
  assert.ok(TIEMPOS.includes('lluvia') && TIEMPOS.includes('niebla'));
  for (const id of TIEMPOS) if (id !== 'despejado') assert.ok(TIEMPO_FAA[id]?.fuente, `${id}: su fuente`);
  const ll = condiciones('lluvia', 0, 0, 1000), llDentro = condiciones('lluvia', 0, 0, 3000);
  assert.ok(ll.lluvia > 0.5 && ll.visibilidad < 30 && ll.viento.rafagas > ll.viento.kt && !ll.dentro);
  assert.ok(llDentro.dentro, 'dentro de la capa');
  const suelo = condiciones('niebla', 0, 0, 0), arriba = condiciones('niebla', 0, 0, 1500);
  assert.ok(suelo.visibilidad < 5 && arriba.visibilidad > 30, 'abajo casi no se ve; arriba de la capa, sí');
  assert.ok(suelo.viento.kt <= TIEMPO_FAA.niebla.vientoMaxKt, 'la niebla de radiación: casi sin viento');
  assert.ok(nubesDe('lluvia').length > 50);
  // La turbulencia: en el suelo, nada; despejado de noche, nada; de día, un poco (térmicas); más con viento fuerte cerca del
  // suelo; más dentro de las nubes; la tormenta, lo máximo.
  const T = (t, ft, extra = {}) => nivelTurbulencia(condiciones(t, 0, 16, ft), { ft, ...extra });
  assert.equal(T('despejado', 2000, { enSuelo: true }), 0);
  assert.equal(T('despejado', 2000, { hora: 'noche' }), 0);
  const termica = T('despejado', 2000);
  assert.ok(termica > 0 && termica < 0.1, 'suave');
  assert.ok(T('despejado', 300, { viento: { kt: 25, rafagas: 35 } }) > termica, 'con viento fuerte, más');
  assert.ok(T('nubes', 3500) > T('nubes', 1500), 'dentro de la nube, más');
  assert.ok(T('frio', 2000) > 0.8, 'en la línea de tormentas, fuerte');
});

test('el viento a mano: 8 rumbos y de 0 a 25 kt; las ráfagas suben y bajan (hasta 1.6 veces), nunca por debajo', () => {
  assert.deepEqual(VIENTO_RUMBOS.map(r => r[0]), [360, 45, 90, 135, 180, 225, 270, 315]);
  assert.deepEqual([...VIENTO_KT], [0, 5, 10, 15, 20, 25]);
  let min = 99, max = 0;
  for (let t = 0; t < 120; t += 0.1) { const v = vientoConRafagas({ desde: 270, kt: 10, rafagas: true }, t); min = Math.min(min, v.kt); max = Math.max(max, v.kt); assert.equal(v.desde, 270); }
  assert.ok(min >= 10 - 1e-9 && max <= 16 + 1e-9 && max > 14);
  assert.equal(vientoConRafagas({ desde: 90, kt: 12, rafagas: false }, 5).kt, 12);
  assert.deepEqual(vientoConRafagas(null, 0), { desde: 360, kt: 0 });
  // La manga: apunta hacia donde va el viento, llena con 15 kt, colgando sin viento.
  const punta = v => mangaDeViento(v, 0).at(-1).p;
  const del_oeste = punta({ desde: 270, kt: 20 });
  assert.ok(del_oeste[0] > MANGA.x + 0.008, 'viento del oeste: la manga apunta al este');
  const calma = punta({ desde: 270, kt: 0 });
  assert.ok(calma[1] < del_oeste[1], 'sin viento, cuelga');
});

test('la página sin zoom mientras se vuela (y como estaba al salir); los botones al primer toque, aunque otro dedo esté en el yugo', () => {
  assert.equal(contenidoSinZoom('width=device-width,initial-scale=1,viewport-fit=cover'), 'width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no');
  assert.equal(contenidoSinZoom('width=device-width, maximum-scale=5, user-scalable=yes'), 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
  // Un documento de mentira.
  const escuchas = [];
  const meta = { c: 'width=device-width,initial-scale=1,viewport-fit=cover', getAttribute() { return this.c; }, setAttribute(_k, v) { this.c = v; }, removeAttribute() { this.c = null; } };
  const doc = { querySelector: () => meta, addEventListener: (t, f) => escuchas.push(t), removeEventListener: t => escuchas.splice(escuchas.indexOf(t), 1) };
  const raizZ = { addEventListener: (t) => escuchas.push(`raiz:${t}`), removeEventListener: t => escuchas.splice(escuchas.indexOf(`raiz:${t}`), 1) };
  let cuadro = null;
  const z = bloquearZoom(doc, raizZ, { ventana: { visualViewport: { scale: 2 }, requestAnimationFrame: f => { cuadro = f; } } });
  assert.match(meta.c, /maximum-scale=1/); assert.match(meta.c, /user-scalable=no/);
  cuadro?.();
  assert.equal(meta.c, 'width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no', 'la escala vuelve a 1');
  for (const g of ['gesturestart', 'gesturechange', 'gestureend', 'raiz:touchend', 'raiz:touchmove', 'raiz:dblclick']) assert.ok(escuchas.includes(g), g);
  z.destruir();
  assert.equal(meta.c, 'width=device-width,initial-scale=1,viewport-fit=cover', 'al salir, como estaba');
  assert.equal(escuchas.length, 0);

  // Los toques: el botón se aprieta al levantar el dedo (con el otro dedo en el yugo) y el «click» del navegador que llega
  // después no lo aprieta otra vez.
  const h = {};
  const raiz = { addEventListener: (t, f) => { h[t] = f; }, removeEventListener: t => { delete h[t]; }, contains: () => true };
  let veces = 0;
  const boton = { disabled: false, getAttribute: () => null, click() { veces++; }, closest: s => (s === SELECTOR_TOQUE ? boton : null) };
  const yugo = { closest: () => null };
  let ahora = 1000;
  activarToques(raiz, { reloj: () => ahora });
  h.pointerdown({ pointerType: 'touch', pointerId: 1, target: yugo, clientX: 300, clientY: 300 });
  h.pointerdown({ pointerType: 'touch', pointerId: 2, target: boton, clientX: 50, clientY: 50 });
  h.pointerup({ pointerType: 'touch', pointerId: 2, target: boton, clientX: 52, clientY: 51 });
  assert.equal(veces, 1, 'al levantar el dedo');
  let frenado = false;
  ahora += 120;
  h.click({ isTrusted: true, clientX: 52, clientY: 51, preventDefault() { frenado = true; }, stopImmediatePropagation() {} });
  assert.ok(frenado, 'el click repetido se descarta');
  // Un dedo que se corre (desplazar) no aprieta; el ratón sigue con el click de siempre.
  h.pointerdown({ pointerType: 'touch', pointerId: 3, target: boton, clientX: 50, clientY: 50 });
  h.pointermove({ pointerType: 'touch', pointerId: 3, clientX: 50, clientY: 90 });
  h.pointerup({ pointerType: 'touch', pointerId: 3, target: boton, clientX: 50, clientY: 90 });
  h.pointerdown({ pointerType: 'mouse', pointerId: 4, target: boton, clientX: 50, clientY: 50 });
  h.pointerup({ pointerType: 'mouse', pointerId: 4, target: boton, clientX: 50, clientY: 50 });
  assert.equal(veces, 1);
  let frenado2 = false;
  ahora += 5000;
  h.click({ isTrusted: true, clientX: 50, clientY: 50, preventDefault() { frenado2 = true; }, stopImmediatePropagation() {} });
  assert.ok(!frenado2, 'un click de ratón (o de VoiceOver) pasa');
});

test('el Menú: una hoja opaca sobre todo, que se desplaza, con todas las opciones (hora, tiempo, viento) y «Cerrar»', () => {
  const css = leer('juego.css'), vista = leer('juego-vista.js');
  const bloque = sel => { const i = css.lastIndexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
  assert.match(bloque('.juego-hoja-capa'), /z-index: 8/);
  for (const z of [...css.matchAll(/z-index: (\d+)/g)].map(m => Number(m[1])).filter(z => z !== 1000)) assert.ok(z <= 8, 'nada del Juego queda encima de la hoja (1000: el Juego mismo)');
  assert.match(bloque('.juego-hoja-cuerpo'), /overflow: auto/);
  assert.match(bloque('.juego-hoja-cuerpo'), /min-height: 0/);
  assert.match(bloque('.juego-hoja'), /max-height: 100%/);
  assert.doesNotMatch(bloque('.juego-hoja'), /background: rgba/, 'opaca');
  // La hoja vive en la raíz (no dentro de la barra ni de la escena, que no se desplaza con el dedo).
  assert.match(vista, /'data-modo': modo \}, escenario, mandosTactiles, menuMas,/);
  assert.match(vista, /'juego-hoja-cuerpo juego-se-desplaza'/);
  for (const x of ['botonesHora', 'botonesTiempo', 'bVientoAuto', 'bRafagas', 'botonesVientoDir', 'botonesVientoKt', 'bCerrarMenu', 'bTrafico', 'bSonido']) assert.ok(vista.includes(x), x);
  assert.match(vista, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); abrirMenu\(false\); \}/);
  // Los botones: 44 px como mínimo, con la lucecita en los que se prenden.
  assert.match(bloque('.juego-vuelo .juego-boton'), /min-height: 44px/);
  assert.match(css, /\.juego-luz\[aria-pressed="true"\]::before/);
  assert.match(css, /\.juego-vuelo :is\(input, select, textarea\) \{ font-size: 16px; \}/, 'iOS no agranda al enfocar');
  // Los textos nuevos, en los dos idiomas.
  const es = JSON.parse(leer('i18n/es.json')), en = JSON.parse(leer('i18n/en.json'));
  for (const k of ['juego.menu', 'juego.menu.cerrar', 'juego.menu.hora', 'juego.componentes', 'juego.camara.cabina', 'juego.camara.afuera', 'juego.camara.cambiar', 'juego.flaps.grados', 'juego.flaps.a', 'juego.freno', 'juego.freno.mano', 'juego.mapa', 'juego.atajos', 'juego.trim', 'juego.trim.abajo', 'juego.trim.arriba',
    'juego.viento', 'juego.viento.auto', 'juego.viento.rafagas', 'juego.viento.ahora', 'juego.viento.calma', 'juego.viento.con_rafagas', 'juego.tiempo.lluvia.texto', 'juego.tiempo.niebla.texto', 'juego.ayuda.freno_tactil', 'juego.ayuda.freno_teclas',
    ...VIENTO_RUMBOS.map(r => `juego.viento.${r[1]}`)]) assert.ok(es[k] && en[k], k);
  // En la cabina no se usan marcas ni nombres de fabricantes.
  assert.doesNotMatch(leer('clase/cabina.js'), /cessna|piper|garmin|bendix|king/i);
});

test('0.14.119: la cámara libre (arrastrar, pellizco, centrar) con sus límites; la cabeza en la cabina', () => {
  let o = orbitaInicial();
  assert.ok(orbitaCentrada(o));
  o = arrastrarOrbita(o, -100, 40);
  assert.ok(o.giro > 30 && o.alto > 5 && !orbitaCentrada(o), 'arrastrar gira alrededor del avión y lo levanta');
  // Nunca debajo del suelo ni dando la vuelta por arriba: el ángulo total queda entre −4° y 75°.
  const bajo = aplicarOrbita({ giro: 0, alto: 9, dist: 0.075 }, arrastrarOrbita(orbitaInicial(), 0, -5000));
  const alto = aplicarOrbita({ giro: 0, alto: 9, dist: 0.075 }, arrastrarOrbita(orbitaInicial(), 0, 5000));
  assert.equal(bajo.alto, ORBITA.altoMin); assert.equal(alto.alto, ORBITA.altoMax);
  // El zoom: con límites, y nunca dentro del avión.
  assert.equal(zoomOrbita(orbitaInicial(), 100).zoom, ORBITA.zoomMax);
  assert.equal(zoomOrbita(orbitaInicial(), 0.001).zoom, ORBITA.zoomMin);
  assert.equal(zoomOrbita(orbitaInicial(), NaN).zoom, 1);
  assert.ok(aplicarOrbita({ giro: 0, alto: 9, dist: 0.04 }, { ...orbitaInicial(), zoom: ORBITA.zoomMin }).dist >= ORBITA.distMin);
  // Girar un ojo cualquiera (la repetición) sin cambiar nada con la órbita en el centro; con 180°, del otro lado.
  const mira = [1, 2, 3], ojo = ojoOrbita({ mira, giro: 30, alto: 10, dist: 0.09 });
  const igual = orbitarOjo(ojo, mira, orbitaInicial());
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(igual[i] - ojo[i]) < 1e-9);
  const otro = orbitarOjo(ojo, mira, { ...orbitaInicial(), giro: 180 });
  assert.ok(Math.abs((otro[0] - mira[0]) + (ojo[0] - mira[0])) < 1e-9 && Math.abs((otro[2] - mira[2]) + (ojo[2] - mira[2])) < 1e-9);
  // La cabeza: hasta 150° a cada lado, de −35° a 60°; arrastrar afuera no mueve la cabeza y al revés.
  const c = arrastrarOrbita(orbitaInicial(), 10000, -10000, { cabina: true });
  assert.equal(c.cabYaw, -ORBITA.cabezaYaw); assert.equal(c.cabPitch, ORBITA.cabezaPitchMin); assert.equal(c.giro, 0);
  // Vuelve sola (si se eligió): suave; con «menos movimiento», de una vez.
  const v = volverOrbita({ giro: 90, alto: 20, zoom: 2, cabYaw: 40, cabPitch: 10 }, 0.1);
  assert.ok(v.giro < 90 && v.giro > 0 && v.zoom < 2 && v.zoom > 1);
  assert.ok(orbitaCentrada(volverOrbita({ giro: 90, alto: 20, zoom: 2, cabYaw: 40, cabPitch: 10 }, 0.016, { reducir: true })));
  // Con la cabeza girada se dibuja el costado (la ventana con el ala y el montante), sin NaN.
  const { ctx, numeros } = contexto();
  for (const lado of [-1, 0, 1]) dibujarLadoCabina(ctx, 1000, 600, { escala: 1, lado, hora: 'noche', techo: 80 });
  assert.ok(numeros().every(Number.isFinite));
});

test('0.14.119: la escena ocupa toda la pantalla en el teléfono y los mandos flotan encima (la cabina deja libres sus relojes)', () => {
  const css = leer('juego.css'), vista = leer('juego-vista.js');
  assert.match(css, /\.juego-vuelo\[data-tactil="1"\] \.juego-escenario \{ position: absolute; inset: 0; \}/);
  assert.match(css, /\.juego-vuelo\[data-tactil="1"\] \.juego-mandos \{ position: absolute; inset: 0;[^}]*background: none; pointer-events: none; \}/);
  assert.match(css, /\.juego-panel > \* \{ pointer-events: auto; \}/);
  // Lo que tapan los mandos se mide y la cabina pone los relojes en lo libre.
  assert.match(vista, /function medirReserva/);
  const sin = geometriaCabina(1350, 624, { escala: 1.6 }), con = geometriaCabina(1350, 624, { escala: 1.6, reserva: { izq: 260, der: 300, abajo: 0 } });
  assert.ok(con.xs[0] - con.r * 1.2 > 260 && con.xm + con.r * 1.2 < 1350 - 300, 'los relojes, entre los mandos');
  const pie = geometriaCabina(624, 1350, { escala: 1.6, reserva: { abajo: 400 } });
  assert.ok(pie.tira + pie.alto1 / 2 <= 1350 - 400 + 1, 'de pie: el tablero termina encima de los mandos');
  assert.ok(sin.ancha !== undefined);
});
