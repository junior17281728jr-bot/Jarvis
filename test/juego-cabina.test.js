// 0.14.118: la cabina más real (pedido del dueño: «la cabina por dentro hazlo más real… del mismo avión»), los botones que
// responden al primer toque, la página sin zoom, el menú (la hoja), el tiempo y el viento a mano, la turbulencia, los
// flaps de a una muesca y los frenos.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dibujarCabina, dibujarLadoCabina, dibujarRelojesAfuera, ARCOS_KT, geometriaCabina, posicionesAbajo, FLAPS_GRADOS, flapsAGrados } from '../public/clase/cabina.js';
import { crearAvion, pasoVuelo, sustentacion, lecturas, VUELO, alfaNivel, LIMITES, tasaConCarga, invertido, alfaParaCarga, perdidaConCarga, juzgarAterrizaje } from '../public/clase/vuelo-modelo.js';
import { TIEMPOS, TIEMPO_FAA, condiciones, nivelTurbulencia, mangaDeViento, nubesDe, MANGA, corrienteVertical, rafagaDe, vientoTexto } from '../public/clase/juego-tiempo.js';
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
  for (let t = 0; t < 120; t += 0.1) { const v = vientoConRafagas({ desde: 270, kt: 10 }, 18, t); min = Math.min(min, v.kt); max = Math.max(max, v.kt); assert.equal(v.desde, 270); }
  assert.ok(min >= 10 - 1e-9 && max <= 18 + 1e-9 && max > 16);
  assert.equal(vientoConRafagas({ desde: 90, kt: 12 }, 12, 5).kt, 12);
  assert.equal(vientoConRafagas({ desde: 90, kt: 12 }, 5, 5).kt, 12, 'nunca por debajo del parejo');
  assert.deepEqual(vientoConRafagas(null, 0, 0), { desde: 360, kt: 0 });
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

test('0.14.119: la Tormenta (rayos, lluvia fuerte, turbulencia, ráfagas, corrientes, poca visibilidad; 20 NM, AIM 7-1-26)', () => {
  assert.ok(TIEMPOS.includes('tormenta'));
  assert.equal(TIEMPO_FAA.tormenta.evitarNM, 20); assert.match(TIEMPO_FAA.tormenta.fuente, /AIM 7-1-26/);
  const c = condiciones('tormenta', 0, 0, 1500), dentro = condiciones('tormenta', 0, 0, 3000);
  assert.ok(c.rayos && c.lluvia === 1 && c.turbulencia > 0.8 && c.viento.rafagas > c.viento.kt && c.visibilidad < 10 && c.gris > 0.8);
  assert.ok(dentro.dentro && dentro.turbulencia > c.turbulencia, 'dentro de la nube: sin horizonte y más turbulencia');
  assert.ok(nivelTurbulencia(c, { ft: 1500 }) > nivelTurbulencia(condiciones('nubes', 0, 0, 1500), { ft: 1500 }) + 0.5);
  let max = 0, min = 0;
  for (let t = 0; t < 200; t += 0.5) { const v = corrienteVertical('tormenta', t, 0.3, -2); max = Math.max(max, v); min = Math.min(min, v); }
  assert.ok(max > 800 && min < -800 && max <= 1500 && min >= -1500, 'sube y baja hasta ±1,500 ft/min');
  assert.equal(corrienteVertical('despejado', 10, 0, 0), 0);
  assert.ok(nubesDe('tormenta').length > 100);
  // Los textos: el consejo de la vida real (20 NM) en los dos idiomas.
  const es = JSON.parse(leer('i18n/es.json')), en = JSON.parse(leer('i18n/en.json'));
  assert.match(es['juego.tiempo.tormenta.texto'], /20 NM/); assert.match(en['juego.tiempo.tormenta.texto'], /20 NM/);
  // Los rayos: uno cada 3 s o más (nunca más de 3 por segundo) y, con «menos movimiento», sin destello.
  const vista = leer('juego-vista.js');
  assert.match(vista, /proximoRayo = tiempo \+ 3 \+/);
  assert.match(vista, /if \(reducir\) \{ ctx\.fillStyle = `rgba\(230,236,255/);
});

test('0.14.119: las ráfagas como interruptor aparte, con cualquier viento; el viento como en el METAR («270° 12G20 kt»)', () => {
  assert.equal(rafagaDe(12, false), 12);
  assert.equal(rafagaDe(12, true), 20);
  assert.equal(rafagaDe(25, true), 40);
  assert.equal(rafagaDe(0, true), 8, 'también con calma: ráfagas de hasta 8 kt');
  assert.equal(vientoTexto(270, 12, 20), '270° 12G20 kt');
  assert.equal(vientoTexto(360, 8, 8), '360° 8 kt');
  assert.equal(vientoTexto(0, 5), '360° 5 kt');
  const vista = leer('juego-vista.js');
  assert.match(vista, /rafagasOn = !rafagasOn/);
  assert.match(vista, /rafagaKt = rafagasOn \? rafagaDe\(base\.kt, true\)/);
});

test('0.14.119: el avión como el de verdad: sin topes sin el Asistente, el factor de carga, la pérdida acelerada, la VNE y el motor boca abajo', () => {
  const volar = (a, m, seg, op) => { for (let i = 0; i < seg * 60; i++) a = pasoVuelo(a, typeof m === 'function' ? m(a) : m, 1 / 60, op); return a; };
  const crucero = (extra = {}) => ({ ...crearAvion({ ft: 5000, kt: 110, potencia: 0.75, enSuelo: false }), ...extra });
  // Sin el Asistente se puede alabear más allá de 90° (y dar la vuelta); con él, 30° como siempre.
  const sin = volar(crucero(), { alabeo: 1, potencia: 0.75 }, 3);
  assert.ok(Math.abs(sin.alabeo) > 100, `sin Asistente, rola (${sin.alabeo.toFixed(0)}°)`);
  const con = volar(crucero(), { alabeo: 1, potencia: 0.75 }, 3, { asistente: true });
  assert.ok(Math.abs(con.alabeo) <= VUELO.maxAlabeoAsistente + 1e-9);
  // Un viraje de 60° sin tirar: baja y la nariz cae.
  const v60 = volar(crucero({ alabeo: 60 }), { potencia: 0.75 }, 6);
  assert.ok(v60.ft < 5000 - 100 && v60.cabeceo < -3 && v60.kt > 112, `sin tirar, baja y acelera (${v60.ft.toFixed(0)} ft, ${v60.cabeceo.toFixed(1)}°, ${v60.kt.toFixed(0)} kt)`);
  // Tirando en el viraje de 60° (manteniendo la altura) el factor de carga es ~1/cos 60° = 2 G.
  const sost = volar(crucero({ alabeo: 60, kt: 110 }), a => ({ potencia: 1, cabeceo: Math.max(-1, Math.min(1, (-a.vs) / 400)) }), 8);
  assert.ok(sost.g > 1.6 && sost.g < 2.6, `n ≈ 2 (${sost.g.toFixed(2)})`);
  assert.ok(Math.abs(tasaConCarga(60, 110, 2) - tasaConCarga(60, 110, 1) * 2) < 1e-9);
  // La pérdida acelerada: con n = 2, la pérdida a 48·√2 ≈ 68 kt.
  assert.ok(Math.abs(perdidaConCarga(2) - 48 * Math.SQRT2) < 1e-9);
  // Picada: la velocidad crece sola (la energía); pasa la VNE si se insiste.
  const pic = volar(crucero({ cabeceo: -30, gamma: -0.5 }), { potencia: 1, cabeceo: -0.3 }, 12);
  assert.ok(pic.kt > LIMITES.vneKt, `en picada pasa la VNE (${pic.kt.toFixed(0)} kt)`);
  // Los límites: +3.8 / −1.52 G (normal), 1.5 de seguridad, VNE 163 kt.
  assert.deepEqual([LIMITES.gMax, LIMITES.gMin, LIMITES.seguridad, LIMITES.vneKt], [3.8, -1.52, 1.5, 163]);
  // Con el Asistente, tirar fuerte a 155 kt no pasa de ~3.3 G (quien empieza no rompe el avión).
  let a = crucero({ kt: 155 }), gMax = 0;
  for (let i = 0; i < 4 * 60; i++) { a = pasoVuelo(a, { cabeceo: 1, potencia: 1 }, 1 / 60, { asistente: true }); gMax = Math.max(gMax, a.g); }
  assert.ok(gMax < LIMITES.gMax, `Asistente: ${gMax.toFixed(2)} G`);
  assert.ok(alfaParaCarga(3.3, 130) < 12);
  // Sin el Asistente, el mismo tirón pasa el límite.
  let b = crucero({ kt: 155 }), gB = 0;
  for (let i = 0; i < 4 * 60; i++) { b = pasoVuelo(b, { cabeceo: 1, potencia: 1 }, 1 / 60); gB = Math.max(gB, b.g); }
  assert.ok(gB > LIMITES.gMax, `sin Asistente: ${gB.toFixed(2)} G`);
  // Boca abajo el motor tose (el carburador por gravedad) y empuja poco.
  assert.ok(invertido({ alabeo: 180, cabeceo: 0, enSuelo: false }) && !invertido({ alabeo: 20, cabeceo: 5, enSuelo: false }));
  const boca = volar(crucero({ alabeo: 180 }), { potencia: 1, alabeo: 0 }, 1);
  assert.ok(boca.tose && boca.rugido > 0.5);
  // La pantalla: avisos (G, VNE, tose) y la consecuencia «estructura» (solo sin el Asistente).
  const vista = leer('juego-vista.js');
  assert.match(vista, /function limitesPaso\(dt\)/);
  assert.match(vista, /if \(!asistente && \(g > L\.gMax \* L\.seguridad \|\| g < L\.gMin \* L\.seguridad\)\) return roto\('sobrecarga'/);
  assert.match(vista, /if \(!asistente && \(avion\.kt > L\.vneRompeKt \|\| vneS > L\.vneSeg\)\) return roto\('vne'/);
  const es = JSON.parse(leer('i18n/es.json')), en = JSON.parse(leer('i18n/en.json'));
  for (const k of ['juego.limite.g', 'juego.limite.vne', 'juego.limite.tose', 'juego.res.estructura', 'juego.res.consejo.sobrecarga', 'juego.res.consejo.vne']) assert.ok(es[k] && en[k], k);
  // Los jueces del aterrizaje, iguales.
  assert.equal(juzgarAterrizaje({ kt: 60, vs: -200, alabeo: 0, costado: 5, dentro: true }).nivel, 'bueno');
});

test('0.14.121: la vista desde la cabina en el teléfono de lado (más afuera) y los relojes de afuera con sus arcos', () => {
  // De lado (escenario 844×390 a 1.6, con los mandos a los costados), el tablero compacto: más de la mitad para el parabrisas.
  const e = 1.6, W = 844 * e, H = 390 * e, techo = 64 * e, reserva = { izq: 170 * e, der: 200 * e, abajo: 0 };
  const grande = geometriaCabina(W, H, { escala: e, techo, reserva }), chico = geometriaCabina(W, H, { escala: e, techo, reserva, compacto: true });
  assert.ok((chico.yp - chico.techo) / H >= 0.5, `parabrisas ${((chico.yp - chico.techo) / H * 100).toFixed(0)} % del alto`);
  assert.ok(chico.yp > grande.yp, 'el tablero compacto es más bajo');
  assert.ok(chico.r * 2 * e >= 2 * 25 * e * 0.9, 'los relojes, chicos pero legibles');
  assert.ok(chico.xs[0] - chico.r > reserva.izq && chico.xm + chico.r < W - reserva.der, 'la fila de relojes, entre los mandos');
  const { ctx, ops, numeros } = contexto();
  dibujarCabina(ctx, W, H, datos(), { escala: e, completo: true, compacto: true, techo, reserva, extras: EX, yugo: { alabeo: 0.2, cabeceo: 0 } });
  assert.ok(numeros().every(Number.isFinite));
  for (const s of ['1,650', '095', 'KNOTS']) assert.ok(ops.some(o => o[0] === 'fillText' && o[1] === s), s);
  // El horizonte, más o menos en el medio de la pantalla.
  const fov = 62, g = miradaCabina(fov, (H - chico.yp) / H, chico.techo / H), f = 0.5 / Math.tan((fov * Math.PI) / 360);
  const y = 0.5 - Math.tan((g * Math.PI) / 180) * f;
  assert.ok(y > 0.38 && y < 0.55, `horizonte a ${(y * 100).toFixed(0)} % del alto`);
  // Los relojes de afuera: el velocímetro con los mismos arcos de la cabina, la aguja en su lugar y los kt en número.
  for (const [kt, amarillo, rojo] of [[95, false, false], [ARCOS_KT.verdeHasta + 5, true, false], [ARCOS_KT.vne + 4, false, true]]) {
    const c = contexto();
    const r = dibujarRelojesAfuera(c.ctx, 300, 78, lecturas({ ...crearAvion({ ft: 1500, enSuelo: false }), kt }), { escala: 1 });
    assert.deepEqual(r, { amarillo, rojo }, `${kt} kt`);
    assert.ok(c.numeros().every(Number.isFinite));
    assert.ok(c.ops.some(o => o[0] === 'fillText' && o[1] === String(kt)), 'los kt en número');
    assert.ok(c.ops.some(o => o[0] === 'fillText' && o[1] === '160'), 'la escala');
  }
  const vista = leer('juego-vista.js'), css = leer('juego.css');
  assert.match(vista, /dibujarRelojesAfuera\(hudCtx/);
  assert.match(vista, /const cabinaCompacta = \(\) => deLado\(\) && !panelGrande;/);
  assert.match(css, /\.juego-vuelo\[data-tenues="1"\]:not\(\[data-tocando="1"\]\) \.juego-panel \{ opacity: 0\.4;/);
  assert.match(css, /\.juego-chip\[data-viejo\] \{ opacity: 0;/);
  const es = JSON.parse(leer('i18n/es.json')), en = JSON.parse(leer('i18n/en.json'));
  for (const k of ['juego.panel_grande', 'juego.mandos_tenues', 'juego.instrumentos', 'juego.instrumentos.chicos', 'juego.instrumentos.grandes', 'juego.instrumentos.texto']) assert.ok(es[k] && en[k], k);
});

test('0.14.122: la sombra del avión (con el sol, según la altura), las marcas de la pista y el detalle del suelo', async () => {
  const { sombraAvion, luzDeSombra, alturaSobreSuelo, marcasPista, MARCAS_PISTA, detalleSuelo, DETALLE, SOMBRA } = await import('../public/clase/juego-suelo.js');
  const { PISTA, PISTA_B } = await import('../public/clase/vuelo-modelo.js');
  const av = ft => ({ x: 0.5, z: -6, ft, rumbo: 360, cabeceo: 0, alabeo: 0 });
  const alfa = ps => Math.max(...ps.map(q => q.a));
  const area = ps => { const q = ps[0].p; let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[2] - b[0] * a[2]; } return Math.abs(s) / 2; };
  const s50 = sombraAvion(av(50)), s600 = sombraAvion(av(600));
  assert.ok(s50.length >= 8, 'la silueta (ala, nariz, cola, estabilizador), en dos capas');
  assert.ok(alfa(s50) > alfa(s600) && alfa(s600) > 0, 'más alto, más clara');
  assert.ok(area(s600) > area(s50), 'más alto, más grande');
  assert.equal(sombraAvion(av(SOMBRA.hastaFt + 50)).length, 0, 'desde ~1,300 ft, nada');
  assert.ok(s50.every(q => q.capa === 'calco' && q.p.every(p => Math.abs(p[1] - 0.0011) < 1e-9)), 'en el suelo');
  // Con el sol del oeste-sur (el de la tarde), la sombra cae al este-norte del avión.
  const cx = s600[0].p.reduce((s, p) => s + p[0], 0) / s600[0].p.length;
  assert.ok(cx > 0.5, 'proyectada lejos del sol');
  // De noche casi nada; dentro de una nube, nada.
  assert.ok(luzDeSombra('noche') < 0.1 && luzDeSombra('dia') === 1 && luzDeSombra('dia', 0, true) === 0 && luzDeSombra('dia', 1) < 0.2);
  assert.ok(alfa(sombraAvion(av(50), { luz: luzDeSombra('noche') })) < 0.04);
  assert.equal(alturaSobreSuelo({ x: 0, z: 0, ft: 120 }), 120);
  // Las marcas: el punto de mira a ~1,000 ft del umbral (AIM 2-3-3), en las dos cabeceras de cada pista.
  assert.equal(MARCAS_PISTA.fuente, 'AIM 2-3-3'); assert.equal(MARCAS_PISTA.miraFt, 1000);
  const m = marcasPista(PISTA);
  const zs = m.map(q => q.p.reduce((s, p) => s + p[2], 0) / 4 * 1000);
  assert.ok(zs.some(z => Math.abs(z - (-PISTA.largoFt / 2 + 1075)) < 5) && zs.some(z => Math.abs(z - (PISTA.largoFt / 2 - 1075)) < 5), 'el punto de mira, a 1,000–1,150 ft de cada umbral');
  assert.ok(m.length >= 4 + 12, 'mira y zona de toma de contacto');
  assert.ok(marcasPista(PISTA_B).length >= 4);
  // El detalle: con tope (iPhone) y nada alto cerca de la pista ni en la final.
  const d = detalleSuelo({});
  const copas = d.filter(q => q.t === 's' && q.r > 0.006);
  assert.ok(copas.length > 50 && copas.length <= DETALLE.arboles, `árboles: ${copas.length}`);
  for (const q of copas) assert.ok(!(Math.abs(q.p[0] - PISTA.x) < 0.3 && q.p[2] > -8 && q.p[2] < 2.6), 'ni en la pista ni en la final');
  assert.ok(copas.every(q => q.p[1] + q.r >= 0.024 && q.p[1] + q.r <= 0.047), 'árboles de 25 a 45 ft');
  assert.ok(d.length < 2500, `lista fija chica (${d.length})`);
  assert.equal(detalleSuelo({ noche: true }).filter(q => q.capa === 'calco' && q.a === 0.26).length, 0, 'de noche, sin sombras de árboles');
  // La altura sobre el suelo en la pantalla y el aviso del tráfico que nunca tapa un mando.
  const vista = leer('juego-vista.js'), css = leer('juego.css');
  assert.match(vista, /verAgl = aglVisible\(\) && !avion\.enSuelo && h < 500/);
  assert.match(css, /\.juego-escenario \.juego-aviso \{ top: calc\(max\(6px, env\(safe-area-inset-top\)\) \+ 54px\); left: calc\(var\(--reserva-izq, 0px\) \+ 8px\); right: calc\(var\(--reserva-der, 0px\) \+ 8px\);/);
  assert.match(css, /\.juego-aviso\.juego-aviso-corto \{ background: rgba\(14,17,22,0\.84\)/);
});

test('0.14.123: los daños poco a poco (no «se acabó»), los pájaros y la mini-clase del choque con pájaros', async () => {
  const D = await import('../public/clase/juego-danos.js');
  const { MINICLASES } = await import('../public/clase/juego-miniclases.js');
  const tq = (o = {}) => ({ kt: 62, vs: -200, alabeo: 0, cabeceo: 4, dentro: true, ...o });
  // Un buen aterrizaje: nada. Duro (700 ft/min): el tren se dobla. Muy duro (1,200): se rompe. Imposible (2,000): termina.
  assert.deepEqual(D.clasificarImpacto(tq()).nuevos, []);
  assert.deepEqual(D.clasificarImpacto(tq({ vs: -700 })).nuevos, ['tren_doblado']);
  const roto = D.clasificarImpacto(tq({ vs: -1200, alabeo: 5 }));
  assert.ok(!roto.fatal && roto.nuevos.includes('tren_roto') && roto.danos.trenLado === 1);
  assert.ok(D.clasificarImpacto(tq({ vs: -2000 })).fatal);
  assert.ok(D.clasificarImpacto(tq({ alabeo: 50 })).fatal);
  // La nariz abajo: golpe de hélice; un ala baja: la punta raspada (de ese lado); la nariz muy arriba: la cola; de costado: la goma.
  assert.ok(D.clasificarImpacto(tq({ vs: -500, cabeceo: -5 })).nuevos.includes('helice'));
  assert.equal(D.clasificarImpacto(tq({ alabeo: -15 })).danos.puntaAla, -1);
  assert.ok(D.clasificarImpacto(tq({ cabeceo: 15 })).nuevos.includes('cola'));
  assert.ok(D.clasificarImpacto(tq({ alabeo: 9 })).nuevos.includes('goma'));
  // En el pasto, rápido: el tren se dobla. En el agua: nada aquí (el juez del amarizaje).
  assert.ok(D.clasificarImpacto(tq({ dentro: false, kt: 60 })).nuevos.includes('tren_doblado'));
  assert.deepEqual(D.clasificarImpacto(tq({ agua: true, vs: -1500 })).nuevos, []);
  // Los daños se suman (no se pierden con el próximo toque) y solo lo nuevo se avisa.
  const dos = D.clasificarImpacto(tq({ vs: -700, cabeceo: -5 }), roto.danos);
  assert.ok(dos.danos.tren === 2 && dos.nuevos.includes('helice') && !dos.nuevos.includes('tren_roto'));
  // Lo que hacen: la hélice dañada empuja menos y vibra (rota: el motor se para); el tren roto tira y frena en el suelo y
  // queda inclinado; la punta raspada hace alabear en el aire.
  const e = D.efectosDanos(dos.danos);
  assert.ok(e.potencia < 0.8 && e.rugido > 0.5 && e.tiron > 0 && e.frenoSuelo > 0 && e.inclinacion > 0);
  assert.ok(D.efectosDanos({ ...D.sinDanos(), helice: 1 }).motorPara);
  assert.ok(D.efectosDanos({ ...D.sinDanos(), puntaAla: -1 }).alabeo < 0);
  // En el modelo: con el tren roto el avión tira hacia ese lado y frena; con un ala dañada, alabea solo.
  const rodar = danos => { let a = { ...crearAvion({}), kt: 40, danos }; for (let i = 0; i < 120; i++) a = pasoVuelo(a, { potencia: 0 }, 1 / 60); return a; };
  const sano = rodar(null), danado = rodar(roto.danos);
  assert.ok(danado.kt < sano.kt - 5 && Math.abs(((danado.rumbo + 540) % 360) - 180) > 3 && danado.alabeo > 3);
  let v = { ...crearAvion({ ft: 3000, kt: 100, potencia: 0.65, enSuelo: false }), danos: { ...D.sinDanos(), borde: 1 } };
  for (let i = 0; i < 180; i++) v = pasoVuelo(v, { potencia: 0.65 }, 1 / 60);
  assert.ok(v.alabeo > 3, 'el ala abollada tira (~1.75°/s sin corregir)');
  // Los pájaros (AIM 7-5): el parabrisas, el borde de ataque o el motor.
  assert.deepEqual([...D.PARTES_AVE], ['parabrisas', 'borde', 'motor']);
  assert.deepEqual(D.listaDanos(D.danoAve(null, 'parabrisas')), ['parabrisas']);
  assert.equal(D.danoAve(null, 'borde', -1).borde, -1);
  assert.ok(D.efectosDanos(D.danoAve(null, 'motor')).potencia < 1);
  assert.equal(D.AVES.bajoFt, 3000); assert.match(D.AVES.fuente, /AIM 7-5/);
  // La mini-clase: 3 pasos (volar, evaluar, avisar), con el golpe dado al empezar.
  const mc = MINICLASES.find(m => m.id === 'pajaros');
  assert.deepEqual(mc.pasos.map(p => p.id), ['volar', 'evaluar', 'avisar']);
  assert.ok(mc.pasos.every(p => p.ave?.length));
  const es = JSON.parse(leer('i18n/es.json')), en = JSON.parse(leer('i18n/en.json'));
  for (const k of ['juego.mc.pajaros.titulo', 'juego.mc.pajaros.linea', ...['volar', 'evaluar', 'avisar'].flatMap(p => [`juego.mc.pajaros.${p}`, `juego.mc.pajaros.${p}.clave`]),
    'juego.pajaros', 'juego.pajaros.adelante', 'juego.ave.titulo', 'juego.ave.que', ...D.PARTES_AVE.map(p => `juego.ave.${p}`),
    'juego.dano.titulo', 'juego.dano.ninguno', 'juego.dano.cuantos', ...['tren_doblado', 'tren_roto', 'helice', 'punta_ala', 'cola', 'goma'].flatMap(id => [`juego.dano.${id}`, `juego.dano.${id}.que`]),
    'juego.dano.parabrisas', 'juego.dano.borde', 'juego.dano.motor_ave']) assert.ok(es[k] && en[k], k);
  // En el juego: los toques se clasifican antes del «choque»; el parabrisas rajado se dibuja en la cabina.
  const vista = leer('juego-vista.js');
  assert.match(vista, /if \(avion\.choque && !antes\.choque && !imp\.fatal\) avion = \{ \.\.\.avion, choque: false/);
  assert.match(vista, /grieta: avion\.danos\?\.parabrisas/);
  const { ctx, ops } = contexto();
  dibujarCabina(ctx, 1000, 600, datos(), { escala: 1, completo: true, extras: { ...EX, grieta: 1 } });
  assert.ok(ops.filter(o => o[0] === 'lineTo').length > 40, 'las grietas');
});

test('0.14.124: la cabina 3D (geometría en la escena, con la luz de afuera) y los relojes vivos sobre su tablero', async () => {
  const C3 = await import('../public/clase/cabina3d.js');
  const { crearCamara, suma, baseAvion } = await import('../public/clase/motor3d.js');
  const pos = [0.5, 1.5, -6], arg = { pos, rumbo: 30, cabeceo: 2, alabeo: 10, yugo: { alabeo: 0, cabeceo: 0 }, potencia: 0.5 };
  const p = C3.primitivasCabina3d(arg);
  assert.ok(p.length > 100 && p.length < 800, `piezas: ${p.length}`);
  assert.ok(p.every(q => q.t === 'p' && q.p.every(v => v.every(Number.isFinite))));
  assert.ok(p.filter(q => (q.luz ?? 1) > 0).length > p.length * 0.8, 'con la luz de la escena (no colores planos)');
  // El yugo gira y se acerca; la potencia mete la perilla.
  const centro = ps => ps.flatMap(q => q.p).reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
  const a = centro(C3.primitivasCabina3d({ ...arg, yugo: { alabeo: 1, cabeceo: 1 } })), b = centro(C3.primitivasCabina3d(arg));
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-6);
  // Los relojes vivos: donde cae el tablero, con radios parecidos y sin NaN.
  const B = C3.baseCabina(pos, 30, 2, 10), bv = baseAvion(30, 2 - 9, 10);
  const cam = crearCamara({ ojo: B.ojo, mira: suma(B.ojo, bv.F), arriba: bv.U, fov: 58, cerca: 0.0004 });
  const { ctx, ops, numeros } = contexto();
  const r = C3.relojesCabina3d(ctx, cam, 1280, 720, { ...arg, datos: datos(), escala: 1 });
  assert.ok(r.techo > 200 && r.techo < 720, `el tablero empieza a ${r.techo.toFixed(0)} px`);
  assert.ok(numeros().every(Number.isFinite));
  for (const s of ['1,650', '095', 'KNOTS']) assert.ok(ops.some(o => o[0] === 'fillText' && o[1] === s), s);
  const vista = leer('juego-vista.js');
  assert.match(vista, /const usa3d = \(\) => Boolean\(gl3\) && cabina3dOn && !mc\?\.fov && !repe;/);
  assert.doesNotMatch(leer('clase/cabina3d.js'), /cessna|piper|garmin/i);
});
