// Academia 0.14.29: la «Práctica en vivo» del examen oral (src/academia/oral-vivo.js, src/api/oral-vivo.js). Siempre contra
// el proveedor FALSO y los paquetes de MUESTRA (todo inventado: test/oral-muestra.js).
//  - Con IA: cada respuesta se califica en la fila (un uso), con la respuesta del libro como referencia en el sistema (con
//    la marca de la caché) y sin nombres; durante la práctica solo viaja «bien / casi / mal» + una línea (+ la repregunta
//    si fue «casi»): ni la respuesta del libro ni el detalle; el veredicto lo lee el servidor de lo guardado.
//  - Sin IA (o si una calificación no llegó): 0.14.42: califica el sistema (las ideas clave del libro); solo si no puede
//    (la pregunta ya no está), se califica él en el repaso final.
//  - El final: nota con bien = 1 y casi = ½ contra la nota de aprobar, tema por tema, la comparación con las veces
//    anteriores, «¿Listo para el examen real?», el mensaje del instructor (IA) y la ficha del administrador.
import './ayuda.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conInstructor, pedir, pedidosIa, cuerpoDe, sistemaDe, datosDe, NOMBRES } from './instructor-ia-base.js';
import { paqueteOralMuestra } from './oral-muestra.js';
import { figuraMuestraPng } from './academia-muestra.js';
import { compararTemas, listoExamenReal, porTema, sugerencia, veredictoDe, VIVO, calificarSistema } from '../src/academia/oral-vivo.js';
import { createHash } from 'node:crypto';
import { revisarVivo, revisarCierre, sistemaCalificar, textoCalificar } from '../src/academia/oral-vivo-ia.js';
import { revisarRespuesta, CLAVE_GUARDADO } from '../src/academia/instructor-ia.js';
import { PROPOSITOS } from '../src/ia/propositos.js';
import { clavePausa } from '../src/ia/tope-alumno.js';
import { readFileSync } from 'node:fs';
import { leerConfigIa } from '../src/ia/config.js';
import { abrirBase } from '../src/nucleo/db.js';
import { configDePrueba } from './ayuda.js';
import { crearVivo } from '../src/academia/oral-vivo.js';
import { guardarAjuste } from '../src/academia/paquetes.js';
import { elegirProveedor, modelosDe } from '../src/ia/presupuesto.js';
import { esquemaEstricto } from '../src/ia/proveedores/openai.js';
import { ESQUEMA_VIVO, ESQUEMA_VIVO_CIERRE } from '../src/academia/oral-vivo-ia.js';
import { crearProveedorFalso } from './proveedor-falso.js';
import { preparar, T0, ponerConfig } from './ia-base.js';
import { ponerChatGpt } from './fabrica-base.js';

const ORAL = paqueteOralMuestra();
const RESPUESTAS_LIBRO = ORAL.materias.flatMap(m => m.temas.flatMap(t => t.libro_qa.map(x => x.respuesta_en)));
const PUNTOS_LIBRO = ORAL.materias.flatMap(m => m.temas.flatMap(t => t.libro_qa.flatMap(x => [x.explicacion_es, ...x.puntos_clave])));
const sinRespuestas = (datos, que) => {
  const s = JSON.stringify(datos);
  for (const r of [...RESPUESTAS_LIBRO, ...PUNTOS_LIBRO]) assert.ok(!s.includes(r), `${que}: la respuesta del libro no viaja antes del final (${r})`);
  for (const k of ['respuesta_en', 'respuesta_es', 'bienDicho', 'falto', 'explicacion_es', 'puntos_clave']) assert.ok(!s.includes(`"${k}"`), `${que}: sin ${k}`);
};
async function subirOral(c) {
  const s = await pedir(c.base, 'POST', '/api/admin/academia/paquetes', { galleta: c.admin, cabeceras: { 'Content-Type': 'application/json' }, cuerpo: JSON.stringify(ORAL) });
  assert.ok(s.datos.paquete?.id, JSON.stringify(s.datos));
  for (const archivo of s.datos.faltan ?? []) await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/figuras/${archivo}`, { galleta: c.admin, cabeceras: { 'Content-Type': 'image/png' }, cuerpo: figuraMuestraPng() });
  assert.equal((await pedir(c.base, 'POST', `/api/admin/academia/paquetes/${s.datos.paquete.id}/activar`, { galleta: c.admin, datos: {} })).codigo, 200);
}
const tareaVivo = (c, uso = 'instructor_oral_vivo') => c.db.prepare(`SELECT id, datos FROM tareas WHERE datos LIKE '%"uso":"${uso}"%' ORDER BY id DESC`).get();
const calificacion = (veredicto, extra = {}) => ({ tipo: 'ok', json: { veredicto, linea: veredicto === 'bien' ? 'Bien, eso es.' : 'Te faltó un detalle.', bien_dicho: 'Dijiste lo principal.', falto: veredicto === 'bien' ? '' : 'El número exacto del libro.', repregunta: '', ...extra } });
const idDe = (c, nombre) => c.db.prepare('SELECT id FROM usuarios WHERE nombre = ?').get(nombre).id;

test('la lógica: comparar con las veces anteriores, ¿listo para el examen real?, por tema, el veredicto y la sugerencia sin IA', () => {
  const hoy = [{ id: 'a/1', pct: 100 }, { id: 'a/2', pct: 50 }, { id: 'a/3', pct: 40 }, { id: 'a/4', pct: 90 }, { id: 'a/5', pct: 100 }];
  const historial = [
    { temas: { 'a/1': { pct: 20 }, 'a/2': { pct: 10 }, 'a/3': { pct: 100 } } },
    { temas: { 'a/1': { pct: 30 }, 'a/4': { pct: 100 } } }, // la más nueva manda para a/1
  ];
  const c = compararTemas(hoy, historial, 70);
  assert.deepEqual(c.map(x => [x.id, x.comparacion, x.antes]), [['a/1', 'mejoro', 30], ['a/2', 'sigue_flojo', 10], ['a/3', 'nuevo_flojo', 100], ['a/4', 'sigue_bien', 100], ['a/5', 'nuevo', null]]);
  const conFlojo = c.map(x => ({ ...x, flojo: x.pct < 70 }));
  assert.deepEqual(listoExamenReal({ aprobado: true, temas: conFlojo }), { listo: false, razon: 'sigue_flojo', temas: ['a/2', 'a/3'] });
  assert.equal(listoExamenReal({ aprobado: true, temas: conFlojo.filter(x => x.id !== 'a/2') }).razon, 'temas_flojos');
  assert.equal(listoExamenReal({ aprobado: false, temas: [] }).razon, 'no_aprobo');
  assert.deepEqual(listoExamenReal({ aprobado: true, temas: conFlojo.filter(x => !x.flojo) }), { listo: true, razon: 'todo_bien', temas: [] });
  const items = [{ m: 'oral_x', t: 'a' }, { m: 'oral_x', t: 'a' }, { m: 'oral_x', t: 'b' }];
  assert.deepEqual(porTema(items, ['bien', 'casi', 'mal'], { 'oral_x/a': 'Tema A' }).map(x => [x.id, x.titulo, x.pct]), [['oral_x/a', 'Tema A', 75], ['oral_x/b', 'b', 0]]);
  // casi + repregunta bien = bien; casi + repregunta mal = casi; lo que se puso él solo cuenta si la IA no calificó.
  assert.equal(veredictoDe({ primera: { veredicto: 'casi' }, seguimiento: { veredicto: 'bien' } }), 'bien');
  assert.equal(veredictoDe({ primera: { veredicto: 'casi' }, seguimiento: { veredicto: 'mal' } }), 'casi');
  assert.equal(veredictoDe({ primera: { texto: 'x' }, auto: 'bien' }), 'bien');
  assert.equal(veredictoDe({ primera: { texto: 'x' } }), null);
  const x = { puntos_clave: ['Puede llevar amigos.', 'No puede cobrar (for hire).'] };
  assert.equal(sugerencia('Puedo llevar a mis amigos pero no cobrar', x).veredicto, 'bien');
  assert.equal(sugerencia('Llevo amigos', x).veredicto, 'casi');
  assert.equal(sugerencia('No sé', x).veredicto, 'mal');
  assert.equal(sugerencia('Three landings in 90 days', { respuesta_en: 'Three sample landings in the last 90 days are needed.' }).veredicto, 'bien');
});

test('la revisión de lo que dice la IA: veredicto válido, repregunta solo con «casi» y una vez, sin enlaces; el cierre solo con los temas dados', () => {
  assert.throws(() => revisarVivo({}, { veredicto: 'excelente', linea: 'x' }), /no_se_pudo_guardar/);
  const r = revisarVivo({ sesion: 's1' }, { veredicto: 'Casi', linea: 'Casi. Ver https://ejemplo.com', bien_dicho: 'a', falto: 'b', repregunta: '¿Y cuántos?' });
  assert.equal(r.veredicto, 'casi');
  assert.ok(!r.linea.includes('http'));
  assert.equal(r.repregunta, '¿Y cuántos?');
  assert.equal(revisarVivo({ seguimiento: true }, { veredicto: 'casi', linea: '', repregunta: '¿Otra?' }).repregunta, '', 'nunca una repregunta de una repregunta');
  assert.equal(revisarVivo({}, { veredicto: 'bien', linea: 'Bien', repregunta: '¿Otra?' }).repregunta, '');
  assert.equal(revisarRespuesta({ uso: 'instructor_oral_vivo' }, { veredicto: 'mal', linea: 'No.' }).veredicto, 'mal');
  const c = revisarCierre({ temas: ['A', 'B'] }, { mensaje: 'Aprobaste, pero te sentí débil en la muestra.', listo_porque: 'Falta un tema.', temas: [{ id: 'A', comentario: 'Refuerza.' }, { id: 'Z', comentario: 'no' }, { id: 'A', comentario: 'otra' }] });
  assert.deepEqual(c.temas, [{ id: 'A', comentario: 'Refuerza.' }]);
  assert.throws(() => revisarCierre({ temas: [] }, { mensaje: '' }), /no_se_pudo_guardar/);
  assert.ok(CLAVE_GUARDADO.test('academia.ia.vivo.12.1763400000000003') && CLAVE_GUARDADO.test('academia.ia.vivocierre.12.1763400000000000'));
  // El pedido más corto de verdad nunca es menos que entradaMinBytes (src/ia/presupuesto.js lo usa para saber si cabe uno).
  const corto = sistemaCalificar({ capitulo: 'oral_x', qa: [{ n: 'a#1', pregunta_en: 'Q?', respuesta_en: 'A.' }] }) + textoCalificar({ n: 'a#1', respuesta: '' });
  assert.ok(Buffer.byteLength(corto) >= PROPOSITOS.instructor_oral_vivo.entradaMinBytes, `${Buffer.byteLength(corto)}`);
  assert.equal(PROPOSITOS.instructor_oral_vivo.modelo, 'claude-haiku-5-5');
  assert.equal(PROPOSITOS.instructor_oral_vivo.cachear, true);
});

test('con IA: una pregunta a la vez sin la respuesta, el veredicto corto (casi → repregunta), «No sé» sin IA, una que no llegó la califica el sistema; el final, el cierre y la comparación', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const portada = await pedir(c.base, 'GET', '/api/academia/oral/vivo', { galleta: c.z });
    assert.equal(portada.codigo, 200, JSON.stringify(portada.datos));
    assert.equal(portada.datos.hay, true);
    assert.equal(portada.datos.ia.modo, 'ia');
    assert.equal(portada.datos.total, 6);
    const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 10 } })).datos;
    assert.equal(s.total, 6, 'pide 10, hay 6');
    sinRespuestas(s, 'la práctica');
    const ordenCap = s.preguntas.map(q => q.materia);
    assert.deepEqual(ordenCap, [...ordenCap].sort((a, b) => ['oral_calificaciones', 'oral_rendimiento', 'oral_escenarios'].indexOf(a) - ['oral_calificaciones', 'oral_rendimiento', 'oral_escenarios'].indexOf(b)), 'en orden de capítulo (la caché)');
    const antesPedidos = pedidosIa(c).length;
    // 0: «casi» → repregunta → «bien».
    const r0 = await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 0, texto: 'Puedo llevar gente, creo' } });
    assert.equal(r0.datos.estado, 'pendiente', JSON.stringify(r0.datos));
    const t0 = tareaVivo(c);
    const d0 = JSON.parse(t0.datos);
    assert.ok(d0.sistema.includes(ORAL.materias.find(m => m.id === s.preguntas[0].materia).temas[0].libro_qa[0].respuesta_en), 'la respuesta del libro va como referencia');
    assert.equal(datosDe(d0.texto).respuesta_del_alumno, 'Puedo llevar gente, creo');
    for (const n of NOMBRES) assert.ok(!t0.datos.toLowerCase().includes(n), 'sin nombres');
    c.falso.siguiente(calificacion('casi', { repregunta: '¿Y puedes cobrarles?' }));
    assert.equal((await c.hacer(t0.id)).resultado.usada, true);
    const p = pedidosIa(c).at(-1);
    const cuerpo = cuerpoDe(p);
    assert.equal(cuerpo.model, 'claude-haiku-5-5');
    assert.ok(Array.isArray(cuerpo.system) && cuerpo.system[0].cache_control, 'el sistema (el libro del capítulo) con la marca de la caché');
    assert.ok(sistemaDe(cuerpo).includes('No seas demasiado estricto'));
    const v0 = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/0`, { galleta: c.z })).datos;
    assert.deepEqual({ ...v0 }, { estado: 'lista', seguimiento: false, veredicto: 'casi', linea: 'Te faltó un detalle.', repregunta: '¿Y puedes cobrarles?' });
    sinRespuestas(v0, 'el veredicto');
    assert.deepEqual((await pedir(c.base, 'GET', `/api/academia/instructor/tareas/${t0.id}`, { galleta: c.z })).datos, { estado: 'lista' }, 'la ruta de siempre no adelanta el detalle');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 0, texto: 'otra vez' } })).codigo, 409, 'una vez');
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.q, datos: { sesion: s.sesion, i: 0, texto: 'x' } })).codigo, 404, 'otro alumno no');
    const r0b = await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 0, texto: 'No, nunca por dinero', seguimiento: true } });
    assert.equal(r0b.datos.estado, 'pendiente');
    const t0b = tareaVivo(c);
    assert.equal(datosDe(JSON.parse(t0b.datos).texto).repregunta, '¿Y puedes cobrarles?');
    c.falso.siguiente(calificacion('bien', { repregunta: '¿Otra?' }));
    await c.hacer(t0b.id);
    const v0b = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/0`, { galleta: c.z })).datos;
    assert.equal(v0b.veredicto, 'bien');
    assert.equal(v0b.repregunta, null, 'nunca una repregunta de la repregunta');
    // 1: «No sé» = mal, sin la IA.
    const n1 = pedidosIa(c).length;
    const r1 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 1, texto: '' } })).datos;
    assert.deepEqual(r1, { estado: 'lista', veredicto: 'mal', linea: null, repregunta: null });
    // 2: la IA responde algo que no sirve → 0.14.42: califica el sistema (sin ninguna idea clave del libro: «mal»).
    await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 2, texto: 'Hmm, no me acuerdo' } });
    c.falso.siguiente({ tipo: 'ok', json: { veredicto: 'excelente', linea: '', bien_dicho: '', falto: '', repregunta: '' } });
    await c.hacer(tareaVivo(c).id);
    const v2 = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/2`, { galleta: c.z })).datos;
    assert.deepEqual([v2.estado, v2.veredicto, v2.sistema, v2.repregunta], ['lista', 'mal', true, null], JSON.stringify(v2));
    sinRespuestas(v2, 'lo que calificó el sistema');
    assert.deepEqual((await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/2`, { galleta: c.z })).datos, v2, 'otra vez, lo mismo');
    // 3, 4: bien; 5: mal.
    for (const [i, v] of [[3, 'bien'], [4, 'bien'], [5, 'mal']]) {
      await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i, texto: 'Mi respuesta con mis palabras' } });
      c.falso.siguiente(calificacion(v));
      await c.hacer(tareaVivo(c).id);
    }
    assert.equal(pedidosIa(c).length - antesPedidos, 6, 'una llamada por respuesta calificada (y ninguna por «No sé»)');
    assert.ok(pedidosIa(c).length > n1);
    // El final: nada que calificarse (la 2 la calificó el sistema); en el repaso, la respuesta del libro.
    const f2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.z, datos: { sesion: s.sesion, auto: { 2: 'bien', 0: 'mal' } } })).datos;
    assert.equal(f2.cerrada, true);
    assert.deepEqual(f2.pendientes, []);
    assert.ok(f2.revision[2].respuesta_en, 'en el repaso final sí: la respuesta del libro');
    assert.deepEqual([f2.revision[2].veredicto, f2.revision[2].sistema, f2.revision[2].ia], ['mal', true, false]);
    assert.equal(f2.revision[0].veredicto, 'bien', 'lo que se pone él nunca cambia lo que calificó la IA');
    assert.equal(f2.revision[2].veredicto, 'mal', '… ni lo que calificó el sistema');
    const r = f2.resumen;
    // bien: 0, 3, 4 = 3; mal: 1, 2, 5 → 3/6 = 50 % < 90 % (la nota de aprobar de la academia).
    assert.deepEqual([r.bien, r.casi, r.mal, r.pct, r.aprobado, r.umbral], [3, 0, 3, 50, false, 90]);
    assert.equal(r.listo, false);
    assert.equal(r.listoRazon, 'no_aprobo');
    assert.ok(r.temas.every(x => x.comparacion === 'nuevo'));
    assert.ok(r.reforzar.length >= 1 && r.reforzar.every(x => x.titulo && x.materia && x.tema));
    assert.equal(r.cierre.estado, 'pendiente');
    // El cierre (IA): solo cifras, títulos y lo que faltó; temas con letras.
    const tc = tareaVivo(c, 'instructor_oral_vivo_cierre');
    const dc = datosDe(JSON.parse(tc.datos).texto);
    assert.equal(dc.nota, 50);
    assert.ok(dc.temas.every(x => /^[A-Z]$/.test(x.id)));
    for (const n of NOMBRES) assert.ok(!tc.datos.toLowerCase().includes(n));
    c.falso.siguiente({ tipo: 'ok', json: { mensaje: 'Todavía no, pero vas bien: te sentí débil en la experiencia reciente.', listo_porque: 'Te falta la nota.', temas: [{ id: dc.temas[0].id, comentario: 'Repasa los números.' }] } });
    await c.hacer(tc.id);
    const cierre = (await pedir(c.base, 'GET', `/api/academia/oral/vivo/${s.sesion}/cierre`, { galleta: c.z })).datos;
    assert.equal(cierre.estado, 'lista');
    assert.match(cierre.mensaje, /débil/);
    assert.equal(cierre.temas[0].id, r.temas[0].id, 'la letra vuelve a ser el tema');
    // Otra vez: la comparación con la vez pasada.
    const s2 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 6 } })).datos;
    // Con la IA para toda la práctica (más llamadas por hora: con las 30 de siempre, una cuenta tiene 10 por hora).
    ponerConfig(c.db, { llamadasPorHora: 90 });
    for (let i = 0; i < s2.total; i++) {
      const x = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s2.sesion, i, texto: 'Lo que dice el libro' } })).datos;
      assert.equal(x.estado, 'pendiente', JSON.stringify(x));
      c.falso.siguiente(calificacion('bien'));
      await c.hacer(tareaVivo(c).id);
    }
    const g0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.z, datos: { sesion: s2.sesion } })).datos;
    assert.equal(g0.cerrada, true);
    const g = g0.resumen;
    // Al cierre van las veces anteriores (solo cifras) y la comparación de cada tema.
    const dc2 = datosDe(JSON.parse(tareaVivo(c, 'instructor_oral_vivo_cierre').datos).texto);
    assert.deepEqual([dc2.veces_antes, dc2.nota_ultima_vez, dc2.listo], [1, 50, true]);
    assert.ok(dc2.temas.some(x => x.comparacion === 'mejoro' && x.nota_antes != null), JSON.stringify(dc2.temas));
    assert.equal(g.aprobado, true);
    assert.equal(g.listo, true, 'aprobó y nada sigue flojo');
    assert.ok(g.temas.some(x => x.comparacion === 'mejoro'), JSON.stringify(g.temas));
    assert.ok(g.temas.every(x => x.comparacion !== 'nuevo'));
    assert.deepEqual(g.antes, { veces: 1, mejor: 50, ultima: 50 });
    // Progreso y la ficha del administrador.
    const prog = (await pedir(c.base, 'GET', '/api/academia/progreso', { galleta: c.z })).datos;
    assert.deepEqual([prog.oralVivo.veces, prog.oralVivo.mejor, prog.oralVivo.listo], [2, 100, true]);
    const ficha = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${idDe(c, 'zoelia')}/ficha`, { galleta: c.admin })).datos;
    assert.ok((ficha.examenesOral ?? []).some(x => x.id === 'vivo' && x.mejor === 100 && x.veces === 2), JSON.stringify(ficha.examenesOral));
    const h = (await pedir(c.base, 'GET', `/api/admin/academia/alumnos/${idDe(c, 'zoelia')}/oral-vivo`, { galleta: c.admin })).datos;
    assert.equal(h.historial.length, 2);
    assert.equal(h.historial[0].pct, 50);
    // Lo de los exámenes orales y «Listo para el oral» no cambia (aparte).
    const oral = (await pedir(c.base, 'GET', '/api/academia/oral', { galleta: c.z })).datos;
    assert.equal(oral.final.veces, 0);
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM academia_extra_respuestas").get().n, 0);
  });
});

test('sin IA (apagada o «IA en pausa» a mitad): igual funciona, nada va al proveedor; califica el sistema con las ideas clave del libro', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    const portada = (await pedir(c.base, 'GET', '/api/academia/oral/vivo', { galleta: c.z })).datos;
    assert.notEqual(portada.ia.modo, 'ia');
    const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3, materia: 'oral_calificaciones' } })).datos;
    assert.equal(s.total, 3);
    assert.ok(s.preguntas.every(q => q.materia === 'oral_calificaciones'));
    // Todo lo del capítulo (las ideas clave de las tres preguntas): «bien» con cualquiera de ellas.
    const todo = 'Puedo llevar amigos pero no cobrar, for hire; cada 24 meses con instructor; 3 aterrizajes en 90 días';
    const vs = [];
    for (let i = 0; i < 2; i++) {
      const r = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i, texto: i === 0 ? todo : 'Hmm, no me acuerdo' } })).datos;
      assert.equal(r.estado, 'lista', JSON.stringify(r));
      assert.equal(r.sistema, true, '0.14.42: sin IA califica el sistema');
      assert.equal(r.repregunta, null);
      assert.ok(r.linea);
      sinRespuestas(r, 'sin IA');
      vs.push(r.veredicto);
    }
    assert.deepEqual(vs, ['bien', 'mal']);
    assert.equal(pedidosIa(c).length, 0);
    const f = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/terminar', { galleta: c.z, datos: { sesion: s.sesion, auto: { 1: 'bien', 2: 'bien' } } })).datos;
    assert.deepEqual(f.pendientes, [], 'nada que calificarse él: lo calificó el sistema');
    assert.equal(f.cerrada, true);
    assert.deepEqual(f.revision.map(x => x.veredicto), ['bien', 'mal', null], 'lo que se pone él no cambia lo del sistema; la que no respondió no se califica sola');
    assert.ok(f.revision.every(x => x.respuesta_en), 'al final: la respuesta del libro');
    // Ya cerrada: no se puede responder la que faltaba (cuenta «mal»).
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 2, texto: 'la del libro' } })).codigo, 409);
    const g = f;
    assert.equal(g.resumen.pct, 33, 'bien 1 de 3');
    assert.equal(g.resumen.aprobado, false, '33 % < 90 %');
    assert.equal(g.resumen.cierre, null, 'sin IA, sin mensaje de la IA (el de la app sí)');
    assert.equal(pedidosIa(c).length, 0);
  }, { encender: false });
  // «IA en pausa» a mitad de la práctica: la siguiente respuesta ya no va a la IA.
  await conInstructor(async c => {
    await subirOral(c);
    const s = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 0, texto: 'algo' } })).datos.estado, 'pendiente');
    // Las llamadas por hora de su cuenta, llenas (el tope de siempre): la siguiente ya no va a la IA.
    ponerConfig(c.db, { llamadasPorHora: 3 });
    c.falso.siguiente(calificacion('bien'));
    await c.hacer(tareaVivo(c).id);
    const r1 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 1, texto: 'otra cosa' } })).datos;
    assert.deepEqual([r1.estado, r1.sistema], ['lista', true], JSON.stringify(r1));
    sinRespuestas(r1, 'tope');
    // «IA en pausa» para él: tampoco.
    ponerConfig(c.db, { llamadasPorHora: 90 });
    c.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(clavePausa(idDe(c, 'zoelia')), JSON.stringify({ pausada: true }), new Date().toISOString());
    const r = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/responder', { galleta: c.z, datos: { sesion: s.sesion, i: 2, texto: 'otra cosa' } })).datos;
    assert.deepEqual([r.estado, r.sistema], ['lista', true], JSON.stringify(r));
    sinRespuestas(r, 'en pausa');
    assert.equal(c.db.prepare("SELECT COUNT(*) AS n FROM tareas WHERE datos LIKE '%instructor_oral_vivo%'").get().n, 1);
    // Empezar otra no borra la que dejó a medias.
    await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } });
    const v = JSON.parse(c.db.prepare('SELECT valor FROM ajustes WHERE clave = ?').get(`academia.oral.vivo.${idDe(c, 'zoelia')}`).valor);
    assert.equal(v.sinTerminar.length, 1);
    assert.equal(v.sinTerminar[0].id, s.sesion);
  });
});

test('los textos de la práctica en vivo existen en los dos idiomas, sin claves repetidas; la pantalla carga, sin innerHTML ni estilos escritos', async () => {
  const m = await import('../public/oral-vivo-vista.js');
  assert.equal(typeof m.portadaVivo, 'function');
  assert.equal(m.puedeDictar(), false, 'sin navegador: sin dictado (se escribe)');
  const leerJson = n => readFileSync(new URL(`../public/i18n/${n}.json`, import.meta.url), 'utf8');
  for (const n of ['es', 'en']) {
    const claves = [...leerJson(n).matchAll(/^\s*"([^"]+)":/gm)].map(m => m[1]);
    assert.equal(new Set(claves).size, claves.length, `${n}: sin claves repetidas`);
  }
  const es = JSON.parse(leerJson('es'));
  const en = JSON.parse(leerJson('en'));
  const vista = readFileSync(new URL('../public/oral-vivo-vista.js', import.meta.url), 'utf8');
  const usadas = new Set([...vista.matchAll(/t\('((?:vivo|oral|acad)\.[a-z0-9_.]+)'/g)].map(m => m[1]));
  for (const k of ['comp.nuevo', 'comp.mejoro', 'comp.sigue_flojo', 'comp.nuevo_flojo', 'comp.sigue_bien', 'v.bien', 'v.casi', 'v.mal', 'razon.todo_bien', 'razon.temas_flojos', 'razon.sigue_flojo', 'razon.no_aprobo',
    'estado.escuchando', 'estado.pensando', 'estado.sin_permiso', 'estado.no_oyo']) usadas.add(`vivo.${k}`);
  for (const k of usadas) { assert.ok(es[k], `es: ${k}`); assert.ok(en[k], `en: ${k}`); }
  for (const k of ['cv.oral_vivo', 'ia.proposito.instructor_oral_vivo', 'ia.proposito.instructor_oral_vivo_cierre', 'ia3.tipo.oral_vivo', 'error.ya_cerrada']) { assert.ok(es[k] && en[k], k); }
  assert.ok(!/innerHTML|style=|\.style\./.test(vista));
  // El examinador animado: un SVG hecho aquí (sin archivos de afuera ni innerHTML), liviano, con todos sus estados en el CSS.
  const ex = readFileSync(new URL('../public/oral-examinador.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|style=|\.style\.|https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(ex));
  assert.ok(Buffer.byteLength(ex) < 30_000, 'menos de 30 KB');
  const css = readFileSync(new URL('../public/academia.css', import.meta.url), 'utf8');
  const { ESTADOS_EXAMINADOR } = await import('../public/oral-examinador.js');
  for (const e of ESTADOS_EXAMINADOR.filter(x => x !== 'quieto')) assert.ok(css.includes(`.examinador[data-estado="${e}"]`), `CSS de ${e}`);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\n  \.examinador/);
  assert.ok(VIVO.maximo <= 15, 'una práctica tiene como mucho 15 preguntas (lo que puede costar)');
});

test('elige primero los temas que la última vez salieron flojos (así la comparación sirve), aunque haya muchos temas', () => {
  const db = abrirBase(configDePrueba());
  try {
    const temas = Array.from({ length: 8 }, (_, k) => ({ id: `t${k}`, titulo: `Tema ${k}`, libro_qa: [{ pregunta_en: `Q${k}a?`, respuesta_en: `A${k}a.` }, { pregunta_en: `Q${k}b?`, respuesta_en: `A${k}b.` }] }));
    const paquete = { oral: { hay: true, materias: [{ id: 'oral_calificaciones', temas }] } };
    guardarAjuste(db, 'academia.oral.vivo.7', JSON.stringify({ veces: 1, mejor: 40, historial: [{ pct: 40, temas: { 'oral_calificaciones/t5': { pct: 0 }, 'oral_calificaciones/t2': { pct: 100 } } }] }));
    for (let k = 0; k < 5; k++) {
      let semilla = k + 1;
      const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
      const s = crearVivo(db, 7, paquete, { n: 3 }, { azar });
      const ts = s.preguntas.map(q => q.tema);
      assert.equal(ts.filter(t => t === 't5').length, 2, `el tema flojo, siempre (${ts})`);
      assert.ok(!ts.includes('t2'), 'el que salió bien, al final');
    }
  } finally { db.close(); }
});

test('con ChatGPT (o la API propia): califica con su modelo barato y los esquemas sirven en modo estricto', async () => {
  assert.equal(esquemaEstricto(ESQUEMA_VIVO), true);
  assert.equal(esquemaEstricto(ESQUEMA_VIVO_CIERRE), true);
  const falso = await crearProveedorFalso();
  const base = preparar({ iaBases: { anthropic: falso.base, openai: falso.base } });
  try {
    await ponerChatGpt(base);
    const cfg = leerConfigIa(base.db);
    for (const uso of ['instructor_oral_vivo', 'instructor_oral_vivo_cierre']) {
      const e = elegirProveedor(base.db, base.config, cfg, T0, modelosDe(PROPOSITOS[uso], cfg), PROPOSITOS[uso]);
      assert.equal(e.proveedor, 'openai', uso);
      assert.equal(e.modelo, cfg.proveedores.openai.modelo, `${uso}: el modelo barato`);
    }
  } finally { base.db.close(); await falso.cerrar(); }
});

test('voz natural (solo ChatGPT): se pide una vez por pregunta, se guarda el mp3 y la oyen todos; sin ChatGPT, la del teléfono', async () => {
  await conInstructor(async c => {
    await subirOral(c);
    // Solo Claude: no hay voz natural (Claude no tiene voz).
    const sinChatGpt = (await pedir(c.base, 'GET', '/api/academia/oral/vivo', { galleta: c.z })).datos;
    assert.equal(sinChatGpt.ia.vozNatural, false);
    const s0 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.z, datos: { n: 3 } })).datos;
    assert.deepEqual((await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 0 } })).datos, { estado: 'no' });
    // Con ChatGPT (además de Claude).
    await ponerChatGpt({ db: c.db, config: c.config, admin: c.adminId, secretoId: c.secretoId }, { claudeBloqueada: false });
    assert.equal((await pedir(c.base, 'GET', '/api/academia/oral/vivo', { galleta: c.z })).datos.ia.vozNatural, true);
    const v = (await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 0, idioma: 'en' } })).datos;
    assert.equal(v.estado, 'pendiente');
    assert.equal((await pedir(c.base, 'GET', `/api/academia/oral/vivo/voz/${v.archivo}`, { galleta: c.z })).codigo, 404, 'todavía no');
    const t = c.db.prepare(`SELECT id, datos FROM tareas WHERE datos LIKE '%"uso":"oral_voz"%' ORDER BY id DESC`).get();
    const d = JSON.parse(t.datos);
    assert.equal(d.texto, s0.preguntas[0].pregunta_en, 'solo el texto de la pregunta (nada del alumno)');
    for (const n of NOMBRES) assert.ok(!t.datos.toLowerCase().includes(n));
    const hecha = await c.hacer(t.id);
    assert.equal(hecha.resultado.usada, true, JSON.stringify(hecha.resultado));
    const p = c.falso.peticiones.filter(x => x.ruta === '/v1/audio/speech');
    assert.equal(p.length, 1);
    assert.equal(cuerpoDe(p[0]).model, 'gpt-4o-mini-tts');
    assert.equal(cuerpoDe(p[0]).stream_format, 'sse');
    const gasto = c.db.prepare("SELECT costo_micro, proveedor, modelo FROM ia_llamadas WHERE proposito = 'oral_voz'").get();
    assert.equal(gasto.proveedor, 'openai');
    assert.ok(gasto.costo_micro > 0, 'cuenta en los topes con lo que costó');
    // Lista: el mp3, para él y para otro alumno, sin pedirla otra vez.
    const a = await fetch(`${c.base}/api/academia/oral/vivo/voz/${v.archivo}`, { headers: { 'X-Oportia': '1', Cookie: c.z } });
    assert.equal(a.status, 200);
    assert.equal(a.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Buffer.from(await a.arrayBuffer()).subarray(0, 3).toString(), 'ID3');
    const s1 = (await pedir(c.base, 'POST', '/api/academia/oral/vivo', { galleta: c.q, datos: { n: 6 } })).datos;
    const j = s1.preguntas.findIndex(q => q.pregunta_en === s0.preguntas[0].pregunta_en);
    assert.deepEqual((await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.q, datos: { sesion: s1.sesion, i: j, idioma: 'en' } })).datos, { estado: 'lista', archivo: v.archivo });
    assert.equal(c.falso.peticiones.filter(x => x.ruta === '/v1/audio/speech').length, 1, 'cada pregunta se paga una vez');
    assert.equal((await pedir(c.base, 'GET', '/api/academia/oral/vivo/voz/..%2F..%2Fx.mp3', { galleta: c.z })).codigo, 404);
    // «IA en pausa» para él: la del teléfono.
    c.db.prepare('INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?)').run(clavePausa(idDe(c, 'zoelia')), JSON.stringify({ pausada: true }), new Date().toISOString());
    assert.equal((await pedir(c.base, 'POST', '/api/academia/oral/vivo/voz', { galleta: c.z, datos: { sesion: s0.sesion, i: 1 } })).datos.estado, 'no');
  });
});

test('0.14.42: sin IA califica el sistema con las ideas clave del libro (bien / casi / mal); sin la pregunta, null', () => {
  const huella = t => createHash('sha256').update(String(t)).digest('hex').slice(0, 16);
  const x = { pregunta_en: 'What may a pilot carry?', respuesta_en: 'Friends, never for hire.', puntos_clave: ['Puede llevar amigos.', 'No puede cobrar (for hire).'] };
  const paquete = { oral: { hay: true, materias: [{ id: 'oral_calificaciones', temas: [{ id: 't1', titulo: 'T', libro_qa: [x] }] }] } };
  const it = { m: 'oral_calificaciones', t: 't1', i: 0, h: huella(x.pregunta_en) };
  const bien = calificarSistema(paquete, it, 'Puedo llevar a mis amigos pero no cobrar');
  assert.deepEqual([bien.veredicto, bien.sistema, bien.repregunta], ['bien', true, '']);
  assert.ok(bien.linea && bien.linea.length <= 140 && !bien.linea.includes(x.respuesta_en));
  const casi = calificarSistema(paquete, it, 'Llevo amigos');
  assert.equal(casi.veredicto, 'casi');
  assert.match(casi.linea, /faltó/);
  assert.equal(calificarSistema(paquete, it, 'No sé').veredicto, 'mal');
  assert.equal(calificarSistema(paquete, { ...it, h: 'otra' }, 'algo'), null, 'la pregunta cambió');
  assert.equal(calificarSistema(paquete, { ...it, t: 'no_esta' }, 'algo'), null);
  assert.equal(calificarSistema(null, it, 'algo'), null);
});
