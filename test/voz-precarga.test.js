// 0.14.106: el dictado del oral listo al instante (lo pidió el dueño: «la transcripción dura un rato instalándose la primera
// vez… debe ya estar funcionando al instante cuando entra el usuario»). public/voz-dictado.js y public/oral-vivo-vista.js:
//  - Los archivos se bajan callados en segundo plano: al entrar (cuando el navegador está libre) y al abrir el oral (ya).
//  - «Ahorro de datos» se respeta; con un celular lento, se espera a que abra el oral.
//  - Se pide que el navegador no borre la caja (navigator.storage.persist()).
//  - El micrófono graba al instante aunque el modelo no esté listo; nunca «Preparando… MB… %»; el texto llega al estar.
//  - Donde hay dictado del navegador (Chrome), escribe en vivo mientras tanto; Whisper lo reemplaza si llega a tiempo.
//  - Si el servidor no pudo bajar los archivos, un aviso para el administrador (y se resuelve solo).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPrecarga, crearPrecarga, textoDelTurno, vivoEnParalelo, crearWhisper, ESPERA_WHISPER_MS } from '../public/voz-dictado.js';
import { dictadoEnVivo } from '../public/oral-vivo-vista.js';
import { crearVoz } from '../src/academia/voz.js';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { carpetaTemporal, configDePrueba, conServidor } from './ayuda.js';
import { createHash } from 'node:crypto';

const CHROME_MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 };
const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 };
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 };
const IPHONE_CHROME = { ...IPHONE, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1' };
const SAFARI_MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 };
const FIREFOX = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', platform: 'Win32' };

const ESTADO = {
  estado: 'lista', base: '/voz/v1/', modelo: 'X/base', modeloChico: 'X/tiny',
  archivosDe: {
    'X/base': ['lib/transformers.min.js', 'ort/ort.mjs', 'ort/ort.wasm', 'modelos/X/base/config.json', 'modelos/X/base/onnx/encoder.onnx'],
    'X/tiny': ['lib/transformers.min.js', 'ort/ort.mjs', 'ort/ort.wasm', 'modelos/X/tiny/config.json', 'modelos/X/tiny/onnx/encoder.onnx'],
  },
};

// Todo lo de afuera, falso y a mano: la red, la caja del Cache API, el «cuando esté libre», el pedido de guardar y Whisper.
function banco({ nav = CHROME_MAC, estados = [ESTADO], enCaja = [], calentarAlEntrar = false, falla = null, esperar = null } = {}) {
  const b = { pedidos: [], puestos: [], vaciados: 0, pendientes: [], persistio: [], estadosPedidos: 0, calentado: 0, dormidas: [] };
  const caja = new Map(enCaja.map(u => [u, true]));
  const respuesta = url => ({ ok: falla !== url, url, body: { getReader: () => { let una = true; return { read: async () => { if (una) { una = false; return { done: false, value: new Uint8Array(3) }; } b.vaciados++; return { done: true }; } }; } } });
  b.whisper = { listo: false, roto: null, preparar: async () => { b.calentado++; b.whisper.listo = true; } };
  b.precarga = crearPrecarga({
    pedirEstado: async () => estados[Math.min(b.estadosPedidos++, estados.length - 1)],
    abrirCaja: async () => ({ match: async u => caja.get(u), put: async (u, r) => { caja.set(u, r); b.puestos.push(u); } }),
    pedir: async (url, opciones) => { b.pedidos.push({ url, ...opciones }); return respuesta(url); },
    nav,
    programar: f => b.pendientes.push(f),
    esperar: ms => { b.dormidas.push(ms); return esperar ? esperar(ms) : new Promise(ok => setTimeout(ok, 0)); },
    persistir: async motivo => { b.persistio.push(motivo); return true; },
    whisper: () => b.whisper,
    resolver: r => `https://app.local${r}`,
    calentarAlEntrar: () => calentarAlEntrar,
  });
  b.caja = caja;
  b.libre = async () => { const fs = b.pendientes.splice(0); for (const f of fs) f(); await nada(); };
  return b;
}
const nada = async (veces = 30) => { for (let k = 0; k < veces; k++) await new Promise(ok => setImmediate(ok)); };

test('al entrar: nada hasta que el navegador está libre; después se baja todo callado, con prioridad baja y a la caja del trabajador', async () => {
  const b = banco();
  assert.equal(b.precarga.alEntrar(), 'tranquilo');
  assert.equal(b.precarga.alEntrar(), 'tranquilo', 'una sola vez');
  await nada();
  assert.equal(b.pedidos.length, 0, 'nada todavía: espera a que el navegador esté libre');
  assert.equal(b.pendientes.length, 1);
  await b.libre();
  assert.equal(b.precarga.info.estado, 'en_caja');
  assert.ok(b.precarga.enCaja);
  assert.deepEqual(b.pedidos.map(p => p.url), ESTADO.archivosDe['X/base'].map(r => `https://app.local/voz/v1/${r}`));
  assert.ok(b.pedidos.every(p => p.priority === 'low'), 'prioridad baja');
  // El modelo y el wasm van a la caja con la misma dirección que pide el trabajador; la librería, a la caché normal.
  assert.deepEqual(b.puestos, ['https://app.local/voz/v1/ort/ort.wasm', 'https://app.local/voz/v1/modelos/X/base/config.json', 'https://app.local/voz/v1/modelos/X/base/onnx/encoder.onnx']);
  assert.equal(b.vaciados, 2, 'la librería se lee por pedazos y se tira (queda en la caché del navegador)');
  assert.deepEqual(b.persistio, ['entrar'], 'pide que el navegador no borre la caja');
  assert.equal(b.calentado, 0, 'en un teléfono, el modelo no se carga en memoria hasta abrir el oral');
  // Abre el oral: ya está bajado; solo se calienta el modelo.
  assert.equal(b.precarga.alOral(), 'ya');
  await nada();
  assert.equal(b.pedidos.length, 5, 'no se baja otra vez');
  assert.equal(b.calentado, 1);
  assert.equal(b.precarga.info.estado, 'listo');
  assert.deepEqual(b.persistio, ['entrar'], 'se pide una sola vez');
});

test('en una computadora con memoria, al entrar también se calienta el modelo', async () => {
  const b = banco({ calentarAlEntrar: true });
  b.precarga.alEntrar();
  await b.libre();
  assert.equal(b.calentado, 1);
  assert.equal(b.precarga.info.estado, 'listo');
});

test('al abrir cualquier pantalla del oral: ya mismo (sin esperar a que esté libre) y con el modelo caliente', async () => {
  const b = banco({ nav: IPHONE });
  assert.equal(b.precarga.alOral(), 'ya');
  assert.equal(b.pendientes.length, 0);
  await nada();
  assert.equal(b.pedidos.length, 5);
  assert.equal(b.calentado, 1);
  assert.deepEqual(b.persistio, ['oral']);
  // Lo que ya estaba en la caja no se pide otra vez.
  const c = banco({ enCaja: ['https://app.local/voz/v1/modelos/X/base/onnx/encoder.onnx'] });
  c.precarga.alOral();
  await nada();
  assert.ok(!c.pedidos.some(p => p.url.endsWith('encoder.onnx')));
  assert.equal(c.pedidos.length, 4);
});

test('«Ahorro de datos»: nunca se baja solo (ni al entrar ni al abrir el oral); un celular lento espera a que abra el oral', async () => {
  const ahorro = { ...ANDROID, connection: { saveData: true, effectiveType: '4g', type: 'cellular' } };
  assert.equal(planPrecarga(ahorro, 'entrar'), 'no');
  assert.equal(planPrecarga(ahorro, 'oral'), 'no');
  const b = banco({ nav: ahorro });
  assert.equal(b.precarga.alEntrar(), 'no');
  assert.equal(b.precarga.alOral(), 'no');
  await b.libre();
  assert.equal(b.pedidos.length, 0);
  assert.equal(b.estadosPedidos, 0);
  assert.equal(b.persistio.length, 0);
  // Celular lento: al entrar no; al abrir el oral, sí.
  const lento = { ...ANDROID, connection: { saveData: false, effectiveType: '3g', type: 'cellular', downlink: 0.8 } };
  assert.equal(planPrecarga(lento, 'entrar'), 'esperar');
  const c = banco({ nav: lento });
  assert.equal(c.precarga.alEntrar(), 'esperar');
  await c.libre();
  assert.equal(c.pedidos.length, 0);
  assert.equal(c.precarga.alOral(), 'ya');
  await nada();
  assert.equal(c.pedidos.length, 5);
  // Celular rápido, wifi lento, o sin navigator.connection (el iPhone): al entrar.
  assert.equal(planPrecarga({ connection: { effectiveType: '4g', type: 'cellular', downlink: 12 } }), 'tranquilo');
  assert.equal(planPrecarga({ connection: { effectiveType: '3g', type: 'wifi' } }), 'tranquilo');
  assert.equal(planPrecarga(IPHONE), 'tranquilo');
  assert.equal(planPrecarga(null), 'tranquilo');
});

test('si el servidor todavía los baja, se pregunta otra vez; si el alumno toca el micrófono, se apura (prioridad alta)', async () => {
  // La espera larga (20 s) no termina sola: solo el toque del micrófono la corta.
  const b = banco({ estados: [{ ...ESTADO, estado: 'bajando', pct: 10 }, { ...ESTADO, estado: 'bajando', pct: 60 }, ESTADO], esperar: ms => (ms === 1000 ? Promise.resolve() : new Promise(() => {})) });
  b.precarga.alOral();
  await nada(4);
  const apurada = b.precarga.apurar();
  assert.ok(apurada, 'hay una bajada en curso');
  await apurada;
  assert.equal(b.estadosPedidos, 3);
  assert.equal(b.dormidas[0], 20_000);
  assert.ok(b.dormidas.slice(1).every(ms => ms === 1000), 'apurado: pregunta más seguido');
  assert.ok(b.pedidos.every(p => p.priority === 'high'), 'lo que falta, con prioridad');
  assert.equal(banco().precarga.apurar(), null, 'sin bajada en curso: nada que esperar');
});

test('una falla en segundo plano no apaga el dictado: se intenta otra vez al abrir el oral', async () => {
  const b = banco({ estados: [{ estado: 'no', motivo: 'no_se_pudo' }, ESTADO] });
  b.precarga.alEntrar();
  await b.libre();
  assert.equal(b.precarga.info.estado, 'fallo');
  assert.equal(b.precarga.info.fallo, 'no_disponible');
  assert.equal(b.whisper.roto, null, 'Whisper no se entera');
  b.precarga.alOral();
  await nada();
  assert.equal(b.precarga.info.estado, 'listo');
  // Un archivo que no llega: falla, y lo ya guardado queda.
  const c = banco({ falla: 'https://app.local/voz/v1/modelos/X/base/onnx/encoder.onnx' });
  c.precarga.alOral();
  await nada();
  assert.equal(c.precarga.info.estado, 'fallo');
  assert.equal(c.calentado, 0);
  assert.ok(c.caja.has('https://app.local/voz/v1/modelos/X/base/config.json'));
});

test('un teléfono que no aguanta el modelo grande baja el chico', async () => {
  const b = banco();
  const p = crearPrecarga({
    pedirEstado: async () => ESTADO, abrirCaja: async () => null, pedir: async url => { b.pedidos.push({ url }); return { ok: true }; },
    malos: () => new Set(['X/base']), programar: f => f(),
  });
  p.alOral();
  await nada();
  assert.ok(b.pedidos.some(x => x.url === '/voz/v1/lib/transformers.min.js'));
  assert.ok(!b.pedidos.some(x => x.url.includes('/modelos/')), 'sin caja (modo privado), el modelo lo baja el trabajador (no dos veces)');
  const c = banco();
  const p2 = crearPrecarga({ pedirEstado: async () => ESTADO, abrirCaja: async () => ({ match: async () => null, put: async u => c.puestos.push(u) }), pedir: async url => ({ ok: true, url }), malos: () => new Set(['X/base']) });
  p2.alOral();
  await nada();
  assert.ok(c.puestos.includes('/voz/v1/modelos/X/tiny/onnx/encoder.onnx'), 'baja el chico');
  assert.ok(!b.pedidos.some(x => x.url.includes('X/base')));
});

// Un Whisper falso que se pone listo cuando uno quiere.
function whisperFalso({ texto = 'Tres aterrizajes en 90 días.', falla = null } = {}) {
  let abrir;
  const listo = new Promise(ok => { abrir = ok; });
  const w = {
    listo: false, roto: null, transcritos: 0, eventos: [],
    preparar: () => (falla ? Promise.reject(new Error(falla)) : listo.then(() => { w.listo = true; w.eventos.push('listo'); })),
    transcribir: async () => { w.transcritos++; w.eventos.push('transcribir'); return { texto }; },
    abrir: () => abrir(),
  };
  return w;
}

test('tocar el micrófono antes de que esté listo: graba al instante, y el texto llega cuando el modelo termina de cargar', async () => {
  const w = whisperFalso();
  const relojes = [];
  let audioPedido = 0;
  let terminado = null;
  const turno = textoDelTurno({ whisper: w, audio: async () => { audioPedido++; return new Float32Array(16000); }, esperar: ms => { relojes.push(ms); return new Promise(() => {}); } })
    .then(r => { terminado = r; });
  await nada();
  assert.equal(terminado, null, 'espera al modelo (la grabación está en memoria)');
  assert.equal(audioPedido, 0);
  w.abrir();
  await turno;
  assert.deepEqual(terminado, { texto: 'Tres aterrizajes en 90 días.', fuente: 'whisper' });
  assert.deepEqual(w.eventos, ['listo', 'transcribir'], 'primero listo, después escribe');
  // Con tope: nunca «Escribiendo…» para siempre.
  const nunca = whisperFalso();
  assert.deepEqual(await textoDelTurno({ whisper: nunca, audio: async () => new Float32Array(1), esperar: async () => {} }), { fallo: 'tiempo' });
  // El modelo no carga en este equipo / sin red.
  assert.deepEqual(await textoDelTurno({ whisper: whisperFalso({ falla: 'memoria' }), audio: async () => new Float32Array(1) }), { fallo: 'equipo' });
  assert.deepEqual(await textoDelTurno({ whisper: whisperFalso({ falla: 'sin_red' }), audio: async () => new Float32Array(1) }), { fallo: 'sin_red' });
});

test('la pantalla: el micrófono empieza a grabar en el mismo toque, sin esperar al modelo, y nada de «Preparando / MB / %»', () => {
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  const toque = vista.slice(vista.indexOf("mic.addEventListener('click', () => {\n      if (enviando) return;"), vista.indexOf('return { ocupado:'));
  assert.ok(toque.length > 200);
  const empieza = toque.indexOf('const pedido = nueva.empezar();');
  assert.ok(empieza > 0 && empieza < toque.indexOf('w.preparar()') && empieza < toque.indexOf('precargaDeLaPagina().apurar()'), 'graba antes de tocar el modelo');
  assert.doesNotMatch(toque.slice(0, toque.indexOf('pedido.then(')), /await /, 'nada se espera antes de grabar');
  assert.doesNotMatch(vista, /vivo\.estado\.preparando|'preparando'|w\.megas|porcentajePreparando/);
  for (const n of ['es', 'en']) {
    const i18n = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    assert.equal(i18n['vivo.estado.preparando'], undefined);
    for (const [k, v] of Object.entries(i18n)) if (/^vivo\.(?:estado|dictar|privacidad|mic|placeholder)/.test(k)) assert.doesNotMatch(v, /Preparando el dictado|Getting dictation ready|\bMB\b|\d\s?%|\{pct\}|\{mb\}/, `${n}: ${k}`);
    assert.match(i18n['vivo.estado.grabando'], n === 'es' ? /^Escuchando… \{tiempo\} · toca para parar$/ : /^Listening… \{tiempo\} · tap to stop$/);
    assert.ok(i18n['vivo.estado.escribiendo']);
  }
  // El trabajador espera la bajada en curso en vez de bajar lo mismo otra vez.
  assert.match(readFileSync(new URL('../public/voz-dictado.js', import.meta.url), 'utf8'), /antesDeCargar: \(\) => precargaPagina\?\.apurar\(\)/);
  // Al entrar (con el oral) y al abrir el oral, desde public/app.js.
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(estado\.oral\.hay\) precargarDictado\('entrar'\);/);
  assert.match(app, /async function pantallaOralDe\(que, a, b\) \{\n  const vigente = nuevoTurno\(\);\n  precargarDictado\('oral'\);/);
  assert.match(readFileSync(new URL('../public/voz-dictado.js', import.meta.url), 'utf8'), /requestIdleCallback/);
});

test('Whisper espera la bajada en segundo plano antes de crear su trabajador (no baja lo mismo dos veces)', async () => {
  const orden = [];
  let soltar;
  const bajada = new Promise(ok => { soltar = ok; });
  const w = crearWhisper({
    pedirEstado: async () => ({ estado: 'lista', base: '/voz/v/', modelo: 'X/w', bytes: 1 }),
    antesDeCargar: () => { orden.push('espera la bajada'); return bajada; },
    crearTrabajador: () => {
      orden.push('trabajador');
      const t = { postMessage(m) { setTimeout(() => t.onmessage({ data: m.tipo === 'preparar' ? { tipo: 'listo' } : { tipo: 'texto', id: m.id, texto: 'hola', ms: 1 } }), 0); }, terminate() {} };
      return t;
    },
    esperar: async () => {},
  });
  const p = w.preparar();
  await nada();
  assert.deepEqual(orden, ['espera la bajada']);
  soltar();
  await p;
  assert.deepEqual(orden, ['espera la bajada', 'trabajador']);
  assert.equal(w.listo, true);
});

test('el dictado del navegador EN VIVO al mismo tiempo (Chrome): escribe al momento; Whisper lo reemplaza si llega a tiempo', async () => {
  assert.equal(vivoEnParalelo(CHROME_MAC, true), true);
  assert.equal(vivoEnParalelo(ANDROID, true), true);
  assert.equal(vivoEnParalelo(CHROME_MAC, false), false, 'sin dictado en el navegador');
  for (const nav of [IPHONE, IPHONE_CHROME, SAFARI_MAC, FIREFOX]) assert.equal(vivoEnParalelo(nav, true), false, nav.userAgent);
  // Un reconocimiento falso (como webkitSpeechRecognition).
  const creados = [];
  class R {
    constructor() { creados.push(this); }
    start() { this.empezo = true; }
    stop() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'en noventa días' }], { isFinal: true })] }); this.onend?.(); }, 0); }
    abort() { this.abortado = true; }
  }
  const vistos = [];
  const vivo = dictadoEnVivo(t => vistos.push(t), { R, lang: 'es-ES' });
  assert.equal(creados[0].lang, 'es-ES');
  assert.equal(creados[0].continuous, true);
  creados[0].onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'tres aterrizajes' }], { isFinal: false })] });
  assert.deepEqual(vistos, ['tres aterrizajes'], 'el texto aparece al momento');
  creados[0].onerror({ error: 'network' }); // se calla
  // Chrome corta tras un silencio: vuelve a empezar solo.
  creados[0].onend();
  assert.equal(creados.length, 2);
  const final = await vivo.parar();
  assert.equal(final, 'tres aterrizajes en noventa días');
  assert.equal(vistos.length, 1, 'después de parar ya no escribe en el cuadro');
  assert.equal(dictadoEnVivo(() => {}, { R: null }), null);
  class Rompe { start() { throw new Error('no'); } }
  assert.equal(dictadoEnVivo(() => {}, { R: Rompe }), null, 'si no arranca, no pasa nada (la grabación sigue)');

  // Whisper llega en unos segundos: se usa el suyo (escribe mejor).
  const rapido = whisperFalso({ texto: 'Tres aterrizajes en 90 días.' });
  rapido.abrir();
  let esperado = null;
  const r1 = await textoDelTurno({ whisper: rapido, audio: async () => new Float32Array(10), vivo: Promise.resolve('tres aterrizajes en noventa días'), esperar: ms => { esperado = ms; return new Promise(() => {}); } });
  assert.deepEqual(r1, { texto: 'Tres aterrizajes en 90 días.', fuente: 'whisper' });
  assert.equal(esperado, ESPERA_WHISPER_MS);
  // Whisper no llega a tiempo: se queda lo del navegador, y no se pasa a texto en vano.
  const lento = whisperFalso();
  const r2 = await textoDelTurno({ whisper: lento, audio: async () => new Float32Array(10), vivo: Promise.resolve('tres aterrizajes en noventa días'), esperar: async () => {} });
  assert.deepEqual(r2, { texto: 'tres aterrizajes en noventa días', fuente: 'navegador' });
  lento.abrir();
  await nada();
  assert.equal(lento.transcritos, 0);
  // El modelo no carga en este equipo: lo del navegador sirve igual.
  assert.deepEqual(await textoDelTurno({ whisper: whisperFalso({ falla: 'memoria' }), audio: async () => new Float32Array(1), vivo: Promise.resolve('hola') }), { texto: 'hola', fuente: 'navegador' });
  // El navegador no escribió nada (lo normal en el Mac del dueño): se espera a Whisper.
  const w = whisperFalso();
  const p = textoDelTurno({ whisper: w, audio: async () => new Float32Array(10), vivo: Promise.resolve(''), esperar: () => new Promise(() => {}) });
  setTimeout(() => w.abrir(), 5);
  assert.deepEqual(await p, { texto: 'Tres aterrizajes en 90 días.', fuente: 'whisper' });
  // La pantalla: con el dictado en vivo, su texto se reemplaza (no se repite).
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.match(vista, /caja\.value = agregarTexto\(g\.vivo \? g\.antes : caja\.value, r\.texto, 1200\);/);
  assert.match(vista, /nueva\.vivo = vivoEnParalelo\(navigator, puedeDictar\(\)\) \? dictadoEnVivo\(/);
});

test('se pide guardar la caja para siempre (navigator.storage.persist), salvo el cartel de Firefox al entrar', () => {
  const dictado = readFileSync(new URL('../public/voz-dictado.js', import.meta.url), 'utf8');
  assert.match(dictado, /return await s\.persist\(\);/);
  assert.match(dictado, /if \(motivo !== 'oral' && \/firefox\/i\.test/);
  assert.match(dictado, /caches\.open\('oportia-voz'\)/, 'la misma caja que el trabajador');
  assert.match(dictado, /fetch\(url, \{ credentials: 'same-origin', priority \}\)/);
  for (const n of ['es', 'en']) {
    const i18n = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    assert.ok(i18n['vivo.privacidad_equipo_vivo'], 'donde el navegador escribe en vivo, se dice que ese usa internet');
  }
});

// ---------- El servidor ----------
const sha256 = b => createHash('sha256').update(b).digest('hex');
function manifiestoChico() {
  const a = (ruta, cuerpo) => ({ ruta, bytes: cuerpo.length, sha256: sha256(cuerpo), fuentes: [{ url: `http://127.0.0.1:65000/${ruta}` }], cuerpo });
  const archivos = [a('lib/transformers.min.js', Buffer.from('export const x = 1;')), a('ort/o.wasm', Buffer.alloc(40, 1)), a('modelos/X/w/config.json', Buffer.from('{}')), a('modelos/X/t/config.json', Buffer.from('{"t":1}'))];
  return { id: 'prueba-2', modelo: 'X/w', modeloChico: 'X/t', bytes: archivos.reduce((s, x) => s + x.bytes, 0), paquetes: {}, archivos };
}

test('el estado dice qué archivos baja el navegador con cada modelo; si el servidor no pudo bajarlos, el administrador lo ve (y se resuelve solo)', async () => {
  const m = manifiestoChico();
  let red = false;
  const llamar = async ({ url, alTrozo, alEmpezar }) => {
    if (!red) return { status: 503 };
    const x = m.archivos.find(f => f.fuentes[0].url === url);
    if (!x) return { status: 404 };
    alEmpezar?.({ largo: x.cuerpo.length });
    await alTrozo(x.cuerpo);
    return { status: 200 };
  };
  const manifiesto = { ...m, archivos: m.archivos.map(({ cuerpo, ...resto }) => resto) };
  const voz = crearVoz({ config: { carpetaVoz: carpetaTemporal('voz-precarga') }, manifiesto, llamar });
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    await conServidor(crearServidor({ db, config, voz }), async () => {
      const abierto = () => db.prepare("SELECT nivel, veces, detalle FROM avisos WHERE clave = 'voz_archivos' AND resuelto_en IS NULL").get();
      assert.equal(await voz.preparar(), false);
      assert.equal(abierto()?.nivel, 'atencion');
      assert.equal(JSON.parse(abierto().detalle).motivo, 'no_se_pudo');
      // Cada alumno que entra pide el estado: no suma «veces».
      for (let k = 0; k < 3; k++) assert.equal((await voz.estado()).estado, 'no');
      assert.equal(abierto().veces, 1);
      red = true;
      assert.equal(await voz.preparar({ forzar: true }), true);
      assert.equal(abierto(), undefined, 'ya están: el aviso se resuelve solo');
      const e = await voz.estado();
      assert.equal(e.estado, 'lista');
      assert.deepEqual(e.archivosDe, {
        'X/w': ['lib/transformers.min.js', 'ort/o.wasm', 'modelos/X/w/config.json'],
        'X/t': ['lib/transformers.min.js', 'ort/o.wasm', 'modelos/X/t/config.json'],
      });
    });
  } finally { db.close(); }
  for (const n of ['es', 'en']) {
    const i18n = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    for (const k of ['aviso.voz_archivos', 'telegram.aviso.voz_archivos.titulo', 'telegram.aviso.voz_archivos.texto']) assert.ok(i18n[k], `${n}: ${k}`);
  }
});
