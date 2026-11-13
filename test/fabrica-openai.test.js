// 0.14.2: ChatGPT (OpenAI) y la «API propia» como proveedores de la IA. Sin red de verdad: proveedor falso en 127.0.0.1,
// claves falsas armadas al correr y reloj fijo. El caso del dueño: la clave de Claude espera la verificación de identidad
// y ChatGPT termina todo (Test Guide y oral TAL CUAL).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validarValor, guardarSecreto } from '../src/claves/almacen.js';
import { probarSecreto } from '../src/claves/probar.js';
import { leerConfigIa, guardarConfigIa, basePropiaValida } from '../src/ia/config.js';
import { elegirPorDefecto, modelosVistos } from '../src/ia/modelos.js';
import { precioPara, guardarPrecioPropio, precioPorDefecto, reservaMicro } from '../src/ia/precios.js';
import { elegirProveedor, modelosDe, maximoDe } from '../src/ia/presupuesto.js';
import { PROPOSITOS } from '../src/ia/propositos.js';
import { esquemaEstricto, openai } from '../src/ia/proveedores/openai.js';
import { ESQUEMAS, ESQUEMAS_PROFUNDA } from '../src/academia/fabrica-prompts.js';
import { ESQUEMAS_ORAL } from '../src/academia/fabrica-oral.js';
import { crearClienteIA } from '../src/ia/cliente.js';
import { enTransaccion } from '../src/nucleo/db.js';
import { estadoMateria, tgAlterado, guardarConfigFabrica, puedeLlamar } from '../src/academia/fabrica.js';
import { carpetaAcademia } from '../src/academia/paquetes.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { preparar, claveOpenai, claveAnthropic, T0 } from './ia-base.js';
import { conFabrica, TG, ORAL, ponerChatGpt } from './fabrica-base.js';

const cuerpoDe = p => (typeof p.cuerpo === 'string' ? JSON.parse(p.cuerpo) : p.cuerpo);
const leerPaquete = (db, config, id) => {
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(id);
  return JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json'), 'utf8'));
};

test('la clave de ChatGPT: sk-… y sk-proj-… sirven; una de Claude o de administrador, no; la API propia acepta la suya', () => {
  assert.ok(validarValor('ia_openai', claveOpenai()));
  assert.ok(validarValor('ia_openai', ['sk', `prueba${'q'.repeat(40)}`].join('-')));
  assert.throws(() => validarValor('ia_openai', claveAnthropic()), e => e.clave === 'clave_otro_proveedor');
  assert.throws(() => validarValor('ia_openai', ['sk', 'admin', 'x'.repeat(30)].join('-')), e => e.clave === 'clave_admin');
  assert.throws(() => validarValor('ia_openai', 'hola'), e => e.clave === 'clave_formato');
  assert.ok(validarValor('ia_propia', `mi-clave-${'k'.repeat(30)}`));
  assert.throws(() => validarValor('ia_propia', claveAnthropic()), e => e.clave === 'clave_otro_proveedor');
  // La dirección de la API propia: solo https a un nombre público (nunca una IP, un nombre local ni un puerto).
  assert.equal(basePropiaValida('https://api.mi-ia.com/v1/'), 'https://api.mi-ia.com/v1');
  for (const mala of ['http://api.mi-ia.com/v1', 'https://10.0.0.5/v1', 'https://localhost/v1', 'https://api.mi-ia.com:8443/v1', 'https://u:p@api.mi-ia.com', 'https://maquina.ts.net/v1', 'https://x.com/v1?k=1']) {
    assert.equal(basePropiaValida(mala), null, mala);
  }
});

test('«Probar (gratis)» de ChatGPT: GET /v1/models (nunca /v1/responses), guarda la lista y elige solos los modelos', async () => {
  const falso = await crearProveedorFalso();
  const { db, config, admin } = preparar({ iaBases: { openai: falso.base } });
  try {
    const id = guardarSecreto(db, config, { uso: 'ia_openai', valor: claveOpenai(), usuarioId: admin, ahora: T0 }).secreto.id;
    const r = await probarSecreto(db, config, { id, usuarioId: admin, ahora: () => T0 });
    assert.equal(r.motivo, 'ok');
    assert.deepEqual(falso.peticiones.map(p => [p.metodo, p.ruta]), [['GET', '/v1/models']]);
    assert.ok(falso.peticiones[0].cabeceras.authorization.startsWith('Bearer sk-proj-'));
    assert.ok(modelosVistos(db, 'openai').modelos.includes('gpt-6-mini'));
    const p = leerConfigIa(db).proveedores.openai;
    assert.deepEqual([p.modeloEscribir, p.modelo, p.modeloImagen], ['gpt-6', 'gpt-6-mini', 'gpt-image-2'], 'el general más nuevo, el mini, el de imagen (nunca «pro»)');
    // Una clave mala: 401 → clave_no_valida, y la lista no cambia.
    falso.siguiente({ tipo: 'status', status: 401 });
    assert.equal((await probarSecreto(db, config, { id, usuarioId: admin, ahora: () => T0 })).motivo, 'clave_no_valida');
    // El admin elige otro de la lista (y se queda: una prueba nueva no lo cambia).
    guardarConfigIa(db, { modelos: { openai: { modeloEscribir: 'gpt-5-mini' } } }, { config, usuarioId: admin, ahora: T0 });
    await probarSecreto(db, config, { id, usuarioId: admin, ahora: () => T0 });
    assert.equal(leerConfigIa(db).proveedores.openai.modeloEscribir, 'gpt-5-mini');
    assert.throws(() => guardarConfigIa(db, { modelos: { openai: { modelo: 'nombre raro con espacios' } } }, { config, usuarioId: admin, ahora: T0 }));
  } finally { db.close(); await falso.cerrar(); }
});

test('elegir modelos por el nombre: nada adivinado, y sin lista no hay modelo (no se gasta)', () => {
  assert.deepEqual(elegirPorDefecto(['gpt-4o', 'gpt-4o-mini', 'o3', 'dall-e-3']), { modeloEscribir: 'gpt-4o', modelo: 'gpt-4o-mini', modeloImagen: null }, 'dall-e no: el pedido de imagen es de gpt-image');
  assert.deepEqual(elegirPorDefecto(['gpt-7-2027-01-01', 'gpt-7', 'gpt-7-pro', 'gpt-7-nano']), { modeloEscribir: 'gpt-7', modelo: 'gpt-7-nano', modeloImagen: null });
  assert.deepEqual(elegirPorDefecto([]), { modeloEscribir: null, modelo: null, modeloImagen: null });
  assert.equal(elegirPorDefecto(['Llama-4-70B', 'llama-mini'], { proveedor: 'propia' }).modelo, 'llama-mini');
  assert.equal(leerConfigIa({ prepare: () => ({ get: () => null }) }).proveedores.openai.modelo, null, 'por defecto ningún modelo de ChatGPT');
  assert.equal(precioPara(null, 'openai', null), null);
});

test('la tabla de precios del dueño: por defecto conservador por el nombre; editada, el costo sale de ella', async () => {
  assert.deepEqual(precioPorDefecto('gpt-6-mini'), { entrada: '0.50', cacheLectura: '0.05', salida: '4.00' });
  assert.equal(precioPorDefecto('gpt-6-pro').salida, '160.00');
  const falso = await crearProveedorFalso({ respuestaJson: { listo: true } });
  const base = preparar({ iaBases: { anthropic: falso.base, openai: falso.base } });
  const { db, config, admin } = base;
  try {
    await ponerChatGpt(base);
    assert.equal(precioPara(db, 'openai', 'gpt-6').porDefecto, true);
    guardarPrecioPropio(db, { proveedor: 'openai', modelo: 'gpt-6-mini', precio: { entrada: '1,00', cacheLectura: '0.10', salida: '8.00' }, ahora: T0 });
    assert.equal(precioPara(db, 'openai', 'gpt-6-mini').porDefecto, false);
    assert.throws(() => guardarPrecioPropio(db, { proveedor: 'openai', modelo: 'gpt-6-mini', precio: { entrada: 'gratis', cacheLectura: '0', salida: '1' } }));
    const escribir = async trabajo => enTransaccion(db, trabajo);
    const ia = crearClienteIA({ db, config, escritor: { escribir }, reloj: () => T0, registro: { error() {} } });
    // Un uso del instructor con Haiku (barato) → el modelo barato de ChatGPT: 2 000 tokens × US$1 + 500 × US$8 = 6 000 µUSD.
    const r = await ia.pedir({ proposito: 'mejora_verificar', paso: 'x', sistema: 'Reglas.', texto: 'Revisa.', esquema: null });
    assert.equal(r.usada, true, JSON.stringify(r));
    assert.deepEqual([r.proveedor, r.modelo, r.costoMicro], ['openai', 'gpt-6-mini', 6000]);
    const cuerpo = cuerpoDe(falso.peticiones.at(-1));
    assert.equal(falso.peticiones.at(-1).ruta, '/v1/responses');
    assert.equal(cuerpo.store, false);
    assert.equal(db.prepare('SELECT costo_micro FROM ia_llamadas WHERE id = ?').get(r.llamadaId).costo_micro, 6000);
    void admin;
  } finally { db.close(); await falso.cerrar(); }
});

test('quién escribe: «el que funcione» prefiere Claude; si Claude no funciona, ChatGPT; y Claude REVISA lo que escribe ChatGPT', async () => {
  const falso = await crearProveedorFalso();
  const base = preparar({ iaBases: { anthropic: falso.base, openai: falso.base } });
  const { db, config, admin, secretoId } = base;
  try {
    await ponerChatGpt(base, { claudeBloqueada: false });
    const cfg = () => leerConfigIa(db);
    const elige = prop => elegirProveedor(db, config, cfg(), T0, modelosDe(PROPOSITOS[prop], cfg()), PROPOSITOS[prop]);
    assert.equal(cfg().preferido, 'auto');
    assert.deepEqual([elige('fabrica_escribir').proveedor, elige('fabrica_escribir').modelo], ['anthropic', 'claude-sonnet-5-5']);
    guardarConfigIa(db, { preferido: 'openai' }, { config, usuarioId: admin, ahora: T0 });
    assert.deepEqual([elige('fabrica_escribir').proveedor, elige('fabrica_escribir').modelo], ['openai', 'gpt-6']);
    assert.deepEqual([elige('fabrica_verificar').proveedor, elige('fabrica_verificar').modelo], ['anthropic', 'claude-haiku-5-5'], 'revisión cruzada');
    assert.equal(elige('dibujo_generar').proveedor, 'openai', 'solo ChatGPT dibuja');
    assert.equal(elige('dibujo_revisar').proveedor, 'anthropic', 'Claude mira el dibujo');
    // Sin Claude: ChatGPT se revisa a sí mismo con su modelo barato; mirar un dibujo no se puede (no se usa).
    db.prepare("UPDATE secretos SET prueba = 'verificacion_identidad' WHERE id = ?").run(secretoId);
    assert.deepEqual([elige('fabrica_verificar').proveedor, elige('fabrica_verificar').modelo], ['openai', 'gpt-6-mini']);
    assert.equal(elige('dibujo_revisar').ok, false);
    guardarConfigIa(db, { preferido: 'auto', orden: ['openai', 'anthropic', 'propia'] }, { config, usuarioId: admin, ahora: T0 });
    assert.equal(elige('instructor_tarjeta').proveedor, 'openai', 'los alumnos también usan el que funciona');
    assert.throws(() => guardarConfigIa(db, { orden: ['openai', 'openai', 'propia'] }, { config, usuarioId: admin, ahora: T0 }));
  } finally { db.close(); await falso.cerrar(); }
});

test('el tope de UNA vez con otro precio: sale de su precio, sin pasar del techo; nunca deja un paso «fallido» por el precio', async () => {
  const def = PROPOSITOS.fabrica_verificar;
  const barato = precioPara(null, 'openai', 'gpt-6-mini');
  const e = { proveedor: 'openai', precio: barato };
  assert.ok(maximoDe(def, e) > def.maximoMicro, 'con el precio por defecto de un mini, más que el de Haiku');
  assert.ok(maximoDe(def, e) <= def.techoMicro);
  assert.ok(reservaMicro(barato, { entradaMax: def.entradaMaxBytes + 200, salidaMax: def.salidaMax }) <= maximoDe(def, e), 'la lectura más larga cabe');
  assert.equal(maximoDe(def, { proveedor: 'anthropic', precio: barato }), def.maximoMicro);
  const falso = await crearProveedorFalso();
  const base = preparar({ iaBases: { anthropic: falso.base, openai: falso.base }, tope: 50_000_000 });
  try {
    await ponerChatGpt(base);
    const { db, config } = base;
    guardarPrecioPropio(db, { proveedor: 'openai', modelo: 'gpt-6-mini', precio: { entrada: '50.00', cacheLectura: '5', salida: '200' }, ahora: T0 });
    const r = puedeLlamar(db, config, { proposito: 'fabrica_verificar', bytes: 150_000, ahora: T0, topeMicro: 50_000_000, gastado: 0 });
    assert.deepEqual([r.ok, r.motivo], [false, 'llamada_muy_cara'], 'muy caro: espera (no «demasiado_largo», que dejaría el paso fallido)');
    base.db.close();
  } finally { await falso.cerrar(); }
});

test('los esquemas de la fábrica sirven con strict:true de OpenAI (todo objeto cerrado y con todas sus claves)', () => {
  const todos = { ...ESQUEMAS, ...Object.fromEntries(Object.entries(ESQUEMAS_PROFUNDA).map(([k, v]) => [`profunda_${k}`, v])), ...Object.fromEntries(Object.entries(ESQUEMAS_ORAL ?? {}).map(([k, v]) => [`oral_${k}`, v])) };
  for (const [nombre, esquema] of Object.entries(todos)) assert.equal(esquemaEstricto(esquema), true, nombre);
  assert.equal(esquemaEstricto({ type: 'object', properties: { a: { type: 'string' } }, required: [], additionalProperties: false }), false);
  assert.equal(openai.pedido({ modelo: 'gpt-6', sistema: 's', texto: 't', esquema: ESQUEMAS.plan, salidaMax: 100 }).cuerpo.text.format.strict, true);
});

test('el caso del dueño: Claude espera la verificación y ChatGPT fabrica TODO (Test Guide y oral TAL CUAL), verificado y publicado', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    guardarConfigFabrica(db, { oral: true });
    const r = await correr({ max: 200, avanzarMs: 6 * 60_000 });
    assert.equal(r.at(-1).resultado?.motivo, 'terminada', JSON.stringify(r.slice(-3)));
    assert.ok(llamadas().length >= 20);
    assert.ok(llamadas().every(p => p.ruta === '/v1/responses'), 'ni una llamada a Claude');
    const modelos = llamadas().map(p => cuerpoDe(p).model);
    assert.ok(modelos.includes('gpt-6') && modelos.includes('gpt-6-mini'), 'escribe el fuerte, verifica el barato');
    assert.ok(llamadas().every(p => cuerpoDe(p).store === false));
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify(e.dudas));
    const p = leerPaquete(db, config, e.version);
    assert.equal(revisarPaquete(p).ok, true);
    assert.deepEqual(tgAlterado(p, new Map(TG.map(q => [q.id, q]))), []);
    for (const f of TG) {
      const q = p.preguntas.find(x => x.id === `tg-${f.id}`);
      assert.equal(q.original.enunciado, f.enunciado, 'byte a byte (con los espacios)');
      assert.deepEqual(q.original.opciones, Object.keys(f.opciones).map(letra => ({ letra, texto: f.opciones[letra] })));
    }
    assert.equal(p.materias[0].temas[0].secciones.find(s => s.imagen)?.imagen.archivo, 'img-pp-es-p10-1.webp', 'la foto del libro elegida de imagenes.json');
    const oral = estadoMateria(db, 'oral_calificaciones');
    assert.equal(oral.estado, 'publicada', JSON.stringify(oral.dudas));
    const po = leerPaquete(db, config, oral.version);
    assert.deepEqual(po.materias[0].temas[0].libro_qa.map(x => [x.pregunta_en, x.respuesta_en]), ORAL.materias[0].temas[0].preguntas.map(x => [x.pregunta_en, x.respuesta_en]), 'libro_qa tal cual');
    const gasto = db.prepare("SELECT COUNT(*) AS n, SUM(costo_micro) AS c FROM ia_llamadas WHERE proveedor = 'openai'").get();
    assert.ok(gasto.n === llamadas().length && gasto.c > 0, 'cada llamada anotada con su costo');
    // Terminada: no gasta más (la mejora profunda está apagada; la mejora continua, sin evidencia).
    const antes = llamadas().length;
    await correr({ max: 5 });
    assert.equal(llamadas().length, antes);
  }, { proveedor: 'openai', oral: 'completa' });
});

test('con las dos funcionando y ChatGPT elegido: ChatGPT escribe y Claude verifica; el tope de la fábrica la para', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    guardarConfigIa(db, { preferido: 'openai' }, { config, ahora: T0 });
    await correr({ max: 60 });
    const rutas = llamadas().map(p => [p.ruta, cuerpoDe(p).model]);
    assert.ok(rutas.some(([r, m]) => r === '/v1/responses' && m === 'gpt-6'));
    assert.ok(rutas.some(([r, m]) => r === '/v1/messages' && m === 'claude-haiku-5-5'), 'Claude revisa');
    assert.ok(!rutas.some(([, m]) => m === 'claude-sonnet-5-5'), 'Claude no escribe');
  }, { proveedor: 'ambos' });
  await conFabrica(async ({ db, correr, llamadas }) => {
    guardarConfigFabrica(db, { topeMicro: 10_000 });
    const r = await correr({ max: 10 });
    assert.equal(llamadas().length, 0, 'el tope de la fábrica (US$0,01) no alcanza ni para una');
    assert.equal(r.at(-1).resultado.motivo, 'tope_fabrica');
  }, { proveedor: 'openai' });
});

test('la API propia (compatible con OpenAI): prueba con GET /models y fabrica con /chat/completions', async () => {
  await conFabrica(async ({ db, falso, correr, llamadas }) => {
    assert.ok(falso.peticiones.some(p => p.ruta === '/models' && p.metodo === 'GET'));
    const p = leerConfigIa(db).proveedores.propia;
    assert.deepEqual([p.modeloEscribir, p.modelo], ['mi-modelo-grande', 'mi-modelo-mini']);
    guardarConfigIa(db, { preferido: 'propia' }, { ahora: T0 });
    await correr({ max: 60 });
    assert.ok(llamadas().length > 0 && llamadas().every(x => x.ruta === '/chat/completions'));
    assert.equal(estadoMateria(db, 'sistemas').estado, 'publicada');
    assert.equal(cuerpoDe(llamadas()[0]).response_format.type, 'json_schema');
  }, { proveedor: 'propia' });
});
