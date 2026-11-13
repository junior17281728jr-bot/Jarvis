// Pruebas de la «Mejora profunda de las clases» (0.13.9): proveedor falso (test/fabrica-base.js), reloj de mentira, sin
// red. Apagada no gasta; encendida va DESPUÉS de fabricar lo que falta y ANTES de la mejora continua; respeta su tope;
// nunca cambia el Test Guide, libro_qa, los ids ni las fotos; con dudas espera la revisión del admin.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { carpetaAcademia, leerEnUso } from '../src/academia/paquetes.js';
import { estadoMateria, guardarConfigFabrica, vistaFabrica, leerConfigFabrica } from '../src/academia/fabrica.js';
import { estadoProfunda, publicado, invariantesProfunda, publicarProfundaRevisada, planProfundo } from '../src/academia/fabrica-profunda.js';
import { revisarPaquete } from '../src/academia/formato.js';
import { claveDeAvisoValida } from '../src/avisos/avisos.js';
import { vaPorTelegram } from '../src/canales/avisador.js';
import { partirLeccion } from '../public/tarjetas.js';
import { conFabrica } from './fabrica-base.js';
import { carpetaFuentes, leerManifiesto } from '../src/academia/fuentes.js';

const paqueteDe = (db, config, id) => JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta, 'paquete.json'), 'utf8'));
const propositos = db => db.prepare('SELECT proposito FROM ia_llamadas ORDER BY id').all().map(x => x.proposito);
const SEIS = 6 * 60_000;

test('apagada por defecto: la fábrica no cambia (ni una llamada de más) y el estimado se ve antes de encenderla', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    assert.equal(leerConfigFabrica(db).profunda.activa, false);
    await correr();
    assert.equal(llamadas().length, 6);
    const r = await correr();
    assert.equal(r.at(-1).resultado.motivo, 'terminada');
    assert.equal(llamadas().length, 6, 'apagada: cero llamadas');
    const v = vistaFabrica(db, config);
    assert.equal(v.estado, 'terminada');
    assert.equal(v.profunda.activa, false);
    assert.equal(v.profunda.falta.temas, 1, 'un tema publicado por mejorar');
    assert.equal(v.profunda.falta.pasos, 6, 'plan, tarjetas, cierre, explicaciones, verificar y verificar las explicaciones (0.14.7)');
    assert.ok(v.profunda.falta.micro > 0 && v.profunda.falta.etaMs > 0);
    assert.equal(v.profunda.materias.find(m => m.id === 'sistemas').estado, 'pendiente');
    assert.equal(v.profunda.materias.find(m => m.id === 'aerodinamica').estado, 'sin_fuentes');
  });
});

test('el orden: primero fabrica lo que falta, después la mejora profunda (0.14.7: Opus escribe y otra llamada de Opus verifica) y al final la continua', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    guardarConfigFabrica(db, { profunda: { activa: true } });
    const v0 = vistaFabrica(db, config);
    assert.equal(v0.profunda.falta.temas, 0, 'todavía no hay nada publicado: nada que mejorar');
    const r = await correr({ max: 80, avanzarMs: SEIS });
    assert.equal(r.at(-1).resultado.motivo, 'terminada', JSON.stringify(r.slice(-2)));
    assert.equal(r.at(-1).resultado.mejora, 'sin_evidencia', 'al terminar la profunda, la continua mira su evidencia');
    assert.deepEqual(propositos(db), [...Array(5).fill('fabrica_escribir'), 'fabrica_verificar', ...Array(4).fill('profunda_escribir_opus'), 'profunda_verificar_opus', 'profunda_verificar_opus']);
    const cuerpo = p => (typeof p.cuerpo === 'string' ? JSON.parse(p.cuerpo) : p.cuerpo);
    const modelos = llamadas().slice(6).map(p => cuerpo(p).model);
    assert.deepEqual(modelos, Array(6).fill('claude-opus-5-5'));
    // Opus 5.5: esfuerzo «medium», 8 192 tokens (lo que piensa entra ahí), sin «thinking» ni muestreo (anthropic.js).
    for (const p of llamadas().slice(6)) { const c = cuerpo(p); assert.equal(c.output_config.effort, 'medium'); assert.equal(c.max_tokens, 8192); assert.equal(c.thinking, undefined); assert.equal(c.temperature, undefined); }
    // Los dos de verificar comparten su «sistema» (caché) y es OTRO que el de escribir (una pasada independiente).
    const verif = llamadas().slice(10).map(p => cuerpo(p).system[0].text);
    assert.equal(new Set(verif).size, 1);
    assert.ok(!verif[0].includes('Eres el autor'));
    // El «sistema» de los pasos de escritura es el mismo (caché) y trae la guía corta de cómo se aprende.
    const sistemas = llamadas().slice(6, 10).map(p => cuerpo(p).system[0].text);
    assert.equal(new Set(sistemas).size, 1);
    assert.equal(cuerpo(llamadas()[6]).system[0].cache_control.type, 'ephemeral');
    assert.match(sistemas[0], /Práctica de recuerdo/);
    const e = estadoProfunda(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    // Otra pasada: ya no gasta nada.
    const n = llamadas().length;
    const r2 = await correr();
    assert.equal(r2.at(-1).resultado.motivo, 'terminada');
    assert.equal(llamadas().length, n);
    assert.equal(vistaFabrica(db, config).profunda.falta.pasos, 0);
  });
});

test('la clase reescrita: el patrón nuevo, el Test Guide TAL CUAL, los mismos ids, las fotos y el aviso por Telegram', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    const viejo = paqueteDe(db, config, v1);
    guardarConfigFabrica(db, { profunda: { activa: true } });
    await correr({ max: 40, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'sistemas');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    assert.notEqual(e.version, v1);
    assert.ok(leerEnUso(db).some(x => x.id === e.version && x.materias.includes('sistemas')), 'publicada sola');
    const nuevo = paqueteDe(db, config, e.version);
    assert.equal(revisarPaquete(nuevo).ok, true);
    // 0.14.7: el Test Guide TAL CUAL (enunciado, opciones, clave, su explicación); solo «sencilla» y «errores» mejoran.
    const sinExplicacion = q => { const { sencilla, errores, ...resto } = q; return resto; };
    assert.deepEqual(nuevo.preguntas.map(sinExplicacion), viejo.preguntas.map(sinExplicacion), 'las preguntas TAL CUAL');
    for (const q of nuevo.preguntas) {
      assert.match(q.sencilla, /^✔ La correcta es: /);
      assert.ok(q.sencilla.includes(q.original.opciones.find(o => o.letra === q.original.correcta).texto));
      assert.deepEqual(Object.keys(q.errores).sort(), Object.keys(viejo.preguntas.find(x => x.id === q.id).errores).sort());
    }
    assert.deepEqual(nuevo.materias[0].temas.map(t => [t.id, t.preguntas]), viejo.materias[0].temas.map(t => [t.id, t.preguntas]), 'los mismos ids');
    const t = nuevo.materias[0].temas[0];
    const titulos = t.secciones.map(s => s.titulo);
    assert.deepEqual(titulos, ['¿Qué es y por qué importa?', 'Mejor: El motor', 'Mejor: La hélice', 'Mejor: Cuidarlo', '¿Te acuerdas?', 'Para el Test Guide', 'Resumen']);
    assert.deepEqual(t.secciones[5], viejo.materias[0].temas[0].secciones.find(s => s.titulo === 'Para el Test Guide'), '«Para el Test Guide» igual');
    assert.equal(t.secciones[1].imagen.archivo, 'img-pp-es-p10-1.webp', 'la foto de la tarjeta de antes sigue (el modelo no la escribió)');
    assert.equal(t.secciones[1].nota, 'Truco para recordar: Motor = músculo del avión.');
    assert.equal(t.reexplicacion[0].texto, 'Otra vez, en fácil: el tema entero en pocas frases.');
    // «¿Te acuerdas?» se ve como tarjetas para girar (el mismo reproductor de siempre).
    const girar = partirLeccion(t.secciones).filter(p => p.tipo === 'girar');
    assert.deepEqual(girar.map(p => p.pregunta), ['¿Qué empuja el avión?', '¿Cuántas ideas por tarjeta?']);
    assert.ok(db.prepare('SELECT 1 FROM avisos WHERE clave = ?').get(`fabrica_profunda:sistemas:${e.version}`));
    assert.ok(claveDeAvisoValida(`fabrica_profunda:sistemas:${e.version}`));
    assert.equal(vaPorTelegram({ clave: `fabrica_profunda:sistemas:${e.version}`, nivel: 'atencion' }).va, true);
    assert.equal(estadoMateria(db, 'sistemas').estado, 'publicada', 'la fábrica no vuelve a fabricarla');
  });
});

test('su tope propio la para sin llamar (y sigue la continua); el tope general también', async () => {
  await conFabrica(async ({ db, config, correr, llamadas }) => {
    await correr();
    guardarConfigFabrica(db, { profunda: { activa: true, topeMicro: 1_000 } });
    const r = await correr({ max: 10 });
    assert.equal(llamadas().length, 6, 'ninguna llamada de la profunda');
    assert.ok(['sin_evidencia', 'semana'].includes(r.at(-1).resultado.mejora), 'con su tope lleno, sigue la mejora continua');
    assert.equal(vistaFabrica(db, config).profunda.espera.motivo, 'tope_profunda');
    assert.equal(estadoProfunda(db, 'sistemas').estado, 'mejorando');
    guardarConfigFabrica(db, { profunda: { topeMicro: 40_000_000 } });
    await correr({ max: 40, avanzarMs: SEIS });
    assert.equal(estadoProfunda(db, 'sistemas').estado, 'publicada');
  });
  await conFabrica(async ({ db, correr, llamadas }) => {
    await correr();
    db.prepare("UPDATE ajustes SET valor = ? WHERE clave = 'ia.config'").run(db.prepare("SELECT valor FROM ajustes WHERE clave = 'ia.config'").get()?.valor ?? '{}');
    guardarConfigFabrica(db, { profunda: { activa: true } });
    const { ponerConfig } = await import('./ia-base.js');
    ponerConfig(db, { topeGeneralMicro: 60_000 });
    const r = await correr({ max: 10 });
    assert.equal(llamadas().length, 6);
    assert.equal(r.at(-1).resultado.profunda, 'tope_general', JSON.stringify(r.at(-1)));
  });
});

test('con dudas del verificador: versión guardada pero «Esperando revisión del admin»; publicar desde la pantalla', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    guardarConfigFabrica(db, { profunda: { activa: true } });
    await correr({ max: 40, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'sistemas');
    assert.equal(e.estado, 'revision');
    assert.ok(e.version);
    assert.ok(e.dudas.some(d => d.problema === 'El libro no dice eso'));
    assert.ok(!leerEnUso(db).some(x => x.id === e.version), 'no se publica sola');
    assert.ok(db.prepare('SELECT 1 FROM avisos WHERE clave = ?').get(`fabrica_revision:sistemas:m${e.version}`));
    assert.equal(vistaFabrica(db, config).profunda.materias.find(m => m.id === 'sistemas').estado, 'revision');
    assert.equal(publicarProfundaRevisada(db, { materia: 'sistemas' }).ok, true);
    assert.ok(leerEnUso(db).some(x => x.id === e.version));
    assert.equal(estadoProfunda(db, 'sistemas').estado, 'publicada');
  }, { dudasProfunda: [{ donde: 'Mejor: El motor', problema: 'El libro no dice eso', gravedad: 'error' }] });
});

test('lo que nunca cambia: una reescritura que toca el Test Guide, libro_qa, los ids o pierde una foto no se guarda', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    await correr();
    const pub = publicado(db, config, 'sistemas');
    const bien = { ...pub.cabeza, libros: [...pub.libros.values()], materias: [{ ...pub.materia, temas: pub.orden }], preguntas: [...pub.preguntas.values()], figuras: [...pub.figuras.values()] };
    assert.deepEqual(invariantesProfunda(pub, bien, 'sistemas'), []);
    const mal = structuredClone(bien);
    mal.preguntas[0].original.opciones[0].texto = 'Otra cosa.';
    mal.materias[0].temas[0].secciones = mal.materias[0].temas[0].secciones.filter(s => !s.imagen);
    mal.materias[0].temas[0].preguntas = ['tg-2-1'];
    const problemas = invariantesProfunda(pub, mal, 'sistemas').map(p => p.problema);
    assert.ok(problemas.includes('pregunta_cambio'));
    assert.ok(problemas.includes('archivo_perdido'));
    assert.ok(problemas.includes('preguntas_cambio'));
    const otroId = structuredClone(bien);
    otroId.materias[0].temas[0].id = 't09-otro';
    assert.ok(invariantesProfunda(pub, otroId, 'sistemas').some(p => p.problema === 'ids_de_temas'));
    const plan = planProfundo(db, config, { man: leerManifiesto(carpetaFuentes(config)) });
    assert.deepEqual(plan.slice(0, 3).map(x => x.id), ['sistemas', 'factores_humanos', 'aerodinamica'], '0.14.7: primero la del Test Guide con más preguntas; empate: su orden');
    assert.equal(plan.at(-1).id, 'oral_escenarios', 'después el oral');
  });
});

test('el oral: el libro (libro_qa) TAL CUAL y «Lo que te puede preguntar el examinador» en inglés', async () => {
  await conFabrica(async ({ db, config, correr }) => {
    guardarConfigFabrica(db, { oral: true });
    await correr({ max: 200, avanzarMs: SEIS });
    assert.equal(estadoMateria(db, 'oral_calificaciones').estado, 'publicada');
    const antes = publicado(db, config, 'oral_calificaciones');
    guardarConfigFabrica(db, { profunda: { activa: true } });
    await correr({ max: 200, avanzarMs: SEIS });
    const e = estadoProfunda(db, 'oral_calificaciones');
    assert.equal(e.estado, 'publicada', JSON.stringify(e));
    const nuevo = paqueteDe(db, config, e.version);
    assert.equal(nuevo.pista, 'oral');
    for (const t of antes.orden) {
      const n = nuevo.materias[0].temas.find(x => x.id === t.id);
      // 0.14.7: el inglés del libro TAL CUAL; su español mejora solo con el verificador de acuerdo.
      assert.deepEqual(n.libro_qa.map(x => [x.n, x.pagina, x.pregunta_en, x.respuesta_en ?? null]), t.libro_qa.map(x => [x.n, x.pagina, x.pregunta_en, x.respuesta_en ?? null]), 'las preguntas y respuestas del libro TAL CUAL');
      for (const x of n.libro_qa) if (x.respuesta_es) assert.ok(x.respuesta_en);
      assert.deepEqual(n.adicionales ?? null, t.adicionales ?? null);
      const ex = n.secciones.find(s => s.titulo === 'Lo que te puede preguntar el examinador');
      assert.match(ex.texto, /Si te preguntan: «May you fly for hire\?» \(¿Puedes volar por paga\?\)/);
    }
    assert.deepEqual(nuevo.preguntas, [...antes.preguntas.values()].filter(q => nuevo.preguntas.some(x => x.id === q.id)));
    assert.equal(nuevo.preguntas.length, antes.preguntas.size);
    assert.equal(estadoProfunda(db, 'oral_escenarios').estado, 'publicada');
  }, { oral: 'completa' });
});
