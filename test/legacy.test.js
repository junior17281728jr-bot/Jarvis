import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('la versión para TVs y navegadores viejos (app.legacy.js) está al día con app.js', () => {
  const hash = createHash('sha256').update(readFileSync(new URL('../public/app.js', import.meta.url))).digest('hex').slice(0, 16);
  const head = readFileSync(new URL('../public/app.legacy.js', import.meta.url), 'utf8').slice(0, 200);
  assert.ok(head.includes(`(${hash})`), 'Cambiaste app.js: corre tools/build-legacy.sh para regenerar app.legacy.js');
  assert.ok(!/\?\.|\?\?/.test(readFileSync(new URL('../public/app.legacy.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//, '').replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')), 'sin sintaxis moderna');
});
