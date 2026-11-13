// 0.14.2: «Pídele a la IA» (el chat del dueño), «Lo que hizo la IA» (registro, números, lo que falta) y los «Dibujos con
// IA». Fuentes sintéticas, proveedor falso en 127.0.0.1 (ChatGPT; Claude esperando la verificación, salvo donde se dice),
// reloj de mentira y sin Drive.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { estadoMateria, guardarConfigFabrica, tgAlterado } from '../src/academia/fabrica.js';
import { carpetaAcademia, leerEnUso } from '../src/academia/paquetes.js';
import { escribirMensaje, leerChat, leerTrabajos, hazlo, rechazoDe, vistaChat, publicarTrabajo } from '../src/academia/pidele.js';
import { vistaLoQueHizo } from '../src/academia/ia-hizo.js';
import { leerCambios } from '../src/academia/cambios-ia.js';
import { hechos, carpetaDibujos, webpBueno, estimadoDibujos } from '../src/academia/dibujos-ia.js';
import { enTransaccion } from '../src/nucleo/db.js';
import { conFabrica, TG } from './fabrica-base.js';

const cuerpoDe = p => (typeof p.cuerpo === 'string' ? JSON.parse(p.cuerpo) : p.cuerpo);
const leerPaquete = (db, config, id) => {
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(id);
  return JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json'), 'utf8'));
};
const T_ = (db, fn) => enTransaccion(db, fn);

test('el chat rechaza en código (gratis) lo que no es contenido: código, dinero, cuentas y el texto del Test Guide', () => {
  assert.equal(rechazoDe('Cambia el código de la app para que el botón sea azul'), 'codigo');
  assert.equal(rechazoDe('sube el precio del plan'), 'dinero');
  assert.equal(rechazoDe('borra al alumno Pedro y cambia su contraseña'), 'usuarios');
  assert.equal(rechazoDe('corrige la respuesta correcta de la pregunta 2-1 del Test Guide'), 'test_guide');
  assert.equal(rechazoDe('reescribe las preguntas del libro del oral'), 'test_guide');
  assert.equal(rechazoDe('explica mejor el tema de hipoxia'), null);
  assert.equal(rechazoDe('agrega un dibujo al tema del motor'), null);
  assert.equal(rechazoDe('revisa si hay errores en la materia 1'), null);
});

test('chat → plan con su costo → «Hazlo» → trabajo de la fábrica → escrito, verificado contra el libro y publicado (el Test Guide TAL CUAL)', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    await correr({ max: 60 });
    const v0 = estadoMateria(db, 'sistemas').version;
    assert.ok(v0, 'la materia ya está publicada');
    // Un pedido prohibido: ni una llamada.
    const antes = llamadas().length;
    const no = T_(db, () => escribirMensaje(db, { texto: 'cambia el código del servidor', ahora: Date.now() }));
    assert.equal(no.rechazado, 'codigo');
    await correr({ max: 3 });
    assert.equal(llamadas().length, antes, 'rechazado en código: gratis');
    assert.equal(leerChat(db).mensajes.at(-1).rechazo, 'codigo');
    // Un pedido de contenido: UNA llamada (el chat), con el plan y su costo; todavía no se hace nada.
    T_(db, () => escribirMensaje(db, { texto: 'explica mejor el tema del motor, con un ejemplo de la vida diaria', ahora: Date.now() }));
    await correr({ max: 3 });
    assert.equal(llamadas().length, antes + 1);
    const pedido = cuerpoDe(llamadas().at(-1));
    assert.ok(pedido.input.includes('t01-motor') && !/junior|maria/.test(JSON.stringify(pedido)), 'el contexto: la lista de temas, nunca un nombre');
    const resp = leerChat(db).mensajes.at(-1);
    assert.equal(resp.de, 'ia');
    assert.ok(resp.costoMicro > 0 && resp.trabajo);
    const j = leerTrabajos(db).find(x => x.id === resp.trabajo);
    assert.deepEqual([j.estado, j.tipo, j.materia, j.tema], ['propuesto', 'reescribir_tema', 'sistemas', 't01-motor']);
    assert.ok(j.estimadoMicro > 0 && j.pasosEstimados >= 3);
    await correr({ max: 5 });
    assert.equal(llamadas().length, antes + 1, 'sin «Hazlo» no se hace nada');
    assert.ok(vistaChat(db, config).estimado.micro > 0, 'lo que cuesta un mensaje');
    // «Hazlo».
    T_(db, () => hazlo(db, { id: j.id }));
    const r = await correr({ max: 40 });
    const hecho = leerTrabajos(db).find(x => x.id === j.id);
    assert.equal(hecho.estado, 'hecho', JSON.stringify({ hecho, ultimo: r.at(-1) }));
    const nuevas = llamadas().slice(antes + 1);
    assert.ok(nuevas.length >= 4, 'plan, tarjetas, cierre y verificar');
    assert.ok(nuevas.some(p => cuerpoDe(p).input.includes('PEDIDO DEL DUEÑO') && cuerpoDe(p).input.includes('vida diaria')));
    assert.ok(nuevas.some(p => cuerpoDe(p).model === 'gpt-6-mini'), 'verificado (con el barato: Claude no funciona)');
    const fila = db.prepare("SELECT proposito, COUNT(*) AS n FROM ia_llamadas WHERE proposito LIKE 'chat_%' GROUP BY proposito").all();
    assert.deepEqual(fila.map(x => x.proposito).sort(), ['chat_admin', 'chat_escribir', 'chat_verificar']);
    assert.ok(hecho.version && hecho.version !== v0);
    assert.ok(leerEnUso(db).some(x => x.id === hecho.version), 'publicada');
    const p = leerPaquete(db, config, hecho.version);
    assert.deepEqual(tgAlterado(p, new Map(TG.map(q => [q.id, q]))), [], 'el Test Guide TAL CUAL');
    assert.equal(p.materias[0].temas[0].secciones[0].titulo, '¿Qué es y por qué importa?', 'el patrón de enseñanza nuevo');
    const c = leerCambios(db).at(-1);
    assert.deepEqual([c.que, c.materia, c.estado, c.proveedor], ['pedido_hecho', 'sistemas', 'publicada', 'openai']);
    assert.ok(c.costoMicro > 0);
  }, { proveedor: 'openai' });
});

test('si la IA intenta un plan prohibido o con un tema que no existe, no se ofrece «Hazlo»; «Revisar errores» da un informe', async () => {
  await conFabrica(async ({ db, correr, llamadas, opciones }) => {
    await correr({ max: 60 });
    opciones.chat = d => ({ respuesta: 'Listo, cambio las opciones.', rechazo: null, resumen: 'x', plan: { tipo: 'reescribir_tema', materia: 'sistemas', tema: 't01-motor', instruccion: 'cambia las opciones de la pregunta del test guide 2-1', pasos: [] } });
    T_(db, () => escribirMensaje(db, { texto: 'mejora el tema del motor', ahora: Date.now() }));
    await correr({ max: 3 });
    assert.equal(leerChat(db).mensajes.at(-1).rechazo, 'test_guide');
    assert.equal(leerTrabajos(db).length, 0, 'ningún trabajo');
    opciones.chat = () => ({ respuesta: 'ok', rechazo: null, resumen: 'x', plan: { tipo: 'reescribir_tema', materia: 'sistemas', tema: 't99-no-existe', instruccion: 'mejóralo', pasos: [] } });
    T_(db, () => escribirMensaje(db, { texto: 'mejora el tema 99', ahora: Date.now() }));
    await correr({ max: 3 });
    assert.equal(leerChat(db).mensajes.at(-1).planNoValido, 'tema');
    assert.equal(leerTrabajos(db).length, 0);
    opciones.chat = () => ({ respuesta: 'Reviso la materia.', rechazo: null, resumen: 'x', plan: { tipo: 'revisar_errores', materia: 'sistemas', tema: null, instruccion: 'revisa si hay errores', pasos: ['Cada tema contra el libro'] } });
    T_(db, () => escribirMensaje(db, { texto: 'revisa si hay errores en sistemas', ahora: Date.now() }));
    await correr({ max: 3 });
    const j = leerTrabajos(db).at(-1);
    assert.equal(j.tipo, 'revisar_errores');
    const antes = llamadas().length;
    opciones.dudas = [{ donde: 'El motor', problema: 'El libro dice 2400 rpm, no 2500', gravedad: 'error' }];
    T_(db, () => hazlo(db, { id: j.id }));
    await correr({ max: 10 });
    const fin = leerTrabajos(db).find(x => x.id === j.id);
    assert.equal(fin.estado, 'hecho');
    assert.equal(llamadas().length - antes, 1, 'un tema, una verificación');
    assert.deepEqual(fin.informe[0].dudas, [{ donde: 'El motor', problema: 'El libro dice 2400 rpm, no 2500', gravedad: 'error' }]);
    assert.equal(leerCambios(db).at(-1).que, 'revision_errores');
    assert.equal(leerCambios(db).at(-1).despues.errores, 1);
  }, { proveedor: 'openai', dudas: [] });
});

// (la verificación de la fábrica sale limpia y la de «Revisar errores» encuentra una duda: el falso responde según el
// orden; aquí se cambia lo que dice el verificador justo antes del trabajo)
test('«Pausar» para TODO: ni la fábrica ni el chat llaman; al reanudar, sigue', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    guardarConfigFabrica(db, { pausada: true });
    T_(db, () => escribirMensaje(db, { texto: 'explica mejor el motor', ahora: Date.now() }));
    const r = await correr({ max: 5 });
    assert.equal(llamadas().length, 0, 'en pausa: cero llamadas');
    assert.equal(r.at(-1).resultado.motivo, 'pausada');
    assert.equal(leerChat(db).mensajes.at(-1).estado, 'pendiente');
    guardarConfigFabrica(db, { pausada: false });
    await correr({ max: 2 });
    assert.equal(llamadas().length, 1, 'reanudada: primero contesta el chat');
    assert.equal(leerChat(db).mensajes.at(-1).de, 'ia');
  }, { proveedor: 'openai', fuentes: true });
});

test('«Lo que hizo la IA»: el registro (con quién escribió y si Claude revisó), los números y «Lo que falta»', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    guardarConfigFabrica(db, { oral: false });
    const { guardarConfigIa } = await import('../src/ia/config.js');
    guardarConfigIa(db, { preferido: 'openai' }, { config });
    await correr({ max: 60 });
    const v = vistaLoQueHizo(db, config);
    assert.deepEqual(Object.keys(v).sort(), ['cambios', 'falta', 'materiales', 'numeros']);
    assert.equal(v.numeros.tg.total, 11);
    assert.equal(v.numeros.oral.total, 9);
    assert.ok(v.numeros.tg.hechas >= 1);
    assert.equal(v.numeros.tg.hechas + v.numeros.tg.enCurso + v.numeros.tg.revision + v.numeros.tg.pendientes, 11);
    assert.ok(v.numeros.preguntas.tg >= 2 && v.numeros.preguntas.conExplicacion >= 2);
    assert.ok(Number.isSafeInteger(v.numeros.dinero.mesMicro) && v.numeros.dinero.fabricaTopeMicro === 20_000_000);
    assert.equal(v.numeros.proveedor, 'openai');
    const c = v.cambios[0];
    assert.deepEqual([c.que, c.materia, c.proveedor, c.revisadoPor], ['materia_publicada', 'sistemas', 'openai', 'anthropic'], 'ChatGPT escribió, Claude revisó');
    assert.ok(c.costoMicro > 0 && c.despues.preguntas === 2);
    assert.ok(Array.isArray(v.falta) && v.falta.every(x => typeof x.clave === 'string'));
    assert.ok(v.materiales.some(x => x.clave === 'materia_sin_fuentes' && x.materia === 'aerodinamica'), 'lo que falta de los materiales privados');
    assert.ok(v.falta.some(x => x.clave === 'material_sin_oral'), JSON.stringify(v.falta));
  }, { proveedor: 'ambos' });
});

test('«Dibujos con IA»: apagado = cero llamadas de imagen; encendido, ChatGPT dibuja (WebP chico) y Claude lo mira', async () => {
  await conFabrica(async ({ db, config, correr, llamadas, falso }) => {
    await correr({ max: 60 });
    await correr({ max: 5 });
    assert.equal(falso.peticiones.filter(p => p.ruta === '/v1/images/generations').length, 0, 'apagado: ni una');
    const est = estimadoDibujos(db, config);
    assert.ok(est.tarjetas >= 1 && est.micro > 0, 'el estimado antes de encenderlo');
    guardarConfigFabrica(db, { dibujos: { activa: true } });
    await correr({ max: 10 });
    const img = falso.peticiones.filter(p => p.ruta === '/v1/images/generations');
    assert.ok(img.length >= 1);
    assert.equal(cuerpoDe(img[0]).output_format, 'webp');
    const vistos = falso.peticiones.filter(p => p.ruta === '/v1/messages' && JSON.stringify(cuerpoDe(p).messages).includes('"type":"image"'));
    assert.ok(vistos.length >= 1, 'Claude MIRA el dibujo');
    const h = Object.values(hechos(db));
    assert.ok(h.length >= 1 && h.every(x => x.estado === 'aprobado' && x.revisadoPor === 'anthropic'), JSON.stringify(h));
    const archivo = join(carpetaDibujos(config), h[0].archivo);
    assert.ok(existsSync(archivo) && webpBueno(readFileSync(archivo)));
    assert.ok(!archivo.includes('/public/'), 'en la carpeta privada de datos');
  }, { proveedor: 'ambos', sinDibujo: true });
  // Claude rechaza: no se usa.
  await conFabrica(async ({ db, correr }) => {
    await correr({ max: 60 });
    guardarConfigFabrica(db, { dibujos: { activa: true } });
    await correr({ max: 10 });
    assert.ok(Object.values(hechos(db)).every(x => x.estado === 'rechazado'));
  }, { proveedor: 'ambos', sinDibujo: true, revision: () => ({ usar: false, problemas: ['La etiqueta dice 2500 rpm'] }) });
});

void publicarTrabajo;
