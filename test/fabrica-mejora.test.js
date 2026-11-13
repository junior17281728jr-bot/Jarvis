// Pruebas de la «Mejora continua» de la fábrica (0.13.0): terminada y sin evidencia → ninguna llamada; con evidencia →
// solo esas tarjetas o explicaciones, dentro de su tope, con el Test Guide igual.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { carpetaAcademia, guardarAjuste, leerAjuste } from '../src/academia/paquetes.js';
import { estadoMateria, guardarConfigFabrica } from '../src/academia/fabrica.js';
import { anotarEvidenciaTarjeta, evidencia, SEMANA_MS } from '../src/academia/fabrica-mejora.js';
import { conFabrica } from './fabrica-base.js';

function alumnos(db, admin, n) {
  return Array.from({ length: n }, (_, i) => crearUsuario(db, { nombre: `alumno${i}`, claveHash: 'x', creadoPor: admin }));
}
function respuestas(db, ids, pregunta, { mal = true } = {}) {
  for (const u of ids) {
    const it = db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, empezado_en) VALUES (?, 'practica', ?)").run(u, new Date().toISOString()).lastInsertRowid;
    db.prepare('INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(it, u, pregunta, 'sistemas', 't01-motor', mal ? 'A' : 'B', mal ? 0 : 1, '2026-11-10', new Date().toISOString());
  }
}
const paqueteDe = (db, config, id) => JSON.parse(readFileSync(join(carpetaAcademia(config), 'paquetes', db.prepare('SELECT carpeta FROM academia_paquetes WHERE id = ?').get(id).carpeta, 'paquete.json'), 'utf8'));

test('terminada y sin evidencia: ninguna llamada (y una vez por semana como mucho)', async () => {
  await conFabrica(async ({ db, correr, llamadas, admin }) => {
    let r = await correr();
    const n = llamadas().length;
    assert.equal(r.at(-1).resultado.mejora, 'sin_evidencia', 'al terminar, mira la evidencia: no hay');
    // Con evidencia de solo 2 alumnos (menos de 3): sigue sin evidencia; y en la misma semana ni mira.
    for (const u of alumnos(db, admin, 2)) anotarEvidenciaTarjeta(db, { materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', usuarioId: u });
    assert.equal(evidencia(db).length, 0);
    r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'semana');
    assert.equal(llamadas().length, n, 'cero llamadas');
  });
});

test('con evidencia: reescribe SOLO esa tarjeta y esa explicación, verifica, publica otra versión y no repite', async () => {
  await conFabrica(async ({ db, config, correr, llamadas, admin, avanzar }) => {
    await correr();
    const v1 = estadoMateria(db, 'sistemas').version;
    const n = llamadas().length;
    const ids = alumnos(db, admin, 6);
    for (const u of ids.slice(0, 3)) anotarEvidenciaTarjeta(db, { materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', usuarioId: u });
    respuestas(db, ids, 'tg-2-1');
    respuestas(db, ids, 'tg-2-2', { mal: false });
    avanzar(SEMANA_MS + 1000);
    const ev = evidencia(db);
    assert.deepEqual(ev.map(x => x.tipo).sort(), ['pregunta', 'tarjeta']);
    assert.equal(ev.find(x => x.tipo === 'pregunta').pregunta, 'tg-2-1');
    const r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'publicada', JSON.stringify(r.at(-1)));
    assert.equal(llamadas().length - n, 3, 'dos reescrituras y una verificación');
    const ultima = JSON.parse(leerAjuste(db, 'fabrica.mejora.ultima'));
    assert.equal(ultima.mejorados.length, 2);
    const viejo = paqueteDe(db, config, v1);
    const nuevo = paqueteDe(db, config, ultima.version);
    const q = id => nuevo.preguntas.find(x => x.id === id);
    assert.equal(q('tg-2-1').sencilla, '✔ Mejor explicada.');
    assert.equal(q('tg-2-2').sencilla, viejo.preguntas.find(x => x.id === 'tg-2-2').sencilla, 'la otra no se toca');
    for (const x of nuevo.preguntas) assert.deepEqual(x.original, viejo.preguntas.find(y => y.id === x.id).original, 'el Test Guide igual');
    const t = nuevo.materias[0].temas[0];
    assert.deepEqual(t.secciones.find(s => s.titulo === 'La hélice').puntos, ['Mejor explicado: cuatro cilindros.'], 'la tarjeta mejorada');
    assert.ok(db.prepare('SELECT 1 FROM avisos WHERE clave = ?').get(`fabrica_mejora:sistemas:${ultima.version}`));
    // La misma evidencia no se vuelve a trabajar (ni la semana que viene).
    avanzar(SEMANA_MS + 1000);
    const m = llamadas().length;
    const r2 = await correr();
    assert.equal(r2.at(-1).resultado.mejora, 'sin_evidencia');
    assert.equal(llamadas().length, m);
  });
});

test('la mejora respeta su tope propio y su interruptor', async () => {
  await conFabrica(async ({ db, correr, llamadas, admin, avanzar }) => {
    await correr();
    const n = llamadas().length;
    for (const u of alumnos(db, admin, 3)) anotarEvidenciaTarjeta(db, { materia: 'sistemas', tema: 't01-motor', titulo: 'La hélice', usuarioId: u });
    avanzar(SEMANA_MS + 1000);
    guardarConfigFabrica(db, { mejora: { activa: false } });
    assert.equal((await correr()).at(-1).resultado.mejora, 'apagada');
    guardarConfigFabrica(db, { mejora: { activa: true, topeMesMicro: 1_000 } });
    guardarAjuste(db, 'fabrica.mejora.ultima', 'null');
    const r = await correr();
    assert.equal(r.at(-1).resultado.mejora, 'tope_fabrica');
    assert.equal(llamadas().length, n);
  });
});
