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
    // Fase 1, parte d: una llave maestra de OPORTIA (el archivo oportia-llave-secretos) nunca va al repositorio.
    /oportia-llave-v\d+:[A-Za-z0-9_-]{43}/,
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
  3: '7af1fad890803931148e2be3e0e3d90481229546ae8f94bb4cd9d022af9310d1',
  4: '46758487c7db33997048188be268fea4420332e1b08bcc431d82114607529860',
  5: '3c0ca4c956e2b5f453e160785c33587ba23e3b8c22302ba5ea53e42c198df720',
  6: '48eec04a1f2cd75ea034303c3790cb8cfa1b51bd638ec211b226eb284b71d8cf',
};

// Versión de package.json con la que se publicó cada cambio de base (los de antes de esta regla no están).
// Agregar un cambio de base obliga a subir la versión: así /api/setup muestra si quedó instalada o se volvió atrás.
const VERSION_DE_CADA_MIGRACION = {
  3: '0.2.0',
  4: '0.3.0',
  5: '0.4.0',
  6: '0.5.0',
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
    // Decisión pensada (parte e): la ÚNICA excepción es copias.hacer, con 30 minutos. Solo su paso «generar» sin copia en
    // el servidor (las partes van directo a Telegram) puede tardar, y se corta solo a los 25 min (la foto de la base no
    // puede quedar abierta más). Sus demás pasos vuelven en ~60 s. Cualquier otro tipo: 10 minutos o menos.
    const tope = tipo === 'copias.hacer' ? 1_800_000 : 600_000;
    assert.ok(Number.isFinite(d.tiempoPorPasoMs) && d.tiempoPorPasoMs > 0 && d.tiempoPorPasoMs <= tope, `${tipo}: tiempoPorPasoMs debe ser de ${tope / 60_000} minutos o menos`);
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

test('cada cambio de base nuevo sube la versión de package.json', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const version = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;
  const partes = v => v.split('.').map(Number);
  const comparar = (a, b) => { const [x, y] = [partes(a), partes(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const ultima = Math.max(...MIGRACIONES.map(m => m.id));
  assert.ok(ultima in VERSION_DE_CADA_MIGRACION, `el cambio de base ${ultima} no tiene su versión en VERSION_DE_CADA_MIGRACION`);
  assert.ok(comparar(version, VERSION_DE_CADA_MIGRACION[ultima]) >= 0, `package.json (${version}) es más vieja que la del cambio de base ${ultima}`);
  const ids = Object.keys(VERSION_DE_CADA_MIGRACION).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(comparar(VERSION_DE_CADA_MIGRACION[ids[i]], VERSION_DE_CADA_MIGRACION[ids[i - 1]]) > 0, `el cambio de base ${ids[i]} no subió la versión`);
  }
});

// ---------- Fase 1, parte d: la IA opcional y las claves secretas ----------

const deTodo = archivos(RAIZ, p => /\.(js|mjs|cjs|json|sh|service|html)$/.test(p) && !p.includes(`${sep}test${sep}`));
const leer = f => readFileSync(f, 'utf8');
const de = (...partes) => join(SRC, ...partes);

test('la migración 5 no tiene CHECK ni índices únicos (nunca se podrían ampliar ni quitar)', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const m = MIGRACIONES.find(x => x.id === 5);
  assert.ok(m, 'falta la migración 5');
  assert.equal((m.sql.match(/\bCHECK\b/gi) || []).length, 0);
  assert.doesNotMatch(m.sql, /CREATE\s+UNIQUE\s+INDEX/i);
  assert.deepEqual(m.sql.match(/\bUNIQUE\b/gi), ['UNIQUE'], 'solo secretos.ref (al azar) es único');
  assert.doesNotMatch(m.sql, /ADD\s+COLUMN/i);
});

test('solo src/claves/cifrado.js y src/copias/cifrar.js cifran y descifran, y solo cifrado.js conoce el nombre del archivo de la llave', () => {
  for (const f of deTodo) {
    if (f === de('claves', 'cifrado.js')) continue;
    const texto = leer(f);
    if (f !== de('copias', 'cifrar.js')) assert.doesNotMatch(texto, /\bcreate(?:Cipheriv|Decipheriv)\b/, `${relative(RAIZ, f)} cifra o descifra`);
    assert.ok(!texto.includes('oportia-llave-secretos'), `${relative(RAIZ, f)} nombra el archivo de la llave`);
  }
});

test('solo cuatro archivos pueden leer una clave descifrada (leerSecreto): los tres de la parte d y la credencial de los canales', () => {
  const permitidos = new Set([de('claves', 'almacen.js'), de('claves', 'probar.js'), de('ia', 'cliente.js'), de('canales', 'credencial.js')]);
  for (const f of deTodo) {
    if (!permitidos.has(f)) assert.doesNotMatch(leer(f), /\bleerSecreto\s*\(/, `${relative(RAIZ, f)} lee una clave descifrada`);
  }
});

test('la ÚNICA llamada a la red de src/ es src/ia/llamar.js, nunca sigue redirecciones y nunca lee el texto de un error', () => {
  const llamar = de('ia', 'llamar.js');
  for (const f of codigo) {
    if (f === llamar) continue;
    assert.doesNotMatch(leer(f), /\bfetch\s*\(/, `${relative(RAIZ, f)} llama a fetch`);
  }
  const texto = leer(llamar);
  const llamadas = [...texto.matchAll(/\bfetch\s*\(/g)];
  assert.equal(llamadas.length, 1, 'una sola llamada a fetch');
  assert.match(texto, /redirect: 'manual'/);
  assert.doesNotMatch(texto, /\.message\b/, 'el texto de un error puede traer la clave (Node pone el valor de la cabecera)');
  assert.doesNotMatch(texto, /\bconsole\./);
  // Solo el servidor web abre puertos; los módulos de IA nunca usan node:http/https/net directamente.
  for (const f of ['ia', 'claves', 'canales', 'copias'].flatMap(c => archivos(de(c)))) {
    assert.doesNotMatch(leer(f), /['"]node:(?:https?|http2|net|tls|dgram)['"]/, `${relative(RAIZ, f)} usa la red sin pasar por llamar.js`);
  }
});

test('las direcciones oficiales de los proveedores solo están en src/ia/proveedores/, y nada lee claves del entorno ni de secrets.env', () => {
  for (const f of deTodo) {
    const texto = leer(f);
    const nombre = relative(RAIZ, f);
    if (!f.startsWith(de('ia', 'proveedores') + sep)) assert.doesNotMatch(texto, /api\.anthropic\.com|api\.openai\.com/, `${nombre} nombra un servidor de IA`);
    if (f.startsWith(SRC + sep)) assert.ok(!texto.includes('secrets.env'), `${nombre} menciona secrets.env`);
    assert.doesNotMatch(texto, /\b(?:ANTHROPIC|OPENAI|CLAUDE)_(?:API_)?KEY\b/, `${nombre}: las claves nunca vienen del entorno`);
  }
  // La dirección del proveedor falso solo se acepta en modo de prueba, y solo 127.0.0.1.
  const config = leer(de('nucleo', 'config.js'));
  assert.match(config, /config\.iaBases = config\.modoPrueba \? basesDePrueba\(env\) : \{\}/);
  assert.match(config, /\^http:\\\/\\\/127\\\.0\\\.0\\\.1:\\d\{2,5\}\$/);
});

test('los adaptadores nunca mandan parámetros que la API rechaza (muestreo, «pensar» a mano, modelos de reemplazo)', () => {
  for (const f of archivos(de('ia', 'proveedores'))) {
    assert.doesNotMatch(leer(f), /\b(?:temperature|top_p|top_k|fallbacks|budget_tokens)\b/, relative(RAIZ, f));
  }
});

test('solo el almacén escribe la tabla de claves, y solo el presupuesto escribe el libro de gastos de la IA', () => {
  for (const f of codigo) {
    const texto = leer(f);
    const nombre = relative(RAIZ, f);
    if (f !== de('claves', 'almacen.js')) assert.doesNotMatch(texto, /\b(?:INSERT\s+INTO|UPDATE)\s+secretos\b/i, `${nombre} escribe secretos`);
    if (f !== de('ia', 'presupuesto.js')) assert.doesNotMatch(texto, /\b(?:INSERT\s+INTO|UPDATE)\s+ia_(?:llamadas|bloqueos)\b/i, `${nombre} escribe el libro de gastos`);
    if (f.startsWith(de('claves') + sep) || f.startsWith(de('ia') + sep)) assert.doesNotMatch(texto, /\bconsole\./, `${nombre} escribe en la consola (podría llevar una clave)`);
  }
});

test('la IA llega APAGADA: tope US$0 en todo, sin la ayuda en proyectos, sin ChatGPT, y el precio de Claude por defecto confirmado', async () => {
  const { CONFIG_POR_DEFECTO, normalizarConfig } = await import('../src/ia/config.js');
  const { estadoPrecios, precioDe, filaDe } = await import('../src/ia/precios.js');
  for (const cfg of [CONFIG_POR_DEFECTO, normalizarConfig(null), normalizarConfig({})]) {
    assert.equal(cfg.encendida, false);
    assert.equal(cfg.topeGeneralMicro, 0);
    assert.ok(Object.values(cfg.topesPlanMicro).every(n => n === 0));
    assert.equal(cfg.ayudaProyectos, false);
    assert.equal(cfg.proveedores.openai.usar, false);
  }
  assert.equal(estadoPrecios().valido, true, `src/ia/precios.json no es válido: ${estadoPrecios().error}`);
  const { anthropic, openai } = CONFIG_POR_DEFECTO.proveedores;
  assert.ok(precioDe('anthropic', anthropic.modelo), 'el modelo de Claude por defecto tiene su precio confirmado');
  assert.ok(filaDe('openai', openai.modelo), 'el modelo de ChatGPT por defecto está en la tabla');
  // Ningún archivo de las migraciones enciende la IA.
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  for (const m of MIGRACIONES) assert.ok(!m.sql.includes('ia.config'));
});

test('cada propósito de IA está bien definido (fase, salida, tiempo, costo máximo) y cada uso de clave tiene un nombre simple', async () => {
  const { PROPOSITOS, MOTIVOS } = await import('../src/ia/propositos.js');
  const { POLITICA } = await import('../src/ia/politica.js');
  const { FASE_ACTUAL, TIPOS, definicion } = await import('../src/tareas/tipos.js');
  const { USOS } = await import('../src/claves/usos.js');
  assert.ok(Object.keys(PROPOSITOS).length > 0);
  for (const [id, p] of Object.entries(PROPOSITOS)) {
    assert.match(id, /^[a-z_]+$/);
    assert.ok(Number.isSafeInteger(p.fase) && p.fase >= 1 && p.fase <= FASE_ACTUAL, `${id}: fase`);
    assert.ok(['espacio', 'proyecto', 'general'].includes(p.ambito), `${id}: ámbito`);
    assert.equal(typeof p.cuentaProyecto, 'boolean');
    assert.ok(Number.isSafeInteger(p.salidaMax) && p.salidaMax >= 16 && p.salidaMax <= 4096, `${id}: salidaMax`);
    assert.ok(Number.isSafeInteger(p.entradaMaxBytes) && p.entradaMaxBytes > 0 && p.entradaMaxBytes <= 200_000, `${id}: entradaMaxBytes`);
    // Ronda 1 de revisión: lo que se lee de la respuesta tiene su tope (cuida los 120 MB del trabajador).
    assert.ok(Number.isSafeInteger(p.respuestaMaxBytes) && p.respuestaMaxBytes >= 16_384 && p.respuestaMaxBytes <= 524_288, `${id}: respuestaMaxBytes`);
    assert.ok(Number.isSafeInteger(p.maximoMicro) && p.maximoMicro > 0 && p.maximoMicro <= 50_000, `${id}: maximoMicro (US$0,05 como mucho por vez)`);
    assert.ok(Number.isSafeInteger(p.timeoutMs) && p.timeoutMs > 0 && p.timeoutMs <= 60_000, `${id}: timeoutMs`);
    assert.ok(['low', 'medium', 'high'].includes(p.esfuerzo), `${id}: esfuerzo`);
    assert.ok(['motor_propio', 'esperar'].includes(p.alFaltar), `${id}: alFaltar`);
    assert.match(p.tarea, /^[a-z]+\.[a-z_]+$/, `${id}: tarea`);
    // Su tarea existe (con su manejador, lo revisa otra regla) y le da más tiempo al paso que a la llamada.
    assert.ok(Object.hasOwn(TIPOS, p.tarea), `${id}: la tarea ${p.tarea} no existe en src/tareas/tipos.js`);
    assert.ok(p.timeoutMs < definicion(p.tarea).tiempoPorPasoMs, `${id}: el paso de ${p.tarea} es más corto que la llamada`);
    assert.equal(definicion(p.tarea).repetible, true, `${id}: su tarea se repite sin pagar dos veces (la llamada se anota por tarea y paso)`);
  }
  assert.equal(new Set(MOTIVOS).size, MOTIVOS.length);
  for (const m of MOTIVOS) assert.match(m, /^[a-z_]+$/);
  for (const m of Object.keys(POLITICA)) assert.ok(MOTIVOS.includes(m), `POLITICA.${m} no está en MOTIVOS`);
  for (const id of Object.keys(USOS)) assert.match(id, /^[a-z_]+$/, `uso de clave raro: ${id}`);
});

test('el servidor web nunca carga el camino PAGADO de la IA (src/ia/cliente.js ni src/ia/ayuda.js): solo el trabajador gasta', () => {
  const { archivos } = grafoDeImports(join(SRC, 'server.js'));
  const delServidor = new Set(archivos.map(a => relative(SRC, a)));
  for (const soloDelTrabajador of [join('ia', 'cliente.js'), join('ia', 'ayuda.js')]) {
    assert.ok(!delServidor.has(soloDelTrabajador), `el servidor web carga ${soloDelTrabajador}`);
  }
  // Y el trabajador sí los carga (si no, la ayuda nunca correría).
  const delTrabajador = new Set(grafoDeImports(join(SRC, 'tareas', 'trabajador.js')).archivos.map(a => relative(SRC, a)));
  for (const archivo of [join('ia', 'cliente.js'), join('ia', 'ayuda.js')]) assert.ok(delTrabajador.has(archivo), `el trabajador no carga ${archivo}`);
  // La prueba gratis de una clave (servidor web) nunca usa el camino pagado ni crea una reserva.
  const probar = leer(de('claves', 'probar.js')).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(probar, /\breservar\s*\(|\bliquidar\s*\(|\/v1\/messages['"`]|\/v1\/responses/, 'la prueba gratis no gasta');
});

test('las rutas que cambian claves o lo que gasta piden la cuenta de Tailscale del dueño, y el detalle del gasto la red de Tailscale', () => {
  const claves = leer(de('api', 'claves.js'));
  const rutas = [...claves.matchAll(/rutas\.agregar\('(GET|POST)', '([^']+)'[\s\S]*?\}, (\{[^}]*\})\);/g)];
  assert.ok(rutas.length >= 4, 'no se encontraron las rutas de claves');
  for (const [, metodo, ruta, opciones] of rutas) assert.match(opciones, /admin: true, soloDueno: true/, `${metodo} ${ruta}`);
  const ia = leer(de('api', 'ia.js'));
  assert.match(ia, /'\/api\/admin\/ia\/ajustes'[\s\S]*?\{ admin: true, soloDueno: true \}\);/);
  assert.match(ia, /'\/api\/admin\/ia\/consumo'[\s\S]*?\{ admin: true, soloTailnet: true \}\);/);
  // Apagar sí se puede desde cualquier entrada (nunca gasta).
  assert.match(ia, /'\/api\/admin\/ia\/apagar'[\s\S]*?\{ admin: true \}\);/);
  // Encender la IA desde la consola no existe (gastar se decide en la pantalla, con su aviso).
  assert.doesNotMatch(leer(join(RAIZ, 'deploy', 'oportia-admin.mjs')), /--ia=si/);
});

test('ninguna prueba enciende el trabajador real directamente: siempre por un programa de test/ que primero carga ./ayuda.js', () => {
  const carpeta = join(RAIZ, 'test');
  for (const nombre of readdirSync(carpeta).filter(n => n.endsWith('.js') && n !== 'reglas.test.js')) {
    const texto = readFileSync(join(carpeta, nombre), 'utf8');
    assert.ok(!texto.includes('RUTA_TRABAJADOR'), `test/${nombre} usa la ruta del trabajador real`);
    for (const linea of texto.split('\n').filter(l => !l.trim().startsWith('//') && /tareas[/'", ]+trabajador\.js/.test(l))) {
      assert.match(linea, /\bimport\s*\(|\bfrom\s+['"]/, `test/${nombre} usa src/tareas/trabajador.js sin importarlo: ${linea.trim()}`);
      assert.match(texto, /^(?:\/\/.*\n)*import '\.\/ayuda\.js';/m, `test/${nombre} carga el trabajador sin cargar antes ./ayuda.js`);
    }
    let desde = 0;
    for (;;) {
      const i = texto.indexOf('crearSupervisor({', desde);
      if (i < 0) break;
      const bloque = texto.slice(i, texto.indexOf('});', i));
      assert.match(bloque, /\b(?:ruta|lanzar):/, `test/${nombre}: crearSupervisor sin ruta ni lanzar encendería el trabajador real`);
      desde = i + 1;
    }
  }
});

// Ronda 2 de revisión: el servidor web también (tiene por un momento una clave descifrada en la prueba gratis).
test('el servidor web se quita los archivos «core» al arrancar, ANTES de abrir la base, y el servicio nuevo trae LimitCORE=0', () => {
  const servidor = readFileSync(join(RAIZ, 'src', 'server.js'), 'utf8');
  const quitar = servidor.indexOf('quitarArchivosCore()');
  assert.ok(quitar > 0, 'server.js llama a quitarArchivosCore');
  assert.ok(quitar < servidor.indexOf('abrirBase(config)'), 'antes de abrir la base');
  const supervisor = readFileSync(join(RAIZ, 'src', 'tareas', 'supervisor.js'), 'utf8');
  assert.match(supervisor, /execFileSync\(PRLIMIT, \['--pid', String\(pid\), '--core=0'\]/);
  assert.match(readFileSync(join(RAIZ, 'deploy', 'jarvis.service'), 'utf8'), /^LimitCORE=0$/m);
});

test('el trabajador se enciende sin archivos «core» (prlimit --core=0), y la huella del código cuenta los .json de src/', () => {
  const supervisor = leer(de('tareas', 'supervisor.js'));
  assert.match(supervisor, /const PRLIMIT = \['\/usr\/bin\/prlimit', '\/bin\/prlimit'\]/);
  assert.match(supervisor, /PRLIMIT \? \[PRLIMIT, '--core=0', '--', \.\.\.orden\] : orden/);
  assert.match(leer(de('app.js')), /nombre\.endsWith\('\.js'\) \|\| nombre\.endsWith\('\.json'\)/);
});

// ---------- Fase 1, parte e: copias cifradas fuera del servidor y el canal de Telegram ----------

const codigoDe = carpeta => archivos(de(carpeta)).filter(f => f.endsWith('.js'));
const sinComentarios = texto => texto.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

test('la migración 6 no tiene CHECK, ni UNIQUE, ni ADD COLUMN (nunca se podrían ampliar ni quitar)', async () => {
  const { MIGRACIONES } = await import('../src/nucleo/migraciones.js');
  const m = MIGRACIONES.find(x => x.id === 6);
  assert.ok(m, 'falta la migración 6');
  assert.equal((m.sql.match(/\bCHECK\b/gi) || []).length, 0);
  assert.doesNotMatch(m.sql, /\bUNIQUE\b/i);
  assert.doesNotMatch(m.sql, /ADD\s+COLUMN/i);
});

test('solo el adaptador de Telegram (src/canales/telegram.js) nombra el servidor de Telegram y sus métodos', () => {
  const metodos = /\b(?:sendMessage|sendDocument|getUpdates|getFile|pinChatMessage|getChat|getMe|getWebhookInfo|setWebhook|deleteWebhook|deleteMessage|unpinChatMessage)\b/;
  for (const f of deTodo) {
    if (f === de('canales', 'telegram.js')) continue;
    const texto = leer(f);
    assert.ok(!texto.includes('api.telegram.org'), `${relative(RAIZ, f)} nombra el servidor de Telegram`);
    if (f.startsWith(SRC + sep) || f.startsWith(join(RAIZ, 'public') + sep)) assert.doesNotMatch(sinComentarios(texto), metodos, `${relative(RAIZ, f)} llama a Telegram sin el adaptador`);
  }
  const telegram = leer(de('canales', 'telegram.js'));
  assert.match(telegram, /import \{ llamarProveedor \} from '\.\.\/ia\/llamar\.js';/, 'el adaptador pasa por la única puerta a la red');
  // Nunca: borrar mensajes, quitar el webhook de nadie, proteger el contenido (el dueño debe poder guardar sus copias)
  // ni pedir formato enriquecido.
  for (const f of codigo) {
    assert.doesNotMatch(leer(f), /\b(?:protect_content|deleteWebhook|deleteMessage|parse_mode)\b/, `${relative(RAIZ, f)}`);
  }
  // La dirección del Telegram falso solo se acepta en modo de prueba, y solo 127.0.0.1.
  const config = leer(de('nucleo', 'config.js'));
  assert.match(config, /config\.canalesBases = config\.modoPrueba \? basesDeCanalDePrueba\(env\) : \{\}/);
  assert.match(telegram, /process\.env\.OPORTIA_TEST === '1' && typeof cred\?\.base === 'string'/);
});

test('los canales y las copias nunca escriben en la consola, nunca usan la red sin llamar.js y nunca tocan la llave de las claves', () => {
  for (const f of [...codigoDe('canales'), ...codigoDe('copias')]) {
    const texto = leer(f);
    const nombre = relative(RAIZ, f);
    assert.doesNotMatch(texto, /\bconsole\./, `${nombre} escribe en la consola (podría llevar un token)`);
    assert.doesNotMatch(texto, /['"]node:(?:https?|http2|net|tls|dgram|child_process)['"]/, `${nombre} usa la red o procesos por su cuenta`);
    assert.doesNotMatch(texto, /\b(?:rutaLlave|leerLlave|asegurarLlave|recuperarLlave|empezarLlaveNueva|apartarLlaveDanada)\b/, `${nombre} toca la llave de las claves`);
  }
});

test('src/copias/ abre archivos SOLO por rutaSegura (que nunca deja abrir la llave de las claves) y nunca pisa uno', () => {
  for (const f of codigoDe('copias')) {
    const nombre = relative(RAIZ, f);
    for (const linea of sinComentarios(leer(f)).split('\n')) {
      for (const m of linea.matchAll(/\b(openSync|createReadStream|createWriteStream|readFileSync|openAsBlob|writeFileSync|appendFileSync|copyFileSync|renameSync|truncateSync|ftruncateSync)\(([^)]*)/g)) {
        assert.ok(!['createWriteStream', 'writeFileSync', 'appendFileSync', 'copyFileSync', 'renameSync', 'truncateSync', 'ftruncateSync'].includes(m[1]), `${nombre}: ${m[1]} puede pisar o cambiar un archivo`);
        assert.match(m[2], /^rutaSegura\(/, `${nombre}: ${m[1]} sin rutaSegura: ${linea.trim()}`);
      }
      for (const m of linea.matchAll(/\bopenSync\(rutaSegura\([^)]*\), '([a-z+]+)'/g)) assert.ok(['r', 'wx'].includes(m[1]), `${nombre}: abre con '${m[1]}' (solo 'r' o 'wx')`);
    }
  }
  const formato = leer(de('copias', 'formato.js'));
  assert.match(formato, /export function rutaSegura\(ruta\) \{\n  const texto = String\(ruta \?\? ''\);\n  if \(!texto \|\| esArchivoDeLlave\(texto\)\) throw new ErrorCopias\('archivo_de_llave'\);/);
});

test('solo src/copias/clave.js y src/copias/cifrar.js usan X25519 y HKDF, y la llave efímera fija solo existe en cifrar.js', () => {
  for (const f of deTodo) {
    const texto = leer(f);
    const nombre = relative(RAIZ, f);
    if (![de('copias', 'clave.js'), de('copias', 'cifrar.js')].includes(f)) {
      assert.doesNotMatch(texto, /\b(?:diffieHellman|hkdfSync)\b|generateKeyPairSync\(\s*['"]x25519/, `${nombre} usa la criptografía de las copias`);
    }
    if (f.startsWith(SRC + sep) && f !== de('copias', 'cifrar.js')) assert.doesNotMatch(texto, /\befimera\b/, `${nombre} pasa una llave efímera (solo para el vector congelado de test/)`);
  }
});

test('la página nunca manda la clave: public/clave-recuperacion.js no importa nada ni usa la red', () => {
  const pagina = leer(join(RAIZ, 'public', 'clave-recuperacion.js'));
  assert.doesNotMatch(pagina, /^\s*import\b|\bimport\(/m);
  assert.doesNotMatch(pagina, /\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB/);
});

test('restaurar nunca corre dentro del servicio, y la foto de la base solo la abren las copias', () => {
  const web = new Set(grafoDeImports(join(SRC, 'server.js')).archivos.map(a => relative(SRC, a)));
  const trabajador = new Set(grafoDeImports(join(SRC, 'tareas', 'trabajador.js')).archivos.map(a => relative(SRC, a)));
  for (const grafo of [web, trabajador]) assert.ok(!grafo.has(join('copias', 'restaurar.js')), 'el servicio carga restaurar.js');
  for (const f of codigo) {
    if (f === de('nucleo', 'db.js') || f.startsWith(de('copias') + sep)) continue;
    assert.doesNotMatch(leer(f), /\babrirFotoDeLectura\b/, `${relative(RAIZ, f)} abre una foto de la base`);
  }
  // El servidor web nunca revisa la carpeta de las copias cifradas (crece cada noche).
  for (const f of [de('nucleo', 'salud.js'), ...codigoDe('api'), ...codigoDe('canales')]) assert.ok(!leer(f).includes('cifradas'), relative(RAIZ, f));
});

test('nada borra una copia, una llave pública, un canal ni un envío', () => {
  for (const f of codigo) {
    assert.doesNotMatch(leer(f), /\bDELETE\s+FROM\s+(?:copias|copia_partes|copias_llaves|canales|canal_envios)\b/i, relative(RAIZ, f));
  }
});

test('ningún archivo del repositorio tiene algo con forma de token de bot de Telegram (las pruebas los arman al correr)', () => {
  const token = /\b\d{6,15}:[A-Za-z0-9_-]{30,80}\b/;
  const texto = archivos(RAIZ, p => /\.(js|mjs|cjs|json|md|html|css|sh|service|txt)$/.test(p) && !p.endsWith('reglas.test.js'));
  for (const f of texto) assert.doesNotMatch(leer(f), token, `${relative(RAIZ, f)} tiene algo con forma de token de Telegram`);
});

// ---------- Fase 1, parte e, paso 2: la tarea de las copias, el que manda avisos y las rutas ----------

test('la foto de la base solo la abre la tarea de las copias (src/copias/hacer.js), y el servidor web nunca carga esa tarea', () => {
  for (const f of codigo) {
    if (f === de('nucleo', 'db.js') || f === de('copias', 'hacer.js')) continue;
    assert.doesNotMatch(sinComentarios(leer(f)), /\babrirFotoDeLectura\b/, `${relative(RAIZ, f)} abre una foto de la base`);
  }
  assert.match(leer(de('copias', 'hacer.js')), /import \{ abrirFotoDeLectura \} from '\.\.\/nucleo\/db\.js';/);
  const web = new Set(grafoDeImports(join(SRC, 'server.js')).archivos.map(a => relative(SRC, a)));
  for (const soloDelTrabajador of [join('copias', 'hacer.js'), join('copias', 'generar.js'), join('copias', 'restaurar.js')]) assert.ok(!web.has(soloDelTrabajador), `el servidor web carga ${soloDelTrabajador}`);
  const trabajador = new Set(grafoDeImports(join(SRC, 'tareas', 'trabajador.js')).archivos.map(a => relative(SRC, a)));
  assert.ok(trabajador.has(join('copias', 'hacer.js')), 'el trabajador hace las copias');
  assert.ok(!trabajador.has(join('canales', 'avisador.js')), 'los avisos por Telegram los manda el servidor web, no el trabajador');
  assert.ok(web.has(join('canales', 'avisador.js')));
});

test('copias.hacer: tiene su manejador, la paran los dos frenos (memoria y disco), y nunca pide una tarea nueva desde adentro (encolar)', async () => {
  const { definicion, PROGRAMAS_DEL_SISTEMA } = await import('../src/tareas/tipos.js');
  const { MANEJADORES } = await import('../src/tareas/manejadores.js');
  const d = definicion('copias.hacer');
  assert.equal(typeof MANEJADORES['copias.hacer']?.paso, 'function');
  assert.equal(d.ignoraFrenos, false);
  assert.equal(d.cupo, 'grande');
  assert.ok(PROGRAMAS_DEL_SISTEMA.some(p => p.programa === 'copias.hacer' && p.cada === 'diaria' && p.hora === 4 && p.minuto === 40));
  for (const f of codigoDe('copias')) assert.doesNotMatch(sinComentarios(leer(f)), /\bencolar\b/, `${relative(RAIZ, f)} pide tareas`);
  const supervisor = leer(de('tareas', 'supervisor.js'));
  assert.match(supervisor, /BANDERAS_TRABAJADOR = Object\.freeze\(\['--no-warnings', '--expose-gc', '--max-old-space-size=64', '--max-semi-space-size=2'\]\)/);
  assert.match(leer(de('tareas', 'trabajador.js')), /VERSION_DE_BASE_NECESARIA = 6;/);
});

test('la clave de prueba nunca puede ser la de un servidor, y las rutas de la clave nunca leen un campo «clave» ni anotan el pedido', () => {
  const estado = leer(de('copias', 'estado.js'));
  const confirmar = /export function confirmarClave[\s\S]*?\n}\n/.exec(estado)?.[0] ?? '';
  assert.match(confirmar, /esClaveDePrueba\(/, 'confirmarClave rechaza PUBLICAS_DE_PRUEBA');
  assert.match(/export function crearClavePendiente[\s\S]*?\n}\n/.exec(estado)?.[0] ?? '', /esClaveDePrueba\(/);
  const rutas = leer(de('api', 'copias.js'));
  assert.doesNotMatch(rutas, /datos\.clave\b|\[['"]clave['"]\]|textoDe\(datos, ['"]clave['"]\)/, 'una ruta lee un campo «clave»');
  assert.match(rutas, /campos\.length !== 1 \|\| campos\[0\] !== 'verificador'/, 'solo se acepta { verificador }');
  assert.doesNotMatch(rutas, /registro\?\.error\?\.\([^)]*(?:error\)|datos|req)/, 'nunca se anota el error entero ni el pedido');
  for (const ruta of ['/api/admin/copias/clave/nueva', '/api/admin/copias/clave/confirmar', '/api/admin/copias/clave/comprobar']) {
    assert.match(rutas, new RegExp(`'${ruta.replace(/\//g, '\\/')}'[\\s\\S]*?\\}, \\{ admin: true, soloDueno: true \\}\\);`), ruta);
  }
  const canales = leer(de('api', 'canales.js'));
  const deCanales = [...canales.matchAll(/rutas\.agregar\('POST', '([^']+)'[\s\S]*?\}, (\{[^}]*\})\);/g)];
  assert.equal(deCanales.length, 6, 'vincular, revisar, confirmar (ronda 3), cancelar, prueba y desvincular');
  for (const [, ruta, opciones] of deCanales) assert.match(opciones, /admin: true, soloDueno: true/, ruta);
});

test('el programa para restaurar nunca lee la clave ni el token de la orden ni del entorno, y nunca corre como root', () => {
  const cli = leer(join(RAIZ, 'deploy', 'oportia-restaurar.mjs'));
  assert.doesNotMatch(cli, /process\.env/);
  assert.match(cli, /\/\^--\(\?:clave\|token\|key\)\\b\/i\.test\(a\)/, 'rechaza --clave/--token');
  assert.match(cli, /process\.getuid\?\.\(\) === 0 && !config\.modoPrueba/);
  assert.match(cli, /preguntar\('Escribe tu clave de recuperación \(no se muestra\): ', \{ oculto: true \}\)/);
  assert.doesNotMatch(cli, /\b(?:rmSync|unlinkSync|rmdirSync|writeFileSync)\b/, 'nunca borra ni pisa');
});

test('el que manda avisos empieza después de abrir el puerto y se apaga antes de cerrar la base', () => {
  const server = leer(join(SRC, 'server.js'));
  const listen = server.indexOf('servidor.listen(');
  assert.ok(listen > 0 && server.indexOf('avisador?.iniciar()') > listen, 'después de listen');
  assert.ok(server.indexOf('await avisador?.parar()') < server.indexOf('db?.close()', server.indexOf('await avisador?.parar()')), 'antes de cerrar la base');
  assert.match(leer(de('canales', 'avisador.js')), /temporizador\.unref\?\.\(\);/, 'su reloj nunca deja vivo al proceso');
});

// ---------- Fase 1, parte f: los programas del servidor (deploy/*.sh), sus unidades y el texto de instalación ----------
// Estas reglas solo LEEN los archivos (y «bash -n» solo revisa la escritura): nunca corren un programa del servidor.

const DEPLOY = join(RAIZ, 'deploy');
const programas = readdirSync(DEPLOY).filter(n => n.endsWith('.sh')).sort();
const programa = nombre => readFileSync(join(DEPLOY, nombre), 'utf8');
// Las líneas con código (sin las de comentario), con su número.
const lineasDeCodigo = texto => texto.split('\n').map((l, i) => ({ l, n: i + 1 })).filter(x => !x.l.trim().startsWith('#'));
const REPO_OFICIAL = 'junior17281728jr-bot/Jarvis';
const BASH = ['/bin/bash', '/usr/bin/bash'].find(p => existsSync(p));

test('1f: están todos los programas del servidor, cada uno con su cabecera estricta y todo su cuerpo dentro de principal (sin leer la entrada)', () => {
  assert.deepEqual(programas, ['cloud-init.sh', 'install.sh', 'oportia-actualizar.sh', 'oportia-comun.sh', 'oportia-lanzador.sh', 'oportia-orden.sh', 'oportia-recuperar.sh', 'oportia-servidor.sh', 'oportia.sh']);
  for (const nombre of programas) {
    const texto = programa(nombre);
    assert.ok(texto.startsWith('#!/bin/bash\n'), `${nombre}: primera línea`);
    assert.doesNotMatch(texto, /^\s*set\s+-[a-z]*x|set -o xtrace|\bxtrace\b/m, `${nombre}: nunca «set -x» (escribiría secretos en los registros)`);
    assert.ok(!texto.includes('$HOME') && !texto.includes('${HOME'), `${nombre}: no usa HOME (systemd no lo pone)`);
    assert.doesNotMatch(lineasDeCodigo(texto).map(x => x.l).join('\n'), /\beval\b/, `${nombre}: sin eval`);
    if (nombre === 'oportia-comun.sh') continue; // solo funciones: lo cargan los otros
    assert.match(texto, /^set -euo pipefail$/m, `${nombre}: set -euo pipefail`);
    assert.match(texto, /^IFS=\$'\\n\\t'$/m, `${nombre}: IFS`);
    assert.ok(texto.endsWith('\nprincipal "$@" </dev/null\nexit $?\n'), `${nombre}: termina en principal "$@" </dev/null`);
    // Fuera de las funciones solo hay asignaciones, «export», «declare» y la cabecera: nada que haga cosas.
    let dentro = false;
    for (const { l, n } of lineasDeCodigo(texto)) {
      if (/^[a-z_]+\(\) \{$/.test(l) || /^[a-z_]+\(\) \{ .* \}$/.test(l)) { dentro = !/\}$/.test(l); continue; }
      if (dentro) { if (l === '}') dentro = false; continue; }
      if (!l.trim()) continue;
      assert.match(l, /^(?:[A-Z_0-9]+=.*|export [A-Z_ =.0-9a-zA-Z-]+|declare -a [A-Z_]+=\(\)|set -euo pipefail|umask 0(?:22|77)|if \[ "\$\{OPORTIA_PRUEBA:-\}" != "1" \]; then PATH=\S+; fi|principal "\$@" <\/dev\/null|exit \$\?)$/, `${nombre}:${n}: código fuera de una función: ${l}`);
    }
  }
});

test('1f: cada programa del servidor está bien escrito (bash -n)', { skip: BASH ? false : 'no hay bash' }, async () => {
  const { spawnSync } = await import('node:child_process');
  for (const nombre of programas) {
    const r = spawnSync(BASH, ['-n', join(DEPLOY, nombre)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${nombre}: ${r.stderr}`);
  }
});

test('1f: en los programas del servidor la palabra rm solo existe dentro de borrar_lo_mio, y nunca hay otra orden que destruya', () => {
  for (const nombre of programas) {
    let funcion = null;
    for (const { l, n } of lineasDeCodigo(programa(nombre))) {
      const m = /^([a-z_]+)\(\) \{/.exec(l);
      if (m) funcion = m[1];
      if (/(?:^|[\s;&|(])rm(?:\s|$)/.test(l)) assert.equal(funcion, 'borrar_lo_mio', `${nombre}:${n}: rm fuera de borrar_lo_mio: ${l.trim()}`);
      assert.doesNotMatch(l, /(?:^|[\s;&|(])(?:rmdir|shred|truncate|mkfs\S*|wipefs|userdel|deluser|find\s.*-delete|git\s+clean)(?:\s|$)|--remove-files|\bfunnel reset\b|\bufw (?:--force )?reset\b|\bapt-get\b.*\b(?:remove|purge|autoremove)\b|\bdd\b.*\bof=\/dev\//, `${nombre}:${n}: orden que destruye: ${l.trim()}`);
    }
    const cuerpo = /\nborrar_lo_mio\(\) \{\n([\s\S]*?)\n\}\n/.exec(programa(nombre))?.[1] ?? null;
    if (cuerpo == null) continue;
    assert.equal((cuerpo.match(/(?:^|[\s;&|(])rm(?:\s|$)/gm) || []).length, 1, `${nombre}: un solo rm`);
    assert.match(cuerpo, /rm -rf --one-file-system -- "\$(?:ruta|D)"$/m, `${nombre}: el borrado no cruza a otros discos y nunca toma una opción por nombre`);
  }
});

test('1f: toda ruta del sistema de los programas sale del prefijo $RAIZ (en las pruebas nunca pueden tocar el servidor)', () => {
  const carpetas = /\/(?:etc|opt|var|usr|run|root|tmp|home|swapfile|boot|lib|sbin|bin|srv|mnt)(?![\w-])/g;
  for (const nombre of programas) {
    for (const { l, n } of lineasDeCodigo(programa(nombre))) {
      if (n === 1) continue; // #!/bin/bash
      for (const m of l.matchAll(carpetas)) {
        const antes = l.slice(0, m.index);
        const palabra = antes.slice(Math.max(antes.lastIndexOf(' '), antes.lastIndexOf('\t')) + 1);
        if (/\$\{?[A-Za-z_]/.test(palabra)) continue; // sale del prefijo $RAIZ, o de una variable (todas salen de él; HOME y las del entorno están prohibidas arriba)
        if (/:\/\/[^\s"']*$/.test(antes)) continue; // una dirección https://…
        if (/(?:^|[\s"'(])"?PATH=\S*$/.test(antes)) continue; // el PATH de la cabecera y el de las pruebas de la versión nueva
        assert.fail(`${nombre}:${n}: ruta del sistema sin $RAIZ: ${l.trim()}`);
      }
      assert.doesNotMatch(l, /\/dev\/(?!null\b|tty\b|zero\b)/, `${nombre}:${n}: solo /dev/null, /dev/tty y /dev/zero`);
    }
  }
});

test('1f: los comandos del sistema pasan por «sistema» y solo los de la lista; nunca «curl … | bash» fuera de las líneas documentadas', () => {
  const comun = programa('oportia-comun.sh');
  const lista = /^ORDENES_DEL_SISTEMA=" ([a-z -]+) "$/m.exec(comun)?.[1].split(' ');
  assert.deepEqual(lista, ['systemctl', 'apt-get', 'dpkg', 'tailscale', 'ufw', 'useradd', 'id', 'runuser', 'setpriv', 'swapon', 'mkswap', 'fallocate', 'curl', 'hostnamectl', 'ss', 'chown', 'chgrp', 'df', 'uname']);
  for (const nombre of programas) {
    for (const { l, n } of lineasDeCodigo(programa(nombre))) {
      for (const m of l.matchAll(/\b(?:sistema|hay_orden)\s+([a-z][a-z-]*)\b|\bsistema_con_tope\s+\d+\s+([a-z][a-z-]*)\b/g)) {
        const orden = m[1] ?? m[2];
        assert.ok(lista.includes(orden), `${nombre}:${n}: «${orden}» no está en la lista de órdenes del sistema`);
      }
      // Lo que cambia el sistema nunca se llama directo (sin «sistema» delante).
      assert.doesNotMatch(l, /(?:^|[;&|(]\s*|\bthen\s+|\bdo\s+|\belse\s+|!\s+)(?:systemctl|apt-get|apt|dpkg|tailscale|ufw|useradd|usermod|runuser|setpriv|swapon|mkswap|fallocate|curl|wget|hostnamectl|chown|chgrp|reboot|shutdown|crontab|sysctl|iptables|nft)\s/, `${nombre}:${n}: comando del sistema sin «sistema»: ${l.trim()}`);
      if (/\|\s*(?:sudo\s+)?(?:bash|sh)\b/.test(l)) {
        assert.ok(l.includes(`https://raw.githubusercontent.com/${REPO_OFICIAL}/main/deploy/cloud-init.sh | sudo bash -s -- `), `${nombre}:${n}: «| bash» que no es la línea documentada`);
      }
    }
  }
  // cloud-init.sh (que llega solo, sin los demás) tiene su propia lista, más corta.
  assert.match(programa('cloud-init.sh'), /case "\$orden" in\n\s+apt-get\|curl\) ;;\n\s+\*\) fallar/);
});

test('1f: los bloques compartidos son idénticos, el repositorio es el mismo en todos lados y el contrato del actualizador es el 1', () => {
  const bloque = (nombre, cual) => new RegExp(`\\n# >>> ${cual} [^\\n]*\\n[\\s\\S]*?\\n# <<< ${cual}\\n`).exec(programa(nombre))?.[0] ?? null;
  const base = bloque('oportia-comun.sh', 'base');
  assert.ok(base && base.length > 3000);
  assert.equal(bloque('oportia-actualizar.sh', 'base'), base, 'el bloque «base» del actualizador');
  assert.equal(bloque('oportia-lanzador.sh', 'base'), base, 'el bloque «base» del lanzador');
  const salud = bloque('oportia-comun.sh', 'salud');
  assert.ok(salud && salud.length > 2000);
  assert.equal(bloque('oportia-actualizar.sh', 'salud'), salud, 'el bloque «salud» del actualizador');
  // El actualizador y el lanzador son un solo archivo cada uno: no cargan otros.
  for (const nombre of ['oportia-actualizar.sh', 'oportia-lanzador.sh', 'oportia-orden.sh', 'cloud-init.sh']) assert.doesNotMatch(lineasDeCodigo(programa(nombre)).map(x => x.l).join('\n'), /^\s*(?:\.|source)\s/m, `${nombre} carga otro archivo`);
  assert.match(programa('oportia-actualizar.sh'), /^CONTRATO=1$/m);
  assert.match(base, /^CONTRATO_DEL_LANZADOR=1$/m);
  // El mismo repositorio en todos los archivos que lo nombran.
  const conRepo = [...programas.map(n => join(DEPLOY, n)), join(RAIZ, 'README.md'), join(RAIZ, 'public', 'i18n', 'es.json'), join(RAIZ, 'public', 'i18n', 'en.json'), join(DEPLOY, 'LEEME.md')];
  let veces = 0;
  for (const f of conRepo) {
    for (const m of leer(f).matchAll(/([A-Za-z0-9._-]+)\/Jarvis\b(?!-)/g)) {
      veces += 1;
      assert.equal(`${m[1]}/Jarvis`, REPO_OFICIAL, `${relative(RAIZ, f)} nombra otro repositorio: ${m[0]}`);
    }
  }
  assert.ok(veces >= 4);
  // El juego de programas que root guarda es el mismo en los programas y en la ayuda de las pruebas.
  const juego = /^JUEGO="([^"]+)"$/m.exec(base)?.[1].split(' ');
  assert.ok(juego.length >= 12);
  for (const n of juego) assert.ok(existsSync(join(DEPLOY, n)), `el juego nombra ${n}, que no existe`);
  for (const n of programas.filter(x => x !== 'cloud-init.sh')) assert.ok(juego.includes(n), `${n} no está en el juego`);
  assert.match(leer(join(RAIZ, 'test', 'raiz-falsa.js')), new RegExp(`JUEGO = \\[${juego.map(n => `'${n.replace(/\./g, '\\.')}'`).join(', ')}\\]`));
});

test('1f: las unidades: el servicio apaga TODO su grupo (nunca KillMode=process), sin archivos core y sin metadatos; el actualizador con tope y sin frenar el disco', () => {
  const unidades = readdirSync(DEPLOY).filter(n => /\.(?:service|timer)$/.test(n)).sort();
  assert.deepEqual(unidades, ['jarvis.service', 'oportia-actualizar.service', 'oportia-actualizar.timer']);
  for (const n of unidades) assert.doesNotMatch(leer(join(DEPLOY, n)), /^KillMode=(?!control-group$)/m, `${n}: KillMode`);
  const servicio = leer(join(DEPLOY, 'jarvis.service'));
  for (const linea of ['KillMode=control-group', 'User=jarvis', 'LimitCORE=0', 'IPAddressDeny=169.254.169.254', 'ProtectSystem=strict', 'ReadWritePaths=/var/lib/jarvis', 'NoNewPrivileges=true', 'ExecStart=/usr/bin/node --no-warnings src/server.js', 'EnvironmentFile=/opt/jarvis/.env']) {
    assert.match(servicio, new RegExp(`^${linea.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'), `jarvis.service: ${linea}`);
  }
  const actualizar = leer(join(DEPLOY, 'oportia-actualizar.service'));
  assert.match(actualizar, /^Type=oneshot$/m);
  assert.match(actualizar, /^ExecStart=\/usr\/local\/lib\/oportia\/oportia-lanzador\.sh$/m);
  assert.match(actualizar, /^KillMode=control-group$/m);
  assert.doesNotMatch(actualizar, /IOSchedulingClass|^User=/m);
  const tope = Number(/^TOPE_ACTUALIZADOR=(\d+)$/m.exec(programa('oportia-lanzador.sh'))[1]);
  const delServicio = Number(/^TimeoutStartSec=(\d+)$/m.exec(actualizar)[1]);
  const pruebas = Number(/^TOPE_PRUEBAS=(\d+)$/m.exec(programa('oportia-actualizar.sh'))[1]);
  assert.equal(pruebas, 900);
  assert.ok(2 * pruebas + 300 <= tope && tope + 60 <= delServicio, 'el lanzador siempre sobrevive al actualizador, y systemd al lanzador');
  const reloj = leer(join(DEPLOY, 'oportia-actualizar.timer'));
  assert.match(reloj, /^OnCalendar=\*:07,37$/m);
  assert.match(reloj, /^WantedBy=timers\.target$/m);
  assert.doesNotMatch(reloj, /Persistent=/);
});

test('1f: Node llega con versión y huellas FIJAS, y el instalador las comprueba antes de abrir nada', () => {
  const pin = leer(join(DEPLOY, 'node.pin'));
  assert.match(pin, /^NODE_VERSION=22\.\d+\.\d+\nNODE_SHA256_X64=[0-9a-f]{64}\nNODE_SHA256_ARM64=[0-9a-f]{64}\n$/);
  const instalador = programa('install.sh');
  const comprobar = instalador.indexOf('sha256sum -c -');
  assert.ok(comprobar > 0 && comprobar < instalador.indexOf('tar --no-same-owner -xJf'), 'la huella se comprueba ANTES de abrir el paquete');
  assert.doesNotMatch(instalador, /nodesource|setup_\d+\.x/i);
  // Las pruebas de la versión nueva nunca corren como root.
  const actualizador = programa('oportia-actualizar.sh');
  assert.match(actualizador, /sistema setpriv --reuid=nobody --regid=nogroup --clear-groups \\\n\s+env -i /);
  assert.equal((actualizador.match(/--test /g) || []).length, 1, 'un solo sitio corre las pruebas');
});

test('1f: el texto de instalación es pequeño, trae el marcador de la clave y cada «sudo oportia …» que se le muestra al dueño existe', () => {
  const nube = programa('cloud-init.sh');
  assert.ok(Buffer.byteLength(nube) <= 8192, `cloud-init.sh pesa ${Buffer.byteLength(nube)} bytes (tope: 8 KB)`);
  assert.equal(nube.split('\n')[3], 'TS_AUTHKEY="PEGA_AQUI"');
  assert.equal(nube.split('\n')[4], `REPO="${REPO_OFICIAL}"`);
  assert.match(nube, /unset TS_AUTHKEY/);
  // Las palabras que reparte la orden corta.
  const reparto = programa('oportia.sh');
  const palabras = new Set([...reparto.matchAll(/^\s{4}([a-z|-]+)\) (?:exec bash|ayuda)/gm)].flatMap(m => m[1].split('|')).filter(p => !p.startsWith('-')));
  assert.deepEqual([...palabras].sort(), ['actualizar', 'ayuda', 'estado', 'pasar', 'probar-copia', 'recuperar', 'revisar', 'servicio', 'tailscale', 'volver']);
  const conOrdenes = [...programas.map(n => join(DEPLOY, n)), join(DEPLOY, 'LEEME.md'), join(RAIZ, 'README.md'), join(RAIZ, 'public', 'i18n', 'es.json'), join(RAIZ, 'public', 'i18n', 'en.json'), join(RAIZ, 'public', 'app.js'), join(RAIZ, 'deploy', 'oportia-admin.mjs'), join(RAIZ, 'deploy', 'oportia-restaurar.mjs')];
  let vistas = 0;
  for (const f of conOrdenes) {
    for (const m of leer(f).matchAll(/sudo oportia ([a-z][a-z-]*)/g)) {
      vistas += 1;
      assert.ok(palabras.has(m[1]), `${relative(RAIZ, f)} muestra «sudo oportia ${m[1]}», que no existe (ningún botón muerto)`);
    }
    for (const m of leer(f).matchAll(/sudo oportia [a-z-]+ (--[a-z-]+)/g)) assert.ok(['--reintentar', '--simulacro'].includes(m[1]), `${relative(RAIZ, f)}: opción ${m[1]}`);
  }
  assert.ok(vistas >= 15);
  // Las opciones de install.sh que nombra la línea de arreglo existen.
  assert.match(programa('install.sh'), /--solo-actualizador\) SOLO_ACTUALIZADOR=si ;;/);
  assert.match(programa('oportia-orden.sh'), /cloud-init\.sh \| sudo bash -s -- --solo-actualizador"/);
});

test('1f: nadie dice que el instalador está «probado» sin decir «en simulación» (hasta que se haga el simulacro en un servidor de verdad)', () => {
  for (const f of [join(DEPLOY, 'LEEME.md'), join(RAIZ, 'README.md'), join(RAIZ, 'public', 'i18n', 'es.json'), join(RAIZ, 'public', 'i18n', 'en.json')]) {
    for (const [i, linea] of leer(f).split('\n').entries()) {
      if (!/instalador|install\.sh|cloud-init|cortafuegos|firewall|systemd|texto de instalación|installer/i.test(linea)) continue;
      if (/\b(?:probad[oa]s?|tested|verificad[oa]s?)\b/i.test(linea)) assert.match(linea, /simulaci|simulat|sin verificar|no (?:está|se ha) probad|not (?:yet )?tested/i, `${relative(RAIZ, f)}:${i + 1}: dice «probado» sin «simulación»: ${linea.trim().slice(0, 160)}`);
    }
  }
});
