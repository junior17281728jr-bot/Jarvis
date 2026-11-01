import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { verifyLedger } from '../src/core/ledger.js';
import { settleMultiplier, expectedReturn, winProbability, DEFAULT_PAYOUTS as P } from '../src/lottery/payouts.js';
import { recordObservation, history } from '../src/lottery/results.js';
import { scan } from '../src/lottery/stats.js';
import { backtest, compareMethods, sealPlay, settlePending, playStats, nextDraw } from '../src/lottery/simulator.js';
import { parseResults, htmlToText } from '../src/lottery/sources.js';
import { SEED } from '../src/lottery/seed-data.js';
import { rng, pad2 } from '../src/core/util.js';

test('pagos: quiniela, palé y tripleta', () => {
  const d = ['64', '06', '71'];
  assert.equal(settleMultiplier('quiniela', ['64'], d), 60);
  assert.equal(settleMultiplier('quiniela', ['71'], d), 4);
  assert.equal(settleMultiplier('quiniela', ['64'], ['64', '64', '01']), 68); // sale dos veces: cobra ambas
  assert.equal(settleMultiplier('pale', ['06', '64'], d), 1000);
  assert.equal(settleMultiplier('pale', ['06', '71'], d), 100);
  assert.equal(settleMultiplier('pale', ['06', '99'], d), 0);
  assert.equal(settleMultiplier('tripleta', ['71', '64', '06'], d), 20000);
  assert.equal(settleMultiplier('tripleta', ['71', '64', '99'], d), 100);
  assert.equal(settleMultiplier('tripleta', ['71', '98', '99'], d), 0);
});

test('valor esperado exacto con pagos típicos', () => {
  assert.equal(Math.round(expectedReturn('quiniela', P) * 10000) / 100, 72);
  assert.equal(Math.round(expectedReturn('pale', P) * 10000) / 100, 41.76);
  assert.equal(Math.round(expectedReturn('tripleta', P) * 10000) / 100, 29.64);
  assert.ok(Math.abs(winProbability('quiniela') - (1 - 0.99 ** 3)) < 1e-9);
});

test('verificación con dos fuentes y conflictos', () => {
  const db = openDb(':memory:');
  let r = recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'a', nums: ['64', '06', '71'] });
  assert.equal(r.status, 'una_fuente');
  r = recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'b', nums: ['64', '06', '71'] });
  assert.equal(r.status, 'verificado');
  r = recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'c', nums: ['64', '06', '17'] });
  assert.equal(r.status, 'conflicto');
  assert.equal(r.nums, null);
  assert.throws(() => recordObservation(db, { game: 'leidsa', date: '2026-10-28', source: 'a', nums: ['6', '06', '71'] }), /no válidos/);
});

test('el lector de páginas encuentra fechas y números', () => {
  const html = '<div><h3>Martes 27 de octubre de 2026</h3><span>8:55 PM</span><b>64</b><b>06</b><b>71</b></div><p>26/10/2026</p><i>16</i> <i>59</i> <i>61</i>';
  const rows = parseResults(htmlToText(html));
  assert.deepEqual(rows, [{ date: '2026-10-27', nums: ['64', '06', '71'] }, { date: '2026-10-26', nums: ['16', '59', '61'] }]);
});

test('vigilancia: azar justo no da falsas alarmas; un número trucado sí se detecta', () => {
  const r = rng(3);
  const fair = Array.from({ length: 400 }, () => ({ nums: [0, 1, 2].map(() => pad2(Math.floor(r() * 100))) }));
  const s1 = scan(fair, { sims: 300 });
  assert.equal(s1.tests.filter(t => t.anomaly).length, 0);
  const rigged = fair.map((d, i) => (i % 6 === 0 ? { nums: ['27', d.nums[1], d.nums[2]] } : d));
  const s2 = scan(rigged, { sims: 300 });
  assert.ok(s2.hotOutliers.some(h => h.num === '27'));
  assert.match(s2.verdict, /revisar/);
});

test('métodos contra el azar con los datos reales cargados', () => {
  const db = openDb(':memory:');
  for (const o of SEED) recordObservation(db, o);
  const h = history(db, 'real');
  assert.equal(h.length, 25);
  const bt = backtest(h, 'calientes', 'quiniela');
  assert.equal(bt.plays, 15);
  const cmp = compareMethods(h, 'quiniela', { sims: 100 });
  assert.equal(cmp.expectedPer100, 72);
  assert.ok(cmp.methods.length >= 4);
});

test('jugada sellada antes del cierre, liquidada con el resultado y sin cambios posibles', () => {
  const db = openDb(':memory:');
  const now = new Date('2026-10-27T20:00:00Z'); // 4:00 p.m. en RD
  const nd = nextDraw('leidsa', now);
  assert.equal(nd.date, '2026-10-27');
  const play = sealPlay(db, { game: 'leidsa', kind: 'quiniela', numbers: ['64'], stake: 10, method: 'azar', now });
  const late = new Date('2026-10-28T00:52:00Z'); // 8:52 p.m. RD: ya cerró el del 27
  assert.equal(nextDraw('leidsa', late).date, '2026-10-28');
  recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'a', nums: ['64', '06', '71'] });
  recordObservation(db, { game: 'leidsa', date: '2026-10-27', source: 'b', nums: ['64', '06', '71'] });
  assert.equal(settlePending(db), 1);
  const st = playStats(db);
  assert.equal(st.wins, 1);
  assert.equal(st.paid, 600);
  assert.equal(verifyLedger(db).ok, true);
  assert.ok(play.hash.length === 64);
});
