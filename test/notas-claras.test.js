// Pruebas de la Academia 0.14.25: «Notas» clara y «Aprendizaje» claro (pedidos del dueño).
//  - El estado del examen en cada casilla: terminado → su mejor nota con ✅/❌ (por la nota para aprobar de cada intento);
//    empezado y nunca terminado → «A medias» SIN número ni %, aunque haya practicado; solo práctica → «P»; nada → «—».
//  - Cada intento en orden (por la hora en que empezó), numerado 1, 2, 3…; los a medias sin nota; «×N» cuenta todos.
//  - El «Repaso final» (tipo «final») no es un examen; el examen oral abierto sin entregar es «A medias».
//  - Las columnas que nadie empezó se esconden aparte; los códigos M1…M11 no cambian al esconderlas.
//  - Aprendizaje: lo que más fallan, el tema más difícil, la pregunta más fallada, quién necesita ayuda y si mejoran.
// Reloj fijo, sin esperas, paquetes inventados.
import { configDePrueba } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { notasDeTodos, examenesDeTodos, resumenExamen } from '../src/academia/notas.js';
import { resumenClaro, MINIMO, AYUDA_DEBAJO } from '../src/academia/aprendizaje.js';
import { MATERIAS, MATERIAS_ORAL } from '../src/academia/formato.js';
import { estadoCelda, columnasNotas, codigoColumna, lineasIntentos } from '../public/admin-notas.js';

const AHORA = Date.parse('2026-11-17T15:00:00Z');
const MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const PAQUETE = {
  materias: MATERIAS.map(id => (id === 'factores_humanos' || id === 'meteorologia'
    ? { id, temas: [{ id: 't1', titulo: 'Tema uno', preguntas: ['q1'] }, { id: 't2', titulo: 'Tema dos', preguntas: ['q2'] }] }
    : { id, temas: [] })),
  oral: { hay: true, materias: MATERIAS_ORAL.map(id => (id === 'oral_calificaciones' ? { id, temas: [{ id: 'a', titulo: 'Tema a', preguntas: ['o1'] }] } : { id, temas: [] })) },
};

function base() {
  const db = abrirBase(configDePrueba());
  const alumno = nombre => crearUsuario(db, { nombre, claveHash: 'x', debeCambiarClave: false });
  return { db, alumno };
}
// Un examen (o lo que diga tipo): empezado a la hora «empezo»; terminado (con aciertos de total) o a medias (sin terminar).
function intento(db, usuario, { tipo = 'examen', materia = 'factores_humanos', empezo, total = 10, aciertos = 0, terminado = true, umbral = 70, tema = null }) {
  const fin = terminado ? iso(Date.parse(empezo) + 20 * MIN) : null;
  const aprobado = terminado && tipo === 'examen' ? (aciertos * 100 >= umbral * total ? 1 : 0) : null;
  return Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, umbral, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`).run(usuario, tipo, materia, tema, total, terminado ? total : 3, aciertos, umbral, aprobado, empezo, fin).lastInsertRowid);
}
function practica(db, usuario, { materia = 'factores_humanos', tema = 't1', correctas, creada = '2026-11-10T09:00:00.000Z' }) {
  const id = intento(db, usuario, { tipo: 'tema', materia, tema, empezo: creada, total: correctas.length, aciertos: correctas.filter(Boolean).length });
  correctas.forEach((c, i) => db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
    VALUES (?, ?, ?, ?, ?, 'A', ?, ?, ?)`).run(id, usuario, `p${i}`, materia, tema, c, creada.slice(0, 10), creada));
}
const ajusteOral = (db, usuario, v) => db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-13')").run(`academia.oral.${usuario}`, JSON.stringify(v));

test('Notas: cada intento en orden y numerado (los a medias sin nota), ✅/❌ por la nota para aprobar, «A medias» sin número', () => {
  const { db, alumno } = base();
  const ana = alumno('ana');
  const beto = alumno('beto');
  const carla = alumno('carla');
  const dani = alumno('dani');
  // Ana: se insertan desordenados (el id no manda; manda la hora en que empezó).
  intento(db, ana, { empezo: '2026-11-12T10:00:00.000Z', aciertos: 8 }); // 3.ª: 80 % ❌ (se aprueba con 85)
  intento(db, ana, { empezo: '2026-11-10T10:00:00.000Z', aciertos: 5, total: 9 }); // 1.ª: 55 % ❌ (piso)
  intento(db, ana, { empezo: '2026-11-11T10:00:00.000Z', terminado: false }); // 2.ª: a medias
  intento(db, ana, { empezo: '2026-11-13T10:00:00.000Z', aciertos: 47, total: 50 }); // 4.ª: 94 % ✅
  db.prepare("UPDATE academia_intentos SET umbral = 85, aprobado = 0 WHERE usuario_id = ? AND aciertos = 8").run(ana);
  // Un «Repaso final» abandonado y otro terminado: práctica, nunca un examen.
  intento(db, ana, { tipo: 'final', materia: 'meteorologia', empezo: '2026-11-14T10:00:00.000Z', terminado: false });
  intento(db, ana, { tipo: 'final', materia: 'meteorologia', empezo: '2026-11-14T11:00:00.000Z', aciertos: 9 });
  // Beto: practicó bastante (80 %) y empezó el examen sin terminarlo dos veces → «A medias», sin número.
  practica(db, beto, { correctas: [1, 1, 1, 1, 0] });
  intento(db, beto, { empezo: '2026-11-11T10:00:00.000Z', terminado: false, aciertos: 3 });
  intento(db, beto, { empezo: '2026-11-12T10:00:00.000Z', terminado: false, aciertos: 2 });
  // Carla: solo práctica (P). Dani: nada.
  practica(db, carla, { correctas: [1, 0] });
  // El oral: Ana entregó el final 2 veces y tiene un capítulo abierto; Dani tiene el final abierto sin entregar.
  ajusteOral(db, ana, { leidos: [], examenes: { final: { aprobado: true, mejor: 88, ultimo: 70, veces: 2, en: '2026-11-15T10:00:00.000Z' } }, abierto: { id: 'x', alcance: 'oral_calificaciones', preguntas: [] } });
  ajusteOral(db, dani, { leidos: [], examenes: {}, abierto: { id: 'y', alcance: 'final', preguntas: [] } });

  const d = notasDeTodos(db, PAQUETE, AHORA);
  const [a, b, c, x] = d.alumnos;
  // Ana: la mejor nota (94) y aprobó; 4 intentos (contando el a medias), 3 terminados.
  const ex = a.examenes.factores_humanos;
  assert.equal(ex.estado, 'hecho');
  assert.equal(ex.mejor, 94);
  assert.equal(ex.aprobado, true);
  assert.deepEqual([ex.intentos, ex.terminados], [4, 3]);
  assert.deepEqual(lineasIntentos(ex).map(l => [l.n, l.estado, l.pct]), [[1, 'reprobado', 55], [2, 'a_medias', null], [3, 'reprobado', 80], [4, 'aprobado', 94]]);
  assert.deepEqual(lineasIntentos(ex).map(l => l.en.slice(0, 10)), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'], 'en orden, con su fecha');
  assert.deepEqual(estadoCelda(a, 'factores_humanos'), { tipo: 'examen', pct: 94, aprobado: true, intentos: 4 });
  // Lo de antes no cambia: la casilla de la materia sigue siendo el mejor examen terminado.
  assert.deepEqual(a.materias.factores_humanos, { pct: 94, fuente: 'examen', aprobado: true, veces: 3 });
  // El Repaso final no es un examen: meteorología no tiene examen ni «A medias».
  assert.equal(a.examenes.meteorologia, undefined);
  assert.notEqual(estadoCelda(a, 'meteorologia').tipo, 'a_medias');
  // El oral de Ana: el final 2 veces (mejor 88 ✅, el último 70) y el capítulo abierto → «A medias».
  assert.deepEqual(estadoCelda(a, 'oral'), { tipo: 'examen', pct: 88, aprobado: true, intentos: 2 });
  assert.equal(a.examenes.oral.ultimo, 70);
  assert.deepEqual(a.examenes.oral.lista, [], 'del oral no se guarda cada intento');
  assert.deepEqual(estadoCelda(a, 'oral_calificaciones'), { tipo: 'a_medias', intentos: 1 });

  // Beto: a medias, SIN número ni % (aunque su práctica diga 80 %), y «×2».
  const eb = estadoCelda(b, 'factores_humanos');
  assert.deepEqual(eb, { tipo: 'a_medias', intentos: 2 });
  assert.equal('pct' in eb, false, 'a medias no lleva número');
  assert.ok(lineasIntentos(b.examenes.factores_humanos).every(l => l.estado === 'a_medias' && l.pct === null));
  assert.equal(b.examenes.factores_humanos.mejor, null);
  assert.deepEqual(b.materias.factores_humanos, { pct: 80, fuente: 'practica' }, 'la práctica sigue guardada aparte');
  // Carla: solo práctica (P). Dani: el oral final abierto → a medias; el resto sin empezar.
  assert.deepEqual(estadoCelda(c, 'factores_humanos'), { tipo: 'practica', pct: 50 });
  assert.deepEqual(estadoCelda(x, 'factores_humanos'), { tipo: 'nada' });
  assert.deepEqual(estadoCelda(x, 'oral'), { tipo: 'a_medias', intentos: 1 });
  assert.equal(x.examenes.oral.abierto, true);
  db.close();
});

test('Notas: las materias que nadie empezó se esconden aparte; M1…M11 no cambian', () => {
  const { db, alumno } = base();
  const ana = alumno('ana');
  alumno('beto');
  intento(db, ana, { empezo: '2026-11-10T10:00:00.000Z', terminado: false });
  const d = notasDeTodos(db, PAQUETE, AHORA);
  const { visibles, vacias } = columnasNotas(d);
  // Solo factores humanos tiene algo (un examen a medias); meteorología tiene clases pero nadie la empezó; las otras
  // 9 sin clases; el oral, nadie.
  assert.deepEqual(visibles, ['factores_humanos']);
  assert.equal(vacias.length, 11);
  assert.ok(vacias.includes('meteorologia') && vacias.includes('oral'));
  assert.deepEqual([...visibles, ...vacias].sort(), [...MATERIAS, 'oral'].sort());
  assert.equal(codigoColumna(d, 'factores_humanos'), `M${MATERIAS.indexOf('factores_humanos') + 1}`);
  assert.equal(codigoColumna(d, 'meteorologia'), `M${MATERIAS.indexOf('meteorologia') + 1}`);
  assert.equal(codigoColumna(d, MATERIAS[10]), 'M11');
  assert.equal(codigoColumna(d, 'oral'), 'Oral');
  // Sin alumnos: todo escondido, nada falla.
  assert.deepEqual(columnasNotas({ ...d, alumnos: [] }).visibles, []);
  db.close();
});

test('Notas: examenesDeTodos y resumenExamen sin base (un intento terminado con total 0 no cuenta como hecho)', () => {
  const f = (id, u, materia, empezado, terminado, aciertos, total, aprobado, umbral = 70) => ({ id, usuario_id: u, materia, empezado_en: empezado, terminado_en: terminado, aciertos, total, aprobado, umbral });
  const { exMateria, intentosMateria } = examenesDeTodos([
    f(1, 7, 'm', '2026-11-01', '2026-11-01', 6, 10, 0),
    f(2, 7, 'm', '2026-11-02', null, 0, 10, null),
    f(3, 7, 'm', '2026-11-03', '2026-11-03', 9, 10, 1),
    f(4, 8, 'm', '2026-11-03', '2026-11-03', 0, 0, null),
  ]);
  assert.deepEqual(exMateria.get(7).get('m'), { mejor: 90, aprobado: 1, veces: 2 });
  assert.deepEqual(intentosMateria.get(7).get('m').map(x => [x.n, x.completo, x.pct, x.aprobado]), [[1, true, 60, false], [2, false, null, null], [3, true, 90, true]]);
  assert.equal(exMateria.get(8), undefined);
  assert.equal(resumenExamen(intentosMateria.get(8).get('m')).estado, 'a_medias');
  const r = resumenExamen(intentosMateria.get(7).get('m'));
  assert.deepEqual([r.estado, r.mejor, r.aprobado, r.intentos, r.terminados], ['hecho', 90, true, 3, 2]);
});

test('Aprendizaje: lo más importante (lo que más fallan, el tema más difícil, la pregunta, quién necesita ayuda, si mejoran)', () => {
  const filas = [];
  let id = 0;
  const responder = (u, materia, tema, correcta, dia = '2026-11-15') => filas.push({ id: ++id, u, pregunta: `${tema}-${id}`, materia, tema, correcta, creada_en: `${dia}T10:00:00.000Z` });
  // Hipoxia: 30 respuestas, 18 malas (60 %). Ilusiones: 10 respuestas, 8 malas (80 %, menos errores en total). Viento: 4 (pocos).
  for (let i = 0; i < 30; i++) responder(i % 2 ? 1 : 2, 'factores_humanos', 'hipoxia', i < 18 ? 0 : 1);
  for (let i = 0; i < 10; i++) responder(3, 'factores_humanos', 'ilusiones', i < 8 ? 0 : 1);
  for (let i = 0; i < 4; i++) responder(3, 'meteorologia', 'viento', 0);
  // Alumno 4: va bien (todo bien) pero hace un mes; nada reciente.
  for (let i = 0; i < 12; i++) responder(4, 'meteorologia', 'nubes', 1, '2026-10-01');
  const titulo = (m, t) => ({ hipoxia: 'Hipoxia (Hypoxia)', ilusiones: 'Ilusiones', viento: 'Viento', nubes: 'Nubes' })[t];
  const medida = (pct, n) => ({ pct, n, pocos: n < MINIMO });
  const clases = [
    { materia: 'factores_humanos', tema: 'hipoxia', titulo: 'Hipoxia (Hypoxia)', total: medida(30, 20) },
    { materia: 'factores_humanos', tema: 'ilusiones', titulo: 'Ilusiones', total: medida(45, 10) },
    { materia: 'meteorologia', tema: 'viento', titulo: 'Viento', total: medida(0, 4) },
  ];
  // La primera de la lista falla 100 % pero con 3 respuestas (pocos datos): se salta.
  const dificiles = [{ pregunta: 'q1', numero: 1, enunciado: 'Pocas', fallos: medida(100, 3), opcion: 'A' }, { pregunta: 'q9', numero: 123, enunciado: 'What is hypoxia?', fallos: medida(70, 10), opcion: 'B' }];
  const cuentas = [{ id: 1, nombre: 'uno', nombre_visible: 'Uno' }, { id: 2, nombre: 'dos', nombre_visible: '' }, { id: 3, nombre: 'tres' }, { id: 4, nombre: 'cuatro' }, { id: 5, nombre: 'cinco' }];
  const r = resumenClaro({
    filas, clases, dificiles, titulo, cuentas, atrasados: new Set([5, 2]), ahoraMs: AHORA,
    aprendizaje: { primera: medida(55, 40), despues: medida(78, 30) },
  });
  // Lo que más fallan: Hipoxia (más respuestas malas), con su % de malas.
  assert.deepEqual([r.temaMasFallado.tema, r.temaMasFallado.errores, r.temaMasFallado.mal, r.temaMasFallado.n], ['hipoxia', 60, 18, 30]);
  assert.equal(r.temaMasFallado.titulo, 'Hipoxia (Hypoxia)');
  assert.deepEqual(r.temas.map(t => t.tema), ['hipoxia', 'ilusiones'], 'con pocos datos (viento) no entra');
  // El tema más difícil la primera vez: otro distinto del más fallado (Ilusiones 45 %), no el de pocos datos.
  assert.deepEqual([r.temaMasDificil.tema, r.temaMasDificil.primera], ['ilusiones', 45]);
  // La pregunta más fallada.
  assert.deepEqual([r.pregunta.numero, r.pregunta.fallos, r.pregunta.opcion], [123, 70, 'B']);
  // Quién necesita ayuda: 3 acierta 14 % en las últimas 2 semanas (2 bien de 14); 1 y 2 aciertan 40 %
  // (2 va además atrasado); 5 solo atrasado (sin respuestas); 4 va bien y hace un mes (no sale).
  assert.ok(AYUDA_DEBAJO === 60);
  assert.equal(r.ayuda.total, 4);
  assert.deepEqual(r.ayuda.lista.map(x => [x.id, x.acierto, x.bajo, x.atrasado]), [[3, 14, true, false], [1, 40, true, false], [2, 40, true, true]]);
  assert.equal(r.ayuda.lista[2].nombre, 'dos', 'sin nombre visible, su usuario');
  // ¿Mejoran? 55 → 78: sí.
  assert.deepEqual(r.mejoran, { primera: 55, despues: 78, si: true });
  // De un alumno solo: sin «quién necesita ayuda». Con pocos datos: todo null (nunca se afirma con muy poco).
  const solo = resumenClaro({ filas: filas.slice(0, 3), clases: [], dificiles: [dificiles[0]], titulo, cuentas: null, atrasados: new Set(), ahoraMs: AHORA,
    aprendizaje: { primera: medida(50, 3), despues: medida(null, 0) } });
  assert.deepEqual(solo, { temaMasFallado: null, temas: [], temaMasDificil: null, pregunta: null, ayuda: null, mejoran: null });
});

test('las pantallas: los textos nuevos en los dos idiomas, sin HTML pegado ni estilos en línea', () => {
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  for (const archivo of ['admin-notas.js', 'aprendizaje.js']) {
    const js = readFileSync(new URL(`../public/${archivo}`, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|\.style\.|style:/, archivo);
    const claves = new Set([...js.matchAll(/'((?:notas|aprendizaje)\.[a-z0-9_.]+)'/g)].map(m => m[1]));
    assert.ok(claves.size > 20, archivo);
    for (const k of claves) { assert.ok(es[k], `es: ${k}`); assert.ok(en[k], `en: ${k}`); }
  }
  // La numeración de los intentos.
  assert.equal(es['notas.intento.n'], '{n}.ª vez');
  assert.equal(es['notas.medias'], 'A medias');
});
