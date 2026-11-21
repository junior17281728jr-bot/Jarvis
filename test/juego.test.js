// 0.14.98: el Juego de vuelo (fase 1): el modelo de vuelo (pérdida, subir y bajar, despegue), lo que marcan los
// instrumentos, el juez del aterrizaje, los mandos del teclado, la cabina dibujada (sin NaN) y la entrada del menú.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VUELO, PISTA, PISTA_B, PISTAS, pistaDe, TECHO, crearAvion, pasoVuelo, sustentacion, juzgarAterrizaje, lecturas, enPista, consejo, fallaAceite, agujaRpm, indicar, perdidaConCarga,
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
  const sube = volar(crearAvion({ ft: 3000, kt: 80, enSuelo: false, potencia: 1 }), { potencia: 1 }, 30);
  assert.ok(sube.ft > 3100 && sube.vs > 200, `sube (${Math.round(sube.ft)} ft, ${Math.round(sube.vs)} ft/min)`);
  const baja = volar(enCrucero({ kt: 75 }), { potencia: 0 }, 20, { asistente: true });
  assert.ok(baja.ft < 2900 && baja.vs < -200, `baja (${Math.round(baja.ft)} ft, ${Math.round(baja.vs)} ft/min)`);
  // (la potencia decide: el avión compensado mantiene su velocidad y sube o baja con la potencia; AFH cap. 18)
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
  assert.ok(arriba.ft > 150 && !arriba.enSuelo, `sube después de despegar (${Math.round(arriba.ft)} ft)`);
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
  const llamadas = { numeros: [], texto: [], ops: [] };
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: '',
    createLinearGradient: (...a) => { llamadas.numeros.push(...a); return { addColorStop() {} }; },
    createRadialGradient: (...a) => { llamadas.numeros.push(...a); return { addColorStop() {} }; },
    fillText: (s, ...a) => { llamadas.texto.push(String(s)); llamadas.numeros.push(...a); llamadas.ops.push(['fillText', String(s), ...a]); },
  };
  return { llamadas, ctx: new Proxy(ctx, { get(o, k) { if (k in o) return o[k]; return (...a) => { llamadas.ops.push([k, ...a]); for (const x of a) if (typeof x === 'number') llamadas.numeros.push(x); }; }, set(o, k, v) { o[k] = v; return true; } }) };
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
  assert.match(app, /\^juego\\\/\(libre\|final\|preguntas\|motor\)\$/);
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

test('el anemómetro: la aguja apunta a la velocidad del modelo, entre los números que tocan (nunca hacia 140–160 en una subida)', () => {
  for (const kt of [55, 77, 92, 105, 120]) {
    const { ctx, llamadas } = contexto();
    dibujarCabina(ctx, 390, 470, lecturas({ ...enCrucero(), kt }), { escala: 2, completo: true });
    // El primer «rotate» después de trasladarse al centro del anemómetro es su aguja: el mismo ángulo que la escala.
    const giros = llamadas.ops.filter(o => o[0] === 'rotate').map(o => o[1]);
    cerca(giros[0], (agujaAnemometro(kt) * Math.PI) / 180, 1e-9, `aguja a ${kt} kt`);
    // Los números de la escala están en el ángulo de su velocidad (alrededor del mismo centro).
    const numeros = llamadas.ops.filter(o => o[0] === 'fillText' && ['40', '60', '80', '100', '120', '140', '160', '180'].includes(o[1])).slice(0, 8);
    const [cx, cy] = centro(...['60', '120', '180'].map(n => numeros.find(o => o[1] === n)));
    const ang = o => (Math.atan2(o[2] - cx, -(o[3] - cy)) * 180) / Math.PI;
    for (const o of numeros) cerca(((ang(o) % 360) + 360) % 360, agujaAnemometro(Number(o[1])) % 360, 1.5, `el ${o[1]} está en su ángulo`);
  }
  // 92 kt cae entre el 80 y el 100; 77 entre el 60 y el 80.
  assert.ok(agujaAnemometro(92) > agujaAnemometro(80) && agujaAnemometro(92) < agujaAnemometro(100));
  assert.ok(agujaAnemometro(77) > agujaAnemometro(60) && agujaAnemometro(77) < agujaAnemometro(80));
});
// El centro del círculo que pasa por tres números de la escala.
function centro(p, q, r) {
  const [ax, ay, bx, by, cx, cy] = [p[2], p[3], q[2], q[3], r[2], r[3]];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  return [((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d,
    ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d];
}

test('el modelo vuela como una avioneta de entrenamiento: sube cerca de Vy, crucero de unos 105 kt, y nunca pasa de Vne nivelado', () => {
  // A toda potencia, compensado para Vy (yugo suelto): sube cerca de Vy (74–79 kt).
  let a = crearAvion({ ft: 2000, kt: 77, enSuelo: false, potencia: 1 });
  a = volar(a, { potencia: 1 }, 120, { asistente: true });
  assert.ok(a.kt >= 74 && a.kt <= 81, `sube a ${a.kt.toFixed(1)} kt`);
  assert.ok(a.vs > 450 && a.vs < 950, `a ${Math.round(a.vs)} ft/min`);
  // Crucero con 75 %: nivelado a 100–115 kt.
  let c = volar(crearAvion({ ft: 3000, kt: 105, enSuelo: false, potencia: 0.75 }), { potencia: 0.75 }, 240, { asistente: true });
  assert.ok(c.kt >= 100 && c.kt <= 115 && Math.abs(c.vs) < 150, `crucero ${c.kt.toFixed(1)} kt, ${Math.round(c.vs)} ft/min`);
  // Sin Asistente, compensado a 100 kt y con toda la potencia: sube (la velocidad se queda cerca de la compensada).
  let d = volar(crearAvion({ ft: 3000, kt: 100, enSuelo: false, potencia: 1 }), { potencia: 1 }, 120);
  assert.ok(d.ft > 3300 && d.kt < 115, `sin Asistente sube (${Math.round(d.ft)} ft, ${d.kt.toFixed(1)} kt)`);
  // A toda potencia, nivelado, no llega a Vne (160 kt).
  const L = lecturas(c);
  assert.ok(L.agujas.kt < agujaAnemometro(160));
});

test('0.14.102: sin techo artificial: sube a 8,000 ft y vuelve a bajar; el techo de servicio, cerca de 13,500 ft', () => {
  let a = crearAvion({ ft: 1000, kt: 77, enSuelo: false, potencia: 1 });
  let t = 0;
  while (a.ft < 8000 && t < 60 * 40) { a = pasoVuelo(a, { potencia: 1 }, 0.25, { asistente: true }); t += 0.25; }
  assert.ok(a.ft >= 8000, `llega a 8,000 ft (${Math.round(a.ft)} en ${t} s)`);
  assert.ok(a.vs > 150, 'todavía sube a 8,000 ft');
  // Más arriba sube menos (la densidad): a 13,500 ft, unos 100 ft/min.
  const alto = volar({ ...crearAvion({ ft: TECHO.servicioFt, kt: 77, enSuelo: false, potencia: 1 }) }, { potencia: 1 }, 90, { asistente: true });
  assert.ok(alto.vs < 300 && alto.vs > -50, `cerca del techo sube poco (${Math.round(alto.vs)} ft/min)`);
  // Y baja sin límite: sin potencia y con la nariz abajo, más de 1,000 ft/min.
  let b = a;
  for (let k = 0; k < 4 * 60 * 12 && b.ft > 2000; k++) b = pasoVuelo(b, { potencia: 0, cabeceo: b.kt < 115 ? -0.3 : 0 }, 0.25, { asistente: true });
  assert.ok(b.ft <= 2000 && !b.choque, `baja a 2,000 ft (${Math.round(b.ft)})`);
  const rapido = volar(crearAvion({ ft: 6000, kt: 100, enSuelo: false }), m => ({ potencia: 0, cabeceo: m.cabeceo > -8 ? -0.4 : 0 }), 10, { asistente: true });
  assert.ok(rapido.vs < -1000, `con el Asistente se puede bajar a más de 1,000 ft/min (${Math.round(rapido.vs)})`);
  const sube = volar(crearAvion({ ft: 3000, kt: 105, enSuelo: false, potencia: 1 }), m => ({ potencia: 1, cabeceo: m.cabeceo < 8 ? 0.4 : 0 }), 6, { asistente: true });
  assert.ok(sube.vs > 1000, `y subir a más de 1,000 ft/min tirando (${Math.round(sube.vs)})`);
});

test('0.14.102: la gravedad: tirar sin potencia frena, picar acelera; en un viraje de 60° nivelado hacen falta unos 2 g y la pérdida sube (Vs × √n)', () => {
  const sube = volar(crearAvion({ ft: 4000, kt: 100, enSuelo: false, potencia: 0 }), m => ({ potencia: 0, cabeceo: m.cabeceo < 12 ? 0.5 : 0 }), 6);
  assert.ok(sube.kt < 85 && sube.ft > 4000, `al subir sin potencia pierde velocidad (${sube.kt.toFixed(0)} kt, ${Math.round(sube.ft)} ft)`);
  const pica = volar(crearAvion({ ft: 4000, kt: 90, enSuelo: false, potencia: 0.5 }), m => ({ potencia: 0.5, cabeceo: m.cabeceo > -12 ? -0.5 : 0 }), 8);
  assert.ok(pica.kt > 110 && pica.ft < 4000, `al picar gana velocidad (${pica.kt.toFixed(0)} kt)`);
  // Viraje de 60°: sin tirar, baja; tirando para mantener la altura, unos 2 g.
  const sinTirar = volar({ ...crearAvion({ ft: 4000, kt: 105, enSuelo: false, potencia: 0.75 }), alabeo: 60 }, { potencia: 0.75, alabeo: 0 }, 6);
  assert.ok(sinTirar.ft < 3950, `un viraje inclinado sin tirar baja (${Math.round(sinTirar.ft)} ft)`);
  let a = { ...crearAvion({ ft: 4000, kt: 110, enSuelo: false, potencia: 1 }), alabeo: 60 }, gs = [];
  for (let k = 0; k < 60 * 20; k++) {
    a = pasoVuelo(a, { potencia: 1, alabeo: (60 - a.alabeo) / 20, cabeceo: Math.max(-1, Math.min(1, -a.vs / 400 - (a.dgamma ?? 0) / 4 + 0.3)) }, 1 / 60);
    if (k > 60 * 10) gs.push(a.g);
  }
  const g = gs.reduce((x, y) => x + y, 0) / gs.length;
  assert.ok(Math.abs(g - 2) < 0.25, `60° nivelado ≈ 2 g (${g.toFixed(2)})`);
  cerca(perdidaConCarga(2), 48 * Math.SQRT2, 1e-9, 'Vs × √2');
  assert.ok(Math.abs(a.alabeo - 60) < 5);
  // Inercia: el alabeo no salta (tarda en tomar la tasa).
  const r = pasoVuelo(crearAvion({ ft: 3000, kt: 100, enSuelo: false }), { alabeo: 1 }, 0.1);
  assert.ok(r.alabeo > 0 && r.alabeo < 4, `con inercia (${r.alabeo.toFixed(2)}°)`);
});

test('0.14.102: el aeropuerto B: aterrizar allá cuenta, un toque duro rebota y los instrumentos tienen su retraso', () => {
  assert.equal(PISTAS.length, 2);
  assert.ok(Math.hypot(PISTA_B.x, PISTA_B.z) / 6.076 > 8, 'B está a varias millas');
  assert.equal(pistaDe(PISTA_B.x, PISTA_B.z).id, 'B');
  assert.equal(pistaDe(0, -1).id, 'A');
  // Un toque en la pista B (rumbo 090), suave.
  const enB = { ...crearAvion({ x: PISTA_B.x - 0.8, z: PISTA_B.z, ft: 3, kt: 58, rumbo: 90, enSuelo: false, flaps: 1 }), gamma: -0.03, vs: -150, cabeceo: 4 };
  let a = enB;
  for (let k = 0; k < 120 && !a.toque; k++) a = pasoVuelo(a, { potencia: 0, flaps: 1 }, 1 / 60);
  assert.equal(a.toque.pista, 'B'); assert.ok(a.toque.dentro);
  assert.ok(['bueno', 'firme'].includes(juzgarAterrizaje(a.toque).nivel));
  assert.equal(consejo({ ...crearAvion({ x: PISTA_B.x - 3, z: PISTA_B.z, ft: 600, kt: 68, rumbo: 90, enSuelo: false }) }), 'final', 'en final de la 09 de B');
  // Rebote: más de 600 ft/min, sin llegar a choque.
  let duro = { ...crearAvion({ ft: 2, kt: 62, enSuelo: false }), gamma: -0.12, vs: -800 };
  for (let k = 0; k < 30 && !duro.toque; k++) duro = pasoVuelo(duro, { potencia: 0 }, 1 / 60);
  assert.ok(duro.toque?.rebote && !duro.enSuelo && !duro.choque, 'rebota');
  // El variómetro sigue la tendencia con retraso; el altímetro casi enseguida.
  let ind = indicar(null, { vs: 0, ft: 3000 }, 0.1);
  for (let k = 0; k < 10; k++) ind = indicar(ind, { vs: 1000, ft: 3100 }, 0.1);
  assert.ok(ind.vs > 250 && ind.vs < 600, `el variómetro tarda (${Math.round(ind.vs)})`);
  assert.ok(ind.ft > 3090, 'el altímetro, casi enseguida');
});
