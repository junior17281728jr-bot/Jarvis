// 0.13.1: la pista oral en la «Fábrica de materias»: fuentes SINTÉTICAS (test/fabrica-base.js: una guía de muestra
// inventada), proveedor falso, reloj de mentira y sin Drive. Lo del libro (la pregunta y la respuesta en inglés) lo copia
// el código TAL CUAL; un tema ya publicado (hecho a mano) se salta TEMA POR TEMA; apagada, la pista oral no llama.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estadoMateria, vistaFabrica, guardarConfigFabrica, informeMateria } from '../src/academia/fabrica.js';
import { revisarOral, partirEscenario, preguntaBien } from '../src/academia/fabrica-oral.js';
import { carpetaAcademia, paqueteActivo, guardarJson, activarPaquete, revisarJson } from '../src/academia/paquetes.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { conFabrica, ORAL } from './fabrica-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';

const leerPaquete = (db, config, id) => {
  const fila = db.prepare('SELECT * FROM academia_paquetes WHERE id = ?').get(id);
  return JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', fila.carpeta, 'paquete.json'), 'utf8'));
};

test('las fuentes orales: capítulos por su número (oral_*), escenarios aparte y lo malo se dice; partir un escenario deja trozos exactos', () => {
  const r = revisarOral(ORAL);
  assert.equal(r.ok, true, JSON.stringify(r.errores));
  assert.deepEqual(r.capitulos.map(c => c.id), ['oral_calificaciones', 'oral_escenarios']);
  assert.equal(r.capitulos[1].temas[0].qa.length, 1);
  assert.equal(revisarOral({}).ok, false);
  assert.equal(revisarOral({ capitulos: [] }).ok, false, 'lo de antes (sin materias) no rompe nada');
  const malo = structuredClone(ORAL);
  malo.materias[0].num = 12;
  assert.ok(revisarOral(malo).errores.some(e => e.ruta === 'oral.materias[0].num'));
  const texto = ORAL.escenarios[0].texto_en;
  const p = partirEscenario(texto, 'May you accept the money?');
  assert.ok(texto.startsWith(p.pregunta_en) && texto.endsWith(p.respuesta_en));
  assert.match(p.respuesta_en, /^No\./);
  const q = partirEscenario(texto, 'esto no está en el texto');
  assert.ok(texto.includes(q.pregunta_en) && texto.includes(q.respuesta_en), 'sin el corte del modelo: en la primera línea con «?»');
  assert.equal(partirEscenario('Sin pregunta ni corte.').respuesta_en, null);
  // El libro corta las líneas: las últimas palabras de la pregunta pueden cruzar un salto de línea.
  const largo = 'Your sample friend asks for a ride and wants\nto know what the rules say. Explain it\nI must explain the sample rules first.';
  const r2 = partirEscenario(largo, 'wants to know what the rules say. Explain it');
  assert.equal(r2.respuesta_en, 'I must explain the sample rules first.');
  assert.ok(largo.startsWith(r2.pregunta_en));
  assert.equal(preguntaBien({ enunciado: 'x', opciones: [{ letra: 'A', texto: 'a' }, { letra: 'B', texto: 'A' }, { letra: 'C', texto: 'c' }], correcta: 'A', explicacion: 'e', errores: [{ letra: 'B', idea: 'i' }, { letra: 'C', idea: 'i' }], como: 'c' }), false, 'dos opciones iguales');
});

test('encendida, la fábrica arma la pista oral después del Test Guide: clases, el libro TAL CUAL, preguntas con su origen, verificada y publicada', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    let r = await correr({ max: 80 });
    assert.equal(r.at(-1).resultado.motivo, 'terminada');
    const soloTg = llamadas().length;
    assert.equal(estadoMateria(db, 'oral_calificaciones').estado, 'pendiente', 'apagada: ni una llamada de la pista oral');
    assert.equal(vistaFabrica(db, config).oral.capitulos.length, 2, 'el plan la muestra igual («Qué falta»)');
    guardarConfigFabrica(db, { oral: true });
    r = await correr({ max: 200, avanzarMs: 6 * 60_000 }); // la cuota de la hora: de a poco
    assert.equal(r.at(-1).resultado?.motivo, 'terminada', JSON.stringify(r.slice(-3)));
    const e = estadoMateria(db, 'oral_calificaciones');
    assert.equal(e.estado, 'publicada', JSON.stringify(e.dudas));
    assert.equal(estadoMateria(db, 'oral_escenarios').estado, 'publicada', JSON.stringify(estadoMateria(db, 'oral_escenarios').dudas));
    // Capítulo 1: 2 temas × (plan, tarjetas-1, libro-1, cierre, verificar) + escenarios (5 pasos).
    assert.equal(llamadas().length - soloTg, 15);
    const p = leerPaquete(db, config, e.version);
    assert.equal(revisarPaquete(p).ok, true, JSON.stringify(revisarPaquete(p).errores));
    assert.equal(p.pista, 'oral');
    const t = p.materias[0].temas[0];
    assert.equal(t.secciones[0].titulo, 'Qué vas a aprender');
    assert.equal(t.secciones[1].imagen.archivo, 'img-oral-en-p3-1.webp', 'la foto de la guía');
    assert.equal(t.secciones[2].visual.tipo, 'diagrama-pasos');
    assert.deepEqual(t.libro_qa.map(x => [x.n, x.pregunta_en, x.respuesta_en, x.pagina]), ORAL.materias[0].temas[0].preguntas.map(x => [x.n, x.pregunta_en, x.respuesta_en, String(x.pagina)]), 'tal cual');
    assert.ok(t.libro_qa[0].explicacion_es && t.libro_qa[0].puntos_clave.length);
    assert.deepEqual(p.materias[0].temas[1].adicionales, [{ n: 1, pregunta_en: 'Describe your sample personal minimums.', pagina: '5' }]);
    for (const q of p.preguntas) {
      const b = ORAL.materias[0].temas.flatMap(x => x.preguntas).find(x => x.pregunta_en === q.fuente_pregunta.pregunta_en);
      assert.equal(q.fuente_pregunta.respuesta_en, b.respuesta_en, 'la respuesta del libro, byte a byte');
      assert.ok(q.fuente_pregunta.como);
    }
    const esc = leerPaquete(db, config, estadoMateria(db, 'oral_escenarios').version);
    const qa = esc.materias[0].temas[0].libro_qa[0];
    assert.equal(`${qa.pregunta_en}\n${qa.respuesta_en}`, ORAL.escenarios[0].texto_en, 'el escenario partido en dos trozos exactos');
    // Lo ve el alumno, aparte del Test Guide.
    const a = paqueteActivo(db, config);
    assert.equal(a.oral.materias.find(m => m.id === 'oral_calificaciones').temas.length, 2);
    assert.ok([...a.oral.preguntas.keys()].every(id => !a.preguntas.has(id)));
    assert.ok(vistaFabrica(db, config).oral.capitulos.every(c => c.pct === 100));
    assert.ok(informeMateria(db, 'oral_escenarios'));
  }, { oral: 'completa' });
});

test('un tema ya publicado a mano se salta (tema por tema) y los dos viven juntos; con dudas, espera la revisión', async () => {
  await conFabrica(async ({ db, config, correr, llamadas, escribir }) => {
    await correr({ max: 80 });
    // Los capítulos «hechos a mano»: el tema t01-a del capítulo 1 y todo el de escenarios.
    const mano = paqueteOralMuestra({ materias: ['oral_calificaciones', 'oral_escenarios'], temas: ['oral_calificaciones/t01-a', 'oral_escenarios/t01-escenarios'], edicion: 'a-mano' });
    const cuerpo = Buffer.from(JSON.stringify(mano));
    const g = await guardarJson(db, config, { cuerpo, revisado: revisarJson(cuerpo), escribir });
    activarPaquete(db, { paqueteId: g.datos.paquete.id, config });
    const v = vistaFabrica(db, config);
    assert.deepEqual(v.oral.capitulos.map(c => [c.id, c.yaPublicados]), [['oral_calificaciones', 1], ['oral_escenarios', 1]]);
    const antes = llamadas().length;
    guardarConfigFabrica(db, { oral: true });
    await correr({ max: 80 });
    assert.equal(llamadas().length - antes, 5, 'solo el tema t02-b');
    assert.ok(!llamadas().slice(antes).some(p => JSON.stringify(p.cuerpo).includes('May a sample private pilot fly for hire')), 'nada del tema ya publicado');
    assert.equal(estadoMateria(db, 'oral_escenarios').estado, 'ya_publicada');
    const e = estadoMateria(db, 'oral_calificaciones');
    assert.equal(e.estado, 'revision', 'la verificación dijo una duda');
    assert.ok(e.dudas.some(d => d.problema === 'No lo dice la página'));
    assert.deepEqual(leerPaquete(db, config, e.version).materias[0].temas.map(t => t.id), ['t02-b']);
  }, { oral: 'completa', dudas: [{ donde: 'libro 1', problema: 'No lo dice la página', gravedad: 'dudoso' }] });
});
