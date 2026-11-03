// Reglas del repositorio que protegen el servidor y los datos. Si alguna falla, la versión no se instala.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RAIZ, 'src');
const MINIMO_DE_PRUEBAS = 4;

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

const codigo = archivos(SRC, p => /\.(js|mjs|cjs)$/.test(p));

test('el programa nunca borra archivos ni carpetas de datos', () => {
  for (const f of codigo) {
    const texto = readFileSync(f, 'utf8');
    assert.doesNotMatch(texto, /\b(rmSync|rmdirSync|unlinkSync|limpiar)\b|\brm\(|\bunlink\(/, `${relative(RAIZ, f)} contiene una orden de borrado`);
  }
});

test('el programa solo usa módulos de Node o archivos dentro de src/', () => {
  const patron = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const f of codigo) {
    const texto = readFileSync(f, 'utf8');
    const nombre = relative(RAIZ, f);
    assert.doesNotMatch(texto, /\brequire\s*\(|\bcreateRequire\b/, `${nombre} usa require: solo se permite import`);
    assert.doesNotMatch(texto, /\bimport\(\s*[^'"\s]/, `${nombre} usa import() con algo que no es un texto fijo`);
    for (const m of texto.matchAll(patron)) {
      const destino = m[1] || m[2] || m[3];
      if (destino.startsWith('node:')) continue;
      assert.ok(destino.startsWith('.'), `${nombre} importa un paquete externo: ${destino}`);
      const ruta = resolve(dirname(f), destino);
      assert.ok(ruta.startsWith(SRC + sep), `${nombre} importa algo fuera de src/: ${destino}`);
      assert.ok(existsSync(ruta), `${nombre} importa un archivo que no existe: ${destino}`);
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
  const claves = [
    /sk-[A-Za-z0-9_-]{20,}/, /sk-ant-[A-Za-z0-9_-]{20,}/, /sk_(?:live|test)_[A-Za-z0-9]{16,}/, /tskey-[A-Za-z0-9-]{10,}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AIza[0-9A-Za-z_-]{35}/, /dop_v1_[a-f0-9]{40,}/,
    /\b\d{8,10}:AA[0-9A-Za-z_-]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  const texto = archivos(RAIZ, p => /\.(js|mjs|cjs|ts|json|md|html|css|sh|service|txt|ya?ml|toml|env|example)$|\.env(\.|$)/.test(p) && !p.endsWith('reglas.test.js'));
  for (const f of texto) {
    const contenido = readFileSync(f, 'utf8');
    for (const re of claves) assert.ok(!re.test(contenido), `${relative(RAIZ, f)} parece contener una clave secreta (${re.source.slice(0, 12)}…)`);
  }
});

test('existe public/sw.js (los navegadores con la app vieja lo necesitan)', () => {
  assert.ok(existsSync(join(RAIZ, 'public', 'sw.js')));
});

// Huella de cada cambio de base YA PUBLICADO. Si alguien edita uno, esta prueba falla:
// los cambios publicados nunca se editan; se agrega uno nuevo al final.
const MIGRACIONES_PUBLICADAS = {
  1: 'e7d3afb3583848d13303951ce7d309319b7ad05b7f47b43677597499edc6d2f4',
};

test('los cambios de base ya publicados no se editan, y los nuevos van al final', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const porId = new Map(MIGRACIONES.map(m => [m.id, m]));
  for (const [id, huella] of Object.entries(MIGRACIONES_PUBLICADAS)) {
    const m = porId.get(Number(id));
    assert.ok(m, `desapareció la migración publicada ${id}`);
    assert.equal(createHash('sha256').update(m.sql).digest('hex'), huella, `se editó la migración publicada ${id}: agrega una nueva en su lugar`);
  }
  const maxPublicada = Math.max(...Object.keys(MIGRACIONES_PUBLICADAS).map(Number));
  for (const m of MIGRACIONES) if (!(m.id in MIGRACIONES_PUBLICADAS)) assert.ok(m.id > maxPublicada, `la migración nueva ${m.id} debe ir después de ${maxPublicada}`);
});

test('los cambios de la base solo agregan: nunca DROP, nunca RENAME, y NOT NULL nuevo siempre con DEFAULT', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const ids = MIGRACIONES.map(m => m.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'las migraciones deben ir en orden');
  assert.equal(new Set(ids).size, ids.length, 'no puede haber dos migraciones con el mismo número');
  for (const m of MIGRACIONES) {
    assert.doesNotMatch(m.sql, /\bDROP\b|\bRENAME\b|\bDELETE\s+FROM\b|(?:^|;)\s*(?:UPDATE|REPLACE)\b|\bINSERT\s+OR\s+REPLACE\b/i, `la migración ${m.id} borra, cambia o renombra algo`);
    for (const linea of m.sql.split('\n').filter(l => /ADD\s+COLUMN/i.test(l) && /NOT\s+NULL/i.test(l))) {
      assert.match(linea, /DEFAULT/i, `la migración ${m.id} agrega una columna NOT NULL sin DEFAULT`);
    }
  }
});

test('las pruebas usan la ayuda común (sin internet, sin datos reales)', () => {
  for (const nombre of readdirSync(join(RAIZ, 'test')).filter(n => n.endsWith('.test.js') && n !== 'reglas.test.js')) {
    assert.match(readFileSync(join(RAIZ, 'test', nombre), 'utf8'), /from '\.\/ayuda\.js'|import '\.\/ayuda\.js'/, `test/${nombre} no importa ./ayuda.js`);
  }
});
