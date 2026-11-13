// 0.14.7: «Mejorar todo con Claude (lo mejor)»: Opus 5.5 escribe y otra llamada de Opus verifica (o Sonnet + Haiku, más
// barato), con la lectura entera del libro; las explicaciones del Test Guide y el español del oral solo con el visto bueno
// del verificador, uno por uno, y las reglas del código; nada de lo que ya estaba se pierde (fotos, clips, dibujos, el
// inglés del libro, la lista numerada); las 5 fases, el tope de US$90 compartido, seguir donde se quedó, el arranque
// automático (una vez), los avisos por Telegram, las «Ideas para el futuro» y las «Ideas para cambiar la app».
// Proveedor falso en 127.0.0.1, reloj de mentira, fuentes inventadas (test/fabrica-base.js): nunca la red ni una clave real.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaAcademia, leerEnUso, guardarAjuste, leerAjuste } from '../src/academia/paquetes.js';
import { guardarConfigFabrica, leerConfigFabrica, estadoMateria, vistaFabrica } from '../src/academia/fabrica.js';
import {
  estadoProfunda, publicado, invariantesProfunda, explicacionTgValida, explicacionOralValida, numeracion, mismaForma, lecturaMaxDe, MODOS,
  empezarProfunda, autoEmpezarTodo, fasesTodo, estimadoProfundo, claudeListo, gastoProfundaMicro, leerIdeasFuturo, AJUSTE_TODO_TOPE, AJUSTE_TODO_ESTADO,
  AJUSTE_TODO_PROPOSITOS, gastadoRonda, resumenProfunda, planProfundo,
} from '../src/academia/fabrica-profunda.js';
import { PROPOSITOS } from '../src/ia/propositos.js';
import { precioDe, reservaMicro } from '../src/ia/precios.js';
import { MARCO_BYTES } from '../src/ia/cliente.js';
import { claveDeAvisoValida } from '../src/avisos/avisos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { cuerpoDeAviso } from '../src/canales/textos.js';
import { escribirMensaje, leerIdeas, leerChat, leerTrabajos } from '../src/academia/pidele.js';
import { probarModeloClaude } from '../src/claves/probar.js';
import { enTransaccion } from '../src/nucleo/db.js';
import { carpetaFuentes, leerManifiesto } from '../src/academia/fuentes.js';
import { filasFases, lineasEstimado, queHacer } from '../public/todo-vista.js';
import { conFabrica, LIBRO } from './fabrica-base.js';

const SEIS = 6 * 60_000;
const cuerpo = p => (typeof p.cuerpo === 'string' ? JSON.parse(p.cuerpo) : p.cuerpo);
const paquete = (db, config, id) => JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta, 'paquete.json'), 'utf8'));
const rutaPaquete = (db, config, id) => join(carpetaAcademia(config), 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta, 'paquete.json');
const empezar = (db, config, extra = {}) => enTransaccion(db, () => empezarProfunda(db, config, { guardarConfig: guardarConfigFabrica, ...extra }));
const sinPagarDosVeces = db => db.prepare("SELECT paso, COUNT(*) AS n FROM ia_llamadas WHERE paso IS NOT NULL AND estado = 'hecha' GROUP BY paso HAVING n > 1").all();
const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));

test('los propósitos: lo peor de una vez cabe en su máximo, Opus solo con Claude, y la lectura directa sale del propósito', () => {
  for (const id of ['profunda_escribir', 'profunda_escribir_opus', 'profunda_verificar_opus', 'chat_escribir_opus', 'chat_verificar_opus', 'profunda_extracto']) {
    const def = PROPOSITOS[id];
    const fila = precioDe('anthropic', def.modelo);
    assert.ok(fila, `${id}: precio confirmado de ${def.modelo}`);
    assert.ok(reservaMicro(fila, { entradaMax: def.entradaMaxBytes + MARCO_BYTES, salidaMax: def.salidaMax }) <= def.maximoMicro, `${id}: la reserva pasa del máximo`);
  }
  assert.equal(PROPOSITOS.profunda_escribir_opus.modelo, 'claude-opus-5-5');
  assert.equal(PROPOSITOS.profunda_verificar_opus.modelo, 'claude-opus-5-5');
  assert.deepEqual([...PROPOSITOS.profunda_escribir_opus.proveedores], ['anthropic']);
  assert.equal(PROPOSITOS.profunda_extracto.modelo, 'claude-haiku-5-5');
  assert.equal(lecturaMaxDe(MODOS.opus), 95_000);
  assert.equal(lecturaMaxDe(MODOS.sonnet), 95_000);
  // Los precios de la página oficial (US$ por millón): Opus 5.5 4/20 (caché 0,20), Sonnet 5.5 2/10 (caché 0,10).
  assert.deepEqual(precioDe('anthropic', 'claude-opus-5-5').tramos[0].usd, { entrada: '4.00', cacheLectura: '0.20', cacheEscritura: '5.00', salida: '20.00' });
  assert.deepEqual(precioDe('anthropic', 'claude-sonnet-5-5').tramos[0].usd, { entrada: '2.00', cacheLectura: '0.10', cacheEscritura: '2.50', salida: '10.00' });
});

test('las reglas del código: la explicación nombra la correcta TAL CUAL, «errores» solo de las incorrectas, la lista numerada se queda', () => {
  const q = { id: 'tg-1', origen: 'test_guide', sencilla: '✔ La correcta es: Cuatro.\nPor qué: 1. el libro · 2. la regla', errores: { A: 'x', C: 'y' },
    original: { enunciado: '¿Cuántos?', correcta: 'B', opciones: [{ letra: 'A', texto: 'Dos.' }, { letra: 'B', texto: 'Cuatro.' }, { letra: 'C', texto: 'Seis.' }] } };
  const bien = { sencilla: '✔ La correcta es: Cuatro.\nPor qué: 1. lo dice el libro · 2. es la regla', errores: [{ letra: 'A', idea: 'confunde' }, { letra: 'C', idea: 'exagera' }] };
  assert.equal(explicacionTgValida(q, bien).ok, true);
  assert.equal(explicacionTgValida(q, { ...bien, sencilla: '✔ La correcta es: Dos.\nPor qué: 1. a · 2. b' }).motivo, 'no_nombra_la_correcta');
  assert.equal(explicacionTgValida(q, { ...bien, errores: [{ letra: 'B', idea: 'la correcta no' }, { letra: 'C', idea: 'x' }] }).motivo, 'errores');
  assert.equal(explicacionTgValida(q, { ...bien, sencilla: '✔ La correcta es: Cuatro.\n1. el libro · 2. la regla' }).motivo, 'formato');
  assert.equal(explicacionTgValida(q, { ...bien, sencilla: '✔ La correcta es: Cuatro.\nPor qué: el libro y la regla' }).motivo, 'numeracion');
  assert.match(explicacionTgValida(q, { ...bien, sencilla: '✔ La correcta es: Cuatro.\nPor qué: 1. el libro dice 75 · 2. regla' }).motivo, /^numero_no_esta:75/);
  assert.equal(numeracion('1. Uno · 2. Dos · 3. Tres'), 3);
  assert.equal(numeracion('Sin lista'), 0);
  assert.equal(mismaForma('1. a · 2. b', 'Una frase'), false);
  assert.equal(mismaForma('1. a · 2. b', '1. otra a · 2. otra b'), true);
  assert.equal(mismaForma('1. a · 2. b', '1. a\n2. b'), false, 'con «·» si la de antes lo traía');
  // El oral: el español con los MISMOS números que el inglés; sin respuesta_en, nunca respuesta_es.
  const x0 = { pregunta_en: 'How many landings within 90 days?', respuesta_en: 'Three landings within 90 days: 1. day · 2. night', respuesta_es: '1. de día · 2. de noche (90 días)' };
  let r = explicacionOralValida(x0, { explicacion_es: 'Tres aterrizajes.', puntos_clave: ['90 días'], pregunta_es: '¿Cuántos aterrizajes en 90 días?', respuesta_es: 'Tres aterrizajes en 90 días: 1. de día · 2. de noche' });
  assert.deepEqual(Object.keys(r.valor).sort(), ['explicacion_es', 'pregunta_es', 'puntos_clave', 'respuesta_es']);
  r = explicacionOralValida(x0, { explicacion_es: 'Tres.', puntos_clave: [], pregunta_es: '¿Cuántos aterrizajes en 60 días?', respuesta_es: 'Tres aterrizajes en 90 días, de día y de noche.' });
  assert.deepEqual(r.rechazados.sort(), ['pregunta_es', 'respuesta_es'], 'otro número y la lista numerada perdida');
  r = explicacionOralValida({ pregunta_en: 'Describe it.' }, { explicacion_es: 'Algo.', puntos_clave: [], pregunta_es: 'Descríbelo.', respuesta_es: 'Inventada' });
  assert.equal(r.valor.respuesta_es, undefined);
});

test('«Más barato: Sonnet»: Sonnet escribe, Haiku verifica; una lectura más larga que la del propósito va primero a Haiku (pasajes)', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    await correr();
    guardarConfigFabrica(db, { profunda: { activa: true, modelo: 'sonnet' } });
    const n = llamadas().length;
    await correr({ max: 40, avanzarMs: SEIS });
    assert.equal(estadoProfunda(db, 'sistemas').estado, 'publicada');
    assert.deepEqual(llamadas().slice(n).map(p => cuerpo(p).model), [...Array(4).fill('claude-sonnet-5-5'), 'claude-haiku-5-5', 'claude-haiku-5-5']);
  });
  await conFabrica(async ({ db, config, correr, llamadas, falso }) => {
    await correr({ max: 80, avanzarMs: SEIS });
    // El falso dice que leyó ~40 000 tokens (como Claude con una lectura así de larga).
    falso.siguiente(...Array(20).fill({ tipo: 'ok', uso: { input_tokens: 40_000 } }));
    // Después de fabricarla, la lectura del tema crece a ~100 KB (más que los 95 000 que van directo).
    writeFileSync(join(carpetaFuentes(config), 'libro-pp-es-cap02.txt'), `${LIBRO}=== p 12 ===\n${'El motor de muestra se cuida con aceite limpio. '.repeat(2_200)}\n`);
    const man = JSON.parse(readFileSync(join(carpetaFuentes(config), 'fuentes-manifiesto.json'), 'utf8'));
    man.materias[0].temas[0].lecturas[0].hasta = 12;
    writeFileSync(join(carpetaFuentes(config), 'fuentes-manifiesto.json'), JSON.stringify(man));
    guardarConfigFabrica(db, { profunda: { activa: true } });
    const n = llamadas().length;
    await correr({ max: 60, avanzarMs: SEIS });
    const nuevas = llamadas().slice(n).map(cuerpo);
    assert.equal(nuevas[0].model, 'claude-haiku-5-5', 'primero los pasajes, con Haiku');
    assert.ok(nuevas.slice(1).every(c => c.model === 'claude-opus-5-5'));
    // La lectura entera va en el «sistema» de verificar (hasta 140 000 bytes con Opus), marcada para la caché.
    const ver = nuevas.filter(c => c.system[0].text.includes('el libro del oral está en INGLÉS'));
    assert.ok(ver.length >= 2 && ver[0].system[0].text.length > 95_000 && ver[0].system[0].cache_control.type === 'ephemeral');
  });
});

test('el Test Guide: solo «sencilla» y «errores» cambian, y solo con el visto bueno del verificador; lo demás TAL CUAL', async () => {
  await conFabrica(async ({ db, config, correr, opciones }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    const viejo = paquete(db, config, v1);
    opciones.veredicto = i => ({ id: i.original.id, ok: i.original.id !== 'tg-2-2', problema: i.original.id === 'tg-2-2' ? 'contradice la explicación del Test Guide' : null });
    guardarConfigFabrica(db, { profunda: { activa: true } });
    await correr({ max: 40, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    const nuevo = paquete(db, config, e.version);
    const q1 = nuevo.preguntas.find(q => q.id === 'tg-2-1');
    const q2 = nuevo.preguntas.find(q => q.id === 'tg-2-2');
    assert.notEqual(q1.sencilla, viejo.preguntas.find(q => q.id === 'tg-2-1').sencilla, 'mejorada');
    assert.deepEqual(q2, viejo.preguntas.find(q => q.id === 'tg-2-2'), 'sin visto bueno: como estaba');
    for (const q of nuevo.preguntas) assert.deepEqual(q.original, viejo.preguntas.find(x => x.id === q.id).original, 'enunciado, opciones y clave TAL CUAL');
    assert.ok(e.corregidos.some(c => c.problema.startsWith('explicacion_no_confirmada')));
    // Una explicación que contradice la clave no pasa el candado de lo que nunca cambia.
    const pub = publicado(db, config, 'sistemas');
    const mal = { ...pub.cabeza, libros: [...pub.libros.values()], materias: [{ ...pub.materia, temas: pub.orden }], preguntas: structuredClone([...pub.preguntas.values()]), figuras: [...pub.figuras.values()] };
    mal.preguntas[0].sencilla = '✔ La correcta es: Seis.';
    assert.ok(invariantesProfunda(pub, mal, 'sistemas').some(p => p.problema === 'pregunta_cambio'));
    // Todo dibujo de antes sigue (el código lo conserva).
    const visuales = p => new Set(p.materias[0].temas.flatMap(t => t.secciones).filter(s => s.visual && s.visual.tipo !== 'titulo').map(s => JSON.stringify(s.visual)));
    for (const v of visuales(viejo)) assert.ok(visuales(nuevo).has(v), `dibujo perdido: ${v}`);
    const sinDibujo = structuredClone(mal);
    sinDibujo.preguntas = [...pub.preguntas.values()];
    for (const s of sinDibujo.materias[0].temas[0].secciones) if (s.visual?.tipo !== 'titulo') delete s.visual;
    assert.ok(invariantesProfunda(pub, sinDibujo, 'sistemas').some(p => p.problema === 'visual_perdido'));
  });
});

// El oral con lo de la 0.14.5 ya puesto (a mano en el paquete publicado): el español, su lista numerada y su dibujo, la
// pregunta para practicar en voz alta en español y el inglés de las de opción múltiple.
function ponerEspanol(db, config) {
  const pub = publicado(db, config, 'oral_calificaciones');
  const ruta = rutaPaquete(db, config, pub.base);
  const p = JSON.parse(readFileSync(ruta, 'utf8'));
  const m = p.materias.find(x => x.id === 'oral_calificaciones');
  const t1 = m.temas.find(t => t.id === 't01-a');
  t1.libro_qa[0].pregunta_es = '¿Puede un piloto privado de muestra volar por paga?';
  t1.libro_qa[0].respuesta_es = 'No: 1. no por paga · 2. solo comparte gastos';
  t1.libro_qa[0].visual = { tipo: 'diagrama-pasos', parametros: { elementos: [{ nombre: 'Sin paga' }, { nombre: 'Gastos compartidos' }] } };
  t1.libro_qa[1].respuesta_es = 'Hasta 4 pasajeros de muestra.';
  const t2 = m.temas.find(t => t.id === 't02-b');
  t2.adicionales[0].pregunta_es = 'Describe tus mínimos personales de muestra.';
  const q = p.preguntas.find(x => x.origen === 'oral');
  q.enunciado_en = 'Sample question in English?';
  writeFileSync(ruta, JSON.stringify(p));
  return { t1, t2, q };
}
test('el oral: el inglés TAL CUAL; el español mejora solo si es fiel (mismos números, misma lista); el dibujo, las adicionales y el inglés de las de opción múltiple se quedan', async () => {
  await conFabrica(async ({ db, config, correr, opciones }) => {
    guardarConfigFabrica(db, { oral: true });
    await correr({ max: 200, avanzarMs: SEIS });
    const antes = ponerEspanol(db, config);
    opciones.veredicto = i => ({ id: i.original.id, ok: !(i.original.n === 1 && i.original.pregunta_en.includes('landings')), problema: null });
    guardarConfigFabrica(db, { profunda: { activa: true } });
    await correr({ max: 200, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'oral_calificaciones');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    const nuevo = paquete(db, config, e.version);
    const m = nuevo.materias.find(x => x.id === 'oral_calificaciones');
    const t1 = m.temas.find(t => t.id === 't01-a');
    const t2 = m.temas.find(t => t.id === 't02-b');
    assert.deepEqual(t1.libro_qa.map(x => [x.pregunta_en, x.respuesta_en]), antes.t1.libro_qa.map(x => [x.pregunta_en, x.respuesta_en]), 'el inglés del libro TAL CUAL');
    assert.equal(t1.libro_qa[0].respuesta_es, antes.t1.libro_qa[0].respuesta_es, 'la nueva perdía la lista numerada «1. … · 2. …»: se queda la de antes');
    assert.deepEqual(t1.libro_qa[0].visual, antes.t1.libro_qa[0].visual, 'su dibujo se queda');
    assert.equal(t1.libro_qa[0].pregunta_es, 'Pregunta en español (muestra) qa-1', 'la pregunta sí mejoró (fiel)');
    assert.equal(t1.libro_qa[1].respuesta_es, 'Respuesta en español: 4 (muestra).', 'con el mismo número');
    assert.equal(t2.libro_qa[0].respuesta_es, undefined, 'sin visto bueno del verificador: como estaba');
    assert.deepEqual(t2.adicionales, antes.t2.adicionales, 'las preguntas para practicar en voz alta TAL CUAL (con su español)');
    assert.equal(nuevo.preguntas.find(x => x.id === antes.q.id).enunciado_en, 'Sample question in English?', 'las de opción múltiple TAL CUAL');
  }, { oral: 'completa' });
});

test('«Mejorar todo»: el orden, las etapas (a → aviso → c con informe y arreglo), las ideas para el futuro, el fin y una ronda nueva sin repetir secciones', async () => {
  await conFabrica(async ({ db, config, correr, llamadas, opciones }) => {
    await correr();
    opciones.dudasFinal = d => (d.tema.startsWith('El motor') && !opciones.yaArreglado ? [{ donde: 'Mejor: El motor', problema: 'El libro dice 2400 rpm (p. 10)', gravedad: 'error' }] : []);
    const cfg = empezar(db, config, { topeMicro: 90_000_000 });
    assert.equal(cfg.profunda.etapas, true);
    assert.equal(cfg.profunda.modelo, 'opus');
    assert.equal(leerAjuste(db, AJUSTE_TODO_TOPE), '90000000', 'el tope de TODO (fases 1–5), en un solo lugar');
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = 'ia_todo:r1:empieza'").get());
    await correr({ max: 120, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'sistemas');
    assert.equal(e.estado, 'publicada');
    assert.equal(e.final.estado, 'hecha', JSON.stringify(e.final));
    assert.equal(e.final.informe[0].dudas[0].gravedad, 'error');
    assert.ok(e.final.arreglos['t01-motor'], 'lo que salió «error» se intentó arreglar con la misma tubería');
    assert.ok(llamadas().some(p => JSON.stringify(cuerpo(p)).includes('Corrige SOLO estos problemas')));
    for (const ev of ['a_fin', 'fin']) assert.ok(db.prepare('SELECT 1 FROM avisos WHERE clave = ?').get(`ia_todo:r1:${ev}`), ev);
    const fin = db.prepare("SELECT * FROM avisos WHERE clave = 'ia_todo:r1:fin'").get();
    assert.match(cuerpoDeAviso(fin, 'es'), /^Terminé: todo revisado y mejorado \(gastado US\$/);
    assert.equal(vaPorTelegram(fin).va, true);
    assert.equal(JSON.parse(leerAjuste(db, AJUSTE_TODO_ESTADO)).fases.revision, 'hecha', 'el estado para la fase 5');
    assert.ok(leerIdeasFuturo(db).length >= 2, 'las ideas para el futuro de cada fase');
    assert.equal(fasesTodo(db, config).estado, 'terminada');
    // Se queda parado: otra pasada no gasta.
    const n = llamadas().length;
    await correr({ max: 5 });
    assert.equal(llamadas().length, n);
    assert.deepEqual(sinPagarDosVeces(db), []);
    // Una ronda nueva (sobre lo ya mejorado): sin secciones repetidas.
    opciones.yaArreglado = true;
    const c2 = empezar(db, config);
    assert.equal(c2.profunda.ronda, 2);
    await correr({ max: 120, avanzarMs: SEIS });
    const e2 = estadoProfunda(db, 'sistemas', 2);
    assert.equal(e2.estado, 'publicada');
    const t = paquete(db, config, leerEnUso(db).at(-1).id).materias[0].temas[0];
    for (const titulo of ['¿Qué es y por qué importa?', 'Resumen', 'Para el Test Guide']) assert.equal(t.secciones.filter(s => s.titulo === titulo).length, 1, titulo);
    assert.equal(estadoProfunda(db, 'sistemas', 1).estado, 'publicada', 'lo de la ronda 1 queda guardado');
  });
});

test('«Mejorar todo» publica solo: un tema con dudas se queda como estaba y se lista (no espera al dueño)', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    const viejo = paquete(db, config, v1);
    empezar(db, config, { topeMicro: 90_000_000 });
    await correr({ max: 120, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'sistemas');
    assert.ok(['saltada', 'publicada'].includes(e.estado), JSON.stringify(e));
    assert.equal(e.omitidos[0].tema, 't01-motor');
    assert.equal(e.final.arreglos['t01-motor'].estado, 'saltada', 'el segundo intento también falló: sigue en la lista');
    const ahora = publicado(db, config, 'sistemas');
    assert.deepEqual(ahora.orden[0].secciones, viejo.materias[0].temas[0].secciones, 'el tema se quedó como estaba');
  }, { dudasProfunda: [{ donde: 'Mejor: El motor', problema: 'El libro no dice eso', gravedad: 'error' }] });
});

test('el tope: lo que no cabe queda «fuera» (y se dice); se acaba el saldo → «Pausado» y al subirlo sigue donde se quedó sin pagar dos veces', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    await correr();
    empezar(db, config, { topeMicro: 1_000 });
    await correr({ max: 10 });
    assert.equal(estadoProfunda(db, 'sistemas').estado, 'fuera');
    const f = fasesTodo(db, config);
    assert.deepEqual(f.fuera.map(x => x.id), ['sistemas']);
    const est = estimadoProfundo(db, config, { topeMicro: 1_000 });
    assert.deepEqual(est.porModo.opus.fuera.map(x => x.id), ['sistemas']);
    assert.ok(est.porModo.opus.totalMicro === 0 && est.porModo.opus.materias.find(x => x.id === 'sistemas').aMicro > 0);
    // Sube el tope: empieza; a mitad, se acaba el saldo.
    guardarConfigFabrica(db, { profunda: { topeMicro: 90_000_000 } });
    await correr({ max: 3, avanzarMs: SEIS });
    const n = llamadas().length;
    assert.ok(n > 6, 'empezó');
    guardarConfigFabrica(db, { profunda: { topeMicro: gastoProfundaMicro(db) + 10 } });
    const r = await correr({ max: 5, avanzarMs: SEIS });
    assert.equal(r.at(-1).resultado?.profunda ?? 'tope_profunda', 'tope_profunda');
    const fase = fasesTodo(db, config);
    assert.equal(fase.estado, 'sin_saldo');
    assert.equal(fase.hasta.materia.id, 'sistemas');
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = 'ia_todo:r1:saldo' AND resuelto_en IS NULL").get());
    assert.match(es['todo.estado.sin_saldo'], /^Pausado: se acabó el saldo · siguió hasta \{hasta\}/);
    // «Un reinicio del servidor»: nada en memoria; sube el tope y sigue.
    guardarConfigFabrica(db, { profunda: { topeMicro: 90_000_000 } });
    await correr({ max: 120, avanzarMs: SEIS });
    assert.equal(estadoProfunda(db, 'sistemas').final?.estado, 'hecha');
    assert.deepEqual(sinPagarDosVeces(db), [], 'ningún paso pagado dos veces');
    assert.ok(db.prepare("SELECT resuelto_en FROM avisos WHERE clave = 'ia_todo:r1:saldo'").get().resuelto_en, 'el aviso de saldo se cerró al seguir');
  });
});

test('el tope compartido: lo que gasta la fase 5 (sus propósitos en ia.todo.propositos) cuenta contra los US$90', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    const cfg = empezar(db, config, { topeMicro: 90_000_000 });
    const antes = gastadoRonda(db, cfg, 1);
    guardarAjuste(db, AJUSTE_TODO_PROPOSITOS, JSON.stringify(['fabrica_escribir']));
    assert.ok(gastadoRonda(db, cfg, 1) > antes, 'suma lo de los propósitos anotados');
  });
});

test('las 5 fases: estado, % y lo que hace ahora; la 5 sale de ia.app.estado (o «Pronto»)', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    let f = fasesTodo(db, config);
    assert.equal(f.estado, 'apagada');
    assert.deepEqual(f.fases.map(x => x.id), ['leer', 'explicar', 'dibujos', 'revision', 'app']);
    assert.equal(f.fases[4].estado, 'pronto');
    empezar(db, config, { topeMicro: 90_000_000 });
    await correr({ max: 3, avanzarMs: SEIS });
    f = fasesTodo(db, config);
    assert.equal(f.estado, 'trabajando');
    assert.equal(f.fases[0].estado, 'ahora');
    assert.equal(f.fases[0].actual.materia.id, 'sistemas');
    assert.equal(f.fases[0].actual.tema, 'El motor (muestra)');
    guardarAjuste(db, 'ia.app.estado', JSON.stringify({ estado: 'ahora', pct: 40, actual: 'Los colores del examen' }));
    f = fasesTodo(db, config);
    assert.deepEqual([f.fases[4].estado, f.fases[4].pct, f.fases[4].actual.texto], ['ahora', 40, 'Los colores del examen']);
    const filas = filasFases(f);
    assert.equal(filas[0].emoji, '🔄');
    assert.equal(filas[4].emoji, '🔄');
    for (const x of filas) assert.ok(es[`todo.fase.${x.id}`] && es[`todo.fase_estado.${x.estado}`]);
    await correr({ max: 120, avanzarMs: SEIS });
    f = fasesTodo(db, config);
    assert.deepEqual(f.fases.slice(0, 4).map(x => x.estado), ['hecha', 'hecha', 'hecha', 'hecha']);
    // Pausar (lo único que hace el dueño): queda «pausada» y no gasta.
    guardarConfigFabrica(db, { profunda: { activa: false } });
    assert.equal(fasesTodo(db, config).estado, 'pausada');
  });
});

test('arranca SOLO una vez (con la clave probada y la IA encendida), con Opus y US$90; nunca otra vez después de pausar', async () => {
  await conFabrica(async ({ db, config, correr, secretoId }) => {
    await correr();
    assert.equal(claudeListo(db, config).listo, true);
    const c = enTransaccion(db, () => autoEmpezarTodo(db, config, { guardarConfig: guardarConfigFabrica }));
    assert.deepEqual([c.profunda.activa, c.profunda.modelo, c.profunda.topeMicro, c.profunda.etapas], [true, 'opus', 90_000_000, true]);
    guardarConfigFabrica(db, { profunda: { activa: false } });
    assert.equal(autoEmpezarTodo(db, config, { guardarConfig: guardarConfigFabrica }), null, 'después de pausar no vuelve a empezar solo');
    assert.equal(leerConfigFabrica(db).profunda.activa, false);
  });
  await conFabrica(async ({ db, config }) => {
    assert.deepEqual(claudeListo(db, config), { listo: false, motivo: 'ia_apagada' });
    assert.equal(autoEmpezarTodo(db, config, { guardarConfig: guardarConfigFabrica }), null);
    assert.equal(es[queHacer('ia_apagada')].startsWith('La IA está apagada'), true);
  }, { encendida: false });
});

test('la prueba GRATIS con Opus (count_tokens con claude-opus-5-5) y el estimado por etapa con Opus y con Sonnet', async () => {
  await conFabrica(async ({ db, config, correr, falso }) => {
    await correr();
    const r = await probarModeloClaude(db, config, { modelo: 'claude-opus-5-5' });
    assert.equal(r.motivo, 'ok');
    const prueba = falso.peticiones.at(-1);
    assert.deepEqual([prueba.ruta, cuerpo(prueba).model], ['/v1/messages/count_tokens', 'claude-opus-5-5']);
    const e = estimadoProfundo(db, config, { topeMicro: 90_000_000 });
    assert.ok(e.porModo.opus.totalMicro > e.porModo.sonnet.totalMicro, 'Opus cuesta más');
    assert.ok(e.porModo.opus.etapas.a > 0 && e.porModo.opus.etapas.c > 0 && e.porModo.opus.etapas.b === 0);
    assert.deepEqual(e.porModo.opus.dentro, ['sistemas']);
    const t = (k, v = {}) => es[k].replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
    const lineas = lineasEstimado(e, t);
    assert.ok(lineas.some(l => l.startsWith('a) Reescribir')) && lineas.some(l => l.startsWith('c) Revisión muy profunda')));
    // El orden: la del Test Guide con más preguntas primero, el oral al final; la 11 (SMS) sin fuentes nunca gasta.
    const plan = planProfundo(db, config, { man: leerManifiesto(carpetaFuentes(config)) });
    assert.equal(plan[0].id, 'sistemas');
    assert.equal(plan.find(x => x.id === 'sms').estado, 'sin_fuentes');
    assert.equal(vistaFabrica(db, config).profunda.falta.porModelo.opus > 0, true);
  });
});

test('el chat: lo de código va a «Ideas para cambiar la app» (con aviso por Telegram sin el texto); lo de contenido se hace solo y avisa en el chat', async () => {
  await conFabrica(async ({ db, config, correr, reloj }) => {
    await correr();
    const r = enTransaccion(db, () => escribirMensaje(db, { texto: 'cambia el botón de la pantalla de inicio a verde', ahora: reloj() }));
    assert.equal(r.rechazado, 'codigo');
    const ideas = leerIdeas(db);
    assert.equal(ideas.at(-1).texto, 'cambia el botón de la pantalla de inicio a verde');
    const aviso = db.prepare('SELECT * FROM avisos WHERE clave = ?').get(`ia_idea:${ideas.at(-1).id}`);
    assert.ok(aviso && claveDeAvisoValida(aviso.clave) && vaPorTelegram(aviso).va);
    assert.ok(!cuerpoDeAviso(aviso, 'es').includes('verde'), 'el texto de la idea no va por Telegram');
    assert.equal(es['pidele.rechazo.codigo'], 'Eso lo cambia el programador; lo guardé en «Ideas para cambiar la app».');
    // Contenido: sin «Hazlo».
    enTransaccion(db, () => escribirMensaje(db, { texto: 'explica mejor el tema del motor', ahora: reloj() }));
    await correr({ max: 60, avanzarMs: SEIS });
    const j = leerTrabajos(db).at(-1);
    assert.equal(j.solo, true);
    assert.equal(j.estado, 'hecho', JSON.stringify(j));
    assert.ok(db.prepare("SELECT 1 FROM ia_llamadas WHERE proposito = 'chat_escribir_opus'").get(), 'con el modelo de la mejora profunda (Opus)');
    assert.equal(leerChat(db).mensajes.at(-1).avisoTrabajo, 'hecho');
  });
});

test('las rutas: GET …/profunda (las 5 fases y si Claude está listo), el estimado, empezar con US$90 y pausar; un alumno no entra', async () => {
  const { configDePrueba, conServidor } = await import('./ayuda.js');
  const { crearServidor } = await import('../src/app.js');
  const { abrirBase } = await import('../src/nucleo/db.js');
  const { crearUsuario } = await import('../src/cuentas/usuarios.js');
  const { hashClave } = await import('../src/cuentas/claves.js');
  const { pedir, DUENO, CLAVE } = await import('./instructor-ia-base.js');
  const { escribirFuentes } = await import('./fabrica-base.js');
  const { revisarCarpetaFuentes, AJUSTE_FUENTES } = await import('../src/academia/fuentes.js');
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config });
  try {
    await conServidor(servidor, async base => {
      const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
      const adminId = db.prepare("SELECT id FROM usuarios WHERE nombre = 'junior'").get().id;
      crearUsuario(db, { nombre: 'zoelia', claveHash: await hashClave(CLAVE), debeCambiarClave: false, creadoPor: adminId });
      const alumno = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre: 'zoelia', clave: CLAVE } })).galleta;
      escribirFuentes(config);
      guardarAjuste(db, AJUSTE_FUENTES, JSON.stringify(revisarCarpetaFuentes(carpetaFuentes(config))));
      let r = await pedir(base, 'GET', '/api/admin/academia/profunda', { galleta: admin });
      assert.equal(r.codigo, 200);
      assert.equal(r.datos.estado, 'apagada');
      assert.equal(r.datos.fases.length, 5);
      assert.deepEqual(r.datos.listo, { listo: false, motivo: 'ia_apagada' }, 'sin clave ni IA: dice qué hacer');
      assert.equal(r.datos.topeTodoMicro, 90_000_000);
      assert.equal((await pedir(base, 'GET', '/api/admin/academia/profunda', { galleta: alumno })).codigo, 403);
      r = await pedir(base, 'GET', '/api/admin/academia/profunda/estimado?topeUsd=90', { galleta: admin });
      assert.equal(r.codigo, 200);
      assert.equal(r.datos.topeMicro, 90_000_000);
      assert.ok(r.datos.porModo.opus && r.datos.porModo.sonnet);
      r = await pedir(base, 'POST', '/api/admin/academia/profunda/empezar', { galleta: admin, datos: { modelo: 'opus', topeUsd: '90' } });
      assert.equal(r.codigo, 409, 'con Opus y sin Claude listo: no empieza (y dice por qué)');
      assert.equal(r.datos.error, 'ia_apagada');
      r = await pedir(base, 'POST', '/api/admin/academia/profunda/empezar', { galleta: admin, datos: { modelo: 'sonnet', topeUsd: '90' } });
      assert.equal(r.codigo, 200);
      assert.deepEqual([r.datos.config.profunda.activa, r.datos.config.profunda.topeMicro], [true, 90_000_000]);
      r = await pedir(base, 'POST', '/api/admin/academia/profunda/pausa', { galleta: admin, datos: { pausada: true } });
      assert.equal(r.datos.config.profunda.activa, false);
      r = await pedir(base, 'GET', '/api/admin/academia/profunda', { galleta: admin });
      assert.equal(r.datos.estado, 'apagada', 'pausada antes de hacer nada');
      r = await pedir(base, 'POST', '/api/admin/academia/fabrica/config', { galleta: admin, datos: { profunda: { modelo: 'chatgpt' } } });
      assert.equal(r.codigo, 400);
    });
  } finally {
    db.close();
  }
});
