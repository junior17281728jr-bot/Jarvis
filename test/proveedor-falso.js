// Un proveedor de IA FALSO para las pruebas (no es un archivo *.test.js). Imita las respuestas de Anthropic y de OpenAI
// en 127.0.0.1 (puerto al azar), así ninguna prueba usa nunca una API de verdad ni una clave de verdad.
//   const falso = await crearProveedorFalso();
//   config.iaBases = { anthropic: falso.base, openai: falso.base }   (o OPORTIA_IA_URL_ANTHROPIC para un proceso hijo)
//   falso.siguiente('sin_credito_400', { tipo: 'lento', ms: 200 })   cada pedido toma la siguiente escena (si no hay: 'ok')
//   falso.peticiones   cada pedido recibido (método, ruta, cabeceras, cuerpo), para revisar qué llegó
//   falso.segundo.peticiones   lo que llegó al SEGUNDO servidor (127.0.0.2), adonde apunta la escena 'redirige'
// Escenas de la ronda 1 de revisión: 'geo_desconocido' (un lugar que la tabla de precios no conoce), 'geo_raro' (un lugar
// que no se entiende), 'profundo' (un 200 bueno con un campo de arreglos anidados de { bytes } bytes: mucha memoria al
// leerlo), 'eco_id' (devuelve la clave que recibió como id de la petición: cabecera request-id, request_id e id; con
// { status } y { trozo: true } para mandar solo «req_» + un pedazo de la clave).
// Escenas de la ronda 2: 'uso_anidado' (un cobro nuevo DENTRO de un objeto: usage.nuevo_cobro = { tokens }, con
// { tokens }), 'uso_herramienta_anidada' (server_tool_use: { web_fetch: { requests: 30 } }), 'uso_absurdo' (2^53 − 1
// tokens de entrada y de salida: cada número es «válido», el costo no cabe) y 'uso_cero' (dice 0 y 0 tokens).
// Escena de la ronda 3: 'eco_clave_contenido' (un proveedor hostil que devuelve la clave que recibió en lo que «escribe»
// el modelo o en sus códigos). { modo }: 'contenido' (200 bueno con la clave en producto, sectores y prioridades),
// 'minusculas' (200 bueno con la clave en minúsculas y solo letras y números), 'stop' (200 con la clave así en
// stop_reason / incomplete_details.reason), 'error' (401 con la clave así en el tipo y el código del error) y
// 'error_500' (lo mismo con un 500).
// Rutas: POST /v1/messages, POST /v1/messages/count_tokens (Anthropic), POST /v1/responses, GET /v1/models/:id (OpenAI).
// 0.14.0: GET /v1/models (la LISTA: { modelos }), POST /v1/images/generations (un WebP falso pequeño) y la «API propia»:
// POST /chat/completions y GET /models (su lista: { modelosPropia }).
import { createServer } from 'node:http';

export const ESCENAS = Object.freeze([
  'ok', 'refusal', 'max_tokens', 'incomplete', 'content_filter', 'failed', 'status', 'limite_gasto_400', 'sin_credito_400',
  'sin_credito_texto', 'otro_400', 'limite_tope_429', 'limite_429', 'sin_credito_openai', 'insufficient_quota', 'redirige',
  'geo_us', 'uso_raro', 'uso_raro_herramienta', 'nunca', 'lento', 'json_roto', 'enorme', 'sin_uso', 'uso_enorme', 'cortar', 'eco_clave',
  'geo_desconocido', 'geo_raro', 'profundo', 'eco_id', 'uso_anidado', 'uso_herramienta_anidada', 'uso_absurdo', 'uso_cero',
  'eco_clave_contenido',
]);

const USO_ANTHROPIC = Object.freeze({ input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, service_tier: 'standard', inference_geo: 'global' });
const TIPO_POR_STATUS = { 400: 'invalid_request_error', 401: 'authentication_error', 402: 'billing_error', 403: 'permission_error', 404: 'not_found_error', 413: 'request_too_large', 429: 'rate_limit_error', 500: 'api_error', 503: 'api_error', 529: 'overloaded_error' };

function leerCuerpo(req) {
  return new Promise(listo => {
    const partes = [];
    req.on('data', p => partes.push(p));
    req.on('end', () => listo(Buffer.concat(partes).toString('utf8')));
    req.on('error', () => listo(''));
  });
}

function comoJson(texto) {
  try { return texto ? JSON.parse(texto) : null; } catch { return texto; }
}

function enviar(res, status, cuerpo, cabeceras = {}) {
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  res.writeHead(status, { 'content-type': typeof cuerpo === 'string' ? 'text/plain' : 'application/json', ...cabeceras });
  res.end(texto);
}

const errorAnthropic = (status, mensaje, extra = {}) => ({ type: 'error', error: { type: TIPO_POR_STATUS[status] ?? 'api_error', message: mensaje, ...extra }, request_id: 'req_falso_error' });
const errorOpenai = (mensaje, tipo, codigo = null) => ({ error: { message: mensaje, type: tipo, param: null, code: codigo } });

export const MODELOS_FALSOS = Object.freeze(['gpt-6-pro', 'gpt-5-mini', 'gpt-6', 'gpt-6-mini', 'gpt-6-nano', 'gpt-image-2', 'text-embedding-3-small', 'gpt-6-2026-08-01', 'whisper-1']);
export const MODELOS_PROPIA_FALSOS = Object.freeze(['mi-modelo-grande', 'mi-modelo-mini']);
// Un WebP falso (solo la cabecera RIFF/WEBP y relleno): lo «dibuja» el proveedor falso.
export const WEBP_FALSO = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([60, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1'), Buffer.alloc(52, 9)]);
export async function crearProveedorFalso({ respuestaJson = { listo: true }, modelos = MODELOS_FALSOS, modelosPropia = MODELOS_PROPIA_FALSOS, imagen = WEBP_FALSO } = {}) {
  const peticiones = [];
  const cola = [];
  const segundoPeticiones = [];
  let numero = 0;

  const segundo = createServer(async (req, res) => {
    segundoPeticiones.push({ metodo: req.method, ruta: req.url, cabeceras: { ...req.headers }, cuerpo: await leerCuerpo(req) });
    enviar(res, 200, { segundo: true });
  });
  await new Promise(listo => segundo.listen(0, '127.0.0.2', listo));
  const baseSegundo = `http://127.0.0.2:${segundo.address().port}`;

  function okAnthropic(escena, cuerpoPedido) {
    const uso = { ...USO_ANTHROPIC, ...(escena.uso ?? {}) };
    if (escena.tipo === 'geo_us') uso.inference_geo = 'us';
    if (escena.tipo === 'geo_desconocido') uso.inference_geo = 'eu';
    if (escena.tipo === 'geo_raro') uso.inference_geo = 'EU West';
    if (escena.tipo === 'uso_raro') { uso.cache_creation_input_tokens = 50; uso.cache_creation = { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 50 }; }
    if (escena.tipo === 'uso_raro_herramienta') uso.server_tool_use = { web_search_requests: 1 };
    if (escena.tipo === 'uso_enorme') { uso.input_tokens = 5_000_000; uso.output_tokens = 900_000; }
    if (escena.tipo === 'uso_anidado') uso.nuevo_cobro = { tokens: escena.tokens ?? 50_000 };
    if (escena.tipo === 'uso_herramienta_anidada') uso.server_tool_use = { web_fetch: { requests: 30 } };
    if (escena.tipo === 'uso_absurdo') { uso.input_tokens = Number.MAX_SAFE_INTEGER; uso.output_tokens = Number.MAX_SAFE_INTEGER; }
    if (escena.tipo === 'uso_cero') { uso.input_tokens = 0; uso.output_tokens = 0; }
    const content = [];
    if (escena.pensar !== false) content.push({ type: 'thinking', thinking: '', signature: 'firma_falsa' });
    let stop = 'end_turn';
    if (escena.tipo === 'refusal') stop = 'refusal';
    else if (escena.tipo === 'max_tokens') stop = 'max_tokens';
    else content.push({ type: 'text', text: escena.texto ?? JSON.stringify(escena.json ?? (typeof respuestaJson === "function" ? respuestaJson(cuerpoPedido) : respuestaJson)) });
    const cuerpo = { id: `msg_falso_${numero}`, type: 'message', role: 'assistant', model: cuerpoPedido?.model ?? 'claude-haiku-5-5', content, stop_reason: stop, stop_details: null, usage: uso };
    if (escena.tipo === 'sin_uso') delete cuerpo.usage;
    return cuerpo;
  }

  function okOpenai(escena, cuerpoPedido) {
    const uso = { input_tokens: 2000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 500, output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 2500, ...(escena.uso ?? {}) };
    if (escena.tipo === 'uso_enorme') { uso.input_tokens = 5_000_000; uso.output_tokens = 900_000; }
    if (escena.tipo === 'uso_anidado') uso.nuevo = { tokens: escena.tokens ?? 50_000 };
    if (escena.tipo === 'uso_absurdo') { uso.input_tokens = Number.MAX_SAFE_INTEGER; uso.output_tokens = Number.MAX_SAFE_INTEGER; uso.total_tokens = Number.MAX_SAFE_INTEGER; }
    if (escena.tipo === 'uso_cero') { uso.input_tokens = 0; uso.output_tokens = 0; uso.total_tokens = 0; uso.output_tokens_details = { reasoning_tokens: 0 }; }
    const cuerpo = {
      id: `resp_falso_${numero}`, object: 'response', status: 'completed', model: cuerpoPedido?.model ?? 'gpt-6-luna', service_tier: 'default',
      output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: escena.texto ?? JSON.stringify(escena.json ?? (typeof respuestaJson === 'function' ? respuestaJson(cuerpoPedido) : respuestaJson)) }] }],
      usage: uso,
    };
    if (escena.tipo === 'refusal') cuerpo.output[1].content = [{ type: 'refusal', refusal: 'no' }];
    if (escena.tipo === 'incomplete' || escena.tipo === 'max_tokens') { cuerpo.status = 'incomplete'; cuerpo.incomplete_details = { reason: 'max_output_tokens' }; }
    if (escena.tipo === 'content_filter') { cuerpo.status = 'incomplete'; cuerpo.incomplete_details = { reason: 'content_filter' }; }
    if (escena.tipo === 'failed') { cuerpo.status = 'failed'; cuerpo.error = { code: 'server_error', message: 'falso' }; }
    if (escena.tipo === 'sin_uso') delete cuerpo.usage;
    return cuerpo;
  }

  function okChat(escena, cuerpoPedido) {
    const texto = escena.texto ?? JSON.stringify(escena.json ?? (typeof respuestaJson === 'function' ? respuestaJson(cuerpoPedido) : respuestaJson));
    return {
      id: `chatcmpl-falso-${numero}`, object: 'chat.completion', model: cuerpoPedido?.model ?? 'mi-modelo',
      choices: [{ index: 0, message: { role: 'assistant', content: texto, refusal: null }, finish_reason: escena.tipo === 'max_tokens' ? 'length' : 'stop' }],
      usage: { prompt_tokens: 2000, completion_tokens: 500, total_tokens: 2500, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } },
    };
  }

  async function responder(escena, req, res, ruta, cuerpoPedido) {
    const esOpenai = ruta.startsWith('/v1/responses') || ruta.startsWith('/v1/models') || ruta.startsWith('/v1/images') || ruta === '/chat/completions' || ruta === '/models';
    const esPrueba = ruta === '/v1/messages/count_tokens' || ruta.startsWith('/v1/models') || ruta === '/models';
    const id = { 'request-id': `req_falso_${numero}`, 'x-request-id': `req_falso_${numero}` };
    switch (escena.tipo) {
      case 'nunca': return; // nunca responde (se corta por tiempo)
      case 'lento': await new Promise(listo => setTimeout(listo, escena.ms ?? 200)); break;
      case 'redirige': {
        res.writeHead(307, { location: `${baseSegundo}${ruta}` });
        return res.end();
      }
      case 'json_roto': { res.writeHead(200, { 'content-type': 'application/json', ...id }); return res.end('{"roto": '); }
      case 'enorme': {
        res.writeHead(200, { 'content-type': 'application/json', ...id });
        return res.end(`{"x":"${'a'.repeat(3_000_000)}"}`);
      }
      case 'cortar': {
        res.writeHead(200, { 'content-type': 'application/json', 'content-length': '5000', ...id });
        res.write('{"id":"msg_cortado","content":[');
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      }
      case 'status': {
        const s = escena.status ?? 500;
        return enviar(res, s, esOpenai ? errorOpenai('falso', s === 401 ? 'invalid_request_error' : 'server_error', s === 401 ? 'invalid_api_key' : null) : errorAnthropic(s, 'falso'), id);
      }
      case 'limite_gasto_400': return enviar(res, 400, errorAnthropic(400, 'You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.'), id);
      case 'sin_credito_400': return enviar(res, 400, errorAnthropic(400, 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'), id);
      case 'sin_credito_texto': return enviar(res, 400, 'Credit balance is too low to access the Anthropic API.', id);
      case 'otro_400': return enviar(res, 400, esOpenai ? errorOpenai('This organization has been disabled.', 'invalid_request_error') : errorAnthropic(400, 'This organization has been disabled.'), id);
      case 'limite_tope_429': return enviar(res, 429, errorAnthropic(429, 'Spend limit reached', { details: { error_code: 'enforced_spend_limit_reached' } }), id);
      case 'limite_429': return enviar(res, 429, esOpenai ? errorOpenai('Rate limit reached', 'requests', 'rate_limit_exceeded') : errorAnthropic(429, 'Number of requests has exceeded your rate limit'), { ...id, 'retry-after': '30' });
      case 'sin_credito_openai': return enviar(res, 429, errorOpenai('You exceeded your current quota.', 'insufficient_quota', 'credit_balance_exhausted'), id);
      case 'insufficient_quota': return enviar(res, 429, errorOpenai('You exceeded your current quota.', 'insufficient_quota', 'insufficient_quota'), id);
      case 'profundo': {
        // Un 200 bueno, con un campo de más hecho de arreglos anidados [[[[…]]]]: poco texto, mucha memoria al leerlo.
        const mitad = Math.max(1, Math.floor((escena.bytes ?? 1_048_000) / 2));
        const cuerpo = JSON.stringify(esOpenai ? okOpenai({ tipo: 'ok' }, cuerpoPedido) : okAnthropic({ tipo: 'ok' }, cuerpoPedido));
        res.writeHead(200, { 'content-type': 'application/json', ...id });
        return res.end(`${cuerpo.slice(0, -1)},"x":${'['.repeat(mitad)}${']'.repeat(mitad)}}`);
      }
      case 'eco_id': {
        // Un proveedor (o algo en el medio) que devuelve la clave que recibió como «id» de la petición.
        const recibida = String(req.headers['x-api-key'] ?? req.headers.authorization ?? '').replace(/^Bearer /, '');
        const eco = escena.trozo ? `req_${recibida.replace(/[^A-Za-z0-9]/g, '').slice(5, 40)}` : recibida;
        const cabeceras = { 'request-id': eco, 'x-request-id': eco };
        const s = escena.status ?? 401;
        if (s === 200) {
          const cuerpo = esOpenai ? okOpenai({ tipo: 'ok' }, cuerpoPedido) : okAnthropic({ tipo: 'ok' }, cuerpoPedido);
          return enviar(res, 200, { ...cuerpo, id: eco, request_id: eco }, cabeceras);
        }
        return enviar(res, s, esOpenai ? { ...errorOpenai('falso', 'invalid_request_error', 'invalid_api_key'), id: eco } : { ...errorAnthropic(s, 'falso'), request_id: eco, id: eco }, cabeceras);
      }
      case 'eco_clave': {
        // Un proveedor que devuelve la clave que recibió dentro de su mensaje de error: OPORTIA nunca debe guardarlo.
        const recibida = String(req.headers['x-api-key'] ?? req.headers.authorization ?? '');
        return enviar(res, 401, esOpenai ? errorOpenai(`Incorrect API key provided: ${recibida}`, 'invalid_request_error', 'invalid_api_key') : errorAnthropic(401, `invalid x-api-key: ${recibida}`), id);
      }
      case 'eco_clave_contenido': {
        const recibida = String(req.headers['x-api-key'] ?? req.headers.authorization ?? '').replace(/^Bearer /, '');
        const plana = recibida.toLowerCase().replace(/[^a-z0-9]/g, '');
        const modo = escena.modo ?? 'contenido';
        if (modo === 'error' || modo === 'error_500') {
          const s = modo === 'error' ? 401 : 500;
          const codigo = plana.slice(-40);
          if (esOpenai) return enviar(res, s, errorOpenai('falso', codigo, codigo), id);
          return enviar(res, s, { type: 'error', error: { type: codigo, message: 'falso', details: { error_code: codigo } }, request_id: 'req_falso_error' }, id);
        }
        const eco = modo === 'minusculas' ? plana : recibida;
        const json = { ...(escena.json ?? respuestaJson), producto: `reparación ${eco}`, sectores: `Talleres ${eco}`, prioridades: eco };
        const cuerpo = esOpenai ? okOpenai({ tipo: 'ok', json }, cuerpoPedido) : okAnthropic({ tipo: 'ok', json }, cuerpoPedido);
        if (modo === 'stop') {
          if (esOpenai) { cuerpo.status = 'incomplete'; cuerpo.incomplete_details = { reason: plana.slice(0, 40) }; } else cuerpo.stop_reason = plana.slice(0, 40);
        }
        return enviar(res, 200, cuerpo, id);
      }
      default: break;
    }
    if (esPrueba) {
      if (ruta === '/v1/models') return enviar(res, 200, { object: 'list', data: modelos.map(m => ({ id: m, object: 'model', owned_by: 'openai' })) }, id);
      if (ruta === '/models') return enviar(res, 200, { object: 'list', data: modelosPropia.map(m => ({ id: m, object: 'model' })) }, id);
      if (ruta.startsWith('/v1/models')) return enviar(res, 200, { id: decodeURIComponent(ruta.slice('/v1/models/'.length)), object: 'model', owned_by: 'openai' }, id);
      return enviar(res, 200, { input_tokens: 9 }, id);
    }
    if (ruta === '/v1/images/generations') {
      return enviar(res, 200, { created: 1, data: [{ b64_json: imagen.toString('base64') }], usage: { input_tokens: 60, output_tokens: 272, total_tokens: 332, input_tokens_details: { text_tokens: 60, image_tokens: 0 } } }, id);
    }
    if (ruta === '/chat/completions') return enviar(res, 200, okChat(escena, cuerpoPedido), id);
    return enviar(res, 200, esOpenai ? okOpenai(escena, cuerpoPedido) : okAnthropic(escena, cuerpoPedido), id);
  }

  const servidor = createServer(async (req, res) => {
    numero += 1;
    const texto = await leerCuerpo(req);
    const ruta = new URL(req.url, 'http://x').pathname;
    const cuerpo = comoJson(texto);
    peticiones.push({ metodo: req.method, ruta, cabeceras: { ...req.headers }, cuerpo });
    const siguiente = cola.length ? cola.shift() : 'ok';
    const escena = typeof siguiente === 'string' ? { tipo: siguiente } : { ...siguiente };
    try { await responder(escena, req, res, ruta, cuerpo); } catch { try { res.destroy(); } catch { /* ya cerrada */ } }
  });
  await new Promise(listo => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  return {
    base,
    peticiones,
    segundo: { base: baseSegundo, peticiones: segundoPeticiones },
    siguiente(...escenas) {
      for (const e of escenas) {
        const tipo = typeof e === 'string' ? e : e?.tipo;
        if (!ESCENAS.includes(tipo)) throw new Error(`escena desconocida: ${tipo}`);
        cola.push(e);
      }
    },
    pendientes: () => cola.length,
    async cerrar() {
      cola.length = 0;
      for (const s of [servidor, segundo]) {
        s.closeAllConnections?.();
        await new Promise(listo => s.close(() => listo()));
      }
    },
  };
}
