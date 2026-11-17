// 0.14.17: la fábrica nunca se queda trabada en un paso (pedido del dueño: «POH en 62 % por días, la mejora profunda en
// 0 %»). Fuentes sintéticas, proveedor falso, reloj de mentira y sin red (test/fabrica-base.js).
//  - Una lectura enorme: el pedido de Haiku (pasajes y verificar) ya no pasa del tramo corto (antes: «llamada_muy_cara»
//    para siempre); los pasajes se sacan en trozos.
//  - Un paso que no sale queda en «Pendientes para reintentar» y se reintenta solo con otra estrategia; si sigue sin
//    salir, queda en la lista con su motivo y un aviso (Telegram).
//  - La mejora profunda no espera detrás de la fábrica; las materias hechas a mano se ven «ya publicada» (100 %).
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaFuentes } from '../src/academia/fuentes.js';
import { estadoMateria, estadoGeneral, vistaFabrica, leerSalida, guardarConfigFabrica, guardarMateria, planDeTrabajo, cortarBytes, trozosDe, puedeLlamar } from '../src/academia/fabrica.js';
import { guardarAjuste, AJUSTE_EN_USO } from '../src/academia/paquetes.js';
import { TAREAS } from '../src/academia/fabrica-prompts.js';
import { claveDeAvisoValida } from '../src/avisos/avisos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { vistaLoQueHizo } from '../src/academia/ia-hizo.js';
import { conFabrica } from './fabrica-base.js';

const SEIS = 6 * 60_000;
const RELLENO = 'El motor de muestra tiene cuatro cilindros y gira a 2400 rpm en crucero. Texto de relleno sintético con tildes: ñandú. ';
function lecturaEnorme(config, bytes) {
  const veces = Math.ceil(bytes / Buffer.byteLength(RELLENO));
  writeFileSync(join(carpetaFuentes(config), 'libro-pp-es-cap02.txt'), `=== p 10 ===\n${RELLENO.repeat(veces)}\n=== p 11 ===\nLa hélice de muestra empuja el aire hacia atrás y así el avión avanza.\n`);
}
const llamadasDe = db => db.prepare('SELECT proposito, resultado, entrada_max FROM ia_llamadas ORDER BY id').all();

test('0.14.17: cortarBytes nunca corta una letra y trozosDe reparte todo el texto', () => {
  assert.equal(cortarBytes('ñandú', 2), 'ñ');
  assert.equal(cortarBytes('ñandú', 3), 'ña');
  assert.equal(cortarBytes('abc', 10), 'abc');
  const texto = `${'línea con tilde áé\n'.repeat(500)}`;
  const t = trozosDe(texto, 1000);
  assert.equal(t.join(''), texto);
  assert.ok(t.every(x => Buffer.byteLength(x) <= 1000));
});

test('0.14.17: una lectura enorme (como la del POH) ya no traba la fábrica: pasajes en trozos y todo pedido de Haiku en el tramo corto', async () => {
  await conFabrica(async ({ db, config, correr, avanzar }) => {
    lecturaEnorme(config, 170_000);
    // Lo de antes (0.14.16): el pedido de pasajes con la lectura entera se negaba siempre por el precio del tramo largo.
    const antes = puedeLlamar(db, config, { proposito: 'fabrica_verificar', bytes: 172_000, ahora: Date.parse('2026-11-11T01:00:00Z'), topeMicro: 20_000_000, gastado: 0 });
    assert.equal(antes.motivo, 'llamada_muy_cara', 'la causa: un pedido de Haiku de más de 100 000 bytes');
    for (let i = 0; i < 4 && estadoMateria(db, 'sistemas').estado !== 'publicada'; i++) { await correr({ max: 80, avanzarMs: SEIS }); avanzar(3_600_000); }
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify({ e, g: estadoGeneral(db) }));
    const ll = llamadasDe(db);
    assert.ok(ll.every(x => x.resultado === 'ok'), JSON.stringify(ll));
    assert.ok(ll.filter(x => x.proposito === 'fabrica_verificar').every(x => x.entrada_max <= 100_000), 'todo pedido de Haiku cabe en el tramo corto');
    assert.equal(ll.filter(x => x.proposito === 'fabrica_verificar').length, 4, 'tres trozos de pasajes + verificar');
    assert.ok(leerSalida(db, 'sistemas', 1, 't01-motor', 'extracto-3')?.json, 'el tercer trozo');
    assert.equal(vistaFabrica(db, config).materias[0].pct, 100);
  });
});

test('0.14.17: un tema cuyo plan ya se escribió con un solo extracto (antes de la 0.14.17) no se vuelve a pagar', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    lecturaEnorme(config, 170_000);
    const clave = paso => `fabrica.salida.sistemas.g1.t01-motor.${paso}`;
    guardarAjuste(db, clave('extracto'), JSON.stringify({ json: { pasajes: [{ libro: 'pp-es', pagina: 10, texto: 'El motor de muestra tiene cuatro cilindros' }] }, en: 'x' }));
    guardarAjuste(db, clave('plan'), JSON.stringify({ json: { tarjetas: [{ titulo: 'El motor', idea: 'cilindros', preguntas: ['2-1'], paginas: [10] }, { titulo: 'La hélice', idea: 'empuje', preguntas: ['2-2'], paginas: [11] }, { titulo: 'Cuidarlo', idea: 'rpm', preguntas: [], paginas: [10] }] }, en: 'x' }));
    await correr({ max: 80, avanzarMs: SEIS });
    assert.equal(estadoMateria(db, 'sistemas').estado, 'publicada');
    assert.equal(leerSalida(db, 'sistemas', 1, 't01-motor', 'extracto-2'), null, 'ningún trozo nuevo');
    assert.ok(llamadasDe(db).every(x => x.proposito !== 'fabrica_verificar' || x.entrada_max <= 100_000));
  });
});

test('0.14.17: un paso que no sale queda «pendiente» y se reintenta solo con otra estrategia; al salir, la materia se publica', async () => {
  let malos = 0;
  const antes = texto => {
    if (texto.startsWith(TAREAS.plan) && malos < 2) { malos += 1; return { tarjetas: [] }; }
    return undefined;
  };
  await conFabrica(async ({ db, config, correr, avanzar }) => {
    for (let i = 0; i < 6 && estadoMateria(db, 'sistemas').estado !== 'publicada'; i++) { await correr({ max: 80, avanzarMs: SEIS }); avanzar(3_600_000); }
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    assert.equal(malos, 2);
    const p = e.pendientes.find(x => x.paso === 'plan');
    assert.equal(p.estado, 'resuelta', JSON.stringify(e.pendientes));
    assert.equal(p.intentos, 1, 'salió en el primer reintento');
    assert.equal(leerSalida(db, 'sistemas', 1, 't01-motor', 'plan').nivel, 1, 'con la estrategia siguiente (lectura más corta)');
    assert.ok(leerSalida(db, 'sistemas', 1, 't01-motor', 'tarjetas-1')?.json, 'las tarjetas se escribieron con el plan nuevo');
    // Lo de antes queda guardado (nunca se borra).
    assert.ok(leerSalida(db, 'sistemas', 1, 't01-motor', 'plan.antes1')?.fallido);
  }, { antes });
});

test('0.14.17: lo que sigue sin salir después de 3 reintentos queda en la lista con su motivo y avisa por Telegram (la materia no se frena)', async () => {
  const antes = texto => (texto.startsWith(TAREAS.plan) ? { tarjetas: [] } : undefined);
  await conFabrica(async ({ db, config, correr, avanzar }) => {
    for (let i = 0; i < 12 && !['publicada', 'revision'].includes(estadoMateria(db, 'sistemas').estado); i++) { await correr({ max: 80, avanzarMs: SEIS }); avanzar(25 * 3_600_000); }
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'revision', 'se arma con la duda para el admin');
    const p = e.pendientes.find(x => x.paso === 'plan');
    assert.equal(p.estado, 'agotada');
    assert.equal(p.intentos, 3);
    assert.equal(p.motivo, 'tarjetas_no_validas');
    const clave = 'fabrica_pendiente:sistemas:g1';
    assert.ok(claveDeAvisoValida(clave));
    const aviso = db.prepare('SELECT * FROM avisos WHERE clave = ?').get(clave);
    assert.ok(aviso);
    assert.equal(vaPorTelegram(aviso).va, true);
    const v = vistaFabrica(db, config).materias[0];
    assert.equal(v.pendientes[0].estado, 'agotada');
  }, { antes });
});

test('0.14.17: la mejora profunda trabaja aunque la fábrica esté trabada (su tope), y el panel dice dónde y por qué', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr({ max: 80, avanzarMs: SEIS });
    assert.equal(estadoMateria(db, 'sistemas').estado, 'publicada');
    // Una materia nueva para fabricar, y la fábrica sin saldo propio (antes: la mejora profunda esperaba para siempre).
    const dir = carpetaFuentes(config);
    const man = JSON.parse(readFileSync(join(dir, 'fuentes-manifiesto.json'), 'utf8'));
    man.materias.push({ id: 'aerodinamica', num: 3, nombre: 'Aerodinámica (muestra)', temas: [{ id: 't01-ala', titulo: 'El ala (muestra)', tg: ['3-1'], lecturas: [{ libro: 'pp-es', archivo: 'libro-pp-es-cap02.txt', desde: 10, hasta: 11 }] }] });
    writeFileSync(join(dir, 'fuentes-manifiesto.json'), JSON.stringify(man));
    const tg = JSON.parse(readFileSync(join(dir, 'tg.json'), 'utf8'));
    tg.preguntas.push({ id: '3-1', materia: 'aerodinamica', tema: 't01-ala', enunciado: '¿Qué empuja la hélice?', opciones: { A: 'El aire.', B: 'El aceite.' }, correcta: 'A', explicacion: 'p. 11' });
    writeFileSync(join(dir, 'tg.json'), JSON.stringify(tg));
    guardarConfigFabrica(db, { topeMicro: 0, profunda: { activa: true } });
    const antes = llamadasDe(db).length;
    await correr({ max: 80, avanzarMs: SEIS });
    const nuevas = llamadasDe(db).slice(antes);
    assert.ok(nuevas.length >= 4 && nuevas.every(x => x.proposito.startsWith('profunda_')), JSON.stringify(nuevas));
    assert.ok(!['publicada', 'revision'].includes(estadoMateria(db, 'aerodinamica').estado), 'la fábrica sigue esperando su saldo');
    const v = vistaFabrica(db, config);
    assert.equal(v.general.espera.motivo, 'tope_fabrica');
    assert.equal(v.general.espera.materia, 'aerodinamica');
  });
});

test('0.14.17: una materia con su paquete hecho a mano en uso (también con la lista vieja sin materias) queda «ya publicada» y nunca en 0 %', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr({ max: 80, avanzarMs: SEIS });
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'publicada');
    // Lo mismo que un paquete hecho a mano: en uso, pero no es de la fábrica; y la lista en uso vieja («todas»).
    guardarMateria(db, 'sistemas', { gen: 1, estado: 'pendiente', version: null, versiones: [], dudas: [], corregidos: [], hechos: [] });
    guardarAjuste(db, AJUSTE_EN_USO, JSON.stringify([{ id: e.version, materias: null }]));
    assert.equal(planDeTrabajo(db, config).materias[0].yaPublicada, true);
    const vAntes = vistaFabrica(db, config).materias[0];
    assert.equal(vAntes.pct, 100);
    assert.equal(vAntes.estado, 'ya_publicada');
    const falta = vistaLoQueHizo(db, config).falta;
    assert.ok(!falta.some(x => x.clave === 'materia_falta' && x.materia === 'sistemas'), JSON.stringify(falta));
    const n = llamadasDe(db).length;
    await correr({ max: 10, avanzarMs: SEIS });
    assert.equal(estadoMateria(db, 'sistemas').estado, 'ya_publicada');
    assert.equal(llamadasDe(db).length, n, 'nunca se vuelve a fabricar lo hecho a mano');
  });
});

test('0.14.17: «fuentes-manifiesto-extra.json» agrega la Materia 1 (con su libro ya instalado) y solo agrega: lo que no está bien se ignora', async () => {
  const { revisarCarpetaFuentes, leerManifiesto, ARCHIVO_EXTRA } = await import('../src/academia/fuentes.js');
  await conFabrica(async ({ config }) => {
    const dir = carpetaFuentes(config);
    const fh = { id: 'factores_humanos', num: 1, nombre: 'Factores Humanos (muestra)', temas: [{ id: 't01-vision', titulo: 'Visión (muestra)', tg: [], lecturas: [{ libro: 'pp-es', archivo: 'libro-pp-es-cap02.txt', desde: 10, hasta: 11 }] }] };
    const otraSistemas = { id: 'sistemas', num: 2, nombre: 'Pisada', temas: [{ id: 'x', titulo: 'x', tg: [], lecturas: [{ libro: 'pp-es', archivo: 'libro-pp-es-cap02.txt', desde: 10, hasta: 10 }] }] };
    writeFileSync(join(dir, ARCHIVO_EXTRA), JSON.stringify({ materias: [fh, otraSistemas] }));
    const r = revisarCarpetaFuentes(dir);
    assert.equal(r.ok, true, JSON.stringify(r.errores));
    assert.deepEqual(r.extra, ['factores_humanos']);
    const man = leerManifiesto(dir);
    assert.deepEqual(man.materias.map(m => m.id), ['sistemas', 'factores_humanos']);
    assert.equal(man.materias[0].nombre, 'Sistemas (muestra)', 'nunca pisa una materia que ya está');
    // Con preguntas del Test Guide (o mal armado): se ignora, se dice y las fuentes siguen bien.
    writeFileSync(join(dir, ARCHIVO_EXTRA), JSON.stringify({ materias: [{ ...fh, temas: [{ ...fh.temas[0], tg: ['2-1'] }] }] }));
    const r2 = revisarCarpetaFuentes(dir);
    assert.equal(r2.ok, true);
    assert.ok(r2.errores.some(e => e.ruta === ARCHIVO_EXTRA && e.motivo === 'tg_no_vacio'));
    assert.deepEqual(leerManifiesto(dir).materias.map(m => m.id), ['sistemas']);
    writeFileSync(join(dir, ARCHIVO_EXTRA), '{roto');
    assert.equal(revisarCarpetaFuentes(dir).ok, true);
  });
});

test('0.14.17: la cobertura del Test Guide se revisa en código (cada pregunta con su tarjeta) y se ve en «Lo que hizo la IA»', async () => {
  const { preguntaCubierta } = await import('../src/academia/cobertura-tg.js');
  const q = { id: 'tg-5-1', origen: 'test_guide', original: { numero: '5-1', opciones: [{ letra: 'A', texto: '6 meses.' }, { letra: 'C', texto: '24 meses calendario.' }], correcta: 'C' } };
  assert.equal(preguntaCubierta({ secciones: [{ tipo: 'tarjeta', titulo: 'Para el Test Guide', puntos: ['5-1: dentro de los 24 meses.'] }] }, q), true);
  assert.equal(preguntaCubierta({ secciones: [{ tipo: 'tarjeta', titulo: 'El transpondedor', puntos: ['Se prueba cada 24 meses calendario.'] }] }, q), true);
  assert.equal(preguntaCubierta({ secciones: [{ tipo: 'tarjeta', titulo: 'Para el Test Guide', puntos: ['5-11: otra cosa.', '15-1: otra.'] }] }, q), false);
  await conFabrica(async ({ db, config, correr }) => {
    await correr({ max: 80, avanzarMs: SEIS });
    const n = vistaLoQueHizo(db, config).numeros.tgCubierto;
    assert.equal(n.total, 2);
    assert.equal(n.cubiertas, 2, JSON.stringify(n));
  });
});
