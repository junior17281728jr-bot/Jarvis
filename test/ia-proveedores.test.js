// Fase 1, parte d: los adaptadores de los proveedores (Claude y ChatGPT), la única llamada a la red (src/ia/llamar.js)
// y lo que pasa con cada respuesta: sin saldo, clave no válida, «espera», sobrecargado, tiempo agotado, respuesta rota…
// Todo contra el proveedor FALSO (test/proveedor-falso.js) en 127.0.0.1: nunca una API de verdad ni una clave de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { carpetaTemporal } from './ayuda.js';
import { T0, claveAnthropic, claveOpenai, preparar, ponerConfig, buscarEnTodo, capturarConsola } from './ia-base.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { lanzarTrabajador } from '../src/tareas/supervisor.js';
import { leerSecreto, guardarSecreto } from '../src/claves/almacen.js';
import { MOTIVOS } from '../src/ia/propositos.js';
import { precioDe, costoMicro } from '../src/ia/precios.js';
import { llamarProveedor, destinoPermitido } from '../src/ia/llamar.js';
import { PROVEEDORES, urlDe } from '../src/ia/proveedores/index.js';
import { anthropic } from '../src/ia/proveedores/anthropic.js';
import { openai } from '../src/ia/proveedores/openai.js';
import { reservar, liquidar } from '../src/ia/presupuesto.js';

const MIN = 60_000;
const ESQUEMA = { type: 'object', additionalProperties: false, properties: { listo: { type: 'boolean' } }, required: ['listo'] };
const HAIKU = precioDe('anthropic', 'claude-haiku-5-5');
const resp = (status, json = null, extra = {}) => ({ status, json, textoCorto: null, cabeceras: {}, red: null, tiempoAgotado: false, abortado: false, demasiado: false, error: null, ...extra });
const errorA = (status, message, extra = {}) => resp(status, { type: 'error', error: { type: 'x', message, ...extra }, request_id: 'req_1' });

// ---------- 12. Adaptadores (puros) ----------

test('Claude: el pedido lleva solo lo permitido (versión 2026-10-21, effort low, formato JSON) y nunca muestreo ni «pensar» a mano', () => {
  const p = anthropic.pedido({ modelo: 'claude-haiku-5-5', sistema: 'S', texto: 'T', esquema: ESQUEMA, salidaMax: 2048, esfuerzo: 'low' });
  assert.deepEqual(p, {
    ruta: '/v1/messages', metodo: 'POST',
    cuerpo: { model: 'claude-haiku-5-5', max_tokens: 2048, system: 'S', messages: [{ role: 'user', content: 'T' }], output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } } },
  });
  const texto = JSON.stringify(p);
  for (const prohibido of ['temperature', 'top_p', 'top_k', 'thinking', 'fallbacks', 'budget_tokens', 'inference_geo', 'stop_sequences']) assert.ok(!texto.includes(prohibido), prohibido);
  const k = claveAnthropic();
  assert.deepEqual(anthropic.cabeceras(k), { 'x-api-key': k, 'anthropic-version': '2026-10-21', 'content-type': 'application/json' });
  assert.deepEqual(anthropic.prueba({ modelo: 'claude-haiku-5-5' }), { ruta: '/v1/messages/count_tokens', metodo: 'POST', cuerpo: { model: 'claude-haiku-5-5', messages: [{ role: 'user', content: 'Hola' }] } });
  assert.equal(anthropic.host, 'api.anthropic.com');
});

test('Claude: lee el texto por tipo de bloque (aunque venga «pensar» primero) y lo que gastó, con el lugar', () => {
  const cuerpo = {
    content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: '{"listo":' }, { type: 'text', text: 'true}' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, service_tier: 'standard', inference_geo: 'us' },
  };
  const r = anthropic.leer(resp(200, cuerpo, { cabeceras: { 'request-id': 'req_abc' } }));
  assert.equal(r.motivo, 'ok');
  assert.equal(r.estado, 'hecha');
  assert.deepEqual(r.json, { listo: true });
  assert.equal(r.idPeticion, 'req_abc');
  assert.deepEqual(r.uso, { entrada: 2000, salida: 500, cacheLectura: 0, cacheEscritura: 0, geo: 'us', raro: false, desconocidos: 0 });
  assert.equal(costoMicro(HAIKU, r.uso), 495);
  // Paradas y respuestas que no sirven (se cobra lo real).
  const con = (cambios) => anthropic.leer(resp(200, { ...cuerpo, ...cambios }));
  assert.equal(con({ stop_reason: 'max_tokens' }).motivo, 'respuesta_incompleta');
  assert.equal(con({ stop_reason: 'refusal' }).motivo, 'rechazada');
  assert.equal(con({ stop_reason: 'pause_turn' }).motivo, 'respuesta_no_valida');
  assert.equal(con({ content: [{ type: 'text', text: 'no es json' }] }).motivo, 'respuesta_no_valida');
  assert.equal(con({ content: [{ type: 'text', text: 'no es json' }] }).estado, 'hecha');
  // Sin lo que gastó: no se usa y cuenta lo máximo.
  const sinUso = con({ usage: undefined });
  assert.equal(sinUso.motivo, 'respuesta_no_valida');
  assert.equal(sinUso.estado, 'desconocida');
  assert.equal(sinUso.json, null);
  assert.equal(anthropic.leer(resp(200, null, { demasiado: true })).estado, 'desconocida');
  // Lo que OPORTIA nunca pide, si aparece, es un gasto desconocido.
  const raro = u => con({ usage: { ...cuerpo.usage, ...u } }).uso;
  assert.deepEqual([raro({ cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 0 } }).raro, raro({}).raro], [false, false]);
  assert.equal(raro({ cache_creation: { ephemeral_1h_input_tokens: 50 } }).desconocidos, 50);
  assert.equal(raro({ server_tool_use: { web_search_requests: 2 } }).raro, true);
  assert.equal(raro({ service_tier: 'priority' }).raro, true);
  assert.equal(raro({ speed: 'fast' }).raro, true);
  assert.equal(raro({ algo_nuevo_tokens: 7 }).desconocidos, 7);
  assert.equal(raro({ inference_geo: undefined }).geo, null, 'sin lugar: se cobra el más caro');
});

test('Claude: cada error del proveedor tiene su motivo (sin saldo en 402 o en 400, límite de gasto, 429, 529, 5xx, redirección…)', () => {
  const casos = [
    [errorA(400, 'Your credit balance is too low to access the Anthropic API.'), 'sin_credito'],
    [resp(400, null, { textoCorto: 'Credit balance is too low to access the Anthropic API.' }), 'sin_credito'],
    [errorA(400, 'You have reached your specified API usage limits. You will regain access on 2026-12-01.'), 'limite_gasto_proveedor'],
    [errorA(400, 'You have reached your specified workspace API usage limits.'), 'limite_gasto_proveedor'],
    [errorA(400, 'This organization has been disabled.'), 'pedido_no_valido'],
    [errorA(401, 'invalid x-api-key'), 'clave_no_valida'],
    [errorA(402, 'billing'), 'sin_credito'],
    [errorA(403, 'no'), 'sin_permiso'],
    [errorA(404, 'model'), 'modelo_no_disponible'],
    [errorA(413, 'big'), 'demasiado_largo'],
    [errorA(429, 'Spend limit', { details: { error_code: 'enforced_spend_limit_reached' } }), 'limite_gasto_proveedor'],
    [errorA(429, 'rate'), 'limite_proveedor'],
    [errorA(529, 'overloaded'), 'sobrecargado'],
    [errorA(500, 'x'), 'error_proveedor'],
    [errorA(503, 'x'), 'error_proveedor'],
    [errorA(422, 'x'), 'pedido_no_valido'],
    [resp(307, null, { red: 'redireccion' }), 'redireccion'],
    [resp(null, null, { red: 'antes', error: { nombre: 'TypeError', codigo: 'ECONNREFUSED' } }), 'sin_red'],
    [resp(null, null, { red: 'local', error: { nombre: 'TypeError', codigo: null } }), 'pedido_no_valido'],
  ];
  for (const [r, motivo] of casos) {
    const leido = anthropic.leer(r);
    assert.equal(leido.motivo, motivo, JSON.stringify(r).slice(0, 120));
    assert.equal(leido.estado, 'fallida', `${motivo}: un error claro no se cobra`);
    assert.ok(MOTIVOS.includes(leido.motivo));
    // Lo que se guardaría nunca lleva el mensaje del proveedor.
    assert.ok(!JSON.stringify(leido.detalle).includes(' '), 'detalle: solo códigos cortos');
  }
  assert.equal(anthropic.leer(errorA(429, 'rate')).reintentarMs, null);
  assert.equal(anthropic.leer({ ...errorA(429, 'rate'), cabeceras: { 'retry-after': '30' } }).reintentarMs, 30_000);
  assert.deepEqual(anthropic.leer(errorA(429, 'Spend', { details: { error_code: 'enforced_spend_limit_reached' } })).detalle, { tipo: 'x', codigo: 'enforced_spend_limit_reached' });
  // Lo que no se sabe si se cobró.
  assert.deepEqual([anthropic.leer(resp(null, null, { tiempoAgotado: true })).motivo, anthropic.leer(resp(null, null, { tiempoAgotado: true })).estado], ['tiempo_agotado', 'desconocida']);
  assert.deepEqual([anthropic.leer(resp(200, null, { red: 'durante' })).motivo, anthropic.leer(resp(200, null, { red: 'durante' })).estado], ['sin_red', 'desconocida']);
  assert.equal(anthropic.leer(resp(null, null, { abortado: true })).motivo, 'interrumpida');
  // La prueba gratis.
  const prueba = [
    [resp(200, { input_tokens: 9 }), 'ok'], [errorA(401, 'x'), 'clave_no_valida'], [errorA(403, 'x'), 'sin_permiso'],
    [errorA(404, 'x'), 'modelo_no_disponible'], [errorA(402, 'x'), 'sin_credito'], [errorA(400, 'Your credit balance is too low'), 'sin_credito'],
    [errorA(400, 'You have reached your specified API usage limits'), 'limite_gasto_proveedor'], [errorA(400, 'otro'), 'pedido_no_valido'],
    [errorA(429, 'x', { details: { error_code: 'enforced_spend_limit_reached' } }), 'limite_gasto_proveedor'], [errorA(429, 'x'), 'limite_proveedor'],
    [errorA(529, 'x'), 'error_proveedor'], [errorA(500, 'x'), 'error_proveedor'], [resp(307, null, { red: 'redireccion' }), 'redireccion'],
    [resp(null, null, { red: 'antes' }), 'sin_red'], [resp(null, null, { tiempoAgotado: true }), 'tiempo_agotado'],
  ];
  for (const [r, motivo] of prueba) assert.equal(anthropic.leerPrueba(r), motivo);
});

test('ChatGPT: store:false siempre, máximo de salida de al menos 16, formato estricto; lee output[] y cuenta la caché dentro del total', () => {
  const p = openai.pedido({ modelo: 'gpt-6-luna', sistema: 'S', texto: 'T', esquema: ESQUEMA, salidaMax: 5 });
  assert.deepEqual(p, {
    ruta: '/v1/responses', metodo: 'POST',
    cuerpo: { model: 'gpt-6-luna', instructions: 'S', input: 'T', max_output_tokens: 16, store: false, text: { format: { type: 'json_schema', name: 'campos', schema: ESQUEMA, strict: true } } },
  });
  for (const prohibido of ['temperature', 'top_p', 'reasoning', 'fallbacks']) assert.ok(!JSON.stringify(p).includes(prohibido), prohibido);
  assert.deepEqual(openai.cabeceras('k'), { authorization: 'Bearer k', 'content-type': 'application/json' });
  assert.deepEqual(openai.prueba({ modelo: 'gpt-6-luna' }), { ruta: '/v1/models/gpt-6-luna', metodo: 'GET', cuerpo: null });
  const bien = {
    status: 'completed', service_tier: 'default',
    output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"listo":true}' }] }],
    usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 120 }, total_tokens: 1300 },
  };
  const r = openai.leer(resp(200, bien));
  assert.equal(r.motivo, 'ok');
  assert.deepEqual(r.json, { listo: true });
  assert.deepEqual(r.uso, { entrada: 700, salida: 300, cacheLectura: 200, cacheEscritura: 100, geo: null, raro: false, desconocidos: 0 });
  const con = cambios => openai.leer(resp(200, { ...bien, ...cambios }));
  assert.equal(con({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }).motivo, 'respuesta_incompleta');
  assert.equal(con({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } }).motivo, 'rechazada');
  assert.equal(con({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }).motivo, 'rechazada');
  const fallo = con({ status: 'failed' });
  assert.deepEqual([fallo.motivo, fallo.estado], ['error_proveedor', 'hecha'], 'falló, pero con lo gastado: se cobra lo real');
  assert.equal(con({ service_tier: 'priority' }).uso.raro, true);
  assert.equal(con({ usage: undefined }).estado, 'desconocida');
  const errorO = (status, type, code) => resp(status, { error: { message: 'x', type, code } });
  for (const [r2, motivo] of [
    [errorO(429, 'insufficient_quota', 'credit_balance_exhausted'), 'sin_credito'], [errorO(429, 'insufficient_quota', 'insufficient_quota'), 'sin_credito'],
    [errorO(429, 'requests', 'rate_limit_exceeded'), 'limite_proveedor'], [errorO(401, 'invalid_request_error', 'invalid_api_key'), 'clave_no_valida'],
    [errorO(400, 'invalid_request_error', null), 'pedido_no_valido'], [errorO(404, 'x', 'model_not_found'), 'modelo_no_disponible'], [errorO(503, 'x', null), 'error_proveedor'],
  ]) {
    assert.equal(openai.leer(r2).motivo, motivo);
    assert.equal(openai.leerPrueba(r2), motivo);
  }
  assert.equal(openai.leerPrueba(resp(200, { id: 'gpt-6-luna' })), 'ok');
});

// ---------- 13. La llamada a la red (contra el proveedor falso) ----------

test('llamar: respuesta buena, tiempo agotado, demasiado grande, JSON roto, texto plano, corte a mitad y servidor apagado', async () => {
  const falso = await crearProveedorFalso();
  try {
    const url = `${falso.base}/v1/messages`;
    const llamar = extra => llamarProveedor({ url, cuerpo: { a: 1 }, permitido: 'api.anthropic.com', timeoutMs: 5000, ...extra });
    const ok = await llamar();
    assert.equal(ok.status, 200);
    assert.equal(ok.json.type, 'message');
    assert.equal(ok.cabeceras['request-id'], 'req_falso_1');
    assert.equal(falso.peticiones[0].cuerpo.a, 1);
    falso.siguiente('nunca');
    const lento = await llamar({ timeoutMs: 50 });
    assert.equal(lento.tiempoAgotado, true);
    assert.ok(lento.msTotal < 4000);
    falso.siguiente('enorme');
    assert.equal((await llamar()).demasiado, true, 'más de 1 MB: se corta');
    falso.siguiente('json_roto');
    const roto = await llamar();
    assert.deepEqual([roto.status, roto.json, roto.textoCorto], [200, null, '{"roto": ']);
    falso.siguiente('sin_credito_texto');
    const plano = await llamar();
    assert.equal(plano.status, 400);
    assert.match(plano.textoCorto, /^Credit balance is too low/);
    assert.ok(plano.textoCorto.length <= 2048);
    falso.siguiente('cortar');
    const cortado = await llamar();
    assert.equal(cortado.red, 'durante');
    assert.equal(cortado.status, 200);
    // Un servidor que no existe (puerto cerrado): el pedido nunca salió.
    const apagado = createServer();
    await new Promise(listo => apagado.listen(0, '127.0.0.1', listo));
    const puerto = apagado.address().port;
    await new Promise(listo => apagado.close(listo));
    const sinServidor = await llamarProveedor({ url: `http://127.0.0.1:${puerto}/v1/messages`, cuerpo: {}, permitido: 'api.anthropic.com' });
    assert.equal(sinServidor.red, 'antes');
    assert.equal(sinServidor.error.codigo, 'ECONNREFUSED');
    // La señal de parar de la tarea corta enseguida.
    falso.siguiente('nunca');
    const control = new AbortController();
    setTimeout(() => control.abort(), 30);
    const parada = await llamar({ senal: control.signal });
    assert.deepEqual([parada.abortado, parada.tiempoAgotado], [true, false]);
    assert.equal(falso.peticiones.length, 7, 'exactamente un pedido por llamada: nunca reintenta');
  } finally {
    await falso.cerrar();
  }
});

test('llamar: nunca sigue una redirección (la clave y el pedido no llegan a otro servidor)', async () => {
  const falso = await crearProveedorFalso();
  try {
    falso.siguiente('redirige');
    const k = claveAnthropic('r');
    const r = await llamarProveedor({ url: `${falso.base}/v1/messages`, cabeceras: anthropic.cabeceras(k), cuerpo: { secreto: 'pregunta' }, permitido: 'api.anthropic.com' });
    assert.equal(r.status, 307);
    assert.equal(r.red, 'redireccion');
    assert.equal(anthropic.leer(r).motivo, 'redireccion');
    assert.equal(falso.segundo.peticiones.length, 0, 'el segundo servidor (127.0.0.2) no recibió nada');
  } finally {
    await falso.cerrar();
  }
});

test('llamar: solo va al servidor oficial (https) en el servidor real y solo a 127.0.0.1 en las pruebas; lo demás, sin tocar la red', async () => {
  // Sin red: las direcciones oficiales también se rechazan en modo de prueba.
  const fetchReal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (...a) => { llamadas += 1; return fetchReal(...a); };
  try {
    for (const url of ['https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/responses', 'http://127.0.0.2:9/v1/messages', 'http://localhost:9/x', 'http://usuario:clave@127.0.0.1:9/x', 'no es una url']) {
      const r = await llamarProveedor({ url, cuerpo: {}, permitido: 'api.anthropic.com' });
      assert.equal(r.rechazado, true, url);
      assert.equal(r.status, null);
    }
    assert.equal(llamadas, 0, 'ningún fetch');
  } finally {
    globalThis.fetch = fetchReal;
  }
  // Cómo decide en el servidor real (sin llamar).
  const real = { prueba: false };
  assert.equal(destinoPermitido('https://api.anthropic.com/v1/messages', 'api.anthropic.com', real), true);
  for (const url of ['http://api.anthropic.com/v1/messages', 'https://api.anthropic.com:8443/v1/messages', 'https://evil.example/v1/messages', 'https://api.anthropic.com.evil.example/v1', 'https://x:y@api.anthropic.com/v1', 'http://127.0.0.1:9/x']) {
    assert.equal(destinoPermitido(url, 'api.anthropic.com', real), false, url);
  }
  assert.equal(destinoPermitido('https://api.anthropic.com/v1/messages', null, real), false);
  // Las direcciones oficiales vienen de los adaptadores, y en las pruebas config.iaBases manda al falso.
  assert.equal(urlDe(anthropic, {}, '/v1/messages'), 'https://api.anthropic.com/v1/messages');
  assert.equal(urlDe(openai, { iaBases: { openai: 'http://127.0.0.1:5' } }, '/v1/responses'), 'http://127.0.0.1:5/v1/responses');
  assert.deepEqual(Object.keys(PROVEEDORES), ['anthropic', 'openai']);
});

test('llamar: un valor de cabecera con salto de línea no sale, y lo devuelto nunca contiene la clave (Node la pone en su mensaje de error)', async () => {
  const falso = await crearProveedorFalso();
  try {
    const mala = `${claveAnthropic('t')}\nX-Inyectada: si`;
    const escrito = await capturarConsola(async () => {
      const r = await llamarProveedor({ url: `${falso.base}/v1/messages`, cabeceras: anthropic.cabeceras(mala), cuerpo: {}, permitido: 'api.anthropic.com' });
      assert.equal(r.red, 'local');
      assert.deepEqual(r.error, { nombre: 'TypeError', codigo: null });
      assert.ok(!JSON.stringify(r).includes(claveAnthropic('t')));
      assert.equal(anthropic.leer(r).motivo, 'pedido_no_valido');
      // Un cuerpo que no se puede convertir a texto tampoco tumba nada.
      const circular = {};
      circular.yo = circular;
      assert.equal((await llamarProveedor({ url: `${falso.base}/v1/messages`, cuerpo: circular, permitido: 'api.anthropic.com' })).red, 'local');
    });
    assert.equal(falso.peticiones.length, 0);
    assert.ok(!escrito.includes(claveAnthropic('t')));
  } finally {
    await falso.cerrar();
  }
});

// ---------- 15 (núcleo). Cada respuesta del proveedor: lo que cuesta, la pausa y el aviso ----------

// Lo que hará el trabajador en el paso 2 (src/ia/cliente.js): reservar → leer la clave → UNA llamada → leer → liquidar.
async function usarUnaVez(b, { ahora = T0, timeoutMs = 5000, entradaMax = 6900 } = {}) {
  const r = reservar(b.db, { config: b.config, proposito: 'interpretar', espacioId: b.espacioAdmin, entradaMax, ahora });
  if (!r.ok) return { reserva: r };
  const adaptador = PROVEEDORES[r.llamada.proveedor];
  const valor = leerSecreto(b.db, b.config, { id: r.llamada.secretoId });
  const p = adaptador.pedido({ modelo: r.llamada.modelo, sistema: 'Sistema de prueba', texto: 'Texto de prueba', esquema: ESQUEMA, salidaMax: r.llamada.salidaMax, esfuerzo: 'low' });
  const respuesta = await llamarProveedor({ url: urlDe(adaptador, b.config, p.ruta), metodo: p.metodo, cabeceras: adaptador.cabeceras(valor), cuerpo: p.cuerpo, timeoutMs, permitido: adaptador.host });
  const leido = adaptador.leer(respuesta);
  const liquidado = liquidar(b.db, { llamadaId: r.llamada.id, resultado: leido, duracionMs: respuesta.msTotal, ahora, config: b.config });
  return { reserva: r, leido, liquidado, fila: b.db.prepare('SELECT * FROM ia_llamadas WHERE id = ?').get(r.llamada.id) };
}

const ok450 = costoMicro(HAIKU, { entrada: 2000, salida: 500, cacheLectura: 0, cacheEscritura: 0, geo: 'global' });
const ESCENAS_CLAUDE = [
  // escena, motivo, estado, costo ('reserva' = lo apartado), pausa (null | 'admin' | ms), nivel del aviso
  ['ok', 'ok', 'hecha', ok450, null, null],
  ['geo_us', 'ok', 'hecha', 495, null, null],
  ['refusal', 'rechazada', 'hecha', ok450, null, null],
  ['max_tokens', 'respuesta_incompleta', 'hecha', ok450, null, null],
  [{ tipo: 'status', status: 401 }, 'clave_no_valida', 'fallida', 0, 'admin', 'grave'],
  ['eco_clave', 'clave_no_valida', 'fallida', 0, 'admin', 'grave'],
  [{ tipo: 'status', status: 402 }, 'sin_credito', 'fallida', 0, 'admin', 'grave'],
  ['sin_credito_400', 'sin_credito', 'fallida', 0, 'admin', 'grave'],
  ['sin_credito_texto', 'sin_credito', 'fallida', 0, 'admin', 'grave'],
  ['limite_gasto_400', 'limite_gasto_proveedor', 'fallida', 0, 'admin', 'grave'],
  ['limite_tope_429', 'limite_gasto_proveedor', 'fallida', 0, 'admin', 'grave'],
  [{ tipo: 'status', status: 403 }, 'sin_permiso', 'fallida', 0, 'admin', 'grave'],
  [{ tipo: 'status', status: 404 }, 'modelo_no_disponible', 'fallida', 0, 'admin', 'atencion'],
  ['otro_400', 'pedido_no_valido', 'fallida', 0, 'admin', 'atencion'],
  ['redirige', 'redireccion', 'fallida', 0, 'admin', 'atencion'],
  ['limite_429', 'limite_proveedor', 'fallida', 0, MIN, 'atencion'], // retry-after 30 s: al menos 1 minuto
  [{ tipo: 'status', status: 529 }, 'sobrecargado', 'fallida', 0, 2 * MIN, 'info'],
  [{ tipo: 'status', status: 500 }, 'error_proveedor', 'fallida', 0, 2 * MIN, 'info'],
  [{ tipo: 'status', status: 503 }, 'error_proveedor', 'fallida', 0, 2 * MIN, 'info'],
  [{ tipo: 'status', status: 413 }, 'demasiado_largo', 'fallida', 0, null, null],
  ['json_roto', 'respuesta_no_valida', 'desconocida', 'reserva', null, null],
  ['sin_uso', 'respuesta_no_valida', 'desconocida', 'reserva', null, null],
  ['enorme', 'respuesta_no_valida', 'desconocida', 'reserva', null, null],
  ['cortar', 'sin_red', 'desconocida', 'reserva', 2 * MIN, null],
  ['nunca', 'tiempo_agotado', 'desconocida', 'reserva', 2 * MIN, null],
];

test('cada respuesta de Claude: UN solo pedido, su costo (0 si el proveedor no cobra), su pausa y su aviso; y la próxima vez no toca la red', async () => {
  const falso = await crearProveedorFalso();
  try {
    for (const [escena, motivo, estado, costo, pausa, nivel] of ESCENAS_CLAUDE) {
      const nombre = typeof escena === 'string' ? escena : `${escena.tipo} ${escena.status}`;
      const b = preparar({ iaBases: { anthropic: falso.base, openai: falso.base } });
      try {
        const antes = falso.peticiones.length;
        falso.siguiente(escena);
        const u = await usarUnaVez(b, { timeoutMs: escena === 'nunca' ? 100 : 5000 });
        assert.equal(falso.peticiones.length, antes + 1, `${nombre}: exactamente un pedido`);
        assert.equal(u.leido.motivo, motivo, nombre);
        assert.equal(u.fila.estado, estado, nombre);
        assert.equal(u.fila.resultado, motivo, nombre);
        assert.equal(u.fila.costo_micro, costo === 'reserva' ? u.reserva.llamada.reservadoMicro : costo, `${nombre}: costo`);
        const secreto = b.db.prepare('SELECT * FROM secretos WHERE id = ?').get(b.secretoId);
        const aviso = b.db.prepare("SELECT * FROM avisos WHERE clave = 'ia_proveedor:anthropic' AND resuelto_en IS NULL").get();
        if (pausa === null) assert.equal(secreto.pausa_motivo, null, `${nombre}: sin pausa`);
        else if (pausa === 'admin') {
          assert.equal(secreto.pausa_motivo, motivo, `${nombre}: pausa del dueño`);
          assert.equal(secreto.pausa_hasta, null);
        } else {
          assert.equal(secreto.pausa_motivo, motivo);
          assert.equal(Date.parse(secreto.pausa_hasta) - T0, pausa, `${nombre}: duración de la pausa corta`);
        }
        if (nivel) {
          assert.equal(aviso?.nivel, nivel, `${nombre}: aviso al momento`);
          assert.deepEqual(Object.keys(JSON.parse(aviso.detalle)).sort(), ['hasta', 'motivo', 'pausa', 'proveedor']);
        } else assert.equal(aviso, undefined, `${nombre}: sin aviso`);
        if (['clave_no_valida', 'sin_permiso', 'modelo_no_disponible'].includes(motivo)) assert.equal(secreto.prueba, motivo, 'queda como resultado de la prueba');
        if (escena === 'redirige') assert.equal(falso.segundo.peticiones.length, 0);
        if (escena === 'geo_us') assert.equal(JSON.parse(u.fila.detalle).geo, 'us');
        // La próxima vez: si quedó en pausa, ni siquiera reserva ni llama (nunca un bucle de reintentos).
        const despues = falso.peticiones.length;
        const otra = await usarUnaVez(b, { ahora: T0 + 1000 });
        if (pausa !== null) {
          assert.deepEqual(otra.reserva, { ok: false, motivo: motivo === 'clave_no_valida' || motivo === 'sin_permiso' ? motivo : 'proveedor_en_pausa', ambito: 'general' });
          assert.equal(falso.peticiones.length, despues, `${nombre}: en pausa no se toca la red`);
        } else {
          assert.equal(otra.reserva.ok, true, `${nombre}: sin pausa, la próxima vez se puede usar`);
        }
        // Una pausa corta se pasa sola; una del dueño espera al dueño.
        if (typeof pausa === 'number') assert.equal((await usarUnaVez(b, { ahora: T0 + pausa })).reserva.ok, true);
      } finally {
        b.db.close();
      }
    }
  } finally {
    await falso.cerrar();
  }
});

test('un gasto desconocido (caché de 1 hora, herramientas del servidor) o mayor que lo apartado: se cobra la cota, aviso grave y pausa del dueño', async () => {
  const falso = await crearProveedorFalso();
  try {
    for (const escena of ['uso_raro', 'uso_raro_herramienta', 'uso_enorme']) {
      const b = preparar({ iaBases: { anthropic: falso.base } });
      try {
        falso.siguiente(escena);
        const u = await usarUnaVez(b);
        assert.equal(u.leido.motivo, 'ok', escena);
        assert.equal(u.liquidado.mayorQueReserva, true, escena);
        assert.ok(u.fila.costo_micro >= u.reserva.llamada.reservadoMicro, `${escena}: nunca se cuenta menos que lo apartado`);
        assert.equal(b.db.prepare("SELECT nivel FROM avisos WHERE clave = 'ia_costo_mayor' AND resuelto_en IS NULL").get().nivel, 'grave');
        assert.equal(b.db.prepare('SELECT pausa_motivo FROM secretos').get().pausa_motivo, 'costo_mayor');
        const antes = falso.peticiones.length;
        assert.equal((await usarUnaVez(b, { ahora: T0 + 1000 })).reserva.motivo, 'proveedor_en_pausa');
        assert.equal(falso.peticiones.length, antes);
      } finally {
        b.db.close();
      }
    }
  } finally {
    await falso.cerrar();
  }
});

test('tres fallas seguidas de la misma clave en una hora la pausan hasta que el dueño la revise; un uso bueno cierra el aviso', async () => {
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  try {
    // 500 → pausa corta de 2 minutos; pasada la pausa vuelve a fallar…
    falso.siguiente({ tipo: 'status', status: 500 });
    await usarUnaVez(b, { ahora: T0 });
    falso.siguiente('ok');
    await usarUnaVez(b, { ahora: T0 + 2 * MIN });
    assert.equal(b.db.prepare("SELECT COUNT(*) AS n FROM avisos WHERE clave = 'ia_proveedor:anthropic' AND resuelto_en IS NULL").get().n, 0, 'un uso bueno cierra el aviso');
    falso.siguiente({ tipo: 'status', status: 500 }, { tipo: 'status', status: 529 }, { tipo: 'status', status: 503 });
    await usarUnaVez(b, { ahora: T0 + 3 * MIN });
    await usarUnaVez(b, { ahora: T0 + 6 * MIN });
    let s = b.db.prepare('SELECT pausa_motivo, pausa_hasta FROM secretos').get();
    assert.ok(s.pausa_hasta, 'dos fallas: todavía pausa corta');
    await usarUnaVez(b, { ahora: T0 + 9 * MIN });
    s = b.db.prepare('SELECT pausa_motivo, pausa_hasta FROM secretos').get();
    assert.deepEqual([s.pausa_motivo, s.pausa_hasta], ['fallas_seguidas', null], 'la tercera: pausa del dueño');
    const aviso = b.db.prepare("SELECT nivel, detalle FROM avisos WHERE clave = 'ia_proveedor:anthropic' AND resuelto_en IS NULL").get();
    assert.equal(aviso.nivel, 'atencion');
    assert.equal(JSON.parse(aviso.detalle).motivo, 'fallas_seguidas');
    const antes = falso.peticiones.length;
    assert.equal((await usarUnaVez(b, { ahora: T0 + 3 * 3_600_000 })).reserva.motivo, 'proveedor_en_pausa', 'horas después sigue en pausa');
    assert.equal(falso.peticiones.length, antes);
  } finally {
    b.db.close();
    await falso.cerrar();
  }
});

test('ChatGPT contra el falso: se guarda y se prueba, pero nunca gasta (precio sin confirmar); sus respuestas se leen bien', async () => {
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base, openai: falso.base } });
  try {
    const k = guardarSecreto(b.db, b.config, { uso: 'ia_openai', valor: claveOpenai(), usuarioId: b.admin }).secreto;
    const valor = leerSecreto(b.db, b.config, { id: k.id });
    const llamar = async (p, escena) => {
      if (escena) falso.siguiente(escena);
      return llamarProveedor({ url: urlDe(openai, b.config, p.ruta), metodo: p.metodo, cabeceras: openai.cabeceras(valor), cuerpo: p.cuerpo, permitido: openai.host });
    };
    assert.equal(openai.leerPrueba(await llamar(openai.prueba({ modelo: 'gpt-6-luna' }))), 'ok');
    assert.equal(falso.peticiones.at(-1).metodo, 'GET');
    assert.equal(falso.peticiones.at(-1).ruta, '/v1/models/gpt-6-luna');
    assert.equal(falso.peticiones.at(-1).cabeceras.authorization, `Bearer ${valor}`);
    const pedido = openai.pedido({ modelo: 'gpt-6-luna', sistema: 'S', texto: 'T', esquema: ESQUEMA, salidaMax: 2048 });
    for (const [escena, motivo] of [['ok', 'ok'], ['sin_credito_openai', 'sin_credito'], ['insufficient_quota', 'sin_credito'], ['incomplete', 'respuesta_incompleta'], ['content_filter', 'rechazada'], ['refusal', 'rechazada'], ['failed', 'error_proveedor'], [{ tipo: 'status', status: 401 }, 'clave_no_valida'], ['limite_429', 'limite_proveedor']]) {
      assert.equal(openai.leer(await llamar(pedido, escena)).motivo, motivo, String(escena.tipo ?? escena));
    }
    assert.equal(falso.peticiones.at(-1).cuerpo.store, false);
    // Para gastar con ChatGPT hace falta su precio confirmado: reservar nunca lo elige.
    b.db.prepare("UPDATE secretos SET estado = 'desactivada' WHERE uso = 'ia_anthropic'").run();
    ponerConfig(b.db, { orden: ['openai', 'anthropic'], proveedores: { anthropic: { usar: true, modelo: 'claude-haiku-5-5' }, openai: { usar: true, modelo: 'gpt-6-luna' } } });
    assert.equal((await usarUnaVez(b)).reserva.motivo, 'precio_sin_confirmar');
  } finally {
    b.db.close();
    await falso.cerrar();
  }
});

// ---------- 23 (núcleo). La clave nunca se guarda ni se escribe fuera del texto cifrado ----------

test('la clave nunca aparece en ninguna fila, en los archivos de la base ni en la consola (ni cuando el proveedor la devuelve)', async () => {
  const falso = await crearProveedorFalso();
  const b = preparar({ iaBases: { anthropic: falso.base } });
  try {
    const escrito = await capturarConsola(async () => {
      for (const [i, escena] of ['ok', { tipo: 'status', status: 500 }, 'json_roto', 'eco_clave', 'sin_credito_texto', 'redirige'].entries()) {
        b.db.prepare('UPDATE secretos SET pausa_motivo = NULL, pausa_hasta = NULL, pausa_desde = NULL, prueba = ?').run('ok');
        falso.siguiente(escena);
        await usarUnaVez(b, { ahora: T0 + i * 10 * MIN });
      }
    });
    const eco = falso.peticiones.find(p => p.cabeceras['x-api-key']);
    assert.equal(eco.cabeceras['x-api-key'], claveAnthropic(), 'la clave sí llegó al proveedor falso (solo ahí)');
    assert.deepEqual(buscarEnTodo(b.db, b.config, claveAnthropic()), []);
    assert.ok(!escrito.includes(claveAnthropic()));
    for (const f of b.db.prepare('SELECT detalle FROM ia_llamadas WHERE detalle IS NOT NULL').all()) {
      for (const v of Object.values(JSON.parse(f.detalle))) assert.match(String(v), /^[a-z0-9_]{1,60}$/, 'detalle: solo códigos');
    }
  } finally {
    b.db.close();
    await falso.cerrar();
  }
});

// ---------- El trabajador corre sin archivos «core» ----------

test('el trabajador se enciende con prlimit --core=0 (si existe): una caída nunca deja en el disco una copia de su memoria', { skip: !(existsSync('/usr/bin/prlimit') || existsSync('/bin/prlimit')) || !existsSync('/proc/self/limits') }, async () => {
  const carpeta = carpetaTemporal('limites');
  const programa = join(carpeta, 'limites.mjs');
  writeFileSync(programa, "import { readFileSync } from 'node:fs';\nprocess.stdout.write(readFileSync('/proc/self/limits', 'utf8'), () => process.exit(0));\n");
  const hijo = lanzarTrabajador({ ruta: programa, env: { PATH: process.env.PATH } });
  let salida = '';
  hijo.stdout.on('data', d => { salida += d; });
  const codigo = await new Promise(listo => hijo.on('exit', listo));
  assert.equal(codigo, 0);
  const linea = salida.split('\n').find(l => l.startsWith('Max core file size'));
  assert.match(linea, /Max core file size\s+0\s+0\s+bytes/);
});
