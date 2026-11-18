// 0.14.33: los topes que pidió el dueño se ponen solos UNA vez (solo suben, nunca bajan; después se respeta la pantalla).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparar, T0 } from './ia-base.js';
import { topesUnaVez, TOPE_MES_MICRO, TOPE_PROFUNDA_MICRO, MARCA_TOPES, apagarMejoraUnaVez, MARCA_APAGAR } from '../src/academia/topes-una-vez.js';
import { leerConfigApp, guardarConfigApp } from '../src/academia/app-mejora.js';
import { leerConfigIa } from '../src/ia/config.js';
import { leerConfigFabrica, guardarConfigFabrica } from '../src/academia/fabrica.js';
import { leerAjuste } from '../src/academia/paquetes.js';

const M = 1_000_000;

test('0.14.33: sube el tope del mes a US$375 y el de la mejora a US$300 una sola vez; nunca baja ni se repite', () => {
  const { db, config } = preparar({ ahora: T0, tope: 70 * M });
  const r = topesUnaVez(db, { config, ahora: T0 });
  assert.equal(r.hecho, true, JSON.stringify(r));
  assert.equal(leerConfigIa(db).topeGeneralMicro, TOPE_MES_MICRO);
  assert.equal(leerConfigFabrica(db).profunda.topeMicro, TOPE_PROFUNDA_MICRO);
  assert.ok(leerAjuste(db, MARCA_TOPES));
  // El dueño después lo baja en la pantalla: no se vuelve a subir.
  guardarConfigFabrica(db, { profunda: { topeMicro: 50 * M } });
  assert.equal(topesUnaVez(db, { config, ahora: T0 + 1 }).motivo, 'ya');
  assert.equal(leerConfigFabrica(db).profunda.topeMicro, 50 * M);
  db.close();
  // Si ya tenía más alto, no lo baja.
  const b = preparar({ ahora: T0, tope: 450 * M });
  topesUnaVez(b.db, { config: b.config, ahora: T0 });
  assert.equal(leerConfigIa(b.db).topeGeneralMicro, 450 * M);
  b.db.close();
});

test('0.14.42: apaga «Mejorar todo» y «Claude mejora la app» una sola vez; si el dueño los vuelve a encender, se respeta', () => {
  const { db } = preparar({ ahora: T0 });
  guardarConfigFabrica(db, { profunda: { activa: true } });
  guardarConfigApp(db, { activa: true });
  assert.deepEqual(apagarMejoraUnaVez(db), { hecho: true });
  assert.equal(leerConfigFabrica(db).profunda.activa, false);
  assert.equal(leerConfigApp(db).activa, false);
  assert.ok(leerAjuste(db, MARCA_APAGAR));
  // El dueño los enciende otra vez en la pantalla: no se vuelven a apagar.
  guardarConfigFabrica(db, { profunda: { activa: true } });
  guardarConfigApp(db, { activa: true });
  assert.equal(apagarMejoraUnaVez(db).motivo, 'ya');
  assert.equal(leerConfigFabrica(db).profunda.activa, true);
  assert.equal(leerConfigApp(db).activa, true);
  db.close();
});
