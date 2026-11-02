import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = f => readFileSync(new URL(`../public/${f}`, import.meta.url));
const hash = f => createHash('sha256').update(read(f)).digest('hex').slice(0, 16);

test('la versión para TVs y navegadores viejos está al día con app.js y styles.css', () => {
  assert.ok(read('app.legacy.js').toString().slice(0, 200).includes(`(${hash('app.js')})`), 'Cambiaste app.js: corre node tools/build-legacy.cjs');
  assert.ok(read('styles.legacy.css').toString().slice(0, 200).includes(`(${hash('styles.css')})`), 'Cambiaste styles.css: corre node tools/build-legacy.cjs');
  assert.ok(!read('styles.legacy.css').toString().includes('var(--'), 'el CSS viejo no debe tener variables');
  // Cosas que las TVs viejas (Chromium 47) no tienen y no se pueden imitar
  const bad = read('app.legacy.js').toString().match(/\b(new Proxy|Reflect\.|WeakRef|URLSearchParams|AbortController|IntersectionObserver|ResizeObserver|structuredClone)\b/);
  assert.equal(bad, null, `app.js usa algo que las TVs viejas no tienen: ${bad && bad[0]}`);
});
