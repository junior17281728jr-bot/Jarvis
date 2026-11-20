// 0.14.70: ElevenLabs, la voz natural de la academia (src/academia/voz-natural.js, voz-eleven.js, voz-preparar.js,
// voz-textos.js y src/api/voz-natural.js). Sin internet ni claves de verdad: un ElevenLabs FALSO en 127.0.0.1 y una clave
// falsa armada al correr. Lo que se prueba:
//  - sin clave, todo queda dormido (ni tareas ni red); con clave, cada texto se paga UNA vez y lo oyen todos gratis;
//  - el orden: uno guardado (de cualquiera) → ElevenLabs → ChatGPT → el teléfono (y «ChatGPT primero» si el dueño lo pide);
//  - sin crédito: ElevenLabs queda en pausa, se avisa y se sigue con ChatGPT; un 429 es una pausa corta;
//  - el tope de letras del mes nunca se pasa; la clave nunca llega al navegador, a la base ni a la consola;
//  - «Preparar todas las voces» respeta el tope, se detiene y sigue después (también tras un reinicio);
//  - nada personal se manda: solo textos del contenido compartido.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';
import { conInstructor, pedir, MUESTRA, NOMBRES } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { capturarConsola, buscarEnTodo } from './ia-base.js';
import { ponerChatGpt } from './fabrica-base.js';
import { abrirBase } from '../src/nucleo/db.js';
import { configDePrueba } from './ayuda.js';
import { guardarSecreto, anotarPrueba } from '../src/claves/almacen.js';
import { motivoElevenlabs, elevenlabs, VOCES_ELEVENLABS } from '../src/ia/proveedores/elevenlabs.js';
import { normalizarHabla, partirHabla, buscarTexto, indiceVoz, partesDeAlcance, LETRAS_PARTE } from '../src/academia/voz-textos.js';
import {
  apartarLetras, gastoVoz, guardarConfigVoz, leerConfigVoz, estadoEleven, buscarGuardada, varianteDe, archivoEleven, guardarAudio,
} from '../src/academia/voz-natural.js';
import { crearManejadorPreparar, empezarPreparar, leerPreparar } from '../src/academia/voz-preparar.js';
import { guardarCredito, creditoQueQueda } from '../src/academia/voz-natural.js';
import { textoDeAviso } from '../src/canales/textos.js';
import { carpetaVoz } from '../src/academia/oral-voz.js';
import { paqueteActivo } from '../src/academia/paquetes.js';

// Una clave falsa con la forma de las de ElevenLabs (se arma al correr: ninguna clave vive en el código).
const CLAVE = ['sk', 'f0'.repeat(24)].join('_');
const ORAL = paqueteOralMuestra();
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(400, 7)]);

// El ElevenLabs falso: cada pedido de voz toma la siguiente escena ('ok' si no hay).
async function crearElevenFalso() {
  const peticiones = [];
  const escenas = [];
  let suscripcion = { character_count: 1000, character_limit: 100_000, next_character_count_reset_unix: 1_800_000_000 };
  const servidor = createServer((req, res) => {
    const partes = [];
    req.on('data', p => partes.push(p));
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      const cuerpo = texto ? JSON.parse(texto) : null;
      peticiones.push({ metodo: req.method, ruta: req.url, cabeceras: req.headers, cuerpo });
      const json = (status, x, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...extra }); res.end(JSON.stringify(x)); };
      if (req.method === 'GET' && req.url === '/v1/user/subscription') return json(200, suscripcion);
      if (req.method === 'POST' && req.url.startsWith('/v1/text-to-speech/')) {
        const e = escenas.shift() ?? 'ok';
        if (e === 'ok') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(MP3); }
        if (e === 'sin_credito') return json(401, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota.' } });
        if (e === 'clave_mala') return json(401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } });
        if (e === 'espera') return json(429, { detail: { status: 'too_many_concurrent_requests', message: 'Too many' } }, { 'retry-after': '30' });
        if (e === 'enorme') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(500_000, 1)])); }
        if (e === 'eco') return json(400, { detail: { status: 'bad', message: `key ${req.headers['xi-api-key']}` } });
      }
      return json(404, { detail: { status: 'not_found' } });
    });
  });
  await new Promise(listo => servidor.listen(0, '127.0.0.1', listo));
  return {
    base: `http://127.0.0.1:${servidor.address().port}`, peticiones, voces: () => peticiones.filter(p => p.ruta.startsWith('/v1/text-to-speech/')),
    siguiente: (...e) => escenas.push(...e), ponerSuscripcion: s => { suscripcion = s; },
    cerrar: () => new Promise(listo => servidor.close(listo)),
  };
}

async function conVoz(fn, opciones = {}) {
  const eleven = await crearElevenFalso();
  try {
    await conInstructor(async c => fn({ ...c, eleven }), { ...opciones, bases: { elevenlabs: eleven.base } });
  } finally { await eleven.cerrar(); }
}
const ponerClave = (c, { valor = CLAVE } = {}) => {
  const id = guardarSecreto(c.db, c.config, { uso: 'voz_elevenlabs', valor, usuarioId: c.adminId }).secreto.id;
  anotarPrueba(c.db, { id, motivo: 'ok' });
  return id;
};
async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(ORAL) });
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
// Textos de la clase de muestra (lo compartido).
const TEXTOS = MUESTRA.materias.flatMap(m => m.temas.flatMap(t => t.secciones.map(s => s.texto))).filter(Boolean);
const leerVoz = (c, galleta, textos) => pedir(c.base, 'POST', '/api/academia/lectura/voz', { galleta, datos: { textos } });
const tareasVoz = (c, uso = 'lectura_voz') => c.db.prepare(`SELECT id, datos, resultado FROM tareas WHERE datos LIKE '%"uso":"${uso}"%' ORDER BY id`).all();

test('el adaptador: el «sin crédito» de ElevenLabs llega como 401 y se reconoce por el cuerpo; 429 espera; la suscripción', () => {
  assert.equal(motivoElevenlabs(401, { detail: { status: 'quota_exceeded' } }), 'sin_credito');
  assert.equal(motivoElevenlabs(401, { detail: { status: 'invalid_api_key' } }), 'clave_no_valida');
  assert.equal(motivoElevenlabs(401, { detail: { status: 'missing_permissions' } }), 'sin_permiso');
  assert.equal(motivoElevenlabs(401, { detail: { status: 'detected_unusual_activity' } }), 'sin_permiso');
  assert.equal(motivoElevenlabs(401, null), 'clave_no_valida');
  assert.equal(motivoElevenlabs(402, null), 'sin_credito');
  assert.equal(motivoElevenlabs(429, { detail: { status: 'too_many_concurrent_requests' } }), 'limite_proveedor');
  assert.equal(motivoElevenlabs(400, { detail: { status: 'voice_not_found' } }), 'voz_no_existe');
  assert.equal(motivoElevenlabs(422, { detail: [{ msg: 'x' }] }), 'pedido_no_valido');
  assert.equal(motivoElevenlabs(503, null), 'error_proveedor');
  const p = elevenlabs.pedidoVoz({ vozId: VOCES_ELEVENLABS[0].id, modelo: 'eleven_multilingual_v2', texto: 'Hola', idioma: 'es' });
  assert.match(p.ruta, /^\/v1\/text-to-speech\/[A-Za-z0-9]+\?output_format=mp3_22050_32$/);
  assert.equal(p.cuerpo.language_code, undefined, 'el multilingüe no lleva idioma');
  assert.equal(elevenlabs.pedidoVoz({ vozId: VOCES_ELEVENLABS[0].id, modelo: 'eleven_flash_v2_5', texto: 'Hi', idioma: 'en' }).cuerpo.language_code, 'en');
  assert.deepEqual(elevenlabs.cabeceras('x')['xi-api-key'], 'x');
  const s = elevenlabs.leerSuscripcion({ status: 200, json: { character_count: 10, character_limit: 100, next_character_count_reset_unix: 1_800_000_000 }, cabeceras: {} });
  assert.deepEqual(s.credito, { usados: 10, limite: 100, reinicio: new Date(1_800_000_000_000).toISOString() });
  assert.deepEqual(elevenlabs.leerSuscripcion({ status: 401, json: { detail: { status: 'missing_permissions' } }, cabeceras: {} }), { motivo: 'ok', credito: null }, 'una clave limitada no es una clave mala');
});

test('los textos: se limpian igual, se parten en frases de hasta 500 letras, y solo lo compartido está en la lista', () => {
  assert.equal(normalizarHabla('  **Hola**   mundo ✈️ '), 'Hola mundo');
  const largo = Array.from({ length: 40 }, (_, i) => `Esta es la frase número ${i} del texto largo.`).join(' ');
  const partes = partirHabla(largo);
  assert.ok(partes.length > 1 && partes.every(x => x.length <= LETRAS_PARTE));
  assert.equal(partes.join(' '), normalizarHabla(largo), 'las partes dicen exactamente el texto');
  // Los pedazos en que la pantalla parte una sección vieja (frases y viñetas) también se reconocen, pero «Preparar» no
  // los paga aparte (ya va el texto entero).
  const p = { materias: [{ temas: [{ titulo: 'Tema (Topic)', secciones: [{ titulo: 'Qué es', texto: 'Primera frase. Segunda frase.\n\n- Una viñeta' }] }] }], preguntas: new Map() };
  for (const x of ['Segunda frase.', 'Una viñeta', 'Tema', 'Tema (Topic)']) assert.ok(buscarTexto(p, x), x);
  assert.equal(buscarTexto(p, 'Algo que no está'), null);
  assert.deepEqual(partesDeAlcance(p, 'clases').map(x => x.texto).sort(), ['Primera frase. Segunda frase. - Una viñeta', 'Qué es', 'Tema'].sort());
});

test('sin clave de ElevenLabs (lo de hoy): nada cambia, ni una tarea ni un pedido a la red', async () => {
  await conVoz(async c => {
    const r = await leerVoz(c, c.z, [TEXTOS[0]]);
    assert.equal(r.codigo, 200);
    assert.deepEqual(r.datos.partes, [{ estado: 'no' }], 'sin ChatGPT ni ElevenLabs: la voz del teléfono');
    assert.equal(tareasVoz(c).length, 0);
    assert.equal(c.eleven.peticiones.length, 0);
    const admin = (await pedir(c.base, 'GET', '/api/admin/voz', { galleta: c.admin })).datos;
    assert.equal(admin.estado.estado, 'sin_clave');
    assert.equal((await pedir(c.base, 'GET', '/api/academia/lectura', { galleta: c.z })).datos.voz, false, 'por defecto, sin voz');
  });
});

test('con clave: cada texto se paga UNA vez (aunque lo pidan dos a la vez), se guarda y lo oyen todos gratis', async () => {
  await conVoz(async c => {
    ponerClave(c);
    guardarConfigVoz(c.db, { topeMes: 5000 });
    const [a, b] = await Promise.all([leerVoz(c, c.z, [TEXTOS[0]]), leerVoz(c, c.q, [TEXTOS[0]])]);
    assert.equal(a.datos.partes[0].estado, 'pendiente');
    assert.equal(b.datos.partes[0].estado, 'pendiente');
    const t = tareasVoz(c);
    assert.equal(t.length, 1, 'un solo audio para los dos');
    const d = JSON.parse(t[0].datos);
    assert.equal(d.texto, normalizarHabla(TEXTOS[0]));
    for (const n of NOMBRES) assert.ok(!t[0].datos.toLowerCase().includes(n), 'nada del alumno');
    const hecha = await c.hacer(t[0].id);
    assert.equal(hecha.resultado.proveedor, 'elevenlabs', JSON.stringify(hecha.resultado));
    const voces = c.eleven.voces();
    assert.equal(voces.length, 1);
    assert.equal(voces[0].cabeceras['xi-api-key'], CLAVE);
    assert.equal(voces[0].cuerpo.text, normalizarHabla(TEXTOS[0]));
    assert.equal(voces[0].cuerpo.model_id, 'eleven_multilingual_v2');
    assert.equal(gastoVoz(c.db).usados, normalizarHabla(TEXTOS[0]).length, 'las letras, en el tope del mes');
    // Ya guardada: para el otro alumno, gratis (sin tarea, sin red, sin letras).
    const otra = await leerVoz(c, c.q, [TEXTOS[0]]);
    assert.equal(otra.datos.partes[0].estado, 'lista');
    const archivo = otra.datos.partes[0].archivos[0];
    const audio = await fetch(`${c.base}/api/academia/lectura/archivo/${archivo}`, { headers: { 'X-Oportia': '1', Cookie: c.q } });
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Buffer.from(await audio.arrayBuffer()).subarray(0, 3).toString(), 'ID3');
    assert.equal(c.eleven.voces().length, 1);
    assert.equal(tareasVoz(c).length, 1);
    assert.equal(gastoVoz(c.db).usados, normalizarHabla(TEXTOS[0]).length, 'un audio guardado no cobra');
    // Aunque se quite la clave (o se acabe el crédito), lo guardado sigue sonando.
    c.db.prepare("UPDATE secretos SET pausa_motivo = 'sin_credito', pausa_desde = ?, pausa_hasta = NULL WHERE uso = 'voz_elevenlabs'").run(new Date().toISOString());
    assert.equal((await leerVoz(c, c.z, [TEXTOS[0]])).datos.partes[0].estado, 'lista');
    // Ni un archivo a medias.
    assert.ok(readdirSync(carpetaVoz(c.config)).every(n => /^[a-f0-9]{32}\.mp3$/.test(n)));
  });
});

test('nada personal se manda: un texto que no es del contenido compartido va con la voz del teléfono', async () => {
  await conVoz(async c => {
    ponerClave(c);
    const r = await leerVoz(c, c.z, ['Mi duda personal: soy zoelia y no entiendo la hipoxia', 'Lo que dije en el oral: 3000 pies', TEXTOS[1]]);
    assert.deepEqual(r.datos.partes.map(x => x.estado), ['no', 'no', 'pendiente']);
    for (const t of tareasVoz(c)) await c.hacer(t.id);
    const p = paqueteActivo(c.db, c.config);
    for (const v of c.eleven.voces()) {
      assert.ok(buscarTexto(p, v.cuerpo.text), `solo lo compartido: ${v.cuerpo.text}`);
      for (const n of NOMBRES) assert.ok(!v.cuerpo.text.toLowerCase().includes(n));
    }
    assert.equal(c.eleven.voces().length, 1);
    assert.equal((await pedir(c.base, 'POST', '/api/academia/lectura/voz', { galleta: c.z, datos: { textos: Array(13).fill('x') } })).codigo, 400, 'como mucho 12 de una vez');
  });
});

test('el orden: ElevenLabs antes que ChatGPT; «ChatGPT primero» si el dueño lo pide; uno guardado de ChatGPT no se paga otra vez', async () => {
  await conVoz(async c => {
    await subirOral(c);
    await ponerChatGpt({ db: c.db, config: c.config, admin: c.adminId, secretoId: c.secretoId }, { claudeBloqueada: false });
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    // 1) Sin ElevenLabs: ChatGPT hace la pregunta 0 (como en la 0.14.29).
    const v0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 0, idioma: 'en' } })).datos;
    assert.equal(v0.estado, 'pendiente');
    await c.hacer(tareasVoz(c, 'oral_voz').at(-1).id);
    const habla = () => c.falso.peticiones.filter(x => x.ruta === '/v1/audio/speech').length;
    assert.equal(habla(), 1);
    // 2) Con ElevenLabs: la pregunta 0 ya está (de ChatGPT): gratis, sin ElevenLabs.
    ponerClave(c);
    const ya = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 0, idioma: 'en' } })).datos;
    assert.deepEqual(ya, { estado: 'lista', archivo: v0.archivo });
    assert.equal(c.eleven.voces().length, 0);
    // 3) Una nueva: ElevenLabs primero.
    const v1 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 1, idioma: 'en' } })).datos;
    assert.equal(v1.estado, 'pendiente');
    const h1 = await c.hacer(tareasVoz(c, 'oral_voz').at(-1).id);
    assert.equal(h1.resultado.proveedor, 'elevenlabs');
    assert.equal(c.eleven.voces().length, 1);
    assert.equal(habla(), 1, 'ChatGPT no se usó');
    assert.equal(c.eleven.voces()[0].cuerpo.text, s0.preguntas[1].pregunta_en, 'solo la pregunta del libro');
    const lista = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 1, idioma: 'en' } })).datos;
    assert.equal(lista.estado, 'lista');
    assert.equal(lista.archivo, archivoEleven(varianteDe(leerConfigVoz(c.db)), s0.preguntas[1].pregunta_en));
    // 4) «ChatGPT primero».
    guardarConfigVoz(c.db, { primero: 'chatgpt' });
    await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 2, idioma: 'en' } });
    const h2 = await c.hacer(tareasVoz(c, 'oral_voz').at(-1).id);
    assert.equal(h2.resultado.proveedor, 'openai');
    assert.equal(c.eleven.voces().length, 1);
    // 5) Cambiar de voz no pierde lo hecho: la pregunta 1 (hecha con George) se sigue oyendo.
    guardarConfigVoz(c.db, { primero: 'elevenlabs', vozId: VOCES_ELEVENLABS[1].id });
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 1, idioma: 'en' } })).datos.estado, 'lista');
    assert.equal(c.eleven.voces().length, 1);
  });
});

test('sin crédito: ElevenLabs queda en pausa, se avisa (grave, también por Telegram), no se cobran las letras y sigue ChatGPT', async () => {
  await conVoz(async c => {
    await ponerChatGpt({ db: c.db, config: c.config, admin: c.adminId, secretoId: c.secretoId }, { claudeBloqueada: false });
    ponerClave(c);
    c.eleven.siguiente('sin_credito');
    assert.equal((await leerVoz(c, c.z, [TEXTOS[0]])).datos.partes[0].estado, 'pendiente');
    const h = await c.hacer(tareasVoz(c).at(-1).id);
    assert.equal(h.resultado.proveedor, 'openai', JSON.stringify(h.resultado));
    const s = c.db.prepare("SELECT pausa_motivo, pausa_hasta FROM secretos WHERE uso = 'voz_elevenlabs'").get();
    assert.equal(s.pausa_motivo, 'sin_credito');
    assert.equal(s.pausa_hasta, null, 'hasta que el dueño la reanude');
    const aviso = c.db.prepare("SELECT nivel, resuelto_en FROM avisos WHERE clave = 'ia_proveedor:elevenlabs'").get();
    assert.equal(aviso.nivel, 'grave');
    assert.equal(aviso.resuelto_en, null);
    assert.equal(gastoVoz(c.db).usados, 0, 'un «no» claro de ElevenLabs no gasta letras');
    assert.equal(estadoEleven(c.db, c.config).estado, 'sin_credito');
    // El texto que llega al dueño por Telegram nombra a ElevenLabs y el motivo (nunca la clave).
    const fila = c.db.prepare("SELECT * FROM avisos WHERE clave = 'ia_proveedor:elevenlabs'").get();
    const telegram = textoDeAviso(fila, 'es');
    assert.match(telegram, /ElevenLabs/);
    assert.ok(!telegram.includes(CLAVE));
    // Lo siguiente ya ni pregunta a ElevenLabs.
    await leerVoz(c, c.z, [TEXTOS[1]]);
    await c.hacer(tareasVoz(c).at(-1).id);
    assert.equal(c.eleven.voces().length, 1);
    assert.equal((await pedir(c.base, 'GET', '/api/admin/voz', { galleta: c.admin })).datos.estado.estado, 'sin_credito');
  });
});

test('un 429 de ElevenLabs es una pausa corta (lo que pide, entre 1 y 15 min); un audio enorme no se guarda', async () => {
  await conVoz(async c => {
    ponerClave(c);
    c.eleven.siguiente('espera');
    await leerVoz(c, c.z, [TEXTOS[0]]);
    const h = await c.hacer(tareasVoz(c).at(-1).id);
    assert.equal(h.resultado.motivo, 'limite_proveedor');
    const s = c.db.prepare("SELECT pausa_motivo, pausa_hasta FROM secretos WHERE uso = 'voz_elevenlabs'").get();
    assert.equal(s.pausa_motivo, 'limite_proveedor');
    const ms = Date.parse(s.pausa_hasta) - Date.now();
    assert.ok(ms > 20_000 && ms < 16 * 60_000, `pausa de ${ms} ms`);
    // Ya se intentó esta hora y no salió: la pantalla no espera en vano (la voz del teléfono), y no se pide otra vez.
    assert.deepEqual((await leerVoz(c, c.z, [TEXTOS[0]])).datos.partes, [{ estado: 'no' }]);
    assert.equal(tareasVoz(c).length, 1);
    c.db.prepare("UPDATE secretos SET pausa_motivo = NULL, pausa_desde = NULL, pausa_hasta = NULL WHERE uso = 'voz_elevenlabs'").run();
    c.eleven.siguiente('enorme');
    await leerVoz(c, c.z, [TEXTOS[2]]);
    const h2 = await c.hacer(tareasVoz(c).at(-1).id);
    assert.equal(h2.resultado.usada, false);
    assert.equal(buscarGuardada(c.db, c.config, { texto: normalizarHabla(TEXTOS[2]) }), null, 'nada guardado');
  });
});

test('el tope de letras del mes nunca se pasa (ni con dos a la vez); con el tope lleno, la voz del teléfono', async () => {
  const db = abrirBase(configDePrueba());
  try {
    guardarConfigVoz(db, { topeMes: 100 });
    assert.equal(apartarLetras(db, { letras: 60 }).ok, true);
    assert.deepEqual(apartarLetras(db, { letras: 60 }), { ok: false, motivo: 'tope_voz' });
    assert.equal(apartarLetras(db, { letras: 40 }).ok, true);
    assert.equal(gastoVoz(db).usados, 100);
    assert.equal(apartarLetras(db, { letras: 1 }).ok, false);
  } finally { db.close(); }
  await conVoz(async c => {
    ponerClave(c);
    guardarConfigVoz(c.db, { topeMes: 10 });
    assert.deepEqual((await leerVoz(c, c.z, [TEXTOS[0]])).datos.partes, [{ estado: 'no' }], 'no cabe: el teléfono');
    assert.equal(tareasVoz(c).length, 0);
    guardarConfigVoz(c.db, { topeMes: 0 });
    assert.equal(estadoEleven(c.db, c.config).estado, 'tope_lleno');
    assert.equal(c.eleven.voces().length, 0);
  });
});

test('la clave de ElevenLabs nunca llega al navegador, a la base sin cifrar, a una tarea ni a la consola', async () => {
  await conVoz(async c => {
    // Por la ruta del dueño, como lo hará Junior (pide su contraseña otra vez).
    const g = await pedir(c.base, 'POST', '/api/admin/claves', { galleta: c.admin, datos: { uso: 'voz_elevenlabs', valor: CLAVE, clave: 'una clave bien larga' }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } });
    assert.equal(g.codigo, 201, JSON.stringify(g.datos));
    assert.equal(g.datos.prueba.motivo, 'ok', 'la prueba gratis (la suscripción) pasó');
    assert.equal(c.eleven.peticiones.filter(p => p.ruta === '/v1/user/subscription').length, 1);
    assert.ok(!JSON.stringify(g.datos).includes(CLAVE));
    const consola = await capturarConsola(async () => {
      await leerVoz(c, c.z, [TEXTOS[0]]);
      await c.hacer(tareasVoz(c).at(-1).id);
      c.eleven.siguiente('eco');
      await leerVoz(c, c.z, [TEXTOS[1]]);
      await c.hacer(tareasVoz(c).at(-1).id);
    });
    assert.ok(!consola.includes(CLAVE));
    for (const ruta of ['/api/admin/voz', '/api/admin/claves']) {
      const r = await pedir(c.base, 'GET', ruta, { galleta: c.admin, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } });
      assert.equal(r.codigo, 200, ruta);
      assert.ok(!JSON.stringify(r.datos).includes(CLAVE), ruta);
      assert.ok(!JSON.stringify(r.datos).includes(CLAVE.slice(3, 20)), ruta);
    }
    assert.deepEqual(buscarEnTodo(c.db, c.config, CLAVE), []);
    // Una respuesta que trae la clave: ElevenLabs queda en pausa del dueño y no se guarda nada de ella.
    assert.equal(c.db.prepare("SELECT pausa_motivo FROM secretos WHERE uso = 'voz_elevenlabs' AND estado = 'activa'").get().pausa_motivo, 'eco_de_clave');
    assert.equal((await pedir(c.base, 'GET', '/api/admin/voz', { galleta: c.z })).codigo, 403, 'solo el administrador');
  });
});

test('«Preparar todas las voces»: dice antes cuántas letras son, respeta el tope, se detiene, y sigue sin pagar dos veces', async () => {
  await conVoz(async c => {
    await subirOral(c);
    ponerClave(c);
    const est = (await pedir(c.base, 'GET', '/api/admin/voz', { galleta: c.admin })).datos.estimado;
    assert.ok(est.oral.partes > 3 && est.oral.letras > 0 && est.oral.faltan === est.oral.partes);
    assert.ok(est.clases.letras > est.oral.letras, 'las clases son más');
    const p = paqueteActivo(c.db, c.config);
    const preguntas = [...indiceVoz(p).porTexto].filter(([, e]) => e.ambito === 'oral').map(([t]) => t);
    // Un tope que deja hacer solo las 2 primeras.
    guardarConfigVoz(c.db, { topeMes: preguntas[0].length + preguntas[1].length });
    const r = await pedir(c.base, 'POST', '/api/admin/voz/preparar', { galleta: c.admin, datos: { alcance: 'oral' } });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.preparar.estado, 'en_curso');
    assert.equal((await pedir(c.base, 'POST', '/api/admin/voz/preparar', { galleta: c.admin, datos: { alcance: 'oral' } })).codigo, 409, 'una a la vez');
    const tarea = () => c.db.prepare("SELECT id FROM tareas WHERE tipo = 'academia.voces' ORDER BY id DESC").get();
    await c.hacer(tarea().id);
    let st = leerPreparar(c.db);
    assert.equal(st.estado, 'en_pausa');
    assert.equal(st.motivo, 'tope_voz');
    assert.equal(st.hechos, 2);
    assert.equal(c.eleven.voces().length, 2);
    assert.ok(gastoVoz(c.db).usados <= leerConfigVoz(c.db).topeMes, 'nunca pasa el tope');
    // Más tope y «Seguir»: termina, sin repetir las 2 primeras.
    guardarConfigVoz(c.db, { topeMes: 1_000_000 });
    assert.equal((await pedir(c.base, 'POST', '/api/admin/voz/preparar', { galleta: c.admin, datos: { accion: 'seguir' } })).datos.preparar.estado, 'en_curso');
    for (let k = 0; k < 20 && leerPreparar(c.db).estado === 'en_curso'; k++) {
      const id = tarea().id;
      c.db.prepare("UPDATE tareas SET disponible_en = ? WHERE id = ?").run(new Date(0).toISOString(), id);
      await c.hacer(id);
    }
    st = leerPreparar(c.db);
    assert.equal(st.estado, 'lista', JSON.stringify(st));
    const hechas = c.eleven.voces().map(v => v.cuerpo.text);
    assert.equal(new Set(hechas).size, hechas.length, 'ningún audio se pagó dos veces');
    assert.equal(hechas.length, st.total);
    // Ahora el oral entero suena con ElevenLabs aunque se acabe el crédito.
    c.db.prepare("UPDATE secretos SET estado = 'desactivada' WHERE uso = 'voz_elevenlabs'").run();
    for (const t of preguntas) assert.ok(buscarGuardada(c.db, c.config, { texto: t })?.proveedor === 'elevenlabs');
  });
});

test('«Preparar» sigue donde iba después de un reinicio (lo hecho queda anotado después de cada audio)', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    const paquete = { materias: [], preguntas: new Map(), oral: { materias: [{ id: 'm', temas: [{ id: 't', libro_qa: Array.from({ length: 5 }, (_, i) => ({ pregunta_en: `Question number ${i} about the airplane?` })) }] }], preguntas: new Map() } };
    empezarPreparar(db, config, paquete, { alcance: 'oral' });
    const tarea = { datos: { id: leerPreparar(db).id } };
    const pedidos = [];
    let caer = 2;
    const grabar = async (_ctx, { texto }) => {
      if (caer-- === 0) throw new Error('se fue la luz');
      pedidos.push(texto);
      guardarAudio(config, archivoEleven(varianteDe(leerConfigVoz(db)), texto), MP3);
      return { motivo: 'ok', letras: texto.length };
    };
    const ctx = { db, config, tarea, escribir: async fn => fn(), senal: null };
    const m = crearManejadorPreparar({ grabar });
    await assert.rejects(m.paso(ctx), /se fue la luz/);
    assert.equal(leerPreparar(db).hechos, 2);
    const r = await m.paso(ctx);
    assert.equal(r.listo, true);
    assert.equal(leerPreparar(db).estado, 'lista');
    assert.equal(pedidos.length, 5);
    assert.equal(new Set(pedidos).size, 5, 'ninguno dos veces');
  } finally { db.close(); }
});

test('la preferencia «Con voz / Sin voz» se guarda en el servidor, por alumno', async () => {
  await conVoz(async c => {
    assert.equal((await pedir(c.base, 'POST', '/api/academia/lectura/preferencia', { galleta: c.z, datos: { voz: true } })).datos.voz, true);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/lectura', { galleta: c.z })).datos.voz, true);
    assert.equal((await pedir(c.base, 'GET', '/api/academia/lectura', { galleta: c.q })).datos.voz, false, 'la del otro no cambia');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/lectura/preferencia', { galleta: c.z, datos: { voz: 'si' } })).codigo, 400);
  });
});

test('las pantallas: sin innerHTML ni estilos en línea, y la voz del teléfono siempre queda', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['../public/voz-lectura.js', '../public/admin-voz.js']) {
    const texto = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(texto, /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|[{,]\s*style\s*:/, f);
  }
  assert.match(readFileSync(new URL('../public/voz-lectura.js', import.meta.url), 'utf8'), /if \(!sono && sigue\(\)\) await telefono\(/);
});

test('la foto del crédito: una vieja (o de antes de que ElevenLabs renueve) ya no deja a ElevenLabs parado', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  try {
    const ahora = Date.now();
    guardarCredito(db, { usados: 10_000, limite: 10_000, reinicio: new Date(ahora + 86_400_000).toISOString() }, { ahora });
    assert.equal(creditoQueQueda(db, { ahora }), 0);
    assert.deepEqual(apartarLetras(db, { letras: 5, ahora }), { ok: false, motivo: 'sin_credito' });
    assert.equal(creditoQueQueda(db, { ahora: ahora + 7 * 3_600_000 }), null, 'de hace más de 6 horas: no se sabe');
    guardarCredito(db, { usados: 10_000, limite: 10_000, reinicio: new Date(ahora - 1000).toISOString() }, { ahora });
    assert.equal(creditoQueQueda(db, { ahora }), null, 'ya renovó: no se sabe');
    assert.equal(apartarLetras(db, { letras: 5, ahora }).ok, true);
  } finally { db.close(); }
});

test('«Probar la voz» (dueño): la frase se hace con ElevenLabs, se guarda, cuenta sus letras, y otra voz hace otra muestra', async () => {
  await conVoz(async c => {
    assert.equal((await pedir(c.base, 'POST', '/api/admin/voz/muestra', { galleta: c.admin, datos: {} })).datos.estado, 'no', 'sin clave');
    ponerClave(c);
    const muestra = () => pedir(c.base, 'POST', '/api/admin/voz/muestra', { galleta: c.admin, datos: {} });
    assert.equal((await muestra()).datos.estado, 'pendiente');
    await c.hacer(tareasVoz(c).at(-1).id);
    const lista = (await muestra()).datos;
    assert.equal(lista.estado, 'lista');
    assert.equal(c.eleven.voces().length, 1);
    assert.ok(gastoVoz(c.db).usados > 0);
    guardarConfigVoz(c.db, { vozId: VOCES_ELEVENLABS[2].id });
    assert.equal((await muestra()).datos.estado, 'pendiente', 'otra voz, otra muestra');
    await c.hacer(tareasVoz(c).at(-1).id);
    const otra = (await muestra()).datos;
    assert.equal(otra.estado, 'lista');
    assert.notEqual(otra.archivo, lista.archivo);
    assert.equal(c.eleven.voces().length, 2);
    assert.equal(c.eleven.voces()[1].ruta.split('?')[0], `/v1/text-to-speech/${VOCES_ELEVENLABS[2].id}`);
    assert.equal((await pedir(c.base, 'POST', '/api/admin/voz/muestra', { galleta: c.z, datos: {} })).codigo, 403);
  });
});
