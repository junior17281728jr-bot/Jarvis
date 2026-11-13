// Pruebas de la Academia 0.14.6: «Notas» (Administrador → Alumnos → Notas): solo las notas de cada alumno.
//  - Solo el administrador: 401 sin sesión, 403 para un alumno (sin datos), 200 para el administrador.
//  - Las cuentas: ni el administrador ni las cuentas eliminadas salen.
//  - Las cuentas: la mejor nota del examen (por materia y por tema, cada intento por separado), sin examen la práctica,
//    sin nada null («sin empezar»); el oral (capítulo, tema y el final); la nota general (notaGeneralDelCurso) y el
//    promedio del grupo (solo de quien tiene nota); el tema más débil.
//  - Los colores: verde ≥ 70, ámbar 50–69, rojo < 50, gris sin nota (igual en el servidor y en la pantalla).
//  - Sin datos (sin alumnos o sin paquete) no falla. Y las consultas no crecen con el número de alumnos.
// Reloj fijo, sin esperas. Los paquetes de aquí son inventados (nada de ningún libro).
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario, marcarEliminada } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { notasDeTodos, tonoNota, promedioDe, temaMasDebil, UMBRALES_NOTA } from '../src/academia/notas.js';
import { MATERIAS, MATERIAS_ORAL } from '../src/academia/formato.js';
import { tonoNota as tonoPantalla, UMBRALES_NOTA as UMBRALES_PANTALLA, rutaNotas, ordenarNotas, MAXIMO_COMPARAR_NOTAS } from '../public/admin-notas.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';

const AHORA = Date.parse('2026-11-13T15:00:00Z');
const MIN = 60 * 1000;
const iso = ms => new Date(ms).toISOString();
const CLAVE = 'una clave bien larga';
const DESDE_TAILSCALE = { 'Tailscale-User-Login': 'junior@example.com' };

// Un paquete inventado: Factores humanos con 2 temas (y las otras 10 sin clases) y el oral con un capítulo de 2 temas.
const PAQUETE = {
  materias: MATERIAS.map(id => (id === 'factores_humanos'
    ? { id, temas: [{ id: 't1', titulo: 'Tema uno (Topic one)', preguntas: ['q1', 'q2'] }, { id: 't2', titulo: 'Tema dos', preguntas: ['q3', 'q4'] }] }
    : { id, temas: [] })),
  oral: {
    hay: true,
    materias: MATERIAS_ORAL.map(id => (id === 'oral_calificaciones'
      ? { id, temas: [{ id: 'a', titulo: 'Capítulo uno, tema a', preguntas: ['o1', 'o2'] }, { id: 'b', titulo: 'Capítulo uno, tema b', preguntas: ['o3'] }] }
      : { id, temas: [] })),
  },
};

function base() {
  const db = abrirBase(configDePrueba());
  const alumno = nombre => crearUsuario(db, { nombre, claveHash: 'x', debeCambiarClave: false });
  return { db, alumno };
}
// Un intento terminado con sus respuestas: respuestas = [[tema, correcta (1/0)], …]. → id del intento
function intento(db, usuario, { tipo, tema = null, respuestas, terminado, aprobado = null, materia = 'factores_humanos' }) {
  const aciertos = respuestas.filter(([, c]) => c).length;
  const id = Number(db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, total, respondidas, aciertos, aprobado, empezado_en, terminado_en, orden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`).run(usuario, tipo, materia, tema, respuestas.length, respuestas.length, aciertos, aprobado, iso(Date.parse(terminado) - 10 * MIN), terminado).lastInsertRowid);
  respuestas.forEach(([t, c], i) => db.prepare(`INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en)
    VALUES (?, ?, ?, ?, ?, 'A', ?, ?, ?)`).run(id, usuario, `q${i}`, materia, t, c, terminado.slice(0, 10), terminado));
  return id;
}
function oral(db, usuario, { tema, nivel, correctas, creada }) {
  correctas.forEach((c, i) => db.prepare(`INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en)
    VALUES (?, NULL, 'oral_calificaciones', ?, ?, ?, 'A', ?, ?, ?)`).run(usuario, tema, `o${i}`, nivel, c, creada.slice(0, 10), creada));
}
const examenesOrales = (db, usuario, examenes) => db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-13')")
  .run(`academia.oral.${usuario}`, JSON.stringify({ leidos: [], examenes }));

test('los colores: verde desde 70, ámbar de 50 a 69, rojo debajo de 50, gris sin nota (igual en el servidor y en la pantalla)', () => {
  assert.deepEqual(UMBRALES_NOTA, { bien: 70, regular: 50 });
  assert.deepEqual(UMBRALES_PANTALLA, UMBRALES_NOTA);
  const casos = [[100, 'bien'], [70, 'bien'], [69, 'regular'], [50, 'regular'], [49, 'mal'], [1, 'mal'], [0, 'mal'], [null, 'nada'], [undefined, 'nada'], ['x', 'nada']];
  for (const [n, tono] of casos) assert.equal(tonoNota(n), tono, String(n));
  for (let n = 0; n <= 100; n++) assert.equal(tonoPantalla(n), tonoNota(n), String(n));
  assert.equal(tonoPantalla(null), 'nada');
  // Un 0 es rojo (no «sin empezar»).
  assert.equal(tonoNota(0), 'mal');
  assert.equal(promedioDe([75, 57, null]), 66);
  assert.equal(promedioDe([null, undefined]), null);
  assert.equal(promedioDe([]), null);
});

test('las notas: el mejor examen (por materia y por tema), sin examen la práctica, sin nada «sin empezar»; el oral y el promedio del grupo', () => {
  const { db, alumno } = base();
  const ana = alumno('ana');
  const beto = alumno('beto');
  const carla = alumno('carla');
  const dani = alumno('dani');
  crearUsuario(db, { nombre: 'jefe', claveHash: 'x', rol: 'admin', debeCambiarClave: false });
  // Ana: dos exámenes. 1.º: t1 2/2, t2 0/2 (50 %). 2.º: t1 2/2, t2 1/2 (75 %). Y una prueba del tema t1 floja (no cuenta: hay examen).
  intento(db, ana, { tipo: 'examen', respuestas: [['t1', 1], ['t1', 1], ['t2', 0], ['t2', 0]], terminado: '2026-11-10T10:00:00.000Z', aprobado: 0 });
  intento(db, ana, { tipo: 'examen', respuestas: [['t1', 1], ['t1', 1], ['t2', 1], ['t2', 0]], terminado: '2026-11-11T10:00:00.000Z', aprobado: 0 });
  intento(db, ana, { tipo: 'tema', tema: 't1', respuestas: [['t1', 1], ['t1', 0], ['t1', 0], ['t1', 0], ['t1', 0]], terminado: '2026-11-09T10:00:00.000Z', aprobado: 0 });
  // Un examen a medias (sin terminar) no cuenta.
  db.prepare(`INSERT INTO academia_intentos (usuario_id, tipo, materia, total, respondidas, aciertos, empezado_en, orden) VALUES (?, 'examen', 'factores_humanos', 4, 4, 4, '2026-11-12T10:00:00.000Z', '[]')`).run(ana);
  // Beto: sin examen. Prueba del tema t1: 3 de 5 (60 %). Práctica de t2 (un repaso): 1 de 2. Su materia: 4 de 7 → 57 %.
  intento(db, beto, { tipo: 'tema', tema: 't1', respuestas: [['t1', 1], ['t1', 1], ['t1', 1], ['t1', 0], ['t1', 0]], terminado: '2026-11-10T10:00:00.000Z', aprobado: 0 });
  intento(db, beto, { tipo: 'repaso', respuestas: [['t2', 1], ['t2', 0]], terminado: '2026-11-11T10:00:00.000Z' });
  // Carla tiene notas pero su cuenta está eliminada: no sale.
  intento(db, carla, { tipo: 'examen', respuestas: [['t1', 1], ['t2', 1]], terminado: '2026-11-10T10:00:00.000Z', aprobado: 1 });
  marcarEliminada(db, carla, { por: null, estabaActiva: true });
  // El oral. Ana: examen del capítulo (mejor 85) y el final (65); el tema «a» en dos exámenes: 1 de 2 y 2 de 2.
  examenesOrales(db, ana, { oral_calificaciones: { aprobado: true, mejor: 85, ultimo: 80, veces: 2 }, final: { aprobado: false, mejor: 65, ultimo: 65, veces: 1 } });
  oral(db, ana, { tema: 'a', nivel: 'oral_examen', correctas: [1, 0], creada: '2026-11-10T11:00:00.000Z' });
  oral(db, ana, { tema: 'a', nivel: 'oral_examen', correctas: [1, 1], creada: '2026-11-11T11:00:00.000Z' });
  oral(db, ana, { tema: 'a', nivel: 'oral_practica', correctas: [0, 0, 0], creada: '2026-11-09T11:00:00.000Z' });
  // Beto: solo práctica del oral, 1 de 3 en el tema «a».
  oral(db, beto, { tema: 'a', nivel: 'oral_practica', correctas: [1, 0, 0], creada: '2026-11-12T11:00:00.000Z' });

  const d = notasDeTodos(db, PAQUETE, AHORA);
  assert.equal(d.ahora, iso(AHORA));
  assert.deepEqual(d.alumnos.map(a => a.nombre), ['ana', 'beto', 'dani'], 'ni el administrador ni la cuenta eliminada');
  assert.deepEqual(d.materias.map(m => m.id), MATERIAS, 'siempre las 11, en el orden de la escuela');
  assert.deepEqual(d.materias.filter(m => !m.pronto).map(m => m.id), ['factores_humanos']);
  assert.deepEqual(d.oral.capitulos.map(c => [c.id, c.numero, c.temas.length]), [['oral_calificaciones', 1, 2]], 'solo los capítulos con temas');
  const [a, b, x] = d.alumnos;

  // Ana: la materia = la mejor nota de examen (75); cada tema, su mejor nota dentro de un examen (t1 100, t2 50).
  assert.deepEqual(a.materias.factores_humanos, { pct: 75, fuente: 'examen', aprobado: false, veces: 2 });
  assert.deepEqual(a.temas['factores_humanos/t1'], { pct: 100, fuente: 'examen' });
  assert.deepEqual(a.temas['factores_humanos/t2'], { pct: 50, fuente: 'examen' });
  assert.equal(a.materias.sistemas, null, 'una materia sin clases: sin nota');
  // Su nota general: la de notaGeneralDelCurso (75 ÷ 11 → 6 %).
  assert.deepEqual(a.general, { pct: 6, aprobados: 0, total: 11, conExamen: true });
  // El oral: el final (65), el capítulo (85), el tema «a» (mejor examen: 100), el tema «b» sin nada.
  assert.deepEqual(a.oral, { pct: 65, fuente: 'examen', aprobado: false, veces: 1 });
  assert.deepEqual(a.capitulos.oral_calificaciones, { pct: 85, fuente: 'examen', aprobado: true, veces: 2 });
  assert.deepEqual(a.temas['oral_calificaciones/a'], { pct: 100, fuente: 'examen' });
  assert.equal(a.temas['oral_calificaciones/b'], null);
  // Su tema más débil: t2 (50 %).
  assert.deepEqual(a.debil, { clave: 'factores_humanos/t2', materia: 'factores_humanos', tema: 't2', pct: 50 });

  // Beto: sin examen → la práctica. t1: su mejor prueba del tema (60); t2: lo que respondió fuera de exámenes (50).
  assert.deepEqual(b.materias.factores_humanos, { pct: 57, fuente: 'practica' });
  assert.deepEqual(b.temas['factores_humanos/t1'], { pct: 60, fuente: 'practica' });
  assert.deepEqual(b.temas['factores_humanos/t2'], { pct: 50, fuente: 'practica' });
  assert.deepEqual(b.general, { pct: 0, aprobados: 0, total: 11, conExamen: false });
  assert.deepEqual(b.oral, { pct: 33, fuente: 'practica' });
  assert.deepEqual(b.capitulos.oral_calificaciones, { pct: 33, fuente: 'practica' });
  assert.deepEqual(b.temas['oral_calificaciones/a'], { pct: 33, fuente: 'practica' });
  assert.deepEqual(b.debil, { clave: 'oral_calificaciones/a', materia: 'oral_calificaciones', tema: 'a', pct: 33 });

  // Dani: nada → todo null (gris «sin empezar»), sin tema débil.
  assert.equal(x.materias.factores_humanos, null);
  assert.equal(x.oral, null);
  assert.equal(x.capitulos.oral_calificaciones, null);
  assert.ok(Object.values(x.temas).every(v => v === null));
  assert.equal(x.debil, null);
  assert.equal(x.general.conExamen, false);

  // El promedio del grupo: solo de quien tiene nota (piso).
  assert.equal(d.promedios.materias.factores_humanos, 66); // (75 + 57) / 2
  assert.equal(d.promedios.materias.sistemas, null);
  assert.equal(d.promedios.temas['factores_humanos/t1'], 80); // (100 + 60) / 2
  assert.equal(d.promedios.temas['factores_humanos/t2'], 50);
  assert.equal(d.promedios.temas['oral_calificaciones/a'], 66); // (100 + 33) / 2
  assert.equal(d.promedios.temas['oral_calificaciones/b'], null);
  assert.equal(d.promedios.oral, 49); // (65 + 33) / 2
  assert.equal(d.promedios.capitulos.oral_calificaciones, 59); // (85 + 33) / 2
  assert.equal(d.promedios.general, 6, 'la nota general: solo de quien ya hizo algún examen');
  // temaMasDebil también sirve sola; un ajuste del oral dañado no rompe nada.
  assert.equal(temaMasDebil(d, x), null);
  db.prepare("UPDATE ajustes SET valor = '{no es json' WHERE clave = ?").run(`academia.oral.${ana}`);
  const otra = notasDeTodos(db, PAQUETE, AHORA).alumnos[0];
  assert.deepEqual(otra.oral, { pct: 0, fuente: 'practica' }, 'sin el final guardado, el oral es su práctica (0 de 3)');
  assert.deepEqual(otra.capitulos.oral_calificaciones, { pct: 0, fuente: 'practica' });
  db.close();
});

test('sin datos: sin alumnos, sin paquete o sin oral, no falla (todo «sin empezar»)', () => {
  const { db, alumno } = base();
  let d = notasDeTodos(db, PAQUETE, AHORA);
  assert.deepEqual(d.alumnos, []);
  assert.equal(d.promedios.general, null);
  assert.ok(Object.values(d.promedios.materias).every(v => v === null));
  assert.equal(d.promedios.oral, null);
  const eva = alumno('eva');
  d = notasDeTodos(db, null, AHORA);
  assert.equal(d.materias.length, 11);
  assert.ok(d.materias.every(m => m.pronto && m.temas.length === 0));
  assert.deepEqual(d.oral, { hay: false, capitulos: [] });
  assert.equal(d.alumnos[0].id, eva);
  assert.ok(Object.values(d.alumnos[0].materias).every(v => v === null));
  assert.equal(d.alumnos[0].oral, null);
  assert.deepEqual(d.alumnos[0].capitulos, {});
  db.close();
});

test('pocas consultas: las mismas con 2 alumnos que con 8 (nada de una por alumno ni por tema)', () => {
  const { db, alumno } = base();
  const contar = () => {
    let n = 0;
    const original = db.prepare;
    db.prepare = function (...args) { n += 1; return original.apply(this, args); };
    try { notasDeTodos(db, PAQUETE, AHORA); } finally { db.prepare = original; }
    return n;
  };
  const llenar = id => {
    intento(db, id, { tipo: 'examen', respuestas: [['t1', 1], ['t2', 0]], terminado: '2026-11-10T10:00:00.000Z', aprobado: 0 });
    oral(db, id, { tema: 'a', nivel: 'oral_practica', correctas: [1], creada: '2026-11-10T11:00:00.000Z' });
    examenesOrales(db, id, { oral_calificaciones: { mejor: 50, veces: 1 } });
  };
  for (const n of ['f1', 'f2']) llenar(alumno(n));
  const con2 = contar();
  for (const n of ['f3', 'f4', 'f5', 'f6', 'f7', 'f8']) llenar(alumno(n));
  const con8 = contar();
  assert.equal(con8, con2);
  assert.ok(con2 <= 10, `consultas: ${con2}`);
  db.close();
});

test('la pantalla: las direcciones de Notas, el orden y el máximo para comparar', () => {
  assert.deepEqual(rutaNotas('notas'), { vista: 'todas' });
  assert.deepEqual(rutaNotas('notas/factores_humanos'), { vista: 'materia', id: 'factores_humanos' });
  assert.deepEqual(rutaNotas('notas/oral'), { vista: 'materia', id: 'oral' });
  assert.deepEqual(rutaNotas('notas/alumno/12'), { vista: 'alumno', id: 12 });
  assert.deepEqual(rutaNotas('notas/comparar/3,5,3'), { vista: 'comparar', ids: [3, 5] });
  assert.equal(rutaNotas('notas/comparar/3'), null, 'comparar pide 2 o más');
  assert.equal(rutaNotas('como-van'), null);
  assert.equal(MAXIMO_COMPARAR_NOTAS, 6);
  const lista = [
    { id: 1, nombre: 'beto', general: { pct: 0, conExamen: false } },
    { id: 2, nombre: 'ana', general: { pct: 40, conExamen: true } },
    { id: 3, nombre: 'Carla', general: { pct: 90, conExamen: true } },
  ];
  assert.deepEqual(ordenarNotas(lista, 'nombre').map(a => a.id), [2, 1, 3]);
  assert.deepEqual(ordenarNotas(lista, 'general').map(a => a.id), [3, 2, 1]);
  // La dirección que reconoce app.js es la misma (alumno y comparar antes que una materia).
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const RUTA_NOTAS = /);
  assert.match(app, /RUTA_NOTAS\.test\(seccion\) && esAdmin\) return pantallaNotas\(seccion\)/);
  // Se llega con un botón desde Alumnos y desde «Cómo van todos».
  const alumnos = readFileSync(new URL('../public/admin-alumnos.js', import.meta.url), 'utf8');
  assert.equal([...alumnos.matchAll(/href: '#notas' \}, h\.icono\('marca', 'icono chico'\), el\('span', \{ texto: t\('notas\.boton'\) \}\)/g)].length, 2);
  const vista = readFileSync(new URL('../public/admin-notas.js', import.meta.url), 'utf8');
  assert.doesNotMatch(vista, /innerHTML|outerHTML|insertAdjacentHTML|setAttribute\(\s*['"]style['"]|\.style\./);
  // Cada texto de la pantalla está en los dos idiomas.
  const es = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  const claves = new Set([...vista.matchAll(/t\('(notas\.[a-z_.]+)'/g)].map(m => m[1]));
  for (const tono of ['bien', 'regular', 'mal', 'nada']) claves.add(`notas.leyenda.${tono}`);
  for (const o of ['nombre', 'general']) claves.add(`notas.orden.${o}`);
  for (const k of claves) { assert.ok(es[k], `es: ${k}`); assert.ok(en[k], `en: ${k}`); }
});

// ---------- La ruta: solo el administrador ----------
async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const opciones = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) opciones.headers.Cookie = galleta;
  if (datos !== undefined) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) opciones.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, opciones);
  const contenido = await r.json().catch(() => ({}));
  const setCookie = r.headers.get('set-cookie');
  return { codigo: r.status, datos: contenido, galleta: setCookie ? setCookie.split(';')[0] : null };
}

test('GET /api/admin/academia/notas: 401 sin sesión, 403 para un alumno (sin datos), 200 para el administrador sin las cuentas eliminadas', async () => {
  const config = configDePrueba();
  const db = abrirBase(config);
  const servidor = crearServidor({ db, config, academia: { reloj: () => AHORA } });
  await conServidor(servidor, async url => {
    const admin = await pedir(url, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DESDE_TAILSCALE });
    assert.equal(admin.codigo, 201);
    const ana = crearUsuario(db, { nombre: 'ana', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    const beto = crearUsuario(db, { nombre: 'beto', claveHash: await hashClave(CLAVE), debeCambiarClave: false });
    marcarEliminada(db, beto, { por: null, estabaActiva: true });
    // Sin paquete: no falla.
    let r = await pedir(url, 'GET', '/api/admin/academia/notas', { galleta: admin.galleta });
    assert.equal(r.codigo, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.materias.length, 11);
    const MUESTRA = paqueteMuestra();
    const s = await pedir(url, 'POST', '/api/admin/academia/paquetes', { galleta: admin.galleta, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(MUESTRA) });
    assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
    for (const archivo of s.datos.faltan) {
      await pedir(url, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: admin.galleta, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
    }
    assert.equal((await pedir(url, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin.galleta, datos: {} })).codigo, 200);
    const sesionAna = (await pedir(url, 'POST', '/api/entrar', { datos: { nombre: 'ana', clave: CLAVE } })).galleta;

    assert.equal((await pedir(url, 'GET', '/api/admin/academia/notas')).codigo, 401);
    const prohibido = await pedir(url, 'GET', '/api/admin/academia/notas', { galleta: sesionAna });
    assert.equal(prohibido.codigo, 403);
    assert.deepEqual(Object.keys(prohibido.datos), ['error'], 'un 403 no lleva datos');
    r = await pedir(url, 'GET', '/api/admin/academia/notas', { galleta: admin.galleta });
    assert.equal(r.codigo, 200);
    assert.equal(r.datos.ahora, iso(AHORA));
    assert.deepEqual(r.datos.alumnos.map(a => a.id), [ana], 'ni el administrador ni la cuenta eliminada');
    assert.deepEqual(r.datos.umbrales, { bien: 70, regular: 50 });
    const fh = r.datos.materias.find(m => m.id === 'factores_humanos');
    assert.ok(fh.temas.length > 0 && !fh.pronto);
    assert.equal(r.datos.alumnos[0].materias.factores_humanos, null, 'sin empezar');
    assert.ok(Object.keys(r.datos.alumnos[0].temas).every(k => k.startsWith('factores_humanos/')));
  });
  db.close();
});
