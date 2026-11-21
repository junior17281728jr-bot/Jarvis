// 0.14.98: el Juego de vuelo (fase 1): el modelo de vuelo (pérdida, subir y bajar, despegue), lo que marcan los
// instrumentos, el juez del aterrizaje, los mandos del teclado, la cabina dibujada (sin NaN) y la entrada del menú.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VUELO, PISTA, crearAvion, pasoVuelo, sustentacion, juzgarAterrizaje, lecturas, enPista, consejo, vsAsistente, fallaAceite, agujaRpm,
} from '../public/clase/vuelo-modelo.js';
import { agujaAnemometro, agujaVariometro, tasaDeGiro, inclinacionCoordinador } from '../public/clase/instrumentos.js';
import { dibujarCabina, datosPanel, anguloRpm } from '../public/clase/cabina.js';
import { dibujarCabina as cabinaDeLasClases } from '../public/clase/motor3d.js';
import { TECLAS, mandosDeTeclas, inicioDe, MAPA_JUEGO, ZONAS_JUEGO } from '../public/juego-vista.js';
import { limitesMapa, proyeccionMapa } from '../public/clase/e3d-minimapa.js';
import { enlacesMenu } from '../public/navegacion.js';

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ± ${tol}`);
const volar = (a, mandos, seg, opciones = {}) => { for (let i = 0; i < seg * 60; i++) a = pasoVuelo(a, typeof mandos === 'function' ? mandos(a) : mandos, 1 / 60, opciones); return a; };
const enCrucero = (extra = {}) => ({ ...crearAvion({ ft: 3000, kt: 100, potencia: 0.65, enSuelo: false }), ...extra });

test('modelo: la pérdida es a unos 48 kt (alas niveladas, sin flaps) y a menos con flaps', () => {
  assert.equal(VUELO.perdidaKt, 48);
  // Al ángulo crítico la sustentación es la máxima: a 48 kt sostiene justo el peso (L/W = 1).
  cerca((VUELO.perdidaKt / VUELO.perdidaKt) ** 2 * sustentacion(VUELO.alfaPerdida, 0), 1, 1e-9, 'L/W a 48 kt');
  cerca((VUELO.perdidaFlapsKt / VUELO.perdidaKt) ** 2 * sustentacion(VUELO.alfaPerdida, 1), 1, 1e-9, 'L/W a 43 kt con flaps');
  assert.ok(sustentacion(VUELO.alfaPerdida + 6) < sustentacion(VUELO.alfaPerdida), 'pasado el ángulo crítico cae');
  // Tirando del yugo sin potencia: llega la pérdida (con su aviso antes) y la nariz cae sola.
  let a = enCrucero({ potencia: 0 });
  let aviso = false, perdida = false, kMin = 999;
  for (let i = 0; i < 40 * 60; i++) {
    a = pasoVuelo(a, { cabeceo: 0.7, potencia: 0 }, 1 / 60);
    if (a.aviso && !perdida) aviso = true;
    if (a.perdida) { perdida = true; kMin = Math.min(kMin, a.kt); }
  }
  assert.ok(aviso && perdida, 'avisa y entra en pérdida');
  assert.ok(kMin < 56, `en pérdida va lento (${kMin.toFixed(1)} kt)`);
  // Con el Asistente, el mismo tirón no llega a la pérdida.
  let b = enCrucero({ potencia: 0 });
  let nunca = true;
  for (let i = 0; i < 40 * 60; i++) { b = pasoVuelo(b, { cabeceo: 0.7, potencia: 0 }, 1 / 60, { asistente: true }); if (b.perdida) nunca = false; }
  assert.ok(nunca, 'el Asistente no deja entrar en pérdida');
});

test('modelo: con toda la potencia sube y en ralentí baja; viraje por alabeo y en el rumbo correcto', () => {
  const sube = volar(enCrucero({ kt: 80, cabeceo: 6 }), { potencia: 1 }, 20);
  assert.ok(sube.ft > 3100 && sube.vs > 200, `sube (${Math.round(sube.ft)} ft, ${Math.round(sube.vs)} ft/min)`);
  const baja = volar(enCrucero({ kt: 75 }), { potencia: 0 }, 20, { asistente: true });
  assert.ok(baja.ft < 2900 && baja.vs < -200, `baja (${Math.round(baja.ft)} ft, ${Math.round(baja.vs)} ft/min)`);
  assert.equal(vsAsistente(0.55), 0); cerca(vsAsistente(0), -652.5, 1e-9, 'sin potencia baja'); cerca(vsAsistente(1), 720, 1e-9, 'a toda potencia sube'); assert.ok(vsAsistente(0.35) < 0 && vsAsistente(0.35) > -700);
  // Alabeo a la derecha → el rumbo sube (vira a la derecha); a la izquierda, baja. Viraje estándar: 3°/s.
  const der = volar(enCrucero({ alabeo: 20 }), { potencia: 0.65 }, 5);
  const izq = volar(enCrucero({ rumbo: 90, alabeo: -20 }), { potencia: 0.65 }, 5);
  assert.ok(der.rumbo > 5 && der.rumbo < 90, `vira a la derecha (${der.rumbo.toFixed(1)})`);
  assert.ok(izq.rumbo < 85 && izq.rumbo > 0, `vira a la izquierda (${izq.rumbo.toFixed(1)})`);
  cerca(tasaDeGiro(11.2, 72), 3, 0.05, 'giro estándar a 72 kt con 11°');
  // El paso es estable: igual con cuadros largos (se corta) y sin NaN.
  const largo = pasoVuelo(enCrucero(), { potencia: 0.6 }, 5);
  assert.ok(Number.isFinite(largo.ft) && Math.abs(largo.t - 0.25) < 1e-9, 'un cuadro de 5 s cuenta como 0.25 s');
});

test('modelo: despega de la pista con potencia y tirando a 55 kt; en el suelo no vuela antes', () => {
  let a = inicioDe('libre');
  assert.ok(a.enSuelo && enPista(a.x, a.z).dentro, 'empieza en la pista');
  let despego = null;
  for (let i = 0; i < 60 * 60 && !despego; i++) {
    a = pasoVuelo(a, { potencia: 1, cabeceo: a.enSuelo && a.kt > 55 ? 0.6 : 0 }, 1 / 60, { asistente: true });
    if (!a.enSuelo) despego = { kt: a.kt, largo: enPista(a.x, a.z).largo };
  }
  assert.ok(despego, 'despega');
  assert.ok(despego.kt >= VUELO.rotacionKt - 2, `a ${despego.kt.toFixed(1)} kt`);
  assert.ok(despego.largo < PISTA.largoFt / 2, 'antes del final de la pista');
  const arriba = volar(a, { potencia: 1 }, 30, { asistente: true });
  assert.ok(arriba.ft > 150 && arriba.vs > 250, `sube después de despegar (${Math.round(arriba.ft)} ft)`);
  // Sin tirar, a poca velocidad, sigue en el suelo.
  const quieto = volar(inicioDe('libre'), { potencia: 1, cabeceo: 0 }, 6);
  assert.ok(quieto.enSuelo, 'a baja velocidad no despega');
  // El final empieza alineado, a 3 NM y en el aire.
  const f = inicioDe('final');
  assert.ok(!f.enSuelo && f.ft === 950 && f.flaps === 1);
  assert.ok(Math.abs(enPista(f.x, f.z).costado) < 1 && enPista(f.x, f.z).largo < -18000);
  assert.equal(consejo(f), 'final');
});

test('instrumentos: cada aguja con su valor (velocidad, altímetro de 100 y 1,000 ft, rumbo, variómetro, giro, motor)', () => {
  const a = { ...enCrucero(), kt: 92, ft: 1650, rumbo: 47, alabeo: 15, vs: 500, rpm: 2400, aceitePsi: 60, aceiteTemp: 185, combustible: 30 };
  const L = lecturas(a);
  assert.equal(L.agujas.kt, agujaAnemometro(92));
  cerca(L.agujas.cien, 234, 1e-9, 'aguja de los cientos (650 ft)');
  cerca(L.agujas.mil, 59.4, 1e-9, 'aguja de los miles (1,650 ft)');
  assert.equal(L.agujas.rumbo, -47, 'la tarjeta gira al revés del rumbo');
  assert.equal(L.agujas.vs, agujaVariometro(500));
  assert.ok(L.agujas.vs > -90, 'subiendo, el variómetro apunta arriba del 0');
  assert.ok(lecturas({ ...a, vs: -500 }).agujas.vs < -90, 'bajando, abajo del 0');
  cerca(L.tasaGiro, tasaDeGiro(15, 92), 1e-9, 'tasa de giro');
  assert.equal(L.agujas.coordinador, inclinacionCoordinador(tasaDeGiro(15, 92)));
  assert.ok(L.agujas.coordinador > 0 && lecturas({ ...a, alabeo: -15 }).agujas.coordinador < 0, 'el coordinador se inclina hacia el viraje');
  assert.equal(L.agujas.rpm, agujaRpm(2400)); assert.equal(agujaRpm(0), -135); assert.equal(agujaRpm(3500), 135);
  assert.equal(anguloRpm(2400), agujaRpm(2400), 'la cabina y el modelo usan la misma escala');
  // En el suelo, el coordinador queda nivelado.
  assert.equal(lecturas({ ...a, enSuelo: true, alabeo: 0, kt: 0 }).agujas.coordinador, 0);
  // Lo que le falta al panel (las clases solo mandan kt, ft, rumbo, alabeo, cabeceo y vs) se completa sin NaN.
  const D = datosPanel({ kt: 105, ft: 3500, rumbo: 270, alabeo: -10, cabeceo: 2, subida: -300 });
  assert.equal(D.vs, -300);
  for (const v of Object.values(D.agujas)) assert.ok(Number.isFinite(v));
  // La falla del aceite: la presión baja, la temperatura sube y el motor tose y al final se para.
  const f0 = fallaAceite(0), f30 = fallaAceite(30), f80 = fallaAceite(80);
  assert.equal(f0.aceitePsi, VUELO.aceitePsiNormal);
  assert.ok(f30.aceitePsi < f0.aceitePsi && f30.aceiteTemp > f0.aceiteTemp && f30.rugido > 0);
  assert.equal(f80.motor, 0);
});

test('el juez del aterrizaje: bueno, firme, duro, fuera de la pista y choque', () => {
  const base = { kt: 60, vs: -200, alabeo: 0, costado: 4, dentro: true };
  assert.equal(juzgarAterrizaje(base).nivel, 'bueno');
  assert.equal(juzgarAterrizaje({ ...base, vs: -450 }).nivel, 'firme');
  assert.equal(juzgarAterrizaje({ ...base, costado: 25 }).nivel, 'firme');
  assert.deepEqual(juzgarAterrizaje({ ...base, vs: -800 }).motivos, ['descenso']);
  assert.equal(juzgarAterrizaje({ ...base, alabeo: 15 }).nivel, 'duro');
  assert.equal(juzgarAterrizaje({ ...base, kt: 90 }).nivel, 'duro');
  assert.equal(juzgarAterrizaje({ ...base, dentro: false }).nivel, 'fuera');
  assert.equal(juzgarAterrizaje(base, { choque: true }).nivel, 'choque');
  assert.ok(juzgarAterrizaje(base).puntos > juzgarAterrizaje({ ...base, vs: -450 }).puntos);
  // Un aterrizaje de verdad con el modelo: en final, potencia baja y flaps, con el Asistente, toca en la pista.
  let a = inicioDe('final'), toque = null;
  for (let i = 0; i < 240 * 60 && !toque; i++) {
    const pista = enPista(a.x, a.z);
    // Como un alumno: sigue una senda de 3° hasta el umbral (más potencia si va bajo) y, cerca del suelo, el «flare».
    const senda = Math.max(0, -pista.largo - PISTA.largoFt / 2 + 300) * Math.tan(3 * Math.PI / 180);
    a = pasoVuelo(a, { potencia: Math.max(0, Math.min(0.6, 0.2 + (senda - a.ft) / 250)), flaps: 1, cabeceo: a.ft < 25 ? Math.max(0, Math.min(0.5, (-a.vs - 150) / 400)) : 0, alabeo: Math.max(-0.3, Math.min(0.3, -pista.costado / 300 - a.alabeo / 30)) }, 1 / 60, { asistente: true });
    if (a.toque) toque = a.toque;
  }
  assert.ok(toque, 'toca el suelo');
  const j = juzgarAterrizaje(toque);
  assert.ok(['bueno', 'firme'].includes(j.nivel), `aterriza bien (${j.nivel}: ${Math.round(toque.kt)} kt, ${Math.round(toque.vs)} ft/min, ${Math.round(toque.costado)} ft, dentro ${toque.dentro})`);
  // Choca si cae muy rápido.
  const cae = pasoVuelo({ ...crearAvion({ ft: 5, kt: 70, enSuelo: false }), gamma: -0.4, vs: -2800 }, { potencia: 0 }, 0.2);
  assert.ok(cae.choque);
});

test('los mandos del teclado: el yugo va y vuelve al centro; la potencia sube y baja; nada fuera de -1..1', () => {
  assert.deepEqual(TECLAS.ArrowDown, ['cabeceo', 1], '↓ = tirar (nariz arriba)');
  assert.deepEqual(TECLAS.ArrowLeft, ['alabeo', -1]);
  let m = { cabeceo: 0, alabeo: 0, potencia: 0.5 };
  for (let i = 0; i < 60; i++) m = mandosDeTeclas(new Set(['ArrowRight', 'ArrowDown', 'ShiftLeft']), m, 1 / 60);
  assert.equal(m.alabeo, 1); assert.equal(m.cabeceo, 1); cerca(m.potencia, 1, 1e-9, 'potencia al máximo');
  for (let i = 0; i < 60; i++) m = mandosDeTeclas(new Set(['ControlLeft']), m, 1 / 60);
  assert.equal(m.alabeo, 0); assert.equal(m.cabeceo, 0); cerca(m.potencia, 0.4, 1e-9, 'baja la potencia');
  m = mandosDeTeclas(new Set(['ArrowLeft', 'KeyA']), { cabeceo: 0, alabeo: -1, potencia: 0 }, 1);
  assert.equal(m.alabeo, -1);
});

// Un lienzo de mentira: guarda los números y los textos (para ver que no haya NaN y que se escriba lo que se debe).
function contexto() {
  const llamadas = { numeros: [], texto: [] };
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '',
    createLinearGradient: (...a) => { llamadas.numeros.push(...a); return { addColorStop() {} }; },
    createRadialGradient: (...a) => { llamadas.numeros.push(...a); return { addColorStop() {} }; },
    fillText: (s, ...a) => { llamadas.texto.push(String(s)); llamadas.numeros.push(...a); },
  };
  return { llamadas, ctx: new Proxy(ctx, { get(o, k) { if (k in o) return o[k]; return (...a) => { for (const x of a) if (typeof x === 'number') llamadas.numeros.push(x); }; }, set(o, k, v) { o[k] = v; return true; } }) };
}

test('la cabina: completa (Juego) y la de las clases, sin NaN, con sus números y la aguja en su lugar', () => {
  for (const [ancho, alto] of [[390, 470], [1440, 820], [320, 360]]) {
    for (const noche of [false, true]) {
      const { ctx, llamadas } = contexto();
      const L = lecturas({ ...enCrucero(), kt: 92, ft: 1650, rumbo: 47, alabeo: 22, vs: 560, aviso: true, rpm: 2410 });
      const panel = dibujarCabina(ctx, ancho, alto, L, { escala: 2, completo: true, yugo: { alabeo: 0.4, cabeceo: -0.2 }, noche });
      assert.ok(panel > 0 && panel < alto, 'el tablero ocupa parte de la imagen');
      assert.ok(llamadas.numeros.every(Number.isFinite), 'sin NaN');
      for (const s of ['1,650', '047', '2410', 'STALL', 'N', 'E', '29.92']) assert.ok(llamadas.texto.some(x => x === s || x.startsWith(s.slice(0, 3))), `escribe ${s}`);
    }
  }
  // La de las clases (motor3d.dibujarCabina) dibuja con el mismo código: los seis instrumentos, más bajo que el del Juego.
  const a = contexto(), b = contexto();
  const pc = cabinaDeLasClases(a.ctx, 640, 400, { kt: 110, ft: 3500, rumbo: 135, alabeo: 0, cabeceo: 0 }, { escala: 1, textos: { kt: 'KT', ft: 'FT' } });
  const pj = dibujarCabina(b.ctx, 640, 400, { kt: 110, ft: 3500, rumbo: 135 }, { escala: 1, completo: true });
  assert.ok(pc < pj, 'la de las clases es más baja');
  assert.ok(a.llamadas.numeros.every(Number.isFinite));
  assert.ok(a.llamadas.texto.includes('KT') && a.llamadas.texto.includes('3,500') && a.llamadas.texto.includes('135'));
});

test('el menú: «Juego» está para el alumno (antes de Ajustes, con y sin oral) y su pantalla existe', () => {
  const ids = x => enlacesMenu(x).map(e => e[0]);
  assert.deepEqual(ids({}), ['inicio', 'progreso', 'repaso', 'juego', 'configuracion']);
  assert.deepEqual(ids({ oral: true }), ['inicio', 'progreso', 'oral', 'repaso', 'juego', 'configuracion'], 'con el oral son 6 (caben desde 320 px)');
  assert.equal(ids({ oral: true, admin: true }).length, 7);
  const juego = enlacesMenu({}).find(e => e[0] === 'juego');
  assert.deepEqual(juego, ['juego', 'menu.juego', 'mando', 'menu.corto.juego']);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /enlacesMenu\(\{ oral: Boolean\(estado\.oral\?\.hay\), admin: verComoAdmin\(\) \}\)/);
  assert.match(app, /if \(seccion === 'juego'\) return pantallaJuego\(\);/);
  assert.match(app, /\^juego\\\/\(libre\|final\)\$/);
  assert.match(app, /mando: \[\['path'/, 'el ícono del mando');
  const css = readFileSync(new URL('../public/juego.css', import.meta.url), 'utf8');
  assert.match(css, /\.menu:has\(> a:nth-child\(7\)\) > a\[data-menu="juego"\] \{ display: none; \}/, 'con 7 (el administrador) se esconde en el teléfono');
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /href="\/juego\.css"/);
});

test('los textos del Juego: en es y en, los mismos, y sin código como texto ni estilos escritos', () => {
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  const vista = readFileSync(new URL('../public/juego-vista.js', import.meta.url), 'utf8');
  const usadas = new Set([...vista.matchAll(/t\(`?'?(juego\.[a-z_.]+)/g)].map(m => m[1]));
  for (const k of Object.keys(es).filter(k => k.startsWith('juego.') || k.endsWith('.juego'))) assert.ok(k in en, `${k} en inglés`);
  for (const k of usadas) if (!k.endsWith('.')) assert.ok(k in es && k in en, `${k} existe`);
  for (const c of ['potencia', 'acelera', 'rotar', 'subir', 'perdida', 'final', 'final_rapido', 'volver', 'rodando', 'detenido', 'choque']) assert.ok(`juego.consejo.${c}` in es && `juego.consejo.${c}` in en);
  for (const n of ['bueno', 'firme', 'duro', 'fuera', 'choque']) assert.ok(`juego.res.${n}` in es && `juego.res.${n}` in en);
  // Cada motivo del juez tiene su consejo.
  for (const m of ['bueno', 'descenso_firme', 'eje', 'descenso', 'alas', 'rapido', 'fuera', 'choque']) assert.ok(`juego.res.consejo.${m}` in es && `juego.res.consejo.${m}` in en, m);
  for (const archivo of ['public/juego-vista.js', 'public/clase/cabina.js', 'public/clase/vuelo-modelo.js', 'public/clase/juego-mundo.js']) {
    const s = readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(s), `${archivo}: sin HTML como texto`);
    assert.ok(!/['"]style['"]\s*:|setAttribute\('style'/.test(s), `${archivo}: sin style=`);
  }
});

test('el mini-mapa del juego es el de las consecuencias 3D: abarca la pista y su final, con el norte arriba', () => {
  const L = limitesMapa(MAPA_JUEGO, ZONAS_JUEGO);
  assert.ok(L.z0 < -18 && L.z1 > 2, 'del final (3 NM al sur) hasta pasada la pista');
  const P = proyeccionMapa(MAPA_JUEGO, ZONAS_JUEGO);
  const [, vSur] = P.a(0, -10), [, vNorte] = P.a(0, 5);
  assert.ok(vNorte < vSur, 'el norte queda arriba');
  // Sin zonas propias, las situaciones siguen igual (mismos límites que antes).
  assert.deepEqual(limitesMapa({ id: 'nada', intro: { vuelo: { ruta: [[0, 0, 0], [2, 0, 3]] } }, opciones: [] }), { x0: 0, x1: 2, z0: 0, z1: 3 });
});
