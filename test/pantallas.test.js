// Pruebas de las pantallas: archivos servidos con seguridad, español e inglés completos y código seguro.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const es = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/es.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(RAIZ, 'public/i18n/en.json'), 'utf8'));
const appJs = readFileSync(join(RAIZ, 'public/app.js'), 'utf8');

function archivosDe(carpeta, filtro) {
  const lista = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) lista.push(...archivosDe(ruta, filtro));
    else if (filtro(ruta)) lista.push(ruta);
  }
  return lista;
}

test('las pantallas se sirven con su tipo y con cabeceras de seguridad', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    for (const [ruta, tipo] of [['/', /text\/html/], ['/app.js', /javascript/], ['/estilos.css', /text\/css/], ['/i18n/es.json', /json/], ['/icono.svg', /svg/], ['/icono-180.png', /image\/png/]]) {
      const r = await fetch(`${base}${ruta}`);
      assert.equal(r.status, 200, ruta);
      assert.match(r.headers.get('content-type'), tipo, ruta);
      assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/, `${ruta} sin política de seguridad`);
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
    }
    const ruta = await fetch(`${base}/configuracion`);
    assert.equal(ruta.status, 200, 'una ruta de la app muestra la app');
  });
  db.close();
});

test('no se puede salir de la carpeta de pantallas para leer otros archivos', async () => {
  const db = abrirBase(configDePrueba());
  await conServidor(crearServidor({ db }), async base => {
    for (const ruta of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/i18n/../../src/app.js', '/.env', '/%2e%2e/%2e%2e/etc/passwd']) {
      const r = await fetch(`${base}${ruta}`);
      const cuerpo = await r.text();
      assert.ok(!cuerpo.includes('"name": "oportia"') && !cuerpo.includes('crearServidor') && !cuerpo.includes('root:'), `${ruta} dejó ver un archivo`);
    }
  });
  db.close();
});

test('español e inglés tienen exactamente las mismas frases', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const [clave, valor] of Object.entries(es)) {
    const variables = texto => [...texto.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(variables(en[clave]), variables(valor), `variables distintas en ${clave}`);
    assert.ok(valor.trim() && en[clave].trim(), `frase vacía: ${clave}`);
  }
});

test('toda frase que usan las pantallas existe en los dos idiomas', () => {
  for (const m of appJs.matchAll(/\bt\('([a-z0-9_.]+)'/g)) assert.ok(m[1] in es, `falta la frase ${m[1]}`);
  for (const m of appJs.matchAll(/texto: t\(u\.[a-z]+ \? '([a-z0-9_.]+)' : '([a-z0-9_.]+)'/g)) {
    assert.ok(m[1] in es && m[2] in es, `falta ${m[1]} o ${m[2]}`);
  }
});

test('todo error que puede dar el servidor tiene su explicación en los dos idiomas', () => {
  const claves = new Set();
  for (const archivo of archivosDe(join(RAIZ, 'src'), r => r.endsWith('.js'))) {
    const codigo = readFileSync(archivo, 'utf8');
    for (const m of codigo.matchAll(/new ErrorHttp\(\d+, '([a-z_]+)'/g)) claves.add(m[1]);
    for (const m of codigo.matchAll(/\{ error: '([a-z_]+)' \}/g)) claves.add(m[1]);
  }
  assert.ok(claves.size > 10);
  for (const clave of claves) assert.ok(`error.${clave}` in es && `error.${clave}` in en, `falta error.${clave}`);
});

test('las pantallas nunca convierten texto en código (sin innerHTML, eval ni scripts incrustados)', () => {
  assert.doesNotMatch(appJs, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
  const html = readFileSync(join(RAIZ, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'hay un script incrustado');
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i, 'hay estilos o eventos incrustados');
});

test('las frases que las pantallas arman por partes (estados, capacidades, historial…) existen en los dos idiomas', async () => {
  const { catalogo } = await import('../src/motor/interpretar.js');
  const { ESTADOS, ACCIONES, ESTADOS_VERSION, ORIGENES } = await import('../src/proyectos/proyectos.js');
  const { PLANES } = await import('../src/cuentas/planes.js');
  const { FUENTES } = await import('../src/motor/diccionarios.js');
  const cat = catalogo();
  const claves = [
    ...ESTADOS.map(e => `estado.${e}`),
    ...Object.keys(ACCIONES).map(a => `accion.${a}`),
    ...Object.values(ACCIONES).map(a => `historial.${a.evento}`),
    ...['creado', 'version_nueva', 'aprobada', 'rechazada', 'renombrado', 'a_papelera', 'restaurado', 'con_errores'].map(h => `historial.${h}`),
    ...cat.tipos.flatMap(x => [`tipo.${x}`, `campo.producto.${x}`, `faltante.producto.${x}`, `proyecto.aviso_espera.${x}`, `proyecto.entendi.${x}`]),
    ...cat.tamanos.map(x => `tamano.${x}`),
    ...cat.frecuencias.map(x => `frecuencia.${x}`),
    ...cat.capacidades.flatMap(x => [`capacidad.${x.clave}`, `capacidad.${x.clave}.ayuda`]),
    ...Object.keys(cat.combinaciones).map(x => `combinacion.${x}`),
    ...Object.values(FUENTES).flat().map(x => `fuente.${x}`),
    ...['sectores', 'zonas', 'capacidades'].map(x => `faltante.${x}`),
    ...cat.supuestos.map(x => `supuesto.${x}`),
    ...cat.dudas.map(x => `duda.${x}`),
    'duda.sugerencia', 'faltante.dudas',
    ...ESTADOS_VERSION.map(x => `version.estado.${x}`),
    ...ORIGENES.map(x => `version.origen.${x}`),
    ...cat.autonomias.map(x => `autonomia.${x}`),
    'autonomia.contactar_siempre',
    ...PLANES.map(x => `plan.${x}`),
    'aviso.clave_reiniciada',
  ];
  for (const clave of claves) assert.ok(clave in es && clave in en, `falta la frase ${clave}`);
  // Y en el código, cada frase armada por partes usa uno de esos prefijos conocidos.
  const prefijos = new Set(claves.map(c => c.slice(0, c.lastIndexOf('.') + 1)).concat(['estado.', 'tipo.', 'idioma.', 'error.', 'faltante.', 'campo.producto.', 'capacidad.', 'proyecto.aviso_espera.', 'historial.', 'version.estado.', 'version.origen.', 'supuesto.', 'autonomia.', 'plan.']));
  for (const m of appJs.matchAll(/\bt\(`([a-z0-9_.]+)\$\{/g)) assert.ok(prefijos.has(m[1]), `frase armada sin revisar: ${m[1]}…`);
});

test('los mensajes que dicen un número de tope usan el número que de verdad tiene el servidor', async () => {
  const { MAXIMO_VERSIONES } = await import('../src/proyectos/proyectos.js');
  for (const idioma of [es, en]) assert.ok(idioma['error.demasiadas_versiones'].includes(String(MAXIMO_VERSIONES)), 'error.demasiadas_versiones');
  const { LIMITE_POR_PLAN } = await import('../src/cuentas/planes.js');
  for (const [plan, n] of Object.entries(LIMITE_POR_PLAN)) for (const idioma of [es, en]) assert.match(idioma[`plan.${plan}`], new RegExp(`\\b${n}\\b`), `plan.${plan}`);
});
