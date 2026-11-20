// Pruebas de la Academia 0.14.71: «Notas por materia» (Administrador → Alumnos → Notas por materia).
//  - Cada casilla: aprobada y completa, a medias (práctica), se quemó, fue directo, convalidada; las materias sin clases «—».
//  - La columna del oral (examen final o práctica, y sus temas).
//  - El total de cada alumno (temas de todo el curso, materias completas, nota general).
//  - El color con la nota de aprobar de «Ajustes del curso» (aquí 80 %, ni 70 ni 90).
//  - El CSV (exacto) y el texto de «Copiar».
//  - Solo el administrador: 403 para un alumno; el administrador no sale en las filas. Y las consultas no crecen.
// Reloj fijo, sin esperas. Los paquetes de aquí son inventados (nada de ningún libro).
import { configDePrueba, conServidor, hashClave } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { resumenPorMateria, celdaMateria, totalAlumno } from '../src/academia/resumen-materias.js';
import { MATERIAS, MATERIAS_ORAL } from '../src/academia/formato.js';
import { tonoAprobar, textosCelda, csvResumen, textoCopiar, celdaCsv, columnasResumen } from '../public/admin-resumen.js';
import { AREAS_ADMIN, areaAdmin } from '../public/navegacion.js';

const AHORA = Date.parse('2026-11-20T15:00:00Z');
const MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
// Como t() de public/app.js: «{n|uno|varios}» elige por el número; después las variables.
const t = (k, v = {}) => String(es[k] ?? k).replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, x, uno, varios) => (Number(v[x]) === 1 ? uno : varios)).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
const nombreMateria = id => es[`acad.materia.${id}`] ?? id;

// Factores humanos con 2 temas (las otras 10 sin clases) y el oral con un capítulo de 2 temas.
const PAQUETE = {
  materias: MATERIAS.map(id => (id === 'factores_humanos'
    ? { id, temas: [{ id: 't1', titulo: 'Tema uno', preguntas: ['q1', 'q2'] }, { id: 't2', titulo: 'Tema dos', preguntas: ['q3', 'q4'] }] }
    : { id, temas: [] })),
  oral: {
    hay: true,
    materias: MATERIAS_ORAL.map(id => (id === 'oral_calificaciones'
      ? { id, temas: [{ id: 'a', titulo: 'Tema a', preguntas: ['o1', 'o2'] }, { id: 'b', titulo: 'Tema b', preguntas: ['o3'] }] }
      : { id, temas: [] })),
  },
};

function base() {
  const db = abrirBase(configDePrueba());
  const alumno = (nombre, rol = 'usuario') => crearUsuario(db, { nombre, claveHash: 'x', rol, debeCambiarClave: false });
  return { db, alumno };
}
function intento(db, usuario, { tipo, tema = null, respuestas, terminado = null, aprobado = null, materia = 'factores_humanos' }) {
  const aciertos = respuestas.filter(([, c]) => c).length;
  const cuando = terminado ?? '2026-11-19T10:00:00.000Z';
  const id = Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`).run(usuario, tipo, materia, tema, respuestas.length, respuestas.length, aciertos, aprobado, iso(Date.parse(cuando) - 10 * MIN), terminado).lastInsertRowid);
  respuestas.forEach(([tm, c], i) => db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
    VALUES (?, ?, ?, ?, ?, 'A', ?, ?, ?)`).run(id, usuario, `q${i + 1}`, materia, tm, c, cuando.slice(0, 10), cuando));
  return id;
}
const ajuste = (db, clave, valor) => db.prepare("INSERT OR REPLACE INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-19')").run(clave, typeof valor === 'string' ? valor : JSON.stringify(valor));
const temaAprobado = (db, u, tema) => intento(db, u, { tipo: 'tema', tema, respuestas: [[tema, 1], [tema, 1]], terminado: '2026-11-18T10:00:00.000Z', aprobado: 1 });
const salto = (db, u, intentoId) => ajuste(db, `academia.saltos.${u}`, { orden: { factores_humanos: 'examen_antes' }, eventos: [{ materia: 'factores_humanos', intento: intentoId, pendientes: 2, total: 2, en: '2026-11-19T09:00:00.000Z' }] });

// El grupo de las pruebas (la nota de aprobar del curso: 80 %).
function grupo() {
  const { db, alumno } = base();
  ajuste(db, 'academia.aprobar_pct', '80');
  const junior = alumno('junior', 'admin');
  const ana = alumno('ana'); // aprobó todo: los 2 temas y el examen (95 %); el oral leído entero y su final aprobado (88 %)
  const beto = alumno('beto'); // a medias: 1 tema de 2, sin examen (práctica 75 %); en el oral, solo práctica
  const carla = alumno('carla'); // fue directo al examen y se quemó (50 %)
  const dani = alumno('dani'); // fue directo y aprobó: convalidada (92 %)
  const eva = alumno('eva'); // fue directo y dejó el examen sin entregar
  // El administrador también estudia: nunca sale en la tabla.
  temaAprobado(db, junior, 't1');

  temaAprobado(db, ana, 't1');
  temaAprobado(db, ana, 't2');
  intento(db, ana, { tipo: 'examen', respuestas: [...Array(19).fill(['t1', 1]), ['t2', 0]], terminado: '2026-11-19T12:00:00.000Z', aprobado: 1 });
  ajuste(db, `academia.oral.${ana}`, { leidos: ['oral_calificaciones/a', 'oral_calificaciones/b'], examenes: { final: { mejor: 88, ultimo: 88, aprobado: true, veces: 1 } } });

  temaAprobado(db, beto, 't1');
  intento(db, beto, { tipo: 'repaso', respuestas: [['t2', 1], ['t2', 0]], terminado: '2026-11-19T11:00:00.000Z' }); // t1 2/2 + t2 1/2 → 3 de 4 = 75 %
  ['o1', 'o2', 'o3', 'o4'].forEach((q, i) => db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
    VALUES (?, NULL, 'oral_calificaciones', 'a', ?, 'oral_practica', 'A', ?, '2026-11-19', '2026-11-19T13:00:00.000Z')`).run(beto, q, i < 3 ? 1 : 0)); // 3 de 4 = 75 %

  salto(db, carla, intento(db, carla, { tipo: 'examen', respuestas: [['t1', 1], ['t2', 0]], terminado: '2026-11-19T12:00:00.000Z', aprobado: 0 }));

  const deDani = intento(db, dani, { tipo: 'examen', respuestas: [...Array(23).fill(['t1', 1]), ['t2', 0], ['t2', 1]], terminado: '2026-11-19T12:00:00.000Z', aprobado: 1 }); // 24/25 = 96
  salto(db, dani, deDani);
  ajuste(db, `academia.convalidadas.${dani}`, { factores_humanos: { intento: deDani, pct: 92, umbral: 80, en: '2026-11-19T12:00:00.000Z' } });

  salto(db, eva, intento(db, eva, { tipo: 'examen', respuestas: [], terminado: null }));
  return { db, junior, ana, beto, carla, dani, eva };
}

test('cada casilla: completa, a medias con práctica, se quemó, fue directo y convalidada; las materias sin clases «—»', () => {
  const { db, ana, beto, carla, dani, eva, junior } = grupo();
  const d = resumenPorMateria(db, PAQUETE, AHORA);
  assert.equal(d.umbral, 80, 'la nota de aprobar de Ajustes del curso');
  assert.equal(d.materias.length, 11);
  assert.deepEqual(d.materias.filter(m => !m.pronto).map(m => m.id), ['factores_humanos']);
  assert.deepEqual(d.alumnos.map(a => a.id), [ana, beto, carla, dani, eva], 'el administrador no sale');
  assert.ok(!d.alumnos.some(a => a.id === junior));
  const de = id => d.alumnos.find(a => a.id === id).materias.factores_humanos;

  assert.deepEqual(de(ana), { pronto: false, nota: { pct: 95, fuente: 'examen', aprobado: true }, examen: 'hecho', hechos: 2, temas: 2, completa: true, salto: null });
  assert.deepEqual(de(beto), { pronto: false, nota: { pct: 75, fuente: 'practica', aprobado: false }, examen: null, hechos: 1, temas: 2, completa: false, salto: null });
  assert.deepEqual(de(carla), { pronto: false, nota: { pct: 50, fuente: 'examen', aprobado: false }, examen: 'hecho', hechos: 0, temas: 2, completa: false, salto: { tipo: 'quemado', pct: 50 } });
  assert.deepEqual(de(dani), { pronto: false, nota: { pct: 96, fuente: 'examen', aprobado: true }, examen: 'hecho', hechos: 2, temas: 2, completa: true, salto: { tipo: 'convalidada', pct: 92 } });
  assert.deepEqual(de(eva), { pronto: false, nota: null, examen: 'a_medias', hechos: 0, temas: 2, completa: false, salto: { tipo: 'directo' } });
  // Una materia sin clases todavía: «—» (pronto), para todos.
  for (const a of d.alumnos) assert.deepEqual(a.materias.sistemas, { pronto: true, nota: null, examen: null, hechos: 0, temas: 0, completa: false, salto: null });

  // En palabras (lo mismo en la pantalla, el CSV y «Copiar»).
  assert.deepEqual(textosCelda(de(ana), t), { nota: '95 %', estado: '✓ completa', salto: '' });
  assert.deepEqual(textosCelda(de(beto), t), { nota: 'P 75 %', estado: '1 de 2 temas', salto: '' });
  assert.deepEqual(textosCelda(de(carla), t), { nota: '50 %', estado: '0 de 2 temas', salto: 'Se quemó (50 %)' });
  assert.deepEqual(textosCelda(de(dani), t), { nota: '96 %', estado: '✓ completa', salto: 'Convalidada (examen 92 %)' });
  assert.deepEqual(textosCelda(de(eva), t), { nota: '—', estado: '0 de 2 temas', salto: 'Fue directo al examen' });
  assert.deepEqual(textosCelda(d.alumnos[0].materias.sistemas, t), { nota: '—', estado: 'pronto', salto: '' });
  // Los temas listos sin examen aprobado no es «completa».
  assert.equal(textosCelda(celdaMateria({ nota: { pct: 60, fuente: 'examen', aprobado: false }, examen: { estado: 'hecho', aprobado: false, mejor: 60 }, bloque: { temas: [1, 2], hechos: 2 } }), t).estado, 'temas listos, falta aprobar el examen');
  assert.equal(textosCelda(celdaMateria({ bloque: { temas: [1, 2], hechos: 2 } }), t).estado, 'temas listos, falta el examen');
  assert.equal(textosCelda(celdaMateria({ bloque: { temas: [1], hechos: 0 } }), t).estado, '0 de 1 tema', 'en singular');
  assert.equal(textosCelda({ ...celdaMateria({ bloque: { temas: [1], hechos: 1 } }), salto: { tipo: 'convalidada', capitulos: 1 } }, t).salto, '1 capítulo convalidado');
  db.close();
});

test('el color va con la nota de aprobar del curso (80 %): no con 70/50 ni con el 90 de siempre', () => {
  assert.equal(tonoAprobar(80, 80), 'bien');
  assert.equal(tonoAprobar(79, 80), 'mal');
  assert.equal(tonoAprobar(75, 80), 'mal', 'con 70 sería verde');
  assert.equal(tonoAprobar(85, 80), 'bien', 'con 90 sería rojo');
  assert.equal(tonoAprobar(0, 80), 'mal');
  assert.equal(tonoAprobar(null, 80), 'nada');
});

test('la columna del oral: el examen final (o la práctica) y sus temas', () => {
  const { db, ana, beto, carla } = grupo();
  const d = resumenPorMateria(db, PAQUETE, AHORA);
  assert.deepEqual(d.oral, { hay: true, temas: 2 });
  assert.equal(columnasResumen(d).at(-1).id, 'oral');
  const oral = id => d.alumnos.find(a => a.id === id).oral;
  assert.deepEqual(oral(ana), { pronto: false, nota: { pct: 88, fuente: 'examen', aprobado: true }, examen: 'hecho', hechos: 2, temas: 2, completa: true, salto: null, capitulos: 1 });
  assert.deepEqual(oral(beto), { pronto: false, nota: { pct: 75, fuente: 'practica', aprobado: false }, examen: null, hechos: 1, temas: 2, completa: false, salto: null, capitulos: 1 });
  assert.equal(oral(carla).nota, null);
  assert.deepEqual(textosCelda(oral(ana), t), { nota: '88 %', estado: '✓ completa', salto: '' });
  assert.deepEqual(textosCelda(oral(beto), t), { nota: 'P 75 %', estado: '1 de 2 temas', salto: '' }, 'practicó todas las preguntas del tema a');
  // Sin oral en el paquete: sin columna.
  const sin = resumenPorMateria(db, { ...PAQUETE, oral: { hay: false, materias: [] } }, AHORA);
  assert.equal(sin.alumnos[0].oral, null);
  assert.ok(!columnasResumen(sin).some(c => c.id === 'oral'));
  db.close();
});

test('el total: los temas de todo el curso (Test Guide y oral), las materias completas y la nota general', () => {
  const { db, ana, beto, dani, eva } = grupo();
  const d = resumenPorMateria(db, PAQUETE, AHORA);
  const total = id => d.alumnos.find(a => a.id === id).total;
  // Ana: 2 + 2 de 4 temas; Factores humanos y el oral completos; general = 95 / 11.
  assert.deepEqual(total(ana), { hechos: 4, temas: 4, pct: 100, completas: 2, conClases: 2, general: { pct: 8, aprobados: 1, total: 11, conExamen: true } });
  assert.deepEqual(total(beto), { hechos: 2, temas: 4, pct: 50, completas: 0, conClases: 2, general: { pct: 0, aprobados: 0, total: 11, conExamen: false } });
  assert.deepEqual(total(dani), { hechos: 2, temas: 4, pct: 50, completas: 1, conClases: 2, general: { pct: 8, aprobados: 1, total: 11, conExamen: true } });
  assert.equal(total(eva).pct, 0);
  // La cuenta sola: las materias sin clases no entran.
  assert.deepEqual(totalAlumno([{ pronto: true, temas: 0, hechos: 0 }, { pronto: false, temas: 3, hechos: 1, completa: false }, null], null),
    { hechos: 1, temas: 3, pct: 33, completas: 0, conClases: 1, general: null });
  db.close();
});

test('el CSV (para Excel) y el texto de «Copiar» (para WhatsApp)', () => {
  const d = {
    ahora: iso(AHORA), umbral: 80,
    materias: MATERIAS.map((id, i) => ({ id, numero: i + 1, pronto: id !== 'factores_humanos', temas: id === 'factores_humanos' ? 2 : 0 })).slice(0, 2),
    oral: { hay: true, temas: 2 },
    alumnos: [
      { id: 1, nombre: 'ana', nombreVisible: 'Ana; "la piloto"', materias: {
        factores_humanos: { pronto: false, nota: { pct: 95, fuente: 'examen', aprobado: true }, examen: 'hecho', hechos: 2, temas: 2, completa: true, salto: { tipo: 'convalidada', pct: 92 } },
        sistemas: { pronto: true, nota: null, examen: null, hechos: 0, temas: 0, completa: false, salto: null } },
      oral: { pronto: false, nota: { pct: 40, fuente: 'practica', aprobado: false }, examen: null, hechos: 1, temas: 2, completa: false, salto: null },
      total: { hechos: 3, temas: 4, pct: 75, completas: 1, conClases: 2, general: { pct: 8, aprobados: 1, total: 11, conExamen: true } } },
      { id: 2, nombre: 'x', nombreVisible: '=HIPERVINCULO("x")', materias: {
        factores_humanos: { pronto: false, nota: { pct: 50, fuente: 'examen', aprobado: false }, examen: 'hecho', hechos: 0, temas: 2, completa: false, salto: { tipo: 'quemado', pct: 50 } },
        sistemas: { pronto: true, nota: null, examen: null, hechos: 0, temas: 0, completa: false, salto: null } },
      oral: null,
      total: { hechos: 0, temas: 4, pct: 0, completas: 0, conClases: 2, general: { pct: 4, aprobados: 0, total: 11, conExamen: true } } },
    ],
  };
  const fh = 'M1 Factores humanos y toma de decisiones';
  const sis = `M2 ${nombreMateria('sistemas')}`;
  const esperado = '﻿' + [
    `Alumno;${fh} (nota);${fh} (avance);${sis} (nota);${sis} (avance);Oral (nota);Oral (avance);Total completado;Temas hechos;Materias completas;Nota general`,
    '"Ana; ""la piloto""";95 %;✓ completa · Convalidada (examen 92 %);—;pronto;P 40 %;1 de 2 temas;75 %;3 de 4 temas;1 de 2 materias completas;8 %',
    `"'=HIPERVINCULO(""x"")";50 %;0 de 2 temas · Se quemó (50 %);—;pronto;—;pronto;0 %;0 de 4 temas;0 de 2 materias completas;4 %`,
  ].join('\r\n') + '\r\n';
  assert.equal(csvResumen(d, t, nombreMateria), esperado);
  assert.equal(celdaCsv('-3'), "'-3");
  assert.equal(celdaCsv('@a'), "'@a");
  assert.equal(celdaCsv('+1'), "'+1");
  assert.equal(celdaCsv(null), '');

  assert.equal(textoCopiar(d, t, nombreMateria), [
    'Notas por materia (se aprueba con 80 %)',
    `*Ana; "la piloto"*: 75 % completado · nota general 8 %\n${fh}: 95 % · ✓ completa · Convalidada (examen 92 %)\nOral: P 40 % · 1 de 2 temas`,
    `*=HIPERVINCULO("x")*: 0 % completado · nota general 4 %\n${fh}: 50 % · 0 de 2 temas · Se quemó (50 %)\nOral: — · pronto`,
    'Todavía sin clases: M2',
  ].join('\n\n'));
});

test('pocas consultas: las mismas con 2 alumnos que con 8 (nada de una por alumno ni por tema)', () => {
  const { db, alumno } = base();
  const contar = () => {
    let n = 0;
    const original = db.prepare;
    db.prepare = function (...args) { n += 1; return original.apply(this, args); };
    try { resumenPorMateria(db, PAQUETE, AHORA); } finally { db.prepare = original; }
    return n;
  };
  const llenar = id => { temaAprobado(db, id, 't1'); salto(db, id, intento(db, id, { tipo: 'examen', respuestas: [['t1', 1], ['t2', 0]], terminado: '2026-11-19T12:00:00.000Z', aprobado: 0 })); };
  for (const n of ['f1', 'f2']) llenar(alumno(n));
  const con2 = contar();
  for (const n of ['f3', 'f4', 'f5', 'f6', 'f7', 'f8']) llenar(alumno(n));
  assert.equal(contar(), con2);
  assert.ok(con2 <= 25, `consultas: ${con2}`);
  db.close();
});

test('la pantalla: en Alumnos como «Notas por materia», textos en los dos idiomas, sin HTML pegado ni estilos en línea', () => {
  const alumnos = AREAS_ADMIN.find(a => a.id === 'alumnos');
  assert.deepEqual(alumnos.sub.map(x => x.id), ['alumnos', 'como-van', 'notas-materia']);
  assert.equal(areaAdmin('notas-materia').id, 'alumnos');
  assert.equal(areaAdmin('notas').id, 'alumnos', 'las notas por tema siguen marcando Alumnos');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /seccion === 'notas-materia' && esAdmin\) return pantallaNotasMateria\(\)/);
  const js = readFileSync(new URL('../public/admin-resumen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|\.style\.|style:/);
  // La ficha se abre al tocar el nombre.
  assert.match(js, /href: `#alumno\/\$\{a\.id\}`/);
  const claves = new Set([...js.matchAll(/'(nm\.[a-z0-9_.]+)'/g)].map(m => m[1]));
  assert.ok(claves.size > 30);
  for (const k of [...claves, 'admin.sub.notas_materia', 'admin.linea.notas_materia']) { assert.ok(es[k], `es: ${k}`); assert.ok(en[k], `en: ${k}`); }
  const nm = k => k.startsWith('nm.');
  assert.deepEqual(Object.keys(es).filter(nm).sort(), Object.keys(en).filter(nm).sort());
  for (const archivo of ['es', 'en']) {
    const texto = readFileSync(new URL(`../public/i18n/${archivo}.json`, import.meta.url), 'utf8');
    const vistas = [...texto.matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
    assert.equal(new Set(vistas).size, vistas.length, `${archivo}: claves repetidas`);
  }
});

// ---------- La ruta: solo el administrador ----------
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}
test('GET /api/admin/academia/notas-materia: 401 sin sesión, 403 para un alumno (sin datos), 200 para el administrador (que no sale en las filas)', async () => {
  const CLAVE = 'una clave bien larga';
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async url => {
    const admin = await pedir(url, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: { 'Tailscale-User-Login': 'junior@example.com' } });
    assert.equal(admin.codigo, 201);
    const ana = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const sesionAna = (await pedir(url, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;
    assert.ok(sesionAna);
    assert.equal((await pedir(url, 'GET', '/api/admin/academia/notas-materia')).codigo, 401);
    const prohibido = await pedir(url, 'GET', '/api/admin/academia/notas-materia', { galleta: sesionAna });
    assert.equal(prohibido.codigo, 403);
    assert.deepEqual(Object.keys(prohibido.datos), ['error'], 'un 403 no lleva datos');
    const r = await pedir(url, 'GET', '/api/admin/academia/notas-materia', { galleta: admin.galleta });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.ahora, iso(AHORA));
    assert.equal(r.datos.umbral, 90, 'sin cambiar: el 90 de siempre');
    assert.equal(r.datos.materias.length, 11, 'sin paquete no falla: las 11, todas «pronto»');
    assert.ok(r.datos.materias.every(m => m.pronto));
    assert.deepEqual(r.datos.alumnos.map(a => a.id), [ana], 'el administrador no sale');
  });
  db.close();
});
