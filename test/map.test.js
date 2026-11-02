import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, setSetting } from '../src/core/db.js';
import { verifyLedger } from '../src/core/ledger.js';
import { saveBars, syntheticBars } from '../src/stocks/market.js';
import { buildRanking } from '../src/motor/recommend.js';
import { updateMap, exploreStep, mapView, explain, convenience } from '../src/motor/map.js';

const cfg = {};
function setup(active, drifts) {
  const db = openDb(':memory:');
  saveBars(db, 'SPY', { source: 't', bars: syntheticBars(800, { seed: 1, drift: 0.0004 }) });
  Object.entries(drifts).forEach(([s, d], i) => saveBars(db, s, { source: 't', bars: syntheticBars(800, { seed: i + 7, drift: d, vol: 0.012 }) }));
  setSetting(db, 'global', 'stocks.universe', ['SPY', ...active]);
  return db;
}

test('explícito: cada empresa dice si invertir o no, por qué, qué le falta y cuánto tiempo dejarla', () => {
  const red = explain({ light: 'rojo', probBeat: 0.3, reasons: [{ factor: 'tendencia', text: 'Va peor que el mercado.' }], contributions: [{ factor: 'tendencia', contribution: -12 }], timing: null });
  assert.equal(red.verdict, 'No te recomiendo invertir ahora'); assert.equal(red.amountUsd, 0);
  assert.match(red.why[0], /peor que el mercado/); assert.match(red.need[0], /mejor que al mercado/);
  const green = explain({ light: 'verde', probBeat: 0.62, reasons: [{ factor: 'tendencia', text: 'Le gana al mercado.' }], contributions: [{ factor: 'tendencia', contribution: 15 }], timing: { recommended: { days: 126, label: '6 meses' }, pProfit: { 126: 0.72 } } });
  assert.equal(green.verdict, 'Sí, te recomiendo invertir US$10'); assert.deepEqual(green.need, []);
  assert.match(green.hold, /al menos 6 meses.*7 de cada 10/); assert.ok(green.exitIf.length);
  const slow = explain({ light: 'verde', probBeat: 0.6, reasons: [], contributions: [], timing: { recommended: null, immediate: false, pProfit: {} } });
  assert.doesNotMatch(slow.hold, /segur/); assert.match(slow.hold, /1 año o más/);
  assert.ok(convenience({ light: "verde", probBeat: 0.65, projection: { personal: { probable: 2, lossChance: 0.1 } }, timing: { immediate: true } }) > convenience({ light: "rojo", probBeat: 0.35, projection: { personal: { probable: -1, lossChance: 0.6 } }, timing: null }));
});

test('el mapa anota quién sube y quién baja, sellado y sin borrar nada', () => {
  const db = setup(['AAA', 'BBB'], { AAA: 0.0012, BBB: -0.0006 });
  const cards = buildRanking(db, { symbols: ['SPY', 'AAA', 'BBB'], date: '2026-10-01' });
  updateMap(db, cards, { date: '2026-10-01' });
  const v = mapView(db);
  assert.equal(v.moves.length, 2);
  const all = [...v.zones.recomendada, ...v.zones.observacion, ...v.zones.no_recomendada];
  assert.equal(all.length, 2); assert.ok(all.every(r => r.verdict && r.why.length && r.hold));
  assert.throws(() => db.prepare('DELETE FROM map_moves').run(), /no se pueden borrar/);
  assert.equal(verifyLedger(db).ok, true);
});

test('el explorador estudia empresas nuevas y reemplaza la que lleva mucho tiempo en "no te recomiendo"', async () => {
  const many = Array.from({ length: 15 }, (_, i) => 'Z' + String.fromCharCode(65 + i));
  const drifts = Object.fromEntries(many.map((s, i) => [s, i === 0 ? -0.0015 : 0.0006]));
  drifts.NVDA = 0.0016; drifts.AAPL = 0.0016; drifts.MSFT = 0.0016;
  const db = setup(many, drifts);
  const cards = buildRanking(db, { symbols: ['SPY', ...many], date: '2026-10-01' });
  updateMap(db, cards, { date: '2026-10-01' });
  db.prepare("UPDATE map_entries SET zone = 'no_recomendada', reds = 12, conv = 5 WHERE symbol = 'ZA'").run();
  const r = await exploreStep(db, cfg, { n: 3, fetchBars: async () => {}, date: '2026-10-02' });
  assert.equal(r.studied.filter(x => !x.error).length, 3, JSON.stringify(r.studied));
  assert.equal(r.swap?.out, 'ZA');
  const v = mapView(db);
  assert.ok(v.zones.descartada.some(x => x.symbol === 'ZA'));
  assert.ok(v.moves.some(m => m.symbol === 'ZA' && m.to_zone === 'descartada' && /revisiones seguidas/.test(m.reason)));
  // La que salió no se olvida: se vuelve a estudiar después de 14 días
  const again = await exploreStep(db, cfg, { n: 50, fetchBars: async () => {}, date: '2026-10-20' });
  assert.ok(again.studied.some(x => x.symbol === 'ZA'));
});

test('vigila tus inversiones reales: avisa una sola vez si caen 8% o pasan a "No te recomiendo"', async () => {
  const { watchRealPositions } = await import('../src/motor/map.js');
  const { addReal } = await import('../src/motor/track.js');
  const { saveQuote } = await import('../src/stocks/market.js');
  const db = openDb(':memory:');
  addReal(db, 1, { module: 'bolsa', symbol: 'MSFT', amountUsd: 10, price: 500 });
  saveQuote(db, { symbol: 'MSFT', price: 455, prevClose: 460, asOf: new Date().toISOString(), kind: 'prueba', source: 'prueba' });
  const a = watchRealPositions(db);
  assert.equal(a.length, 1); assert.match(a[0].text, /-9%.*-8%/);
  assert.equal(watchRealPositions(db).length, 0); // no repite el aviso
});

test('según TU dinero: 10% por idea, y solo propone poner más cuando las 5 pruebas se cumplen', async () => {
  const { sizeFor, baseAmount, finder, bigBetCheck } = await import('../src/motor/sizing.js');
  assert.equal(baseAmount('verde', 1000), 100); assert.equal(baseAmount('amarillo', 1000), 50); assert.equal(baseAmount('rojo', 1000), 0);
  assert.equal(baseAmount('verde', 30), 5); // mínimo práctico
  const strong = { light: 'verde', probMethod: 'calibrado', timing: { recommended: { days: 126 }, h: { 126: { p: 0.75 } } }, projection: { personal: { lossChance: 0.2 } } };
  const yes = sizeFor(strong, { usd: 1000 }, { n: 200, hits: 130, hitRate: 0.65, lo: 0.58 });
  assert.equal(yes.canMore, true); assert.equal(yes.maxUsd, 200);
  const no = sizeFor(strong, { usd: 1000 }, { n: 290, hits: 148, hitRate: 0.51, lo: 0.45 });
  assert.equal(no.canMore, false); assert.equal(no.maxUsd, 100); assert.match(no.more, /Pon como máximo/);
  assert.ok(no.checks.some(c => !c.ok && /moneda/.test(c.text)));
  // Buscador: pedir 8–10 de cada 10 cuando no existe -> lo dice claro y muestra lo más cercano
  const rows = [{ symbol: 'AAA', zone: 'recomendada', conv: 70, card: { timing: { h: { 252: { p: 0.62, bad: -0.1, median: 0.08 } } } } }, { symbol: 'BBB', zone: 'no_recomendada', conv: 20, card: { timing: { h: { 252: { p: 0.85, bad: -0.05, median: 0.12 } } } } }];
  const r1 = finder(rows, { minP: 0.8, maxP: 1, days: 252, amount: 100 });
  assert.deepEqual(r1.matches.map(m => m.symbol), ['BBB']); assert.equal(r1.matches[0].badUsd, -5);
  const r2 = finder(rows, { minP: 0.9, maxP: 1, days: 252 });
  assert.equal(r2.matches.length, 0); assert.match(r2.honest, /Ninguna llega a 9 de cada 10/); assert.equal(r2.closest[0].symbol, 'BBB');
  const big = bigBetCheck({ amount: 600, budget: { usd: 1000, emergency: true }, picks: [] });
  assert.equal(big.big, true); assert.match(big.verdict, /No te recomiendo/);
});
