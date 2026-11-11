// Clases visuales: la secuencia del reproductor (escenas, avance, progreso, reanudar) y los escenarios.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Secuencia, estimarDuracion, dividirFrases, tiemposFrases, fraseEn, duracionEscena, normalizarLeccion,
  siguienteVelocidad, VELOCIDADES } from '../public/clase/reproductor.js';
import { evaluarEleccion, validarEscenario, trayectoria } from '../public/clase/escenario.js';
import { etapaConveccion, estadoFrente } from '../public/clase/meteo.js';
import { interpolarClaves } from '../public/clase/comun.js';

const leccion = {
  id: 'l1',
  escenas: [
    { id: 'a', subtitulo: 'Uno', texto_narracion: 'Primera frase. Segunda frase.', duracion_s: 10, visual: { tipo: 'titulo' } },
    { id: 'b', subtitulo: 'Dos', texto_narracion: 'Otra.', duracion_s: 5, visual: { tipo: 'ala' } },
    { id: 'c', subtitulo: 'Tres', texto_narracion: '¿Qué harías?', duracion_s: 5, visual: { tipo: 'escenario' } },
  ],
};

test('duración: audio, si no la indicada, si no estimada del texto', () => {
  assert.equal(duracionEscena({ duracion_s: 7 }, 12.5), 12.5);
  assert.equal(duracionEscena({ duracion_s: 7 }), 7);
  assert.equal(duracionEscena({ texto_narracion: '' }), 5);
  const largo = Array(50).fill('palabra').join(' ');
  assert.ok(estimarDuracion(largo) > 15 && estimarDuracion(largo) < 30);
});

test('frases y sus tiempos', () => {
  assert.deepEqual(dividirFrases('Hola piloto. ¿Listo? ¡Vamos!'), ['Hola piloto.', '¿Listo?', '¡Vamos!']);
  assert.deepEqual(dividirFrases('Sin punto final'), ['Sin punto final']);
  assert.deepEqual(dividirFrases(''), []);
  const t = tiemposFrases(['corta.', 'una frase bastante más larga.'], 10);
  assert.equal(t[0].inicio, 0);
  assert.ok(Math.abs(t[1].fin - 10) < 1e-9);
  assert.ok(t[1].fin - t[1].inicio > t[0].fin - t[0].inicio);
  assert.equal(fraseEn(t, 0.1), 0);
  assert.equal(fraseEn(t, 9.9), 1);
  assert.equal(fraseEn(t, 50), 1);
});

test('la secuencia avanza sola de escena en escena y espera la respuesta en un escenario', () => {
  const s = new Secuencia(leccion);
  assert.equal(s.indice, 0);
  assert.equal(s.avanzar(4), null);
  assert.equal(s.avanzar(6.5), 'escena');
  assert.equal(s.indice, 1);
  assert.equal(s.tiempo, 0);
  assert.equal(s.avanzar(5), 'escena');
  assert.equal(s.indice, 2);
  assert.equal(s.avanzar(9), null, 'el escenario no termina sin respuesta');
  assert.equal(s.esperando, true);
  assert.equal(s.continuar(), null, 'sin responder no se puede seguir');
  s.responder();
  assert.equal(s.avanzar(0.1), null, 'respondido, igual espera «Continuar» para leer la consecuencia');
  assert.equal(s.continuar(), 'fin');
  assert.equal(s.terminada, true);
  assert.equal(s.progreso().porcentaje, 100);
  assert.equal(s.progreso().completado, true);
  assert.equal(s.avanzar(1), null);
});

test('un escenario en medio de la lección: tras responder, «Continuar» pasa a la escena siguiente', () => {
  const l = { escenas: [leccion.escenas[2], leccion.escenas[0]] };
  const s = new Secuencia(l);
  s.avanzar(10);
  s.responder();
  assert.equal(s.indice, 0);
  assert.equal(s.continuar(), 'escena');
  assert.equal(s.indice, 1);
});

test('progreso y reanudar donde quedó', () => {
  const s = new Secuencia(leccion);
  s.avanzar(5);
  const p = s.progreso();
  assert.deepEqual({ ...p }, { leccionId: 'l1', indice: 0, escenaId: 'a', tiempo: 5, porcentaje: 25, completado: false });
  const r = new Secuencia(leccion, { indice: 1, tiempo: 2 });
  assert.equal(r.indice, 1); assert.equal(r.tiempo, 2);
  assert.equal(r.progreso().porcentaje, 60);
  const fuera = new Secuencia(leccion, { indice: 99, tiempo: 999 });
  assert.equal(fuera.indice, 2);
  assert.ok(fuera.tiempo < fuera.duracion);
  assert.equal(new Secuencia(leccion, { indice: -3, tiempo: 'x' }).indice, 0);
});

test('ir, siguiente, anterior y sin avance automático', () => {
  const s = new Secuencia(leccion, { autoAvance: false });
  assert.equal(s.avanzar(20), null);
  assert.equal(s.indice, 0);
  assert.equal(s.siguiente(), true);
  assert.equal(s.indice, 1);
  s.avanzar(4);
  assert.equal(s.anterior(), false, 'pasados 3 s, «anterior» vuelve al comienzo de la escena');
  assert.equal(s.tiempo, 0);
  assert.equal(s.anterior(), true);
  assert.equal(s.indice, 0);
  assert.equal(s.ir(2), true);
  assert.equal(s.siguiente(), false);
  s.fijarDuracion(2, 30);
  assert.equal(s.duracion, 30);
});

test('normalizar: ids y visual por defecto; sin escenas es un error', () => {
  const n = normalizarLeccion({ escenas: [{ subtitulo: 'Hola' }] });
  assert.equal(n.escenas[0].id, 'escena-1');
  assert.equal(n.escenas[0].visual.tipo, 'titulo');
  assert.throws(() => normalizarLeccion({ escenas: [] }));
  assert.deepEqual(VELOCIDADES, [1, 1.25, 1.5]);
  assert.equal(siguienteVelocidad(1), 1.25);
  assert.equal(siguienteVelocidad(1.5), 1);
});

test('escenario: evaluar la elección y validar los datos', () => {
  const e = {
    situacion: 'S', concepto: 'C',
    opciones: [{ texto: 'a', consecuencia: 'x', correcta: false }, { texto: 'b', consecuencia: 'y', correcta: true, animacion: 'virar' }],
  };
  assert.deepEqual(validarEscenario(e), []);
  const bien = evaluarEleccion(e, 1);
  assert.equal(bien.correcta, true); assert.equal(bien.animacion, 'virar');
  const mal = evaluarEleccion(e, 0);
  assert.equal(mal.correcta, false); assert.equal(mal.indiceCorrecto, 1); assert.equal(mal.textoCorrecto, 'b');
  assert.throws(() => evaluarEleccion(e, 5), RangeError);
  assert.ok(validarEscenario({ situacion: 'S', concepto: 'C', opciones: [e.opciones[0]] }).length > 0);
  assert.ok(validarEscenario({ ...e, opciones: e.opciones.map(o => ({ ...o, correcta: true })) }).length > 0);
  assert.equal(trayectoria('nube', 1).niebla, 1);
  assert.ok(trayectoria('virar', 1).giro < 0, 'al final del viraje mira hacia atrás');
});

test('meteorología: etapas en orden y claves interpoladas', () => {
  const etapas = [0, 0.3, 0.6, 0.9].map(a => etapaConveccion(a).etapa);
  assert.deepEqual(etapas, ['calienta', 'sube', 'condensa', 'nube']);
  assert.equal(etapaConveccion(0).nube, 0);
  assert.equal(etapaConveccion(1).nube, 1);
  assert.ok(estadoFrente(0.8).punta > estadoFrente(0.2).punta);
  const v = interpolarClaves([{ t: 0, alfa: 0, resalta: 'a' }, { t: 1, alfa: 10, resalta: 'b' }], 0.5);
  assert.equal(v.alfa, 5); assert.equal(v.resalta, 'a');
  assert.equal(interpolarClaves([{ t: 0, alfa: 0 }, { t: 1, alfa: 10 }], 2).alfa, 10);
});
