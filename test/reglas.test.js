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
  6: '5443d09fac022e5aea609fec97efbad138e1657bb7e57358a97e82b9a1c7bdb2',
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
