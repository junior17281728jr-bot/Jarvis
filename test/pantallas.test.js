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
  // Fase 1, parte d: la IA opcional y las Claves.
  const { MOTIVOS, PROPOSITOS, ESTADOS_LLAMADA } = await import('../src/ia/propositos.js');
  const { PROVEEDORES } = await import('../src/ia/proveedores/index.js');
  const { USOS, GRUPOS, ESTADOS_SECRETO } = await import('../src/claves/usos.js');
  const { GRUPOS_CAMBIO } = await import('../src/ia/interpretar.js');
  const cat = catalogo();
  const claves = [
    ...MOTIVOS.map(x => `ia.motivo.${x}`),
    ...Object.keys(PROPOSITOS).map(x => `ia.proposito.${x}`),
    ...Object.keys(PROVEEDORES).map(x => `ia.proveedor.${x}`),
    ...ESTADOS_LLAMADA.map(x => `ia.estado_llamada.${x}`),
    ...['general', 'e', 'p'].map(x => `ia.ambito.${x}`),
    ...['clave', 'tope', 'precio', 'encendida', 'listo', 'pendiente'].map(x => `ia.falta.${x}`),
    ...PLANES.map(x => `ia.plan.${x}`),
    ...['encendida', 'apagada'].map(x => `ia.ayuda.${x}`),
    ...['apagada', 'encendida', 'sin_uso', 'tope_lleno'].map(x => `ia.estado.${x}`),
    ...Object.keys(USOS).flatMap(x => [`claves.uso.${x}`, `claves.donde.${x}`, `claves.corto.${x}`]),
    ...GRUPOS.map(x => `claves.grupo.${x}`),
    ...[...ESTADOS_SECRETO, 'ninguna', 'pausada', 'no_pasa', 'ilegible'].map(x => `claves.estado.${x}`),
    ...GRUPOS_CAMBIO.map(x => `version.campo_ia.${x}`),
    'historial.version_nueva.ia', 'aviso.ia_tope', 'aviso.ia_tope.lleno', 'aviso.ia_proveedor', 'aviso.ia_proveedor.admin',
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
    'creador.falta.', 'creador.fuera.', 'tareas.fase.', 'tareas.estado.', 'tareas.tipo.', 'tareas.motivo.', 'tareas.evento.', 'tareas.como.', 'tareas.freno.', 'modo_seguro.motivo.', 'modo_seguro.quitado.', 'aviso.', 'aviso.nivel.', 'sistema.semaforo.', 'servidor.semaforo.',
    // Fase 1, parte d.
    'ia.motivo.', 'ia.proposito.', 'ia.proveedor.', 'ia.estado.', 'ia.estado_llamada.', 'ia.ambito.', 'ia.falta.', 'ia.plan.', 'ia.ayuda.',
    'claves.uso.', 'claves.donde.', 'claves.estado.', 'claves.grupo.', 'claves.corto.', 'version.campo_ia.']));
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
  const { ICONOS_SECTOR, ICONOS_PROYECTO, ICONOS_SERVICIOS, MAPA_PROVINCIAS, MAPA_COLUMNAS, MAPA_FILAS, PROVINCIAS_DE_REGION, EDIFICIOS_POR_TAMANO } = await import('../public/dibujos.js');
  const { SECTORES } = await import('../src/motor/diccionarios.js');
  const { PROVINCIAS, REGIONES } = await import('../src/motor/lugares.js');
  const { ZONAS_CREADOR, ORDEN_TAMANOS } = await import('../public/creador.js');
  const sectores = SECTORES.map(s => s.clave).filter(s => s !== 'todas');
  assert.equal(sectores.length, 37);
  for (const s of sectores) assert.ok(Array.isArray(ICONOS_SECTOR[s]) && ICONOS_SECTOR[s].length, `falta el ícono de ${s}`);
  assert.deepEqual(Object.keys(ICONOS_SECTOR).sort(), [...sectores].sort(), 'un ícono de un negocio que el motor no conoce');
  for (const forma of [...Object.values(ICONOS_SECTOR), ...Object.values(ICONOS_PROYECTO), ...Object.values(ICONOS_SERVICIOS)]) {
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
  // app.js usa íconos que existen (también los que guarda en tablas, como { activa: 'bien' }).
  const existe = nombre => appJs.includes(`  ${nombre}: [`) || nombre in ICONOS_PROYECTO || nombre in ICONOS_SERVICIOS;
  for (const m of appJs.matchAll(/icono\('([a-z_-]+)'/g)) assert.ok(existe(m[1]), `falta el ícono ${m[1]}`);
  for (const tabla of ['ICONO_GRUPO_CLAVES', 'ICONO_ESTADO_CLAVE']) {
    const cuerpo = appJs.match(new RegExp(`const ${tabla} = \\{([^}]*)\\}`))?.[1];
    assert.ok(cuerpo, tabla);
    for (const m of cuerpo.matchAll(/'([a-z_-]+)'/g)) assert.ok(existe(m[1]), `falta el ícono ${m[1]} (${tabla})`);
  }
  // Ningún nombre se repite entre las tablas de íconos (uno taparía al otro).
  for (const nombre of Object.keys(ICONOS_SERVICIOS)) assert.ok(!appJs.includes(`  ${nombre}: [`) && !(nombre in ICONOS_PROYECTO), `ícono repetido: ${nombre}`);
});

// ---------- Fase 1, parte d: las pantallas de la IA opcional y de Claves ----------

const iaVistaJs = readFileSync(join(RAIZ, 'public/ia-vista.js'), 'utf8');
// Un trozo de app.js: desde una línea que empieza con «desde» hasta la siguiente sección («// ---------- »).
function seccionDe(texto, desde) {
  const inicio = texto.indexOf(desde);
  assert.ok(inicio >= 0, `no encontré ${desde}`);
  const fin = texto.indexOf('\n// ---------- ', inicio + desde.length);
  return texto.slice(inicio, fin < 0 ? texto.length : fin);
}

test('27. «Usar …» de un proveedor solo existe con su precio confirmado (con la respuesta real del servidor: ChatGPT sin precio)', async () => {
  const { controlesProveedores } = await import('../public/ia-vista.js');
  const config = configDePrueba();
  const db = abrirBase(config);
  await conServidor(crearServidor({ db, config }), async base => {
    const dueno = { 'Tailscale-User-Login': 'junior@example.com', 'X-Oportia': '1', 'Content-Type': 'application/json' };
    const creado = await fetch(`${base}/api/primer-admin`, { method: 'POST', headers: dueno, body: JSON.stringify({ nombre: 'junior', clave: 'una clave bien larga' }) });
    assert.equal(creado.status, 201);
    const galleta = creado.headers.get('set-cookie').split(';')[0];
    const r = await fetch(`${base}/api/admin/ia`, { headers: { ...dueno, Cookie: galleta } });
    assert.equal(r.status, 200);
    const s = await r.json();
    assert.equal(s.encendida, false, 'la IA llega apagada');
    assert.equal(s.topeGeneralMicro, 0, 'y con tope US$0');
    const porId = Object.fromEntries(controlesProveedores(s.proveedores).map(c => [c.id, c]));
    assert.equal(s.proveedores.find(p => p.id === 'openai').precio?.confirmado, false, 'el precio de ChatGPT sigue sin confirmar');
    assert.deepEqual([porId.openai.conInterruptor, porId.openai.etiqueta, porId.openai.estado], [false, null, 'sin_precio'], 'sin precio no hay interruptor para ChatGPT');
    assert.deepEqual([porId.anthropic.conInterruptor, porId.anthropic.etiqueta], [true, 'ia.proveedor.usar']);
    // Por el enlace público: ni la lista de proveedores llega.
    const publico = await (await fetch(`${base}/api/admin/ia`, { headers: { 'Tailscale-Funnel-Request': '?1', Cookie: galleta } })).json();
    assert.equal(publico.esDueno, false);
    assert.equal(publico.proveedores, undefined);
    assert.deepEqual(controlesProveedores(publico.proveedores), []);
  });
  db.close();
  // Con los dos precios confirmados, el segundo dice que solo se usa cuando el primero no está.
  const claude = { id: 'anthropic', usar: true, usable: true, motivo: null, precio: { confirmado: true } };
  const chatgpt = { id: 'openai', usar: false, usable: false, motivo: 'proveedor_no_usado', precio: { confirmado: true } };
  assert.deepEqual(controlesProveedores([claude, chatgpt]).map(c => c.etiqueta), ['ia.proveedor.usar', 'ia.proveedor.segundo']);
  assert.deepEqual(controlesProveedores([claude, { ...chatgpt, precio: null }]).map(c => c.conInterruptor), [true, false]);
  assert.deepEqual(controlesProveedores([{ ...claude, precio: { confirmado: false }, usable: false, motivo: 'precio_sin_confirmar' }]).map(c => [c.conInterruptor, c.estado]), [[false, 'sin_precio']]);
  // app.js dibuja el interruptor de un proveedor solo cuando la decisión lo dice, y nunca escribe «segundo» por su cuenta.
  const proveedoresJs = appJs.slice(appJs.indexOf('controlesProveedores(proveedores).map'), appJs.indexOf('// ---- 6.'));
  assert.match(proveedoresJs, /c\.conInterruptor \? interruptor\(/);
  assert.equal((appJs.match(/interruptor\(/g) ?? []).length, 2, 'el interruptor solo se crea en su función y en la tarjeta de proveedores');
  for (const clave of ['ia.proveedor.usar', 'ia.proveedor.segundo']) assert.ok(clave in es && clave in en && iaVistaJs.includes(`'${clave}'`), clave);
});

test('27. el cuadro para pegar una clave es una línea de texto tapada (nunca un campo de contraseña), sin autocompletar ni corrector', async () => {
  const { ATRIBUTOS_CAMPO_CLAVE } = await import('../public/ia-vista.js');
  for (const [atributo, valor] of Object.entries({ autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'data-1p-ignore': 'true' })) {
    assert.equal(ATRIBUTOS_CAMPO_CLAVE[atributo], valor, atributo);
  }
  assert.equal(ATRIBUTOS_CAMPO_CLAVE.type, undefined, 'un textarea no lleva type');
  const claves = seccionDe(appJs, '// ---- #claves:');
  assert.match(claves, /el\('textarea', \{ \.\.\.ATRIBUTOS_CAMPO_CLAVE/);
  assert.doesNotMatch(claves, /password|el\('input'/, 'en Claves no hay ningún campo de contraseña ni otro input');
  // Se vacía apenas se manda y nunca se vuelve a mostrar (la respuesta solo trae los últimos 4 caracteres).
  assert.match(claves, /const valor = area\.value;\s+area\.value = '';/);
  const css = readFileSync(join(RAIZ, 'public/estilos.css'), 'utf8');
  assert.match(css, /textarea\.campo-clave \{[^}]*-webkit-text-security: disc/);
  // Solo se pide a /api/admin/claves desde la cuenta de Tailscale del dueño (el administrador la pide solo si esDueno).
  assert.match(appJs, /ia\.ok && ia\.datos\.esDueno \? await api\('GET', '\/api\/admin\/claves'\)/);
});

test('27. la ayuda de IA en un proyecto: nunca un botón que no se puede usar, y nada para quien no tiene IA', async () => {
  const { vistaAyudaIa, partesBarraGasto, estadoDeClave, nombreModelo, leerDolares } = await import('../public/ia-vista.js');
  const ok = { disponible: true, motivo: 'ok', maximoMicro: 2200, tipicoMicro: 450, proveedor: 'anthropic', esAdmin: true, tarea: null };
  assert.equal(vistaAyudaIa(ok).vista, 'disponible');
  // Una cuenta sin presupuesto de IA solo recibe { disponible: false }: no se muestra nada.
  assert.equal(vistaAyudaIa({ disponible: false }).vista, 'nada');
  assert.equal(vistaAyudaIa(null).vista, 'nada');
  // Sin precio no hay botón (aunque diga «ok»).
  assert.notEqual(vistaAyudaIa({ ...ok, maximoMicro: null }).vista, 'disponible');
  assert.notEqual(vistaAyudaIa({ ...ok, disponible: false }).vista, 'disponible');
  const casos = {
    solo_tailnet: 'solo_tailnet', ia_apagada: 'apagada_admin', ayuda_no_activada: 'apagada_admin', tope_general: 'tope_lleno', tope_espacio: 'tope_lleno',
    trabajo_en_pausa: 'pausa', proveedor_en_pausa: 'no_disponible', sin_clave: 'no_disponible', demasiadas_llamadas: 'no_disponible', sin_pendiente: 'nada',
  };
  for (const [motivo, vista] of Object.entries(casos)) assert.equal(vistaAyudaIa({ ...ok, disponible: false, motivo }).vista, vista, motivo);
  // Otra cuenta (con presupuesto, fase 6): nunca el estado del dueño; un motivo extraño sale como «no disponible».
  assert.equal(vistaAyudaIa({ disponible: false, motivo: 'no_disponible', tarea: null }).vista, 'no_disponible');
  assert.equal(vistaAyudaIa({ disponible: false, motivo: 'ia_apagada' }).vista, 'no_disponible', 'solo el administrador ve «está apagada»');
  // Esperando, lista o no se pudo.
  assert.equal(vistaAyudaIa({ ...ok, tarea: { id: 7, estado: 'lista', resultado: null } }).vista, 'esperando');
  assert.equal(vistaAyudaIa({ ...ok, tarea: { id: 7, estado: 'en_curso', resultado: null } }).vista, 'esperando');
  const lista = vistaAyudaIa({ ...ok, tarea: { id: 7, estado: 'hecha', resultado: { usada: true, numero: 3, costoMicro: 420 } } }, { seguida: { tareaId: 7 } });
  assert.deepEqual(lista.lista, { numero: 3, costoMicro: 420 });
  const fallo = vistaAyudaIa({ ...ok, disponible: false, motivo: 'proveedor_en_pausa', tarea: { id: 8, estado: 'hecha', resultado: { usada: false, motivo: 'sin_credito', costoMicro: 0 } } }, { seguida: { tareaId: 8 } });
  assert.deepEqual([fallo.vista, fallo.fallo], ['no_disponible', { motivo: 'sin_credito', costoMicro: 0 }]);
  // Una ayuda vieja que no se pidió desde esta pantalla no se cuenta otra vez.
  assert.equal(vistaAyudaIa({ ...ok, tarea: { id: 9, estado: 'hecha', resultado: { usada: false, motivo: 'sin_credito' } } }).fallo, null);
  // Todo motivo que puede salir tiene su texto, y app.js usa la decisión para el botón.
  const { MOTIVOS } = await import('../src/ia/propositos.js');
  for (const m of MOTIVOS) assert.ok(`ia.motivo.${m}` in es && `ia.motivo.${m}` in en, m);
  assert.match(appJs, /vista\.vista === 'disponible'\) \{\s+const mensajeIa = caja\(\);\s+const boton = /);
  // La barra del gasto: lo real y lo apartado, en verde, amarillo desde el 80 % y rojo al llegar.
  assert.deepEqual(partesBarraGasto({ usadoMicro: 0, apartadoMicro: 0, topeMicro: 0 }), { realPct: 0, apartadoPct: 0, pct: 0, tono: 'bien' });
  assert.equal(partesBarraGasto({ usadoMicro: 500_000, topeMicro: 2_000_000 }).realPct, 25);
  assert.equal(partesBarraGasto({ usadoMicro: 1_700_000, topeMicro: 2_000_000 }).tono, 'atencion');
  assert.equal(partesBarraGasto({ usadoMicro: 2_000_000, topeMicro: 2_000_000 }).tono, 'mal');
  assert.equal(partesBarraGasto({ usadoMicro: 3_000_000, topeMicro: 2_000_000 }).realPct, 100, 'nunca más ancha que la barra');
  const conApartado = partesBarraGasto({ usadoMicro: 1_000_000, apartadoMicro: 400_000, topeMicro: 2_000_000 });
  assert.deepEqual([conApartado.realPct, conApartado.apartadoPct], [30, 20]);
  assert.ok(partesBarraGasto({ usadoMicro: 450, topeMicro: 2_000_000 }).realPct > 0, 'un uso chiquito se ve');
  // El estado de una clave.
  assert.equal(estadoDeClave(null).estado, 'ninguna');
  assert.equal(estadoDeClave({ legible: false }).estado, 'ilegible');
  assert.equal(estadoDeClave({ legible: true, prueba: 'ok', pausa: { motivo: 'sin_credito', hasta: null } }).estado, 'pausada');
  assert.equal(estadoDeClave({ legible: true, prueba: 'ok', pausa: { motivo: 'sobrecargado', hasta: '2000-01-01T00:00:00Z' } }).estado, 'activa', 'una pausa corta vencida ya no cuenta');
  assert.deepEqual(estadoDeClave({ legible: true, prueba: 'clave_no_valida', pausa: null }), { estado: 'no_pasa', tono: 'mal' });
  assert.deepEqual(estadoDeClave({ legible: true, prueba: 'ok', pausa: null }), { estado: 'activa', tono: 'bien' });
  // Nombres de modelos y dólares escritos a mano.
  assert.equal(nombreModelo('claude-haiku-5-5'), 'Claude Haiku 5.5');
  assert.equal(nombreModelo('gpt-6-luna'), 'GPT-6 Luna');
  assert.deepEqual(['2', '2.5', '2,50', 'US$ 3', '$1', '100.00', 'dos', '2.555', '-1', ''].map(leerDolares), ['2', '2.5', '2.50', '3', '1', '100.00', null, null, null, null]);
});

test('27. las frases de la IA son cortas y dicen dónde se paga Claude', () => {
  // El recordatorio: la API de Claude se paga aparte, en console.anthropic.com, no con la suscripción del chat.
  for (const idioma of [es, en]) {
    assert.match(idioma['ia.pago.claude'], /console\.anthropic\.com/);
    assert.match(idioma['claves.donde.ia_anthropic'], /console\.anthropic\.com/);
  }
  assert.match(es['ia.pago.claude'], /No es tu suscripción/);
  assert.ok(appJs.includes("t('ia.pago.claude')"), 'la pantalla de la IA muestra el recordatorio');
  // Poco texto en la cara de cada tarjeta: los títulos, botones y estados son cortos.
  for (const [clave, valor] of Object.entries(es)) {
    if (/^(servicios\.|ia\.estado\.[a-z_]+$|ia\.estado\.[a-z_]+\.corto$|claves\.estado\.|ia\.proveedor\.(lista|apagado)$)/.test(clave) || /\.(titulo|boton|guardar|encender|apagar|probar|activar|desactivar)$/.test(clave)) {
      if (!/^(servicios|ia|claves|ayuda_ia)\./.test(clave)) continue;
      assert.ok(valor.length <= 60, `${clave} es largo para una tarjeta: «${valor}»`);
    }
  }
  // inicio.viene.ia ya no se muestra (la IA ya llegó), pero la frase sigue en los archivos (nunca se borra nada).
  assert.ok('inicio.viene.ia' in es && !appJs.includes("'inicio.viene.ia'"));
  assert.ok(appJs.includes("'inicio.funciona.6'"));
  assert.equal(es['valor.ia.no_permitida'], 'No permitida · tope US$0');
});
