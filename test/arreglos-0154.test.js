// Academia 0.14.54: los arreglos de las dos auditorías (alumno y administrador) de la 0.14.53. Reloj falso, azar fijo y
// contenido inventado (test/academia-muestra.js, test/oral-muestra.js). Del lado del servidor:
//  - un examen con reloj abierto sale en /camino (examenAbierto) y en Repaso final (con su intento, para volver);
//  - «Ahora en» no salta a una materia cerrada por un examen abierto o no aprobado con «Ir directo»;
//  - el oral dice cuántos errores tiene (sin errores, no hay botón; si se pide igual, 409 sin_preguntas);
//  - «Dinero de la IA» sin tope del mes (US$0) no avisa un «conflicto»;
//  - «Que Claude busque mejoras» dice por qué no puede (409), nunca «Listo» con la IA apagada;
//  - Aprendizaje: «faltan datos» y «sin alumnos» en vez de «todos van bien»;
//  - el administrador no cuenta como alumno en Términos ni en Contratos;
//  - un reporte de problema no cuenta dos veces (solo en Reportes, no en Ayuda);
//  - «Preparado para ti» no habla de «lo que te costó» a un alumno nuevo;
//  - crear un usuario sin decir nada da una contraseña TEMPORAL (la cambia al entrar).
// Y de las pantallas (sin navegador): el botón flotante «Tu instructor», el podio con empates, la Ayuda del alumno,
// el tema automático, Inicio sin bajar solo, los textos nuevos en los dos idiomas.
import { configDePrueba, conServidor } from './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from '../src/app.js';
import { abrirBase } from '../src/nucleo/db.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { hashClave } from '../src/cuentas/claves.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { avanceDe } from '../src/academia/avance-alumno.js';
import { conflictoTopes } from '../src/academia/dinero-ia.js';
import { resumenClaro, MINIMO } from '../src/academia/aprendizaje.js';
import { preparadoBasico } from '../src/academia/preparar-clase.js';
import { paqueteMuestra, figuraMuestraPng } from './academia-muestra.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { rutaConInstructor } from '../public/navegacion.js';
import { puestoEnLista, medallaDe, puestoDe } from '../public/carrera-vista.js';
import { temasAyudaPara, TEMAS_AYUDA } from '../public/guia.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = archivo => readFileSync(join(RAIZ, archivo), 'utf8');
const CLAVE = 'una clave bien larga';
const DUENO = { 'Tailscale-User-Login': 'junior@example.com' };
const T0 = Date.parse('2026-11-17T14:00:00Z');
const MIN = 60_000;

// Tres materias con clases: Factores humanos (2 temas), Sistemas (2) y Aerodinámica (1).
function paqueteTres() {
  const p = paqueteMuestra();
  const base = p.materias[0];
  const copias = [];
  for (const [k, id, cuantos] of [[1, 'sistemas', 2], [2, 'aerodinamica', 1]]) {
    const temas = base.temas.slice(0, cuantos).map(t => ({ ...t, id: `${t.id}-${k}`, titulo: `${t.titulo} ${k}`, preguntas: t.preguntas.map(q => `${q}-${k}`) }));
    for (const t of temas) for (const q of t.preguntas) copias.push({ ...p.preguntas.find(x => x.id === q.replace(/-\d$/, '')), id: q });
    p.materias.push({ id, temas });
  }
  p.preguntas.push(...copias);
  return p;
}

async function pedir(base, metodo, ruta, { datos, galleta, cabeceras = {}, cuerpo } = {}) {
  const o = { method: metodo, headers: { 'X-Oportia': '1', ...cabeceras } };
  if (galleta) o.headers.Cookie = galleta;
  if (datos !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(datos); }
  if (cuerpo !== undefined) o.body = cuerpo;
  const r = await fetch(`${base}${ruta}`, o);
  const c = await r.json().catch(() => ({}));
  const sc = r.headers.get('set-cookie');
  return { codigo: r.status, datos: c, galleta: sc ? sc.split(';')[0] : null };
}
function azarFijo(semilla = 11) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

async function conAcademia(fn) {
  const config = configDePrueba();
  const db = abrirBase(config);
  let ahora = T0;
  const reloj = () => ahora;
  reloj.avanzar = ms => { ahora += ms; };
  const servidor = crearServidor({ db, config, academia: { azar: azarFijo(), reloj } });
  await conServidor(servidor, async base => {
    const admin = (await pedir(base, 'POST', '/api/primer-admin', { datos: { nombre: 'junior', clave: CLAVE }, cabeceras: DUENO })).galleta;
    for (const pq of [paqueteTres(), paqueteOralMuestra()]) {
      const s = await pedir(base, 'POST', '/api/admin/academia/paquetes', { galleta: admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(pq) });
      assert.ok([200, 201].includes(s.codigo), JSON.stringify(s.datos));
      for (const a of s.datos.faltan ?? []) await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${a}`, { galleta: admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
      assert.equal((await pedir(base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: admin, datos: {} })).codigo, 200);
    }
    const ids = {};
    const g = {};
    for (const nombre of ['ana', 'beto']) {
      ids[nombre] = crearUsuario(db, { nombre, claveHash: await hashClave(CLAVE), debeCambiarClave: false });
      g[nombre] = (await pedir(base, 'POST', '/api/entrar', { datos: { nombre, clave: CLAVE } })).galleta;
      assert.equal((await pedir(base, 'POST', '/api/academia/plan', { galleta: g[nombre], datos: { plan: 'un_mes' } })).codigo, 200);
    }
    await fn({ base, db, config, reloj, admin, ids, ...g });
  });
  db.close();
}

test('el examen con reloj abierto sale en Inicio (/camino) y en Repaso final, con su intento; «Ahora en» no salta a la materia cerrada', async () => {
  await conAcademia(async ({ base, db, config, reloj, ids, beto }) => {
    const antes = (await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos;
    assert.equal(antes.examenAbierto, null, 'sin examen abierto: null');
    // «¿Ya lo sabes?» → «Ir directo» al examen de Aerodinámica (cerrada todavía), y sale con la X.
    const ex = await pedir(base, 'POST', '/api/academia/intentos', { galleta: beto, datos: { tipo: 'examen', materia: 'aerodinamica', saltar: true } });
    assert.ok([200, 201].includes(ex.codigo), JSON.stringify(ex.datos));
    reloj.avanzar(2 * MIN);
    const c = (await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos;
    assert.equal(c.examenAbierto.intento, ex.datos.id);
    assert.equal(c.examenAbierto.materia, 'aerodinamica');
    assert.ok(c.examenAbierto.quedanSeg > 0 && c.examenAbierto.quedanSeg < 3 * 3600, String(c.examenAbierto.quedanSeg));
    // Repaso final: el aviso trae el intento para «Volver al examen».
    const rf = (await pedir(base, 'GET', '/api/academia/repaso-final', { galleta: beto })).datos;
    assert.equal(rf.tg.enExamen, true);
    assert.equal(rf.tg.examen.intento, ex.datos.id);
    // «Ahora en» (Progreso y Cómo van) no se va a Aerodinámica (cerrada) por un examen abierto.
    const av = avanceDe(db, paqueteActivo(db, config), [ids.beto]).get(ids.beto);
    assert.notEqual(av.tg.ahora?.id, 'aerodinamica');
    // Ya sin tiempo: no hay examen que mostrar.
    reloj.avanzar(c.examenAbierto.quedanSeg * 1000 + MIN);
    assert.equal((await pedir(base, 'GET', '/api/academia/camino', { galleta: beto })).datos.examenAbierto, null);
  });
});

test('oral: cuántos errores hay (sin errores no hay botón) y «mis errores» sin errores responde 409 sin_preguntas', async () => {
  await conAcademia(async ({ base, ana }) => {
    const o = (await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos;
    assert.equal(o.errores, 0);
    const r = await pedir(base, 'POST', '/api/academia/oral/ronda', { galleta: ana, datos: { errores: true } });
    assert.equal(r.codigo, 409);
    assert.equal(r.datos.error, 'sin_preguntas');
    // Una mal: ahora sí hay 1 error, y la ronda de errores la trae.
    const ronda = (await pedir(base, 'POST', '/api/academia/oral/ronda', { galleta: ana, datos: {} })).datos;
    const q = ronda.preguntas[0];
    const primera = await pedir(base, 'POST', '/api/academia/oral/responder', { galleta: ana, datos: { pregunta: q.id, elegida: q.opciones[0].letra } });
    assert.equal(primera.codigo, 200, JSON.stringify(primera.datos));
    // Cuenta la ÚLTIMA respuesta de cada pregunta: si la primera salió bien, otra mal.
    if (primera.datos.acierto) await pedir(base, 'POST', '/api/academia/oral/responder', { galleta: ana, datos: { pregunta: q.id, elegida: q.opciones.find(o => o.letra !== primera.datos.correcta).letra } });
    assert.equal((await pedir(base, 'GET', '/api/academia/oral', { galleta: ana })).datos.errores, 1);
    assert.equal((await pedir(base, 'POST', '/api/academia/oral/ronda', { galleta: ana, datos: { errores: true } })).codigo, 200);
  });
});

test('«Que Claude busque mejoras» con la IA apagada: 409 con el motivo (nunca «Listo»)', async () => {
  await conAcademia(async ({ base, admin }) => {
    const r = await pedir(base, 'POST', '/api/admin/academia/app/revisar', { galleta: admin, cabeceras: DUENO, datos: {} });
    assert.equal(r.codigo, 409);
    assert.ok(['ia_apagada', 'sin_clave'].includes(r.datos.error), r.datos.error);
    // La pantalla tiene la frase de ese motivo y lo pregunta antes (gasta IA).
    const es = JSON.parse(leer('public/i18n/es.json'));
    assert.ok(es[`todo.listo.${r.datos.error}`]);
    const vista = leer('public/app-mejora-vista.js');
    assert.match(vista, /h\.confirmar\(t\('appm\.revisar\.confirmar'\)/);
  });
});

test('Términos y Contratos: el administrador no cuenta como alumno; un reporte de problema no cuenta dos veces', async () => {
  await conAcademia(async ({ base, admin, ana }) => {
    const term = (await pedir(base, 'GET', '/api/admin/terminos', { galleta: admin })).datos;
    assert.equal(term.cuentas, 2, 'Ana y Beto (sin el administrador)');
    // Un reporte: en Reportes, no en la lista de Ayuda ni en su número de pendientes.
    const c = await pedir(base, 'POST', '/api/soporte/reporte', { galleta: ana, datos: { texto: 'Toqué Entregar y se quedó cargando' } });
    assert.ok([200, 201].includes(c.codigo), JSON.stringify(c.datos));
    const ayuda = (await pedir(base, 'GET', '/api/admin/soporte', { galleta: admin })).datos;
    assert.equal(ayuda.tickets.length, 0);
    assert.equal(ayuda.pendientes, 0);
    assert.equal((await pedir(base, 'GET', '/api/admin/reportes', { galleta: admin })).datos.reportes.length, 1);
    // Su número va en la pestaña «Reportes» (el resumen del sistema lo trae aparte).
    assert.deepEqual((await pedir(base, 'GET', '/api/admin/sistema', { galleta: admin })).datos.soporte, { pendientes: 0, reportes: 1 });
    // Un mensaje de ayuda normal sí cuenta.
    await pedir(base, 'POST', '/api/soporte', { galleta: ana, datos: { categoria: 'app', texto: 'hola, una duda' } });
    const ayuda2 = (await pedir(base, 'GET', '/api/admin/soporte', { galleta: admin })).datos;
    assert.deepEqual([ayuda2.tickets.length, ayuda2.pendientes], [1, 1]);
  });
});

test('crear un usuario sin decir cómo: contraseña TEMPORAL que se cambia al entrar (y la pantalla la trae por defecto)', async () => {
  await conAcademia(async ({ base, db, admin }) => {
    const r = await pedir(base, 'POST', '/api/admin/usuarios', { galleta: admin, datos: { nombre: 'carla.diaz' } });
    assert.equal(r.codigo, 201);
    assert.equal(typeof r.datos.claveTemporal, 'string');
    assert.equal(r.datos.pendiente, false);
    assert.equal(db.prepare('SELECT debe_cambiar_clave AS d FROM usuarios WHERE id = ?').get(r.datos.id).d, 1);
  });
  const app = leer('public/app.js');
  const select = app.slice(app.indexOf("const modoClave = el('select'"), app.indexOf("const claveAdmin = el('div'"));
  assert.match(select, /^[^]*?el\('option', \{ value: 'temporal'[^}]*selected: true/);
  assert.ok(select.indexOf("value: 'temporal'") < select.indexOf("value: 'alumno'"), '«La crea el alumno» sigue, pero no primero');
});

test('«Preparado para ti» no le habla de «lo que te costó» a un alumno nuevo', async () => {
  await conAcademia(async ({ db, config, ids }) => {
    const p = paqueteActivo(db, config);
    const b = preparadoBasico(db, ids.beto, p, 'factores_humanos', 'muestra-hipoxia', T0);
    assert.equal(b.plan[0], 'leer_nuevo');
    const es = JSON.parse(leer('public/i18n/es.json'));
    assert.doesNotMatch(es['para_ti.basico.leer_nuevo'], /cost/);
  });
});

test('«Dinero de la IA»: sin tope del mes (US$0) no hay «conflicto» que avisar', () => {
  const M = 1_000_000;
  assert.equal(conflictoTopes({ profundaMicro: 90 * M, generalMicro: 0 }), null);
  assert.ok(conflictoTopes({ profundaMicro: 90 * M, generalMicro: 70 * M }), 'con un tope de verdad, el aviso sigue');
});

test('Aprendizaje: «faltan datos» o «sin alumnos», nunca «todos van bien» sin saberlo', () => {
  const vacio = { filas: [], clases: [], dificiles: [], titulo: () => '', atrasados: new Set(), ahoraMs: T0, aprendizaje: { primera: { pct: null, n: 0, pocos: true }, despues: { pct: null, n: 0, pocos: true } } };
  const sin = resumenClaro({ ...vacio, cuentas: [] });
  assert.deepEqual([sin.ayuda.alumnos, sin.ayuda.sinDatos, sin.ayuda.total], [0, 0, 0]);
  // Marta: 1 bien y 4 mal (menos de MINIMO respuestas): no sale en la lista, pero cuenta como «faltan datos».
  const filas = [1, 0, 0, 0, 0].map((correcta, i) => ({ id: i + 1, u: 7, pregunta: `q${i}`, materia: 'm', tema: 't', correcta, creada_en: new Date(T0 - 3_600_000).toISOString() }));
  const r = resumenClaro({ ...vacio, filas, cuentas: [{ id: 7, nombre: 'marta' }] });
  assert.ok(filas.length < MINIMO);
  assert.deepEqual([r.ayuda.total, r.ayuda.alumnos, r.ayuda.sinDatos], [0, 1, 1]);
  const vista = leer('public/aprendizaje.js');
  assert.match(vista, /aprendizaje\.i\.ayuda\.sin_alumnos/);
  assert.match(vista, /aprendizaje\.i\.ayuda\.faltan/);
});

test('pantallas: el botón «Tu instructor» solo en las 4 pestañas tal cual (y nunca en la PC)', () => {
  for (const h of ['#inicio', '#oral', '#progreso', '#repaso', '', '#inicio/']) assert.equal(rutaConInstructor(h), true, h);
  for (const h of ['#profesor', '#tutor/examen', '#mi-repaso', '#oral/vivo', '#oral/practica/errores', '#practica/3', '#tema/a/b', '#configuracion', '#admin']) assert.equal(rutaConInstructor(h), false, h);
  assert.match(leer('public/instructor.css'), /@media \(min-width: 760px\) \{ \.boton-instructor \{ display: none; \} \}/);
  const app = leer('public/app.js');
  assert.match(app, /rutaConInstructor\(location\.hash\)/);
  // Inicio ya no baja solo hasta el paso que toca (escondía «Continuar»).
  const inicio = app.slice(app.indexOf('async function pantallaInicio()'), app.indexOf('// ---- Pantallas de estudio'));
  assert.doesNotMatch(inicio, /scrollIntoView/);
  assert.match(inicio, /c\.examenAbierto/);
  assert.match(inicio, /#practica\/\$\{c\.examenAbierto\.intento\}/);
});

test('pantallas: en la carrera los empatados comparten puesto y medalla', () => {
  const pilotos = [{ alias: 'Ana', tg: 0 }, { alias: 'Yo', tg: 0, esYo: true }, { alias: 'Cris', tg: 40 }];
  assert.deepEqual(pilotos.map(p => puestoEnLista(pilotos, p)), [2, 2, 1]);
  assert.equal(puestoDe(pilotos).puesto, puestoEnLista(pilotos, pilotos[1]), 'el «Vas N.º» y el podio dicen lo mismo');
  assert.deepEqual([medallaDe(1), medallaDe(2), medallaDe(2), medallaDe(4)], ['🥇', '🥈', '🥈', '']);
});

test('pantallas: la Ayuda del alumno sin palabras de administrador; el tema sigue al equipo; los textos en los dos idiomas', () => {
  const alumno = temasAyudaPara(false);
  for (const x of ['tailscale', 'telegram', 'token', 'servidor', 'copia', 'clave_api', 'modo_seguro']) assert.ok(!alumno.includes(x), x);
  assert.ok(alumno.includes('racha') && alumno.includes('repaso'));
  assert.deepEqual(temasAyudaPara(true), TEMAS_AYUDA);
  // Sin nada guardado: automático (oscuro si el equipo está en oscuro); lo elegido en Configuración manda.
  const tema = leer('public/tema.js');
  assert.match(tema, /return 'auto';/);
  assert.match(tema, /prefers-color-scheme: dark/);
  assert.match(leer('public/app.js'), /return TEMAS\.includes\(valor\) \? valor : 'auto';/);
  // Ningún confirm() del navegador en lo que gasta o manda a todos: el diálogo de la app.
  assert.match(leer('public/admin-ia.js'), /ia3\.prueba\.confirmar/);
  assert.match(leer('public/admin-ia.js'), /ia3\.regalo\.confirmar/);
  assert.match(leer('public/competencia-vista.js'), /compe\.admin\.mejorar\.confirmar/);
  assert.match(leer('public/contratos-vista.js'), /contratos\.telegram\.confirmar/);
  assert.match(leer('public/app.js'), /acad\.paquete\.usar\.confirmar/);
  const es = JSON.parse(leer('public/i18n/es.json'));
  const en = JSON.parse(leer('public/i18n/en.json'));
  for (const k of ['acad.examen_abierto', 'acad.examen_abierto.volver', 'oral.errores.ninguno', 'oral.errores.boton_n', 'oral.errores.boton_n.uno', 'acad.fallos_unica',
    'dinero.pron.apagada', 'dinero.poner_tope', 'aviso.ver', 'examenes.materia.linea.uno', 'reportar.admin.titulo.uno', 'para_ti.basico.leer_nuevo']) {
    assert.ok(es[k] && en[k], k);
  }
  // Los textos ya no mandan a pestañas que no existen.
  for (const [k, v] of Object.entries(es)) {
    assert.doesNotMatch(v, /Administrador → Claves|Dinero e IA → IA (?!y gastos)/, k);
  }
  assert.doesNotMatch(es['admin.linea.usuarios'], /proyectos/);
  assert.equal(es['admin.pestana.claude_api'], 'Claves e IA');
});
