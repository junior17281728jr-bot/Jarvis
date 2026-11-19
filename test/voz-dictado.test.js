// 0.14.53: el dictado en el equipo del alumno (public/voz-dictado.js): qué motor usa el micrófono, el audio a 16 kHz,
// el texto en limpio, el avance de «Preparando el dictado…» y el trabajador (uno falso: sin navegador).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { elegirMotor, puedeWhisper, equipoCapaz, remuestrear, mezclarMono, limpiarTranscripcion, porcentajePreparando, megasDe, crearWhisper, crearGuardia, modeloPara } from '../public/voz-dictado.js';

test('el orden de los motores: ChatGPT en el servidor, Whisper en el equipo, el del navegador, y si no, ninguno', () => {
  assert.equal(elegirMotor({ servidor: true, whisper: true, navegador: true }), 'grabar');
  assert.equal(elegirMotor({ whisper: true, navegador: true }), 'whisper');
  assert.equal(elegirMotor({ navegador: true }), 'navegador');
  assert.equal(elegirMotor({}), 'ninguno');
});

test('¿puede con Whisper? trabajadores, WebAssembly con SIMD, audio y grabación', () => {
  const base = () => ({ Worker: function W() {}, WebAssembly: { validate: () => true }, AudioContext: function A() {}, MediaRecorder: function M() {}, navigator: { mediaDevices: { getUserMedia: () => {} } } });
  assert.equal(puedeWhisper(base()), true);
  assert.equal(puedeWhisper(null), false);
  for (const quitar of ['Worker', 'AudioContext', 'MediaRecorder']) { const w = base(); delete w[quitar]; assert.equal(puedeWhisper(w), false, quitar); }
  assert.equal(puedeWhisper({ ...base(), WebAssembly: { validate: () => false } }), false, 'sin SIMD (Safari viejo)');
  assert.equal(puedeWhisper({ ...base(), navigator: {} }), false);
  assert.equal(puedeWhisper({ ...base(), AudioContext: undefined, webkitAudioContext: function A() {} }), true);
  // El SIMD de verdad: Node lo tiene, así que el detector real dice que sí.
  assert.equal(WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])), true);
});

test('se adelanta la carga solo en una computadora con memoria (en el teléfono, al tocar el micrófono)', () => {
  assert.equal(equipoCapaz({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130', platform: 'MacIntel', maxTouchPoints: 0 }), true);
  assert.equal(equipoCapaz({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', deviceMemory: 8 }), true);
  assert.equal(equipoCapaz({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', deviceMemory: 2 }), false);
  assert.equal(equipoCapaz({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), false);
  assert.equal(equipoCapaz({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), false, 'iPad');
  assert.equal(equipoCapaz({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' }), false);
  assert.equal(equipoCapaz(null), false);
});

test('el audio para Whisper: mono y a 16 kHz (promediando al bajar, en línea recta al subir)', () => {
  assert.deepEqual(Array.from(mezclarMono([new Float32Array([1, 0, 1]), new Float32Array([0, 0, 1])])), [0.5, 0, 1]);
  assert.deepEqual(Array.from(mezclarMono([new Float32Array([0.25])])), [0.25]);
  assert.equal(mezclarMono([]).length, 0);
  assert.deepEqual(Array.from(remuestrear(new Float32Array([1, 1, 1, 0, 0, 0]), 48000, 16000)), [1, 0]);
  assert.equal(remuestrear(new Float32Array(48000), 48000).length, 16000, 'un segundo de 48 kHz → 16 000 muestras');
  assert.equal(remuestrear(new Float32Array(44100), 44100).length, 16000);
  assert.deepEqual(Array.from(remuestrear(new Float32Array([0, 1]), 8000, 16000)), [0, 0.5, 1, 1]);
  assert.deepEqual(Array.from(remuestrear(new Float32Array([0.5, 0.25]), 16000, 16000)), [0.5, 0.25]);
  assert.equal(remuestrear(new Float32Array(0), 48000).length, 0);
  assert.equal(remuestrear(new Float32Array(10), 0).length, 0);
  // Un tono de 440 Hz a 48 kHz sigue siendo de 440 Hz a 16 kHz (cruces por cero parecidos) y sin pasarse de 1.
  const tono = new Float32Array(48000).map((_, k) => Math.sin((2 * Math.PI * 440 * k) / 48000));
  const bajo = remuestrear(tono, 48000);
  let cruces = 0;
  for (let k = 1; k < bajo.length; k++) if ((bajo[k - 1] < 0) !== (bajo[k] < 0)) cruces++;
  assert.ok(Math.abs(cruces - 880) <= 4, `cruces ${cruces}`);
  assert.ok(bajo.every(x => Math.abs(x) <= 1));
});

test('lo que escribe Whisper, en limpio: sin marcas de silencio, sin su «bucle» y sin sus frases de relleno', () => {
  assert.equal(limpiarTranscripcion(' Tres despegues y aterrizajes en los últimos 90 días. '), 'Tres despegues y aterrizajes en los últimos 90 días.');
  assert.equal(limpiarTranscripcion(' 3-4-4-4-4-4-4-4-4-4-4-4-4-4-'), '3-4');
  assert.equal(limpiarTranscripcion('no sé no sé no sé no sé'), 'no sé');
  assert.equal(limpiarTranscripcion('[Música] Hola (risas) mundo'), 'Hola mundo');
  assert.equal(limpiarTranscripcion(' Gracias por ver el video.'), '');
  assert.equal(limpiarTranscripcion('Subtítulos realizados por la comunidad de Amara.org'), '');
  assert.equal(limpiarTranscripcion(' Thank you for watching!'), '');
  assert.equal(limpiarTranscripcion('90 días y 90 días'), '90 días y 90 días', 'lo repetido dos veces es de verdad');
  assert.equal(limpiarTranscripcion('Gracias, el piloto debe tener tres aterrizajes.'), 'Gracias, el piloto debe tener tres aterrizajes.');
  assert.equal(limpiarTranscripcion(null), '');
});

test('«Preparando el dictado… N %»: primero el servidor (si baja), después el navegador; nunca 100 antes de terminar', () => {
  assert.equal(porcentajePreparando({ servidorPct: 40 }), 20);
  assert.equal(porcentajePreparando({ servidorPct: 100, cargado: 5, total: 10 }), 75);
  assert.equal(porcentajePreparando({ cargado: 5, total: 10 }), 50);
  assert.equal(porcentajePreparando({ cargado: 10, total: 10 }), 99);
  assert.equal(porcentajePreparando({}), 0);
  assert.equal(megasDe(102_206_577), 102);
  assert.equal(megasDe(0), 1);
});

// Un trabajador falso: contesta como public/voz-trabajador.js.
function trabajadorFalso({ fallaCarga = false, texto = ' Tres aterrizajes en 90 días.', fallaCon = null } = {}) {
  const t = {
    mensajes: [], terminado: false,
    postMessage(m, transferir) {
      t.mensajes.push({ m, transferir });
      setTimeout(() => {
        if (m.tipo === 'preparar') {
          if (fallaCarga || m.modelo === fallaCon) return t.onmessage({ data: { tipo: 'fallo', motivo: 'out of memory' } });
          t.onmessage({ data: { tipo: 'progreso', archivo: 'a.onnx', cargado: 50, total: 100 } });
          t.onmessage({ data: { tipo: 'progreso', archivo: 'a.onnx', cargado: 100, total: 100 } });
          t.onmessage({ data: { tipo: 'listo' } });
        } else if (m.tipo === 'transcribir') t.onmessage({ data: { tipo: 'texto', id: m.id, texto, ms: 1234 } });
      }, 1);
    },
    terminate() { t.terminado = true; },
  };
  return t;
}

test('Whisper: espera al servidor, carga el modelo (con su avance) una sola vez y escribe lo que dijo', async () => {
  const estados = [{ estado: 'bajando', pct: 40, bytes: 200, base: '/voz/v/', modelo: 'X/w' }, { estado: 'lista', pct: 100, bytes: 200, base: '/voz/v/', modelo: 'X/w' }];
  let pedidos = 0;
  const trabajadores = [];
  const w = crearWhisper({
    pedirEstado: async () => estados[Math.min(pedidos++, estados.length - 1)],
    crearTrabajador: () => { const t = trabajadorFalso(); trabajadores.push(t); return t; },
    esperar: async () => {},
  });
  const avance = [];
  await Promise.all([w.preparar(x => avance.push(x)), w.preparar()]);
  assert.equal(trabajadores.length, 1, 'un solo trabajador');
  assert.deepEqual(trabajadores[0].mensajes[0].m, { tipo: 'preparar', base: '/voz/v/', modelo: 'X/w' });
  assert.equal(avance[0].pct, 20, 'el servidor iba en 40 %: la mitad del camino');
  assert.ok(avance.every((x, k) => k === 0 || x.pct >= avance[k - 1].pct), 'nunca va para atrás');
  assert.ok(avance.at(-1).pct < 100);
  assert.equal(w.listo, true);
  const audio = new Float32Array(16000);
  const r = await w.transcribir(audio, 'es');
  assert.equal(r.texto, 'Tres aterrizajes en 90 días.');
  const m = trabajadores[0].mensajes.at(-1);
  assert.equal(m.m.tipo, 'transcribir');
  assert.equal(m.m.idioma, 'es');
  assert.equal(m.transferir[0], audio.buffer, 'el audio se pasa sin copiarlo');
  assert.equal((await w.transcribir(new Float32Array(10), 'en')).texto, 'Tres aterrizajes en 90 días.');
  assert.equal(trabajadores[0].mensajes.at(-1).m.idioma, 'en');
});

test('Whisper: si el servidor no tiene los archivos o el modelo no carga en este equipo, falla claro (y no vuelve a intentar)', async () => {
  const sinArchivos = crearWhisper({ pedirEstado: async () => ({ estado: 'no', motivo: 'no_se_pudo' }), crearTrabajador: () => assert.fail('no se crea'), esperar: async () => {} });
  await assert.rejects(sinArchivos.preparar(), /no_disponible/);
  await assert.rejects(sinArchivos.transcribir(new Float32Array(1)), /no_disponible/);
  assert.equal(sinArchivos.roto, 'no_disponible');
  const t = trabajadorFalso({ fallaCarga: true });
  const noCarga = crearWhisper({ pedirEstado: async () => ({ estado: 'lista', base: '/voz/v/', modelo: 'X/w', bytes: 1 }), crearTrabajador: () => t, esperar: async () => {} });
  await assert.rejects(noCarga.preparar(), /memoria/, 'sin modelo chico: se rinde');
  assert.equal(t.terminado, true, 'el trabajador se apaga (libera la memoria)');
  // Sin red: se puede probar otra vez.
  let veces = 0;
  const sinRed = crearWhisper({ pedirEstado: async () => (veces++ ? { estado: 'lista', base: '/voz/v/', modelo: 'X/w', bytes: 1 } : null), crearTrabajador: () => trabajadorFalso(), esperar: async () => {} });
  await assert.rejects(sinRed.preparar(), /sin_red/);
  await sinRed.preparar();
  assert.equal(sinRed.listo, true);
  // El servidor tarda demasiado: se rinde (no se queda «Preparando…» para siempre).
  let ahora = 0;
  const lento = crearWhisper({ pedirEstado: async () => ({ estado: 'bajando', pct: 1 }), crearTrabajador: () => trabajadorFalso(), esperar: async () => { ahora += 60_000; }, reloj: () => ahora, maxEsperaServidorMs: 120_000 });
  await assert.rejects(lento.preparar(), /tiempo/);
});

test('las pantallas: nada de pistas del teclado; el trabajador solo usa archivos de aquí, en un hilo', () => {
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.match(vista, /from '\.\/voz-dictado\.js'/);
  assert.doesNotMatch(vista, /pistaTeclado|usarTeclado|innerHTML|style=/);
  const dictado = readFileSync(new URL('../public/voz-dictado.js', import.meta.url), 'utf8');
  assert.doesNotMatch(dictado, /innerHTML|style=|https?:\/\//);
  const trabajador = readFileSync(new URL('../public/voz-trabajador.js', import.meta.url), 'utf8');
  assert.match(trabajador, /env\.allowRemoteModels = false;/);
  assert.match(trabajador, /env\.localModelPath = `\$\{base\}modelos\/`;/);
  assert.match(trabajador, /env\.backends\.onnx\.wasm\.wasmPaths = `\$\{base\}ort\/`;/);
  assert.match(trabajador, /env\.backends\.onnx\.wasm\.numThreads = 1;/);
  assert.match(trabajador, /task: 'transcribe'/);
  assert.doesNotMatch(trabajador, /https?:\/\//, 'nunca otro sitio');
  assert.deepEqual([...trabajador.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]), ['url'], 'solo pide su wasm (de /voz/)');
  // La caja del Cache API donde queda el modelo: la limpieza de la app vieja (public/app.js) no la borra.
  assert.match(trabajador, /caches\.open\('oportia-voz'\)/);
  assert.match(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), /caches\.keys\(\)\.then\(ks => ks\.filter\(k => k !== 'oportia-voz'\)\.forEach\(k => caches\.delete\(k\)\)\)/);
  // Lo que ve el alumno: en simple, en los dos idiomas.
  for (const n of ['es', 'en']) {
    const i18n = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    assert.match(i18n['vivo.privacidad_equipo'], n === 'es' ? /no sale de tu equipo/ : /never leaves your device/);
    assert.ok(i18n['vivo.estado.dictado_no'].length < 120, 'una línea corta');
  }
});

// Un localStorage falso.
const almacenFalso = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

test('si el teléfono no aguanta el modelo grande (la página se cae o no carga), la próxima vez usa el chico', async () => {
  assert.equal(modeloPara({ modelo: 'X/base', modeloChico: 'X/tiny' }), 'X/base');
  assert.equal(modeloPara({ modelo: 'X/base', modeloChico: 'X/tiny' }, new Set(['X/base'])), 'X/tiny');
  assert.equal(modeloPara({ modelo: 'X/base', modeloChico: 'X/tiny' }, new Set(['X/base', 'X/tiny'])), null);
  // La página se cayó cargando el grande: queda anotado y al abrir otra vez se sabe.
  const almacen = almacenFalso();
  let alCerrar = null;
  const g1 = crearGuardia(almacen, f => { alCerrar = f; });
  g1.marcar('X/base');
  const g2 = crearGuardia(almacen);
  assert.deepEqual([...g2.malos()], ['X/base']);
  assert.equal(almacen.getItem('op_voz_en_uso'), null);
  // Cerrar la página normalmente (pagehide) no cuenta como caída.
  g2.marcar('X/tiny');
  alCerrar();
  assert.deepEqual([...crearGuardia(almacen).malos()], ['X/base']);
  // Sin localStorage (navegación privada): nunca falla.
  const rota = crearGuardia({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
  rota.marcar('X/base');
  assert.equal(rota.malos().size, 0);
  rota.agregarMalo('X/base');
  assert.deepEqual([...rota.malos()], ['X/base'], 'en esta visita sí se acuerda');
  // El trabajador no puede con el grande: carga el chico, y se anota para la próxima.
  const estado = { estado: 'lista', base: '/voz/v/', modelo: 'X/base', modeloChico: 'X/tiny', bytes: 300, bytesDe: { 'X/base': 102_000_000, 'X/tiny': 66_000_000 } };
  const almacen2 = almacenFalso();
  const trabajadores = [];
  const w = crearWhisper({ pedirEstado: async () => estado, crearTrabajador: () => { const t = trabajadorFalso({ fallaCon: 'X/base' }); trabajadores.push(t); return t; }, esperar: async () => {}, guardia: crearGuardia(almacen2) });
  await w.preparar();
  assert.equal(w.modelo, 'X/tiny');
  assert.equal(w.megas, 66, 'el aviso dice lo que baja con el chico');
  assert.equal(trabajadores.length, 2);
  assert.equal(trabajadores[0].terminado, true, 'el que no pudo se apaga');
  assert.deepEqual([...crearGuardia(almacen2).malos()], ['X/base']);
  assert.equal((await w.transcribir(new Float32Array(5))).texto, 'Tres aterrizajes en 90 días.');
  assert.equal(almacen2.getItem('op_voz_en_uso'), null, 'al terminar, nada anotado');
  // Con el grande que sí carga: el aviso dice los MB del grande.
  const w2 = crearWhisper({ pedirEstado: async () => estado, crearTrabajador: () => trabajadorFalso(), esperar: async () => {}, guardia: crearGuardia(almacenFalso()) });
  const avisos = [];
  await w2.preparar(x => avisos.push(x));
  assert.equal(w2.modelo, 'X/base');
  assert.equal(avisos.at(-1).mb, 102);
});
