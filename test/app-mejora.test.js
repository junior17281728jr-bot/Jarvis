// 0.14.8: «Claude mejora la app». Sin internet y sin esperas de verdad: un Claude falso (127.0.0.1), un GitHub falso
// (127.0.0.1, test/github-falso.js), un reloj de mentira y un «correr las pruebas» falso (nunca se corre la suite de verdad
// desde aquí: se llamaría a sí misma).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { aplicarParche, motivoRuta, clavesDeIdioma } from '../src/academia/app-parche.js';
import { abrirTgz, carpetaArbol, contextoDePantalla, lectorDeArbol, pantallaDe, pedazoDeFuncion } from '../src/academia/app-fuente.js';
import {
  mejorarApp, leerPropuestas, leerConfigApp, guardarConfigApp, aprobarPropuesta, pedirMejora, pedirDeshacer, leerEstadoApp, leerRecorrido, vistaApp,
  parcheParaDescargar, leerDetalle, AJUSTE_TODO, TAREA_APP, TAREA_ELEGIR,
} from '../src/academia/app-mejora.js';
import { crearProbador, leerResultado } from '../src/academia/app-probador.js';
import { subirCambio } from '../src/canales/github.js';
import { escribirMensaje, leerChat, vistaChat } from '../src/academia/pidele.js';
import { leerConfigFabrica, puedeLlamar } from '../src/academia/fabrica.js';
import { leerCambios } from '../src/academia/cambios-ia.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { guardarSecreto } from '../src/claves/almacen.js';
import { validarValor } from '../src/claves/almacen.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { enTransaccion } from '../src/nucleo/db.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { crearGithubFalso, armarTgz } from './github-falso.js';
import { preparar, T0, buscarEnTodo } from './ia-base.js';
import { textoDelPedido } from './fabrica-base.js';

const tokenFalso = (letra = 'Q') => ['github', 'pat', `${letra.repeat(30)}x${letra.repeat(30)}`].join('_');
const ES = '{\n  "app.nombre": "Academia",\n  "camino.titulo": "Tu camino",\n  "camino.pct": "{pct} % hecho"\n}\n';
const EN = '{\n  "app.nombre": "Academy",\n  "camino.titulo": "Your path",\n  "camino.pct": "{pct} % done"\n}\n';
const CAMINO = "export function camino(h) {\n  return h.el('div', { class: 'camino-caja' }, h.t('camino.titulo'));\n}\n";
const REPO = {
  'package.json': '{ "type": "module" }\n',
  'public/index.html': '<!doctype html><title>App</title>\n',
  'public/i18n/es.json': ES, 'public/i18n/en.json': EN,
  'public/camino-plegable.js': CAMINO,
  'public/app.js': "function el() {}\nasync function pantallaInicio() {\n  return el('main', { class: 'inicio' });\n}\nfunction otra() {}\n",
  'public/estilos.css': '.camino-caja { padding: 8px; }\n.otra { color: red; }\n',
  'public/sw.js': 'self.x = 1;\n',
  'src/app.js': 'export const secreto = 1;\n',
  'test/uno.test.js': '// una prueba\n',
};
// Lo que «propone Claude» si la prueba no dice otra cosa: la caja del Camino más grande, con su CSS y un texto.
const BUENA = Object.freeze({
  nada_importante: false, titulo: 'El Camino más fácil de leer', explicacion: 'La caja del Camino se ve más grande y clara.', idea_para_desarrollador: null,
  cambios: [{ archivo: 'public/camino-plegable.js', buscar: "{ class: 'camino-caja' }", reemplazar: "{ class: 'camino-caja camino-grande' }" },
    { archivo: 'public/estilos.css', buscar: '', reemplazar: '.camino-grande { font-size: 1.2rem; }' }],
  textos: [{ clave: 'camino.titulo', es: 'Tu camino de piloto', en: 'Your pilot path' }],
});

// Un proceso falso (lo que devolvería spawn): escribe «salida» y termina con «codigo», sin esperar.
function procesoFalso({ salida = '', codigo = 0 } = {}) {
  const h = new EventEmitter();
  h.stdout = new PassThrough();
  h.stderr = new PassThrough();
  h.kill = () => {};
  setImmediate(() => { h.stdout.end(salida); h.stderr.end(); setImmediate(() => h.emit('close', codigo)); });
  return h;
}
const TAP_OK = 'ok 1 - una\n# tests 5\n# pass 5\n# fail 0\n';
const TAP_MAL = 'not ok 3 - las pantallas nunca usan innerHTML\n# tests 5\n# pass 3\n# fail 2\n';

async function conApp(fn, { token = true, respuesta = () => BUENA, pruebas = () => ({ salida: TAP_OK, codigo: 0 }), tope = 50_000_000 } = {}) {
  let ahoraMs = T0;
  const reloj = () => ahoraMs;
  const opciones = { respuesta, pruebas, elegir: () => ({ pantalla: 'inicio', posible: true, idea: null }) };
  const falso = await crearProveedorFalso({ respuestaJson: cuerpo => {
    const t = textoDelPedido(cuerpo);
    if (t.startsWith(TAREA_ELEGIR)) return opciones.elegir(cuerpo);
    if (t.startsWith(TAREA_APP)) return opciones.respuesta(cuerpo);
    return { nada: true };
  } });
  const gh = await crearGithubFalso({ archivos: REPO, repo: 'dueno/app', token: tokenFalso() });
  const base = preparar({ tope, iaBases: { anthropic: falso.base }, ahora: T0 });
  const { db, config, admin } = base;
  config.carpetaDatos = join(config.raiz, 'datos');
  config.carpetaAppMejora = join(config.raiz, 'app-mejora');
  config.canalesBases = { github: gh.base, github_descarga: gh.base };
  mkdirSync(config.carpetaDatos, { recursive: true });
  guardarConfigApp(db, { repo: 'dueno/app' });
  if (token) guardarSecreto(db, config, { uso: 'github_token', valor: tokenFalso(), usuarioId: admin, ahora: T0 });
  const escribir = async trabajo => enTransaccion(db, trabajo);
  const lanzadas = [];
  const probador = crearProbador({ db, config, reloj,
    lanzar: args => { lanzadas.push(args); return procesoFalso(opciones.pruebas(args)); },
    sintaxis: () => procesoFalso({ codigo: 0 }) });
  const ctx = () => ({ db, config, escribir, senal: new AbortController().signal, ia: crearClienteIA({ db, config, escritor: { escribir }, reloj, registro: { error() {} } }) });
  // Corre pasos (del trabajador y del probador) hasta que no quede nada que hacer ahora.
  const correr = async ({ max = 30, soloPedidos = false } = {}) => {
    const salidas = [];
    for (let i = 0; i < max; i++) {
      const r = await mejorarApp(ctx(), { ahora: reloj(), cfg: leerConfigFabrica(db), soloPedidos, puedeLlamar });
      salidas.push(r);
      if (r.trabajo && r.seguir) continue;
      const p = await probador.probarUna();
      if (!p) break;
    }
    return salidas;
  };
  const llamadas = () => falso.peticiones.filter(p => p.ruta === '/v1/messages');
  const instalar = sha => writeFileSync(join(config.carpetaDatos, 'version.txt'), `${sha}\n`);
  const malo = sha => writeFileSync(join(config.carpetaDatos, 'version.bad'), `${sha}\n`);
  try {
    instalar(gh.main());
    await fn({ ...base, gh, falso, correr, llamadas, reloj, avanzar: ms => { ahoraMs += ms; }, opciones, lanzadas, instalar, malo, probador, ctx });
  } finally {
    db.close();
    await falso.cerrar?.();
    await gh.cerrar();
  }
}

// ---------- Lo puro: qué se puede tocar ----------
test('solo la parte visible: public/ (js, css, index.html) y los textos; nunca src/, test/, package.json, sw.js, pagos ni claves', () => {
  for (const mala of ['src/app.js', 'test/reglas.test.js', 'package.json', 'deploy/cloud-init.sh', 'public/sw.js', 'public/pagos.js', 'public/pago-servidor-vista.js',
    'public/clave-recuperacion.js', 'public/confirmar-clave.js', 'public/i18n/es.json', 'public/fondos/cielo.webp', 'README.md', '.env']) assert.ok(motivoRuta(mala), mala);
  // Rutas raras (pasarse de carpeta, barras, mayúsculas, absolutas): se rechazan antes de mirar el disco.
  for (const rara of ['public/../src/app.js', 'public/./app.js', '/etc/passwd', 'public\\app.js', 'public//app.js', 'PUBLIC/APP.JS', 'public/%2e%2e/x.js', 'public/.oculto.js', 'public/app.js ', '']) {
    assert.ok(motivoRuta(rara), rara);
  }
  for (const buena of ['public/app.js', 'public/estilos.css', 'public/index.html', 'public/clase/motor.js']) assert.equal(motivoRuta(buena), null, buena);
  const leer = r => REPO[r] ?? null;
  for (const archivo of ['src/app.js', 'test/uno.test.js', 'package.json', 'public/sw.js', 'public/../src/app.js']) {
    const r = aplicarParche({ titulo: 'x', cambios: [{ archivo, buscar: 'x', reemplazar: 'y' }] }, leer);
    assert.equal(r.ok, false, archivo);
    assert.match(r.motivo, /fuera_de_lo_permitido|ruta_no_valida/);
  }
  // Un archivo que no existe tampoco (solo se editan los que ya están).
  assert.equal(aplicarParche({ titulo: 'x', cambios: [{ archivo: 'public/nuevo.js', buscar: '', reemplazar: 'x' }] }, leer).motivo, 'archivo_no_existe');
});

test('nunca innerHTML, estilos incrustados, direcciones de internet ni fetch: ni en un pedazo ni juntando dos', () => {
  const leer = r => REPO[r] ?? null;
  const con = reemplazar => aplicarParche({ titulo: 'x', cambios: [{ archivo: 'public/camino-plegable.js', buscar: "h.t('camino.titulo')", reemplazar }] }, leer);
  assert.equal(con("(n => { n.innerHTML = '<b>x</b>'; return n; })(h.el('b'))").motivo, 'peligro:html_crudo');
  assert.equal(con("h.el('b', { style: 'color:red' })").ok, true, 'style como propiedad de el(): es una clase de atributo… pero');
  assert.equal(con("h.el('b', { 'style=': 1 })").motivo, 'peligro:estilo_incrustado');
  assert.equal(con("h.el('b', {}, x => x.setAttribute('style', 'a'))").motivo, 'peligro:estilo_incrustado');
  assert.equal(con("h.el('a', { href: 'https://malo.example' })").motivo, 'peligro:internet');
  assert.equal(con("fetch('/api/x')").motivo, 'peligro:red');
  assert.equal(con("eval('1')").motivo, 'peligro:codigo_texto');
  assert.equal(con('localStorage.x').motivo, 'peligro:datos_navegador');
  // En el CSS: nada de afuera.
  assert.equal(aplicarParche({ titulo: 'x', cambios: [{ archivo: 'public/estilos.css', buscar: '', reemplazar: "@import 'x.css';" }] }, leer).motivo, 'peligro:css_afuera');
  // Juntando dos pedazos («inner» + «HTML»): lo revisa el archivo entero que queda.
  const dos = aplicarParche({ titulo: 'x', cambios: [
    { archivo: 'public/camino-plegable.js', buscar: 'return h.el', reemplazar: 'const n = h.el' },
    { archivo: 'public/camino-plegable.js', buscar: "h.t('camino.titulo'));", reemplazar: "h.t('camino.titulo')); n.inner" },
    { archivo: 'public/camino-plegable.js', buscar: ' n.inner', reemplazar: ' n.innerHTML = 1; return n;' },
  ] }, leer);
  assert.equal(dos.motivo, 'peligro:html_crudo');
  // «buscar» que no está o que está dos veces.
  assert.equal(con === null ? null : aplicarParche({ titulo: 'x', cambios: [{ archivo: 'public/camino-plegable.js', buscar: 'no existe', reemplazar: 'y' }] }, leer).motivo, 'buscar_no_esta');
  assert.equal(aplicarParche({ titulo: 'x', cambios: [{ archivo: 'public/estilos.css', buscar: '{ ', reemplazar: '{  ' }] }, leer).motivo, 'buscar_repetido');
});

test('los textos: en los dos idiomas, con sus {marcas}, sin claves repetidas; el cambio bueno trae su diff', () => {
  const leer = r => REPO[r] ?? null;
  const r = aplicarParche(BUENA, leer);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.resumen, ['public/camino-plegable.js', 'public/estilos.css', 'public/i18n/en.json', 'public/i18n/es.json']);
  const es = r.archivos.find(x => x.archivo === 'public/i18n/es.json').despues;
  assert.equal(JSON.parse(es)['camino.titulo'], 'Tu camino de piloto');
  assert.deepEqual(clavesDeIdioma(es).repetidas, []);
  assert.match(r.diff, /\+export function camino|\+ {2}return h\.el\('div', \{ class: 'camino-caja camino-grande' \}/);
  // Una clave nueva va a los dos archivos.
  const nueva = aplicarParche({ titulo: 'x', textos: [{ clave: 'camino.nuevo', es: 'Nuevo', en: 'New' }] }, leer);
  assert.equal(nueva.ok, true);
  assert.equal(JSON.parse(nueva.archivos.find(x => x.archivo === 'public/i18n/en.json').despues)['camino.nuevo'], 'New');
  // Una clave que ya existe conserva sus marcas; sin código ni direcciones; clave rara no.
  assert.equal(aplicarParche({ titulo: 'x', textos: [{ clave: 'camino.pct', es: 'Hecho', en: 'Done' }] }, leer).motivo, 'marcas_cambiadas');
  assert.equal(aplicarParche({ titulo: 'x', textos: [{ clave: 'camino.x', es: '<img src=x onerror=1>', en: 'x' }] }, leer).motivo, 'texto_no_valido');
  assert.equal(aplicarParche({ titulo: 'x', textos: [{ clave: 'Camino X', es: 'a', en: 'b' }] }, leer).motivo, 'clave_no_valida');
  assert.equal(clavesDeIdioma('{\n  "a.b": "1",\n  "a.b": "2"\n}\n').repetidas[0], 'a.b');
});

test('la copia de main: se abre del .tar.gz sin enlaces ni «..», y cada pantalla manda solo lo suyo', () => {
  const dir = join(preparar({ guardar: false, encendida: false, tope: 0 }).config.raiz, 'x');
  const ok = abrirTgz(armarTgz(REPO, 'app-abc'), join(dir, 'a'));
  assert.equal(ok.ok, true);
  assert.equal(readFileSync(join(dir, 'a', 'public', 'camino-plegable.js'), 'utf8'), CAMINO);
  const enlace = abrirTgz(armarTgz(REPO, 'app-abc', { extra: [{ nombre: 'public/enlace.js', tipo: '2' }] }), join(dir, 'b'));
  assert.equal(enlace.ok, true);
  assert.ok(!existsSync(join(dir, 'b', 'public', 'enlace.js')), 'un enlace nunca se crea');
  assert.equal(abrirTgz(armarTgz(REPO, 'app-abc', { extra: [{ nombre: '../../fuera.js', contenido: 'x' }] }), join(dir, 'c')).motivo, 'fuente_rara');
  assert.equal(abrirTgz(Buffer.from('no es un tgz'), join(dir, 'd')).motivo, 'fuente_rota');
  // Lo que ve Claude de «inicio»: el Camino, el pedazo de app.js de pantallaInicio, el CSS de sus clases y sus textos.
  const leer = lectorDeArbol(join(dir, 'a'));
  assert.equal(leer('src/app.js'), null, 'el lector nunca abre src/');
  const c = contextoDePantalla(leer, pantallaDe('inicio'));
  assert.deepEqual(c.archivos.map(x => x.archivo), ['public/camino-plegable.js', 'public/app.js']);
  assert.ok(!c.archivos[1].texto.includes('function otra'), 'solo el pedazo de la función');
  assert.deepEqual(c.css.map(x => x.reglas), ['.camino-caja { padding: 8px; }']);
  assert.deepEqual(c.textos, { 'camino.titulo': 'Tu camino' });
  assert.equal(pedazoDeFuncion('function a() {}\nfunction b() {}\n', 'b'), 'function b() {}\n');
});

// ---------- El camino entero ----------
test('el modo solo: Claude propone → todas las pruebas pasan → se sube solo a GitHub (rama + main hacia adelante) → instalado', async () => {
  await conApp(async ({ db, gh, correr, llamadas, lanzadas, instalar, config }) => {
    const base = gh.main();
    const sal = await correr();
    assert.equal(llamadas().length, 1, JSON.stringify(sal) + JSON.stringify(leerPropuestas(db)));
    const pedido = typeof llamadas()[0].cuerpo === 'string' ? JSON.parse(llamadas()[0].cuerpo) : llamadas()[0].cuerpo;
    assert.equal(pedido.model, 'claude-opus-5-5');
    assert.ok(JSON.stringify(pedido.system).includes('camino-caja') && !JSON.stringify(pedido).includes('export const secreto'), 'solo los archivos de la pantalla');
    assert.equal(lanzadas.length, 1, 'TODAS las pruebas, una vez');
    assert.deepEqual(lanzadas[0].archivos, ['test/uno.test.js']);
    let p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'subido', JSON.stringify(p));
    assert.notEqual(gh.main(), base);
    assert.equal(gh.main(), p.commit);
    assert.deepEqual(gh.commit(p.commit).padres, [base], 'main avanzó hacia adelante, sin forzar');
    assert.equal(gh.ramas.get(`claude-app/${p.id}`), p.commit, 'y quedó su rama');
    const subido = gh.archivosDe(p.commit);
    assert.match(subido['public/camino-plegable.js'], /camino-grande/);
    assert.equal(subido['src/app.js'], REPO['src/app.js'], 'nada fuera de public/');
    // La copia quedó como estaba después de probar.
    assert.equal(readFileSync(join(carpetaArbol(config, base), 'public', 'camino-plegable.js'), 'utf8'), CAMINO);
    // El actualizador lo instaló (version.txt) → «instalado», en el registro y con su aviso.
    instalar(p.commit);
    await correr({ max: 1 });
    p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'instalado');
    assert.ok(leerCambios(db).some(c => c.que === 'app_instalada'));
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = ?").get(`app_instalada:${p.id}`));
    const e = leerEstadoApp(db);
    assert.equal(e.fase, 'visual');
    assert.ok(['ahora', 'hecha'].includes(e.estado));
    assert.ok(typeof e.actual === 'string' && e.actualizado);
  });
});

test('con «instalar solo» apagado: pasa las pruebas y ESPERA «Aprobar»; sin aprobar nunca se sube', async () => {
  await conApp(async ({ db, gh, correr }) => {
    guardarConfigApp(db, { autoSubir: false });
    const base = gh.main();
    await correr();
    let p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'esperando_aprobar');
    await correr();
    assert.equal(gh.main(), base, 'sin «Aprobar», GitHub no cambia');
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = ?").get(`app_lista:${p.id}`), 'el aviso (Telegram) de que hay uno listo');
    enTransaccion(db, () => aprobarPropuesta(db, { id: p.id }));
    await correr();
    p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'subido');
    assert.equal(gh.main(), p.commit);
  });
});

test('si alguna prueba falla: se descarta, se anota, nunca se sube, y la copia vuelve a quedar como estaba', async () => {
  await conApp(async ({ db, gh, correr, config }) => {
    const base = gh.main();
    await correr();
    const p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'no_paso');
    assert.equal(p.pruebas.fallaron, 2);
    assert.deepEqual(p.pruebas.fallidas, ['las pantallas nunca usan innerHTML']);
    assert.equal(gh.main(), base);
    assert.equal(gh.peticiones.filter(x => x.metodo !== 'GET').length, 0, 'ni un pedido que escriba en GitHub');
    assert.ok(leerCambios(db).some(c => c.que === 'app_no_paso'));
    assert.equal(readFileSync(join(carpetaArbol(config, base), 'public', 'camino-plegable.js'), 'utf8'), CAMINO);
    // Dos intentos que no pasan: esa pantalla queda hecha y sigue la siguiente.
    assert.deepEqual([leerRecorrido(db).pantallas.inicio.intentos, leerRecorrido(db).pantallas.inicio.hecha], [2, true]);
  }, { pruebas: () => ({ salida: TAP_MAL, codigo: 1 }) });
  assert.deepEqual(leerResultado(TAP_MAL), { pasaron: 3, fallaron: 2, fallidas: ['las pantallas nunca usan innerHTML'] });
});

test('un cambio con innerHTML o fuera de public/ se rechaza en código: ni se prueba ni se sube', async () => {
  let n = 0;
  await conApp(async ({ db, gh, correr, lanzadas }) => {
    const base = gh.main();
    await correr({ max: 40 });
    const lista = leerPropuestas(db);
    assert.ok(lista.length >= 2);
    assert.deepEqual(lista.slice(0, 2).map(p => [p.estado, p.motivo]), [['rechazado', 'peligro:html_crudo'], ['rechazado', 'fuera_de_lo_permitido']]);
    assert.equal(lanzadas.length, 0);
    assert.equal(gh.main(), base);
  }, { respuesta: () => (n++ % 2 === 0
    ? { ...BUENA, cambios: [{ archivo: 'public/camino-plegable.js', buscar: "h.t('camino.titulo')", reemplazar: "Object.assign(h.el('b'), { innerHTML: '<i>x</i>' })" }], textos: [] }
    : { ...BUENA, cambios: [{ archivo: 'src/app.js', buscar: 'secreto = 1', reemplazar: 'secreto = 2' }], textos: [] }) });
});

test('main se movió mientras tanto: «conflicto», main queda como la dejó el otro (nunca se fuerza)', async () => {
  await conApp(async ({ db, gh, correr, probador, ctx, reloj }) => {
    guardarConfigApp(db, { autoSubir: false });
    await correr();
    const p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'esperando_aprobar');
    const otro = gh.moverMain({ 'public/index.html': '<!doctype html><title>Otro</title>\n' });
    enTransaccion(db, () => aprobarPropuesta(db, { id: p.id }));
    await mejorarApp(ctx(), { ahora: reloj(), cfg: leerConfigFabrica(db), puedeLlamar });
    assert.equal(leerPropuestas(db)[0].estado, 'conflicto');
    assert.equal(gh.main(), otro);
    void probador;
  });
  // Directo al adaptador: con una base vieja, nunca escribe main.
  await conApp(async ({ db, config, gh }) => {
    const viejo = gh.main();
    gh.moverMain({ 'public/index.html': 'x' });
    const r = await subirCambio(db, config, { repo: 'dueno/app', base: viejo, archivos: [{ archivo: 'public/index.html', despues: 'y' }], mensaje: 'x', rama: 'claude-app/abcdef123456', marca: '[claude-app abcdef123456]' });
    assert.equal(r.motivo, 'conflicto');
    assert.ok(!gh.peticiones.some(x => x.metodo === 'PATCH'));
  });
});

test('sin el token de GitHub: queda guardado (Copiar / Descargar), se pide UNA vez, y con el token se sube', async () => {
  await conApp(async ({ db, config, gh, correr, admin }) => {
    const base = gh.main();
    await correr();
    let p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'esperando_token');
    await correr();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'app_token:falta'").get().n, 1, 'un solo aviso');
    const d = parcheParaDescargar(db, p.id);
    assert.ok(d.diff.includes('camino-grande') && d.cambio.cambios.length === 2);
    assert.equal(gh.main(), base);
    guardarSecreto(db, config, { uso: 'github_token', valor: tokenFalso(), usuarioId: admin, ahora: T0 });
    await correr();
    p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'subido');
    assert.ok(db.prepare("SELECT resuelto_en FROM avisos WHERE clave = 'app_token:falta'").get().resuelto_en, 'el aviso se cierra');
  }, { token: false });
});

test('el token nunca aparece en la base, el registro, la pantalla ni la descarga (solo en la cabecera que va a GitHub)', async () => {
  await conApp(async ({ db, config, gh, correr }) => {
    await correr();
    const token = tokenFalso();
    assert.deepEqual(buscarEnTodo(db, config, token), [], 'en la base solo va cifrado');
    const p = leerPropuestas(db)[0];
    for (const v of [vistaApp(db), parcheParaDescargar(db, p.id), leerDetalle(db, p.id), leerCambios(db), leerEstadoApp(db)]) assert.ok(!JSON.stringify(v).includes(token));
    const conToken = gh.peticiones.filter(x => JSON.stringify(x).includes(token));
    assert.ok(conToken.length > 0);
    for (const x of conToken) {
      assert.equal(x.cabeceras.authorization, `Bearer ${token}`);
      assert.ok(!x.ruta.includes(token) && !x.cuerpo.includes(token), 'nunca en la dirección ni en el cuerpo');
    }
    // La descarga del código (pública) nunca lleva el token.
    assert.ok(gh.peticiones.filter(x => x.ruta.includes('/tar.gz/')).every(x => !x.cabeceras.authorization));
  });
  // Un token clásico (puede todo) nunca se guarda.
  assert.throws(() => validarValor('github_token', ['ghp', 'Z'.repeat(36)].join('_')), e => e.codigo === 400 || /clave_github_clasica/.test(String(e.message ?? e.error)));
});

test('el tope: sin saldo no llama; «Pausado: se acabó el saldo»; con más saldo sigue donde quedó sin pagar dos veces', async () => {
  await conApp(async ({ db, correr, llamadas, falso }) => {
    guardarConfigApp(db, { topeMicro: 1000 });
    await correr();
    assert.equal(llamadas().length, 0, 'ni una llamada');
    assert.equal(leerEstadoApp(db).estado, 'pausada');
    assert.equal(leerEstadoApp(db).actual, 'Pausado: se acabó el saldo');
    const p0 = leerPropuestas(db)[0];
    assert.equal(p0.estado, 'pensando');
    // El total de las fases 1–5 también manda (con el tope propio holgado).
    guardarConfigApp(db, { topeMicro: 20_000_000 });
    guardarAjuste(db, AJUSTE_TODO, '1000');
    await correr();
    assert.equal(llamadas().length, 0, 'el total de las fases tampoco alcanza');
    guardarAjuste(db, AJUSTE_TODO, '90000000');
    // Claude responde, pero el paso se corta antes de revisar el cambio: lo respondido ya quedó guardado con su costo.
    falso.siguiente('ok');
    await correr();
    assert.equal(llamadas().length, 1);
    assert.equal(leerPropuestas(db)[0].id, p0.id, 'la misma propuesta siguió');
    assert.ok(leerDetalle(db, p0.id).respuesta, 'lo que respondió Claude está guardado');
    const gastadas = db.prepare("SELECT COUNT(*) AS n FROM ia_llamadas WHERE proposito = 'app_mejorar'").get().n;
    assert.equal(gastadas, 1);
  });
});

test('lo que respondió Claude nunca se paga dos veces (un reinicio a mitad sigue con lo guardado)', async () => {
  await conApp(async ({ db, correr, llamadas, ctx, reloj }) => {
    // Primer paso: crea la propuesta; luego baja y abre la copia; luego llama a Claude.
    for (let i = 0; i < 4; i++) await mejorarApp(ctx(), { ahora: reloj(), cfg: leerConfigFabrica(db), puedeLlamar });
    assert.equal(llamadas().length, 1);
    const p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'probar');
    // «Se reinicia» y vuelve a pensar (como si el paso no hubiera terminado): usa lo guardado.
    enTransaccion(db, () => { db.prepare('SELECT 1').get(); });
    const { cambiarPropuesta } = await import('../src/academia/app-mejora.js');
    enTransaccion(db, () => cambiarPropuesta(db, p.id, { estado: 'pensando' }));
    await correr();
    assert.equal(llamadas().length, 1, 'ninguna llamada nueva');
    assert.equal(leerPropuestas(db)[0].estado, 'subido');
  });
});

test('si el servidor no lo instala (version.bad), se deshace solo con un commit NUEVO; «Deshacer el último cambio» igual', async () => {
  await conApp(async ({ db, gh, correr, malo, instalar }) => {
    const base = gh.main();
    await correr();
    const p = leerPropuestas(db)[0];
    assert.equal(p.estado, 'subido');
    malo(p.commit);
    await correr({ max: 3 });
    const q = leerPropuestas(db)[0];
    assert.equal(q.estado, 'deshecho');
    assert.deepEqual(gh.commit(gh.main()).padres, [p.commit], 'hacia adelante');
    assert.deepEqual(gh.archivosDe(gh.main()), gh.archivosDe(base), 'con el árbol de antes');
    instalar(gh.main());
  });
  await conApp(async ({ db, gh, correr, instalar }) => {
    await correr();
    const p = leerPropuestas(db)[0];
    instalar(p.commit);
    await correr({ max: 2 });
    assert.equal(leerPropuestas(db)[0].estado, 'instalado');
    guardarConfigApp(db, { pausada: true });
    assert.equal(enTransaccion(db, () => pedirDeshacer(db, {})).ok, true);
    await correr({ max: 3 });
    assert.equal(leerPropuestas(db).find(x => x.id === p.id).estado, 'deshecho');
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = ?").get(`app_deshecha:${p.id}`));
  });
});

test('el chat: un pedido de la app ya no se rechaza: va directo (con el tope del chat) y la burbuja dice cómo va', async () => {
  await conApp(async ({ db, config, correr, llamadas, reloj, instalar }) => {
    guardarConfigApp(db, { pausada: true }); // el modo solo en pausa: el pedido del dueño igual se hace
    const r = enTransaccion(db, () => escribirMensaje(db, { texto: 'Cambia el botón de la pantalla de inicio de la app para que sea más grande', ahora: reloj() }));
    assert.equal(r.rechazado, null);
    assert.ok(r.appMejora);
    const p0 = leerPropuestas(db).find(x => x.id === r.appMejora);
    assert.deepEqual([p0.origen, p0.estado], ['chat', 'en_fila']);
    await correr({ soloPedidos: true });
    assert.equal(llamadas().length, 2, 'dónde va + el cambio');
    const usos = db.prepare("SELECT proposito FROM ia_llamadas ORDER BY id").all().map(x => x.proposito);
    assert.deepEqual(usos, ['chat_app', 'chat_app'], 'cuenta en el tope del chat');
    const p = leerPropuestas(db).find(x => x.id === r.appMejora);
    assert.equal(p.estado, 'subido');
    const v = vistaChat(db, config, { ahora: reloj() });
    assert.equal(v.app[p.id].estado, 'subido');
    assert.equal(leerChat(db).mensajes.at(-1).appMejora, p.id);
    instalar(p.commit);
    await correr({ soloPedidos: true });
    assert.equal(vistaChat(db, config, { ahora: reloj() }).app[p.id].estado, 'instalado');
  });
});

test('«Terminé: todo revisado y mejorado»: con nada importante en cada pantalla, el modo solo termina y queda parado', async () => {
  await conApp(async ({ db, correr, llamadas, avanzar }) => {
    // Las llamadas de la hora tienen su cuota: el reloj de mentira avanza una hora entre vuelta y vuelta.
    for (let i = 0; i < 6 && !leerRecorrido(db).terminado; i++) { await correr({ max: 200 }); avanzar(3_700_000); }
    const r = leerRecorrido(db);
    assert.equal(r.terminado, true);
    assert.equal(leerEstadoApp(db).estado, 'hecha');
    assert.equal(leerEstadoApp(db).actual, 'Terminé: todo revisado y mejorado');
    assert.equal(leerEstadoApp(db).pct, 100);
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = 'app_termino:r1'").get());
    const n = llamadas().length;
    await correr({ max: 5 });
    assert.equal(llamadas().length, n, 'parado: ni una llamada más');
  }, { respuesta: () => ({ nada_importante: true, titulo: 'Bien', explicacion: '', cambios: [], textos: [], idea_para_desarrollador: null }) });
});

test('lo que necesita el servidor va a «Ideas para el programador»; con la IA en pausa no se hace nada', async () => {
  await conApp(async ({ db, correr, llamadas, opciones, reloj }) => {
    opciones.elegir = () => ({ pantalla: null, posible: false, idea: 'Una ruta nueva para filtrar los exámenes por fecha.' });
    enTransaccion(db, () => pedirMejora(db, { texto: 'filtra los exámenes por fecha en el servidor', ahora: reloj() }));
    guardarConfigApp(db, { pausada: true });
    await correr({ soloPedidos: true });
    assert.equal(leerPropuestas(db)[0].estado, 'idea');
    assert.equal(vistaApp(db).ideas[0].texto, 'Una ruta nueva para filtrar los exámenes por fecha.');
    const n = llamadas().length;
    const { guardarConfigFabrica } = await import('../src/academia/fabrica.js');
    guardarConfigFabrica(db, { pausada: true });
    enTransaccion(db, () => pedirMejora(db, { texto: 'otro', ahora: reloj() }));
    await correr();
    assert.equal(llamadas().length, n, 'IA en pausa: ninguna llamada');
    assert.equal(leerConfigApp(db).autoSubir, true, 'instalar solo: encendido por defecto');
  });
});
