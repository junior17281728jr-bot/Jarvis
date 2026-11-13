// Pruebas de la «Fábrica de materias» (0.13.0): fuentes sintéticas, proveedor falso, reloj de mentira y sin Drive.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { revisarManifiesto, revisarTg, paginasDeTexto, carpetaFuentes } from '../src/academia/fuentes.js';
import { estadoMateria, vistaFabrica, guardarConfigFabrica, leerSalida, tgAlterado, publicarRevisada, reiniciarMateria, estadoGeneral } from '../src/academia/fabrica.js';
import { leerEnUso, carpetaAcademia, guardarAjuste } from '../src/academia/paquetes.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { claveDeAvisoValida } from '../src/avisos/avisos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { ponerConfig } from './ia-base.js';
import { pausarSecreto } from '../src/claves/almacen.js';
import { conFabrica, TG, escribirFuentes } from './fabrica-base.js';

const manifiestoBueno = () => ({
  formato: 'fuentes-academia', version: 1, libros: [{ id: 'pp-es', titulo: 'Libro' }],
  materias: [{ id: 'sistemas', num: 2, nombre: 'Sistemas', temas: [{ id: 't01', titulo: 'Motor', tg: ['2-1'], lecturas: [{ libro: 'pp-es', archivo: 'libro-pp-es-cap02.txt', desde: 1, hasta: 3 }] }] }],
  imagenes: 'imagenes.json', tg: 'tg.json',
});

test('manifiesto y tg.json: lo bien armado pasa y cada error se dice con su lugar', () => {
  assert.equal(revisarManifiesto(manifiestoBueno()).ok, true);
  const casos = [
    [m => { m.formato = 'otro'; }, 'formato'],
    [m => { m.materias[0].id = 'cocina'; }, 'materias[0].id'],
    [m => { m.materias[0].temas[0].lecturas[0].libro = 'nada'; }, 'materias[0].temas[0].lecturas[0].libro'],
    [m => { m.materias[0].temas[0].lecturas[0].archivo = '../secreto.txt'; }, 'materias[0].temas[0].lecturas[0].archivo'],
    [m => { m.materias[0].temas[0].lecturas[0].hasta = 0; }, 'materias[0].temas[0].lecturas[0].desde'],
    [m => { m.materias[0].temas.push({ ...m.materias[0].temas[0], id: 't02' }); }, 'materias[0].temas[1].tg[0]'],
    [m => { m.excluidas = [{ id: '2-1', motivo: 'x' }]; }, 'excluidas[0].id'],
    [m => { m.tg = 'otro.json'; }, 'tg'],
  ];
  for (const [cambiar, ruta] of casos) {
    const m = manifiestoBueno();
    cambiar(m);
    const r = revisarManifiesto(m);
    assert.equal(r.ok, false, ruta);
    assert.ok(r.errores.some(e => e.ruta === ruta), `${ruta}: ${JSON.stringify(r.errores)}`);
  }
  const tg = { preguntas: [{ id: '2-1', materia: 'sistemas', enunciado: 'x', opciones: { A: 'a', B: 'b' }, correcta: 'B', explicacion: 'e' }, { id: '2-2', materia: 'sistemas', enunciado: 'y', opciones: { A: 'a', B: 'b' }, correcta: 'A', explicacion: 'e' }] };
  const r = revisarTg(tg, manifiestoBueno());
  assert.equal(r.ok, false, 'la 2-2 no está en ningún tema ni excluida');
  assert.ok(r.errores.some(e => e.motivo === 'pregunta_sin_tema'));
  assert.equal(revisarTg(tg, { ...manifiestoBueno(), excluidas: [{ id: '2-2', motivo: 'auditada' }] }).ok, true);
  assert.equal(revisarTg({ preguntas: [{ ...tg.preguntas[0], correcta: 'Z' }] }, null).ok, false);
  const paginas = paginasDeTexto('=== p 4 ===\nuno\n=== p 5 ===\ndos\n');
  assert.equal(paginas.get(4), 'uno');
  assert.equal(paginas.get(5), 'dos');
});

test('la fábrica arma una materia entera: paquete válido, Test Guide TAL CUAL, publicado solo y con aviso por Telegram', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    const salidas = await correr();
    assert.ok(salidas.at(-1).listo, JSON.stringify(salidas.at(-1)));
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    assert.equal(llamadas().length, 6, 'plan, tarjetas, preguntas, cierre, extra y verificar');
    // Escribir con Sonnet 5.5 (con la caché del sistema), verificar con Haiku 5.5. Nunca un dato personal.
    const cuerpo = p => (typeof p.cuerpo === 'string' ? JSON.parse(p.cuerpo) : p.cuerpo);
    const modelos = llamadas().map(p => cuerpo(p).model);
    assert.deepEqual(modelos.slice(0, 5), Array(5).fill('claude-sonnet-5-5'));
    assert.equal(modelos[5], 'claude-haiku-5-5');
    assert.equal(cuerpo(llamadas()[0]).system[0].cache_control.type, 'ephemeral');
    assert.ok(!llamadas().some(p => /junior|maria/.test(JSON.stringify(p.cuerpo))), 'nunca un nombre');
    const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(e.version);
    assert.equal(fila.estado, 'listo');
    assert.ok(leerEnUso(db).some(x => x.id === e.version && x.materias.includes('sistemas')));
    const p = JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json'), 'utf8'));
    assert.equal(revisarPaquete(p).ok, true);
    for (const f of TG) {
      const q = p.preguntas.find(x => x.id === `tg-${f.id}`);
      assert.equal(q.original.enunciado, f.enunciado, 'byte a byte (con los espacios)');
      assert.equal(q.original.explicacion, f.explicacion);
      assert.equal(q.original.correcta, f.correcta);
      assert.deepEqual(q.original.opciones, Object.keys(f.opciones).map(letra => ({ letra, texto: f.opciones[letra] })));
    }
    assert.deepEqual(tgAlterado(p, new Map(TG.map(q => [q.id, q]))), []);
    const t = p.materias[0].temas[0];
    assert.deepEqual(t.secciones.map(s => s.titulo), ['Qué vas a aprender', 'El motor', 'La hélice', 'Cuidarlo', 'Para el Test Guide', 'Resumen']);
    assert.equal(t.secciones[1].imagen.archivo, 'img-pp-es-p10-1.webp', 'la foto del libro');
    assert.equal(t.secciones[2].visual.tipo, 'diagrama-pasos', 'o un dibujo con sus datos');
    assert.ok(t.secciones[4].puntos[0].startsWith('Si te preguntan…'));
    assert.equal(p.materias[0].extra.preguntas.length, 1, 'la pregunta extra con una cita que no está en el libro se quitó');
    assert.equal(p.figuras[0].archivo, 'fig-2.webp');
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = ?").get(`fabrica_publicada:sistemas:${e.version}`));
    assert.ok(claveDeAvisoValida(`fabrica_publicada:sistemas:${e.version}`));
    assert.equal(vaPorTelegram({ clave: `fabrica_publicada:sistemas:${e.version}`, nivel: 'atencion' }).va, true);
    // Terminada: otra pasada no llama a la IA.
    const r = await correr();
    assert.equal(r.at(-1).resultado.motivo, 'terminada');
    assert.equal(llamadas().length, 6);
    assert.equal(estadoGeneral(db).terminada, true);
    const v = vistaFabrica(db, config);
    assert.equal(v.estado, 'terminada');
    assert.equal(v.materias[0].pct, 100);
    assert.ok(v.gastoMicro > 0);
  });
});

test('sigue donde quedó después de un corte: nunca repite un paso ni lo paga dos veces', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    await correr({ max: 3 });
    const antes = llamadas().length;
    assert.ok(antes >= 2 && antes < 6);
    // Se cortó justo después de pagar el siguiente paso (su respuesta quedó guardada con el costo): no se vuelve a llamar.
    const plan = leerSalida(db, 'sistemas', 1, 't01-motor', 'plan');
    assert.ok(plan.json);
    await correr();
    assert.equal(llamadas().length, 6, 'cada paso una sola vez en total');
    assert.equal(estadoMateria(db, 'sistemas').estado, 'publicada');
  });
});

test('una respuesta guardada pero no anotada (corte en el medio) se usa sin llamar otra vez', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    await correr({ max: 2 }); // plan
    const n = llamadas().length;
    // La respuesta del paso de tarjetas quedó pagada y guardada (crudo), pero la tarea se cortó antes de seguir.
    const plan = leerSalida(db, 'sistemas', 1, 't01-motor', 'plan').json.tarjetas;
    const tj = t => ({ titulo: t.titulo, puntos: ['El motor tiene cuatro cilindros.'], recuerda: 'r', ejemplo: 'e', ingles: [], paginas: [10], imagen: null, visual: { tipo: 'diagrama-partes', parametros: { elementos: [{ nombre: 'Cilindro' }, { nombre: 'Pistón' }] } }, solo_texto: null });
    guardarAjuste(db, 'fabrica.salida.sistemas.g1.t01-motor.tarjetas-1.crudo', JSON.stringify({ json: { tarjetas: plan.map(tj) }, intento: 0, en: new Date().toISOString() }));
    await correr({ max: 1 });
    assert.equal(llamadas().length, n, 'no llamó');
    assert.ok(leerSalida(db, 'sistemas', 1, 't01-motor', 'tarjetas-1').json);
  });
});

test('el tope propio de la fábrica la para sin llamar; al subirlo, sigue', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    guardarConfigFabrica(db, { topeMicro: 10_000 }); // menos que lo que aparta UNA llamada
    let r = await correr();
    assert.equal(r.at(-1).resultado.motivo, 'tope_fabrica');
    assert.equal(llamadas().length, 0);
    assert.equal(estadoGeneral(db).espera.motivo, 'tope_fabrica');
    guardarConfigFabrica(db, { topeMicro: 20_000_000 });
    r = await correr();
    assert.equal(estadoMateria(db, 'sistemas').estado, 'publicada');
  });
  // El tope general (deja libre el 20 % para los alumnos).
  await conFabrica(async ({ correr, llamadas }) => {
    const r = await correr();
    assert.equal(r.at(-1).resultado.motivo, 'tope_general');
    assert.equal(llamadas().length, 0);
  }, { tope: 50_000 });
});

test('si la verificación encuentra dudas, la versión se guarda pero espera la revisión del admin (y se puede publicar)', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    const e = estadoMateria(db, 'sistemas');
    assert.equal(e.estado, 'revision');
    assert.ok(e.version);
    assert.ok(e.dudas.some(d => d.problema === 'El libro dice otra cosa'));
    assert.ok(!leerEnUso(db).some(x => x.id === e.version), 'no se publica sola');
    assert.ok(db.prepare("SELECT 1 FROM avisos WHERE clave = 'fabrica_revision:sistemas:g1'").get());
    assert.equal(vistaFabrica(db, config).materias[0].estado, 'revision');
    assert.equal(publicarRevisada(db, { materia: 'sistemas' }).ok, true);
    assert.ok(leerEnUso(db).some(x => x.id === e.version));
  }, { dudas: [{ donde: 'El motor', problema: 'El libro dice otra cosa', gravedad: 'error' }] });
});

test('sin clave que funcione, sin fuentes, en pausa o con la IA apagada: ninguna llamada', async () => {
  await conFabrica(async ({ correr, llamadas }) => {
    const r = await correr();
    assert.equal(r.at(-1).resultado.motivo, 'sin_fuentes');
    assert.equal(llamadas().length, 0);
  }, { fuentes: false });
  await conFabrica(async ({ correr, llamadas }) => {
    const r = await correr();
    assert.equal(r.at(-1).resultado.motivo, 'ia_apagada');
    assert.equal(llamadas().length, 0);
  }, { encendida: false });
  await conFabrica(async ({ db, correr, llamadas }) => {
    guardarConfigFabrica(db, { pausada: true });
    assert.equal((await correr()).at(-1).resultado.motivo, 'pausada');
    assert.equal(llamadas().length, 0);
  });
  await conFabrica(async ({ db, correr, llamadas, secretoId }) => {
    pausarSecreto(db, { id: secretoId, motivo: 'sin_credito', hastaMs: null, ahora: Date.now() });
    const r = await correr();
    assert.notEqual(r.at(-1).resultado.motivo, 'terminada');
    assert.equal(llamadas().length, 0, 'la clave en pausa: no llama');
  });
  // Arranca SOLA en cuanto hay clave y fuentes (la pasada de cada hora), sin que nadie toque nada.
  await conFabrica(async ({ config, correr, llamadas, db }) => {
    assert.equal((await correr()).at(-1).resultado.motivo, 'sin_fuentes');
    escribirFuentes(config);
    guardarAjuste(db, 'fabrica.estado', JSON.stringify({ ...estadoGeneral(db), ultimaSync: null }));
    await correr();
    assert.equal(llamadas().length, 6);
  }, { fuentes: false });
});

test('la cuota de la hora: la fábrica usa como mucho la mitad de las llamadas y espera lo que falta', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    ponerConfig(db, { llamadasPorHora: 6 }); // propia: 3; total libre para alumnos: 2
    const r = await correr();
    assert.equal(llamadas().length, 3);
    assert.equal(r.at(-1).motivo, 'fabrica_cuota');
    assert.ok(r.at(-1).esperarMs > 60_000);
  });
});

test('reiniciar una materia: generación nueva, lo de antes queda guardado', async () => {
  await conFabrica(async ({ db, correr, llamadas }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    reiniciarMateria(db, 'sistemas');
    assert.equal(estadoMateria(db, 'sistemas').gen, 2);
    assert.ok(leerSalida(db, 'sistemas', 1, 't01-motor', 'plan').json, 'lo de antes sigue');
    await correr();
    assert.equal(llamadas().length, 12);
    assert.notEqual(estadoMateria(db, 'sistemas').version, v1);
    assert.ok(carpetaFuentes);
  });
});
