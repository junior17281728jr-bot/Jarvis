// Quién puede entrar: solo el propio servidor (enlace https) y la red privada de Tailscale.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entradaPermitida, esLocal, esTailscale } from '../src/nucleo/red.js';

test('direcciones del propio servidor', () => {
  for (const d of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) assert.ok(esLocal(d), d);
  for (const d of ['128.0.0.1', '10.0.0.1', '']) assert.ok(!esLocal(d), d);
});

test('direcciones de la red Tailscale', () => {
  for (const d of ['100.64.0.1', '100.127.255.254', '100.101.2.3', '::ffff:100.70.1.1', 'fd7a:115c:a1e0::1', 'fd7a:115c:a1e0:ab12::5']) assert.ok(esTailscale(d), d);
  for (const d of ['100.63.255.255', '100.128.0.1', '101.64.0.1', 'fd7a:115c:a1e1::1', '203.0.113.5']) assert.ok(!esTailscale(d), d);
});

test('internet directo no entra', () => {
  for (const d of ['203.0.113.5', '8.8.8.8', '10.17.0.5', '172.16.0.1', '192.168.1.10', '2001:db8::1', undefined]) assert.ok(!entradaPermitida(d), String(d));
});
