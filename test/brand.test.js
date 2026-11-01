import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/core/db.js';
import { saveBrand, publicBrand, logoFile, manifest, decodeLogo } from '../src/core/brand.js';

const PNG = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');

test('marca propia: nombre, dueño, color y logo; se ve en el manifiesto del celular', () => {
  const db = openDb(':memory:');
  assert.equal(publicBrand(db).name, 'JARVIS');
  const b = saveBrand(db, { name: '  Inversiones Junior ', owner: 'Junior', color: 'dorado', logo: PNG });
  assert.equal(b.name, 'Inversiones Junior'); assert.equal(b.owner, 'Junior'); assert.equal(b.hasLogo, true); assert.equal(b.palette.name, 'Dorado');
  assert.equal(logoFile(db).type, 'image/png');
  const m = manifest(db); assert.equal(m.name, 'Inversiones Junior'); assert.match(m.icons[0].src, /\/brand\/logo/);
  assert.equal(saveBrand(db, { removeLogo: true }).hasLogo, false);
  assert.equal(manifest(db).icons[0].src, '/icon.svg');
});

test('marca propia: rechaza imágenes falsas, SVG, colores raros y nombres vacíos', () => {
  const db = openDb(':memory:');
  assert.throws(() => saveBrand(db, { logo: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') }), /no parece una imagen/);
  assert.throws(() => decodeLogo('data:image/svg+xml;base64,PHN2Zz4='), /PNG, JPG o WEBP/);
  assert.throws(() => saveBrand(db, { color: 'red;}body{' }), /Color no válido/);
  assert.throws(() => saveBrand(db, { name: '   ' }), /vacío/);
  assert.equal(saveBrand(db, { name: '<b>Mi</b> app' }).name, 'bMi/b app');
});
