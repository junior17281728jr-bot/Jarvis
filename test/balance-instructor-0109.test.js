// 0.14.109: «¿Cómo voy?» — el balance sincero del instructor (con y sin IA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ayuda.js';
import { esPreguntaBalance, balanceAlumno, lineasBalance, balanceParaIa, MINIMO_BALANCE } from '../src/academia/profe-chat.js';
import { armarChat } from '../src/academia/instructor-ia.js';

const tema = (id, estado, bien, de, extra = {}) => ({ tema: id, titulo: `Tema ${id}`, estado, clase: de > 0, estudio: { bien, de }, examen: { bien: 0, de: 0 }, dominio: de ? Math.round((bien * 100) / de) : null, ...extra });
const historial = () => ({
  materias: [
    { materia: 'factores_humanos', examen: { veces: 1, mejor: 28, ultimo: 28, aprobado: false }, disponible: true, temas: [tema('a', 'aprobado', 9, 10), tema('b', 'abierto', 2, 8)] },
    { materia: 'comunicacion', examen: null, disponible: false, temas: [tema('c', 'abierto', 0, 4), tema('d', 'abierto', 1, 2)] },
    { materia: 'meteorologia', examen: { veces: 1, mejor: 90, ultimo: 90, aprobado: true }, disponible: true, temas: [tema('e', 'aprobado', 10, 10)] },
    { materia: 'navegacion', examen: null, disponible: false, temas: [tema('f', 'bloqueado', 0, 0)] },
  ],
  oral: { materias: [{ materia: 'oral_x', pct: 40, bien: 2, examen: null }, { materia: 'oral_y', pct: 0, bien: 0, examen: null }], errores: 3, flojos: [] },
  repasos: 2, haceDias: 1,
});

test('reconoce «¿cómo voy?» y no las dudas de un tema', () => {
  for (const m of ['como me ha ido segun tus palabras???', '¿Cómo voy?', 'qué me falta', 'mi progreso', 'How am I doing?']) assert.ok(esPreguntaBalance(m), m);
  for (const m of ['explícame la hipoxia', 'qué es un VOR', '¿cómo funciona el altímetro?']) assert.ok(!esPreguntaBalance(m), m);
});

test('el balance: completadas, empezadas, lo que cuesta (con muestra suficiente) y qué hacer', () => {
  const b = balanceAlumno(historial());
  assert.deepEqual(b.tg.completadas, ['meteorologia']);
  assert.deepEqual(b.tg.enCurso.map(c => c.materia), ['factores_humanos', 'comunicacion']);
  assert.equal(b.tg.sinEmpezar, 1);
  assert.equal(b.tg.bien, 22); assert.equal(b.tg.de, 34);
  // «d» tiene 1 de 2: con menos de MINIMO_BALANCE respuestas no se juzga.
  assert.ok(MINIMO_BALANCE > 2);
  assert.deepEqual(b.flojos.map(f => f.titulo), ['Tema c', 'Tema b']);
  assert.equal(b.fuerte.titulo, 'Tema e');
  assert.equal(b.oral.empezados, 1);
  const claves = lineasBalance(b).map(l => l.clave);
  assert.equal(claves[0], 'profe.bal.completaste');
  assert.ok(claves.includes('profe.bal.cuesta_dos'));
  assert.ok(claves.includes('profe.bal.haz_flojo'));
  assert.ok(claves.length <= 6);
  assert.equal(lineasBalance(b).find(l => l.clave === 'profe.bal.completaste').vars.materias, 'meteorologia');
});

test('sin nada hecho, una sola línea para empezar; y los textos existen en los dos idiomas', async () => {
  const h = historial();
  h.materias = h.materias.map(m => ({ ...m, examen: null, temas: m.temas.map(t => tema(t.tema, 'abierto', 0, 0, { clase: false })) }));
  assert.deepEqual(lineasBalance(balanceAlumno(h)).map(l => l.clave), ['profe.bal.nada']);
  const { readFileSync } = await import('node:fs');
  for (const l of ['es', 'en']) {
    const cat = JSON.parse(readFileSync(new URL(`../public/i18n/${l}.json`, import.meta.url), 'utf8'));
    for (const k of ['nada', 'completaste', 'ninguna', 'empezaste', 'empezaste_dos', 'va.muy_bien', 'va.bien_fuerte', 'va.medio', 'va.cuesta_fuerte', 'cuesta.ninguna', 'cuesta.mayoria', 'cuesta.algunas', 'cuesta_dos', 'examen.cerca', 'examen.lejos', 'oral', 'haz_flojo', 'haz_examen', 'haz_seguir', 'haz_nueva', 'haz_repaso']) assert.ok(cat[`profe.bal.${k}`], `${l} profe.bal.${k}`);
  }
});

test('a la IA: nombres (nunca ids) y la orden de responder como un instructor sincero', () => {
  const ia = balanceParaIa(balanceAlumno(historial()));
  assert.ok(!JSON.stringify(ia).includes('factores_humanos'));
  const p = armarChat({ alumno: {}, material: null, mensaje: '¿cómo voy?', estudio: { balance: ia } });
  assert.match(p.sistema, /CÓMO VA/);
  assert.match(p.sistema, /No empieces con «Tranquilo»/);
  assert.doesNotMatch(armarChat({ alumno: {}, material: null, mensaje: 'hola', estudio: { temas: [] } }).sistema, /CÓMO VA/);
});

test('solo habla de lo que hizo: nada de lo que no ha empezado (pedido del dueño)', async () => {
  const b = balanceAlumno(historial());
  const lineas = lineasBalance(b);
  assert.ok(!JSON.stringify(lineas).includes('navegacion'));
  assert.ok(lineas.every(l => !('faltan' in l.vars) && !('total' in l.vars)));
  const h = historial(); h.oral.materias = h.oral.materias.map(m => ({ ...m, pct: 0, bien: 0 }));
  assert.ok(!lineasBalance(balanceAlumno(h)).some(l => l.clave.startsWith('profe.bal.oral')));
  const ia = balanceParaIa(b);
  assert.ok(!('sin_empezar' in ia) && !('materias_del_test_guide' in ia));
  const { readFileSync } = await import('node:fs');
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  assert.match(es['profe.bal.completaste'], /Estuve revisando/);
});

test('más humano: con palabras, sin porcentajes (pedido del dueño)', async () => {
  const lineas = lineasBalance(balanceAlumno(historial()));
  assert.ok(lineas.every(l => !('pct' in l.vars)));
  assert.ok(lineas.some(l => l.clave.startsWith('profe.bal.va.')));
  const { readFileSync } = await import('node:fs');
  for (const l of ['es', 'en']) {
    const cat = JSON.parse(readFileSync(new URL(`../public/i18n/${l}.json`, import.meta.url), 'utf8'));
    for (const [k, v] of Object.entries(cat)) if (k.startsWith('profe.bal.')) assert.doesNotMatch(v, /%|\{pct\}/, `${l} ${k}`);
  }
  const h = historial(); h.materias[0].temas[1] = tema('b', 'abierto', 0, 6);
  assert.ok(lineasBalance(balanceAlumno(h)).some(l => l.clave === 'profe.bal.cuesta_dos'));
});
