// 0.14.31 (pedido del dueño): «Dinero de la IA». Reloj fijo (T0); nunca una IA de verdad.
//  - el pronóstico del mes con el ritmo de 7 días, el aviso de topes en conflicto y los temas que caben en la mejora;
//  - «Darle más IA» (usos y tiempo) y «Quitarle IA»: nunca menos de lo pagado, nunca toca lo usado, nada se borra;
//  - las claves de texto de la pantalla existen en es y en en.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparar, T0 } from './ia-base.js';
import { pronosticoMes, conflictoTopes, pronosticoProfunda, opcionesRegalo, costoPorUso, quitarUsos, regalarTiempo, quitarTiempo, cambiarFinRegalo, aplicarOpcion, vistaDinero, gastoUltimosDias, DIA_MS, COSTO_USO_POR_DEFECTO_MICRO } from '../src/academia/dinero-ia.js';
import { regalarUsos } from '../src/academia/ia-alumnos.js';
import { saldoIa, leerPlan, derechoIa } from '../src/academia/tiempo-ia.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { inicioMesSiguienteCobro } from '../src/tareas/tiempo.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = 1_000_000;
const FIN = inicioMesSiguienteCobro(T0); // 2026-12-01
const filas = (db, uid) => db.prepare('SELECT COUNT(*) AS n FROM academia_ia_minutos WHERE usuario_id = ?').get(uid).n;

test('pronóstico del mes: alcanza hasta una fecha, sobra, sin ritmo, lleno y sin tope', () => {
  // US$30 de US$70 gastado; US$14 en 7 días = US$2/día → US$40 libres = 20 días → 30 nov (antes del 1 dic).
  const a = pronosticoMes({ gastadoMicro: 30 * M, topeMicro: 70 * M, gasto7dMicro: 14 * M, ahora: T0, finMesMs: FIN });
  assert.equal(a.estado, 'alcanza');
  assert.equal(a.dias, 20);
  assert.equal(a.fecha, new Date(T0 + 20 * DIA_MS).toISOString());
  assert.equal(a.ritmoDiaMicro, 2 * M);
  // US$1/día: quedan 20,375 días de mes → sobran 40 − 20,375 = US$19,625.
  const b = pronosticoMes({ gastadoMicro: 30 * M, topeMicro: 70 * M, gasto7dMicro: 7 * M, ahora: T0, finMesMs: FIN });
  assert.equal(b.estado, 'sobra');
  assert.equal(b.sobraMicro, 19_625_000);
  assert.deepEqual([pronosticoMes({ gastadoMicro: 0, topeMicro: 70 * M, gasto7dMicro: 0, ahora: T0, finMesMs: FIN }).estado, pronosticoMes({ gastadoMicro: 0, topeMicro: 70 * M, gasto7dMicro: 0, ahora: T0, finMesMs: FIN }).sobraMicro], ['sin_ritmo', 70 * M]);
  assert.equal(pronosticoMes({ gastadoMicro: 70 * M, topeMicro: 70 * M, gasto7dMicro: 9 * M, ahora: T0, finMesMs: FIN }).estado, 'lleno');
  assert.equal(pronosticoMes({ gastadoMicro: 0, topeMicro: 0, gasto7dMicro: 9 * M, ahora: T0, finMesMs: FIN }).estado, 'sin_tope');
});

test('topes en conflicto: la mejora con US$90 y el mes con US$70 se para en US$56 (deja el 20 %); sin conflicto, null', () => {
  assert.deepEqual(conflictoTopes({ profundaMicro: 90 * M, generalMicro: 70 * M }), { profundaMicro: 90 * M, generalMicro: 70 * M, paraEnMicro: 56 * M, margenPct: 20 });
  assert.equal(conflictoTopes({ profundaMicro: 40 * M, generalMicro: 70 * M }), null);
  assert.equal(conflictoTopes({ profundaMicro: 90 * M, generalMicro: 100 * M, margen: 0 }), null);
});

test('la mejora profunda: le quedan US$85 → 68 temas (US$1,25 cada uno) y 4 días; lo libre del mes también manda', () => {
  const p = pronosticoProfunda({ topeMicro: 90 * M, gastadoMicro: 5 * M, libreGeneralMicro: 200 * M, faltaMicro: 100 * M, faltaTemas: 80, faltaEtaMs: 4 * DIA_MS });
  assert.deepEqual(p, { quedanMicro: 85 * M, temas: 68, dias: 4, porTemaMicro: 1_250_000 });
  assert.equal(pronosticoProfunda({ topeMicro: 90 * M, gastadoMicro: 5 * M, libreGeneralMicro: 10 * M, faltaMicro: 100 * M, faltaTemas: 80, faltaEtaMs: 4 * DIA_MS }).temas, 8);
  assert.deepEqual(pronosticoProfunda({ topeMicro: 90 * M, gastadoMicro: 0, faltaMicro: 0, faltaTemas: 0 }), { quedanMicro: 90 * M, temas: null, dias: null, porTemaMicro: null });
});

test('las opciones de «Darle más IA» y su costo aproximado (costo medido, o el de por defecto)', () => {
  assert.equal(costoPorUso({ usdMicro: 1 * M, usos: 100 }), 10_000);
  assert.equal(costoPorUso({ usdMicro: 1 * M, usos: 2 }), COSTO_USO_POR_DEFECTO_MICRO, 'con menos de 5 usos no se mide');
  assert.deepEqual(opcionesRegalo({ planUsos: 300, planDias: 30, costoUsoMicro: 10_000 }), [
    { id: 'usos50', tipo: 'usos', usos: 50, costoMicro: 500_000 },
    { id: 'semana', tipo: 'tiempo', dias: 7, usos: 70, costoMicro: 700_000 },
    { id: 'mes', tipo: 'tiempo', dias: 30, usos: 300, costoMicro: 3_000_000 },
  ]);
  assert.deepEqual(opcionesRegalo({ modo: 'minutos' }).map(o => o.id), ['usos50'], 'sin planes no se regala tiempo');
});

test('quitar usos: solo lo regalado, nunca lo usado ni lo pagado; nunca queda negativo; todo queda anotado', () => {
  const { db, admin, otro } = preparar({ ahora: T0 });
  db.prepare("INSERT INTO academia_ia_minutos (usuario_id, minutos, motivo, creado_en) VALUES (?, 10, 'ajuste', ?)").run(otro, new Date(T0).toISOString());
  regalarUsos(db, otro, 50, admin, T0);
  assert.equal(quitarUsos(db, otro, 30, admin, T0).quitados, 30);
  assert.equal(saldoIa(db, otro, T0).minutos, 30, '10 del ajuste + 20 regalados');
  // Usa 25 (filas de uso): de lo regalado quedan como mucho 5 que se pueden quitar.
  db.prepare("INSERT INTO academia_ia_minutos (usuario_id, minutos, motivo, creado_en) VALUES (?, -25, 'uso', ?)").run(otro, new Date(T0).toISOString());
  assert.equal(quitarUsos(db, otro, 'todo', admin, T0).quitados, 5);
  assert.equal(saldoIa(db, otro, T0).minutos, 0);
  assert.throws(() => quitarUsos(db, otro, 'todo', admin, T0), e => e.clave === 'nada_que_quitar');
  assert.throws(() => quitarUsos(db, otro, 0, admin, T0), e => e.clave === 'usos_no_validos');
  assert.throws(() => quitarUsos(db, admin, 1, admin, T0), e => e.clave === 'no_existe');
  assert.equal(filas(db, otro), 5, 'nada se borra: ajuste, regalo, quitar, uso, quitar');
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'ia_quitar_usos'").get().n >= 2);
});

test('dar y quitar tiempo: sin plan, un plan de regalo; con plan pagado, nunca antes de lo pagado; cambiar la fecha', () => {
  const { db, admin, otro } = preparar({ ahora: T0 });
  // Sin plan: +1 semana = un plan de regalo de 7 días con los usos de una semana de IA Estándar (300/30 × 7).
  regalarTiempo(db, otro, 7, admin, T0);
  let pl = leerPlan(db, otro);
  assert.deepEqual([pl.regalo, pl.usos, pl.hasta], [true, 70, new Date(T0 + 7 * DIA_MS).toISOString()]);
  assert.equal(derechoIa(db, otro, T0).fuente, 'plan');
  quitarTiempo(db, otro, 'todo', admin, T0);
  assert.equal(derechoIa(db, otro, T0 + 1).plan.vencido, true, 'quitar todo: el regalo se acaba');
  assert.throws(() => quitarTiempo(db, otro, 7, admin, T0), e => e.clave === 'nada_que_quitar');

  // Con un plan pagado (hasta T0 + 10 días, 300 usos): +1 mes, −2 meses → vuelve exacto a lo pagado.
  const pagado = { plan: 'estandar', nombre: 'IA Estándar', usos: 300, desde: new Date(T0 - 20 * DIA_MS).toISOString(), hasta: new Date(T0 + 10 * DIA_MS).toISOString(), pago: 7, por: admin };
  guardarAjuste(db, `academia.ia.plan.${otro}`, JSON.stringify(pagado));
  regalarTiempo(db, otro, 30, admin, T0);
  pl = leerPlan(db, otro);
  assert.deepEqual([pl.usos, pl.hasta, pl.pago], [600, new Date(T0 + 40 * DIA_MS).toISOString(), 7]);
  assert.throws(() => regalarTiempo(db, otro, 91, admin, T0), e => e.clave === 'dias_no_validos');
  quitarTiempo(db, otro, 7, admin, T0);
  assert.deepEqual([leerPlan(db, otro).usos, leerPlan(db, otro).hasta], [530, new Date(T0 + 33 * DIA_MS).toISOString()]);
  quitarTiempo(db, otro, 60, admin, T0);
  assert.deepEqual([leerPlan(db, otro).usos, leerPlan(db, otro).hasta], [300, pagado.hasta], 'nunca menos de lo pagado');
  // Cambiar la fecha: hacia atrás de lo pagado se queda en lo pagado; hacia adelante se mueve.
  regalarTiempo(db, otro, 7, admin, T0);
  cambiarFinRegalo(db, otro, '2026-11-12', admin, T0);
  assert.equal(leerPlan(db, otro).hasta, pagado.hasta);
  aplicarOpcion(db, otro, { tipo: 'fecha', fecha: '2026-12-31' }, admin, T0);
  assert.equal(leerPlan(db, otro).hasta, new Date(Date.parse('2026-12-31T23:59:00-04:00')).toISOString());
  assert.throws(() => cambiarFinRegalo(db, otro, '2028-01-01', admin, T0), e => e.clave === 'fecha_no_valida');
  // «Quitar todo lo regalado» (usos y tiempo a la vez).
  regalarUsos(db, otro, 40, admin, T0);
  const r = aplicarOpcion(db, otro, { accion: 'quitar', tipo: 'todo' }, admin, T0);
  assert.deepEqual([r.quitados, r.tiempo, leerPlan(db, otro).hasta, leerPlan(db, otro).usos], [40, true, pagado.hasta, 300]);
  assert.throws(() => aplicarOpcion(db, otro, { accion: 'quitar', tipo: 'todo' }, admin, T0), e => e.clave === 'nada_que_quitar');
  // Una compra nueva (otro pago) empieza de cero: lo regalado antes ya no es «quitable».
  guardarAjuste(db, `academia.ia.plan.${otro}`, JSON.stringify({ ...pagado, pago: 8, desde: new Date(T0).toISOString() }));
  assert.throws(() => quitarTiempo(db, otro, 7, admin, T0), e => e.clave === 'nada_que_quitar');
});

test('la tarjeta: los 5 topes, el pronóstico con el gasto de 7 días y el conflicto; la corta sin alumnos', () => {
  const { db, config, admin, otro, espacioOtro } = preparar({ ahora: T0, tope: 70 * M });
  const meter = (ms, micro) => db.prepare(`INSERT INTO ia_llamadas (espacio_id, usuario_id, proposito, proveedor, modelo, estado, reservado_micro, costo_micro, mes, creada_en)
    VALUES (?, ?, 'instructor_explicar', 'anthropic', 'x', 'hecha', 0, ?, ?, ?)`).run(espacioOtro, otro, micro, new Date(ms).toISOString().slice(0, 7), new Date(ms).toISOString());
  meter(T0 - 2 * DIA_MS, 14 * M); meter(T0 - 9 * DIA_MS, 16 * M); meter(T0 - 20 * DIA_MS, 5 * M);
  assert.equal(gastoUltimosDias(db, T0), 14 * M, 'solo los últimos 7 días');
  guardarAjuste(db, 'fabrica.config', JSON.stringify({ profunda: { topeMicro: 90 * M } }));
  const d = vistaDinero(db, config, { ahora: T0 });
  assert.deepEqual(d.topes.map(x => x.id), ['general', 'todo', 'chat', 'mejora', 'alumnos']);
  assert.equal(d.maxGeneralMicro, 100 * M);
  assert.deepEqual([d.topes[0].usadoMicro, d.topes[4].usadoMicro], [30 * M, 30 * M], 'el mes de cobro (sin octubre) y lo de los alumnos');
  assert.deepEqual([d.pronostico.estado, d.pronostico.dias], ['alcanza', 20], 'US$40 libres a US$2/día');
  assert.equal(d.conflicto?.paraEnMicro, 56 * M, 'la mejora (US$90) se para en el 80 % de US$70');
  assert.equal(d.alumnos.length, 1);
  assert.ok(d.opciones.length >= 1);
  const c = vistaDinero(db, config, { ahora: T0, corto: true });
  assert.equal(c.alumnos, undefined);
  void admin;
});

test('las claves de texto de la tarjeta existen en es y en (sin repetir)', () => {
  const codigo = readFileSync(join(RAIZ, 'public', 'dinero-ia-vista.js'), 'utf8');
  const claves = new Set([...codigo.matchAll(/t\('((?:dinero|error)\.[a-z_.]+)'/g)].map(m => m[1]));
  for (const k of ['general', 'todo', 'chat', 'mejora', 'alumnos']) { claves.add(`dinero.tope.${k}`); claves.add(`dinero.tope.${k}_sin`); }
  for (const k of ['mes', 'ronda']) claves.add(`dinero.periodo.${k}`);
  for (const k of ['dar', 'quitar']) claves.add(`dinero.op.listo_${k}`);
  for (const k of ['nada_que_quitar', 'dias_no_validos', 'solo_con_planes', 'sin_regalo_tiempo', 'fecha_no_valida']) claves.add(`error.${k}`);
  for (const idioma of ['es', 'en']) {
    const texto = readFileSync(join(RAIZ, 'public', 'i18n', `${idioma}.json`), 'utf8');
    const textos = JSON.parse(texto);
    for (const k of claves) assert.ok(textos[k], `${idioma}: falta ${k}`);
    const todas = [...texto.matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
    assert.equal(todas.length, new Set(todas).size, `${idioma}: claves repetidas`);
  }
});
