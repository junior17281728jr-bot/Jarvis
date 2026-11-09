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
  // Ronda 5 de revisión: el permiso de IA de cada cuenta (Administrador → Usuarios).
  const { ACCIONES_CONFIANZA, DESDE } = await import('../src/cuentas/confianza.js');
  // Fase 1, parte e: las copias y el Telegram.
  const { MOTIVOS_COPIA, NO_CLAVE } = await import('../public/copias-vista.js');
  const { ESTADOS_COPIA } = await import('../src/copias/formato.js');
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
    ...ACCIONES_CONFIANZA.map(x => `admin.ia.accion.${x}`),
    ...DESDE.map(x => `admin.ia.desde.${x}`),
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
    ...MOTIVOS_COPIA.map(x => `copias.motivo.${x}`),
    ...ESTADOS_COPIA.map(x => `copias.estado_fila.${x}`),
    ...NO_CLAVE.map(x => `copias.clave.no_puede.${x}`),
    ...['en_marcha', 'modo_seguro', 'sin_clave', 'sin_trabajador', 'disco_lleno', 'sin_destino'].map(x => `copias.no_ahora.${x}`),
    ...['bloqueado', 'perdido', 'clave_no_valida', 'sin_token', 'sin_probar', 'bot_ocupado', 'sin_red', 'pausa', 'bot_cambiado'].map(x => `telegram.problema.${x}`),
    'copias.aqui.anterior', 'aviso.copias_locales_pausadas.escribir', 'telegram.aviso.copias_locales_pausadas.escribir', 'ia.motivo.bot_cambiado', 'ia.motivo.sin_probar',
    ...[1, 2, 3, 4, 5].map(n => `copias.restaurar.paso${n}`),
    ...[1, 2, 3, 4].map(n => `telegram.como${n}`),
  ];
  for (const clave of claves) assert.ok(clave in es && clave in en, `falta la frase ${clave}`);
  // Y en el código, cada frase armada por partes usa uno de esos prefijos conocidos.
  const prefijos = new Set(claves.map(c => c.slice(0, c.lastIndexOf('.') + 1)).concat(['estado.', 'tipo.', 'idioma.', 'error.', 'faltante.', 'campo.producto.', 'capacidad.', 'proyecto.aviso_espera.', 'historial.', 'version.estado.', 'version.origen.', 'supuesto.', 'autonomia.', 'plan.',
    'creador.falta.', 'creador.fuera.', 'tareas.fase.', 'tareas.estado.', 'tareas.tipo.', 'tareas.motivo.', 'tareas.evento.', 'tareas.como.', 'tareas.freno.', 'modo_seguro.motivo.', 'modo_seguro.quitado.', 'aviso.', 'aviso.nivel.', 'sistema.semaforo.', 'servidor.semaforo.',
    // Fase 1, parte d.
    'ia.motivo.', 'ia.proposito.', 'ia.proveedor.', 'ia.estado.', 'ia.estado_llamada.', 'ia.ambito.', 'ia.falta.', 'ia.plan.', 'ia.ayuda.',
    'claves.uso.', 'claves.donde.', 'claves.estado.', 'claves.grupo.', 'claves.corto.', 'version.campo_ia.',
    // Fase 1, parte e.
    'copias.motivo.', 'copias.estado_fila.', 'copias.restaurar.paso', 'telegram.como', 'telegram.problema.']));
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
  assert.doesNotMatch(claves, /password/, 'en Claves no hay ningún campo de contraseña');
  // El único input de Claves (ronda 3): el segundo código de 6 cifras que el bot le manda al chat (números, de un uso).
  assert.deepEqual([...claves.matchAll(/el\('input', \{[^}]*\}/g)].map(m => m[0]), ["el('input', { id, name: 'codigo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 9, required: true, class: 'codigo-campo' }"]);
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
    solo_tailnet: 'solo_tailnet', ia_apagada: 'ia_apagada_admin', ayuda_no_activada: 'apagada_admin', tope_general: 'tope_lleno', tope_espacio: 'tope_lleno',
    trabajo_en_pausa: 'pausa', proveedor_en_pausa: 'no_disponible', sin_clave: 'no_disponible', demasiadas_llamadas: 'no_disponible', sin_pendiente: 'nada',
  };
  for (const [motivo, vista] of Object.entries(casos)) assert.equal(vistaAyudaIa({ ...ok, disponible: false, motivo }).vista, vista, motivo);
  // Ronda 2: si solo ESTE pedido no cabe en lo que queda del tope (uno más corto sí), no se dice «Tope lleno, vuelve
  // el…»: se dice que este pedido no cabe.
  for (const motivo of ['tope_general', 'tope_espacio', 'tope_proyecto']) {
    assert.equal(vistaAyudaIa({ ...ok, disponible: false, motivo, topeLleno: false }).vista, 'no_cabe', motivo);
    assert.equal(vistaAyudaIa({ ...ok, disponible: false, motivo, topeLleno: true }).vista, 'tope_lleno', motivo);
  }
  assert.match(appJs, /vista\.vista === 'no_cabe'\) partes = \[linea\('atencion', t\('ayuda_ia\.no_cabe'\)\)\]/);
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

// Ronda 1 de revisión: el precio MÁXIMO que se ve antes de confirmar nunca es menor que lo que se aparta (y se puede
// cobrar); lo gastado se redondea normal.
test('27b. el precio máximo se muestra redondeado hacia arriba: nunca menos de lo que se aparta', async () => {
  const { textoUsd } = await import('../public/ia-vista.js');
  const leer = texto => {
    const m = /^US\$([\d.,]+)$/.exec(texto);
    assert.ok(m, texto);
    return Math.round(Number(m[1].replace(/,/g, '')) * 1_000_000);
  };
  for (const formato of ['es-DO', 'en-US']) {
    for (let micro = 1; micro <= 5000; micro++) {
      const visto = leer(textoUsd(micro, formato, { haciaArriba: true }));
      assert.ok(visto >= micro, `${formato}: ${micro} µUSD se mostró como ${textoUsd(micro, formato, { haciaArriba: true })}`);
      assert.ok(visto - micro < 100, `${formato}: ${micro} µUSD, a lo sumo una diezmilésima de más`);
    }
    for (const micro of [9999, 10_000, 10_001, 123_456, 2_000_000, 2_000_001]) {
      const visto = leer(textoUsd(micro, formato, { haciaArriba: true }));
      assert.ok(visto >= micro && visto - micro < 10_000, `${formato}: ${micro}`);
    }
  }
  assert.equal(textoUsd(1812, 'es-DO', { haciaArriba: true }), 'US$0.0019', 'el caso de la revisión: se aparta 1812 µUSD');
  assert.equal(textoUsd(1812, 'es-DO'), 'US$0.0018', 'lo gastado se redondea normal');
  assert.equal(textoUsd(50, 'en-US'), '<US$0.0001');
  assert.equal(textoUsd(50, 'en-US', { haciaArriba: true }), 'US$0.0001');
  assert.equal(textoUsd(0, 'en-US', { haciaArriba: true }), 'US$0.00');
  assert.equal(textoUsd(null, 'en-US'), '—');
  // Las tres frases de «como máximo» usan el redondeo hacia arriba.
  for (const clave of ['ayuda_ia.precio', 'ayuda_ia.confirmar', 'ayuda_ia.precio_cambio']) {
    assert.match(appJs, new RegExp(`t\\('${clave.replace('.', '\\.')}', \\{ maximo: usdMaximo\\(`), clave);
  }
  assert.doesNotMatch(appJs, /maximo: usd\(/);
});

// Ronda 1 de revisión: en modo seguro, una ayuda que ya estaba en la fila dice la pausa (no «sigue en la fila» sin fin).
test('27c. con el trabajo en pausa y la ayuda en la fila, se ve la pausa y que el pedido espera', async () => {
  const { vistaAyudaIa } = await import('../public/ia-vista.js');
  const enPausa = { disponible: false, motivo: 'trabajo_en_pausa', esAdmin: true, tarea: { id: 4, estado: 'lista', resultado: null } };
  assert.deepEqual([vistaAyudaIa(enPausa).vista, vistaAyudaIa(enPausa).enFila], ['pausa', true]);
  assert.equal(vistaAyudaIa({ ...enPausa, tarea: { ...enPausa.tarea, estado: 'en_curso' } }).vista, 'pausa');
  assert.equal(vistaAyudaIa({ ...enPausa, tarea: null }).enFila, false);
  assert.equal(vistaAyudaIa({ ...enPausa, motivo: 'ok', disponible: true, maximoMicro: 900 }).vista, 'esperando', 'sin pausa, sigue esperando');
  // Cuando la pausa termina y la ayuda se hizo, la versión nueva aparece (la pantalla siguió preguntando).
  const lista = vistaAyudaIa({ disponible: true, motivo: 'ok', maximoMicro: 900, esAdmin: true, tarea: { id: 4, estado: 'hecha', resultado: { usada: true, numero: 2, costoMicro: 450 } } }, { seguida: { tareaId: 4 } });
  assert.deepEqual(lista.lista, { numero: 2, costoMicro: 450 });
  assert.match(appJs, /vista\.vista === 'pausa' && vista\.enFila\) \{[\s\S]*?t\('ayuda_ia\.pausa_en_fila'\)[\s\S]*?setTimeout\(\(\) => refrescarAyudaIa\(bloque, ctx\), 10_000\)/);
  for (const idioma of [es, en]) assert.ok(idioma['ayuda_ia.pausa_en_fila']);
});

// Ronda 5 de revisión: el permiso de IA de cada cuenta común. «Permitir IA» solo aparece para el dueño desde su cuenta de
// Tailscale (y con la cuenta activa); «Quitar IA», desde cualquier entrada. Antes de dar permiso se ve de dónde vino el
// último cambio de la cuenta. La pantalla de la IA dice cuántas cuentas esperan el permiso.
test('27e. Administrador: el permiso de IA de cada cuenta (dar solo el dueño desde Tailscale, quitar desde cualquier entrada)', () => {
  assert.match(appJs, /if \(u\.rol === 'admin' \|\| !u\.ia\) return null;/);
  assert.match(appJs, /const boton = permitida \? botonAccion\(t\('admin\.ia\.quitar'\)[^\n]*\n\s*: u\.activo && permisos\.admins \? botonAccion\(t\('admin\.ia\.permitir'\)/);
  assert.match(appJs, /if \(permitir && !confirm\(t\('admin\.ia\.confirmar', \{ nombre: u\.nombreVisible \|\| u\.nombre, origen \}\)\)\) return;/);
  assert.match(appJs, /api\('POST', `\/api\/admin\/usuarios\/\$\{u\.id\}\/ia`, \{ permitida: permitir \}\)/);
  assert.match(appJs, /controlPlan\(u\),\n\s*controlIa\(u\),/);
  assert.match(appJs, /t\('ia\.planes\.cuentas', \{ si: numero\(s\.cuentas\.permitidas \?\? 0\), no: numero\(s\.cuentas\.sinPermiso \?\? 0\) \}\)/);
  for (const clave of ['admin.ia.permitida', 'admin.ia.sin_permiso', 'admin.ia.solo_dueno', 'admin.ia.sin_historia', 'admin.ia.cambio_sin_anotar', 'ia.planes.ir_permisos', 'error.cuenta_inactiva', 'ia.motivo.cuenta_sin_permiso']) {
    assert.ok(es[clave] && en[clave], clave);
  }
});

// Ronda 1 de revisión: Administrador solo muestra los botones que sirven desde esta entrada (dueño único; cuentas por
// Tailscale mientras alguna pueda gastar IA) y dice por qué en una línea.
test('27d. Administrador: «Administrador» como rol solo para el dueño; crear, planes y reiniciar se esconden si no sirven', () => {
  assert.match(appJs, /permisos\.admins \? el\('option', \{ value: 'admin', texto: t\('admin\.rol\.admin'\) \}\) : null/);
  assert.match(appJs, /permisos\.cuentas \? formulario : el\('p', \{ class: 'aviso con-icono-arriba' \}, icono\('candado'\), el\('span', \{ texto: t\('admin\.cuentas_solo_tailnet'\) \}\)\)/);
  assert.match(appJs, /if \(!permisos\.cuentas\) return el\('p', \{ class: 'suave', texto: t\('admin\.plan\.solo_ver'/);
  assert.match(appJs, /!u\.activo \|\| !puedeEntrarle \? null : el\('button'/);
  assert.match(appJs, /s\.motivoDueno === 'solo_el_dueno' \? 'ia\.solo_el_dueno' : 'ia\.solo_dueno'/);
  assert.match(appJs, /e === 'solo_el_dueno' \? t\('claves\.solo_el_dueno'\)/);
  // «Volver a la versión sin IA» solo si cabe otra versión; si no, una línea dice por qué y qué hacer.
  assert.match(appJs, /escribe && v\.ayudaIa\.base && cabeOtra \? botonAccion\(t\('version\.volver_sin_ia'/);
  assert.match(appJs, /escribe && v\.ayudaIa\.base && !cabeOtra \? el\('p'[^\n]*t\('version\.volver_sin_ia_lleno'/);
  for (const clave of ['version.volver_sin_ia_lleno', 'admin.cuentas_solo_tailnet', 'admin.otro_admin', 'admin.plan.solo_ver', 'admin.nuevo.rol.solo_dueno', 'ia.solo_el_dueno', 'claves.solo_el_dueno',
    'error.cuentas_solo_tailnet', 'error.solo_el_dueno', 'servicios.claves.solo_el_dueno']) {
    assert.ok(es[clave] && en[clave], clave);
  }
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

// ---------- Fase 1, parte e: Copias, la clave de recuperación y el Telegram (pruebas 3.1–3.3 del diseño) ----------
const existe = clave => clave in es && clave in en;
const hora = h => new Date(Date.now() - h * 3_600_000).toISOString();
// Una respuesta de GET /api/admin/copias con todo bien (los casos cambian una parte).
const copiasBien = (cambio = {}) => ({
  clave: { activa: true, huella: 'A7F3', desde: hora(500), comprobadaEn: null, pendiente: null, anteriores: [] },
  telegram: { listo: true, motivo: null, chat: { estado: 'activo', nombre: 'Junior', problema: null }, bot: { usuario: 'oportia_junior_bot' } },
  ultima: { estado: 'verificada', motivo: null }, ultimaFuera: { fecha: hora(3), bytes: 41 * 1024 * 1024, partes: 21 }, proxima: hora(-20),
  enCurso: null, locales: { activas: true, pausadas: false, frenoDisco: false, copias: 3, mb: 120, libreMb: 7900, pisoMb: 2304, diasRestantes: 300 },
  fijada: true, recientes: [], modoSeguro: false, puede: { ahora: true, motivoNoAhora: null, crearClave: true, motivoNoClave: null },
  ...cambio,
});

test('3.1/3.3 Copias: cada estado de la tarjeta grande tiene sus frases, y un botón solo cuando se puede usar', async () => {
  const { vistaCopias, vistaDisco, motivoNoAhora } = await import('../public/copias-vista.js');
  const casos = {
    bien: copiasBien(),
    sin_clave: copiasBien({ clave: { activa: false, anteriores: [] }, puede: { ahora: false, motivoNoAhora: 'sin_clave', crearClave: true } }),
    sin_clave_funnel: copiasBien({ clave: { activa: false, anteriores: [] }, puede: { ahora: false, motivoNoAhora: 'sin_clave', crearClave: false, motivoNoClave: 'solo_desde_tailnet' } }),
    modo_seguro: copiasBien({ modoSeguro: true, puede: { ahora: false, motivoNoAhora: 'modo_seguro', crearClave: true } }),
    en_fila: copiasBien({ enCurso: { paso: 'preparar', n: null, de: null, esperando: true }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    haciendo: copiasBien({ enCurso: { paso: 'subir', n: 4, de: 11 }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    haciendo_sin_total: copiasBien({ enCurso: { paso: 'generar', n: 4, de: null }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    comprobando: copiasBien({ enCurso: { paso: 'verificar', n: 2, de: 11 }, puede: { ahora: false, motivoNoAhora: 'en_marcha' } }),
    freno_disco: copiasBien({ locales: { activas: true, pausadas: true, frenoDisco: true, libreMb: 250 }, puede: { ahora: false, motivoNoAhora: 'disco_lleno', crearClave: true } }),
    solo_locales: copiasBien({ telegram: null }),
    fallo: copiasBien({ ultima: { estado: 'fallida', motivo: 'parte_distinta:3' } }),
    telegram_problema: copiasBien({ telegram: { listo: false, motivo: 'bloqueado', chat: { estado: 'bloqueado', problema: 'bloqueado' } } }),
    primera: copiasBien({ ultimaFuera: null, ultima: null }),
    atrasada: copiasBien({ ultimaFuera: { fecha: hora(80), bytes: 1, partes: 1 } }),
    sin_fijar: copiasBien({ fijada: false }),
  };
  const vistas = {};
  for (const [nombre, c] of Object.entries(casos)) {
    const v = vistaCopias(c);
    vistas[nombre] = v;
    for (const clave of [v.titulo, v.linea, v.razon, v.enlace?.texto].filter(Boolean)) assert.ok(existe(clave), `${nombre}: falta ${clave}`);
    assert.ok(['bien', 'atencion', 'mal', 'info', 'apagado'].includes(v.tono), nombre);
    // La regla de siempre: o hay un botón que sirve, o una línea que dice por qué no (o un enlace adonde arreglarlo).
    if (motivoNoAhora(c) && v.accion !== 'crear_clave') assert.equal(v.accion, null, `${nombre}: un botón que no puede hacer nada`);
    if (v.accion && v.accion !== 'crear_clave') assert.equal(motivoNoAhora(c), null, nombre);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(vistas).map(([n, v]) => [n, v.estado])), {
    bien: 'bien', sin_clave: 'sin_clave', sin_clave_funnel: 'sin_clave', modo_seguro: 'modo_seguro', en_fila: 'en_fila', haciendo: 'haciendo',
    haciendo_sin_total: 'haciendo', comprobando: 'haciendo', freno_disco: 'freno_disco', solo_locales: 'solo_locales', fallo: 'fallo',
    telegram_problema: 'telegram_problema', primera: 'primera', atrasada: 'atrasada', sin_fijar: 'sin_fijar',
  });
  assert.equal(vistas.bien.accion, 'ahora');
  assert.equal(vistas.fallo.accion, 'otra_vez');
  assert.equal(vistas.sin_clave.accion, 'crear_clave');
  // Por el enlace público (o desde otra cuenta) no se ofrece crear la clave: se dice desde dónde.
  assert.equal(vistas.sin_clave_funnel.accion, null);
  assert.equal(vistas.sin_clave_funnel.razon, 'copias.clave.no_puede.solo_desde_tailnet');
  assert.equal(vistas.modo_seguro.accion, null);
  assert.equal(vistas.modo_seguro.enlace.href, '#admin/trabajo');
  assert.equal(vistas.freno_disco.accion, null);
  assert.equal(vistas.freno_disco.enlace.href, '#admin/servidor');
  assert.equal(vistas.haciendo.accion, null);
  assert.deepEqual(vistas.haciendo.progreso, { n: 4, de: 11 });
  assert.equal(vistas.haciendo.linea, 'copias.haciendo');
  assert.equal(vistas.haciendo_sin_total.linea, 'copias.haciendo_sin_total');
  assert.equal(vistas.comprobando.linea, 'copias.comprobando');
  assert.equal(vistas.solo_locales.enlace.href, '#claves');
  // Sin Telegram y con el disco que ya no deja guardar copias aquí: no hay adónde mandarla (el servidor diría sin_destino).
  const sinDestino = copiasBien({ telegram: null, locales: { activas: true, pausadas: true, frenoDisco: false, libreMb: 1900 } });
  assert.equal(motivoNoAhora(sinDestino), 'sin_destino');
  assert.equal(vistaCopias(sinDestino).accion, null);
  assert.equal(vistaCopias(sinDestino).razon, 'copias.no_ahora.sin_destino');
  // El disco: nunca se borra nada; con poco espacio se dice, con menos de 300 MB está en rojo.
  for (const [locales, tono] of [[{ activas: true }, 'bien'], [{ activas: true, pausadas: true }, 'atencion'], [{ frenoDisco: true }, 'mal'], [{ activas: false }, 'apagado'], [{ activas: true, diasRestantes: 12 }, 'atencion']]) {
    const v = vistaDisco(locales);
    assert.equal(v.tono, tono, JSON.stringify(locales));
    if (v.linea) assert.ok(existe(v.linea), v.linea);
  }
});

test('3.1 Copias: el Resumen, Inicio y el Telegram de Claves dicen cosas que existen en los dos idiomas', async () => {
  const { vistaAzulejoCopias, vistaAzulejoTelegram, vistaTelegram, motivoBase, codigoLegible, cuentaAtras, enlaceSeguro } = await import('../public/copias-vista.js');
  const resumenes = [null, { motivo: 'sin_clave' }, { motivo: 'solo_locales' }, { motivo: 'fallo', ultimaFuera: { fecha: hora(2) } }, { motivo: 'atrasada', ultimaFuera: null },
    { motivo: 'atrasada', ultimaFuera: { fecha: hora(50) } }, { motivo: null, tono: 'bien', ultimaFuera: { fecha: hora(2) } }];
  for (const r of resumenes) {
    for (const modoSeguro of [false, true]) {
      const v = vistaAzulejoCopias(r, { modoSeguro });
      assert.ok(existe(v.valor.clave), v.valor.clave);
      if (v.detalle) assert.ok(existe(v.detalle), v.detalle);
    }
  }
  // Recién configurado (clave y Telegram, sin ninguna copia todavía): no es una alarma roja.
  assert.notEqual(vistaAzulejoCopias({ motivo: 'atrasada', tono: 'mal', ultimaFuera: null }).tono, 'mal');
  const telegrams = [null, { listo: false, chat: null }, { listo: true, chat: { estado: 'activo', nombre: 'Junior' } }, { listo: false, motivo: 'bloqueado', chat: { estado: 'bloqueado' } },
    { listo: false, motivo: 'perdido', chat: { estado: 'perdido' } }, { listo: false, motivo: 'pausa', chat: { estado: 'activo' } }, { listo: false, motivo: 'sin_probar', chat: { estado: 'activo' } }];
  for (const tg of telegrams) {
    const v = vistaAzulejoTelegram(tg);
    assert.ok(existe(v.valor), v.valor);
    if (v.detalle) assert.ok(existe(v.detalle), v.detalle);
  }
  // Claves → Telegram: ① el bot, ② el chat (solo cuando el bot pasó la prueba), y los problemas.
  const token = { legible: true, prueba: 'ok' };
  assert.equal(vistaTelegram({}, { activa: null }).paso, 'bot');
  assert.equal(vistaTelegram({ bot: null }, { activa: { ...token, prueba: 'clave_no_valida' } }).problema, 'clave_no_valida');
  assert.equal(vistaTelegram({ bot: null }, { activa: { ...token, prueba: 'bot_ocupado' } }).problema, 'bot_ocupado');
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, chat: null }, { activa: token }).paso, 'unir');
  assert.deepEqual(vistaTelegram({ bot: { usuario: 'b' }, chat: { estado: 'perdido' } }, { activa: token }), { paso: 'unir', tokenBien: true, problema: 'perdido', chat: { estado: 'perdido' } });
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, listo: true, chat: { estado: 'activo' } }, { activa: token }).problema, null);
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, listo: false, motivo: 'bloqueado', chat: { estado: 'bloqueado', problema: 'bloqueado' } }, { activa: token }).problema, 'bloqueado');
  assert.equal(vistaTelegram({ bot: { usuario: 'b' }, listo: false, motivo: 'pausa', chat: { estado: 'activo' } }, { activa: token }).problema, 'pausa');
  // Un motivo desconocido nunca se muestra tal cual.
  assert.equal(motivoBase('parte_distinta:indice'), 'parte_distinta');
  assert.equal(motivoBase('algo_nuevo_de_otra_version'), 'otro');
  assert.equal(codigoLegible('48217730'), '4821 7730');
  assert.equal(cuentaAtras(new Date(Date.now() + 598_500).toISOString()), '9:58');
  assert.equal(cuentaAtras(hora(1)), null);
  // Solo un enlace de t.me con 8 cifras (nunca otra dirección que llegue en una respuesta).
  assert.equal(enlaceSeguro('https://t.me/oportia_junior_bot?start=48217730'), 'https://t.me/oportia_junior_bot?start=48217730');
  for (const malo of ['http://t.me/x_bot?start=48217730', 'https://t.me.ejemplo.com/x?start=48217730', 'javascript:alert(1)', 'https://t.me/x_bot?start=4821', null]) assert.equal(enlaceSeguro(malo), null, String(malo));
  // Lo que manda el Telegram (src/canales/textos.js) existe en los dos idiomas.
  const textos = readFileSync(join(RAIZ, 'src/canales/textos.js'), 'utf8');
  for (const m of textos.matchAll(/'(telegram\.[a-z0-9_.]+)'/g)) assert.ok(existe(m[1]) || (existe(`${m[1]}.titulo`) && existe(`${m[1]}.texto`)), `falta ${m[1]}`);
  // Los avisos de una actualización dicen cuál fue (sus 7 primeras cifras).
  for (const clave of ['aviso.actualizacion_no_instalada', 'aviso.actualizacion_revertida']) for (const d of [es, en]) assert.match(d[clave], /\{sha\}/, clave);
  assert.match(appJs, /actualizacion_\(no_instalada\|revertida\):\(\[0-9a-f\]\{7\}\)/);
});

test('3.2 Copias: íconos propios, y la clave de recuperación nunca se guarda en el navegador ni viaja al confirmarla', async () => {
  const { ICONOS_SERVICIOS } = await import('../public/dibujos.js');
  for (const nombre of ['copia', 'nube_candado', 'avion_papel', 'disco', 'clave_recuperacion', 'imprimir', 'copiar']) assert.ok(nombre in ICONOS_SERVICIOS, `falta el ícono ${nombre}`);
  // Los íconos que nombra la vista de las copias existen.
  const vista = readFileSync(join(RAIZ, 'public/copias-vista.js'), 'utf8');
  for (const m of vista.matchAll(/icono: '([a-z_]+)'/g)) assert.ok(m[1] in ICONOS_SERVICIOS || appJs.includes(`  ${m[1]}: [`), `ícono ${m[1]}`);
  // La pantalla manda SOLO el verificador al confirmar y al comprobar.
  const envios = [...appJs.matchAll(/api\('POST', '\/api\/admin\/copias\/clave\/(confirmar|comprobar)', (\{[^}]*\})\)/g)];
  assert.equal(envios.length, 2);
  for (const e of envios) assert.equal(e[2], '{ verificador: calculado.verificador }', e[1]);
  // La clave nueva vive en una variable de la pantalla: nunca en localStorage, sessionStorage, la dirección ni un borrador.
  const bloque = appJs.slice(appJs.indexOf('// ---------- Copias de seguridad (fase 1, parte e)'), appJs.indexOf('// ---------- IA opcional y Claves (fase 1, parte d)'));
  assert.ok(bloque.length > 1000);
  assert.doesNotMatch(bloque, /localStorage|sessionStorage|location\.hash\s*=(?!=)|borrador\(|recordarTexto\(/);
  // Al salir de Copias se suelta (y el código de Telegram al salir de Claves).
  assert.match(appJs, /if \(seccion !== 'copias'\) claveNueva = null;/);
  assert.match(appJs, /if \(seccion !== 'claves'\) vinculoEnPantalla = null;/);
  // La página calcula el verificador sin WebCrypto (también en una dirección http:// de Tailscale).
  assert.match(appJs, /import \{ leerClave, verificadorDe, grupoDistinto, gruposDeClave \} from '\.\/clave-recuperacion\.js';/);
  // El enlace al bot pasa siempre por enlaceSeguro.
  assert.match(appJs, /enlace: enlaceSeguro\(x\.datos\.enlace\)/);
});
