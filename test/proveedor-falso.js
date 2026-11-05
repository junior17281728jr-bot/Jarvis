// Un proveedor de IA FALSO para las pruebas (no es un archivo *.test.js). Imita las respuestas de Anthropic y de OpenAI
// en 127.0.0.1 (puerto al azar), así ninguna prueba usa nunca una API de verdad ni una clave de verdad.
//   const falso = await crearProveedorFalso();
//   config.iaBases = { anthropic: falso.base, openai: falso.base }   (o OPORTIA_IA_URL_ANTHROPIC para un proceso hijo)
//   falso.siguiente('sin_credito_400', { tipo: 'lento', ms: 200 })   cada pedido toma la siguiente escena (si no hay: 'ok')
//   falso.peticiones   cada pedido recibido (método, ruta, cabeceras, cuerpo), para revisar qué llegó
//   falso.segundo.peticiones   lo que llegó al SEGUNDO servidor (127.0.0.2), adonde apunta la escena 'redirige'
// Rutas: POST /v1/messages, POST /v1/messages/count_tokens (Anthropic), POST /v1/responses, GET /v1/models/:id (OpenAI).
import { createServer } from 'node:http';

export const ESCENAS = Object.freeze([
  'ok', 'refusal', 'max_tokens', 'incomplete', 'content_filter', 'failed', 'status', 'limite_gasto_400', 'sin_credito_400',
  'sin_credito_texto', 'otro_400', 'limite_tope_429', 'limite_429', 'sin_credito_openai', 'insufficient_quota', 'redirige',
  'geo_us', 'uso_raro', 'uso_raro_herramienta', 'nunca', 'lento', 'json_roto', 'enorme', 'sin_uso', 'uso_enorme', 'cortar', 'eco_clave',
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

export async function crearProveedorFalso({ respuestaJson = { listo: true } } = {}) {
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
    if (escena.tipo === 'uso_raro') { uso.cache_creation_input_tokens = 50; uso.cache_creation = { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 50 }; }
    if (escena.tipo === 'uso_raro_herramienta') uso.server_tool_use = { web_search_requests: 1 };
    if (escena.tipo === 'uso_enorme') { uso.input_tokens = 5_000_000; uso.output_tokens = 900_000; }
    const content = [];
    if (escena.pensar !== false) content.push({ type: 'thinking', thinking: '', signature: 'firma_falsa' });
    let stop = 'end_turn';
    if (escena.tipo === 'refusal') stop = 'refusal';
    else if (escena.tipo === 'max_tokens') stop = 'max_tokens';
    else content.push({ type: 'text', text: escena.texto ?? JSON.stringify(escena.json ?? respuestaJson) });
    const cuerpo = { id: `msg_falso_${numero}`, type: 'message', role: 'assistant', model: cuerpoPedido?.model ?? 'claude-haiku-5-5', content, stop_reason: stop, stop_details: null, usage: uso };
    if (escena.tipo === 'sin_uso') delete cuerpo.usage;
    return cuerpo;
  }

  function okOpenai(escena, cuerpoPedido) {
    const uso = { input_tokens: 2000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 500, output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 2500, ...(escena.uso ?? {}) };
    if (escena.tipo === 'uso_enorme') { uso.input_tokens = 5_000_000; uso.output_tokens = 900_000; }
    const cuerpo = {
      id: `resp_falso_${numero}`, object: 'response', status: 'completed', model: cuerpoPedido?.model ?? 'gpt-6-luna', service_tier: 'default',
      output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: escena.texto ?? JSON.stringify(escena.json ?? respuestaJson) }] }],
      usage: uso,
    };
    if (escena.tipo === 'refusal') cuerpo.output[1].content = [{ type: 'refusal', refusal: 'no' }];
    if (escena.tipo === 'incomplete' || escena.tipo === 'max_tokens') { cuerpo.status = 'incomplete'; cuerpo.incomplete_details = { reason: 'max_output_tokens' }; }
    if (escena.tipo === 'content_filter') { cuerpo.status = 'incomplete'; cuerpo.incomplete_details = { reason: 'content_filter' }; }
    if (escena.tipo === 'failed') { cuerpo.status = 'failed'; cuerpo.error = { code: 'server_error', message: 'falso' }; }
    if (escena.tipo === 'sin_uso') delete cuerpo.usage;
    return cuerpo;
  }

  async function responder(escena, req, res, ruta, cuerpoPedido) {
    const esOpenai = ruta.startsWith('/v1/responses') || ruta.startsWith('/v1/models');
    const esPrueba = ruta === '/v1/messages/count_tokens' || ruta.startsWith('/v1/models');
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
      case 'eco_clave': {
        // Un proveedor que devuelve la clave que recibió dentro de su mensaje de error: OPORTIA nunca debe guardarlo.
        const recibida = String(req.headers['x-api-key'] ?? req.headers.authorization ?? '');
        return enviar(res, 401, esOpenai ? errorOpenai(`Incorrect API key provided: ${recibida}`, 'invalid_request_error', 'invalid_api_key') : errorAnthropic(401, `invalid x-api-key: ${recibida}`), id);
      }
      default: break;
    }
    if (esPrueba) {
      if (ruta.startsWith('/v1/models')) return enviar(res, 200, { id: decodeURIComponent(ruta.slice('/v1/models/'.length)), object: 'model', owned_by: 'openai' }, id);
      return enviar(res, 200, { input_tokens: 9 }, id);
    }
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
