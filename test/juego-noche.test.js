// 0.14.100: la noche en el Juego: la tabla de las luces (de la FAA) contra lo que se dibuja, el PAPI y el VASI, el faro,
// los otros aviones (qué luces se ven y hacia dónde van), el derecho de paso (14 CFR 91.113), el cielo de día, atardecer y
// noche, y las mini-clases (sus pasos, sus textos en es y en, y la respuesta de cada pregunta, que sale del motor).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LUCES_FAA, colorBorde, colorExtremo, lucesFijas, lucesExtremos, faro, destellosPorMinuto, FARO_PERIODO, papi, lecturaPapi, vasi, anguloSenda, lucesSenda, SITIO_PAPI,
  crearTrafico, moverTrafico, lucesVisibles, direccionDe, queVes, derechoDePaso, primitivasTrafico, TRAFICO_TIPOS, paletaDe, solDe, conLuces, PALETA_NOCHE,
} from '../public/clase/juego-noche.js';
import { MINICLASES, preguntaDePaso, enFinalA, DIRECCIONES } from '../public/clase/juego-miniclases.js';
import { PISTA } from '../public/clase/vuelo-modelo.js';
import { ESCENAS } from '../public/clase/escenas3d.js';

const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));

test('la tabla de la FAA: luces de posición, bordes, extremos, rodaje, faro, PAPI, VASI y derecho de paso (con su fuente)', () => {
  assert.deepEqual({ ...LUCES_FAA.posicion }, { izquierda: 'rojo', derecha: 'verde', cola: 'blanco', fuente: 'AFH cap. 11 (Night Operations)' });
  assert.equal(LUCES_FAA.bordePista.color, 'blanco'); assert.equal(LUCES_FAA.bordePista.precaucion, 'amarillo'); assert.equal(LUCES_FAA.bordePista.precaucionFt, 2000);
  assert.equal(LUCES_FAA.extremos.haciaAfuera, 'verde'); assert.equal(LUCES_FAA.extremos.haciaLaPista, 'rojo');
  assert.equal(LUCES_FAA.rodaje.borde, 'azul');
  assert.deepEqual([...LUCES_FAA.faro.colores], ['blanco', 'verde']);
  assert.equal(LUCES_FAA.papi.unidades, 4); assert.equal(LUCES_FAA.papi.sendaGrados, 3);
  assert.equal(LUCES_FAA.derechoDePaso.fuente, '14 CFR 91.113');
  for (const v of Object.values(LUCES_FAA)) assert.ok(v.fuente, 'cada dato con su fuente');
});

test('el aeropuerto de noche: bordes blancos y los últimos 2,000 ft amarillos; verde hacia afuera y rojo hacia la pista; rodaje azul; faro blanco y verde', () => {
  const L = PISTA.largoFt / 2;
  assert.equal(colorBorde(-L), 'blanco'); assert.equal(colorBorde(0), 'blanco'); assert.equal(colorBorde(L - 2000 + 50), 'amarillo'); assert.equal(colorBorde(L), 'amarillo');
  // En una pista de 3,000 ft la precaución es la mitad (1,500 ft), que es menos que 2,000.
  const corta = { ...PISTA, largoFt: 3000 };
  assert.equal(colorBorde(-100, corta), 'blanco'); assert.equal(colorBorde(100, corta), 'amarillo', 'la segunda mitad');
  const fijas = lucesFijas();
  const bordes = fijas.filter(l => l.tipo === 'borde'), rodaje = fijas.filter(l => l.tipo === 'rodaje');
  assert.ok(bordes.every(l => ['blanco', 'amarillo'].includes(l.color)) && bordes.some(l => l.color === 'amarillo'));
  assert.ok(rodaje.length > 10 && rodaje.every(l => l.color === 'azul'));
  assert.ok(rodaje.every(l => l.p[0] > PISTA.anchoFt / 2000), 'la calle de rodaje, al este (como la dibuja el aeropuerto)');
  // Los extremos: desde la aproximación (al sur) el umbral se ve verde y el otro extremo, rojo.
  const desdeFinal = lucesExtremos(PISTA.z - 10);
  const sur = desdeFinal.filter(l => l.p[2] < PISTA.z), norte = desdeFinal.filter(l => l.p[2] > PISTA.z);
  assert.ok(sur.length === 8 && sur.every(l => l.color === 'verde'));
  assert.ok(norte.length === 8 && norte.every(l => l.color === 'rojo'));
  assert.equal(colorExtremo(-1, PISTA.z), 'rojo', 'en la pista, el umbral se ve rojo (para quien despega hacia el sur)');
  // El faro: blanco y verde alternados, entre 24 y 30 destellos por minuto.
  assert.ok(destellosPorMinuto() >= LUCES_FAA.faro.destellosMin && destellosPorMinuto() <= LUCES_FAA.faro.destellosMax);
  assert.equal(faro(0.01), 'blanco'); assert.equal(faro(FARO_PERIODO + 0.01), 'verde'); assert.equal(faro(FARO_PERIODO * 2 + 0.01), 'blanco'); assert.equal(faro(FARO_PERIODO * 0.6), null);
});

test('PAPI y VASI como en el AIM: 4 blancas alto, 2 y 2 en la senda de 3°, 4 rojas bajo; en el VASI, rojo sobre blanco', () => {
  const casos = [[3.6, 4, 'alto'], [3.2, 3, 'algo_alto'], [3.0, 2, 'en_senda'], [2.8, 1, 'algo_bajo'], [2.4, 0, 'bajo']];
  for (const [a, blancas, lectura] of casos) {
    assert.equal(papi(a).filter(c => c === 'blanco').length, blancas, `${a}°`);
    assert.equal(lecturaPapi(a), lectura);
  }
  // Las blancas son las de afuera (la de afuera tiene el corte más bajo).
  assert.deepEqual(papi(2.8), ['blanco', 'rojo', 'rojo', 'rojo']);
  assert.deepEqual(vasi(3), { cercana: 'blanco', lejana: 'rojo' }, 'en la senda: la lejana roja sobre la cercana blanca');
  assert.deepEqual(vasi(4), { cercana: 'blanco', lejana: 'blanco' });
  assert.deepEqual(vasi(2), { cercana: 'rojo', lejana: 'rojo' });
  // En final a 2 NM en la senda de 3°, el ángulo al PAPI es casi 3°.
  const f = enFinalA(2);
  const a = anguloSenda(f.x, f.z, f.ft, SITIO_PAPI);
  assert.ok(Math.abs(a - 3) < 0.25, `${a.toFixed(2)}°`);
  assert.equal(lucesSenda(f.x, f.z, f.ft).lectura, 'en_senda');
  assert.equal(lucesSenda(f.x, f.z, f.ft + 300).lectura, 'alto');
  assert.ok(lucesSenda(f.x, f.z, f.ft).luces.filter(l => l.tipo === 'papi').every(l => l.p[0] < 0), 'el PAPI, a la izquierda de la 36');
});

test('los otros aviones: qué luces se ven y hacia dónde van, desde cualquier rumbo propio', () => {
  for (const rumbo of [0, 90, 225]) {
    const yo = { x: 3, z: -4, ft: 2500, rumbo, kt: 100 };
    const ves = tipo => queVes(crearTrafico(tipo, yo), yo);
    const frente = ves('de_frente');
    assert.deepEqual(frente.colores, ['rojo', 'verde']); assert.equal(frente.orden, 'rojo_derecha', 'de frente: la roja a la derecha (AFH cap. 11)'); assert.equal(frente.direccion, 'hacia_ti');
    assert.deepEqual(ves('cruza_der_izq'), { colores: ['rojo'], orden: null, direccion: 'der_a_izq' }, 'solo la roja: cruza de derecha a izquierda');
    assert.deepEqual(ves('cruza_izq_der'), { colores: ['verde'], orden: null, direccion: 'izq_a_der' });
    assert.deepEqual(ves('se_aleja'), { colores: ['blanco'], orden: null, direccion: 'se_aleja' });
  }
  // Uno que va en la misma dirección, visto desde atrás y de cerca de su eje: roja a la izquierda y verde a la derecha.
  const yo = { x: 0, z: 0, rumbo: 0 };
  const delante = { x: 0, z: 0.4, rumbo: 175, kt: 0 };
  assert.ok(lucesVisibles(delante, yo).rojo && lucesVisibles(delante, yo).verde);
  // Se mueve en su rumbo.
  const m = moverTrafico({ x: 0, z: 0, rumbo: 90, kt: 100 }, 60);
  assert.ok(m.x > 10 && Math.abs(m.z) < 1e-9);
  assert.equal(direccionDe({ x: 0, z: 5, rumbo: 180 }, yo), 'hacia_ti');
  // De noche se dibujan solo sus luces (las que se ven desde aquí, el faro y los destellos); de día, el avión.
  const tr = crearTrafico('cruza_der_izq', { x: 0, z: 0, ft: 2500, rumbo: 0 });
  const noche = primitivasTrafico(tr, yo, { hora: 'noche', t: 0.5 });
  assert.ok(noche.length >= 1 && noche.every(p => p.t === 's' && p.tex === 'brillo'));
  assert.ok(noche.some(p => p.c[0] > 200 && p.c[1] < 100), 'se ve la roja');
  assert.ok(!noche.some(p => p.c[1] > 200 && p.c[0] < 100), 'la verde no (no da hacia aquí)');
  assert.ok(primitivasTrafico(tr, yo, { hora: 'dia' }).some(p => p.t === 'p'), 'de día, el avión');
  assert.deepEqual(TRAFICO_TIPOS, ['de_frente', 'cruza_der_izq', 'cruza_izq_der', 'se_aleja', 'alcanzas']);
});

test('el derecho de paso (14 CFR 91.113): a la derecha tiene el paso; de frente, los dos a la derecha; el alcanzado tiene el paso y se pasa por la derecha', () => {
  const yo = { x: 0, z: 0, ft: 2500, rumbo: 30, kt: 100 };
  assert.deepEqual(derechoDePaso(yo, crearTrafico('cruza_der_izq', yo)), { encuentro: 'converge', lado: 'derecha', tiene: 'el', accion: 'ceder' });
  assert.deepEqual(derechoDePaso(yo, crearTrafico('cruza_izq_der', yo)), { encuentro: 'converge', lado: 'izquierda', tiene: 'tu', accion: 'mantener_atento' });
  assert.equal(derechoDePaso(yo, crearTrafico('de_frente', yo)).accion, 'ambos_derecha');
  assert.deepEqual(derechoDePaso(yo, crearTrafico('alcanzas', yo)), { encuentro: 'alcanzas', lado: 'adelante', tiene: 'el', accion: 'pasar_derecha' });
});

test('día, atardecer y noche: la noche es oscura (con el sol abajo) y solo con luces de atardecer o noche', () => {
  const brillo = c => c[0] + c[1] + c[2];
  assert.ok(brillo(paletaDe('noche').cieloAlto) < brillo(paletaDe('atardecer').cieloAlto) && brillo(paletaDe('atardecer').cieloAlto) < brillo(paletaDe('dia').cieloAlto));
  assert.ok(PALETA_NOCHE.ambiente < paletaDe('dia').ambiente);
  assert.ok(solDe('noche')[1] < 0 && solDe('dia')[1] > 0);
  assert.equal(conLuces('dia'), false); assert.equal(conLuces('atardecer'), true); assert.equal(conLuces('noche'), true);
});

test('las mini-clases: 2 a 4 pasos con su texto y su idea clave (es y en) y su fuente; la respuesta sale del motor; las escenas existen', () => {
  const ids = MINICLASES.map(m => m.id);
  for (const id of ['luces-aviones', 'derecho-paso', 'luces-aeropuerto', 'papi', 'noche-aterrizar', 'cruzado', 'perdida', 'espacio-aereo', 'minimos-vfr', 'frentes']) assert.ok(ids.includes(id), id);
  for (const m of MINICLASES) {
    for (const k of ['titulo', 'linea']) assert.ok(`juego.mc.${m.id}.${k}` in es && `juego.mc.${m.id}.${k}` in en, `${m.id}.${k}`);
    if (m.escena) { assert.ok(ESCENAS[m.escena], `escena ${m.escena}`); continue; }
    assert.ok(m.pasos.length >= 2 && m.pasos.length <= 4, `${m.id}: ${m.pasos.length} pasos`);
    assert.ok(m.fuente && m.hora && m.inicio, m.id);
    for (const p of m.pasos) {
      for (const k of [`juego.mc.${m.id}.${p.id}`, `juego.mc.${m.id}.${p.id}.clave`]) assert.ok(k in es && k in en, k);
      if (p.pregunta) {
        const q = preguntaDePaso(p, m.inicio);
        assert.ok(q.opciones.includes(q.correcta), `${m.id}.${p.id}: la correcta está entre las opciones`);
        for (const o of q.opciones) assert.ok(`juego.${p.pregunta === 'direccion' ? 'dir' : 'accion'}.${o}` in es);
      }
    }
  }
  const luces = MINICLASES.find(m => m.id === 'luces-aviones');
  assert.deepEqual(luces.pasos.map(p => preguntaDePaso(p, luces.inicio).correcta), ['hacia_ti', 'der_a_izq', 'izq_a_der', 'se_aleja']);
  assert.deepEqual([...DIRECCIONES].sort(), ['der_a_izq', 'hacia_ti', 'izq_a_der', 'se_aleja']);
  const paso = MINICLASES.find(m => m.id === 'derecho-paso');
  assert.deepEqual(paso.pasos.map(p => preguntaDePaso(p, paso.inicio).correcta), ['ceder', 'ambos_derecha', 'pasar_derecha']);
  // Los textos de la clave dicen lo de la tabla (en español).
  assert.match(es['juego.mc.luces-aeropuerto.bordes.clave'], /2,000 ft/);
  assert.match(es['juego.mc.luces-aeropuerto.faro.clave'], /24 a 30/);
  assert.match(es['juego.mc.papi.senda.clave'], /Dos blancas y dos rojas/);
  assert.match(es['juego.mc.derecho-paso.frente.clave'], /derecha/);
  // Todo lo que usa la vista existe en los dos idiomas.
  for (const k of ['juego.hora.dia', 'juego.hora.atardecer', 'juego.hora.noche', 'juego.clase.paso', 'juego.papi.lectura', 'juego.trafico.ves', 'juego.fuente']) assert.ok(k in es && k in en, k);
});
