// Reglas del repositorio que protegen el servidor y los datos. Si alguna falla, la versión no se instala.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');
const MINIMO_DE_PRUEBAS = 2;

function archivos(dir, filtro = () => true) {
  const fuera = new Set(['.git', 'node_modules']);
  const lista = [];
  for (const nombre of readdirSync(dir)) {
    if (fuera.has(nombre)) continue;
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) lista.push(...archivos(p, filtro));
    else if (filtro(p)) lista.push(p);
  }
  return lista;
}

const codigo = archivos(SRC, p => p.endsWith('.js') || p.endsWith('.mjs'));

test('el programa nunca borra archivos ni carpetas de datos', () => {
  for (const f of codigo) {
    const texto = readFileSync(f, 'utf8');
    assert.doesNotMatch(texto, /\b(rmSync|rmdirSync|unlinkSync|limpiar)\b|\brm\(|\bunlink\(/, `${relative(RAIZ, f)} contiene una orden de borrado`);
  }
});

test('el programa solo usa módulos de Node o archivos dentro de src/', () => {
  const patron = /(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const f of codigo) {
    const texto = readFileSync(f, 'utf8');
    for (const m of texto.matchAll(patron)) {
      const destino = m[1] || m[2];
      if (destino.startsWith('node:')) continue;
      assert.ok(destino.startsWith('.'), `${relative(RAIZ, f)} importa un paquete externo: ${destino}`);
      const ruta = resolve(dirname(f), destino);
      assert.ok(ruta.startsWith(SRC), `${relative(RAIZ, f)} importa algo fuera de src/: ${destino}`);
      assert.ok(existsSync(ruta), `${relative(RAIZ, f)} importa un archivo que no existe: ${destino}`);
    }
  }
});

test('solo src/server.js abre el puerto del servidor', () => {
  for (const f of codigo) {
    if (relative(SRC, f) === 'server.js') continue;
    assert.doesNotMatch(readFileSync(f, 'utf8'), /\.listen\(/, `${relative(RAIZ, f)} abre un puerto`);
  }
});

test('las pruebas están todas en test/, sin subcarpetas, y nunca desaparecen', () => {
  const nombres = readdirSync(join(RAIZ, 'test'));
  for (const nombre of nombres) {
    assert.ok(!statSync(join(RAIZ, 'test', nombre)).isDirectory(), `test/${nombre} es una subcarpeta: sus pruebas no correrían en el servidor`);
  }
  assert.ok(nombres.filter(n => n.endsWith('.test.js')).length >= MINIMO_DE_PRUEBAS, 'faltan archivos de prueba');
});

test('ningún archivo del repositorio contiene claves secretas', () => {
  const texto = archivos(RAIZ, p => /\.(js|mjs|json|md|html|css|sh|service|txt|env|example)$/.test(p) && !p.endsWith('reglas.test.js'));
  for (const f of texto) {
    const contenido = readFileSync(f, 'utf8');
    assert.doesNotMatch(contenido, /sk-[A-Za-z0-9_-]{20,}|tskey-[A-Za-z0-9-]{10,}/, `${relative(RAIZ, f)} parece contener una clave`);
  }
});

test('existe public/sw.js (los navegadores con la app vieja lo necesitan)', () => {
  assert.ok(existsSync(join(RAIZ, 'public', 'sw.js')));
});
