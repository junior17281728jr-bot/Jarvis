// Academia 0.14.85: «⚑ Reportar un error» en todo (public/reportar-vista.js, src/academia/reporte-item.js,
// src/cuentas/soporte.js): el contexto que se agrega solo, nada de la respuesta antes de responder ni durante un examen
// con reloj, los topes y los repetidos, los reportes juntos por punto con alumnos distintos, «¿Tiene razón?», la IA
// (escondida sin IA y sin datos personales), «Para Claude» con los errores confirmados primero, «Dónde más cuesta» y
// «Para hoy». Todo con el paquete de MUESTRA, alumnos inventados y el proveedor de IA FALSO.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, unaMala, mala, DE, pedidosIa, cuerpoDe, sistemaDe, NOMBRES } from './instructor-ia-base.js';
import { permitirIa } from './ia-base.js';
import { crearUsuario } from '../src/cuentas/usuarios.js';
import { paqueteActivo } from '../src/academia/paquetes.js';
import { crearReporte, ponerVeredicto, gruposReportes, puntosNuevos, verReporteAdmin, REPORTES_POR_HORA } from '../src/cuentas/soporte.js';
import { resolverReporte, respuestaDe, senalesReportes, paraClaudeReportes, problemaReporte as problemaServidor, MUESTRA_CONFUSO, TIPOS_REPORTE } from '../src/academia/reporte-item.js';
import { armarRevision } from '../src/academia/reporte-ia.js';
import { calcularCuesta } from '../src/academia/donde-cuesta.js';
import { armarReporte, markdownParaClaude } from '../src/academia/para-claude.js';
import { contextoAuto, anotarError, puntoPregunta, puntoParaMandar, problemaReporte, queInicial, QUE, QUE_CONTENIDO, ERRORES_MAXIMOS } from '../public/reportar-vista.js';
import { paraHoy } from '../public/navegacion.js';

import { readFileSync } from 'node:fs';
const ES = JSON.parse(readFileSync(new URL('../public/i18n/es.json', import.meta.url), 'utf8'));
const EN = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
const MATERIA = 'factores_humanos';
const TEMA = 'muestra-hipoxia';
const AHORA = Date.parse('2026-11-20T12:00:00Z');
const PORQUE = 'El libro dice otra cosa en la página 1, revisen por favor.';
const reportar = (c, galleta, datos) => pedir(c.base, 'POST', '/api/soporte/reporte', { galleta, datos: { porque: PORQUE, contexto: { pantalla: '#tema/x', version: '0.14.85' }, ...datos } });
const usuario = (db, nombre) => ({ id: db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id, rol: 'usuario' });
function alumnos(db, n, prefijo) {
  const admin = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin'").get().id;
  return Array.from({ length: n }, (_, i) => crearUsuario(db, { nombre: `${prefijo}${i}`, claveHash: 'x', creadoPor: admin }));
}

test('el contexto que se agrega solo: pantalla, versión, equipo, claro/oscuro, idioma y los últimos 5 errores (en memoria)', () => {
  const c = contextoAuto({ ruta: '#tema/fh/hipoxia?token=abc&x=1', version: '0.14.85', navegador: 'Mozilla/5.0 (iPhone)', ancho: 390.4, alto: 844, oscuro: true, idioma: 'en', errores: [{ mensaje: 'x' }] });
  assert.deepEqual(c, { pantalla: '#tema/fh/hipoxia', version: '0.14.85', navegador: 'Mozilla/5.0 (iPhone)', tamano: '390x844', idioma: 'en', tema: 'oscuro', errores: [{ mensaje: 'x' }] });
  assert.equal(contextoAuto({}).tema, 'claro');
  assert.equal(contextoAuto({ idioma: 'fr' }).idioma, 'es');
  let lista = [];
  for (let i = 0; i < 8; i++) lista = anotarError(lista, { mensaje: `TypeError: fallo ${i}\n   en una línea`, donde: `https://app/app.js?v=9#x:${i}`, en: '2026-11-20T12:00:00.000Z' });
  assert.equal(lista.length, ERRORES_MAXIMOS);
  assert.deepEqual(lista.map(e => e.mensaje), [3, 4, 5, 6, 7].map(i => `TypeError: fallo ${i} en una línea`));
  assert.equal(lista[0].donde, 'https://app/app.js', 'sin lo que va después de ? o #');
  assert.equal(anotarError(lista, { mensaje: '   ' }).length, ERRORES_MAXIMOS, 'un error vacío no cuenta');
  // Lo que se elige primero y lo que es obligatorio (lo mismo en la app y en el servidor).
  assert.deepEqual(QUE, ['respuesta', 'explicacion', 'traduccion', 'imagen', 'no_carga', 'otro']);
  assert.deepEqual([queInicial('escena'), queInicial('app'), queInicial('pregunta'), queInicial('tarjeta')], ['imagen', 'no_carga', 'respuesta', null]);
  for (const f of [problemaReporte, problemaServidor]) {
    assert.equal(f({ que: 'nada', porque: PORQUE }), 'reporte_que');
    for (const q of QUE_CONTENIDO) assert.equal(f({ que: q, porque: 'corto' }), 'reporte_porque', q);
    assert.equal(f({ que: 'respuesta', porque: 'x'.repeat(1001) }), 'reporte_porque');
    assert.equal(f({ que: 'respuesta', porque: 'x'.repeat(10) }), null);
    assert.equal(f({ que: 'no_carga', porque: '' }), null, 'de la app el porqué es opcional');
  }
});

test('cada tipo de punto se capta bien (y solo ids cortos): tarjeta, oral, IA, escena 3D, situación, figura, video, clip, Biblioteca, voz, app', () => {
  assert.deepEqual(puntoParaMandar({ tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 2, visual: 'escena-3d', texto: 'NO VA' }), { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 2, visual: 'escena-3d' });
  assert.deepEqual(puntoParaMandar({ tipo: 'oral', materia: 'o1', tema: 't01-a', n: 3 }), { tipo: 'oral', materia: 'o1', tema: 't01-a', n: 3 });
  const clave = `academia.ia.tarjeta.${'a'.repeat(32)}`;
  assert.deepEqual(puntoParaMandar({ tipo: 'ia', clave }), { tipo: 'ia', clave });
  assert.deepEqual(puntoParaMandar({ tipo: 'ia', clave: 'academia.ia.consejo.5.x' }), { tipo: 'ia' }, 'nunca algo de un alumno');
  assert.deepEqual(puntoParaMandar({ tipo: 'escena', id: `${MATERIA}/${TEMA}#1`, materia: MATERIA, tema: TEMA, n: 1, visual: 'escena-3d', titulo: '  El  pastel ' }),
    { tipo: 'escena', materia: MATERIA, tema: TEMA, n: 1, id: `${MATERIA}/${TEMA}#1`, visual: 'escena-3d', titulo: 'El pastel' });
  for (const tipo of ['situacion', 'figura', 'video', 'clip', 'biblioteca', 'voz']) assert.equal(puntoParaMandar({ tipo, id: 'faa-phak/p12' }).tipo, tipo);
  assert.deepEqual(puntoParaMandar({ tipo: 'raro' }), { tipo: 'app' });
  assert.deepEqual(puntoParaMandar(null), { tipo: 'app' });
  assert.equal(puntoParaMandar({ tipo: 'figura', id: '<script>' }).id, undefined);
  // Todos los tipos de la app los acepta el servidor.
  for (const t of ['tarjeta', 'otra', 'oral', 'ia', 'pregunta', 'escena', 'situacion', 'figura', 'video', 'clip', 'biblioteca', 'voz', 'app']) assert.ok(TIPOS_REPORTE.includes(t), t);
});

test('una pregunta: nada de la respuesta antes de responderla ni en un examen con reloj; después, sus opciones y lo que eligió', () => {
  const q = { id: 'muestra-h1', opciones: [{ letra: 'A', texto: 'Agua.' }, { letra: 'B', texto: 'Oxígeno.' }] };
  assert.equal(puntoPregunta(q, { respondida: false }), null, 'sin responder: no hay enlace');
  assert.equal(puntoPregunta(q, { respondida: true, enExamen: true, elegida: 'A' }), null, 'durante el examen con reloj: no hay enlace');
  assert.deepEqual(puntoPregunta(q, { respondida: true, elegida: 'A', intento: 7 }), { tipo: 'pregunta', pregunta: 'muestra-h1', intento: 7, opciones: [{ letra: 'A', texto: 'Agua.' }, { letra: 'B', texto: 'Oxígeno.' }], elegida: 'A' });
});

test('el servidor: lo que vio el alumno sale del paquete (con sus fuentes); la letra elegida, de SUS respuestas; nunca durante el examen', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const p = paqueteActivo(db, c.config);
    const z = usuario(db, 'zoelia');
    // La tarjeta 1 del tema: su texto tal cual, su huella, sus fuentes y la versión del paquete.
    const tj = resolverReporte(db, p, z, { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 1, texto: 'inventado' });
    assert.equal(tj.vista.titulo, '¿Qué es?');
    assert.match(tj.vista.texto, /la hipoxia es cuando al cuerpo le falta oxígeno/);
    assert.ok(!JSON.stringify(tj).includes('inventado'));
    assert.deepEqual(tj.fuentes[0], { libro: 'muestra', capitulo: 'Capítulo de muestra', seccion: 'Muestra', pagina: '1' });
    assert.equal(tj.paquete.id, p.id);
    assert.match(tj.clave, /^tarjeta\.[a-f0-9]{24}\.[a-f0-9]{16}$/);
    assert.throws(() => resolverReporte(db, p, z, { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 99 }), /no_existe/);
    // Una pregunta respondida (mal): todas las opciones, la correcta y la que eligió DE VERDAD (no la que dice la app).
    const x = await unaMala(c, c.z, 'muestra-h1');
    const r = await reportar(c, c.z, { que: 'respuesta', item: { tipo: 'pregunta', pregunta: x.pregunta.id, intento: x.intento.id, elegida: 'Z', opciones: [{ letra: 'Z', texto: 'falsa' }] } });
    assert.equal(r.codigo, 201, JSON.stringify(r.datos));
    // Al alumno le vuelve su mensaje (nada de la correcta ni de las opciones).
    assert.doesNotMatch(JSON.stringify(r.datos), /"correcta"|"opciones"|"explicacion"|"sencilla"/);
    const v = verReporteAdmin(db, r.datos.ticket.id).reporte.item.vista;
    assert.deepEqual([v.elegida, v.correcta, v.respondida, v.opciones.length], [mala('muestra-h1'), DE('muestra-h1').original.correcta, true, 3]);
    assert.match(v.explicacion, /falta de oxígeno/);
    // Sin responderla: el reporte no lleva ninguna letra.
    const sin = resolverReporte(db, p, usuario(db, 'quirino'), { tipo: 'pregunta', pregunta: 'muestra-h2', elegida: 'A' });
    assert.deepEqual([sin.vista.elegida, sin.vista.respondida], [null, false]);
    // Un examen con reloj abierto que tiene esa pregunta: 409 (en la revisión, después de entregar, sí se puede).
    const q = usuario(db, 'quirino');
    const ex = Number(db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, materia, orden, total, empezado_en) VALUES (?, 'examen', ?, ?, 2, ?)").run(q.id, MATERIA, JSON.stringify(['muestra-h2', 'muestra-h3']), new Date(Date.now() - 60_000).toISOString()).lastInsertRowid);
    db.prepare("INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, '2026-11-20')").run(`academia.examen.${ex}`, JSON.stringify({ limiteMs: 900_000, respuestas: { 'muestra-h2': 'A' }, marcadas: [], tiempos: {} }));
    const quirino = c.q;
    const durante = await reportar(c, quirino, { que: 'respuesta', item: { tipo: 'pregunta', pregunta: 'muestra-h2', elegida: 'A' } });
    assert.deepEqual([durante.codigo, durante.datos.error], [409, 'reporte_en_examen']);
    // Lo general de la pantalla (sin la pregunta) sí se puede durante el examen.
    assert.equal((await reportar(c, quirino, { que: 'no_carga', porque: '', item: { tipo: 'app' }, contexto: { pantalla: `#practica/${ex}` } })).codigo, 201);
    db.prepare('UPDATE academia_intentos SET terminado_en = ? WHERE id = ?').run(new Date().toISOString(), ex);
    assert.equal((await reportar(c, quirino, { que: 'respuesta', item: { tipo: 'pregunta', pregunta: 'muestra-h2' } })).codigo, 201, 'entregado: en la revisión sí');
  }, { encender: false });
});

test('un examen con reloj DE VERDAD (por la API): reportar una de sus preguntas da 409 mientras corre y se puede después de entregar; Modo reto y oral', async () => {
  await conInstructor(async c => {
    const { db } = c;
    for (const tema of ['muestra-hipoxia', 'muestra-ilusiones']) {
      const i = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.z, datos: { tipo: 'tema', materia: MATERIA, tema } })).datos;
      for (const q of i.preguntas) await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/responder`, { galleta: c.z, datos: { pregunta: q.id, elegida: DE(q.id).original.correcta } });
      assert.equal((await pedir(c.base, 'POST', `/api/academia/intentos/${i.id}/terminar`, { galleta: c.z, datos: {} })).datos.aprobado, true);
    }
    const ex = (await pedir(c.base, 'POST', '/api/academia/intentos', { galleta: c.z, datos: { tipo: 'examen', materia: MATERIA } })).datos;
    assert.equal(ex.examen.reloj, true);
    const qid = ex.preguntas[0].id;
    const durante = await reportar(c, c.z, { que: 'respuesta', item: { tipo: 'pregunta', pregunta: qid, intento: ex.id } });
    assert.deepEqual([durante.codigo, durante.datos.error], [409, 'reporte_en_examen'], 'aunque ya la respondió antes en la práctica');
    assert.equal((await pedir(c.base, 'POST', `/api/academia/intentos/${ex.id}/terminar`, { galleta: c.z, datos: {} })).codigo, 200);
    assert.equal((await reportar(c, c.z, { que: 'respuesta', item: { tipo: 'pregunta', pregunta: qid, intento: ex.id } })).codigo, 201, 'en la revisión, sí');
    // Modo reto: se respondió con OTRAS opciones: sin letra (y lo dice).
    const q = usuario(db, 'quirino');
    const it = Number(db.prepare("INSERT INTO academia_intentos (usuario_id, tipo, materia, tema, orden, total, empezado_en, modo) VALUES (?, 'tema', ?, ?, '[\"muestra-h1\"]', 1, ?, 'reto')").run(q.id, MATERIA, TEMA, new Date().toISOString()).lastInsertRowid);
    db.prepare("INSERT INTO academia_respuestas (intento_id, usuario_id, pregunta, materia, tema, elegida, correcta, dia, creada_en) VALUES (?, ?, 'muestra-h1', ?, ?, 'C', 0, '2026-11-20', ?)").run(it, q.id, MATERIA, TEMA, new Date().toISOString());
    assert.deepEqual(respuestaDe(db, q.id, 'muestra-h1', Date.now(), { intento: it }).respuesta, { elegida: null, acierto: false, intento: it, reto: true });
    // Una pregunta del oral: la letra sale de academia_extra_respuestas.
    db.prepare("INSERT INTO academia_extra_respuestas (usuario_id, paquete_id, materia, tema, pregunta, nivel, elegida, correcta, dia, creada_en) VALUES (?, NULL, 'oral_calificaciones', 't01-a', 'oral-x1', 'oral_practica', 'B', 0, '2026-11-20', '2026-11-20T10:00:00.000Z')").run(q.id);
    assert.deepEqual(respuestaDe(db, q.id, 'oral-x1').respuesta, { elegida: 'B', acierto: false, intento: null, reto: false });
  }, { encender: false });
});

test('los topes: por hora (con la hora del servidor) y el mismo punto una sola vez por alumno; otro alumno sí puede', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const tarjeta = { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 1 };
    assert.equal((await reportar(c, c.z, { que: 'explicacion', item: tarjeta })).codigo, 201);
    const otra = await reportar(c, c.z, { que: 'respuesta', item: tarjeta });
    assert.deepEqual([otra.codigo, otra.datos.error], [409, 'reporte_repetido'], 'el mismo punto, el mismo alumno');
    assert.equal((await reportar(c, c.q, { que: 'explicacion', item: tarjeta })).codigo, 201, 'otro alumno');
    // De contenido, el porqué es obligatorio (10 letras); de la app, no.
    assert.equal((await reportar(c, c.z, { que: 'explicacion', porque: 'corto', item: { ...tarjeta, n: 2 } })).datos.error, 'reporte_porque');
    assert.equal((await reportar(c, c.z, { que: 'nada', item: { ...tarjeta, n: 2 } })).datos.error, 'reporte_que');
    assert.equal((await pedir(c.base, 'POST', '/api/soporte/reporte', { datos: { que: 'otro' } })).codigo, 401);
    // Hasta REPORTES_POR_HORA en una hora (ya mandó 1).
    for (let i = 2; i <= REPORTES_POR_HORA; i++) assert.equal((await reportar(c, c.z, { que: 'no_carga', porque: '', item: { tipo: 'app' }, contexto: { pantalla: `#p${i}` } })).codigo, 201, `reporte ${i}`);
    const tope = await reportar(c, c.z, { que: 'no_carga', porque: '', item: { tipo: 'app' }, contexto: { pantalla: '#otra' } });
    assert.deepEqual([tope.codigo, tope.datos.error], [429, 'reporte_muchos']);
    // Una hora después, otra vez (la cuenta es por la hora del servidor).
    const z = usuario(db, 'zoelia');
    const p = paqueteActivo(db, c.config);
    const item = resolverReporte(db, p, z, { tipo: 'app' }, { pantalla: '#luego' });
    assert.ok(crearReporte(db, z.id, { que: 'otro', porque: '', item, contexto: { pantalla: '#luego' } }, { ahoraMs: Date.now() + 61 * 60_000 }).id);
    // Lo general de la app: la misma pantalla otra vez solo después de que el administrador la cerró.
    const q = usuario(db, 'quirino');
    const app = resolverReporte(db, p, q, { tipo: 'app' }, { pantalla: '#camino' });
    const a1 = crearReporte(db, q.id, { que: 'no_carga', porque: '', item: app, contexto: { pantalla: '#camino' } });
    assert.throws(() => crearReporte(db, q.id, { que: 'no_carga', porque: '', item: app, contexto: { pantalla: '#camino' } }), /reporte_repetido/);
    ponerVeredicto(db, c.adminId, a1.id, 'dudoso');
    assert.ok(crearReporte(db, q.id, { que: 'no_carga', porque: '', item: app, contexto: { pantalla: '#camino' } }).id);
    // Un aviso para el dueño por PUNTO (no uno por reporte).
    const avisos = db.prepare("SELECT clave FROM avisos WHERE clave LIKE 'reporte_error:%' AND resuelto_en IS NULL").all().map(f => f.clave);
    assert.equal(avisos.length, new Set(gruposReportes(db).filter(g => g.nuevos > 0).map(g => g.clave)).size);
  }, { encender: false });
});

test('juntos por punto: alumnos DISTINTOS (sin el administrador), lo que dijo cada uno; «¿Tiene razón?» con quién y cuándo; el alumno solo ve el veredicto', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const tarjeta = { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 1 };
    const rz = (await reportar(c, c.z, { que: 'explicacion', porque: 'Zoelia dice: no explica por qué baja la presión.', item: tarjeta })).datos.ticket;
    const rq = (await reportar(c, c.q, { que: 'traduccion', porque: 'Quirino dice: la palabra en inglés está mal escrita.', item: tarjeta })).datos.ticket;
    const ra = (await reportar(c, c.admin, { que: 'otro', porque: 'El administrador también lo reporta.', item: tarjeta })).datos.ticket;
    const lista = (await pedir(c.base, 'GET', '/api/admin/reportes', { galleta: c.admin })).datos;
    const g = lista.grupos.find(x => x.tipo === 'tarjeta');
    assert.deepEqual([g.alumnos, g.reportes, g.nuevos, g.titulo, g.ultimo], [2, 3, 3, '¿Qué es?', ra.id], 'el administrador no cuenta como alumno');
    assert.deepEqual(g.porQue, { explicacion: 1, traduccion: 1, otro: 1 });
    assert.equal(lista.nuevosPuntos, 1);
    // El detalle: lo que vio, sus fuentes, y los 3 reportes con quién y qué dijo.
    const d = (await pedir(c.base, 'GET', `/api/admin/reportes/${rz.id}`, { galleta: c.admin })).datos.reporte;
    assert.equal(d.reporte.item.vista.titulo, '¿Qué es?');
    assert.equal(d.reporte.item.fuentes[0].pagina, '1');
    assert.deepEqual(d.grupo.reportes.map(x => [x.usuario, x.que]), [['zoelia', 'explicacion'], ['quirino', 'traduccion'], ['junior', 'otro']]);
    assert.equal(d.grupo.alumnos, 2);
    assert.equal(d.ia.disponible, false, 'sin IA: no hay botón');
    // Lo del administrador: 401 sin sesión, 403 para los alumnos.
    for (const [m, ruta] of [['GET', '/api/admin/reportes'], ['GET', `/api/admin/reportes/${rz.id}`], ['POST', `/api/admin/reportes/${rz.id}/veredicto`], ['POST', `/api/admin/reportes/${rz.id}/ia`]]) {
      assert.equal((await pedir(c.base, m, ruta, { datos: m === 'POST' ? { valor: 'si' } : undefined })).codigo, 401, ruta);
      assert.equal((await pedir(c.base, m, ruta, { galleta: c.z, datos: m === 'POST' ? { valor: 'si' } : undefined })).codigo, 403, ruta);
    }
    // Un alumno nunca ve el reporte ni el nombre de otro.
    assert.equal((await pedir(c.base, 'GET', `/api/soporte/${rq.id}`, { galleta: c.z })).codigo, 404);
    const deZ = JSON.stringify((await pedir(c.base, 'GET', '/api/soporte', { galleta: c.z })).datos);
    assert.ok(!deZ.includes('quirino') && !deZ.includes('Quirino dice'), deZ);
    // «¿Tiene razón?»: valores que no existen → 400; «Sí, es un error» a todos los del punto que no tenían veredicto.
    assert.equal((await pedir(c.base, 'POST', `/api/admin/reportes/${rz.id}/veredicto`, { galleta: c.admin, datos: { valor: 'quizas' } })).codigo, 400);
    const v = (await pedir(c.base, 'POST', `/api/admin/reportes/${rz.id}/veredicto`, { galleta: c.admin, datos: { valor: 'si', todos: true } })).datos.reporte;
    assert.deepEqual([v.reporte.veredicto.valor, v.reporte.veredicto.por, v.reporte.veredicto.porNombre, typeof v.reporte.veredicto.en], ['si', c.adminId, 'junior', 'string']);
    assert.ok(v.grupo.reportes.every(x => x.veredicto?.valor === 'si'));
    assert.equal(v.reporte.estado, 'visto');
    // Después, «Dudoso» solo en uno (los demás quedan como estaban).
    const v2 = (await pedir(c.base, 'POST', `/api/admin/reportes/${rq.id}/veredicto`, { galleta: c.admin, datos: { valor: 'dudoso' } })).datos.reporte;
    assert.deepEqual(v2.grupo.reportes.map(x => x.veredicto.valor), ['si', 'dudoso', 'si']);
    // «No, es cosa del alumno» cierra el reporte.
    const v3 = (await pedir(c.base, 'POST', `/api/admin/reportes/${ra.id}/veredicto`, { galleta: c.admin, datos: { valor: 'no' } })).datos.reporte;
    assert.deepEqual([v3.reporte.estado, v3.estado], ['no_error', 'resuelto']);
    // El alumno ve SOLO el valor del veredicto en su Ayuda (ni quién, ni las notas, ni lo de otros).
    const suyo = (await pedir(c.base, 'GET', `/api/soporte/${rz.id}`, { galleta: c.z })).datos.ticket;
    assert.deepEqual(suyo.reporte, { estado: 'visto', captura: false, veredicto: 'si' });
    // El veredicto en su Ayuda, con palabras para el alumno (en los dos idiomas).
    for (const v of ['si', 'no', 'dudoso']) for (const k of [`reportar.tu_veredicto.${v}`, `reportar.tu_veredicto.${v}.linea`]) assert.ok(ES[k] && EN[k], k);
    assert.doesNotMatch(Object.entries(ES).filter(([k]) => k.startsWith('reportar.tu_veredicto')).map(([, x]) => x).join(' '), /cosa del alumno/);
    assert.ok(!JSON.stringify(suyo).includes('porNombre'));
    // La respuesta al alumno (el mensaje de ayuda de siempre): la ve en su Ayuda.
    assert.equal((await pedir(c.base, 'POST', `/api/admin/soporte/${rz.id}`, { galleta: c.admin, datos: { texto: '¡Tenías razón! Ya lo corregimos.' } })).codigo, 200);
    const hilo = (await pedir(c.base, 'GET', `/api/soporte/${rz.id}`, { galleta: c.z })).datos.ticket.mensajes;
    assert.equal(hilo.at(-1).texto, '¡Tenías razón! Ya lo corregimos.');
    // Ya no hay nuevos: «Para hoy» sin filas de reportes.
    assert.deepEqual(puntosNuevos(db), []);
  }, { encender: false });
});

test('«Pedir opinión a la IA»: escondida sin IA (409); con IA manda SOLO el punto y los porqués (sin nombres ni ids) y vuelve como sugerencia', async () => {
  await conInstructor(async c => {
    const { db } = c;
    permitirIa(db, c.adminId, c.adminId);
    const x = await unaMala(c, c.z, 'muestra-h1');
    const r = (await reportar(c, c.z, { que: 'respuesta', porque: 'Creo que es la C, me escribió zoelia@correo.com y 809-555-1234.', item: { tipo: 'pregunta', pregunta: x.pregunta.id, intento: x.intento.id } })).datos.ticket;
    const d = (await pedir(c.base, 'GET', `/api/admin/reportes/${r.id}`, { galleta: c.admin })).datos.reporte;
    assert.equal(d.ia.disponible, true, JSON.stringify(d.ia));
    assert.equal(d.ia.opinion, null);
    c.falso.siguiente({ tipo: 'ok', json: { veredicto: 'no', razon: 'La B es la correcta: la hipoxia es la falta de oxígeno, como dice la página 1.' } });
    const pedido = await pedir(c.base, 'POST', `/api/admin/reportes/${r.id}/ia`, { galleta: c.admin, datos: {} });
    assert.equal(pedido.codigo, 202, JSON.stringify(pedido.datos));
    const hecha = await c.hacer(pedido.datos.tarea.id);
    assert.equal(hecha.resultado.usada, true, JSON.stringify(hecha.resultado));
    const op = (await pedir(c.base, 'GET', `/api/admin/reportes/${r.id}`, { galleta: c.admin })).datos.reporte.ia.opinion;
    assert.deepEqual([op.estado, op.veredicto], ['lista', 'no']);
    assert.match(op.razon, /falta de oxígeno/);
    // Lo que llegó al proveedor: el punto y el porqué, nunca nombres, usuarios, ids, correos ni teléfonos.
    const ped = pedidosIa(c).at(-1);
    const todo = `${sistemaDe(cuerpoDe(ped))}\n${JSON.stringify(cuerpoDe(ped).messages)}`;
    assert.match(todo, /qué le falta al cuerpo cuando hay hipoxia/);
    assert.match(todo, /Creo que es la C/);
    for (const prohibido of [...NOMBRES, 'junior', '@correo', '809-555', `"usuarioId"`, `"id":${r.usuarioId}`]) assert.ok(!todo.includes(prohibido), `se mandó «${prohibido}»`);
    // Lo mismo, armado a mano: solo el punto y los porqués.
    const a = armarRevision({ tipo: 'tarjeta', vista: { titulo: 'La hélice', texto: 'Empuja aire.' }, fuentes: [{ libro: 'PHAK', pagina: '3' }] }, [{ que: 'explicacion', texto: 'Ana Pérez (ana@x.com) dice que no.' }]);
    assert.ok(!a.texto.includes('ana@x.com'));
    assert.match(a.texto, /PHAK · p\. 3/);
  });
  // Sin IA encendida: el botón no está y la ruta dice que no hay.
  await conInstructor(async c => {
    const x = await unaMala(c, c.z, 'muestra-h1');
    const r = (await reportar(c, c.z, { que: 'respuesta', item: { tipo: 'pregunta', pregunta: x.pregunta.id } })).datos.ticket;
    assert.equal((await pedir(c.base, 'GET', `/api/admin/reportes/${r.id}`, { galleta: c.admin })).datos.reporte.ia.disponible, false);
    const no = await pedir(c.base, 'POST', `/api/admin/reportes/${r.id}/ia`, { galleta: c.admin, datos: {} });
    assert.deepEqual([no.codigo, no.datos.error], [409, 'ia_no_disponible']);
    assert.equal(pedidosIa(c).length, 0, 'nada salió a la IA');
  }, { encender: false });
});

test('aprende: los errores confirmados van PRIMERO en «Para Claude» (ids y porqués, sin nombres) y suben en «Dónde más cuesta»; «cosa del alumno» de muchos = confunde', async () => {
  await conInstructor(async c => {
    const { db } = c;
    const p = paqueteActivo(db, c.config);
    const antes = calcularCuesta(db, p, { ahora: AHORA });
    // Sin reportes revisados, «Dónde más cuesta» es exactamente el de antes.
    const z = usuario(db, 'zoelia');
    const t1 = resolverReporte(db, p, z, { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 1 });
    const r1 = crearReporte(db, z.id, { que: 'explicacion', porque: 'Zoelia escribe: la presión no se explica bien.', item: t1 }, { ahoraMs: AHORA });
    assert.deepEqual(calcularCuesta(db, p, { ahora: AHORA }), antes, 'un reporte sin veredicto no cambia nada');
    ponerVeredicto(db, c.adminId, r1.id, 'si', { ahoraMs: AHORA });
    const despues = calcularCuesta(db, p, { ahora: AHORA });
    const fila = despues.tarjetas.find(x => x.materia === MATERIA && x.tema === TEMA && x.indice === 0);
    assert.ok(fila, 'la tarjeta confirmada entra en la lista');
    assert.deepEqual([fila.partes.error.n, fila.puntaje, fila.seguro], [1, 100, 100]);
    assert.equal(despues.tarjetas[0].indice, 0, 'arriba de todo');
    // «Cosa del alumno» de MUESTRA_CONFUSO alumnos distintos en la tarjeta 2 = «confunde» (con 4, todavía pocos datos).
    const ids = alumnos(db, MUESTRA_CONFUSO, 'conf');
    const t2 = resolverReporte(db, p, { id: ids[0], rol: 'usuario' }, { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 2 });
    const hechos = ids.map((u, i) => crearReporte(db, u, { que: 'explicacion', porque: `No entiendo la tarjeta, alumno ${i}.`, item: t2 }, { ahoraMs: AHORA + i }));
    for (const h of hechos.slice(0, -1)) ponerVeredicto(db, c.adminId, h.id, 'no', { ahoraMs: AHORA });
    assert.equal(paraClaudeReportes(db, p).confusos.length, 0, 'con menos de la muestra mínima no se dice nada');
    let cf = calcularCuesta(db, p, { ahora: AHORA }).tarjetas.find(x => x.indice === 1)?.partes?.confuso;
    assert.equal(cf?.ok ?? false, false);
    ponerVeredicto(db, c.adminId, hechos.at(-1).id, 'no', { ahoraMs: AHORA });
    cf = calcularCuesta(db, p, { ahora: AHORA }).tarjetas.find(x => x.indice === 1).partes.confuso;
    assert.deepEqual([cf.n, cf.ok], [MUESTRA_CONFUSO, true]);
    assert.ok(senalesReportes(db, p).get(`${MATERIA}/${TEMA}`).confuso >= MUESTRA_CONFUSO);
    // «Para Claude»: la sección 0, primero, con el id y el porqué (sin el nombre de nadie).
    const rep = armarReporte(db, p, { ahora: AHORA });
    assert.equal(rep.errores.length, 1);
    assert.deepEqual([rep.errores[0].tipo, rep.errores[0].ref, rep.errores[0].id, rep.errores[0].confirmaron], ['tarjeta', `${MATERIA}/${TEMA}#1`, t1.ref.id, 1]);
    assert.equal(rep.confusos.length, 1);
    const md = markdownParaClaude(rep);
    const secciones = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1]);
    assert.match(secciones[0], /^0\. Errores confirmados/);
    assert.ok(md.indexOf(`id=${t1.ref.id}`) < md.indexOf('## 1.'), 'el error confirmado va antes que todo');
    assert.match(md, /explicacion: «Zoelia escribe: la presión no se explica bien\.»/);
    assert.match(md, /Confunde: 5 alumnos o más/);
    for (const x of ['zoelia', 'conf0', 'junior', 'usuarioId']) assert.ok(!md.includes(x), `sale «${x}»`);
    // Un punto cuyo texto cambió ya no sale (la huella de ahora es otra).
    const cambiado = { ...p, materias: p.materias.map(m => (m.id !== MATERIA ? m : { ...m, temas: m.temas.map(t => (t.id !== TEMA ? t : { ...t, secciones: t.secciones.map((s, i) => (i === 0 ? { ...s, texto: `${s.texto} (corregido)` } : s)) })) })) };
    assert.equal(paraClaudeReportes(db, cambiado).confirmados.length, 0);
    // «No carga» (de la app) confirmado en una tarjeta, o una escena 3D confirmada: un arreglo de la app, no del contenido.
    const q = usuario(db, 'quirino');
    const r3 = crearReporte(db, q.id, { que: 'no_carga', porque: '', item: resolverReporte(db, p, q, { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 3 }) }, { ahoraMs: AHORA });
    const r4 = crearReporte(db, q.id, { que: 'imagen', porque: 'La escena 3D se ve negra en mi teléfono.', item: resolverReporte(db, p, q, { tipo: 'escena', id: 'x/y#1', titulo: 'TITULO_DE_LA_APP' }) }, { ahoraMs: AHORA });
    for (const r of [r3, r4]) ponerVeredicto(db, c.adminId, r.id, 'si', { ahoraMs: AHORA });
    assert.equal(paraClaudeReportes(db, p).confirmados.length, 1, 'solo el error de contenido del paquete');
    assert.ok(!markdownParaClaude(armarReporte(db, p, { ahora: AHORA })).includes('TITULO_DE_LA_APP'));
  }, { encender: false });
});

test('«Para hoy»: una fila por PUNTO (no por reporte), los de más alumnos primero, con su botón; más de 4: «N puntos más»', async () => {
  await conInstructor(async c => {
    const tarjeta = { tipo: 'tarjeta', materia: MATERIA, tema: TEMA, n: 1 };
    await reportar(c, c.z, { que: 'explicacion', item: tarjeta });
    await reportar(c, c.q, { que: 'explicacion', item: tarjeta });
    await reportar(c, c.z, { que: 'no_carga', porque: '', item: { tipo: 'app' }, contexto: { pantalla: '#progreso' } });
    const s = (await pedir(c.base, 'GET', '/api/admin/sistema', { galleta: c.admin })).datos;
    assert.equal(s.soporte.reportes, 2, 'dos puntos (no tres reportes)');
    assert.deepEqual(s.reportesHoy.map(x => [x.tipo, x.alumnos]), [['tarjeta', 2], ['app', 1]]);
    const filas = paraHoy({ sistema: s }).filter(x => x.clave === 'hoy.reporte_punto');
    assert.deepEqual(filas.map(x => [x.n, x.vars.que, x.href.startsWith('#reportes/'), x.ir]), [[2, '¿Qué es?', true, 'hoy.ir.reportes'], [1, '#progreso', true, 'hoy.ir.reportes']]);
    assert.ok(!paraHoy({ sistema: s }).some(x => /^aviso-/.test(x.id) && /^reporte_error:/.test(x.aviso?.clave ?? '')), 'el aviso del reporte no se repite');
  }, { encender: false });
  const muchos = paraHoy({ sistema: { soporte: { reportes: 6 }, reportesHoy: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, tipo: 'app', pantalla: `#p${i}`, alumnos: 1 })) } });
  assert.deepEqual(muchos.map(x => x.id), ['reporte-1', 'reporte-2', 'reporte-3', 'reporte-4', 'reportes-mas']);
  assert.equal(muchos.at(-1).n, 2);
  // Una versión vieja (sin la lista): la fila de siempre.
  assert.deepEqual(paraHoy({ sistema: { soporte: { reportes: 1 } } }).map(x => x.id), ['reportes']);
});
