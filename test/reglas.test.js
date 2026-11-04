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

// Huella de CADA cambio de base. Si alguien edita uno ya publicado, esta prueba falla: los cambios
// publicados nunca se editan; se agrega uno nuevo al final. Una migración nueva también necesita su
// huella aquí (así no se puede olvidar congelarla al publicar).
const MIGRACIONES_PUBLICADAS = {
  1: 'e7d3afb3583848d13303951ce7d309319b7ad05b7f47b43677597499edc6d2f4',
  2: 'faedbc4c80a34ab4085bdea7aa2330cb28148e69e14d7f1564c5ce3621bd0a53',
  3: 'e1c181eba7d2c793921aefac7c80d2c7e2377dc7ed750552f6ae105e3bc9f658',
  4: '46758487c7db33997048188be268fea4420332e1b08bcc431d82114607529860',
};

test('los cambios de base ya publicados no se editan, y cada uno tiene su huella', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const porId = new Map(MIGRACIONES.map(m => [m.id, m]));
  for (const [id, huella] of Object.entries(MIGRACIONES_PUBLICADAS)) {
    const m = porId.get(Number(id));
    assert.ok(m, `desapareció la migración publicada ${id}`);
    assert.equal(createHash('sha256').update(m.sql).digest('hex'), huella, `se editó la migración publicada ${id}: agrega una nueva en su lugar`);
  }
  for (const m of MIGRACIONES) assert.ok(m.id in MIGRACIONES_PUBLICADAS, `la migración ${m.id} no tiene su huella en MIGRACIONES_PUBLICADAS`);
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

// Fase 1, parte c: la fila de tareas.
test('las transacciones solo se abren en src/nucleo/db.js (enTransaccion), nunca a mano en otro archivo', () => {
  const patron = /\b(?:exec|prepare)\(\s*['"`]\s*(?:BEGIN|SAVEPOINT|COMMIT|ROLLBACK|RELEASE|END)\b/i;
  for (const f of codigo) {
    if (relative(SRC, f) === join('nucleo', 'db.js')) continue;
    assert.doesNotMatch(readFileSync(f, 'utf8'), patron, `${relative(RAIZ, f)} abre o cierra una transacción a mano: usa enTransaccion`);
  }
});

test('solo src/tareas/supervisor.js puede encender otros procesos (node:child_process)', () => {
  for (const f of codigo) {
    if (relative(SRC, f) === join('tareas', 'supervisor.js')) continue;
    assert.doesNotMatch(readFileSync(f, 'utf8'), /['"]node:child_process['"]/, `${relative(RAIZ, f)} usa node:child_process`);
  }
});

test('la migración 4 tiene un solo CHECK (el del estado de las tareas): un CHECK nunca se puede ampliar', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const m = MIGRACIONES.find(x => x.id === 4);
  assert.ok(m, 'falta la migración 4');
  assert.equal((m.sql.match(/\bCHECK\b/gi) || []).length, 1);
  assert.match(m.sql, /estado TEXT NOT NULL DEFAULT 'lista'\s+CHECK \(estado IN \('lista', 'en_curso', 'hecha', 'fallida', 'cancelada', 'revisar'\)\)/);
});

test('cada tipo de tarea está bien definido, y en src/ no hay tipos de prueba', async () => {
  const { TIPOS, CUPOS, definicion } = await import('../src/tareas/tipos.js');
  const tipos = Object.keys(TIPOS);
  assert.ok(tipos.length > 0);
  for (const tipo of tipos) {
    const d = definicion(tipo);
    assert.match(tipo, /^[a-z]+\.[a-z_]+$/, `nombre de tipo raro: ${tipo}`);
    assert.ok(!tipo.startsWith('prueba.'), `${tipo}: los tipos de prueba van en test/, nunca en src/`);
    assert.ok(Object.hasOwn(CUPOS, d.cupo), `${tipo}: cupo desconocido ${d.cupo}`);
    assert.ok(Number.isSafeInteger(d.maxFallos) && d.maxFallos >= 1, `${tipo}: maxFallos debe ser 1 o más`);
    assert.ok(Number.isFinite(d.tiempoPorPasoMs) && d.tiempoPorPasoMs > 0 && d.tiempoPorPasoMs <= 600_000, `${tipo}: tiempoPorPasoMs debe ser de 10 minutos o menos`);
    assert.ok(Number.isSafeInteger(d.fase) && d.fase >= 1, `${tipo}: fase no válida`);
    assert.equal(typeof d.repetible, 'boolean', `${tipo}: repetible debe ser true o false`);
    assert.equal(typeof d.ignoraFrenos, 'boolean', `${tipo}: ignoraFrenos debe ser true o false`);
  }
  for (const f of codigo) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /['"`]prueba\./, `${relative(RAIZ, f)} menciona un tipo de prueba`);
  }
});

// Todo lo que carga el trabajador (sus imports, y los imports de sus imports…), empezando por trabajador.js.
function grafoDeImports(inicio) {
  const patron = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const archivosVistos = new Set();
  const modulosDeNode = new Set();
  const pendientes = [inicio];
  while (pendientes.length) {
    const archivo = pendientes.pop();
    if (archivosVistos.has(archivo)) continue;
    archivosVistos.add(archivo);
    for (const m of readFileSync(archivo, 'utf8').matchAll(patron)) {
      const destino = m[1] || m[2] || m[3];
      if (destino.startsWith('node:')) modulosDeNode.add(destino);
      else if (destino.startsWith('.')) pendientes.push(resolve(dirname(archivo), destino));
      else modulosDeNode.add(destino);
    }
  }
  return { archivos: [...archivosVistos], modulos: [...modulosDeNode] };
}

test('el trabajador nunca carga el servidor web: ni node:http, ni src/app.js, ni src/api/, y nunca llama a abrirBase', () => {
  const { archivos, modulos } = grafoDeImports(join(SRC, 'tareas', 'trabajador.js'));
  assert.ok(archivos.length > 5, 'el grafo de imports del trabajador salió vacío');
  for (const prohibido of ['node:http', 'node:https', 'node:http2', 'node:net', 'http', 'https']) {
    assert.ok(!modulos.includes(prohibido), `el trabajador carga ${prohibido}`);
  }
  assert.ok(!modulos.includes('node:child_process'), 'el trabajador no enciende procesos');
  for (const archivo of archivos) {
    const nombre = relative(SRC, archivo);
    assert.notEqual(nombre, 'app.js', 'el trabajador carga src/app.js');
    assert.notEqual(nombre, 'server.js', 'el trabajador carga src/server.js');
    assert.ok(!nombre.startsWith(`api${sep}`), `el trabajador carga ${nombre}`);
    assert.notEqual(nombre, join('tareas', 'supervisor.js'), 'el trabajador carga el supervisor');
    // abrirBase crea, cambia y copia la base: eso solo lo hace el servidor web. El trabajador usa conectarBase.
    const sinDefinicion = readFileSync(archivo, 'utf8').replace(/function\s+abrirBase\s*\(/g, '');
    assert.doesNotMatch(sinDefinicion, /\babrirBase\s*\(/, `${nombre} (cargado por el trabajador) llama a abrirBase`);
  }
});

test('cada tipo de tarea tiene su manejador en src/tareas/manejadores.js, y cada manejador su tipo', async () => {
  const { TIPOS } = await import('../src/tareas/tipos.js');
  const { MANEJADORES } = await import('../src/tareas/manejadores.js');
  for (const tipo of Object.keys(TIPOS)) assert.equal(typeof MANEJADORES[tipo]?.paso, 'function', `${tipo} no tiene manejador`);
  for (const tipo of Object.keys(MANEJADORES)) assert.ok(Object.hasOwn(TIPOS, tipo), `el manejador ${tipo} no tiene su tipo en TIPOS`);
});

test('las pantallas nunca cargan el código de los trabajos (src/tareas/manejadores.js solo lo usa el trabajador)', () => {
  const { archivos } = grafoDeImports(join(SRC, 'server.js'));
  const delServidor = new Set(archivos.map(a => relative(SRC, a)));
  for (const soloDelTrabajador of [join('tareas', 'manejadores.js'), join('tareas', 'ejecutor.js'), join('tareas', 'trabajador.js')]) {
    assert.ok(!delServidor.has(soloDelTrabajador), `el servidor web carga ${soloDelTrabajador}`);
  }
});
