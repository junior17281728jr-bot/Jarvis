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
  for (const m of appJs.matchAll(/\b(?:t|tn)\('([a-z0-9_.]+)'/g)) assert.ok(m[1] in es, `falta la frase ${m[1]}`);
  // tn(…) elige la frase en singular («.uno») cuando el número es 1: tiene que existir.
  for (const m of appJs.matchAll(/\btn\('([a-z0-9_.]+)'/g)) assert.ok(`${m[1]}.uno` in es, `falta la frase ${m[1]}.uno`);
  for (const m of appJs.matchAll(/texto: t\(u\.[a-z]+ \? '([a-z0-9_.]+)' : '([a-z0-9_.]+)'/g)) {
    assert.ok(m[1] in es && m[2] in es, `falta ${m[1]} o ${m[2]}`);
  }
});

test('en español una hora nunca va pegada a un punto final («p. m..»): la hora ya termina en punto', () => {
  // es-DO escribe «8:47 p. m.»: una frase que termina en «{hora}.» o «{fecha}.» mostraría «p. m..».
  for (const [clave, valor] of Object.entries(es)) assert.doesNotMatch(valor, /\{(hora|fecha|desde|ultima)\}\./, clave);
  const hora = new Intl.DateTimeFormat('es-DO', { timeStyle: 'short', timeZone: 'America/Santo_Domingo' }).format(new Date('2026-11-05T01:00:00Z'));
  assert.match(hora, /m\.$/, 'si un día la hora deja de terminar en punto, esta prueba se puede relajar');
});

test('con 1 se dice en singular: «1 paso», «1 archivo», «1 tarea»', () => {
  for (const clave of ['tareas.pasos', 'servidor.copias', 'aviso.tareas_fallidas', 'aviso.tareas_revisar', 'tiempo.hace_d']) {
    for (const [nombre, idioma] of [['es', es], ['en', en]]) {
      const uno = idioma[`${clave}.uno`];
      assert.ok(uno, `falta ${clave}.uno en ${nombre}`);
      assert.match(uno, /\b1\b/, `${clave}.uno (${nombre})`);
      assert.doesNotMatch(uno, /\b1 (pasos|archivos|tareas|días|steps|files|tasks|days)\b/, `${clave}.uno (${nombre})`);
    }
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
  for (const archivo of readdirSync(join(RAIZ, 'public')).filter(n => n.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(join(RAIZ, 'public', archivo), 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, archivo);
  }
  const html = readFileSync(join(RAIZ, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'hay un script incrustado');
  assert.doesNotMatch(html, /<style|\sstyle=|\son[a-z]+=/i, 'hay estilos o eventos incrustados');
});

test('las frases que las pantallas arman por partes (estados, capacidades, historial…) existen en los dos idiomas', async () => {
  const { catalogo } = await import('../src/motor/interpretar.js');
  const { ESTADOS, ACCIONES, ESTADOS_VERSION, ORIGENES } = await import('../src/proyectos/proyectos.js');
  const { PLANES } = await import('../src/cuentas/planes.js');
  const { FUENTES } = await import('../src/motor/diccionarios.js');
  // Fase 1, parte c: la zona de sistema de Administrador.
  const { FASES_TRABAJADOR } = await import('../src/tareas/supervisor.js');
  const { ESTADOS_TAREA, EVENTOS } = await import('../src/tareas/cola.js');
  const { TIPOS: TIPOS_TAREA, COMO_TERMINA } = await import('../src/tareas/tipos.js');
  const { MOTIVOS_MODO_SEGURO, QUIEN_QUITA } = await import('../src/tareas/modo-seguro.js');
  const { CLAVES_AVISO, NIVELES } = await import('../src/avisos/avisos.js');
  // Pase visual (0.3.1): el creador con toques.
  const { CLAVES_FALTA, CLAVES_QUEDA_FUERA } = await import('../public/creador.js');
  const cat = catalogo();
  const claves = [
    ...CLAVES_FALTA.map(x => `creador.falta.${x}`),
    ...CLAVES_QUEDA_FUERA.map(x => `creador.fuera.${x}`),
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
    ...cat.autonomias.map(x => `autonomia.corta.${x}`),
    'autonomia.contactar_siempre',
    ...PLANES.map(x => `plan.${x}`),
    'aviso.clave_reiniciada',
    ...[...FASES_TRABAJADOR, 'sin_supervisor'].map(x => `tareas.fase.${x}`),
    ...ESTADOS_TAREA.map(x => `tareas.estado.${x}`),
    ...Object.keys(TIPOS_TAREA).map(x => `tareas.tipo.${x}`),
    ...EVENTOS.map(x => `tareas.evento.${x}`),
    ...COMO_TERMINA.map(x => `tareas.como.${x}`),
    ...['poca_memoria', 'poco_disco'].map(x => `tareas.freno.${x}`),
    ...['tiempo_agotado', 'respuesta_no_valida', 'resultado_muy_grande', 'memoria', 'apagado', 'arriendo_vencido', 'sin_dueno', 'trabajador', 'no_se_pudo_guardar'].map(x => `tareas.motivo.${x}`),
    ...MOTIVOS_MODO_SEGURO.map(x => `modo_seguro.motivo.${x}`),
    ...QUIEN_QUITA.map(x => `modo_seguro.quitado.${x}`),
    ...CLAVES_AVISO.map(x => `aviso.${x}`),
    'aviso.freno',
    ...NIVELES.map(x => `aviso.nivel.${x}`),
    ...['verde', 'amarillo', 'rojo'].flatMap(x => [`sistema.semaforo.${x}`, `servidor.semaforo.${x}`]),
    'error.ya_hay_otra_en_marcha', 'error.arrancando',
  ];
  for (const clave of claves) assert.ok(clave in es && clave in en, `falta la frase ${clave}`);
  // Y en el código, cada frase armada por partes usa uno de esos prefijos conocidos.
  const prefijos = new Set(claves.map(c => c.slice(0, c.lastIndexOf('.') + 1)).concat(['estado.', 'tipo.', 'idioma.', 'error.', 'faltante.', 'campo.producto.', 'capacidad.', 'proyecto.aviso_espera.', 'historial.', 'version.estado.', 'version.origen.', 'supuesto.', 'autonomia.', 'plan.',
    'creador.falta.', 'creador.fuera.', 'tareas.fase.', 'tareas.estado.', 'tareas.tipo.', 'tareas.motivo.', 'tareas.evento.', 'tareas.como.', 'tareas.freno.', 'modo_seguro.motivo.', 'modo_seguro.quitado.', 'aviso.', 'aviso.nivel.', 'sistema.semaforo.', 'servidor.semaforo.']));
  // tSi(…) es t(…) con un respaldo (para valores de una versión más nueva): también se revisa.
  for (const m of appJs.matchAll(/\b(?:t|tSi)\(`([a-z0-9_.]+)\$\{/g)) assert.ok(prefijos.has(m[1]), `frase armada sin revisar: ${m[1]}…`);
});

test('los mensajes que dicen un número de tope usan el número que de verdad tiene el servidor', async () => {
  const { MAXIMO_VERSIONES } = await import('../src/proyectos/proyectos.js');
  for (const idioma of [es, en]) assert.ok(idioma['error.demasiadas_versiones'].includes(String(MAXIMO_VERSIONES)), 'error.demasiadas_versiones');
  const { LIMITE_POR_PLAN } = await import('../src/cuentas/planes.js');
  for (const [plan, n] of Object.entries(LIMITE_POR_PLAN)) for (const idioma of [es, en]) assert.match(idioma[`plan.${plan}`], new RegExp(`\\b${n}\\b`), `plan.${plan}`);
});

test('pase visual 2: cada negocio del motor tiene su ícono, y el mapa tiene las 32 provincias y las mismas regiones', async () => {
  const { ICONOS_SECTOR, ICONOS_PROYECTO, MAPA_PROVINCIAS, MAPA_COLUMNAS, MAPA_FILAS, PROVINCIAS_DE_REGION, EDIFICIOS_POR_TAMANO } = await import('../public/dibujos.js');
  const { SECTORES } = await import('../src/motor/diccionarios.js');
  const { PROVINCIAS, REGIONES } = await import('../src/motor/lugares.js');
  const { ZONAS_CREADOR, ORDEN_TAMANOS } = await import('../public/creador.js');
  const sectores = SECTORES.map(s => s.clave).filter(s => s !== 'todas');
  assert.equal(sectores.length, 37);
  for (const s of sectores) assert.ok(Array.isArray(ICONOS_SECTOR[s]) && ICONOS_SECTOR[s].length, `falta el ícono de ${s}`);
  assert.deepEqual(Object.keys(ICONOS_SECTOR).sort(), [...sectores].sort(), 'un ícono de un negocio que el motor no conoce');
  for (const forma of [...Object.values(ICONOS_SECTOR), ...Object.values(ICONOS_PROYECTO)]) {
    for (const [etiqueta, atributos] of forma) {
      assert.ok(['path', 'circle', 'rect', 'line', 'polyline', 'ellipse'].includes(etiqueta), etiqueta);
      for (const v of Object.values(atributos)) assert.match(String(v), /^[-\d.\sMmLlHhVvCcSsQqTtAaZz,]+$/, 'solo números y órdenes de dibujo');
    }
  }
  // El mapa: las 32 provincias, cada una una vez, en una casilla distinta dentro de la rejilla, y todas se pueden tocar en el creador.
  assert.equal(MAPA_PROVINCIAS.length, 32);
  assert.deepEqual(MAPA_PROVINCIAS.map(p => p.clave).sort(), PROVINCIAS.map(p => p.clave).sort());
  assert.equal(new Set(MAPA_PROVINCIAS.map(p => `${p.columna},${p.fila}`)).size, 32);
  assert.equal(new Set(MAPA_PROVINCIAS.map(p => p.letras)).size, 32, 'dos casillas con las mismas letras');
  for (const p of MAPA_PROVINCIAS) {
    assert.ok(p.columna >= 0 && p.columna < MAPA_COLUMNAS && p.fila >= 0 && p.fila < MAPA_FILAS, p.clave);
    assert.ok(p.letras.length <= 3, p.clave);
    assert.ok(ZONAS_CREADOR.some(z => z.clave === p.clave && z.tipo === 'provincia'), `${p.clave} no se puede elegir tocando`);
  }
  assert.deepEqual(Object.fromEntries(REGIONES.map(r => [r.clave, [...r.provincias].sort()])), Object.fromEntries(Object.entries(PROVINCIAS_DE_REGION).map(([k, v]) => [k, [...v].sort()])));
  assert.deepEqual(Object.keys(EDIFICIOS_POR_TAMANO), ORDEN_TAMANOS);
  // app.js usa íconos que existen.
  for (const m of appJs.matchAll(/icono\('([a-z_-]+)'/g)) {
    assert.ok(appJs.includes(`  ${m[1]}: [`) || m[1] in ICONOS_PROYECTO, `falta el ícono ${m[1]}`);
  }
});
