// Academia 0.14.50: el «dictado» de la Práctica en vivo (src/academia/oral-dictado.js, src/api/oral-vivo.js, el uso
// 'oral_dictado' del trabajador y el adaptador de ChatGPT). Siempre contra el proveedor FALSO (127.0.0.1).
//  - Con ChatGPT: la grabación va en memoria al trabajador (la fila lleva solo su id), ChatGPT (gpt-4o-mini-transcribe) la
//    pasa a texto, el costo queda anotado y el texto vuelve UNA vez. El audio nunca queda en la base ni en el disco.
//  - Sin ChatGPT: { estado: 'no' } (la pantalla usa el dictado del navegador y el del teclado).
//  - Topes: 4 MB, una grabación de verdad (por sus primeros bytes), solo el dueño de la práctica.
//  - Si ChatGPT falla: un motivo claro; un 400 (la grabación) nunca pausa la clave.
//  - Lo de la pantalla que se prueba sin navegador (public/oral-vivo-vista.js).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { conInstructor, pedir } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { ponerChatGpt } from './fabrica-base.js';
import { buscarEnTodo } from './ia-base.js';
import { DICTADO, tipoDeAudio, recibirAudio, tomarAudio, grabacionesEnMemoria } from '../src/academia/oral-dictado.js';
import { openai, multipartDictado } from '../src/ia/proveedores/openai.js';
import { precioPara, costoMicro } from '../src/ia/precios.js';
import { PROPOSITOS } from '../src/ia/propositos.js';
import { elegirProveedor, modelosDe } from '../src/ia/presupuesto.js';
import { leerConfigIa } from '../src/ia/config.js';
import { tipoGrabacion, tipoParaEnviar, relojGrabacion, agregarTexto, nivelDe, crearGrabacion, errorMicrofono, esIosNavegador, modoDictado, hayTexto, ESPERA_TEXTO_MS } from '../public/oral-vivo-vista.js';

const ORAL = paqueteOralMuestra();
const MARCA = 'MARCA-DE-LA-GRABACION-0150';
// Una «grabación» WebM falsa: la cabecera EBML y relleno (con una marca para buscarla después en la base y el disco).
const webm = (bytes = 4000) => { const b = Buffer.alloc(bytes, 0x41); Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(b, 0); Buffer.from(MARCA).copy(b, 40); return b; };
async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(ORAL) });
  assert.ok(s.datos.paquete?.id, JSON.stringify(s.datos));
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
const dictar = (c, galleta, sesion, cuerpo, { tipo = 'audio/webm', i = 0, idioma = 'es' } = {}) => pedir(c.base, 'POST', `/api/academia/oral/vivo/${encodeURIComponent(sesion)}/dictar?i=${i}&idioma=${idioma}`, { galleta, cabeceras: { 'Content-Type': tipo }, cuerpo });
const tareaDictado = c => c.db.prepare(`SELECT id, datos FROM tareas WHERE datos LIKE '%"uso":"oral_dictado"%' ORDER BY id DESC`).get();
const conChatGpt = c => ponerChatGpt({ db: c.db, config: c.config, admin: c.adminId, secretoId: c.secretoId }, { claudeBloqueada: false });
function archivosCon(dir, marca) {
  const hallados = [];
  const ver = d => { for (const n of readdirSync(d)) { const r = join(d, n); const st = statSync(r); if (st.isDirectory()) ver(r); else if (st.size < 50_000_000 && readFileSync(r).includes(marca)) hallados.push(r); } };
  ver(dir);
  return hallados;
}

test('dictado con ChatGPT: la grabación va en memoria, ChatGPT la pasa a texto, se anota lo que costó y el audio no queda en ninguna parte', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    await conChatGpt(c);
    const portada = (await pedir(c.base, 'GET', '/api/academia/oral/vivo', { galleta: c.z })).datos;
    assert.equal(portada.ia.dictado, true, 'con ChatGPT hay dictado');
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    assert.equal(s0.ia.dictado, true);
    const r = await dictar(c, c.z, s0.sesion, webm());
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.estado, 'pendiente');
    assert.match(r.datos.id, /^[a-f0-9]{24}$/);
    assert.deepEqual(c.audiosEntregados, [r.datos.id], 'la grabación se entregó al trabajador por su canal');
    const t = tareaDictado(c);
    const d = JSON.parse(t.datos);
    assert.equal(d.audio, r.datos.id, 'en la fila va solo el id');
    assert.ok(!t.datos.includes(MARCA) && !t.datos.includes(webm().toString('base64').slice(0, 40)), 'nunca el audio en la fila');
    assert.equal(d.idioma, 'es');
    assert.equal(d.pista, s0.preguntas[0].pregunta_es || s0.preguntas[0].pregunta_en, 'la pista: solo el texto de la pregunta');
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r.datos.id}`, { galleta: c.z })).datos.estado, 'pendiente');
    const hecha = await c.hacer(t.id);
    assert.equal(hecha.resultado.usada, true, JSON.stringify(hecha.resultado));
    assert.equal(grabacionesEnMemoria(), 0, 'el trabajador la olvidó');
    const p = c.falso.peticiones.filter(x => x.ruta === '/v1/audio/transcriptions');
    assert.equal(p.length, 1);
    assert.match(p[0].cabeceras['content-type'], /^multipart\/form-data; boundary=oportia[a-f0-9]{24}$/);
    const cuerpo = String(p[0].cuerpo);
    assert.match(cuerpo, /name="model"\r\n\r\ngpt-4o-mini-transcribe\r\n/);
    assert.match(cuerpo, /name="language"\r\n\r\nes\r\n/);
    assert.match(cuerpo, /name="response_format"\r\n\r\njson\r\n/);
    assert.match(cuerpo, /name="file"; filename="dictado\.webm"\r\nContent-Type: audio\/webm\r\n/);
    assert.ok(cuerpo.includes(MARCA), 'el archivo, tal cual');
    assert.ok(cuerpo.includes(`name="prompt"\r\n\r\n${d.pista}`));
    assert.equal(p[0].cabeceras.authorization?.startsWith('Bearer sk-proj-'), true, 'con la clave de ChatGPT');
    const gasto = c.db.prepare("SELECT costo_micro, proveedor, modelo, estado, resultado, espacio_id FROM ia_llamadas WHERE proposito = 'oral_dictado'").get();
    assert.equal(gasto.proveedor, 'openai');
    assert.equal(gasto.modelo, 'gpt-4o-mini-transcribe');
    assert.equal(gasto.estado, 'hecha');
    assert.equal(gasto.resultado, 'ok');
    assert.equal(gasto.costo_micro, 180 * 3 + 14 * 5, 'US$3/M el audio y US$5/M el texto: cuenta en sus topes');
    assert.ok(gasto.espacio_id != null, 'en el tope de su cuenta');
    // El texto, una vez.
    const listo = await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r.datos.id}`, { galleta: c.z });
    assert.deepEqual(listo.datos, { estado: 'lista', texto: 'Un piloto privado puede llevar pasajeros pero no cobrar.' });
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r.datos.id}`, { galleta: c.z })).datos.estado, 'no', 'ya no está');
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM ajustes WHERE clave LIKE 'academia.dictado.%'").get().n, 0);
    // El audio no quedó en la base ni en el disco.
    assert.deepEqual(buscarEnTodo(c.db, c.config, MARCA), []);
    assert.deepEqual(archivosCon(c.config.raiz, Buffer.from(MARCA)), []);
    // Y no le cobra un uso: sigue respondiendo igual (el texto lo manda él con «Enviar»).
    const env = await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s0.sesion, i: 0, texto: listo.datos.texto } });
    assert.equal(env.codigo, 200, JSON.stringify(env.datos));
    // En inglés: language en.
    const r2 = await dictar(c, c.z, s0.sesion, webm(), { idioma: 'en', i: 1 });
    await c.hacer(tareaDictado(c).id);
    assert.match(String(c.falso.peticiones.filter(x => x.ruta === '/v1/audio/transcriptions').at(-1).cuerpo), /name="language"\r\n\r\nen\r\n/);
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r2.datos.id}`, { galleta: c.z })).datos.estado, 'lista');
    // El admin lo ve en el gasto de la IA con su nombre.
    for (const n of ['es', 'en']) assert.ok(JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'))['ia.proposito.oral_dictado'], n);
  });
});

test('sin ChatGPT (solo Claude), o con la IA en pausa para él: no hay dictado con grabación y nada se manda', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const portada = (await pedir(c.base, 'GET', '/api/academia/oral/vivo', { galleta: c.z })).datos;
    assert.equal(portada.ia.dictado, false);
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    const r = await dictar(c, c.z, s0.sesion, webm());
    assert.deepEqual(r.datos, { estado: 'no' });
    assert.equal(tareaDictado(c), undefined, 'nada en la fila');
    assert.deepEqual(c.audiosEntregados, [], 'nada al trabajador');
    assert.equal(c.falso.peticiones.filter(x => x.ruta === '/v1/audio/transcriptions').length, 0);
  });
  // Con ChatGPT pero con la IA apagada para la cuenta (sin permiso de IA): tampoco.
  await conInstructor(async c => {
    await subirOral(c);
    await conChatGpt(c);
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    assert.equal(s0.ia.dictado, false);
    assert.deepEqual((await dictar(c, c.z, s0.sesion, webm())).datos, { estado: 'no' });
  }, { permitir: false });
});

test('topes: 4 MB, una grabación de verdad, solo el dueño de la práctica y con la práctica abierta', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    await conChatGpt(c);
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    const grande = await dictar(c, c.z, s0.sesion, webm(DICTADO.bytesMax + 10));
    assert.equal(grande.codigo, 413);
    assert.equal(grande.datos.error, 'demasiado_grande');
    assert.equal((await dictar(c, c.z, s0.sesion, Buffer.alloc(5000, 7))).datos.error, 'grabacion_no_valida', 'no parece audio: no se gasta');
    assert.equal((await dictar(c, c.z, s0.sesion, webm(200))).datos.error, 'muy_corto');
    assert.equal((await dictar(c, c.z, s0.sesion, webm(), { tipo: 'text/plain' })).codigo, 415);
    // Otro alumno con la práctica de ella: no existe para él.
    await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 3 } });
    const ajena = await dictar(c, c.q, s0.sesion, webm());
    assert.equal(ajena.codigo, 404);
    const r = await dictar(c, c.z, s0.sesion, webm());
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r.datos.id}`, { galleta: c.q })).codigo, 404, 'ni su texto');
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/zzz`, { galleta: c.z })).codigo, 404);
    // Sin la cabecera X-Oportia: no (como toda acción).
    const sinCabecera = await fetch(`${c.base}/api/academia/oral/vivo/${s0.sesion}/dictar`, { method: 'POST', headers: { Cookie: c.z, 'Content-Type': 'audio/webm' }, body: webm() });
    assert.equal(sinCabecera.status, 403);
    assert.deepEqual(c.audiosEntregados, [r.datos.id], 'solo la buena llegó al trabajador');
    // Terminada la práctica: ya no.
    await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.z, datos: { sesion: s0.sesion } });
    assert.ok([404, 409].includes((await dictar(c, c.z, s0.sesion, webm())).codigo));
  });
});

test('si ChatGPT falla: un motivo claro para la pantalla; un 400 (la grabación) nunca pausa la clave; una que caducó no se paga', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    await conChatGpt(c);
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    c.falso.siguiente({ tipo: 'status', status: 500 });
    const r = await dictar(c, c.z, s0.sesion, webm());
    const hecha = await c.hacer(tareaDictado(c).id);
    assert.equal(hecha.resultado.usada, false);
    assert.deepEqual((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r.datos.id}`, { galleta: c.z })).datos, { estado: 'no', motivo: 'error_proveedor' });
    // Un error pasajero: una pausa corta (sola se quita), nunca la del dueño.
    assert.notEqual(c.db.prepare("SELECT pausa_hasta FROM secretos WHERE uso = 'ia_openai' AND estado = 'activa'").get().pausa_hasta, null);
  });
  await conInstructor(async c => {
    await subirOral(c);
    await conChatGpt(c);
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    for (let k = 0; k < 4; k++) {
      c.falso.siguiente({ tipo: 'status', status: 400 });
      const r = await dictar(c, c.z, s0.sesion, webm());
      assert.equal(r.datos.estado, 'pendiente', `vez ${k + 1}: sigue habiendo dictado (${JSON.stringify(r.datos)})`);
      await c.hacer(tareaDictado(c).id);
      assert.deepEqual((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s0.sesion}/dictar/${r.datos.id}`, { galleta: c.z })).datos, { estado: 'no', motivo: 'audio_no_valido' });
    }
    const cfg = leerConfigIa(c.db);
    assert.equal(elegirProveedor(c.db, c.config, cfg, Date.now(), modelosDe(PROPOSITOS.oral_voz, cfg), PROPOSITOS.oral_voz).ok, true, 'ChatGPT sigue para todos (también la voz natural)');
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM ia_llamadas WHERE proposito = 'oral_dictado' AND costo_micro > 0").get().n, 0, 'un error claro no se cobra');
    // Una grabación que el trabajador ya no tiene (se reinició): termina sin llamar.
    const r = await dictar(c, c.z, s0.sesion, webm());
    tomarAudio(r.datos.id);
    const antes = c.falso.peticiones.length;
    assert.equal((await c.hacer(tareaDictado(c).id)).resultado.motivo, 'sin_pendiente');
    assert.equal(c.falso.peticiones.length, antes);
  });
});

test('las piezas: el tipo por los primeros bytes, la memoria del trabajador, el multipart, lo que gastó y el precio', () => {
  assert.equal(tipoDeAudio(webm()), 'audio/webm');
  const mp4 = Buffer.alloc(2000); mp4.write('ftypM4A ', 4, 'latin1');
  assert.equal(tipoDeAudio(mp4), 'audio/mp4', 'el iPhone (Safari) graba MP4');
  assert.equal(tipoDeAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(100)])), 'audio/ogg');
  assert.equal(tipoDeAudio(Buffer.from('<html><body>hola</body></html>')), null);
  // La memoria: una vez, con su tiempo, con un máximo.
  const id = 'a'.repeat(24);
  assert.equal(recibirAudio({ id, base64: webm().toString('base64') }, 1000), true);
  assert.equal(recibirAudio({ id: '../x', base64: webm().toString('base64') }, 1000), false);
  assert.equal(recibirAudio({ id: 'b'.repeat(24), base64: Buffer.alloc(3000, 1).toString('base64') }, 1000), false, 'no es audio');
  assert.ok(tomarAudio(id, 2000)?.includes(MARCA));
  assert.equal(tomarAudio(id, 2000), null, 'una sola vez');
  recibirAudio({ id: 'c'.repeat(24), base64: webm().toString('base64') }, 1000);
  assert.equal(tomarAudio('c'.repeat(24), 1000 + DICTADO.memoriaMs + 1), null, 'pasado su tiempo, se olvida');
  for (let k = 0; k < DICTADO.enMemoriaMax + 3; k++) recibirAudio({ id: String(k).padStart(24, '0'), base64: webm().toString('base64') }, 5000);
  assert.equal(grabacionesEnMemoria(), DICTADO.enMemoriaMax);
  for (let k = 0; k < DICTADO.enMemoriaMax + 3; k++) tomarAudio(String(k).padStart(24, '0'), 5000);
  // El multipart (iPhone: .m4a).
  const m = multipartDictado({ modelo: 'gpt-4o-mini-transcribe', audio: mp4, tipo: 'audio/mp4;codecs=mp4a.40.2', idioma: 'en', pista: 'What is a\nVOR?', frontera: 'f1' }).toString('latin1');
  assert.ok(m.startsWith('--f1\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-4o-mini-transcribe\r\n'));
  assert.ok(m.includes('name="prompt"\r\n\r\nWhat is a VOR?\r\n'));
  assert.ok(m.includes('filename="dictado.m4a"\r\nContent-Type: audio/mp4\r\n\r\n'));
  assert.ok(m.endsWith('\r\n--f1--\r\n'));
  // Lo que gastó.
  const ok = openai.leerTranscripcion({ status: 200, json: { text: 'Hola', usage: { type: 'tokens', input_tokens: 100, input_token_details: { text_tokens: 10, audio_tokens: 90 }, output_tokens: 5, total_tokens: 105 } }, cabeceras: {} });
  assert.equal(ok.motivo, 'ok');
  assert.equal(ok.texto, 'Hola');
  assert.deepEqual(ok.json, { texto: 'Hola' });
  assert.equal(ok.uso.entrada, 100);
  assert.equal(ok.uso.raro, false);
  assert.equal(openai.leerTranscripcion({ status: 200, json: { text: 'x', usage: { type: 'duration', seconds: 9 } }, cabeceras: {} }).estado, 'desconocida', 'otro tipo de cobro: cuenta lo apartado');
  assert.equal(openai.leerTranscripcion({ status: 400, json: { error: { type: 'invalid_request_error', code: 'invalid_value' } }, cabeceras: {} }).motivo, 'audio_no_valido');
  assert.equal(openai.leerTranscripcion({ status: 429, json: { error: { type: 'insufficient_quota', code: 'insufficient_quota' } }, cabeceras: {} }).motivo, 'sin_credito');
  // El precio: ≈ US$0,003 el minuto (unos 1 000 tokens de audio y 150 de texto).
  const precio = precioPara(null, 'openai', 'gpt-4o-mini-transcribe');
  const minuto = costoMicro(precio, { entrada: 1000, salida: 150, cacheLectura: 0, cacheEscritura: 0 });
  assert.ok(minuto >= 3000 && minuto <= 4000, String(minuto));
  assert.equal(modelosDe(PROPOSITOS.oral_dictado, { proveedores: { openai: { modelo: 'gpt-6-mini' }, propia: { modelo: 'mi-modelo' } } }).openai, 'gpt-4o-mini-transcribe');
  assert.deepEqual(PROPOSITOS.oral_dictado.proveedores, ['openai'], 'solo ChatGPT');
});

test('la pantalla (sin navegador): el formato, el reloj, agregar el texto, las barritas y la grabación apaga el micrófono', async () => {
  assert.equal(tipoGrabacion(t => t === 'audio/mp4'), 'audio/mp4', 'iPhone');
  assert.equal(tipoGrabacion(t => t.startsWith('audio/webm')), 'audio/webm;codecs=opus', 'Chrome');
  assert.equal(tipoGrabacion(() => false), '');
  assert.equal(tipoParaEnviar('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(tipoParaEnviar(''), 'audio/webm');
  assert.equal(relojGrabacion(7_400), '0:07');
  assert.equal(relojGrabacion(90_000), '1:30');
  assert.equal(agregarTexto('  Lo escrito ', ' y lo dicho '), 'Lo escrito y lo dicho');
  assert.equal(agregarTexto('', 'hola'), 'hola');
  assert.equal(agregarTexto('x'.repeat(10), 'abc', 12), 'xxxxxxxxxx a');
  assert.equal(nivelDe(new Uint8Array(64).fill(128)), 0, 'silencio');
  assert.equal(nivelDe(Uint8Array.from({ length: 64 }, (_, k) => (k % 2 ? 255 : 0))), 4, 'fuerte');
  assert.equal(errorMicrofono({ name: 'NotAllowedError' }), 'sin_permiso');
  assert.equal(errorMicrofono({ name: 'NotFoundError' }), 'sin_micro');
  assert.equal(esIosNavegador({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(esIosNavegador({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 }), false);
  // Una grabación con un MediaRecorder falso: pide el micrófono, graba, para y apaga las pistas.
  let apagadas = 0;
  const pedidos = [];
  const medios = { getUserMedia: async c => { pedidos.push(c); return { getTracks: () => [{ stop: () => { apagadas += 1; } }] }; } };
  class Grabadora {
    static isTypeSupported(t) { return t === 'audio/mp4'; }
    constructor(flujo, op) { this.mimeType = op?.mimeType ?? ''; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/mp4' }) }); setTimeout(() => this.onstop?.(), 1); }
  }
  let ahora = 1000;
  let alTope = null;
  const g = crearGrabacion({ medios, Grabadora, reloj: () => ahora, temporizador: (f, ms) => { if (ms === 90_000) alTope = f; return setTimeout(() => {}, 0); }, quitarTemporizador: clearTimeout });
  await g.empezar();
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].audio.echoCancellation, true);
  assert.equal(typeof alTope, 'function', 'para sola a los 90 s');
  ahora += 4200;
  const x = await g.parar();
  assert.equal(x.tipo, 'audio/mp4');
  assert.equal(x.ms, 4200);
  assert.equal(x.blob.size, 3);
  assert.equal(apagadas, 1, 'el micrófono se apaga al parar');
  const g2 = crearGrabacion({ medios, Grabadora, reloj: () => ahora });
  await g2.empezar();
  g2.cancelar();
  assert.equal(apagadas, 2, 'y al cancelar');
  // Lo que no se toca: sin innerHTML ni estilos escritos.
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|style=|\.style\./.test(vista));
  for (const n of ['es', 'en']) {
    const i18n = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    for (const k of ['grabando', 'escribiendo', 'escrito', 'muy_corto', 'grabar_no', 'grabar_fallo', 'grabar_vacio', 'sin_red_grabar', 'preparando', 'dictado_no']) assert.ok(i18n[`vivo.estado.${k}`], `${n}: vivo.estado.${k}`);
    assert.match(i18n['vivo.estado.grabando'], /\{tiempo\}/);
    for (const k of ['vivo.privacidad_equipo', 'vivo.estado.habla', 'vivo.privacidad_grabar', 'vivo.dictar.nota_grabar', 'error.muy_corto', 'error.grabacion_no_valida']) assert.ok(i18n[k], `${n}: ${k}`);
  }
});

// 0.14.50 (lo normal: sin ChatGPT): nunca «Escuchando…» sin texto. 0.14.53: el micrófono de la app escribe con Whisper en
// el equipo; el dictado del navegador solo donde Whisper no puede (y nunca en el iPhone); ya no se manda a usar el teclado.
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 };
const IPHONE_CHROME = { ...IPHONE, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1' };
const IPAD = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 };
const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 };
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 };
test('sin ChatGPT: Whisper en el equipo; el dictado del navegador solo sin Whisper (nunca en el iPhone); si nada, «ninguno»', () => {
  for (const nav of [IPHONE, IPHONE_CHROME, IPAD]) {
    assert.equal(modoDictado({ whisper: true, hayReconocimiento: true, nav }), 'whisper', nav.userAgent);
    assert.equal(modoDictado({ hayReconocimiento: true, nav }), 'ninguno', `${nav.userAgent}: nunca el dictado del navegador`);
  }
  assert.equal(modoDictado({ hayReconocimiento: true, nav: ANDROID }), 'navegador');
  assert.equal(modoDictado({ whisper: true, hayReconocimiento: true, nav: MAC }), 'whisper', 'Whisper antes que el del navegador');
  assert.equal(modoDictado({ hayReconocimiento: true, nav: MAC }), 'navegador');
  assert.equal(modoDictado({ hayReconocimiento: false, nav: MAC }), 'ninguno', 'sin dictado en el navegador (Firefox viejo) ni Whisper');
  assert.equal(modoDictado({ grabar: true, whisper: true, hayReconocimiento: false, nav: IPHONE }), 'grabar', 'con ChatGPT: graba (también en el iPhone)');
  assert.equal(ESPERA_TEXTO_MS, 6000);
  const ev = lista => ({ results: lista.map(x => [{ transcript: x }]) });
  assert.equal(hayTexto(ev(['', '  '])), false);
  assert.equal(hayTexto(ev(['', 'hola'])), true);
  assert.equal(hayTexto({}), false);
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  // 0.14.53: nada de «presiona dos veces Fn», «Windows+H» ni «Ajustes → Teclado → Dictado» (lo pidió el dueño).
  for (const k of ['vivo.estado.no_llega_audio', 'vivo.estado.brave', 'vivo.pista.movil', 'vivo.pista.pc', 'vivo.estado.teclado', 'vivo.estado.teclado_movil', 'vivo.dictar.nota_teclado', 'vivo.placeholder.teclado']) assert.equal(es[k], undefined, `${k}: el mensaje ya no está`);
  for (const n of ['es', 'en']) {
    const i18n = JSON.parse(readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8'));
    for (const [k, v] of Object.entries(i18n)) if (k.startsWith('vivo.')) assert.doesNotMatch(v, /\bFn\b|Windows\+H|Ajustes|Settings/, `${n}: ${k}`);
    assert.match(i18n['vivo.estado.preparando'], /\{mb\}.*\{pct\}/);
  }
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  assert.ok(!/no_llega_audio|Ajustes del Sistema|vivo-pista-teclado|vivo\.pista\./.test(vista));
  // «Escuchando…» solo al llegar texto (antes, al empezar y al oír algo).
  assert.match(vista, /r\.onspeechstart = \(\) => \{ oyoAlgo = true; \};/);
  assert.match(vista, /if \(hayTexto\(ev\)\) \{ huboTexto = true; clearTimeout\(vigia\); if \(estado\.dataset\.estado !== 'escuchando'\) ponerEstado\('escuchando'\); \}/);
  assert.match(vista, /empezar\(\); ponerEstado\('habla'\);/);
});
