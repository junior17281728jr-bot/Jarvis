// Clases visuales: reglas de los archivos de public/clase (sin innerHTML, sin estilos incrustados, sin redes externas).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'clase');
const archivos = readdirSync(CARPETA);

test('public/clase: nada convierte texto en código, ni carga nada de afuera', () => {
  assert.ok(archivos.includes('reproductor.js') && archivos.includes('clase.css') && archivos.includes('demo.html'));
  for (const nombre of archivos) {
    const texto = readFileSync(join(CARPETA, nombre), 'utf8');
    if (nombre.endsWith('.js')) {
      assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, nombre);
      assert.doesNotMatch(texto, /setAttribute\(\s*['"]style['"]/, `${nombre}: estilo incrustado (la CSP lo bloquea)`);
    }
    assert.doesNotMatch(texto.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ''), /https?:\/\//, `${nombre}: dirección externa`);
  }
  const html = readFileSync(join(CARPETA, 'demo.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'script incrustado');
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i, 'estilos o eventos incrustados');
});

test('los módulos (menos la galería) se importan sin navegador', async () => {
  for (const nombre of archivos.filter(n => n.endsWith('.js') && n !== 'demo.js')) {
    await import(new URL(`../public/clase/${nombre}`, import.meta.url));
  }
});

test('clase.css: todo con el prefijo clase- (o demo-), respeta el movimiento reducido y el tema oscuro', () => {
  const css = readFileSync(join(CARPETA, 'clase.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-tema="oscuro"/);
  assert.match(css, /prefers-color-scheme: dark/);
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of sinComentarios.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    if (/^\d/.test(m[1])) continue;
    assert.match(m[1], /^(clase-|demo-)/, `clase CSS sin prefijo: .${m[1]}`);
  }
});
